#!/usr/bin/env node
/* =====================================================================
 * gerar-analitico-sinapi.js — Gera o ANALÍTICO do SINAPI por estado
 * (composição -> insumos com coeficiente, custo e quebra MO/MAT/EQ).
 *
 * Reproduz o schema de data/sinapi-MG-analitico.json:
 *   { mes, uf, tipo:"analitico", count, fonte, dados:[
 *       { codigo, descricao, unidade, grupo, custoUnitario,
 *         custoMO, custoMAT, custoEQ,
 *         insumos:[ { tipo, codigo, descricao, unidade, coeficiente,
 *                     custoUnitario, custoTotal, tipoInsumo, categoria } ] } ] }
 *
 * FONTE DOS DADOS
 * ---------------
 * O ZIP mensal da CAIXA contém "SINAPI_Referência_AAAA_MM.xlsx". Esse XLSX tem
 * a aba "Analítico" (RELATÓRIO ANALÍTICO DE COMPOSIÇÕES): a estrutura
 * composição->insumos com coeficiente, IGUAL para todos os 27 estados (é
 * dado nacional). O que muda por UF são apenas os PREÇOS, que ficam nas abas:
 *   - ISD (Insumos, Sem Desoneração): 1 coluna de preço por UF.
 *   - CSD (Composições, Sem Desoneração): 1 par (Custo, %AS) por UF.
 * Por isso um ÚNICO download (a Referência de um mês) gera os 27 estados.
 *
 * ATRIBUIÇÃO SÃO PAULO (regra oficial da CAIXA — v1.1.120)
 * --------------------------------------------------------
 * Coluna de preço VAZIA no ISD significa "não houve coleta mínima na UF".
 * Nesses casos a CAIXA calcula o custo oficial da composição usando o preço
 * de SP — é a coluna "%AS" da CSD/CSE ("porcentagem do custo total ... obtida
 * utilizando preços de insumos de São Paulo por indisponibilidade dos preços
 * ... no estado em questão"). Ex.: comp 5089 (manutenção de rolo compactador),
 * insumo 14513 sem coleta no DF -> CSD DF = preço SP 592.078,81 x coef
 * 0,0000667 = 39,49. Sem essa regra, 730 composições do DF (famílias CHP/CHI
 * de Depreciação/Juros/Manutenção etc.) saíam 100% zeradas no analítico.
 * Itens com preço atribuído levam a flag precoAtribuidoSP:true e a composição
 * expõe pctAtribuidoSP (fração do custo vinda de SP) — transparência p/ UI.
 *
 * COMO IDENTIFICAR A ABA ANALÍTICA (para regenerar no futuro)
 * ----------------------------------------------------------
 *   - Abrir o SINAPI_Referência_*.xlsx. A aba de nome "Analítico" (NÃO a
 *     "Analítico com Custo", que é um formulário Excel interativo com PROCX/
 *     FILTRO e só ~200 linhas vazias).
 *   - Heurística no código: nome da aba == "Analítico" e a linha de cabeçalho
 *     contém "Grupo", "Código da Composição", "Tipo Item", "Coeficiente".
 *   - Cada composição aparece como uma linha "cabeçalho" (Tipo Item vazio) e
 *     em seguida N linhas de itens (Tipo Item = INSUMO ou COMPOSICAO).
 *
 * CLASSIFICAÇÃO MO/MAT/EQ (categoria) e tipoInsumo
 * ------------------------------------------------
 * A categoria de cada item é ESTÁVEL por código (não depende do pai). Ela é
 * definida por um mapa autoritativo derivado do sinapi-MG-analitico.json
 * validado (data/../tools/_sinapi-src/categoria-map.json) — como a categoria é
 * nacional, o mesmo mapa vale para todas as UFs. Para códigos novos que não
 * estejam no mapa (competências futuras), há um classificador de fallback por
 * classe do ISD + palavras-chave da descrição (máquinas -> EQ; mão de obra
 * com encargos -> MO; senão MAT).
 *
 * USO
 * ---
 *   node gerar-analitico-sinapi.js <UF|ALL> [--ref caminho.xlsx] [--mes 2026-05]
 *     [--out DIR] [--baixar]
 *   - Sem --ref, procura tools/_sinapi-src/Referencia-<mes>.xlsx; com --baixar
 *     baixa o ZIP do mês da CAIXA e extrai a Referência.
 *
 * Node puro (usa a lib xlsx/adm-zip do RA-Gestao-Obras). Não altera o fetcher.
 * ===================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// --- libs (reaproveita as do fetcher em RA-Gestao-Obras) -------------------
const NM = 'C:/Users/USER/RA-Gestao-Obras/node_modules';
let XLSX, AdmZip;
try { XLSX = require(path.join(NM, 'xlsx')); }
catch (e) { try { XLSX = require('xlsx'); } catch (e2) { console.error('xlsx não encontrado'); process.exit(1); } }
try { AdmZip = require(path.join(NM, 'adm-zip')); }
catch (e) { try { AdmZip = require('adm-zip'); } catch (e2) { AdmZip = null; } }

/* ⚠ relativo ao script, nao cravado: o irmao sintetico gravava na arvore
 * principal quando rodado de uma worktree (ver gerar-sintetico-sinapi.js). */
const ORCA = path.join(__dirname, '..');
const SRC_DIR = path.join(ORCA, 'tools', '_sinapi-src');
const DATA_DIR = path.join(ORCA, 'data');
const LOG_PATH = 'C:/Users/USER/AppData/Local/Temp/analitico-full.log';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

// ---------------------------------------------------------------------------
function log(msg) {
    const line = '[' + new Date().toISOString() + '] ' + msg;
    console.log(line);
    try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch (e) {}
}

// Preço formato US da CAIXA: "1,071.33" (vírgula=milhar, ponto=decimal); "-" = 0
function numUS(v) {
    if (v == null) return 0;
    const s = String(v).trim();
    if (!s || s === '-') return 0;
    const f = parseFloat(s.replace(/,/g, ''));
    return isNaN(f) ? 0 : f;
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// --- download (reaproveita a lógica do fetcher) ----------------------------
const downloadBinary = (urlStr, maxRedirects) => new Promise((resolve, reject) => {
    maxRedirects = maxRedirects === undefined ? 5 : maxRedirects;
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get({
        hostname: u.hostname, port: u.port, path: u.pathname + u.search,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Accept': 'application/json;odata=verbose, application/octet-stream, */*',
            'Accept-Language': 'pt-BR,pt;q=0.9', 'Cookie': 'security=true'
        }
    }, (res) => {
        if ([301, 302, 303].includes(res.statusCode) && res.headers.location && maxRedirects > 0)
            return downloadBinary(new URL(res.headers.location, urlStr).href, maxRedirects - 1).then(resolve).catch(reject);
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' em ' + urlStr));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('timeout 5min')));
});

const listarOficialSINAPI = async () => {
    const url = "https://www.caixa.gov.br/_api/web/lists/getbytitle('Downloads')/Items"
        + "?$select=Title,Modified,File_x0020_Type,FileLeafRef,EncodedAbsUrl,Descricao,FileSizeDisplay"
        + "&$filter=Categoria/ID%20eq%20888%20and%20FSObjType%20eq%200%20and%20OData__ModerationStatus%20eq%200"
        + "&$top=200&$orderby=Modified%20desc";
    const buf = await downloadBinary(url);
    const data = JSON.parse(buf.toString('utf8'));
    return (data.d && data.d.results || []).map(it => ({
        nome: it.FileLeafRef, url: (it.EncodedAbsUrl || '').replace(/^http:/, 'https:'),
        tam: parseInt(it.FileSizeDisplay) || 0
    })).filter(it => it.nome && /\.zip$/i.test(it.nome));
};
const mesDoArquivo = (n) => { const m = n.match(/SINAPI[-_](\d{4})[-_](\d{2})/); return m ? m[1] + '-' + m[2] : null; };

// Baixa o ZIP do mês e extrai a Referência para SRC_DIR/Referencia-<mes>.xlsx
async function baixarReferencia(mesAlvo) {
    if (!AdmZip) throw new Error('adm-zip necessário para --baixar');
    log('baixar: listando oficiais da CAIXA...');
    const itens = await listarOficialSINAPI();
    let cand = itens.filter(it => mesDoArquivo(it.nome) === mesAlvo && /xlsx/i.test(it.nome));
    let mesUsado = mesAlvo;
    if (!cand.length) {
        const xs = itens.filter(it => /xlsx/i.test(it.nome) && mesDoArquivo(it.nome))
            .sort((a, b) => mesDoArquivo(b.nome).localeCompare(mesDoArquivo(a.nome)));
        if (xs.length) { cand = [xs[0]]; mesUsado = mesDoArquivo(xs[0].nome); log('mês ' + mesAlvo + ' indisponível; usando ' + mesUsado); }
    }
    if (!cand.length) throw new Error('nenhum XLSX SINAPI disponível');
    const arq = cand[0];
    log('baixando ' + arq.nome + ' (' + Math.round(arq.tam / 1024 / 1024) + 'MB)');
    const zipBuf = await downloadBinary(arq.url);
    const zip = new AdmZip(zipBuf);
    const ref = zip.getEntries().find(e => /refer/i.test(e.entryName) && /\.xlsx$/i.test(e.entryName));
    if (!ref) throw new Error('Referência não encontrada no ZIP');
    if (!fs.existsSync(SRC_DIR)) fs.mkdirSync(SRC_DIR, { recursive: true });
    const outPath = path.join(SRC_DIR, 'Referencia-' + mesUsado + '.xlsx');
    fs.writeFileSync(outPath, ref.getData());
    log('Referência salva: ' + outPath);
    return { path: outPath, mes: mesUsado };
}

// --- classificador de categoria/tipoInsumo ---------------------------------
// Mapa autoritativo (código -> {categoria, tipoInsumo}) derivado do MG validado.
function carregarMapaCategoria() {
    const p = path.join(SRC_DIR, 'categoria-map.json');
    if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {} }
    return {};
}

// Fallback por classe do ISD + palavras-chave (para códigos fora do mapa).
function classificarFallback(tipoItem, isdClasse, descricao) {
    const d = String(descricao || '').toUpperCase();
    if (tipoItem === 'INSUMO') {
        const cl = String(isdClasse || '').toUpperCase();
        if (cl.indexOf('MAO DE OBRA') >= 0) return { categoria: 'MO', tipoInsumo: 'mao_obra' };
        if (cl.indexOf('EQUIPAMENTO') >= 0) return { categoria: 'EQ', tipoInsumo: 'equipamento' };
        // ENCARGOS COMPLEMENTARES, MATERIAL, SERVIÇOS, ESPECIAIS, ou fora do ISD -> MAT
        return { categoria: 'MAT', tipoInsumo: 'material' };
    }
    // COMPOSICAO (sub-item)
    if (/ COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/.test(d))
        return { categoria: 'MO', tipoInsumo: 'mao_obra' };
    // Hora de máquina (CHP/CHI) e produção mecanizada -> EQ. FASE 1.1: ARGAMASSA/
    // CONCRETO/GRAUTE saíram daqui — são quebrados recursivamente nas razões reais
    // (eram classificados 100% EQ, contaminando a pizza MO/MAT/EQ do orçamento).
    if (/CHP DIURNO|CHI DIURNO|\(CHP\)|\(CHI\)|CAMINH[ÃA]O BASCULANTE|ROLO COMPACTADOR|ESCAVADEIRA|RETROESCAVADEIRA|MOTONIVELADORA|TRATOR DE|VIBROACABADORA|USINA DE|USINA MISTURADORA|COMPACTADOR DE SOLOS|MOTOBOMBA/.test(d))
        return { categoria: 'EQ', tipoInsumo: 'equipamento' };
    return { categoria: 'MAT', tipoInsumo: 'subcomposicao' };
}

// --- FASE 1.1: razões MO/MAT/EQ recursivas por sub-composição ---------------
// Uma sub-composição (ARGAMASSA, CONCRETO, TRANSPORTE...) não pertence a UMA
// categoria: ela é quebrada nas razões da PRÓPRIA composição (memoizado, com
// guarda de ciclo). MO pura (PEDREIRO COM ENCARGOS...) fica 100% MO — os
// "encargos complementares" são custo de mão de obra, não material.
function criarQuebrador(comps, isd, csd, mapaCat) {
    const idx = {};
    comps.forEach(c => { idx[c.codigo] = c; });
    const memo = {};
    const RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;

    function razoes(codigo, visitando) {
        if (memo[codigo]) return memo[codigo];
        const c = idx[codigo];
        if (!c || visitando[codigo]) return null; // sem analítico ou ciclo -> caller decide
        visitando[codigo] = 1;
        let mo = 0, mat = 0, eq = 0;
        for (const ins of c.insumos) {
            const unit = ins.tipo === 'INSUMO' ? precoInsumo(isd, ins.codigo).unit : (csd[ins.codigo] || 0);
            const ct = unit * ins.coeficiente;
            const b = bucket(ins, visitando);
            mo += ct * b.mo; mat += ct * b.mat; eq += ct * b.eq;
        }
        delete visitando[codigo];
        const tot = mo + mat + eq;
        if (tot <= 0) return null;
        const r = { mo: mo / tot, mat: mat / tot, eq: eq / tot };
        memo[codigo] = r;
        return r;
    }

    // fração {mo,mat,eq} de um item (insumo puro ou sub-composição quebrada)
    function bucket(ins, visitando) {
        const d = String(ins.descricao || '').toUpperCase();
        if (ins.tipo !== 'INSUMO') {
            if (RE_MO.test(d)) return { mo: 1, mat: 0, eq: 0 };
            const r = razoes(ins.codigo, visitando || {});
            if (r) return r;
        }
        let cls = (ins.tipo === 'INSUMO' && mapaCat[ins.codigo]) ? mapaCat[ins.codigo]
            : classificarFallback(ins.tipo, ((isd[ins.codigo]) || {}).classe, ins.descricao);
        if (cls.categoria === 'MO') return { mo: 1, mat: 0, eq: 0 };
        if (cls.categoria === 'EQ') return { mo: 0, mat: 0, eq: 1 };
        return { mo: 0, mat: 1, eq: 0 };
    }

    return { razoes: razoes, bucket: bucket };
}

// --- leitura das abas ------------------------------------------------------
function acharHeader(rows, ...precisa) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const j = rows[i].map(c => String(c).toLowerCase()).join('|');
        if (precisa.every(p => j.includes(p))) return i;
    }
    return -1;
}

// ISD: código -> { classe, price[UF], priceSP }
function lerISD(wb, uf) {
    const sh = wb.Sheets['ISD'];
    if (!sh) throw new Error('aba ISD ausente');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const hr = acharHeader(rows, 'código', 'descri', 'unidade');
    const hdr = rows[hr].map(x => String(x).trim().toUpperCase());
    let ufCol = hdr.indexOf(uf);
    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no ISD');
    const spCol = hdr.indexOf('SP');
    if (spCol < 0) throw new Error('coluna SP não encontrada no ISD (atribuição São Paulo)');
    const info = {};
    for (let i = hr + 1; i < rows.length; i++) {
        const code = String(rows[i][1] || '').trim();
        if (!code) continue;
        info[code] = {
            classe: String(rows[i][0] || '').trim().toUpperCase(),
            price: numUS(rows[i][ufCol]),
            priceSP: numUS(rows[i][spCol])
        };
    }
    return info;
}

// Preço efetivo de um INSUMO na UF: coleta local; sem coleta -> preço de SP
// (atribuição oficial, ver cabeçalho). Nunca inventa: sem preço nem em SP -> 0.
function precoInsumo(isd, codigo) {
    const it = isd[codigo];
    if (!it) return { unit: 0, atribuidoSP: false };
    if (it.price > 0) return { unit: it.price, atribuidoSP: false };
    if (it.priceSP > 0) return { unit: it.priceSP, atribuidoSP: true };
    return { unit: 0, atribuidoSP: false };
}

// CSD: código (via fórmula MATCH) -> custoUnitario[UF]
function lerCSD(wb, uf) {
    const sh = wb.Sheets['CSD'];
    if (!sh) throw new Error('aba CSD ausente');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const hr = acharHeader(rows, 'código', 'descri', 'custo');
    // linha de UFs (AC, AL, ... TO) — normalmente row 3, mas procura a que contém as siglas
    let ufRowIdx = -1;
    for (let i = 0; i <= hr; i++) {
        const up = rows[i].map(x => String(x).trim().toUpperCase());
        if (up.indexOf('AC') >= 0 && up.indexOf('MG') >= 0) { ufRowIdx = i; break; }
    }
    const ufRow = rows[ufRowIdx].map(x => String(x).trim().toUpperCase());
    const ufCol = ufRow.indexOf(uf);
    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no CSD');
    const cost = {};
    for (let i = hr + 1; i < rows.length; i++) {
        // o código real fica na fórmula HYPERLINK/MATCH da célula B (col 1)
        let code = '';
        const addr = XLSX.utils.encode_cell({ r: i, c: 1 });
        const cell = sh[addr];
        if (cell && cell.f) { const m = cell.f.match(/MATCH\((\d{3,})/); if (m) code = m[1]; }
        if (!code) { const v = String(rows[i][1] || '').trim(); if (v && v !== '0') code = v; }
        if (!code) continue;
        cost[code] = numUS(rows[i][ufCol]);
    }
    return cost;
}

// Analítico: [{ codigo, grupo, descricao, unidade, insumos:[{tipo,codigo,descricao,unidade,coeficiente}] }]
function lerAnalitico(wb) {
    const sh = wb.Sheets['Analítico'];
    if (!sh) throw new Error('aba Analítico ausente (verifique o nome; não confundir com "Analítico com Custo")');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const hr = acharHeader(rows, 'grupo', 'código da', 'tipo item');
    const comps = [];
    let cur = null;
    for (let i = hr + 1; i < rows.length; i++) {
        const grupo = String(rows[i][0] || '').trim();
        const compCode = String(rows[i][1] || '').trim();
        const tipoItem = String(rows[i][2] || '').trim();
        const itemCode = String(rows[i][3] || '').trim();
        const desc = String(rows[i][4] || '').trim();
        const un = String(rows[i][5] || '').trim();
        const coef = numUS(rows[i][6]); // coeficiente "1.2790000" — ponto decimal
        if (!compCode) continue;
        if (!tipoItem) { // cabeçalho de composição
            cur = { codigo: compCode, grupo: grupo, descricao: desc, unidade: un, insumos: [] };
            comps.push(cur);
            continue;
        }
        if (cur && compCode === cur.codigo)
            cur.insumos.push({ tipo: tipoItem, codigo: itemCode, descricao: desc, unidade: un, coeficiente: coef });
    }
    return comps;
}

// --- geração de uma UF -----------------------------------------------------
function gerarUF(wb, uf, mes, mapaCat) {
    const isd = lerISD(wb, uf);
    const csd = lerCSD(wb, uf);
    const comps = lerAnalitico(wb);
    const quebrador = criarQuebrador(comps, isd, csd, mapaCat); // FASE 1.1

    const dados = [];
    for (const c of comps) {
        let custoMO = 0, custoMAT = 0, custoEQ = 0, custoSP = 0;
        const insumos = [];
        for (const ins of c.insumos) {
            // custo unitário do item nesta UF: INSUMO -> preço ISD (com atribuição
            // SP quando a UF não tem coleta); COMPOSICAO -> custo CSD
            let unit = 0, atribuidoSP = false;
            if (ins.tipo === 'INSUMO') { const p = precoInsumo(isd, ins.codigo); unit = p.unit; atribuidoSP = p.atribuidoSP; }
            else unit = csd[ins.codigo] || 0;
            const custoTotal = unit * ins.coeficiente;
            if (atribuidoSP) custoSP += custoTotal;

            // FASE 1.1: agrega pela quebra real (sub-composição rateada em MO/MAT/EQ)
            const b = quebrador.bucket(ins, {});
            custoMO += custoTotal * b.mo;
            custoMAT += custoTotal * b.mat;
            custoEQ += custoTotal * b.eq;

            // categoria de EXIBIÇÃO = predominante; tipoInsumo mantém o vocabulário atual
            const categoria = (b.mo >= b.mat && b.mo >= b.eq) ? 'MO' : (b.eq > b.mat) ? 'EQ' : 'MAT';
            let cls = (ins.tipo === 'INSUMO' && mapaCat[ins.codigo]) ? mapaCat[ins.codigo]
                : classificarFallback(ins.tipo, (isd[ins.codigo] || {}).classe, ins.descricao);
            const tipoInsumo = (categoria === 'MO') ? 'mao_obra' : (categoria === 'EQ' && cls.tipoInsumo === 'equipamento') ? 'equipamento' : cls.tipoInsumo;

            const item = {
                tipo: ins.tipo, codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade,
                coeficiente: ins.coeficiente,
                custoUnitario: round2(unit),
                custoTotal: Math.round((custoTotal + Number.EPSILON) * 10000) / 10000,
                tipoInsumo: tipoInsumo, categoria: categoria
            };
            if (atribuidoSP) item.precoAtribuidoSP = true; // sem coleta na UF; preço oficial de SP
            // rateio exposto só quando a sub-composição é mista (transparência/auditoria)
            if (ins.tipo !== 'INSUMO' && b.mo < 0.999 && b.mat < 0.999 && b.eq < 0.999) {
                item.razoes = { mo: Math.round(b.mo * 10000) / 10000, mat: Math.round(b.mat * 10000) / 10000, eq: Math.round(b.eq * 10000) / 10000 };
            }
            insumos.push(item);
        }
        // custoUnitario da composição = soma das quebras (custoMO+MAT+EQ), ou seja, a
        // soma dos custoTotal dos insumos. Reproduz exatamente o MG validado (10378/10378):
        // NÃO usa o custo oficial da CSD, que pode divergir quando um insumo está sem preço.
        const custoUnitario = custoMO + custoMAT + custoEQ;

        const comp = {
            codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo,
            custoUnitario: round2(custoUnitario),
            custoMO: round2(custoMO), custoMAT: round2(custoMAT), custoEQ: round2(custoEQ),
            insumos: insumos
        };
        // fração do custo obtida com preços de SP (espelha o %AS oficial da CSD)
        if (custoSP > 0 && custoUnitario > 0)
            comp.pctAtribuidoSP = Math.round((custoSP / custoUnitario) * 10000) / 10000;
        dados.push(comp);
    }

    const mesFmt = mes.split('-').reverse().join('/'); // 2026-05 -> 05/2026
    return {
        mes: mesFmt, uf: uf, tipo: 'analitico', count: dados.length,
        fonte: 'SINAPI Analitico ' + mes, dados: dados
    };
}

// --- main ------------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    const alvo = (args[0] || 'MG').toUpperCase();
    const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
    let mes = getArg('--mes') || '2026-05';
    let refPath = getArg('--ref');
    const outDir = getArg('--out') || DATA_DIR;
    const baixar = args.includes('--baixar');

    try { fs.writeFileSync(LOG_PATH, ''); } catch (e) {}
    log('=== gerar-analitico-sinapi | alvo=' + alvo + ' mes=' + mes + ' ===');

    // Referência
    if (!refPath) {
        const cand = path.join(SRC_DIR, 'Referencia-' + mes + '.xlsx');
        if (fs.existsSync(cand)) { refPath = cand; log('usando Referência local: ' + cand); }
        else if (baixar) { const r = await baixarReferencia(mes); refPath = r.path; mes = r.mes; }
        else throw new Error('Referência não encontrada (' + cand + '). Use --baixar ou --ref.');
    }
    log('lendo XLSX (pode levar ~30s): ' + refPath);
    const wb = XLSX.readFile(refPath, { sheets: ['ISD', 'CSD', 'Analítico'] });
    const mapaCat = carregarMapaCategoria();
    log('mapa categoria: ' + Object.keys(mapaCat).length + ' códigos');

    const lista = alvo === 'ALL' ? UFS.slice() : [alvo];
    const oks = [], fails = [];
    for (const uf of lista) {
        try {
            const pacote = gerarUF(wb, uf, mes, mapaCat);
            if (pacote.count === 0) throw new Error('0 composições');
            const outPath = path.join(outDir, 'sinapi-' + uf + '-analitico.json');
            const jsonStr = JSON.stringify(pacote);
            fs.writeFileSync(outPath, jsonStr);
            const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
            // #17: .json.gz ao lado (o app tenta ele primeiro; ~85% menos payload)
            if (args.includes('--gzip')) {
                const gz = require('zlib').gzipSync(jsonStr, { level: 9 });
                fs.writeFileSync(outPath + '.gz', gz);
                log('  gzip: ' + (gz.length / 1024 / 1024).toFixed(1) + ' MB (-' + Math.round(100 - gz.length / jsonStr.length * 100) + '%)');
            }
            oks.push({ uf: uf, count: pacote.count, mb: mb });
            log('OK ' + uf + ': ' + pacote.count + ' composições (' + mb + ' MB) -> ' + outPath);
        } catch (e) {
            fails.push({ uf: uf, motivo: e.message });
            log('FALHA ' + uf + ': ' + e.message);
        }
    }
    log('=== FIM: ' + oks.length + ' ok, ' + fails.length + ' falhas ===');
    log('OK: ' + oks.map(o => o.uf + '(' + o.count + ',' + o.mb + 'MB)').join(' '));
    if (fails.length) log('FALHAS: ' + fails.map(f => f.uf + '(' + f.motivo + ')').join(' '));
}

main().catch(e => { log('ERRO FATAL: ' + (e.stack || e.message)); process.exit(1); });

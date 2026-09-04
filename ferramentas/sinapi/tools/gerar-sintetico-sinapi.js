#!/usr/bin/env node
/* =====================================================================
 * gerar-sintetico-sinapi.js — Gera a BASE SINTÉTICA (busca/orçamento) do
 * SINAPI por estado: composições + insumos com PREÇO da UF, no formato
 * EXATO de data/sinapi-<UF>-2026-05.json (bases já produzidas pelo fetcher).
 *
 * Schema (idêntico ao SP existente):
 *   { mes:"AAAA-MM", uf:"XX", count:N, dados:[
 *       // COMPOSIÇÃO:
 *       { codigo, descricao, unidade, custoUnitario, tipo:"composicao",
 *         fonte:"CSD", desonerado:true }
 *       // INSUMO:
 *       { codigo, descricao, unidade, custoUnitario, tipo:"insumo",
 *         fonte:"ISD", categoria:"<classe ISD crua>", desonerado:true } ] }
 *
 * OBSERVAÇÕES IMPORTANTES (para bater byte-a-byte com as bases atuais):
 *   - fonte = "CSD" (composições) / "ISD" (insumos) — NÃO "SINAPI".
 *   - categoria do insumo = a classe CRUA do ISD (SERVIÇOS, MATERIAL,
 *     MAO DE OBRA, ENCARGOS COMPLEMENTARES, EQUIPAMENTO (AQUISIÇÃO),
 *     EQUIPAMENTO (LOCAÇÃO), ESPECIAIS) — NÃO o mapeamento MAT/MO/EQ.
 *   - ⚠ CORRIGIDO na v1.1.204: o campo `desonerado` estava INVERTIDO.
 *     As abas CSD/ISD dizem, no proprio cabecalho da planilha, "ENCARGOS
 *     SOCIAIS SEM DESONERACAO" — ou seja, regime ONERADO — e o gerador
 *     gravava desonerado:true nos 324.702 itens. O efeito no app nao era
 *     cosmetico: o filtro de regime da busca (js/bases.js) exclui item que
 *     declara o regime OPOSTO, entao filtrar "nao desonerado" perdia TODA a
 *     SINAPI e filtrar "desonerado" devolvia preco onerado com rotulo errado.
 *     Agora o regime e PARAMETRO (--regime), e o flag sai da aba lida.
 *   - Só entram itens COM preço na UF (célula não vazia / diferente de "-").
 *
 * As abas CSD/ISD carregam 1 coluna de preço por UF; o código real das
 * composições fica embutido na fórmula HYPERLINK/MATCH da célula B.
 *
 * USO: node gerar-sintetico-sinapi.js <UF|list,virgula> [--ref x.xlsx] [--mes 2026-05] [--out DIR]
 * Node puro; usa a lib xlsx do RA-Gestao-Obras. Não altera o fetcher.
 * ===================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');

const NM = 'C:/Users/USER/RA-Gestao-Obras/node_modules';
let XLSX;
try { XLSX = require(path.join(NM, 'xlsx')); }
catch (e) { try { XLSX = require('xlsx'); } catch (e2) { console.error('xlsx não encontrado'); process.exit(1); } }

/* ⚠ RELATIVO AO PROPRIO SCRIPT, nunca cravado em C:/Users/USER/OrcaPRO.
 * Com o caminho fixo, rodar este gerador de dentro de uma worktree gravava os
 * 27 arquivos na arvore PRINCIPAL — a worktree seguia com o dado velho e a
 * principal ficava suja sem ninguem pedir. Custou uma rodada inteira. */
const ORCA = path.join(__dirname, '..');
const SRC_DIR = path.join(ORCA, 'tools', '_sinapi-src');
const DATA_DIR = path.join(ORCA, 'data');
const LOG_PATH = 'C:/Users/USER/AppData/Local/Temp/analitico-full.log';

function log(msg) {
    const line = '[' + new Date().toISOString() + '] [sintetico] ' + msg;
    console.log(line);
    try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch (e) {}
}

// Preço formato US "1,071.33"; "" ou "-" => null (sem preço nesta UF)
function priceUS(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || s === '-') return null;
    const f = parseFloat(s.replace(/,/g, ''));
    return isNaN(f) ? null : f;
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function acharHeader(rows, ...precisa) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const j = rows[i].map(c => String(c).toLowerCase()).join('|');
        if (precisa.every(p => j.includes(p))) return i;
    }
    return -1;
}
function acharUfRow(rows, ateLinha) {
    for (let i = 0; i <= ateLinha; i++) {
        const up = rows[i].map(x => String(x).trim().toUpperCase());
        if (up.indexOf('AC') >= 0 && up.indexOf('MG') >= 0 && up.indexOf('SP') >= 0) return i;
    }
    return -1;
}

/* ⚠ QUAL ABA E QUAL REGIME — lido do cabecalho da propria planilha:
 *   CSD/ISD → "RELATORIO ... ENCARGOS SOCIAIS SEM DESONERACAO" → ONERADO
 *   CCD/ICD → "RELATORIO ... ENCARGOS SOCIAIS COM DESONERACAO" → DESONERADO
 * (ha ainda CSE/ISE, "SEM ENCARGOS SOCIAIS", que o produto nao usa.)
 * Confundir os dois foi o defeito: sigla parecida, regime oposto. */
const REGIMES = {
    onerada:    { comp: 'CSD', insu: 'ISD', desonerado: false },
    desonerada: { comp: 'CCD', insu: 'ICD', desonerado: true }
};

// COMPOSIÇÕES da aba do regime escolhido, para uma UF
function lerComposicoes(wb, uf, reg) {
    const sh = wb.Sheets[reg.comp];
    if (!sh) throw new Error('aba ' + reg.comp + ' ausente');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const hr = acharHeader(rows, 'código', 'descri', 'custo');
    const ufRowIdx = acharUfRow(rows, hr);
    const ufCol = rows[ufRowIdx].map(x => String(x).trim().toUpperCase()).indexOf(uf);
    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no CSD');
    const out = [];
    for (let i = hr + 1; i < rows.length; i++) {
        // código real via fórmula MATCH da célula B
        let code = '';
        const cell = sh[XLSX.utils.encode_cell({ r: i, c: 1 })];
        if (cell && cell.f) { const m = cell.f.match(/MATCH\((\d{3,})/); if (m) code = m[1]; }
        if (!code) { const v = String(rows[i][1] || '').trim(); if (v && v !== '0') code = v; }
        if (!code) continue;
        const preco = priceUS(rows[i][ufCol]);
        if (preco == null) continue; // sem preço nesta UF -> não entra na base
        out.push({
            codigo: code,
            descricao: String(rows[i][2] || '').trim(),
            unidade: String(rows[i][3] || '').trim(),
            custoUnitario: round2(preco),
            tipo: 'composicao',
            fonte: reg.comp,
            desonerado: reg.desonerado
        });
    }
    return out;
}

// INSUMOS da aba do regime escolhido, para uma UF
function lerInsumos(wb, uf, reg) {
    const sh = wb.Sheets[reg.insu];
    if (!sh) throw new Error('aba ' + reg.insu + ' ausente');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const hr = acharHeader(rows, 'código', 'descri', 'unidade');
    const ufCol = rows[hr].map(x => String(x).trim().toUpperCase()).indexOf(uf);
    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no ISD');
    const out = [];
    for (let i = hr + 1; i < rows.length; i++) {
        const code = String(rows[i][1] || '').trim();
        if (!code) continue;
        const preco = priceUS(rows[i][ufCol]);
        if (preco == null) continue;
        out.push({
            codigo: code,
            descricao: String(rows[i][2] || '').trim(),
            unidade: String(rows[i][3] || '').trim(),
            custoUnitario: round2(preco),
            tipo: 'insumo',
            fonte: reg.insu,
            categoria: String(rows[i][0] || '').trim(), // classe CRUA da aba de insumos
            desonerado: reg.desonerado
        });
    }
    return out;
}

function gerarUF(wb, uf, mes, reg) {
    const comps = lerComposicoes(wb, uf, reg);
    const insus = lerInsumos(wb, uf, reg);
    const dados = comps.concat(insus);
    return { mes: mes, uf: uf, desonerado: reg.desonerado, count: dados.length, dados: dados, _comps: comps.length, _insus: insus.length };
}

/* CONFERE O REGIME NO TEXTO DA PLANILHA antes de gravar 324 mil itens com o
 * flag. E barato e e exatamente a checagem que faltava: a aba diz em
 * portugues qual regime ela e; nao ha por que confiar na sigla. */
function conferirRegime(wb, reg) {
    const sh = wb.Sheets[reg.comp];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    let cab = '';
    for (let i = 0; i < Math.min(rows.length, 6); i++) cab += ' ' + rows[i].join(' ');
    cab = cab.toUpperCase();
    const temCom = cab.indexOf('COM DESONERA') >= 0;
    const temSem = cab.indexOf('SEM DESONERA') >= 0;
    if (reg.desonerado && !(temCom && !temSem)) throw new Error('aba ' + reg.comp + ' nao se declara COM DESONERACAO — nao gravo o flag no escuro');
    if (!reg.desonerado && !temSem) throw new Error('aba ' + reg.comp + ' nao se declara SEM DESONERACAO — nao gravo o flag no escuro');
    log('regime conferido no cabecalho de ' + reg.comp + ': ' + (reg.desonerado ? 'COM' : 'SEM') + ' desoneracao');
}

function main() {
    const args = process.argv.slice(2);
    const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
    const alvoArg = (args[0] || 'SP').toUpperCase();
    const mes = getArg('--mes') || '2026-05';
    const regNome = (getArg('--regime') || 'onerada').toLowerCase();
    const reg = REGIMES[regNome];
    if (!reg) throw new Error('regime desconhecido: ' + regNome + ' (use onerada | desonerada)');
    /* sufixo no nome so para o regime NAO padrao: o arquivo sem sufixo continua
       sendo o onerado, que e o que o pacote ja distribui e o app ja aponta */
    const sufixo = reg.desonerado ? '-desonerada' : '';
    let refPath = getArg('--ref');
    const outDir = getArg('--out') || DATA_DIR;

    log('=== gerar-sintetico | alvo=' + alvoArg + ' mes=' + mes + ' regime=' + regNome + ' ===');
    if (!refPath) {
        const cand = path.join(SRC_DIR, 'Referencia-' + mes + '.xlsx');
        if (!fs.existsSync(cand)) throw new Error('Referência não encontrada: ' + cand);
        refPath = cand;
    }
    log('lendo XLSX: ' + refPath);
    const wb = XLSX.readFile(refPath, { sheets: [reg.insu, reg.comp] });
    conferirRegime(wb, reg);

    const lista = alvoArg.split(',').map(s => s.trim()).filter(Boolean);
    const oks = [], fails = [];
    for (const uf of lista) {
        try {
            const pac = gerarUF(wb, uf, mes, reg);
            if (pac.count === 0) throw new Error('0 itens');
            const outPath = path.join(outDir, 'sinapi-' + uf + '-' + mes + sufixo + '.json');
            const payload = { mes: pac.mes, uf: pac.uf, desonerado: pac.desonerado, count: pac.count, dados: pac.dados };
            fs.writeFileSync(outPath, JSON.stringify(payload));
            const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
            oks.push({ uf, comps: pac._comps, insus: pac._insus, count: pac.count, mb });
            log('OK ' + uf + ': ' + pac._comps + ' comp + ' + pac._insus + ' insumos = ' + pac.count + ' (' + mb + ' MB) -> ' + outPath);
        } catch (e) {
            fails.push({ uf, motivo: e.message });
            log('FALHA ' + uf + ': ' + e.message);
        }
    }
    log('=== FIM: ' + oks.length + ' ok, ' + fails.length + ' falhas ===');
    oks.forEach(o => log('  ' + o.uf + ': comp=' + o.comps + ' insumos=' + o.insus + ' total=' + o.count + ' ' + o.mb + 'MB'));
    if (fails.length) log('FALHAS: ' + fails.map(f => f.uf + '(' + f.motivo + ')').join(' '));
}

try { main(); } catch (e) { log('ERRO FATAL: ' + (e.stack || e.message)); process.exit(1); }

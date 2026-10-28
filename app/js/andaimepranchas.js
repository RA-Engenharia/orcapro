/* =====================================================================
 * andaimepranchas.js — TEMPLATE DE PRANCHA DO ANDAIME TUBO-ROLL (E8, 27/10/2026). Motor PURO, ES5, sem DOM.
 *
 *   AndaimePranchas.gerar(modelo, calc, docs, opcoes) → { ok, folhas:[{ id, rotulo, numero, titulo, formato, escala, svg, dxf }],
 *       avisos[], pequeno, liberado, motivoNaoLiberado, escalaVista, itens }
 *   modelo = Andaime.montar(par) · calc = AndaimeCalc.calcular(modelo, p) (ou o resultado de montarInteligente) · docs = { lista, plano, checklist }
 *   (o que faltar em `docs` sai do js/andaimedocs.js, do MESMO modelo) · opcoes = { empresa, responsavel, registro, art, obra, proprietario,
 *   contratante, local, codigo, revisao, data, formato (força "A3" ou "A1"), logo, padrao, depurar, qServ, pisosCarregados, tipo }
 *
 * O QUE SAI (Padrão RA v2.12, chave `andaime` do padrao_detalhamento_ra.json — espelho em PADRAO_AND):
 *   PEQUENO (≤ 3 vãos e ≤ 3 levantes): UMA folha A3 paisagem — Planta, Elevação frontal, Elevação lateral, Isométrico, Notas e Relação de materiais.
 *   MAIOR: quatro A1 paisagem — AND-01 planta e elevações · AND-02 isométrico + 7 detalhes típicos 1:5/1:10 · AND-03 relação de materiais +
 *   plano de montagem + checklist · AND-04 memorial de cálculo resumido, reações nas bases, "não verificado" e campos de liberação (NR-18 18.12.4) e RT.
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS" (cada uma impede um defeito):
 *   1. Folha de andaime com cálculo FALHO (ou sem cálculo, ou passou:false) leva a faixa «NÃO LIBERADO» em TODAS as folhas e nunca sai como aprovada.
 *      Por quê: a prancha é lida no campo sem o memorial; um andaime reprovado com cara de projeto aprovado mata gente.
 *   2. A relação de materiais, os balões e o quadro de verificações vêm do MESMO modelo e do MESMO cálculo (Andaime.pecasLocacao, AndaimeCalc).
 *      Nenhuma quantidade nem número de cálculo é refeito aqui. Por quê: duas contas divergem e a locadora entrega errado.
 *   3. Escala = a MAIOR de [25, 50, 75, 100] que cabe SEM encolher a letra (a letra mínima do padrão é 2,1 mm). Só acima de 100 (andaime enorme) entra 125…250.
 *   4. Isométrico em arame COM remoção de linhas ocultas por profundidade: o tubo da frente interrompe o de trás com folga de 1 mm (convenção do desenho
 *      à mão). Sem isso o isométrico vira um novelo ilegível.
 *   5. O carimbo é o RA, INTOCADO (AcoPranchas.carimbo → Prancha.carimboRA): a folha só preenche os campos.
 *   6. Detalhes típicos usam as cotas das famílias (FamiliasAndaime.cota ← docs/andaime/familias-cotas.json); o que é estimado lá continua estimado aqui.
 *   7. M4-B (27/10/2026): o MESMO jogo serve ao ANDAIME MULTIDIRECIONAL (modelo.sistema === "multidirecional", linhas roseta e estribo): postes com os NÓS a cada 0,50 m,
 *      piso metálico com hachura PRÓPRIA (cruzada, nunca a 45° da madeira), alçapão com escada incorporada, peça base + base regulável, gancho de ancoragem, detalhes
 *      típicos do multi (cotas de docs/andaime-multi/familias-m-cotas.json, grau estimado marcado com *), AND-04/AND-05 com as verificações do AndaimeMultiCalc. A relação de
 *      materiais é a de AndaimeMulti.tabelaLocacao (via Andaime.pecasLocacao, que despacha). O TUBO-ROLL não muda: tudo que é do multi fica atrás de `MULTI`/`C.multi`.
 * Teste: node tools/test-andaimepranchas.js (tubo-roll) · node tools/test-andaimemulti-pranchas.js (multidirecional)
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------ dependências */
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* módulo ausente */ } }
    return null;
  }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function AD() { return dep("AndaimeDocs", "./andaimedocs.js"); }
  function An0() { return dep("Andaime", "./andaime.js"); }
  function FA() { return dep("FamiliasAndaime", "./familiasandaime.js"); }

  /* ------------------------------------------------------------ utilidades */
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function dois(k) { return ("0" + k).slice(-2); }
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    c = c == null ? 2 : c;
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    if (/^0(\.0*)?$/.test(s)) neg = false;
    var p = s.split("."), ip = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + ip + (p[1] ? "," + p[1] : "");
  }
  function mmTxt(vm) { return String(Math.round(vm * 1000)); }          /* m → "6000" (cota em mm, sem separador de milhar — como a metálica) */
  function nivelTxt(vm) { return (vm >= 0 ? "+" : "-") + br(Math.abs(vm), 2) + "m"; }
  function cotaF(fam, nome, padrao) { try { var F = FA(); return F && F.cota ? F.cota(fam, nome) : padrao; } catch (e) { return padrao; } }   /* mm, da família */
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }

  var VERMELHO = "#c00000", VERDE = "#1e6b2f";

  /* ---- MULTIDIRECIONAL (M4-B). `MULTI` vale durante UMA chamada de gerar/isometricoSvg/dadosProjeto (síncrono); o tubo-roll nunca o liga. */
  var MULTI = false, LINHA_MULTI = "roseta", ESTIMADAS = {};
  function ehMulti(m) { return !!m && String(m.sistema) === "multidirecional"; }
  function MU() { return dep("AndaimeMulti", "./andaimemulti.js"); }
  function FMD() { return dep("FamiliasAndaimeMDados", "./familiasandaimemdados.js"); }
  /* cota (mm) de uma família do multi, com o grau: estimada ('e') entra em ESTIMADAS e leva * no desenho */
  function cotaM(fam, nome, padrao) {
    try { var D = FMD(), c = D && D.pecas && D.pecas[fam] && D.pecas[fam].cotas && D.pecas[fam].cotas[nome]; if (!c || typeof c.v !== "number") return padrao; if (c.g === "e") ESTIMADAS[fam + "." + nome] = 1; return c.v; } catch (e) { return padrao; }
  }
  function estM(fam, nome) { try { var D = FMD(), c = D.pecas[fam].cotas[nome]; return c && c.g === "e" ? "*" : ""; } catch (e) { return ""; } }
  function txM(fam, nome, padrao, dec) { var v = cotaM(fam, nome, padrao); return (dec ? br(v, dec) : String(Math.round(v))) + estM(fam, nome); }

  /* ================================================================ PADRÃO (espelho da chave `andaime` do Padrão RA v2.12) */
  var PADRAO_AND = {
    versao: "2.14", chave: "andaime", data: "27/10/2026",
    folhas: { pequeno: ["PLANTA, ELEVAÇÕES, ISOMÉTRICO, NOTAS E RELAÇÃO DE MATERIAIS"],
              grande: ["PLANTA E CORTES", "ELEVAÇÕES", "ISOMÉTRICO E DETALHES TÍPICOS", "RELAÇÃO DE PEÇAS, PESOS, REAÇÕES E ANCORAGENS", "MEMORIAL DE CÁLCULO, CHECKLIST E LIBERAÇÃO"] },
    escalas: [100, 75, 50, 25], escalasExtra: [125, 150, 200, 250, 300, 400, 500],
    marcas: { PT: "pontalete (montante)", LG: "longitudinal (travessa e guarda-corpo)", TR: "transversal", DG: "diagonal", PR: "pranchão de madeira", PM: "piso metálico",
              RD: "rodapé", BS: "base sapata / regulável", CL: "calço", LV: "luva", AF: "abraçadeira fixa", AG: "abraçadeira giratória", AR: "abraçadeira de rodapé",
              AN: "ancoragem", ES: "escada", EC: "lance de escada coletiva", PD: "plataforma de descanso", CN: "cancela", AL: "alçapão / portinhola", ARC: "arco do marinheiro" },
    /* penas do bloco `penas_por_elemento` (mm). A camada MET-* → layer EST-* do DXF vem do AcoPranchas.PADRAO_ACO.camadas (o padrão herdado). */
    penas: { "MET-SECUNDARIO": 0.35, "MET-PRINCIPAL": 0.5, "MET-HACHURA": 0.13, "MET-COTA": 0.18 },
    normas: ["NR-18 (Portaria MTE 836/2026).", "NR-35.", "ABNT NBR 6494:1990 (vigência a conferir; exemplar não licenciado).", "ABNT NBR 8800:2008.", "ABNT NBR 6123:2023 (vento).", "ABNT NBR 8681."],
    conferencia: ["quantidades da relação = do modelo", "cada vista tem as cotas de vão, levante, largura e guarda-corpo", "um balão por tipo de peça; todo ITEM aparece em alguma vista ou detalhe",
                  "quadro de verificações sem falha; não verificado listado", "nenhum texto sobre outro", "carimbo RA intocado; campo de liberação e de ART presentes"]
  };
  /* MULTIDIRECIONAL: marcas e códigos de peça (a relação sai de AndaimeMulti.pecasLocacao: poste, travessa, diagonal, piso, pisoAlcapao, rodape, pecaBase, baseRegulavel, calco, emenda, gancho…) */
  var MARCAS_MULTI = { PO: "poste com roseta (nó a cada 0,50 m)", TV: "travessa de cunha (longitudinal, transversal e guarda-corpo)", DM: "diagonal articulada", PM: "piso metálico com garra e trava", AL: "piso com alçapão e escada incorporada",
    RM: "rodapé metálico de encaixe", PB: "peça base", BR: "base regulável", CL: "calço de madeira", PN: "pino trava do espigão", GA: "gancho de ancoragem", TA: "tubo de amarração", AF: "abraçadeira fixa", OL: "parafuso olhal", CH: "chumbador", ES: "escada externa" };
  var MARCA_COD_MULTI = { poste: "PO", travessa: "TV", diagonal: "DM", piso: "PM", pisoAlcapao: "AL", rodape: "RM", pecaBase: "PB", baseRegulavel: "BR", baseArticulada: "BR", calco: "CL", emenda: "PN", ganchoCurto: "GA", ganchoLongo: "GA", tuboAnc: "TA", abracFixa: "AF", olhal: "OL", chumbador: "CH", escadaExterna: "ES", tela: "" };
  function marcasAtivas() { return MULTI ? MARCAS_MULTI : PADRAO_AND.marcas; }
  var NOME_TUBO = { montante: "Pontalete", travessa: "Longitudinal", varredor: "Longitudinal", guarda: "Longitudinal", intermediaria: "Longitudinal", transversal: "Transversal", diagonal: "Diagonal",
    diagonalTransv: "Diagonal", ancoragem: "Tubo de Amarração", travaTopo: "Longitudinal", transversalTopo: "Transversal", posteGuarda: "Poste de Guarda-corpo" };   /* o mesmo mapa de Andaime.pecasLocacao */
  var MARCA_TUBO = { "Pontalete": "PT", "Longitudinal": "LG", "Transversal": "TR", "Diagonal": "DG", "Tubo de Amarração": "AN", "Poste de Guarda-corpo": "PT", "Tubo": "" };
  var MARCA_COD = { bracFixa: "AF", bracGiratoria: "AG", luva: "LV", baseRegulavel: "BS", baseFixa: "BS", rodizio: "", calco: "CL", pranchaMadeira: "PR", pisoMetalico: "PM", alcapao: "AL",
    rodapeMadeira: "RD", abracRodape: "AR", presilhaPrancha: "", escadaMao: "ES", escadaMarinheiro: "ES", escadaColetiva: "EC", plataformaDescanso: "PD", fixacaoMarinheiro: "", cancela: "CN", olhal: "AN", tela: "" };

  function estilo(padrao) {
    var A = AP(), E = A.estilo(padrao);
    Object.keys(PADRAO_AND.penas).forEach(function (k) { if (E.camadas[k]) E.camadas[k].mm = PADRAO_AND.penas[k]; });
    return E;
  }

  /* ================================================================ A CENA (modelo → coordenadas locais da folha)
   * Locais (X, y, Y): X para a direita da planta, y para cima, Y para BAIXO da planta; a face de fora do andaime (trecho 0) fica em Y maior —
   * a elevação frontal é vista do lado de fora (de baixo da planta, 1º diedro da NBR). Rotação pura em torno de y (nunca espelha). */
  function baseDe(modelo, ti) {
    var t0 = (modelo.trechos && modelo.trechos[ti || 0]) || {}, ns = t0.ns || [0, -1];
    var e2 = [ns[0], ns[1]], e1 = [ns[1], -ns[0]];
    return { e1: e1, e2: e2, P: function (p) { return [e1[0] * p[0] + e1[1] * p[2], p[1], e2[0] * p[0] + e2[1] * p[2]]; } };
  }
  function chaveItem(cod, L) { return cod + "|" + (L == null ? "" : (Math.round(L * 100) / 100).toFixed(2)); }
  function indiceItens(lista) {
    var ix = {};
    lista.forEach(function (l) {
      if (l.cod === "tubo") ix["tubo|" + l.papelTubo + "|" + (Math.round(l.comp * 100) / 100).toFixed(2)] = l.item;
      else { var k = chaveItem(l.cod, l.comp); if (ix[k] == null) ix[k] = l.item; }
    });
    return ix;
  }
  function cenaDe(modelo, lista, ti) {
    var B = baseDe(modelo, ti), P = B.P, ix = indiceItens(lista), par = modelo.par || {}, M = modelo.medidas || {}, TD = An0().todos(modelo), multi = ehMulti(modelo);
    function itemTubo(b) { var nm = NOME_TUBO[b.papel] || "Tubo"; return ix["tubo|" + nm + "|" + (Math.round(b.L * 100) / 100).toFixed(2)]; }
    /* multi: o item da relação é achado pelo código de catálogo + comprimento (a mesma agregação de AndaimeMulti.pecasLocacao) */
    function itemMulti(cod, L, cat) {
      var f = null;
      lista.forEach(function (l) { if (f != null || l.cod !== cod) return; if (L != null && l.comp != null && Math.abs(l.comp - L) > 0.006) return; if (cat && l.refCatalogo && l.refCatalogo !== cat) return; f = l.item; });
      return f;
    }
    var C = { B: B, ix: ix, tubos: [], pranchas: [], rodapes: [], bases: [], calcos: [], ancs: [], acessos: [], conexoes: [], par: par, M: M, modelo: modelo, lista: lista, multi: multi, linha: multi ? String(modelo.linha || par.linha || "roseta") : null, nos: [], espigoes: [] };
    TD.barras.forEach(function (b) {
      C.tubos.push({ id: b.id, papel: multi && b.papel === "poste" ? "montante" : b.papel, papel0: b.papel, a: P(b.a), b: P(b.b), L: b.L, nivel: b.nivel, poste: b.poste, linha: b.linha, torre: !!b.torre, patamar: !!b.patamar,
        item: multi ? (itemMulti(b.cod, b.L, b.codCat) || (b.papel === "ancoragem" ? itemMulti("tuboAnc", null) : null)) : itemTubo(b) });
    });
    TD.pranchas.forEach(function (p) {
      var cod = multi ? (p.tipo === "alcapao" ? "pisoAlcapao" : "piso") : (p.tipo === "metalico" ? "pisoMetalico" : (p.tipo === "alcapao" ? "alcapao" : "pranchaMadeira"));
      C.pranchas.push({ id: p.id, tipo: p.tipo, a: P(p.a), b: P(p.b), larg: p.larg, esp: p.esp, yTopo: p.yTopo, nivel: p.nivel, L: p.L, item: ix[chaveItem(cod, p.L)], torre: !!p.torre, patamar: !!p.patamar, lance: p.lance });
    });
    arr(modelo.rodapes).forEach(function (r) { C.rodapes.push({ id: r.id, a: P(r.a), b: P(r.b), alt: r.alt, esp: r.esp, yTopo: r.yTopo, nivel: r.nivel, L: r.L, item: ix[chaveItem(multi ? "rodape" : "rodapeMadeira", r.L)] }); });
    TD.bases.forEach(function (b) { C.bases.push({ id: b.id, cod: b.cod, pos: P(b.pos), y0: b.y0, h: b.h, rosca: b.rosca, item: ix[chaveItem(b.cod, null)], torre: !!b.torre }); });
    C.itemPecaBase = multi ? itemMulti("pecaBase", null) : null; C.itemAbrac = multi ? itemMulti("abracFixa", null) : null; C.itemChumb = multi ? itemMulti("chumbador", null) : null;
    TD.calcos.forEach(function (c) {
      var u = c.u || [1, 0], uu = [B.e1[0] * u[0] + B.e1[1] * u[1], B.e2[0] * u[0] + B.e2[1] * u[1]];
      C.calcos.push({ id: c.id, pos: P(c.pos), L: c.L, larg: c.larg, esp: c.esp, u: uu, item: ix[chaveItem("calco", 0.5)] });
    });
    arr(modelo.ancoragens).forEach(function (a) { C.ancs.push({ id: a.id, y: a.y, nivel: a.nivel, topo: !!a.topo, pos: P(a.olhal && a.olhal.pos ? a.olhal.pos : [0, a.y, 0]), item: ix[chaveItem("olhal", null)], gancho: a.gancho, itemGancho: multi ? itemMulti(a.gancho === "tubo" ? "tuboAnc" : a.gancho, null) : null }); });
    TD.acessos.forEach(function (a) {
      var u0 = a.u || [1, 0], itA = multi ? (a.incorporada ? itemMulti("pisoAlcapao", null) : itemMulti("escadaExterna", null)) : ix[chaveItem(a.cod, a.L)];
      C.acessos.push({ id: a.id, tipo: a.tipo, cod: a.cod, a: P(a.a), b: P(a.b), u: [B.e1[0] * u0[0] + B.e1[1] * u0[1], B.e2[0] * u0[0] + B.e2[1] * u0[1]], larg: a.larg, L: a.L, nivel: a.nivel, lance: a.lance, dir: a.dir, angulo: a.angulo, nDegraus: a.nDegraus, externa: a.externa, incorporada: !!a.incorporada, torre: !!a.torre, item: itA });
    });
    C.ti = ti || 0; C.torre = !!modelo.torre; C.acessoModo = modelo.acessoInfo ? modelo.acessoInfo.modo : null;
    arr(modelo.conexoes).forEach(function (c) {
      if (multi) { if (c.tipo === "espigao") C.espigoes.push({ id: c.id, pos: P(c.pos), item: itemMulti("emenda", null) }); return; }
      var cod = { fixa: "bracFixa", giratoria: "bracGiratoria", luva: "luva", rodape: "abracRodape", prancha: "presilhaPrancha" }[c.tipo];
      if (!cod) return;
      C.conexoes.push({ id: c.id, tipo: c.tipo, pos: P(c.pos), item: ix[chaveItem(cod, null)] });
    });
    C.itemTela = ix[chaveItem("tela", null)];
    /* guarda-corpo, intermediário e rodapé: no multi são os do modelo (1,00 / 0,50 / 0,20 — NR-18 18.12.15.2); no tubo-roll, os parâmetros */
    C.gd = multi ? { g: num(M.guardaReal, 1.0), it: num(M.guardaReal, 1.0) / 2, rd: num(arr(modelo.rodapes)[0] && modelo.rodapes[0].alt, 0.2) } : { g: num(par.guarda, 1.2), it: num(par.intermediaria, 0.7), rd: num(par.rodape, 0.2) };
    /* caixa do conjunto (m) e níveis */
    var bx = { x0: 1e9, x1: -1e9, y0: 0, y1: 0, z0: 1e9, z1: -1e9 };
    function pt(p) { bx.x0 = Math.min(bx.x0, p[0]); bx.x1 = Math.max(bx.x1, p[0]); bx.y1 = Math.max(bx.y1, p[1]); bx.z0 = Math.min(bx.z0, p[2]); bx.z1 = Math.max(bx.z1, p[2]); }
    C.tubos.forEach(function (t) { pt(t.a); pt(t.b); });
    C.pranchas.forEach(function (t) { pt(t.a); pt(t.b); });
    C.bases.forEach(function (t) { pt(t.pos); });
    C.acessos.forEach(function (t) { pt(t.a); pt(t.b); });
    C.calcos.forEach(function (c) { pt([c.pos[0] - 0.25, 0, c.pos[2]]); pt([c.pos[0] + 0.25, 0, c.pos[2]]); });
    C.ancs.forEach(function (a) { pt(a.pos); });
    if (!isFinite(bx.x0)) { bx.x0 = 0; bx.x1 = 1; bx.z0 = 0; bx.z1 = 1; }
    C.box = bx;
    var nv = arr(modelo.niveis), yp = [];
    nv.forEach(function (v) { var y = v.yPiso != null ? v.yPiso : null; if (y != null) yp.push(y); });
    if (!yp.length) yp.push(num(M.alturaPiso, 2));
    C.yPisos = yp; C.yTopo = yp[yp.length - 1];
    C.yMax = Math.max(bx.y1, C.yTopo + C.gd.g, (C.telaY = modelo.tela && modelo.tela.area > 0 ? { y0: multi ? yp[0] : C.yTopo, y1: multi ? C.yTopo + 2.0 : C.yTopo + num(modelo.tela.altura, 2) } : null) ? C.telaY.y1 : 0);
    /* posições X dos eixos dos montantes (únicas, ordenadas, a 1 mm) e Y das duas linhas */
    var xs = [], ys = [];
    arr(modelo.postes).forEach(function (q) { var p = P([q.x, 0, q.z]); xs.push(p[0]); ys.push(p[2]); });
    function unicos(v) { v.sort(function (a, b) { return a - b; }); var o = []; v.forEach(function (x) { if (!o.length || Math.abs(x - o[o.length - 1]) > 0.001) o.push(x); }); return o; }
    C.xsPostes = unicos(xs); C.ysPostes = unicos(ys);
    C.xsAnc = unicos(C.ancs.map(function (a) { return a.pos[0]; }));
    C.ysAnc = unicos(C.ancs.map(function (a) { return a.y; }));
    /* a linha da face de trabalho (a estrutura existente), no caminho do modelo */
    var An = AN(), cam = null, fechado = !!par.fechado;
    try {
      var c1 = An ? An.lerCaminho(par.contorno) : [], c0 = An ? An.lerCaminho(par.caminho) : [];
      if (c1.length >= 3) { cam = c1; fechado = true; } else if (c0.length >= 2) cam = c0;
    } catch (e) { cam = null; }
    if (!cam) cam = [[0, 0], [num(par.comprimento, num(M.comprimento, 6)), 0]];
    C.face = cam.map(function (q) { var p = P([q[0], 0, q[1]]); return [p[0], p[2]]; }); C.faceFechada = fechado;
    /* os NÓS do multi: um por (poste, y) a cada passo (0,50 m) a partir do 1º nó (modelo.vertical) */
    if (multi) {
      var Vm = modelo.vertical || {}, y0n = num(Vm.y0, 0), psn = num(Vm.passo, 0.5), vis = {};
      C.tubos.forEach(function (t) {
        if (t.papel0 !== "poste") return;
        var ya = Math.min(t.a[1], t.b[1]), yb = Math.max(t.a[1], t.b[1]);
        for (var k = Math.ceil((ya - y0n) / psn - 1e-6); y0n + k * psn <= yb + 1e-6; k++) {
          var yy = Math.round((y0n + k * psn) * 1000) / 1000, key = Math.round(t.a[0] * 1000) + "," + Math.round(t.a[2] * 1000) + "," + Math.round(yy * 1000);
          if (vis[key]) continue; vis[key] = 1; C.nos.push({ p: [t.a[0], yy, t.a[2]], k: k });
        }
      });
    }
    return C;
  }

  /* ================================================================ OCLUSÃO POR PROFUNDIDADE (isométrico em arame)
   * Segmentos 3D → tela (mm de papel) + profundidade (m, para o observador). Oclusores: tubos (cápsula) e caixas (faces visíveis, quadriláteros
   * convexos com o plano de profundidade). Um segmento A é interrompido onde um oclusor MAIS PRÓXIMO o cobre, com folga `folga` (mm). */
  function clipConvexo(a, b, planos) {
    var t0 = 0, t1 = 1;
    for (var i = 0; i < planos.length; i++) {
      var p = planos[i], da = p[0] * a[0] + p[1] * a[1] - p[2], db = p[0] * b[0] + p[1] * b[1] - p[2];
      if (da > 0 && db > 0) return null;
      if (da <= 0 && db <= 0) continue;
      var t = da / (da - db);
      if (da > 0) { if (t > t0) t0 = t; } else { if (t < t1) t1 = t; }
      if (t0 > t1) return null;
    }
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  function clipDisco(a, b, c, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - c[0], fy = a[1] - c[1];
    var A = dx * dx + dy * dy, Bq = 2 * (fx * dx + fy * dy), Cq = fx * fx + fy * fy - r * r;
    if (A < 1e-12) return Cq <= 0 ? [0, 1] : null;
    var disc = Bq * Bq - 4 * A * Cq; if (disc < 0) return null;
    var sq = Math.sqrt(disc), t0 = (-Bq - sq) / (2 * A), t1 = (-Bq + sq) / (2 * A);
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  function uniao2(l) { var r = null; l.forEach(function (x) { if (!x) return; if (!r) r = [x[0], x[1]]; else { r[0] = Math.min(r[0], x[0]); r[1] = Math.max(r[1], x[1]); } }); return r; }
  /* projeção isométrica: observador em (−X, +Y), olhando de cima (el = 35,264°) */
  function projIso(el, flip) {
    var c = Math.cos(el), sn = Math.sin(el), r2 = Math.SQRT1_2;
    var f = flip ? -1 : 1;
    /* h = direção horizontal até o observador = (−1, 0, +1)/√2 em (X, y, Y); R = (1,0,1)/√2; w = h·cos + up·sin; U = up·cos − h·sin */
    return function (p) {
      var X = p[0], y = p[1], Y = p[2];
      var h = (-X + Y) * r2, rr = (X + Y) * r2;
      return [rr * f, y * c - h * sn, y * sn + h * c];   /* [x direita, y para cima, profundidade p/ observador] em m */
    };
  }
  function ocultarSegmentos(segs, occ, s, folga) {
    /* segs: [{ a:[x,y,d], b:[x,y,d], r (raio m, 0 se não é tubo), dono, cam, attr }] em metros de tela; devolve [{ x1,y1,x2,y2,cam,attr }] (mm de papel, y para baixo) */
    var out = [], CEL = 25, grade = {};
    function K(i, j) { return i + "," + j; }
    function reg(o) {
      var i0 = Math.floor(o.bb[0] / CEL), i1 = Math.floor(o.bb[2] / CEL), j0 = Math.floor(o.bb[1] / CEL), j1 = Math.floor(o.bb[3] / CEL);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var k = K(i, j); (grade[k] = grade[k] || []).push(o); }
    }
    occ.forEach(function (o, idx) { o.idx = idx; reg(o); });
    segs.forEach(function (sg) {
      var A0 = [sg.a[0] * s, -sg.a[1] * s], A1 = [sg.b[0] * s, -sg.b[1] * s], dA0 = sg.a[2], dA1 = sg.b[2];
      var bb = [Math.min(A0[0], A1[0]), Math.min(A0[1], A1[1]), Math.max(A0[0], A1[0]), Math.max(A0[1], A1[1])];
      var cand = {}, lista = [];
      for (var i = Math.floor(bb[0] / CEL); i <= Math.floor(bb[2] / CEL); i++) for (var j = Math.floor(bb[1] / CEL); j <= Math.floor(bb[3] / CEL); j++) {
        var g = grade[K(i, j)]; if (!g) continue;
        for (var q = 0; q < g.length; q++) if (!cand[g[q].idx]) { cand[g[q].idx] = 1; lista.push(g[q]); }
      }
      var cortes = [];
      lista.forEach(function (o) {
        if (o.dono === sg.dono) return;
        if (o.bb[2] < bb[0] || o.bb[0] > bb[2] || o.bb[3] < bb[1] || o.bb[1] > bb[3]) return;
        var iv = o.tipo === "tubo" ? ivTubo(o) : ivFace(o);
        if (!iv) return;
        /* a profundidade decide: em 8 pedaços, onde o oclusor está mais perto que o segmento */
        var NP = 8;
        for (var k = 0; k < NP; k++) {
          var ta = iv[0] + (iv[1] - iv[0]) * k / NP, tb = iv[0] + (iv[1] - iv[0]) * (k + 1) / NP, tm = (ta + tb) / 2;
          var px = A0[0] + (A1[0] - A0[0]) * tm, py = A0[1] + (A1[1] - A0[1]) * tm, dA = dA0 + (dA1 - dA0) * tm, dO, limiar;
          if (o.tipo === "tubo") {
            var ex = o.b[0] - o.a[0], ey = o.b[1] - o.a[1], L2 = ex * ex + ey * ey, u = L2 > 1e-12 ? ((px - o.a[0]) * ex + (py - o.a[1]) * ey) / L2 : 0;
            u = Math.max(0, Math.min(1, u)); dO = o.da + (o.db - o.da) * u; limiar = o.rm + (sg.r || 0) + 0.004;
          } else { dO = o.d0 + o.gx * (px - o.x0) + o.gy * (py - o.y0); limiar = 0.004; }
          if (dO - dA > limiar) cortes.push([ta, tb]);
        }
      });
      cortes.sort(function (p, q) { return p[0] - q[0]; });
      var vis = [], at = 0;
      cortes.forEach(function (c) { if (c[0] > at + 1e-9) vis.push([at, c[0]]); if (c[1] > at) at = c[1]; });
      if (at < 1 - 1e-9) vis.push([at, 1]);
      var Lseg = hip(A1[0] - A0[0], A1[1] - A0[1]);
      vis.forEach(function (v) {
        if ((v[1] - v[0]) * Lseg < 0.15) return;
        out.push({ x1: A0[0] + (A1[0] - A0[0]) * v[0], y1: A0[1] + (A1[1] - A0[1]) * v[0], x2: A0[0] + (A1[0] - A0[0]) * v[1], y2: A0[1] + (A1[1] - A0[1]) * v[1], cam: sg.cam, attr: sg.attr, dono: sg.dono });
      });
      function ivTubo(o) {
        var e0 = o.a, e1 = o.b, ex = e1[0] - e0[0], ey = e1[1] - e0[1], len = hip(ex, ey), w = o.w + folga;
        if (len < 1e-6) return clipDisco(A0, A1, e0, w);
        var ux = ex / len, uy = ey / len, nx = -uy, ny = ux;
        var pl = [[nx, ny, nx * e0[0] + ny * e0[1] + w], [-nx, -ny, -(nx * e0[0] + ny * e0[1]) + w], [ux, uy, ux * e0[0] + uy * e0[1] + len], [-ux, -uy, -(ux * e0[0] + uy * e0[1])]];
        return uniao2([clipConvexo(A0, A1, pl), clipDisco(A0, A1, e0, w), clipDisco(A0, A1, e1, w)]);
      }
      function ivFace(o) { return clipConvexo(A0, A1, o.planos); }
    });
    return out;
  }
  function oclusorTubo(a, b, r, s, folga, dono) {   /* a, b = [x,y,d] em m de tela */
    var A = [a[0] * s, -a[1] * s], Bq = [b[0] * s, -b[1] * s], w = r * s;
    return { tipo: "tubo", a: A, b: Bq, da: a[2], db: b[2], w: w, rm: r, dono: dono, bb: [Math.min(A[0], Bq[0]) - w - folga, Math.min(A[1], Bq[1]) - w - folga, Math.max(A[0], Bq[0]) + w + folga, Math.max(A[1], Bq[1]) + w + folga] };
  }
  function oclusorFace(q3, s, folga, dono) {    /* q3 = 4 pontos [x,y,d] (m de tela); null se de perfil */
    var q = q3.map(function (p) { return [p[0] * s, -p[1] * s, p[2]]; });
    var ar = 0; for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; ar += q[i][0] * q[j][1] - q[j][0] * q[i][1]; }
    if (Math.abs(ar) < 0.05) return null;
    var sg = ar > 0 ? 1 : -1, planos = [];
    for (var k = 0; k < 4; k++) {
      var p0 = q[k], p1 = q[(k + 1) % 4], ex = p1[0] - p0[0], ey = p1[1] - p0[1], len = hip(ex, ey);
      if (len < 1e-9) continue;
      var nx = ey / len * sg, ny = -ex / len * sg;   /* normal para fora */
      planos.push([nx, ny, nx * p0[0] + ny * p0[1] + folga]);
    }
    var e1x = q[1][0] - q[0][0], e1y = q[1][1] - q[0][1], e2x = q[3][0] - q[0][0], e2y = q[3][1] - q[0][1], det = e1x * e2y - e1y * e2x;
    if (Math.abs(det) < 1e-9) return null;
    var dd1 = q[1][2] - q[0][2], dd2 = q[3][2] - q[0][2];
    var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; });
    return { tipo: "face", planos: planos, x0: q[0][0], y0: q[0][1], d0: q[0][2], gx: (dd1 * e2y - dd2 * e1y) / det, gy: (e1x * dd2 - e2x * dd1) / det, dono: dono,
      bb: [Math.min.apply(null, xs) - folga, Math.min.apply(null, ys) - folga, Math.max.apply(null, xs) + folga, Math.max.apply(null, ys) + folga] };
  }
  /* caixa orientada (centro, direção horizontal d=[dx,dz] em X/Y, meia-largura, meia-altura, meio-comprimento) → 8 vértices locais (X,y,Y) */
  function caixaVertices(c, d, hl, hw, hh) {
    var sx = -d[1], sz = d[0], v = [];
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (cc) {
      v.push([c[0] + d[0] * hl * a + sx * hw * b, c[1] + hh * cc, c[2] + d[1] * hl * a + sz * hw * b]);
    }); }); });
    return v;   /* índice = a*4 + b*2 + c, com a,b,c em {0,1} ↔ {−1,+1} */
  }
  var FACES = [   /* [4 índices, normal local (comprimento, largura, altura)] */
    [[4, 5, 7, 6], [1, 0, 0]], [[0, 1, 3, 2], [-1, 0, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[0, 1, 5, 4], [0, -1, 0]], [[1, 3, 7, 5], [0, 0, 1]], [[0, 2, 6, 4], [0, 0, -1]]
  ];
  function facesVisiveis(c, d, hl, hw, hh, pr) {
    var v = caixaVertices(c, d, hl, hw, hh), sx = -d[1], sz = d[0], out = [];
    FACES.forEach(function (f) {
      var nl = f[1], nw = [d[0] * nl[0] + sx * nl[1], nl[2], d[1] * nl[0] + sz * nl[1]];   /* normal em (X, y, Y) */
      /* visível se a normal aponta para o observador: w·n > 0 em coordenadas de tela */
      var o0 = pr([0, 0, 0]), o1 = pr(nw), dep = o1[2] - o0[2];
      if (dep > 1e-6) out.push(f[0].map(function (i) { return v[i]; }));
    });
    return out;
  }

  /* ================================================================ VISTAS (planta, elevação frontal, elevação lateral) */
  function Dedup() { this.k = {}; }
  Dedup.prototype.novo = function (x1, y1, x2, y2) {
    var a = [Math.round(x1 * 20), Math.round(y1 * 20)], b = [Math.round(x2 * 20), Math.round(y2 * 20)];
    var key = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) ? a + "|" + b : b + "|" + a;
    if (this.k[key]) return false; this.k[key] = 1; return true;
  };
  function planosPoli(poly) {
    var ar = 0, i, j; for (i = 0; i < poly.length; i++) { j = (i + 1) % poly.length; ar += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; }
    var sg = ar > 0 ? 1 : -1, pl = [];
    for (i = 0; i < poly.length; i++) {
      j = (i + 1) % poly.length; var ex = poly[j][0] - poly[i][0], ey = poly[j][1] - poly[i][1], len = hip(ex, ey); if (len < 1e-9) continue;
      var nx = ey / len * sg, ny = -ex / len * sg; pl.push([nx, ny, nx * poly[i][0] + ny * poly[i][1]]);
    }
    return pl;
  }
  /* hachura a 45° dentro de um polígono convexo (madeira: nada embolado — passo mínimo de 1 mm) */
  function hachuraPoli(D, poly, passo, cam) {
    var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), pl = planosPoli(poly);
    passo = Math.max(passo || 1.5, 0.9);
    for (var c = x0 - (y1 - y0) + passo / 2; c < x1 + (y1 - y0); c += passo) {
      var a = [c, y1], b = [c + (y1 - y0), y0], t = clipConvexo(a, b, pl);
      if (t && (t[1] - t[0]) * hip(b[0] - a[0], b[1] - a[1]) > 0.4) D.linha(a[0] + (b[0] - a[0]) * t[0], a[1] + (b[1] - a[1]) * t[0], a[0] + (b[0] - a[0]) * t[1], a[1] + (b[1] - a[1]) * t[1], cam || "MET-HACHURA");
    }
  }
  /* MULTI: hachura em UM sentido (inv inverte a direção); o piso metálico leva as DUAS (cruzada) — a madeira é só a 45° "/" */
  function hachuraDir(D, poly, passo, cam, inv) {
    var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), pl = planosPoli(poly);
    passo = Math.max(passo || 1.5, 0.9);
    for (var c = x0 - (y1 - y0) + passo / 2; c < x1 + (y1 - y0); c += passo) {
      var a = inv ? [c, y0] : [c, y1], b = inv ? [c + (y1 - y0), y1] : [c + (y1 - y0), y0], t = clipConvexo(a, b, pl);
      if (t && (t[1] - t[0]) * hip(b[0] - a[0], b[1] - a[1]) > 0.4) D.linha(a[0] + (b[0] - a[0]) * t[0], a[1] + (b[1] - a[1]) * t[0], a[0] + (b[0] - a[0]) * t[1], a[1] + (b[1] - a[1]) * t[1], cam || "MET-HACHURA");
    }
  }
  function hachuraMetal(D, poly, passo, cam) { hachuraDir(D, poly, passo || 2.2, cam, false); hachuraDir(D, poly, passo || 2.2, cam, true); }
  /* piso/rodapé metálico visto de perfil (fino demais para hachura): contorno + linha da dobra no meio + as duas garras nas pontas */
  function perfilMetal(D, poly) {
    var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 - x0 > 3 && y1 - y0 > 0.9) { D.linha(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, "MET-FINA"); D.linha(x0 + 0.9, y0, x0 + 0.9, y1, "MET-FINA"); D.linha(x1 - 0.9, y0, x1 - 0.9, y1, "MET-FINA"); }
  }
  function hachPiso(C, D, poly, passo) { if (C.multi) perfilMetal(D, poly); else hachuraPoli(D, poly, passo); }
  /* o NÓ do multi: roseta = disco Ø124 visto de lado/cima → círculo com cruz; estribo = laço quadrado com ponto */
  function marcaNo(D, x, y, linha, s) {
    var r = Math.max(0.6, Math.min(1.5, 0.062 * s));
    if (linha === "estribo") { D.ret(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, "MET-FINA"); D.ponto(x, y, 0.25); }
    else { D.circ(x, y, r, "MET-FINA"); D.linha(x - r, y, x + r, y, "MET-FINA"); D.linha(x, y - r, x, y + r, "MET-FINA"); }
  }
  /* base regulável do multi vista de lado: haste (rosca) + peça base até o 1º nó */
  function baseMulti(ctx, C, D, cx, b, s, V, reg) {
    var rw = 0.019 * s, rh = Math.max(num(b.h, 0.25), 0.05), yb = b.y0 + 0.008, yTopoHaste = b.y0 + rh, y1n = num((ctx.modelo.vertical || {}).y0, yTopoHaste + 0.065), r2 = 0.0242 * s;
    D.linha(cx - rw, V(yb), cx - rw, V(yTopoHaste), "MET-FINA"); D.linha(cx + rw, V(yb), cx + rw, V(yTopoHaste), "MET-FINA");
    D.linha(cx - r2, V(yTopoHaste), cx - r2, V(y1n), "MET-SECUNDARIO"); D.linha(cx + r2, V(yTopoHaste), cx + r2, V(y1n), "MET-SECUNDARIO");
    reg(C.itemPecaBase, cx, V((yTopoHaste + y1n) / 2));
  }
  /* retângulo orientado (papel): centro, direção, meio-comprimento, meia-largura */
  function retOrient(cx, cy, ux, uy, hl, hw) { var nx = -uy, ny = ux; return [[cx - ux * hl - nx * hw, cy - uy * hl - ny * hw], [cx + ux * hl - nx * hw, cy + uy * hl - ny * hw], [cx + ux * hl + nx * hw, cy + uy * hl + ny * hw], [cx - ux * hl + nx * hw, cy - uy * hl + ny * hw]]; }

  var MG = {   /* margens do bloco de cada vista (mm): esquerda, direita, topo (título), base (cotas) */
    frontal: { l: 40, r: 52, t: 25, b: 36 }, lateral: { l: 28, r: 52, t: 25, b: 36 }, planta: { l: 16, r: 36, t: 33, b: 36 }, corte: { l: 28, r: 52, t: 25, b: 36 }
  };
  function extVista(tipo, C, s) {
    var bx = C.box, m = MG[tipo], w, h;
    if (tipo === "frontal" && C.ysAnc.length < 2) m = { l: 28, r: m.r, t: m.t, b: m.b };
    if (tipo === "frontal") { w = (bx.x1 - bx.x0) * s; h = C.yMax * s; }
    else if (tipo === "lateral" || tipo === "corte") { w = (bx.z1 - bx.z0) * s; h = C.yMax * s; }
    else { w = (bx.x1 - bx.x0) * s; h = (bx.z1 - bx.z0) * s; }
    return { w: w + m.l + m.r, h: h + m.t + m.b, bw: w, bh: h, m: m };
  }

  /* registra onde há peça de cada ITEM na vista (para o balão) */
  function Vista(ctx, nome, x, y, s, o) {
    o = o || {};
    var tipo = o.tipo || nome, Cv = o.C || ctx.C, e = extVista(tipo, Cv, s);
    this.C = Cv; this.tipo = tipo; this.lat = tipo === "lateral" || tipo === "corte"; this.flip = !!o.flip; this.titulo = o.titulo || null;
    this.ctx = ctx; this.nome = nome; this.s = s; this.e = e; this.x = x; this.y = y; this.x0 = x + e.m.l; this.y0 = y + e.m.t; this.anc = {}; this.ded = new Dedup(); this.dedN = new Dedup(); this.dedE = new Dedup(); this.dedC = { fixa: new Dedup(), giratoria: new Dedup(), luva: new Dedup(), rodape: new Dedup(), prancha: new Dedup() };
    this.rect = [x, y, x + e.w, y + e.h];
  }
  Vista.prototype.reg = function (item, px, py) { if (item == null) return; (this.anc[item] = this.anc[item] || []).push([px, py]); };
  Vista.prototype.H = function (X) {
    var B = this.C.box, r = this.lat ? (this.flip ? B.z1 - X : X - B.z0) : (this.flip ? B.x1 - X : X - B.x0);
    return this.x0 + r * this.s;
  };
  Vista.prototype.V = function (yy) { return this.y0 + (this.tipo === "planta" ? (yy - this.C.box.z0) : (this.C.yMax - yy)) * this.s; };

  function desenharTitulo(ctx, v, titulo) {
    var A = AP(); A.tituloVista(ctx.D, v.x + 2, v.y, v.titulo || titulo, "ESC 1:" + Math.round(1000 / v.s));
  }

  /* ---------- elevação frontal e lateral: tubos, madeira, bases, escadas */
  function desenharElevacao(ctx, v) {
    var C = v.C, D = ctx.D, s = v.s, lat = v.lat, bx = C.box;
    function Hh(p) { return lat ? v.H(p[2]) : v.H(p[0]); }
    function Vv(p) { return v.V(p[1]); }
    var xL = v.x0, xR = v.x0 + v.e.bw, lad = v.flip ? -1 : 1;
    /* terreno */
    D.linha(xL - 6, v.V(0), xR + 6, v.V(0), "MET-PRINCIPAL");
    /* face da estrutura existente (lateral) */
    if (lat) {
      var hf = v.H(0);
      D.linha(hf, v.V(0), hf, v.V(C.yMax), "MET-OCULTA");
      D.texto(hf - 1.3 * lad, v.V(C.yMax * 0.55), "FACE DA ESTRUTURA EXISTENTE", ctx.E.T.nota * 0.9, { al: "C", rot: -90 });
    }
    /* tela de proteção (tracejada) */
    if (!lat && ctx.modelo.tela && ctx.modelo.tela.area > 0) {
      var yt0 = C.telaY ? C.telaY.y0 : C.yTopo, yt1 = C.telaY ? C.telaY.y1 : C.yTopo + num(ctx.modelo.tela.altura, 2);
      D.poli([[xL, v.V(yt0)], [xR, v.V(yt0)], [xR, v.V(yt1)], [xL, v.V(yt1)]], "MET-OCULTA", true);
      D.texto((xL + xR) / 2, v.V((yt0 + yt1) / 2), "TELA DE PROTEÇÃO", ctx.E.T.nota, { al: "C", meio: true });
      v.reg(C.itemTela, xL + (xR - xL) * 0.18, v.V(yt0 + (yt1 - yt0) * 0.3));
    }
    /* calços e bases */
    C.calcos.forEach(function (c) {
      var hl = Math.abs(lat ? c.u[1] : c.u[0]) * c.L / 2 + Math.abs(lat ? c.u[0] : c.u[1]) * c.larg / 2, cx = lat ? v.H(c.pos[2]) : v.H(c.pos[0]);
      if (!v.ded.novo(cx - hl * s, 0, cx + hl * s, 1)) return;
      var rx = cx - hl * s, ry = v.V(c.esp), w = 2 * hl * s, h = c.esp * s;
      D.ret(rx, ry, w, Math.max(h, 0.5), "MET-SECUNDARIO"); if (w > 1.5 && h > 0.7) hachuraPoli(D, [[rx, ry], [rx + w, ry], [rx + w, ry + Math.max(h, 0.5)], [rx, ry + Math.max(h, 0.5)]], 1.2);
      v.reg(c.item, cx, ry + h / 2);
    });
    C.bases.forEach(function (b) {
      var cx = Hh(b.pos), w = (C.multi ? 0.15 : 0.12) * s, y0 = b.y0, esp = 0.008;
      if (!v.ded.novo(cx, v.V(y0), cx + 1, v.V(y0))) return;
      D.ret(cx - w / 2, v.V(y0 + esp), w, Math.max(esp * s, 0.4), "MET-PRINCIPAL");
      v.reg(b.item, cx, v.V(y0 + esp / 2));
      if (C.multi) baseMulti(ctx, C, D, cx, b, s, function (yy) { return v.V(yy); }, function (it, px, py) { v.reg(it, px, py); });
    });
    /* olhal de ancoragem na face (o tubo de amarração vem na direção da vista em um dos dois cortes) */
    C.ancs.forEach(function (a) { v.reg(a.item, lat ? v.H(0) : v.H(a.pos[0]), v.V(a.y)); if (C.multi) { v.reg(C.itemChumb, lat ? v.H(0) : v.H(a.pos[0]), v.V(a.y)); v.reg(a.itemGancho, lat ? v.H(0) : v.H(a.pos[0]), v.V(a.y)); } });
    /* tubos */
    C.tubos.forEach(function (t) {
      var x1 = Hh(t.a), y1 = Vv(t.a), x2 = Hh(t.b), y2 = Vv(t.b);
      if (hip(x2 - x1, y2 - y1) < 0.4) {   /* de topo (o tubo vem na direção da vista): só o símbolo da ancoragem */
        if (t.papel === "ancoragem" && v.ded.novo(x1, y1, x1 + 0.01, y1)) { D.circ(x1, y1, 1.3, "MET-FINA"); D.linha(x1 - 2, y1, x1 + 2, y1, "MET-FINA"); D.linha(x1, y1 - 2, x1, y1 + 2, "MET-FINA"); v.reg(t.item, x1, y1); }
        return;
      }
      if (!v.ded.novo(x1, y1, x2, y2)) return;
      D.linha(x1, y1, x2, y2, "MET-SECUNDARIO");
      v.reg(t.item, (x1 + x2) / 2, (y1 + y2) / 2);
    });
    /* multi: os NÓS (roseta/estribo) nos postes e o pino trava de cada emenda */
    if (C.multi) {
      C.nos.forEach(function (nn) { var nx = Hh(nn.p), ny = Vv(nn.p); if (!v.dedN.novo(nx, ny, nx + 0.01, ny + 0.01)) return; marcaNo(D, nx, ny, C.linha, s); });
      C.espigoes.forEach(function (e) { var ex = Hh(e.pos), ey = Vv(e.pos); if (!v.dedE.novo(ex, ey, ex + 0.02, ey + 0.02)) return; D.linha(ex - 1.6, ey, ex + 1.6, ey, "MET-PRINCIPAL"); v.reg(e.item, ex, ey); });
    }
    /* madeira: pranchões (de perfil), alçapão, rodapés (hachurados) — no multi, piso e rodapé são METÁLICOS (perfil, sem a hachura da madeira) */
    C.pranchas.forEach(function (p) {
      var y1 = p.yTopo, y0 = p.yTopo - p.esp;
      if (!lat) {
        var xa = v.H(p.a[0]), xb = v.H(p.b[0]); if (xa > xb) { var tm = xa; xa = xb; xb = tm; }
        if (!v.ded.novo(xa, v.V(y1), xb, v.V(y0))) return;
        var h = Math.max(p.esp * s, 0.5); D.ret(xa, v.V(y1), xb - xa, h, "MET-SECUNDARIO"); if (h > 1.1 && xb - xa > 2) hachPiso(C, D, [[xa, v.V(y1)], [xb, v.V(y1)], [xb, v.V(y1) + h], [xa, v.V(y1) + h]], 1.2);
        v.reg(p.item, (xa + xb) / 2, v.V(y1));
      } else {
        var d = [p.b[0] - p.a[0], p.b[2] - p.a[2]], Ld = hip(d[0], d[1]) || 1, sx = -d[1] / Ld, sz = d[0] / Ld;   /* largura na direção (sx,sz) */
        var Y1 = p.a[2] - sz * p.larg / 2, Y2 = p.a[2] + sz * p.larg / 2; if (Y1 > Y2) { var t2 = Y1; Y1 = Y2; Y2 = t2; }
        var xa2 = v.H(Y1), xb2 = v.H(Y2);
        if (!v.ded.novo(xa2, v.V(y1), xb2, v.V(y0))) return;
        var h2 = Math.max(p.esp * s, 0.5); D.ret(xa2, v.V(y1), xb2 - xa2, h2, "MET-SECUNDARIO"); if (h2 > 1.1 && xb2 - xa2 > 2) hachPiso(C, D, [[xa2, v.V(y1)], [xb2, v.V(y1)], [xb2, v.V(y1) + h2], [xa2, v.V(y1) + h2]], 1.2);
        v.reg(p.item, (xa2 + xb2) / 2, v.V(y1));
      }
    });
    C.rodapes.forEach(function (r) {
      var y1 = r.yTopo, y0 = r.yTopo - r.alt;
      if (!lat) {
        var xa = v.H(r.a[0]), xb = v.H(r.b[0]); if (xa > xb) { var tm = xa; xa = xb; xb = tm; }
        if (!v.ded.novo(xa, v.V(y1), xb, v.V(y0)) || xb - xa < 0.5) return;
        D.ret(xa, v.V(y1), xb - xa, r.alt * s, "MET-SECUNDARIO"); hachPiso(C, D, [[xa, v.V(y1)], [xb, v.V(y1)], [xb, v.V(y0)], [xa, v.V(y0)]], 1.4);
        v.reg(r.item, (xa + xb) / 2, (v.V(y1) + v.V(y0)) / 2);
      } else {
        var cx = v.H((r.a[2] + r.b[2]) / 2);
        if (!v.ded.novo(cx, v.V(y1), cx + 0.5, v.V(y0))) return;
        var dxr = Math.abs(r.b[2] - r.a[2]) * s;
        if (dxr > 0.6) { D.ret(Math.min(v.H(r.a[2]), v.H(r.b[2])), v.V(y1), dxr, r.alt * s, "MET-SECUNDARIO"); }
        else { D.linha(cx, v.V(y1), cx, v.V(y0), "MET-PRINCIPAL"); }
        v.reg(r.item, cx, (v.V(y1) + v.V(y0)) / 2);
      }
    });
    /* escadas (E9): a de mão é INCLINADA no sentido do andaime (vista de frente é uma linha inclinada com os degraus; de lado são os dois banzos); o marinheiro e o lance coletivo idem */
    C.acessos.forEach(function (a) {
      var hw = a.larg * s / 2, x1 = Hh(a.a), x2 = Hh(a.b), yA = Vv(a.a), yB = Vv(a.b), ne = Math.max(2, a.nDegraus || Math.floor(Math.abs(a.b[1] - a.a[1]) / 0.275)), q, f;
      if (!v.ded.novo(Math.min(x1, x2) - hw, Math.min(yA, yB), Math.max(x1, x2) + hw, Math.max(yA, yB) + 0.01 * (a.lance || 0))) return;
      var cam = a.torre ? "MET-SECUNDARIO" : "MET-SECUNDARIO";
      var leanX = Math.abs(a.b[0] - a.a[0]) > Math.abs(a.b[2] - a.a[2]);   /* a escada se inclina ao longo do andaime (X) ou através da largura (Z)? Só na vista em que a inclinação aparece vê-se UMA linha */
      if (lat ? !leanX : leanX) {   /* a inclinação aparece: a largura é a profundidade; vê-se UMA linha (os dois banzos coincidem) e a marca dos degraus perpendicular a ela */
        D.linha(x1, yA, x2, yB, cam);
        var dxs = x2 - x1, dys = yB - yA, Ls = hip(dxs, dys) || 1, nx = -dys / Ls, ny = dxs / Ls;
        for (q = 1; q < ne; q++) { f = q / ne; D.linha(x1 + dxs * f - nx * 1.2, yA + dys * f - ny * 1.2, x1 + dxs * f + nx * 1.2, yA + dys * f + ny * 1.2, "MET-FINA"); }
      } else {      /* de lado: os dois banzos (verticais, a escada se inclina para dentro da folha) e os degraus */
        var cxm = (x1 + x2) / 2;
        D.linha(cxm - hw, yA, cxm - hw, yB, cam); D.linha(cxm + hw, yA, cxm + hw, yB, cam);
        for (q = 1; q < ne; q++) { f = q / ne; D.linha(cxm - hw, yA + (yB - yA) * f, cxm + hw, yA + (yB - yA) * f, "MET-FINA"); }
        x1 = cxm; x2 = cxm;
      }
      v.reg(a.item, (x1 + x2) / 2 + (lat ? hw : 0), (yA + yB) / 2);
    });
    /* braçadeiras e luvas: pontos no nó (1 por nó visível) */
    C.conexoes.forEach(function (c) {
      var x1 = Hh(c.pos), y1 = Vv(c.pos);
      var dc = v.dedC[c.tipo]; if (!dc || !dc.novo(x1, y1, x1 + 0.01, y1 + 0.01)) return;
      if (c.tipo === "fixa") D.ponto(x1, y1, 0.5);
      else if (c.tipo === "giratoria") D.circ(x1, y1, 0.9, "MET-FINA");
      else if (c.tipo === "luva") D.ret(x1 - 0.9, y1 - 1.5, 1.8, 3, "MET-PRINCIPAL");
      v.reg(c.item, x1, y1);
    });
    /* ---- cotas ---- */
    var iCota = D.sg.length; cotasElevacao(ctx, v); v.cotaSg = D.sg.slice(iCota);
    desenharTitulo(ctx, v, lat ? "ELEVAÇÃO LATERAL" : "ELEVAÇÃO FRONTAL");
  }


  function cotasElevacao(ctx, v) {
    var C = v.C, D = ctx.D, lat = v.lat, par = C.par, s = v.s, yB = v.V(0), xL = v.x0, xR = v.x0 + v.e.bw;
    if (!lat) {
      /* vãos entre os eixos dos montantes + total (embaixo) */
      var xs = v.flip ? C.xsPostes.slice().reverse() : C.xsPostes;
      if (xs.length > 1) {
        var pts = xs.map(function (X) { return [v.H(X), yB]; }), tx = [], i;
        for (i = 0; i + 1 < xs.length; i++) tx.push(mmTxt(Math.abs(xs[i + 1] - xs[i])));
        D.cadeia(pts, -22, tx, { attrs: tx.map(function () { return ' data-cota="vao"'; }) });
        D.cota(v.H(xs[0]), yB, v.H(xs[xs.length - 1]), yB, -31, mmTxt(Math.abs(xs[xs.length - 1] - xs[0])), { attrs: [' data-cota="comprimento"'] });
      }
    } else {
      /* largura: face → eixo interno → eixo externo (embaixo) */
      var ys = [0].concat(C.ysPostes.filter(function (Y) { return Y > 0.001; })); if (v.flip) ys = ys.slice().reverse();
      if (ys.length > 1) {
        var pl = ys.map(function (Y) { return [v.H(Y), yB]; }), tl = [];
        for (var k = 0; k + 1 < ys.length; k++) tl.push(mmTxt(Math.abs(ys[k + 1] - ys[k])));
        D.cadeia(pl, -22, tl, { attrs: tl.map(function () { return ' data-cota="largura"'; }) });
        D.cota(v.H(ys[0]), yB, v.H(ys[ys.length - 1]), yB, -31, mmTxt(Math.abs(ys[ys.length - 1] - ys[0])), { attrs: [' data-cota="afastamento-largura"'] });
      }
    }
    /* levantes (à esquerda) */
    var yp = C.yPisos, P = [[xL, yB]].concat(yp.map(function (y) { return [xL, v.V(y)]; })), tv = [], j;
    for (j = 0; j < yp.length; j++) tv.push(mmTxt(yp[j] - (j ? yp[j - 1] : 0)));
    D.cadeia(P, 22, tv, { attrs: tv.map(function () { return ' data-cota="levante"'; }) });
    /* malha de ancoragem na vertical (mais à esquerda) — níveis das ancoragens */
    if (!lat && C.ysAnc.length > 1) {
      var ya = [0].concat(C.ysAnc), pa = ya.map(function (y) { return [xL, v.V(y)]; }), ta = [];
      for (j = 0; j + 1 < ya.length; j++) ta.push(mmTxt(ya[j + 1] - ya[j]));
      D.cadeia(pa, 33, ta, { attrs: ta.map(function () { return ' data-cota="malha-v"'; }) });
    }
    /* guarda-corpo, intermediário e rodapé (à direita), medidos do piso do topo */
    var yT = C.yTopo, g = C.gd.g, it = C.gd.it, rd = C.gd.rd;
    D.cota(xR, v.V(yT), xR, v.V(yT + rd), -20, mmTxt(rd), { attrs: [' data-cota="rodape"'] });
    D.cota(xR, v.V(yT), xR, v.V(yT + it), -27, mmTxt(it), { attrs: [' data-cota="intermediario"'] });
    D.cota(xR, v.V(yT), xR, v.V(yT + g), -34, mmTxt(g), { attrs: [' data-cota="guarda-corpo"'] });
    /* níveis em m */
    var xN = xR + 39, niv = [0].concat(C.multi && num((C.modelo.vertical || {}).y0, 0) > 0.01 ? [num(C.modelo.vertical.y0, 0)] : []).concat(yp).concat([yT + g]);
    niv.forEach(function (y) { D.linha(xR + 2, v.V(y), xN, v.V(y), "MET-FINA"); D.nivel(xN, v.V(y), nivelTxt(y), 1); });
  }

  /* ---------- planta baixa do piso de trabalho */
  function desenharPlanta(ctx, v) {
    var C = v.C, D = ctx.D, s = v.s, bx = C.box;
    var nTop = -1; C.tubos.forEach(function (t) { if (!t.torre && isFinite(t.nivel) && t.nivel > nTop) nTop = t.nivel; });
    function H(p) { return v.H(p[0]); } function Vp(p) { return v.V(p[2]); }
    /* face da estrutura existente (tracejada) */
    var face = C.face.map(function (q) { return [v.H(q[0]), v.V(q[1])]; });
    D.poli(face, "MET-OCULTA", C.faceFechada);
    D.texto(face[0][0] - 1.6, face[0][1], "FACE", ctx.E.T.nota * 0.9, { al: "D", meio: true });   /* a face existente (tracejada): o nome inteiro está na elevação lateral */
    /* pisos (madeira hachurada) */
    C.pranchas.forEach(function (p) {
      if (p.nivel !== nTop || p.patamar) return;
      var ax = v.H(p.a[0]), ay = v.V(p.a[2]), bxp = v.H(p.b[0]), byp = v.V(p.b[2]), L = hip(bxp - ax, byp - ay); if (L < 0.5) return;
      var ux = (bxp - ax) / L, uy = (byp - ay) / L, poly = retOrient((ax + bxp) / 2, (ay + byp) / 2, ux, uy, L / 2, p.larg * s / 2);
      D.poli(poly, "MET-SECUNDARIO", true);
      if (p.tipo === "alcapao") { D.linha(poly[0][0], poly[0][1], poly[2][0], poly[2][1], "MET-FINA"); D.linha(poly[1][0], poly[1][1], poly[3][0], poly[3][1], "MET-FINA"); }
      else if (C.multi) hachuraMetal(D, poly, 2.2);
      else hachuraPoli(D, poly, 1.6);
      v.reg(p.item, (ax + bxp) / 2, (ay + byp) / 2);
    });
    /* tubos horizontais do nível do piso de trabalho e ancoragens */
    C.tubos.forEach(function (t) {
      if (t.papel === "montante" || t.papel === "diagonal" || t.papel === "diagonalTransv") return;
      if (t.nivel !== nTop) return;
      var x1 = H(t.a), y1 = Vp(t.a), x2 = H(t.b), y2 = Vp(t.b); if (hip(x2 - x1, y2 - y1) < 0.4 || !v.ded.novo(x1, y1, x2, y2)) return;
      D.linha(x1, y1, x2, y2, "MET-SECUNDARIO"); v.reg(t.item, (x1 + x2) / 2, (y1 + y2) / 2);
    });
    /* rodapés (traço grosso) */
    C.rodapes.forEach(function (r) {
      if (r.nivel !== nTop) return;
      var x1 = v.H(r.a[0]), y1 = v.V(r.a[2]), x2 = v.H(r.b[0]), y2 = v.V(r.b[2]); if (hip(x2 - x1, y2 - y1) < 0.4 || !v.ded.novo(x1, y1, x2, y2)) return;
      D.linha(x1, y1, x2, y2, "MET-PRINCIPAL"); v.reg(r.item, (x1 + x2) / 2, (y1 + y2) / 2);
    });
    /* montantes cortados (círculo cheio) */
    C.tubos.forEach(function (t) {
      if (t.papel !== "montante") return;
      var cx = H(t.a), cy = Vp(t.a); if (!v.ded.novo(cx, cy, cx + 0.01, cy)) return;
      var r = Math.max(0.0241 * s, 0.55); D.circ(cx, cy, r, "MET-PRINCIPAL"); D.ponto(cx, cy, r * 0.8); v.reg(t.item, cx, cy);
      if (C.multi) D.circ(cx, cy, Math.max(0.062 * s, r + 0.5), "MET-FINA");   /* o disco da roseta (Ø124) em volta do poste */
    });
    /* multi: o gancho de ancoragem (tubo curto do poste até a face), em qualquer nível */
    if (C.multi) C.tubos.forEach(function (t) {
      if (t.papel0 !== "ancoragem") return;
      var x1 = H(t.a), y1 = Vp(t.a), x2 = H(t.b), y2 = Vp(t.b); if (hip(x2 - x1, y2 - y1) < 0.4 || !v.ded.novo(x1, y1, x2, y2)) return;
      D.linha(x1, y1, x2, y2, "MET-PRINCIPAL"); v.reg(t.item, (x1 + x2) / 2, (y1 + y2) / 2);
      D.ret(x1 - 1.3, y1 - 1.3, 2.6, 2.6, "MET-FINA"); v.reg(C.itemAbrac, x1, y1);   /* abraçadeira fixa no poste */
    });
    /* escadas de acesso: a pegada de cada lance (a inclinada vista de cima é um retângulo com o sentido de subida); os lances de baixo, tracejados */
    C.acessos.forEach(function (a) {
      if (a.torre && a.nivel !== nTop && a.nivel !== nTop - 1) return;
      var x1 = H(a.a), y1 = Vp(a.a), x2 = H(a.b), y2 = Vp(a.b), L = hip(x2 - x1, y2 - y1), hw = a.larg * s / 2;
      if (!v.ded.novo(x1, y1, x2 + 0.05, y2)) return;
      if (a.tipo === "marinheiro" || L < 0.8) { D.ret(x1 - hw, y1 - 0.6, 2 * hw, 1.2, "MET-SECUNDARIO"); v.reg(a.item, x1, y1); return; }
      var ux = (x2 - x1) / L, uy = (y2 - y1) / L, poly = retOrient((x1 + x2) / 2, (y1 + y2) / 2, ux, uy, L / 2, hw), cima = a.nivel === nTop;
      D.poli(poly, cima ? "MET-SECUNDARIO" : "MET-OCULTA", true);
      if (cima) { D.linha(x1, y1, x2, y2, "MET-FINA"); D.linha(x2, y2, x2 - ux * 2.2 - uy * 1.1, y2 - uy * 2.2 + ux * 1.1, "MET-FINA"); D.linha(x2, y2, x2 - ux * 2.2 + uy * 1.1, y2 - uy * 2.2 - ux * 1.1, "MET-FINA"); v.reg(a.item, (x1 + x2) / 2, (y1 + y2) / 2); }
    });
    /* ancoragens: olhal na parede */
    C.ancs.forEach(function (a) {
      var cx = v.H(a.pos[0]), cy = v.V(a.pos[2]); if (!v.ded.novo(cx, cy, cx + 0.07, cy)) return;
      D.circ(cx, cy, 1.3, "MET-FINA"); D.linha(cx - 2, cy, cx + 2, cy, "MET-FINA"); D.linha(cx, cy - 2, cx, cy + 2, "MET-FINA"); v.reg(a.item, cx, cy); if (C.multi) v.reg(C.itemChumb, cx, cy);
    });
    /* cotas: vãos (embaixo), malha de ancoragem (em cima), afastamento e largura (à direita) */
    var iCota = D.sg.length, xs = C.xsPostes, yB = v.V(bx.z1), xR = v.x0 + v.e.bw, yT = v.V(bx.z0);
    if (xs.length > 1) {
      var pts = xs.map(function (X) { return [v.H(X), yB]; }), tx = [], i;
      for (i = 0; i + 1 < xs.length; i++) tx.push(mmTxt(xs[i + 1] - xs[i]));
      D.cadeia(pts, -22, tx, { attrs: tx.map(function () { return ' data-cota="vao"'; }) });
      D.cota(v.H(xs[0]), yB, v.H(xs[xs.length - 1]), yB, -31, mmTxt(xs[xs.length - 1] - xs[0]), { attrs: [' data-cota="comprimento"'] });
    }
    if (C.xsAnc.length > 1) {
      var pa = C.xsAnc.map(function (X) { return [v.H(X), yT]; }), ta = [];
      for (i = 0; i + 1 < C.xsAnc.length; i++) ta.push(mmTxt(C.xsAnc[i + 1] - C.xsAnc[i]));
      D.cadeia(pa, 17, ta, { attrs: ta.map(function () { return ' data-cota="malha-h"'; }) });
    }
    var ys = [0].concat(C.ysPostes.filter(function (Y) { return Y > 0.001; }));
    if (ys.length > 1) {
      var py = ys.map(function (Y) { return [xR, v.V(Y)]; }), ty = [];
      for (i = 0; i + 1 < ys.length; i++) ty.push(mmTxt(ys[i + 1] - ys[i]));
      D.cadeia(py, 20, ty, { attrs: ty.map(function () { return ' data-cota="largura"'; }) });
      D.cota(xR, v.V(ys[0]), xR, v.V(ys[ys.length - 1]), 29, mmTxt(ys[ys.length - 1] - ys[0]), { attrs: [' data-cota="afastamento-largura"'] });
    }
    v.cotaSg = D.sg.slice(iCota);
    desenharTitulo(ctx, v, "PLANTA BAIXA - PISO " + nivelTxt(C.yTopo));
  }

  /* ================================================================ BALÕES DE ITEM (um por tipo de peça), FORA DO DESENHO
   * Cada balão fica na FAIXA de 12 mm entre o desenho e as cadeias de cota, do lado MAIS PRÓXIMO da peça, com a chamada curta (≤ 45 mm).
   * A chamada nunca cruza outra chamada, nem cota (cadeia, linha de chamada de cota, nível), nem texto, nem outro balão.
   * Por quê: balões soltos no meio do desenho faziam chamadas longas que atravessavam o conjunto e se cruzavam (achado da conferência, 27/10/2026). */
  function interseccao(a, b, c, d) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 * o2 < -1e-9 && o3 * o4 < -1e-9;
  }
  function distPontoSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return hip(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
  }
  var LADOS = ["esq", "dir", "topo", "base"];
  function colocarBaloes(ctx) {
    var D = ctx.D, A = AP(), itens = ctx.lista.map(function (l) { return l.item; }), colocados = {}, falta = [], R = D.raioBalao("88"), MAXC = 45, balaoPos = [], chamadas = [], MAXCV = MAXC;
    var Dp = A.Desenho.prototype;
    /* candidatos (vista, âncora, lado) por item, do mais curto para o mais longo */
    function candidatos(item) {
      var out = [];
      ctx.vistas.forEach(function (v) {
        var bx = [v.x0, v.y0, v.x0 + v.e.bw, v.y0 + v.e.bh];
        arr(v.anc[item]).forEach(function (p) {
          var d = { esq: p[0] - bx[0], dir: bx[2] - p[0], topo: p[1] - bx[1], base: bx[3] - p[1] };
          LADOS.forEach(function (ld) { if (d[ld] >= -0.5 && d[ld] <= (v.tipo === "iso" ? 420 : MAXC) - R) out.push({ v: v, p: p, lado: ld, len: Math.max(0, d[ld]) }); });
        });
      });
      out.sort(function (a, b) { return a.len - b.len; });
      return out.slice(0, 60);
    }
    function tenta(item, c) {
      var v = c.v, p = c.p, bx = [v.x0, v.y0, v.x0 + v.e.bw, v.y0 + v.e.bh], vert = c.lado === "esq" || c.lado === "dir";
      var fixo = c.lado === "esq" ? bx[0] - 6 : (c.lado === "dir" ? bx[2] + 6 : (c.lado === "topo" ? bx[1] - 6 : bx[3] + 6)), ideal = vert ? p[1] : p[0];
      var raio = v.tipo === "iso" ? 420 : 70, loc = { sg: [], tb: [] }, k;
      for (k = 0; k < D.sg.length; k++) { var g = D.sg[k]; if (Math.max(g[0], g[2]) >= p[0] - raio && Math.min(g[0], g[2]) <= p[0] + raio && Math.max(g[1], g[3]) >= p[1] - raio && Math.min(g[1], g[3]) <= p[1] + raio) loc.sg.push(g); }
      for (k = 0; k < D.tb.length; k++) { var tb = D.tb[k]; if (tb[2] >= p[0] - raio && tb[0] <= p[0] + raio && tb[3] >= p[1] - raio && tb[1] <= p[1] + raio) loc.tb.push(tb); }
      var cotas = arr(v.cotaSg);
      for (var dl = 0; dl <= 60; dl += 1.5) for (var sg = (dl ? -1 : 1); sg <= 1; sg += 2) {
        var cc = ideal + dl * sg, cx = vert ? fixo : cc, cy = vert ? cc : fixo;
        if (cx - R < v.rect[0] + 0.5 || cx + R > v.rect[2] - 0.5 || cy - R < v.rect[1] + 12 || cy + R > v.rect[3] - 0.5) continue;
        /* o leader: da borda do balão até o ponto da peça */
        var dx = p[0] - cx, dy = p[1] - cy, L = hip(dx, dy); if (L < R + 0.3) continue;
        var e = [cx + dx / L * R, cy + dy / L * R];
        if (hip(p[0] - e[0], p[1] - e[1]) > (v.tipo === "iso" ? 420 : MAXC)) continue;
        if (!Dp.livre.call(loc, [cx - R, cy - R, cx + R, cy + R], 0.5)) continue;
        if (Dp.cortaTexto.call(loc, e[0], e[1], p[0], p[1])) continue;
        var bad = false, q;
        for (q = 0; q < chamadas.length && !bad; q++) if (interseccao(e, p, chamadas[q][0], chamadas[q][1])) bad = true;
        for (q = 0; q < cotas.length && !bad; q++) if (interseccao(e, p, [cotas[q][0], cotas[q][1]], [cotas[q][2], cotas[q][3]])) bad = true;
        for (q = 0; q < balaoPos.length && !bad; q++) if (distPontoSeg(balaoPos[q], e, p) < R + 0.8) bad = true;
        if (bad) continue;
        D.balao(cx, cy, String(item), ' data-item="' + item + '"');
        D.linha(e[0], e[1], p[0], p[1], "MET-FINA", ' data-chamada="' + item + '"'); D.ponto(p[0], p[1], 0.45);
        chamadas.push([e, p]); balaoPos.push([cx, cy]);
        return true;
      }
      return false;
    }
    [45, 85, 420].forEach(function (mx) {
      MAXC = mx;
      itens.forEach(function (it) {
        if (colocados[it]) return;
        var cs = candidatos(it);
        for (var i = 0; i < cs.length; i++) if (tenta(it, cs[i])) { colocados[it] = cs[i].v.nome; return; }
      });
    });
    itens.forEach(function (it) { if (!colocados[it]) falta.push(it); });
    ctx.baloes = colocados; ctx.semBalao = falta;
  }
  /* ================================================================ ISOMÉTRICO EM ARAME (com remoção de linhas ocultas)
   * escala livre: encaixa no retângulo [x, y, w, h]. Devolve { escala (mm/m), segmentos } e escreve no desenho. */
  var R_TUBO = 0.02415;   /* raio do tubo Ø48,3 (m) */
  function geometriaIso(C, pr) {
    var segs = [], occ3 = [], dd = new Dedup3();
    function seg(a, b, cam, r, dono, attr) { if (dd.novo(a, b)) segs.push({ a3: a, b3: b, cam: cam, r: r || 0, dono: dono, attr: attr || "" }); }
    C.tubos.forEach(function (t) { seg(t.a, t.b, "MET-SECUNDARIO", R_TUBO, "T" + t.id); occ3.push({ tipo: "tubo", a: t.a, b: t.b, r: R_TUBO, dono: "T" + t.id }); });
    function caixa(c, d, hl, hw, hh, dono, hach) {
      var fv = facesVisiveis(c, d, hl, hw, hh, pr);
      fv.forEach(function (q) { for (var i = 0; i < 4; i++) seg(q[i], q[(i + 1) % 4], "MET-SECUNDARIO", 0, dono); occ3.push({ tipo: "face", q: q, dono: dono }); });
      return fv;
    }
    C.pranchas.forEach(function (p) {
      var dx = p.b[0] - p.a[0], dz = p.b[2] - p.a[2], L = hip(dx, dz); if (L < 1e-6) return;
      var d = [dx / L, dz / L], c = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2], dono = "P" + p.id;
      caixa(c, d, L / 2, p.larg / 2, p.esp / 2, dono);
      if (p.tipo === "alcapao") return;
      /* hachura na face de cima: linhas na largura, passo ~ 2 mm de papel (calculado depois pela escala: guarda o necessário) */
      segs.push({ hach: true, c: c, d: d, hl: L / 2, hw: p.larg / 2, yTop: p.yTopo, dono: dono, cruz: !!C.multi });
    });
    C.rodapes.forEach(function (r) {
      var dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2], L = hip(dx, dz); if (L < 1e-6) return;
      var d = [dx / L, dz / L], c = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2];
      caixa(c, d, L / 2, r.esp / 2, r.alt / 2, "R" + r.id);
    });
    C.calcos.forEach(function (c) { var d = hip(c.u[0], c.u[1]) > 0 ? [c.u[0] / hip(c.u[0], c.u[1]), c.u[1] / hip(c.u[0], c.u[1])] : [1, 0]; caixa([c.pos[0], c.esp / 2, c.pos[2]], d, c.L / 2, c.larg / 2, c.esp / 2, "C" + c.id); });
    C.bases.forEach(function (b) { caixa([b.pos[0], b.y0 + 0.004, b.pos[2]], [1, 0], 0.06, 0.06, 0.004, "B" + b.id); });
    C.acessos.forEach(function (a) {
      var hw = a.larg / 2, ux = 1, uz = 0;
      if (a.u && hip(a.u[0], a.u[1]) > 0) { ux = a.u[0] / hip(a.u[0], a.u[1]); uz = a.u[1] / hip(a.u[0], a.u[1]); }
      var A1 = [a.a[0] - ux * hw, a.a[1], a.a[2] - uz * hw], A2 = [a.a[0] + ux * hw, a.a[1], a.a[2] + uz * hw], B1 = [a.b[0] - ux * hw, a.b[1], a.b[2] - uz * hw], B2 = [a.b[0] + ux * hw, a.b[1], a.b[2] + uz * hw];
      var dono = "E" + a.id; seg(A1, B1, "MET-SECUNDARIO", 0.016, dono); seg(A2, B2, "MET-SECUNDARIO", 0.016, dono);
      var ne = Math.max(2, Math.floor(Math.abs(a.b[1] - a.a[1]) / 0.275));
      for (var q = 1; q < ne; q++) { var t = q / ne; seg([A1[0] + (B1[0] - A1[0]) * t, A1[1] + (B1[1] - A1[1]) * t, A1[2] + (B1[2] - A1[2]) * t], [A2[0] + (B2[0] - A2[0]) * t, A2[1] + (B2[1] - A2[1]) * t, A2[2] + (B2[2] - A2[2]) * t], "MET-FINA", 0, dono); }
    });
    return { segs: segs, occ3: occ3 };
  }
  function Dedup3() { this.k = {}; }
  Dedup3.prototype.novo = function (a, b) {
    function r(p) { return Math.round(p[0] * 1000) + "," + Math.round(p[1] * 1000) + "," + Math.round(p[2] * 1000); }
    var ka = r(a), kb = r(b), key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
    if (this.k[key]) return false; this.k[key] = 1; return true;
  };
  function desenharIso(ctx, x, y, w, h, titulo, opcoes) {
    opcoes = opcoes || {};
    var C = ctx.C, D = ctx.D, el = Math.atan(1 / Math.SQRT2), pr = projIso(el, false), G = geometriaIso(C, pr);
    /* limites em m de tela */
    var mx0 = 1e9, mx1 = -1e9, my0 = 1e9, my1 = -1e9;
    function lim(p3) { var q = pr(p3); mx0 = Math.min(mx0, q[0]); mx1 = Math.max(mx1, q[0]); my0 = Math.min(my0, q[1]); my1 = Math.max(my1, q[1]); }
    G.segs.forEach(function (sg) { if (sg.hach) return; lim(sg.a3); lim(sg.b3); });
    if (!isFinite(mx0)) return { escala: 0 };
    var hT = AP().tituloVista(D, x + 2, y, titulo || "ISOMÉTRICO", opcoes.escalaTxt || "SEM ESCALA"), pad = opcoes.pad || 6;
    var aw = w - 2 * pad, ah = h - hT - 2 * pad, s = Math.min(aw / Math.max(1e-6, mx1 - mx0), ah / Math.max(1e-6, my1 - my0));
    var ox = x + pad + (aw - (mx1 - mx0) * s) / 2 - mx0 * s, oy = y + hT + pad + (ah - (my1 - my0) * s) / 2 + my1 * s;   /* papel = (ox + xs*s, oy − ys*s) */
    /* hachura da madeira com passo de ~2 mm */
    var segs = [];
    G.segs.forEach(function (sg) {
      if (!sg.hach) { segs.push({ a: pr(sg.a3), b: pr(sg.b3), r: sg.r, dono: sg.dono, cam: sg.cam, attr: "" }); return; }
      var passo = Math.max(2.0, 1.0) / s, nL = Math.max(1, Math.floor(2 * sg.hl / passo)), sx = -sg.d[1], sz = sg.d[0];
      for (var i = 1; i < nL; i++) {
        var t = -sg.hl + 2 * sg.hl * i / nL, px = sg.c[0] + sg.d[0] * t, pz = sg.c[2] + sg.d[1] * t;
        segs.push({ a: pr([px - sx * sg.hw, sg.yTop, pz - sz * sg.hw]), b: pr([px + sx * sg.hw, sg.yTop, pz + sz * sg.hw]), r: 0, dono: sg.dono, cam: "MET-HACHURA", attr: "" });
      }
      if (sg.cruz) {   /* piso metálico: também as linhas ao longo do comprimento (grelha), no passo da largura/3 */
        var nW = 3;
        for (var iw = 1; iw < nW; iw++) {
          var tw = -sg.hw + 2 * sg.hw * iw / nW;
          segs.push({ a: pr([sg.c[0] - sg.d[0] * sg.hl + sx * tw, sg.yTop, sg.c[2] - sg.d[1] * sg.hl + sz * tw]), b: pr([sg.c[0] + sg.d[0] * sg.hl + sx * tw, sg.yTop, sg.c[2] + sg.d[1] * sg.hl + sz * tw]), r: 0, dono: sg.dono, cam: "MET-HACHURA", attr: "" });
        }
      }
    });
    var folga = 1.0, occ = [];
    G.occ3.forEach(function (o) {
      if (o.tipo === "tubo") occ.push(oclusorTubo(pr(o.a), pr(o.b), o.r, s, folga, o.dono));
      else { var f = oclusorFace(o.q.map(pr), s, folga, o.dono); if (f) occ.push(f); }
    });
    var vis = ocultarSegmentos(segs, occ, s, folga);
    /* balões do isométrico (E10): cada peça visível registra âncoras no isométrico para o colocarBaloes */
    var vIso = null;
    if (opcoes.vista) { vIso = { nome: "iso", tipo: "iso", x0: x, y0: y + hT, e: { bw: w, bh: h - hT }, rect: [x, y, x + w, y + h], anc: {}, cotaSg: [], s: 1, x: x, y: y }; }
    var donoItem = {};
    C.tubos.forEach(function (t) { donoItem["T" + t.id] = t.item; }); C.pranchas.forEach(function (t) { donoItem["P" + t.id] = t.item; }); C.rodapes.forEach(function (t) { donoItem["R" + t.id] = t.item; });
    C.calcos.forEach(function (t) { donoItem["C" + t.id] = t.item; }); C.bases.forEach(function (t) { donoItem["B" + t.id] = t.item; }); C.acessos.forEach(function (t) { donoItem["E" + t.id] = t.item; });
    var bb = [1e9, 1e9, -1e9, -1e9];
    vis.forEach(function (l) {
      D.linha(ox + l.x1, oy + l.y1, ox + l.x2, oy + l.y2, l.cam);
      bb[0] = Math.min(bb[0], ox + l.x1, ox + l.x2); bb[1] = Math.min(bb[1], oy + l.y1, oy + l.y2); bb[2] = Math.max(bb[2], ox + l.x1, ox + l.x2); bb[3] = Math.max(bb[3], oy + l.y1, oy + l.y2);
      if (vIso && l.dono && donoItem[l.dono] != null && hip(l.x2 - l.x1, l.y2 - l.y1) > 3) { var it = donoItem[l.dono], lst = vIso.anc[it] = vIso.anc[it] || []; if (lst.length < 6) lst.push([ox + (l.x1 + l.x2) / 2, oy + (l.y1 + l.y2) / 2]); }
    });
    if (vIso && isFinite(bb[0])) { vIso.x0 = bb[0]; vIso.y0 = bb[1]; vIso.e = { bw: bb[2] - bb[0], bh: bb[3] - bb[1] }; }   /* o desenho real: os balões ficam FORA dele, na margem do bloco */
    if (vIso && ctx.vistas) ctx.vistas.push(vIso);
    return { escala: s, folga: folga, ocupacao: ((mx1 - mx0) * s * (my1 - my0) * s) / Math.max(1, w * h), segmentos: vis.length, total: segs.length, retangulo: [x, y, x + w, y + h] };
  }

  /* ================================================================ DETALHES TÍPICOS (a partir das cotas das famílias)
   * Cada detalhe é um ESQUEMA com as cotas reais (mm) da peça de catálogo, na escala dita no título (1:5 ou 1:10). */
  function Det(ctx, x, y, w, h, k, ext) {
    this.ctx = ctx; this.D = ctx.D; this.T = ctx.E.T; this.x = x; this.y = y; this.w = w; this.h = h; this.k = k;
    ext = ext || [[-100, 100], [-100, 100]];   /* extensão real (mm) do desenho: o detalhe é centrado na célula (menos a faixa da nota, embaixo) */
    this.ox = x + w / 2 - (ext[0][0] + ext[0][1]) / 2 * k; this.oy = y + (h - 14) / 2 + (ext[1][0] + ext[1][1]) / 2 * k;
  }
  Det.prototype.X = function (xr) { return this.ox + xr * this.k; };
  Det.prototype.Y = function (yr) { return this.oy - yr * this.k; };
  Det.prototype.linha = function (x1, y1, x2, y2, cam) { this.D.linha(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2), cam || "MET-SECUNDARIO"); };
  Det.prototype.ret = function (x1, y1, x2, y2, cam) { var X1 = this.X(Math.min(x1, x2)), X2 = this.X(Math.max(x1, x2)), Y1 = this.Y(Math.max(y1, y2)), Y2 = this.Y(Math.min(y1, y2)); this.D.ret(X1, Y1, X2 - X1, Y2 - Y1, cam || "MET-SECUNDARIO"); return [[X1, Y1], [X2, Y1], [X2, Y2], [X1, Y2]]; };
  Det.prototype.hach = function (poly, passo) { hachuraPoli(this.D, poly, passo || 1.6); };
  Det.prototype.tuboV = function (cx, y0, y1, d, cam) { this.linha(cx - d / 2, y0, cx - d / 2, y1, cam); this.linha(cx + d / 2, y0, cx + d / 2, y1, cam); };
  Det.prototype.tuboH = function (x0, x1, cy, d, cam) { this.linha(x0, cy - d / 2, x1, cy - d / 2, cam); this.linha(x0, cy + d / 2, x1, cy + d / 2, cam); };
  Det.prototype.secao = function (cx, cy, d, parede) { this.D.circ(this.X(cx), this.Y(cy), d / 2 * this.k, "MET-PRINCIPAL"); this.D.circ(this.X(cx), this.Y(cy), (d / 2 - parede) * this.k, "MET-SECUNDARIO"); };
  Det.prototype.cotaH = function (x1, x2, yr, off, txt) { this.D.cota(this.X(x1), this.Y(yr), this.X(x2), this.Y(yr), off, txt, {}); };
  Det.prototype.cotaV = function (xr, y1, y2, off, txt) { this.D.cota(this.X(xr), this.Y(y1), this.X(xr), this.Y(y2), off, txt, {}); };
  Det.prototype.marca = function (xr, yr, tx, ty, linhas) { this.D.chamada(this.X(xr), this.Y(yr), this.X(tx), this.Y(ty), linhas, { alternativas: [[this.X(tx), this.Y(ty) - 8], [this.X(tx), this.Y(ty) + 8]] }); };
  Det.prototype.nota = function (linhas) { this.D.textos(this.x + 3, this.y + this.h - 9.5, linhas, this.T.nota * 0.9, { wmax: this.w - 6 }); };

  function numLinha(par, chave, padrao) { return num(par[chave], padrao); }
  var DET_TUBO_D = 48.3;
  function detNo(det) {   /* DET. 1 — nó de 3: montante × longitudinal × transversal (abraçadeiras fixas) */
    var d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), t = cotaF("ra-andaime-tubo", "parede", 3), dist = cotaF("ra-andaime-abracadeira-fixa", "distanciaEixosTubos", 54), bw = cotaF("ra-andaime-abracadeira-fixa", "larguraCalhaAoLongoDoTubo_forjada", 37);
    var chapa = cotaF("ra-andaime-abracadeira-fixa", "espessuraChapaCorpo", 5), nutS = cotaF("ra-andaime-abracadeira-fixa", "porcaChave", 22), nutH = cotaF("ra-andaime-abracadeira-fixa", "porcaAltura", 11);
    var yL = 0, yT = bw + 6, e = d / 2;
    /* montante (atrás): linhas interrompidas onde a longitudinal passa na frente */
    det.linha(-e, -110, -e, yL - e, "MET-SECUNDARIO"); det.linha(e, -110, e, yL - e, "MET-SECUNDARIO");
    det.linha(-e, yL + e, -e, 130, "MET-SECUNDARIO"); det.linha(e, yL + e, e, 130, "MET-SECUNDARIO");
    /* longitudinal (na frente, a `dist` do montante) */
    det.tuboH(-105, 105, yL, d, "MET-SECUNDARIO");
    /* transversal vista de topo (círculo) ao lado do montante, na altura da 2ª abraçadeira */
    det.secao(dist + e - 2, yT, d, t);
    /* abraçadeiras fixas: calha em volta do montante (37 de largura) com as porcas do parafuso em U */
    [yL, yT].forEach(function (yy) {
      det.ret(-e - chapa, yy - bw / 2, e + chapa, yy + bw / 2, "MET-PRINCIPAL");
      det.ret(-e - chapa - nutH, yy - nutS / 2, -e - chapa, yy + nutS / 2, "MET-SECUNDARIO"); det.ret(e + chapa, yy - nutS / 2, e + chapa + nutH, yy + nutS / 2, "MET-SECUNDARIO");
    });
    det.cotaH(0, dist, yL - d / 2 - 14, -9, String(Math.round(dist)));
    det.cotaV(-e - chapa - nutH - 4, yL - bw / 2, yL + bw / 2, 8, String(Math.round(bw)));
    det.cotaV(115, yL - e, yL + e, -9, "Ø" + br(d, 1).replace(".", ","));
    det.marca(0, 62, 62, 105, ["PT - PONTALETE"]); det.marca(-70, yL + e, -92, 62, ["LG - LONGITUDINAL"]); det.marca(dist + e - 2, yT + e, dist + 56, 62, ["TR - TRANSVERSAL"]); det.marca(-e - chapa, yT, -78, 28, ["AF - ABRAÇ. FIXA"]);
    det.nota(["Duas abraçadeiras fixas por nó (uma por tubo); parafuso M14 em U, porca sextavada chave 22.", "Torque máx. 50 N.m (catálogo)."]);
  }
  function detLuva(det) {   /* DET. 2 — emenda do montante com luva */
    var d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), Lt = cotaF("ra-andaime-luva", "comprimentoTotal", 148), Ld = cotaF("ra-andaime-luva", "distanciaEntreParafusos", 75), ch = cotaF("ra-andaime-luva", "espessuraChapa", 5), e = d / 2;
    det.linha(-e, -115, -e, 115, "MET-SECUNDARIO"); det.linha(e, -115, e, 115, "MET-SECUNDARIO");
    det.linha(-e, -2, e, -2, "MET-FINA"); det.linha(-e, 2, e, 2, "MET-FINA");   /* junta entre os dois tubos (4 mm) */
    det.ret(-e - ch, -Lt / 2, e + ch, Lt / 2, "MET-PRINCIPAL");
    [-Ld / 2, Ld / 2].forEach(function (yy) { det.ret(e + ch, yy - 8, e + ch + 9, yy + 8, "MET-SECUNDARIO"); det.linha(-e - ch, yy, e + ch, yy, "MET-FINA"); });
    det.cotaV(-e - ch - 12, -Lt / 2, Lt / 2, 8, String(Math.round(Lt)));
    det.cotaV(e + ch + 22, -Ld / 2, Ld / 2, -9, String(Math.round(Ld)));
    det.cotaH(-e, e, -Lt / 2 - 12, -9, "Ø" + br(d, 1).replace(".", ","));
    det.marca(e + ch, 40, 70, 80, ["LV - LUVA"]); det.marca(e, 95, 60, 105, ["PT - PONTALETE"]);
    det.nota(["Emendas desencontradas em ≥ 500 entre pontaletes vizinhos; luva em tubo tracionado não recomendada (secundária)."]);
  }
  function detBase(det) {   /* DET. 3 — calço + base regulável */
    var M = det.ctx.C.M, par = det.ctx.C.par;
    var pL = cotaF("ra-andaime-base-regulavel", "placaLargura", 120), pE = cotaF("ra-andaime-base-regulavel", "placaEspessura", 8), hd = cotaF("ra-andaime-base-regulavel", "hasteDiametroRosca", 38.1);
    var nE = cotaF("ra-andaime-base-regulavel", "porcaBorboletaEnvergadura", 140), nH = cotaF("ra-andaime-base-regulavel", "porcaBorboletaAltura", 32), cL = cotaF("ra-andaime-calco", "comprimento", 500), cE = cotaF("ra-andaime-calco", "espessura", 38);
    var d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), hB = Math.round(num(M.hBase, 0.2) * 1000), rosca = Math.round(num(par.roscaBase, num(M.roscaBase, 0.1)) * 1000), yPl = cE + pE, yNut = yPl + rosca;
    var gx = cL / 2 + 22;
    det.linha(-gx, 0, gx, 0, "MET-PRINCIPAL");
    var polC = det.ret(-cL / 2, 0, cL / 2, cE, "MET-SECUNDARIO"); det.hach(polC, 1.2);
    det.ret(-pL / 2, cE, pL / 2, yPl, "MET-PRINCIPAL");
    det.tuboV(0, yPl, yPl + hB - pE, hd, "MET-SECUNDARIO");
    for (var f = yPl + 6; f < yNut; f += 8) det.linha(-hd / 2, f, hd / 2, f + 3, "MET-FINA");   /* filete da rosca */
    det.ret(-nE / 2, yNut, nE / 2, yNut + nH, "MET-PRINCIPAL");
    det.tuboV(0, yPl + hB, yPl + hB + 130, d, "MET-SECUNDARIO");
    det.cotaH(-cL / 2, cL / 2, -12, -9, String(Math.round(cL)));
    det.cotaH(-pL / 2, pL / 2, yPl + 2, 0, "");
    det.cotaV(-gx + 4, 0, cE, 8, String(Math.round(cE)));
    det.cotaV(-nE / 2 - 14, yPl, yNut, 8, String(rosca));
    det.cotaH(-nE / 2, nE / 2, yNut + nH + 6, 9, String(Math.round(nE)));
    det.marca(cL / 2 - 8, cE / 2, gx - 6, 40, ["CL - CALÇO"]); det.marca(pL / 2, yPl - 3, 108, 74, ["BS - BASE"]); det.marca(d / 2, yPl + hB + 80, 80, yPl + hB + 118, ["PT - PONTALETE"]);
    det.nota(["Rosca exposta de projeto: " + br(rosca / 1000, 2) + " m; nunca além do limite do fabricante. Calço sem compensado; placa " + Math.round(pL) + " x " + Math.round(pL) + " x " + Math.round(pE) + "."]);
  }
  function detAncoragem(det) {   /* DET. 4 — ancoragem: tubo de amarração + 2 abraçadeiras + olhal na face (planta) */
    var C = det.ctx.C, af = Math.round(num(C.par.afastamento, 0.2) * 1000), d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), e = d / 2;
    var oD = cotaF("ra-andaime-olhal", "olhalDiametroExterno", 39), oI = cotaF("ra-andaime-olhal", "olhalDiametroInterno", 23), bucha = cotaF("ra-andaime-olhal", "buchaDiametro", 12.7), bw = cotaF("ra-andaime-abracadeira-fixa", "larguraCalhaAoLongoDoTubo_forjada", 37);
    var tubo = 520, xw = -60;   /* parede à esquerda: x < 0 é a estrutura existente; x = 0 é a face */
    var polP = det.ret(xw - 70, -90, 0, 90, "MET-SECUNDARIO"); det.hach(polP, 2);
    det.linha(xw + 20 - 40, 0, 0, 0, "MET-FINA");   /* haste do parabolt dentro da parede */
    det.ret(xw - 40, -bucha / 2, 0, bucha / 2, "MET-SECUNDARIO");
    /* olhal fora da face */
    det.ret(0, -oD / 2, oD, oD / 2, "MET-PRINCIPAL"); det.ret(4, -oI / 2, oD - 6, oI / 2, "MET-FINA");
    /* tubo de amarração do olhal até além do montante */
    det.tuboH(oD + 4, tubo, 0, d, "MET-SECUNDARIO");
    /* montante (seção) a `af` da face */
    det.secao(af, 0, d, 3);
    /* duas abraçadeiras em volta do tubo, de cada lado do montante */
    [af - 52, af + 52].forEach(function (xx) { det.ret(xx - bw / 2, -e - 5, xx + bw / 2, e + 5, "MET-PRINCIPAL"); });
    det.cotaH(0, af, -e - 22, -9, String(af));
    det.cotaH(0, tubo, -e - 38, -9, String(Math.round(tubo)));
    det.cotaV(oD + 26, -oD / 2, oD / 2, -9, String(Math.round(oD)));
    det.marca(oD / 2, -oD / 2, 60, -78, ["OLHAL PARABOLT M12"]); det.marca(af, e + 5, af + 30, 70, ["PT - PONTALETE"]); det.marca(af - 52, e + 5, af - 150, 92, ["AF - 2 ABRAÇ. FIXAS"]); det.marca(300, e, 360, 70, ["AN - TUBO DE AMARRAÇÃO"]);
    det.nota(["Ancoragem em tubo + 2 abraçadeiras fixas; olhal fixado na estrutura existente (resistência e ensaio de arrancamento: RT)."]);
  }
  function detGuarda(det) {   /* DET. 5 — guarda-corpo, intermediário e rodapé (corte transversal) */
    var C = det.ctx.C, g = Math.round(num(C.par.guarda, 1.2) * 1000), it = Math.round(num(C.par.intermediaria, 0.7) * 1000), rd = Math.round(num(C.par.rodape, 0.2) * 1000), re = Math.round(num(C.par.rodapeEsp, 0.025) * 1000);
    var d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), t = cotaF("ra-andaime-tubo", "parede", 3), e = d / 2, pe = cotaF("ra-andaime-pranchao", "espessura", 38), pl = 300;
    var polP = det.ret(-pl / 2 - 40, -pe, pl / 2 - 40, 0, "MET-SECUNDARIO"); det.hach(polP, 1.4);
    det.secao(-pl / 2 - 40 + 10, -pe - e, d, t);   /* transversal sob o pranchão */
    det.tuboV(pl / 2 - 40 + e + 4, -pe - 4, g + 60, d, "MET-SECUNDARIO");   /* montante */
    var xm = pl / 2 - 40 + e + 4;
    det.secao(xm - 70, g, d, t); det.secao(xm - 70, it, d, t);   /* travessão e intermediário (longitudinais vistas de topo) */
    var polR = det.ret(pl / 2 - 40 + 2, 0, pl / 2 - 40 + 2 + re, rd, "MET-SECUNDARIO"); det.hach(polR, 1.1);
    det.ret(pl / 2 - 40 - 6, rd / 2 - 18, pl / 2 - 40 + 2 + re + 4, rd / 2 + 18, "MET-PRINCIPAL");
    det.cotaV(-pl / 2 - 70, 0, rd, 8, String(rd)); det.cotaV(-pl / 2 - 84, 0, it, 8, String(it)); det.cotaV(-pl / 2 - 98, 0, g, 8, String(g));
    det.marca(xm - 70, g + e, xm + 40, g + 70, ["LG - TRAVESSÃO"]); det.marca(xm - 70, it + e, xm + 40, it + 90, ["LG - INTERMEDIÁRIO"]); det.marca(pl / 2 - 40 + 2 + re, rd * 0.8, xm + 60, 130, ["RD - RODAPÉ"]); det.marca(pl / 2 - 40, rd / 2, xm + 60, 30, ["AR - ABRAÇ. RODAPÉ"]);
    det.marca(-pl / 2 - 40 + 60, 0, -pl / 2 - 40 + 60, 75, ["PR - PRANCHÃO"]);
    det.nota(["Medidas a partir do piso de trabalho. Rodapé ≥ 150 (NR-18 18.9.4.2); guarda-corpo resiste a 350 N pontual (NBR 6494 3.2.1)."]);
  }
  function detPiso(det) {   /* DET. 6 — piso: pranchões lado a lado, emenda por justaposição sobre transversais duplas (planta) */
    var C = det.ctx.C, bal = Math.round(num(C.M.balancoPranchaoMax, 0.15) * 1000), d = cotaF("ra-andaime-tubo", "diametroExterno", 48.3), pl = cotaF("ra-andaime-pranchao", "largura", 300);
    var Lp = 380, xj = 0;   /* emenda no meio; cada pranchão 380 visível */
    [0, 1].forEach(function (q) {
      var y0 = -pl + q * pl;
      var polA = det.ret(-Lp, y0, xj - 3, y0 + pl, "MET-SECUNDARIO"), polB = det.ret(xj + 3, y0, Lp, y0 + pl, "MET-SECUNDARIO");
      det.hach(polA, 1.6); det.hach(polB, 1.6);
    });
    /* transversais duplas sob a emenda (tracejadas: ocultas pelo piso) e as longitudinais nas bordas */
    det.tuboV(-d / 2 - 1, -pl - 30, pl + 30, d, "MET-OCULTA"); det.tuboV(d / 2 + 1, -pl - 30, pl + 30, d, "MET-OCULTA");
    det.tuboH(-Lp - 24, Lp + 24, -pl - 30, d, "MET-SECUNDARIO"); det.tuboH(-Lp - 24, Lp + 24, pl + 30, d, "MET-SECUNDARIO");
    det.tuboV(Lp - bal, -pl - 30, pl + 30, d, "MET-OCULTA");
    det.cotaH(Lp - bal, Lp, pl + 30 + d / 2 + 14, -9, String(bal));
    det.cotaV(-Lp - 40, -pl, pl, 8, String(Math.round(2 * pl)));
    det.cotaH(-d - 2, d + 2, -pl - 30 - d / 2 - 12, -9, String(Math.round(2 * d + 4)));
    det.marca(Lp / 2, pl / 2, Lp / 2 + 40, 20, ["PR - PRANCHÃO"]); det.marca(d / 2 + 1, -pl - 20, 120, -pl - 80, ["TR - TRANSVERSAL DUPLA"]); det.marca(Lp - bal, pl + 30, Lp - 330, pl + 110, ["TR - ÚLTIMA"]);
    det.nota(["Emenda por justaposição sobre transversais duplas, sem sobreposição; balanço máximo " + bal + " (limite 200, NBR 6494 3.1.8.4); pranchões lado a lado cobrindo toda a largura."]);
  }
  function detAcesso(det) {   /* DET. 7 — acesso: escada de mão inclinada com portinhola (ou marinheiro, ou lance da torre coletiva) */
    var C = det.ctx.C, modo = C.acessoModo, larg = cotaF("ra-andaime-escada", "largura", 400), esp = cotaF("ra-andaime-escada", "degrauEspacamento", 275), M = det.ctx.modelo, par = M.par || {};
    var lev = num(M.medidas && M.medidas.alturaPiso, 2) / Math.max(1, num(M.medidas && M.medidas.nLevantes, 1)) * 1000, tPiso = 38, nome;
    if (modo === "escada" || modo === null || modo === undefined || modo === "nenhum") {
      var a1 = arr(M.acessos).filter(function (a) { return a.tipo === "escada"; })[0], th = (a1 ? num(a1.angulo, 75) : 75) * Math.PI / 180, Lc = (a1 ? a1.L : 3.25) * 1000, Hh = 600, xf = Hh / 2 - lev / Math.tan(th), xt = xf + Lc * Math.cos(th), yt = Lc * Math.sin(th);
      det.hach(det.ret(-300, -tPiso, 1200, 0, "MET-PRINCIPAL"), 1.4);   /* piso do levante de baixo (apoio do pé) */
      var yp = lev;
      det.hach(det.ret(-300, yp - tPiso, 0, yp, "MET-SECUNDARIO"), 1.4);   /* piso maciço antes da portinhola */
      det.ret(0, yp - tPiso, Hh, yp, "MET-FINA"); det.linha(0, yp - tPiso, Hh, yp, "MET-FINA"); det.linha(0, yp, Hh, yp - tPiso, "MET-FINA");   /* portinhola */
      det.hach(det.ret(Hh, yp - tPiso, 1200, yp, "MET-SECUNDARIO"), 1.4);   /* piso maciço depois */
      det.linha(xf, 0, xt, yt, "MET-PRINCIPAL"); det.linha(xf + 18, 0, xt + 18, yt, "MET-SECUNDARIO");
      var nE = a1 ? a1.nDegraus || 10 : 10; for (var q = 1; q < nE; q++) { var f = q / nE; det.linha(xf + (xt - xf) * f, yt * f, xf + (xt - xf) * f + 18, yt * f, "MET-FINA"); }
      det.cotaV(xt + 120, yp, yt, -9, "ULTRAPASSA " + Math.round(yt - yp)); det.cotaV(-340, 0, lev, 9, String(Math.round(lev)));
      det.marca(xf + (xt - xf) * 0.5, yt * 0.5, xt + 260, yt * 0.45, ["ES - ESCADA " + Math.round(Lc) + " mm A " + Math.round(th * 180 / Math.PI) + "°"]); det.marca(Hh / 2, yp - tPiso / 2, -80, yp + 480, ["AL - PORTINHOLA 600"]);
      det.nota(["Corte através da largura. Escada de mão por levante: 50° a 75° (NR-18 18.8.2 b), até 7 m (18.8.6.13), ultrapassa o piso em 1,00 m, passa pela portinhola de catálogo (0,60 × 2,50 m); o pé do lance de cima fica na faixa de piso maciço."]);
      return;
    }
    if (modo === "coletiva") {
      var Ec = arr(M.torre && M.torre.acessos)[0] || {}, esp2 = (Ec.espelho || 0.2) * 1000, nn = Ec.nDegraus || 5, ps = (Ec.piso || 0.25) * 1000;
      for (var q2 = 0; q2 < nn; q2++) { det.linha(q2 * ps, q2 * esp2, (q2 + 1) * ps, q2 * esp2, "MET-PRINCIPAL"); det.linha((q2 + 1) * ps, q2 * esp2, (q2 + 1) * ps, (q2 + 1) * esp2, "MET-PRINCIPAL"); }
      det.linha(0, 0, nn * ps, nn * esp2, "MET-SECUNDARIO"); det.linha(0, 900, nn * ps, nn * esp2 + 900, "MET-SECUNDARIO");
      det.cotaH(0, ps, -20, -8, String(Math.round(ps))); det.cotaV(nn * ps + 40, (nn - 1) * esp2, nn * esp2, -8, String(Math.round(esp2)));
      det.marca(nn * ps * 0.5, nn * esp2 * 0.5, nn * ps + 120, nn * esp2 * 0.2, ["EC - LANCE DE ESCADA COLETIVA"]);
      det.nota(["Torre de escada de uso coletivo: lance de 0,60 m, corrimão dos dois lados, espelho ≤ 0,20 m, patamar a cada meio levante (NR-18 18.12.14 b; 18.8.6.1)."]);
      return;
    }
    var H = 1100, hw = larg / 2, bd = cotaF("ra-andaime-escada", "banzoTuboDiametro", 31.75);
    det.tuboV(-hw, 0, H, bd, "MET-SECUNDARIO"); det.tuboV(hw, 0, H, bd, "MET-SECUNDARIO");
    for (var yy = esp * 0.6; yy < H; yy += esp) det.linha(-hw + bd / 2, yy, hw - bd / 2, yy, "MET-FINA");
    det.linha(-hw, H, -hw, H + 60, "MET-SECUNDARIO"); det.linha(hw, H, hw, H + 60, "MET-SECUNDARIO");
    var Da = cotaF("ra-andaime-marinheiro", "arcoDiametro", 725), ev = cotaF("ra-andaime-marinheiro", "arcoEspacamentoVertical", 1000);
    var ac = [], cx0 = hw + 70 + Da / 2, cy0 = ev * 0.55;
    for (var ia = 0; ia <= 24; ia++) { var an = (40 + 280 * ia / 24) * Math.PI / 180; ac.push([det.X(cx0 + Da / 2 * Math.cos(an)), det.Y(cy0 + Da / 2 * Math.sin(an))]); }
    det.D.poli(ac, "MET-SECUNDARIO", false);
    det.cotaH(cx0 - Da / 2, cx0 + Da / 2, cy0 - Da / 2 - 14, -8, String(Math.round(Da)));
    det.marca(cx0 + Da / 2 * 0.7, cy0 + Da / 2 * 0.7, cx0 + Da / 2 + 20, cy0 + Da / 2 + 60, ["ARC - ARCO Ø" + Math.round(Da)]);
    det.cotaH(-hw, hw, -14, -8, String(Math.round(larg))); det.cotaV(hw + 36, esp * 0.6, esp * 1.6, -8, String(Math.round(esp)));
    det.marca(hw, 330, hw + 90, 420, ["ES - ESCADA MARINHEIRO"]);
    det.nota(["Marinheiro (NR-18 18.8.6.2): largura 0,40 m, lance até 6 m entre plataformas de descanso 0,60 × 0,60 m, ultrapassa 1,10–1,20 m, fixação a cada 3 m; SPIQ acima de 2 m (18.8.6.3)."]);
  }
  var DETALHES = [
    { n: 1, titulo: "NÓ DE 3 - MONTANTE X LONGITUDINAL X TRANSVERSAL", esc: 5, fn: detNo, ext: [[-120, 150], [-120, 150]] }, { n: 2, titulo: "EMENDA DO MONTANTE COM LUVA", esc: 5, fn: detLuva, ext: [[-100, 100], [-135, 135]] },
    { n: 3, titulo: "BASE - CALÇO E BASE REGULÁVEL", esc: 5, fn: detBase, ext: [[-290, 290], [-30, 340]] }, { n: 4, titulo: "ANCORAGEM - TUBO DE AMARRAÇÃO E OLHAL", esc: 5, fn: detAncoragem, ext: [[-130, 540], [-100, 100]] },
    { n: 5, titulo: "GUARDA-CORPO, INTERMEDIÁRIO E RODAPÉ", esc: 10, fn: detGuarda, ext: [[-230, 200], [-70, 1280]] }, { n: 6, titulo: "PISO - PRANCHÕES E EMENDA POR JUSTAPOSIÇÃO", esc: 10, fn: detPiso, ext: [[-440, 440], [-400, 400]] },
    { n: 7, titulo: "ACESSO - ESCADA / TORRE / MARINHEIRO", esc: 30, fn: detAcesso, ext: [[-340, 1560], [-60, 3400]] }
  ];

  /* ================================================================ DETALHES TÍPICOS DO MULTIDIRECIONAL (M4-B)
   * Cotas de docs/andaime-multi/familias-m-cotas.json (via js/familiasandaimemdados.js); cota de grau ESTIMADO leva * e o aviso da nota (conferir com a peça real). */
  var FM = { poste: "ra-andaime-m-poste", trav: "ra-andaime-m-travessa", piso: "ra-andaime-m-piso", alc: "ra-andaime-m-alcapao", rod: "ra-andaime-m-rodape", pb: "ra-andaime-m-peca-base", br: "ra-andaime-m-base-regulavel",
    gan: "ra-andaime-m-gancho-ancoragem", estr: "ra-andaime-m-estribo-no", pinca: "ra-andaime-m-pinca-chaveta", pino: "ra-andaime-m-pino-trava" };
  Det.prototype.circ = function (cx, cy, d, cam) { this.D.circ(this.X(cx), this.Y(cy), d / 2 * this.k, cam || "MET-SECUNDARIO"); };
  Det.prototype.poli = function (pts, cam, fechado) { var self = this; this.D.poli(pts.map(function (q) { return [self.X(q[0]), self.Y(q[1])]; }), cam || "MET-SECUNDARIO", fechado !== false); };
  Det.prototype.hachM = function (poly, passo) { hachuraMetal(this.D, poly, passo || 2.0); };
  function notaEst(txt0) { return txt0 + (Object.keys(ESTIMADAS).length ? " * = cota estimada (grau «e» do catálogo): conferir com a peça real." : ""); }
  function detNoM(det) {   /* DET. 1 — nó: poste + roseta + cabeça da travessa + cunha (ou laço + pinça + chaveta no estribo) */
    if (det.ctx.C.linha === "estribo") return detNoEstribo(det);
    var d = cotaM(FM.poste, "diametroExterno", 48.3), e = d / 2, dR = cotaM(FM.poste, "roseta_diametroExterno", 124), tR = cotaM(FM.poste, "roseta_espessura", 9);
    var hC = cotaM(FM.trav, "cabecaAltura", 72), cC = cotaM(FM.trav, "cabecaComprimento", 50), lC = cotaM(FM.trav, "cunhaComprimento", 140), wT = cotaM(FM.trav, "cunhaLarguraNoTopo", 27), wP = cotaM(FM.trav, "cunhaLarguraNaPonta", 10);
    var yR = e + 1, xc = e + 30, yTop = hC / 2 + 24, yBot = yTop - lC;
    det.linha(-e, -112, -e, 126, "MET-SECUNDARIO"); det.linha(e, -112, e, 126, "MET-SECUNDARIO");
    det.ret(-dR / 2, yR - tR / 2, dR / 2, yR + tR / 2, "MET-PRINCIPAL");
    det.ret(e, -hC / 2, e + cC, hC / 2, "MET-PRINCIPAL");
    det.tuboH(e + cC, 235, 0, d, "MET-SECUNDARIO");
    det.poli([[xc - wT / 2, yTop], [xc + wT / 2, yTop], [xc + wP / 2, yBot], [xc - wP / 2, yBot]], "MET-PRINCIPAL", true);
    det.cotaH(-dR / 2, dR / 2, -hC / 2 - 4, -9, "Ø" + txM(FM.poste, "roseta_diametroExterno", 124));
    det.cotaV(-dR / 2 - 4, yR - tR / 2, yR + tR / 2, 8, txM(FM.poste, "roseta_espessura", 9));
    det.cotaV(e + cC + 2, -hC / 2, hC / 2, -9, txM(FM.trav, "cabecaAltura", 72));
    det.cotaV(xc + wT / 2 + 3, yBot, yTop, -15, txM(FM.trav, "cunhaComprimento", 140));
    det.cotaH(e, e + cC, -hC / 2 - 20, -9, txM(FM.trav, "cabecaComprimento", 50));
    det.marca(-e, 100, -100, 118, ["PO - POSTE"]); det.marca(-dR / 2 + 6, yR, -118, 12, ["RS - ROSETA"]); det.marca(e + cC / 2, hC / 2, 85, 78, ["TV - CABEÇA DA TRAVESSA"]);
    det.marca(xc, yTop - 6, 62, 116, ["CU - CUNHA"]); det.marca(190, -e, 170, -62, ["TV - TRAVESSA"]);
    det.nota([notaEst("Travessa encaixada na roseta por cunha batida até o fim (M02 p.14); a cunha trava a cabeça ao disco."), "Eixo do tubo da travessa abaixo do plano da roseta (piso assenta por cima)."]);
  }
  function detNoEstribo(det) {
    var d = cotaM(FM.estr, "posteDiametro", 48.2), e = d / 2, lw = cotaM(FM.estr, "lacoLargura", 32), lp = cotaM(FM.estr, "lacoProjecaoAlemDoTubo", 38), la = cotaM(FM.estr, "lacoAlturaAoLongoDoPoste", 41), rl = cotaM(FM.estr, "lacoRasgoLargura", 12), ra = cotaM(FM.estr, "lacoRasgoAltura", 8);
    var pw = cotaM(FM.pinca, "pincaLargura", 30), pp = cotaM(FM.pinca, "pincaProfundidade", 26), cL = cotaM(FM.pinca, "chavetaComprimento", 120), cW = cotaM(FM.pinca, "chavetaLargura", 11);
    det.linha(-e, -112, -e, 126, "MET-SECUNDARIO"); det.linha(e, -112, e, 126, "MET-SECUNDARIO");
    det.ret(e, -la / 2, e + lp, la / 2, "MET-PRINCIPAL"); det.ret(e + (lp - rl) / 2, -ra / 2, e + (lp + rl) / 2, ra / 2, "MET-FINA");
    det.ret(e + lp, -pp / 2, e + lp + pw, pp / 2, "MET-PRINCIPAL");
    det.tuboH(e + lp + pw, 235, 0, d, "MET-SECUNDARIO");
    det.ret(e + lp / 2 - cW / 2, -cL / 2, e + lp / 2 + cW / 2, cL / 2, "MET-PRINCIPAL");
    det.cotaV(e + lp / 2 + 22, -la / 2, la / 2, -9, txM(FM.estr, "lacoAlturaAoLongoDoPoste", 41));
    det.cotaH(e, e + lp, -cL / 2 - 4, -9, txM(FM.estr, "lacoProjecaoAlemDoTubo", 38));
    det.cotaV(-e - 6, -cL / 2, cL / 2, 8, txM(FM.pinca, "chavetaComprimento", 120));
    det.cotaH(e + lp, e + lp + pw, -cL / 2 - 22, -9, txM(FM.pinca, "pincaLargura", 30));
    det.marca(-e, 100, -100, 118, ["PO - POSTE"]); det.marca(e + lp / 2, la / 2, 40, 80, ["NÓ - LAÇO DO ESTRIBO"]); det.marca(e + lp + pw / 2, pp / 2, 110, 70, ["PINÇA"]); det.marca(e + lp / 2, cL / 2, 40, 110, ["CHAVETA"]); det.marca(190, -e, 170, -62, ["TV - TRAVESSA"]);
    det.nota([notaEst("Travessa engata no laço do estribo pela pinça e é travada pela chaveta (M01 p.4)."), "Quatro estribos por nó."]);
  }
  function detEmendaM(det) {   /* DET. 2 — emenda do poste: espigão + soquete + pino trava */
    var d = cotaM(FM.poste, "diametroExterno", 48.3), e = d / 2, dR = cotaM(FM.poste, "roseta_diametroExterno", 124), tR = cotaM(FM.poste, "roseta_espessura", 9), esp = cotaM(FM.poste, "espigaoComprimentoLivre", 175), dEsp = cotaM(FM.poste, "espigaoDiametroExterno", 38);
    var fp = cotaM(FM.poste, "espigaoFuroPosicao", 35), fd = cotaM(FM.poste, "espigaoFuroPinoDiametro", 13), soq = cotaM(FM.poste, "soqueteInferiorComprimento", 165), rom = cotaM(FM.poste, "distanciaUltimaRosetaAteOmbroDoEspigao", 100), pd = cotaM(FM.pino, "arameDiametro", 9);
    det.tuboV(0, -192, 0, d, "MET-SECUNDARIO"); det.tuboV(0, 0, 212, d, "MET-SECUNDARIO");
    det.linha(-e, 0, e, 0, "MET-FINA");
    det.ret(-dR / 2, -rom - tR / 2, dR / 2, -rom + tR / 2, "MET-PRINCIPAL");
    det.tuboV(0, 0, esp, dEsp, "MET-OCULTA"); det.linha(-e, soq, e, soq, "MET-FINA");
    var yP = esp - fp;
    det.ret(-46, yP - pd / 2, 46, yP + pd / 2, "MET-PRINCIPAL"); det.circ(58, yP, 20, "MET-PRINCIPAL");
    det.cotaV(-e - 4, -rom, 0, 8, txM(FM.poste, "distanciaUltimaRosetaAteOmbroDoEspigao", 100));
    det.cotaV(e + 2, 0, esp, -9, txM(FM.poste, "espigaoComprimentoLivre", 175));
    det.cotaV(e + 2, yP, esp, -26, txM(FM.poste, "espigaoFuroPosicao", 35));
    det.cotaV(-e - 4, 0, soq, 8, txM(FM.poste, "soqueteInferiorComprimento", 165));
    det.marca(0, -150, 70, -165, ["PO - POSTE DE BAIXO"]); det.marca(e, 196, 70, 205, ["PO - POSTE DE CIMA (SOQUETE)"]); det.marca(0, esp * 0.45, 80, 70, ["ESPIGÃO Ø" + txM(FM.poste, "espigaoDiametroExterno", 38)]);
    det.marca(58, yP, 84, yP - 26, ["PN - PINO TRAVA"]); det.marca(dR / 2 - 6, -rom, 84, -rom + 24, ["RS - ROSETA"]);
    det.nota([notaEst("Pino trava obrigatório em toda união de postes (M02 p.17); emendas desencontradas: interno 2,00 m e externo 3,00 m."), "Furo do pino Ø" + txM(FM.poste, "espigaoFuroPinoDiametro", 13) + "."]);
  }
  function detBaseM(det) {   /* DET. 3 — calço + base regulável + peça base (corte) */
    var M = det.ctx.C.M, cL = 500, cE = 38, pL = cotaM(FM.br, "placaLado", 150), pE = cotaM(FM.br, "placaEspessura", 8), hd = cotaM(FM.br, "hasteDiametroDaRosca", 38), nE = cotaM(FM.br, "porcaBorboletaDiametro", 205), nH = cotaM(FM.br, "porcaBorboletaAltura", 32);
    var lim = cotaM(FM.br, "limiteDeRegulagem", 250), pbH = cotaM(FM.pb, "alturaTotal", 235), pbR = cotaM(FM.pb, "posicaoDaRosetaAPartirDaBase", 65), luD = cotaM(FM.pb, "luvaDiametro", 57), luL = cotaM(FM.pb, "luvaComprimento", 80), dR = cotaM(FM.poste, "roseta_diametroExterno", 124), tR = cotaM(FM.poste, "roseta_espessura", 9), d = 48.3;
    var rosca = Math.min(lim, Math.max(20, Math.round(num(M.regulagemBase, 0.1) * 1000))), yPl = cE + pE, yb = yPl + rosca, gx = cL / 2 + 22;
    det.linha(-gx, 0, gx, 0, "MET-PRINCIPAL");
    var polC = det.ret(-cL / 2, 0, cL / 2, cE, "MET-SECUNDARIO"); det.hach(polC, 1.2);
    det.ret(-pL / 2, cE, pL / 2, yPl, "MET-PRINCIPAL");
    det.tuboV(0, yPl, yb, hd, "MET-SECUNDARIO");
    for (var f = yPl + 8; f < yb - 40; f += 14) det.linha(-hd / 2, f, hd / 2, f + 4, "MET-FINA");
    det.ret(-nE / 2, yb - nH, nE / 2, yb, "MET-PRINCIPAL");
    det.ret(-luD / 2, yb, luD / 2, yb + luL, "MET-PRINCIPAL");
    det.tuboV(0, yb + luL, yb + pbH, d, "MET-SECUNDARIO"); det.tuboV(0, yb + pbH, yb + pbH + 130, d, "MET-SECUNDARIO");
    det.ret(-dR / 2, yb + pbR - tR / 2, dR / 2, yb + pbR + tR / 2, "MET-PRINCIPAL");
    det.cotaH(-cL / 2, cL / 2, -12, -9, String(cL));
    det.cotaV(-gx + 4, 0, cE, 8, String(cE));
    det.cotaV(-nE / 2 - 14, yPl, yb, 8, String(rosca));
    det.cotaV(luD / 2 + 12, yb, yb + pbH, -9, txM(FM.pb, "alturaTotal", 235));
    det.cotaV(luD / 2 + 12, yb, yb + pbR, -30, txM(FM.pb, "posicaoDaRosetaAPartirDaBase", 65));
    det.cotaH(-pL / 2, pL / 2, yPl + 2, 9, txM(FM.br, "placaLado", 150));
    det.marca(cL / 2 - 8, cE / 2, gx - 6, 120, ["CL - CALÇO"]); det.marca(pL / 2, cE + pE / 2, 150, 90, ["BR - BASE REGULÁVEL"]);
    det.marca(luD / 2, yb + luL / 2, 150, yb + 150, ["PB - PEÇA BASE"]); det.marca(dR / 2 - 4, yb + pbR, 160, yb + pbR + 40, ["RS - 1ª ROSETA (1º NÓ)"]);
    det.nota([notaEst("Rosca exposta de projeto " + br(rosca / 1000, 2) + " m; curso máximo " + br(lim / 1000, 2) + " m (M02 p.10; checklist item 15). Calço de madeira sem compensado.")]);
  }
  function detAncoragemM(det) {   /* DET. 4 — ancoragem: chumbador + parafuso olhal + gancho + abraçadeira fixa (planta) */
    var C = det.ctx.C, af = Math.round(num(C.par.afastamento, 0.15) * 1000), d = 48.3, e = d / 2, a0 = arr(C.modelo.ancoragens)[0] || {}, Lg = a0.gancho === "ganchoLongo" ? 500 : 250;
    var fD = cotaM(FM.gan, "chumbadorFuroDiametro", 20), fP = cotaM(FM.gan, "chumbadorFuroProfundidade", 70), cD = cotaM(FM.gan, "chumbadorDiametroNominal", 15.9), oA = cotaM(FM.gan, "olhalAbertura", 23), oB = cotaM(FM.gan, "olhalBarraDiametro", 8), gB = cotaM(FM.gan, "ganchoBarraDiametro", 18);
    var bw = cotaF("ra-andaime-abracadeira-fixa", "larguraCalhaAoLongoDoTubo_forjada", 37), oD = oA + 2 * oB;
    var polP = det.ret(-150, -90, 0, 90, "MET-SECUNDARIO"); det.hach(polP, 2);
    det.ret(-fP, -fD / 2, 0, fD / 2, "MET-FINA"); det.ret(-fP + 4, -cD / 2, 6, cD / 2, "MET-SECUNDARIO");
    det.ret(6, -6, 22, 6, "MET-SECUNDARIO"); det.circ(22 + oD / 2, 0, oD, "MET-PRINCIPAL"); det.circ(22 + oD / 2, 0, oA, "MET-FINA");
    det.tuboH(22 + oD / 2, 22 + Lg, 0, gB, "MET-SECUNDARIO");
    det.tuboH(22 + Lg - 140, 22 + Lg, 0, d, "MET-SECUNDARIO");
    det.secao(af, 0, d, 3);
    det.ret(af - bw / 2, -e - 5, af + bw / 2, e + 5, "MET-PRINCIPAL");
    det.cotaH(0, af, -e - 22, -9, String(af));
    det.cotaH(22, 22 + Lg, e + 18, 9, String(Lg));
    det.cotaV(-fP - 8, -fD / 2, fD / 2, 8, "Ø" + txM(FM.gan, "chumbadorFuroDiametro", 20)); det.cotaH(-fP, 0, -fD / 2 - 10, -9, txM(FM.gan, "chumbadorFuroProfundidade", 70));
    det.marca(-fP / 2, 0, -100, 62, ["CH - CHUMBADOR 5/8\""]); det.marca(30, oD / 2, 12, 70, ["OL - OLHAL"]); det.marca(22 + oD + 40, 0, 120, -62, ["GA - GANCHO " + Lg]); det.marca(af, e + 5, af + 40, 80, ["AF - ABRAÇ. FIXA"]); det.marca(af + e, -e, af + 120, 40, ["PO - POSTE"]);
    det.nota([notaEst("Gancho preso ao poste por abraçadeira fixa; olhal no chumbador PBI 5/8\" em furo Ø" + txM(FM.gan, "chumbadorFuroDiametro", 20) + " × " + txM(FM.gan, "chumbadorFuroProfundidade", 70) + " (M02 p.22). Afastamento acima de 0,45 m: tubo de 1,00 m + 2 abraçadeiras fixas."), "Resistência e ensaio de arrancamento: RT."]);
  }
  function detGuardaM(det) {   /* DET. 5 — guarda-corpo 1,00/0,50 e rodapé metálico (corte transversal) */
    var C = det.ctx.C, g = Math.round(C.gd.g * 1000), it = Math.round(C.gd.it * 1000), rd = Math.round(C.gd.rd * 1000), W = Math.round(num(C.M.largura, 0.8) * 1000), pw = cotaM(FM.piso, "largura", 320), rp = cotaM(FM.rod, "perfilProfundidade", 30);
    var d = 48.3, e = d / 2, xp = W / 2, ph = cotaM(FM.piso, "alturaDoPerfil", 76);
    [[-pw, 0], [0, pw]].forEach(function (q) { var pol = det.ret(q[0], -ph, q[1], 0, "MET-SECUNDARIO"); det.linha(q[0], -ph + 12, q[1], -ph + 12, "MET-FINA"); });
    det.tuboV(xp, -120, g + 80, d, "MET-SECUNDARIO"); det.tuboV(-xp, -120, 40, d, "MET-SECUNDARIO");
    det.circ(xp, -e - 1, d, "MET-PRINCIPAL"); det.circ(-xp, -e - 1, d, "MET-PRINCIPAL");
    det.circ(xp, g, d, "MET-PRINCIPAL"); det.circ(xp, it, d, "MET-PRINCIPAL");
    var polR = det.ret(xp + e + 2, 0, xp + e + 2 + rp, rd, "MET-PRINCIPAL"); det.linha(xp + e + 2 + rp / 2, 0, xp + e + 2 + rp / 2, rd, "MET-FINA");
    det.cotaV(-xp - e - 30, 0, rd, 8, String(rd)); det.cotaV(-xp - e - 44, 0, it, 8, String(it)); det.cotaV(-xp - e - 58, 0, g, 8, String(g));
    det.cotaH(-pw, pw, -ph - 20, -9, String(Math.round(2 * pw))); det.cotaH(-xp, xp, -ph - 20, -18, String(W));
    det.marca(xp, g + e, xp + 90, g + 90, ["TV - TRAVESSÃO"]); det.marca(xp, it + e, xp + 90, it + 70, ["TV - INTERMEDIÁRIO"]); det.marca(xp + e + 2 + rp, rd * 0.7, xp + 110, 150, ["RM - RODAPÉ METÁLICO"]);
    det.marca(pw / 2, -ph / 2, pw / 2 + 40, -ph - 80, ["PM - PISO"]); det.marca(xp, -e - 1, xp + 60, -90, ["TV - TRAVESSA"]);
    det.nota(["Guarda-corpo do multi: travessão a " + br(g / 1000, 2) + " m e intermediário a " + br(it / 1000, 2) + " m do piso, rodapé de " + br(rd / 1000, 2) + " m (NR-18 18.12.15.2); encaixados nas rosetas antes de estender os postes."]);
  }
  function detPisoM(det) {   /* DET. 6 — piso metálico: garras, trava e perfuração (planta) */
    var C = det.ctx.C, vao = Math.round(arr(C.modelo.barras).filter(function (b) { return b.papel === "travessa"; })[0] ? C.modelo.barras.filter(function (b) { return b.papel === "travessa"; })[0].L * 1000 : 800);
    var pw = cotaM(FM.piso, "largura", 320), menos = cotaM(FM.piso, "comprimentoDoPisoMenosNominal", 42), gL = cotaM(FM.piso, "garraLarguraNaPlanta", 35), gR = cotaM(FM.piso, "garraRecuoNaLateral", 32), tL = cotaM(FM.piso, "travaLargura", 10), tC = cotaM(FM.piso, "travaComprimento", 40);
    var pp1 = cotaM(FM.piso, "perfuracaoPassoNaLargura", 24.7), pp2 = cotaM(FM.piso, "perfuracaoPassoNoComprimento", 19.6), pd = cotaM(FM.piso, "perfuracaoDiametroDoFuro", 15), d = 48.3;
    var Lp = vao - menos, x0 = menos / 2, x1 = vao - menos / 2, hw = pw / 2, i, j;
    det.tuboV(0, -hw - 60, hw + 60, d, "MET-SECUNDARIO"); det.tuboV(vao, -hw - 60, hw + 60, d, "MET-SECUNDARIO");
    det.ret(x0, -hw, x1, hw, "MET-PRINCIPAL");
    [-1, 1].forEach(function (sg) {
      var yy = sg < 0 ? -hw + gR : hw - gR - gL;
      det.ret(x0 - 14, yy, x0 + 4, yy + gL, "MET-PRINCIPAL"); det.ret(x1 - 4, yy, x1 + 14, yy + gL, "MET-PRINCIPAL");
    });
    det.ret(x1 - 22, -tC / 2, x1 - 22 + tL, tC / 2, "MET-PRINCIPAL");
    for (i = 0; i < 6; i++) for (j = 0; j < 4; j++) det.circ(x0 + 40 + i * pp2, -hw + 36 + j * pp1, pd, "MET-FINA");
    det.cotaV(x1 + 34, -hw, hw, -9, txM(FM.piso, "largura", 320));
    det.cotaH(x0, x1, hw + 62, 9, String(Lp)); det.cotaH(0, vao, hw + 90, 9, String(vao));
    det.cotaH(x0 + 40, x0 + 40 + pp2, -hw + 36 + 3 * pp1 + 22, -9, txM(FM.piso, "perfuracaoPassoNoComprimento", 19.6, 1)); det.cotaV(x0 + 36, -hw + 36, -hw + 36 + pp1, 8, txM(FM.piso, "perfuracaoPassoNaLargura", 24.7, 1));
    det.marca(x0 + 40 + 2 * pp2, -hw + 36 + pp1, x0 + 200, -hw + 70, ["PERFURAÇÃO Ø" + txM(FM.piso, "perfuracaoDiametroDoFuro", 15)]); det.marca(x0 - 5, hw - gR - gL / 2, 40, hw - 130, ["GARRA " + txM(FM.piso, "garraLarguraNaPlanta", 35)]);
    det.marca(x1 - 22 + tL / 2, tC / 2, x1 - 150, 20, ["TRAVA CONTRA LEVANTAMENTO"]); det.marca(vao, hw + 40, vao - 120, hw + 40, ["TV - TRANSVERSAL"]);
    det.nota([notaEst("Piso = travessa nominal − " + Math.round(menos) + " mm; engata com as garras na travessa e a trava impede o levantamento (M02 p.18). A perfuração cobre toda a chapa (só um trecho desenhado).")]);
  }
  function detAcessoM(det) {   /* DET. 7 — alçapão com escada incorporada (ou escada externa), corte lateral */
    var C = det.ctx.C, a1 = arr(C.modelo.acessos)[0] || {}, lev = Math.round(num(arr(C.yPisos)[0], 2) * 1000);
    if (a1.incorporada === false) {
      var eL = 400, hw = eL / 2, H = lev + 1000, esp = 275;
      det.tuboV(-hw, 0, H, 31.75, "MET-SECUNDARIO"); det.tuboV(hw, 0, H, 31.75, "MET-SECUNDARIO");
      for (var yy = esp * 0.6; yy < H; yy += esp) det.linha(-hw, yy, hw, yy, "MET-FINA");
      det.hach(det.ret(-900, lev - 45, -hw - 100, lev, "MET-PRINCIPAL"), 1.4);
      det.cotaH(-hw, hw, -14, -9, String(eL)); det.cotaV(hw + 40, 0, lev, -9, String(lev)); det.cotaV(hw + 40, lev, H, -9, "1000");
      det.marca(hw, H * 0.6, hw + 250, H * 0.6, ["ES - ESCADA EXTERNA Ø48"]);
      det.nota(["Escada externa por levante, ultrapassando o piso em 1,00 m (NR-18 18.12.14); alçapão não usado neste projeto."]);
      return;
    }
    var aberT = cotaM(FM.alc, "aberturaDaTampaComprimento", 710), eC = cotaM(FM.alc, "escada_comprimento", 2230), eP = cotaM(FM.alc, "escada_passoDosDegraus", 280), eLg = cotaM(FM.alc, "escada_largura", 300), th = Math.asin(Math.min(0.97, lev / eC)), ps = 45;
    var x0 = 200, x1 = x0 + aberT, xt = (x0 + x1) / 2, xf = xt + lev / Math.tan(th), nE = Math.floor(eC / eP);
    det.hachM(det.ret(-300, -ps, x0, 0, "MET-PRINCIPAL"), 1.6); det.hachM(det.ret(x1, -ps, x1 + 900, 0, "MET-PRINCIPAL"), 1.6);
    det.hachM(det.ret(-300, lev - ps, x0, lev, "MET-PRINCIPAL"), 1.6); det.hachM(det.ret(x1, lev - ps, x1 + 900, lev, "MET-PRINCIPAL"), 1.6);
    det.linha(x0, lev - ps, x1, lev, "MET-FINA"); det.linha(x0, lev, x1, lev - ps, "MET-FINA");
    det.linha(xf, 0, xt, lev, "MET-PRINCIPAL"); det.linha(xf + 40, 0, xt + 40, lev, "MET-SECUNDARIO");
    for (var q = 1; q < nE; q++) { var f = q / nE; det.linha(xf + (xt - xf) * f, lev * f, xf + (xt - xf) * f + 40, lev * f, "MET-FINA"); }
    det.cotaV(-340, 0, lev, 9, String(lev)); det.cotaH(x0, x1, lev + 120, 9, txM(FM.alc, "aberturaDaTampaComprimento", 710));
    det.cotaV(x1 + 950, 0, lev, -9, String(lev));
    det.marca(xf + (xt - xf) * 0.5, lev * 0.5, x1 + 520, lev * 0.55, ["AL - ESCADA " + txM(FM.alc, "escada_comprimento", 2230) + " (" + nE + " DEGRAUS" + estM(FM.alc, "escada_numeroDeDegraus") + ")"]); det.marca(xt, lev - ps / 2, -230, lev + 400, ["AL - ALÇAPÃO " + txM(FM.alc, "aberturaDaTampaComprimento", 710)]);
    det.nota([notaEst("Piso com alçapão e escada incorporada (PI07): alçapões alternados nos níveis, tampa fechada após a passagem (M02 p.18; NR-18 18.12.14)."), "Passo dos degraus " + txM(FM.alc, "escada_passoDosDegraus", 280) + ", largura da escada " + txM(FM.alc, "escada_largura", 300) + "."]);
  }
  var DETALHES_M = [
    { n: 1, titulo: function (c) { return c && c.linha === "estribo" ? "NÓ DE ESTRIBO - LAÇO, PINÇA E CHAVETA" : "NÓ DE ROSETA - POSTE, CABEÇA E CUNHA"; }, esc: 5, fn: detNoM, ext: [[-150, 300], [-115, 130]] },
    { n: 2, titulo: "EMENDA DO POSTE - ESPIGÃO E PINO TRAVA", esc: 5, fn: detEmendaM, ext: [[-130, 170], [-200, 225]] },
    { n: 3, titulo: "BASE - CALÇO, BASE REGULÁVEL E PEÇA BASE", esc: 10, fn: detBaseM, ext: [[-280, 340], [-30, 640]] },
    { n: 4, titulo: "ANCORAGEM - GANCHO, ABRAÇADEIRA FIXA E OLHAL", esc: 5, fn: detAncoragemM, ext: [[-170, 300], [-95, 105]] },
    { n: 5, titulo: "GUARDA-CORPO 1,00 / 0,50 E RODAPÉ METÁLICO", esc: 20, fn: detGuardaM, ext: [[-560, 520], [-130, 1160]] },
    { n: 6, titulo: "PISO METÁLICO - GARRA, TRAVA E PERFURAÇÃO", esc: 10, fn: detPisoM, ext: [[-30, 840], [-250, 270]] },
    { n: 7, titulo: "ACESSO - ALÇAPÃO COM ESCADA / ESCADA EXTERNA", esc: 30, fn: detAcessoM, ext: [[-360, 1900], [-60, 2250]] }
  ];
  function detalhesAtivos() { return MULTI ? DETALHES_M : DETALHES; }
  function desenharDetalhes(ctx, area, cols) {
    var D = ctx.D, A = AP(), LD = detalhesAtivos(), nL = Math.ceil(LD.length / cols), gw = 4, cw = (area[2] - gw * (cols - 1)) / cols, ch = area[3] / nL;
    LD.forEach(function (dt, i) {
      var c = i % cols, r = Math.floor(i / cols), x = area[0] + c * (cw + gw), y = area[1] + r * ch;
      var hT = A.tituloVista(D, x + 2, y, typeof dt.titulo === "function" ? dt.titulo(ctx.C) : dt.titulo, "ESC 1:" + dt.esc, dt.n);
      D.ret(x, y, cw, ch - 3, "MET-FINA");
      var det = new Det(ctx, x, y + hT, cw, ch - 3 - hT, 1 / dt.esc, dt.ext);
      try { dt.fn(det); } catch (e) { ctx.avisos.push("Detalhe " + dt.n + ": " + (e && e.message ? e.message : e)); D.texto(x + 6, y + hT + 12, "ERRO AO DESENHAR ESTE DETALHE", ctx.E.T.nota, { cor: VERMELHO }); }
    });
  }

  /* ================================================================ TABELAS (com quebra de linha) */
  function tabelaQ(D, E, x, y, cols, linhas, o) {
    o = o || {};
    var A = AP(), T = E.T, fs = o.fs || T.tabela, fsc = o.fsc || T.tabelaCab, mn = T.minimo, W = 0;
    cols.forEach(function (c) { W += c.w; });
    function fit(t, w, f) { var mx = 0; txt(t).split(/\s+/).forEach(function (p) { mx = Math.max(mx, A.largTexto(p, f)); }); return mx > w ? Math.max(mn, f * w / mx) : f; }
    function celula(v, c, f) {
      var oo = (v && typeof v === "object") ? v : { t: txt(v) }, w = c.w - 1.8, f2 = fit(oo.t, w, f), ls = A.quebrar(oo.t, f2, w);
      if (!ls.length) ls = [""];
      return { ls: ls, f: f2, cor: oo.cor, al: oo.al || c.al || "E", attr: oo.attr || "" };
    }
    var cab = cols.map(function (c) {
      var ls0 = Array.isArray(c.t) ? c.t : [c.t], f = fsc, ls = [];
      ls0.forEach(function (t) { f = Math.min(f, fit(t, c.w - 1.0, fsc)); });
      ls0.forEach(function (t) { A.quebrar(t, f, c.w - 1.0).forEach(function (q) { ls.push(q); }); });
      return { ls: ls, f: f };
    });
    var hc = Math.max.apply(null, cab.map(function (c) { return c.ls.length; })) * fsc * 1.3 + 2.4;
    var rows = [], H = hc;
    arr(linhas).forEach(function (L) {
      if (L && L.titulo != null) { var rt = { titulo: L.titulo, cor: L.cor, h: fs * 1.9 }; rows.push(rt); H += rt.h; return; }
      var cel = (L && L.total) || L, cs = cel.map(function (v, j) { return celula(v, cols[j], fs); });
      var nl = Math.max.apply(null, cs.map(function (z) { return z.ls.length; })), hf = Math.max.apply(null, cs.map(function (z) { return z.f; }));
      var r = { cs: cs, h: nl * hf * 1.28 + 1.5, hf: hf, nl: nl, total: !!(L && L.total) }; rows.push(r); H += r.h;
    });
    if (o.medir || !D) return { w: W, h: H };
    var xx = x;
    cols.forEach(function (c, j) {
      D.ret(xx, y, c.w, hc, "MET-TABELA");
      var cj = cab[j], lh = fsc * 1.3, y0 = y + hc / 2 - (cj.ls.length - 1) * lh / 2;
      cj.ls.forEach(function (t, q) { D.texto(xx + c.w / 2, y0 + q * lh, t, cj.f, { al: "C", meio: true }); });
      xx += c.w;
    });
    var yy = y + hc;
    rows.forEach(function (r) {
      if (r.titulo != null) { D.ret(x, yy, W, r.h, "MET-TABELA"); D.texto(x + 1.5, yy + r.h / 2, r.titulo, fs, { meio: true, cor: r.cor }); yy += r.h; return; }
      var cx = x;
      r.cs.forEach(function (z, j) {
        var c = cols[j]; D.ret(cx, yy, c.w, r.h, "MET-TABELA");
        var lh = z.f * 1.28, y0 = yy + r.h / 2 - (z.ls.length - 1) * lh / 2, tx = z.al === "E" ? cx + 0.9 : (z.al === "D" ? cx + c.w - 0.9 : cx + c.w / 2);
        z.ls.forEach(function (t, q) { if (t) D.texto(tx, y0 + q * lh, t, z.f, { al: z.al, meio: true, cor: z.cor, peso: r.total ? 0.12 : undefined, attr: (q === 0 ? z.attr : "") + ' data-tcorpo="1"' }); });
        cx += c.w;
      });
      yy += r.h;
    });
    return { w: W, h: yy - y };
  }
  /* bloco de texto corrido com título; devolve a altura */
  function blocoTexto(D, E, x, y, w, titulo, itens, o) {
    o = o || {};
    var T = E.T, h = o.h || T.nota, hq = o.hq || Math.min(T.quadro, h * 2.2), yy = y;
    if (titulo) { if (D) D.texto(x, yy + hq * 0.76, titulo, hq, { peso: 0.28 }); yy += hq * 0.76 + hq * 0.55 + 1.2; }
    var A = AP();
    arr(itens).forEach(function (it, i) {
      var oo = (it && typeof it === "object") ? it : { t: txt(it) }, pre = o.numerar ? (i + 1) + "- " : (o.marcador === false ? "" : "- "), rec = A.largTexto(pre, h);
      var ls = A.quebrar(oo.t, h, w - rec);
      if (D) D.texto(x, yy + h * 0.76, pre, h, { cor: oo.cor });
      ls.forEach(function (s) { if (D) D.texto(x + rec, yy + h * 0.76, s, h, { cor: oo.cor }); yy += h * 1.42; });
      yy += 0.7;
    });
    return yy - y;
  }

  /* ================================================================ O QUE A PRANCHA DIZ (uma fonte só: o modelo, a lista e o cálculo) */
  function calcDe(calc) {
    if (!calc) return { c: null, passou: null };
    if (calc.calc && !calc.verificacoes) return { c: calc.calc, passou: calc.passou };
    return { c: calc, passou: calc.passou };
  }
  /* PENDÊNCIAS DO RT: o que o cálculo não pôde fechar por falta de dado (V0, solo, face onde ancorar, categoria/tela…). Cada uma diz o CAMPO a preencher e o ITEM da norma.
     ⚠ Sem isto a prancha saía com cara de projeto pronto enquanto o vento e o solo nem tinham sido verificados. */
  var PEND_MAPA = [
    { re: /vento paralelo/i, campo: "vento paralelo conferido pelo RT e justificativa", norma: "NBR 6123:2023 - vento paralelo" },
    { re: /V0|isopleta|latitude/i, campo: "V0 da obra (m/s) ou latitude/longitude", norma: "NBR 6123:2023 - mapa de isopletas (V0)" },
    { re: /categoria|rugosidade/i, campo: "categoria de rugosidade do terreno (I a V)", norma: "NBR 6123:2023 - categorias de terreno (S2)" },
    { re: /sombreamento|tela/i, campo: "sombreamento da tela (0 a 1) e cf da tela", norma: "NBR 6123:2023 7.5 - tela" },
    { re: /solo|sigmaSolo/i, campo: "tensão admissível do solo (kPa) e confirmação do RT", norma: "NBR 6494 4.5.1 - apoio compatível com o solo" },
    { re: /faceAte|onde ancorar|ancTopo/i, campo: "faceAte: cota até onde há face/estrutura para ancorar (m)", norma: "NBR 6494 4.5.2 - ancoragem" },
    { re: /luva|capLuva/i, campo: "capLuva: capacidade da luva à flexão (kN.m)", norma: "NR-18 18.12 - ligação do fabricante" },
    { re: /guardaLaudo|laudo/i, campo: "laudo do guarda-corpo (carga de 350 N)", norma: "NR-18 18.9.4.2; NBR 6494 3.2.1" }
  ];
  /* campos do RT do MULTIDIRECIONAL (AndaimeMultiCalc): ficam na frente do mapa quando o modelo é multi; a pendência pode vir como texto OU como objeto {campo, tipo, rotulo|texto, fonte} */
  var PEND_MAPA_M = [
    { re: /capLigAxialKgf|ligacaoAxialRT/i, campo: "capLigAxialKgf: capacidade axial da ligação travessa-roseta (kgf), da tabela do fabricante", norma: "catálogo do fabricante do locador (M01/M02) - confirmado pelo RT" },
    { re: /capNoKgf|ligação travessa.roseta/i, campo: "capNoKgf: carga admissível da ligação travessa-roseta por ponta (kgf), da tabela do fabricante", norma: "catálogo do fabricante do locador (M01/M02) - confirmado pelo RT" },
    { re: /capDiagKgf/i, campo: "capDiagKgf: carga axial admissível da diagonal e da ligação (kgf)", norma: "catálogo do fabricante do locador (M01/M02) - confirmado pelo RT" },
    { re: /capBaseMultiKgf|base regul/i, campo: "capBaseMultiKgf: carga admissível da base regulável/peça base (kgf)", norma: "catálogo do fabricante (M02 p.10) - confirmado pelo RT" },
    { re: /espigaoTracaoRT|espigão|pino trava/i, campo: "espigaoTracaoRT (tração do espigão/pino trava) e justificativa do RT", norma: "fabricante do locador; sem fonte pública" },
    { re: /cunhaContinua/i, campo: "cunhaContinua + justificativa do RT (rigidez da ligação pela cunha)", norma: "tabela do fabricante da ligação" },
    { re: /paraleloInternoRT/i, campo: "paraleloInternoRT + justificativa do RT (flambagem paralela da linha interna)", norma: "NBR 8800 - conferência do RT" }
  ];
  function pendenciasRT(calc, modelo) {
    var c = calcDe(calc).c, out = [], vistos = {}, mapa = ehMulti(modelo) ? PEND_MAPA_M.concat(PEND_MAPA) : PEND_MAPA;
    function add(item) {
      var o = (item && typeof item === "object") ? item : null, texto = o ? txt(o.rotulo || o.texto || o.titulo || o.motivo || o.campo) : txt(item), m = null;
      mapa.forEach(function (p) { if (!m && p.re.test(texto + (o ? " " + txt(o.campo) : ""))) m = p; });
      var campo = o && o.campo ? txt(o.campo) + (o.tipo === "numero" ? " (número)" : (o.tipo === "marca" ? " (marcar + justificativa)" : (o.tipo === "confirma" ? " (confirmar)" : ""))) : (m ? m.campo : "decisão do responsável técnico (descrita ao lado)");
      var chave = o && o.campo ? txt(o.campo) : (m ? m.campo : texto.slice(0, 60)); if (vistos[chave]) return; vistos[chave] = 1;
      out.push({ texto: texto, campo: campo, norma: o && o.fonte ? txt(o.fonte) : (m ? m.norma : "ver a verificação no memorial") });
    }
    if (!c) return out;
    arr(c.verificacoes).forEach(function (v) { if (v.estado === "nao_verificado") add(txt(arr(v.ressalvas)[0] || v.texto || v.titulo || v.id)); });
    arr(c.pendencias).forEach(function (t) { add(t); });
    arr(modelo && modelo.pendencias).forEach(function (t) { add(t); });
    return out;
  }
  function situacao(calc, modelo) {
    var cc = calcDe(calc), c = cc.c;
    if (!c || !arr(c.verificacoes).length) return { liberado: false, pendente: false, pendencias: [], motivo: "cálculo não executado", faixa: "NÃO LIBERADO - CÁLCULO NÃO EXECUTADO", falhas: [] };
    var fal = c.verificacoes.filter(function (v) { return v.estado === "falha"; }), pend = pendenciasRT(calc, modelo);
    if (fal.length || cc.passou === false) return { liberado: false, pendente: pend.length > 0, pendencias: pend, motivo: "verificação com falha", faixa: "NÃO LIBERADO - VERIFICAÇÃO COM FALHA", falhas: fal.map(function (v) { return v.titulo || v.id; }) };
    if (pend.length) return { liberado: false, pendente: true, pendencias: pend, motivo: "pendências do responsável técnico abertas", faixa: "PENDENTE - NÃO LIBERAR ATÉ O RESPONSÁVEL TÉCNICO RESOLVER AS PENDÊNCIAS (ver AND-05)", falhas: [] };
    return { liberado: true, pendente: false, pendencias: [], motivo: "", faixa: "", falhas: [] };
  }  var ESTADO_TXT = { ok: "ATENDE", atencao: "ATENÇÃO", falha: "NÃO ATENDE", nao_verificado: "NÃO VERIFICADO" };
  function usoTxt(v) { return v.uso == null || !isFinite(v.uso) ? "-" : br(Math.min(v.uso, 99.99) * 100, 0) + " %"; }
  /* o quadro de verificações — o MESMO texto na prancha e no memorial (andaimememorial.js lê daqui) */
  function quadroVerificacoes(calc) {
    var c = calcDe(calc).c;
    return arr(c && c.verificacoes).map(function (v) {
      return { id: v.id, peca: txt(v.titulo || v.id), esforco: txt(v.solicitante), resistencia: txt(v.resistente), uso: usoTxt(v), usoNum: v.uso, estado: v.estado, situacao: ESTADO_TXT[v.estado] || txt(v.estado) };
    });
  }
  function quadroReacoes(calc) {
    var c = calcDe(calc).c;
    return arr(c && c.reacoes).map(function (r) {
      return { base: r.base, poste: r.poste, servico_kN: br(r.servico_kN, 2), servico_kgf: br(r.servico_kgf, 0), elu_kN: br(r.elu_kN, 2), elu_kgf: br(r.elu_kgf, 0), kN: r.servico_kN };
    });
  }
  function textoPisos(m) {
    m = txt(m).toLowerCase();
    return m === "todos" ? "todos os pisos com a carga cheia" : (m === "topo" ? "só o piso do topo com a carga cheia" : "piso do topo com a carga cheia e os demais com 50 %");
  }
  function cargaTrabalho(calc, opcoes) {
    var c = calcDe(calc).c, q = opcoes && opcoes.qServ != null ? num(opcoes.qServ, null) : (c && c.parametros && c.parametros.qServ != null ? c.parametros.qServ : null);
    var pis = opcoes && opcoes.pisosCarregados != null ? opcoes.pisosCarregados : (c && c.parametros ? c.parametros.pisosCarregados : null);
    return { q: q, kgf: q == null ? null : q * 101.9716, pisos: pis };
  }
  /* premissas do RT que o multi guarda: números informados + toda «…Justificativa» preenchida (nada inventado: o que não foi informado não aparece aqui, aparece em COMO LIBERAR) */
  var RT_NUM_MULTI = [["capNoKgf", "Ligação travessa-roseta (capNoKgf)", "kgf"], ["capLigAxialKgf", "Ligação axial travessa-roseta (capLigAxialKgf)", "kgf"], ["capDiagKgf", "Diagonal e ligação (capDiagKgf)", "kgf"], ["capBaseMultiKgf", "Base regulável (capBaseMultiKgf)", "kgf"], ["espigaoTracaoRT", "Espigão/pino trava à tração (espigaoTracaoRT)", ""]];
  function premissasRT(P) {
    var out = [];
    RT_NUM_MULTI.forEach(function (q) { if (P[q[0]] != null && isFinite(P[q[0]]) && Number(P[q[0]]) > 0) out.push(q[1] + ": " + br(P[q[0]], 1) + (q[2] ? " " + q[2] : "") + " (informado pelo RT)"); });
    Object.keys(P).forEach(function (k) { if (k.charAt(0) !== "_" && typeof P[k] === "string" && /Justificativa$/.test(k) && txt(P[k]).trim()) out.push(k.replace(/Justificativa$/, "") + ": " + txt(P[k]).trim()); });
    return out;
  }
  function dadosProjetoMulti(ctx) {
    var M = ctx.M, c = calcDe(ctx.calc).c, P = (c && c.parametros) || {}, ct = cargaTrabalho(ctx.calc, ctx.opcoes), v = c && c.vento, out = [], mo = ctx.modelo, V = mo.vertical || {}, par = ctx.C.par;
    out.push(["Tipo", "andaime multidirecional, linha " + (mo.linha === "estribo" ? "estribo (laço, pinça e chaveta)" : "roseta (disco a cada 0,50 m, travessa de cunha)") + "; peças de catálogo do locador"]);
    out.push(["Dimensões", "comprimento " + br(M.comprimento, 2) + " m; módulo (entre eixos) " + br(M.largura, 2) + " m; piso do topo a " + br(M.alturaPiso, 2) + " m"]);
    out.push(["Vãos / levantes / pisos", M.nVaos + " / " + M.nLevantes + " / " + (M.nLevantes)]);
    out.push(["Nós do poste", "passo " + br(num(V.passo, 0.5), 2) + " m; 1º nó a " + br(num(V.y0, 0), 3) + " m (calço + base regulável + peça base)"]);
    out.push(["Carga de trabalho admissível (NBR 6494 3.1.4)", ct.q == null ? { t: "[CARGA DE SERVIÇO - definir no cálculo]", cor: VERMELHO } : br(ct.q, 2) + " kN/m² (" + br(ct.kgf, 0) + " kgf/m²) por piso; " + textoPisos(ct.pisos)]);
    out.push(["Vento (NBR 6123:2023)", v && v.ok ? "V0 = " + br(v.V0, 0) + " m/s; categoria " + txt(v.categoria) + "; S1 = " + br(v.S1, 2) + "; S3 = " + br(v.S3, 2) : { t: "não informado - vento NÃO VERIFICADO (V0 da obra)", cor: VERMELHO }]);
    out.push(["Aço do tubo", P.fy ? "fy = " + br(P.fy, 0) + " MPa; fu = " + br(P.fu, 0) + " MPa" : "-"]);
    out.push(["Ancoragem", "gancho (ou tubo de amarração com 2 abraçadeiras fixas) + olhal + chumbador 5/8\"; malha " + br(par.ancH, 2) + " x " + br(par.ancV, 2) + " m; capacidade adotada " + br(P.capAncoragem, 2) + " kN (confirmar pelo RT)"]);
    out.push(["Apoio", P.sigmaSolo != null ? "tensão admissível do solo " + br(P.sigmaSolo, 0) + " kPa" + (P.sigmaSoloConfirmado ? " (confirmada pelo RT)" : " (NÃO confirmada)") : { t: "tensão admissível do solo NÃO informada", cor: VERMELHO }]);
    out.push(["Tela de proteção", mo.tela && mo.tela.area > 0 ? br(mo.tela.area, 2) + " m²" : "sem tela no projeto"]);
    var pt = ctx.tabela.total.pesoTotal;
    out.push(["Peso do andaime (lista de locação)", pt == null ? { t: "peso total sem fonte em alguma peça (ver a relação); " + ctx.tabela.total.qtd + " peças", cor: VERMELHO } : br(pt, 0) + " kg; " + ctx.tabela.total.qtd + " peças"]);
    var pr = premissasRT(P);
    out.push(["Premissas do RT", pr.length ? pr.join(" | ") : { t: "nenhuma informada (ver COMO LIBERAR)", cor: VERMELHO }]);
    return out;
  }
  function dadosProjeto(ctx) {
    if (ehMulti(ctx.modelo)) return dadosProjetoMulti(ctx);
    var M = ctx.M, par = ctx.C.par, c = calcDe(ctx.calc).c, P = (c && c.parametros) || {}, ct = cargaTrabalho(ctx.calc, ctx.opcoes), v = c && c.vento, out = [];
    out.push(["Tipo", "tubo-roll / tubo equipado (tubo e abraçadeira), " + txt(ctx.modelo.tubo && ctx.modelo.tubo.rotulo ? ctx.modelo.tubo.rotulo : "Tubo Ø48,3 × 3,0 mm")]);
    out.push(["Dimensões", "comprimento " + br(M.comprimento, 2) + " m; largura " + br(M.largura, 2) + " m; piso do topo a " + br(M.alturaPiso, 2) + " m"]);
    out.push(["Vãos / levantes / pisos", M.nVaos + " / " + M.nLevantes + " / " + M.nPisos]);
    out.push(["Carga de trabalho admissível (NBR 6494 3.1.4)", ct.q == null ? { t: "[CARGA DE SERVIÇO - definir no cálculo]", cor: VERMELHO } : br(ct.q, 2) + " kN/m² (" + br(ct.kgf, 0) + " kgf/m²) por piso; " + textoPisos(ct.pisos)]);
    out.push(["Vento (NBR 6123:2023)", v && v.ok ? "V0 = " + br(v.V0, 0) + " m/s; categoria " + txt(v.categoria) + "; S1 = " + br(v.S1, 2) + "; S3 = " + br(v.S3, 2) : { t: "não informado - vento NÃO VERIFICADO (V0 da obra)", cor: VERMELHO }]);
    out.push(["Aço do tubo", P.fy ? "fy = " + br(P.fy, 0) + " MPa; fu = " + br(P.fu, 0) + " MPa" : "-"]);
    out.push(["Ancoragem", par.ancoragem === "tubo" ? "tubo de amarração; malha " + br(par.ancH, 2) + " x " + br(par.ancV, 2) + " m; capacidade adotada " + br(P.capAncoragem, 2) + " kN (confirmar pelo RT)" : txt(par.ancoragem)]);
    out.push(["Apoio", P.sigmaSolo != null ? "tensão admissível do solo " + br(P.sigmaSolo, 0) + " kPa" + (P.sigmaSoloConfirmado ? " (confirmada pelo RT)" : " (NÃO confirmada)") : { t: "tensão admissível do solo NÃO informada", cor: VERMELHO }]);
    out.push(["Tela de proteção", ctx.modelo.tela && ctx.modelo.tela.area > 0 ? br(ctx.modelo.tela.area, 2) + " m²" : "sem tela no projeto"]);
    out.push(["Peso do andaime (lista de locação)", br(ctx.tabela.total.pesoTotal, 0) + " kg; " + ctx.tabela.total.qtd + " peças"]);
    return out;
  }
  function textoDado(d) { return (d[1] && typeof d[1] === "object") ? d[1].t : d[1]; }
  function dimPeca(ctx, l) {
    var P = ctx.C.par, cat = AN() && AN().CATALOGO ? AN().CATALOGO.pecas : {};
    if (ctx.C.multi) return txt(l.dimensoes).replace(/×/g, "x") + (l.refCatalogo ? " (ref. " + l.refCatalogo + ")" : "");
    if (l.cod === "tubo") return "Tubo Ø48,3x3,0 - L=" + mmTxt(l.comp);
    if (l.cod === "pranchaMadeira") { var pm = cat.pranchaMadeira || { largura: 0.3, esp: 0.038 }; return "Pranchão " + br(l.comp, 2) + " x " + br(pm.largura, 2) + " x " + br(pm.esp, 3) + " m"; }
    if (l.cod === "rodapeMadeira") return "Rodapé " + br(l.comp, 2) + " x " + br(P.rodape, 2) + " x " + br(P.rodapeEsp, 3) + " m";
    if (l.cod === "alcapao") return "Portinhola " + br(l.comp, 2) + " x 0,60 m";
    if (l.cod === "pisoMetalico") return "Piso metálico " + br(l.comp, 2) + " x 0,37 m";
    if (l.cod === "calco") return "0,30 x 0,038 x 0,50 m";
    if (l.cod === "escadaMao") return "Escada " + br(l.comp, 2) + " x 0,40 m";
    return txt(l.dimensoes).replace(/×/g, "x");
  }
  function marcaDe(l) { if (MULTI) return MARCA_COD_MULTI[l.cod] || ""; return l.cod === "tubo" ? (MARCA_TUBO[l.papelTubo] || "") : (MARCA_COD[l.cod] || ""); }
  function linhasRelacao(ctx) {
    var rows = [], somaComp = 0, semPeso = false;
    ctx.lista.forEach(function (l) {
      var mk = marcaDe(l), q = l.cod === "tela" ? br(l.qtd, 2) : String(l.qtd);
      if (l.cod !== "tela" && l.comp != null) somaComp += l.comp * l.qtd;
      if (l.pesoTotal == null) semPeso = true;
      rows.push([{ t: String(l.item), al: "C" }, { t: q, al: "C", attr: " data-rel-item=\"" + l.item + "\"" }, l.peca + (mk ? " (" + mk + ")" : ""), dimPeca(ctx, l), { t: l.comp == null ? "" : br(l.comp, 2), al: "D" }, { t: l.area == null ? "" : br(l.area, 2), al: "D" },
        { t: l.pesoUnit == null ? "-" : br(l.pesoUnit, 2), al: "D", cor: l.pesoUnit == null ? VERMELHO : undefined }, { t: l.pesoTotal == null ? "-" : br(l.pesoTotal, 2), al: "D", cor: l.pesoTotal == null ? VERMELHO : undefined }]);
    });
    var tt = ctx.tabela.total;
    rows.push({ total: [{ t: "", al: "C" }, { t: String(tt.qtd), al: "C" }, "TOTAL GERAL", "", { t: br(somaComp, 2), al: "D" }, { t: br(tt.area, 2), al: "D" }, "", { t: br(tt.pesoTotal, 2), al: "D" }] });
    return { rows: rows, semPeso: semPeso };
  }
  var COLS_REL = [["ITEM", 6], ["QNT.", 7], ["PEÇA", 40], ["DIMENSÕES", 46], [["COMP.", "(m)"], 9], [["ÁREA", "(m²)"], 9], [["PESO UNIT.", "(kg)"], 10], [["PESO TOTAL", "(kg)"], 11]];
  function colsRelacao(f, wf) { return COLS_REL.map(function (c, i) { return { t: c[0], w: c[1] * f * ((i === 2 || i === 3) && wf ? wf : 1), al: "E" }; }); }
  /* a relação de materiais numa ou duas colunas lado a lado (k); medir = só o tamanho */
  function desenharRelacao(ctx, x, y, f, k, medir, fs) {
    var D = ctx.D, E = ctx.E, R = linhasRelacao(ctx), cols = colsRelacao(f, ctx.wfRel), rows = R.rows, tot = rows.pop(), por = Math.ceil(rows.length / k), W = 0, Hm = 0, gap = 4, i, hTit = 0;
    var ws = cols.reduce(function (s, c) { return s + c.w; }, 0), hs = 0;
    var T = E.T, tit = T.nota * 1.15;
    var blocos = [];
    for (i = 0; i < k; i++) {
      var parte = rows.slice(i * por, (i + 1) * por); if (i === k - 1) parte = parte.concat([tot]);
      blocos.push(parte);
    }
    var opT = fs ? { fs: fs, fsc: Math.max(E.T.minimo, fs * 1.2) } : {};
    var alturas = blocos.map(function (b) { return tabelaQ(D, E, 0, 0, cols, b, { medir: true, fs: opT.fs, fsc: opT.fsc }).h; });
    Hm = Math.max.apply(null, alturas); hTit = tit * 1.5 + 2;
    var nota = R.semPeso ? ctx.tabela.avisoPeso || "Linhas sem peso de fonte não entram no total." : "";
    var hNota = nota && ctx.notaBaixo ? 5 : 0;   /* a nota vai na linha do título (à direita) ou, em coluna estreita, embaixo */
    var res = { w: ws * k + gap * (k - 1), h: hTit + Hm + hNota + 2, linhas: rows.length + 1 };
    if (medir) return res;
    D.texto(x + 1, y + tit * 0.9, "RELAÇÃO DE MATERIAIS (PEDIDO DE LOCAÇÃO)", tit, { peso: 0.2, attr: ' data-titulo="1"' });
    blocos.forEach(function (b, j) { tabelaQ(D, E, x + j * (ws + gap), y + hTit, cols, b, opT); });
    if (nota && ctx.notaBaixo) D.texto(x + 1, y + hTit + Hm + 3.4, nota, T.minimo, { cor: VERMELHO }); else if (nota) D.texto(x + res.w - 1, y + tit * 0.9, nota, T.minimo, { al: "D", cor: VERMELHO });
    return res;
  }

  /* ================================================================ NOTAS (coluna da direita, acima do carimbo) */
  function blocosNotasAnd(ctx) {
    var P = ctx.C.par, M = ctx.M, ct = cargaTrabalho(ctx.calc, ctx.opcoes), sit = ctx.sit, notas = [];
    notas.push("Nunca alterar o andaime sem comunicação prévia ao responsável técnico; qualquer problema na montagem → consultar para revisão do projeto.");
    notas.push("Todas as medidas em milímetros e níveis em metros, salvo indicação. Não medir no desenho.");
    notas.push(ct.q == null ? { t: "Carga de trabalho admissível: [CARGA DE SERVIÇO - definir no cálculo] por piso (NBR 6494 3.1.4). Não empilhar material.", cor: VERMELHO }
      : "Carga de trabalho admissível: " + br(ct.q, 2) + " kN/m² (" + br(ct.kgf, 0) + " kgf/m²) por piso, " + textoPisos(ct.pisos) + " (NBR 6494 3.1.4). Não empilhar material.");
    notas.push("Montagem e desmontagem por trabalhadores capacitados, com SPIQ, ferramentas amarradas e área isolada e sinalizada (NR-18 18.12.6); nunca um montador só (NBR 6494 3.3.5).");
    notas.push("Uso somente após o registro formal de liberação assinado (NR-18 18.12.4) e cartão verde no acesso.");
    if (ctx.C.multi) {
      notas.push("Andaime multidirecional (linha " + ctx.C.linha + "): peças de catálogo do locador; travessa encaixada em cada nó por cunha batida até o fim (nós a cada 0,50 m); pino trava em toda emenda de poste; nunca trocar peça por tubo comum.");
      notas.push("Guarda-corpo: travessão a " + br(ctx.C.gd.g, 2) + " m e intermediário a " + br(ctx.C.gd.it, 2) + " m do piso, rodapé de " + br(ctx.C.gd.rd, 2) + " m (NR-18 18.12.15.2); montar o do nível de cima antes de estender os postes.");
    } else notas.push("Andaime tipo " + txt(ctx.opcoes.tipo || "tubo-roll") + ": tubo Ø48,3 x " + br(AN() && AN().CATALOGO ? AN().CATALOGO.tubo.paredeNominalMm : 3, 1) + " mm, abraçadeiras forjadas/prensadas conforme catálogo do locador.");
    notas.push("Ancoragens conforme planta, no máximo 6,00 m entre si e uma a cada 36 m² (NBR 6494 4.5.2); não retirar ancoragem antes de desmontar o levante de cima.");
    if (!sit.liberado) notas.push({ t: "ANDAIME NÃO LIBERADO (" + sit.motivo + "). Não montar nem usar até o responsável técnico corrigir o projeto e refazer o cálculo.", cor: VERMELHO });
    var pend = arr(calcDe(ctx.calc).c && calcDe(ctx.calc).c.pendencias);
    if (pend.length) notas.push({ t: "Pendências do cálculo para o responsável técnico: ver " + (ctx.compacto ? "o quadro COMO LIBERAR" : "AND-05 / memorial") + " (" + pend.length + ").", cor: VERMELHO });
    notas.push("Marca CONFIRMAR PELO RESPONSÁVEL TÉCNICO em valores de fonte secundária (peso e capacidade de peça de locador, apostilas).");
    var marcas = Object.keys(marcasAtivas()).map(function (k) { return k + " " + marcasAtivas()[k]; }).join("; ") + ".";
    var dd = dadosProjeto(ctx);
    if (ctx.compacto) dd = dd.filter(function (d) { return /^(Dimensões|Vãos|Peso)/.test(d[0]) || (!(ctx.sit.pendencias && ctx.sit.pendencias.length) && /^(Vento|Apoio)/.test(d[0])); });   /* a A3 única não tem o memorial resumido: só o essencial na coluna */
    var dados = dd.map(function (d) { var tt = textoDado(d); return (d[1] && typeof d[1] === "object") ? { t: d[0] + ": " + tt, cor: d[1].cor } : d[0] + ": " + tt; });
    var normas = ctx.compacto ? [PADRAO_AND.normas.map(function (x) { return x.replace(/\.$/, ""); }).join("; ") + "."] : PADRAO_AND.normas;
    var out = [{ titulo: "NOTAS GERAIS", itens: notas, numerar: true }, { titulo: "NORMAS UTILIZADAS", itens: normas, numerar: !ctx.compacto }, { titulo: "MARCAS DAS PEÇAS", itens: [marcas], numerar: false },
      { titulo: "DADOS DO PROJETO", itens: dados, numerar: false }];
    if (ctx.compacto && sit.pendencias && sit.pendencias.length) out.push({ titulo: "COMO LIBERAR (PENDÊNCIAS DO RT)", numerar: true, itens: sit.pendencias.map(function (p) { return { t: p.campo + " - " + p.norma, cor: VERMELHO }; }) });
    return out;
  }

  /* ================================================================ FAIXA «NÃO LIBERADO» */
  function faixa(D, E, g, texto) {
    var x = g.area.x, y = g.area.y, w = g.area.w, h = 7.4;
    var fz = E.T.titulo; while (fz > E.T.nota && AP().largTexto(texto, fz) > w - 6) fz -= 0.1;
    D.ret(x, y, w, h, "MET-PEND");
    D.texto(x + w / 2, y + h / 2, texto, fz, { al: "C", meio: true, cor: VERMELHO, peso: 0.2, attr: ' data-faixa="' + (/^PENDENTE/.test(texto) ? "pendente" : "nao-liberado") + '"' });
    return h + 2;
  }

  /* ================================================================ LAYOUT (força bruta: a maior escala de desenho que cabe) */
  function permutar(v) { if (v.length <= 1) return [v.slice()]; var out = []; v.forEach(function (x, i) { permutar(v.slice(0, i).concat(v.slice(i + 1))).forEach(function (r) { out.push([x].concat(r)); }); }); return out; }
  function melhorLayout(blocos, W, H, gap) {
    var best = null, nomes = Object.keys(blocos);
    permutar(nomes).forEach(function (perm) {
      for (var mask = 0; mask < (1 << (perm.length - 1)); mask++) {
        var rows = [[perm[0]]], i;
        for (i = 1; i < perm.length; i++) { if (mask & (1 << (i - 1))) rows.push([perm[i]]); else rows[rows.length - 1].push(perm[i]); }
        var ok = true, hTot = 0, wMax = 0;
        rows.forEach(function (r) {
          var w = (r.length - 1) * gap, h = 0; r.forEach(function (nm) { w += blocos[nm].w; h = Math.max(h, blocos[nm].h); });
          if (w > W + 1e-6) ok = false; hTot += h; wMax = Math.max(wMax, w);
        });
        hTot += (rows.length - 1) * gap;
        if (!ok || hTot > H + 1e-6) continue;
        var score = hTot + rows.length * 2 + (W - wMax) * 0.05;
        if (!best || score < best.score) best = { rows: rows, score: score, h: hTot };
      }
    });
    return best;
  }
  function posicionar(lay, blocos, area, gap) {
    var pos = {}, folgaV = Math.max(0, area.h - lay.h), gv = gap + Math.min(14, folgaV / Math.max(1, lay.rows.length)), y = area.y;
    lay.rows.forEach(function (r) {
      var w = 0, h = 0; r.forEach(function (nm) { w += blocos[nm].w; h = Math.max(h, blocos[nm].h); });
      var folgaH = Math.max(0, area.w - w - (r.length - 1) * gap), gh = gap + Math.min(30, r.length > 1 ? folgaH / (r.length - 1) : 0), x = area.x + (r.length > 1 ? 0 : Math.min(20, folgaH / 2));
      r.forEach(function (nm) { pos[nm] = [x, y]; x += blocos[nm].w + gh; });
      y += h + gv;
    });
    return pos;
  }
  function escalasPossiveis() { return [25, 50, 75, 100].concat(PADRAO_AND.escalasExtra); }

  /* ================================================================ AS FOLHAS */
  function areaUtil(c) {
    var g = c.geo, a = { x: g.area.x, y: g.area.y, w: g.area.w, h: g.area.h };
    if (!c.sit.liberado) { var dh = faixa(c.D, c.E, g, c.sit.faixa); a.y += dh; a.h -= dh; }
    return a;
  }
  function desenharBloco(c, nome, x, y, s, o) {
    var v = new Vista(c, nome, x, y, s, o);
    if (v.tipo === "planta") desenharPlanta(c, v); else if (v.tipo === "corte") desenharCorte(c, v, o); else desenharElevacao(c, v);
    c.vistas.push(v);
    return v;
  }
  /* escolhe a maior escala de desenho (menor denominador) em que o layout cabe */
  function escolher(c, area, fabricaBlocos) {
    var gap = 5, esc = escalasPossiveis(), i, ultimo = null;
    for (i = 0; i < esc.length; i++) {
      var s = 1000 / esc[i], variantes = fabricaBlocos(s);
      for (var q = 0; q < variantes.length; q++) {
        var lay = melhorLayout(variantes[q], area.w, area.h, gap);
        if (lay) return { esc: esc[i], s: s, blocos: variantes[q], lay: lay, pos: posicionar(lay, variantes[q], area, gap) };
      }
      ultimo = { esc: esc[i], s: s, variantes: variantes };
    }
    return null;
  }
  /* o iso é FLEXÍVEL: ocupa toda a sobra da linha dele (largura) e do que sobrou da folha (altura) — a folha não pode ter vazio maior que um quadrante */
  function isoAspecto(C) {
    var pr = projIso(Math.atan(1 / Math.SQRT2), false), a = 1e9, b = -1e9, c0 = 1e9, d = -1e9;
    C.tubos.forEach(function (t) { [t.a, t.b].forEach(function (p) { var q = pr(p); a = Math.min(a, q[0]); b = Math.max(b, q[0]); c0 = Math.min(c0, q[1]); d = Math.max(d, q[1]); }); });
    return isFinite(a) && d > c0 ? (b - a) / (d - c0) : 1;
  }
  function esticarIso(lay, blocos, area, gap, asp) {
    var row = null; lay.rows.forEach(function (r) { if (r.indexOf("iso") >= 0) row = r; });
    if (!row) return;
    var outros = row.filter(function (nm) { return nm !== "iso"; }), wOut = 0, hOut = 0;
    outros.forEach(function (nm) { wOut += blocos[nm].w; hOut = Math.max(hOut, blocos[nm].h); });
    var wLivre = area.w - wOut - gap * (row.length - 1), extra = Math.max(0, area.h - lay.h);
    blocos.iso.h = Math.max(blocos.iso.h, hOut) + extra;
    blocos.iso.w = Math.max(blocos.iso.w, Math.min(wLivre, asp * (blocos.iso.h - 23) + 14));   /* a largura que o desenho precisa na altura dada; a sobra vira respiro, não vazio dentro do bloco */
    lay.h += extra; lay.esticado = true;
  }
  /* notas da A3 única: três colunas no rodapé da área (a coluna da direita fica com a relação de materiais) */
  function notasRodape(c, area, desenhar, y0) {
    var T = c.E.T, A = AP(), blocos = c.blocosNotas, gap = 5, w = (area.w - 2 * gap) / 3, fs = [T.nota, T.nota * 0.92, T.nota * 0.84, T.minimo], k, res = null;
    function pecas(f) {
      var out = [], hq = f * 1.5;
      blocos.forEach(function (b) {
        out.push({ tipo: "t", txt: b.titulo, h: hq * 0.76 + hq * 0.55 + 1.2, hq: hq });
        arr(b.itens).forEach(function (it, i) {
          var oo = (it && typeof it === "object") ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = A.largTexto(pre, f), ls = A.quebrar(oo.t, f, w - rec);
          out.push({ tipo: "i", pre: pre, rec: rec, ls: ls, cor: oo.cor, h: ls.length * f * 1.42 + 0.7, f: f });
        });
        out.push({ tipo: "g", h: 2.5 });
      });
      return out;
    }
    function repartir(ps, limite) {
      var cols = [[]], hc = [0];
      ps.forEach(function (p, ix) {
        var c0 = cols.length - 1, prox = ps[ix + 1], need = p.h + (p.tipo === "t" && prox ? prox.h : 0);
        if (hc[c0] + need > limite && c0 < 2 && hc[c0] > 0) { cols.push([]); hc.push(0); c0++; }
        if (p.tipo === "g" && !hc[c0]) return;
        cols[c0].push(p); hc[c0] += p.h;
      });
      return { cols: cols, h: Math.max.apply(null, hc) };
    }
    for (k = 0; k < fs.length; k++) {
      var ps = pecas(fs[k]), tot = ps.reduce(function (s0, p) { return s0 + p.h; }, 0), rp = null;
      for (var lim = tot / 3; lim <= tot / 3 + 40; lim += 2) { rp = repartir(ps, lim); if (rp.cols.length <= 3 && rp.h <= lim + 20) break; }
      res = { f: fs[k], h: rp.h, cols: rp.cols }; if (rp.h <= 66 && rp.cols.length <= 3) break;
    }
    if (desenhar) res.cols.forEach(function (col, gi) {
      var x = area.x + gi * (w + gap), y = y0;
      col.forEach(function (p) {
        if (p.tipo === "t") D_texto(c.D, x, y + p.hq * 0.76, p.txt, p.hq, 0.28);
        else if (p.tipo === "i") { c.D.texto(x, y + p.f * 0.76, p.pre, p.f, { cor: p.cor }); p.ls.forEach(function (s1, q) { c.D.texto(x + p.rec, y + p.f * 0.76 + q * p.f * 1.42, s1, p.f, { cor: p.cor }); }); }
        y += p.h;
      });
    });
    return res;
  }
  function D_texto(D, x, y, s, h, peso) { D.texto(x, y, s, h, { peso: peso }); }  function folhaUnica(c) {
    var area = areaUtil(c), C = c.C, gapN = 4;
    var asp = isoAspecto(C), nr = notasRodape(c, area, false), hN = nr.h + gapN, areaV = { x: area.x, y: area.y, w: area.w, h: area.h - hN };
    var sel = escolher(c, areaV, function (s) {
      return [{ frontal: extVista("frontal", C, s), lateral: extVista("lateral", C, s), planta: extVista("planta", C, s), iso: { w: Math.max(70, Math.min(150, asp * 62 + 14)), h: 85 } }];
    });
    if (!sel) { c.avisos.push("Nenhuma escala de [25…500] coube na A3: o andaime é grande para uma folha só."); return { escala: "INDICADA" }; }
    esticarIso(sel.lay, sel.blocos, areaV, 5, asp);
    sel.pos = posicionar(sel.lay, sel.blocos, areaV, 5);
    var pos = sel.pos, s = sel.s, b = sel.blocos;
    ["frontal", "lateral", "planta"].forEach(function (nm) { desenharBloco(c, nm, pos[nm][0], pos[nm][1], s); });
    var isoRet = desenharIso(c, pos.iso[0], pos.iso[1], b.iso.w, b.iso.h, "ISOMÉTRICO", {});
    colocarBaloes(c);
    notasRodape(c, area, true, area.y + area.h - nr.h);
    D_sep(c, area, nr.h);
    c.escalaVista = sel.esc; c.isoInfo = isoRet;
    return { escala: "1:" + sel.esc };
  }
  function D_sep(c, area, hN) { c.D.linha(area.x, area.y + area.h - hN - 2.5, area.x + area.w, area.y + area.h - hN - 2.5, "MET-FINA"); }
  /* a relação de materiais na coluna da direita (A3 única), acima do carimbo */
  function relacaoNaColuna(Fd, c, geo) {
    var col = geo.coluna, car = geo.carimbo, x = col.x + 3, y = col.y + 4, w = col.w - 6, base = COLS_REL.reduce(function (s0, q) { return s0 + q[1]; }, 0), f = w / base, fsR = c.E.T.minimo;
    var cx = { D: Fd, E: c.E, C: c.C, lista: c.lista, tabela: c.tabela, modelo: c.modelo, notaBaixo: true }, m = desenharRelacao(cx, x, y, f, 1, true, fsR);
    Fd.linha(col.x, col.y, col.x, car.y, "MET-MOLDURA");
    desenharRelacao(cx, x, y, f, 1, false, fsR);
    /* o que sobrar da coluna recebe NORMAS e MARCAS (se couberem; senão ficam no rodapé da área) */
    var ys = y + m.h + 4;
    (c.naColuna || []).forEach(function (b) { ys += blocoTexto(Fd, c.E, x, ys, w, b.titulo, b.itens, { h: c.fonteColuna, hq: c.fonteColuna * 1.5, numerar: b.numerar }) + 3; });
    return m.h <= car.y - 3 - y;
  }
  /* decide, medindo, se NORMAS e MARCAS cabem sob a relação na coluna (A3 única) */
  function planejarColuna(blocos, geo, E, C, lista, tabela, modelo) {
    var col = geo.coluna, car = geo.carimbo, w = col.w - 6, base = COLS_REL.reduce(function (s0, q) { return s0 + q[1]; }, 0), T = E.T;
    var cx = { D: null, E: E, C: C, lista: lista, tabela: tabela, modelo: modelo, notaBaixo: true }, m = desenharRelacao(cx, 0, 0, w / base, 1, true, T.minimo), disp = car.y - 3 - (col.y + 4 + m.h) - 4;
    var cand = blocos.filter(function (b) { return b.titulo === "NORMAS UTILIZADAS" || b.titulo === "MARCAS DAS PEÇAS"; }), fs = [T.nota * 0.84, T.minimo], k;
    for (k = 0; k < fs.length; k++) {
      var h = 0; cand.forEach(function (b) { h += blocoTexto(null, E, 0, 0, w, b.titulo, b.itens, { h: fs[k], hq: fs[k] * 1.5, numerar: b.numerar }) + 3; });
      if (h <= disp) return { naColuna: cand, fonte: fs[k] };
    }
    return { naColuna: [], fonte: T.minimo };
  }
  /* ================================================================ CORTES (E10) — corte transversal A-A (vão corrente) e B-B (vão de acesso)
   * Plano de corte perpendicular ao andaime em X = sc (m, na cena do trecho). O que o plano CORTA (tubo longitudinal, pranchão, rodapé, diagonal da fachada) sai em seção;
   * o que fica por trás, dentro da janela [w0, w1] (o pórtico da estação seguinte: montantes, transversais, diagonal da largura, ancoragem, bases) sai em vista.
   * Tudo vem da MESMA cena do modelo (cenaDe): nada é desenhado à mão. */
  function ehLongo(t) { return Math.abs(t.b[0] - t.a[0]) > 0.05; }
  function desenharCorte(ctx, v, o) {
    var C = v.C, D = ctx.D, s = v.s, T = ctx.E.T, sc = o.sc, w0 = o.win[0], w1 = o.win[1], D0 = 0.0483, xL = v.x0, xR = v.x0 + v.e.bw;
    function Hy(Y) { return v.H(Y); } function Vy(y) { return v.V(y); }
    function dentroJanela(X) { return X >= w0 - 1e-6 && X <= w1 + 1e-6; }
    /* terreno com solo hachurado e a face existente hachurada (à esquerda) */
    D.linha(xL - 6, Vy(0), xR + 6, Vy(0), "MET-PRINCIPAL");
    hachuraPoli(D, [[xL - 6, Vy(0)], [xR + 6, Vy(0)], [xR + 6, Vy(0) + 4.5], [xL - 6, Vy(0) + 4.5]], 1.7);
    var hf = Hy(0), tf = Math.min(12, 0.30 * s);
    D.ret(hf - tf, Vy(C.yMax), tf, Vy(0) - Vy(C.yMax), "MET-PRINCIPAL"); hachuraPoli(D, [[hf - tf, Vy(C.yMax)], [hf, Vy(C.yMax)], [hf, Vy(0)], [hf - tf, Vy(0)]], 1.9);
    D.texto(hf - tf / 2, Vy(C.yMax * 0.5), "FACE DA ESTRUTURA EXISTENTE", T.nota * 0.9, { al: "C", rot: -90, meio: true });
    /* calços e bases (os do pórtico que fica por trás do corte) */
    C.calcos.forEach(function (c) { if (c.torre || !dentroJanela(c.pos[0])) return; var cy = Hy(c.pos[2]), w = Math.max(c.larg * s, 1), h = Math.max(c.esp * s, 0.6); D.ret(cy - w / 2, Vy(c.esp), w, h, "MET-SECUNDARIO"); hachuraPoli(D, [[cy - w / 2, Vy(c.esp)], [cy + w / 2, Vy(c.esp)], [cy + w / 2, Vy(c.esp) + h], [cy - w / 2, Vy(c.esp) + h]], 1.2); });
    C.bases.forEach(function (b) {
      if (b.torre || !dentroJanela(b.pos[0])) return; var cy = Hy(b.pos[2]), w = (C.multi ? 0.15 : 0.12) * s, y0 = b.y0; D.ret(cy - w / 2, Vy(y0 + 0.008), w, Math.max(0.008 * s, 0.5), "MET-PRINCIPAL");
      if (C.multi) { baseMulti(ctx, C, D, cy, b, s, Vy, function () {}); return; }
      D.linha(cy - 0.012 * s, Vy(y0 + 0.008), cy - 0.012 * s, Vy(y0 + b.h), "MET-FINA"); D.linha(cy + 0.012 * s, Vy(y0 + 0.008), cy + 0.012 * s, Vy(y0 + b.h), "MET-FINA");
    });
    /* tubos: montantes (vista), transversais e ancoragens (vista, deitados), diagonal da largura (vista), longitudinais e diagonais da fachada (cortados) */
    C.tubos.forEach(function (t) {
      if (t.torre) return;
      var yA = t.a[1], yB = t.b[1], YA = t.a[2], YB = t.b[2];
      if (t.papel === "montante" || t.papel === "posteGuarda") {
        if (!dentroJanela(t.a[0])) return;
        var cy = Hy(YA); D.linha(cy - D0 / 2 * s, Vy(yA), cy - D0 / 2 * s, Vy(yB), "MET-SECUNDARIO"); D.linha(cy + D0 / 2 * s, Vy(yA), cy + D0 / 2 * s, Vy(yB), "MET-SECUNDARIO"); return;
      }
      if (!ehLongo(t)) {   /* o tubo não anda em X: está no plano do pórtico (transversal, ancoragem, diagonal da largura) */
        if (!dentroJanela(t.a[0])) return;
        if (t.papel === "diagonalTransv") { D.linha(Hy(YA), Vy(yA), Hy(YB), Vy(yB), "MET-SECUNDARIO"); return; }
        var h1 = D0 / 2 * s; D.linha(Hy(YA), Vy(yA) - h1, Hy(YB), Vy(yB) - h1, "MET-SECUNDARIO"); D.linha(Hy(YA), Vy(yA) + h1, Hy(YB), Vy(yB) + h1, "MET-SECUNDARIO");
        if (t.papel === "ancoragem") { var xo = Hy(Math.min(YA, YB)); D.circ(xo, Vy(yA), Math.max(1.0, 0.03 * s), "MET-FINA"); D.linha(xo - 2.2, Vy(yA), xo + 2.2, Vy(yA), "MET-FINA"); }
        return;
      }
      /* longitudinal ou diagonal da fachada: só se o plano de corte a atravessa */
      var xa = Math.min(t.a[0], t.b[0]), xb = Math.max(t.a[0], t.b[0]); if (sc < xa - 1e-6 || sc > xb + 1e-6) return;
      var f = (sc - t.a[0]) / (t.b[0] - t.a[0]), yc = yA + (yB - yA) * f, Yc = YA + (YB - YA) * f, rc = Math.max(D0 / 2 * s, 0.7), cxm = Hy(Yc), cym = Vy(yc);
      D.circ(cxm, cym, rc, "MET-PRINCIPAL"); D.ponto(cxm, cym, rc * 0.75);
    });
    /* multi: os nós dos postes que aparecem no corte */
    if (C.multi) C.nos.forEach(function (nn) { if (!dentroJanela(nn.p[0])) return; marcaNo(D, Hy(nn.p[2]), Vy(nn.p[1]), C.linha, s); });
    /* madeira cortada: pranchões, portinhola e rodapés (a seção hachurada; a portinhola sem hachura, com as diagonais) */
    var vaoCorte = null;
    C.pranchas.forEach(function (p) {
      if (p.torre) return;
      var xa = Math.min(p.a[0], p.b[0]), xb = Math.max(p.a[0], p.b[0]); if (sc < xa - 1e-6 || sc > xb + 1e-6) return;
      var Y0 = p.a[2] - p.larg / 2, Y1 = p.a[2] + p.larg / 2, hh = Math.max(p.esp * s, 0.6), x1 = Hy(Y0), x2 = Hy(Y1), yT = Vy(p.yTopo);
      D.ret(x1, yT, x2 - x1, hh, "MET-SECUNDARIO");
      if (p.tipo === "alcapao") { D.linha(x1, yT, x2, yT + hh, "MET-FINA"); D.linha(x1, yT + hh, x2, yT, "MET-FINA"); } else hachPiso(C, D, [[x1, yT], [x2, yT], [x2, yT + hh], [x1, yT + hh]], 1.1);
    });
    C.rodapes.forEach(function (r) {
      var xa = Math.min(r.a[0], r.b[0]), xb = Math.max(r.a[0], r.b[0]); if (sc < xa - 1e-6 || sc > xb + 1e-6) return;
      var x1 = Hy(r.a[2] - r.esp / 2), x2 = Hy(r.a[2] + r.esp / 2), yT = Vy(r.yTopo), hh = Math.max(r.alt * s, 0.8); D.ret(x1, yT, Math.max(x2 - x1, 0.8), hh, "MET-SECUNDARIO"); hachPiso(C, D, [[x1, yT], [x1 + Math.max(x2 - x1, 0.8), yT], [x1 + Math.max(x2 - x1, 0.8), yT + hh], [x1, yT + hh]], 1.0);
    });
    /* tela de proteção (tracejada) na linha externa, da 1ª plataforma até 2 m acima da última */
    var yOut = -1e9; C.ysPostes.forEach(function (Y) { yOut = Math.max(yOut, Y); });
    if (ctx.modelo.tela && ctx.modelo.tela.area > 0) { var yt0 = C.yPisos[0], yt1 = C.telaY ? C.telaY.y1 : C.yTopo + num(ctx.modelo.tela.altura, 2); D.linha(Hy(yOut + 0.03), Vy(yt0), Hy(yOut + 0.03), Vy(yt1), "MET-OCULTA"); D.texto(Hy(yOut + 0.03) + 2.2, Vy((yt0 + yt1) / 2), "TELA", T.nota * 0.9, { rot: -90, al: "C", meio: true }); }
    /* acesso (B-B): os banzos do lance (a escada se inclina ao longo do andaime: na seção ficam verticais) e a portinhola de cada piso */
    if (o.tag === "BB") C.acessos.forEach(function (a) {
      if (a.torre) return;
      var x1 = Hy(a.a[2]), x2 = Hy(a.b[2]), yA = Vy(a.a[1]), yB = Vy(a.b[1]), ne = Math.max(2, a.nDegraus || 10), dx = x2 - x1, dy = yB - yA, Ls = hip(dx, dy) || 1, nx = -dy / Ls, ny = dx / Ls;
      D.linha(x1, yA, x2, yB, "MET-PRINCIPAL");   /* a escada se inclina através da largura: no corte B-B ela aparece inclinada (75°), com os degraus */
      for (var q = 1; q < ne; q++) { var f = q / ne; D.linha(x1 + dx * f - nx * 1.4, yA + dy * f - ny * 1.4, x1 + dx * f + nx * 1.4, yA + dy * f + ny * 1.4, "MET-FINA"); }
    });
    var iCota = D.sg.length; cotasElevacao(ctx, v); v.cotaSg = D.sg.slice(iCota);
    if (o.tag === "BB") {
      var xyz = C.yPisos[0], acB = C.acessos.filter(function (a) { return !a.torre; })[0];
      D.texto(xR - 1, Vy(xyz) - 3, C.multi ? (acB && acB.incorporada ? "ALÇAPÃO COM ESCADA" : "ESCADA EXTERNA") : "PORTINHOLA", T.nota * 0.9, { al: "D" });
    }
    desenharTitulo(ctx, v, o.titulo || "CORTE");
  }
  /* as marcas do plano de corte na planta: linha traço-ponto de ponta a ponta, com a letra e a seta de observação */
  function marcasCorte(ctx, v, cortes) {
    var D = ctx.D, T = ctx.E.T, y0 = v.V(v.C.box.z0) - 7, y1 = v.V(v.C.box.z1) + 7;
    cortes.forEach(function (c) {
      var x = v.H(c.sc);
      D.linha(x, y0, x, y1, "MET-OCULTA");
      [[y0, 1], [y1, -1]].forEach(function (e) {
        D.linha(x, e[0], x + 4.5, e[0], "MET-PRINCIPAL"); D.linha(x + 4.5, e[0], x + 2.7, e[0] - 1.1 * e[1], "MET-PRINCIPAL"); D.linha(x + 4.5, e[0], x + 2.7, e[0] + 1.1 * e[1], "MET-PRINCIPAL");
        D.texto(x - 2.4, e[0] + (e[1] > 0 ? -1.0 : 3.6), c.letra, T.nota * 1.3, { al: "D", peso: 0.28 });
      });
    });
  }

  /* ================================================================ LAYOUT COM ESCALA POR DESENHO (E10)
   * defs = [{ nome, grupo, escalas:[denominadores], ext:function(s) → { w, h } }]. Os desenhos do mesmo `grupo` têm a MESMA escala (as elevações). Procura, entre todas as combinações,
   * a que cabe na área e MAIS ocupa a folha (soma das caixas dos desenhos ÷ área útil); empate → escalas maiores. Devolve null se nada cabe. */
  function escolherEscalas(area, defs, gap) {
    var grupos = [], gesc = {};
    defs.forEach(function (d) { if (grupos.indexOf(d.grupo) < 0) { grupos.push(d.grupo); gesc[d.grupo] = d.escalas; } arr(d.mais).forEach(function (m) { if (grupos.indexOf(m.grupo) < 0) { grupos.push(m.grupo); gesc[m.grupo] = m.escalas; } }); });
    var melhor = null, atual = {};
    function rec(i) {
      if (i === grupos.length) {
        var blocos = {}, soma = 0, S = {}; grupos.forEach(function (g) { S[g] = 1000 / atual[g]; });
        defs.forEach(function (d) { var s = S[d.grupo], e = d.ext(s, S); blocos[d.nome] = { w: e.w, h: e.h, e: e, s: s, esc: atual[d.grupo], S: S, soma: e.soma == null ? e.w * e.h : e.soma }; soma += blocos[d.nome].soma; });
        var oc = soma / (area.w * area.h), somaS = 0; grupos.forEach(function (g) { if (g !== "q") somaS += 1000 / atual[g]; });
        /* duas metas: (1) a maior ocupação; (2) com ≥ 62 % de ocupação, os desenhos nas MAIORES escalas (legibilidade) */
        var bom = oc >= 0.62, atualBom = melhor && melhor.oc >= 0.62;
        if (melhor && (atualBom ? !(bom && somaS > melhor.somaS + 1e-9) : (bom ? false : oc <= melhor.oc + 1e-9))) return;
        var lay = melhorLayout(blocos, area.w, area.h, gap); if (!lay) return;
        melhor = { oc: oc, blocos: blocos, lay: lay, esc: JSON.parse(JSON.stringify(atual)), somaS: somaS };
        return;
      }
      gesc[grupos[i]].forEach(function (e) { atual[grupos[i]] = e; rec(i + 1); });
    }
    rec(0);
    if (melhor) melhor.pos = posicionar(melhor.lay, melhor.blocos, area, gap);
    return melhor;
  }
  var ESC_PLANTA = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500], ESC_CORTE = [20, 25];
  var ESC_VISTA_M = [20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];   /* multi: o poste de 7+ m não cabe a 1:25 e a 1:50 sobra folha: 1:30 e 1:40 entram só nas elevações do multi */
  /* a posição do corte A-A (vão corrente, o mais longe do acesso) e a do B-B (onde a escada do 1º levante atravessa o piso) */
  function planoAA(C, CB) {
    var xs = C.xsPostes.slice(), acc = CB.acessos.filter(function (a) { return !a.torre && a.tipo === "escada"; })[0], xAcc = acc && CB === C ? (acc.a[0] + acc.b[0]) / 2 : null, best = null, i;
    for (i = 0; i + 1 < xs.length; i++) { var mid = (xs[i] + xs[i + 1]) / 2, d = xAcc == null ? -Math.abs(mid - (xs[0] + xs[xs.length - 1]) / 2) : Math.abs(mid - xAcc); if (!best || d > best.d + 1e-9) best = { d: d, sc: mid, w1: xs[i + 1] }; }
    return best ? { sc: best.sc, win: [best.sc, best.w1 + 0.30] } : { sc: (C.box.x0 + C.box.x1) / 2, win: [C.box.x0, C.box.x1] };
  }
  function planoBB(CB, AA) {
    var xs = CB.xsPostes.slice(), acc = CB.acessos.filter(function (a) { return !a.torre && a.tipo === "escada"; })[0], k = 0, i;
    if (!acc) return { sc: AA.sc, win: AA.win.slice() };
    var pl = CB.yPisos[0], f = (pl - acc.a[1]) / ((acc.b[1] - acc.a[1]) || 1), xc = acc.a[0] + (acc.b[0] - acc.a[0]) * f;
    for (i = 0; i + 1 < xs.length; i++) if (xc >= xs[i] - 1e-6 && xc <= xs[i + 1] + 1e-6) k = i;
    return { sc: xc, win: [xc - 0.05, (xs[k + 1] != null ? xs[k + 1] : xc) + 0.30] };
  }
  /* a cena do trecho do acesso (o corte B-B é perpendicular a ele; no trecho 0 é a própria cena) */
  function cenaDoAcesso(c) {
    var a = null; arr(c.modelo.acessos).forEach(function (x) { if (!a && x.tipo === "escada") a = x; });
    if (!a || !a.trecho) return c.C;
    return cenaDe(c.modelo, c.lista, a.trecho);
  }

  /* ================================================================ AS FOLHAS DO JOGO EXECUTIVO (E10): AND-01 planta e cortes · AND-02 elevações · AND-03 isométrico e detalhes · AND-04 tabelas · AND-05 memorial e liberação */
  function ocupar(c, x, y, w, h, nome) { (c.rets = c.rets || []).push({ nome: nome, x: x, y: y, w: w, h: h }); }
  /* o quadro dos níveis e das medidas que os cortes mostram (cotas, levantes, guarda-corpo, afastamento) — texto da MESMA cena */
  function quadroNiveis(c) {
    var C = c.C, par = C.par, M = c.M, rows = [], yp = C.yPisos.slice(), k, prev = 0;
    if (C.multi) {
      rows.push(["Chão (apoio do calço)", { t: "+0,00", al: "D" }, "-", "calço de madeira + base regulável (até 0,25) + peça base"]);
      rows.push(["1º nó do poste", { t: nivelTxt(num((c.modelo.vertical || {}).y0, 0)).replace("m", ""), al: "D" }, "-", "nós de roseta a cada " + br(num((c.modelo.vertical || {}).passo, 0.5), 2) + " m"]);
    } else rows.push(["Apoio (topo do calço)", { t: "+0,00", al: "D" }, "-", "base regulável sobre calço de madeira"]);
    for (k = 0; k < yp.length; k++) { rows.push(["Piso " + (k + 1) + (k === yp.length - 1 ? " (topo)" : ""), { t: nivelTxt(yp[k]).replace("m", ""), al: "D" }, { t: br(yp[k] - prev, 2), al: "D" }, "travessão em " + nivelTxt(yp[k] + C.gd.g).replace("m", "")]); prev = yp[k]; }
    rows.push([C.multi ? "Topo do poste / tela" : "Topo do montante / tela", { t: nivelTxt(C.yMax).replace("m", ""), al: "D" }, "-", c.modelo.tela && c.modelo.tela.area > 0 ? "tela até 2,00 m acima do último piso" : "sem tela"]);
    var medidas;
    if (C.multi) {
      medidas = [["Afastamento da face", br(num(par.afastamento, 0.15), 2) + " m (eixo do poste interno)"], ["Módulo (entre eixos) / piso útil", br(num(M.largura, 0), 2) + " m / " + br(num(M.larguraUtil, 0), 2) + " m (pisos metálicos de 0,32 m)"],
        ["Guarda-corpo (travessão)", br(C.gd.g, 2) + " m acima do piso (NR-18 18.12.15.2)"], ["Travessão intermediário", br(C.gd.it, 2) + " m (NR-18 18.12.15.2)"], ["Rodapé metálico", br(C.gd.rd, 2) + " m de encaixe, mínimo 0,15 m (NR-18 18.9.4.2 c)"]];
      medidas.push(c.modelo.par && c.modelo.par.acesso === "escada" ? ["Acesso", "escada externa Ø48 × 2,00 m por levante, ultrapassa o piso em 1,00 m (NR-18 18.12.14)"] : ["Acesso", "alçapão com escada incorporada em cada nível, alternados (M02 p.18; NR-18 18.12.14)"]);
    } else {
      medidas = [["Afastamento da face", br(num(par.afastamento, 0.2), 2) + " m (eixo do montante interno)"], ["Largura do piso de trabalho", br(num(M.largura, 0), 2) + " m"], ["Guarda-corpo (travessão)", br(num(par.guarda, 1.2), 2) + " m acima do piso (NR-18 18.9.4.2 a)"], ["Travessão intermediário", br(num(par.intermediaria, 0.7), 2) + " m (18.9.4.2 b)"], ["Rodapé", br(num(par.rodape, 0.2), 2) + " m, mínimo 0,15 m (18.9.4.2 c)"]];
      var info = c.modelo.acessoInfo; if (info && info.modo === "escada") medidas.push(["Escada de mão", "um lance por levante, 75°, ultrapassa o piso em ≥ 1,00 m; portinhola 0,60 m (18.8.6.13; 18.12.14)"]);
    }
    return { rows: rows, medidas: medidas };
  }
  function desenharQuadroNiveis(c, x, y, kk, medir) {
    var E = c.E, T = E.T, D = c.D, Q = quadroNiveis(c), fs = T.tabela * kk, fsc = T.tabelaCab * kk, u = kk, tit = T.nota * 1.15, h = 0, w = 0;
    var cols = [["NÍVEL", 54], [["COTA", "(m)"], 22, "D"], [["LEVANTE", "(m)"], 24, "D"], ["OBSERVAÇÃO", 86]].map(function (q) { return { t: q[0], w: q[1] * u, al: q[2] || "E" }; });
    var cols2 = [["MEDIDA", 62], ["VALOR / REGRA", 124]].map(function (q) { return { t: q[0], w: q[1] * u, al: "E" }; });
    var m1 = tabelaQ(null, E, 0, 0, cols, Q.rows, { medir: true, fs: fs, fsc: fsc }), m2 = tabelaQ(null, E, 0, 0, cols2, Q.medidas, { medir: true, fs: fs, fsc: fsc });
    var tot = { w: Math.max(m1.w, m2.w), h: tit * 1.5 + 1 + m1.h + 6 + tit * 1.5 + 1 + m2.h };
    if (medir) return tot;
    D.texto(x, y + tit * 0.9, "QUADRO DE NÍVEIS DOS CORTES", tit, { peso: 0.2 }); var y1 = y + tit * 1.5 + 1; var t1 = tabelaQ(D, E, x, y1, cols, Q.rows, { fs: fs, fsc: fsc });
    var y2 = y1 + t1.h + 6; D.texto(x, y2 + tit * 0.9, "MEDIDAS E REGRAS MOSTRADAS NOS CORTES", tit, { peso: 0.2 }); tabelaQ(D, E, x, y2 + tit * 1.5 + 1, cols2, Q.medidas, { fs: fs, fsc: fsc });
    return tot;
  }
  var LEGENDA_CORTES = ["Hachura a 45°: madeira cortada pelo plano (pranchão, rodapé) e a face da estrutura existente.", "Círculo cheio: tubo cortado pelo plano (longitudinal, travessão, intermediário, diagonal da fachada).",
    "Linhas duplas: tubo visto no pórtico logo atrás do plano de corte (pontalete, transversal, ancoragem).", "Quadrado com diagonais: portinhola (alçapão) do piso; os banzos da escada ficam verticais porque ela se inclina ao longo do andaime.",
    "Linha tracejada: tela de proteção, da 1ª plataforma até 2,00 m acima da última (NR-18 18.12.15).", "Níveis em m (+0,00 = apoio sobre o calço); demais cotas em mm. Corte A-A no vão corrente; corte B-B no vão de acesso (planta: marcas A e B)."];
  var LEGENDA_CORTES_M = ["Hachura a 45°: calço de madeira e a face da estrutura existente (corte).", "Círculo com cruz: nó de roseta no poste, a cada 0,50 m (estribo: quadrado com ponto).",
    "Círculo cheio: travessa / guarda-corpo cortado pelo plano; linhas duplas: tubo visto no pórtico atrás do plano.", "Piso e rodapé METÁLICOS: contorno com a dobra no meio (sem a hachura da madeira); na planta o piso leva hachura CRUZADA.",
    "Linha tracejada: tela de proteção, da 1ª plataforma até 2,00 m acima da última (NR-18 18.12.15.1).", "Níveis em m (+0,00 = chão); demais cotas em mm. Corte A-A no vão corrente; corte B-B no vão de acesso (planta: marcas A e B)."];
  function legendaCortes(c, x, y, medir) {
    var T = c.E.T, A = AP(), fs = T.nota * 1.15, wc = 188, gp = 6, cols = [[], [], []], hs = [0, 0, 0], i;
    (c.C.multi ? LEGENDA_CORTES_M : LEGENDA_CORTES).forEach(function (t, k) { var ci = k % 3, ls = A.quebrar((k + 1) + "- " + t, fs, wc); cols[ci].push(ls); hs[ci] += ls.length * fs * 1.42 + 1.6; });
    var h = Math.max.apply(null, hs) + fs * 2.2, w = 3 * wc + 2 * gp;
    if (medir) return { w: w, h: h };
    c.D.texto(x, y + fs * 0.9, "CONVENÇÕES DOS CORTES", fs * 1.2, { peso: 0.2 });
    cols.forEach(function (col, ci) { var yy = y + fs * 2.2; col.forEach(function (ls) { ls.forEach(function (ln) { c.D.texto(x + ci * (wc + gp), yy + fs * 0.76, ln, fs); yy += fs * 1.42; }); yy += 1.6; }); });
    return { w: w, h: h };
  }
  function folhaPlantaCortes(c) {
    var area = areaUtil(c), C = c.C, CB = cenaDoAcesso(c), AA = planoAA(C, CB), BB = planoBB(CB, AA);
    var qEsc = [100], qTam = {}; qEsc.forEach(function (d) { qTam[d] = desenharQuadroNiveis(c, 0, 0, 100 / d, true); });
    var defs = [{ nome: "comp", grupo: "p", escalas: ESC_PLANTA, mais: [{ grupo: "q", escalas: qEsc }], ext: function (s, S) { var e = extVista("planta", C, s), q = qTam[Math.round(1000 / S.q)]; return { w: Math.max(e.w, q.w + 6), h: e.h + 4 + q.h + 6, ep: e, eq: q, soma: e.w * e.h + (q.w + 6) * (q.h + 6) }; } },
      { nome: "corteAA", grupo: "c", escalas: ESC_CORTE, ext: function (s) { return extVista("corte", C, s); } },
      { nome: "corteBB", grupo: "c", escalas: ESC_CORTE, ext: function (s) { return extVista("corte", CB, s); } },
      { nome: "legenda", grupo: "l", escalas: [100], ext: function () { var m = legendaCortes(c, 0, 0, true); return { w: m.w + 4, h: m.h + 4 }; } }];
    var sel = escolherEscalas(area, defs, 5);
    if (!sel) { c.avisos.push("Nenhuma combinação de escalas coube a planta e os cortes na A1: o andaime é maior que a folha."); return { escala: "INDICADA" }; }
    legendaCortes(c, sel.pos.legenda[0] + 2, sel.pos.legenda[1] + 2, false); ocupar(c, sel.pos.legenda[0], sel.pos.legenda[1], sel.blocos.legenda.w, sel.blocos.legenda.h, "legenda");
    var bc = sel.blocos.comp, px = sel.pos.comp[0], py = sel.pos.comp[1], sp = bc.S.p, sq = bc.S.q;
    var pl = desenharBloco(c, "planta", px, py, sp);
    desenharBloco(c, "corteAA", sel.pos.corteAA[0], sel.pos.corteAA[1], sel.blocos.corteAA.s, { tipo: "corte", tag: "AA", C: C, sc: AA.sc, win: AA.win, titulo: "CORTE A-A (VÃO CORRENTE)" });
    desenharBloco(c, "corteBB", sel.pos.corteBB[0], sel.pos.corteBB[1], sel.blocos.corteBB.s, { tipo: "corte", tag: "BB", C: CB, sc: BB.sc, win: BB.win, titulo: "CORTE B-B (VÃO DE ACESSO)" });
    var yq = py + bc.e.ep.h + 4; desenharQuadroNiveis(c, px + 3, yq + 3, 100 / Math.round(1000 / sq), false);
    marcasCorte(c, pl, [{ sc: AA.sc, letra: "A" }].concat(CB === C ? [{ sc: BB.sc, letra: "B" }] : []));
    ocupar(c, px, py, bc.e.ep.w, bc.e.ep.h, "planta"); ocupar(c, px, yq, bc.e.eq.w + 6, bc.e.eq.h + 6, "quadro");
    ["corteAA", "corteBB"].forEach(function (nm) { ocupar(c, sel.pos[nm][0], sel.pos[nm][1], sel.blocos[nm].w, sel.blocos[nm].h, nm); });
    colocarBaloes(c);
    c.escalaVista = sel.esc.p;
    c.escalas = { planta: sel.esc.p, cortes: sel.esc.c };
    return { escala: "1:" + sel.esc.p + " / 1:" + sel.esc.c };
  }
  function folhaVistas(c) {
    var area = areaUtil(c), C = c.C, closed = !!(c.modelo.par && c.modelo.par.fechado), nTr = arr(c.modelo.trechos).length, porFace = closed || nTr > 1, defs = [], vs = [];
    if (porFace) arr(c.modelo.trechos).forEach(function (t, i) {
      var Ci = i === 0 ? C : cenaDe(c.modelo, c.lista, i);
      vs.push({ nome: "face" + i, tipo: "frontal", C: Ci, titulo: "ELEVAÇÃO - FACE " + (i + 1) + (closed ? " (EXTERNA)" : "") });
    });
    else {
      vs.push({ nome: "frontal", tipo: "frontal", C: C, titulo: "ELEVAÇÃO FRONTAL (EXTERNA)" });
      vs.push({ nome: "posterior", tipo: "frontal", C: C, flip: true, titulo: "ELEVAÇÃO POSTERIOR (LADO DA FACE)" });
      vs.push({ nome: "latE", tipo: "lateral", C: C, titulo: "ELEVAÇÃO LATERAL - CABECEIRA INICIAL" });
      vs.push({ nome: "latD", tipo: "lateral", C: C, flip: true, titulo: "ELEVAÇÃO LATERAL - CABECEIRA FINAL" });
    }
    vs.forEach(function (d) { defs.push({ nome: d.nome, grupo: "v", escalas: MULTI ? ESC_VISTA_M : ESC_PLANTA, ext: function (s) { return extVista(d.tipo, d.C, s); } }); });
    var sel = escolherEscalas(area, defs, 5);
    if (!sel) { c.avisos.push("Nenhuma escala coube as elevações na A1: o andaime é maior que a folha."); return { escala: "INDICADA" }; }
    vs.forEach(function (d) { var b = sel.blocos[d.nome]; desenharBloco(c, d.nome, sel.pos[d.nome][0], sel.pos[d.nome][1], b.s, { tipo: d.tipo, C: d.C, flip: d.flip, titulo: d.titulo }); ocupar(c, sel.pos[d.nome][0], sel.pos[d.nome][1], b.w, b.h, d.nome); });
    colocarBaloes(c);
    c.escalaVista = sel.esc.v; c.escalas = { elevacoes: sel.esc.v };
    return { escala: "1:" + sel.esc.v };
  }
  function folhaIsoDetalhes2(c) {
    var area = areaUtil(c), cols = 4, nDet = detalhesAtivos().length, nL = Math.ceil(nDet / cols), hDet = 140, hIso = area.h - nL * hDet - 6, E = c.E, T = E.T, D = c.D, A = AP(), gap = 6;
    /* o isométrico ocupa a faixa de cima (toda a altura, com margem de 22 mm para os balões); ao lado dele, a tabela das MARCAS com os itens de cada uma */
    var asp = isoAspecto(c.C), pad = 22, wI = Math.min(area.w * 0.62, Math.max(area.w * 0.42, asp * (hIso - 23 - 2 * pad) + 2 * pad));
    var iso = desenharIso(c, area.x, area.y, wI, hIso, "ISOMÉTRICO - SEM ESCALA", { vista: true, pad: pad });
    c.isoInfo = iso; ocupar(c, area.x, area.y, wI, hIso, "iso");
    var porMarca = {}, ordem = [];
    c.lista.forEach(function (l) { var mk = marcaDe(l); if (!mk) return; if (!porMarca[mk]) { porMarca[mk] = { itens: [], qtd: 0 }; ordem.push(mk); } porMarca[mk].itens.push(l.item); porMarca[mk].qtd += l.qtd; });
    var xl = area.x + wI + gap, wl = area.w - wI - gap, fs = T.tabela, tit = T.nota * 1.15;
    var cols2 = [{ t: "MARCA", w: wl * 0.12, al: "E" }, { t: "PEÇA", w: wl * 0.40, al: "E" }, { t: "BALÕES (ITENS)", w: wl * 0.34, al: "E" }, { t: ["QNT.", "TOTAL"], w: wl * 0.14, al: "D" }];
    var rows2 = ordem.map(function (mk) { return [mk, marcasAtivas()[mk] || "", porMarca[mk].itens.join(", "), { t: String(porMarca[mk].qtd), al: "D" }]; });
    D.texto(xl, area.y + tit * 0.9, "MARCAS DAS PEÇAS E OS BALÕES DO ISOMÉTRICO", tit, { peso: 0.2 });
    var tq = tabelaQ(D, E, xl, area.y + tit * 1.5 + 1, cols2, rows2, { fs: fs });
    var yn = area.y + tit * 1.5 + 1 + tq.h + 4, nota = A.quebrar("O balão leva o número do ITEM da relação de peças (AND-04). Os itens que ficam atrás de outras peças no isométrico têm o balão nas elevações (AND-02) ou na planta (AND-01).", T.nota, wl);
    nota.forEach(function (ln, i) { D.texto(xl, yn + T.nota * 0.9 + i * T.nota * 1.42, ln, T.nota); });
    ocupar(c, xl, area.y, wl, tit * 1.5 + 1 + tq.h + 4 + nota.length * T.nota * 1.42, "marcas");
    desenharDetalhes(c, [area.x, area.y + hIso + 6, area.w, area.h - hIso - 6], cols);
    ocupar(c, area.x, area.y + hIso + 6, area.w, area.h - hIso - 6, "detalhes");
    colocarBaloes(c);
    return { escala: "S/ESC - 1:5 / 1:10 / 1:30" };
  }
  /* ---- AND-04: as tabelas */
  function pesoPorTipo(lista) {
    var o = {}, ordem = [], tot = 0, semPeso = false;
    lista.forEach(function (l) {
      if (l.cod === "tela") return;
      var nome = l.cod === "tubo" ? "Tubos (" + l.peca + ")" : l.peca; nome = l.cod === "tubo" ? "Tubos de aço (pontaletes, longitudinais, transversais, diagonais, amarração)" : nome;
      if (!o[nome]) { o[nome] = { nome: nome, qtd: 0, kg: 0, sem: false }; ordem.push(nome); }
      o[nome].qtd += l.qtd; if (l.pesoTotal == null) o[nome].sem = true; else { o[nome].kg += l.pesoTotal; tot += l.pesoTotal; }
      if (l.pesoTotal == null) semPeso = true;
    });
    return { linhas: ordem.map(function (k) { return o[k]; }), total: tot, semPeso: semPeso };
  }
  function quadroAncoragens(calc, modelo) {
    var c = calcDe(calc).c, f = arr(c && c.forcasAncoragem);
    if (!f.length && c && c.caminho && arr(c.caminho.ancoragens).length) {   /* multi: a força de serviço por ponto está em caminho.ancoragens; uso = F / capacidade do chumbador */
      var cap = c.parametros && c.parametros.capAncoragem, nivDe = {}; arr(modelo && modelo.ancoragens).forEach(function (a) { nivDe[a.id] = a.nivel; });
      return c.caminho.ancoragens.map(function (x) { return { id: x.id, nivel: x.topo ? "topo" : String(nivDe[x.id] != null ? nivDe[x.id] : "-"), y: x.y, kN: x.F_kN, kgf: x.F_kN * 101.9716, uso: cap ? x.F_kN / cap : 0 }; });
    }
    return f.map(function (x) { return { id: x.id, nivel: x.topo ? "topo" : String(x.nivel), y: x.y, kN: x.F_kN, kgf: x.F_kgf, uso: x.uso }; });
  }
  /* AND-04 do multi: peso e nº de peças por NÍVEL (mesmos pesos unitários da relação — nenhum peso novo); o que não é de nível (ganchos, pinos, olhais, chumbadores, escadas) vai numa linha à parte */
  function pesosPorNivelMulti(C, lista) {
    var M = C.modelo, yp = C.yPisos, unit = {}, nivs = [], i;
    lista.forEach(function (l) { var k0 = l.cod + "|" + (l.comp == null ? "" : l.comp.toFixed(2)) + "|"; unit[k0 + (l.refCatalogo || "")] = l.pesoUnit; unit[k0] = l.pesoUnit; });
    function pu(cod, L, cat) { var k0 = cod + "|" + (L == null ? "" : L.toFixed(2)) + "|"; return unit[k0 + (cat || "")] != null ? unit[k0 + (cat || "")] : unit[k0]; }
    for (i = 0; i <= yp.length; i++) nivs.push({ pecas: 0, kg: 0, sem: false });
    function nivelDoY(y) { var k = 0; for (var q = 0; q < yp.length; q++) if (yp[q] <= y + 1e-6) k = q + 1; return k; }
    function soma(k, cod, L, cat, qtd) { var w = pu(cod, L, cat); nivs[k].pecas += qtd; if (w == null) nivs[k].sem = true; else nivs[k].kg += w * qtd; }
    arr(M.barras).forEach(function (b) { if (b.papel === "ancoragem") return;   /* o guarda-corpo do multi é travessa da linha e ESTÁ na lista (M4): conta no nível do piso que ele protege */
      soma(b.papel === "guarda" || b.papel === "intermediaria" ? (b.nivel != null ? nivelDoY(Math.min(b.a[1], b.b[1]) - 0.01) : 0) : nivelDoY(Math.min(b.a[1], b.b[1])), b.cod, b.L, b.codCat, 1); });
    arr(M.pranchas).forEach(function (p) { soma(nivelDoY(p.yTopo), p.tipo === "alcapao" ? "pisoAlcapao" : "piso", p.L, p.codCat, 1); });
    arr(M.rodapes).forEach(function (r) { soma(nivelDoY(r.yTopo - r.alt), "rodape", r.L, r.codCat, 1); });
    arr(M.bases).forEach(function (b) { soma(0, b.cod, null, "", 1); soma(0, "pecaBase", null, "", 1); });
    arr(M.calcos).forEach(function (c0) { soma(0, "calco", 0.5, "", 1); });
    var rows = nivs.map(function (n0, k) { return { titulo: k === 0 ? "APOIO E 1º NÓ (calço, base, peça base, travessas niveladas)" : "NÍVEL " + k + " (piso +" + br(yp[k - 1], 2) + ")", totalPecas: n0.pecas, pesoKg: n0.kg, sem: n0.sem }; });
    var ex = { titulo: "ANCORAGENS, PINOS TRAVA E ESCADAS EXTERNAS", totalPecas: 0, pesoKg: 0, sem: false };
    lista.forEach(function (l) { if (["ganchoCurto", "ganchoLongo", "tuboAnc", "abracFixa", "olhal", "chumbador", "escadaExterna", "emenda"].indexOf(l.cod) < 0) return; ex.totalPecas += l.qtd; if (l.pesoTotal == null) ex.sem = true; else ex.pesoKg += l.pesoTotal; });
    rows.push(ex);
    return rows;
  }
  function folhaTabelas(c) {
    var area = areaUtil(c), E = c.E, T = E.T, D = c.D, gap = 8, A = AP(), pt = pesoPorTipo(c.lista), rea = quadroReacoes(c.calc), an = quadroAncoragens(c.calc, c.modelo), plano = c.plano;
    var lev = c.C.multi ? pesosPorNivelMulti(c.C, c.lista) : arr(plano.passos).filter(function (p) { return /^(levante|apoio|bases|tela|torre)/.test(p.id) && p.totalPecas != null; });
    /* UMA escala (kk) para todas as tabelas: a maior em que as três colunas cabem na folha. A letra é T.tabela × kk (nunca menor que a do padrão). */
    function tabelas(kk, kO, desenhar, x0, y0) {
      var fs = T.tabela * kO, fsc = T.tabelaCab * kO, u = kO, out = { w1: 0, h1: 0, w2: 0, h2: 0, w3: 0, h3: 0, ok: true }, TQ = T.quadro;
      function C(l) { return l.map(function (q) { return { t: q[0], w: q[1] * u, al: q[2] || "E" }; }); }
      var opT = { fs: fs, fsc: fsc };
      var rel = desenharRelacao(c, x0, y0, kk, c.kRel || 1, !desenhar, T.tabela * kk); out.w1 = rel.w; out.h1 = rel.h;
      var x2 = x0 + rel.w + gap, y = y0, h = 0;
      var cP = C([["PEÇA", 78], ["QNT.", 13, "D"], [["PESO", "(kg)"], 22, "D"], ["%", 11, "D"]]);
      var rP = pt.linhas.map(function (l) { return [l.nome.length > 44 ? l.nome.slice(0, 41) + "..." : l.nome, { t: String(l.qtd), al: "D" }, { t: l.sem && !l.kg ? "sem fonte" : br(l.kg, 1) + (l.sem ? "+" : ""), al: "D", cor: l.sem ? VERMELHO : undefined }, { t: pt.total > 0 ? br(l.kg / pt.total * 100, 1) : "-", al: "D" }]; });
      rP.push({ total: ["TOTAL (peças com peso de fonte)", { t: String(pt.linhas.reduce(function (q, l) { return q + l.qtd; }, 0)), al: "D" }, { t: br(pt.total, 1), al: "D" }, { t: "100", al: "D" }] });
      var cL = C([["PASSO / LEVANTE", 92], [["PEÇAS", "(un)"], 20, "D"], [["PESO", "(kg)"], 24, "D"]]), tq = 0, tkg = 0;
      var rL = lev.map(function (q) { tq += q.totalPecas; tkg += q.pesoKg; return [q.titulo, { t: String(q.totalPecas), al: "D" }, { t: br(q.pesoKg, 1) + (q.sem ? "+" : ""), al: "D", cor: q.sem ? VERMELHO : undefined }]; });
      rL.push({ total: ["TOTAL MONTADO", { t: String(tq), al: "D" }, { t: br(tkg, 1), al: "D" }] });
      var cR = C([["BASE", 22], ["MONT.", 18], [["SERV.", "(kN)"], 20, "D"], [["SERV.", "(kgf)"], 22, "D"], [["ELU", "(kN)"], 20, "D"], [["ELU", "(kgf)"], 22, "D"]]);
      var rR = rea.map(function (r) { return [r.base, r.poste, { t: r.servico_kN, al: "D" }, { t: r.servico_kgf, al: "D" }, { t: r.elu_kN, al: "D" }, { t: r.elu_kgf, al: "D" }]; });
      var blocos2 = [["RESUMO DE PESOS POR TIPO DE PEÇA", cP, rP]], tit = T.nota * 1.15;
      blocos2.forEach(function (b2) {
        if (desenhar) D.texto(x2, y + tit * 0.9, b2[0], tit, { peso: 0.2 }); y += tit * 1.5 + 1;
        var r2 = tabelaQ(desenhar ? D : null, E, x2, y, b2[1], b2[2], desenhar ? opT : { medir: true, fs: fs, fsc: fsc }); y += r2.h + 5; out.w2 = Math.max(out.w2, r2.w);
      });
      /* as reações vão em N blocos lado a lado se a coluna não tiver altura */
      var wR = cR.reduce(function (q, z) { return q + z.w; }, 0);
      if (desenhar) D.texto(x2, y + tit * 0.9, "REAÇÕES NAS BASES (SERVIÇO E ELU)", tit, { peso: 0.2 }); y += tit * 1.5 + 1;
      if (rR.length) {
        var nB = 1, per = rR.length, hR = tabelaQ(null, E, 0, 0, cR, rR, { medir: true, fs: fs, fsc: fsc }).h, hDisp = area.y + area.h - y - 8;
        while (hR > hDisp && nB < 4) { nB++; per = Math.ceil(rR.length / nB); hR = tabelaQ(null, E, 0, 0, cR, rR.slice(0, per), { medir: true, fs: fs, fsc: fsc }).h; }
        if (hR > hDisp) out.ok = false;
        for (var q = 0; q < nB; q++) { var rr = tabelaQ(desenhar ? D : null, E, x2 + q * (wR + 2), y, cR, rR.slice(q * per, (q + 1) * per), desenhar ? opT : { medir: true, fs: fs, fsc: fsc }); if (q === 0) y += rr.h + 2; }
        out.w2 = Math.max(out.w2, nB * wR + (nB - 1) * 2);
        var mx = rea.reduce(function (m, r) { return r.kN > m.kN ? r : m; }, rea[0]), lsR = A.quebrar("Reação máxima de serviço: " + mx.servico_kN + " kN (" + mx.servico_kgf + " kgf) na base " + mx.base + "; " + rea.length + " bases.", fs, Math.max(out.w2, 60));
        lsR.forEach(function (ln, i) { if (desenhar) D.texto(x2, y + fs * 0.9 + i * fs * 1.42, ln, fs); }); y += lsR.length * fs * 1.42 + fs;
      } else { if (desenhar) D.texto(x2, y + T.nota, "Sem reações calculadas (cálculo não executado).", T.nota, { cor: VERMELHO }); y += T.nota * 2.5; }
      out.h2 = y - y0; if (y > area.y + area.h + 1e-6) out.ok = false;
      /* coluna 3: ancoragens e plano de montagem */
      var x3 = x2 + out.w2 + gap, y3 = y0, cA = C([["PONTO", 24], ["NÍVEL", 20], [["COTA", "(m)"], 20, "D"], [["F SERV.", "(kN)"], 24, "D"], [["F SERV.", "(kgf)"], 24, "D"], ["USO", 18, "D"]]);
      if (desenhar) D.texto(x3, y3 + tit * 0.9, c.C.multi ? "PESOS POR NÍVEL DE NÓ (ORDEM DE MONTAGEM)" : "PESOS POR LEVANTE (ORDEM DE MONTAGEM)", tit, { peso: 0.2 }); y3 += tit * 1.5 + 1;
      var rLv = tabelaQ(desenhar ? D : null, E, x3, y3, cL, rL, desenhar ? opT : { medir: true, fs: fs, fsc: fsc }); y3 += rLv.h + 5; out.w3 = Math.max(out.w3, rLv.w);
      if (desenhar) D.texto(x3, y3 + tit * 0.9, "FORÇAS NAS ANCORAGENS (SERVIÇO, POR PONTO)", tit, { peso: 0.2 }); y3 += tit * 1.5 + 1;
      var wA = cA.reduce(function (q, z) { return q + z.w; }, 0);
      if (an.length) {
        var rA = an.map(function (a) { return [a.id, a.nivel, { t: br(a.y, 2), al: "D" }, { t: br(a.kN, 2), al: "D" }, { t: br(a.kgf, 0), al: "D" }, { t: br(Math.min(a.uso, 99.99) * 100, 0) + " %", al: "D", cor: a.uso > 1 ? VERMELHO : undefined }]; });
        var nA = 1, perA = rA.length, hA = tabelaQ(null, E, 0, 0, cA, rA, { medir: true, fs: fs, fsc: fsc }).h, hDispA = area.y + area.h * 0.55 - y3;
        while (hA > hDispA && nA < 3) { nA++; perA = Math.ceil(rA.length / nA); hA = tabelaQ(null, E, 0, 0, cA, rA.slice(0, perA), { medir: true, fs: fs, fsc: fsc }).h; }
        var ra = null; for (var qa = 0; qa < nA; qa++) { var r3 = tabelaQ(desenhar ? D : null, E, x3 + qa * (wA + 2), y3, cA, rA.slice(qa * perA, (qa + 1) * perA), desenhar ? opT : { medir: true, fs: fs, fsc: fsc }); if (qa === 0) ra = r3; }
        y3 += ra.h + 3; out.w3 = Math.max(out.w3, nA * wA + (nA - 1) * 2);
        var maxA = an.reduce(function (m, a) { return a.kN > m.kN ? a : m; }, an[0]), lsA = A.quebrar("Maior força de serviço: " + br(maxA.kN, 2) + " kN (" + br(maxA.kgf, 0) + " kgf) no ponto " + maxA.id + "; " + an.length + " pontos. Capacidade: confirmar pelo RT.", fs, Math.max(out.w3, 60));
        lsA.forEach(function (ln, i) { if (desenhar) D.texto(x3, y3 + fs * 0.9 + i * fs * 1.42, ln, fs); }); y3 += lsA.length * fs * 1.42 + fs;
      } else {
        var ls0 = A.quebrar("NÃO VERIFICADO: informe V0 e a capacidade da ancoragem; sem isso o sistema não dá a força por ponto.", T.nota * kk, wA); if (desenhar) ls0.forEach(function (ln, i) { D.texto(x3, y3 + T.nota * kk + i * T.nota * kk * 1.4, ln, T.nota * kk, { cor: VERMELHO }); }); y3 += ls0.length * T.nota * kk * 1.4 + 3; out.w3 = Math.max(out.w3, wA);
      }
      y3 += 3;
      if (desenhar) D.texto(x3, y3 + tit * 0.9, "PLANO DE MONTAGEM (RESUMO)", tit, { peso: 0.2 }); y3 += tit * 1.5 + 1;
      var hh = T.nota * kk, wPl = Math.max(out.w3, wA);
      if (c.C.multi && !arr(plano.passos).length) { A.quebrar("Sequência de montagem do multidirecional: ver o plano de montagem do sistema (Documentos) - base, postes desencontrados, pisos, guarda-corpo do nível de cima, diagonais, ancoragens e alçapões (M02 8.1-8.6).", hh, wPl - 2).forEach(function (ln) { if (desenhar) D.texto(x3, y3 + hh * 0.76, ln, hh, { cor: VERMELHO }); y3 += hh * 1.42; }); }
      arr(plano.passos).forEach(function (p3) {
        var ls = A.quebrar(p3.n + ". " + p3.titulo.toUpperCase() + (p3.totalPecas ? " (" + p3.totalPecas + " peças, " + br(p3.pesoKg, 1) + " kg)" : ""), hh, wPl - 2);
        ls.forEach(function (ln) { if (desenhar) D.texto(x3, y3 + hh * 0.76, ln, hh); y3 += hh * 1.42; }); y3 += 1.4;
      });
      arr(plano.desmontagem && plano.desmontagem.avisos).slice(0, 1).forEach(function (a3) { A.quebrar(a3.replace(/^⚠\s*/, ""), hh, wPl - 2).forEach(function (ln) { if (desenhar) D.texto(x3, y3 + hh * 0.76, ln, hh, { cor: VERMELHO }); y3 += hh * 1.42; }); });
      out.w3 = Math.max(out.w3, wA); out.h3 = y3 - y0;
      if (y3 > area.y + area.h + 1e-6 || out.h1 > area.h + 1e-6) out.ok = false;
      if (out.w1 + out.w2 + out.w3 + 2 * gap > area.w + 1e-6) out.ok = false;
      return out;
    }
    /* a relação pode quebrar PEÇA e DIMENSÕES em duas linhas (colunas mais estreitas): procura o par (largura das colunas, escala) que cabe e MAIS preenche a folha */
    /* E10.1: a letra do corpo de TODAS as tabelas é a do Padrão RA (T.tabela), sem escalar para preencher; o que sobra de espaço é só reorganização da grade (colunas da relação) */
    var kk = 1, kOk = 1, m = null, melhor = null;
    [1, 2].forEach(function (kr) {
      [1.0, 0.85, 0.7, 0.6, 0.5].forEach(function (w0) {
        c.wfRel = w0; c.kRel = kr;
        var mm = tabelas(1, 1, false, 0, 0); if (!mm.ok) return;
        var ar = mm.w1 * mm.h1 + mm.w2 * mm.h2 + mm.w3 * mm.h3; if (!melhor || ar > melhor.ar + 1e-6) melhor = { ar: ar, wf: w0, kr: kr, m: mm };
      });
    });
    if (melhor) { c.wfRel = melhor.wf; c.kRel = melhor.kr; m = melhor.m; } else { c.wfRel = 0.5; c.kRel = 2; m = tabelas(1, 1, false, 0, 0); c.avisos.push("As tabelas da AND-04 não couberam por extenso na letra do padrão: ver a lista de locação e o memorial."); }
    var r = tabelas(kk, kOk, true, area.x, area.y);
    ocupar(c, area.x, area.y, r.w1, r.h1, "relacao"); ocupar(c, area.x + r.w1 + gap, area.y, r.w2, r.h2, "pesos-reacoes"); ocupar(c, area.x + r.w1 + r.w2 + 2 * gap, area.y, r.w3, r.h3, "ancoragens-plano");
    c.escalas = { tabelas: 1, colunasRelacao: c.wfRel };
    return { escala: "S/ESC" };
  }
  /* ---- AND-05: memorial resumido, pendências, checklist, liberação/ART e cartão */
  function folhaMemorial2(c) {
    var area = areaUtil(c), E = c.E, T = E.T, D = c.D, gap = 8, A = AP(), W = area.w, wL = Math.min(232, W * 0.36), wR = W - wL - gap, xR = area.x + wL + gap;
    var ver = quadroVerificacoes(c.calc), dados = dadosProjeto(c), cc = calcDe(c.calc).c;
    var hBox = 54, hCorpo = area.h - hBox - gap;
    var nv = ["Resistência do solo, da laje ou do piso onde o andaime apoia (depende de dado do local).", "Resistência da estrutura onde os olhais são fixados e ensaio de arrancamento em campo.", "Estado real do material do locador (certificados, inspeção de recebimento).", "Montagem em campo: prumo, esquadro, torque e travamentos (checklist antes da liberação)."];
    arr(cc && cc.naoVerificado).forEach(function (t) { if (nv.indexOf(t) < 0) nv.push(t); });
    ver.forEach(function (v) { if (v.estado === "nao_verificado") nv.push("Não verificado: " + v.peca + "."); });
    var pend = []; arr(cc && cc.pendencias).forEach(function (t) { pend.push(t); }); arr(c.modelo.pendencias).forEach(function (t) { if (pend.indexOf(t) < 0) pend.push(t); });
    var rts = {}; arr(cc && cc.verificacoes).forEach(function (v) { arr(v.confirmarRT).forEach(function (t) { rts[t] = 1; }); });
    if (Object.keys(rts).length) pend.push("Confirmar pelo responsável técnico: " + Object.keys(rts).join("; ") + ".");
    if (!cc) pend.push("Cálculo não executado: nenhuma verificação foi feita - NÃO LIBERAR.");
    var fs = [T.tabela, T.minimo], k, f = T.minimo, usado = null;   /* E10.1: a letra do corpo das tabelas é T.tabela em todas as folhas (T.minimo só se não couber) */
    for (k = 0; k < fs.length; k++) {
      f = fs[k];
      var colsD = [{ t: "DADO", w: 62 }, { t: "VALOR", w: wL - 62 }], hD = tabelaQ(null, E, 0, 0, colsD, dados.map(function (d) { return [d[0], d[1]]; }), { medir: true, fs: f }).h + T.quadro * 1.4;
      var hN = blocoTexto(null, E, 0, 0, wL, "O QUE NÃO FOI VERIFICADO", nv, { h: f }), hPd = blocoTexto(null, E, 0, 0, wL, "PENDÊNCIAS PARA O RESPONSÁVEL TÉCNICO", pend.map(function (t) { return { t: t, cor: VERMELHO }; }), { h: f });
      if (hD + hN + hPd + 8 <= hCorpo) { usado = { f: f, colsD: colsD }; break; }
    }
    if (!usado) { usado = { f: T.minimo, colsD: [{ t: "DADO", w: 62 }, { t: "VALOR", w: wL - 62 }] }; c.avisos.push("O memorial resumido da AND-05 não coube por extenso com a letra mínima do padrão: ver o memorial completo."); }
    f = usado.f;
    var y = area.y;
    D.texto(area.x, y + T.quadro * 0.76, "DADOS DO PROJETO", T.quadro, { peso: 0.28 }); y += T.quadro * 1.4;
    var td = tabelaQ(D, E, area.x, y, usado.colsD, dados.map(function (d) { return [d[0], d[1]]; }), { fs: f }); y += td.h + 6;
    y += blocoTexto(D, E, area.x, y, wL, "O QUE NÃO FOI VERIFICADO", nv, { h: f }) + 5;
    blocoTexto(D, E, area.x, y, wL, "PENDÊNCIAS PARA O RESPONSÁVEL TÉCNICO", pend.map(function (t) { return { t: t, cor: VERMELHO }; }), { h: f });
    ocupar(c, area.x, area.y, wL, hCorpo, "dados");
    /* coluna da direita: quadro de verificações (solicitante × resistente × uso × estado), COMO LIBERAR e o checklist */
    var sc2 = wR / 231, colsV = [["PEÇA / VERIFICAÇÃO", 78], ["ESFORÇO SOLICITANTE", 62], ["RESISTÊNCIA", 55], ["USO", 14], ["SITUAÇÃO", 22]].map(function (q) { return { t: q[0], w: q[1] * sc2, al: "E" }; });
    var rowsV = ver.map(function (v) { return [v.peca, v.esforco, v.resistencia, { t: v.uso, al: "D" }, { t: v.situacao, cor: v.estado === "ok" ? VERDE : (v.estado === "atencao" ? "#a05a00" : VERMELHO) }]; });
    var yr = area.y;
    D.texto(xR, yr + T.quadro * 0.76, "QUADRO DE VERIFICAÇÕES (MEMORIAL DE CÁLCULO RESUMIDO)", T.quadro, { peso: 0.28 }); yr += T.quadro * 1.4;
    if (!ver.length) { D.texto(xR, yr + T.nota, "CÁLCULO NÃO EXECUTADO - nenhuma verificação foi feita. NÃO LIBERAR.", T.nota, { cor: VERMELHO }); yr += T.nota * 2.5; }
    else { var fv = f; var tv = tabelaQ(D, E, xR, yr, colsV, rowsV, { fs: fv }); yr += tv.h + 5; }
    var yCl = yr, wC1 = wR * 0.5 - gap / 2, xC2 = xR + wR * 0.5 + gap / 2, sp = c.sit.pendencias || [];
    D.texto(xR, yCl + T.quadro * 0.76, "COMO LIBERAR O ANDAIME", T.quadro, { peso: 0.28, attr: ' data-titulo="1"' });
    var scl = wC1 / 285, colsC = [["Nº", 9], ["PENDÊNCIA (O QUE FALTA)", 108], ["CAMPO A PREENCHER", 80], ["ITEM DA NORMA", 70], ["FEITO", 18]].map(function (q) { return { t: q[0], w: q[1] * scl, al: q[0] === "Nº" || q[0] === "FEITO" ? "C" : "E" }; });
    var rowsC = sp.map(function (p, i) { return [{ t: String(i + 1), al: "C" }, { t: p.texto, cor: VERMELHO }, p.campo, p.norma, { t: "[   ]", al: "C" }]; });
    if (!rowsC.length) rowsC.push([{ t: "-", al: "C" }, "Nenhuma pendência aberta do cálculo.", "-", "-", { t: "", al: "C" }]);
    rowsC.push([{ t: String(rowsC.length + 1), al: "C" }, "Refazer o cálculo com os dados acima e conferir que nenhuma verificação falha nem fica NÃO VERIFICADA.", "reemitir as pranchas em revisão nova (R01…)", "NR-18 18.12.2; NBR 6494 3.1.4", { t: "[   ]", al: "C" }]);
    rowsC.push([{ t: String(rowsC.length + 1), al: "C" }, "Registro formal de liberação assinado e cartão verde no acesso.", "campo LIBERAÇÃO DE USO (abaixo)", "NR-18 18.12.4", { t: "[   ]", al: "C" }]);
    var yC = yCl + T.quadro * 1.4, tc = tabelaQ(D, E, xR, yC, colsC, rowsC, { fs: f });
    /* checklist antes da 1ª liberação (momento «antes»), em quadrinhos para marcar */
    var chk = c.checklist, itens = arr(chk.itens).filter(function (i) { return arr(i.momentos).indexOf("antes") >= 0; }), grupos = [], gm = {};
    itens.forEach(function (i) { if (!gm[i.grupo]) { gm[i.grupo] = []; grupos.push(i.grupo); } gm[i.grupo].push(i); });
    D.texto(xC2, yCl + T.quadro * 0.76, "CHECKLIST DE LIBERAÇÃO (ANTES DO 1º USO)", T.quadro, { peso: 0.28 });
    var hDisp = area.y + hCorpo - (yCl + T.quadro * 1.4), hc = T.nota;
    function medirChk(h) { var tot = 0; grupos.forEach(function (gp) { tot += h * 1.6; gm[gp].forEach(function (i) { tot += A.quebrar(i.texto, h, wC1 - 6).length * h * 1.42 + 0.8; }); tot += 1.0; }); return tot; }
    while (medirChk(hc) > hDisp && hc > T.minimo) hc -= 0.1;
    if (medirChk(hc) > hDisp) c.avisos.push("O checklist não coube por extenso na folha AND-05: ver o checklist do sistema.");
    var yy = yCl + T.quadro * 1.4;
    grupos.forEach(function (gp) {
      if (yy + hc * 1.6 > area.y + hCorpo) return;
      D.texto(xC2, yy + hc * 0.9, gp.toUpperCase(), hc, { peso: 0.16 }); yy += hc * 1.6;
      gm[gp].forEach(function (i) { var ls = A.quebrar(i.texto, hc, wC1 - 6); if (yy + ls.length * hc * 1.42 > area.y + hCorpo) return; D.ret(xC2, yy + 0.1, hc * 0.95, hc * 0.95, "MET-FINA"); ls.forEach(function (ln) { D.texto(xC2 + hc * 0.95 + 1.6, yy + hc * 0.76, ln, hc); yy += hc * 1.42; }); yy += 0.8; });
      yy += 1.0;
    });
    ocupar(c, xR, area.y, wR, hCorpo, "verificacoes-checklist");
    /* liberação, responsável técnico e o CARTÃO do acesso */
    var yb = area.y + area.h - hBox, w3 = (W - 2 * gap) / 3, op = c.opcoes;
    function caixa(x, titulo, campos, valores) {
      D.ret(x, yb, w3, hBox, "MET-TABELA"); D.texto(x + 2, yb + T.nota * 1.05, titulo, T.nota * 1.0, { peso: 0.2 });
      var wc = w3 / campos.length, y0 = yb + T.nota * 2.2;
      campos.forEach(function (cp, i) { D.ret(x + i * wc, y0, wc, hBox - T.nota * 2.2, "MET-TABELA"); D.texto(x + i * wc + 1.2, y0 + T.nota * 0.95, cp, T.minimo, {}); if (valores && valores[i]) D.texto(x + i * wc + 1.2, y0 + T.nota * 2.8, valores[i], T.nota, {}); });
    }
    caixa(area.x, "LIBERAÇÃO DE USO - REGISTRO FORMAL (NR-18 18.12.4)", ["NOME", "FUNÇÃO", "DATA", "ASSINATURA"], null);
    caixa(area.x + w3 + gap, "RESPONSÁVEL TÉCNICO PELO PROJETO", ["NOME", "CREA / CAU", "ART Nº", "ASSINATURA"], [op.responsavel ? txt(op.responsavel) : "", op.registro ? txt(op.registro) : "", op.art ? txt(op.art) : "", ""]);
    var xK = area.x + 2 * (w3 + gap), hk = hBox / 3;
    D.ret(xK, yb, w3, hBox, "MET-TABELA"); D.texto(xK + 2, yb + T.nota * 1.05, "CARTÃO DO ACESSO (A5 - NO PÉ DA ESCADA)", T.nota * 1.0, { peso: 0.2 });
    [["VERDE", "ANDAIME LIBERADO - uso com carga de serviço de " + (cargaTrabalho(c.calc, op).q == null ? "[definir]" : br(cargaTrabalho(c.calc, op).q, 2) + " kN/m²"), VERDE], ["AMARELO", "ANDAIME INCOMPLETO - NÃO USAR (montagem em andamento)", "#a05a00"], ["VERMELHO", "ANDAIME EM DESMONTAGEM - NÃO USAR", VERMELHO]].forEach(function (q, i) {
      var y1 = yb + T.nota * 2.2 + i * ((hBox - T.nota * 2.2) / 3); D.ret(xK + 2, y1 + 0.6, 12, (hBox - T.nota * 2.2) / 3 - 1.2, "MET-TABELA"); D.texto(xK + 3.2, y1 + (hBox - T.nota * 2.2) / 6, q[0], T.minimo, { meio: true, cor: q[2] }); D.texto(xK + 16, y1 + (hBox - T.nota * 2.2) / 6, q[1], T.minimo, { meio: true });
    });
    ocupar(c, area.x, yb, W, hBox, "liberacao");
    return { escala: "S/ESC" };
  }

  /* ================================================================ GERAR */
  function gerar(modelo, calc, docs, opcoes) {
    var antes = MULTI;
    MULTI = ehMulti(modelo); ESTIMADAS = {}; LINHA_MULTI = MULTI ? String(modelo.linha || (modelo.par && modelo.par.linha) || "roseta") : "roseta";
    try { return gerarInterno(modelo, calc, docs, opcoes); } finally { MULTI = antes; }
  }
  function gerarInterno(modelo, calc, docs, opcoes) {
    opcoes = opcoes || {}; docs = docs || {};
    var avisos = [], A = AP(), P = PR(), An = AN(), Ad = AD();
    if (!modelo || !modelo.ok) return { ok: false, folhas: [], avisos: [(modelo && modelo.erro) || "Sem modelo de andaime montado: não há pranchas para gerar."] };
    if (!A || !P || !P.carimboRA || !An) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js, js/acopranchas.js) ou do andaime não carregado."] };
    var lista = An.pecasLocacao(modelo), tabela = An.tabelaLocacao(modelo), M = modelo.medidas || {}, sit = situacao(calc, modelo);
    /* E10: o jogo EXECUTIVO (5 folhas A1, com cortes) é o padrão para qualquer tamanho; a A3 única é o formato COMPACTO antigo, só com opcoes.jogo = "compacto" (não tem cortes) */
    var pequeno = num(M.nVaos, 99) <= 3 && num(M.nLevantes, 99) <= 3 && opcoes.jogo === "compacto";
    var formato = pequeno ? "A3" : "A1", geo = P.geometria(formato, "paisagem", "RA"), E = estilo(opcoes.padrao), C = cenaDe(modelo, lista);
    /* multi: o plano de montagem e o checklist do multi são de js/andaimedocs.js; se esse módulo ainda não os tem, a prancha sai sem eles e DIZ (aviso) — nunca com o do tubo-roll */
    function docSeguro(fn, vazio, rot) { try { return fn(); } catch (e) { if (!MULTI) throw e; avisos.push(rot + " do multidirecional indisponível (js/andaimedocs.js): " + (e && e.message ? e.message : e)); return vazio; } }
    var plano = docs.plano || (Ad ? docSeguro(function () { return Ad.planoMontagem(modelo, modelo.par); }, { passos: [], desmontagem: { avisos: [] } }, "Plano de montagem") : { passos: [], desmontagem: { avisos: [] } }),
      chk = docs.checklist || (Ad ? docSeguro(function () { return Ad.checklist(modelo, modelo.par, {}); }, { itens: [] }, "Checklist") : { itens: [] });
    var codigo = txt(opcoes.codigo).trim() || "ANDAIME", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00", Desenho = A.Desenho;
    var defs = pequeno ? [{ id: "andaime", fn: folhaUnica, titulo: PADRAO_AND.folhas.pequeno[0] }] : [
      { id: "planta-cortes", fn: folhaPlantaCortes, titulo: PADRAO_AND.folhas.grande[0] }, { id: "elevacoes", fn: folhaVistas, titulo: PADRAO_AND.folhas.grande[1] },
      { id: "isometrico-detalhes", fn: folhaIsoDetalhes2, titulo: PADRAO_AND.folhas.grande[2] }, { id: "tabelas", fn: folhaTabelas, titulo: PADRAO_AND.folhas.grande[3] },
      { id: "memorial-liberacao", fn: folhaMemorial2, titulo: PADRAO_AND.folhas.grande[4] }];
    if (sit.pendente && !sit.falhas.length && pequeno) sit.faixa = sit.faixa.replace("(ver AND-05)", "(ver as notas)");
    var blocos = blocosNotasAnd({ C: C, M: M, calc: calc, opcoes: opcoes, sit: sit, modelo: modelo, tabela: tabela, compacto: pequeno }), colPlan = pequeno ? planejarColuna(blocos, geo, E, C, lista, tabela, modelo) : { naColuna: [], fonte: 2.1 };
    var blocosRodape = blocos.filter(function (b) { return colPlan.naColuna.indexOf(b) < 0; });
    var N = defs.length, feitas = [], escalaVista = null, isoInfo = null, baloes = {}, semBalao = [], ocupacoes = [];
    function areaUtilNum() { var g = geo.area, h = sit.liberado ? 0 : 9.4; return { w: g.w, h: g.h - h }; }
    defs.forEach(function (df, i) {
      var D = new Desenho(E, opcoes.depurar ? [] : null), c = { blocosNotas: blocosRodape, naColuna: colPlan.naColuna, fonteColuna: colPlan.fonte, D: D, E: E, C: C, geo: geo, modelo: modelo, lista: lista, tabela: tabela, calc: calc, opcoes: opcoes, sit: sit, M: M, avisos: avisos, plano: plano, checklist: chk, vistas: [], baloes: {}, semBalao: [] };
      var res = {};
      try { res = df.fn(c) || {}; } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      if (c.escalaVista) escalaVista = c.escalaVista; if (c.isoInfo) isoInfo = c.isoInfo;
      Object.keys(c.baloes || {}).forEach(function (k) { baloes[k] = c.baloes[k]; }); if (c.vistas.length) semBalao = semBalao.concat(arr(c.semBalao));
      var au = areaUtilNum(), soma = 0; arr(c.rets).forEach(function (r) { soma += r.w * r.h; });
      var oc = pequeno || !c.rets ? null : Math.round(soma / (au.w * au.h) * 1000) / 10; ocupacoes.push({ id: df.id, rotulo: dois(i + 1), pct: oc, rets: arr(c.rets).map(function (r) { return { nome: r.nome, x: r.x, y: r.y, w: r.w, h: r.h }; }), escalas: c.escalas || null });
      feitas.push({ def: df, D: D, c: c, escala: res.escala || "INDICADA", rotulo: dois(i + 1) });
    });
    semBalao = lista.map(function (l) { return l.item; }).filter(function (it) { return !baloes[it]; });   /* tem balão se QUALQUER folha do jogo o colocou */
    if (semBalao.length) avisos.push("Itens da relação sem balão em nenhuma vista: " + semBalao.join(", ") + ".");
    var pr = P.normalizar({ id: "andaimepranchas", nome: MULTI ? "Andaime multidirecional - projeto" : "Andaime tubo-roll - projeto", formato: formato, orientacao: "paisagem", origem: "andaime",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional), obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario),
                 contratante: txt(opcoes.contratante), local: txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO DE ANDAIME", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var folhas = [];
    feitas.forEach(function (f, i) {
      var Fd = new Desenho(E, opcoes.depurar ? [] : null), fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, Mg = geo.moldura;
      Fd.ret(Mg.x, Mg.y, Mg.w, Mg.h, "MET-MOLDURA");
      if (pequeno) { if (!relacaoNaColuna(Fd, f.c, geo)) avisos.push("A relação de materiais não coube na coluna da direita com a letra mínima do padrão: conferir."); }
      else if (!A.colunaNotas(Fd, geo, i === N - 1 ? blocos.filter(function (b0) { return b0.titulo !== "DADOS DO PROJETO"; }) : blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      A.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(N));
      var numero = (opcoes.codigo ? txt(opcoes.codigo).trim() + "-" : "") + "AND-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + A.FONTE + '" data-folha="' + f.def.id + '" data-numero="' + esc(numero) + '"' + (sit.liberado ? ' data-liberado="1"' : ' data-liberado="0"') + ">" +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev + (sit.liberado ? "" : " - " + sit.faixa)) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + f.D.svg() + "</g>" + Fd.svg() + "</svg>";
      var o = { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg, ocupacao: ocupacoes[i] ? ocupacoes[i].pct : null };
      o.dxf = { familia: "andaime", pr: pr, folha: pr.folhas[i], geo: geo, empresa: empObj, rotulo: f.rotulo + "/" + dois(N), logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: A.PADRAO_ACO.camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = (f.D.caixas || []).concat(Fd.caixas || []);
      folhas.push(o);
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, pequeno: pequeno, liberado: sit.liberado, motivoNaoLiberado: sit.motivo, faixa: sit.faixa, escalaVista: escalaVista, iso: isoInfo, baloes: baloes, ocupacao: ocupacoes,
      itens: lista.map(function (l) { return { item: l.item, qtd: l.qtd, cod: l.cod, peca: l.peca, comp: l.comp }; }), semBalao: semBalao };
  }

  /* o isométrico sozinho (a figura do memorial): SVG pronto, mesma geometria e mesma oclusão das pranchas */
  function isometricoSvg(modelo, largura, altura, opcoes) {
    var antes = MULTI; MULTI = ehMulti(modelo);
    try { return isometricoSvgInterno(modelo, largura, altura, opcoes); } finally { MULTI = antes; }
  }
  function isometricoSvgInterno(modelo, largura, altura, opcoes) {
    var A = AP(), An = AN(); if (!A || !An || !modelo || !modelo.ok) return "";
    var E = estilo(opcoes && opcoes.padrao), lista = An.pecasLocacao(modelo), C = cenaDe(modelo, lista), D = new A.Desenho(E, null), c = { C: C, D: D, E: E };
    largura = largura || 180; altura = altura || 120;
    var r = desenharIso(c, 0, 0, largura, altura, "ISOMÉTRICO", {});
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n(largura) + " " + n(altura) + '" font-family="' + A.FONTE + '"><rect width="' + n(largura) + '" height="' + n(altura) + '" fill="#fff"/>' + D.svg() + "</svg>";
  }
  function dadosProjetoPublico(modelo, calc, opcoes) {
    var An = AN(); if (!An || !modelo || !modelo.ok) return [];
    return dadosProjeto({ M: modelo.medidas || {}, C: { par: modelo.par || {}, multi: ehMulti(modelo), linha: modelo.linha }, modelo: modelo, calc: calc, opcoes: opcoes || {}, tabela: An.tabelaLocacao(modelo) });
  }

  var AndaimePranchas = { PADRAO_AND: PADRAO_AND, MARCAS_MULTI: MARCAS_MULTI, gerar: gerar, pesosPorNivelMulti: pesosPorNivelMulti, premissasRT: premissasRT, situacao: situacao, pendenciasRT: pendenciasRT, quadroVerificacoes: quadroVerificacoes, quadroReacoes: quadroReacoes, dadosProjeto: dadosProjetoPublico, textoDado: textoDado,
    cargaTrabalho: cargaTrabalho, textoPisos: textoPisos, isometricoSvg: isometricoSvg, estilo: estilo, _i: { cenaDe: cenaDe, baseDe: baseDe, projIso: projIso, ocultarSegmentos: ocultarSegmentos, oclusorTubo: oclusorTubo, oclusorFace: oclusorFace } };
  global.AndaimePranchas = AndaimePranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimePranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

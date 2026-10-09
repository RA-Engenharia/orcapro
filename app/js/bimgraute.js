/* =====================================================================
 * bimgraute.js — GRAUTE E ARMADURA VERTICAL da alvenaria estrutural
 * (motor puro, ES5, Node-testável). Pedido do Rogério (09/10/2026): os
 * comandos "em breve" da fita têm de ficar prontos — este é o "Graute e
 * armadura" (Alvenaria › Paginação).
 *
 * O QUE FAZ: nas paredes marcadas como alvenaria estrutural, acha os PONTOS
 * de graute (cantos, encontros em T/X, bordas de vão, bordas livres e os
 * intermediários a cada espaçamento máximo), põe cada ponto num FURO do
 * bloco (a modulação da família) e tira o quantitativo:
 *   graute  = pontos × furos por ponto × área do furo × altura grauteada (m³)
 *   aço     = pontos × barras por ponto × (altura + emendas × transpasse × φ)
 *             × massa linear da bitola (kg)
 * e as linhas do Orçamento do modelo (composições SINAPI de grauteamento
 * vertical e de armação vertical de alvenaria estrutural).
 *
 * ---------------------------------------------------------------------
 * NORMA — o que é dela e o que é PARÂMETRO
 * ---------------------------------------------------------------------
 * A norma é a ABNT NBR 16868-1:2020 (alvenaria estrutural — projeto; ela
 * substituiu as canceladas NBR 15961 e NBR 15812). Em 09/10/2026 ela NÃO
 * está na biblioteca de normas da RA (índice: "Faltando", acesso pelo
 * portal Confea/ABNT). Por isso NENHUM número aqui é dado como norma:
 *   · espaçamento máximo entre pontos grauteados, as regras de onde o graute
 *     é obrigatório (cantos, encontros, bordas de vão, bordas livres), o
 *     transpasse da barra e as barras por ponto são PARÂMETROS DO PROJETO,
 *     com padrão marcado "conferir NBR 16868-1" (lista NORMA, abaixo, que a
 *     tela e as Propriedades mostram);
 *   · área do furo: padrão da tabela AREA_FURO do js/alvenaria.js (derivada
 *     da ABCP, marcada lá) — a ficha do fornecedor manda;
 *   · transpasse padrão: tabela EMENDA do js/alvenaria.js (× φ pelo fgk do
 *     graute, ABCP) — conferir NBR 16868-1;
 *   · massa linear da barra: MASSA_LINEAR do js/alvenaria.js (massa nominal
 *     das bitolas comerciais).
 * O projeto estrutural de alvenaria é quem define os pontos; este motor
 * aplica a regra que o projeto informar e mostra a conta.
 *
 * ---------------------------------------------------------------------
 * A MODULAÇÃO (os furos)
 * ---------------------------------------------------------------------
 * O módulo horizontal da família (js/alvenaria.js malha: 15 cm na família
 * 29, 20 cm na 39) é o passo dos furos alinhados de fiada a fiada. Os
 * centros dos furos ficam no meio de cada módulo, a partir do início do
 * eixo da parede: s = (k + ½) × módulo. Todo ponto de graute cai num desses
 * furos (o canto no 1º/último, a borda do vão no furo inteiro ao lado do
 * vão, o intermediário no furo mais perto da divisão por igual).
 *
 * Ponto num NÓ (canto, encontro) é contado UMA vez: fica com a primeira
 * parede grauteada do modelo que passa por ele; nas outras aparece como
 * "compartilhado" e não soma.
 *
 * A OP (extensão do replay do js/bimedit.js — BimEdit.estender):
 *   {op:"graute", id, campos:{ativo?, familia?, espacamento?, cantos?,
 *    encontros?, bordasVao?, bordasLivres?, furosPorPonto?, barras?, bitola?,
 *    fgk?, transpasse?, emendas?, areaFuro?, codGraute?, codAco?}}
 *   valor null = volta ao padrão. Na parede fica só a FONTE (c.graute = mapa
 *   de valores simples, sem lista dentro de lista — a nuvem recusa).
 *
 * Teste: node tools/test-bimgraute.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function fmt(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }

  /* --------------------------------------------------------- padrões */
  var PADRAO = {
    ativo: false,
    familia: "39-14",
    espacamento: 1.20,
    cantos: true, encontros: true, bordasVao: true, bordasLivres: true,
    furosPorPonto: 1,
    barras: 1,
    bitola: 10.0,
    fgk: 20,
    transpasse: null,      /* × φ; null = tabela EMENDA do js/alvenaria.js pelo fgk */
    emendas: 1,            /* emendas por barra (a do arranque) */
    areaFuro: null,        /* m²; null = AREA_FURO do js/alvenaria.js pela família */
    codGraute: "", codAco: ""
  };
  var FAMILIAS = ["29", "39-14", "39-19"];
  /* módulo horizontal de cada família (o mesmo do js/blocos.js; usado só se o
     js/alvenaria.js não responder) */
  var MODULO_FAMILIA = { "29": 0.15, "39-14": 0.20, "39-19": 0.20 };
  var BITOLAS = [6.3, 8.0, 10.0, 12.5, 16.0, 20.0];
  var FGKS = [15, 20, 25, 30, 35];

  /* O QUE É PARÂMETRO A CONFERIR NA NORMA (a tela e as Propriedades mostram) */
  var NORMA = {
    referencia: "ABNT NBR 16868-1:2020 (alvenaria estrutural — projeto)",
    situacao: "não está na biblioteca de normas da RA em 09/10/2026 — consultar no portal Confea/ABNT",
    itens: [
      { campo: "espacamento", rotulo: "Espaçamento máximo entre pontos grauteados", porque: "definido pelo projeto estrutural de alvenaria; o padrão 1,20 m é só ponto de partida — conferir NBR 16868-1" },
      { campo: "cantos", rotulo: "Graute nos cantos", porque: "regra do projeto — conferir NBR 16868-1" },
      { campo: "encontros", rotulo: "Graute nos encontros (T e X)", porque: "regra do projeto — conferir NBR 16868-1" },
      { campo: "bordasVao", rotulo: "Graute nas bordas dos vãos", porque: "regra do projeto — conferir NBR 16868-1" },
      { campo: "bordasLivres", rotulo: "Graute nas bordas livres", porque: "regra do projeto — conferir NBR 16868-1" },
      { campo: "barras", rotulo: "Barras por ponto e bitola", porque: "dimensionamento do projeto estrutural — conferir NBR 16868-1" },
      { campo: "transpasse", rotulo: "Transpasse da armadura (× φ)", porque: "padrão da tabela EMENDA do js/alvenaria.js (ABCP, pelo fgk) — conferir NBR 16868-1" },
      { campo: "areaFuro", rotulo: "Área do furo do bloco", porque: "padrão derivado da ABCP (js/alvenaria.js AREA_FURO) — vale a ficha do fornecedor" }
    ]
  };

  /* COMPOSIÇÕES SINAPI (código nacional; a UF só muda o preço). Conferidas
     contra data/sinapi-MG-analitico.json (06/2026) e o mapa
     data/sinapi-familias-mapa.json (classe "graute") pelo tools/test-bimgraute.js
     — código que sair da base reprova o teste. Bitola/fgk sem composição
     = PENDENTE (nunca a parecida). */
  var SINAPI = {
    graute: { "15": "105792", "20": "89993", "25": "105793", "30": "105794", "35": "105795" },     /* GRAUTEAMENTO VERTICAL EM ALVENARIA ESTRUTURAL, FGK = x MPA (M3) */
    aco: { "10": "89996", "12.5": "89997", "16": "102921" }                                       /* ARMAÇÃO VERTICAL DE ALVENARIA ESTRUTURAL; DIÂMETRO DE x MM (KG) */
  };

  /* ------------------------------------------------ campos da op */
  var CAMPOS = {
    ativo: "bool", cantos: "bool", encontros: "bool", bordasVao: "bool", bordasLivres: "bool",
    familia: "familia", espacamento: "num", furosPorPonto: "int", barras: "int", bitola: "bitola", fgk: "fgk",
    transpasse: "num", emendas: "int", areaFuro: "num", codGraute: "cod", codAco: "cod"
  };
  var FAIXA = { espacamento: [0.15, 6], furosPorPonto: [1, 4], barras: [0, 4], transpasse: [0, 100], emendas: [0, 4], areaFuro: [0.001, 0.1] };

  /* o valor que vem da tela (texto "10,0 mm", "20 MPa", "Sim", "1,20") vira o da op */
  function normalizar(campo, v) {
    var t = CAMPOS[campo]; if (!t) return undefined;
    if (v === null || v === "") return null;
    if (t === "bool") return v === true || v === "true" || v === "Sim" || v === 1;
    if (t === "familia") { var f = txt(v).trim(); return FAMILIAS.indexOf(f) >= 0 ? f : undefined; }
    if (t === "cod") { var c = txt(v).trim(); return /^\d{1,8}$/.test(c) ? c : (c ? undefined : null); }
    var n = typeof v === "number" ? v : Number(txt(v).replace(/[^0-9,.\-]/g, "").replace(",", "."));
    if (!fin(n)) return undefined;
    if (t === "int") n = Math.round(n);
    if (t === "bitola") return BITOLAS.indexOf(n) >= 0 ? n : undefined;
    if (t === "fgk") return FGKS.indexOf(n) >= 0 ? n : undefined;
    var fx = FAIXA[campo]; if (fx && (n < fx[0] - 1e-9 || n > fx[1] + 1e-9)) return undefined;
    return n;
  }
  function valorOk(campo, v) {
    if (v === null) return true;
    var n = normalizar(campo, v);
    return n !== undefined && n !== null && (typeof n === "boolean" ? typeof v === "boolean" : (typeof n === "number" ? v === n : v === n));
  }

  function validaOp(o) {
    if (!o || o.op !== "graute") return undefined;
    var idOk = (typeof o.id === "string" && o.id.length > 0) || fin(o.id);
    if (!idOk || !o.campos || typeof o.campos !== "object" || Array.isArray(o.campos)) return false;
    var ks = Object.keys(o.campos);
    if (!ks.length) return false;
    return ks.every(function (k) { return CAMPOS[k] && valorOk(k, o.campos[k]); });
  }
  function aplicarOp(o, ctx) {
    if (!o || o.op !== "graute" || validaOp(o) !== true) return false;
    var c = ctx && ctx.caixas && ctx.caixas[o.id];
    if (!c || c.tipo !== "parede") return false;
    var g = c.graute ? JSON.parse(JSON.stringify(c.graute)) : {};
    Object.keys(o.campos).forEach(function (k) { if (o.campos[k] === null) delete g[k]; else g[k] = o.campos[k]; });
    if (Object.keys(g).length) c.graute = g; else delete c.graute;
    return true;
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "graute", aplicar: aplicarOp, valida: validaOp });
    return true;
  }

  /* ------------------------------------------- configuração efetiva */
  function config(c) {
    var g = (c && c.graute) || {}, out = {}, Al = dep("Alvenaria", "./alvenaria.js");
    Object.keys(PADRAO).forEach(function (k) { out[k] = g[k] != null ? g[k] : PADRAO[k]; });
    out.ativo = !!g.ativo;
    var origem = {};
    Object.keys(PADRAO).forEach(function (k) { origem[k] = g[k] != null ? "projeto" : "padrão"; });
    if (out.transpasse == null) {
      var tab = Al && Al.EMENDA ? Al.EMENDA : null;
      out.transpasse = tab ? (tab[out.fgk] != null ? tab[out.fgk] : (tab[20] != null ? tab[20] : null)) : null;
      origem.transpasse = "tabela EMENDA (js/alvenaria.js, ABCP)";
    }
    if (out.areaFuro == null) {
      out.areaFuro = Al && Al.AREA_FURO ? (Al.AREA_FURO[out.familia] != null ? Al.AREA_FURO[out.familia] : null) : null;
      origem.areaFuro = "tabela AREA_FURO (js/alvenaria.js, derivada da ABCP)";
    }
    out.origem = origem;
    return out;
  }
  function modulo(familia) {
    var Al = dep("Alvenaria", "./alvenaria.js"), m = null;
    try { var ml = Al && Al.malha ? Al.malha(familia) : null; if (ml && ml.horizontal > 0) m = ml.horizontal; } catch (e) {}
    return m || MODULO_FAMILIA[familia] || null;
  }
  function massaLinear(bitola) {
    var Al = dep("Alvenaria", "./alvenaria.js");
    return Al && Al.MASSA_LINEAR && Al.MASSA_LINEAR[bitola] != null ? Al.MASSA_LINEAR[bitola] : null;
  }

  /* ------------------------------------------- geometria da parede */
  function frame(c) {
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), L = num(c.comprimento, 0);
    return { cx: num(c.cx, 0), cz: num(c.cz, 0), co: co, si: si, L: L, H: num(c.altura, 0), t: num(c.espessura, 0), y0: num(c.cy, 0) - num(c.altura, 0) / 2 };
  }
  /* s = distância ao INÍCIO do eixo (0 … L) → ponto do mundo (x, z) — o mesmo
     referencial do js/bimarq.js (aMundo com u = s − L/2) */
  function noMundo(f, s) { var u = s - f.L / 2; return { x: r6(f.cx + u * f.co), z: r6(f.cz - u * f.si) }; }
  function ponta(f, qual) { return noMundo(f, qual === "p1" ? 0 : f.L); }
  function sDoPonto(f, p) { var dx = p.x - f.cx, dz = p.y - f.cz; return dx * f.co - dz * f.si + f.L / 2; }

  /* os furos da parede: centros (k + ½) × módulo */
  function furos(L, m) { var n = Math.floor(L / m + 1e-6), out = []; for (var k = 0; k < n; k++) out.push(r6((k + 0.5) * m)); return out; }
  function furoPerto(F, s) { var b = -1, bd = 1e9; F.forEach(function (x, i) { var d = Math.abs(x - s); if (d < bd - 1e-9) { bd = d; b = i; } }); return b; }
  function furoAte(F, s) { var b = -1; F.forEach(function (x, i) { if (x <= s + 1e-6) b = i; }); return b; }
  function furoDesde(F, s) { for (var i = 0; i < F.length; i++) if (F[i] >= s - 1e-6) return i; return -1; }

  var PRIOR = { canto: 0, encontro: 1, "borda de vão": 2, "borda livre": 3, "intermediário": 4 };

  /* ---------------------------------------------------- o cálculo
   * estado: o do BimEdit.aplicar; vaos: BimEdit.vaosDasParedes (aceitos no
   * local da parede). → { paredes: {id: {...}}, total, avisos } */
  function calcular(estado, vaos, opts) {
    opts = opts || {};
    var AG = dep("AlvGeo", "./alvgeo.js");
    var paredes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede" && num(c.comprimento, 0) > 0; });
    var F = {}; paredes.forEach(function (c) { F[c.id] = frame(c); });
    var avisos = [];
    /* encontros de TODAS as paredes (a parede de vedação também faz o canto) */
    var enc = [];
    if (AG && AG.encontros) {
      var tol = opts.tolerancia != null ? +opts.tolerancia : 0.10;
      enc = AG.encontros(paredes.map(function (c) { var f = F[c.id], a = ponta(f, "p1"), b = ponta(f, "p2"); return { id: c.id, p1: { x: a.x, y: a.z }, p2: { x: b.x, y: b.z } }; }), { tolerancia: tol });
    } else avisos.push("js/alvgeo.js não carregou: os encontros entre paredes não foram procurados");
    function chaveNo(p) { return Math.round(p.x / 0.05) + ":" + Math.round(p.y / 0.05); }
    var porParede = {};
    enc.forEach(function (e) {
      var no = chaveNo(e.ponto);
      [["a", "pontaA"], ["b", "pontaB"]].forEach(function (k) {
        var id = e[k[0]], f = F[id]; if (!f) return;
        var s = k[1] && e[k[1]] ? (e[k[1]] === "p1" ? 0 : f.L) : Math.max(0, Math.min(f.L, sDoPonto(f, e.ponto)));
        /* ponta com ponta ALINHADAS (a mesma parede em dois lances) não é canto: é continuação — nem graute, nem borda livre */
        var tp = e.tipo === "L" ? (num(e.anguloGraus, 90) < 5 ? "continuacao" : "canto") : "encontro";
        (porParede[id] = porParede[id] || []).push({ s: s, tipo: tp, no: no, ponta: k[1] && e[k[1]] ? e[k[1]] : null, com: e[k[0] === "a" ? "b" : "a"] });
      });
    });

    var res = {}, donoNo = {};
    paredes.forEach(function (c) {
      var cfg = config(c), f = F[c.id];
      if (!cfg.ativo) return;
      var r = { id: c.id, ativo: true, cfg: cfg, comprimento: r4(f.L), altura: r4(f.H), modulo: null, pontos: [], n: 0, furos: 0, volume: 0, barras: 0, comprimentoBarra: 0, acoComprimento: 0, acoKg: 0, avisos: [], vaos: [] };
      res[c.id] = r;
      var m = modulo(cfg.familia);
      if (!m) { r.avisos.push("família de bloco desconhecida: " + cfg.familia); return; }
      r.modulo = m;
      var FU = furos(f.L, m);
      if (!FU.length) { r.avisos.push("parede mais curta que um módulo (" + fmt(m * 100, 0) + " cm): sem furo para grautear"); return; }
      var obr = [];
      function por(i, tipo, no) { if (i >= 0) obr.push({ i: i, tipo: tipo, no: no || null }); }
      /* 1) as pontas: canto/encontro ou borda livre */
      var juncoes = porParede[c.id] || [];
      ["p1", "p2"].forEach(function (pt) {
        var sP = pt === "p1" ? 0 : f.L, iP = pt === "p1" ? 0 : FU.length - 1;
        var j = juncoes.filter(function (x) { return x.ponta === pt || (x.ponta == null && Math.abs(x.s - sP) <= m / 2 + 1e-6); })[0];
        if (j) { if ((j.tipo === "canto" && cfg.cantos) || (j.tipo === "encontro" && cfg.encontros)) por(iP, j.tipo, j.no); }
        else if (cfg.bordasLivres) por(iP, "borda livre", null);
      });
      /* 2) encontros no meio da parede (T de outra que chega aqui, X) */
      if (cfg.encontros) juncoes.forEach(function (j) { if (j.ponta == null && j.s > m / 2 + 1e-6 && j.s < f.L - m / 2 - 1e-6) por(furoPerto(FU, j.s), "encontro", j.no); });
      /* 3) bordas dos vãos: o furo inteiro ao lado do vão, dos dois lados */
      var V = arr(vaos && vaos[c.id] && vaos[c.id].aceitos).map(function (v) { return { s0: r6(v.x0 + f.L / 2), s1: r6(v.x1 + f.L / 2), id: v.id, y0: v.y0, y1: v.y1 }; });
      r.vaos = V;
      if (cfg.bordasVao) V.forEach(function (v) {
        if (v.s0 > 1e-6) por(furoAte(FU, v.s0 - m / 2), "borda de vão", null);
        if (v.s1 < f.L - 1e-6) por(furoDesde(FU, v.s1 + m / 2), "borda de vão", null);
      });
      /* um furo, um ponto (vale o tipo mais forte) */
      var porI = {};
      obr.forEach(function (p) { var q = porI[p.i]; if (!q || PRIOR[p.tipo] < PRIOR[q.tipo]) porI[p.i] = { i: p.i, tipo: p.tipo, no: p.no || (q && q.no) || null }; else if (p.no && !q.no) q.no = p.no; });
      var lista = Object.keys(porI).map(function (k) { return porI[k]; }).sort(function (a, b) { return a.i - b.i; });
      /* 4) os intermediários: a cada espaçamento máximo, pelo furo mais perto da divisão por igual */
      var esp = cfg.espacamento, inter = [];
      function noVao(a, b) { return V.some(function (v) { return v.s0 < b - 1e-6 && v.s1 > a + 1e-6; }); }
      for (var q = 0; q + 1 < lista.length; q++) {
        var A = FU[lista[q].i], B = FU[lista[q + 1].i], gap = B - A;
        if (gap <= esp + 1e-6) continue;
        if (noVao(A, B)) { if (!cfg.bordasVao) r.avisos.push("com as bordas de vão desligadas, o trecho com vão entre " + fmt(A) + " e " + fmt(B) + " m fica sem graute intermediário"); continue; }
        var achou = null;
        for (var n = Math.max(1, Math.ceil(gap / esp - 1e-9) - 1); n <= lista[q + 1].i - lista[q].i - 1 && !achou; n++) {
          var idx = [], okN = true;
          for (var k = 1; k <= n; k++) { var ii = furoPerto(FU, A + gap * k / (n + 1)); if (ii <= lista[q].i || ii >= lista[q + 1].i || idx.indexOf(ii) >= 0) { okN = false; break; } idx.push(ii); }
          if (!okN) continue;
          var seq = [lista[q].i].concat(idx).concat([lista[q + 1].i]);
          if (seq.every(function (x, w) { return w === 0 || FU[x] - FU[seq[w - 1]] <= esp + 1e-6; })) achou = idx;
        }
        if (!achou) {   /* espaçamento menor que o módulo: todos os furos do trecho */
          achou = []; for (var z = lista[q].i + 1; z < lista[q + 1].i; z++) achou.push(z);
          if (esp < m - 1e-9) r.avisos.push("espaçamento máximo (" + fmt(esp) + " m) menor que o módulo (" + fmt(m) + " m): todos os furos do trecho grauteados");
        }
        achou.forEach(function (ii) { if (noVao(FU[ii] - m / 2, FU[ii] + m / 2)) return; inter.push({ i: ii, tipo: "intermediário", no: null }); });
      }
      lista = lista.concat(inter).sort(function (a, b) { return a.i - b.i; });
      /* o ponto no nó (canto/encontro) é de UMA parede: a primeira grauteada do modelo */
      r.pontos = lista.map(function (p) {
        var s = FU[p.i], w = noMundo(f, s), comp = false;
        if (p.no) { if (donoNo[p.no] && donoNo[p.no] !== c.id) comp = true; else donoNo[p.no] = c.id; }
        return { s: r4(s), x: r4(w.x), z: r4(w.z), furo: p.i, tipo: p.tipo, no: p.no, compartilhado: comp, dono: comp ? donoNo[p.no] : c.id };
      });
      /* 5) o quantitativo (só os pontos que esta parede conta) */
      var conta = r.pontos.filter(function (p) { return !p.compartilhado; });
      r.n = conta.length;
      r.furos = r.n * cfg.furosPorPonto;
      if (!(cfg.areaFuro > 0)) r.avisos.push("informe a área do furo do bloco do fornecedor: sem ela não há volume de graute");
      r.volumeExato = cfg.areaFuro > 0 ? r.furos * cfg.areaFuro * f.H : 0;
      r.volume = r4(r.volumeExato);
      r.barras = r.n * cfg.barras;
      var ml = massaLinear(cfg.bitola), lb = cfg.transpasse != null ? cfg.emendas * cfg.transpasse * cfg.bitola / 1000 : null;
      if (lb == null) r.avisos.push("informe o transpasse (× φ): sem ele o comprimento da barra fica sem a emenda");
      r.comprimentoBarra = r4(f.H + (lb || 0));
      r.transpasseM = lb == null ? null : r4(lb);
      r.acoComprimentoExato = r.barras * (f.H + (lb || 0));
      r.acoComprimento = r4(r.acoComprimentoExato);
      if (ml == null) r.avisos.push("bitola " + fmt(cfg.bitola, 1) + " mm sem massa linear na tabela");
      r.massaLinear = ml;
      r.acoKgExato = ml != null ? r.acoComprimentoExato * ml : 0;
      r.acoKg = r3(r.acoKgExato);
    });
    var tot = { paredes: 0, n: 0, volume: 0, acoComprimento: 0, acoKg: 0 };
    Object.keys(res).forEach(function (k) { var r = res[k]; tot.paredes++; tot.n += r.n; tot.volume += r.volumeExato || 0; tot.acoComprimento += r.acoComprimentoExato || 0; tot.acoKg += r.acoKgExato || 0; });
    tot.volume = r4(tot.volume); tot.acoComprimento = r4(tot.acoComprimento); tot.acoKg = r3(tot.acoKg);
    return { paredes: res, total: tot, avisos: avisos, norma: NORMA };
  }

  /* ------------------------------------------------- orçamento
   * linhas do Orçamento do modelo: o graute (m³) e o aço (kg) de cada parede.
   * Código: o da parede (codGraute/codAco), senão a tabela SINAPI acima pelo
   * fgk/bitola; sem código = pendente com o motivo. */
  function composicao(tipo, cfg) {
    if (tipo === "graute") {
      if (cfg.codGraute) return { codigo: cfg.codGraute, origem: "projeto" };
      var cg = SINAPI.graute[String(cfg.fgk)];
      return cg ? { codigo: cg, origem: "tabela", descricao: "Grauteamento vertical em alvenaria estrutural, fgk = " + cfg.fgk + " MPa" }
                : { codigo: "", motivo: "sem composição SINAPI de grauteamento vertical para fgk " + cfg.fgk + " MPa — pendente (escolha a composição em Propriedades › Estrutural)" };
    }
    if (cfg.codAco) return { codigo: cfg.codAco, origem: "projeto" };
    var ca = SINAPI.aco[String(cfg.bitola)];
    return ca ? { codigo: ca, origem: "tabela", descricao: "Armação vertical de alvenaria estrutural, φ " + fmt(cfg.bitola, 1) + " mm" }
              : { codigo: "", motivo: "sem composição SINAPI de armação vertical de alvenaria estrutural para φ " + fmt(cfg.bitola, 1) + " mm — pendente (escolha a composição em Propriedades › Estrutural)" };
  }
  function servicosOrc(estado, vaos, opts) {
    var R = calcular(estado, vaos, opts), out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      var r = R.paredes[c.id]; if (!r || !r.n) return;
      var g = composicao("graute", r.cfg), a = composicao("aco", r.cfg);
      if (r.volume > 0) out.push({ id: c.id + ":graute", peca: c.id, medida: "grauteVolume", unidade: "m3", quantidade: r.volume, exato: r.volumeExato,
        codigo: g.codigo, origemCodigo: g.origem || null, descricao: g.descricao || "", motivo: g.motivo || "",
        rotulo: "Graute vertical — " + r.n + " ponto(s), parede " + c.id });
      if (r.acoKg > 0) out.push({ id: c.id + ":aco", peca: c.id, medida: "grauteAco", unidade: "kg", quantidade: r.acoKg, exato: r.acoKgExato,
        codigo: a.codigo, origemCodigo: a.origem || null, descricao: a.descricao || "", motivo: a.motivo || "",
        rotulo: "Armadura vertical φ " + fmt(r.cfg.bitola, 1) + " — " + r.barras + " barra(s), parede " + c.id });
    });
    return out;
  }

  /* ------------------------------------------------- desenho
   * planta: o retângulo da parede e um quadrado hachurado em cada furo
   * grauteado (coordenadas do mundo, x/z); elevação: a parede L × H com os
   * vãos e uma faixa hachurada por ponto (largura = módulo, altura toda),
   * com a barra (linha) e o transpasse acima do topo. */
  function desenho(estado, vaos, id, opts) {
    var c = arr(estado && estado.caixas).filter(function (x) { return x && String(x.id) === String(id); })[0];
    if (!c || c.tipo !== "parede") return null;
    var R = calcular(estado, vaos, opts), r = R.paredes[c.id], f = frame(c);
    if (!r) return { id: c.id, ativo: false };
    var m = r.modulo || 0.2, t = f.t || 0.14;
    var cantos = [[-f.L / 2, -t / 2], [f.L / 2, -t / 2], [f.L / 2, t / 2], [-f.L / 2, t / 2]].map(function (q) { return { x: r4(f.cx + q[0] * f.co + q[1] * f.si), z: r4(f.cz - q[0] * f.si + q[1] * f.co) }; });
    var furosPl = r.pontos.map(function (p) {
      var u = p.s - f.L / 2, hm = m / 2 * 0.7, ht = t / 2 * 0.7;
      return { tipo: p.tipo, compartilhado: p.compartilhado, pts: [[u - hm, -ht], [u + hm, -ht], [u + hm, ht], [u - hm, ht]].map(function (q) { return { x: r4(f.cx + q[0] * f.co + q[1] * f.si), z: r4(f.cz - q[0] * f.si + q[1] * f.co) }; }) };
    });
    var elev = {
      L: r4(f.L), H: r4(f.H), modulo: m,
      vaos: r.vaos.map(function (v) { return { s0: v.s0, s1: v.s1, y0: r4(num(v.y0, 0)), y1: r4(num(v.y1, f.H)) }; }),
      faixas: r.pontos.map(function (p) { return { s0: r4(p.s - m / 2), s1: r4(p.s + m / 2), s: p.s, tipo: p.tipo, compartilhado: p.compartilhado }; }),
      barras: r.pontos.filter(function (p) { return !p.compartilhado; }).map(function (p) { return { s: p.s, y0: 0, y1: r4(f.H + (r.transpasseM || 0)) }; })
    };
    return { id: c.id, ativo: true, planta: { parede: cantos, furos: furosPl }, elevacao: elev, resumo: r };
  }

  /* ------------------------------------------------- texto */
  function resumoTexto(r) {
    if (!r) return "";
    return r.n + " ponto(s), " + fmt(r.volume, 4) + " m³ de graute, " + fmt(r.acoKg, 2) + " kg de aço";
  }

  var BimGraute = {
    VERSAO: 1,
    PADRAO: PADRAO, FAMILIAS: FAMILIAS, BITOLAS: BITOLAS, FGKS: FGKS, NORMA: NORMA, SINAPI: SINAPI, CAMPOS: CAMPOS,
    normalizar: normalizar, validaOp: validaOp, aplicarOp: aplicarOp, registrar: registrar,
    config: config, modulo: modulo, furos: furos, calcular: calcular, composicao: composicao, servicosOrc: servicosOrc,
    desenho: desenho, resumoTexto: resumoTexto
  };
  var BEg = global.BimEdit || null;
  if (!BEg && typeof require === "function") { try { BEg = require("./bimedit.js"); } catch (eB) {} }
  if (BEg) registrar(BEg);
  global.BimGraute = BimGraute;
  if (typeof module !== "undefined" && module.exports) module.exports = BimGraute;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

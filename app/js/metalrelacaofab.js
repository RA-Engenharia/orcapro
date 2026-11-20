/* =====================================================================
 * metalrelacaofab.js — METÁLICA: "RELAÇÃO DE MATERIAIS FORMATO FÁBRICA"
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 * É a lista que a metalúrgica lê para comprar e produzir, em duas partes:
 *   Parte 1 "Componentes da estrutura":  ITEM | QTDE | DESCRIÇÃO | TAMANHO (m)
 *       tesoura, colunas, terças, linha de corrente, contravento, chumbador…
 *   Parte 2 "Relação de materiais":      ITEM | QTDE | DESCRIÇÃO
 *       barras comerciais (6 / 12 m, da lista de corte), chapas lisas peça a
 *       peça, cachorros (1 por ligação), parafusos c/ porca, barra roscada,
 *       calha e condutores, e os CONSUMÍVEIS (eletrodo, thinner, zarcão,
 *       discos de corte).
 *
 * DE ONDE VEM CADA NÚMERO
 *   - componentes, barras, chapas e parafusos: do que o modelo já gera —
 *     js/metalfab.js listas() + js/metalcorte.js planoBarras();
 *   - cachorros: 1 por ligação (2 pontas por terça, contravento e linha de
 *     corrente — FATOR EDITÁVEL);
 *   - calha e condutores: NÃO existem no modelo — entram digitados (extras);
 *   - CONSUMÍVEIS: ÍNDICE POR TONELADA DE AÇO, EDITÁVEL. ⚠ "índice de
 *     consumíveis: referência do cliente (editável)": o padrão é derivado da
 *     lista de uma obra de referência da metalúrgica cliente (galpão 20 × 30,
 *     pé-direito 8 m) dividida pela massa de aço dessa lista (as barras e
 *     chapas dela × a massa linear do catálogo js/perfisaco.js). NÃO é norma
 *     nem medição: é a prática dessa fábrica. Ajuste com os números dela.
 *   - preço: NENHUM. Item que não tem insumo no catálogo (cachorro, eletrodo
 *     OK-46, zarcão, thinner, disco de corte, calha #18, condutor) sai com o
 *     código PEND-FAB-nn e o estado "pendente — cotar". Nunca preço inventado.
 *
 * Teste: node tools/test-metalrelacaofab.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function sem(s) { s = txt(s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function ceil(v) { return Math.ceil(r6(v) - 1e-9); }
  var RHO = 7850;
  var STATUS_PEND = "pendente — cotar";
  var ROTULO_INDICE = "índice de consumíveis: referência do cliente (editável)";

  /* ============================================ CATÁLOGO PENDENTE (sem preço) */
  var CATALOGO_PENDENTE = [
    { codigo: "PEND-FAB-01", chave: "cachorroTerca", descricao: "CACHORRO P/ TERÇA", unidade: "un" },
    { codigo: "PEND-FAB-02", chave: "cachorroContravento", descricao: "CACHORRO P/ CONTRAVENTO", unidade: "un" },
    { codigo: "PEND-FAB-03", chave: "cachorroCorrente", descricao: "CACHORRO P/ LINHA DE CORRENTE", unidade: "un" },
    { codigo: "PEND-FAB-04", chave: "eletrodo250", descricao: "ELETRODO OK-46 Ø 2,50 MM", unidade: "kg" },
    { codigo: "PEND-FAB-05", chave: "eletrodo325", descricao: "ELETRODO OK-46 Ø 3,25 MM", unidade: "kg" },
    { codigo: "PEND-FAB-06", chave: "thinner", descricao: "THINNER (LATA 18 L)", unidade: "lata" },
    { codigo: "PEND-FAB-07", chave: "zarcao", descricao: "ZARCÃO (LATA 18 L)", unidade: "lata" },
    { codigo: "PEND-FAB-08", chave: "disco7", descricao: "DISCO DE CORTE 7\"", unidade: "un" },
    { codigo: "PEND-FAB-09", chave: "disco12", descricao: "DISCO DE CORTE 12\"", unidade: "un" },
    { codigo: "PEND-FAB-10", chave: "calha", descricao: "CALHA CHAPA #18 DESENVOLVIMENTO 600", unidade: "m" },
    { codigo: "PEND-FAB-11", chave: "condutor", descricao: "CONDUTOR 150", unidade: "un" }
  ];
  function catalogoPendente() { return CATALOGO_PENDENTE.map(function (c) { return { codigo: c.codigo, chave: c.chave, descricao: c.descricao, unidade: c.unidade, preco: null, status: STATUS_PEND }; }); }
  function pend(chave) { for (var i = 0; i < CATALOGO_PENDENTE.length; i++) if (CATALOGO_PENDENTE[i].chave === chave) return CATALOGO_PENDENTE[i]; return null; }

  /* ============================================ LISTA DE REFERÊNCIA DO CLIENTE
   * galpão 20 × 30, pé-direito 8 m. As barras com a massa do catálogo → toneladas de aço.
   * `cat` = nome no catálogo (bitola MAIS PRÓXIMA onde o catálogo não tem a exata — marcado em `aprox`). */
  var REF_BARRAS = [
    { qtd: 48, comp: 6000, cat: "U 100 x 40 x 3,04", desc: "PERFIL U 100X40X1/8\" X 6000", aprox: "U 100×40 de 1/8\" (3,17 mm): o catálogo tem 3,04 mm" },
    { qtd: 33, comp: 6000, cat: "U 100 x 40 x 4,76", desc: "PERFIL U 100X40X3/16\" X 6000" },
    { qtd: 38, comp: 12000, cat: "BR 3/8\" (D 9,53 mm) Gerdau", desc: "VERGALHÃO CA-25 3/8\" X 12000", aprox: "CA-25: massa da barra redonda do mesmo diâmetro" },
    { qtd: 13, comp: 12000, cat: "BR 5/8\" (D 15,88 mm) Gerdau", desc: "VERGALHÃO CA-25 5/8\" X 12000", aprox: "CA-25: massa da barra redonda do mesmo diâmetro" },
    { qtd: 73, comp: 6000, cat: "TR 40 x 100 x 2 Tuper", desc: "METALON 100X40X2 X 6000" },
    { qtd: 12, comp: 6000, cat: "L 2.1/2\" x 1/4\" Gerdau", desc: "CANTONEIRA 2.1/2\"X1/4\" X 6000" },
    { qtd: 190, comp: 6000, cat: "L 25,4 x 3,17 (serie pol) ArcelorMittal", desc: "CANTONEIRA 1\"X1/8\" X 6000" }
  ];
  var REF_CHAPAS = [
    { qtd: 36, t: 7.9375, a: 260, b: 500, desc: "CHAPA LISA 5/16\" 260 X 500" },
    { qtd: 72, t: 4.7625, a: 150, b: 500, desc: "CHAPA LISA 3/16\" 150 X 500" }
  ];
  /* o que a lista de referência pede de consumível (quantidades absolutas da obra de referência) */
  var REF_CONSUMIVEIS = { eletrodo250: 20, eletrodo325: 220, thinner: 8, zarcao: 8, disco7: 25, disco12: 25 };
  var REF_CACHORROS = { cachorroTerca: 84, cachorroContravento: 24, cachorroCorrente: 240 };
  var REF_OUTROS = [
    { qtd: 108, desc: "PARAFUSO SEXTAVADO 5/8\" X 1.1/2\" C/ PORCA" }, { qtd: 420, desc: "PARAFUSO SEXTAVADO 5/16\" X 1\" C/ PORCA" },
    { qtd: 10, desc: "BARRA ROSCADA 3/8\" X 1000" }, { qtd: 50, desc: "PORCA 3/8\"" }, { qtd: 4, desc: "BARRA ROSCADA 3/4\" X 1000" }, { qtd: 24, desc: "PORCA 3/4\"" },
    { qtd: 62, desc: "CALHA CHAPA #18 DESENV. 600 (m)" }, { qtd: 10, desc: "CONDUTOR 150" }
  ];

  /* massa linear (kg/m) pelo catálogo; null se o nome não existir */
  function kgm(nome) { var A = Aco(), o = A && A.obter ? A.obter(nome) : null; return o && num(o.massa, 0) > 0 ? num(o.massa, 0) : null; }

  /* toneladas de aço da lista de referência (barras comerciais + chapas) */
  function tonReferencia() {
    var kg = 0, falta = [];
    REF_BARRAS.forEach(function (b) { var m = kgm(b.cat); if (m == null) falta.push(b.cat); else kg += b.qtd * b.comp / 1000 * m; });
    REF_CHAPAS.forEach(function (c) { kg += c.qtd * (c.a / 1000) * (c.b / 1000) * (c.t / 1000) * RHO; });
    return { kg: r2(kg), ton: r3(kg / 1000), falta: falta };
  }

  /* o índice padrão: consumo da referência ÷ toneladas da referência */
  function indicePadrao() {
    var T = tonReferencia(), o = {};
    if (!(T.kg > 0) || T.falta.length) return null;
    Object.keys(REF_CONSUMIVEIS).forEach(function (k) { o[k] = r6(REF_CONSUMIVEIS[k] / (T.kg / 1000)); });
    return o;
  }
  var INDICE_ROTULOS = {
    eletrodo250: ["Eletrodo OK-46 Ø 2,50 mm", "kg por tonelada de aço"], eletrodo325: ["Eletrodo OK-46 Ø 3,25 mm", "kg por tonelada de aço"],
    thinner: ["Thinner (lata 18 L)", "latas por tonelada"], zarcao: ["Zarcão (lata 18 L)", "latas por tonelada"],
    disco7: ["Disco de corte 7\"", "un por tonelada"], disco12: ["Disco de corte 12\"", "un por tonelada"]
  };

  var CONFIG = {
    indice: null,                 /* null = o padrão da referência; ou { eletrodo250: n, … } por tonelada (editável) */
    fatorCachorro: { terca: 2, contravento: 2, corrente: 2 },   /* cachorros por peça: 1 por ligação (2 pontas) — editável */
    extras: { calhaM: 0, condutores: 0, barrasRoscadas: [] }    /* o que o modelo não tem: calha (m), condutores (un), [{ rotulo, qtd }] */
  };
  function cfg(c) {
    c = c || {};
    var base = indicePadrao() || {}, ind = {}, i;
    Object.keys(REF_CONSUMIVEIS).forEach(function (k) { var v = c.indice && c.indice[k] != null ? num(c.indice[k], null) : null; ind[k] = v != null && v >= 0 ? v : (base[k] || 0); });
    var f = c.fatorCachorro || {}, fc = {};
    ["terca", "contravento", "corrente"].forEach(function (k) { var v = num(f[k], CONFIG.fatorCachorro[k]); fc[k] = v >= 0 ? v : CONFIG.fatorCachorro[k]; });
    var e = c.extras || {}, br0 = [];
    arr(e.barrasRoscadas).forEach(function (x) { if (x && num(x.qtd, 0) > 0) br0.push({ rotulo: txt(x.rotulo), qtd: Math.round(num(x.qtd, 0)) }); });
    return { indice: ind, indiceEditado: !!(c.indice && Object.keys(c.indice).some(function (k) { return c.indice[k] != null && c.indice[k] !== ""; })), fatorCachorro: fc,
             extras: { calhaM: Math.max(0, num(e.calhaM, 0)), condutores: Math.max(0, Math.round(num(e.condutores, 0))), barrasRoscadas: br0 } };
  }

  /* ============================================ ROTULAGEM */
  var FRACOES = [[3.175, "1/8\""], [4.7625, "3/16\""], [6.35, "1/4\""], [7.9375, "5/16\""], [9.525, "3/8\""], [12.7, "1/2\""], [15.875, "5/8\""], [19.05, "3/4\""], [25.4, "1\""]];
  function espessuraRot(t) {
    for (var i = 0; i < FRACOES.length; i++) if (Math.abs(FRACOES[i][0] - t) <= 0.2) return FRACOES[i][1];
    return br(t, 1) + " mm";
  }
  /* nome do catálogo → texto de fábrica */
  function perfilRot(nome) {
    var n = txt(nome), m;
    if ((m = /^BR (\S+) \(D ([\d,.]+) mm\)/.exec(n))) return "VERGALHÃO CA-25 " + m[1];
    if ((m = /^TR (\d+) x (\d+) x ([\d,.]+)/.exec(n))) return "METALON " + Math.max(+m[1], +m[2]) + "X" + Math.min(+m[1], +m[2]) + "X" + m[3].replace(".", ",");
    if ((m = /^L (\d+(?:\.\d+\/\d+)?)" x (\d+\/\d+)"/.exec(n))) return "CANTONEIRA L " + m[1] + "\"X" + m[2] + "\"";
    if ((m = /^L ([\d,]+) x ([\d,]+)/.exec(n))) return "CANTONEIRA L " + m[1] + "X" + m[2] + " MM";
    if ((m = /^U (\d+) x (\d+) x ([\d,]+)/.exec(n))) return "PERFIL U " + m[1] + "X" + m[2] + "X" + m[3];
    return n.toUpperCase().replace(/\s+(GERDAU|TUPER|VMB|ARCELORMITTAL)$/i, "");
  }
  function barraRot(nome) { var m = /^BR (\S+) \(D/.exec(txt(nome)); return m ? m[1] : null; }

  /* ============================================ CLASSIFICAÇÃO DAS PEÇAS DO MODELO */
  function categoria(papel) {
    var p = sem(papel);
    if (/chumbador/.test(p)) return "chumbador";
    if (/banzo da coluna/.test(p)) return "colunaTrel";
    if (/^banzo (superior|inferior)|^diagonal|^montante/.test(p)) return "tesoura";
    if (/^terca/.test(p)) return "terca";
    if (/corrente de terca|^tirante$/.test(p)) return "corrente";
    if (/contravento/.test(p)) return "contravento";
    if (/^pilar|coluna de tapamento/.test(p)) return "coluna";
    if (/viga de cobertura|misula/.test(p)) return "viga";
    if (/travessa/.test(p)) return "travessa";
    if (/mao-francesa/.test(p)) return "maoFrancesa";
    return "outros";
  }
  var ROTULO_CAT = { colunaTrel: "COLUNA TRELIÇADA", terca: "TERÇA", corrente: "LINHA DE CORRENTE", contravento: "CONTRAVENTO", chumbador: "CHUMBADOR", coluna: "COLUNA / PILAR", viga: "VIGA DE COBERTURA",
                     travessa: "TRAVESSA DE FECHAMENTO", maoFrancesa: "MÃO-FRANCESA" };
  var ORDEM_CAT = ["tesoura", "colunaTrel", "coluna", "viga", "terca", "corrente", "contravento", "travessa", "maoFrancesa", "chumbador", "outros"];

  /* ============================================ A RELAÇÃO */
  function acharPend(chave, qtd, extra) {
    var c = pend(chave) || {};
    var o = { codigo: c.codigo || "", status: c.codigo ? STATUS_PEND : "", preco: null, unidade: c.unidade || "un", qtd: qtd };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  /* entrada: L = BimMetalFab.listas(estado, numeracao); plano = BimMetalCorte.planoBarras(numeracao, cfgCorte) (opcional);
   * c = a configuração (cfg). Devolve { parte1, parte2, consumiveis, totais, avisos, indice }. */
  function montar(L, plano, c0) {
    var C = cfg(c0), avisos = [];
    L = L || {}; var pecas = arr(L.pecas), perfis = pecas.filter(function (p) { return p.tipo === "Perfil" || p.tipo === "Mecânica"; });
    var chapas = pecas.filter(function (p) { return p.tipo === "Chapa"; });

    /* --------- PARTE 1: componentes */
    var porCat = {}; ORDEM_CAT.forEach(function (k) { porCat[k] = []; });
    perfis.forEach(function (p) { porCat[categoria(p.papel)].push(p); });
    var parte1 = [], item = 0;
    function add1(qtd, desc, tam, cat) { item++; parte1.push({ item: item, qtd: qtd, descricao: desc, tamanho: tam == null ? null : r2(tam), categoria: cat }); }
    /* tesouras: banzos + diagonais/montantes */
    var banzoInf = porCat.tesoura.filter(function (p) { return /^banzo inferior/.test(sem(p.papel)); }), banzoSup = porCat.tesoura.filter(function (p) { return /^banzo superior/.test(sem(p.papel)); });
    var trel = porCat.tesoura.filter(function (p) { return /^(diagonal|montante)/.test(sem(p.papel)); });
    if (porCat.tesoura.length) {
      var nT = 0, tam = 0, ref = banzoInf.length ? banzoInf : banzoSup;
      ref.forEach(function (p) { nT += p.quantidade; tam += p.comprimento / 1000 * p.quantidade; });
      if (!banzoInf.length) { nT = Math.round(nT / 2); tam = nT ? tam / nT * 2 : 0; avisos.push("Tesoura: não há banzo inferior no modelo — contei as tesouras pela metade dos banzos superiores."); }
      else if (nT) tam = tam / nT;
      if (nT > 0) {
        var pb = (banzoSup[0] || banzoInf[0]).perfil, pt = trel.length ? trel[0].perfil : null;
        add1(nT, "TESOURA METÁLICA EM PERFIS " + perfilRot(pb).replace(/^PERFIL /, "") + (pt ? ", TRELIÇADA EM " + perfilRot(pt) : ""), tam, "tesoura");
      }
    }
    ORDEM_CAT.forEach(function (k) {
      if (k === "tesoura") return;
      var g = {}, ordem = [];
      porCat[k].forEach(function (p) {
        var key = (k === "outros" ? sem(p.papel) + "|" : "") + p.perfil + "|" + p.comprimento;
        if (!g[key]) { g[key] = { p: p, qtd: 0 }; ordem.push(key); }
        g[key].qtd += p.quantidade;
      });
      ordem.sort(function (a, b) { return g[b].p.comprimento - g[a].p.comprimento; });
      ordem.forEach(function (key) {
        var x = g[key], rot = k === "outros" ? txt(x.p.papel).toUpperCase() : ROTULO_CAT[k];
        add1(x.qtd, rot + " EM " + perfilRot(x.p.perfil).replace(/^PERFIL /, ""), x.p.comprimento / 1000, k);
      });
    });

    /* --------- PARTE 2: materiais */
    var parte2 = [], i2 = 0;
    function add2(qtd, desc, extra) { i2++; var o = { item: i2, qtd: qtd, descricao: desc, unidade: "un", codigo: "", status: "", preco: null }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); parte2.push(o); return o; }
    /* barras comerciais (a lista de corte) */
    var acoKg = 0, semPlano = !plano || !arr(plano.grupos).length;
    if (!semPlano) {
      arr(plano.grupos).forEach(function (g) {
        arr(g.compra).forEach(function (x) {
          acoKg += num(g.kgm, 0) * x.comprimento / 1000 * x.quantidade;
          add2(x.quantidade, perfilRot(g.perfil) + " X " + Math.round(x.comprimento), { tipo: "barra", comprimento: x.comprimento, perfil: g.perfil, kg: r2(num(g.kgm, 0) * x.comprimento / 1000 * x.quantidade) });
        });
      });
    } else {
      avisos.push("Sem a lista de corte: as barras comerciais (6/12 m) não entraram. Gere o plano de barras (Lista de corte) para a Parte 2 trazer as barras a comprar.");
      perfis.forEach(function (p) { acoKg += num(p.pesoTotal, 0); });
    }
    /* chapas lisas peça a peça */
    var cg = {}, co = [];
    chapas.forEach(function (p) {
      var m = /#([\d,.]+)[^]*?(\d+) × (\d+) mm/.exec(txt(p.descricao)); if (!m) { avisos.push("Chapa sem medidas legíveis ficou de fora: " + txt(p.descricao)); return; }
      var t = num(m[1], 0), a = Math.min(+m[2], +m[3]), b = Math.max(+m[2], +m[3]), dob = /dobrada/.test(txt(p.descricao)), key = (dob ? "D" : "L") + "|" + t + "|" + a + "|" + b;
      if (!cg[key]) { cg[key] = { t: t, a: a, b: b, dob: dob, qtd: 0, kg: 0 }; co.push(key); }
      cg[key].qtd += p.quantidade; cg[key].kg += num(p.pesoTotal, 0);
    });
    co.sort(function (x, y) { return cg[y].t - cg[x].t || cg[y].b - cg[x].b || cg[y].a - cg[x].a; });
    co.forEach(function (k) { var g = cg[k]; acoKg += g.kg; add2(g.qtd, (g.dob ? "CHAPA DOBRADA " : "CHAPA LISA ") + espessuraRot(g.t) + " " + Math.round(g.a) + " X " + Math.round(g.b), { tipo: "chapa", kg: r2(g.kg) }); });
    /* cachorros: 1 por ligação */
    function soma(k) { var n = 0; porCat[k].forEach(function (p) { n += p.quantidade; }); return n; }
    var nCach = { cachorroTerca: Math.round(soma("terca") * C.fatorCachorro.terca), cachorroContravento: Math.round(soma("contravento") * C.fatorCachorro.contravento), cachorroCorrente: Math.round(soma("corrente") * C.fatorCachorro.corrente) };
    ["cachorroTerca", "cachorroContravento", "cachorroCorrente"].forEach(function (k) {
      if (nCach[k] > 0) { var p = acharPend(k, nCach[k]); add2(nCach[k], pend(k).descricao, { tipo: "cachorro", codigo: p.codigo, status: p.status, unidade: "un" }); }
    });
    /* parafusos c/ porca e as porcas dos tirantes */
    arr(L.parafusos).forEach(function (p) {
      if (/^Porca e arruela do tirante/.test(txt(p.tipo))) { if (p.porcas > 0) add2(p.porcas, "PORCA SEXTAVADA " + txt(p.diametro), { tipo: "porca" }); return; }
      if (p.quantidade > 0) add2(p.quantidade, "PARAFUSO SEXTAVADO " + txt(p.diametro) + (p.comprimento ? " X " + p.comprimento + " MM" : "") + " C/ PORCA" + (p.arruelas ? " E ARRUELA" : "") + (p.classe ? " (" + p.classe + ")" : ""), { tipo: "parafuso" });
    });
    arr(C.extras.barrasRoscadas).forEach(function (x) { add2(x.qtd, "BARRA ROSCADA " + (x.rotulo || "") + " X 1000", { tipo: "roscada" }); });
    /* calha e condutores: não existem no modelo */
    var ca = acharPend("calha", C.extras.calhaM, { tipo: "calha" });
    add2(C.extras.calhaM, "CALHA CHAPA #18 DESENV. 600 (m)", { tipo: "calha", codigo: ca.codigo, status: ca.status, unidade: "m", obs: C.extras.calhaM > 0 ? "" : "informar: o modelo não tem calha" });
    var cd = acharPend("condutor", C.extras.condutores, { tipo: "condutor" });
    add2(C.extras.condutores, "CONDUTOR 150", { tipo: "condutor", codigo: cd.codigo, status: cd.status, unidade: "un", obs: C.extras.condutores > 0 ? "" : "informar: o modelo não tem condutor" });

    /* consumíveis: índice por tonelada × aço do modelo */
    var ton = acoKg / 1000, consumiveis = [];
    Object.keys(REF_CONSUMIVEIS).forEach(function (k) {
      var q = ceil(C.indice[k] * ton), p = pend(k);
      consumiveis.push({ chave: k, descricao: p.descricao, codigo: p.codigo, status: STATUS_PEND, preco: null, unidade: p.unidade, indice: C.indice[k], qtd: q });
      add2(q, p.descricao, { tipo: "consumivel", codigo: p.codigo, status: STATUS_PEND, unidade: p.unidade, indice: C.indice[k] });
    });
    if (!(ton > 0)) avisos.push("Sem aço no modelo: os consumíveis ficaram em zero.");
    var padrao = indicePadrao();
    return { parte1: parte1, parte2: parte2, consumiveis: consumiveis, avisos: avisos,
             indice: { rotulo: ROTULO_INDICE, editado: C.indiceEditado, porTonelada: C.indice, padrao: padrao, rotulos: INDICE_ROTULOS, base: tonReferencia() },
             totais: { acoKg: r2(acoKg), acoTon: r3(ton), itensParte1: parte1.length, itensParte2: parte2.length, semPlano: semPlano },
             config: C };
  }

  /* a lista do cliente reconstituída (o teste confere que o índice devolve os consumíveis dela) */
  function referenciaCliente() {
    return { barras: REF_BARRAS.map(function (b) { return { qtd: b.qtd, comp: b.comp, cat: b.cat, desc: b.desc, kgm: kgm(b.cat), aprox: b.aprox || "" }; }),
             chapas: REF_CHAPAS.map(function (c) { return { qtd: c.qtd, t: c.t, a: c.a, b: c.b, desc: c.desc }; }),
             consumiveis: JSON.parse(JSON.stringify(REF_CONSUMIVEIS)), cachorros: JSON.parse(JSON.stringify(REF_CACHORROS)), outros: REF_OUTROS.map(function (o) { return { qtd: o.qtd, desc: o.desc }; }), ton: tonReferencia() };
  }

  /* ============================================ SAÍDAS */
  function textoIndice(R) {
    var I = R.indice;
    return I.rotulo + (I.editado ? " — valores ajustados por você" : " — padrão derivado da obra de referência: " + br(I.base.ton, 2) + " t de aço");
  }
  /* HTML: a tabela da tela e do relatório */
  function html(R, info) {
    info = info || {};
    var h = '<div data-mrf="relacao">';
    if (info.obra) h += '<p style="margin:0 0 6px"><b>' + esc(info.obra) + "</b></p>";
    h += '<h4 style="margin:8px 0 4px;font-size:13px">Componentes da estrutura</h4><table class="tbl tbl-compacta" data-mrf="parte1"><thead><tr><th class="num">ITEM</th><th class="num">QTDE</th><th>DESCRIÇÃO</th><th class="num">TAMANHO (m)</th></tr></thead><tbody>' +
      R.parte1.map(function (x) { return '<tr><td class="num">' + x.item + '</td><td class="num">' + x.qtd + "</td><td>" + esc(x.descricao) + '</td><td class="num">' + (x.tamanho == null ? "" : br(x.tamanho, 2)) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<h4 style="margin:12px 0 4px;font-size:13px">Relação de materiais</h4><table class="tbl tbl-compacta" data-mrf="parte2"><thead><tr><th class="num">ITEM</th><th class="num">QTDE</th><th>DESCRIÇÃO</th><th>Situação</th></tr></thead><tbody>' +
      R.parte2.map(function (x) { return '<tr><td class="num">' + x.item + '</td><td class="num">' + br(x.qtd, x.qtd % 1 ? 2 : 0) + "</td><td>" + esc(x.descricao) + "</td><td>" + (x.status ? esc(x.codigo + " — " + x.status) : "") + (x.obs ? " " + esc(x.obs) : "") + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<p style="font-size:12px;margin:8px 0 0" data-mrf="rotulo-indice"><b>' + esc(textoIndice(R)) + "</b>. Aço do modelo: " + br(R.totais.acoKg, 0) + " kg (" + br(R.totais.acoTon, 3) + " t). Eletrodo, thinner, zarcão e discos = índice por tonelada × aço; sem preço (pendente — cotar).</p>";
    R.avisos.forEach(function (a) { h += '<p style="font-size:12px;margin:4px 0;color:#a86a10">' + esc(a) + "</p>"; });
    return h + "</div>";
  }
  function htmlDocumento(R, info) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relação de materiais — formato fábrica</title><style>body{font:13px/1.4 Arial,sans-serif;margin:24px;color:#1d2733}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #9aa7b4;padding:3px 8px;text-align:left}th{background:#dde5ee}.num{text-align:right}</style></head><body><h2>Relação de materiais — formato fábrica</h2>' + html(R, info) + "</body></html>";
  }

  /* .xlsx (ExcelJS): Relação (as duas partes), Consumíveis, Pendentes e Leia-me */
  function xlsx(R, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var ws = wb.addWorksheet("Relação", { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 8 }, { width: 9 }, { width: 62 }, { width: 14 }, { width: 34 }];
    var CINZA = "FFDDE5EE";
    function cab(r, vals) { var row = ws.getRow(r); vals.forEach(function (v, i) { var c = row.getCell(i + 1); c.value = v; c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }; c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; }); }
    function lin(r, vals, fmt) { var row = ws.getRow(r); vals.forEach(function (v, i) { var c = row.getCell(i + 1); c.value = v; c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; if (fmt && fmt[i]) c.numFmt = fmt[i]; }); }
    ws.getCell("A1").value = "RELAÇÃO DE MATERIAIS — FORMATO FÁBRICA"; ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = info.obra || ""; var r = 4;
    ws.getCell("A" + r).value = "COMPONENTES DA ESTRUTURA"; ws.getCell("A" + r).font = { bold: true }; r++;
    cab(r++, ["ITEM", "QTDE", "DESCRIÇÃO", "TAMANHO (m)"]);
    R.parte1.forEach(function (x) { lin(r++, [x.item, x.qtd, x.descricao, x.tamanho], [null, "0", null, "#,##0.00"]); });
    r++; ws.getCell("A" + r).value = "RELAÇÃO DE MATERIAIS"; ws.getCell("A" + r).font = { bold: true }; r++;
    cab(r++, ["ITEM", "QTDE", "DESCRIÇÃO", "", "SITUAÇÃO"]);
    R.parte2.forEach(function (x) { lin(r++, [x.item, x.qtd, x.descricao, "", x.status ? x.codigo + " — " + x.status + (x.obs ? " (" + x.obs + ")" : "") : (x.obs || "")], [null, x.qtd % 1 ? "#,##0.00" : "0"]); });
    r++; ws.getCell("A" + r).value = ROTULO_INDICE + " — aço do modelo " + br(R.totais.acoKg, 0) + " kg (" + br(R.totais.acoTon, 3) + " t)"; ws.getCell("A" + r).font = { italic: true };
    var wc = wb.addWorksheet("Consumíveis (índice)");
    wc.columns = [{ header: "Consumível", width: 34 }, { header: "Código", width: 14 }, { header: "Unid.", width: 8 }, { header: "Índice por tonelada de aço", width: 26 }, { header: "Qtd. nesta obra", width: 16 }, { header: "Situação", width: 20 }];
    wc.getRow(1).font = { bold: true };
    R.consumiveis.forEach(function (x) { wc.addRow([x.descricao, x.codigo, x.unidade, x.indice, x.qtd, x.status]); });
    wc.getColumn(4).numFmt = "0.000"; wc.addRow([]); wc.addRow([ROTULO_INDICE + (R.indice.editado ? " — ajustado" : " — padrão da obra de referência: " + br(R.indice.base.ton, 2) + " t de aço")]);
    var wp = wb.addWorksheet("Pendentes — cotar");
    wp.columns = [{ header: "Código", width: 14 }, { header: "Item de catálogo", width: 44 }, { header: "Unid.", width: 8 }, { header: "Preço", width: 12 }, { header: "Situação", width: 22 }];
    wp.getRow(1).font = { bold: true };
    catalogoPendente().forEach(function (c) { wp.addRow([c.codigo, c.descricao, c.unidade, "", c.status]); });
    var wl = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica: relação de materiais no formato da fábrica (Parte 1 componentes, Parte 2 materiais).",
     "Barras comerciais: da lista de corte (6 e 12 m) do modelo. Chapas: peça a peça. Parafusos, porcas: do modelo. Cachorro: 1 por ligação (2 pontas por peça, fator editável).",
     "Calha e condutores não existem no modelo: foram digitados (campo 'informar' quando zerados).",
     ROTULO_INDICE + ": eletrodo, thinner, zarcão e discos = índice por tonelada de aço da obra de referência da metalúrgica (galpão 20×30, pé-direito 8 m) × aço desta obra. Não é norma: ajuste com a prática da fábrica.",
     "Nenhum preço foi inventado: os itens sem insumo no catálogo estão como 'pendente — cotar'.",
     "Modelagem e fabricação — não é cálculo estrutural."].concat(R.avisos).forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 140;
    return wb;
  }

  var BimMetalRelacaoFab = {
    CONFIG: CONFIG, STATUS_PEND: STATUS_PEND, ROTULO_INDICE: ROTULO_INDICE, INDICE_ROTULOS: INDICE_ROTULOS,
    cfg: cfg, montar: montar, catalogoPendente: catalogoPendente, referenciaCliente: referenciaCliente, indicePadrao: indicePadrao, tonReferencia: tonReferencia,
    categoria: categoria, perfilRot: perfilRot, espessuraRot: espessuraRot, barraRot: barraRot,
    html: html, htmlDocumento: htmlDocumento, xlsx: xlsx, textoIndice: textoIndice, br: br
  };
  global.BimMetalRelacaoFab = BimMetalRelacaoFab;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalRelacaoFab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

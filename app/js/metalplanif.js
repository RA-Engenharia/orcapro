/* =====================================================================
 * metalplanif.js — METÁLICA: CHAPA DOBRADA e PLANIFICAÇÃO (motor PURO,
 * ES5, sem DOM, Node-testável).
 *
 * A CHAPA DOBRADA é uma peça "perfil" do js/metalpeca.js com a seção
 *   perfil = { forma: "dobrada", pts: [[x, y]…] (m), t (m), ri (m), tipo, rot }
 * pts = a POLILINHA PELA LINHA MÉDIA da espessura (os cantos vivos; cada
 * vértice do meio vira uma dobra de raio interno ri). A peça é extrudada no
 * comprimento L (o comprimento das linhas de dobra). O 3D, a massa e o IFC
 * saem do contorno fechado que secao() monta (arcos nas dobras).
 *
 * PLANIFICAÇÃO (comprimento desenvolvido pelo fator K):
 *   aba reta (entre as tangências) = lado da polilinha − rm·tan(θ/2) em
 *     cada ponta que dobra (rm = ri + t/2: os vértices são da linha média);
 *   dobra θ (desvio, rad) → BA = θ · (ri + K·t)  (comprimento da linha neutra);
 *   Ld = Σ abas retas + Σ BA. Com K = 0,5 o Ld é o comprimento da linha média
 *   (o teste usa essa identidade para conferir a geometria).
 * Linha de dobra no meio da faixa da dobra, x a partir da borda inicial.
 * Sentido: vista pela face de referência (o lado esquerdo de quem percorre a
 * polilinha) — desvio à esquerda dobra "para cima", à direita "para baixo".
 *
 * FATOR K:
 *   "padrao" (o de partida): K = 0,33, marcado "conferir com a dobradeira";
 *   "tabela": por ri/t, dos pontos da DIN 6935 (fator de correção
 *             k = 0,65 + 0,5·log10(ri/t) para ri/t ≤ 5; K = k/2), com
 *             interpolação linear entre os pontos — também a conferir;
 *   "manual": o K que a dobradeira informar.
 * ⚠ K depende do processo (dobra no ar, fundo, punção, ferramenta, aço):
 *   todo valor daqui é de PARTIDA — a tela e os arquivos dizem isso.
 * Teste: node tools/test-metal-planif.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function F() { return dep("BimMetalFab", "./metalfab.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  var EPS = 1e-9;

  /* ---------------------------------------------------------- fator K */
  var K_PADRAO = 0.33;
  /* ri/t → K (pontos da DIN 6935: k = 0,65 + 0,5·log10(ri/t), K = k/2, 2 casas) */
  var K_TABELA = [[0.5, 0.25], [0.75, 0.29], [1, 0.33], [1.5, 0.37], [2, 0.40], [3, 0.44], [4, 0.48], [5, 0.50]];
  var FONTE_TABELA = "DIN 6935 (fator de correção k = 0,65 + 0,5·log(ri/t) para ri/t ≤ 5; K = k/2) — valor de partida";
  var config = { kModo: "padrao", k: K_PADRAO, tabela: null };
  function kTabela(rt, tab) {
    tab = arr(tab).length ? tab : K_TABELA;
    if (!(rt > 0)) return tab[0][1];
    if (rt <= tab[0][0]) return tab[0][1];
    for (var i = 1; i < tab.length; i++) {
      if (rt <= tab[i][0] + EPS) { var a = tab[i - 1], b = tab[i]; return r3(a[1] + (b[1] - a[1]) * (rt - a[0]) / (b[0] - a[0])); }
    }
    return tab[tab.length - 1][1];
  }
  /* t, ri em mm (ou m: só a razão importa); cfg = { kModo, k, tabela } */
  function kFator(t, ri, cfg) {
    cfg = cfg || config;
    var modo = cfg.kModo || "padrao", rt = num(ri, 0) / Math.max(num(t, 1), EPS);
    if (modo === "manual" && num(cfg.k, 0) > 0 && num(cfg.k, 0) <= 0.5) return { K: r3(num(cfg.k, 0)), modo: "manual", fonte: "informado (dobradeira)", conferir: false, rt: r2(rt) };
    if (modo === "tabela") return { K: kTabela(rt, cfg.tabela), modo: "tabela", fonte: FONTE_TABELA, conferir: true, rt: r2(rt) };
    return { K: K_PADRAO, modo: "padrao", fonte: "valor de partida", conferir: true, rt: r2(rt) };
  }

  /* ------------------------------------------------- geometria da linha média */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function unit(a) { var l = len(a); return l > EPS ? [a[0] / l, a[1] / l] : [1, 0]; }
  function ptsDe(p) { return arr(p && p.pts).map(function (q) { return Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q.x, 0), num(q.y, 0)]; }); }
  /* os lados e as dobras da polilinha (unidades da entrada) */
  function geometria(pts, t, ri) {
    var P = [];
    pts.forEach(function (q) { if (!P.length || len(sub(q, P[P.length - 1])) > 1e-9) P.push(q); });
    if (P.length < 2) return { ok: false, erro: "A chapa dobrada precisa de pelo menos 2 pontos na polilinha." };
    if (!(t > 0)) return { ok: false, erro: "Espessura da chapa maior que zero." };
    if (!(ri >= 0)) return { ok: false, erro: "Raio interno não pode ser negativo." };
    var rm = ri + t / 2, U = [], L = [], th = [0], sb = [0];
    for (var i = 0; i + 1 < P.length; i++) { var d = sub(P[i + 1], P[i]); U.push(unit(d)); L.push(len(d)); }
    /* tira vértice colinear (sem dobra) */
    for (var j = 1; j < P.length - 1; j++) {
      var a = U[j - 1], b = U[j], cr = a[0] * b[1] - a[1] * b[0], dt = a[0] * b[0] + a[1] * b[1], ang = Math.atan2(cr, dt);
      if (Math.abs(ang) > Math.PI - 1e-3) return { ok: false, erro: "Dobra de 180° (bainha) não é planificada aqui." };
      th.push(ang); sb.push(Math.abs(ang) < 1e-7 ? 0 : rm * Math.tan(Math.abs(ang) / 2));
    }
    th.push(0); sb.push(0);
    var retos = [];
    for (var k = 0; k < L.length; k++) {
      var r = L[k] - sb[k] - sb[k + 1];
      if (r < -1e-9) return { ok: false, erro: "Aba " + (k + 1) + " curta demais para o raio (sobra " + br(r * 1000, 1) + " mm): aumente a aba ou diminua o raio." };
      retos.push(Math.max(0, r));
    }
    return { ok: true, P: P, U: U, L: L, theta: th, setback: sb, retos: retos, rm: rm };
  }
  /* a CURVA MÉDIA com as normais (à esquerda) — para o contorno da seção */
  function curvaMedia(g, nArc) {
    nArc = nArc || 6;
    var out = [], P = g.P, U = g.U;
    function nl(u) { return [-u[1], u[0]]; }
    out.push({ p: P[0], n: nl(U[0]) });
    for (var i = 1; i < P.length - 1; i++) {
      var th = g.theta[i], s = g.setback[i], u0 = U[i - 1], u1 = U[i];
      if (Math.abs(th) < 1e-7) { out.push({ p: P[i], n: nl(u1) }); continue; }
      var T1 = [P[i][0] - u0[0] * s, P[i][1] - u0[1] * s], n0 = nl(u0), sg = th > 0 ? 1 : -1;
      var C = [T1[0] + n0[0] * g.rm * sg, T1[1] + n0[1] * g.rm * sg], a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
      for (var k = 0; k <= nArc; k++) {
        var a = a1 + th * k / nArc, pr = [C[0] + g.rm * Math.cos(a), C[1] + g.rm * Math.sin(a)], rad = [Math.cos(a), Math.sin(a)];
        out.push({ p: pr, n: sg > 0 ? [-rad[0], -rad[1]] : rad });
      }
    }
    out.push({ p: P[P.length - 1], n: nl(U[U.length - 1]) });
    /* sem ponto repetido (tangência = fim do lado anterior) */
    return out.filter(function (q, i) { return i === 0 || len(sub(q.p, out[i - 1].p)) > 1e-12; });
  }
  /* a SEÇÃO para o js/metalpeca.js (secaoDe): contorno fechado centrado na caixa, área e perímetro (m) */
  function secao(p) {
    var t = num(p && p.t, 0), ri = num(p && p.ri, 0), g = geometria(ptsDe(p), t, ri);
    if (!g.ok) return { ok: false, motivo: "Chapa dobrada: " + g.erro };
    var cm = curvaMedia(g, 6), esq = cm.map(function (q) { return [q.p[0] + q.n[0] * t / 2, q.p[1] + q.n[1] * t / 2]; }), dir = cm.map(function (q) { return [q.p[0] - q.n[0] * t / 2, q.p[1] - q.n[1] * t / 2]; });
    var c = esq.concat(dir.reverse());
    var xs = c.map(function (q) { return q[0]; }), ys = c.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    c = c.map(function (q) { return [r6(q[0] - cx), r6(q[1] - cy)]; });
    var A = 0, Pm = 0;
    for (var i = 0; i < c.length; i++) { var a = c[i], b = c[(i + 1) % c.length]; A += a[0] * b[1] - b[0] * a[1]; Pm += len(sub(b, a)); }
    if (A < 0) c.reverse();
    return { ok: true, forma: "dobrada", contorno: c, furos: [], area: Math.abs(A) / 2, perimetro: Pm, larg: x1 - x0, alt: y1 - y0, centro: [cx, cy], rotulo: rotulo(p) };
  }
  function rotulo(p) {
    var t = num(p && p.t, 0) * 1000, base = "# " + (Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : br(t, 2).replace(/0$/, ""));
    return "Chapa dobrada " + base + (p && p.rot ? " - " + txt(p.rot) : "");
  }

  /* -------------------------------------------------------- PLANIFICAÇÃO
   * p = perfil "dobrada" (m); Lpeca = comprimento da peça (m); cfg = { kModo, k } → mm */
  function planificar(p, Lpeca, cfg) {
    var t = num(p && p.t, 0), ri = num(p && p.ri, 0), g = geometria(ptsDe(p), t, ri);
    if (!g.ok) return { ok: false, erro: g.erro };
    var kf = kFator(t, ri, cfg), K = kf.K, x = 0, abas = [], dobras = [], avisos = [];
    for (var i = 0; i < g.retos.length; i++) {
      abas.push(r2(g.retos[i] * 1000));
      x += g.retos[i];
      var th = g.theta[i + 1];
      if (i + 1 < g.retos.length && Math.abs(th) > 1e-7) {
        var BA = Math.abs(th) * (ri + K * t), ang = Math.abs(th) * 180 / Math.PI;
        dobras.push({ n: dobras.length + 1, ang: r2(ang), angInterno: r2(180 - ang), sentido: th > 0 ? "cima" : "baixo", ri: r2(ri * 1000), BA: r2(BA * 1000),
                      ini: r2(x * 1000), fim: r2((x + BA) * 1000), x: r2((x + BA / 2) * 1000) });
        x += BA;
      }
    }
    if (ri < t - 1e-9) avisos.push("Raio interno menor que a espessura (ri/t = " + br(ri / t, 2) + "): risco de trinca na dobra — conferir com a dobradeira e o aço.");
    if (kf.conferir) avisos.push("Fator K " + br(K, 2) + " (" + kf.fonte + "): conferir com a dobradeira antes de cortar.");
    var Lm = 0; for (var j = 0; j < g.retos.length; j++) Lm += g.retos[j]; for (var k = 1; k < g.P.length - 1; k++) Lm += Math.abs(g.theta[k]) * g.rm;
    return { ok: true, t: r3(t * 1000), ri: r2(ri * 1000), K: K, kModo: kf.modo, fonteK: kf.fonte, conferir: kf.conferir, rt: kf.rt, Lpeca: r1(num(Lpeca, 0) * 1000),
             Ld: r2(x * 1000), Lmedia: r2(Lm * 1000), abas: abas, dobras: dobras, avisos: avisos, pts: g.P.map(function (q) { return [r2(q[0] * 1000), r2(q[1] * 1000)]; }) };
  }

  /* ------------------------------------------------ formas padrão (mm, medidas EXTERNAS) → linha média (m) */
  var FORMAS = {
    L: { nome: "Cantoneira dobrada (L)", campos: [["a", "Aba vertical a (mm)", 50], ["b", "Aba horizontal b (mm)", 50]] },
    U: { nome: "U dobrado", campos: [["h", "Alma h (mm)", 100], ["b", "Mesa b (mm)", 50]] },
    Ue: { nome: "U enrijecido (Ue)", campos: [["h", "Alma h (mm)", 150], ["b", "Mesa b (mm)", 60], ["d", "Enrijecedor d (mm)", 20]] },
    Z: { nome: "Z dobrado", campos: [["h", "Alma h (mm)", 150], ["b", "Mesa b (mm)", 60]] },
    cartola: { nome: "Cartola (ômega)", campos: [["h", "Altura h (mm)", 50], ["bc", "Topo bc (mm)", 60], ["bf", "Aba bf (mm)", 30]] },
    livre: { nome: "Polilinha livre (linha média)", campos: [] }
  };
  function formaPadrao(tipo, d, tmm) {
    var t = num(tmm, 0), h2 = t / 2, g = function (k) { return num(d && d[k], 0); }, P;
    if (tipo === "L") P = [[g("b"), h2], [h2, h2], [h2, g("a")]];
    else if (tipo === "U") P = [[g("b"), h2], [h2, h2], [h2, g("h") - h2], [g("b"), g("h") - h2]];
    else if (tipo === "Ue") P = [[g("b") - h2, g("d")], [g("b") - h2, h2], [h2, h2], [h2, g("h") - h2], [g("b") - h2, g("h") - h2], [g("b") - h2, g("h") - g("d")]];
    else if (tipo === "Z") P = [[-(g("b") - h2), h2], [0, h2], [0, g("h") - h2], [g("b") - h2, g("h") - h2]];
    else if (tipo === "cartola") { var bf = g("bf"), bc = g("bc"), h = g("h"); P = [[0, h2], [bf + h2, h2], [bf + h2, h - h2], [bf + bc - h2, h - h2], [bf + bc - h2, h2], [2 * bf + bc, h2]]; }
    else P = lerPolilinha(d && d.pts);
    return P.map(function (q) { return [r6(q[0] / 1000), r6(q[1] / 1000)]; });
  }
  function rotuloForma(tipo, d, tmm) {
    var g = function (k) { return String(Math.round(num(d && d[k], 0))); };
    if (tipo === "L") return "L " + g("a") + " x " + g("b");
    if (tipo === "U") return "U " + g("h") + " x " + g("b");
    if (tipo === "Ue") return "Ue " + g("h") + " x " + g("b") + " x " + g("d");
    if (tipo === "Z") return "Z " + g("h") + " x " + g("b");
    if (tipo === "cartola") return "Cartola " + g("h") + " x " + g("bc") + " x " + g("bf");
    void tmm; return "perfil livre";
  }
  /* "0,0; 100,0; 100,50" (mm) → [[0,0],[100,0],[100,50]] */
  function lerPolilinha(s) {
    if (Array.isArray(s)) return s.map(function (q) { return [num(q[0], 0), num(q[1], 0)]; });
    return txt(s).split(/[;\n]+/).map(function (p) { var m = /(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)/.exec(p.replace(/(\d),(\d)\s*[, ]/, "$1.$2 ")); return m ? [num(m[1], NaN), num(m[2], NaN)] : null; })
      .filter(function (q) { return q && isFinite(q[0]) && isFinite(q[1]); });
  }
  /* A PEÇA: o = { origem [x,y,z] (m), ex, ey, L (m), tipo, dims (mm), pts (m, se tipo livre), t (m), ri (m), aco, papel } → caixa (op criar) ou { erro } */
  function dobrada(o) {
    o = o || {};
    var B = M(); if (!B) return { erro: "O motor das peças (js/metalpeca.js) não carregou." };
    var t = num(o.t, 0), ri = num(o.ri, t), tipo = FORMAS[o.tipo] ? o.tipo : "livre";
    if (!(t >= 0.0004 && t <= 0.025)) return { erro: "Espessura da chapa dobrada entre 0,4 mm e 25 mm." };
    var pts = o.pts && tipo === "livre" ? o.pts : formaPadrao(tipo, o.dims || {}, t * 1000);
    var perfil = { forma: "dobrada", tipo: tipo, pts: pts, t: r6(t), ri: r6(ri), rot: o.rot || rotuloForma(tipo, o.dims || {}, t * 1000) };
    var s = secao(perfil); if (!s.ok) return { erro: s.motivo };
    return B.perfil({ perfil: perfil, origem: o.origem, ex: o.ex, ey: o.ey, L: o.L, papel: o.papel || "Chapa dobrada", aco: o.aco || "ASTM A36", ifc: "IFCPLATE", lig: o.lig, soldadaEm: o.soldadaEm, solda: o.solda });
  }
  function ehDobrada(c) { return !!(c && c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && c.metal.perfil && c.metal.perfil.forma === "dobrada"); }

  /* ------------------------------------------------------------ DXF e desenho */
  /* as linhas de dobra e os textos no DXF de corte (doc = DxfDoc do js/metalfab.js); T = transformação do ponto */
  function dxfDobras(doc, pl, T, B) {
    arr(pl.dobras).forEach(function (d) {
      var a = T([d.x, 0]), b = T([d.x, B]);
      doc.linha("BEND", a, b);
      var m = T([d.x + 2, B / 2]);
      doc.texto("BEND_TEXT", m[0], m[1], 4, "DOBRA " + d.n + " " + Math.round(d.ang) + " GRAUS P/ " + (d.sentido === "cima" ? "CIMA" : "BAIXO") + " RI " + br(d.ri, 1));
    });
  }
  function dxfPlanificacao(pl, marca) {
    var Fb = F(); if (!Fb || !Fb.DxfDoc) return "";
    var d = new Fb.DxfDoc(), Ld = pl.Ld, B = pl.Lpeca, I = function (q) { return q; };
    d.poli("CUT_OUTSIDE", [[0, 0], [Ld, 0], [Ld, B], [0, B]]);
    dxfDobras(d, pl, I, B);
    d.texto("ETCH", Math.min(15, Ld / 5), Math.min(10, B / 5), Math.max(4, Math.min(10, Math.min(Ld, B) / 8)), marca || "");
    d.texto("BEND_TEXT", 0, -12, 4, "PLANIFICACAO: Ld = " + br(Ld, 1) + " mm, K = " + br(pl.K, 2) + (pl.conferir ? " (CONFERIR COM A DOBRADEIRA)" : "") + ", t = " + br(pl.t, 2) + " mm");
    return d.escrever([["CUT_OUTSIDE", 7], ["BEND", 5], ["BEND_TEXT", 3], ["ETCH", 3]]);
  }

  var BimMetalPlanif = {
    K_PADRAO: K_PADRAO, K_TABELA: K_TABELA, FONTE_TABELA: FONTE_TABELA, FORMAS: FORMAS, config: config,
    kFator: kFator, kTabela: kTabela, geometria: geometria, secao: secao, planificar: planificar,
    formaPadrao: formaPadrao, rotuloForma: rotuloForma, lerPolilinha: lerPolilinha, dobrada: dobrada, ehDobrada: ehDobrada,
    dxfDobras: dxfDobras, dxfPlanificacao: dxfPlanificacao,
    configurar: function (c) { c = c || {}; if (c.kModo) config.kModo = c.kModo; if (c.k != null) config.k = num(c.k, config.k); return config; }
  };
  global.BimMetalPlanif = BimMetalPlanif;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalPlanif;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

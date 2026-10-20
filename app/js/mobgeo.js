/* =====================================================================
 * mobgeo.js — FERRAMENTAS DE GEOMETRIA do mobiliário e do paisagismo (motor puro, Node-testável)
 *
 * Pedido do Rogério (19/10/2026): o 3D do mobiliário não pode ser "de caixinha". A peça tem
 * PROPORÇÃO e DETALHE de produto (almofada com canto arredondado, pé cônico, tampo com
 * espessura, folha de palmeira que cai), sem pesar a cena: poucos triângulos bem colocados.
 *
 * O QUE É: um construtor de cena. `Mob.cena()` devolve um objeto onde se desenha com
 * primitivas (caixa, caixa arredondada, tronco, cilindro, elipsoide, torno, prisma, bandeja,
 * lâmina, piramide) e se empilham transformações (`grupo`). No fim, `solidos()` entrega UMA malha
 * por material — uma chamada de desenho por material — no formato `forma: "malha"` do
 * js/familia.js (v = [x,y,z…], f = índices; volume com sinal positivo).
 *
 * CONVENÇÃO: metros; Y para cima; X ao longo da largura; Z para a frente.
 * Cada primitiva diz onde fica o PONTO DE ENCAIXE (centro da base, salvo dito o contrário).
 * Rotação de primitiva: rotZ (rolagem), depois rotX (cabeceio), depois rotY (giro), em graus.
 *
 * AS REGRAS (cada uma por um defeito que ela impede):
 *  1. A normal de cada vértice vem do three (computeVertexNormals). Por isso a aresta VIVA
 *     (quina de caixa, borda do tampo) tem vértice DUPLICADO por face, e a superfície LISA
 *     (cilindro, elipsoide, almofada) tem vértice COMPARTILHADO. Quem inverte isso ganha
 *     móvel "amolecido" ou bola facetada.
 *  2. Toda primitiva é malha FECHADA com volume POSITIVO: o volume com sinal decide e vira a
 *     peça que sair do avesso (mesma regra do js/familia.js para revolução).
 *  3. Nenhum NaN: parâmetro fora de faixa é travado (clamp), nunca quebra a cena.
 *  4. Aleatoriedade só pelo `Mob.sorteio(semente)`: a mesma semente dá a mesma planta.
 * ES5, IIFE, sem DOM (a miniatura usa canvas só se houver document).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2, RAD = Math.PI / 180;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function cl(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* ------------------------------------------------------------ MATRIZ 3×3 + t */
  function ident() { return { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }; }
  function mulR(a, b) {
    var o = [], i, j, k, s;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) { s = 0; for (k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j]; o.push(s); }
    return o;
  }
  function comp(A, B) {   /* A ∘ B: aplica B e depois A */
    var R = mulR(A.r, B.r), t = [0, 0, 0], i;
    for (i = 0; i < 3; i++) t[i] = A.r[i * 3] * B.t[0] + A.r[i * 3 + 1] * B.t[1] + A.r[i * 3 + 2] * B.t[2] + A.t[i];
    return { r: R, t: t };
  }
  function rotX(g) { var c = Math.cos(g * RAD), s = Math.sin(g * RAD); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(g) { var c = Math.cos(g * RAD), s = Math.sin(g * RAD); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotZ(g) { var c = Math.cos(g * RAD), s = Math.sin(g * RAD); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function local(x, y, z, o) {   /* translação ∘ giro Y ∘ cabeceio X ∘ rolagem Z */
    o = o || {};
    var R = mulR(rotY(num(o.rotY, 0)), mulR(rotX(num(o.rotX, 0)), rotZ(num(o.rotZ, 0))));
    return { r: R, t: [x, y, z] };
  }

  /* ------------------------------------------------------------ SORTEIO (mulberry32) */
  function sorteio(semente) {
    var a = (semente | 0) || 1;
    function u() { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    u.entre = function (lo, hi) { return lo + (hi - lo) * u(); };
    return u;
  }

  /* ------------------------------------------------------------ CENA */
  function Cena() {
    this.M = ident(); this.pilha = []; this.grupos = {}; this.ordem = []; this.tri = 0; this.env = null;
    this.parteAtual = ""; this.partes = []; this.errosPartes = [];
  }
  var P = Cena.prototype;

  P.empilhar = function (x, y, z, giroY) { this.pilha.push(this.M); this.M = comp(this.M, local(num(x, 0), num(y, 0), num(z, 0), { rotY: num(giroY, 0) })); return this; };
  P.desempilhar = function () { if (this.pilha.length) this.M = this.pilha.pop(); return this; };
  /* grupo(x, y, z, giroY, fn): desenha `fn` com a origem movida; é como se faz a cadeira que se repete em volta da mesa */
  P.grupo = function (x, y, z, giroY, fn) { this.empilhar(x, y, z, giroY); try { fn(this); } finally { this.desempilhar(); } return this; };

  /* PARTE MÓVEL (porta, folha, gaveta): tudo o que `fn` desenha vira malha SEPARADA (uma por material), marcada com o
     id da parte, para o 3D mover só ela. `def` é o movimento em coordenadas LOCAIS DA PEÇA (as da raiz, como se
     desenha — fora de grupo/empilhar): { tipo: giro|pivotante|basculante|correr|gaveta, eixo:[x,y,z], dir?, angulo?,
     sentido?, vetor?, curso? } (js/partesmoveis.js). O volume, o quantitativo e a caixa da peça NÃO mudam com a parte. */
  P.parte = function (id, def, fn) {
    var PM = global.PartesMoveis || (typeof require === "function" ? (function () { try { return require("./partesmoveis.js"); } catch (e) { return null; } })() : null);
    if (!PM) { this.errosPartes.push("o motor de partes móveis (js/partesmoveis.js) não carregou"); fn(this); return this; }
    var d = {}; Object.keys(def || {}).forEach(function (k) { d[k] = def[k]; });
    d.id = id;
    var ja = this.partes.filter(function (p) { return p.id === id; })[0], antes = this.parteAtual;
    if (!ja) {
      var r = PM.normalizar(d);
      if (!r.ok) this.errosPartes = this.errosPartes.concat(r.erros); else this.partes.push(r.parte);
    }
    this.parteAtual = String(id);
    try { fn(this); } finally { this.parteAtual = antes; }
    return this;
  };

  /* junta uma primitiva (vértices e índices LOCAIS) ao grupo do material */
  P._add = function (mat, v, f, o) {
    if (!v.length || !f.length) return;
    o = o || {};
    var L = comp(this.M, local(num(o.x, 0), num(o.y, 0), num(o.z, 0), o)), R = L.r, t = L.t, w = new Array(v.length), i;
    for (i = 0; i + 2 < v.length; i += 3) {
      var x = v[i], y = v[i + 1], z = v[i + 2];
      w[i] = R[0] * x + R[1] * y + R[2] * z + t[0];
      w[i + 1] = R[3] * x + R[4] * y + R[5] * z + t[1];
      w[i + 2] = R[6] * x + R[7] * y + R[8] * z + t[2];
    }
    var vol = 0, a, b, c;
    for (i = 0; i + 2 < f.length; i += 3) {
      a = f[i] * 3; b = f[i + 1] * 3; c = f[i + 2] * 3;
      vol += w[a] * (w[b + 1] * w[c + 2] - w[b + 2] * w[c + 1]) - w[a + 1] * (w[b] * w[c + 2] - w[b + 2] * w[c]) + w[a + 2] * (w[b] * w[c + 1] - w[b + 1] * w[c]);
    }
    vol /= 6;
    var ff = f;
    if (o.aberta) vol = num(o.volume, 0);   /* peça aberta (parte de um sólido maior): sem ajuste de sentido; o volume vem de quem chama */
    else if (vol < 0) { ff = f.slice(); for (i = 0; i + 2 < ff.length; i += 3) { var tmp = ff[i + 1]; ff[i + 1] = ff[i + 2]; ff[i + 2] = tmp; } vol = -vol; }
    var chave = String(mat || "") + (this.parteAtual ? "|@" + this.parteAtual : "");
    var g = this.grupos[chave];
    if (!g) { g = this.grupos[chave] = { material: String(mat || ""), v: [], f: [], volume: 0 }; if (this.parteAtual) g.parte = this.parteAtual; this.ordem.push(chave); }
    var base = g.v.length / 3;
    for (i = 0; i < w.length; i++) g.v.push(r6(w[i]));
    for (i = 0; i < ff.length; i++) g.f.push(ff[i] + base);
    g.volume += vol; this.tri += ff.length / 3;
    var bx = this.env || (this.env = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity });
    for (i = 0; i + 2 < w.length; i += 3) {
      if (w[i] < bx.x0) bx.x0 = w[i]; if (w[i] > bx.x1) bx.x1 = w[i];
      if (w[i + 1] < bx.y0) bx.y0 = w[i + 1]; if (w[i + 1] > bx.y1) bx.y1 = w[i + 1];
      if (w[i + 2] < bx.z0) bx.z0 = w[i + 2]; if (w[i + 2] > bx.z1) bx.z1 = w[i + 2];
    }
  };

  /* ---------------------------------------------------------- CAIXA (aresta viva) */
  function malhaCaixa(dx, dy, dz) {
    var hx = dx / 2, hz = dz / 2, v = [], f = [];
    function face(a, b, c, d) { var i = v.length / 3; v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]); f.push(i, i + 1, i + 2, i, i + 2, i + 3); }
    face([-hx, dy, hz], [hx, dy, hz], [hx, dy, -hz], [-hx, dy, -hz]);
    face([-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]);
    face([-hx, 0, hz], [hx, 0, hz], [hx, dy, hz], [-hx, dy, hz]);
    face([hx, 0, -hz], [-hx, 0, -hz], [-hx, dy, -hz], [hx, dy, -hz]);
    face([hx, 0, hz], [hx, 0, -hz], [hx, dy, -hz], [hx, dy, hz]);
    face([-hx, 0, -hz], [-hx, 0, hz], [-hx, dy, hz], [-hx, dy, -hz]);
    return { v: v, f: f };
  }
  /* caixa(mat, x, y, z, dx, dy, dz, o): centro X/Z, BASE em y */
  P.caixa = function (mat, x, y, z, dx, dy, dz, o) {
    dx = Math.max(1e-4, num(dx, 0.1)); dy = Math.max(1e-4, num(dy, 0.1)); dz = Math.max(1e-4, num(dz, 0.1));
    var m = malhaCaixa(dx, dy, dz); o = o || {};
    this._add(mat, m.v, m.f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };
  /* tronco(mat, x, y, z, dx0, dz0, dx1, dz1, dy): base (dx0 × dz0) e topo (dx1 × dz1) — pé de móvel afunilado */
  P.tronco = function (mat, x, y, z, dx0, dz0, dx1, dz1, dy, o) {
    var a = dx0 / 2, b = dz0 / 2, c = dx1 / 2, d = dz1 / 2, v = [], f = [];
    function face(p, q, r, s) { var i = v.length / 3; v.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2], s[0], s[1], s[2]); f.push(i, i + 1, i + 2, i, i + 2, i + 3); }
    face([-c, dy, d], [c, dy, d], [c, dy, -d], [-c, dy, -d]); face([-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]);
    face([-a, 0, b], [a, 0, b], [c, dy, d], [-c, dy, d]); face([a, 0, -b], [-a, 0, -b], [-c, dy, -d], [c, dy, -d]);
    face([a, 0, b], [a, 0, -b], [c, dy, -d], [c, dy, d]); face([-a, 0, -b], [-a, 0, b], [-c, dy, d], [-c, dy, -d]);
    o = o || {};
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ------------------------------------------------- CAIXA ARREDONDADA (almofada, tampo, corpo)
   * O truque do "cubo arredondado": uma grade em cada face; todo ponto é puxado para a casca de raio r
   * em volta da caixa INTERNA. A parte plana não muda; só a quina vira arco. Vértices SOLDADOS entre
   * as faces (a normal do three fica lisa na quina e exata no plano). k = pontos por arco. */
  function malhaCaixaR(dx, dy, dz, r, k) {
    var h = [dx / 2, dy / 2, dz / 2], rr = Math.max(1e-4, Math.min(r, Math.min(h[0], h[1], h[2]) - 1e-4)), ih = [h[0] - rr, h[1] - rr, h[2] - rr];
    var v = [], f = [], mapa = {};
    function ticks(a) {
      var t = [], j;
      for (j = 0; j <= k; j++) t.push(-h[a] + rr * j / k);
      for (j = k; j >= 0; j--) t.push(h[a] - rr * j / k);
      return t;
    }
    var T = [ticks(0), ticks(1), ticks(2)];
    function pt(p) {
      var q = [cl(p[0], -ih[0], ih[0]), cl(p[1], -ih[1], ih[1]), cl(p[2], -ih[2], ih[2])], d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], n = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      return n > 1e-9 ? [q[0] + d[0] / n * rr, q[1] + d[1] / n * rr, q[2] + d[2] / n * rr] : q;
    }
    function idx(p) {
      var kk = Math.round(p[0] * 1e5) + "," + Math.round(p[1] * 1e5) + "," + Math.round(p[2] * 1e5);
      if (mapa[kk] == null) { mapa[kk] = v.length / 3; v.push(p[0], p[1] + dy / 2, p[2]); }
      return mapa[kk];
    }
    var a, s, i, j;
    for (a = 0; a < 3; a++) for (s = -1; s <= 1; s += 2) {
      var b = (a + 1) % 3, c = (a + 2) % 3, Tb = T[b], Tc = T[c], G = [];
      for (i = 0; i < Tb.length; i++) { G.push([]); for (j = 0; j < Tc.length; j++) { var p = [0, 0, 0]; p[a] = s * h[a]; p[b] = Tb[i]; p[c] = Tc[j]; G[i].push(idx(pt(p))); } }
      for (i = 0; i + 1 < Tb.length; i++) for (j = 0; j + 1 < Tc.length; j++) {
        var q0 = G[i][j], q1 = G[i + 1][j], q2 = G[i + 1][j + 1], q3 = G[i][j + 1];
        if (q0 === q1 || q1 === q2 || q2 === q3 || q3 === q0) continue;
        if (s > 0) f.push(q0, q1, q2, q0, q2, q3); else f.push(q0, q2, q1, q0, q3, q2);
      }
    }
    return { v: v, f: f };
  }
  /* caixaR(mat, x, y, z, dx, dy, dz, raio, o): centro X/Z, base em y; o.k = pontos por arco (1 = quina chanfrada barata) */
  P.caixaR = function (mat, x, y, z, dx, dy, dz, raio, o) {
    o = o || {};
    var m = malhaCaixaR(Math.max(1e-3, dx), Math.max(1e-3, dy), Math.max(1e-3, dz), Math.max(1e-4, num(raio, 0.01)), o.k || 1);
    this._add(mat, m.v, m.f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- CILINDRO / CONE */
  /* cil(mat, x, y, z, r, h, o): base no centro; o.r2 = raio do topo (cone/tronco); o.seg; o.semTampa */
  function malhaCil(r, h, r2, seg, semTampa, centro) {
    var v = [], f = [], j, y0 = centro ? -h / 2 : 0;
    for (j = 0; j < seg; j++) { var a = TAU * j / seg; v.push(Math.cos(a) * r, y0, Math.sin(a) * r); }
    for (j = 0; j < seg; j++) { var a2 = TAU * j / seg; v.push(Math.cos(a2) * r2, y0 + h, Math.sin(a2) * r2); }
    for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg; f.push(j, seg + j, seg + j2, j, seg + j2, j2); }
    if (!semTampa) {
      var cb = v.length / 3; v.push(0, y0, 0);
      for (j = 0; j < seg; j++) { var a3 = TAU * j / seg; v.push(Math.cos(a3) * r, y0, Math.sin(a3) * r); }
      for (j = 0; j < seg; j++) f.push(cb, cb + 1 + j, cb + 1 + (j + 1) % seg);
      var ct = v.length / 3; v.push(0, y0 + h, 0);
      for (j = 0; j < seg; j++) { var a4 = TAU * j / seg; v.push(Math.cos(a4) * r2, y0 + h, Math.sin(a4) * r2); }
      for (j = 0; j < seg; j++) f.push(ct, ct + 1 + (j + 1) % seg, ct + 1 + j);
    }
    return { v: v, f: f };
  }
  P.cil = function (mat, x, y, z, r, h, o) {
    o = o || {};
    var r1 = Math.max(1e-4, num(r, 0.05)), r2 = o.r2 == null ? r1 : Math.max(0, o.r2), seg = cl(Math.round(o.seg || 18), 6, 48);
    var m = malhaCil(r1, Math.max(1e-4, num(h, 0.1)), r2, seg, !!o.semTampa, !!o.centro);
    this._add(mat, m.v, m.f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };
  /* cilH(mat, x, y, z, r, comp, eixo, o): cilindro DEITADO, centrado em (x,y,z), eixo "x" ou "z" */
  P.cilH = function (mat, x, y, z, r, comp, eixo, o) {
    o = o || {};
    var oo = { seg: o.seg, r2: o.r2, semTampa: o.semTampa, centro: true };
    if (eixo === "z") oo.rotX = 90; else oo.rotZ = 90;
    return this.cil(mat, x, y, z, r, comp, oo);
  };

  /* ---------------------------------------------------------- ELIPSOIDE (centro) */
  P.elipsoide = function (mat, x, y, z, rx, ry, rz, o) {
    o = o || {};
    var seg = cl(Math.round(o.seg || 14), 6, 40), an = cl(Math.round(o.aneis || Math.max(4, Math.round(seg / 2))), 3, 24), v = [], f = [], i, j;
    var corte = o.meia ? Math.PI / 2 : Math.PI;   /* meia: só o hemisfério de cima (cúpula) */
    v.push(0, ry, 0);
    for (i = 1; i < an; i++) {
      var th = corte * i / an, sy = Math.cos(th), sr = Math.sin(th);
      for (j = 0; j < seg; j++) { var ph = TAU * j / seg; v.push(Math.cos(ph) * sr * rx, sy * ry, Math.sin(ph) * sr * rz); }
    }
    var polo = -1;
    if (!o.meia) { polo = v.length / 3; v.push(0, -ry, 0); }
    for (j = 0; j < seg; j++) f.push(0, 1 + (j + 1) % seg, 1 + j);
    for (i = 0; i + 1 < an - 1; i++) for (j = 0; j < seg; j++) {
      var a = 1 + i * seg + j, b = 1 + i * seg + (j + 1) % seg, c = 1 + (i + 1) * seg + j, d = 1 + (i + 1) * seg + (j + 1) % seg;
      f.push(a, b, d, a, d, c);
    }
    var ult = 1 + (an - 2) * seg;
    if (!o.meia) { for (j = 0; j < seg; j++) f.push(polo, ult + j, ult + (j + 1) % seg); }
    else {   /* tampa plana da cúpula, no equador */
      var ce = v.length / 3; v.push(0, 0, 0);
      var eq0 = v.length / 3;
      for (j = 0; j < seg; j++) { var ph2 = TAU * j / seg; v.push(Math.cos(ph2) * rx, 0, Math.sin(ph2) * rz); }
      for (j = 0; j < seg; j++) f.push(ce, eq0 + j, eq0 + (j + 1) % seg);
      /* anel do último paralelo até o equador */
      for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg; f.push(ult + j, ult + j2, eq0 + j2, ult + j, eq0 + j2, eq0 + j); }
    }
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- TORNO (revolução de perfil) */
  /* torno(mat, x, y, z, perfil, o): perfil [[raio, altura], …] de baixo para cima; fecha as pontas;
     quina viva onde o perfil dobra mais de 38° (vaso, pé de mesa, copa em cúpula). o.ex/o.ez ovalam. */
  P.torno = function (mat, x, y, z, perfil, o) {
    o = o || {};
    var pts = arr(perfil).map(function (q) { return [Math.max(0, num(q[0], 0)), num(q[1], 0)]; });
    if (pts.length < 2) return this;
    var seg = cl(Math.round(o.seg || 20), 6, 48), ex = num(o.ex, 1), ez = num(o.ez, 1), v = [], f = [], n = pts.length, j, i;
    function ang(i0) {   /* ângulo de dobra no ponto i0 */
      var a = pts[i0 - 1], b = pts[i0], c = pts[i0 + 1], u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]], lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lw = Math.sqrt(w[0] * w[0] + w[1] * w[1]);
      if (lu < 1e-9 || lw < 1e-9) return 0;
      return Math.acos(cl((u[0] * w[0] + u[1] * w[1]) / (lu * lw), -1, 1)) / RAD;
    }
    var aneis = [];   /* cada trecho (i → i+1) tem os dois anéis dele; no ponto liso o anel é repartido */
    function anel(q) { var i0 = v.length / 3; for (var jj = 0; jj < seg; jj++) { var a = TAU * jj / seg; v.push(Math.cos(a) * q[0] * ex, q[1], Math.sin(a) * q[0] * ez); } return i0; }
    var prox = null;
    for (i = 0; i + 1 < n; i++) {
      var ini = (prox != null && i > 0 && ang(i) <= 38) ? prox : anel(pts[i]);
      var fim = anel(pts[i + 1]);
      aneis.push([ini, fim, pts[i][0], pts[i + 1][0]]);
      prox = fim;
    }
    aneis.forEach(function (t) {
      var A = t[0], B = t[1], rA = t[2], rB = t[3];
      for (var jj = 0; jj < seg; jj++) {
        var j2 = (jj + 1) % seg;
        if (rA > 1e-9 && rB > 1e-9) f.push(A + jj, B + jj, B + j2, A + jj, B + j2, A + j2);
        else if (rA <= 1e-9) f.push(A + jj, B + jj, B + j2);
        else f.push(A + jj, B + jj, A + j2);
      }
    });
    if (!o.aberto) {   /* tampas: base e topo, se o perfil não termina no eixo */
      [[0, true], [n - 1, false]].forEach(function (pq) {
        var q = pts[pq[0]]; if (q[0] <= 1e-9) return;
        var c = v.length / 3; v.push(0, q[1], 0); var a0 = anel(q);
        for (var jj = 0; jj < seg; jj++) { var j2 = (jj + 1) % seg; if (pq[1]) f.push(c, a0 + jj, a0 + j2); else f.push(c, a0 + j2, a0 + jj); }
      });
    }
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- PRISMA (contorno extrudado para cima) */
  function areaSinal(c) { var s = 0, n = c.length, i; for (i = 0; i < n; i++) { var a = c[i], b = c[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function orelha(c) {   /* triangula polígono simples (anti-horário no plano x,z visto de cima: x→, z→) */
    var idx = [], n = c.length, i, guarda = 0;
    for (i = 0; i < n; i++) idx.push(i);
    var s = areaSinal(c) >= 0 ? 1 : -1, tris = [];
    function dentro(p, a, b, d) {
      var d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
      var d2 = (p[0] - d[0]) * (b[1] - d[1]) - (b[0] - d[0]) * (p[1] - d[1]);
      var d3 = (p[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (p[1] - a[1]);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
    while (idx.length > 3 && guarda++ < 5000) {
      var cortou = false;
      for (i = 0; i < idx.length; i++) {
        var i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length], a = c[i0], b = c[i1], d = c[i2];
        var cruz = ((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) * s;
        if (cruz <= 1e-12) continue;
        var ok = true;
        for (var q = 0; q < idx.length; q++) { var iq = idx[q]; if (iq === i0 || iq === i1 || iq === i2) continue; if (dentro(c[iq], a, b, d)) { ok = false; break; } }
        if (!ok) continue;
        tris.push([i0, i1, i2]); idx.splice(i, 1); cortou = true; break;
      }
      if (!cortou) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }
  /* triângulo com a normal voltada para w = [wx, wy, wz]: se o triângulo sair do avesso, troca dois índices */
  function tri(v, f, i0, i1, i2, w) {
    var a = i0 * 3, b = i1 * 3, c = i2 * 3;
    var ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * w[0] + ny * w[1] + nz * w[2] >= 0) f.push(i0, i1, i2); else f.push(i0, i2, i1);
  }
  /* prisma(mat, x, y, z, contorno [[x,z]…], h, o): base em y */
  P.prisma = function (mat, x, y, z, contorno, h, o) {
    o = o || {};
    var c = arr(contorno).map(function (q) { return [num(q[0], 0), num(q[1], 0)]; });
    if (c.length < 3) return this;
    var v = [], f = [], n = c.length, i, hh = Math.max(1e-4, num(h, 0.1));
    var tris = orelha(c);
    var b0 = v.length / 3; for (i = 0; i < n; i++) v.push(c[i][0], hh, c[i][1]);
    tris.forEach(function (t) { tri(v, f, b0 + t[0], b0 + t[1], b0 + t[2], [0, 1, 0]); });
    var b1 = v.length / 3; for (i = 0; i < n; i++) v.push(c[i][0], 0, c[i][1]);
    tris.forEach(function (t) { tri(v, f, b1 + t[0], b1 + t[1], b1 + t[2], [0, -1, 0]); });
    var sg = areaSinal(c) >= 0 ? 1 : -1;
    for (i = 0; i < n; i++) {   /* faces laterais com vértice próprio: aresta viva; a normal de fora vem do sentido do polígono */
      var a = c[i], b = c[(i + 1) % n], k = v.length / 3, mx = (b[1] - a[1]) * sg, mz = -(b[0] - a[0]) * sg;
      v.push(a[0], 0, a[1], b[0], 0, b[1], b[0], hh, b[1], a[0], hh, a[1]);
      tri(v, f, k, k + 1, k + 2, [mx, 0, mz]); tri(v, f, k, k + 2, k + 3, [mx, 0, mz]);
    }
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- CONTORNOS PRONTOS */
  /* retângulo de cantos arredondados, no plano (x, z), em volta de (0,0): n pontos por canto */
  function contornoRR(larg, prof, raio, n) {
    var hx = larg / 2, hz = prof / 2, r = cl(raio, 0, Math.min(hx, hz) - 1e-5), out = [], c, j;
    n = Math.max(1, n || 4);
    if (r < 1e-4) return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    var cs = [[hx - r, hz - r, 0], [-hx + r, hz - r, 90], [-hx + r, -hz + r, 180], [hx - r, -hz + r, 270]];
    for (c = 0; c < 4; c++) for (j = 0; j <= n; j++) { var a = (cs[c][2] + 90 * j / n) * RAD; out.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return out;
  }
  function contornoElipse(rx, rz, seg) { var out = [], j; seg = Math.max(8, seg || 24); for (j = 0; j < seg; j++) { var a = TAU * j / seg; out.push([Math.cos(a) * rx, Math.sin(a) * rz]); } return out; }

  /* ---------------------------------------------------------- BANDEJA (casca com cavidade) */
  /* bandeja(mat, matDentro, x, y, z, ext, int, h, fundo, o): casca de contorno EXTERNO `ext` e cavidade
     INTERNA `int` (mesma contagem de pontos, ambos convexos), altura h, laje do fundo `fundo`. Dá banheira,
     cuba, vaso, floreira. O aro e as paredes são faixas contínuas; a quina viva (dobra > 38°) duplica o vértice. */
  P.bandeja = function (mat, matDentro, x, y, z, ext, inte, h, fundo, o) {
    o = o || {};
    var E = arr(ext), I = arr(inte), n = E.length;
    if (n < 3 || I.length !== n) return this;
    var hh = Math.max(1e-3, num(h, 0.5)), fd = cl(num(fundo, 0.05), 1e-3, hh - 1e-3);
    var cen = E.reduce(function (a, q) { return [a[0] + q[0] / n, a[1] + q[1] / n]; }, [0, 0]);
    function dobra(A, i0) {
      var a = A[(i0 + n - 1) % n], b = A[i0], c = A[(i0 + 1) % n], u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]], lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lw = Math.sqrt(w[0] * w[0] + w[1] * w[1]);
      if (lu < 1e-9 || lw < 1e-9) return 0;
      return Math.acos(cl((u[0] * w[0] + u[1] * w[1]) / (lu * lw), -1, 1)) / RAD;
    }
    function faixa(A, yA, yB, para) {   /* para = +1: normal para fora do laço; −1: para dentro */
      var v = [], f = [], mapa = {}, i;
      function vert(i0, seg, nivel) {
        var lisa = dobra(A, i0) <= 38, k = (lisa ? "p" + i0 : "p" + i0 + "s" + seg) + "n" + nivel;
        if (mapa[k] == null) { mapa[k] = v.length / 3; v.push(A[i0][0], nivel ? yB : yA, A[i0][1]); }
        return mapa[k];
      }
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n, a0 = vert(i, i, 0), a1 = vert(j, i, 0), b0 = vert(i, i, 1), b1 = vert(j, i, 1);
        var mx = ((A[i][0] + A[j][0]) / 2 - cen[0]) * para, mz = ((A[i][1] + A[j][1]) / 2 - cen[1]) * para;
        tri(v, f, a0, a1, b1, [mx, 0, mz]); tri(v, f, a0, b1, b0, [mx, 0, mz]);
      }
      return { v: v, f: f };
    }
    var volB = Math.abs(areaSinal(E)) * hh - Math.abs(areaSinal(I)) * (hh - fd);
    var L = { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ, aberta: true, volume: volB }, k;
    k = faixa(E, 0, hh, +1); this._add(mat, k.v, k.f, L); L = { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ, aberta: true, volume: 0 };   /* parede de fora (leva o volume) */
    k = faixa(I, fd, hh, -1); this._add(matDentro || mat, k.v, k.f, L);            /* parede de dentro */
    var v = [], f = [], i;                                                          /* aro: entre E e I, em y = hh */
    for (i = 0; i < n; i++) v.push(E[i][0], hh, E[i][1]);
    for (i = 0; i < n; i++) v.push(I[i][0], hh, I[i][1]);
    for (i = 0; i < n; i++) { var j = (i + 1) % n; tri(v, f, i, j, n + j, [0, 1, 0]); tri(v, f, i, n + j, n + i, [0, 1, 0]); }
    this._add(mat, v, f, L);
    function tampa(C, yy, cima, m2, self) {
      var vv = [], ff = [], q, c0 = C.reduce(function (a, p) { return [a[0] + p[0] / n, a[1] + p[1] / n]; }, [0, 0]);
      vv.push(c0[0], yy, c0[1]); for (q = 0; q < n; q++) vv.push(C[q][0], yy, C[q][1]);
      for (q = 0; q < n; q++) tri(vv, ff, 0, 1 + q, 1 + (q + 1) % n, [0, cima ? 1 : -1, 0]);
      self._add(m2, vv, ff, L);
    }
    tampa(I, fd, true, matDentro || mat, this);
    tampa(E, 0, false, mat, this);
    return this;
  };

  /* ---------------------------------------------------------- LÂMINA (folha, pétala, ripa curva) */
  /* lamina(mat, x, y, z, compr, larg, o): lâmina fina e fechada que parte da origem para +Z (a "frente"),
     sobe a o.inclina° e CAI a o.curva° ao longo do comprimento (arco de folha de palmeira). Largura em X.
     o.perfil = larguras relativas ao longo do comprimento (0 a 1) — serrilha/folíolos; o.esp espessura. */
  P.lamina = function (mat, x, y, z, compr, larg, o) {
    o = o || {};
    var nSeg = cl(Math.round(o.seg || 8), 3, 40), esp = Math.max(0.0008, num(o.esp, 0.003)), ang0 = num(o.inclina, 30) * RAD, curva = num(o.curva, 60) * RAD;
    var perfil = o.perfil && o.perfil.length > 1 ? o.perfil : null, i;
    var dl = compr / nSeg, py = 0, pz = 0, eixo = [];
    for (i = 0; i <= nSeg; i++) {
      var a = ang0 - curva * Math.pow(i / nSeg, 1.3);
      eixo.push([py, pz, a]);
      var am = ang0 - curva * Math.pow((i + 0.5) / nSeg, 1.3);
      py += Math.sin(am) * dl; pz += Math.cos(am) * dl;
    }
    function w(t) {
      if (perfil) { var q = t * (perfil.length - 1), k = Math.min(perfil.length - 2, Math.floor(q)), u = q - k; return larg * (perfil[k] * (1 - u) + perfil[k + 1] * u) / 2; }
      return larg / 2 * (0.12 + 0.88 * Math.sin(Math.PI * Math.pow(Math.max(t, 0.0001), 0.7)));
    }
    var v = [], f = [];
    for (i = 0; i <= nSeg; i++) {   /* 4 pontos por seção: topo-esq, topo-dir, base-dir, base-esq */
      var ww = Math.max(0.0006, w(i / nSeg)), E = eixo[i], dy = Math.cos(E[2]) * esp / 2, dz = -Math.sin(E[2]) * esp / 2;
      v.push(-ww, E[0] + dy, E[1] + dz, ww, E[0] + dy, E[1] + dz, ww, E[0] - dy, E[1] - dz, -ww, E[0] - dy, E[1] - dz);
    }
    function quad(a0, b0, c0, d0, w3) { tri(v, f, a0, b0, c0, w3); tri(v, f, a0, c0, d0, w3); }
    for (i = 0; i < nSeg; i++) {
      var A = i * 4, B = (i + 1) * 4;
      quad(A, A + 1, B + 1, B, [0, 1, 0]); quad(A + 3, B + 3, B + 2, A + 2, [0, -1, 0]);
      quad(A + 1, A + 2, B + 2, B + 1, [1, 0, 0]); quad(A, B, B + 3, A + 3, [-1, 0, 0]);
    }
    tri(v, f, 0, 3, 2, [0, 0, -1]); tri(v, f, 0, 2, 1, [0, 0, -1]);
    var U = nSeg * 4; tri(v, f, U, U + 1, U + 2, [0, 0, 1]); tri(v, f, U, U + 2, U + 3, [0, 0, 1]);
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- PIRÂMIDE / CONE FACETADO (folha de grama, pedra) */
  /* pedra(mat, x, y, z, rx, ry, rz, o): seixo/pedra — elipsoide achatado com 7 anéis, sorteado (semente) */
  P.pedra = function (mat, x, y, z, rx, ry, rz, o) {
    o = o || {};
    var rnd = sorteio(o.semente || 7), seg = cl(Math.round(o.seg || 9), 6, 16), an = cl(Math.round(o.aneis || 5), 3, 10), v = [], f = [], i, j;
    v.push(0, ry * (0.9 + rnd() * 0.2), 0);
    for (i = 1; i < an; i++) {
      var th = Math.PI * i / an, sy = Math.cos(th), sr = Math.sin(th);
      for (j = 0; j < seg; j++) { var ph = TAU * j / seg, k = 0.86 + rnd() * 0.28; v.push(Math.cos(ph) * sr * rx * k, sy * ry, Math.sin(ph) * sr * rz * k); }
    }
    var polo = v.length / 3; v.push(0, -ry * 0.8, 0);
    for (j = 0; j < seg; j++) f.push(0, 1 + (j + 1) % seg, 1 + j);
    for (i = 0; i + 1 < an - 1; i++) for (j = 0; j < seg; j++) { var a = 1 + i * seg + j, b = 1 + i * seg + (j + 1) % seg, c = 1 + (i + 1) * seg + j, d = 1 + (i + 1) * seg + (j + 1) % seg; f.push(a, b, d, a, d, c); }
    var ult = 1 + (an - 2) * seg;
    for (j = 0; j < seg; j++) f.push(polo, ult + j, ult + (j + 1) % seg);
    this._add(mat, v, f, { x: x, y: y, z: z, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ }); return this;
  };

  /* ---------------------------------------------------------- SAÍDA */
  /* solidos(prefixo): uma malha por material, no formato forma "malha" do js/familia.js */
  P.solidos = function (prefixo) {
    var self = this;
    return this.ordem.map(function (k, i) {
      var g = self.grupos[k];
      var o = { id: (prefixo || "m") + i, nome: g.material || "peça", forma: "malha", origemForma: "mob", suave: true, x: 0, y: 0, z: 0, rot: 0, v: g.v, f: g.f, volume: r6(g.volume), material: g.material, cor: "" };
      if (g.parte) { o.parte = g.parte; o.nome = (g.material || "peça") + " (" + g.parte + ")"; }
      return o;
    });
  };
  P.triangulos = function () { return this.tri; };

  function cena() { return new Cena(); }

  /* ---------------------------------------------------------- MINIATURA (canvas) */
  /* miniatura(solidos, caixa, tam, corDe): vista isométrica por pintor; `corDe(material)` devolve #hex.
     Só no navegador. Devolve data URL PNG ou "" (sem DOM). Triângulo a triângulo, mas com teto de 6 mil. */
  function miniatura(solidos, tam, corDe) {
    var D = global.document;
    if (!D || !D.createElement) return "";
    var cv; try { cv = D.createElement("canvas"); } catch (e) { return ""; }
    tam = tam || 96; cv.width = tam; cv.height = tam;
    var cx = cv.getContext && cv.getContext("2d"); if (!cx) return "";
    var ca = Math.cos(35 * RAD), sa = Math.sin(35 * RAD), cb = Math.cos(30 * RAD), sb = Math.sin(30 * RAD);   /* giro em Y de 35°, queda de 30° */
    var tris = [], mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    function proj(x, y, z) { var X = x * ca + z * sa, Z = -x * sa + z * ca, Y = y * cb - Z * sb, D2 = y * sb + Z * cb; return [X, -Y, D2]; }
    var tot = 0; solidos.forEach(function (s) { tot += s.f.length / 3; });
    var passo = Math.max(1, Math.ceil(tot / 6000));
    solidos.forEach(function (s) {
      var c = corDe ? corDe(s.material) : "#999999", hx = /^#?([0-9a-f]{6})$/i.exec(c), rgb = hx ? [parseInt(hx[1].substr(0, 2), 16), parseInt(hx[1].substr(2, 2), 16), parseInt(hx[1].substr(4, 2), 16)] : [150, 150, 150];
      var P3 = []; for (var i = 0; i + 2 < s.v.length; i += 3) P3.push(proj(s.v[i], s.v[i + 1], s.v[i + 2]));
      for (var t = 0; t + 2 < s.f.length; t += 3 * passo) {
        var a = P3[s.f[t]], b = P3[s.f[t + 1]], d = P3[s.f[t + 2]];
        var ux = b[0] - a[0], uy = b[1] - a[1], wx = d[0] - a[0], wy = d[1] - a[1];
        var A2 = ux * wy - uy * wx;
        // normal 3D para a luz
        var o0 = s.f[t] * 3, o1 = s.f[t + 1] * 3, o2 = s.f[t + 2] * 3;
        var e1 = [s.v[o1] - s.v[o0], s.v[o1 + 1] - s.v[o0 + 1], s.v[o1 + 2] - s.v[o0 + 2]], e2 = [s.v[o2] - s.v[o0], s.v[o2 + 1] - s.v[o0 + 1], s.v[o2 + 2] - s.v[o0 + 2]];
        var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var luz = cl(0.45 + 0.55 * ((nx * -0.35 + ny * 0.8 + nz * 0.5) / nl), 0.25, 1.05);
        tris.push({ p: [a, b, d], z: (a[2] + b[2] + d[2]) / 3, k: luz, rgb: rgb });
        [a, b, d].forEach(function (q) { if (q[0] < mn[0]) mn[0] = q[0]; if (q[0] > mx[0]) mx[0] = q[0]; if (q[1] < mn[1]) mn[1] = q[1]; if (q[1] > mx[1]) mx[1] = q[1]; });
      }
    });
    if (!tris.length) return "";
    tris.sort(function (p, q) { return q.z - p.z; });   /* o mais longe primeiro */
    var sc = (tam - 10) / Math.max(mx[0] - mn[0], mx[1] - mn[1], 1e-6), ox = (tam - (mx[0] - mn[0]) * sc) / 2 - mn[0] * sc, oy = (tam - (mx[1] - mn[1]) * sc) / 2 - mn[1] * sc;
    cx.clearRect(0, 0, tam, tam);
    tris.forEach(function (t) {
      cx.beginPath(); cx.moveTo(t.p[0][0] * sc + ox, t.p[0][1] * sc + oy); cx.lineTo(t.p[1][0] * sc + ox, t.p[1][1] * sc + oy); cx.lineTo(t.p[2][0] * sc + ox, t.p[2][1] * sc + oy); cx.closePath();
      var col = "rgb(" + Math.round(cl(t.rgb[0] * t.k, 0, 255)) + "," + Math.round(cl(t.rgb[1] * t.k, 0, 255)) + "," + Math.round(cl(t.rgb[2] * t.k, 0, 255)) + ")";
      cx.fillStyle = col; cx.strokeStyle = col; cx.lineWidth = 0.6; cx.fill(); cx.stroke();
    });
    try { return cv.toDataURL("image/png"); } catch (e2) { return ""; }
  }

  var Mob = {
    cena: cena, sorteio: sorteio, contornoRR: contornoRR, contornoElipse: contornoElipse, miniatura: miniatura, num: num, cl: cl,
    malhaCaixaR: malhaCaixaR, malhaCaixa: malhaCaixa, areaSinal: areaSinal, orelha: orelha
  };
  global.Mob = Mob;
  if (typeof module !== "undefined" && module.exports) module.exports = Mob;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

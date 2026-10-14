/* =====================================================================
 * bimcotas.js — COTAR FÁCIL no BIM, em todas as disciplinas (motor PURO,
 * ES5, sem DOM, sem three.js, Node-testável). 13/10/2026.
 *
 * Pedido do Rogério: "para fazer cota tá muito difícil". A cota da vista
 * 2D (js/bimanot.js, P7) era ponto a ponto e só na planta; no 3D só havia
 * a cota do tubo. Este arquivo é a CONTA de tudo o que faltava; a tela é o
 * js/bimcotasui.js.
 *
 * O QUE MORA AQUI
 *   REFERÊNCIA 3D ... o ponto de uma PEÇA que a cota guarda (não o ponto
 *                     solto): ponta, meio, centro, topo, base, canto e furo
 *                     da chapa, ponto da face (em coordenadas da peça,
 *                     NORMALIZADAS: a face acompanha a troca de perfil e de
 *                     espessura), eixo da grade, nível. A peça andou, trocou
 *                     de perfil ou de nível: a cota mede de novo. A peça
 *                     sumiu: a cota fica ÓRFÃ (marcada, não some calada).
 *   COTA 3D ......... op `cota3d` (criar/substituir) e `cota3dAjustar`
 *                     (Propriedades, arrastar a linha, mover o texto): ops do
 *                     editor — Ctrl+Z desfaz, vai no .opbim. Tipos: linear
 *                     (cadeia + direção fixa), alinhada, coordenada
 *                     (ordenada a partir de uma origem), nível (TOS/TOL) e
 *                     inclinação (% e °).
 *   CADEIAS ......... "Cotar seleção": as peças escolhidas viram uma cadeia
 *                     na direção dominante + o total (e a perpendicular
 *                     quando faz sentido) — no 3D e na vista 2D ativa;
 *                     "Cotar a vista": eixos e vãos na planta; níveis e
 *                     alturas no corte; furação de chapa a partir da borda.
 *   ARREDONDAMENTO .. o padrão: mm quando a cota pega peça METÁLICA, cm (m
 *                     com 2 casas) no resto — configurável.
 *   PONTE COM A P7 .. a referência 3D dentro da cota da vista 2D
 *                     ({r:"p3", k, el…}) projetada na planta (x, z) ou no
 *                     corte (ao longo da linha do corte, −y): é assim que a
 *                     cota 2D pega perfil metálico, tubo e furo de chapa.
 * Unidades: metros; ângulos em graus na tela. Convenção do editor (three.js
 * Y para cima; rotY leva o X local a (cos θ, 0, −sen θ)).
 * Teste: node tools/test-bimcotas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function P7() { var a = dep("BimAnotP7", "./bimanot.js"); return a && a.opCota ? a : (a && a.P7 ? a.P7 : null); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function txt(v) { return v == null ? "" : String(v); }

  /* ---------------------------------------------------------- vetores 3D */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function V3(o) {
    if (Array.isArray(o)) return o.length >= 3 && fin(+o[0]) && fin(+o[1]) && fin(+o[2]) ? [+o[0], +o[1], +o[2]] : null;
    return o && fin(+o.x) && fin(+o.y) && fin(+o.z) ? [+o.x, +o.y, +o.z] : null;
  }
  function O3(p) { return { x: r6(p[0]), y: r6(p[1]), z: r6(p[2]) }; }
  /* o giro do editor em volta de +Y: X local → (cos θ, 0, −sen θ) */
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  var UP = [0, 1, 0];

  /* ================================================================ PEÇAS
   * Índice do estado (guardado no próprio estado, fora do JSON: o estado
   * sai novo a cada replay e o índice vai junto). */
  function indice(estado) {
    if (!estado || typeof estado !== "object") return { caixa: {}, familia: {}, eixo: {}, trecho: {}, peca: {}, cobertura: {} };
    var ins0 = estado.instalacoes || {}, assin = [arr(estado.caixas).length, arr(estado.familias).length, arr(estado.eixos).length, arr(estado.coberturas).length, arr(ins0.trechos).length, arr(ins0.pecas).length].join(",");
    if (estado.__cotIdx && estado.__cotIdx.assin === assin) return estado.__cotIdx;
    var I = { caixa: {}, familia: {}, eixo: {}, trecho: {}, peca: {}, cobertura: {}, assin: assin };
    arr(estado.caixas).forEach(function (c) { if (c && c.id != null) I.caixa[String(c.id)] = c; });
    arr(estado.familias).forEach(function (f) { if (f && f.id != null) I.familia[String(f.id)] = f; });
    arr(estado.eixos).forEach(function (e) { if (e && e.id != null) I.eixo[String(e.id)] = e; });
    arr(estado.coberturas).forEach(function (c) { if (c && c.id != null) I.cobertura[String(c.id)] = c; });
    var ins = estado.instalacoes || {};
    arr(ins.trechos).forEach(function (t) { if (t && t.id != null) I.trecho[String(t.id)] = t; });
    arr(ins.pecas).forEach(function (p) { if (p && p.id != null) I.peca[String(p.id)] = p; });
    try { Object.defineProperty(estado, "__cotIdx", { value: I, enumerable: false, configurable: true, writable: true }); } catch (e) {}
    return I;
  }
  function acharPeca(estado, id) {
    if (id == null || id === "") return null;
    var I = indice(estado), k = String(id);
    if (I.caixa[k]) return { k: "caixa", o: I.caixa[k] };
    if (I.familia[k]) return { k: "familia", o: I.familia[k] };
    if (I.eixo[k]) return { k: "eixo", o: I.eixo[k] };
    if (I.trecho[k]) return { k: "trecho", o: I.trecho[k] };
    if (I.peca[k]) return { k: "peca", o: I.peca[k] };
    if (I.cobertura[k]) return { k: "cobertura", o: I.cobertura[k] };
    return null;
  }
  function ehMetal(pc) { return !!(pc && pc.k === "caixa" && pc.o && pc.o.tipo === "metal" && pc.o.metal); }

  /* A GEOMETRIA DE REFERÊNCIA de uma peça, no mundo:
     { a, b (pontas do eixo), m (meio), c (centro), topo, base, vert, linha:bool,
       metal, tipo, cantos:[], furos:[], quadro (o referencial para a face) } */
  function geom(pc) {
    if (!pc || !pc.o) return null;
    var o = pc.o, B = BM(), g;
    if (pc.k === "caixa") {
      if (o.tipo === "metal" && o.metal && B) {
        var m = o.metal;
        if (m.kind === "perfil") { g = geomMembro(B.membro(o), true); if (g) { g.tipo = "metal"; return g; } }
        if (m.kind === "chapa") return geomChapa(o, B);
        var q0 = B.quadro(o); return { c: q0.O, m: q0.O, a: q0.O, b: q0.O, topo: q0.O, base: q0.O, metal: true, tipo: "metal", cantos: [], furos: [] };
      }
      if (o.perfil && B && (o.tipo === "pilar" || o.tipo === "viga")) {
        g = geomMembro(B.membro(o), false); if (g) { g.tipo = o.tipo; g.caixa = o; return g; }
      }
      return geomCaixa(o);
    }
    if (pc.k === "familia") { var pf = [num(o.x, 0), num(o.y, 0), num(o.z, 0)]; return { c: pf, m: pf, a: pf, b: pf, topo: pf, base: pf, tipo: "familia", cantos: [], furos: [] }; }
    if (pc.k === "peca") { var pp = [num(o.x, 0), num(o.y, 0), num(o.z, 0)]; return { c: pp, m: pp, a: pp, b: pp, topo: pp, base: pp, tipo: "peca", cantos: [], furos: [] }; }
    if (pc.k === "trecho") {
      var a = V3(o.p1), b = V3(o.p2); if (!a || !b) return null;
      var mt = mul(add(a, b), 0.5), rr = num(o.diametro, 0) / 2 || num(o.alt, 0) / 2 || 0;
      return { a: a, b: b, m: mt, c: mt, topo: add(mt, [0, rr, 0]), base: add(mt, [0, -rr, 0]), linha: true, vert: Math.abs(b[1] - a[1]) > 0.999 * len(sub(b, a)), tipo: "tubo", cantos: [], furos: [] };
    }
    if (pc.k === "eixo") {
      var ea = [num(o.x0, 0), 0, num(o.z0, 0)], eb = [num(o.x1, 0), 0, num(o.z1, 0)], em = mul(add(ea, eb), 0.5);
      return { a: ea, b: eb, m: em, c: em, topo: em, base: em, linha: true, eixo: true, tipo: "eixo", nome: o.nome, cantos: [], furos: [] };
    }
    if (pc.k === "cobertura") {
      var pl = arr(o.planos)[0] || {}, pcb = [num(pl.cx, 0), num(pl.cy, 0), num(pl.cz, 0)];
      return { c: pcb, m: pcb, a: pcb, b: pcb, topo: pcb, base: pcb, tipo: "cobertura", cantos: [], furos: [] };
    }
    return null;
  }
  function geomMembro(mb, metal) {
    if (!mb || !(mb.L > 0)) return null;
    var a = mb.P0, b = add(mb.P0, mul(mb.X, mb.L)), m = mul(add(a, b), 0.5);
    var alt = mb.s && fin(mb.s.alt) ? mb.s.alt : 0, larg = mb.s && fin(mb.s.larg) ? mb.s.larg : 0;
    var vert = Math.abs(mb.X[1]) > 0.999;
    var up = mb.B[1] >= 0 ? mb.B : mul(mb.B, -1);
    var hi = a[1] >= b[1] ? a : b, lo = a[1] >= b[1] ? b : a;
    /* TOPO DO AÇO: no pilar, a ponta de cima; na barra deitada, o meio levantado meia seção */
    var topo = vert ? hi : add(m, mul(up, alt / 2)), base = vert ? lo : add(m, mul(up, -alt / 2));
    return { a: a, b: b, m: m, c: m, topo: topo, base: base, vert: vert, linha: true, metal: !!metal, cantos: [], furos: [],
             quadro: { O: m, X: mb.X, Y: mb.B, Z: mb.A, hx: mb.L / 2, hy: alt / 2 || 0.05, hz: larg / 2 || 0.05 } };
  }
  function geomChapa(o, B) {
    var q = B.quadro(o), m = o.metal, t = num(m.t, 0);
    var C = arr(m.contorno).map(function (p) { return add(add(add(q.O, mul(q.X, num(p.u, 0))), mul(q.Y, num(p.v, 0))), mul(q.Z, t / 2)); });
    var cen = C.length ? mul(C.reduce(function (s, p) { return add(s, p); }, [0, 0, 0]), 1 / C.length) : q.O;
    var F = arr(m.furos).map(function (f) { return add(add(add(q.O, mul(q.X, num(f.u, 0))), mul(q.Y, num(f.v, 0))), mul(q.Z, t / 2)); });
    var topo = C.reduce(function (s, p) { return !s || p[1] > s[1] ? p : s; }, null) || cen, base = C.reduce(function (s, p) { return !s || p[1] < s[1] ? p : s; }, null) || cen;
    var us = arr(m.contorno).map(function (p) { return num(p.u, 0); }), vs = arr(m.contorno).map(function (p) { return num(p.v, 0); });
    return { c: cen, m: cen, a: C[0] || cen, b: C[1] || cen, topo: topo, base: base, metal: true, tipo: "chapa", chapa: true, cantos: C, furos: F,
             quadro: { O: q.O, X: q.X, Y: q.Y, Z: q.Z, t: t, u0: Math.min.apply(null, us.length ? us : [0]), u1: Math.max.apply(null, us.length ? us : [0]), v0: Math.min.apply(null, vs.length ? vs : [0]), v1: Math.max.apply(null, vs.length ? vs : [0]) },
             furosUV: arr(m.furos).map(function (f) { return { u: num(f.u, 0), v: num(f.v, 0), d: num(f.d, 0) }; }) };
  }
  function geomCaixa(o) {
    var C = [num(o.cx, 0), num(o.cy, 0), num(o.cz, 0)], th = num(o.rotY, 0), u = rotY([1, 0, 0], th), n = rotY([0, 0, 1], th);
    var L = num(o.comprimento, 0), H = num(o.altura, 0), E = num(o.espessura, 0), t = o.tipo || "peca";
    var q = { O: C, X: u, Y: UP, Z: n, hx: L / 2, hy: H / 2, hz: E / 2 };
    var topoY = t === "viga" && o.topoViga != null ? num(o.topoViga, C[1] + H / 2) : C[1] + H / 2;
    if (t === "pilar") {
      var bs = [C[0], C[1] - H / 2, C[2]], tp = [C[0], C[1] + H / 2, C[2]];
      return { a: bs, b: tp, m: C, c: C, topo: tp, base: bs, vert: true, linha: true, tipo: t, cantos: [], furos: [], quadro: q };
    }
    var cantos = [];
    if (Array.isArray(o.contorno) && o.contorno.length >= 3) cantos = o.contorno.map(function (p) { return [num(p.x, 0), topoY, num(p.z, 0)]; });
    var yEixo = t === "parede" ? C[1] - H / 2 : C[1];
    var Ce = [C[0], yEixo, C[2]], a = add(Ce, mul(u, -L / 2)), b = add(Ce, mul(u, L / 2));
    var lin = t === "parede" || t === "viga" || (t !== "laje" && L > 3 * Math.max(E, H));
    return { a: a, b: b, m: Ce, c: C, topo: [C[0], topoY, C[2]], base: [C[0], C[1] - H / 2, C[2]], vert: false, linha: lin, tipo: t, cantos: cantos, furos: [], quadro: q };
  }

  /* ================================================================ NÍVEIS */
  function niveisDe(opc) {
    var L = opc && Array.isArray(opc.niveis) ? opc.niveis : null;
    if (!L) { var E = BE(); try { L = E && E.niveisAtuais ? E.niveisAtuais() : null; } catch (e) { L = null; } }
    return arr(L).map(function (n) { return { id: String(n.id), nome: txt(n.nome), y: fin(+n.elevacao) ? +n.elevacao : num(n.y, 0) }; })
      .sort(function (a, b) { return a.y - b.y; });
  }

  /* ============================================================ REFERÊNCIA
   * ref = { el, r, i?, u?, v?, w?, s?, nivel?, x, y, z } — x/y/z é o ponto do
   * clique (vale se a peça sumir: a cota órfã continua desenhada onde estava).
   * r: fim0 | fim1 | meio | centro | topo | base | canto (i) | furo (i) |
   *    loc (u, v, w ∈ [−1, 1] no referencial da peça) | eixo (s ao longo do
   *    eixo da grade, na cota y) | nivel (o nível `nivel`, em x/z) | p (solto) */
  var REFS = { fim0: 1, fim1: 1, meio: 1, centro: 1, topo: 1, base: 1, canto: 1, furo: 1, loc: 1, eixo: 1, cruz: 1, nivel: 1, p: 1 };
  var ROT_REF = { fim0: "ponta", fim1: "ponta", meio: "meio", centro: "centro", topo: "topo", base: "base", canto: "canto", furo: "centro do furo", loc: "face", eixo: "eixo", cruz: "cruzamento de eixos", nivel: "nível", p: "ponto" };
  function fallback(ref) { return V3(ref); }
  function resolver(estado, ref, opc) {
    if (!ref || typeof ref !== "object") return { ok: false };
    var fb = fallback(ref), r = ref.r || (ref.el != null ? "centro" : "p");
    if (r === "p" || ref.el == null || ref.el === "") {
      if (r === "nivel") {
        var ns = niveisDe(opc), nv = ns.filter(function (n) { return n.id === String(ref.nivel); })[0];
        if (!nv) return fb ? { ok: false, orfa: true, p: fb } : { ok: false };
        return { ok: true, p: [num(ref.x, 0), nv.y, num(ref.z, 0)], nivel: nv };
      }
      return fb ? { ok: true, p: fb, solto: true } : { ok: false };
    }
    var pc = acharPeca(estado, ref.el);
    if (!pc) return { ok: false, orfa: true, p: fb };
    var g = geom(pc); if (!g) return { ok: false, orfa: true, p: fb };
    var p = null, d = null;
    if (r === "cruz") {
      /* o CRUZAMENTO de dois eixos da grade (acompanha os dois) */
      var pc2 = acharPeca(estado, ref.el2), X = pc.k === "eixo" && pc2 && pc2.k === "eixo" ? cruzaReta(pc.o, pc2.o) : null;
      if (!X) return { ok: false, orfa: true, p: fb };
      return { ok: true, p: [X[0], fb ? fb[1] : 0, X[1]] };
    }
    if (r === "loc" && ref.hx1) {
      /* a chapa guarda u/v ABSOLUTOS no plano (furo e borda não mudam com a espessura) */
      var qc = g.quadro; if (!qc || !g.chapa) return { ok: false, orfa: true, p: fb };
      return { ok: true, p: add(add(add(qc.O, mul(qc.X, num(ref.u, 0))), mul(qc.Y, num(ref.v, 0))), mul(qc.Z, qc.t / 2 + num(ref.w, 0) * qc.t / 2)), metal: true, tipo: "chapa" };
    }
    if (pc.k === "eixo") {
      var dd = unit(sub(g.b, g.a)); if (!dd) return { ok: false, orfa: true, p: fb };
      var y = fb ? fb[1] : 0, s = fin(+ref.s) ? +ref.s : (fb ? dot(sub([fb[0], 0, fb[2]], g.a), dd) : 0);
      p = add(add(g.a, mul(dd, s)), [0, y, 0]); d = dd;
      return { ok: true, p: p, d: d, eixo: true, nome: g.nome };
    }
    switch (r) {
      case "fim0": p = g.a; break;
      case "fim1": p = g.b; break;
      case "meio": p = g.m; break;
      case "centro": p = g.c; break;
      case "topo": p = g.topo; break;
      case "base": p = g.base; break;
      case "canto": p = g.cantos[Math.round(num(ref.i, 0))] || null; break;
      case "furo": p = g.furos[Math.round(num(ref.i, 0))] || null; break;
      case "loc":
        var q = g.quadro; if (!q) { p = g.c; break; }
        p = add(add(add(q.O, mul(q.X, num(ref.u, 0) * (q.hx != null ? q.hx : 1))), mul(q.Y, num(ref.v, 0) * (q.hy != null ? q.hy : 1))), mul(q.Z, num(ref.w, 0) * (q.hz != null ? q.hz : 1)));
        break;
      default: p = g.c;
    }
    if (!p) return { ok: false, orfa: true, p: fb };
    if (g.linha && (r === "fim0" || r === "fim1" || r === "meio")) d = unit(sub(g.b, g.a));
    return { ok: true, p: p.slice(), d: d, metal: !!g.metal, tipo: g.tipo };
  }
  /* o ponto clicado numa FACE de uma peça → a referência normalizada (acompanha
     a troca de perfil, espessura, altura; mover e girar) */
  function refDaFace(estado, id, P) {
    var pc = acharPeca(estado, id), g = pc ? geom(pc) : null, q = g && g.quadro; P = V3(P);
    if (!q || !P) return P ? { r: "p", x: r6(P[0]), y: r6(P[1]), z: r6(P[2]) } : null;
    var d = sub(P, q.O);
    if (g.chapa) {
      /* a chapa: u e v ABSOLUTOS no plano (o furo e a borda não mudam com a espessura), w pela espessura */
      return { el: id, r: "loc", u: r6(dot(d, q.X)), v: r6(dot(d, q.Y)), w: r6(q.t > 0 ? (dot(d, q.Z) - q.t / 2) / (q.t / 2) : 0), x: r6(P[0]), y: r6(P[1]), z: r6(P[2]), hx1: 1 };
    }
    return { el: id, r: "loc", u: r6(q.hx > 1e-9 ? dot(d, q.X) / q.hx : 0), v: r6(q.hy > 1e-9 ? dot(d, q.Y) / q.hy : 0), w: r6(q.hz > 1e-9 ? dot(d, q.Z) / q.hz : 0), x: r6(P[0]), y: r6(P[1]), z: r6(P[2]) };
  }
  function refPeca(estado, id, r, i) {
    var pc = acharPeca(estado, id); if (!pc) return null;
    var o = { el: id, r: r }; if (i != null) o.i = i;
    var x = resolver(estado, o); if (!x.ok) return null;
    o.x = r6(x.p[0]); o.y = r6(x.p[1]); o.z = r6(x.p[2]);
    return o;
  }

  /* PONTOS NOTÁVEIS de todo o modelo do editor (o encaixe da ferramenta de cota no 3D):
     { pontos:[{p, tipo:'fim'|'meio'|'centro'|'intersecao', id, ref}], linhas:[{a, b, id, k}] } */
  function candidatos(estado, opc) {
    opc = opc || {};
    var pts = [], linhas = [], y0 = num(opc.y, 0), I = indice(estado), modo = opc.modo || "auto";
    function pt(p, tipo, ref, rot) { pts.push({ p: p, tipo: tipo, id: ref.el, ref: ref, rotulo: rot }); }
    function R(id, r, i) { var o = { el: id, r: r }; if (i != null) o.i = i; return o; }
    Object.keys(I.caixa).concat(Object.keys(I.trecho), Object.keys(I.familia), Object.keys(I.peca)).forEach(function (id) {
      var pc = acharPeca(estado, id), g = geom(pc); if (!g) return;
      var nome = g.tipo || "peça";
      if (g.chapa) {
        if (modo !== "face") {
          g.furos.forEach(function (p, i) { pt(p, "centro", R(id, "furo", i), "centro do furo " + (i + 1)); });
          pt(g.c, "centro", R(id, "centro"), "centro da chapa");
        }
        g.cantos.forEach(function (p, i) { pt(p, "fim", R(id, "canto", i), "canto da chapa"); });
        return;
      }
      if (g.linha) {
        /* a peça EM PÉ (pilar): as pontas são a base e o topo — a referência leva esse nome (o TOS vem daqui) */
        if (g.vert) { pt(g.base, "fim", R(id, "base"), "base do " + nome); pt(g.topo, "fim", R(id, "topo"), "topo do " + nome); }
        else { pt(g.a, "fim", R(id, "fim0"), "ponta do " + nome); pt(g.b, "fim", R(id, "fim1"), "ponta do " + nome); }
        if (modo !== "face") pt(g.m, "meio", R(id, "meio"), "meio do " + nome);
        linhas.push({ a: g.a, b: g.b, id: id, k: "barra" });
        if (!g.vert && (g.metal || pc.o.tipo === "viga" || g.tipo === "tubo")) { if (modo !== "face") pt(g.topo, "fim", R(id, "topo"), "topo do " + nome); }
      } else {
        if (modo !== "face") pt(g.c, "centro", R(id, "centro"), "centro do " + nome);
        pt(g.topo, "fim", R(id, "topo"), "topo do " + nome);
      }
      g.cantos.forEach(function (p, i) { pt(p, "fim", R(id, "canto", i), "canto"); });
    });
    var ex = arr(estado && estado.eixos);
    if (modo !== "face") ex.forEach(function (e) {
      var a = [num(e.x0, 0), y0, num(e.z0, 0)], b = [num(e.x1, 0), y0, num(e.z1, 0)];
      linhas.push({ a: a, b: b, id: e.id, k: "eixo", nome: e.nome });
    });
    for (var i = 0; i < ex.length; i++) for (var j = i + 1; j < ex.length; j++) {
      var X = cruza2(ex[i], ex[j]); if (!X || modo === "face") continue;
      pts.push({ p: [X[0], y0, X[1]], tipo: "intersecao", id: ex[i].id, ref: { el: ex[i].id, r: "cruz", el2: ex[j].id, x: X[0], y: y0, z: X[1] }, rotulo: "eixos " + txt(ex[i].nome) + "×" + txt(ex[j].nome) });
    }
    return { pontos: pts, linhas: linhas };
  }
  function cruza2(e1, e2) {
    var ax = num(e1.x0, 0), az = num(e1.z0, 0), bx = num(e1.x1, 0), bz = num(e1.z1, 0), cx = num(e2.x0, 0), cz = num(e2.z0, 0), dx = num(e2.x1, 0), dz = num(e2.z1, 0);
    var d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-10) return null;
    var rx = cx - ax, rz = cz - az, t = (rx * d2z - rz * d2x) / den, u = (rx * d1z - rz * d1x) / den, e = 1e-9;
    if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
    return [r6(ax + d1x * t), r6(az + d1z * t)];
  }
  /* cruzamento das RETAS de dois eixos (sem limite de comprimento) → [x, z] | null */
  function cruzaReta(e1, e2) {
    var ax = num(e1.x0, 0), az = num(e1.z0, 0), d1x = num(e1.x1, 0) - ax, d1z = num(e1.z1, 0) - az, cx = num(e2.x0, 0), cz = num(e2.z0, 0), d2x = num(e2.x1, 0) - cx, d2z = num(e2.z1, 0) - cz;
    var den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-10) return null;
    var t = ((cx - ax) * d2z - (cz - az) * d2x) / den; return [r6(ax + d1x * t), r6(az + d1z * t)];
  }
  /* ⚠ A PRIORIDADE do encaixe (a mesma do desenho de precisão): ponto notável
     (ponta, interseção, meio, centro) vence "na linha"; dentro da classe, o mais
     perto do cursor NA TELA. proj(p) → {x, y, atras}; cursor {x, y} em px. */
  var CLASSE = { fim: 0, intersecao: 0, meio: 0, centro: 0, proximo: 3 };
  var ORDEM = { fim: 0, intersecao: 1, centro: 2, meio: 3, proximo: 7 };
  function snap(cursor, geo, proj, o) {
    o = o || {};
    if (!cursor || !geo || typeof proj !== "function") return null;
    var tol = num(o.tol, 14), cands = [];
    function tenta(p, tipo, ref, rot) {
      var s = proj(p); if (!s || s.atras || !fin(s.x) || !fin(s.y)) return;
      var d = Math.sqrt((s.x - cursor.x) * (s.x - cursor.x) + (s.y - cursor.y) * (s.y - cursor.y)); if (d > tol) return;
      cands.push({ p: [r6(p[0]), r6(p[1]), r6(p[2])], tipo: tipo, d: d, ref: ref, rotulo: rot });
    }
    arr(geo.pontos).forEach(function (q) { tenta(q.p, q.tipo, q.ref, q.rotulo); });
    arr(geo.linhas).forEach(function (l) {
      var sa = proj(l.a), sb = proj(l.b); if (!sa || !sb || sa.atras || sb.atras) return;
      var dx = sb.x - sa.x, dy = sb.y - sa.y, L2 = dx * dx + dy * dy; if (L2 < 1e-9) return;
      var t = Math.max(0, Math.min(1, ((cursor.x - sa.x) * dx + (cursor.y - sa.y) * dy) / L2)), p = add(l.a, mul(sub(l.b, l.a), t));
      /* na barra: a referência sai da FACE (o js/bimcotasui.js chama refDaFace com o ponto) */
      var ref = l.k === "eixo" ? { el: l.id, r: "eixo", s: r6(t * len(sub(l.b, l.a))), y: r6(p[1]) } : { el: l.id, r: "loc", face: true };
      tenta(p, "proximo", ref, l.k === "eixo" ? "eixo " + txt(l.nome) : "na barra");
    });
    if (!cands.length) return null;
    var mc = Infinity; cands.forEach(function (c) { if (CLASSE[c.tipo] < mc) mc = CLASSE[c.tipo]; });
    var cl = cands.filter(function (c) { return CLASSE[c.tipo] === mc; }), dm = Infinity;
    cl.forEach(function (c) { if (c.d < dm) dm = c.d; });
    var el = cl.filter(function (c) { return c.d <= dm + 0.3 * tol + 1e-9; });
    el.sort(function (a, b) { return (ORDEM[a.tipo] - ORDEM[b.tipo]) || (a.d - b.d); });
    return el[0];
  }

  /* ========================================================== ARREDONDAMENTO
   * O padrão: mm na METÁLICA (inteiro, sem casas), cm na arquitetura (o valor
   * em metros com 2 casas = arredondado ao centímetro). `cfg.padrao`: 'auto' |
   * 'mm' | 'cm'. */
  var PADROES = {
    mm: { id: "mm", unidade: "mm", casas: 0, rotulo: "Milímetro (metálica)", nivelCasas: 3 },
    cm: { id: "cm", unidade: "m", casas: 2, rotulo: "Centímetro (arquitetura: metros com 2 casas)", nivelCasas: 2 }
  };
  function padraoDe(estado, refs, cfg) {
    var p = cfg && cfg.padrao; if (p === "mm" || p === "cm") return p;
    var metal = arr(refs).some(function (r) { var pc = r && r.el != null ? acharPeca(estado, r.el) : null; return ehMetal(pc) || !!(pc && pc.k === "caixa" && pc.o.perfil && pc.o.perfil.forma && /^(I|U|L|T|tubo|frio|C)/.test(pc.o.perfil.forma) && pc.o.material === "aco"); });
    return metal ? "mm" : "cm";
  }
  function fmtNum(v, casas) {
    var c = Math.max(0, Math.min(4, Math.round(num(casas, 2))));
    var s = (Math.round(Math.abs(v) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), p = s.split(".");
    return (v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -c) ? "−" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  /* comprimento (m) no formato {unidade, casas}: mm sem separador de milhar (padrão de fábrica) */
  function fmtComp(m, f) {
    f = f || PADROES.cm;
    if (f.unidade === "mm") { var c = Math.max(0, Math.min(2, Math.round(num(f.casas, 0)))), v = m * 1000; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
    if (f.unidade === "cm") return fmtNum(m * 100, num(f.casas, 0));
    return fmtNum(m, num(f.casas, 2));
  }
  function fmtNivel(y, casas) { var c = Math.max(0, Math.min(3, Math.round(num(casas, 2)))), z = Math.abs(y) < 0.5 * Math.pow(10, -c) ? 0 : y; return (z > 0 ? "+" : z < 0 ? "−" : "±") + fmtNum(Math.abs(z), c); }
  function formatoDe(estado, it, cfg) {
    var pad = PADROES[it.padrao] || PADROES[padraoDe(estado, it.refs, cfg)] || PADROES.cm;
    return { unidade: it.unidade || pad.unidade, casas: it.casas != null && fin(+it.casas) ? +it.casas : (it.unidade && it.unidade !== pad.unidade ? (it.unidade === "mm" ? 0 : it.unidade === "cm" ? 0 : 2) : pad.casas), nivelCasas: it.casas != null && fin(+it.casas) ? +it.casas : pad.nivelCasas, padrao: pad.id };
  }
  /* o texto da cota: texto substituto ("<>" = o valor medido), prefixo e sufixo */
  function textoValor(it, valorTxt) {
    var base = it.txt != null && String(it.txt) !== "" ? String(it.txt).replace(/<>/g, valorTxt) : valorTxt;
    return txt(it.pre) + base + txt(it.suf);
  }
  /* prefixo do nível pelo tipo da peça: TOS (aço), TOL (laje e piso) */
  function prefixoNivel(estado, ref) {
    var pc = ref && ref.el != null ? acharPeca(estado, ref.el) : null; if (!pc) return "";
    if (ehMetal(pc)) return "TOS";
    if (pc.k === "caixa" && pc.o.tipo === "laje") return "TOL";
    if (pc.k === "caixa" && pc.o.perfil && pc.o.material === "aco") return "TOS";
    return "";
  }

  /* ============================================================ MEDIR (3D)
   * it = { k, refs, dir?:{x,y,z}, lado?:{x,y,z}, off, y? } →
   * { ok, orfa, valor, total, segs:[{valor, texto, meio}], linhas:[[a,b]…],
   *   marcas:[[a,b]…], rotulos:[{p, texto, i}], fmt } */
  var TIPOS3 = { linear: 1, alinhada: 1, coordenada: 1, nivel: 1, inclinacao: 1 };
  function ladoPadrao(d) { var l = unit(cross(d, UP)); return l || [1, 0, 0]; }
  function medir(estado, it, opc) {
    opc = opc || {};
    if (!it || !TIPOS3[it.k]) return { ok: false };
    var R = arr(it.refs).map(function (r) { return resolver(estado, r, opc); });
    var orfa = R.some(function (x) { return !x.ok && x.orfa; });
    var P = R.map(function (x, i) { return x.p || fallback(it.refs[i]); });
    if (!P.length || P.some(function (p) { return !p; })) return { ok: false, orfa: orfa };
    var f = formatoDe(estado, it, opc.cfg), out = { ok: true, orfa: orfa, segs: [], linhas: [], marcas: [], rotulos: [], fmt: f, pts: P };
    function tk(L) { return Math.max(0.01, Math.min(0.25, L * 0.025)); }
    function tm(i) { var m = it.tmov && it.tmov[String(i)]; return m && fin(+m.x) && fin(+m.y) && fin(+m.z) ? [+m.x, +m.y, +m.z] : [0, 0, 0]; }
    var k = it.k;
    if (k === "linear" || k === "alinhada" || k === "coordenada") {
      if (P.length < 2) return { ok: false, orfa: orfa };
      var d = it.dir ? unit(V3(it.dir) || [1, 0, 0]) : null;
      if (!d || k === "alinhada") d = unit(sub(P[P.length - 1], P[0])) || [1, 0, 0];
      if (dot(sub(P[P.length - 1], P[0]), d) < 0 && k !== "coordenada") d = mul(d, -1);
      var L = it.lado ? unit(V3(it.lado) || ladoPadrao(d)) : ladoPadrao(d);
      /* o lado tem de ser perpendicular à direção */
      L = unit(sub(L, mul(d, dot(L, d)))) || ladoPadrao(d);
      var W = unit(cross(d, L)) || UP, off = num(it.off, 0.6);
      var P0 = P[0], w0 = dot(P0, W), l0 = dot(P0, L);
      if (fin(+it.y) && Math.abs(W[1]) > 0.9) w0 = +it.y * (W[1] > 0 ? 1 : -1);
      var ts = P.map(function (p) { return dot(p, d); });
      function noPlano(p) { return add(add(mul(d, dot(p, d)), mul(L, dot(p, L))), mul(W, w0)); }
      var Q = ts.map(function (t) { return add(add(mul(d, t), mul(L, l0 + off)), mul(W, w0)); });
      var tot = Math.abs(ts[ts.length - 1] - ts[0]), tkk = tk(Math.max(tot, 0.2));
      P.forEach(function (p, i) { var pp = noPlano(p), dirE = unit(sub(Q[i], pp)) || L; out.linhas.push([add(pp, mul(dirE, Math.min(0.05, len(sub(Q[i], pp)) * 0.3))), add(Q[i], mul(dirE, tkk * 0.8))]); });
      if (k === "coordenada") {
        out.valor = 0;
        Q.forEach(function (q, i) {
          var v = Math.abs(ts[i] - ts[0]); out.segs.push({ valor: r6(v) });
          var tx = textoValor(it, fmtComp(v, f)), pr = add(add(q, mul(L, tkk * 2.2)), tm(i));
          out.rotulos.push({ p: pr, texto: tx, i: i });
          out.marcas.push([sub(q, mul(d, tkk)), add(q, mul(d, tkk))]);
          if (v > out.valor) out.valor = r6(v);
        });
        out.total = out.valor;
        return out;
      }
      out.linhas.push([sub(Q[0], mul(d, tkk * 0.8)), add(Q[Q.length - 1], mul(d, tkk * 0.8))]);
      var o45 = unit(add(d, L)) || d;
      Q.forEach(function (q) { out.marcas.push([sub(q, mul(o45, tkk * 0.7)), add(q, mul(o45, tkk * 0.7))]); });
      for (var i = 0; i + 1 < Q.length; i++) {
        var v = Math.abs(ts[i + 1] - ts[i]), meio = mul(add(Q[i], Q[i + 1]), 0.5);
        out.segs.push({ valor: r6(v), meio: meio });
        out.rotulos.push({ p: add(add(meio, mul(L, tkk * 1.6)), tm(i)), texto: textoValor(it, fmtComp(v, f)), i: i });
      }
      out.total = r6(tot); out.valor = out.segs.length === 1 ? out.segs[0].valor : out.total;
      out.geo = { d: d, L: L, W: W, Q: Q, w0: w0 };
      return out;
    }
    if (k === "nivel") {
      var p = P[0], pre = it.pre != null ? txt(it.pre) : prefixoNivel(estado, it.refs[0]);
      var tn = (pre ? pre + " " : "") + (it.txt != null && String(it.txt) !== "" ? String(it.txt).replace(/<>/g, fmtNivel(p[1], f.nivelCasas)) : fmtNivel(p[1], f.nivelCasas)) + txt(it.suf);
      var lp = add(add(p, [num(it.off, 0.6) * 0.5, num(it.off, 0.6), 0]), tm(0));
      out.linhas.push([p, lp]);
      var tr = 0.08; out.marcas.push([p, add(p, [-tr, tr * 1.5, 0])], [p, add(p, [tr, tr * 1.5, 0])], [add(p, [-tr, tr * 1.5, 0]), add(p, [tr, tr * 1.5, 0])]);
      out.rotulos.push({ p: lp, texto: tn, i: 0 });
      out.valor = r6(p[1]); out.total = out.valor; out.segs.push({ valor: out.valor }); out.prefixo = pre;
      return out;
    }
    if (k === "inclinacao") {
      if (P.length < 2) return { ok: false, orfa: orfa };
      var a = P[0], b = P[1], dv = sub(b, a), h = Math.sqrt(dv[0] * dv[0] + dv[2] * dv[2]);
      if (!(h > 1e-6)) { out.valor = Infinity; out.pct = null; out.graus = 90; }
      else { out.pct = r6(Math.abs(dv[1]) / h * 100); out.graus = r6(Math.atan2(Math.abs(dv[1]), h) * 180 / Math.PI); out.valor = out.pct; }
      out.total = out.valor; out.segs.push({ valor: out.valor });
      var m2 = mul(add(a, b), 0.5);
      out.linhas.push([a, b]);
      var desce = dv[1] <= 0 ? unit(dv) || [1, 0, 0] : unit(mul(dv, -1)) || [1, 0, 0], ponta = dv[1] <= 0 ? b : a;
      out.marcas.push([ponta, sub(ponta, mul(desce, 0.15))]);
      var vtx = out.pct == null ? "vertical" : fmtNum(out.pct, 1) + "%" + (it.graus === false ? "" : " (" + fmtNum(out.graus, 1) + "°)");
      out.rotulos.push({ p: add(add(m2, [0, 0.18, 0]), tm(0)), texto: textoValor(it, vtx), i: 0 });
      return out;
    }
    return { ok: false };
  }

  /* ============================================================== OPS 3D */
  var OPS = { cota3d: 1, cota3dAjustar: 1 };
  var AJUSTAVEIS = { off: 1, unidade: 1, casas: 1, txt: 1, pre: 1, suf: 1, tmov: 1, dir: 1, lado: 1, refs: 1, padrao: 1, graus: 1, tam: 1, y: 1 };
  function refOk(r) { return !!r && typeof r === "object" && !Array.isArray(r) && (r.el != null || r.r === "nivel" || !!V3(r)) && (r.r == null || !!REFS[r.r]); }
  function v3ObjOk(v) { return v == null || (!!v && typeof v === "object" && !Array.isArray(v) && fin(+v.x) && fin(+v.y) && fin(+v.z)); }
  function itemValido(o) {
    if (!o || o.id == null || !TIPOS3[o.k] || !Array.isArray(o.refs) || o.refs.length > 200 || !o.refs.every(refOk)) return false;
    var min = o.k === "nivel" ? 1 : 2; if (o.refs.length < min) return false;
    if (o.off != null && !fin(+o.off)) return false;
    if (!v3ObjOk(o.dir) || !v3ObjOk(o.lado)) return false;
    if (o.unidade != null && ["m", "cm", "mm"].indexOf(o.unidade) < 0) return false;
    if (o.casas != null && !(fin(+o.casas) && +o.casas >= 0 && +o.casas <= 4)) return false;
    if (o.tmov != null && (typeof o.tmov !== "object" || Array.isArray(o.tmov))) return false;
    return true;
  }
  function limpar(o) {
    var it = clone(o); delete it.op;
    if (it.txt != null) it.txt = String(it.txt).slice(0, 120);
    if (it.pre != null) it.pre = String(it.pre).slice(0, 20);
    if (it.suf != null) it.suf = String(it.suf).slice(0, 20);
    return it;
  }
  function valida(o) {
    if (!o || !OPS[o.op]) return undefined;
    if (o.op === "cota3d") return itemValido(o);
    return o.id != null && !!o.campos && typeof o.campos === "object" && !Array.isArray(o.campos) && Object.keys(o.campos).length > 0 &&
      Object.keys(o.campos).every(function (k) { return AJUSTAVEIS[k]; });
  }
  function ctxC(ctx) { if (!ctx.ext.cot3) ctx.ext.cot3 = { itens: {}, ordem: [] }; return ctx.ext.cot3; }
  function aplicarOp(o, ctx) {
    if (!o || !o.op) return false;
    var A = ctx.ext.cot3;
    if (o.op === "cota3d") {
      if (!itemValido(o)) return false;
      A = ctxC(ctx); A.itens[o.id] = limpar(o); if (A.ordem.indexOf(o.id) < 0) A.ordem.push(o.id);
      return true;
    }
    if (o.op === "cota3dAjustar") {
      if (!A || !A.itens[o.id] || valida(o) !== true) return false;
      var novo = clone(A.itens[o.id]);
      Object.keys(o.campos).forEach(function (k) { if (o.campos[k] === null) delete novo[k]; else novo[k] = clone(o.campos[k]); });
      novo.id = o.id; if (!itemValido(novo)) return false;
      A.itens[o.id] = limpar(novo); return true;
    }
    if (o.op === "apagar" && A && A.itens[o.id]) { delete A.itens[o.id]; A.ordem.splice(A.ordem.indexOf(o.id), 1); return true; }
    return false;
  }
  function fim(ctx, out) {
    var A = ctx.ext.cot3; if (!A) return;
    var itens = A.ordem.map(function (id) { return A.itens[id]; }), orfas = [];
    itens.forEach(function (it) {
      var m = medir(out, it, {});
      it.calc = m.ok ? { valor: m.valor, total: m.total, segs: m.segs.map(function (s) { return s.valor; }), orfa: !!m.orfa } : { erro: true, orfa: !!m.orfa };
      if (it.calc.orfa) orfas.push(it.id);
    });
    out.cotas3d = itens; out.cotas3dOrfas = orfas;
  }
  var EXT = { nome: "cotas3d", aplicar: aplicarOp, fim: fim, valida: valida };
  function registrar(E) { if (!E || typeof E.estender !== "function") return false; E.estender(EXT); return true; }

  /* construtor da op (puro) */
  function opCota3d(o) {
    var it = { op: "cota3d", id: o.id, k: o.k || "linear", refs: clone(arr(o.refs)), off: r4(num(o.off, 0.6)) };
    ["dir", "lado"].forEach(function (k) { var v = V3(o[k]); if (v) it[k] = O3(unit(v) || v); });
    ["unidade", "txt", "pre", "suf", "padrao", "auto"].forEach(function (k) { if (o[k] != null && o[k] !== "") it[k] = o[k]; });
    if (fin(+o.casas)) it.casas = +o.casas;
    if (fin(+o.y)) it.y = r6(+o.y);
    if (o.graus != null) it.graus = !!o.graus;
    return itemValido(it) ? { ok: true, op: it } : { ok: false, motivo: "Cota incompleta: faltam referências." };
  }

  /* ===================================================== CADEIAS (seleção)
   * A ESTAÇÃO de uma peça: onde ela entra na cadeia — { q:[a,b] (no plano da
   * cadeia), d:[da,db]|null (a direção da linha, quando a peça é linha: eixo,
   * parede, viga), ref, id, ext:[[a,b],[a,b]] (as pontas, para a cadeia passar
   * fora da peça) }. plano(p3) → [a, b]. */
  function estacao(estado, id, plano) {
    var pc = acharPeca(estado, id), g = pc ? geom(pc) : null; if (!g) return null;
    plano = plano || function (p) { return [p[0], p[2]]; };
    var ref, linha = null;
    if (pc.k === "eixo") {
      var dd = unit(sub(g.b, g.a)) || [1, 0, 0];
      ref = { el: id, r: "eixo", s: 0, x: r6(g.a[0]), y: 0, z: r6(g.a[2]) };
      linha = [g.a, g.b];
    } else if (g.chapa || !g.linha || g.vert) {
      ref = { el: id, r: g.chapa || !g.linha ? "centro" : "meio" };
    } else {
      ref = { el: id, r: "meio" }; linha = [g.a, g.b];
    }
    var x = resolver(estado, ref); if (!x.ok) return null;
    if (ref.x == null) { ref.x = r6(x.p[0]); ref.y = r6(x.p[1]); ref.z = r6(x.p[2]); }
    var q = plano(x.p), d = null, ext = [q, q];
    if (linha) { var la = plano(linha[0]), lb = plano(linha[1]), dl = [lb[0] - la[0], lb[1] - la[1]], L = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]); if (L > 1e-6) { d = [dl[0] / L, dl[1] / L]; ext = [la, lb]; } }
    return { id: id, ref: ref, q: q, d: d, ext: ext, p3: x.p, g: g, metal: !!g.metal, eixo: pc.k === "eixo" };
  }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function perp2(a) { return [-a[1], a[0]]; }
  /* as cadeias de um conjunto de estações (puro, no plano) → [{ m (direção de
     medida), est:[…] em ordem, ts, valores, total, vLinha (onde passa a linha) }] */
  function cadeias(ests, opc) {
    opc = opc || {};
    var gap = num(opc.afast, 1.0), tolEq = 0.0005, out = [];
    ests = arr(ests).filter(Boolean);
    if (ests.length < 2) return out;
    /* direções das linhas: agrupa as paralelas */
    var grupos = [];
    ests.forEach(function (e) {
      if (!e.d) return;
      var u = e.d[0] < -1e-9 || (Math.abs(e.d[0]) < 1e-9 && e.d[1] < 0) ? [-e.d[0], -e.d[1]] : e.d;
      var g = grupos.filter(function (x) { return Math.abs(x.u[0] * u[1] - x.u[1] * u[0]) < 0.02; })[0];
      if (!g) { g = { u: u, n: 0 }; grupos.push(g); } g.n++;
    });
    grupos.sort(function (a, b) { return b.n - a.n; });
    var dirs = [];
    /* a direção de medida sempre no sentido positivo (x, depois z): a linha de cota fica do lado
       do início das linhas (onde nascem as bolinhas dos eixos) */
    function pos(m) { return m[0] < -1e-9 || (Math.abs(m[0]) < 1e-9 && m[1] < 0) ? [-m[0], -m[1]] : m; }
    if (grupos.length && grupos[0].n >= 2) {
      /* linhas paralelas (eixos, paredes): mede perpendicular a elas */
      dirs.push(perp2(grupos[0].u));
      if (grupos[1] && grupos[1].n >= 2) dirs.push(perp2(grupos[1].u));
      else dirs.push(grupos[0].u);
    } else {
      var xs = ests.map(function (e) { return e.q[0]; }), zs = ests.map(function (e) { return e.q[1]; });
      var sx = Math.max.apply(null, xs) - Math.min.apply(null, xs), sz = Math.max.apply(null, zs) - Math.min.apply(null, zs);
      dirs = sx >= sz ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]];
    }
    dirs.map(pos).forEach(function (m, k) {
      var t2 = perp2(m);
      /* entra na cadeia: ponto, ou linha PERPENDICULAR à direção de medida */
      var el = ests.filter(function (e) { return !e.d || Math.abs(dot2(e.d, m)) < 0.02; });
      var L = el.map(function (e) { return { e: e, t: dot2(e.q, m) }; }).sort(function (a, b) { return a.t - b.t; });
      var uni = [];
      L.forEach(function (x) { if (!uni.length || Math.abs(x.t - uni[uni.length - 1].t) > tolEq) uni.push(x); });
      if (uni.length < 2) return;
      if (k > 0 && uni[uni.length - 1].t - uni[0].t < num(opc.minPerp, 0.05)) return;
      /* a linha passa FORA de tudo: além da menor coordenada perpendicular (as pontas das linhas contam) */
      var vs = []; el.forEach(function (e) { e.ext.forEach(function (q) { vs.push(dot2(q, t2)); }); });
      var vMin = Math.min.apply(null, vs);
      out.push({ m: m, t2: t2, est: uni.map(function (x) { return x.e; }), ts: uni.map(function (x) { return x.t; }),
                 valores: uni.slice(1).map(function (x, i) { return r6(x.t - uni[i].t); }), total: r6(uni[uni.length - 1].t - uni[0].t), vLinha: vMin - gap * (k === 0 ? 1 : 1) });
    });
    return out;
  }
  /* o eixo da grade entra na cadeia pela PONTA do lado da linha de cota (a chamada não atravessa a grade) */
  function refDaEstacao(estado, e, c) {
    var r = clone(e.ref); if (!e.eixo || !c) return r;
    var pc = acharPeca(estado, e.id), g = pc ? geom(pc) : null; if (!g) return r;
    var va = dot2(e.ext[0], c.t2), vb = dot2(e.ext[1], c.t2), L = len(sub(g.b, g.a));
    r.s = r6(va <= vb ? 0 : L); var p = va <= vb ? g.a : g.b; r.x = r6(p[0]); r.z = r6(p[2]);
    return r;
  }
  function novoIdF(pre) { var n = 0; return function () { n++; return (pre || "ct") + Date.now().toString(36) + n + Math.floor(Math.random() * 1e4).toString(36); }; }

  /* COTAR SELEÇÃO NO 3D → { ok, ops:[cota3d…], cadeias, motivo } */
  function cotarSelecao(estado, ids, opc) {
    opc = opc || {};
    var nid = opc.novoId || novoIdF("c3");
    var ests = arr(ids).map(function (id) { return estacao(estado, id); }).filter(Boolean);
    if (ests.length < 2) return { ok: false, motivo: ests.length ? "Selecione pelo menos duas peças (Ctrl + clique soma)." : "Selecione as peças a cotar (pilares, eixos, paredes, perfis, vigas, tubos)." };
    var ch = cadeias(ests, { afast: num(opc.afast, 1.0) });
    if (!ch.length) return { ok: false, motivo: "As peças estão no mesmo lugar em planta, ou alinhadas na direção de medida (barra deitada ao longo dela): nada a cotar." };
    /* a cota corre no chão das peças (a menor cota) — como a planta de locação */
    var y = fin(+opc.y) ? +opc.y : Math.min.apply(null, ests.map(function (e) { return e.g.base ? e.g.base[1] : e.p3[1]; }));
    var ops = [], pad = opc.padrao;
    ch.forEach(function (c) {
      var d3 = [c.m[0], 0, c.m[1]], lado3 = [-c.t2[0], 0, -c.t2[1]];
      var refs = c.est.map(function (e) { var r = refDaEstacao(estado, e, c); if (e.eixo) r.y = r6(y); return r; });
      var v0 = dot2(c.est[0].q, c.t2), off = v0 - c.vLinha;
      var base = { k: "linear", refs: refs, dir: { x: d3[0], y: 0, z: d3[2] }, lado: { x: lado3[0], y: 0, z: lado3[2] }, off: off, y: y, auto: "selecao" };
      if (pad) base.padrao = pad;
      var b0 = clone(base); b0.id = nid();
      var r = opCota3d(b0);
      if (r.ok) ops.push(r.op);
      /* o TOTAL, quando a cadeia tem mais de um trecho: fora da cadeia */
      if (refs.length > 2) {
        var bt = clone(base); bt.id = nid(); bt.refs = [refs[0], refs[refs.length - 1]]; bt.off = off + num(opc.afastTotal, 0.6); bt.auto = "selecao-total";
        var rt = opCota3d(bt); if (rt.ok) ops.push(rt.op);
      }
    });
    return { ok: !!ops.length, ops: ops, cadeias: ch.map(function (c) { return { m: c.m, valores: c.valores, total: c.total, n: c.est.length }; }) };
  }

  /* ============================================== PONTE COM A COTA DA VISTA (P7)
   * proj = { tipo:'planta' } | { tipo:'corte', ax, az, bx, bz, inv }
   * (o mesmo do js/bim2dui.js: no corte, x ao longo da linha e y = −altura) */
  function projetor(proj) {
    if (!proj || proj.tipo !== "corte") return { tipo: "planta", p: function (p) { return [p[0], p[2]]; }, d: function (d) { var u = [d[0], d[2]], L = Math.sqrt(u[0] * u[0] + u[1] * u[1]); return L > 1e-6 ? [u[0] / L, u[1] / L] : null; } };
    var ax = num(proj.ax, 0), az = num(proj.az, 0), dx = num(proj.bx, 0) - ax, dz = num(proj.bz, 0) - az, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / L, nz = -dx / L;
    if (proj.inv) { nx = -nx; nz = -nz; }
    return {
      tipo: "corte", nx: nx, nz: nz,
      p: function (p) { return [(p[0] - ax) * (-nz) + (p[2] - az) * nx, -p[1]]; },
      d: function (d) { var u = [d[0] * (-nz) + d[2] * nx, -d[1]], l = Math.sqrt(u[0] * u[0] + u[1] * u[1]); return l > 1e-6 ? [u[0] / l, u[1] / l] : null; },
      /* o eixo da grade cruza a linha do corte onde? (x do desenho) — null se não cruza */
      eixo: function (e) {
        var ex = num(e.x1, 0) - num(e.x0, 0), ez = num(e.z1, 0) - num(e.z0, 0), den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) return null;
        var r = ((num(e.x0, 0) - ax) * dz - (num(e.z0, 0) - az) * dx) / den; if (r < -1e-6 || r > 1 + 1e-6) return null;
        var X = num(e.x0, 0) + r * ex, Z = num(e.z0, 0) + r * ez; return (X - ax) * (-nz) + (Z - az) * nx;
      }
    };
  }
  /* a referência P7 { r:'p3', k, el, i, u, v, w, s, x, y } ou { r:'nivelc', nivel, x, y } → { ok, p:[a,b], d } */
  function resolverP7(estado, ref, opc) {
    opc = opc || {};
    var J = projetor(opc.proj), cl = fin(+ref.x) && fin(+ref.y) ? [+ref.x, +ref.y] : null;
    if (ref.r === "nivelc") {
      var ns = niveisDe(opc), nv = ns.filter(function (n) { return n.id === String(ref.nivel); })[0];
      if (!nv) return { ok: false, orfa: true };
      return { ok: true, p: [cl ? cl[0] : 0, J.tipo === "corte" ? -nv.y : (cl ? cl[1] : 0)], d: null, y: nv.y };
    }
    var pc = acharPeca(estado, ref.el);
    if (!pc) return { ok: false, orfa: true };
    if (pc.k === "eixo" && ref.k !== "cruz") {
      if (J.tipo === "corte") { var xe = J.eixo(pc.o); if (xe == null) return { ok: false, orfa: true }; return { ok: true, p: [xe, cl ? cl[1] : 0], d: [0, 1] }; }
      var g = geom(pc), dd = unit(sub(g.b, g.a)); if (!dd) return { ok: false };
      var s = fin(+ref.s) ? +ref.s : 0; var pe = add(g.a, mul(dd, s));
      return { ok: true, p: [pe[0], pe[2]], d: [dd[0], dd[2]], base: [g.a[0], g.a[2]] };
    }
    var r3 = { el: ref.el, r: ref.k || "centro" };
    ["i", "u", "v", "w", "s", "hx1", "el2"].forEach(function (k) { if (ref[k] != null) r3[k] = ref[k]; });
    var x = resolver(estado, r3, opc); if (!x.ok) return { ok: false, orfa: !!x.orfa };
    var p = J.p(x.p), d = x.d ? J.d(x.d) : null;
    /* y = a ALTURA do ponto (a cota de elevação da planta lê daqui: o topo do aço) */
    return { ok: true, p: p, d: d, y: x.p[1] };
  }
  /* a referência 3D → a referência P7 numa vista (com o ponto da vista para a órfã) */
  function refParaP7(estado, ref3, proj) {
    if (!ref3) return null;
    var J = projetor(proj), x = resolver(estado, ref3);
    var pv = x.ok ? J.p(x.p) : (fallback(ref3) ? J.p(fallback(ref3)) : [0, 0]);
    if (ref3.r === "nivel" && ref3.nivel != null && J.tipo === "corte") return { r: "nivelc", nivel: String(ref3.nivel), x: r6(pv[0]), y: r6(pv[1]) };
    if (ref3.el == null || ref3.r === "p") return { x: r6(pv[0]), y: r6(pv[1]) };
    var pc = acharPeca(estado, ref3.el);
    if (pc && pc.k === "eixo" && ref3.r !== "cruz" && J.tipo === "planta") {
      var g = geom(pc), dd = unit(sub(g.b, g.a)) || [1, 0, 0], s = fin(+ref3.s) ? +ref3.s : dot(sub(x.p, g.a), dd);
      return { el: ref3.el, r: "eixo", s: r6(s), x: r6(pv[0]), y: r6(pv[1]) };
    }
    var o = { el: ref3.el, r: "p3", k: ref3.r || "centro", x: r6(pv[0]), y: r6(pv[1]) };
    ["i", "u", "v", "w", "s", "hx1", "el2"].forEach(function (k) { if (ref3[k] != null) o[k] = ref3[k]; });
    return o;
  }
  /* PONTOS NOTÁVEIS NA VISTA (para o encaixe da cota 2D): os mesmos da peça, projetados */
  function candidatosVista(estado, proj, opc) {
    var J = projetor(proj), C = candidatos(estado, { y: num(opc && opc.y, 0), modo: opc && opc.modo });
    var pts = C.pontos.map(function (q) { var v = J.p(q.p); return { p: v, tipo: q.tipo, id: q.id, rotulo: q.rotulo, ref: refParaP7(estado, q.ref.r === "eixo" ? q.ref : q.ref, proj) }; });
    if (J.tipo === "corte") {
      /* no corte, o eixo da grade é uma vertical onde cruza a linha do corte */
      arr(estado && estado.eixos).forEach(function (e) { var xe = J.eixo(e); if (xe != null) pts.push({ p: [xe, num(opc && opc.yEixo, 0)], tipo: "intersecao", id: e.id, rotulo: "eixo " + txt(e.nome), ref: { el: e.id, r: "p3", k: "eixo", x: r6(xe), y: r6(num(opc && opc.yEixo, 0)) }, linhaV: true }); });
    }
    return pts;
  }
  function maisPerto(pts, p, tol) {
    var best = null;
    arr(pts).forEach(function (q) {
      var d = q.linhaV ? Math.abs(q.p[0] - p[0]) : Math.sqrt(Math.pow(q.p[0] - p[0], 2) + Math.pow(q.p[1] - p[1], 2));
      if (d > tol) return;
      var cl = CLASSE[q.tipo] != null ? CLASSE[q.tipo] : 5;
      if (!best || cl < best.cl || (cl === best.cl && d < best.d - 1e-9)) best = { q: q, d: d, cl: cl };
    });
    if (!best) return null;
    var r = clone(best.q.ref); if (best.q.linhaV) r.y = r6(p[1]);
    return { ref: r, dist: best.d, rotulo: best.q.rotulo, tipo: best.q.tipo, p: best.q.linhaV ? [best.q.p[0], p[1]] : best.q.p };
  }

  /* COTAR SELEÇÃO NA VISTA 2D → { ok, ops:[anot2d…] } (cota linear da P7, presa às peças) */
  function cotarSelecaoVista(estado, ids, vista, proj, opc) {
    opc = opc || {};
    var A = P7(); if (!A) return { ok: false, motivo: "A anotação 2D (js/bimanot.js) não carregou." };
    var J = projetor(proj), nid = opc.novoId || novoIdF("n7c");
    var ests = arr(ids).map(function (id) { return estacao(estado, id, J.p); }).filter(Boolean);
    if (J.tipo === "corte") ests = ests.filter(function (e) {
      if (!e.eixo) return true;
      var xe = J.eixo(acharPeca(estado, e.id).o); if (xe == null) return false;
      e.q = [xe, e.q[1]]; e.d = [0, 1]; e.ext = [e.q, e.q]; return true;
    });
    if (ests.length < 2) return { ok: false, motivo: "Selecione pelo menos duas peças (Ctrl + clique soma)." };
    var ch = cadeias(ests, { afast: num(opc.afast, 0.8) });
    if (!ch.length) return { ok: false, motivo: "As peças estão no mesmo lugar nesta vista: nada a cotar." };
    var ops = [];
    ch.forEach(function (c) {
      var refs = c.est.map(function (e) { return refParaP7(estado, refDaEstacao(estado, e, J.tipo === "planta" ? c : null), proj); });
      var ehH = Math.abs(c.m[1]) < 1e-6, ehV = Math.abs(c.m[0]) < 1e-6;
      var base = { vista: vista, cota: ehH || ehV ? "linear" : "alinhada", refs: refs, auto: opc.auto || "selecao" };
      if (ehH) base.orient = "h"; else if (ehV) base.orient = "v"; else base.dirMed = { x: r6(c.m[0]), y: r6(c.m[1]) };
      if (opc.tipoCota) base.tipoCota = opc.tipoCota;
      /* o arredondamento: metálica em mm (o tipo "Linear (mm)" da P7) */
      else if ((opc.padrao || padraoDe(estado, c.est.map(function (e) { return e.ref; }), opc.cfg)) === "mm") base.tipoCota = "linear-mm";
      var qLinha = [c.m[0] * c.ts[0] + c.t2[0] * c.vLinha, c.m[1] * c.ts[0] + c.t2[1] * c.vLinha];
      function criar(refsX, qL) {
        var b = clone(base); b.id = nid(); b.refs = refsX; b.off = 0.6;
        var r = A.opCota(b); if (!r.ok) return null;
        r.op.off = A.offsetPara(estado, r.op, qL, { corte: J.tipo === "corte", proj: proj });
        return r.op;
      }
      var op = criar(refs, qLinha); if (op) ops.push(op);
      if (refs.length > 2) {
        var qT = [qLinha[0] - c.t2[0] * num(opc.afastTotal, 0.6), qLinha[1] - c.t2[1] * num(opc.afastTotal, 0.6)];
        var ot = criar([refs[0], refs[refs.length - 1]], qT); if (ot) { ot.auto = (opc.auto || "selecao") + "-total"; ops.push(ot); }
      }
    });
    return { ok: !!ops.length, ops: ops, cadeias: ch.map(function (c) { return { m: c.m, valores: c.valores, total: c.total, n: c.est.length }; }) };
  }

  /* ============================================ FURAÇÃO DE CHAPA
   * A cadeia dos furos a partir da BORDA, nas duas direções da chapa (u e v):
   * borda, cada linha de furos, a outra borda — e o total. No 3D (cota3d no
   * plano da chapa) ou na vista 2D (planta, chapa deitada). */
  function furacao(estado, id, opc) {
    opc = opc || {};
    var pc = acharPeca(estado, id), g = pc ? geom(pc) : null;
    if (!g || !g.chapa) return { ok: false, motivo: "Selecione uma CHAPA (a furação é cotada a partir da borda)." };
    if (!g.furosUV.length) return { ok: false, motivo: "Esta chapa não tem furos." };
    var q = g.quadro, nid = opc.novoId || novoIdF("cf"), ops = [], tolEq = 0.0005;
    function eixoCadeia(eixo) {
      var dirU = eixo === "u", vals = g.furosUV.map(function (f, i) { return { t: dirU ? f.u : f.v, i: i, o: dirU ? f.v : f.u }; }).sort(function (a, b) { return a.t - b.t; });
      var uni = []; vals.forEach(function (x) { if (!uni.length || Math.abs(x.t - uni[uni.length - 1].t) > tolEq) uni.push(x); });
      var t0 = dirU ? q.u0 : q.v0, t1 = dirU ? q.u1 : q.v1, o0 = dirU ? q.v0 : q.u0;
      /* as bordas: pontos da borda na linha do 1º furo (referência "loc" absoluta da chapa) */
      function borda(t) { var u = dirU ? t : o0, v = dirU ? o0 : t; return { el: id, r: "loc", hx1: 1, u: r6(u), v: r6(v), w: 0 }; }
      var refs = [borda(t0)].concat(uni.map(function (x) { return { el: id, r: "furo", i: x.i }; })).concat([borda(t1)]);
      refs.forEach(function (r) { var x = resolver(estado, r); if (x.ok) { r.x = r6(x.p[0]); r.y = r6(x.p[1]); r.z = r6(x.p[2]); } });
      var d = dirU ? q.X : q.Y, lado = mul(dirU ? q.Y : q.X, -1);
      return { refs: refs, d: d, lado: lado, n: uni.length };
    }
    ["u", "v"].forEach(function (e) {
      var c = eixoCadeia(e);
      var b = { id: nid(), k: "linear", refs: c.refs, dir: O3(c.d), lado: O3(c.lado), off: num(opc.afast, 0.06), padrao: "mm", auto: "furacao" };
      var r = opCota3d(b); if (r.ok) ops.push(r.op);
    });
    return { ok: !!ops.length, ops: ops };
  }
  function furacaoVista(estado, id, vista, proj, opc) {
    opc = opc || {};
    var A = P7(); if (!A) return { ok: false, motivo: "A anotação 2D não carregou." };
    var r3 = furacao(estado, id, opc); if (!r3.ok) return r3;
    var nid = opc.novoId || novoIdF("n7f"), J = projetor(proj), ops = [];
    r3.ops.forEach(function (o) {
      var refs = o.refs.map(function (r) { return refParaP7(estado, r, proj); });
      var d2 = J.d(V3(o.dir)), l2 = J.d(V3(o.lado)); if (!d2) return;
      var b = { id: nid(), vista: vista, cota: "alinhada", refs: refs, dirMed: { x: r6(d2[0]), y: r6(d2[1]) }, tipoCota: "linear-mm", auto: "furacao" };
      var rr = A.opCota(b); if (!rr.ok) return;
      var x0 = resolver(estado, o.refs[0]), p0 = x0.ok ? J.p(x0.p) : [refs[0].x, refs[0].y];
      var qL = l2 ? [p0[0] + l2[0] * num(opc.afast, 0.08), p0[1] + l2[1] * num(opc.afast, 0.08)] : p0;
      rr.op.off = A.offsetPara(estado, rr.op, qL, { corte: J.tipo === "corte", proj: proj });
      ops.push(rr.op);
    });
    return { ok: !!ops.length, ops: ops };
  }

  /* ============================================== COTAR A VISTA
   * PLANTA: os eixos da grade em cadeia (vãos) + o total, nas duas direções;
   * sem eixos, os pilares do nível. CORTE: os níveis (cota de nível com o nome)
   * e a cadeia das alturas entre eles + o total; os eixos que o corte cruza.
   * opc = { niveis, caixa:{x0,y0,x1,y1} (o desenho), nivelY (planta), anteriores:[ids auto] }
   * → { ok, ops (anot2d + apagar das automáticas anteriores), resumo } */
  function cotarVista(estado, vista, proj, opc) {
    opc = opc || {};
    var A = P7(); if (!A) return { ok: false, motivo: "A anotação 2D não carregou." };
    var J = projetor(proj), nid = opc.novoId || novoIdF("n7v"), ops = [], resumo = [];
    /* as automáticas de antes desta vista saem (cotar de novo não empilha) */
    arr(A.itensDaVista ? A.itensDaVista(estado, vista) : []).forEach(function (it) { if (it.tipo === "cota" && /^vista/.test(txt(it.auto))) ops.push({ op: "apagar", id: it.id }); });
    var nAntes = ops.length;
    if (J.tipo === "planta") {
      var ex = arr(estado && estado.eixos);
      if (ex.length >= 2) {
        var r = cotarSelecaoVista(estado, ex.map(function (e) { return e.id; }), vista, proj, { auto: "vista", afast: num(opc.afast, 1.2), novoId: nid });
        if (r.ok) { ops = ops.concat(r.ops); r.cadeias.forEach(function (c) { resumo.push("eixos: " + c.valores.map(function (v) { return fmtNum(v, 2); }).join(" + ") + " = " + fmtNum(c.total, 2)); }); }
      }
      if (ops.length === nAntes) {
        var y0 = num(opc.nivelY, -Infinity), y1 = fin(+opc.nivelY) ? +opc.nivelY + 3.5 : Infinity;
        var pil = arr(estado && estado.caixas).filter(function (c) {
          var g = geom({ k: "caixa", o: c }); if (!g || !(g.vert || c.tipo === "pilar")) return false;
          return g.base[1] <= y1 && g.topo[1] >= y0 - 0.01;
        }).map(function (c) { return c.id; });
        if (pil.length >= 2) {
          var rp = cotarSelecaoVista(estado, pil, vista, proj, { auto: "vista", afast: num(opc.afast, 1.2), novoId: nid });
          if (rp.ok) { ops = ops.concat(rp.ops); rp.cadeias.forEach(function (c) { resumo.push("pilares: " + c.valores.map(function (v) { return fmtNum(v, 2); }).join(" + ")); }); }
        }
      }
      if (ops.length === nAntes) return { ok: false, motivo: "A planta não tem eixos nem pilares para cotar.", ops: [] };
      return { ok: true, ops: ops, resumo: resumo };
    }
    /* CORTE */
    var ns = niveisDe(opc); if (!ns.length && !arr(estado && estado.eixos).length) return { ok: false, motivo: "O corte não tem níveis nem eixos para cotar.", ops: [] };
    var cx = opc.caixa || null, xEsq = cx && fin(+cx.x0) ? +cx.x0 : 0;
    /* à esquerda do desenho, de fora para dentro: o símbolo de nível com o nome (o texto corre para dentro),
       o total das alturas e a cadeia das alturas — nada em cima do outro */
    var xT = xEsq - num(opc.afast, 3.6), xC = xEsq - 0.3;
    ns.forEach(function (n) {
      var rr = A.opCota({ id: nid(), vista: vista, cota: "elevacao", refs: [{ r: "nivelc", nivel: n.id, x: r6(xT), y: r6(-n.y) }], lx: r6(xT + 0.25), ly: r6(-n.y - 0.45), prefixo: n.nome + " ", tipoCota: "elevacao" });
      if (rr.ok) { rr.op.auto = "vista-nivel"; ops.push(rr.op); }
    });
    if (ns.length >= 2) {
      var refsN = ns.map(function (n) { return { r: "nivelc", nivel: n.id, x: r6(xC), y: r6(-n.y) }; });
      var rc = A.opCota({ id: nid(), vista: vista, cota: "linear", orient: "v", refs: refsN, off: 0.6 });
      if (rc.ok) { rc.op.off = A.offsetPara(estado, rc.op, [xEsq - 1.0, -ns[0].y], { corte: true, proj: proj, niveis: opc.niveis }); rc.op.auto = "vista-alturas"; ops.push(rc.op); }
      if (ns.length > 2) {
        var rT = A.opCota({ id: nid(), vista: vista, cota: "linear", orient: "v", refs: [refsN[0], refsN[refsN.length - 1]], off: 0.6 });
        if (rT.ok) { rT.op.off = A.offsetPara(estado, rT.op, [xEsq - 1.6, -ns[0].y], { corte: true, proj: proj, niveis: opc.niveis }); rT.op.auto = "vista-alturas-total"; ops.push(rT.op); }
      }
      resumo.push("alturas: " + ns.slice(1).map(function (n, i) { return fmtNum(n.y - ns[i].y, 2); }).join(" + "));
    }
    /* os eixos que o corte cruza, em cadeia em cima */
    var yTopo = ns.length ? -ns[ns.length - 1].y - 1.2 : (cx && fin(+cx.y0) ? +cx.y0 - 1 : -4);
    var cruz = arr(estado && estado.eixos).map(function (e) { var xe = J.eixo(e); return xe == null ? null : { e: e, x: xe }; }).filter(Boolean).sort(function (a, b) { return a.x - b.x; });
    if (cruz.length >= 2) {
      var refsE = cruz.map(function (c) { return { el: c.e.id, r: "p3", k: "eixo", x: r6(c.x), y: r6(yTopo + 0.4) }; });
      var re = A.opCota({ id: nid(), vista: vista, cota: "linear", orient: "h", refs: refsE, off: 0.6 });
      if (re.ok) { re.op.off = A.offsetPara(estado, re.op, [cruz[0].x, yTopo], { corte: true, proj: proj }); re.op.auto = "vista-eixos"; ops.push(re.op); resumo.push("eixos: " + cruz.slice(1).map(function (c, i) { return fmtNum(c.x - cruz[i].x, 2); }).join(" + ")); }
    }
    if (ops.length === nAntes) return { ok: false, motivo: "Nada a cotar neste corte.", ops: [] };
    return { ok: true, ops: ops, resumo: resumo };
  }
  /* COTAR A VISTA no 3D: os eixos (cadeia + total) no nível ativo e a cadeia dos níveis num canto */
  function cotarVista3d(estado, opc) {
    opc = opc || {};
    var nid = opc.novoId || novoIdF("c3v"), ops = [], ex = arr(estado && estado.eixos), y = num(opc.y, 0);
    arr(estado && estado.cotas3d).forEach(function (it) { if (/^vista/.test(txt(it.auto))) ops.push({ op: "apagar", id: it.id }); });
    var nAntes = ops.length;
    if (ex.length >= 2) {
      var r = cotarSelecao(estado, ex.map(function (e) { return e.id; }), { y: y, afast: 1.2, novoId: nid });
      if (r.ok) r.ops.forEach(function (o) { o.auto = "vista" + (/total/.test(o.auto) ? "-total" : ""); ops.push(o); });
    }
    var ns = niveisDe(opc);
    if (ns.length >= 2) {
      var xs = [], zs = [];
      ex.forEach(function (e) { xs.push(num(e.x0, 0), num(e.x1, 0)); zs.push(num(e.z0, 0), num(e.z1, 0)); });
      arr(estado && estado.caixas).forEach(function (c) { xs.push(num(c.cx, 0)); zs.push(num(c.cz, 0)); });
      var x0 = xs.length ? Math.min.apply(null, xs) - 1.5 : 0, z0 = zs.length ? Math.min.apply(null, zs) - 1.5 : 0;
      var refs = ns.map(function (n) { return { r: "nivel", nivel: n.id, x: r6(x0), y: r6(n.y), z: r6(z0) }; });
      var rc = opCota3d({ id: nid(), k: "linear", refs: refs, dir: { x: 0, y: 1, z: 0 }, lado: { x: -1, y: 0, z: 0 }, off: 0.6, auto: "vista-niveis", padrao: opc.padrao });
      if (rc.ok) ops.push(rc.op);
    }
    if (ops.length === nAntes) return { ok: false, motivo: "Não há eixos nem níveis para cotar no 3D.", ops: [] };
    return { ok: true, ops: ops };
  }

  var BimCotas = {
    REFS: REFS, ROT_REF: ROT_REF, PADROES: PADROES, TIPOS3: TIPOS3, CLASSE: CLASSE,
    ehOp: function (nome) { return !!OPS[nome]; },
    indice: indice, acharPeca: acharPeca, geom: geom, ehMetal: ehMetal,
    resolver: function (estado, ref, opc) { return resolver(estado, ref, opc); }, refDaFace: refDaFace, refPeca: refPeca,
    candidatos: candidatos, snap: snap, niveis: niveisDe,
    padraoDe: padraoDe, formatoDe: formatoDe, fmtComp: fmtComp, fmtNum: fmtNum, fmtNivel: fmtNivel, prefixoNivel: prefixoNivel, textoValor: textoValor,
    medir: medir, opCota3d: opCota3d, valida: valida, aplicarOp: aplicarOp, fim: fim, registrar: registrar,
    estacao: estacao, cadeias: cadeias, cotarSelecao: cotarSelecao, cotarSelecaoVista: cotarSelecaoVista,
    projetor: projetor, resolverP7: resolverP7, refParaP7: refParaP7, candidatosVista: candidatosVista, maisPerto: maisPerto,
    furacao: furacao, furacaoVista: furacaoVista, cotarVista: cotarVista, cotarVista3d: cotarVista3d,
    itens: function (estado) { return arr(estado && estado.cotas3d); },
    item: function (estado, id) { return arr(estado && estado.cotas3d).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
  };
  registrar(BE());
  global.BimCotas = BimCotas;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCotas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

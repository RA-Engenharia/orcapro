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
    if (pc.k === "familia") {
      /* PORTA/JANELA hospedada: o VÃO (as duas ombreiras, o peitoril e a verga) — a cota de esquadria */
      var gv = o.host ? geomVao(o) : null; if (gv) return gv;
      var pf = [num(o.x, 0), num(o.y, 0), num(o.z, 0)]; return { c: pf, m: pf, a: pf, b: pf, topo: pf, base: pf, tipo: "familia", cantos: [], furos: [] };
    }
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
  /* ------------------------------------------------ o VÃO da porta/janela (14/10/2026)
   * Pedido: "simula a cotação dentro da planta baixa e dos cortes — todo tipo
   * de cotação". A cota de esquadria (largura do vão na planta, peitoril e
   * altura no corte) precisa da ABERTURA, que é da família: quem tem o
   * avaliador (js/bimcotasui.js: BIM.familiaAvaliar) registra a fonte. A
   * família hospedada já vem do replay com x/y/z na base da parede (no eixo)
   * e o rotY da parede (BimEdit.posicaoHospedada). */
  var _avalFam = null;
  function aberturaDe(f) {
    var av = null;
    try { av = _avalFam ? _avalFam(f) : null; } catch (e) { av = null; }
    var a = av && av.abertura;
    if (!a || !(num(a.largura, 0) > 0) || !(num(a.altura, 0) > 0)) return null;
    return { largura: num(a.largura, 0), altura: num(a.altura, 0), peitoril: num(a.peitoril, 0), desloc: num(a.deslocX, 0) };
  }
  function geomVao(f) {
    var ab = aberturaDe(f); if (!ab) return null;
    var th = num(f.rotY, 0), u = rotY([1, 0, 0], th), n = rotY([0, 0, 1], th), E = num(f.inst && f.inst.Espessura_parede, 0.15);
    var C = add([num(f.x, 0), num(f.y, 0), num(f.z, 0)], mul(u, ab.desloc));
    var y0 = C[1] + ab.peitoril, y1 = y0 + ab.altura, ym = (y0 + y1) / 2;
    function em(p, y) { return [p[0], y, p[2]]; }
    var c0 = add(C, mul(u, -ab.largura / 2)), c1 = add(C, mul(u, ab.largura / 2));
    return { c: em(C, ym), m: em(C, ym), a: em(c0, ym), b: em(c1, ym), topo: em(C, y1), base: em(C, y0), tipo: "abertura", cantos: [], furos: [],
             vao: { a0: em(c0, ym), a1: em(c1, ym), pe: em(C, y0), ve: em(C, y1), c0: c0, c1: c1, C: C, u: u, n: n, E: E, y0: y0, y1: y1, ym: ym, largura: ab.largura, altura: ab.altura, peitoril: ab.peitoril } };
  }
  /* os traços do vão (em 3D) por onde o clique pega a referência: a ombreira de face a face e de
     baixo a cima; o peitoril e a verga de face a face e de ombreira a ombreira */
  function tracosVao(g, r) {
    var V = g && g.vao; if (!V) return [];
    var h = mul(V.n, V.E / 2);
    function em(p, y) { return [p[0], y, p[2]]; }
    if (r === "vao0" || r === "vao1") { var P = r === "vao0" ? V.c0 : V.c1; return [[sub(em(P, V.ym), h), add(em(P, V.ym), h)], [em(P, V.y0), em(P, V.y1)]]; }
    if (r === "peitoril" || r === "verga") { var Y = r === "peitoril" ? V.y0 : V.y1; return [[sub(em(V.C, Y), h), add(em(V.C, Y), h)], [em(V.c0, Y), em(V.c1, Y)]]; }
    return [];
  }
  var REFS_VAO = { vao0: 1, vao1: 1, peitoril: 1, verga: 1 };
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
  var REFS = { fim0: 1, fim1: 1, meio: 1, centro: 1, topo: 1, base: 1, canto: 1, furo: 1, loc: 1, eixo: 1, cruz: 1, nivel: 1, p: 1, vao0: 1, vao1: 1, peitoril: 1, verga: 1 };
  var ROT_REF = { fim0: "ponta", fim1: "ponta", meio: "meio", centro: "centro", topo: "topo", base: "base", canto: "canto", furo: "centro do furo", loc: "face", eixo: "eixo", cruz: "cruzamento de eixos", nivel: "nível", p: "ponto",
                  vao0: "ombreira do vão", vao1: "ombreira do vão", peitoril: "peitoril", verga: "verga" };
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
      case "vao0": p = g.vao ? g.vao.a0 : null; break;
      case "vao1": p = g.vao ? g.vao.a1 : null; break;
      case "peitoril": p = g.vao ? g.vao.pe : null; break;
      case "verga": p = g.vao ? g.vao.ve : null; break;
      case "loc":
        var q = g.quadro; if (!q) { p = g.c; break; }
        p = add(add(add(q.O, mul(q.X, num(ref.u, 0) * (q.hx != null ? q.hx : 1))), mul(q.Y, num(ref.v, 0) * (q.hy != null ? q.hy : 1))), mul(q.Z, num(ref.w, 0) * (q.hz != null ? q.hz : 1)));
        break;
      default: p = g.c;
    }
    if (!p) return { ok: false, orfa: true, p: fb };
    if (g.linha && (r === "fim0" || r === "fim1" || r === "meio")) d = unit(sub(g.b, g.a));
    /* o vão: a ombreira, o peitoril e a verga são LINHAS de face a face da parede (a cota mede perpendicular a elas) */
    if (g.vao && REFS_VAO[r]) d = g.vao.n.slice();
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
      if (g.vao) {
        pt(g.vao.a0, "fim", R(id, "vao0"), "ombreira do vão"); pt(g.vao.a1, "fim", R(id, "vao1"), "ombreira do vão");
        pt(g.vao.pe, "fim", R(id, "peitoril"), g.vao.peitoril > 0.005 ? "peitoril" : "soleira"); pt(g.vao.ve, "fim", R(id, "verga"), "verga (topo do vão)");
        return;
      }
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
    /* a linha que a vista vê de TOPO (a parede perpendicular ao corte) é um ponto: o giro gravado com 4 casas
       deixa 2·10⁻⁵ de "comprimento" e a direção desse resto (lixo numérico) tirava a parede da cadeia (14/10/2026) */
    if (linha) { var la = plano(linha[0]), lb = plano(linha[1]), dl = [lb[0] - la[0], lb[1] - la[1]], L = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]); if (L > 1e-3) { d = [dl[0] / L, dl[1] / L]; ext = [la, lb]; } }
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
    var prof = num(proj.prof, 0);
    return {
      tipo: "corte", nx: nx, nz: nz, ax: ax, az: az, prof: prof,
      /* o ponto está na parte VISTA do corte? (do plano para a frente, até a profundidade da vista) — o que fica
         atrás do plano ou além da profundidade não está desenhado e não pode ser referência (14/10/2026) */
      visivel: function (p) { var s = (p[0] - ax) * nx + (p[2] - az) * nz; return s >= -0.01 && (!(prof > 0) || s <= prof + 0.01); },
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
    if (ref.k === "aresta") {
      /* a ARESTA desenhada de uma peça (a cota angular no corte): as duas pontas na face da peça
         (normalizadas — a rampa muda de inclinação e o ângulo acompanha); p = onde foi o clique (s) */
      var A0 = ref.a || {}, B0 = ref.b || {}, ra = resolver(estado, { el: ref.el, r: "loc", u: A0.u, v: A0.v, w: A0.w, hx1: ref.hx1 }, opc), rb = resolver(estado, { el: ref.el, r: "loc", u: B0.u, v: B0.v, w: B0.w, hx1: ref.hx1 }, opc);
      if (!ra.ok || !rb.ok) return { ok: false, orfa: true };
      var pa = J.p(ra.p), pb = J.p(rb.p), dl = [pb[0] - pa[0], pb[1] - pa[1]], Ll = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]);
      if (!(Ll > 1e-9)) return { ok: false };
      var sl = fin(+ref.s) ? +ref.s : 0.5;
      return { ok: true, p: [pa[0] + dl[0] * sl, pa[1] + dl[1] * sl], d: [dl[0] / Ll, dl[1] / Ll], aresta: [pa, pb] };
    }
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
    var yC = opc && fin(+opc.yCorte) ? +opc.yCorte : null, baseOk = {};
    var pts = C.pontos.filter(function (q) {
      /* na planta o peitoril e a verga caem em cima da linha das ombreiras: só confundem */
      if (J.tipo === "planta" && q.ref && (q.ref.r === "peitoril" || q.ref.r === "verga")) return false;
      /* só o que está DESENHADO: no corte, do plano para a frente; na planta, a peça que começa abaixo do plano de
         corte (a viga e a laje do andar de cima não aparecem na planta e não podem ser referência) */
      if (J.tipo === "corte") return J.visivel(q.p);
      if (yC != null && q.id != null) {
        var k = String(q.id); if (baseOk[k] == null) { var gq = geom(acharPeca(estado, q.id)); baseOk[k] = !gq || !gq.base || gq.base[1] <= yC + 0.01; }
        return baseOk[k];
      }
      return true;
    }).map(function (q) {
      var v = J.p(q.p), o = { p: v, tipo: q.tipo, id: q.id, rotulo: q.rotulo, ref: refParaP7(estado, q.ref, proj) };
      /* o vão pega pelo TRAÇO (a ombreira de face a face, o peitoril de ombreira a ombreira), não só pelo ponto */
      if (q.ref && REFS_VAO[q.ref.r]) {
        var sg = tracosVao(geom(acharPeca(estado, q.ref.el)), q.ref.r).map(function (s) { return [J.p(s[0]), J.p(s[1])]; })
          .filter(function (s) { return Math.abs(s[1][0] - s[0][0]) + Math.abs(s[1][1] - s[0][1]) > 1e-6; });
        if (sg.length) o.segs = sg;
      }
      return o;
    });
    if (J.tipo === "corte") {
      /* no corte, o eixo da grade é uma vertical onde cruza a linha do corte */
      arr(estado && estado.eixos).forEach(function (e) { var xe = J.eixo(e); if (xe != null) pts.push({ p: [xe, num(opc && opc.yEixo, 0)], tipo: "intersecao", id: e.id, rotulo: "eixo " + txt(e.nome), ref: { el: e.id, r: "p3", k: "eixo", x: r6(xe), y: r6(num(opc && opc.yEixo, 0)) }, linhaV: true }); });
    }
    return pts;
  }
  /* o ponto do segmento [a, b] (2D) mais perto de p → { q, d, t } */
  function noSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 1e-18 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    var q = [a[0] + dx * t, a[1] + dy * t]; return { q: q, t: t, d: Math.sqrt(Math.pow(q[0] - p[0], 2) + Math.pow(q[1] - p[1], 2)) };
  }
  function maisPerto(pts, p, tol) {
    var best = null;
    arr(pts).forEach(function (q) {
      var d = q.linhaV ? Math.abs(q.p[0] - p[0]) : Math.sqrt(Math.pow(q.p[0] - p[0], 2) + Math.pow(q.p[1] - p[1], 2)), pp = null;
      arr(q.segs).forEach(function (s) { var r = noSeg(p, s[0], s[1]); if (r.d < d) { d = r.d; pp = r.q; } });
      if (d > tol) return;
      /* o EIXO no corte é uma linha vertical inteira: vale como LINHA (classe do "na linha"), não como ponto —
         senão a 7,5 cm do eixo a face da parede (que fica no eixo) nunca era pega (14/10/2026) */
      var cl = q.linhaV ? CLASSE.proximo : (CLASSE[q.tipo] != null ? CLASSE[q.tipo] : 5);
      /* EMPATE de traço (16/10/2026): no canto do peitoril com a ombreira do vão o clique cai a 0 do traço de DUAS
         referências (a ombreira inteira passa pelo peitoril). A distância ao TRAÇO empatava e quem ganhava era o ruído de
         float32 da coordenada do mouse (7ª casa) — a cota do peitoril virava a da ombreira, a +1,70 em vez de +1,10.
         Dentro de 2 mm (uma fração de pixel) vale o ponto-âncora mais perto do clique (o peitoril, e não o meio da ombreira). */
      var da = q.linhaV ? d : Math.sqrt(Math.pow(q.p[0] - p[0], 2) + Math.pow(q.p[1] - p[1], 2));
      if (!best || cl < best.cl || (cl === best.cl && (d < best.d - 0.002 || (d <= best.d + 0.002 && da < best.da - 1e-9 && !q.linhaV && !best.q.linhaV)))) best = { q: q, d: d, cl: cl, pp: pp, da: da };
    });
    if (!best) return null;
    var r = clone(best.q.ref); if (best.q.linhaV) r.y = r6(p[1]);
    return { ref: r, dist: best.d, rotulo: best.q.rotulo, tipo: best.q.tipo, p: best.q.linhaV ? [best.q.p[0], p[1]] : (best.pp || best.q.p), cl: best.cl, linhaV: !!best.q.linhaV };
  }

  /* ================================================ O DESENHO DA VISTA (14/10/2026)
   * Na planta e no corte a cota pegava só os pontos notáveis das peças (ponta,
   * meio, topo) e, na planta, as faces da P7: no CORTE não havia como pegar o
   * topo da parede, a face da laje, o degrau da escada, a crista da rampa nem
   * a aba do perfil — o que está DESENHADO não era referência. Aqui o desenho
   * (os contornos cortados e as arestas vistas, cada um com o uid da peça —
   * vista2d com p6Tag) vira candidato: o CANTO e a ARESTA. A referência é
   * ASSOCIATIVA quando a peça é do editor: o ponto volta para o 3D (no plano
   * do corte; na planta, na altura do corte) e vira um ponto da FACE da peça,
   * normalizado (refDaFace): a peça anda, cresce ou muda de inclinação e a
   * cota acompanha. Peça do IFC aberto: o ponto do desenho (solto).
   * dados = { cortes:[{pts, fechado, u}], linhas:[[x1,y1,x2,y2]], linhasUd:[{u}] } */
  function candidatosDesenho(dados, opc) {
    opc = opc || {};
    var pts = [], segs = [], visto = {};
    function chave(p, u) { return Math.round(p[0] * 1e4) + "," + Math.round(p[1] * 1e4) + "," + u; }
    function vert(p, u, fonte) { if (!p || !fin(+p[0]) || !fin(+p[1])) return; var k = chave(p, u); if (visto[k]) return; visto[k] = 1; pts.push({ p: [+p[0], +p[1]], u: u, fonte: fonte }); }
    arr(dados && dados.cortes).forEach(function (c) {
      var P = arr(c && c.pts), u = (c && c.u) || "", n = P.length; if (n < 2) return;
      var fecha = c.fechado !== false && n > 2;
      P.forEach(function (q) { vert(q, u, "corte"); });
      for (var i = 0; i + 1 < n + (fecha ? 1 : 0); i++) { var a = P[i], b = P[(i + 1) % n]; if (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) > 1e-6) segs.push({ a: [+a[0], +a[1]], b: [+b[0], +b[1]], u: u, fonte: "corte" }); }
    });
    var L = arr(dados && dados.linhas), U = arr(dados && dados.linhasUd);
    for (var k = 0; k < L.length; k++) {
      var l = L[k], u2 = (U[k] && U[k].u) || ""; if (!l || l.length < 4) continue;
      var a2 = [+l[0], +l[1]], b2 = [+l[2], +l[3]];
      if (Math.abs(b2[0] - a2[0]) + Math.abs(b2[1] - a2[1]) < 1e-6) continue;
      vert(a2, u2, "linha"); vert(b2, u2, "linha"); segs.push({ a: a2, b: b2, u: u2, fonte: "linha" });
    }
    return { pts: pts, segs: segs };
  }
  /* o ponto da vista → o 3D: na planta, na altura do corte (aresta vista: na altura do centro da peça);
     no corte, no plano do corte (aresta vista: na profundidade do centro da peça) */
  function desprojetar(J, p2, opc, alvo) {
    if (J.tipo !== "corte") return [p2[0], alvo ? alvo[1] : num(opc && opc.yCorte, 0), p2[1]];
    var b = [J.ax + p2[0] * (-J.nz), -p2[1], J.az + p2[0] * J.nx];
    if (alvo) { var s = (alvo[0] - b[0]) * J.nx + (alvo[2] - b[2]) * J.nz; b = [b[0] + J.nx * s, b[1], b[2] + J.nz * s]; }
    return b;
  }
  function pecaDoUid(estado, u) {
    var m = /^edit:(.+)$/.exec(String(u || "")); if (!m) return null;
    var pc = acharPeca(estado, m[1]), g = pc ? geom(pc) : null;
    return g && g.quadro ? { id: m[1], g: g } : null;
  }
  /* a referência P7 de um ponto do desenho (associativa na peça do editor) */
  function refDoDesenho(estado, u, p2, proj, opc, fonte) {
    var solto = { x: r6(p2[0]), y: r6(p2[1]) }, pk = pecaDoUid(estado, u); if (!pk) return solto;
    var J = projetor(proj), P3 = desprojetar(J, p2, opc, fonte === "corte" ? null : pk.g.quadro.O);
    var r3 = refDaFace(estado, pk.id, P3); if (!r3 || r3.r !== "loc") return solto;
    var o = refParaP7(estado, r3, proj); if (!o || o.r !== "p3") return solto;
    o.x = solto.x; o.y = solto.y; o.des = 1;   /* des: veio do desenho (o rótulo e o teste sabem) */
    return o;
  }
  /* a referência de LINHA de uma aresta do desenho (cota angular): associativa = as duas pontas na face */
  function refLinhaDesenho(estado, sg, q, proj, opc) {
    var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L = Math.sqrt(dx * dx + dy * dy); if (!(L > 1e-9)) return null;
    var t = Math.max(0, Math.min(1, ((q[0] - sg.a[0]) * dx + (q[1] - sg.a[1]) * dy) / (L * L)));
    var A = refDoDesenho(estado, sg.u, sg.a, proj, opc, sg.fonte), Bq = refDoDesenho(estado, sg.u, sg.b, proj, opc, sg.fonte);
    if (A.r === "p3" && Bq.r === "p3" && A.k === "loc" && Bq.k === "loc" && String(A.el) === String(Bq.el)) {
      var o = { el: A.el, r: "p3", k: "aresta", a: { u: A.u, v: A.v, w: A.w }, b: { u: Bq.u, v: Bq.v, w: Bq.w }, s: r6(t), x: r6(q[0]), y: r6(q[1]), des: 1 };
      if (A.hx1) o.hx1 = 1;
      return o;
    }
    return { r: "lin", x: r6(sg.a[0] + dx * t), y: r6(sg.a[1] + dy * t), dx: r6(dx / L), dy: r6(dy / L) };
  }
  function nomeDoUid(estado, u) {
    var pk = /^edit:(.+)$/.exec(String(u || "")), pc = pk ? acharPeca(estado, pk[1]) : null;
    if (pc && pc.k === "caixa") return pc.o.tipo === "metal" ? "perfil" : (pc.o.tipo || "peça");
    if (pc && pc.k === "familia") return "esquadria";
    return "peça";
  }
  /* O ENCAIXE NO DESENHO: o canto mais perto (dentro de tol) e, sem canto, o ponto da aresta.
     → { ref, dist, rotulo, tipo:'fim'|'proximo', p, seg } | null. sem 'linha': só cantos. */
  function encaixeDesenho(estado, cand, p, tol, proj, opc) {
    opc = opc || {};
    if (!cand || !p) return null;
    var bp = null, bs = null;
    arr(cand.pts).forEach(function (q) { var d = Math.sqrt(Math.pow(q.p[0] - p[0], 2) + Math.pow(q.p[1] - p[1], 2)); if (d <= tol && (!bp || d < bp.d - 1e-12)) bp = { q: q, d: d }; });
    if (bp) return { ref: refDoDesenho(estado, bp.q.u, bp.q.p, proj, opc, bp.q.fonte), dist: bp.d, rotulo: "canto da " + nomeDoUid(estado, bp.q.u), tipo: "fim", p: bp.q.p.slice() };
    if (opc.soCantos) return null;
    arr(cand.segs).forEach(function (s) { var r = noSeg(p, s.a, s.b); if (r.d <= tol && (!bs || r.d < bs.d - 1e-12)) bs = { s: s, d: r.d, q: r.q }; });
    if (!bs) return null;
    return { ref: refDoDesenho(estado, bs.s.u, bs.q, proj, opc, bs.s.fonte), dist: bs.d, rotulo: "aresta da " + nomeDoUid(estado, bs.s.u), tipo: "proximo", p: bs.q, seg: bs.s };
  }
  /* a LINHA do desenho mais perto (cota angular) → { ref, dist, rotulo } | null */
  function linhaDesenho(estado, cand, p, tol, proj, opc) {
    var bs = null;
    arr(cand && cand.segs).forEach(function (s) { var r = noSeg(p, s.a, s.b); if (r.d <= tol && (!bs || r.d < bs.d - 1e-12)) bs = { s: s, d: r.d, q: r.q }; });
    if (!bs) return null;
    var ref = refLinhaDesenho(estado, bs.s, bs.q, proj, opc); if (!ref) return null;
    return { ref: ref, dist: bs.d, rotulo: "aresta da " + nomeDoUid(estado, bs.s.u), p: bs.q };
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

  /* ============================================ COTAS AUTOMÁTICAS DO PROJETO (27/10/2026)
   * Pedido do Rogério: um botão "Cotas automáticas" que refaz as cotas de TODAS as plantas, cortes e
   * fachadas do projeto no padrão técnico novo (cadeia por lado da edificação + total, cota interna face a
   * face, marca em ponto), SUBSTITUINDO as que existem. A regra da planta é a do motor BimPlanta
   * (ladosPlanta + cotasInternas): aqui só se traduz o resultado em ops de cota da P7, presas às paredes.
   * Os números ficam em REGRAS_COTA_ARQ (liga/desliga e afastamentos por tipo de vista); o motor não tem
   * número solto. Sem dado no modelo (corte sem laje, por exemplo) pula e DECLARA — nada é inventado.
   * Teste: node tools/test-bimcotas-arq.js */
  var REGRAS_COTA_ARQ = {
    marca: "linear-ponto",
    /* o teste de lugar livre (o mesmo da planta: BimPlanta.sobreposicao): cota fora de texto, rótulo e esquadria */
    livre: { ligado: true },
    planta: { ligado: true, alturaCorte: 1.2, distEdificacao: 0.3,
      externas: { ligado: true, afast: 0.8, afastTotal: 1.4 },
      internas: { ligado: true, minVao: 0.6, margem: 0.25 } },
    corte: { ligado: true,
      niveis: { ligado: true, afast: 2.6 },
      cadeiaVertical: { ligado: true, afast: 1.0, afastTotal: 1.7 },
      esquadrias: { ligado: true, afast: 0.45 },
      /* a cadeia horizontal fica logo ABAIXO do piso acabado mais baixo: afastamento em mm no papel (o motor converte pela escala) */
      cadeiaHorizontal: { ligado: true, afastMm: 12, afastTotalMm: 24 },
      peDireito: { ligado: true, minAltura: 1.5, folga: 0.35 } },
    fachada: { ligado: true, faixaFrente: 0.6, vaosPrincipais: 2, vaos: true,
      niveis: { ligado: true, afast: 2.6 },
      cadeiaVertical: { ligado: true, afast: 1.0, afastTotal: 1.7 },
      largura: { ligado: true, afastMm: 12, afastTotalMm: 24 } }
  };
  function mesclar(base, extra) {
    var o = clone(base);
    (function rec(d, e) {
      Object.keys(e || {}).forEach(function (k) {
        if (e[k] && typeof e[k] === "object" && !Array.isArray(e[k]) && d[k] && typeof d[k] === "object") rec(d[k], e[k]); else d[k] = e[k];
      });
    })(o, extra);
    return o;
  }
  function regrasArq(opc) { return mesclar(REGRAS_COTA_ARQ, opc && opc.regras); }
  var LINEARES = { linear: 1, alinhada: 1, coordenada: 1 };

  /* as cotas que o botão substitui nesta vista: as automáticas antigas (vista…/arq…, de qualquer tipo) e as lineares
     feitas à mão. Nível, angular, radial, arco, inclinação manuais ficam; a furação de chapa também. */
  function apagarAntigas(estado, vista) {
    var A = P7(), ops = [], auto = 0, man = 0;
    arr(A && A.itensDaVista ? A.itensDaVista(estado, vista) : []).forEach(function (it) {
      if (!it || it.tipo !== "cota") return;
      var au = txt(it.auto);
      if (/^vista|^arq/.test(au)) { ops.push({ op: "apagar", id: it.id }); auto++; return; }
      if ((au === "" || au === "selecao") && LINEARES[it.cota || "linear"]) { ops.push({ op: "apagar", id: it.id }); man++; }
    });
    return { ops: ops, auto: auto, manuais: man };
  }
  function ptsDaCaixa(c) {
    var th = num(c.rotY, 0), L = num(c.comprimento, 0) / 2, E = num(c.espessura, 0) / 2, cx = num(c.cx, 0), cz = num(c.cz, 0);
    var u = [Math.cos(th), -Math.sin(th)], n = [Math.sin(th), Math.cos(th)];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return { x: cx + u[0] * L * k[0] + n[0] * E * k[1], z: cz + u[1] * L * k[0] + n[1] * E * k[1] }; });
  }
  /* as paredes do modelo (caixa tipo "parede"): retângulo no plano; fora de esquadro é contada, não cotada */
  function paredesDoEstado(estado) {
    var out = [], diag = 0;
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede" || c.id == null) return;
      var H = num(c.altura, 0), L = num(c.comprimento, 0), E = num(c.espessura, 0); if (!(H > 0 && L > 0 && E > 0)) return;
      var q = num(c.rotY, 0) / (Math.PI / 2), orto = Math.abs(q - Math.round(q)) < 0.002;
      var pts = ptsDaCaixa(c), xs = pts.map(function (p) { return p.x; }), zs = pts.map(function (p) { return p.z; });
      var p = { id: String(c.id), pts: pts, orto: orto, base: num(c.cy, 0) - H / 2, topo: num(c.cy, 0) + H / 2,
                minx: Math.min.apply(null, xs), maxx: Math.max.apply(null, xs), minz: Math.min.apply(null, zs), maxz: Math.max.apply(null, zs) };
      if (!orto) diag++;
      out.push(p);
    });
    return { lista: out, diag: diag };
  }
  function ambientesDe(estado, opc) {
    if (Array.isArray(opc && opc.ambientes)) return opc.ambientes;
    var AM = dep("BimAmbiente", "./bimambiente.js");
    if (!AM || !AM.calcular || !arr(estado && estado.ambientes).length) return [];
    var out = [];
    try {
      var nv = (opc && opc.niveisObra) || niveisDe(opc).map(function (n) { return { id: n.id, nome: n.nome, elevacao: n.y }; });
      var r = AM.calcular(estado, { regra: "face", niveis: nv });
      arr(estado.ambientes).forEach(function (a) {
        var c = r && r.porId ? r.porId[a.id] : null;
        if (!c || c.estado !== "delimitado" || !c.contorno || c.contorno.length < 3) return;
        out.push({ nome: a.nome || ("Ambiente " + (out.length + 1)), pts: c.contorno, base: c.base, topo: c.topo });
      });
    } catch (e) { return []; }
    return out;
  }
  /* a cota linear da P7 (tipo novo, em ponto) com a linha posta onde passa o ponto q */
  function opLinear(estado, proj, vista, nid, refs, orient, q, auto, R, opc) {
    var A = P7(), r = A.opCota({ id: nid(), vista: vista, cota: "linear", orient: orient, refs: refs, off: 0.6, tipoCota: R.marca, auto: auto });
    if (!r.ok) return null;
    r.op.off = A.offsetPara(estado, r.op, q, { corte: proj && proj.tipo === "corte", proj: proj, niveis: opc && opc.niveis });
    return r.op;
  }
  function pontoRef(estado, proj, id, P) {
    var r3 = refDaFace(estado, id, P);
    return r3 ? refParaP7(estado, r3, proj) : null;
  }
  function solta(proj, P) { var J = projetor(proj), v = J.p(P); return { x: r6(v[0]), y: r6(v[1]) }; }

  /* ------------------------------------------------------------ PLANTA */
  /* a parede que tem a borda `val` no eixo ('x': minx/maxx; 'z': minz/maxz); `alvo` é a coordenada do outro eixo
     onde se quer o ponto; `exige` = a parede tem de conter o alvo (cota interna). → { p, P:[x,z] } */
  function paredePorBorda(ps, eixo, val, alvo, exige, tol) {
    var best = null;
    ps.forEach(function (p) {
      if (!p.orto) return;
      var a0 = eixo === "x" ? p.minx : p.minz, a1 = eixo === "x" ? p.maxx : p.maxz, b0 = eixo === "x" ? p.minz : p.minx, b1 = eixo === "x" ? p.maxz : p.maxx;
      var d = Math.min(Math.abs(a0 - val), Math.abs(a1 - val)); if (d > tol) return;
      var dentro = alvo >= b0 - 0.05 && alvo <= b1 + 0.05; if (exige && !dentro) return;
      var al = Math.max(b0, Math.min(b1, alvo)), dd = Math.abs(al - alvo);
      if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) <= 1e-6 && dd < best.dd)) {
        var borda = Math.abs(a0 - val) <= Math.abs(a1 - val) ? a0 : a1;
        best = { p: p, d: d, dd: dd, P: eixo === "x" ? [borda, al] : [al, borda] };
      }
    });
    return best;
  }
  function cotarPlantaArq(estado, vista, proj, opc) {
    opc = opc || {};
    var A = P7(), BP = dep("BimPlanta", "./bimplanta.js");
    if (!A) return { ok: false, motivo: "A anotação 2D não carregou." };
    if (!BP) return { ok: false, motivo: "O motor da planta (js/bimplanta.js) não carregou." };
    if (!proj || proj.tipo !== "planta") return { ok: false, motivo: "Esta vista não é uma planta." };
    var R = regrasArq(opc), RP = R.planta;
    if (!RP.ligado) return { ok: false, motivo: "As cotas automáticas de planta estão desligadas nas regras." };
    var yC = fin(+opc.yCorte) ? +opc.yCorte : num(opc.nivelY, 0) + RP.alturaCorte;
    var PD = paredesDoEstado(estado), cortadas = PD.lista.filter(function (p) { return p.orto && p.base < yC && p.topo > yC; });
    var amb = ambientesDe(estado, opc).filter(function (a) { return !(fin(a.base) && fin(a.topo)) || (a.base - 0.01 <= yC && yC <= a.topo + 0.01); });
    var fora = 0, paredes = cortadas;
    if (amb.length) { var ed = BP.paredesDaEdificacao(cortadas, amb, RP.distEdificacao); paredes = ed.paredes; fora = ed.fora; }
    var ap = apagarAntigas(estado, vista), ops = ap.ops.slice(), nid = opc.novoId || novoIdF("n7a"), J = projetor(proj);
    var cr = { ext: 0, int: 0 }, soltas = 0, decl = [];
    if (!paredes.length) decl.push("sem parede cortada a " + fmtNum(yC, 2) + " m");
    var cad = BP.ladosPlanta(paredes);
    function refTick(eixo, val, alvo, exige) {
      var h = paredePorBorda(paredes, eixo, val, alvo, exige, 0.03);
      if (h) { var P = eixo === "x" ? [h.P[0], yC, h.P[1]] : [h.P[0], yC, h.P[1]]; var r = pontoRef(estado, proj, h.p.id, P); if (r) return r; }
      soltas++;
      return solta(proj, eixo === "x" ? [val, yC, alvo] : [alvo, yC, val]);
    }
    if (RP.externas.ligado && paredes.length) {
      ["topo", "base", "esq", "dir"].forEach(function (nome) {
        var c = cad[nome]; if (!c) return;
        var horiz = nome === "topo" || nome === "base", face = cad.faces[nome], sg = (nome === "topo" || nome === "esq") ? -1 : 1;
        var tk = podarVals(c.ticks, opc), med = (tk[0] + tk[tk.length - 1]) / 2;
        var refs = tk.map(function (v) { return horiz ? refTick("x", v, face, false) : refTick("z", v, face, false); });
        function linha(rs, dist, auto) {
          var q = horiz ? [med, face + sg * dist] : [face + sg * dist, med];
          var op = opLinear(estado, proj, vista, nid, rs, horiz ? "h" : "v", q, auto, R, opc); if (op) { ops.push(op); cr.ext++; }
        }
        if (refs.length >= 3) { linha(refs, RP.externas.afast, "arq-ext"); linha([refs[0], refs[refs.length - 1]], RP.externas.afastTotal, "arq-ext-total"); }
        else linha(refs, RP.externas.afast, "arq-ext-total");
      });
    }
    var internas = { pulados: 0, semLugar: 0 };
    if (RP.internas.ligado && amb.length) {
      var ci = BP.cotasInternas(amb, { obstaculos: opc.obstaculos || [], margem: RP.internas.margem, minVao: RP.internas.minVao });
      internas.pulados = ci.pulados; internas.semLugar = ci.semLugar;
      ci.cotas.forEach(function (k) {
        var horiz = k.tipo === "larg", e1 = horiz ? "x" : "z";
        var rs = [refTick(e1, k.a, k.fixo, true), refTick(e1, k.b, k.fixo, true)];
        var q = horiz ? [(k.a + k.b) / 2, k.fixo] : [k.fixo, (k.a + k.b) / 2];
        var op = opLinear(estado, proj, vista, nid, rs, horiz ? "h" : "v", q, "arq-int", R, opc); if (op) { ops.push(op); cr.int++; }
      });
    } else if (RP.internas.ligado) decl.push("sem ambientes delimitados: sem cota interna");
    if (!ops.length) return { ok: false, motivo: "Nada a cotar nesta planta.", ops: [] };
    return { ok: true, ops: ops, resumo: { tipo: "planta", apagadas: { auto: ap.auto, manuais: ap.manuais }, criadas: { ext: cr.ext, int: cr.int, niv: 0 },
      pulados: internas.pulados + internas.semLugar, soltas: soltas, foraEdificacao: fora, diagonais: PD.diag, declarado: decl } };
  }

  /* ------------------------------------------------------- CORTE e FACHADA */
  /* os trechos da linha A→B (em metros desde A) que ficam DENTRO do polígono [{x,z}] */
  function trechosNoPoligono(pts, A, B) {
    var dx = B[0] - A[0], dz = B[1] - A[1], L = Math.sqrt(dx * dx + dz * dz); if (!(L > 1e-9)) return [];
    var d = [dx / L, dz / L], n = [d[1], -d[0]], ts = [], i, m = pts.length;
    function lado(p) { return (p.x - A[0]) * n[0] + (p.z - A[1]) * n[1] - 1e-7; }
    for (i = 0; i < m; i++) {
      var p = pts[i], q = pts[(i + 1) % m], sp = lado(p), sq = lado(q);
      if ((sp > 0) !== (sq > 0)) { var k = sp / (sp - sq); ts.push(((p.x + (q.x - p.x) * k) - A[0]) * d[0] + ((p.z + (q.z - p.z) * k) - A[1]) * d[1]); }
    }
    ts.sort(function (a, b) { return a - b; });
    var out = [];
    for (i = 0; i + 1 < ts.length; i += 2) { var t0 = Math.max(0, ts[i]), t1 = Math.min(L, ts[i + 1]); if (t1 - t0 > 1e-3) out.push([t0, t1]); }
    return out;
  }
  function ysUnicos(L, tol) {
    var s = L.slice().sort(function (a, b) { return a - b; }), o = [];
    s.forEach(function (y) { if (!o.length || y - o[o.length - 1] > tol) o.push(y); });
    return o;
  }
  function nivelEm(ns, y) { for (var i = 0; i < ns.length; i++) if (Math.abs(ns[i].y - y) < 0.015) return ns[i]; return null; }
  function refY(ns, x, y) { var n = nivelEm(ns, y); return n ? { r: "nivelc", nivel: n.id, x: r6(x), y: r6(-n.y) } : { x: r6(x), y: r6(-y) }; }
  function mesmaLista(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.02) return false; return true; }

  /* o que o corte (ou a elevação) enxerga: paredes, lajes, coberturas e vãos, em coordenadas do desenho (s ao longo da linha) */
  function secaoDe(estado, proj, fachada, R, ns, amb) {
    var J = projetor(proj), A = [J.ax, J.az], B = [proj.bx, proj.bz], L = Math.sqrt(Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2)) || 1;
    var dv = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    /* o x do DESENHO cresce na direção d = (−nz, nx) (a vista invertida corre ao contrário da linha A→B) */
    var d = [-J.nz, J.nx], sg = (d[0] * dv[0] + d[1] * dv[1]) >= 0 ? 1 : -1, lo = sg > 0 ? 0 : -L, hi = sg > 0 ? L : 0;
    function conv(iv) { return sg > 0 ? iv : [-iv[1], -iv[0]]; }
    var S = { paredes: [], lajes: [], cobs: [], vaos: [], diag: 0, A: A, d: d, n: [J.nx, J.nz], L: L, sg: sg, lo: lo, hi: hi };
    function prof(p) { return (p.x - A[0]) * J.nx + (p.z - A[1]) * J.nz; }
    function tl(p) { return (p.x - A[0]) * d[0] + (p.z - A[1]) * d[1]; }
    var PD = paredesDoEstado(estado); S.diag = PD.diag;
    /* a cota é da EDIFICAÇÃO (o mesmo filtro da planta): só a parede que delimita ambiente. Caixa-d'água, muro, mureta e parede
       solta no terreno ficam fora das cadeias */
    var BPe = dep("BimPlanta", "./bimplanta.js"), listaP = PD.lista.filter(function (p) { return p.orto; });
    S.foraEdificacao = 0;
    if (BPe && arr(amb).length) { var edf = BPe.paredesDaEdificacao(listaP, amb, R.planta.distEdificacao); listaP = edf.paredes; S.foraEdificacao = edf.fora; }
    listaP.forEach(function (p) {
      if (!p.orto) return;
      if (!fachada) {
        trechosNoPoligono(p.pts, A, B).map(conv).forEach(function (iv) { S.paredes.push({ id: p.id, s0: iv[0], s1: iv[1], base: p.base, topo: p.topo, p: p }); });
      } else {
        var ts = p.pts.map(tl), ds = p.pts.map(prof), cen = { x: (p.minx + p.maxx) / 2, z: (p.minz + p.maxz) / 2 };
        if (!J.visivel([cen.x, 0, cen.z])) return;
        S.paredes.push({ id: p.id, s0: Math.max(lo, Math.min.apply(null, ts)), s1: Math.min(hi, Math.max.apply(null, ts)), base: p.base, topo: p.topo, prof: Math.min.apply(null, ds), p: p });
      }
    });
    if (fachada && S.paredes.length) {
      var pf = Math.min.apply(null, S.paredes.map(function (w) { return w.prof; }));
      S.paredes = S.paredes.filter(function (w) { return w.prof <= pf + R.fachada.faixaFrente && w.s1 - w.s0 > 1e-3; });
    }
    /* A COTA DE ARQUITETURA começa no piso acabado mais baixo (nível com parede cortada em cima): o que fica abaixo dele
       (baldrame, estaca, bloco, radier, tubo enterrado) não entra nas cadeias nem nas caixas */
    var pm = null;
    arr(ns).forEach(function (n) { if (pm == null && S.paredes.some(function (w) { return w.base <= n.y + 0.05 && w.topo > n.y + 0.2; })) pm = n.y; });
    if (pm == null && S.paredes.length) pm = Math.min.apply(null, S.paredes.map(function (w) { return w.base; }));
    S.pisoMin = pm;
    if (pm != null) {
      S.paredes = S.paredes.filter(function (w) { return w.topo > pm + 0.05; }).map(function (w) { var o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; }); if (o.base < pm) o.base = pm; return o; });
    }
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "laje") return;
      var H = num(c.altura, 0); if (!(H > 0)) return;
      /* a laje tem contorno livre ou é retângulo (comprimento x espessura em planta) */
      var pts = Array.isArray(c.contorno) && c.contorno.length >= 3 ? c.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }) : (num(c.comprimento, 0) > 0 && num(c.espessura, 0) > 0 ? ptsDaCaixa(c) : null);
      if (!pts) return;
      var ivs = fachada ? (pts.some(function (q) { return J.visivel([q.x, 0, q.z]); }) ? [[Math.max(lo, Math.min.apply(null, pts.map(tl))), Math.min(hi, Math.max.apply(null, pts.map(tl)))]] : []) : trechosNoPoligono(pts, A, B).map(conv);
      var lyb = num(c.cy, 0) - H / 2, lyt = num(c.cy, 0) + H / 2;
      if (pm != null && lyt <= pm + 0.02) return;   /* laje no piso ou abaixo dele: é fundação/contrapiso, não pavimento */
      ivs.forEach(function (iv) { S.lajes.push({ id: String(c.id), s0: iv[0], s1: iv[1], yb: pm != null ? Math.max(lyb, pm) : lyb, yt: lyt }); });
    });
    arr(estado && estado.coberturas).forEach(function (c) {
      if (!c || c.id == null || !fin(+c.x0) || !fin(+c.z0) || !fin(+c.x1) || !fin(+c.z1)) return;
      var topo = fin(+c.cumeeira) ? +c.cumeeira : (fin(+c.base) ? +c.base : null); if (topo == null) return;
      var pts = [{ x: +c.x0, z: +c.z0 }, { x: +c.x1, z: +c.z0 }, { x: +c.x1, z: +c.z1 }, { x: +c.x0, z: +c.z1 }];
      var ivs = fachada ? (pts.some(function (q) { return J.visivel([q.x, 0, q.z]); }) ? [[Math.max(lo, Math.min.apply(null, pts.map(tl))), Math.min(hi, Math.max.apply(null, pts.map(tl)))]] : []) : trechosNoPoligono(pts, A, B).map(conv);
      ivs.forEach(function (iv) { S.cobs.push({ id: String(c.id), s0: iv[0], s1: iv[1], base: fin(+c.base) ? +c.base : topo, topo: topo }); });
    });
    /* os vãos das esquadrias hospedadas (a abertura vem da fonte de famílias) */
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !f.host) return;
      var g = geom({ k: "familia", o: f }); if (!g || !g.vao) return;
      var hw = S.paredes.filter(function (w) { return w.id === String(f.host.id); }); if (!hw.length) return;
      var c0 = { x: g.vao.c0[0], z: g.vao.c0[2] }, c1 = { x: g.vao.c1[0], z: g.vao.c1[2] };
      if (fachada) {
        var a0 = tl(c0), a1 = tl(c1);
        S.vaos.push({ id: String(f.id), s0: Math.min(a0, a1), s1: Math.max(a0, a1), y0: g.vao.y0, y1: g.vao.y1, host: hw[0] });
      } else {
        /* o corte cruza o vão? (a linha cruza o segmento c0-c1 da abertura) */
        var sd = (B[0] - A[0]) * (c1.z - c0.z) - (B[1] - A[1]) * (c1.x - c0.x); if (Math.abs(sd) < 1e-9) return;
        var tt = ((c0.x - A[0]) * (c1.z - c0.z) - (c0.z - A[1]) * (c1.x - c0.x)) / sd, uu = ((c0.x - A[0]) * (B[1] - A[1]) - (c0.z - A[1]) * (B[0] - A[0])) / sd;
        if (uu < 0 || uu > 1 || tt < 0 || tt > 1) return;
        var t = sg * tt * L, w = hw.filter(function (q) { return t >= q.s0 - 0.02 && t <= q.s1 + 0.02; })[0]; if (!w) return;
        S.vaos.push({ id: String(f.id), s0: w.s0, s1: w.s1, y0: g.vao.y0, y1: g.vao.y1, host: w });
      }
    });
    return S;
  }
  /* o x do desenho onde a cota vertical cabe: o 1º candidato da lista que não pisa em obstáculo (texto, esquadria, outra cota) */
  function escolherX(BP, cands, yb, yt, obst, livre) {
    if (!livre) return cands[0];
    var best = null;
    cands.forEach(function (c) {
      var so = BP.sobreposicao(-yt, -yb, "x", c, obst);
      if (!best || so < best.so - 1e-6) best = { c: c, so: so };
    });
    return best ? best.c : cands[0];
  }
  /* texto, nota-chave e rótulo que já estão na vista (e os retângulos que a tela mandar em opc.obstaculos): a cota não passa por cima */
  function obstaculosDaVista(estado, vista, opc) {
    var A = P7(), out = arr(opc && opc.obstaculos).slice();
    arr(A && A.itensDaVista ? A.itensDaVista(estado, vista) : []).forEach(function (it) {
      if (!it || (it.tipo !== "texto" && it.tipo !== "notaChave") || !fin(+it.x) || !fin(+it.y)) return;
      var w = Math.max(0.6, 0.11 * txt(it.texto).length);
      out.push({ minx: +it.x - w / 2, maxx: +it.x + w / 2, minz: +it.y - 0.3, maxz: +it.y + 0.05 });
    });
    return out;
  }
  /* mm no papel → metros do desenho, pela escala da vista (opc.escala, padrão 1:50) */
  function mmM(mm, opc) { return num(mm, 0) * num(opc && opc.escala, 50) / 1000; }
  /* PODAR a cadeia (como o podar do js/arqdesenho.js): trecho de comprimento zero (< 1 cm) some, e o ponto que deixaria um trecho
     curto demais para o número (< 2,6 mm no papel, pela escala da vista) se junta ao vizinho. Primeiro e último ficam (o total).
     vals em ordem crescente → índices que ficam. */
  function idxPodar(vals, opc) {
    var min = Math.max(0.01, mmM(2.6, opc)), n = vals.length, idx = n ? [0] : [];
    for (var i = 1; i < n; i++) {
      var d = vals[i] - vals[idx[idx.length - 1]];
      if (d >= min || i === n - 1) { if (d < min && idx.length > 1) idx.pop(); idx.push(i); }
    }
    return idx;
  }
  function podarVals(vals, opc) { return idxPodar(vals, opc).map(function (i) { return vals[i]; }); }
  function podarPares(vals, refs, opc) { var ix = idxPodar(vals, opc); return { vals: ix.map(function (i) { return vals[i]; }), refs: ix.map(function (i) { return refs[i]; }) }; }
  function resumoVazio(tipo, ap) { return { tipo: tipo, apagadas: { auto: ap.auto, manuais: ap.manuais }, criadas: { ext: 0, int: 0, niv: 0 }, pulados: 0, declarado: [] }; }

  function cotarCorteArq(estado, vista, proj, opc) {
    opc = opc || {};
    var A = P7(), BP = dep("BimPlanta", "./bimplanta.js");
    if (!A || !BP) return { ok: false, motivo: "O motor de cotas não carregou." };
    if (!proj || proj.tipo !== "corte") return { ok: false, motivo: "Esta vista não é um corte." };
    var R = regrasArq(opc), RC = R.corte, livre = R.livre.ligado !== false;
    if (!RC.ligado) return { ok: false, motivo: "As cotas automáticas de corte estão desligadas nas regras." };
    var ap = apagarAntigas(estado, vista), ops = ap.ops.slice(), nid = opc.novoId || novoIdF("n7k"), res = resumoVazio("corte", ap), decl = res.declarado;
    var ns = niveisDe(opc), amb = ambientesDe(estado, opc), S = secaoDe(estado, proj, false, R, ns, amb), J = projetor(proj);
    if (!S.paredes.length) {
      if (!ops.length) return { ok: false, motivo: "O corte não atravessa parede.", ops: [] };
      decl.push("o corte não atravessa parede: só as cotas antigas saíram"); return { ok: true, ops: ops, resumo: res };
    }
    var xE = Math.min.apply(null, S.paredes.map(function (w) { return w.s0; })), xD = Math.max.apply(null, S.paredes.map(function (w) { return w.s1; }));
    var yMax = Math.max.apply(null, S.paredes.map(function (w) { return w.topo; }));
    S.lajes.forEach(function (l) { if (l.yt > yMax) yMax = l.yt; }); S.cobs.forEach(function (c) { if (c.topo > yMax) yMax = c.topo; });
    var obst = [];
    function obstaculo(x0, x1, y0, y1) { obst.push({ minx: x0, maxx: x1, minz: -y1, maxz: -y0 }); }
    S.vaos.forEach(function (v) { obstaculo(v.s0, v.s1, v.y0, v.y1); });
    obstaculosDaVista(estado, vista, opc).forEach(function (o) { obst.push(o); });
    /* os pisos acabados que o corte atravessa: nível com parede cortada em cima dele */
    var pisos = ns.filter(function (n) { return S.paredes.some(function (w) { return w.base <= n.y + 0.05 && w.topo > n.y + 0.2; }); });
    function cobre(x0, x1, lado) { return lado === "esq" ? x0 <= xE + 0.6 : x1 >= xD - 0.6; }
    /* NÍVEIS (símbolo à esquerda, fora do desenho) */
    if (RC.niveis.ligado) {
      if (!ns.length) decl.push("sem níveis no projeto: sem símbolo de nível");
      var xT = xE - RC.niveis.afast;
      pisos.forEach(function (n) {
        var rr = A.opCota({ id: nid(), vista: vista, cota: "elevacao", refs: [{ r: "nivelc", nivel: n.id, x: r6(xT), y: r6(-n.y) }], lx: r6(xT + 0.25), ly: r6(-n.y - 0.45), prefixo: n.nome + " ", tipoCota: "elevacao", auto: "arq-niv" });
        if (rr.ok) { ops.push(rr.op); res.criadas.niv++; }
      });
    }
    /* CADEIA VERTICAL EXTERNA: piso · face de baixo da laje · topo da laje · topo da parede · cobertura (uma por lado se diferirem) */
    if (RC.cadeiaVertical.ligado) {
      var cadeiaDoLado = function (lado) {
        var ws = S.paredes.filter(function (w) { return lado === "esq" ? w.s0 <= xE + 0.05 : w.s1 >= xD - 0.05; });
        var ys = [];
        pisos.forEach(function (n) { if (ws.some(function (w) { return w.base <= n.y + 0.05 && w.topo > n.y + 0.2; })) ys.push(n.y); });
        S.lajes.forEach(function (l) { if (cobre(l.s0, l.s1, lado)) { ys.push(l.yb, l.yt); } });
        ys.push(Math.max.apply(null, ws.map(function (w) { return w.topo; })));
        S.cobs.forEach(function (c) { if (cobre(c.s0, c.s1, lado)) ys.push(c.base, c.topo); });
        return ysUnicos(ys, 0.02);
      };
      var yl = { esq: cadeiaDoLado("esq"), dir: cadeiaDoLado("dir") }, lados = mesmaLista(yl.esq, yl.dir) ? ["esq"] : ["esq", "dir"];
      lados.forEach(function (lado) {
        var Y = podarVals(yl[lado], opc), sg = lado === "esq" ? -1 : 1, xr = lado === "esq" ? xE : xD;
        if (Y.length < 2) { decl.push("lado " + (lado === "esq" ? "esquerdo" : "direito") + ": sem altura suficiente para a cadeia vertical"); return; }
        var refs = Y.map(function (y) { return refY(ns, xr, y); }), ym = (Y[0] + Y[Y.length - 1]) / 2;
        if (Y.length >= 3) {
          var o1 = opLinear(estado, proj, vista, nid, refs, "v", [xr + sg * RC.cadeiaVertical.afast, -ym], "arq-ext", R, opc); if (o1) { ops.push(o1); res.criadas.ext++; }
          var o2 = opLinear(estado, proj, vista, nid, [refs[0], refs[refs.length - 1]], "v", [xr + sg * RC.cadeiaVertical.afastTotal, -ym], "arq-ext-total", R, opc); if (o2) { ops.push(o2); res.criadas.ext++; }
        } else { var o3 = opLinear(estado, proj, vista, nid, refs, "v", [xr + sg * RC.cadeiaVertical.afast, -ym], "arq-ext-total", R, opc); if (o3) { ops.push(o3); res.criadas.ext++; } }
      });
      if (!S.lajes.length && !S.cobs.length) decl.push("o corte não corta laje nem cobertura: a cadeia vertical tem só piso e topo de parede");
    }
    /* CADEIA HORIZONTAL EM CIMA: eixos que o corte cruza; sem eixo, as faces das paredes cortadas */
    if (RC.cadeiaHorizontal.ligado) {
      var yTopo = -S.pisoMin + mmM(RC.cadeiaHorizontal.afastMm, opc), yTot = -S.pisoMin + mmM(RC.cadeiaHorizontal.afastTotalMm, opc), refsH = null, tks = null;
      var cruz = arr(estado && estado.eixos).map(function (e) { var xe = J.eixo(e); return xe == null ? null : { e: e, x: xe }; }).filter(Boolean).sort(function (a, b) { return a.x - b.x; });
      if (cruz.length >= 2) { tks = cruz.map(function (c) { return c.x; }); refsH = cruz.map(function (c) { return { el: c.e.id, r: "p3", k: "eixo", x: r6(c.x), y: r6(-S.pisoMin) }; }); }
      else {
        tks = BP._weld(S.paredes.reduce(function (a, w) { a.push(w.s0, w.s1); return a; }, []), 0.012);
        refsH = tks.map(function (t) {
          var w = S.paredes.filter(function (q) { return Math.abs(q.s0 - t) < 0.03 || Math.abs(q.s1 - t) < 0.03; })[0], ym = w ? (w.base + w.topo) / 2 : 0;
          var P = [S.A[0] + S.d[0] * t, ym, S.A[1] + S.d[1] * t], r = w ? pontoRef(estado, proj, w.id, P) : null;
          return r || { x: r6(t), y: r6(-ym) };
        });
      }
      var pH = podarPares(tks, refsH, opc); tks = pH.vals; refsH = pH.refs;
      if (tks.length >= 2) {
        var xm = (tks[0] + tks[tks.length - 1]) / 2;
        if (tks.length >= 3) {
          var h1 = opLinear(estado, proj, vista, nid, refsH, "h", [xm, yTopo], "arq-ext", R, opc); if (h1) { ops.push(h1); res.criadas.ext++; }
          var h2 = opLinear(estado, proj, vista, nid, [refsH[0], refsH[refsH.length - 1]], "h", [xm, yTot], "arq-ext-total", R, opc); if (h2) { ops.push(h2); res.criadas.ext++; }
        } else { var h3 = opLinear(estado, proj, vista, nid, refsH, "h", [xm, yTopo], "arq-ext-total", R, opc); if (h3) { ops.push(h3); res.criadas.ext++; } }
      }
    }
    /* ESQUADRIAS CORTADAS: piso · peitoril · verga · forro, junto da parede cortada, do lado de dentro */
    var ivA = [];
    amb.forEach(function (a) {
      if (!a || !a.pts || a.pts.length < 3) return;
      trechosNoPoligono(a.pts.map(function (p) { return { x: p.x, z: p.z }; }), S.A, [proj.bx, proj.bz]).map(function (iv) { return S.sg > 0 ? iv : [-iv[1], -iv[0]]; }).forEach(function (iv) { ivA.push({ a: a, s0: iv[0], s1: iv[1] }); });
    });
    function lajeAcima(s, y) {
      var best = null;
      S.lajes.forEach(function (l) { if (s >= l.s0 - 0.02 && s <= l.s1 + 0.02 && l.yb >= y - 0.01 && (!best || l.yb < best.yb)) best = l; });
      return best;
    }
    if (RC.esquadrias.ligado) {
      var visto = {};
      S.vaos.forEach(function (v) {
        var w = v.host, chave = w.id + ":" + Math.round(w.s0 * 100); if (visto[chave]) return; visto[chave] = 1;
        var forro = lajeAcima((w.s0 + w.s1) / 2, v.y1), tp = forro ? forro.yb : w.topo;
        var Y = podarVals(ysUnicos([w.base, v.y0, v.y1, tp], 0.02), opc); if (Y.length < 3) { decl.push("vão " + v.id + ": sem altura para peitoril, vão e verga"); return; }
        var sala = ivA.filter(function (r) { return Math.abs(r.s1 - w.s0) < 0.05 || Math.abs(r.s0 - w.s1) < 0.05; })[0];
        var esq = sala ? Math.abs(sala.s1 - w.s0) < 0.05 : ((w.s0 + w.s1) / 2) > (xE + xD) / 2;
        var sg = esq ? -1 : 1, xf = esq ? w.s0 : w.s1, cands = [];
        for (var k = 0; k < 8; k++) cands.push(xf + sg * (RC.esquadrias.afast + k * 0.1));
        var xc = escolherX(BP, cands, Y[0], Y[Y.length - 1], obst, livre);
        var op = opLinear(estado, proj, vista, nid, Y.map(function (y) { return refY(ns, xf, y); }), "v", [xc, -(Y[0] + Y[Y.length - 1]) / 2], "arq-int", R, opc);
        if (op) { ops.push(op); res.criadas.int++; obstaculo(xc - 0.3, xc + 0.1, Y[0], Y[Y.length - 1]); }
      });
    }
    /* PÉ-DIREITO de cada ambiente cortado: cota vertical dentro do ambiente */
    if (RC.peDireito.ligado) {
      if (!ivA.length) decl.push("sem ambientes no corte: sem pé-direito");
      ivA.forEach(function (r) {
        var nome = r.a.nome || "ambiente", sm = (r.s0 + r.s1) / 2, base = fin(+r.a.base) ? +r.a.base : null;
        if (base == null) { var nb = pisos.filter(function (n) { return n.y <= (fin(+r.a.topo) ? +r.a.topo : 1e9); }).pop(); base = nb ? nb.y : null; }
        if (base == null) { decl.push(nome + ": sem piso conhecido para o pé-direito"); return; }
        var forro = null;
        S.lajes.forEach(function (l) { if (sm >= l.s0 - 0.02 && sm <= l.s1 + 0.02 && l.yb >= base + RC.peDireito.minAltura && (!forro || l.yb < forro.yb)) forro = l; });
        if (!forro) { decl.push(nome + ": sem laje nem forro acima no corte, pé-direito não cotado"); return; }
        var lo = r.s0 + RC.peDireito.folga, hi = r.s1 - RC.peDireito.folga;
        if (hi < lo) { decl.push(nome + ": ambiente estreito demais para a cota de pé-direito"); return; }
        var cands = [], mid = (lo + hi) / 2;
        for (var k = 0; k <= Math.ceil((hi - lo) / 0.1); k++) { var a1 = mid + k * 0.1, a2 = mid - k * 0.1; if (a1 <= hi + 1e-9) cands.push(a1); if (k && a2 >= lo - 1e-9) cands.push(a2); }
        var xc = escolherX(BP, cands, base, forro.yb, obst, livre);
        var op = opLinear(estado, proj, vista, nid, [refY(ns, xc, base), refY(ns, xc, forro.yb)], "v", [xc, -(base + forro.yb) / 2], "arq-int", R, opc);
        if (op) { ops.push(op); res.criadas.int++; obstaculo(xc - 0.3, xc + 0.1, base, forro.yb); }
      });
    }
    res.diagonais = S.diag; res.foraEdificacao = S.foraEdificacao;
    return { ok: true, ops: ops, resumo: res };
  }

  function cotarFachadaArq(estado, vista, proj, opc) {
    opc = opc || {};
    var A = P7(), BP = dep("BimPlanta", "./bimplanta.js");
    if (!A || !BP) return { ok: false, motivo: "O motor de cotas não carregou." };
    if (!proj || proj.tipo !== "corte") return { ok: false, motivo: "Esta vista não é uma fachada." };
    var R = regrasArq(opc), RF = R.fachada;
    if (!RF.ligado) return { ok: false, motivo: "As cotas automáticas de fachada estão desligadas nas regras." };
    var ap = apagarAntigas(estado, vista), ops = ap.ops.slice(), nid = opc.novoId || novoIdF("n7f"), res = resumoVazio("fachada", ap), decl = res.declarado;
    var ns = niveisDe(opc), amb = ambientesDe(estado, opc), S = secaoDe(estado, proj, true, R, ns, amb);
    if (!S.paredes.length) {
      if (!ops.length) return { ok: false, motivo: "Não há parede à frente desta fachada.", ops: [] };
      decl.push("sem parede à frente da fachada: só as cotas antigas saíram"); return { ok: true, ops: ops, resumo: res };
    }
    var xE = Math.min.apply(null, S.paredes.map(function (w) { return w.s0; })), xD = Math.max.apply(null, S.paredes.map(function (w) { return w.s1; }));
    var yMin = S.pisoMin, yTopoP = Math.max.apply(null, S.paredes.map(function (w) { return w.topo; }));
    var cumeeira = null; S.cobs.forEach(function (c) { if (c.topo > yTopoP + 0.05 && (cumeeira == null || c.topo > cumeeira)) cumeeira = c.topo; });
    var vaosF = S.vaos;
    var pisos = ns.filter(function (n) { return n.y >= yMin - 0.01 && n.y < yTopoP - 0.2; });
    if (RF.niveis.ligado) {
      if (!ns.length) decl.push("sem níveis no projeto: sem símbolo de nível");
      var xT = xE - RF.niveis.afast;
      pisos.forEach(function (n) {
        var rr = A.opCota({ id: nid(), vista: vista, cota: "elevacao", refs: [{ r: "nivelc", nivel: n.id, x: r6(xT), y: r6(-n.y) }], lx: r6(xT + 0.25), ly: r6(-n.y - 0.45), prefixo: n.nome + " ", tipoCota: "elevacao", auto: "arq-niv" });
        if (rr.ok) { ops.push(rr.op); res.criadas.niv++; }
      });
    }
    if (RF.cadeiaVertical.ligado) {
      var ys = [pisos.length ? pisos[0].y : yMin, yTopoP];
      if (cumeeira != null) ys.push(cumeeira); else if (!S.cobs.length) decl.push("a fachada não tem cobertura no modelo: sem cota de cumeeira");
      /* vãos principais: os pares peitoril/verga que somam mais largura */
      var grupos = {};
      vaosF.forEach(function (v) { var k = Math.round(v.y0 * 100) + ":" + Math.round(v.y1 * 100); if (!grupos[k]) grupos[k] = { y0: v.y0, y1: v.y1, larg: 0 }; grupos[k].larg += v.s1 - v.s0; });
      Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return b.larg - a.larg; }).slice(0, RF.vaosPrincipais).forEach(function (g) { ys.push(g.y0, g.y1); });
      var Y = podarVals(ysUnicos(ys, 0.02), opc);
      if (Y.length < 2) decl.push("fachada sem altura para a cadeia vertical");
      else {
        var refs = Y.map(function (y) { return refY(ns, xE, y); }), ym = (Y[0] + Y[Y.length - 1]) / 2;
        if (Y.length >= 3) {
          var o1 = opLinear(estado, proj, vista, nid, refs, "v", [xE - RF.cadeiaVertical.afast, -ym], "arq-ext", R, opc); if (o1) { ops.push(o1); res.criadas.ext++; }
          var o2 = opLinear(estado, proj, vista, nid, [refs[0], refs[refs.length - 1]], "v", [xE - RF.cadeiaVertical.afastTotal, -ym], "arq-ext-total", R, opc); if (o2) { ops.push(o2); res.criadas.ext++; }
        } else { var o3 = opLinear(estado, proj, vista, nid, refs, "v", [xE - RF.cadeiaVertical.afast, -ym], "arq-ext-total", R, opc); if (o3) { ops.push(o3); res.criadas.ext++; } }
      }
    }
    if (RF.largura.ligado) {
      var yBase = -S.pisoMin;
      function refParede(t) {
        var w = S.paredes.filter(function (q) { return Math.abs(q.s0 - t) < 0.03 || Math.abs(q.s1 - t) < 0.03; })[0], ym = w ? (w.base + w.topo) / 2 : 0;
        var P = [S.A[0] + S.d[0] * t + S.n[0] * (w ? w.prof : 0), ym, S.A[1] + S.d[1] * t + S.n[1] * (w ? w.prof : 0)], r = w ? pontoRef(estado, proj, w.id, P) : null;
        return r || { x: r6(t), y: r6(-ym) };
      }
      var rE = refParede(xE), rD = refParede(xD), xm = (xE + xD) / 2, tem = false;
      if (RF.vaos && vaosF.length) {
        var us = vaosF.slice().sort(function (a, b) { return a.s0 - b.s0; }), cur = xE, refsV = [rE], ok = 0;
        us.forEach(function (v) {
          if (v.s0 < cur + 0.02) return;
          var r0 = refPeca(estado, v.id, "vao0"), r1 = refPeca(estado, v.id, "vao1"); if (!r0 || !r1) return;
          refsV.push(refParaP7(estado, r0, proj), refParaP7(estado, r1, proj)); cur = v.s1; ok++;
        });
        if (ok) {
          refsV.push(rD);
          /* a ordem é a do DESENHO (a vista de frente corre ao contrário do modelo): ordena pelo x projetado de cada referência */
          refsV = refsV.filter(function (r) { return r && fin(+r.x); }).sort(function (a, b) { return a.x - b.x; });
          var pV = podarPares(refsV.map(function (r) { return +r.x; }), refsV, opc); refsV = pV.refs;
          var oV = opLinear(estado, proj, vista, nid, refsV, "h", [xm, yBase + mmM(RF.largura.afastMm, opc)], "arq-ext", R, opc); if (oV) { ops.push(oV); res.criadas.ext++; }
          var oT = opLinear(estado, proj, vista, nid, [rE, rD], "h", [xm, yBase + mmM(RF.largura.afastTotalMm, opc)], "arq-ext-total", R, opc); if (oT) { ops.push(oT); res.criadas.ext++; tem = true; }
        } else decl.push("fachada: vãos sem abertura no modelo, só a largura total");
      }
      if (!tem) { var oW = opLinear(estado, proj, vista, nid, [rE, rD], "h", [xm, yBase + mmM(RF.largura.afastMm, opc)], "arq-ext-total", R, opc); if (oW) { ops.push(oW); res.criadas.ext++; } }
    }
    res.diagonais = S.diag;
    return { ok: true, ops: ops, resumo: res };
  }
  /* a vista já tem cota do motor novo (arq-*)? Então as cotas NATIVAS do desenho (js/desenho2d.js cotasDe) não aparecem:
     só uma família de cota por vista (a tela liga isto no estilo da vista; Ctrl+Z desfaz junto com o lote) */
  function vistaTemCotasArq(estado, vista) {
    var A = P7();
    return arr(A && A.itensDaVista ? A.itensDaVista(estado, vista) : []).some(function (it) { return it && it.tipo === "cota" && /^arq/.test(txt(it.auto)); });
  }
  /* o despacho: planta, fachada (elevação exterior) ou corte */
  function cotarVistaArq(estado, vista, proj, opc) {
    var t = (opc && opc.tipoVista) || (proj && proj.tipo === "planta" ? "planta" : "corte");
    if (t === "planta") return cotarPlantaArq(estado, vista, proj, opc);
    if (t === "fachada") return cotarFachadaArq(estado, vista, proj, opc);
    return cotarCorteArq(estado, vista, proj, opc);
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
    /* 14/10/2026: o vão da esquadria e o desenho da vista como referência */
    fonteFamilias: function (fn) { _avalFam = typeof fn === "function" ? fn : null; return true; }, aberturaDe: aberturaDe, tracosVao: tracosVao,
    candidatosDesenho: candidatosDesenho, encaixeDesenho: encaixeDesenho, linhaDesenho: linhaDesenho, refDoDesenho: refDoDesenho, refLinhaDesenho: refLinhaDesenho, desprojetar: desprojetar, noSeg: noSeg,
    furacao: furacao, furacaoVista: furacaoVista, cotarVista: cotarVista, cotarVista3d: cotarVista3d,
    /* 27/10/2026: o botão Cotas automáticas (padrão arquitetônico) */
    REGRAS_COTA_ARQ: REGRAS_COTA_ARQ, regrasArq: regrasArq, cotarPlantaArq: cotarPlantaArq, cotarCorteArq: cotarCorteArq, cotarFachadaArq: cotarFachadaArq, cotarVistaArq: cotarVistaArq, vistaTemCotasArq: vistaTemCotasArq, podarCadeia: idxPodar,
    itens: function (estado) { return arr(estado && estado.cotas3d); },
    item: function (estado, id) { return arr(estado && estado.cotas3d).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
  };
  registrar(BE());
  global.BimCotas = BimCotas;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCotas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

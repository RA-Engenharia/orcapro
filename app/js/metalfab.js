/* =====================================================================
 * metalfab.js — METÁLICA & MECÂNICA: MARCAÇÃO E ARQUIVOS DE FABRICAÇÃO
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 *   pecasFab(estado)   as peças de aço do modelo no formato da fábrica (mm):
 *                      chapas (js/metalpeca.js), perfis (daqui e os pilares/
 *                      vigas de aço do modelador, com os furos das ligações),
 *                      peças mecânicas; os parafusos à parte.
 *   numerar(estado)    MARCAS: peças iguais = mesma marca (P1, CH1, M1) e
 *                      CONJUNTOS de montagem (peça principal + o que é
 *                      soldado nela = A1…). Determinístico: o mesmo modelo dá
 *                      sempre as mesmas marcas (idempotente). opNumerar → a
 *                      op `marcar` (vai para a Marca da peça e a Tag do IFC).
 *   dstv(peca)         DSTV NC1 (.nc1), um arquivo por marca: blocos ST
 *                      (cabeçalho), BO (furos), AK (contorno externo), IK
 *                      (contorno interno), SI (marcação), EN. lerDstv lê de
 *                      volta (o teste confere bloco a bloco).
 *   dxfChapa(peca)     DXF de corte (laser/plasma) 1:1 em mm, um por marca:
 *                      CUT_OUTSIDE (contorno), CUT_INSIDE (furos e recortes),
 *                      ETCH (marcação). nesting(chapas) = aproveitamento
 *                      simples numa chapa padrão.
 *   listas(estado)     peças, conjuntos, parafusos/porcas/arruelas, chapas,
 *                      resumo de peso por material (o mesmo peso que o
 *                      js/bimpeso.js lê: a massa do quantitativo).
 *   desenho(...)       o desenho de fabricação (SVG) da peça e do conjunto:
 *                      vistas, furação cotada a partir da origem, lista de
 *                      furos — vai para a prancha (js/prancha.js).
 *
 * FORMATO DSTV — conferido na descrição oficial "Standard Description for
 * Steel Structure Pieces for the Numerical Controls", DSTV, 7ª edição,
 * julho/1998: ordem dos 24 campos do cabeçalho ST, códigos de perfil (I, L,
 * U, B, RU, RO, M, C, T, SO), faces o/u/v/h, comentário "**", contorno
 * fechado (o 1º ponto repetido no fim, nenhum outro repetido), mm e graus.
 * ⚠ VALOR DE PARTIDA a conferir no pós-processador da máquina de cada
 *   fábrica (o DSTV deixa margem): o SENTIDO do ângulo de corte, o
 *   cabeçalho de chapa (comprimento, largura e a espessura nos três campos
 *   de espessura) e o furo oblongo (bloco BO com "l").
 * Teste: node tools/test-metal-fab.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function N() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function Peso() { return dep("BimPeso", "./bimpeso.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function mm(v) { return Math.round(num(v, 0) * 10000) / 10; }
  function f2(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2); }
  function txt(v) { return v == null ? "" : String(v); }
  function br(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }

  /* ================================================== PEÇAS DA FÁBRICA */
  var COD_DSTV = { I: "I", U: "U", L: "L", "tubo-ret": "M", "tubo-circ": "RO", ret: "B", circ: "RU" };
  function ehAcoArq(c) { return (c.tipo === "viga" || c.tipo === "pilar") && c.perfil && (c.material === "aco" || /^(I|U|L|tubo-ret|tubo-circ)$/.test(c.perfil.forma)); }
  function cortesDe(mb) { var o = {}; ["almaIni", "almaFim", "abaIni", "abaFim"].forEach(function (k) { o[k] = r2(num(mb.cortes && mb.cortes[k], 0)); }); return o; }
  function perfilFab(c) {
    var mb = M().membro(c); if (!mb) return null;
    var p = mb.perfil, cat = p.cat && Aco() ? Aco().obter(p.cat) : null, s = mb.s, xo = mb.xOff;
    var furos = M().furosDe(c).map(function (f) {
      var h = { face: f.face, x: mm(num(f.x, 0) - xo), y: mm(f.y), d: num(f.d, num(f.db, 0) + 1.5), l: num(f.l, num(f.d, 0)), db: num(f.db, 0), tipo: f.tipo || "padrao" };
      if (f.ang != null) h.ang = num(f.ang, 0);
      return h;
    }).filter(function (h) { return h.x >= -0.5 && h.x <= mm(mb.L) + 0.5; });
    var massa = c.tipo === "metal" ? num(c.massa, 0) : num(c.massa, s.area * mb.L * 7850);
    furos.sort(function (a, b) { return a.face < b.face ? -1 : a.face > b.face ? 1 : (a.x - b.x) || (a.y - b.y); });
    var g = function (k) { return mm(p[k]); };
    var dims = p.forma === "I" || p.forma === "U" ? { h: g("d"), b: g("bf"), tf: g("tf"), tw: g("tw"), r: g("r") }
             : p.forma === "L" ? { h: g("a"), b: g("b"), tf: g("t"), tw: g("t"), r: g("r") }
             : p.forma === "tubo-ret" ? { h: g("h"), b: g("b"), tf: g("t"), tw: g("t"), r: g("ro") }
             : p.forma === "tubo-circ" ? { h: g("D"), b: g("D"), tf: g("t"), tw: g("t"), r: 0 }
             : p.forma === "ret" ? { h: g("h"), b: g("b"), tf: g("b"), tw: g("b"), r: 0 }
             : { h: mm(s.alt), b: mm(s.larg), tf: mm(s.larg), tw: mm(s.larg), r: 0 };
    return { id: c.id, kind: "perfil", papel: c.tipo === "metal" ? c.metal.papel : (c.tipo === "pilar" ? "Pilar" : "Viga"), perfil: p, nomePerfil: p.cat || s.rotulo, codigo: COD_DSTV[p.forma] || "SO",
             L: mm(mb.L), cortes: cortesDe(mb), furos: furos, dims: dims, kgm: cat && cat.massa ? cat.massa : r3(s.area * 7850), m2m: cat && cat.per ? cat.per : r3(s.perimetro),
             aco: c.tipo === "metal" ? c.metal.aco : (c.aco || "ASTM A572 Gr.50"), massa: massa, area: num(c.area, s.perimetro * mb.L), soldadaEm: c.metal ? c.metal.soldadaEm || null : null,
             solda: c.metal ? c.metal.solda || null : null, ifc: c.ifc, marcaAtual: c.marca || "", nome: c.metal ? M().nome(c) : (c.tipo === "pilar" ? "Pilar " : "Viga ") + c.id };
  }
  function chapaFab(c) {
    var m = c.metal, C = M().pol.uv(m.contorno).map(function (q) { return [mm(q[0]), mm(q[1])]; });
    var furos = arr(m.furos).map(function (f) { var h = { x: mm(f.u), y: mm(f.v), d: num(f.d, 0), l: num(f.l, num(f.d, 0)), db: num(f.db, 0), tipo: f.tipo || "padrao" }; if (f.ang != null) h.ang = num(f.ang, 0); return h; });
    furos.sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    var rec = arr(m.recortes).map(function (r) { return M().pol.uv(r.pts).map(function (q) { return [mm(q[0]), mm(q[1])]; }); });
    var xs = C.map(function (q) { return q[0]; }), ys = C.map(function (q) { return q[1]; });
    return { id: c.id, kind: "chapa", papel: m.papel, t: mm(m.t), contorno: C, furos: furos, recortes: rec, aco: m.aco, massa: num(c.massa, 0), area: num(c.area, 0),
             L: r1(Math.max.apply(null, xs) - Math.min.apply(null, xs)), B: r1(Math.max.apply(null, ys) - Math.min.apply(null, ys)), areaLiq: num(m.dim && m.dim.areaLiq, 0),
             soldadaEm: m.soldadaEm || null, solda: m.solda || null, ifc: c.ifc, marcaAtual: c.marca || "", nome: M().nome(c), borda: m.borda || "laminada" };
  }
  function pecasFab(estado) {
    var pecas = [], parafusos = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c) return;
      if (c.tipo === "metal" && c.metal) {
        var k = c.metal.kind;
        if (k === "chapa") pecas.push(chapaFab(c));
        else if (k === "perfil") { var pf = perfilFab(c); if (pf) pecas.push(pf); }
        else if (k === "parafuso") parafusos.push({ id: c.id, papel: c.metal.papel, idP: c.metal.id, Lmm: c.metal.Lmm, classe: c.metal.classe, sistema: c.metal.sistema, arruelas: num(c.metal.arrCabeca, 0) + num(c.metal.arrPorca, 0), porcas: 1, massa: num(c.massa, 0), lig: c.metal.lig || "" });
        else if (k === "mecanica") pecas.push({ id: c.id, kind: "mec", papel: c.metal.papel, tipoMec: c.metal.tipoMec, D: mm(c.metal.D), d: mm(c.metal.d), L: mm(c.metal.L), aco: c.metal.aco, massa: num(c.massa, 0), area: num(c.area, 0), soldadaEm: c.metal.soldadaEm || null, ifc: c.ifc, marcaAtual: c.marca || "", nome: M().nome(c) });
      } else if (ehAcoArq(c)) { var pa = perfilFab(c); if (pa) pecas.push(pa); }
    });
    return { pecas: pecas, parafusos: parafusos };
  }

  /* ======================================================= ASSINATURA
   * o que faz duas peças serem a MESMA peça na fábrica (tolerância 0,5 mm) */
  function q5(v) { return Math.round(num(v, 0) * 2) / 2; }
  /* a MESMA barra descrita de outro jeito: as rotações de 180° que levam a seção nela mesma
     (I e tubo: em volta do eixo, da altura e da largura; U: só em volta da largura — a alma
     continua do mesmo lado; L de abas iguais: troca as abas, de ponta-cabeça). Cada uma
     muda o x, o y da face, troca face e o sinal dos ângulos de corte. */
  function variantes(p) {
    var f = p.perfil.forma, h = p.dims.h, b = p.dims.b, L = p.L, V0 = [{ x: false, face: {}, y: {}, ct: [0, 1, 2, 3], sg: [1, 1, 1, 1] }];
    var rA = { x: true, face: { o: "u", u: "o" }, y: { v: h }, ct: [1, 0, 3, 2], sg: [1, 1, -1, -1] };      /* em volta da largura (A) */
    var tubo = f === "tubo-ret", rB = { x: true, face: tubo ? { v: "h", h: "v" } : {}, y: { o: b, u: b }, ct: [1, 0, 3, 2], sg: [-1, -1, 1, 1] }; /* em volta da altura (B) */
    var rX = { x: false, face: tubo ? { o: "u", u: "o", v: "h", h: "v" } : { o: "u", u: "o" }, y: { o: b, u: b, v: h, h: h }, ct: [0, 1, 2, 3], sg: [-1, -1, -1, -1] };   /* em volta do eixo */
    if (f === "I" || f === "tubo-ret" || f === "ret" || f === "circ" || f === "tubo-circ") return V0.concat([rA, rB, rX]);
    if (f === "U") return V0.concat([rA]);
    if (f === "L" && Math.abs(h - b) < 0.05) return V0.concat([{ x: true, face: { v: "u", u: "v" }, y: {}, ct: [1, 0, 3, 2], sg: [1, 1, 1, 1], troca: true }]);
    return V0;
  }
  function assinaturaPerfil(p, vt) {
    var L = p.L, ct = p.cortes, c0 = [ct.almaIni, ct.almaFim, ct.abaIni, ct.abaFim];
    var fs = p.furos.map(function (f) {
      var x = vt.x ? L - f.x : f.x, face = vt.face[f.face] || f.face, y = vt.y[f.face] != null ? vt.y[f.face] - f.y : f.y;
      return face + q5(x) + "," + q5(y) + "," + q5(f.d) + "," + q5(f.l);
    }).sort();
    var cc = vt.ct.map(function (i, k) { var g = c0[vt.troca ? (i < 2 ? i + 2 : i - 2) : i] * vt.sg[k]; return Math.round(g * 10) / 10; });
    return ["P", p.nomePerfil, q5(L), cc.join("/"), p.aco, fs.join(";")].join("|");
  }
  function canonChapa(C, furos, rec) {
    /* 8 posições (4 giros × espelho); cada uma levada para a origem; vale a menor como texto */
    var melhor = null;
    for (var e = 0; e < 2; e++) for (var g = 0; g < 4; g++) {
      var tf = function (q) { var x = e ? -q[0] : q[0], y = q[1]; for (var k = 0; k < g; k++) { var t = x; x = -y; y = t; } return [x, y]; };
      var Ct = C.map(tf), xs = Ct.map(function (q) { return q[0]; }), ys = Ct.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      var pts = Ct.map(function (q) { return q5(q[0] - x0) + "," + q5(q[1] - y0); }).sort();
      var hs = furos.map(function (f) { var q = tf([f.x, f.y]); return q5(q[0] - x0) + "," + q5(q[1] - y0) + "," + q5(f.d) + "," + q5(f.l); }).sort();
      var rs = rec.map(function (r) { return r.map(function (q) { var w = tf(q); return q5(w[0] - x0) + "," + q5(w[1] - y0); }).sort().join(" "); }).sort();
      var s = pts.join(" ") + "#" + hs.join(";") + "#" + rs.join("/");
      if (melhor === null || s < melhor) melhor = s;
    }
    return melhor;
  }
  function assinatura(p) {
    if (p.kind === "perfil") return variantes(p).map(function (vt) { return assinaturaPerfil(p, vt); }).sort()[0];
    if (p.kind === "chapa") return ["CH", q5(p.t), p.aco, canonChapa(p.contorno, p.furos, p.recortes)].join("|");
    return ["M", p.tipoMec, q5(p.D), q5(p.d), q5(p.L), p.aco].join("|");
  }

  /* ========================================================= NUMERAR */
  var PREF = { perfil: "P", chapa: "CH", mec: "M" };
  function numerar(estado, opts) {
    opts = opts || {};
    var pf = pecasFab(estado), grupos = {}, ordem = [];
    pf.pecas.forEach(function (p) { var s = assinatura(p); p.assin = s; if (!grupos[s]) { grupos[s] = { assin: s, kind: p.kind, ids: [], rep: p }; ordem.push(s); } grupos[s].ids.push(p.id); });
    /* ordem: tipo; perfil/espessura; maior primeiro; depois a assinatura (texto) — o mesmo modelo, a mesma ordem */
    var K = { perfil: 0, chapa: 1, mec: 2 };
    ordem.sort(function (a, b) {
      var A = grupos[a], B = grupos[b];
      if (K[A.kind] !== K[B.kind]) return K[A.kind] - K[B.kind];
      var ka = A.kind === "perfil" ? A.rep.nomePerfil : (A.kind === "chapa" ? ("000000" + Math.round(A.rep.t * 10)).slice(-6) : A.rep.tipoMec), kb = B.kind === "perfil" ? B.rep.nomePerfil : (B.kind === "chapa" ? ("000000" + Math.round(B.rep.t * 10)).slice(-6) : B.rep.tipoMec);
      if (ka !== kb) return ka < kb ? -1 : 1;
      var la = num(A.rep.L, 0) * (A.rep.B || 1), lb = num(B.rep.L, 0) * (B.rep.B || 1);
      if (la !== lb) return lb - la;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var cont = { perfil: 0, chapa: 0, mec: 0 }, marcaDe = {}, lista = [];
    ordem.forEach(function (s) {
      var g = grupos[s]; cont[g.kind]++; g.marca = (opts.prefixos && opts.prefixos[g.kind] || PREF[g.kind]) + cont[g.kind];
      g.ids.forEach(function (id) { marcaDe[id] = g.marca; });
      lista.push(g);
    });
    /* CONJUNTOS: a raiz de cada peça segue o "soldada em" até uma peça solta */
    var porId = {}; pf.pecas.forEach(function (p) { porId[p.id] = p; });
    function raiz(p, n) { if (!p || n > 20) return p; var s = p.soldadaEm; return s != null && porId[s] ? raiz(porId[s], n + 1) : p; }
    var cj = {}, ordC = [];
    pf.pecas.forEach(function (p) { var r = raiz(p, 0); if (!cj[r.id]) { cj[r.id] = { principal: r.id, ids: [] }; ordC.push(r.id); } cj[r.id].ids.push(p.id); });
    var gC = {}, ordG = [];
    ordC.forEach(function (rid) {
      var c = cj[rid], partes = c.ids.filter(function (id) { return id !== rid; }).map(function (id) { return marcaDe[id]; }).sort();
      var s = marcaDe[rid] + "<" + partes.join(",");
      if (!gC[s]) { gC[s] = { assin: s, principal: marcaDe[rid], partes: partes, conjuntos: [], massa: 0 }; ordG.push(s); }
      var m = 0; c.ids.forEach(function (id) { m += num(porId[id].massa, 0); });
      gC[s].massa = m; gC[s].conjuntos.push({ principal: rid, ids: c.ids });
    });
    ordG.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    var conjuntoDe = {}, conjuntos = [];
    ordG.forEach(function (s, i) {
      var g = gC[s]; g.marca = "A" + (i + 1);
      g.conjuntos.forEach(function (k) { k.ids.forEach(function (id) { conjuntoDe[id] = g.marca; }); });
      conjuntos.push(g);
    });
    return { grupos: lista, marcaDe: marcaDe, conjuntos: conjuntos, conjuntoDe: conjuntoDe, pecas: pf.pecas, parafusos: pf.parafusos };
  }
  function opNumerar(estado) {
    var n = numerar(estado), marcas = {};
    Object.keys(n.marcaDe).forEach(function (id) { marcas[id] = n.marcaDe[id]; });
    return Object.keys(marcas).length ? { op: "marcar", marcas: marcas } : null;
  }

  /* ============================================================ DSTV NC1 */
  function lin(v) { return "  " + v; }
  function fx(v) { var s = f2(v); while (s.length < 10) s = " " + s; return s; }
  function linhaPonto(face, x, y, extra) { return "  " + face + fx(x) + " " + fx(y) + (extra || ""); }
  function dstv(p, info) {
    info = info || {};
    var L = [], marca = info.marca || p.marcaAtual || ("ID" + p.id), qtd = Math.max(1, Math.round(num(info.qtd, 1)));
    L.push("ST");
    L.push("** " + marca + ".nc1 — OrçaPRO Modela (DSTV NC1, 7ª ed. jul/1998)".replace(/[^\x20-\x7e]/g, function (c) { return { "ç": "c", "Ç": "C", "—": "-", "ª": "a" }[c] || "?"; }));
    L.push(lin(info.pedido || "1")); L.push(lin(info.desenho || marca)); L.push(lin(info.fase || "1")); L.push(lin(marca));
    L.push(lin(ascii(p.aco || "")));
    L.push(lin(qtd));
    if (p.kind === "chapa") {
      L.push(lin("PL" + r1(p.t) + "*" + Math.round(p.B))); L.push(lin("B"));
      [p.L, p.B, p.t, p.t, p.t, 0].forEach(function (v) { L.push(lin(f2(v))); });
      L.push(lin(f2(7850 * p.t / 1000 * p.B / 1000))); L.push(lin(f2(2 * p.B / 1000)));
      [0, 0, 0, 0].forEach(function (v) { L.push(lin(f2(v))); });
    } else {
      var d = p.dims, ct = p.cortes;
      L.push(lin(ascii(p.nomePerfil))); L.push(lin(p.codigo));
      [p.L, d.h, d.b, d.tf, d.tw, d.r].forEach(function (v) { L.push(lin(f2(v))); });
      L.push(lin(f2(p.kgm))); L.push(lin(f2(p.m2m)));
      [ct.almaIni, ct.almaFim, ct.abaIni, ct.abaFim].forEach(function (v) { L.push(lin(f2(v))); });
    }
    L.push(lin(ascii(info.texto1 || p.papel || ""))); L.push(lin(ascii(info.texto2 || ""))); L.push(lin(ascii(info.texto3 || ""))); L.push(lin(ascii(info.texto4 || "")));
    /* contorno externo e furos */
    var faces = p.kind === "chapa" ? [{ face: "v", poli: p.contorno }] : contornosFaces(p);
    if (faces.length) {
      L.push("AK");
      faces.forEach(function (fc) {
        var pts = semRepetidos(fc.poli);
        pts.concat([pts[0]]).forEach(function (q) { L.push(linhaPonto(fc.face, q[0], q[1], " " + fx(0))); });
      });
    }
    if (p.kind === "chapa" && p.recortes.length) {
      L.push("IK");
      p.recortes.forEach(function (r) { var pts = semRepetidos(r); pts.concat([pts[0]]).forEach(function (q) { L.push(linhaPonto("v", q[0], q[1], " " + fx(0))); }); });
    }
    var fs = p.kind === "chapa" ? p.furos.map(function (f) { var h = JSON.parse(JSON.stringify(f)); h.face = "v"; return h; }) : p.furos;
    if (fs.length) {
      L.push("BO");
      fs.forEach(function (f) {
        var ext = " " + fx(f.d) + " " + fx(0);
        if (num(f.l, f.d) > num(f.d, 0) + 0.05) ext += "l" + fx(num(f.l, 0) - num(f.d, 0)) + " " + fx(0) + " " + fx(num(f.ang, 0));   /* oblongo — PARTIDA, conferir no pós-processador */
        L.push(linhaPonto(f.face, f.x, f.y, ext));
      });
    }
    /* marcação: na alma (perfil) ou na chapa, perto da origem */
    L.push("SI");
    var sx = p.kind === "chapa" ? Math.min(30, p.L / 4) : Math.min(100, p.L / 4), sy = p.kind === "chapa" ? Math.min(20, p.B / 4) : (p.dims ? p.dims.h / 2 : 20);
    L.push(linhaPonto("v", sx, sy, " " + fx(0) + " 10 " + ascii(marca)));
    L.push("EN");
    return L.join("\r\n") + "\r\n";
  }
  function ascii(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?") : txt(s).replace(/[^\x20-\x7e]/g, "?"); }
  function semRepetidos(pts) {
    var o = [];
    pts.forEach(function (q) { var a = [r2(q[0]), r2(q[1])]; if (!o.length || Math.abs(o[o.length - 1][0] - a[0]) > 0.005 || Math.abs(o[o.length - 1][1] - a[1]) > 0.005) o.push(a); });
    while (o.length > 1 && Math.abs(o[0][0] - o[o.length - 1][0]) < 0.005 && Math.abs(o[0][1] - o[o.length - 1][1]) < 0.005) o.pop();
    return o;
  }
  /* o contorno de cada face planificada (x ao longo da barra, y na face), com o corte inclinado */
  function contornosFaces(p) {
    var d = p.dims, ct = p.cortes, tg = function (g) { return Math.tan(num(g, 0) * Math.PI / 180); }, L = p.L, out = [];
    var fsP = M().faces(p.perfil);
    fsP.forEach(function (fc) {
      var larg = mm(fc.larg), y0m = mm(fc.y0), meio = mm(fc.meio);
      /* posição (a, b) da seção em cada ponta da face → x do corte */
      function xc(y, fim) {
        var ab = fc.eixoY === "b" ? { a: meio, b: y + y0m } : { a: y + y0m, b: meio };
        return (fim ? L + tg(ct.almaFim) * ab.b + tg(ct.abaFim) * ab.a : tg(ct.almaIni) * ab.b + tg(ct.abaIni) * ab.a);
      }
      out.push({ face: fc.face, poli: [[xc(0, false), 0], [xc(0, true), 0], [xc(larg, true), larg], [xc(larg, false), larg]] });
    });
    void d;
    return out;
  }
  /* LEITOR DSTV (o teste lê o que o escritor escreveu; serve para conferir arquivo de terceiro) */
  var CAMPOS_ST = ["pedido", "desenho", "fase", "peca", "aco", "quantidade", "perfil", "codigo", "comprimento", "altura", "larguraAba", "espAba", "espAlma", "raio", "kgm", "m2m",
                   "corteAlmaIni", "corteAlmaFim", "corteAbaIni", "corteAbaFim", "texto1", "texto2", "texto3", "texto4"];
  function lerDstv(texto) {
    var ls = txt(texto).split(/\r?\n/), bloco = null, cab = [], blocos = {}, erros = [], ordem = [];
    ls.forEach(function (l, i) {
      if (/^\*\*/.test(l)) return;
      if (bloco === "ST" && /^\s/.test(l)) { cab.push(l.trim()); return; }   /* campo de texto vazio também é campo */
      if (!l.trim()) return;
      var m = /^([A-Z]{2})\s*$/.exec(l);
      if (m) { bloco = m[1]; if (bloco !== "ST" && bloco !== "EN") { blocos[bloco] = blocos[bloco] || []; ordem.push(bloco); } return; }
      if (!/^\s/.test(l)) { erros.push("linha " + (i + 1) + ": fora de bloco: " + l); return; }
      if (bloco === "ST") { cab.push(l.trim()); return; }
      if (!bloco || bloco === "EN") { erros.push("linha " + (i + 1) + ": dado depois do EN"); return; }
      var tk = l.trim().split(/\s+/), face = tk.shift();
      if (!/^[ouvh]$/.test(face)) { erros.push("linha " + (i + 1) + ": face inválida " + face); return; }
      var nums = [], marcas = [];
      tk.forEach(function (t) { var mm2 = /^(-?\d+(?:\.\d+)?)([a-z]?)$/.exec(t); if (mm2) { nums.push(Number(mm2[1])); marcas.push(mm2[2]); } else nums.push(t); });
      var reg = { face: face, x: nums[0], y: nums[1] };
      if (bloco === "BO") { reg.d = nums[2]; reg.prof = nums[3]; if (marcas[3] === "l") { reg.oblongo = { ext: nums[4], larg: nums[5], ang: nums[6] }; } }
      else if (bloco === "AK" || bloco === "IK") reg.raio = nums[2];
      else if (bloco === "SI") { reg.ang = nums[2]; reg.alt = nums[3]; reg.texto = tk.slice(4).join(" "); }
      blocos[bloco].push(reg);
    });
    var c = {};
    CAMPOS_ST.forEach(function (k, i) { var v = cab[i]; c[k] = v == null ? null : (/^(comprimento|altura|larguraAba|espAba|espAlma|raio|kgm|m2m|corte)/.test(k) || k === "quantidade" ? Number(v) : v); });
    if (cab.length < 24) erros.push("cabeçalho ST com " + cab.length + " linhas (são 24)");
    if (!/\bEN\s*$/m.test(txt(texto))) erros.push("sem o bloco EN");
    /* contorno fechado e sem ponto repetido no meio */
    ["AK", "IK"].forEach(function (b) {
      var porFace = {}; arr(blocos[b]).forEach(function (r) { (porFace[r.face] = porFace[r.face] || []).push(r); });
      Object.keys(porFace).forEach(function (f) {
        var p = porFace[f]; if (p.length < 4) { erros.push(b + " face " + f + ": contorno com menos de 3 pontos"); return; }
      });
    });
    return { ok: !erros.length, cabecalho: c, blocos: blocos, ordem: ordem, erros: erros };
  }

  /* ============================================================ DXF (corte) */
  function dxfNum(v) { var n = Math.round(num(v, 0) * 1e4) / 1e4; return String(Math.abs(n) < 1e-9 ? 0 : n); }
  function DxfDoc() { this.e = []; this.ext = [Infinity, Infinity, -Infinity, -Infinity]; }
  DxfDoc.prototype.pt = function (x, y) { if (x < this.ext[0]) this.ext[0] = x; if (y < this.ext[1]) this.ext[1] = y; if (x > this.ext[2]) this.ext[2] = x; if (y > this.ext[3]) this.ext[3] = y; };
  DxfDoc.prototype.poli = function (camada, pts, bulges) {
    var self = this, e = ["0", "POLYLINE", "8", camada, "66", "1", "10", "0", "20", "0", "30", "0", "70", "1"];
    pts.forEach(function (q, i) { self.pt(q[0], q[1]); e.push("0", "VERTEX", "8", camada, "10", dxfNum(q[0]), "20", dxfNum(q[1]), "30", "0"); if (bulges && bulges[i]) e.push("42", dxfNum(bulges[i])); });
    e.push("0", "SEQEND", "8", camada);
    this.e.push(e.join("\n"));
  };
  DxfDoc.prototype.circulo = function (camada, x, y, r) { this.pt(x - r, y - r); this.pt(x + r, y + r); this.e.push(["0", "CIRCLE", "8", camada, "10", dxfNum(x), "20", dxfNum(y), "30", "0", "40", dxfNum(r)].join("\n")); };
  DxfDoc.prototype.texto = function (camada, x, y, h, t) { this.e.push(["0", "TEXT", "8", camada, "10", dxfNum(x), "20", dxfNum(y), "30", "0", "40", dxfNum(h), "1", ascii(t)].join("\n")); };
  DxfDoc.prototype.escrever = function (camadas) {
    var ext = this.ext[0] === Infinity ? [0, 0, 0, 0] : this.ext;
    var H = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSBASE", "10", "0", "20", "0", "30", "0",
             "9", "$EXTMIN", "10", dxfNum(ext[0]), "20", dxfNum(ext[1]), "30", "0", "9", "$EXTMAX", "10", dxfNum(ext[2]), "20", dxfNum(ext[3]), "30", "0", "0", "ENDSEC"];
    var T = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(camadas.length)];
    camadas.forEach(function (c) { T.push("0", "LAYER", "2", c[0], "70", "0", "62", String(c[1]), "6", "CONTINUOUS"); });
    T.push("0", "ENDTAB", "0", "ENDSEC");
    return H.concat(T).concat(["0", "SECTION", "2", "ENTITIES"]).join("\n") + "\n" + this.e.join("\n") + "\n0\nENDSEC\n0\nEOF\n";
  };
  var CAMADAS_DXF = [["CUT_OUTSIDE", 7], ["CUT_INSIDE", 1], ["ETCH", 3], ["CHAPA_PADRAO", 8]];
  /* oblongo com arco (bulge 1 = meia-volta) */
  function oblongoDxf(f) {
    var w = num(f.d, 0), l = num(f.l, w), r = w / 2, h = (l - w) / 2, a = num(f.ang, 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var P = [[h, -r], [h, r], [-h, r], [-h, -r]].map(function (q) { return [f.x + q[0] * ca - q[1] * sa, f.y + q[0] * sa + q[1] * ca]; });
    return { pts: P, bulges: [1, 0, 1, 0] };
  }
  function desenharChapa(doc, p, dx, dy, girar, marca) {
    function T(q) { var x = q[0], y = q[1]; if (girar) { var t = x; x = -y; y = t; } return [x + dx, y + dy]; }
    doc.poli("CUT_OUTSIDE", semRepetidos(p.contorno).map(T));
    p.furos.forEach(function (f) {
      if (num(f.l, f.d) > num(f.d, 0) + 0.05) { var ob = oblongoDxf(f); doc.poli("CUT_INSIDE", ob.pts.map(T), ob.bulges); }
      else { var c = T([f.x, f.y]); doc.circulo("CUT_INSIDE", c[0], c[1], num(f.d, 0) / 2); }
    });
    p.recortes.forEach(function (r) { doc.poli("CUT_INSIDE", semRepetidos(r).map(T)); });
    /* a marca gravada perto do canto (dentro da chapa, fora dos furos) */
    var pos = T([Math.min(15, p.L / 5), Math.min(10, p.B / 5)]);
    doc.texto("ETCH", pos[0], pos[1], Math.max(4, Math.min(10, Math.min(p.L, p.B) / 8)), marca || p.marcaAtual || ("ID" + p.id));
  }
  function dxfChapa(p, marca) { var d = new DxfDoc(); desenharChapa(d, p, 0, 0, false, marca); return d.escrever(CAMADAS_DXF.slice(0, 3)); }
  /* NESTING SIMPLES (prateleiras): mesma espessura e aço numa chapa padrão (L × B, partida 3000 × 1200 mm, editável),
     folga entre peças (partida 10 mm); gira 90° quando a peça cabe melhor deitada. Não é otimização: é o
     aproveitamento de partida para orçar e cortar lote pequeno. */
  function nesting(itens, o) {
    o = o || {};
    var CL = num(o.L, 3000), CB = num(o.B, 1200), folga = num(o.folga, 10), borda = num(o.borda, 10);
    var lista = [];
    itens.forEach(function (it) { for (var k = 0; k < Math.max(1, Math.round(num(it.qtd, 1))); k++) lista.push({ p: it.p, marca: it.marca }); });
    lista.forEach(function (x) { var w = x.p.L, h = x.p.B; x.gira = h > w && w <= CB - 2 * borda; x.w = x.gira ? h : w; x.h = x.gira ? w : h; });
    lista.sort(function (a, b) { return (b.h - a.h) || (b.w - a.w) || (a.marca < b.marca ? -1 : 1); });
    var chapas = [], fora = [];
    function nova() { var c = { prat: [], pecas: [] }; chapas.push(c); return c; }
    lista.forEach(function (x) {
      if (x.w > CL - 2 * borda || x.h > CB - 2 * borda) { fora.push(x.marca); return; }
      var feito = false;
      for (var i = 0; i < chapas.length && !feito; i++) {
        var c = chapas[i];
        for (var j = 0; j < c.prat.length && !feito; j++) { var pr = c.prat[j]; if (x.h <= pr.h + 1e-6 && pr.x + x.w <= CL - borda + 1e-6) { c.pecas.push({ x: pr.x, y: pr.y, it: x }); pr.x += x.w + folga; feito = true; } }
        if (!feito) { var yN = c.prat.length ? c.prat[c.prat.length - 1].y + c.prat[c.prat.length - 1].h + folga : borda; if (yN + x.h <= CB - borda + 1e-6) { var pr2 = { y: yN, h: x.h, x: borda }; c.prat.push(pr2); c.pecas.push({ x: pr2.x, y: pr2.y, it: x }); pr2.x += x.w + folga; feito = true; } }
      }
      if (!feito) { var c2 = nova(); var pr3 = { y: borda, h: x.h, x: borda }; c2.prat.push(pr3); c2.pecas.push({ x: pr3.x, y: pr3.y, it: x }); pr3.x += x.w + folga; }
    });
    var doc = new DxfDoc(), areaPecas = 0;
    chapas.forEach(function (c, i) {
      var ox = i * (CL + 200);
      doc.poli("CHAPA_PADRAO", [[ox, 0], [ox + CL, 0], [ox + CL, CB], [ox, CB]]);
      c.pecas.forEach(function (pc) {
        var p = pc.it.p, xs = p.contorno.map(function (q) { return q[0]; }), ys = p.contorno.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        /* girar 90°: (x, y) → (−y, x); o canto da peça vai para (pc.x, pc.y) */
        if (pc.it.gira) desenharChapa(doc, p, ox + pc.x + (Math.max.apply(null, ys)), pc.y - x0, true, pc.it.marca);
        else desenharChapa(doc, p, ox + pc.x - x0, pc.y - y0, false, pc.it.marca);
        areaPecas += num(p.areaLiq, 0) > 0 ? p.areaLiq * 1e6 : p.L * p.B;
      });
    });
    var areaChapas = chapas.length * CL * CB;
    return { chapas: chapas.length, pecas: lista.length - fora.length, fora: fora, aproveitamento: areaChapas ? r1(100 * areaPecas / areaChapas) : 0, chapaPadrao: [CL, CB],
             texto: doc.escrever(CAMADAS_DXF) };
  }

  /* =============================================================== LISTAS */
  function descricao(p) {
    if (p.kind === "perfil") return p.nomePerfil + " × " + Math.round(p.L) + " mm";
    if (p.kind === "chapa") return "Chapa #" + br(p.t, 1) + " × " + Math.round(p.L) + " × " + Math.round(p.B) + " mm";
    return p.papel + " Ø" + br(p.D, 1) + (p.d ? "/Ø" + br(p.d, 1) : "") + " × " + Math.round(p.L) + " mm";
  }
  function listas(estado, num0) {
    var n = num0 || numerar(estado), porId = {}; n.pecas.forEach(function (p) { porId[p.id] = p; });
    var PS = Peso();
    function pesoKg(p) {
      /* o MESMO número do js/bimpeso.js (a massa do quantitativo da peça): o içamento parte dele */
      if (PS && PS.pesoDe) { var r = PS.pesoDe({ tipo: p.ifc || "IFCPLATE", nome: p.nome, qto: { massa: p.massa } }, {}); if (r && r.ok) return r.kg; }
      return num(p.massa, 0);
    }
    var pecas = n.grupos.map(function (g) {
      var p = g.rep, kg = pesoKg(p), area = num(p.area, 0);
      return { marca: g.marca, tipo: p.kind === "perfil" ? "Perfil" : (p.kind === "chapa" ? "Chapa" : "Mecânica"), papel: p.papel, descricao: descricao(p), perfil: p.kind === "perfil" ? p.nomePerfil : (p.kind === "chapa" ? "Chapa " + br(p.t, 1) + " mm" : p.tipoMec),
               comprimento: Math.round(num(p.L, 0)), quantidade: g.ids.length, aco: p.aco, pesoUnit: r2(kg), pesoTotal: r2(kg * g.ids.length), pinturaUnit: r3(area), pinturaTotal: r3(area * g.ids.length), furos: arr(p.furos).length, conjunto: n.conjuntoDe[g.ids[0]] || "" };
    });
    var conjuntos = n.conjuntos.map(function (c) {
      var rep = c.conjuntos[0], kg = 0, area = 0;
      rep.ids.forEach(function (id) { kg += pesoKg(porId[id]); area += num(porId[id].area, 0); });
      var cnt = {}; c.partes.forEach(function (m) { cnt[m] = (cnt[m] || 0) + 1; });
      return { marca: c.marca, principal: c.principal, descricao: descricao(porId[rep.principal]), partes: Object.keys(cnt).sort().map(function (m) { return cnt[m] + "× " + m; }).join(", "), quantidade: c.conjuntos.length,
               pesoUnit: r2(kg), pesoTotal: r2(kg * c.conjuntos.length), pinturaTotal: r3(area * c.conjuntos.length), ids: c.conjuntos.map(function (k) { return k.principal; }) };
    });
    /* PARAFUSOS por tipo × diâmetro × comprimento × classe (+ porcas e arruelas) */
    var pg = {};
    n.parafusos.forEach(function (b) {
      var k = b.papel + "|" + b.idP + "|" + b.Lmm + "|" + b.classe;
      if (!pg[k]) pg[k] = { tipo: b.papel, diametro: b.idP, comprimento: b.Lmm, classe: b.classe, norma: ((N() && N().CLASSES[b.classe]) || {}).norma || b.classe, quantidade: 0, porcas: 0, arruelas: 0, pesoTotal: 0 };
      pg[k].quantidade++; pg[k].porcas += b.porcas; pg[k].arruelas += b.arruelas; pg[k].pesoTotal += b.massa;
    });
    /* tirante: barra rosqueada nas pontas — 2 porcas e 2 arruelas por ponta (valor de partida) */
    n.pecas.filter(function (p) { return p.papel === "Tirante"; }).forEach(function (p) {
      var d = Math.round(p.dims.h * 10) / 10, k = "Tirante|" + d;
      if (!pg[k]) pg[k] = { tipo: "Porca e arruela do tirante", diametro: "Ø" + br(d, 1) + " mm", comprimento: "", classe: "", norma: "2 porcas e 2 arruelas por ponta (valor de partida)", quantidade: 0, porcas: 0, arruelas: 0, pesoTotal: 0 };
      pg[k].porcas += 4; pg[k].arruelas += 4;
    });
    var parafusos = Object.keys(pg).sort().map(function (k) { var x = pg[k]; x.pesoTotal = r2(x.pesoTotal); return x; });
    /* CHAPAS por espessura × aço */
    var cg = {};
    n.pecas.filter(function (p) { return p.kind === "chapa"; }).forEach(function (p) {
      var k = ("000000" + Math.round(p.t * 10)).slice(-6) + "|" + p.aco;
      if (!cg[k]) cg[k] = { espessura: p.t, aco: p.aco, pecas: 0, area: 0, peso: 0, marcas: [] };
      cg[k].pecas++; cg[k].area += num(p.areaLiq, 0) > 0 ? p.areaLiq : p.L * p.B / 1e6; cg[k].peso += pesoKg(p);
      var mk = n.marcaDe[p.id]; if (cg[k].marcas.indexOf(mk) < 0) cg[k].marcas.push(mk);
    });
    var chapas = Object.keys(cg).sort().map(function (k) { var x = cg[k]; x.area = r3(x.area); x.peso = r2(x.peso); x.marcas = x.marcas.sort().join(", "); return x; });
    /* RESUMO por material */
    var rm = {};
    n.pecas.forEach(function (p) { var k = (p.kind === "perfil" ? "Perfis" : (p.kind === "chapa" ? "Chapas" : "Peças mecânicas")) + " — " + p.aco; rm[k] = rm[k] || { material: k, peso: 0, pecas: 0, pintura: 0 }; rm[k].peso += pesoKg(p); rm[k].pecas++; rm[k].pintura += num(p.area, 0); });
    var pesoPar = 0; n.parafusos.forEach(function (b) { pesoPar += b.massa; });
    if (n.parafusos.length) rm.par = { material: "Parafusos, porcas e arruelas (massa pela geometria — estimada)", peso: pesoPar, pecas: n.parafusos.length, pintura: 0 };
    var resumo = Object.keys(rm).sort().map(function (k) { var x = rm[k]; x.peso = r2(x.peso); x.pintura = r3(x.pintura); return x; });
    var tot = { peso: 0, pecas: 0, pintura: 0, parafusos: n.parafusos.length };
    resumo.forEach(function (x) { tot.peso += x.peso; tot.pintura += x.pintura; if (x !== rm.par) tot.pecas += x.pecas; });
    tot.peso = r2(tot.peso); tot.pintura = r3(tot.pintura); tot.kN = r2(tot.peso * 9.80665 / 1000);
    return { pecas: pecas, conjuntos: conjuntos, parafusos: parafusos, chapas: chapas, resumo: resumo, totais: tot, numeracao: n };
  }

  /* ExcelJS (js/vendor/exceljs.min.js): uma aba por lista, cabeçalho em negrito, total no pé */
  function xlsx(L, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    function aba(nome, cols, linhas, totais) {
      var ws = wb.addWorksheet(nome);
      ws.columns = cols.map(function (c) { return { header: c[1], key: c[0], width: c[2] || 14 }; });
      linhas.forEach(function (l) { ws.addRow(l); });
      ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE5EE" } };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      if (totais) { var r = ws.addRow(totais); r.font = { bold: true }; }
      cols.forEach(function (c, i) { if (c[3]) ws.getColumn(i + 1).numFmt = c[3]; });
      return ws;
    }
    var somaP = 0; L.pecas.forEach(function (p) { somaP += p.pesoTotal; });
    aba("Peças", [["marca", "Marca", 8], ["tipo", "Tipo", 10], ["papel", "Função", 24], ["perfil", "Perfil / chapa", 22], ["comprimento", "Comprimento (mm)", 16, "0"], ["quantidade", "Qtd", 6, "0"], ["aco", "Aço", 18],
      ["pesoUnit", "Peso unit. (kg)", 14, "#,##0.00"], ["pesoTotal", "Peso total (kg)", 14, "#,##0.00"], ["pinturaUnit", "Pintura unit. (m²)", 16, "#,##0.000"], ["pinturaTotal", "Pintura total (m²)", 16, "#,##0.000"], ["furos", "Furos", 7], ["conjunto", "Conjunto", 10]],
      L.pecas, { marca: "TOTAL", pesoTotal: r2(somaP), pinturaTotal: r3(L.pecas.reduce(function (s, p) { return s + p.pinturaTotal; }, 0)) });
    aba("Conjuntos", [["marca", "Conjunto", 10], ["principal", "Peça principal", 14], ["descricao", "Descrição", 30], ["partes", "Partes soldadas", 34], ["quantidade", "Qtd", 6, "0"], ["pesoUnit", "Peso unit. (kg)", 14, "#,##0.00"], ["pesoTotal", "Peso total (kg)", 14, "#,##0.00"], ["pinturaTotal", "Pintura (m²)", 14, "#,##0.000"]],
      L.conjuntos.map(function (c) { var o = {}; Object.keys(c).forEach(function (k) { if (k !== "ids") o[k] = c[k]; }); return o; }), { marca: "TOTAL", pesoTotal: r2(L.conjuntos.reduce(function (s, c) { return s + c.pesoTotal; }, 0)) });
    aba("Parafusos", [["tipo", "Tipo", 22], ["diametro", "Diâmetro", 10], ["comprimento", "Comprimento (mm)", 16], ["classe", "Classe", 10], ["norma", "Norma", 36], ["quantidade", "Qtd", 7, "0"], ["porcas", "Porcas", 8, "0"], ["arruelas", "Arruelas", 9, "0"], ["pesoTotal", "Peso (kg, estimado)", 16, "#,##0.00"]],
      L.parafusos, { tipo: "TOTAL", quantidade: L.parafusos.reduce(function (s, p) { return s + p.quantidade; }, 0), porcas: L.parafusos.reduce(function (s, p) { return s + p.porcas; }, 0), arruelas: L.parafusos.reduce(function (s, p) { return s + p.arruelas; }, 0) });
    aba("Chapas", [["espessura", "Espessura (mm)", 14, "0.0"], ["aco", "Aço", 16], ["pecas", "Peças", 8, "0"], ["area", "Área líquida (m²)", 16, "#,##0.000"], ["peso", "Peso (kg)", 12, "#,##0.00"], ["marcas", "Marcas", 40]], L.chapas,
      { aco: "TOTAL", pecas: L.chapas.reduce(function (s, c) { return s + c.pecas; }, 0), area: r3(L.chapas.reduce(function (s, c) { return s + c.area; }, 0)), peso: r2(L.chapas.reduce(function (s, c) { return s + c.peso; }, 0)) });
    aba("Resumo", [["material", "Material", 50], ["pecas", "Peças", 8, "0"], ["peso", "Peso (kg)", 14, "#,##0.00"], ["pintura", "Pintura (m²)", 14, "#,##0.000"]], L.resumo, { material: "TOTAL (" + br(L.totais.kN) + " kN)", pecas: L.totais.pecas, peso: L.totais.peso, pintura: L.totais.pintura });
    var ws = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica & Mecânica: listas de fabricação.", "Modelagem, detalhamento e fabricação — NÃO é cálculo estrutural: perfis, parafusos e chapas de partida devem ser conferidos pelo projeto estrutural.",
     "Peso das peças = geometria modelada × 7 850 kg/m³ (furos descontados). Parafusos: massa estimada pela geometria.",
     "Distâncias de furo conferidas pela ABNT NBR 8800:2008 (6.3.9 a 6.3.12); valores marcados \"de partida\" estão na tela \"De onde vem cada número\"."].forEach(function (t) { ws.addRow([t]); });
    ws.getColumn(1).width = 140;
    return wb;
  }

  /* ======================================================= DESENHO (SVG)
   * Folha simples em mm de papel: a peça em escala, a furação cotada a
   * partir da ORIGEM (cotas acumuladas, como a máquina lê), a lista de
   * furos e o título. Devolve { svg, w, h, escala, tabela:{cabecalho, linhas} }. */
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function escalaPara(w, h, W, H) { var e = Math.max(w / W, h / H); var pad = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200]; for (var i = 0; i < pad.length; i++) if (pad[i] >= e) return pad[i]; return Math.ceil(e / 100) * 100; }
  function desenhoChapa(p, marca, qtd) {
    var W = 260, H = 150, e = escalaPara(p.L, p.B, W - 40, H - 50), ox = 30, oy = 25 + p.B / e, s = [];
    function X(x) { return ox + x / e; } function Y(y) { return oy - y / e; }
    s.push('<polygon points="' + p.contorno.map(function (q) { return X(q[0]).toFixed(2) + "," + Y(q[1]).toFixed(2); }).join(" ") + '" fill="#eef2f6" stroke="#111" stroke-width="0.5"/>');
    p.recortes.forEach(function (r) { s.push('<polygon points="' + r.map(function (q) { return X(q[0]).toFixed(2) + "," + Y(q[1]).toFixed(2); }).join(" ") + '" fill="#fff" stroke="#111" stroke-width="0.35"/>'); });
    p.furos.forEach(function (f, i) {
      var r = num(f.d, 0) / 2 / e;
      if (num(f.l, f.d) > num(f.d, 0) + 0.05) s.push('<rect x="' + (X(f.x) - num(f.l, 0) / 2 / e).toFixed(2) + '" y="' + (Y(f.y) - r).toFixed(2) + '" width="' + (num(f.l, 0) / e).toFixed(2) + '" height="' + (2 * r).toFixed(2) + '" rx="' + r.toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.35" transform="rotate(' + (-num(f.ang, 0)) + ' ' + X(f.x).toFixed(2) + ' ' + Y(f.y).toFixed(2) + ')"/>');
      else s.push('<circle cx="' + X(f.x).toFixed(2) + '" cy="' + Y(f.y).toFixed(2) + '" r="' + Math.max(0.4, r).toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.35"/>');
      s.push('<text x="' + (X(f.x) + r + 0.6).toFixed(2) + '" y="' + (Y(f.y) - r - 0.4).toFixed(2) + '" font-size="2.2" fill="#b3261e">' + (i + 1) + '</text>');
    });
    cotasAcumuladas(s, p.furos.map(function (f) { return f.x; }), X, Y(0) + 6, "x", p.L, X(0));
    cotasAcumuladas(s, p.furos.map(function (f) { return f.y; }), Y, X(0) - 6, "y", p.B, Y(0));
    var tab = { cabecalho: ["Furo", "x (mm)", "y (mm)", "Ø (mm)", "Tipo"], linhas: p.furos.map(function (f, i) { return [String(i + 1), br(f.x, 1), br(f.y, 1), br(f.d, 1) + (num(f.l, f.d) > num(f.d, 0) + 0.05 ? " × " + br(f.l, 1) : ""), f.tipo]; }) };
    var tit = (marca || "") + " — " + p.papel + " · chapa #" + br(p.t, 1) + " mm · " + Math.round(p.L) + " × " + Math.round(p.B) + " mm · " + p.aco + " · " + br(p.massa, 2) + " kg" + (qtd ? " · " + qtd + " peça(s)" : "");
    return folhaSvg(s, W, H, e, tit, tab);
  }
  function desenhoPerfil(p, marca, qtd) {
    var W = 280, H = 170, fcs = contornosFaces(p), e = escalaPara(p.L, (p.dims.h + p.dims.b) * 1.6, W - 50, H - 60), s = [], ox = 34, oy = 22, gap = 10;
    var y0 = oy;
    fcs.forEach(function (fc) {
      var larg = Math.max.apply(null, fc.poli.map(function (q) { return q[1]; }));
      var base = y0 + larg / e;
      function X(x) { return ox + x / e; } function Y(y) { return base - y / e; }
      s.push('<polygon points="' + fc.poli.map(function (q) { return X(q[0]).toFixed(2) + "," + Y(q[1]).toFixed(2); }).join(" ") + '" fill="#eef2f6" stroke="#111" stroke-width="0.45"/>');
      s.push('<text x="' + (ox - 12) + '" y="' + (base - larg / e / 2 + 1).toFixed(2) + '" font-size="3" fill="#333">face ' + fc.face + '</text>');
      var fs = p.furos.filter(function (f) { return f.face === fc.face; });
      fs.forEach(function (f) { s.push('<circle cx="' + X(f.x).toFixed(2) + '" cy="' + Y(f.y).toFixed(2) + '" r="' + Math.max(0.4, f.d / 2 / e).toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.3"/>'); });
      if (fs.length) cotasAcumuladas(s, fs.map(function (f) { return f.x; }), X, base + 4, "x", p.L, X(0));
      y0 = base + gap;
    });
    var ct = p.cortes, tc = [ct.almaIni, ct.almaFim, ct.abaIni, ct.abaFim].some(function (g) { return Math.abs(g) > 0.01; }) ? " · corte alma " + br(ct.almaIni, 1) + "°/" + br(ct.almaFim, 1) + "°, aba " + br(ct.abaIni, 1) + "°/" + br(ct.abaFim, 1) + "°" : " · corte reto";
    var tab = { cabecalho: ["Furo", "Face", "x (mm)", "y (mm)", "Ø (mm)"], linhas: p.furos.map(function (f, i) { return [String(i + 1), f.face, br(f.x, 1), br(f.y, 1), br(f.d, 1)]; }) };
    var tit = (marca || "") + " — " + p.papel + " · " + p.nomePerfil + " × " + Math.round(p.L) + " mm" + tc + " · " + p.aco + " · " + br(p.massa, 2) + " kg" + (qtd ? " · " + qtd + " peça(s)" : "");
    return folhaSvg(s, W, Math.max(H, y0 + 30), e, tit, tab);
  }
  /* cotas acumuladas a partir da origem (como a máquina mede): uma linha de cota, os valores em pé */
  function cotasAcumuladas(s, vals, T, pos, eixo, total, origem) {
    var vs = vals.concat([total]).map(function (v) { return Math.round(v * 10) / 10; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    if (eixo === "x") {
      s.push('<line x1="' + origem.toFixed(2) + '" y1="' + pos.toFixed(2) + '" x2="' + T(total).toFixed(2) + '" y2="' + pos.toFixed(2) + '" stroke="#555" stroke-width="0.2"/>');
      vs.forEach(function (v) { var x = T(v); s.push('<line x1="' + x.toFixed(2) + '" y1="' + (pos - 1).toFixed(2) + '" x2="' + x.toFixed(2) + '" y2="' + (pos + 1).toFixed(2) + '" stroke="#555" stroke-width="0.25"/><text x="' + (x + 0.7).toFixed(2) + '" y="' + (pos + 1.5).toFixed(2) + '" font-size="2" fill="#333" transform="rotate(90 ' + (x + 0.7).toFixed(2) + ' ' + (pos + 1.5).toFixed(2) + ')">' + br(v, 1) + '</text>'); });
    } else {
      s.push('<line x1="' + pos.toFixed(2) + '" y1="' + origem.toFixed(2) + '" x2="' + pos.toFixed(2) + '" y2="' + T(total).toFixed(2) + '" stroke="#555" stroke-width="0.2"/>');
      vs.forEach(function (v) { var y = T(v); s.push('<line x1="' + (pos - 1).toFixed(2) + '" y1="' + y.toFixed(2) + '" x2="' + (pos + 1).toFixed(2) + '" y2="' + y.toFixed(2) + '" stroke="#555" stroke-width="0.25"/><text x="' + (pos - 1.5).toFixed(2) + '" y="' + (y + 0.7).toFixed(2) + '" font-size="2" fill="#333" text-anchor="end">' + br(v, 1) + '</text>'); });
    }
  }
  function folhaSvg(corpo, W, H, e, titulo, tab) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + ' ' + H + '" font-family="Arial, Helvetica, sans-serif">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' + corpo.join("") +
      '<text x="4" y="' + (H - 6) + '" font-size="3.4" font-weight="bold" fill="#111">' + esc(titulo) + '</text>' +
      '<text x="4" y="' + (H - 2) + '" font-size="2.4" fill="#555">Escala 1:' + e + ' · medidas em mm a partir da origem (canto inferior esquerdo) · OrçaPRO Modela — detalhamento, não é cálculo estrutural</text></svg>';
    return { svg: svg, w: W, h: H, escala: e, titulo: titulo, tabela: tab };
  }
  function desenhoConjunto(estado, conj, n) {
    n = n || numerar(estado);
    var porId = {}; n.pecas.forEach(function (p) { porId[p.id] = p; });
    var rep = conj.conjuntos[0], princ = porId[rep.principal];
    var base = princ.kind === "perfil" ? desenhoPerfil(princ, conj.principal) : (princ.kind === "chapa" ? desenhoChapa(princ, conj.principal) : null);
    var cnt = {}; rep.ids.forEach(function (id) { if (id === rep.principal) return; var mk = n.marcaDe[id]; cnt[mk] = cnt[mk] || { n: 0, p: porId[id] }; cnt[mk].n++; });
    var tab = { cabecalho: ["Marca", "Qtd", "Descrição", "Solda"], linhas: [[conj.principal, "1", descricao(princ), "—"]].concat(Object.keys(cnt).sort().map(function (mk) { var q = cnt[mk].p; return [mk, String(cnt[mk].n), descricao(q), q.solda ? N().soldaRotulo(q.solda) : "—"]; })) };
    var tit = conj.marca + " — conjunto: " + descricao(princ) + " + " + (Object.keys(cnt).length ? Object.keys(cnt).map(function (mk) { return cnt[mk].n + "× " + mk; }).join(", ") : "sem partes soldadas") + " · " + conj.conjuntos.length + " conjunto(s) · " + br(conj.massa, 2) + " kg cada";
    if (!base) return { svg: "", tabela: tab, titulo: tit };
    base.svg = base.svg.replace(/<text x="4" y="[^"]+" font-size="3.4"[^>]*>[^<]*<\/text>/, '<text x="4" y="' + (base.h - 6) + '" font-size="3.4" font-weight="bold" fill="#111">' + esc(tit) + '</text>');
    base.titulo = tit; base.tabela = tab;
    return base;
  }

  /* =========================================== ARQUIVOS DA FÁBRICA (pacote) */
  function arquivos(estado, o) {
    o = o || {};
    var n = numerar(estado), L = listas(estado, n), out = {}, chapasNest = {};
    n.grupos.forEach(function (g) {
      var p = g.rep, qtd = g.ids.length;
      if (p.kind === "perfil" || p.kind === "chapa") out["DSTV/" + g.marca + ".nc1"] = dstv(p, { marca: g.marca, qtd: qtd, pedido: o.pedido, desenho: o.desenho });
      if (p.kind === "chapa") {
        out["DXF/" + g.marca + ".dxf"] = dxfChapa(p, g.marca);
        var k = "#" + br(p.t, 1).replace(",", "_") + "_" + ascii(p.aco).replace(/[^A-Za-z0-9]+/g, "-");
        (chapasNest[k] = chapasNest[k] || []).push({ p: p, qtd: qtd, marca: g.marca });
      }
    });
    var resumoNest = [];
    if (o.nesting !== false) Object.keys(chapasNest).sort().forEach(function (k) {
      var r = nesting(chapasNest[k], o.chapaPadrao || {});
      out["DXF/nesting_" + k.replace("#", "chapa") + ".dxf"] = r.texto;
      resumoNest.push({ grupo: k, chapas: r.chapas, aproveitamento: r.aproveitamento, fora: r.fora });
    });
    return { arquivos: out, numeracao: n, listas: L, nesting: resumoNest };
  }

  var BimMetalFab = {
    COD_DSTV: COD_DSTV, CAMPOS_ST: CAMPOS_ST, CAMADAS_DXF: CAMADAS_DXF,
    pecasFab: pecasFab, assinatura: assinatura, numerar: numerar, opNumerar: opNumerar,
    dstv: dstv, lerDstv: lerDstv, contornosFaces: contornosFaces, dxfChapa: dxfChapa, nesting: nesting,
    listas: listas, xlsx: xlsx, desenhoChapa: desenhoChapa, desenhoPerfil: desenhoPerfil, desenhoConjunto: desenhoConjunto, descricao: descricao,
    arquivos: arquivos, ascii: ascii
  };
  global.BimMetalFab = BimMetalFab;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalFab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * icarrelevo.js — RELEVO DO LEVANTAMENTO DA OBRA (ESPEC §II.8.3). Motor PURO, sem DOM.
 * O topógrafo entrega pontos (CSV/TXT, padrão PNEZD do Civil 3D, ou PENZD/NEZ/ENZ=XYZ); aqui eles viram uma superfície
 * triangulada (Delaunay) no referencial do MODELO, com cota em qualquer ponto, curvas de nível e a declividade entre pontos
 * (as sapatas das patolas). É o chão que vale no LOTE — o relevo de satélite (~30 m) só serve para o entorno.
 *
 * ⚠ Coordenadas: UTM (SIRGAS 2000, o fuso da obra — js/icargeo.js) quando os números têm cara de UTM, senão "as do projeto"
 *   (o mesmo sistema do IFC). A cota vira z do modelo por zRef: "o 0,00 do projeto é a cota X do levantamento".
 * ⚠ Nada é extrapolado: fora dos triângulos a cota é null (quem chama usa outra fonte e diz isso).
 * ⚠ Triângulo com aresta maior que maxAresta (premissa) não entra: o Delaunay fecha o casco convexo e, num levantamento em L,
 *   inventaria um terreno reto atravessando o que não foi medido.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = { maxPontos: 3000, maxAresta_m: 40 };
  function hip(x, y) { return Math.sqrt(x * x + y * y); }   // ES5: nada de Math.hypot (WebView antigo)
  var ORDENS = { PNEZD: ["p", "n", "e", "z", "d"], PENZD: ["p", "e", "n", "z", "d"], NEZ: ["n", "e", "z"], ENZ: ["e", "n", "z"] };

  /* número com vírgula ou ponto decimal ("812,35", "812.35", "1.234,56", "1,234.56") */
  function num(s) {
    var t = String(s == null ? "" : s).trim().replace(/\s/g, "");
    if (!t || !/^[+-]?[\d.,]+$/.test(t)) return null;
    var uv = t.lastIndexOf(","), up = t.lastIndexOf(".");
    if (uv >= 0 && up >= 0) t = uv > up ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if (uv >= 0) t = (t.match(/,/g) || []).length > 1 ? t.replace(/,/g, "") : t.replace(",", ".");
    var v = +t; return isFinite(v) ? v : null;
  }
  function campos(linha) {
    if (linha.indexOf(";") >= 0) return linha.split(";");
    if (linha.indexOf("\t") >= 0) return linha.split("\t");
    /* vírgula como separador só quando os números usam ponto (senão "812,35" seria dois campos) */
    if ((linha.match(/,/g) || []).length >= 2) return linha.split(",");
    return linha.trim().split(/\s+/);
  }
  /* ordem pelas colunas: com 4+ colunas o padrão é PNEZD; com 3, NEZ — e quando os números têm cara de UTM do hemisfério sul
     (N de 7 a 10 milhões, E de 100 mil a 900 mil), a ordem sai deles */
  function adivinharOrdem(linhas) {
    var amostra = linhas.slice(0, 50).map(campos).filter(function (f) { return f.length >= 3; });
    if (!amostra.length) return "PNEZD";
    var nC = amostra[0].length, desl = nC >= 4 ? 1 : 0;
    var a = amostra.map(function (f) { return num(f[desl]); }).filter(function (v) { return v != null; }), b = amostra.map(function (f) { return num(f[desl + 1]); }).filter(function (v) { return v != null; });
    function utmN(v) { return v > 6e6 && v < 1e7; } function utmE(v) { return v > 1e5 && v < 9e5; }
    if (a.length && b.length && a.every(utmE) && b.every(utmN)) return desl ? "PENZD" : "ENZ";
    return desl ? "PNEZD" : "NEZ";
  }
  function lerPontos(txt, ordem) {
    var linhas = String(txt || "").replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^(#|\/\/)/.test(l); });
    var ord = ORDENS[ordem] ? ordem : adivinharOrdem(linhas), cols = ORDENS[ord], pts = [], ruins = 0;
    linhas.forEach(function (l) {
      var f = campos(l), o = {};
      cols.forEach(function (c, i) { o[c] = f[i]; });
      var n = num(o.n), e = num(o.e), z = num(o.z);
      if (n == null || e == null || z == null) { ruins++; return; }
      pts.push({ id: o.p != null ? String(o.p).trim().slice(0, 20) : String(pts.length + 1), e: e, n: n, z: z, d: o.d != null ? String(o.d).trim().slice(0, 40) : "" });
    });
    var utm = pts.length > 0 && pts.every(function (q) { return q.e > 1e5 && q.e < 9e5 && q.n > 6e6 && q.n < 1e7; });
    return { ok: pts.length >= 3, ordem: ord, ordemAdivinhada: !ORDENS[ordem], pontos: pts, ignoradas: ruins, pareceUtm: utm,
      motivo: pts.length >= 3 ? "" : "o arquivo não tem 3 pontos legíveis na ordem " + ord + " (confira a ordem das colunas)" };
  }
  /* poucos milhares bastam para o lote: acima do teto, fica 1 ponto por célula de uma grade que cabe no teto */
  function rarear(pts, max) {
    max = max || PREMISSAS.maxPontos; if (pts.length <= max) return pts;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    var lado = Math.sqrt((x1 - x0) * (y1 - y0) / max) || 1, vis = {}, out = [];
    pts.forEach(function (q) { var k = Math.floor((q.x - x0) / lado) + "|" + Math.floor((q.y - y0) / lado); if (!vis[k]) { vis[k] = 1; out.push(q); } });
    return out;
  }
  /* pontos do levantamento → referencial do modelo (x, y, z) */
  function paraModelo(pts, op) {
    op = op || {};
    var G = global.IcarGeo, zRef = +op.zRef || 0, out = [];
    pts.forEach(function (q) {
      var x = q.e, y = q.n;
      if (op.sistema === "utm") {
        if (!G || !op.geo || !op.fuso) return;
        var ll = G.deUtm(q.e, q.n, op.fuso, op.sul !== false), m = G.paraMotor(op.geo, ll.lat, ll.lon); x = m.x; y = m.y;
      }
      out.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, z: Math.round((q.z - zRef) * 1000) / 1000, id: q.id });
    });
    return out;
  }

  /* ---------- Delaunay (Bowyer–Watson) ---------- */
  function circ(a, b, c) {
    var d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)); if (Math.abs(d) < 1e-12) return null;
    var a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    var ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x: ux, y: uy, r2: (a.x - ux) * (a.x - ux) + (a.y - uy) * (a.y - uy) };
  }
  function triangular(pts0, op) {
    op = op || {};
    var maxA = op.maxAresta_m != null ? +op.maxAresta_m : PREMISSAS.maxAresta_m;
    /* pontos repetidos (mesmo x,y) derrubam o Delaunay: fica o primeiro */
    var vistos = {}, pts = [];
    pts0.forEach(function (q) { var k = Math.round(q.x * 100) + "|" + Math.round(q.y * 100); if (!vistos[k]) { vistos[k] = 1; pts.push(q); } });
    if (pts.length < 3) return { ok: false, motivo: "menos de 3 pontos distintos", pts: pts, tris: [] };
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    var dx = x1 - x0, dy = y1 - y0, dm = Math.max(dx, dy) || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    var V = pts.slice(); V.push({ x: mx - 20 * dm, y: my - dm }, { x: mx, y: my + 20 * dm }, { x: mx + 20 * dm, y: my - dm });
    var n = pts.length, tris = [{ v: [n, n + 1, n + 2], c: circ(V[n], V[n + 1], V[n + 2]) }];
    for (var i = 0; i < n; i++) {
      var p = V[i], ruins = [], bons = [];
      tris.forEach(function (t) { var c = t.c; if (c && (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) < c.r2 - 1e-9) ruins.push(t); else bons.push(t); });
      var arestas = {};
      ruins.forEach(function (t) { for (var k = 0; k < 3; k++) { var a = t.v[k], b = t.v[(k + 1) % 3], ch = a < b ? a + "_" + b : b + "_" + a; arestas[ch] = arestas[ch] ? null : [a, b]; } });
      tris = bons;
      Object.keys(arestas).forEach(function (ch) { var e = arestas[ch]; if (!e) return; var c = circ(V[e[0]], V[e[1]], p); if (c) tris.push({ v: [e[0], e[1], i], c: c }); });
    }
    var out = [], longos = 0;
    tris.forEach(function (t) {
      if (t.v[0] >= n || t.v[1] >= n || t.v[2] >= n) return;
      var a = pts[t.v[0]], b = pts[t.v[1]], c = pts[t.v[2]];
      var l = Math.max(hip(a.x - b.x, a.y - b.y), hip(b.x - c.x, b.y - c.y), hip(c.x - a.x, c.y - a.y));
      if (maxA > 0 && l > maxA) { longos++; return; }
      out.push(t.v);
    });
    return montar(pts, out, longos);
  }
  /* grade de busca: cada célula guarda os triângulos que a tocam (cota em O(1) para os milhares de pontos do agente) */
  function montar(pts, tris, longos) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zmin = Infinity, zmax = -Infinity, area = 0;
    pts.forEach(function (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); zmin = Math.min(zmin, q.z); zmax = Math.max(zmax, q.z); });
    var nc = Math.max(1, Math.round(Math.sqrt(tris.length / 2))), cx = (x1 - x0) / nc || 1, cy = (y1 - y0) / nc || 1, grade = {};
    tris.forEach(function (t, k) {
      var a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      area += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      var i0 = Math.floor((Math.min(a.x, b.x, c.x) - x0) / cx), i1 = Math.floor((Math.max(a.x, b.x, c.x) - x0) / cx), j0 = Math.floor((Math.min(a.y, b.y, c.y) - y0) / cy), j1 = Math.floor((Math.max(a.y, b.y, c.y) - y0) / cy);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var ch = i + "|" + j; (grade[ch] = grade[ch] || []).push(k); }
    });
    return { ok: tris.length > 0, motivo: tris.length ? "" : "os pontos não formam triângulo (alinhados ou arestas acima do limite)", pts: pts, tris: tris, longos: longos || 0,
      caixa: { x0: x0, y0: y0, x1: x1, y1: y1 }, zmin: zmin, zmax: zmax, area: Math.round(area * 10) / 10, _g: { grade: grade, x0: x0, y0: y0, cx: cx, cy: cy } };
  }
  function cota(tin, x, y) {
    if (!tin || !tin.ok) return null;
    var g = tin._g, ks = g.grade[Math.floor((x - g.x0) / g.cx) + "|" + Math.floor((y - g.y0) / g.cy)];
    if (!ks) return null;
    for (var i = 0; i < ks.length; i++) {
      var t = tin.tris[ks[i]], a = tin.pts[t[0]], b = tin.pts[t[1]], c = tin.pts[t[2]];
      var d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y); if (Math.abs(d) < 1e-12) continue;
      var l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d, l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a.z + l2 * b.z + l3 * c.z;
    }
    return null;
  }
  /* curvas de nível (marching triangles): segmentos [x1, y1, x2, y2, z] a cada `passo` m */
  function curvas(tin, passo) {
    passo = +passo > 0 ? +passo : 1; var out = [];
    if (!tin || !tin.ok) return out;
    tin.tris.forEach(function (t) {
      var v = [tin.pts[t[0]], tin.pts[t[1]], tin.pts[t[2]]], zmn = Math.min(v[0].z, v[1].z, v[2].z), zmx = Math.max(v[0].z, v[1].z, v[2].z);
      for (var z = Math.ceil(zmn / passo) * passo; z <= zmx; z += passo) {
        /* ⚠ o nível desloca 1e-7 m no cálculo: vértice exatamente na cota (comum em plano de prova e em ponto cotado redondo)
           deixava a curva com um ponto só no triângulo e ela sumia */
        var cr = [], zz = z + 1e-7;
        for (var k = 0; k < 3; k++) {
          var a = v[k], b = v[(k + 1) % 3];
          if ((a.z - zz) * (b.z - zz) < 0) { var u = (zz - a.z) / (b.z - a.z); cr.push([a.x + u * (b.x - a.x), a.y + u * (b.y - a.y)]); }
        }
        if (cr.length >= 2) out.push([cr[0][0], cr[0][1], cr[1][0], cr[1][1], Math.round(z * 1000) / 1000]);
      }
    });
    return out;
  }
  function malha(tin) {
    if (!tin || !tin.ok) return null;
    var pos = [], idx = [];
    tin.pts.forEach(function (q) { pos.push(q.x, q.y, q.z); });
    tin.tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
    return { pos: pos, idx: idx };
  }
  /* declividade entre pontos (as sapatas): a maior diferença de cota sobre a distância entre o par */
  function declividade(tin, pontos) {
    var zs = (pontos || []).map(function (q) { return { q: q, z: cota(tin, q.x, q.y) }; });
    var fora = zs.filter(function (r) { return r.z == null; }).length, max = 0, des = 0, par = null;
    for (var i = 0; i < zs.length; i++) for (var j = i + 1; j < zs.length; j++) {
      if (zs[i].z == null || zs[j].z == null) continue;
      var d = hip(zs[i].q.x - zs[j].q.x, zs[i].q.y - zs[j].q.y); if (!(d > 0)) continue;
      var dz = Math.abs(zs[i].z - zs[j].z), pct = dz / d * 100;
      if (pct > max) { max = pct; par = [i, j]; }
      des = Math.max(des, dz);
    }
    return { cotas: zs.map(function (r) { return r.z == null ? null : Math.round(r.z * 1000) / 1000; }), desnivel: Math.round(des * 1000) / 1000, maxPct: Math.round(max * 100) / 100, par: par, fora: fora };
  }

  var IcarRelevo = { PREMISSAS: PREMISSAS, ORDENS: ORDENS, num: num, lerPontos: lerPontos, adivinharOrdem: adivinharOrdem, rarear: rarear, paraModelo: paraModelo,
    triangular: triangular, cota: cota, curvas: curvas, malha: malha, declividade: declividade };
  global.IcarRelevo = IcarRelevo;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarRelevo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

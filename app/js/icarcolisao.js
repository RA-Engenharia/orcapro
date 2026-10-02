/* =====================================================================
 * icarcolisao.js — COLISÕES E FOLGAS NO CAMINHO DO IÇAMENTO (ESPEC-ICAMENTO-CENARIO.md §D e §II.5).
 * Motor PURO (ES5, testável em Node). Quem monta as amostras (pose da lança, carga, cabo, contrapeso em cada instante da
 * simulação) e os obstáculos (triângulos do modelo) é o js/bim.js; aqui só a geometria e o veredito.
 *
 * Partes testadas por instante: carga (caixa orientada), contrapeso (caixa orientada girando), lança/braços (cápsula =
 * segmento + raio), cabo e lingas (segmentos). Contra: obstáculos em triângulos (filtrados pela caixa de cada um) e REDE
 * ELÉTRICA (segmento do vão + raios da NR-10 pela tensão).
 * Resultado: [{ t, quem, contra, id, distancia, tipo: "choque" | "folga" | "zona-controlada" | "zona-de-risco" }] e o resumo
 * por par (primeiro instante, menor distância).
 *
 * ⚠ COORDENADAS: as do motor (IFC): metros, z para cima.
 * ⚠ "choque" = interseção (distância 0); "folga" = mais perto que a folga mínima (premissa do plano, impressa).
 * ⚠ Distâncias EXATAS entre convexos: encostar = eixos separadores (caixa × triângulo) ou faixas (segmento × caixa);
 *   longe = o menor entre vértice × sólido e aresta × aresta/face — para dois convexos que não se tocam, o par mais
 *   próximo é sempre um desses (vértice-face, face-vértice ou aresta-aresta).
 * ⚠ NR-10: a tabela é a do Anexo II, IGUAL nas duas redações (Portaria 598/2004 com as alterações até a SEPRT 915/2019 — em
 *   vigor; e a Portaria MTE 737 de 29/05/2026, DOU 01/06/2026, que entra em vigor 1 ano depois, em 01/06/2027). Copiada dos
 *   PDFs oficiais do gov.br em 02/10/2026. Equipamento dentro do raio Rc (zona controlada) = bloqueio.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* NR-10, Anexo II — faixa de tensão nominal (kV): [até (exclusivo), Rr (m), Rc (m)] */
  var NR10 = {
    fonte: "NR-10, Anexo II (tabela de raios de delimitação) — igual na redação de 2019 (Portaria SEPRT 915/2019, em vigor) e na Portaria MTE 737/2026 (vigência 01/06/2027); gov.br, conferido em 02/10/2026",
    faixas: [[1, 0.20, 0.70], [3, 0.22, 1.22], [6, 0.25, 1.25], [10, 0.35, 1.35], [15, 0.38, 1.38], [20, 0.40, 1.40], [30, 0.56, 1.56], [36, 0.58, 1.58],
      [45, 0.63, 1.63], [60, 0.83, 1.83], [70, 0.90, 1.90], [110, 1.00, 2.00], [132, 1.10, 3.10], [150, 1.20, 3.20], [220, 1.60, 3.60], [275, 1.80, 3.80],
      [380, 2.50, 4.50], [480, 3.20, 5.20], [700, 5.20, 7.20]]
  };
  function zonaNR10(kV) {
    var v = +kV; if (!(v >= 0)) return null;
    for (var i = 0; i < NR10.faixas.length; i++) if (v < NR10.faixas[i][0]) return { Rr: NR10.faixas[i][1], Rc: NR10.faixas[i][2], faixa: (i ? NR10.faixas[i - 1][0] : 0) + "–" + NR10.faixas[i][0] + " kV", fonte: NR10.fonte };
    return null;   // ⚠ acima de 700 kV a tabela não cobre: sem número (a tela pede o estudo da concessionária)
  }

  /* ---------------- vetores (arrays [x, y, z]) ---------------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ponto mais próximo do triângulo abc a p (Ericson, Real-Time Collision Detection §5.1.5) */
  function pontoTri(p, a, b, c) {
    var ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    var bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    var vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
    var cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    var vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
    var va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    var den = 1 / (va + vb + vc);
    return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
  }
  /* distância entre segmentos p1q1 e p2q2 (Ericson §5.1.9) */
  function segSeg(p1, q1, p2, q2) {
    var d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), s, t;
    if (a <= 1e-12 && e <= 1e-12) return len(sub(p1, p2));
    if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      var c = dot(d1, r);
      if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        var b = dot(d1, d2), den = a * e - b * b;
        s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    return len(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))));
  }
  /* o segmento pq atravessa o triângulo abc? (Möller–Trumbore limitado ao segmento) */
  function segCruzaTri(p, q, a, b, c) {
    var d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) return false;
    var inv = 1 / det, s = sub(p, a), u = inv * dot(s, h); if (u < 0 || u > 1) return false;
    var qq = cross(s, e1), v = inv * dot(d, qq); if (v < 0 || u + v > 1) return false;
    var t = inv * dot(e2, qq); return t >= 0 && t <= 1;
  }
  function segTri(p, q, a, b, c) {
    if (segCruzaTri(p, q, a, b, c)) return 0;
    return Math.min(len(sub(p, pontoTri(p, a, b, c))), len(sub(q, pontoTri(q, a, b, c))), segSeg(p, q, a, b), segSeg(p, q, b, c), segSeg(p, q, c, a));
  }
  /* ---------------- caixa orientada: { c: centro, e: [ex, ey, ez] eixos unitários, h: [hx, hy, hz] meias-medidas } ---------------- */
  function obbVertices(o) {
    var v = [];
    for (var i = -1; i <= 1; i += 2) for (var j = -1; j <= 1; j += 2) for (var k = -1; k <= 1; k += 2)
      v.push(add(o.c, add(mul(o.e[0], i * o.h[0]), add(mul(o.e[1], j * o.h[1]), mul(o.e[2], k * o.h[2])))));
    return v;
  }
  var ARESTAS_OBB = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function pontoObb(p, o) {
    var d = sub(p, o.c), q = o.c.slice();
    for (var i = 0; i < 3; i++) { var dist = clamp(dot(d, o.e[i]), -o.h[i], o.h[i]); q = add(q, mul(o.e[i], dist)); }
    return len(sub(p, q));
  }
  /* SAT: a caixa encosta no triângulo? (13 eixos: 3 da caixa, 1 normal do triângulo, 9 produtos das arestas) */
  function obbCruzaTri(o, a, b, c) {
    var v = [sub(a, o.c), sub(b, o.c), sub(c, o.c)], f = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])], eixos = [o.e[0], o.e[1], o.e[2], cross(f[0], f[1])];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) eixos.push(cross(o.e[i], f[j]));
    for (var k = 0; k < eixos.length; k++) {
      var ax = eixos[k]; if (dot(ax, ax) < 1e-14) continue;
      var p0 = dot(v[0], ax), p1 = dot(v[1], ax), p2 = dot(v[2], ax);
      var r = o.h[0] * Math.abs(dot(o.e[0], ax)) + o.h[1] * Math.abs(dot(o.e[1], ax)) + o.h[2] * Math.abs(dot(o.e[2], ax));
      if (Math.max(p0, p1, p2) < -r - 1e-9 || Math.min(p0, p1, p2) > r + 1e-9) return false;
    }
    return true;
  }
  function obbTri(o, a, b, c) {
    if (obbCruzaTri(o, a, b, c)) return 0;
    var m = Math.min(pontoObb(a, o), pontoObb(b, o), pontoObb(c, o)), vs = obbVertices(o);
    for (var i = 0; i < ARESTAS_OBB.length; i++) m = Math.min(m, segTri(vs[ARESTAS_OBB[i][0]], vs[ARESTAS_OBB[i][1]], a, b, c));
    return m;
  }
  /* o segmento pq entra na caixa? (faixas no referencial da caixa — exato, não amostra) */
  function segCruzaObb(p, q, o) {
    var t0 = 0, t1 = 1, dp = sub(p, o.c), dd = sub(q, p);
    for (var i = 0; i < 3; i++) {
      var s = dot(dp, o.e[i]), d = dot(dd, o.e[i]), h = o.h[i];
      if (Math.abs(d) < 1e-12) { if (s < -h || s > h) return false; continue; }
      var a = (-h - s) / d, b = (h - s) / d; if (a > b) { var tmp = a; a = b; b = tmp; }
      if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false;
    }
    return true;
  }
  function obbSeg(o, p, q) {
    if (segCruzaObb(p, q, o)) return 0;
    var vs = obbVertices(o), m = Math.min(pontoObb(p, o), pontoObb(q, o));
    for (var i = 0; i < ARESTAS_OBB.length; i++) m = Math.min(m, segSeg(vs[ARESTAS_OBB[i][0]], vs[ARESTAS_OBB[i][1]], p, q));
    return m;
  }

  /* caixa alinhada (min/max) de uma parte, alargada por `m` */
  function aabbParte(pt, m) {
    var pts = pt.tipo === "obb" ? obbVertices(pt.obb) : [pt.a, pt.b], r = (pt.raio || 0) + (m || 0);
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    pts.forEach(function (q) { for (var i = 0; i < 3; i++) { if (q[i] - r < mn[i]) mn[i] = q[i] - r; if (q[i] + r > mx[i]) mx[i] = q[i] + r; } });
    return { min: mn, max: mx };
  }
  function cruzaAabb(x, y) { return x.min[0] <= y.max[0] && x.max[0] >= y.min[0] && x.min[1] <= y.max[1] && x.max[1] >= y.min[1] && x.min[2] <= y.max[2] && x.max[2] >= y.min[2]; }
  /* distância de uma parte (obb | capsula | segmento) a um obstáculo de triângulos (array plano: 9 números por triângulo) */
  function distParteObst(pt, tris, limite) {
    var m = Infinity, r = pt.raio || 0;
    for (var i = 0; i + 8 < tris.length; i += 9) {
      var a = [tris[i], tris[i + 1], tris[i + 2]], b = [tris[i + 3], tris[i + 4], tris[i + 5]], c = [tris[i + 6], tris[i + 7], tris[i + 8]];
      var d = pt.tipo === "obb" ? obbTri(pt.obb, a, b, c) : Math.max(0, segTri(pt.a, pt.b, a, b, c) - r);
      if (d < m) { m = d; if (m <= 0) return 0; }
    }
    return m;
  }

  /* amostras = [{ t, partes: [{ quem, tipo: "obb"|"capsula"|"segmento", obb | a, b, raio }] }]
     obstaculos = [{ id, nome, aabb: { min, max }, tris: [...] }]   redes = [{ id, nome, a, b, kV }]
     opts = { folga (m), ignorar: { "<quem>": ["<id>", …] } } */
  function verificar(amostras, obstaculos, redes, opts) {
    opts = opts || {};
    var folga = +opts.folga >= 0 ? +opts.folga : 0.5, ign = opts.ignorar || {}, eventos = [], testes = 0;
    (amostras || []).forEach(function (am) {
      (am.partes || []).forEach(function (pt) {
        var cx = aabbParte(pt, folga), lista = ign[pt.quem] || [];
        (obstaculos || []).forEach(function (ob) {
          if (lista.indexOf(ob.id) >= 0 || !ob.aabb || !cruzaAabb(cx, ob.aabb)) return;
          testes++;
          var d = distParteObst(pt, ob.tris || [], folga);
          if (d <= 0) eventos.push({ t: am.t, quem: pt.quem, contra: ob.nome || ob.id, id: ob.id, distancia: 0, tipo: "choque" });
          else if (d < folga) eventos.push({ t: am.t, quem: pt.quem, contra: ob.nome || ob.id, id: ob.id, distancia: d, tipo: "folga" });
        });
        (redes || []).forEach(function (rd) {
          var z = zonaNR10(rd.kV); if (!z) return;
          var d = pt.tipo === "obb" ? obbSeg(pt.obb, rd.a, rd.b) : Math.max(0, segSeg(pt.a, pt.b, rd.a, rd.b) - (pt.raio || 0));
          if (d < z.Rr) eventos.push({ t: am.t, quem: pt.quem, contra: rd.nome || "rede elétrica", id: rd.id, distancia: d, tipo: "zona-de-risco", Rr: z.Rr, Rc: z.Rc });
          else if (d < z.Rc) eventos.push({ t: am.t, quem: pt.quem, contra: rd.nome || "rede elétrica", id: rd.id, distancia: d, tipo: "zona-controlada", Rr: z.Rr, Rc: z.Rc });
        });
      });
    });
    /* resumo por par: o PIOR tipo e o primeiro instante DELE (`primeiro`); o primeiro aviso de qualquer tipo (`primeiroAviso`)
       — misturar os dois dizia "bate em t 0,67" quando em 0,67 era só a folga e o choque vinha em 0,75 (medido no teste) */
    var PESO = { "zona-de-risco": 4, choque: 3, "zona-controlada": 2, folga: 1 }, pares = {}, ordem = [];
    eventos.forEach(function (ev) {
      var k = ev.quem + "|" + ev.id, p = pares[k];
      if (!p) { p = pares[k] = { quem: ev.quem, contra: ev.contra, id: ev.id, primeiroAviso: ev.t, ultimo: ev.t, menor: ev.distancia, tipo: ev.tipo, porTipo: {}, n: 0 }; ordem.push(k); }
      p.n++; if (ev.t < p.primeiroAviso) p.primeiroAviso = ev.t; if (ev.t > p.ultimo) p.ultimo = ev.t; if (ev.distancia < p.menor) p.menor = ev.distancia;
      if (p.porTipo[ev.tipo] == null || ev.t < p.porTipo[ev.tipo]) p.porTipo[ev.tipo] = ev.t;
      if (PESO[ev.tipo] > PESO[p.tipo]) p.tipo = ev.tipo;
    });
    ordem.forEach(function (k) { pares[k].primeiro = pares[k].porTipo[pares[k].tipo]; });
    var resumo = ordem.map(function (k) { return pares[k]; }).sort(function (a, b) { return PESO[b.tipo] - PESO[a.tipo] || a.primeiro - b.primeiro; });
    return { eventos: eventos, resumo: resumo, folga: folga, testes: testes,
      bloqueia: resumo.some(function (r) { return r.tipo === "choque" || r.tipo === "zona-de-risco" || r.tipo === "zona-controlada"; }) };
  }

  /* VISÃO DO OPERADOR (ESPEC §II.14; NR-18 18.10.1.30: sem visão do ponto, sinaleiro obrigatório): o segmento olho → alvo contra
     os triângulos dos obstáculos. Devolve a PRIMEIRA peça a partir do olho. ⚠ Os últimos `folgaAlvo` m (padrão 0,30) não contam: o
     alvo encosta na peça vizinha onde a carga assenta (viga sobre o pilar) e isso não é tapar a vista.
     obstaculos: [{ id, nome, aabb: {min, max}, tris: [x,y,z, …] }] (os mesmos do caminho) */
  function segTriT(p, q, a, b, c) {
    var d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) return -1;
    var inv = 1 / det, s = sub(p, a), u = inv * dot(s, h); if (u < 0 || u > 1) return -1;
    var qq = cross(s, e1), v = inv * dot(d, qq); if (v < 0 || u + v > 1) return -1;
    var t = inv * dot(e2, qq); return t >= 0 && t <= 1 ? t : -1;
  }
  function visada(olho, alvo, obstaculos, opts) {
    opts = opts || {};
    var L = len(sub(alvo, olho)), tMax = L > 0 ? Math.max(0, 1 - (opts.folgaAlvo == null ? 0.30 : +opts.folgaAlvo) / L) : 0, melhor = null, n = 0;
    var mn = [Math.min(olho[0], alvo[0]), Math.min(olho[1], alvo[1]), Math.min(olho[2], alvo[2])], mx = [Math.max(olho[0], alvo[0]), Math.max(olho[1], alvo[1]), Math.max(olho[2], alvo[2])];
    (obstaculos || []).forEach(function (o) {
      var a = o.aabb; if (!a || a.min[0] > mx[0] || a.max[0] < mn[0] || a.min[1] > mx[1] || a.max[1] < mn[1] || a.min[2] > mx[2] || a.max[2] < mn[2]) return;
      n++;
      var tr = o.tris || [];
      for (var i = 0; i + 8 < tr.length; i += 9) {
        var t = segTriT(olho, alvo, [tr[i], tr[i + 1], tr[i + 2]], [tr[i + 3], tr[i + 4], tr[i + 5]], [tr[i + 6], tr[i + 7], tr[i + 8]]);
        if (t >= 0 && t <= tMax && (!melhor || t < melhor.t)) melhor = { t: t, id: o.id, nome: o.nome || o.id };
      }
    });
    return { livre: !melhor, por: melhor ? { id: melhor.id, nome: melhor.nome } : null, t: melhor ? Math.round(melhor.t * 1000) / 1000 : null,
      distOlho: melhor ? Math.round(melhor.t * L * 100) / 100 : null, comprimento: Math.round(L * 100) / 100, testados: n };
  }
  var IcarColisao = { NR10: NR10, zonaNR10: zonaNR10, visada: visada, pontoTri: pontoTri, segSeg: segSeg, segTri: segTri, segCruzaTri: segCruzaTri, obbVertices: obbVertices,
    pontoObb: pontoObb, obbCruzaTri: obbCruzaTri, obbTri: obbTri, segCruzaObb: segCruzaObb, obbSeg: obbSeg, aabbParte: aabbParte, verificar: verificar };
  global.IcarColisao = IcarColisao;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarColisao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

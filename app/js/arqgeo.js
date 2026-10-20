/* =====================================================================
 * arqgeo.js — GEOMETRIA PLANA DAS PRANCHAS DE ARQUITETURA (motor PURO,
 * ES5, sem DOM, Node-testável).
 *
 * Polígono = lista de pontos [x, z] (planta da cena: x para a direita, z
 * para BAIXO/SUL). Unidade: metro.
 *
 *   areaPol(P) · areaSinal(P) · bbox(P) · centroide(P) · perimetro(P)
 *   retCaixa(cx, cz, comp, larg, rotY)   os 4 cantos de uma caixa do BimEdit (parede, laje, pilar)
 *   uniaoArea(lista)        ÁREA EXATA da união de polígonos (qualquer simples, côncavos incluídos)
 *   intersecaoArea(A, B)    área de (união de A) ∩ (união de B) = uA + uB − u(A ∪ B)
 *   diferencaArea(A, B)     área de (união de A) − (união de B)
 *   pontoEmPol(p, P) · distPontoSeg(p, a, b) · distPolSeg(P, a, b)
 *   recortarSeg(a, b, P)    os pedaços do segmento ab que ficam DENTRO de P → [[t0, t1]…] (0..1)
 *   interSegSeg(a, b, c, d) ponto de cruzamento de dois segmentos (ou null)
 *   hachuraLinhas(P, passo, ang)  segmentos de hachura (45° por padrão) dentro de um polígono qualquer
 *
 * A UNIÃO é exata (não é malha de pontos): corta-se o plano em faixas verticais entre
 * todos os x críticos (vértices e cruzamentos de aresta); dentro de uma faixa nenhuma
 * borda se cruza, então o comprimento coberto varia em linha reta e a regra do ponto
 * médio dá a área sem erro. O teste confere retângulos sobrepostos, em L e furos.
 * Teste: tools/ (índices das pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  var EPS = 1e-9;
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function areaSinal(P) {
    var s = 0, n = P.length;
    for (var i = 0, j = n - 1; i < n; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]);
    return s / 2;
  }
  function areaPol(P) { return Math.abs(areaSinal(P)); }
  function perimetro(P) {
    var s = 0;
    for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
    return s;
  }
  function bbox(P) {
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    arr(P).forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; });
    return x0 === Infinity ? null : [x0, z0, x1, z1];
  }
  function centroide(P) {
    var a2 = 0, cx = 0, cz = 0;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var f = P[j][0] * P[i][1] - P[i][0] * P[j][1];
      a2 += f; cx += (P[j][0] + P[i][0]) * f; cz += (P[j][1] + P[i][1]) * f;
    }
    if (Math.abs(a2) < EPS) { var b = bbox(P); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]; }
    return [cx / (3 * a2), cz / (3 * a2)];
  }
  /* a caixa do BimEdit no plano: comprimento no eixo X local, largura no Z local, centro (cx, cz) */
  function retCaixa(cx, cz, comp, larg, rotY) {
    var c = Math.cos(rotY || 0), s = Math.sin(rotY || 0), hu = comp / 2, hv = larg / 2, out = [];
    [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].forEach(function (q) {
      out.push([cx + q[0] * c + q[1] * s, cz - q[0] * s + q[1] * c]);
    });
    return out;
  }
  function pontoEmPol(p, P) {
    var dentro = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
      if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  function distPontoSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > EPS ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx, qz = a[1] + t * dz;
    return Math.sqrt((p[0] - qx) * (p[0] - qx) + (p[1] - qz) * (p[1] - qz));
  }
  function interSegSeg(a, b, c, d) {
    var r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1], den = r0 * s1 - r1 * s0;
    if (Math.abs(den) < EPS) return null;
    var t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den, u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [a[0] + t * r0, a[1] + t * r1, t, u];
  }
  /* menor distância entre o polígono (contorno) e o segmento ab; 0 quando se tocam ou se cruzam */
  function distPolSeg(P, a, b) {
    var m = Infinity, i, q;
    for (i = 0; i < P.length; i++) {
      var p1 = P[i], p2 = P[(i + 1) % P.length];
      if (interSegSeg(p1, p2, a, b)) return 0;
      q = distPontoSeg(p1, a, b); if (q < m) m = q;
      q = distPontoSeg(a, p1, p2); if (q < m) m = q;
      q = distPontoSeg(b, p1, p2); if (q < m) m = q;
    }
    return m;
  }
  /* os pedaços [t0, t1] (0..1) do segmento ab DENTRO de P (regra par-ímpar) */
  function recortarSeg(a, b, P) {
    var ts = [0, 1], i;
    for (i = 0; i < P.length; i++) { var x = interSegSeg(a, b, P[i], P[(i + 1) % P.length]); if (x) ts.push(x[2]); }
    ts.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-9) continue;
      var tm = (ts[i] + ts[i + 1]) / 2;
      if (pontoEmPol([a[0] + tm * (b[0] - a[0]), a[1] + tm * (b[1] - a[1])], P)) {
        if (out.length && Math.abs(out[out.length - 1][1] - ts[i]) < 1e-9) out[out.length - 1][1] = ts[i + 1]; else out.push([ts[i], ts[i + 1]]);
      }
    }
    return out;
  }

  /* -------------------------------------------------------- UNIÃO EXATA */
  function uniaoArea(lista) {
    var polys = arr(lista).filter(function (P) { return P && P.length >= 3; });
    if (!polys.length) return 0;
    var edges = [], xs = [];
    polys.forEach(function (P, ip) {
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length];
        xs.push(a[0]);
        if (Math.abs(b[0] - a[0]) < EPS) continue;   /* aresta vertical: não corta a faixa */
        edges.push(a[0] < b[0] ? { p: ip, x0: a[0], z0: a[1], x1: b[0], z1: b[1] } : { p: ip, x0: b[0], z0: b[1], x1: a[0], z1: a[1] });
      }
    });
    var i, j;
    for (i = 0; i < edges.length; i++) for (j = i + 1; j < edges.length; j++) {
      var e = edges[i], f = edges[j];
      if (e.x1 <= f.x0 + EPS || f.x1 <= e.x0 + EPS) continue;
      var x = interSegSeg([e.x0, e.z0], [e.x1, e.z1], [f.x0, f.z0], [f.x1, f.z1]);
      if (x) xs.push(x[0]);
    }
    xs.sort(function (p, q) { return p - q; });
    var area = 0;
    for (var k = 0; k + 1 < xs.length; k++) {
      var xa = xs[k], xb = xs[k + 1];
      if (xb - xa < 1e-9) continue;
      var xm = (xa + xb) / 2, porPol = {};
      edges.forEach(function (ed) {
        if (ed.x0 < xm && ed.x1 > xm) {
          var z = ed.z0 + (ed.z1 - ed.z0) * (xm - ed.x0) / (ed.x1 - ed.x0);
          (porPol[ed.p] = porPol[ed.p] || []).push(z);
        }
      });
      var iv = [];
      Object.keys(porPol).forEach(function (p) {
        var zs = porPol[p].sort(function (q, r) { return q - r; });
        for (var m = 0; m + 1 < zs.length; m += 2) iv.push([zs[m], zs[m + 1]]);
      });
      iv.sort(function (p, q) { return p[0] - q[0]; });
      var tot = 0, fim = -Infinity;
      iv.forEach(function (v) {
        if (v[1] <= fim) return;
        tot += v[1] - Math.max(v[0], fim); fim = v[1];
      });
      area += tot * (xb - xa);
    }
    return area;
  }
  function intersecaoArea(A, B) {
    return Math.max(0, uniaoArea(A) + uniaoArea(B) - uniaoArea(arr(A).concat(arr(B))));
  }
  function diferencaArea(A, B) {
    return Math.max(0, uniaoArea(A) - intersecaoArea(A, B));
  }

  /* HACHURA: linhas paralelas a `ang` graus (45 por padrão) dentro de um polígono qualquer (par-ímpar); passo em metros
     do desenho (quem chama converte do papel). → [[x1, z1, x2, z2]…] */
  function hachuraLinhas(P, passo, ang) {
    var b = bbox(P); if (!b || !(passo > 0)) return [];
    var a = (ang == null ? 45 : ang) * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a), nx = -dz, nz = dx;   /* normal da família de retas */
    var cs = P.map(function (p) { return p[0] * nx + p[1] * nz; }), c0 = Math.min.apply(null, cs), c1 = Math.max.apply(null, cs), out = [];
    var tmax = Math.sqrt((b[2] - b[0]) * (b[2] - b[0]) + (b[3] - b[1]) * (b[3] - b[1])) + 1;
    var ctr = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    for (var c = Math.ceil(c0 / passo) * passo; c <= c1 + 1e-9; c += passo) {
      /* um ponto da reta n·p = c: o do centro da caixa deslocado pela normal */
      var cc = ctr[0] * nx + ctr[1] * nz, p0 = [ctr[0] + (c - cc) * nx, ctr[1] + (c - cc) * nz];
      var A = [p0[0] - dx * tmax, p0[1] - dz * tmax], B = [p0[0] + dx * tmax, p0[1] + dz * tmax];
      recortarSeg(A, B, P).forEach(function (t) {
        out.push([A[0] + (B[0] - A[0]) * t[0], A[1] + (B[1] - A[1]) * t[0], A[0] + (B[0] - A[0]) * t[1], A[1] + (B[1] - A[1]) * t[1]]);
      });
    }
    return out;
  }

  var ArqGeo = {
    EPS: EPS, fin: fin, areaSinal: areaSinal, areaPol: areaPol, perimetro: perimetro, bbox: bbox, centroide: centroide, retCaixa: retCaixa,
    pontoEmPol: pontoEmPol, distPontoSeg: distPontoSeg, interSegSeg: interSegSeg, distPolSeg: distPolSeg, recortarSeg: recortarSeg,
    uniaoArea: uniaoArea, intersecaoArea: intersecaoArea, diferencaArea: diferencaArea, hachuraLinhas: hachuraLinhas
  };
  global.ArqGeo = ArqGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

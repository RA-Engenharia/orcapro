/* =====================================================================
 * incgeo.js — a REDE DE CAMINHAMENTO de um pavimento (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Para medir "distância de caminhamento" (IT 08 Tabela 5), "distância a percorrer até o extintor" (IT 16 4.11: percurso real) e
 * "ponto da rota a mais de 15 m da placa / da luminária" (IT 15 6.1.3 b; IT 13 5.4), o pavimento vira uma MALHA de células:
 *   - célula LIVRE = o centro cai dentro de um ambiente delimitado do pavimento, ou na passagem de uma porta;
 *   - a ligação entre duas células é CORTADA quando o segmento entre os centros cruza o eixo de uma parede (fora do vão das portas)
 *     — a parede de 0,10 m não "vaza" mesmo com célula de 0,20 m;
 *   - Dijkstra com 16 direções (passos retos, diagonais e "de cavalo"): a malha mede até ~5 % A MAIS que a geodésica real
 *     (lado seguro para reprovar distância; dito na tela).
 * Janela não é passagem. Ambiente não delimitado não entra (o auditor avisa).
 *
 *   IncGeo.rede(L, pav, { h }) → R { pav, h, nx, nz, x0, z0, livre[], lista[], amb[] (id do ambiente da célula), portas[] }
 *   IncGeo.distancias(R, pontos[[x,z]], limite) → Float64Array (multi-fonte)   ·   IncGeo.celula(R, p) → { i, d } | null
 *   IncGeo.centro(R, i) → [x, z]   ·   IncGeo.caminho(R, dist, i) → [[x,z]…] (volta pelo gradiente até a fonte)
 * L = EsqAuto.leitura(estado, avaliarFam) (paredes, ambientes com trechos, vãos).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoN(r) { return [Math.sin(r), Math.cos(r)]; }
  function ptParede(w, t, s) { var u = eixoU(w.rotY), n = eixoN(w.rotY); return [w.cx + u[0] * t + n[0] * s, w.cz + u[1] * t + n[1] * s]; }
  function dentro(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c;
    }
    return c;
  }
  function cruza(a, b, c, d) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  var VIZ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];
  var PASSO = 0.20;          /* critério RA: célula de 0,20 m (a parede corta pela linha do eixo, não pela célula) */
  var MAX_CEL = 60000;       /* teto de células (tempo de cálculo): acima disso o passo cresce */

  /* os vãos de PORTA da parede (passagem): [t0, t1] no eixo da parede */
  function vaosPorta(L, w) { return arr(L.vaos).filter(function (v) { return v.parede === w.id && v.tipo === "porta"; }).map(function (v) { return [v.t - v.largura / 2, v.t + v.largura / 2, v]; }); }

  function rede(L, pav, o) {
    o = o || {};
    var ambs = arr(L.ambientes).filter(function (a) { return a.pav === pav && arr(a.pts).length >= 3; });
    var walls = arr(L.paredes).filter(function (w) { return w.pav === pav; });
    if (!ambs.length) return null;
    var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    ambs.forEach(function (a) { a.pts.forEach(function (p) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }); });
    minx -= 0.5; minz -= 0.5; maxx += 0.5; maxz += 0.5;
    var h = num(o.h, PASSO), area = (maxx - minx) * (maxz - minz);
    if (area / (h * h) > MAX_CEL) h = Math.sqrt(area / MAX_CEL);
    var nx = Math.max(1, Math.ceil((maxx - minx) / h)), nz = Math.max(1, Math.ceil((maxz - minz) / h));
    /* segmentos que BLOQUEIAM: o eixo de cada parede menos os vãos de porta; e as PASSAGENS das portas (retângulo do vão na espessura) */
    var segs = [], portas = [];
    walls.forEach(function (w) {
      var c2 = num(w.comprimento, 0) / 2, ab = vaosPorta(L, w).sort(function (x, y) { return x[0] - y[0]; }), t = -c2;
      ab.forEach(function (q) {
        if (q[0] > t + 1e-6) segs.push([ptParede(w, t, 0), ptParede(w, Math.min(q[0], c2), 0), w.id]);
        t = Math.max(t, q[1]);
        var e = num(w.espessura, 0.15) / 2 + 0.12;
        portas.push({ id: q[2].id, parede: w.id, t: q[2].t, largura: q[2].largura, pts: [ptParede(w, q[0], -e), ptParede(w, q[1], -e), ptParede(w, q[1], e), ptParede(w, q[0], e)], v: q[2], w: w });
      });
      if (t < c2 - 1e-6) segs.push([ptParede(w, t, 0), ptParede(w, c2, 0), w.id]);
    });
    /* índice dos segmentos por faixa de 2 m (a ligação só testa os segmentos perto) */
    var B = 2, idx = {};
    function chaveB(ix, iz) { return ix + ":" + iz; }
    segs.forEach(function (s, k) {
      var x0 = Math.floor((Math.min(s[0][0], s[1][0]) - minx) / B), x1 = Math.floor((Math.max(s[0][0], s[1][0]) - minx) / B);
      var z0 = Math.floor((Math.min(s[0][1], s[1][1]) - minz) / B), z1 = Math.floor((Math.max(s[0][1], s[1][1]) - minz) / B);
      for (var ix = x0; ix <= x1; ix++) for (var iz = z0; iz <= z1; iz++) { var ch = chaveB(ix, iz); (idx[ch] = idx[ch] || []).push(k); }
    });
    var livre = new Array(nx * nz), amb = new Array(nx * nz), lista = [];
    for (var iz = 0; iz < nz; iz++) for (var ix = 0; ix < nx; ix++) {
      var i = iz * nx + ix, c = [minx + (ix + 0.5) * h, minz + (iz + 0.5) * h], a = null, k;
      for (k = 0; k < ambs.length; k++) if (dentro(c, ambs[k].pts)) { a = ambs[k].id; break; }
      var ok = a != null;
      if (!ok) for (k = 0; k < portas.length; k++) if (dentro(c, portas[k].pts)) { ok = true; a = "porta:" + portas[k].id; break; }
      livre[i] = ok; amb[i] = a; if (ok) lista.push(i);
    }
    var R = { pav: pav, h: h, nx: nx, nz: nz, x0: minx, z0: minz, livre: livre, lista: lista, amb: amb, portas: portas, segs: segs, idx: idx, B: B };
    return R;
  }
  function centro(R, i) { var ix = i % R.nx, iz = (i - ix) / R.nx; return [R.x0 + (ix + 0.5) * R.h, R.z0 + (iz + 0.5) * R.h]; }
  function bloqueado(R, a, b) {
    var seen = {}, x0 = Math.floor((Math.min(a[0], b[0]) - R.x0) / R.B), x1 = Math.floor((Math.max(a[0], b[0]) - R.x0) / R.B);
    var z0 = Math.floor((Math.min(a[1], b[1]) - R.z0) / R.B), z1 = Math.floor((Math.max(a[1], b[1]) - R.z0) / R.B);
    for (var ix = x0; ix <= x1; ix++) for (var iz = z0; iz <= z1; iz++) {
      var L = R.idx[ix + ":" + iz]; if (!L) continue;
      for (var k = 0; k < L.length; k++) { var s = R.segs[L[k]]; if (seen[L[k]]) continue; seen[L[k]] = 1; if (cruza(a, b, s[0], s[1])) return true; }
    }
    return false;
  }
  function adj(R) {
    if (R.adj) return R.adj;
    var A = {};
    R.lista.forEach(function (i) {
      var ix = i % R.nx, iz = (i - ix) / R.nx, c = centro(R, i), l = [];
      for (var k = 0; k < VIZ.length; k++) {
        var jx = ix + VIZ[k][0], jz = iz + VIZ[k][1]; if (jx < 0 || jz < 0 || jx >= R.nx || jz >= R.nz) continue;
        var j = jz * R.nx + jx; if (!R.livre[j]) continue;
        /* passo longo: a célula do meio (arredondada) também tem de ser livre */
        if (Math.abs(VIZ[k][0]) + Math.abs(VIZ[k][1]) > 2) { var mx = ix + Math.round(VIZ[k][0] / 2), mz = iz + Math.round(VIZ[k][1] / 2); if (!R.livre[mz * R.nx + mx]) continue; }
        if (Math.abs(VIZ[k][0]) === 1 && Math.abs(VIZ[k][1]) === 1 && (!R.livre[iz * R.nx + jx] || !R.livre[jz * R.nx + ix])) continue;
        var cj = centro(R, j);
        if (bloqueado(R, c, cj)) continue;
        l.push(j, R.h * Math.sqrt(VIZ[k][0] * VIZ[k][0] + VIZ[k][1] * VIZ[k][1]));
      }
      A[i] = l;
    });
    R.adj = A;
    return A;
  }
  /* a célula livre mais próxima do ponto que o ponto "enxerga" (sem parede no meio) */
  function celula(R, p, raioMax) {
    var best = -1, d0 = Infinity, rm = num(raioMax, 1.0), ix0 = Math.floor((p[0] - R.x0) / R.h), iz0 = Math.floor((p[1] - R.z0) / R.h), r = Math.ceil(rm / R.h) + 1;
    for (var iz = Math.max(0, iz0 - r); iz <= Math.min(R.nz - 1, iz0 + r); iz++) for (var ix = Math.max(0, ix0 - r); ix <= Math.min(R.nx - 1, ix0 + r); ix++) {
      var i = iz * R.nx + ix; if (!R.livre[i]) continue;
      var c = centro(R, i), d = Math.sqrt((c[0] - p[0]) * (c[0] - p[0]) + (c[1] - p[1]) * (c[1] - p[1]));
      if (d < d0 - 1e-12 && d <= rm && !bloqueado(R, p, c)) { d0 = d; best = i; }
    }
    return best < 0 ? null : { i: best, d: d0 };
  }
  /* Dijkstra multi-fonte (heap binário). pontos = [[x,z], …] ou [{ i, d }]; limite: não expande além */
  function distancias(R, pontos, limite) {
    var N = R.nx * R.nz, dist = new Float64Array(N), A = adj(R), lim = limite == null ? Infinity : limite, i;
    for (i = 0; i < N; i++) dist[i] = Infinity;
    var hd = [], hv = [];
    function push(v, d) { hd.push(d); hv.push(v); var k = hd.length - 1; while (k > 0) { var pa = (k - 1) >> 1; if (hd[pa] <= hd[k]) break; var t = hd[pa]; hd[pa] = hd[k]; hd[k] = t; t = hv[pa]; hv[pa] = hv[k]; hv[k] = t; k = pa; } }
    function pop() { var lastD = hd.pop(), lastV = hv.pop(); if (hd.length) { hd[0] = lastD; hv[0] = lastV; var k = 0, n = hd.length; for (;;) { var l = 2 * k + 1, r = l + 1, m = k; if (l < n && hd[l] < hd[m]) m = l; if (r < n && hd[r] < hd[m]) m = r; if (m === k) break; var t = hd[m]; hd[m] = hd[k]; hd[k] = t; t = hv[m]; hv[m] = hv[k]; hv[k] = t; k = m; } } }
    arr(pontos).forEach(function (p) {
      var c = p && p.i != null ? p : celula(R, p);
      if (!c) return;
      if (c.d < dist[c.i]) { dist[c.i] = c.d; push(c.i, c.d); }
    });
    while (hd.length) {
      var d = hd[0], v = hv[0]; pop();
      if (d > dist[v] || d > lim) continue;
      var l = A[v] || [];
      for (var k = 0; k < l.length; k += 2) { var u = l[k], nd = d + l[k + 1]; if (nd < dist[u]) { dist[u] = nd; if (nd <= lim) push(u, nd); } }
    }
    return dist;
  }
  /* o caminho da célula i até a fonte (desce pelo gradiente) — para "Mostrar no 3D" e para a seta da placa */
  function caminho(R, dist, i, maxPassos) {
    var A = adj(R), out = [centro(R, i)], cur = i, n = 0, lim = maxPassos || 4000;
    while (n++ < lim && dist[cur] > R.h * 0.75) {
      var l = A[cur] || [], best = -1, bd = dist[cur];
      for (var k = 0; k < l.length; k += 2) if (dist[l[k]] < bd - 1e-9) { bd = dist[l[k]]; best = l[k]; }
      if (best < 0) break;
      cur = best; out.push(centro(R, cur));
    }
    return out;
  }
  /* a célula mais longe (finita) entre as do filtro */
  function maisLonge(R, dist, filtro) {
    var best = -1, bd = -1;
    R.lista.forEach(function (i) { if (filtro && !filtro(i)) return; var d = dist[i]; if (isFinite(d) && d > bd) { bd = d; best = i; } });
    return best < 0 ? null : { i: best, d: bd, p: centro(R, best), amb: R.amb[best] };
  }
  function semCaminho(R, dist, filtro) { return R.lista.filter(function (i) { return (!filtro || filtro(i)) && !isFinite(dist[i]); }); }

  var IncGeo = { rede: rede, distancias: distancias, celula: celula, centro: centro, caminho: caminho, maisLonge: maisLonge, semCaminho: semCaminho, bloqueado: bloqueado,
    ptParede: ptParede, eixoU: eixoU, eixoN: eixoN, dentro: dentro, PASSO: PASSO };
  global.IncGeo = IncGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = IncGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * madt3tu.js — ETAPA 1 do telhado de 4 águas em planta ORTOGONAL qualquer (T, U, L...): SÓ A GEOMETRIA. Motor PURO, ES5, sem DOM, Node-testável.
 * NÃO está ligado ao fluxo de cálculo (nem ao madcobertura.js, nem ao worker, nem ao index.html): é a base geométrica da T3TU. O L do `madt3l.js` continua intocado.
 *
 * MÉTODO (decisão de engenharia 21/11/2026): MESMA inclinação em todas as águas e MESMO beiral. Num polígono ortogonal assim, a água em (x, z) tem altura
 *     H(x, z) = Hp − i·e + i·dist(x, z),   dist = o maior s tal que o QUADRADO de meio-lado s centrado no ponto cabe na planta com o beiral (distância L∞ à borda)
 * — é o esqueleto reto (straight skeleton) do contorno ortogonal, com espigões e rincões a 45° em planta e cumeeiras no eixo da largura de cada asa.
 * Isso é igual a   dist = máx sobre os RETÂNGULOS MAXIMAIS R da planta (com o beiral)  de  min(distâncias aos 4 lados de R)   (o telhado de 4 águas de cada asa; a união é o máximo).
 * O L do madt3l.js usa exatamente isto (h = max(h_A, h_B)); aqui vale para T, U, L e qualquer ortogonal. Larguras iguais: a cumeeira da asa perpendicular encontra a da principal
 * no mesmo nível; perna mais estreita: a cumeeira dela é mais baixa e morre na ÁGUA da principal, no vértice V, para onde convergem os rincões.
 *
 * COMO SAEM AS ÁGUAS: cada lado de cada retângulo maximal (já com o beiral) é um plano; a parte da água é o cone do lado dentro do retângulo, menos onde outro retângulo é mais alto.
 * "Mais alto" é a união de 4 semiplanos por retângulo; a divisão em ordem (primeiro lado que fica abaixo do plano, os anteriores acima) dá peças CONVEXAS DISJUNTAS (soma das áreas exata).
 * Peças do mesmo plano que se tocam formam uma ÁGUA. As linhas (cumeeira, espigão, rincão) saem das bordas entre águas de planos diferentes.
 * Limites: planta ORTOGONAL simples, sem furo (o pátio fica para outra etapa); fenda (U) menor que 2·beiral fecha com o beiral e sai AVISO (o número de cantos côncavos muda).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL = 1e-9, EPS = 1e-6;
  function rd(v, n) { var f = Math.pow(10, n == null ? 4 : n); return Math.round(v * f) / f; }
  function areaAssin(P) { var s = 0, k; for (k = 0; k < P.length; k++) { var a = P[k], b = P[(k + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function pip(P, x, z) {
    var dentro = false, n = P.length, k, j = n - 1;
    for (k = 0; k < n; k++) {
      var a = P[k], b = P[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
      j = k;
    }
    return dentro;
  }
  function unicos(v) { var o = v.slice().sort(function (a, b) { return a - b; }), r = []; o.forEach(function (x) { if (!r.length || x - r[r.length - 1] > EPS) r.push(x); }); return r; }

  /* retângulos MAXIMAIS de uma região dada por "inside(cx, cz)" sobre a grade comprimida (xs, zs) */
  function maximais(xs, zs, inside) {
    var nx = xs.length - 1, nz = zs.length - 1, ci = [], i, j, i0, i1, j0, j1, out = [];
    for (i = 0; i < nx; i++) { ci.push([]); for (j = 0; j < nz; j++) ci[i].push(inside((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)); }
    function todos(a0, a1, b0, b1) { var p, q; if (a0 < 0 || b0 < 0 || a1 >= nx || b1 >= nz) return false; for (p = a0; p <= a1; p++) for (q = b0; q <= b1; q++) if (!ci[p][q]) return false; return true; }
    for (i0 = 0; i0 < nx; i0++) for (i1 = i0; i1 < nx; i1++) for (j0 = 0; j0 < nz; j0++) for (j1 = j0; j1 < nz; j1++) {
      if (!todos(i0, i1, j0, j1)) continue;
      if (todos(i0 - 1, i1, j0, j1) || todos(i0, i1 + 1, j0, j1) || todos(i0, i1, j0 - 1, j1) || todos(i0, i1, j0, j1 + 1)) continue;
      out.push({ x0: xs[i0], x1: xs[i1 + 1], z0: zs[j0], z1: zs[j1 + 1] });
    }
    return out;
  }
  /* os 4 lados de um retângulo como funções lineares d = a·x + b·z + c (distância para dentro): W, E, S, N */
  function lados(R) { return [[1, 0, -R.x0], [-1, 0, R.x1], [0, 1, -R.z0], [0, -1, R.z1]]; }
  function dd(f, x, z) { return f[0] * x + f[1] * z + f[2]; }
  function recorta(poly, f) {   /* mantém f(p) ≤ 0 (Sutherland–Hodgman; polígono convexo) */
    var out = [], n = poly.length, k;
    for (k = 0; k < n; k++) {
      var p = poly[k], q = poly[(k + 1) % n], fp = dd(f, p[0], p[1]), fq = dd(f, q[0], q[1]), ip = fp <= 1e-12, iq = fq <= 1e-12;
      if (ip) out.push(p);
      if (ip !== iq) { var t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  function areaP(P) { return Math.abs(areaAssin(P)); }
  function dif(f, g) { return [f[0] - g[0], f[1] - g[1], f[2] - g[2]]; }
  function soma(f, c) { return [f[0], f[1], f[2] + c]; }
  function neg(f) { return [-f[0], -f[1], -f[2]]; }

  /* comprimento de sobreposição colinear de dois segmentos (0 se não colineares) */
  function sobrepoe(a0, a1, b0, b1) {
    var dx = a1[0] - a0[0], dz = a1[1] - a0[1], L = Math.sqrt(dx * dx + dz * dz); if (L < EPS) return 0;
    var ux = dx / L, uz = dz / L;
    function perp(p) { return Math.abs((p[0] - a0[0]) * uz - (p[1] - a0[1]) * ux); }
    if (perp(b0) > 1e-6 || perp(b1) > 1e-6) return 0;
    var t0 = (b0[0] - a0[0]) * ux + (b0[1] - a0[1]) * uz, t1 = (b1[0] - a0[0]) * ux + (b1[1] - a0[1]) * uz, lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(L, Math.max(t0, t1));
    return Math.max(0, hi - lo);
  }

  /** GEOMETRIA do telhado de 4 águas sobre a planta ortogonal `contorno` ([[x, z], ...], entre eixos de parede). p: { incl (fração), beiral (m), peDireito (m), baseZ (m) }. */
  function geometria(contorno, p) {
    p = p || {};
    var i = Number(p.incl), e = Number(p.beiral == null ? 0 : p.beiral), Hp = Number(p.peDireito == null ? 3 : p.peDireito) + Number(p.baseZ || 0), sc = Math.sqrt(1 + i * i);
    if (!(i > 0.05)) throw new Error("madt3tu: inclinação mínima de 5 % (telha)");
    if (!(e >= 0 && e <= 2.5)) throw new Error("madt3tu: beiral fora de 0 a 2,5 m");
    var P = (contorno || []).map(function (q) { return [Number(q[0]), Number(q[1])]; }), n = P.length, k, avisos = [];
    if (n < 4 || n % 2) throw new Error("madt3tu: contorno ortogonal precisa de número par de vértices (>= 4)");
    if (areaAssin(P) < 0) P.reverse();
    var nConv = 0, nConc = 0;
    for (k = 0; k < n; k++) {
      var p0 = P[(k + n - 1) % n], p1 = P[k], p2 = P[(k + 1) % n], u = [p1[0] - p0[0], p1[1] - p0[1]], v = [p2[0] - p1[0], p2[1] - p1[1]], lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (!(lu > 0.2 && lv > 0.2)) throw new Error("madt3tu: lado menor que 0,20 m");
      if (Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv) > 0.02) throw new Error("madt3tu: o contorno não é ortogonal (ângulo diferente de 90°)");
      if (u[0] * v[1] - u[1] * v[0] > 0) nConv++; else nConc++;
    }
    var perim = 0; for (k = 0; k < n; k++) perim += Math.sqrt(Math.pow(P[(k + 1) % n][0] - P[k][0], 2) + Math.pow(P[(k + 1) % n][1] - P[k][1], 2));
    var A0 = areaAssin(P);
    /* 1) retângulos maximais da planta de paredes, 2) com o beiral, 3) maximais da união com o beiral */
    var gx = unicos(P.map(function (q) { return q[0]; })), gz = unicos(P.map(function (q) { return q[1]; }));
    var RP = maximais(gx, gz, function (x, z) { return pip(P, x, z); });
    if (!RP.length) throw new Error("madt3tu: não achei retângulos na planta");
    var RE0 = RP.map(function (R) { return { x0: R.x0 - e, x1: R.x1 + e, z0: R.z0 - e, z1: R.z1 + e }; });
    function emAlgum(x, z) { var q; for (q = 0; q < RE0.length; q++) if (x >= RE0[q].x0 - 1e-12 && x <= RE0[q].x1 + 1e-12 && z >= RE0[q].z0 - 1e-12 && z <= RE0[q].z1 + 1e-12) return true; return false; }
    var ex = [], ez = []; RE0.forEach(function (R) { ex.push(R.x0, R.x1); ez.push(R.z0, R.z1); });
    var R = maximais(unicos(ex), unicos(ez), emAlgum), nR = R.length;
    var Hb = Hp - i * e;       /* cota do beiral (d = 0) */
    var S = R.map(lados);

    /* altura (em metros de "corrida" d) e plano ativo em um ponto */
    var planos = [], chave = {};
    function idPlano(f) { var key = f[0] + "," + f[1] + "," + (Math.round(f[2] * 1e5) / 1e5 + 0).toFixed(5); if (chave[key] == null) { chave[key] = planos.length; planos.push({ id: planos.length, f: f.slice(), areaProj: 0, aguas: [] }); } return chave[key]; }
    var planoDe = R.map(function (r, ri) { return S[ri].map(function (f) { return idPlano(f); }); });
    function ativo(x, z) {
      var best = -1e18, bi = -1, bs = -1, q, s;
      for (q = 0; q < nR; q++) {
        var m = 1e18, ms = -1;
        for (s = 0; s < 4; s++) { var d = dd(S[q][s], x, z); if (d < m) { m = d; ms = s; } }
        if (m > best + 1e-12) { best = m; bi = q; bs = ms; }
      }
      return { d: best, plano: bi < 0 ? -1 : planoDe[bi][bs] };
    }
    function altura(x, z) { var a = ativo(x, z); return a.d < 0 ? null : Hb + i * a.d; }

    /* 2) peças convexas disjuntas por (retângulo, lado) */
    var pecas = [], ri, si, rj, mj, sj;
    for (ri = 0; ri < nR; ri++) for (si = 0; si < 4; si++) {
      var Pi = S[ri][si], r = R[ri], poly = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
      for (sj = 0; sj < 4 && poly.length; sj++) if (sj !== si) poly = recorta(poly, dif(Pi, S[ri][sj]));
      var lista = poly.length >= 3 ? [poly] : [];
      for (rj = 0; rj < nR && lista.length; rj++) {
        if (rj === ri) continue;
        var novas = [];
        lista.forEach(function (pc) {
          for (mj = 0; mj < 4; mj++) {
            var q = pc, jj;
            for (jj = 0; jj < mj && q.length; jj++) q = recorta(q, soma(dif(Pi, S[rj][jj]), rj > ri ? 1e-7 : -1e-7));                    /* lados anteriores ACIMA do plano (índice maior: estritamente; menor: acima ou igual — plano idêntico não está abaixo) */
            if (q.length) q = recorta(q, rj > ri ? soma(dif(S[rj][mj], Pi), -1e-7) : soma(dif(S[rj][mj], Pi), 1e-7));                       /* este lado ABAIXO (ou igual, se o retângulo é de índice maior; estritamente, se menor) */
            if (q.length >= 3 && areaP(q) > 1e-5) novas.push(q);
          }
        });
        lista = novas;
      }
      lista.forEach(function (pc) { pecas.push({ plano: planoDe[ri][si], poly: pc, area: areaP(pc), ret: ri }); });
    }
    /* 3) águas = peças do mesmo plano que se tocam */
    var pai = pecas.map(function (_, q) { return q; });
    function raiz(q) { while (pai[q] !== q) { pai[q] = pai[pai[q]]; q = pai[q]; } return q; }
    function tocam(A, B) {
      var a, b;
      for (a = 0; a < A.length; a++) for (b = 0; b < B.length; b++) if (sobrepoe(A[a], A[(a + 1) % A.length], B[b], B[(b + 1) % B.length]) > 1e-6) return true;
      return false;
    }
    var q1, q2;
    for (q1 = 0; q1 < pecas.length; q1++) for (q2 = q1 + 1; q2 < pecas.length; q2++) if (pecas[q1].plano === pecas[q2].plano && tocam(pecas[q1].poly, pecas[q2].poly)) pai[raiz(q1)] = raiz(q2);
    var grupos = {}, aguas = [];
    pecas.forEach(function (pc, q) { var r0 = raiz(q); (grupos[r0] = grupos[r0] || []).push(pc); });
    Object.keys(grupos).forEach(function (key) {
      var L = grupos[key], ap = 0; L.forEach(function (pc) { ap += pc.area; });
      aguas.push({ plano: L[0].plano, pecas: L.map(function (pc) { return pc.poly; }), areaProj: ap, areaInc: ap * sc });
    });
    aguas.sort(function (a, b) { var ca = a.pecas[0][0], cb = b.pecas[0][0]; return a.plano - b.plano || ca[0] - cb[0] || ca[1] - cb[1]; });
    aguas.forEach(function (a, q) { a.id = "A" + (q + 1); planos[a.plano].areaProj += a.areaProj; planos[a.plano].aguas.push(a.id); });
    var areaProj = 0; aguas.forEach(function (a) { areaProj += a.areaProj; });

    /* 4) linhas: bordas entre águas de planos diferentes */
    var segs = {}, DL = 1e-4, vertices = [];
    pecas.forEach(function (pc) { pc.poly.forEach(function (q) { vertices.push(q); }); });
    pecas.forEach(function (pc) {
      var m = pc.poly.length, c;
      for (c = 0; c < m; c++) {
        var a = pc.poly[c], b = pc.poly[(c + 1) % m], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz); if (L < 1e-6) continue;
        var ux = dx / L, uz = dz / L, nx = uz, nz = -ux, cortes = [0, L];
        vertices.forEach(function (v) {     /* a borda é partida em todo vértice de outra peça que cai sobre ela: cada trecho tem UM vizinho */
          var t = (v[0] - a[0]) * ux + (v[1] - a[1]) * uz, pp = Math.abs((v[0] - a[0]) * uz - (v[1] - a[1]) * ux);
          if (pp < 1e-6 && t > 1e-6 && t < L - 1e-6) cortes.push(t);
        });
        cortes.sort(function (u, v) { return u - v; });
        for (var cq = 0; cq + 1 < cortes.length; cq++) {
          if (cortes[cq + 1] - cortes[cq] < 1e-6) continue;
          var tm = (cortes[cq] + cortes[cq + 1]) / 2, mx = a[0] + ux * tm, mz = a[1] + uz * tm, o = ativo(mx + DL * nx, mz + DL * nz);
          if (o.d < 0 || o.plano === pc.plano || pc.plano > o.plano) continue;     /* beiral; mesma água; a borda é registrada pelo plano de menor id */
          var key = pc.plano + "|" + o.plano; (segs[key] = segs[key] || []).push([[a[0] + ux * cortes[cq], a[1] + uz * cortes[cq]], [a[0] + ux * cortes[cq + 1], a[1] + uz * cortes[cq + 1]]]);
        }
      }
    });
    var linhas = [];
    Object.keys(segs).forEach(function (key) {
      var par = key.split("|").map(Number), L = segs[key], feito = true;
      while (feito) {
        feito = false;
        outer: for (var a = 0; a < L.length; a++) for (var b = a + 1; b < L.length; b++) {
          var A = L[a], B = L[b], dxa = A[1][0] - A[0][0], dza = A[1][1] - A[0][1], la = Math.sqrt(dxa * dxa + dza * dza);
          var tt = [0, la, ((B[0][0] - A[0][0]) * dxa + (B[0][1] - A[0][1]) * dza) / la, ((B[1][0] - A[0][0]) * dxa + (B[1][1] - A[0][1]) * dza) / la];
          var perpA = function (P2) { return Math.abs((P2[0] - A[0][0]) * dza - (P2[1] - A[0][1]) * dxa) / la; };
          if (perpA(B[0]) > 1e-6 || perpA(B[1]) > 1e-6) continue;
          var lo = Math.min(tt[0], tt[1], tt[2], tt[3]), hi = Math.max(tt[0], tt[1], tt[2], tt[3]), ov = Math.min(la, Math.max(tt[2], tt[3])) - Math.max(0, Math.min(tt[2], tt[3]));
          if (ov < -1e-6) continue;
          var ux = dxa / la, uz = dza / la; L.splice(b, 1); L[a] = [[A[0][0] + ux * lo, A[0][1] + uz * lo], [A[0][0] + ux * hi, A[0][1] + uz * hi]]; feito = true; break outer;
        }
      }
      L.forEach(function (sg) {
        var a = sg[0], b = sg[1], len = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); if (len < 1e-6) return;
        var f1 = planos[par[0]].f, f2 = planos[par[1]].f, paralelos = Math.abs(f1[0] + f2[0]) < 1e-9 && Math.abs(f1[1] + f2[1]) < 1e-9;
        var mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, h0 = altura(mx, mz), hv = altura(mx - uz * 2e-3, mz + ux * 2e-3), hw = altura(mx + uz * 2e-3, mz - ux * 2e-3);
        var vale = hv != null && hw != null && hv > h0 + 1e-9 && hw > h0 + 1e-9, tipo = vale ? "rincao" : (paralelos ? "cumeeira" : "espigao");
        var ya0 = Hb + i * dd(f1, a[0], a[1]), ya1 = Hb + i * dd(f1, b[0], b[1]), yb0 = Hb + i * dd(f2, a[0], a[1]), yb1 = Hb + i * dd(f2, b[0], b[1]);
        var p0 = [rd(a[0], 4), rd(a[1], 4), rd(ya0, 4)], p1 = [rd(b[0], 4), rd(b[1], 4), rd(ya1, 4)], dz3 = ya1 - ya0;
        linhas.push({ tipo: tipo, planos: par, p0: p0, p1: p1, comprimento: Math.sqrt(len * len + dz3 * dz3), comprimentoPlanta: len, erroAltura: Math.max(Math.abs(ya0 - yb0), Math.abs(ya1 - yb1)) });
      });
    });
    var ordem = { cumeeira: 0, espigao: 1, rincao: 2 }, cont = { cumeeira: 0, espigao: 0, rincao: 0 }, pre = { cumeeira: "CM", espigao: "E", rincao: "RC" };
    linhas.sort(function (a, b) { return ordem[a.tipo] - ordem[b.tipo] || a.p0[0] - b.p0[0] || a.p0[1] - b.p0[1] || a.p1[0] - b.p1[0] || a.p1[1] - b.p1[1]; });
    linhas.forEach(function (l) { l.id = pre[l.tipo] + (++cont[l.tipo]); });

    var esperada = A0 + perim * e + 4 * e * e;
    var ncExp = nConc; if (e > 0) { /* uma fenda mais estreita que 2·beiral fecha com o beiral */
      var nOff = 0; linhas.forEach(function (l) { if (l.tipo === "rincao") nOff++; }); if (nOff !== nConc) avisos.push("O beiral fecha uma fenda da planta (largura < 2 × beiral) ou funde águas: o número de rincões (" + nOff + ") difere dos cantos côncavos (" + nConc + ").");
    }
    return {
      ok: true, tipologia: "T3TU", contorno: P, nLados: n, nConvexos: nConv, nConcavos: ncExp, incl: i, beiral: e, Hp: Hp, cotaBeiral: Hb, sc: sc,
      retangulos: RP, retangulosBeiral: R, planos: planos, aguas: aguas, linhas: linhas,
      cumeeiras: linhas.filter(function (l) { return l.tipo === "cumeeira"; }), espigoes: linhas.filter(function (l) { return l.tipo === "espigao"; }), rincoes: linhas.filter(function (l) { return l.tipo === "rincao"; }),
      areaPlanta: Math.abs(A0), perimetro: perim, areaProj: areaProj, areaInc: areaProj * sc, areaProjEsperada: esperada, areaIncEsperada: esperada * sc,
      alturaMax: Math.max.apply(null, linhas.map(function (l) { return Math.max(l.p0[2], l.p1[2]); }).concat([Hp])), altura: altura, avisos: avisos
    };
  }

  var MadT3TU = { geometria: geometria, _maximais: maximais, _pip: pip };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3TU;
  else global.MadT3TU = MadT3TU;
})(typeof window !== "undefined" ? window : this);

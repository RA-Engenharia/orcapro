/* =====================================================================
 * madviga.js — VIGA CONTÍNUA por elementos finitos 1D (motor PURO, ES5,
 * sem DOM, Node-testável). Serve às peças fletidas da madeira que trabalham
 * como viga sobre apoios simples: barrotes, vigas do piso seco, terças,
 * vigas da cobertura, vergas.
 *
 * É a MESMA conta do `viga()` de calc_piso_v18.py (quiosque de referência,
 * PROJ-EST R03, 11/10/2026), refeita em JS para o sistema gerar o próprio
 * memorial. O teste tools/test-mad-viga.js roda os 141 casos capturados do
 * cálculo emitido e exige os mesmos números — se mudar algo aqui, a prova
 * diz o que mudou.
 *
 * MODELO
 *   · Elemento de viga de Euler-Bernoulli (2 gdl por nó: v, θ), malha de
 *     ≤ 3 cm entre os pontos notáveis (apoios, extremos, começo/fim de
 *     carga, cargas concentradas).
 *   · Carga distribuída por trecho [a, b, q] (kN/m), tomada no ponto médio
 *     de cada elemento, com vetor de cargas nodais equivalentes.
 *   · Carga concentrada [x, P] (kN) no nó mais próximo.
 *   · Apoio = v = 0 no nó mais próximo (rotação livre). Dois apoios a menos
 *     de 15 cm um do outro criam um binário falso: `juntarApoios` os funde
 *     (viga dupla, VP + pilar) — mesma regra do cálculo emitido.
 *   · Sinal: o do Python emitido (w = −u; carga positiva dá w negativo) —
 *     quem verifica usa |w|. Momento como no Python (M[e] = f[1],
 *     M[e+1] = −f[3]); chave das reações = String(x arredondado a 0,1 mm).
 *
 * UNIDADES: m, kN, kN·m; EI em kN·m².
 * Teste: node tools/test-mad-viga.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MadViga = {};
  var PASSO = 0.03;

  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function clamp(x, a, b) { return Math.min(Math.max(x, a), b); }

  /** índice do nó mais próximo (o primeiro, em empate — como np.argmin) */
  function maisProximo(nos, x) {
    var k = 0, best = Infinity;
    for (var i = 0; i < nos.length; i++) {
      var d = Math.abs(nos[i] - x);
      if (d < best) { best = d; k = i; }
    }
    return k;
  }

  /** resolve A·x = b (A densa n×n, simétrica positiva) por Cholesky; A e b não são alterados */
  function resolver(A, b) {
    var n = b.length, L = new Array(n), i, j, k, s;
    for (i = 0; i < n; i++) L[i] = new Float64Array(n);
    for (i = 0; i < n; i++) {
      for (j = 0; j <= i; j++) {
        s = A[i][j];
        for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) throw new Error("madviga: matriz não positiva (viga hipostática — faltam apoios)");
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    var y = new Float64Array(n), x = new Float64Array(n);
    for (i = 0; i < n; i++) { s = b[i]; for (k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (i = n - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }

  /**
   * MadViga.resolver(L, apoios, distribuidas, concentradas, EI, extras)
   *   distribuidas: [[a, b, q], ...] kN/m · concentradas: [[x, P], ...] kN
   * → { nos[], M[], V[] (|V| máx. nodal), w[] (flecha, + para baixo), reacoes: {x: R} }
   */
  MadViga.resolver = function (L, apoios, cd, cp, EI, extra) {
    cd = cd || []; cp = cp || []; extra = extra || [];
    var marcos = [0, L], i, e;
    apoios.forEach(function (a) { marcos.push(clamp(a, 0, L)); });
    extra.forEach(function (x) { marcos.push(clamp(x, 0, L)); });
    cd.forEach(function (t) { marcos.push(clamp(t[0], 0, L)); marcos.push(clamp(t[1], 0, L)); });
    var base = uniq(marcos);
    var nos = [];
    for (i = 0; i + 1 < base.length; i++) {
      var a = base[i], b = base[i + 1];
      var k = Math.max(1, Math.ceil((b - a) / PASSO));
      for (var j = 0; j < k; j++) nos.push(a + (b - a) * j / k);
    }
    nos.push(L);
    nos = uniq(nos.map(r6));
    var nn = nos.length, nd = 2 * nn;
    var K = new Array(nd);
    for (i = 0; i < nd; i++) K[i] = new Float64Array(nd);
    var F = new Float64Array(nd);
    var ke = [];
    for (e = 0; e < nn - 1; e++) {
      var le = nos[e + 1] - nos[e];
      var c = EI / (le * le * le);
      var km = [
        [12 * c, 6 * le * c, -12 * c, 6 * le * c],
        [6 * le * c, 4 * le * le * c, -6 * le * c, 2 * le * le * c],
        [-12 * c, -6 * le * c, 12 * c, -6 * le * c],
        [6 * le * c, 2 * le * le * c, -6 * le * c, 4 * le * le * c]];
      var idx = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      var xm = (nos[e] + nos[e + 1]) / 2;
      var q = 0;
      cd.forEach(function (t) { if (t[0] - 1e-9 <= xm && xm <= t[1] + 1e-9) q += t[2]; });
      var fe = [q * le / 2, q * le * le / 12, q * le / 2, -q * le * le / 12];
      for (var r = 0; r < 4; r++) {
        F[idx[r]] += fe[r];
        for (var s = 0; s < 4; s++) K[idx[r]][idx[s]] += km[r][s];
      }
      ke.push({ idx: idx, k: km, fe: fe });
    }
    cp.forEach(function (t) { F[2 * maisProximo(nos, t[0])] += t[1]; });
    var fixo = {}, fixos = [];
    apoios.forEach(function (a) { var g = 2 * maisProximo(nos, a); if (!fixo[g]) { fixo[g] = true; fixos.push(g); } });
    fixos.sort(function (p, q2) { return p - q2; });
    var liv = [];
    for (i = 0; i < nd; i++) if (!fixo[i]) liv.push(i);
    var A = liv.map(function (ri) { var row = new Float64Array(liv.length); for (var j2 = 0; j2 < liv.length; j2++) row[j2] = K[ri][liv[j2]]; return row; });
    var bb = liv.map(function (ri) { return F[ri]; });
    var ul = resolver(A, bb);
    var u = new Float64Array(nd);
    liv.forEach(function (ri, j3) { u[ri] = ul[j3]; });
    var reac = {};
    fixos.forEach(function (g) {
      var Rg = -F[g];
      for (var j4 = 0; j4 < nd; j4++) Rg += K[g][j4] * u[j4];
      reac[String(r4(nos[g / 2]))] = -Rg;
    });
    var M = new Float64Array(nn), V = new Float64Array(nn);
    ke.forEach(function (el, e2) {
      var f = [0, 0, 0, 0];
      for (var r2 = 0; r2 < 4; r2++) {
        var sm = -el.fe[r2];
        for (var s2 = 0; s2 < 4; s2++) sm += el.k[r2][s2] * u[el.idx[s2]];
        f[r2] = sm;
      }
      M[e2] = f[1];
      M[e2 + 1] = -f[3];
      V[e2] = Math.max(Math.abs(V[e2]), Math.abs(f[0]));
      V[e2 + 1] = Math.max(Math.abs(V[e2 + 1]), Math.abs(f[2]));
    });
    var w = new Float64Array(nn);
    for (i = 0; i < nn; i++) w[i] = -u[2 * i];
    return { nos: nos, M: M, V: V, w: w, reacoes: reac };
  };

  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function uniq(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; }), out = [];
    for (var i = 0; i < s.length; i++) if (!out.length || s[i] !== out[out.length - 1]) out.push(s[i]);
    return out;
  }

  /** apoios a menos de `tol` m um do outro viram um só, no meio (binário falso no MEF) */
  MadViga.juntarApoios = function (ap, quem, tol) {
    tol = tol == null ? 0.15 : tol;
    var par = ap.map(function (x, i) { return [x, quem ? quem[i] : i]; }).sort(function (a, b) { return a[0] - b[0]; });
    var grupos = [];
    par.forEach(function (t) {
      var g = grupos[grupos.length - 1];
      if (g && t[0] - g[g.length - 1][0] < tol) g.push(t); else grupos.push([t]);
    });
    return {
      apoios: grupos.map(function (g) { return g.reduce(function (s, t) { return s + t[0]; }, 0) / g.length; }),
      quem: grupos.map(function (g) { return g.map(function (t) { return t[1]; }); })
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MadViga;
  else global.MadViga = MadViga;
})(typeof window !== "undefined" ? window : this);

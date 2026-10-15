/* =====================================================================
 * acoanalise.js — ANÁLISE ESTRUTURAL de pórtico espacial (motor PURO,
 * ES5, sem DOM, Node-testável).
 *
 * Método dos deslocamentos (rigidez direta) com barra de Euler-Bernoulli de
 * 12 graus de liberdade (3 deslocamentos + 3 rotações por nó):
 *   · rótulas nas pontas (condensação estática dos GL liberados);
 *   · MOLA ROTACIONAL na ponta da barra (ligação semirrígida, `mola: { i: {ry, rz}, j: {…} }` em kN·m/rad): o GL da
 *     barra vira interno, ligado ao nó pela mola, e é condensado — mola 0 = rótula, mola ∞ = engaste (F4/D, 15/10/2026);
 *   · cargas nos nós, cargas distribuídas (uniforme/trapezoidal, inteira ou
 *     em trecho, nos eixos globais ou locais, vertical "projetada" para a
 *     cobertura) e peso próprio — vetor de cargas nodais equivalentes pelas
 *     funções de forma (integração de Gauss exata para carga linear);
 *   · apoios fixos e elásticos (molas);
 *   · barras SÓ DE TRAÇÃO (tirante, contraventamento em X de barra
 *     redonda): saem do modelo quando comprimidas, voltam quando tracionadas
 *     (iteração até o conjunto ativo parar de mudar);
 *   · ANÁLISE DE 2ª ORDEM (P-Δ e P-δ): matriz de rigidez geométrica
 *     consistente, iterada com o esforço normal até convergir — com as barras
 *     subdivididas, o efeito local P-δ também entra (NBR 8800, 4.9);
 *   · forças horizontais NOCIONAIS (imperfeição geométrica inicial) e
 *     redução de rigidez (imperfeição de material) por combinação — quem
 *     decide os valores é o js/acodimensionar.js (NBR 8800, 4.9.7).
 *
 * Sistema linear: numeração dos nós por Cuthill-McKee reverso (banda
 * estreita) e Cholesky em banda. Restrição = linha/coluna identidade.
 * GL sem rigidez (rotação de nó onde todas as barras são rotuladas) é
 * travado e AVISADO — nunca vira mecanismo silencioso.
 *
 * UNIDADES: kN, m (E e G em kN/m², A em m², I e J em m⁴, carga em kN/m).
 *
 * EIXOS LOCAIS: x do nó i para o j; y = direção da ALTURA da seção (`vy`
 * da barra, ortogonalizado — a alma do I, a alma do Ue); z = x × y.
 *   Iz = inércia em torno de z (a MAIOR do I: "Ix" do catálogo);
 *   Iy = inércia em torno de y (a menor: "Iy" do catálogo).
 * ESFORÇOS na seção (o que a parte da frente faz na de trás):
 *   N > 0 tração; Mz > 0 comprime a face +y (a de cima numa viga com y
 *   para cima: momento positivo = tração embaixo); My > 0 comprime a face −z.
 *
 * Conferido contra o programa de elementos finitos de pórtico PyNite
 * (Python, MIT) e soluções fechadas: tools/test-aco-analise.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; }

  var GAMMA_ACO = 78.5;   /* kN/m³ — peso específico do aço (NBR 6120:2019, Tabela 1) */

  /* ================================================ MATRIZES DO ELEMENTO */
  function zeros(n) { var m = new Array(n); for (var i = 0; i < n; i++) { m[i] = new Array(n); for (var j = 0; j < n; j++) m[i][j] = 0; } return m; }
  function rigidezLocal(E, G, A, Iy, Iz, J, L) {
    var k = zeros(12), EA = E * A / L, GJ = G * J / L;
    var a = 12 * E * Iz / (L * L * L), b = 6 * E * Iz / (L * L), c = 4 * E * Iz / L, d = 2 * E * Iz / L;
    var e = 12 * E * Iy / (L * L * L), f = 6 * E * Iy / (L * L), g = 4 * E * Iy / L, h = 2 * E * Iy / L;
    k[0][0] = EA; k[0][6] = -EA; k[6][6] = EA;
    k[3][3] = GJ; k[3][9] = -GJ; k[9][9] = GJ;
    /* plano x-y (v, θz) — inércia Iz */
    k[1][1] = a; k[1][5] = b; k[1][7] = -a; k[1][11] = b;
    k[5][5] = c; k[5][7] = -b; k[5][11] = d;
    k[7][7] = a; k[7][11] = -b; k[11][11] = c;
    /* plano x-z (w, θy) — inércia Iy; θy = −dw/dx */
    k[2][2] = e; k[2][4] = -f; k[2][8] = -e; k[2][10] = -f;
    k[4][4] = g; k[4][8] = f; k[4][10] = h;
    k[8][8] = e; k[8][10] = f; k[10][10] = g;
    for (var i = 0; i < 12; i++) for (var j = 0; j < i; j++) k[i][j] = k[j][i];
    return k;
  }
  /* rigidez geométrica consistente (P = esforço normal, tração > 0) */
  function rigidezGeometrica(P, L, Ip, A, wagner) {
    var k = zeros(12), q = P / L;
    var s1 = 6 / 5 * q, s2 = L / 10 * q, s3 = 2 * L * L / 15 * q, s4 = -L * L / 30 * q;
    /* v-θz */
    k[1][1] = s1; k[1][5] = s2; k[1][7] = -s1; k[1][11] = s2;
    k[5][5] = s3; k[5][7] = -s2; k[5][11] = s4;
    k[7][7] = s1; k[7][11] = -s2; k[11][11] = s3;
    /* w-θy */
    k[2][2] = s1; k[2][4] = -s2; k[2][8] = -s1; k[2][10] = -s2;
    k[4][4] = s3; k[4][8] = s2; k[4][10] = s4;
    k[8][8] = s1; k[8][10] = s2; k[10][10] = s3;
    /* torção (Wagner): P·Ip/(A·L) — SÓ quando pedido. O elemento não tem a rigidez ao EMPENAMENTO (Cw): com o termo de
       Wagner ligado, perfil I comprimido "flamba por torção" muito antes do real (roteiro: galpão de 20 m deu λcr = 2,09 com
       amplificação medida de 6,5 %). A flambagem por torção e flexo-torção de cada barra é verificada no dimensionamento
       (NBR 8800, Anexo E, com Cw). */
    if (wagner && Ip > 0 && A > 0) { var t = P * Ip / (A * L); k[3][3] = t; k[3][9] = -t; k[9][9] = t; }
    for (var i = 0; i < 12; i++) for (var j = 0; j < i; j++) k[i][j] = k[j][i];
    return k;
  }
  /* condensação estática dos GL liberados (rótulas): k e p no lugar */
  function condensar(k, p, lib) {
    for (var t = 0; t < lib.length; t++) {
      var r = lib[t], krr = k[r][r];
      if (!(Math.abs(krr) > 1e-30)) { for (var z = 0; z < 12; z++) { k[r][z] = 0; k[z][r] = 0; } if (p) p[r] = 0; continue; }
      for (var i = 0; i < 12; i++) {
        if (i === r) continue;
        var kir = k[i][r]; if (kir === 0) continue;
        for (var j = 0; j < 12; j++) { if (j === r) continue; k[i][j] -= kir * k[r][j] / krr; }
        if (p) p[i] -= kir * p[r] / krr;
      }
      for (var z2 = 0; z2 < 12; z2++) { k[r][z2] = 0; k[z2][r] = 0; }
      if (p) p[r] = 0;
    }
  }
  /* MOLA ROTACIONAL de ponta (ligação semirrígida): o GL r da barra (θe) liga-se ao do nó (θn) pela mola s — energia s·(θn − θe)²/2.
     Condensando θe: K*ij = Kij − Kir·Krj/(Krr + s) (i, j ≠ r); K*rj = s·Krj/(Krr + s); K*rr = s·Krr/(Krr + s); p*i = pi − Kir·pr/(Krr + s);
     p*r = s·pr/(Krr + s). s = 0 dá a condensação da rótula; s → ∞ devolve K. Depois da condensação das rótulas (a ordem não muda o
     resultado da condensação estática). molas = [{ r, s }] */
  function condensarMolas(k, p, molas) {
    for (var t = 0; t < molas.length; t++) {
      var r = molas[t].r, sm = molas[t].s, kr = k[r].slice(), pr = p ? p[r] : 0, den = kr[r] + sm;
      if (!(den > 1e-30)) continue;
      for (var i = 0; i < 12; i++) {
        if (i === r || kr[i] === 0) continue;
        for (var j = 0; j < 12; j++) { if (j === r) continue; k[i][j] -= kr[i] * kr[j] / den; }
        if (p) p[i] -= kr[i] * pr / den;
      }
      for (var z = 0; z < 12; z++) { if (z === r) continue; k[r][z] = sm * kr[z] / den; k[z][r] = k[r][z]; }
      k[r][r] = sm * kr[r] / den; if (p) p[r] = sm * pr / den;
    }
  }
  function condensarPonta(k, p, e) { condensar(k, p, e.lib); if (e.molas && e.molas.length) condensarMolas(k, p, e.molas); }
  function temPonta(e) { return e.lib.length || (e.molas && e.molas.length); }
  /* sistema pequeno denso (pivotamento parcial); null se singular */
  function gauss(A0, b0) {
    var n = b0.length, A = A0.map(function (l) { return l.slice(); }), b = b0.slice();
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (!(Math.abs(A[p][c]) > 1e-30)) return null;
      var t = A[c]; A[c] = A[p]; A[p] = t; var tb = b[c]; b[c] = b[p]; b[p] = tb;
      for (var r2 = c + 1; r2 < n; r2++) { var f = A[r2][c] / A[c][c]; if (!f) continue; for (var k = c; k < n; k++) A[r2][k] -= f * A[c][k]; b[r2] -= f * b[c]; }
    }
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) { var s = b[i]; for (var j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }
  /* SOLUÇÃO PARTICULAR do elemento bi-engastado sob a carga distribuída (função de Green): somada à interpolação de
     Hermite dos deslocamentos nodais, dá o deslocamento EXATO dentro do elemento (Euler-Bernoulli). xl local no elemento. */
  function greenFlexao(x, s, L) {   /* deslocamento em x por carga unitária em s, viga bi-engastada, ×EI */
    var a = s, b = L - s;
    if (x <= a) return b * b * x * x * (3 * a * L - x * (3 * a + b)) / (6 * L * L * L);
    var xr = L - x; return a * a * xr * xr * (3 * b * L - xr * (3 * b + a)) / (6 * L * L * L);
  }
  function greenAxial(x, s, L) { return x <= s ? x * (L - s) / L : s * (L - x) / L; }   /* ×EA */
  var GP6 = [[-0.9324695142, 0.1713244924], [-0.6612093865, 0.3607615730], [-0.2386191861, 0.4679139346], [0.2386191861, 0.4679139346], [0.6612093865, 0.3607615730], [0.9324695142, 0.1713244924]];
  function particular(e, info, cargasB, xl) {
    var u = [0, 0, 0]; if (!cargasB || !cargasB.length || !info) return u;
    var L = e.L;
    cargasB.forEach(function (t) {
      var a0 = Math.max(t.xa, e.x0) - e.x0, b0 = Math.min(t.xb, e.x0 + L) - e.x0;
      if (!(b0 > a0 + 1e-12)) return;
      /* integra em [a0, b0] partindo em xl (a função de Green tem bico em s = x) */
      var cortes = [a0]; if (xl > a0 && xl < b0) cortes.push(xl); cortes.push(b0);
      for (var k = 0; k + 1 < cortes.length; k++) {
        var lo = cortes[k], hi = cortes[k + 1], h = (hi - lo) / 2, m = (hi + lo) / 2;
        GP6.forEach(function (g) {
          var sl = m + h * g[0], w = h * g[1], sp = (t.xb - t.xa) > 0 ? (sl + e.x0 - t.xa) / (t.xb - t.xa) : 0;
          var q = [t.qa[0] + (t.qb[0] - t.qa[0]) * sp, t.qa[1] + (t.qb[1] - t.qa[1]) * sp, t.qa[2] + (t.qb[2] - t.qa[2]) * sp];
          if (info.EA > 0) u[0] += greenAxial(xl, sl, L) * q[0] * w / info.EA;
          if (info.EIz > 0) u[1] += greenFlexao(xl, sl, L) * q[1] * w / info.EIz;
          if (info.EIy > 0) u[2] += greenFlexao(xl, sl, L) * q[2] * w / info.EIy;
        });
      }
    });
    return u;
  }
  /* T: 3×3 λ (linhas = ex, ey, ez) — global → local */
  function paraLocal(lam, v) { return [dot(lam[0], v), dot(lam[1], v), dot(lam[2], v)]; }
  function paraGlobal(lam, v) { return [lam[0][0] * v[0] + lam[1][0] * v[1] + lam[2][0] * v[2], lam[0][1] * v[0] + lam[1][1] * v[1] + lam[2][1] * v[2], lam[0][2] * v[0] + lam[1][2] * v[1] + lam[2][2] * v[2]]; }
  function vetLocal(lam, d12) { var o = []; for (var b = 0; b < 4; b++) { var l = paraLocal(lam, [d12[3 * b], d12[3 * b + 1], d12[3 * b + 2]]); o.push(l[0], l[1], l[2]); } return o; }
  function vetGlobal(lam, d12) { var o = []; for (var b = 0; b < 4; b++) { var g = paraGlobal(lam, [d12[3 * b], d12[3 * b + 1], d12[3 * b + 2]]); o.push(g[0], g[1], g[2]); } return o; }
  /* kG = Tᵀ k T, com T bloco-diagonal de λ */
  function kGlobal(lam, k) {
    var o = zeros(12), T = zeros(12);
    for (var b = 0; b < 4; b++) for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) T[3 * b + i][3 * b + j] = lam[i][j];
    var kt = zeros(12);
    for (var i2 = 0; i2 < 12; i2++) for (var j2 = 0; j2 < 12; j2++) { var s = 0; for (var m = 0; m < 12; m++) s += k[i2][m] * T[m][j2]; kt[i2][j2] = s; }
    for (var i3 = 0; i3 < 12; i3++) for (var j3 = 0; j3 < 12; j3++) { var s2 = 0; for (var m2 = 0; m2 < 12; m2++) s2 += T[m2][i3] * kt[m2][j3]; o[i3][j3] = s2; }
    return o;
  }

  /* ========================================= CARGAS NODAIS EQUIVALENTES
   * carga linear no trecho [xa, xb] do elemento (posições locais em m),
   * intensidades qa → qb (vetor local [qx, qy, qz], kN/m). Gauss de 3 pontos
   * por trecho: exato para (linear × cúbica). */
  var GP = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
  function equivalentes(L, xa, xb, qa, qb) {
    var p = []; for (var z = 0; z < 12; z++) p.push(0);
    if (!(xb > xa)) return p;
    var h = (xb - xa) / 2, m = (xb + xa) / 2;
    GP.forEach(function (g) {
      var x = m + h * g[0], w = h * g[1], s = (x - xa) / (xb - xa), q = [qa[0] + (qb[0] - qa[0]) * s, qa[1] + (qb[1] - qa[1]) * s, qa[2] + (qb[2] - qa[2]) * s];
      var e = x / L, e2 = e * e, e3 = e2 * e;
      var N1 = 1 - e, N7 = e, H1 = 1 - 3 * e2 + 2 * e3, H2 = L * (e - 2 * e2 + e3), H3 = 3 * e2 - 2 * e3, H4 = L * (-e2 + e3);
      p[0] += N1 * q[0] * w; p[6] += N7 * q[0] * w;
      p[1] += H1 * q[1] * w; p[5] += H2 * q[1] * w; p[7] += H3 * q[1] * w; p[11] += H4 * q[1] * w;
      p[2] += H1 * q[2] * w; p[4] += -H2 * q[2] * w; p[8] += H3 * q[2] * w; p[10] += -H4 * q[2] * w;
    });
    return p;
  }

  /* ============================================= SISTEMA EM BANDA (SPD) */
  function Banda(n, b) { this.n = n; this.b = b; this.a = new Float64Array(n * (b + 1)); }
  Banda.prototype.ix = function (i, j) { return i * (this.b + 1) + (j - i); };   /* j ≥ i, j − i ≤ b */
  Banda.prototype.soma = function (i, j, v) { if (j < i) { var t = i; i = j; j = t; } if (j - i > this.b) throw new Error("fora da banda"); this.a[this.ix(i, j)] += v; };
  Banda.prototype.get = function (i, j) { if (j < i) { var t = i; i = j; j = t; } if (j - i > this.b) return 0; return this.a[this.ix(i, j)]; };
  Banda.prototype.set = function (i, j, v) { if (j < i) { var t = i; i = j; j = t; } if (j - i > this.b) return; this.a[this.ix(i, j)] = v; };
  /* Cholesky em banda: A = Lᵀ·L guardado no lugar (fator superior U, A = UᵀU) */
  Banda.prototype.fatorar = function () {
    var n = this.n, b = this.b, a = this.a, B1 = b + 1;
    for (var i = 0; i < n; i++) {
      var ii = i * B1, s = a[ii];
      var k0 = Math.max(0, i - b);
      for (var k = k0; k < i; k++) { var u = a[k * B1 + (i - k)]; s -= u * u; }
      if (!(s > 0)) return { ok: false, gl: i, pivo: s };
      var d = Math.sqrt(s); a[ii] = d;
      var jmax = Math.min(n - 1, i + b);
      for (var j = i + 1; j <= jmax; j++) {
        var t = a[ii + (j - i)];
        var kk0 = Math.max(0, j - b);
        for (var k2 = Math.max(k0, kk0); k2 < i; k2++) t -= a[k2 * B1 + (i - k2)] * a[k2 * B1 + (j - k2)];
        a[ii + (j - i)] = t / d;
      }
    }
    return { ok: true };
  };
  Banda.prototype.mult = function (x) {
    var n = this.n, b = this.b, a = this.a, B1 = b + 1, y = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      y[i] += a[i * B1] * x[i];
      var jm = Math.min(n - 1, i + b);
      for (var j = i + 1; j <= jm; j++) { var v = a[i * B1 + (j - i)]; if (v !== 0) { y[i] += v * x[j]; y[j] += v * x[i]; } }
    }
    return y;
  };
  Banda.prototype.resolver = function (f) {
    var n = this.n, b = this.b, a = this.a, B1 = b + 1, y = new Float64Array(n);
    for (var i = 0; i < n; i++) { var s = f[i]; for (var k = Math.max(0, i - b); k < i; k++) s -= a[k * B1 + (i - k)] * y[k]; y[i] = s / a[i * B1]; }
    var x = new Float64Array(n);
    for (var i2 = n - 1; i2 >= 0; i2--) { var s2 = y[i2]; var jm = Math.min(n - 1, i2 + b); for (var j = i2 + 1; j <= jm; j++) s2 -= a[i2 * B1 + (j - i2)] * x[j]; x[i2] = s2 / a[i2 * B1]; }
    return x;
  };

  /* ============================================= SISTEMA EM PERFIL (skyline)
   * Só o envelope de cada linha (da primeira coluna não nula até a diagonal):
   * com a numeração de Cuthill-McKee a maior parte das linhas é bem mais
   * curta que a banda máxima. Mesma interface da Banda. */
  function Perfil(n, primeira) {
    this.n = n; this.f = primeira; this.ptr = new Int32Array(n + 1);
    for (var i = 0; i < n; i++) this.ptr[i + 1] = this.ptr[i] + (i - primeira[i] + 1);
    this.a = new Float64Array(this.ptr[n]);
    /* para zerar coluna: linhas cujo envelope alcança a coluna c (lista por coluna) */
    this.b = 0; for (var j = 0; j < n; j++) this.b = Math.max(this.b, j - primeira[j]);
  }
  Perfil.prototype.ix = function (i, j) { return this.ptr[i] + (j - this.f[i]); };   /* j ≤ i, j ≥ f[i] */
  Perfil.prototype.soma = function (i, j, v) { if (j > i) { var t = i; i = j; j = t; } if (j < this.f[i]) throw new Error("fora do perfil"); this.a[this.ix(i, j)] += v; };
  Perfil.prototype.get = function (i, j) { if (j > i) { var t = i; i = j; j = t; } if (j < this.f[i]) return 0; return this.a[this.ix(i, j)]; };
  Perfil.prototype.set = function (i, j, v) { if (j > i) { var t = i; i = j; j = t; } if (j < this.f[i]) return; this.a[this.ix(i, j)] = v; };
  /* restrição: zera linha e coluna g0 e põe 1 na diagonal */
  Perfil.prototype.identidade = function (g0) {
    var n = this.n, f = this.f, a = this.a, ptr = this.ptr;
    for (var j = f[g0]; j < g0; j++) a[ptr[g0] + (j - f[g0])] = 0;
    for (var r = g0 + 1; r < n; r++) if (f[r] <= g0) a[ptr[r] + (g0 - f[r])] = 0;
    a[ptr[g0] + (g0 - f[g0])] = 1;
  };
  Perfil.prototype.zerar = function (g0) {
    var n = this.n, f = this.f, a = this.a, ptr = this.ptr;
    for (var j = f[g0]; j <= g0; j++) a[ptr[g0] + (j - f[g0])] = 0;
    for (var r = g0 + 1; r < n; r++) if (f[r] <= g0) a[ptr[r] + (g0 - f[r])] = 0;
  };
  Perfil.prototype.fatorar = function () {
    var n = this.n, f = this.f, a = this.a, ptr = this.ptr;
    for (var i = 0; i < n; i++) {
      var fi = f[i], pi = ptr[i];
      for (var j = fi; j < i; j++) {
        var fj = f[j], pj = ptr[j], k0 = fi > fj ? fi : fj, s = a[pi + (j - fi)];
        for (var k = k0; k < j; k++) s -= a[pi + (k - fi)] * a[pj + (k - fj)];
        a[pi + (j - fi)] = s / a[pj + (j - fj)];
      }
      var d = a[pi + (i - fi)];
      for (var k2 = fi; k2 < i; k2++) { var v = a[pi + (k2 - fi)]; d -= v * v; }
      if (!(d > 0)) return { ok: false, gl: i, pivo: d };
      a[pi + (i - fi)] = Math.sqrt(d);
    }
    return { ok: true };
  };
  Perfil.prototype.resolver = function (b) {
    var n = this.n, f = this.f, a = this.a, ptr = this.ptr, y = new Float64Array(n);
    for (var i = 0; i < n; i++) { var s = b[i], fi = f[i], pi = ptr[i]; for (var k = fi; k < i; k++) s -= a[pi + (k - fi)] * y[k]; y[i] = s / a[pi + (i - fi)]; }
    var x = y;   /* no lugar */
    for (var i2 = n - 1; i2 >= 0; i2--) {
      var fi2 = f[i2], pi2 = ptr[i2]; x[i2] = x[i2] / a[pi2 + (i2 - fi2)];
      var xi = x[i2]; for (var k2 = fi2; k2 < i2; k2++) x[k2] -= a[pi2 + (k2 - fi2)] * xi;
    }
    return x;
  };
  Perfil.prototype.mult = function (x) {
    var n = this.n, f = this.f, a = this.a, ptr = this.ptr, y = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var fi = f[i], pi = ptr[i];
      for (var j = fi; j < i; j++) { var v = a[pi + (j - fi)]; if (v !== 0) { y[i] += v * x[j]; y[j] += v * x[i]; } }
      y[i] += a[pi + (i - fi)] * x[i];
    }
    return y;
  };
  function novaMatriz(M) { return new Perfil(M.nGL, M.primeira); }

  /* Cuthill-McKee reverso sobre o grafo dos nós */
  /* Numeração dos nós para o perfil (skyline) da matriz: Cuthill-McKee reverso com início PSEUDO-PERIFÉRICO
     (George-Liu) e, como alternativa, a ordem pelo eixo mais comprido do modelo; fica a de MENOR perfil.
     (Antes começava no nó de menor grau: no galpão de 40 m a banda ia a 263 de 308 nós — 12/10/2026.) */
  function perfilDe(pos, viz) {
    var t = 0;
    for (var k = 0; k < pos.length; k++) { var m = pos[k]; for (var q = 0; q < viz[k].length; q++) if (pos[viz[k][q]] < m) m = pos[viz[k][q]]; t += pos[k] - m; }
    return t;
  }
  function rcm(nN, viz, nos) {
    var grau = viz.map(function (v) { return v.length; });
    function niveis(r, visto) {
      var marca = {}, nv = [[r]]; marca[r] = 1;
      while (true) {
        var prox = [];
        nv[nv.length - 1].forEach(function (u) { viz[u].forEach(function (w) { if (!visto[w] && !marca[w]) { marca[w] = 1; prox.push(w); } }); });
        if (!prox.length) break;
        nv.push(prox);
      }
      return nv;
    }
    function periferico(r, visto) {
      var nv = niveis(r, visto);
      for (var k = 0; k < 10; k++) {
        var ult = nv[nv.length - 1], x = ult[0];
        for (var q = 1; q < ult.length; q++) if (grau[ult[q]] < grau[x]) x = ult[q];
        var nx = niveis(x, visto);
        if (nx.length > nv.length) { r = x; nv = nx; } else break;
      }
      return r;
    }
    var visto = new Array(nN), ordem = [];
    for (var z = 0; z < nN; z++) visto[z] = false;
    while (ordem.length < nN) {
      var ini = -1, gmin = 1e9;
      for (var i = 0; i < nN; i++) if (!visto[i] && grau[i] < gmin) { gmin = grau[i]; ini = i; }
      ini = periferico(ini, visto);
      var fila = [ini]; visto[ini] = true;
      while (fila.length) {
        var u = fila.shift(); ordem.push(u);
        viz[u].filter(function (w) { return !visto[w]; }).sort(function (p, q) { return grau[p] - grau[q]; }).forEach(function (w) { visto[w] = true; fila.push(w); });
      }
    }
    ordem.reverse();
    var pos = new Array(nN); ordem.forEach(function (n, k) { pos[n] = k; });
    if (!nos) return pos;
    /* alternativa geométrica: pelo eixo de maior extensão (desempate pelos outros) */
    var lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30];
    nos.forEach(function (n) { for (var c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], n.p[c]); hi[c] = Math.max(hi[c], n.p[c]); } });
    var eixos = [0, 1, 2].sort(function (a, b) { return (hi[b] - lo[b]) - (hi[a] - lo[a]); });
    var idxs = []; for (var k2 = 0; k2 < nN; k2++) idxs.push(k2);
    idxs.sort(function (a, b) { for (var e = 0; e < 3; e++) { var d = nos[a].p[eixos[e]] - nos[b].p[eixos[e]]; if (Math.abs(d) > 1e-9) return d; } return a - b; });
    var pos2 = new Array(nN); idxs.forEach(function (n, k) { pos2[n] = k; });
    return perfilDe(pos2, viz) < perfilDe(pos, viz) ? pos2 : pos;
  }

  /* ================================================== PREPARAR O MODELO */
  function preparar(modelo, op) {
    var nos = [], idx = {}, avisos = [];
    arr(modelo.nos).forEach(function (n) { idx[String(n.id)] = nos.length; nos.push({ id: String(n.id), p: [num(n.x, 0), num(n.y, 0), num(n.z, 0)], real: true }); });
    var elems = [], barras = [];
    arr(modelo.barras).forEach(function (b) {
      var i = idx[String(b.i)], j = idx[String(b.j)];
      if (i == null || j == null) { avisos.push("Barra " + b.id + ": nó inexistente"); return; }
      var Pi = nos[i].p, Pj = nos[j].p, d = sub(Pj, Pi), L = len(d);
      if (!(L > 1e-6)) { avisos.push("Barra " + b.id + ": comprimento nulo"); return; }
      var ex = mul(d, 1 / L), vy = b.vy ? b.vy.slice() : null;
      if (!vy || len(cross(ex, unit(vy))) < 1e-3) vy = Math.abs(ex[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      var ey = unit(sub(vy, mul(ex, dot(vy, ex)))), ez = cross(ex, ey);
      var s = b.secao || {};
      var nE = Math.max(1, Math.round(num(b.nElem, 1)));
      if (b.tracao) nE = 1;
      var B = { id: String(b.id), i: i, j: j, L: L, lam: [ex, ey, ez], E: num(b.E, 2e8), G: num(b.G, 7.7e7), A: num(s.A, 0), Iy: num(s.Iy, 0), Iz: num(s.Iz, 0), J: num(s.J, 0),
                tracao: !!b.tracao, elems: [], gamma: num(b.pesoEsp, GAMMA_ACO), dados: b };
      if (!(B.A > 0)) { avisos.push("Barra " + b.id + ": seção sem área"); return; }
      var lib = b.libera || {};
      var prev = i;
      for (var k = 0; k < nE; k++) {
        var nxt;
        if (k === nE - 1) nxt = j;
        else { nxt = nos.length; nos.push({ id: B.id + "#" + (k + 1), p: add(Pi, mul(d, (k + 1) / nE)), real: false, barra: B.id }); }
        var rl = [];
        if (k === 0) { if (lib.i && lib.i.rx) rl.push(3); if (lib.i && lib.i.ry) rl.push(4); if (lib.i && lib.i.rz) rl.push(5); }
        if (k === nE - 1) { if (lib.j && lib.j.rx) rl.push(9); if (lib.j && lib.j.ry) rl.push(10); if (lib.j && lib.j.rz) rl.push(11); }
        if (B.tracao) rl = [3, 4, 5, 10, 11];   /* barra de tração: articulada nas duas pontas (a torção fica presa numa só) */
        /* molas rotacionais de ponta (kN·m/rad): ≤ 0 = rótula; não finita ou ≥ 1e15 = engaste (nada a fazer) */
        var ml = [], mo = B.tracao ? {} : (b.mola || {});
        [[k === 0, mo.i, 3], [k === nE - 1, mo.j, 9]].forEach(function (q) {
          if (!q[0] || !q[1]) return;
          [["rx", 0], ["ry", 1], ["rz", 2]].forEach(function (ax) {
            var v = q[1][ax[0]]; if (v == null || v === "" || typeof v === "boolean") return; v = Number(v); var gl = q[2] + ax[1];
            if (rl.indexOf(gl) >= 0) return;
            if (v === v && v <= 0) rl.push(gl); else if (isFinite(v) && v < 1e15) ml.push({ r: gl, s: v });
          });
        });
        var el = { n: elems.length, barra: B, k: k, a: prev, b: nxt, L: L / nE, x0: L * k / nE, lib: rl, molas: ml };
        elems.push(el); B.elems.push(el); prev = nxt;
      }
      barras.push(B);
    });
    /* pares de X (as duas diagonais só de tração do mesmo painel: mesmo retângulo envolvente). Se as duas ficarem
       frouxas na mesma combinação (os pilares encurtam e as duas diagonais encurtam junto), a que menos encurta
       continua ATIVA: qualquer deslocamento do painel a estica. Sem isso a parede vira mecanismo na combinação
       de sucção — defeito achado em 12/10/2026 (galpão 20 × 40, ELU 1,00·G + 1,40·W90: λcr 1,08). */
    var porPainel = {};
    barras.forEach(function (B) {
      if (!B.tracao) return;
      var Pi = nos[B.i].p, Pj = nos[B.j].p;
      var chave = [0, 1, 2].map(function (c) { return Math.round(Math.min(Pi[c], Pj[c]) * 1000) + ":" + Math.round(Math.max(Pi[c], Pj[c]) * 1000); }).join("|");
      (porPainel[chave] = porPainel[chave] || []).push(B);
    });
    Object.keys(porPainel).forEach(function (k) { var g = porPainel[k]; if (g.length === 2 && g[0].i !== g[1].i && g[0].j !== g[1].j && g[0].i !== g[1].j && g[0].j !== g[1].i) { g[0].par = g[1]; g[1].par = g[0]; } });
    /* vizinhança e numeração */
    var viz = nos.map(function () { return []; });
    elems.forEach(function (e) { if (viz[e.a].indexOf(e.b) < 0) viz[e.a].push(e.b); if (viz[e.b].indexOf(e.a) < 0) viz[e.b].push(e.a); });
    var pos = rcm(nos.length, viz, nos), banda = 0;
    elems.forEach(function (e) { banda = Math.max(banda, Math.abs(pos[e.a] - pos[e.b])); });
    var bGL = (banda + 1) * 6 - 1;
    /* envelope: para cada GL, o menor GL ligado a ele por algum elemento (e ele mesmo) */
    var primeira = new Int32Array(nos.length * 6);
    for (var q0 = 0; q0 < nos.length; q0++) for (var c0 = 0; c0 < 6; c0++) primeira[pos[q0] * 6 + c0] = pos[q0] * 6;
    elems.forEach(function (e) {
      var m0 = Math.min(pos[e.a], pos[e.b]) * 6;
      [e.a, e.b].forEach(function (nn) { for (var c1 = 0; c1 < 6; c1++) { var g = pos[nn] * 6 + c1; if (m0 < primeira[g]) primeira[g] = m0; } });
    });
    /* apoios */
    var restr = {}, molas = {};
    arr(modelo.apoios).forEach(function (a) {
      var n = idx[String(a.no)]; if (n == null) { avisos.push("Apoio em nó inexistente: " + a.no); return; }
      ["ux", "uy", "uz", "rx", "ry", "rz"].forEach(function (c, k) {
        var v = a[c], g = pos[n] * 6 + k;
        if (v === true) restr[g] = true;
        else if (typeof v === "number" && v > 0) molas[g] = (molas[g] || 0) + v;
      });
    });
    return { nos: nos, idx: idx, pos: pos, barras: barras, elems: elems, nGL: nos.length * 6, banda: bGL, primeira: primeira, restr: restr, molas: molas, avisos: avisos };
  }

  /* ===================================================== CARGAS */
  /* cargas de um caso → por elemento (vetor local equivalente) e nos nós */
  function cargasDoCaso(M, caso, fator) {
    var porElem = {}, nodal = {}, porBarra = {};
    function addElem(e, p) { var a = porElem[e.n] || (porElem[e.n] = []); while (a.length < 12) a.push(0); for (var z = 0; z < 12; z++) a[z] += p[z] * fator; }
    function addTrecho(B, qa, qb, xa, xb) {
      /* qa/qb locais da barra; distribui pelos elementos que o trecho cobre e guarda para os esforços internos */
      (porBarra[B.id] || (porBarra[B.id] = [])).push({ xa: xa, xb: xb, qa: mul(qa, fator), qb: mul(qb, fator) });
      B.elems.forEach(function (e) {
        var a = Math.max(xa, e.x0), b = Math.min(xb, e.x0 + e.L);
        if (!(b > a + 1e-12)) return;
        var sa = (a - xa) / (xb - xa), sb = (b - xa) / (xb - xa);
        var q1 = add(qa, mul(sub(qb, qa), sa)), q2 = add(qa, mul(sub(qb, qa), sb));
        addElem(e, equivalentes(e.L, a - e.x0, b - e.x0, q1, q2));
      });
    }
    var porId = {}; M.barras.forEach(function (B) { porId[B.id] = B; });
    arr(caso && caso.cargas).forEach(function (c) {
      if (c.tipo === "no") {
        var n = M.idx[String(c.no)]; if (n == null) return;
        var F = c.F || []; var g0 = M.pos[n] * 6;
        for (var k = 0; k < 6; k++) if (num(F[k], 0)) nodal[g0 + k] = (nodal[g0 + k] || 0) + num(F[k], 0) * fator;
      } else if (c.tipo === "barra") {
        var B = porId[String(c.barra)]; if (!B) return;
        var qa = (c.q || [0, 0, 0]).map(function (v) { return num(v, 0); }), qb = (c.q2 || c.q || [0, 0, 0]).map(function (v) { return num(v, 0); });
        if (c.sistema !== "local") {
          if (c.projetada) { var fh = Math.sqrt(B.lam[0][0] * B.lam[0][0] + B.lam[0][2] * B.lam[0][2]); qa = mul(qa, fh); qb = mul(qb, fh); }
          qa = paraLocal(B.lam, qa); qb = paraLocal(B.lam, qb);
        }
        var xa = B.L * Math.max(0, Math.min(1, num(c.a, 0))), xb = B.L * Math.max(0, Math.min(1, num(c.b, 1)));
        addTrecho(B, qa, qb, xa, xb);
      } else if (c.tipo === "pesoProprio") {
        var fp = num(c.fator, 1);
        M.barras.forEach(function (B2) {
          if (c.barras && c.barras.indexOf(B2.id) < 0) return;
          var q = paraLocal(B2.lam, [0, -B2.gamma * B2.A * fp, 0]);
          addTrecho(B2, q, q, 0, B2.L);
        });
      }
    });
    return { porElem: porElem, nodal: nodal, porBarra: porBarra };
  }
  function somarCargas(lista) {
    var o = { porElem: {}, nodal: {}, porBarra: {} };
    lista.forEach(function (c) {
      Object.keys(c.porElem).forEach(function (k) { var a = o.porElem[k] || (o.porElem[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); for (var z = 0; z < 12; z++) a[z] += c.porElem[k][z]; });
      Object.keys(c.nodal).forEach(function (k) { o.nodal[k] = (o.nodal[k] || 0) + c.nodal[k]; });
      Object.keys(c.porBarra).forEach(function (k) { o.porBarra[k] = (o.porBarra[k] || []).concat(c.porBarra[k]); });
    });
    return o;
  }

  /* ============================================== MONTAR E RESOLVER */
  function montar(M, op, Nel, ativos, carga) {
    var K = novaMatriz(M), F = new Float64Array(M.nGL), red = num(op.reducaoRigidez, 1);
    var info = [];
    M.elems.forEach(function (e) {
      var B = e.barra;
      if (B.tracao && ativos && ativos[B.id] === false) {
        /* barra frouxa: sai da RIGIDEZ, mas o peso dela (e o que mais estiver nela) continua pendurado nos nós */
        var pf = (carga.porElem[e.n] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(), kf = rigidezLocal(B.E, B.G, B.A, B.Iy, B.Iz, B.J, e.L);
        condensarPonta(kf, pf, e);
        var pgf = vetGlobal(B.lam, pf), gf = [];
        for (var cf = 0; cf < 6; cf++) gf.push(M.pos[e.a] * 6 + cf);
        for (var cf2 = 0; cf2 < 6; cf2++) gf.push(M.pos[e.b] * 6 + cf2);
        for (var zf = 0; zf < 12; zf++) F[gf[zf]] += pgf[zf];
        info[e.n] = null; return;
      }
      var k = rigidezLocal(B.E * red, B.G * red, B.A, B.Iy, B.Iz, B.J, e.L);
      /* barra só de tração comprimida (a diagonal do X mantida ativa): sem rigidez geométrica — ela não resiste a compressão */
      if (Nel && Nel[e.n] && !(B.tracao && Nel[e.n] < 0)) { var kg = rigidezGeometrica(Nel[e.n], e.L, B.Iy + B.Iz, B.A, !!op.wagner); for (var i = 0; i < 12; i++) for (var j = 0; j < 12; j++) k[i][j] += kg[i][j]; }
      var p = (carga.porElem[e.n] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).slice();
      var k0 = temPonta(e) ? k.map(function (l) { return l.slice(); }) : null, p0 = temPonta(e) ? p.slice() : null;
      condensarPonta(k, p, e);
      info[e.n] = { k: k, p: p, k0: k0, p0: p0, EIz: B.E * red * B.Iz, EIy: B.E * red * B.Iy, EA: B.E * red * B.A };
      var kg2 = kGlobal(B.lam, k), pg = vetGlobal(B.lam, p);
      var g = [];
      for (var c = 0; c < 6; c++) g.push(M.pos[e.a] * 6 + c);
      for (var c2 = 0; c2 < 6; c2++) g.push(M.pos[e.b] * 6 + c2);
      for (var i2 = 0; i2 < 12; i2++) {
        F[g[i2]] += pg[i2];
        for (var j2 = i2; j2 < 12; j2++) { var v = kg2[i2][j2]; if (v !== 0) K.soma(g[i2], g[j2], v); }
      }
    });
    Object.keys(carga.nodal).forEach(function (k) { F[+k] += carga.nodal[k]; });
    Object.keys(M.molas).forEach(function (k) { K.soma(+k, +k, M.molas[k]); });
    /* GL sem rigidez → travar e avisar */
    var dmax = 0; for (var q = 0; q < M.nGL; q++) dmax = Math.max(dmax, K.get(q, q));
    var travados = [];
    for (var q2 = 0; q2 < M.nGL; q2++) if (!M.restr[q2] && !(K.get(q2, q2) > dmax * 1e-13)) travados.push(q2);
    var R = {}; Object.keys(M.restr).forEach(function (k) { R[k] = true; }); travados.forEach(function (k) { R[k] = true; });
    var Fr = {};
    Object.keys(R).forEach(function (s) { var g0 = +s; K.identidade(g0); Fr[g0] = F[g0]; F[g0] = 0; });
    return { K: K, F: F, info: info, travados: travados, Fr: Fr };
  }

  /* esforços nas pontas dos elementos (locais) a partir do deslocamento global */
  function esforcosElem(M, e, info, U) {
    if (!info) return null;
    var B = e.barra, g = [];
    for (var c = 0; c < 6; c++) g.push(U[M.pos[e.a] * 6 + c]);
    for (var c2 = 0; c2 < 6; c2++) g.push(U[M.pos[e.b] * 6 + c2]);
    var dl = vetLocal(B.lam, g), f = [];
    for (var i = 0; i < 12; i++) { var s = -info.p[i]; for (var j = 0; j < 12; j++) s += info.k[i][j] * dl[j]; f.push(s); }
    /* rotação verdadeira da ponta ROTULADA (a do nó não vale para a barra): K_RR·d_R = p_R − K_RN·d_N, com a matriz antes da condensação */
    /* com MOLA: (K_RR + s)·θe = p_R − K_RN·d_N + s·θn (a rotação do nó entra pela mola; rótula = mola 0) */
    if (info.k0 && temPonta(e)) {
      var mol = {}; arr(e.molas).forEach(function (m) { mol[m.r] = m.s; });
      var R = e.lib.concat(arr(e.molas).map(function (m) { return m.r; })), nR = R.length, Mx = [], rhs = [];
      for (var a = 0; a < nR; a++) {
        Mx.push([]); var sr = info.p0[R[a]] + (mol[R[a]] || 0) * dl[R[a]];
        for (var c = 0; c < 12; c++) if (R.indexOf(c) < 0) sr -= info.k0[R[a]][c] * dl[c];
        for (var b2 = 0; b2 < nR; b2++) Mx[a].push(info.k0[R[a]][R[b2]] + (a === b2 ? (mol[R[a]] || 0) : 0));
        rhs.push(sr);
      }
      var x = gauss(Mx, rhs);
      if (x) for (var a2 = 0; a2 < nR; a2++) dl[R[a2]] = x[a2];
    }
    return { f: f, d: dl };
  }

  function normaisDe(M, info, U) {
    var N = {};
    M.elems.forEach(function (e) { var r = esforcosElem(M, e, info[e.n], U); if (r) N[e.n] = -r.f[0]; });   /* tração > 0: força na ponta i = −N */
    return N;
  }

  /* resolve UMA combinação (fatores por caso) com as opções dela */
  function resolverCombinacao(M, casosPrep, comb, op) {
    var lista = [];
    Object.keys(comb.fatores || {}).forEach(function (cid) { var f = num(comb.fatores[cid], 0); if (f && casosPrep[cid]) lista.push(cargasDoCaso(M, casosPrep[cid], f)); });
    var carga = somarCargas(lista);
    /* forças nocionais: fração da carga VERTICAL nodal equivalente, na direção pedida */
    if (comb.nocional && num(comb.nocional.fracao, 0)) {
      var fr = num(comb.nocional.fracao, 0), dir = unit(comb.nocional.dir || [1, 0, 0]);
      var vert = new Float64Array(M.nGL);
      M.elems.forEach(function (e) {
        var p = carga.porElem[e.n]; if (!p) return;
        var pg = vetGlobal(e.barra.lam, p);
        vert[M.pos[e.a] * 6 + 1] += pg[1]; vert[M.pos[e.b] * 6 + 1] += pg[7];
      });
      Object.keys(carga.nodal).forEach(function (k) { if (+k % 6 === 1) vert[+k] += carga.nodal[k]; });
      for (var n = 0; n < M.nos.length; n++) {
        var gy = M.pos[n] * 6 + 1, V = vert[gy];
        if (V < 0) { var H = -V * fr; for (var c = 0; c < 3; c++) if (dir[c]) carga.nodal[M.pos[n] * 6 + c] = (carga.nodal[M.pos[n] * 6 + c] || 0) + H * dir[c]; }
      }
    }
    var opc = { reducaoRigidez: comb.reducaoRigidez || op.reducaoRigidez || 1 };
    var ativos = {}; M.barras.forEach(function (B) { if (B.tracao) ativos[B.id] = true; });
    var Nel = null, U = null, U1 = null, info = null, it = 0, conv = false, maxIt = num(op.maxIteracoes, 30), travados = [], montado = null, hist = [];
    /* 1ª fase: 1ª ordem até o conjunto de barras só de tração parar de mudar → U1 (referência do Δ2/Δ1, com as MESMAS
       barras ativas da 2ª ordem); 2ª fase: 2ª ordem. Antes, o U1 era a 1ª iteração com todas as diagonais ativas
       (rigidez dobrada no contraventamento) e o Δ2/Δ1 saía inflado — defeito corrigido em 12/10/2026. */
    var fase1 = true;
    for (it = 1; it <= maxIt; it++) {
      montado = montar(M, opc, (comb.segundaOrdem && !fase1) ? Nel : null, ativos, carga);
      /* 1ª ordem: a matriz só depende do conjunto de barras ativas (e da redução de rigidez) — a fatoração é
         reaproveitada entre as combinações (cache pequeno, por memória) */
      var chave = (comb.segundaOrdem && !fase1) ? null : opc.reducaoRigidez + "|" + Object.keys(ativos).filter(function (k) { return ativos[k] === false; }).sort().join(",");
      var cache = M._cacheK || (M._cacheK = { chaves: [], K: {} }), Kf = chave != null ? cache.K[chave] : null;
      if (!Kf) {
        var fat = montado.K.fatorar();
        if (!fat.ok) {
          var no = null; for (var q = 0; q < M.nos.length; q++) if (M.pos[q] === Math.floor(fat.gl / 6)) no = M.nos[q];
          return { ok: false, motivo: "Estrutura instável (mecanismo) no nó " + (no ? no.id : "?") + ", grau de liberdade " + ["ux", "uy", "uz", "rx", "ry", "rz"][fat.gl % 6] + (comb.segundaOrdem ? " — pode ser carga acima da crítica de flambagem global." : " — faltam apoios ou travamentos."), iteracoes: it };
        }
        Kf = montado.K;
        if (chave != null) { cache.K[chave] = Kf; cache.chaves.push(chave); if (cache.chaves.length > 3) delete cache.K[cache.chaves.shift()]; }
      }
      var Un = Kf.resolver(montado.F);
      info = montado.info; travados = montado.travados;
      var mud = false, along = {}, quer = {};
      M.barras.forEach(function (B) {
        if (!B.tracao) return;
        var e = B.elems[0];
        /* alongamento da barra (mesmo inativa): projeção do deslocamento relativo no eixo */
        var ui = [Un[M.pos[e.a] * 6], Un[M.pos[e.a] * 6 + 1], Un[M.pos[e.a] * 6 + 2]], uj = [Un[M.pos[e.b] * 6], Un[M.pos[e.b] * 6 + 1], Un[M.pos[e.b] * 6 + 2]];
        along[B.id] = dot(sub(uj, ui), B.lam[0]);
        quer[B.id] = along[B.id] > -1e-12;
      });
      /* par de X com as duas frouxas: a que menos encurta fica ativa (ver preparar) */
      M.barras.forEach(function (B) {
        if (!B.tracao || !B.par || B.id > B.par.id) return;
        if (!quer[B.id] && !quer[B.par.id]) quer[along[B.id] >= along[B.par.id] ? B.id : B.par.id] = true;
      });
      M.barras.forEach(function (B) { if (B.tracao && quer[B.id] !== ativos[B.id]) { ativos[B.id] = quer[B.id]; mud = true; } });
      var dif = 1;
      if (U) { var s1 = 0, s2 = 0; for (var z = 0; z < M.nGL; z++) { s1 += (Un[z] - U[z]) * (Un[z] - U[z]); s2 += Un[z] * Un[z]; } dif = s2 > 0 ? Math.sqrt(s1 / s2) : 0; }
      hist.push(dif);
      U = Un;
      if (fase1) {
        if (mud) continue;
        U1 = Un; fase1 = false;
        if (!comb.segundaOrdem) { conv = true; break; }
        Nel = normaisDe(M, info, U);
        continue;
      }
      Nel = normaisDe(M, info, U);
      if (!mud && dif < num(op.tolerancia, 1e-4)) { conv = true; break; }
    }
    if (!U1) U1 = U;
    return { ok: true, U: U, U1: U1, info: info, travados: travados, iteracoes: it, convergiu: conv, ativos: ativos, carga: carga, historico: hist, Fr: montado.Fr, segunda: !!comb.segundaOrdem };
  }

  /* ===================================== RESULTADOS DE UMA COMBINAÇÃO */
  function resultados(M, R, op) {
    var nEst = Math.max(2, Math.round(num(op.estacoes, 9)));
    var desloc = {}, reacoes = {}, desloc1 = R.segunda && R.U1 ? {} : null;
    M.nos.forEach(function (n, k) {
      if (!n.real) return;
      var g0 = M.pos[k] * 6, u = []; for (var c = 0; c < 6; c++) u.push(R.U[g0 + c]); desloc[n.id] = u;
      if (desloc1) { var u1 = []; for (var c1 = 0; c1 < 6; c1++) u1.push(R.U1[g0 + c1]); desloc1[n.id] = u1; }
    });
    /* reações = soma das forças das barras no nó + molas − cargas nodais diretas (no GL restrito) */
    var forcaNo = {};
    var porElem = {};
    M.elems.forEach(function (e) {
      var r = esforcosElem(M, e, R.info[e.n], R.U); porElem[e.n] = r;
      if (!r) {
        /* barra só de tração FROUXA: o peso dela (e o que mais estiver nela) continua pendurado nos nós — na reação
           entra como carga nodal (o memorial achou o resíduo de 0,17–0,28 kN no ΣFy do caso G em 12/10/2026) */
        var Bf = e.barra; if (!(Bf.tracao && R.ativos && R.ativos[Bf.id] === false)) return;
        var pf = (R.carga.porElem[e.n] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(), kf = rigidezLocal(Bf.E, Bf.G, Bf.A, Bf.Iy, Bf.Iz, Bf.J, e.L);
        condensarPonta(kf, pf, e);
        var pgf = vetGlobal(Bf.lam, pf);
        [[e.a, 0], [e.b, 6]].forEach(function (par) { var a2 = forcaNo[par[0]] || (forcaNo[par[0]] = [0, 0, 0, 0, 0, 0]); for (var c2 = 0; c2 < 6; c2++) a2[c2] -= pgf[par[1] + c2]; });
        return;
      }
      var fg = vetGlobal(e.barra.lam, r.f);
      [[e.a, 0], [e.b, 6]].forEach(function (par) { var a = forcaNo[par[0]] || (forcaNo[par[0]] = [0, 0, 0, 0, 0, 0]); for (var c = 0; c < 6; c++) a[c] += fg[par[1] + c]; });
    });
    M.nos.forEach(function (n, k) {
      if (!n.real) return;
      var g0 = M.pos[k] * 6, tem = false, rr = [0, 0, 0, 0, 0, 0];
      for (var c = 0; c < 6; c++) {
        var g = g0 + c;
        if (M.restr[g]) { tem = true; rr[c] = (forcaNo[k] ? forcaNo[k][c] : 0) - num(R.carga.nodal[g], 0); }
        else if (M.molas[g]) { tem = true; rr[c] = -M.molas[g] * R.U[g]; }
      }
      if (tem) reacoes[n.id] = rr;
    });
    /* esforços ao longo de cada barra */
    var barras = {};
    M.barras.forEach(function (B) {
      var est = [], cargasB = R.carga.porBarra[B.id] || [];
      if (B.tracao && R.ativos[B.id] === false) {
        for (var s0 = 0; s0 < nEst; s0++) est.push({ x: B.L * s0 / (nEst - 1), N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0, u: null });
        var e0 = B.elems[0], ua = [R.U[M.pos[e0.a] * 6], R.U[M.pos[e0.a] * 6 + 1], R.U[M.pos[e0.a] * 6 + 2]], ub = [R.U[M.pos[e0.b] * 6], R.U[M.pos[e0.b] * 6 + 1], R.U[M.pos[e0.b] * 6 + 2]];
        barras[B.id] = { estacoes: est, inativa: true, L: B.L, alongamento: dot(sub(ub, ua), B.lam[0]) };   /* ≤ 0: estaria comprimida (por isso saiu) */
        return;
      }
      B.elems.forEach(function (e, ke) {
        var r = porElem[e.n]; if (!r) return;
        var Fi = [r.f[0], r.f[1], r.f[2]], Mi = [r.f[3], r.f[4], r.f[5]];
        /* pontos do elemento: estações uniformes + onde o cortante troca de sinal (o momento extremo EXATO) */
        var xs = []; for (var s = 0; s < nEst; s++) if (!(ke > 0 && s === 0)) xs.push(e.L * s / (nEst - 1));
        function corte(xl) {
          var xb = e.x0 + xl, Q = [0, 0, 0];
          cargasB.forEach(function (t) {
            var a = Math.max(t.xa, e.x0), b = Math.min(t.xb, xb); if (!(b > a + 1e-12)) return;
            var h = (b - a) / 2, m = (b + a) / 2;
            GP.forEach(function (g) { var x = m + h * g[0], w = h * g[1], sp = (t.xb - t.xa) > 0 ? (x - t.xa) / (t.xb - t.xa) : 0; Q = add(Q, mul(add(t.qa, mul(sub(t.qb, t.qa), sp)), w)); });
          });
          return mul(add(Fi, Q), -1);
        }
        if (cargasB.length) {
          var fino = 24, prev = corte(0);
          for (var f2 = 1; f2 <= fino; f2++) {
            var xf = e.L * f2 / fino, cur = corte(xf);
            [1, 2].forEach(function (c) {
              if (prev[c] * cur[c] < 0) {
                var lo = e.L * (f2 - 1) / fino, hi = xf, vlo = prev[c];
                for (var it2 = 0; it2 < 40; it2++) { var md = (lo + hi) / 2, vm = corte(md)[c]; if (vlo * vm <= 0) hi = md; else { lo = md; vlo = vm; } }
                xs.push((lo + hi) / 2);
              }
            });
            prev = cur;
          }
          xs.sort(function (p, q) { return p - q; });
        }
        for (var si = 0; si < xs.length; si++) {
          var xl = xs[si], xb = e.x0 + xl;
          /* S = −(Fi + ∫q); Sm = −(Mi + (ri − rx) × Fi + ∫ (rs − rx) × q ds) — eixos locais da barra (os do elemento são os mesmos) */
          var Q = [0, 0, 0], Mq = [0, 0, 0];
          cargasB.forEach(function (t) {
            var a = Math.max(t.xa, e.x0), b = Math.min(t.xb, xb);
            if (!(b > a + 1e-12)) return;
            var h = (b - a) / 2, m = (b + a) / 2;
            GP.forEach(function (g) {
              var x = m + h * g[0], w = h * g[1], sp = (t.xb - t.xa) > 0 ? (x - t.xa) / (t.xb - t.xa) : 0;
              var q = add(t.qa, mul(sub(t.qb, t.qa), sp));
              Q = add(Q, mul(q, w));
              Mq = add(Mq, mul(cross([x - xb, 0, 0], q), w));
            });
          });
          var S = mul(add(Fi, Q), -1);
          /* deslocamento global no ponto (Hermite nos eixos locais do elemento) */
          var d = r.d, e1 = xl / e.L, e2 = e1 * e1, e3 = e2 * e1, Le = e.L;
          var H1 = 1 - 3 * e2 + 2 * e3, H2 = Le * (e1 - 2 * e2 + e3), H3 = 3 * e2 - 2 * e3, H4 = Le * (-e2 + e3);
          var ul = [d[0] * (1 - e1) + d[6] * e1, H1 * d[1] + H2 * d[5] + H3 * d[7] + H4 * d[11], H1 * d[2] - H2 * d[4] + H3 * d[8] - H4 * d[10]];
          var ulH = ul.slice();
          var up = particular(e, R.info[e.n], cargasB, xl); ul = [ul[0] + up[0], ul[1] + up[1], ul[2] + up[2]];
          /* 2ª ORDEM: o braço da força da ponta i é medido na configuração DEFORMADA (termo N·δ dentro do elemento — P-δ).
             A flecha "particular" (carga no vão, viga de 1ª ordem) só entra quando a barra trabalha como VIGA: com |N| acima de
             ~metade da carga de Euler do elemento ela vira "corda" (a flecha de viga deixa de valer e N·δ inventaria momento —
             roteiro do defeito: barra redonda tracionada com o próprio peso deu 6,5 kN·m na conferência com o PyNite). */
          var braco = [-xl, 0, 0];
          if (R.segunda) {
            var inf = R.info[e.n], Nabs = Math.abs(Fi[0]), EImin = inf ? Math.min(inf.EIz || 1e30, inf.EIy || 1e30) : 1e30;
            var viga = Nabs * e.L * e.L / (Math.PI * Math.PI * EImin) < 0.5, uu = viga ? ul : ulH;
            braco = [-xl, -(uu[1] - d[1]), -(uu[2] - d[2])];
          }
          var Sm = mul(add(add(Mi, cross(braco, Fi)), Mq), -1);
          /* barra SÓ DE TRAÇÃO é tirante/barra redonda: não tem flexão (a carga no vão vira flecha de corda) */
          if (B.tracao) { S[1] = 0; S[2] = 0; Sm = [0, 0, 0]; }
          est.push({ x: xb, N: S[0], Vy: S[1], Vz: S[2], T: Sm[0], My: Sm[1], Mz: Sm[2], ul: ul, u: paraGlobal(B.lam, ul) });
        }
      });
      /* barra só de tração: corda reta entre as pontas (a "flecha de viga" do peso próprio num Ø 12,5 dava 2,6 m —
         a vista 3D achou; a flecha de cabo tracionado é desprezível e não é calculada) */
      if (B.tracao && est.length > 1) {
        var t0 = est[0].ul, t1 = est[est.length - 1].ul;
        est.forEach(function (p) { var s3 = p.x / B.L; p.ul = t0.map(function (v0, c3) { return v0 + (t1[c3] - v0) * s3; }); p.u = paraGlobal(B.lam, p.ul); });
      }
      /* flecha local relativa à corda (para o limite de deslocamento da barra) */
      if (est.length) {
        var a0 = est[0].ul, a1 = est[est.length - 1].ul;
        est.forEach(function (p) { var s = p.x / B.L; p.flechaY = p.ul[1] - (a0[1] + (a1[1] - a0[1]) * s); p.flechaZ = p.ul[2] - (a0[2] + (a1[2] - a0[2]) * s); });
      }
      barras[B.id] = { estacoes: est, L: B.L, inativa: false };
    });
    return { desloc: desloc, desloc1: desloc1, reacoes: reacoes, barras: barras, iteracoes: R.iteracoes, convergiu: R.convergiu, travados: R.travados.map(function (g) { var k = M.pos.indexOf(Math.floor(g / 6)); return { no: M.nos[k] ? M.nos[k].id : "?", gl: ["ux", "uy", "uz", "rx", "ry", "rz"][g % 6] }; }) };
  }

  /* ================================================== API */
  function analisar(modelo, op) {
    op = op || {};
    var t0 = Date.now();
    var M = preparar(modelo, op);
    if (!M.barras.length) return { ok: false, motivo: "Modelo sem barras.", avisos: M.avisos };
    var casos = {}; arr(modelo.casos).forEach(function (c) { casos[String(c.id)] = c; });
    var combs = arr(op.combinacoes).length ? op.combinacoes : Object.keys(casos).map(function (id) { var f = {}; f[id] = 1; return { id: id, fatores: f }; });
    var saida = { ok: true, combinacoes: {}, avisos: M.avisos.slice(), nGL: M.nGL, banda: M.banda, nNos: M.nos.length, nElem: M.elems.length };
    for (var i = 0; i < combs.length; i++) {
      var cb = combs[i], R = resolverCombinacao(M, casos, cb, op);
      if (!R.ok) { saida.combinacoes[cb.id] = { ok: false, motivo: R.motivo }; saida.ok = false; saida.motivo = cb.id + ": " + R.motivo; continue; }
      var res = resultados(M, R, op); res.ok = true;
      if (!R.convergiu) { res.aviso = "não convergiu em " + R.iteracoes + " iterações"; saida.avisos.push(cb.id + ": " + res.aviso); }
      if (res.travados.length) saida.avisos.push(cb.id + ": " + res.travados.length + " grau(s) de liberdade sem rigidez travado(s) (ex.: rotação de nó com todas as barras rotuladas)");
      saida.combinacoes[cb.id] = res;
    }
    saida.tempoMs = Date.now() - t0;
    return saida;
  }

  /* ============================================== FLAMBAGEM (autovalor)
   * K·φ = λ·(−Kg(N))·φ, com N da análise de 1ª ordem da combinação de
   * referência: λ = FATOR DE CARGA CRÍTICA (a combinação multiplicada por λ
   * flamba no modo φ). Iteração inversa com quociente de Rayleigh e
   * deflação K-ortogonal para os modos seguintes. As barras só de tração que
   * estiverem frouxas na combinação ficam fora (como na análise). */
  function montarKg(M, Nel, ativos, R, wagner) {
    var Kg = novaMatriz(M);
    M.elems.forEach(function (e) {
      var B = e.barra; if (B.tracao && ativos && ativos[B.id] === false) return;
      var N = Nel[e.n]; if (!N || (B.tracao && N < 0)) return;
      var kg = rigidezGeometrica(N, e.L, B.Iy + B.Iz, B.A, !!wagner);
      var k = rigidezLocal(B.E, B.G, B.A, B.Iy, B.Iz, B.J, e.L), p = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      /* condensa a geométrica junto com a elástica e tira a elástica (a rótula vale para as duas) */
      var tot = k.map(function (l, i) { return l.map(function (v, j) { return v + kg[i][j]; }); });
      if (temPonta(e)) { var k2 = k.map(function (l) { return l.slice(); }); condensarPonta(tot, p, e); condensarPonta(k2, null, e); for (var i0 = 0; i0 < 12; i0++) for (var j0 = 0; j0 < 12; j0++) kg[i0][j0] = tot[i0][j0] - k2[i0][j0]; }
      var g2 = kGlobal(B.lam, kg), gl = [];
      for (var c = 0; c < 6; c++) gl.push(M.pos[e.a] * 6 + c);
      for (var c2 = 0; c2 < 6; c2++) gl.push(M.pos[e.b] * 6 + c2);
      for (var i = 0; i < 12; i++) for (var j = i; j < 12; j++) { var v = g2[i][j]; if (v !== 0) Kg.soma(gl[i], gl[j], v); }
    });
    Object.keys(R).forEach(function (s) { Kg.zerar(+s); });
    return Kg;
  }
  function flambagem(modelo, op) {
    op = op || {};
    var M = preparar(modelo, op);
    var casos = {}; arr(modelo.casos).forEach(function (c) { casos[String(c.id)] = c; });
    var comb = op.combinacao || { id: "ref", fatores: {} };
    var R0 = resolverCombinacao(M, casos, { id: comb.id, fatores: comb.fatores, nocional: comb.nocional, segundaOrdem: false }, op);
    if (!R0.ok) return { ok: false, motivo: R0.motivo };
    var Nel = normaisDe(M, R0.info, R0.U);
    var mont = montar(M, {}, null, R0.ativos, R0.carga), fat = mont.K.fatorar();
    if (!fat.ok) return { ok: false, motivo: "Estrutura instável." };
    var R = {}; Object.keys(M.restr).forEach(function (k) { R[k] = true; }); mont.travados.forEach(function (k) { R[k] = true; });
    var Kg = montarKg(M, Nel, R0.ativos, R, !!op.wagner);
    var K = montar(M, {}, null, R0.ativos, R0.carga).K;   /* sem fatorar, para o produto K·x */
    var nModos = Math.max(1, Math.round(num(op.modos, 3))), modos = [], n = M.nGL;
    function menosKg(x) { var y = Kg.mult(x); for (var i = 0; i < n; i++) y[i] = -y[i]; return y; }
    function dotv(a, b) { var s = 0; for (var i = 0; i < n; i++) s += a[i] * b[i]; return s; }
    function umModo(mo) {
      var x = new Float64Array(n); for (var i = 0; i < n; i++) x[i] = R[i] ? 0 : 1 + 0.37 * Math.sin(1.7 * i + mo);
      var lam = 0, lamAnt = 0, it;
      for (it = 0; it < num(op.maxIteracoes, 120); it++) {
        /* deflação: tira as componentes dos modos já achados (K-ortogonal) */
        modos.forEach(function (md) { var Kp = K.mult(md.v), c = dotv(x, Kp) / dotv(md.v, Kp); for (var i2 = 0; i2 < n; i2++) x[i2] -= c * md.v[i2]; });
        var y = mont.K.resolver(menosKg(x));
        for (var r0 = 0; r0 < n; r0++) if (R[r0]) y[r0] = 0;
        var Ky = K.mult(y), Gy = menosKg(y), den = dotv(y, Gy);
        lam = Math.abs(den) > 1e-300 ? dotv(y, Ky) / den : Infinity;
        var nr = Math.sqrt(dotv(y, y)) || 1; for (var i3 = 0; i3 < n; i3++) x[i3] = y[i3] / nr;
        if (it > 3 && Math.abs(lam - lamAnt) <= num(op.tolerancia, 1e-6) * Math.abs(lam)) break;
        lamAnt = lam;
      }
      /* normaliza: maior translação = 1 */
      var mx = 0; for (var q = 0; q < M.nos.length; q++) for (var c = 0; c < 3; c++) mx = Math.max(mx, Math.abs(x[M.pos[q] * 6 + c]));
      var v = new Float64Array(n); for (var i4 = 0; i4 < n; i4++) v[i4] = x[i4] / (mx || 1);
      var desloc = {}; M.nos.forEach(function (nd, q2) { var g0 = M.pos[q2] * 6; desloc[nd.id] = [v[g0], v[g0 + 1], v[g0 + 2], v[g0 + 3], v[g0 + 4], v[g0 + 5]]; });
      modos.push({ lambda: lam, iteracoes: it, v: v, desloc: desloc });
    }
    for (var mo = 0; mo < nModos; mo++) umModo(mo);
    /* a iteração inversa acha o MENOR |λ|: λ < 0 é flambagem com a carga invertida (combinação dominada por tração).
       Procura mais modos até achar um λ positivo; sem nenhum, não há flambagem até o maior |λ| examinado. */
    var extra = 0;
    while (!modos.some(function (m) { return m.lambda > 0 && isFinite(m.lambda); }) && extra < 4) { umModo(nModos + extra); extra++; }
    modos.sort(function (a, b) { return (a.lambda > 0 ? a.lambda : 1e30) - (b.lambda > 0 ? b.lambda : 1e30); });
    var pos = modos.filter(function (m) { return m.lambda > 0 && isFinite(m.lambda); }), maxAbs = 0;
    modos.forEach(function (m) { if (isFinite(m.lambda)) maxAbs = Math.max(maxAbs, Math.abs(m.lambda)); });
    return { ok: true, combinacao: comb.id, modos: modos.map(function (m) { return { lambda: m.lambda, desloc: m.desloc, iteracoes: m.iteracoes }; }),
             lambdaCritico: pos.length ? pos[0].lambda : null, semPositivoAte: pos.length ? null : maxAbs };
  }

  var AcoAnalise = { analisar: analisar, flambagem: flambagem, GAMMA_ACO: GAMMA_ACO,
                     _int: { rigidezLocal: rigidezLocal, rigidezGeometrica: rigidezGeometrica, condensar: condensar, condensarMolas: condensarMolas, equivalentes: equivalentes, Banda: Banda, Perfil: Perfil, rcm: rcm } };
  global.AcoAnalise = AcoAnalise;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoAnalise;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

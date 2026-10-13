/* =====================================================================
 * madanalise.js — PÓRTICO ESPACIAL 3D linear (6 gdl por nó) para a
 * estrutura de madeira: motor PURO, ES5, sem DOM, Node-testável.
 *
 * É o MESMO cálculo de checar_mecanismo_V18.py + analise_previa_V18.py
 * (quiosque de referência, modelo CYPE V18, 08/10/2026), refeito em JS para o
 * sistema rodar a análise prévia sozinho, sem o Python. O teste
 * tools/test-mad-analise.js exige as MESMAS reações por pilarete e por
 * hipótese que o reacoes_pilaretes_PREVIA_V18.json — se mudar algo aqui,
 * a prova diz o que mudou. Convenções reproduzidas do Python (não "melhorar"):
 *
 *   · Barra: Euler-Bernoulli 12×12 local. EA/L axial; GJ/L torção com
 *     J = a·c³·(1/3 − 0,21·c/a·(1 − c⁴/(12a⁴))), a = max(b,h), c = min(b,h);
 *     flexão em z local (gdl 2,4,8,10) com Iy = b·h³/12 e sinal −;
 *     flexão em y local (gdl 1,5,7,11) com Iz = h·b³/12 e sinal +.
 *   · E da seção = E_MPa·1000 (kN/m²) se houver, senão tabela por material
 *     (C40 Dicotiledônea 19,5e6 · C25 Conífera 8,5e6 kN/m²). G = E/(2(1+ν))
 *     se a seção tem "nu", senão E/16 (madeira). Placas: G = E/2,6.
 *   · Eixos locais: ex = j − i; ey = ey_ref projetado ⟂ ex (se a barra traz
 *     rot_livre) ou, sem referência, cross(ref, ex) com ref = Z, trocada
 *     por X se |ex_z| ≥ 0,95; ez = cross(ex, ey). T = 4 blocos 3×3.
 *   · Liberações por condensação estática: art_ini = rótula nos 2 planos
 *     no nó i (gdl 4,5); garfo_fim = só o giro em torno de rot_livre no
 *     nó j (gdl 10, com ey = rot_livre).
 *   · Placas: malha triangulada de barras com o E da placa, seção t×t,
 *     costurando a cadeia de baixo (z < zm) e a de cima (z ≥ zm), ordenadas
 *     ao longo da direção horizontal baixo[último] − baixo[0]; arestas
 *     repetidas dentro da mesma placa entram uma vez só.
 *   · Apoios: os 6 gdl do nó do apoio engastados.
 *   · Cargas: peso próprio por γ do MATERIAL (10 kN/m³ C40 Tatajuba
 *     1.000 kg/m³ · 6 kN/m³ C25 Pinus 600 kg/m³ — analise_previa_V18.py
 *     linha 22), concentrado a L/2; ops uniforme/faixa/concentrada viram
 *     força no nó pela regra da alavanca (soma exata; momentos de
 *     engastamento perfeito desprezados). Hipóteses: ["PP"] + as do
 *     ops_cargas em ordem numérica da chave.
 *   · Solução: (K_livre + 1e-6·I) u = F. Reação = K[fixos,:]·u − F[fixos],
 *     somada por pilarete (Rz = N, Rx = Vx, Ry = Vy, Mx, My).
 *
 * SOLVER: Cholesky em PERFIL (skyline) após reordenação Reverse
 * Cuthill–McKee do grafo dos gdl livres; uma fatoração serve a todas as
 * hipóteses. ~8.700 gdl rodam em poucos segundos.
 *
 * MECANISMO: partes sem apoio → erro claro com os nós; deslocamento > 100 m
 * (a única coisa que segura é a mola de 1e-6) → erro com os nós suspeitos,
 * como o checar_mecanismo_V18.py.
 *
 * OPÇÕES ALÉM DO PYTHON (padrão = igual ao Python; a regressão exige isso):
 *   · placa: "casca" → cada placa vira uma malha de CASCA PLANA de 4 nós
 *     (membrana Q4 + modos incompatíveis com a correção de Taylor; flexão
 *     MITC4; giro no plano por penalidade de Hughes–Brezzi), gerada do
 *     polígono (cadeia de baixo = dormente, de cima = guia), com E, t, ν da
 *     placa, ligada à estrutura SÓ pelos vértices do polígono (os nós
 *     internos e os do contorno entre vértices são da placa), como o CYPE.
 *     malha = tamanho do elemento (m, padrão 0,3 — convergido: 0,15 muda
 *     as reações < 0,15 kN); drilling = alfa da penalidade (padrão 1e-3,
 *     insensível de 1e-5 a 1).
 *   · cortante: true → barras de Timoshenko (Φ = 12EI/(κGA L²), κ = 5/6).
 *     No Quiosque pesa muito: há vãos curtos e altos (barrote 12×16 com vão
 *     de 0,26 m entre as VP D e C; VP 12×30 sobre pares de apoios a
 *     0,10–0,20 m) e a madeira tem G = E/16.
 *   · cargas(..., {cargaNodal: "consistente"}) → forças E momentos de
 *     engastamento perfeito (Hermite, com condensação nas liberações) em
 *     vez da regra da alavanca; peso próprio distribuído.
 *
 * API
 *   MadAnalise.montar(modelo, placas, opcoes) -> M (montado)
 *       modelo  = modelo_V18.json ({nos, barras, secoes, apoios})
 *       placas  = placas_V18.json ({placas:[...]}) ou o array, ou null
 *       opcoes  = {gama:{material:kN/m³}, E_MAT:{material:kN/m²},
 *                  regularizacao:1e-6, placa:"barras"|"casca", malha:0.3,
 *                  drilling:1e-3, cortante:false}
 *   MadAnalise.cargas(M, ops, opcoes) -> C ({hips, F[hip] Float64Array, tot})
 *       ops = ops_cargas_V18.json ({hipoteses:{"1":"CP",...}, ops:[...]})
 *       opcoes.cargaNodal = "alavanca" (padrão, Python) | "consistente"
 *   MadAnalise.resolver(M, C) -> {hips, U, reacoes[], somas[], ms}
 *       reacoes[] = [{id, casos:{hip:{N,Vx,Vy,Mx,My}}}] ordenado como o Python
 *   MadAnalise.esforcos(M, C, R, opcoes) -> esforços por barra e hipótese (eixos locais; N>0 tração; ver a
 *       convenção de sinais no bloco "esforços nas barras") nas pontas e em estações;
 *       MadAnalise.combinar(esf, [{nome, fatores:{hip:coef}}]) soma linear (ELU/ELS)
 *   MadAnalise.estabilidade(M, C, R, opcoes) -> {combinacoes:[{nome, alphaCr, modo, pilares:[{barra,N,L,I,L0,beta}]}],
 *       alphaCrMin, betaPorPilar} flambagem GLOBAL por autovalor (porta de estabilidade_V18.py; ver o bloco
 *       "ESTABILIDADE GLOBAL" para o método, a Kg de corda e o que entra com placa = barras / casca)
 *   MadAnalise.checarMecanismo(M) -> {partesSoltas, nosFlexiveis, ok}
 *       (mesma checagem do checar_mecanismo_V18.py: carga unitária −Z,+X,+Y)
 *   MadAnalise.casca.{elemento, sistema, resolver, esforcos} → casca isolada
 *       (provas: patch tests, Navier, viga-parede — ver o fim do arquivo)
 *
 * UNIDADES: m, kN, kN·m. Teste: node tools/test-mad-analise.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MadAnalise = {};

  var E_MAT = { "Dicotiledônea C40, 2ª categoria": 19.5e6, "Conífera C25": 8.5e6 };
  var GAMA = { "Dicotiledônea C40, 2ª categoria": 10.0, "Conífera C25": 6.0 };
  var DIRS = { "+X": [0, 1], "-X": [0, -1], "+Y": [1, 1], "-Y": [1, -1], "+Z": [2, 1], "-Z": [2, -1] };

  /* ---------- vetores 3D ---------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norma(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = norma(a); return [a[0] / n, a[1] / n, a[2] / n]; }

  /* ---------- seção ---------- */
  function secao(modelo, g, tabE) {
    var s = modelo.secoes[g];
    if (!s) throw new Error("Seção '" + g + "' não existe em modelo.secoes");
    var E = (s.E_MPa || 0) * 1000.0;
    if (!E) {
      E = tabE[s.material];
      if (!E) throw new Error("Seção '" + g + "': sem E_MPa e material '" + s.material + "' sem E na tabela");
    }
    var G = (s.nu !== undefined && s.nu !== null) ? E / (2 * (1 + s.nu)) : E / 16.0;
    return { E: E, G: G, b: s.b_cm / 100.0, h: s.h_cm / 100.0 };
  }

  /* ---------- matriz local 12×12 (com liberações por condensação) ---------- */
  function zeros12() {
    var k = [], i;
    for (i = 0; i < 12; i++) k.push(new Float64Array(12));
    return k;
  }

  /** resolve A x = B (A n×n, B n×m) por eliminação com pivô parcial; A, B pequenos */
  function resolverPequeno(A, B) {
    var n = A.length, m = B[0].length, i, j, k, p, t, f;
    var a = [], b = [];
    for (i = 0; i < n; i++) { a.push(A[i].slice()); b.push(B[i].slice()); }
    for (i = 0; i < n; i++) {
      p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
      if (Math.abs(a[p][i]) < 1e-300) throw new Error("Liberação singular na condensação da barra");
      t = a[i]; a[i] = a[p]; a[p] = t; t = b[i]; b[i] = b[p]; b[p] = t;
      for (j = i + 1; j < n; j++) {
        f = a[j][i] / a[i][i];
        for (k = i; k < n; k++) a[j][k] -= f * a[i][k];
        for (k = 0; k < m; k++) b[j][k] -= f * b[i][k];
      }
    }
    for (i = n - 1; i >= 0; i--) {
      for (k = 0; k < m; k++) {
        t = b[i][k];
        for (j = i + 1; j < n; j++) t -= a[i][j] * b[j][k];
        b[i][k] = t / a[i][i];
      }
    }
    return b;
  }

  /** cortante = true → Timoshenko (Przemieniecki): Φ = 12EI/(κGA·L²), κ = 5/6 (seção retangular) */
  function kLocal(L, E, G, b, h, liberar, cortante) {
    var A = b * h, Iy = b * h * h * h / 12, Iz = h * b * b * b / 12;
    var a_ = Math.max(b, h), c_ = Math.min(b, h);
    var J = a_ * Math.pow(c_, 3) * (1 / 3 - 0.21 * c_ / a_ * (1 - Math.pow(c_, 4) / (12 * Math.pow(a_, 4))));
    var k = zeros12(), p, q;
    function put(idx, m) {
      for (p = 0; p < idx.length; p++) for (q = 0; q < idx.length; q++) k[idx[p]][idx[q]] += m[p][q];
    }
    var ea = E * A / L, gj = G * J / L;
    put([0, 6], [[ea, -ea], [-ea, ea]]);
    put([3, 9], [[gj, -gj], [-gj, gj]]);
    var jobs = [[Iz, [1, 5, 7, 11], 1], [Iy, [2, 4, 8, 10], -1]], n, I_, idx, s, c, m;
    for (n = 0; n < 2; n++) {
      I_ = jobs[n][0]; idx = jobs[n][1]; s = jobs[n][2];
      var fi = cortante ? 12 * E * I_ / (5 / 6 * G * A * L * L) : 0;
      c = E * I_ / ((1 + fi) * L * L * L);
      m = [[12, 6 * L * s, -12, 6 * L * s], [6 * L * s, (4 + fi) * L * L, -6 * L * s, (2 - fi) * L * L],
           [-12, -6 * L * s, 12, -6 * L * s], [6 * L * s, (2 - fi) * L * L, -6 * L * s, (4 + fi) * L * L]];
      for (p = 0; p < 4; p++) for (q = 0; q < 4; q++) m[p][q] *= c;
      put(idx, m);
    }
    if (liberar && liberar.length) {
      var keep = [], i, j;
      for (i = 0; i < 12; i++) if (liberar.indexOf(i) < 0) keep.push(i);
      var Krr = [], Kkr = [], r;
      for (i = 0; i < liberar.length; i++) {
        r = [];
        for (j = 0; j < liberar.length; j++) r.push(k[liberar[i]][liberar[j]]);
        Krr.push(r);
      }
      // Krr·X = Krk  (Krk = Kkr^T), X (nr × nk)
      var Krk = [];
      for (i = 0; i < liberar.length; i++) {
        r = [];
        for (j = 0; j < keep.length; j++) r.push(k[liberar[i]][keep[j]]);
        Krk.push(r);
      }
      var X = resolverPequeno(Krr, Krk), k2 = zeros12(), v, t;
      for (i = 0; i < keep.length; i++) {
        for (j = 0; j < keep.length; j++) {
          v = k[keep[i]][keep[j]];
          for (t = 0; t < liberar.length; t++) v -= k[keep[i]][liberar[t]] * X[t][j];
          k2[keep[i]][keep[j]] = v;
        }
      }
      k = k2;
    }
    return k;
  }

  /** linhas da rotação R (ex, ey, ez); mesma escolha de eixos do Python */
  function rotacao(p, q, eyRef) {
    var d = sub(q, p), L = norma(d), ex = [d[0] / L, d[1] / L, d[2] / L], ey;
    if (eyRef) {
      var r = [eyRef[0], eyRef[1], eyRef[2]], pr = dot(r, ex);
      ey = [r[0] - pr * ex[0], r[1] - pr * ex[1], r[2] - pr * ex[2]];
    } else {
      var ref = Math.abs(ex[2]) < 0.95 ? [0, 0, 1.0] : [1.0, 0, 0];
      ey = cross(ref, ex);
    }
    ey = unit(ey);
    var ez = cross(ex, ey);
    return { R: [ex, ey, ez], L: L };
  }

  /** k_global = Tᵀ k T com T = diag(R,R,R,R) */
  function kGlobal(kl, R) {
    var tmp = zeros12(), kg = zeros12(), i, j, a, bI, bJ, s, r, c;
    // tmp = kl · T   (T[i][j] = R[i%3][j%3] se mesmo bloco)
    for (i = 0; i < 12; i++) {
      for (j = 0; j < 12; j++) {
        bJ = j - (j % 3); s = 0;
        for (a = 0; a < 3; a++) s += kl[i][bJ + a] * R[a][j % 3];
        tmp[i][j] = s;
      }
    }
    // kg = Tᵀ · tmp
    for (i = 0; i < 12; i++) {
      bI = i - (i % 3);
      for (j = 0; j < 12; j++) {
        s = 0;
        for (a = 0; a < 3; a++) s += R[a][i % 3] * tmp[bI + a][j];
        kg[i][j] = s;
      }
    }
    return kg;
  }

  /** k_global = Tᵀ k T para nb blocos 3×3 iguais a R (k denso nb·3 × nb·3) */
  function transformar(kl, R, nb) {
    var n = 3 * nb, tmp = [], kg = [], i, j, a, s, bI, bJ;
    for (i = 0; i < n; i++) { tmp.push(new Float64Array(n)); kg.push(new Float64Array(n)); }
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        bJ = j - (j % 3); s = 0;
        for (a = 0; a < 3; a++) s += kl[i][bJ + a] * R[a][j % 3];
        tmp[i][j] = s;
      }
    }
    for (i = 0; i < n; i++) {
      bI = i - (i % 3);
      for (j = 0; j < n; j++) {
        s = 0;
        for (a = 0; a < 3; a++) s += R[a][i % 3] * tmp[bI + a][j];
        kg[i][j] = s;
      }
    }
    return kg;
  }

  /* =====================================================================
   * CASCA PLANA de 4 nós (opcoes.placa = "casca"), 6 gdl por nó
   * (ux, uy, uz, rx, ry, rz), elemento plano no plano médio dos 4 nós:
   *   · MEMBRANA: Q4 isoparamétrico + 2 modos incompatíveis por direção
   *     (Wilson, com a correção de Taylor–Beresford–Wilson 1976: derivadas
   *     dos modos com J do centro e fator detJ0/detJ → passa no patch test
   *     em malha distorcida; flexão no plano sem travamento por cortante,
   *     que é o que importa numa parede de contraventamento).
   *   · FLEXÃO: MITC4 (Dvorkin–Bathe 1984), Reissner–Mindlin com cortante
   *     transversal interpolada nos pontos de amarração (meio dos lados):
   *     sem travamento em placa fina, passa no patch test de momento
   *     constante, κ = 5/6.
   *   · GIRO NO PLANO ("drilling"): penalidade de Hughes–Brezzi
   *     γ·t·∫(θz − ω)² dA, ω = ½(∂v/∂x − ∂u/∂y) da parte compatível,
   *     γ = alfa·G (alfa = opcoes.drilling, padrão 1e-3): zero energia em
   *     movimento de corpo rígido, só tira a singularidade do rz.
   * Convenção local: βx = θy, βy = −θx (u = z·θy, v = −z·θx).
   * ===================================================================== */
  var GQ = 1 / Math.sqrt(3), GPT = [[-GQ, -GQ], [GQ, -GQ], [GQ, GQ], [-GQ, GQ]];
  var XI4 = [-1, 1, 1, -1], ETA4 = [-1, -1, 1, 1];

  function q4(xi, eta, xl, yl) {
    var N = [], Nxi = [], Neta = [], i, j11 = 0, j12 = 0, j21 = 0, j22 = 0;
    for (i = 0; i < 4; i++) {
      N.push(0.25 * (1 + XI4[i] * xi) * (1 + ETA4[i] * eta));
      Nxi.push(0.25 * XI4[i] * (1 + ETA4[i] * eta));
      Neta.push(0.25 * ETA4[i] * (1 + XI4[i] * xi));
    }
    for (i = 0; i < 4; i++) { j11 += Nxi[i] * xl[i]; j12 += Nxi[i] * yl[i]; j21 += Neta[i] * xl[i]; j22 += Neta[i] * yl[i]; }
    var det = j11 * j22 - j12 * j21;
    if (!(det > 0)) throw new Error("Elemento de casca distorcido ou com nós fora de ordem (det J = " + det + ")");
    var i11 = j22 / det, i12 = -j12 / det, i21 = -j21 / det, i22 = j11 / det, Nx = [], Ny = [];
    for (i = 0; i < 4; i++) { Nx.push(i11 * Nxi[i] + i12 * Neta[i]); Ny.push(i21 * Nxi[i] + i22 * Neta[i]); }
    return { N: N, Nxi: Nxi, Neta: Neta, j11: j11, j12: j12, j21: j21, j22: j22, det: det,
             i11: i11, i12: i12, i21: i21, i22: i22, Nx: Nx, Ny: Ny };
  }

  /** modos incompatíveis no ponto (xi, eta): linhas de B (3×4) sobre (a5u, a6u, a5v, a6v) */
  function bIncomp(q, q0, xi, eta) {
    var f = q0.det / q.det;
    var p5x = q0.i11 * (-2 * xi) * f, p5y = q0.i21 * (-2 * xi) * f;
    var p6x = q0.i12 * (-2 * eta) * f, p6y = q0.i22 * (-2 * eta) * f;
    return [[p5x, p6x, 0, 0], [0, 0, p5y, p6y], [p5y, p6y, p5x, p6x]];
  }
  function bMembrana(q) {           // 3×8 sobre (u1, v1, ..., u4, v4)
    var B = [new Float64Array(8), new Float64Array(8), new Float64Array(8)], i;
    for (i = 0; i < 4; i++) {
      B[0][2 * i] = q.Nx[i]; B[1][2 * i + 1] = q.Ny[i];
      B[2][2 * i] = q.Ny[i]; B[2][2 * i + 1] = q.Nx[i];
    }
    return B;
  }
  function bFlexao(q) {             // 3×12 sobre (w, θx, θy) por nó: curvaturas κx, κy, κxy
    var B = [new Float64Array(12), new Float64Array(12), new Float64Array(12)], i;
    for (i = 0; i < 4; i++) {
      B[0][3 * i + 2] = q.Nx[i];
      B[1][3 * i + 1] = -q.Ny[i];
      B[2][3 * i + 1] = -q.Nx[i]; B[2][3 * i + 2] = q.Ny[i];
    }
    return B;
  }
  /** cortante covariante γξz (dir 0) ou γηz (dir 1) no ponto (xi, eta), linha sobre (w, θx, θy)·4 */
  function gCov(xi, eta, xl, yl, dir) {
    var q = q4(xi, eta, xl, yl), g = new Float64Array(12), i;
    var dx = dir === 0 ? q.j11 : q.j21, dy = dir === 0 ? q.j12 : q.j22;
    for (i = 0; i < 4; i++) {
      g[3 * i] = dir === 0 ? q.Nxi[i] : q.Neta[i];
      g[3 * i + 1] = -q.N[i] * dy;
      g[3 * i + 2] = q.N[i] * dx;
    }
    return g;
  }
  function amarracao(xl, yl) {      // pontos MITC4: A(0,1), C(0,−1) para γξz; D(1,0), B(−1,0) para γηz
    return { A: gCov(0, 1, xl, yl, 0), C: gCov(0, -1, xl, yl, 0), D: gCov(1, 0, xl, yl, 1), B: gCov(-1, 0, xl, yl, 1) };
  }
  function bCortante(q, tp, xi, eta) {   // 2×12: γxz, γyz cartesianas
    var gx = new Float64Array(12), gy = new Float64Array(12), k, ge, gn;
    for (k = 0; k < 12; k++) {
      ge = 0.5 * (1 - eta) * tp.C[k] + 0.5 * (1 + eta) * tp.A[k];
      gn = 0.5 * (1 - xi) * tp.B[k] + 0.5 * (1 + xi) * tp.D[k];
      gx[k] = q.i11 * ge + q.i12 * gn;
      gy[k] = q.i21 * ge + q.i22 * gn;
    }
    return [gx, gy];
  }
  function somaBtDB(K, B, D, f, idx) {   // K[idx,idx] += f·Bᵀ D B
    var nr = B.length, nc = B[0].length, DB = [], r, s, a, b, v;
    for (r = 0; r < nr; r++) {
      DB.push(new Float64Array(nc));
      for (a = 0; a < nc; a++) { v = 0; for (s = 0; s < nr; s++) v += D[r][s] * B[s][a]; DB[r][a] = v; }
    }
    for (a = 0; a < nc; a++) {
      for (b = 0; b < nc; b++) {
        v = 0;
        for (r = 0; r < nr; r++) v += B[r][a] * DB[r][b];
        if (v !== 0) K[idx ? idx[a] : a][idx ? idx[b] : b] += f * v;
      }
    }
  }

  /** elemento de casca de 4 nós P[0..3] (pontos 3D, ordem em volta do contorno) */
  function quadCasca(P, E, nu, t, alfaDrill) {
    var a = [P[1][0] - P[0][0] + P[2][0] - P[3][0], P[1][1] - P[0][1] + P[2][1] - P[3][1], P[1][2] - P[0][2] + P[2][2] - P[3][2]];
    var b = [P[2][0] - P[1][0] + P[3][0] - P[0][0], P[2][1] - P[1][1] + P[3][1] - P[0][1], P[2][2] - P[1][2] + P[3][2] - P[0][2]];
    var ez = unit(cross(a, b)), ex = unit(a), ey = cross(ez, ex), c = [0, 0, 0], xl = [], yl = [], i, k, g;
    for (i = 0; i < 4; i++) for (k = 0; k < 3; k++) c[k] += P[i][k] / 4;
    for (i = 0; i < 4; i++) { xl.push(dot(sub(P[i], c), ex)); yl.push(dot(sub(P[i], c), ey)); }
    var Dm = E / (1 - nu * nu) * t, G = E / (2 * (1 + nu)), Db = E * t * t * t / (12 * (1 - nu * nu)), Gs = 5 / 6 * G * t;
    var DM = [[Dm, nu * Dm, 0], [nu * Dm, Dm, 0], [0, 0, (1 - nu) / 2 * Dm]];
    var DBf = [[Db, nu * Db, 0], [nu * Db, Db, 0], [0, 0, (1 - nu) / 2 * Db]];
    var DS = [[Gs, 0], [0, Gs]], gam = (alfaDrill === undefined ? 1e-3 : alfaDrill) * G * t;
    var q0 = q4(0, 0, xl, yl), tp = amarracao(xl, yl);
    var Kcc = [], Kci = [], Kii = [], K = [];
    for (i = 0; i < 8; i++) Kcc.push(new Float64Array(8));
    for (i = 0; i < 24; i++) K.push(new Float64Array(24));
    for (i = 0; i < 4; i++) Kii.push(new Float64Array(4));
    var Kfull = [];                  // 12×12 de membrana [compatível 8 | incompatível 4]
    for (i = 0; i < 12; i++) Kfull.push(new Float64Array(12));
    var idxPl = [], idxDr = [];
    for (i = 0; i < 4; i++) { idxPl.push(6 * i + 2, 6 * i + 3, 6 * i + 4); idxDr.push(6 * i, 6 * i + 1, 6 * i + 5); }
    for (g = 0; g < 4; g++) {
      var xi = GPT[g][0], eta = GPT[g][1], q = q4(xi, eta, xl, yl), Bc = bMembrana(q), Bi = bIncomp(q, q0, xi, eta);
      var Bm = [], r;
      for (r = 0; r < 3; r++) {
        var row = new Float64Array(12);
        for (k = 0; k < 8; k++) row[k] = Bc[r][k];
        for (k = 0; k < 4; k++) row[8 + k] = Bi[r][k];
        Bm.push(row);
      }
      somaBtDB(Kfull, Bm, DM, q.det, null);
      somaBtDB(K, bFlexao(q), DBf, q.det, idxPl);
      somaBtDB(K, bCortante(q, tp, xi, eta), DS, q.det, idxPl);
      var bd = new Float64Array(12);  // θz − ω sobre (u, v, θz) por nó
      for (i = 0; i < 4; i++) { bd[3 * i] = 0.5 * q.Ny[i]; bd[3 * i + 1] = -0.5 * q.Nx[i]; bd[3 * i + 2] = q.N[i]; }
      somaBtDB(K, [bd], [[gam]], q.det, idxDr);
    }
    // condensação dos modos incompatíveis
    var Kic = [], Xc, j;
    for (i = 0; i < 4; i++) {
      Kic.push([]);
      for (j = 0; j < 4; j++) Kii[i][j] = Kfull[8 + i][8 + j];
      for (j = 0; j < 8; j++) Kic[i].push(Kfull[8 + i][j]);
    }
    var KiiA = []; for (i = 0; i < 4; i++) KiiA.push(Array.prototype.slice.call(Kii[i]));
    Xc = resolverPequeno(KiiA, Kic);         // α = −Xc·uc
    for (i = 0; i < 8; i++) {
      for (j = 0; j < 8; j++) {
        var v = Kfull[i][j];
        for (k = 0; k < 4; k++) v -= Kfull[i][8 + k] * Xc[k][j];
        K[6 * (i >> 1) + (i & 1)][6 * (j >> 1) + (j & 1)] += v;
      }
    }
    var R = [ex, ey, ez];
    return { K: transformar(K, R, 8), R: R, xl: xl, yl: yl, Xc: Xc, DM: DM, DB: DBf, DS: DS, tp: tp, q0: q0, t: t };
  }

  /** esforços no ponto (xi, eta) (padrão: centro): N = [Nx, Ny, Nxy] (kN/m), M = [Mx, My, Mxy] (kN·m/m),
   *  Q = [Qx, Qy] (kN/m), no sistema local do elemento; ug = 24 deslocamentos globais do elemento */
  function esforcosCasca(el, ug, xi, eta) {
    xi = xi || 0; eta = eta || 0;
    var ul = new Float64Array(24), i, a, b, r, k;
    for (i = 0; i < 8; i++) for (a = 0; a < 3; a++) { var s = 0; for (b = 0; b < 3; b++) s += el.R[a][b] * ug[3 * i + b]; ul[3 * i + a] = s; }
    var q = q4(xi, eta, el.xl, el.yl), uc = [], pl = [];
    for (i = 0; i < 4; i++) { uc.push(ul[6 * i], ul[6 * i + 1]); pl.push(ul[6 * i + 2], ul[6 * i + 3], ul[6 * i + 4]); }
    var al = [];
    for (k = 0; k < 4; k++) { var s2 = 0; for (i = 0; i < 8; i++) s2 -= el.Xc[k][i] * uc[i]; al.push(s2); }
    var Bc = bMembrana(q), Bi = bIncomp(q, el.q0, xi, eta), eps = [0, 0, 0], kap = [0, 0, 0], gam = [0, 0];
    for (r = 0; r < 3; r++) {
      for (i = 0; i < 8; i++) eps[r] += Bc[r][i] * uc[i];
      for (i = 0; i < 4; i++) eps[r] += Bi[r][i] * al[i];
    }
    var Bb = bFlexao(q), Bs = bCortante(q, el.tp, xi, eta);
    for (r = 0; r < 3; r++) for (i = 0; i < 12; i++) kap[r] += Bb[r][i] * pl[i];
    for (r = 0; r < 2; r++) for (i = 0; i < 12; i++) gam[r] += Bs[r][i] * pl[i];
    function mul(D, v) { return D.map(function (row) { var s3 = 0; for (var c = 0; c < v.length; c++) s3 += row[c] * v[c]; return s3; }); }
    return { N: mul(el.DM, eps), M: mul(el.DB, kap), Q: mul(el.DS, gam), eps: eps, kap: kap, gam: gam };
  }

  function somarK(rows, dofs, kg) {
    var n = dofs.length, p, q, v, row;
    for (p = 0; p < n; p++) {
      row = rows[dofs[p]];
      for (q = 0; q < n; q++) {
        v = kg[p][q];
        if (v !== 0) row.set(dofs[q], (row.get(dofs[q]) || 0) + v);
      }
    }
  }

  /** malha estruturada da placa a partir do polígono (cadeia de baixo = dormente, de cima = guia).
   *  Colunas em todos os vértices das duas cadeias (parâmetro normalizado em cada cadeia) mais
   *  subdivisões até o tamanho h; linhas retas entre a cadeia de baixo e a de cima. Só os nós nos
   *  vértices do polígono são da estrutura; os outros (inclusive no contorno) são da placa. */
  function malhaPlaca(baixo, cima, X, h) {
    var d = sub(X[baixo[baixo.length - 1]], X[baixo[0]]);
    d[2] = 0; d = unit(d);
    function ch(k) { return dot(X[k], d); }
    function cmp(a, b) { return ch(a) - ch(b); }
    baixo = baixo.slice().sort(cmp); cima = cima.slice().sort(cmp);
    function params(c) {
      var s0 = ch(c[0]), L = ch(c[c.length - 1]) - s0;
      return c.map(function (k) { return L > 0 ? (ch(k) - s0) / L : 0; });
    }
    var xb = params(baixo), xt = params(cima), nb = baixo.length, nt = cima.length, k, i, j;
    var Lref = 0.5 * (ch(baixo[nb - 1]) - ch(baixo[0]) + ch(cima[nt - 1]) - ch(cima[0])), tol = Math.min(0.3 * h, 0.06);
    // 1) pares vértice de baixo × vértice de cima a menos de tol (mais próximos primeiro, sem cruzar); as pontas sempre
    var cand = [], parB = new Int32Array(nb).fill(-1), parT = new Int32Array(nt).fill(-1);
    for (i = 0; i < nb; i++) for (j = 0; j < nt; j++) {
      var dd = Math.abs(xb[i] - xt[j]) * Lref;
      if (dd < tol || (i === 0 && j === 0) || (i === nb - 1 && j === nt - 1)) cand.push([((i === 0 && j === 0) || (i === nb - 1 && j === nt - 1)) ? -1 : dd, i, j]);
    }
    cand.sort(function (p, q) { return p[0] - q[0]; });
    for (k = 0; k < cand.length; k++) {
      i = cand[k][1]; j = cand[k][2];
      if (parB[i] >= 0 || parT[j] >= 0) continue;
      var cruza = false, ii;
      for (ii = 0; ii < nb && !cruza; ii++) if (parB[ii] >= 0 && ((ii < i) !== (parB[ii] < j))) cruza = true;
      if (!cruza) { parB[i] = j; parT[j] = i; }
    }
    // 2) entre pares consecutivos, intercala os vértices sem par pelo parâmetro local de cada cadeia
    var cols = [];
    var pares = [];
    for (i = 0; i < nb; i++) if (parB[i] >= 0) pares.push([i, parB[i]]);
    for (k = 0; k < pares.length; k++) {
      var P = pares[k];
      cols.push({ xib: xb[P[0]], xit: xt[P[1]], nb: baixo[P[0]], nt: cima[P[1]] });
      if (k === pares.length - 1) break;
      var Q = pares[k + 1], sol = [];
      for (i = P[0] + 1; i < Q[0]; i++) sol.push({ u: (xb[i] - xb[P[0]]) / (xb[Q[0]] - xb[P[0]]), b: i, t: -1 });
      for (j = P[1] + 1; j < Q[1]; j++) sol.push({ u: (xt[j] - xt[P[1]]) / (xt[Q[1]] - xt[P[1]]), b: -1, t: j });
      sol.sort(function (p, q) { return p.u - q.u; });
      for (i = 0; i < sol.length; i++) {
        var s = sol[i], u = Math.min(Math.max(s.u, 1e-6), 1 - 1e-6);
        cols.push({ xib: s.b >= 0 ? xb[s.b] : xb[P[0]] + u * (xb[Q[0]] - xb[P[0]]),
                    xit: s.t >= 0 ? xt[s.t] : xt[P[1]] + u * (xt[Q[1]] - xt[P[1]]),
                    nb: s.b >= 0 ? baixo[s.b] : -1, nt: s.t >= 0 ? cima[s.t] : -1 });
      }
    }
    function pontoCadeia(c, xs, xi) {
      var i2 = 0;
      while (i2 < xs.length - 2 && xi > xs[i2 + 1]) i2++;
      var f = xs[i2 + 1] > xs[i2] ? (xi - xs[i2]) / (xs[i2 + 1] - xs[i2]) : 0, A = X[c[i2]], B = X[c[i2 + 1]];
      return [A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1]), A[2] + f * (B[2] - A[2])];
    }
    // 3) subdivisões até o tamanho h
    var todas = [];
    for (k = 0; k < cols.length; k++) {
      var cc = cols[k];
      cc.pb = cc.nb >= 0 ? X[cc.nb] : pontoCadeia(baixo, xb, cc.xib);
      cc.pt = cc.nt >= 0 ? X[cc.nt] : pontoCadeia(cima, xt, cc.xit);
      if (k > 0) {
        var p0 = cols[k - 1], dx = 0.5 * (norma(sub(cc.pb, p0.pb)) + norma(sub(cc.pt, p0.pt))), ns = Math.max(1, Math.ceil(dx / h - 1e-9)), m;
        for (m = 1; m < ns; m++) {
          var f2 = m / ns;
          todas.push({ pb: pontoCadeia(baixo, xb, p0.xib + f2 * (cc.xib - p0.xib)), pt: pontoCadeia(cima, xt, p0.xit + f2 * (cc.xit - p0.xit)), nb: -1, nt: -1 });
        }
      }
      todas.push(cc);
    }
    var Hm = 0;
    for (k = 0; k < todas.length; k++) Hm += norma(sub(todas[k].pt, todas[k].pb)) / todas.length;
    return { colunas: todas, ny: Math.max(1, Math.ceil(Hm / h - 1e-9)) };
  }

  /* ---------- montagem ---------- */
  MadAnalise.montar = function (modelo, placas, opcoes) {
    opcoes = opcoes || {};
    var tabE = opcoes.E_MAT || E_MAT;
    var reg = opcoes.regularizacao === undefined ? 1e-6 : opcoes.regularizacao;
    var modoPlaca = opcoes.placa || "barras";
    if (modoPlaca !== "barras" && modoPlaca !== "casca") throw new Error("opcoes.placa deve ser \"barras\" ou \"casca\"");
    var NN = modelo.nos.length, ND = 6 * NN, ID = {}, X = [], i, j, k;
    for (k = 0; k < NN; k++) {
      var n = modelo.nos[k];
      ID[n.id] = k;
      X.push([n.x, n.y, n.z]);
    }
    var rows = [];
    for (k = 0; k < ND; k++) rows.push(new Map());
    var arestas = [], nElem = 0, rotulo = {}, cascas = [], barrasPlaca = [];

    var cortante = !!opcoes.cortante;
    function elemento(a, b, E, G, bb, hh, liberar, ey) {
      var rt = rotacao(X[a], X[b], ey);
      var kg = kGlobal(kLocal(rt.L, E, G, bb, hh, liberar, cortante), rt.R);
      var dofs = [], p, q, v, row;
      for (p = 0; p < 6; p++) dofs.push(6 * a + p);
      for (p = 0; p < 6; p++) dofs.push(6 * b + p);
      for (p = 0; p < 12; p++) {
        row = rows[dofs[p]];
        for (q = 0; q < 12; q++) {
          v = kg[p][q];
          if (v !== 0) row.set(dofs[q], (row.get(dofs[q]) || 0) + v);
        }
      }
      arestas.push([a, b]);
      nElem++;
    }

    var barraPorId = {};
    for (k = 0; k < modelo.barras.length; k++) {
      var br = modelo.barras[k];
      barraPorId[br.id] = br;
      if (ID[br.i] === undefined || ID[br.j] === undefined) throw new Error("Barra " + br.id + " liga nó inexistente");
      i = ID[br.i]; j = ID[br.j];
      var s = secao(modelo, br.grupo, tabE);
      if (br.garfo_fim) elemento(i, j, s.E, s.G, s.b, s.h, [10], br.rot_livre);
      else if (br.art_ini) elemento(i, j, s.E, s.G, s.b, s.h, [4, 5], null);
      else elemento(i, j, s.E, s.G, s.b, s.h, [], null);
    }

    // placas: costura em triângulos entre a cadeia de baixo e a de cima
    var PL = placas ? (placas.placas || placas) : [];
    var nPl = 0, ip;
    for (ip = 0; ip < PL.length; ip++) {
      var pl = PL[ip], vs = [], zmin = Infinity, zmax = -Infinity;
      for (k = 0; k < pl.vertices.length; k++) {
        if (ID[pl.vertices[k]] === undefined) throw new Error("Placa " + pl.painel + ": vértice " + pl.vertices[k] + " inexistente");
        vs.push(ID[pl.vertices[k]]);
        zmin = Math.min(zmin, X[vs[k]][2]); zmax = Math.max(zmax, X[vs[k]][2]);
      }
      var zm = (zmin + zmax) / 2, baixo = [], cima = [];
      for (k = 0; k < vs.length; k++) { if (X[vs[k]][2] < zm) baixo.push(vs[k]); else cima.push(vs[k]); }
      var d = sub(X[baixo[baixo.length - 1]], X[baixo[0]]);
      d[2] = 0; d = unit(d);
      var chave = function (kk) { return dot(X[kk], d); };
      var cmp = function (a, b) { return chave(a) - chave(b); };
      baixo.sort(cmp); cima.sort(cmp);
      var Ep = pl.E_MPa * 1000.0, Gp = Ep / 2.6, tp = pl.t_m, a_ = 0, b_ = 0, tri = [];
      if (modoPlaca === "casca") {
        var nuP = (pl.nu === undefined || pl.nu === null) ? 0.3 : pl.nu;
        var mh = malhaPlaca(baixo, cima, X, opcoes.malha || 0.3), cl = mh.colunas, ny = mh.ny, grade = [], c, r;
        for (c = 0; c < cl.length; c++) {
          grade.push([]);
          for (r = 0; r <= ny; r++) {
            if (r === 0 && cl[c].nb >= 0) grade[c].push(cl[c].nb);
            else if (r === ny && cl[c].nt >= 0) grade[c].push(cl[c].nt);
            else {
              var f = r / ny, pb = cl[c].pb, pt = cl[c].pt;
              X.push([pb[0] + f * (pt[0] - pb[0]), pb[1] + f * (pt[1] - pb[1]), pb[2] + f * (pt[2] - pb[2])]);
              for (k = 0; k < 6; k++) rows.push(new Map());
              rotulo[X.length - 1] = "placa PN-" + pl.painel + " (nó interno " + c + "," + r + ")";
              grade[c].push(X.length - 1);
            }
          }
        }
        var els = [];
        for (c = 0; c < cl.length - 1; c++) {
          for (r = 0; r < ny; r++) {
            var qn = [grade[c][r], grade[c + 1][r], grade[c + 1][r + 1], grade[c][r + 1]];
            var el = quadCasca([X[qn[0]], X[qn[1]], X[qn[2]], X[qn[3]]], Ep, nuP, tp, opcoes.drilling);
            var dofs = [];
            for (k = 0; k < 4; k++) for (e = 0; e < 6; e++) dofs.push(6 * qn[k] + e);
            somarK(rows, dofs, el.K);
            els.push({ nos: qn, el: el });
            arestas.push([qn[0], qn[1]], [qn[1], qn[2]], [qn[2], qn[3]]);
            nElem++;
          }
        }
        cascas.push({ painel: pl.painel, elementos: els, colunas: cl.length, linhas: ny });
        nPl++;
        continue;
      }
      while (a_ < baixo.length - 1 || b_ < cima.length - 1) {
        if (b_ === cima.length - 1 || (a_ < baixo.length - 1 && chave(baixo[a_ + 1]) <= chave(cima[b_ + 1]))) {
          tri.push([baixo[a_], baixo[a_ + 1], cima[b_]]); a_++;
        } else {
          tri.push([baixo[a_], cima[b_ + 1], cima[b_]]); b_++;
        }
      }
      var feitas = {}, t3, e, pq, p, q, ka, kb;
      for (k = 0; k < tri.length; k++) {
        t3 = tri[k];
        for (e = 0; e < 3; e++) {
          p = t3[e]; q = t3[(e + 1) % 3];
          ka = p + "," + q; kb = q + "," + p;
          if (feitas[ka] || feitas[kb] || p === q) continue;
          feitas[ka] = true;
          elemento(p, q, Ep, Gp, tp, tp, [], null);
          barrasPlaca.push([p, q, Ep, Gp, tp]);
        }
      }
      nPl++;
    }

    NN = X.length; ND = 6 * NN;
    var fixo = new Uint8Array(ND), apoiadas = [];
    for (k = 0; k < modelo.apoios.length; k++) {
      var no = ID[modelo.apoios[k].no];
      if (no === undefined) throw new Error("Apoio no nó inexistente " + modelo.apoios[k].no);
      for (j = 0; j < 6; j++) fixo[6 * no + j] = 1;
      apoiadas.push(no);
    }
    return { modelo: modelo, nn: NN, nd: ND, X: X, ID: ID, rows: rows, arestas: arestas, barraPorId: barraPorId,
             fixo: fixo, apoiadas: apoiadas, nPlacas: nPl, nElementos: nElem, reg: reg,
             gama: opcoes.gama || GAMA, E_MAT: tabE, placa: modoPlaca, cascas: cascas, rotulo: rotulo, cortante: cortante,
             barrasPlaca: barrasPlaca };
  };

  /* ---------- cargas (peso próprio + ops) ---------- */
  MadAnalise.cargas = function (M, ops, opcoes) {
    opcoes = opcoes || {};
    var gama = opcoes.gama || M.gama, modelo = M.modelo, X = M.X, ID = M.ID;
    var chaves = Object.keys(ops.hipoteses).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
    var hips = ["PP"], k, h;
    for (k = 0; k < chaves.length; k++) hips.push(ops.hipoteses[chaves[k]]);
    var F = [], tot = {}, vao = [], feqL = [];
    for (h = 0; h < hips.length; h++) { F.push(new Float64Array(M.nd)); tot[hips[h]] = 0; vao.push({}); feqL.push({}); }

    var consistente = opcoes.cargaNodal === "consistente";
    if (opcoes.cargaNodal && !consistente && opcoes.cargaNodal !== "alavanca") throw new Error("opcoes.cargaNodal deve ser \"alavanca\" ou \"consistente\"");
    function nodal(bid, a, fv, hh) {
      var b = M.barraPorId[bid];
      if (!b) throw new Error("Carga em barra inexistente: " + bid);
      var i = ID[b.i], j = ID[b.j], L = norma(sub(X[j], X[i]));
      var t = Math.min(Math.max(a / L, 0.0), 1.0), c;
      for (c = 0; c < 3; c++) { F[hh][6 * i + c] += fv[c] * (1 - t); F[hh][6 * j + c] += fv[c] * t; }
    }
    /* cargas nodais EQUIVALENTES (consistentes) de Euler–Bernoulli: forças + momentos de engastamento
     * perfeito pelas funções de Hermite; barra com liberação → condensação (f_k − K_kr·K_rr⁻¹·f_r).
     * pts = [[a (m desde o nó i), fv (força global kN)], ...] */
    function equivalente(bid, pts, hh) {
      var b = M.barraPorId[bid];
      if (!b) throw new Error("Carga em barra inexistente: " + bid);
      var i = ID[b.i], j = ID[b.j], rt = rotacao(X[i], X[j], b.garfo_fim ? b.rot_livre : null), L = rt.L, R = rt.R;
      var f = new Float64Array(12), p, a, c, r;
      for (p = 0; p < pts.length; p++) {
        var xi = Math.min(Math.max(pts[p][0] / L, 0), 1), fv = pts[p][1], fl = [0, 0, 0];
        for (a = 0; a < 3; a++) for (c = 0; c < 3; c++) fl[a] += R[a][c] * fv[c];
        var N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi, N2 = L * (xi - 2 * xi * xi + xi * xi * xi),
            N3 = 3 * xi * xi - 2 * xi * xi * xi, N4 = L * (-xi * xi + xi * xi * xi);
        f[0] += fl[0] * (1 - xi); f[6] += fl[0] * xi;
        f[1] += fl[1] * N1; f[5] += fl[1] * N2; f[7] += fl[1] * N3; f[11] += fl[1] * N4;
        f[2] += fl[2] * N1; f[4] -= fl[2] * N2; f[8] += fl[2] * N3; f[10] -= fl[2] * N4;
      }
      var lib = b.garfo_fim ? [10] : (b.art_ini ? [4, 5] : []);
      if (lib.length) {
        var sc = secao(modelo, b.grupo, opcoes.E_MAT || E_MAT), k0 = kLocal(L, sc.E, sc.G, sc.b, sc.h, [], M.cortante), Krr = [], fr = [];
        for (r = 0; r < lib.length; r++) { Krr.push(lib.map(function (q) { return k0[lib[r]][q]; })); fr.push([f[lib[r]]]); }
        var y = resolverPequeno(Krr, fr);
        for (a = 0; a < 12; a++) {
          if (lib.indexOf(a) >= 0) continue;
          for (r = 0; r < lib.length; r++) f[a] -= k0[a][lib[r]] * y[r][0];
        }
        for (r = 0; r < lib.length; r++) f[lib[r]] = 0;
      }
      var acc = feqL[hh][bid] || (feqL[hh][bid] = new Float64Array(12));    // f local (condensado) p/ MadAnalise.esforcos
      for (a = 0; a < 12; a++) acc[a] += f[a];
      for (var B = 0; B < 4; B++) {
        var no = B < 2 ? i : j, off = (B % 2) * 3;
        for (c = 0; c < 3; c++) {
          var v = 0;
          for (a = 0; a < 3; a++) v += R[a][c] * f[3 * B + a];
          F[hh][6 * no + off + c] += v;
        }
      }
    }
    var G3 = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];
    /** carga distribuída q (força/m, vetor global) em [a0, a1]: Gauss de 3 pontos (exato p/ Hermite cúbica) */
    function distribuida(bid, a0, a1, qv, hh) {
      var pts = [], m = 0.5 * (a0 + a1), hl = 0.5 * (a1 - a0), g2;
      (vao[hh][bid] = vao[hh][bid] || []).push({ t: "d", a0: a0, a1: a1, q: qv.slice() });
      for (g2 = 0; g2 < 3; g2++) pts.push([m + G3[g2][0] * hl, [qv[0] * G3[g2][1] * hl, qv[1] * G3[g2][1] * hl, qv[2] * G3[g2][1] * hl]]);
      equivalente(bid, pts, hh);
    }

    var b, s, g, L, W;
    for (k = 0; k < modelo.barras.length; k++) {
      b = modelo.barras[k];
      s = modelo.secoes[b.grupo];
      g = gama[s.material];
      if (!g) continue;
      L = norma(sub(X[ID[b.j]], X[ID[b.i]]));
      W = g * s.b_cm * s.h_cm / 1e4 * L;
      if (consistente) distribuida(b.id, 0, L, [0, 0, -W / L], 0);    // peso próprio é distribuído
      else nodal(b.id, L / 2, [0, 0, -W], 0);                          // Python: concentrado a L/2
      tot.PP += W;
    }
    var o, dd, kk, sg, bi, a0, a1, P, fv, nm;
    for (k = 0; k < ops.ops.length; k++) {
      o = ops.ops[k];
      nm = ops.hipoteses[String(o.hip)];
      h = hips.indexOf(nm);
      if (h < 0) throw new Error("Operação de carga com hipótese desconhecida: " + o.hip);
      dd = DIRS[o.dir];
      if (!dd) throw new Error("Direção de carga desconhecida: " + o.dir);
      kk = dd[0]; sg = dd[1];
      for (bi = 0; bi < o.barras.length; bi++) {
        b = M.barraPorId[o.barras[bi]];
        if (!b) throw new Error("Carga em barra inexistente: " + o.barras[bi]);
        L = norma(sub(X[ID[b.j]], X[ID[b.i]]));
        if (o.tipo === "uniforme") { a0 = 0.0; a1 = L; P = o.q * L; }
        else if (o.tipo === "faixa") { a0 = o.a; a1 = o.b; P = o.q * (o.b - o.a); }
        else { a0 = a1 = o.a; P = o.F; }
        fv = [0, 0, 0]; fv[kk] = sg * P;
        if (!consistente) nodal(o.barras[bi], (a0 + a1) / 2, fv, h);
        else if (o.tipo === "uniforme" || o.tipo === "faixa") {
          var qv = [0, 0, 0]; qv[kk] = sg * o.q;
          distribuida(o.barras[bi], Math.max(0, a0), Math.min(L, a1), qv, h);
        } else {
          (vao[h][o.barras[bi]] = vao[h][o.barras[bi]] || []).push({ t: "p", a: Math.min(Math.max(a0, 0), L), f: fv.slice() });
          equivalente(o.barras[bi], [[a0, fv]], h);
        }
        tot[hips[h]] += P;
      }
    }
    return { hips: hips, F: F, tot: tot, consistente: consistente, vao: vao, feq: feqL };
  };

  /* ---------- grafo, componentes, RCM ---------- */
  function partesSoltas(M) {
    var pai = [], k;
    for (k = 0; k < M.nn; k++) pai.push(k);
    function raiz(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    for (k = 0; k < M.arestas.length; k++) pai[raiz(M.arestas[k][0])] = raiz(M.arestas[k][1]);
    var comp = {}, r;
    for (k = 0; k < M.nn; k++) { r = raiz(k); (comp[r] = comp[r] || []).push(k); }
    var ap = {};
    for (k = 0; k < M.apoiadas.length; k++) ap[raiz(M.apoiadas[k])] = true;
    var soltas = [];
    Object.keys(comp).forEach(function (rr) { if (!ap[rr]) soltas.push(comp[rr]); });
    return soltas;
  }

  /** id do nó no modelo; nó interno de placa (casca) ou de sistema sem modelo → "#índice" */
  function idNo(M, k) {
    return (M.modelo && k < M.modelo.nos.length) ? M.modelo.nos[k].id : "#" + k;
  }
  function descNo(M, k) {
    var p = M.X[k], nome = (M.modelo && k < M.modelo.nos.length) ? "nó " + M.modelo.nos[k].id
      : ((M.rotulo && M.rotulo[k]) || "nó #" + k);
    return nome + " (" + p[0].toFixed(3) + ", " + p[1].toFixed(3) + ", " + p[2].toFixed(3) + ")";
  }

  function rcm(adj) {
    var n = adj.length, grau = new Int32Array(n), i, j;
    for (i = 0; i < n; i++) grau[i] = adj[i].length;
    var visit = new Uint8Array(n), nivel = new Int32Array(n).fill(-1), ordem = [];
    // BFS de níveis a partir de s; devolve {ult: nós do último nível, ecc}
    function niveis(s) {
      var fila = [s], ini = 0, touched = [s];
      nivel[s] = 0;
      var ult = [s], ecc = 0, u, v, e;
      while (ini < fila.length) {
        u = fila[ini++];
        if (nivel[u] > ecc) { ecc = nivel[u]; ult = []; }
        if (nivel[u] === ecc) ult.push(u);
        for (e = 0; e < adj[u].length; e++) {
          v = adj[u][e];
          if (nivel[v] < 0) { nivel[v] = nivel[u] + 1; fila.push(v); touched.push(v); }
        }
      }
      for (e = 0; e < touched.length; e++) nivel[touched[e]] = -1;
      return { ult: ult, ecc: ecc };
    }
    for (i = 0; i < n; i++) {
      if (visit[i]) continue;
      // início: nó de menor grau não visitado do componente (via i) refinado pseudo-periférico
      var s = i, res = niveis(s), it, melhor, t;
      for (it = 0; it < 6; it++) {
        melhor = res.ult[0];
        for (j = 1; j < res.ult.length; j++) if (grau[res.ult[j]] < grau[melhor]) melhor = res.ult[j];
        t = niveis(melhor);
        if (t.ecc > res.ecc) { s = melhor; res = t; } else break;
      }
      var fila = [s], ini = 0, u, vizinhos;
      visit[s] = 1;
      while (ini < fila.length) {
        u = fila[ini++]; ordem.push(u);
        vizinhos = [];
        for (j = 0; j < adj[u].length; j++) if (!visit[adj[u][j]]) { visit[adj[u][j]] = 1; vizinhos.push(adj[u][j]); }
        vizinhos.sort(function (a, b) { return grau[a] - grau[b]; });
        for (j = 0; j < vizinhos.length; j++) fila.push(vizinhos[j]);
      }
    }
    ordem.reverse();
    return ordem;
  }

  /** fatora (K_livre + reg·I) em perfil; devolve função resolver(vetor livre original) */
  function fatorar(M, reg, extraDiag) {
    var livres = [], idxLivre = new Int32Array(M.nd).fill(-1), d;
    for (d = 0; d < M.nd; d++) if (!M.fixo[d]) { idxLivre[d] = livres.length; livres.push(d); }
    var n = livres.length, adj = [], i, c, row, lst;
    for (i = 0; i < n; i++) {
      lst = [];
      M.rows[livres[i]].forEach(function (v, col) {
        var q = idxLivre[col];
        if (q >= 0 && q !== i && v !== 0) lst.push(q);
      });
      adj.push(lst);
    }
    var ordem = rcm(adj), inv = new Int32Array(n);
    for (i = 0; i < n; i++) inv[ordem[i]] = i;
    var first = new Int32Array(n), off = new Float64Array(n + 1), p, mn, total = 0;
    for (p = 0; p < n; p++) {
      mn = p;
      for (c = 0; c < adj[ordem[p]].length; c++) { var pq = inv[adj[ordem[p]][c]]; if (pq < mn) mn = pq; }
      first[p] = mn; off[p] = total; total += p - mn + 1;
    }
    var L = new Float64Array(total);
    for (p = 0; p < n; p++) {
      var dof = livres[ordem[p]], f0 = first[p], o0 = off[p];
      M.rows[dof].forEach(function (v, col) {
        var q = idxLivre[col];
        if (q < 0) return;
        var pq = inv[q];
        if (pq <= p) L[o0 + pq - f0] += v;
      });
      L[o0 + p - f0] += reg + (extraDiag ? extraDiag(dof) : 0);
    }
    // Cholesky em perfil, por linhas
    var j, jj, k, s, oj, fj, k0, di;
    for (i = 0; i < n; i++) {
      var fi = first[i], oi = off[i];
      for (j = fi; j <= i; j++) {
        fj = first[j]; oj = off[j];
        k0 = fi > fj ? fi : fj;
        s = L[oi + j - fi];
        for (k = k0; k < j; k++) s -= L[oi + k - fi] * L[oj + k - fj];
        if (j < i) L[oi + j - fi] = s / L[oj + j - fj];
        else {
          if (!(s > 0)) {
            var e = new Error("Matriz singular (mecanismo) no " + descNo(M, Math.floor(livres[ordem[i]] / 6)) +
                              ", gdl " + (livres[ordem[i]] % 6) + " (pivô " + s + ")");
            e.mecanismo = true; throw e;
          }
          L[oi + i - fi] = Math.sqrt(s);
        }
      }
    }
    return {
      livres: livres, n: n,
      resolver: function (b) {            // b: Float64Array tamanho nd (usa só livres); devolve u nd
        var y = new Float64Array(n), ii, kk, ss, fi2, oi2;
        for (ii = 0; ii < n; ii++) {
          ss = b[livres[ordem[ii]]]; fi2 = first[ii]; oi2 = off[ii];
          for (kk = fi2; kk < ii; kk++) ss -= L[oi2 + kk - fi2] * y[kk];
          y[ii] = ss / L[oi2 + ii - fi2];
        }
        for (ii = n - 1; ii >= 0; ii--) {
          fi2 = first[ii]; oi2 = off[ii];
          y[ii] = y[ii] / L[oi2 + ii - fi2];
          for (kk = fi2; kk < ii; kk++) y[kk] -= L[oi2 + kk - fi2] * y[ii];
        }
        var u = new Float64Array(M.nd);
        for (ii = 0; ii < n; ii++) u[livres[ordem[ii]]] = y[ii];
        return u;
      }
    };
  }

  function deslocNos(M, u) {
    var r = new Float64Array(M.nn), k;
    for (k = 0; k < M.nn; k++) r[k] = Math.sqrt(u[6 * k] * u[6 * k] + u[6 * k + 1] * u[6 * k + 1] + u[6 * k + 2] * u[6 * k + 2]);
    return r;
  }

  function erroMecanismo(M, ruins) {
    var lista = ruins.slice(0, 15).map(function (r) { return descNo(M, r[0]) + " desloc " + r[1].toExponential(1) + " m"; });
    var e = new Error("MECANISMO: " + ruins.length + " nó(s) com deslocamento > 100 m (só a mola de 1e-6 os segura). Suspeitos: " + lista.join("; "));
    e.mecanismo = true; e.nos = ruins.map(function (r) { return idNo(M, r[0]); });
    return e;
  }

  function erroSoltas(M, soltas) {
    var lista = soltas.slice(0, 10).map(function (c) { return c.length + " nó(s), ex. " + descNo(M, c[0]); });
    var e = new Error("MECANISMO: " + soltas.length + " parte(s) sem apoio: " + lista.join("; "));
    e.mecanismo = true; e.nos = [].concat.apply([], soltas.map(function (c) { return c.map(function (k) { return idNo(M, k); }); }));
    return e;
  }

  /* ---------- solução ---------- */
  MadAnalise.resolver = function (M, C) {
    var t0 = Date.now(), soltas = partesSoltas(M);
    if (soltas.length) throw erroSoltas(M, soltas);
    var fat = fatorar(M, M.reg, null), nh = C.hips.length, h, U = [], k, ruins = [], u, dn;
    for (h = 0; h < nh; h++) {
      u = fat.resolver(C.F[h]);
      dn = deslocNos(M, u);
      for (k = 0; k < M.nn; k++) if (dn[k] > 100.0) ruins.push([k, dn[k]]);
      if (ruins.length) throw erroMecanismo(M, ruins.sort(function (a, b) { return b[1] - a[1]; }));
      U.push(u);
    }
    // reações: R = K[fixos,:]·u − F[fixos]
    var Rn = {}, d, v, rr, acc, sum;
    for (k = 0; k < M.apoiadas.length; k++) {
      var no = M.apoiadas[k];
      if (Rn[no]) continue;
      Rn[no] = [];
      for (h = 0; h < nh; h++) Rn[no].push([0, 0, 0, 0, 0, 0]);
      for (d = 0; d < 6; d++) {
        rr = M.rows[6 * no + d];
        for (h = 0; h < nh; h++) {
          sum = 0;
          rr.forEach(function (val, col) { if (!M.fixo[col]) sum += val * U[h][col]; });
          Rn[no][h][d] = sum - C.F[h][6 * no + d];
        }
      }
    }
    var por = {}, ids = [], a, pid;
    for (k = 0; k < M.modelo.apoios.length; k++) {
      a = M.modelo.apoios[k]; pid = a.pilarete;
      if (!por[pid]) {
        por[pid] = []; ids.push(pid);
        for (h = 0; h < nh; h++) por[pid].push([0, 0, 0, 0, 0, 0]);
      }
      var no2 = M.ID[a.no];
      // apoio repetido no mesmo nó soma só uma vez por entrada do modelo, como o Python
      for (h = 0; h < nh; h++) for (d = 0; d < 6; d++) por[pid][h][d] += Rn[no2][h][d];
    }
    ids.sort(function (x, y) {
      var sx = x.slice(3), sy = y.slice(3);
      if (sx !== sy) return sx < sy ? -1 : 1;
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    var reacoes = ids.map(function (pid2) {
      var casos = {};
      C.hips.forEach(function (nome, hh) {
        var v2 = por[pid2][hh];
        casos[nome] = { N: v2[2], Vx: v2[0], Vy: v2[1], Mx: v2[3], My: v2[4] };
      });
      return { id: pid2, casos: casos };
    });
    var somas = C.hips.map(function (nome, hh) {
      var Rz = 0, Rx = 0, Ry = 0, dm = 0, dnh = deslocNos(M, U[hh]);
      ids.forEach(function (p) { Rz += por[p][hh][2]; Rx += por[p][hh][0]; Ry += por[p][hh][1]; });
      for (k = 0; k < M.nn; k++) if (dnh[k] > dm) dm = dnh[k];
      return { hip: nome, cargas: C.tot[nome], Rz: Rz, Rx: Rx, Ry: Ry, deslocMaxMm: dm * 1000 };
    });
    return { hips: C.hips, U: U, reacoes: reacoes, somas: somas, ms: Date.now() - t0, gdlLivres: fat.n };
  };

  /* ---------- esforços nas barras (eixos locais) ----------
   * MadAnalise.esforcos(M, C, R, opcoes) -> { hips, estacoes, barras: [...], porId: {id: barra} }
   *   barra = { id, grupo, L, nos: [idI, idJ], R: [ex, ey, ez] (linhas, em coordenadas globais), casos: { hip: { ini, fim, est: [{x, N, Vy, Vz, T, My, Mz}], max } } }
   * CONVENÇÃO (esforço SOLICITANTE de seção, nos eixos locais ex = i→j, ey, ez da barra):
   *   é a ação que a parte da barra do lado +x exerce sobre a face de normal +ex (vetor força e vetor
   *   momento, regra da mão direita, decompostos em ex, ey, ez):
   *     N  > 0 tração · Vy, Vz = componentes de força na face +x · T = momento em torno de ex
   *     My = momento em torno de ey: My > 0 TRACIONA a fibra de z local positivo (balanço com carga para
   *          baixo: My > 0 no engaste, tração em cima, se ez aponta para cima)
   *     Mz = momento em torno de ez: Mz > 0 traciona a fibra de y local negativo.
   *   "ini" é a seção em x = 0 (nó i) e "fim" em x = L (nó j), no MESMO critério (face +x), logo na ponta i os
   *   valores são o oposto da força de ponta que o nó aplica na barra, e na ponta j são a própria força de ponta.
   * ORIGEM: força de ponta f = k_cond·u_local − f_eq (k_cond = rigidez já condensada das liberações, portanto o
   *   momento na ponta rotulada sai ZERO; f_eq = cargas equivalentes condensadas, só existem com
   *   cargaNodal = "consistente"). Estações: x = k·L/(n−1), n = opcoes.estacoes (padrão 5, mínimo 2), pelo
   *   equilíbrio do trecho [0, x] com as cargas aplicadas no vão (C.vao). Com cargaNodal = "alavanca" (padrão,
   *   como o Python) a barra NÃO tem carga no vão (a carga foi para os nós): N, V, T constantes e M linear.
   *   As PONTAS (x = 0 e x = L) são as faces externas da barra: carga concentrada exatamente sobre o nó i não entra
   *   em x = 0 (vai direto ao nó); em x = L a estação já está depois da carga (= força de ponta j). Em estação
   *   coincidente com carga concentrada vale o valor DEPOIS da carga.
   *   max = máximo ABSOLUTO de cada componente entre as estações e as pontas.
   * opcoes.hips = lista de nomes (padrão: todas). Só as barras de modelo.barras (não os elementos das placas). */
  var COMP = ["N", "Vy", "Vz", "T", "My", "Mz"];
  MadAnalise.esforcos = function (M, C, R, opcoes) {
    opcoes = opcoes || {};
    var nest = Math.max(2, Math.floor(opcoes.estacoes || 5)), modelo = M.modelo, X = M.X, ID = M.ID;
    var tabE = M.E_MAT || E_MAT, nomes = opcoes.hips || C.hips, hidx = [], h, k, a, c, q;
    for (h = 0; h < nomes.length; h++) {
      q = C.hips.indexOf(nomes[h]);
      if (q < 0) throw new Error("Hipótese desconhecida em esforcos: " + nomes[h]);
      hidx.push(q);
    }
    var barras = [], porId = {}, ul = new Float64Array(12), f = new Float64Array(12);
    function loc(Rm, v) {
      return [Rm[0][0] * v[0] + Rm[0][1] * v[1] + Rm[0][2] * v[2], Rm[1][0] * v[0] + Rm[1][1] * v[1] + Rm[1][2] * v[2],
              Rm[2][0] * v[0] + Rm[2][1] * v[1] + Rm[2][2] * v[2]];
    }
    function vetor(S) { var o = {}, t; for (t = 0; t < 6; t++) o[COMP[t]] = S[t]; return o; }
    for (k = 0; k < modelo.barras.length; k++) {
      var b = modelo.barras[k], i = ID[b.i], j = ID[b.j], s = secao(modelo, b.grupo, tabE);
      var rt = rotacao(X[i], X[j], b.garfo_fim ? b.rot_livre : null), L = rt.L, Rm = rt.R;
      var lib = b.garfo_fim ? [10] : (b.art_ini ? [4, 5] : []);
      var kl = kLocal(L, s.E, s.G, s.b, s.h, lib, M.cortante), casos = {};
      for (h = 0; h < nomes.length; h++) {
        var hi = hidx[h], u = R.U[hi], blk, p;
        for (blk = 0; blk < 4; blk++) {
          var no = blk < 2 ? i : j, off = 6 * no + 3 * (blk % 2);
          for (a = 0; a < 3; a++) ul[3 * blk + a] = Rm[a][0] * u[off] + Rm[a][1] * u[off + 1] + Rm[a][2] * u[off + 2];
        }
        for (p = 0; p < 12; p++) { var sm = 0; for (c = 0; c < 12; c++) sm += kl[p][c] * ul[c]; f[p] = sm; }
        var feq = C.feq && C.feq[hi] ? C.feq[hi][b.id] : null;
        if (feq) for (p = 0; p < 12; p++) f[p] -= feq[p];
        // cargas do vão em eixos locais
        var cv = (C.vao && C.vao[hi] && C.vao[hi][b.id]) || [], lv = [];
        for (p = 0; p < cv.length; p++) {
          if (cv[p].t === "p") lv.push({ t: "p", a: cv[p].a, f: loc(Rm, cv[p].f) });
          else lv.push({ t: "d", a0: cv[p].a0, a1: cv[p].a1, q: loc(Rm, cv[p].q) });
        }
        var est = [], mx = [0, 0, 0, 0, 0, 0], ie;
        for (ie = 0; ie < nest; ie++) {
          var x = L * ie / (nest - 1), Fi = [-f[0], -f[1], -f[2]], Mi = [-f[3], -f[4], -f[5]], w;
          // equilíbrio do trecho [0, x] em torno do ponto x: o termo (−x·ex)×f_i = (0, x·f_z, −x·f_y) passa com sinal trocado
          Mi[1] -= x * f[2]; Mi[2] += x * f[1];
          for (w = 0; w < lv.length; w++) {
            var ld = lv[w], Qv, cen;
            if (ld.t === "p") { if (ld.a > x || x === 0) continue; Qv = ld.f; cen = ld.a; }
            else {
              var ll = Math.min(Math.max(x - ld.a0, 0), ld.a1 - ld.a0);
              if (ll <= 0) continue;
              Qv = [ld.q[0] * ll, ld.q[1] * ll, ld.q[2] * ll]; cen = ld.a0 + ll / 2;
            }
            Fi[0] -= Qv[0]; Fi[1] -= Qv[1]; Fi[2] -= Qv[2];
            Mi[1] -= (cen - x) * (-Qv[2]); Mi[2] -= (cen - x) * Qv[1];   // −(cen−x)·(ex×Q), ex×Q = (0, −Qz, Qy)
          }
          var S = [Fi[0], Fi[1], Fi[2], Mi[0], Mi[1], Mi[2]], e = vetor(S);
          e.x = x; est.push(e);
          for (p = 0; p < 6; p++) if (Math.abs(S[p]) > mx[p]) mx[p] = Math.abs(S[p]);
        }
        var ini = vetor([-f[0], -f[1], -f[2], -f[3], -f[4], -f[5]]), fim = vetor([f[6], f[7], f[8], f[9], f[10], f[11]]);
        for (p = 0; p < 6; p++) mx[p] = Math.max(mx[p], Math.abs(ini[COMP[p]]), Math.abs(fim[COMP[p]]));
        casos[nomes[h]] = { ini: ini, fim: fim, est: est, max: vetor(mx) };
      }
      var br = { id: b.id, grupo: b.grupo, L: L, nos: [b.i, b.j], R: Rm, casos: casos };
      barras.push(br); porId[b.id] = br;
    }
    return { hips: nomes.slice(), estacoes: nest, barras: barras, porId: porId };
  };

  /* MadAnalise.combinar(esf, combinacoes) com combinacoes = [{nome, fatores: {hip: coef}}] → mesmo formato de
   * esforcos(), com hips = nomes das combinações (soma linear de pontas e estações; max recalculado sobre
   * as estações/pontas combinadas, isto é, o máximo da combinação, não a soma dos máximos). */
  MadAnalise.combinar = function (esf, combinacoes) {
    var nomes = combinacoes.map(function (cb) { return cb.nome; }), out = [], porId = {}, k, g, t, e, w;
    combinacoes.forEach(function (cb) {
      Object.keys(cb.fatores).forEach(function (hn) {
        if (esf.hips.indexOf(hn) < 0) throw new Error("Combinação " + cb.nome + ": hipótese '" + hn + "' não está nos esforços");
      });
    });
    function soma(casosB, fat, campo) {
      var o = { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }, hn;
      for (hn in fat) for (t = 0; t < 6; t++) o[COMP[t]] += fat[hn] * campo(casosB[hn])[COMP[t]];
      return o;
    }
    for (k = 0; k < esf.barras.length; k++) {
      var b = esf.barras[k], casos = {};
      for (g = 0; g < combinacoes.length; g++) {
        var cb = combinacoes[g], fat = cb.fatores, est = [], mx = { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 };
        for (e = 0; e < esf.estacoes; e++) {
          var o = soma(b.casos, fat, function (cs) { return cs.est[e]; });
          o.x = b.L * e / (esf.estacoes - 1);
          est.push(o);
        }
        var ini = soma(b.casos, fat, function (cs) { return cs.ini; }), fim = soma(b.casos, fat, function (cs) { return cs.fim; });
        [ini, fim].concat(est).forEach(function (o2) { for (w = 0; w < 6; w++) if (Math.abs(o2[COMP[w]]) > mx[COMP[w]]) mx[COMP[w]] = Math.abs(o2[COMP[w]]); });
        casos[cb.nome] = { ini: ini, fim: fim, est: est, max: mx };
      }
      var nb = { id: b.id, grupo: b.grupo, L: b.L, nos: b.nos, R: b.R, casos: casos };
      out.push(nb); porId[b.id] = nb;
    }
    return { hips: nomes, estacoes: esf.estacoes, barras: out, porId: porId };
  };

  /* ---------- ESTABILIDADE GLOBAL (flambagem por autovalor) ----------
   * MadAnalise.estabilidade(M, C, R, opcoes) -> { combinacoes: [...], alphaCrMin, alphaRefPilares, betaPorPilar, ... }
   * Porta de estabilidade_V18.py (09/10/2026): para cada combinação ELU com vento, os esforços normais N das barras
   * (1ª ordem, linear na combinação) montam a matriz geométrica Kg e o problema (K + α·Kg)·φ = 0 dá o fator de carga
   * crítica α_cr (menor α positivo). Por pilar: L0 = π·√(E·I / (α_ref·N)) e β = L0 / L.
   *   · Kg "DE CORDA" (só os deslocamentos transversais v, w de cada barra; P/L·[1 −1; −1 1] em cada plano). A forma
   *     completa, com os giros, em barra ROTULADA cria instabilidade falsa nos giros liberados (α ≈ 0 no 1º teste do
   *     Python); a de corda vale para qualquer liberação e capta o deslocamento lateral do pórtico (P-Δ). O P-δ entre
   *     nós (a barra longa sem nó no meio) NÃO entra: o local fica na verificação da peça. A de corda converge para o
   *     exato com a malha (erro ~ 1/n²; ver os testes de coluna).
   *   · K é a mesma matriz fatorada da análise (+ reg·I; gdl sem rigidez ganham mola 1e-3, como o Python).
   *   · AUTOVALOR: Lanczos generalizado no produto interno de K (operador A = K⁻¹·(−Kg), autoadjunto em <x,y>_K),
   *     reortogonalização completa (2 passadas), reaproveitando a fatoração Cholesky em perfil + RCM de resolver()
   *     (cada passo = 1 retrossubstituição). Valores de Ritz por QL implícito de matriz tridiagonal; convergência
   *     pelo resíduo |β·s_último| ≤ tol·μ dos `modos` maiores μ = 1/α positivos (padrão 40, como o k=40 do Python).
   *   · "modo dos pilares": 1º dos `modos` modos em que os nós dos pilares levam ≥ 30 % do deslocamento (o 1º modo pode
   *     ser local: forro/guia). alphaRef de cada combinação = alphaCrPilares, senão alphaCr (como o Python).
   * PLACAS: com placa = "barras" a malha de barras das placas só entra na rigidez K (como no Python: o Kg do Python é
   *   montado SÓ com as barras do modelo). opcoes.kgPlacas = true põe também o Kg das barras da malha (padrão false =
   *   Python; a regressão exige false). Com placa = "casca" a casca entra só na rigidez K (membrana + flexão): NÃO há Kg
   *   da casca (membrana sob compressão não implementada) — a parede de casca age como diafragma de contraventamento
   *   sem perder rigidez pela própria compressão. O α com casca é, portanto, não-conservador na parcela de flambagem
   *   da própria parede (efeito medido no teste: α com a casca × α com a malha de barras).
   * OPÇÕES: combinacoes [{nome, fatores:{hip:coef}}] (padrão: as 2 ELU com vento do Python × V1..Vn),
   *   grupos (lista de grupos de seção que entram na Kg; padrão = todas as barras, como o Python — ver abaixo),
   *   modos (40), maxIter (400), tol (1e-7), grupoPilar ("PILAR"), Eef (kN/m²: E usado em L0; padrão = E da seção;
   *   o Python usa kmod·E0,m = 0,48 · 19,5e6), Nmin (0,5 kN: N mínimo p/ betaPorPilar), kgPlacas.
   * ATENÇÃO — barras soltas: com a Kg de TODAS as barras, uma viga comprimida cujo único travamento lateral é um nó sem rigidez
   *   nesse sentido (corrente de vigas biarticuladas na linha, sem piso/contraventamento no modelo) vira modo de α ≈ 1e-6: não é
   *   flambagem da estrutura, é mecanismo do modelo (o 1º-ordem passa porque nada o carrega lateralmente). O resultado traz
   *   `modoNos` (nós de maior deslocamento do 1º modo e os grupos que neles chegam, como o `modo_nos` do Python) para diagnosticar;
   *   `grupos: ["PILAR"]` calcula a estabilidade global só com a Kg dos pilares (P-Δ do pórtico), sem esses modos locais.
   * Unidades: m, kN. */
  function tqli(d, e, z) {            // QL implícito (autovalores em d; z = linhas a rotacionar, ou null)
    var n = d.length, m, l, it, i, k, s, c, p, g, f, dd, r, b;
    for (l = 0; l < n; l++) {
      it = 0;
      do {
        for (m = l; m < n - 1; m++) { dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 1e-16 * dd) break; }
        if (m !== l) {
          if (it++ === 80) throw new Error("tqli: sem convergência");
          g = (d[l + 1] - d[l]) / (2 * e[l]); r = Math.sqrt(g * g + 1);
          g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
          s = 1; c = 1; p = 0;
          for (i = m - 1; i >= l; i--) {
            f = s * e[i]; b = c * e[i];
            r = Math.sqrt(f * f + g * g); e[i + 1] = r;
            if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
            s = f / r; c = g / r; g = d[i + 1] - p;
            r = (d[i] - g) * s + 2 * c * b; p = s * r; d[i + 1] = g + p; g = c * r - b;
            if (z) for (k = 0; k < z.length; k++) { f = z[k][i + 1]; z[k][i + 1] = s * z[k][i] + c * f; z[k][i] = c * z[k][i] - s * f; }
          }
          if (r === 0 && i >= l) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
  }

  /** Lanczos no produto <x,y>_K para K·φ = α·G·φ (G = −Kg): maiores μ = 1/α positivos.
   *  Kmul, Gmul: x -> vetor; Kinv: x -> K⁻¹x (todos em índices livres compactos, tamanho n). */
  function lanczosFlambagem(n, Kmul, Gmul, Kinv, nw, mMax, tol) {
    var Q = [], KQ = [], al = [], be = [], k, i, j, pass;
    function dot(a, b) { var s = 0, t; for (t = 0; t < n; t++) s += a[t] * b[t]; return s; }
    var q = new Float64Array(n);
    for (k = 0; k < n; k++) q[k] = 1 + 0.37 * Math.sin(1.7 * k + 3);
    var Kq = Kmul(q), nr = Math.sqrt(dot(q, Kq));
    for (k = 0; k < n; k++) { q[k] /= nr; Kq[k] /= nr; }
    mMax = Math.min(mMax, n);
    var resultado = null, esc = 0;
    function checar(m, invariante, fim) {
      var d = new Float64Array(m), e = new Float64Array(m), zr = [new Float64Array(m)], t;
      for (t = 0; t < m; t++) { d[t] = al[t]; e[t] = t < m - 1 ? be[t] : 0; }
      zr[0][m - 1] = 1;
      tqli(d, e, zr);
      var pos = [];
      for (t = 0; t < m; t++) if (d[t] > 1e-9) pos.push({ mu: d[t], idx: t, res: invariante ? 0 : Math.abs(be[m - 1] * zr[0][t]) });
      pos.sort(function (a, b) { return b.mu - a.mu; });
      var top = pos.slice(0, nw), conv = top.length > 0 && top.every(function (p) { return p.res <= tol * p.mu; });
      if (conv && top.length < nw && !invariante && !fim) conv = false;      // pode haver mais modos positivos ainda não vistos
      if (conv || invariante || fim) {
        var dd = new Float64Array(m), ee = new Float64Array(m), Z = [];
        for (t = 0; t < m; t++) { dd[t] = al[t]; ee[t] = t < m - 1 ? be[t] : 0; var row = new Float64Array(m); row[t] = 1; Z.push(row); }
        tqli(dd, ee, Z);
        resultado = { m: m, convergiu: conv, modos: top.map(function (p) {
          return { alpha: 1 / dd[p.idx], mu: dd[p.idx], res: p.res, col: p.idx };
        }), Z: Z, positivos: pos.length };
        return true;
      }
      return false;
    }
    for (j = 0; j < mMax; j++) {
      Q.push(q); KQ.push(Kq);
      var Gq = Gmul(q), a = dot(q, Gq), w;
      for (k = 0; k < n; k++) if (Math.abs(Gq[k]) > esc) esc = Math.abs(Gq[k]);
      if (j === 0 && esc === 0) return { m: 0, convergiu: true, modos: [], Q: Q, Z: null, positivos: 0 };
      w = Kinv(Gq);
      al.push(a);
      for (k = 0; k < n; k++) w[k] -= a * q[k] + (j > 0 ? be[j - 1] * Q[j - 1][k] : 0);
      for (pass = 0; pass < 2; pass++) for (i = 0; i <= j; i++) { var cc = dot(KQ[i], w); for (k = 0; k < n; k++) w[k] -= cc * Q[i][k]; }
      var Kw = Kmul(w), b = Math.sqrt(Math.max(0, dot(w, Kw))), amax = 0;
      for (k = 0; k <= j; k++) amax = Math.max(amax, Math.abs(al[k]));
      var invariante = b <= 1e-11 * Math.max(amax, 1e-300), fim = (j + 1 === mMax);
      be.push(invariante ? 0 : b);
      if (invariante || fim || (j + 1 >= 20 && (j + 1) % 10 === 0)) if (checar(j + 1, invariante, fim)) break;
      for (k = 0; k < n; k++) { w[k] /= b; Kw[k] /= b; }
      q = w; Kq = Kw;
    }
    resultado.Q = Q;
    return resultado;
  }

  var COMBS_ELU_VENTO = [
    { nome: "1,4G+1,4Q+0,84V", fatores: { PP: 1.4, CP: 1.4, SCpiso: 1.4, SCcob: 1.4 }, vento: 0.84 },
    { nome: "1,4G+0,98Q+1,4V", fatores: { PP: 1.4, CP: 1.4, SCpiso: 0.98, SCcob: 0.98 }, vento: 1.4 }];

  MadAnalise.estabilidade = function (M, C, R, opcoes) {
    opcoes = opcoes || {};
    var t0 = Date.now(), modelo = M.modelo, X = M.X, ID = M.ID, tabE = M.E_MAT || E_MAT, nd = M.nd;
    var nw = Math.max(1, Math.floor(opcoes.modos || 40)), mMax = Math.floor(opcoes.maxIter || 400), tol = opcoes.tol || 1e-7;
    var gruposKg = opcoes.grupos ? {} : null;
    if (opcoes.grupos) opcoes.grupos.forEach(function (g0) { gruposKg[g0] = true; });
    var grupoPil = opcoes.grupoPilar || "PILAR", Nmin = opcoes.Nmin === undefined ? 0.5 : opcoes.Nmin, kgPlacas = !!opcoes.kgPlacas;
    var hips = C.hips, k, h, c, a;
    var avisos = [];
    if (M.placa === "casca") avisos.push("placa = casca: a casca entra só na rigidez K; não há Kg da casca (membrana sob compressão não implementada)");
    if (kgPlacas && M.placa === "casca") avisos.push("kgPlacas ignorado com placa = casca");

    // combinações
    var combs = [];
    if (opcoes.combinacoes) combs = opcoes.combinacoes.map(function (cb) { return { nome: cb.nome, fatores: cb.fatores }; });
    else {
      var ventos = hips.filter(function (x) { return /^V[0-9]+$/.test(x); });
      COMBS_ELU_VENTO.forEach(function (cb) {
        ventos.forEach(function (v) {
          var f = {};
          Object.keys(cb.fatores).forEach(function (hn) { if (hips.indexOf(hn) >= 0) f[hn] = cb.fatores[hn]; });
          f[v] = cb.vento;
          combs.push({ nome: cb.nome + "/" + v, fatores: f });
        });
      });
    }
    combs.forEach(function (cb) {
      Object.keys(cb.fatores).forEach(function (hn) { if (hips.indexOf(hn) < 0) throw new Error("Combinação " + cb.nome + ": hipótese '" + hn + "' desconhecida"); });
    });

    // elementos: barras do modelo (+ malha das placas se kgPlacas): ponta j, linha 6 de k_local (N = f[6], tração +)
    var els = [], bi, ul = new Float64Array(12);
    function addEl(a_, b_, rt, kl, extra) {
      els.push({ i: a_, j: b_, L: rt.L, R: rt.R, k6: new Float64Array(kl[6]), ex: rt.R[0], x: extra });
    }
    for (bi = 0; bi < modelo.barras.length; bi++) {
      var br = modelo.barras[bi], s = secao(modelo, br.grupo, tabE);
      var rt = rotacao(X[ID[br.i]], X[ID[br.j]], br.garfo_fim ? br.rot_livre : null);
      var lib = br.garfo_fim ? [10] : (br.art_ini ? [4, 5] : []);
      addEl(ID[br.i], ID[br.j], rt, kLocal(rt.L, s.E, s.G, s.b, s.h, lib, M.cortante), { b: br, s: s });
    }
    var nModelo = els.length;
    if (kgPlacas && M.placa !== "casca") {
      for (bi = 0; bi < (M.barrasPlaca || []).length; bi++) {
        var bp = M.barrasPlaca[bi], rp = rotacao(X[bp[0]], X[bp[1]], null);
        addEl(bp[0], bp[1], rp, kLocal(rp.L, bp[2], bp[3], bp[4], bp[4], [], M.cortante), null);
      }
    }
    // N por elemento e hipótese (f6 = k6·u_local − feq6)
    var f6 = [];
    for (h = 0; h < hips.length; h++) {
      var u = R.U[h], fe = C.feq && C.feq[h] ? C.feq[h] : null, v6 = new Float64Array(els.length);
      for (k = 0; k < els.length; k++) {
        var el = els[k], sm = 0, blk, off;
        for (blk = 0; blk < 4; blk++) {
          var no = blk < 2 ? el.i : el.j; off = 6 * no + 3 * (blk % 2);
          for (a = 0; a < 3; a++) ul[3 * blk + a] = el.R[a][0] * u[off] + el.R[a][1] * u[off + 1] + el.R[a][2] * u[off + 2];
        }
        for (c = 0; c < 12; c++) sm += el.k6[c] * ul[c];
        if (fe && el.x && fe[el.x.b.id]) sm -= fe[el.x.b.id][6];
        v6[k] = sm;
      }
      f6.push(v6);
    }

    // K livre (CSR) + operador de solução
    function diagFraca(dof) { var dg = M.rows[dof].get(dof) || 0; return dg < 1e-6 ? 1e-3 : 0; }
    var fat = fatorar(M, M.reg, diagFraca), livres = fat.livres, n = fat.n, idx = new Int32Array(nd).fill(-1);
    for (k = 0; k < n; k++) idx[livres[k]] = k;
    var kptr = new Int32Array(n + 1), kcol = [], kval = [], kdiag = new Float64Array(n);
    for (k = 0; k < n; k++) {
      kptr[k] = kcol.length;
      M.rows[livres[k]].forEach(function (v, col) { var q = idx[col]; if (q >= 0 && v !== 0) { kcol.push(q); kval.push(v); } });
      kdiag[k] = M.reg + diagFraca(livres[k]);
    }
    kptr[n] = kcol.length;
    kcol = new Int32Array(kcol); kval = new Float64Array(kval);
    function Kmul(x) {
      var y = new Float64Array(n), r, t, sm;
      for (r = 0; r < n; r++) { sm = kdiag[r] * x[r]; for (t = kptr[r]; t < kptr[r + 1]; t++) sm += kval[t] * x[kcol[t]]; y[r] = sm; }
      return y;
    }
    var buf = new Float64Array(nd);
    function Kinv(x) {
      var t, uu, y = new Float64Array(n);
      for (t = 0; t < n; t++) buf[livres[t]] = x[t];
      uu = fat.resolver(buf);
      for (t = 0; t < n; t++) y[t] = uu[livres[t]];
      return y;
    }
    // nós dos pilares e pilares
    var nosPil = {}, pilares = {}, ordemPil = [];
    for (k = 0; k < nModelo; k++) {
      var e0 = els[k];
      if (e0.x.b.grupo !== grupoPil) continue;
      nosPil[e0.i] = true; nosPil[e0.j] = true;
      var bd = e0.x.b, nome = bd.desc ? String(bd.desc).split(/\s+/).pop() : (grupoPil + "#" + bd.id);
      if (!pilares[nome]) { pilares[nome] = { nome: nome, grupo: bd.grupo, elems: [], L: 0, s: e0.x.s }; ordemPil.push(nome); }
      pilares[nome].elems.push(k); pilares[nome].L += e0.L;
    }
    function fracPilares(phi) {
      var tot = 0, pil = 0, q, d2, dof;
      for (q = 0; q < M.nn; q++) {
        d2 = 0;
        for (c = 0; c < 3; c++) { dof = idx[6 * q + c]; if (dof >= 0) d2 += phi[dof] * phi[dof]; }
        tot += d2; if (nosPil[q]) pil += d2;
      }
      return tot > 0 ? pil / tot : 0;
    }
    function modoNormal(phi) {
      var mx = 0, q, dof, out = { nos: [], u: [] };
      for (q = 0; q < M.nn; q++) for (c = 0; c < 3; c++) { dof = idx[6 * q + c]; if (dof >= 0 && Math.abs(phi[dof]) > mx) mx = Math.abs(phi[dof]); }
      for (q = 0; q < modelo.nos.length; q++) {
        var tr = [0, 0, 0];
        for (c = 0; c < 3; c++) { dof = idx[6 * q + c]; tr[c] = dof >= 0 && mx > 0 ? phi[dof] / mx : 0; }
        out.nos.push(modelo.nos[q].id); out.u.push(tr);
      }
      return out;
    }
    var incGrupos = {};
    for (k = 0; k < nModelo; k++) [els[k].i, els[k].j].forEach(function (nn) { (incGrupos[nn] = incGrupos[nn] || {})[els[k].x.b.grupo] = true; });
    function modoNos(phi) {
      var q, lst = [], dof, d2, ord;
      for (q = 0; q < modelo.nos.length; q++) {
        d2 = 0;
        for (c = 0; c < 3; c++) { dof = idx[6 * q + c]; if (dof >= 0) d2 += phi[dof] * phi[dof]; }
        lst.push([d2, q]);
      }
      lst.sort(function (a1, b1) { return b1[0] - a1[0]; });
      ord = lst.slice(0, 5).map(function (t) { return { no: modelo.nos[t[1]].id, grupos: Object.keys(incGrupos[t[1]] || {}).sort() }; });
      return ord;
    }
    function I_(s) { return Math.min(s.b * s.h * s.h * s.h / 12, s.h * s.b * s.b * s.b / 12); }

    var saida = [], alphaRefG = Infinity, Nmax = {};
    combs.forEach(function (cb) {
      var tc = Date.now(), P = new Float64Array(els.length), hn, hi;
      for (hn in cb.fatores) {
        hi = hips.indexOf(hn);
        for (k = 0; k < els.length; k++) P[k] += cb.fatores[hn] * f6[hi][k];
      }
      // G = −Kg em COO (índices livres): −P/L·(I − ex·exᵀ) nos blocos de translação [ii +; jj +; ij −; ji −]
      var gr = [], gc = [], gv = [];
      function somaG(da, db, S) {
        var p0, q0, ra, cb2;
        for (p0 = 0; p0 < 3; p0++) {
          ra = idx[da + p0]; if (ra < 0) continue;
          for (q0 = 0; q0 < 3; q0++) {
            cb2 = idx[db + q0]; if (cb2 < 0) continue;
            if (Math.abs(S[p0][q0]) > 1e-12) { gr.push(ra); gc.push(cb2); gv.push(S[p0][q0]); }
          }
        }
      }
      var temComp = false;
      for (k = 0; k < els.length; k++) {
        var el2 = els[k], coef = -P[k] / el2.L, ex = el2.ex, S = [], S2 = [], p1, q1;
        if (coef === 0) continue;
        if (gruposKg && !(el2.x && gruposKg[el2.x.b.grupo])) continue;
        if (coef > 0) temComp = true;
        for (p1 = 0; p1 < 3; p1++) {
          S.push([]); S2.push([]);
          for (q1 = 0; q1 < 3; q1++) { S[p1].push(coef * ((p1 === q1 ? 1 : 0) - ex[p1] * ex[q1])); S2[p1].push(-S[p1][q1]); }
        }
        somaG(6 * el2.i, 6 * el2.i, S); somaG(6 * el2.j, 6 * el2.j, S); somaG(6 * el2.i, 6 * el2.j, S2); somaG(6 * el2.j, 6 * el2.i, S2);
      }
      var G_r = new Int32Array(gr), G_c = new Int32Array(gc), G_v = new Float64Array(gv);
      function Gmul(x) {
        var y = new Float64Array(n), t;
        for (t = 0; t < G_v.length; t++) y[G_r[t]] += G_v[t] * x[G_c[t]];
        return y;
      }
      var res = { nome: cb.nome, fatores: cb.fatores, alphaCr: null, alphaCrPilares: null, alphaRef: null, modo: null, modoNos: null, modoPilares: null,
                  modos: [], convergiu: true, iteracoes: 0, pilares: [] };
      var Npil = {};
      ordemPil.forEach(function (nm) {
        var mxN = 0;
        pilares[nm].elems.forEach(function (ke) { mxN = Math.max(mxN, -P[ke]); });
        Npil[nm] = mxN;
      });
      if (temComp) {
        var L1 = lanczosFlambagem(n, Kmul, Gmul, Kinv, nw, mMax, tol);
        res.convergiu = L1.convergiu; res.iteracoes = L1.m;
        var modos = L1.modos, jj;
        for (jj = 0; jj < modos.length; jj++) {
          var phi = new Float64Array(n), z = L1.Z, qq, mm;
          for (mm = 0; mm < L1.m; mm++) {
            var zz = z[mm][modos[jj].col];
            if (zz !== 0) { var Qm = L1.Q[mm]; for (qq = 0; qq < n; qq++) phi[qq] += zz * Qm[qq]; }
          }
          var fr = fracPilares(phi);
          res.modos.push({ alpha: modos[jj].alpha, fracPilares: fr, residuo: modos[jj].res });
          if (jj === 0) { res.alphaCr = modos[0].alpha; res.modo = modoNormal(phi); res.modoNos = modoNos(phi); }
          if (res.alphaCrPilares === null && fr >= 0.30) { res.alphaCrPilares = modos[jj].alpha; res.modoPilares = modoNormal(phi); }
        }
        res.alphaRef = res.alphaCrPilares !== null ? res.alphaCrPilares : res.alphaCr;
      }
      ordemPil.forEach(function (nm) {
        var pl = pilares[nm], N = Npil[nm], Ee = opcoes.Eef || pl.s.E, I = I_(pl.s);
        var it = { barra: nm, barras: pl.elems.map(function (ke) { return els[ke].x.b.id; }), grupo: pl.grupo, N: N, L: pl.L, I: I, E: Ee, L0: null, beta: null };
        if (res.alphaRef !== null && N > 0) { it.L0 = Math.PI * Math.sqrt(Ee * I / (res.alphaRef * N)); it.beta = it.L0 / pl.L; }
        res.pilares.push(it);
        Nmax[nm] = Math.max(Nmax[nm] || 0, N);
      });
      if (res.alphaRef !== null && res.alphaRef < alphaRefG) alphaRefG = res.alphaRef;
      res.ms = Date.now() - tc;
      saida.push(res);
    });
    var alphaMin = null, crit = null;
    saida.forEach(function (r) { if (r.alphaCr !== null && (alphaMin === null || r.alphaCr < alphaMin)) { alphaMin = r.alphaCr; crit = r.nome; } });
    var betaPor = {};
    ordemPil.forEach(function (nm) {
      var pl = pilares[nm], N = Nmax[nm], Ee = opcoes.Eef || pl.s.E, I = I_(pl.s);
      if (N > Nmin && isFinite(alphaRefG)) {
        var L0 = Math.PI * Math.sqrt(Ee * I / (alphaRefG * N));
        betaPor[nm] = { N: N, L: pl.L, I: I, E: Ee, L0: L0, beta: L0 / pl.L };
      }
    });
    return { combinacoes: saida, alphaCrMin: alphaMin, combinacaoCritica: crit, alphaRefPilares: isFinite(alphaRefG) ? alphaRefG : null,
             betaPorPilar: betaPor, kgPlacas: kgPlacas && M.placa !== "casca", placa: M.placa, gdlLivres: n, avisos: avisos, ms: Date.now() - t0 };
  };

  /* ---------- checagem de mecanismo (checar_mecanismo_V18.py) ---------- */
  MadAnalise.checarMecanismo = function (M) {
    var soltas = partesSoltas(M), k, h;
    // gdl sem rigidez (diag < 1e-6) ganham mola 1e-3, como no Python
    var diagFraca = function (dof) {
      var dg = M.rows[dof].get(dof) || 0;
      return dg < 1e-6 ? 1e-3 : 0;
    };
    var fat = fatorar(M, M.reg, diagFraca), F = [new Float64Array(M.nd), new Float64Array(M.nd), new Float64Array(M.nd)];
    for (k = 0; k < M.nn; k++) { F[0][6 * k + 2] = -1.0; F[1][6 * k] = 1.0; F[2][6 * k + 1] = 1.0; }
    var ruins = {}, flex = [];
    for (h = 0; h < 3; h++) {
      var dn = deslocNos(M, fat.resolver(F[h]));
      for (k = 0; k < M.nn; k++) {
        if (dn[k] > 100.0) ruins[k] = Math.max(ruins[k] || 0, dn[k]);
        else if (dn[k] > 0.5) flex.push(k);
      }
    }
    var nosRuins = Object.keys(ruins).map(function (x) { return [parseInt(x, 10), ruins[x]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    return { partesSoltas: soltas.map(function (c) { return c.map(function (kk) { return idNo(M, kk); }); }),
             nosMecanismo: nosRuins.map(function (r) { return { no: idNo(M, r[0]), desloc: r[1] }; }),
             nosFlexiveis: flex.length, ok: !soltas.length && !nosRuins.length };
  };

  /* ---------- casca isolada (provas do elemento: patch test, Navier, viga-parede) ----------
   * MadAnalise.casca.sistema(nos [[x,y,z]], quads [[a,b,c,d]] (índices), {E, nu, t, drilling})
   *   -> S (malha só de casca, 6 gdl por nó, mesma estrutura de M)
   * MadAnalise.casca.resolver(S, F, prescritos {gdl: valor}) -> {u, R} (R = reações nos gdl prescritos)
   * MadAnalise.casca.esforcos(S, e, u, xi, eta) -> {N, M, Q} do elemento e no ponto (xi, eta) */
  MadAnalise.casca = {
    elemento: quadCasca,
    sistema: function (nos, quads, mat) {
      var nn = nos.length, rows = [], k, e, els = [], arestas = [];
      for (k = 0; k < 6 * nn; k++) rows.push(new Map());
      for (e = 0; e < quads.length; e++) {
        var qn = quads[e], el = quadCasca(qn.map(function (i) { return nos[i]; }), mat.E, mat.nu, mat.t, mat.drilling), dofs = [];
        for (k = 0; k < 4; k++) for (var g = 0; g < 6; g++) dofs.push(6 * qn[k] + g);
        somarK(rows, dofs, el.K);
        els.push({ nos: qn, el: el });
        arestas.push([qn[0], qn[1]], [qn[1], qn[2]], [qn[2], qn[3]]);
      }
      return { modelo: null, nn: nn, nd: 6 * nn, X: nos, rows: rows, arestas: arestas, elementos: els, fixo: new Uint8Array(6 * nn) };
    },
    resolver: function (S, F, presc) {
      var fixo = new Uint8Array(S.nd), up = new Float64Array(S.nd), Fl = new Float64Array(S.nd), d;
      Object.keys(presc || {}).forEach(function (kk) { fixo[+kk] = 1; up[+kk] = presc[kk]; });
      for (d = 0; d < S.nd; d++) Fl[d] = F[d] || 0;
      // F_livre −= K_livre,prescrito · u_prescrito (K simétrica: usa a linha do prescrito)
      for (d = 0; d < S.nd; d++) {
        if (!fixo[d] || up[d] === 0) continue;
        S.rows[d].forEach(function (v, col) { if (!fixo[col]) Fl[col] -= v * up[d]; });
      }
      var S2 = { modelo: null, nn: S.nn, nd: S.nd, X: S.X, rows: S.rows, fixo: fixo };
      var u = fatorar(S2, 0, null).resolver(Fl), R = {};
      for (d = 0; d < S.nd; d++) if (fixo[d]) u[d] = up[d];
      for (d = 0; d < S.nd; d++) {
        if (!fixo[d]) continue;
        var s = -(F[d] || 0);
        S.rows[d].forEach(function (v, col) { s += v * u[col]; });
        R[d] = s;
      }
      return { u: u, R: R };
    },
    esforcos: function (S, e, u, xi, eta) {
      var it = S.elementos[e], ug = new Float64Array(24), k, g;
      for (k = 0; k < 4; k++) for (g = 0; g < 6; g++) ug[6 * k + g] = u[6 * it.nos[k] + g];
      return esforcosCasca(it.el, ug, xi, eta);
    }
  };

  global.MadAnalise = MadAnalise;
  if (typeof module !== "undefined" && module.exports) module.exports = MadAnalise;
})(typeof window !== "undefined" ? window : this);

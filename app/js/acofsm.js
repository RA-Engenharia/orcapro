/* =====================================================================
 * acofsm.js — FLAMBAGEM ELÁSTICA DE PERFIS DE PAREDE FINA PELO MÉTODO DAS
 * FAIXAS FINITAS (motor PURO, ES5, sem DOM, Node-testável).
 *
 * Para que serve: o Método da Resistência Direta da ABNT NBR 14762:2010
 * (Anexo C) pede as forças e os momentos de flambagem elástica LOCAL (Nl,
 * Ml), DISTORCIONAL (Ndist, Mdist) e GLOBAL (Ne, Me) da barra. A norma não
 * dá fórmula para o distorcional: manda fazer "análise de estabilidade
 * elástica" (faixas finitas ou elementos finitos).
 *   Fonte: PIERIN, I.; SILVA, V. P.; LA ROVERE, H. L. Forças normais e
 *   momentos fletores críticos de perfis formados a frio. Revista da
 *   Estrutura de Aço (CBCA), v. 2, n. 1, p. 21-40, abr. 2013, p. 25 ("A ABNT
 *   NBR 14762:2010 não fornece qualquer procedimento prático para o cálculo
 *   da força normal (Ndist) ou momento fletor elástico (Mdist)...").
 *   https://www.cbca-acobrasil.org.br/lib/php/download.php?cfg=1&arq=produtos/arq_20210430191244_rea-v.02.n.01.pdf
 *   (p. 25 da revista = p. 27 do PDF).
 *
 *   AcoFSM.modelo(secao, opcoes)       malha de faixas a partir da linha média
 *                                      (js/acosecao.js) ou de {pontos, t}
 *   AcoFSM.assinatura(secao, opcoes)   CURVA DE ASSINATURA: fator de carga
 *                                      crítico × meio comprimento de onda,
 *                                      mínimos local e distorcional, global
 *                                      no comprimento da barra
 *   AcoFSM.autovalores(modelo, L, n)   os n menores fatores positivos em L
 *   AcoFSM.modo(modelo, L)             o 1º modo (deslocamentos por nó) e a
 *                                      classificação local/distorcional/global
 *
 * O MÉTODO (faixas finitas semi-analítico, apoio simples nas pontas)
 *   Cheung, Y. K. (1976) Finite Strip Method in Structural Analysis; a
 *   formulação é a do CUFSM: SCHAFER, B. W.; ÁDÁNY, S. (2006) Buckling
 *   analysis of cold-formed steel members using CUFSM: conventional and
 *   constrained finite strip methods. 18th Int. Specialty Conf. on
 *   Cold-Formed Steel Structures, Orlando — programa citado como o da
 *   análise elástica do MRD nas notas de aula da UFAL (SANTOS, L. B. PFF –
 *   O Método da Resistência Direta, 2020, slides 6-7,
 *   https://educapes.capes.gov.br/bitstream/capes/572687/2/7%20-%20PFF%20-%20M%c3%89TODO%20DA%20RIGIDEZ%20DIRETA%20-%20NOTAS%20DE%20AULA.pdf).
 *   · Cada faixa (largura b, espessura t) tem 2 linhas nodais com 4 graus de
 *     liberdade: u (no plano, ao longo da faixa), v (longitudinal), w (normal
 *     à faixa) e θ = ∂w/∂x (giro em torno do eixo da barra).
 *   · Longitudinalmente, um meio comprimento de onda L com apoio simples nas
 *     pontas: u, w ∝ sen(πy/L) e v ∝ cos(πy/L) (o termo m = 1 da série do
 *     CUFSM, que é o que gera a curva de assinatura).
 *   · Transversalmente: u, v lineares; w cúbica (Hermite).
 *   · Rigidez de membrana (estado plano de tensão) e de placa (Kirchhoff),
 *     isótropo: E1 = E/(1−ν²), D = E t³/(12(1−ν²)), Dxy = G t³/12.
 *   · Rigidez geométrica: trabalho da tensão longitudinal σ (compressão +,
 *     linear dentro da faixa) sobre (∂u/∂y)² + (∂v/∂y)² + (∂w/∂y)² — os três
 *     termos, como na matriz kg do CUFSM (conferido no pycufsm 0.2.0,
 *     solve/analysis_p.py: calc_gm_mp e calc_gf_mp).
 *   · As integrais na largura são feitas por Gauss-Legendre de 4 pontos
 *     (exata: o integrando é polinômio de grau ≤ 7); as integrais no
 *     comprimento dão o mesmo fator L/2 em K e em Kg e se cancelam.
 *   · Problema de autovalor: (K − λ Kg) φ = 0; λ = fator que multiplica as
 *     tensões de referência. K é positiva definida; Kg pode ser indefinida
 *     (flexão). O MENOR λ POSITIVO sai por BISSEÇÃO com a contagem de Sturm
 *     (lei da inércia de Sylvester): o número de pivôs negativos da
 *     fatoração LDLᵀ de K − σKg é o número de autovalores em (0, σ). A
 *     matriz é em BANDA (a seção aberta é uma corrente de nós), então cada
 *     fatoração custa n·b² — centenas de vezes menos que a decomposição
 *     cheia. O modo sai por iteração inversa com o deslocamento σ ≈ λ.
 *   · CONFERÊNCIA (tools/test-aco-fsm.js): placa apoiada k = 4,000; borda
 *     livre k → 6(1−ν)/π² = 0,4255; Euler e flexo-torção ≤ 0,6 %; curvas de
 *     Ue, Z90, U e cartola = pycufsm (porte do CUFSM) com desvio ~1e-5;
 *     tabelas de PIERIN et al. (2013) a ±3 % com malha grossa como a deles
 *     (com a malha padrão, convergida, o distorcional sai 0,6 a 3,1 % ABAIXO
 *     das tabelas e o local a ±1,5 %). Comprimentos acima de ~150× a maior
 *     dimensão da seção perdem precisão (≈1 % em 320×); a curva padrão vai
 *     até 60×.
 *
 * CURVA DE ASSINATURA E OS MODOS (PIERIN et al. 2013, p. 26-27 da revista):
 *   "a curva ... apresenta dois pontos de mínimos locais. O primeiro está
 *   associado ... à flambagem local (modo local de chapa) e o segundo ... à
 *   flambagem distorcional ... O ramo descendente da curva, que ocorre para
 *   comprimentos maiores, está associado ao modo global".
 *   Aqui o modo de cada mínimo também é CLASSIFICADO pela forma:
 *     local        as linhas de dobra (cantos) quase não se deslocam;
 *     global       a seção se move como corpo rígido;
 *     distorcional os cantos se deslocam e a seção não é corpo rígido.
 *   Quando o mínimo distorcional não é distinto (a curva não tem o 2º vale),
 *   o Ue e o Z90 recebem o fator do 1º modo no meio comprimento de onda
 *   distorcional de Hancock (limite inferior, a favor da segurança) e o
 *   resultado leva um AVISO; o CUFSM restrito (cFSM) é a referência formal
 *   desse caso e NÃO está implementado. Sem mínimo local (perfil espesso),
 *   usa-se o menor fator da curva até o distorcional (também conservador).
 *
 * UNIDADES: mm, N, MPa (N/mm²). Tensão de compressão POSITIVA.
 * CONVENÇÃO DOS MOMENTOS: Mx > 0 comprime as fibras com y > yc (acima do
 * centróide); My > 0 comprime as fibras com x > xc. Com Ixy ≠ 0 (Z), a
 * distribuição é a da flexão oblíqua livre, a não ser que carga.restrito =
 * true (flexão em torno do eixo geométrico x com a barra impedida de girar
 * para o eixo principal — terça presa à telha): σ = Mx·(y − yc)/Ix.
 * Teste: node tools/test-aco-fsm.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var AcoSecao = global.AcoSecao || (typeof require === "function" ? require("./acosecao.js") : null);
  var PI = Math.PI;
  function fin(v) { return typeof v === "number" && isFinite(v); }

  /* Gauss-Legendre 4 pontos em [0, 1] */
  var GX = [0.5 - 0.5 * 0.8611363115940526, 0.5 - 0.5 * 0.3399810435848563, 0.5 + 0.5 * 0.3399810435848563, 0.5 + 0.5 * 0.8611363115940526];
  var GW = [0.5 * 0.3478548451374538, 0.5 * 0.6521451548625461, 0.5 * 0.6521451548625461, 0.5 * 0.3478548451374538];

  function m8() { var m = []; for (var i = 0; i < 8; i++) { m.push([0, 0, 0, 0, 0, 0, 0, 0]); } return m; }
  /* soma c·(a ⊗ b) (produto externo) no bloco dos graus de liberdade locais idx */
  function addProd(M, idx, a, b, c) {
    for (var i = 0; i < idx.length; i++) for (var j = 0; j < idx.length; j++) M[idx[i]][idx[j]] += c * a[i] * b[j];
  }

  /* ---------------------------------------------- matrizes da faixa (local)
   * Ordem local: [u1 v1 u2 v2 w1 θ1 w2 θ2] (a do CUFSM).
   * K(k) = A0 + k·A1 + k²·A2 + k⁴·A4 e Kg(k) = k²·G, k = π/L.
   * s1, s2: tensões de compressão nas linhas nodais (MPa). */
  function faixaLocal(b, t, E, nu, s1, s2) {
    var E1 = E / (1 - nu * nu), Gm = E / (2 * (1 + nu));
    var D = E * t * t * t / (12 * (1 - nu * nu)), Dxy = Gm * t * t * t / 12;
    var A0 = m8(), A1 = m8(), A2 = m8(), A4 = m8(), G = m8();
    var mem = [0, 1, 2, 3], fle = [4, 5, 6, 7];
    for (var q = 0; q < 4; q++) {
      var x = GX[q], dx = GW[q] * b, x2 = x * x, x3 = x2 * x;
      var L1 = 1 - x, L2 = x, d1 = -1 / b, d2 = 1 / b;
      /* membrana: εx = u', εy = −k·v, γ = k·u + v' (amplitudes) */
      var ex = [d1, 0, d2, 0], eyk = [0, -L1, 0, -L2], gk = [L1, 0, L2, 0], g0 = [0, d1, 0, d2];
      addProd(A0, mem, ex, ex, t * E1 * dx); addProd(A0, mem, g0, g0, t * Gm * dx);
      addProd(A1, mem, ex, eyk, t * nu * E1 * dx); addProd(A1, mem, eyk, ex, t * nu * E1 * dx);
      addProd(A1, mem, gk, g0, t * Gm * dx); addProd(A1, mem, g0, gk, t * Gm * dx);
      addProd(A2, mem, eyk, eyk, t * E1 * dx); addProd(A2, mem, gk, gk, t * Gm * dx);
      /* flexão: w = Σ N·q; κx = −w'', κy = k²·w, κxy = 2k·w' */
      var N = [1 - 3 * x2 + 2 * x3, b * (x - 2 * x2 + x3), 3 * x2 - 2 * x3, b * (x3 - x2)];
      var dN = [(-6 * x + 6 * x2) / b, 1 - 4 * x + 3 * x2, (6 * x - 6 * x2) / b, 3 * x2 - 2 * x];
      var ddN = [(-6 + 12 * x) / (b * b), (-4 + 6 * x) / b, (6 - 12 * x) / (b * b), (6 * x - 2) / b];
      var cx = [-ddN[0], -ddN[1], -ddN[2], -ddN[3]], cxy = [2 * dN[0], 2 * dN[1], 2 * dN[2], 2 * dN[3]];
      addProd(A0, fle, cx, cx, D * dx);
      addProd(A2, fle, cx, N, nu * D * dx); addProd(A2, fle, N, cx, nu * D * dx);
      addProd(A2, fle, cxy, cxy, Dxy * dx);
      addProd(A4, fle, N, N, D * dx);
      /* geométrica: σ(x)·t·[(∂u/∂y)² + (∂v/∂y)² + (∂w/∂y)²], fator k² fora */
      var sg = (s1 * L1 + s2 * L2) * t * dx, Ll = [L1, L2];
      addProd(G, [0, 2], Ll, Ll, sg); addProd(G, [1, 3], Ll, Ll, sg);
      addProd(G, fle, N, N, sg);
    }
    return { A0: A0, A1: A1, A2: A2, A4: A4, G: G };
  }

  /* transforma para o global da seção: graus por nó [ux, uy, v, θ];
   * local u = c·ux + s·uy, w = −s·ux + c·uy (normal girada +90° da faixa) */
  function girar(M, c, s) {
    var T = m8();
    T[0][0] = c; T[0][1] = s; T[1][2] = 1; T[2][4] = c; T[2][5] = s; T[3][6] = 1;
    T[4][0] = -s; T[4][1] = c; T[5][3] = 1; T[6][4] = -s; T[6][5] = c; T[7][7] = 1;
    var R = m8(), i, j, k;
    var MT = m8();
    for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) { var a = 0; for (k = 0; k < 8; k++) a += M[i][k] * T[k][j]; MT[i][j] = a; }
    for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) { var b2 = 0; for (k = 0; k < 8; k++) b2 += T[k][i] * MT[k][j]; R[i][j] = b2; }
    return R;
  }

  /* ---------------------------------------------- geometria de entrada */
  /* linha média de CANTOS RETOS (como no INSTAB de PIERIN et al. 2013, p. 28:
   * "Em todos os perfis analisados neste artigo os cantos foram considerados
   * retos") — dimensões externas da NBR 6355, linha média a t/2 da face */
  function linhaRetos(tipo, d) {
    var t = +d.t, bw = +d.bw, bf = +d.bf, D = +(d.D || 0);
    var H = (bw - t) / 2, B = bf - t, Dl = D - t / 2;
    tipo = String(tipo || "").replace(/\s+/g, "");
    if (tipo === "U") return [[B, H], [0, H], [0, -H], [B, -H]];
    if (tipo === "Ue") return [[B, H - Dl], [B, H], [0, H], [0, -H], [B, -H], [B, -H + Dl]];
    if (tipo === "Z90" || tipo === "Z") {
      if (D > t) return [[B, H - Dl], [B, H], [0, H], [0, -H], [-B, -H], [-B, -H + Dl]];
      return [[B, H], [0, H], [0, -H], [-B, -H]];
    }
    if (tipo === "Z45") { var c = Math.cos(PI / 4); return [[B - Dl * c, H - Dl * c], [B, H], [0, H], [0, -H], [-B, -H], [-B + Dl * c, -H + Dl * c]]; }
    if (tipo === "Cr") { var Bh = (bf - t) / 2, Hh = bw - t; return [[-Bh - Dl, 0], [-Bh, 0], [-Bh, Hh], [Bh, Hh], [Bh, 0], [Bh + Dl, 0]]; }
    return null;
  }

  /* propriedades da linha média (A, centróide, I) — as do js/acosecao.js */
  function props(pts, t) {
    if (AcoSecao && AcoSecao.paredeFina) return AcoSecao.paredeFina(pts, t);
    throw new Error("acofsm: js/acosecao.js não carregado");
  }

  /* ---------------------------------------------- malha
   * entrada: seção do js/acosecao.js (linhaMedia, t, tipo, bw, bf, D) ou
   * {pontos: [[x,y],...], t}. opcoes.cantos = "arredondados" (padrão: a
   * linha média com os arcos) ou "retos". Partes retas são subdivididas em
   * faixas de largura ≤ hmax (padrão: maior dimensão/10, mín. 2 por parte). */
  function modelo(secao, opcoes) {
    opcoes = opcoes || {};
    var t = +(secao.t || opcoes.t), pts;
    if (opcoes.cantos === "retos" && secao.tipo) pts = linhaRetos(secao.tipo, secao);
    else pts = secao.pontos || secao.linhaMedia;
    if (!pts || pts.length < 2 || !(t > 0)) return null;
    var P = props(pts, t);
    var dimMax = 0, xs = [], ys = [];
    pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    dimMax = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
    var hmax = fin(opcoes.hmax) ? opcoes.hmax : dimMax / 10;
    var nMin = fin(opcoes.faixasMin) ? opcoes.faixasMin : 2;
    var curto = fin(opcoes.segCurto) ? opcoes.segCurto : 2 * t;   /* segmento de arco (canto dobrado) */
    var nos = [[pts[0][0], pts[0][1]]], arco = [false], i, j;
    for (i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (L < 1e-9) continue;
      var n = L <= curto ? 1 : Math.max(nMin, Math.ceil(L / hmax - 1e-9));
      if (L <= curto) { arco[arco.length - 1] = true; }
      for (j = 1; j <= n; j++) { nos.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); arco.push(L <= curto); }
    }
    /* nós de canto: os dos arcos; nos cantos retos, os vértices com mudança de direção */
    var cantos = [];
    if (opcoes.cantos === "retos" || !arco.some(function (v) { return v; })) {
      var k = 0;
      for (i = 1; i + 1 < pts.length; i++) {
        var u1 = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], u2 = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
        var cr = u1[0] * u2[1] - u1[1] * u2[0], nr = Math.sqrt((u1[0] * u1[0] + u1[1] * u1[1]) * (u2[0] * u2[0] + u2[1] * u2[1]));
        if (nr > 0 && Math.abs(cr) / nr > 0.05) {
          for (k = 0; k < nos.length; k++) if (Math.abs(nos[k][0] - pts[i][0]) < 1e-7 && Math.abs(nos[k][1] - pts[i][1]) < 1e-7) { cantos.push(k); break; }
        }
      }
    } else {
      arco.forEach(function (v, k2) { if (v) cantos.push(k2); });
    }
    var faixas = [];
    for (i = 0; i + 1 < nos.length; i++) faixas.push({ i: i, j: i + 1, t: t });
    return { nos: nos, faixas: faixas, cantos: cantos, extremos: [0, nos.length - 1], t: t, props: P,
             cantosRetos: opcoes.cantos === "retos", pontos: pts };
  }

  /* ---------------------------------------------- tensões de referência
   * carga: {N (compressão +, N), Mx, My (N·mm), restrito} ou {tensao: f(x, y)}.
   * Devolve a tensão de compressão em cada nó (MPa). */
  function tensoesNos(mod, carga) {
    var P = mod.props, out = [];
    if (carga && typeof carga.tensao === "function") { mod.nos.forEach(function (p) { out.push(+carga.tensao(p[0], p[1])); }); return out; }
    var N = +(carga && carga.N || 0), Mx = +(carga && carga.Mx || 0), My = +(carga && carga.My || 0);
    var a, b;
    if (carga && carga.restrito) { a = My / P.Iy; b = Mx / P.Ix; }
    else {
      /* ∫σ·y dA = Mx e ∫σ·x dA = My com σ = a·x + b·y (x, y a partir do centróide) */
      var Dt = P.Ix * P.Iy - P.Ixy * P.Ixy;
      a = (My * P.Ix - Mx * P.Ixy) / Dt; b = (Mx * P.Iy - My * P.Ixy) / Dt;
    }
    mod.nos.forEach(function (p) { out.push(N / P.A + a * (p[0] - P.xc) + b * (p[1] - P.yc)); });
    return out;
  }

  /* ---------------------------------------------- montagem em banda
   * opcoes: E, nu, apoios: [{no, gdl: "ux"|"uy"|"v"|"theta"}] (graus fixos) */
  var GDL = { ux: 0, uy: 1, v: 2, theta: 3 };
  function montar(mod, sig, opcoes) {
    var E = fin(opcoes.E) ? opcoes.E : 200000, nu = fin(opcoes.nu) ? opcoes.nu : 0.3;
    var nn = mod.nos.length, ndof = 4 * nn, mapa = [], fixo = {}, i;
    (opcoes.apoios || []).forEach(function (a) { var g = 4 * a.no + (typeof a.gdl === "number" ? a.gdl : GDL[a.gdl]); fixo[g] = true; });
    var n = 0; for (i = 0; i < ndof; i++) { mapa.push(fixo[i] ? -1 : n); if (!fixo[i]) n++; }
    /* meia largura de banda */
    var bw = 0;
    mod.faixas.forEach(function (f) {
      var gs = []; [f.i, f.j].forEach(function (no) { for (var d = 0; d < 4; d++) { var m = mapa[4 * no + d]; if (m >= 0) gs.push(m); } });
      var mx = Math.max.apply(null, gs), mn = Math.min.apply(null, gs); if (mx - mn > bw) bw = mx - mn;
    });
    var W = bw + 1;
    var B0 = new Float64Array(n * W), B1 = new Float64Array(n * W), B2 = new Float64Array(n * W), B4 = new Float64Array(n * W), BG = new Float64Array(n * W);
    mod.faixas.forEach(function (f) {
      var pi = mod.nos[f.i], pj = mod.nos[f.j], dx = pj[0] - pi[0], dy = pj[1] - pi[1], b = Math.sqrt(dx * dx + dy * dy);
      var c = dx / b, s = dy / b, loc = faixaLocal(b, f.t, E, nu, sig[f.i], sig[f.j]);
      var dofs = [4 * f.i, 4 * f.i + 1, 4 * f.i + 2, 4 * f.i + 3, 4 * f.j, 4 * f.j + 1, 4 * f.j + 2, 4 * f.j + 3];
      [["A0", B0], ["A1", B1], ["A2", B2], ["A4", B4], ["G", BG]].forEach(function (par) {
        var M = girar(loc[par[0]], c, s), B = par[1];
        for (var a = 0; a < 8; a++) {
          var ga = mapa[dofs[a]]; if (ga < 0) continue;
          for (var e = 0; e < 8; e++) { var gb = mapa[dofs[e]]; if (gb < ga) continue; B[ga * W + (gb - ga)] += M[a][e]; }
        }
      });
    });
    return { n: n, W: W, bw: bw, B0: B0, B1: B1, B2: B2, B4: B4, BG: BG, mapa: mapa, nn: nn };
  }

  function rigidez(S, k, out) {
    var k2 = k * k, k4 = k2 * k2, m = S.n * S.W;
    for (var i = 0; i < m; i++) out[i] = S.B0[i] + k * S.B1[i] + k2 * S.B2[i] + k4 * S.B4[i];
    return out;
  }

  /* LDLᵀ em banda (sem pivotamento) de K − σG; devolve o nº de pivôs negativos.
   * F (saída): diagonal D em F[i·W], multiplicadores L(j,i) em F[i·W + (j−i)]. */
  function fatorar(S, K, sigma, F) {
    var n = S.n, W = S.W, bw = S.bw, i, j, k, neg = 0, escala = 0;
    for (i = 0; i < n * W; i++) F[i] = K[i] - sigma * S.BG[i];
    for (i = 0; i < n; i++) escala = Math.max(escala, Math.abs(F[i * W]));
    var tiny = 1e-14 * (escala || 1);
    for (i = 0; i < n; i++) {
      var bi = i * W, di = F[bi];
      if (Math.abs(di) < tiny) di = di < 0 ? -tiny : tiny;
      if (di < 0) neg++;
      var lim = Math.min(n - 1, i + bw);
      for (j = i + 1; j <= lim; j++) {
        var mij = F[bi + (j - i)]; if (mij === 0) continue;
        var l = mij / di, bj = j * W;
        for (k = j; k <= lim; k++) F[bj + (k - j)] -= l * F[bi + (k - i)];
      }
      for (j = i + 1; j <= lim; j++) F[bi + (j - i)] /= di;
      F[bi] = di;
    }
    return neg;
  }
  function resolver(S, F, rhs) {
    var n = S.n, W = S.W, bw = S.bw, x = new Float64Array(rhs), i, j;
    for (i = 0; i < n; i++) { var xi = x[i], lim = Math.min(n - 1, i + bw); for (j = i + 1; j <= lim; j++) x[j] -= F[i * W + (j - i)] * xi; }
    for (i = 0; i < n; i++) x[i] /= F[i * W];
    for (i = n - 1; i >= 0; i--) { var s = x[i], lim2 = Math.min(n - 1, i + bw); for (j = i + 1; j <= lim2; j++) s -= F[i * W + (j - i)] * x[j]; x[i] = s; }
    return x;
  }
  function multBanda(S, B, x) {
    var n = S.n, W = S.W, bw = S.bw, y = new Float64Array(n), i, j;
    for (i = 0; i < n; i++) {
      y[i] += B[i * W] * x[i];
      var lim = Math.min(n - 1, i + bw);
      for (j = i + 1; j <= lim; j++) { var a = B[i * W + (j - i)]; y[i] += a * x[j]; y[j] += a * x[i]; }
    }
    return y;
  }

  /* o k-ésimo menor autovalor POSITIVO Λ de K φ = Λ G φ (bisseção de Sturm) */
  function autovalorK(S, K, F, ordem, chute, tol) {
    tol = tol || 1e-10; ordem = ordem || 1;
    function c(s) { return fatorar(S, K, s, F); }
    var hi = chute > 0 ? chute : 1, lo = 0, it;
    if (c(hi) < ordem) {
      lo = hi;
      for (it = 0; it < 400; it++) { hi *= 2; if (c(hi) >= ordem) break; lo = hi; }
      if (it >= 400) return Infinity;
    } else {
      for (it = 0; it < 400; it++) { var m = hi / 2; if (c(m) < ordem) { lo = m; break; } hi = m; }
      if (it >= 400) return 0;
    }
    for (it = 0; it < 200 && hi - lo > tol * hi; it++) { var mid = 0.5 * (lo + hi); if (c(mid) >= ordem) hi = mid; else lo = mid; }
    return 0.5 * (lo + hi);
  }

  /* ---------------------------------------------- análise num comprimento */
  function preparar(secao, opcoes) {
    opcoes = opcoes || {};
    var mod = secao && secao.faixas && secao.nos ? secao : modelo(secao, opcoes);
    if (!mod) return null;
    var sig = tensoesNos(mod, opcoes.carga || { N: mod.props.A });
    var S = montar(mod, sig, opcoes);
    S.mod = mod; S.sig = sig; S.K = new Float64Array(S.n * S.W); S.F = new Float64Array(S.n * S.W);
    return S;
  }
  /* fator λ dos n primeiros modos em L (λ = Λ/k²) */
  function fatoresEm(S, L, nModos, chute) {
    var k = PI / L, out = [], ch = chute;
    rigidez(S, k, S.K);
    for (var m = 1; m <= (nModos || 1); m++) {
      var Lam = autovalorK(S, S.K, S.F, m, ch ? ch * k * k : 0);
      out.push(Lam / (k * k)); ch = out[out.length - 1];
    }
    return out;
  }
  /* modo associado ao λ (iteração inversa, σ ligeiramente abaixo de Λ) */
  function modoEm(S, L, lam) {
    var k = PI / L, Lam = lam * k * k, n = S.n, i;
    rigidez(S, k, S.K);
    fatorar(S, S.K, Lam * (1 - 1e-7), S.F);
    var x = new Float64Array(n);
    for (i = 0; i < n; i++) x[i] = 1 + 0.37 * Math.sin(1.7 * i + 0.3);
    for (var it = 0; it < 6; it++) {
      var y = resolver(S, S.F, multBanda(S, S.BG, x)), mx = 0;
      for (i = 0; i < n; i++) if (Math.abs(y[i]) > mx) mx = Math.abs(y[i]);
      for (i = 0; i < n; i++) x[i] = y[i] / (mx || 1);
    }
    var Kx = multBanda(S, S.K, x), Gx = multBanda(S, S.BG, x), num = 0, den = 0;
    for (i = 0; i < n; i++) { num += x[i] * Kx[i]; den += x[i] * Gx[i]; }
    var nos = [];
    for (var no = 0; no < S.nn; no++) {
      var d = [];
      for (var g = 0; g < 4; g++) { var m = S.mapa[4 * no + g]; d.push(m >= 0 ? x[m] : 0); }
      nos.push({ ux: d[0], uy: d[1], v: d[2], theta: d[3] });
    }
    return { nos: nos, fatorRayleigh: (num / den) / (k * k) };
  }

  /* classificação pela forma: participação dos cantos e ajuste de corpo rígido */
  function classificar(mod, modo) {
    var d = modo.nos.map(function (q) { return Math.sqrt(q.ux * q.ux + q.uy * q.uy); });
    var dmax = Math.max.apply(null, d) || 1;
    var cantos = mod.cantos, rC = 0;
    cantos.forEach(function (i) { if (d[i] / dmax > rC) rC = d[i] / dmax; });
    var princ = cantos.concat(mod.extremos), xm = 0, ym = 0, um = 0, vm = 0;
    princ.forEach(function (i) { xm += mod.nos[i][0]; ym += mod.nos[i][1]; um += modo.nos[i].ux; vm += modo.nos[i].uy; });
    xm /= princ.length; ym /= princ.length; um /= princ.length; vm /= princ.length;
    var num = 0, den = 0;
    princ.forEach(function (i) { var X = mod.nos[i][0] - xm, Y = mod.nos[i][1] - ym; num += X * modo.nos[i].uy - Y * modo.nos[i].ux; den += X * X + Y * Y; });
    var phi = den > 0 ? num / den : 0, res = 0, tot = 0;
    princ.forEach(function (i) {
      var X = mod.nos[i][0] - xm, Y = mod.nos[i][1] - ym, q = modo.nos[i];
      var fx = um - phi * Y, fy = vm + phi * X;
      res += (q.ux - fx) * (q.ux - fx) + (q.uy - fy) * (q.uy - fy); tot += q.ux * q.ux + q.uy * q.uy;
    });
    var rRB = tot > 0 ? Math.sqrt(res / tot) : 1;
    var tipo = rC < 0.3 ? "local" : (rRB < 0.2 ? "global" : "distorcional");
    return { tipo: tipo, cantos: rC, corpoRigido: rRB };
  }

  /* busca do mínimo (seção áurea em log L) entre La e Lb */
  function minimoEntre(S, La, Lb, chute) {
    var a = Math.log(La), b = Math.log(Lb), g = (Math.sqrt(5) - 1) / 2;
    var c = b - g * (b - a), d = a + g * (b - a);
    var fc = fatoresEm(S, Math.exp(c), 1, chute)[0], fd = fatoresEm(S, Math.exp(d), 1, chute)[0];
    for (var it = 0; it < 40 && (b - a) > 1e-4; it++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = fatoresEm(S, Math.exp(c), 1, fc)[0]; }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = fatoresEm(S, Math.exp(d), 1, fd)[0]; }
    }
    return fc < fd ? { L: Math.exp(c), fator: fc } : { L: Math.exp(d), fator: fd };
  }

  function comprimentosPadrao(mod, opcoes) {
    var P = mod.props;
    var larg = Math.max(P.caixa.xmax - P.caixa.xmin, P.caixa.ymax - P.caixa.ymin);
    var menor = Math.min(P.caixa.xmax - P.caixa.xmin, P.caixa.ymax - P.caixa.ymin);
    var Lmin = fin(opcoes.Lmin) ? opcoes.Lmin : 0.15 * menor, Lmax = fin(opcoes.Lmax) ? opcoes.Lmax : 60 * larg;
    if (fin(opcoes.comprimentoBarra)) Lmax = Math.max(Lmax, opcoes.comprimentoBarra);
    var porDecada = fin(opcoes.pontosPorDecada) ? opcoes.pontosPorDecada : 16, n = Math.ceil(Math.log(Lmax / Lmin) / Math.LN10 * porDecada), out = [];
    for (var i = 0; i <= n; i++) out.push(Lmin * Math.pow(Lmax / Lmin, i / n));
    return out;
  }

  /* resultado de um modo em força/momento/tensão */
  function esforcos(S, lam, opcoes) {
    var c = opcoes.carga || { N: S.mod.props.A }, smax = -Infinity;
    S.sig.forEach(function (s) { if (s > smax) smax = s; });
    var o = { fator: lam, fcr: lam * smax };
    if (fin(c.N) && c.N) o.Ncr = lam * c.N;
    if (fin(c.Mx) && c.Mx) o.Mxcr = lam * c.Mx;
    if (fin(c.My) && c.My) o.Mycr = lam * c.My;
    return o;
  }
  function juntar(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  /* ================================================== CURVA DE ASSINATURA
   * opcoes: E, nu, carga, comprimentos [mm] (ou Lmin/Lmax/pontosPorDecada),
   * comprimentoBarra (mm: devolve o global nesse comprimento), cantos,
   * hmax, apoios, distorcionalIndistinto ("Ld" padrão | "nenhum"). */
  function assinatura(secao, opcoes) {
    opcoes = opcoes || {};
    var S = preparar(secao, opcoes);
    if (!S) return null;
    var mod = S.mod, avisos = [];
    var Ls = (opcoes.comprimentos && opcoes.comprimentos.length) ? opcoes.comprimentos.slice().sort(function (a, b) { return a - b; }) : comprimentosPadrao(mod, opcoes);
    var curva = [], ch = 0, i;
    for (i = 0; i < Ls.length; i++) { var f = fatoresEm(S, Ls[i], 1, ch)[0]; curva.push({ L: Ls[i], fator: f }); if (isFinite(f)) ch = f; }
    /* sem comprimentos dados: estende para baixo se a curva ainda desce para L menores */
    if (!(opcoes.comprimentos && opcoes.comprimentos.length)) {
      for (var ext = 0; ext < 12 && curva.length > 1 && curva[0].fator < curva[1].fator; ext++) {
        var L0 = curva[0].L / 1.25; curva.unshift({ L: L0, fator: fatoresEm(S, L0, 1, curva[0].fator)[0] });
      }
    }
    var minimos = [];
    for (i = 1; i + 1 < curva.length; i++) {
      if (isFinite(curva[i].fator) && curva[i].fator < curva[i - 1].fator && curva[i].fator <= curva[i + 1].fator) {
        var m = minimoEntre(S, curva[i - 1].L, curva[i + 1].L, curva[i].fator);
        var md = modoEm(S, m.L, m.fator), cl = classificar(mod, md);
        minimos.push(juntar({ L: m.L, tipo: cl.tipo, indicadores: { cantos: cl.cantos, corpoRigido: cl.corpoRigido }, modo: md }, esforcos(S, m.fator, opcoes)));
      }
    }
    function menorDo(tipo) { var b = null; minimos.forEach(function (q) { if (q.tipo === tipo && (!b || q.fator < b.fator)) b = q; }); return b; }
    var local = menorDo("local"), dist = menorDo("distorcional");
    /* DISTORCIONAL INDISTINTO (a curva não tem o 2º vale — p. ex. Ue 300x85x25x2,00 à compressão, "‐‐‐‐" na
     * tab. 2 de PIERIN et al. 2013): para Ue e Z90 toma-se o fator do 1º modo no meio comprimento de onda
     * distorcional do modelo de Hancock, Ld = 4,80·(0,5·Ix·bf²·bw/t³)^0,25 (Ix: conjunto mesa + enrijecedor).
     * Como o 1º modo é o MENOR autovalor em Ld, o valor é um limite inferior do distorcional puro (a favor
     * da segurança). Fonte do Ld: NBR 14762:2001, Anexo D (modelo de Hancock), reproduzido em
     * SANTOS, L. B. PFF – Barras submetidas à compressão axial (UFAL, 2020), slide 61,
     * https://educapes.capes.gov.br/bitstream/capes/572684/2/4%20-%20PFF%20-%20COMPRESS%c3%83O%20AXIAL%20-%20NOTAS%20DE%20AULA.pdf
     * e em MILENA, M. TFC (UFPR), p. 50 (p. 53 do PDF), https://estruturas.ufpr.br/wp-content/uploads/2015/08/TFC-MarioMilena.pdf */
    if (!dist && opcoes.distorcionalIndistinto !== "nenhum") {
      var Ld = meiaOndaDistorcional(secao);
      if (Ld) {
        var fL = fatoresEm(S, Ld, 1, 0)[0];
        if (isFinite(fL)) {
          var mdl = modoEm(S, Ld, fL), cl2 = classificar(mod, mdl);
          dist = juntar({ L: Ld, tipo: "distorcional", indistinto: true, modoEmLd: cl2.tipo,
                          indicadores: { cantos: cl2.cantos, corpoRigido: cl2.corpoRigido }, modo: mdl }, esforcos(S, fL, opcoes));
          avisos.push("mínimo distorcional não distinto: fator do 1º modo em Ld = " + Ld.toFixed(0) + " mm (Hancock) — limite inferior, a favor da segurança");
        }
      } else if (temEnrijecedor(secao)) avisos.push("sem mínimo distorcional distinto na curva");
    }
    /* LOCAL NÃO IDENTIFICADO (perfis espessos: "não há ocorrência de um ponto de mínimo correspondente ao modo
     * local de chapa", PIERIN et al. 2013, p. 37 da revista): substituto CONSERVADOR = menor valor da curva até o
     * comprimento do distorcional (ou do 1º mínimo) — o local verdadeiro é maior ou igual a ele. */
    if (!local) {
      var Llim = dist ? dist.L : (minimos.length ? minimos[0].L : curva[curva.length - 1].L), mn = null;
      curva.forEach(function (q) { if (q.L <= Llim * 1.0001 && isFinite(q.fator) && (!mn || q.fator < mn.fator)) mn = q; });
      if (dist && (!mn || dist.fator < mn.fator)) mn = { L: dist.L, fator: dist.fator };
      if (mn) {
        local = juntar({ L: mn.L, tipo: "local", substituto: true }, esforcos(S, mn.fator, opcoes));
        avisos.push("mínimo local não identificado na curva: usado o menor fator até L = " + Llim.toFixed(0) + " mm (a favor da segurança)");
      }
    }
    var glob = null;
    if (fin(opcoes.comprimentoBarra) && opcoes.comprimentoBarra > 0) {
      var fg = fatoresEm(S, opcoes.comprimentoBarra, 1, 0)[0];
      var mg = isFinite(fg) ? modoEm(S, opcoes.comprimentoBarra, fg) : null;
      glob = juntar({ L: opcoes.comprimentoBarra, tipo: mg ? classificar(mod, mg).tipo : null }, esforcos(S, fg, opcoes));
    }
    return { curva: curva, minimos: minimos, local: local, distorcional: dist, global: glob,
             referencia: { carga: opcoes.carga || { N: mod.props.A }, sigmaMax: Math.max.apply(null, S.sig) },
             malha: { nos: mod.nos, faixas: mod.faixas.length, cantos: mod.cantos, gdl: S.n, banda: S.bw },
             props: mod.props, avisos: avisos };
  }
  function temEnrijecedor(sec) {
    return !!(sec && /^(Ue|Z90|Z|Z45|Cr)$/.test(String(sec.tipo || "")) && +(sec.D || 0) > +(sec.t || 0));
  }
  /* meio comprimento de onda distorcional de Hancock (Ue e Z90; enrijecedor a 90°), linha média:
   * b = bf − t, d = D − t/2, h = bw − t; hy = −0,5·d²/(b + d);
   * Ix = b·t³/12 + t·d³/12 + b·t·hy² + d·t·(0,5·d + hy)²; Ld = 4,80·(0,5·Ix·b²·h/t³)^0,25
   * (fontes no comentário da assinatura: UFAL slide 61; UFPR TFC p. 50) */
  function meiaOndaDistorcional(sec) {
    if (!sec || !/^(Ue|Z90|Z)$/.test(String(sec.tipo || "")) || !(+sec.D > +sec.t)) return null;
    var t = +sec.t, b = +sec.bf - t, d = +sec.D - t / 2, h = +sec.bw - t;
    if (!(b > 0 && d > 0 && h > 0)) return null;
    var hy = -0.5 * d * d / (b + d);
    var Ix = b * t * t * t / 12 + t * d * d * d / 12 + b * t * hy * hy + d * t * (0.5 * d + hy) * (0.5 * d + hy);
    return 4.80 * Math.pow(0.5 * Ix * b * b * h / (t * t * t), 0.25);
  }

  function autovalores(secaoOuModelo, L, n, opcoes) {
    var S = preparar(secaoOuModelo, opcoes || {});
    return S ? fatoresEm(S, L, n || 1, 0) : null;
  }
  function modo(secaoOuModelo, L, opcoes) {
    var S = preparar(secaoOuModelo, opcoes || {});
    if (!S) return null;
    var f = fatoresEm(S, L, 1, 0)[0], md = modoEm(S, L, f);
    return juntar({ L: L, classificacao: classificar(S.mod, md), modo: md }, esforcos(S, f, opcoes || {}));
  }

  var AcoFSM = { modelo: modelo, assinatura: assinatura, autovalores: autovalores, modo: modo,
                 tensoesNos: tensoesNos, linhaRetos: linhaRetos, meiaOndaDistorcional: meiaOndaDistorcional,
                 classificar: classificar, _faixaLocal: faixaLocal };
  global.AcoFSM = AcoFSM;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoFSM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

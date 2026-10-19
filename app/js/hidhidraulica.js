/* =====================================================================
 * hidhidraulica.js — FÍSICA PURA do hidrossanitário (motor PURO, ES5,
 * Node-testável). Nada de norma aqui: só mecânica dos fluidos com a
 * referência ao lado de cada fórmula. Os limites de projeto (velocidade
 * máxima, pressões, rugosidade de material, diâmetro interno) chegam pelo
 * HidNormas — este arquivo recebe esses números como ARGUMENTO.
 *
 * Unidades SI em todo lugar: Q em m³/s, D em m, L em m, perda em m de
 * coluna d'água (mca), pressão em kPa, temperatura em °C.
 *
 * ⚠ Os números deste arquivo estão TODOS entre os marcadores
 *   hid:fisica-inicio / hid:fisica-fim, com a fonte. O
 *   tools/test-hid-sem-numero-magico.js aceita número só ali (e 0, 1, 2…
 *   da lista branca). Constante nova = marcador + fonte, ou o teste reprova.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  /* hid:fisica-inicio — constantes e propriedades da água
   * g: aceleração da gravidade padrão, 9,80665 m/s² (3ª CGPM, 1901; BIPM, SI Brochure 9ª ed.).
   * Água líquida a 101,325 kPa: massa específica ρ (kg/m³), viscosidade dinâmica μ (mPa·s) e
   * pressão de vapor pv (kPa) — CRC Handbook of Chemistry and Physics, 97ª ed. (2016), tabelas
   * "Properties of Water in the Range 0–100 °C" e "Vapor Pressure of Water from 0 to 370 °C"
   * (valores da formulação IAPWS-95 / IAPWS 2008 para a viscosidade). Entre linhas: interpolação linear.
   * Atmosfera padrão: ISO 2533:1975 (ICAO), troposfera: p = p0·(1 − 2,25577·10⁻⁵·h)^5,25588, p0 = 101325 Pa.
   * Regimes: laminar até Re 2000 (Hagen-Poiseuille, f = 64/Re); turbulento a partir de Re 4000
   * (Moody, 1944, Trans. ASME 66:671). Entre os dois (zona crítica) o motor usa Colebrook — o maior
   * f dos dois ramos na prática — e avisa. */
  var G = 9.80665;
  var P_ATM_NIVEL_MAR_PA = 101325, ISA_K = 2.25577e-5, ISA_EXP = 5.25588;
  var RE_LAMINAR = 2000, RE_TURBULENTO = 4000;
  /* temperatura padrão da água fria: PREMISSA do motor (vai ao memorial como premissa; a entrada troca) */
  var T_PADRAO_C = 20;
  var AGUA = [ /* T °C, ρ kg/m³, μ mPa·s, pv kPa */
    [0, 999.84, 1.7930, 0.6113], [10, 999.70, 1.3059, 1.2282], [20, 998.21, 1.0016, 2.3393], [25, 997.05, 0.8900, 3.1699],
    [30, 995.65, 0.7972, 4.2470], [40, 992.22, 0.6527, 7.3849], [50, 988.03, 0.5465, 12.352], [60, 983.20, 0.4660, 19.946],
    [70, 977.76, 0.4035, 31.201], [80, 971.79, 0.3540, 47.414], [90, 965.31, 0.3142, 70.182], [100, 958.35, 0.2816, 101.42]
  ];
  var COL = { T: 0, rho: 1, mu: 2, pv: 3 };   /* colunas da tabela AGUA */
  var MPA_S = 1e-3;     /* mPa·s → Pa·s */
  var PA_KPA = 1000;    /* Pa → kPa */
  /* hid:fisica-fim */

  /* propriedades da água a T °C (interpolação linear na tabela CRC) */
  function agua(T) {
    var t = num(T, T_PADRAO_C);
    var a = AGUA[0], b = AGUA[AGUA.length - 1], fora = t < a[0] || t > b[0];
    if (t <= a[0]) b = AGUA[1];
    else if (t >= b[0]) a = AGUA[AGUA.length - 2];
    else for (var i = 1; i < AGUA.length; i++) if (AGUA[i][0] >= t) { a = AGUA[i - 1]; b = AGUA[i]; break; }
    var s = (t - a[0]) / (b[0] - a[0]);
    function li(k) { return a[k] + (b[k] - a[k]) * s; }
    var rho = li(COL.rho), mu = li(COL.mu) * MPA_S;
    return { T: t, rho: rho, mu: mu, nu: mu / rho, pv_kpa: li(COL.pv), foraDaTabela: fora,
             fonte: "CRC Handbook of Chemistry and Physics, 97ª ed. (IAPWS), interpolação linear" };
  }

  var RHO_PADRAO = agua(T_PADRAO_C).rho;

  function area(d) { return Math.PI * d * d / 4; }   // hid:ok área do círculo πD²/4
  function velocidade(Q, d) { return Q / area(d); }
  function reynolds(v, d, nu) { return v * d / nu; }
  function cargaCinetica(v) { return v * v / (2 * G); }
  /* pressão (kPa) ↔ coluna d'água (m) com a massa específica do fluido */
  function kpaParaM(p, rho) { return p * PA_KPA / (num(rho, RHO_PADRAO) * G); }
  function mParaKpa(h, rho) { return h * num(rho, RHO_PADRAO) * G / PA_KPA; }

  /* ------------------------------------------------ FATOR DE ATRITO */
  /* Colebrook-White (1939): 1/√f = −2·log10(ε/(3,7·D) + 2,51/(Re·√f)).
     Ponto fixo em x = 1/√f — converge em poucas iterações porque a derivada
     do lado direito é pequena; para quando a correção relativa < tolerância. */
  function fatorColebrook(Re, rr) {
    /* hid:fisica-inicio — Colebrook, C.F. (1939), J. Inst. Civil Eng. 11(4):133–156 */
    var A = 3.7, B = 2.51, TOL = 1e-12, MAX = 100;
    /* hid:fisica-fim */
    var x = 1 / Math.sqrt(fatorSwameeJain(Re, rr) || 1), k;   /* partida explícita (Swamee-Jain) */
    for (k = 0; k < MAX; k++) {
      var nx = -2 * Math.log(rr / A + B * x / Re) / Math.LN10;
      if (Math.abs(nx - x) <= TOL * Math.abs(nx)) { x = nx; break; }
      x = nx;
    }
    return 1 / (x * x);
  }
  /* Swamee, P.K. & Jain, A.K. (1976), J. Hydraulics Div. ASCE 102(5):657–664:
     f = 0,25 / [log10(ε/(3,7·D) + 5,74/Re^0,9)]² — explícita, aproxima Colebrook */
  function fatorSwameeJain(Re, rr) {
    /* hid:fisica-inicio — Swamee & Jain (1976) */
    var A = 3.7, B = 5.74, EXP = 0.9, C = 0.25;
    /* hid:fisica-fim */
    if (!(Re > 0)) return null;
    var l = Math.log(rr / A + B / Math.pow(Re, EXP)) / Math.LN10;
    return C / (l * l);
  }
  /* o fator usado no cálculo: laminar exato, senão Colebrook (o explícito
     fica só como partida e para conferência) */
  function fatorAtrito(Re, rr) {
    if (!(Re > 0)) return { f: 0, regime: "sem escoamento" };
    /* hid:fisica-inicio — Hagen-Poiseuille: f = 64/Re */
    var LAM = 64;
    /* hid:fisica-fim */
    if (Re <= RE_LAMINAR) return { f: LAM / Re, regime: "laminar" };
    var f = fatorColebrook(Re, rr);
    return { f: f, regime: Re < RE_TURBULENTO ? "crítico" : "turbulento" };
  }

  /* ------------------------------------------------ PERDA DISTRIBUÍDA
   * Todas devolvem { J (m/m), hf (m), v, passos[] } — passos por extenso para o memorial. */
  var CASAS = { v: 3, J: 5, hf: 4, f: 5 };   // hid:ok casas decimais do memorial (apresentação, não cálculo)
  function fmt(v, c) { return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toString().replace(".", ","); }   // hid:ok casas decimais (base 10)

  /* Darcy-Weisbach: hf = f·(L/D)·v²/2g (fórmula universal) */
  function darcy(Q, d, L, eps, nu) {
    var v = velocidade(Q, d), Re = reynolds(v, d, nu), rr = eps / d, fa = fatorAtrito(Re, rr);
    var J = fa.f / d * cargaCinetica(v), hf = J * num(L, 0);
    return { formula: "darcy", J: J, hf: hf, v: v, Re: Re, f: fa.f, regime: fa.regime, rr: rr,
             passos: ["v = Q/A = " + fmt(v, CASAS.v) + " m/s", "Re = v·D/ν = " + Math.round(Re), "ε/D = " + rr.toExponential(2),
                      "f (" + (fa.regime === "laminar" ? "64/Re" : "Colebrook-White") + ") = " + fmt(fa.f, CASAS.f),
                      "J = f/D · v²/2g = " + fmt(J, CASAS.J) + " m/m", "hf = J·L = " + fmt(hf, CASAS.hf) + " m"] };
  }
  /* Hazen-Williams (SI): J = 10,67 · Q^1,852 / (C^1,852 · D^4,87) — Williams & Hazen (1905),
     "Hydraulic Tables"; forma SI como em Mays, Water Resources Engineering. */
  function hazenWilliams(Q, d, L, C) {
    /* hid:fisica-inicio — Hazen-Williams SI */
    var K = 10.67, EQ = 1.852, ED = 4.87;
    /* hid:fisica-fim */
    var J = K * Math.pow(Q, EQ) / (Math.pow(C, EQ) * Math.pow(d, ED)), hf = J * num(L, 0), v = velocidade(Q, d);
    return { formula: "hw", J: J, hf: hf, v: v, C: C, passos: ["v = Q/A = " + fmt(v, CASAS.v) + " m/s", "J = 10,67·Q^1,852/(C^1,852·D^4,87) = " + fmt(J, CASAS.J) + " m/m (C = " + C + ")", "hf = J·L = " + fmt(hf, CASAS.hf) + " m"] };
  }
  /* Fair-Whipple-Hsiao (1952), J. New England Water Works Assoc. 66:
     tubo liso (plástico, cobre): J = 0,0008695 · Q^1,75 / D^4,75;
     aço galvanizado:             J = 0,002021  · Q^1,88 / D^4,88    (SI) */
  function fairWhippleHsiao(Q, d, L, tipo) {
    /* hid:fisica-inicio — Fair, Whipple & Hsiao (1952) */
    var LISO = { k: 0.0008695, eq: 1.75, ed: 4.75 }, GALV = { k: 0.002021, eq: 1.88, ed: 4.88 };
    /* hid:fisica-fim */
    var c = tipo === "aco_galvanizado" ? GALV : LISO;
    var J = c.k * Math.pow(Q, c.eq) / Math.pow(d, c.ed), hf = J * num(L, 0), v = velocidade(Q, d);
    return { formula: "fwh", J: J, hf: hf, v: v, tipo: tipo === "aco_galvanizado" ? tipo : "liso",
             passos: ["v = Q/A = " + fmt(v, CASAS.v) + " m/s", "J = " + c.k + "·Q^" + c.eq + "/D^" + c.ed + " = " + fmt(J, CASAS.J) + " m/m (Fair-Whipple-Hsiao, " + (c === GALV ? "aço galvanizado" : "tubo liso") + ")", "hf = J·L = " + fmt(hf, CASAS.hf) + " m"] };
  }

  /* ------------------------------------------------ PERDA LOCALIZADA */
  function perdaK(K, v) { return K * cargaCinetica(v); }                 /* hf = K·v²/2g */
  function perdaLeq(J, Leq) { return J * Leq; }                          /* comprimento equivalente */

  /* ------------------------------------------------ MANNING (conduto livre circular)
   * Q = (1/n)·A·Rh^(2/3)·S^(1/2), Manning (1891). Seção parcial pelo ângulo
   * central θ: A = D²/8·(θ − sen θ), P = θ·D/2, y/D = (1 − cos(θ/2))/2. */
  function secaoParcial(D, yD) {
    var r = Math.max(0, Math.min(1, num(yD, 1)));
    var th = 2 * Math.acos(1 - 2 * r), A = D * D / 8 * (th - Math.sin(th)), P = th * D / 2;   // hid:ok geometria do segmento circular
    return { theta: th, A: A, P: P, Rh: P > 0 ? A / P : 0 };
  }
  function manning(n, D, S, yD) {
    var s = secaoParcial(D, yD == null ? 1 : yD);
    /* hid:fisica-inicio — expoentes de Manning */
    var E_R = 2 / 3, E_S = 0.5;
    /* hid:fisica-fim */
    var v = s.Rh > 0 ? Math.pow(s.Rh, E_R) * Math.pow(S, E_S) / n : 0;
    return { Q: v * s.A, v: v, A: s.A, Rh: s.Rh, yD: yD == null ? 1 : yD };
  }
  /* lâmina y/D para a vazão Q (bisseção no ramo crescente; o máximo de Q
     fica abaixo de seção cheia — acha-se antes por busca ternária) */
  function laminaParaVazao(Q, n, D, S) {
    var a = 0, b = 1, i;
    /* hid:fisica-inicio — iterações de busca (precisão numérica, não norma) */
    var IT = 100;
    /* hid:fisica-fim */
    for (i = 0; i < IT; i++) { var m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;   // hid:ok busca ternária (terços)
      if (manning(n, D, S, m1).Q < manning(n, D, S, m2).Q) a = m1; else b = m2; }
    var yMax = (a + b) / 2, Qmax = manning(n, D, S, yMax).Q;
    if (Q > Qmax) return { yD: null, Qmax: Qmax, cabe: false };
    a = 0; b = yMax;
    for (i = 0; i < IT; i++) { var m = (a + b) / 2; if (manning(n, D, S, m).Q < Q) a = m; else b = m; }
    return { yD: (a + b) / 2, Qmax: Qmax, cabe: true };
  }

  /* ------------------------------------------------ GOLPE DE ARÍETE
   * hid:fisica-inicio — compressibilidade isotérmica da água a 20 °C: κ = 45,89·10⁻⁶ MPa⁻¹
   * (CRC Handbook, "Properties of Water in the Range 0–100 °C") → K = 1/κ ≈ 2,179 GPa.
   * Celeridade (Korteweg 1878; Wylie & Streeter, "Fluid Transients", eq. 2.3.15, parede fina):
   *   a = √((K/ρ)/(1 + K·D/(E·e))).
   * Joukowsky (1898): Δp = ρ·a·v se o fechamento tc ≤ 2L/a; Michaud (1878): Δp = 2·ρ·L·v/tc se mais lento.
   * (a mesma física do js/hidind.js, que usa K = ρ·w² da IF97 para outras temperaturas) */
  var KAPPA_20C_POR_PA = 45.89e-6 / 1e6;
  /* hid:fisica-fim */
  function moduloAgua() { return 1 / KAPPA_20C_POR_PA; }
  function celeridade(K, rho, D, E, e) { return Math.sqrt((K / rho) / (1 + K * D / (E * e))); }
  /* Δp (Pa) e o regime; v (m/s) é a velocidade que se anula no fechamento */
  function golpe(rho, a, v, L, tc) {
    var rapido = tc <= 2 * L / a;
    return { dp_Pa: rapido ? rho * a * v : 2 * rho * L * v / tc, rapido: rapido, tCritico: 2 * L / a };
  }

  /* ------------------------------------------------ ATMOSFERA (NPSH) */
  function pressaoAtmosferica(altitude) {
    var h = num(altitude, 0);
    return P_ATM_NIVEL_MAR_PA * Math.pow(1 - ISA_K * h, ISA_EXP) / PA_KPA;   /* kPa */
  }

  var HidHidraulica = {
    VERSAO: 1, G: G, T_PADRAO_C: T_PADRAO_C, RE_LAMINAR: RE_LAMINAR, RE_TURBULENTO: RE_TURBULENTO, TABELA_AGUA: AGUA,
    agua: agua, area: area, velocidade: velocidade, reynolds: reynolds, cargaCinetica: cargaCinetica,
    kpaParaM: kpaParaM, mParaKpa: mParaKpa,
    fatorColebrook: fatorColebrook, fatorSwameeJain: fatorSwameeJain, fatorAtrito: fatorAtrito,
    darcy: darcy, hazenWilliams: hazenWilliams, fairWhippleHsiao: fairWhippleHsiao,
    perdaK: perdaK, perdaLeq: perdaLeq,
    secaoParcial: secaoParcial, manning: manning, laminaParaVazao: laminaParaVazao,
    pressaoAtmosferica: pressaoAtmosferica, fmt: fmt, moduloAgua: moduloAgua, celeridade: celeridade, golpe: golpe
  };
  global.HidHidraulica = HidHidraulica;
  if (typeof module !== "undefined" && module.exports) module.exports = HidHidraulica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

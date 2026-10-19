/* =====================================================================
 * hidind.js — FLUIDOS INDUSTRIAIS (fase 5 do docs/hidro/PLANO-HIDROSSANITARIO.md)
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-INDUSTRIAL.md.
 *   HidInd.calcular(entradaIndustrial, ctx?) → resultado (sistema "industrial")
 *
 * O que faz, nesta ordem:
 *   1. FLUIDO (fluido + estado + temperatura + pressão): água líquida (tabela CRC do
 *      HidHidraulica até 100 °C; acima, IAPWS-IF97 região 1), vapor d'água (IF97
 *      regiões 2 e 4 + viscosidade IAPWS 2008), ar (gás ideal + Sutherland), gás
 *      combustível e óleos (tabelas com fonte em dados-fonte/hidro/normas/fluidos.json).
 *   2. REDE RAMIFICADA a partir da origem (BFS): vazão mássica de cada trecho pelos
 *      consumidores a jusante (simultaneidade e fuga declaradas).
 *   3. DIÂMETRO/SÉRIE COMERCIAL do material (tabela do fabricante): a menor que atende a
 *      velocidade recomendada do serviço e, depois, a perda admissível / pressão no ponto
 *      de consumo (laço que aumenta o DN do trecho que mais perde no caminho crítico).
 *      Método da perda (declarado no resultado):
 *        · líquido: Darcy-Weisbach + Colebrook (HidHidraulica.darcy);
 *        · gás: escoamento ISOTÉRMICO compressível de gás ideal, fórmula fechada;
 *        · vapor: trecho dividido em partes, massa específica da IF97 na pressão local.
 *   4. CLASSE DE PRESSÃO: Barlow (tensão circunferencial de parede fina) com a tensão
 *      admissível da tabela (ASME B31.3 Tab. A-1 via fonte), fator de junta, tolerância de
 *      fabricação e sobreespessura de corrosão; cobre e PEAD pela pressão do catálogo.
 *   5. GOLPE DE ARÍETE no fechamento da válvula do consumidor (líquidos): celeridade de
 *      Korteweg com K = ρ·w² (w da IF97 para água; K do fabricante para óleo), Joukowsky
 *      (fechamento rápido) ou Michaud (lento), contra a pressão máxima admissível do tubo.
 *   6. DILATAÇÃO: ΔL = α·L·ΔT; lira pelo balanço guiado (L = √(3·E·D·ΔL/S_A)) com a faixa
 *      admissível da fonte; distância entre pontos fixos da fonte ou do RT — senão pendente.
 *   7. AR COMPRIMIDO: consumo × utilização × simultaneidade × (1 + fuga) × (1 + reserva) e
 *      volume do reservatório pela fórmula da fonte (tabela ind.ar.reservatorio).
 *
 * ⚠ Nenhum valor de norma/tabela aqui (tools/test-hid-sem-numero-magico.js): velocidades,
 *   rugosidades, dimensões de tubo, tensões admissíveis, módulos, coeficientes de dilatação
 *   e critérios vêm do HidNormas. Só FÍSICA com referência fica nos blocos hid:fisica.
 * ⚠ Pendência nunca vira ok (REVISAO-F7 C1): sem o valor com fonte, a verificação sai
 *   "pendente", entra em pendencias com a chave, e ok = false.
 * ⚠ As ops saem em sistemas.industrial.ops (o orquestrador as junta em res.ops só com aplicavel = true,
 *   isto é, quando o patch de docs/hidro/PATCH-BIMINST-INDUSTRIAL.md está no biminst — aplicado em 17/10/2026).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  var CASAS_P = 2, CASAS_V = 3, CASAS_RHO = 4, CASAS_MU = 3;   // hid:ok casas decimais do memorial (apresentação)
  function fx(v, c) { return v == null || !isFinite(v) ? "—" : HH().fmt(v, c == null ? CASAS_P : c); }
  function sci(v) { return v == null || !isFinite(v) ? "—" : v.toExponential(CASAS_MU).replace(".", ","); }

  /* ================================================================ FÍSICA */
  /* hid:fisica-inicio — IAPWS-IF97: "Revised Release on the IAPWS Industrial Formulation 1997 for the
   * Thermodynamic Properties of Water and Steam", IAPWS R7-97(2012), https://iapws.org/technical-guidance/release/IF97-Rev
   *   Eq. (1)-(3) p.5: R = 0,461526 kJ/(kg·K), Tc = 647,096 K, pc = 22,064 MPa.
   *   B23 (Tab. 1, p.6): p = n1 + n2·T + n3·T² (MPa, K).
   *   Região 1 (Eq. 7, Tab. 2 p.7, Tab. 3 p.8): γ = Σ n·(7,1 − π)^I·(τ − 1,222)^J, π = p/16,53 MPa, τ = 1386 K/T.
   *   Região 2 (Eq. 15-17, Tab. 10 p.13, Tab. 11 p.14, Tab. 12 p.15): γ = γ° + γʳ, π = p/1 MPa, τ = 540 K/T;
   *     γ° = ln π + Σ n°·τ^J°; γʳ = Σ n·π^I·(τ − 0,5)^J.
   *   Região 4 (Eq. 29-31, Tab. 34 p.34): pressão e temperatura de saturação.
   *   Validade: 273,15 K ≤ T ≤ 623,15 K (reg. 1, p ≥ ps(T)); reg. 2 até 1073,15 K e p ≤ ps(T)/p_B23(T).
   *   Verificação: Tab. 5 (p.9), Tab. 15 (p.17), Tab. 35 (p.34), Tab. 36 (p.36) — tools/test-hid-ind.js. */
  var IF = {
    R: 0.461526, TC: 647.096, PC: 22.064,
    T_MIN: 273.15, T_R1_MAX: 623.15, T_B23_MAX: 863.15, T_R2_MAX: 1073.15, P_MAX: 100,
    B23: [0.34805185628969e3, -0.11671859879975e1, 0.10192970039326e-2],
    R1: { PS: 16.53, TS: 1386, A: 7.1, B: 1.222,
      I: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 8, 8, 21, 23, 29, 30, 31, 32],
      J: [-2, -1, 0, 1, 2, 3, 4, 5, -9, -7, -1, 0, 1, 3, -3, 0, 1, 3, 17, -4, 0, 6, -5, -2, 10, -8, -11, -6, -29, -31, -38, -39, -40, -41],
      N: [0.14632971213167, -0.84548187169114, -0.37563603672040e1, 0.33855169168385e1, -0.95791963387872, 0.15772038513228,
          -0.16616417199501e-1, 0.81214629983568e-3, 0.28319080123804e-3, -0.60706301565874e-3, -0.18990068218419e-1,
          -0.32529748770505e-1, -0.21841717175414e-1, -0.52838357969930e-4, -0.47184321073267e-3, -0.30001780793026e-3,
          0.47661393906987e-4, -0.44141845330846e-5, -0.72694996297594e-15, -0.31679644845054e-4, -0.28270797985312e-5,
          -0.85205128120103e-9, -0.22425281908000e-5, -0.65171222895601e-6, -0.14341729937924e-12, -0.40516996860117e-6,
          -0.12734301741641e-8, -0.17424871230634e-9, -0.68762131295531e-18, 0.14478307828521e-19, 0.26335781662795e-22,
          -0.11947622640071e-22, 0.18228094581404e-23, -0.93537087292458e-25] },
    R2: { PS: 1, TS: 540, B: 0.5,
      J0: [0, 1, -5, -4, -3, -2, -1, 2, 3],
      N0: [-0.96927686500217e1, 0.10086655968018e2, -0.56087911283020e-2, 0.71452738081455e-1, -0.40710498223928,
           0.14240819171444e1, -0.43839511319450e1, -0.28408632460772, 0.21268463753307e-1],
      I: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 10, 10, 10, 16, 16, 18, 20, 20, 20, 21, 22, 23, 24, 24, 24],
      J: [0, 1, 2, 3, 6, 1, 2, 4, 7, 36, 0, 1, 3, 6, 35, 1, 2, 3, 7, 3, 16, 35, 0, 11, 25, 8, 36, 13, 4, 10, 14, 29, 50, 57, 20, 35, 48, 21, 53, 39, 26, 40, 58],
      N: [-0.17731742473213e-2, -0.17834862292358e-1, -0.45996013696365e-1, -0.57581259083432e-1, -0.50325278727930e-1,
          -0.33032641670203e-4, -0.18948987516315e-3, -0.39392777243355e-2, -0.43797295650573e-1, -0.26674547914087e-4,
          0.20481737692309e-7, 0.43870667284435e-6, -0.32277677238570e-4, -0.15033924542148e-2, -0.40668253562649e-1,
          -0.78847309559367e-9, 0.12790717852285e-7, 0.48225372718507e-6, 0.22922076337661e-5, -0.16714766451061e-10,
          -0.21171472321355e-2, -0.23895741934104e2, -0.59059564324270e-17, -0.12621808899101e-5, -0.38946842435739e-1,
          0.11256211360459e-10, -0.82311340897998e1, 0.19809712802088e-7, 0.10406965210174e-18, -0.10234747095929e-12,
          -0.10018179379511e-8, -0.80882908646985e-10, 0.10693031879409, -0.33662250574171, 0.89185845355421e-24,
          0.30629316876232e-12, -0.42002467698208e-5, -0.59056029685639e-25, 0.37826947613457e-5, -0.12768608934681e-14,
          0.73087610595061e-28, 0.55414715350778e-16, -0.94369707241210e-6] },
    R4: [0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2, 0.12020824702470e5, -0.32325550322333e7,
         0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849, 0.65017534844798e3],
    QUARTA: 4
  };
  /* IAPWS R12-08, "Release on the IAPWS Formulation 2008 for the Viscosity of Ordinary Water Substance",
   * https://iapws.org/technical-guidance/release/viscosity — Eq. (10)-(12), Tab. 1 e Tab. 2 (p.5); referências
   * T* = 647,096 K, ρ* = 322 kg/m³, μ* = 1,00·10⁻⁶ Pa·s (Eq. 1-4). Fator crítico μ̄2 = 1 (o documento, §2.7: só
   * passa de 2 % dentro de 645,91 K < T < 650,77 K e 245,8 < ρ < 405,3 kg/m³ — fora do uso industrial; o motor
   * recusa esse recorte). Verificação: Tab. 4 (p.8), em μPa·s. */
  var VISC = { TR: 647.096, RHOR: 322, MUR: 1e-6, ESC0: 100,
    H0: [1.67752, 2.20462, 0.6366564, -0.241605],
    H1: [ /* [i][j], i = 0..5, j = 0..6 (zeros = "identicamente nulos", nota da Tab. 2) */
      [5.20094e-1, 2.22531e-1, -2.81378e-1, 1.61913e-1, -3.25372e-2, 0, 0],
      [8.50895e-2, 9.99115e-1, -9.06851e-1, 2.57399e-1, 0, 0, 0],
      [-1.08374, 1.88797, -7.72479e-1, 0, 0, 0, 0],
      [-2.89555e-1, 1.26613, -4.89837e-1, 0, 6.98452e-2, 0, -4.35673e-3],
      [0, 0, -2.57040e-1, 0, 0, 8.72102e-3, 0],
      [0, 1.20573e-1, 0, 0, 0, 0, -5.93264e-4]],
    CRIT_T: [645.91, 650.77], CRIT_RHO: [245.8, 405.3] };
  /* Ar seco como gás ideal — U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF, NASA-TM-X-74335, ntrs.nasa.gov):
   *   R* = 8,31432·10³ J/(kmol·K) e M0 = 28,9644 kg/kmol (Tab. 3 e Eq. 1) → R = R* ÷ M0;
   *   viscosidade dinâmica pela lei de Sutherland, Eq. (51): μ = β·T^1,5/(T + S), β = 1,458·10⁻⁶ kg/(s·m·K^½),
   *   S = 110,4 K. Gás ideal (Z = 1): premissa declarada (ar até ~1 MPa, Z ≈ 1). */
  var AR = { RU: 8.31432e3, M: 28.9644, BETA: 1.458e-6, S: 110.4, EXP: 1.5 };
  /* Conversões por DEFINIÇÃO (SI Brochure, BIPM 9ª ed.): 0 °C = 273,15 K; 1 cSt = 10⁻⁶ m²/s; 1 GPa = 10⁹ Pa;
   * 1 MPa = 10⁶ Pa; 1 kgf/cm² = 9,80665 N / 10⁻⁴ m² = 98,0665 kPa (kgf = 1 kg·gn). */
  var K0 = 273.15, CST = 1e-6, GPA = 1e9, MPA_PA = 1e6, KGF_CM2_KPA = 98.0665;
  /* milímetro de coluna d'água CONVENCIONAL = 9,80665 Pa (ρ = 1000 kg/m³ × gn; ISO 80000-4 / NIST SP 811 B.8); 1 mbar = 0,1 kPa */
  var MMCA_PA = 9.80665, MBAR_KPA = 0.1;
  /* caloria internacional (IT) = 4,1868 J (5ª Conf. Int. sobre Propriedades do Vapor, 1956; NIST SP 811 B.8): 1 kW = 3600/4,1868 kcal/h */
  var KJ_KCAL = 4.1868;
  /* Mecânica:
   *  · Darcy-Weisbach / Colebrook: HidHidraulica (com as referências lá).
   *  · Escoamento isotérmico de gás ideal em conduto (Shapiro, "The Dynamics and Thermodynamics of Compressible
   *    Fluid Flow", 1953, cap. 6; Crane TP-410, cap. 1, "isothermal flow"): p1² − p2² = G²·R·T·[f·L/D + 2·ln(p1/p2)],
   *    G = ṁ/A. Resolvido por ponto fixo em p2.
   *  · Vapor: Darcy por partes (N_PARTES por trecho), massa específica da IF97 na pressão média da parte.
   *  · Barlow (tensão circunferencial de casca fina): σ = P·D/(2·t) → t = P·D/(2·S·E) com D externo (lado seguro).
   *  · Joukowsky (1898): Δp = ρ·a·Δv, se o fechamento tc ≤ 2L/a; Michaud (1878): Δp = 2·ρ·L·v/tc, se mais lento.
   *  · Celeridade (Korteweg, 1878; Wylie & Streeter, "Fluid Transients", eq. 2.3.15, tubo de parede fina com
   *    juntas de dilatação, c1 = 1): a = √((K/ρ)/(1 + K·D/(E·e))); K = ρ·w² (w = velocidade do som).
   *  · Dilatação linear ΔL = α·L·ΔT. Lira pelo BALANÇO GUIADO (viga engastada-guiada, M = 6·E·I·δ/L²,
   *    σ = M·(D/2)/I → L = √(3·E·D·δ/σ)) — "guided cantilever" de M. W. Kellogg Co., "Design of Piping Systems", 1956. */
  var N_PARTES = 20, TOL = 1e-10, MAX_IT = 200, COEF_LIRA = 3;
  /* hid:fisica-fim */

  function sumIF(n, f) { var s = 0; for (var i = 0; i < n; i++) s += f(i); return s; }

  /* ---------- IF97 região 4 (saturação) ---------- */
  /* hid:fisica-inicio — IF97 Eq. (30) e (31), p.33-35: índices n1…n10 da Tab. 34 (n[0]…n[9]) */
  function psat(TK) {   /* MPa */
    var n = IF.R4, th = TK + n[8] / (TK - n[9]);
    var A = th * th + n[0] * th + n[1], B = n[2] * th * th + n[3] * th + n[4], C = n[5] * th * th + n[6] * th + n[7];
    return Math.pow(2 * C / (-B + Math.sqrt(B * B - IF.QUARTA * A * C)), IF.QUARTA);
  }
  function tsat(pMPa) {  /* K */
    var n = IF.R4, be = Math.pow(pMPa, 1 / IF.QUARTA);
    var E = be * be + n[2] * be + n[5], F = n[0] * be * be + n[3] * be + n[6], G = n[1] * be * be + n[4] * be + n[7];
    var D = 2 * G / (-F - Math.sqrt(F * F - IF.QUARTA * E * G));
    return (n[9] + D - Math.sqrt((n[9] + D) * (n[9] + D) - IF.QUARTA * (n[8] + n[9] * D))) / 2;
  }
  /* hid:fisica-fim */
  function pB23(TK) { return IF.B23[0] + IF.B23[1] * TK + IF.B23[2] * TK * TK; }

  /* ---------- IF97 região 1 (líquido) ---------- */
  function regiao1(pMPa, TK) {
    var c = IF.R1, pi = pMPa / c.PS, tau = c.TS / TK, a = c.A - pi, b = tau - c.B, n = c.N.length;
    var g = sumIF(n, function (i) { return c.N[i] * Math.pow(a, c.I[i]) * Math.pow(b, c.J[i]); });
    var gp = sumIF(n, function (i) { return -c.N[i] * c.I[i] * Math.pow(a, c.I[i] - 1) * Math.pow(b, c.J[i]); });
    var gpp = sumIF(n, function (i) { return c.N[i] * c.I[i] * (c.I[i] - 1) * Math.pow(a, c.I[i] - 2) * Math.pow(b, c.J[i]); });
    var gt = sumIF(n, function (i) { return c.N[i] * Math.pow(a, c.I[i]) * c.J[i] * Math.pow(b, c.J[i] - 1); });
    var gtt = sumIF(n, function (i) { return c.N[i] * Math.pow(a, c.I[i]) * c.J[i] * (c.J[i] - 1) * Math.pow(b, c.J[i] - 2); });
    var gpt = sumIF(n, function (i) { return -c.N[i] * c.I[i] * Math.pow(a, c.I[i] - 1) * c.J[i] * Math.pow(b, c.J[i] - 1); });
    var RT = IF.R * TK, v = pi * gp * RT / (pMPa * 1000);
    var w2 = RT * 1000 * gp * gp / ((gp - tau * gpt) * (gp - tau * gpt) / (tau * tau * gtt) - gpp);
    return { regiao: 1, v: v, rho: 1 / v, h: tau * gt * RT, u: RT * (tau * gt - pi * gp), s: IF.R * (tau * gt - g),
             cp: -IF.R * tau * tau * gtt, w: Math.sqrt(w2) };
  }
  /* ---------- IF97 região 2 (vapor) ---------- */
  function regiao2(pMPa, TK) {
    var c = IF.R2, pi = pMPa / c.PS, tau = c.TS / TK, b = tau - c.B, n = c.N.length, n0 = c.N0.length;
    var g0 = Math.log(pi) + sumIF(n0, function (i) { return c.N0[i] * Math.pow(tau, c.J0[i]); });
    var g0t = sumIF(n0, function (i) { return c.N0[i] * c.J0[i] * Math.pow(tau, c.J0[i] - 1); });
    var g0tt = sumIF(n0, function (i) { return c.N0[i] * c.J0[i] * (c.J0[i] - 1) * Math.pow(tau, c.J0[i] - 2); });
    var gr = sumIF(n, function (i) { return c.N[i] * Math.pow(pi, c.I[i]) * Math.pow(b, c.J[i]); });
    var grp = sumIF(n, function (i) { return c.N[i] * c.I[i] * Math.pow(pi, c.I[i] - 1) * Math.pow(b, c.J[i]); });
    var grpp = sumIF(n, function (i) { return c.N[i] * c.I[i] * (c.I[i] - 1) * Math.pow(pi, c.I[i] - 2) * Math.pow(b, c.J[i]); });
    var grt = sumIF(n, function (i) { return c.N[i] * Math.pow(pi, c.I[i]) * c.J[i] * Math.pow(b, c.J[i] - 1); });
    var grtt = sumIF(n, function (i) { return c.N[i] * Math.pow(pi, c.I[i]) * c.J[i] * (c.J[i] - 1) * Math.pow(b, c.J[i] - 2); });
    var grpt = sumIF(n, function (i) { return c.N[i] * c.I[i] * Math.pow(pi, c.I[i] - 1) * c.J[i] * Math.pow(b, c.J[i] - 1); });
    var RT = IF.R * TK, v = pi * (1 / pi + grp) * RT / (pMPa * 1000);
    var num2 = 1 + 2 * pi * grp + pi * pi * grp * grp;
    var den = (1 - pi * pi * grpp) + (1 + pi * grp - tau * pi * grpt) * (1 + pi * grp - tau * pi * grpt) / (tau * tau * (g0tt + grtt));
    return { regiao: 2, v: v, rho: 1 / v, h: RT * tau * (g0t + grt), u: RT * (tau * (g0t + grt) - pi * (1 / pi + grp)),
             s: IF.R * (tau * (g0t + grt) - (g0 + gr)), cp: -IF.R * tau * tau * (g0tt + grtt), w: Math.sqrt(RT * 1000 * num2 / den) };
  }
  /* região pelo par (p, T); null + motivo fora das regiões 1 e 2 */
  function regiao(pMPa, TK) {
    if (!(pMPa > 0) || !(TK > 0)) return { regiao: null, motivo: "pressão e temperatura absolutas positivas" };
    if (TK < IF.T_MIN || TK > IF.T_R2_MAX || pMPa > IF.P_MAX) return { regiao: null, motivo: "fora da faixa da IAPWS-IF97 (273,15 a 1073,15 K, até 100 MPa)" };
    if (TK <= IF.T_R1_MAX) return { regiao: pMPa >= psat(TK) ? 1 : 2 };
    if (TK <= IF.T_B23_MAX && pMPa > pB23(TK)) return { regiao: null, motivo: "região 3 da IF97 (perto do ponto crítico) não implementada" };
    return { regiao: 2 };
  }
  function if97(pMPa, TK) {
    var r = regiao(pMPa, TK);
    if (!r.regiao) return { ok: false, motivo: r.motivo };
    var p = r.regiao === 1 ? regiao1(pMPa, TK) : regiao2(pMPa, TK);
    p.ok = true; return p;
  }
  /* viscosidade da água/vapor, IAPWS 2008 sem o fator crítico (Pa·s) */
  function viscosidadeAgua(TK, rho) {
    var Tb = TK / VISC.TR, rb = rho / VISC.RHOR;
    var d0 = sumIF(VISC.H0.length, function (i) { return VISC.H0[i] / Math.pow(Tb, i); });
    var mu0 = VISC.ESC0 * Math.sqrt(Tb) / d0, s = 0;
    for (var i = 0; i < VISC.H1.length; i++) {
      var si = 0;
      for (var j = 0; j < VISC.H1[i].length; j++) si += VISC.H1[i][j] * Math.pow(rb - 1, j);
      s += Math.pow(1 / Tb - 1, i) * si;
    }
    var critico = TK > VISC.CRIT_T[0] && TK < VISC.CRIT_T[1] && rho > VISC.CRIT_RHO[0] && rho < VISC.CRIT_RHO[1];
    return { mu: VISC.MUR * mu0 * Math.exp(rb * s), critico: critico };
  }
  /* ar seco, gás ideal */
  function ar(pAbsKpa, TC) {
    var T = TC + K0, R = AR.RU / AR.M, rho = pAbsKpa * 1000 / (R * T), mu = AR.BETA * Math.pow(T, AR.EXP) / (T + AR.S);
    return { R: R, rho: rho, mu: mu, nu: mu / rho, T_K: T };
  }

  /* ---------- perdas ---------- */
  /* gás ideal isotérmico: devolve p2 (kPa abs) ou null se o trecho não sustenta a vazão */
  /* g(p2) = p1² − p2² − k·[fL/D + 2·ln(p1/p2)], k = G²RT. g(p1) = −k·fL/D < 0 e g cresce quando p2 desce até
     p2² = k (velocidade = √(RT): bloqueio do escoamento isotérmico). Há solução subsônica só se g(√k) ≥ 0;
     ⚠ a outra raiz (abaixo de √k) é o ramo supersônico — sem sentido físico numa rede, por isso a bisseção
     fica no intervalo (√k, p1). */
  function isotermico(p1Kpa, mDot, D, fLD, R, TK) {
    var A = HH().area(D), Gm = mDot / A, p1 = p1Kpa * 1000, k = Gm * Gm * R * TK, lo = Math.sqrt(k), hi = p1, i;
    if (!(mDot > 0)) return p1Kpa;
    function g(p2) { return p1 * p1 - p2 * p2 - k * (fLD + 2 * Math.log(p1 / p2)); }
    if (!(lo < p1) || g(lo) < 0) return null;
    for (i = 0; i < MAX_IT; i++) {
      var m = (lo + hi) / 2;
      if (g(m) > 0) lo = m; else hi = m;
      if (hi - lo <= TOL * p1) break;
    }
    return (lo + hi) / 2 / 1000;
  }

  /* NBR 15526 Anexo B (coeficientes P vêm da tabela gas.15526.formulas/limites): perda do trecho (kPa)
     a = { gas: "gn"|"glp", pMan (kPa man.), pAbs (kPa abs), S, L (m, com Leq), Q (m³/h a 20 °C/1 atm), D (mm) } */
  function perda15526(P, a) {
    if (a.pMan > P.lim) { var q2 = a.pAbs * a.pAbs - P.b11c * a.S * a.L * Math.pow(a.Q, P.b11q) / Math.pow(a.D, P.b11d); return { formula: "B.1.1", dp: q2 > 0 ? a.pAbs - Math.sqrt(q2) : null }; }
    if (a.gas === "gn") return { formula: "B.1.2 a (GN)", dp: Math.pow(Math.pow(a.Q, P.gq) / P.gc, 1 / P.gr) * Math.pow(a.S, P.gs) * a.L / Math.pow(a.D, P.gd) };
    return { formula: "B.1.2 b (GLP)", dp: P.lc * a.S * a.L * Math.pow(a.Q, P.lq) / Math.pow(a.D, P.ld) };
  }
  /* Anexo E: F (%) pela potência C (kcal/h); linhas da tabela gas.15526.simultaneidade */
  function simult15526(C, linhas) {
    var l = arr(linhas).filter(function (x) { return (x.c_de == null || C >= x.c_de) && (x.c_ate == null || C < x.c_ate); })[0];
    if (!l) return null;
    return l.f_constante != null ? l.f_constante : 100 / (1 + l.k * Math.pow(C / l.divisor - l.c0, l.expoente));
  }

  /* ================================================================ MOTOR */
  var SIS = "industrial";
  var K = {
    vel: "ind.velocidade.recomendada", perda: "ind.perda.admissivel", rug: "ind.material.rugosidade",
    E: "ind.material.elasticidade", alfa: "ind.material.dilatacao", S: "ind.material.tensao_admissivel",
    fat: "ind.tubo.b31_3_fatores", fixos: "ind.dilatacao.pontos_fixos", ft: "ind.dilatacao.fator_ft", g15: "gas.15526.", gnVisc: "ind.gas.viscosidade_metano", glpVisc: "ind.gas.viscosidade_propano", oleo: "ind.oleo.propriedades",
    oleoK: "ind.oleo.compressibilidade", gas: "ind.gas.propriedades", ar: "ind.ar.criterios", res: "ind.ar.reservatorio",
    tubo: "ind.tubo."
  };
  /* material da rede → tabela de tubos e linha de tensão admissível (especificação padrão: premissa) */
  var MATERIAIS = {
    aco_carbono: { tabela: "aco_carbono", nome: "Aço carbono (ASME B36.10M)", barlow: true, espec: "A106 Gr B" },
    inox:        { tabela: "inox", nome: "Aço inoxidável (ASME B36.19M)", barlow: true, espec: "A312 TP304" },
    cobre:       { tabela: "cobre", nome: "Cobre (NBR 13206)", barlow: false },
    pead:        { tabela: "pead_pe100", nome: "PEAD PE 100", barlow: false }
  };
  var LIQ = { agua: 1, oleo: 1 }, GAS = { ar: 1, gn: 1, glp: 1, gas_ideal: 1 };

  function calcular(ent, ctx0) {
    ent = ent || {};
    var N = NR(), H = HH();
    var base = ctx0 || N.contexto();
    var minhas = [];
    function reg(chave, motivo, uso) {
      var p = minhas.filter(function (x) { return x.chave === chave; })[0];
      if (!p) { p = { chave: chave, motivo: motivo, usadoEm: [] }; minhas.push(p); }
      if (uso && p.usadoEm.indexOf(uso) < 0) p.usadoEm.push(uso);
    }
    var ctx = {
      fixture: base.fixture,
      consulta: function (c, f, col, uso) { var r = base.consulta(c, f, col, uso); if (!r.ok) reg(r.ref || c, r.motivo, uso); return r; },
      linhas: function (c, f, uso) { var r = base.linhas(c, f, uso); if (!r) reg(c, "tabela " + c + " indisponível", uso); return r; },
      pendencia: function (c, m, uso) { base.pendencia(c, m, uso); reg(c, m, uso); }
    };
    var out = { versao: 1, sistema: SIS, status: "pendente", ok: false, fixture: !!base.fixture,
                fluido: null, metodo: null, servico: ent.servico || null, material: ent.material || null,
                trechos: [], consumidores: [], arComprimido: null, golpe: [], dilatacao: [],
                premissas: [], verificacoes: [], avisos: [], problemas: [], pendencias: [], normas: [],
                ops: [], opsDesfazer: [], aplicavel: !!(dep("BimInst", "./biminst.js") && dep("BimInst", "./biminst.js").SISTEMAS && dep("BimInst", "./biminst.js").SISTEMAS.industrial), patch: "docs/hidro/PATCH-BIMINST-INDUSTRIAL.md", resumo: null };

    function fonteDe(chave, detalhe, linha) {
      var f = N.fonte(chave); if (!f) return null;
      var o = { chave: f.chave, norma: f.norma, edicao: f.edicao, doc: f.doc, url: f.url, pagina: f.pagina, tabela: (f.tabela || "") + (detalhe ? " — " + detalhe : ""), tipo: f.tipo };
      if (linha && linha.fonte && typeof linha.fonte === "object") Object.keys(linha.fonte).forEach(function (k) { if (linha.fonte[k] != null && linha.fonte[k] !== "") o[k] = linha.fonte[k]; });
      return o;
    }
    var FISICA = {
      if97: { doc: "IAPWS R7-97(2012) — IAPWS-IF97", url: "https://iapws.org/technical-guidance/release/IF97-Rev", tipo: "primaria" },
      visc: { doc: "IAPWS R12-08 — viscosidade da água (2008)", url: "https://iapws.org/technical-guidance/release/viscosity", tipo: "primaria" },
      crc: { doc: "CRC Handbook of Chemistry and Physics, 97ª ed. (via HidHidraulica)", tipo: "primaria" },
      ar: { doc: "U.S. Standard Atmosphere 1976 (gás ideal + Sutherland)", tipo: "primaria" },
      mec: { doc: "mecânica dos fluidos/resistência dos materiais (fórmula física, referência no código)", tipo: "primaria" }
    };
    function premissa(item, valor, origem, fonte) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: origem || "padrao_motor", fonte: fonte || null }); }
    function verif(alvo, nome, valor, limite, unidade, ok, passos, fonte, sentido) {
      var eta = null;
      if (ok !== null && valor != null && limite != null && isFinite(valor) && isFinite(limite)) eta = sentido === "min" ? (valor > 0 ? limite / valor : null) : (limite > 0 ? valor / limite : null);
      var v = { id: "ind-v" + out.verificacoes.length, sistema: SIS, alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade || "", eta: eta,
                ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos || [], fonte: fonte || null };
      out.verificacoes.push(v); return v;
    }
    function aviso(grav, texto, elementos, corrigir) {
      var c = corrigir || { texto: "revisar com o RT" };
      out.avisos.push({ id: "ind-" + out.avisos.length, sistema: SIS, gravidade: grav, texto: texto, elementos: elementos || [], corrigir: c });
      out.problemas.push({ texto: texto, elementos: elementos || [], acao: c });
    }
    /* tabela OPCIONAL: ausente não vira pendência (há outra via, ex. valor do RT); presente entra em normas[] */
    function opcional(chave, filtro, col) { var c = N.consulta(chave, filtro, col); if (c.ok) base.consulta(chave, filtro, col); return c; }
    function tab(chave, filtro, uso) { var ls = ctx.linhas(chave, null, uso); if (!ls) return null; return filtro ? ls.filter(function (l) { return Object.keys(filtro).every(function (k) { return String(l[k]) === String(filtro[k]); }); }) : ls; }

    /* ------------------------------------------------------------ 1. FLUIDO */
    var F = ent.fluido || {}, tipo = String(F.tipo || "").toLowerCase();
    var R = ent.rede || {}, nos = R.nos || {};
    var G15 = tipo === "gn" || tipo === "glp";   /* gás combustível: NBR 15526 (residencial, até 150 kPa) */
    var altitude = num(ent.altitude_m, null);
    if (altitude == null) { altitude = 0; premissa("altitude do local", "0 m (nível do mar) — não informada", "padrao_motor"); }
    function cota(n) { var o = nos[n] || {}; return num(o.cota, num(o.y, 0)); }
    /* pressão MANOMÉTRICA = absoluta − atmosfera NA COTA DO NÓ (ISO 2533): é o que dá o ganho de pressão do gás leve
       que sobe (a NBR 15526 via SIGA p.130 cita 0,05 mbar/m para GN — a física (ρ_ar − ρ_gás)·g·Δz dá o mesmo) */
    function pAtmNo(n) { return H.pressaoAtmosferica(altitude + cota(n)); }
    var pAtm0 = pAtmNo(R.origem);   /* na origem (entrada do compressor, saída da caldeira, regulador) */
    var TC = num(F.temperatura_C, null), pOrig = num(F.pressao_kPa, null);   /* manométrica na origem */
    var ambiente_C = num(ent.temperaturaAmbiente_C, TC);
    var estado = null;
    if (!tipo) ctx.pendencia("entrada.industrial.fluido.tipo", "fluido não informado (agua, vapor, ar, oleo, gn, glp, gas_ideal)", "fluido");
    if (TC == null && (tipo !== "vapor" || F.estado === "superaquecido")) ctx.pendencia("entrada.industrial.fluido.temperatura_C", "temperatura de operação não informada", "fluido");
    if (pOrig == null) ctx.pendencia("entrada.industrial.fluido.pressao_kPa", "pressão (manométrica) na origem não informada", "fluido");
    if (LIQ[tipo]) estado = "liquido"; else if (GAS[tipo]) estado = "gas"; else if (tipo === "vapor") estado = "vapor";
    out.metodo = estado === "liquido" ? "Darcy-Weisbach + Colebrook-White (líquido incompressível, ρ e μ na temperatura de operação)"
               : G15 ? "ABNT NBR 15526:2012 Anexo B (B.1.2 até 7,5 kPa; B.1.1 acima; vertical ΔP = c·H·(S − 1)), conferida por Darcy-Weisbach isotérmico (vale a maior se a norma ficar abaixo da tolerância do RT)"
               : estado === "gas" ? "escoamento isotérmico compressível de gás ideal (p1² − p2² = G²RT[fL/D + 2·ln(p1/p2)]; Shapiro 1953 / Crane TP-410)"
               : estado === "vapor" ? "Darcy-Weisbach por partes (" + N_PARTES + " por trecho) com ρ e μ do vapor pela IAPWS-IF97/IAPWS 2008 na pressão local" : null;

    /* propriedades na pressão absoluta pAbs (kPa) — devolve null + pendência quando falta dado */
    var gasDef = null, oleoK = null;
    function props(pAbs, uso) {
      if (estado === "liquido" && tipo === "agua") {
        if (TC == null) return null;
        var TK = TC + K0, sat = psat(TK) * 1000;
        if (pAbs != null && pAbs < sat) { ctx.pendencia("fluido.agua.saturacao", "água a " + fx(TC) + " °C vaporiza abaixo de " + fx(sat) + " kPa abs (IF97 reg. 4): a pressão do trecho cai abaixo disso — risco de flash/cavitação", uso); }
        var r1 = if97(Math.max(pAbs || 0, sat) / 1000, TK), a = H.agua(TC), crc = !a.foraDaTabela;
        if (!r1.ok) { ctx.pendencia("fluido.agua", r1.motivo, uso); return null; }
        var rho = crc ? a.rho : r1.rho, mu = crc ? a.mu : viscosidadeAgua(TK, r1.rho).mu;
        return { rho: rho, mu: mu, nu: mu / rho, pv_kpa: sat, w: r1.w, K: rho * r1.w * r1.w, T_K: TK,
                 fonte: crc ? FISICA.crc : FISICA.if97, origem: crc ? "CRC (HidHidraulica.agua)" : "IAPWS-IF97 reg. 1 + IAPWS 2008" };
      }
      if (estado === "liquido" && tipo === "oleo") {
        if (!F.nome) { ctx.pendencia("entrada.industrial.fluido.nome", "óleo sem o nome da linha da tabela " + K.oleo + " (ficha do fabricante)", uso); return null; }
        var ls = tab(K.oleo, { fluido: F.nome }, uso); if (!ls) return null;
        ls = ls.filter(function (l) { return num(l.T_C, null) != null && num(l.rho_kg_m3, null) != null && num(l.nu_cSt, null) != null; }).sort(function (x, y) { return x.T_C - y.T_C; });
        var lo = null, hi = null;
        ls.forEach(function (l) { if (l.T_C <= TC) lo = l; if (hi == null && l.T_C >= TC) hi = l; });
        if (!lo || !hi) { ctx.pendencia(K.oleo + "[" + F.nome + "]", "temperatura " + fx(TC) + " °C fora da faixa da ficha de " + F.nome + " (sem extrapolação)", uso); return null; }
        var s = hi.T_C === lo.T_C ? 0 : (TC - lo.T_C) / (hi.T_C - lo.T_C);
        var rhoO = lo.rho_kg_m3 + (hi.rho_kg_m3 - lo.rho_kg_m3) * s;
        /* viscosidade: interpolação LOG-linear entre as linhas da ficha (premissa declarada; nunca extrapola) */
        var nuO = Math.exp(Math.log(lo.nu_cSt) + (Math.log(hi.nu_cSt) - Math.log(lo.nu_cSt)) * s) * CST;
        premissa("viscosidade do óleo entre linhas da ficha", "interpolação log-linear em T entre " + lo.T_C + " e " + hi.T_C + " °C", "padrao_motor");
        var kk = oleoK === null ? (oleoK = (function () { var c = opcional(K.oleoK, { fluido: F.nome }, "K_GPa"); return c.ok ? c : false; })()) : oleoK;
        return { rho: rhoO, mu: nuO * rhoO, nu: nuO, pv_kpa: num(lo.pv_kPa, null), K: kk ? kk.valor * GPA : null, w: kk ? Math.sqrt(kk.valor * GPA / rhoO) : null,
                 T_K: TC + K0, fonte: fonteDe(K.oleo, F.nome, lo), origem: "ficha do fabricante (" + K.oleo + ")" };
      }
      if (estado === "vapor") {
        if (pAbs == null) return null;
        if (F.estado === "superaquecido" && TC == null) return null;
        var pM = pAbs / 1000, ts = tsat(pM), Tv = F.estado === "superaquecido" ? TC + K0 : ts;
        /* ⚠ acima de 623,15 K a linha de saturação está na REGIÃO 3 da IF97 (não implementada): forçar a região 2 ali dava
           ~1 % de erro calado (REVISAO-IND-SOLAR-FINAIS B1) */
        if (!(pM <= IF.R1.PS) || ts > IF.T_R1_MAX) { ctx.pendencia("fluido.vapor.regiao3", "vapor a " + fx(pAbs) + " kPa abs: saturação na região 3 da IF97 (acima de 16,53 MPa), não implementada", uso); return null; }
        if (F.estado === "superaquecido" && !(Tv > ts)) { ctx.pendencia("fluido.vapor.superaquecimento", "vapor superaquecido a " + fx(TC) + " °C abaixo da saturação (" + fx(ts - K0) + " °C) em " + fx(pAbs) + " kPa abs", uso); return null; }
        var r2 = if97(pM, Tv);
        if (!r2.ok || r2.regiao !== 2) {
          /* ⚠ na saturação exata a região 1 pode ganhar pelo arredondamento: o vapor saturado seco é o limite da região 2 */
          r2 = Tv <= ts + TOL ? regiao2(pM, Tv) : null;
          if (!r2) { ctx.pendencia("fluido.vapor", "estado fora das regiões 1/2 da IF97 a " + fx(pAbs) + " kPa abs", uso); return null; }
        }
        var vv = viscosidadeAgua(Tv, r2.rho);
        if (vv.critico) { ctx.pendencia("fluido.vapor.viscosidade_critica", "estado no recorte crítico da IAPWS 2008 (§2.7): o fator μ̄2 não é desprezível e não está implementado", uso); return null; }
        return { rho: r2.rho, mu: vv.mu, nu: vv.mu / r2.rho, T_K: Tv, Tsat_C: ts - K0, h: r2.h, w: r2.w, fonte: FISICA.if97, origem: "IAPWS-IF97 reg. 2/4 + IAPWS 2008" };
      }
      if (estado === "gas") {
        if (TC == null || pAbs == null) return null;
        if (tipo === "ar") { var a2 = ar(pAbs, TC); return { rho: a2.rho, mu: a2.mu, nu: a2.nu, R: a2.R, T_K: a2.T_K, fonte: FISICA.ar, origem: "ar seco — gás ideal + Sutherland" }; }
        if (!gasDef) gasDef = definirGas(uso);
        if (!gasDef.ok) return null;
        var rhoG = pAbs * 1000 / (gasDef.R * (TC + K0));
        return { rho: rhoG, mu: gasDef.mu, nu: gasDef.mu != null ? gasDef.mu / rhoG : null, S: gasDef.S, R: gasDef.R, T_K: TC + K0, fonte: gasDef.fonte, origem: gasDef.origem };
      }
      return null;
    }
    /* gás combustível ou genérico: massa molar e viscosidade com fonte (tabela) ou da entrada com a fonte */
    function definirGas(uso) {
      var M = num(F.massaMolar_kg_kmol, null), mu = num(F.viscosidade_Pa_s, null), fonte = F.fonte ? { doc: String(F.fonte), tipo: "secundaria" } : null, origem = "entrada (RT)";
      if (G15) {
        /* S e PCI: 6.3 da NBR 15526 (padrão) ou os da distribuidora COM a fonte */
        var lp = (tab(K.g15 + "parametros", { gas: tipo }, uso) || [])[0], Sx = num(F.densidadeRelativa, null), pci = num(F.pci_kcal_m3, null);
        if (Sx != null && F.fonte) premissa("densidade relativa do " + tipo, Sx + " (distribuidora: " + F.fonte + ")", "entrada"); else Sx = lp ? num(lp.densidade_relativa, null) : null;
        if (pci != null && F.fonte) premissa("PCI do " + tipo, pci + " kcal/m³ (distribuidora: " + F.fonte + ")", "entrada"); else pci = lp ? num(lp.pci_kcal_m3, null) : null;
        if (Sx == null) { ctx.pendencia(K.g15 + "parametros[" + tipo + "]", "densidade relativa do gás sem fonte", uso); return { ok: false }; }
        M = Sx * AR.M; fonte = fonteDe(K.g15 + "parametros", "6.3", lp); origem = K.g15 + "parametros (M = S·M_ar)";
        /* viscosidade (só para a CONFERÊNCIA por Darcy): metano p/ GN, propano p/ GLP (NIST) — premissa */
        var kv = tipo === "gn" ? K.gnVisc : K.glpVisc;
        if (mu == null && TC != null) {
          var lv = (N.linhas(kv) || []).slice().sort(function (a, b) { return a.T_C - b.T_C; });
          for (var iv = 1; iv < lv.length; iv++) if (lv[iv - 1].T_C <= TC && lv[iv].T_C >= TC) {
            mu = (lv[iv - 1].mu_uPa_s + (lv[iv].mu_uPa_s - lv[iv - 1].mu_uPa_s) * (TC - lv[iv - 1].T_C) / (lv[iv].T_C - lv[iv - 1].T_C)) * CST;   /* μPa·s → Pa·s (10⁻⁶) */
            base.consulta(kv, null, "T_C");
            premissa("viscosidade do " + tipo + " (conferência por Darcy)", "a do " + (tipo === "gn" ? "metano" : "propano") + " a " + fx(TC) + " °C (NIST WebBook): " + sci(mu) + " Pa·s", "norma", fonteDe(kv, "NIST"));
            break; }
        }
        return { ok: true, R: AR.RU / M, M: M, S: Sx, pci: pci, mu: mu, fonte: fonte, origem: origem };
      }
      if (M == null) { ctx.pendencia(K.gas + "[" + tipo + "].massa_molar", "massa molar/densidade relativa do gás sem fonte", uso); return { ok: false }; }
      if (mu == null) { ctx.pendencia(K.gas + "[" + tipo + "].viscosidade", "viscosidade dinâmica do gás sem fonte (Reynolds e fator de atrito dependem dela)", uso); return { ok: false }; }
      if (!F.fonte) { ctx.pendencia("entrada.industrial.fluido.fonte", "massa molar/viscosidade informadas sem a fonte", uso); return { ok: false }; }
      return { ok: true, R: AR.RU / M, M: M, mu: mu, fonte: fonte, origem: origem };
    }

    var pAbsOrig = pOrig != null ? pOrig + pAtm0 : null;
    var P0 = estado ? props(pAbsOrig, "fluido na origem") : null;
    if (estado === "vapor" && F.estado !== "superaquecido") premissa("vapor saturado SECO (título 1) em toda a rede", "condensado retirado pelos purgadores; perda de calor não reduz o título na conta", "padrao_motor");
    if (estado === "gas") premissa("gás ideal (Z = 1)" + (tipo === "gn" ? "" : " e escoamento isotérmico"), "temperatura do gás = " + fx(TC) + " °C em toda a rede; desnível pela coluna de gás ρ·g·Δz com a atmosfera na cota de cada nó", "padrao_motor", FISICA.mec);
    if (estado === "vapor") premissa("temperatura do vapor no trecho", F.estado === "superaquecido" ? "constante = " + fx(TC) + " °C (sem perda de calor)" : "a de saturação na pressão local", "padrao_motor", FISICA.if97);
    out.fluido = { tipo: tipo, nome: F.nome || null, estado: estado, estadoVapor: estado === "vapor" ? (F.estado || "saturado") : null, temperatura_C: estado === "vapor" && P0 ? P0.T_K - K0 : TC,
                   pressao_kPa: pOrig, pressaoAbs_kPa: pAbsOrig, pAtm_kPa: pAtm0,
                   rho: P0 ? P0.rho : null, mu: P0 ? P0.mu : null, nu: P0 ? P0.nu : null, w: P0 ? P0.w || null : null,
                   fonte: P0 ? P0.fonte : null, origem: P0 ? P0.origem : null,
                   passos: P0 ? ["p abs = " + fx(pOrig) + " + " + fx(pAtm0) + " (atmosfera ISO 2533 a " + fx(altitude + cota(R.origem)) + " m) = " + fx(pAbsOrig) + " kPa",
                                 "ρ = " + fx(P0.rho, CASAS_RHO) + " kg/m³; μ = " + sci(P0.mu) + " Pa·s (" + P0.origem + ")"] : [] };

    /* ------------------------------------------------------------ 2. REDE */
    var trechosE = arr(R.trechos), cons = arr(R.consumidores);
    var mat = MATERIAIS[ent.material];
    if (ent.material === "cobre" && (tipo === "refrigerante" || /frigor|refriger/i.test(String(ent.servico || "")))) {
      ctx.pendencia("tubo.7541", "linha frigorígena em cobre segue a NBR 7541 (tubo de refrigeração), não a NBR 13206 — fora da base", "material");
      mat = null;
    }
    if (!mat && ent.material !== "cobre") ctx.pendencia("entrada.industrial.material", "material da rede não informado ou fora da lista (" + Object.keys(MATERIAIS).join(", ") + ")", "rede");
    if (!R.origem || !trechosE.length) ctx.pendencia("entrada.industrial.rede", "rede sem origem ou sem trechos", "rede");
    var adj = {}, porId = {};
    trechosE.forEach(function (t) { porId[t.id] = t; [t.de, t.para].forEach(function (n) { (adj[n] = adj[n] || []).push(t); }); });
    var pai = {}, filhos = {}, ordem = [], visit = {}, fila = R.origem ? [R.origem] : [], malha = false;
    visit[R.origem] = true;
    while (fila.length) {
      var n0 = fila.shift();
      arr(adj[n0]).forEach(function (t) {
        if (pai[n0] === t) return;
        var o = t.de === n0 ? t.para : t.de;
        if (visit[o]) { if (pai[o] !== t) malha = true; return; }
        visit[o] = true; pai[o] = t; (filhos[n0] = filhos[n0] || []).push(t); ordem.push({ t: t, de: n0, para: o }); fila.push(o);
      });
    }
    if (malha) aviso("erro", "rede em MALHA (anel): o motor dimensiona só rede ramificada", trechosE.map(function (t) { return t.id; }), { texto: "abrir o anel (um trecho normalmente fechado) e calcular de novo" });
    trechosE.forEach(function (t) { if (!visit[t.de] || !visit[t.para]) aviso("erro", "trecho " + t.id + " não se liga à origem " + R.origem, [t.id], { texto: "ligar o trecho à rede ou apagá-lo" }); });
    function caminho(no) { var c = []; while (pai[no]) { c.unshift(pai[no]); no = pai[no].de === no ? pai[no].para : pai[no].de; } return c; }

    /* demanda dos consumidores (kg/s) */
    var fuga = num(ent.fuga_frac, null), reserva = num(ent.reservaFutura_frac, 0), simult = num(ent.simultaneidade, null);
    if (estado === "gas" && tipo === "ar" && fuga == null) ctx.pendencia("entrada.industrial.fuga_frac", "fuga de ar comprimido não declarada (fração da demanda)", "ar comprimido");
    if (simult != null) premissa("fator de simultaneidade (RT)", fx(simult) + " nos trechos com mais de um consumidor a jusante; nunca abaixo do maior consumidor", "entrada");
    if (fuga) premissa("fuga declarada", fx(fuga * 100) + " % somados em todos os trechos (lado seguro)", "entrada");
    if (reserva) premissa("reserva para ampliação", fx(reserva * 100) + " %", "entrada");
    var mult = (1 + (fuga || 0)) * (1 + reserva);
    var Pamb = ambiente_C != null ? ar(pAtm0, ambiente_C) : null;
    var consumidores = cons.map(function (c) {
      var m = null, passos = [], uso = "consumidor " + c.id;
      if (c.vazao_kg_h != null) { m = num(c.vazao_kg_h, 0) / 3600; passos.push("ṁ = " + fx(c.vazao_kg_h) + " kg/h"); }
      else if (c.vazao_l_min_livre != null && tipo === "ar") {
        if (!Pamb) ctx.pendencia("entrada.industrial.temperaturaAmbiente_C", "temperatura do ar livre aspirado não informada", uso);
        else { m = num(c.vazao_l_min_livre, 0) / 1000 / (3600 / 60) * Pamb.rho * num(c.utilizacao, 1) * num(c.quantidade, 1); /* hid:ok 60 s/min */
               passos.push("ar livre: " + fx(c.vazao_l_min_livre) + " L/min × " + num(c.quantidade, 1) + " un × utilização " + fx(num(c.utilizacao, 1)) + " × ρ(" + fx(pAtm0) + " kPa; " + fx(ambiente_C) + " °C) = " + fx(Pamb.rho, CASAS_RHO) + " kg/m³ → ṁ = " + sci(m) + " kg/s"); }
      }
      else if (c.vazao_m3_h != null && P0 && estado === "liquido") { m = num(c.vazao_m3_h, 0) / 3600 * P0.rho; passos.push("ṁ = " + fx(c.vazao_m3_h) + " m³/h × ρ " + fx(P0.rho, CASAS_RHO) + " = " + sci(m) + " kg/s"); }
      else if (c.vazao_ls != null && P0 && estado === "liquido") { m = num(c.vazao_ls, 0) / 1000 * P0.rho; passos.push("ṁ = " + fx(c.vazao_ls) + " L/s × ρ = " + sci(m) + " kg/s"); }
      else if (c.vazao_m3_h != null && estado === "gas" && c.referencia && P0 && num(c.referencia.p_kPa_abs, null) != null && num(c.referencia.T_C, null) != null) {
        /* ρ na condição de REFERÊNCIA declarada da vazão (gás ideal com o R do próprio gás) */
        var rhoRef = c.referencia.p_kPa_abs * 1000 / (P0.R * (c.referencia.T_C + K0));
        m = num(c.vazao_m3_h, 0) / 3600 * rhoRef;
        passos.push("ṁ = " + fx(c.vazao_m3_h) + " m³/h (ref. " + c.referencia.p_kPa_abs + " kPa abs, " + c.referencia.T_C + " °C) × ρ_ref " + fx(rhoRef, CASAS_RHO) + " = " + sci(m) + " kg/s");
      }
      if (G15 && m == null && gasDef && gasDef.ok) {
        var pot = num(c.potencia_kcal_h, null), fpot = "entrada";
        if (pot == null && c.potencia_kW != null) pot = num(c.potencia_kW, 0) * 3600 / KJ_KCAL;
        if (pot == null && c.aparelho) { var la = ctx.consulta(K.g15 + "potencias", { aparelho: c.aparelho }, "kcal_h", uso); if (la.ok) { pot = la.valor; fpot = "Anexo D (" + c.aparelho + ")"; } }
        var refQ = c.vazao_m3_h != null ? num(c.vazao_m3_h, null) : null, P1 = par15(uso);
        if (P1 && (pot != null || refQ != null) && (refQ != null || gasDef.pci != null)) {
          var Qc = refQ != null ? refQ : pot / gasDef.pci, rr = P1.pref * 1000 / (gasDef.R * (P1.Tref + K0));
          m = Qc / 3600 * rr; c._pot = pot;
          passos.push(refQ != null ? "Q = " + fx(refQ, CASAS_V) + " m³/h (20 °C, 1 atm)" : "Q = C/PCI = " + fx(pot, 0) + " kcal/h (" + fpot + ") / " + gasDef.pci + " = " + fx(Qc, CASAS_V) + " m³/h");
        }
      }
      if (m == null) ctx.pendencia("entrada.industrial.consumidor[" + c.id + "].vazao", "vazão do consumidor " + c.id + " sem unidade compatível com o fluido (kg/h; L/s ou m³/h p/ líquido; L/min livre p/ ar; m³/h + referência p/ gás)", uso);
      if (!visit[c.no]) aviso("erro", "consumidor " + c.id + " no nó " + c.no + " fora da rede", [c.id], { texto: "ligar o ponto de consumo a um trecho da rede" });
      return { id: c.id, no: c.no, m_kg_s: m, pot_kcal_h: c._pot != null ? c._pot : null, alimenta: c.alimenta || "aparelho", pressaoMin_kPa: num(c.pressaoMin_kPa, null), fontePressao: c.fontePressao || null, passos: passos, valvula: c.valvula || null };
    });
    var consNo = {}; consumidores.forEach(function (c) { (consNo[c.no] = consNo[c.no] || []).push(c); });
    function aJusante(no) { var l = (consNo[no] || []).slice(); arr(filhos[no]).forEach(function (t) { var o = t.de === no ? t.para : t.de; l = l.concat(aJusante(o)); }); return l; }

    /* ------------------------------------------------------------ 3. CRITÉRIOS E TUBOS */
    var serv = ent.servico;
    if (!serv && !G15) ctx.pendencia("entrada.industrial.servico", "serviço não informado (linha de " + K.vel + ")", "critérios");
    var cV = G15 ? ctx.consulta(K.g15 + "limites", { parametro: "velocidade_max_ms" }, "valor", "velocidade máxima (NBR 15526 6.3)") : serv ? ctx.consulta(K.vel, { servico: serv }, "v_max_ms", "velocidade máxima do serviço " + serv) : { ok: false };
    var vMax = cV.ok ? num(cV.valor, null) : null, vMin = cV.ok && !G15 ? num(cV.linha.v_min_ms, null) : null, fV = cV.ok ? (G15 ? fonteDe(K.g15 + "limites", "6.3", cV.linha) : fonteDe(K.vel, serv, cV.linha)) : null;
    if (G15) serv = serv || "gas_" + tipo + "_15526";
    /* perda admissível: tabela (por serviço) ou entrada COM fonte; sem nenhuma, vale só a pressão requerida no ponto */
    var perdaAdm = null;
    if (ent.perdaAdmissivel && ent.perdaAdmissivel.fonte) perdaAdm = { valor: num(ent.perdaAdmissivel.valor, null), unidade: ent.perdaAdmissivel.unidade || "kPa", base: "total", fonte: { doc: String(ent.perdaAdmissivel.fonte), tipo: "secundaria" }, origem: "entrada" };
    else if (serv) {
      var cp = opcional(K.perda, { servico: serv }, "valor");
      if (cp.ok) perdaAdm = { valor: num(cp.valor, null), unidade: cp.linha.unidade, base: cp.linha.base, comprimento_ref_m: cp.linha.comprimento_ref_m, fonte: fonteDe(K.perda, serv, cp.linha), origem: "tabela" };
    }
    /* perda admissível (kPa) até o consumidor: total, fração da pressão manométrica na origem, ou por comprimento do caminho */
    var UNID_KPA = { kPa: 1, bar: 100, Pa: 1 / 1000 };
    /* gás (6.3): 10 % da pressão de operação no trecho que alimenta aparelho, 30 % no que alimenta regulador */
    var adm15 = {};
    if (G15) ["aparelho", "regulador"].forEach(function (k) { var c = ctx.consulta(K.g15 + "limites", { parametro: "perda_max_" + k + "_frac" }, "valor", "perda máxima (6.3)"); if (c.ok) adm15[k] = { frac: num(c.valor, null), fonte: fonteDe(K.g15 + "limites", "6.3", c.linha) }; });
    if (G15) perdaAdm = { valor: 1, unidade: "fracao15526", fonte: null };
    function admPara(c) {
      if (G15) { var a = adm15[c.alimenta === "regulador" ? "regulador" : "aparelho"]; if (!a) return null; perdaAdm.fonte = a.fonte; return a.frac * (pAbsOrig - pAtm0); }
      if (!perdaAdm || perdaAdm.valor == null) return null;
      if (perdaAdm.unidade === "fracao") return perdaAdm.valor * (pAbsOrig - pAtm0);
      var u = UNID_KPA[perdaAdm.unidade]; if (u == null) return null;
      if (perdaAdm.base === "por_comprimento") { var Lc = caminho(c.no).reduce(function (s, t) { return s + num(t.comprimento_m, 0); }, 0), Lr = num(perdaAdm.comprimento_ref_m, null);
        return Lr ? perdaAdm.valor * u * Lc / Lr : null; }
      return perdaAdm.valor * u;
    }
    function descAdm(c) { if (G15) { var a = adm15[c.alimenta === "regulador" ? "regulador" : "aparelho"]; return fx(a.frac * 100) + " % da pressão de operação (trecho que alimenta " + (c.alimenta === "regulador" ? "regulador" : "aparelho") + ", 6.3)"; }
      return perdaAdm.unidade === "fracao" ? perdaAdm.valor * 100 + " % da pressão na origem"
      : perdaAdm.base === "por_comprimento" ? perdaAdm.valor + " " + perdaAdm.unidade + " por " + perdaAdm.comprimento_ref_m + " m × " + fx(caminho(c.no).reduce(function (s, t) { return s + num(t.comprimento_m, 0); }, 0)) + " m de caminho"
      : perdaAdm.valor + " " + perdaAdm.unidade; }
    /* queda de pressão MANOMÉTRICA da origem ao consumidor (com o efeito do desnível) */
    function quedaMan(c, p) { return (pAbsOrig - pAtm0) - (p - pAtmNo(c.no)); }
    var tubos = [];
    if (mat) {
      var tl = ctx.linhas(K.tubo + mat.tabela, null, "tubos de " + mat.nome) || [];
      tubos = tl.map(function (l) {
        var de = num(l.de_mm, null), e = num(l.e_mm, null);
        return { dn: String(l.dn), de_mm: de, e_mm: e, di_mm: de != null && e != null ? de - 2 * e : null, serie: String(l.serie), linha: l };
      }).filter(function (t) { return t.di_mm > 0; });
    }
    var cRug = mat ? ctx.consulta(K.rug, { material: ent.material }, "epsilon_mm", "rugosidade de " + ent.material) : { ok: false };
    var eps = cRug.ok ? num(cRug.valor, null) / 1000 : null;

    /* classe de pressão de UM tubo (linha da tabela) na pressão e temperatura de projeto */
    var Pproj = num((ent.projeto || {}).pressao_kPa, pOrig), Tproj = num((ent.projeto || {}).temperatura_C, estado === "vapor" && P0 ? P0.T_K - K0 : TC);
    if ((ent.projeto || {}).pressao_kPa == null && Pproj != null) premissa("pressão de projeto", "= pressão de operação na origem (" + fx(Pproj) + " kPa), sem margem — o RT informa projeto.pressao_kPa", "padrao_motor");
    if ((ent.projeto || {}).temperatura_C == null && Tproj != null) premissa("temperatura de projeto", "= de operação (" + fx(Tproj) + " °C)", "padrao_motor");
    var corr = num((ent.projeto || {}).sobreespessura_mm, null);
    if (corr == null) { corr = 0; premissa("sobreespessura de corrosão", "0 mm (não informada pelo RT)", "padrao_motor"); }
    var especificacao = (ent.projeto || {}).especificacao || (mat && mat.espec);
    var costura = (ent.projeto || {}).costura || "sem_costura";
    if (mat && mat.barlow && !(ent.projeto || {}).especificacao) premissa("especificação do tubo", especificacao + " (" + costura.replace("_", " ") + ")", "padrao_motor");
    function fator(param, uso) { var c = ctx.consulta(K.fat, { parametro: param }, "valor", uso); return c.ok ? num(c.valor, null) : null; }
    function tensao(T, uso) {
      var ls = tab(K.S, { material: ent.material, especificacao: especificacao }, uso);
      if (!ls || !ls.length) { if (ls) ctx.pendencia(K.S + "[" + ent.material + ", " + especificacao + "]", "sem linha de tensão admissível para " + especificacao, uso); return null; }
      ls = ls.slice().sort(function (a, b) { return a.T_C - b.T_C; });
      if (T > ls[ls.length - 1].T_C) { ctx.pendencia(K.S + "[" + especificacao + ", " + T + " °C]", "temperatura acima da tabela de tensão admissível", uso); return null; }
      if (T <= ls[0].T_C) return { S: ls[0].S_MPa, linha: ls[0] };
      for (var i = 1; i < ls.length; i++) if (ls[i].T_C >= T) { var a = ls[i - 1], b = ls[i]; return { S: a.S_MPa + (b.S_MPa - a.S_MPa) * (T - a.T_C) / (b.T_C - a.T_C), linha: b, interp: [a.T_C, b.T_C] }; }
      return null;
    }
    /* CLASSE DE PRESSÃO de um tubo: P máx. admissível (independe da pressão; a verificação é por TRECHO, com a
       pressão DO TRECHO — REVISAO-IND-SOLAR-FINAIS A3: comparar todo trecho com a pressão da origem deixava passar o
       trecho de baixo, que vê a coluna estática e o golpe) */
    var fatJ = num((ent.projeto || {}).fatorJunta, null), fatW = num((ent.projeto || {}).fatorW, null), fonteFat = (ent.projeto || {}).fonteFatores;
    var cacheClasse = {};
    function classe(tb) {
      var key = tb.dn + "|" + tb.serie; if (cacheClasse[key]) return cacheClasse[key];
      var uso = "classe de pressão " + tb.dn + " " + tb.serie, r = { Pmax_kPa: null, passos: [], fonte: null, barlow: null };
      if (Tproj == null) { r.passos.push("temperatura de projeto não informada"); return (cacheClasse[key] = r); }
      if (mat.barlow) {
        /* tolerância de espessura: aço-carbono pela NBR 5590 4.6.2 (−12,5 %); inox pela tabela de fatores (pendente) */
        var S = tensao(Tproj, uso), tol = null, E = null, W = null;
        if (ent.material === "aco_carbono") { var ct = ctx.consulta("tubo.5590.parametros", { parametro: "tolerancia_espessura_frac" }, "valor", uso); tol = ct.ok ? num(ct.valor, null) : null; }
        else tol = fator("tolerancia_espessura_frac", uso);
        if (ent.material === "aco_carbono" && !S && !out.avisos.some(function (x) { return x.id === "ind-5590-ensaio"; })) {
          /* ⚠ NBR 5590 5.7.2/5.7.7: a pressão de ENSAIO (S = 0,6·LE) não é referência de projeto — NÃO vira tensão admissível */
          var tx5590 = "classe de pressão do aço-carbono pendente: a NBR 5590 só dá a pressão de ENSAIO hidrostático (S = 0,60·LE, 5.7.2) e diz (5.7.7) que ela não é referência de projeto nem de pressão de trabalho — a tensão admissível de projeto (ASME B31.3 Tab. A-1) segue sem fonte";
          var ac5590 = { texto: "informar a tensão admissível de projeto com a fonte (ASME B31.3) — não usar a pressão de ensaio da 5590" };
          out.avisos.push({ id: "ind-5590-ensaio", sistema: SIS, gravidade: "aviso", texto: tx5590, elementos: [], corrigir: ac5590 });
          out.problemas.push({ texto: tx5590, elementos: [], acao: ac5590 });
        }
        if (costura === "sem_costura") { E = fator("E_sem_costura", uso); W = 1; }   /* sem solda: o fator de redução da solda (W) não se aplica */
        else {
          /* tubo COM COSTURA (B2 da revisão): E (eficiência da junta) e W (redução da solda em temperatura) da fonte ou
             declarados pelo RT com a fonte — nunca o 1 do sem costura calado */
          if (fatJ != null && fonteFat) E = fatJ; else E = fator("E_erw", uso);
          if (fatW != null && fonteFat) W = fatW;
          else { var cw = opcional(K.fat, { parametro: "W_ate_510C" }, "valor"); if (cw.ok) W = num(cw.valor, null);
                 else ctx.pendencia("entrada.industrial.projeto.fatorW", "tubo com costura: fator W de redução da solda (ASME B31.3 302.3.5) sem fonte — informar fatorW + fonteFatores", uso); }
        }
        if (S && E != null && W != null && tol != null) {
          var tmin = tb.e_mm * (1 - tol);
          r.Pmax_kPa = 2 * S.S * E * W * (tmin - corr) / tb.de_mm * 1000;
          r.barlow = { S: S.S, E: E, W: W, tmin: tmin };
          r.passos = ["S(" + fx(Tproj) + " °C) = " + fx(S.S) + " MPa (" + especificacao + (S.interp ? ", interpolada entre " + S.interp.join(" e ") + " °C" : "") + "); E = " + E + "; W = " + W,
                      "t mín. = e·(1 − tol) = " + fx(tb.e_mm) + "·(1 − " + tol + ") = " + fx(tmin, CASAS_V) + " mm",
                      "P máx. adm. = 2·S·E·W·(t mín − c)/D = " + fx(r.Pmax_kPa) + " kPa (Barlow, D externo)"];
          r.fonte = fonteDe(K.S, especificacao, S.linha);
        } else r.passos.push("tensão admissível, fator de junta/solda ou tolerância de espessura sem fonte: classe de pressão pendente");
      } else if (ent.material === "cobre") {
        /* NBR 13206 Tabela A.1 (informativa): pressão máxima de serviço por DE e classe (ruptura 310 MPa ÷ 5). A norma não traz
           redução por temperatura: acima do limite do RT a classe fica PENDENTE (água quente acima de ~70 °C) */
        var ps = num(tb.linha.pressao_max_servico_MPa, null), ctm = ctx.consulta("tubo.13206.parametros", { parametro: "temperatura_max_sem_reducao_C" }, "valor", uso);
        if (ps == null) ctx.pendencia(K.tubo + "cobre[" + tb.dn + " " + tb.serie + "].pressao_max_servico", "pressão máxima de serviço do tubo de cobre sem valor (NBR 13206 Tabela A.1)", uso);
        else if (!ctm.ok) { /* pendência já registrada pela consulta */ }
        else if (Tproj > ctm.valor) ctx.pendencia(K.tubo + "cobre.temperatura", "projeto a " + fx(Tproj) + " °C acima de " + ctm.valor + " °C: a NBR 13206 não traz redução da pressão de serviço por temperatura", uso);
        else { r.Pmax_kPa = ps * 1000; r.passos = ["pressão máxima de serviço (NBR 13206 Tabela A.1, informativa) = " + ps + " MPa = " + fx(r.Pmax_kPa) + " kPa (até " + ctm.valor + " °C, sem redução)"]; r.fonte = fonteDe(K.tubo + "cobre", tb.dn + " " + tb.serie, tb.linha); }
      } else if (ent.material === "pead") {
        var pn = num(tb.linha.pn_bar, null), tref = num(tb.linha.T_ref_C, null);
        if (pn == null) ctx.pendencia(K.tubo + "pead_pe100[" + tb.dn + " " + tb.serie + "].pn", "PN do tubo sem valor no catálogo", uso);
        else if (tref == null || Tproj > tref) ctx.pendencia(K.tubo + "pead_pe100.temperatura_referencia", "PN do PEAD vale na temperatura de referência do catálogo; o fator de redução por temperatura não tem fonte na base", uso);
        else { r.Pmax_kPa = pn * 100; r.passos = ["PN " + pn + " bar = " + fx(r.Pmax_kPa) + " kPa a " + tref + " °C (catálogo)"]; r.fonte = fonteDe(K.tubo + "pead_pe100", tb.dn + " " + tb.serie); }
      }
      return (cacheClasse[key] = r);
    }
    /* a verificação na pressão P (kPa man.) do trecho */
    function classeEm(tb, P) {
      var c = classe(tb), r = { ok: null, Pmax_kPa: c.Pmax_kPa, passos: c.passos.slice(), fonte: c.fonte };
      if (P == null) { r.passos.push("pressão de projeto não informada"); return r; }
      if (c.Pmax_kPa == null) return r;
      r.ok = P <= c.Pmax_kPa + TOL;
      if (c.barlow) r.passos.push("t req. = P·D/(2·S·E·W) + c = " + fx(P / 1000, CASAS_V) + "·" + fx(tb.de_mm) + "/(2·" + fx(c.barlow.S) + "·" + c.barlow.E + "·" + c.barlow.W + ") + " + fx(corr) + " = " + fx(P / 1000 * tb.de_mm / (2 * c.barlow.S * c.barlow.E * c.barlow.W) + corr, CASAS_V) + " mm");
      r.passos.push("P no trecho = " + fx(P) + " kPa " + (r.ok ? "≤" : ">") + " P máx. " + fx(c.Pmax_kPa) + " kPa");
      return r;
    }
    /* candidatos: um por DN, com as séries do mais leve ao mais pesado (a série sai por TRECHO, pela pressão nele) */
    var serieFixa = ent.serie != null ? String(ent.serie) : null;
    var porDN = {};
    tubos.forEach(function (t) { (porDN[t.dn] = porDN[t.dn] || []).push(t); });
    var cand = Object.keys(porDN).map(function (dn) {
      var ls = porDN[dn].slice().sort(function (a, b) { return a.e_mm - b.e_mm; });
      if (serieFixa) ls = ls.filter(function (t) { return t.serie === serieFixa; });
      return ls.length ? { dn: dn, series: ls, di_mm: ls[0].di_mm } : null;
    }).filter(Boolean).sort(function (a, b) { return a.di_mm - b.di_mm; });
    if (mat && tubos.length && !cand.length) aviso("erro", "nenhum tubo de " + mat.nome + (serieFixa ? " série " + serieFixa : "") + " no catálogo", [], { texto: "trocar material/série" });

    /* ------------------------------------------------------------ 4. HIDRÁULICA DA REDE */
    var est = {}; /* id → { idx (DN), sIdx (série), travado } */
    function idxDe(dn) { for (var i = 0; i < cand.length; i++) if (cand[i].dn === String(dn)) return i; return -1; }
    function tbDe(e) { var c = e.idx >= 0 ? cand[e.idx] : null; return c ? c.series[Math.min(e.sIdx || 0, c.series.length - 1)] : null; }
    ordem.forEach(function (o) {
      var t = o.t, trav = arr(ent.travados).indexOf(t.id) >= 0 || t.travado, i = t.dn != null ? idxDe(t.dn) : -1, s = 0;
      if (trav && i >= 0 && t.serie != null) cand[i].series.forEach(function (x, k) { if (x.serie === String(t.serie)) s = k; });
      est[t.id] = { idx: trav ? i : 0, sIdx: s, travado: trav, dnModelo: t.dn != null ? String(t.dn) : null, serieModelo: t.serie, materialModelo: t.material, sistemaModelo: t.sistema };
      if (trav && i < 0) aviso("erro", "trecho travado " + t.id + " com DN " + t.dn + " fora do catálogo de " + (mat ? mat.nome : "?"), [t.id], { texto: "destravar ou escolher um DN da tabela" });
    });
    var tipoInst = (ent.gas || {}).tipoInstalacao, linhasE = G15 ? (ctx.linhas(K.g15 + "simultaneidade", null, "Anexo E") || []) : [];
    if (G15) premissa("fator de simultaneidade (Anexo E)", tipoInst === "predial_coletiva" ? "aplicado pela potência a jusante de cada trecho" : "NÃO aplicado (" + (tipoInst || "tipo de instalação não informado: lado seguro") + " — o Anexo E não vale para unidade única, comércio nem grande consumo)", "norma", fonteDe(K.g15 + "simultaneidade", "Anexo E"));
    function fatorF(o) { var l = aJusante(o.para).filter(function (c) { return c.m_kg_s != null; });
      if (!G15 || tipoInst !== "predial_coletiva" || !l.length || l.some(function (c) { return c.pot_kcal_h == null; })) return null;
      var C = l.reduce(function (s, c) { return s + c.pot_kcal_h; }, 0), Fp = simult15526(C, linhasE); return Fp == null ? null : { C: C, F: Fp }; }
    function fluxo(o) { var l = aJusante(o.para).filter(function (c) { return c.m_kg_s != null; }); if (!l.length) return 0;
      var fF = fatorF(o); if (fF) return l.reduce(function (s, c) { return s + c.m_kg_s; }, 0) * fF.F / 100;
      var soma = l.reduce(function (s, c) { return s + c.m_kg_s; }, 0), maior = Math.max.apply(null, l.map(function (c) { return c.m_kg_s; }));
      return (l.length > 1 && simult != null ? Math.max(maior, simult * soma) : soma) * mult; }
    /* um trecho: perda e pressão de saída (kPa abs) */
    function trechoHid(o, tb, pIn) {
      var t = o.t, m = fluxo(o), L = num(t.comprimento_m, null), D = tb.di_mm / 1000, A = H.area(D), dz = cota(o.para) - cota(o.de);
      var r = { m: m, D: D, pIn: pIn, pOut: null, v: null, Re: null, f: null, perda_kPa: null, passos: [], pend: false };
      if (L == null) { ctx.pendencia("entrada.industrial.trecho[" + t.id + "].comprimento_m", "comprimento do trecho não informado", "trecho " + t.id); r.pend = true; return r; }
      if (eps == null || !estado) { r.pend = true; return r; }
      var Ks = 0, Leq = 0;
      arr(t.conexoes).forEach(function (c) { var n = num(c.n, 1); if (c.k != null) Ks += num(c.k, 0) * n; if (c.leq_m != null) Leq += num(c.leq_m, 0) * n; });
      if (estado === "liquido") {
        var p = props(pIn, "trecho " + t.id); if (!p) { r.pend = true; return r; }
        var Q = m / p.rho, d = H.darcy(Q, D, L + Leq, eps, p.nu), hk = H.perdaK(Ks, d.v);
        r.v = d.v; r.Re = d.Re; r.f = d.f; r.vOut = d.v;
        r.perda_kPa = (d.hf + hk) * p.rho * H.G / 1000;
        r.pOut = pIn - r.perda_kPa - dz * p.rho * H.G / 1000;
        r.passos = d.passos.concat(["ΣK = " + fx(Ks) + " → hK = " + fx(hk, CASAS_RHO) + " m", "Δp atrito = ρ·g·(hf + hK) = " + fx(r.perda_kPa) + " kPa; desnível " + fx(dz) + " m",
                                    "p saída = " + fx(pIn) + " − " + fx(r.perda_kPa) + " − ρ·g·Δz = " + fx(r.pOut) + " kPa abs"]);
        return r;
      }
      if (G15) { var rg15 = trechoGN(o, tb, pIn, r, m, L, Leq, Ks, A, dz), fF = fatorF(o); if (fF && rg15.passos) rg15.passos.unshift("C = " + fx(fF.C, 0) + " kcal/h → F = " + fx(fF.F) + " % (Anexo E)"); if (fF) rg15.simultaneidade = fF; return rg15; }
      if (estado === "gas") {
        var g = props(pIn, "trecho " + t.id); if (!g) { r.pend = true; return r; }
        var Re = m / A * D / g.mu, fa = H.fatorAtrito(Re, eps / D), fLD = fa.f * (L + Leq) / D + Ks;
        var p2 = isotermico(pIn, m, D, fLD, g.R, g.T_K);
        r.Re = Re; r.f = fa.f; r.v = m / (g.rho * A);
        if (p2 == null) { r.pOut = null; r.choque = true; r.passos = ["Re = " + Math.round(Re) + "; f = " + fx(fa.f, CASAS_RHO), "a vazão não se sustenta no trecho (pressão zera / escoamento crítico)"]; return r; }
        r.perda_kPa = pIn - p2;
        var g2 = props(p2, "trecho " + t.id); p2 -= (g.rho + (g2 ? g2.rho : g.rho)) / 2 * H.G * dz / 1000;   /* coluna de gás no desnível */
        r.pOut = p2; r.vOut = m * g.R * g.T_K / (p2 * 1000) / A;
        r.passos = ["G = ṁ/A = " + fx(m / A) + " kg/(m²·s); Re = G·D/μ = " + Math.round(Re) + "; f (" + (fa.regime === "laminar" ? "64/Re" : "Colebrook") + ") = " + fx(fa.f, CASAS_RHO),
                    "f·(L + Leq)/D + ΣK = " + fx(fLD, CASAS_V), "p1² − p2² = G²·R·T·[fL/D + 2·ln(p1/p2)] → p2 = " + fx(p2) + " kPa abs (Δp = " + fx(r.perda_kPa) + " kPa)",
                    "v entrada = " + fx(r.v, CASAS_V) + " m/s; v saída = " + fx(r.vOut, CASAS_V) + " m/s"];
        return r;
      }
      if (estado === "vapor") {
        var pp = pIn, dL = (L + Leq) / N_PARTES, dK = Ks / N_PARTES, vMaxT = 0, fm = null, Rm = null;
        for (var k = 0; k < N_PARTES; k++) {
          var s1 = props(pp, "trecho " + t.id); if (!s1) { r.pend = true; return r; }
          var v1 = m / (s1.rho * A), Re1 = m / A * D / s1.mu, f1 = H.fatorAtrito(Re1, eps / D).f;
          var dp1 = (f1 * dL / D + dK) * s1.rho * v1 * v1 / 2 / 1000;
          var s2 = props(pp - dp1 / 2, "trecho " + t.id); if (!s2) { r.pend = true; return r; }   /* corretor: ρ na pressão média da parte */
          var v2 = m / (s2.rho * A), Re2 = m / A * D / s2.mu, f2 = H.fatorAtrito(Re2, eps / D).f;
          var dp = (f2 * dL / D + dK) * s2.rho * v2 * v2 / 2 / 1000;
          pp -= dp; if (!(pp > 0)) { r.choque = true; r.passos = ["a pressão zera no trecho: vazão grande demais para o diâmetro"]; return r; }
          var s3 = props(pp, "trecho " + t.id); if (!s3) { r.pend = true; return r; }
          vMaxT = Math.max(vMaxT, m / (s3.rho * A)); if (k === 0) { fm = f1; Rm = Re1; r.v = v1; }
        }
        r.perda_kPa = pIn - pp;
        var sz = props(pp, "trecho " + t.id); if (sz) pp -= sz.rho * H.G * dz / 1000;   /* coluna de vapor no desnível */
        r.pOut = pp; r.vOut = vMaxT; r.Re = Rm; r.f = fm;
        r.passos = ["Re (entrada) = " + Math.round(Rm) + "; f = " + fx(fm, CASAS_RHO) + "; " + N_PARTES + " partes de " + fx(dL, CASAS_V) + " m",
                    "Δp = Σ (f·ΔL/D + ΣK/N)·ρ·v²/2 com ρ(p) da IF97 → p saída = " + fx(pp) + " kPa abs (Δp = " + fx(r.perda_kPa) + " kPa)",
                    "v entrada = " + fx(r.v, CASAS_V) + " m/s; v saída = " + fx(vMaxT, CASAS_V) + " m/s"];
        return r;
      }
      r.pend = true; return r;
    }
    /* GÁS (GN e GLP) pela ABNT NBR 15526:2012, Anexo B (decisão do RT, 17/10/2026 — substitui o Renouard/Lacey do
       manual da Comgás: a norma NÃO usa Lacey, e a dúvida mmca × mbar morre aqui):
         P ≤ 7,5 kPa → B.1.2 (GN: Q^0,9 = c·((H·D^4,8)/(S^0,8·L))^0,5; GLP: PA − PB = 2273·S·L·Q^1,82/D^4,82, kPa);
         P > 7,5 kPa → B.1.1 (PA²abs − PB²abs = 4,67·10⁵·S·L·Q^1,82/D^4,82);
         vertical ΔP = 1,318·10⁻²·H·(S − 1) (GN ganha subindo, GLP ganha descendo).
       ⚠ CONFERÊNCIA FÍSICA: Darcy-Weisbach isotérmico com a viscosidade do metano/propano (NIST). Se a norma der perda
       menor que Darcy além da tolerância do RT, aviso + vale Darcy (lado seguro). */
    var P15 = null;
    function par15(uso) {
      if (P15) return P15.ok ? P15 : null;
      var lf = ctx.linhas(K.g15 + "formulas", null, uso) || [], ll = ctx.linhas(K.g15 + "limites", null, uso) || [];
      function v(ls, p) { var l = ls.filter(function (x) { return x.parametro === p; })[0]; return l ? num(l.valor, null) : null; }
      P15 = { b11c: v(lf, "b11_coef"), b11q: v(lf, "b11_exp_q"), b11d: v(lf, "b11_exp_d"),
              gc: v(lf, "b12gn_coef"), gq: v(lf, "b12gn_exp_q"), gd: v(lf, "b12gn_exp_d"), gs: v(lf, "b12gn_exp_s"), gr: v(lf, "b12gn_exp_raiz"),
              lc: v(lf, "b12glp_coef"), lq: v(lf, "b12glp_exp_q"), ld: v(lf, "b12glp_exp_d"),
              vc: v(lf, "vertical_coef"), velc: v(lf, "vel_coef"), velp0: v(lf, "vel_p0_kgf_cm2"),
              lim: v(ll, "limite_formula_kpa"), Tref: v(ll, "q_ref_T_C"), pref: v(ll, "q_ref_p_kPa") };
      P15.ok = lf.length && ll.length && Object.keys(P15).every(function (k) { return P15[k] != null; });
      if (!P15.ok && (lf.length || ll.length)) ctx.pendencia(K.g15 + "formulas", "fórmulas/limites do Anexo B da NBR 15526 incompletos na tabela", uso);
      P15.fonte = fonteDe(K.g15 + "formulas", "Anexo B");
      return P15.ok ? P15 : null;
    }
    var avisoConf = [];
    function trechoGN(o, tb, pIn, r, m, L, Leq, Ks, A, dz) {
      var t = o.t, uso = "trecho " + t.id, P = par15(uso), g = props(pIn, uso);
      if (!P || !g || !gasDef) { r.pend = true; return r; }
      if (Ks > 0) { ctx.pendencia("entrada.industrial.trecho[" + t.id + "].conexoes", "rede de gás pela NBR 15526: conexões em COMPRIMENTO EQUIVALENTE (Tabela C.4 ou do fabricante), não em K", uso); r.pend = true; return r; }
      var S = gasDef.S, rhoRef = P.pref * 1000 / (gasDef.R * (P.Tref + K0)), Q = m / rhoRef * 3600, Lt = L + Leq, Dmm = tb.di_mm, D = Dmm / 1000;
      var pMan = pIn - pAtmNo(o.de);
      var n = perda15526(P, { gas: tipo, pMan: pMan, pAbs: pIn, S: S, L: Lt, Q: Q, D: Dmm });
      if (n.dp == null) { r.choque = true; r.passos = [n.formula + ": a pressão zera no trecho"]; return r; }
      var dp = n.dp, dpD = null, adot = "norma";
      if (g.mu != null) {
        var Re = m / A * D / g.mu, fa = H.fatorAtrito(Re, eps / D), p2d = isotermico(pIn, m, D, fa.f * Lt / D, g.R, g.T_K);
        r.Re = Re; r.f = fa.f;
        if (p2d == null) { r.choque = true; r.passos = ["conferência por Darcy: a vazão bloqueia no trecho"]; return r; }
        dpD = pIn - p2d;
        var tol = opcional("ind.gas.criterio_conferencia", { parametro: "tolerancia_norma_abaixo_darcy_frac" }, "valor");
        if (!tol.ok) ctx.pendencia("ind.gas.criterio_conferencia", "tolerância da conferência por Darcy (decisão do RT) sem tabela", uso);
        else if (n.dp < dpD * (1 - tol.valor)) { dp = dpD; adot = "darcy"; avisoConf.push(t.id); }
      } else premissa("conferência física da perda do gás", "indisponível: viscosidade do gás sem fonte — vale só a fórmula da norma", "padrao_motor");
      r.gas = { formula: n.formula, norma_kPa: n.dp, darcy_kPa: dpD, adotado: adot, Q_m3h: Q, S: S };
      /* vertical: ΔP = c·H·(S − 1) sai da pressão MANOMÉTRICA (o gás mais leve que o ar ganha subindo) */
      var dpv = P.vc * dz * (S - 1), pManOut = pMan - dp - dpv;
      r.perda_kPa = dp;
      r.pOut = pManOut + pAtmNo(o.para);
      r.v = P.velc * Q / ((pMan / KGF_CM2_KPA + P.velp0) * Dmm * Dmm);
      r.vOut = P.velc * Q / ((pManOut / KGF_CM2_KPA + P.velp0) * Dmm * Dmm);
      r.passos = ["Q = " + fx(Q, CASAS_V) + " m³/h (" + P.Tref + " °C; " + P.pref + " kPa); S = " + fx(S, CASAS_V) + "; LT = L + Leq = " + fx(Lt) + " m; P = " + fx(pMan, CASAS_V) + " kPa",
                  n.formula + " (NBR 15526 Anexo B): ΔP = " + fx(n.dp, CASAS_RHO) + " kPa",
                  dpD == null ? "conferência por Darcy indisponível (viscosidade sem fonte)" : "conferência Darcy isotérmico: ΔP = " + fx(dpD, CASAS_RHO) + " kPa → adotada a " + (adot === "darcy" ? "de DARCY (a norma ficou abaixo da tolerância do RT)" : "da norma"),
                  "vertical: ΔP = " + P.vc + "·" + fx(dz) + "·(" + fx(S, CASAS_V) + " − 1) = " + fx(dpv, CASAS_RHO) + " kPa → P final = " + fx(pManOut, CASAS_V) + " kPa",
                  "V = " + P.velc + "·Q/((P + " + P.velp0 + ")·D²) = " + fx(r.vOut, CASAS_V) + " m/s (B.1.3)"];
      return r;
    }
    /* pressão de verificação do TRECHO (kPa man.): a de projeto + coluna estática do líquido até o ponto mais baixo do
       trecho (sem escoamento, lado seguro) + a maior sobrepressão de golpe que passa por ele */
    function pTrecho(o, G) {
      if (Pproj == null) return null;
      var col = estado === "liquido" && P0 ? P0.rho * H.G * (cota(R.origem) - Math.min(cota(o.de), cota(o.para))) / 1000 : 0, dg = 0;
      arr(G).forEach(function (g) { if (g.dp != null && g.cam.indexOf(o.t) >= 0) dg = Math.max(dg, g.dp); });
      return Pproj + Math.max(0, col) + dg;
    }
    /* golpe de aríete no fechamento da válvula de cada consumidor (líquidos) — final = registra as pendências */
    function golpes(final) {
      var lista = [];
      if (estado !== "liquido") return lista;
      consumidores.forEach(function (c) {
        if (!c.valvula) return;
        var cam = caminho(c.no), uso = "golpe de aríete " + c.id, g = { c: c, cam: cam, dp: null, motivo: null };
        lista.push(g);
        var tc = num(c.valvula.tempoFechamento_s, null);
        if (tc == null) { g.motivo = "sem tempo de fechamento"; if (final) ctx.pendencia("entrada.industrial.consumidor[" + c.id + "].valvula.tempoFechamento_s", "tempo de fechamento da válvula (ficha do atuador) não informado", uso); return; }
        var ult = cam[cam.length - 1], h = ult && hid[ult.id], tb = h && h.tb;
        if (!tb || h.v == null || !P0) { g.motivo = "trecho final sem cálculo"; return; }
        var cE = final ? ctx.consulta(K.E, { material: ent.material }, "E_GPa", uso) : N.consulta(K.E, { material: ent.material }, "E_GPa");
        var Kf = P0.K, L = cam.reduce(function (s, t) { return s + num(t.comprimento_m, 0); }, 0);
        if (Kf == null && final) ctx.pendencia(K.oleoK + "[" + (F.nome || tipo) + "]", "módulo de compressibilidade do óleo sem fonte (celeridade)", uso);
        if (!cE.ok || Kf == null) { g.motivo = "módulo de elasticidade do tubo ou compressibilidade do fluido sem fonte"; return; }
        var Et = cE.valor * GPA, Dm = tb.di_mm / 1000, em = tb.e_mm / 1000;
        var a = Math.sqrt((Kf / P0.rho) / (1 + Kf * Dm / (Et * em))), Tcrit = 2 * L / a, rapido = tc <= Tcrit;
        g.dp = (rapido ? P0.rho * a * h.v : 2 * P0.rho * L * h.v / tc) / 1000;
        g.tc = tc; g.a = a; g.L = L; g.Tcrit = Tcrit; g.rapido = rapido; g.v = h.v; g.Kf = Kf; g.cE = cE;
      });
      return lista;
    }
    var hid = {};
    function rodar() {
      hid = {};
      var pNo = {}; pNo[R.origem] = pAbsOrig;
      ordem.forEach(function (o) {
        var e = est[o.t.id], tb = tbDe(e), pIn = pNo[o.de];
        if (!tb || pIn == null) { hid[o.t.id] = { pend: true, pIn: pIn, pOut: null }; pNo[o.para] = null; return; }
        var r = trechoHid(o, tb, pIn); r.tb = tb; hid[o.t.id] = r; pNo[o.para] = r.pOut;
      });
      return pNo;
    }
    /* 4a. DN inicial pela velocidade (gás/vapor: na pressão da origem; o laço confere na saída) */
    var pNo = {};
    if (cand.length && estado && pAbsOrig != null) {
      if (vMax == null) aviso("aviso", "sem velocidade recomendada com fonte para o serviço " + (serv || "?") + ": o DN sai só da perda admissível/pressão requerida", [], { texto: "informar o serviço da tabela " + K.vel });
      ordem.forEach(function (o) {
        var e = est[o.t.id]; if (e.travado) return;
        var m = fluxo(o), P = props(pAbsOrig, "trecho " + o.t.id); if (!P || vMax == null) return;
        for (var i = 0; i < cand.length; i++) { if (m / (P.rho * H.area(cand[i].di_mm / 1000)) <= vMax) { e.idx = i; return; } }
        e.idx = cand.length - 1; e.semOpcao = true;
      });
      /* 4b. laço: velocidade na saída (gás/vapor), perda admissível e pressão no consumidor */
      var limite = cand.length * Math.max(1, ordem.length);
      var laco = function () { for (var it = 0; it < limite; it++) {
        pNo = rodar();
        var sobe = null;
        ordem.some(function (o) { var h = hid[o.t.id], e = est[o.t.id];
          if (!e.travado && (h.choque || (vMax != null && h.vOut != null && h.vOut > vMax)) && e.idx < cand.length - 1) { sobe = o.t.id; return true; } return false; });
        if (!sobe) consumidores.some(function (c) {
          var p = pNo[c.no], adm = admPara(c), choque = caminho(c.no).some(function (t) { return hid[t.id] && hid[t.id].choque; });
          var falha = (p == null && choque) || (p != null && ((adm != null && quedaMan(c, p) > adm) || (c.pressaoMin_kPa != null && p - pAtmNo(c.no) < c.pressaoMin_kPa)));
          if (!falha || c.m_kg_s == null) return false;
          var cam = caminho(c.no).filter(function (t) { return !est[t.id].travado && est[t.id].idx < cand.length - 1; });
          if (!cam.length) return false;
          cam.sort(function (a, b) { var ha = hid[a.id], hb = hid[b.id]; return (hb.choque ? Infinity : hb.perda_kPa || 0) - (ha.choque ? Infinity : ha.perda_kPa || 0); });
          sobe = cam[0].id; return true;
        });
        if (!sobe) break;
        est[sobe].idx++; est[sobe].sIdx = 0;
      } };
      laco();
      /* 4c. SÉRIE POR TRECHO: a mais leve cuja P máx. aguenta a pressão DO TRECHO (coluna estática + golpe); trocar a
         série muda o Di, então a hidráulica roda de novo (poucas voltas: a série só sobe) */
      for (var volta = 0; volta < cand.length + 1; volta++) {
        var G = golpes(false), mudou = false;
        ordem.forEach(function (o) {
          var e = est[o.t.id], c = cand[e.idx]; if (!c || e.travado || serieFixa) return;
          var P = pTrecho(o, G), k = 0;
          if (P == null) return;
          for (k = 0; k < c.series.length; k++) { var pm = classe(c.series[k]).Pmax_kPa; if (pm == null || P <= pm + TOL) break; }
          if (k >= c.series.length) k = c.series.length - 1;   /* nenhuma aguenta: a mais pesada, e a verificação reprova */
          if (k !== (e.sIdx || 0)) { e.sIdx = k; mudou = true; }
        });
        if (!mudou) break;
        laco();
      }
    } else pNo = rodar();
    var GOLPES = golpes(true);

    /* ------------------------------------------------------------ 5. RESULTADOS POR TRECHO */
    ordem.forEach(function (o) {
      var t = o.t, e = est[t.id], h = hid[t.id] || {}, tb = h.tb || tbDe(e), Pt = pTrecho(o, GOLPES), cl = tb ? classeEm(tb, Pt) : { ok: null, passos: [] };
      var r = { id: t.id, de: o.de, para: o.para, material: ent.material, dnModelo: e.dnModelo, dn: tb ? tb.dn : null, serie: tb ? tb.serie : null,
                de_mm: tb ? tb.de_mm : null, e_mm: tb ? tb.e_mm : null, di_mm: tb ? tb.di_mm : null, travado: e.travado,
                comprimento_m: num(t.comprimento_m, null), vazao_kg_h: h.m != null ? h.m * 3600 : null, velocidade_ms: h.v, velocidadeSaida_ms: h.vOut,
                Re: h.Re, f: h.f, perda_kPa: h.perda_kPa, gas: h.gas || null, simultaneidade: h.simultaneidade || null, pressaoMontante_kPa: h.pIn != null ? h.pIn - pAtmNo(o.de) : null, pressaoJusante_kPa: h.pOut != null ? h.pOut - pAtmNo(o.para) : null,
                classe: { ok: cl.ok, P_kPa: Pt, Pmax_kPa: cl.Pmax_kPa, passos: cl.passos }, status: "ok", passos: h.passos || [], pendencias: [] };
      if (!tb) { r.status = "pendente"; r.pendencias.push("sem tubo comercial"); }
      if (h.pend) { r.status = "pendente"; r.pendencias.push("hidráulica pendente (ver pendências)"); }
      out.trechos.push(r);
      var uso = "trecho " + t.id;
      if (vMax != null && (h.vOut != null || h.v != null)) {
        var vv = Math.max(h.v || 0, h.vOut || 0), okv = vv <= vMax;
        verif(t.id, "velocidade ≤ recomendada (" + serv + ")", vv, vMax, "m/s", okv, ["v = ṁ/(ρ·A) com ρ " + (estado === "liquido" ? "do líquido" : "na saída do trecho (a maior v)") + " = " + fx(vv, CASAS_V) + " m/s ≤ " + vMax + " m/s"], fV);
        if (!okv) aviso("erro", "trecho " + t.id + ": velocidade " + fx(vv) + " m/s acima da recomendada " + vMax + " m/s" + (e.travado ? " (trecho travado)" : " mesmo no maior DN do catálogo"), [t.id],
                        { texto: e.travado ? "destravar o trecho " + t.id + " para o motor aumentar o DN" : "dividir a vazão em duas linhas ou usar material com DN maior" });
        if (vMin != null && vv < vMin) aviso("info", "trecho " + t.id + ": velocidade " + fx(vv) + " m/s abaixo da faixa recomendada (" + vMin + "–" + vMax + " m/s)", [t.id], { texto: "conferir se o DN não ficou superdimensionado (custo) — não reprova" });
      } else if (tb && !h.pend) verif(t.id, "velocidade ≤ recomendada", h.vOut || h.v || null, null, "m/s", null, ["velocidade recomendada do serviço sem fonte (" + K.vel + ")"], null);
      if (h.choque) aviso("erro", "trecho " + t.id + ": a vazão não passa (pressão zera no trecho)", [t.id], { texto: "aumentar o DN ou a pressão na origem" });
      if (tb) {
        var pPassos = ["P no trecho = projeto " + fx(Pproj) + " kPa + coluna estática até a cota mais baixa + maior golpe que passa nele = " + fx(Pt) + " kPa"];
        if (cl.ok === null) verif(t.id, "classe de pressão (" + tb.dn + " " + tb.serie + ")", Pt, null, "kPa", null, pPassos.concat(cl.passos.length ? cl.passos : ["sem fonte para a classe de pressão"]), null);
        else { verif(t.id, "classe de pressão (" + tb.dn + " " + tb.serie + ")", Pt, cl.Pmax_kPa, "kPa", cl.ok, pPassos.concat(cl.passos), cl.fonte);
               if (!cl.ok) aviso("erro", "trecho " + t.id + ": " + tb.dn + " série " + tb.serie + " não aguenta " + fx(Pt) + " kPa no trecho (máx. " + fx(cl.Pmax_kPa) + ")", [t.id], { texto: "material/série mais resistente, DN maior (golpe menor) ou fechamento mais lento" }); }
      }
      if (!arr(t.conexoes).length) aviso("aviso", "trecho " + t.id + " sem conexões/válvulas informadas: perda localizada fora da conta", [t.id], { texto: "informar as conexões (K do fabricante ou comprimento equivalente) do trecho " + t.id });
      if (tb && e.dnModelo != null && e.dnModelo !== tb.dn && !e.travado) { out.ops.push({ op: "instAlterar", id: t.id, dn: tb.dn, serie: tb.serie, material: ent.material, sistema: SIS }); out.opsDesfazer.unshift({ op: "instAlterar", id: t.id, dn: e.dnModelo, serie: e.serieModelo, material: e.materialModelo, sistema: e.sistemaModelo }); }   /* a inversa volta os 4 campos (junção J16) */
    });

    /* ------------------------------------------------------------ 6. CONSUMIDORES */
    consumidores.forEach(function (c) {
      var p = pNo[c.no], cam = caminho(c.no), adm = admPara(c), uso = "consumidor " + c.id, pa = pAtmNo(c.no);
      var rc = { id: c.id, no: c.no, vazao_kg_h: c.m_kg_s != null ? c.m_kg_s * 3600 : null, pressao_kPa: p != null ? p - pa : null,
                 perdaTotal_kPa: p != null && pAbsOrig != null ? quedaMan(c, p) : null, caminho: cam.map(function (t) { return t.id; }), passos: c.passos.slice() };
      out.consumidores.push(rc);
      if (p == null) { verif(c.id, "pressão no ponto de consumo", null, c.pressaoMin_kPa, "kPa", null, ["pressão não calculada (trecho pendente no caminho)"], null); return; }
      var feito = false;
      if (adm != null) { feito = true;
        var dq = quedaMan(c, p), okA = dq <= adm + TOL;
        verif(c.id, "perda total origem → consumidor ≤ admissível", dq, adm, "kPa", okA,
              ["Δp (manométrica) = " + fx(pAbsOrig - pAtm0) + " − " + fx(p - pa) + " = " + fx(dq) + " kPa ≤ " + fx(adm) + " kPa (" + descAdm(c) + ")"], perdaAdm.fonte);
        if (!okA) aviso("erro", "consumidor " + c.id + ": perda " + fx(dq) + " kPa acima da admissível " + fx(adm) + " kPa", rc.caminho, { texto: "aumentar o DN dos trechos " + rc.caminho.join(", ") + " (travados?) ou a pressão na origem" }); }
      if (c.pressaoMin_kPa != null) { feito = true;
        var okP = p - pa >= c.pressaoMin_kPa - TOL;
        verif(c.id, "pressão no consumidor ≥ requerida pelo equipamento", p - pa, c.pressaoMin_kPa, "kPa", okP, ["p = " + fx(p - pa) + " kPa (man.) ≥ " + fx(c.pressaoMin_kPa) + " kPa"],
              c.fontePressao ? { doc: String(c.fontePressao), tipo: "secundaria" } : null, "min");
        if (!c.fontePressao) premissa("pressão requerida no consumidor " + c.id, fx(c.pressaoMin_kPa) + " kPa (entrada, sem a ficha do equipamento citada)", "entrada");
        if (!okP) aviso("erro", "consumidor " + c.id + ": " + fx(p - pa) + " kPa < " + fx(c.pressaoMin_kPa) + " kPa requeridos", rc.caminho, { texto: "aumentar o DN do caminho " + rc.caminho.join(", ") + " ou a pressão na origem" }); }
      if (!feito) verif(c.id, "perda admissível / pressão requerida no consumidor", quedaMan(c, p), null, "kPa", null, ["nem critério de perda admissível com fonte (" + K.perda + ") nem pressão requerida do equipamento: a rede não está verificada no ponto"], null);
      if (!feito) ctx.pendencia(K.perda + "[" + (serv || "?") + "]", "sem perda admissível com fonte para o serviço e sem pressão requerida no consumidor", uso);
    });

    /* ------------------------------------------------------------ 7. GOLPE DE ARÍETE (líquidos) */
    GOLPES.forEach(function (G1) {
      var c = G1.c, g = { consumidor: c.id, caminho: G1.cam.map(function (t) { return t.id; }), passos: [], status: "pendente" };
      out.golpe.push(g);
      if (G1.dp == null) { verif(c.id, "golpe de aríete", null, null, "kPa", null, [G1.motivo], null); return; }
      var dp = G1.dp, cE = G1.cE, a = G1.a, L = G1.L;
      /* pressão em repouso no pior ponto do caminho (com a COLUNA ESTÁTICA até a cota mais baixa do trecho) + sobrepressão,
         contra a P máx. de cada trecho */
      var pior = null;
      G1.cam.forEach(function (t) { if (!hid[t.id] || !hid[t.id].tb) { pior = { pend: true }; return; } var cl = classe(hid[t.id].tb), z = Math.min(cota(t.de), cota(t.para)), pr = (pAbsOrig - pAtm0) + P0.rho * H.G * (cota(R.origem) - z) / 1000;
        if (cl.Pmax_kPa == null) { pior = pior || { pend: true }; return; }
        var folga = cl.Pmax_kPa - (pr + dp); if (!pior || pior.pend || folga < pior.folga) pior = { t: t.id, folga: folga, pr: pr, Pmax: cl.Pmax_kPa }; });
      g.a_ms = a; g.L_m = L; g.Tcrit_s = G1.Tcrit; g.tc_s = G1.tc; g.rapido = G1.rapido; g.sobrepressao_kPa = dp;
      g.passos = ["K = " + (tipo === "agua" ? "ρ·w² (w da IF97 reg. 1 = " + fx(P0.w, CASAS_P) + " m/s)" : "ficha do óleo") + " = " + fx(G1.Kf / GPA, CASAS_RHO) + " GPa; E tubo = " + cE.valor + " GPa",
                  "a = √((K/ρ)/(1 + K·D/(E·e))) = " + fx(a, CASAS_P) + " m/s (Korteweg)",
                  "L = " + fx(L) + " m; 2L/a = " + fx(G1.Tcrit, CASAS_V) + " s; fechamento " + fx(G1.tc) + " s → " + (G1.rapido ? "RÁPIDO" : "lento"),
                  G1.rapido ? "Δp = ρ·a·v = " + fx(P0.rho) + "·" + fx(a) + "·" + fx(G1.v, CASAS_V) + " = " + fx(dp) + " kPa (Joukowsky)" : "Δp = 2·ρ·L·v/tc = " + fx(dp) + " kPa (Michaud)"];
      if (!pior || pior.pend) { verif(c.id, "golpe de aríete: p repouso + Δp ≤ P máx. do tubo", dp, null, "kPa", null, g.passos.concat(["P máx. admissível de algum trecho pendente (classe de pressão)"]), fonteDe(K.E, ent.material, cE.linha)); return; }
      var okG = pior.folga >= 0; g.status = okG ? "ok" : "reprovado";
      g.passos.push("pior trecho " + pior.t + ": repouso " + fx(pior.pr) + " (origem + coluna estática) + " + fx(dp) + " = " + fx(pior.pr + dp) + " kPa ≤ " + fx(pior.Pmax) + " kPa");
      verif(pior.t, "golpe de aríete (" + c.id + "): p repouso + Δp ≤ P máx. do tubo", pior.pr + dp, pior.Pmax, "kPa", okG, g.passos, fonteDe(K.E, ent.material, cE.linha));
      if (!okG) {
        var tcNec = 2 * P0.rho * L * G1.v / ((pior.Pmax - pior.pr) * 1000);
        aviso("erro", "golpe de aríete no fechamento da válvula de " + c.id + ": " + fx(pior.pr + dp) + " kPa > " + fx(pior.Pmax) + " kPa no trecho " + pior.t, g.caminho,
              { texto: pior.Pmax > pior.pr ? "fechamento mais lento: tc ≥ " + fx(Math.max(tcNec, G1.Tcrit), CASAS_P) + " s (Michaud), ou série mais pesada, ou amortecedor/ventosa" : "série mais pesada (a pressão de repouso já passa do tubo)" });
      }
    });

    /* ------------------------------------------------------------ 8. DILATAÇÃO E LIRA */
    var D8 = ent.dilatacao || {}, Tinst = num(D8.temperaturaInstalacao_C, null);
    if (ordem.length && mat && Tproj != null) {
      if (Tinst == null) ctx.pendencia("entrada.industrial.dilatacao.temperaturaInstalacao_C", "temperatura de montagem não informada (ΔT da dilatação)", "dilatação");
      /* ΔL por metro: tabela de dilatação ACUMULADA por temperatura (Ft) quando tem a coluna do material — melhor que o α
         médio, que varia com a temperatura; senão α médio da tabela de materiais */
      var ftL = (N.tabela(K.ft) || { linhas: [], colunas: [] }), ftCol = ftL.colunas.indexOf(ent.material) >= 0 ? ent.material : null, cA = { ok: false };
      function ft(T) { var ls = ftL.linhas.filter(function (l) { return num(l[ftCol], null) != null; }).sort(function (a, b) { return a.T_C - b.T_C; });
        for (var i = 1; i < ls.length; i++) if (ls[i - 1].T_C <= T && ls[i].T_C >= T) return ls[i - 1][ftCol] + (ls[i][ftCol] - ls[i - 1][ftCol]) * (T - ls[i - 1].T_C) / (ls[i].T_C - ls[i - 1].T_C);
        return null; }
      var porMetro = null, dPassos = "";
      if (ftCol && Tinst != null && ft(Tinst) != null && ft(Tproj) != null) { base.consulta(K.ft, null, "T_C"); porMetro = ft(Tproj) - ft(Tinst); dPassos = "Ft(" + fx(Tproj) + " °C) − Ft(" + fx(Tinst) + " °C) = " + fx(porMetro, CASAS_RHO) + " mm/m (tabela de dilatação acumulada, interpolada)"; }
      else { cA = ctx.consulta(K.alfa, { material: ent.material }, "alfa_mm_m_K", "dilatação"); if (cA.ok && Tinst != null) { porMetro = num(cA.valor, 0) * (Tproj - Tinst); dPassos = "α·ΔT = " + cA.valor + "·" + fx(Tproj - Tinst) + " = " + fx(porMetro, CASAS_RHO) + " mm/m"; } }
      var cE2 = opcional(K.E, { material: ent.material }, "E_GPa");
      var Sa = null, saPassos = [];
      if (mat.barlow && Tinst != null) {
        var Sc = tensao(Math.min(Tinst, Tproj), "faixa admissível de deslocamento"), Sh = tensao(Math.max(Tinst, Tproj), "faixa admissível de deslocamento");
        var fc = fator("f_ate_7000_ciclos", "lira"), kc = fator("SA_coef_Sc", "lira"), kh = fator("SA_coef_Sh", "lira");
        if (Sc && Sh && fc != null && kc != null && kh != null) { Sa = fc * (kc * Sc.S + kh * Sh.S); saPassos = ["S_A = f·(" + kc + "·Sc + " + kh + "·Sh) = " + fc + "·(" + kc + "·" + fx(Sc.S) + " + " + kh + "·" + fx(Sh.S) + ") = " + fx(Sa) + " MPa"]; }
      } else if (!mat.barlow && Tinst != null && Tinst !== Tproj) ctx.pendencia("ind.lira.faixa_admissivel[" + ent.material + "]", "faixa de tensão admissível de deslocamento para " + mat.nome + " sem fonte (lira pelo balanço guiado)", "dilatação");
      var dist = num(D8.distanciaMaxPontosFixos_m, null), fDist = D8.fonteDistancia ? { doc: String(D8.fonteDistancia), tipo: "secundaria" } : null;
      /* a regra da tabela vale só para a aplicação dela (ex.: cobre em ÁGUA QUENTE) */
      var aplic = tipo === "agua" && Tinst != null && Tproj > Tinst ? "agua_quente" : (tipo || "-");
      if (dist == null) { var cf = opcional(K.fixos, { material: ent.material, aplicacao: aplic }, "distancia_max_m"); if (cf.ok) { dist = num(cf.valor, null); fDist = fonteDe(K.fixos, ent.material, cf.linha); } }
      if (dist != null && !fDist) { dist = null; ctx.pendencia("entrada.industrial.dilatacao.fonteDistancia", "distância entre pontos fixos informada sem a fonte", "dilatação"); }
      /* RETO CONTÍNUO (REVISAO-IND-SOLAR-FINAIS M1, decisão do RT): tê/derivação NÃO é ponto fixo. Sem pontos fixos
         informados, o comprimento de dilatação é o reto contínuo entre mudanças de direção — os trechos colineares que
         se encontram num nó (inclusive a passagem reta de um tê) somam. Antes cada trecho tinha ponto fixo nas pontas
         e três trechos de 25 m num reto de 75 m davam "25 ≤ 30 ok" três vezes. */
      function posNo(n) { var p = nos[n] || {}, y = num(p.y, num(p.cota, null)); return p.x != null && p.z != null && y != null ? { x: num(p.x, 0), y: y, z: num(p.z, 0) } : null; }
      function dirT(t) { var a = posNo(t.de), b = posNo(t.para); if (!a || !b) return null; var d = [b.x - a.x, b.y - a.y, b.z - a.z], n = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); return n > 0 ? [d[0] / n, d[1] / n, d[2] / n] : null; }
      var COLINEAR = 1 - 1e-6;   // hid:ok tolerância numérica de colinearidade (cos do ângulo), geometria
      var raiz = {}; ordem.forEach(function (o) { raiz[o.t.id] = o.t.id; });
      function acha(i) { while (raiz[i] !== i) i = raiz[i] = raiz[raiz[i]]; return i; }
      Object.keys(adj).forEach(function (n) {
        var ts = arr(adj[n]).filter(function (t) { return raiz[t.id] != null && t.pontosFixos_m == null && dirT(t); });
        for (var i = 0; i < ts.length; i++) for (var j = i + 1; j < ts.length; j++) {
          var a = dirT(ts[i]), b = dirT(ts[j]);
          if (Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) >= COLINEAR) raiz[acha(ts[i].id)] = acha(ts[j].id);
        }
      });
      var corridas = {}, ordemC = [];
      ordem.forEach(function (o) { var k = acha(o.t.id); if (!corridas[k]) { corridas[k] = []; ordemC.push(k); } corridas[k].push(o); });
      if (ordem.some(function (o) { return o.t.pontosFixos_m == null; })) premissa("pontos fixos da dilatação", "sem pontos fixos informados: comprimento de dilatação = reto contínuo entre mudanças de direção (tê não é ponto fixo) — lado seguro", "padrao_motor");
      ordemC.forEach(function (k) {
        var os = corridas[k], ids = os.map(function (o) { return o.t.id; }), t0 = os[0].t, alvo = t0.id;
        var tbs = os.map(function (o) { return (hid[o.t.id] || {}).tb; });
        if (tbs.some(function (x) { return !x; }) || os.some(function (o) { return num(o.t.comprimento_m, null) == null; }) || Tinst == null || porMetro == null) return;
        var semGeo = t0.pontosFixos_m == null && !dirT(t0);
        var Lrun = t0.pontosFixos_m != null ? num(t0.pontosFixos_m, 0) : os.reduce(function (s, o) { return s + num(o.t.comprimento_m, 0); }, 0);
        var tb = tbs.reduce(function (m, x) { return x.de_mm > m.de_mm ? x : m; }, tbs[0]);   /* lira pelo MAIOR diâmetro do reto (perna maior) */
        var dT = Tproj - Tinst, dL = porMetro * Lrun;
        var dd = { trecho: alvo, trechos: ids, comprimentoReto_m: Lrun, dT_K: dT, dL_mm: dL, lira: null, status: "ok",
                   passos: [dPassos, (ids.length > 1 ? "reto contínuo " + ids.join(" + ") + " = " : t0.pontosFixos_m != null ? "entre pontos fixos informados: " : "reto ") + fx(Lrun) + " m",
                            "ΔL = " + fx(porMetro, CASAS_RHO) + " mm/m × " + fx(Lrun) + " m = " + fx(dL) + " mm"] };
        out.dilatacao.push(dd);
        if (semGeo) { dd.status = "pendente"; verif(alvo, "distância entre pontos fixos ≤ máxima", null, dist, "m", null, dd.passos.concat(["coordenadas dos nós (x, y/cota, z) ausentes: o reto contínuo (mudanças de direção) não pode ser achado"]), null);
                      ctx.pendencia("entrada.industrial.rede.nos[coordenadas]", "nós sem coordenadas: comprimento de dilatação (reto contínuo) indeterminado", "trecho " + alvo); return; }
        if (dist == null) { verif(alvo, "distância entre pontos fixos ≤ máxima", Lrun, null, "m", null, dd.passos.concat(["distância máxima entre pontos fixos/guias sem fonte (" + K.fixos + ") nem do RT"]), null); dd.status = "pendente";
                            ctx.pendencia(K.fixos + "[" + ent.material + "]", "distância máxima entre pontos fixos sem fonte", "trecho " + alvo); }
        else { var okD = Lrun <= dist + TOL; verif(alvo, "distância entre pontos fixos ≤ máxima", Lrun, dist, "m", okD, dd.passos, fDist); if (!okD) { dd.status = "reprovado"; aviso("erro", "reto " + ids.join(" + ") + ": " + fx(Lrun) + " m sem ponto fixo/compensador (máx. " + fx(dist) + " m)", ids, { texto: "inserir ponto fixo intermediário e lira/junta entre eles" }); } }
        if (Math.abs(dL) > 0) {
          if (Sa != null && cE2.ok) {
            var Lp = Math.sqrt(COEF_LIRA * cE2.valor * GPA * (tb.de_mm / 1000) * Math.abs(dL) / 1000 / (Sa * MPA_PA));
            dd.lira = { perna_m: Lp, passos: saPassos.concat(["perna = √(3·E·D·|ΔL|/S_A) = √(3·" + cE2.valor + " GPa·" + fx(tb.de_mm) + " mm·" + fx(Math.abs(dL)) + " mm/" + fx(Sa) + " MPa) = " + fx(Lp) + " m (balanço guiado)"]) };
            var nA = nos[os[0].de] || {}, nB = nos[os[0].para] || {};
            aviso("info", "reto " + ids.join(" + ") + ": " + (dL > 0 ? "dilata" : "contrai") + " " + fx(Math.abs(dL)) + " mm — lira com pernas de " + fx(Lp) + " m (ou junta de expansão do catálogo)", ids,
                  { texto: "inserir lira no reto " + ids.join(" + "), ops: nA.x != null && nB.x != null ? [{ op: "peca", peca: "lira_expansao", sistema: SIS, trecho: alvo, x: (nA.x + nB.x) / 2, y: (num(nA.y, cota(os[0].de)) + num(nB.y, cota(os[0].para))) / 2, z: (nA.z + nB.z) / 2, perna_m: Lp, dn: tb.dn }] : null });
          } else if (mat.barlow) verif(alvo, "lira (balanço guiado)", Math.abs(dL), null, "mm", null, dd.passos.concat(["faixa admissível de deslocamento S_A (f, Sc, Sh) ou E do tubo sem fonte"]), null);
        }
      });
    }

    /* ------------------------------------------------------------ 9. AR COMPRIMIDO: demanda e reservatório */
    if (tipo === "ar" && ent.arComprimido) {
      var AC = ent.arComprimido, eq = arr(AC.equipamentos), passos = [], soma = 0;
      eq.forEach(function (x) { var q = num(x.q_l_min, 0) * num(x.n, 1) * num(x.utilizacao, 1); soma += q; passos.push(x.nome + ": " + fx(x.q_l_min) + " L/min × " + num(x.n, 1) + " × " + fx(num(x.utilizacao, 1)) + " = " + fx(q) + " L/min"); });
      var fs = num(AC.simultaneidade, simult != null ? simult : 1), dem = soma * fs * mult;
      passos.push("Q = Σ × simultaneidade " + fx(fs) + " × (1 + fuga " + fx(fuga || 0) + ") × (1 + reserva " + fx(reserva) + ") = " + fx(dem) + " L/min de ar livre");
      if (AC.simultaneidade == null && simult == null) premissa("simultaneidade do ar comprimido", "1 (todos os equipamentos ao mesmo tempo, lado seguro)", "padrao_motor");
      var arc = out.arComprimido = { demanda_l_min: dem, demanda_l_s: dem / (3600 / 60), passos: passos, reservatorio: null, fuga: null };   /* hid:ok 60 s/min */
      /* fuga aceitável (fonte) contra a declarada */
      var cFg = opcional(K.ar, { parametro: "fuga_aceitavel_frac" }, "valor");
      if (fuga != null && cFg.ok) { var okF = fuga <= cFg.valor; arc.fuga = { declarada: fuga, aceitavel: cFg.valor }; verif("arComprimido", "fuga declarada ≤ aceitável", fuga, cFg.valor, "fração", okF, ["fuga " + fx(fuga * 100) + " % ≤ " + fx(cFg.valor * 100) + " %"], fonteDe(K.ar, "fuga", cFg.linha));
        if (!okF) aviso("aviso", "fuga declarada " + fx(fuga * 100) + " % acima da aceitável " + fx(cFg.valor * 100) + " %", [], { texto: "programa de caça a vazamentos antes de dimensionar o compressor pela fuga" }); }
      var C9 = AC.compressor || {};
      var lsR = tab(K.res, null, "reservatório de ar"), pr = function (n) { var l = (lsR || []).filter(function (x) { return x.parametro === n; })[0]; return l ? num(l.valor, null) : null; };
      var coef = pr("coeficiente"), fmax = pr("fmax_hz");
      /* qc = FAD do COMPRESSOR (Atlas Copco), nunca a demanda calada (REVISAO-IND-SOLAR-FINAIS M2): compressor maior
         que a demanda pede reservatório maior na mesma proporção */
      var qc = num(C9.vazao_l_s, null), pU = num(C9.pDesliga_kPa, null), pL = num(C9.pLiga_kPa, null);
      var T1 = (ambiente_C != null ? ambiente_C : TC) + K0, T0r = num(C9.temperaturaReservatorio_C, null);
      if (T0r == null) { T0r = T1 - K0; premissa("temperatura do ar no reservatório", "= ambiente (" + fx(T0r) + " °C), não informada", "padrao_motor"); }
      if (qc == null) ctx.pendencia("entrada.industrial.arComprimido.compressor.vazao_l_s", "vazão (FAD) do compressor escolhido não informada (catálogo) — o reservatório depende dela, não da demanda (" + fx(arc.demanda_l_s) + " L/s)", "reservatório");
      if (pU == null || pL == null) ctx.pendencia("entrada.industrial.arComprimido.compressor.pLiga/pDesliga", "pressões de liga/desliga (carga/alívio) do compressor não informadas (catálogo)", "reservatório");
      if (coef != null && fmax != null && pU != null && pL != null && qc != null) {
        var V = coef * qc * (pAtm0 / 100) * (T0r + K0) / (fmax * ((pU - pL) / 100) * T1);
        arc.reservatorio = { volume_L: V, passos: ["V = " + coef + "·qc·p1·T0/(fmax·(pU − pL)·T1) = " + coef + "·" + fx(qc) + " L/s·" + fx(pAtm0 / 100, CASAS_V) + " bar·" + fx(T0r + K0) + " K/(" + fmax + " Hz·" + fx((pU - pL) / 100, CASAS_V) + " bar·" + fx(T1) + " K) = " + fx(V, 0) + " L"],
                           fonte: fonteDe(K.res, "volume do reservatório") };
        verif("arComprimido", "volume mínimo do reservatório", V, null, "L", true, arc.reservatorio.passos, arc.reservatorio.fonte);
      } else verif("arComprimido", "volume mínimo do reservatório", null, null, "L", null, ["fórmula do reservatório (" + K.res + "), FAD ou pressões do compressor sem valor"], null);
    }

    /* ------------------------------------------------------------ 10. GÁS: exigências da NBR 15526 */
    if (G15) {
      var Gx = ent.gas || {}, gOut = out.gas = { tipoInstalacao: Gx.tipoInstalacao || null, seguranca: null, estanqueidade: [], passos: [] };
      var lim = function (p) { var c = ctx.consulta(K.g15 + "limites", { parametro: p }, "valor", "NBR 15526"); return c.ok ? { v: num(c.valor, null), f: fonteDe(K.g15 + "limites", c.linha.item, c.linha) } : null; };
      var pRede = lim("pressao_max_rede_kpa"), pUni = lim("pressao_max_unidade_kpa");
      if (pRede && pOrig != null) { var okR = pOrig <= pRede.v + TOL; verif(R.origem, "pressão de operação da rede ≤ máxima (NBR 15526 6.2)", pOrig, pRede.v, "kPa", okR, ["P = " + fx(pOrig) + " kPa ≤ " + pRede.v + " kPa"], pRede.f);
        if (!okR) aviso("erro", "pressão da rede " + fx(pOrig) + " kPa acima de " + pRede.v + " kPa (NBR 15526 só vale até aí)", [], { texto: "regulador de primeiro estágio antes da rede ou projeto pela norma de instalação industrial" }); }
      /* dentro da unidade habitacional: ≤ 7,5 kPa (6.2) */
      var naUnidade = ordem.filter(function (o) { return o.t.dentroUnidade === true || (Gx.dentroUnidade === true && o.t.dentroUnidade !== false); });
      if (pUni) {
        if (!naUnidade.length && Gx.dentroUnidade == null && !ordem.some(function (o) { return o.t.dentroUnidade != null; }))
          verif(R.origem, "pressão dentro da unidade habitacional ≤ máxima (6.2)", null, pUni.v, "kPa", null, ["trechos dentro da unidade não marcados (gas.dentroUnidade ou trecho.dentroUnidade)"], pUni.f);
        naUnidade.forEach(function (o) { var h = hid[o.t.id] || {}; if (h.pIn == null) return; var pm = h.pIn - pAtmNo(o.de), okU = pm <= pUni.v + TOL;
          verif(o.t.id, "pressão dentro da unidade habitacional ≤ máxima (6.2)", pm, pUni.v, "kPa", okU, ["P = " + fx(pm, CASAS_V) + " kPa ≤ " + pUni.v + " kPa"], pUni.f);
          if (!okU) aviso("erro", "trecho " + o.t.id + " dentro da unidade com " + fx(pm) + " kPa (máx. " + pUni.v + ")", [o.t.id], { texto: "regulador de pressão na entrada da unidade (saída ≤ " + pUni.v + " kPa)" }); });
      }
      /* afastamentos (Tabela 1): só com as outras redes do modelo */
      var viz = arr(Gx.vizinhas);
      if (!viz.length) verif(R.origem, "afastamentos de outras redes (Tabela 1)", null, null, "mm", null, ["sem as outras redes do modelo (gas.vizinhas): afastamentos não verificados"], null);
      viz.forEach(function (z) {
        var col = z.situacao === "cruzamento" ? "cruzamento_mm" : "paralelo_mm", c = ctx.consulta(K.g15 + "afastamentos", { elemento: z.elemento }, col, "afastamento " + z.elemento);
        if (!c.ok) { verif(z.trecho, "afastamento de " + z.elemento + " (" + (z.situacao || "paralelo") + ")", num(z.distancia_mm, null), null, "mm", null, [c.motivo + (c.linha && c.linha.nota ? " — " + c.linha.nota : "")], null); return; }
        var okZ = num(z.distancia_mm, -1) >= c.valor;
        verif(z.trecho, "afastamento de " + z.elemento + " (" + (z.situacao || "paralelo") + ") ≥ mínimo (Tabela 1)", num(z.distancia_mm, null), c.valor, "mm", okZ, [fx(z.distancia_mm, 0) + " mm ≥ " + c.valor + " mm"], fonteDe(K.g15 + "afastamentos", "Tabela 1", c.linha), "min");
        if (!okZ) aviso("erro", "trecho " + z.trecho + " a " + fx(z.distancia_mm, 0) + " mm de " + z.elemento + " (mín. " + c.valor + " mm, Tabela 1)", [z.trecho], { texto: "afastar a tubulação de gás ou, no cruzamento, isolar conforme a nota da Tabela 1" });
      });
      /* enterrada (7.2.4) e PE só enterrado fora da projeção */
      var ent24 = function (p) { var c = ctx.consulta(K.g15 + "enterrada", { parametro: p }, "valor", "rede enterrada"); return c.ok ? num(c.valor, null) : null; };
      ordem.forEach(function (o) {
        var t = o.t, fE = fonteDe(K.g15 + "enterrada", "7.2.4");
        if (ent.material === "pead" && !(t.enterrado === true && t.foraProjecao === true)) {
          var pend = t.enterrado === true && t.foraProjecao == null;
          verif(t.id, "PE só enterrado e fora da projeção da edificação (7.2.4)", null, null, "", pend ? null : false, [pend ? "informar se o trecho está fora da projeção da edificação (trecho.foraProjecao)" : "trecho de PE aparente ou sob a projeção"], fE);
          if (!pend) aviso("erro", "trecho " + t.id + " em PE fora da condição da 7.2.4 (só enterrado e fora da projeção)", [t.id], { texto: "trocar por cobre/aço no trecho aparente ou mudar o caminho para fora da projeção" });
        }
        if (t.enterrado !== true) return;
        var pmin = ent24(t.trafego ? "profundidade_com_trafego_m" : "profundidade_sem_trafego_m"), am = ent24("afastamento_utilidades_m");
        if (pmin != null) { var pf = num(t.profundidade_m, null); verif(t.id, "profundidade da rede enterrada ≥ mínima (7.2.4)", pf, pmin, "m", pf == null ? null : pf >= pmin - TOL, [pf == null ? "profundidade não informada" : fx(pf) + " m ≥ " + pmin + " m (" + (t.trafego ? "com" : "sem") + " tráfego)"], fE, "min"); }
        if (am != null) { var af = num(t.afastamentoUtilidades_m, null); verif(t.id, "afastamento enterrado de outras utilidades ≥ mínimo (7.2.4)", af, am, "m", af == null ? null : af >= am - TOL, [af == null ? "afastamento não informado" : fx(af) + " m ≥ " + am + " m"], fE, "min"); }
      });
      /* proibições (7.2.1) */
      var proib = (ctx.linhas(K.g15 + "proibicoes", null, "proibições 7.2.1") || []).map(function (l) { return l.local; });
      if (!ordem.some(function (o) { return o.t.atravessa != null; })) verif(R.origem, "locais proibidos (7.2.1)", null, null, "", null, ["travessias dos trechos não informadas (trecho.atravessa)"], null);
      ordem.forEach(function (o) {
        if (o.t.atravessa == null) return;
        var ruins = arr(o.t.atravessa).filter(function (x) { return proib.indexOf(x) >= 0; });
        verif(o.t.id, "trecho fora de local proibido (7.2.1)", ruins.length, 0, "", !ruins.length, [ruins.length ? "atravessa: " + ruins.join(", ") : "nenhum local proibido"], fonteDe(K.g15 + "proibicoes", "7.2.1"));
        if (ruins.length) aviso("erro", "trecho " + o.t.id + " passa por " + ruins.join(", ") + " (proibido, NBR 15526 7.2.1)", [o.t.id], { texto: "desviar o trecho " + o.t.id + " para fora de " + ruins.join(", ") + " (shaft ventilado ou trecho aparente)" });
      });
      /* válvula de bloqueio por aparelho (7.4) */
      var cDisp = ctx.consulta(K.g15 + "valvulas", { parametro: "dispensa_valvula_aparelho_ate_m" }, "valor", "válvulas 7.4");
      cons.forEach(function (c) {
        if (c.alimenta === "regulador") return;
        var ok = null, ps = [];
        if (c.valvulaBloqueio === true) { ok = true; ps.push("válvula de bloqueio no aparelho"); }
        else if (c.valvulaBloqueio === false && cDisp.ok) { var d = num(c.distanciaValvulaUnidade_m, null); ok = d != null && d <= cDisp.valor; ps.push(d == null ? "sem válvula no aparelho e distância até a válvula da unidade não informada" : "sem válvula no aparelho; " + fx(d) + " m até a válvula da unidade (dispensa até " + cDisp.valor + " m)"); if (d == null) ok = null; }
        else ps.push("válvula de bloqueio do aparelho não informada (consumidor.valvulaBloqueio)");
        verif(c.id, "válvula de bloqueio do aparelho (7.4)", null, null, "", ok, ps, fonteDe(K.g15 + "valvulas", "7.4"));
        if (ok === false) aviso("erro", "aparelho " + c.id + " sem válvula de bloqueio própria a mais de " + cDisp.valor + " m da válvula da unidade (7.4)", [c.id], { texto: "instalar válvula de bloqueio junto ao aparelho " + c.id });
      });
      /* dispositivos de segurança do regulador (Tabelas 2 e 3) */
      var rg = Gx.regulador;
      if (rg) {
        var pe = num(rg.pe_kPa, null), psd = num(rg.ps_kPa, null), seg = gOut.seguranca = { dispositivos: null, acionamento_kPa: null, passos: [] };
        var t2 = (ctx.linhas(K.g15 + "seguranca_entrada", null, "Tabela 2") || []).filter(function (l) { return pe != null && (l.pe_acima_kpa == null || pe > l.pe_acima_kpa) && (l.pe_ate_kpa == null || pe <= l.pe_ate_kpa); })[0];
        var t3 = (ctx.linhas(K.g15 + "seguranca_acionamento", null, "Tabela 3") || []).filter(function (l) { return psd != null && (l.ps_acima_kpa == null || psd > l.ps_acima_kpa) && (l.ps_ate_kpa == null || psd <= l.ps_ate_kpa); })[0];
        if (t2) { seg.dispositivos = t2.dispositivos; seg.passos.push("PE " + fx(pe) + " kPa → " + t2.dispositivos + " dispositivo(s) de segurança (Tabela 2)"); }
        if (t3) { seg.acionamento_kPa = t3.teto_kpa != null ? Math.min(psd * t3.multiplicador, t3.teto_kpa) : psd * t3.multiplicador; seg.passos.push("PS " + fx(psd) + " kPa × " + t3.multiplicador + (t3.teto_kpa != null ? " (até " + t3.teto_kpa + ")" : "") + " = " + fx(seg.acionamento_kPa) + " kPa de acionamento (Tabela 3)"); }
        if (t2 && rg.dispositivos != null) { var okS = num(rg.dispositivos, 0) >= t2.dispositivos; verif("regulador", "dispositivos de segurança do regulador ≥ exigidos (Tabela 2)", num(rg.dispositivos, 0), t2.dispositivos, "", okS, seg.passos, fonteDe(K.g15 + "seguranca_entrada", "Tabela 2"), "min");
          if (!okS) aviso("erro", "regulador com " + rg.dispositivos + " dispositivo(s) de segurança; a Tabela 2 exige " + t2.dispositivos, ["regulador"], { texto: "especificar regulador com bloqueio/alívio por sobrepressão conforme a Tabela 2" }); }
      }
      /* ensaio de estanqueidade (8.1) — vai ao memorial e ao manual */
      var ptrab = num(Gx.pressaoTrabalhoMax_kPa, pOrig);
      (ctx.linhas(K.g15 + "estanqueidade", null, "ensaio 8.1") || []).forEach(function (l) {
        var p = l.etapa === 1 ? Math.max(l.fator_pressao_trabalho * ptrab, num(l.pressao_min_kpa, 0)) : pOrig;
        gOut.estanqueidade.push({ etapa: l.etapa, pressao_kPa: p, tempo_min: l.tempo_min, estabilizacao_min: l.estabilizacao_min, base: l.base,
                                  texto: l.etapa + "ª etapa: " + fx(p) + " kPa por " + l.tempo_min + " min (+ " + l.estabilizacao_min + " min de estabilização) — " + l.base });
      });
      if (avisoConf.length) aviso("aviso", "a fórmula da NBR 15526 deu perda menor que a de Darcy além da tolerância do RT nos trechos " + avisoConf.join(", ") + ": adotada a de Darcy (lado seguro)", avisoConf, { texto: "conferir o diâmetro interno e as conexões desses trechos; manter a perda de Darcy" });
    }

    /* ------------------------------------------------------------ fechamento */
    if (!out.aplicavel && (out.ops.length || out.avisos.some(function (a) { return a.corrigir && a.corrigir.ops; })))
      aviso("info", "ops da rede industrial para o modelo: o biminst desta instalação não tem o sistema \"industrial\"", [], { texto: "aplicar o patch de " + out.patch + " para as ops entrarem no modelo" });
    var sec = out.verificacoes.filter(function (v) { return v.fonte && v.fonte.tipo === "secundaria"; }).length;
    if (sec) aviso("aviso", sec + " verificação(ões) da rede industrial com fonte SECUNDÁRIA (catálogo/manual/literatura): conferir na norma (ASME B31.3, NBR 15526…) antes de assinar", [], { texto: "consultar a norma de origem e trocar a fonte" });
    out.pendencias = minhas;
    out.normas = base.normas();
    var reprov = out.verificacoes.filter(function (v) { return v.status === "reprovado"; }).length, pend = out.verificacoes.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = out.avisos.filter(function (a) { return a.gravidade === "erro"; }).length;
    out.status = reprov || erros ? "reprovado" : (pend || minhas.length || !ordem.length ? "pendente" : "ok");
    out.ok = out.status === "ok" && !out.fixture;
    out.resumo = { trechos: out.trechos.length, consumidores: out.consumidores.length, alterados: out.ops.filter(function (o) { return o.op === "instAlterar"; }).length,
                   reprovadas: reprov, pendentes: pend + minhas.length, erros: erros, metodo: out.metodo };
    return out;
  }

  var HidInd = { VERSAO: 1, SISTEMA: SIS, MATERIAIS: MATERIAIS, calcular: calcular,
                 /* física exposta para teste (verificação IAPWS) e para outros motores */
                 psat: psat, tsat: tsat, pB23: pB23, regiao1: regiao1, regiao2: regiao2, regiao: regiao, if97: if97,
                 viscosidadeAgua: viscosidadeAgua, ar: ar, isotermico: isotermico, K0: K0,
                 perda15526: perda15526, simult15526: simult15526 };
  global.HidInd = HidInd;
  if (typeof module !== "undefined" && module.exports) module.exports = HidInd;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

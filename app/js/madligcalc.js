/* =====================================================================
 * madligcalc.js — LIGAÇÕES de estruturas de madeira (motor PURO, ES5, sem
 * DOM, Node-testável): pinos metálicos (parafuso, barra roscada, tirefond,
 * prego, cavilha) em corte simples e duplo, madeira–madeira e aço–madeira,
 * efeito de grupo, arrancamento de barra colada, resistência do aço do pino.
 *
 * ORIGEM DAS EXPRESSÕES (o memorial cita cada uma):
 *   · Modelo de Johansen (escoamento europeu): EN 1995-1-1:2004+A2:2014,
 *     8.2.2 (madeira–madeira, eq. 8.6 e 8.7) e 8.2.3 (aço–madeira, eq. 8.9
 *     a 8.13). A NBR 7190-1:2022 adota o mesmo modelo (premissa do
 *     PROJ-EST R00, calc_ligacoes.py) — CONFERIR no texto da norma.
 *   · Embutimento fh,0,k = 0,081·(1 − 0,01·d)·ρk — valor que o
 *     calc_ligacoes.py atribui à NBR 7190-1:2022 (o EN 1995 usa 0,082).
 *     Fica como parâmetro `coefFh0` para trocar quando o texto chegar.
 *   · fh,α = fh,0/(k90·sen²α + cos²α), k90 = 1,35 + 0,015d (conífera) ou
 *     0,90 + 0,015d (folhosa) — EN 1995-1-1 eq. 8.31.
 *   · My,Rk = 0,3·fu·d^2,6 (N·mm) — EN 1995-1-1 eq. 8.30.
 *   · nef = mín(n; n^0,9·(a1/13d)^0,25) — EN 1995-1-1 eq. 8.34.
 *   · Barra colada: Rax,k = π·d·ℓad·f1,k, f1,k = 4,0 N/mm² (ℓad ≤ 250 mm)
 *     — DIN 1052:2008 (como no PROJ-EST R00).
 *   · Aço do pino: Fv,Rd = 0,6·fub·As/γM2; Ft,Rd = 0,9·fub·As/γM2,
 *     γM2 = 1,25 — EN 1993-1-8 Tab. 3.4 (inox A4-70: fub 700, ISO 3506-1).
 *   · Rd = kmod·Rk/γlig, γlig = 1,40 (NBR 7190-1:2022, segundo o R00).
 *   ⚠ Efeito de corda (Fax,Rk/4) DESPREZADO por padrão, a favor da
 *     segurança, como no emitido; `corda: true` liga quando houver Fax,Rk
 *     de catálogo (ETA).
 * Teste: node tools/test-mad-lig.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ML = {};
  var PAR = { coefFh0: 0.081, gamaLig: 1.40, gamaM2: 1.25,
    fonte: "EN 1995-1-1:2004+A2:2014 8.2–8.5 (modelo adotado pela NBR 7190-1:2022 — conferir); γlig 1,40" };
  ML.PAR = PAR;

  /* área resistente da rosca (mm²) — ISO 898-1 / EN 1993-1-8 */
  ML.AS = { 8: 36.6, 10: 58.0, 12: 84.3, 16: 157.0, 20: 245.0, 24: 353.0 };

  ML.fh0 = function (d, rhoK) { return PAR.coefFh0 * (1 - 0.01 * d) * rhoK; };
  ML.k90 = function (d, folhosa) { return (folhosa ? 0.90 : 1.35) + 0.015 * d; };
  ML.fhAlfa = function (d, rhoK, alfaGraus, folhosa) {
    var a = alfaGraus * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    return ML.fh0(d, rhoK) / (ML.k90(d, folhosa !== false) * s * s + c * c);
  };
  ML.myRk = function (d, fu) { return 0.3 * fu * Math.pow(d, 2.6); };
  ML.nef = function (n, a1, d) { return Math.min(n, Math.pow(n, 0.9) * Math.pow(a1 / (13 * d), 0.25)); };

  function minModo(m) {
    var k = null;
    Object.keys(m).forEach(function (x) { if (k == null || m[x] < m[k]) k = x; });
    return { Rk: m[k], modo: k, modos: m };
  }

  /** madeira–madeira, corte simples (EN 1995-1-1 eq. 8.6), N por pino */
  ML.corteSimples = function (fh1, fh2, t1, t2, d, My, fax) {
    var b = fh2 / fh1, r = t2 / t1, cord = (fax || 0) / 4;
    return minModo({
      a: fh1 * t1 * d,
      b: fh2 * t2 * d,
      c: fh1 * t1 * d / (1 + b) * (Math.sqrt(b + 2 * b * b * (1 + r + r * r) + b * b * b * r * r) - b * (1 + r)) + cord,
      d: 1.05 * fh1 * t1 * d / (2 + b) * (Math.sqrt(2 * b * (1 + b) + 4 * b * (2 + b) * My / (fh1 * d * t1 * t1)) - b) + cord,
      e: 1.05 * fh1 * t2 * d / (1 + 2 * b) * (Math.sqrt(2 * b * b * (1 + b) + 4 * b * (1 + 2 * b) * My / (fh1 * d * t2 * t2)) - b) + cord,
      f: 1.15 * Math.sqrt(2 * b / (1 + b)) * Math.sqrt(2 * My * fh1 * d) + cord
    });
  };

  /** madeira–madeira, corte duplo (EN 1995-1-1 eq. 8.7), N POR PLANO de corte */
  ML.corteDuplo = function (fh1, fh2, t1, t2, d, My, fax) {
    var b = fh2 / fh1, cord = (fax || 0) / 4;
    return minModo({
      g: fh1 * t1 * d,
      h: 0.5 * fh2 * t2 * d,
      j: 1.05 * fh1 * t1 * d / (2 + b) * (Math.sqrt(2 * b * (1 + b) + 4 * b * (2 + b) * My / (fh1 * d * t1 * t1)) - b) + cord,
      k: 1.15 * Math.sqrt(2 * b / (1 + b)) * Math.sqrt(2 * My * fh1 * d) + cord
    });
  };

  /** aço–madeira, corte simples. Chapa fina (t ≤ 0,5d) eq. 8.9; grossa (t ≥ d) eq. 8.10; entre as duas, interpolação linear (8.2.3(1)) */
  ML.acoMadeiraSimples = function (fh, t1, d, My, tChapa, fax) {
    var cord = (fax || 0) / 4;
    var fina = minModo({ a: 0.4 * fh * t1 * d, b: 1.15 * Math.sqrt(2 * My * fh * d) + cord });
    var grossa = minModo({
      c: fh * t1 * d,
      d: fh * t1 * d * (Math.sqrt(2 + 4 * My / (fh * d * t1 * t1)) - 1) + cord,
      e: 2.3 * Math.sqrt(My * fh * d) + cord
    });
    if (tChapa <= 0.5 * d) return { Rk: fina.Rk, modo: fina.modo, chapa: "fina", modos: fina.modos };
    if (tChapa >= d) return { Rk: grossa.Rk, modo: grossa.modo, chapa: "grossa", modos: grossa.modos };
    var w = (tChapa - 0.5 * d) / (0.5 * d);
    return { Rk: fina.Rk + w * (grossa.Rk - fina.Rk), modo: fina.modo + "/" + grossa.modo, chapa: "intermediária", modos: { fina: fina.Rk, grossa: grossa.Rk } };
  };

  /** aço–madeira, corte duplo com chapa de aço CENTRAL (eq. 8.11), N por plano */
  ML.acoCentralDuplo = function (fh, t1, d, My, fax) {
    var cord = (fax || 0) / 4;
    return minModo({
      f: fh * t1 * d,
      g: fh * t1 * d * (Math.sqrt(2 + 4 * My / (fh * d * t1 * t1)) - 1) + cord,
      h: 2.3 * Math.sqrt(My * fh * d) + cord
    });
  };

  /* ------------------------------------------------------------------
   * PARAFUSOS DE CATÁLOGO COM ETA (Klimas ETA-18/0817, Eurotec ETA-11/0024…)
   * Os parâmetros (My,k, fax,k, fhead,k, ftens,k, ρa) vêm do catálogo
   * (MadCatalogo). Fórmulas do EN 1995-1-1 com as regras da ETA:
   *   · embutimento SEM pré-furo como prego, para TODOS os diâmetros:
   *     fh,k = 0,082·ρk·d^−0,3 (EN 1995 eq. 8.16; é o que reproduz as tabelas
   *     da Klimas, inclusive d = 8 e 10 — a regra "d > 6 = parafuso" do
   *     EN 1995 8.7.1 NÃO vale para estes parafusos);
   *   · arrancamento: Fax,k = fax,k·d·ℓef·(ρk/ρa)^0,8 (sem kd; ângulo 90°);
   *   · passagem da cabeça: Fhead,k = fhead,k·dk²·(ρk/ρa)^0,8;
   *   · efeito de corda Fax,Rk/4 limitado a 100 % da parcela de Johansen
   *     (parafusos — EN 1995 8.2.2(2)), Fax,Rk = mín(arrancamento; cabeça).
   * ------------------------------------------------------------------ */
  ML.fhPrego = function (d, rhoK) { return 0.082 * rhoK * Math.pow(d, -0.3); };
  ML.parafusoAxial = function (o) {
    var r = Math.pow(o.rhoK / o.rhoA, 0.8), a = (o.alfa == null ? 90 : o.alfa) * Math.PI / 180;
    var ang = 1.2 * Math.cos(a) * Math.cos(a) + Math.sin(a) * Math.sin(a);
    var arr = o.fax * o.d * o.lef * r / ang, cab = o.fhead != null && o.dk != null ? o.fhead * o.dk * o.dk * r : Infinity;
    return { arrancamento: arr, cabeca: cab, Rk: Math.min(arr, cab, o.ftens != null ? o.ftens * 1000 : Infinity) };
  };
  function cordaLimitada(sem, com, semCorda) {
    var m = {};
    Object.keys(com.modos).forEach(function (k) { m[k] = semCorda.indexOf(k) >= 0 ? sem.modos[k] : Math.min(com.modos[k], 2 * sem.modos[k]); });
    return minModo(m);
  }
  /** madeira–madeira, corte simples, parafuso de ETA: t1 = parte do lado da cabeça, t2 = penetração da ponta */
  ML.parafusoLateralMM = function (o) {
    var fh = ML.fhPrego(o.d, o.rhoK), Fax = o.Fax || 0;
    var sem = ML.corteSimples(fh, fh, o.t1, o.t2, o.d, o.My, 0), com = ML.corteSimples(fh, fh, o.t1, o.t2, o.d, o.My, Fax);
    return cordaLimitada(sem, com, ["a", "b"]);
  };
  /** aço–madeira, corte simples, parafuso de ETA, chapa fina (t ≤ 0,5d) ou grossa (t ≥ d) */
  ML.parafusoLateralAM = function (o) {
    var fh = ML.fhPrego(o.d, o.rhoK), Fax = o.Fax || 0, cord = Fax / 4;
    if (o.chapa === "fina") {
      var a = 0.4 * fh * o.t1 * o.d, b0 = 1.15 * Math.sqrt(2 * o.My * fh * o.d);
      return minModo({ a: a, b: Math.min(b0 + cord, 2 * b0) });
    }
    var c = fh * o.t1 * o.d, d0 = c * (Math.sqrt(2 + 4 * o.My / (fh * o.d * o.t1 * o.t1)) - 1), e0 = 2.3 * Math.sqrt(o.My * fh * o.d);
    return minModo({ c: c, d: Math.min(d0 + cord, 2 * d0), e: Math.min(e0 + cord, 2 * e0) });
  };

  /**
   * Parafuso de catálogo com ETA — resistências características de UM parafuso (N).
   * o = { d, Lw (comprimento), Lg (rosca), tfix (peça do lado da cabeça, madeira–madeira),
   *       uso: "madeira-madeira" | "chapa-fina" | "chapa-grossa", My, fax, fhead, dk, rhoK, rhoA }
   * Regras que reproduzem as tabelas da Klimas (tools/test-mad-lig.js [3]):
   *   madeira–madeira: t1 = tfix, t2 = Lw − tfix, ℓef = mín(Lg, t2), Fax = mín(arrancamento, cabeça);
   *   chapa: madeira = Lw − t_chapa (0,5d na fina, d na grossa), ℓef = mín(Lg, madeira),
   *          Fax = só arrancamento (a cabeça apoia no aço).
   */
  ML.parafusoETA = function (o) {
    var rhoA = o.rhoA || 350;
    if (o.uso === "madeira-madeira") {
      var t2 = o.Lw - o.tfix, lef = Math.min(o.Lg, t2);
      var ax = ML.parafusoAxial({ fax: o.fax, d: o.d, lef: lef, rhoK: o.rhoK, rhoA: rhoA, fhead: o.fhead, dk: o.dk });
      var lat = ML.parafusoLateralMM({ d: o.d, t1: o.tfix, t2: t2, My: o.My, rhoK: o.rhoK, Fax: Math.min(ax.arrancamento, ax.cabeca) });
      return { Rk: lat.Rk, modo: lat.modo, Rax: ax.arrancamento, Rhead: ax.cabeca, lef: lef };
    }
    var fina = o.uso === "chapa-fina", tm = o.Lw - (fina ? 0.5 : 1.0) * o.d, lef2 = Math.min(o.Lg, tm);
    var ax2 = ML.parafusoAxial({ fax: o.fax, d: o.d, lef: lef2, rhoK: o.rhoK, rhoA: rhoA });
    var lat2 = ML.parafusoLateralAM({ d: o.d, t1: tm, My: o.My, rhoK: o.rhoK, Fax: ax2.arrancamento, chapa: fina ? "fina" : "grossa" });
    return { Rk: lat2.Rk, modo: lat2.modo, Rax: ax2.arrancamento, lef: lef2 };
  };

  /** Rd = kmod·Rk/γlig */
  ML.rd = function (Rk, kmod) { return kmod * Rk / PAR.gamaLig; };

  /** barra roscada/parafuso: resistências do aço (kN) */
  ML.acoPino = function (d, fub) {
    var As = ML.AS[d];
    if (!As) throw new Error("madligcalc: área resistente desconhecida para d = " + d);
    return { FvRd: 0.6 * fub * As / PAR.gamaM2 / 1000, FtRd: 0.9 * fub * As / PAR.gamaM2 / 1000, As: As };
  };

  /** barra colada com epóxi (DIN 1052:2008): Rax,k em N */
  ML.barraColadaRaxK = function (d, lad) {
    if (lad > 250) throw new Error("madligcalc: f1,k = 4,0 N/mm² só vale para ℓad ≤ 250 mm");
    return Math.PI * d * lad * 4.0;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ML;
  else global.MadLigCalc = ML;
})(typeof window !== "undefined" ? window : this);

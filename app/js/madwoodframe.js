/* =====================================================================
 * madwoodframe.js — PAINÉIS DE WOOD FRAME COMO CONTRAVENTAMENTO de
 * estruturas de madeira (motor PURO, ES5, sem DOM, Node-testável).
 * Port de paineis_travamento.py (quiosque de referência, 30/09/2026): mesma saída
 * do Python, com as premissas como PARÂMETROS (default = Python).
 *
 * ORIGEM / PORQUÊ DE CADA PREMISSA
 *   · Trechos que contam: EN 1995-1-1:2004 9.2.4.2, método A — só trecho de
 *     ALTURA INTEIRA, sem abertura, com largura b ≥ h/4; fator de largura
 *     c = 1 se b ≥ h/2, senão b/(h/2).
 *   · Resistência: Fv,Rd = Σ Ff,Rd·bi·ci/s (9.2.4.2 (3)); duas faces de chapa
 *     do mesmo tipo SOMAM (9.2.4.2 (7)). Ff,Rd = kmod·Fv,Rk/γM, Fv,Rk do
 *     prego por Johansen (8.2.2, corte simples chapa × madeira, 6 modos —
 *     reutiliza MadLigCalc.corteSimples, fórmula idêntica), SEM efeito de
 *     corda (a favor da segurança).
 *   · Embutimento: madeira fh = 0,082·ρk·d^−0,3 (8.5.1); chapa de
 *     compensado/OSB fh = mín(0,11·ρk·d^−0,3 ; 65·d^−0,7·t^0,1) — o menor.
 *     My,Rk = 0,3·fu·d^2,6 (8.30), fu = 600 MPa (valor usual, 8.3.1.1).
 *   · Rigidez (modelo de análise): chapa rígida girando sobre a pregação do
 *     perímetro (energia mínima),
 *         Kprego = Kser·Sx2·Sy2/((Sx2+Sy2)·h²),
 *         Sx2 = b²/s·(b/6 + h/2),  Sy2 = h²/s·(b/2 + h/6),
 *     em SÉRIE com o cisalhamento da chapa G·t·b/h. Kser do prego =
 *     ρm^1,5·d^0,8/30 (EN 1995 tab. 7.1). Redução de 50 % pela folga das
 *     ancoragens e das ligações ao pórtico (desconhecidas — premissa).
 *   · Trecho = chapas de bChapa lado a lado (a última parcial, se > 5 cm);
 *     faces = chapas em paralelo.
 *   · Diagonal equivalente (X de 2 diagonais articuladas entre o pé do
 *     pilar e a cobertura): K_vão = K_painel·hParede/hBay (deformação de
 *     corte); E·A = K_vão·Ld/(2·cos²θ).
 *   · Reforço por painel: [faces, s do perímetro, (prego d,l)?]; sem prego
 *     próprio usa pregoRef.
 *
 * PREMISSAS DO RT — o catálogo não as fornece; ficam explícitas aqui:
 *   gChapa 500 MPa (compensado; OSB/3 ≈ 1080 — adotado o menor), rhoKChapa
 *   400 kg/m³ (compensado estrutural), rhoK/rhoM madeira 350/420 (Pinus como
 *   C24), kmod 0,90 (vento, curta duração, classe de serviço 2), γM 1,30.
 *   EVOPLY_12 só troca a espessura (12 mm) — NÃO inventa G nem ρk.
 *
 * ARREDONDAMENTO: a saída de calcular() replica os round() do Python
 * (pyRound: meio-para-o-par); os valores sem arredondar ficam em `bruto`.
 *
 * Teste: node tools/test-mad-woodframe.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var LIG = (typeof require === "function") ? require("./madligcalc.js") : global.MadLigCalc;
  var WF = {};

  /* ---- round() / %.nf do Python (meio-para-o-par no valor exato do double) ---- */
  function pyFixed(x, n) {
    var neg = x < 0 || (x === 0 && 1 / x < 0);
    var ax = Math.abs(x);
    var s = ax.toFixed(n);
    var ext = ax.toFixed(Math.min(100, n + 40));
    var ponto = ext.indexOf(".");
    var cauda = ext.slice(ponto + 1).slice(n);
    if (cauda.length && cauda.charAt(0) === "5" && /^50*$/.test(cauda)) {
      var t = n === 0 ? ext.slice(0, ponto) : ext.slice(0, ponto + 1 + n);
      if ((parseInt(t.charAt(t.length - 1), 10) % 2) === 0) { s = t; }
    }
    return (neg ? "-" : "") + s;
  }
  function pyRound(x, n) { return x === 0 ? x : parseFloat(pyFixed(x, n)); }
  /* a // b do Python para a, b > 0 (floor do quociente exato, não do arredondado) */
  function pyFloorDiv(a, b) {
    var mod = a % b, div = (a - mod) / b, fl = Math.floor(div);
    if (div - fl > 0.5) { fl += 1; }
    return fl;
  }
  WF.pyRound = pyRound;

  /* ---- premissas (default = paineis_travamento.py) ---- */
  var PREMISSAS = {
    hParede: 2.80,        // m — guia inferior ao topo da guia superior
    s: 0.16,              // m — espaçamento dos pregos da chapa (20 pregos/m² ≈ 0,16 m)
    bChapa: 1.20,         // m — largura da chapa (montantes a 0,60 m)
    tChapa: 11.0,         // mm
    gChapa: 500.0,        // MPa — cisalhamento no plano da chapa (premissa do RT)
    d: 2.4, lp: 38.1,     // mm — prego 15×18
    fu: 600.0,            // MPa — aço do prego
    rhoKMad: 350.0, rhoMMad: 420.0,   // kg/m³
    rhoKChapa: 400.0,     // kg/m³ (premissa do RT)
    kmod: 0.90, gamaM: 1.30,
    redRigidez: 0.50,
    zBase: -0.385, zTopo: 3.15,       // m — contraventamento do modelo (pé do pilar → cobertura inferior)
    aSecao: 0.10 * 0.10,              // m² — seção fictícia da diagonal equivalente
    pregoRef: [2.7, 48.3],            // mm — 16×21
    reforco: {                        // painel: [faces, s_perímetro_m, (prego [d, l])?]
      "01": [2, 0.050],
      "11": [2, 0.040, [3.4, 55.2]],
      "09": [2, 0.075],
      "02": [2, 0.075],
      "10": [2, 0.075]
    },
    fonte: "paineis_travamento.py (quiosque de referência, 30/09/2026) — EN 1995-1-1 9.2.4.2 e 8.2.2"
  };

  function copiaReforco(r) {
    var o = {};
    Object.keys(r || {}).forEach(function (k) {
      o[k] = r[k].map(function (v) { return Array.isArray(v) ? v.slice() : v; });
    });
    return o;
  }
  /** premissas completas = default ← o (cópia; o pode ser parcial) */
  function mescla(base, o) {
    var r = {};
    Object.keys(base).forEach(function (k) { r[k] = base[k]; });
    Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; });
    r.reforco = copiaReforco(r.reforco);
    r.pregoRef = r.pregoRef.slice();
    return r;
  }
  WF.PREMISSAS = PREMISSAS;
  WF.premissas = function (o) { return mescla(PREMISSAS, o); };

  /* Chapa do orçamento: Plywood Evoply 12 mm (Nibra Pro 2025, p. 2): 1,20 × 2,40 m,
   * 19 kg, montantes ≤ 60 cm em parede. O catálogo NÃO informa G nem ρk: ficam os
   * valores do Python como premissa do RT. ρ médio do catálogo é só informação. */
  WF.EVOPLY_12 = mescla(PREMISSAS, {
    tChapa: 12.0,
    fonte: "Plywood Evoply 12 mm — Nibra Pro 2025 p. 2; G e ρk da chapa: premissa do RT (catálogo não informa)",
    catalogo: {
      produto: "Plywood Evoply 12 mm", fonte: "Nibra Pro 2025, p. 2",
      largura_m: 1.20, altura_m: 2.40, espessura_mm: 12, massa_kg: 19, montantesMaxCm: 60,
      rhoMedioKgM3: 19 / (1.2 * 2.4 * 0.012),           // ≈ 549,8 — SÓ informação, não entra no cálculo
      gChapa: "premissa do RT, catálogo não informa (500 MPa, valor do Python)",
      rhoKChapa: "premissa do RT, catálogo não informa (400 kg/m³, valor do Python)"
    }
  });

  /* ---- prego: Johansen corte simples chapa × madeira ---- */
  /** o = premissas (+ d, lp do prego); Ff,Rd (N), Kser (N/mm) e os 6 modos */
  WF.prego = function (o) {
    var P = mescla(PREMISSAS, o), d = P.d, lp = P.lp;
    var t1 = P.tChapa, t2 = lp - P.tChapa;
    if (!(t2 > 0)) { throw new Error("madwoodframe: prego de " + lp + " mm não atravessa a chapa de " + P.tChapa + " mm"); }
    var fh1 = Math.min(0.11 * P.rhoKChapa * Math.pow(d, -0.3), 65 * Math.pow(d, -0.7) * Math.pow(P.tChapa, 0.1));
    var fh2 = 0.082 * P.rhoKMad * Math.pow(d, -0.3);
    var My = LIG.myRk(d, P.fu);
    var cs = LIG.corteSimples(fh1, fh2, t1, t2, d, My, 0);          // sem corda (a favor)
    var m = ["a", "b", "c", "d", "e", "f"].map(function (k) { return cs.modos[k]; });
    var FvRk = Math.min.apply(null, m);
    return { fh1: fh1, fh2: fh2, My: My, modos: m, modo: cs.modo, FvRk: FvRk,
             FfRd: P.kmod * FvRk / P.gamaM, Kser: kser(P, d) };
  };
  function kser(P, d) { return Math.pow(P.rhoMMad, 1.5) * Math.pow(d, 0.8) / 30.0; }
  WF.kser = function (o, d) { var P = mescla(PREMISSAS, o); return kser(P, d == null ? P.d : d); };

  /* ---- rigidez ---- */
  function kChapa(P, b, h, s, ks) {
    var sx2 = b * b / s * (b / 6 + h / 2);
    var sy2 = h * h / s * (b / 2 + h / 6);
    var kp = ks * sx2 * sy2 / ((sx2 + sy2) * h * h);              // N/mm (b, h em m se cancelam)
    var kg = P.gChapa * P.tChapa * (b * 1000) / (h * 1000);        // N/mm
    return 1.0 / (1.0 / kp + 1.0 / kg);
  }
  /** rigidez (N/mm) de uma chapa b × h. opc: { h, s, kser } */
  WF.kChapa = function (b, o, opc) {
    var P = mescla(PREMISSAS, o); opc = opc || {};
    return kChapa(P, b, opc.h == null ? P.hParede : opc.h, opc.s == null ? P.s : opc.s, opc.kser == null ? kser(P, P.d) : opc.kser);
  };
  function kTrecho(P, b, h, s, faces, ks) {
    var n = pyFloorDiv(b, P.bChapa), resto = b - n * P.bChapa;
    var k = n * kChapa(P, P.bChapa, h, s, ks);
    if (resto > 0.05) { k += kChapa(P, resto, h, s, ks); }
    return k * P.redRigidez * faces;
  }
  /** rigidez (N/mm = kN/m) de um trecho de largura b. opc: { h, s, faces, kser } */
  WF.kTrecho = function (b, o, opc) {
    var P = mescla(PREMISSAS, o); opc = opc || {};
    return kTrecho(P, b, opc.h == null ? P.hParede : opc.h, opc.s == null ? P.s : opc.s,
                   opc.faces == null ? 1 : opc.faces, opc.kser == null ? kser(P, P.d) : opc.kser);
  };

  /* ---- geometria: trechos livres entre aberturas ---- */
  /** [[de, ate]...] dos trechos de altura inteira de um painel de extensão [de, ate] com aberturas [[a, b]...] */
  WF.trechosLivres = function (de, ate, aberturas) {
    var ab = (aberturas || []).map(function (x) { return [x[0], x[1]]; });
    ab.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    var tr = [], cur = de;
    ab.forEach(function (x) {
      if (x[0] - cur > 1e-3) { tr.push([cur, x[0]]); }
      cur = Math.max(cur, x[1]);
    });
    if (ate - cur > 1e-3) { tr.push([cur, ate]); }
    return tr;
  };

  /* ---- avaliação de um painel (resistência e rigidez, sem e com reforço) ---- */
  function avaliar(painel, P, cache) {
    var k = painel.painel;
    var ref = (k != null && P.reforco[k]) ? P.reforco[k] : null;
    var fac = ref ? ref[0] : 1, sR = ref ? ref[1] : P.s;
    var PG = cache.pg, pr = ref ? (ref.length > 2 ? cache.prego(ref[2]) : cache.pgRef) : PG;
    var tr = painel.trechos || WF.trechosLivres(painel.de, painel.ate, painel.aberturas);
    var bMin = P.hParede / 4, b0 = P.hParede / 2;
    var conta = [], FvRd = 0, K = 0, FvRdR = 0, KR = 0, bruto = [];
    tr.forEach(function (t) {
      var a = t[0], b = t[1], bi = b - a;
      if (bi + 1e-9 < bMin) { return; }
      var c = bi >= b0 ? 1.0 : bi / b0;
      var f = PG.FfRd * (bi * 1000) * c / (P.s * 1000) / 1000.0;               // kN
      var fr = fac * pr.FfRd * (bi * 1000) * c / (sR * 1000) / 1000.0;
      conta.push({ de: a, ate: b, b: pyRound(bi, 3), c: pyRound(c, 3), FvRd_kN: pyRound(f, 2), FvRd_reforco_kN: pyRound(fr, 2) });
      bruto.push({ b: bi, c: c, FvRd_kN: f, FvRd_reforco_kN: fr });
      FvRd += f; FvRdR += fr;
      K += kTrecho(P, bi, P.hParede, P.s, 1, cache.pg.Kser);
      KR += kTrecho(P, bi, P.hParede, sR, fac, pr.Kser);
    });
    return { conta: conta, bruto: bruto, FvRd: FvRd, K: K, FvRdR: FvRdR, KR: KR, ref: ref, faces: fac, sR: sR };
  }
  function cacheDe(P) {
    var c = {};
    c.pg = WF.prego(P);
    c.pgRef = WF.prego(mescla(P, { d: P.pregoRef[0], lp: P.pregoRef[1] }));
    c.prego = function (dl) { return WF.prego(mescla(P, { d: dl[0], lp: dl[1] })); };
    return c;
  }

  /** trechos que contam (EN 1995 9.2.4.2 método A): [{de, ate, b, c, FvRd_kN, FvRd_reforco_kN}] */
  WF.trechos = function (painel, o) {
    var P = mescla(PREMISSAS, o);
    return avaliar(painel, P, cacheDe(P)).conta;
  };
  /** { FvRd_kN, reforco: {faces, s_m, FvRd_kN} | null, bruto } — Fv,Rd do painel (kN) */
  WF.resistencia = function (painel, o) {
    var P = mescla(PREMISSAS, o), r = avaliar(painel, P, cacheDe(P));
    return { FvRd_kN: pyRound(r.FvRd, 2), trechos: r.conta,
             reforco: r.ref ? { faces: r.faces, s_m: r.sR, FvRd_kN: pyRound(r.FvRdR, 2) } : null,
             bruto: { FvRd_kN: r.FvRd, FvRd_reforco_kN: r.ref ? r.FvRdR : null } };
  };
  /** { K_kN_m, reforco: {K_kN_m} | null, bruto } — rigidez horizontal do painel (N/mm = kN/m) */
  WF.rigidez = function (painel, o) {
    var P = mescla(PREMISSAS, o), r = avaliar(painel, P, cacheDe(P));
    return { K_kN_m: pyRound(r.K, 1), reforco: r.ref ? { faces: r.faces, s_m: r.sR, K_kN_m: pyRound(r.KR, 1) } : null,
             bruto: { K_kN_m: r.K, K_reforco_kN_m: r.ref ? r.KR : null } };
  };

  /** diagonal equivalente de um vão: K do painel (kN/m) entre os pés a, b ([x,y] m). */
  WF.diagonalEquivalente = function (Kpainel, a, b, o) {
    var P = mescla(PREMISSAS, o), hBay = P.zTopo - P.zBase;
    var Bx = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    var dz = P.zTopo - P.zBase;
    var Ld = Math.sqrt(Bx * Bx + dz * dz), cos = Bx / Ld;
    var Kbay = Kpainel * P.hParede / hBay;
    var EA = Kbay * Ld / (2 * cos * cos);                        // kN
    return { vao_m: Bx, diag_m: Ld, K_vao_kN_m: Kbay, EA_kN: EA, E_equiv_MPa: EA / P.aSecao / 1000.0 };
  };

  /** painéis: objeto {chave: painel} ou lista; planos: [{nome, painel, a:[x,y], b:[x,y]}] (opcional).
   *  Saída = a do paineis_travamento.json (campos e arredondamentos do Python) + `bruto`. */
  WF.calcular = function (paineis, premissas, planos) {
    var P = mescla(PREMISSAS, premissas), cache = cacheDe(P), hBay = P.zTopo - P.zBase;
    var lista = Array.isArray(paineis) ? paineis : Object.keys(paineis).map(function (k) {
      var p = paineis[k];
      if (p.painel == null) {
        var c = {}; Object.keys(p).forEach(function (x) { c[x] = p[x]; });
        c.painel = k; p = c;
      }
      return p;
    });
    var out = {}, brutos = {};
    lista.forEach(function (p) {
      var r = avaliar(p, P, cache), q = {};
      Object.keys(p).forEach(function (k) { q[k] = p[k]; });
      q.trechos = p.trechos || WF.trechosLivres(p.de, p.ate, p.aberturas);
      q.trechos_que_contam = r.conta;
      q.FvRd_kN = pyRound(r.FvRd, 2);
      q.K_kN_m = pyRound(r.K, 1);
      q.reforco = r.ref ? { faces: r.faces, s_m: r.sR, FvRd_kN: pyRound(r.FvRdR, 2), K_kN_m: pyRound(r.KR, 1) } : null;
      out[p.painel] = q;
      brutos[p.painel] = { trechos: r.bruto, FvRd_kN: r.FvRd, K_kN_m: r.K, FvRd_reforco_kN: r.FvRdR, K_reforco_kN_m: r.KR };
    });
    var pl = [], diag = [], EAmin = null;
    (planos || []).forEach(function (pn) {
      var Pn = out[pn.painel];
      var g = WF.diagonalEquivalente(Pn.K_kN_m, pn.a, pn.b, P);
      var Pr = Pn.reforco || { K_kN_m: Pn.K_kN_m, FvRd_kN: Pn.FvRd_kN };
      var gr = WF.diagonalEquivalente(Pr.K_kN_m, pn.a, pn.b, P);
      pl.push({ plano: pn.nome, painel: pn.painel, pe_A: pn.a, pe_B: pn.b, vao_m: pyRound(g.vao_m, 3), diag_m: pyRound(g.diag_m, 3),
                K_painel_kN_m: Pn.K_kN_m, K_vao_kN_m: pyRound(g.K_vao_kN_m, 1), EA_diag_kN: pyRound(g.EA_kN, 0),
                E_equiv_MPa: pyRound(g.E_equiv_MPa, 0), FvRd_kN: Pn.FvRd_kN,
                reforco: !!Pn.reforco, FvRd_reforco_kN: Pr.FvRd_kN, K_vao_reforco_kN_m: pyRound(gr.K_vao_kN_m, 1),
                EA_diag_reforco_kN: pyRound(gr.EA_kN, 0), A_cype_cm2_E290: pyRound(gr.EA_kN / (290.0 * 1000) * 1e4, 1) });
      diag.push({ i: [pn.a[0], pn.a[1], P.zBase], j: [pn.b[0], pn.b[1], P.zTopo], plano: pn.nome });
      diag.push({ i: [pn.b[0], pn.b[1], P.zBase], j: [pn.a[0], pn.a[1], P.zTopo], plano: pn.nome });
    });
    pl.forEach(function (x) { if (EAmin == null || x.E_equiv_MPa < EAmin) { EAmin = x.E_equiv_MPa; } });
    var PG = cache.pg, PR = cache.pgRef, rf = {};
    Object.keys(P.reforco).forEach(function (k) {
      var v = P.reforco[k];
      rf[k] = { faces: v[0], s_m: v[1], prego_mm: v.length > 2 ? v[2].slice() : P.pregoRef.slice() };
    });
    function r1(x) { return pyRound(x, 1); }
    return {
      premissas: { h_parede_m: P.hParede, s_pregos_m: P.s, chapa_mm: P.tChapa, G_chapa_MPa: P.gChapa, prego_mm: [P.d, P.lp],
                   rho_k_madeira: P.rhoKMad, rho_m_madeira: P.rhoMMad, rho_k_chapa: P.rhoKChapa, kmod: P.kmod, gama_M: P.gamaM,
                   reducao_rigidez: P.redRigidez, altura_contraventamento_modelo_m: hBay, secao_diagonal_m2: P.aSecao,
                   reforco: rf, prego_reforco_mm: P.pregoRef.slice() },
      prego: { fh1_MPa: pyRound(PG.fh1, 2), fh2_MPa: pyRound(PG.fh2, 2), My_Nmm: r1(PG.My), modos_N: PG.modos.map(r1),
               FvRk_N: r1(PG.FvRk), FfRd_N: r1(PG.FfRd), Kser_N_mm: r1(PG.Kser) },
      prego_reforco: { d_mm: P.pregoRef[0], l_mm: P.pregoRef[1], modos_N: PR.modos.map(r1),
                       FvRk_N: r1(PR.FvRk), FfRd_N: r1(PR.FfRd), Kser_N_mm: r1(PR.Kser) },
      k_chapa_1200_N_mm: r1(kChapa(P, P.bChapa, P.hParede, P.s, PG.Kser)),
      paineis: out, planos: pl, E_generico_MPa: EAmin, diagonais: diag,
      bruto: { prego: PG, pregoReforco: PR, paineis: brutos }
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = WF;
  else global.MadWoodFrame = WF;
})(typeof window !== "undefined" ? window : this);

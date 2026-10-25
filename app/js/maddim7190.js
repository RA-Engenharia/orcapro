/* =====================================================================
 * maddim7190.js — VERIFICAÇÕES de peças de madeira (motor PURO, ES5, sem
 * DOM, Node-testável). Cada verificação devolve { eta, ok, passos[] }, e
 * `passos` é o texto do memorial (fórmula → números → resultado), como o
 * acodim8800.js da Metálica.
 *
 * O PERFIL de cálculo (MadMateriais.perfil) decide os coeficientes. Hoje o
 * único completo é QUIO_R03_PISO (o que o PROJ-EST R03 usou, NBR 7190:1997);
 * o da 7190-1:2022 entra quando os valores tiverem fonte.
 *
 * vigaFletida() é a MESMA conta do verificar() de calc_piso_v18.py:
 *   Md = γ·máx|MG + MQ|          (γG = γQ, como no cálculo emitido)
 *   Vd = γ·máx(|VG| + |VQ|)       (|V| máximo por nó, somado)
 *   σMd = Md/W ≤ fmd  (no perfil 1997: fmd = fc0d, borda comprimida)
 *   τd = 1,5·Vd/(b·h) ≤ fvd
 *   flecha final = (wG + ψ2·wQ)·(1 + φ), com E = kmod·Ec0m, ≤ vão/350
 *   (balanço: vão/175 = 2L/350)
 * Teste: node tools/test-mad-dim.js (141 casos do R03 + contas à mão)
 * ===================================================================== */
(function (global) {
  "use strict";

  var MM = global.MadMateriais || (typeof require === "function" ? require("./madmateriais.js") : null);
  var MV = global.MadViga || (typeof require === "function" ? require("./madviga.js") : null);

  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }
  function br(x, n) { return (n == null ? x.toFixed(2) : x.toFixed(n)).replace(".", ","); }

  var MadDim = {};

  /** resistências de cálculo de uma classe num perfil (MPa) — atalho do MadMateriais */
  MadDim.resistencias = function (classeId, perfilId) { return MM.resistencias(classeId, perfilId); };

  /** perfil (id de 1997 ou objeto de MadMateriais.perfil2022) + resistências da classe ("C40-dic" ou "nativa:D60"/"peca:C24") */
  MadDim.perfilEResist = function (classe, perfil) {
    if (perfil && typeof perfil === "object") {
      if (!perfil.completo) throw new Error("maddim7190: perfil incompleto");
      return { p: perfil, f: MM.resistencias2022(classe, perfil) };
    }
    return { p: MM.perfil(perfil), f: MM.resistencias(classe, perfil) };
  };

  /**
   * Viga fletida sobre apoios simples (barrote, VP, terça, verga).
   * o = { L (m), apoios [m], G: {d: [[a,b,q]], p: [[x,P]]}, Q: {d, p}, b (m), h (m), classe, perfil }
   * → { Md, Vd, eta_flexao, eta_cisalh, eta_flecha, eta, ok, reacoes {x: [RG, RQ]}, passos[] }
   */
  MadDim.vigaFletida = function (o) {
    var pr = MadDim.perfilEResist(o.classe, o.perfil), p = pr.p, f = pr.f;
    var mesmoGama = p.gamaG === p.gamaQ;
    var b = o.b, h = o.h, L = o.L, ap = o.apoios;
    var G = o.G || {}, Q = o.Q || {};
    var gd = G.d || [], gp = G.p || [], qd = Q.d || [], qp = Q.p || [];
    /* rigidez para a flecha: 1997 (R03) = kmod·Ec0,m; 2022 = E0,med (a fluência entra só por φ) */
    var Eflecha = p.eRigidez === "E0m" ? f.E0m : f.Eef;
    var EI = Eflecha * 1e3 * b * h * h * h / 12;                         // kN·m²
    var ex = gp.concat(qp).map(function (t) { return t[0]; })
      .concat(gd.concat(qd).map(function (t) { return t[0]; }))
      .concat(gd.concat(qd).map(function (t) { return t[1]; }));
    var sG = MV.resolver(L, ap, gd, gp, EI, ex), sQ = MV.resolver(L, ap, qd, qp, EI, ex);
    var W = b * h * h / 6, n = sG.nos.length, i;
    var mMax = 0, vMax = 0;
    for (i = 0; i < n; i++) {
      if (mesmoGama) {
        mMax = Math.max(mMax, Math.abs(sG.M[i] + sQ.M[i]));
        vMax = Math.max(vMax, Math.abs(sG.V[i] + sQ.V[i]));
      } else {
        mMax = Math.max(mMax, Math.abs(p.gamaG * sG.M[i] + p.gamaQ * sQ.M[i]));
        vMax = Math.max(vMax, p.gamaG * Math.abs(sG.V[i]) + p.gamaQ * Math.abs(sQ.V[i]));
      }
    }
    var Md = mesmoGama ? p.gamaG * mMax : mMax, Vd = mesmoGama ? p.gamaG * vMax : vMax;
    var w = new Float64Array(n);
    /* flecha final: 1997 (R03) = (wG + ψ2·wQ)(1 + φ); 2022 = wG(1 + φ) + wQ(1 + ψ2·φ) (S7 Eq. 37–41) */
    for (i = 0; i < n; i++) w[i] = p.flecha === "2022" ? sG.w[i] * (1 + p.phi) + sQ.w[i] * (1 + p.psi2 * p.phi) : (sG.w[i] + p.psi2 * sQ.w[i]) * (1 + p.phi);
    var apo = ap.slice().sort(function (x, y) { return x - y; });
    var trechos = [[0, apo[0], true]];
    for (i = 0; i + 1 < apo.length; i++) trechos.push([apo[i], apo[i + 1], false]);
    trechos.push([apo[apo.length - 1], L, true]);
    var etaF = 0, critF = null;
    trechos.forEach(function (t) {
      var a = t[0], c = t[1], bal = t[2];
      if (c - a < 0.05) return;
      var wm = -1;
      for (var k = 0; k < n; k++) if (sG.nos[k] >= a - 1e-6 && sG.nos[k] <= c + 1e-6) wm = Math.max(wm, Math.abs(w[k]));
      if (wm < 0) return;
      var lim = (c - a) / (bal ? p.limBalanco : p.limVao);
      if (wm / lim > etaF) { etaF = wm / lim; critF = { a: a, c: c, balanco: bal, w: wm, lim: lim }; }
    });
    var sigma = Md / W / 1e3, tau = 1.5 * Vd / (b * h) / 1e3;
    var eF = sigma / f.fmd, eV = tau / f.fvd;
    var reac = {};
    Object.keys(sG.reacoes).forEach(function (x) { reac[x] = [sG.reacoes[x], sQ.reacoes[x] || 0]; });
    var passos = [
      "Seção " + br(b * 100, 0) + " × " + br(h * 100, 0) + " cm, classe " + f.classe.nome + "; W = b·h²/6 = " + br(W * 1e6, 0) + " cm³; vão total " + br(L) + " m sobre " + ap.length + " apoios.",
      "Coeficientes (" + p.nome + "): kmod = " + br(p.kmod, 3) + " (" + (p.kmodPartes || "") + "); γG = " + br(p.gamaG, 1) + ", γQ = " + br(p.gamaQ, 1) + "; " + (p.flexaoPor === "fmd" && f.fmd !== f.fc0d ? "fm,d = kmod·fm,k/γw = " + br(f.fmd) + " MPa; " : "fc0,d = kmod·fc0,k/γwc = " + br(f.fc0d) + " MPa (flexão pela borda comprimida); ") + "fv,d = kmod·fv,k/γwv = " + br(f.fvd) + " MPa; E da flecha = " + br(Eflecha, 0) + " MPa." + "",
      "Flexão: Md = " + br(Md) + " kN·m → σMd = Md/W = " + br(sigma) + " MPa ≤ fd = " + br(f.fmd) + " MPa → η = " + br(eF, 3) + ".",
      "Cisalhamento: Vd = " + br(Vd) + " kN → τd = 1,5·Vd/(b·h) = " + br(tau, 3) + " MPa ≤ fv,d = " + br(f.fvd, 3) + " MPa → η = " + br(eV, 3) + ".",
      critF ? "Flecha final " + (p.flecha === "2022" ? "wG(1 + φ) + wQ(1 + ψ2·φ)" : "(wG + ψ2·wQ)(1 + φ)") + ", E = " + (p.eRigidez === "E0m" ? "E0,med" : "kmod·Ec0,m") + ", ψ2 = " + br(p.psi2, 1) + ", φ = " + br(p.phi, 1) + ": " + br(critF.w * 1000, 1) + " mm no " + (critF.balanco ? "balanço" : "vão") + " de " + br(critF.c - critF.a) + " m ≤ " + br(critF.lim * 1000, 1) + " mm (" + (critF.balanco ? "L/" + p.limBalanco : "L/" + p.limVao) + ") → η = " + br(etaF, 3) + "." : "Flecha: sem trecho verificável."
    ];
    var eta = Math.max(eF, eV, etaF);
    return {
      Md: Md, Vd: Vd, eta_flexao: eF, eta_cisalh: eV, eta_flecha: etaF, eta: eta, ok: eta <= 1.0 + 1e-9,
      reacoes: reac, passos: passos, norma: p.fonte,
      resumo: { Md_kNm: r(Md, 2), Vd_kN: r(Vd, 2), eta_flexao: r(eF, 3), eta_cisalh: r(eV, 3), eta_flecha: r(etaF, 3) }
    };
  };

  /* ==================================================================
   * NBR 7190-1:2022 — compressão com estabilidade, flexocompressão e
   * estabilidade lateral de vigas (fonte secundária R2/R1 — pesquisa de
   * 12/10/2026, itens 4 e 5; o memorial avisa em cada passo).
   * ================================================================== */

  /** βM = (4/π)·(βE/γf)·(h/b)^1,5/((h/b) − 0,63)^0,5, βE = 4, γf = 1,4 (Eq. 26) */
  MadDim.betaM = function (h, b) {
    var r = h / b;
    return 4 / Math.PI * (4 / 1.4) * Math.pow(r, 1.5) / Math.sqrt(r - 0.63);
  };

  /** kc pela esbeltez relativa (6.5.3/6.5.4) */
  MadDim.kc = function (lambdaRel, betaC) {
    if (lambdaRel <= 0.3) return 1;
    var k = 0.5 * (1 + betaC * (lambdaRel - 0.3) + lambdaRel * lambdaRel);
    return 1 / (k + Math.sqrt(k * k - lambdaRel * lambdaRel));
  };

  /**
   * Barra comprimida (ou flexocomprimida) de seção retangular.
   * o = { N (kN, compressão +), Mx, My (kN·m: Mx em torno do eixo forte — plano de h), b, h (m),
   *       L0x, L0y (m: comprimento de flambagem no plano de h e no de b), classe, perfil (perfil2022) }
   */
  MadDim.compressao2022 = function (o) {
    var pr = MadDim.perfilEResist(o.classe, o.perfil), p = pr.p, f = pr.f;
    if (p.edicao !== "2022") throw new Error("maddim7190: compressao2022 exige perfil da 2022");
    var b = o.b, h = o.h, A = b * h, Wx = b * h * h / 6, Wy = h * b * b / 6;
    var ix = h / Math.sqrt(12), iy = b / Math.sqrt(12);
    var lx = o.L0x / ix, ly = o.L0y / iy;
    var r = Math.sqrt(f.fc0k / f.E005) / Math.PI;
    var lrx = lx * r, lry = ly * r;
    var kcx = MadDim.kc(lrx, p.betaC), kcy = MadDim.kc(lry, p.betaC);
    var sN = (o.N || 0) / A / 1e3, sMx = Math.abs(o.Mx || 0) / Wx / 1e3, sMy = Math.abs(o.My || 0) / Wy / 1e3;
    var e1, e2, dispensa = lrx <= 0.3 && lry <= 0.3;
    if (dispensa) {
      e1 = Math.pow(sN / f.fc0d, 2) + sMx / f.fmd + p.kM * sMy / f.fmd;
      e2 = Math.pow(sN / f.fc0d, 2) + p.kM * sMx / f.fmd + sMy / f.fmd;
    } else {
      e1 = sN / (kcx * f.fc0d) + sMx / f.fmd + p.kM * sMy / f.fmd;
      e2 = sN / (kcy * f.fc0d) + p.kM * sMx / f.fmd + sMy / f.fmd;
    }
    var LAM_MAX = 40 * Math.sqrt(12);        // 9.3 (NBR 7190-1:2022, p. 68 impr.): peça comprimida de seção retangular, L0 ≤ 40 × a dimensão transversal ⇔ λ ≤ 40·√12 = 138,6 (mais severo que o 140 da 6.5.3)
    var eta = Math.max(e1, e2), esbelto = Math.max(lx, ly) > LAM_MAX;
    var passos = [
      "Seção " + br(b * 100, 0) + " × " + br(h * 100, 0) + " cm, " + f.classe.nome + "; A = " + br(A * 1e4, 0) + " cm²; fc0,d = " + br(f.fc0d) + " MPa; fm,d = " + br(f.fmd) + " MPa; E0,05 = " + br(f.E005, 0) + " MPa; kmod = " + br(p.kmod, 3) + ".",
      "Esbeltez: λx = L0x/ix = " + br(o.L0x) + "/" + br(ix, 4) + " = " + br(lx, 1) + "; λy = " + br(ly, 1) + " (limite 40·√12 = 138,6 pela 9.3 (L0 ≤ 40 × a dimensão transversal; 6.5.3: 140)" + (esbelto ? " — EXCEDIDO" : "") + "). λrel = (λ/π)·√(fc0,k/E0,05): " + br(lrx, 3) + " / " + br(lry, 3) + ".",
      dispensa ? "λrel ≤ 0,30 nos dois eixos: dispensa a verificação de estabilidade (6.5.5); resistência da seção (σN/fc0,d)² + σM/fm,d (+ kM·σM do outro eixo) = " + br(eta, 3) + "." :
        "kc = 1/(k + √(k² − λrel²)), k = 0,5[1 + βc(λrel − 0,3) + λrel²], βc = " + br(p.betaC, 1) + ": kcx = " + br(kcx, 3) + ", kcy = " + br(kcy, 3) + ".",
      dispensa ? "" : "σN,d = " + br(sN, 3) + " MPa; σMx,d = " + br(sMx, 3) + "; σMy,d = " + br(sMy, 3) + " MPa. σN/(kcx·fc0,d) + σMx/fm,d + kM·σMy/fm,d = " + br(e1, 3) + "; σN/(kcy·fc0,d) + kM·σMx/fm,d + σMy/fm,d = " + br(e2, 3) + " (kM = " + br(p.kM, 1) + ").",
      "NBR 7190-1:2022, itens 6.5.3–6.5.5 (Ineq. 13–14)."
    ].filter(Boolean);
    return { eta: eta, ok: eta <= 1 + 1e-9 && !esbelto, lambda: [lx, ly], lambdaRel: [lrx, lry], kc: [kcx, kcy], esbelto: esbelto, passos: passos, norma: p.fonte };
  };

  /**
   * Estabilidade lateral de viga (6.5.6): dispensada se L1/b ≤ E0,ef/(βM·fm,d);
   * senão σc,d ≤ E0,ef/(βM·L1/b). L1 = distância entre travamentos da borda comprimida.
   * o = { b, h, L1 (m), sigmaMd (MPa), classe, perfil }
   */
  MadDim.estabilidadeLateral2022 = function (o) {
    var pr = MadDim.perfilEResist(o.classe, o.perfil), p = pr.p, f = pr.f;
    var bM = MadDim.betaM(o.h, o.b), Eef = f.Eef, esb = o.L1 / o.b, lim = Eef / (bM * f.fmd);
    var dispensa = esb <= lim, sLim = Eef / (bM * esb);
    var eta = dispensa ? 0 : o.sigmaMd / sLim;
    return {
      eta: eta, ok: eta <= 1 + 1e-9, dispensa: dispensa, betaM: bM, limite: lim,
      passos: ["βM = " + br(bM, 2) + " (h/b = " + br(o.h / o.b, 2) + "); E0,ef = kmod·E0,med = " + br(Eef, 0) + " MPa; L1/b = " + br(esb, 1) + (dispensa ? " ≤ E0,ef/(βM·fm,d) = " + br(lim, 1) + " → dispensada." : " > " + br(lim, 1) + " → σc,d = " + br(o.sigmaMd, 2) + " ≤ E0,ef/(βM·L1/b) = " + br(sLim, 2) + " MPa → η = " + br(eta, 3) + "."),
        "NBR 7190-1:2022, item 6.5.6 (Eq. 25–28)."]
    };
  };

  /**
   * Barra genérica com esforços da análise global (NBR 7190-1:2022, fonte secundária).
   * o = { N (kN, TRAÇÃO +, convenção do MadAnalise), My (eixo forte, h), Mz (eixo fraco, b), Vy, Vz, T (kN, kN·m),
   *       b, h (m), L0y (flambagem no plano de h), L0z (no plano de b), L1 (travamento lateral da borda comprimida),
   *       classe, perfil }
   * Compressão → compressao2022 (kc nos dois eixos, kM). Tração → σt/ft0,d + σMy/fm,d + kM·σMz/fm,d (e o par
   * trocado) — mesma forma da NBR 7190:1997 7.3.6 e do EN 1995-1-1 6.2.3. Cisalhamento: τ = 1,5·√(Vy² + Vz²)/(b·h) +
   * τ da torção (Saint-Venant, τ = T/(α·a·c²), α = 1/(3 + 1,8·c/a)) ≤ fv,d. Estabilidade lateral (βM) com L1.
   */
  MadDim.barra2022 = function (o) {
    var pr = MadDim.perfilEResist(o.classe, o.perfil), p = pr.p, f = pr.f;
    var b = o.b, h = o.h, A = b * h, Wy = b * h * h / 6, Wz = h * b * b / 6;
    var N = o.N || 0, sMy = Math.abs(o.My || 0) / Wy / 1e3, sMz = Math.abs(o.Mz || 0) / Wz / 1e3;
    var res = { verif: [], eta: 0, governa: null };
    function add(nome, eta, passos) { res.verif.push({ nome: nome, eta: eta, passos: passos }); if (eta > res.eta) { res.eta = eta; res.governa = nome; } }
    if (N < 0) {
      var c = MadDim.compressao2022({ N: -N, Mx: o.My, My: o.Mz, b: b, h: h, L0x: o.L0y, L0y: o.L0z, classe: o.classe, perfil: o.perfil });
      add("flexocompressão", c.esbelto ? Math.max(c.eta, 1.0001) : c.eta, c.passos);
      res.lambda = c.lambda; res.kc = c.kc;
    } else {
      var sT = N / A / 1e3;
      var e1 = sT / f.ft0d + sMy / f.fmd + p.kM * sMz / f.fmd, e2 = sT / f.ft0d + p.kM * sMy / f.fmd + sMz / f.fmd;
      add(N > 0 ? "flexotração" : "flexão", Math.max(e1, e2), ["σt,d = " + br(sT, 3) + " MPa; σMy,d = " + br(sMy, 3) + "; σMz,d = " + br(sMz, 3) + " MPa; ft0,d = " + br(f.ft0d) + "; fm,d = " + br(f.fmd) + " MPa.",
        "σt/ft0,d + σMy/fm,d + kM·σMz/fm,d = " + br(e1, 3) + "; σt/ft0,d + kM·σMy/fm,d + σMz/fm,d = " + br(e2, 3) + " (kM = " + br(p.kM, 1) + "; forma da NBR 7190:1997 7.3.6 / EN 1995-1-1 6.2.3)."]);
    }
    var a = Math.max(b, h), cc = Math.min(b, h), alfa = 1 / (3 + 1.8 * cc / a);
    var tV = 1.5 * Math.sqrt(Math.pow(o.Vy || 0, 2) + Math.pow(o.Vz || 0, 2)) / A / 1e3, tT = Math.abs(o.T || 0) / (alfa * a * cc * cc) / 1e3;
    add("cisalhamento + torção", (tV + tT) / f.fvd, ["τV = 1,5·√(Vy² + Vz²)/(b·h) = " + br(tV, 3) + " MPa; τT = T/(α·a·c²) = " + br(tT, 3) + " MPa (α = " + br(alfa, 3) + "); fv,d = " + br(f.fvd, 3) + " MPa (soma linear, a favor)."]);
    if (sMy > 0 && o.L1 && h > b) {
      var el = MadDim.estabilidadeLateral2022({ b: b, h: h, L1: o.L1, sigmaMd: sMy, classe: o.classe, perfil: o.perfil });
      add("estabilidade lateral", el.eta, el.passos);
    }
    res.ok = res.eta <= 1 + 1e-9;
    return res;
  };

  /* ==================================================================
   * E1 (madeira engenharada) — funções NOVAS. As anteriores não mudam.
   * Fonte secundária: NBR 7190-1:2022 sem texto; fórmulas de EN 1995-1-1 onde citado.
   * ================================================================== */

  /**
   * Converte uma estação do acoanalise ({N, Vy, Vz, T, My, Mz}) nos dados de barra2022.
   * A TORÇÃO vem na chave `T` (NÃO em Mx — o erro B1 da revisão da Casa Mar: `T: est.Mx` fazia a torção nunca entrar).
   * Mapeamento do pórtico da RA: o eixo FORTE da seção (plano de h) é o Mz do acoanalise → My do barra2022, e vice-versa.
   * o = { b, h, L0y, L0z, L1, classe, perfil, trocarEixos (padrão true), divisor (pilar duplo = 2),
   *       kmAlfa (fator que DIVIDE o momento forte), kmAlfaQuando: "Mz<0" (padrão) | "Mz>0" }
   */
  MadDim.deAnalise = function (est, o) {
    var d = o.divisor || 1, troca = o.trocarEixos !== false;
    var Mz = est.Mz, q = o.kmAlfaQuando || "Mz<0";
    if (o.kmAlfa && (q === "Mz<0" ? est.Mz < 0 : est.Mz > 0)) Mz = est.Mz / o.kmAlfa;
    return {
      N: est.N / d, My: troca ? Mz / d : est.My / d, Mz: troca ? est.My / d : Mz / d, Vy: est.Vy / d, Vz: est.Vz / d, T: (est.T || 0) / d,
      b: o.b, h: o.h, L0y: o.L0y, L0z: o.L0z, L1: o.L1, classe: o.classe, perfil: o.perfil
    };
  };

  /**
   * L1 POR BORDA: distância entre travamentos da borda COMPRIMIDA. Convenção do acoanalise: Mz > 0 comprime a face de CIMA
   * (travada pelo lambri/terça), Mz < 0 comprime a de BAIXO (travada por bloqueador/escora).
   * trav = { cima: L1 com a borda de cima comprimida, baixo: L1 com a de baixo }
   */
  MadDim.L1PorBorda = function (Mz, trav) { return Mz > 0 ? trav.cima : trav.baixo; };

  /**
   * Seção CIRCULAR (pilar torneado/roliço). N: tração +. Flexocompressão: |N|/A/(kc·fc0,d) + M/W/fm,d; flexotração: N/A/ft0,d + M/W/fm,d
   * (M = √(My² + Mz²), W = π·d³/32). Cisalhamento 4/3·V/A (+ torção τ = 16·T/(π·d³) se T for dado). kc com L0 e i = d/4.
   * o = { N, My, Mz, Vy, Vz, T, d (m), L0 (m), classe, perfil }
   */
  MadDim.circular2022 = function (o) {
    var pr = MadDim.perfilEResist(o.classe, o.perfil), p = pr.p, f = pr.f;
    var d = o.d, A = Math.PI * d * d / 4, W = Math.PI * d * d * d / 32, i = d / 4, lam = o.L0 / i;
    var lr = lam / Math.PI * Math.sqrt(f.fc0k / f.E005), kc = MadDim.kc(lr, p.betaC);
    var N = o.N || 0, M = Math.sqrt(Math.pow(o.My || 0, 2) + Math.pow(o.Mz || 0, 2)) / W / 1e3, sN = N / A / 1e3;
    var eta = N < 0 ? (-sN) / (kc * f.fc0d) + M / f.fmd : sN / f.ft0d + M / f.fmd;
    var tau = 4 / 3 * Math.sqrt(Math.pow(o.Vy || 0, 2) + Math.pow(o.Vz || 0, 2)) / A / 1e3 + (o.T ? 16 * Math.abs(o.T) / (Math.PI * d * d * d) / 1e3 : 0);
    var etaV = tau / f.fvd, esbelto = lam > 140, etaT = Math.max(eta, etaV);
    return {
      eta: etaT, ok: etaT <= 1 + 1e-9 && !esbelto, lambda: lam, lambdaRel: lr, kc: kc, esbelto: esbelto,
      governa: eta >= etaV ? (N < 0 ? "flexocompressão" : "flexotração") : "cisalhamento", eta_flexao: eta, eta_cisalh: etaV,
      passos: [
        "Seção circular Ø" + br(d * 100, 0) + " cm, " + f.classe.nome + "; A = " + br(A * 1e4, 0) + " cm²; W = π·d³/32 = " + br(W * 1e6, 0) + " cm³; i = d/4 = " + br(i, 4) + " m.",
        "λ = L0/i = " + br(o.L0) + "/" + br(i, 4) + " = " + br(lam, 1) + (esbelto ? " (limite 140 EXCEDIDO)" : "") + "; λrel = " + br(lr, 3) + "; kc = " + br(kc, 3) + " (βc = " + br(p.betaC, 1) + ").",
        (N < 0 ? "Flexocompressão: |σN|/(kc·fc0,d) + σM/fm,d = " : "Flexotração: σt/ft0,d + σM/fm,d = ") + br(eta, 3) + " (σN = " + br(sN, 3) + " MPa, σM = " + br(M, 3) + " MPa).",
        "Cisalhamento (seção circular): τ = 4/3·V/A" + (o.T ? " + 16·T/(π·d³)" : "") + " = " + br(tau, 3) + " MPa ≤ fv,d = " + br(f.fvd, 3) + " MPa → η = " + br(etaV, 3) + "."
      ]
    };
  };

  /**
   * Pilar COMPOSTO/DUPLO sem espaçadores estruturais: duas peças lado a lado (a viga passa entre elas), CADA UMA com a metade dos
   * esforços, flambagem de cada peça com o L0 de projeto nos DOIS eixos (a peça isolada não ganha inércia da seção composta).
   * `est` é o esforço da barra equivalente (2 peças); com o modelo montado como ret(h, b) (Casa Mar, opção B) os eixos já
   * coincidem com os da peça: trocarEixos:false.
   * COM ESPAÇADORES (pilar composto de verdade): NÃO implementado — a NBR 7190-1:2022 (anexo de peças compostas) está sem texto e a
   * EN 1995-1-1 Anexo C pede: nº de peças, distância livre a e entre eixos, espaçador (n_esp, comprimento, ligação com Kser),
   * λef = √(λ² + (n/2)·λ1²) e η_ef de ligação. Sem esses dados e sem a fonte, `espacadores` é RECUSADO.
   * o = { est (N,My,Mz,Vy,Vz,T do conjunto), b, h (peça), L0y, L0z, L1, classe, perfil, trocarEixos }
   */
  MadDim.pilarDuplo2022 = function (o) {
    if (o.espacadores) throw new Error("maddim7190: pilar composto COM espaçadores recusado — sem texto da 7190-1:2022 (ver comentário da função: dados necessários)");
    var e = MadDim.deAnalise(o.est, { b: o.b, h: o.h, L0y: o.L0y, L0z: o.L0z, L1: o.L1 || 0.01, classe: o.classe, perfil: o.perfil, divisor: 2, trocarEixos: !!o.trocarEixos });
    var r = MadDim.barra2022(e);
    r.passos = ["Pilar duplo: 2 peças " + br(o.b * 100, 0) + " × " + br(o.h * 100, 0) + " cm; cada peça leva a metade dos esforços; L0y = " + br(o.L0y) + " m, L0z = " + br(o.L0z) + " m (sem ganho de inércia composta)."].concat(
      r.verif.reduce(function (a, v) { return a.concat(v.passos); }, []));
    return r;
  };

  /**
   * km,α (EN 1995-1-1 6.4.2) da borda cortada de viga de altura variável (lamelas paralelas à borda RETA; a outra borda faz
   * ângulo α com a fibra). Calculado com os valores CARACTERÍSTICOS (como na conferência da Casa Mar: 0,911 para tgα = 0,048):
   *   tração na borda cortada:     km,α = 1/√(1 + (fm/(0,75·fv)·tgα)² + (fm/ft90·tg²α)²)
   *   compressão na borda cortada: km,α = 1/√(1 + (fm/(1,5·fv)·tgα)² + (fm/fc90·tg²α)²)
   * o = { tgAlfa, classe, tipo: "tracao"|"compressao" }  → { km, passos }
   */
  MadDim.kmAlfa = function (o) {
    var c = MM.classe2022(o.classe), t = o.tgAlfa, tr = (o.tipo || "tracao") === "tracao", G = MM.GAMA_2022, car = !!o.caracteristico;
    if (c.incompleta) throw new Error("maddim7190: classe incompleta");
    /* A5: a EN escreve km,α com valores de CÁLCULO; com γ diferentes (NBR: fm 1,4 / fv 1,8 / ft90 1,4 / fc90 1,4) a razão de cálculo fm,d/fv,d é 1,286 × a característica */
    var gm = car ? 1 : G.m, gv = car ? 1 : G.v, g90 = car ? 1 : (tr ? G.t : G.c);
    var a = (c.fmk / gm) / ((tr ? 0.75 : 1.5) * c.fvk / gv) * t, b = (c.fmk / gm) / ((tr ? c.ft90k : c.fc90k) / g90) * t * t;
    var km = 1 / Math.sqrt(1 + a * a + b * b);
    return { km: km, passos: ["km,α (" + (tr ? "tração" : "compressão") + " na borda cortada, tgα = " + br(t, 4) + ", valores " + (car ? "característicos" : "de cálculo: γm 1,4, γv 1,8, γ90 1,4") + "): 1/√(1 + (fm/(" + (tr ? "0,75" : "1,5") + "·fv)·tgα)² + (fm/f" + (tr ? "t90" : "c90") + "·tg²α)²) = 1/√(1 + " + br(a * a, 4) + " + " + br(b * b, 4) + ") = " + br(km, 4) + ".",
      "EN 1995-1-1, 6.4.2 (fonte secundária — NBR 7190-1:2022 sem texto)."] };
  };

  /** altura linear entre hA e hB num trecho de comprimento L; tgα da borda inclinada */
  MadDim.alturaVariavel = function (hA, hB, L) { return { tgAlfa: Math.abs(hB - hA) / L, h: function (x) { return hA + (hB - hA) * Math.min(1, Math.max(0, x / L)); } }; };

  /**
   * Barra de altura variável: barra2022 na altura da estação com km,α aplicado ao momento quando a borda CORTADA fica tracionada
   * (borda cortada em cima: Mz < 0 no acoanalise). `compressaoTambem`: aplica também o km,α de compressão (padrão: não, como na R02).
   * o = { est, b, hA, hB, Lb (comprimento do trecho), x (abscissa da estação), L0y, L0z, trav {cima, baixo}, classe, perfil,
   *       bordaCortada: "cima"|"baixo" (padrão cima), tgAlfa (opcional; senão |hB−hA|/Lb), compressaoTambem }
   */
  MadDim.vigaAlturaVariavel2022 = function (o) {
    var Lb = o.Lb, av = MadDim.alturaVariavel(o.hA, o.hB, Lb), tg = o.tgAlfa != null ? o.tgAlfa : av.tgAlfa;
    var h = av.h(o.x), cortadaCima = (o.bordaCortada || "cima") === "cima";
    var tracionaCortada = cortadaCima ? o.est.Mz < 0 : o.est.Mz > 0;
    var km = null;
    if (tracionaCortada) km = MadDim.kmAlfa({ tgAlfa: tg, classe: o.classe, tipo: "tracao", caracteristico: o.caracteristico }).km;
    else if (o.compressaoTambem !== false) km = MadDim.kmAlfa({ tgAlfa: tg, classe: o.classe, tipo: "compressao", caracteristico: o.caracteristico }).km;      // A5: compressão também, por padrão
    var L1 = MadDim.L1PorBorda(o.est.Mz, o.trav);
    var e = MadDim.deAnalise(o.est, { b: o.b, h: h, L0y: o.L0y, L0z: o.L0z, L1: L1, classe: o.classe, perfil: o.perfil, kmAlfa: km,
      kmAlfaQuando: tracionaCortada ? (cortadaCima ? "Mz<0" : "Mz>0") : (cortadaCima ? "Mz>0" : "Mz<0") });
    var r = MadDim.barra2022(e);
    r.h = h; r.kmAlfa = km; r.L1 = L1;
    r.passos = ["Viga de altura variável: h(x) = " + br(h * 100, 1) + " cm (" + br(o.hA * 100, 1) + " → " + br(o.hB * 100, 1) + " cm em " + br(Lb) + " m); borda cortada: " + (cortadaCima ? "cima" : "baixo") + " (tgα = " + br(tg, 4) + "); L1 = " + br(L1) + " m (borda " + (o.est.Mz > 0 ? "de cima" : "de baixo") + " comprimida).",
      km ? "Momento dividido por km,α = " + br(km, 4) + "." : "Sem km,α nesta estação."].concat(
      r.verif.reduce(function (a, v) { return a.concat(v.passos); }, []));
    return r;
  };

  /**
   * M7 — comprimento de flambagem de PILAR EM BALANÇO COM MOLA DE ROTAÇÃO NA BASE (topo livre, sem restrição de rotação — a rótula do topo não é creditada, a favor da segurança):
   * equilíbrio da elástica: x·tan x = C·L/(EI), x = k·L = π/β → L0 = β·L, β = π/x. C → ∞ dá x = π/2, β = 2,0 (engaste perfeito); C = 0 dá β → ∞ (mecanismo).
   * Dedução no próprio código (EN 1993/Timoshenko, fonte secundária): y'' + k²y = k²δ, y(0) = 0, y'(0) = P·δ/C, y(L) = δ  ⇒  tan(kL)·(k·EI/C) = 1.
   * o = { C (kN·m/rad), EI (kN·m²), L (m) } → { beta, x, CL_EI, passos[] }
   */
  MadDim.betaFlambagemMola = function (o) {
    var C = o.C, EI = o.EI, L = o.L, r = C * L / EI, x, lo, hi, i;
    if (!(r > 0)) return { beta: Infinity, x: 0, CL_EI: r || 0, passos: ["Mola de base nula: pilar em balanço sem engaste — mecanismo (β → ∞)."] };
    if (r > 1e6) x = Math.PI / 2;
    else { lo = 1e-9; hi = Math.PI / 2 - 1e-12; for (i = 0; i < 200; i++) { x = (lo + hi) / 2; if (x * Math.tan(x) > r) hi = x; else lo = x; } x = (lo + hi) / 2; }
    return { beta: Math.PI / x, x: x, CL_EI: r, passos: ["Pilar em balanço com mola de base C = " + br(C, 0) + " kN·m/rad: C·L/EI = " + br(r, 2) + "; x·tan x = C·L/EI ⇒ x = " + br(x, 4) + "; β = π/x = " + br(Math.PI / x, 3) + " (L0 = β·L; engaste perfeito = 2,0)."] };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MadDim;
  else global.MadDim = MadDim;
})(typeof window !== "undefined" ? window : this);

/* =====================================================================
 * madt5lig.js — T5 (pergolado): APARO COM FOLGA ≥ 10 mm das mãos-francesas, LIGAÇÕES (uma chapa por nó, pinos pela geometria), BASE rotulada (chapa + pinos + placa + chumbadores),
 * LIGAÇÃO COM A PAREDE (encostado), AUDITOR e PROJETAR (laço de crescimento + ligações). Motor PURO, ES5, Node-testável. Arquivo novo; não altera madt3*.
 * Princípios herdados da revisão da T3: pinos contados pela GEOMETRIA; UMA chapa por nó quando várias barras chegam ao mesmo ponto; folga ≥ 10 mm (a carga passa só por chapa + pinos,
 * peça aparada, folga medida); chapa pela seção LÍQUIDA (NBR 8800); PRELIMINAR — NÃO ATENDE quando reprova. Decisões: docs/madeira/T5-REFERENCIA.md.
 * ===================================================================== */
(function (global) {
  "use strict";
  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T5 = req("MadT5", "madt5.js"), C5 = req("MadT5Calc", "madt5calc.js"), U = T5._util, br = U.br, copia = U.copia, norm = U.norm, hyp = U.hyp, rd = U.rd;
  function D() { return { MM: req("MadMateriais", "madmateriais.js"), ML: req("MadLig", "madligacoes.js"), MD: req("MadDim", "maddim7190.js"), L3: req("MadT3Lig", "madt3lig.js") }; }
  var FOLGA = T5.FOLGA, TCH = 0.008;

  /* ---------------------------------------------------------------- helpers de chapa e pinos (os mesmos da T3, revisados) */
  function chapaNBR8800(c, pn, t, hp, F, Feq) {
    var d = pn.d || 0.012, dfu = d + 0.0035, dh = d + 0.0015, nc = pn.nc || 1, Rg = t * hp * c.fy * 1e3 / c.gamaA1, An = t * Math.max(0.001, hp - nc * dfu), Rn = An * c.fu * 1e3 / 1.35;
    var a1 = pn.a1 || (5 * d), a3 = pn.a3 || (7 * d), lf = Math.max(0.001, Math.min(a1 - dh, a3 - dh / 2)), Rb = Math.min(1.2 * lf * t, 2.4 * d * t) * c.fu * 1e3 / 1.35, Fp = (pn.Fmax || 0) * (Feq > 0 ? F / Feq : 1);
    var eG = F / Rg, eN = F / Rn, eB = Fp / Rb, eta = Math.max(eG, eN, eB);
    return { Rd: Math.min(Rg, Rn), Rd_bruta: Rg, Rd_liquida: Rn, Rd_esmagamento_por_pino: Rb, eta_bruta: eG, eta_liquida: eN, eta_esmagamento: eB, eta: eta, ok: eta <= 1 + 1e-9, t_mm: Math.round(t * 1000), largura_mm: Math.round(hp * 1000), furo_mm: dfu * 1000, F_pino_aco: Fp,
      passos: ["Chapa " + br(t * 1000, 0) + " × " + br(hp * 1000, 0) + " mm (NBR 8800): bruta N,Rd = t·h·fy/γa1 = " + br(Rg) + " kN → η = " + br(eG, 3) + "; LÍQUIDA Ae·fu/γa2 = " + br(An * 1e4, 2) + " cm² × " + br(c.fu, 0) + " MPa / 1,35 = " + br(Rn) + " kN (" + nc + " furo(s) de Ø" + br(dfu * 1000, 1) + " mm na seção) → η = " + br(eN, 3) + "; ESMAGAMENTO por pino (lf = " + br(lf * 1000, 0) + " mm) mín(1,2·lf·t·fu; 2,4·d·t·fu)/1,35 = " + br(Rb) + " kN, pino mais carregado " + br(Fp) + " kN → η = " + br(eB, 3) + "."] };
  }
  function pinosMom(ML, c, nome, F, H, M, b, h, tCh) {
    var ds = [0.016, 0.012, 0.010], melhor = null, k, nc;
    function cap(d, t1) { return function (al) { return ML.chapaInterna(d, t1, al, c.rhok, c.fu, c.k90Tipo); }; }
    for (k = 0; k < ds.length; k++) for (nc = 2; nc >= 1; nc--) {
      var d = ds[k], t1 = (b - tCh) / 2, a = nc === 1 ? 0 : h / 2 - 4 * d, r;
      if (nc === 2 && a <= 0) continue; if (nc === 2 && 2 * a < ML.bordas(d, Math.PI / 2, c.pinoTipo).a2 - 1e-9) continue;
      r = ML.dimGrupo({ nome: nome + " (pinos Ø" + Math.round(d * 1000) + ", " + nc + " coluna" + (nc > 1 ? "s" : "") + ")", cap: cap(d, t1), nc: nc, a: a, d: d, M: M || 0, N: F, H: H || 0, nrMax: 16, nrMin: 2, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: t1 });
      if (r.ok) { r.chapa = tCh; r.M_kNm = M || 0; return r; }
      if (!melhor || (r.d || 0) > (melhor.d || 0)) melhor = r;
    }
    return melhor || { nome: nome, ok: false, eta: Infinity, passos: [nome + ": peça estreita demais para a chapa (b = " + br(b * 100, 0) + " cm)."] };
  }
  /** nó com chapa interna: grupo de pinos na peça (força axial F + transversal S), chapa pela NBR 8800 (bruta, líquida, esmagamento) */
  function no(ML, c, nome, F, Feq, S, Seq, sec, extra) {
    var pn = pinosMom(ML, c, nome, Feq, Seq, 0, sec.b, sec.h, TCH), hp = Math.max(0.03, sec.h - 0.05), F0 = Math.sqrt(F * F + S * S), ch = chapaNBR8800(c, pn, TCH, hp, F0, Math.sqrt(Feq * Feq + Seq * Seq));
    var o = { pinos: pn, chapa: ch, F_d: F, F_eq: Feq, S_d: S, S_eq: Seq, ok: pn.ok && ch.ok, eta: Math.max(pn.eta, ch.eta), passos: pn.passos.concat(ch.passos) };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o;
  }
  /** fendilhamento (6.x / 7.1.1; mesma forma da EN 1995-1-1 8.1.4) da peça carregada ⊥ às fibras; he = h/2 (pinos a meia altura). Reprova → reforço com rosca total (Ft,90) */
  function fendilha(ML, c, Feq90, sec, he, RAX) {
    var F90k = ML.fendilhamentoF90Rk(sec.b, he, sec.h), F90d = F90k * c.kmod / c.gLig, eta = Feq90 / F90d, o = { F90_Rk: F90k, F90_Rd: F90d, F_perp: Feq90, he: he, eta: eta, ok: eta <= 1 + 1e-9, reforco: null };
    if (!o.ok) { var rf = ML.reforcoTracaoNormal({ F: Feq90, he_h: he / sec.h, Rax_d: RAX, minimo: 2 }); o.reforco = rf; o.ok = rf.ok; o.eta = rf.eta; o.passos = ["Fendilhamento: F,90,Rd = " + br(F90d) + " kN < " + br(Feq90) + " kN → REFORÇO com " + rf.parafusos + " parafusos de rosca total (Ft,90 = " + br(rf.Ft90_d) + " kN; Rax,d = " + br(RAX) + " kN)."]; }
    else o.passos = ["Fendilhamento: F,90,Rd = " + br(F90d) + " kN ≥ " + br(Feq90) + " kN → η = " + br(eta, 3) + "."];
    return o;
  }

  /* ---------------------------------------------------------------- APARAR: folga ≥ 10 mm nas pontas das mãos-francesas */
  /** devolve { membros (cópia com p0/p1 APARADOS; eixo de cálculo em eixo0/eixo1), folgas: [{ peca, contra, folga_mm }], resumo }. A mão-francesa não encosta no pilar nem na viga/caibro: a carga passa SÓ por chapa + pinos. */
  function aparar(G, sec) {
    var L3 = D().L3, M = G.membros.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.eixo0 = m.p0.slice(); c.eixo1 = m.p1.slice(); return c; }), folgas = [], I = G.info;
    function sc(g) { return sec[g] || { b: 0.1, h: 0.1 }; }
    function cx(m, p0, p1) { var s = sc(m.g); return L3.caixa(p0 || m.p0, p1 || m.p1, T5.upDe(m), s.b, s.h); }
    function un(a, b) { var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); return [d[0] / l, d[1] / l, d[2] / l]; }
    function hospede(m) { var alvo = m.hospede === "VP" ? M.filter(function (o) { return o.g === "VP" && Math.abs(o.linha - m.linha) < 1e-6; })[0] : M.filter(function (o) { return o.g === "VS" && Math.abs(o.z - m.zP) < 1e-6; })[0]; return alvo; }
    M.filter(function (m) { return m.g === "MF"; }).forEach(function (m) {
      var pil = M.filter(function (o) { return o.g === "P" && Math.abs(o.linha - m.linha) < 1e-6 && Math.abs(o.p0[1] - m.zP) < 1e-6; })[0], host = hospede(m); if (!pil || !host) return;
      var ex = un(m.eixo0, m.eixo1), Lm = norm(m.eixo0, m.eixo1), BP = cx(pil), BH = cx(host), a0 = 0, a1 = 0, k, d0 = 0, d1 = 0;
      function medida(x0, x1) {
        var A = cx(m, [m.eixo0[0] + ex[0] * x0, m.eixo0[1] + ex[1] * x0, m.eixo0[2] + ex[2] * x0], [m.eixo1[0] - ex[0] * x1, m.eixo1[1] - ex[1] * x1, m.eixo1[2] - ex[2] * x1]), L = Lm - x0 - x1;
        var tP = (m.pilarEm[0] - BP.c[0]) * BP.e[0][0] + (m.pilarEm[1] - BP.c[1]) * BP.e[0][1] + (m.pilarEm[2] - BP.c[2]) * BP.e[0][2], tH = (m.vigaEm[0] - BH.c[0]) * BH.e[0][0] + (m.vigaEm[1] - BH.c[1]) * BH.e[0][1] + (m.vigaEm[2] - BH.c[2]) * BH.e[0][2];
        return { dP: L3.distCaixas(A, BP, [-L / 2, -L / 2 + 0.45], [tP - 0.4, tP + 0.4], 0.004), dH: L3.distCaixas(A, BH, [L / 2 - 0.45, L / 2], [tH - 0.4, tH + 0.4], 0.004), L: L };
      }
      for (k = 0; k < 200; k++) { var r = medida(a0, a1); d0 = r.dP; d1 = r.dH; if (r.dP < FOLGA + 0.0004) a0 += 0.004; if (r.dH < FOLGA + 0.0004) a1 += 0.004; if (r.dP >= FOLGA + 0.0004 && r.dH >= FOLGA + 0.0004) break; if (Lm - a0 - a1 < 0.3) break; }
      m.p0 = [m.eixo0[0] + ex[0] * a0, m.eixo0[1] + ex[1] * a0, m.eixo0[2] + ex[2] * a0].map(function (v) { return rd(v, 4); }); m.p1 = [m.eixo1[0] - ex[0] * a1, m.eixo1[1] - ex[1] * a1, m.eixo1[2] - ex[2] * a1].map(function (v) { return rd(v, 4); });
      m.bisel = { tipo: "mao-francesa", aparo: [rd(a0, 4), rd(a1, 4)] }; m.folga = { pilar: d0, viga: d1 };
      folgas.push({ peca: m.id, contra: "pilar " + pil.id, folga_mm: d0 * 1000 }); folgas.push({ peca: m.id, contra: (m.hospede === "VP" ? "viga principal " : "caibro ") + host.id, folga_mm: d1 * 1000 });
    });
    var mins = folgas.map(function (f) { return f.folga_mm; }), maxA = 0; M.forEach(function (m) { if (m.bisel) maxA = Math.max(maxA, m.bisel.aparo[0], m.bisel.aparo[1]); });
    return { membros: M, folgas: folgas, resumo: { n: folgas.length, minimo_mm: mins.length ? Math.min.apply(null, mins) : null, aparoMax_m: maxA } };
  }

  /* ---------------------------------------------------------------- LIGAÇÕES */
  var CHUMB = [[0.010, 58], [0.012, 84.3], [0.016, 157], [0.020, 245]];      /* [d (m), As (mm²)] */
  function lp5(sec, d) { return Math.ceil((Math.max(sec.b, sec.h) + 0.12) * 100) / 100; }
  /** multiplicidade de cada ligação PELA GEOMETRIA dos membros (aparados ou não): nós por posição, pontas de barra que chegam a cada nó */
  function multGeo(M) {
    var key = function (P) { return Math.round(P[0] * 1000) + "," + Math.round(P[1] * 1000) + "," + Math.round(P[2] * 1000); }, mf = M.filter(function (m) { return m.g === "MF"; }), pil = M.filter(function (m) { return m.g === "P"; }), vs = M.filter(function (m) { return m.g === "VS"; }), vp = M.filter(function (m) { return m.g === "VP"; });
    var nosPilar = {}; mf.forEach(function (m) { nosPilar[key(m.eixo0 || m.p0)] = (nosPilar[key(m.eixo0 || m.p0)] || 0) + 1; });
    var cruz = 0; vs.forEach(function (c) { vp.forEach(function (v) { var z = c.z; if (z >= v.p0[1] - 1e-6 && z <= v.p1[1] + 1e-6 && c.p0[0] <= v.linha + 1e-6 && c.p1[0] >= v.linha - 1e-6) cruz++; }); });
    return { nosMFPilar: Object.keys(nosPilar).length, pontasMF: 2 * mf.length, cabecas: pil.length, bases: pil.length, caibroVP: cruz, caibroParede: vs.filter(function (c) { return c.parede; }).length, mfNaViga: mf.filter(function (m) { return m.hospede === "VP"; }).length, mfNoCaibro: mf.filter(function (m) { return m.hospede === "VS"; }).length };
  }
  function t5Ligacoes(q, sec, r, G, ap) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), perf = C5.perfilFn(q), I = G.info, NF = r.nosForca, M = ap ? ap.membros : G.membros;
    var c = { kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, cc = ML.cfg(c), L = { tipologia: "T5", ligacoes: {}, verificacoes: [], avisos: [], cfg: { kmod: cc.kmod, rhok: cc.rhok, gLig: cc.gLig } };
    var WT = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: WT.lefRef * 0.8, lefB: WT.lefRef * 0.8, kmod: cc.kmod }).Rd, mult = multGeo(M);
    var mx = function (x) { return Math.max(0.05, x || 0); };
    /* (1) mãos-francesas no PILAR: UMA chapa em cruz por nó (as 2–4 barras que chegam ao mesmo ponto do pilar); grupo na barra + grupo no pilar com a RESULTANTE vetorial do nó */
    L.ligacoes.mfPilarBarra = no(ML, cc, "mão-francesa (ponta no pilar)", mx(NF.mf.N), mx(NF.mf.NEq), 0.05, 0.05, sec.MF, { descricao: "Ponta da mão-francesa no pilar: chapa interna t = 8 mm + pinos inox na barra; a ponta é aparada (folga ≥ 10 mm do pilar) e a carga passa SÓ por chapa e pinos." });
    L.ligacoes.mfPilarNo = no(ML, cc, "pilar no nó das mãos-francesas (resultante do nó)", mx(NF.pilarMF.Nax), mx(NF.pilarMF.NaxEq), mx(NF.pilarMF.Ntr), mx(NF.pilarMF.NtrEq), sec.P, { descricao: "UMA chapa em cruz por nó do pilar (as mãos-francesas dos dois planos chegam ao mesmo ponto): grupo de pinos no pilar para a resultante vetorial das barras do nó (axial e transversal).", barrasPorNo: "até 4" });
    /* (2) mãos-francesas na VIGA PRINCIPAL e no CAIBRO: grupo na peça hospedeira (força axial e transversal da componente da barra) + fendilhamento */
    ["VP", "VS"].forEach(function (g) {
      var nome = g === "VP" ? "mfViga" : "mfCaibro", tem = M.some(function (m) { return m.g === "MF" && m.hospede === g; }); if (!tem) return;
      var o = no(ML, cc, "mão-francesa na " + (g === "VP" ? "viga principal" : "viga secundária (caibro)"), mx(NF.mfViga.ax), mx(NF.mfViga.axEq), mx(NF.mfViga.tr), mx(NF.mfViga.trEq), sec[g], { descricao: "Nó da mão-francesa na " + (g === "VP" ? "viga principal" : "viga secundária") + ": chapa interna + pinos na peça hospedeira (componente axial e transversal da força da barra)." });
      o.f90 = fendilha(ML, cc, mx(NF.mfViga.trEq), sec[g], sec[g].h / 2, RAX); o.ok = o.ok && o.f90.ok; o.eta = Math.max(o.eta, o.f90.eta); o.passos = o.passos.concat(o.f90.passos); L.ligacoes[nome] = o;
    });
    /* (3) cabeça do pilar × viga principal: uma chapa por nó; arrancamento (sucção) e cortante; pino no pilar (axial = arrancamento) e na VP (⊥ às fibras) */
    var cab = NF.cabeca, pPil = pinosMom(ML, cc, "cabeça do pilar (grupo no pilar)", mx(cab.NtEq), mx(cab.SEq), 0, sec.P.b, sec.P.h, TCH), pVP = pinosMom(ML, cc, "cabeça do pilar (grupo na viga principal, ⊥ às fibras)", 0, hyp(mx(cab.NtEq), mx(cab.SEq)), 0, sec.VP.b, sec.VP.h, TCH);
    var chC = chapaNBR8800(cc, pPil, TCH, Math.max(0.03, sec.P.h - 0.05), hyp(mx(cab.Nt), mx(cab.S)), hyp(mx(cab.NtEq), mx(cab.SEq))), f90C = fendilha(ML, cc, mx(cab.NtEq), sec.VP, sec.VP.h / 2, RAX);
    L.ligacoes.cabeca = { descricao: "Cabeça do pilar: a viga principal APOIA no topo do pilar (apoio ⊥ às fibras verificado à parte) e é presa por UMA chapa interna de aço + pinos inox no pilar e na viga, que resistem ao arrancamento (sucção do vento) e ao cortante horizontal.", pinosPilar: pPil, pinosViga: pVP, pinos: pPil, chapa: chC, f90: f90C, N_arrancamento_kN: cab.Nt, S_kN: cab.S, ok: pPil.ok && pVP.ok && chC.ok && f90C.ok, eta: Math.max(pPil.eta, pVP.eta, chC.eta, f90C.eta), passos: pPil.passos.concat(pVP.passos).concat(chC.passos).concat(f90C.passos) };
    /* (4) caibro × viga principal: parafusos de rosca total a 45° (arrancamento + deslocamento horizontal); apoio ⊥ à parte */
    var cb = NF.caibro, Fv = Math.sqrt(Math.pow(cb.upEq, 2) + Math.pow(cb.HEq, 2) + Math.pow(cb.VEq, 2)), lefA = Math.min(150, sec.VS.h * 1000 * Math.SQRT2 - 20), lefB = Math.min(150, sec.VP.h * 1000 * Math.SQRT2 - 20);
    var RAXc = ML.roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: lefA, lefB: lefB, kmod: cc.kmod }).Rd, nWT = 2, rI;
    while (nWT < 24) { rI = ML.roscaInclinada({ F: Math.max(Fv, 0.05), n: nWT, Rax_d: RAXc, anguloGraus: 45 }); if (rI.ok) break; nWT += 2; }
    L.ligacoes.caibroVP = { descricao: "Caibro sobre a viga principal: parafusos de rosca total (WT-T 8,2) a 45°, em pares cruzados, resistem ao arrancamento e ao deslocamento horizontal; o apoio vertical é por contato ⊥ às fibras.", porApoio: nWT, parafuso: "WT-T-8,2", Rax_d: RAXc, lef_mm: [lefA, lefB], F_eq: Fv, arrancamento_kN: cb.up, horizontal_kN: cb.H, cortante_kN: cb.V, ok: rI.ok, eta: rI.eta, passos: ["Rosca total WT-T 8,2: Rax,d = " + br(RAXc) + " kN (lef " + br(lefA, 0) + " / " + br(lefB, 0) + " mm); F = √(arrancamento² + H² + V²) = " + br(Fv) + " kN"].concat(rI.passos) };
    /* (5) base rotulada: chapa interna + pinos no pilar, placa de base e chumbadores (NBR 8800), sem momento */
    var bs = NF.base, pB = pinosMom(ML, cc, "base do pilar (grupo no pilar)", mx(bs.NtEq), mx(bs.HEq), 0, sec.P.b, sec.P.h, TCH), chB = chapaNBR8800(cc, pB, TCH, Math.max(0.03, sec.P.h - 0.05), hyp(mx(bs.Nt), mx(bs.H)), hyp(mx(bs.NtEq), mx(bs.HEq)));
    var lp = lp5(sec.P), pl = null, kk;
    for (kk = 0; kk < CHUMB.length; kk++) { var d = CHUMB[kk][0], As = CHUMB[kk][1], Ab = Math.PI / 4 * d * d * 1e6; pl = ML.placaBase({ lp: lp, M: 0, Ntracao: bs.Nt, Ncompressao: bs.Nc, H: bs.H, FtRd: ML.chumbadorFtRd(500, As, 1.25), FvRd: ML.chumbadorFvRd(500, Ab), espessura_mm: 25, tChapa: TCH, hpChapa: Math.max(0.05, lp - 0.10), nChapas: 1, cfg: cc }); pl.chumbDiametro_mm = d * 1000; if (pl.ok) break; }
    L.ligacoes.base = { descricao: "Base ROTULADA do pilar (sem momento, decisão da estabilidade por mão-francesa): chapa interna t = 8 mm em fenda no pé do pilar + pinos inox; placa de base e chumbadores químicos sobre a fundação (arrancamento por sucção do vento e cortante).", pinos: pB, chapa: chB, placaBase: pl, N_tracao_kN: bs.Nt, N_compressao_kN: bs.Nc, H_kN: bs.H, ok: pB.ok && chB.ok && pl.ok, eta: Math.max(pB.eta, chB.eta, pl.eta), passos: pB.passos.concat(chB.passos).concat(pl.passos || []) };
    L.ligacoes.base.passos.push("A rotação da base é desprezada no modelo (rótula): a chapa em UMA coluna de pinos no pé do pilar não transmite momento relevante; a fundação recebe só força (sem momento).");
    /* (6) ligação com a parede (encostado): estribo + chumbadores; reações fornecidas à parede */
    if (I.encostado) {
      var pa = NF.parede, e = 0.06, zc = 0.10, pCb = no(ML, cc, "caibro no estribo da parede", mx(pa.RxEq), mx(pa.RxEq), hyp(mx(Math.max(pa.RyEq, pa.RyUpEq)), mx(pa.RzEq)), hyp(mx(Math.max(pa.RyEq, pa.RyUpEq)), mx(pa.RzEq)), sec.VS, { descricao: "Caibro no estribo de aço (chapa interna em fenda + pinos inox) preso à parede/viga existente por chumbadores químicos: apoia por contato (peso) e resiste ao arrancamento e ao cortante." });
      var f90P = fendilha(ML, cc, mx(Math.max(pa.RyEq, pa.RyUpEq)), sec.VS, sec.VS.h / 2, RAX), ch = null, nCh = 2, selC = null;
      for (kk = 0; kk < CHUMB.length && !selC; kk++) [2, 4].forEach(function (nc2) { if (selC) return; var d2 = CHUMB[kk][0], As2 = CHUMB[kk][1], Ft = ML.chumbadorFtRd(500, As2, 1.25), Fvr = ML.chumbadorFvRd(500, Math.PI / 4 * d2 * d2 * 1e6), Tn = Math.max(pa.Rx, 0) / nc2 + Math.max(pa.Ry, pa.RyUp) * e / zc / (nc2 / 2), Vn = hyp(Math.max(pa.Ry, pa.RyUp), pa.Rz) / nc2, et = Tn / Ft + Vn / Fvr; if (et <= 1) selC = { d: d2, n: nc2, As: As2, T: Tn, V: Vn, FtRd: Ft, FvRd: Fvr, eta: et }; });
      if (!selC) { var dL = CHUMB[CHUMB.length - 1], FtL = ML.chumbadorFtRd(500, dL[1], 1.25), FvL = ML.chumbadorFvRd(500, Math.PI / 4 * dL[0] * dL[0] * 1e6), TL = Math.max(pa.Rx, 0) / 4 + Math.max(pa.Ry, pa.RyUp) * e / zc / 2, VL = hyp(Math.max(pa.Ry, pa.RyUp), pa.Rz) / 4; selC = { d: dL[0], n: 4, As: dL[1], T: TL, V: VL, FtRd: FtL, FvRd: FvL, eta: TL / FtL + VL / FvL }; }
      L.ligacoes.parede = { descricao: "Ligação do caibro com a parede/viga existente: estribo de aço galvanizado (chapa interna t = 8 mm em fenda) + chumbadores químicos. A CAPACIDADE DA PAREDE e do substrato (arrancamento do chumbador, esmagamento) é verificação do RT: as reações abaixo são entregues a ele.", pinos: pCb.pinos, chapa: pCb.chapa, f90: f90P, chumbadores: selC, reacoes: { Rx_kN: pa.Rx, Ry_kN: pa.Ry, RyUp_kN: pa.RyUp, Rz_kN: pa.Rz, excentricidade_m: e, braco_m: zc }, ok: pCb.ok && f90P.ok && selC.eta <= 1 + 1e-9, eta: Math.max(pCb.eta, f90P.eta, selC.eta), passos: pCb.passos.concat(f90P.passos).concat(["Chumbadores M" + Math.round(selC.d * 1000) + " × " + selC.n + " por caibro: tração = Rx/n + Ry·e/(z·n/2) = " + br(selC.T) + " kN (e = " + br(e * 100, 0) + " cm da face ao eixo da chapa; z = " + br(zc * 100, 0) + " cm), cortante " + br(selC.V) + " kN → η = " + br(selC.eta, 3) + " (interação linear). Reação na parede por caibro: Ry↓ " + br(pa.Ry) + " kN, Ry↑ " + br(pa.RyUp) + " kN, Rx " + br(pa.Rx) + " kN, Rz " + br(pa.Rz) + " kN — verificação do RT."]) };
    }
    Object.keys(L.ligacoes).forEach(function (k) { var l = L.ligacoes[k]; L.verificacoes.push({ nome: k, eta: l.eta, ok: l.ok }); });
    L.ok = L.verificacoes.every(function (v) { return v.ok; }); L.multiplicidade = mult;
    L.avisos.push("T5: ligações dimensionadas pela NBR 7190-1:2022 (cap. 7: pinos, Johansen, n_ef, espaçamentos Tab. 14, γ_lig = 1,4) e NBR 8800 (chapa: bruta, líquida, esmagamento); MLC pela EN 14080 (fonte secundária). Uma chapa por nó; pinos contados pela geometria.");
    return L;
  }

  /* ---------------------------------------------------------------- AUDITOR */
  function auditar(o) {
    var A = [], G = o.G, I = G.info, ap = o.aparo, res = o.res;
    function ach(regra, peca, msg, cor) { A.push({ regra: regra, peca: peca, mensagem: msg, correcao: cor }); }
    if (ap && ap.folgas) ap.folgas.forEach(function (f) { if (f.folga_mm < FOLGA * 1000 - 0.5) ach("folga-construtiva", f.peca, "Folga de " + f.folga_mm.toFixed(1).replace(".", ",") + " mm contra " + f.contra + " (mínimo 10 mm).", "Aumentar o aparo da ponta."); });
    if (!ap || !ap.folgas || !ap.folgas.length) ach("folga-nao-medida", "T5", "As folgas construtivas não foram medidas.", "Rodar o aparo (aparar).");
    var bal = Math.max(G.p.balCaibro, G.p.balViga); if (G.p.balCaibro > I.vao / 3 + 1e-9) ach("balanco-caibro", "VS", "Balanço do caibro (" + br(G.p.balCaibro) + " m) maior que 1/3 do vão (" + br(I.vao / 3) + " m).", "Reduzir o balanço ou aumentar a seção.");
    if (I.zP.length >= 2 && G.p.balViga > (I.zP[1] - I.zP[0]) / 2 + 1e-9) ach("balanco-viga", "VP", "Balanço da viga principal (" + br(G.p.balViga) + " m) maior que metade do vão entre pilares.", "Reduzir o balanço ou aumentar a seção.");
    if (o.G.membros.filter(function (m) { return m.g === "P"; }).length < 2) ach("pilar-sem-apoio", "P", "Menos de 2 pilares: a estrutura não tem apoio.", "Revisar a geometria.");
    var Hlivre = I.Hl - (o.sec.VP ? o.sec.VP.h / 2 : 0) - (o.sec.VS ? o.sec.VS.h / 2 : 0); if (Hlivre < 2.0) ach("pe-direito-livre", "P", "Pé-direito livre no lado baixo = " + br(Hlivre) + " m (< 2,00 m).", "Subir o pé-direito ou reduzir a inclinação/seções.");
    Object.keys((res && res.esbeltez) || {}).forEach(function (g) { if (res.esbeltez[g].lambdaMax > 140) ach("esbeltez", g, "Esbeltez " + res.esbeltez[g].lambdaMax.toFixed(0) + " > 140 no grupo " + g + ".", "Engrossar a peça."); });
    var vl = o.lig && o.lig.verificacoes ? o.lig.verificacoes : []; vl.forEach(function (v) { if (!v.ok) ach("ligacao-t5", v.nome, "Ligação '" + v.nome + "' reprova (η = " + (isFinite(v.eta) ? v.eta.toFixed(2).replace(".", ",") : "sem solução") + ").", "Aumentar a seção, a chapa ou os pinos e recalcular."); });
    var rp = {}; A.forEach(function (a) { rp[a.regra] = (rp[a.regra] || 0) + 1; });
    return { achados: A, porRegra: rp, ok: A.length === 0 };
  }

  /* ---------------------------------------------------------------- PROJETO COMPLETO */
  /** cresce a DIMENSÃO que a ligação reprovada exige: chapa (seção líquida) pede ALTURA; grupo de pinos (d ≤ t/2, espaçamento a2/a3, fendilhamento) pede LARGURA */
  function crescerDim(q, sec, g, dim) {
    var L = q.limites[g] || { hMax: 0.5, bMax: 0.25 }, s = sec[g], pa = q.passo.altura, pl = q.passo.largura; if (!s) return null; var antes = { b: s.b, h: s.h };
    if (g === "P") { if (s.b + pl > L.bMax + 1e-9) return null; s.b = U.r2(s.b + pl); s.h = s.b; return antes; }
    var ordem = dim === "h" ? ["h", "b"] : ["b", "h"], k;
    for (k = 0; k < 2; k++) { if (ordem[k] === "h" && s.h + pa <= L.hMax + 1e-9) { s.h = U.r2(s.h + pa); return antes; } if (ordem[k] === "b" && s.b + pl <= L.bMax + 1e-9) { s.b = U.r2(s.b + pl); return antes; } }
    return null;
  }
  function projetar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var laco = [], part = copia(partida), d, lig, k, G, q, ap, F, avisosL = [];
    var MAPA = { mfPilarBarra: ["MF"], mfPilarNo: ["P"], mfViga: ["VP"], mfCaibro: ["VS"], cabeca: ["P", "VP"], caibroVP: ["VS"], base: ["P"], parede: ["VS"] };
    for (k = 0; k < (opcoes.voltasLig || 8); k++) {
      d = C5.dimensionar(proj, part, opcoes); q = proj._pad5; G = T5.geometria(q.params); ap = aparar(G, d.secoes); lig = t5Ligacoes(q, d.secoes, d.resultado, G, ap);
      if (lig.ok || d.semSolucao) break;
      var grew = false; lig.verificacoes.forEach(function (v) { if (v.ok) return; var lg = lig.ligacoes[v.nome], dim = lg && lg.chapa && lg.chapa.ok === false ? "h" : "b"; (MAPA[v.nome] || []).forEach(function (g) { var ant = crescerDim(q, d.secoes, g, dim); if (ant) { grew = true; laco.push({ volta: k + 1, ligacao: v.nome, grupo: g, dimensao: dim, antes: ant, depois: { b: d.secoes[g].b, h: d.secoes[g].h } }); } }); });
      if (!grew) break; avisosL.push("T5: ligação reprovada (" + lig.verificacoes.filter(function (v) { return !v.ok; }).map(function (v) { return v.nome; }).join(", ") + ") — seção crescida (volta " + (k + 1) + ")."); part = copia(d.secoes);
    }
    d.resultado.avisos = d.resultado.avisos.concat(avisosL);
    F = T5.fonte(q.params, d.secoes, { classe: q.classe }, ap);
    var out = { secoes: d.secoes, resultado: d.resultado, historico: d.historico, semSolucao: d.semSolucao, pior: d.pior, ligacoes: { ok: lig.ok, verificacoes: lig.verificacoes, avisos: [] }, tipologia: "T5", aparo: { folgas: ap.folgas, resumo: ap.resumo } };
    out.fonte = { pecas: F.pecas, volume_por_material_m3: T5.volumePorMaterial(F.pecas) };
    out.t5 = { params: q.params, info: { vao: G.info.vao, comp: G.info.comp, incl: G.info.incl, sc: G.info.sc, Hh: G.info.Hh, Hl: G.info.Hl, z0: G.info.z0, zN: G.info.zN, xa: G.info.xa, xb: G.info.xb, zP: G.info.zP, zC: G.info.zC, linhas: G.info.linhas, mfD: G.info.mfD, encostado: G.info.encostado, ladoEnc: G.info.ladoEnc, ripa: G.info.ripa, areaCob: G.info.areaCob, areaPlanta: G.info.areaPlanta, nCaibros: G.info.nCaibros, nPilares: G.info.nPilares, temMFX: G.info.temMFX },
      membros: ap.membros.map(function (m) { return { id: m.id, g: m.g, sub: m.sub || null, p0: m.p0, p1: m.p1, eixo0: m.eixo0, eixo1: m.eixo1, nos: m.nos || [], bisel: m.bisel || null, linha: m.linha == null ? null : m.linha, z: m.z == null ? null : m.z, zP: m.zP == null ? null : m.zP, hospede: m.hospede || null, parede: m.parede || null, pilarEm: m.pilarEm || null, vigaEm: m.vigaEm || null }; }), folgas: ap.folgas };
    out.lacoLigacao = laco; out.ligacoesT5 = lig; out.auditoria = auditar({ G: G, sec: d.secoes, res: d.resultado, lig: lig, aparo: ap });
    return out;
  }

  var MadT5Lig = { aparar: aparar, ligacoes: t5Ligacoes, auditar: auditar, projetar: projetar, multGeo: multGeo, chapaNBR8800: chapaNBR8800, pinosMom: pinosMom, fendilha: fendilha, crescerDim: crescerDim, CHUMB: CHUMB, TCH: TCH };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT5Lig;
  else global.MadT5Lig = MadT5Lig;
})(typeof window !== "undefined" ? window : this);

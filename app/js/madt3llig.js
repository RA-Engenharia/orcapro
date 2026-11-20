/* =====================================================================
 * madt3llig.js — T3L (telhado de 4 águas em L, com rincão): ENCONTROS (folga construtiva ≥ 10 mm), LIGAÇÕES (as do T3 + rincão × cumeeira/espigão interno, rincão × canto côncavo, terça × rincão,
 * caibro de meio), AUDITOR e o PROJETO COMPLETO. Motor PURO, ES5, Node-testável. Reaproveita do T3 (madt3lig.js) as caixas orientadas, a chapa única, os grupos de pinos e as chapas (NBR 8800);
 * o resto é cópia adaptada ao L (asas A e B, rincão). Fontes e decisões: docs/madeira/T3L-REFERENCIA.md.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var TL = req("MadT3L", "madt3l.js"), T3 = TL.T3, C3 = req("MadT3Calc", "madt3calc.js"), CL = req("MadT3LCalc", "madt3lcalc.js"), L3 = req("MadT3Lig", "madt3lig.js"), U = TL._util, D = U.D, ext = U.ext, hyp = U.hyp, br = U.br, copia = U.copia, norm = U.norm, rd = U.rd;
  var FOLGA = T3.FOLGA, caixa = L3.caixa, distCaixas = L3.distCaixas, distPtCaixa = L3.distPtCaixa, chapaUnica = L3.chapaUnica, pontaFrechalCabe = L3.pontaFrechalCabe, noChapa = L3.noChapa, noChapaM = L3.noChapaM, pinosMom = L3.pinosMom, chapaNBR8800 = L3.chapaNBR8800;
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function un(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  /** ângulos de abertura da diagonal Howe da tesoura de extremidade (asas A e B): o pior das duas */
  function howeAngulosL(G) {
    var I = G.info, p = G.p, bs = 0, bi = 0;
    G.membros.forEach(function (m) {
      if (m.g !== "DG" || m.tes !== 0) return;
      var B = m.asa === "B", ci = B ? 0 : 1, span = B ? p.bb : p.b, hb = span / 2, top = m.p0[2] > m.p1[2] ? m.p0 : m.p1, bot = top === m.p0 ? m.p1 : m.p0, dz = bot[ci] - top[ci], dy = bot[2] - top[2], Ld = Math.sqrt(dz * dz + dy * dy) || 1, sg = top[ci] < hb ? 1 : -1, ux = sg, uy = p.incl, Lu = Math.sqrt(ux * ux + uy * uy);
      bs = Math.max(bs, Math.acos(Math.min(1, Math.abs(dz * ux + dy * uy) / (Ld * Lu)))); bi = Math.max(bi, Math.acos(Math.min(1, Math.abs(dz) / Ld)));
    });
    return { betaBS: bs, betaBI: bi };
  }

  var MT_ = null;
  function aparar(G, sec) {
    var MT = D().MT, I = G.info, p = G.p, a = p.a, b = p.b, M = G.membros.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.eixo0 = m.p0.slice(); c.eixo1 = m.p1.slice(); return c; }), folgas = [];
    function secDe(m) { return sec[m.g === "DV" ? "DX" : m.g] || { b: 0.1, h: 0.2 }; }
    function cx(m) { return caixa(m.p0, m.p1, T3.upDe(m), secDe(m).b, secDe(m).h); }
    function idx(id) { return M.filter(function (m) { return m.id === id; })[0]; }
    /* (a) Howe: tesouras da asa A (plano x = const), da asa B (plano z = const: coordenadas trocadas) e meias-tesouras leste (asa A) e norte (asa B) */
    if (I.tesouraTipo === "howe" && sec.DG && sec.BS && sec.BI && sec.PD) {
      var secT = { DG: sec.DG, BS: sec.BS, BI: sec.BI, PD: sec.PD }, secH = { BS: sec.MS, BI: sec.MI, PD: sec.MP, DG: sec.MG };
      function howeGrupo(lista, span, yT, paraLocal, deLocal, secG, tagContra) {
        var GT = { p: { b: span, incl: p.incl }, info: { yT: yT, Hp: I.Hp, sc: I.sc }, membros: lista };
        lista.forEach(function (c) { if (c.g !== "DG") return; var r = MT.T2.howeAparar(c, GT, secG), m = c.orig, a0 = deLocal(r.p0), a1 = deLocal(r.p1); m.p0 = a0; m.p1 = a1; m.folga = r.folga; m.bisel = { tipo: "howe", aparo: r.aparo }; folgas.push({ peca: m.id, contra: tagContra, folga_mm: Math.min(r.folga.BS, r.folga.BI, r.folga.PD) * 1000 }); });
      }
      var tesA = [], tesB = []; M.forEach(function (m) { if (m.tes == null) return; var c = { id: m.id, g: m.g, tes: m.tes, agua: m.agua, orig: m }; if (m.asa === "B") { c.p0 = [m.p0[1], m.p0[0], m.p0[2]]; c.p1 = [m.p1[1], m.p1[0], m.p1[2]]; tesB.push(c); } else { c.p0 = m.p0.slice(); c.p1 = m.p1.slice(); tesA.push(c); } });
      howeGrupo(tesA, b, I.yT, null, function (P) { return P; }, secT, "BS/BI/PD");
      /* asa B: o pseudo-ponto é [posição z da tesoura, s = x, y]; volta a [x, z, y] */
      tesB.forEach(function (c) { c.pos = c.p0[0]; });
      (function () { var porPos = {}; tesB.forEach(function (c) { (porPos[c.pos] = porPos[c.pos] || []).push(c); }); Object.keys(porPos).forEach(function (k) { var pos = +k; howeGrupo(porPos[k], p.bb, I.yTB, null, function (P) { return [P[1], pos, P[2]]; }, secT, "BS/BI/PD"); }); })();
      [["E", function (u) { return [a - u, b / 2]; }, b], ["N", function (u) { return [p.bb / 2, p.c - u]; }, p.bb]].forEach(function (H) {
        var s2 = H[0], Pm = H[1], mp = { MS: "BS", MI: "BI", MP: "PD", MG: "DG" }, pseudo = [], dist = function (m, q) { var xy = q === 0 ? m.p0 : m.p1; return s2 === "E" ? a - xy[0] : p.c - xy[1]; };
        M.forEach(function (m) { if (m.agua !== s2 || !mp[m.g]) return; pseudo.push({ id: m.id, g: mp[m.g], tes: 0, agua: "F", p0: [0, dist(m, 0), m.p0[2]], p1: [0, dist(m, 1), m.p1[2]], orig: m }); });
        howeGrupo(pseudo, H[2], s2 === "E" ? I.yT : I.yTB, null, function (P) { var xy = Pm(P[1]); return [xy[0], xy[1], P[2]]; }, secH, "MS/MI/MP");
      });
    }
    /* (b) espigão na ponta da cumeeira */
    M.filter(function (m) { return m.g === "E" || m.g === "RC"; }).forEach(function (E) {
      var ap = E.eixo1, ex = un(sub(E.eixo1, E.eixo0)), viz = M.filter(function (m) {
        if (m === E || m.g === "P" || m.g === "PO" || m.g === "DX" || m.g === "DV" || m.g === "DP" || m.g === "LB" || m.g === "T" || m.g === "FR" || m.g === "BI" || m.g === "MI") return false;
        var d = sub(m.eixo1, m.eixo0), L2 = dot(d, d), t = Math.max(0, Math.min(1, dot(sub(ap, m.eixo0), d) / L2)), q = [m.eixo0[0] + d[0] * t, m.eixo0[1] + d[1] * t, m.eixo0[2] + d[2] * t]; return norm(q, ap) < 0.45; });
      var t = 0, sE = secDe(E), minD = 0, k;
      for (k = 0; k < 400; k++) {
        var p1 = [E.eixo1[0] - ex[0] * t, E.eixo1[1] - ex[1] * t, E.eixo1[2] - ex[2] * t], bE = caixa(E.eixo0, p1, T3.upDe(E), sE.b, sE.h), L = norm(E.eixo0, p1);
        minD = Infinity; viz.forEach(function (v) { var bv = cx(v), d = distCaixas(bE, bv, [L / 2 - 0.5, L / 2], [-bv.s[0], bv.s[0]], 0.004); if (d < minD) minD = d; });
        if (minD >= FOLGA - 1e-9) break; t += 0.002;
      }
      E.p1 = [E.eixo1[0] - ex[0] * t, E.eixo1[1] - ex[1] * t, E.eixo1[2] - ex[2] * t]; E.bisel = { tipo: "espigao-cumeeira", aparo: t }; folgas.push({ peca: E.id, contra: viz.map(function (v) { return v.id; }).join(","), folga_mm: minD * 1000, aparo_mm: t * 1000 });
    });
    /* (c) frechal nos cantos */
    var FRs = M.filter(function (m) { return m.g === "FR"; }), Es = M.filter(function (m) { return (m.g === "E" || m.g === "RC") && m.canto; });
    FRs.forEach(function (F) {
      var sF = secDe(F), L0 = norm(F.eixo0, F.eixo1), exF = un(sub(F.eixo1, F.eixo0)), res = { i: 0, j: 0 };
      [["i", F.eixo0, 1], ["j", F.eixo1, -1]].forEach(function (EN) {
        var canto = EN[1], vi = Es.filter(function (E) { return Math.abs(E.canto[0] - canto[0]) < 1e-3 && Math.abs(E.canto[1] - canto[1]) < 1e-3; })[0]; if (!vi) return;
        var bE = cx(vi), t = 0, k, minD = 0;
        for (k = 0; k < 300; k++) {
          var q0 = EN[0] === "i" ? [F.eixo0[0] + exF[0] * t, F.eixo0[1] + exF[1] * t, F.eixo0[2] + exF[2] * t] : F.eixo0, q1 = EN[0] === "j" ? [F.eixo1[0] - exF[0] * t, F.eixo1[1] - exF[1] * t, F.eixo1[2] - exF[2] * t] : F.eixo1, bF = caixa(q0, q1, T3.upDe(F), sF.b, sF.h), Lq = norm(q0, q1);
          var jan = EN[0] === "i" ? [-Lq / 2, -Lq / 2 + 0.6] : [Lq / 2 - 0.6, Lq / 2];
          minD = distCaixas(bF, bE, jan, [-bE.s[0], bE.s[0]], 0.004); if (minD >= FOLGA - 1e-9) break; t += 0.002;
        }
        res[EN[0]] = t; folgas.push({ peca: F.id + (EN[0] === "i" ? "/ini" : "/fim"), contra: vi.id, folga_mm: minD * 1000, aparo_mm: t * 1000 });
      });
      var q0b = [F.eixo0[0] + exF[0] * res.i, F.eixo0[1] + exF[1] * res.i, F.eixo0[2] + exF[2] * res.i], q1b = [F.eixo1[0] - exF[0] * res.j, F.eixo1[1] - exF[1] * res.j, F.eixo1[2] - exF[2] * res.j]; F.p0 = q0b; F.p1 = q1b; F.bisel = { tipo: "frechal-canto", aparo: [res.i, res.j] };
    });
    /* (d) terças contra o espigão */
    M.filter(function (m) { return m.g === "T"; }).forEach(function (T) {
      var sT = secDe(T), exT = un(sub(T.eixo1, T.eixo0)), res = { i: 0, j: 0 };
      [["i", T.eixo0], ["j", T.eixo1]].forEach(function (EN) {
        var vi = M.filter(function (m) { return m.g === "E" || m.g === "RC"; }).filter(function (E) { var d = sub(EN[1], E.eixo0), ex = un(sub(E.eixo1, E.eixo0)), t = dot(d, ex), q = [E.eixo0[0] + ex[0] * t, E.eixo0[1] + ex[1] * t, E.eixo0[2] + ex[2] * t]; return norm(q, EN[1]) < 0.02; })[0]; if (!vi) return;
        var bE = cx(vi), t = 0, k, minD = 0;
        for (k = 0; k < 400; k++) {
          var q0 = EN[0] === "i" ? [T.eixo0[0] + exT[0] * t, T.eixo0[1] + exT[1] * t, T.eixo0[2] + exT[2] * t] : T.eixo0, q1 = EN[0] === "j" ? [T.eixo1[0] - exT[0] * t, T.eixo1[1] - exT[1] * t, T.eixo1[2] - exT[2] * t] : T.eixo1, bT = caixa(q0, q1, [0, 0, 1], sT.b, sT.h), Lq = norm(q0, q1);
          var jan = EN[0] === "i" ? [-Lq / 2, -Lq / 2 + 0.5] : [Lq / 2 - 0.5, Lq / 2], jE = [-bE.s[0], bE.s[0]];
          minD = distCaixas(bT, bE, jan, jE, 0.006); if (minD >= FOLGA - 1e-9) break; t += 0.002;
        }
        res[EN[0]] = t; folgas.push({ peca: T.id + (EN[0] === "i" ? "/ini" : "/fim"), contra: vi.id, folga_mm: minD * 1000, aparo_mm: t * 1000 });
      });
      T.p0 = [T.eixo0[0] + exT[0] * res.i, T.eixo0[1] + exT[1] * res.i, T.eixo0[2] + exT[2] * res.i]; T.p1 = [T.eixo1[0] - exT[0] * res.j, T.eixo1[1] - exT[1] * res.j, T.eixo1[2] - exT[2] * res.j]; T.bisel = { tipo: "terca-espigao", angulo_graus: 45, aparo: [res.i, res.j] };
    });
    var minF = Infinity; folgas.forEach(function (f) { if (f.folga_mm < minF) minF = f.folga_mm; });
    return { membros: M, folgas: folgas, resumo: { n: folgas.length, minimo_mm: minF, ok: folgas.length > 0 && minF >= FOLGA * 1000 - 0.5 } };
  }

  function ventoLocalAsa(q, r, G, bw, nomeAsa) {
    var I = G.info, p = G.p, qd = (r.vento && r.vento.q) || 0, cpi = r.vento && r.vento.cpiMax != null ? r.vento.cpiMax : 0, h = p.peDireito + I.incl * bw / 2, wf = Math.min(bw, 2 * h) / 10, pLoc = qd * (1.2 + cpi), g2 = p.telha.peso + ((q.cargas && q.cargas.outros) || 0);
    var vNet = Math.max(0, 1.4 * pLoc - g2 * I.sc), ell = wf * Math.SQRT2, Ater = ell * I.dz, Th = Math.SQRT2 * (bw / 2 + I.beiral), Ase = 2 * wf * Th / 2;
    return { fonte: "EN 1991-1-4, Tabela 7.5 (cobertura em 4 águas, zonas de aresta) — SECUNDÁRIA, a confirmar pelo RT", cpe: -1.2, cpi: cpi, q: qd, h_m: h, wf_m: wf, wf: wf, p_loc_kN_m2: pLoc, g2_plano_kN_m2: g2 * I.sc, vNet_kN_m2: vNet, ell_m: ell, A_terca_m2: Ater, A_sela_m2: Ase, V_terca: vNet * Ater, V_sela: vNet * Ase,
      asa: nomeAsa, b_asa_m: bw, passos: ["Vento local de aresta (asa " + nomeAsa + ", largura " + br(bw) + " m): wf = mín(b; 2h)/10 = mín(" + br(bw) + "; " + br(2 * h) + ")/10 = " + br(wf, 2) + " m ao longo de cada espigão; cpe = −1,2 (EN 1991-1-4, Tab. 7.5, SECUNDÁRIA — a confirmar pelo RT); p = q·(1,2 + cpi) = " + br(qd, 3) + " × " + br(1.2 + cpi, 2) + " = " + br(pLoc, 3) + " kN/m²; líquido por m² de planta: 1,4·p − g2·√(1+i²) = " + br(1.4 * pLoc, 3) + " − " + br(g2 * I.sc, 3) + " = " + br(vNet, 3) + " kN/m².", "Ponta da terça: ℓ = wf·√2 = " + br(ell, 2) + " m × dz = " + br(I.dz, 2) + " m → " + br(Ater, 2) + " m² → V = " + br(vNet * Ater) + " kN; sela: metade da faixa dos dois lados (" + br(Ase, 2) + " m²) → V = " + br(vNet * Ase) + " kN."] };
  }

  /** VENTO LOCAL DE ARESTA POR ASA: a asa A usa b e a asa B usa bb (h e wf próprios); vale a asa de maior força na terça (a favor da segurança) */
  function ventoLocal(q, r, G) {
    var I = G.info, A = ventoLocalAsa(q, r, G, I.b, "A"), B = ventoLocalAsa(q, r, G, I.bb, "B"), w = (B.V_terca > A.V_terca + 1e-12) ? B : A;
    return ext({}, w, { asas: { A: A, B: B }, passos: w.passos.concat(["Asa " + (w === A ? "A" : "B") + " governa (V_terça A " + br(A.V_terca, 2) + " kN, B " + br(B.V_terca, 2) + " kN)."]) });
  }

  function lLigacoes(q, sec, r, G, ap) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), agg = {}, perf = C3.perfilFn(q), p = q.params;
    Object.keys(r.reacoes).forEach(function (k) { var o = r.reacoes[k], g = "P", a1 = agg[g] || (agg[g] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, NminEq: 1e9, HmaxEq: 0 }); a1.Nmax = Math.max(a1.Nmax, o.Nmax); a1.Nmin = Math.min(a1.Nmin, o.Nmin); a1.Hmax = Math.max(a1.Hmax, o.Hmax); a1.NminEq = Math.min(a1.NminEq, o.NminEq); a1.HmaxEq = Math.max(a1.HmaxEq, o.HmaxEq); });
    var c = { kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, cc = ML.cfg(c), Lp0 = Math.abs(p.peDireito), pesoPil = { P: Math.max(sec.P.b * sec.P.h * Lp0 * q.pesoMLC, sec.PO.b * sec.PO.h * Lp0 * q.pesoMLC) };
    var howe = p.tesoura.tipo === "howe" ? howeAngulosL(G) : null, esf = copia(r.esf);
    ["BS", "BI", "PD", "DG", "T"].forEach(function (g) { if (!esf[g]) esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }; });
    var L = ML.pacoteT2({ howe: howe, sistema: "tesoura", pesoPilar: pesoPil, secoes: sec, cfg: c, esf: esf, reacoes: agg, incl: p.incl, contrav: r.contrav || null, f90Perp: r.f90Perp || null, mat: { fc90k: cl.fc90k, fc0k: cl.fc0k, kmod90: perf("longa").kmod } });
    L.tipologia = "T3L";
    function eqv(x, k) { return x && x[k + "Eq"] != null ? x[k + "Eq"] : (x && x[k]) || 0; }
    var E = r.espigao, tg = p.incl, k0 = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: k0.RaxK_cruzado150, lefRef: k0.lefRef, lefA: k0.lefRef * 0.8, lefB: k0.lefRef * 0.8, kmod: cc.kmod }).Rd;
    /* espigão × cumeeira (ponta): chapa interna em fenda + pinos; força axial N e transversal S do esforço na extremidade */
    var Sa = Math.max(0.05, E.apice.S || 0), Seqa = Math.max(0.05, E.apice.SEq || 0);
    L.ligacoes.espigaoCumeeira = noChapa(ML, cc, "espigão × cumeeira (ponta)", Math.max(0.05, E.apice.N), Math.max(0.05, E.apice.NEq), Sa, Seqa, sec.E, { descricao: "Espigão na ponta da cumeeira: chapa interna de aço t = 8 mm em fenda + pinos inox no espigão; a ponta é cortada em bisel com folga ≥ 10 mm das faces de cumeeira, banzos e meia-tesoura (carga SÓ por chapa e pinos); a chapa se prende à cumeeira/tesoura por pinos no grupo do nó." });
    /* VENTO LOCAL nas arestas (revisão do RT): cpe = −1,2 numa faixa ao longo de cada espigão (EN 1991-1-4, Tab. 7.5 — SECUNDÁRIA, a confirmar pelo RT), aplicado só nas LIGAÇÕES (terça × espigão, sela, arrancamento da terça) */
    var vl = ventoLocal(q, r, G);
    L.ventoLocal = vl;
    /* espigão × canto: espigão sobre o frechal e o pilar com sela de aço; empuxo horizontal resolvido pela cinta de aço do anel. A sela fica δ = h_FR/2 acima do eixo do nó do modelo: momento N·δ no grupo de pinos (momento polar) */
    var dlt = sec.FR.h / 2, tgH = tg / Math.SQRT2, cosH = 1 / Math.sqrt(1 + tgH * tgH);
    var Sh = Math.max(0.05, E.heel.S || 0, vl.V_sela * cosH), Seqh = Math.max(0.05, E.heel.SEq || 0, vl.V_sela * cosH), Nh = Math.max(0.05, E.heel.N), Nheq = Math.max(0.05, E.heel.NEq), eVreal = r.excent ? r.excent.dFR + r.excent.evE : dlt;      /* e_v real do arranjo de carpinteiro: eixo do espigão → eixo do frechal; o momento H·e_v vai à CHAPA única, não ao grupo de pinos do espigão */
    L.ligacoes.espigaoCanto = noChapa(ML, cc, "espigão × canto (assentado no cruzamento dos frechais)", Nh, Nheq, Sh, Seqh, sec.E, { descricao: "Espigão no canto: assentado no cruzamento dos frechais (bico de pássaro raso, sem sela-calço) + chapa única interna (t = 8 mm) e pinos inox no espigão; resiste ao empuxo (componente horizontal da compressão do espigão) e ao arrancamento do vento (inclusive a faixa de aresta, cpe local −1,2). O MOMENTO da excentricidade e_v entra na chapa única (ver chapaUnicaCanto), não no grupo de pinos.", momentoSela: { delta_m: eVreal, M_d_kNm: 0, M_eq_kNm: 0, nota: "momento H·e_v verificado na chapa única" } });
    L.ligacoes.espigaoCanto.arrancamento_kN = Math.max(E.heel.V, vl.V_sela); L.ligacoes.espigaoCanto.empuxo_kN = E.heel.H; L.ligacoes.espigaoCanto.arrancamento_local_kN = vl.V_sela;
    L.ligacoes.espigaoCanto.passos = ["Excentricidade do arranjo de carpinteiro: o espigão assenta no cruzamento dos frechais; e_v = dFR + evE = " + br(eVreal * 100, 1) + " cm entre o eixo do espigão e o do frechal. O momento H·e_v NÃO vai ao grupo de pinos do espigão (que leva N = " + br(Nh) + " kN e S): é verificado na chapa única sela + cinta (ligação chapaUnicaCanto).", "Vento local de aresta (cpe = −1,2, faixa de " + br(vl.wf, 2) + " m ao longo do espigão; EN 1991-1-4, Tab. 7.5, SECUNDÁRIA — a confirmar pelo RT): arrancamento líquido na sela V = " + br(vl.V_sela) + " kN, somado ao cortante transversal do grupo (V·cos α = " + br(vl.V_sela * cosH) + " kN)."].concat(L.ligacoes.espigaoCanto.passos);
    var fim = r.cinta.fim || { N: r.cinta.N, NEq: r.cinta.NEq, S: 0, SEq: 0 }, Nc = Math.max(0.05, fim.N), Nceq = Math.max(0.05, fim.NEq), Scn = Math.max(0.05, fim.S), Sceq = Math.max(0.05, fim.SEq);
    L.ligacoes.cintaCanto = noChapaM(ML, cc, "cinta do canto (frechal × frechal)", Nc, Nceq, Scn, Sceq, 0, sec.FR, { descricao: "Cinta de aço no canto do anel: os dois frechais param a ≥ 10 mm do espigão; a tração do anel (empuxo horizontal dos espigões e das tesouras) passa pela cinta (chapa interna t = 8 mm + pinos inox nos dois frechais). Chapa verificada pela seção bruta, LÍQUIDA (fu/γa2, γa2 = 1,35) e pelo esmagamento dos furos (NBR 8800)." });
    L.ligacoes.cintaCanto.passos = ["O empuxo horizontal do espigão no canto (" + br(E.heel.H) + " kN, componente horizontal da força de extremidade) é resolvido pela tração do ANEL do frechal. A cinta transmite a força de EXTREMIDADE do frechal no canto: N,fim = " + br(Nc) + " kN (máximo ELU entre as 4 pontas de canto, análise 3D; o máximo ao longo do frechal é " + br(r.cinta.N) + " kN) e cortante de ponta " + br(Scn) + " kN."].concat(L.ligacoes.cintaCanto.passos);
    L.ligacoes.cintaCanto.N_fim_kN = Nc; L.ligacoes.cintaCanto.N_max_barra_kN = r.cinta.N;
    /* torção nas pontas do frechal: o empuxo horizontal do espigão atua no topo (sela, δ acima do eixo do frechal); a componente ⊥ ao eixo de cada frechal (H/√2, espigão a 45°) gira a ponta: T = (H/√2)·δ; τ = T/(α·a·c²) (maddim7190, 7190-1) somada ao cortante, a favor */
    var tor = r.torcaoFR || C3.torcaoFR(sec, E, r.cinta, D().MD.perfilEResist(q.classe, perf("curta")).f.fvd);
    L.ligacoes.torcaoFrechal = { descricao: "Torção nas pontas do frechal no canto: o empuxo horizontal do espigão atua na sela (no topo do frechal), a δ = " + br(tor.delta * 100, 0) + " cm do eixo; a componente perpendicular ao eixo de cada frechal gira a ponta.", T_kNm: tor.T, tau_T_MPa: tor.tau_T, tau_V_MPa: tor.tau_V, fvd_MPa: tor.fvd, alfa: tor.alfa, eta: tor.eta, ok: tor.ok,
      passos: ["Torção na ponta do frechal: T = (H/√2)·δ = (" + br(tor.H) + "/√2) × " + br(tor.delta, 3) + " = " + br(tor.T, 3) + " kN·m; τT = T/(α·a·c²) = " + br(tor.T, 3) + "/(" + br(tor.alfa, 3) + " × " + br(tor.a, 3) + " × " + br(tor.c, 3) + "²) = " + br(tor.tau_T, 3) + " MPa (α = 1/(3 + 1,8·c/a)); τV = 1,5·V/(b·h) = " + br(tor.tau_V, 3) + " MPa; (τV + τT)/fv,d = (" + br(tor.tau_V, 3) + " + " + br(tor.tau_T, 3) + ")/" + br(tor.fvd, 3) + " → η = " + br(tor.eta, 3) + " (NBR 7190-1:2022, cisalhamento por torção; soma linear, a favor; a seção do frechal cresce no laço se reprovar)."] };
    L.detalheSela = r.detalheSela || "chapa";
    if (L.detalheSela === "chapa") {
      var ref = L.ligacoes.torcaoFrechal;
      L.ligacoes.torcaoFrechal = { descricao: "Torção nas pontas do frechal: NÃO se aplica ao detalhe padrão (sela + cinta numa chapa única, madeira sem torção); o valor abaixo é a referência do detalhe alternativo (sela só sobre o frechal).", referencia: { T_kNm: ref.T_kNm, tau_T_MPa: ref.tau_T_MPa, eta: ref.eta }, eta: 0, ok: true, passos: ["Detalhe padrão: sela + cinta em chapa única — torção do frechal não considerada (referência do detalhe alternativo: η = " + br(ref.eta, 3) + ")."] };
      var Hh2 = Math.max(E.heel.HEq || 0, E.heel.H || 0), cu = null, tCh; [0.008, 0.010, 0.012, 0.016, 0.020].some(function (tt) { tCh = tt; cu = chapaUnica(cc, Hh2, Math.max(0.05, r.cinta.fim.N), eVreal, Math.max(0.03, sec.FR.h - 0.05), tt, L.ligacoes.cintaCanto.pinos); return cu.ok; });      /* e_v real: a chapa cresce em espessura até fechar */
      L.ligacoes.chapaUnicaCanto = ext({ descricao: "Chapa única sela + cinta (t = " + cu.t_mm + " mm, fenda de " + cu.fenda_mm + " mm): entra em fenda no espigão e nos dois frechais; pinos da cinta no eixo do frechal; verificada por M = H·e_v no plano, seção bruta, líquida e cortante (NBR 8800)." }, cu);
      ["espigaoCanto", "cintaCanto"].forEach(function (k) { if (L.ligacoes[k] && L.ligacoes[k].descricao) L.ligacoes[k].descricao = L.ligacoes[k].descricao.replace(/t = 8 mm/g, "t = " + cu.t_mm + " mm"); });      /* descrição, fenda e embutimento acompanham a espessura do laço */
      var fr1 = G.membros.filter(function (m) { return m.id === "FR1"; })[0], pXs = G.info.edges.filter(function (E) { return E.id === "S"; })[0].S, apFR = ap && ap.membros ? ap.membros.filter(function (m) { return m.id === "FR1"; })[0] : null;
      L.ligacoes.pontaFrechalCabe = ext({ descricao: "Os grupos de pinos da sela e da cinta cabem na ponta do frechal." }, pontaFrechalCabe(pXs[1] - pXs[0], apFR && apFR.bisel ? apFR.bisel.aparo[0] : 0, L.ligacoes.cintaCanto.pinos, L.ligacoes.espigaoCanto.pinos));
    }
    /* EMENDA PASSANTE + ESTRIBO da terça no banzo (arranjo de carpinteiro): a terça é BIAPOIADA entre tesouras (a rotação é liberada em cada tesoura; o momento de vão é da terça, verificado no grupo T); a emenda (chapa 8 mm em fenda atravessando o banzo + pinos nos dois trechos)
       transmite SÓ a força AXIAL (tirante do arco do espigão) — NÃO é emenda rígida. O cortante (reação da terça no banzo) vai pelo estribo na face lateral do banzo: V = máx(V da envolvente; arrancamento líquido da faixa de aresta). */
    (function () {
      var eT = r.esf.T || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }, Vem = Math.max(0.05, eT.V, vl.V_terca), Veq = Math.max(0.05, eT.VEq, vl.V_terca);
      L.ligacoes.emendaTerca = noChapa(ML, cc, "emenda passante da terça no banzo (chapa em fenda; só força axial)", Math.max(0.05, eT.Nt, eT.Nc), Math.max(0.05, eT.NtEq, eT.NcEq), Vem, Veq, sec.T, { descricao: "Terça BIAPOIADA entre tesouras, interrompida em cada tesoura e encostada nas faces do banzo (estribo); a emenda passante (chapa interna em fenda que atravessa o banzo, com pinos inox nos dois trechos) transmite SÓ a força axial (tirante do arco do espigão); não é emenda rígida (não transmite momento). V do estribo = máx(V da envolvente, V_terca do vento local) = " + br(Vem) + " kN." });
      /* torção RESIDUAL do banzo: a diferença das reações das terças dos dois lados (um vão carregado, o outro não) atua a b_BS/2 do eixo do banzo: T = ΔR·b_BS/2; (τV + τT)/fv,d */
      var fb = sec.BS, ab = Math.max(fb.b, fb.h), cb = Math.min(fb.b, fb.h), alb = 1 / (3 + 1.8 * cb / ab), dR = Vem, Tb = dR * fb.b / 2, fvd = D().MD.perfilEResist(q.classe, perf("curta")).f.fvd, tTb = Tb / (alb * ab * cb * cb) / 1e3, tVb = 1.5 * Math.max(0.05, (r.esf.BS && (r.esf.BS.VEq || r.esf.BS.V)) || 0) / (fb.b * fb.h) / 1e3, etaTb = (tVb + tTb) / fvd;
      L.ligacoes.torcaoResidualBanzo = { descricao: "Torção residual do banzo superior pela diferença das reações das terças dos dois lados (ΔR × b_BS/2).", dR_kN: dR, T_kNm: Tb, tau_T_MPa: tTb, tau_V_MPa: tVb, fvd_MPa: fvd, eta: etaTb, ok: etaTb <= 1 + 1e-9, passos: ["T = ΔR·b_BS/2 = " + br(dR) + " × " + br(fb.b / 2, 3) + " = " + br(Tb, 3) + " kN·m; τT = T/(α·a·c²) = " + br(tTb, 3) + " MPa; τV = " + br(tVb, 3) + " MPa; (τV + τT)/fv,d = " + br(etaTb, 3) + "."] };
    })();
    /* meia-tesoura × tesoura de extremidade */
    var mt = r.meia, Sm = Math.max(0.05, mt.V || 0), Smeq = Math.max(0.05, mt.VEq || 0);
    L.ligacoes.meiaTesoura = noChapa(ML, cc, "meia-tesoura × tesoura de extremidade (cume)", Math.max(0.05, mt.N), Math.max(0.05, mt.NEq), Sm, Smeq, sec.MS, { descricao: "Banzo superior da meia-tesoura na tesoura de extremidade: chapa interna 8 mm + pinos; a ponta da MS fica a ≥ 10 mm das faces dos banzos da tesoura (bisel) e a carga passa só por chapa e pinos." });
    /* ponta da MI (banzo inferior da meia-tesoura) no nó CENTRAL do BI da tesoura de extremidade: ligação PRÓPRIA — força real de extremidade da MI + a carga do montante no mesmo nó. A MI chega ⊥ ao BI (a tração da MI e o montante vertical são, ambos, ⊥ às fibras do BI): grupo na MI (axial) + grupo no BI (força ⊥ = resultante MI ⊕ montante, α = 90°), chapa de nó pela NBR 8800 e fendilhamento do BI (7.1.1) */
    var pmi = r.pontaMI || { N: 0, NEq: 0, S: 0, SEq: 0, PD: 0, PDEq: 0, R: 0, REq: 0 }, tChM = 0.008;
    var gMI = noChapaM(ML, cc, "ponta da MI (grupo na MI, axial)", Math.max(0.05, pmi.N), Math.max(0.05, pmi.NEq), Math.max(0.05, pmi.S), Math.max(0.05, pmi.SEq), 0, sec.MI, {});
    var pBI = pinosMom(ML, cc, "ponta da MI no BI (força ⊥ às fibras: MI ⊕ montante)", 0, Math.max(0.05, pmi.REq), 0, sec.BI.b, sec.BI.h, tChM), chBI = chapaNBR8800(cc, pBI, tChM, Math.max(0.03, sec.BI.h - 0.05), Math.max(0.05, pmi.R), Math.max(0.05, pmi.REq));
    var heM = sec.BI.h / 2, F90kM = ML.fendilhamentoF90Rk(sec.BI.b, heM, sec.BI.h), F90dM = F90kM * cc.kmod / cc.gLig, eta90M = Math.max(0.05, pmi.REq) / F90dM, refM = null, etaF90 = eta90M, alM = heM / sec.BI.h, FtM = (1 - 3 * alM * alM + 2 * Math.pow(alM, 3)) * Math.max(0.05, pmi.REq);
    if (eta90M > 1) { var nRM = Math.max(2, Math.ceil(FtM / RAX)); nRM += nRM % 2; refM = { parafusos: nRM, Rax_d: RAX, Ft90_d: FtM, ok: nRM <= 12, eta: FtM / (nRM * RAX) }; etaF90 = refM.ok ? refM.eta : eta90M; }
    L.ligacoes.pontaMI = { descricao: "Ponta da MI no nó central do BI da tesoura de extremidade (ligação própria): chapa interna na MI + pinos; no BI, grupo de pinos para a força ⊥ às fibras (tração da MI ⊕ carga do montante no mesmo nó) e chapa de nó pela NBR 8800. O detalhe da chapa cruzada (MI no plano X, BI no plano Z) é do fabricante/RT.",
      pinos: gMI.pinos, chapa: gMI.chapa, banzo: { BI: { pinos: pBI, chapa: chBI, eta: Math.max(pBI.eta, chBI.eta), ok: pBI.ok && chBI.ok, F_perp_d: pmi.R } }, f90: { F_perp_d: pmi.R, F_perp_eq: pmi.REq, F90Rd: F90dM, he_mm: heM * 1000, eta_direto: eta90M, reforco: refM, eta: etaF90, ok: eta90M <= 1 || (refM && refM.ok) },
      F_d: pmi.N, F_eq: pmi.NEq, S_d: pmi.S, montante_kN: pmi.PD, resultante_perp_kN: pmi.R, ok: gMI.ok && pBI.ok && chBI.ok && (eta90M <= 1 || (refM && refM.ok)), eta: Math.max(gMI.eta, pBI.eta, chBI.eta, etaF90),
      passos: ["Ponta da MI: força real de extremidade N = " + br(pmi.N) + " kN (tração; cortante " + br(pmi.S) + " kN) e montante central da tesoura de extremidade no mesmo nó = " + br(pmi.PD) + " kN; resultante ⊥ às fibras do BI (por combinação) R = √(N_MI² + N_PD²) = " + br(pmi.R) + " kN (equivalente da madeira " + br(pmi.REq) + " kN)."].concat(gMI.passos, pBI.passos || [], chBI.passos, ["BI: fendilhamento F⊥,d = " + br(pmi.REq) + " kN × F90,Rd = " + br(F90dM) + " kN (he = " + br(heM * 100, 0) + " cm) → η = " + br(eta90M, 3) + (refM ? "; REFORÇO por " + refM.parafusos + " parafusos de rosca total ⊥ (η = " + br(refM.eta, 3) + "; comprimento efetivo a confirmar pelo RT)" : "") + " (NBR 7190-1:2022, 7.1.1)."]) };
    /* RINCÃO (viga inclinada do canto côncavo ao vértice V): ápice (V) = encontro com a cumeeira B e o espigão interno; pé = sela de aço sobre o cruzamento dos frechais do canto côncavo (a compressão do anel passa pela chapa); CALHA metálica sobre o rincão */
    var RCr = r.rincao || { heel: { N: 0, NEq: 0, S: 0, SEq: 0, V: 0, H: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 }, cintaC: { N: 0, NEq: 0, S: 0, SEq: 0 } }, secRC = sec.RC || sec.E;
    L.ligacoes.rincaoApice = noChapa(ML, cc, "rincão × cumeeira B / espigão interno (vértice V)", Math.max(0.05, RCr.apice.N), Math.max(0.05, RCr.apice.NEq), Math.max(0.05, RCr.apice.S), Math.max(0.05, RCr.apice.SEq), secRC, { descricao: "Rincão no vértice V (encontro das cumeeiras e do espigão interno): chapa interna de aço t = 8 mm em fenda + pinos inox no rincão; a ponta do rincão fica a ≥ 10 mm das faces da cumeeira B e do espigão interno (carga SÓ por chapa e pinos)." });
    var cintaC = RCr.cintaC || { N: 0, NEq: 0, S: 0, SEq: 0 }, NhR = Math.max(0.05, RCr.heel.N, cintaC.N), NhReq = Math.max(0.05, RCr.heel.NEq, cintaC.NEq), ShR = Math.max(0.05, RCr.heel.S, vl.V_sela * 0), ShReq = Math.max(0.05, RCr.heel.SEq);
    L.ligacoes.rincaoCanto = noChapa(ML, cc, "rincão × canto côncavo (sela de aço sobre o cruzamento dos frechais)", NhR, NhReq, ShR, ShReq, secRC, { descricao: "Pé do rincão sobre o canto côncavo: assenta no cruzamento dos frechais (bico de pássaro raso) com sela de aço inox em chapa interna (t = 8 mm) + pinos; a compressão do anel no canto côncavo (" + br(cintaC.N) + " kN) e o empuxo horizontal do rincão (" + br(RCr.heel.H) + " kN) passam pela chapa; calha metálica do rincão lança no beiral para a calha do perímetro." });
    L.ligacoes.rincaoCanto.passos = ["Canto côncavo: N do rincão no pé = " + br(RCr.heel.N) + " kN, empuxo horizontal " + br(RCr.heel.H) + " kN; compressão de extremidade do frechal no canto côncavo = " + br(cintaC.N) + " kN (as duas pontas do frechal param a ≥ 10 mm do rincão: a compressão passa pela chapa/sela, não por contato madeira–madeira)."].concat(L.ligacoes.rincaoCanto.passos || []);
    var E6 = r.espigao6 || { heel: { N: 0, NEq: 0, S: 0, SEq: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 } };
    if (G.membros.some(function (m) { return m.id === "E6"; })) {
      L.ligacoes.espigaoInterno = noChapa(ML, cc, "espigão interno E6 (vértice V × topo da cumeeira A)", Math.max(0.05, E6.heel.N, E6.apice.N), Math.max(0.05, E6.heel.NEq, E6.apice.NEq), Math.max(0.05, E6.heel.S, E6.apice.S), Math.max(0.05, E6.heel.SEq, E6.apice.SEq), sec.E, { descricao: "Espigão interno (canto virtual do retângulo da asa A): nas duas pontas chapa interna t = 8 mm em fenda + pinos inox; pontas a ≥ 10 mm das faces vizinhas (carga só por chapa e pinos)." });
    }
    var eCB = r.esf.CB || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 };
    if (G.membros.some(function (m) { return m.g === "CB"; })) L.ligacoes.caibroMeio = noChapa(ML, cc, "caibro de meio da cabeceira oeste (pé sobre o pilar de meio de parede e topo na cumeeira A)", Math.max(0.05, eCB.Nt, eCB.Nc), Math.max(0.05, eqv(eCB, "Nt"), eqv(eCB, "Nc")), Math.max(0.05, eCB.V), Math.max(0.05, eqv(eCB, "V")), sec.CB, { descricao: "Caibro de meio da água oeste: pé em sela sobre o pilar de meio de parede (frechal) e topo na cumeeira A; chapa interna t = 8 mm + pinos inox; o empuxo horizontal do pé é levado pelo tirante MI até a primeira tesoura da asa A." });
    /* nós da meia-tesoura */
    [["MS", "nó do banzo superior da meia-tesoura"], ["MI", "nó do banzo inferior da meia-tesoura (tirante)"], ["MP", "nó do montante da meia-tesoura"], ["MG", "nó da diagonal da meia-tesoura"]].forEach(function (x) {
      var e = r.esf[x[0]]; if (!e) return; var F = Math.max(e.Nt, e.Nc), Fq = Math.max(eqv(e, "Nt"), eqv(e, "Nc"));
      L.ligacoes["no" + x[0]] = noChapa(ML, cc, x[1], Math.max(F, 0.05), Math.max(Fq, 0.05), 0.05, 0.05, sec[x[0]], { descricao: x[1] + ": chapa interna 8 mm + pinos inox." });
    });
    /* terça × espigão: parafusos de rosca total a 45° (estribo): reação da terça + componente ao longo da água */
    var eT = r.esf.T, Vt = eT ? (eT.VEq != null ? eT.VEq : eT.V) : 0, nS, tc;
    var Vtu = Math.max(Vt, vl.V_terca);      /* o maior entre a reação das combinações e o arrancamento líquido da faixa de aresta */
    for (nS = 2; nS <= 24; nS += 2) { tc = ML.roscaInclinada({ F: Vtu + Vtu * tg, n: nS, anguloGraus: 45, Rax_d: RAX }); if (tc.ok) break; }
    L.ligacoes.tercaEspigao = { descricao: "Terça com ponta em bisel de 45° assentada no espigão em estribo de aço; parafusos de rosca total a 45° (par cruzado).", parafuso: "SFS WT-T 8,2 × 300 (ETA-12/0063)", porApoio: nS, Rax_d: RAX, F_d: Vt, H_d: Vt * tg, eta: tc.eta, ok: tc.ok, vento_local: { V_terca: vl.V_terca, wf_m: vl.wf_m, cpe: -1.2, fonte: vl.fonte }, passos: ["Reação do apoio da terça no espigão = " + br(Vt) + " kN; componente ao longo da água H = V·tgθ = " + br(Vt * tg) + " kN; arrancamento líquido da faixa de aresta (cpe local −1,2, " + br(vl.wf_m, 2) + " m; EN 1991-1-4, Tab. 7.5, SECUNDÁRIA — a confirmar pelo RT) = " + br(vl.V_terca) + " kN; dimensionado para V = " + br(Vtu) + " kN."].concat(tc.passos) };
    L.ligacoes.tercaRincao = ext({}, L.ligacoes.tercaEspigao, { descricao: "Terça com ponta em bisel composto assentada no RINCÃO (estribo de aço, parafusos de rosca total a 45°): as terças das duas águas descarregam no rincão, na linha da calha — mesma reação, mesma geometria do espigão (45° em planta)." });
    /* esforço AXIAL da terça (as terças ligam espigões opostos e trabalham como escora/tirante do conjunto, N de ±3 kN nas águas do exemplo): estribo de aço (chapa interna t = 8 mm + pinos inox na terça) — a ponta fica a ≥ 10 mm do espigão, sem contato madeira–madeira */
    var eTa = r.esf.T || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 };
    L.ligacoes.tercaEspigaoAxial = noChapa(ML, cc, "terça × espigão (esforço axial da terça pelo estribo)", Math.max(0.05, eTa.Nt, eTa.Nc), Math.max(0.05, eqv(eTa, "Nt"), eqv(eTa, "Nc")), Math.max(0.05, eTa.V, vl.V_terca), Math.max(0.05, eqv(eTa, "V"), vl.V_terca), sec.T, { descricao: "Estribo de aço na ponta da terça (chapa interna t = 8 mm + pinos inox): transmite ao espigão o esforço axial N da terça (escora/tirante entre espigões opostos) sem contato de madeira." });
    /* emenda do frechal no canto (parte da cinta) e compressão ⊥ do espigão no frechal (apoio da sela) */
    var Rv = Math.max(E.heel.V, 0.001), Ae = sec.E.b * 0.20, an = ML.alfaN(20), kmL = perf("longa").kmod, fc90d = Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an), sg = Rv / Ae / 1000, etaA = sg / fc90d;
    L.apoios90.apoioEspigaoSela = { descricao: "Compressão ⊥ às fibras do frechal sob a sela do espigão (200 mm)", R_d: Rv, area_cm2: Ae * 1e4, sigma_c90_MPa: sg, fc90d_MPa: fc90d, alphaN: an, eta: etaA, ok: etaA <= 1 + 1e-9, passos: ["Sela do espigão sobre o frechal: σc,90 = " + br(Rv) + " kN / " + br(Ae * 1e4, 0) + " cm² = " + br(sg, 3) + " MPa ≤ fc90,d·αn = " + br(fc90d, 3) + " MPa → η = " + br(etaA, 3) + " (NBR 7190-1:2022, 6.3.3)."] };
    var RvR = Math.max(RCr.heel.V || 0, 0.001), AeR = secRC.b * 0.20, anR = ML.alfaN(20), sgR = RvR / AeR / 1000, etaAR = sgR / fc90d;
    L.apoios90.apoioRincaoSela = { descricao: "Compressão ⊥ às fibras do frechal sob a sela do rincão (200 mm)", R_d: RvR, area_cm2: AeR * 1e4, sigma_c90_MPa: sgR, fc90d_MPa: fc90d, alphaN: anR, eta: etaAR, ok: etaAR <= 1 + 1e-9, passos: ["Sela do rincão sobre o frechal: σc,90 = " + br(RvR) + " kN / " + br(AeR * 1e4, 0) + " cm² = " + br(sgR, 3) + " MPa ≤ fc90,d·αn = " + br(fc90d, 3) + " MPa → η = " + br(etaAR, 3) + " (NBR 7190-1:2022, 6.3.3)."] };
    if (ap && ap.folgas) L.folgas = ap.resumo;
    L.verificacoes = Object.keys(L.ligacoes).map(function (k) { return { nome: k, eta: L.ligacoes[k].eta, ok: L.ligacoes[k].ok !== false && L.ligacoes[k].eta <= 1 + 1e-9 }; }).concat(Object.keys(L.apoios90).map(function (k) { return { nome: k, eta: L.apoios90[k].eta, ok: L.apoios90[k].ok !== false && L.apoios90[k].eta <= 1 + 1e-9 }; }));
    L.eta = Math.max.apply(null, L.verificacoes.map(function (v) { return v.eta; })); L.ok = L.verificacoes.every(function (v) { return v.ok; });
    L.passos = []; Object.keys(L.ligacoes).forEach(function (k) { if (L.ligacoes[k].passos) L.passos = L.passos.concat(L.ligacoes[k].passos); }); Object.keys(L.apoios90).forEach(function (k) { L.passos = L.passos.concat(L.apoios90[k].passos); });
    return L;
  }

  function auditar(o) {
    var A = [], G = o.G, I = G.info, sec = o.sec, ap = o.aparo;
    function ach(regra, peca, msg, cor) { A.push({ regra: regra, peca: peca, mensagem: msg, correcao: cor }); }
    var bom = {}; G.membros.forEach(function (m) { bom[m.id] = 1; });
    G.membros.filter(function (m) { return (m.g === "E" || m.g === "RC") && !m.interior; }).forEach(function (E) { if (!(E.nos && E.nos.length)) ach("espigao-sem-no", E.id, "Espigão sem nós de apoio das terças.", "Revisar a geometria (nH ≥ 2)."); });
    if (ap && ap.folgas) ap.folgas.forEach(function (f) { if (f.folga_mm < FOLGA * 1000 - 0.5) ach("folga-construtiva", f.peca, "Folga de " + f.folga_mm.toFixed(1).replace(".", ",") + " mm contra " + f.contra + " (mínimo 10 mm).", "Aumentar o aparo da ponta."); });
    if (!ap || !ap.folgas || !ap.folgas.length) ach("folga-nao-medida", "T3L", "As folgas construtivas não foram medidas.", "Rodar o aparo (aparar).");
    if (o.res && o.res.contrav && !o.res.contrav.ok) ach("kbr", "contraventamento", "A rigidez K_br,1 (6.6.2) do contraventamento não atende — o comprimento de flambagem fora do plano não está provado.", "Engrossar as diagonais/pinos ou acrescentar contraventamento.");
    if (o.res && o.res.cinta && o.res.cinta.N > 0 && o.lig && o.lig.ligacoes.cintaCanto && o.lig.ligacoes.cintaCanto.ok === false) ach("cinta", "cinta do canto", "A cinta do canto não atende a tração do anel.", "Aumentar a chapa/pinos da cinta ou a seção do frechal.");
    Object.keys((o.res && o.res.esbeltez) || {}).forEach(function (g) { if (o.res.esbeltez[g].lambdaMax > 140) ach("esbeltez", g, "Esbeltez " + o.res.esbeltez[g].lambdaMax.toFixed(0) + " > 140 no grupo " + g + ".", "Engrossar a peça."); });
    /* pilar-interferencia: folga LIVRE entre pilares (face a face, nos dois eixos) >= 20 mm; assento = max(0,30; b_pilar + 0,02) existe para isso (revisão 20/11/2026) */
    var pl = G.membros.filter(function (m) { return m.g === "P" || m.g === "PO"; }), kk, jj;
    function larg(m) { var s = sec[m.g] || sec.P; return [s.b, s.h]; }
    for (kk = 0; kk < pl.length; kk++) for (jj = kk + 1; jj < pl.length; jj++) {
      var u = pl[kk], v = pl[jj], wu = larg(u), wv = larg(v), gx = Math.abs(u.p0[0] - v.p0[0]) - (wu[0] + wv[0]) / 2, gz = Math.abs(u.p0[1] - v.p0[1]) - (wu[1] + wv[1]) / 2, gap = Math.max(gx, gz);
      if (gap < 0.02 - 1e-6) ach("pilar-interferencia", u.id + " × " + v.id, "Pilares " + u.id + " e " + v.id + " a " + (gap * 1000).toFixed(0).replace(".", ",") + " mm um do outro (mínimo 20 mm" + (gap < 0 ? "; INTERPENETRAM" : "") + ").", "Aumentar o assento (assento = máx(0,30; b_pilar + 0,02)) e recalcular.");
    }
    if (I.dpCurto && I.dpCurto.length) ach("painel-estreito", I.dpCurto.join(", "), "Parede(s) " + I.dpCurto.join(", ") + " sem painel de 0,8 m ou mais para o X de contraventamento (usado o painel mais largo, estreito demais).", "Revisar a posição dos pilares ou contraventar a parede de outra forma (RT).");
    var rp = {}; A.forEach(function (a) { rp[a.regra] = (rp[a.regra] || 0) + 1; });
    return { achados: A, porRegra: rp, ok: A.length === 0 };
  }

  function projetar(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var out = projetar1(proj, partida, opcoes), bP = Math.max(out.secoes.P.b, out.secoes.P.h, out.secoes.PO.b, out.secoes.PO.h), need = Math.ceil((bP + 0.02) * 100 - 1e-9) / 100, usado = out.t3.params.assento;
    out.assento = { usado: usado, necessario: need, bPilar: bP, passadas: 1 };
    if (need > usado + 1e-9 && !opcoes.semPassadaAssento) {
      /* nova passada: o pilar cresceu no dimensionamento e o assento de 0,30 m não deixa 20 mm entre os pilares; refaz a geometria com assento = b_pilar + 0,02 e redimensiona a partir das seções já crescidas */
      var p2 = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") p2[k] = proj[k]; }); p2.params = ext({}, proj.params, { assento: need });
      var o2 = projetar1(p2, copia(out.secoes), opcoes); o2.assento = { usado: o2.t3.params.assento, necessario: need, bPilar: bP, passadas: 2 };
      o2.resultado.avisos.push("T3L: assento refeito em " + Math.round(need * 100) + " cm (pilar de " + Math.round(bP * 100) + " cm + 20 mm de folga): 2ª passada do dimensionamento.");
      return o2;
    }
    return out;
  }
  function projetar1(proj, partida, opcoes) {
    var kr = proj.krBase != null ? proj.krBase : (opcoes.kr0 || 8000), krMap = null, tent = [], d, b, k, conv = false;
    for (k = 0; k < (opcoes.voltasBase || 3); k++) {
      proj._krBase = krMap || kr; d = CL.dimensionar(proj, k ? d.secoes : partida, opcoes); b = CL.base(proj, d.resultado, d.secoes);
      tent.push({ krUsado: krMap ? copia(krMap) : kr, Ktheta: b.Ktheta, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = b.porGrupo[g].Ktheta; return o; }, {}) });
      if (proj.krBase != null) { conv = true; break; }
      var nm = {}, tudo = true; Object.keys(b.porGrupo).forEach(function (g) { var kg = krMap && krMap[g] != null ? krMap[g] : kr, kt = b.porGrupo[g].Ktheta; if (kt && Math.abs(kt - kg) / kg >= 0.12) tudo = false; nm[g] = !kt ? kg : (Math.min(kg, kt) === kg ? 0.5 * (kg + kt) : kt); });
      if (tudo) { conv = true; break; } krMap = nm;
    }
    var gv = b.grupoGov, krGov = krMap && krMap[gv] != null ? krMap[gv] : kr, rigidez = { auto: proj.krBase == null, krBase: krGov, Ktheta: b.Ktheta, convergiu: conv, voltas: tent, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = { krBase: krMap && krMap[g] != null ? krMap[g] : kr, Ktheta: b.porGrupo[g].Ktheta }; return o; }, {}) };
    /* ITEM 4 (revisão Opus): base reprovada (cruz, placa, chumbadores) → cresce P/PO um passo e repete a volta, até passar ou esgotar o limite de seção */
    var vezesP = 0; while (b.LG && b.LG.ok === false && vezesP < 8) { var gr = false; ["P", "PO"].forEach(function (g) { if (C3.crescer(proj._pad3, d.secoes, g, d.resultado)) gr = true; }); if (!gr) break; vezesP++; proj._krBase = krMap || kr; d = CL.dimensionar(proj, d.secoes, opcoes); b = CL.base(proj, d.resultado, d.secoes); d.resultado.avisos.push("T3L: base reprovada — pilar crescido para " + Math.round(d.secoes.P.b * 100) + " cm (volta " + vezesP + ")."); }
    if (!conv) d.resultado.avisos.push("N6/T3L: a rigidez da base não convergiu em " + tent.length + " voltas — conferir.");
    proj._krBase = null;
    var q = proj._pad3, G = TL.geometria(q.params), ap = aparar(G, d.secoes), F = TL.fonte(q.params, d.secoes, { classe: q.classe }, ap);
    var out = { secoes: d.secoes, resultado: d.resultado, historico: d.historico, semSolucao: d.semSolucao, pior: d.pior, ligacoes: b.LG, rigidezBase: rigidez, tipologia: "T3L", aparo: { folgas: ap.folgas, resumo: ap.resumo } };
    out.fonte = { pecas: F.pecas, volume_por_material_m3: TL.volumePorMaterial(F.pecas) };
    out.t3 = { params: q.params, info: { tipologia: "T3L", tesouraTipo: G.info.tesouraTipo, xs: G.info.xs, zs: G.info.zs, nH: G.info.nH, nHB: G.info.nHB, kB: G.info.kB, dz: G.info.dz, lp: G.info.lp, sc: G.info.sc, Hp: G.info.Hp, a: G.info.a, b: G.info.b, c: G.info.c, bb: G.info.bb, incl: G.info.incl, beiral: G.info.beiral, dlA: G.info.dlA, dlB: G.info.dlB, igual: G.info.igual, V: G.info.V, ATOP: G.info.ATOP, hA: G.info.hA, hB: G.info.hB, reflexo: G.info.reflexo, edges: G.info.edges, areaTotal: G.info.areaTotal, areaPlantaL: G.info.areaPlantaL, areaEsperada: G.info.areaEsperada, areaPlanos: G.info.areaPlanos, pir: false, La: G.info.La, Lb: G.info.Lb },
      membros: ap.membros.map(function (m) { return { id: m.id, g: m.g, agua: m.agua || null, aguaId: m.aguaId || null, asa: m.asa || null, tes: m.tes == null ? null : m.tes, pe: m.pe || null, sx: m.sx == null ? null : m.sx, sz: m.sz == null ? null : m.sz, interior: !!m.interior, concavo: !!m.concavo, p0: m.p0, p1: m.p1, eixo0: m.eixo0, eixo1: m.eixo1, nos: m.nos || [], bisel: m.bisel || null, canto: m.canto || null, plano: m.plano || null, ws: m.ws || null }; }), folgas: ap.folgas };
    out.ligacoesT3 = lLigacoes(q, d.secoes, d.resultado, G, ap);
    out.auditoria = auditar({ G: G, sec: d.secoes, res: d.resultado, lig: out.ligacoesT3, aparo: ap });
    return out;
  }

  var MadT3LLig = { aparar: aparar, ligacoes: lLigacoes, auditar: auditar, projetar: projetar, howeAngulos: howeAngulosL, ventoLocal: ventoLocal };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3LLig;
  else global.MadT3LLig = MadT3LLig;
})(typeof window !== "undefined" ? window : this);

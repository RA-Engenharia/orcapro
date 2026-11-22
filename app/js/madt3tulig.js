/* =====================================================================
 * madt3tulig.js — T3TU (telhado de 4 águas em planta ortogonal em T e U, um rincão por canto côncavo): ENCONTROS (aparo, folga construtiva ≥ 10 mm), LIGAÇÕES DETALHADAS dos nós,
 * AUDITOR de encontros e a lista do que NÃO foi verificado (PRELIMINAR com motivo). Etapa 3b, item 1. Motor PURO, ES5, Node-testável.
 * É o madt3llig.js (T3L) generalizado para N asas (barra A + até 2 pernas) e N cantos côncavos; o que é igual REUSA as funções do L (MadT3LLig.aparar/auditar/howeAngulos/ventoLocal,
 * MadT3Lig.noChapa/chapaUnica/pontaFrechalCabe/...), sem alterá-las. O que é DIFERENTE do L (e por quê):
 *   · Howe: a tesoura de cada asa tem o seu plano e o seu vão (barra: vão b; perna j: vão w_j, deslocada de x_l); as meias-tesouras vêm da cabeceira E/W da barra e da ponta de cada perna (N, N2).
 *     O aparo Howe é feito aqui; o resto do aparo (espigão × cumeeira, frechal nos cantos, terça × espigão) é o do L, chamado com a tesoura "pratt" para não refazer o Howe.
 *   · vento local de aresta: a asa mais LARGA governa (V cresce com a largura); o L tinha só duas asas (A e B).
 *   · espigão interno: TODO espigão `interior` (o L conhecia só o "E6"); caibro de meio: um por ponta da barra encostada a uma perna.
 *   · ponta do frechal: confere cada frechal com aparo (não só o FR1 do L), pelo comprimento real do segmento.
 * Fontes e decisões: docs/madeira/T3TU-REFERENCIA.md (§10).
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var TL = req("MadT3L", "madt3l.js"), T3 = TL.T3, C3 = req("MadT3Calc", "madt3calc.js"), L3 = req("MadT3Lig", "madt3lig.js"), LL = req("MadT3LLig", "madt3llig.js"), U = TL._util, D = U.D, ext = U.ext, norm = U.norm, br = U.br, copia = U.copia, rd = U.rd;
  var FOLGA = T3.FOLGA, chapaUnica = L3.chapaUnica, pontaFrechalCabe = L3.pontaFrechalCabe, noChapa = L3.noChapa, noChapaM = L3.noChapaM, pinosMom = L3.pinosMom, chapaNBR8800 = L3.chapaNBR8800;
  function arr(v) { return Array.isArray(v) ? v : []; }
  function eixoDe(m) { return { p0: (m.eixo0 || m.p0).slice(), p1: (m.eixo1 || m.p1).slice() }; }

  /* ----------------------------------------------------------------- Howe */
  /** ângulos de abertura da diagonal Howe: o pior de TODAS as asas. Cada asa é entregue ao `howeAngulos` do L num quadro local (asa "B" do L = plano com a coordenada do vão no índice 0, deslocada a x_l). */
  function howeAngulosTU(G) {
    var p = G.p, bs = 0, bi = 0;
    function acum(Gx) { var h = LL.howeAngulos(Gx); bs = Math.max(bs, h.betaBS); bi = Math.max(bi, h.betaBI); }
    var asaA = G.membros.filter(function (m) { return m.g === "DG" && m.tes === 0 && m.asa === "A"; });
    if (asaA.length) acum({ p: { b: p.b, bb: p.b, incl: p.incl }, info: {}, membros: asaA.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.asa = "A"; return c; }) });
    arr(p.legs).forEach(function (Lg) {
      var ms = G.membros.filter(function (m) { return m.g === "DG" && m.tes === 0 && m.asa === Lg.asa; }).map(function (m) { return { g: "DG", tes: 0, asa: "B", p0: [m.p0[0] - Lg.xl, m.p0[1], m.p0[2]], p1: [m.p1[0] - Lg.xl, m.p1[1], m.p1[2]] }; });
      if (ms.length) acum({ p: { b: p.b, bb: Lg.w, incl: p.incl }, info: {}, membros: ms });
    });
    return { betaBS: bs, betaBI: bi };
  }

  /** aparo Howe das tesouras (por asa e posição) e das meias-tesouras (E, W e uma por perna), no formato do L: pseudo-plano [pos, s, y] → `MT.T2.howeAparar` → volta ao mundo */
  function apararHowe(G, sec, M, folgas) {
    var MT = D().MT, I = G.info, p = G.p, a = p.a, b = p.b, legs = arr(p.legs);
    var secT = { DG: sec.DG, BS: sec.BS, BI: sec.BI, PD: sec.PD }, secH = { BS: sec.MS, BI: sec.MI, PD: sec.MP, DG: sec.MG };
    function grupo(lista, span, yT, deLocal, secG, tag) {
      var GT = { p: { b: span, incl: p.incl }, info: { yT: yT, Hp: I.Hp, sc: I.sc }, membros: lista };
      lista.forEach(function (c) {
        if (c.g !== "DG") return; var r = MT.T2.howeAparar(c, GT, secG), m = c.orig, a0 = deLocal(r.p0), a1 = deLocal(r.p1);
        m.p0 = a0; m.p1 = a1; m.folga = r.folga; m.bisel = { tipo: "howe", aparo: r.aparo };
        folgas.push({ peca: m.id, contra: tag, folga_mm: Math.min(r.folga.BS, r.folga.BI, r.folga.PD) * 1000 });
      });
    }
    /* tesouras: um plano por (asa, índice) */
    var planos = {};
    M.forEach(function (m) { if (m.tes == null || !m.asa) return; var k = m.asa + "|" + m.tes; (planos[k] = planos[k] || []).push(m); });
    Object.keys(planos).forEach(function (k) {
      var ms = planos[k], asa = ms[0].asa, Lg = legs.filter(function (l) { return l.asa === asa; })[0], lista, span, yT, deLocal;
      if (!Lg) { span = b; yT = I.yT; deLocal = function (P) { return P; }; lista = ms.map(function (m) { return { id: m.id, g: m.g, tes: m.tes, agua: m.agua, p0: m.p0.slice(), p1: m.p1.slice(), orig: m }; }); }
      else {
        var pos = ms[0].p0[1]; span = Lg.w; yT = function (s) { return I.yTs(s, Lg.w); }; deLocal = function (P) { return [P[1] + Lg.xl, pos, P[2]]; };
        lista = ms.map(function (m) { return { id: m.id, g: m.g, tes: m.tes, agua: m.agua, p0: [m.p0[1], m.p0[0] - Lg.xl, m.p0[2]], p1: [m.p1[1], m.p1[0] - Lg.xl, m.p1[2]], orig: m }; });
      }
      grupo(lista, span, yT, deLocal, secT, "BS/BI/PD");
    });
    /* meias-tesouras */
    var mp = { MS: "BS", MI: "BI", MP: "PD", MG: "DG" };
    var cab = [{ ag: "E", Pm: function (u) { return [a - u, b / 2]; }, dist: function (xy) { return a - xy[0]; }, span: b, yT: I.yT, sel: function (m) { return m.agua === "E"; } },
      { ag: "W", Pm: function (u) { return [u, b / 2]; }, dist: function (xy) { return xy[0]; }, span: b, yT: I.yT, sel: function (m) { return m.agua === "W"; } }];
    legs.forEach(function (Lg) { cab.push({ ag: "N" + Lg.j, Pm: function (u) { return [Lg.xc, Lg.c - u]; }, dist: function (xy) { return Lg.c - xy[1]; }, span: Lg.w, yT: function (s) { return I.yTs(s, Lg.w); }, sel: function (m) { return m.agua === "N" && Math.abs(m.p0[0] - Lg.xc) < 1e-6 && Math.abs(m.p1[0] - Lg.xc) < 1e-6; } }); });
    cab.forEach(function (H) {
      var pseudo = []; M.forEach(function (m) { if (!mp[m.g] || !H.sel(m)) return; pseudo.push({ id: m.id, g: mp[m.g], tes: 0, agua: "F", p0: [0, H.dist(m.p0), m.p0[2]], p1: [0, H.dist(m.p1), m.p1[2]], orig: m }); });
      if (pseudo.length) grupo(pseudo, H.span, H.yT, function (P) { var xy = H.Pm(P[1]); return [xy[0], xy[1], P[2]]; }, secH, "MS/MI/MP");
    });
  }

  /** APARO de todas as pontas (folga construtiva ≥ 10 mm). Pratt: é o `MadT3LLig.aparar` do L, sem mudança; Howe: o Howe por asa (acima) e, depois, o mesmo `aparar` do L com a tesoura "pratt" (as demais pontas são genéricas). */
  function aparar(G, sec) {
    var howe = G.info.tesouraTipo === "howe" && sec.DG && sec.BS && sec.BI && sec.PD;
    if (!howe) { var r0 = LL.aparar(G, sec); r0.tipologia = "T3TU"; return r0; }
    var M = G.membros.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.eixo0 = m.p0.slice(); c.eixo1 = m.p1.slice(); return c; }), fHowe = [];
    apararHowe(G, sec, M, fHowe);
    var G2 = { p: G.p, info: ext({}, G.info, { tesouraTipo: "pratt" }), membros: M }, r = LL.aparar(G2, sec), porId = {};
    M.forEach(function (m) { porId[m.id] = m; });
    r.membros.forEach(function (m) { var o = porId[m.id]; if (o && o.bisel && o.bisel.tipo === "howe") { m.eixo0 = o.eixo0.slice(); m.eixo1 = o.eixo1.slice(); m.bisel = o.bisel; m.folga = o.folga; } });
    var folgas = fHowe.concat(r.folgas), minF = Infinity; folgas.forEach(function (f) { if (f.folga_mm < minF) minF = f.folga_mm; });
    return { membros: r.membros, folgas: folgas, resumo: { n: folgas.length, minimo_mm: minF, ok: folgas.length > 0 && minF >= FOLGA * 1000 - 0.5 }, tipologia: "T3TU" };
  }

  /** vento local de aresta: a asa mais larga governa a força na terça e na sela; devolve também a de cada asa (barra e pernas) */
  function ventoLocalTU(q, r, G) {
    var I = G.info, p = G.p, asas = {}, w = null, best = -1;
    function uma(nome, bw) { var v = LL.ventoLocal(q, r, { p: p, info: { incl: I.incl, sc: I.sc, dz: I.dz, beiral: I.beiral, b: bw, bb: bw } }); asas[nome] = v; if (v.V_terca > best + 1e-12) { best = v.V_terca; w = v; } }
    uma("A", p.b); arr(p.legs).forEach(function (Lg) { uma(Lg.asa, Lg.w); });
    return ext({}, w, { asas: asas });
  }

  /* ----------------------------------------------------------------- LIGAÇÕES (generalização do lLigacoes do madt3llig.js) */
  function ligacoes(q, sec, r, G, ap) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), agg = {}, perf = C3.perfilFn(q), p = q.params;
    Object.keys(r.reacoes).forEach(function (k) { var o = r.reacoes[k], g = "P", a1 = agg[g] || (agg[g] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, NminEq: 1e9, HmaxEq: 0 }); a1.Nmax = Math.max(a1.Nmax, o.Nmax); a1.Nmin = Math.min(a1.Nmin, o.Nmin); a1.Hmax = Math.max(a1.Hmax, o.Hmax); a1.NminEq = Math.min(a1.NminEq, o.NminEq); a1.HmaxEq = Math.max(a1.HmaxEq, o.HmaxEq); });
    var c = { kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, cc = ML.cfg(c), Lp0 = Math.abs(p.peDireito), pesoPil = { P: Math.max(sec.P.b * sec.P.h * Lp0 * q.pesoMLC, sec.PO.b * sec.PO.h * Lp0 * q.pesoMLC) };
    var howe = p.tesoura.tipo === "howe" ? howeAngulosTU(G) : null, esf = copia(r.esf);
    ["BS", "BI", "PD", "DG", "T"].forEach(function (g) { if (!esf[g]) esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }; });
    var L = ML.pacoteT2({ howe: howe, sistema: "tesoura", pesoPilar: pesoPil, secoes: sec, cfg: c, esf: esf, reacoes: agg, incl: p.incl, contrav: r.contrav || null, f90Perp: r.f90Perp || null, mat: { fc90k: cl.fc90k, fc0k: cl.fc0k, kmod90: perf("longa").kmod } });
    L.tipologia = "T3TU";
    function eqv(x, k) { return x && x[k + "Eq"] != null ? x[k + "Eq"] : (x && x[k]) || 0; }
    var E = r.espigao, tg = p.incl, k0 = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: k0.RaxK_cruzado150, lefRef: k0.lefRef, lefA: k0.lefRef * 0.8, lefB: k0.lefRef * 0.8, kmod: cc.kmod }).Rd;
    /* espigão × cumeeira (ponta): chapa interna em fenda + pinos; força axial N e transversal S do esforço na extremidade */
    var Sa = Math.max(0.05, E.apice.S || 0), Seqa = Math.max(0.05, E.apice.SEq || 0);
    L.ligacoes.espigaoCumeeira = noChapa(ML, cc, "espigão × cumeeira (ponta)", Math.max(0.05, E.apice.N), Math.max(0.05, E.apice.NEq), Sa, Seqa, sec.E, { descricao: "Espigão na ponta da cumeeira: chapa interna de aço t = 8 mm em fenda + pinos inox no espigão; a ponta é cortada em bisel com folga ≥ 10 mm das faces de cumeeira, banzos e meia-tesoura (carga SÓ por chapa e pinos); a chapa se prende à cumeeira/tesoura por pinos no grupo do nó." });
    /* VENTO LOCAL nas arestas (revisão do RT): cpe = −1,2 numa faixa ao longo de cada espigão (EN 1991-1-4, Tab. 7.5 — SECUNDÁRIA, a confirmar pelo RT), aplicado só nas LIGAÇÕES (terça × espigão, sela, arrancamento da terça) */
    var vl = ventoLocalTU(q, r, G);
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
      var apM = ap && ap.membros ? ap.membros : [], piorPF = null, nPF = 0;
      G.membros.filter(function (m) { return m.g === "FR"; }).forEach(function (F) {
        var apF = apM.filter(function (m) { return m.id === F.id; })[0], bis = apF && apF.bisel && apF.bisel.aparo, e = eixoDe(F), Lseg = norm(e.p0, e.p1);
        if (!bis) return; var cab = pontaFrechalCabe(Lseg, Math.max(bis[0] || 0, bis[1] || 0), L.ligacoes.cintaCanto.pinos, L.ligacoes.espigaoCanto.pinos); nPF++; cab.frechal = F.id; if (!piorPF || cab.eta > piorPF.eta) piorPF = cab;
      });
      if (piorPF) L.ligacoes.pontaFrechalCabe = ext({ descricao: "Os grupos de pinos da sela e da cinta cabem na ponta do frechal (pior dos " + nPF + " frechais com aparo: " + piorPF.frechal + ")." }, piorPF);
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
    /* RINCÃO (viga inclinada do canto côncavo ao vértice V): ápice (V) = encontro com a cumeeira da perna e o espigão interno; pé = sela de aço sobre o cruzamento dos frechais do canto côncavo (a compressão do anel passa pela chapa); CALHA metálica sobre o rincão */
    var RCr = r.rincao || { heel: { N: 0, NEq: 0, S: 0, SEq: 0, V: 0, H: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 }, cintaC: { N: 0, NEq: 0, S: 0, SEq: 0 } }, secRC = sec.RC || sec.E;
    L.ligacoes.rincaoApice = noChapa(ML, cc, "rincão × cumeeira da perna / espigão interno (vértice V)", Math.max(0.05, RCr.apice.N), Math.max(0.05, RCr.apice.NEq), Math.max(0.05, RCr.apice.S), Math.max(0.05, RCr.apice.SEq), secRC, { descricao: "Rincão no vértice V (encontro das cumeeiras e do espigão interno): chapa interna de aço t = 8 mm em fenda + pinos inox no rincão; a ponta do rincão fica a ≥ 10 mm das faces da cumeeira da perna e do espigão interno (carga SÓ por chapa e pinos)." });
    var cintaC = RCr.cintaC || { N: 0, NEq: 0, S: 0, SEq: 0 }, NhR = Math.max(0.05, RCr.heel.N, cintaC.N), NhReq = Math.max(0.05, RCr.heel.NEq, cintaC.NEq), ShR = Math.max(0.05, RCr.heel.S, vl.V_sela * 0), ShReq = Math.max(0.05, RCr.heel.SEq);
    L.ligacoes.rincaoCanto = noChapa(ML, cc, "rincão × canto côncavo (sela de aço sobre o cruzamento dos frechais)", NhR, NhReq, ShR, ShReq, secRC, { descricao: "Pé do rincão sobre o canto côncavo: assenta no cruzamento dos frechais (bico de pássaro raso) com sela de aço inox em chapa interna (t = 8 mm) + pinos; a compressão do anel no canto côncavo (" + br(cintaC.N) + " kN) e o empuxo horizontal do rincão (" + br(RCr.heel.H) + " kN) passam pela chapa; calha metálica do rincão lança no beiral para a calha do perímetro." });
    L.ligacoes.rincaoCanto.passos = ["Canto côncavo: N do rincão no pé = " + br(RCr.heel.N) + " kN, empuxo horizontal " + br(RCr.heel.H) + " kN; compressão de extremidade do frechal no canto côncavo = " + br(cintaC.N) + " kN (as duas pontas do frechal param a ≥ 10 mm do rincão: a compressão passa pela chapa/sela, não por contato madeira–madeira)."].concat(L.ligacoes.rincaoCanto.passos || []);
    var E6 = r.espigao6 || { heel: { N: 0, NEq: 0, S: 0, SEq: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 } };
    var nInt = G.membros.filter(function (m) { return m.g === "E" && m.interior; }).length;
    if (nInt) {
      L.ligacoes.espigaoInterno = noChapa(ML, cc, "espigão interno (vértice V × topo da cumeeira; " + nInt + " na planta)", Math.max(0.05, E6.heel.N, E6.apice.N), Math.max(0.05, E6.heel.NEq, E6.apice.NEq), Math.max(0.05, E6.heel.S, E6.apice.S), Math.max(0.05, E6.heel.SEq, E6.apice.SEq), sec.E, { descricao: "Espigão interno (canto virtual do retângulo da asa A): nas duas pontas chapa interna t = 8 mm em fenda + pinos inox; pontas a ≥ 10 mm das faces vizinhas (carga só por chapa e pinos)." });
    }
    var eCB = r.esf.CB || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 };
    if (G.membros.some(function (m) { return m.g === "CB"; })) L.ligacoes.caibroMeio = noChapa(ML, cc, "caibro de meio da cabeceira (pé sobre o pilar de meio de parede e topo na cumeeira da barra)", Math.max(0.05, eCB.Nt, eCB.Nc), Math.max(0.05, eqv(eCB, "Nt"), eqv(eCB, "Nc")), Math.max(0.05, eCB.V), Math.max(0.05, eqv(eCB, "V")), sec.CB, { descricao: "Caibro de meio da água da cabeceira: pé em sela sobre o pilar de meio de parede (frechal) e topo na cumeeira da barra; chapa interna t = 8 mm + pinos inox; o empuxo horizontal do pé é levado pelo tirante MI até a primeira tesoura da asa A." });
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

  /* ----------------------------------------------------------------- AUDITOR de encontros */
  /** o auditor do L (folga ≥ 10 mm medida, K_br,1, cinta, esbeltez, pilares, painéis) + a regra do T/U: todo rincão tem de assentar num canto côncavo (sela) */
  function auditar(o) {
    var r = LL.auditar(o), A = r.achados, G = o.G;
    A.forEach(function (a) { if (a.peca === "T3L") a.peca = "T3TU"; });
    G.membros.filter(function (m) { return m.g === "RC"; }).forEach(function (R) {
      if (!R.canto) A.push({ regra: "rincao-sem-canto", peca: R.id, mensagem: "Rincão " + R.id + " sem canto côncavo de apoio (sela de aço sobre o cruzamento dos frechais).", correcao: "Revisar a geometria do canto côncavo." });
      if (!(R.nos && R.nos.length)) A.push({ regra: "rincao-sem-no", peca: R.id, mensagem: "Rincão " + R.id + " sem nós de apoio das terças.", correcao: "Revisar a geometria (nH ≥ 2)." });
    });
    var rp = {}; A.forEach(function (a) { rp[a.regra] = (rp[a.regra] || 0) + 1; });
    return { achados: A, porRegra: rp, ok: A.length === 0 };
  }

  /* ----------------------------------------------------------------- o que NÃO foi verificado (PRELIMINAR com motivo) */
  function naoVerificado(G) {
    var nv = [], legs = arr(G.p.legs);
    nv.push("Chapa do canto côncavo (sela do rincão + cinta do anel, " + G.membros.filter(function (m) { return m.g === "RC"; }).length + " canto(s)): o L verifica a chapa única (momento H·e_v, seção bruta/líquida e cortante) só no canto CONVEXO; no côncavo a compressão do anel passa pela sela do rincão e a chapa não foi verificada à instabilidade — confirmar pelo RT.");
    if (legs.some(function (L) { return !L.flushL && !L.flushR; })) nv.push("Perna solta (T): travamento da boca — diagonais de tração no plano do banzo inferior (DX \"boca\"): dimensionadas pelo laço de cálculo, mas as ligações dessas diagonais não foram detalhadas — confirmar pelo RT.");
    var baixos = G.membros.filter(function (m) { if (m.g !== "DX" || !m.p0 || !m.p1) return false; var dx = Math.abs(m.p1[0] - m.p0[0]), dz = Math.abs(m.p1[1] - m.p0[1]), dy = Math.abs(m.p1[2] - m.p0[2]), c = Math.sqrt(dx * dx + dy * dy), t = Math.sqrt(dz * dz + dy * dy); return Math.min(Math.atan2(c, dz), Math.atan2(t, dx)) * 180 / Math.PI < 25; }).length;
    if (baixos) nv.push("Contraventamento: " + baixos + " diagonal(is) em X com ângulo < 25° com a terça/linha do banzo têm eficiência reduzida (a componente que trava a barra cai com o seno do ângulo); o cálculo não aplica essa redução — confirmar pelo RT.");
    return nv;
  }

  /** a etapa 3b completa de um resultado: aparo → ligações detalhadas → auditor → motivos. `rr` = resultado bruto do cálculo (esforços, reações, rincão, cinta...). */
  function detalhar(q, sec, rr, G) {
    var ap = aparar(G, sec), lig = ligacoes(q, sec, rr, G, ap), aud = auditar({ G: G, sec: sec, res: rr, lig: lig, aparo: ap }), nv = naoVerificado(G), mot = [];
    arr(lig.verificacoes).filter(function (v) { return !v.ok; }).forEach(function (v) { mot.push("ligação " + v.nome + " não fecha (η = " + br(v.eta, 3) + ")"); });
    if (ap.resumo && !ap.resumo.ok) mot.push("folga construtiva mínima medida " + br(ap.resumo.minimo_mm, 1) + " mm (< 10 mm)");
    aud.achados.forEach(function (a) { mot.push("auditor de encontros: " + a.mensagem); });
    return { aparo: { folgas: ap.folgas, resumo: ap.resumo }, membros: ap.membros, ligacoes: lig, auditoria: aud, naoVerificado: nv, motivos: mot, motivosNaoVerificado: nv.map(function (t) { return "não verificado: " + t.replace(/ — confirmar pelo RT\.?$/, ""); }) };
  }

  var MadT3TULig = { aparar: aparar, apararHowe: apararHowe, ligacoes: ligacoes, auditar: auditar, naoVerificado: naoVerificado, detalhar: detalhar, howeAngulos: howeAngulosTU, ventoLocal: ventoLocalTU };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3TULig;
  else global.MadT3TULig = MadT3TULig;
})(typeof window !== "undefined" ? window : this);

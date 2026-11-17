/* =====================================================================
 * madt4lig.js — T4 (telhado sextavado/oitavado): ENCONTROS (folga construtiva ≥ 10 mm), LIGAÇÕES (espigão × cubo do ápice, cubo de aço, sela do canto + cinta, torção do frechal, terça × espigão,
 * caibro de meio e pilar central), AUDITOR e o PROJETO COMPLETO (projetarT4). Motor PURO, ES5, Node-testável. Reaproveita do T3 as caixas orientadas, os grupos de pinos (noChapa, noChapaM),
 * a chapa pela NBR 8800 e a base; o aparo usa a SIMETRIA rotacional (uma peça de cada tipo é medida, as outras repetem o aparo). Fontes e decisões: docs/madeira/T4-REFERENCIA.md.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T4 = req("MadT4", "madt4.js"), C4 = req("MadT4Calc", "madt4calc.js"), L3 = req("MadT3Lig", "madt3lig.js"), U = T4._util, D = U.D, copia = U.copia, ext = U.ext, br = U.br, norm = U.norm;
  var FOLGA = T4.FOLGA, CUBO = T4.CUBO;

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function un(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mv(P, d, t) { return [P[0] + d[0] * t, P[1] + d[1] * t, P[2] + d[2] * t]; }

  /* ---------------------------------------------------------------- APARAR: folga ≥ 10 mm nas pontas cortadas */
  /** devolve { membros (cópia com p0/p1 aparados; o eixo de cálculo fica em eixo0/eixo1), folgas: [{ peca, contra, folga_mm, aparo_mm }], resumo, cubo }.
   *  (a) espigão e caibro no CUBO do ápice: aparados até ≥ 10 mm do tubo do cubo e dos vizinhos (espigões e caibros adjacentes); (b) frechal nos 2 lados do canto: ≥ 10 mm do espigão (a tração do anel passa pela cinta);
   *  (c) terça junto ao espigão: ≥ 10 mm (assenta em estribo); (d) o pilar central termina 0,40 m abaixo do nó (o tubo do cubo desce dentro dele): medida a distância aos espigões.
   *  SIMETRIA: o polígono é regular e as seções do grupo são iguais — mede-se uma peça de cada tipo e o aparo se repete nas outras (o teste mede TODAS as pontas com outro método). */
  function aparar(G, sec) {
    var I = G.info, p = G.p, M = G.membros.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.eixo0 = m.p0.slice(); c.eixo1 = m.p1.slice(); return c; }), folgas = [], caixa = L3.caixa, dist = L3.distCaixas;
    function secDe(m) { return sec[m.g] || { b: 0.1, h: 0.2 }; }
    function cx(m) { return caixa(m.p0, m.p1, T4.upDe(m), secDe(m).b, secDe(m).h); }
    function cxE(m) { return caixa(m.eixo0, m.eixo1, T4.upDe(m), secDe(m).b, secDe(m).h); }
    var hubTopo = [I.cx, I.cz, I.Hap + CUBO.sobe], hubBase = [I.cx, I.cz, I.Hap - CUBO.desce], tubo = caixa(hubBase, hubTopo, [1, 0, 0], CUBO.d, CUBO.d);
    var Es = M.filter(function (m) { return m.g === "E"; }), CBs = M.filter(function (m) { return m.g === "CB"; }), FRs = M.filter(function (m) { return m.g === "FR"; }), n = I.n;
    /* menor t (m) tal que a peça `m`, aparada em t pela ponta `fim` (0 = eixo0, 1 = eixo1), fica ≥ FOLGA de todas as caixas `viz` (cada uma com a janela [t0, t1] do seu eixo); passo grosso e depois fino */
    function achaAparo(m, fim, viz, janM, st) {
      var ex = un(sub(m.eixo1, m.eixo0)), s = secDe(m), up = fim ? T4.upDe(m) : T4.upDe(m), L = norm(m.eixo0, m.eixo1), minD = 0, t = 0, passo = 0.01, k, fase;
      function medir(tt) { var q0 = fim ? m.eixo0 : mv(m.eixo0, ex, tt), q1 = fim ? mv(m.eixo1, ex, -tt) : m.eixo1, Lq = norm(q0, q1), bM = caixa(q0, q1, up, s.b, s.h), jan = fim ? [Lq / 2 - janM, Lq / 2] : [-Lq / 2, -Lq / 2 + janM], md = Infinity; viz.forEach(function (v) { var d2 = dist(bM, v.b, jan, v.jan, st); if (d2 < md) md = d2; }); return md; }
      for (fase = 0; fase < 2; fase++) { for (k = 0; k < 600; k++) { minD = medir(t); if (minD >= FOLGA - 1e-9) break; t += passo; } if (fase === 0) { t = Math.max(0, t - passo); passo = 0.002; } }
      return { t: t, minD: minD };
    }
    function trecho(b, fimMais) { return fimMais ? [b.s[0] - 0.7, b.s[0]] : [-b.s[0], -b.s[0] + 0.7]; }
    /* (a) ápice: espigão 0 e caibro 0 */
    var apJ = [];
    (function () {
      var E0 = Es[0], viz = [{ b: tubo, jan: [-tubo.s[0], tubo.s[0]], id: "CUBO" }], nome = [];
      [Es[1 % n], Es[(n - 1) % n]].forEach(function (v) { viz.push({ b: cxE(v), jan: trecho(cxE(v), true), id: v.id }); nome.push(v.id); }); CBs.slice(0, 1).concat(CBs.slice(n - 1)).forEach(function (v) { viz.push({ b: cxE(v), jan: trecho(cxE(v), true), id: v.id }); nome.push(v.id); });
      var r = achaAparo(E0, 1, viz, 0.6, 0.004); Es.forEach(function (E) { var ex = un(sub(E.eixo1, E.eixo0)); E.p1 = mv(E.eixo1, ex, -r.t); E.bisel = { tipo: "espigao-cubo", aparo: r.t }; folgas.push({ peca: E.id, contra: "CUBO," + nome.join(","), folga_mm: r.minD * 1000, aparo_mm: r.t * 1000 }); });
      if (CBs.length) {
        var C0 = CBs[0], vz = [{ b: tubo, jan: [-tubo.s[0], tubo.s[0]], id: "CUBO" }], nm2 = []; [Es[0], Es[1 % n]].forEach(function (v) { vz.push({ b: cxE(v), jan: trecho(cxE(v), true), id: v.id }); nm2.push(v.id); }); [CBs[1 % n], CBs[(n - 1) % n]].forEach(function (v) { vz.push({ b: cxE(v), jan: trecho(cxE(v), true), id: v.id }); nm2.push(v.id); });
        var rc = achaAparo(C0, 1, vz, 0.6, 0.004); CBs.forEach(function (C) { var ex = un(sub(C.eixo1, C.eixo0)); C.p1 = mv(C.eixo1, ex, -rc.t); C.bisel = { tipo: "caibro-cubo", aparo: rc.t }; folgas.push({ peca: C.id, contra: "CUBO," + nm2.join(","), folga_mm: rc.minD * 1000, aparo_mm: rc.t * 1000 }); });
      }
    })();
    /* (b) frechal nos cantos (o frechal 0 começa no canto 0 e termina no canto 1; as pontas são simétricas) */
    (function () {
      var F0 = FRs[0], sF = secDe(F0), res = { 0: 0, 1: 0 }, eF = un(sub(F0.eixo1, F0.eixo0));
      [[0, Es[0]], [1, Es[1 % n]]].forEach(function (w) {
        var E = w[1], bE = cxE(E), fim = w[0], r = achaAparo(F0, fim, [{ b: bE, jan: [-bE.s[0], -bE.s[0] + 1.2], id: E.id }], 0.6, 0.004);
        res[fim] = r; });
      FRs.forEach(function (F, k) { var ex = un(sub(F.eixo1, F.eixo0)); F.p0 = mv(F.eixo0, ex, res[0].t); F.p1 = mv(F.eixo1, ex, -res[1].t); F.bisel = { tipo: "frechal-canto", aparo: [res[0].t, res[1].t] };
        folgas.push({ peca: F.id + "/ini", contra: "E" + (k + 1), folga_mm: res[0].minD * 1000, aparo_mm: res[0].t * 1000 }); folgas.push({ peca: F.id + "/fim", contra: "E" + (((k + 1) % n) + 1), folga_mm: res[1].minD * 1000, aparo_mm: res[1].t * 1000 }); });
    })();
    /* (c) terças contra o espigão: por linha (a linha k da água 0; as outras águas repetem) */
    (function () {
      var Ts = M.filter(function (m) { return m.g === "T"; }), linhas = {};
      Ts.forEach(function (T) { var k = T.id.split("_")[1]; if (T.agua === 0) linhas[k] = T; });
      Object.keys(linhas).forEach(function (k) {
        var T0 = linhas[k], r = {}; [[0, Es[0]], [1, Es[1 % n]]].forEach(function (w) { var bE = cxE(w[1]), c = w[1].eixo0, jE = [-bE.s[0], bE.s[0]]; r[w[0]] = achaAparo(T0, w[0], [{ b: bE, jan: jE, id: w[1].id }], 0.5, 0.006); });
        Ts.forEach(function (T) { if (T.id.split("_")[1] !== k) return; var ex = un(sub(T.eixo1, T.eixo0)); T.p0 = mv(T.eixo0, ex, r[0].t); T.p1 = mv(T.eixo1, ex, -r[1].t); T.bisel = { tipo: "terca-espigao", angulo_graus: 90 - 180 / n, aparo: [r[0].t, r[1].t] };
          folgas.push({ peca: T.id + "/ini", contra: "E" + (T.agua + 1), folga_mm: r[0].minD * 1000, aparo_mm: r[0].t * 1000 }); folgas.push({ peca: T.id + "/fim", contra: "E" + (((T.agua + 1) % n) + 1), folga_mm: r[1].minD * 1000, aparo_mm: r[1].t * 1000 }); });
      });
    })();
    /* (d) pilar central × espigões (informativo: o tubo desce dentro do pilar; a madeira do pilar para CUBO.desce abaixo do nó) */
    var PC = M.filter(function (m) { return m.g === "PC"; })[0];
    if (PC) {
      PC.p1 = [I.cx, I.cz, I.Hap - CUBO.desce]; PC.bisel = { tipo: "pilar-central-topo", aparo: CUBO.desce };
      var bP = cx(PC), md = Infinity; Es.forEach(function (E) { var d2 = dist(bP, cx(E), [bP.s[0] - 0.5, bP.s[0]], [E.p1 ? norm(E.p0, E.p1) / 2 - 0.9 : 0, norm(E.p0, E.p1) / 2], 0.006); if (d2 < md) md = d2; });
      folgas.push({ peca: "PC/topo", contra: "espigões", folga_mm: md * 1000, aparo_mm: CUBO.desce * 1000 });
    }
    var minF = Infinity; folgas.forEach(function (f) { if (f.folga_mm < minF) minF = f.folga_mm; });
    return { membros: M, folgas: folgas, resumo: { n: folgas.length, minimo_mm: minF, ok: folgas.length > 0 && minF >= FOLGA * 1000 - 0.5 }, cubo: { d: CUBO.d, desce: CUBO.desce, sobe: CUBO.sobe } };
  }

  /** VENTO LOCAL nas arestas (cpe = −1,2 numa faixa wf = mín(2R; 2h)/10 ao longo do espigão; EN 1991-1-4, Tab. 7.5 — SECUNDÁRIA, a confirmar pelo RT), aplicado só nas LIGAÇÕES; líquido por m² de planta 1,4·q·(1,2 + cpi) − g2·√(1+i²).
   *  A faixa cruza a terça num comprimento wf/cos β (a terça faz 90° − β com o espigão em planta; β = 45° dá wf·√2 da T3) × dz; a sela leva metade da faixa dos dois lados. */
  var CPE10 = -1.2, CPE1 = -2.0;      /* EN 1991-1-4, zona de aresta de cobertura em águas: cpe,10 = −1,2 (T3) e cpe,1 = −2,0 — ADOÇÃO, valores não conferidos na transcrição (fonte SECUNDÁRIA, a confirmar pelo RT) */
  /** interpolação por área (EN 1991-1-4, 7.2.1(2)): cpe = cpe,1 + (cpe,10 − cpe,1)·log10(A) entre 1 e 10 m²; A ≤ 1: cpe,1; A ≥ 10: cpe,10 */
  function cpeArea(A) { return A <= 1 ? CPE1 : (A >= 10 ? CPE10 : CPE1 + (CPE10 - CPE1) * Math.log(A) / Math.LN10); }
  function ventoLocal(q, r, G) {
    var I = G.info, p = G.p, qd = (r.vento && r.vento.q) || 0, cpi = p.fechamento === "aberto" ? 0 : (r.vento && r.vento.cpiMax != null ? r.vento.cpiMax : 0), h = p.peDireito + I.incl * I.apotema, wf = Math.min(2 * I.R, 2 * h) / 10, g2 = p.telha.peso + ((q.cargas && q.cargas.outros) || 0), cb = Math.cos(I.beta);
    var ell = wf / cb, Ater = ell * I.dz, Th = (I.apotema + I.beiral) / cb, Ase = wf * Th, cpeT = cpeArea(Ater), cpeS = cpeArea(Ase), pLoc = qd * (-cpeS + cpi), vNetT = Math.max(0, 1.4 * qd * (-cpeT + cpi) - g2 * I.sc), vNet = Math.max(0, 1.4 * pLoc - g2 * I.sc);
    return { fonte: "EN 1991-1-4, Tabela 7.5 (cobertura em águas, zonas de aresta) — SECUNDÁRIA, a confirmar pelo RT", cpe: cpeS, cpe_terca: cpeT, cpe_sela: cpeS, cpe10: CPE10, cpe1: CPE1, cpi: cpi, q: qd, h_m: h, wf_m: wf, wf: wf, p_loc_kN_m2: pLoc, g2_plano_kN_m2: g2 * I.sc, vNet_kN_m2: vNet, ell_m: ell, A_terca_m2: Ater, A_sela_m2: Ase, V_terca: vNetT * Ater, V_sela: vNet * Ase,
      passos: ["Zona e área: a faixa de largura wf ao longo do espigão é a zona de aresta (F) da cobertura em águas; cpe,10 = " + br(CPE10, 1) + " e cpe,1 = " + br(CPE1, 1) + " (EN 1991-1-4, Tab. 7.4a/7.5 — SECUNDÁRIA, ADOÇÃO, a confirmar pelo RT); cpe = cpe,1 + (cpe,10 − cpe,1)·log10(A) para 1 ≤ A ≤ 10 m² (7.2.1(2)): terça A = " + br(Ater, 2) + " m² → cpe = " + br(cpeT, 2) + "; sela A = " + br(Ase, 2) + " m² → cpe = " + br(cpeS, 2) + ".", "Vento local de aresta: wf = mín(2R; 2h)/10 = mín(" + br(2 * I.R) + "; " + br(2 * h) + ")/10 = " + br(wf, 2) + " m ao longo de cada espigão; cpe = −1,2 (EN 1991-1-4, Tab. 7.5, SECUNDÁRIA — a confirmar pelo RT); p = q·(1,2 + cpi) = " + br(qd, 3) + " × " + br(1.2 + cpi, 2) + " = " + br(pLoc, 3) + " kN/m²; líquido por m² de planta: 1,4·p − g2·√(1+i²) = " + br(vNet, 3) + " kN/m².", "Ponta da terça: ℓ = wf/cos β = " + br(ell, 2) + " m × dz = " + br(I.dz, 2) + " m → V = " + br(vNet * Ater) + " kN; sela: " + br(Ase, 2) + " m² → V = " + br(vNet * Ase) + " kN."] };
  }

  /* ---------------------------------------------------------------- LIGAÇÕES */
  function t4Ligacoes(q, sec, r, G, ap) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), perf = require3().perfilFn(q), p = q.params, I = G.info, noChapa = L3.noChapa, noChapaM = L3.noChapaM;
    var c = { kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, cc = ML.cfg(c), L = { ligacoes: {}, apoios90: {}, tipologia: "T4" };
    var E = r.espigao, tg = p.incl, cb = Math.cos(I.beta), k0 = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: k0.RaxK_cruzado150, lefRef: k0.lefRef, lefA: k0.lefRef * 0.8, lefB: k0.lefRef * 0.8, kmod: cc.kmod }).Rd;
    function eqv(x, k) { return x && x[k + "Eq"] != null ? x[k + "Eq"] : (x && x[k]) || 0; }
    var vl = ventoLocal(q, r, G); L.ventoLocal = vl;
    /* espigão × cubo do ápice: chapa interna em fenda + pinos; o cubo é de aço (a chapa radial soldada ao tubo é a outra metade da ligação: a "hospedeira" não tem grupo de pinos) */
    L.ligacoes.espigaoApice = noChapa(ML, cc, "espigão × cubo do ápice", Math.max(0.05, E.apice.N), Math.max(0.05, E.apice.NEq), Math.max(0.05, E.apice.S), Math.max(0.05, E.apice.SEq), sec.E, { descricao: "Espigão no cubo de aço do ápice: chapa interna t = 8 mm em fenda no espigão + pinos inox; a chapa é a aba radial do cubo (soldada ao tubo Ø" + br(CUBO.d * 1000, 0) + " × " + br(CUBO.t * 1000, 1) + "); a ponta do espigão é aparada a ≥ 10 mm do tubo e dos vizinhos (carga SÓ por chapa e pinos)." });
    /* cubo: tubo central — compressão do pilar central (se houver) e flexão por carga horizontal desbalanceada (um espigão carregado só: H do ápice × braço adotado 0,30 m); fy e γa1 de ML.cfg */
    var Nt = r.pilarCentral ? r.pilarCentral.N : 0, Rdn = CUBO.A * cc.fy * 1e3 / cc.gamaA1, Wt = Math.PI / 32 * (Math.pow(CUBO.d, 4) - Math.pow(CUBO.d - 2 * CUBO.t, 4)) / CUBO.d, Mrd = Wt * cc.fy * 1e3 / cc.gamaA1;
    var Hb = Math.max(0.05, (r.cubo && r.cubo.Hres) || 0), braco = CUBO.desce, Mt = Hb * braco, etaC = Nt / Rdn + Mt / Mrd;      /* braço = profundidade em que o tubo é preso no pilar (geometria do cubo), não adotado; H = RESULTANTE vetorial das barras do cubo por combinação */
    L.ligacoes.cuboApice = { descricao: "Cubo do ápice: tubo de aço Ø" + br(CUBO.d * 1000, 1) + " × " + br(CUBO.t * 1000, 1) + " mm (A = " + br(CUBO.A * 1e4, 1) + " cm²) com " + (G.membros.filter(function (m) { return m.g === "E" || m.g === "CB"; }).length) + " chapas radiais t = 8 mm; detalhe do cubo e da solda de oficina: fabricante/RT.", N_kN: Nt, N_Rd_kN: Rdn, M_kNm: Mt, M_Rd_kNm: Mrd, braco_m: braco, H_res_kN: Hb, eta: etaC, w_cm3: Wt * 1e6,
      passos: ["Tubo do cubo: N,Rd = A·fy/γa1 = " + br(Rdn) + " kN; M,Rd = W·fy/γa1 = " + br(Mrd, 2) + " kN·m; compressão do pilar central N = " + br(Nt) + " kN; flexão pela RESULTANTE vetorial das barras no nó, por combinação (não o máximo por barra): H,res = " + br(Hb, 2) + " kN × braço calculado " + br(braco, 2) + " m (o tubo é preso no pilar a " + br(CUBO.desce * 100, 0) + " cm abaixo do nó; sem pilar o nó está em equilíbrio, H,res = 0) → M = " + br(Mt, 2) + " kN·m; η = N/N,Rd + M/M,Rd = " + br(etaC, 3) + " (NBR 8800)."] };
    L.ligacoes.cuboApice.ok = etaC <= 1 + 1e-9;
    /* chapa RADIAL em balanço, do tubo ao centróide dos pinos do espigão: S·e, compressão com flambagem local (λ0, χ da NBR 8800) e SOLDA DE FILETE tubo–chapa (2 lados) */
    (function () {
      var pa = L.ligacoes.espigaoApice.pinos || {}, apE = ap && ap.membros ? ap.membros.filter(function (m) { return m.id === "E1"; })[0] : null, aparoE = apE && apE.bisel ? apE.bisel.aparo : 0.2, a1 = pa.a1 || 0.06, nr = pa.nr || 1, a3 = pa.a3 || 0.07;
      var eR = Math.max(0.05, aparoE + a3 + (nr - 1) * a1 / 2 - CUBO.d / 2), tp = 0.008, hp = Math.max(0.03, ((L.ligacoes.espigaoApice.chapa && L.ligacoes.espigaoApice.chapa.largura_mm) || 100) / 1000), NA = Math.max(0.05, E.apice.N), SA = Math.max(0.05, E.apice.S), MA = SA * eR;
      var Wp = tp * hp * hp / 6, MrdP = Wp * cc.fy * 1e3 / cc.gamaA1, A = tp * hp, rg = tp / Math.sqrt(12), lam0 = (2 * eR / rg) * Math.sqrt(cc.fy / 200000) / Math.PI, chi = lam0 <= 1.5 ? Math.pow(0.658, lam0 * lam0) : 0.877 / (lam0 * lam0), NrdP = chi * A * cc.fy * 1e3 / cc.gamaA1, etaP = NA / NrdP + MA / MrdP;
      var fw = 485, legs = [0.005, 0.006, 0.008, 0.010, 0.012], w = legs[legs.length - 1], etaW = Infinity, k, fl = Math.sqrt(Math.pow(NA / (2 * hp) + 6 * MA / (2 * hp * hp), 2) + Math.pow(SA / (2 * hp), 2));
      for (k = 0; k < legs.length; k++) { var Rw = 0.6 * fw * 0.707 * legs[k] * 1e3 / 1.35; if (fl / Rw <= 1) { w = legs[k]; etaW = fl / Rw; break; } if (k === legs.length - 1) { w = legs[k]; etaW = fl / Rw; } }
      var eta = Math.max(etaP, etaW);
      L.ligacoes.cuboRadial = { descricao: "Chapa radial do cubo (t = 8 mm, " + br(hp * 1000, 0) + " mm de largura) em balanço do tubo ao centróide dos pinos do espigão (e = " + br(eR * 1000, 0) + " mm) e solda de filete tubo–chapa de " + br(w * 1000, 0) + " mm nos 2 lados.", e_m: eR, N_kN: NA, S_kN: SA, M_kNm: MA, M_Rd_kNm: MrdP, chi: chi, lambda0: lam0, N_Rd_kN: NrdP, solda: { perna_mm: w * 1000, fw_MPa: fw, f_kN_m: fl, eta: etaW }, eta_chapa: etaP, eta: eta, ok: eta <= 1 + 1e-9,
        passos: ["Chapa radial: e = aparo " + br(aparoE * 1000, 0) + " + a3 " + br(a3 * 1000, 0) + " + (nr − 1)·a1/2 " + br((nr - 1) * a1 / 2 * 1000, 0) + " − raio do tubo " + br(CUBO.d / 2 * 1000, 0) + " = " + br(eR * 1000, 0) + " mm; M = S·e = " + br(SA) + " × " + br(eR, 3) + " = " + br(MA, 3) + " kN·m ≤ M,Rd = " + br(MrdP, 3) + " kN·m.", "Compressão com flambagem local (balanço, KL = 2e, r = t/√12): λ0 = " + br(lam0, 3) + ", χ = " + br(chi, 3) + ", N,Rd = " + br(NrdP) + " kN; η = N/N,Rd + M/M,Rd = " + br(etaP, 3) + " (NBR 8800).", "Solda de filete (adoção: eletrodo fw = " + br(fw, 0) + " MPa, γw2 = 1,35; garganta 0,707·perna; 2 lados × " + br(hp * 1000, 0) + " mm): força por comprimento f = " + br(fl, 1) + " kN/m (N + flexão somados, a favor, com o cortante) × resistência " + br(0.6 * fw * 0.707 * w * 1e3 / 1.35, 1) + " kN/m (perna " + br(w * 1000, 0) + " mm) → η = " + br(etaW, 3) + "; símbolo e perna na folha E04 (N3)."] };
    })();
    /* espigão × canto: sela + momento da excentricidade (δ = h_FR/2), empuxo H resolvido pelo anel; arrancamento do vento (inclusive a faixa de aresta) */
    var dlt = sec.FR.h / 2, tgH = tg * cb, cosH = 1 / Math.sqrt(1 + tgH * tgH);
    var Sh = Math.max(0.05, E.heel.S || 0, vl.V_sela * cosH), Seqh = Math.max(0.05, E.heel.SEq || 0, vl.V_sela * cosH), Nh = Math.max(0.05, E.heel.N), Nheq = Math.max(0.05, E.heel.NEq), Mh = Nh * dlt, Mheq = Nheq * dlt;
    L.ligacoes.espigaoCanto = noChapaM(ML, cc, "espigão × canto (sela sobre o frechal)", Nh, Nheq, Sh, Seqh, Mheq, sec.E, { descricao: "Espigão no canto: sela de aço (chapa em L, t = 8 mm) + pinos inox no espigão e no frechal/pilar; resiste ao empuxo (componente horizontal da compressão do espigão), ao arrancamento do vento (inclusive a faixa de aresta, cpe local −1,2) e ao MOMENTO da excentricidade da sela; a madeira do espigão fica a ≥ 10 mm do frechal (a sela ocupa a folga).", momentoSela: { delta_m: dlt, M_d_kNm: Mh, M_eq_kNm: Mheq } });
    L.ligacoes.espigaoCanto.arrancamento_kN = Math.max(E.heel.V, vl.V_sela); L.ligacoes.espigaoCanto.empuxo_kN = E.heel.H; L.ligacoes.espigaoCanto.arrancamento_local_kN = vl.V_sela;
    L.ligacoes.espigaoCanto.passos = ["Momento na sela: a sela apoia no topo do frechal, δ = h_FR/2 = " + br(dlt * 100, 0) + " cm acima do eixo do nó do modelo; M = N·δ = " + br(Nh) + " × " + br(dlt, 3) + " = " + br(Mh, 3) + " kN·m (equivalente da madeira " + br(Mheq, 3) + " kN·m) aplicado ao grupo de pinos do espigão como momento polar.", "Vento local de aresta (cpe = −1,2, faixa de " + br(vl.wf, 2) + " m; EN 1991-1-4, Tab. 7.5, SECUNDÁRIA — a confirmar pelo RT): arrancamento líquido na sela V = " + br(vl.V_sela) + " kN."].concat(L.ligacoes.espigaoCanto.passos);
    var fim = r.cinta.fim, NancH = E.heel.H / (2 * Math.sin(I.beta)), NancEq = (E.heel.HEq || E.heel.H) / (2 * Math.sin(I.beta)), Nc = Math.max(0.05, fim.N, NancH), Nceq = Math.max(0.05, fim.NEq, NancEq), Scn = Math.max(0.05, fim.S), Sceq = Math.max(0.05, fim.SEq);
    L.ligacoes.cintaCanto = noChapaM(ML, cc, "cinta do canto (frechal × frechal)", Nc, Nceq, Scn, Sceq, 0, sec.FR, { descricao: "Cinta de aço no canto do anel: os dois frechais param a ≥ 10 mm do espigão; a tração do anel (empuxo horizontal dos espigões) passa pela cinta (chapa interna t = 8 mm + pinos inox nos dois frechais). Chapa verificada pela seção bruta, LÍQUIDA (fu/γa2, γa2 = 1,35) e pelo esmagamento dos furos (NBR 8800)." });
    L.ligacoes.cintaCanto.passos = ["O empuxo horizontal do espigão no canto (" + br(E.heel.H) + " kN) é resolvido pela tração do ANEL do frechal: N_anel = H/(2·sen β) = " + br(E.heel.H / (2 * Math.sin(I.beta))) + " kN por equilíbrio do nó (β = " + br(I.beta * 180 / Math.PI, 1) + "°); a cinta é dimensionada por MAX(N do modelo, envolvente a/b/d = " + br(fim.N) + " kN; H/(2·sen β) = " + br(NancH) + " kN) = " + br(Nc) + " kN e cortante de ponta " + br(Scn) + " kN."].concat(L.ligacoes.cintaCanto.passos);
    L.ligacoes.cintaCanto.N_fim_kN = Nc; L.ligacoes.cintaCanto.N_max_barra_kN = r.cinta.N;
    var tor = r.torcaoFR || C4.torcaoFR(sec, E, r.cinta, Dm.MD.perfilEResist(q.classe, perf("curta")).f.fvd, I.beta);
    L.ligacoes.torcaoFrechal = { descricao: "Torção nas pontas do frechal no canto: o empuxo horizontal do espigão atua na sela (topo do frechal), a δ = " + br(tor.delta * 100, 0) + " cm do eixo; a componente perpendicular a cada frechal (H·cos β) gira a ponta.", T_kNm: tor.T, tau_T_MPa: tor.tau_T, tau_V_MPa: tor.tau_V, fvd_MPa: tor.fvd, alfa: tor.alfa, eta: tor.eta, ok: tor.ok,
      passos: ["Torção na ponta do frechal: T = H·cos β·δ = " + br(tor.H) + " × " + br(Math.cos(I.beta), 3) + " × " + br(tor.delta, 3) + " = " + br(tor.T, 3) + " kN·m; τT = T/(α·a·c²) = " + br(tor.tau_T, 3) + " MPa (α = " + br(tor.alfa, 3) + "); τV = 1,5·V/(b·h) = " + br(tor.tau_V, 3) + " MPa; (τV + τT)/fv,d → η = " + br(tor.eta, 3) + " (NBR 7190-1:2022; soma linear, a favor; a seção do frechal cresce no laço se reprovar)."] };
    L.detalheSela = r.detalheSela || "chapa";
    if (L.detalheSela === "chapa") {
      var ref = L.ligacoes.torcaoFrechal;
      L.ligacoes.torcaoFrechal = { descricao: "Torção nas pontas do frechal: NÃO se aplica ao detalhe padrão (sela + cinta numa chapa única; madeira sem torção); a referência é a do detalhe alternativo (sela só sobre o frechal).", referencia: { T_kNm: ref.T_kNm, tau_T_MPa: ref.tau_T_MPa, eta: ref.eta }, eta: 0, ok: true, passos: ["Detalhe padrão: sela + cinta em chapa única — torção do frechal não considerada (referência do detalhe alternativo: η = " + br(ref.eta, 3) + ")."] };
      var Hh2 = Math.max(E.heel.HEq || 0, E.heel.H || 0), cu = L3.chapaUnica(cc, Hh2, Nc, dlt, Math.max(0.03, sec.FR.h - 0.05), 0.008), apFR = ap && ap.membros ? ap.membros.filter(function (m) { return m.id === "FR1"; })[0] : null;
      L.ligacoes.chapaUnicaCanto = ext({ descricao: "Chapa única sela + cinta: entra em fenda no espigão e nos dois frechais; pinos da cinta no eixo do frechal; verificada por M = H·e_v no plano (NBR 8800); a madeira do frechal fica sem torção." }, cu);
      L.ligacoes.pontaFrechalCabe = ext({ descricao: "Os grupos de pinos da sela e da cinta cabem na ponta do frechal (espaçamentos da NBR 7190-1)." }, L3.pontaFrechalCabe(I.lado / I.nS, apFR && apFR.bisel ? apFR.bisel.aparo[0] : 0, L.ligacoes.cintaCanto.pinos, L.ligacoes.espigaoCanto.pinos));
    }
    /* terça × espigão: rosca total a 45° (par cruzado) pela reação da terça e pelo arrancamento da faixa de aresta; estribo para o esforço axial da terça (escora/tirante entre espigões) */
    var eT = r.esf.T, Vt = eT ? (eT.VEq != null ? eT.VEq : eT.V) : 0, nS, tc, Vtu = Math.max(Vt, vl.V_terca);
    for (nS = 2; nS <= 24; nS += 2) { tc = ML.roscaInclinada({ F: Vtu + Vtu * tg, n: nS, anguloGraus: 45, Rax_d: RAX }); if (tc.ok) break; }
    L.ligacoes.tercaEspigao = { descricao: "Terça com ponta em bisel de " + br(90 - 180 / I.n, 1) + "° em planta assentada no espigão em estribo de aço; parafusos de rosca total a 45° (par cruzado).", parafuso: "SFS WT-T 8,2 × 300 (ETA-12/0063)", porApoio: nS, Rax_d: RAX, F_d: Vt, H_d: Vt * tg, eta: tc.eta, ok: tc.ok, vento_local: { V_terca: vl.V_terca, wf_m: vl.wf_m, cpe: vl.cpe_terca, fonte: vl.fonte }, passos: ["Reação do apoio da terça no espigão = " + br(Vt) + " kN; componente ao longo da água H = V·tgθ = " + br(Vt * tg) + " kN; arrancamento líquido da faixa de aresta = " + br(vl.V_terca) + " kN; dimensionado para V = " + br(Vtu) + " kN."].concat(tc.passos) };
    var eTa = r.esf.T || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 };
    L.ligacoes.tercaEspigaoAxial = noChapa(ML, cc, "terça × espigão (esforço axial da terça pelo estribo)", Math.max(0.05, eTa.Nt, eTa.Nc), Math.max(0.05, eqv(eTa, "Nt"), eqv(eTa, "Nc")), Math.max(0.05, eTa.V, vl.V_terca), Math.max(0.05, eqv(eTa, "V"), vl.V_terca), sec.T, { descricao: "Estribo de aço na ponta da terça (chapa interna t = 8 mm + pinos inox): transmite ao espigão o esforço axial N da terça (anel de terças: escora/tirante entre espigões) sem contato de madeira." });
    if (I.caibro) {
      var cp = r.caibro, Fa = cp.apice, Fp = cp.pe;
      L.ligacoes.caibroApice = noChapa(ML, cc, "caibro × cubo do ápice", Math.max(0.05, Fa.N), Math.max(0.05, Fa.NEq), Math.max(0.05, Fa.S), Math.max(0.05, Fa.SEq), sec.CB, { descricao: "Caibro de meio de água no cubo do ápice: chapa interna em fenda + pinos; ponta aparada a ≥ 10 mm do tubo e dos espigões vizinhos." });
      L.ligacoes.caibroPe = noChapa(ML, cc, "caibro × frechal (pé)", Math.max(0.05, Fp.N), Math.max(0.05, Fp.NEq), Math.max(0.05, Fp.S, Fp.V), Math.max(0.05, Fp.SEq, Fp.VEq), sec.CB, { descricao: "Pé do caibro sobre o frechal/pilar do meio do lado: sela de aço (chapa em L) + pinos; resiste ao empuxo e ao arrancamento do vento." });
      var Vc = 2 * (eT ? (eT.VEq != null ? eT.VEq : eT.V) : 0), nC, tcc; for (nC = 2; nC <= 24; nC += 2) { tcc = ML.roscaInclinada({ F: Math.max(0.1, Vc) * (1 + tg), n: nC, anguloGraus: 45, Rax_d: RAX }); if (tcc.ok) break; }
      L.ligacoes.tercaCaibro = { descricao: "Terça contínua sobre o caibro de meio: parafusos de rosca total a 45° em cada cruzamento (reação do apoio intermediário da terça ≈ 2·V,máx).", parafuso: "SFS WT-T 8,2 × 300 (ETA-12/0063)", porApoio: nC, Rax_d: RAX, F_d: Vc, eta: tcc.eta, ok: tcc.ok, passos: ["Reação da terça contínua no caibro ≈ 2·V,máx = " + br(Vc) + " kN (a reação do apoio intermediário de viga de 2 vãos vale 1,25·w·L; o cortante junto ao apoio, 0,625·w·L)."].concat(tcc.passos) };
    }
    if (I.pilarCentral) {
      var pc = r.pilarCentral;
      L.ligacoes.pilarCentralTopo = noChapa(ML, cc, "pilar central × tubo do cubo (topo)", Math.max(0.05, pc.Nt || 0.05), Math.max(0.05, pc.NtEq || 0.05), Math.max(0.05, pc.S), Math.max(0.05, pc.SEq), sec.PC, { descricao: "Topo do pilar central: o tubo do cubo desce " + br(CUBO.desce * 100, 0) + " cm dentro do pilar (fenda + pinos inox) e transmite compressão por apoio da chapa de topo e tração/cortante pelos pinos." });
      var fc0 = Dm.MD.perfilEResist(q.classe, perf("curta")).f.fc0d, Ap = 0.15 * 0.15, sg = pc.N / Ap / 1000;
      L.apoios90.apoioPilarCentralTopo = { descricao: "Compressão na chapa de topo do pilar central (150 × 150 mm)", R_d: pc.N, area_cm2: Ap * 1e4, sigma_c0_MPa: sg, fc0d_MPa: fc0, eta: sg / fc0, ok: sg / fc0 <= 1 + 1e-9, passos: ["Chapa de topo do pilar central: σc,0 = " + br(pc.N) + " kN / " + br(Ap * 1e4, 0) + " cm² = " + br(sg, 3) + " MPa ≤ fc,0,d = " + br(fc0, 3) + " MPa → η = " + br(sg / fc0, 3) + " (NBR 7190-1:2022)."] };
    }
    /* compressão ⊥ às fibras do frechal sob a sela do espigão (200 mm) */
    var Rv = Math.max(E.heel.V, 0.001), Ae = sec.E.b * 0.20, an = ML.alfaN(20), kmL = perf("longa").kmod, fc90d = Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an), sg2 = Rv / Ae / 1000, etaA = sg2 / fc90d;
    L.apoios90.apoioEspigaoSela = { descricao: "Compressão ⊥ às fibras do frechal sob a sela do espigão (200 mm)", R_d: Rv, area_cm2: Ae * 1e4, sigma_c90_MPa: sg2, fc90d_MPa: fc90d, alphaN: an, eta: etaA, ok: etaA <= 1 + 1e-9, passos: ["Sela do espigão sobre o frechal: σc,90 = " + br(Rv) + " kN / " + br(Ae * 1e4, 0) + " cm² = " + br(sg2, 3) + " MPa ≤ fc90,d·αn = " + br(fc90d, 3) + " MPa → η = " + br(etaA, 3) + " (NBR 7190-1:2022, 6.3.3)."] };
    if (I.caibro) { var Rc = Math.max(r.caibro.pe.V, 0.001), Ae2 = sec.CB.b * 0.20, sg3 = Rc / Ae2 / 1000, et3 = sg3 / fc90d; L.apoios90.apoioCaibroPe = { descricao: "Compressão ⊥ às fibras do frechal sob o pé do caibro (200 mm)", R_d: Rc, area_cm2: Ae2 * 1e4, sigma_c90_MPa: sg3, fc90d_MPa: fc90d, eta: et3, ok: et3 <= 1 + 1e-9, passos: ["Pé do caibro sobre o frechal: σc,90 = " + br(Rc) + " kN / " + br(Ae2 * 1e4, 0) + " cm² = " + br(sg3, 3) + " MPa ≤ " + br(fc90d, 3) + " MPa → η = " + br(et3, 3) + "."] }; }
    if (ap && ap.folgas) L.folgas = ap.resumo;
    L.verificacoes = Object.keys(L.ligacoes).map(function (k) { return { nome: k, eta: L.ligacoes[k].eta, ok: L.ligacoes[k].ok !== false && L.ligacoes[k].eta <= 1 + 1e-9 }; }).concat(Object.keys(L.apoios90).map(function (k) { return { nome: k, eta: L.apoios90[k].eta, ok: L.apoios90[k].ok !== false && L.apoios90[k].eta <= 1 + 1e-9 }; }));
    L.eta = Math.max.apply(null, L.verificacoes.map(function (v) { return v.eta; })); L.ok = L.verificacoes.every(function (v) { return v.ok; });
    L.passos = []; Object.keys(L.ligacoes).forEach(function (k) { if (L.ligacoes[k].passos) L.passos = L.passos.concat(L.ligacoes[k].passos); }); Object.keys(L.apoios90).forEach(function (k) { L.passos = L.passos.concat(L.apoios90[k].passos); });
    return L;
  }

  /* ---------------------------------------------------------------- AUDITOR */
  function auditar(o) {
    var A = [], G = o.G, I = G.info, ap = o.aparo;
    function ach(regra, peca, msg, cor) { A.push({ regra: regra, peca: peca, mensagem: msg, correcao: cor }); }
    G.membros.filter(function (m) { return m.g === "E"; }).forEach(function (E) { if (!(E.nos && E.nos.length)) ach("espigao-sem-no", E.id, "Espigão sem nós de apoio das terças.", "Revisar a geometria (nH ≥ 2)."); });
    if (ap && ap.folgas) ap.folgas.forEach(function (f) { if (f.folga_mm < FOLGA * 1000 - 0.5) ach("folga-construtiva", f.peca, "Folga de " + f.folga_mm.toFixed(1).replace(".", ",") + " mm contra " + f.contra + " (mínimo 10 mm).", "Aumentar o aparo da ponta."); });
    if (!ap || !ap.folgas || !ap.folgas.length) ach("folga-nao-medida", "T4", "As folgas construtivas não foram medidas.", "Rodar o aparo (aparar).");
    if (o.res && o.res.cinta && o.res.cinta.N > 0 && o.lig && o.lig.ligacoes.cintaCanto && o.lig.ligacoes.cintaCanto.ok === false) ach("cinta", "cinta do canto", "A cinta do canto não atende a tração do anel.", "Aumentar a chapa/pinos da cinta ou a seção do frechal.");
    Object.keys((o.res && o.res.esbeltez) || {}).forEach(function (g) { if (o.res.esbeltez[g].lambdaMax > 140) ach("esbeltez", g, "Esbeltez " + o.res.esbeltez[g].lambdaMax.toFixed(0) + " > 140 no grupo " + g + ".", "Engrossar a peça."); });
    if (I.caibro && !G.membros.some(function (m) { return m.g === "P" && m.ptLado === I.nS / 2; })) ach("caibro-sem-pilar", "CB", "Caibro de meio sem pilar no meio do lado.", "Usar nS par.");
    var rp = {}; A.forEach(function (a) { rp[a.regra] = (rp[a.regra] || 0) + 1; });
    return { achados: A, porRegra: rp, ok: A.length === 0 };
  }

  /* ---------------------------------------------------------------- PROJETO COMPLETO */
  /** CENÁRIO "SEM CINTA": o frechal sem rigidez axial (anel cortado). Terças da ponta, diagonais das paredes, pilares, espigões e estribos têm de continuar com η ≤ 1; se algum passar de 1 (ou o modelo virar mecanismo), a CINTA É OBRIGATÓRIA e isso vai para o memorial */
  function semCintaCenario(proj, d, G, ap) {
    var p2 = {}, r2, out = { etas: {}, ligacoes: {} }, mx = 0, k;
    Object.keys(proj).forEach(function (k2) { if (k2.charAt(0) !== "_") p2[k2] = proj[k2]; }); p2.diagnostico = ext({}, proj.diagnostico || {}, { semCintaFR: true });
    try { r2 = C4.rodar(p2, d.secoes); } catch (ex) { return { obrigatoria: true, mecanismo: true, etaMax: Infinity, etas: {}, ligacoes: {}, motivo: "sem a cinta o modelo não fecha (" + String(ex.message).slice(0, 80) + "): a cinta é OBRIGATÓRIA" }; }
    var pior = require3().pior(r2, d.secoes); Object.keys(pior).forEach(function (g) { if (g === "FR") return; out.etas[g] = pior[g]; mx = Math.max(mx, pior[g]); });
    var L2 = t4Ligacoes(p2._pad4, d.secoes, r2, G, ap); L2.verificacoes.forEach(function (v) { if (/cinta|torcao|chapaUnica|pontaFrechal/i.test(v.nome)) return; out.ligacoes[v.nome] = v.eta; mx = Math.max(mx, v.eta); });
    out.etaMax = mx; out.obrigatoria = mx > 1 + 1e-9; out.mecanismo = false;
    var pior1 = Object.keys(out.etas).concat(Object.keys(out.ligacoes)).sort(function (a, b) { return (out.etas[b] || out.ligacoes[b]) - (out.etas[a] || out.ligacoes[a]); })[0];
    out.motivo = out.obrigatoria ? "sem a cinta (frechal sem rigidez axial) o η passa de 1 (" + mx.toFixed(2).replace(".", ",") + " em " + pior1 + "): a cinta é OBRIGATÓRIA" : "sem a cinta (frechal sem rigidez axial) as terças da ponta, as diagonais das paredes, os pilares, os espigões e os estribos continuam com η ≤ 1 (máx. " + mx.toFixed(2).replace(".", ",") + " em " + pior1 + "): o empuxo tem outras vias (diagonais das paredes, anel de terças); a cinta fica como projeto (redundância e continuidade do anel), não como única via";
    return out;
  }
  function infoPuro(I) { var o = {}; Object.keys(I).forEach(function (k) { if (typeof I[k] !== "function") o[k] = I[k]; }); return o; }
  function projetar(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var kr = proj.krBase != null ? proj.krBase : (opcoes.kr0 || 8000), krMap = null, tent = [], d, b, k, conv = false;
    for (k = 0; k < (opcoes.voltasBase || 3); k++) {
      proj._krBase = krMap || kr; d = C4.dimensionar(proj, k ? d.secoes : partida, opcoes); b = C4.base(proj, d.resultado, d.secoes);
      tent.push({ krUsado: krMap ? copia(krMap) : kr, Ktheta: b.Ktheta, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = b.porGrupo[g].Ktheta; return o; }, {}) });
      if (proj.krBase != null) { conv = true; break; }
      var nm = {}, tudo = true; Object.keys(b.porGrupo).forEach(function (g) { var kg = krMap && krMap[g] != null ? krMap[g] : kr, kt = b.porGrupo[g].Ktheta; if (kt && Math.abs(kt - kg) / kg >= 0.12) tudo = false; nm[g] = !kt ? kg : (Math.min(kg, kt) === kg ? 0.5 * (kg + kt) : kt); });
      if (tudo) { conv = true; break; } krMap = nm;
    }
    var gv = b.grupoGov, krGov = krMap && krMap[gv] != null ? krMap[gv] : kr, rigidez = { auto: proj.krBase == null, krBase: krGov, Ktheta: b.Ktheta, convergiu: conv, voltas: tent, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = { krBase: krMap && krMap[g] != null ? krMap[g] : kr, Ktheta: b.porGrupo[g].Ktheta }; return o; }, {}) };
    var vezesP = 0; while (b.LG && b.LG.ok === false && vezesP < 8) { var gr = false; ["P", "PC"].forEach(function (g) { if (d.secoes[g] && require3().crescer(proj._pad4, d.secoes, g, d.resultado)) gr = true; }); if (!gr) break; vezesP++; proj._krBase = krMap || kr; d = C4.dimensionar(proj, d.secoes, opcoes); b = C4.base(proj, d.resultado, d.secoes); d.resultado.avisos.push("T4: base reprovada — pilar crescido para " + Math.round(d.secoes.P.b * 100) + " cm (volta " + vezesP + ")."); }
    if (!conv) d.resultado.avisos.push("N6/T4: a rigidez da base não convergiu em " + tent.length + " voltas — conferir.");
    proj._krBase = null;
    var q = proj._pad4, G = T4.geometria(q.params), ap = aparar(G, d.secoes), F = T4.fonte(q.params, d.secoes, { classe: q.classe }, ap);
    var out = { secoes: d.secoes, resultado: d.resultado, historico: d.historico, semSolucao: d.semSolucao, pior: d.pior, ligacoes: b.LG, rigidezBase: rigidez, tipologia: "T4", aparo: { folgas: ap.folgas, resumo: ap.resumo, cubo: ap.cubo } };
    out.fonte = { pecas: F.pecas, volume_por_material_m3: T4.volumePorMaterial(F.pecas) };
    out.t4 = { params: q.params, info: infoPuro(G.info), membros: ap.membros.map(function (m) { return { id: m.id, g: m.g, agua: m.agua == null ? null : m.agua, p0: m.p0, p1: m.p1, eixo0: m.eixo0, eixo1: m.eixo1, nos: m.nos || [], bisel: m.bisel || null, canto: m.canto || null, pe: m.pe || null, ws: m.ws || null, d: m.d == null ? null : m.d }; }), folgas: ap.folgas };
    out.ligacoesT4 = t4Ligacoes(q, d.secoes, d.resultado, G, ap);
    out.auditoria = auditar({ G: G, sec: d.secoes, res: d.resultado, lig: out.ligacoesT4, aparo: ap });
    out.semCinta = semCintaCenario(proj, d, G, ap);
    return out;
  }
  function require3() { return global.MadT3Calc || require("./madt3calc.js"); }

  var MadT4Lig = { aparar: aparar, ligacoes: t4Ligacoes, ventoLocal: ventoLocal, auditar: auditar, projetar: projetar };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT4Lig;
  else global.MadT4Lig = MadT4Lig;
})(typeof window !== "undefined" ? window : this);

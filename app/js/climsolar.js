/* =====================================================================
 * climsolar.js — GANHO SOLAR pela física (climatização, frente C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md §8.
 *
 * POR QUE EXISTE. A carga por componentes pedia DTE (diferença de temperatura
 * equivalente) por orientação e ganho solar do vidro por orientação; as únicas
 * tabelas achadas (ASHRAE CLTD/SCL) são de latitude NORTE e espelhar seria
 * inventar. Em vez da tabela, calcula-se hora a hora, com os dados TMYx da
 * cidade (js/climclima.js), o que a tabela resumia:
 *   1) posição do sol (NOAA, "General Solar Position Calculations");
 *   2) radiação de céu claro (modelo "tau" revisado do ASHRAE, com taub/taud
 *      do mês da própria estação, lidos do .stat do TMYx);
 *   3) radiação no plano de cada fachada e da cobertura (modelo isotrópico de
 *      Liu-Jordan: direta × cos θ + difusa × (1+cos Σ)/2 + refletida pelo solo);
 *   4) temperatura sol-ar  Tsa = To + α·It·Rse − ε·ΔR·Rse  (α e ε da NBR 15220-2
 *      ou da referência INI-C; Rse da NBR 15220-2; ΔR = onda longa para o céu,
 *      com o IR do céu do próprio EPW);
 *   5) parede/cobertura: q = U·A·[(T̄sa − Ti) + f·(Tsa(t−φ) − T̄sa)]; vidro:
 *      A·FS·It (sol) + U·A·(To − Ti) (condução); hora e mês de pico do ambiente.
 *
 * ⚠ Nenhum valor de norma aqui: α, ε, Rse, U, FS chegam do climcarga (que lê o
 *   HidNormas ou a entrada do RT). Aqui só física com a referência ao lado.
 * ⚠ Premissas declaradas (vão ao memorial pelos passos):
 *   · dia de projeto = dia 21 de cada mês, CÉU CLARO (sem nuvem: lado seguro);
 *   · pico do mês m: TBS = menor entre a TBS anual do percentil escolhido e a
 *     TBS de projeto MENSAL 0,4 % do mês (o anual nunca é ultrapassado; meses
 *     mais frios não herdam o pico do verão); amplitude = "Drybulb range - DB 5%"
 *     do mês; forma do dia = perfil horário médio do mês no EPW;
 *   · sem amortecimento/atraso informado: f = 1 e φ = 0 (a sol-ar instantânea —
 *     o LIMITE SUPERIOR da resposta periódica de uma parede; a sol-ar média seria
 *     o inferior);
 *   · vidro: ganho instantâneo = carga (sem fator de carga de resfriamento) e FS
 *     de incidência normal (sem correção por ângulo) — os dois a maior;
 *   · componente que PERDE calor na hora de pico não abate a carga (vale 0).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = Number(v); return v !== null && v !== undefined && v !== "" && isFinite(n) ? n : null; }
  function fmt(v, casas) { if (typeof v !== "number" || !isFinite(v)) return "—"; return v.toFixed(casas == null ? 1 : casas).replace(".", ","); }

  /* -------------------------------------------------------------- FÍSICA */
  /* clim:fisica-inicio — geometria solar e radiação (referências ao lado de cada bloco)
     · POSIÇÃO DO SOL — NOAA Global Monitoring Division, "General Solar Position Calculations"
       (gml.noaa.gov/grad/solcalc/solareqns.PDF): ano fracionário γ, equação do tempo (min),
       declinação (rad) pela série de Spencer; tst = hora·60 + eqtime + 4·longitude − 60·fuso;
       ângulo horário = tst/4 − 180; cos(zênite) = sen φ sen δ + cos φ cos δ cos h.
       Azimute (graus, horário a partir do norte) pela forma atan2 da mesma geometria.
     · CÉU CLARO — modelo "tau" revisado do ASHRAE (Handbook Fundamentals, cap. 14), coeficientes
       da edição 2017 (EnergyPlus Engineering Reference, "ASHRAE Revised Clear Sky Model",
       opção ASHRAETau2017): Eb = E0·exp(−τb·m^ab), Ed = E0·exp(−τd·m^ad),
       ab = 1,454 − 0,406τb − 0,268τd + 0,021τbτd; ad = 0,507 + 0,205τb − 0,080τd − 0,190τbτd;
       massa de ar m = 1/[sen β + 0,50572·(6,07995 + β)^−1,6364] (β em graus; Kasten e Young, 1989);
       E0 = 1367·[1 + 0,033·cos(360°·(n − 3)/365)] W/m² (ASHRAE Fundamentals, cap. 14).
       ⚠ tools/test-clim-solar.js confere estes coeficientes contra o "ib/id ao meio-dia do dia 21"
       que o próprio .stat de cada estação publica.
     · PLANO INCLINADO — Liu e Jordan (isotrópico): It = Eb·cos θ + Ed·(1 + cos Σ)/2 + ρ·Eh·(1 − cos Σ)/2
       (Loutzenhiser et al., Solar Energy 81, 2007; pvlib.irradiance.isotropic / get_ground_diffuse);
       cos θ = cos Z cos Σ + sen Z sen Σ cos(γs − γ) (produto escalar dos versores sol × normal).
     · ONDA LONGA — ΔR = Fcéu·(σ·To⁴ − IRcéu), Fcéu = (1 + cos Σ)/2 (fator de forma para o céu;
       ISO 13790; EnergyPlus "Outside Surface Heat Balance", Walton 1983, solo à temperatura do ar);
       σ = 5,670374419e−8 W/(m²·K⁴) (CODATA 2018).
     · CALENDÁRIO — ano típico de 365 dias; dia do ano pelo Date.UTC (2001 não é bissexto).
     · Sombra de beiral horizontal — ângulo de perfil: tan Ω = tan β / cos(γs − γ); sombra
       vertical = P·tan Ω (geometria). */
  var RAD = Math.PI / 180, GRAUS = 180 / Math.PI, KELVIN = 273.15, SIGMA = 5.670374419e-8;
  var DIAS_ANO = 365, MIN_POR_GRAU_LONG = 4, MIN_POR_HORA = 60, GRAUS_POR_MIN_TST = 4, MEIA_VOLTA = 180, VOLTA = 360, HORAS_DIA = 24, MEIO_DIA = 12;
  var ANO_TIPICO = 2001, MS_DIA = 86400000, DIA_PROJETO = 21;
  var EQT = [229.18, 0.000075, 0.001868, -0.032077, -0.014615, -0.040849];
  var DECL = [0.006918, -0.399912, 0.070257, -0.006758, 0.000907, -0.002697, 0.00148];
  var ESC = 1367, E0_AMP = 0.033, E0_DESLOC = 3;
  var KY = [0.50572, 6.07995, -1.6364];
  var AB = [1.454, -0.406, -0.268, 0.021], AD = [0.507, 0.205, -0.080, -0.190];
  function diaDoAno(mes, dia) { return Math.round((Date.UTC(ANO_TIPICO, mes - 1, dia) - Date.UTC(ANO_TIPICO, 0, 1)) / MS_DIA) + 1; }
  /* posição do sol — horaLocal em horas decimais (hora padrão do fuso, sem horário de verão) */
  function posicao(lat, lon, fuso, n, horaLocal) {
    var horaUTC = horaLocal - fuso, g = 2 * Math.PI / DIAS_ANO * (n - 1 + (horaUTC - MEIO_DIA) / HORAS_DIA);
    var eqt = EQT[0] * (EQT[1] + EQT[2] * Math.cos(g) + EQT[3] * Math.sin(g) + EQT[4] * Math.cos(2 * g) + EQT[5] * Math.sin(2 * g));
    var dec = DECL[0] + DECL[1] * Math.cos(g) + DECL[2] * Math.sin(g) + DECL[3] * Math.cos(2 * g) + DECL[4] * Math.sin(2 * g) + DECL[5] * Math.cos(3 * g) + DECL[6] * Math.sin(3 * g);
    var tst = horaLocal * MIN_POR_HORA + eqt + MIN_POR_GRAU_LONG * lon - MIN_POR_HORA * fuso;
    var ha = tst / GRAUS_POR_MIN_TST - MEIA_VOLTA, phi = lat * RAD, h = ha * RAD;
    var cz = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h);
    cz = Math.max(-1, Math.min(1, cz));
    var z = Math.acos(cz) * GRAUS;
    var az = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) * GRAUS + MEIA_VOLTA) % VOLTA;
    return { n: n, declinacao: dec * GRAUS, eqTempo_min: eqt, anguloHorario: ha, zenite: z, altura: 90 - z, azimute: az < 0 ? az + VOLTA : az };   /* clim:ok altura = 90° − zênite (geometria) */
  }
  function E0(n) { return ESC * (1 + E0_AMP * Math.cos(VOLTA * RAD * (n - E0_DESLOC) / DIAS_ANO)); }
  function massaAr(beta) { return 1 / (Math.sin(beta * RAD) + KY[0] * Math.pow(KY[1] + beta, KY[2])); }
  /* céu claro: { Ebn (direta normal), Edh (difusa horizontal) } em W/m²; sol abaixo do horizonte → 0 */
  function ceuClaro(beta, n, taub, taud) {
    if (!(beta > 0)) return { Ebn: 0, Edh: 0, m: null };
    var m = massaAr(beta), e0 = E0(n);
    var ab = AB[0] + AB[1] * taub + AB[2] * taud + AB[3] * taub * taud, ad = AD[0] + AD[1] * taub + AD[2] * taud + AD[3] * taub * taud;
    return { Ebn: e0 * Math.exp(-taub * Math.pow(m, ab)), Edh: e0 * Math.exp(-taud * Math.pow(m, ad)), m: m, E0: e0 };
  }
  function cosIncidencia(sol, inclinacao, azSup) {
    var Z = sol.zenite * RAD, S = inclinacao * RAD;
    return Math.cos(Z) * Math.cos(S) + Math.sin(Z) * Math.sin(S) * Math.cos((sol.azimute - azSup) * RAD);
  }
  /* radiação no plano (Liu-Jordan); fSol = fração da superfície ao sol direto (beiral) */
  function radiacaoPlano(sol, ceu, albedo, inclinacao, azSup, fSol) {
    var ci = cosIncidencia(sol, inclinacao, azSup), S = inclinacao * RAD, Eh = ceu.Ebn * Math.max(0, Math.cos(sol.zenite * RAD)) + ceu.Edh;
    var dir = sol.altura > 0 && ci > 0 ? ceu.Ebn * ci * (fSol == null ? 1 : fSol) : 0;
    var dif = ceu.Edh * (1 + Math.cos(S)) / 2, ref = (albedo || 0) * Eh * (1 - Math.cos(S)) / 2;
    return { direta: dir, difusa: dif, refletida: ref, total: dir + dif + ref, cosTheta: ci };
  }
  function fatorCeu(inclinacao) { return (1 + Math.cos(inclinacao * RAD)) / 2; }
  function deltaR(To, irCeu, inclinacao) { return fatorCeu(inclinacao) * (SIGMA * Math.pow(To + KELVIN, 4) - irCeu); }   /* clim:ok To⁴ (Stefan-Boltzmann) */
  function solAr(To, It, alfa, eps, dR, Rse) { return To + alfa * It * Rse - (eps == null ? 0 : eps * dR * Rse); }
  /* fração ensolarada de uma janela sob beiral horizontal (projeção P, afastamento G acima do topo, altura H) */
  function fracaoSolBeiral(sol, azSup, beiral, H) {
    if (!beiral || !(num(beiral.projecao_m) > 0) || !(H > 0) || !(sol.altura > 0)) return 1;
    var c = Math.cos((sol.azimute - azSup) * RAD); if (c <= 0) return 1;
    var y = num(beiral.projecao_m) * Math.tan(sol.altura * RAD) / c, G = num(beiral.afastamento_m) || 0;
    return 1 - Math.max(0, Math.min(H, y - G)) / H;
  }
  /* clim:fisica-fim */

  /* ----------------------------------------------------- DIA DE PROJETO
   * clima = registro do ClimClima (uma estação); mes 1..12; tbsAnual = TBS de projeto anual
   * do percentil escolhido (cl.condicoes_externas_mg_ashrae_tmyx). Devolve as 24 horas. */
  function diaProjeto(clima, mes, tbsAnual) {
    var i = mes - 1, M = clima.mensal || {}, H = clima.horario || {};
    var perfil = arr(H.tbs_c)[i], ir = arr(H.ir_ceu_wm2)[i], t04 = num(arr(M.tbs_projeto_04pct)[i]), amp = num(arr(M.amplitude_tbs_5pct)[i]);
    var taub = num(arr(M.taub)[i]), taud = num(arr(M.taud)[i]), alb = num(arr(M.albedo)[i]);
    var faltam = [];
    if (!Array.isArray(perfil) || perfil.length !== HORAS_DIA) faltam.push("horario.tbs_c");
    if (!Array.isArray(ir) || ir.length !== HORAS_DIA) faltam.push("horario.ir_ceu_wm2");
    if (t04 == null) faltam.push("mensal.tbs_projeto_04pct"); if (amp == null) faltam.push("mensal.amplitude_tbs_5pct");
    if (taub == null || taud == null) faltam.push("mensal.taub/taud"); if (num(tbsAnual) == null) faltam.push("tbs anual de projeto");
    if (faltam.length) return { ok: false, faltam: faltam };
    var mx = Math.max.apply(null, perfil), mn = Math.min.apply(null, perfil), faixa = mx - mn;
    var pico = Math.min(num(tbsAnual), t04), n = diaDoAno(mes, DIA_PROJETO), horas = [];
    for (var h = 0; h < HORAS_DIA; h++) {
      var X = faixa > 0 ? (mx - perfil[h]) / faixa : 0, To = pico - amp * X;
      var sol = posicao(clima.latitude, clima.longitude, clima.fuso_h, n, h), ceu = ceuClaro(sol.altura, n, taub, taud);
      horas.push({ hora: h, To: To, sol: sol, ceu: ceu, irCeu: num(ir[h]) });
    }
    return { ok: true, mes: mes, dia: DIA_PROJETO, n: n, picoTBS: pico, tbsAnual: num(tbsAnual), tbsMensal04: t04, amplitude: amp, albedo: alb == null ? 0 : alb, albedoOrigem: alb == null ? "sem albedo no EPW: 0 (sem refletida)" : "albedo médio do mês no EPW", taub: taub, taud: taud, horas: horas };
  }

  /* --------------------------------------------------------- ENVOLTÓRIA
   * e = { clima, tbsAnual, ti, meses?: [1..12],
   *       opacos: [{ tipo: "parede"|"cobertura", id, U, A, inclinacao, azimute, alfa, eps, Rse, f?, atraso_h? }],
   *       vidros: [{ id, A, FS, U, inclinacao, azimute, altura_m?, beiral? }] }
   * → { ok, pico: { mes, hora, W }, componentes: [{ tipo, alvo, W, serie (24 h do mês de pico), passos }], meses: [{ mes, hora, W }] } */
  function envoltoria(e) {
    var meses = arr(e.meses).length ? e.meses : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];   /* clim:ok os doze meses */
    var porMes = [], dias = {}, faltas = [];
    meses.forEach(function (m) { var d = diaProjeto(e.clima, m, e.tbsAnual); if (d.ok) dias[m] = d; else d.faltam.forEach(function (f) { if (faltas.indexOf(f) < 0) faltas.push(f); }); });
    if (!Object.keys(dias).length) return { ok: false, faltam: faltas };
    function serieOpaco(o, d) {
      var tsa = d.horas.map(function (x) { var r = radiacaoPlano(x.sol, x.ceu, d.albedo, o.inclinacao, o.azimute, 1); return solAr(x.To, r.total, o.alfa, o.eps, x.irCeu == null ? 0 : deltaR(x.To, x.irCeu, o.inclinacao), o.Rse); });
      var media = tsa.reduce(function (s, v) { return s + v; }, 0) / HORAS_DIA, f = num(o.f) == null ? 1 : num(o.f), fi = Math.round(num(o.atraso_h) || 0);
      return { tsa: tsa, media: media, W: tsa.map(function (v, h) { var j = ((h - fi) % HORAS_DIA + HORAS_DIA) % HORAS_DIA; return o.U * o.A * ((media - e.ti) + f * (tsa[j] - media)); }) };
    }
    function serieVidro(v, d) {
      var sol = [], cond = [];
      d.horas.forEach(function (x) {
        var fs = fracaoSolBeiral(x.sol, v.azimute, v.beiral, num(v.altura_m)), r = radiacaoPlano(x.sol, x.ceu, d.albedo, v.inclinacao, v.azimute, fs);
        sol.push({ W: v.A * v.FS * r.total, I: r.total, fSol: fs }); cond.push(v.U == null ? null : v.U * v.A * (x.To - e.ti));
      });
      return { sol: sol, cond: cond };
    }
    var melhor = null;
    Object.keys(dias).forEach(function (k) {
      var d = dias[k], tot = []; for (var h = 0; h < HORAS_DIA; h++) tot.push(0);
      arr(e.opacos).forEach(function (o) { serieOpaco(o, d).W.forEach(function (w, h) { tot[h] += Math.max(0, w); }); });
      arr(e.vidros).forEach(function (v) { var s = serieVidro(v, d); s.sol.forEach(function (x, h) { tot[h] += x.W; if (s.cond[h] != null) tot[h] += Math.max(0, s.cond[h]); }); });
      var hp = 0; tot.forEach(function (w, h) { if (w > tot[hp]) hp = h; });
      porMes.push({ mes: d.mes, hora: hp, W: tot[hp] });
      if (!melhor || tot[hp] > melhor.W) melhor = { mes: d.mes, hora: hp, W: tot[hp], serie: tot, dia: d };
    });
    var d = melhor.dia, hp = melhor.hora, x = d.horas[hp], comps = [];
    var cab = "pico " + d.dia + "/" + d.mes + " às " + hp + " h (hora padrão), céu claro (τb " + fmt(d.taub, 3) + ", τd " + fmt(d.taud, 3) + "): To = " + fmt(x.To) + " °C (pico do mês " + fmt(d.picoTBS) + " °C = menor entre anual " + fmt(d.tbsAnual) + " e mensal 0,4 % " + fmt(d.tbsMensal04) + "; amplitude " + fmt(d.amplitude) + " K), sol a " + fmt(x.sol.altura) + "° de altura e azimute " + fmt(x.sol.azimute) + "°";   /* clim:ok casas decimais na formatação */
    arr(e.opacos).forEach(function (o) {
      var s = serieOpaco(o, d), r = radiacaoPlano(x.sol, x.ceu, d.albedo, o.inclinacao, o.azimute, 1), dR = x.irCeu == null ? 0 : deltaR(x.To, x.irCeu, o.inclinacao), W = Math.max(0, s.W[hp]);
      var passos = [cab,
        "It = " + fmt(r.direta, 0) + " (direta, cos θ " + fmt(r.cosTheta, 2) + ") + " + fmt(r.difusa, 0) + " (difusa) + " + fmt(r.refletida, 0) + " (solo, albedo " + fmt(d.albedo, 2) + ") = " + fmt(r.total, 0) + " W/m²",
        "Tsa = To + α·It·Rse − ε·ΔR·Rse = " + fmt(x.To) + " + " + fmt(o.alfa, 2) + " × " + fmt(r.total, 0) + " × " + fmt(o.Rse, 2) + (o.eps == null ? " (sem ε na fonte: sem perda de onda longa, lado seguro)" : " − " + fmt(o.eps, 2) + " × " + fmt(dR, 0) + " × " + fmt(o.Rse, 2)) + " = " + fmt(s.tsa[hp]) + " °C (média do dia " + fmt(s.media) + " °C)",
        (num(o.f) == null && num(o.atraso_h) == null ? "sem amortecimento informado: f = 1, φ = 0 (sol-ar instantânea, limite superior)" : "amortecimento f = " + fmt(num(o.f) == null ? 1 : num(o.f), 2) + ", atraso " + (num(o.atraso_h) || 0) + " h (informado pelo RT, com fonte)"),
        "Q = U·A·[(T̄sa − Ti) + f·(Tsa(t−φ) − T̄sa)] = " + fmt(o.U, 2) + " × " + fmt(o.A, 2) + " × [(" + fmt(s.media) + " − " + fmt(e.ti) + ") + " + fmt(num(o.f) == null ? 1 : num(o.f), 2) + " × (" + fmt(s.tsa[((hp - Math.round(num(o.atraso_h) || 0)) % HORAS_DIA + HORAS_DIA) % HORAS_DIA]) + " − " + fmt(s.media) + ")] = " + fmt(s.W[hp]) + " W" + (s.W[hp] < 0 ? " → 0 (perde calor na hora de pico: não abate a carga)" : "")];
      comps.push({ tipo: o.tipo, alvo: o.id, W: W, serie: s.W, passos: passos, tsa: s.tsa[hp], It: r.total });
    });
    arr(e.vidros).forEach(function (v) {
      var s = serieVidro(v, d), so = s.sol[hp], r = radiacaoPlano(x.sol, x.ceu, d.albedo, v.inclinacao, v.azimute, so.fSol);
      comps.push({ tipo: "vidro_solar", alvo: v.id, W: so.W, serie: s.sol.map(function (q) { return q.W; }), It: so.I,
                   passos: [cab, "It = " + fmt(r.direta, 0) + " (direta, cos θ " + fmt(r.cosTheta, 2) + (so.fSol < 1 ? ", " + fmt(so.fSol * 100, 0) + " % ao sol sob o beiral" : "") + ") + " + fmt(r.difusa, 0) + " + " + fmt(r.refletida, 0) + " = " + fmt(so.I, 0) + " W/m²",
                            "Q = A·FS·It = " + fmt(v.A, 2) + " × " + fmt(v.FS, 2) + " × " + fmt(so.I, 0) + " = " + fmt(so.W) + " W (ganho instantâneo = carga; FS de incidência normal — os dois a maior)"] });
      if (s.cond[hp] != null) comps.push({ tipo: "vidro_conducao", alvo: v.id, W: Math.max(0, s.cond[hp]), serie: s.cond,
                   passos: ["Q = U·A·(To − Ti) = " + fmt(v.U, 2) + " × " + fmt(v.A, 2) + " × (" + fmt(x.To) + " − " + fmt(e.ti) + ") = " + fmt(s.cond[hp]) + " W às " + hp + " h de " + d.dia + "/" + d.mes + (s.cond[hp] < 0 ? " → 0" : "")] });
    });
    return { ok: true, pico: { mes: melhor.mes, hora: hp, W: melhor.W }, serie: melhor.serie, meses: porMes, componentes: comps, dia: { mes: d.mes, dia: d.dia, picoTBS: d.picoTBS, To: d.horas.map(function (y) { return y.To; }) }, faltam: faltas };
  }

  var ClimSolar = {
    VERSAO: 1, DIA_PROJETO: DIA_PROJETO,
    diaDoAno: diaDoAno, posicao: posicao, E0: E0, massaAr: massaAr, ceuClaro: ceuClaro, cosIncidencia: cosIncidencia, radiacaoPlano: radiacaoPlano,
    fatorCeu: fatorCeu, deltaR: deltaR, solAr: solAr, fracaoSolBeiral: fracaoSolBeiral, diaProjeto: diaProjeto, envoltoria: envoltoria
  };
  global.ClimSolar = ClimSolar;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimSolar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

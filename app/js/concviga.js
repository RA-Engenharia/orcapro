/* =====================================================================
 * concviga.js — DIMENSIONAMENTO DE VIGAS de concreto armado (fase C2, 14/11/2026). Motor PURO (ES5, Node-testável, sem DOM).
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). Todo número de norma vem de js/concdadoscalc.js (com item e página);
 * o que não foi conferido na biblioteca ('sem-fonte') aparece em ConcDadosCalc.semFonte() e vira pendência no memorial.
 *
 * UNIDADES internas das funções de seção: cm, kN, kN·cm, kN/cm² (como as apostilas de referência). A entrada de dimensionarTramo e
 * dimensionarDeAnalise é em m, kN e kN·m (as mesmas do ConcAnalise); a conversão é feita na borda.
 *
 * O QUE CALCULA (NBR 6118, edição lida: 2014 — conferir no exemplar 2026, pendência P1)
 *  1. flexão simples ELU, domínios 2/3, x/d ≤ 0,45 (14.6.4.3); armadura dupla quando passa do limite       → flexao()
 *  2. As,mín (17.3.5.2.1), As,máx 4 % (17.3.5.2.4), armadura de pele (17.3.5.2.3)                           → asMin(), asMax(), pele()
 *  3. seção T (mesa colaborante bf, 14.6.2.2)                                                               → larguraColaborante(), flexao()
 *  4. cisalhamento, modelo I (17.4.2.2), ρsw,mín (17.4.1.1.1), espaçamentos máximos (18.3.3.2)             → cisalhamento(), escolherEstribo()
 *  5. decalagem al (17.4.2.2), armadura no apoio (18.3.2.4), ancoragem lb e lb,nec (9.3.2.1, 9.4.2.4/5)     → decalagem(), apoio(), ancoragem*()
 *  6. ELS: flecha (Branson 17.3.2.1.1, fluência 17.3.2.1.2, limites da Tabela 13.3) e abertura wk (17.3.3.2, Tabela 13.4) → flecha(), fissuracao()
 *  7. escolha de barras (bitolas, nº por camada, espaçamento livre 18.3.2.2, cobrimento da CAA, Tabela 7.2) → escolherBarras()
 *  8. saída por viga e por tramo com CADA passo registrado { id, nome, valor, unidade, formula, item } para o memorial da C6
 *  9. aproveitamento (0 a 1+) por verificação e por tramo
 *
 * LIMITES DECLARADOS (viram aviso/pendência, nunca silêncio): só concretos do Grupo I (fck ≤ 50 MPa); só aço CA-50 nas barras
 * longitudinais (η1 da CA-60 depende da Tabela 8.3, ilegível no texto da biblioteca); estribos a 90° em 2 ramos; sem torção;
 * sem redistribuição de momentos; redução de cortante junto ao apoio (17.4.1.2.1) NÃO aplicada (a favor da segurança).
 *
 * API principal
 *   ConcViga.dimensionarTramo(e, opc)          → um tramo (e em m/kN/kN·m)
 *   ConcViga.dimensionarViga(v, opc)           → { id, tramos:[...], aproveitamento, ... }
 *   ConcViga.dimensionarDeAnalise(an, opc)     → todas as vigas do resultado de ConcAnalise.rodar (envoltórias ELU + ELS)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function cv(k, d) { var X = D(); return X ? X.v(k, d) : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(x) { return x * x; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function areaBarra(phiMm) { return Math.PI * sq(phiMm / 10) / 4; }          /* cm² */
  function fmt(v, n) { return (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toString().replace(".", ","); }

  /* ---------------------------------------------------------------- registro de passos (memorial) */
  function passo(R, id, nome, valor, unidade, formula, item) { R.push({ id: id, nome: nome, valor: valor, unidade: unidade, formula: formula, item: item }); return valor; }

  /* ---------------------------------------------------------------- materiais (kN/cm²) */
  function material(fck, fykMPa, opc) {
    opc = opc || {};
    fck = Number(fck);
    var fckMax = cv("fckMaximoC2MPa", 50);
    if (!(fck >= 20 && fck <= fckMax)) return { ok: false, motivo: "fck " + fck + " fora do campo da C2 (C20 a C" + fckMax + "; Grupo II não implementado)" };
    var CM = dep("ConcModelo", "./concmodelo.js"), mm = CM ? CM.material(fck, opc.agregado) : null;
    if (!mm || !mm.ok) return { ok: false, motivo: "módulo elástico indisponível: " + (mm ? mm.motivo : "ConcModelo ausente") };
    var gc = num(opc.gammaC, cv("gammaC", 1.4)), gs = num(opc.gammaS, cv("gammaS", 1.15));
    var fyk = num(fykMPa, cv("fykCA50MPa", 500));
    var fctm = cv("fctmCoefMPa", 0.3) * Math.pow(fck, cv("fctmExpoente", 2 / 3)) / 10;
    var fyd = fyk / gs / 10, Es = cv("esAcoMPa", 210000) / 10;
    return { ok: true, fck: fck, etaC: fck > cv("etaCFckLimiarMPa", 40) ? Math.pow(cv("etaCFckLimiarMPa", 40) / fck, cv("etaCExpoente", 1 / 3)) : 1, fyk: fyk, gammaC: gc, gammaS: gs, fcd: fck / gc / 10, fctm: fctm,
             fctkInf: cv("fctkInfFator", 0.7) * fctm, fctkSup: cv("fctkSupFator", 1.3) * fctm, fctd: cv("fctkInfFator", 0.7) * fctm / gc,
             Eci: mm.EciMPa / 10, Ecs: mm.EcsMPa / 10, Es: Es, alphaE: Es / (mm.EcsMPa / 10), fyd: fyd, epsYd: fyd / Es, agregado: mm.agregado };
  }

  /* ---------------------------------------------------------------- geometria da seção (cm) */
  /* bw, h; mesa: bf, hf (seção T com a mesa no TOPO). Devolve área, CG a partir do topo, Ic e Wo (módulo da fibra inferior). */
  function propsBruta(bw, h, bf, hf) {
    var T = bf > bw + 1e-9 && hf > 0;
    if (!T) return { A: bw * h, ycgTopo: h / 2, Ic: bw * h * h * h / 12, yt: h / 2, W0: bw * h * h / 6, T: false };
    var A1 = bf * hf, A2 = bw * (h - hf), y1 = hf / 2, y2 = hf + (h - hf) / 2, A = A1 + A2, yc = (A1 * y1 + A2 * y2) / A;
    var Ic = bf * hf * hf * hf / 12 + A1 * sq(yc - y1) + bw * Math.pow(h - hf, 3) / 12 + A2 * sq(y2 - yc);
    return { A: A, ycgTopo: yc, Ic: Ic, yt: h - yc, W0: Ic / (h - yc), T: true };
  }

  /* ---------------------------------------------------------------- 3. largura colaborante (14.6.2.2) — cm */
  /* tipo: "biapoiado" a=1,00ℓ · "um-extremo" a=0,75ℓ · "dois-extremos" a=0,60ℓ · "balanco" a=2,00ℓ.
   * lados: [{ b2: distância entre as faces das almas vizinhas }  ou  { b4: largura do trecho de laje em balanço até a borda } ou null], um por lado da viga. */
  function larguraColaborante(bw, vao, tipo, lados) {
    var R = [], A = { "biapoiado": 1.0, "um-extremo": 0.75, "dois-extremos": 0.6, "balanco": 2.0 };
    if (A[tipo] == null) return { ok: false, motivo: "tipo de tramo desconhecido: " + tipo };
    var a = passo(R, "bf.a", "Distância entre pontos de momento nulo", A[tipo] * vao, "cm", "a = " + A[tipo] + "·ℓ (" + tipo + ")", "NBR 6118 14.6.2.2");
    var soma = 0;
    arr(lados).forEach(function (L, i) {
      if (!L) return;
      var lim = 0.1 * a, b1 = lim, quem = "0,1·a";
      if (L.b2 != null && 0.5 * L.b2 < b1) { b1 = 0.5 * L.b2; quem = "0,5·b2"; }
      if (L.b4 != null && L.b4 < b1) { b1 = L.b4; quem = "b4"; }
      soma += passo(R, "bf.b" + (i === 0 ? "1" : "3"), "Mesa de um lado (menor entre 0,1·a, 0,5·b2 ou b4 — governou " + quem + ")", b1, "cm", "b = min(0,1·a; 0,5·b2; b4)", "NBR 6118 14.6.2.2 e Figura 14.2");
    });
    var bf = passo(R, "bf", "Largura colaborante bf", bw + soma, "cm", "bf = bw + Σ b", "NBR 6118 14.6.2.2");
    return { ok: true, bf: bf, a: a, passos: R };
  }

  /* ---------------------------------------------------------------- 1. flexão simples ELU (cm, kN) */
  /* sec = { bw, h, d, dl (d'), bf, hf } — bf/hf só quando a MESA está comprimida (momento positivo). Md ≥ 0 (valor absoluto). */
  function flexao(sec, Md, mat, opc) {
    opc = opc || {};
    var R = [], lam = cv("lambdaRetangulo", 0.8), ac = cv("alphaC", 0.85) * (mat.etaC || 1), ecu = cv("epsCuMil", 3.5) / 1000, esMax = cv("epsSMaxMil", 10) / 1000;
    var xdLim = cv("xdLimiteGrupoI", 0.45), bw = sec.bw, d = sec.d, dl = num(sec.dl, 4), bf = num(sec.bf, 0), hf = num(sec.hf, 0);
    var T = bf > bw + 1e-9 && hf > 0, fcd = mat.fcd, fyd = mat.fyd;
    if (!(Md >= 0) || !(d > 0) || !(bw > 0)) return { ok: false, motivo: "entrada inválida (Md ≥ 0, d > 0, bw > 0)", passos: R };
    var ITEM = "NBR 6118 17.2.2";
    passo(R, "fl.Md", "Momento de cálculo", Md, "kN·cm", "Md (valor absoluto)", "NBR 6118 11.8");
    passo(R, "fl.fcd", "Resistência de cálculo do concreto", fcd, "kN/cm²", "fcd = fck/γc = " + mat.fck + "/" + mat.gammaC, "NBR 6118 12.3.3");
    passo(R, "fl.fyd", "Resistência de cálculo do aço", fyd, "kN/cm²", "fyd = fyk/γs = " + mat.fyk + "/" + mat.gammaS, "NBR 6118 12.3.3");
    var x2lim = ecu / (ecu + esMax) * d, x3lim = ecu / (ecu + mat.epsYd) * d, xlim = xdLim * d;
    passo(R, "fl.x2lim", "Limite entre os domínios 2 e 3", x2lim, "cm", "x2lim = εcu/(εcu + 10‰)·d", "NBR 6118 17.2.2-g, Figura 17.1");
    passo(R, "fl.x3lim", "Limite entre os domínios 3 e 4", x3lim, "cm", "x3lim = εcu/(εcu + εyd)·d, εyd = " + fmt(mat.epsYd * 1000, 3) + "‰", "NBR 6118 17.2.2-g, Figura 17.1");
    passo(R, "fl.xlim", "Limite de ductilidade x/d ≤ " + xdLim, xlim, "cm", "xlim = 0,45·d", "NBR 6118 14.6.4.3-a");
    function ret(b, M) {                    /* retângulo b × y com y = λx: M = αc·fcd·b·y·(d − y/2) */
      var rad = 1 - 2 * M / (ac * fcd * b * d * d); if (rad < 0) return null;
      return d * (1 - Math.sqrt(rad)) / lam;
    }
    var modo = T ? "T" : "retangular", x = ret(T ? bf : bw, Md), M1 = 0, M2 = 0;
    if (T && x != null && lam * x > hf) {   /* linha de 0,8x passa na alma: seção T verdadeira */
      M1 = (bf - bw) * hf * ac * fcd * (d - hf / 2);
      passo(R, "fl.M1d", "Parcela das abas da mesa", M1, "kN·cm", "M1d = (bf − bw)·hf·αc·fcd·(d − hf/2)", "NBR 6118 17.2.2-e");
      M2 = Md - M1;
      x = ret(bw, M2);
      passo(R, "fl.M2d", "Parcela da alma", M2, "kN·cm", "M2d = Md − M1d", "NBR 6118 17.2.2-e");
    } else if (T) { modo = "retangular (bf)"; }
    var bEf = (modo === "T") ? bw : (T ? bf : bw), MdEf = (modo === "T") ? M2 : Md;
    if (x != null) passo(R, "fl.x", "Linha neutra", x, "cm", "MdEf = αc·fcd·b·(λx)·(d − λx/2) com b = " + fmt(bEf, 2) + " cm", ITEM);
    var As, AsL = 0, sigL = 0, dupla = false, Fc, xf;
    if (x != null && x <= xlim + 1e-9) {
      xf = x;
      Fc = ac * fcd * (modo === "T" ? ((bf - bw) * hf + bw * lam * x) : (bEf * lam * x));
      As = Fc / fyd;
      passo(R, "fl.Fc", "Resultante de compressão no concreto", Fc, "kN", "Fc = αc·fcd·A comprimida", ITEM);
      passo(R, "fl.As", "Armadura de tração (armadura simples)", As, "cm²", "As = Fc/fyd (domínio " + (x <= x2lim ? 2 : (x <= x3lim ? 3 : 4)) + ", σs = fyd)", ITEM);
    } else {                                 /* armadura dupla: x = xlim */
      dupla = true; xf = xlim;
      var yl = lam * xlim, Mconc;
      if (T && yl > hf) Mconc = (bf - bw) * hf * ac * fcd * (d - hf / 2) + bw * ac * fcd * yl * (d - yl / 2);
      else Mconc = (T ? bf : bw) * ac * fcd * yl * (d - yl / 2);
      Fc = ac * fcd * (T && yl > hf ? ((bf - bw) * hf + bw * yl) : ((T ? bf : bw) * yl));
      var Md2 = Md - Mconc, epsL = ecu * (xlim - dl) / xlim;
      passo(R, "fl.dupla", "x/d excede 0,45 (ou a seção não resiste sem armadura de compressão): armadura dupla com x = 0,45·d", xlim / d, "-", "x = xlim = 0,45·d", "NBR 6118 14.6.4.3 e 17.2.3");
      passo(R, "fl.M1d", "Momento resistido pelo concreto em x = xlim", Mconc, "kN·cm", "M1d = Fc·(braço)", ITEM);
      passo(R, "fl.M2d", "Momento a resistir pelo par As'/As", Md2, "kN·cm", "M2d = Md − M1d", ITEM);
      if (Md2 < 0) return { ok: false, motivo: "inconsistência interna (M2d < 0)", passos: R };
      if (epsL <= 0) return { ok: false, motivo: "armadura de compressão fora da zona comprimida (d' ≥ x): aumente a altura da seção", passos: R };
      sigL = Math.min(mat.Es * epsL, fyd);
      passo(R, "fl.epsL", "Deformação da armadura comprimida", epsL * 1000, "‰", "ε's = εcu·(x − d')/x", ITEM);
      passo(R, "fl.sigL", "Tensão na armadura comprimida", sigL, "kN/cm²", "σ'sd = min(Es·ε's; fyd)", "NBR 6118 8.3.6");
      AsL = Md2 / (sigL * (d - dl));
      passo(R, "fl.AsL", "Armadura de compressão", AsL, "cm²", "A's = M2d/(σ'sd·(d − d'))", ITEM);
      As = (Fc + AsL * sigL) / fyd;
      passo(R, "fl.As", "Armadura de tração (armadura dupla)", As, "cm²", "As = (Fc + A's·σ'sd)/fyd", ITEM);
    }
    var dom = xf <= x2lim + 1e-9 ? 2 : (xf <= x3lim + 1e-9 ? 3 : 4);
    var res = { ok: true, modo: dupla ? (modo === "T" ? "T-dupla" : "dupla") : modo, dupla: dupla, x: xf, xd: xf / d, dominio: dom, As: As, AsLinha: AsL, sigmaLinha: sigL, x2lim: x2lim, x3lim: x3lim, xlim: xlim, Fc: Fc, passos: R, avisos: [] };
    if (dom === 4) res.avisos.push("Domínio 4 (seção superarmada, ruptura frágil): aumente a seção.");
    return res;
  }

  /* momento resistente de uma seção dada (verificação independente do dimensionamento) — cm, kN. Equilíbrio de forças por bisseção em x. */
  function resistente(sec, As, AsL, mat) {
    var lam = cv("lambdaRetangulo", 0.8), ac = cv("alphaC", 0.85) * (mat.etaC || 1), ecu = cv("epsCuMil", 3.5) / 1000, esMax = cv("epsSMaxMil", 10) / 1000;
    var bw = sec.bw, d = sec.d, dl = num(sec.dl, 4), bf = num(sec.bf, 0), hf = num(sec.hf, 0), h = sec.h, T = bf > bw + 1e-9 && hf > 0;
    function est(x) {
      var x2 = ecu / (ecu + esMax) * d, ec, es;
      if (x <= x2) { es = esMax; ec = es * x / (d - x); } else { ec = ecu; es = ecu * (d - x) / x; }
      return { ec: ec, es: es, el: ec * (x - dl) / x };
    }
    function forcas(x) {
      var e = est(x), y = Math.min(lam * x, h), Fc = ac * mat.fcd * (T ? (bf - bw) * Math.min(y, hf) + bw * y : bw * y);
      var ss = Math.min(mat.Es * e.es, mat.fyd), sl = Math.max(-mat.fyd, Math.min(mat.Es * e.el, mat.fyd));
      return { Fc: Fc, Fs: As * ss, Fl: AsL * sl, y: y };
    }
    var a = 1e-6, b = h;
    for (var i = 0; i < 200; i++) { var m = (a + b) / 2, f = forcas(m); if (f.Fs - f.Fl - f.Fc > 0) a = m; else b = m; }
    var x = (a + b) / 2, F = forcas(x), y = F.y, yc;
    if (T) { var Af = (bf - bw) * Math.min(y, hf), Aw = bw * y; yc = (Af * Math.min(y, hf) / 2 + Aw * y / 2) / (Af + Aw); } else yc = y / 2;
    return { x: x, Mrd: F.Fc * (d - yc) + F.Fl * (d - dl), Fc: F.Fc, Fs: F.Fs };
  }

  /* ---------------------------------------------------------------- 2. armaduras mínima, máxima e de pele */
  /* tensaoNaBase: true = momento positivo (fibra tracionada = base). Seção T só conta quando a mesa está COMPRIMIDA. */
  function asMin(sec, mat, opc) {
    opc = opc || {};
    var R = [], T = num(sec.bf, 0) > sec.bw + 1e-9 && num(sec.hf, 0) > 0, mesaComprimida = T && opc.mesaComprimida !== false;
    var g = propsBruta(sec.bw, sec.h, mesaComprimida ? sec.bf : 0, mesaComprimida ? sec.hf : 0);
    var Mmin = cv("mdMinCoefW0", 0.8) * g.W0 * mat.fctkSup;
    passo(R, "min.W0", "Módulo de resistência da seção bruta (fibra mais tracionada)", g.W0, "cm³", "W0 = Ic/yt", "NBR 6118 17.3.5.2.1");
    passo(R, "min.fctksup", "Resistência característica superior à tração", mat.fctkSup, "kN/cm²", "fctk,sup = 1,3·fct,m, fct,m = 0,3·fck^(2/3)", "NBR 6118 8.2.5");
    passo(R, "min.Mdmin", "Momento mínimo", Mmin, "kN·cm", "Md,mín = 0,8·W0·fctk,sup", "NBR 6118 17.3.5.2.1");
    var dd = num(sec.d, 0.9 * sec.h), fl = flexao({ bw: sec.bw, h: sec.h, d: dd, dl: sec.dl, bf: mesaComprimida ? sec.bf : 0, hf: mesaComprimida ? sec.hf : 0 }, Mmin, mat);
    var AsM = fl.ok ? fl.As : 0;
    var rho = cv("taxaMinAbsolutaFlexao", 0.0015), Ac = g.A;
    passo(R, "min.AsMd", "Armadura que equilibra Md,mín", AsM, "cm²", "dimensionamento da seção a Md,mín", "NBR 6118 17.3.5.2.1");
    passo(R, "min.AsRho", "Armadura pela taxa mínima absoluta", rho * Ac, "cm²", "ρmín·Ac = 0,15 % · " + fmt(Ac, 1) + " cm²", "NBR 6118 17.3.5.2.1");
    var v = Math.max(AsM, rho * Ac);
    passo(R, "min.As", "Armadura mínima de tração", v, "cm²", "As,mín = maior dos dois", "NBR 6118 17.3.5.2.1");
    return { As: v, AsMd: AsM, AsRho: rho * Ac, Ac: Ac, Mmin: Mmin, passos: R, rho: v / (sec.bw * sec.h) };
  }
  function asMax(sec, opc) {
    var T = num(sec.bf, 0) > sec.bw + 1e-9 && num(sec.hf, 0) > 0 && !(opc && opc.mesaComprimida === false);
    var Ac = T ? sec.bw * sec.h + (sec.bf - sec.bw) * sec.hf : sec.bw * sec.h;
    return { valor: cv("taxaMaxAsMaisAsLinha", 0.04) * Ac, Ac: Ac };
  }
  /* armadura de pele (17.3.5.2.3 e 18.3.5): h > 60 cm. Devolve a área por face e uma sugestão de barras. */
  function pele(bw, h, d, zona, opc) {
    var R = [];
    if (!(h > cv("peleAlturaMinCm", 60))) return { necessaria: false, passos: R, motivo: "h ≤ 60 cm: pode ser dispensada (17.3.5.2.3)" };
    var Asp = cv("peleTaxaPorFace", 0.001) * bw * h, lim = cv("peleAsMaxCm2PorM", 5) * h / 100;
    passo(R, "pele.As", "Armadura de pele por face", Math.min(Asp, lim), "cm²", "Asp = 0,10 % · bw · h (≤ 5 cm²/m por face)", "NBR 6118 17.3.5.2.3");
    var s = Math.min(cv("peleEspMaxCm", 20), cv("peleEspMaxFracaoD", 1 / 3) * d);
    passo(R, "pele.s", "Afastamento máximo", s, "cm", "s ≤ min(20 cm; d/3)", "NBR 6118 18.3.5");
    var z = num(zona, h - 2 * 6), n = Math.max(1, Math.ceil(z / s) - 1), choice = null;
    cv("bitolasMm", []).filter(function (p) { return p <= 12.5; }).forEach(function (p) { if (!choice && n * areaBarra(p) >= Math.min(Asp, lim) - 1e-9) choice = p; });
    return { necessaria: true, AsFace: Math.min(Asp, lim), s: s, nPorFace: n, phi: choice, passos: R };
  }

  /* ---------------------------------------------------------------- 4. cisalhamento — modelo I (cm, kN) */
  function cisalhamento(sec, Vsd, mat, opc) {
    opc = opc || {};
    var R = [], bw = sec.bw, d = sec.d, alfa = num(opc.alfaGraus, 90) * Math.PI / 180;
    var fywk = num(opc.fywkMPa, mat.fyk) / 10, fywd = Math.min(fywk / mat.gammaS, cv("fywdMaxMPa", 435) / 10);
    var av2 = 1 - mat.fck / cv("alphaV2Divisor", 250);
    var VRd2 = cv("vrd2Coef", 0.27) * av2 * mat.fcd * bw * d;
    passo(R, "cs.av2", "Fator αv2", av2, "-", "αv2 = 1 − fck/250", "NBR 6118 17.4.2.2-a");
    passo(R, "cs.VRd2", "Resistência das bielas comprimidas", VRd2, "kN", "VRd2 = 0,27·αv2·fcd·bw·d", "NBR 6118 17.4.2.2-a");
    var res = { ok: true, VRd2: VRd2, Vsd: Vsd, passos: R, avisos: [] };
    if (Vsd > VRd2) { res.ok = false; res.motivo = "VSd > VRd2: esmagamento da biela — aumente bw, h ou fck (não se resolve com estribo)"; res.razaoBiela = Vsd / VRd2; return res; }
    var Vc0 = cv("vc0Coef", 0.6) * mat.fctd * bw * d, Vc = opc.tracao ? 0 : Vc0;
    passo(R, "cs.fctd", "Resistência de cálculo à tração", mat.fctd, "kN/cm²", "fctd = fctk,inf/γc", "NBR 6118 8.2.5 e 17.4.2.2-b");
    passo(R, "cs.Vc", "Parcela resistida pelo concreto (flexão simples)", Vc, "kN", "Vc = Vc0 = 0,6·fctd·bw·d", "NBR 6118 17.4.2.2-b");
    var Vsw = Math.max(Vsd - Vc, 0);
    passo(R, "cs.Vsw", "Parcela a resistir pelos estribos", Vsw, "kN", "Vsw = VSd − Vc", "NBR 6118 17.4.2.1");
    var f = cv("bracoZCoef", 0.9) * d * fywd * (Math.sin(alfa) + Math.cos(alfa));
    var AswS = Vsw / f;                                           /* cm²/cm */
    passo(R, "cs.AswS", "Armadura transversal calculada", AswS * 100, "cm²/m", "Asw/s = Vsw/(0,9·d·fywd·(sen α + cos α)), fywd = " + fmt(fywd * 10, 1) + " MPa", "NBR 6118 17.4.2.2-b");
    var rho = cv("rhoSwMinCoef", 0.2) * mat.fctm / fywk, AswMin = rho * bw * Math.sin(alfa);
    passo(R, "cs.rhoMin", "Taxa mínima ρsw,mín", rho, "-", "ρsw,mín = 0,2·fct,m/fywk", "NBR 6118 17.4.1.1.1");
    passo(R, "cs.AswMin", "Armadura transversal mínima", AswMin * 100, "cm²/m", "Asw,mín/s = ρsw,mín·bw·sen α", "NBR 6118 17.4.1.1.1");
    var Asw = Math.max(AswS, AswMin);
    var alta = Vsd > cv("estriboLimiarVd", 0.67) * VRd2;
    var smax = alta ? Math.min(cv("estriboSmaxFracaoD2", 0.3) * d, cv("estriboSmaxTeto2Mm", 200) / 10) : Math.min(cv("estriboSmaxFracaoD1", 0.6) * d, cv("estriboSmaxTeto1Mm", 300) / 10);
    passo(R, "cs.smax", "Espaçamento longitudinal máximo", smax, "cm", alta ? "VSd > 0,67·VRd2: smáx = 0,3·d ≤ 20 cm" : "VSd ≤ 0,67·VRd2: smáx = 0,6·d ≤ 30 cm", "NBR 6118 18.3.3.2");
    var baixa = Vsd <= cv("estriboStLimiarVd", 0.2) * VRd2;
    var stmax = baixa ? Math.min(cv("estriboStMaxFracaoD1", 1) * d, cv("estriboStTeto1Mm", 800) / 10) : Math.min(cv("estriboStMaxFracaoD2", 0.6) * d, cv("estriboStTeto2Mm", 350) / 10);
    passo(R, "cs.stmax", "Espaçamento transversal máximo entre ramos", stmax, "cm", baixa ? "VSd ≤ 0,20·VRd2: st,máx = d ≤ 80 cm" : "VSd > 0,20·VRd2: st,máx = 0,6·d ≤ 35 cm", "NBR 6118 18.3.3.2");
    res.Vc = Vc; res.Vc0 = Vc0; res.Vsw = Vsw; res.AswSCalc = AswS * 100; res.AswSMin = AswMin * 100; res.AswS = Asw * 100; res.smax = smax; res.stmax = stmax; res.fywd = fywd; res.alfa = alfa;
    res.governa = AswS >= AswMin ? "cálculo" : "mínima";
    return res;
  }

  /* escolhe φ e s (estribo de 2 ramos): s múltiplo de 0,5 cm, s ≤ smáx, s ≥ espaçamento mínimo do produto, φ ≤ bw/10 e ≥ 5 mm */
  function escolherEstribo(AswSm, bw, smax, opc) {
    opc = opc || {};
    var n = cv("estriboPernas", 2), smin = cv("estriboEspMinCm", 7), aco = opc.aco || "CA50", pmin = num(opc.phiMin, 0);
    var lista = cv("estriboBitolasMm", [5, 6.3, 8, 10]).filter(function (p) { return (aco === "CA60" || p >= 6.3) && p >= cv("estriboPhiMinMm", 5) && p <= cv("estriboPhiMaxFracaoBw", 0.1) * bw * 10 + 1e-9 && p >= pmin; });
    var i, melhor = null;
    for (i = 0; i < lista.length; i++) {
      var p = lista[i], sReq = n * areaBarra(p) * 100 / AswSm, s = Math.floor(Math.min(sReq, smax) / 0.5) * 0.5;
      if (s >= smin) { melhor = { phi: p, s: s, pernas: n, AswSEf: n * areaBarra(p) * 100 / s, aco: aco }; break; }
    }
    if (!melhor) return { ok: false, motivo: "nenhuma bitola de estribo atende (φ ≤ bw/10 = " + fmt(bw, 1) + " cm/10 e s ≥ " + smin + " cm): aumente a seção" };
    melhor.ok = true; return melhor;
  }

  /* ---------------------------------------------------------------- 5. decalagem e apoios */
  function decalagem(Vsd, Vc, d, alfaGraus) {
    var R = [], al = num(alfaGraus, 90) * Math.PI / 180, cot = Math.cos(al) / Math.sin(al), V = Math.abs(Vsd), minF = Math.abs(alfaGraus - 45) < 1e-9 ? cv("decalagemMinFracaoD45", 0.2) : cv("decalagemMinFracaoD", 0.5);
    var a, regra;
    if (V <= Math.abs(Vc)) { a = d; regra = "|VSd,máx| ≤ |Vc|: a = d"; }
    else { a = d * (V / (2 * (V - Vc)) * (1 + cot) - cot); regra = "a = d·[VSd,máx/(2·(VSd,máx − Vc))·(1 + cotg α) − cotg α]"; }
    var bruto = a;
    a = Math.min(a, d); a = Math.max(a, minF * d);
    passo(R, "dec.a", "Decalagem do diagrama de momentos", a, "cm", regra + (bruto !== a ? " → limitada a [" + minF + "·d ; d]" : ""), "NBR 6118 17.4.2.2");
    return { a: a, aBruto: bruto, passos: R };
  }

  /* armadura a ancorar no apoio (18.3.2.4) — As,apoio = maior de (a/d)·Vd/fyd e fração de As,vão (1/3 ou 1/4 conforme |Mapoio| ≤/> 0,5·Mvão). Cm, kN. */
  function apoio(Vsd, a, d, AsVao, Mapoio, Mvao, mat, opc) {
    opc = opc || {};
    var R = [], b = (a / d) * Vsd / mat.fyd, alto = Mapoio < 0 && Math.abs(Mapoio) > cv("apoioLimiarMomento", 0.5) * Math.abs(Mvao);
    /* ⚠ APOIO INTERMEDIÁRIO (16/11/2026): a armadura da diagonal comprimida (18.3.2.4-b, Fsd) é regra de apoio EXTREMO. No intermediário valem (a) a armadura do dimensionamento do momento positivo que
     * houver no apoio (opc.AsPositivoApoio) e (c) o prolongamento de 1/3 ou 1/4 de As,vão. Antes o (b) era cobrado nos dois e reprovava a viga contínua sem motivo (V109 do sobrado). */
    var interm = opc.intermediario === true, bEf = interm ? num(opc.AsPositivoApoio, 0) : b;
    var fr = alto ? cv("apoioAsFracaoMomentoAlto", 0.25) : cv("apoioAsFracaoMomentoBaixo", 1 / 3), c = fr * AsVao;
    passo(R, "ap.b", interm ? "Armadura do momento positivo no apoio intermediário (18.3.2.4-a; o 18.3.2.4-b é só de apoio extremo)" : "Armadura para a diagonal comprimida (18.3.2.4-b)", bEf, "cm²", interm ? "As do dimensionamento do momento positivo no apoio (0 se não há)" : "As,anc = (a/d)·Vd/fyd", interm ? "NBR 6118:2023/Em1:2026 18.3.2.4-a (b) é só de apoio extremo — Em1 p. 11-12" : "NBR 6118:2023/Em1:2026 18.3.2.4-b");
    passo(R, "ap.c", "Prolongamento de parte da armadura do vão (18.3.2.4-c)", c, "cm²", (alto ? "|Mapoio| > 0,5·Mvão: 1/4" : "|Mapoio| ≤ 0,5·Mvão: 1/3") + " · As,vão", "NBR 6118 18.3.2.4-c");
    var v = Math.max(bEf, c); passo(R, "ap.As", "Armadura no apoio", v, "cm²", "As,apoio = maior dos dois", "NBR 6118 18.3.2.4");
    return { As: v, AsB: bEf, AsC: c, fracao: fr, intermediario: interm, passos: R };
  }

  /* posição da barra quanto à aderência (9.3.1). yInf = distância do eixo da barra à face INFERIOR do elemento (cm); inclinada > 45° = boa. */
  function aderencia(h, yInf, inclinadaMais45) {
    if (inclinadaMais45) return "boa";
    var alt = cv("boaAderenciaAlturaCm", 30);
    if (h < cv("boaAderenciaHLimiteCm", 60)) return yInf <= alt ? "boa" : "ma";
    return (h - yInf) >= alt ? "boa" : "ma";
  }
  /* fbd e lb (9.3.2.1, 9.4.2.4). phi em mm; saída em cm. Só barra nervurada (CA-50). */
  function ancoragemBasica(phiMm, mat, opc) {
    opc = opc || {};
    var R = [], eta1 = cv("eta1Nervurada", 2.25), eta2 = opc.aderencia === "ma" ? cv("eta2Ma", 0.7) : cv("eta2Boa", 1.0);
    var eta3 = phiMm < cv("eta3LimiarMm", 32) ? 1.0 : (cv("eta3Numerador", 132) - phiMm) / 100;
    var fbd = eta1 * eta2 * eta3 * mat.fctd, lb = (phiMm / 10) / 4 * mat.fyd / fbd, avisos = [];
    passo(R, "lb.eta", "η1 · η2 · η3", eta1 * eta2 * eta3, "-", "η1 = " + eta1 + " (nervurada); η2 = " + eta2 + " (" + (opc.aderencia === "ma" ? "má" : "boa") + " aderência); η3 = " + fmt(eta3, 3), "NBR 6118 9.3.2.1");
    passo(R, "lb.fbd", "Resistência de aderência de cálculo", fbd, "kN/cm²", "fbd = η1·η2·η3·fctd", "NBR 6118 9.3.2.1");
    passo(R, "lb.lb", "Comprimento de ancoragem básico", lb, "cm", "lb = (φ/4)·(fyd/fbd)", "NBR 6118 9.4.2.4");
    var lbPiso = cv("lb25Phi", 25) * phiMm / 10;
    if (lb < lbPiso) { avisos.push("lb < 25φ: aplicado o piso ℓb ≥ 25φ da 6118:2023 (9.4.2.4): ℓb = " + fmt(lbPiso, 1) + " cm."); passo(R, "lb.piso", "Piso do comprimento de ancoragem básico", lbPiso, "cm", "ℓb ≥ 25φ", "NBR 6118:2023 9.4.2.4"); lb = lbPiso; }
    return { fbd: fbd, lb: lb, lbPhi: lb / (phiMm / 10), passos: R, avisos: avisos };
  }
  /* lb,nec = α·lb·As,calc/As,ef ≥ lb,mín = max(0,3·lb; 10φ; 10 cm) (9.4.2.5) */
  function ancoragemNecessaria(phiMm, mat, AsCalc, AsEf, opc) {
    opc = opc || {};
    var b = ancoragemBasica(phiMm, mat, opc), R = b.passos.slice(), alfa = opc.gancho ? cv("lbAlphaGancho", 0.7) : 1.0;
    var lbn = alfa * b.lb * AsCalc / AsEf, lbmin = Math.max(cv("lbMinFracao", 0.3) * b.lb, cv("lbMinPhi", 10) * phiMm / 10, cv("lbMinMm", 100) / 10);
    passo(R, "lb.nec", "Comprimento de ancoragem necessário", Math.max(lbn, lbmin), "cm", "lb,nec = α·lb·As,calc/As,ef ≥ lb,mín (α = " + alfa + "; lb,mín = " + fmt(lbmin, 1) + " cm)", "NBR 6118 9.4.2.5");
    return { lb: b.lb, lbNec: Math.max(lbn, lbmin), lbNecCalc: lbn, lbMin: lbmin, alfa: alfa, passos: R, avisos: b.avisos };
  }
  /* trecho reto mínimo no apoio EXTREMO: maior de lb,nec, r + 5,5φ e 6 cm (18.3.2.4.1); r = D/2 da Tabela 9.1 (CA-50) */
  function lbApoioExtremo(lbNec, phiMm) {
    var D = phiMm < 20 ? cv("pinoDobramentoCA50MenorQue20", 5) : cv("pinoDobramentoCA50MaiorIgual20", 8), r = D * phiMm / 10 / 2;
    return { valor: Math.max(lbNec, r + cv("apoioRaioMaisPhi", 5.5) * phiMm / 10, cv("apoioLbMinMm", 60) / 10), r: r, D: D * phiMm / 10 };
  }

  /* ⚠ apoio mínimo do extremo (15/11/2026): o menor apoio (cm, do pilar ao longo da viga) em que a barra de menor bitola da casa (φ 10) ancora com gancho no PISO da 9.4.2.5 (ℓb,mín) —
   * cobrimento + ℓb,mín (com o raio do gancho). É o que o Sugerir estrutura usa para o pilar de canto, onde só UMA das duas vigas pode ficar com o lado maior do pilar. */
  function apoioMinimoExtremo(fck, caa, phiMm) {
    var mat = material(fck, undefined, {}); if (!mat.ok) return null;
    var phi = phiMm || 10, a = ancoragemNecessaria(phi, mat, 0, 1, { aderencia: "boa", gancho: true }), l = lbApoioExtremo(a.lbNec, phi);
    return { cm: cobrimento(caa, mat.fck, false) * 1 + l.valor, cobrimento: cobrimento(caa, mat.fck, false), trecho: l.valor, phi: phi };
  }

  /* ---------------------------------------------------------------- 7. escolha de barras */
  /* cobrimento nominal da viga (mm → cm), Tabela 7.2 com as reduções permitidas (7.4.7.4 e 7.4.7.6) */
  function cobrimento(caa, fck, controleRigoroso) {
    var t = cv("cobrimentoVigaCAAmm", [25, 30, 40, 50]), mn = cv("fckMinimoCAA", [20, 25, 30, 40]), i = Math.max(1, Math.min(4, Math.round(num(caa, 2)))) - 1, c = t[i];
    if (fck > mn[i]) c -= cv("cobrimentoReducaoFckSuperiorMm", 5);
    if (controleRigoroso) c -= cv("cobrimentoReducaoControleMm", 5);
    return c / 10;
  }
  /* espaçamentos livres mínimos (18.3.2.2), cm */
  function espacamentos(phiMm, dmaxMm) {
    var m = cv("espacamentoMinMm", 20);
    return { ah: Math.max(m, phiMm, cv("espacamentoHorizAgregado", 1.2) * dmaxMm) / 10, av: Math.max(m, phiMm, cv("espacamentoVertAgregado", 0.5) * dmaxMm) / 10 };
  }
  /* bw, cob, phiT em cm/mm; devolve a melhor combinação (menos camadas, depois menor excesso). posicao só rotula. */
  function escolherBarras(AsReq, bw, cob, phiTmm, dmaxMm, opc) {
    opc = opc || {};
    var phiMin = num(opc.phiMin, 10), phiMax = num(opc.phiMax, 25), nMin = num(opc.nMin, 2), cand = [], phiT = phiTmm / 10;
    cv("bitolasMm", []).forEach(function (phi) {
      if (phi < phiMin || phi > phiMax) return;
      var A1 = areaBarra(phi), e = espacamentos(phi, dmaxMm), util = bw - 2 * (cob + phiT), nmax = Math.floor((util + e.ah) / (phi / 10 + e.ah));
      if (nmax < nMin) return;
      var n = Math.max(nMin, Math.ceil(AsReq / A1 - 1e-9)), camadas = [], resto = n, k;
      while (resto > 0) { k = Math.min(nmax, resto); camadas.push(k); resto -= k; }
      var soma = 0, i, y;
      for (i = 0; i < camadas.length; i++) { y = cob + phiT + phi / 20 + i * (phi / 10 + e.av); soma += camadas[i] * y; }
      cand.push({ phi: phi, n: n, camadas: camadas, nCamadas: camadas.length, AsEf: n * A1, acg: soma / n, ah: e.ah, av: e.av, nPorCamadaMax: nmax, excesso: n * A1 - AsReq });
    });
    if (!cand.length) return { ok: false, motivo: "nenhuma combinação de barras cabe em bw = " + fmt(bw, 1) + " cm (cobrimento " + fmt(cob, 1) + " cm)" };
    cand.sort(function (a, b) { return a.nCamadas - b.nCamadas || a.excesso - b.excesso || a.n - b.n; });
    var m = cand[0]; m.ok = true; m.texto = m.n + " φ " + fmt(m.phi, 1) + " (" + fmt(r2(m.AsEf), 2) + " cm²" + (m.nCamadas > 1 ? ", " + m.nCamadas + " camadas" : "") + ")";
    return m;
  }

  /* ---------------------------------------------------------------- 6. ELS */
  /* estádio II (cm): x e III. bf/hf só se a mesa estiver COMPRIMIDA. A's entra como (αe − 1)·A's (seção transformada). */
  function estadioII(sec, As, AsL, aE) {
    var bw = sec.bw, d = sec.d, dl = num(sec.dl, 4), bf = num(sec.bf, 0), hf = num(sec.hf, 0), T = bf > bw + 1e-9 && hf > 0;
    function mom1(x) { var c = T ? (x <= hf ? bf * x * x / 2 : bf * (x * x - sq(x - hf)) / 2 + bw * sq(x - hf) / 2) : bw * x * x / 2; return c + (aE - 1) * AsL * (x - dl) - aE * As * (d - x); }
    var a = 1e-6, b = d, i;
    for (i = 0; i < 200; i++) { var m = (a + b) / 2; if (mom1(m) > 0) b = m; else a = m; }
    var x = (a + b) / 2, Ic = T ? (x <= hf ? bf * Math.pow(x, 3) / 3 : bf * (Math.pow(x, 3) - Math.pow(x - hf, 3)) / 3 + bw * Math.pow(x - hf, 3) / 3) : bw * Math.pow(x, 3) / 3;
    return { x: x, III: Ic + (aE - 1) * AsL * sq(x - dl) + aE * As * sq(d - x) };
  }
  function xiTempo(t) { return t <= cv("fluenciaXiTmaxMeses", 70) ? cv("fluenciaXiCoef", 0.68) * Math.pow(cv("fluenciaXiBase", 0.996), t) * Math.pow(t, cv("fluenciaXiExpoente", 0.32)) : cv("fluenciaXiMax", 2); }
  /* coeficiente de flecha imediata de carga uniforme: a = k·p·ℓ⁴/(EI) */
  var CASOS = { "biapoiada": 5 / 384, "apoiada-engastada": 1 / 185, "biengastada": 1 / 384, "balanco": 1 / 8 };
  /* sec = { bw, h, d, dl, bf, hf } (mesa só se comprimida), Ma = momento da combinação QUASE PERMANENTE na seção crítica (kN·cm).
   * opc: { aElastica (cm, da análise com EcsIc bruta) | caso:{tipo, p (kN/cm), L (cm)} , t, t0 (meses), limite:"visual"|"alvenaria"|"vibracao", L (cm), aVariavel (cm) } */
  function flecha(sec, As, AsL, Ma, mat, opc) {
    opc = opc || {};
    var R = [], T = num(sec.bf, 0) > sec.bw + 1e-9 && num(sec.hf, 0) > 0, g = propsBruta(sec.bw, sec.h, T ? sec.bf : 0, T ? sec.hf : 0);
    var alfaMr = T ? cv("mrAlphaT", 1.2) : cv("mrAlphaRetangular", 1.5), fct = mat.fctm;
    var Mr = alfaMr * fct * g.Ic / g.yt;
    passo(R, "fh.Ic", "Momento de inércia da seção bruta", g.Ic, "cm⁴", T ? "seção T" : "bw·h³/12", "NBR 6118 17.3.1");
    passo(R, "fh.Mr", "Momento de fissuração", Mr, "kN·cm", "Mr = α·fct·Ic/yt (α = " + alfaMr + ", fct = fct,m = " + fmt(mat.fctm * 10, 3) + " MPa)", "NBR 6118 17.3.1");
    passo(R, "fh.Ma", "Momento da combinação quase permanente", Ma, "kN·cm", "Ma", "NBR 6118 17.3.2.1.1 e 11.8.3");
    var aE = mat.alphaE, ii = estadioII(sec, As, AsL, aE);
    passo(R, "fh.aE", "Relação modular", aE, "-", "αe = Es/Ecs", "NBR 6118 17.3.2.1.1");
    passo(R, "fh.xII", "Linha neutra no estádio II", ii.x, "cm", "momento estático da seção transformada = 0", "NBR 6118 17.3.2.1.1");
    passo(R, "fh.III", "Momento de inércia no estádio II", ii.III, "cm⁴", "III da seção fissurada", "NBR 6118 17.3.2.1.1");
    var EcIc = mat.Ecs * g.Ic, fis = Ma > Mr, EIeq;
    if (fis) { var q3 = Math.pow(Mr / Ma, 3); EIeq = Math.min(mat.Ecs * (q3 * g.Ic + (1 - q3) * ii.III), EcIc); }
    else EIeq = EcIc;
    passo(R, "fh.EI", "Rigidez equivalente", EIeq, "kN·cm²", fis ? "(EI)eq = Ecs·[(Mr/Ma)³·Ic + (1 − (Mr/Ma)³)·III] ≤ Ecs·Ic" : "Ma ≤ Mr: seção no estádio I, (EI)eq = Ecs·Ic", "NBR 6118 17.3.2.1.1");
    var ai;
    if (opc.aElastica != null) { ai = opc.aElastica * EcIc / EIeq; passo(R, "fh.ai", "Flecha imediata", ai, "cm", "ai = a(elástica bruta, da análise)·EcsIc/(EI)eq", "NBR 6118 17.3.2.1"); }
    else if (opc.caso) { var k = CASOS[opc.caso.tipo]; if (k == null) return { ok: false, motivo: "caso de flecha desconhecido: " + opc.caso.tipo, passos: R };
      ai = k * opc.caso.p * Math.pow(opc.caso.L, 4) / EIeq; passo(R, "fh.ai", "Flecha imediata", ai, "cm", "ai = " + fmt(k, 5) + "·p·ℓ⁴/(EI)eq (" + opc.caso.tipo + ")", "NBR 6118 17.3.2.1"); }
    else return { ok: false, motivo: "informe aElastica ou caso", passos: R };
    var t = num(opc.t, 70), t0 = num(opc.t0, 1), rhoL = AsL / (sec.bw * sec.d), dxi = xiTempo(t) - xiTempo(t0), af = dxi / (1 + cv("fluenciaRhoLinhaFator", 50) * rhoL);
    passo(R, "fh.dxi", "Δξ = ξ(t) − ξ(t0)", dxi, "-", "ξ(t) = 0,68·0,996^t·t^0,32 (t ≤ 70 meses), t = " + t + ", t0 = " + t0 + " meses", "NBR 6118 17.3.2.1.2");
    passo(R, "fh.af", "Fator de flecha diferida", af, "-", "αf = Δξ/(1 + 50·ρ'), ρ' = " + fmt(rhoL, 5), "NBR 6118 17.3.2.1.2");
    var at = ai * (1 + af);
    passo(R, "fh.at", "Flecha total", at, "cm", "at = ai·(1 + αf)", "NBR 6118 17.3.2.1.2");
    var L = num(opc.L, num(opc.caso && opc.caso.L, 0)), lim, regra, tipo = opc.limite || "visual", comp = at;
    if (tipo === "alvenaria") { lim = Math.min(L / cv("flechaLimiteAlvenariaDivisor", 500), cv("flechaLimiteAlvenariaMm", 10) / 10); regra = "ℓ/500 e 10 mm (alvenaria, caixilhos e revestimentos)"; }
    else if (tipo === "vibracao") { lim = L / cv("flechaLimiteVibracaoDivisor", 350); regra = "ℓ/350 (vibrações, só a parcela de cargas acidentais)"; comp = opc.aVariavel != null ? opc.aVariavel : at; }
    else { lim = L / cv("flechaLimiteVisualDivisor", 250); regra = "ℓ/250 (aceitabilidade sensorial, efeito visual)"; }
    passo(R, "fh.lim", "Limite de deslocamento", lim, "cm", regra, "NBR 6118 Tabela 13.3");
    return { ok: true, Mr: Mr, fissurada: fis, EIeq: EIeq, III: ii.III, xII: ii.x, Ic: g.Ic, ai: ai, alphaF: af, at: at, limite: lim, razao: lim > 0 ? comp / lim : Infinity, tipoLimite: tipo, passos: R };
  }

  /* abertura de fissura de uma barra: min(wk1, wk2) (17.3.3.2). phi em cm, tensões em kN/cm² — o resultado sai em cm (×10 = mm) */
  function abertura(phi, sig, rho, fctm, Es, eta1) {
    eta1 = eta1 != null ? eta1 : cv("wkEta1Nervurada", 2.25);
    var k = phi / (cv("wkDivisor", 12.5) * eta1) * sig / Es;
    var w1 = k * (cv("wkQuatro", 4) / rho + cv("wkQuarentaCinco", 45)), w2 = k * cv("wkTres", 3) * sig / fctm;
    return { wk: Math.min(w1, w2), wk1: w1, wk2: w2 };
  }
  /* área de concreto de envolvimento da barra mais crítica (camada junto à face tracionada) — cm². 7,5φ do eixo (Figura 17.3).
   * bw, cob, phiT (cm), barras = { phi (mm), n (na 1ª camada), acg1 (distância do eixo da 1ª camada à face) }, xII e h para limitar pela linha neutra. */
  function areaEnvolvimento(bw, cob, phiTmm, camada1, h, xII) {
    var phi = camada1.phi / 10, n = camada1.n, R = cv("wkRegiaoPhi", 7.5) * phi, y1 = cob + phiTmm / 10 + phi / 2;
    var util = bw - 2 * (cob + phiTmm / 10) - phi, s = n > 1 ? util / (n - 1) : 0, lateral = cob + phiTmm / 10 + phi / 2;
    var largura = n > 1 ? 2 * Math.min(R, lateral) + (n - 1) * Math.min(s, 2 * R) : 2 * Math.min(R, lateral);
    largura = Math.min(largura, bw);
    var acima = Math.min(R, Math.max(h - y1 - xII, 0)), abaixo = Math.min(R, y1);
    return { Acr: largura * (acima + abaixo) / n, larguraTotal: largura, alturaR: acima + abaixo, porBarra: true };
  }
  /* sec = { bw, h, d, dl, bf, hf }, Mser = combinação FREQUENTE (kN·cm). barras = { phi (mm), n1 (barras da camada junto à face), AsEf },
   * CAA 1..4, cob (cm), phiT (mm). opc.alphaE15 usa αe = 15. Devolve wk (mm) e a verificação contra a Tabela 13.4. */
  function fissuracao(sec, As, AsL, Mser, mat, barras, caa, cob, phiTmm, opc) {
    opc = opc || {};
    var R = [], T = num(sec.bf, 0) > sec.bw + 1e-9 && num(sec.hf, 0) > 0, g = propsBruta(sec.bw, sec.h, T ? sec.bf : 0, T ? sec.hf : 0);
    var alfaMr = T ? cv("mrAlphaT", 1.2) : cv("mrAlphaRetangular", 1.5), Mr = alfaMr * mat.fctkInf * g.Ic / g.yt;
    var lim = cv("wkLimiteCAAmm", [0.4, 0.3, 0.3, 0.2])[Math.max(1, Math.min(4, Math.round(num(caa, 2)))) - 1];
    passo(R, "wk.Mr", "Momento de fissuração (fctk,inf)", Mr, "kN·cm", "Mr = α·fctk,inf·Ic/yt", "NBR 6118 17.3.1 (fctk,inf no ELS de formação de fissuras)");
    passo(R, "wk.Mser", "Momento da combinação frequente", Mser, "kN·cm", "Md,ser", "NBR 6118 Tabela 13.4 e 11.8.3");
    if (Mser <= Mr) return { ok: true, fissurada: false, wk: 0, limite: lim, razao: 0, Mr: Mr, passos: R };
    var aE = opc.alphaE15 ? cv("wkAlphaEAlternativo", 15) : mat.alphaE, ii = estadioII(sec, As, AsL, aE);
    var sig = Mser * (sec.d - ii.x) * aE / ii.III, sigAprox = Mser / (0.85 * sec.d * As);
    passo(R, "wk.xII", "Linha neutra no estádio II", ii.x, "cm", "αe = " + fmt(aE, 3), "NBR 6118 17.3.3.2");
    passo(R, "wk.sig", "Tensão na armadura (estádio II)", sig, "kN/cm²", "σs = αe·Md,ser·(d − xII)/III", "NBR 6118 17.3.3.2");
    var ae = areaEnvolvimento(sec.bw, cob, phiTmm, { phi: barras.phi, n: barras.n1 }, sec.h, ii.x), rho = areaBarra(barras.phi) / ae.Acr;
    passo(R, "wk.Acr", "Área de concreto de envolvimento por barra", ae.Acr, "cm²", "retângulo até 7,5φ do eixo da barra (Figura 17.3)", "NBR 6118 17.3.3.2");
    passo(R, "wk.rho", "Taxa de armadura na região de envolvimento", rho, "-", "ρri = As,barra/Acr", "NBR 6118 17.3.3.2");
    var w = abertura(barras.phi / 10, sig, rho, mat.fctm, mat.Es);
    passo(R, "wk.wk", "Abertura característica de fissura", w.wk * 10, "mm", "wk = min(wk,1 ; wk,2) = min(" + fmt(w.wk1 * 10, 3) + "; " + fmt(w.wk2 * 10, 3) + ")", "NBR 6118 17.3.3.2");
    passo(R, "wk.lim", "Limite para a CAA " + caa, lim, "mm", "Tabela 13.4 (concreto armado, combinação frequente)", "NBR 6118 Tabela 13.4");
    return { ok: true, fissurada: true, wk: w.wk * 10, wk1: w.wk1 * 10, wk2: w.wk2 * 10, sigma: sig, sigmaAprox: sigAprox, xII: ii.x, III: ii.III, rho: rho, Acr: ae.Acr, Mr: Mr, limite: lim, razao: w.wk * 10 / lim, passos: R };
  }

  /* ---------------------------------------------------------------- DIMENSIONAMENTO DE UM TRAMO (m, kN, kN·m) */
  /* e = { id, L, bw, h, bf?, hf?, fck, fyk?, caa, dmaxMm?, controleRigoroso?, phiEstribo? (mm, padrão 6,3), estriboAco? ("CA50"|"CA60"),
   *       Mpos, MnegEsq, MnegDir (ELU, valores absolutos), Vesq, Vdir, Vmeio (ELU, valores absolutos),
   *       MqpVao (QP, kN·m), MfreqVao (frequente, kN·m), aQP (m, flecha elástica bruta da análise) ou caso:{tipo,p (kN/m)},
   *       apoios:{ esq:{tipo:"extremo"|"intermediario", larg (m)}, dir:{...} }, limiteFlecha, t, t0 } */
  function dimensionarTramo(e, opc) {
    opc = opc || {};
    var out = { id: e.id, ok: true, avisos: [], pendencias: [], passos: [], verificacoes: [] };
    var mat = material(e.fck, e.fyk, opc);
    if (!mat.ok) { out.ok = false; out.motivo = mat.motivo; return out; }
    var bw = e.bw * 100, h = e.h * 100, L = e.L * 100, bf = num(e.bf, 0) * 100, hf = num(e.hf, 0) * 100, dmax = num(e.dmaxMm, cv("dmaxAgregadoMm", 19));
    var caa = num(e.caa, 2), cob = cobrimento(caa, mat.fck, e.controleRigoroso), phiT = num(e.phiEstribo, 6.3);
    var T = bf > bw + 1e-9 && hf > 0;
    if (!(bw >= 12 || bw >= 10)) out.avisos.push("bw < 12 cm: abaixo do usual (largura mínima de 12 cm da 13.2.2 não conferida aqui).");
    out.esforcos = { Mpos: num(e.Mpos, 0), MnegEsq: num(e.MnegEsq, 0), MnegDir: num(e.MnegDir, 0), Vesq: num(e.Vesq, 0), Vmeio: num(e.Vmeio, 0), Vdir: num(e.Vdir, 0), MqpVao: e.MqpVao, MfreqVao: e.MfreqVao, aQP: e.aQP };   /* kN·m e kN, como recebidos */
    out.entrada = { bw: bw, h: h, bf: bf, hf: hf, L: L, fck: mat.fck, fyk: mat.fyk, caa: caa, cobrimento: cob, dmaxMm: dmax, mesa: T };
    out.passos.push({ id: "t.cob", nome: "Cobrimento nominal", valor: cob, unidade: "cm", formula: "Tabela 7.2 (viga, CAA " + caa + ")" + (mat.fck > cv("fckMinimoCAA", [20, 25, 30, 40])[caa - 1] ? ", reduzido 5 mm por fck acima do mínimo da Tabela 7.1" : "") + (e.controleRigoroso ? ", −5 mm por controle rigoroso" : ""), item: "NBR 6118 7.4.7 e Tabela 7.2" });

    /* --- flexão: positivo traciona a base (mesa comprimida, se houver); negativo traciona o topo (mesa tracionada, seção retangular bw) */
    function trecho(nome, M, positivo, phiTmm) {                 /* M em kN·cm; devolve armadura, barras, d real */
      var r = { nome: nome, positivo: positivo, Md: M, passos: [] };
      var optBar = positivo && opc.phiMaxPos ? { phiMax: opc.phiMaxPos, phiMin: 10 } : {};   /* só o vão: a bitola menor de reserva (ancoragem no apoio) não mexe no negativo */
      if (!(M > 1e-9)) { r.semMomento = true; r.AsReq = 0; r.AsCalc = 0; r.AsMin = 0; return r; }
      var d = h - (cob + phiTmm / 10 + 1.0), dl = cob + phiTmm / 10 + 1.0, it, fl, mn, bar, barL = null;
      for (it = 0; it < 8; it++) {
        var s = { bw: bw, h: h, d: d, dl: dl, bf: positivo && T ? bf : 0, hf: positivo && T ? hf : 0 };
        fl = flexao(s, M, mat); if (!fl.ok) { r.erro = fl.motivo; r.passos = fl.passos; return r; }
        mn = asMin({ bw: bw, h: h, d: d, dl: dl, bf: bf, hf: hf }, mat, { mesaComprimida: positivo && T });
        var AsReq = Math.max(fl.As, mn.As);
        bar = escolherBarras(AsReq, bw, cob, phiTmm, dmax, optBar);
        if (!bar.ok) { r.erro = bar.motivo; r.passos = fl.passos; return r; }
        var dNovo = h - bar.acg, dlNovo = dl;
        if (fl.dupla) {
          barL = escolherBarras(fl.AsLinha, bw, cob, phiTmm, dmax, { phiMin: 10, nMin: 2 });
          if (!barL.ok) { r.erro = barL.motivo; return r; }
          dlNovo = barL.acg;
        }
        var conv = Math.abs(dNovo - d) < 0.05 && Math.abs(dlNovo - dl) < 0.05;
        d = dNovo; dl = dlNovo;
        if (conv) break;
      }
      /* conferência final com o d real (as barras podem ter subido o CG): refaz uma vez e exige As,ef ≥ As,calc */
      var sF = { bw: bw, h: h, d: d, dl: dl, bf: positivo && T ? bf : 0, hf: positivo && T ? hf : 0 };
      fl = flexao(sF, M, mat); mn = asMin({ bw: bw, h: h, d: d, dl: dl, bf: bf, hf: hf }, mat, { mesaComprimida: positivo && T });
      var AsReqF = Math.max(fl.As, mn.As);
      if (bar.AsEf + 1e-9 < AsReqF) { bar = escolherBarras(AsReqF * 1.0001, bw, cob, phiTmm, dmax, optBar); d = h - bar.acg; fl = flexao({ bw: bw, h: h, d: d, dl: dl, bf: sF.bf, hf: sF.hf }, M, mat); AsReqF = Math.max(fl.As, mn.As); }
      var MrdEf = resistente({ bw: bw, h: h, d: d, dl: dl, bf: sF.bf, hf: sF.hf }, bar.AsEf, barL ? barL.AsEf : 0, mat);
      var aMax = asMax(sF, { mesaComprimida: positivo && T }), soma = bar.AsEf + (barL ? barL.AsEf : 0);
      r.flexao = fl; r.asMin = mn; r.AsCalc = fl.As; r.AsMin = mn.As; r.AsReq = AsReqF; r.barras = bar; r.barrasLinha = barL; r.d = d; r.dl = dl; r.passos = fl.passos.concat(mn.passos);
      r.Mrd = MrdEf.Mrd; r.razaoFlexao = M / MrdEf.Mrd; r.razaoArea = AsReqF / bar.AsEf; r.AsMax = aMax.valor; r.somaArmaduras = soma;
      r.passos.push({ id: "fl.barras", nome: "Barras escolhidas", valor: bar.AsEf, unidade: "cm²", formula: bar.texto + "; d real = " + fmt(d, 2) + " cm (acg = " + fmt(bar.acg, 2) + " cm); ah livre ≥ " + fmt(bar.ah, 1) + " cm", item: "NBR 6118 18.3.2.2 e 17.2.4.1" });
      if (barL) r.passos.push({ id: "fl.barrasL", nome: "Barras de compressão escolhidas", valor: barL.AsEf, unidade: "cm²", formula: barL.texto, item: "NBR 6118 18.3.2.2" });
      if (soma > aMax.valor) out.avisos.push(nome + ": As + A's = " + fmt(r2(soma), 2) + " cm² > 4 % Ac = " + fmt(r2(aMax.valor), 2) + " cm² (17.3.5.2.4): aumente a seção.");
      if (fl.avisos) fl.avisos.forEach(function (a) { out.avisos.push(nome + ": " + a); });
      var yUlt = cob + phiTmm / 10 + bar.phi / 20 + (bar.camadas.length - 1) * (bar.phi / 10 + bar.av);   /* camada mais afastada da face */
      if (yUlt - bar.acg > 0.1 * h + 1e-9) out.avisos.push(nome + ": CG da armadura a mais de 10 % h da barra mais afastada (17.2.4.1): d real pode estar impreciso.");
      return r;
    }
    function rodarTrechos(phiTmm) {
      var o = {};
      o.positivo = trecho("Positivo (vão)", num(e.Mpos, 0) * 100, true, phiTmm);
      o.negEsq = trecho("Negativo (apoio esquerdo)", num(e.MnegEsq, 0) * 100, false, phiTmm);
      o.negDir = trecho("Negativo (apoio direito)", num(e.MnegDir, 0) * 100, false, phiTmm);
      return o;
    }
    var tr = rodarTrechos(phiT), erro = null;
    ["positivo", "negEsq", "negDir"].forEach(function (k) { if (tr[k].erro) erro = tr[k].nome + ": " + tr[k].erro; });
    if (erro) { out.ok = false; out.motivo = erro; out.trechos = tr; return out; }
    out.trechos = tr;
    var dRef = tr.positivo.d || (h - cob - phiT / 10 - 1.5);
    if (!tr.positivo.d) dRef = tr.negEsq.d || tr.negDir.d || dRef;

    /* --- cisalhamento por zona: apoio esq., meio, apoio dir. */
    var dCis = Math.min(tr.positivo.d || dRef, tr.negEsq.d || dRef, tr.negDir.d || dRef);
    var zonas = { esq: num(e.Vesq, 0), meio: num(e.Vmeio, 0), dir: num(e.Vdir, 0) }, cis = {}, phiEst = phiT, volta = 0;
    function cisZona(V) {
      var c = cisalhamento({ bw: bw, d: dCis }, V, mat, { fywkMPa: e.estriboAco === "CA60" ? 600 : mat.fyk });
      if (!c.ok) return c;
      var es = escolherEstribo(c.AswS, bw, c.smax, { aco: e.estriboAco || "CA50", phiMin: phiEst });
      c.estribo = es; return c;
    }
    ["esq", "meio", "dir"].forEach(function (k) { cis[k] = cisZona(zonas[k]); if (!cis[k].ok) { out.ok = false; out.motivo = "Cortante (" + k + "): " + (cis[k].motivo || (cis[k].estribo && cis[k].estribo.motivo)); } else if (!cis[k].estribo.ok) { out.ok = false; out.motivo = "Estribo (" + k + "): " + cis[k].estribo.motivo; } });
    if (!out.ok) { out.cisalhamento = cis; return out; }
    var maior = Math.max(cis.esq.estribo.phi, cis.meio.estribo.phi, cis.dir.estribo.phi);
    if (maior > phiT + 1e-9 && !opc._refeito) {                  /* estribo mais grosso que o previsto: o d real muda — refaz com o φ do estribo */
      var e2 = JSON.parse(JSON.stringify(e)); e2.phiEstribo = maior; var o2 = dimensionarTramo(e2, { _refeito: true, agregado: opc.agregado, phiMaxPos: opc.phiMaxPos, _semReserva: opc._semReserva }); o2.avisos.unshift("Refeito com estribo φ " + fmt(maior, 1) + " mm (o previsto era " + fmt(phiT, 1) + " mm)."); return o2;
    }
    out.cisalhamento = cis;

    /* --- decalagem e armadura nos apoios */
    out.apoios = {};
    [["esq", "negEsq", zonas.esq], ["dir", "negDir", zonas.dir]].forEach(function (a) {
      var lado = a[0], neg = tr[a[1]], ap = (e.apoios && e.apoios[lado]) || {}, V = a[2];
      var dec = decalagem(V, cis[lado].Vc, dCis, 90), pos = tr.positivo;
      if (!pos.barras) { out.apoios[lado] = { semArmaduraDoVao: true, decalagem: dec }; return; }
      var Mapo = -(num(a[1] === "negEsq" ? e.MnegEsq : e.MnegDir, 0) * 100), Mvao = pos.Md;
      var intermA = (ap.tipo || "extremo") === "intermediario", MposA = num(a[1] === "negEsq" ? e.MposEsq : e.MposDir, 0) * 100, AsPosA = 0, posFalhou = false;
      /* ⚠ momento positivo no apoio intermediário (Em1 18.3.2.4-a): se a flexão dele NÃO fechar, a viga NÃO ATENDE (verificação 99) — nunca "As = 0" */
      if (intermA && MposA > 1e-9) {
        var flA = flexao({ bw: bw, h: h, d: dCis, dl: cob + phiT / 10 + 1.0, bf: 0, hf: 0 }, MposA, mat);
        if (flA && flA.ok) AsPosA = flA.As;
        else { posFalhou = true; out.avisos.push("Apoio " + lado + " intermediário: a flexão do momento positivo no apoio (" + fmt(r2(MposA / 100), 1) + " kN·m) não fechou (" + ((flA && flA.motivo) || "sem solução") + ") — NÃO ATENDE (Em1 18.3.2.4-a): aumente a seção."); }
      }
      var apo = apoio(V, dec.a, dCis, pos.AsReq, Mapo, Mvao, mat, { intermediario: intermA, AsPositivoApoio: AsPosA }), phi = pos.barras.phi;
      var nBar = Math.max(2, Math.ceil(apo.As / areaBarra(phi) - 1e-9)); nBar = Math.min(nBar, pos.barras.n);
      var AsEf = nBar * areaBarra(phi);
      if (AsEf + 1e-9 < apo.As) out.avisos.push("Apoio " + lado + ": As,apoio = " + fmt(r2(apo.As), 2) + " cm² maior que a armadura positiva efetiva (" + fmt(r2(AsEf), 2) + " cm²): prolongue mais barras — NÃO ATENDE.");
      var h0 = aderencia(h, pos.barras.acg - 0, false), anc = ancoragemNecessaria(phi, mat, apo.As, AsEf, { aderencia: h0 });
      var info = { decalagem: dec, As: apo, nBarras: nBar, phi: phi, AsEf: AsEf, ancoragem: anc, aderencia: h0, tipo: ap.tipo || "extremo", larg: ap.larg != null ? ap.larg * 100 : null, posFalhou: posFalhou };
      if (info.tipo === "extremo") {
        var lbx = lbApoioExtremo(anc.lbNec, phi); info.trechoMin = lbx;
        if (ap.larg != null) {
          var disp = ap.larg * 100 - cob; info.disponivel = disp;
          if (lbx.valor > disp + 1e-9) {
            var anc2 = ancoragemNecessaria(phi, mat, apo.As, AsEf, { aderencia: h0, gancho: true }), lbx2 = lbApoioExtremo(anc2.lbNec, phi);
            info.comGancho = { ancoragem: anc2, trechoMin: lbx2, cabe: lbx2.valor <= disp + 1e-9 }; info.exigeGancho = true;
            /* ⚠ ANCORAGEM REDUZIDA (15/11/2026): antes de reprovar, leva ao apoio MAIS barras do vão (As,ef maior → ℓb,nec = α·ℓb·As,calc/As,ef menor, 18.3.2.4.1 e 9.4.2.5; o piso ℓb,mín vale
             * sempre). Custa só comprimento de barra (as barras já existem no vão). Primeiro sem gancho; se não, com gancho. A bitola menor (mais barras, mesma As) é tentada depois, no fim do tramo. */
            if (!info.comGancho.cabe) {
              var nb, achou = false;
              for (nb = nBar + 1; nb <= pos.barras.n && !achou; nb++) {
                var AsE2 = nb * areaBarra(phi), a3 = ancoragemNecessaria(phi, mat, apo.As, AsE2, { aderencia: h0 }), l3 = lbApoioExtremo(a3.lbNec, phi);
                var a4 = ancoragemNecessaria(phi, mat, apo.As, AsE2, { aderencia: h0, gancho: true }), l4 = lbApoioExtremo(a4.lbNec, phi);
                if (l3.valor <= disp + 1e-9) { achou = true; info.nBarras = nb; info.AsEf = AsE2; info.ancoragem = a3; info.trechoMin = l3; info.exigeGancho = false; delete info.comGancho; }
                else if (l4.valor <= disp + 1e-9) { achou = true; info.nBarras = nb; info.AsEf = AsE2; info.ancoragem = a3; info.trechoMin = l3; info.comGancho = { ancoragem: a4, trechoMin: l4, cabe: true }; }
                if (achou) { info.ancoragemReduzida = { nBarras: nb, de: nBar }; out.avisos.push("Apoio " + lado + ": ancoragem fechada levando " + nb + " das " + pos.barras.n + " barras do vão ao apoio (As,ef " + fmt(r2(AsE2), 2) + " cm²; 18.3.2.4.1 e 9.4.2.5)."); }
              }
            }
            if (!info.comGancho || info.comGancho.cabe === false) out.avisos.push("Apoio " + lado + ": ancoragem com gancho (" + fmt(r2(lbx2.valor), 1) + " cm) não cabe no apoio (" + fmt(r2(disp), 1) + " cm): alargue o apoio (pilar com o lado maior ao longo da viga) ou reduza o diâmetro — NÃO ATENDE.");
          }
        } else { out.semLarguraApoio = true; out.pendencias.push("Apoio " + lado + ": largura do apoio não informada — lb,nec = " + fmt(r2(anc.lbNec), 1) + " cm (trecho reto mínimo " + fmt(r2(lbx.valor), 1) + " cm) não foi comparado ao espaço disponível."); }
      }
      (anc.avisos || []).forEach(function (m) { if (out.avisos.indexOf(m) < 0) out.avisos.push(m); });
      out.apoios[lado] = info;
    });

    /* ⚠ BITOLA MENOR (15/11/2026): apoio extremo que não fechou nem com mais barras no apoio → refaz o tramo com a bitola do vão uma abaixo (mesma As, mais barras: o ℓb e o raio do gancho
     * diminuem com φ), da maior para a menor; fica a primeira em que o tramo INTEIRO atende. Se nenhuma fechar, devolve o resultado original (reprovado), nunca um verde inventado. */
    if (!opc._semReserva) {
      var falhaApo = ["esq", "dir"].some(function (k) { var i = out.apoios[k]; return i && i.tipo === "extremo" && i.comGancho && i.comGancho.cabe === false; });
      if (falhaApo && tr.positivo.barras) {
        var cands = cv("bitolasMm", []).filter(function (p) { return p >= 10 && p < tr.positivo.barras.phi - 1e-9; }).sort(function (a, b) { return b - a; }), ci;
        for (ci = 0; ci < cands.length; ci++) {
          var oR = dimensionarTramo(e, { _semReserva: true, agregado: opc.agregado, phiMaxPos: cands[ci], _refeito: opc._refeito });
          if (oR.ok && oR.atende) { oR.avisos.unshift("Ancoragem no apoio extremo: bitola do vão reduzida para φ " + fmt(cands[ci], 1) + " mm (mais barras, mesma área) — com φ " + fmt(tr.positivo.barras.phi, 1) + " mm o trecho com gancho não cabia no apoio (18.3.2.4.1)."); oR.bitolaReduzidaPara = cands[ci]; return oR; }
        }
      }
    }

    /* --- armadura de pele */
    out.pele = pele(bw, h, dCis, h - ((tr.positivo.barras ? tr.positivo.barras.acg : cob + 2) + (tr.negEsq.barras ? tr.negEsq.barras.acg : cob + 2)));

    /* --- ELS */
    var pos = tr.positivo, els = {};
    if (e.MqpVao != null && pos.barras && (e.aQP != null || e.caso)) {
      var opcF = { t: e.t, t0: e.t0, limite: e.limiteFlecha, L: L };
      if (e.aQP != null) opcF.aElastica = e.aQP * 100; else opcF.caso = { tipo: e.caso.tipo, p: e.caso.p / 100, L: L };
      els.flecha = flecha({ bw: bw, h: h, d: pos.d, dl: pos.dl, bf: T ? bf : 0, hf: T ? hf : 0 }, pos.barras.AsEf, 0, num(e.MqpVao, 0) * 100, mat, opcF);
      if (!els.flecha.ok) out.avisos.push("Flecha não calculada: " + els.flecha.motivo);
    } else out.pendencias.push("Flecha não verificada: faltam o momento quase permanente do vão e a flecha elástica da análise (ELS-QP).");
    if (e.MfreqVao != null && pos.barras) {
      els.fissuracao = fissuracao({ bw: bw, h: h, d: pos.d, dl: pos.dl, bf: T ? bf : 0, hf: T ? hf : 0 }, pos.barras.AsEf, 0, num(e.MfreqVao, 0) * 100, mat,
        { phi: pos.barras.phi, n1: pos.barras.camadas[0] }, caa, cob, phiT, { alphaE15: !!opc.alphaE15 });
    } else out.pendencias.push("Fissuração não verificada: falta o momento da combinação frequente (ELS-F).");
    out.els = els;
    if (!T) out.avisos.push("Seção retangular (sem mesa colaborante informada): a favor da segurança no ELU; informe bf/hf (14.6.2.2) se há laje.");

    /* --- aproveitamento (0 a 1+) */
    var V = out.verificacoes;
    /* ⚠ apoio (revisão de cálculo 14/11/2026): antes eram só avisos e a viga saía "atende" com a armadura do vão curta para o As,apoio ou com o gancho maior que o apoio. Agora entram
     * como verificações (razão > 1 → NÃO ATENDE). A largura do apoio AUSENTE segue pendência — mas a viga fica "incompleta" (o Calcular a lista como sem cálculo, nunca verde). */
    ["esq", "dir"].forEach(function (k) {
      var info = out.apoios[k];
      if (info && info.posFalhou) V.push({ nome: "Armadura do momento positivo no apoio " + k + " (flexão não fechou, 18.3.2.4-a)", valor: 99 });
      if (info && info.As && info.AsEf > 0) V.push({ nome: "Armadura no apoio " + k + " (As,apoio/As,ef)", valor: info.As.As / info.AsEf });
      if (info && info.comGancho && info.comGancho.cabe === false) V.push({ nome: "Ancoragem no apoio " + k + " (trecho com gancho/disponível)", valor: info.comGancho.trechoMin.valor / info.disponivel });
    });
    ["positivo", "negEsq", "negDir"].forEach(function (k) { var t = tr[k]; if (!t.semMomento) { V.push({ nome: "Flexão — " + t.nome + " (Md/MRd)", valor: t.razaoFlexao }); V.push({ nome: "Flexão — " + t.nome + " (As,nec/As,ef)", valor: t.razaoArea }); } });
    ["esq", "meio", "dir"].forEach(function (k) { V.push({ nome: "Cortante — " + k + " (VSd/VRd2)", valor: cis[k].Vsd / cis[k].VRd2 }); V.push({ nome: "Estribos — " + k + " (Asw/s nec / ef)", valor: cis[k].AswS / cis[k].estribo.AswSEf }); });
    if (els.flecha && els.flecha.ok) V.push({ nome: "Flecha total (at/limite)", valor: els.flecha.razao });
    if (els.fissuracao && els.fissuracao.ok) V.push({ nome: "Fissuração (wk/limite)", valor: els.fissuracao.razao });
    var mx = 0, qual = ""; V.forEach(function (v) { if (v.valor > mx) { mx = v.valor; qual = v.nome; } });
    out.aproveitamento = mx; out.governa = qual;
    if (mx > 1 + 1e-9) { out.avisos.push("NÃO ATENDE: " + qual + " = " + fmt(r2(mx), 2) + " (> 1)."); out.atende = false; } else out.atende = true;
    out.rotulo = (D() && D().rotulo) || "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";
    return out;
  }

  function dimensionarViga(v, opc) {
    var r = { id: v.id, marca: v.marca, tramos: [], avisos: [], pendencias: [] }, mx = 0;
    arr(v.tramos).forEach(function (t) {
      var o = dimensionarTramo(t, opc); r.tramos.push(o);
      if (!o.ok) { r.ok = false; r.avisos.push("Tramo " + o.id + ": " + o.motivo); } else if (o.aproveitamento > mx) mx = o.aproveitamento;
      (o.avisos || []).forEach(function (a) { r.avisos.push("Tramo " + o.id + ": " + a); });
      (o.pendencias || []).forEach(function (a) { r.pendencias.push("Tramo " + o.id + ": " + a); });
    });
    r.ok = r.ok !== false; r.aproveitamento = mx; r.atende = r.ok && mx <= 1 + 1e-9;
    r.incompleto = r.tramos.some(function (o) { return o.semLarguraApoio === true; });
    return r;
  }

  /* ---------------------------------------------------------------- adaptador: resultado do ConcAnalise → vigas
   * Convenção do AcoAnalise: Mz > 0 traciona a face INFERIOR (positivo = vão); apoios com Mz < 0. Valores absolutos de ELU/ELS vêm das ESTAÇÕES
   * (padrão 9 por barra — peça opc.estacoes ≥ 21 em ConcAnalise.rodar para o máximo do vão ficar bem representado). */
  function dimensionarDeAnalise(an, opc) {
    opc = opc || {};
    if (!an || !an.ok) return { ok: false, motivo: "análise ausente ou inválida" };
    var vigas = [], avisos = [], pend = [], m = an.modelo, ELU = an.combinacoes.filter(function (c) { return c.tipo === "ELU"; }), QP = an.combinacoes.filter(function (c) { return c.tipo === "ELS-QP"; }), FR = an.combinacoes.filter(function (c) { return c.tipo === "ELS-F"; });
    if (!ELU.length) return { ok: false, motivo: "sem combinação ELU" };
    function est(c, bid) { var r = an.resultados[c.id]; return r && r.esforcos[bid] ? r.esforcos[bid].estacoes : []; }
    arr(m.barras).forEach(function (b) {
      if (b.tipo !== "viga") return;
      var pv = m.pecas.vigas[b.peca] || {}, o = (opc.porBarra && opc.porBarra[b.id]) || (opc.porPeca && opc.porPeca[b.peca]) || {};
      var Mpos = 0, nE = 0, nD = 0, Ve = 0, Vd = 0, Vm = 0;
      ELU.forEach(function (c) { var s = est(c, b.id); if (!s.length) return; var k = s.length - 1, mid = Math.floor(k / 2);
        s.forEach(function (p) { Mpos = Math.max(Mpos, p.Mz); });
        nE = Math.max(nE, -s[0].Mz); nD = Math.max(nD, -s[k].Mz); Ve = Math.max(Ve, Math.abs(s[0].Vy)); Vd = Math.max(Vd, Math.abs(s[k].Vy)); Vm = Math.max(Vm, Math.abs(s[mid].Vy)); });
      var Mqp = 0, aqp = 0, Mfr = 0;
      QP.forEach(function (c) { var s = est(c, b.id); if (!s.length) return; var k = s.length - 1, L = s[k].x - s[0].x, u0 = s[0].u[1], u1 = s[k].u[1];
        s.forEach(function (p) { Mqp = Math.max(Mqp, p.Mz); var corda = u0 + (u1 - u0) * (p.x - s[0].x) / (L || 1); aqp = Math.max(aqp, Math.abs(p.u[1] - corda)); }); });
      FR.forEach(function (c) { est(c, b.id).forEach(function (p) { Mfr = Math.max(Mfr, p.Mz); }); });
      var MpE = 0, MpD = 0;
      ELU.forEach(function (c) { var s = est(c, b.id); if (!s.length) return; MpE = Math.max(MpE, s[0].Mz); MpD = Math.max(MpD, s[s.length - 1].Mz); });
      var t = { id: b.id, L: b.L || pv.L, MposEsq: MpE, MposDir: MpD, bw: num(pv.b, 0), h: num(pv.h, 0), fck: an.modelo.fck || opc.fck, fyk: opc.fyk, caa: num(opc.caa, 2), dmaxMm: opc.dmaxMm, controleRigoroso: opc.controleRigoroso,
        Mpos: Mpos, MnegEsq: Math.max(nE, 0), MnegDir: Math.max(nD, 0), Vesq: Ve, Vdir: Vd, Vmeio: Vm, MqpVao: Mqp, MfreqVao: Mfr, aQP: aqp, estriboAco: opc.estriboAco, limiteFlecha: opc.limiteFlecha, apoios: o.apoios, bf: o.bf, hf: o.hf };
      if (!QP.length || !FR.length) pend.push("Viga " + (pv.marca || b.id) + ": falta combinação ELS (flecha/fissuração não verificadas).");
      vigas.push(dimensionarViga({ id: b.id, marca: pv.marca || "", tramos: [t] }, opc));
    });
    var mx = 0, nao = 0; vigas.forEach(function (v) { if (v.aproveitamento > mx) mx = v.aproveitamento; if (!v.atende) nao++; });
    avisos.push("Cortante nos apoios SEM a redução de 17.4.1.2.1 e momentos no eixo do pilar (não na face): a favor da segurança.");
    avisos.push("Cobertura do diagrama de momentos e corte de barras: etapa C5 (detalhamento). Aqui: armadura por seção crítica.");
    return { ok: true, rotulo: (D() && D().rotulo) || "", vigas: vigas, aproveitamento: mx, naoAtendem: nao, avisos: avisos, pendencias: pend.concat(D() ? D().semFonte().map(function (x) { return "SEM FONTE: " + x.chave + " (" + x.item + ")"; }) : []) };
  }

  var ConcViga = {
    material: material, propsBruta: propsBruta, larguraColaborante: larguraColaborante, flexao: flexao, resistente: resistente, asMin: asMin, asMax: asMax, pele: pele,
    cisalhamento: cisalhamento, escolherEstribo: escolherEstribo, decalagem: decalagem, apoio: apoio, aderencia: aderencia, ancoragemBasica: ancoragemBasica,
    ancoragemNecessaria: ancoragemNecessaria, lbApoioExtremo: lbApoioExtremo, apoioMinimoExtremo: apoioMinimoExtremo, cobrimento: cobrimento, espacamentos: espacamentos, escolherBarras: escolherBarras,
    estadioII: estadioII, xiTempo: xiTempo, flecha: flecha, abertura: abertura, areaEnvolvimento: areaEnvolvimento, fissuracao: fissuracao,
    dimensionarTramo: dimensionarTramo, dimensionarViga: dimensionarViga, dimensionarDeAnalise: dimensionarDeAnalise
  };
  global.ConcViga = ConcViga;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcViga;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * concdetalhe.js — DETALHAMENTO DAS ARMADURAS de concreto armado (fase C5, 16/11/2026). Motor PURO (ES5, Node-testável, sem DOM, sem desenho).
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). Todo número vem de js/concdadoscalc.js (com fonte, item e página);
 * o que não foi conferido ('sem-fonte') aparece em ConcDadosCalc.semFonte() e vira pendência no memorial. O DESENHO das pranchas é a C8.
 *
 * Entrada = o RESULTADO dos motores: ConcViga.dimensionarTramo/dimensionarDeAnalise (C2), ConcLaje.dimensionarLaje (C3) e ConcPilar.dimensionarPilar (C4).
 * Saída = POSIÇÕES de barra (N1, N2…) com φ, aço, quantidade, comprimento unitário, ganchos e a regra (critério do calculo.json) de cada uma, mais a TABELA DE AÇO
 * (por elemento e resumo por bitola: comprimento total, kg, + perda editável).
 *
 * O QUE FAZ
 *  VIGAS   cobertura do diagrama pela decalagem a (17.4.2.2) e corte de barras (18.3.2.3.1: ℓb,nec além do ponto A e ≥ 10φ além do ponto B), positivas e negativas;
 *          ancoragem reta/com gancho no apoio (9.4.2, 9.4.2.3 ganchos, piso 25φ já no motor), apoio extremo pela Em1 18.3.2.4-b/d e 18.3.2.4.1 (Fsd = MSd/z + (aℓ/d)·VSd + NSd;
 *          ancoragem desde a face), apoio intermediário 10φ só sem risco de momento positivo; emendas por traspasse (9.5.2); estribos com comprimento (ganchos de 135°/90°,
 *          9.4.6.1) por zona de cortante; porta-estribos e barras de amarração (18.3.3.2 Em1); armadura de pele (17.3.5.2.3, h > 60 cm); suspensão (18.3.6 Em1)
 *  LAJES   barras positivas por direção (20.1: ≥ 4 cm além do eixo), negativas (0,25ℓx a cada lado + ℓb com gancho — critério do livro, decisão do produto), distribuição,
 *          negativas de borda sem continuidade, armadura inferior anticolapso do balanço (20.6 Em1), estribo de laje (20.4 Em1: φ ≤ h/20)
 *  PILARES barras do lance com espera/traspasse comprimido (9.5.2.3) e armadura transversal na emenda (9.5.2.4), estribos (18.4.3), grampos (18.2.4 + Fig. 18.2 Em1)
 *  AÇO     tabelaAco: por posição e resumo por bitola (CA-50/CA-60), kg pela massa linear φ²·0,006165 (Tabela A-3 do Bastos; NBR 7480 fora da biblioteca), + perda
 *
 * LIMITES DECLARADOS (viram aviso/pendência, nunca silêncio): só barras de CA-50 nas longitudinais e CA-60 de 5 mm nos estribos; comprimentos = trecho reto + pontas retas, SEM acréscimo
 * de curva (convenção do Bastos); cada barra do modelo é um tramo apoiado nos extremos (a continuidade entre barras vizinhas só é fundida em detalharViga com tramos informados);
 * o diagrama de cobertura vem das envoltórias ELU (kN·m) das estações; MRd dos grupos de barras com o d do projeto (as camadas externas têm d um pouco maior: a favor da segurança);
 * sem barra dobrada (17.4.1.1.3 não se aplica: só estribos); sem estribo de torção (18.3.4: o motor não calcula torção); sem punção (19.5.2.3); arranque na fundação é da C9;
 * lajes: sem momentos volventes (armadura de canto, pendência já da C3), furos e lajes não retangulares ficam fora; comprimento da negativa é critério do livro (NB-1/78), não da 6118.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function VG() { return dep("ConcViga", "./concviga.js"); }
  function cv(k, d) { var X = D(); return X ? X.v(k, d) : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(v, n) { return (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toString().replace(".", ","); }
  function areaBarra(phiMm) { return Math.PI * (phiMm / 10) * (phiMm / 10) / 4; }
  function passo(R, id, nome, valor, unidade, formula, item) { R.push({ id: id, nome: nome, valor: valor, unidade: unidade, formula: formula, item: item }); return valor; }
  var ROTULO = "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";

  /* ---------------------------------------------------------------- arredondamento e contagem */
  function passoCm(opc) { return opc && opc.passoCm != null ? opc.passoCm : cv("detalheArredondaCm", 5); }
  function acima(x, p) { return p > 1 ? Math.ceil(x / p - 1e-9) * p : x; }
  function proximo(x, p) { return p > 1 ? Math.round(x / p) * p : x; }
  /* nº de peças num trecho: ⌈trecho/s⌉ (padrão, a favor da segurança) ou o inteiro mais próximo (opc.contagem = "arredondar", como o livro) */
  function conta(trecho, s, opc) {
    if (!(s > 0) || !(trecho > 0)) return 0;
    var modoLivro = opc && opc.contagem === "arredondar" || (opc && opc.contagem == null && !(cv("detalheContagemCima", 1) > 0));
    return Math.max(1, modoLivro ? Math.round(trecho / s) : Math.ceil(trecho / s - 1e-9));
  }

  /* ---------------------------------------------------------------- aço: massa linear e classe */
  function massaLinear(phiMm) { return cv("massaLinearCoef", 0.006165) * phiMm * phiMm; }
  function acoDe(phiMm, aco) { return aco || (phiMm <= cv("acoCA60PhiMaxMm", 5) + 1e-9 ? "CA-60" : "CA-50"); }

  /* ---------------------------------------------------------------- ganchos e estribos */
  /* ponta reta do gancho do estribo (cm): 135° = max(5φt; 5 cm); 90° = max(10φt; 7 cm) — 9.4.6.1 */
  function ganchoEstribo(phiTmm, angulo) {
    if (angulo === 90) return Math.max(cv("estriboGancho90Phi", 10) * phiTmm / 10, cv("estriboGancho90MinCm", 7));
    return Math.max(cv("estriboGanchoPhi", 5) * phiTmm / 10, cv("estriboGanchoMinCm", 5));
  }
  /* diâmetro do pino de dobramento do estribo (Tabela 9.2), em mm */
  function pinoEstribo(phiTmm, aco) {
    var k = aco === "CA-60" || aco === "CA60" ? cv("pinoEstriboPhiCA60", 3) : (phiTmm <= 10 ? cv("pinoEstriboPhiCA50Ate10", 3) : (phiTmm < 20 ? cv("pinoEstriboPhiCA50De10a20", 5) : cv("pinoEstriboPhiCA50Mais20", 8)));
    return k * phiTmm;
  }
  /* ponta reta do gancho de barra tracionada (cm): 180° 2φ, 45° 4φ, 90° 8φ — 9.4.2.3; opc.passoCm arredonda para cima */
  function ganchoTracao(phiMm, angulo, opc) {
    var k = angulo === 45 ? cv("ganchoTracao45Phi", 4) : (angulo === 180 ? cv("ganchoTracaoSemicircularPhi", 2) : cv("ganchoTracao90Phi", 8));
    return acima(k * phiMm / 10, passoCm(opc));
  }
  /* comprimento do estribo fechado retangular (cm): perímetro externo + 2 pontas (convenção do Bastos: C = 2(bw−2c + h−2c) + 2·ponta; sem acréscimo de curva) */
  function comprimentoEstribo(b, h, cob, phiTmm, angulo) { return 2 * ((b - 2 * cob) + (h - 2 * cob)) + 2 * ganchoEstribo(phiTmm, angulo || 135); }
  /* estribo suplementar (grampo) de barra reta com ganchos de 135° a 180° nas duas pontas (18.2.4 Em1), atravessando uma dimensão `dim` (cm) */
  function comprimentoGrampo(dim, cob, phiTmm, angulo) { return (dim - 2 * cob) + 2 * ganchoEstribo(phiTmm, angulo || cv("grampoGanchoAnguloMin", 135)); }

  /* ---------------------------------------------------------------- ancoragem e emenda */
  function matDe(fck, fyk, opc) { var V = VG(); return V ? V.material(fck, fyk, opc || {}) : { ok: false, motivo: "ConcViga ausente" }; }
  function alfa0t(pct) {
    var lim = cv("traspasseAlfa0tPct", [20, 25, 33, 50]), val = cv("traspasseAlfa0tValores", [1.2, 1.4, 1.6, 1.8, 2.0]), i;
    for (i = 0; i < lim.length; i++) if (pct <= lim[i] + 1e-9) return val[i];
    return val[val.length - 1];
  }
  /* comprimento de traspasse de barras TRACIONADAS (9.5.2.2.1): ℓ0t = α0t·ℓb,nec ≥ ℓ0t,mín = max(0,3·α0t·ℓb; 15φ; 200 mm); pct = % de barras emendadas na mesma seção;
   * distância livre > 4φ entre as barras: soma-se a distância livre (9.5.2.2.2). Diâmetros diferentes: usar a barra de MENOR diâmetro (9.5.2.1, 2023). */
  function traspasseTracionada(phiMm, mat, pct, opc) {
    opc = opc || {};
    /* 9.5.2.1 (2023): diâmetros diferentes → o comprimento ℓ0 vale pela barra de MENOR diâmetro (phiL). Os LIMIARES (32 mm, φ ≥ 16 mm da armadura transversal) seguem pelo MAIOR (phiMax). Pendência: conferir a p. 60 no exemplar licenciado. */
    var phiL = opc.phiOutroMm ? Math.min(phiMm, opc.phiOutroMm) : phiMm, phiMax = opc.phiOutroMm ? Math.max(phiMm, opc.phiOutroMm) : phiMm; phiMm = phiL;
    var V = VG(), R = [], anc = V.ancoragemNecessaria(phiMm, mat, opc.AsCalc != null ? opc.AsCalc : 1, opc.AsEf != null ? opc.AsEf : 1, { aderencia: opc.aderencia || "boa", gancho: false });
    var al = alfa0t(pct), avisos = [], ok = true;
    var min = Math.max(cv("traspasseMinFracaoLb", 0.3) * al * anc.lb, cv("traspasseMinPhi", 15) * phiMm / 10, cv("traspasseMinMm", 200) / 10);
    var l0t = Math.max(al * anc.lbNec, min);
    if (phiMax > cv("traspasseBitolaMaxMm", 32)) { ok = false; avisos.push("φ " + fmt(phiMax, 1) + " mm > 32 mm: emenda por traspasse não permitida (9.5.2); use luva ou solda."); }
    var dl = num(opc.distLivreCm, 0), lim = cv("traspasseDistLivrePhi", 4) * phiMm / 10;
    if (dl > lim + 1e-9) { l0t += dl; passo(R, "tr.dl", "Distância livre acrescida", dl, "cm", "distância livre > 4φ: soma-se ao ℓ0t", "NBR 6118 9.5.2.2.2"); }
    var max = opc.camadas > 1 ? cv("traspasseProporcaoMaisCamadas", 0.5) : cv("traspasseProporcaoUmaCamada", 1.0);
    if (pct / 100 > max + 1e-9) avisos.push("Proporção de barras emendadas na mesma seção (" + fmt(pct, 0) + " %) acima da Tabela 9.3 (" + fmt(100 * max, 0) + " %): justifique (9.5.2.1).");
    passo(R, "tr.a0t", "Coeficiente α0t", al, "-", "Tabela 9.4, " + fmt(pct, 0) + " % de barras emendadas na mesma seção", "NBR 6118 9.5.2.2.1");
    passo(R, "tr.min", "Traspasse mínimo", min, "cm", "ℓ0t,mín = max(0,3·α0t·ℓb; 15φ; 20 cm)", "NBR 6118 9.5.2.2.1");
    passo(R, "tr.l0t", "Comprimento de traspasse (tração)", l0t, "cm", "ℓ0t = α0t·ℓb,nec ≥ ℓ0t,mín", "NBR 6118 9.5.2.2.1");
    return { ok: ok, l0t: l0t, l0tMin: min, alfa0t: al, lb: anc.lb, lbNec: anc.lbNec, phiLimiar: phiMax, passos: R, avisos: avisos, pendencia: opc.phiOutroMm ? "9.5.2.1: 'menor diâmetro' só para o ℓ0; limiares pelo maior — conferir a p. 60 da 6118:2023 no exemplar licenciado" : null };
  }
  /* barras COMPRIMIDAS (9.5.2.3): ℓ0c = ℓb,nec ≥ ℓ0c,mín = max(0,6·ℓb; 15φ; 200 mm); sempre sem gancho (9.4.2.1); todas as barras podem ser emendadas na mesma seção (nota da Tabela 9.3) */
  function traspasseComprimida(phiMm, mat, opc) {
    opc = opc || {};
    var phiMax = opc.phiOutroMm ? Math.max(phiMm, opc.phiOutroMm) : phiMm; if (opc.phiOutroMm) phiMm = Math.min(phiMm, opc.phiOutroMm);   /* ℓ0 pelo MENOR; limiar de 32 mm pelo MAIOR (ver traspasseTracionada) */
    var V = VG(), R = [], anc = V.ancoragemNecessaria(phiMm, mat, opc.AsCalc != null ? opc.AsCalc : 1, opc.AsEf != null ? opc.AsEf : 1, { aderencia: opc.aderencia || "boa", gancho: false }), avisos = [], ok = true;
    var min = Math.max(cv("traspasseCompMinFracaoLb", 0.6) * anc.lb, cv("traspasseMinPhi", 15) * phiMm / 10, cv("traspasseMinMm", 200) / 10), l0c = Math.max(anc.lbNec, min);
    if (phiMax > cv("traspasseBitolaMaxMm", 32)) { ok = false; avisos.push("φ " + fmt(phiMax, 1) + " mm > 32 mm: emenda por traspasse não permitida (9.5.2)."); }
    passo(R, "tc.min", "Traspasse mínimo (compressão)", min, "cm", "ℓ0c,mín = max(0,6·ℓb; 15φ; 20 cm)", "NBR 6118 9.5.2.3");
    passo(R, "tc.l0c", "Comprimento de traspasse (compressão)", l0c, "cm", "ℓ0c = ℓb,nec ≥ ℓ0c,mín", "NBR 6118 9.5.2.3");
    return { ok: ok, l0c: l0c, l0cMin: min, lb: anc.lb, lbNec: anc.lbNec, passos: R, avisos: avisos };
  }
  /* armadura transversal na emenda (9.5.2.4): φ ≥ 16 mm ou ≥ 25 % emendadas → ΣAst ≥ área de UMA barra emendada (mesmo aço), nos terços extremos do ℓ0; compressão: uma barra 4φ além.
   * Devolve quantos estribos cabem em cada terço com o espaçamento corrente e quantos faltam (extras). nPernas = ramos paralelos ao plano da emenda por estribo. */
  function transversalEmenda(phiMm, pct, l0, phiTmm, sCorrente, nPernas, comprimida) {
    var R = [], exige = phiMm >= cv("traspasseTransversalPhiLimiar", 16) || pct / 100 >= cv("traspasseTransversalProporcaoLimiar", 0.25) - 1e-9, terco = l0 * cv("traspasseTransversalTerco", 1 / 3);
    var A1 = areaBarra(phiMm), At = areaBarra(phiTmm) * (nPernas || 2), nTerco = Math.floor(terco / sCorrente + 1e-9) + 1;
    if (!exige) { passo(R, "te.ex", "Armadura transversal da emenda", 0, "-", "φ < 16 mm e < 25 % emendadas: basta o 9.4.2.6", "NBR 6118 9.5.2.4.1"); return { exige: false, extras: 0, nTerco: nTerco, passos: R }; }
    var precisa = Math.ceil(A1 / (2 * At) - 1e-9), extras = Math.max(0, precisa - nTerco);
    passo(R, "te.Ast", "ΣAst exigida (uma barra emendada)", A1, "cm²", "ΣAst ≥ A_barra; ΣAst/2 em cada terço de ℓ0; estribos por terço: " + nTerco + " (corrente), " + precisa + " (necessário)", "NBR 6118 9.5.2.4.1" + (comprimida ? " e 9.5.2.4.2" : ""));
    return { exige: true, extras: extras, nTerco: nTerco, nPrecisa: precisa, terco: terco, alemEstribo: comprimida ? cv("traspasseTransversalCompPhiAlem", 4) * phiMm / 10 : 0, passos: R };
  }

  /* ---------------------------------------------------------------- apoio extremo (Em1 18.3.2.4-b) e grampo de ancoragem (Bastos) */
  /* Fsd = MSd/z + (aℓ/d)·VSd + NSd, nunca menor que (aℓ/d)·VSd + NSd; MSd = momento POSITIVO na extremidade do vão efetivo (negativo ou nulo: vale só o piso); cm, kN. */
  function forcaApoioExtremo(a) {
    var R = [], d = a.d, z = a.z || 0.9 * d, M = Math.max(num(a.MSd, 0), 0), V = Math.abs(num(a.VSd, 0)), N = num(a.NSd, 0);
    var piso = (a.al / d) * V + N, F = Math.max(M / z + piso, piso), fyd = a.fyd;
    passo(R, "ap.F", "Força de tração a ancorar no apoio extremo", F, "kN", "Fsd = MSd/z + (aℓ/d)·VSd + NSd ≥ (aℓ/d)·VSd + NSd; MSd = " + fmt(r2(M), 1) + " kN·cm, z = " + fmt(r2(z), 1) + " cm, aℓ = " + fmt(r2(a.al), 1) + " cm", "NBR 6118:2023/Em1:2026 18.3.2.4-b");
    passo(R, "ap.As", "Armadura a ancorar", F / fyd, "cm²", "As,anc = Fsd/fyd", "NBR 6118:2023/Em1:2026 18.3.2.4-b");
    return { Fsd: F, piso: piso, As: F / fyd, passos: R };
  }
  /* alternativa do Bastos quando o gancho não cabe: grampo de φ gr que completa As,corr = 0,7·ℓb·As,anc/(ℓb,ef − φgr) (cm², cm) */
  function grampoAncoragem(AsAnc, AsEf, lb, lbEf, phiGrMm, opc) {
    opc = opc || {};
    var R = [], alfa = cv("lbAlphaGancho", 0.7), corr = alfa * lb * AsAnc / (lbEf - phiGrMm / 10), AsGr = Math.max(corr - AsEf, 0), a1 = areaBarra(phiGrMm), nBarras = Math.ceil(AsGr / a1 - 1e-9), ramos = nBarras + (nBarras % 2);
    passo(R, "gr.corr", "Armadura corrigida a ancorar com gancho", corr, "cm²", "As,corr = α·ℓb·As,anc/(ℓb,ef − φgr), α = " + alfa, "Bastos, Vigas, 19.11.1 (Eq. 45)");
    passo(R, "gr.As", "Área do grampo", AsGr, "cm²", "As,gr = As,corr − As,ef", "Bastos, Vigas, 19.11.1 (Eq. 46)");
    return { AsCorr: corr, AsGrampo: AsGr, nRamos: ramos, nGrampos: ramos / 2, AsGrampoEf: ramos * a1, comprimentoCm: cv("grampoAncoragemComprimentoPhi", 100) * phiGrMm / 10, passos: R };
  }
  /* suspensão (18.3.6 Em1): Asusp = Rd·(1 − hsusp/hviga de apoio)/fyd; ≥ 75 % nas faixas de h/2 de cada lado da viga apoiada, ≤ 25 % na interseção. cm, kN. */
  function suspensao(RdKN, hApoioCm, hSuspCm, fydKNcm2, phiTmm, nPernas) {
    var R = [], fator = Math.max(0, 1 - num(hSuspCm, 0) / hApoioCm), As = RdKN * fator / fydKNcm2, At = areaBarra(phiTmm) * (nPernas || 2), n = Math.ceil(As / At - 1e-9);
    passo(R, "su.f", "Fator de redução da suspensão", fator, "-", "1 − hsusp/hviga de apoio = 1 − " + fmt(r2(num(hSuspCm, 0)), 1) + "/" + fmt(r2(hApoioCm), 1), "NBR 6118:2023/Em1:2026 18.3.6");
    passo(R, "su.As", "Armadura de suspensão", As, "cm²", "Asusp = Rd·fator/fyd", "NBR 6118:2023/Em1:2026 18.3.6");
    return { fator: fator, Asusp: As, nEstribos: n, AsLateral: cv("suspensaoFracaoLateral", 0.75) * As, AsInterseccao: cv("suspensaoFracaoInterseccao", 0.25) * As, zonaLateralCm: cv("suspensaoZonaFracaoH", 0.5) * hApoioCm,
             nLateral: Math.ceil(cv("suspensaoFracaoLateral", 0.75) * n - 1e-9), passos: R };
  }

  /* ---------------------------------------------------------------- cobertura do diagrama (18.3.2.3.1, Figura 18.3) */
  /* curva(x[cm], M[kN·cm]) → vetor por cm (0..N), interpolação linear das estações */
  function curva(x, M, Lcm) {
    var N = Math.round(Lcm), o = [], i, k = 0;
    for (i = 0; i <= N; i++) {
      while (k < x.length - 2 && x[k + 1] < i) k++;
      var x0 = x[k], x1 = x[Math.min(k + 1, x.length - 1)], t = x1 > x0 ? Math.max(0, Math.min(1, (i - x0) / (x1 - x0))) : 0;
      o.push(M[k] + (M[Math.min(k + 1, x.length - 1)] - M[k]) * t);
    }
    return o;
  }
  /* decalagem do diagrama (17.4.2.2): em cada seção vale o maior valor da curva a ±a (cm) */
  function decalar(v, a) {
    var N = v.length - 1, o = [], i, j, m;
    a = Math.round(a);
    for (i = 0; i <= N; i++) { m = -Infinity; for (j = Math.max(0, i - a); j <= Math.min(N, i + a); j++) if (v[j] > m) m = v[j]; o.push(m); }
    return o;
  }
  /* faixa [l, r] (cm) onde v passa do nível; desde0 = só a faixa contígua que COMEÇA em 0 (o apoio): momento negativo junto ao apoio, sem pegar o apoio do outro lado */
  function regiao(v, nivel, incluiIgual, desde0) {
    var l = -1, r = -1, i, ok;
    for (i = 0; i < v.length; i++) {
      ok = incluiIgual ? v[i] >= nivel - 1e-9 : v[i] > nivel + 1e-9;
      if (desde0) { if (ok) { if (l < 0) l = 0; r = i; } else break; }
      else if (ok) { if (l < 0) l = i; r = i; }
    }
    return l < 0 ? null : [l, r];
  }
  /* cobre o diagrama (v = momento decalado ≥ 0, por cm a partir da origem) com grupos de barras. grupos = [n1, n2…] da mais longa para a mais curta; MRd(k) = momento resistente de k barras.
   * Para o grupo g (k_ant barras antes dele, k_cum com ele): B = região onde v > MRd(k_ant) (barras do grupo necessárias); A = onde v ≥ min(MRd(k_cum); pico) (grupo a plena carga).
   * Extremos: ini = min(A_esq − ℓb; B_esq − 10φ) e fim = max(A_dir + ℓb; B_dir + 10φ) — o ponto A abre o trecho de ancoragem, B o ponto de tensão nula (Figura 18.3). */
  function cobrir(v, grupos, MRd, phiMm, lb, desde0) {
    var pico = -Infinity, i, kAnt = 0, out = [], dez = 10 * phiMm / 10, N0 = v.length;
    for (i = 0; i < N0; i++) if (v[i] > pico) pico = v[i];
    if (desde0) { pico = v[0]; for (i = 0; i < N0 && (i === 0 || v[i] <= v[i - 1] + 1e-9); i++) pico = Math.max(pico, v[i]); }
    grupos.forEach(function (n, g) {
      var kCum = kAnt + n, B = regiao(v, kAnt > 0 ? MRd(kAnt) : 0, false, desde0), A = regiao(v, Math.min(MRd(kCum), pico * (1 - 1e-9)), true, desde0), o = { grupo: g + 1, n: n, kAnt: kAnt, kCum: kCum, B: B, A: A };
      if (!B || !A) o.semNecessidade = true;
      else { o.ini = Math.min(A[0] - lb, B[0] - dez); o.fim = Math.max(A[1] + lb, B[1] + dez); }
      out.push(o); kAnt = kCum;
    });
    return out;
  }

  /* ---------------------------------------------------------------- posições e tabela de aço */
  function criarPos(lista, o) {
    var p = { id: "N" + (lista.length + 1), elemento: o.elemento, tipo: o.tipo, nome: o.nome, phi: o.phi, aco: acoDe(o.phi, o.aco), qtd: o.qtd, comprimentoCm: o.comprimentoCm, ganchos: o.ganchos || [], trecho: o.trecho || null, criterios: o.criterios || [], obs: o.obs || null };
    if (o.dobras != null) p.dobras = o.dobras;
    if (o.lado) p.lado = o.lado;
    /* C8 (pranchas): o que o desenho precisa e o texto não dá — espaçamento (cm), direção/borda da laje e zonas de estribo; só acrescenta campos, nada muda nos números */
    if (o.s != null) p.s = o.s;
    if (o.dir) p.dir = o.dir;
    if (o.borda) p.borda = o.borda;
    if (o.zonas) p.zonas = o.zonas;
    p.totalM = p.qtd * p.comprimentoCm / 100; p.kg = p.totalM * massaLinear(p.phi);
    lista.push(p); return p;
  }
  /* tabela de aço: linhas por posição e RESUMO por bitola e classe (comprimento total, kg líquido, kg com perda). opc.perda (fração; padrão acoPerdaFracao = 10 %) */
  function tabelaAco(posicoes, opc) {
    opc = opc || {};
    var perda = opc.perda != null ? opc.perda : cv("acoPerdaFracao", 0.10), linhas = [], res = {}, tot = 0, porAco = {};
    arr(posicoes).forEach(function (p) {
      var kg = p.qtd * p.comprimentoCm / 100 * massaLinear(p.phi);
      linhas.push({ id: p.id, elemento: p.elemento, nome: p.nome, aco: p.aco, phi: p.phi, qtd: p.qtd, comprimentoCm: p.comprimentoCm, totalM: p.qtd * p.comprimentoCm / 100, kg: kg });
      var k = p.aco + "|" + p.phi, r = res[k] || (res[k] = { aco: p.aco, phi: p.phi, massaLinear: massaLinear(p.phi), comprimentoM: 0, kg: 0 });
      r.comprimentoM += p.qtd * p.comprimentoCm / 100; r.kg += kg; tot += kg; porAco[p.aco] = (porAco[p.aco] || 0) + kg;
    });
    var resumo = Object.keys(res).map(function (k) { var r = res[k]; r.kgComPerda = r.kg * (1 + perda); return r; }).sort(function (a, b) { return a.aco < b.aco ? -1 : a.aco > b.aco ? 1 : a.phi - b.phi; });
    return { linhas: linhas, resumo: resumo, totalKg: tot, perda: perda, totalKgComPerda: tot * (1 + perda), porAco: porAco, rotulo: ROTULO, massa: "φ²·" + cv("massaLinearCoef", 0.006165) + " kg/m (Tabela A-3 do Bastos, NBR 7480)" };
  }

  /* ---------------------------------------------------------------- VIGA: um tramo */
  /* t = resultado de ConcViga.dimensionarTramo (ok); opc.diag = { x:[m], Mpos:[kN·m ≥ 0], Mneg:[kN·m ≥ 0 (módulo)], V:[kN ≥ 0] } (envoltória ELU ao longo do tramo, de apoio a apoio);
   * opc.elemento (rótulo), opc.suspensoes = [{ id, RdKN, hApoioCm, hSuspCm }], opc.passoCm, opc.contagem ("arredondar" = como o livro), opc.ganchoPositivaCm (força o comprimento do gancho). */
  function detalharTramo(t, opc) {
    opc = opc || {};
    var V = VG(), R = [], pos = [], avisos = [], pend = [], out = { id: t && t.id, ok: false, posicoes: pos, avisos: avisos, pendencias: pend, passos: R, rotulo: ROTULO };
    if (!t || !t.ok || !t.entrada || !t.trechos) { out.motivo = "tramo sem resultado do dimensionamento (C2)"; return out; }
    var en = t.entrada, mat = matDe(en.fck, en.fyk, {}); if (!mat.ok) { out.motivo = mat.motivo; return out; }
    var el = opc.elemento || ("viga " + (t.id || "")), L = en.L, bw = en.bw, h = en.h, cob = en.cobrimento, p = passoCm(opc), tr = t.trechos, pp = tr.positivo, T = en.mesa;
    var dRef = pp && pp.d ? pp.d : (tr.negEsq && tr.negEsq.d) || (tr.negDir && tr.negDir.d) || (h - cob - 2), dCis = Math.min(pp && pp.d || dRef, tr.negEsq && tr.negEsq.d || dRef, tr.negDir && tr.negDir.d || dRef);
    var phiT = t.cisalhamento && t.cisalhamento.meio && t.cisalhamento.meio.estribo ? Math.max(t.cisalhamento.esq.estribo.phi, t.cisalhamento.meio.estribo.phi, t.cisalhamento.dir.estribo.phi) : 6.3;
    var ap = t.apoios || {}, larg = {}, tipoAp = {};
    ["esq", "dir"].forEach(function (k) { var i = ap[k] || {}; larg[k] = i.larg != null ? i.larg : (i.disponivel != null ? i.disponivel + cob : (opc.largurasCm && opc.largurasCm[k] != null ? opc.largurasCm[k] : null)); tipoAp[k] = i.tipo || "extremo"; });
    var d = opc.diag, MxS = d ? (d.Mmax || d.Mpos) : null, diagOk = !!(d && arr(d.x).length >= 2 && arr(MxS).length === d.x.length), xcm = diagOk ? d.x.map(function (v) { return v * 100; }) : null, curvaPos = null, curvaNeg = null;
    if (diagOk) {
      curvaPos = curva(xcm, MxS.map(function (v) { return v * 100; }), L).map(function (v) { return Math.max(v, 0); });
      curvaNeg = curva(xcm, (d.Mmin ? d.Mmin.map(function (v) { return -v * 100; }) : arr(d.Mneg).map(function (v) { return v * 100; })), L).map(function (v) { return Math.max(v, 0); });
    }
    /* decalagem aℓ: a do apoio calculada pelo C2 (17.4.2.2); se faltar, vale aℓ = d (o valor MÁXIMO da norma, a favor da segurança — NUNCA 0,5d nem 0) e fica pendência */
    var dE = ap.esq && ap.esq.decalagem ? ap.esq.decalagem.a : null, dD = ap.dir && ap.dir.decalagem ? ap.dir.decalagem.a : null;
    var al = Math.max(dE != null ? dE : dCis, dD != null ? dD : dCis);
    if (dE == null || dD == null) pend.push("Decalagem do apoio ausente no resultado do tramo: adotado aℓ = d = " + fmt(r2(dCis), 1) + " cm (máximo do 17.4.2.2, a favor da segurança) — conferir.");
    if (opc.aDecalagem != null) al = opc.aDecalagem;
    passo(R, "dc.a", "Decalagem do diagrama", al, "cm", "a = maior dos dois apoios (17.4.2.2); sem o valor do apoio, aℓ = d", "NBR 6118 17.4.2.2");
    var ext = { esq: 0, dir: 0 }, gancho = { esq: 0, dir: 0 };

    /* --- extensões nos apoios das barras positivas que chegam (ancoragem desde a FACE do apoio, 18.3.2.4.1 / Em1) */
    function extensaoApoio(lado, phi) {
      var i = ap[lado] || {}, lg = larg[lado], gl = null;
      if (tipoAp[lado] === "intermediario") {
        var e = Math.max(cv("apoioInternoAlemEixoCm", 5), lg != null ? cv("apoioIntermediarioLbPhi", 10) * phi / 10 - lg / 2 : 0);
        /* risco de momento positivo no apoio intermediário: informado por opc OU visto pelo motor (a armadura do momento positivo no apoio, As,apoio(a) > 0, vem de apoios[lado].As.AsB) */
        var risco = opc.riscoMomentoPositivo === true || !!(i.As && i.As.intermediario && i.As.AsB > 1e-9);
        if (risco) { var tl = traspasseTracionada(phi, mat, 50, { aderencia: "boa", camadas: 1 }); e = Math.max(e, tl.l0t / 2); avisos.push("Apoio " + lado + " intermediário com risco de momento positivo (vento, recalque): as barras devem ser CONTÍNUAS ou emendadas sobre o apoio (18.3.2.4.1 Em1) — ℓ0t = " + fmt(r2(tl.l0t), 1) + " cm com 50 % emendadas; o 10φ não vale — a barra passa " + fmt(r2(e), 1) + " cm do eixo (metade do traspasse, emendando com a do tramo vizinho)."); }
        return { ext: e, gancho: 0, risco: risco, regra: risco ? "apoio intermediário COM risco de momento positivo: barra emendada sobre o apoio (ℓ0t/2 de cada lado, 18.3.2.4.1 Em1 e 9.5.2)" : "apoio intermediário: ≥ 10φ da face e 5 cm além do eixo (só sem risco de momento positivo, 18.3.2.4.1 Em1)" };
      }
      var usaGancho = !!(i.exigeGancho || i.comGancho);
      if (lg != null) gl = usaGancho ? (opc.ganchoPositivaCm != null ? opc.ganchoPositivaCm : ganchoTracao(phi, 90, opc)) : 0;
      return { ext: lg != null ? lg / 2 - cob : 10, gancho: gl || 0, regra: "apoio extremo: reta até a face externa − cobrimento" + (usaGancho ? " e gancho a 90° (ponta ≥ 8φ)" : "") + "; ancoragem desde a face (18.3.2.4.1 Em1)" };
    }

    /* --- barras positivas */
    var nPos = 0, camadasPos = [];
    if (pp && pp.barras) {
      var B = pp.barras, A1 = areaBarra(B.phi), phi = B.phi, kA = Math.max(2, (ap.esq && ap.esq.nBarras) || 0, (ap.dir && ap.dir.nBarras) || 0); kA = Math.min(kA, B.n); nPos = B.n;
      var secP = { bw: bw, h: h, d: pp.d, dl: pp.dl, bf: T ? en.bf : 0, hf: T ? en.hf : 0 }, AsL = t.trechos.positivo.barrasLinha ? t.trechos.positivo.barrasLinha.AsEf : 0;
      function MRdP(k) { return V.resistente(secP, k * A1, AsL, mat).Mrd; }
      var ancP = V.ancoragemBasica(phi, mat, { aderencia: V.aderencia(h, B.acg, false) }), lbP = ancP.lb;
      /* Em1 18.3.2.4-b: Fsd com o momento positivo no apoio; confere as barras que chegam */
      ["esq", "dir"].forEach(function (lado) {
        var i = ap[lado]; if (!i || !i.As || tipoAp[lado] !== "extremo") return;
        var Mapoio = diagOk ? Math.max(lado === "esq" ? curvaPos[0] : curvaPos[curvaPos.length - 1], 0) : 0, Vs = lado === "esq" ? num(t.esforcos.Vesq, 0) : num(t.esforcos.Vdir, 0);
        var fa = forcaApoioExtremo({ MSd: Mapoio, z: 0.9 * pp.d, al: i.decalagem ? i.decalagem.a : al, d: pp.d, VSd: Vs, NSd: 0, fyd: mat.fyd }), nec = Math.max(fa.As, i.As.AsC || 0), nN = Math.ceil(nec / A1 - 1e-9);
        R.push({ id: "apx." + lado, nome: "Em1 18.3.2.4-b, apoio " + lado, valor: fa.As, unidade: "cm²", formula: fa.passos[0].formula, item: "NBR 6118:2023/Em1:2026 18.3.2.4-b" });
        if (nN > kA) { if (nN <= B.n) { kA = nN; avisos.push("Apoio " + lado + ": Em1 18.3.2.4-b pede " + fmt(r2(nec), 2) + " cm² (MSd positivo no apoio): " + nN + " barras levadas ao apoio."); } else avisos.push("Apoio " + lado + ": Em1 18.3.2.4-b pede " + fmt(r2(nec), 2) + " cm² > As,ef do vão — NÃO ATENDE: prolongue mais barras."); }
      });
      var grp = [kA]; if (B.n > kA) { var resto = B.n - kA, c1 = Math.max(0, (B.camadas[0] || 0) - kA); if (c1 > 0 && c1 < resto) { grp.push(c1); resto -= c1; } if (resto > 0) grp.push(resto); }
      var eE = extensaoApoio("esq", phi), eD = extensaoApoio("dir", phi); ext.esq = eE.ext; ext.dir = eD.ext; gancho.esq = eE.gancho; gancho.dir = eD.gancho;
      var cortes = null;
      if (diagOk && grp.length > 1) {
        var Mv = decalar(curvaPos, al);
        cortes = cobrir(Mv, grp, MRdP, phi, lbP);
        out.cobertura = { positiva: cortes, decalagem: al, lb: lbP };
      } else if (grp.length > 1) avisos.push("Sem o diagrama de momentos: barras positivas corridas de apoio a apoio (sem corte).");
      /* grupo 1: barras corridas até os apoios */
      var cFull = L + eE.ext + eD.ext + eE.gancho + eD.gancho;
      var gFull = grp[0];
      grp.forEach(function (n, g) {
        if (g === 0) return;
        var c = cortes && cortes[g], full = !c || c.semNecessidade || (c.ini <= 0 && c.fim >= L);
        if (full) { gFull += n; if (c && c.semNecessidade) avisos.push("Barras do grupo " + (g + 1) + " não são necessárias pelo diagrama (As,mín): levadas corridas."); return; }
        var xi = c.ini < 0 ? -eE.ext : c.ini, xf = c.fim > L ? L + eD.ext : c.fim, comp = acima(xf - xi + (c.ini < 0 ? eE.gancho : 0) + (c.fim > L ? eD.gancho : 0), p);
        criarPos(pos, { elemento: el, tipo: "positiva-cortada", nome: "Positiva cortada (grupo " + (g + 1) + ")", phi: phi, qtd: n, comprimentoCm: comp, trecho: [xi, xf], ganchos: [],
          criterios: ["lbAlphaGancho", "lb25Phi"], obs: "extremos = max(A ± ℓb; B ± 10φ) sobre o diagrama decalado de a = " + fmt(r2(al), 1) + " cm (18.3.2.3.1, ℓb = " + fmt(r2(lbP), 1) + " cm)" });
      });
      criarPos(pos, { elemento: el, tipo: "positiva-corrida", nome: "Positiva até os apoios", phi: phi, qtd: gFull, comprimentoCm: acima(cFull, p), trecho: [-eE.ext, L + eD.ext],
        ganchos: [eE.gancho ? { lado: "esq", angulo: 90, pontaCm: eE.gancho } : null, eD.gancho ? { lado: "dir", angulo: 90, pontaCm: eD.gancho } : null].filter(Boolean),
        criterios: ["apoioExtremoForcaEm1", "ganchoTracao90Phi", "apoioInternoAlemEixoCm"], obs: eE.regra + " | " + eD.regra });
      pos.unshift(pos.pop()); pos.forEach(function (q, i) { q.id = "N" + (i + 1); });
    }

    /* --- barras negativas nos dois apoios */
    var negCorner = { esq: null, dir: null };
    [["esq", tr.negEsq, 1], ["dir", tr.negDir, -1]].forEach(function (a) {
      var lado = a[0], n = a[1]; if (!n || !n.barras) return;
      var Bn = n.barras, phi = Bn.phi, A1 = areaBarra(phi), secN = { bw: bw, h: h, d: n.d, dl: n.dl || 4, bf: 0, hf: 0 };
      function MRdN(k) { return V.resistente(secN, k * A1, 0, mat).Mrd; }
      var ancN = V.ancoragemBasica(phi, mat, { aderencia: V.aderencia(h, h - Bn.acg, false) }), lbN = ancN.lb, lg = larg[lado], interm = tipoAp[lado] === "intermediario";
      var grp = Bn.camadas && Bn.camadas.length > 1 ? Bn.camadas.slice() : (Bn.n > 3 ? [2, Bn.n - 2] : [Bn.n]);
      var cortes = null;
      if (diagOk) {
        var vv = curvaNeg.slice();
        if (lado === "dir") vv.reverse();
        vv = decalar(vv, al);
        cortes = cobrir(vv, grp, MRdN, phi, lbN, true);
        (out.cobertura = out.cobertura || {})["negativa-" + lado] = cortes;
      } else avisos.push("Sem o diagrama de momentos: barras negativas do apoio " + lado + " levadas ao meio do vão (L/2).");
      var fora = interm ? 0 : (lg != null ? lg / 2 - cob : 10), gl = interm ? 0 : Math.min(cv("ganchoNegativaExtremoPhi", 35) * phi / 10, h - 2 * cob);
      if (!interm && lg != null) {   /* Em1 18.3.2.4-d: a negativa do apoio extremo ancora desde a FACE (18.3.2.4.1): trecho reto ≤ largura do apoio − cobrimento */
        var AsC = n.AsCalc != null ? Math.min(n.AsCalc, Bn.AsEf) : Bn.AsEf, aN = V.ancoragemNecessaria(phi, mat, AsC, Bn.AsEf, { aderencia: V.aderencia(h, h - Bn.acg, false), gancho: true }), tN = V.lbApoioExtremo(aN.lbNec, phi);
        passo(R, "an." + lado, "Ancoragem da negativa no apoio extremo " + lado, tN.valor, "cm", "max(ℓb,nec com gancho; r + 5,5φ; 6 cm) ≤ " + fmt(r2(lg - cob), 1) + " cm (largura − c, desde a face)", "NBR 6118:2023/Em1:2026 18.3.2.4-d e 18.3.2.4.1");
        if (tN.valor > lg - cob + 1e-9) avisos.push("Apoio " + lado + ": a negativa precisa de " + fmt(r2(tN.valor), 1) + " cm desde a face e o apoio só tem " + fmt(r2(lg - cob), 1) + " cm — NÃO ATENDE (18.3.2.4-d): alargue o apoio ou reduza φ.");
      }
      grp.forEach(function (nb, g) {
        var c = cortes && cortes[g], extInt = c && !c.semNecessidade ? Math.max(c.fim, 0) : (c ? Math.max(c.fim || 0, 0) : L / 2);
        if (c && c.semNecessidade) extInt = L / 2;
        extInt = Math.min(extInt, L);
        var comp = acima(fora + extInt + gl, p);
        criarPos(pos, { elemento: el, tipo: interm ? "negativa-meia-barra" : "negativa", lado: lado, nome: "Negativa apoio " + lado + (grp.length > 1 ? " (grupo " + (g + 1) + ")" : ""), phi: phi, qtd: nb, comprimentoCm: comp, trecho: lado === "esq" ? [-fora, extInt] : [L - extInt, L + fora],
          ganchos: gl ? [{ lado: lado, angulo: 90, pontaCm: gl, pinoMm: cv("pinoNegativaExtremoPhi", 15) * phi }] : [], criterios: ["ganchoNegativaExtremoPhi", "pinoNegativaExtremoPhi", "lb25Phi"],
          obs: (interm ? "meia barra: continua no tramo vizinho (somar as duas metades no apoio intermediário); " : "") + "extremo = max(A + ℓb; B + 10φ) do diagrama negativo decalado (ℓb = " + fmt(r2(lbN), 1) + " cm, má aderência)" });
        pos[pos.length - 1].extInterna = extInt;
        if (g === 0) negCorner[lado] = { ext: extInt, phi: phi };
      });
    });

    /* --- porta-estribos (e barras de amarração, 18.3.3.2 Em1): 2 barras nos cantos superiores; entre as negativas, com transpasse construtivo */
    var phiPE = (function () { var l = cv("bitolasMm", []).filter(function (q) { return q >= Math.max(cv("portaEstriboPhiMinMm", 6.3), phiT * cv("amarracaoPhiMinFracaoEstribo", 1)) - 1e-9; }); return l.length ? l[0] : 8; })();
    var tc = cv("transpasseConstrutivoCm", 40), xL = negCorner.esq ? negCorner.esq.ext : -ext.esq, xR = negCorner.dir ? L - negCorner.dir.ext : L + ext.dir, gap = xR - xL;
    var nPE = cv("portaEstriboNumero", 2), dupla = t.trechos.positivo && t.trechos.positivo.barrasLinha;
    if (!dupla && gap > 0) criarPos(pos, { elemento: el, tipo: "porta-estribo", nome: "Porta-estribo", phi: phiPE, qtd: nPE, comprimentoCm: acima(gap + 2 * tc, p), trecho: [xL - tc, xR + tc],
      criterios: ["portaEstriboNumero", "transpasseConstrutivoCm", "amarracaoPhiMinFracaoEstribo"], obs: "ocupa o vão entre as negativas com " + tc + " cm de transpasse construtivo em cada ponta (Bastos, Figura 100); φ ≥ φ do estribo (18.3.3.2 Em1)" });
    else if (dupla) { var bl = t.trechos.positivo.barrasLinha; criarPos(pos, { elemento: el, tipo: "armadura-comprimida", nome: "Armadura de compressão (A's) corrida", phi: bl.phi, qtd: bl.n, comprimentoCm: acima(L + ext.esq + ext.dir, p), trecho: [-ext.esq, L + ext.dir], criterios: ["amarracaoPhiMinFracaoEstribo"], obs: "A's da armadura dupla corrida de apoio a apoio (também amarra os cantos dos estribos)" }); }
    passo(R, "am.phi", "Barras de amarração dos cantos do estribo", phiPE, "mm", "φ ≥ φ do estribo = " + fmt(phiT, 1) + " mm; cantos inferiores: barras positivas φ " + fmt(pp && pp.barras ? pp.barras.phi : 0, 1), "NBR 6118:2023/Em1:2026 18.3.3.2");
    if (pp && pp.barras && pp.barras.phi + 1e-9 < phiT) avisos.push("Barras positivas de canto com φ menor que o estribo: viola 18.3.3.2 (Em1).");

    /* --- estribos por zona de cortante */
    var cis = t.cisalhamento, nEst = 0;
    if (cis && cis.meio && cis.meio.estribo) {
      var Lf = L - (larg.esq != null ? larg.esq / 2 : 0) - (larg.dir != null ? larg.dir / 2 : 0), x0 = larg.esq != null ? larg.esq / 2 : 0, aco = (cis.meio.estribo.aco === "CA60" || cis.meio.estribo.phi <= cv("acoCA60PhiMaxMm", 5)) ? "CA-60" : "CA-50";
      var Cest = comprimentoEstribo(bw, h, cob, phiT, 135), esq = cis.esq.estribo, mei = cis.meio.estribo, dir = cis.dir.estribo, zonas = [];
      var capMeio = cis.meio.Vc + mei.AswSEf / 100 * cv("bracoZCoef", 0.9) * dCis * cis.meio.fywd, zE = 0, zD = 0;
      if (diagOk && arr(d.V).length === d.x.length) {
        var Vs = curva(xcm, d.V, L), i;
        for (i = 0; i <= L; i++) { if (Vs[i] > capMeio + 1e-9) zE = i; else break; }
        for (i = L; i >= 0; i--) { if (Vs[i] > capMeio + 1e-9) zD = L - i; else break; }
        zE = Math.max(0, acima(zE - x0, 5)); zD = Math.max(0, acima(zD - (larg.dir != null ? larg.dir / 2 : 0), 5));
        if (zE + zD > Lf) { zE = Math.min(zE, Lf); zD = Math.max(0, Lf - zE); }
        out.zonasEstribo = { esq: zE, dir: zD, capacidadeMeioKN: capMeio };
      } else { avisos.push("Sem o diagrama de V: estribo mais exigente (menor s) no vão inteiro."); }
      function pior(a, b) { return (a.AswSEf >= b.AswSEf) ? a : b; }
      if (diagOk && arr(d.V).length === d.x.length) {
        zonas = [{ nome: "extremo esq.", len: zE, e: esq }, { nome: "meio", len: Lf - zE - zD, e: mei }, { nome: "extremo dir.", len: zD, e: dir }];
      } else zonas = [{ nome: "vão inteiro", len: Lf, e: pior(pior(esq, mei), dir) }];
      var agrup = {}, xZ = x0;
      zonas.forEach(function (z) {
        var xIni = xZ; xZ += Math.max(z.len, 0);
        if (!(z.len > 1e-9)) return;
        var e = z.e, n = conta(z.len, e.s, opc), chave = e.phi + "|" + e.s;
        agrup[chave] = agrup[chave] || { phi: e.phi, s: e.s, n: 0, partes: [], zonas: [] };
        agrup[chave].n += n; agrup[chave].partes.push(z.nome + " " + fmt(r2(z.len), 0) + " cm");
        agrup[chave].zonas.push({ nome: z.nome, x0: xIni, len: z.len, n: n });
      });
      Object.keys(agrup).forEach(function (k) {
        var g = agrup[k], Cg = comprimentoEstribo(bw, h, cob, g.phi, 135);
        criarPos(pos, { elemento: el, tipo: "estribo", nome: "Estribo φ " + fmt(g.phi, 1) + " c/" + fmt(g.s, 1), phi: g.phi, aco: acoDe(g.phi, aco), qtd: g.n, comprimentoCm: Cg, s: g.s, zonas: g.zonas, ganchos: [{ angulo: 135, pontaCm: ganchoEstribo(g.phi, 135), pinoMm: pinoEstribo(g.phi, acoDe(g.phi, aco)) }, { angulo: 135, pontaCm: ganchoEstribo(g.phi, 135) }],
          criterios: ["estriboGanchoPhi", "estriboGanchoMinCm", "pinoEstriboPhiCA50Ate10"], obs: "C = 2·((bw−2c)+(h−2c)) + 2·ponta de 135°; zonas: " + g.partes.join(", ") + "; contagem " + (opc.contagem === "arredondar" ? "arredondada (livro)" : "⌈trecho/s⌉") });
        nEst += g.n;
      });
      void Cest;
    } else pend.push("Estribos: sem o resultado do cisalhamento no tramo.");

    /* --- armadura de pele (h > 60 cm) */
    if (t.pele && t.pele.necessaria && t.pele.phi) {
      criarPos(pos, { elemento: el, tipo: "pele", nome: "Armadura de pele", phi: t.pele.phi, qtd: 2 * t.pele.nPorFace, comprimentoCm: acima(L + ext.esq + ext.dir, p), trecho: [-ext.esq, L + ext.dir],
        criterios: ["peleAlturaMinCm", "peleTaxaPorFace", "peleEspMaxCm"], obs: t.pele.nPorFace + " barras por face, s ≤ " + fmt(r2(t.pele.s), 1) + " cm (17.3.5.2.3 e 18.3.5); corrida de apoio a apoio" });
    }

    /* --- suspensão: viga apoiada em viga */
    arr(opc.suspensoes).forEach(function (s) {
      var sp = suspensao(s.RdKN, s.hApoioCm, s.hSuspCm, mat.fyd, phiT, 2), Cs = comprimentoEstribo(bw, h, cob, phiT, 135);
      sp.passos.forEach(function (q) { R.push(q); });
      criarPos(pos, { elemento: el, tipo: "suspensao", nome: "Estribos de suspensão" + (s.id ? " (" + s.id + ")" : ""), phi: phiT, aco: acoDe(phiT), qtd: sp.nEstribos, comprimentoCm: Cs, criterios: ["suspensaoReducao", "suspensaoFracaoLateral", "suspensaoFracaoInterseccao"],
        obs: "Asusp = " + fmt(r2(sp.Asusp), 2) + " cm²; ≥ 75 % nas faixas de " + fmt(r2(sp.zonaLateralCm), 1) + " cm de cada lado da viga apoiada e ≤ 25 % na interseção (Fig. 18.4 Em1)" });
      out.suspensoes = (out.suspensoes || []).concat([{ id: s.id, Asusp: sp.Asusp, nEstribos: sp.nEstribos, fator: sp.fator }]);
    });

    out.ok = true; out.entrada = { L: L, bw: bw, h: h, cob: cob, a: al, ext: ext, gancho: gancho, phiEstribo: phiT, nBarrasPositivas: nPos, nEstribos: nEst };
    out.tabela = tabelaAco(pos, opc);
    pend.push("Cada barra do modelo é detalhada como um tramo; a fusão das meias-barras dos apoios intermediários é feita em ConcDetalhe.detalharViga.");
    return out;
  }

  /* viga contínua: detalha cada tramo (diags[i]) e funde as meias-barras negativas dos apoios intermediários (esq do tramo i+1 + dir do tramo i, grupo a grupo) */
  function detalharViga(tramos, diags, opc) {
    opc = opc || {};
    var rs = arr(tramos).map(function (t, i) { var o = {}; Object.keys(opc).forEach(function (k) { o[k] = opc[k]; }); o.diag = arr(diags)[i]; o.elemento = (opc.elemento || "viga") + " tramo " + (i + 1); return detalharTramo(t, o); });
    var fundidas = [];
    rs.forEach(function (r, i) {
      if (i === 0 || !r.ok || !rs[i - 1].ok) return;
      var ant = rs[i - 1].posicoes.filter(function (q) { return q.tipo === "negativa-meia-barra" && q.lado === "dir"; }), atu = r.posicoes.filter(function (q) { return q.tipo === "negativa-meia-barra" && q.lado === "esq"; });
      ant.sort(function (a, b) { return b.extInterna - a.extInterna; }); atu.sort(function (a, b) { return b.extInterna - a.extInterna; });
      atu.forEach(function (b, g) {
        var a = ant[g]; if (!a) return;
        var q = Math.min(a.qtd, b.qtd), comp = acima(a.extInterna + b.extInterna, passoCm(opc));
        fundidas.push({ apoio: "P" + (i + 1), phi: a.phi, qtd: q, comprimentoCm: comp, partes: [a.id, b.id], aco: a.aco });
        a.qtd -= q; b.qtd -= q;
      });
    });
    var todas = [], n = 0;
    rs.forEach(function (r) { r.posicoes.forEach(function (q) { if (q.qtd > 0) { q.totalM = q.qtd * q.comprimentoCm / 100; q.kg = q.totalM * massaLinear(q.phi); todas.push(q); } }); });
    fundidas.forEach(function (f) { todas.push({ id: "N", elemento: "viga apoio " + f.apoio, tipo: "negativa-intermediaria", nome: "Negativa no apoio intermediário " + f.apoio, phi: f.phi, aco: f.aco, qtd: f.qtd, comprimentoCm: f.comprimentoCm, totalM: f.qtd * f.comprimentoCm / 100, kg: f.qtd * f.comprimentoCm / 100 * massaLinear(f.phi), ganchos: [], criterios: ["lb25Phi"], obs: "soma das duas meias-barras (Bastos, Figuras 99 e 103)" }); });
    todas.forEach(function (q) { n++; q.id = "N" + n; });
    return { ok: rs.every(function (r) { return r.ok; }), tramos: rs, posicoes: todas, fundidas: fundidas, tabela: tabelaAco(todas, opc), rotulo: ROTULO };
  }

  /* ---------------------------------------------------------------- LAJE */
  /* l = resultado de ConcLaje.dimensionarLaje; g = { fck?, fyk?, lxCm, lyCm (vãos de eixo a eixo), bordas: { x1:{tipo:"periferia"|"interna", bwCm, vizLxM?, vizHCm?, cotaCm?}, x2, y1, y2 }, bwCm (padrão) }
   * bordas x1/x2 = ⟂ a x (comprimento ℓy); y1/y2 = ⟂ a y (comprimento ℓx). */
  function detalharLaje(l, g, opc) {
    opc = opc || {};
    var V = VG(), R = [], pos = [], avisos = [], pend = [], out = { id: l && l.id, ok: false, posicoes: pos, avisos: avisos, pendencias: pend, passos: R, rotulo: ROTULO };
    if (!l || !l.ok || !l.entrada) { out.motivo = "laje sem resultado do dimensionamento (C3)"; return out; }
    g = g || {}; var en = l.entrada, h = en.h, cPos = en.cobrimentoPos, cNeg = en.cobrimentoNeg, p = passoCm(opc), mat = matDe(g.fck != null ? g.fck : en.fck, g.fyk, {}); if (!mat.ok) { out.motivo = mat.motivo; return out; }
    var el = opc.elemento || ("laje " + (l.marca || l.id || "")), lx = g.lxCm != null ? g.lxCm : en.lx * 100, ly = g.lyCm != null ? g.lyCm : en.ly * 100, bwP = num(g.bwCm, 15), bd = g.bordas || {};
    function bordaDe(id) { var b = bd[id] || {}; return { tipo: b.tipo || "interna", bw: num(b.bwCm, bwP), vizLx: b.vizLxM, vizH: b.vizHCm, cota: b.cotaCm, cedida: !!b.cedida }; }
    function alemEixo(b) { return b.tipo === "periferia" ? Math.max(b.bw / 2 - cPos, cv("lajeArmPositivaAlemEixoApoioCm", 4)) : Math.max(cv("lajePositivaAlemEixoInternaCm", 5), cv("lajeArmPositivaAlemEixoApoioCm", 4)); }
    function ancLaje(phi, gancho) {
      var a = V.ancoragemBasica(phi, mat, { aderencia: V.aderencia(h, h - cNeg, false) });
      return { lb: a.lb, lbGancho: (gancho ? cv("lbAlphaGancho", 0.7) : 1) * a.lb };
    }
    var gancho = Math.max(h - cv("lajeGanchoSubtraiCobrimentos", 2) / 2 * (cPos + cNeg), 0);
    arr(l.armaduras).forEach(function (a) {
      if (!a.ok || !a.barras) return;
      var phi = a.barras.phi, s = a.barras.s, id = a.id, dir = id.indexOf("y") >= 0 ? "y" : "x", seg = id.charAt(0);
      if (a.anticolapso) {
        var b1 = bordaDe("x1"), la = ancLaje(phi, false), cAc = en.lx * 100 + b1.bw / 2 + la.lb - cPos;
        var nAc = conta(ly - bwP, s, opc);
        criarPos(pos, { elemento: el, tipo: "anticolapso", nome: "Armadura inferior anticolapso do balanço (Em1 20.6)", phi: phi, qtd: nAc, comprimentoCm: acima(cAc, p), s: s, dir: "x", criterios: ["lajeBalancoAnticolapso", "lajeBalancoAnticolapsoGammaG"],
          obs: "ponta do balanço − c + ℓb,nec reto dentro da estrutura principal (ℓb = " + fmt(r2(la.lb), 1) + " cm); dimensionada com γg = 1,4 (decisão do produto)" });
        return;
      }
      if (seg === "A" && id.charAt(1) === "+") {
        /* positiva na direção dir: vão da direção + além do eixo em cada ponta; cota = outra dimensão face a face */
        var bE = bordaDe(dir + "1"), bD = bordaDe(dir + "2"), Ldir = dir === "x" ? lx : ly, Lout = dir === "x" ? ly : lx, bO1 = bordaDe(dir === "x" ? "y1" : "x1"), bO2 = bordaDe(dir === "x" ? "y2" : "x2");
        var comp = Ldir + alemEixo(bE) + alemEixo(bD), cota = Lout - bO1.bw / 2 - bO2.bw / 2;
        var n = conta(cota, s, opc), sec = id.indexOf("y") >= 0 && !!(l.classificacao && l.classificacao.tipo === "uma-direcao");
        criarPos(pos, { elemento: el, tipo: sec ? "distribuicao" : "positiva", nome: (sec ? "Distribuição (secundária) dir. " : "Positiva dir. ") + dir, phi: phi, qtd: n, comprimentoCm: acima(comp, p), s: s, dir: dir, trecho: [-alemEixo(bE), Ldir + alemEixo(bD)],
          criterios: ["lajeArmPositivaAlemEixoApoioCm", "lajePositivaAlemEixoInternaCm"], obs: "vão " + fmt(r2(Ldir), 0) + " cm + além do eixo (≥ 4 cm, 20.1; adotado 5 cm interna / face − c na periferia); " + n + " barras = ⌈" + fmt(r2(cota), 0) + "/" + fmt(s, 1) + "⌉ (cota face a face; 1ª barra a s/2 = " + fmt(s / 2, 1) + " cm da face)" });
        return;
      }
      if (l.balanco && id === "A-x") {
        var lbB = ancLaje(phi, false), bB = bordaDe("x1"), lb100 = en.lx * 100, vizLxCm = bB.vizLx != null ? bB.vizLx * 100 : null, dentro = Math.max(cv("lajeBalancoNegativaDentroVizinhaFracao", 1.0) * lb100, vizLxCm != null ? cv("lajeNegativaFracaoVao", 0.25) * vizLxCm : 0) + lbB.lb, Cb = (lb100 - cNeg) + bB.bw + dentro + gancho;
        if (vizLxCm == null) pend.push("Balanço: sem o ℓx da laje vizinha — a penetração usou só ℓbal + ℓb (falta o 0,25·ℓx,viz).");
        criarPos(pos, { elemento: el, tipo: "negativa-balanco", nome: "Negativa do balanço", phi: phi, qtd: conta(ly - bwP, s, opc), comprimentoCm: acima(Cb, p), s: s, borda: "x1", ganchos: [{ angulo: 90, pontaCm: gancho }], criterios: ["lajeBalancoNegativaDentroVizinhaFracao", "lajeGanchoSubtraiCobrimentos"],
          obs: "da ponta do balanço (− c) até " + fmt(r2(dentro), 0) + " cm dentro da laje vizinha = max(ℓbal; 0,25·ℓx,viz) + ℓb,nec (decisão do produto, sem fonte de norma) + gancho h − 2c na ponta" });
        return;
      }
      if (l.balanco && id === "A-y") {
        criarPos(pos, { elemento: el, tipo: "distribuicao", nome: "Distribuição do balanço", phi: phi, qtd: conta(en.lx * 100, s, opc), comprimentoCm: acima(ly + 2 * cv("lajeDistribuicaoAlemEixoCm", 5), p), s: s, dir: "y", criterios: ["lajeDistribuicaoAlemEixoCm"], obs: "perpendicular à negativa principal, ao longo do apoio" });
        return;
      }
      if (seg === "A" && id.charAt(1) === "-") {
        var ref = id.slice(2);
        if (/^[xy]$/.test(ref)) { var ri2 = ["x1", "x2", "y1", "y2"].filter(function (r) { return r.charAt(0) === ref && bd[r] && bd[r].tipo === "interna"; }); if (ri2.length === 1) ref = ri2[0]; }   /* uma direção: a negativa fica na borda engastada */
        var b = bordaDe(ref), ehX = ref.charAt(0) === "x", Lc = ehX ? ly : lx, cotaN = b.cota != null ? b.cota : Lc - bwP;
        if (bd[ref] && bd[ref].cedida) { avisos.push("Negativa da borda " + ref + ": a barra da borda comum é detalhada na laje vizinha " + (bd[ref].vizId || "") + " (a de maior armadura), sem contar duas vezes."); return; }
        if (a.construtiva) {
          var ext1 = (a.extensao != null ? a.extensao : 0.15 * en.lx) * 100, cc = ext1 + b.bw - cNeg + gancho;
          criarPos(pos, { elemento: el, tipo: "negativa-borda", nome: "Negativa de borda sem continuidade (" + ref + ")", phi: phi, qtd: conta(cotaN, s, opc), comprimentoCm: acima(cc, p), s: s, borda: ref, criterios: ["lajeBordaNegativaExtensaoFracaoVaoMenor"],
            obs: "0,15·ℓx a partir da face + a largura da viga − c + gancho h − 2c (19.3.3.2); quantidade ⌈cota/s⌉, 1ª barra a s/2 da face" });
          return;
        }
        var trsB = arr(bd[ref] && bd[ref].trechos).filter(function (q) { return !!q.vizId; });
        if (trsB.length && trsB.length === arr(bd[ref].trechos).length && !a.construtiva) {
          var proprios = trsB.filter(function (q) { return !q.cedida; });
          if (!proprios.length) { avisos.push("Negativa da borda " + ref + ": todos os trechos são detalhados nas lajes vizinhas (a de maior armadura), sem contar duas vezes."); return; }
          var grupos = {}, ordemG = [];
          proprios.forEach(function (q) { var kk = q.vizLxM + "|" + q.vizHCm; if (!grupos[kk]) { grupos[kk] = { vizLx: q.vizLxM, vizH: q.vizHCm, cota: 0, trechos: [] }; ordemG.push(kk); } grupos[kk].cota += q.cotaCm; grupos[kk].trechos.push({ vizId: q.vizId, cotaCm: q.cotaCm }); });
          var sufixoB = ordemG.length > 1;
          ordemG.forEach(function (kk, gi) {
            var G = grupos[kk], an2 = ancLaje(phi, true), xv2 = Math.max(en.lx * 100, G.vizLx != null ? G.vizLx * 100 : en.lx * 100);
            var c12 = cv("lajeNegativaFracaoVao", 0.25) * xv2 + an2.lbGancho, c12r = opc.arredondaNegativa === "livro" ? proximo(c12, cv("lajeNegativaArredondaLivroCm", 10)) : acima(c12, p), gV2 = G.vizH != null ? Math.max(G.vizH - cv("lajeGanchoSubtraiCobrimentos", 2) * cPos, 0) : gancho;
            var Cn2 = 1.5 * c12r + gancho + gV2, ini2 = 0; for (var qi = 0; qi < gi; qi++) ini2 += grupos[ordemG[qi]].cota;
            criarPos(pos, { elemento: el, tipo: "negativa", nome: "Negativa na borda " + ref + " (arranjo 3)" + (sufixoB ? ", trecho " + (gi + 1) + " de " + ordemG.length : ""), phi: phi, qtd: conta(G.cota, s, opc), comprimentoCm: Cn2, s: s, borda: ref, ganchos: [{ angulo: 90, pontaCm: gancho }, { angulo: 90, pontaCm: gV2 }], criterios: ["lajeNegativaFracaoVao", "lajeGanchoSubtraiCobrimentos", "lbAlphaGancho"],
              obs: "C = 1,5·(0,25·ℓx + ℓb,gancho) + ganchos (h − 2c), ℓx = " + fmt(r2(xv2), 0) + " cm, ℓb,gancho = " + fmt(r2(an2.lbGancho), 1) + " cm (critério da NB-1/78 pelo Bastos — decisão do produto); borda com mais de um vizinho: trecho de " + fmt(r2(G.cota), 0) + " cm (" + G.trechos.map(function (q) { return q.vizId; }).join(", ") + "), contado UMA vez; quantidade ⌈trecho/s⌉" });
            pos[pos.length - 1].trechosBorda = G.trechos; pos[pos.length - 1].iniBordaCm = ini2; pos[pos.length - 1].grupo = gi; pos[pos.length - 1].ngrupos = ordemG.length;
          });
          return;
        }
        var an = ancLaje(phi, true), xv = Math.max(en.lx * 100, b.vizLx != null ? b.vizLx * 100 : en.lx * 100);
        var c1 = cv("lajeNegativaFracaoVao", 0.25) * xv + an.lbGancho, c1r = opc.arredondaNegativa === "livro" ? proximo(c1, cv("lajeNegativaArredondaLivroCm", 10)) : acima(c1, p), gV = b.vizH != null ? Math.max(b.vizH - cv("lajeGanchoSubtraiCobrimentos", 2) * cPos, 0) : gancho;
        var Cn = 1.5 * c1r + gancho + gV;
        criarPos(pos, { elemento: el, tipo: "negativa", nome: "Negativa na borda " + ref + " (arranjo 3)", phi: phi, qtd: conta(cotaN, s, opc), comprimentoCm: Cn, s: s, borda: ref, ganchos: [{ angulo: 90, pontaCm: gancho }, { angulo: 90, pontaCm: gV }], criterios: ["lajeNegativaFracaoVao", "lajeGanchoSubtraiCobrimentos", "lbAlphaGancho"],
          obs: "C = 1,5·(0,25·ℓx + ℓb,gancho) + ganchos (h − 2c), ℓx = " + fmt(r2(xv), 0) + " cm, ℓb,gancho = " + fmt(r2(an.lbGancho), 1) + " cm (critério da NB-1/78 pelo Bastos — decisão do produto); quantidade ⌈cota/s⌉, 1ª barra a s/2 da face" });
      }
    });
    if (l.balanco) pend.push("Laje em balanço: o comprimento da negativa dentro da laje vizinha é max(ℓbal; 0,25·ℓx,viz) + ℓb — a 6118 não fixa; DECISÃO DO PRODUTO sem fonte, conferir (lajeBalancoNegativaDentroVizinhaFracao).");
    /* estribo de laje (20.4): só quando houver */
    if (l.estribos && l.estribos.phi != null) {
      var ok204 = l.estribos.phi <= cv("lajeEstriboPhiMaxFracaoH", 0.05) * h * 10 + 1e-9;
      passo(R, "ls.phi", "Diâmetro do estribo de laje", l.estribos.phi, "mm", "φ ≤ h/20 = " + fmt(r2(h * 10 / 20), 2) + " mm" + (ok204 ? "" : " — NÃO ATENDE"), "NBR 6118:2023/Em1:2026 20.4");
      if (!ok204) avisos.push("Estribo de laje φ " + fmt(l.estribos.phi, 1) + " mm > h/20 (20.4 Em1): NÃO ATENDE.");
    }
    pend.push("Armadura de canto para momentos volventes (Figura 25 do Bastos): NÃO detalhada (pendência da C3).");
    out.ok = true; out.entrada = en; out.tabela = tabelaAco(pos, opc);
    return out;
  }

  /* ---------------------------------------------------------------- PILAR */
  /* p = resultado de ConcPilar.dimensionarPilar (ok); g = { LCm (altura do lance), fck, caa, ultimoLance?, hVigaTopoCm?, cobCm? } */
  function detalharPilar(p, g, opc) {
    opc = opc || {};
    var V = VG(), R = [], pos = [], avisos = [], pend = [], out = { id: p && p.id, ok: false, posicoes: pos, avisos: avisos, pendencias: pend, passos: R, rotulo: ROTULO };
    if (!p || !p.ok || !p.armadura || !p.secao) { out.motivo = "pilar sem resultado do dimensionamento (C4)"; return out; }
    g = g || {}; var mat = matDe(g.fck != null ? g.fck : 25, g.fyk, {}); if (!mat.ok) { out.motivo = mat.motivo; return out; }
    var el = opc.elemento || ("pilar " + (p.marca || p.id || "")), a = p.armadura, e = p.estribos, hx = p.secao.hx, hy = p.secao.hy, L = g.LCm, pa = passoCm(opc), cob = g.cobCm != null ? g.cobCm : V.cobrimento(num(g.caa, 2), mat.fck, false);
    if (!(L > 0)) { out.motivo = "falta a altura do lance (LCm)"; return out; }
    var phi = a.phi, lc = traspasseComprimida(phi, mat, { AsCalc: Math.min(a.AsCalc, a.AsEf), AsEf: a.AsEf, aderencia: "boa" }), l0c = acima(lc.l0c, pa);
    lc.passos.forEach(function (q) { R.push(q); }); lc.avisos.forEach(function (q) { avisos.push(q); });
    var ultimo = !!g.ultimoLance, compBar = L + (ultimo ? 0 : l0c);
    if (ultimo) {
      var hv = num(g.hVigaTopoCm, 0), disp = hv - cob, lbn = lc.lbNec;
      if (hv > 0) { compBar = L + Math.max(disp, 0); if (lbn > disp + 1e-9) avisos.push("Último lance: ℓb,nec = " + fmt(r2(lbn), 1) + " cm não cabe na viga de cobertura (" + fmt(r2(disp), 1) + " cm) sem gancho; barra comprimida é ancorada SEM gancho (9.4.2.1): aumente a viga ou use mais barras."); }
      else { compBar = L + lbn; pend.push("Último lance sem a altura da viga de cobertura: adotado ℓb,nec reto acima do piso (" + fmt(r2(lbn), 1) + " cm)."); }
    } else pend.push("Espera para o lance de cima: ℓ0c = " + fmt(l0c, 0) + " cm (9.5.2.3), todas as barras emendadas na mesma seção (permitido para armadura comprimida, Tabela 9.3).");
    criarPos(pos, { elemento: el, tipo: "longitudinal", nome: "Longitudinal do lance" + (ultimo ? " (último)" : " + espera"), phi: phi, qtd: a.n, comprimentoCm: acima(compBar, pa), criterios: ["traspasseCompMinFracaoLb", "traspasseMinPhi", "traspasseMinMm", "barraComprimidaSemGancho", "traspasseBitolaMaxMm"],
      obs: "lance " + fmt(L, 0) + " cm" + (ultimo ? "" : " + ℓ0c " + fmt(l0c, 0) + " cm") + "; ℓb = " + fmt(r2(lc.lb), 1) + " cm (boa aderência, vertical)" });
    /* taxa na região de emenda: 2·As,ef ≤ 8 % Ac (a soma das armaduras sobrepostas) */
    var Ac = hx * hy, tx = 2 * a.AsEf / Ac;
    passo(R, "pe.taxa", "Taxa na região de emenda (todas as barras emendadas)", tx, "-", "2·As,ef/Ac ≤ 2·" + fmt(100 * cv("pilarAsMaxTaxa", 0.04), 0) + " %", "NBR 6118 17.3.5.3.2 (8 % incluindo a sobreposição)");
    if (!ultimo && tx > 2 * cv("pilarAsMaxTaxa", 0.04) + 1e-9) avisos.push("Taxa de armadura na emenda " + fmt(r2(100 * tx), 2) + " % acima de 8 %: escalone as emendas.");
    /* estribos e grampos */
    if (e) {
      var phiT = e.phiT, s = e.s, acoT = acoDe(phiT), Ce = comprimentoEstribo(hx, hy, cob, phiT, 135), nBase = conta(L, s, opc);
      /* contagem no lance: ⌈L/s⌉ (Bastos, Pilares Fig. 81: lance de 300 cm com N2 – 15 c/20 = 300/20), L de eixo a eixo de viga — o trecho dentro da viga/laje também leva estribo (18.4.3). A EMENDA (espera do lance de baixo, no pé deste lance; não existe no térreo, arranque = C9)
       * leva: extras para ΣAst nos terços (9.5.2.4.1) e UM estribo 4φ além de cada ponta da emenda comprimida (9.5.2.4.2) */
      var te = transversalEmenda(phi, 100, l0c, phiT, s, 2, true), lapAqui = !g.primeiroLance, nAlem = lapAqui ? 2 : 0, nExtra = lapAqui ? 2 * te.extras + nAlem : 0;
      te.passos.forEach(function (q) { R.push(q); });
      criarPos(pos, { elemento: el, tipo: "estribo", nome: "Estribo φ " + fmt(phiT, 1) + " c/" + fmt(s, 1), phi: phiT, aco: acoT, qtd: nBase + nExtra, comprimentoCm: Ce, s: s, ganchos: [{ angulo: 135, pontaCm: ganchoEstribo(phiT, 135), pinoMm: pinoEstribo(phiT, acoT) }, { angulo: 135, pontaCm: ganchoEstribo(phiT, 135) }],
        criterios: ["pilarEstriboPhiMinMm", "pilarEstriboSmaxMm", "estriboGanchoPhi"], obs: "18.4.3: φt ≥ max(5 mm; φ/4), s ≤ min(20 cm; menor lado; 12φ); " + nBase + " ao longo do lance (⌈L/s⌉, Bastos Fig. 81)" + (nExtra ? " + " + nExtra + " na emenda (9.5.2.4: " + (2 * te.extras) + " nos terços, " + nAlem + " a 4φ além das pontas)" : "") });
      var semP = arr(e.semProtecao), xs = {}, ys = {};
      semP.forEach(function (q) { var nx = Math.abs(q.x) / (hx / 2), ny = Math.abs(q.y) / (hy / 2); if (ny >= nx) xs[Math.round(q.x * 100)] = 1; else ys[Math.round(q.y * 100)] = 1; });
      var porX = Object.keys(xs).length, porY = Object.keys(ys).length;
      if (porX + porY !== e.grampos) avisos.push("Grampos: " + (porX + porY) + " pelas posições, " + e.grampos + " no C4 — conferir.");
      [[porX, hy, "atravessa a dimensão de " + fmt(hy, 0) + " cm (barras das faces paralelas a x)"], [porY, hx, "atravessa a dimensão de " + fmt(hx, 0) + " cm (barras das faces paralelas a y)"]].forEach(function (q) {
        if (q[0] <= 0) return;
        var Cg = comprimentoGrampo(q[1], cob, phiT, cv("grampoGanchoAnguloMin", 135));
        criarPos(pos, { elemento: el, tipo: "grampo", nome: "Grampo (estribo suplementar) φ " + fmt(phiT, 1), phi: phiT, aco: acoT, qtd: q[0] * (nBase + nExtra), comprimentoCm: Cg, s: s, dir: q[1] === hy ? "x" : "y", ganchos: [{ angulo: 135, pontaCm: ganchoEstribo(phiT, 135) }, { angulo: 135, pontaCm: ganchoEstribo(phiT, 135) }],
          criterios: ["grampoGanchoAnguloMin", "pilarFlambagemDistPhiT"], obs: "18.2.4 + Fig. 18.2 (Em1): barra reta com ganchos de 135° a 180° envolvendo a longitudinal, mesmo φ e espaçamento do estribo; " + q[2] });
      });
    } else pend.push("Estribos do pilar ausentes no resultado (C4): detalhamento transversal pendente.");
    pend.push("Arranque na fundação (térreo): C9 — o comprimento do lance térreo não inclui a espera da sapata/bloco.");
    out.ok = true; out.entrada = { LCm: L, l0c: l0c, lb: lc.lb, cobrimento: cob }; out.tabela = tabelaAco(pos, opc);
    return out;
  }

  /* ---------------------------------------------------------------- integração com a C1–C4 (sobrado) */
  function diagDeAnalise(an, bid) {
    var ELU = arr(an.combinacoes).filter(function (c) { return c.tipo === "ELU"; }), o = null;
    ELU.forEach(function (c) {
      var r = an.resultados[c.id], s = r && r.esforcos[bid] ? r.esforcos[bid].estacoes : null; if (!s || !s.length) return;
      if (!o) o = { x: s.map(function (q) { return q.x - s[0].x; }), Mmax: s.map(function () { return -Infinity; }), Mmin: s.map(function () { return Infinity; }), V: s.map(function () { return 0; }) };
      s.forEach(function (q, i) { o.Mmax[i] = Math.max(o.Mmax[i], q.Mz); o.Mmin[i] = Math.min(o.Mmin[i], q.Mz); o.V[i] = Math.max(o.V[i], Math.abs(q.Vy)); });
    });
    return o;
  }

  /* geometria da laje do MODELO (ConcModelo) para o detalhamento: mesma ordem de bordas do ConcCalcular.entradaLaje (x1,x2 = bordas longas; y1,y2 = curtas), largura da viga de apoio e a laje
   * vizinha de cada borda engastada (outra laje do outro lado da mesma viga) */
  function gDeLajeModelo(an, lm) {
    var m = an.modelo, ed = arr(lm.ed), L = ed.map(function (e) { return e.L; });
    if (ed.length !== 4) return null;
    var curtas = L[0] <= L[1] ? [0, 2] : [1, 3], longas = L[0] <= L[1] ? [1, 3] : [0, 2], map = { x1: longas[0], x2: longas[1], y1: curtas[0], y2: curtas[1] }, vigas = m.pecas.vigas, bordas = {}, bws = [];
    Object.keys(map).forEach(function (ref) {
      var e = ed[map[ref]], ap = arr(e.apoios)[0], bw = ap && vigas[ap.viga] ? vigas[ap.viga].b * 100 : null, viz = null;
      if (bw != null) bws.push(bw);
      if (e.tipo === "engastada") arr(m.lajes).forEach(function (o) {
        if (o === lm || viz || Math.abs(o.topo - lm.topo) > 0.05) return;
        arr(o.ed).forEach(function (oe) { if (viz) return; arr(oe.apoios).forEach(function (oa) { if (!viz && ap && oa.viga === ap.viga && oa.lado !== ap.lado && Math.min(oa.sb, ap.sb) - Math.max(oa.sa, ap.sa) > 0.05) viz = o; }); });
      });
      bordas[ref] = { tipo: e.tipo === "engastada" ? "interna" : "periferia", bwCm: bw, cotaCm: e.L * 100, vizLxM: viz ? Math.min.apply(null, viz.ed.map(function (q) { return q.L; })) : null, vizHCm: viz ? viz.h * 100 : null, vizId: viz ? viz.id : null };
      /* C8: a borda pode ter MAIS DE UM vizinho (uma laje grande ao lado de duas menores): um trecho por apoio e por vizinho, com o comprimento da sobreposição (a barra negativa é contada uma vez por trecho) */
      if (e.tipo === "engastada") {
        var trs = [];
        arr(e.apoios).forEach(function (ap2) {
          var achou = false;
          arr(m.lajes).forEach(function (o) {
            if (o === lm || Math.abs(o.topo - lm.topo) > 0.05) return;
            arr(o.ed).forEach(function (oe) { arr(oe.apoios).forEach(function (oa) {
              var ov = Math.min(oa.sb, ap2.sb) - Math.max(oa.sa, ap2.sa);
              if (oa.viga === ap2.viga && oa.lado !== ap2.lado && ov > 0.05) { achou = true; trs.push({ vizId: o.id, cotaCm: ov * 100, vizLxM: Math.min.apply(null, o.ed.map(function (q) { return q.L; })), vizHCm: o.h * 100, ini: Math.max(oa.sa, ap2.sa) - ap2.sa }); }
            }); });
          });
          if (!achou) trs.push({ vizId: null, cotaCm: (ap2.sb - ap2.sa) * 100, vizLxM: null, vizHCm: null, ini: 0 });
        });
        if (trs.length) bordas[ref].trechos = trs;
      }
    });
    var bwM = bws.length ? bws.reduce(function (a, b) { return a + b; }, 0) / bws.length : 15;
    return { lxCm: Math.min(L[0], L[1]) * 100, lyCm: Math.max(L[0], L[1]) * 100, bwCm: bwM, bordas: bordas };
  }

  /* an = ConcAnalise.rodar (estacoes ≥ 21); dv = ConcViga.dimensionarDeAnalise; dp = ConcPilar.dimensionarDeAnalise; lajes = [{ res: dimensionarLaje, g }] (opcional).
   * Volume de concreto = PP/γc do C1 (peso próprio do modelo ÷ 25 kN/m³). Devolve elementos, tabela total e a taxa kg/m³. */
  function detalharDeAnalise(an, dv, dp, lajes, opc) {
    opc = opc || {};
    var out = { ok: true, vigas: [], pilares: [], lajes: [], avisos: [], pendencias: [], rotulo: ROTULO }, todas = [], semV = 0;
    arr(dv && dv.vigas).forEach(function (v) {
      v.tramos.forEach(function (t) {
        var diag = diagDeAnalise(an, t.id), pv = an.modelo.pecas.vigas[(an.modelo.barras.filter(function (b) { return b.id === t.id; })[0] || {}).peca] || {};
        var r = detalharTramo(t, { diag: diag, elemento: "viga " + (v.marca || pv.marca || t.id), passoCm: opc.passoCm, contagem: opc.contagem, perda: opc.perda });
        if (!r.ok) { semV++; out.avisos.push("Viga " + (v.marca || t.id) + ": sem detalhamento (" + r.motivo + ")"); return; }
        out.vigas.push(r); r.posicoes.forEach(function (q) { todas.push(q); });
      });
    });
    var lanceL = {};
    an.modelo.barras.forEach(function (b) { if (b.tipo === "pilar") lanceL[b.id] = b.L; });
    var topo = Math.max.apply(null, an.modelo.nos.map(function (n) { return n.y; })), ymin = Math.min.apply(null, an.modelo.nos.map(function (n) { return n.y; }));
    arr(dp && dp.pilares).forEach(function (q) {
      if (!q.ok) { out.avisos.push("Pilar " + (q.marca || q.id) + ": sem detalhamento (sem resultado do C4)"); return; }
      var Lm = q.lance && q.lance.L != null ? q.lance.L : lanceL[q.id], ult = q.lance ? Math.abs(q.lance.topo - topo) < 1e-6 : false;
      var r = detalharPilar(q, { LCm: Lm * 100, fck: an.modelo.fck || opc.fck, caa: opc.caa, ultimoLance: ult, primeiroLance: q.lance && ymin != null ? Math.abs(q.lance.base - ymin) < 1e-6 : false, hVigaTopoCm: opc.hVigaTopoCm }, { passoCm: opc.passoCm, contagem: opc.contagem, perda: opc.perda });
      if (!r.ok) { out.avisos.push("Pilar " + (q.marca || q.id) + ": " + r.motivo); return; }
      out.pilares.push(r); r.posicoes.forEach(function (p) { todas.push(p); });
    });
    /* borda comum a duas lajes: a barra negativa é detalhada UMA vez, na laje de maior armadura na borda (empate: a de menor id) */
    var asDe = {};
    function refsInternas(g, dir) { return ["x1", "x2", "y1", "y2"].filter(function (r) { return r.charAt(0) === dir && g && g.bordas && g.bordas[r] && g.bordas[r].tipo === "interna"; }); }
    arr(lajes).forEach(function (L) { arr(L.res && L.res.armaduras).forEach(function (a) {
      if (!a.barras) return;
      if (a.borda) asDe[(L.res.id) + "." + a.borda] = a.barras.AsEf;
      else if (/^A-[xy]$/.test(a.id)) { var ri = refsInternas(L.g, a.id.charAt(2)); if (ri.length === 1) asDe[L.res.id + "." + ri[0]] = a.barras.AsEf; }   /* laje em UMA direção: a negativa "A-x" é a da borda interna (a engastada) */
    }); });
    arr(lajes).forEach(function (L) {
      Object.keys(L.g && L.g.bordas || {}).forEach(function (ref) {
        var b = L.g.bordas[ref]; if (!b.vizId) return;
        var meu = asDe[L.res.id + "." + ref], outro = null;
        arr(lajes).forEach(function (Q) { if (Q.res.id === b.vizId) Object.keys(Q.g && Q.g.bordas || {}).forEach(function (r2k) { if (Q.g.bordas[r2k].vizId === L.res.id && asDe[Q.res.id + "." + r2k] != null) outro = asDe[Q.res.id + "." + r2k]; }); });
        if (meu == null || outro == null) return;
        b.cedida = meu < outro - 1e-9 || (Math.abs(meu - outro) <= 1e-9 && String(L.res.id) > String(b.vizId));
      });
    });
    /* por TRECHO de cada vizinho: a barra de um trecho é detalhada numa laje só (a de maior armadura na borda; empate: a de menor id) */
    arr(lajes).forEach(function (L) {
      Object.keys(L.g && L.g.bordas || {}).forEach(function (ref) {
        var b = L.g.bordas[ref], meu = asDe[L.res.id + "." + ref];
        arr(b.trechos).forEach(function (tr) {
          if (!tr.vizId || meu == null) return;
          var outro = null;
          arr(lajes).forEach(function (Q) { if (Q.res.id === tr.vizId) Object.keys(Q.g && Q.g.bordas || {}).forEach(function (r2k) { arr(Q.g.bordas[r2k].trechos).forEach(function (t2) { if (t2.vizId === L.res.id && asDe[Q.res.id + "." + r2k] != null) outro = asDe[Q.res.id + "." + r2k]; }); }); });
          if (outro == null) return;
          tr.cedida = meu < outro - 1e-9 || (Math.abs(meu - outro) <= 1e-9 && String(L.res.id) > String(tr.vizId));
        });
      });
    });
    arr(lajes).forEach(function (L) {
      var r = detalharLaje(L.res, L.g, { passoCm: opc.passoCm, contagem: opc.contagem, perda: opc.perda });
      if (!r.ok) { out.avisos.push("Laje " + ((L.res && L.res.marca) || (L.res && L.res.id)) + ": sem detalhamento (" + r.motivo + ")"); return; }
      out.lajes.push(r); r.posicoes.forEach(function (p) { todas.push(p); });
    });
    out.posicoes = todas; out.tabela = tabelaAco(todas, opc);
    /* VOLUME só das peças DETALHADAS (bruto: soma b·h·L sem descontar as interseções viga/pilar/laje, o que deixa a taxa um pouco BAIXA). A taxa fica PARCIAL enquanto faltar qualquer coisa: nunca use taxaKgM3 como taxa do projeto. */
    var vol = 0, faltou = [], idsLajeDet = {};
    out.vigas.forEach(function (r) { vol += r.entrada.bw * r.entrada.h * r.entrada.L / 1e6; });
    out.pilares.forEach(function (r) { var q = arr(dp.pilares).filter(function (z) { return z.id === r.id; })[0]; if (q) vol += q.secao.hx * q.secao.hy * r.entrada.LCm / 1e6; });
    out.lajes.forEach(function (r) { idsLajeDet[r.id] = 1; vol += r.entrada.lx * r.entrada.ly * r.entrada.h / 100; });
    arr(dv && dv.vigas).forEach(function (v) { if (!out.vigas.some(function (r) { return r.id === v.tramos[0].id; })) faltou.push("viga " + (v.marca || v.id) + " sem detalhamento"); });
    arr(dp && dp.pilares).forEach(function (q) { if (!out.pilares.some(function (r) { return r.id === q.id; })) faltou.push("pilar " + (q.marca || q.id) + (q.atende === false ? " (reprovado no C4: sem armadura)" : " sem detalhamento")); });
    arr(an.modelo.lajes).forEach(function (l) { if (!idsLajeDet[l.id]) faltou.push("laje " + (l.marca || l.id) + (l.tipo !== "macica" ? " (" + l.tipo + ": fora do motor)" : " sem detalhamento")); });
    faltou.push("arranque na fundação / espera da sapata (C9)", "armadura de canto de laje (momentos volventes)", "escadas, reservatórios e peças fora do modelo estrutural");
    out.volumeDetalhadoM3 = vol; out.faltou = faltou; out.taxaParcial = true;
    out.taxaKgM3 = null;   /* de propósito: só existe taxaParcialKgM3 enquanto o resultado for parcial */
    out.taxaParcialKgM3 = vol > 0 ? out.tabela.totalKg / vol : null; out.taxaParcialKgM3ComPerda = vol > 0 ? out.tabela.totalKgComPerda / vol : null;
    out.avisoTaxa = "TAXA PARCIAL (" + (out.taxaParcialKgM3 != null ? fmt(r2(out.taxaParcialKgM3), 1) : "-") + " kg/m³ líquidos): volume só das peças detalhadas, bruto (sem descontar interseções); falta: " + faltou.join("; ") + ". NÃO usar como taxa do orçamento.";
    var PP = an.cargas && an.cargas.totais ? an.cargas.totais.PP : null; if (PP != null) out.volumeConcretoModeloM3 = PP / cv("pesoConcretoArmado", 25);
    out.avisos.push(out.avisoTaxa);
    out.avisos.push("Cada barra de viga do modelo é um tramo com apoios nos extremos: nos apoios intermediários cada tramo leva a sua meia-barra e o gancho do extremo — a favor da segurança.");
    return out;
  }

  var ConcDetalhe = {
    massaLinear: massaLinear, acoDe: acoDe, ganchoEstribo: ganchoEstribo, pinoEstribo: pinoEstribo, ganchoTracao: ganchoTracao, comprimentoEstribo: comprimentoEstribo, comprimentoGrampo: comprimentoGrampo,
    alfa0t: alfa0t, traspasseTracionada: traspasseTracionada, traspasseComprimida: traspasseComprimida, transversalEmenda: transversalEmenda, forcaApoioExtremo: forcaApoioExtremo,
    grampoAncoragem: grampoAncoragem, suspensao: suspensao, curva: curva, decalar: decalar, cobrir: cobrir, criarPos: criarPos, tabelaAco: tabelaAco,
    detalharTramo: detalharTramo, detalharViga: detalharViga, detalharLaje: detalharLaje, detalharPilar: detalharPilar, detalharDeAnalise: detalharDeAnalise, diagDeAnalise: diagDeAnalise, gDeLajeModelo: gDeLajeModelo, conta: conta
  };
  global.ConcDetalhe = ConcDetalhe;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcDetalhe;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

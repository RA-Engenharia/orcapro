/* =====================================================================
 * concpilar.js — DIMENSIONAMENTO DE PILARES de concreto armado (fase C4, 14/11/2026). Motor PURO (ES5, Node-testável, sem DOM).
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). Todo número vem de js/concdadoscalc.js (com fonte, item e página);
 * o que não foi conferido ('sem-fonte') aparece em ConcDadosCalc.semFonte() e vira pendência no memorial.
 *
 * UNIDADES internas: cm, kN, kN·cm, kN/cm² (como as apostilas de referência). A entrada de dimensionarPilar e de dimensionarDeAnalise é em m, kN e kN·m
 * (as mesmas do ConcAnalise / ConcViga); a conversão é feita na borda. Direção x = lado hx da seção; y = lado hy. "Md,x" é o momento da direção x (= N·ex).
 *
 * O QUE CALCULA (NBR 6118, edição lida: 2014 — conferir no exemplar 2026, pendência P1)
 *  1. γn da Tabela 13.1, comprimento equivalente ℓe (15.6), λ = ℓe/i, αb e λ1 (15.8.2), limite λ ≤ 200 (15.8.1)   → gammaN(), comprimentoEquivalente(), esbeltez(), alphaB(), lambda1()
 *  2. momento mínimo de 1ª ordem M1d,mín = Nd·(0,015 + 0,03·h) (11.3.3.4.3) e M1d,A/M1d,B vindos da análise da C1                → momentoMinimo()
 *  3. efeitos locais de 2ª ordem: pilar-padrão com curvatura aproximada (15.8.3.3.2) e com rigidez κ aproximada (15.8.3.3.3), só λ ≤ 90   → momentosDirecao()
 *     (90 < λ ≤ 140: pilar-padrão acoplado a M-N-1/r e λ > 140: processo geral NÃO implementados — o motor recusa e avisa)
 *  4. flexão composta normal e oblíqua: seção resistente por INTEGRAÇÃO (diagrama parábola-retângulo, aço CA-50 bilinear, domínios 2 a 5 e
 *     reta b da Figura 17.1), superfície de interação a N = Nd, As por bisseção; método α do 17.2.5 calculado ao lado          → momentoResistente(), contorno(), resolverAs(), verificarAlpha()
 *  5. armadura: As,mín/As,máx (17.3.5.3), φ ≥ 10 mm e ≤ b/8, espaçamentos e arranjo no perímetro (18.4.2), estribos (18.4.3),
 *     proteção contra a flambagem das barras (18.2.4)                                                                           → escolherArranjo(), estribos(), protecaoFlambagem()
 *  6. aproveitamento por pilar e por lance; pilar que reprova vira aviso com sugestão de seção                                   → dimensionarPilar(), dimensionarDeAnalise()
 *  7. saída com CADA passo registrado { id, nome, valor, unidade, formula, item } para o memorial (C6)
 *
 * LIMITES DECLARADOS (viram aviso/pendência, nunca silêncio): só Grupo I (fck ≤ 50 MPa) e CA-50; seção RETANGULAR (sem pilar-parede, sem seção
 * circular/L); nós fixos até γz 1,1; entre 1,1 e 1,3 os esforços horizontais saem × 0,95·γz (15.7.2); acima de 1,3 o pilar fica 'sem cálculo'; barras todas iguais,
 * arranjo simétrico no perímetro; sem pilar tracionado (qualquer combinação com N ≥ 0 deixa o pilar 'sem cálculo'); sem fluência (só obrigatória acima de λ = 90, que o motor não dimensiona);
 * sem cargas transversais ao longo do lance; sem pilar em balanço; o concreto ocupado pelas barras não é descontado na integração (como os ábacos);
 * a armadura da seção intermediária C vale para o lance todo (armadura constante, como a 15.8.1 exige).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function VG() { return dep("ConcViga", "./concviga.js"); }
  function cv(k, d) { var X = D(); return X ? X.v(k, d) : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(x) { return x * x; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(v, n) { return (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toString().replace(".", ","); }
  function areaBarra(phiMm) { return Math.PI * sq(phiMm / 10) / 4; }
  function passo(R, id, nome, valor, unidade, formula, item) { R.push({ id: id, nome: nome, valor: valor, unidade: unidade, formula: formula, item: item }); return valor; }
  var ROTULO = "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";

  /* ---------------------------------------------------------------- material (kN/cm²) */
  function material(fck, fykMPa, opc) {
    var V = VG(); if (!V) return { ok: false, motivo: "js/concviga.js ausente" };
    var m = V.material(fck, fykMPa, opc); if (!m.ok) return m;
    m.ac = cv("alphaC", 0.85) * (m.etaC || 1); m.ecu = cv("epsCuMil", 3.5) / 1000; m.ec2 = cv("epsC2Mil", 2.0) / 1000; m.esMax = cv("epsSMaxMil", 10) / 1000;
    m.nPar = cv("parabolaExpoente", 2); m.lam = cv("lambdaRetangulo", 0.8); m.pivC = (m.ecu - m.ec2) / m.ecu;
    return m;
  }

  /* ---------------------------------------------------------------- 1. geometria, esbeltez, limites */
  /* γn (13.2.3, Tabela 13.1): b = menor dimensão (cm). b ≥ 19 → 1,0; 14 ≤ b < 19 → 1,95 − 0,05·b; b < 14 ou área < 360 cm² → não permitido.
   * OPÇÃO DE PROJETO permitirPilar12 (opc.permitirPilar12, PADRÃO false — decisão do Rogério, 14/11/2026): com ela, 12 ≤ b < 14 cm é aceito com a MESMA fórmula estendida
   * (γn = 1,95 − 0,05·b; b = 12 → 1,35) e área ≥ 360 cm². Status "decisao-produto" (fonte: 6118:2003 13.2.3, REVOGADA, + estudo UEPG 2023) — NÃO é norma-lida: a peça sai
   * com a marca foraNorma. Sem a opção, 12 cm continua reprovado. */
  function foraNormaPilar12(bCm, g) {
    return { item: "13.2.3", edicao: "6118:2023", texto: cv("pilar12TextoTela", "fora da NBR 6118:2023, 13.2.3 — habilitado pelo RT"), status: "decisao-produto",
             fonte: "NBR 6118:2003 13.2.3 (revogada) + estudo UEPG 2023", cor: "laranja", menorDimensaoCm: bCm, gammaN: g, minimoNorma2023Cm: cv("pilarDimMinCm", 14) };
  }
  function gammaN(bCm, areaCm2, opc) {
    var semG = cv("pilarDimSemGammaNCm", 19), mn = cv("pilarDimMinCm", 14), am = cv("pilarAreaMinCm2", 360), op12 = !!(opc && opc.permitirPilar12), mn12 = cv("pilarDimMinOpcao12Cm", 12);
    var A = cv("pilarGammaNA", 1.95), B = cv("pilarGammaNB", 0.05);
    if (bCm < mn - 1e-9) {
      if (op12 && bCm >= mn12 - 1e-9) {
        if (areaCm2 < am - 1e-9) return { ok: false, motivo: "área " + fmt(areaCm2, 0) + " cm² < " + am + " cm² (6118 13.2.3; a opção de pilar de " + mn12 + " cm mantém a área mínima)" };
        var g12 = A - B * bCm;
        return { ok: true, gammaN: g12, foraNorma: foraNormaPilar12(bCm, g12) };
      }
      return { ok: false, motivo: "menor dimensão " + fmt(bCm, 1) + " cm < " + (op12 ? mn12 : mn) + " cm: pilar não permitido (6118 13.2.3" + (op12 ? "; nem com a opção de pilar de " + mn12 + " cm" : "") + ")" };
    }
    if (areaCm2 < am - 1e-9) return { ok: false, motivo: "área " + fmt(areaCm2, 0) + " cm² < " + am + " cm² (6118 13.2.3)" };
    return { ok: true, gammaN: bCm >= semG - 1e-9 ? 1 : A - B * bCm };
  }
  /* ℓe = menor entre ℓ0 + h e ℓ (15.6); tudo na mesma unidade */
  function comprimentoEquivalente(l0, h, l) { return Math.min(l0 + h, l); }
  /* λ = ℓe/i, i = h/√12 na seção retangular (Eq. 61 e 62) */
  function esbeltez(le, h) { return Math.sqrt(12) * le / h; }
  /* M1d,mín = Nd·(0,015 + 0,03·h), h em m → Nd em kN, h em cm: kN·cm */
  function momentoMinimo(Nd, hCm) { return Nd * (cv("pilarMomentoMinA", 0.015) * 100 + cv("pilarMomentoMinB", 0.03) * hCm); }
  /* αb (15.8.2): MA = maior |M1d| no lance (≥ 0), rB = MB/MA com sinal (+ se tracionam a mesma face). M1d,A < M1d,mín → 1,0 (item d) */
  function alphaB(MA, rB, Mmin) {
    if (!(MA > Mmin + 1e-9)) return 1.0;
    var a = cv("pilarAlphaBA", 0.6) + cv("pilarAlphaBB", 0.4) * rB;
    return Math.max(cv("pilarAlphaBMin", 0.4), Math.min(1, a));
  }
  /* λ1 (15.8.2): (25 + 12,5·e1/h)/αb, entre 35 e 90 */
  function lambda1(e1, h, aB) {
    var v = (cv("pilarLambda1A", 25) + cv("pilarLambda1B", 12.5) * e1 / h) / aB;
    return Math.max(cv("pilarLambda1Min", 35), Math.min(cv("pilarLambda1Max", 90), v));
  }
  /* curvatura 1/r (15.8.3.3.2): 0,005/[h(ν+0,5)] ≤ 0,005/h */
  function curvatura(nu, h) { var a = cv("pilarCurvaturaA", 0.005); return Math.min(a / (h * (nu + cv("pilarCurvaturaNuSoma", 0.5))), a / h); }
  /* rigidez κ (15.8.3.3.3): forma fechada da 6118 (a·M² + b·M + c = 0), h em cm, Nd em kN, le em cm, M em kN·cm; αbM1 = αb·M1d,A */
  function rigidezKappa(h, Nd, le, aBM1) {
    var a = 5 * h, b = h * h * Nd - Nd * le * le / 320 - 5 * h * aBM1, c = -Nd * h * h * aBM1;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  /* ---------------------------------------------------------------- 2/3. momentos de uma direção
   * p = { h (cm), le (cm), Nd (kN, já com γn), MA (kN·cm, |M1d,A| = o maior ao longo do lance), rB (MB/MA, com sinal; 0 se omitido),
   *       Ac (cm²), mat, metodo: "curvatura" (padrão) | "rigidez" }
   * Devolve os momentos de cálculo nas seções de topo, base e intermediária C (kN·cm) e todos os passos. */
  function momentosDirecao(p, rot) {
    var R = [], h = p.h, le = p.le, Nd = p.Nd, mat = p.mat, MA = Math.abs(num(p.MA, 0)), rB = num(p.rB, 0), Ac = p.Ac, pre = rot ? rot + "." : "";
    var out = { passos: R, avisos: [], pendencias: [], h: h, le: le };
    var lam = passo(R, pre + "lambda", "Índice de esbeltez", esbeltez(le, h), "-", "λ = 3,46·ℓe/h = " + fmt(le, 1) + " / " + fmt(h, 1) + " × 3,46", "NBR 6118 15.8.2, Eq. 61-62");
    out.lambda = lam;
    var Mmin = passo(R, pre + "M1dmin", "Momento mínimo de 1ª ordem", momentoMinimo(Nd, h), "kN·cm", "M1d,mín = Nd·(1,5 + 0,03·h) = " + fmt(Nd, 1) + " × " + fmt(cv("pilarMomentoMinA", 0.015) * 100 + cv("pilarMomentoMinB", 0.03) * h, 3), "NBR 6118 11.3.3.4.3");
    out.Mmin = Mmin;
    if (lam > cv("pilarEsbeltezMax", 200) + 1e-9) {
      /* 15.8.1 (Em1:2026, p.9): λ ≤ 200; só com força normal de cálculo < 0,10·fcd·Ac o λ pode passar de 200 — e mesmo assim só pelo processo geral (15.8.3.2) */
      var pouco = mat && mat.fcd && Ac && Nd < cv("pilarEsbeltezSemLimiteNdFracao", 0.10) * mat.fcd * Ac - 1e-9;
      out.ok = false;
      if (pouco) { out.limite = "lambda>200-pouco-comprimido"; out.motivo = "λ = " + fmt(lam, 1) + " > 200 com Nd < 0,10·fcd·Ac: a 15.8.1 (Em1:2026) admite, mas só pelo processo geral (15.8.3.2) — NÃO implementado no motor"; }
      else { out.limite = "lambda>200"; out.motivo = "λ = " + fmt(lam, 1) + " > 200: não permitido (15.8.1 — só com Nd < 0,10·fcd·Ac pode passar de 200)"; }
      return out;
    }
    if (lam > cv("pilarLambdaGeral", 140) + 1e-9) { out.ok = false; out.limite = "lambda>140"; out.motivo = "λ = " + fmt(lam, 1) + " > 140: só pelo processo geral (15.8.3.2) — NÃO implementado no motor; dimensione com análise não linear"; return out; }
    var aB = passo(R, pre + "alphaB", "Coeficiente αb", alphaB(MA, rB, Mmin), "-", MA > Mmin + 1e-9 ? "αb = 0,6 + 0,4·MB/MA ≥ 0,4 (MB/MA = " + fmt(rB, 3) + ")" : "M1d,A ≤ M1d,mín → αb = 1,0", "NBR 6118 15.8.2");
    var e1 = passo(R, pre + "e1", "Excentricidade de 1ª ordem", MA / Nd, "cm", "e1 = M1d,A/Nd (sem a excentricidade acidental)", "NBR 6118 15.8.2");
    var l1 = passo(R, pre + "lambda1", "Esbeltez limite λ1", lambda1(e1, h, aB), "-", "λ1 = (25 + 12,5·e1/h)/αb, 35 ≤ λ1 ≤ 90", "NBR 6118 15.8.2");
    out.alphaB = aB; out.e1 = e1; out.lambda1 = l1; out.M1dA = MA; out.rB = rB;
    var M1dC = Math.max(cv("pilarM1dCIntermediaria", [0.6, 0.4, 0.4])[0] * MA + cv("pilarM1dCIntermediaria", [0.6, 0.4, 0.4])[1] * rB * MA, cv("pilarM1dCIntermediaria", [0.6, 0.4, 0.4])[2] * MA);
    passo(R, pre + "M1dC", "Momento de 1ª ordem na seção intermediária C", M1dC, "kN·cm", "M1d,C = 0,6·M1d,A + 0,4·M1d,B ≥ 0,4·M1d,A (= αb·M1d,A)", "Bastos, Pilares, Eq. 94");
    out.M1dC = M1dC;
    var fim = Math.max(MA, Mmin);
    out.segOrdem = lam > l1 + 1e-9;
    if (!out.segOrdem) {
      passo(R, pre + "seg", "Efeitos locais de 2ª ordem", 0, "-", "λ = " + fmt(lam, 1) + " ≤ λ1 = " + fmt(l1, 1) + ": desprezados", "NBR 6118 15.8.2");
      out.ok = true; out.metodo = "sem 2ª ordem"; out.M2d = 0; out.MC = Math.max(M1dC, Mmin); out.Mfim = fim;
      out.curvatura = null; out.rigidez = null; passo(R, pre + "Mtot", "Momento total de cálculo", Math.max(out.MC, fim), "kN·cm", "máx(M1d,A; M1d,mín; M1d,C)", "NBR 6118 15.8.2");
      out.Mtot = Math.max(out.MC, fim);
      return out;
    }
    if (lam > cv("pilarLambdaAprox", 90) + 1e-9) {
      out.ok = false; out.limite = "lambda90-140";
      out.motivo = "λ = " + fmt(lam, 1) + " entre 90 e 140: o pilar-padrão com curvatura e com rigidez κ aproximadas só vale até λ = 90 (15.8.3.3.2 e .3); falta o pilar-padrão acoplado a diagramas M-N-1/r (15.8.3.3.4) e a fluência (15.8.4) — NÃO implementados";
      return out;
    }
    /* pilar-padrão com curvatura aproximada (15.8.3.3.2) */
    var nu = passo(R, pre + "nu", "Força normal adimensional", Nd / (Ac * mat.fcd), "-", "ν = Nd/(Ac·fcd)", "NBR 6118 15.8.3.3.2");
    var ir = passo(R, pre + "invr", "Curvatura na seção crítica", curvatura(nu, h), "1/cm", "1/r = 0,005/[h·(ν + 0,5)] ≤ 0,005/h", "NBR 6118 15.8.3.3.2");
    var M2 = passo(R, pre + "M2d", "Momento de 2ª ordem (curvatura aproximada)", Nd * le * le / cv("pilarSegundaOrdemDivisor", 10) * ir, "kN·cm", "M2d = Nd·ℓe²/10·1/r", "NBR 6118 15.8.3.3.2");
    var base = Math.max(aB * MA, Mmin);
    var Mc = Math.max(base + M2, MA);
    out.curvatura = { nu: nu, invr: ir, M2d: M2, base: base, Mtot: Mc, e2: M2 / Nd };
    passo(R, pre + "Mtot.curv", "Momento total (curvatura aproximada)", Mc, "kN·cm", "Md,tot = máx(αb·M1d,A; M1d,mín) + M2d ≥ M1d,A", "NBR 6118 15.8.3.3.2; M1d,mín: 11.3.3.4.3");
    /* pilar-padrão com rigidez κ aproximada (15.8.3.3.3) */
    var M1e = Math.max(MA, Mmin), Ms = rigidezKappa(h, Nd, le, aB * M1e);
    Ms = Math.max(Ms, M1e);
    out.rigidez = { Msd: Ms, M1dAef: M1e, kappa: 32 * (1 + 5 * Ms / (h * Nd)) * nu };
    passo(R, pre + "Mtot.rig", "Momento total (rigidez κ aproximada)", Ms, "kN·cm", "a·M² + b·M + c = 0; a = 5h, b = h²Nd − Nd·ℓe²/320 − 5h·αb·M1d,A, c = −Nd·h²·αb·M1d,A (M1d,A ≥ M1d,mín)", "NBR 6118 15.8.3.3.3");
    var usa = p.metodo === "rigidez" ? "rigidez" : "curvatura";
    out.ok = true; out.metodo = usa; out.M2d = M2; out.MC = usa === "rigidez" ? Ms : Mc; out.Mfim = fim; out.Mtot = Math.max(out.MC, fim);
    passo(R, pre + "Mtot", "Momento total de cálculo (método: " + usa + ")", out.Mtot, "kN·cm", "máx(Md,tot da seção C; M1d,A; M1d,mín)", "NBR 6118 15.8.3.3");
    return out;
  }

  /* ---------------------------------------------------------------- 4. seção resistente por integração */
  function tensaoC(eps, mat) {
    if (eps <= 0) return 0;
    if (eps >= mat.ec2) return mat.ac * mat.fcd;
    return mat.ac * mat.fcd * (1 - Math.pow(1 - eps / mat.ec2, mat.nPar));
  }
  function tensaoS(eps, mat) { var s = eps * mat.Es; return s > mat.fyd ? mat.fyd : (s < -mat.fyd ? -mat.fyd : s); }   /* + compressão */
  /* corda da seção retangular na reta x·cosθ + y·senθ = t */
  function corda(hx, hy, c, s, t) {
    var lo = -1e30, hi = 1e30, a, b;
    if (Math.abs(s) > 1e-12) { a = (t * c - hx / 2) / s; b = (t * c + hx / 2) / s; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    else if (Math.abs(t * c) > hx / 2) return null;
    if (Math.abs(c) > 1e-12) { a = (-hy / 2 - t * s) / c; b = (hy / 2 - t * s) / c; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    else if (Math.abs(t * s) > hy / 2) return null;
    if (!(hi > lo)) return null;
    var u = (lo + hi) / 2;
    CORDA.L = hi - lo; CORDA.xm = t * c - u * s; CORDA.ym = t * s + u * c;
    return CORDA;   /* ⚠ objeto reutilizado (evita alocar 240 objetos por N(q)): quem chama lê L/xm/ym na hora e não guarda a referência */
  }
  var CORDA = { L: 0, xm: 0, ym: 0 };
  /* sec = { hx, hy } (cm); bars = [{ x, y, As }] (cm, origem no CG); θ = ângulo do gradiente de deformações (0 = só direção x); xn = profundidade da linha neutra
   * medida da borda mais comprimida ao longo do gradiente. Domínios 2 → 3 → 4 → 4a → 5 pelos pivôs A (εs = 10 ‰ na barra mais afastada), B (εcu na borda) e C (εc2 a 3/7 da altura). */
  function esforcosPlano(sec, bars, th, xn, mat, modo, nFat) {
    var c = Math.cos(th), s = Math.sin(th), tm = (sec.hx * c + sec.hy * s) / 2, Dd = 2 * tm, tMin = 1e30, i;
    for (i = 0; i < bars.length; i++) tMin = Math.min(tMin, bars[i].x * c + bars[i].y * s);
    var ds = bars.length ? tm - tMin : 0.95 * Dd, x23 = mat.ecu / (mat.ecu + mat.esMax) * ds, kap;
    if (xn <= x23) kap = mat.esMax / (ds - xn); else if (xn <= Dd) kap = mat.ecu / xn; else kap = mat.ec2 / (xn - mat.pivC * Dd);
    var N = 0, Mx = 0, My = 0, zonas = [], zmax = Math.min(xn, Dd), d2;
    if (modo === "retangular") zonas.push([0, Math.min(mat.lam * xn, Dd), 0]);
    else { d2 = Math.max(0, Math.min(zmax, xn - mat.ec2 / kap)); zonas.push([0, d2, 0]); zonas.push([d2, zmax, 1]); }
    zonas.forEach(function (z) {
      if (!(z[1] > z[0])) return;
      var dz = (z[1] - z[0]) / nFat, k, dl, ch, sg, dF;
      for (k = 0; k < nFat; k++) {
        dl = z[0] + (k + 0.5) * dz; ch = corda(sec.hx, sec.hy, c, s, tm - dl); if (!ch) continue;
        sg = z[2] ? tensaoC(kap * (xn - dl), mat) : mat.ac * mat.fcd;
        dF = sg * ch.L * dz; N += dF; Mx += dF * ch.xm; My += dF * ch.ym;
      }
    });
    var epsMin = 1e9, F;
    for (i = 0; i < bars.length; i++) {
      var eb = kap * (xn - (tm - (bars[i].x * c + bars[i].y * s))); epsMin = Math.min(epsMin, eb);
      F = tensaoS(eb, mat) * bars[i].As; N += F; Mx += F * bars[i].x; My += F * bars[i].y;
    }
    return { N: N, Mx: Mx, My: My, kappa: kap, xn: xn, D: Dd, ds: ds, epsMinBarra: epsMin, epsTopo: kap * xn };
  }
  /* para θ e Nd dados: acha xn tal que N_R = Nd (N_R cresce com xn). Devolve { ok, Mx, My, xn, dominio, ... } ou { ok:false, motivo } */
  var MEMO = null;   /* ⚠ cache de curto prazo: vale SÓ enquanto a armadura (bars), a seção e o material são os mesmos — quem liga (a verificação de um arranjo) zera ao trocar */
  function momentoResistente(sec, bars, Nd, mat, opc, th) {
    if (MEMO) { var chave = Nd + "|" + (th || 0), hit = MEMO[chave]; if (hit) return hit; var r0 = momentoResistente0(sec, bars, Nd, mat, opc, th); MEMO[chave] = r0; return r0; }
    return momentoResistente0(sec, bars, Nd, mat, opc, th);
  }
  function momentoResistente0(sec, bars, Nd, mat, opc, th) {
    opc = opc || {}; th = th || 0;
    var nFat = num(opc.fatias, cv("integracaoFatias", 240)), modo = opc.modo || "parabola", Dd = sec.hx * Math.cos(th) + sec.hy * Math.sin(th);
    function N(q) { var xn = Dd * q / (1 - q); return esforcosPlano(sec, bars, th, xn, mat, modo, nFat); }
    var lo = 1e-9, hi = 1 - 1e-9, rl = N(lo), rh = N(hi);
    if (rh.N < Nd - 1e-9) return { ok: false, motivo: "Nd = " + fmt(Nd, 1) + " kN acima da resistência à compressão centrada (" + fmt(rh.N, 1) + " kN) para esta armadura", Nmax: rh.N };
    if (rl.N > Nd + 1e-9) return { ok: false, motivo: "Nd abaixo da resistência à tração: fora do campo (flexo-tração)", Nmin: rl.N };
    /* ⚠ DESEMPENHO (14/11/2026): este laço é o que o "Calcular" mais chama (cada pilar faz milhares de N(q), e cada N(q) integra ~240 fatias). Eram 56 bisseções
     * puras (~2,5 s por pilar; sobrado de 18 pilares ≈ 30 s). Agora é falsa posição com a correção de Illinois: N(q) é contínua e crescente, o intervalo [lo, hi]
     * continua sempre contendo a raiz (mesmo teste "N < Nd" da bisseção) e só termina quando |N − Nd| ≤ 1e-10·(1+|Nd|) kN — erro de momento ~1e-10, bem
     * abaixo de qualquer tolerância do teste e do η ≤ 1 + 1e-9. Se a falsa posição emperrar (sem ganho em 2 passos) cai na bisseção pura. */
    var k, mid, rm = null, fl = rl.N - Nd, fh = rh.N - Nd, lado = 0, tolN = 1e-10 * (1 + Math.abs(Nd)), larg;
    for (k = 0; k < 200; k++) {
      larg = hi - lo;
      mid = (fh - fl) > 0 ? (lo * fh - hi * fl) / (fh - fl) : (lo + hi) / 2;
      if (!(mid > lo + 0.02 * larg && mid < hi - 0.02 * larg)) mid = (k % 3 === 2 || !(mid > lo && mid < hi)) ? (lo + hi) / 2 : Math.min(hi - 0.02 * larg, Math.max(lo + 0.02 * larg, mid));
      rm = N(mid);
      if (Math.abs(rm.N - Nd) <= tolN) break;
      if (rm.N < Nd) lo = mid; else hi = mid;
      if (hi === mid) { fh = rm.N - Nd; if (lado === 1) fl /= 2; lado = 1; } else { fl = rm.N - Nd; if (lado === -1) fh /= 2; lado = -1; }
      if (hi - lo < 1e-15 * (hi + lo)) { rm = N((lo + hi) / 2); break; }
    }
    var xd = rm.xn, dom = xd <= rm.ds * mat.ecu / (mat.ecu + mat.esMax) ? 2 : (rm.epsMinBarra <= -mat.fyd / mat.Es ? 3 : (xd <= rm.D ? (rm.epsMinBarra < 0 ? 4 : 5) : 5));
    rm.ok = true; rm.dominio = dom; rm.theta = th; return rm;
  }
  /* superfície de interação a N = Nd: pontos (Mx, My) para θ de 0 a 90° (1º quadrante; o arranjo é duplamente simétrico) */
  function contorno(sec, bars, Nd, mat, opc, n) {
    var pts = [], k; n = n || 16;
    for (k = 0; k <= n; k++) { var th = k * Math.PI / 2 / n, r = momentoResistente(sec, bars, Nd, mat, opc, th); if (!r.ok) return { ok: false, motivo: r.motivo }; pts.push({ theta: th, Mx: Math.abs(r.Mx), My: Math.abs(r.My) }); }
    return { ok: true, pontos: pts };
  }
  /* MRd na direção do momento solicitante (Mdx, Mdy): ponto do contorno a N = Nd com a mesma razão My/Mx. Devolve { ok, MR, Mrx, Mry, theta, eta } */
  function resistenciaNaDirecao(sec, bars, Nd, Mdx, Mdy, mat, opc) {
    var Md = Math.sqrt(Mdx * Mdx + Mdy * Mdy), r, th0 = 0, th1 = Math.PI / 2;
    if (Md < 1e-9) return { ok: true, MR: Infinity, eta: 0, Mrx: 0, Mry: 0, theta: 0 };
    var alvo = Math.atan2(Math.abs(Mdy), Math.abs(Mdx));
    if (alvo < 1e-9 || alvo > Math.PI / 2 - 1e-9) {
      var t0 = alvo < 1e-9 ? 0 : Math.PI / 2; r = momentoResistente(sec, bars, Nd, mat, opc, t0);
      if (!r.ok) return { ok: false, motivo: r.motivo, eta: Infinity };
      var MR0 = alvo < 1e-9 ? Math.abs(r.Mx) : Math.abs(r.My);
      return { ok: true, MR: MR0, Mrx: Math.abs(r.Mx), Mry: Math.abs(r.My), theta: t0, dominio: r.dominio, xn: r.xn, eta: Md / MR0 };
    }
    function psi(th) { var q = momentoResistente(sec, bars, Nd, mat, opc, th); return q.ok ? { q: q, a: Math.atan2(Math.abs(q.My), Math.abs(q.Mx)) } : null; }
    var a = psi(th0), b = psi(th1), k, tm, pm;
    if (!a || !b) return { ok: false, motivo: "seção não resiste a Nd", eta: Infinity };
    /* varredura grossa para achar o intervalo que contém o ângulo-alvo (o contorno é monótono, mas protege contra irregularidade) */
    var nG = 8, prev = a, prevT = th0, achou = false;
    for (k = 1; k <= nG; k++) { var tk = k * Math.PI / 2 / nG, pk = psi(tk); if (pk && pk.a >= alvo) { th0 = prevT; th1 = tk; a = prev; b = pk; achou = true; break; } prev = pk || prev; prevT = tk; }
    if (!achou) { th0 = prevT; th1 = Math.PI / 2; }
    for (k = 0; k < 30; k++) { tm = (th0 + th1) / 2; pm = psi(tm); if (!pm) break; if (pm.a < alvo) th0 = tm; else th1 = tm; }
    tm = (th0 + th1) / 2; pm = psi(tm); if (!pm) return { ok: false, motivo: "seção não resiste a Nd", eta: Infinity };
    var MR = Math.sqrt(sq(pm.q.Mx) + sq(pm.q.My));
    return { ok: true, MR: MR, Mrx: Math.abs(pm.q.Mx), Mry: Math.abs(pm.q.My), theta: tm, dominio: pm.q.dominio, xn: pm.q.xn, eta: Md / MR };
  }
  /* método simplificado do 17.2.5: (MRd,x/MRd,xx)^α + (MRd,y/MRd,yy)^α ≤ 1 — MRd,xx e MRd,yy são as flexões normais com o mesmo Nd.
   * Aqui MRd,x e MRd,y são os momentos SOLICITANTES (verificação): o valor devolvido é o lado esquerdo (≤ 1 passa). */
  function verificarAlpha(sec, bars, Nd, Mdx, Mdy, mat, opc, alfa) {
    var rx = momentoResistente(sec, bars, Nd, mat, opc, 0), ry = momentoResistente(sec, bars, Nd, mat, opc, Math.PI / 2);
    if (!rx.ok || !ry.ok) return { ok: false, motivo: (rx.ok ? ry : rx).motivo };
    var a = num(alfa, cv("obliquaAlphaRetangular", 1.2)), Mxx = Math.abs(rx.Mx), Myy = Math.abs(ry.My);
    return { ok: true, alfa: a, MRdxx: Mxx, MRdyy: Myy, valor: Math.pow(Math.abs(Mdx) / Mxx, a) + Math.pow(Math.abs(Mdy) / Myy, a) };
  }

  /* ---------------------------------------------------------------- arranjos de barras (cm, origem no CG) */
  /* FCN (ábacos A-1 a A-5 de Venturini): As/2 em cada uma das duas faces perpendiculares à direção da excentricidade, a d' da face */
  function layoutFaces(hx, hy, dl, dir) {
    return function (As) {
      return dir === "y" ? [{ x: 0, y: -(hy / 2 - dl), As: As / 2 }, { x: 0, y: hy / 2 - dl, As: As / 2 }] : [{ x: -(hx / 2 - dl), y: 0, As: As / 2 }, { x: hx / 2 - dl, y: 0, As: As / 2 }];
    };
  }
  /* 4 barras de canto + nx intermediárias em cada lado paralelo a x (y = ±) e ny em cada lado paralelo a y (x = ±), igualmente espaçadas */
  function posicoesPerimetro(hx, hy, dlx, dly, nx, ny) {
    var ax = hx / 2 - dlx, ay = hy / 2 - dly, P = [], i, sg, sy;
    for (sy = -1; sy <= 1; sy += 2) for (sg = -1; sg <= 1; sg += 2) P.push({ x: sg * ax, y: sy * ay, lado: "canto" });
    for (i = 1; i <= nx; i++) { var xi = -ax + i * 2 * ax / (nx + 1); P.push({ x: xi, y: -ay, lado: "x" }); P.push({ x: xi, y: ay, lado: "x" }); }
    for (i = 1; i <= ny; i++) { var yi = -ay + i * 2 * ay / (ny + 1); P.push({ x: -ax, y: yi, lado: "y" }); P.push({ x: ax, y: yi, lado: "y" }); }
    return P;
  }
  function layoutPerimetro(hx, hy, dlx, dly, nx, ny) {
    var P = posicoesPerimetro(hx, hy, dlx, dly, nx, ny);
    return function (As) { return P.map(function (p) { return { x: p.x, y: p.y, As: As / P.length }; }); };
  }

  /* ---------------------------------------------------------------- As por bisseção (o menor As que dá η ≤ 1) */
  function etaDe(sec, bars, Nd, Mdx, Mdy, mat, opc) {
    if (Math.abs(Mdy) < 1e-9 && Math.abs(Mdx) >= 1e-9) { var r = momentoResistente(sec, bars, Nd, mat, opc, 0); return r.ok ? Math.abs(Mdx) / Math.abs(r.Mx) : Infinity; }
    if (Math.abs(Mdx) < 1e-9 && Math.abs(Mdy) >= 1e-9) { var q = momentoResistente(sec, bars, Nd, mat, opc, Math.PI / 2); return q.ok ? Math.abs(Mdy) / Math.abs(q.My) : Infinity; }
    var t = resistenciaNaDirecao(sec, bars, Nd, Mdx, Mdy, mat, opc); return t.ok ? t.eta : Infinity;
  }
  function resolverAs(sec, layout, Nd, Mdx, Mdy, mat, AsMax, opc) {
    var lo = 0, hi = AsMax, k;
    if (etaDe(sec, layout(hi), Nd, Mdx, Mdy, mat, opc) > 1) return { ok: false, As: Infinity, motivo: "As > As,máx = " + fmt(AsMax, 1) + " cm² não basta" };
    if (etaDe(sec, layout(1e-6), Nd, Mdx, Mdy, mat, opc) <= 1) return { ok: true, As: 0 };
    for (k = 0; k < 26; k++) { var m = (lo + hi) / 2; if (etaDe(sec, layout(m), Nd, Mdx, Mdy, mat, opc) > 1) lo = m; else hi = m; }
    return { ok: true, As: hi };
  }

  /* ---------------------------------------------------------------- 5. armadura: limites, estribos, proteção contra flambagem */
  function limitesArmadura(Nd, Ac, mat) {
    var mn = Math.max(cv("pilarAsMinNdFator", 0.15) * Nd / mat.fyd, cv("pilarAsMinTaxa", 0.004) * Ac);
    return { AsMin: mn, AsMax: cv("pilarAsMaxTaxa", 0.04) * Ac };
  }
  function espLivre(phiMm, dmaxMm) { return Math.max(cv("pilarEspLivreMinMm", 20), phiMm, cv("pilarEspLivreAgregado", 1.2) * dmaxMm) / 10; }
  /* estribos (18.4.3): φt ≥ 5 mm e ≥ φ/4; s ≤ 200 mm, ≤ menor dimensão, ≤ 12φ (CA-50) */
  function estribos(phiLongMm, bCm, aco) {
    var lista = cv("estriboBitolasMm", [5, 6.3, 8, 10]).filter(function (p) { return (aco === "CA60" || p >= 6.3) && p >= cv("pilarEstriboPhiMinMm", 5) && p >= cv("pilarEstriboPhiFracao", 0.25) * phiLongMm - 1e-9; });
    if (!lista.length) return { ok: false, motivo: "nenhuma bitola de estribo atende φt ≥ φ/4" };
    var phiT = lista[0], smaxCm = Math.min(cv("pilarEstriboSmaxMm", 200) / 10, bCm, cv("pilarEstriboSmaxPhiCA50", 12) * phiLongMm / 10), s = Math.floor(smaxCm / 0.5) * 0.5;
    return { ok: true, phiT: phiT, s: s, smax: smaxCm, aco: aco || "CA50", texto: "φ " + fmt(phiT, 1) + " c/" + fmt(s, 1) };
  }
  /* proteção contra flambagem das barras (18.2.4): barras de canto e as até 20φt do canto (no máximo 2 nesse trecho) ficam protegidas pelo estribo poligonal;
   * as outras pedem grampo suplementar. P = posições do perímetro { x, y, lado }; devolve as barras sem proteção e o nº de grampos. */
  function protecaoFlambagem(P, hx, hy, dlx, dly, phiTmm) {
    var dist = cv("pilarFlambagemDistPhiT", 20) * phiTmm / 10, mx = cv("pilarFlambagemMaxBarrasTrecho", 2), semProt = { x: [], y: [] };
    ["x", "y"].forEach(function (lado) {
      [-1, 1].forEach(function (sg) {
        var side = P.filter(function (p) { return p.lado === lado && (lado === "x" ? Math.abs(p.y - sg * (hy / 2 - dly)) < 1e-6 : Math.abs(p.x - sg * (hx / 2 - dlx)) < 1e-6); });
        var coord = side.map(function (p) { return lado === "x" ? p.x : p.y; }), ax = (lado === "x" ? hx / 2 - dlx : hy / 2 - dly);
        side.forEach(function (p, i) {
          var c = coord[i], dA = c + ax, dB = ax - c, prot = false;
          function noTrecho(d, de) { var n = 0; coord.forEach(function (cc) { var dd = de === "A" ? cc + ax : ax - cc; if (dd > 1e-6 && dd <= dist + 1e-6) n++; }); return n; }
          if (dA <= dist + 1e-6 && noTrecho(dist, "A") <= mx) prot = true;
          if (dB <= dist + 1e-6 && noTrecho(dist, "B") <= mx) prot = true;
          if (!prot) semProt[lado].push({ x: p.x, y: p.y });
        });
      });
    });
    var nx = semProt.x.length / 2, ny = semProt.y.length / 2;
    return { semProtecao: semProt.x.concat(semProt.y), grampos: Math.ceil(nx) + Math.ceil(ny), distancia: dist, ok: semProt.x.length + semProt.y.length === 0 };
  }

  /* candidatos de arranjo: (φ, nx, ny) com espaçamentos da 18.4.2.2. Ordem: menor As,ef, depois menos barras. */
  function candidatosArranjo(hx, hy, cobCm, phiTmm, dmaxMm, AsMin, AsMax, AsLB, opc) {
    var C = [], bMin = Math.min(hx, hy), phis = cv("bitolasMm", []).filter(function (p) { return p >= cv("pilarPhiMinMm", 10) && p <= Math.min(cv("pilarPhiMaxFracaoB", 0.125) * bMin * 10 + 1e-9, num(opc && opc.phiMax, 25)); });
    var pMax = Math.min(cv("pilarEspMaxEixosFracao", 2) * bMin, cv("pilarEspMaxEixosMm", 400) / 10);
    phis.forEach(function (phi) {
      var dl = cobCm + phiTmm / 10 + phi / 20, ax = hx / 2 - dl, ay = hy / 2 - dl, nx, ny, el = espLivre(phi, dmaxMm);
      if (!(ax > 0 && ay > 0)) return;
      for (nx = 0; nx <= 10; nx++) {
        var px = 2 * ax / (nx + 1); if (px > pMax + 1e-9 || px - phi / 10 < el - 1e-9) { if (px - phi / 10 < el - 1e-9) break; continue; }
        for (ny = 0; ny <= 10; ny++) {
          var py = 2 * ay / (ny + 1); if (py > pMax + 1e-9 || py - phi / 10 < el - 1e-9) { if (py - phi / 10 < el - 1e-9) break; continue; }
          var n = 4 + 2 * nx + 2 * ny, A = n * areaBarra(phi);
          if (A < AsMin - 1e-9 || A > AsMax + 1e-9 || A < 0.97 * AsLB) continue;
          C.push({ phi: phi, nx: nx, ny: ny, n: n, AsEf: A, dl: dl, el: el, px: px, py: py });
        }
      }
    });
    C.sort(function (a, b) { return a.AsEf - b.AsEf || a.n - b.n || b.phi - a.phi; });
    return C;
  }

  /* ---------------------------------------------------------------- 6. pilar completo */
  /* e = { id, marca, hx, hy (m), fck, fyk?, caa, dmaxMm?, controleRigoroso?, estriboAco?, metodo?, posicao? ("intermediario"|"extremidade"|"canto"),
   *       lex, ley (m: comprimentos equivalentes), phiLongMax?, casos: [ { id, Nd (kN, de cálculo, SEM γn), x: { MA, MB } , y: { MA, MB } (kN·m, com sinal) } ] }
   * MA = momento no topo e MB = na base (ou vice-versa — o motor escolhe o de maior módulo como MA e deduz o sinal de rB). */
  function dimensionarPilar(e, opc) {
    opc = opc || {};
    var R = [], avisos = [], pend = [], V = VG(), hx = e.hx * 100, hy = e.hy * 100, Ac = hx * hy, bMin = Math.min(hx, hy);
    var res = { id: e.id, marca: e.marca || "", rotulo: ROTULO, passos: R, avisos: avisos, pendencias: pend, secao: { hx: hx, hy: hy, Ac: Ac } };
    function fail(msg) { res.ok = false; res.atende = false; res.motivo = msg; res.aproveitamento = Infinity; return res; }
    var mat = material(e.fck, e.fyk, { agregado: e.agregado }); if (!mat.ok) return fail(mat.motivo);
    if (Math.max(hx, hy) > cv("pilarParedeRazao", 5) * bMin + 1e-9) return fail("maior dimensão > 5 × a menor: pilar-parede (18.5) — fora do motor");
    var op12 = opc.permitirPilar12 != null ? !!opc.permitirPilar12 : (e.permitirPilar12 != null ? !!e.permitirPilar12 : !!cv("pilarPermitir12Padrao", false));
    var gn = gammaN(bMin, Ac, { permitirPilar12: op12 }); if (!gn.ok) return fail(gn.motivo);
    var g = passo(R, "gammaN", "Coeficiente adicional γn", gn.gammaN, "-", "γn = 1,95 − 0,05·b (b = " + fmt(bMin, 1) + " cm)" + (gn.foraNorma ? " — EXTRAPOLADO da Tabela 13.1 (opção de pilar de 12 cm, decisão do produto)" : ""),
                  gn.foraNorma ? "NBR 6118:2003 13.2.3 (revogada) + estudo UEPG 2023 — decisão do produto; fora da 6118:2023" : "NBR 6118 13.2.3, Tabela 13.1");
    if (gn.foraNorma) {
      res.foraNorma = gn.foraNorma;
      avisos.push("PILAR " + (e.marca || e.id) + " " + gn.foraNorma.texto.toUpperCase() + ": menor dimensão " + fmt(bMin, 1) + " cm, abaixo do mínimo de " + gn.foraNorma.minimoNorma2023Cm + " cm da 6118:2023; γn = " + fmt(g, 3) + " extrapolado da Tabela 13.1 (6118:2003, revogada). Decisão do responsável técnico (ART); a folha sai 'NÃO LIBERADO' sem a assinatura do RT.");
      pend.push("Pilar de " + fmt(bMin, 1) + " cm (fora da NBR 6118:2023, 13.2.3): status decisao-produto — fonte 6118:2003 13.2.3 (revogada) + estudo UEPG 2023 (referência completa a conferir); o RT assume.");
    }
    res.gammaN = g; res.material = { fck: mat.fck, fyk: mat.fyk, fcd: mat.fcd, fyd: mat.fyd };
    var casos = arr(e.casos); if (!casos.length) return fail("sem combinação de esforços");
    /* ⚠ flexo-tração (revisão de cálculo 14/11/2026): UMA combinação com N ≥ 0 basta para o pilar NÃO poder ser dimensionado aqui — ignorá-la (como era antes) deixava o pilar "ok" sem a
     * combinação que pode governar a armadura. Fica "sem-cálculo" (nunca ok), com o motivo. */
    var tracionados = casos.filter(function (c) { return !(c.Nd > 0); });
    if (tracionados.length) { res.semCalculo = true; return fail("flexo-tração não implementada: combinação " + tracionados.map(function (c) { return c.id; }).join(", ") + " com N ≥ 0 (tração) — o engenheiro dimensiona à parte"); }
    var lex = e.lex * 100, ley = e.ley * 100;
    var posicao = e.posicao || "intermediario";
    res.posicao = posicao;
    var phiTmm = num(e.phiEstribo, 6.3), cobCm = V.cobrimento(num(e.caa, 2), mat.fck, !!e.controleRigoroso);
    passo(R, "cobrimento", "Cobrimento nominal", cobCm, "cm", "Tabela 7.2 (pilar), CAA " + num(e.caa, 2), "NBR 6118 7.4.7.6");

    /* 1) momentos por caso (kN·cm), nas duas direções */
    var porCaso = [], motivoLimite = null, lanceMaior = {};
    casos.forEach(function (c) {
      var Nd = g * c.Nd, o = { id: c.id, Nd: Nd, dir: {}, secoes: {} }, ok = true;
      ["x", "y"].forEach(function (d) {
        var h = d === "x" ? hx : hy, le = d === "x" ? lex : ley, ent = c[d] || {}, Ma = 100 * g * num(ent.MA, 0), Mb = 100 * g * num(ent.MB, 0);
        var Mmax = Math.abs(Ma) >= Math.abs(Mb) ? Ma : Mb, Mout = Math.abs(Ma) >= Math.abs(Mb) ? Mb : Ma, rB = Math.abs(Mmax) > 1e-9 ? Mout / Mmax : 0;
        /* ⚠ momento do lance (revisão 14/11/2026): o maior |M| de TODAS as estações de TODAS as barras do lance (barras "#k"), não só o das duas pontas. Se ele passa o das pontas, vira o
         * M1d,A e αb = 1,0 (rB = 1: a favor da segurança, pois o diagrama já não é o linear entre as extremidades que o αb pressupõe). */
        var Ml = 100 * g * num(ent.Mlance, 0), MAef = Math.abs(Mmax);
        if (Ml > MAef + 1e-9) { MAef = Ml; rB = 1; lanceMaior[d] = true; }
        var q = momentosDirecao({ h: h, le: le, Nd: Nd, MA: MAef, rB: rB, Ac: Ac, mat: mat, metodo: opc.metodo || e.metodo }, "c" + c.id + "." + d);
        q.MA = MAef; q.MBabs = Math.abs(Mout); o.dir[d] = q;
        if (!q.ok) { ok = false; if (!motivoLimite) motivoLimite = "direção " + d + ": " + q.motivo; }
      });
      o.ok = ok;
      if (ok) {
        /* seções críticas: as duas extremidades (cada uma comparada ao momento mínimo; sem 2ª ordem) e a seção intermediária C (com a 2ª ordem) */
        ["x", "y"].forEach(function (d) {
          var q = o.dir[d], ent = c[d] || {};
          o.secoes[d] = { base: Math.max(Math.abs(num(ent.MA, 0)) * 100 * g, q.Mmin), topo: Math.max(Math.abs(num(ent.MB, 0)) * 100 * g, q.Mmin), C: q.Mtot };
        });
      }
      porCaso.push(o);
    });
    res.casos = porCaso;
    ["x", "y"].forEach(function (d) { if (lanceMaior[d]) avisos.push("Direção " + d + ": em alguma combinação o maior |M| ao longo do lance (estações de todas as barras) passa o das extremidades — adotado como M1d,A, com αb = 1,0."); });
    var utilizaveis = porCaso.filter(function (o) { return o.ok; });
    if (!utilizaveis.length) {
      if (motivoLimite) return fail(motivoLimite);
      return fail(porCaso.map(function (o) { return "caso " + o.id + ": " + o.motivo; }).join("; "));
    }
    porCaso.filter(function (o) { return !o.ok && o.motivo; }).forEach(function (o) { avisos.push("Caso " + o.id + " ignorado: " + o.motivo + "."); });
    if (porCaso.some(function (o) { return !o.ok && !o.motivo; })) avisos.push("Há combinações fora do campo do motor (λ > 90): " + (motivoLimite || "") + ".");
    /* passos do caso mais crítico (maior Nd) para o memorial */
    var crit = utilizaveis.slice().sort(function (a, b) { return b.Nd - a.Nd; })[0];
    ["x", "y"].forEach(function (d) { crit.dir[d].passos.forEach(function (p) { R.push(p); }); });
    res.esbeltez = { x: crit.dir.x.lambda, y: crit.dir.y.lambda };
    res.criticos = utilizaveis.map(function (o) { return o.id; });

    /* 2) verificações (por caso): FCN em x e em y; oblíqua se canto ou se as duas direções têm M1 acima do mínimo */
    function verificacoes(o) {
      var v = [], ox = o.secoes.x, oy = o.secoes.y, qx = o.dir.x, qy = o.dir.y;
      var Mx = Math.max(ox.topo, ox.base, ox.C), My = Math.max(oy.topo, oy.base, oy.C);
      v.push({ tipo: "FCN-x", caso: o.id, Nd: o.Nd, Mdx: Mx, Mdy: 0 }); v.push({ tipo: "FCN-y", caso: o.id, Nd: o.Nd, Mdx: 0, Mdy: My });
      var duas = qx.M1dA > qx.Mmin + 1e-9 && qy.M1dA > qy.Mmin + 1e-9;
      if (posicao === "canto" || duas || opc.obliquaSempre) ["topo", "base", "C"].forEach(function (s) { v.push({ tipo: "oblíqua-" + s, caso: o.id, Nd: o.Nd, Mdx: ox[s], Mdy: oy[s] }); });
      return v;
    }
    var checks = []; utilizaveis.forEach(function (o) { checks = checks.concat(verificacoes(o)); });
    res.verificacoes = checks.length;

    /* 3) limites de armadura e limite inferior de As (FCN com a armadura nas faces, d' de referência φ 16) */
    var NdMax = Math.max.apply(null, utilizaveis.map(function (o) { return o.Nd; }));
    var lim = limitesArmadura(NdMax, Ac, mat);
    passo(R, "AsMin", "Armadura mínima", lim.AsMin, "cm²", "As,mín = máx(0,15·Nd/fyd; 0,004·Ac)", "NBR 6118 17.3.5.3.1");
    passo(R, "AsMax", "Armadura máxima", lim.AsMax, "cm²", "As,máx = 0,04·Ac na seção corrente (os 8 % do 17.3.5.3.2 só valem somando a região de emenda — revisão de cálculo 14/11/2026)", "NBR 6118 17.3.5.3.2");
    var dlRef = cobCm + phiTmm / 10 + 1.6 / 2, AsLB = 0, AsCalcFaces = { x: 0, y: 0 }, falhaLB = null;
    var secG = { hx: hx, hy: hy };
    ["x", "y"].forEach(function (d) {
      utilizaveis.forEach(function (o) {
        var M = d === "x" ? Math.max(o.secoes.x.topo, o.secoes.x.base, o.secoes.x.C) : Math.max(o.secoes.y.topo, o.secoes.y.base, o.secoes.y.C);
        var s = resolverAs(secG, layoutFaces(hx, hy, dlRef, d), o.Nd, d === "x" ? M : 0, d === "y" ? M : 0, mat, lim.AsMax, opc);
        if (!s.ok) { falhaLB = falhaLB || ("caso " + o.id + " direção " + d + ": " + s.motivo); AsCalcFaces[d] = Infinity; } else AsCalcFaces[d] = Math.max(AsCalcFaces[d], s.As);
      });
      AsLB = Math.max(AsLB, AsCalcFaces[d]);
    });
    res.AsCalcFaces = AsCalcFaces;
    passo(R, "AsCalc.x", "Armadura calculada, direção x (As/2 em cada face, d' = " + fmt(dlRef, 1) + " cm)", AsCalcFaces.x, "cm²", "integração da seção (parábola-retângulo, CA-50): η = Md/MRd = 1", "NBR 6118 17.2.2 e 8.2.10.1");
    passo(R, "AsCalc.y", "Armadura calculada, direção y (As/2 em cada face, d' = " + fmt(dlRef, 1) + " cm)", AsCalcFaces.y, "cm²", "integração da seção (parábola-retângulo, CA-50): η = Md/MRd = 1", "NBR 6118 17.2.2 e 8.2.10.1");

    /* 4) escolha do arranjo no perímetro */
    var dmax = num(e.dmaxMm, cv("dmaxAgregadoMm", 19)), escolhido = null, etaEscolhido = 0, tentativas = 0, nOblMax = 0, cands;
    if (isFinite(AsLB)) {
      cands = candidatosArranjo(hx, hy, cobCm, phiTmm, dmax, lim.AsMin, lim.AsMax, AsLB, opc);
      /* menor As,ef que passa; depois, até +15 % de As,ef, o arranjo com MENOS barras (pilar com 14φ10 não se executa: decisão do produto) */
      for (var ci = 0; ci < cands.length; ci++) {
        var cd = cands[ci]; if (escolhido && cd.AsEf > 1.15 * escolhido.AsEf + 1e-9) break;
        if (escolhido && cd.n >= escolhido.n) continue;
        var layout = layoutPerimetro(hx, hy, cd.dl, cd.dl, cd.nx, cd.ny), bars = layout(cd.AsEf), eta = 0, pior = null;
        tentativas++;
        MEMO = {};   /* a armadura é a mesma para todas as verificações deste arranjo: os pontos do contorno (θ = 0, 90° e a grade) se repetem entre elas */
        try {
          for (var k = 0; k < checks.length; k++) {
            var ch = checks[k], et = etaDe(secG, bars, ch.Nd, ch.Mdx, ch.Mdy, mat, opc);
            if (et > eta) { eta = et; pior = ch; }
            if (eta > 1 + 1e-9) break;
          }
        } finally { MEMO = null; }
        if (eta <= 1 + 1e-9) { escolhido = cd; etaEscolhido = eta; escolhido.pior = pior; }
      }
    }
    res.tentativas = tentativas;
    if (!escolhido) {
      res.ok = true; res.atende = false; res.aproveitamento = Infinity;
      res.motivo = falhaLB ? "a seção não resiste: " + falhaLB : "nenhum arranjo de barras (φ de 10 a 25 mm, taxa ≤ 4 % na seção corrente, espaçamentos do 18.4.2.2) atende aos esforços";
      avisos.push("PILAR REPROVADO: " + res.motivo + ".");
      if (!opc.semSugestao) res.sugestao = sugerirSecao(e, opc);
      if (res.sugestao && res.sugestao.ok) avisos.push("Sugestão de seção: " + res.sugestao.texto + ".");
      pend.push("SEM FONTE: fyk CA-50 (categoria) e bitolas (NBR 7480 fora da biblioteca)");
      return res;
    }
    var dl = escolhido.dl, P = posicoesPerimetro(hx, hy, dl, dl, escolhido.nx, escolhido.ny), layoutF = layoutPerimetro(hx, hy, dl, dl, escolhido.nx, escolhido.ny);
    /* As calculada com o MESMO arranjo (perímetro) — vale como As,calc do pilar; As,ef é o das barras escolhidas */
    var AsCalcArr = 0, resolvido = true;
    checks.forEach(function (ch) { var s = resolverAs(secG, layoutF, ch.Nd, ch.Mdx, ch.Mdy, mat, lim.AsMax, opc); if (!s.ok) resolvido = false; else AsCalcArr = Math.max(AsCalcArr, s.As); });
    var AsReq = Math.max(AsCalcArr, lim.AsMin);
    passo(R, "AsCalc", "Armadura calculada com o arranjo escolhido (barras no perímetro)", AsCalcArr, "cm²", "bisseção em As até η = 1 em todas as verificações", "NBR 6118 17.2.2, 17.2.5");
    passo(R, "AsEf", "Armadura efetiva", escolhido.AsEf, "cm²", escolhido.n + " φ " + fmt(escolhido.phi, 1), "NBR 6118 18.4.2");
    var est = estribos(escolhido.phi, bMin, e.estriboAco || "CA50");
    if (!est.ok) { avisos.push("Estribos: " + est.motivo); }
    else passo(R, "estribo", "Estribos", est.s, "cm", "φt = " + fmt(est.phiT, 1) + " mm ≥ máx(5; φ/4); s ≤ mín(20 cm; " + fmt(bMin, 1) + " cm; 12φ = " + fmt(12 * escolhido.phi / 10, 1) + " cm)", "NBR 6118 18.4.3");
    var flamb = protecaoFlambagem(P, hx, hy, dl, dl, est.ok ? est.phiT : phiTmm);
    passo(R, "flambagem", "Barras sem proteção do estribo poligonal (a mais de 20φt do canto)", flamb.semProtecao.length, "barras", "grampos suplementares: " + flamb.grampos, "NBR 6118 18.2.4");
    if (!flamb.ok) avisos.push("Proteção contra flambagem das barras (18.2.4): " + flamb.semProtecao.length + " barra(s) a mais de 20φt do canto — " + flamb.grampos + " grampo(s) suplementar(es) (estribo reto com ganchos atravessando a seção).");
    if (est.ok && phiTmm !== est.phiT) { avisos.push("φ do estribo adotado " + fmt(est.phiT, 1) + " mm (a posição das barras foi calculada com " + fmt(phiTmm, 1) + " mm): se mudar, recalcule d'."); }
    if (est.ok && Math.abs(est.phiT - phiTmm) > 1e-9 && est.phiT > phiTmm) {
      /* d' real é maior: reverifica o arranjo com o φt do estribo escolhido */
      var dl2 = cobCm + est.phiT / 10 + escolhido.phi / 20, b2 = layoutPerimetro(hx, hy, dl2, dl2, escolhido.nx, escolhido.ny)(escolhido.AsEf), e2 = 0;
      checks.forEach(function (ch) { e2 = Math.max(e2, etaDe(secG, b2, ch.Nd, ch.Mdx, ch.Mdy, mat, opc)); });
      if (e2 > 1 + 1e-9) { avisos.push("Com φt = " + fmt(est.phiT, 1) + " mm (d' maior) o arranjo deixa de atender (η = " + fmt(e2, 3) + "): aumente a armadura ou a seção."); etaEscolhido = e2; }
      else etaEscolhido = Math.max(etaEscolhido, e2);
    }
    /* 5) superfície de interação do arranjo escolhido (pior caso) e método α */
    var pc = escolhido.pior || checks[0], barsF = layoutF(escolhido.AsEf);
    var cont = contorno(secG, barsF, pc.Nd, mat, opc, 12);
    var alfaRet = (pc.Mdx > 1e-9 && pc.Mdy > 1e-9) ? verificarAlpha(secG, barsF, pc.Nd, pc.Mdx, pc.Mdy, mat, opc, cv("obliquaAlphaRetangular", 1.2)) : null;
    var alfaUm = (pc.Mdx > 1e-9 && pc.Mdy > 1e-9) ? verificarAlpha(secG, barsF, pc.Nd, pc.Mdx, pc.Mdy, mat, opc, cv("obliquaAlphaGeral", 1.0)) : null;
    var rn = resistenciaNaDirecao(secG, barsF, pc.Nd, pc.Mdx, pc.Mdy, mat, opc);
    res.interacao = { caso: pc.caso, tipo: pc.tipo, Nd: pc.Nd, Mdx: pc.Mdx, Mdy: pc.Mdy, MRd: rn.MR, dominio: rn.dominio, contorno: cont.ok ? cont.pontos : null, alfa1_2: alfaRet, alfa1_0: alfaUm };
    if (alfaRet && alfaRet.ok && alfaRet.valor > 1 + 1e-9 && etaEscolhido <= 1 + 1e-9) avisos.push("O método simplificado do 17.2.5 (α = 1,2) daria " + fmt(alfaRet.valor, 3) + " > 1 neste arranjo; a verificação pelo contorno exato da seção (adotada) dá η = " + fmt(etaEscolhido, 3) + ".");
    res.ok = true; res.aproveitamento = etaEscolhido; res.atende = etaEscolhido <= 1 + 1e-9;
    res.armadura = { AsCalc: AsCalcArr, AsMin: lim.AsMin, AsMax: lim.AsMax, AsReq: AsReq, AsEf: escolhido.AsEf, phi: escolhido.phi, n: escolhido.n, nx: escolhido.nx, ny: escolhido.ny, dl: dl, taxa: escolhido.AsEf / Ac,
                     texto: escolhido.n + " φ " + fmt(escolhido.phi, 1) + " (" + fmt(r2(escolhido.AsEf), 2) + " cm², " + fmt(100 * escolhido.AsEf / Ac, 2) + " %)", barras: barsF, posicoes: P, espLivreMin: escolhido.el, pitchX: escolhido.px, pitchY: escolhido.py };
    res.estribos = est.ok ? { phiT: est.phiT, s: est.s, texto: est.texto, grampos: flamb.grampos, semProtecao: flamb.semProtecao } : null;
    res.governa = escolhido.pior ? { caso: escolhido.pior.caso, tipo: escolhido.pior.tipo } : null;
    avisos.push("Armadura constante ao longo do lance (15.8.1), dimensionada para TODAS as combinações ELU; 2ª ordem global só pelo 0,95·γz do 15.7.2 quando 1,1 < γz ≤ 1,3 (acima disso o pilar fica sem cálculo); fluência NÃO entra.");
    pend.push("SEM FONTE: fyk CA-50 (categoria) e bitolas (NBR 7480 fora da biblioteca)");
    pend.push("Normas lidas na 6118:2014 (biblioteca): conferir no exemplar 6118:2026 (a Em1:2026 altera o 15.8.1) — P1.");
    return res;
  }

  /* sugestão de seção: aumenta o MENOR lado de 5 em 5 cm (até +20) e depois os dois lados (+5, +10, +15) */
  function sugerirSecao(e, opc) {
    var tent = [[0, 5], [0, 10], [0, 15], [0, 20], [5, 5], [10, 10], [15, 15]], menorX = e.hx <= e.hy, i;
    for (i = 0; i < tent.length; i++) {
      var dMaior = tent[i][0], dMenor = tent[i][1], e2 = {}, o2 = {};
      Object.keys(e).forEach(function (k) { e2[k] = e[k]; });
      e2.hx = e.hx + (menorX ? dMenor : dMaior) / 100; e2.hy = e.hy + (menorX ? dMaior : dMenor) / 100;
      Object.keys(opc || {}).forEach(function (k) { o2[k] = opc[k]; }); o2.semSugestao = true; o2.permitirPilar12 = false;   /* a sugestão automática NUNCA propõe lado < 14 cm (mesmo com a opção de 12 cm ligada) */
      if (Math.min(e2.hx, e2.hy) * 100 < cv("pilarDimMinCm", 14) - 1e-9) continue;
      var r = dimensionarPilar(e2, o2);
      if (r.ok && r.atende && r.armadura && r.armadura.taxa <= 0.04) return { ok: true, hx: e2.hx, hy: e2.hy, texto: fmt(e2.hx * 100, 0) + " × " + fmt(e2.hy * 100, 0) + " cm (" + r.armadura.texto + ")", armadura: r.armadura.texto };
    }
    return { ok: false, texto: "nenhuma seção até +20 cm resolve — revise o lançamento (carga, vão, número de pavimentos)" };
  }

  /* seção própria do memorial (C6) para os pilares de 12 a 14 cm: texto FIXO da decisão de 14/11/2026 (sem frase de que o software assume responsabilidade) + a lista de cada pilar
   * com N, M, γn e taxa de aço. pilares = resultados de dimensionarPilar com foraNorma. */
  function textoMemorialPilar12(pilares) {
    var itens = pilares.map(function (q) {
      var Nd = 0, M = 0; arr(q.casos).forEach(function (c) { if (c.Nd > Nd) Nd = c.Nd; ["x", "y"].forEach(function (d) { var v = c.secoes && c.secoes[d] ? c.secoes[d].C : 0; if (v > M) M = v; }); });
      return { marca: q.marca || q.id, secao: fmt(q.secao.hx, 0) + " × " + fmt(q.secao.hy, 0) + " cm", NdKN: Nd, MdKNm: M / 100, gammaN: q.gammaN, taxaAco: q.armadura ? q.armadura.taxa : null, atende: !!q.atende };
    });
    var marcas = itens.map(function (i) { return i.marca; }).join(", ");
    return { texto: String(cv("pilar12TextoMemorial", "")).split("{pilares}").join(marcas), itens: itens, liberado: false,
             marcaSemAssinatura: "NÃO LIBERADO", nota: "N e M já com γn; M = maior momento total (seção C) entre as direções e combinações; sem a assinatura do RT a folha sai NÃO LIBERADO" };
  }

  /* ---------------------------------------------------------------- 7. ligação com a C1: ConcAnalise → pilares (lances) */
    function dimensionarDeAnalise(an, opc) {
    opc = opc || {};
    if (!an || !an.ok) return { ok: false, motivo: "análise ausente ou inválida" };
    var m = an.modelo, ELU = an.combinacoes.filter(function (c) { return c.tipo === "ELU"; }), avisos = [], pend = [], pilares = [], nosId = {};
    if (!ELU.length) return { ok: false, motivo: "sem combinação ELU" };
    arr(m.nos).forEach(function (n) { nosId[n.id] = n; });
    /* ⚠ γz (revisão de cálculo 14/11/2026, 6118 15.7.2): 1,1 < γz ≤ 1,3 → os esforços horizontais (vento/desaprumo) das combinações ELU entram × 0,95·γz (a C1 refaz a análise e guarda em
     * an.resultadosGz, só das combinações majoradas) e o pilar é redimensionado com eles; γz > 1,3 (ou instável) → o processo aproximado não vale: pilar "sem-cálculo", NUNCA verde.
     * Antes a estrutura de nós móveis só ganhava um aviso e o pilar saía verde com momentos de nós fixos. */
    var gz = arr(an.gammaZ).filter(function (g) { return g.aplicavel !== false; });   /* γz só vale com ≥ 4 pavimentos (15.5.3); com o desaprumo (Em1) a C1 calcula γz informativo em casas térreas */
    var gzMax = gz.length ? Math.max.apply(null, gz.map(function (g) { return isFinite(g.gammaZ) ? g.gammaZ : Infinity; })) : null;
    var gzFixo = cv("gammaZNosFixosMax", 1.1), gzTeto = cv("gammaZTetoProcessoAproximado", 1.3), semCalcGz = null, majorar = false, rGz = an.resultadosGz || {};
    if (gzMax != null && gzMax > gzTeto + 1e-9) semCalcGz = "γz = " + (isFinite(gzMax) ? fmt(gzMax, 3) : "instável") + " > 1,3: estrutura de nós móveis fora do alcance do processo aproximado do 15.7.2 — análise de 2ª ordem global (P-delta) pelo engenheiro";
    else if (gzMax != null && gzMax > gzFixo + 1e-9) {
      majorar = true;
      gz.forEach(function (g) { if (g.gammaZ > gzFixo + 1e-9 && g.gammaZ <= gzTeto + 1e-9 && !rGz[g.combinacao] && !semCalcGz) semCalcGz = "γz = " + fmt(g.gammaZ, 3) + " > 1,1 mas a C1 não entregou os esforços majorados por 0,95·γz (combinação " + g.combinacao + ")"; });
      if (!semCalcGz) avisos.push("γz máximo = " + fmt(gzMax, 3) + " (> 1,1 e ≤ 1,3): estrutura de NÓS MÓVEIS — esforços horizontais (vento/desaprumo) das combinações ELU multiplicados por 0,95·γz e pilares redimensionados (15.7.2); a 2ª ordem local segue o pilar-padrão.");
    }
    function est(c, bid) { var r = (majorar && rGz[c.id]) || an.resultados[c.id]; return r && r.esforcos[bid] ? r.esforcos[bid].estacoes : []; }
    if (semCalcGz) avisos.push("Pilares SEM CÁLCULO: " + semCalcGz + ".");
    else if (gzMax == null) avisos.push("γz não calculado (sem vento informado ou menos de 4 pavimentos): nós fixos ASSUMIDOS (15.5); o contraventamento fica por conta do engenheiro.");
    /* vigas que chegam a um nó, por direção do plano do pilar */
    var barrasNo = {}; arr(m.barras).forEach(function (b) { if (b.tipo !== "viga" && b.tipo !== "rigido") return; (barrasNo[b.ni] = barrasNo[b.ni] || []).push(b); (barrasNo[b.nj] = barrasNo[b.nj] || []).push(b); });
    function vigasNoNo(nid, p) {
      var u = [Math.cos(p.rotY), -Math.sin(p.rotY)], w = [Math.sin(p.rotY), Math.cos(p.rotY)], o = { x: { lado: [], h: 0 }, y: { lado: [], h: 0 } };
      arr(barrasNo[nid]).forEach(function (b) {
        if (b.tipo !== "viga") return;
        var N0 = nosId[nid], O = nosId[b.ni === nid ? b.nj : b.ni], dx = O.x - N0.x, dz = O.z - N0.z, l = Math.sqrt(dx * dx + dz * dz); if (l < 1e-9) return;
        var du = (dx * u[0] + dz * u[1]) / l, dw = (dx * w[0] + dz * w[1]) / l, pv = m.pecas.vigas[b.peca], h = pv ? pv.h : 0;
        if (Math.abs(du) > 0.9) { o.x.lado.push(du > 0 ? 1 : -1); o.x.h = Math.max(o.x.h, h); }
        else if (Math.abs(dw) > 0.9) { o.y.lado.push(dw > 0 ? 1 : -1); o.y.h = Math.max(o.y.h, h); }
      });
      return o;
    }
    var lances = {}; arr(m.barras).forEach(function (b) { if (b.tipo === "pilar") (lances[b.peca] = lances[b.peca] || []).push(b); });
    var pids = Object.keys(lances).sort();
    function fazerLance(pid) {
      var bs = lances[pid].slice().sort(function (a, b) { return nosId[a.ni].y - nosId[b.ni].y; }), p = m.pecas.pilares[pid], o = (opc.porPeca && opc.porPeca[pid]) || {};
      var b0 = bs[0], bN = bs[bs.length - 1], L = Math.abs(nosId[bN.nj].y - nosId[b0.ni].y);
      var vt = vigasNoNo(bN.nj, p), vb = vigasNoNo(b0.ni, p), r = { id: pid, marca: p.marca };
      if (semCalcGz) {
        var hxg = p.comp * 100, hyg = p.esp * 100, dg = { id: pid, marca: p.marca || "", rotulo: ROTULO, ok: false, atende: false, semCalculo: true, motivo: semCalcGz, aproveitamento: Infinity, passos: [], avisos: ["PILAR SEM CÁLCULO: " + semCalcGz + "."], pendencias: [], secao: { hx: hxg, hy: hyg, Ac: hxg * hyg }, casos: [] };
        dg.lance = { L: L, base: nosId[b0.ni].y, topo: nosId[bN.nj].y, continuidade: {}, barras: bs.map(function (b) { return b.id; }), nCombinacoes: 0, selecionadas: [] };
        pilares.push(dg); return;
      }
      /* classificação: direção contínua = vigas dos dois lados (no topo; se o topo não tem viga, na base) */
      var nNao = 0, ref = (vt.x.lado.length + vt.y.lado.length) ? vt : vb, cont = {};
      ["x", "y"].forEach(function (d) { var s = ref[d].lado, ok = s.indexOf(1) >= 0 && s.indexOf(-1) >= 0; cont[d] = ok; if (!ok) nNao++; });
      var posicao = o.posicao || (nNao === 0 ? "intermediario" : (nNao === 1 ? "extremidade" : "canto"));
      var lef = {};
      ["x", "y"].forEach(function (d) {
        var h = (d === "x" ? p.comp : p.esp), hv = (vt[d].h + vb[d].h) / 2, l0 = Math.max(L - hv, 0.5 * L);
        if (!vt[d].lado.length && !vb[d].lado.length) avisos.push("Pilar " + (p.marca || pid) + ": sem viga no plano " + d + " nas duas extremidades — ℓe = ℓ (a favor da segurança); conferir a vinculação.");
        lef[d] = comprimentoEquivalente(l0, h, L);
      });
      /* casos: cada combinação ELU, com N no pilar inteiro (o lance, do pé ao topo) e momentos das duas extremidades */
      var cs = [];
      ELU.forEach(function (c) {
        var sb = est(c, b0.id), st = est(c, bN.id); if (!sb.length || !st.length) return;
        var s0 = sb[0], s1 = st[st.length - 1];   /* N > 0 é tração no AcoAnalise: a compressão do lance é a maior (mais negativa) das extremidades */
        var Mzl = 0, Myl = 0;   /* maior |M| de todas as estações de todas as barras do lance (as barras "#k") */
        bs.forEach(function (bb) { est(c, bb.id).forEach(function (s) { Mzl = Math.max(Mzl, Math.abs(s.Mz)); Myl = Math.max(Myl, Math.abs(s.My)); }); });
        cs.push({ id: c.id, Nd: -Math.min(s0.N, s1.N), x: { MA: s0.Mz, MB: s1.Mz, Mlance: Mzl }, y: { MA: s0.My, MB: s1.My, Mlance: Myl } });
      });
      /* ⚠ TODAS as combinações ELU entram no dimensionamento (revisão 14/11/2026): a seleção antiga de 4 (maior N, maior Mx, maior My, maior Mx/hx + My/hy) podia perder a que governa
       * a armadura (a razão M/N de uma combinação intermediária pode ser pior que as 4 escolhidas). As com N ≥ 0 vão junto: o dimensionarPilar as recusa (flexo-tração → sem-cálculo). */
      var uniq = cs.slice();
      var ent = { id: pid, marca: p.marca, hx: p.comp, hy: p.esp, fck: an.modelo.fck || o.fck || opc.fck, fyk: opc.fyk, caa: num(opc.caa, 2), dmaxMm: opc.dmaxMm, controleRigoroso: opc.controleRigoroso, estriboAco: opc.estriboAco,
                  metodo: opc.metodo, posicao: posicao, lex: lef.x, ley: lef.y, casos: uniq };
      if (o.permitirPilar12 != null) ent.permitirPilar12 = o.permitirPilar12;
      if (o.fck) ent.fck = o.fck;
      var dp = dimensionarPilar(ent, opc);
      dp.lance = { L: L, base: nosId[b0.ni].y, topo: nosId[bN.nj].y, continuidade: cont, barras: bs.map(function (b) { return b.id; }), nCombinacoes: cs.length, selecionadas: uniq.map(function (c) { return c.id; }) };
      pilares.push(dp);
    }
    /* ⚠ FATIAMENTO (14/11/2026): com opc.fatiado a função NÃO dimensiona nada de uma vez — devolve { fatiado, total, passo(), fechar() } e quem chama (o "Calcular" da tela,
     * js/conccalcular.js) dimensiona UM pilar por fatia de tempo, para a tela nunca congelar. passo() faz o próximo lance; fechar() devolve o MESMO objeto da chamada direta. */
    var proximo = 0;
    function fechar() {
    var mx = 0, nao = 0, lim = 0;
    pilares.forEach(function (q) { if (q.aproveitamento > mx && isFinite(q.aproveitamento)) mx = q.aproveitamento; if (!q.atende) nao++; if (q.ok === false) lim++; });
    pend.push("Base do térreo sem baldrame/sapata no modelo (fundação: C9): o comprimento equivalente usa só as vigas do topo e o limite ℓ.");
    avisos.push("Esforços de 1ª ordem por lance lidos nas extremidades de cada pilar na análise da C1 (rigidez bruta), com o maior |M| de todas as estações do lance; todas as combinações ELU dimensionadas.");
    var fn = pilares.filter(function (q) { return q.foraNorma; });
    var memorial12 = fn.length ? textoMemorialPilar12(fn) : null;
    if (fn.length) avisos.push(fn.length + " pilar(es) com menor dimensão de 12 a 14 cm — FORA da NBR 6118:2023 (13.2.3), habilitados pela opção de projeto do RT: " + fn.map(function (q) { return q.marca || q.id; }).join(", ") + ".");
    return { ok: true, rotulo: ROTULO, pilares: pilares, aproveitamento: mx, naoAtendem: nao, foraDoCampo: lim, avisos: avisos, foraNorma: fn.map(function (q) { return q.id; }), memorialPilar12: memorial12,
             pendencias: pend.concat(D() ? D().semFonte().map(function (x) { return "SEM FONTE: " + x.chave + " (" + x.item + ")"; }) : []) };
    }
    if (opc.fatiado) return { ok: true, fatiado: true, total: pids.length, passo: function () { if (proximo < pids.length) fazerLance(pids[proximo++]); return proximo >= pids.length; }, fechar: fechar };
    pids.forEach(fazerLance);
    return fechar();
  }

  var ConcPilar = {
    material: material, gammaN: gammaN, comprimentoEquivalente: comprimentoEquivalente, esbeltez: esbeltez, momentoMinimo: momentoMinimo, alphaB: alphaB, lambda1: lambda1,
    curvatura: curvatura, rigidezKappa: rigidezKappa, momentosDirecao: momentosDirecao, esforcosPlano: esforcosPlano, momentoResistente: momentoResistente, contorno: contorno,
    resistenciaNaDirecao: resistenciaNaDirecao, verificarAlpha: verificarAlpha, layoutFaces: layoutFaces, posicoesPerimetro: posicoesPerimetro, layoutPerimetro: layoutPerimetro,
    resolverAs: resolverAs, limitesArmadura: limitesArmadura, estribos: estribos, protecaoFlambagem: protecaoFlambagem, candidatosArranjo: candidatosArranjo,
    dimensionarPilar: dimensionarPilar, dimensionarDeAnalise: dimensionarDeAnalise, sugerirSecao: sugerirSecao, textoMemorialPilar12: textoMemorialPilar12
  };
  global.ConcPilar = ConcPilar;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcPilar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

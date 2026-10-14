/* =====================================================================
 * metalacessos.js — ACESSOS INDUSTRIAIS: geometria paramétrica (motor PURO,
 * ES5, sem DOM, Node-testável). 14/10/2026.
 *
 * Registra no js/metalprontas.js (MetalProntas.registrarTipo) os tipos:
 *   marinheiro   escada fixa tipo marinheiro: montantes em barra chata,
 *                degraus em barra redonda, suportes na parede, GAIOLA
 *                (arcos + barras verticais) automática acima de 3,50 m,
 *                lances de no máximo 6 m com PLATAFORMA DE DESCANSO e eixos
 *                deslocados (acima de 10 m), saída no topo com os montantes
 *                passando 1,10 m e CANCELA de autofechamento;
 *   plataforma   plataforma de manutenção retangular (2 cliques): pilares,
 *                vigas, piso em grade, guarda-corpo NR-12 (1,10 m +
 *                intermediária a 0,70 m + rodapé 0,20 m) com a ABERTURA de
 *                acesso e cancela;
 *   anelar       plataforma ANELAR em volta de tanque/equipamento: consoles
 *                radiais no costado (com mão-francesa), viga de borda,
 *                piso em setores de grade, guarda-corpo na borda de fora e
 *                nas pontas (uma ponta fica aberta para o acesso);
 *   passarela    passarela reta (2 cliques: começo e fim) apoiada nas pontas
 *                ou em pilares, guarda-corpo dos dois lados;
 *   guardacorpo  guarda-corpo avulso (2 cliques) com montantes, corrimão,
 *                intermediária, rodapé;
 *   piso         painéis de piso (2 cliques): grade eletrofundida, chapa
 *                xadrez, chapa expandida ou perfurada, com o peso do tipo.
 * A escada industrial (reta, com patamares, em L, em U, caracol; NR-12,
 * NBR 9050, NBR 9077) é a "escada" do js/metalprontas.js com `norma`.
 *
 * Cada gerador devolve em `medidas.acesso` a geometria para o verificador
 * de norma (AcoAcessos.verificar) e em `medidas.dim` os itens para o
 * dimensionamento (AcoAcessos.dimensionar) — a tela mostra os dois.
 *
 * API para a frente de TANQUES:
 *   MetalAcessos.emVoltaDoCilindro(o) → par do tipo "anelar"
 *   MetalAcessos.marinheiroNoCilindro(o) → par do tipo "marinheiro" no costado
 *   MetalAcessos.conjuntoTanque(o, novoId) → { anelar, marinheiro } (gerados)
 *   o = { x0, y0, z0 (centro do tanque na base), raio (externo do costado, m),
 *         altura (cota do piso da plataforma), largura, angIni (°), abertura (°),
 *         angEscada (°, onde sobe a marinheiro) }
 * Teste: node tools/test-aco-acessos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MP() { return dep("MetalProntas", "./metalprontas.js"); }
  function AC() { return dep("AcoAcessos", "./acoacessos.js"); }
  var GRAU = Math.PI / 180;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function brf(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* ------------------------------------------------- guarda-corpo NR-12 (alturas) */
  var GC = { altura: 1.10, intermediaria: 0.70, rodape: 0.20, tRodape: 0.00475 };
  function optGuarda(H, p, gid) {
    var alts = [num(p.alturaGuarda, GC.altura)];
    if (num(p.intermediaria, GC.intermediaria) > 0) alts.push(num(p.intermediaria, GC.intermediaria));
    return { gid: gid, montante: p.montante, corrimao: p.corrimao, altura: alts[0], alturas: alts, espac: num(p.espac, 1.2), aco: "ASTM A36", rodape: p.rodape === false ? 0 : num(p.hRodape, GC.rodape), tRodape: num(p.tRodape, GC.tRodape),
      /* GANCHO S10: o terminal de cada ponta livre (retorno | curva | tampao) e a perna da solda da base — js/metaldetalhe.js */
      terminal: { ini: p.terminalIni, fim: p.terminalFim }, perna: p.perna };
  }
  function acessoGuarda(H, p, lados, protegidos) {
    var pc = H.perfilDe(p.corrimao);
    return { ladosLivres: lados, ladosProtegidos: protegidos, altura: num(p.alturaGuarda, GC.altura), alturas: num(p.intermediaria, GC.intermediaria) > 0 ? [num(p.intermediaria, GC.intermediaria)] : [], rodape: p.rodape === false ? 0 : num(p.hRodape, GC.rodape), espacMontantes: num(p.espac, 1.2), superiorPlano: pc ? pc.forma !== "tubo-circ" : null };
  }
  function pisoSobre(H, K, c, p, mat) {
    /* o peso do piso conforme o tipo (grade pela geometria, xadrez, expandida, perfurada) */
    if (!c || !c.metal) return c;
    if (mat === "grade") return H.aplicarGrade(c, p);
    var A = AC(); if (!A) return c;
    var kg = A.pisoKgM2(mat, { t: c.metal.t, cordao: p.cordao, losangoMenor: p.losangoMenor, furoD: p.furoD, furoPasso: p.furoPasso }), Ar = c.metal.dim ? num(c.metal.dim.areaLiq, 0) : 0, ms = r4(kg.kgm2 * Ar);
    c.metal.papel = mat === "xadrez" ? "Piso em chapa xadrez" : (mat === "expandida" ? "Piso em chapa expandida" : (mat === "perfurada" ? "Piso em chapa perfurada" : "Piso em chapa"));
    c.metal.piso = { tipo: mat, kgm2: kg.kgm2, fonte: kg.fonte };
    c.massa = ms; c.volume = r4(ms / H.RHO * 1e2) / 1e2; c.medidas = c.medidas || {}; c.medidas.massa = ms; c.medidas.volume = c.volume;
    return c;
  }
  function cont0(K, k) { return K && K.cont && K.cont[k] ? K.cont[k] : 0; }
  function espPiso(p) { return p.piso === "grade" ? num(p.gradeH, 0.03) : num(p.tPiso, 0.00635); }
  function dimPiso(p, vao) { return { tipo: "piso", material: p.piso === "grade" ? "grade" : (p.piso === "xadrez" ? "chapa" : p.piso), vao: vao, t: num(p.tPiso, 0.00635), gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, q: AC() ? AC().sobrecarga(p.usoPiso, p.qInformado).q : 3 }; }
  function qDe(p, tipo) { return AC() ? AC().sobrecarga(p.usoPiso, p.qInformado, tipo).q : 3; }
  function gPisoDe(H, p) { var A = AC(); if (!A) return 0.5; var k = p.piso === "grade" ? A.pisoKgM2("grade", p).kgm2 : A.pisoKgM2(p.piso === "xadrez" ? "xadrez" : p.piso, { t: p.tPiso }).kgm2; return r4(k * 9.81 / 1000); }
  /* a CANCELA de autofechamento: quadro de tubo na abertura (a, b no mundo local; y = piso) */
  function cancela(H, K, a, b, y, p, nome) {
    var pc = H.perfilDe(p.corrimao) || H.perfilDe("HSS48.3X3.7"); if (!pc) return 0;
    var d = H.sub(b, a); d[1] = 0; var Lc = H.len(d) - 0.04; if (!(Lc > 0.2)) return 0;
    var u = H.unit(d), A0 = H.add(H.add(a, H.mul(u, 0.02)), [0, 0, 0]), n0 = K.pecas.length, hs = [0.15, 0.55, 1.0];
    [0, Lc].forEach(function (s) { K.perfil({ origem: H.add(A0, H.add(H.mul(u, s), [0, y + 0.1, 0])), ex: H.UP, ey: [1, 0, 0], perfil: pc, L: 0.95, papel: "Cancela de autofechamento", ifc: "IFCDOOR", aco: "ASTM A36", lig: "gc-cancela-" + nome, nome: "Cancela — montante" }, "cancela"); });
    hs.forEach(function (h) { K.perfil({ origem: H.add(A0, [0, y + 0.1 + h * 0.95 / 1.0 * (h === 1.0 ? 1 : 1), 0]), ex: u, ey: H.UP, perfil: pc, L: Lc, papel: "Cancela de autofechamento", ifc: "IFCDOOR", aco: "ASTM A36", lig: "gc-cancela-" + nome, nome: "Cancela — travessa" }, "cancela"); });
    for (var i = n0; i < K.pecas.length; i++) K.pecas[i].metal.acessorio = "cancela";
    K.avisos.push("Cancela de autofechamento: dobradiça com mola (ou gravidade) abrindo para dentro da plataforma, fechando sozinha — especificar o fabricante");
    return K.pecas.length - n0;
  }

  /* ================================================================ MARINHEIRO
   * local: u = da escada para a PAREDE (a parede fica em u = afast), y para cima, w = largura.
   * origem = o pé da escada (piso), no eixo dos degraus. */
  var MARINHEIRO = { rotulo: "Escada de marinheiro", cliques: 1, calcula: true, PADRAO: {
    altura: 6.0, largura: 0.45, espac: 0.30, afast: 0.18, diamDegrau: 0.025, secaoDegrau: "redonda", montB: 0.0635, montT: 0.0095,
    gaiola: "auto", gaiolaInicio: 2.0, gaiolaDiam: 0.70, gaiolaVert: 0.25, arcosEsp: 1.20, arcoB: 0.050, arcoT: 0.00635,
    ultrapassa: 1.10, lanceMax: 6.0, deslocLances: 0.80, espFixacao: 2.0, cancela: true, antiderrapante: true, outrosImpossiveis: false, spqDefinido: false, projetoHabilitado: false, saida: "frente", desembarqueLarg: 0.80,
    patamarProf: 0.80, montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espacGuarda: 1.0, usoGuarda: "industrial", piso: "grade", gradeH: 0.030, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    patamarPerfil: "C150X12.2", aco: "ASTM A36" },
    nums: ["altura", "largura", "espac", "afast", "diamDegrau", "montB", "montT", "gaiolaInicio", "gaiolaDiam", "gaiolaVert", "arcosEsp", "arcoB", "arcoT", "ultrapassa", "lanceMax", "deslocLances", "espFixacao", "patamarProf", "espacGuarda", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS"],
    bools: ["cancela", "antiderrapante", "outrosImpossiveis", "spqDefinido", "projetoHabilitado"], perfis: ["montante", "corrimao", "patamarPerfil"],
    validar: function (p) {
      if (!(p.altura >= 0.8 && p.altura <= 40)) return "Escada de marinheiro: altura entre 0,80 e 40 m.";
      if (!(p.largura >= 0.3 && p.largura <= 0.8)) return "Largura entre montantes de 0,30 a 0,80 m (a NR-12 pede 0,40 a 0,60 m).";
      if (!(p.espac >= 0.2 && p.espac <= 0.4)) return "Espaçamento máximo dos degraus de 0,20 a 0,40 m.";
      if (!(p.afast >= 0.05 && p.afast <= 0.6)) return "Afastamento da parede de 0,05 a 0,60 m.";
      if (!(p.diamDegrau >= 0.016 && p.diamDegrau <= 0.05)) return "Degrau (barra redonda) de 16 a 50 mm.";
      if (p.gaiola !== "nao" && !(p.gaiolaDiam > p.largura + 0.1 && p.gaiolaDiam <= 1.2)) return "Gaiola: o diâmetro passa a largura da escada em pelo menos 10 cm.";
      if (!(p.lanceMax >= 2 && p.lanceMax <= 10)) return "Altura máxima por lance de 2 a 10 m.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var W = p.largura, gid = String(novoId()), n0 = K.pecas.length, temGaiola = p.gaiola === "sim" || (p.gaiola === "auto" && p.altura > 3.5);
      /* NR-12, Anexo III, 13 f) e g): lance único até 10 m; acima, lances de no máximo 6 m (lanceMax) com plataforma de descanso */
      var nL = p.altura <= 10 ? 1 : Math.max(2, Math.ceil(p.altura / p.lanceMax - 1e-9));
      var hL = p.altura / nL, espReal = 0, primeiro = 0, ok = 0;
      var R = p.gaiolaDiam / 2, uc = -Math.sqrt(Math.max(0, R * R - W * W / 4)), phs = Math.atan2(W / 2, -uc);
      var lances = [];
      for (var i = 0; i < nL; i++) {
        var yb = hL * i, yt = hL * (i + 1), wc = (i % 2) * Math.max(p.deslocLances, 0.70);   /* lances alternados, eixos deslocados (13 g) */
        var topo = i === nL - 1, ext = p.ultrapassa;   /* passa 1,10 m acima do piso de cima e de cada plataforma de descanso (13 d) */
        /* MONTANTES (barra chata): do piso até o topo + 1,10 m */
        [1, -1].forEach(function (sg) {
          var w0 = wc + (sg > 0 ? W / 2 + p.montT : -W / 2);
          K.chapa({ origem: [-p.montB / 2, yb, w0], ex: H.UP, ey: [1, 0, 0], t: p.montT, ret: { L: yt - yb + ext, B: p.montB }, papel: "Montante da escada de marinheiro", aco: p.aco, nome: "Montante " + (sg > 0 ? "esquerdo" : "direito") + " — lance " + (i + 1) }, "montantes");
        });
        /* DEGRAUS: barra redonda, espaçamento igual ≤ espac; o último no nível de cima */
        var nD = Math.max(1, Math.ceil((yt - yb) / p.espac - 1e-9)), s = (yt - yb) / nD;
        if (i === 0) { espReal = s; primeiro = s; }
        for (var k = 1; k <= nD; k++) {
          K.perfil({ origem: [0, yb + k * s, wc - W / 2], ex: [0, 0, 1], ey: H.UP, perfil: p.secaoDegrau === "quadrada" ? { forma: "ret", b: p.diamDegrau, h: p.diamDegrau } : { forma: "circ", d: p.diamDegrau }, L: W, papel: "Degrau da escada de marinheiro", ifc: "IFCMEMBER", aco: p.aco, nome: "Degrau " + k + " — lance " + (i + 1) }, "degraus");
        }
        /* SUPORTES na parede (orelhas) a cada espFixacao, dos dois lados */
        var nS = Math.max(2, Math.ceil((yt - yb + ext * (topo ? 1 : 0)) / p.espFixacao - 1e-9) + 1);
        for (var j = 0; j < nS; j++) {
          var ys = yb + 0.3 + (yt - yb + (topo ? ext - 0.3 : 0) - 0.6) * j / (nS - 1);
          [1, -1].forEach(function (sg) {
            var w0 = wc + (sg > 0 ? W / 2 + p.montT : -W / 2);
            K.chapa({ origem: [p.montB / 2, ys, w0], ex: [1, 0, 0], ey: H.UP, t: p.montT, ret: { L: Math.max(0.02, p.afast - p.montB / 2), B: 0.08 }, papel: "Suporte da escada de marinheiro", aco: p.aco, nome: "Suporte " + (j + 1) + " — lance " + (i + 1) }, "suportes");
          });
        }
        /* GAIOLA: arcos a cada ≤ arcosEsp de gaiolaInicio até o topo + ultrapassa; barras verticais a ≤ gaiolaVert */
        if (temGaiola) {
          var yA0 = i === 0 ? yb + p.gaiolaInicio : yb + 0.1, yA1 = yt + ext;
          if (yA1 - yA0 > 0.3) {
            var nA = Math.max(1, Math.ceil((yA1 - yA0) / p.arcosEsp - 1e-9)), arc = R * (2 * Math.PI - 2 * phs), nV = Math.max(2, Math.ceil(arc / p.gaiolaVert - 1e-9) - 1);
            for (var a = 0; a <= nA; a++) {
              var ya = yA0 + (yA1 - yA0) * a / nA, C = [], q;
              for (q = 0; q <= 24; q++) { var th = phs + (2 * Math.PI - 2 * phs) * q / 24; C.push([uc + R * Math.cos(th), wc + R * Math.sin(th)]); }
              for (q = 24; q >= 0; q--) { var th2 = phs + (2 * Math.PI - 2 * phs) * q / 24; C.push([uc + (R - p.arcoB) * Math.cos(th2), wc + (R - p.arcoB) * Math.sin(th2)]); }
              K.chapa({ origem: [0, ya, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: p.arcoT, contorno: C, papel: "Arco da gaiola", aco: p.aco, nome: "Arco da gaiola " + (a + 1) + " — lance " + (i + 1) }, "arcos");
            }
            for (var v = 1; v <= nV; v++) {
              /* barra chata vertical por DENTRO dos arcos: chapa com a largura na tangente e a espessura no raio */
              var tv = phs + (2 * Math.PI - 2 * phs) * v / (nV + 1), r0 = R - p.arcoB - p.arcoT, Tg = [-Math.sin(tv), 0, Math.cos(tv)];
              K.chapa({ origem: [uc + r0 * Math.cos(tv) - Tg[0] * p.arcoB / 2, yA0 - p.arcoT, wc + r0 * Math.sin(tv) - Tg[2] * p.arcoB / 2], ex: H.UP, ey: Tg, t: p.arcoT, ret: { L: yA1 - yA0 + p.arcoT, B: p.arcoB }, papel: "Barra vertical da gaiola", aco: p.aco, nome: "Barra vertical " + v + " — lance " + (i + 1) }, "verticais");
            }
            lances.push({ nV: nV, nA: nA + 1, espArcos: (yA1 - yA0) / nA, espVert: arc / (nV + 1), inicio: yA0 - yb, ultrapassa: yA1 - yt });
          }
        }
        /* PLATAFORMA DE DESCANSO entre lances (eixos deslocados): grade sobre dois consoles, guarda-corpo de fora */
        if (!topo) {
          var wa = -W / 2 - 0.15, wb = Math.max(p.deslocLances, 0.7) + W / 2 + 0.15;   /* cobre os dois lances (o de baixo e o de cima) */
          var ua = -p.patamarProf, ub = p.afast, tP = num(p.gradeH, 0.03), pq = H.perfilDe(p.patamarPerfil);
          var c = K.chapa({ origem: [ua, yt, wa], ex: [1, 0, 0], ey: [0, 0, 1], t: tP, ret: { L: ub - ua, B: wb - wa }, papel: "Piso da plataforma de descanso", aco: "ASTM A36", nome: "Plataforma de descanso " + (i + 1) }, "patamares");
          if (c) H.aplicarGrade(c, p);
          [wa + 0.05, wb - 0.05].forEach(function (w, jj) { K.barra([ub, yt - tP, w], [ua, yt - tP, w], { ferr: "viga", cat: pq ? pq.cat : p.patamarPerfil, just: "topo", papel: "Console da plataforma de descanso", ifc: "IFCMEMBER", aco: p.aco, nome: "Console da plataforma " + (i + 1) + "-" + (jj + 1) }, "consoles"); });
          var go = optGuarda(H, { montante: p.montante, corrimao: p.corrimao, espac: p.espacGuarda }, gid + "-pd" + i);
          H.guardaCorpo(K, [[ub, yt, wa], [ua, yt, wa], [ua, yt, wb], [ub, yt, wb]], go);
        }
      }
      for (var z = n0; z < K.pecas.length; z++) if (K.pecas[z].metal && !K.pecas[z].metal.acessorio && /gaiola|Arco|vertical/i.test(K.pecas[z].metal.papel || "")) K.pecas[z].metal.acessorio = "gaiola";
      /* SAÍDA NO TOPO: cancela de autofechamento na abertura do piso de cima (na linha da parede) */
      var wTop = ((nL - 1) % 2) * Math.max(p.deslocLances, 0.70);
      if (p.saida === "esquerda" || p.saida === "direita") {
        /* SAÍDA LATERAL: plataforma de desembarque ao lado da escada, no nível de cima, com guarda-corpo e a cancela junto do montante */
        var sgS = p.saida === "esquerda" ? 1 : -1, wi = wTop + sgS * (W / 2 + p.montT + 0.02), wo = wi + sgS * num(p.desembarqueLarg, 0.8), ua2 = -0.80, ub2 = p.afast, tP2 = num(p.gradeH, 0.03), pq2 = H.perfilDe(p.patamarPerfil);
        var cD = K.chapa({ origem: [ua2, p.altura, Math.min(wi, wo)], ex: [1, 0, 0], ey: [0, 0, 1], t: tP2, ret: { L: ub2 - ua2, B: Math.abs(wo - wi) }, papel: "Piso da plataforma de desembarque", aco: "ASTM A36", nome: "Plataforma de desembarque" }, "desembarque");
        if (cD) H.aplicarGrade(cD, p);
        [wi + sgS * 0.05, wo - sgS * 0.05].forEach(function (w, jj) { K.barra([ub2, p.altura - tP2, w], [ua2, p.altura - tP2, w], { ferr: "viga", cat: pq2 ? pq2.cat : p.patamarPerfil, just: "topo", papel: "Console da plataforma de desembarque", ifc: "IFCMEMBER", aco: p.aco, nome: "Console do desembarque " + (jj + 1) }, "consoles"); });
        H.guardaCorpo(K, [[ua2, p.altura, wi], [ua2, p.altura, wo], [ub2, p.altura, wo]], optGuarda(H, { montante: p.montante, corrimao: p.corrimao, espac: p.espacGuarda }, gid + "-de"));
        if (p.cancela) cancela(H, K, [ua2 + 0.05, 0, wi], [ub2 - 0.05, 0, wi], p.altura, { corrimao: p.corrimao }, gid);
      } else if (p.cancela) cancela(H, K, [p.afast + 0.06, 0, wTop - W / 2 - 0.05], [p.afast + 0.06, 0, wTop + W / 2 + 0.05], p.altura, { corrimao: p.corrimao }, gid);
      if (!temGaiola && p.altura > 3.5) K.avisos.push("SEM GAIOLA acima de 3,50 m: não atende a NR-12, Anexo III, 13 c)");
      K.avisos.push("Degraus em barra " + (p.secaoDegrau === "quadrada" ? "quadrada de " : "redonda Ø ") + brf(p.diamDegrau * 1000, 0) + " mm " + (p.antiderrapante ? "serrilhados/recartilhados (especificar)" : "LISOS — a NR-12 (13 l) pede superfície contra deslizamento"));
      K.avisos.push("Suportes (orelhas) e chumbadores na parede/equipamento: a detalhar com a estrutura onde fixa");
      var g0 = lances[0] || {};
      var acesso = { tipo: "marinheiro", perfil: "nr12", desnivel: p.altura, largura: W, lances: nL, desnivelEntrePatamares: r4(hL), angulo: 90,
        marinheiro: { gaiola: temGaiola, gaiolaInicio: temGaiola ? r4(g0.inicio) : null, gaiolaUltrapassa: temGaiola ? r4(g0.ultrapassa) : null, montantesUltrapassa: p.ultrapassa, deslocLances: nL > 1 ? Math.max(p.deslocLances, 0.7) : null,
          espacDegraus: r4(espReal), primeiroDegrau: r4(primeiro), afastamento: p.afast, diamDegrau: p.diamDegrau, secaoDegrau: p.secaoDegrau, antiderrapante: !!p.antiderrapante, gaiolaDiametro: temGaiola ? p.gaiolaDiam : null,
          gaiolaEspacVert: temGaiola ? r4(g0.espVert) : null, gaiolaEspacArcos: temGaiola ? r4(g0.espArcos) : null, gaiolaArranjo: "verticais", cancela: !!p.cancela,
          justificado: !!p.outrosImpossiveis, spq: p.spqDefinido ? true : null, projeto: p.projetoHabilitado ? true : null, descansoLateral: nL > 1 ? true : null } };
      var dim = { itens: [{ tipo: "marinheiro", P: 2.5, largura: W, diamDegrau: p.diamDegrau, secaoDegrau: p.secaoDegrau, montB: p.montB, montT: p.montT, espFixacao: p.espFixacao, aco: p.aco }], naoVerificados: [] };
      if ((nL > 1 || cont0(K, "desembarque")) && H.perfilDe(p.montante)) dim.itens.push({ tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: p.espacGuarda });
      if (nL > 1 && H.perfilDe(p.patamarPerfil)) dim.itens.push({ tipo: "console", perfil: p.patamarPerfil, aco: p.aco, L: p.patamarProf + p.afast, area: (p.patamarProf + p.afast) * (W + 0.7 + 0.3) / 2, q: 3, espac: 1.0 });
      var cont = K.cont;
      return { resumo: "Escada de marinheiro de " + brf(p.altura) + " m" + (nL > 1 ? " em " + nL + " lances com " + (nL - 1) + " plataforma(s) de descanso" : "") + ": " + (cont.degraus || 0) + " degraus a " + brf(espReal * 100, 1) + " cm" + (temGaiola ? ", gaiola com " + (cont.arcos || 0) + " arcos e " + (cont.verticais || 0) + " barras verticais" : ", sem gaiola") + (cont.desembarque ? ", saída pela " + p.saida + " com plataforma de desembarque" : "") + (p.cancela ? ", cancela no topo" : ""),
        medidas: { lances: nL, espac: espReal, gaiola: temGaiola, acesso: acesso, dim: dim } };
    },
    dica: { titulo: "Escada de marinheiro", oQueE: "Escada fixa vertical com montantes, degraus em barra redonda, gaiola acima de 3,50 m, plataformas de descanso nos lances e cancela na saída.", ondeUsa: "Tanque, silo, cobertura, poço, equipamento alto — só quando rampa ou escada não cabem (NR-12, Anexo III, 1.3).", dica: "Largura 0,40–0,60 m, degraus a 0,25–0,30 m, gaiola Ø 0,65–0,80 m a partir de 2,00 m, montantes passando 1,10 m do topo (NR-12, 13)." },
    desenho: function (D) {
      var s = D.mem(120, 190, 120, 20, false, 5) + D.mem(160, 190, 160, 20, false, 5), i;
      for (i = 0; i < 11; i++) s += D.ln(120, 180 - i * 15, 160, 180 - i * 15, D.DSTL, 3);
      for (i = 0; i < 4; i++) s += '<ellipse cx="140" cy="' + (120 - i * 30) + '" rx="34" ry="8" fill="none" stroke="' + D.DST + '" stroke-width="2.4"/>';
      s += D.ln(108, 130, 108, 25, D.DST, 1.6) + D.ln(172, 130, 172, 25, D.DST, 1.6) + D.ln(200, 20, 300, 20, D.AUX, 1, "4 3");
      s += D.tx(210, 140, "gaiola > 3,50 m") + D.tx(210, 160, "degraus 25–30 cm") + D.tx(210, 40, "+1,10 m no topo");
      return s;
    }
  };

  /* ================================================================ PLATAFORMA (retangular, mezanino com NR-12) */
  var PLATAFORMA = { rotulo: "Plataforma de manutenção", cliques: 2, modo: "retangulo", calcula: true, PADRAO: {
    Lx: 4, Lz: 2.5, vaosX: 1, vaosZ: 1, altura: 3.0, direcao: "x", principal: "W200X15", secundaria: "W150X13", pilar: "W150X22.5", espSec: 1.0,
    piso: "grade", tPiso: 0.00635, gradeH: 0.030, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    frente: true, fundo: true, esquerda: true, direita: true, abertura: "frente", aberturaPos: 0.5, aberturaLarg: 0.80, cancela: true,
    montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, rodape: true, hRodape: 0.20, intermediaria: 0.70,
    contraventar: true, contraventoPlano: true, contravento: "BR 5/8\" (D 15,88 mm) Gerdau", placaBase: true, usoPiso: "area-tecnica",   /* rodada 2 da simulação S1: X de barra redonda (a L 51 fura a esbeltez exigida) */ usoGuarda: "industrial", qInformado: 0, abastecimento: false, aco: "ASTM A572 Gr.50" },
    nums: ["Lx", "Lz", "vaosX", "vaosZ", "altura", "espSec", "tPiso", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "aberturaPos", "aberturaLarg", "espac", "hRodape", "intermediaria", "qInformado"],
    bools: ["frente", "fundo", "esquerda", "direita", "cancela", "rodape", "contraventar", "contraventoPlano", "placaBase", "abastecimento"],
    perfis: ["principal", "secundaria", "pilar", "montante", "corrimao"],
    validar: function (p, H) { return H.validar("mezanino", mezPar(p)); },
    gerar: function (p, K, novoId, ctx, H) {
      var q = H.normalizar("mezanino", mezPar(p)), r = H.geradores.mezanino(q, K, novoId);
      if (!r || r.erro) return r;
      var ab = r.medidas.abertura;
      if (p.cancela && ab) cancela(H, K, ab.a, ab.b, 0, p, "pl");
      marcarMomento(K, p, Math.round(p.vaosX) > 1 || Math.round(p.vaosZ) > 1);
      var dx = p.direcao !== "z", S = dx ? p.Lx : p.Lz, T = dx ? p.Lz : p.Lx, nS = Math.round(dx ? p.vaosX : p.vaosZ), nT = Math.round(dx ? p.vaosZ : p.vaosX);
      var sSec = r.medidas.sSec || [], espS = 0; for (var i = 1; i < sSec.length; i++) espS = Math.max(espS, sSec[i] - sSec[i - 1]);
      var lados = ["frente", "fundo", "esquerda", "direita"].filter(function (k) { return p[k]; }).length;
      var q0 = qDe(p, "plataforma"), g0 = gPisoDe(H, p);
      r.medidas.acesso = { tipo: "plataforma", perfil: "nr12", largura: Math.min(p.Lx, p.Lz), comprimento: Math.max(p.Lx, p.Lz), abastecimento: !!p.abastecimento, alturaLivre: null, guarda: acessoGuarda(H, p, 4, lados), aberturaSemCancela: !!(ab && !p.cancela) };
      r.medidas.dim = { itens: [
        { tipo: "viga", nome: "Viga principal", perfil: p.principal, aco: p.aco, L: S / nS, faixa: T / nT / 2, q: q0, gPiso: g0, travadaPeloPiso: false },
        { tipo: "viga", nome: "Viga secundária", perfil: p.secundaria, aco: p.aco, L: T / nT, faixa: espS, q: q0, gPiso: g0, travadaPeloPiso: true },
        dimPiso(p, espS),
        { tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: p.espac }],
        naoVerificados: ["pilares e contraventamento: verificados em Cálculo › Estrutura desenhada (Verificar acesso › Calcular a estrutura)", "não verificado: ligações viga × viga e viga × pilar e as placas de base"] };
      if (precisaMomento(p, Math.round(p.vaosX) > 1 || Math.round(p.vaosZ) > 1)) r.medidas.dim.avisos = [TEXTO_MOMENTO];
      r.resumo = r.resumo.replace(/^Mezanino/, "Plataforma de manutenção");
      return r;
    },
    dica: { titulo: "Plataforma de manutenção", oQueE: "Plataforma retangular completa: pilares, vigas, piso em grade, guarda-corpo NR-12 com intermediária a 0,70 m e rodapé de 0,20 m, abertura de acesso com cancela.", ondeUsa: "Acesso a válvulas, motores, filtros, topo de máquina, área técnica elevada.", dica: "Dois cliques nos cantos. A abertura fica no lado escolhido para a chegada da escada ou da marinheiro." },
    desenho: function (D) {
      var s = '<polygon points="40,100 200,70 290,110 130,145" fill="' + D.DST + '" fill-opacity="0.3" stroke="' + D.DSTL + '"/>';
      [[40, 100], [200, 70], [290, 110], [130, 145]].forEach(function (q) { s += D.mem(q[0], q[1], q[0], q[1] + 50, false, 5); s += D.ln(q[0], q[1], q[0], q[1] - 40, D.ACOL, 2); });
      s += D.ln(40, 60, 200, 30, D.ACOL, 2) + D.ln(200, 30, 290, 70, D.ACOL, 2) + D.ln(290, 70, 210, 87, D.ACOL, 2) + D.ln(170, 96, 130, 105, D.ACOL, 2) + D.ln(130, 105, 40, 60, D.ACOL, 2);
      s += D.ln(40, 80, 200, 50, D.AUX, 1.4) + D.tx(160, 190, "1,10 m · 0,70 m · rodapé 0,20 m", "middle") + D.tx(190, 125, "abertura", "middle");
      return s;
    }
  };
  /* SEM CONTRAVENTAMENTO (o engenheiro desligou): a estabilidade passa a depender de LIGAÇÃO DE MOMENTO viga-pilar e
     viga-viga — as vigas ficam marcadas (metal.exigeMomento) para a sugestão de ligação propor a ligação de momento */
  var TEXTO_MOMENTO = "Sem contraventamento: a estrutura só fica estável com LIGAÇÃO DE MOMENTO viga-pilar e viga-viga (premissa rígida no cálculo) — dimensione e detalhe a ligação de momento (Ligação inteligente); executada rotulada, vira mecanismo";
  function precisaMomento(p, multi) { return p.contraventar === false || (multi && p.contraventoPlano === false); }
  function marcarMomento(K, p, multi) {
    if (!precisaMomento(p, multi)) return 0;
    var n = 0; K.pecas.forEach(function (c) { if (c.metal && c.metal.kind === "perfil" && /^Viga (principal|secundária)/.test(c.metal.papel || "")) { c.metal.exigeMomento = { ini: true, fim: true, motivo: TEXTO_MOMENTO }; n++; } });
    K.avisos.unshift(TEXTO_MOMENTO);
    return n;
  }
  function mezPar(p) {
    return { Lx: p.Lx, Lz: p.Lz, vaosX: p.vaosX, vaosZ: p.vaosZ, altura: p.altura, direcao: p.direcao, principal: p.principal, secundaria: p.secundaria, pilar: p.pilar, espSec: p.espSec,
      piso: p.piso === "grade" ? "grade" : (p.piso === "nenhum" ? "nenhum" : "xadrez"), tPiso: p.tPiso, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, gradeB: p.gradeB, gradeS: p.gradeS,
      frente: p.frente, fundo: p.fundo, esquerda: p.esquerda, direita: p.direita, montante: p.montante, corrimao: p.corrimao, espac: p.espac, travessas: 1,
      contraventar: p.contraventar, contravento: p.contravento, placaBase: p.placaBase, rodape: p.rodape, hRodape: p.hRodape, intermediaria: p.intermediaria,
      semPilares: !!p.semPilares, abertura: p.abertura, aberturaPos: p.aberturaPos, aberturaLarg: p.aberturaLarg, contraventoPlano: p.contraventar !== false && p.contraventoPlano !== false && (Math.round(p.vaosX) > 1 || Math.round(p.vaosZ) > 1),
      aco: p.aco, x0: p.x0, y0: p.y0, z0: p.z0, giro: p.giro };
  }

  /* ================================================================ PASSARELA (2 cliques: começo e fim) */
  var PASSARELA = { rotulo: "Passarela", cliques: 2, modo: "linha", calcula: true, PADRAO: {
    comprimento: 6, largura: 1.0, altura: 3.0, vaos: 1, apoio: "pontas", viga: "W250X25.3", travessa: "W150X13", pilar: "W150X22.5", espSec: 1.0,
    piso: "grade", tPiso: 0.00635, gradeH: 0.030, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, rodape: true, hRodape: 0.20, intermediaria: 0.70, usoPiso: "escada-sem-publico", usoGuarda: "industrial", qInformado: 0, placaBase: true, contraventar: true, contraventoPlano: true, contravento: "BR 5/8\" (D 15,88 mm) Gerdau", aco: "ASTM A572 Gr.50" },
    nums: ["comprimento", "largura", "altura", "vaos", "espSec", "tPiso", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espac", "hRodape", "intermediaria", "qInformado"],
    bools: ["rodape", "placaBase", "contraventar", "contraventoPlano"], perfis: ["viga", "travessa", "montante", "corrimao"],
    validar: function (p, H) {
      if (!(p.comprimento >= 1 && p.comprimento <= 60)) return "Passarela: comprimento de 1 a 60 m (clique o começo e o fim).";
      if (!(p.largura >= 0.4 && p.largura <= 4)) return "Passarela: largura de 0,40 a 4 m.";
      if (p.apoio === "pontas" && p.comprimento / Math.max(1, Math.round(p.vaos)) > 15) return "Passarela apoiada nas pontas: vão acima de 15 m — use pilares (apoio em pilares) ou treliça.";
      return H.validar("mezanino", pasPar(p));
    },
    gerar: function (p, K, novoId, ctx, H) {
      var q = H.normalizar("mezanino", pasPar(p)), r = H.geradores.mezanino(q, K, novoId);
      if (!r || r.erro) return r;
      if (p.apoio !== "pontas") marcarMomento(K, p, Math.round(p.vaos) > 1);
      var nV = p.apoio === "pontas" ? 1 : Math.max(1, Math.round(p.vaos)), sSec = r.medidas.sSec || [], espS = 0; for (var i = 1; i < sSec.length; i++) espS = Math.max(espS, sSec[i] - sSec[i - 1]);
      var q0 = qDe(p, "passarela"), g0 = gPisoDe(H, p);
      r.medidas.acesso = { tipo: "passarela", perfil: "nr12", largura: p.largura, comprimento: p.comprimento, alturaLivre: null, guarda: acessoGuarda(H, p, 2, 2) };
      r.medidas.dim = { itens: [
        { tipo: "viga", nome: "Viga longitudinal", perfil: p.viga, aco: p.aco, L: p.comprimento / nV, faixa: p.largura / 2, q: q0, gPiso: g0 + 0.3 / Math.max(0.4, p.largura), travadaPeloPiso: false },
        { tipo: "viga", nome: "Travessa", perfil: p.travessa, aco: p.aco, L: p.largura, faixa: espS, q: q0, gPiso: g0, travadaPeloPiso: true },
        dimPiso(p, espS), { tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: p.espac }],
        naoVerificados: ["não verificado: apoios nas pontas (consoles/ligações na estrutura existente)" + (p.apoio !== "pontas" ? " e pilares" : ""), "não verificado: contraventamento horizontal do tabuleiro (estabilidade lateral da passarela) — o piso em grade não é diafragma"] };
      K.avisos.push("NBR 6120:2019, Tabela 10, nota t: passarela NÃO inserida na edificação está fora do escopo da NBR 6120 — consultar a ABNT NBR 7188");
      r.resumo = "Passarela de " + brf(p.comprimento) + " × " + brf(p.largura) + " m a " + brf(p.altura) + " m (" + (p.apoio === "pontas" ? "apoiada nas pontas" : "em pilares") + ")" + r.resumo.replace(/^Mezanino[^:]*/, "");
      return r;
    },
    dica: { titulo: "Passarela", oQueE: "Passarela reta com vigas longitudinais, travessas, piso em grade e guarda-corpo NR-12 dos dois lados.", ondeUsa: "Ligação entre plataformas, sobre tubulação, entre tanques, sobre esteira.", dica: "Clique o começo e o fim. Apoiada nas pontas (na estrutura existente) ou em pilares." },
    desenho: function (D) { var s = D.mem(20, 130, 300, 100, false, 7) + D.mem(20, 150, 300, 120, false, 5); for (var i = 0; i < 6; i++) s += D.ln(30 + i * 52, 128 - i * 5.5, 30 + i * 52, 78 - i * 5.5, D.ACOL, 2.4); s += D.ln(30, 78, 290, 50, D.ACOL, 2.6) + D.ln(30, 100, 290, 72, D.AUX, 1.6); return s + D.tx(160, 185, "2 cliques: começo e fim", "middle"); }
  };
  function pasPar(p) {
    var nV = p.apoio === "pontas" ? 1 : Math.max(1, Math.round(p.vaos));   /* apoiada nas pontas = um vão só (sem emenda solta no meio) */
    return { Lx: p.comprimento, Lz: p.largura, vaosX: nV, vaosZ: 1, altura: p.altura, direcao: "x", principal: p.viga, secundaria: p.travessa, pilar: p.pilar, espSec: p.espSec,
      piso: p.piso === "grade" ? "grade" : "xadrez", tPiso: p.tPiso, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, gradeB: p.gradeB, gradeS: p.gradeS,
      frente: true, fundo: true, esquerda: false, direita: false, montante: p.montante, corrimao: p.corrimao, espac: p.espac, travessas: 1,
      contraventar: p.apoio !== "pontas" && p.contraventar !== false, contraventoPlano: p.apoio !== "pontas" && p.contraventar !== false && p.contraventoPlano !== false && nV > 1, contravento: p.contravento || "BR 5/8\" (D 15,88 mm) Gerdau", placaBase: p.apoio !== "pontas" && p.placaBase, rodape: p.rodape, hRodape: p.hRodape, intermediaria: p.intermediaria,
      semPilares: p.apoio === "pontas", aco: p.aco, x0: p.x0, y0: p.y0, z0: p.z0, giro: p.giro };
  }

  /* ================================================================ ANELAR (em volta de tanque/equipamento)
   * local: origem no CENTRO do tanque na base; P(r, θ) = [r·cos θ, y, r·sen θ] */
  var ANELAR = { rotulo: "Plataforma anelar", cliques: 1, calcula: true, PADRAO: {
    raioTanque: 3.0, largura: 0.9, altura: 6.0, angIni: 0, abertura: 180, folga: 0.10, espConsoles: 1.6,
    console: "C150X12.2", vigaBorda: "C150X12.2", maoFrancesa: true, diagonal: "L64X64X6.4", hMaoFrancesa: 0.8,
    piso: "grade", tPiso: 0.00635, gradeH: 0.030, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, rodape: true, hRodape: 0.20, intermediaria: 0.70,
    acessoPonta: "inicio", usoPiso: "area-tecnica", usoGuarda: "industrial", qInformado: 0, aco: "ASTM A36" },
    nums: ["raioTanque", "largura", "altura", "angIni", "abertura", "folga", "espConsoles", "hMaoFrancesa", "tPiso", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espac", "hRodape", "intermediaria", "qInformado"],
    bools: ["maoFrancesa", "rodape"], perfis: ["console", "vigaBorda", "montante", "corrimao"], perfisSe: function (p, k) { return k !== "diagonal" || p.maoFrancesa; },
    validar: function (p) {
      if (!(p.raioTanque >= 0.3 && p.raioTanque <= 40)) return "Plataforma anelar: raio do tanque de 0,30 a 40 m.";
      if (!(p.largura >= 0.4 && p.largura <= 3)) return "Largura da plataforma de 0,40 a 3 m.";
      if (!(p.abertura >= 20 && p.abertura <= 360)) return "Ângulo da plataforma de 20° a 360°.";
      if (!(p.altura >= 0.5 && p.altura <= 80)) return "Cota da plataforma de 0,50 a 80 m.";
      if (!(p.espConsoles >= 0.5 && p.espConsoles <= 4)) return "Espaçamento máximo dos consoles (na borda de fora) de 0,50 a 4 m.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var R = p.raioTanque, ri = R + p.folga, ro = ri + p.largura, y = p.altura, tP = espPiso(p), yV = y - tP, a0 = p.angIni * GRAU, da = p.abertura * GRAU, cheio = p.abertura >= 359.999;
      var nSeg = Math.max(1, Math.ceil(ro * da / p.espConsoles - 1e-9)), gid = String(novoId());
      function P(r, th, yy) { return [r * Math.cos(th), yy, r * Math.sin(th)]; }
      var ths = []; for (var i = 0; i <= nSeg; i++) ths.push(a0 + da * i / nSeg);
      var pcs = H.perfilDe(p.console), pv = H.perfilDe(p.vigaBorda), hC = pcs ? (pcs.d || 0.15) : 0.15;
      /* CONSOLES radiais do costado até a borda de fora (topo = fundo do piso), soldados no costado */
      ths.forEach(function (th, k) {
        if (cheio && k === nSeg) return;
        var c = K.barra(P(R, th, yV), P(ro, th, yV), { ferr: "viga", cat: pcs ? pcs.cat : p.console, just: "topo", papel: "Console da plataforma anelar", ifc: "IFCMEMBER", aco: p.aco, nome: "Console " + (k + 1) }, "consoles");
        if (c) c.metal.solda = { tipo: "filete", perna: 6, lados: "ambos", comprimento: r4(2 * (hC + (pcs ? pcs.bf || 0.05 : 0.05))), campo: true, em: "costado do tanque" };
        if (p.maoFrancesa) K.barra(P(R, th, yV - hC - p.hMaoFrancesa), P(R + 0.8 * (ro - R), th, yV - hC), { ferr: "diagonal", cat: p.diagonal, papel: "Mão-francesa do console", ifc: "IFCMEMBER", aco: p.aco, nome: "Mão-francesa " + (k + 1) }, "maosFrancesas");
      });
      /* VIGA DE BORDA (cordas na borda de fora) */
      for (var j = 0; j < nSeg; j++) K.barra(P(ro, ths[j], yV), P(ro, ths[j + 1], yV), { ferr: "viga", cat: pv ? pv.cat : p.vigaBorda, just: "topo", lado: "esquerda", papel: "Viga de borda da plataforma anelar", ifc: "IFCBEAM", aco: p.aco, nome: "Viga de borda " + (j + 1) }, "bordas");
      /* PISO em setores (de console a console), contorno em arco */
      var mat = p.piso === "grade" ? "grade" : p.piso;
      for (var s = 0; s < nSeg; s++) {
        var C = [], q, nA = 8;
        for (q = 0; q <= nA; q++) { var t1 = ths[s] + (ths[s + 1] - ths[s]) * q / nA; C.push([ro * Math.cos(t1), ro * Math.sin(t1)]); }
        for (q = nA; q >= 0; q--) { var t2 = ths[s] + (ths[s + 1] - ths[s]) * q / nA; C.push([ri * Math.cos(t2), ri * Math.sin(t2)]); }
        var cp = K.chapa({ origem: [0, y, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: tP, contorno: C, papel: "Piso da plataforma anelar", aco: "ASTM A36", nome: "Piso — setor " + (s + 1) }, "piso");
        pisoSobre(H, K, cp, p, mat);
      }
      /* GUARDA-CORPO na borda de fora (cordas) e nas pontas (uma fica aberta para o acesso) */
      var go = optGuarda(H, p, gid), rG = ro - 0.04, cam = [];
      ths.forEach(function (th, k) { if (cheio && k === nSeg) return; cam.push(P(rG, th, y)); });
      if (cheio) cam.push(cam[0]);
      H.guardaCorpo(K, cam, go);
      var pontas = 0;
      if (!cheio) {
        [["inicio", ths[0]], ["fim", ths[nSeg]]].forEach(function (pt) {
          if (p.acessoPonta === pt[0]) return;
          var o2 = H.clone(go); o2.gid = gid + "-" + pt[0]; H.guardaCorpo(K, [P(ri + 0.04, pt[1], y), P(rG, pt[1], y)], o2); pontas++;
        });
      }
      K.avisos.push("Consoles soldados no costado: chapa de reforço (pad) e a verificação local da parede do tanque ficam com o projeto do tanque");
      K.avisos.push("Folga de " + brf(p.folga * 100, 0) + " cm entre o costado e o piso: sem guarda-corpo do lado do tanque (a parede é a proteção) — se passar de 15 cm, fechar a folga");
      var arcFora = ro * da / nSeg, Am = (ro * ro - ri * ri) / 2 * (da / nSeg), q0 = qDe(p, "anelar"), g0 = gPisoDe(H, p);
      var acesso = { tipo: "plataforma", perfil: "nr12", largura: p.largura, comprimento: ro * da, alturaLivre: null, guarda: acessoGuarda(H, p, cheio ? 1 : 3, 1 + pontas + (cheio ? 0 : (p.acessoPonta !== "nenhuma" ? 1 : 0))), aberturaSemCancela: !cheio && p.acessoPonta !== "nenhuma" };
      var dim = { itens: [
        { tipo: "console", perfil: p.console, aco: p.aco, L: ro - R, area: Am, q: q0, gPiso: g0, espac: arcFora },
        { tipo: "viga", nome: "Viga de borda", perfil: p.vigaBorda, aco: p.aco, L: 2 * ro * Math.sin(da / nSeg / 2), faixa: 0.15, q: q0, gPiso: g0 + 0.25 / 0.15 * 0.15, travadaPeloPiso: true },
        dimPiso(p, arcFora), { tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: Math.min(p.espac, arcFora) }],
        naoVerificados: ["não verificado: ligação console × costado e a parede do tanque (frente de Tanques)"].concat(p.maoFrancesa ? ["não verificado: mão-francesa (o console foi verificado em balanço, sem contar com ela — a favor da segurança)"] : []) };
      var cont = K.cont;
      return { resumo: "Plataforma anelar de " + brf(p.abertura, 0) + "° em volta de Ø " + brf(2 * R) + " m, largura " + brf(p.largura) + " m a " + brf(y) + " m: " + (cont.consoles || 0) + " consoles" + (cont.maosFrancesas ? " com mão-francesa" : "") + ", " + (cont.piso || 0) + " setores de piso, " + (cont.guarda || 0) + " peças de guarda-corpo",
        medidas: { nSeg: nSeg, ri: ri, ro: ro, arcFora: arcFora, angulos: ths.map(function (t) { return r4(t / GRAU); }), acesso: acesso, dim: dim } };
    },
    dica: { titulo: "Plataforma anelar", oQueE: "Plataforma em volta de tanque, silo ou equipamento cilíndrico: consoles radiais no costado com mão-francesa, viga de borda, piso em setores de grade e guarda-corpo NR-12.", ondeUsa: "Topo e meia-altura de tanque, silo, torre, reator, filtro.", dica: "Clique o CENTRO do tanque e digite o raio externo do costado, a cota, a largura e o ângulo. Uma ponta fica aberta para a escada." },
    desenho: function (D) { var s = '<circle cx="150" cy="105" r="55" fill="' + D.ACO + '" stroke="' + D.ACOL + '" stroke-width="2"/>'; s += '<path d="M 150 30 A 75 75 0 1 1 75 105" fill="none" stroke="' + D.DST + '" stroke-width="14" stroke-opacity="0.6"/>'; s += '<path d="M 150 22 A 83 83 0 1 1 67 105" fill="none" stroke="' + D.ACOL + '" stroke-width="2"/>'; for (var i = 0; i < 6; i++) { var t = -Math.PI / 2 + i * Math.PI * 1.5 / 5; s += D.ln(150 + 55 * Math.cos(t), 105 + 55 * Math.sin(t), 150 + 83 * Math.cos(t), 105 + 83 * Math.sin(t), D.DSTL, 3); } return s + D.tx(250, 190, "clique o centro do tanque", "middle"); }
  };

  /* ================================================================ GUARDA-CORPO avulso (2 cliques) */
  /* o CAMINHO livre do guarda-corpo: "x z; x z; …" (m, relativo ao 1º ponto, vírgula decimal vale) */
  function lerCaminho(t) {
    var o = []; String(t == null ? "" : t).split(";").forEach(function (par) { var q = String(par).trim().split(/\s+/); if (q.length < 2) return; var x = num(q[0], NaN), z = num(q[1], NaN); if (isFinite(x) && isFinite(z)) o.push([x, z]); });
    return o;
  }
  function textoCaminho(pts) { return pts.map(function (q) { return brf(q[0], 3) + " " + brf(q[1], 3); }).join("; "); }
  /* frente S6 (14/10/2026): o guarda-corpo também por RETÂNGULO (2 cantos = os 4 lados, com um lado aberto para o acesso) —
     o retângulo vira o mesmo CAMINHO da polilinha (js/metalprontasui.js, aplicarRetangulo): um gerador só */
  var GUARDA = { rotulo: "Guarda-corpo", cliques: 2, modo: "polilinha", modos: ["polilinha", "retangulo"], calcula: true, PADRAO: {
    comprimento: 3, alturaGuarda: 1.10, intermediaria: 0.70, rodape: true, hRodape: 0.20, espac: 1.0, montante: "HSS73X5.2", corrimao: "HSS48.3X3.7",
    norma: "nr12", usoGuarda: "industrial", perna: 6, abastecimento: false, retornoIni: 0, retornoFim: 0, ladoRetorno: "esquerda", travessasExtra: 0, fixacao: "solda", caminho: "", aco: "ASTM A36",
    Lx: 0, Lz: 0, ladoAberto: "", concEsp: 0, concFck: 0, suporte: "" },
    nums: ["comprimento", "alturaGuarda", "intermediaria", "hRodape", "espac", "perna", "retornoIni", "retornoFim", "travessasExtra", "Lx", "Lz", "concEsp", "concFck"], bools: ["rodape", "abastecimento"], perfis: ["montante", "corrimao"],
    validar: function (p) {
      var cm0 = lerCaminho(p.caminho);
      if (cm0.length === 1 || (String(p.caminho || "").trim() && cm0.length < 2)) return "Guarda-corpo: o caminho precisa de 2 pontos ou mais (x z; x z…).";
      for (var ic = 1; ic < cm0.length; ic++) if (Math.hypot(cm0[ic][0] - cm0[ic - 1][0], cm0[ic][1] - cm0[ic - 1][1]) < 0.05) return "Guarda-corpo: dois pontos seguidos no mesmo lugar (trecho " + ic + ").";
      if (cm0.length < 2 && !(p.comprimento >= 0.3 && p.comprimento <= 100)) return "Guarda-corpo: comprimento de 0,30 a 100 m (clique o começo e o fim).";
      if (!(p.alturaGuarda >= 0.6 && p.alturaGuarda <= 1.6)) return "Altura do guarda-corpo de 0,60 a 1,60 m.";
      if (!(p.espac >= 0.3 && p.espac <= 3)) return "Espaçamento dos montantes de 0,30 a 3 m.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      /* caminho: o trecho clicado e os RETORNOS nas pontas (encontro em L com outro guarda-corpo ou com a parede) */
      var sR = p.ladoRetorno === "direita" ? 1 : -1, cam = [], livre = lerCaminho(p.caminho);
      if (livre.length >= 2) cam = livre.map(function (q) { return [q[0], 0, q[1]]; });   /* POLILINHA LIVRE (cliques sucessivos): encontros e mudanças de direção */
      else {
        if (p.retornoIni > 0.05) cam.push([0, 0, sR * p.retornoIni]);
        cam.push([0, 0, 0], [p.comprimento, 0, 0]);
        if (p.retornoFim > 0.05) cam.push([p.comprimento, 0, sR * p.retornoFim]);
      }
      var Ltot = 0; for (var il = 1; il < cam.length; il++) Ltot += Math.hypot(cam[il][0] - cam[il - 1][0], cam[il][2] - cam[il - 1][2]);
      var go = optGuarda(H, p, String(novoId())), nEx = Math.max(0, Math.min(4, Math.round(num(p.travessasExtra, 0)))), r0 = p.rodape === false ? 0 : num(p.hRodape, 0.2), hi = num(p.intermediaria, 0.7);
      for (var x = 1; x <= nEx; x++) go.alturas.push(r4(r0 + (hi - r0) * x / (nEx + 1)));
      var n0 = K.pecas.length, n = H.guardaCorpo(K, cam, go);
      if (!n) return { erro: "Guarda-corpo: os perfis do montante ou do corrimão não fecharam." };
      /* os montantes (as mesmas posições do guarda-corpo: pontas de cada trecho e a cada ≤ espac) */
      var posts = [], fechado = cam.length > 3 && Math.hypot(cam[0][0] - cam[cam.length - 1][0], cam[0][2] - cam[cam.length - 1][2]) < 1e-3;
      for (var i2 = 0; i2 + 1 < cam.length; i2++) { var a = cam[i2], b = cam[i2 + 1], Lt = Math.hypot(b[0] - a[0], b[2] - a[2]), nS = Math.max(1, Math.ceil(Lt / p.espac - 1e-9)); for (var k = 0; k <= nS; k++) { if (k === 0 && i2 > 0) continue; if (fechado && i2 === cam.length - 2 && k === nS) continue; posts.push([a[0] + (b[0] - a[0]) * k / nS, 0, a[2] + (b[2] - a[2]) * k / nS]); } }
      /* CHAPA CHUMBADA (frente S6, 14/10/2026): a placa e os chumbadores DIMENSIONADOS com a força da NBR 6120 (Tabela 12) —
         js/metalescadalinha.js baseMontante (placa engastada do js/acoligcalc.js); sem o motor, a chapa de partida de antes */
      var ELb = dep("MetalEscadaLinha", "./metalescadalinha.js"), bm = p.fixacao === "chapa" && ELb && ELb.baseMontante ? ELb.baseMontante({ perfil: p.montante, uso: p.usoGuarda, espac: p.espac, concreto: { esp: p.concEsp, fck: p.concFck } }) : null;
      if (p.fixacao === "chapa") posts.forEach(function (P, j) {
        if (bm && bm.desenho && ELb.chapaFixacao) { ELb.chapaFixacao(K, K.F, P[0], P[2], 0, bm.desenho, "gc-base-" + (j + 1), "Chapa de base do montante " + (j + 1), 0, "Chapa de base do montante"); return; }
        K.chapa({ origem: [P[0] - 0.075, 0.0125, P[2] - 0.075], ex: [1, 0, 0], ey: [0, 0, 1], t: 0.0125, ret: { L: 0.15, B: 0.15 }, furos: [[0.02, 0.02], [0.13, 0.02], [0.02, 0.13], [0.13, 0.13]].map(function (f) { return { u: f[0], v: f[1], db: 12, tipo: "padrao" }; }), papel: "Chapa de base do montante", aco: "ASTM A36", lig: "gc-base", nome: "Chapa de base do montante " + (j + 1) }, "basesMontante");
      });
      for (var z2 = n0; z2 < K.pecas.length; z2++) if (K.pecas[z2].metal && !K.pecas[z2].metal.acessorio) K.pecas[z2].metal.acessorio = "guarda-corpo";
      var nm = posts.length;
      var acesso = { tipo: "guarda-corpo", perfil: p.norma === "nbr9050" ? "nbr9050" : "nr12", abastecimento: !!p.abastecimento, guarda: acessoGuarda(H, p, 1, 1) };
      var cont = K.cont;
      return { resumo: "Guarda-corpo de " + brf(Ltot) + " m" + (livre.length >= 2 ? " em " + (cam.length - 1) + " trecho(s)" : "") + " a " + brf(p.alturaGuarda) + " m: " + nm + " montantes a ≤ " + brf(p.espac) + " m, " + (num(p.intermediaria, 0) > 0 ? "intermediária a " + brf(p.intermediaria) + " m, " : "") + (p.rodape ? "rodapé de " + brf(p.hRodape * 100, 0) + " cm, " : "sem rodapé, ") + (cont.guarda || 0) + " peças",
        medidas: { montantes: nm, comprimento: r4(Ltot), trechos: cam.length - 1, acesso: acesso, dim: { itens: [{ tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: p.aco, uso: p.usoGuarda, espac: p.espac, perna: p.perna }].concat(bm ? [{ tipo: "baseMontante", perfil: p.montante, uso: p.usoGuarda, espac: p.espac, concreto: { esp: p.concEsp, fck: p.concFck } }] : []), naoVerificados: ["não verificado: o elemento onde o guarda-corpo fixa (viga, laje, borda de chapa)"].concat(p.fixacao === "chapa" && !bm ? ["não verificado: chapa de base 150 × 150 × 12,5 mm e os 4 chumbadores Ø 12 mm (de partida — dimensionar na laje) (CRÍTICO)"] : []).concat(p.fixacao !== "chapa" && p.suporte === "concreto" ? ["não verificado: montante SOLDADO sobre CONCRETO não existe — use a fixação \"chapa de base chumbada\" (CRÍTICO)"] : []) } } };
    },
    dica: { titulo: "Guarda-corpo", oQueE: "Guarda-corpo avulso: montantes de tubo, corrimão sem superfície plana, travessa intermediária e rodapé, com a força horizontal da NBR 6120 verificada no montante e na solda da base.", ondeUsa: "Borda de laje, mezanino existente, fosso, plataforma de máquina, cobertura.", dica: "Clique o começo e o fim. NR-12: 1,10–1,20 m, intermediária a 0,70 m, rodapé de 0,20 m." },
    desenho: function (D) { var s = D.mem(20, 160, 300, 160, false, 4); for (var i = 0; i < 4; i++) s += D.mem(40 + i * 80, 160, 40 + i * 80, 50, false, 4); s += D.mem(30, 50, 290, 50, true, 5) + D.mem(30, 95, 290, 95, false, 3) + '<rect x="30" y="140" width="260" height="20" fill="' + D.DST + '" fill-opacity="0.5" stroke="' + D.DSTL + '"/>'; return s + D.tx(300, 45, "1,10", "end") + D.tx(300, 90, "0,70", "end") + D.tx(300, 135, "rodapé 0,20", "end"); }
  };

  /* ================================================================ PISO INDUSTRIAL — retângulo (2 cantos) ou CONTORNO (cliques, Enter fecha)
   * frente S6 (14/10/2026): o piso ganha a ESTRUTURA DE SUPORTE dimensionada — vigas de borda no contorno e intermediárias no
   * VÃO MÁXIMO do piso escolhido (grade: tabela de vão × carga do catálogo industrial quando a grade está nela, senão as barras
   * portantes; chapa: flexão e flecha), cada viga no perfil mais leve que passa (NBR 8800 pelo js/acoacessos.js), apoiada no
   * que está embaixo (par.apoios, lido pela tela no modelo) ou em PILARETES até a cota de baixo (placa de base ancorada e X nas
   * faces), e as ABERTURAS (passagem de escada: par.aberturas, polígonos locais) com vigas de borda em volta. */
  var PERFIS_VIGA_PISO = ["C150X12.2", "C200X17.1", "W150X13", "W200X15", "W250X25.3", "W310X32.7", "W360X39", "W410X46.1", "W460X52", "W530X66"];
  function poligonoPiso(p) {
    var c = lerCaminho(p.contorno);
    if (c.length >= 3) { if (Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]) < 1e-6) c.pop(); return c; }
    return [[0, 0], [p.Lx, 0], [p.Lx, p.Lz], [0, p.Lz]];
  }
  function areaP(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* Sutherland–Hodgman: o polígono P recortado pelo retângulo [x0,x1] × [z0,z1] */
  function recortarRet(P, x0, x1, z0, z1) {
    var out = P.slice();
    [[0, x0, 1], [0, x1, -1], [1, z0, 1], [1, z1, -1]].forEach(function (pl) {
      var k = pl[0], v = pl[1], sg = pl[2], inp = out; out = [];
      if (!inp.length) return;
      var den = function (q) { return sg * (q[k] - v); };
      for (var i = 0; i < inp.length; i++) {
        var a = inp[i], b = inp[(i + 1) % inp.length], da = den(a), db = den(b);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
    });
    return out;
  }
  function cortesLinha(P, x) {   /* os trechos da reta vertical X = x dentro do polígono → [[z0, z1]…] */
    var zs = [];
    for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) zs.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])); }
    zs.sort(function (u, v) { return u - v; }); var o = []; for (var j = 0; j + 1 < zs.length; j += 2) o.push([zs[j], zs[j + 1]]); return o;
  }
  function menosFaixas(seg, faixas) {   /* [z0, z1] menos as faixas [a, b] */
    var o = [seg];
    faixas.forEach(function (f) { var n = []; o.forEach(function (s) { if (f[1] <= s[0] || f[0] >= s[1]) n.push(s); else { if (f[0] > s[0]) n.push([s[0], f[0]]); if (f[1] < s[1]) n.push([f[1], s[1]]); } }); o = n; });
    return o.filter(function (s) { return s[1] - s[0] > 0.05; });
  }
  function bboxP(P) { var xs = P.map(function (q) { return q[0]; }), zs = P.map(function (q) { return q[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) }; }
  /* o VÃO MÁXIMO do piso: o maior vão (de 5 em 5 cm) em que todas as verificações do piso passam */
  function vaoMaxPiso(p, q) {
    var A = AC(); if (!A) return { vao: num(p.vao, 1), fonte: "informado (sem o js/acoacessos.js)", conferir: true };
    var mat = p.material === "lisa" || p.material === "xadrez" ? "chapa" : p.material, melhor = null, fonte = null;
    if (mat === "expandida" || mat === "perfurada") return { vao: num(p.vao, 1), fonte: "informado — chapa " + mat + ": usar a tabela de vão × carga do fabricante", conferir: true };
    for (var v = 0.30; v <= 3.0 + 1e-9; v += 0.05) {
      var r = A.piso({ material: mat, vao: v, t: p.t, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, gradeB: p.gradeB, q: q });
      var cs = r.verificacoes.filter(function (x) { return !x.info; });
      if (!cs.length || !cs.every(function (x) { return x.ok; })) break;
      melhor = Math.round(v * 100) / 100; fonte = cs.some(function (x) { return /tabela do fabricante/.test(x.nome); }) ? "tabela de vão × carga do fabricante (catálogo industrial)" : (mat === "grade" ? "barras portantes (a grade não está nas tabelas do catálogo — conferir com o fabricante)" : "chapa: flexão e flecha");
    }
    return melhor ? { vao: melhor, fonte: fonte, conferir: !/fabricante \(/.test(fonte) } : { vao: 0, fonte: "nenhum vão de 0,30 m passa com " + brf(q, 1) + " kN/m² — escolha um piso mais forte", conferir: true };
  }
  /* o perfil mais leve da lista que passa (viga biapoiada travada pelo piso, faixa de influência) */
  function vigaQuePassa(L, faixa, q, gP, aco, cache, minIdx) {
    var A = AC(), i0 = Math.max(0, Math.min(PERFIS_VIGA_PISO.length - 1, Math.round(num(minIdx, 0)))), k = brf(L, 2) + "|" + brf(faixa, 2) + "|" + i0; if (cache[k]) return cache[k];
    var res = null;
    for (var i = i0; i < PERFIS_VIGA_PISO.length && A; i++) {
      /* mesa comprimida DESTRAVADA no vão (a grade/chapa presa por clip não conta como travamento — a mesma premissa da
         Estrutura desenhada, que verifica o piso inteiro: um motor só, sem "passa aqui e reprova lá") */
      var r = A.viga({ nome: "Viga", perfil: PERFIS_VIGA_PISO[i], aco: aco, L: L, faixa: faixa, q: q, gPiso: gP, travadaPeloPiso: false });
      var cs = r.verificacoes.filter(function (x) { return !x.info; });
      if (cs.length && cs.every(function (x) { return x.ok; })) { res = { perfil: PERFIS_VIGA_PISO[i], L: L, faixa: faixa }; break; }
    }
    cache[k] = res; return res;
  }
  var PISO = { rotulo: "Piso industrial", cliques: 2, modo: "retangulo", modos: ["retangulo", "contorno"], calcula: true, PADRAO: {
    Lx: 2, Lz: 1, material: "grade", t: 0.00635, gradeH: 0.030, gradeT: 0.003, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    cordao: 0.004, losangoMenor: 0.025, furoD: 0.010, furoPasso: 0.015, painelMax: 1.0, vao: 1.0, usoPiso: "area-tecnica", qInformado: 0, aco: "ASTM A36",
    contorno: "", aberturas: [], estrutura: "auto", cotaApoio: 0, apoios: [], concEsp: 0, concFck: 0, minBorda: 0, minInter: 0, minPil: 0, bordasExistentes: [], concPoly: [], concBorda: 0, passagens: [], apoioMax: 0 },
    nums: ["Lx", "Lz", "t", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "cordao", "losangoMenor", "furoD", "furoPasso", "painelMax", "vao", "qInformado", "cotaApoio", "concEsp", "concFck", "minBorda", "minInter", "minPil", "concBorda", "apoioMax"], bools: [], perfis: [],
    validar: function (p) {
      var c = lerCaminho(p.contorno);
      if (String(p.contorno || "").trim() && c.length < 3) return "Piso por contorno: 3 cantos ou mais (x z; x z; x z).";
      if (c.length >= 3) { var bb = bboxP(c); if (Math.abs(areaP(c)) < 0.04) return "Piso por contorno: a área fica abaixo de 0,04 m²."; if (bb.x1 - bb.x0 > 30 || bb.z1 - bb.z0 > 30) return "Piso: cada lado de 0,20 a 30 m."; }
      else if (!(p.Lx >= 0.2 && p.Lx <= 30 && p.Lz >= 0.2 && p.Lz <= 30)) return "Piso: cada lado de 0,20 a 30 m (clique dois cantos).";
      if (["grade", "xadrez", "expandida", "perfurada", "lisa"].indexOf(p.material) < 0) return "Piso: grade, chapa xadrez, expandida, perfurada ou lisa.";
      if (!(p.painelMax >= 0.3 && p.painelMax <= 3)) return "Largura máxima do painel de 0,30 a 3 m.";
      if (!(p.vao >= 0.2 && p.vao <= 4)) return "Vão do piso entre apoios de 0,20 a 4 m.";
      if (["auto", "nenhuma"].indexOf(p.estrutura) < 0) return "Estrutura do piso: automática ou nenhuma.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var tP = p.material === "grade" ? p.gradeH : p.t, kg = AC() ? AC().pisoKgM2(p.material === "lisa" ? "chapa" : p.material, p) : null, P = poligonoPiso(p);
      if (areaP(P) < 0) P = P.slice().reverse();
      var bb = bboxP(P), A0 = Math.abs(areaP(P)), q = qDe(p), gP = kg ? r4(kg.kgm2 * 9.81 / 1000) : 0.5, gid = String(novoId()), est = p.estrutura !== "nenhuma";
      var abs = arr(p.aberturas).map(function (ab) { var b = bboxP(ab); return b; }).filter(function (b) { return b.x1 - b.x0 > 0.1 && b.z1 - b.z0 > 0.1; });
      /* o vão do piso: o MÁXIMO pela tabela/cálculo quando a estrutura é automática; senão o informado */
      var vm = est ? vaoMaxPiso(p, q) : { vao: p.vao, fonte: "informado" };
      if (est && !(vm.vao > 0)) return { erro: "Piso: " + vm.fonte + "." };
      /* direção: as vigas intermediárias vencem a MENOR dimensão (linhas X = constante quando o piso é mais comprido em X) */
      var aoLongoX = (bb.x1 - bb.x0) >= (bb.z1 - bb.z0);
      function T(q2) { return aoLongoX ? q2 : [q2[1], q2[0]]; }   /* troca x ↔ z: o algoritmo trabalha com as intermediárias em X = constante */
      var Pt = P.map(T), bt = bboxP(Pt), absT = abs.map(function (b) { var c0 = T([b.x0, b.z0]), c1 = T([b.x1, b.z1]); return { x0: Math.min(c0[0], c1[0]), x1: Math.max(c0[0], c1[0]), z0: Math.min(c0[1], c1[1]), z1: Math.max(c0[1], c1[1]) }; });
      var Wx = bt.x1 - bt.x0, nI = est ? Math.max(1, Math.ceil(Wx / vm.vao - 1e-9)) : 1, s = Wx / nI;
      /* ---- PAINÉIS: faixas de largura ≤ painelMax ao longo de X, recortadas pelo contorno e sem as aberturas */
      var nP = Math.max(1, Math.ceil(Wx / Math.min(p.painelMax, est ? s : p.painelMax) - 1e-9)), xs = [];
      for (var i = 0; i <= nP; i++) xs.push(bt.x0 + Wx * i / nP);
      absT.forEach(function (b) { xs.push(b.x0, b.x1); });
      xs = xs.filter(function (x) { return x >= bt.x0 - 1e-9 && x <= bt.x1 + 1e-9; }).sort(function (a, b) { return a - b; }).filter(function (x, k, l) { return !k || x - l[k - 1] > 1e-4; });
      var nPain = 0, areaPain = 0;
      for (var j = 0; j + 1 < xs.length; j++) {
        var xa = xs[j], xb = xs[j + 1], xm = (xa + xb) / 2, faixas = absT.filter(function (b) { return xm > b.x0 && xm < b.x1; }).map(function (b) { return [b.z0, b.z1]; });
        menosFaixas([bt.z0, bt.z1], faixas).forEach(function (zf) {
          var pc = recortarRet(Pt, xa, xb, zf[0], zf[1]); if (pc.length < 3 || Math.abs(areaP(pc)) < 0.005) return;
          var pcL = pc.map(T); if (areaP(pcL) < 0) pcL.reverse();
          var c = K.chapa({ origem: [0, 0, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: tP, contorno: pcL.map(function (q3) { return [r4(q3[0]), r4(q3[1])]; }), papel: "Piso", aco: "ASTM A36", nome: "Painel de piso " + (nPain + 1) }, "paineis");
          if (c) { pisoSobre(H, K, c, p, p.material === "lisa" ? "chapa" : p.material); nPain++; areaPain += Math.abs(areaP(pcL)); }
        });
      }
      if (kg && kg.conferir) K.avisos.push("Peso do piso: " + brf(kg.kgm2, 1) + " kg/m² — " + kg.fonte);
      var dimItens = [{ tipo: "piso", material: p.material === "lisa" || p.material === "xadrez" ? "chapa" : p.material, vao: est ? r4(s) : p.vao, t: p.t, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, gradeB: p.gradeB, q: q }];
      var nvs = ["não verificado: fixação do piso nas vigas (presilha/clip da grade, solda ou parafuso)"], crit = [], est0 = null;
      if (est) {
        /* ---- ESTRUTURA: borda (cada lado do contorno e de cada abertura) + intermediárias a cada s (X = constante) */
        var cache = {}, vigas = [], yV = -tP, Lint = 0;
        var linhasInt = [], xsAb = [];
        /* ABERTURA (o "vigamento de abertura"): os dois lados paralelos às intermediárias são vigas INTEIRAS de borda a borda
           (as que seguram tudo); os outros dois são as travessas entre elas, e as intermediárias cortadas apoiam nas travessas */
        absT.forEach(function (b) { [b.x0, b.x1].forEach(function (xa) { xsAb.push(xa); cortesLinha(Pt, xa).forEach(function (sg) { var fx = absT.filter(function (o2) { return o2 !== b && xa > o2.x0 - 1e-6 && xa < o2.x1 + 1e-6; }).map(function (o2) { return [o2.z0, o2.z1]; }); menosFaixas(sg, fx).forEach(function (s2) { linhasInt.push([[xa, s2[0]], [xa, s2[1]], "abertura"]); Lint = Math.max(Lint, s2[1] - s2[0]); }); }); }); });
        for (var k = 1; k < nI; k++) { var xk = bt.x0 + s * k; if (xsAb.some(function (xa) { return Math.abs(xa - xk) < 0.10; })) continue; cortesLinha(Pt, xk).forEach(function (sg) { var fx = absT.filter(function (b) { return xk > b.x0 - 1e-6 && xk < b.x1 + 1e-6; }).map(function (b) { return [b.z0, b.z1]; }); menosFaixas(sg, fx).forEach(function (s2) { linhasInt.push([[xk, s2[0]], [xk, s2[1]]]); Lint = Math.max(Lint, s2[1] - s2[0]); }); }); }
        var bordas = [], exRef = arr(p.bordasExistentes).map(function (x) { return x && x.ref ? x.ref : null; }).filter(Boolean);
        /* lado do contorno que já está sobre uma VIGA EXISTENTE (a tela lê no modelo; pontas locais a, b): sem viga de borda nova,
           os cantos dele apoiam nela */
        var exPares = arr(p.bordasExistentes).filter(function (x) { return x && x.a && x.b; }).map(function (x) { return [T([num(x.a[0], 0), num(x.a[1], 0)]), T([num(x.b[0], 0), num(x.b[1], 0)])]; });
        var mesmo = function (u, v) { return Math.hypot(u[0] - v[0], u[1] - v[1]) < 0.02; }, bEx = [];
        /* REVISÃO S6 (A2): a abertura que CRUZA a borda do piso (a escada chega pela borda) corta a viga de borda ali — os
           pedaços de fora da passagem ficam, com apoio nas pontas; as travessas da abertura só onde ficam dentro do piso */
        var foraDasAberturas = function (a, b) {
          var ts = [[0, 1]];
          absT.forEach(function (bx) {
            var t0 = 0, t1 = 1, d = [b[0] - a[0], b[1] - a[1]], ok = true;
            [[-d[0], a[0] - bx.x0], [d[0], bx.x1 - a[0]], [-d[1], a[1] - bx.z0], [d[1], bx.z1 - a[1]]].forEach(function (pq) { if (!ok) return; var pp0 = pq[0], qq = pq[1]; if (Math.abs(pp0) < 1e-12) { if (qq < 0) ok = false; return; } var r = qq / pp0; if (pp0 < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); });
            if (!ok || t1 - t0 < 1e-6) return;
            var nt = []; ts.forEach(function (iv) { if (t1 <= iv[0] || t0 >= iv[1]) nt.push(iv); else { if (t0 > iv[0]) nt.push([iv[0], t0]); if (t1 < iv[1]) nt.push([t1, iv[1]]); } }); ts = nt;
          });
          return ts.filter(function (iv) { return (iv[1] - iv[0]) * Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05; }).map(function (iv) { return [[a[0] + (b[0] - a[0]) * iv[0], a[1] + (b[1] - a[1]) * iv[0]], [a[0] + (b[0] - a[0]) * iv[1], a[1] + (b[1] - a[1]) * iv[1]]]; });
        };
        var dentroPol = function (x, z) { var c = false; for (var i5 = 0, j5 = Pt.length - 1; i5 < Pt.length; j5 = i5++) { var a5 = Pt[i5], b5 = Pt[j5]; if (((a5[1] > z) !== (b5[1] > z)) && (x < (b5[0] - a5[0]) * (z - a5[1]) / (b5[1] - a5[1]) + a5[0])) c = !c; } return c; };
        for (var e = 0; e < Pt.length; e++) { var ea = Pt[e], eb = Pt[(e + 1) % Pt.length]; if (exPares.some(function (pr) { return (mesmo(pr[0], ea) && mesmo(pr[1], eb)) || (mesmo(pr[0], eb) && mesmo(pr[1], ea)); })) { bEx.push(e); continue; } foraDasAberturas(ea, eb).forEach(function (sg) { bordas.push({ a: sg[0], b: sg[1], tipo: "borda" }); }); }
        /* REVISÃO S6 rodada 4: a travessa da abertura que CRUZA a borda acaba NA borda (antes passava dela e ficava com a ponta
           solta no vazio — a Estrutura desenhada acusava mecanismo) */
        var cortesLinhaZ = function (P, z) { var xs = []; for (var i6 = 0; i6 < P.length; i6++) { var a6 = P[i6], b6 = P[(i6 + 1) % P.length]; if ((a6[1] <= z && b6[1] > z) || (b6[1] <= z && a6[1] > z)) xs.push(a6[0] + (b6[0] - a6[0]) * (z - a6[1]) / (b6[1] - a6[1])); } xs.sort(function (u6, v6) { return u6 - v6; }); var o6 = []; for (var j6 = 0; j6 + 1 < xs.length; j6 += 2) o6.push([xs[j6], xs[j6 + 1]]); return o6; };
        absT.forEach(function (b) { [[[b.x0, b.z0], [b.x1, b.z0]], [[b.x1, b.z1], [b.x0, b.z1]]].forEach(function (sg) {
          var zL = sg[0][1], xa6 = Math.min(sg[0][0], sg[1][0]), xb6 = Math.max(sg[0][0], sg[1][0]);
          [zL + 1e-3, zL - 1e-3].reduce(function (acc, zz) { return acc.length ? acc : cortesLinhaZ(Pt, zz); }, []).forEach(function (iv) {
            var c0 = Math.max(xa6, iv[0]), c1 = Math.min(xb6, iv[1]); if (c1 - c0 < 0.05) return;
            if (!dentroPol((c0 + c1) / 2, zL + 1e-3) || !dentroPol((c0 + c1) / 2, zL - 1e-3)) return;
            var ida = sg[0][0] <= sg[1][0]; bordas.push({ a: [ida ? c0 : c1, zL], b: [ida ? c1 : c0, zL], tipo: "abertura" });
          });
        }); });
        if (!Lint) Lint = bt.z1 - bt.z0;
        var apoiosPts = [], falhas = [], hEst = num(p.y0, 0) - num(p.cotaApoio, 0), apMax = num(p.apoioMax, 0) > 0 ? num(p.apoioMax, 0) : (hEst > 0.15 && hEst < 1.5 ? Math.max(1.2, 2.5 * hEst) : 0);
        function ptApoio(q4) { for (var a = 0; a < apoiosPts.length; a++) if (Math.hypot(apoiosPts[a].p[0] - q4[0], apoiosPts[a].p[1] - q4[1]) < 0.02) return apoiosPts[a]; var o = { p: q4, N: 0 }; apoiosPts.push(o); return o; }
        bordas.forEach(function (bd) {
          var L = Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]); if (L < 0.1) return;
          var paralela = Math.abs(bd.b[0] - bd.a[0]) < 0.3 * L, faixa = paralela ? s / 2 : Lint / 2, nS = 1, vq = null;
          /* REVISÃO S6 (A3): piso BAIXO — o X entre apoios longe uns dos outros fica quase deitado e não trava (mecanismo):
             apoio a cada ≤ 2,5·h (mín. 1,2 m) ao longo da borda, ou o espaçamento pedido (apoioMax) */
          /* REVISÃO S6 rodada 4: só na borda que RECEBE as intermediárias (elas escoram o apoio do meio no plano do piso); na
             borda PARALELA a elas o pilarete do meio ficava solto na perpendicular (6 × 8 a 1,4 m: Δ2/Δ1 = 3,7, falso reprovado) */
          var nS0 = bd.tipo === "borda" && apMax > 0 && !paralela ? Math.max(1, Math.ceil(L / apMax - 1e-9)) : 1;
          for (nS = nS0; nS <= Math.max(6, nS0); nS++) { vq = vigaQuePassa(L / nS, faixa, q, gP, p.aco, cache, p.minBorda); if (vq) break; }
          if (!vq) { falhas.push("borda de " + brf(L) + " m"); nS = 1; vq = { perfil: PERFIS_VIGA_PISO[PERFIS_VIGA_PISO.length - 1], L: L, faixa: faixa, falha: true }; }
          var wd = 1.25 * (gP * faixa) + 1.5 * (q * faixa);
          /* a viga de borda é UMA barra contínua de canto a canto (os apoios a mais ficam por baixo dela): a viga partida
             no apoio viraria rótula em corrente e o nó do pilarete do meio ficaria solto em planta (mecanismo) */
          vigas.push({ a: bd.a, b: bd.b, perfil: vq.perfil, papel: bd.tipo === "abertura" ? "Viga de borda da abertura do piso" : "Viga de borda do piso", L: L / nS, faixa: faixa, vaos: nS });
          if (bd.tipo === "borda") for (var t2 = 0; t2 < nS; t2++) {
            var a2 = [bd.a[0] + (bd.b[0] - bd.a[0]) * t2 / nS, bd.a[1] + (bd.b[1] - bd.a[1]) * t2 / nS], b2 = [bd.a[0] + (bd.b[0] - bd.a[0]) * (t2 + 1) / nS, bd.a[1] + (bd.b[1] - bd.a[1]) * (t2 + 1) / nS];
            ptApoio(a2).N += wd * L / nS / 2 * (t2 > 0 ? 1.25 : 1); ptApoio(b2).N += wd * L / nS / 2 * (t2 < nS - 1 ? 1.25 : 1);   /* apoio do meio de viga contínua: +25 % (a favor) */
          }
        });
        linhasInt.forEach(function (li) {
          var ab = li[2] === "abertura", L = li[1][1] - li[0][1], vq = vigaQuePassa(L, ab ? s : s, q, gP, p.aco, cache, ab ? Math.max(num(p.minInter, 0), num(p.minBorda, 0)) : p.minInter);
          if (!vq) { falhas.push((ab ? "viga da abertura" : "intermediária") + " de " + brf(L) + " m"); vq = { perfil: PERFIS_VIGA_PISO[PERFIS_VIGA_PISO.length - 1] }; }
          vigas.push({ a: li[0], b: li[1], perfil: vq.perfil, papel: ab ? "Viga de borda da abertura do piso" : "Viga intermediária do piso", L: L, faixa: s });
        });
        /* as vigas no modelo: topo no fundo do piso; borda do contorno com o perfil "para dentro" */
        var porPerfil = {};
        vigas.forEach(function (vg, iv) {
          var a3 = T(vg.a), b3 = T(vg.b);
          K.barra([a3[0], yV, a3[1]], [b3[0], yV, b3[1]], { ferr: "viga", cat: vg.perfil, just: "topo", papel: vg.papel, ifc: "IFCBEAM", aco: p.aco, nome: vg.papel + " " + (iv + 1) }, "vigas");
          var kk = vg.papel + "|" + vg.perfil + "|" + brf(vg.L, 2) + "|" + brf(vg.faixa, 2); if (!porPerfil[kk]) { porPerfil[kk] = 1; dimItens.push({ tipo: "viga", nome: vg.papel + " " + vg.perfil + " (" + brf(vg.L) + " m)", perfil: vg.perfil, aco: p.aco, L: vg.L, faixa: vg.faixa, q: q, gPiso: gP, travadaPeloPiso: false }); }
        });
        /* ---- APOIOS: o que a tela leu embaixo (existente) ou PILARETE até a cota de baixo */
        var EL = dep("MetalEscadaLinha", "./metalescadalinha.js"), Hmax = 0, nPil = 0, nEx = 0, refs = {}, pilPts = [];
        var yBase = num(p.cotaApoio, 0) - num(p.y0, 0);
        bEx.forEach(function (e3) { if (e3 >= 0 && e3 < Pt.length) [Pt[e3], Pt[(e3 + 1) % Pt.length]].forEach(function (q5) { ptApoio(q5).existente = true; }); });
        exRef.forEach(function (rf) { refs[rf] = 1; });
        apoiosPts.forEach(function (ap, ia) {
          var pl = T(ap.p), lido = arr(p.apoios).filter(function (x) { return Math.hypot(num(x.x, 0) - pl[0], num(x.z, 0) - pl[1]) < 0.05; })[0];
          if (ap.existente) { nEx++; return; }
          var vgA = vigas.filter(function (vg) { return Math.hypot(vg.a[0] - ap.p[0], vg.a[1] - ap.p[1]) < 0.02 || Math.hypot(vg.b[0] - ap.p[0], vg.b[1] - ap.p[1]) < 0.02; }), dMax = 0;
          vgA.forEach(function (vg) { var pf = H.perfilDe(vg.perfil); if (pf) dMax = Math.max(dMax, pf.d || 0.15); });
          var yFundo = yV - dMax;
          if (lido && lido.tipo === "existente") { nEx++; refs[lido.ref || "?"] = 1; return; }
          var yB = lido && lido.tipo === "pilarete" && isFinite(num(lido.y, NaN)) ? num(lido.y, 0) - num(p.y0, 0) : yBase, h = yFundo - yB;
          if (h < 0.15) { nEx++; refs["piso embaixo"] = 1; return; }
          var N = ap.N * 1.0 + 0.3, pr = EL && EL.pilarete ? EL.pilarete(N, h, p.aco, p.minPil) : null, perfil = pr && pr.ok ? pr.perfil : "HSS101.6X101.6X6.4";
          if (pr && !pr.ok) falhas.push("pilarete de " + brf(h) + " m (" + pr.motivo + ")");
          /* até o TOPO DO AÇO (a linha das vigas "topo"), como no mezanino: no cálculo a ponta do pilarete é o nó das vigas */
          K.barra([pl[0], yB, pl[1]], [pl[0], yV, pl[1]], { ferr: "pilar", cat: perfil, papel: "Pilarete do piso", ifc: "IFCCOLUMN", aco: p.aco, nome: "Pilarete do piso " + (nPil + 1) }, "pilaretes");
          pilPts.push({ p: pl, yB: yB, yF: yV }); nPil++; Hmax = Math.max(Hmax, h);
          dimItens.push({ tipo: "pilarete", perfil: perfil, aco: p.aco, h: r4(h), N: r4(N), nome: "Pilarete do piso " + nPil });
          /* a placa de base ancorada, dimensionada pela compressão do pilarete (js/metalescadalinha.js) */
          if (EL && EL.fixacao) {
            var sP = H.perfilDe(perfil), it = { tipo: "fixacao", ponta: "pe", modo: "pes", rotulo: "Base do pilarete do piso " + nPil, pes: { s: { b: sP ? (sP.b || sP.bf || 0.1) * 1000 : 100, t: sP ? num(sP.t || sP.tw, 0.006) * 1000 : 6 } }, R: { V: N, H: 0.1 * N, hip: "base do pilarete: compressão + 10 % de horizontal (imperfeição, a favor)" }, longarina: { d: 100, bf: 100, tw: 6, tf: 6 }, alfa: 90, concreto: { esp: num(p.concEsp, 0), fck: num(p.concFck, 0), poly: arr(p.concPoly), borda: num(p.concBorda, 0), rotulo: "Piso de concreto embaixo" }, P: K.F.W([pl[0], yB, pl[1]]), eixo: [1, 0] };
            var fr = EL.fixacao(it); dimItens.push(it);   /* REVISÃO S6: a base de CADA pilarete (cada uma no seu ponto) */
            if (fr.desenho && fr.desenho.chapa && EL.chapaFixacao) EL.chapaFixacao(K, K.F, pl[0], pl[1], yB, fr.desenho, "pis-pb-" + gid + "-" + nPil, "Base do pilarete do piso " + nPil, 0, "Placa de base");
          }
        });
        /* ---- X nas faces entre pilaretes vizinhos (a estrutura rotulada não fica de pé sem ele) */
        var nX = 0;
        if (pilPts.length >= 2 && EL) {
          /* X em cada SUB-VÃO de cada lado (entre apoios consecutivos — cantos e apoios do meio): cada pilarete travado no plano da face */
          var trechos = [];
          for (var e2 = 0; e2 < Pt.length; e2++) {
            var pa0 = T(Pt[e2]), pb0 = T(Pt[(e2 + 1) % Pt.length]), dxe = pb0[0] - pa0[0], dze = pb0[1] - pa0[1], Le = Math.hypot(dxe, dze);
            var noLado = pilPts.filter(function (x) { var t3 = ((x.p[0] - pa0[0]) * dxe + (x.p[1] - pa0[1]) * dze) / (Le * Le); return t3 > -1e-6 && t3 < 1 + 1e-6 && Math.abs((x.p[0] - pa0[0]) * dze - (x.p[1] - pa0[1]) * dxe) / Le < 0.02; })
              .sort(function (a, b) { return ((a.p[0] - pa0[0]) * dxe + (a.p[1] - pa0[1]) * dze) - ((b.p[0] - pa0[0]) * dxe + (b.p[1] - pa0[1]) * dze); });
            for (var j3 = 0; j3 + 1 < noLado.length; j3++) trechos.push([noLado[j3], noLado[j3 + 1]]);
          }
          /* a PASSAGEM da escada (recorte na borda): nenhum X atravessa o caminho dela */
          var pass = arr(p.passagens).filter(function (q6) { return arr(q6).length >= 4; });
          var cruzaPassagem = function (A1, B1) {
            var m = [(A1.p[0] + B1.p[0]) / 2, (A1.p[1] + B1.p[1]) / 2], d = [B1.p[0] - A1.p[0], B1.p[1] - A1.p[1]], Ld = Math.hypot(d[0], d[1]) || 1;
            return pass.some(function (q6) {
              var bb = bboxP(q6); if (m[0] < bb.x0 - 0.06 || m[0] > bb.x1 + 0.06 || m[1] < bb.z0 - 0.06 || m[1] > bb.z1 + 0.06) return false;
              var lx = bb.x1 - bb.x0, lz = bb.z1 - bb.z0, ax = lx >= lz ? [1, 0] : [0, 1];   /* o eixo comprido da passagem = a direção da escada */
              return Math.abs((d[0] * ax[0] + d[1] * ax[1]) / Ld) < 0.7;
            });
          };
          trechos.forEach(function (tr) {
            var A1 = tr[0], B1 = tr[1];
            if (A1.yF - A1.yB < 0.15) return;
            if (cruzaPassagem(A1, B1)) return;   /* REVISÃO S6 (A3): piso baixo também leva X (sem ele, pilarete rotulado = mecanismo) */
            K.barra([A1.p[0], A1.yB, A1.p[1]], [B1.p[0], B1.yF, B1.p[1]], { ferr: "diagonal", cat: EL.BR_X, papel: "Contraventamento do piso", ifc: "IFCMEMBER", aco: p.aco, nome: "X do piso " + (++nX) }, "contravento");
            K.barra([B1.p[0], B1.yB, B1.p[1]], [A1.p[0], A1.yF, A1.p[1]], { ferr: "diagonal", cat: EL.BR_X, papel: "Contraventamento do piso", ifc: "IFCMEMBER", aco: p.aco, nome: "X do piso " + (++nX) }, "contravento");
          });
        }
        /* REVISÃO S6: com apoio no MEIO dos lados (pilarete do meio da viga de borda) o plano do piso precisa de X horizontal —
           sem ele os nós do meio só se seguram pela flexão fraca da viga de borda (a Estrutura desenhada acusava grande
           deslocabilidade). X no plano em cada vão entre apoios dos dois lados compridos; nenhum atravessa uma abertura */
        var nXp = 0;
        if (!lerCaminho(p.contorno).length && pilPts.length > 4 && EL) {
          var z0s = [], z1s = [], x0s = [], x1s = [];
          pilPts.forEach(function (pp7) { var q7 = T(pp7.p); if (Math.abs(q7[1] - bt.z0) < 0.02) z0s.push(q7[0]); else if (Math.abs(q7[1] - bt.z1) < 0.02) z1s.push(q7[0]); if (Math.abs(q7[0] - bt.x0) < 0.02) x0s.push(q7[1]); else if (Math.abs(q7[0] - bt.x1) < 0.02) x1s.push(q7[1]); });
          var comunsDe = function (a8, b8) { return a8.filter(function (x7) { return b8.some(function (y7) { return Math.abs(x7 - y7) < 0.02; }); }).sort(function (u7, v7) { return u7 - v7; }); };
          var comuns = comunsDe(z0s, z1s), comunsX = comunsDe(x0s, x1s), feitos = {};
          var atravessa = function (a7, b7) { return absT.some(function (bx) { for (var t7 = 0; t7 <= 1.0001; t7 += 0.05) { var x8 = a7[0] + (b7[0] - a7[0]) * t7, z8 = a7[1] + (b7[1] - a7[1]) * t7; if (x8 > bx.x0 && x8 < bx.x1 && z8 > bx.z0 && z8 < bx.z1) return true; } return false; }); };
          var diag = function (dg) {
            var ch = [dg[0], dg[1]].map(function (q8) { return q8[0].toFixed(3) + "," + q8[1].toFixed(3); }).sort().join("|");
            if (feitos[ch] || atravessa(dg[0], dg[1])) return; feitos[ch] = 1;
            var A7 = T(dg[0]), B7 = T(dg[1]);
            K.barra([A7[0], yV, A7[1]], [B7[0], yV, B7[1]], { ferr: "diagonal", cat: EL.BR_X, papel: "Contraventamento no plano do piso", ifc: "IFCMEMBER", aco: p.aco, nome: "X no plano do piso " + (++nXp) }, "contravento");
          };
          for (var i7 = 0; i7 + 1 < comuns.length; i7++) { var xa7 = comuns[i7], xb7 = comuns[i7 + 1]; diag([[xa7, bt.z0], [xb7, bt.z1]]); diag([[xb7, bt.z0], [xa7, bt.z1]]); }
          /* REVISÃO S6 rodada 4 (revisor): os pilaretes do MEIO dos outros dois lados também precisam do plano do piso — sem
             diagonal chegando neles só a flexão fraca da viga de borda os segurava (6 × 8 a 0,6 m: Δ2/Δ1 = 3,7, reprovado por
             deslocabilidade) — a 2ª família de X, entre os lados x0 e x1, quando eles têm apoio no meio */
          if (comunsX.length > 2) for (var i9 = 0; i9 + 1 < comunsX.length; i9++) { var za9 = comunsX[i9], zb9 = comunsX[i9 + 1]; diag([[bt.x0, za9], [bt.x1, zb9]]); diag([[bt.x0, zb9], [bt.x1, za9]]); }
        }
        if (falhas.length) K.avisos.unshift("NÃO PASSA: " + falhas.join("; ") + " — aumente os apoios ou divida o piso");
        if (nPil && Hmax > 0.15 && !nX) crit.push("não verificado: estabilidade lateral dos pilaretes (sem X nas faces) (CRÍTICO)");
        nvs.push("não verificado: ligações viga × viga e viga × pilarete do piso (use Ligação inteligente)");
        /* o elemento EXISTENTE que passa a receber o piso não é verificado aqui: crítico (calcule a estrutura desenhada com ele) */
        if (nEx && Object.keys(refs).some(function (k6) { return k6 !== "piso embaixo"; })) crit.push("não verificado: o elemento existente onde o piso apoia (" + Object.keys(refs).join(", ") + ") com a carga do piso — calcule pela Estrutura desenhada com ele (CRÍTICO)");
        est0 = { vigas: vigas.length, intermediarias: linhasInt.length, pilaretes: nPil, existentes: nEx, refs: Object.keys(refs), vao: r4(s), vaoMax: vm.vao, fonteVao: vm.fonte, x: nX, falhas: falhas };
        K.avisos.push("Vão das intermediárias: " + brf(s) + " m ≤ vão máximo do piso " + brf(vm.vao) + " m (" + vm.fonte + ")");
      }
      var mats = { grade: "grade eletrofundida", xadrez: "chapa xadrez", expandida: "chapa expandida", perfurada: "chapa perfurada", lisa: "chapa lisa" };
      var forma = lerCaminho(p.contorno).length >= 3 ? "contorno de " + P.length + " lados, " + brf(A0) + " m²" : brf(p.Lx) + " × " + brf(p.Lz) + " m";
      var apoioTxt = est0 ? (est0.pilaretes ? est0.pilaretes + " pilarete(s) até a cota " + brf(num(p.cotaApoio, 0)) + " m" + (est0.x ? " com X nas faces" : "") : "") + (est0.existentes ? (est0.pilaretes ? "; " : "") + est0.existentes + " apoio(s) no que está embaixo (" + est0.refs.join(", ") + ")" : "") : "";
      return { resumo: "Piso em " + mats[p.material] + " " + forma + " em " + nPain + " painel(éis)" + (kg ? " (" + brf(kg.kgm2, 1) + " kg/m²)" : "") + (abs.length ? ", " + abs.length + " abertura(s)" : "") +
          (est0 ? "; estrutura: " + est0.vigas + " vigas (" + est0.intermediarias + " intermediárias a cada " + brf(est0.vao) + " m — vão máx. do piso " + brf(est0.vaoMax) + " m pela " + est0.fonteVao.split(" (")[0] + "); apoio: " + (apoioTxt || "—") : ""),
        medidas: { paineis: nPain, area: r4(areaPain), kgm2: kg ? kg.kgm2 : null, acesso: null, estrutura: est0, aberturas: abs.length, dim: { itens: dimItens, naoVerificados: nvs, criticos: crit } } };
    },
    dica: { titulo: "Piso industrial", oQueE: "Piso em grade eletrofundida, chapa xadrez, expandida ou perfurada por RETÂNGULO (2 cantos) ou CONTORNO (cliques, Enter fecha), com a estrutura de suporte: vigas de borda e intermediárias no vão máximo do piso (tabela de vão × carga do catálogo) e pilaretes até o nível de baixo quando não há apoio.", ondeUsa: "Plataformas, mezaninos, passarelas, tampas de canaleta, piso técnico.", dica: "Retângulo: 2 cantos. Contorno: clique os cantos e Enter (Backspace desfaz o último, Esc cancela). A escada por linha abre a passagem neste piso sozinha." },
    desenho: function (D) { var s = "", i; for (i = 0; i < 12; i++) s += D.ln(40 + i * 22, 50, 40 + i * 22, 160, D.ACOL, 3); for (i = 0; i < 5; i++) s += D.ln(30, 55 + i * 26, 290, 55 + i * 26, D.DSTL, 1.2); return s + D.tx(160, 185, "barra portante × travessa", "middle"); }
  };


  /* ================================================================ ESCADA HELICOIDAL EM VOLTA DO TANQUE
   * local: origem no CENTRO do tanque na base; P(r, θ, y) = [r·cos θ, y, r·sen θ]. Degrau pela norma (NR-12 por
   * padrão) medido na LINHA DE PERCURSO (meio da largura); lances de no máximo 3,00 m com patamar de descanso
   * (setor plano); longarinas interna e externa em cordas, consoles radiais no costado, guarda-corpo do lado de
   * fora (o costado protege o lado de dentro). */
  var HELICOIDAL = { rotulo: "Escada helicoidal no tanque", cliques: 1, calcula: true, PADRAO: {
    raioTanque: 3.0, altura: 6.0, largura: 0.8, folga: 0.10, angIni: 0, sentido: "anti-horario", norma: "nr12", lanceMax: 0, patamarComp: 0.9,
    longarina: "C200X17.1", console: "C150X12.2", espConsoles: 1.8, degrau: "grade", tDegrau: 0.00635, gradeH: 0.030, gradeT: 0.005, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, rodape: true, hRodape: 0.20, intermediaria: 0.70, usoGuarda: "industrial", usoPiso: "escada-sem-publico", aco: "ASTM A36" },
    nums: ["raioTanque", "altura", "largura", "folga", "angIni", "lanceMax", "patamarComp", "espConsoles", "tDegrau", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espac", "hRodape", "intermediaria"],
    bools: ["rodape"], perfis: ["longarina", "console", "montante", "corrimao"],
    validar: function (p) {
      if (!(p.raioTanque >= 1 && p.raioTanque <= 40)) return "Escada helicoidal: raio do tanque de 1 a 40 m.";
      if (!(p.altura >= 1 && p.altura <= 40)) return "Altura a vencer de 1 a 40 m.";
      if (!(p.largura >= 0.5 && p.largura <= 1.5)) return "Largura da escada de 0,50 a 1,50 m.";
      var A = AC(); if (!A) return "As regras de acesso (js/acoacessos.js) não carregaram.";
      if (!A.REGRA_DEG[p.norma]) return "Norma da escada desconhecida: " + p.norma + ".";
      var d = A.degraus(p.altura, p.norma); if (!d.ok) return d.motivo;
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var A = AC(), dg = A.degraus(p.altura, p.norma), n = dg.n, e = dg.e, pp = dg.p, W = p.largura, R = p.raioTanque, ri = R + p.folga, ro = ri + W, rm = (ri + ro) / 2, sg = p.sentido === "horario" ? -1 : 1;
      var dTh = pp / rm, tD = p.degrau === "grade" ? num(p.gradeH, 0.03) : num(p.tDegrau, 0.00635), pl = H.perfilDe(p.longarina), dL = pl ? pl.d : 0.2, bL = pl ? pl.bf : 0.06, gid = String(novoId());
      var hMax = p.lanceMax > 0 ? p.lanceMax : (p.norma === "nbr9050" ? 3.20 : (p.norma === "emergencia" ? 3.70 : 3.00));
      var nL = Math.max(1, Math.ceil(p.altura / hMax - 1e-9)); while (nL < n && Math.ceil(n / nL) * e > hMax + 1e-9) nL++;
      var nBase = Math.floor(n / nL), resto = n % nL, Lp = Math.max(p.patamarComp, 0.6), dThP = Lp / rm;
      if (nBase < 2) return { erro: "Lances curtos demais: aumente a altura máxima por lance." };
      function P(r, th, y) { return [r * Math.cos(th), y, r * Math.sin(th)]; }
      function setor(r0, r1, a0, a1) { var C = [], q, m = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.08)); for (q = 0; q <= m; q++) { var t1 = a0 + (a1 - a0) * q / m; C.push([r1 * Math.cos(t1), r1 * Math.sin(t1)]); } for (q = m; q >= 0; q--) { var t2 = a0 + (a1 - a0) * q / m; C.push([r0 * Math.cos(t2), r0 * Math.sin(t2)]); } return C; }
      var mat = p.degrau === "grade" ? "grade" : "xadrez", th = p.angIni * GRAU, y = 0, go = optGuarda(H, p, gid), nDeg = 0, consolesTh = [], hLance = 0, ultCons = -1e9;
      function consoleEm(t, yTopoAco) { K.barra(P(R, t, yTopoAco), P(ro + bL, t, yTopoAco), { ferr: "viga", cat: p.console, just: "topo", papel: "Console da escada helicoidal", ifc: "IFCMEMBER", aco: p.aco, nome: "Console " + (consolesTh.length + 1) }, "consoles"); consolesTh.push(t); }
      for (var iL = 0; iL < nL; iL++) {
        var nR = nBase + (iL < resto ? 1 : 0), th0 = th, y0 = y, nos = [];
        hLance = Math.max(hLance, nR * e);
        /* DEGRAUS em setor (de dentro para fora), o topo na cota do degrau */
        for (var k = 1; k < nR; k++) {
          var a0 = th0 + sg * (k - 1) * dTh, a1 = th0 + sg * k * dTh, yk = y0 + k * e;
          var c = K.chapa({ origem: [0, yk, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: tD, contorno: setor(ri, ro, Math.min(a0, a1), Math.max(a0, a1)), papel: "Degrau", aco: "ASTM A36", nome: "Degrau " + (++nDeg) }, "degraus");
          pisoSobre(H, K, c, p, mat);
          if (c) c.metal.papel = mat === "grade" ? "Degrau em grade" : "Degrau em chapa xadrez";
        }
        /* LONGARINAS (cordas pelos bocéis, do pé do lance ao topo), interna e externa */
        for (var j = 0; j < nR; j++) nos.push({ th: th0 + sg * j * dTh, y: y0 + (j + 1) * e - tD - dL / 2 });
        nos.unshift({ th: th0 - sg * dTh * 0.5, y: y0 + e / 2 - tD - dL / 2 });
        [ri - bL / 2, ro + bL / 2].forEach(function (rr, lado) {
          for (var q = 0; q + 1 < nos.length; q++) K.barra(P(rr, nos[q].th, nos[q].y), P(rr, nos[q + 1].th, nos[q + 1].y), { ferr: "diagonal", cat: p.longarina, papel: "Longarina da escada helicoidal", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina " + (lado ? "externa" : "interna") + " — lance " + (iL + 1) + " trecho " + (q + 1) }, "longarinas");
        });
        /* CONSOLES no costado a cada espConsoles (arco na linha de percurso) */
        nos.forEach(function (nd, q) { if (q === 0 || Math.abs(nd.th - ultCons) * rm >= p.espConsoles - 1e-6 || q === nos.length - 1) { consoleEm(nd.th, nd.y - dL / 2); ultCons = nd.th; } });
        /* GUARDA-CORPO de fora pelos bocéis: pontos a cada ~espac (corda), do pé ao topo do lance */
        var aTop = th0 + sg * (nR - 1) * dTh, yTop = y0 + nR * e, Lh = Math.abs(aTop - th0) * (ro + bL / 2), nP = Math.max(1, Math.ceil(Math.sqrt(Lh * Lh + Math.pow(yTop - y0 - e, 2)) / p.espac - 1e-9)), cam = [];
        for (var g = 0; g <= nP; g++) { var f = g / nP; cam.push(P(ro + bL / 2, th0 + (aTop - th0) * f, y0 + e + (yTop - y0 - e) * f)); }
        H.guardaCorpo(K, cam, (function () { var o2 = H.clone(go); o2.gid = gid + "-l" + iL; return o2; })());
        th = aTop; y = yTop;
        /* PATAMAR DE DESCANSO (setor plano) entre lances, com consoles nas duas pontas e guarda-corpo de fora */
        if (iL < nL - 1) {
          var b0 = th, b1 = th + sg * dThP;
          var cp = K.chapa({ origem: [0, y, 0], ex: [1, 0, 0], ey: [0, 0, 1], t: tD, contorno: setor(ri, ro, Math.min(b0, b1), Math.max(b0, b1)), papel: "Patamar da escada helicoidal", aco: "ASTM A36", nome: "Patamar " + (iL + 1) }, "patamares");
          pisoSobre(H, K, cp, p, mat); if (cp) cp.metal.papel = "Patamar da escada helicoidal";
          consoleEm(b1, y - tD); ultCons = b1;
          var nPp = Math.max(1, Math.ceil(Lp / p.espac - 1e-9)), camP = [];
          for (var h2 = 0; h2 <= nPp; h2++) camP.push(P(ro + bL / 2, b0 + (b1 - b0) * h2 / nPp, y));
          H.guardaCorpo(K, camP, (function () { var o3 = H.clone(go); o3.gid = gid + "-p" + iL; return o3; })());
          th = b1;
        }
      }
      var giro = Math.abs(th - p.angIni * GRAU) / GRAU;
      K.avisos.push("Degrau medido na linha de percurso (raio " + brf(rm) + " m): piso de " + brf(pp * 100, 1) + " cm no meio, " + brf(pp * ri / rm * 100, 1) + " cm junto do costado e " + brf(pp * ro / rm * 100, 1) + " cm na borda de fora — " + dg.ref);
      K.avisos.push("Consoles soldados no costado: chapa de reforço e a verificação local da parede ficam com o projeto do tanque");
      var acesso = { tipo: p.norma === "nr12-ingreme" ? "escada-ingreme" : "escada", perfil: p.norma, forma: "helicoidal", pInterno: r4(pp * ri / rm), desnivel: p.altura, largura: W, e: e, p: pp, n: n, lances: nL, desnivelEntrePatamares: r4(hLance), patamar: nL > 1 ? { comprimento: Lp, largura: W } : null, alturaLivre: null,
        guarda: acessoGuarda(H, p, 1, 1), corrimao: { alturas: [num(p.intermediaria, 0.7)], lados: 1, diametro: (H.perfilDe(p.corrimao) || {}).D || null, prolongamento: 0 } };
      var q0 = qDe({ usoPiso: p.usoPiso }, "helicoidal"), esp = p.espConsoles;
      var dim = { itens: [
        { tipo: "longarina", perfil: p.longarina, aco: p.aco, e: e, p: pp, Lh: esp, largura: W, gPiso: gPisoDe(H, { piso: mat, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, gradeB: p.gradeB, gradeS: p.gradeS, tPiso: p.tDegrau }), q: q0, qRef: "NBR 6120:2019, Tabela 10" },
        { tipo: "degrau", material: mat === "grade" ? "grade" : "chapa", aco: "ASTM A36", t: tD, vao: W, p: pp * ro / rm, gradeH: p.gradeH, gradeT: p.gradeT, gradeA: p.gradeA, q: q0 },
        { tipo: "console", perfil: p.console, aco: p.aco, L: ro + bL - R, area: W * esp, q: q0, espac: esp },
        { tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: p.espac }],
        naoVerificados: ["não verificado: ligação console × costado e a parede do tanque (frente de Tanques)", "não verificado: torção da longarina curva (as cordas entre consoles são verificadas como vigas inclinadas biapoiadas)"] };
      var cont = K.cont;
      return { resumo: "Escada helicoidal em volta de Ø " + brf(2 * R) + " m, " + brf(p.altura) + " m em " + nL + " lance(s)" + (nL > 1 ? " com " + (nL - 1) + " patamar(es)" : "") + ", " + brf(giro, 0) + "° de volta: " + n + " espelhos de " + brf(e * 100, 1) + " cm, piso de " + brf(pp * 100, 1) + " cm na linha de percurso; " + (cont.degraus || 0) + " degraus, " + (cont.consoles || 0) + " consoles",
        medidas: { n: n, e: e, p: pp, lances: nL, giro: giro, rm: rm, acesso: acesso, dim: dim } };
    },
    dica: { titulo: "Escada helicoidal no tanque", oQueE: "Escada que sobe enrolada no costado do tanque: degraus em setor, longarinas interna e externa, consoles radiais no costado, patamar de descanso a cada 3,00 m e guarda-corpo do lado de fora.", ondeUsa: "Tanque de armazenamento, silo, torre — acesso habitual ao teto e às plataformas.", dica: "Clique o CENTRO do tanque e digite o raio externo do costado e a altura. O degrau sai pela norma (NR-12) medido na linha de percurso." },
    desenho: function (D) { var s = '<rect x="110" y="20" width="100" height="170" fill="' + D.ACO + '" stroke="' + D.ACOL + '" stroke-width="2"/>'; for (var i = 0; i < 9; i++) { var x = 100 + (i % 2 ? 110 : 10) + (i % 2 ? -i * 2 : i * 2), y0 = 180 - i * 18; s += D.ln(100 + i * 13, 185 - i * 18, 113 + i * 13, 185 - i * 18, D.DSTL, 3); void x; void y0; } s += D.mem(95, 190, 220, 30, false, 4); s += D.ln(95, 150, 220, -10, D.ACOL, 2); return s + D.tx(160, 14, "sobe enrolada no costado", "middle"); }
  };


  /* ================================================================ RAMPA (NR-12 industrial ou NBR 9050 acessível)
   * local: u ao longo (sobe), y para cima, w de lado; origem no pé da rampa, no meio da largura.
   * Segmentos inclinados com patamar entre eles; longarinas, travessas sob o piso, pilaretes nos apoios;
   * NR-12: até 20°, peças transversais acima de 10° (item 6); NBR 9050: até 8,33 % com desnível por segmento
   * pela Tabela de rampas e patamar de 1,20 m, corrimão duplo com prolongamento de 0,30 m. */
  var RAMPA = { rotulo: "Rampa", cliques: 1, calcula: true, PADRAO: {
    norma: "nr12", desnivel: 1.0, inclinacao: 15, largura: 1.0, segMax: 0, patamarComp: 1.2, vaoMax: 3.0, espTravessas: 0.6,
    longarina: "C200X17.1", travessa: "C100X10.8", pilarete: "HSS76.2X76.2X6.4", piso: "xadrez", tPiso: 0.00635, gradeH: 0.030, gradeT: 0.005, gradeA: 0.030, gradeB: 0.100, gradeS: 0.005,
    pecasTransversais: true, espPecas: 0.45, guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, rodape: true, hRodape: 0.20, intermediaria: 0.70,
    usoGuarda: "industrial", usoPiso: "escada-sem-publico", aco: "ASTM A36" },
    nums: ["desnivel", "inclinacao", "largura", "segMax", "patamarComp", "vaoMax", "espTravessas", "tPiso", "gradeH", "gradeT", "gradeA", "gradeB", "gradeS", "espPecas", "espac", "hRodape", "intermediaria"],
    bools: ["pecasTransversais", "rodape"], perfis: ["longarina", "travessa", "pilarete", "montante", "corrimao"],
    validar: function (p) {
      if (!(p.desnivel >= 0.1 && p.desnivel <= 10)) return "Rampa: desnível de 0,10 a 10 m.";
      if (!(p.inclinacao > 0.5 && p.inclinacao <= 60)) return "Rampa: inclinação de 0,5 % a 60 %.";
      if (!(p.largura >= 0.4 && p.largura <= 4)) return "Rampa: largura de 0,40 a 4 m.";
      if (!(p.vaoMax >= 1 && p.vaoMax <= 8)) return "Vão máximo da longarina entre apoios de 1 a 8 m.";
      if (p.desnivel / (p.inclinacao / 100) > 80) return "Rampa com mais de 80 m de projeção: divida.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var i = p.inclinacao / 100, al = Math.atan(i), W = p.largura, n9050 = p.norma === "nbr9050", gid = String(novoId());
      var segMax = p.segMax > 0 ? p.segMax : (n9050 ? (p.inclinacao <= 5 ? 1.5 : (p.inclinacao <= 6.25 ? 1.0 : 0.8)) : 99);
      var nSeg = Math.max(1, Math.ceil(p.desnivel / segMax - 1e-9)), hS = p.desnivel / nSeg, LhS = hS / i, Lp = p.patamarComp;
      var pl = H.perfilDe(p.longarina), dL = pl ? pl.d : 0.2, bL = pl ? pl.bf : 0.06, tP = espPiso(p), mat = p.piso === "grade" ? "grade" : (p.piso === "xadrez" ? "xadrez" : p.piso);
      var lados = p.guarda === "nenhum" ? [] : (p.guarda === "um" ? [1] : [1, -1]);
      var cam = [], u = 0, y = 0, apoios = [], pre = n9050 ? 0.30 : 0;
      function yDe(uu) { return uu; }
      cam.push([-pre, 0]); if (pre) cam.push([0, 0]);
      for (var s = 0; s < nSeg; s++) {
        var u1 = u + LhS, y1 = y + hS, Ls = Math.sqrt(LhS * LhS + hS * hS), ex = [LhS / Ls, hS / Ls, 0];
        var cp = K.chapa({ origem: [u, y, -W / 2], ex: ex, ey: [0, 0, 1], t: tP, ret: { L: Ls, B: W }, papel: "Piso da rampa", aco: "ASTM A36", nome: "Piso da rampa — segmento " + (s + 1) }, "piso");
        pisoSobre(H, K, cp, p, mat); if (cp) cp.metal.papel = "Piso da rampa";
        [1, -1].forEach(function (sg) { K.barra([u, y - tP - dL / 2 / Math.cos(al), sg * (W / 2 + bL / 2)], [u1, y1 - tP - dL / 2 / Math.cos(al), sg * (W / 2 + bL / 2)], { ferr: "diagonal", cat: p.longarina, papel: "Longarina da rampa", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina " + (sg > 0 ? "esquerda" : "direita") + " — segmento " + (s + 1) }, "longarinas"); });
        var nT = Math.max(1, Math.ceil(LhS / p.espTravessas - 1e-9));
        for (var k = 0; k <= nT; k++) { var ut = u + LhS * k / nT, yt = y + hS * k / nT - tP; K.barra([ut, yt, -W / 2], [ut, yt, W / 2], { ferr: "viga", cat: p.travessa, just: "topo", papel: "Travessa da rampa", ifc: "IFCMEMBER", aco: p.aco, nome: "Travessa — segmento " + (s + 1) }, "travessas"); }
        /* apoios: no pé, a cada vaoMax (ao longo) e no topo do segmento */
        var nA = Math.max(1, Math.ceil(Ls / p.vaoMax - 1e-9));
        for (var a = (s === 0 ? 1 : 0); a <= nA; a++) apoios.push([u + LhS * a / nA, y + hS * a / nA]);
        /* peças transversais (NR-12, Anexo III, 6): acima de 10° */
        if (!n9050 && p.pecasTransversais && al > 10 * GRAU + 1e-9) {
          var nPc = Math.floor(Ls / p.espPecas);
          for (var c = 1; c <= nPc; c++) { var sc = c * p.espPecas, uc = u + sc * Math.cos(al), yc = y + sc * Math.sin(al); K.chapa({ origem: [uc, yc, -W / 2 + 0.02], ex: [0, 0, 1], ey: [0, 1, 0], t: 0.02, ret: { L: W - 0.04, B: 0.015 }, papel: "Peça transversal antiderrapante", aco: "ASTM A36", nome: "Peça transversal " + c + " — segmento " + (s + 1) }, "pecas"); }
        }
        cam.push([u1, y1]);
        u = u1; y = y1;
        if (s < nSeg - 1) {
          var cpp = K.chapa({ origem: [u, y, -W / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: tP, ret: { L: Lp, B: W }, papel: "Patamar da rampa", aco: "ASTM A36", nome: "Patamar " + (s + 1) }, "patamares");
          pisoSobre(H, K, cpp, p, mat); if (cpp) cpp.metal.papel = "Patamar da rampa";
          [1, -1].forEach(function (sg) { K.barra([u, y - tP - dL / 2, sg * (W / 2 + bL / 2)], [u + Lp, y - tP - dL / 2, sg * (W / 2 + bL / 2)], { ferr: "viga", cat: p.longarina, papel: "Longarina da rampa", ifc: "IFCMEMBER", aco: p.aco, nome: "Longarina do patamar " + (s + 1) }, "longarinas"); });
          K.barra([u + Lp, y - tP, -W / 2], [u + Lp, y - tP, W / 2], { ferr: "viga", cat: p.travessa, just: "topo", papel: "Travessa da rampa", ifc: "IFCMEMBER", aco: p.aco, nome: "Travessa do patamar " + (s + 1) }, "travessas");
          apoios.push([u + Lp, y]);
          u += Lp; cam.push([u, y]);
        }
      }
      if (pre) cam.push([u + pre, y]);
      /* PILARETES nos apoios (das longarinas até o chão) */
      apoios.forEach(function (ap, j) { if (ap[1] < 0.15) return; [1, -1].forEach(function (sg) { K.barra([ap[0], 0, sg * (W / 2 + bL / 2)], [ap[0], ap[1] - tP - dL, sg * (W / 2 + bL / 2)], { ferr: "pilar", cat: p.pilarete, papel: "Pilarete da rampa", ifc: "IFCCOLUMN", aco: p.aco, nome: "Pilarete " + (j + 1) + (sg > 0 ? "e" : "d") }, "pilaretes"); }); });
      /* GUARDA-CORPO e corrimão pelo caminho do piso (NBR 9050: corrimão a 0,92 e 0,70 m com prolongamento) */
      var go = optGuarda(H, p, gid);
      if (n9050) { go.alturas = [1.10, 0.92, 0.70]; go.altura = 1.10; go.corrimao2 = [0.92, 0.70]; go.rodape = p.rodape ? num(p.hRodape, 0.05) : 0; }
      lados.forEach(function (sg) { var o2 = H.clone(go); o2.gid = gid + (sg > 0 ? "e" : "d"); H.guardaCorpo(K, cam.map(function (q) { return [q[0], q[1], sg * (W / 2 + bL / 2)]; }), o2); });
      /* CORRIMÃO INTERMEDIÁRIO (NBR 9050, 6.9.4): largura acima de 2,40 m */
      var corrInterm = false;
      if (n9050 && W > 2.40 + 1e-9) {
        var n0c = K.pecas.length;
        H.guardaCorpo(K, cam.map(function (q) { return [q[0], q[1], 0]; }), { gid: gid + "-ci", montante: p.corrimao, corrimao: p.corrimao, altura: 0.92, alturas: [0.92, 0.70], corrimao2: [0.92, 0.70], espac: Math.max(p.espac, 1.5), aco: p.aco });
        for (var qc = n0c; qc < K.pecas.length; qc++) K.pecas[qc].metal.papel = /Montante/.test(K.pecas[qc].metal.papel) ? "Montante do corrimão intermediário" : "Corrimão intermediário";
        corrInterm = true;
      }
      var Ltot = u, ang = al / GRAU;
      if (!n9050 && ang > 20 + 1e-9) K.avisos.push("Rampa acima de 20°: PROIBIDA pela NR-12, Anexo III, 6.1 — use escada");
      var pc = H.perfilDe(p.corrimao);
      var acesso = { tipo: "rampa", perfil: n9050 ? "nbr9050" : "nr12", desnivel: p.desnivel, largura: W, comprimento: Ltot, angulo: ang, inclinacaoPct: p.inclinacao, lances: nSeg, desnivelEntrePatamares: r4(hS), patamar: nSeg > 1 ? { comprimento: Lp, largura: W } : null,
        rampa: { inclinacaoPct: p.inclinacao, travessas: !n9050 && p.pecasTransversais && ang > 10 ? { esp: p.espPecas, altura: 0.015 } : null },
        guarda: acessoGuarda(H, p, lados.length ? 2 : 2, lados.length), corrimao: n9050 ? { alturas: [0.92, 0.70], lados: lados.length, diametro: pc && pc.forma === "tubo-circ" ? pc.D : null, prolongamento: pre, intermediario: corrInterm } : null };
      if (n9050) { acesso.guarda.alturas = [0.92, 0.70]; acesso.guarda.rodape = p.rodape ? num(p.hRodape, 0.05) : 0; }
      var q0 = qDe(p, "rampa"), g0 = gPisoDe(H, p), vaoL = Math.min(Math.sqrt(LhS * LhS + hS * hS), p.vaoMax) * Math.cos(al);
      var dim = { itens: [
        { tipo: "longarina", perfil: p.longarina, aco: p.aco, e: i, p: 1, Lh: vaoL, largura: W, gPiso: g0, q: q0, qRef: "NBR 6120:2019, Tabela 10" },
        { tipo: "viga", nome: "Travessa", perfil: p.travessa, aco: p.aco, L: W, faixa: p.espTravessas, q: q0, gPiso: g0, travadaPeloPiso: true },
        dimPiso(p, p.espTravessas), { tipo: "montante", perfil: p.montante, corrimao: p.corrimao, aco: "ASTM A36", uso: p.usoGuarda, espac: p.espac }],
        naoVerificados: ["não verificado: pilaretes e as ligações dos apoios", "não verificado: base dos pilaretes (chumbadores)"] };
      var cont = K.cont;
      return { resumo: "Rampa " + (n9050 ? "NBR 9050" : "NR-12") + " de " + brf(p.desnivel) + " m a " + brf(p.inclinacao, 2) + " % (" + brf(ang, 1) + "°), largura " + brf(W) + " m: " + nSeg + " segmento(s)" + (nSeg > 1 ? " com " + (nSeg - 1) + " patamar(es)" : "") + ", projeção " + brf(Ltot) + " m" + (cont.pecas ? ", " + cont.pecas + " peças transversais" : "") + ", " + (cont.pilaretes || 0) + " pilaretes",
        medidas: { segmentos: nSeg, comprimento: Ltot, angulo: ang, acesso: acesso, dim: dim } };
    },
    dica: { titulo: "Rampa", oQueE: "Rampa de aço com longarinas, travessas, piso, patamares, pilaretes e guarda-corpo — NR-12 (até 20°, peças transversais acima de 10°) ou NBR 9050 (até 8,33 %, patamar a cada segmento, corrimão duplo).", ondeUsa: "Acesso com carrinho ou ferramenta, rota acessível, docas, pequenos desníveis.", dica: "Clique o pé da rampa. A norma decide o desnível por segmento e os patamares." },
    desenho: function (D) { var s = D.mem(20, 180, 150, 110, false, 6) + D.mem(150, 110, 210, 110, false, 6) + D.mem(210, 110, 300, 60, false, 6); s += D.ln(20, 140, 150, 70, D.ACOL, 2) + D.ln(150, 70, 210, 70, D.ACOL, 2) + D.ln(210, 70, 300, 20, D.ACOL, 2); for (var i = 0; i < 5; i++) s += D.ln(40 + i * 24, 168 - i * 13, 44 + i * 24, 164 - i * 13, D.DSTL, 3); return s + D.tx(160, 196, "até 20° (NR-12) · 8,33 % (NBR 9050)", "middle"); }
  };


  /* ================================================================ CORRIMÃO DE PAREDE (2 cliques: começo e fim, na face da parede)
   * local: u ao longo da parede, w para fora da parede (o lado escolhido), y para cima; a parede é o plano w = 0. */
  var CORRPAREDE = { rotulo: "Corrimão de parede", cliques: 2, modo: "linha", calcula: true, PADRAO: {
    comprimento: 3, norma: "nbr9050", duplo: true, alturaSup: 0.92, alturaInf: 0.70, folga: 0.04, corrimao: "HSS42.2X3.6", espSuportes: 1.2, prolongamento: 0.30,
    lado: "esquerda", suporteD: 0.019, aco: "ASTM A36" },
    nums: ["comprimento", "alturaSup", "alturaInf", "folga", "espSuportes", "prolongamento", "suporteD"], bools: ["duplo"], perfis: ["corrimao"],
    validar: function (p) {
      if (!(p.comprimento >= 0.3 && p.comprimento <= 60)) return "Corrimão: comprimento de 0,30 a 60 m (clique o começo e o fim na face da parede).";
      if (!(p.alturaSup >= 0.6 && p.alturaSup <= 1.2)) return "Altura do corrimão de 0,60 a 1,20 m.";
      if (!(p.folga >= 0.02 && p.folga <= 0.15)) return "Folga entre a parede e o corrimão de 2 a 15 cm.";
      if (!(p.espSuportes >= 0.4 && p.espSuportes <= 2.5)) return "Suportes a cada 0,40 a 2,50 m.";
      return null;
    },
    gerar: function (p, K, novoId, ctx, H) {
      var pc = H.perfilDe(p.corrimao), D = pc ? (pc.D || pc.b || 0.042) : 0.042, s = p.lado === "direita" ? -1 : 1, wC = s * (p.folga + D / 2), L = p.comprimento, pr = Math.max(0, p.prolongamento);
      var alts = p.duplo ? [p.alturaSup, p.alturaInf] : [p.alturaSup], lig = "gc-cp-" + String(novoId()), n0 = K.pecas.length;
      alts.forEach(function (h) {
        K.perfil({ origem: [-pr, h, wC], ex: [1, 0, 0], ey: H.UP, perfil: pc, L: L + 2 * pr, papel: "Corrimão de parede", ifc: "IFCRAILING", aco: p.aco, lig: lig, nome: "Corrimão de parede a " + brf(h) + " m" }, "corrimaos");
        /* pontas RECURVADAS para a parede (sem ponta solta) */
        [-pr, L + pr].forEach(function (u, j) { K.perfil({ origem: [u, h, wC], ex: [0, 0, -s], ey: H.UP, perfil: pc, L: Math.abs(wC), papel: "Corrimão de parede", ifc: "IFCRAILING", aco: p.aco, lig: lig, nome: "Ponta recurvada " + (j + 1) + " a " + brf(h) + " m" }, "pontas"); });
        /* SUPORTES: barra redonda da parede até debaixo do corrimão + chapa de fixação na parede (2 furos) */
        var nS = Math.max(1, Math.ceil(L / p.espSuportes - 1e-9));
        for (var k = 0; k <= nS; k++) {
          var u = L * k / nS, yb = h - D / 2 - 0.035;
          K.perfil({ origem: [u, yb, 0], ex: [0, 0, s], ey: H.UP, perfil: { forma: "circ", d: p.suporteD }, L: Math.abs(wC), papel: "Suporte do corrimão", ifc: "IFCMEMBER", aco: p.aco, lig: lig, nome: "Suporte " + (k + 1) + " a " + brf(h) + " m" }, "suportes");
          K.perfil({ origem: [u, yb, wC], ex: H.UP, ey: [1, 0, 0], perfil: { forma: "circ", d: p.suporteD }, L: 0.035, papel: "Suporte do corrimão", ifc: "IFCMEMBER", aco: p.aco, lig: lig, nome: "Suporte (pino) " + (k + 1) }, "suportes");
          K.chapa({ origem: [u - 0.04, yb - 0.04, s > 0 ? 0.006 : 0], ex: [1, 0, 0], ey: H.UP, t: 0.006, ret: { L: 0.08, B: 0.08 }, furos: [{ u: 0.02, v: 0.04, db: 8, tipo: "padrao" }, { u: 0.06, v: 0.04, db: 8, tipo: "padrao" }], papel: "Chapa de fixação do corrimão", aco: p.aco, lig: lig, nome: "Chapa de fixação " + (k + 1) }, "chapas");
        }
      });
      for (var z = n0; z < K.pecas.length; z++) K.pecas[z].metal.acessorio = "corrimão";
      var acesso = { tipo: "corrimao", perfil: p.norma === "emergencia" ? "emergencia" : "nbr9050", corrimao: { alturas: alts.slice(), lados: 1, diametro: pc && pc.forma === "tubo-circ" ? pc.D : null, prolongamento: pr, folga: p.folga } };
      var cont = K.cont;
      return { resumo: "Corrimão de parede de " + brf(L) + " m a " + alts.map(function (h) { return brf(h); }).join(" e ") + " m, folga de " + brf(p.folga * 100, 0) + " cm da parede, prolongamento de " + brf(pr * 100, 0) + " cm com as pontas recurvadas; " + ((cont.suportes || 0) / 2) + " suportes",
        medidas: { acesso: acesso, dim: { itens: [{ tipo: "corrimao", perfil: p.corrimao, aco: p.aco, vao: L / Math.max(1, Math.ceil(L / p.espSuportes - 1e-9)), braco: Math.abs(wC) + 0.035, suporteD: p.suporteD }], naoVerificados: ["não verificado: chumbadores/buchas da chapa de fixação na parede (dependem da parede)"] } } };
    },
    dica: { titulo: "Corrimão de parede", oQueE: "Corrimão preso na parede: tubo nas alturas da norma, suportes de barra redonda com chapa de fixação, pontas recurvadas para a parede e o prolongamento.", ondeUsa: "Escada encostada em parede, rampa, circulação de rota acessível.", dica: "Clique o começo e o fim NA FACE DA PAREDE e escolha o lado do corrimão. NBR 9050: 0,92 e 0,70 m, Ø 30–45 mm, 0,30 m de prolongamento." },
    desenho: function (D) { var s = '<rect x="20" y="20" width="18" height="170" fill="' + D.ACO + '" stroke="' + D.ACOL + '"/>'; s += D.mem(60, 70, 300, 70, true, 5) + D.mem(60, 110, 300, 110, true, 5); for (var i = 0; i < 4; i++) { s += D.ln(38, 78 + 0, 60, 78, D.ACOL, 2); } s += D.ln(38, 75, 60, 75, D.ACOL, 2) + D.ln(38, 115, 60, 115, D.ACOL, 2); return s + D.tx(180, 60, "0,92 m", "middle") + D.tx(180, 135, "0,70 m", "middle") + D.tx(180, 190, "pontas recurvadas para a parede", "middle"); }
  };

  /* ================================================================ ESCOPO (aviso na tela e no memorial: o que a geração verifica e o que NÃO verifica) */
  var ESCOPO = {
    escada: { verifica: ["degrau e escada pela norma escolhida (espelho, piso, p + 2e, ângulo ≤ 45° na NR-12, largura, descanso)", "guarda-corpo (altura, intermediária, rodapé, lados livres) e corrimão (NBR 9050 / saída de emergência)", "longarina pela NBR 8800 (flexão, cortante, flexo-compressão, flecha)", "degrau em grade e em chapa: flexão com 2,5 kN (NBR 6120, nota t) e flecha com 1,5 kN (ISO 14122-3)", "montante do guarda-corpo, a solda da base e o travessão superior e a intermediária entre montantes (f·s²/8), com a força da NBR 6120, Tabela 12"],
      naoVerifica: ["ligação degrau × longarina e a base da escada (chumbadores)", "pilaretes e ligações do patamar", "altura livre sobre a escada (informe no projeto)", "vibração", "escada caracol (mastro e degraus em balanço)", "largura pela população na saída de emergência (N = P/C)"] },
    marinheiro: { verifica: ["NR-12, Anexo III, 13 e 13.1 inteiros (largura, degraus, 1º degrau, afastamento, gaiola, lances, descanso, montantes no topo)", "NR-35, Anexo III: hierarquia e inviabilidade técnica (4.1.2, 4.1.2.1), SPQ pelo 35.6 (5.2.1.1 f), projeto por profissional habilitado (5.2.1.1 g), descanso lateral (5.2.1.2.2) — as declarações do projetista são exigidas (sem elas: NÃO ATENDE / INCOMPLETO)", "degrau com 2,5 kN (NBR 6120, nota t) e montante (flexão, NBR 8800)"], naoVerifica: ["suportes e chumbadores na parede/equipamento", "gaiola (sem carga de projeto no texto da NR-12)", "o SPQ em si (seleção, ancoragem) — análise de risco da NR-35"] },
    plataforma: { verifica: ["largura (NR-12, 10) e guarda-corpo (NR-12, 7)", "vigas principal e secundária (NBR 8800)", "piso (tabela do fabricante quando a grade está no catálogo; barras portantes; chapa)", "montante do guarda-corpo (2,0 kN/m), a solda da base e o travessão superior e a intermediária (f·s²/8)", "pilares, vigas e contraventamento no Cálculo › Estrutura desenhada (Verificar acesso › Calcular a estrutura), com a força do guarda-corpo nas vigas de borda"], naoVerifica: ["ligações e placas de base (frente de Ligações)", "torção da viga de borda pelo braço de 1,1 m da força do guarda-corpo", "vibração (NBR 8800, Anexo L — sem texto conferido)", "altura livre"] },
    anelar: { verifica: ["largura e guarda-corpo (NR-12)", "console em balanço (sem contar a mão-francesa, a favor da segurança)", "viga de borda", "piso", "montante e a solda da base"], naoVerifica: ["ligação do console no costado e a parede do tanque (frente de Tanques)", "mão-francesa", "folga entre o costado e o piso acima de 15 cm"] },
    passarela: { verifica: ["largura e guarda-corpo (NR-12)", "vigas longitudinais e travessas (NBR 8800)", "piso", "montante (2,0 kN/m) e a solda da base", "a estrutura inteira no Cálculo › Estrutura desenhada (apoios nas pontas ou pilares com contraventamento), com a força do guarda-corpo"], naoVerifica: ["os apoios na estrutura existente (ligações — frente de Ligações)", "contraventamento horizontal do tabuleiro", "vibração (NBR 8800, Anexo L — sem texto conferido)", "passarela fora da edificação: NBR 7188"] },
    guardacorpo: { verifica: ["alturas, intermediária, rodapé, travessão sem superfície plana, montantes (NR-12, 7; ISO 14122-3)", "montante, a solda da base e o travessão superior e a intermediária entre montantes (f·s²/8) com a força da NBR 6120, Tabela 12"], naoVerifica: ["o elemento onde fixa", "chapa de base e chumbadores", "ensaios de impacto da NBR 14718"] },
    corrimaoparede: { verifica: ["alturas, diâmetro, prolongamento (NBR 9050) e a folga da parede (NPT 011)", "corrimão entre suportes e o suporte em balanço com 900 N (NPT 011, 5.8.3.2)"], naoVerifica: ["chumbadores/buchas na parede", "a parede"] },
    rampa: { verifica: ["inclinação pela norma (NR-12: até 20°, peças transversais de 10° a 20°; NBR 9050: 8,33 % e desnível por segmento)", "largura, patamares, guarda-corpo e corrimão", "longarina entre apoios, travessa, piso e montante"], naoVerifica: ["pilaretes, ligações e chumbadores", "inclinação transversal e piso tátil (NBR 9050)", "guia de balizamento da NBR 9050 (altura a conferir)"] },
    helicoidal: { verifica: ["degrau pela norma na linha de percurso, largura, descanso a cada 3,00 m, guarda-corpo de fora (NR-12)", "longarina entre consoles, degrau, console em balanço, montante e solda"], naoVerifica: ["ligação console × costado e a parede do tanque", "torção da longarina curva", "largura do degrau junto do costado (fica menor que na linha de percurso — ver o aviso)"] },
    piso: { verifica: ["peso por tipo", "chapa: flexão e flecha (faixa de 1 m)", "grade: tabela do fabricante (catálogo) quando houver, e as barras portantes", "vão máximo do piso → espaçamento das vigas intermediárias", "vigas de borda, intermediárias e de borda das aberturas (NBR 8800, perfil mais leve que passa)", "pilaretes à compressão (KL/r ≤ 200) e a placa de base ancorada"], naoVerifica: ["fixação do piso nas vigas (presilhas, solda, parafuso)", "ligações viga × viga e viga × pilarete (Ligação inteligente)", "chapa expandida e perfurada (tabela do fabricante)", "carga concentrada de equipamento", "o elemento existente onde o piso apoia"] }
  };
  function escopo(tipo) { return ESCOPO[tipo] || null; }

  /* ================================================================ REGISTRO */
  var TIPOS = { marinheiro: MARINHEIRO, plataforma: PLATAFORMA, anelar: ANELAR, passarela: PASSARELA, guardacorpo: GUARDA, piso: PISO, helicoidal: HELICOIDAL, rampa: RAMPA, corrimaoparede: CORRPAREDE };
  var ORDEM = ["marinheiro", "plataforma", "anelar", "passarela", "guardacorpo", "piso", "helicoidal", "rampa", "corrimaoparede"];
  var registrado = false;
  function registrar() {
    var M = MP(); if (!M || !M.registrarTipo) return false;
    ORDEM.forEach(function (k) { M.registrarTipo(k, TIPOS[k]); });
    registrado = true; return true;
  }
  registrar();

  /* a CONFORMIDADE e o DIMENSIONAMENTO de um resultado do gerar (prévia ou peça do modelo) */
  function avaliar(r) {
    var A = AC(); if (!A || !r || !r.ok || !r.medidas) return null;
    var g = r.medidas.acesso, d = r.medidas.dim;
    if (d && (r.tipo === "plataforma" || r.tipo === "passarela")) d = comEstruturaDesenhada(r, d);
    /* S6 (14/10/2026): o PISO com estrutura em pilaretes também vai para o MESMO motor (vigas, pilaretes e X com 2ª ordem) */
    else if (d && r.tipo === "piso" && r.medidas.estrutura && r.medidas.estrutura.pilaretes > 0 && !r.medidas.estrutura.existentes) d = comEstruturaDesenhada(r, d);
    return { conformidade: g ? A.verificar(g) : null, dimensionamento: d ? A.dimensionar(d) : null, estrutura: d && d._estrutura ? d._estrutura : null };
  }
  /* PLATAFORMA e PASSARELA: vigas, pilares e contraventamento pelo js/acodimlivre.js (o MESMO cálculo do Cálculo ›
     Estrutura desenhada, com a força do guarda-corpo, 2ª ordem e interação N + M) — sem cálculo simplificado paralelo.
     Sem o motor carregado: INCOMPLETO ("calcule pela Estrutura desenhada"), nunca "passa". */
  function comEstruturaDesenhada(r, d) {
    var o = JSON.parse(JSON.stringify(d)); o.itens = arr(o.itens).filter(function (it) { return it.tipo !== "viga" && it.tipo !== "pilarete"; }); o.externas = []; o.criticos = [];
    o.naoVerificados = arr(o.naoVerificados).filter(function (t) { return !/pilares e contraventamento/.test(t); });
    var L = dep("AcoDimLivre", "./acodimlivre.js"), M = MP();
    if (!L || !M) { o.criticos.push("não verificado: vigas, pilares e contraventamento — calcule pela Estrutura desenhada (CRÍTICO)"); return o; }
    var cx = Object.keys(r.finais || {}).map(function (k) { return r.finais[k]; }), ent = entradaDe(r.tipo, M.normalizar(r.tipo, r.par), cx, cx), res = null;
    if (!ent.ok) { o.criticos.push("não verificado: estrutura — " + ent.motivo + " (CRÍTICO)"); return o; }
    try { res = L.calcular(ent.entrada); } catch (e) { res = { ok: false, motivo: "erro no cálculo: " + (e && e.message) }; }
    o._estrutura = { ok: !!(res && res.ok), aprovado: !!(res && res.ok && res.aprovado), motivo: res && res.motivo, premissa: ent.premissa };
    var ED = "Cálculo › Estrutura desenhada (js/acodimlivre.js): NBR 8800 com 2ª ordem; cargas da NBR 6120 (área de piso e força do guarda-corpo, 6.3)";
    if (!res || !res.ok) { o.externas.push({ nome: "Estrutura desenhada — análise", item: ED, passos: [{ rotulo: "o modelo não fechou", formula: "", valor: (r.tipo === "piso" ? "SAÍDA: diminua \"Apoios a cada (m)\" no diálogo do piso (mais pilaretes, X menos deitado) — " : "") + String(res && res.motivo || "sem resultado") }], resistencia: 1, solicitante: 9.99, unidade: "", razao: 9.99, ok: false }); return o; }
    var porPeca = {}; cx.forEach(function (c) { porPeca[String(c.id)] = c; });
    res.modelo.membros.forEach(function (mb) {
      var x = res.membros[mb.id]; if (!x) return; var pc = porPeca[String(mb.peca)] || {}, papel = pc.metal ? pc.metal.papel : mb.papel;
      o.externas.push({ nome: "Estrutura desenhada — " + papel + " " + mb.id + " (" + (mb.secao ? mb.secao.nome : "") + ")", item: ED, passos: [{ rotulo: "verificação que governa", formula: String(x.governante || ""), valor: br(num(x.razao, 0) * 100, 0) + " %" }], resistencia: 1, solicitante: num(x.razao, 0), unidade: "", razao: num(x.razao, 0), ok: !!x.ok && num(x.razao, 0) <= 1 + 1e-9 });
    });
    (res.servico || []).forEach(function (sv) { o.externas.push({ nome: "Estrutura desenhada — flecha " + sv.membro, item: ED + " (" + (sv.ref || "Anexo C") + ")", passos: [{ rotulo: "flecha", formula: "", valor: br(sv.valor * 1000, 1) + " mm ≤ " + br(sv.limite * 1000, 1) + " mm" }], resistencia: sv.limite, solicitante: sv.valor, unidade: "m", razao: num(sv.razao, 0), ok: num(sv.razao, 0) <= 1 + 1e-9, els: true }); });
    /* REVISÃO S6 (regra de ouro): a Estrutura desenhada NÃO aprovou por algo que não é de barra (grande deslocabilidade,
       estabilidade global, escada como único travamento…) — vira FALHA aqui também, nunca "aprovado" com o motor reprovando */
    if (!res.aprovado && !o.externas.some(function (v) { return v.ok === false; })) {
      var porque = arr(res.avisos).filter(function (a) { return /deslocabilidade|instáv|mecanismo|estabilidade|trava|não fech|NÃO/i.test(a); }).slice(0, 2).join(" | ") || ("a Estrutura desenhada não aprovou (" + num(res.falhas, 0) + " falha(s))");
      if (r.tipo === "piso") porque = "SAÍDA: diminua \"Apoios a cada (m)\" no diálogo do piso (mais pilaretes, X menos deitado) ou desenhe o apoio embaixo — " + porque;
      o.externas.push({ nome: "Estrutura desenhada — situação global", item: ED, passos: [{ rotulo: "não aprovada", formula: "", valor: porque.slice(0, 400) }], resistencia: 1, solicitante: 9.99, unidade: "", razao: 9.99, ok: false });
    }
    return o;
  }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  /* o quantitativo (peso e área de pintura por papel) das caixas finais de um resultado */
  function quantitativo(finais) {
    var por = {}, M = dep("BimMetal", "./metalpeca.js");
    Object.keys(finais || {}).forEach(function (k) {
      var c = finais[k]; if (!c || !c.metal) return;
      var pp = c.metal.papel || c.metal.kind, o = por[pp] || (por[pp] = { papel: pp, n: 0, massa: 0, area: 0 });
      o.n++; o.massa += num(c.massa, 0);
      var a = num(c.area, NaN);
      if (!isFinite(a)) {
        if (c.metal.kind === "chapa" && c.metal.dim) a = 2 * num(c.metal.dim.areaLiq, 0) * (c.metal.grade ? 2 * num(c.metal.grade.h, 0.03) / num(c.metal.grade.a, 0.03) + 0.2 : 1);
        else if (c.metal.kind === "perfil" && M && M.membro) { var mb = M.membro(c); a = mb && mb.s ? num(mb.s.perimetro, 0) * mb.L : 0; }
        else a = 0;
      }
      o.area += a;
    });
    var pecas = Object.keys(por).map(function (k) { var o = por[k]; o.massa = Math.round(o.massa * 10) / 10; o.area = Math.round(o.area * 100) / 100; return o; });
    return { pecas: pecas, massa: pecas.reduce(function (s, o) { return s + o.massa; }, 0), area: pecas.reduce(function (s, o) { return s + o.area; }, 0) };
  }
  /* o memorial de uma peça pronta de acesso (resultado do gerar + o par) */
  function memorial(r, op) {
    var A = AC(); if (!A || !r || !r.ok) return { ok: false, motivo: "Sem resultado para o memorial." };
    var av = avaliar(r) || {}, T = (MP() && MP().TIPOS[r.tipo]) || {};
    return A.memorial({ titulo: T.rotulo || r.tipo, descricao: r.resumo, tipo: r.tipo, uso: r.tipo, escopo: escopo(r.tipo), perfil: r.medidas && r.medidas.acesso ? r.medidas.acesso.perfil : "nr12", par: r.par,
      conformidade: av.conformidade, dimensionamento: av.dimensionamento, quantitativo: quantitativo(r.finais) }, op);
  }


  /* ================================================================ CÁLCULO › ESTRUTURA DESENHADA (rodada 2)
   * a plataforma e a passarela geradas vão para o js/acodimlivre.js (o MESMO motor do "Calcular a estrutura
   * desenhada"): pilares, vigas e contraventamento lidos como barras e verificados lá (NBR 8800, 2ª ordem,
   * flechas, reações). Aqui só se monta a ENTRADA: as peças da peça pronta, bases e ligações rotuladas (o
   * contraventamento estabiliza), a área de piso com o peso do piso e o uso da NBR 6120 (Tabela 10) e, na
   * passarela apoiada nas pontas, os apoios nas pontas das vigas longitudinais (fixo no começo, móvel no fim). */
  var USO_LIVRE = { "area-tecnica": "area-tecnica", "escada-sem-publico": "passarela-sem-publico", "escada-publico": "passarela-publico", "informado": "outro" };
  /* o PISO INDUSTRIAL com estrutura (frente S6): as vigas, os pilaretes e o X dele; a área de piso na planta inteira (a carga
     sobre as aberturas fica — a favor), o uso da NBR 6120 e o peso do piso; bases e ligações rotuladas (o X estabiliza) */
  function entradaPiso(p, minhas, caixas) {
    var EL = dep("MetalEscadaLinha", "./metalescadalinha.js"), pol = EL && EL.plantaPronta ? EL.plantaPronta("piso", p) : null;
    if (!pol) return { ok: false, motivo: "a planta do piso não fechou" };
    var barras = minhas.filter(function (c) { return c.metal && c.metal.kind === "perfil" && !c.metal.lig; });
    var vigas = barras.filter(function (c) { return /^Viga/.test(c.metal.papel || ""); }).map(function (c) { return String(c.id); });
    var A = AC(), kg = A ? A.pisoKgM2(p.material === "lisa" ? "chapa" : p.material, p).kgm2 : 30, uso = USO_LIVRE[p.usoPiso] || "area-tecnica", q = num(p.qInformado, 0);
    var area = { id: "piso", nome: "Piso industrial", poligono: pol, cota: r4(num(p.y0, 0)), vigas: vigas, direcao: "auto", g: r4(kg * 9.81 / 1000), gCategoria: "G-industrializado", gTexto: "piso " + p.material + " (" + brf(kg, 1) + " kg/m²)", uso: uso, qInformado: q > 0 ? q : (uso === "outro" ? 3 : null) };
    return { ok: true, tipo: "piso", rigida: false, aviso: null, premissa: "ligações rotuladas + contraventamento em X nas faces",
      entrada: { caixas: caixas, ids: barras.map(function (c) { return String(c.id); }), apoios: { basePadrao: "rotulada", bases: {}, extras: {} }, ligacoes: { vigaPilar: "rotulada", vigaViga: "rotulada" }, cargas: { areas: [area], pontuais: [], acrescimoLigacoes: 0.05, vento: null }, otimizar: false },
      area: area, barras: barras.length, pontuais: [], forcaGuarda: 0, naoVerificado: "a carga sobre as aberturas do piso fica na área (a favor)" };
  }
  function entradaCalculo(caixas, pronta) {
    var M = MP(); if (!M) return { ok: false, motivo: "js/metalprontas.js não carregou." };
    if (!pronta || !pronta.info || !pronta.info.par) return { ok: false, motivo: "Selecione uma peça da plataforma ou da passarela." };
    var tipo = pronta.tipo; if (tipo !== "plataforma" && tipo !== "passarela" && tipo !== "piso") return { ok: false, motivo: "Só a plataforma, a passarela e o piso industrial vão para a Estrutura desenhada (os outros acessos têm o cálculo próprio)." };
    var minhas = (caixas || []).filter(function (c) { return c && String(c.pronta) === String(pronta.id); });
    var e0 = entradaDe(tipo, M.normalizar(tipo, M.parParaRefazer(pronta)), minhas, caixas);
    if (e0.ok) e0.area.id = "piso-" + pronta.id;
    return e0;
  }
  function entradaDe(tipo, p, minhas, caixas) {
    if (tipo === "piso") return entradaPiso(p, minhas, caixas);
    var M = MP(), H = M.ajudantes(), Lx = tipo === "plataforma" ? p.Lx : p.comprimento, Lz = tipo === "plataforma" ? p.Lz : p.largura;
    var F = H.quadroLocal([p.x0, p.y0, p.z0], p.giro);
    var pol = [[0, 0], [Lx, 0], [Lx, Lz], [0, Lz]].map(function (q) { var w = F.W([q[0], 0, q[1]]); return [r4(w[0]), r4(w[2])]; });
    var barras = minhas.filter(function (c) { return c.metal && c.metal.kind === "perfil" && !c.metal.lig; });
    var vigas = barras.filter(function (c) { return /Viga secundária/.test(c.metal.papel || ""); }).map(function (c) { return String(c.id); });
    var uso = USO_LIVRE[p.usoPiso] || "area-tecnica", q = num(p.qInformado, 0);
    if (p.contraventoPlano == null) p.contraventoPlano = true;
    var area = { id: "piso", nome: "Piso da " + (tipo === "plataforma" ? "plataforma" : "passarela"), poligono: pol, cota: r4(num(p.y0, 0) + p.altura), vigas: vigas, direcao: "auto",
      g: gPisoDe(H, p), gCategoria: "G-industrializado", gTexto: "piso " + (p.piso === "grade" ? "em grade" : "em chapa") + " (peso do gerador de acessos)", uso: uso, qInformado: q > 0 ? q : (uso === "outro" ? 3 : null) };
    /* FORÇA DO GUARDA-CORPO NA ESTRUTURA (NBR 6120:2019, 6.3: a estrutura que suporta o guarda-corpo resiste às forças
       da Tabela 12): f × (vão entre montantes) em cada montante, horizontal para fora, na viga de borda — caso Q à parte */
    var pontuais = [], fg = AC() ? AC().forcaGuarda(p.usoGuarda) : { f: 2.0, rotulo: "atividade industrial" }, inv = function (P) { var d = H.sub(P, F.O); return H.rotY(d, -F.th); };
    var bordas = tipo === "plataforma" ? [["frente", 2, 0, [0, 0, -1], Lx], ["fundo", 2, Lz, [0, 0, 1], Lx], ["esquerda", 0, 0, [-1, 0, 0], Lz], ["direita", 0, Lx, [1, 0, 0], Lz]] : [["frente", 2, 0, [0, 0, -1], Lx], ["fundo", 2, Lz, [0, 0, 1], Lx]];
    var MC0 = dep("MetalCriar", "./metalcriar.js"), vigasL = barras.filter(function (c) { return /Viga/.test(c.metal.papel || ""); }).map(function (c) { var l = MC0 && MC0.linhaAtual ? MC0.linhaAtual(c) : null; return l ? { id: String(c.id), a: l.a, b: l.b, la: inv(l.a), lb: inv(l.b) } : null; }).filter(Boolean);
    if (p.forcasGuarda !== false) bordas.forEach(function (bd) {
      if (tipo === "plataforma" && !p[bd[0]]) return;
      var eixo = bd[1], val = bd[2], ao = eixo === 2 ? 0 : 2, Lb = bd[4], nP = Math.max(1, Math.ceil(Lb / num(p.espac, 1) - 1e-9)), trib = Lb / nP;
      var naBorda = vigasL.filter(function (v) { return Math.abs(v.la[eixo] - val) < 0.02 && Math.abs(v.lb[eixo] - val) < 0.02; });
      for (var k = 0; k <= nP; k++) {
        var x = Lb * k / nP, Fk = fg.f * trib * (k === 0 || k === nP ? 0.5 : 1);
        if (p.abertura === bd[0] && x > num(p.aberturaPos, 0.5) * Lb - num(p.aberturaLarg, 0.8) / 2 && x < num(p.aberturaPos, 0.5) * Lb + num(p.aberturaLarg, 0.8) / 2) continue;
        var v = naBorda.filter(function (q) { var m0 = Math.min(q.la[ao], q.lb[ao]), m1 = Math.max(q.la[ao], q.lb[ao]); return x >= m0 - 1e-6 && x <= m1 + 1e-6; })[0]; if (!v) continue;
        var sV = Math.abs(x - v.la[ao]) * H.len(H.sub(v.b, v.a)) / Math.max(1e-9, Math.abs(v.lb[ao] - v.la[ao])), dir = F.D(bd[3]);
        pontuais.push({ peca: v.id, s: r4(sV), F: [r4(dir[0] * Fk), 0, r4(dir[2] * Fk)], caso: "Q", nome: "Guarda-corpo " + bd[0] + " (" + brf(fg.f, 1) + " kN/m)" });
      }
    });
    var apoios = { basePadrao: "rotulada", bases: {}, extras: {} };
    if (tipo === "passarela" && p.apoio === "pontas") barras.filter(function (c) { return /Viga principal/.test(c.metal.papel || ""); }).forEach(function (c) { apoios.extras[String(c.id) + ":ini"] = "fixo"; apoios.extras[String(c.id) + ":fim"] = "movel"; });
    /* PADRÃO: ligações ROTULADAS — a estabilidade vem do contraventamento em X (faces nas duas direções e, com vários vãos,
       no plano do piso). Premissa RÍGIDA só quando o engenheiro desligou o contraventamento — e com o aviso de que a obra
       tem de executar ligação de momento (as vigas saem marcadas para a sugestão de ligação). */
    var multi = tipo === "plataforma" ? (Math.round(p.vaosX) > 1 || Math.round(p.vaosZ) > 1) : (p.apoio !== "pontas" && Math.round(p.vaos) > 1);
    var rigida = !(tipo === "passarela" && p.apoio === "pontas") && precisaMomento(p, multi);
    return { ok: true, tipo: tipo, rigida: rigida, aviso: rigida ? TEXTO_MOMENTO : null, premissa: rigida ? "ligações viga-pilar e viga-viga RÍGIDAS (sem contraventamento) — exige ligação de momento" : "ligações rotuladas + contraventamento em X", entrada: { caixas: caixas, ids: barras.map(function (c) { return String(c.id); }), apoios: apoios, ligacoes: { vigaPilar: rigida ? "rigida" : "rotulada", vigaViga: rigida ? "rigida" : "rotulada" },
      cargas: { areas: [area], pontuais: pontuais, acrescimoLigacoes: 0.05, vento: null }, otimizar: false }, area: area, barras: barras.length, pontuais: pontuais, forcaGuarda: fg.f,
      naoVerificado: "momento da força do guarda-corpo a 1,1 m (torção na viga de borda) — a força entra horizontal na viga, sem o braço" };
  }

  /* ================================================================ API PARA OS TANQUES */
  function emVoltaDoCilindro(o) {
    o = o || {}; var M = MP(), p = M ? M.padrao("anelar") : {};
    ["raio:raioTanque", "altura:altura", "largura:largura", "angIni:angIni", "abertura:abertura", "x0:x0", "y0:y0", "z0:z0", "folga:folga", "acessoPonta:acessoPonta"].forEach(function (kk) { var a = kk.split(":"); if (o[a[0]] != null) p[a[1]] = o[a[0]]; });
    p.giro = 0;
    return p;
  }
  /* a marinheiro encostada no costado no ângulo angEscada (°), subindo até a cota da plataforma */
  function marinheiroNoCilindro(o) {
    o = o || {}; var M = MP(), p = M ? M.padrao("marinheiro") : {}, R = num(o.raio, 3), th = num(o.angEscada, num(o.angIni, 0)) * GRAU, af = num(o.afast, p.afast || 0.18);
    p.altura = num(o.altura, 6); p.afast = af;
    ["outrosImpossiveis", "spqDefinido", "projetoHabilitado"].forEach(function (k) { if (o[k] != null) p[k] = !!o[k]; });
    var rr = R + af, x0 = num(o.x0, 0) + rr * Math.cos(th), z0 = num(o.z0, 0) + rr * Math.sin(th);
    /* local +u (para a parede) = do pé da escada para o centro: (cos g, 0, −sen g) = (−cos θ, 0, −sen θ) → g = θ + 180° (em graus) */
    p.x0 = r4(x0); p.y0 = num(o.y0, 0); p.z0 = r4(z0); p.giro = r4(((th / GRAU) + 180) % 360 * 1);
    var g = p.giro * GRAU, ux = Math.cos(g), uz = -Math.sin(g);
    if (Math.abs(ux + Math.cos(th)) > 1e-6 || Math.abs(uz + Math.sin(th)) > 1e-6) p.giro = r4((180 - th / GRAU + 360) % 360);
    return p;
  }
  /* a escada helicoidal no costado, subindo da base até a cota da plataforma */
  function escadaNoCilindro(o) {
    o = o || {}; var M = MP(), p = M ? M.padrao("helicoidal") : {};
    ["raio:raioTanque", "altura:altura", "largura:largura", "angIni:angIni", "sentido:sentido", "x0:x0", "y0:y0", "z0:z0"].forEach(function (kk) { var a = kk.split(":"); if (o[a[0]] != null) p[a[1]] = o[a[0]]; });
    if (o.angEscada != null) p.angIni = o.angEscada;
    p.giro = 0; return p;
  }
  function conjuntoTanque(o, novoId) {
    var M = MP(); if (!M) return { ok: false, motivo: "js/metalprontas.js não carregou." };
    var a = M.gerar("anelar", emVoltaDoCilindro(o), novoId), m = M.gerar("marinheiro", marinheiroNoCilindro(o), novoId);
    return { ok: a.ok && m.ok, anelar: a, marinheiro: m, avaliacao: { anelar: avaliar(a), marinheiro: avaliar(m) } };
  }

  var MetalAcessos = { TIPOS: TIPOS, ORDEM: ORDEM, ESCOPO: ESCOPO, escopo: escopo, TEXTO_MOMENTO: TEXTO_MOMENTO, lerCaminho: lerCaminho, textoCaminho: textoCaminho, entradaCalculo: entradaCalculo, USO_LIVRE: USO_LIVRE, registrar: registrar, registrado: function () { return registrado; }, avaliar: avaliar, quantitativo: quantitativo, memorial: memorial,
    emVoltaDoCilindro: emVoltaDoCilindro, marinheiroNoCilindro: marinheiroNoCilindro, escadaNoCilindro: escadaNoCilindro, conjuntoTanque: conjuntoTanque, mezPar: mezPar, pasPar: pasPar };
  global.MetalAcessos = MetalAcessos;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalAcessos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

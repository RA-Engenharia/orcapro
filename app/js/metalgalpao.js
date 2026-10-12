/* =====================================================================
 * metalgalpao.js — METÁLICA & MECÂNICA: ASSISTENTE DE GALPÃO (motor
 * PURO, ES5, sem DOM, Node-testável).
 *
 * Gera o MODELO de um galpão de aço de duas águas — pórticos de alma cheia
 * ou treliçados, terças, tirantes, contraventamentos de cobertura e de
 * parede nos vãos extremos e colunas de tapamento nos oitões — com os
 * perfis do CATÁLOGO escolhidos pelo usuário (js/perfisaco.js) e as
 * ligações padrão aplicadas (js/metalligacao.js).
 *
 * ⚠ Sozinho NÃO DIMENSIONA: os perfis são os que o usuário escolheu e os
 *   valores preenchidos são de PARTIDA (editáveis). COM O CÁLCULO
 *   (js/acodimensionar.js), `parDoCalculo(r)` traduz o resultado para cá:
 *   perfis finais, terças Ue e correntes, travessas, contraventamento em
 *   barra redonda em X (as mesmas barras da análise), mãos-francesas onde o
 *   cálculo pôs, colunas de tapamento nas posições do cálculo e as ligações
 *   com as medidas dimensionadas (js/acoligcalc.js → BimMetalLig).
 *
 * Coordenadas (as do editor): vão em X (de 0 ao vão, eixos dos pilares),
 * pórticos ao longo de Z (de z0 a z0 + comprimento), Y para cima a partir
 * da base. Toda barra é uma peça "perfil" do js/metalpeca.js (corte de
 * prumo nas pontas das vigas de cobertura) — sai pronta para a máquina.
 * Teste: node tools/test-metal-galpao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function L() { return dep("BimMetalLig", "./metalligacao.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function V() { return M().vet; }

  /* os valores de PARTIDA (editáveis) — nenhum é recomendação de cálculo */
  var PADRAO = {
    vao: 12, comprimento: 18, espacamento: 6, peDireito: 6, inclinacao: 10, base: 0, x0: 0, z0: 0,
    tipo: "alma-cheia",            /* "alma-cheia" | "trelicado" */
    pilar: "W250X32.7", viga: "W250X25.3", terca: "C150X12.2", contravento: "L51X51X4.8",
    tirante: 0.0125, tapamento: "W150X13", banzo: "L64X64X6.4", diagonal: "L51X51X4.8",
    alturaTrelica: 0.6, paineisTrelica: 0,          /* treliçado: altura na ponta; painéis por meia treliça (0 = automático) */
    espTercas: 1.5, contraventos: true, tirantes: true, tapamentos: 0, ligacoes: true,
    tChapa: 0.016, parafuso: "M20", parafusoTerca: "M12", parafusoTrelica: "M16",
    /* do cálculo (parDoCalculo): vazio = o modelador de sempre */
    linhasCorrentes: 1, travessaLateral: "", travessaOitao: "", alturasTravessas: null, alturasTravessasOitao: null, paredesComTravessa: null,
    xsTapamentos: null, contraventoBarra: 0, contraventosCalc: null, maosFrancesas: null, maoFrancesaPerfil: "L51X51X4.8",
    ligPlacaBase: null, ligPlacaBaseTap: null, ligJoelho: null, ligCumeeira: null, ligClip: null,
    acoPerfil: "ASTM A572 Gr.50", acoTerca: "ASTM A36", acoBarra: "ASTM A36"
  };

  function perfilCat(nome) { var A = Aco(); return A ? A.paraPerfil(nome) : null; }
  function erro(t) { return { ok: false, motivo: t }; }

  function validar(p) {
    if (!(p.vao >= 4 && p.vao <= 60)) return "Vão entre 4 e 60 m.";
    if (!(p.comprimento >= 3 && p.comprimento <= 300)) return "Comprimento entre 3 e 300 m.";
    if (!(p.espacamento >= 2 && p.espacamento <= 15)) return "Espaçamento dos pórticos entre 2 e 15 m.";
    if (!(p.peDireito >= 2.5 && p.peDireito <= 25)) return "Pé-direito entre 2,5 e 25 m.";
    if (!(p.inclinacao >= 2 && p.inclinacao <= 60)) return "Inclinação do telhado entre 2 % e 60 %.";
    var faltam = ["pilar", "terca", p.tipo === "trelicado" ? "banzo" : "viga", p.tipo === "trelicado" ? "diagonal" : "pilar"].filter(function (k) { return !perfilCat(p[k]); });
    if (p.contraventos && !(num(p.contraventoBarra, 0) > 0) && !perfilCat(p.contravento)) faltam.push("contravento");
    if (p.travessaLateral && !perfilCat(p.travessaLateral)) faltam.push("travessaLateral");
    if (p.travessaOitao && !perfilCat(p.travessaOitao)) faltam.push("travessaOitao");
    if (p.tapamentos > 0 && !perfilCat(p.tapamento)) faltam.push("tapamento");
    if (faltam.length) return "Perfil não encontrado no catálogo: " + faltam.map(function (k) { return k + " = " + p[k]; }).join(", ") + ".";
    return null;
  }

  /* =============================================================== GERAR
   * par: os campos de PADRAO. novoId(): ids do editor.
   * Devolve { ok, op (lote), pecas (caixas com id), ligacoes:[{tipo, ok, resumo, avisos}], resumo, contagem, avisos } */
  function gerar(par, novoId) {
    var p = {}; Object.keys(PADRAO).forEach(function (k) { p[k] = par && par[k] != null && par[k] !== "" ? par[k] : PADRAO[k]; });
    ["vao", "comprimento", "espacamento", "peDireito", "inclinacao", "base", "x0", "z0", "tirante", "alturaTrelica", "espTercas", "tChapa"].forEach(function (k) { p[k] = num(p[k], PADRAO[k]); });
    p.tapamentos = Math.max(0, Math.round(num(p.tapamentos, 0)));
    var e = validar(p); if (e) return erro(e);
    if (typeof novoId !== "function") return erro("Sem gerador de id.");
    var nP = Math.max(2, Math.round(p.comprimento / p.espacamento) + 1), esp = p.comprimento / (nP - 1);
    var th = Math.atan(p.inclinacao / 100), co = Math.cos(th), si = Math.sin(th);
    var pc = perfilCat(p.pilar), pv = p.tipo === "trelicado" ? null : perfilCat(p.viga), pt = perfilCat(p.terca);
    var dC = M().faces(pc).length ? pc.d : 0.25, tP = p.tChapa;
    var B0 = p.base, X0 = p.x0, Z0 = p.z0, vao = p.vao, H = p.peDireito;
    var yTopo = function (x) { var xm = Math.min(x, vao - x); return B0 + H + p.inclinacao / 100 * xm; };   /* a linha do telhado (topo das vigas), x a partir do eixo do pilar esquerdo */
    var pecas = [], avisos = [], ops = [], ligs = [], cont = { pilares: 0, vigas: 0, tercas: 0, tirantes: 0, contraventos: 0, tapamentos: 0, banzos: 0, diagonais: 0 };
    function nova(cx, rot) {
      if (!cx || cx.erro) { avisos.push((rot || "peça") + ": " + (cx ? cx.erro : "falhou")); return null; }
      cx.id = String(novoId()); pecas.push(cx); ops.push({ op: "criar", id: cx.id, caixa: cx }); return cx;
    }
    function W(x, y, z) { return [X0 + x, y, Z0 + z]; }
    function perfil(o) { return M().perfil(o); }
    var porticos = [];
    for (var k = 0; k < nP; k++) {
      var z = k * esp, P = { z: z, pilares: [], vigas: [], nos: [] };
      /* PILARES: alma no plano do pórtico (a altura da seção ao longo de X) */
      [0, 1].forEach(function (lado) {
        var x = lado ? vao : 0, Lc = H + p.inclinacao / 100 * dC / 2;
        var cx = nova(perfil({ origem: W(x, B0, z), ex: [0, 1, 0], ey: [1, 0, 0], perfil: pc, L: Lc, papel: "Pilar", ifc: "IFCCOLUMN", aco: p.acoPerfil, nome: "Pilar " + (lado ? "direito" : "esquerdo") + " — pórtico " + (k + 1) }), "pilar");
        if (cx) { P.pilares.push(cx); cont.pilares++; }
      });
      if (p.tipo !== "trelicado") {
        /* VIGAS DE COBERTURA (alma cheia): corte de prumo nas pontas; chapa de extremidade no pilar e de topo na cumeeira */
        var dV = pv.d, x0 = dC / 2 + tP, x1 = vao / 2 - tP, Lv = (x1 - x0) / co, g = Math.atan(p.inclinacao / 100) * 180 / Math.PI;
        [0, 1].forEach(function (lado) {
          var sgx = lado ? -1 : 1, xs = lado ? vao - x0 : x0, ex = [sgx * co, si, 0], ey = [-sgx * si, co, 0];
          var org = W(xs, yTopo(x0) - dV / (2 * co), z);
          var cx = nova(perfil({ origem: org, ex: ex, ey: ey, perfil: pv, L: Lv, cortes: { almaIni: g, almaFim: g }, papel: "Viga de cobertura", ifc: "IFCBEAM", aco: p.acoPerfil, nome: "Viga de cobertura " + (lado ? "direita" : "esquerda") + " — pórtico " + (k + 1) }), "viga");
          if (cx) { P.vigas.push(cx); cont.vigas++; }
        });
      } else trelica(p, P, k, z, nova, cont, avisos, W, yTopo, dC, th);
      porticos.push(P);
    }

    /* TERÇAS: por vão entre pórticos, no topo das vigas (a alma perpendicular ao telhado) */
    var dT = pt.d || pt.bw || 0.15, Ls = (vao / 2) / co, nT = Math.max(2, Math.ceil((Ls - 0.3) / p.espTercas) + 1), tercas = [];   /* Ue formado a frio: a altura é bw */
    var sPos = []; for (var j = 0; j < nT; j++) sPos.push(0.15 / co + (dC / 2) / co + j * ((Ls - 0.3 / co - (dC / 2) / co) / (nT - 1)));
    for (var b = 0; b + 1 < nP; b++) {
      var linha = [];
      [0, 1].forEach(function (lado) {
        sPos.forEach(function (s, j) {
          var xh = s * co, x = lado ? vao - xh : xh, nRoof = lado ? [si, co, 0] : [-si, co, 0];
          var base = W(x, yTopo(xh), porticos[b].z + 0.005);
          var org = V().add(base, V().mul(nRoof, dT / 2));
          var cx = nova(perfil({ origem: org, ex: [0, 0, 1], ey: nRoof, perfil: pt, L: esp - 0.01, papel: "Terça", ifc: "IFCMEMBER", aco: p.acoTerca, nome: "Terça " + (lado ? "D" : "E") + (j + 1) + " — vão " + (b + 1) }), "terça");
          if (cx) { linha.push({ cx: cx, lado: lado, j: j }); cont.tercas++; }
        });
      });
      tercas.push(linha);
    }

    /* TIRANTES (corrente de terça): barra redonda no meio de cada vão, de terça a terça, furo na alma */
    var tirantes = [];
    if (p.tirantes && p.tirante > 0.005) {
      var barra = { forma: "circ", d: p.tirante };
      tercas.forEach(function (linha, b2) {
        [0, 1].forEach(function (lado) {
          var ts = linha.filter(function (t) { return t.lado === lado; }).sort(function (a, c) { return a.j - c.j; });
          var nC = Math.max(1, Math.round(num(p.linhasCorrentes, 1)));   /* linhas de correntes por vão (o cálculo da terça decide) */
          for (var i = 0; i + 1 < ts.length; i++) {
            for (var q = 1; q <= nC; q++) {
              var mA = M().membro(ts[i].cx), mB = M().membro(ts[i + 1].cx), zm = mA.L * q / (nC + 1);
              var PA = M().membroPonto(mA, zm, 0, 0), PB = M().membroPonto(mB, zm, 0, 0), dd = V().sub(PB, PA), Ld = V().len(dd), u = V().unit(dd), proj = 0.05;
              var cx = nova(perfil({ origem: V().sub(PA, V().mul(u, proj)), ex: u, ey: [0, 0, 1], perfil: barra, L: Ld + 2 * proj, papel: "Tirante", ifc: "IFCMEMBER", aco: "SAE 1020", nome: "Corrente — vão " + (b2 + 1) }), "tirante");
              if (cx) { tirantes.push({ cx: cx, a: ts[i].cx, b: ts[i + 1].cx }); cont.tirantes++; }
            }
          }
        });
      });
    }

    /* CONTRAVENTAMENTO nos vãos extremos: cobertura (no plano do telhado, entre as vigas) e paredes (entre os pilares) — diagonais alternadas */
    var contras = [], cvBarra = num(p.contraventoBarra, 0) > 0 && Array.isArray(p.contraventosCalc) && p.contraventosCalc.length;
    if (p.contraventos && cvBarra) {
      /* as MESMAS barras da análise (nós no eixo dos pilares e na linha do telhado): cobertura um pouco abaixo da
         linha do telhado (passa pela alma das vigas), parede no eixo dos pilares */
      var rd = { forma: "circ", d: num(p.contraventoBarra, 0.016) };
      p.contraventosCalc.forEach(function (sg, i) {
        var dy = sg.plano === "cobertura" ? -0.06 : 0;
        var P1 = W(sg.P1[0], B0 + sg.P1[1] + dy, sg.P1[2]), P2 = W(sg.P2[0], B0 + sg.P2[1] + dy, sg.P2[2]);
        var dd = V().sub(P2, P1), Lb = V().len(dd); if (!(Lb > 0.05)) return;
        var u = V().unit(dd), ey = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        var cx = nova(perfil({ origem: P1, ex: u, ey: ey, perfil: rd, L: Lb, papel: sg.plano === "cobertura" ? "Contravento da cobertura" : "Contravento da parede", ifc: "IFCMEMBER", aco: p.acoBarra,
                              nome: (sg.plano === "cobertura" ? "Contravento da cobertura" : "Contravento da parede") + " Ø " + Math.round(rd.d * 1000) + " mm — " + (i + 1) }), "contravento");
        if (cx) { contras.push({ cx: cx, apoios: [], barra: true }); cont.contraventos++; }
      });
      avisos.push("Contraventamento em barra redonda: rosca, arruela biselada, porca e contraporca na chapa de apoio — detalhe típico nas pranchas (a ligação não é modelada peça a peça)");
    } else if (p.contraventos) {
      var pcv = perfilCat(p.contravento), aL = pcv.a;
      var vaosC = nP > 2 ? [0, nP - 2] : [0];
      vaosC.forEach(function (b3) {
        var PA = porticos[b3], PB = porticos[b3 + 1];
        if (p.tipo !== "trelicado") {
          [0, 1].forEach(function (lado) {
            var vA = PA.vigas[lado], vB = PB.vigas[lado]; if (!vA || !vB) return;
            var mA = M().membro(vA), mB = M().membro(vB), nRoof = lado ? [si, co, 0] : [-si, co, 0], nPn = 3;
            for (var i = 0; i < nPn; i++) {
              var s0 = mA.L * (0.12 + 0.76 * i / nPn), s1 = mA.L * (0.12 + 0.76 * (i + 1) / nPn);
              var P1 = M().membroPonto(mA, i % 2 ? s1 : s0, 0, 0), P2 = M().membroPonto(mB, i % 2 ? s0 : s1, 0, 0);
              P1 = V().add(P1, V().mul(nRoof, aL / 2)); P2 = V().add(P2, V().mul(nRoof, aL / 2));
              var dd = V().sub(P2, P1), u = V().unit(dd);
              var cx = nova(perfil({ origem: P1, ex: u, ey: nRoof, perfil: pcv, L: V().len(dd), papel: "Contravento da cobertura", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Contravento da cobertura — vão " + (b3 + 1) }), "contravento");
              if (cx) { contras.push({ cx: cx, apoios: [vA, vB] }); cont.contraventos++; }
            }
          });
        }
        [0, 1].forEach(function (lado) {
          var cA = PA.pilares[lado], cB = PB.pilares[lado]; if (!cA || !cB) return;
          var x = lado ? vao : 0, nW = [lado ? 1 : -1, 0, 0], h0 = 0.4, h1 = H - 0.5;
          for (var i = 0; i < 2; i++) {
            var y0 = B0 + h0 + (h1 - h0) * i / 2, y1 = B0 + h0 + (h1 - h0) * (i + 1) / 2;
            var P1 = W(x, i % 2 ? y1 : y0, PA.z), P2 = W(x, i % 2 ? y0 : y1, PB.z);
            P1 = V().add(P1, V().mul(nW, aL / 2)); P2 = V().add(P2, V().mul(nW, aL / 2));
            var dd = V().sub(P2, P1), u = V().unit(dd);
            var cx = nova(perfil({ origem: P1, ex: u, ey: nW, perfil: pcv, L: V().len(dd), papel: "Contravento da parede", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Contravento da parede — vão " + (b3 + 1) }), "contravento");
            if (cx) { contras.push({ cx: cx, apoios: [cA, cB] }); cont.contraventos++; }
          }
        });
      });
    }

    /* COLUNAS DE TAPAMENTO nos oitões (o primeiro e o último pórtico) */
    var taps = [];
    if (p.tapamentos > 0) {
      var ptp = perfilCat(p.tapamento), dV2 = pv ? pv.d : num(p.alturaTrelica, 0.6);
      [0, nP - 1].forEach(function (k2) {
        var xsT = Array.isArray(p.xsTapamentos) && p.xsTapamentos.length ? p.xsTapamentos : null;
        for (var i = 1; i <= (xsT ? xsT.length : p.tapamentos); i++) {
          var x = xsT ? num(xsT[i - 1], 0) : vao * i / (p.tapamentos + 1), yT = yTopo(x) - (pv ? dV2 / co : num(p.alturaTrelica, 0.6) + 0.1) - 0.01;
          var cx = nova(perfil({ origem: W(x, B0, porticos[k2].z), ex: [0, 1, 0], ey: [0, 0, 1], perfil: ptp, L: yT - B0, papel: "Coluna de tapamento", ifc: "IFCCOLUMN", aco: p.acoPerfil, nome: "Coluna de tapamento — oitão " + (k2 ? "fundo" : "frente") }), "tapamento");
          if (cx) { taps.push(cx); cont.tapamentos++; }
        }
      });
      avisos.push("Coluna de tapamento: o topo ficou livre (ligação ao pórtico a detalhar)");
    }

    /* TRAVESSAS DE FECHAMENTO (do cálculo): por fora dos pilares nas laterais e por fora das colunas de tapamento nos
       oitões; a alma perpendicular à parede (o vento flete no eixo forte) */
    var travs = [], fac = p.paredesComTravessa || {};
    if (p.travessaLateral && Array.isArray(p.alturasTravessas) && p.alturasTravessas.length) {
      var ptl = perfilCat(p.travessaLateral), bwL = ptl.d || ptl.bw || 0.15;
      [0, 1].forEach(function (lado) {
        if (fac[lado ? "direita" : "esquerda"] === false) return;
        var x = lado ? vao + dC / 2 + bwL / 2 : -dC / 2 - bwL / 2, nOut = [lado ? 1 : -1, 0, 0];
        p.alturasTravessas.forEach(function (h) {
          for (var b4 = 0; b4 + 1 < nP; b4++) {
            var cx = nova(perfil({ origem: W(x, B0 + num(h, 0), porticos[b4].z + 0.005), ex: [0, 0, 1], ey: nOut, perfil: ptl, L: esp - 0.01, papel: "Travessa de fechamento", ifc: "IFCMEMBER", aco: p.acoTerca,
                                  nome: "Travessa " + (lado ? "direita" : "esquerda") + " h = " + r2(num(h, 0)) + " m — vão " + (b4 + 1) }), "travessa");
            if (cx) { travs.push(cx); cont.travessas = (cont.travessas || 0) + 1; }
          }
        });
      });
    }
    if (p.travessaOitao && Array.isArray(p.alturasTravessasOitao) && p.alturasTravessasOitao.length) {
      var pto = perfilCat(p.travessaOitao), bwO = pto.d || pto.bw || 0.15, ptp2 = p.tapamentos > 0 || (p.xsTapamentos && p.xsTapamentos.length) ? perfilCat(p.tapamento) : null;
      var xsO = [0].concat(Array.isArray(p.xsTapamentos) && p.xsTapamentos.length ? p.xsTapamentos.map(function (v) { return num(v, 0); }) : []).concat([vao]);
      var fora = Math.max(ptp2 ? ptp2.d / 2 : 0, pc.bf / 2);
      [0, nP - 1].forEach(function (k2) {
        if (fac[k2 ? "fundo" : "frente"] === false) return;
        var zF = porticos[k2].z + (k2 ? 1 : -1) * (fora + bwO / 2), nOut = [0, 0, k2 ? 1 : -1];
        p.alturasTravessasOitao.forEach(function (h) {
          for (var i5 = 0; i5 + 1 < xsO.length; i5++) {
            var xa = xsO[i5] + 0.005, xb = xsO[i5 + 1] - 0.005;
            var cx = nova(perfil({ origem: W(xa, B0 + num(h, 0), zF), ex: [1, 0, 0], ey: nOut, perfil: pto, L: xb - xa, papel: "Travessa de fechamento", ifc: "IFCMEMBER", aco: p.acoTerca,
                                  nome: "Travessa do oitão " + (k2 ? "fundo" : "frente") + " h = " + r2(num(h, 0)) + " m" }), "travessa");
            if (cx) { travs.push(cx); cont.travessas = (cont.travessas || 0) + 1; }
          }
        });
      });
    }
    if (travs.length) avisos.push("Travessas: clipes nos pilares e tirantes de parede no detalhe típico das pranchas");

    /* MÃOS-FRANCESAS (do cálculo): travam a mesa comprimida — a de baixo da viga (até a terça) e a de dentro do pilar
       (até a travessa) — nas posições que o cálculo escolheu */
    if (Array.isArray(p.maosFrancesas) && p.maosFrancesas.length) {
      var pmf = perfilCat(p.maoFrancesaPerfil);
      if (!pmf) avisos.push("Mão-francesa: perfil " + p.maoFrancesaPerfil + " não está no catálogo");
      else p.maosFrancesas.forEach(function (mf) {
        var Pk = porticos[Math.max(0, Math.min(nP - 1, Math.round(num(mf.k, 0))))]; if (!Pk) return;
        var sz = mf.k >= nP - 1 ? -1 : 1, P1, P2;
        if (mf.tipo === "viga" && pv) {
          var xm = num(mf.x, 0), xh = Math.min(xm, vao - xm), xsTer = sPos.map(function (s2) { return s2 * co; }), jb = 0;
          xsTer.forEach(function (v2, j3) { if (Math.abs(v2 - xh) < Math.abs(xsTer[jb] - xh)) jb = j3; });
          var xT = xm < vao / 2 ? xsTer[jb] : vao - xsTer[jb], yB = yTopo(xT) - pv.d / co + 0.012, yT2 = yTopo(xT) + 0.3 * dT * co, dz = yT2 - yB;
          P1 = W(xT, yB, Pk.z); P2 = W(xT, yT2, Pk.z + sz * dz);
        } else if (mf.tipo === "pilar") {
          var ld = mf.lado ? 1 : 0, xIn = ld ? vao - dC / 2 + 0.012 : dC / 2 - 0.012, bwG = p.travessaLateral ? (perfilCat(p.travessaLateral).bw || 0.15) : 0.15;
          var xOut = ld ? vao + dC / 2 + bwG / 2 : -dC / 2 - bwG / 2, yy = B0 + num(mf.y, 0), dz2 = Math.abs(xOut - xIn);
          P1 = W(xIn, yy, Pk.z); P2 = W(xOut, yy, Pk.z + sz * dz2);
        } else return;
        var dd = V().sub(P2, P1), u = V().unit(dd), ey = V().unit(V().cross(u, [0, 1, 0])); if (!(V().len(ey) > 0.5)) ey = [1, 0, 0];
        var cx = nova(perfil({ origem: P1, ex: u, ey: ey, perfil: pmf, L: V().len(dd), papel: "Mão-francesa", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Mão-francesa — " + (mf.tipo === "viga" ? "viga" : "pilar") + " do pórtico " + (num(mf.k, 0) + 1) }), "mão-francesa");
        if (cx) cont.maosFrancesas = (cont.maosFrancesas || 0) + 1;
      });
    }

    /* ========================================= LIGAÇÕES PADRÃO (lotes dentro do lote) */
    if (p.ligacoes) {
      var Lg = L(), atual = {};
      pecas.forEach(function (q) { atual[q.id] = q; });
      var cur = function (q) { return q && q.id != null && atual[q.id] ? atual[q.id] : q; };
      var aplicar = function (tipo, sel, parL) {
        var lid = String(novoId()), pr = {}; Object.keys(parL || {}).forEach(function (k3) { pr[k3] = parL[k3] && parL[k3].tipo ? cur(parL[k3]) : parL[k3]; }); pr.lig = lid;
        sel = sel.map(cur);
        var r = Lg.aplicar(tipo, sel, pr);
        ligs.push({ tipo: tipo, ok: r.ok, resumo: r.ok ? r.resumo : r.motivo, avisos: r.ok ? r.avisos : [] });
        if (!r.ok) { avisos.push(Lg.MACROS[tipo].rotulo + ": " + r.motivo); return; }
        var lote = Lg.ops(r, novoId);
        lote.ops.forEach(function (o) {
          ops.push(o);
          /* os furos que esta ligação abriu já valem para a conferência das próximas */
          /* a barra ajustada (recuo no nó, chapa encostando) passa a ser a atual para as próximas ligações */
          if (o.op === "criar" && atual[o.id]) { o.caixa.id = o.id; atual[o.id] = JSON.parse(JSON.stringify(o.caixa)); }
          if (o.op === "metalFuros" && atual[o.id]) { var q = atual[o.id]; q.metalFuros = (q.metalFuros || []).filter(function (f) { return f.lig !== o.lig; }).concat(o.furos.map(function (f) { var h = JSON.parse(JSON.stringify(f)); h.lig = o.lig; return h; })); }
        });
      };
      var parLig = { parafuso: p.parafuso, t: tP };
      /* medidas dimensionadas (js/acoligcalc.js → desenho): placa, chumbadores, chapa de extremidade, parafusos */
      var copia = function (o) { var c2 = {}; Object.keys(o || {}).forEach(function (k5) { c2[k5] = o[k5]; }); return c2; };
      var parBase = p.ligPlacaBase ? copia(p.ligPlacaBase) : {}, parBaseT = p.ligPlacaBaseTap ? copia(p.ligPlacaBaseTap) : {};
      var parJo = p.ligJoelho ? copia(p.ligJoelho) : parLig, parCu = p.ligCumeeira ? copia(p.ligCumeeira) : parLig;
      porticos.forEach(function (P) {
        P.pilares.forEach(function (c) { aplicar("placaBase", [c], parBase); });
        if (P.vigas.length === 2) {
          aplicar("chapaExtremidade", [P.vigas[0], P.pilares[0]], parJo);
          aplicar("chapaExtremidade", [P.vigas[1], P.pilares[1]], parJo);
          aplicar("chapaExtremidade", [P.vigas[0], P.vigas[1]], parCu);
        }
        P.nos.forEach(function (no) { aplicar("noTrelica", no.barras, { apoio: no.apoio || null, parafuso: p.parafusoTrelica, parafusos: 2 }); });
      });
      taps.forEach(function (c) { aplicar("placaBase", [c], parBaseT); });
      /* clip em cada terça × viga (a terça do vão seguinte divide o clip) */
      if (p.tipo !== "trelicado") {
        porticos.forEach(function (P, k4) {
          [0, 1].forEach(function (lado) {
            var viga = P.vigas[lado]; if (!viga) return;
            var antes = k4 > 0 ? tercas[k4 - 1].filter(function (t) { return t.lado === lado; }) : [], depois = k4 < tercas.length ? tercas[k4].filter(function (t) { return t.lado === lado; }) : [];
            sPos.forEach(function (s, j) {
              var a = antes.filter(function (t) { return t.j === j; })[0], d = depois.filter(function (t) { return t.j === j; })[0];
              var t1 = a || d, t2 = a && d ? d : null; if (!t1) return;
              var pc2 = { terca2: t2 ? t2.cx : null, parafuso: p.ligClip && p.ligClip.parafuso ? p.ligClip.parafuso : p.parafusoTerca };
              if (p.ligClip) { if (p.ligClip.cat) pc2.cat = p.ligClip.cat; if (p.ligClip.parafusos) pc2.parafusos = p.ligClip.parafusos; }
              aplicar("clipTerca", [t1.cx, viga], pc2);
            });
          });
        });
      } else avisos.push("Treliçado: as terças ficaram apoiadas no banzo superior sem clip (ligação a detalhar)");
      contras.forEach(function (ct) { if (ct.barra) return; ct.apoios.forEach(function (ap) { aplicar("contraventamento", [ct.cx, ap], { parafuso: "M16", parafusos: 2 }); }); });
      /* tirantes: só o furo na alma das terças (porca e arruela dos dois lados, na lista) */
      tirantes.forEach(function (tr) {
        var lid = String(novoId()), mT = M().membro(cur(tr.cx)), u = mT.X, Pm = mT.P0;
        [tr.a, tr.b].forEach(function (terca) {
          var hs = M().furosDoEixo(M().membro(cur(terca)), Pm, u, 0, mT.L, 0.003);
          if (!hs.length) { avisos.push("Tirante sem furo na terça " + terca.id); return; }
          var dbm = Math.round(p.tirante * 1000 * 10) / 10;
          ops.push({ op: "metalFuros", id: terca.id, lig: lid, furos: hs.map(function (h) { return { face: h.face, x: h.x, y: h.y, db: dbm, d: dbm + 1.5, l: dbm + 1.5, tipo: "padrao" }; }) });
        });
      });
    }
    var avL = []; ligs.forEach(function (l) { l.avisos.forEach(function (a) { if (avL.indexOf(a) < 0) avL.push(a); }); });
    var resumo = "Galpão " + r2(vao) + " × " + r2(p.comprimento) + " m (" + nP + " pórticos a cada " + r2(esp) + " m, pé-direito " + r2(H) + " m, telhado " + p.inclinacao + " %): " +
      cont.pilares + " pilares, " + (p.tipo === "trelicado" ? cont.banzos + " banzos e " + cont.diagonais + " diagonais/montantes" : cont.vigas + " vigas") + ", " + cont.tercas + " terças, " + cont.tirantes + " tirantes, " + cont.contraventos + " contraventos" +
      (cont.tapamentos ? ", " + cont.tapamentos + " colunas de tapamento" : "") + (cont.travessas ? ", " + cont.travessas + " travessas" : "") + (cont.maosFrancesas ? ", " + cont.maosFrancesas + " mãos-francesas" : "") +
      (p.ligacoes ? "; " + ligs.filter(function (l) { return l.ok; }).length + " ligações" : "") + ".";
    return { ok: true, op: { op: "lote", id: String(novoId()), origem: "metal-galpao", ops: ops }, pecas: pecas, ligacoes: ligs, avisos: avisos, avisosLigacoes: avL, resumo: resumo, contagem: cont, par: p, porticos: nP, espacamento: esp };
  }

  /* TRELIÇA do pórtico treliçado: banzo superior na linha do telhado, banzo
     inferior reto, montantes e diagonais (Howe), cantoneiras com a aba no
     plano do pórtico; nós com gusset; o nó da ponta é soldado no pilar. */
  function trelica(p, P, k, z, nova, cont, avisos, W, yTopo, dC, th) {
    var pb = perfilCat(p.banzo), pd = perfilCat(p.diagonal), vao = p.vao, he = num(p.alturaTrelica, 0.6), folga = 0.02;
    var xa = dC / 2 + folga, xm = vao / 2, n = Math.round(num(p.paineisTrelica, 0)) || Math.max(2, Math.ceil((xm - xa) / 1.5));
    var yb = yTopo(0) - he;   /* banzo inferior reto, na altura da ponta */
    function zc(perf) { return z + perf.b / 2; }   /* a aba no plano z do pórtico (o gusset fica do lado −Z) */
    function barra(Pa, Pb, perf, papel) {
      var d = V().sub(Pb, Pa), u = V().unit(d), ey = V().cross([0, 0, 1], u);
      var cx = nova(M().perfil({ origem: Pa, ex: u, ey: ey, perfil: perf, L: V().len(d), papel: papel, ifc: "IFCMEMBER", aco: "ASTM A36", nome: papel + " — pórtico " + (k + 1) }), papel);
      if (cx) { if (/Banzo/.test(papel)) cont.banzos++; else cont.diagonais++; }
      return cx;
    }
    function ponto(x, y, perf) { return W(x, y, zc(perf)); }
    var offT = function (x) { return yTopo(x) - pb.a / 2 / Math.cos(th); };   /* o eixo do banzo superior, abaixo da linha do telhado */
    [0, 1].forEach(function (lado) {
      var X = function (x) { return lado ? vao - x : x; };
      var xs = []; for (var i = 0; i <= n; i++) xs.push(xa + (xm - xa) * i / n);
      var bs = barra(ponto(X(xa), offT(xa), pb), ponto(X(xm), offT(xm), pb), pb, "Banzo superior");
      var bi = barra(ponto(X(xa), yb + pb.a / 2, pb), ponto(X(xm), yb + pb.a / 2, pb), pb, "Banzo inferior");
      var mont = [], diag = [];
      xs.forEach(function (x, i) {
        if (i === n && lado === 1) return;   /* o montante do meio é um só */
        var yT = offT(x), yB = yb + pb.a / 2;
        if (yT - yB < 0.15) return;
        mont[i] = barra(ponto(X(x), yB, pd), ponto(X(x), yT, pd), pd, "Montante");
      });
      for (var i2 = 0; i2 < n; i2++) {
        /* Howe: do topo no painel i ao pé no i+1 (as diagonais descem para o meio) */
        diag[i2] = barra(ponto(X(xs[i2]), offT(xs[i2]), pd), ponto(X(xs[i2 + 1]), yb + pb.a / 2, pd), pd, "Diagonal");
      }
      P.trelica = P.trelica || [];
      P.trelica.push({ bs: bs, bi: bi, mont: mont, diag: diag });
      /* os nós: ponta (no pilar), intermediários; o do meio junta as duas metades */
      var pil = P.pilares[lado];
      xs.forEach(function (x, i) {
        /* Howe: a diagonal i sai do TOPO em x_i e chega no PÉ em x_(i+1) */
        var topo = [bs, mont[i], diag[i]].filter(Boolean);
        var pe = [bi, mont[i], i > 0 ? diag[i - 1] : null].filter(Boolean);
        if (i === 0) { P.nos.push({ barras: topo, apoio: pil }); P.nos.push({ barras: [bi].concat(mont[0] ? [mont[0]] : []), apoio: pil }); return; }
        if (i === n) { if (lado === 1) { var outra = P.trelica[0]; P.nos.push({ barras: [outra.bs, bs, outra.mont[n]].filter(Boolean) }); P.nos.push({ barras: [outra.bi, bi, outra.mont[n], outra.diag[n - 1], diag[n - 1]].filter(Boolean) }); } return; }
        if (topo.length >= 2) P.nos.push({ barras: topo });
        if (pe.length >= 2) P.nos.push({ barras: pe });
      });
    });
  }

  /* ============================================ DO CÁLCULO PARA O MODELO
   * r = AcoDimensionar.calcular(...) (aprovado ou não — o desenho mostra o que foi calculado).
   * op = { x0, z0, base } (onde o galpão nasce no editor). Devolve o `par` do gerar(). */
  function parDoCalculo(r, op) {
    op = op || {};
    if (!r || !r.ok || !r.modelo || !r.modelo.layout) return null;
    var G = r.modelo, L = G.layout, gp = G.par.geometria || {}, gr = r.grupos || {}, lig = r.ligacoes || {}, fe = G.par.fechamentos || {};
    var nos = {}; (G.modelo.nos || []).forEach(function (n) { nos[n.id] = n; });
    /* contraventamento: as barras da análise, juntando os pedaços colineares (a diagonal do X é uma barra só) */
    var segs = (G.modelo.barras || []).filter(function (b) { return b.papel === "contravento" && nos[b.i] && nos[b.j]; }).map(function (b) {
      var a1 = nos[b.i], a2 = nos[b.j]; return { P1: [a1.x, a1.y, a1.z], P2: [a2.x, a2.y, a2.z], i: b.i, j: b.j };
    });
    function dir(sg) { var d = [sg.P2[0] - sg.P1[0], sg.P2[1] - sg.P1[1], sg.P2[2] - sg.P1[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; }
    var juntou = true;
    while (juntou) {
      juntou = false;
      for (var a = 0; a < segs.length && !juntou; a++) for (var b = a + 1; b < segs.length && !juntou; b++) {
        var A = segs[a], B = segs[b], dA = dir(A), dB = dir(B), par = Math.abs(dA[0] * dB[0] + dA[1] * dB[1] + dA[2] * dB[2]) > 0.9999;
        if (!par) continue;
        var comum = A.j === B.i ? "AjBi" : A.i === B.j ? "AiBj" : A.j === B.j ? "AjBj" : A.i === B.i ? "AiBi" : null; if (!comum) continue;
        var n2 = comum === "AjBi" ? { P1: A.P1, P2: B.P2, i: A.i, j: B.j } : comum === "AiBj" ? { P1: B.P1, P2: A.P2, i: B.i, j: A.j } : comum === "AjBj" ? { P1: A.P1, P2: B.P1, i: A.i, j: B.i } : { P1: A.P2, P2: B.P2, i: A.j, j: B.j };
        segs.splice(b, 1); segs.splice(a, 1, n2); juntou = true;
      }
    }
    segs.forEach(function (sg) { sg.plano = Math.min(sg.P1[1], sg.P2[1]) >= L.H - 1e-6 ? "cobertura" : "parede"; });
    /* mãos-francesas do cálculo: viga → x em planta do ponto; pilar → altura */
    var mfs = [];
    G.membros.forEach(function (m) {
      if (!m.maosFrancesas || !m.maosFrancesas.length || !nos[m.nos[0]] || !nos[m.nos[m.nos.length - 1]]) return;
      var n0 = nos[m.nos[0]], n1 = nos[m.nos[m.nos.length - 1]], Lm = Math.sqrt(Math.pow(n1.x - n0.x, 2) + Math.pow(n1.y - n0.y, 2) + Math.pow(n1.z - n0.z, 2)) || 1;
      m.maosFrancesas.forEach(function (sx) {
        var t = sx / Lm, x = n0.x + (n1.x - n0.x) * t, y = n0.y + (n1.y - n0.y) * t;
        if (m.papel === "viga") mfs.push({ tipo: "viga", k: m.k, x: x });
        else if (m.papel === "pilar") mfs.push({ tipo: "pilar", k: m.k, lado: m.lado ? 1 : 0, y: y });
      });
    });
    function temTrav(f) { var t = String((fe[f] || {}).tipo || "telha").toLowerCase(); return /telha|misto/.test(t); }
    function alturas(lista, f) { var am = num((fe[f] || {}).alturaAlvenaria, 0); return (lista || []).filter(function (h) { return !(/misto/.test(String((fe[f] || {}).tipo || "")) && h < am - 1e-6); }); }   /* a do topo da alvenaria fica */
    var tl = r.travessas && r.travessas.lateral && r.travessas.lateral.ok ? r.travessas.lateral : null, to = r.travessas && r.travessas.oitao && r.travessas.oitao.ok ? r.travessas.oitao : null;
    var desenho = function (k) { return lig[k] && lig[k].desenho ? lig[k].desenho : null; };
    return {
      vao: L.vao, comprimento: L.Lt, espacamento: L.esp, peDireito: L.H, inclinacao: Math.round(L.i * 100 * 1000) / 1000, base: num(op.base, 0), x0: num(op.x0, 0), z0: num(op.z0, 0),
      tipo: "alma-cheia", pilar: gr.pilar && gr.pilar.perfil, viga: gr.viga && gr.viga.perfil, tapamento: gr.tapamento && gr.tapamento.perfil || PADRAO.tapamento,
      terca: r.tercas && r.tercas.ok ? r.tercas.perfil : PADRAO.terca, espTercas: L.sT, linhasCorrentes: r.tercas && r.tercas.ok ? Math.max(1, r.tercas.linhas) : 1,
      tirante: r.tercas && r.tercas.linhaTirante ? r.tercas.linhaTirante.d / 1000 : 0.0095,
      tapamentos: (L.tapF || []).length, xsTapamentos: (L.tapF || []).slice(),
      travessaLateral: tl ? tl.perfil : "", alturasTravessas: tl ? alturas(L.travE, "esquerda") : null,
      travessaOitao: to ? to.perfil : "", alturasTravessasOitao: to ? alturas(L.travF, "frente") : null,
      paredesComTravessa: { esquerda: temTrav("esquerda"), direita: temTrav("direita"), frente: temTrav("frente"), fundo: temTrav("fundo") },
      contraventos: segs.length > 0, contraventoBarra: G.par.contraventamento === "X-cantoneira" ? 0 : num(G.par.contraventoDiametro, 12.5) / 1000, contraventosCalc: segs,
      maosFrancesas: mfs, ligacoes: true,
      maoFrancesaPerfil: (function () { var lg = r.ligacoes || {}, m = lg.maoFrancesaViga || lg.maoFrancesaPilar; return m && m.dimensoes && m.dimensoes.perfil ? m.dimensoes.perfil : PADRAO.maoFrancesaPerfil; })(),
      ligPlacaBase: desenho("base"), ligPlacaBaseTap: desenho("baseTapamento"), ligJoelho: desenho("joelho"), ligCumeeira: desenho("cumeeira"), ligClip: desenho("clip"),
      acoPerfil: (G.grupos.pilar && G.grupos.pilar.aco && G.grupos.pilar.aco.id) || PADRAO.acoPerfil, acoTerca: (r.tercas && r.tercas.aco) || PADRAO.acoTerca, acoBarra: PADRAO.acoBarra
    };
  }

  var BimMetalGalpao = { PADRAO: PADRAO, gerar: gerar, parDoCalculo: parDoCalculo, validar: function (par) { var p = {}; Object.keys(PADRAO).forEach(function (k) { p[k] = par && par[k] != null ? par[k] : PADRAO[k]; }); return validar(p); } };
  global.BimMetalGalpao = BimMetalGalpao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalGalpao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

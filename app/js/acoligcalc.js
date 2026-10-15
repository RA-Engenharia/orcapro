/* =====================================================================
 * acoligcalc.js — DIMENSIONAMENTO DAS LIGAÇÕES do galpão de aço (motor
 * PURO, ES5, sem DOM, Node-testável). A geometria e a fabricação das
 * ligações ficam no js/metalligacao.js (BimMetalLig); aqui sai a
 * RESISTÊNCIA, com os passos para o memorial, e a escolha automática do
 * menor arranjo que passa (espessura da chapa, diâmetro dos parafusos e
 * chumbadores, perna da solda). Cada resultado traz `desenho`: os
 * parâmetros no formato do BimMetalLig, para a prancha mostrar exatamente
 * o que foi calculado.
 *
 *   placaBase(p)         pilar → fundação, rotulada ou engastada, no arranjo
 *                        do desenho (balanço de 75 mm — 150 mm na engastada
 *                        — e 4 chumbadores nos cantos): pressão no concreto,
 *                        flexão da placa (compressão e arrancamento), tração
 *                        e cisalhamento nos chumbadores, solda do pilar,
 *                        ancoragem por aderência
 *   chapaExtremidade(p)  joelho (viga → mesa do pilar) e cumeeira (viga →
 *                        viga): chapa estendida, parafusos à tração (binário
 *                        M/h) e ao cisalhamento, chapa (T-stub sem alavanca),
 *                        mesa e alma do pilar (forças localizadas →
 *                        enrijecedores), painel da alma (→ diagonal), soldas
 *   clipTerca(p)         terça → viga: parafusos ao cisalhamento, pressão de
 *                        contato na alma da terça (NBR 14762 quando t < 4,75
 *                        mm), aba do clip à flexão na sucção
 *   contravento(p)       barra redonda: fuste, rosca, chapa de apoio da porca
 *                        à flexão e solda da chapa
 *
 * FÓRMULAS (a edição está em cada passo; γ do js/acomateriais.js):
 *   parafuso à tração Ft,Rd = 0,75·Ab·fub/γa2 (6.3.3.1); ao cisalhamento
 *   Fv,Rd = 0,45·Ab·fub/γa2 com a rosca no plano, 0,56 fora (NBR 8800:2024 —
 *   eram 0,40 e 0,50; Gerdau 10/10/2024 e UFU, ver docs/metalica/gabarito-
 *   normas.md); interação (Ft/FtRd)² + (Fv/FvRd)² ≤ 1 (6.3.3.4); pressão de
 *   contato Fc,Rd = 1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2 (6.3.3.3); solda de
 *   filete 0,60·Aw·fw/γw2 e metal-base 0,60·AMB·fy/γa1 (6.2.5, Tabela 8);
 *   perna mínima (Tabela 10); concreto σc,Rd = 0,85·fck/γc·√(A2/A1) ≤
 *   1,7·fck/γc (2024); forças localizadas na mesa e na alma do pilar (5.7:
 *   6,25·tf²·fy/γa1, metade a menos de 10·tf do topo; 1,10·(2,5k + ln)·fy·tw
 *   /γa1 e 0,33·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1 no topo);
 *   placa de base pelo AISC Design Guide 1 (bloco retangular de compressão;
 *   excentricidade pequena e grande) com o momento plástico t²·fy/4 por
 *   unidade de largura; esmagamento em chapa fina pela NBR 14762:2010
 *   (αe = 0,183·t + 1,53; γ = 1,55 — conferir o item no texto).
 * ⚠ O efeito de alavanca e o método novo de placa de base da NBR 8800:2024
 *   não foram publicados fora do texto: a chapa de extremidade é
 *   dimensionada SEM efeito alavanca (chapa espessa — a favor da segurança
 *   para o parafuso) e a placa de base pelo Guia 1. O arrancamento do cone
 *   de concreto, o bloco e a armadura de fretagem são do projeto de
 *   fundação (dito no resultado).
 * Unidades: entrada em kN e kN·m; dimensões em mm. Saída em kN, kN·m e mm.
 * Teste: node tools/test-aco-ligcalc.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Nor() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  /* SIMULAÇÃO S1 (14/10/2026, js/acoligfundacao.js): o topo da fundação do modelo dá o A2/A1 de cada placa tentada */
  function LF() { return dep("AcoLigFundacao", "./acoligfundacao.js"); }
  /* distância mínima do centro do furo à borda (NBR 8800, Tabela 14 — a do desenho, js/metalnorma.js); sem o módulo, 1,25·d */
  function bordaMin(d, tipo) { var N = Nor(); if (N && N.bordaMin) { var r = N.bordaMin(d, tipo || "laminada"); if (r && r.e) return r.e; } return Math.ceil(1.25 * d); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(v) { return v * v; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cima5(v) { return Math.ceil(v / 5 - 1e-9) * 5; }
  function cima10(v) { return Math.ceil(v / 10 - 1e-9) * 10; }
  function gamas() { var M = Mat(); return M ? M.GAMA : { a1: 1.10, a2: 1.35, w1: 1.25, w2: 1.35, c: 1.4 }; }
  var E_ACO = 200000;
  var ED24 = "NBR 8800:2024", ED08 = "NBR 8800:2008", ED14762 = "NBR 14762:2010", DG1 = "AISC Design Guide 1 (2ª ed.)";
  var CHAPAS = [6.3, 8, 9.5, 12.5, 16, 19, 22.4, 25, 31.5, 37.5, 44.5, 50];                       /* espessuras comerciais (mm) */
  /* ids do catálogo do desenho (js/metalnorma.js) */
  /* os diâmetros que o motor experimenta: a tabela ÚNICA do js/acomateriais.js (DIAMETROS — os mesmos valores e a
     mesma ordem de antes; PARAF[3] é o M22). Este arquivo carrega DEPOIS do acomateriais.js no index.html. */
  function diam(tipo) { var M = Mat(); return M && M.diametros ? M.diametros(tipo) : []; }
  var PARAF = diam("parafuso"), CHUMB = diam("chumbador");
  function Ab(d) { return Math.PI * d * d / 4; }

  /* ------------------------------------------------ resistências básicas (kN) */
  function parafusoTracao(d, fub) { return 0.75 * Ab(d) * fub / gamas().a2 / 1000; }
  /* opcoes.edicao = "2008": cisalhamento do parafuso 0,40/0,50 e σc,Rd da 2008 — só para conferir exemplos publicados */
  var OPC = { edicao: "2024" };
  function parafusoCisal(d, fub, roscaNoPlano) { var e08 = OPC.edicao === "2008"; return (roscaNoPlano === false ? (e08 ? 0.50 : 0.56) : (e08 ? 0.40 : 0.45)) * Ab(d) * fub / gamas().a2 / 1000; }
  /* lf = distância livre (borda do furo à borda da chapa ou ao furo vizinho); furo padrão = db + 1,5 mm */
  function pressaoContato(d, t, fu, lf) { var g = gamas(); return Math.min(1.2 * lf * t * fu, 2.4 * d * t * fu) / g.a2 / 1000; }
  /* chapa fina (t < 4,75 mm — perfil formado a frio): NBR 14762:2010, esmagamento Fc,Rd = αe·d·t·fu/γ, αe = 0,183·t + 1,53 (t em mm), γ = 1,55 */
  function esmagamento14762(d, t, fu) { return (0.183 * t + 1.53) * d * t * fu / 1.55 / 1000; }
  /* solda de filete de perna a (mm) e comprimento L (mm): metal da solda e metal-base na face de fusão */
  function soldaFilete(a, L, fw, fyBase) {
    var g = gamas(), Fw = 0.60 * (0.707 * a * L) * fw / g.w2, Fmb = 0.60 * (a * L) * fyBase / g.a1;
    return Math.min(Fw, Fmb) / 1000;
  }
  function soldaPorMm(a, fw, fyBase) { return soldaFilete(a, 1, fw, fyBase); }        /* kN por mm de cordão */
  function pernaMinima(t) { return t <= 6.35 ? 3 : t <= 12.5 ? 5 : t <= 19 ? 6 : 8; }   /* NBR 8800, Tabela 10 — pela chapa mais grossa (a favor) */
  function concreto(fck, A2_A1) {
    var g = gamas(), r = Math.min(2, Math.sqrt(Math.max(1, num(A2_A1, 1))));
    if (OPC.edicao === "2008") return Math.min(fck * r / (g.c * num(g.n, 1.4)), fck);   /* NBR 8800:2008, 6.6.1: fck·√(A2/A1)/(γc·γn) ≤ fck */
    return Math.min(0.85 * fck / g.c * r, 1.7 * fck / g.c);
  }
  /* furo-padrão (NBR 8800, 6.3.6 / Tabela 12: db + 1,5 mm); nas áreas líquidas soma-se mais 2 mm (5.2.4.1) */
  function furoPadrao(d) { var N = Nor(); if (N && N.furo) { var f = N.furo(d, "padrao"); if (f && f.d) return f.d; } return d + 1.5; }
  /* COLAPSO POR RASGAMENTO — NBR 8800, 6.5.6:
     Fr,Rd = (0,60·fu·Anv + Cts·fu·Ant)/γa2 ≤ (0,60·fy·Agv + Cts·fu·Ant)/γa2
     p = { t, fy, fu, lv (mm, soma dos planos de cisalhamento), lt (mm, soma dos planos de tração),
           furosV, furosT (quantos furos cortam cada soma; meio furo = 0,5), dh (furo das áreas líquidas,
           já com os 2 mm), Cts (1,0 tração uniforme; 0,5 não uniforme) } → { Rd (kN), Agv, Anv, Ant, R1, R2 } */
  function rasgamento(p) {
    var t = num(p.t, 0), fy = num(p.fy, 250), fu = num(p.fu, 400), dh = num(p.dh, 0), cts = num(p.Cts, 1), ga2 = gamas().a2;
    var Agv = num(p.lv, 0) * t, Anv = (num(p.lv, 0) - num(p.furosV, 0) * dh) * t, Ant = (num(p.lt, 0) - num(p.furosT, 0) * dh) * t;
    var R1 = (0.60 * fu * Anv + cts * fu * Ant) / ga2 / 1000, R2 = (0.60 * fy * Agv + cts * fu * Ant) / ga2 / 1000;
    return { Rd: Math.min(R1, R2), Agv: Agv, Anv: Anv, Ant: Ant, R1: R1, R2: R2 };
  }
  function bordaChumb(d) { return Math.max(40, cima5(1.75 * d)); }                   /* furo alargado na placa: borda folgada */

  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos, resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0) }; }
  function fecha(vs) { var rz = 0, gov = null; vs.forEach(function (v) { if (v.razao > rz) { rz = v.razao; gov = v.nome; } }); return { razao: rz, governante: gov, ok: rz <= 1.0 + 1e-9 }; }

  /* ================================================================ PLACA DE BASE
   * p = { tipo: "rotulada"|"engastada", pilar: { d, bf, tw, tf } (mm), aco: { fy, fu } (placa),
   *       chumbador: { id, fy, fu }, concreto: { fck (MPa), A2_A1 }, eletrodo: { fw },
   *       esforcos: [{ comb, N (kN, + tração), Vx, Vz (kN), M (kN·m, no plano do pórtico — engastada) }] }
   * Arranjo do desenho (BimMetalLig.placaBase): B = bf + 2·75, L = d + 2·(75 | 150), 4 chumbadores nos
   * cantos a `borda` das bordas. Sai o menor (chumbador, espessura) que passa. */
  function placaBase(p) {
    var g = gamas(), pil = p.pilar || {}, eng = p.tipo === "engastada", esf = p.esforcos || [];
    var fyP = num(p.aco && p.aco.fy, 250), fuC = num(p.chumbador && p.chumbador.fu, 400), fyC = num(p.chumbador && p.chumbador.fy, 250);
    var fck = num(p.concreto && p.concreto.fck, 25), A2A1 = num(p.concreto && p.concreto.A2_A1, 1), fw = num(p.eletrodo && p.eletrodo.fw, 485);
    var suporte = p.concreto && Array.isArray(p.concreto.suporte) && p.concreto.suporte.length >= 3 && LF() ? p.concreto.suporte : null;   /* [{u, w}] mm, no centro da placa */
    var balB = 75, balN = eng ? 150 : 75;
    var B = cima10(pil.bf + 2 * balB), L = cima10(pil.d + 2 * balN), nCh = 4, melhor = null;
    /* mínimos construtivos: chumbador 3/4" (Guia 1: o diâmetro mais comum e o menor recomendado) e placa 12,5 mm.
       Engastada: se não passar no balanço de partida, aumenta a placa (balanços de 75 a 150 mm na largura e de 150 a
       300 mm no comprimento) e fica a de MENOR volume de chapa que passa */
    var balancos = eng ? [[75, 150], [100, 200], [125, 250], [150, 300]] : [[75, 75]];
    /* engastada: 2, 3 ou 4 chumbadores em CADA extremidade (as que tracionam com o momento) — a sugestão de "6 ou 8
       chumbadores" que o motor dava agora é tentada (a tela achou que nunca era); o espaçamento mínimo é 3·d */
    var porLados = eng ? [2, 3, 4] : [2], nLado = 2, todos = [];
    for (var bi = 0; bi < balancos.length && !melhor; bi++) {
      balB = balancos[bi][0]; balN = balancos[bi][1]; B = cima10(pil.bf + 2 * balB); L = cima10(pil.d + 2 * balN);
      var cands = [];
      for (var pl = 0; pl < porLados.length; pl++) {
        nLado = porLados[pl]; nCh = 2 * nLado;
        /* REVISÃO A4 (14/10/2026): p.dMinChumb (mm) = o menor chumbador a tentar — a fundação (gancho/cone) pede mais */
        var ci0 = 1; if (num(p.dMinChumb, 0) > 0) { for (var k0 = 1; k0 < CHUMB.length; k0++) if (CHUMB[k0].d >= num(p.dMinChumb, 0) - 1e-6) { ci0 = k0; break; } if (CHUMB[CHUMB.length - 1].d < num(p.dMinChumb, 0) - 1e-6) ci0 = CHUMB.length; }
        for (var ci = ci0; ci < CHUMB.length; ci++) {
          if (nLado > 2 && (B - 2 * bordaChumb(CHUMB[ci].d)) / (nLado - 1) < 3 * CHUMB[ci].d) continue;
          for (var ti = 3; ti < CHAPAS.length; ti++) { var r = avaliar(CHUMB[ci], CHAPAS[ti]); if (r.ok) { r.porLado = nLado; cands.push(r); break; } }
          if (!eng && cands.length) break;
        }
        if (!eng && cands.length) break;
      }
      nLado = 2; nCh = 4;
      todos = todos.concat(cands);
      if (!eng && cands.length) break;
    }
    /* a de menor volume de chapa ENTRE TODAS as faixas (placa maior aumenta o balanço que flete — maior nem sempre é
       melhor); prefere chapa ≤ 37,5 mm; empate: menos chumbadores, depois o menor diâmetro */
    function vol(x) { return x.dimensoes.B * x.dimensoes.L * x.dimensoes.t; }
    todos.sort(function (x, y) { return ((x.dimensoes.t > 37.5) - (y.dimensoes.t > 37.5)) || vol(x) - vol(y) || x.dimensoes.chumbadores.n - y.dimensoes.chumbadores.n || x.dimensoes.chumbadores.d - y.dimensoes.chumbadores.d; });
    if (todos.length) melhor = todos[0];
    if (!melhor) {
      melhor = avaliar(CHUMB[CHUMB.length - 1], CHAPAS[CHAPAS.length - 1]);
      melhor.sugestao = eng ? "Placa com nervuras (enrijecedores soldados no pilar) ou bloco de fundação maior que a placa (informe A2/A1 em Fundação) — o motor já tentou placas de vários tamanhos e 4, 6 e 8 chumbadores." : "Use barra de cisalhamento sob a placa ou chumbadores de aço de maior resistência (F1554 Gr.55).";
    }
    return melhor;

    function avaliar(ch, tp) {
      var d = ch.d, e = bordaChumb(d), f = L / 2 - e;                                      /* braço do chumbador ao centro (mm) */
      var A2A1x = suporte ? LF().a2a1(suporte, B, L).A2A1 : A2A1;                          /* com a fundação do modelo: A2/A1 desta placa */
      var A1 = B * L, sigRd = concreto(fck, A2A1x), qmax = sigRd * B;                       /* MPa; N/mm */
      var FtRd = parafusoTracao(d, fuC), FvRd = parafusoCisal(d, fuC, true);
      var piorSig = 0, piorSigTxt = "", piorT = 0, piorV = 0, piorInt = 0, piorMc = 0, piorMt = 0, piorDem = 0, excede = false, cg = {};
      var m = (L - 0.95 * pil.d) / 2, n = (B - 0.8 * pil.bf) / 2, lmb = Math.sqrt(pil.d * pil.bf) / 4, l = Math.max(m, n, lmb);
      esf.forEach(function (s) {
        var N = num(s.N, 0) * 1000, V = Math.sqrt(sq(num(s.Vx, 0)) + sq(num(s.Vz, 0))) * 1000, M = eng ? Math.abs(num(s.M, 0)) * 1e6 : 0;
        var sig = 0, Tlado = 0, Y = L, mC = 0, mT = 0, txt = "";
        if (!eng || M < 1) {
          if (N < 0) { sig = -N / A1; txt = "compressão centrada: σ = N/(B·L)"; mC = sig * l * l / 2; }
          else Tlado = N / 2;                                                                /* arrancamento: 4 chumbadores, 2 por lado */
        } else {
          var Nc = -N;                                                                       /* compressão > 0 */
          var ecrit = Nc > 0 ? L / 2 - Nc / (2 * qmax) : -Infinity, ex = Nc > 0 ? M / Nc : Infinity;
          if (Nc > 0 && ex <= ecrit) {
            Y = L - 2 * ex; sig = Nc / (B * Y); txt = "excentricidade pequena (e ≤ ecrit): bloco Y = L − 2e";
            mC = Y >= l ? sig * l * l / 2 : sig * Y * (l - Y / 2);
          } else if (Nc <= 0 && M <= -Nc * f) {
            Tlado = -Nc / 2 + M / (2 * f); txt = "arrancamento com momento: os dois lados tracionados";
          } else {
            var A = qmax / 2, Bq = -qmax * (f + L / 2), Cq = M + Nc * f, disc = Bq * Bq - 4 * A * Cq;
            var qMin = 2 * Cq / sq(f + L / 2);                                               /* menor q que equilibra (bloco Y = f + L/2) */
            sig = qMin / B; piorDem = Math.max(piorDem, qMin / qmax);
            if (disc < 0) { excede = true; Y = f + L / 2; Tlado = qMin * Y - Nc; txt = "excentricidade grande: a placa NÃO equilibra o momento"; mC = sig * l * l / 2; }
            else {
              Y = (-Bq - Math.sqrt(disc)) / (2 * A); Tlado = Math.max(0, qmax * Y - Nc);
              txt = "excentricidade grande (Guia 1): bloco Y = " + br(Y, 0) + " mm com σ = σc,Rd, chumbadores tracionados";
              mC = Y >= l ? sigRd * l * l / 2 : sigRd * Y * (l - Y / 2);
            }
          }
        }
        if (Tlado > 0) {
          if (eng) { var x = Math.max(10, f - pil.d / 2 + pil.tf / 2); mT = Tlado * x / B; }
          else { var xr = Math.max(10, balN - e), bef = xr + Math.min(xr, e); mT = Tlado / 2 * xr / bef; }   /* chumbador de canto: espraiamento a 45°, limitado pela borda */
        }
        var Tch = Tlado / nLado, Vch = V / (nCh / 2);                                      /* nLado por extremidade; furo alargado: metade dos chumbadores no cisalhamento */
        var it = sq(Tch / 1000 / FtRd) + sq(Vch / 1000 / FvRd);
        if (sig > piorSig) { piorSig = sig; piorSigTxt = txt; cg.sig = s.comb; }
        if (Tch > piorT) { piorT = Tch; cg.T = s.comb; }
        if (Vch > piorV) { piorV = Vch; cg.V = s.comb; }
        if (it > piorInt) { piorInt = it; cg.int = s.comb; }
        if (mC > piorMc) { piorMc = mC; cg.mc = s.comb; }
        if (mT > piorMt) { piorMt = mT; cg.mt = s.comb; }
      });
      var MRd = tp * tp * fyP / 4 / g.a1;                                                    /* N·mm por mm */
      var vs = [];
      vs.push(verif("Pressão no concreto sob a placa", ED24 + ", 6.6 (σc,Rd = 0,85·fck/γc·√(A2/A1) ≤ 1,7·fck/γc); " + DG1,
        [passo("Placa B × L", "B = bf + 2·" + balB + "; L = d + 2·" + balN + " (arredondadas a 10 mm)", br(B, 0) + " × " + br(L, 0) + " mm"),
         passo("σc,Rd", "0,85·" + br(fck, 0) + "/" + br(g.c, 1) + "·√(" + br(A2A1x, 2) + ")", br(sigRd, 2) + " MPa", suporte ? "A2/A1 do topo da fundação do modelo (limitado a 4)" : (A2A1x > 1 ? "" : "A2/A1 = 1: um bloco de fundação maior que a placa aumenta a resistência")),
         passo("Situação governante", piorSigTxt || "—", br(piorSig, 2) + " MPa", cg.sig ? "combinação " + cg.sig : "")],
        sigRd, excede ? sigRd * Math.max(1.0001, piorDem) : piorSig, "MPa"));
      vs.push(verif("Placa à flexão (t = " + br(tp, 1) + " mm)", DG1 + " — momento plástico t²·fy/4 por unidade de largura, γa1",
        [passo("Balanço (compressão)", "l = máx[(L − 0,95d)/2; (B − 0,8bf)/2; √(d·bf)/4]", br(l, 0) + " mm"),
         passo("Momento solicitante por mm", "compressão: σ·l²/2 (ou σ·Y·(l − Y/2)); arrancamento: T·x/B", br(Math.max(piorMc, piorMt) / 1000, 2) + " kN·m/m", (piorMt > piorMc ? cg.mt : cg.mc) ? "combinação " + (piorMt > piorMc ? cg.mt : cg.mc) : ""),
         passo("Momento resistente por mm", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, Math.max(piorMc, piorMt) / 1000, "kN·m/m"));
      vs.push(verif("Chumbadores à tração (" + nCh + " × " + ch.id + ", " + ((p.chumbador && p.chumbador.id) || "ASTM F1554 Gr.36") + ")", ED08 + ", 6.3.3.1 (Ft,Rd = 0,75·Ab·fub/γa2)",
        [passo("Ft,Rd por chumbador", "0,75·" + br(Ab(d), 0) + " mm²·" + br(fuC, 0) + " MPa/" + br(g.a2, 2), br(FtRd, 1) + " kN"), passo("Ft,Sd por chumbador", "", br(piorT / 1000, 1) + " kN", cg.T ? "combinação " + cg.T : "")], FtRd, piorT / 1000));
      vs.push(verif("Chumbadores ao cisalhamento", ED24 + ", 6.3.3.2 (Fv,Rd = 0,45·Ab·fub/γa2, rosca no plano)",
        [passo("Fv,Rd por chumbador", "0,45·Ab·fub/γa2", br(FvRd, 1) + " kN"), passo("Fv,Sd por chumbador", "furo alargado: a força horizontal em 2 dos 4 chumbadores", br(piorV / 1000, 1) + " kN", cg.V ? "combinação " + cg.V : "")], FvRd, piorV / 1000));
      vs.push(verif("Tração + cisalhamento nos chumbadores", ED08 + ", 6.3.3.4", [passo("(Ft,Sd/Ft,Rd)² + (Fv,Sd/Fv,Rd)²", "", br(piorInt, 3), cg.int ? "combinação " + cg.int : "")], 1, piorInt, ""));
      /* solda do pilar: tração no contorno todo, cortante nas almas, momento nas mesas (por mm de cordão); compressão por
         contato. A perna sobe até a máxima (t − 1,5 mm da peça mais fina); se o filete não der, MESAS EM PENETRAÇÃO TOTAL
         (resistência do metal-base da mesa) e filete só na alma (cortante) */
      var Lf = 2 * pil.bf - pil.tw, Lw = 2 * (pil.d - 2 * pil.tf), Lt = 2 * Lf + Lw, fyB = Math.min(fyP, num(p.acoPilar && p.acoPilar.fy, 345)), fMesaMax = 0, fAlmaMax = 0, FmesaMax = 0;
      esf.forEach(function (s2) {
        var Nt = Math.max(0, num(s2.N, 0)), V = Math.sqrt(sq(num(s2.Vx, 0)) + sq(num(s2.Vz, 0))), M = eng ? Math.abs(num(s2.M, 0)) : 0;
        fMesaMax = Math.max(fMesaMax, Nt / Lt + M * 1000 / (pil.d - pil.tf) / Lf); fAlmaMax = Math.max(fAlmaMax, Math.sqrt(sq(Nt / Lt) + sq(V / Lw)));
        FmesaMax = Math.max(FmesaMax, M * 1000 / (pil.d - pil.tf) + Nt * pil.bf * pil.tf / Math.max(1, 2 * pil.bf * pil.tf + (pil.d - 2 * pil.tf) * pil.tw));
      });
      var aMin = Math.max(pernaMinima(Math.max(tp, pil.tf)), 5), aMax = Math.max(aMin, Math.floor(Math.min(tp, pil.tf) > 6.35 ? Math.min(tp, pil.tf) - 1.5 : Math.min(tp, pil.tf))), aW = aMin, cap = soldaPorMm(aW, fw, fyB);
      while (cap < Math.max(fMesaMax, fAlmaMax) && aW < aMax) { aW++; cap = soldaPorMm(aW, fw, fyB); }
      var cjp = cap < fMesaMax && eng;
      if (!cjp) vs.push(verif("Solda do pilar na placa (filete " + aW + " mm no contorno)", ED08 + ", 6.2.5 e Tabela 10 (compressão por contato, com o graute)",
        [passo("Resistência por mm de cordão", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(cap * 1000, 0) + " N/mm"), passo("Solicitação por mm", "tração/L + M/(d − tf)/L_mesa nas mesas; cortante nas almas", br(Math.max(fMesaMax, fAlmaMax) * 1000, 0) + " N/mm")],
        cap * 1000, Math.max(fMesaMax, fAlmaMax) * 1000, "N/mm"));
      else {
        var FmRd = pil.bf * pil.tf * fyB / g.a1 / 1000, aA = aMin, capA = soldaPorMm(aA, fw, fyB);
        while (capA < fAlmaMax && aA < aMax) { aA++; capA = soldaPorMm(aA, fw, fyB); }
        aW = aA;
        vs.push(verif("Solda das mesas do pilar na placa (penetração total)", ED08 + ", 6.2.5 e Tabela 8 (penetração total: resistência do metal-base)",
          [passo("Força na mesa", "M/(d − tf) + tração proporcional à área da mesa", br(FmesaMax, 1) + " kN"), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN", "o filete de " + aMax + " mm (" + br(soldaPorMm(aMax, fw, fyB) * 1000, 0) + " N/mm) não basta")], FmRd, FmesaMax));
        vs.push(verif("Solda da alma do pilar na placa (filete " + aA + " mm)", ED08 + ", 6.2.5", [passo("Resistência por mm", "", br(capA * 1000, 0) + " N/mm"), passo("Cortante por mm", "V/L_alma", br(fAlmaMax * 1000, 0) + " N/mm")], capA * 1000, fAlmaMax * 1000, "N/mm"));
      }
      var fe = fecha(vs);
      /* ancoragem por aderência (NBR 6118, 9.4.2): barra lisa (η1 = 1,0) com gancho (α = 0,7) */
      var fctd = 0.7 * 0.3 * Math.pow(fck, 2 / 3) / 1.4, fyd = fyC / 1.15, lb = Math.max(d / 4 * fyd / fctd, 25 * d);
      var razaoAs = Math.min(1, piorT / Math.max(1, Ab(d) * fyd)), lbNec = Math.max(0.7 * lb * razaoAs, 0.3 * lb, 10 * d, 100);
      var anc = Math.max(300, Math.ceil(lbNec / 50) * 50);
      return {
        ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: eng ? "engastada" : "rotulada",
        dimensoes: { B: B, L: L, t: tp, chumbadores: { n: nCh, porLado: nLado, id: ch.id, d: d, borda: e, material: (p.chumbador && p.chumbador.id) || "ASTM F1554 Gr.36", ancoragem: anc, lb: Math.round(lb) }, solda: aW, soldaMesas: cjp ? "penetração total" : "filete " + aW + " mm" },
        desenho: { B: B / 1000, N: L / 1000, t: tp / 1000, nChumb: nCh, porLado: nLado, parafuso: ch.id, classe: "F1554-36", borda: e, ancoragem: anc / 1000, graute: 0.025, furo: "alargado" },
        resumo: "Placa " + br(B, 0) + " × " + br(L, 0) + " × " + br(tp, 1) + " mm (" + (eng ? "engastada" : "rotulada") + "); " + nCh + " chumbadores " + ch.id + " com gancho, ancoragem mínima " + br(anc, 0) + " mm; " + (cjp ? "mesas do pilar em penetração total e alma com filete " + aW + " mm" : "solda de filete " + aW + " mm em volta do pilar") + "; graute sem retração de 25 mm",
        verificacoes: vs,
        notas: [(nLado > 2 ? "Arranjo do desenho: " + nLado + " chumbadores em cada extremidade (na direção do momento), a " + e + " mm das bordas" : "Arranjo do desenho: chumbadores nos cantos, a " + e + " mm das bordas") + ", furo alargado na placa com arruela de chapa.",
                "Ancoragem por aderência com gancho (NBR 6118: barra lisa, η1 = 1,0, α = 0,7): lb = " + br(lb, 0) + " mm; adotado " + br(anc, 0) + " mm. Alternativa: porca e chapa de ancoragem na ponta.",
                "O arrancamento do cone de concreto, o bloco/pedestal e a armadura de fretagem são do projeto de fundação, com as reações deste memorial."]
      };
    }
  }

  /* ================================================================ CHAPA DE EXTREMIDADE (joelho e cumeeira)
   * p = { tipo: "joelho"|"cumeeira", viga: { d, bf, tw, tf } (mm), pilar: { d, bf, tw, tf, r } (joelho),
   *       aco: { fy, fu } (chapa), acoViga: { fy }, acoPilar: { fy }, parafuso: { id (classe), fub },
   *       esforcos: [{ comb, M (kN·m), V (kN), N (kN, + tração) }], eletrodo: { fw } }
   * Arranjo (BimMetalLig.chapaExtremidade com ext > 0 e 2 linhas entre as mesas): 1 linha de 2 parafusos
   * fora de cada mesa + 1 linha dentro de cada mesa; os 4 junto da mesa tracionada levam o binário. */
  function chapaExtremidade(p) {
    var g = gamas(), v = p.viga || {}, fub = num(p.parafuso && p.parafuso.fub, 825), fw = num(p.eletrodo && p.eletrodo.fw, 485);
    var fyV = num(p.acoViga && p.acoViga.fy, 345), esf = p.esforcos || [], melhor = null;
    /* aço da chapa: o pedido (padrão ASTM A36); se nenhum arranjo passar, ASTM A572 Gr.50 — a solda de penetração
       total da mesa vale pelo metal-base mais fraco, e a chapa em A36 costuma ser o limite */
    var ac0 = { id: (p.aco && p.aco.id) || "ASTM A36", fy: num(p.aco && p.aco.fy, 250), fu: num(p.aco && p.aco.fu, 400) }, acos = [ac0];
    if (ac0.fy < 345) acos.push({ id: "ASTM A572 Gr.50", fy: 345, fu: 450 });
    for (var ai = 0; ai < acos.length && !melhor; ai++) {
      /* para cada parafuso (M16 em diante) a chapa mais fina que passa; fica o menor parafuso com chapa ≤ 1,25·db
         (proporção usual: chapa espessa sem alavanca); se nenhum, a chapa mais fina */
      var cands = [];
      for (var di = 1; di < PARAF.length; di++) {
        for (var ti = 3; ti < CHAPAS.length; ti++) { var r = avaliar(PARAF[di], CHAPAS[ti], acos[ai]); if (r.ok) { cands.push(r); break; } }
      }
      melhor = cands.filter(function (c) { return c.dimensoes.t <= Math.max(1.25 * c.dimensoes.d, 16); })[0] || cands.slice().sort(function (a, b) { return a.dimensoes.t - b.dimensoes.t; })[0] || null;
      if (melhor && ai > 0) {
        var ref = avaliar(PARAF[3], CHAPAS[7], ac0);
        melhor.decisao = "Chapa em " + acos[ai].id + ": em " + ac0.id + " nenhum arranjo passa (governa: " + ref.governante + ").";
      }
    }
    if (!melhor) {
      melhor = avaliar(PARAF[PARAF.length - 1], CHAPAS[CHAPAS.length - 1], acos[acos.length - 1]);
      /* não coube na mesa do pilar com nenhum parafuso: diga a LARGURA de mesa que cabe (o menor parafuso que passa
         nas forças dá o menor gabarito) — o otimizador usa isso para trocar o pilar */
      if (p.pilar && p.tipo !== "cumeeira") {
        var bfMin = Infinity;
        for (var di2 = 1; di2 < PARAF.length; di2++) {
          var dd = PARAF[di2].d, FtRd2 = parafusoTracao(dd, fub), Ff2 = 0;
          esf.forEach(function (s2) { Ff2 = Math.max(Ff2, Math.abs(num(s2.M, 0)) * 1000 / (v.d - v.tf) + Math.max(0, num(s2.N, 0)) / 2); });
          if (Ff2 / 4 > FtRd2) continue;
          var gMin2 = Math.max(cima5(3 * dd), cima5(v.tw + 20 + 2 * dd), cima5(p.pilar.tw + 2 * num(p.pilar.r, 0) + 2.2 * dd));
          bfMin = Math.min(bfMin, gMin2 + 2 * bordaMin(dd, "laminada"));
        }
        if (/borda/.test(String(melhor.governante)) && isFinite(bfMin)) { melhor.bfMinPilar = bfMin; melhor.sugestao = "Pilar com mesa de pelo menos " + bfMin + " mm: os parafusos do joelho não cabem na mesa de " + br(p.pilar.bf, 0) + " mm (distância à borda, NBR 8800, Tabela 14)."; }
        else melhor.sugestao = "Mísula na viga (aumenta o braço do binário) ou mais linhas de parafusos.";
      } else melhor.sugestao = "Mísula na viga (aumenta o braço do binário) ou mais linhas de parafusos.";
    }
    return melhor;

    function avaliar(pf, tp, ac) {
      var fy = ac.fy;
      var d = pf.d, h = v.d - v.tf, eP = Math.max(cima5(bordaMin(d, "laminada")), 26), pfo = Math.max(cima5(1.5 * d), eP), ext = pfo + eP;
      /* gabarito: mínimo pela alma da viga e, no joelho, pela alma e raiz do pilar com a arruela; máximo pela borda da
         MESA DO PILAR (NBR 8800, Tabela 14) — na W 310 de mesa 101 mm, 2 × M20 por linha não cabiam (a tela achou) */
      var c0 = p.pilar && p.tipo !== "cumeeira" ? p.pilar : null, eMinC = c0 ? bordaMin(d, "laminada") : 0;
      var gMin = Math.max(cima5(3 * d), cima5(v.tw + 20 + 2 * d), c0 ? cima5(c0.tw + 2 * num(c0.r, 0) + 2.2 * d) : 0);
      var gMax = c0 ? Math.floor((c0.bf - 2 * eMinC) / 5) * 5 : Infinity;
      var gage = Math.min(Math.max(gMin, cima5(0.6 * v.bf)), Math.max(gMin, gMax)), bp = Math.max(v.bf, gage + 2 * eP);
      var pfi = Math.max(35, d + 8);                                                            /* 1ª linha interna: abaixo da mesa (como o desenho) */
      var nT = 4, nTot = 8;
      var FtRd = parafusoTracao(d, fub), FvRd = parafusoCisal(d, fub, true);
      var Tb = 0, Vb = 0, it = 0, Ff = 0, Vmax = 0, cg = {};
      esf.forEach(function (s) {
        var M = Math.abs(num(s.M, 0)), V = Math.abs(num(s.V, 0)), N = num(s.N, 0);
        var F = M * 1000 / h + Math.max(0, N) / 2, tb = F / nT, vb = V / nTot, i2 = sq(tb / FtRd) + sq(vb / FvRd);
        if (tb > Tb) { Tb = tb; cg.T = s.comb; } if (vb > Vb) { Vb = vb; cg.V = s.comb; } if (i2 > it) { it = i2; cg.i = s.comb; }
        Ff = Math.max(Ff, F); Vmax = Math.max(Vmax, V);
      });
      var nomeClasse = (p.parafuso && p.parafuso.id) || "ASTM A325";
      var vs = [];
      vs.push(verif("Parafusos à tração (" + nT + " junto da mesa tracionada, " + pf.id + " " + nomeClasse + ")", ED08 + ", 6.3.3.1",
        [passo("Força na mesa tracionada", "Ff = M/(d − tf) + N/2", br(Ff, 1) + " kN", "d − tf = " + br(h, 0) + " mm"), passo("Ft,Rd", "0,75·Ab·fub/γa2", br(FtRd, 1) + " kN"), passo("Ft,Sd por parafuso", "Ff/4", br(Tb, 1) + " kN", cg.T ? "combinação " + cg.T : "")], FtRd, Tb));
      vs.push(verif("Parafusos ao cisalhamento (" + nTot + ")", ED24 + ", 6.3.3.2 (Fv,Rd = 0,45·Ab·fub/γa2)", [passo("Fv,Rd", "", br(FvRd, 1) + " kN"), passo("Fv,Sd", "V/" + nTot, br(Vb, 1) + " kN")], FvRd, Vb));
      /* a cortante passa da chapa para os parafusos: a linha da ponta (chapa estendida) é empurrada para a borda —
         lf = eP − furo/2 na chapa; na mesa do pilar (contínua) vale o limite 2,4·db·t·fu; na cumeeira as duas chapas são iguais */
      var dhP = furoPadrao(d), lfP = eP - dhP / 2, fuC = num(p.acoPilar && p.acoPilar.fu, 450);
      var FcChapa = pressaoContato(d, tp, ac.fu, lfP), FcMesa = c0 ? pressaoContato(d, c0.tf, fuC, Infinity) : FcChapa, FcRd = Math.min(FcChapa, FcMesa);
      vs.push(verif("Pressão de contato dos parafusos (chapa t = " + br(tp, 1) + " mm" + (c0 ? "; mesa do pilar tf = " + br(c0.tf, 1) + " mm" : "") + ")", ED08 + ", 6.3.3.3",
        [passo("Na chapa, furo da ponta", "1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(FcChapa, 1) + " kN", "lf = eP − furo/2 = " + eP + " − " + br(dhP, 1) + "/2 = " + br(lfP, 1) + " mm"),
         c0 ? passo("Na mesa do pilar (sem borda na direção da força)", "2,4·db·tf·fu/γa2", br(FcMesa, 1) + " kN") : passo("Na outra chapa da emenda", "igual", br(FcMesa, 1) + " kN"),
         passo("Fv,Sd por parafuso", "V/" + nTot, br(Vb, 1) + " kN")], FcRd, Vb));
      /* rasgamento da linha da ponta (2 parafusos no gabarito g, borda eP): o bloco entre os furos ou os dois cantos de fora */
      var dhA = dhP + 2, ltR = Math.min(gage, bp - gage), rsg = rasgamento({ t: tp, fy: fy, fu: ac.fu, lv: 2 * eP, furosV: 1, lt: ltR, furosT: 1, dh: dhA, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da chapa na linha da ponta", ED08 + ", 6.5.6",
        [passo("Áreas", "Agv = 2·eP·t; Anv = 2·(eP − dh/2)·t; Ant = (" + (gage <= bp - gage ? "g" : "bp − g") + " − dh)·t", "Agv " + br(rsg.Agv, 0) + "; Anv " + br(rsg.Anv, 0) + "; Ant " + br(rsg.Ant, 0) + " mm²", "dh = furo + 2 = " + br(dhA, 1) + " mm (5.2.4.1)"),
         passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rsg.Rd, 1) + " kN", "= mín(" + br(rsg.R1, 1) + "; " + br(rsg.R2, 1) + ")"),
         passo("Força na linha", "2·Fv,Sd", br(2 * Vb, 1) + " kN")], rsg.Rd, 2 * Vb));
      vs.push(verif("Tração + cisalhamento nos parafusos", ED08 + ", 6.3.3.4", [passo("(Ft/FtRd)² + (Fv/FvRd)²", "", br(it, 3), cg.i ? "combinação " + cg.i : "")], 1, it, ""));
      /* chapa: cada parafuso é um T-stub de largura bp/2 e braço b' = pf − db/2 (sem alavanca) */
      var bl = Math.max(pfo, pfi) - d / 2, MsdB = Tb * 1000 * bl / (bp / 2), MRd = tp * tp * fy / 4 / g.a1;
      vs.push(verif("Chapa de extremidade à flexão (t = " + br(tp, 1) + " mm)", "T-stub sem efeito alavanca (chapa espessa — a favor do parafuso); a " + ED24 + " mudou o método da chapa (conferir)",
        [passo("Braço do parafuso", "b' = pf − db/2", br(bl, 0) + " mm"), passo("Momento por mm", "Ft,Sd·b'/(bp/2)", br(MsdB / 1000, 2) + " kN·m/m"), passo("Resistente por mm", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, MsdB / 1000, "kN·m/m"));
      /* solda das mesas da viga: filete dos dois lados; se não passar, penetração total (resistência da mesa) */
      var aF = Math.max(pernaMinima(Math.max(tp, v.tf)), 6), FwF = soldaFilete(aF, 2 * v.bf - v.tw, fw, Math.min(fy, fyV)), penTotal = Ff > FwF;
      var FmesaRd = v.bf * v.tf * Math.min(fy, fyV) / g.a1 / 1000;
      vs.push(verif("Solda da mesa tracionada na chapa (" + (penTotal ? "penetração total" : "filete " + aF + " mm nos dois lados") + ")", ED08 + ", 6.2.5 e Tabela 8",
        [passo("Força", "Ff", br(Ff, 1) + " kN"), passo(penTotal ? "Penetração total: resistência da mesa" : "Filete", penTotal ? "bf·tf·fy/γa1" : "0,60·Aw·fw/γw2", br(penTotal ? FmesaRd : FwF, 1) + " kN", penTotal ? "o filete (" + br(FwF, 1) + " kN) não basta" : "")],
        penTotal ? FmesaRd : FwF, Ff));
      var aA = Math.max(pernaMinima(Math.max(tp, v.tw)), 5), FwA = soldaFilete(aA, 2 * (v.d - 2 * v.tf), fw, Math.min(fy, fyV));
      vs.push(verif("Solda da alma da viga na chapa (filete " + aA + " mm nos dois lados)", ED08 + ", 6.2.5", [passo("Resistente", "0,60·0,707·a·L·fw/γw2", br(FwA, 1) + " kN")], FwA, Vmax));
      if (c0) {
        var bordaC = (c0.bf - gage) / 2;
        vs.push(verif("Furos na mesa do pilar: distância à borda (gabarito " + gage + " mm)", ED08 + ", 6.3.11 e Tabela 14 (borda laminada)",
          [passo("Distância disponível", "(bf − g)/2 = (" + br(c0.bf, 0) + " − " + gage + ")/2", br(bordaC, 1) + " mm"), passo("Mínima", "Tabela 14, " + pf.id, br(eMinC, 0) + " mm", bordaC < eMinC ? "não cabe: o gabarito mínimo (" + gMin + " mm) pede mesa de pelo menos " + br(gMin + 2 * eMinC, 0) + " mm" : "")],
          bordaC, eMinC, "mm"));
        vs[vs.length - 1].razao = bordaC > 0 ? eMinC / bordaC : Infinity;
      }
      var enrij = null, diagonal = null;
      if (p.pilar && p.tipo !== "cumeeira") {
        var c = p.pilar, fyc = num(p.acoPilar && p.acoPilar.fy, 345), k = c.tf + num(c.r, 0), ln = v.tf + 2 * aF + 2 * tp;
        var Rmesa = 0.5 * 6.25 * c.tf * c.tf * fyc / g.a1 / 1000;                                       /* a menos de 10·tf do topo: 50 % */
        var Rescoa = 1.10 * (2.5 * k + ln) * fyc * c.tw / g.a1 / 1000;                                   /* força no topo do pilar */
        var Renrug = 0.33 * c.tw * c.tw * (1 + 3 * (ln / c.d) * Math.pow(c.tw / c.tf, 1.5)) * Math.sqrt(E_ACO * fyc * c.tf / c.tw) / g.a1 / 1000;
        var Rloc = Math.min(Rmesa, Rescoa, Renrug), precisa = Ff > Rloc;
        var ts = CHAPAS.filter(function (t) { return t >= v.tf; })[0] || v.tf, bs = Math.floor((c.bf - c.tw) / 2 - 5);
        var passosL = [passo("Flexão local da mesa (a menos de 10·tf do topo)", "0,5·6,25·tf²·fy/γa1", br(Rmesa, 1) + " kN"),
                       passo("Escoamento local da alma (força no topo)", "1,10·(2,5k + ln)·fy·tw/γa1", br(Rescoa, 1) + " kN", "ln = tf + 2a + 2tp = " + br(ln, 0) + " mm"),
                       passo("Enrugamento da alma (no topo)", "0,33·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Renrug, 1) + " kN")];
        if (precisa) {
          var Renr = Rescoa + 2 * bs * ts * Math.min(fy, fyc) / g.a1 / 1000;
          enrij = { t: ts, b: bs, n: 2, texto: "par de enrijecedores " + bs + " × " + br(ts, 1) + " mm no pilar, na altura de cada mesa da viga" };
          passosL.push(passo("Com enrijecedores (" + enrij.texto + ")", "escoamento da alma + As·fy/γa1", br(Renr, 1) + " kN"));
          Rloc = Renr;
        }
        vs.push(verif("Mesa e alma do pilar sob a força da mesa da viga" + (precisa ? " — com enrijecedores" : ""), ED08 + ", 5.7 (forças localizadas)", passosL, Rloc, Ff));
        var VpRd = 0.60 * fyc * c.d * c.tw / g.a1 / 1000, passosP = [passo("Força no painel", "Ff = M/(d − tf)", br(Ff, 1) + " kN"), passo("Resistente da alma", "0,60·d·tw·fy/γa1", br(VpRd, 1) + " kN")];
        if (Ff > VpRd) {
          var cos = (c.d - c.tf) / Math.sqrt(sq(c.d - c.tf) + sq(h)), Vd = VpRd + 2 * bs * ts * Math.min(fy, fyc) * cos / g.a1 / 1000;
          diagonal = { t: ts, b: bs, texto: "enrijecedor diagonal " + bs + " × " + br(ts, 1) + " mm (par) no painel do joelho" };
          passosP.push(passo("Com " + diagonal.texto, "+ 2·b·t·fy·cosθ/γa1", br(Vd, 1) + " kN"));
          VpRd = Vd;
        }
        vs.push(verif("Painel da alma do pilar ao cisalhamento" + (diagonal ? " — com diagonal" : ""), ED08 + ", 5.7 — Vpl = 0,60·d·tw·fy/γa1 (sem a parcela da força axial)", passosP, VpRd, Ff));
      }
      var fe = fecha(vs), H = v.d + 2 * ext;
      return {
        ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: p.tipo,
        dimensoes: { t: tp, largura: bp, altura: H, aco: ac.id, parafuso: pf.id, d: d, classe: nomeClasse, n: nTot, gage: gage, ext: ext, borda: eP, soldaMesa: penTotal ? "penetração total" : "filete " + aF + " mm", soldaAlma: aA, enrijecedores: enrij, diagonal: diagonal },
        desenho: { t: tp / 1000, parafuso: pf.id, classe: /8\.8/.test(nomeClasse) ? "8.8" : "A325", ext: ext / 1000, linhas: 2, gage: gage / 1000, largura: bp / 1000, borda: eP },
        resumo: (p.tipo === "cumeeira" ? "Cumeeira" : "Joelho") + ": chapa " + br(bp, 0) + " × " + br(H, 0) + " × " + br(tp, 1) + " mm (" + ac.id + "), " + nTot + " parafusos " + pf.id + " " + nomeClasse + "; solda das mesas " + (penTotal ? "de penetração total" : "de filete " + aF + " mm") + (enrij ? "; " + enrij.texto : "") + (diagonal ? "; " + diagonal.texto : ""),
        verificacoes: vs
      };
    }
  }

  /* ================================================================ CLIP DE TERÇA
   * p = { terca: { t (alma, mm), fu (MPa) }, reacao: { normal (kN, para baixo, ⊥ à água), cima (kN, sucção),
   *       paralela (kN, ao longo da água — a parte que as correntes não levam) }, parafuso: { id, fub },
   *       aco: { fy } (clip), viga: { tf } (mesa onde o clip é soldado), eletrodo: { fw } }
   * Arranjo do desenho (BimMetalLig.clipTerca): cantoneira L 76 soldada na mesa da viga (filete dos dois
   * lados), 2 ou 3 parafusos em linha na alma da terça, a h ≈ 0,55·aba do pé; comprimento
   * La = (n − 1)·passo + 2·borda. As forças ⊥ à água ficam no plano da aba vertical (cisalhamento nos
   * parafusos); a componente PARALELA à água flete a aba vertical no pé. */
  function clipTerca(p) {
    var g = gamas(), tT = num(p.terca && p.terca.t, 2), fuT = num(p.terca && p.terca.fu, 410), fub = num(p.parafuso && p.parafuso.fub, 415), fy = num(p.aco && p.aco.fy, 250), fw = num(p.eletrodo && p.eletrodo.fw, 485);
    var Rn = Math.max(Math.abs(num(p.reacao && p.reacao.normal, num(p.reacao && p.reacao.baixo, 0))), Math.abs(num(p.reacao && p.reacao.cima, 0))), Rp = Math.abs(num(p.reacao && p.reacao.paralela, 0));
    var R = Math.sqrt(Rn * Rn + Rp * Rp), tfV = num(p.viga && p.viga.tf, 8), Rc = Math.abs(num(p.reacao && p.reacao.cima, 0)), fuC = num(p.aco && p.aco.fu, 400);
    var cats = [{ cat: "L76X76X6.4", a: 76, t: 6.35 }, { cat: "L76X76X7.9", a: 76, t: 7.94 }, { cat: "L76X76X9.5", a: 76, t: 9.53 }], melhor = null, ultimo = null;
    var nomeClasse = (p.parafuso && p.parafuso.id) || "ASTM A307";
    [{ id: "M12", d: 12 }, { id: "M16", d: 16 }].forEach(function (pf) {
      [2, 3].forEach(function (n) {
        cats.forEach(function (ct) {
          if (melhor) return;
          var d = pf.d, passoB = cima5(3 * d), bordaS = Math.max(25, cima5(1.75 * d)), La = (n - 1) * passoB + 2 * bordaS, h = cima5(0.55 * ct.a);
          var FvRd = parafusoCisal(d, fub, true), Fb = R / n, fino = tT < 4.75;
          var FcRd = fino ? esmagamento14762(d, tT, fuT) : pressaoContato(d, tT, fuT, bordaS - (d + 1.5) / 2);
          var Mleg = Rp * h / 1000, MRd = La * ct.t * ct.t / 4 * fy / g.a1 / 1e6;
          var aW = Math.max(pernaMinima(Math.max(ct.t, tfV)), 5), FwRd = soldaFilete(aW, 2 * La, fw, Math.min(fy, 250));
          /* sucção: a terça puxa os parafusos para a borda livre de cima da aba (et = aba − h) */
          var dhC = furoPadrao(d), etC = ct.a - h, FcAba = pressaoContato(d, ct.t, fuC, etC - dhC / 2), FbC = Rc / n;
          var rsgC = n > 1 ? rasgamento({ t: ct.t, fy: fy, fu: fuC, lv: 2 * etC, furosV: 1, lt: (n - 1) * passoB, furosT: n - 1, dh: dhC + 2, Cts: 1 }) : null;
          var vs = [
            verif("Parafusos do clip ao cisalhamento (" + n + " × " + pf.id + ")", ED24 + ", 6.3.3.2",
              [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(FvRd, 1) + " kN"), passo("Fv,Sd por parafuso", "√(R⊥² + R∥²)/" + n, br(Fb, 2) + " kN", "R⊥ = " + br(Rn, 2) + " kN; R∥ = " + br(Rp, 2) + " kN")], FvRd, Fb),
            verif("Pressão de contato na alma da terça (t = " + br(tT, 2) + " mm)", fino ? ED14762 + ", ligações parafusadas — esmagamento Fc,Rd = αe·d·t·fu/γ (αe = 0,183t + 1,53; γ = 1,55; conferir o item)" : ED08 + ", 6.3.3.3",
              [passo("Fc,Rd por parafuso", fino ? "(0,183·" + br(tT, 2) + " + 1,53)·" + d + "·" + br(tT, 2) + "·" + fuT + "/1,55" : "1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(FcRd, 2) + " kN")], FcRd, Fb),
            verif("Aba vertical do clip à flexão (" + ct.cat + " × " + La + " mm)", "balanço no pé, braço h = " + h + " mm; t²·fy/4/γa1 na largura La",
              [passo("Momento", "R∥·h", br(Mleg, 3) + " kN·m"), passo("Resistente", "La·t²·fy/(4·γa1)", br(MRd, 3) + " kN·m")], MRd, Mleg, "kN·m"),
            verif("Solda do clip na viga (filete " + aW + " mm, 2 × " + La + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "0,60·0,707·a·L·fw/γw2 (ou metal-base)", br(FwRd, 1) + " kN")], FwRd, R)
          ];
          if (Rc > 0) {
            vs.push(verif("Pressão de contato na aba do clip sob sucção (borda de cima a " + etC + " mm)", ED08 + ", 6.3.3.3",
              [passo("Fc,Rd por parafuso", "1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(FcAba, 2) + " kN", "lf = " + etC + " − " + br(dhC, 1) + "/2 = " + br(etC - dhC / 2, 1) + " mm; t = " + br(ct.t, 2) + " mm"),
               passo("Por parafuso", "R↑/" + n, br(FbC, 2) + " kN", "R↑ = " + br(Rc, 2) + " kN")], FcAba, FbC));
            if (rsgC) vs.push(verif("Colapso por rasgamento da aba do clip sob sucção", ED08 + ", 6.5.6",
              [passo("Áreas", "Agv = 2·et·t; Anv = 2·(et − dh/2)·t; Ant = (n − 1)·(s − dh)·t", "Agv " + br(rsgC.Agv, 0) + "; Anv " + br(rsgC.Anv, 0) + "; Ant " + br(rsgC.Ant, 0) + " mm²", "dh = furo + 2 = " + br(dhC + 2, 1) + " mm (5.2.4.1)"),
               passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rsgC.Rd, 1) + " kN", "= mín(" + br(rsgC.R1, 1) + "; " + br(rsgC.R2, 1) + ")")], rsgC.Rd, Rc));
          }
          var fe = fecha(vs);
          ultimo = { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "clip", dimensoes: { cat: ct.cat, comprimento: La, parafuso: pf.id, n: n, classe: nomeClasse, solda: aW, h: h },
                     desenho: { cat: ct.cat, parafuso: pf.id, parafusos: n, comprimento: La / 1000 },
                     resumo: "Clip " + ct.cat.replace(/X/g, " × ").replace(/^L/, "L ").replace(/(\d)\.(\d)/g, "$1,$2") + " × " + La + " mm soldado na viga (filete " + aW + " mm), " + n + " parafusos " + pf.id + " " + nomeClasse + " na alma da terça", verificacoes: vs };
          if (fe.ok) melhor = ultimo;
        });
      });
    });
    if (!melhor) { ultimo.sugestao = "Terça com alma mais espessa (a pressão de contato governa), correntes para tirar a força paralela à água ou clip duplo."; return ultimo; }
    return melhor;
  }

  /* ================================================================ CONTRAVENTO (barra redonda)
   * p = { d (mm), N (kN, tração), barra: { fy, fu }, chapa: { fy }, eletrodo: { fw } }
   * Detalhe: a barra passa por furo numa chapa de apoio soldada ao pilar/viga, com arruela biselada,
   * porca e contraporca; a força da porca flete a chapa em balanço. */
  function contravento(p) {
    var g = gamas(), d = num(p.d, 12.5), N = Math.abs(num(p.N, 0)), fu = num(p.barra && p.barra.fu, 400), fy = num(p.barra && p.barra.fy, 250), fyC = num(p.chapa && p.chapa.fy, 250), fw = num(p.eletrodo && p.eletrodo.fw, 485);
    var Rfuste = Ab(d) * fy / g.a1 / 1000, Rrosca = 0.75 * Ab(d) * fu / g.a2 / 1000;
    /* braço do furo à solda: a porca e a arruela biselada têm de caber com a barra inclinada (~45°) sem bater no pilar —
       com 0,75·d + 10 (25 mm no Ø 16) a porca batia (folga −21 mm, achado das pranchas em 12/10/2026) */
    var e = cima5(2 * d + 25), b = cima5(4 * d + 20), tc = null, MRd = 0;   /* b cresce com o braço (abaixo): chapa mais larga em vez de mais grossa */
    /* com o ângulo da barra (α, graus, com a linha da chapa): a contraporca girando não pode tocar o pilar —
       e ≥ (folga + t·cos α)/sen α + d/2, t = arruela biselada + 2 porcas + 3 fios ≈ 10 + 2,05·d (as pranchas mediram
       a folga de ~1 mm com Ø 12,5 a 40° e e = 50) */
    var alfa = num(p.alfa, 0);
    if (alfa > 5 && alfa < 85) { var ar = alfa * Math.PI / 180, tPil = 10 + 2.05 * d; e = Math.max(e, cima5((5 + tPil * Math.cos(ar)) / Math.sin(ar) + d / 2)); }
    b = Math.max(b, cima5(2.5 * e));   /* faixa que trabalha à flexão ≈ 2,5 × o braço (a 50 mm ela parava com Ø 25 — a tela achou) */
    for (var i = 0; i < CHAPAS.length; i++) { MRd = b * CHAPAS[i] * CHAPAS[i] / 4 * fyC / g.a1 / 1e6; if (N * e / 1000 <= MRd) { tc = CHAPAS[i]; break; } }
    if (tc == null) tc = CHAPAS[CHAPAS.length - 1];
    var aW = Math.max(pernaMinima(tc), 5), FwRd = soldaFilete(aW, 2 * b, fw, fyC);
    var vs = [
      verif("Barra: escoamento do fuste (Ø " + br(d, 1) + " mm)", ED08 + ", 5.2.2 (Ag·fy/γa1)", [passo("", "", br(Rfuste, 1) + " kN")], Rfuste, N),
      verif("Barra: ruptura na rosca", ED08 + ", 6.3.3.1 (0,75·Ab·fu/γa2)", [passo("", "", br(Rrosca, 1) + " kN")], Rrosca, N),
      verif("Chapa de apoio da porca à flexão (" + b + " × " + br(tc, 1) + " mm)", "balanço de " + e + " mm, t²·fy/4/γa1 na largura b", [passo("Momento", "N·e", br(N * e / 1000, 3) + " kN·m"), passo("Resistente", "", br(MRd, 3) + " kN·m")], MRd, N * e / 1000, "kN·m"),
      verif("Solda da chapa de apoio (filete " + aW + " mm, 2 × " + b + " mm)", ED08 + ", 6.2.5", [passo("", "", br(FwRd, 1) + " kN")], FwRd, N)
    ];
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "contravento", dimensoes: { d: d, chapa: { b: b, t: tc, e: e }, solda: aW, alfa: alfa || null },
             resumo: "Barra redonda Ø " + br(d, 1) + " mm com rosca, arruela biselada, porca e contraporca; chapa de apoio " + b + " × " + br(tc, 1) + " mm soldada (filete " + aW + " mm)",
             verificacoes: vs, sugestao: fe.ok ? null : "Diâmetro maior da barra ou cantoneira no lugar da barra redonda." };
  }

  /* ================================================================ MÃO-FRANCESA
   * Contenção nodal da mesa comprimida (a de baixo da viga, a de dentro do pilar), presa na terça/travessa.
   * Força e rigidez da contenção nodal de viga: AISC 360-16, Apêndice 6.3.2b —
   *   Prb = 0,02·Mr·Cd/ho;  βbr = 10·Mr·Cd/(φ·Lbr·ho), φ = 0,75;  Cd = 2 (a favor: sem localizar o ponto de inflexão).
   * A mão-francesa (a 45°) leva Prb/cos θ; a rigidez lateral que ela dá é E·A·cos²θ/L.
   * Cantoneira simples ligada por uma aba, comprimida: esbeltez efetiva do AISC 360-16, E5
   *   (L/rx ≤ 80: 72 + 0,75·L/rx; > 80: 32 + 1,25·L/rx ≤ 200) e χ, Aef pelo método da NBR 8800:2024 (5.3).
   * Tração: Ag·fy/γa1 e, na seção do furo, só a aba ligada: Ae = (b − dh)·t, Ae·fu/γa2 (a favor).
   * Ligação: 1 ou 2 parafusos em cada ponta — cisalhamento, pressão de contato na cantoneira, na alma da terça/travessa
   *   (NBR 14762 se fina) e na chapa de ligação soldada à mesa (filete dos dois lados).
   * p = { Mr (kN·m), ho (mm), Lbr (m), L (mm), cos, aco {fy, fu}, parafuso {id, fub}, apoio {t, fu} (alma da terça),
   *       perfis (nomes; padrão L 51 até L 102), eletrodo {fw}, mesa {tf} } */
  var PERFIS_MF = ["L51X51X4.8", "L64X64X4.8", "L51X51X6.4", "L64X64X6.4", "L76X76X6.4", "L89X89X6.4", "L102X102X6.4"];
  function maoFrancesa(p) {
    var g = gamas(), E = E_ACO, Mr = Math.abs(num(p.Mr, 0)), ho = num(p.ho, 300), Cd = 2, Lbr = Math.max(num(p.Lbr, 1.5), 0.3) * 1000, Lm = num(p.L, 600), cs = num(p.cos, Math.SQRT1_2);
    var fy = num(p.aco && p.aco.fy, 250), fu = num(p.aco && p.aco.fu, 400), fub = num(p.parafuso && p.parafuso.fub, 800), nomeP = (p.parafuso && p.parafuso.id) || "ISO 898-1 classe 8.8";
    var tA = num(p.apoio && p.apoio.t, 2.0), fuA = num(p.apoio && p.apoio.fu, 410), fw = num(p.eletrodo && p.eletrodo.fw, 485), tfM = num(p.mesa && p.mesa.tf, 8);
    var Fbr = 0.02 * Mr * 1000 * Cd / ho, N = Fbr / cs, betaReq = 10 * Mr * 1e6 * Cd / (0.75 * Lbr * ho);
    var C = Cat(), nomes = arr0(p.perfis).length ? arr0(p.perfis) : PERFIS_MF, melhor = null, ultimo = null;
    function arr0(v) { return Array.isArray(v) ? v : []; }
    for (var ip = 0; ip < nomes.length && !melhor; ip++) {
      var c = C && C.obter ? C.obter(nomes[ip]) : null; if (!c || !(c.A > 0)) continue;
      var a = Math.max(num(c.a, 0), num(c.b, 0)), t = num(c.t, 0), A = c.A, rx = Math.sqrt(Math.min(num(c.Ix, 0), num(c.Iy, c.Ix)) / A);
      var lr = Lm / rx, lef = Math.min(200, lr <= 80 ? 72 + 0.75 * lr : 32 + 1.25 * lr), Fe = Math.PI * Math.PI * E / (lef * lef), l0 = Math.sqrt(fy / Fe);
      var chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0), lim = 0.45 * Math.sqrt(E / fy), bt = a / t, Aef = A;
      if (bt > lim / Math.sqrt(chi)) { var sel = Math.pow(1.49 * lim / bt, 2) * fy, rq = Math.sqrt(sel / (chi * fy)), be = Math.max(0, Math.min(a, a * (1 - 0.22 * rq) * rq)); Aef = A - 2 * (a - be) * t; }
      var NcRd = chi * Aef * fy / g.a1 / 1000, beta = E * A * cs * cs / Lm;
      [[1, 12], [1, 16], [2, 12], [2, 16]].forEach(function (q) {
        if (melhor) return;
        var n = q[0], d = q[1], dh = furoPadrao(d), eB = cima5(bordaMin(d, "laminada")), sB = cima5(3 * d);
        var Ae = (a - (dh + 2)) * t, NtRd = Math.min(A * fy / g.a1, Ae * fu / g.a2) / 1000;
        var FvRd = n * parafusoCisal(d, fub, true);
        var FcL = n * pressaoContato(d, t, fu, n > 1 ? Math.min(eB - dh / 2, sB - dh) : eB - dh / 2);
        var FcA = n * (tA < 4.75 ? esmagamento14762(d, tA, fuA) : pressaoContato(d, tA, fuA, Infinity));
        var tg = CHAPAS.filter(function (x) { return x >= Math.max(6.3, t); })[0] || 6.3, bg = cima5((n - 1) * sB + 2 * eB + 10), FcG = n * pressaoContato(d, tg, 400, eB - dh / 2);
        var aW = Math.max(pernaMinima(Math.max(tg, tfM)), 3), FwRd = soldaFilete(aW, 2 * bg, fw, 250);
        var vs = [
          verif("Força na contenção nodal (mesa comprimida)", "AISC 360-16, Apêndice 6.3.2b (Cd = 2, a favor)",
            [passo("Prb", "0,02·Mr·Cd/ho", br(Fbr, 2) + " kN", "Mr = " + br(Mr, 1) + " kN·m; ho = " + br(ho, 0) + " mm"), passo("Na mão-francesa", "Prb/cos θ", br(N, 2) + " kN", "θ = " + br(Math.acos(cs) * 180 / Math.PI, 0) + "°")], NcRd, N),
          verif("Rigidez da contenção", "AISC 360-16, Apêndice 6.3.2b (φ = 0,75)",
            [passo("βbr exigida", "10·Mr·Cd/(φ·Lbr·ho)", br(betaReq, 0) + " N/mm", "Lbr = " + br(Lbr / 1000, 2) + " m"), passo("Dada pela mão-francesa", "E·A·cos²θ/L", br(beta, 0) + " N/mm", "L = " + br(Lm, 0) + " mm")], beta, betaReq, "N/mm"),
          verif("Cantoneira " + nomes[ip] + " à compressão (ligada por uma aba)", "AISC 360-16, E5 (esbeltez efetiva) e " + ED24 + ", 5.3 (χ, Aef)",
            [passo("Esbeltez", "L/rx = " + br(lr, 1) + " → KL/r = " + (lr <= 80 ? "72 + 0,75·L/rx" : "32 + 1,25·L/rx"), br(lef, 1)), passo("χ", "λ0 = " + br(l0, 3), br(chi, 3)), passo("Nc,Rd", "χ·Aef·fy/γa1", br(NcRd, 1) + " kN", "Aef = " + br(Aef, 0) + " mm²")], NcRd, N),
          verif("Cantoneira à tração (só a aba ligada na seção do furo)", ED08 + ", 5.2", [passo("Nt,Rd", "mín(Ag·fy/γa1; (b − dh)·t·fu/γa2)", br(NtRd, 1) + " kN")], NtRd, N),
          verif("Esbeltez da cantoneira comprimida", "KL/r ≤ 200", [passo("KL/r", "", br(lef, 0))], 200, lef, ""),
          verif("Parafusos ao cisalhamento (" + n + " × M" + d + " em cada ponta)", ED24 + ", 6.3.3.2", [passo("Fv,Rd", n + "·0,45·Ab·fub/γa2", br(FvRd, 1) + " kN")], FvRd, N),
          verif("Pressão de contato na cantoneira (t = " + br(t, 2) + " mm)", ED08 + ", 6.3.3.3", [passo("Fc,Rd", n + "·1,2·lf·t·fu/γa2 (borda " + eB + " mm)", br(FcL, 1) + " kN")], FcL, N),
          verif("Pressão de contato na alma da terça/travessa (t = " + br(tA, 2) + " mm)", tA < 4.75 ? ED14762 + " — esmagamento αe·d·t·fu/1,55" : ED08 + ", 6.3.3.3", [passo("Fc,Rd", "", br(FcA, 2) + " kN")], FcA, N),
          verif("Chapa de ligação na mesa (" + bg + " × " + br(tg, 1) + " mm): pressão de contato", ED08 + ", 6.3.3.3", [passo("Fc,Rd", "", br(FcG, 1) + " kN")], FcG, N),
          verif("Solda da chapa de ligação na mesa (filete " + aW + " mm, 2 × " + bg + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "0,60·0,707·a·L·fw/γw2 (ou metal-base)", br(FwRd, 1) + " kN")], FwRd, N)
        ];
        var fe = fecha(vs);
        ultimo = { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "maoFrancesa",
                   dimensoes: { perfil: nomes[ip], massa: num(c.massa, null), L: Math.round(Lm), parafuso: "M" + d, n: n, classe: nomeP, chapa: { b: bg, t: tg }, solda: aW },
                   forcas: { Prb: Fbr, N: N, betaExigida: betaReq, betaDada: beta, Cd: Cd },
                   desenho: { perfil: nomes[ip], parafuso: "M" + d, parafusos: n, chapa: { b: bg / 1000, t: tg / 1000 } },
                   resumo: "Mão-francesa " + nomes[ip].replace(/X/g, " × ").replace(/^L/, "L ").replace(/(\d)\.(\d)/g, "$1,$2") + " (L ≈ " + br(Lm / 1000, 2) + " m, 45°), " + n + " parafuso" + (n > 1 ? "s" : "") + " M" + d + " " + nomeP + " em cada ponta; chapa " + bg + " × " + br(tg, 1) + " mm soldada na mesa (filete " + aW + " mm)",
                   verificacoes: vs };
        if (fe.ok) melhor = ultimo;
      });
    }
    if (!melhor) { if (ultimo) ultimo.sugestao = "Cantoneira maior, mão-francesa dupla ou travar a mesa com outra contenção (viga de travamento)."; return ultimo; }
    return melhor;
  }

  var AcoLigCalc = { opcoes: OPC, placaBase: placaBase, chapaExtremidade: chapaExtremidade, clipTerca: clipTerca, contravento: contravento, maoFrancesa: maoFrancesa,
                     parafusoTracao: parafusoTracao, parafusoCisal: parafusoCisal, pressaoContato: pressaoContato, esmagamento14762: esmagamento14762,
                     soldaFilete: soldaFilete, concreto: concreto, rasgamento: rasgamento, furoPadrao: furoPadrao, pernaMinima: pernaMinima, CHAPAS: CHAPAS, PARAF: PARAF, CHUMB: CHUMB };
  global.AcoLigCalc = AcoLigCalc;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigCalc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

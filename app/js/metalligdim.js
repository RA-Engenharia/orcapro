/* =====================================================================
 * metalligdim.js — DIMENSIONAMENTO DAS LIGAÇÕES da estrutura gerada por
 * "Pórticos industriais" (motor PURO, ES5, sem DOM, Node-testável). 21/11/2026.
 *
 * Pedido do Rogério: o sistema DIMENSIONA sozinho, pela NBR 8800:2008, todas
 * as ligações — com os esforços do cálculo (envoltória das combinações
 * ÚLTIMAS) de cada ligação — e o número de parafusos vira RESULTADO do
 * cálculo (vai para o modelo 3D e para a lista de montagem).
 *
 *   verificar(r, op) — r = resultado do AcoDimLivre.calcular (r.modelo.membros,
 *     r.analise.combinacoes, r.nosChapa); op = { fck (MPa, padrão 25 — decisão
 *     do Rogério 21/11 para o Pedido Gabriel), ligacao ("parafusada"|"soldada"|
 *     "padrao"), ligMaoFrancesa, chumbador (aço) }
 *   → { ligacoes[], n, reprovados, pior, resumo, cobertos{}, naoDim[],
 *       modelo: { porBarra{barraId: {n, id, classe}}, placas{chave: {...}} },
 *       pendencias[], premissas }
 *
 * O QUE DIMENSIONA (cada ligação com a memória: passos, solicitante/resistente):
 *   1. LIGAÇÃO PARAFUSADA por barra (nó de treliça 2L com chapa — só com
 *      ligação "parafusada" —, mão-francesa parafusada, ponta de escora/pilar
 *      de tapamento por chapa de ligação): cisalhamento por plano de corte com
 *      a rosca no plano (6.3.3.2), pressão de contato/rasgamento na chapa e no
 *      perfil (6.3.3.3), seção líquida com Ct (5.2.3/5.2.5), colapso por
 *      rasgamento (6.5.6), espaçamento 3·db (6.3.9) e borda da Tabela 14
 *      (6.3.11). Mínimo de 2 parafusos. Diâmetro e classe: do catálogo
 *      (js/metalnorma.js PARAFUSOS + js/acomateriais.js Tabela A.3), o MENOR
 *      que passa com até N_MAX parafusos na linha.
 *   2. CLIP DE TERÇA: js/acoligcalc.js clipTerca (2008) com a reação da ponta
 *      da terça e a força de escora dela.
 *   3. CONTRAVENTO / CORRENTE em barra redonda: js/acoligcalc.js contravento
 *      (fuste, rosca, chapa de apoio da porca, solda).
 *   4. PLACA DE BASE + CHUMBADORES: pilar simples → js/acoligcalc.js placaBase
 *      (rotulada); coluna treliçada plana ou espacial → placaColuna() daqui —
 *      UMA placa por coluna, UM chumbador por montante (o desenho do
 *      js/metalligacao.js placaBaseColuna): pressão no concreto (6.6.1, fck 25),
 *      flexão da placa (AISC Design Guide 1, momento plástico t²·fy/4 com γa1),
 *      tração e cisalhamento no chumbador (6.3.3.1/6.3.3.2/6.3.3.4 — o
 *      atrito NÃO é usado, a favor), solda do montante na placa (6.2.5),
 *      ancoragem por aderência (ABNT NBR 6118:2014, 9.3.2.1 e 9.4.2.4/9.4.2.5 —
 *      barra lisa com gancho, η1 = 1,0, α = 0,7).
 *   5. MÃO-FRANCESA SOLDADA: o cordão (filete no calcanhar e na ponta da aba,
 *      6.2.5, Tabela 10, 6.2.6.2) e a seção líquida com Ct = 1 − ec/Lw (5.2.5).
 *   6. FLEXÃO DA ALMA DO U da coluna sob a chapa de nó (força ⊥ à alma):
 *      plastificação da face — AISC 360-16 Tabela K1.2 (placa longitudinal),
 *      ANALOGIA (a NBR 8800 não trata), Rd = Rn/γa1, Qf de K1.3.
 * Os coeficientes da NBR 8800 vêm de js/metalnorma.js LIGDIM (lugar único,
 * "conferir no texto" — a biblioteca da RA não tem a norma).
 * Teste: node tools/test-metal-ligdim.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function N() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function LC() { return dep("AcoLigCalc", "./acoligcalc.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(v) { return v * v; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cima5(v) { return Math.ceil(v / 5 - 1e-9) * 5; }
  function cima10(v) { return Math.ceil(v / 10 - 1e-9) * 10; }
  function Ab(d) { return Math.PI * d * d / 4; }
  function G() { var M = Mat(); return M ? M.GAMA : { a1: 1.10, a2: 1.35, w1: 1.25, w2: 1.35, c: 1.4, n: 1.4 }; }
  function K(k) { var L = N() && N().LIGDIM; return L && L[k] ? L[k].v : null; }
  function IT(k) { var Nn = N(); return Nn && Nn.itemLig ? Nn.itemLig(k) : "ABNT NBR 8800:2008 (conferir no texto)"; }

  var FW = 485;                                  /* E70XX — o mesmo do js/metalchapano.js */
  var N_MAX = 4;                                 /* parafusos numa linha (acima disso: diâmetro/classe maior) */
  var T_GUSSET = 8;                              /* chapa de ligação das pontas rotuladas (mm) — a mesma do nó (p.chapaNo) */
  var T_CHAPA_MF = 6.35;                         /* a chapa da mão-francesa do modelo (js/metalparafusos.js) */
  var CHAPA = { fy: 250, fu: 400, id: "ASTM A36" };
  var CLASSES = [{ id: "8.8", nome: "ISO 4016 classe 8.8", fub: 800 }, { id: "10.9", nome: "ISO 4016 classe 10.9", fub: 1000 }];
  var DIAMS = ["M12", "M16", "M20", "M24"];
  var PLACAS = [12.5, 16, 19, 22.4, 25, 31.5, 37.5, 44.5, 50];
  var CHUMB = [{ id: "5/8\"", d: 15.875 }, { id: "3/4\"", d: 19.05 }, { id: "7/8\"", d: 22.225 }, { id: "1\"", d: 25.4 }, { id: "1.1/8\"", d: 28.575 }, { id: "1.1/4\"", d: 31.75 }];
  var FCK_PADRAO = 25, FONTE_FCK = "fck 25 MPa da fundação — decisão do Rogério (21/11/2026, Pedido Gabriel)";

  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos || [], resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0) }; }
  function fecha(vs) { var rz = 0, gov = null; vs.forEach(function (v) { if (v.razao > rz) { rz = v.razao; gov = v.nome; } }); return { razao: rz, governante: gov, ok: rz <= 1 + 1e-9 }; }

  /* ------------------------------------------------ resistências NBR 8800:2008 (kN) */
  function FvRd(d, fub, planos) { return planos * K("cisalRosca") * Ab(d) * fub / G().a2 / 1000; }
  function FtRd(d, fub) { return K("tracao") * Ab(d) * fub / G().a2 / 1000; }
  function FcRd(d, t, fu, lf) { return Math.min(K("contato1") * lf * t * fu, K("contato2") * d * t * fu) / G().a2 / 1000; }
  /* NBR 14762:2010 — esmagamento em chapa fina (o mesmo do js/acoligcalc.js esmagamento14762; αe ≤ 3,0) */
  function Esm14762(d, t, fu) { return Math.min(3, 0.183 * t + 1.53) * d * t * fu / 1.55 / 1000; }
  function dwMin(t) { return t <= 6.35 ? 3 : t <= 12.5 ? 5 : t <= 19 ? 6 : 8; }       /* Tabela 10, parte menos espessa */
  function soldaMm(dw, fyBase, tBase) { var g = G(); return Math.min(0.6 * FW * 0.707 * dw / g.w2, 0.6 * fyBase * Math.min(dw, tBase) / g.a1) / 1000; }   /* kN/mm por filete */
  function sigmaC(fck, A2A1) { var g = G(), r = Math.min(2, Math.sqrt(Math.max(1, num(A2A1, 1)))); return Math.min(fck * r / (g.c * g.n), fck / g.c); }

  /* ------------------------------------------------ esforços do cálculo (envoltória ELU) */
  function combsELU(r) { var C = (r.analise && r.analise.combinacoes) || {}; return Object.keys(C).filter(function (k) { return !/^caso_/.test(k) && !/ELS|serv|freq|qp|rara/i.test(k) && C[k] && C[k].barras; }); }
  /* por combinação: as estações da ponta "a" (início do 1º segmento) e "b" (fim do último) */
  function pontas(r, m, k) {
    var cb = r.analise.combinacoes[k], sg = arr(m.segs), b0 = cb.barras[sg[0]], b1 = cb.barras[sg[sg.length - 1]];
    var ea = b0 && !b0.inativa ? arr(b0.estacoes)[0] : null, eb = b1 && !b1.inativa ? arr(b1.estacoes)[arr(b1.estacoes).length - 1] : null;
    return { a: ea, b: eb };
  }
  function env(r, m) {
    var o = { Nt: 0, Nc: 0, Vy: 0, Vz: 0, V: 0, combN: "", combV: "" };
    combsELU(r).forEach(function (k) {
      var cb = r.analise.combinacoes[k];
      arr(m.segs).forEach(function (s) { var b = cb.barras[s]; if (!b || b.inativa) return; arr(b.estacoes).forEach(function (e) { var n = num(e.N, 0); if (n > o.Nt) { o.Nt = n; o.combN = k; } if (-n > o.Nc) { o.Nc = -n; o.combN = k; } }); });
      var p = pontas(r, m, k);
      [p.a, p.b].forEach(function (e) { if (!e) return; var vy = Math.abs(num(e.Vy, 0)), vz = Math.abs(num(e.Vz, 0)); if (vy > o.Vy) o.Vy = vy; if (vz > o.Vz) o.Vz = vz; var v = Math.sqrt(vy * vy + vz * vz); if (v > o.V) { o.V = v; o.combV = k; } });
    });
    o.N = Math.max(o.Nt, o.Nc);
    return o;
  }

  function sec(m) { return (m.secao && m.secao.mm) || {}; }
  function grupoDe(m) { return (m.calc && m.calc.grupoTip) || ""; }
  function aco(m) { return { fy: num(m.aco && m.aco.fy, 250), fu: num(m.aco && m.aco.fu, 400) }; }

  /* ================================================================ 1. LIGAÇÃO PARAFUSADA GENÉRICA
   * o = { nome, N (kN, o maior |N| ou a resultante), Nt (tração, kN), planos (1 | 2),
   *       partes: [{ papel, t, fy, fu, conta (quantas chapas iguais), lt (mm: do furo à borda transversal, para o bloco) | ltFn(d) }],
   *       perfil: { A, t, xc, abas, b } (seção líquida da barra) | null, aba: { b, t } (o furo tem de caber no gage) | null,
   *       diametros, classes, nMax } */
  function parafusada(o) {
    var Nn = N(), g = G(), dias = arr(o.diametros).length ? o.diametros : DIAMS, cls = arr(o.classes).length ? o.classes : CLASSES, nMax = num(o.nMax, N_MAX);
    var Nd = Math.abs(num(o.N, 0)), Nt = Math.max(0, num(o.Nt, 0)), ult = null, tentou = [];
    for (var i = 0; i < dias.length; i++) {
      var P = Nn.parafuso(dias[i]); if (!P) continue;
      var d = P.d, dh = Nn.furo(d, "padrao").d, dhL = dh + K("furoLiq"), e = cima5(Nn.bordaMin(d, "laminada").e), s = cima5(3 * d), gg = null;
      if (o.aba) {   /* o furo no gage da aba: a arruela livra a aba de fora e a borda livre ≥ a da Tabela 14 */
        var gMin = o.aba.t + P.arr.d2 / 2 + 1, gMax = o.aba.b - Nn.bordaMin(d, "laminada").e;
        if (gMax < gMin - 1e-9) { tentou.push(P.id + ": não cabe na aba de " + br(o.aba.b, 1) + " mm"); continue; }
        gg = (gMin + gMax) / 2;
      }
      for (var c = 0; c < cls.length; c++) {
        for (var n = 2; n <= nMax; n++) {
          var vs = [], fv = FvRd(d, cls[c].fub, o.planos), lc = (n - 1) * s;
          vs.push(verif("Parafusos ao cisalhamento (" + n + " × " + P.id + " " + cls[c].id + ", " + o.planos + " plano" + (o.planos > 1 ? "s" : "") + " de corte)", IT("cisalRosca") + " — rosca no plano",
            [passo("Fv,Rd por parafuso", o.planos + "·0,40·Ab·fub/γa2 = " + o.planos + "·0,40·" + br(Ab(d), 1) + "·" + cls[c].fub + "/" + br(g.a2, 2), br(fv, 2) + " kN"),
             passo("Resistente do grupo", n + "·Fv,Rd", br(n * fv, 2) + " kN"), passo("Solicitante", "maior |N| (envoltória ELU)" + (o.combN ? " — " + o.combN : ""), br(Nd, 2) + " kN")], n * fv, Nd));
          arr(o.partes).forEach(function (pt) {
            var lfE = e - dh / 2, lfI = s - dh, fc = (FcRd(d, pt.t, pt.fu, lfE) + (n - 1) * FcRd(d, pt.t, pt.fu, lfI)) * num(pt.conta, 1);
            if (pt.fino) {   /* parede fina (t < 4,75 mm): por parafuso, o menor entre o esmagamento da NBR 14762 e o rasgamento 1,2·lf·t·fu/γa2 */
              var esm = Esm14762(d, pt.t, pt.fu), rE = Math.min(esm, 1.2 * lfE * pt.t * pt.fu / g.a2 / 1000), rI = Math.min(esm, 1.2 * lfI * pt.t * pt.fu / g.a2 / 1000);
              fc = (rE + (n - 1) * rI) * num(pt.conta, 1);
              vs.push(verif("Esmagamento / rasgamento na " + pt.papel + " (t = " + br(pt.t, 2) + " mm × " + num(pt.conta, 1) + ")", "ABNT NBR 14762:2010, ligações parafusadas — esmagamento Fc,Rd = αe·d·t·fu/γ (αe = 0,183t + 1,53 ≤ 3,0; γ = 1,55; conferir o item) e " + IT("contato1") + " no rasgamento",
                [passo("Esmagamento por parafuso e parede", "(0,183·" + br(pt.t, 2) + " + 1,53)·" + d + "·" + br(pt.t, 2) + "·" + pt.fu + "/1,55", br(esm, 2) + " kN"),
                 passo("Rasgamento", "1,2·(e − dh/2)·t·fu/γa2 (ponta) e 1,2·(s − dh)·t·fu/γa2", br(1.2 * lfE * pt.t * pt.fu / g.a2 / 1000, 2) + " / " + br(1.2 * lfI * pt.t * pt.fu / g.a2 / 1000, 2) + " kN"),
                 passo("Resistente", "Σ mín(esmagamento; rasgamento) × " + num(pt.conta, 1) + " paredes", br(fc, 2) + " kN")], fc, Nd));
              return;
            }
            vs.push(verif("Pressão de contato / rasgamento em " + pt.papel + " (t = " + br(pt.t, 2) + " mm" + (pt.conta > 1 ? " × " + pt.conta : "") + ")", IT("contato1"),
              [passo("Furo e distâncias", "dh = db + 1,5; borda e = " + e + " mm (Tabela 14, 6.3.11); passo s = 3·db = " + s + " mm (6.3.9)", "dh = " + br(dh, 1) + " mm"),
               passo("Parafuso da ponta", "mín(1,2·(e − dh/2)·t·fu; 2,4·db·t·fu)/γa2", br(FcRd(d, pt.t, pt.fu, lfE), 2) + " kN"),
               passo("Demais", "mín(1,2·(s − dh)·t·fu; 2,4·db·t·fu)/γa2", br(FcRd(d, pt.t, pt.fu, lfI), 2) + " kN"), passo("Resistente", "soma" + (pt.conta > 1 ? " × " + pt.conta : ""), br(fc, 2) + " kN")], fc, Nd));
            if (Nt > 0) {
              var lt = pt.ltFn ? pt.ltFn(d, gg) : num(pt.lt, e), t = pt.t, cn = num(pt.conta, 1), lv = e + lc;
              var Agv = lv * t * cn, Anv = (lv - (n - 0.5) * dhL) * t * cn, Ant = Math.max(0, lt - 0.5 * dhL) * t * cn;
              var R1 = (0.6 * pt.fu * Anv + pt.fu * Ant) / g.a2 / 1000, R2 = (0.6 * pt.fy * Agv + pt.fu * Ant) / g.a2 / 1000;
              vs.push(verif("Colapso por rasgamento (bloco) em " + pt.papel, IT("bloco") + ", Cts = 1,0",
                [passo("Áreas", "Agv = (e + (n−1)·s)·t; Anv = Agv − (n − 0,5)·(dh + 2)·t; Ant = (lt − 0,5·(dh + 2))·t", "Agv " + br(Agv, 0) + "; Anv " + br(Anv, 0) + "; Ant " + br(Ant, 0) + " mm²", "lt = " + br(lt, 1) + " mm"),
                 passo("Fr,Rd", "mín[(0,6·fu·Anv + fu·Ant); (0,6·fy·Agv + fu·Ant)]/γa2", br(Math.min(R1, R2), 2) + " kN")], Math.min(R1, R2), Nt));
            }
          });
          if (o.perfil && Nt > 0) {
            var pf = o.perfil, An = pf.A - num(pf.abas, 1) * dhL * pf.t, Ct = Math.max(0.6, Math.min(0.9, 1 - num(pf.xc, 0) / Math.max(lc, 1))), Rl = Ct * An * pf.fu / g.a2 / 1000;
            vs.push(verif("Ruptura da seção líquida da barra (Ct = " + br(Ct, 2) + ")", IT("liquida"),
              [passo("An", "Ag − " + num(pf.abas, 1) + "·(dh + 2)·t", br(An, 0) + " mm²"), passo("Ct", "1 − ec/lc = 1 − " + br(pf.xc, 1) + "/" + br(lc, 0) + " (0,60 ≤ Ct ≤ 0,90)", br(Ct, 3)),
               passo("Nt,Rd", "Ct·An·fu/γa2", br(Rl, 2) + " kN"), passo("Nt,Sd", "maior tração (envoltória ELU)", br(Nt, 2) + " kN")], Rl, Nt));
          }
          var fe = fecha(vs);
          ult = { ok: fe.ok, razao: fe.razao, governante: fe.governante, n: n, id: P.id, d: d, classe: cls[c].id, classeNome: cls[c].nome, fub: cls[c].fub, passo: s, borda: e, gage: gg, verificacoes: vs };
          if (fe.ok) return ult;
        }
      }
    }
    if (!ult) return { ok: false, razao: Infinity, governante: "nenhum diâmetro do catálogo cabe: " + tentou.join("; "), n: 2, verificacoes: [] };
    ult.sugestao = "Nem " + N_MAX + " parafusos " + ult.id + " " + ult.classe + " passam: perfil/chapa mais espessos ou duas linhas de parafusos (detalhar à mão).";
    return ult;
  }

  /* ================================================================ 4. PLACA DA COLUNA TRELIÇADA
   * o = { montantes: [{ id, bw, bf, t, fy }], esforcos: [{ comb, N: [kN por montante, + tração], Vx, Vz (kN, a coluna toda) }],
   *       fck, chumbador: { fy, fu, id } }
   * Arranjo do desenho (js/metalligacao.js placaBaseColuna): uma placa sob todos os montantes, balanço de 75 mm, UM chumbador por
   * montante, do lado de fora dele, a (arruela/2 + 5 mm) da seção. Cada montante comprime a sua área de influência
   * (bw + 2·75) × (bf + 2·75) — a favor: a placa entre montantes não conta. */
  function placaColuna(o) {
    var g = G(), mts = arr(o.montantes), nM = mts.length, fck = num(o.fck, FCK_PADRAO), ch = o.chumbador || {}, fyC = num(ch.fy, 250), fuC = num(ch.fu, 400), Nn = N();
    var bal = 75, sig = sigmaC(fck, 1), ult = null, esf = arr(o.esforcos);
    var m0 = mts[0] || { bw: 100, bf: 50, t: 3, fy: 250 }, B1 = m0.bw + 2 * bal, L1 = m0.bf + 2 * bal, A1 = B1 * L1;
    var Nc = 0, Nt = 0, V = 0, cN = "", cT = "", cV = "", inter = 0, cI = "";
    esf.forEach(function (s) { arr(s.N).forEach(function (n) { if (-n > Nc) { Nc = -n; cN = s.comb; } if (n > Nt) { Nt = n; cT = s.comb; } }); var v = Math.sqrt(sq(num(s.Vx, 0)) + sq(num(s.Vz, 0))); if (v > V) { V = v; cV = s.comb; } });
    for (var ci = 0; ci < CHUMB.length; ci++) {
      var cb = CHUMB[ci], d = cb.d, ft = FtRd(d, fuC), fv = FvRd(d, fuC, 1), Pn = Nn.parafuso(cb.id), folga = (Pn ? Pn.arr.d2 / 2 : 1.2 * d) + 5;
      /* interação por combinação: tração do montante mais tracionado + a cortante da coluna em METADE dos chumbadores (furo alargado) */
      inter = 0; cI = "";
      esf.forEach(function (s) { var tmax = Math.max(0, Math.max.apply(null, arr(s.N).concat([0]))), v = Math.sqrt(sq(num(s.Vx, 0)) + sq(num(s.Vz, 0))) / Math.max(1, nM / 2), it = sq(tmax / ft) + sq(v / fv); if (it > inter) { inter = it; cI = s.comb; } });
      var Vch = V / Math.max(1, nM / 2);
      for (var ti = 0; ti < PLACAS.length; ti++) {
        var tp = PLACAS[ti], fyP = CHAPA.fy, vs = [];
        var mm = (B1 - 0.95 * m0.bw) / 2, nn = (L1 - 0.8 * m0.bf) / 2, l = Math.max(mm, nn), sNc = Nc * 1000 / A1, MRd = tp * tp * fyP / 4 / g.a1 / 1000;
        var Mc = sNc * l * l / 2 / 1000, x = folga, beff = 2 * x, Mt = Nt * 1000 * x / beff / 1000;
        vs.push(verif("Pressão no concreto sob o montante (fck " + br(fck, 0) + " MPa)", IT("concreto"),
          [passo("Área de influência do montante", "(bw + 2·75)·(bf + 2·75) = " + br(B1, 0) + " × " + br(L1, 0), br(A1, 0) + " mm²", "a placa entre os montantes não conta (a favor)"),
           passo("σc,Rd", "fck·√(A2/A1)/(γc·γn) ≤ fck/γc, A2/A1 = 1 (sem o bloco de fundação no modelo)", br(sig, 2) + " MPa", FONTE_FCK),
           passo("σc,Sd", "Nc/A1" + (cN ? " — " + cN : ""), br(sNc, 2) + " MPa", "Nc = " + br(Nc, 2) + " kN")], sig, sNc, "MPa"));
        vs.push(verif("Placa à flexão (t = " + br(tp, 1) + " mm)", "AISC Design Guide 1 (2ª ed.) — momento plástico t²·fy/4 por unidade de largura; γa1 da " + IT("gamas"),
          [passo("Balanço na compressão", "l = máx[(B − 0,95·bw)/2; (L − 0,8·bf)/2]", br(l, 1) + " mm"), passo("Compressão", "σ·l²/2", br(Mc, 3) + " kN·m/m"),
           passo("Arrancamento", "T·x/beff, x = " + br(x, 1) + " mm (chumbador → face do montante), beff = 2·x (45°)", br(Mt, 3) + " kN·m/m", cT ? "T = " + br(Nt, 2) + " kN — " + cT : ""),
           passo("Resistente", "t²·fy/(4·γa1)", br(MRd, 3) + " kN·m/m")], MRd, Math.max(Mc, Mt), "kN·m/m"));
        vs.push(verif("Chumbador à tração (" + nM + " × " + cb.id + ", um por montante)", IT("tracao"),
          [passo("Ft,Rd", "0,75·Ab·fu/γa2 = 0,75·" + br(Ab(d), 0) + "·" + fuC + "/" + br(g.a2, 2), br(ft, 2) + " kN"), passo("Ft,Sd", "a maior tração de um montante" + (cT ? " — " + cT : ""), br(Nt, 2) + " kN")], ft, Nt));
        vs.push(verif("Chumbadores ao cisalhamento (atrito não considerado)", IT("cisalRosca") + " — furo alargado: a cortante em metade dos chumbadores",
          [passo("Fv,Rd", "0,40·Ab·fu/γa2", br(fv, 2) + " kN"), passo("Fv,Sd por chumbador", "V/(n/2)" + (cV ? " — " + cV : ""), br(Vch, 2) + " kN", "V = " + br(V, 2) + " kN")], fv, Vch));
        vs.push(verif("Tração + cisalhamento no chumbador", IT("interacao"), [passo("(Ft/Ft,Rd)² + (Fv/Fv,Rd)²", "na mesma combinação" + (cI ? " — " + cI : ""), br(inter, 3))], 1, inter, ""));
        var tw = num(m0.t, 3), dw = Math.max(3, Math.min(dwMin(Math.min(tw, tp)), Math.floor(tw))), per = 2 * (m0.bw + m0.bf), cap = soldaMm(dw, Math.min(num(m0.fy, 250), fyP), tw) * per;
        vs.push(verif("Solda do montante na placa (filete " + dw + " mm no contorno, " + br(per, 0) + " mm)", IT("solda") + "; " + IT("soldaMin"),
          [passo("Resistente", "mín(0,60·0,707·dw·fw/γw2; 0,60·fy·t/γa1)·L", br(cap, 2) + " kN"), passo("Solicitante", "a maior tração de um montante (a compressão é por contato)", br(Nt, 2) + " kN")], cap, Nt));
        var fe = fecha(vs);
        /* ancoragem por aderência — NBR 6118:2014 9.3.2.1 (fbd = η1·η2·η3·fctd; barra lisa η1 = 1,0), 9.4.2.4 (lb = φ/4·fyd/fbd ≥ 25φ),
           9.4.2.5 (lb,nec = α·lb·As,calc/As,ef ≥ máx(0,3·lb; 10φ; 100 mm), gancho α = 0,7) */
        var fctd = 0.7 * 0.3 * Math.pow(fck, 2 / 3) / 1.4, fyd = fyC / 1.15, lb = Math.max(d / 4 * fyd / fctd, 25 * d), rzA = Math.min(1, Nt * 1000 / Math.max(1, Ab(d) * fyd)), lbn = Math.max(0.7 * lb * rzA, 0.3 * lb, 10 * d, 100), anc = Math.max(300, Math.ceil(lbn / 50) * 50);
        var va = verif("Ancoragem por aderência do chumbador com gancho", "ABNT NBR 6118:2014, 9.3.2.1 e 9.4.2.4/9.4.2.5 (barra lisa η1 = 1,0, gancho α = 0,7)",
          [passo("fctd = fbd", "0,7·0,3·fck^(2/3)/1,4 (η1 = η2 = η3 = 1)", br(fctd, 3) + " MPa"), passo("lb", "φ/4·fyd/fbd ≥ 25φ", br(lb, 0) + " mm"), passo("lb,nec", "0,7·lb·Ft,Sd/(Ab·fyd) ≥ máx(0,3·lb; 10φ; 100)", br(lbn, 0) + " mm"), passo("Adotado", "≥ 300 mm, múltiplo de 50", br(anc, 0) + " mm")], anc, lbn, "mm");
        vs.push(va);
        ult = { ok: fe.ok, razao: fe.razao, governante: fe.governante, t: tp, chumbador: cb.id, d: d, nChumb: nM, ancoragem: anc, lb: Math.round(lb), soldaDw: dw, verificacoes: vs,
                forcas: { Nc: Nc, Nt: Nt, V: V } };
        if (fe.ok) return ult;
      }
    }
    ult.sugestao = "Nem o chumbador " + CHUMB[CHUMB.length - 1].id + " com a placa de " + PLACAS[PLACAS.length - 1] + " mm passa: aço F1554 Gr.55, mais chumbadores por montante ou bloco maior (A2/A1).";
    return ult;
  }

  /* ================================================================ 5. MÃO-FRANCESA SOLDADA */
  function soldaL(o) {
    /* o = { N, Nt, L: { t, xc, A, b }, aco, tApoio, fyApoio } — 2 filetes (calcanhar e ponta da aba ligada) */
    var g = G(), L = o.L, tA = num(o.tApoio, L.t), dw = Math.max(3, Math.min(dwMin(Math.min(L.t, tA)), Math.floor(Math.min(L.t, tA)))), Nd = Math.abs(num(o.N, 0)), Nt = Math.max(0, num(o.Nt, 0));
    var porMm = 2 * Math.min(soldaMm(dw, o.aco.fy, L.t), soldaMm(dw, num(o.fyApoio, 250), tA)), Lw = Math.max(40, 4 * dw, cima10(Nd / porMm));
    function Ct(lw) { return Math.max(0.6, Math.min(0.9, 1 - L.xc / lw)); }
    while (Nt > 0 && Ct(Lw) * L.A * o.aco.fu / g.a2 / 1000 < Nt && Lw < 300) Lw += 10;
    var vs = [verif("Cordão: 2 filetes de " + dw + " mm × " + Lw + " mm (calcanhar e ponta da aba)", IT("solda") + "; " + IT("soldaMin") + "; " + IT("soldaComp"),
      [passo("Por mm (2 filetes)", "2·mín(0,60·0,707·dw·fw/γw2; 0,60·fy·t/γa1) na aba e no apoio", br(porMm * 1000, 0) + " N/mm"), passo("Lw", "≥ máx(4·dw; 40 mm; N/(resist. por mm)), múltiplo de 10", Lw + " mm")], porMm * Lw, Nd)];
    if (Nt > 0) vs.push(verif("Ruptura da seção líquida (Ct = 1 − ec/Lw = " + br(Ct(Lw), 2) + ")", IT("liquida"), [passo("Nt,Rd", "Ct·Ag·fu/γa2", br(Ct(Lw) * L.A * o.aco.fu / g.a2 / 1000, 2) + " kN")], Ct(Lw) * L.A * o.aco.fu / g.a2 / 1000, Nt));
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, dw: dw, Lw: Lw, verificacoes: vs };
  }

  /* solda da chapa de ligação na peça (2 filetes; 4 no rasgo do tubo) — o comprimento é o da chapa (grupo de parafusos + 2 bordas) */
  function soldaChapa(R, Lch, tCh, tP, fyP, nF, fixo) {
    /* fixo: o comprimento é o da chapa do modelo (mão-francesa: a largura da aba) — não cresce; senão cresce até o que a força pede */
    var dw = Math.max(3, Math.min(dwMin(Math.min(tCh, tP)), Math.floor(Math.min(tCh, tP)))), porMm = Math.min(nF * soldaMm(dw, fyP, tP), 2 * 0.6 * CHAPA.fy * tCh / G().a1 / 1000), Lw = fixo ? Lch : Math.max(Lch, 40, 4 * dw, cima10(R / porMm));
    /* REVISÃO 21/11 (item 3): a perna do filete (mínimo 3 mm, Tabela 10) não passa da parede da peça — critério do projeto: filete de 3 mm
       numa parede de 2 mm fura o tubo (a regra de perna máxima do 6.2.6.2 é para BORDA, aqui é face):
       a verificação REPROVA (razão dw/t) em vez de limitar o metal-base em silêncio; o tubo de parede < 3 mm sai PASSANTE (verificar0) */
    var vP = verif("Perna do filete ≤ espessura da peça (dw = " + dw + " mm; t = " + br(tP, 2) + " mm)", IT("soldaMin") + " — filete mínimo 3 mm numa parede mais fina fura a peça: critério do projeto (pedido do Rogério, 21/11/2026); parede fina é da NBR 14762",
      [passo("Filete mínimo", "Tabela 10 pela parte menos espessa", dw + " mm"), passo("Espessura da peça", "parede/alma soldada", br(tP, 2) + " mm")], tP, dw, "mm");
    if (dw <= tP + 1e-9) vP.razao = 0;   /* critério geométrico (passa/não passa): passando, não entra na "pior razão" da ligação */
    return { dw: dw, Lw: Lw, vPerna: vP, v: verif("Solda da chapa de ligação na peça (" + nF + " filetes de " + dw + " mm × " + Lw + " mm)", IT("solda") + "; " + IT("soldaComp"),
      [passo("Por mm", nF + "·mín(0,60·0,707·dw·fw/γw2; 0,60·fy·t/γa1) ≤ 2·0,60·fy·tch/γa1 (chapa)", br(porMm * 1000, 0) + " N/mm"), passo("Lw", "≥ comprimento da chapa (" + br(Lch, 0) + " mm) e R/(por mm)", Lw + " mm")], porMm * Lw, R) };
  }

  /* ================================================================ 6. ALMA DO U SOB A CHAPA DE NÓ */
  function almaU(o) {
    /* o = { F (kN ⊥ à alma), Lg (mm, comprimento da chapa ao longo do U), tp (mm, chapa), U: { bw, t, A }, fy, Nc (kN, compressão do U) } */
    var g = G(), B = num(o.U.bw, 100), t = num(o.U.t, 3), tp = num(o.tp, 8), fy = num(o.fy, 250), beta = Math.min(0.99, tp / B), Uu = Math.min(1, Math.max(0, num(o.Nc, 0) * 1000 / (num(o.U.A, 1) * fy)));
    var Qf = o.Nc > 0 ? Math.max(0, 1 - 0.3 * Uu * (1 + Uu)) : 1, Rn = fy * t * t / (1 - beta) * (2 * o.Lg / B + 4 * Math.sqrt(1 - beta)) * Qf / 1000, Rd = Rn / g.a1;
    return verif("Flexão da alma do " + (o.nome || "U") + " sob a chapa de nó (força ⊥ à alma)", "AISC 360-16, Tabela K1.2 (placa longitudinal — plastificação da face) e K1.3 (Qf), ANALOGIA: a NBR 8800 não trata; Rd = Rn/γa1",
      [passo("Rn", "fy·t²/(1 − tp/B)·[2·Lg/B + 4·√(1 − tp/B)]·Qf", br(Rn, 2) + " kN", "B = " + br(B, 0) + " mm (alma), t = " + br(t, 2) + " mm, Lg = " + br(o.Lg, 0) + " mm, tp = " + br(tp, 1) + " mm"),
       passo("Qf", o.Nc > 0 ? "1 − 0,3·U·(1 + U), U = Nc/(A·fy) = " + br(Uu, 3) : "U tracionado: 1,0", br(Qf, 3)), passo("Rd", "Rn/γa1", br(Rd, 2) + " kN"), passo("Solicitante", "Σ|N|·sen θ das barras da chapa", br(o.F, 2) + " kN")], Rd, o.F);
  }

  /* auto-correção da alma (21/11): PAR DE ENRIJECEDORES transversais dentro do U, nas bordas da chapa de nó (no plano ⊥ à alma,
     soldados na alma e nas duas abas). Modelo do projetista (não está na NBR 8800): cada enrijecedor recebe F⊥/2 da chapa de nó no
     meio do vão e leva às abas como viga biapoiada no próprio plano (vão = bw, altura h = bf − t); flexão plástica t·h²/4·fy/γa1,
     cisalhamento 0,60·fy·h·t/γa1 (5.4.3.1.1 da NBR 8800, conferir), soldas pelo 6.2.5. A alma não é contada (a favor). */
  var T_ENR = [6.3, 8, 9.5, 12.5, 16, 19, 22.4, 25];
  function enrijecedores(o) {
    var g = G(), bw = num(o.U.bw, 100), tU = num(o.U.t, 3), h = num(o.U.bf, 50) - tU, F = Math.abs(num(o.F, 0)), ult = null;
    for (var i = 0; i < T_ENR.length; i++) {
      var te = T_ENR[i], M = F / 2 * bw / 4 / 1000, MRd = te * h * h / 4 * CHAPA.fy / g.a1 / 1e6, VRd = 0.6 * CHAPA.fy * h * te / g.a1 / 1000;
      /* REVISÃO 21/11, atualizada 23/11/2026 (Estância Montalvão): a alma do U fica para FORA da coluna e a chapa de nó entra ENTRE as
         abas, soldada na face INTERNA da alma; os dois enrijecedores ficam também do lado de dentro, nas bordas da chapa (x_nó ± Lg/2).
         A conta NÃO supõe solda chapa–enrijecedor (a favor da segurança): a força passa chapa de nó → alma → enrijecedor pelo cordão
         enrijecedor–alma (comprimento bw − 2·tU, metal-base = a alma do U). Antes (21/11) a chapa ficava por fora da alma */
      var Lw1 = bw - 2 * tU, dw1 = Math.max(3, Math.min(dwMin(Math.min(te, tU)), Math.floor(Math.min(te, tU)))), w1 = 2 * soldaMm(dw1, num(o.fy, 250), tU) * Lw1;
      var dw2 = Math.max(3, Math.min(dwMin(Math.min(te, tU)), Math.floor(Math.min(te, tU)))), w2 = 2 * soldaMm(dw2, num(o.fy, 250), tU) * h;
      var vs = [verif("Enrijecedor à flexão no plano (" + br(te, 1) + " × " + br(h, 0) + " mm, vão " + br(bw, 0) + " mm)", "modelo do projetista: viga biapoiada nas abas, F⊥/2 no meio; momento plástico t·h²/4·fy/γa1 (" + IT("gamas") + ")",
          [passo("M", "(F⊥/2)·bw/4", br(M, 3) + " kN·m"), passo("MRd", "t·h²/4·fy/γa1", br(MRd, 3) + " kN·m")], MRd, M, "kN·m"),
        verif("Enrijecedor ao cisalhamento", "ABNT NBR 8800:2008, 5.4.3.1.1 (Vpl = 0,60·Aw·fy; conferir no texto)", [passo("VRd", "0,60·fy·h·t/γa1", br(VRd, 2) + " kN"), passo("VSd", "F⊥/4 (cada apoio)", br(F / 4, 2) + " kN")], VRd, F / 4),
        verif("Solda enrijecedor → alma do U (2 × " + dw1 + " mm × " + br(Lw1, 0) + " mm)", IT("solda"), [passo("Resistente", "2·(bw − 2·t)·mín(0,60·0,707·dw·fw/γw2; 0,60·fy·t/γa1), metal-base = alma", br(w1, 2) + " kN")], w1, F / 2),
        verif("Solda enrijecedor → aba do U (2 × " + dw2 + " mm × " + br(h, 0) + " mm)", IT("solda"), [passo("Resistente", "2·h·mín(…)", br(w2, 2) + " kN")], w2, F / 4)];
      var fe = fecha(vs);
      ult = { ok: fe.ok, razao: fe.razao, governante: fe.governante, t: te, h: h, comprimento: bw - 2 * tU, soldaAlma: { dw: dw1, Lw: Lw1 }, soldaAbas: { dw: dw2, Lw: h }, verificacoes: vs };
      if (fe.ok) return ult;
    }
    return ult;
  }

  /* ================================================================ VERIFICAR (a estrutura inteira) */
  /* edição da NBR 8800 deste módulo: SEMPRE 2008. Revisão de 22/11/2026: este módulo já calculava pela 2008 antes da opção
     central (forçava opcoes.edicao = "2008"); seguir EDICAO_8800 = "2024" mudava o resultado do rollback (o rollback tem de
     devolver o resultado antigo idêntico). Com a opção central em 2008 o efeito é o mesmo. */
  function ED() { return "2008"; }
  function verificar(r, op) {
    op = op || {};
    var ed = ED();
    var out = { ligacoes: [], n: 0, reprovados: 0, pior: null, cobertos: { base: false, rotuladas: false, tubo: false }, naoDim: [], modelo: { porBarra: {}, placas: {} }, pendencias: [], resumo: "",
                premissas: "esforços = envoltória das combinações últimas de cada barra; coeficientes da NBR 8800:" + ed + " do js/metalnorma.js LIGDIM (conferir no texto); " + FONTE_FCK };
    if (!r || !r.ok || !r.modelo || !r.analise || !r.analise.combinacoes) { out.resumo = "sem cálculo"; return out; }
    var LCc = LC(), opc = LCc && LCc.opcoes, edAnt = opc ? opc.edicao : null; if (opc) opc.edicao = ed;
    try { verificar0(r, op, out, LCc); } finally { if (opc) opc.edicao = edAnt; }
    out.ligacoes.forEach(function (l) { out.n++; if (!l.ok && !l.foraDaContagem) out.reprovados++; if (!out.pior || l.razao > out.pior.razao) out.pior = l; });
    var cont = {}; out.ligacoes.forEach(function (l) { cont[l.tipo] = (cont[l.tipo] || 0) + 1; });
    out.resumo = out.n + " ligação(ões) dimensionada(s) pela NBR 8800:" + ed + " (" + Object.keys(cont).map(function (k) { return cont[k] + " " + (ROT[k] || k); }).join(", ") + "): " + out.reprovados + " reprovada(s)" +
      (out.pior ? "; pior razão " + br(out.pior.razao, 3) + " (" + out.pior.nome + ": " + out.pior.governante + ")" : "") + (out.naoDim.length ? "; NÃO dimensionado: " + out.naoDim.join("; ") : "");
    return out;
  }
  var ROT = { parafusada: "pontas parafusadas", clip: "clips de terça", barra: "pontas de barra redonda", placaColuna: "placas de coluna treliçada", placaBase: "placas de base", soldaMF: "mãos-francesas soldadas", almaU: "almas de U sob chapa de nó", tuboU: "grupos de pontas de tubo na alma do U (js/metaltubou.js)" };

  function verificar0(r, op, out, LCc) {
    var M = arr(r.modelo.membros), fck = num(op.fck, FCK_PADRAO), modo = op.ligacao === "parafusada" || op.ligacao === "soldada" ? op.ligacao : "padrao";
    var ys = []; M.forEach(function (m) { if (m.a && m.b) ys.push(Math.min(m.a[1], m.b[1])); }); var cota = ys.length ? Math.min.apply(null, ys) : 0;
    var porId = {}; M.forEach(function (m) { porId[m.id] = m; });
    function add(l) { out.ligacoes.push(l); return l; }
    var ROTUL = { escora: 1, escoraColuna: 1, tapamento: 1, pilarInterno: 1, viga: 0 }, faltou = {}, colunas = {}, ordCol = [];
    M.forEach(function (m) {
      var gr = grupoDe(m), s = sec(m), a = aco(m), E;
      if (!gr) return;
      var pe = m.a && m.b ? (Math.abs(Math.min(m.a[1], m.b[1]) - cota) < 1e-4 && Math.abs(m.a[0] - m.b[0]) < 1e-6 && Math.abs(m.a[2] - m.b[2]) < 1e-6) : false;
      /* ---- bases */
      if (pe && (gr === "banzoColuna" || gr === "pilar" || gr === "tapamento" || gr === "pilarInterno")) {
        var ck = m.calc.coluna || ("b:" + (m.calc.barraId || m.id));
        if (!colunas[ck]) { colunas[ck] = []; ordCol.push(ck); } colunas[ck].push(m);
      }
      /* ---- 2L dos nós da treliça: só a ligação PARAFUSADA (a soldada é do js/metalchapano.js) */
      if (s.forma === "2L" && /^(diagonal|montante|banzoSup|banzoInf)$/.test(gr)) {
        if (modo !== "parafusada") return;
        E = env(r, m);
        var L2 = { b: num(s.a, num(s.b, 50)), t: num(s.t, 3) }, e2 = num(s.e, 8);
        var l = parafusada({ N: E.N, Nt: E.Nt, combN: E.combN, planos: 2, aba: L2,
          partes: [{ papel: "chapa de nó (" + br(e2, 1) + " mm)", t: e2, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } },
                   { papel: "abas da 2L", t: L2.t, fy: a.fy, fu: a.fu, conta: 2, ltFn: function (d, gg) { return L2.b - num(gg, L2.b / 2); } }],
          perfil: { A: num(s.A, 0), t: L2.t, xc: num(s.xc, 0), abas: 2, fu: a.fu } });
        fechaLig(l, "parafusada", "Nó de treliça — " + m.nome + " (" + s.nome + ")", m, E);
        out.modelo.porBarra[m.calc.barraId || m.peca] = { n: l.n, id: l.id, classe: l.classe };
        return;
      }
      /* ---- mão-francesa */
      if (gr === "maoFrancesa") {
        E = env(r, m);
        var ligMF = op.ligMaoFrancesa === "soldada" || modo === "soldada" || (m.calc && m.calc.ligacao === "soldada") ? "soldada" : "parafusada";
        var Ls = { b: num(s.a, num(s.b, 50)), t: num(s.t, 3), xc: num(s.xc, 0), A: num(s.A, 0) };
        /* R7 (21/11/2026, decisão do Rogério: o sistema resolve sozinho): a parede da TERÇA onde a mão-francesa chega (a terça que passa
           pelo nó da ponta; sem achar, op.tApoioMF ou 2,66). Parede < filete mínimo de 3 mm (Tabela 10) → a chapa da mão-francesa vai
           PARAFUSADA na alma da terça (NBR 14762: esmagamento + rasgamento na parede fina), nunca soldada nela; as terças não mudam.
           A ponta soldada nessa condição reprovaria (perna 3 mm > parede) — a mão-francesa soldada passa a parafusada na terça. */
        var tTer = null, nosMF = arr(m.nos);
        M.forEach(function (q) { if (tTer != null || grupoDe(q) !== "terca") return; var nq = arr(q.nos); if (nq.indexOf(nosMF[0]) >= 0 || nq.indexOf(nosMF[nosMF.length - 1]) >= 0) tTer = num(sec(q).t, null); });
        if (tTer == null) tTer = num(op.tApoioMF, 2.66);
        var fina = tTer < 3 - 1e-9;
        if (ligMF === "soldada" && !fina) {
          var sl = soldaL({ N: E.N, Nt: E.Nt, L: Ls, aco: a, tApoio: tTer, fyApoio: 250 });
          fechaLig(sl, "soldaMF", "Mão-francesa soldada — " + m.nome, m, E);
          sl.resumo = "2 filetes " + sl.dw + " mm × " + sl.Lw + " mm em cada ponta";
          return;
        }
        var lm = parafusada({ N: E.N, Nt: E.Nt, combN: E.combN, planos: 1, aba: { b: Ls.b, t: Ls.t },
          partes: [{ papel: "chapa da mão-francesa (" + br(T_CHAPA_MF, 2) + " mm)", t: T_CHAPA_MF, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } },
                   { papel: "aba da cantoneira", t: Ls.t, fy: a.fy, fu: a.fu, conta: 1, ltFn: function (d, gg) { return Ls.b - num(gg, Ls.b / 2); } }],
          perfil: { A: Ls.A, t: Ls.t, xc: Ls.xc, abas: 1, fu: a.fu } });
        var ent = { n: lm.n, id: lm.id, classe: lm.classe };
        if (fina) {
          /* a chapa → alma da terça: parafusos à parte (1 plano), a parede da terça pela NBR 14762; a ponta soldada fica registrada
             como reprovada (a razão dw/t) e substituída */
          var vS = soldaChapa(E.N, Ls.b, T_CHAPA_MF, tTer, 250, 2, true).vPerna; vS.informativa = true; vS.nome += " — ponta SOLDADA na terça reprova: chapa parafusada na alma da terça";
          var lt = parafusada({ N: E.N, Nt: E.Nt, combN: E.combN, planos: 1,
            partes: [{ papel: "chapa da mão-francesa na terça (" + br(T_CHAPA_MF, 2) + " mm)", t: T_CHAPA_MF, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } },
                     { papel: "alma da terça", t: tTer, fy: 250, fu: 400, conta: 1, fino: true }] });
          lt.verificacoes.forEach(function (v) { v.nome = "Chapa → terça: " + v.nome; });
          lm.verificacoes = lm.verificacoes.concat([vS], lt.verificacoes);
          var fT = fecha(lm.verificacoes.filter(function (v) { return !v.informativa; })); lm.ok = fT.ok; lm.razao = fT.razao; lm.governante = fT.governante;
          ent.terca = { n: lt.n, id: lt.id, classe: lt.classe, t: tTer };
          lm.terca = ent.terca;
          fechaLig(lm, "parafusada", "Mão-francesa parafusada — " + m.nome, m, E);
          lm.resumo = lm.n + " parafusos " + lm.id + " " + lm.classe + " na cantoneira; chapa " + br(T_CHAPA_MF, 2) + " mm PARAFUSADA na alma da terça (" + lt.n + " × " + lt.id + " " + lt.classe + ", parede " + br(tTer, 2) + " mm < filete mínimo)" + (ligMF === "soldada" ? " — a ligação soldada pedida não cabe na terça fina" : "");
        } else {
          /* a chapa soldada no apoio (2 filetes na largura da aba) */
          var sc = soldaChapa(E.N, Ls.b, T_CHAPA_MF, tTer, 250, 2, true); lm.verificacoes.push(sc.v, sc.vPerna);
          var f2 = fecha(lm.verificacoes); lm.ok = f2.ok && lm.ok !== false; lm.razao = f2.razao; lm.governante = f2.governante;
          fechaLig(lm, "parafusada", "Mão-francesa parafusada — " + m.nome, m, E);
        }
        out.modelo.porBarra[m.calc.barraId || m.peca] = ent;
        return;
      }
      /* ---- terça: clip */
      if (gr === "terca" && /frio/.test(s.forma || "")) {
        E = env(r, m);
        var best = null;
        [{ id: "ASTM A307", fub: 415 }, { id: "ISO 4016 classe 8.8", fub: 800 }].forEach(function (pc) {
          if (best && best.ok) return;
          var q = LCc.clipTerca({ terca: { t: num(s.t, 2), fu: a.fu }, parafuso: pc, aco: { fy: 250, fu: 400 }, viga: { tf: 6 }, forcaPonta: Math.abs(E.N), reacao: { normal: Math.sqrt(sq(E.Vy) + sq(E.N)), paralela: E.Vz, cima: E.Vy } });
          if (!best || q.ok) best = q;
        });
        best.verificacoes.unshift(verif("Esforços na ponta da terça (envoltória ELU)", "cálculo", [passo("R⊥ (alma)", "√(Vy² + N²) — a força de escora da terça passa pelo clip", br(Math.sqrt(sq(E.Vy) + sq(E.N)), 2) + " kN", "Vy = " + br(E.Vy, 2) + "; N = " + br(E.N, 2) + " kN"), passo("R∥", "Vz", br(E.Vz, 2) + " kN")], 1, 0, ""));
        fechaLig(best, "clip", "Clip de terça — " + m.nome, m, E);
        out.modelo.porBarra[m.calc.barraId || m.peca] = { n: best.dimensoes.n, id: best.dimensoes.parafuso, classe: /8\.8/.test(best.dimensoes.classe) ? "8.8" : "A307", clip: best.dimensoes.cat };
        return;
      }
      /* ---- barra redonda (contravento, corrente, tirante) */
      if (s.forma === "circ") {
        E = env(r, m);
        var cv = LCc.contravento({ d: num(s.d, 12.5), N: E.Nt, barra: a, alfa: 45 });
        if (gr === "corrente") { cv.verificacoes = cv.verificacoes.slice(0, 2); var f3 = fecha(cv.verificacoes); cv.ok = f3.ok; cv.razao = f3.razao; cv.governante = f3.governante; }
        fechaLig(cv, "barra", (gr === "corrente" ? "Corrente" : "Contravento") + " — " + m.nome, m, E);
        return;
      }
      /* ---- pontas rotuladas por chapa de ligação (escoras, topo dos pilares de tapamento) */
      if (ROTUL[gr]) {
        E = env(r, m);
        var R = gr === "escora" || gr === "escoraColuna" ? Math.sqrt(sq(E.N) + sq(E.V)) : Math.sqrt(sq(E.V) + sq(E.Nt));
        var tubo = /^tubo/.test(s.forma || ""), tP = num(s.t, num(s.tw, 4));
        /* REVISÃO 21/11 (item 3): tubo de parede < 3 mm (TQ 100×2 da escora) não leva o filete mínimo de 3 mm da Tabela 10 — a ponta
           passa a ser PARAFUSADA PASSANTE: a chapa do apoio (8 mm) entra num rasgo na ponta do tubo e os parafusos atravessam as duas
           paredes e a chapa (2 planos de corte); paredes pela NBR 14762 (esmagamento) + rasgamento; seção líquida do tubo sem o rasgo
           e os furos, Ct = 0,60 (o menor da 5.2.5, a favor). Nenhuma solda na parede fina; a barra não muda (trocar o tubo reprovava
           outras barras — Revisão R2 do docs/alumetal/LIGACOES-DIMENSIONAMENTO.md) */
        if (tubo && tP < 3 - 1e-9) {
          var Aliq = num(s.A, 0) - 2 * (T_GUSSET + 2) * tP;
          var lp = parafusada({ N: R, Nt: E.Nt, combN: E.combN || E.combV, planos: 2,
            partes: [{ papel: "chapa do apoio no rasgo (" + T_GUSSET + " mm)", t: T_GUSSET, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } },
                     { papel: "parede do tubo", t: tP, fy: a.fy, fu: a.fu, conta: 2, fino: true }],
            perfil: { A: Aliq, t: tP, xc: 1e9, abas: 2, fu: a.fu } });
          fechaLig(lp, "parafusada", "Ponta rotulada PASSANTE (parede " + br(tP, 2) + " mm < filete mínimo) — " + m.nome + " (" + s.nome + ")", m, E);
          lp.passante = true;
          lp.resumo = lp.n + " parafusos passantes " + lp.id + " " + lp.classe + " (2 planos) pelo tubo e pela chapa " + T_GUSSET + " mm do apoio no rasgo — sem solda na parede de " + br(tP, 2) + " mm";
          out.modelo.porBarra[m.calc.barraId || m.peca] = { n: lp.n, id: lp.id, classe: lp.classe, chapaLigacao: T_GUSSET, passante: true };
          return;
        }
        var lg = parafusada({ N: R, Nt: E.Nt, combN: E.combN || E.combV, planos: 1,
          partes: [{ papel: "chapa da peça (" + T_GUSSET + " mm)", t: T_GUSSET, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } },
                   { papel: "chapa do apoio (" + T_GUSSET + " mm)", t: T_GUSSET, fy: CHAPA.fy, fu: CHAPA.fu, conta: 1, ltFn: function (d) { return N().bordaMin(d, "serra").e; } }] });
        if (lg.n) { var sw = soldaChapa(R, (lg.n - 1) * num(lg.passo, 40) + 2 * num(lg.borda, 25), T_GUSSET, tP, a.fy, tubo ? 4 : 2); lg.verificacoes.push(sw.v, sw.vPerna); lg.soldaPeca = { dw: sw.dw, Lw: sw.Lw, filetes: tubo ? 4 : 2 }; var f4 = fecha(lg.verificacoes); lg.ok = f4.ok && lg.ok !== false; lg.razao = f4.razao; lg.governante = f4.governante; }
        fechaLig(lg, "parafusada", "Ponta rotulada por chapa — " + m.nome + " (" + s.nome + ")", m, E);
        out.modelo.porBarra[m.calc.barraId || m.peca] = { n: lg.n, id: lg.id, classe: lg.classe, chapaLigacao: T_GUSSET };
        return;
      }
      if (!/^(travejamento|diagonal|montante|banzoSup|banzoInf|banzoColuna|pilar)$/.test(gr)) faltou[gr] = (faltou[gr] || 0) + 1;
    });
    /* ---- placas de base */
    var combs = combsELU(r);
    ordCol.forEach(function (ck) {
      var ms = colunas[ck], E0 = function (m, k) { var p = pontas(r, m, k), ya = m.a[1], yb = m.b[1]; return ya <= yb ? p.a : p.b; };
      /* a REAÇÃO do apoio (global: Fx, Fy para cima, Fz) — inclui as diagonais/travejamento que chegam no nó da base; sem a reação,
         os esforços da ponta do montante */
      var noBase = function (m) { var ns = arr(m.nos); return m.a[1] <= m.b[1] ? ns[0] : ns[ns.length - 1]; };
      var esf = combs.map(function (k) {
        var Ns = [], vx = 0, vz = 0, RE = r.analise.combinacoes[k].reacoes || {};
        ms.forEach(function (m) { var R = RE[noBase(m)]; if (R) { Ns.push(-num(R[1], 0)); vx += num(R[0], 0); vz += num(R[2], 0); return; } var e = E0(m, k); if (!e) return; Ns.push(num(e.N, 0)); vx += num(e.Vy, 0); vz += num(e.Vz, 0); });
        return { comb: k, N: Ns, Vx: vx, Vz: vz };
      });
      var s0 = sec(ms[0]), l;
      if (ms.length >= 2) {
        l = placaColuna({ montantes: ms.map(function (m) { var s = sec(m); return { id: m.id, bw: num(s.bw, num(s.d, 100)), bf: num(s.bf, 50), t: num(s.t, num(s.tw, 3)), fy: aco(m).fy }; }), esforcos: esf, fck: fck, chumbador: { fy: 250, fu: 400, id: "ASTM F1554 Gr.36" } });
        l.resumo = "Placa t = " + br(l.t, 1) + " mm sob " + ms.length + " montantes, " + l.nChumb + " chumbadores " + l.chumbador + " F1554 Gr.36 com gancho, ancoragem " + l.ancoragem + " mm";
        fechaLig(l, "placaColuna", "Placa de base da coluna " + ck + " (" + s0.nome + ")", ms[0], null);
        out.modelo.placas[ck] = { t: l.t / 1000, parafuso: l.chumbador, ancoragem: l.ancoragem / 1000, nChumb: l.nChumb };
      } else {
        var m = ms[0], tubo = /^tubo/.test(s0.forma || ""), pil = tubo ? { d: num(s0.h, 100), bf: num(s0.b, 100), tw: num(s0.t, 4), tf: num(s0.t, 4) } : { d: num(s0.d, num(s0.bw, 100)), bf: num(s0.bf, 50), tw: num(s0.tw, num(s0.t, 3)), tf: num(s0.tf, num(s0.t, 3)) };
        var pb = LCc.placaBase({ tipo: "rotulada", pilar: pil, aco: { fy: 250, fu: 400 }, chumbador: { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 }, concreto: { fck: fck }, acoPilar: aco(m),
          esforcos: esf.map(function (e) { return { comb: e.comb, N: e.N[0] || 0, Vx: e.Vx, Vz: e.Vz }; }) });
        fechaLig(pb, "placaBase", "Placa de base — " + m.nome + " (" + s0.nome + ")", m, null);
        out.modelo.placas[ck] = { t: pb.dimensoes.t / 1000, parafuso: pb.dimensoes.chumbadores.id, ancoragem: pb.dimensoes.chumbadores.ancoragem / 1000, nChumb: pb.dimensoes.chumbadores.n };
      }
    });
    /* ---- alma do U sob a chapa de nó (os nós do js/metalchapano.js com a peça principal em U) */
    arr(r.nosChapa && r.nosChapa.nos).forEach(function (o) {
      if (!o.chapa || !(o.chapa.Sy > 0) || !o.principal) return;
      var pm = porId[o.principal], s = pm && sec(pm); if (!s || !(s.bw > 0) || s.forma !== "frio") return;
      var Ep = env(r, pm), v = almaU({ F: o.chapa.Sy, Lg: o.chapa.Lg, tp: o.chapa.tg, U: { bw: s.bw, t: s.t, A: s.A }, fy: aco(pm).fy, Nc: Ep.Nc, nome: s.nome });
      var f = fecha([v]), vsA = [v], enr = null, res = "chapa " + br(o.chapa.tg, 0) + " × " + o.chapa.Lg + " mm, F⊥ = " + br(o.chapa.Sy, 1) + " kN — a alma resiste sozinha";
      if (!f.ok) {   /* a alma sozinha não aguenta: o sistema põe o par de enrijecedores e dimensiona */
        enr = enrijecedores({ F: o.chapa.Sy, tp: o.chapa.tg, U: { bw: s.bw, bf: s.bf, t: s.t }, fy: aco(pm).fy });
        v.informativa = true; v.nome += " — NÃO basta (razão " + br(v.razao, 2) + "): enrijecedores";
        vsA = [v].concat(enr.verificacoes); f = fecha(enr.verificacoes);
        res = "chapa " + br(o.chapa.tg, 0) + " × " + o.chapa.Lg + " mm, F⊥ = " + br(o.chapa.Sy, 1) + " kN — 2 enrijecedores " + br(enr.t, 1) + " × " + br(enr.h, 0) + " × " + br(enr.comprimento, 0) + " mm (ASTM A36) nas bordas da chapa";
        /* para o 3D (js/metalparafusos.js enrijecedoresU): a barra do gerador (barraId), o ponto do nó (m), a chapa e as soldas */
        var nI = r.modelo.noInfo && r.modelo.noInfo[o.no], nM = !nI && r.modelo.modelo && arr(r.modelo.modelo.nos).filter(function (q) { return q.id === o.no; })[0];
        out.modelo.enrijecedores = arr(out.modelo.enrijecedores).concat([{ no: o.no, membro: pm.id, peca: pm.peca, barraId: pm.calc ? pm.calc.barraId : null, P: nI ? nI.P : (nM ? [nM.x, nM.y, nM.z] : null),
          t: enr.t / 1000, h: enr.h / 1000, comprimento: enr.comprimento / 1000, Lg: o.chapa.Lg / 1000, soldaAlma: enr.soldaAlma, soldaAbas: enr.soldaAbas, U: s.nome }]);
      }
      add({ tipo: "almaU", nome: "Alma do " + s.nome + " no nó " + o.no, membro: pm.id, peca: pm.peca, barraId: pm.calc ? pm.calc.barraId : null, ok: f.ok, razao: f.razao, governante: f.governante, verificacoes: vsA, resumo: res, enrijecedores: enr ? { t: enr.t, h: enr.h, comprimento: enr.comprimento } : null });
      if (!f.ok) out.pendencias.push("Alma do " + s.nome + " no nó " + o.no + ": nem o enrijecedor de " + T_ENR[T_ENR.length - 1] + " mm passa (razão " + br(f.razao, 2) + ") — detalhar à mão.");
    });
    /* 22/11/2026: pontas de tubo soldadas na alma do U (js/metaltubou.js, via r.nosTubo.tuboU) — a memória entra aqui (Ligação
       inteligente / resultado do cálculo); a CONTAGEM de reprovadas fica no r.nosTubo (foraDaContagem: não soma de novo). Os
       enrijecedores dessas pontas vão para o mesmo modelo.enrijecedores (3D) e a chapa de ligação para modelo.gussetsTuboU */
    var TUv = r.nosTubo && r.nosTubo.tuboU;
    if (TUv) {
      arr(TUv.ligacoes).forEach(function (l) { add(l); });
      if (arr(TUv.enrijecedores).length) out.modelo.enrijecedores = arr(out.modelo.enrijecedores).concat(TUv.enrijecedores);
      if (arr(TUv.gussets).length) out.modelo.gussetsTuboU = TUv.gussets.slice();
      arr(TUv.pendencias).forEach(function (x) { out.pendencias.push(x); });
    }
    Object.keys(faltou).forEach(function (k) { out.naoDim.push(faltou[k] + " barra(s) do grupo " + k); });
    var placasOk = ordCol.length > 0;
    out.cobertos.base = placasOk;
    out.cobertos.rotuladas = !Object.keys(faltou).length;
    out.cobertos.tubo = !M.some(function (m) { var gr = grupoDe(m), s = sec(m); return /^tubo/.test(s.forma || "") && /^(diagonal|montante|banzoSup|banzoInf|travejamento)$/.test(gr) && !(m.calc && m.calc.tuboSoldado); });
    out.pendencias.push("Cone de arrancamento do concreto, bloco/pedestal e armadura de fretagem: projeto de fundação (com as reações deste memorial) — a NBR 8800 e a NBR 6118 9.4 não tratam o cone.");

    function fechaLig(l, tipo, nome, m, E) {
      if (tipo === "clip" || tipo === "barra" || tipo === "placaBase") { if (ED() === "2008") txt2008(l); }
      l.tipo = tipo; l.nome = nome; l.membro = m ? m.id : null; l.peca = m ? m.peca : null; l.barraId = m && m.calc ? m.calc.barraId : null;
      if (E) l.esforcos = { Nt: E.Nt, Nc: E.Nc, V: E.V, comb: E.combN || E.combV };
      if (!l.resumo) l.resumo = l.n ? l.n + " parafusos " + l.id + " " + l.classe + (l.soldaPeca ? "; chapa " + T_GUSSET + " mm soldada (" + l.soldaPeca.filetes + " × " + l.soldaPeca.dw + " mm × " + l.soldaPeca.Lw + " mm)" : "") : (l.resumo || "");
      add(l);
    }
  }

  /* o js/acoligcalc.js escreve os rótulos da edição 2024; rodando com opcoes.edicao = "2008" os VALORES são os da 2008 — o texto acompanha */
  function txt2008(l) {
    function f(x) { return String(x == null ? "" : x).replace(/NBR 8800:2024/g, "NBR 8800:2008").replace(/0,45·Ab/g, "0,40·Ab").replace(/0,45·/g, "0,40·")
      .replace(/σc,Rd = 0,85·fck\/γc·√\(A2\/A1\) ≤ 1,7·fck\/γc/g, "σc,Rd = fck·√(A2/A1)/(γc·γn) ≤ fck — conferir no texto"); }
    arr(l.verificacoes).forEach(function (v) { v.nome = f(v.nome); v.item = f(v.item); arr(v.passos).forEach(function (p) { p.rotulo = f(p.rotulo); p.formula = f(p.formula); }); });
    var cp = arr(l.verificacoes).filter(function (v) { return /Pressão no concreto/.test(v.nome); })[0];
    if (cp) arr(cp.passos).forEach(function (p) { if (p.rotulo === "σc,Rd") p.formula = "fck·√(A2/A1)/(γc·γn) (2008, 6.6.1 — conferir no texto)"; });
  }

  /* o texto "Ligações da tipologia" (js/metalporticos.js) sem o que foi dimensionado; null = tudo dimensionado */
  var ITENS = { base: /^placas de base$/, tubo: /^nós SOLDADOS de tubo/, rotuladas: /^ligações rotuladas/ };
  function tirarDoMotivo(motivo, cob) {
    var m = /^(.*? — )(.*)( — e o cálculo da estrutura desenhada NÃO as dimensiona.*)$/.exec(String(motivo || ""));
    if (!m) return motivo;
    var it = m[2].split("; ").filter(function (x) { x = x.trim(); if (!x) return false; for (var k in ITENS) if (cob[k] && ITENS[k].test(x)) return false; return true; });
    return it.length ? m[1] + it.join("; ") + m[3] : null;
  }

  /* MEMÓRIA DE CÁLCULO (HTML) — a tela da Ligação inteligente e o resultado do cálculo: por ligação, os passos e a razão
     solicitante/resistente. op = { ids (peças a mostrar), max (ligações; padrão: todas), resumo (só a tabela) } */
  function escH(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function memoriaHtml(ld, op) {
    op = op || {};
    if (!ld || !arr(ld.ligacoes).length) return "";
    var L = arr(ld.ligacoes), ids = op.ids ? op.ids.map(String) : null;
    if (ids) L = L.filter(function (l) { return ids.indexOf(String(l.peca)) >= 0; });
    L = L.slice().sort(function (a, b) { return b.razao - a.razao; });
    if (op.max) L = L.slice(0, op.max);
    if (!L.length) return "";
    function cor(rz) { return rz > 1 + 1e-9 ? "var(--ml-erro, #c62828)" : rz > 0.9 ? "var(--ml-aviso, #b26a00)" : "var(--ml-ok, #2e7d32)"; }
    var h = '<div class="lig-dim" data-lig-dim="' + L.length + '">';
    L.forEach(function (l) {
      h += '<details data-lig-dim-item="' + escH(l.tipo) + '"' + (op.abrir ? " open" : "") + '><summary><b>' + escH(l.nome) + '</b> — ' + escH(l.resumo || "") + ' · razão <b style="color:' + cor(l.razao) + '">' + br(l.razao, 3) + "</b> (" + escH(l.governante || "") + ")</summary>";
      if (l.esforcos) h += '<p class="ml-nota">Esforços (envoltória ELU): Nt = ' + br(l.esforcos.Nt, 2) + " kN; Nc = " + br(l.esforcos.Nc, 2) + " kN; V = " + br(l.esforcos.V, 2) + " kN" + (l.esforcos.comb ? " (" + escH(l.esforcos.comb) + ")" : "") + "</p>";
      if (!op.resumo) h += '<table class="ml-t"><thead><tr><th>Verificação</th><th>Item</th><th>Passos</th><th>Solicitante</th><th>Resistente</th><th>Razão</th></tr></thead><tbody>' + arr(l.verificacoes).map(function (v) {
        return "<tr><td>" + escH(v.nome) + "</td><td>" + escH(v.item) + "</td><td>" + arr(v.passos).map(function (p) { return escH(p.rotulo) + (p.formula ? ": " + escH(p.formula) : "") + " = <b>" + escH(p.valor) + "</b>" + (p.extra ? " <small>(" + escH(p.extra) + ")</small>" : ""); }).join("<br>") +
          "</td><td>" + br(v.solicitante, 2) + " " + escH(v.unidade || "") + "</td><td>" + br(v.resistencia, 2) + " " + escH(v.unidade || "") + '</td><td style="color:' + cor(v.razao) + '">' + br(v.razao, 3) + (v.informativa ? " (substituída)" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
      h += "</details>";
    });
    return h + "</div>";
  }

  var MetalLigDim = { memoriaHtml: memoriaHtml, soldaChapa: soldaChapa, enrijecedores: enrijecedores, verificar: verificar, parafusada: parafusada, placaColuna: placaColuna, soldaL: soldaL, almaU: almaU, tirarDoMotivo: tirarDoMotivo, env: env,
                      FvRd: FvRd, FtRd: FtRd, FcRd: FcRd, sigmaC: sigmaC, FCK_PADRAO: FCK_PADRAO, N_MAX: N_MAX, CLASSES: CLASSES, CHUMB: CHUMB, PLACAS: PLACAS };
  global.MetalLigDim = MetalLigDim;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalLigDim;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

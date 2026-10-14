/* =====================================================================
 * acoligcalc2.js — DIMENSIONAMENTO DAS TIPOLOGIAS DE LIGAÇÃO do catálogo
 * (js/acoligtipos.js): motor PURO, ES5, sem DOM, Node-testável.
 *
 * REUSA o js/acoligcalc.js (AcoLigCalc): parafuso à tração, ao cisalhamento,
 * pressão de contato, esmagamento em chapa fina, solda de filete, concreto,
 * colapso por rasgamento, furo-padrão, perna mínima — e as ligações que ele já
 * dimensiona (placa de base, chapa de extremidade, clip de terça, barra
 * redonda). Aqui entram as tipologias novas, com o MESMO formato de saída:
 *   { ok, razao, governante, tipo, tipologia, dimensoes, desenho (parâmetros
 *     da macro do js/metalligacao.js, em metros), resumo, verificacoes:
 *     [{ nome, item, passos: [{rotulo, formula, valor, extra}], resistencia,
 *        solicitante, unidade, razao }], reforcos: [texto], notas: [texto],
 *     naoVerificado: [texto], estimativa?, sugestao? }
 *
 * ENTRADA comum (mm, kN, kN·m):
 *   { viga: {d, bf, tw, tf, r}, apoio (ou pilar): {d, bf, tw, tf, r},
 *     face: "mesa"|"alma" (a face do apoio que recebe a viga),
 *     acoViga {fy, fu}, acoApoio {fy, fu}, aco {fy, fu} (chapas/cantoneiras —
 *     padrão ASTM A36), parafuso {id (classe), fub} (padrão ASTM A325, 825 MPa),
 *     eletrodo {fw} (padrão E70XX, 485 MPa),
 *     esforcos: [{ comb, V, M, N (+ tração) }] }
 * Cada função escolhe o MENOR arranjo que passa (parafuso, número de linhas,
 * espessura) e, se nenhum passar, devolve o maior com `sugestao`.
 *
 * NORMA: ABNT NBR 8800:2024 em vigor; formulação da NBR 8800:2008 em tabela
 * (itens citados), com o cisalhamento do parafuso da 2024 (AcoLigCalc). Nós
 * tubulares: ABNT NBR 16239:2013, que adota a formulação do EN 1993-1-8:2005
 * (cap. 7) — conferir o item no texto. Métodos de prática corrente (método
 * elástico do grupo de parafusos e de solda, largura de Whitmore a 30°, K = 0,65
 * no gusset comprimido) são ditos como tais no passo.
 * O que não é verificado sai em `naoVerificado` (vai para a tela e o memorial).
 * Teste: node tools/test-aco-ligsugere.js (e tools/test-aco-ligtipos.js)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function LC() { return dep("AcoLigCalc", "./acoligcalc.js"); }
  function Tip() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function Nor() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(v) { return v * v; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cima5(v) { return Math.ceil(v / 5 - 1e-9) * 5; }
  function cima10(v) { return Math.ceil(v / 10 - 1e-9) * 10; }
  function gamas() { var M = Mat(); return M ? M.GAMA : { a1: 1.10, a2: 1.35, w1: 1.25, w2: 1.35, c: 1.4 }; }
  var E = 200000;
  var ED08 = "NBR 8800:2008", ED24 = "NBR 8800:2024", ED16239 = "NBR 16239:2013 (confirmada em 2022; formulação do EN 1993-1-8:2005, cap. 7 — conferir o item e se a NBR 8800:2024 prevalece para tubos)", PRATICA = "prática corrente de ligação (não é item de norma)";
  var CHAPAS = [6.3, 8, 9.5, 12.5, 16, 19, 22.4, 25, 31.5, 37.5, 44.5, 50];
  var PF = [{ id: "M16", d: 16 }, { id: "M20", d: 20 }, { id: "M22", d: 22 }, { id: "M24", d: 24 }];
  var ANG = [{ cat: "L76X76X6.4", a: 76.2, t: 6.35, xc: 21.2 }, { cat: "L89X89X7.9", a: 88.9, t: 7.94, xc: 25 }, { cat: "L102X102X9.5", a: 101.6, t: 9.53, xc: 28.4 }, { cat: "L102X102X12.7", a: 101.6, t: 12.7, xc: 29.7 }];
  var ANG_ASSENTO = [{ cat: "L102X102X12.7", a: 101.6, t: 12.7 }, { cat: "L127X127X12.7", a: 127, t: 12.7 }, { cat: "L152X152X15.9", a: 152.4, t: 15.9 }, { cat: "L152X152X19", a: 152.4, t: 19.05 }];
  var FOLGA = 12.7;   /* folga de montagem viga → face do apoio (mm) */

  function bordaMin(d, tipo) { var N = Nor(); if (N && N.bordaMin) { var r = N.bordaMin(d, tipo || "laminada"); if (r && r.e) return r.e; } return Math.ceil((tipo === "serra" ? 1.75 : 1.25) * d); }
  function furo(d) { var L = LC(); return L && L.furoPadrao ? L.furoPadrao(d) : d + 1.5; }
  function FvRd(d, fub) { return LC().parafusoCisal(d, fub, true); }
  function FtRd(d, fub) { return LC().parafusoTracao(d, fub); }
  function Fc(d, t, fu, lf) { return LC().pressaoContato(d, t, fu, lf); }
  function soldaMm(a, fw, fy) { return LC().soldaFilete(a, 1, fw, fy); }
  function pernaMin(t) { return LC().pernaMinima(t); }
  function chi(l0) { return l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0); }   /* NBR 8800, 5.3.3 */

  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos, resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0) }; }
  /* DISTÂNCIA À BORDA (NBR 8800, 6.3.11 e Tabela 14) de uma fila de furos: disponível × mínima (revisão: C3) */
  function vBorda(nome, disp, d, tipo) {
    var m = bordaMin(d, tipo || "laminada"), v = verif("Distância à borda — " + nome, ED08 + ", 6.3.11 e Tabela 14 (borda " + (tipo || "laminada") + ")",
      [passo("Disponível", "", br(disp, 1) + " mm"), passo("Mínima", "Tabela 14, db = " + br(d, 0) + " mm", br(m, 0) + " mm")], disp, m, "mm");
    v.razao = disp > 0 ? m / disp : Infinity; return v;
  }
  function apoioComMesa(e) { return e.face === "mesa" && e.apoio && num(e.apoio.bf, 0) > 0; }
  function fecha(vs) { var rz = 0, gov = null; vs.forEach(function (v) { if (v.razao > rz) { rz = v.razao; gov = v.nome; } }); return { razao: rz, governante: gov, ok: rz <= 1.0 + 1e-9 }; }

  /* ------------------------------------------------ entrada normalizada */
  function ent(p) {
    p = p || {};
    var esf = arr(p.esforcos), V = 0, M = 0, Nt = 0, Nc = 0, cV = "", cM = "";
    esf.forEach(function (s) {
      var v = Math.abs(num(s.V, 0)), m = Math.abs(num(s.M, 0)), n = num(s.N, 0);
      if (v > V) { V = v; cV = s.comb || ""; } if (m > M) { M = m; cM = s.comb || ""; }
      if (n > Nt) Nt = n; if (-n > Nc) Nc = -n;
    });
    var ap = p.apoio || p.pilar || {};
    return {
      viga: p.viga || {}, apoio: ap, face: p.face === "alma" ? "alma" : (p.face === "nenhuma" ? "nenhuma" : "mesa"),
      fyV: num(p.acoViga && p.acoViga.fy, 345), fuV: num(p.acoViga && p.acoViga.fu, 450),
      fyA: num(p.acoApoio && p.acoApoio.fy, num(p.acoPilar && p.acoPilar.fy, 345)), fuA: num(p.acoApoio && p.acoApoio.fu, num(p.acoPilar && p.acoPilar.fu, 450)),
      bordaChapa: /^(serra|tesoura)$/.test(String(p.corte || "")) ? "serra" : "laminada", fy: num(p.aco && p.aco.fy, 250), fu: num(p.aco && p.aco.fu, 400), acoId: (p.aco && p.aco.id) || "ASTM A36",
      fub: num(p.parafuso && p.parafuso.fub, 825), classe: (p.parafuso && p.parafuso.id) || "ASTM A325", fw: num(p.eletrodo && p.eletrodo.fw, 485),
      V: V, M: M, Nt: Nt, Nc: Nc, combV: cV, combM: cM, esf: esf, estimativa: !!p.estimativa,
      tApoio: p.face === "alma" ? num(ap.tw, 8) : num(ap.tf, 10)
    };
  }
  function comb(c) { return c ? "combinação " + c : ""; }
  /* força máxima num parafuso de uma LINHA de n parafusos (passo s) com carga V a uma excentricidade e — método
     elástico (vetorial), a favor da segurança em relação ao centro instantâneo de rotação */
  function linhaExcentrica(n, s, V, e) {
    var ys = [], Iy = 0; for (var i = 0; i < n; i++) { var y = (i - (n - 1) / 2) * s; ys.push(y); Iy += y * y; }
    var ymax = (n - 1) / 2 * s, Fv = V / n, Fh = Iy > 0 ? V * e * ymax / Iy : 0;
    return { F: Math.sqrt(Fv * Fv + Fh * Fh), Fv: Fv, Fh: Fh, Iy: Iy };
  }
  function sumBearing(n, d, t, fu, ev, s, bordaAberta) {
    /* pressão de contato somada numa linha: o furo da ponta tem lf = ev − dh/2 (se a borda está do lado da força),
       os demais lf = s − dh */
    var dh = furo(d), tot = 0;
    for (var i = 0; i < n; i++) tot += Fc(d, t, fu, i === 0 ? (bordaAberta ? Infinity : ev - dh / 2) : s - dh);
    return { total: tot, ponta: Fc(d, t, fu, bordaAberta ? Infinity : ev - dh / 2), meio: Fc(d, t, fu, s - dh), dh: dh };
  }

  /* ================================================================ FORÇAS LOCALIZADAS NO PILAR (5.7)
   * c = apoio {d, bf, tw, tf, r}; Ff (kN) força de cada mesa da viga; o = { fy, tfViga, perto (a força a menos de d
   * do topo do pilar), soMesa: false } → { vs, enrij, R } */
  function pilarLocal(c, Ff, o) {
    var g = gamas(), fy = num(o.fy, 345), k = num(c.tf, 10) + num(c.r, 0), ln = num(o.ln, num(o.tfViga, 10) + 10), perto = !!o.perto, vs = [];
    var Rmesa = (perto ? 0.5 : 1) * 6.25 * c.tf * c.tf * fy / g.a1 / 1000;
    var Resc = 1.10 * ((perto ? 2.5 : 5) * k + ln) * fy * c.tw / g.a1 / 1000;
    var Renr = (perto ? 0.33 : 0.66) * c.tw * c.tw * (1 + 3 * (ln / c.d) * Math.pow(c.tw / c.tf, 1.5)) * Math.sqrt(E * fy * c.tf / c.tw) / g.a1 / 1000;
    var R = Math.min(Rmesa, Resc, Renr), enrij = null;
    var ps = [passo("Flexão local da mesa (" + ED08 + ", 5.7.2)", (perto ? "0,5·" : "") + "6,25·tf²·fy/γa1", br(Rmesa, 1) + " kN", perto ? "força a menos de 10·tf do topo: 50 %" : ""),
              passo("Escoamento local da alma (5.7.3)", "1,10·(" + (perto ? "2,5" : "5") + "k + ln)·fy·tw/γa1", br(Resc, 1) + " kN", "k = tf + r = " + br(k, 1) + " mm; ln = " + br(ln, 0) + " mm"),
              passo("Enrugamento da alma (5.7.4)", (perto ? "0,33" : "0,66") + "·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Renr, 1) + " kN"),
              passo("Força da mesa da viga", "Ff", br(Ff, 1) + " kN")];
    if (Ff > R || o.forcarEnrij) {
      var bs = Math.floor((c.bf - c.tw) / 2 - 5), lim = 0.56 * Math.sqrt(E / fy), ts = null;
      for (var i = 0; i < CHAPAS.length; i++) {
        var t = CHAPAS[i]; if (t < Math.max(num(o.tfViga, 8) / 2, 6.3) || bs / t > lim) continue;
        var Rn = Resc + 2 * (bs - 15) * t * fy / g.a1 / 1000;
        if (Rn >= Ff) { ts = t; R = Rn; break; }
      }
      if (ts == null) { ts = CHAPAS[CHAPAS.length - 1]; R = Resc + 2 * (bs - 15) * ts * fy / g.a1 / 1000; }
      enrij = { b: bs, t: ts, n: 2, texto: "par de enrijecedores de continuidade " + bs + " × " + br(ts, 1) + " mm no pilar, na altura de cada mesa da viga" };
      ps.push(passo("Com " + enrij.texto, "escoamento da alma + 2·(b − 15)·t·fy/γa1 (chanfro de 15 mm)", br(R, 1) + " kN", "b/t = " + br(bs / ts, 1) + " ≤ 0,56·√(E/fy) = " + br(lim, 1) + " (5.7.9); t ≥ tf da viga/2"));
    }
    vs.push(verif("Mesa e alma do pilar sob a força da mesa da viga" + (enrij ? " — com enrijecedores" : ""), ED08 + ", 5.7 (forças localizadas)", ps, R, Ff));
    return { vs: vs, enrij: enrij, R: R };
  }
  /* PAINEL DA ALMA DO PILAR (cisalhamento do binário) → chapa de reforço da alma (dupla) se preciso */
  function painel(c, Ff, fy) {
    var g = gamas(), Vp = 0.60 * fy * c.d * c.tw / g.a1 / 1000, ref = null, ps = [passo("Força no painel", "Ff = M/(d − tf) da viga", br(Ff, 1) + " kN"), passo("Resistente da alma", "0,60·d·tw·fy/γa1", br(Vp, 1) + " kN")];
    if (Ff > Vp) {
      for (var i = 0; i < CHAPAS.length; i++) { var t = CHAPAS[i], V2 = 0.60 * fy * c.d * (c.tw + t) / g.a1 / 1000; if (V2 >= Ff || i === CHAPAS.length - 1) { ref = { t: t, texto: "chapa de reforço da alma do pilar t = " + br(t, 1) + " mm (soldada nas mesas, na altura do nó)" }; Vp = V2; break; } }
      ps.push(passo("Com " + ref.texto, "0,60·d·(tw + tr)·fy/γa1", br(Vp, 1) + " kN", "alternativa: enrijecedor diagonal no painel"));
    }
    return { v: verif("Painel da alma do pilar ao cisalhamento" + (ref ? " — com chapa de reforço" : ""), ED08 + ", 5.7 — Vpl = 0,60·d·tw·fy/γa1 (sem a parcela da força axial)", ps, Vp, Ff), reforco: ref };
  }

  /* ================================================================ CANTONEIRA DUPLA (e simples) NA ALMA
   * op = { soldadaNaViga, simples, recorte: { topo (mm, altura do recorte), ev (mm, do recorte ao 1º furo) } } */
  function cantoneiraDupla(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, V = e.V, nA = op.simples ? 1 : 2, melhor = null, ultimo = null;
    var Lmax = v.d - (op.recorte ? num(op.recorte.topo, 0) : num(v.tf, 0) + num(v.r, 0)) - num(v.tf, 0) - num(v.r, 0) - 20;
    for (var ia = 0; ia < ANG.length && !melhor; ia++) {
      for (var ip = 0; ip < PF.length && !melhor; ip++) {
        for (var n = 2; n <= 9 && !melhor; n++) {
          var r = avaliar(ANG[ia], PF[ip], n); if (!r) continue;
          ultimo = r; if (r.ok) melhor = r;
        }
      }
    }
    if (!melhor) {
      if (!ultimo) return { ok: false, razao: Infinity, governante: "altura da alma", tipo: op.simples ? "cantoneiraSimples" : "cantoneiraDupla", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "A alma da viga é baixa demais para cantoneira na alma (" + br(Lmax, 0) + " mm úteis).", sugestao: "Chapa de topo curta ou cantoneira de assento." };
      ultimo.sugestao = op.simples ? "Cantoneira dupla (dois planos de corte) ou chapa simples mais espessa." : "Chapa de topo ou assento enrijecido (reação alta para a alma da viga).";
      return ultimo;
    }
    return melhor;

    function avaliar(ct, pf, n) {
      var d = pf.d, s = cima5(3 * d), ev = cima5(bordaMin(d, "serra")), La = (n - 1) * s + 2 * ev;
      if (La > Lmax + 1e-6) return null;
      var dh = furo(d), dh2 = dh + 2, gW = cima5(Math.max(0.55 * ct.a, FOLGA + bordaMin(d, "serra"))), ehA = ct.a - gW, gS = gW, ehS = ct.a - gS;
      var fvr = FvRd(d, e.fub), vs = [], nv = [];
      var tw = num(v.tw, 6), webPorBolt = V / n;
      if (!op.soldadaNaViga) {
        var lx = op.simples ? linhaExcentrica(n, s, V, gW + tw / 2) : null;
        var Fb = op.simples ? lx.F : webPorBolt, cap = op.simples ? fvr : 2 * fvr;
        vs.push(verif("Parafusos na alma da viga ao cisalhamento (" + n + " × " + pf.id + ", " + (op.simples ? "1 plano, com excentricidade" : "2 planos") + ")", ED24 + ", 6.3.3.2 (Fv,Rd = 0,45·Ab·fub/γa2)" + (op.simples ? "; excentricidade pelo método elástico (" + PRATICA + ")" : ""),
          [passo("Fv,Rd por plano", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Força por parafuso", op.simples ? "√((V/n)² + (V·e·ymáx/Σy²)²), e = g + tw/2 = " + br(gW + tw / 2, 0) + " mm" : "V/n", br(Fb, 1) + " kN", comb(e.combV))], cap, Fb));
        var bw = sumBearing(n, d, tw, e.fuV, op.recorte ? num(op.recorte.ev, ev) : ev, s, !op.recorte);
        vs.push(verif("Pressão de contato na alma da viga (tw = " + br(tw, 2) + " mm)", ED08 + ", 6.3.3.3",
          [passo("Soma das resistências dos furos", "Σ mín(1,2·lf·t·fu; 2,4·db·t·fu)/γa2", br(bw.total, 1) + " kN", op.recorte ? "furo de cima a " + br(num(op.recorte.ev, ev), 0) + " mm do recorte" : "alma contínua acima do 1º furo")], bw.total, op.simples ? lx.F * n : V));
      } else {
        /* solda das cantoneiras na alma: filete em C (a aba inteira na vertical + dois retornos), carga na face do apoio —
           método elástico do grupo de solda */
        var b = ct.a - FOLGA, L = La, xb = b * b / (2 * b + L), J = (8 * b * b * b + 6 * b * L * L + L * L * L) / 12 - Math.pow(b, 4) / (2 * b + L), ec = ct.a - xb, T = V / nA * ec;
        var fv = V / nA / (L + 2 * b) + T * (b - xb) / J, fh = T * (L / 2) / J, f = Math.sqrt(fv * fv + fh * fh) * 1000;
        var aW = Math.max(pernaMin(Math.max(ct.t, tw)), 5), aMax = Math.max(aW, Math.floor(Math.min(ct.t, tw) > 6.35 ? Math.min(ct.t, tw) - 1.5 : Math.min(ct.t, tw))), capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyV)) * 1000;
        while (capW < f && aW < aMax) { aW++; capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyV)) * 1000; }
        vs.push(verif("Solda das cantoneiras na alma da viga (filete " + aW + " mm em C: " + br(L, 0) + " + 2 × " + br(b, 0) + " mm)", ED08 + ", 6.2.5 e Tabela 10; grupo de solda pelo método elástico (" + PRATICA + ")",
          [passo("Excentricidade", "e = aba − x̄", br(ec, 1) + " mm", "x̄ = b²/(2b + L) = " + br(xb, 1) + " mm"), passo("Momento polar do cordão", "J = (8b³ + 6bL² + L³)/12 − b⁴/(2b + L)", br(J / 1000, 0) + "·10³ mm³"),
           passo("Força no ponto mais solicitado", "√[(V/(L + 2b) + T·(b − x̄)/J)² + (T·(L/2)/J)²]", br(f, 0) + " N/mm", comb(e.combV)), passo("Resistência por mm", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(capW, 0) + " N/mm")], capW, f, "N/mm"));
        var Vweb = 0.6 * e.fyV * tw * L / g.a1 / 1000;
        vs.push(verif("Alma da viga ao cisalhamento junto à solda", ED08 + ", 6.5.5 (0,60·fy·Agv/γa1)", [passo("Resistente", "0,60·fy·tw·L/γa1", br(Vweb, 1) + " kN")], Vweb, V));
      }
      /* lado do apoio */
      var nS = nA * n, FbS = V / nS;
      if (apoioComMesa(e)) vs.push(vBorda("furos das cantoneiras na mesa do apoio", op.simples ? e.apoio.bf / 2 - (tw / 2 + gS) : (e.apoio.bf - (tw + 2 * gS)) / 2, d, "laminada"));
      vs.push(verif("Parafusos no apoio ao cisalhamento (" + nS + " × " + pf.id + ", 1 plano)", ED24 + ", 6.3.3.2", [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Força por parafuso", "V/" + nS, br(FbS, 1) + " kN")], fvr, FbS));
      var bS = sumBearing(n, d, e.tApoio, e.fuA, ev, s, true);
      vs.push(verif("Pressão de contato no apoio (" + (e.face === "alma" ? "alma" : "mesa") + " t = " + br(e.tApoio, 2) + " mm)", ED08 + ", 6.3.3.3", [passo("Por parafuso", "2,4·db·t·fu/γa2 (sem borda na direção da força)", br(bS.ponta, 1) + " kN")], bS.ponta, FbS));
      var bA = sumBearing(n, d, ct.t, e.fu, ev, s, false);
      vs.push(verif("Pressão de contato nas cantoneiras (t = " + br(ct.t, 2) + " mm)", ED08 + ", 6.3.3.3",
        [passo("Furo da ponta (borda de baixo)", "1,2·lf·t·fu/γa2, lf = ev − dh/2 = " + br(ev - bA.dh / 2, 1) + " mm", br(bA.ponta, 1) + " kN"), passo("Furos do meio", "lf = s − dh = " + br(s - bA.dh, 1) + " mm", br(bA.meio, 1) + " kN"), passo("Soma × " + nA + " cantoneira(s)", "", br(nA * bA.total, 1) + " kN")], nA * bA.total, V));
      var Agv = nA * La * ct.t, Anv = nA * (La - n * dh2) * ct.t, VgRd = 0.60 * e.fy * Agv / g.a1 / 1000, VnRd = 0.60 * e.fu * Anv / g.a2 / 1000;
      vs.push(verif("Cantoneira(s) ao cisalhamento (área bruta e líquida)", ED08 + ", 6.5.5",
        [passo("Escoamento da área bruta", "0,60·fy·Ag/γa1, Ag = " + nA + "·La·t = " + br(Agv, 0) + " mm²", br(VgRd, 1) + " kN"), passo("Ruptura da área líquida", "0,60·fu·An/γa2, An = " + nA + "·(La − n·(dh + 2))·t = " + br(Anv, 0) + " mm²", br(VnRd, 1) + " kN")], Math.min(VgRd, VnRd), V));
      [["aba no apoio", ehS], ["aba na alma", ehA]].forEach(function (q) {
        if (op.soldadaNaViga && q[0] === "aba na alma") return;
        var rs = LC().rasgamento({ t: ct.t, fy: e.fy, fu: e.fu, lv: La - ev, furosV: n - 0.5, lt: q[1], furosT: 0.5, dh: dh2, Cts: 1 });
        vs.push(verif("Colapso por rasgamento das cantoneiras (" + q[0] + ")", ED08 + ", 6.5.6",
          [passo("Áreas por cantoneira", "Agv = (La − ev)·t; Anv = Agv − (n − 0,5)·dh·t; Ant = (eh − dh/2)·t", "Agv " + br(rs.Agv, 0) + "; Anv " + br(rs.Anv, 0) + "; Ant " + br(rs.Ant, 0) + " mm²", "eh = " + br(q[1], 1) + " mm; dh = furo + 2 = " + br(dh2, 1) + " mm"),
           passo("Fr,Rd × " + nA, "(0,60·fu·Anv + Cts·fu·Ant)/γa2 ≤ (0,60·fy·Agv + Cts·fu·Ant)/γa2", br(nA * rs.Rd, 1) + " kN")], nA * rs.Rd, V));
      });
      if (op.simples) {
        var Mab = V * gS / 1000, MRd = La * ct.t * ct.t / 4 * e.fy / g.a1 / 1e6;
        vs.push(verif("Aba da cantoneira no apoio à flexão (excentricidade)", "momento plástico La·t²·fy/4/γa1 (" + PRATICA + ")", [passo("Momento", "V·g", br(Mab, 2) + " kN·m", "g = " + br(gS, 0) + " mm"), passo("Resistente", "La·t²·fy/(4·γa1)", br(MRd, 2) + " kN·m")], MRd, Mab, "kN·m"));
      }
      var hW = v.d - (op.recorte ? num(op.recorte.topo, 0) : 0), VwRd = Math.min(0.60 * e.fyV * hW * tw / g.a1, 0.60 * e.fuV * (hW - (op.soldadaNaViga ? 0 : n * dh2)) * tw / g.a2) / 1000;
      vs.push(verif("Alma da viga ao cisalhamento na ligação" + (op.recorte ? " (seção recortada)" : ""), ED08 + ", 6.5.5 (bruta e líquida)", [passo("Resistente", "mín(0,60·fy·h·tw/γa1; 0,60·fu·(h − n·dh)·tw/γa2)", br(VwRd, 1) + " kN", "h = " + br(hW, 0) + " mm")], VwRd, V));
      var eMinL = bordaMin(d, "laminada"), eMinS = bordaMin(d, "serra");
      var vb = verif("Distâncias à borda (furos da cantoneira)", ED08 + ", 6.3.11 e Tabela 14", [passo("Ponta serrada (vertical)", "ev ≥ " + br(eMinS, 0) + " mm", br(ev, 0) + " mm"), passo("Borda da aba (laminada)", "eh ≥ " + br(eMinL, 0) + " mm", br(Math.min(ehA, ehS), 1) + " mm")], Math.min(ev / eMinS, Math.min(ehA, ehS) / eMinL), 1, "");
      vs.push(vb);
      var fe = fecha(vs);
      return {
        ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: op.simples ? "cantoneiraSimples" : "cantoneiraDupla",
        dimensoes: { cat: ct.cat, n: n, comprimento: La, parafuso: pf.id, classe: e.classe, passo: s, borda: ev, gage: gW, solda: op.soldadaNaViga ? "filete em C na alma" : null },
        desenho: { cat: ct.cat, parafuso: pf.id, linhas: n, comprimento: La / 1000, gage: gW / 1000, simples: !!op.simples },
        resumo: (op.simples ? "Cantoneira simples " : "Cantoneiras duplas ") + ct.cat.replace(/X/g, " × ").replace(/^L/, "L ").replace(/(\d)\.(\d)/g, "$1,$2") + " × " + br(La, 0) + " mm, " + n + " linha(s) de " + pf.id + " " + e.classe + (op.soldadaNaViga ? " no apoio; soldadas na alma da viga" : " na alma e no apoio"),
        verificacoes: vs, reforcos: [], notas: ["Folga de montagem de " + br(FOLGA, 1) + " mm entre a ponta da viga e o apoio; furo-padrão (db + 1,5 mm)."], naoVerificado: nv
      };
    }
  }
  function cantoneiraSimples(p) { return cantoneiraDupla(p, { simples: true }); }

  /* ================================================================ CHAPA SIMPLES DE CISALHAMENTO */
  function chapaSimples(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, V = e.V, a = num(p.a, 75), melhor = null, ultimo = null, ultDuct = null;
    var Lmax = v.d - (op.recorte ? num(op.recorte.topo, 0) : num(v.tf, 0) + num(v.r, 0)) - num(v.tf, 0) - num(v.r, 0) - 15;
    for (var ip = 0; ip < PF.length && !melhor; ip++) for (var it = 0; it < 6 && !melhor; it++) for (var n = 2; n <= 9 && !melhor; n++) {
      var pf = PF[ip], t = CHAPAS[it];
      var r = avaliar(pf, t, n); if (!r) continue;
      if (t > pf.d / 2 + 1.6) { if (r.ok && !ultDuct) ultDuct = r; continue; }   /* ductilidade (prática corrente) */
      ultimo = r; if (r.ok) melhor = r;
    }
    if (!melhor && ultDuct) { melhor = ultDuct; melhor.bloqueante = ["chapa acima da regra de ductilidade (t > db/2 + 1,6 mm): a rotação da ligação flexível não está garantida"]; melhor.notas.push("A chapa passa da regra de ductilidade (t ≤ db/2 + 1,6 mm): a rotação da ligação pode exigir a viga como rotulada com outra solução — conferir."); melhor.naoVerificado.push("Ductilidade da chapa simples: t > db/2 + 1,6 mm (" + PRATICA + ")."); }
    if (!melhor) { if (!ultimo) return { ok: false, razao: Infinity, governante: "altura da alma", tipo: "chapaSimples", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Alma baixa demais para chapa simples.", sugestao: "Chapa de topo curta ou assento." }; ultimo.sugestao = "Cantoneira dupla (dois planos de corte) ou chapa de topo."; return ultimo; }
    return melhor;

    function avaliar(pf, t, n) {
      var d = pf.d, s = cima5(3 * d), ev = cima5(bordaMin(d, e.bordaChapa)), Lp = (n - 1) * s + 2 * ev; if (Lp > Lmax + 1e-6) return null;
      var dh = furo(d), dh2 = dh + 2, eh = Math.max(cima5(bordaMin(d, e.bordaChapa)), 35), W = a + eh, fvr = FvRd(d, e.fub), tw = num(v.tw, 6), vs = [], nP = op.dupla ? 2 : 1;
      var lx = linhaExcentrica(n, s, V, a);
      vs.push(verif("Parafusos ao cisalhamento (" + n + " × " + pf.id + ", " + (nP === 2 ? "2 planos, " : "") + "com excentricidade)", ED24 + ", 6.3.3.2; método elástico do grupo (" + PRATICA + ")",
        [passo("Excentricidade", "e = distância da solda à linha de parafusos", br(a, 0) + " mm"), passo("Força no parafuso extremo", "√((V/n)² + (V·e·ymáx/Σy²)²)", br(lx.F, 1) + " kN", comb(e.combV)), passo("Fv,Rd" + (nP === 2 ? " × 2 planos" : ""), "0,45·Ab·fub/γa2", br(nP * fvr, 1) + " kN")], nP * fvr, lx.F));
      var bp = sumBearing(n, d, t, e.fu, ev, s, false), bw = sumBearing(n, d, tw, e.fuV, op.recorte ? num(op.recorte.ev, ev) : ev, s, !op.recorte);
      var FcMin = Math.min(nP * bp.ponta, nP * bp.meio, bw.ponta, bw.meio);
      vs.push(verif("Pressão de contato (chapa t = " + br(t, 1) + " mm e alma tw = " + br(tw, 2) + " mm)", ED08 + ", 6.3.3.3",
        [passo("Chapa: furo da borda", "1,2·lf·t·fu/γa2, lf = ev − dh/2", br(bp.ponta, 1) + " kN"), passo("Alma da viga", op.recorte ? "furo de cima junto ao recorte" : "2,4·db·t·fu/γa2", br(Math.min(bw.ponta, bw.meio), 1) + " kN"), passo("Força no parafuso extremo", "", br(lx.F, 1) + " kN")], FcMin, lx.F));
      var Ag = Lp * t, An = (Lp - n * dh2) * t, Vg = nP * 0.6 * e.fy * Ag / g.a1 / 1000, Vn = nP * 0.6 * e.fu * An / g.a2 / 1000;
      vs.push(verif("Chapa" + (nP === 2 ? "s (2)" : "") + " ao cisalhamento (área bruta e líquida)", ED08 + ", 6.5.5", [passo("Escoamento", "0,60·fy·Lp·t/γa1", br(Vg, 1) + " kN"), passo("Ruptura", "0,60·fu·(Lp − n·dh)·t/γa2", br(Vn, 1) + " kN")], Math.min(Vg, Vn), V));
      var rs = LC().rasgamento({ t: t, fy: e.fy, fu: e.fu, lv: Lp - ev, furosV: n - 0.5, lt: eh, furosT: 0.5, dh: dh2, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da chapa" + (nP === 2 ? " (× 2 chapas)" : ""), ED08 + ", 6.5.6", [passo("Áreas", "Agv = (Lp − ev)·t; Ant = (eh − dh/2)·t", "Agv " + br(rs.Agv, 0) + "; Anv " + br(rs.Anv, 0) + "; Ant " + br(rs.Ant, 0) + " mm²"), passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(nP * rs.Rd, 1) + " kN")], nP * rs.Rd, V));
      var Mp = V * a / 1000, MRd = nP * t * Lp * Lp / 4 * e.fy / g.a1 / 1e6;
      vs.push(verif("Chapa à flexão na linha de parafusos", "Z·fy/γa1 com Z = t·Lp²/4 (" + PRATICA + "; " + ED08 + ", 6.5)", [passo("Momento", "V·e", br(Mp, 2) + " kN·m"), passo("Resistente", "t·Lp²·fy/(4·γa1)", br(MRd, 2) + " kN·m")], MRd, Mp, "kN·m"));
      var tSup = op.apoioT != null ? op.apoioT : e.tApoio, aW = Math.max(pernaMin(Math.max(t, tSup)), 5), aMax = Math.max(aW, Math.floor(t > 6.35 ? t - 1.5 : t));
      var fv = V / nP / (2 * Lp), fm = 6 * V / nP * a / (2 * Lp * Lp), f = Math.sqrt(fv * fv + fm * fm) * 1000, capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000;
      while (capW < f && aW < aMax) { aW++; capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000; }
      vs.push(verif("Solda da chapa no apoio (filete " + aW + " mm dos dois lados, " + br(Lp, 0) + " mm)", ED08 + ", 6.2.5 e Tabela 10; cordão com V e M = V·e (método elástico)",
        [passo("Força por mm", "√[(V/2L)² + (6·V·e/(2L²))²]", br(f, 0) + " N/mm"), passo("Resistência por mm", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(capW, 0) + " N/mm")], capW, f, "N/mm"));
      var hW = v.d - (op.recorte ? num(op.recorte.topo, 0) : 0), VwRd = Math.min(0.60 * e.fyV * hW * tw / g.a1, 0.60 * e.fuV * (hW - n * dh2) * tw / g.a2) / 1000;
      vs.push(verif("Alma da viga ao cisalhamento na ligação", ED08 + ", 6.5.5", [passo("Resistente", "mín(bruta; líquida)", br(VwRd, 1) + " kN")], VwRd, V));
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: nP === 2 ? "chapaDupla" : "chapaSimples",
        dimensoes: { chapas: nP, t: t, largura: W, altura: Lp, n: n, parafuso: pf.id, classe: e.classe, a: a, borda: ev, solda: aW },
        desenho: { t: t / 1000, parafuso: pf.id, linhas: n, a: a / 1000, altura: Lp / 1000, largura: W / 1000, passo: s / 1000, dupla: nP === 2 },
        resumo: (nP === 2 ? "Tala dupla: 2 chapas " : "Chapa simples ") + br(W, 0) + " × " + br(Lp, 0) + " × " + br(t, 1) + " mm soldada no apoio (filete " + aW + " mm), " + n + " parafusos " + pf.id + " " + e.classe + " na alma da viga",
        verificacoes: vs, reforcos: [], notas: ["Furo-padrão na chapa e na alma; folga de " + br(FOLGA, 1) + " mm até o apoio."], naoVerificado: [] };
    }
  }

  /* ================================================================ CHAPA DE TOPO CURTA (flexível) */
  function chapaTopoCurta(p) {
    var e = ent(p), g = gamas(), v = e.viga, V = e.V, melhor = null, ultimo = null;
    var Lmax = v.d - 2 * (num(v.tf, 0) + num(v.r, 0)) - 10;
    for (var ip = 0; ip < PF.length && !melhor; ip++) for (var it = 0; it < 4 && !melhor; it++) for (var n = 2; n <= 8 && !melhor; n++) {
      var r = avaliar(PF[ip], CHAPAS[it], n); if (!r) continue; ultimo = r; if (r.ok) melhor = r;
    }
    if (!melhor) { if (!ultimo) return { ok: false, razao: Infinity, governante: "altura da alma", tipo: "chapaTopoCurta", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Alma baixa demais para chapa de topo curta." }; ultimo.sugestao = "Cantoneira dupla ou chapa de topo de altura total."; return ultimo; }
    return melhor;
    function avaliar(pf, t, n) {
      var d = pf.d, s = cima5(3 * d), ev = cima5(bordaMin(d, e.bordaChapa)), Lp = (n - 1) * s + 2 * ev; if (Lp > Lmax + 1e-6) return null;
      var dh = furo(d), dh2 = dh + 2, tw = num(v.tw, 6), eh = cima5(bordaMin(d, e.bordaChapa)), gage = cima5(Math.max(90, 3 * d, tw + 2 * 8 + 2 * dh)), bp = gage + 2 * eh, vs = [], fvr = FvRd(d, e.fub), nT = 2 * n;
      vs.push(verif("Parafusos ao cisalhamento (" + nT + " × " + pf.id + ")", ED24 + ", 6.3.3.2", [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Por parafuso", "V/" + nT, br(V / nT, 1) + " kN", comb(e.combV))], fvr, V / nT));
      var bp1 = sumBearing(n, d, t, e.fu, ev, s, false), bs1 = sumBearing(n, d, e.tApoio, e.fuA, ev, s, true);
      if (apoioComMesa(e)) vs.push(vBorda("furos na mesa do apoio", (e.apoio.bf - gage) / 2, d, "laminada"));
      vs.push(verif("Pressão de contato (chapa t = " + br(t, 1) + " mm; apoio t = " + br(e.tApoio, 1) + " mm)", ED08 + ", 6.3.3.3", [passo("Chapa: soma das 2 colunas", "Σ 1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(2 * bp1.total, 1) + " kN"), passo("Apoio por parafuso", "2,4·db·t·fu/γa2", br(bs1.ponta, 1) + " kN")], Math.min(2 * bp1.total, nT * bs1.ponta), V));
      var Ag = 2 * Lp * t, An = 2 * (Lp - n * dh2) * t, Vg = 0.6 * e.fy * Ag / g.a1 / 1000, Vn = 0.6 * e.fu * An / g.a2 / 1000;
      vs.push(verif("Chapa ao cisalhamento (2 planos junto à alma)", ED08 + ", 6.5.5", [passo("Escoamento", "0,60·fy·2·Lp·t/γa1", br(Vg, 1) + " kN"), passo("Ruptura", "0,60·fu·2·(Lp − n·dh)·t/γa2", br(Vn, 1) + " kN")], Math.min(Vg, Vn), V));
      var rs = LC().rasgamento({ t: t, fy: e.fy, fu: e.fu, lv: Lp - ev, furosV: n - 0.5, lt: eh, furosT: 0.5, dh: dh2, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da chapa (2 blocos)", ED08 + ", 6.5.6", [passo("Fr,Rd de um bloco", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rs.Rd, 1) + " kN"), passo("Dois blocos", "", br(2 * rs.Rd, 1) + " kN")], 2 * rs.Rd, V));
      var aW = Math.max(pernaMin(Math.max(t, tw)), 5), Lw = Lp - 2 * aW, FwRd = 2 * LC().soldaFilete(aW, Lw, e.fw, Math.min(e.fy, e.fyV));
      vs.push(verif("Solda da alma da viga na chapa (filete " + aW + " mm dos dois lados, " + br(Lw, 0) + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "2·mín(0,60·0,707·a·L·fw/γw2; 0,60·a·L·fy/γa1)", br(FwRd, 1) + " kN")], FwRd, V));
      var Vw = 0.6 * e.fyV * tw * Lp / g.a1 / 1000;
      vs.push(verif("Alma da viga ao cisalhamento na altura da chapa", ED08 + ", 6.5.5", [passo("Resistente", "0,60·fy·tw·Lp/γa1", br(Vw, 1) + " kN")], Vw, V));
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "chapaTopoCurta",
        dimensoes: { t: t, largura: bp, altura: Lp, n: nT, linhas: n, gage: gage, parafuso: pf.id, classe: e.classe, solda: aW },
        desenho: { t: t / 1000, parafuso: pf.id, linhas: n, gage: gage / 1000, largura: bp / 1000, altura: Lp / 1000, ext: 0, papel: "Chapa de topo curta" },
        resumo: "Chapa de topo curta " + br(bp, 0) + " × " + br(Lp, 0) + " × " + br(t, 1) + " mm soldada na alma (filete " + aW + " mm), " + nT + " parafusos " + pf.id + " " + e.classe + " (gabarito " + gage + " mm)",
        verificacoes: vs, reforcos: [], notas: ["Flexível: chapa fina (t ≤ 10 mm) e gabarito largo (≥ 90 mm) — " + PRATICA + "."], naoVerificado: t > 10 ? ["Rotação: chapa com t > 10 mm pode não se comportar como rótula (" + PRATICA + ")."] : [] };
    }
  }

  /* ================================================================ ASSENTO (cantoneira ou enrijecido) */
  function cantoneiraAssento(p, op) {
    op = op || {}; var blqA = [];
    var e = ent(p), g = gamas(), v = e.viga, R = e.V, tw = num(v.tw, 6), tf = num(v.tf, 10), k = tf + num(v.r, 0), vs = [], nv = [];
    /* comprimento de apoio necessário na ponta da viga (5.7.3 e 5.7.4, força a menos de d da ponta) */
    var ln1 = R * 1000 * g.a1 / (1.10 * e.fyV * tw) - 2.5 * k;
    var base = 0.33 * tw * tw * Math.sqrt(E * e.fyV * tf / tw) / g.a1 / 1000, ln2 = R > base ? (R / base - 1) * v.d / 3 * Math.pow(tf / tw, 1.5) : 0;
    var ln = Math.max(ln1, ln2, k, 25), Resc = 1.10 * (2.5 * k + ln) * e.fyV * tw / g.a1 / 1000, Renr = base * (1 + 3 * (ln / v.d) * Math.pow(tw / tf, 1.5));
    vs.push(verif("Alma da viga: escoamento local na ponta (ln = " + br(ln, 0) + " mm)", ED08 + ", 5.7.3 (força a menos de d da ponta)", [passo("Comprimento de apoio necessário", "ln = R·γa1/(1,10·fy·tw) − 2,5k", br(Math.max(ln1, 0), 0) + " mm", "k = " + br(k, 1) + " mm"), passo("Resistente", "1,10·(2,5k + ln)·fy·tw/γa1", br(Resc, 1) + " kN")], Resc, R));
    vs.push(verif("Alma da viga: enrugamento na ponta", ED08 + ", 5.7.4 (ln/d ≤ 0,2: " + br(ln / v.d, 2) + ")", [passo("Resistente", "0,33·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Renr, 1) + " kN")], Renr, R));
    var VwA = 0.60 * e.fyV * v.d * tw / g.a1 / 1000;
    vs.push(verif("Alma da viga ao cisalhamento no apoio", ED08 + ", 5.4.3 (0,60·fy·d·tw/γa1, alma compacta)", [passo("Resistente", "0,60·fy·d·tw/γa1", br(VwA, 1) + " kN")], VwA, R));
    if (ln / v.d > 0.2) nv.push("Enrugamento com ln/d > 0,2: a NBR 8800 (5.7.4) usa outra expressão — conferir.");
    var Lang = cima10(Math.max(num(v.bf, 100) + 20, 150)), melhor = null, dims = null, desenhoA = null;
    if (!op.enrijecido) {
      for (var i = 0; i < ANG_ASSENTO.length && !melhor; i++) {
        var a = ANG_ASSENTO[i], ef = Math.max(0, FOLGA + ln / 2 - (a.t + 10)), Mk = R * ef / 1000, MRd = Lang * a.t * a.t / 4 * e.fy / g.a1 / 1e6;
        if (a.a < ln + FOLGA && i < ANG_ASSENTO.length - 1) continue;
        var vA = verif("Aba de assento à flexão (" + a.cat + " × " + Lang + " mm)", "seção crítica a t + 10 mm do canto; La·t²·fy/4/γa1 (" + PRATICA + ")", [passo("Braço", "e = folga + ln/2 − (t + 10)", br(ef, 1) + " mm"), passo("Momento", "R·e", br(Mk, 2) + " kN·m"), passo("Resistente", "La·t²·fy/(4·γa1)", br(MRd, 2) + " kN·m")], MRd, Mk, "kN·m");
        if (vA.razao <= 1 || i === ANG_ASSENTO.length - 1) { melhor = a; vs.push(vA); if (a.a < ln + FOLGA) nv.push("A aba de assento (" + br(a.a, 0) + " mm) é menor que o apoio necessário (" + br(ln + FOLGA, 0) + " mm)."); }
      }
      var pf = PF[1], nb = 2;
      for (var ib = 0; ib < PF.length; ib++) { pf = PF[ib]; nb = R / FvRd(pf.d, e.fub) <= 2 ? 2 : 4; if (R / nb <= FvRd(pf.d, e.fub)) break; }
      var fvr = FvRd(pf.d, e.fub), Fcm = Math.min(Fc(pf.d, melhor.t, e.fu, Infinity), Fc(pf.d, e.tApoio, e.fuA, Infinity));
      var gxA = cima5(Math.max(3 * pf.d, 0.55 * num(v.bf, 100)));
      if (apoioComMesa(e)) vs.push(vBorda("furos do assento na mesa do apoio", (e.apoio.bf - gxA) / 2, pf.d, "laminada"));
      vs.push(vBorda("furos na ponta da cantoneira de assento", (Lang - gxA) / 2, pf.d, "serra"));
      vs.push(verif("Parafusos do assento no apoio (" + nb + " × " + pf.id + ")", ED24 + ", 6.3.3.2", [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Por parafuso", "R/" + nb, br(R / nb, 1) + " kN", comb(e.combV))], fvr, R / nb));
      vs.push(verif("Pressão de contato (assento e apoio)", ED08 + ", 6.3.3.3", [passo("Por parafuso", "2,4·db·t·fu/γa2 (furo longe da borda na direção da força)", br(Fcm, 1) + " kN")], Fcm, R / nb));
      dims = { cat: melhor.cat, comprimento: Lang, parafuso: pf.id, n: nb, ln: Math.round(ln), topo: "L89X89X6.4 (estabilidade)" };
      desenhoA = { cat: melhor.cat, comprimento: Lang / 1000, parafuso: pf.id, parafusos: nb };
    } else {
      var W = cima10(ln + FOLGA + 10), lim = 0.56 * Math.sqrt(E / e.fy), ts = null;
      for (var j = 0; j < CHAPAS.length; j++) { if (W / CHAPAS[j] <= lim && CHAPAS[j] >= tw) { var Rs = e.fy * (W - 15) * CHAPAS[j] / g.a1 / 1000; if (Rs >= R) { ts = CHAPAS[j]; break; } } }
      if (ts == null) ts = CHAPAS[CHAPAS.length - 1];
      var RsRd = e.fy * (W - 15) * ts / g.a1 / 1000;
      vs.push(verif("Enrijecedor do assento à compressão (" + W + " × " + br(ts, 1) + " mm)", ED08 + ", 5.7.9 (b/t ≤ 0,56·√(E/fy)) e escoamento no contato", [passo("b/t", "≤ " + br(lim, 1), br(W / ts, 1)), passo("Resistente", "fy·(W − 15)·t/γa1", br(RsRd, 1) + " kN")], RsRd, R));
      var Ls = cima10(Math.max(2 * W, 150)), es = FOLGA + W - ln / 2, aW = Math.max(pernaMin(Math.max(ts, e.tApoio)), 5), aMax = Math.max(aW, Math.floor(ts - 1.5));
      var fv = R / (2 * Ls), fm = 6 * R * es / (2 * Ls * Ls), f = Math.sqrt(fv * fv + fm * fm) * 1000, capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000;
      while (capW < f && aW < aMax) { aW++; capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000; }
      vs.push(verif("Solda do enrijecedor no apoio (filete " + aW + " mm, 2 × " + Ls + " mm)", ED08 + ", 6.2.5; cordão com R e M = R·e (método elástico)", [passo("Excentricidade", "e = folga + W − ln/2", br(es, 0) + " mm"), passo("Força por mm", "√[(R/2L)² + (6·R·e/(2L²))²]", br(f, 0) + " N/mm"), passo("Resistência por mm", "", br(capW, 0) + " N/mm")], capW, f, "N/mm"));
      if (e.face === "alma") { nv.push("Assento enrijecido na ALMA do pilar: flexão local da alma do pilar (fora do plano) não verificada."); blqA.push("assento enrijecido na alma do pilar: flexão da alma fora do plano não verificada"); }
      dims = { enrijecedor: { b: W, t: ts, h: Ls }, chapaAssento: { b: W, L: Lang }, solda: aW, ln: Math.round(ln) };
      desenhoA = { enrijecido: true, largura: W / 1000, comprimento: Lang / 1000, t: Math.max(ts, 12.5) / 1000, ts: ts / 1000, hs: Ls / 1000 };
    }
    var fe = fecha(vs);
    return { bloqueante: blqA, ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: op.enrijecido ? "assentoEnrijecido" : "cantoneiraAssento", dimensoes: dims, desenho: desenhoA,
      resumo: op.enrijecido ? "Assento enrijecido: chapa " + dims.chapaAssento.b + " × " + dims.chapaAssento.L + " mm e enrijecedor " + dims.enrijecedor.b + " × " + br(dims.enrijecedor.t, 1) + " × " + dims.enrijecedor.h + " mm soldado no apoio (filete " + dims.solda + " mm); cantoneira de topo L 89 de estabilidade" : "Cantoneira de assento " + dims.cat + " × " + dims.comprimento + " mm, " + dims.n + " parafusos " + dims.parafuso + " no apoio; cantoneira de topo L 89 de estabilidade",
      verificacoes: vs, reforcos: [], notas: ["A cantoneira de topo só dá estabilidade lateral (não leva carga) — construtiva."], naoVerificado: nv };
  }

  /* ================================================================ CHAPA DE EXTREMIDADE (estendida: o motor existente) */
  function vigaPilarRigida(p) {
    var e = ent(p);
    return { tipo: "joelho", viga: e.viga, pilar: e.apoio, aco: { id: e.acoId, fy: e.fy, fu: e.fu }, acoViga: { fy: e.fyV }, acoPilar: { fy: e.fyA, fu: e.fuA },
             parafuso: { id: e.classe, fub: e.fub }, eletrodo: { fw: e.fw }, esforcos: e.esf.map(function (s) { return { comb: s.comb, M: num(s.M, 0), V: num(s.V, 0), N: num(s.N, 0) }; }) };
  }
  function comNaoVer(r, e) {
    r.reforcos = r.reforcos || []; r.notas = r.notas || []; r.naoVerificado = r.naoVerificado || [];
    r.bloqueante = r.bloqueante || [];
    if (e.face === "alma") r.bloqueante.push("ligação de momento na alma do pilar (flexão da alma fora do plano) não verificada");
    if (e.face === "alma") r.naoVerificado.push("Ligação de momento na ALMA do pilar: a alma flete fora do plano e as verificações da mesa (5.7) não se aplicam — não verificado; prefira ligar na mesa (girar o pilar) ou use chapa de topo com enrijecedores entre as mesas do pilar.");
    return r;
  }
  function chapaExtendida(p, op) {
    op = op || {};
    var e = ent(p), r = LC().chapaExtremidade(vigaPilarRigida(p)); r = comNaoVer(r, e);
    r.tipo = "chapaExtendida";
    var d = r.dimensoes || {};
    if (d.enrijecedores) r.reforcos.push("Enrijecedores de continuidade: " + d.enrijecedores.texto);
    if (d.diagonal) r.reforcos.push("Painel: " + d.diagonal.texto + " (ou chapa de reforço da alma)");
    if (op.comEnrijecedor && !d.enrijecedores) {
      var pl = pilarLocal(e.apoio, e.M * 1000 / (e.viga.d - e.viga.tf), { fy: e.fyA, tfViga: e.viga.tf, perto: true, forcarEnrij: true });
      d.enrijecedores = pl.enrij; r.reforcos.push("Enrijecedores de continuidade (pedidos): " + pl.enrij.texto);
    }
    r.desenho = r.desenho || {}; r.desenho.enrijecedores = d.enrijecedores ? { t: d.enrijecedores.t / 1000 } : null;
    return r;
  }
  function chapaCumeeira(p) {
    var x = vigaPilarRigida(p); x.tipo = "cumeeira"; delete x.pilar;
    var r = LC().chapaExtremidade(x); r.tipo = "chapaCumeeira"; r.reforcos = []; r.notas = r.notas || []; r.naoVerificado = [];
    return r;
  }
  function emendaPilarChapa(p) {
    var e = ent(p), x = vigaPilarRigida(p); x.tipo = "cumeeira"; x.viga = e.apoio && e.apoio.d ? e.apoio : e.viga; delete x.pilar;
    var r = LC().chapaExtremidade(x); r.tipo = "emendaPilarChapa"; r.reforcos = []; r.notas = ["As faces das chapas em contato pleno levam a compressão; os parafusos levam a tração do momento."]; r.naoVerificado = [];
    r.resumo = String(r.resumo || "").replace(/^Cumeeira/, "Emenda de pilar");
    return r;
  }

  /* ================================================================ CHAPA DE EXTREMIDADE AJUSTADA (faceada) */
  function chapaAjustada(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, melhor = null, ultimo = null;
    for (var ip = 0; ip < PF.length && !melhor; ip++) for (var it = 2; it < CHAPAS.length && !melhor; it++) { var r = avaliar(PF[ip], CHAPAS[it]); ultimo = r; if (r.ok) melhor = r; }
    if (!melhor) { ultimo.sugestao = "Chapa de extremidade ESTENDIDA (braço maior) ou mísula."; return comNaoVer(ultimo, e); }
    return comNaoVer(melhor, e);
    function avaliar(pf, tp) {
      var d = pf.d, pfi = Math.max(35, d + 8), s = cima5(3 * d), h1 = v.d - 1.5 * v.tf - pfi, h2 = h1 - s, nT = 4, nTot = 8, vs = [];
      var Ft = e.M * 1000 / (2 * (h1 + h2)) + e.Nt / nT, Vb = e.V / nTot, ftr = FtRd(d, e.fub), fvr = FvRd(d, e.fub), it2 = sq(Ft / ftr) + sq(Vb / fvr);
      var gage = cima5(Math.max(3 * d, v.tw + 20 + 2 * d)), bp = Math.max(v.bf, gage + 2 * cima5(bordaMin(d, "laminada")));
      vs.push(verif("Parafusos à tração (2 linhas de 2 junto à mesa tracionada, " + pf.id + " " + e.classe + ")", ED08 + ", 6.3.3.1; distribuição plástica M = 2·Ft·(h1 + h2)",
        [passo("Braços", "h1 = d − 1,5·tf − pfi; h2 = h1 − s", br(h1, 0) + " e " + br(h2, 0) + " mm"), passo("Ft,Sd por parafuso", "M/(2·(h1 + h2)) + N/4", br(Ft, 1) + " kN", comb(e.combM)), passo("Ft,Rd", "0,75·Ab·fub/γa2", br(ftr, 1) + " kN")], ftr, Ft));
      vs.push(verif("Parafusos ao cisalhamento (" + nTot + ")", ED24 + ", 6.3.3.2", [passo("Fv,Sd", "V/" + nTot, br(Vb, 1) + " kN")], fvr, Vb));
      vs.push(verif("Tração + cisalhamento", ED08 + ", 6.3.3.4", [passo("(Ft/FtRd)² + (Fv/FvRd)²", "", br(it2, 3))], 1, it2, ""));
      var bl = pfi - d / 2, Msd = Ft * 1000 * bl / (bp / 2), MRd = tp * tp * e.fy / 4 / g.a1;
      if (apoioComMesa(e)) vs.push(vBorda("furos na mesa do pilar", (e.apoio.bf - gage) / 2, d, "laminada"));
      vs.push(vBorda("furos da chapa", (bp - gage) / 2, d, e.bordaChapa));
      vs.push(verif("Chapa à flexão (t = " + br(tp, 1) + " mm)", "T-stub sem efeito alavanca (a favor do parafuso); a " + ED24 + " mudou o método (conferir)", [passo("Braço", "b' = pfi − db/2", br(bl, 0) + " mm"), passo("Momento por mm", "Ft·b'/(bp/2)", br(Msd / 1000, 2) + " kN·m/m"), passo("Resistente", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, Msd / 1000, "kN·m/m"));
      var Ff = e.M * 1000 / (v.d - v.tf) + e.Nt / 2, FmRd = v.bf * v.tf * Math.min(e.fy, e.fyV) / g.a1 / 1000;
      vs.push(verif("Solda da mesa tracionada (penetração total)", ED08 + ", 6.2.5 e Tabela 8", [passo("Força", "M/(d − tf) + N/2", br(Ff, 1) + " kN"), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN")], FmRd, Ff));
      var rs = { reforcos: [] };
      if (e.apoio && e.apoio.d && e.face === "mesa") {
        var pl = pilarLocal(e.apoio, Ff, { fy: e.fyA, tfViga: v.tf, perto: !!p.topoPilar, ln: v.tf + 2 * 8 + 2 * tp, forcarEnrij: !!op.comEnrijecedor });
        vs = vs.concat(pl.vs); if (pl.enrij) rs.reforcos.push("Enrijecedores de continuidade: " + pl.enrij.texto); rs.enrij = pl.enrij;
        var pn = painel(e.apoio, e.M * 1000 / (v.d - v.tf), e.fyA); vs.push(pn.v); if (pn.reforco) rs.reforcos.push(pn.reforco.texto); rs.painel = pn.reforco;
      }
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "chapaAjustada",
        dimensoes: { t: tp, largura: bp, altura: v.d, parafuso: pf.id, d: d, n: nTot, gage: gage, enrijecedores: rs.enrij || null, reforcoAlma: rs.painel || null },
        desenho: { t: tp / 1000, parafuso: pf.id, ext: 0, gage: gage / 1000, largura: bp / 1000, linhas: 4, enrijecedores: rs.enrij ? { t: rs.enrij.t / 1000 } : null },
        resumo: "Chapa ajustada " + br(bp, 0) + " × " + br(v.d, 0) + " × " + br(tp, 1) + " mm, " + nTot + " parafusos " + pf.id + " " + e.classe + "; mesas em penetração total" + (rs.reforcos.length ? "; " + rs.reforcos.join("; ") : ""),
        verificacoes: vs, reforcos: rs.reforcos, notas: ["Semirrígida: a rigidez da ligação ajustada deve ser avaliada no modelo (NBR 8800, 6.1 — classificação das ligações)."], naoVerificado: ["Rigidez rotacional da ligação ajustada (classificação rígida/semirrígida): não calculada."] };
    }
  }

  /* ================================================================ TALAS DE MESA (viga → mesa do pilar) */
  function talasMesa(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, sold = op.meio === "soldada", melhor = null, ultimo = null;
    for (var it = 0; it < CHAPAS.length && !melhor; it++) {
      if (CHAPAS[it] < v.tf - 1e-9) continue;
      for (var ip = 0; ip < PF.length && !melhor; ip++) { var r = avaliar(CHAPAS[it], PF[ip]); ultimo = r; if (r.ok) melhor = r; if (sold) break; }
    }
    if (!melhor) { ultimo.sugestao = "Chapa de extremidade estendida com enrijecedores ou viga soldada direto."; return comNaoVer(ultimo, e); }
    return comNaoVer(melhor, e);
    function avaliar(tp, pf) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, s = cima5(3 * d), ev = cima5(bordaMin(d, "laminada")), vs = [];
      var bp = sold ? v.bf - 20 : v.bf, Ff = e.M * 1000 / (v.d + tp) + e.Nt / 2;
      var Ty = bp * tp * e.fy / g.a1 / 1000, Tu = (bp - (sold ? 0 : 2 * dh2)) * tp * e.fu / g.a2 / 1000;
      vs.push(verif("Tala tracionada (" + br(bp, 0) + " × " + br(tp, 1) + " mm)", ED08 + ", 5.2 e 6.5.3", [passo("Força na tala", "M/(d + tp) + N/2", br(Ff, 1) + " kN", comb(e.combM)), passo("Escoamento da área bruta", "b·t·fy/γa1", br(Ty, 1) + " kN"), passo(sold ? "Ruptura (sem furos)" : "Ruptura da área líquida (2 furos)", sold ? "b·t·fu/γa2" : "(b − 2·dh)·t·fu/γa2", br(Tu, 1) + " kN")], Math.min(Ty, Tu), Ff));
      var Lc = FOLGA + ev + 10, rr = tp / Math.sqrt(12), l0 = 0.65 * Lc / rr / Math.PI * Math.sqrt(e.fy / E), Nc = chi(l0) * bp * tp * e.fy / g.a1 / 1000;
      vs.push(verif("Tala comprimida (flambagem entre a face do pilar e o 1º parafuso)", ED24 + ", 5.3 (χ) — K = 0,65 (" + PRATICA + ")", [passo("Comprimento livre", "folga + ev + 10", br(Lc, 0) + " mm"), passo("λ0", "0,65·L/r/π·√(fy/E)", br(l0, 3)), passo("Nc,Rd", "χ·b·t·fy/γa1", br(Nc, 1) + " kN")], Nc, Ff));
      var nb = 0, dims = {};
      if (!sold) {
        var fvr = FvRd(d, e.fub); nb = Math.max(4, 2 * Math.ceil(Ff / fvr / 2));
        var nr = nb / 2, bpl = sumBearing(nr, d, tp, e.fu, ev, s, false), bfl = sumBearing(nr, d, v.tf, e.fuV, ev, s, false);
        vs.push(verif("Parafusos da tala na mesa da viga (" + nb + " × " + pf.id + ", 1 plano)", ED24 + ", 6.3.3.2", [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Por parafuso", "Ff/" + nb, br(Ff / nb, 1) + " kN")], fvr, Ff / nb));
        vs.push(verif("Pressão de contato (tala e mesa da viga)", ED08 + ", 6.3.3.3", [passo("Tala: 2 colunas", "Σ 1,2·lf·t·fu/γa2", br(2 * bpl.total, 1) + " kN"), passo("Mesa da viga: 2 colunas", "", br(2 * bfl.total, 1) + " kN")], Math.min(2 * bpl.total, 2 * bfl.total), Ff));
        var gg = cima5(Math.max(3 * d, v.tw + 2 * num(v.r, 0) + 2 * d)), rsg = LC().rasgamento({ t: v.tf, fy: e.fyV, fu: e.fuV, lv: 2 * ((nr - 1) * s + ev), furosV: 2 * (nr - 0.5), lt: v.bf - gg, furosT: 1, dh: dh2, Cts: 1 });
        vs.push(verif("Colapso por rasgamento da mesa da viga (blocos de fora)", ED08 + ", 6.5.6", [passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rsg.Rd, 1) + " kN", "gabarito " + gg + " mm")], rsg.Rd, Ff));
        vs.push(vBorda("furos na mesa da viga", (v.bf - gg) / 2, d, "laminada"));
        vs.push(vBorda("furos da tala", (bp - gg) / 2, d, e.bordaChapa));
        var AnM = (v.bf - 2 * dh2) * v.tf, FnM = Math.min(v.bf * v.tf * e.fyV / g.a1, AnM * e.fuV / g.a2) / 1000;
        vs.push(verif("Mesa da viga na seção dos furos (tração da tala na mesa)", ED08 + ", 5.2 e 6.5.3 (área bruta e líquida)", [passo("An", "(bf − 2·dh)·tf", br(AnM, 0) + " mm²"), passo("Resistente", "mín(bf·tf·fy/γa1; An·fu/γa2)", br(FnM, 1) + " kN")], FnM, Ff));
        dims = { parafuso: pf.id, n: nb, linhas: nr, gage: gg, comprimento: FOLGA + (nr - 1) * s + 2 * ev + 10 };
      } else {
        var aW = Math.max(pernaMin(Math.max(tp, v.tf)), 6), cap = soldaMm(aW, e.fw, Math.min(e.fy, e.fyV)), Lw = cima10(Math.max((Ff / cap - bp) / 2, 50));
        var FwRd = cap * (2 * Lw + bp);
        vs.push(verif("Solda da tala na mesa da viga (filete " + aW + " mm: 2 × " + Lw + " + " + br(bp, 0) + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "(2·Lw + b)·mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(FwRd, 1) + " kN")], FwRd, Ff));
        dims = { solda: aW, Lw: Lw, comprimento: FOLGA + Lw + 10 };
      }
      var cjp = bp * tp * Math.min(e.fy, e.fyA) / g.a1 / 1000;
      vs.push(verif("Solda da tala na mesa do pilar (penetração total)", ED08 + ", 6.2.5 e Tabela 8", [passo("Resistente", "b·t·fy/γa1 (metal-base)", br(cjp, 1) + " kN")], cjp, Ff));
      var ws = chapaSimples({ viga: v, apoio: e.apoio, face: e.face, aco: { fy: e.fy, fu: e.fu }, acoViga: { fy: e.fyV, fu: e.fuV }, acoApoio: { fy: e.fyA, fu: e.fuA }, parafuso: { id: e.classe, fub: e.fub }, eletrodo: { fw: e.fw }, esforcos: [{ comb: e.combV, V: e.V }] });
      ws.verificacoes.forEach(function (x) { x.nome = "Alma (chapa simples): " + x.nome; vs.push(x); });
      var refs = [], enr = null, pr = null;
      if (e.apoio && e.apoio.d && e.face === "mesa") {
        var pl = pilarLocal(e.apoio, Ff, { fy: e.fyA, tfViga: tp, perto: !!p.topoPilar, ln: tp + 10 }); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
        var pn = painel(e.apoio, e.M * 1000 / (v.d + tp), e.fyA); vs.push(pn.v); pr = pn.reforco; if (pr) refs.push(pr.texto);
      }
      var fe = fecha(vs);
      dims.t = tp; dims.largura = bp; dims.chapaAlma = ws.dimensoes; dims.enrijecedores = enr; dims.reforcoAlma = pr;
      var wd = ws.desenho || {}, nAl = num(ws.dimensoes && ws.dimensoes.n, 0);
      var des = { t: tp / 1000, largura: bp / 1000, parafuso: sold ? (wd.parafuso || "M20") : pf.id, linhas: sold ? 0 : nr, gage: sold ? null : gg / 1000, passo: s / 1000, soldada: sold, comprimento: dims.comprimento / 1000,
        alma: { t: wd.t, parafuso: wd.parafuso, linhas: wd.linhas, a: wd.a, altura: wd.altura, largura: wd.largura }, nTotal: (sold ? 0 : 2 * nb) + nAl };
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "talasMesa", dimensoes: dims, desenho: des,
        resumo: "Talas de mesa " + br(bp, 0) + " × " + br(dims.comprimento, 0) + " × " + br(tp, 1) + " mm " + (sold ? "soldadas na viga (filete " + dims.solda + " mm)" : "com " + dims.n + " parafusos " + dims.parafuso + " por mesa") + ", penetração total no pilar; alma: " + ws.resumo + (refs.length ? "; " + refs.join("; ") : ""),
        verificacoes: vs, reforcos: refs, notas: [], naoVerificado: [] };
    }
  }

  /* ================================================================ VIGA SOLDADA DIRETO NO PILAR */
  function soldadaDireta(p) {
    var e = ent(p), g = gamas(), v = e.viga, vs = [], refs = [];
    var Ff = e.M * 1000 / (v.d - v.tf) + e.Nt / 2, FmRd = v.bf * v.tf * Math.min(e.fyV, e.fyA) / g.a1 / 1000;
    vs.push(verif("Mesas da viga em penetração total", ED08 + ", 6.2.5 e Tabela 8 (resistência do metal-base)", [passo("Força na mesa", "M/(d − tf) + N/2", br(Ff, 1) + " kN", comb(e.combM)), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN")], FmRd, Ff));
    var hw = v.d - 2 * v.tf - 2 * num(v.r, 0), aW = Math.max(pernaMin(Math.max(v.tw, e.tApoio)), 5), FwA = 2 * LC().soldaFilete(aW, hw, e.fw, Math.min(e.fyV, e.fyA));
    vs.push(verif("Alma da viga (filete " + aW + " mm dos dois lados, " + br(hw, 0) + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "2·mín(0,60·0,707·a·L·fw/γw2; 0,60·a·L·fy/γa1)", br(FwA, 1) + " kN")], FwA, e.V));
    var enr = null, pr = null;
    if (e.apoio && e.apoio.d && e.face === "mesa") {
      var pl = pilarLocal(e.apoio, Ff, { fy: e.fyA, tfViga: v.tf, perto: !!p.topoPilar, ln: v.tf + 2 * 8 }); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
      var pn = painel(e.apoio, e.M * 1000 / (v.d - v.tf), e.fyA); vs.push(pn.v); pr = pn.reforco; if (pr) refs.push(pn.reforco.texto);
    }
    var fe = fecha(vs);
    return comNaoVer({ ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "soldadaDireta", dimensoes: { soldaMesas: "penetração total", soldaAlma: aW, enrijecedores: enr, reforcoAlma: pr }, desenho: { soldada: true, nTotal: 0 },
      resumo: "Viga soldada no pilar: mesas em penetração total, alma com filete " + aW + " mm" + (refs.length ? "; " + refs.join("; ") : ""), verificacoes: vs, reforcos: refs,
      notas: ["Penetração total: inspeção por ultrassom; cantoneira de montagem provisória."], naoVerificado: [] }, e);
  }
  function painelAlma(p) {
    var e = ent(p), pn = painel(e.apoio, e.M * 1000 / (e.viga.d - e.viga.tf), e.fyA), vs = [pn.v], fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "painelAlma", dimensoes: { reforcoAlma: pn.reforco }, desenho: pn.reforco ? { t: pn.reforco.t / 1000 } : null, resumo: pn.reforco ? pn.reforco.texto : "O painel da alma do pilar resiste sem reforço.", verificacoes: vs, reforcos: pn.reforco ? [pn.reforco.texto] : [], notas: [], naoVerificado: [] };
  }
  function enrijecedorContinuidade(p) {
    var e = ent(p), Ff = e.M * 1000 / (e.viga.d - e.viga.tf) + e.Nt / 2, pl = pilarLocal(e.apoio, Ff, { fy: e.fyA, tfViga: e.viga.tf, perto: !!p.topoPilar, forcarEnrij: true }), fe = fecha(pl.vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "enrijecedorContinuidade", dimensoes: { enrijecedores: pl.enrij }, desenho: { t: pl.enrij.t / 1000 }, resumo: pl.enrij.texto, verificacoes: pl.vs, reforcos: [pl.enrij.texto], notas: [], naoVerificado: [] };
  }

  /* ================================================================ MÍSULA */
  function misula(p) {
    var e = ent(p), g = gamas(), v = e.viga, ult = null;
    for (var f = 0.5; f <= 1.0001; f += 0.25) {
      var hm = cima10(f * v.d), x = vigaPilarRigida(p); x.viga = { d: v.d + hm, bf: v.bf, tw: v.tw, tf: v.tf, r: v.r };
      var r = LC().chapaExtremidade(x), Fc0 = e.M * 1000 / (v.d + hm - v.tf), ang = Math.atan(hm / (2 * hm)), FcRd = v.bf * v.tf * e.fyV / g.a1 / 1000 * Math.cos(ang);
      r.verificacoes.push(verif("Mesa inclinada da mísula à compressão", "bf·tf·fy·cos α/γa1 (modelo simplificado — conferir)", [passo("Força", "M/(d + hm − tf)", br(Fc0, 1) + " kN"), passo("Resistente", "bf·tf·fy·cos α/γa1, α = " + br(ang * 180 / Math.PI, 0) + "°", br(FcRd, 1) + " kN")], FcRd, Fc0));
      var fe = fecha(r.verificacoes); r.ok = fe.ok; r.razao = fe.razao; r.governante = fe.governante;
      r.tipo = "misula"; r.dimensoes.misula = { hm: hm, Lm: 2 * hm };
      r.desenho = { t: r.dimensoes.t / 1000, parafuso: r.dimensoes.parafuso, ext: r.dimensoes.ext / 1000, gage: r.dimensoes.gage / 1000, largura: r.dimensoes.largura / 1000, hm: hm / 1000, Lm: 2 * hm / 1000, tMesa: v.tf / 1000, nTotal: r.dimensoes.n }; r.resumo = "Mísula " + hm + " × " + (2 * hm) + " mm (mesa do perfil da viga) + " + r.resumo;
      r.notas = (r.notas || []).concat(["Modelo simplificado: a ligação é dimensionada como a de uma viga de altura d + hm — conferir no projeto."]);
      r.naoVerificado = ["Alma da mísula à flambagem local e o trecho de transição (não verificados)."]; r.reforcos = r.reforcos || [];
      ult = comNaoVer(r, e); if (r.ok) return ult;
    }
    ult.sugestao = "Viga mais alta ou ligação soldada com enrijecedores."; return ult;
  }

  /* ================================================================ VIGA EM VIGA COM RECORTE */
  function vigaRecortada(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, pr = e.apoio, V = e.V;
    var dc = cima5(num(p.dc, num(pr.tf, 10) + num(pr.r, 0) + 10)), c = cima5(num(p.c, (num(pr.bf, 150) - num(pr.tw, 6)) / 2 + 15));
    var ho = v.d - dc, tw = num(v.tw, 6), tf = num(v.tf, 10), bf = num(v.bf, 100);
    /* T que sobra: mesa de baixo bf × tf e a alma (ho − tf) × tw; y medido da face de baixo */
    var Af = bf * tf, Aw = (ho - tf) * tw, yb = (Af * tf / 2 + Aw * (tf + (ho - tf) / 2)) / (Af + Aw);
    var I = bf * Math.pow(tf, 3) / 12 + Af * sq(yb - tf / 2) + tw * Math.pow(ho - tf, 3) / 12 + Aw * sq(tf + (ho - tf) / 2 - yb), S = I / (ho - yb);
    var eM = c + FOLGA, Msd = V * eM / 1000, MRd = S * e.fyV / g.a1 / 1e6, vs = [], nv = [];
    vs.push(verif("Seção recortada à flexão no fim do recorte", "escoamento: W·fy/γa1 da seção T que sobra (" + PRATICA + ")", [passo("Recorte", "altura dc × comprimento c", dc + " × " + c + " mm"), passo("Módulo resistente", "W = I/(ho − ȳ)", br(S / 1000, 1) + "·10³ mm³", "ho = " + br(ho, 0) + " mm; ȳ = " + br(yb, 1) + " mm"),
      passo("Momento", "V·(c + folga)", br(Msd, 2) + " kN·m", comb(e.combV)), passo("Resistente", "W·fy/γa1", br(MRd, 2) + " kN·m")], MRd, Msd, "kN·m"));
    if (c > 2 * v.d || ho / tw > 60) nv.push("Flambagem local da alma recortada (recorte longo ou alma esbelta: c = " + c + " mm, ho/tw = " + br(ho / tw, 0) + "): NÃO verificada — conferir ou pôr enrijecedor na alma.");
    var con = op.conector === "chapaSimples" ? chapaSimples(p, { recorte: { topo: dc, ev: cima5(bordaMin(20, "laminada")) + 5 }, apoioT: num(pr.tw, 8) }) : cantoneiraDupla(p, { recorte: { topo: dc, ev: 35 } });
    var cd = con.dimensoes || {}, d = num(String(cd.parafuso || "M20").replace(/\D/g, ""), 20), n = num(cd.n || cd.linhas, 2), s = cima5(3 * d), dh2 = furo(d) + 2;
    var evW = 35, ehW = Math.max(30, num(cd.gage, 50) - FOLGA), rs = LC().rasgamento({ t: tw, fy: e.fyV, fu: e.fuV, lv: evW + (n - 1) * s, furosV: n - 0.5, lt: ehW, furosT: 0.5, dh: dh2, Cts: 1 });
    vs.push(verif("Colapso por rasgamento da alma recortada", ED08 + ", 6.5.6", [passo("Áreas", "Agv = (ev + (n − 1)·s)·tw; Ant = (eh − dh/2)·tw", "Agv " + br(rs.Agv, 0) + "; Anv " + br(rs.Anv, 0) + "; Ant " + br(rs.Ant, 0) + " mm²", "ev = " + evW + " mm do recorte; eh = " + br(ehW, 0) + " mm da ponta"), passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rs.Rd, 1) + " kN")], rs.Rd, V));
    con.verificacoes.forEach(function (x) { vs.push(x); });
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "vigaRecortada", dimensoes: { recorte: { dc: dc, c: c }, conector: cd }, desenho: con.desenho,
      resumo: "Recorte da mesa " + dc + " × " + c + " mm; " + con.resumo, verificacoes: vs, reforcos: [], notas: ["O recorte vai no desenho de fabricação (o 3D não recorta a mesa)."].concat(con.notas || []), naoVerificado: nv.concat(con.naoVerificado || []), sugestao: fe.ok ? null : con.sugestao || "Recorte menor (viga secundária mais baixa) ou enrijecer a alma recortada." };
  }

  /* ================================================================ EMENDAS POR TALAS (viga e pilar) */
  function talasEmenda(e, sec, Ff, sold, rot) {
    var g = gamas(), melhor = null, ultimo = null;
    for (var it = 0; it < CHAPAS.length && !melhor; it++) {
      var tp = CHAPAS[it]; if (tp < sec.tf * 0.75) continue;
      for (var ip = 0; ip < PF.length && !melhor; ip++) {
        var pf = PF[ip], d = pf.d, dh2 = furo(d) + 2, s = cima5(3 * d), ev = cima5(bordaMin(d, "laminada")), vs = [], bp = sec.bf;
        var Ty = bp * tp * e.fy / g.a1 / 1000, Tu = (bp - (sold ? 0 : 2 * dh2)) * tp * e.fu / g.a2 / 1000;
        vs.push(verif(rot + ": tala da mesa à tração (" + br(bp, 0) + " × " + br(tp, 1) + " mm)", ED08 + ", 5.2 e 6.5.3", [passo("Força", "Ff", br(Ff, 1) + " kN"), passo("Escoamento / ruptura", "b·t·fy/γa1; (b − 2dh)·t·fu/γa2", br(Math.min(Ty, Tu), 1) + " kN")], Math.min(Ty, Tu), Ff));
        var nb = 0, extra = {};
        if (!sold) {
          var fvr = FvRd(d, e.fub); nb = Math.max(4, 2 * Math.ceil(Ff / fvr / 2)); var nr = nb / 2;
          var bm = sumBearing(nr, d, Math.min(tp, sec.tf), Math.min(e.fu, e.fuV), ev, s, false);
          vs.push(verif(rot + ": parafusos de cada lado (" + nb + " × " + pf.id + ", 1 plano)", ED24 + ", 6.3.3.2", [passo("Por parafuso", "Ff/" + nb, br(Ff / nb, 1) + " kN"), passo("Fv,Rd", "", br(fvr, 1) + " kN")], fvr, Ff / nb));
          vs.push(verif(rot + ": pressão de contato (mesa/tala)", ED08 + ", 6.3.3.3", [passo("2 colunas", "Σ 1,2·lf·t·fu/γa2 (a chapa mais fina)", br(2 * bm.total, 1) + " kN")], 2 * bm.total, Ff));
          var gg = cima5(Math.max(3 * d, sec.tw + 2 * num(sec.r, 0) + 2 * d)), rs = LC().rasgamento({ t: sec.tf, fy: e.fyV, fu: e.fuV, lv: 2 * ((nr - 1) * s + ev), furosV: 2 * (nr - 0.5), lt: sec.bf - gg, furosT: 1, dh: dh2, Cts: 1 });
          vs.push(verif(rot + ": rasgamento da mesa", ED08 + ", 6.5.6", [passo("Fr,Rd", "", br(rs.Rd, 1) + " kN")], rs.Rd, Ff));
          vs.push(vBorda(rot + ": furos na mesa", (sec.bf - gg) / 2, d, "laminada"));
          var AnE = (sec.bf - 2 * dh2) * sec.tf, FnE = Math.min(sec.bf * sec.tf * e.fyV / g.a1, AnE * e.fuV / g.a2) / 1000;
          vs.push(verif(rot + ": mesa na seção dos furos", ED08 + ", 5.2 (área bruta e líquida)", [passo("An", "(bf − 2·dh)·tf", br(AnE, 0) + " mm²"), passo("Resistente", "mín(bf·tf·fy/γa1; An·fu/γa2)", br(FnE, 1) + " kN")], FnE, Ff));
          extra = { parafuso: pf.id, nPorLado: nb, comprimento: 2 * ((nr - 1) * s + 2 * ev) + 10 };
        } else {
          var aW = Math.max(pernaMin(Math.max(tp, sec.tf)), 6), cap = soldaMm(aW, e.fw, Math.min(e.fy, e.fyV)), Lw = cima10(Math.max((Ff / cap - bp) / 2, 50));
          vs.push(verif(rot + ": solda da tala de cada lado (filete " + aW + " mm, 2 × " + Lw + " + " + br(bp, 0) + ")", ED08 + ", 6.2.5", [passo("Resistente", "(2·Lw + b)·resistência por mm", br(cap * (2 * Lw + bp), 1) + " kN")], cap * (2 * Lw + bp), Ff));
          extra = { solda: aW, comprimento: 2 * (Lw + 10) };
        }
        var fe = fecha(vs), r = { ok: fe.ok, razao: fe.razao, vs: vs, t: tp, pf: pf, extra: extra };
        ultimo = r; if (fe.ok) melhor = r;
        if (sold) break;
      }
    }
    return melhor || ultimo;
  }
  function emendaVigaTalas(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, sold = op.meio === "soldada", Ff = e.M * 1000 / v.d + e.Nt / 2;
    var tm = talasEmenda(e, v, Ff, sold, "Mesa"), vs = tm.vs.slice();
    /* alma: duas talas, a cortante com a excentricidade do grupo (um lado da emenda) */
    var hw = v.d - 2 * (v.tf + num(v.r, 0)) - 10, pf = tm.pf, d = pf.d, s = cima5(3 * d), ev = cima5(bordaMin(d, "laminada")), n = Math.max(2, Math.min(9, Math.floor((hw - 2 * ev) / s) + 1));
    var eW = 5 + ev, lx = linhaExcentrica(n, s, e.V, eW), fvr = FvRd(d, e.fub), tA = 8, Vg = 2 * 0.6 * e.fy * ((n - 1) * s + 2 * ev) * tA / g.a1 / 1000;
    if (!sold) vs.push(verif("Alma: parafusos de cada lado (" + n + " × " + pf.id + ", 2 planos, com excentricidade)", ED24 + ", 6.3.3.2; método elástico (" + PRATICA + ")", [passo("Força no parafuso extremo", "√((V/n)² + (V·e·ymáx/Σy²)²), e = " + eW + " mm", br(lx.F, 1) + " kN", comb(e.combV)), passo("Resistente (2 planos)", "2·Fv,Rd", br(2 * fvr, 1) + " kN")], 2 * fvr, lx.F));
    if (!sold) { var FcAl = Math.min(Fc(d, num(v.tw, 6), e.fuV, Infinity), Fc(d, 2 * tA, e.fu, Infinity));
      vs.push(verif("Alma: pressão de contato (alma tw = " + br(v.tw, 2) + " mm e 2 talas de " + br(tA, 1) + " mm)", ED08 + ", 6.3.3.3", [passo("Por parafuso", "mín(2,4·db·tw·fu; 2,4·db·2t·fu)/γa2", br(FcAl, 1) + " kN"), passo("Parafuso extremo", "", br(lx.F, 1) + " kN")], FcAl, lx.F)); }
    vs.push(verif("Alma: talas ao cisalhamento (2 × " + br(tA, 1) + " mm)", ED08 + ", 6.5.5", [passo("Escoamento", "2·0,60·fy·h·t/γa1", br(Vg, 1) + " kN")], Vg, e.V));
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "emendaVigaTalas",
      dimensoes: { tMesa: tm.t, tAlma: tA, mesa: tm.extra, alma: { parafuso: pf.id, n: n } },
      desenho: sold ? null : { tMesa: tm.t / 1000, tAlma: tA / 1000, parafuso: tm.pf.id, colunas: tm.extra.nPorLado / 2, colunasAlma: 1, linhasAlma: n, nTotal: 4 * tm.extra.nPorLado + 2 * n },
      resumo: "Emenda: talas de mesa " + br(v.bf, 0) + " × " + br(tm.extra.comprimento, 0) + " × " + br(tm.t, 1) + " mm " + (sold ? "soldadas (filete " + tm.extra.solda + " mm)" : "(" + tm.extra.nPorLado + " " + tm.extra.parafuso + " de cada lado)") + "; talas de alma 2 × " + br(tA, 1) + " mm" + (sold ? "" : " com " + n + " " + pf.id + " de cada lado"),
      verificacoes: vs, reforcos: [], notas: ["As mesas levam todo o momento (binário M/d) e a alma a cortante — a favor."], naoVerificado: [], sugestao: fe.ok ? null : "Emenda por chapas de topo ou mudar a posição da emenda para onde o momento é menor." };
  }
  function emendaPilarTalas(p) {
    var e = ent(p), c = e.apoio && e.apoio.d ? e.apoio : e.viga, A = num(c.A, 2 * c.bf * c.tf + (c.d - 2 * c.tf) * c.tw), fracM = c.bf * c.tf / A;
    var Fm = e.M * 1000 / (c.d - c.tf) + e.Nt / 2, Fprem = 0.5 * e.Nc * fracM, Ff = Math.max(Fm, Fprem);
    var e2 = {}; Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); e2.fyV = e.fyA; e2.fuV = e.fuA;
    var tm = talasEmenda(e2, c, Ff, false, "Mesa do pilar"), vs = tm.vs.slice();
    vs.unshift(verif("Força de dimensionamento das talas", "máx(M/(d − tf) + N/2; 50 % da compressão na proporção da mesa — premissa: AISC 360-16, J1.4(b); conferir na NBR 8800)", [passo("Pelo momento", "M/(d − tf) + Nt/2", br(Fm, 1) + " kN", comb(e.combM)), passo("Mínimo da premissa", "0,5·Nc·(bf·tf/A)", br(Fprem, 1) + " kN"), passo("Adotada", "", br(Ff, 1) + " kN")], Ff, Ff));
    vs[0].razao = 0;
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "emendaPilarTalas", dimensoes: { tMesa: tm.t, mesa: tm.extra, Ff: Ff },
      desenho: { tMesa: tm.t / 1000, tAlma: 0.008, parafuso: tm.pf.id, colunas: tm.extra.nPorLado / 2 },
      resumo: "Emenda de pilar: talas de mesa " + br(c.bf, 0) + " × " + br(tm.extra.comprimento, 0) + " × " + br(tm.t, 1) + " mm com " + tm.extra.nPorLado + " " + tm.extra.parafuso + " de cada lado; faces em contato pleno; talas de alma construtivas 8 mm",
      verificacoes: vs, reforcos: [], notas: ["Faces de contato serradas/usinadas em esquadro (compressão por contato)."], naoVerificado: ["A cortante do pilar na emenda é levada pelas talas da alma (construtivas) — conferir quando a cortante for alta."] };
  }
  function emendaPilarSoldada(p) {
    var e = ent(p), g = gamas(), c = e.apoio && e.apoio.d ? e.apoio : e.viga, A = num(c.A, 2 * c.bf * c.tf + (c.d - 2 * c.tf) * c.tw), I = num(c.Ix, 0) || (c.bf * Math.pow(c.d, 3) - (c.bf - c.tw) * Math.pow(c.d - 2 * c.tf, 3)) / 12, W = I / (c.d / 2);
    var sig = Math.max(e.Nt, e.Nc) * 1000 / A + e.M * 1e6 / W, sRd = e.fyA / g.a1, vs = [verif("Solda de penetração total na seção inteira", ED08 + ", 6.2.5 e Tabela 8 (metal-base)", [passo("Tensão normal máxima", "N/A + M/W", br(sig, 1) + " MPa"), passo("Resistente", "fy/γa1", br(sRd, 1) + " MPa")], sRd, sig, "MPa")], fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "emendaPilarSoldada", dimensoes: { solda: "penetração total" }, desenho: null, resumo: "Emenda de pilar soldada em penetração total (mesas e alma), com cantoneiras de montagem provisórias", verificacoes: vs, reforcos: [], notas: ["Solda de campo qualificada; ultrassom nas mesas."], naoVerificado: [] };
  }

  /* ================================================================ BASES */
  function baseEnt(p, tipo) {
    var e = ent(p);
    return { tipo: tipo, dMinChumb: p.dMinChumb, pilar: e.apoio && e.apoio.d ? e.apoio : e.viga, aco: { fy: e.fy, fu: e.fu }, chumbador: p.chumbador || { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 }, concreto: p.concreto || { fck: 25 },   /* dMinChumb: revisão A4 (js/acoligsugere.js) */
             acoPilar: { fy: e.fyA }, eletrodo: { fw: e.fw },
             esforcos: e.esf.map(function (s) { return { comb: s.comb, N: num(s.N, 0), Vx: num(s.V, num(s.Vx, 0)), Vz: num(s.Vz, 0), M: num(s.M, 0) }; }) };
  }
  function placaBase(p, op) {
    op = op || {};
    var r = LC().placaBase(baseEnt(p, op.tipo === "engastada" ? "engastada" : "rotulada"));
    r.tipologia = op.tipo === "engastada" ? "base-engastada" : "base-rotulada"; r.reforcos = []; r.naoVerificado = ["Cone de concreto, bloco/pedestal e armadura de fretagem: projeto de fundação (reações neste memorial)."];
    return r;
  }
  function placaBaseEnrijecida(p) {
    var g = gamas(), x = baseEnt(p, "engastada"), r0 = LC().placaBase(x), pil = x.pilar, d0 = r0.dimensoes, fy = num(x.aco.fy, 250);
    var vC = r0.verificacoes[0], vF = r0.verificacoes[1], vT = r0.verificacoes[2];
    var sig = Math.min(vC.solicitante, vC.resistencia), m = (d0.L - 0.95 * pil.d) / 2;
    /* nervuras no plano das mesas (2 por mesa, nas pontas da mesa): o trecho da placa entre elas vence o vão bf como faixa
       biapoiada (σ·bf²/8) em vez do balanço m (σ·m²/2) — vale a menor (equilíbrio admissível; modelo simplificado) */
    var mBal = sig * m * m / 2, mFaixa = sig * pil.bf * pil.bf / 8, mN = Math.min(mBal, mFaixa), Tch = vT.solicitante, mTr = Tch * 1000 * Math.max(10, d0.chumbadores.borda) / Math.max(1, pil.bf) / 2;
    var mReq = Math.max(mN, mTr), t = null;
    for (var i = 3; i < CHAPAS.length; i++) { if (CHAPAS[i] * CHAPAS[i] * fy / 4 / g.a1 >= mReq) { t = CHAPAS[i]; break; } }
    if (t == null) t = CHAPAS[CHAPAS.length - 1];
    var MRd = t * t * fy / 4 / g.a1, vs = [vC, verif("Placa à flexão com nervuras (t = " + br(t, 1) + " mm)", "faixa entre nervuras σ·bf²/8 ou balanço σ·m²/2 (a menor); chumbador T·e/(bf/2) — modelo simplificado (conferir)",
      [passo("Balanço sem nervura", "σ·m²/2", br(mBal / 1000, 2) + " kN·m/m"), passo("Faixa entre nervuras", "σ·bf²/8", br(mFaixa / 1000, 2) + " kN·m/m"), passo("Arrancamento", "T·e/(bf/2)", br(mTr / 1000, 2) + " kN·m/m"), passo("Resistente", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, mReq / 1000, "kN·m/m")];
    vs = vs.concat(r0.verificacoes.slice(2));
    var hs = cima10(Math.max(1.5 * m, 150)), F = Math.max(sig * (pil.bf / 2) * m / 1000, Tch), es = m / 2, lim = 0.56 * Math.sqrt(E / fy), ts = null;
    for (var j = 0; j < CHAPAS.length; j++) { var tt = CHAPAS[j]; if (m / tt > lim) continue; var sg = 6 * F * 1000 * es / (tt * hs * hs); if (sg <= fy / g.a1) { ts = tt; break; } }
    if (ts == null) ts = CHAPAS[CHAPAS.length - 1];
    var sgN = 6 * F * 1000 * es / (ts * hs * hs);
    vs.push(verif("Nervura à flexão (" + br(m, 0) + " × " + hs + " × " + br(ts, 1) + " mm, 4 nervuras)", ED08 + ", 5.7.9 (b/t ≤ 0,56·√(E/fy)) e flexão elástica 6·F·e/(t·h²)", [passo("Força por nervura", "máx(σ·bf/2·m; T do chumbador)", br(F, 1) + " kN"), passo("Tensão", "6·F·(m/2)/(t·h²)", br(sgN, 1) + " MPa"), passo("b/t", "≤ " + br(lim, 1), br(m / ts, 1))], fy / g.a1, sgN, "MPa"));
    var aW = Math.max(pernaMin(Math.max(ts, pil.tf)), 5), cap = soldaMm(aW, 485, Math.min(fy, 250)) * 1000, f = Math.sqrt(sq(F / (2 * hs)) + sq(6 * F * es / (2 * hs * hs))) * 1000;
    vs.push(verif("Solda da nervura no pilar (filete " + aW + " mm, 2 × " + hs + " mm)", ED08 + ", 6.2.5", [passo("Força por mm", "√[(F/2h)² + (6·F·e/(2h²))²]", br(f, 0) + " N/mm"), passo("Resistência por mm", "", br(cap, 0) + " N/mm")], cap, f, "N/mm"));
    var fe = fecha(vs);
    return { bloqueante: ["placa de base com nervuras: a pressão do bloco comprimido (σc,Rd no bloco Y do Guia 1), o arrancamento por linha de ruptura e a força em cada nervura não estão verificados pelo modelo simplificado — use a placa engastada sem nervuras ou verifique à parte"],
      ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "placaBaseEnrijecida", tipologia: "base-engastada-enrij",
      dimensoes: { B: d0.B, L: d0.L, t: t, tSemNervura: d0.t, chumbadores: d0.chumbadores, nervuras: { n: 4, b: Math.round(m), h: hs, t: ts, solda: aW } },
      desenho: { B: d0.B / 1000, N: d0.L / 1000, t: t / 1000, nChumb: d0.chumbadores.n, porLado: d0.chumbadores.porLado, parafuso: d0.chumbadores.id, classe: "F1554-36", ancoragem: d0.chumbadores.ancoragem / 1000, graute: 0.025, furo: "alargado" },
      resumo: "Placa " + d0.B + " × " + d0.L + " × " + br(t, 1) + " mm com 4 nervuras " + Math.round(m) + " × " + hs + " × " + br(ts, 1) + " mm (sem nervuras seriam " + br(d0.t, 1) + " mm); " + d0.chumbadores.n + " chumbadores " + d0.chumbadores.id,
      verificacoes: vs, reforcos: ["4 nervuras soldadas no pilar e na placa"], notas: r0.notas || [], naoVerificado: ["Placa com nervuras por modelo simplificado (faixa entre nervuras) — conferir; cone de concreto e bloco: projeto de fundação."] };
  }
  function barraCisalhamento(p) {
    var e = ent(p), g = gamas(), fck = num(p.concreto && p.concreto.fck, 25), V = e.V, gr = 25, best = null;
    var sRd = LC().concreto(fck, num(p.concreto && p.concreto.A2_A1, 1));
    for (var bl = 100; bl <= 400 && !best; bl += 50) for (var hl = 100; hl <= 250 && !best; hl += 25) for (var it = 3; it < 9 && !best; it++) {
      var tl = CHAPAS[it], sig = V * 1000 / (bl * (hl - gr)), M = V * (gr + (hl - gr) / 2) / 1000, MRd = bl * tl * tl / 4 * e.fy / g.a1 / 1e6;
      var aW = Math.max(pernaMin(tl), 6), f = Math.sqrt(sq(V / (2 * bl)) + sq(M * 1000 / (bl * (tl + aW)))) * 1000, cap = soldaMm(aW, e.fw, e.fy) * 1000;
      if (sig <= sRd && M <= MRd && f <= cap) best = { bl: bl, hl: hl, tl: tl, sig: sig, M: M, MRd: MRd, aW: aW, f: f, cap: cap };
    }
    if (!best) best = { bl: 400, hl: 250, tl: CHAPAS[8], sig: V * 1000 / (400 * 225), M: V * (gr + 112.5) / 1000, MRd: 400 * Math.pow(CHAPAS[8], 2) / 4 * e.fy / g.a1 / 1e6, aW: 10, f: 0, cap: 1 };
    var vs = [verif("Contato da barra no concreto (" + best.bl + " × " + (best.hl - gr) + " mm embutidos)", ED24 + ", 6.6 (σc,Rd) — aplicado à face da barra (a favor)", [passo("σ", "V/(b·(h − graute))", br(best.sig, 2) + " MPa", comb(e.combV)), passo("σc,Rd", "0,85·fck/γc·√(A2/A1)", br(sRd, 2) + " MPa")], sRd, best.sig, "MPa"),
      verif("Barra à flexão (t = " + br(best.tl, 1) + " mm)", "b·t²·fy/4/γa1 (" + PRATICA + ")", [passo("Momento", "V·(graute + h_emb/2)", br(best.M, 2) + " kN·m"), passo("Resistente", "", br(best.MRd, 2) + " kN·m")], best.MRd, best.M, "kN·m"),
      verif("Solda da barra na placa (filete " + best.aW + " mm, 2 lados)", ED08 + ", 6.2.5", [passo("Força por mm", "√[(V/2b)² + (M/(b·(t + a)))²]", br(best.f, 0) + " N/mm"), passo("Resistência por mm", "", br(best.cap, 0) + " N/mm")], best.cap, best.f, "N/mm")];
    var fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "barraCisalhamento", dimensoes: { b: best.bl, h: best.hl, t: best.tl, solda: best.aW }, desenho: null,
      resumo: "Barra de cisalhamento " + best.bl + " × " + best.hl + " × " + br(best.tl, 1) + " mm soldada sob a placa (filete " + best.aW + " mm), em nicho grauteado", verificacoes: vs, reforcos: [], notas: ["Os chumbadores ficam só à tração; o nicho é grauteado depois do prumo."], naoVerificado: ["Arrancamento do concreto à frente da barra (breakout): projeto de fundação."] };
  }
  function chumbadorQuimico(p) {
    var r = placaBase(p, { tipo: p.tipoBase === "engastada" ? "engastada" : "rotulada" });
    r.tipo = "chumbadorQuimico"; r.tipologia = "base-chumbador-quimico";
    r.naoVerificado = ["Aderência do adesivo e cone de concreto do chumbador químico: dados do fabricante (avaliação técnica do produto) — NÃO verificados.", "Bloco existente: conferir fck, cobrimento e distância às bordas no local."];
    /* REVISÃO S5 N1 (14/10/2026): sem os dados do fabricante a aderência, o cone e o embutimento NÃO são verificados — é
       pendência CRÍTICA: a ligação pode ser aplicada (escolha do engenheiro), mas o memorial não diz "atendem" e as pranchas
       saem com NÃO EMITIR até verificar à parte */
    r.naoVerificadoCritico = ["Chumbador químico: aderência do adesivo, cone de concreto, embutimento (hef) e distância mínima à borda dependem dos dados do fabricante (avaliação técnica do produto) — NÃO VERIFICADOS"];
    r.resumo = String(r.resumo || "").replace(/chumbadores ([^ ]+) com gancho, ancoragem mínima [^;]+/, "barras roscadas $1 com chumbador químico (embutimento do fabricante)");
    return r;
  }

  /* ================================================================ GUSSET DE CONTRAVENTAMENTO / NÓ DE TRELIÇA
   * p = { N (kN; tração > 0) ou Nt/Nc, diagonal: { forma "L"|"chapa", b (aba), t, xc, A, fy, fu }, alfa (graus), L1 (mm,
   *       distância livre do último parafuso à borda apoiada do gusset — padrão 150), parafuso, aco } */
  function gussetContravento(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), dg = p.diagonal || { forma: "L", b: 76.2, t: 6.35, xc: 21.2, A: 929 }, Nt = Math.max(num(p.Nt, 0), num(p.N, 0) > 0 ? num(p.N, 0) : 0, e.Nt), Nc = Math.max(num(p.Nc, 0), num(p.N, 0) < 0 ? -num(p.N, 0) : 0, e.Nc);
    var N = Math.max(Nt, Nc), L1 = num(p.L1, 150), fyD = num(dg.fy, 250), fuD = num(dg.fu, 400), melhor = null, ultimo = null;
    for (var it = 1; it < 7 && !melhor; it++) for (var ip = 0; ip < 3 && !melhor; ip++) for (var n = 2; n <= 8 && !melhor; n++) { var r = avaliar(CHAPAS[it], PF[ip], n); ultimo = r; if (r.ok) melhor = r; }
    if (!melhor) { ultimo.sugestao = "Diagonal maior (duas linhas de parafusos) ou gusset mais espesso/soldado."; return ultimo; }
    return melhor;
    function avaliar(tG, pf, n) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, s = cima5(3 * d), ev = cima5(bordaMin(d, "laminada")), vs = [], fvr = FvRd(d, e.fub), Lg = (n - 1) * s;
      vs.push(verif("Parafusos da diagonal (" + n + " × " + pf.id + ", 1 plano)", ED24 + ", 6.3.3.2", [passo("Por parafuso", "N/" + n, br(N / n, 1) + " kN", "N = " + br(N, 1) + " kN"), passo("Fv,Rd", "", br(fvr, 1) + " kN")], fvr, N / n));
      var bG = sumBearing(n, d, tG, e.fu, ev, s, false), bD = sumBearing(n, d, num(dg.t, 6), fuD, ev, s, false);
      vs.push(verif("Pressão de contato (gusset t = " + br(tG, 1) + " mm; diagonal t = " + br(dg.t, 2) + " mm)", ED08 + ", 6.3.3.3", [passo("Gusset", "Σ 1,2·lf·t·fu/γa2", br(bG.total, 1) + " kN"), passo("Diagonal", "", br(bD.total, 1) + " kN")], Math.min(bG.total, bD.total), N));
      var Lw = 2 * Lg * Math.tan(Math.PI / 6), Ty = Lw * tG * e.fy / g.a1 / 1000, Tu = (Lw - dh2) * tG * e.fu / g.a2 / 1000;
      vs.push(verif("Gusset à tração na largura de Whitmore", ED08 + ", 5.2 e 6.5.3; Whitmore a 30° (" + PRATICA + ")", [passo("Largura", "Lw = 2·Lg·tan 30°", br(Lw, 0) + " mm", "Lg = " + Lg + " mm"), passo("Resistente", "mín(Lw·t·fy/γa1; (Lw − dh)·t·fu/γa2)", br(Math.min(Ty, Tu), 1) + " kN")], Math.min(Ty, Tu), Nt));
      if (Nc > 0) {
        var rr = tG / Math.sqrt(12), l0 = 0.65 * L1 / rr / Math.PI * Math.sqrt(e.fy / E), NcRd = chi(l0) * Lw * tG * e.fy / g.a1 / 1000;
        vs.push(verif("Gusset à compressão (flambagem)", ED24 + ", 5.3 (χ); K = 0,65 e L = " + L1 + " mm (" + PRATICA + ")", [passo("λ0", "0,65·L/(t/√12)/π·√(fy/E)", br(l0, 3)), passo("Nc,Rd", "χ·Lw·t·fy/γa1", br(NcRd, 1) + " kN")], NcRd, Nc));
      }
      if (dg.forma === "L") {
        var gD = Math.max(cima5(0.55 * num(dg.b, 76)), ev), rs = LC().rasgamento({ t: dg.t, fy: fyD, fu: fuD, lv: ev + Lg, furosV: n - 0.5, lt: num(dg.b, 76) - gD, furosT: 0.5, dh: dh2, Cts: 1 });
        vs.push(verif("Colapso por rasgamento da cantoneira da diagonal", ED08 + ", 6.5.6", [passo("Fr,Rd", "", br(rs.Rd, 1) + " kN")], rs.Rd, Nt));
        var Ct = Math.max(0.6, Math.min(0.9, 1 - num(dg.xc, 21) / Math.max(1, Lg))), An = num(dg.A, 929) - dh2 * dg.t, NtRd = Math.min(num(dg.A, 929) * fyD / g.a1, Ct * An * fuD / g.a2) / 1000;
        vs.push(verif("Diagonal à tração na ligação (Ct = " + br(Ct, 2) + ")", ED08 + ", 5.2.5 (Ct = 1 − ec/lc, entre 0,60 e 0,90)", [passo("Ae", "Ct·(Ag − dh·t)", br(Ct * An, 0) + " mm²"), passo("Nt,Rd", "mín(Ag·fy/γa1; Ae·fu/γa2)", br(NtRd, 1) + " kN")], NtRd, Nt));
      }
      var rsG = LC().rasgamento({ t: tG, fy: e.fy, fu: e.fu, lv: 2 * (ev + Lg), furosV: 2 * (n - 0.5), lt: 0, furosT: 0, dh: dh2, Cts: 1 });
      vs.push(verif("Rasgamento do gusset ao longo da linha", ED08 + ", 6.5.6 (dois planos de cisalhamento)", [passo("Fr,Rd", "", br(rsG.Rd, 1) + " kN")], rsG.Rd, N));
      var Ls = cima10(Math.max(Lw, 150)), aW = Math.max(pernaMin(tG), 5), cap = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000, f = N * 1000 / (2 * Ls), aMax = Math.max(aW, Math.floor(tG - 1.5));
      while (cap < f && aW < aMax) { aW++; cap = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000; }
      vs.push(verif("Solda do gusset no apoio (filete " + aW + " mm, 2 × " + Ls + " mm)", ED08 + ", 6.2.5 — força inteira na solda, sem a excentricidade da interface", [passo("Força por mm", "N/(2·L)", br(f, 0) + " N/mm"), passo("Resistência por mm", "", br(cap, 0) + " N/mm")], cap, f, "N/mm"));
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: op.trelica ? "noTrelica" : "gussetContravento",
        dimensoes: { t: tG, parafuso: pf.id, n: n, whitmore: Math.round(Lw), solda: aW, Ls: Ls },
        desenho: { t: tG / 1000, parafuso: pf.id, parafusos: n },
        resumo: (op.trelica ? "Nó de treliça: gusset " : "Gusset ") + br(tG, 1) + " mm, " + n + " parafusos " + pf.id + " " + e.classe + " na barra" + (op.trelica ? " mais carregada" : "") + "; solda no apoio filete " + aW + " mm (2 × " + Ls + " mm)",
        verificacoes: vs, reforcos: [], notas: [], naoVerificado: ["Distribuição das forças da interface entre viga e pilar (método da força uniforme): não feita — a solda leva a força inteira, sem a excentricidade; conferir no projeto."] };
    }
  }

  /* ================================================================ NÓ TUBULAR (NBR 16239:2013 / EN 1993-1-8:2005, cap. 7)
   * p = { banzo: { forma "CHS"|"RHS", d0 | b0, h0, t0, fy0 }, diagonais: [{ d1 | b1, h1, t1, theta (°), N (kN) }], g (mm, K),
   *       sigma0 (MPa, compressão > 0 no banzo — para kp/kn) } ; op.tipo "T"|"K" */
  function noTubular(p, op) {
    op = op || {};
    var g = gamas(), bz = p.banzo || {}, ds = arr(p.diagonais), vs = [], nv = [], tipo = op.tipo === "K" ? "K" : "T";
    var fy0 = num(bz.fy0, 350), t0 = num(bz.t0, 6), rhs = bz.forma === "RHS", d0 = rhs ? num(bz.b0, 150) : num(bz.d0, 168.3), sp = Math.max(0, num(p.sigma0, 0)), np = sp / fy0;
    var blq = [];
    var gam = d0 / (2 * t0), b1 = ds[0] || { d1: 60, t1: 4, theta: 45, N: 0 }, th = num(b1.theta, 90) * Math.PI / 180, sn = Math.sin(th);
    var di = rhs ? num(b1.b1, 80) : num(b1.d1, 60), beta = di / d0, N1 = Math.abs(num(b1.N, 0)), R = 0, ps = [], nome = "";
    var valido = beta >= (rhs ? 0.25 : 0.2) && beta <= 1 && d0 / t0 <= (rhs ? 35 : 50) && num(b1.theta, 90) >= 30;
    /* a diagonal que governa: a de maior força (todas as diagonais do nó; revisão A3) */
    ds.forEach(function (q) { if (Math.abs(num(q.N, 0)) > Math.abs(num(b1.N, 0))) b1 = q; });
    th = num(b1.theta, 90) * Math.PI / 180; sn = Math.sin(th); di = rhs ? num(b1.b1, 80) : num(b1.d1, 60); beta = di / d0; N1 = Math.abs(num(b1.N, 0));
    ds.forEach(function (q) { var bq = (rhs ? num(q.b1, 80) : num(q.d1, 60)) / d0; if (bq < (rhs ? 0.25 : 0.2) || bq > 1 || num(q.theta, 90) < 30) valido = false; });
    if (rhs && tipo === "K") { var bmin = Math.max(0.35, 0.1 + 0.01 * d0 / t0); if (beta < bmin) blq.push("nó K retangular com β = " + br(beta, 2) + " < " + br(bmin, 2) + " (EN 1993-1-8, Tabela 7.8)"); blq.push("nó K retangular: cisalhamento do banzo, ruptura da diagonal e punção (EN 1993-1-8, Tabela 7.12) não verificados"); }
    if (rhs && tipo === "T" && beta > 0.85) blq.push("nó T retangular com β > 0,85: alma do banzo e largura efetiva não verificadas");
    if (!rhs) {
      var kp = np > 0 ? 1 - 0.3 * np * (1 + np) : 1;
      if (tipo === "T") {
        R = Math.pow(gam, 0.2) * kp * fy0 * t0 * t0 / sn * (2.8 + 14.2 * beta * beta) / g.a1 / 1000; nome = "Nó T/Y (tubo circular): plastificação do banzo";
        ps = [passo("β = d1/d0; γ = d0/(2t0)", "", br(beta, 3) + "; " + br(gam, 1)), passo("kp", "1 − 0,3·np·(1 + np) (banzo comprimido)", br(kp, 3)), passo("N1,Rd", "γ^0,2·kp·fy0·t0²/sen θ1·(2,8 + 14,2β²)/γa1", br(R, 1) + " kN")];
      } else {
        var gp = Math.max(num(p.g, 2 * t0), 0), kg = Math.pow(gam, 0.2) * (1 + 0.024 * Math.pow(gam, 1.2) / (1 + Math.exp(0.5 * gp / t0 - 1.33)));
        R = kg * kp * fy0 * t0 * t0 / sn * (1.8 + 10.2 * di / d0) / g.a1 / 1000; nome = "Nó K com afastamento (tubo circular): plastificação do banzo";
        ps = [passo("kg", "γ^0,2·[1 + 0,024·γ^1,2/(1 + e^(0,5g/t0 − 1,33))]", br(kg, 3), "g = " + br(gp, 0) + " mm"), passo("N1,Rd", "kg·kp·fy0·t0²/sen θ1·(1,8 + 10,2·d1/d0)/γa1", br(R, 1) + " kN")];
        if (gp < num(b1.t1, 4) + num((ds[1] || b1).t1, 4)) nv.push("Afastamento g menor que t1 + t2: fora da validade do nó K com afastamento.");
      }
      vs.push(verif(nome, ED16239, ps, R, N1));
      if (di <= d0 - 2 * t0) {
        var Rp = fy0 / Math.sqrt(3) * t0 * Math.PI * di * (1 + sn) / (2 * sn * sn) / g.a1 / 1000;
        vs.push(verif("Punção da parede do banzo", ED16239, [passo("N1,Rd", "fy0/√3·t0·π·d1·(1 + sen θ1)/(2·sen² θ1)/γa1", br(Rp, 1) + " kN")], Rp, N1));
      }
    } else {
      var kn = np > 0 ? Math.min(1, 1.3 - 0.4 * np / beta) : 1, eta = num(b1.h1, di) / d0;
      if (tipo === "T") {
        if (beta > 0.85) nv.push("β > 0,85: governam a alma do banzo e a largura efetiva da diagonal — não verificados aqui.");
        R = kn * fy0 * t0 * t0 / ((1 - Math.min(beta, 0.85)) * sn) * (2 * eta / sn + 4 * Math.sqrt(1 - Math.min(beta, 0.85))) / g.a1 / 1000; nome = "Nó T/Y (tubo retangular): plastificação da face do banzo";
        ps = [passo("β; η", "b1/b0; h1/b0", br(beta, 3) + "; " + br(eta, 3)), passo("kn", "1,3 − 0,4·n/β ≤ 1 (banzo comprimido)", br(kn, 3)), passo("N1,Rd", "kn·fy0·t0²/((1 − β)·sen θ1)·(2η/sen θ1 + 4√(1 − β))/γa1", br(R, 1) + " kN")];
      } else {
        var b2 = ds[1] || b1, soma = num(b1.b1, di) + num(b2.b1, di) + num(b1.h1, di) + num(b2.h1, di);
        R = 8.9 * kn * fy0 * t0 * t0 * Math.sqrt(gam) / sn * (soma / (4 * d0)) / g.a1 / 1000; nome = "Nó K com afastamento (tubo retangular): plastificação da face do banzo";
        ps = [passo("N1,Rd", "8,9·kn·fy0·t0²·√γ/sen θ1·(b1 + b2 + h1 + h2)/(4·b0)/γa1", br(R, 1) + " kN")];
      }
      vs.push(verif(nome, ED16239, ps, R, N1));
    }
    if (!valido) { blq.push("nó tubular fora dos limites de validade da NBR 16239"); nv.push("Fora dos limites de validade (β, d0/t0 ou θ) da NBR 16239:2013 — nó NÃO verificado pela fórmula."); vs.push(verif("Limites de validade do nó", ED16239, [passo("β; d0/t0; θ", "", br(beta, 2) + "; " + br(d0 / t0, 1) + "; " + br(num(b1.theta, 90), 0) + "°")], 0, 1, "")); }
    nv.push("Solda do nó: dimensionar para a resistência da barra (EN 1993-1-8, 7.3) — não verificada aqui.");
    var fe = fecha(vs);
    return { bloqueante: blq, ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "noTubular", dimensoes: { tipo: tipo, beta: beta, gama: gam }, desenho: null,
      resumo: "Nó " + tipo + " soldado em tubo " + (rhs ? "retangular" : "circular") + " (β = " + br(beta, 2) + ")", verificacoes: vs, reforcos: fe.ok ? [] : ["Chapa de reforço na face do banzo ou banzo de parede mais grossa"], notas: ["γa1 = 1,10 no lugar do γM5 do EN 1993-1-8 (a favor)."], naoVerificado: nv };
  }

  /* ================================================================ CONSOLO (viga de rolamento) */
  var CONSOLOS = ["W200X26.6", "W200X35.9", "W250X32.7", "W250X44.8", "W310X38.7", "W310X52", "W360X44", "W360X64", "W410X60", "W460X74", "W530X85"];
  function consolo(p) {
    var e = ent(p), g = gamas(), P = Math.max(num(p.P, 0), e.V), H = Math.abs(num(p.H, 0)), ex = num(p.e, 300), C = dep("PerfisAco", "./perfisaco.js"), ult = null;
    for (var i = 0; i < CONSOLOS.length; i++) {
      var s = C && C.obter ? C.obter(CONSOLOS[i]) : null; if (!s) continue;
      var r = avaliar(s); ult = r; if (r.ok) return r;
    }
    if (ult) ult.sugestao = "Consolo de perfil soldado mais alto, par de enrijecedores de apoio no consolo sob a viga (não dimensionados aqui) ou pilar com mesa mais grossa.";
    return ult || { ok: false, razao: Infinity, governante: "catálogo", tipo: "consolo", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Catálogo de perfis não carregou." };
    function avaliar(s) {
      var vs = [], M = P * ex / 1000, lamF = s.bf / (2 * s.tf), lamW = (s.d - 2 * s.tf) / s.tw, lpF = 0.38 * Math.sqrt(E / 345), lpW = 3.76 * Math.sqrt(E / 345), comp = lamF <= lpF && lamW <= lpW;
      var MRd = (comp ? num(s.Zx, 0) : num(s.Wx, 0)) * 345 / g.a1 / 1e6, VRd = 0.6 * 345 * s.d * s.tw / g.a1 / 1000;
      vs.push(verif("Consolo " + s.nome + " à flexão", ED08 + ", 5.4.2 / Anexo G — " + (comp ? "seção compacta: Z·fy/γa1" : "seção não compacta: W·fy/γa1 (a favor)"), [passo("Momento", "P·e", br(M, 2) + " kN·m", "e = " + ex + " mm"), passo("b/2t; h/tw", "≤ 0,38√(E/fy); ≤ 3,76√(E/fy)", br(lamF, 1) + "; " + br(lamW, 1)), passo("MRd", "", br(MRd, 2) + " kN·m")], MRd, M, "kN·m"));
      vs.push(verif("Consolo ao cisalhamento", ED08 + ", 5.4.3 (0,60·fy·d·tw/γa1, alma compacta)", [passo("VRd", "", br(VRd, 1) + " kN")], VRd, P));
      var lnC = num(p.lnApoio, 100), kC = s.tf + num(s.r, 0), Re = 1.10 * (2.5 * kC + lnC) * 345 * s.tw / g.a1 / 1000, Rg = 0.33 * s.tw * s.tw * (1 + 3 * (lnC / s.d) * Math.pow(s.tw / s.tf, 1.5)) * Math.sqrt(E * 345 * s.tf / s.tw) / g.a1 / 1000;
      vs.push(verif("Alma do consolo sob a viga apoiada (perto da ponta)", ED08 + ", 5.7.3 e 5.7.4 (força a menos de d da ponta)", [passo("Escoamento local", "1,10·(2,5k + ln)·fy·tw/γa1", br(Re, 1) + " kN", "ln = " + br(lnC, 0) + " mm (mesa da viga apoiada)"), passo("Enrugamento", "0,33·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Rg, 1) + " kN")], Math.min(Re, Rg), P));
      var Ff = M * 1000 / (s.d - s.tf) + H / 2, FmRd = s.bf * s.tf * Math.min(345, e.fyA) / g.a1 / 1000;
      vs.push(verif("Mesas do consolo em penetração total no pilar", ED08 + ", 6.2.5 e Tabela 8", [passo("Força na mesa", "M/(d − tf) + H/2", br(Ff, 1) + " kN"), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN")], FmRd, Ff));
      var hw = s.d - 2 * s.tf, aW = Math.max(pernaMin(Math.max(s.tw, e.tApoio)), 5), FwA = 2 * LC().soldaFilete(aW, hw, e.fw, Math.min(345, e.fyA));
      vs.push(verif("Alma do consolo no pilar (filete " + aW + " mm, 2 lados)", ED08 + ", 6.2.5", [passo("Resistente", "", br(FwA, 1) + " kN")], FwA, P));
      var refs = [], enr = null;
      if (e.apoio && e.apoio.d && e.face === "mesa") { var pl = pilarLocal(e.apoio, Ff, { fy: e.fyA, tfViga: s.tf, ln: s.tf + 16 }); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores no pilar: " + enr.texto); }
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "consolo", dimensoes: { perfil: s.nome, e: ex, solda: aW, enrijecedores: enr }, desenho: { perfil: s.nome, nTotal: 0 },
        resumo: "Consolo " + s.nome + " soldado na mesa do pilar (mesas em penetração total, alma com filete " + aW + " mm)" + (refs.length ? "; " + refs.join("; ") : ""), verificacoes: vs, reforcos: refs,
        notas: ["Aço do consolo ASTM A572 Gr.50."], naoVerificado: ["FADIGA da ponte rolante (NBR 8800, Anexo K): NÃO verificada — obrigatória no projeto.", "Impacto vertical e forças horizontais da ponte: valores do fabricante da ponte."] };
    }
  }

  /* ================================================================ BARRA REDONDA (contravento / tirante) e CLIP: o motor existente */
  function barraRedonda(p) {
    var e = ent(p), r = LC().contravento({ d: num(p.d, 16), N: Math.max(e.Nt, Math.abs(num(p.N, 0))), barra: p.barra || { fy: 250, fu: 400 }, chapa: { fy: e.fy }, eletrodo: { fw: e.fw }, alfa: num(p.alfa, 0) });
    r.reforcos = []; r.naoVerificado = ["Barra frouxa à compressão (sai do modelo) — conferir o pré-tensionamento na montagem."]; r.notas = r.notas || []; return r;
  }
  function clipTerca(p) { var r = LC().clipTerca(p); r.reforcos = []; r.naoVerificado = []; r.notas = r.notas || []; return r; }

  /* ================================================================ EMENDA DE BARRA TRACIONADA (cantoneira, U, chapa) e CRUZAMENTO EM X
   * p = { barra: { forma "L"|"U"|"chapa", b (aba ligada / largura, mm), t, A (mm²), xc (mm, excentricidade da ligação),
   *       fy, fu }, N (kN, tração), parafuso } — talas parafusadas: cantoneira e U com 1 tala na aba/alma ligada (1 plano),
   *       chapa com talas dos dois lados (2 planos) */
  function emendaTracao(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), b0 = p.barra || p.diagonal || { forma: "L", b: 76.2, t: 6.35, A: 929, xc: 21.2 }, N = Math.max(Math.abs(num(p.N, 0)), num(p.Nt, 0), e.Nt);
    var fyB = num(b0.fy, 250), fuB = num(b0.fu, 400), tb = num(b0.t, 6.35), bb = num(b0.b, 76), Ab = num(b0.A, bb * tb), duas = b0.forma === "chapa", melhor = null, ultimo = null;
    for (var ip = 0; ip < 3 && !melhor; ip++) for (var it = 0; it < 8 && !melhor; it++) for (var n = 2; n <= 8 && !melhor; n++) {
      var tt = CHAPAS[it]; if (tt < tb * (duas ? 0.5 : 1) - 1e-9) continue;
      var r = avaliar(PF[ip], tt, n); ultimo = r; if (r.ok) melhor = r;
    }
    if (!melhor) { ultimo.sugestao = "Duas linhas de parafusos, barra maior ou emenda soldada."; return ultimo; }
    return melhor;
    function avaliar(pf, tt, n) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, s = cima5(3 * d), ev = cima5(bordaMin(d, "laminada")), vs = [], np = duas ? 2 : 1, fvr = FvRd(d, e.fub), lc = (n - 1) * s;
      vs.push(verif("Parafusos de cada lado da emenda (" + n + " × " + pf.id + ", " + np + " plano" + (np > 1 ? "s" : "") + ")", ED24 + ", 6.3.3.2", [passo("Por parafuso", "N/" + n, br(N / n, 1) + " kN", "N = " + br(N, 1) + " kN"), passo("Resistente", np + "·Fv,Rd", br(np * fvr, 1) + " kN")], np * fvr, N / n));
      var bB = sumBearing(n, d, tb, fuB, ev, s, false), bT = sumBearing(n, d, np * tt, e.fu, ev, s, false);
      vs.push(verif("Pressão de contato (barra t = " + br(tb, 2) + " mm; tala" + (np > 1 ? "s 2 × " : " ") + br(tt, 1) + " mm)", ED08 + ", 6.3.3.3", [passo("Barra", "Σ 1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(bB.total, 1) + " kN"), passo("Tala(s)", "", br(bT.total, 1) + " kN")], Math.min(bB.total, bT.total), N));
      var Ct = b0.forma === "chapa" ? 1 : Math.max(0.6, Math.min(0.9, 1 - num(b0.xc, 20) / Math.max(1, lc))), An = Ab - dh2 * tb, NtRd = Math.min(Ab * fyB / g.a1, Ct * An * fuB / g.a2) / 1000;
      vs.push(verif("Barra tracionada na emenda (Ct = " + br(Ct, 2) + ")", ED08 + ", 5.2 e 5.2.5 (Ct = 1 − ec/lc entre 0,60 e 0,90; chapa: Ct = 1)", [passo("Ae", "Ct·(Ag − dh·t)", br(Ct * An, 0) + " mm²"), passo("Nt,Rd", "mín(Ag·fy/γa1; Ae·fu/γa2)", br(NtRd, 1) + " kN")], NtRd, N));
      var bt = bb, Ty = np * bt * tt * e.fy / g.a1 / 1000, Tu = np * (bt - dh2) * tt * e.fu / g.a2 / 1000;
      vs.push(verif("Tala" + (np > 1 ? "s" : "") + " à tração (" + br(bt, 0) + " × " + br(tt, 1) + " mm)", ED08 + ", 5.2 e 6.5.3", [passo("Resistente", np + "·mín(b·t·fy/γa1; (b − dh)·t·fu/γa2)", br(Math.min(Ty, Tu), 1) + " kN")], Math.min(Ty, Tu), N));
      var gB = Math.max(cima5(0.55 * bb), ev), rs = LC().rasgamento({ t: tb, fy: fyB, fu: fuB, lv: ev + lc, furosV: n - 0.5, lt: Math.max(bb - gB, ev), furosT: 0.5, dh: dh2, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da barra", ED08 + ", 6.5.6", [passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rs.Rd, 1) + " kN")], rs.Rd, N));
      var Lt = 2 * (lc + 2 * ev) + 10, fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: op.cruz ? "contraventoCruz" : "emendaTracao",
        dimensoes: { tala: { n: np, b: bt, t: tt, L: Lt }, parafuso: pf.id, nPorLado: n, Ct: Ct }, desenho: null,
        resumo: (op.cruz ? "Cruzamento em X: a diagonal interrompida emendada por " : "Emenda por ") + (np > 1 ? "2 talas " : "tala ") + br(bt, 0) + " × " + br(Lt, 0) + " × " + br(tt, 1) + " mm, " + n + " parafusos " + pf.id + " " + e.classe + " de cada lado" + (op.cruz ? "; a outra diagonal passa contínua com 1 parafuso no cruzamento (travamento)" : ""),
        verificacoes: vs, reforcos: [], notas: op.cruz ? ["O parafuso do cruzamento só trava as diagonais (reduz o comprimento de flambagem fora do plano): construtivo."] : [], naoVerificado: [] };
    }
  }

  /* ================================================================ GUSSET DE TUBO COM CHAPA DE LÍNGUA (tubo fendido soldado)
   * p = { tubo: { D, t, A, fy, fu }, N | Nt/Nc (kN), L1 (mm, comprimento livre do gusset), aco (gusset) } */
  function gussetTubo(p) {
    var e = ent(p), g = gamas(), tb = p.tubo || p.diagonal || { D: 101.6, t: 5.7, A: 1720 }, D = num(tb.D, num(tb.d, 101.6)), tt = num(tb.t, 5.7), A = num(tb.A, Math.PI * (D - tt) * tt);
    var fyT = num(tb.fy, 290), fuT = num(tb.fu, 415), Nt = Math.max(num(p.Nt, 0), num(p.N, 0) > 0 ? num(p.N, 0) : 0, e.Nt), Nc = Math.max(num(p.Nc, 0), num(p.N, 0) < 0 ? -num(p.N, 0) : 0, e.Nc), N = Math.max(Nt, Nc), L1 = num(p.L1, 150), melhor = null, ultimo = null;
    for (var it = 2; it < 8 && !melhor; it++) { var r = avaliar(CHAPAS[it]); ultimo = r; if (r.ok) melhor = r; }
    if (!melhor) ultimo.sugestao = "Tubo de parede mais grossa, gusset mais espesso ou chapa de reforço no fim do tubo.";
    return melhor || ultimo;
    function avaliar(tg) {
      var vs = [], aW = Math.max(pernaMin(Math.max(tg, tt)), 5), aMax = Math.max(aW, Math.floor(tt)), cap = soldaMm(aW, e.fw, Math.min(e.fy, fyT));
      var Lw = Math.max(D, cima10(N / (4 * cap)));
      while (4 * Lw * cap < N && aW < aMax) { aW++; cap = soldaMm(aW, e.fw, Math.min(e.fy, fyT)); }
      Lw = Math.max(D, cima10(N / (4 * cap)));
      vs.push(verif("Solda do tubo na chapa de língua (4 filetes " + aW + " mm × " + Lw + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "4·Lw·mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(4 * Lw * cap, 1) + " kN")], 4 * Lw * cap, N));
      var Vw = 4 * Lw * 0.6 * fuT * tt / g.a2 / 1000;
      vs.push(verif("Parede do tubo ao cisalhamento junto às soldas", ED08 + ", 6.5.5 (ruptura: 0,60·fu·Anv/γa2)", [passo("Resistente", "4·Lw·t·0,60·fu/γa2", br(Vw, 1) + " kN")], Vw, N));
      var Ct = Lw >= 1.3 * D ? 1 : 1 - (D / Math.PI) / Lw, An = A - 2 * tt * (tg + 2), NtRd = Math.min(A * fyT / g.a1, Ct * An * fuT / g.a2) / 1000;
      vs.push(verif("Tubo tracionado na fenda (Ct = " + br(Ct, 2) + ")", ED08 + ", 5.2.5 (tubo circular com chapa de ligação concêntrica: lc ≥ 1,3·D → Ct = 1; D ≤ lc < 1,3·D → Ct = 1 − ec/lc, ec = D/π — conferir o item)", [passo("An", "Ag − 2·t·(tg + 2)", br(An, 0) + " mm²"), passo("Nt,Rd", "mín(Ag·fy/γa1; Ct·An·fu/γa2)", br(NtRd, 1) + " kN")], NtRd, Nt));
      var Lwh = 2 * Lw * Math.tan(Math.PI / 6) + tg, Ty = Math.min(Lwh * tg * e.fy / g.a1, Lwh * tg * e.fu / g.a2) / 1000;
      vs.push(verif("Chapa de língua / gusset na largura de Whitmore", ED08 + ", 5.2 e 6.5.3; Whitmore a 30° (" + PRATICA + ")", [passo("Largura", "2·Lw·tan 30° + tg", br(Lwh, 0) + " mm"), passo("Resistente", "", br(Ty, 1) + " kN")], Ty, Nt));
      if (Nc > 0) { var rr = tg / Math.sqrt(12), l0 = 0.65 * L1 / rr / Math.PI * Math.sqrt(e.fy / E), NcRd = chi(l0) * Lwh * tg * e.fy / g.a1 / 1000; vs.push(verif("Gusset à compressão (flambagem)", ED24 + ", 5.3 (χ); K = 0,65 (" + PRATICA + ")", [passo("Nc,Rd", "χ·Lw·t·fy/γa1", br(NcRd, 1) + " kN")], NcRd, Nc)); }
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "gussetTubo", dimensoes: { t: tg, Lw: Lw, solda: aW, Ct: Ct }, desenho: null,
        resumo: "Tubo Ø " + br(D, 1) + " fendido sobre chapa de língua " + br(tg, 1) + " mm, 4 filetes " + aW + " mm × " + Lw + " mm; tampa na ponta do tubo (estanqueidade)", verificacoes: vs, reforcos: [], notas: ["A fenda do tubo passa 5 mm além da chapa e é fechada (tampa soldada) para não acumular água."], naoVerificado: ["Solda da chapa de língua no apoio: como no gusset de contraventamento (verifique a tipologia de gusset no nó)."] };
    }
  }
  function chapaDupla(p) { return chapaSimples(p, { dupla: true }); }

  var FUNCOES = {
    cantoneiraDupla: cantoneiraDupla, cantoneiraSimples: cantoneiraSimples, chapaSimples: chapaSimples, chapaTopoCurta: chapaTopoCurta, cantoneiraAssento: cantoneiraAssento,
    chapaExtendida: chapaExtendida, chapaAjustada: chapaAjustada, talasMesa: talasMesa, soldadaDireta: soldadaDireta, misula: misula, painelAlma: painelAlma, enrijecedorContinuidade: enrijecedorContinuidade,
    vigaRecortada: vigaRecortada, emendaVigaTalas: emendaVigaTalas, chapaCumeeira: chapaCumeeira, emendaPilarTalas: emendaPilarTalas, emendaPilarChapa: emendaPilarChapa, emendaPilarSoldada: emendaPilarSoldada,
    placaBase: placaBase, placaBaseEnrijecida: placaBaseEnrijecida, barraCisalhamento: barraCisalhamento, chumbadorQuimico: chumbadorQuimico,
    gussetContravento: gussetContravento, noTubular: noTubular, consolo: consolo, barraRedonda: barraRedonda, clipTerca: clipTerca,
    emendaTracao: emendaTracao, gussetTubo: gussetTubo, chapaDupla: chapaDupla
  };
  /* dimensiona uma tipologia do catálogo: o resultado leva a tipologia, a edição e a marca de estimativa */
  function verificar(tipId, entrada) {
    var T = Tip(), t = T && T.obter(tipId); if (!t) return { ok: false, motivo: "Tipologia desconhecida: " + tipId + "." };
    var f = FUNCOES[t.calc]; if (!f) return { ok: false, motivo: "A tipologia " + t.nome + " não tem verificação (" + t.calc + ")." };
    var r;
    try { r = f(entrada || {}, t.calcPar || {}); } catch (ex) { return { ok: false, motivo: "Erro na verificação de " + t.nome + ": " + (ex && ex.message ? ex.message : ex), tipologia: tipId }; }
    if (!r) return { ok: false, motivo: "Sem resultado.", tipologia: tipId };
    /* NOTA OBRIGATÓRIA DE CORTE: as bordas mínimas usadas nas chapas/talas são as de borda laminada ou cortada a maçarico
       (NBR 8800, Tabela 14); com serra ou tesoura a borda mínima sobe (e a entrada `corte: "serra"` já dimensiona com ela) */
    if (!/^(cant-dupla-paraf|cant-dupla-sold-paraf|cant-simples|cant-assento|viga-viga-recorte-cant|clip-terca|soldada-direta|tubo-t-y|tubo-k|contravento-barra-redonda|tirante|enrijecedor-continuidade|reforco-alma-pilar|emenda-pilar-soldada)$/.test(tipId)) {
      var dbN = num(String((r.dimensoes && (r.dimensoes.parafuso || (r.dimensoes.chumbadores && r.dimensoes.chumbadores.id))) || "").replace(/[^0-9.]/g, ""), 0);
      if (r.dimensoes && r.dimensoes.chumbadores && r.dimensoes.chumbadores.d) dbN = r.dimensoes.chumbadores.d;
      var serraN = dbN > 0 ? bordaMin(dbN, "serra") : null, serra0 = entrada && /^(serra|tesoura)$/.test(String(entrada.corte || ""));
      r.notaCorte = serra0 ? "Bordas das chapas e talas dimensionadas para corte com SERRA/TESOURA (borda mínima da Tabela 14 da NBR 8800 para borda cortada com serra" + (serraN ? ": " + br(serraN, 0) + " mm" : "") + ")."
        : "OBRIGATÓRIO NA FABRICAÇÃO: bordas das chapas e talas cortadas a maçarico, plasma ou laser (NBR 8800, Tabela 14 — borda laminada ou cortada a maçarico); com serra ou tesoura a borda mínima sobe para " + (serraN ? br(serraN, 0) + " mm (db = " + br(dbN, 0) + " mm)" : "o valor de borda cortada com serra da Tabela 14") + ".";
      r.notas = arr(r.notas); r.notas.unshift(r.notaCorte);
    }
    r.tipologia = tipId; r.nome = t.nome; r.familia = t.familia; r.edicao = T.EDICAO.aviso;
    r.reforcos = arr(r.reforcos); r.notas = arr(r.notas); r.naoVerificado = arr(r.naoVerificado);
    r.bloqueante = arr(r.bloqueante);
    r.bloqueante.slice().reverse().forEach(function (b) { r.naoVerificado.unshift("NÃO VERIFICADO (a opção fica bloqueada, sem Aplicar): " + b + "."); });
    /* o que é crítico e não foi verificado REPROVA a opção (nunca "passa" com lacuna escondida) */
    if (r.bloqueante.length) { r.okVerificacoes = r.ok; r.ok = false; r.governante = "não verificado: " + r.bloqueante[0]; r.razao = Math.max(num(r.razao, 0), 1.0001); }
    if (entrada && entrada.estimativa) { r.estimativa = true; r.notas.unshift("ESTIMATIVA: esforços estimados (sem cálculo da estrutura) — refazer com os esforços do cálculo."); }
    return r;
  }
  /* o memorial de UMA ligação (HTML simples, sem estilo próprio — o memorial da estrutura dá o estilo) */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* AJUSTE DA GERENTE (14/10/2026): o símbolo de PERFIL vai com índice no HTML do memorial — t<sub>f</sub>, t<sub>w</sub>,
     b<sub>f</sub>, h<sub>w</sub> e afins (b<sub>w</sub>, t<sub>fs</sub>, b<sub>fi</sub>…): na aba de unidades (kgf/tf) "tf" é
     tonelada-força e "Ff = M/(d − tf) = 4,06 tf" ficava ambíguo. SÓ no HTML do memorial: o dado do motor (a fórmula em
     texto) não muda — a tela, a prancha e o DXF continuam com "tf" sem tag. Recebe texto JÁ escapado. */
  var RE_IX = /(^|[^A-Za-z_\u00C0-\u024F])([tbh])([fw])(s|i|1|2)?(?![A-Za-z0-9_\u00C0-\u024F])/g;
  function ix(h) { return String(h == null ? "" : h).replace(RE_IX, function (m0, a, l, s, k) { return a + l + "<sub>" + s + (k || "") + "</sub>"; }); }
  function memorialHtml(r, titulo) {
    if (!r || !r.verificacoes) return "";
    var h = "<h3>" + esc(titulo || r.nome || r.tipo) + "</h3><p><b>" + esc(r.resumo || "") + "</b> — " + (r.ok ? "PASSA" : "NÃO PASSA") + " (aproveitamento " + br(r.razao * 100, 0) + " %; governa: " + ix(esc(r.governante || "—")) + ")" + (r.estimativa ? " <b>[ESTIMATIVA]</b>" : "") + "</p>";
    r.verificacoes.forEach(function (v) {
      h += "<h4>" + ix(esc(v.nome)) + " — " + ix(esc(v.item)) + "</h4><ul>" + arr(v.passos).map(function (q) { return "<li>" + ix(esc(q.rotulo)) + (q.formula ? ' <span class="eq">' + ix(esc(q.formula)) + "</span>" : "") + (q.valor != null && q.valor !== "" ? " = <b>" + ix(esc(q.valor)) + "</b>" : "") + (q.extra ? ' <span class="nota">' + ix(esc(q.extra)) + "</span>" : "") + "</li>"; }).join("") +
        "<li>Solicitante " + br(v.solicitante, 2) + " " + esc(v.unidade) + " / resistente " + br(v.resistencia, 2) + " " + esc(v.unidade) + " → razão <b>" + br(v.razao, 3) + "</b> " + (v.razao <= 1 + 1e-9 ? "(ok)" : "(NÃO PASSA)") + "</li></ul>";
    });
    if (r.reforcos.length) h += "<p><b>Reforços:</b> " + r.reforcos.map(esc).join("; ") + ".</p>";
    if (r.naoVerificado.length) h += "<p><b>Não verificado:</b></p><ul>" + r.naoVerificado.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    if (r.notas.length) h += "<ul>" + r.notas.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    return h;
  }

  var AcoLigCalc2 = { verificar: verificar, FUNCOES: FUNCOES, memorialHtml: memorialHtml, pilarLocal: pilarLocal, painel: painel, linhaExcentrica: linhaExcentrica,
    cantoneiraDupla: cantoneiraDupla, cantoneiraSimples: cantoneiraSimples, chapaSimples: chapaSimples, chapaTopoCurta: chapaTopoCurta, cantoneiraAssento: cantoneiraAssento, chapaExtendida: chapaExtendida, chapaAjustada: chapaAjustada,
    talasMesa: talasMesa, soldadaDireta: soldadaDireta, misula: misula, vigaRecortada: vigaRecortada, emendaVigaTalas: emendaVigaTalas, emendaPilarTalas: emendaPilarTalas,
    placaBase: placaBase, placaBaseEnrijecida: placaBaseEnrijecida, barraCisalhamento: barraCisalhamento, gussetContravento: gussetContravento, noTubular: noTubular, consolo: consolo };
  global.AcoLigCalc2 = AcoLigCalc2;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigCalc2;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

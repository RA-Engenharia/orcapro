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
  /* os parafusos que estes detalhes experimentam: M16 a M24 da tabela ÚNICA (js/acomateriais.js, DIAMETROS — os mesmos
     de antes, na mesma ordem). Lida NA HORA: este arquivo carrega ANTES do acomateriais.js no index.html. */
  function PFs() { var M = Mat(), L = M && M.diametros ? M.diametros("parafuso") : []; return L.filter(function (x) { return x.d >= 16 - 1e-9 && x.d <= 24 + 1e-9; }); }
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
  /* M2 (1.2.145): o que vai na ALMA do pilar I (cantoneiras, assento, chapa de topo curta) tem de caber entre as mesas, fora das
     raízes: d − 2·tf − 2·r. Devolve a verificação geométrica ou null (não é alma de perfil I) */
  function vEntreMesas(e, nome, precisa) {
    var c = e.apoio || {}; if (e.face !== "alma" || !(num(c.tf, 0) > 0 && num(c.d, 0) > 0)) return null;
    var livre = c.d - 2 * c.tf - 2 * num(c.r, 0), v = verif(nome + " cabe entre as mesas do pilar (≤ d − 2·tf − 2·r)", "geometria (ligação na alma do pilar)", [passo("Precisa", "", br(precisa, 0) + " mm"), passo("Livre entre as raízes das mesas", "d − 2·tf − 2·r", br(livre, 0) + " mm")], livre, precisa, "mm");
    v.razao = livre > 0 ? precisa / livre : Infinity; return v;
  }
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
      tApoio: p.face === "alma" ? num(ap.tw, 8) : num(ap.tf, 10),
      /* M2 (1.2.145): a compressão do PILAR no nó (kN), do cálculo da estrutura (js/acoligsugere.js) — painel da alma, tubo */
      NcPilar: p.pilarN == null || p.pilarN === "" ? null : Math.abs(num(p.pilarN, 0)), MPilar: p.pilarM == null ? null : Math.abs(num(p.pilarM, 0)),
      /* M2 (1.2.145): o ENGENHEIRO fixa o arranjo (e os controles negativos dos testes): { pf: "M16", t: 8 (mm), linhas, a (perna da
         solda, mm), cat (cantoneira), ts (enrijecedor, mm), semEnrij } — sem ele, o motor procura o menor arranjo que passa */
      forcar: p.forcar || {}
    };
  }
  function pfLista(L, e) { var f = e.forcar && e.forcar.pf; if (!f) return L; var d = num(String(f).replace(/[^0-9.]/g, ""), 0), x = L.filter(function (q) { return q.id === f || q.d === d; }); return x.length ? x : [{ id: "M" + d, d: d }]; }
  function tFixo(e) { return e.forcar && num(e.forcar.t, 0) > 0 ? num(e.forcar.t, 0) : null; }
  /* as opções das forças localizadas no pilar e do painel: o aço da CHAPA (enrijecedor, chapa de reforço), o eletrodo, a mesa que chega e a força axial do pilar */
  function opPilar(e, mesa, extra) { var o = { fy: e.fyA, fyChapa: e.fy, acoChapa: e.acoId, fw: e.fw, bfViga: num(mesa && mesa.bf, 0), tfViga: num(mesa && mesa.tf, 8), semEnrij: !!(e.forcar && e.forcar.semEnrij) }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function opPainel(e) { return { fyChapa: e.fy, fw: e.fw, N: e.NcPilar, acoChapa: e.acoId }; }
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
  /* FILETE OU PENETRAÇÃO: a menor perna (≥ a mínima da Tabela 10, ≤ a chapa mais fina − 1,5 mm) que leva fNmm (N/mm, num
     cordão); se nem a maior basta, penetração total, com a resistência do metal-base por mm (capCJP, N/mm) */
  function cordao(fNmm, tA, tB, fyBase, fw, capCJP, aFixo) {
    if (aFixo > 0) { var cF = soldaMm(aFixo, fw, fyBase) * 1000; return { cjp: false, a: aFixo, cap: cF, texto: "filete " + aFixo + " mm" }; }
    var tm = Math.min(tA, tB), a = Math.max(pernaMin(Math.max(tA, tB)), 5), aMax = Math.max(a, Math.floor(tm > 6.35 ? tm - 1.5 : tm)), cap = soldaMm(a, fw, fyBase) * 1000;
    while (cap < fNmm && a < aMax) { a++; cap = soldaMm(a, fw, fyBase) * 1000; }
    if (cap >= fNmm || !(capCJP > 0)) return { cjp: false, a: a, cap: cap, texto: "filete " + a + " mm" };
    return { cjp: true, a: null, cap: capCJP, texto: "penetração total" };
  }
  /* M2 (1.2.145): os enrijecedores e a chapa de reforço da alma são de CHAPA (o desenho os faz em ASTM A36 — js/metalligacao.js):
     a resistência vai com o fy da chapa (o.fyChapa), não com o do pilar — antes, 345 MPa numa chapa de 250 (38 % a mais).
     E as SOLDAS dos enrijecedores e da chapa de reforço, que não eram verificadas, agora são (NBR 8800:2008, 5.7.9 — a mesma regra
     da AISC 360-16, J10.8 e J10.9). */
  function pilarLocal(c, Ff, o) {
    var g = gamas(), fy = num(o.fy, 345), fyS = Math.min(num(o.fyChapa, fy), fy), fw = num(o.fw, 485), k = num(c.tf, 10) + num(c.r, 0), ln = num(o.ln, num(o.tfViga, 10) + 10), perto = !!o.perto, vs = [];
    var Rmesa = (perto ? 0.5 : 1) * 6.25 * c.tf * c.tf * fy / g.a1 / 1000;
    var Resc = 1.10 * ((perto ? 2.5 : 5) * k + ln) * fy * c.tw / g.a1 / 1000;
    var Renr = (perto ? 0.33 : 0.66) * c.tw * c.tw * (1 + 3 * (ln / c.d) * Math.pow(c.tw / c.tf, 1.5)) * Math.sqrt(E * fy * c.tf / c.tw) / g.a1 / 1000;
    var R0 = Math.min(Rmesa, Resc, Renr), R = R0, enrij = null;
    var ps = [passo("Flexão local da mesa (" + ED08 + ", 5.7.2)", (perto ? "0,5·" : "") + "6,25·tf²·fy/γa1", br(Rmesa, 1) + " kN", perto ? "força a menos de 10·tf do topo: 50 %" : ""),
              passo("Escoamento local da alma (5.7.3)", "1,10·(" + (perto ? "2,5" : "5") + "k + ln)·fy·tw/γa1", br(Resc, 1) + " kN", "k = tf + r = " + br(k, 1) + " mm; ln = " + br(ln, 0) + " mm"),
              passo("Enrugamento da alma (5.7.4)", (perto ? "0,33" : "0,66") + "·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Renr, 1) + " kN"),
              passo("Força da mesa da viga", "Ff", br(Ff, 1) + " kN")];
    var extra = [];
    if ((Ff > R0 || o.forcarEnrij) && !o.semEnrij) {
      var bs = Math.floor((c.bf - c.tw) / 2 - 5), lim = 0.56 * Math.sqrt(E / fyS), ts = null;
      for (var i = 0; i < CHAPAS.length; i++) {
        var t = CHAPAS[i]; if (t < Math.max(num(o.tfViga, 8) / 2, 6.3) || bs / t > lim) continue;
        var Rn = Resc + 2 * (bs - 15) * t * fyS / g.a1 / 1000;
        if (Rn >= Ff) { ts = t; R = Rn; break; }
      }
      if (ts == null) { ts = CHAPAS[CHAPAS.length - 1]; R = Resc + 2 * (bs - 15) * ts * fyS / g.a1 / 1000; }
      enrij = { b: bs, t: ts, n: 2, aco: o.acoChapa || "ASTM A36", texto: "par de enrijecedores de continuidade " + bs + " × " + br(ts, 1) + " mm no pilar, na altura de cada mesa da viga" };
      ps.push(passo("Com " + enrij.texto, "escoamento da alma + 2·(b − 15)·t·fy,chapa/γa1 (chanfro de 15 mm)", br(R, 1) + " kN", "fy da chapa = " + br(fyS, 0) + " MPa; b/t = " + br(bs / ts, 1) + " ≤ 0,56·√(E/fy) = " + br(lim, 1) + " (5.7.9); t ≥ tf da viga/2"));
      /* DETALHAMENTO (NBR 8800:2008, 5.7.9 — AISC 360-16, J10.8 a) e b)): b + tw/2 ≥ bf/3 da mesa que chega; t ≥ tf/2 e b/t no limite */
      var bfV = num(o.bfViga, 0), tfV = num(o.tfViga, 0), bMin = bfV / 3 - c.tw / 2;
      var vL = verif("Enrijecedores: largura mínima (b + tw/2 ≥ bf da viga/3)", ED08 + ", 5.7.9 (a mesma regra da AISC 360-16, J10.8 a)", [passo("b + tw/2", br(bs, 0) + " + " + br(c.tw, 1) + "/2", br(bs + c.tw / 2, 1) + " mm"), passo("bf da viga/3", br(bfV, 0) + "/3", br(bfV / 3, 1) + " mm")], bs + c.tw / 2, bfV / 3, "mm");
      vL.razao = bfV > 0 ? (bfV / 3) / (bs + c.tw / 2) : 0; extra.push(vL);
      var vT = verif("Enrijecedores: espessura (t ≥ tf da viga/2) e esbeltez (b/t ≤ 0,56·√(E/fy))", ED08 + ", 5.7.9 (AISC 360-16, J10.8 b)", [passo("t", "", br(ts, 1) + " mm", "tf/2 = " + br(tfV / 2, 1) + " mm"), passo("b/t", "≤ " + br(lim, 1), br(bs / ts, 1))], ts, tfV / 2, "mm");
      vT.razao = Math.max(tfV > 0 ? (tfV / 2) / ts : 0, (bs / ts) / lim); extra.push(vT);
      /* SOLDAS: a força que fica para o par é Fs = Ff − (a resistência sem enrijecedor); metade em cada um. Na mesa carregada: 2
         filetes no comprimento (b − chanfro); na alma: 2 filetes no comprimento (d − 2·tf − 2·chanfro) — a força inteira passa
         para a alma (viga de um lado só) */
      var Fs = Math.max(Ff - R0, 0), ch = 15, Lf = Math.max(bs - ch, 10), Lw = Math.max(c.d - 2 * c.tf - 2 * ch, 10);
      var fF = Fs / 2 * 1000 / (2 * Lf), fW = Fs / 2 * 1000 / (2 * Lw);
      var sF = cordao(fF, ts, c.tf, Math.min(fyS, fy), fw, ts * fyS / g.a1 / 2), sW = cordao(fW, ts, c.tw, Math.min(fyS, fy), fw, 0.60 * Math.min(ts * fyS, c.tw * fy) / g.a1 / 2);
      extra.push(verif("Solda dos enrijecedores na mesa do pilar (" + sF.texto + ", 2 lados × " + br(Lf, 0) + " mm em cada)", ED08 + ", 6.2.5 e 5.7.9 — a solda leva a parte da força que o enrijecedor recebe (AISC 360-16, J10.8)",
        [passo("Força no par", "Fs = Ff − R(sem enrijecedor)", br(Fs, 1) + " kN", "R sem enrijecedor = " + br(R0, 1) + " kN"), passo("Por mm de cordão", "Fs/2/(2·(b − chanfro))", br(fF, 0) + " N/mm"), passo("Resistência por mm", sF.cjp ? "penetração total: metal-base (t·fy/γa1, por lado)" : "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(sF.cap, 0) + " N/mm")], sF.cap, fF, "N/mm"));
      extra.push(verif("Solda dos enrijecedores na alma do pilar (" + sW.texto + ", 2 lados × " + br(Lw, 0) + " mm em cada)", ED08 + ", 6.2.5 e 5.7.9 — leva a força do enrijecedor para a alma (AISC 360-16, J10.8)",
        [passo("Por mm de cordão", "Fs/2/(2·(d − 2·tf − 2·chanfro))", br(fW, 0) + " N/mm"), passo("Resistência por mm", sW.cjp ? "penetração total: metal-base ao cisalhamento" : "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(sW.cap, 0) + " N/mm")], sW.cap, fW, "N/mm"));
      enrij.solda = { mesa: sF.texto, alma: sW.texto };
      enrij.texto += " (solda na mesa: " + sF.texto + "; na alma: " + sW.texto + ")";
    }
    vs.push(verif("Mesa e alma do pilar sob a força da mesa da viga" + (enrij ? " — com enrijecedores" : ""), ED08 + ", 5.7 (forças localizadas)", ps, R, Ff));
    vs = vs.concat(extra);
    return { vs: vs, enrij: enrij, R: R, R0: R0 };
  }
  /* PAINEL DA ALMA DO PILAR (cisalhamento do binário) → chapa de reforço da alma se preciso.
     M2 (1.2.145): (1) a chapa de reforço com o fy DELA (o.fyChapa — antes o do pilar); (2) com a força axial do pilar (o.N, kN de
     compressão, do cálculo) a resistência cai quando Pr > 0,4·Py (AISC 360-16, J10.6 a) 2): × (1,4 − Pr/Py) — sem o.N a
     redução não é aplicada e o passo diz; (3) a SOLDA da chapa de reforço nas mesas do pilar, para desenvolver a chapa ao
     cisalhamento (AISC 360-16, J10.9 b) — antes não verificada. */
  function painel(c, Ff, fy, o) {
    o = o || {};
    var g = gamas(), fyP = num(o.fyChapa, fy), fw = num(o.fw, 485), A = num(c.A, 2 * c.bf * c.tf + (c.d - 2 * c.tf) * c.tw), Py = A * fy / 1000, Nc = o.N == null ? null : Math.max(0, num(o.N, 0));
    var fat = Nc != null && Nc > 0.4 * Py ? Math.max(0, 1.4 - Nc / Py) : 1;
    var Vp = 0.60 * fy * c.d * c.tw * fat / g.a1 / 1000, ref = null, ps = [passo("Força no painel", "Ff = M/(d − tf) da viga", br(Ff, 1) + " kN"),
      passo("Força axial do pilar", Nc == null ? "não informada (sem cálculo da estrutura)" : "Pr/Py = " + br(Nc, 1) + "/" + br(Py, 0), Nc == null ? "redução da AISC 360-16, J10.6 a) NÃO aplicada" : (fat < 1 ? "Pr > 0,4·Py: × (1,4 − Pr/Py) = " + br(fat, 3) : "Pr ≤ 0,4·Py: sem redução")),
      passo("Resistente da alma", "0,60·d·tw·fy/γa1" + (fat < 1 ? "·(1,4 − Pr/Py)" : ""), br(Vp, 1) + " kN")];
    var vs = [];
    if (Ff > Vp) {
      for (var i = 0; i < CHAPAS.length; i++) { var t = CHAPAS[i], V2 = 0.60 * c.d * (c.tw * fy + t * fyP) * fat / g.a1 / 1000; if (V2 >= Ff || i === CHAPAS.length - 1) { ref = { t: t, aco: o.acoChapa || "ASTM A36", texto: "chapa de reforço da alma do pilar t = " + br(t, 1) + " mm (soldada nas mesas, na altura do nó)" }; Vp = V2; break; } }
      ps.push(passo("Com " + ref.texto, "0,60·d·(tw·fy + tr·fy,chapa)/γa1" + (fat < 1 ? "·(1,4 − Pr/Py)" : ""), br(Vp, 1) + " kN", "fy da chapa = " + br(fyP, 0) + " MPa; alternativa: enrijecedor diagonal no painel"));
      var q = 0.60 * fyP * ref.t / g.a1, s = cordao(q, ref.t, c.tf, Math.min(fyP, fy), fw, q);
      ref.solda = s.texto; ref.texto = ref.texto.replace("soldada nas mesas", "soldada nas mesas com " + s.texto);
      vs.push(verif("Solda da chapa de reforço nas mesas do pilar (" + s.texto + " nas duas bordas)", "AISC 360-16, J10.9 b) — a solda desenvolve a chapa ao cisalhamento: q = 0,60·fy·tr/γa1 por mm; " + ED08 + ", 6.2.5",
        [passo("Por mm de borda", "0,60·fy·tr/γa1", br(q, 0) + " N/mm"), passo("Resistência por mm", s.cjp ? "penetração total: metal-base" : "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(s.cap, 0) + " N/mm")], s.cap, q, "N/mm"));
    }
    var v = verif("Painel da alma do pilar ao cisalhamento" + (ref ? " — com chapa de reforço" : ""), ED08 + ", 5.7 — Vpl = 0,60·d·tw·fy/γa1; força axial pela AISC 360-16, J10.6 a)", ps, Vp, Ff);
    return { v: v, vs: [v].concat(vs), reforco: ref, nv: Nc == null ? ["Painel da alma do pilar sem a força axial do pilar (sem cálculo): a redução da AISC 360-16, J10.6 a) para Pr > 0,4·Py não foi aplicada."] : [] };
  }

  /* ================================================================ CANTONEIRA DUPLA (e simples) NA ALMA
   * op = { soldadaNaViga, simples, recorte: { topo (mm, altura do recorte), ev (mm, do recorte ao 1º furo) } } */
  function cantoneiraDupla(p, op) {
    var PF = PFs();
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
      var vEM = vEntreMesas(e, op.simples ? "A cantoneira" : "O par de cantoneiras (2·aba + tw da viga)", 2 * ct.a + tw); if (vEM) vs.push(vEM);
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
    var PF = PFs();
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, V = e.V, a = num(p.a, 75), melhor = null, ultimo = null, ultDuct = null;
    var Lmax = v.d - (op.recorte ? num(op.recorte.topo, 0) : num(v.tf, 0) + num(v.r, 0)) - num(v.tf, 0) - num(v.r, 0) - 15;
    var PFc = pfLista(PF, e), TCc = tFixo(e) ? [tFixo(e)] : CHAPAS.slice(0, 6), nFx = e.forcar && num(e.forcar.linhas, 0) > 0 ? num(e.forcar.linhas, 0) : 0;
    for (var ip = 0; ip < PFc.length && !melhor; ip++) for (var it = 0; it < TCc.length && !melhor; it++) for (var n = 2; n <= 9 && !melhor; n++) {
      var pf = PFc[ip], t = TCc[it];
      if (nFx && n !== nFx) continue;
      var r = avaliar(pf, t, n); if (!r) continue;
      if (op.extra) op.extra(r);   /* M2 (1.2.145): as verificações do apoio tubular entram ANTES de decidir se o arranjo passa */
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
      /* M2 (revisão 15/10/2026): a FORÇA AXIAL da viga (op.axial = { Nt, Nc }, kN — as tipologias de pilar tubular passam): horizontal,
         repartida igual nos n parafusos e somada à componente do momento no parafuso extremo (a favor). Sem op.axial: como antes. */
      var NtA = op.axial ? num(op.axial.Nt, 0) : 0, NcA = op.axial ? num(op.axial.Nc, 0) : 0, Nax = Math.max(NtA, NcA);
      if (Nax > 0) lx = { F: Math.sqrt(sq(lx.Fv) + sq(lx.Fh + Nax / n)), Fv: lx.Fv, Fh: lx.Fh + Nax / n, Iy: lx.Iy };
      vs.push(verif("Parafusos ao cisalhamento (" + n + " × " + pf.id + ", " + (nP === 2 ? "2 planos, " : "") + "com excentricidade" + (Nax > 0 ? " e força axial" : "") + ")", ED24 + ", 6.3.3.2; método elástico do grupo (" + PRATICA + ")",
        [passo("Excentricidade", "e = distância da solda à linha de parafusos", br(a, 0) + " mm")].concat(Nax > 0 ? [passo("Força axial da viga", "|N| (a maior entre tração e compressão)", br(Nax, 1) + " kN")] : []).concat([passo("Força no parafuso extremo", Nax > 0 ? "√((V/n)² + (V·e·ymáx/Σy² + N/n)²)" : "√((V/n)² + (V·e·ymáx/Σy²)²)", br(lx.F, 1) + " kN", comb(e.combV)), passo("Fv,Rd" + (nP === 2 ? " × 2 planos" : ""), "0,45·Ab·fub/γa2", br(nP * fvr, 1) + " kN")]), nP * fvr, lx.F));
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
      if (Nax > 0) {
        /* M2 (revisão 15/10/2026): com a força axial da viga — a chapa (N + M), a pressão de contato na borda mais próxima, o
           rasgamento na direção de N (tração) e a faixa da alma da viga à tração */
        var ehW = Math.max(a - FOLGA, 1), NtRdP = nP * Math.min(e.fy * Ag / g.a1, e.fu * An / g.a2) / 1000;
        var l0P = 2.0 * a / (t / Math.sqrt(12)) / Math.PI * Math.sqrt(e.fy / E), NcRdP = nP * chi(l0P) * Ag * e.fy / g.a1 / 1000, iNM = Math.max(NtA / NtRdP, NcA / NcRdP) + Mp / MRd;
        vs.push(verif("Chapa" + (nP === 2 ? "s (2)" : "") + " à força axial + flexão na linha de parafusos", ED08 + ", 5.2 (tração: Ag·fy/γa1 e An·fu/γa2), 5.3 (compressão: χ·Ag·fy/γa1 com a chapa engastada e livre de comprimento e — K = 2,0, a favor) e 5.5.1.2 (interação; a forma linear N/NRd + M/MRd ≤ 1 fica a favor)",
          [passo("Tração", "Nt / mín(Ag·fy/γa1; An·fu/γa2)", br(NtA, 1) + " / " + br(NtRdP, 1) + " kN"), passo("Compressão", "Nc / (χ·Ag·fy/γa1), λ0 = " + br(l0P, 3), br(NcA, 1) + " / " + br(NcRdP, 1) + " kN"), passo("Flexão", "M/MRd", br(Mp, 2) + " / " + br(MRd, 2) + " kN·m"), passo("Interação", "N/NRd + M/MRd", br(iNM, 3))], 1, iNM, ""));
        var FcAx = Math.min(nP * Fc(d, t, e.fu, Math.min(ev, eh) - dh / 2), nP * Fc(d, t, e.fu, s - dh), Fc(d, tw, e.fuV, ehW - dh / 2), Fc(d, tw, e.fuV, s - dh));
        vs.push(verif("Pressão de contato com a força axial (cada parafuso, a borda mais próxima em qualquer direção — a favor)", ED08 + ", 6.3.3.3", [passo("Borda da chapa", "mín(ev; eh) − dh/2", br(Math.min(ev, eh) - dh / 2, 1) + " mm"), passo("Borda da alma da viga (até a ponta da viga)", "e − folga − dh/2", br(ehW - dh / 2, 1) + " mm"), passo("Resistente por parafuso", "mín(1,2·lf·t·fu; 2,4·db·t·fu)/γa2", br(FcAx, 1) + " kN"), passo("Força no parafuso extremo", "", br(lx.F, 1) + " kN")], FcAx, lx.F));
        if (NtA > 0) {
          var rsP = LC().rasgamento({ t: t, fy: e.fy, fu: e.fu, lv: 2 * eh, furosV: 1, lt: (n - 1) * s, furosT: n - 1, dh: dh2, Cts: 1 }), rsW = LC().rasgamento({ t: tw, fy: e.fyV, fu: e.fuV, lv: 2 * ehW, furosV: 1, lt: (n - 1) * s, furosT: n - 1, dh: dh2, Cts: 1 });
          vs.push(verif("Colapso por rasgamento na direção da tração da viga (chapa e alma)", ED08 + ", 6.5.6 (2 planos de cisalhamento até a borda, plano tracionado entre os furos extremos)", [passo("Chapa", "lv = 2·eh; lt = (n − 1)·s", br(nP * rsP.Rd, 1) + " kN"), passo("Alma da viga", "lv = 2·(e − folga); lt = (n − 1)·s", br(rsW.Rd, 1) + " kN")], Math.min(nP * rsP.Rd, rsW.Rd), NtA));
          var NtW = Math.min(e.fyV * Lp * tw / g.a1, e.fuV * (Lp - n * dh2) * tw / g.a2) / 1000;
          vs.push(verif("Alma da viga à tração na ligação (só a faixa da altura da chapa — a favor)", ED08 + ", 5.2 (Ag·fy/γa1 e An·fu/γa2 da faixa ligada)", [passo("Resistente", "mín(Lp·tw·fy/γa1; (Lp − n·dh)·tw·fu/γa2)", br(NtW, 1) + " kN")], NtW, NtA));
        }
      }
      var tSup = op.apoioT != null ? op.apoioT : e.tApoio, aW = Math.max(pernaMin(Math.max(t, tSup)), 5), aMax = Math.max(aW, Math.floor(t > 6.35 ? t - 1.5 : t));
      if (op.passante) {
        /* M2 (1.2.145) CHAPA PASSANTE: a chapa atravessa o tubo e é soldada nas DUAS paredes — viga sobre dois apoios (as linhas de
           solda) com o balanço a: R(frente) = V·(a + Dw)/Dw e R(fundo) = V·a/Dw, forças ao longo da solda (sem momento na linha
           de solda: o momento V·a fica na chapa) — equilíbrio estático */
        var Dw = op.passante.Dw, Rn = V * (a + Dw) / Dw, Rf = V * a / Dw, fN = Rn * 1000 / (2 * Lp), fF = Rf * 1000 / (2 * Lp);
        if (e.forcar.a > 0) aW = num(e.forcar.a, aW);
        var capN = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000;
        while (!(e.forcar.a > 0) && capN < fN && aW < aMax) { aW++; capN = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000; }
        vs.push(verif("Solda da chapa na parede da frente do tubo (filete " + aW + " mm dos dois lados, " + br(Lp, 0) + " mm)", ED08 + ", 6.2.5 e Tabela 10; R = V·(a + Dw)/Dw ao longo da solda (chapa apoiada nas duas paredes — equilíbrio)",
          [passo("Distância entre as paredes", "Dw (eixo a eixo das paredes)", br(Dw, 0) + " mm"), passo("Reação na parede da frente", "V·(a + Dw)/Dw", br(Rn, 1) + " kN", comb(e.combV)), passo("Força por mm", "R/(2·L)", br(fN, 0) + " N/mm"), passo("Resistência por mm", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(capN, 0) + " N/mm")], capN, fN, "N/mm"));
        vs.push(verif("Solda da chapa na parede do fundo do tubo (filete " + aW + " mm dos dois lados)", ED08 + ", 6.2.5; R = V·a/Dw", [passo("Reação na parede do fundo", "V·a/Dw", br(Rf, 1) + " kN"), passo("Força por mm", "R/(2·L)", br(fF, 0) + " N/mm")], capN, fF, "N/mm"));
        var VpI = 0.6 * e.fy * Lp * t / g.a1 / 1000;
        vs.push(verif("Chapa ao cisalhamento dentro do tubo (entre as paredes)", ED08 + ", 6.5.5 (0,60·fy·Lp·t/γa1)", [passo("Cortante entre as paredes", "V·a/Dw", br(Rf, 1) + " kN"), passo("Resistente", "0,60·fy·Lp·t/γa1", br(VpI, 1) + " kN")], VpI, Rf));
      } else {
      if (e.forcar.a > 0) aW = num(e.forcar.a, aW);
      var fv = V / nP / (2 * Lp), fm = 6 * V / nP * a / (2 * Lp * Lp) + Nax / nP / (2 * Lp), f = Math.sqrt(fv * fv + fm * fm) * 1000, capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000;
      while (!(e.forcar.a > 0) && capW < f && aW < aMax) { aW++; capW = soldaMm(aW, e.fw, Math.min(e.fy, e.fyA)) * 1000; }
      vs.push(verif("Solda da chapa no apoio (filete " + aW + " mm dos dois lados, " + br(Lp, 0) + " mm)", ED08 + ", 6.2.5 e Tabela 10; cordão com V e M = V·e (método elástico)",
        [passo("Força por mm", Nax > 0 ? "√[(V/2L)² + (6·V·e/(2L²) + N/(2L))²], N = " + br(Nax, 1) + " kN" : "√[(V/2L)² + (6·V·e/(2L²))²]", br(f, 0) + " N/mm"), passo("Resistência por mm", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1)", br(capW, 0) + " N/mm")], capW, f, "N/mm"));
      }
      /* M2 (1.2.145): viga na ALMA do pilar de perfil I — a viga tem de CABER entre as mesas (bf ≤ d − 2·tf − 10 mm, a mesma folga do
         js/acoligsugere.js); antes era só aviso e a chapa simples passava batendo nas mesas */
      if (e.face === "alma" && !op.semEncaixe && num(e.apoio.tf, 0) > 0 && num(e.apoio.d, 0) > 0) {
        var livreA = e.apoio.d - 2 * e.apoio.tf - 10, vE = verif("A viga cabe entre as mesas do pilar (bf ≤ d − 2·tf − 10 mm)", "geometria (viga na alma do pilar)", [passo("Mesa da viga", "bf", br(v.bf, 0) + " mm"), passo("Livre entre as mesas − 10 mm", "d − 2·tf − 10", br(livreA, 0) + " mm")], livreA, num(v.bf, 0), "mm");
        vE.razao = livreA > 0 ? num(v.bf, 0) / livreA : Infinity; vs.push(vE);
      }
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
    var PF = PFs();
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
      var vEMc = vEntreMesas(e, "A chapa de topo curta (largura)", bp); if (vEMc) vs.push(vEMc);
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
    var PF = PFs();
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
    var Lang = op.La || cima10(Math.max(num(v.bf, 100) + 20, 150)), melhor = null, dims = null, desenhoA = null, LISTA = op.catFixo ? [op.catFixo] : ANG_ASSENTO;   /* M2: a cantoneira de topo e assento semirrígida fixa a cantoneira */
    if (!op.enrijecido) {
      for (var i = 0; i < LISTA.length && !melhor; i++) {
        var a = LISTA[i], ef = Math.max(0, FOLGA + ln / 2 - (a.t + 10)), Mk = R * ef / 1000, MRd = Lang * a.t * a.t / 4 * e.fy / g.a1 / 1e6;
        if (a.a < ln + FOLGA && i < LISTA.length - 1) continue;
        var vA = verif("Aba de assento à flexão (" + a.cat + " × " + Lang + " mm)", "seção crítica a t + 10 mm do canto; La·t²·fy/4/γa1 (" + PRATICA + ")", [passo("Braço", "e = folga + ln/2 − (t + 10)", br(ef, 1) + " mm"), passo("Momento", "R·e", br(Mk, 2) + " kN·m"), passo("Resistente", "La·t²·fy/(4·γa1)", br(MRd, 2) + " kN·m")], MRd, Mk, "kN·m");
        if (vA.razao <= 1 || i === LISTA.length - 1) { melhor = a; vs.push(vA);
          /* M2 (1.2.145): a aba mais curta que o apoio necessário REPROVA (antes: só uma nota, e a opção passava) */
          var vApo = verif("Comprimento de apoio na aba de assento (folga + ln ≤ aba)", ED08 + ", 5.7.3 e 5.7.4 — o ln usado nas verificações da alma tem de caber na aba", [passo("Necessário", "folga + ln", br(ln + FOLGA, 0) + " mm"), passo("Aba horizontal", a.cat, br(a.a, 0) + " mm")], a.a, ln + FOLGA, "mm"); vs.push(vApo); }
      }
      var pf = PF[1], nb = 2, PFa = op.pf ? [op.pf] : PF;
      for (var ib = 0; ib < PFa.length; ib++) { pf = PFa[ib]; nb = R / FvRd(pf.d, e.fub) <= 2 ? 2 : 4; if (R / nb <= FvRd(pf.d, e.fub)) break; }
      var fvr = FvRd(pf.d, e.fub), Fcm = Math.min(Fc(pf.d, melhor.t, e.fu, Infinity), Fc(pf.d, e.tApoio, e.fuA, Infinity));
      var gxA = op.gx || cima5(Math.max(3 * pf.d, 0.55 * num(v.bf, 100)));
      var vEMa = vEntreMesas(e, "A cantoneira de assento (comprimento)", Lang); if (vEMa) vs.push(vEMa);
      if (apoioComMesa(e)) vs.push(vBorda("furos do assento na mesa do apoio", (e.apoio.bf - gxA) / 2, pf.d, "laminada"));
      vs.push(vBorda("furos na ponta da cantoneira de assento", (Lang - gxA) / 2, pf.d, "serra"));
      vs.push(verif("Parafusos do assento no apoio (" + nb + " × " + pf.id + ")", ED24 + ", 6.3.3.2", [passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN"), passo("Por parafuso", "R/" + nb, br(R / nb, 1) + " kN", comb(e.combV))], fvr, R / nb));
      vs.push(verif("Pressão de contato (assento e apoio)", ED08 + ", 6.3.3.3", [passo("Por parafuso", "2,4·db·t·fu/γa2 (furo longe da borda na direção da força)", br(Fcm, 1) + " kN")], Fcm, R / nb));
      dims = { cat: melhor.cat, comprimento: Lang, parafuso: pf.id, n: nb, ln: Math.round(ln), topo: "L89X89X6.4 (estabilidade)" };
      desenhoA = { cat: melhor.cat, comprimento: Lang / 1000, parafuso: pf.id, parafusos: nb };
    } else {
      var W = cima10(ln + FOLGA + 10), lim = 0.56 * Math.sqrt(E / e.fy), ts = null, vEMe = vEntreMesas(e, "A chapa de assento (comprimento)", Lang); if (vEMe) vs.push(vEMe);
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
  /* M2 (revisão 15/10/2026): ligação de MOMENTO num apoio SEM mesa de perfil I (pilar tubular ou apoio sem perfil): a mesa do pilar
     (T-stub, 5.7) e o painel não têm como ser verificados — antes a 8ES em tubo com M = 150 passava 0,950 sem nada do pilar */
  function semMesaPilar(e) {
    if (e.face === "nenhuma") return null;   /* cumeeira e emenda: não há pilar */
    var ap = e.apoio || {};
    if (ehTubo(ap)) return "ligação de momento em pilar TUBULAR (" + (ap.nome || "tubo") + "): a parede do tubo sob as forças das mesas da viga não está verificada — use o anel (colar) dimensionado à parte ou um pilar de perfil I";
    if (!(num(ap.bf, 0) > 0 && num(ap.tf, 0) > 0 && num(ap.d, 0) > 0 && num(ap.tw, 0) > 0)) return "o apoio não tem perfil I informado (bf, tf, d, tw): a mesa e a alma do pilar sob as forças das mesas da viga não estão verificadas";
    return null;
  }
  function comNaoVer(r, e) {
    r.reforcos = r.reforcos || []; r.notas = r.notas || []; r.naoVerificado = r.naoVerificado || [];
    r.bloqueante = r.bloqueante || [];
    var sm = semMesaPilar(e); if (sm && r.bloqueante.indexOf(sm) < 0) r.bloqueante.push(sm);
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
      var pl = pilarLocal(e.apoio, e.M * 1000 / (e.viga.d - e.viga.tf), opPilar(e, e.viga, { perto: true, forcarEnrij: true }));
      d.enrijecedores = pl.enrij; r.reforcos.push("Enrijecedores de continuidade (pedidos): " + pl.enrij.texto);
    }
    r.desenho = r.desenho || {}; r.desenho.enrijecedores = d.enrijecedores ? { t: d.enrijecedores.t / 1000 } : null;
    /* M2 (1.2.145): a mesa do pilar sob as 2 linhas tracionadas (T-stub da EN 1993-1-8, Tabela 6.4) — antes só a 5.7.2 */
    var ft = ftDe(r), c = e.apoio;
    if (ft && c && c.d && c.bf && e.face === "mesa" && d.gage) {
      var pfi = Math.max(35, num(d.d, 20) + 8), pfo = num(d.ext, 0) - num(d.borda, 0), v = e.viga;
      r.verificacoes = r.verificacoes.concat(tstubPilar(c, [v.d / 2 - v.tf - pfi, v.d / 2 + pfo], d.gage, ft.ftr, ft.Ft, e.fyA, !!p.topoPilar, num(d.borda, 26), "2 linhas junto da mesa tracionada", { d: num(d.d, 20), tChapa: num(d.t, 16), eChapa: (num(d.largura, 0) - num(d.gage, 0)) / 2, cortes: d.enrijecedores ? [v.d / 2 - v.tf / 2] : [] }));
      var fe2 = fecha(r.verificacoes); r.ok = fe2.ok; r.razao = fe2.razao; r.governante = fe2.governante;
    }
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
    var PF = PFs();
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
        var pl = pilarLocal(e.apoio, Ff, opPilar(e, v, { perto: !!p.topoPilar, ln: v.tf + 2 * 8 + 2 * tp, forcarEnrij: !!op.comEnrijecedor }));
        vs = vs.concat(pl.vs); if (pl.enrij) rs.reforcos.push("Enrijecedores de continuidade: " + pl.enrij.texto); rs.enrij = pl.enrij;
        var pn = painel(e.apoio, e.M * 1000 / (v.d - v.tf), e.fyA, opPainel(e)); vs = vs.concat(pn.vs); rs.nv = pn.nv; if (pn.reforco) rs.reforcos.push(pn.reforco.texto); rs.painel = pn.reforco;
        /* M2 (1.2.145): a mesa do pilar sob as 2 linhas tracionadas (T-stub da EN 1993-1-8, Tabela 6.4) */
        vs = vs.concat(tstubPilar(e.apoio, [v.d / 2 - v.tf - pfi - s, v.d / 2 - v.tf - pfi], gage, ftr, Ft, e.fyA, !!p.topoPilar, 26, "2 linhas junto da mesa tracionada", { d: d, tChapa: tp, eChapa: (bp - gage) / 2 }));
      }
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "chapaAjustada",
        dimensoes: { t: tp, largura: bp, altura: v.d, parafuso: pf.id, d: d, n: nTot, gage: gage, enrijecedores: rs.enrij || null, reforcoAlma: rs.painel || null },
        desenho: { t: tp / 1000, parafuso: pf.id, ext: 0, gage: gage / 1000, largura: bp / 1000, linhas: 4, enrijecedores: rs.enrij ? { t: rs.enrij.t / 1000 } : null },
        resumo: "Chapa ajustada " + br(bp, 0) + " × " + br(v.d, 0) + " × " + br(tp, 1) + " mm, " + nTot + " parafusos " + pf.id + " " + e.classe + "; mesas em penetração total" + (rs.reforcos.length ? "; " + rs.reforcos.join("; ") : ""),
        verificacoes: vs, reforcos: rs.reforcos, notas: ["Semirrígida: a rigidez da ligação ajustada deve ser avaliada no modelo (NBR 8800, 6.1 — classificação das ligações)."], naoVerificado: ["Rigidez rotacional da ligação ajustada (classificação rígida/semirrígida): não calculada."].concat(rs.nv || []) };
    }
  }

  /* ================================================================ TALAS DE MESA (viga → mesa do pilar) */
  function talasMesa(p, op) {
    var PF = PFs();
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
      var refs = [], enr = null, pr = null, nvP = [];
      if (e.apoio && e.apoio.d && e.face === "mesa") {
        var pl = pilarLocal(e.apoio, Ff, opPilar(e, { bf: bp, tf: tp }, { perto: !!p.topoPilar, ln: tp + 10 })); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
        var pn = painel(e.apoio, e.M * 1000 / (v.d + tp), e.fyA, opPainel(e)); vs = vs.concat(pn.vs); nvP = pn.nv; pr = pn.reforco; if (pr) refs.push(pr.texto);
      }
      var fe = fecha(vs);
      dims.t = tp; dims.largura = bp; dims.chapaAlma = ws.dimensoes; dims.enrijecedores = enr; dims.reforcoAlma = pr;
      var wd = ws.desenho || {}, nAl = num(ws.dimensoes && ws.dimensoes.n, 0);
      var des = { t: tp / 1000, largura: bp / 1000, parafuso: sold ? (wd.parafuso || "M20") : pf.id, linhas: sold ? 0 : nr, gage: sold ? null : gg / 1000, passo: s / 1000, soldada: sold, comprimento: dims.comprimento / 1000,
        alma: { t: wd.t, parafuso: wd.parafuso, linhas: wd.linhas, a: wd.a, altura: wd.altura, largura: wd.largura }, nTotal: (sold ? 0 : 2 * nb) + nAl };
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "talasMesa", dimensoes: dims, desenho: des,
        resumo: "Talas de mesa " + br(bp, 0) + " × " + br(dims.comprimento, 0) + " × " + br(tp, 1) + " mm " + (sold ? "soldadas na viga (filete " + dims.solda + " mm)" : "com " + dims.n + " parafusos " + dims.parafuso + " por mesa") + ", penetração total no pilar; alma: " + ws.resumo + (refs.length ? "; " + refs.join("; ") : ""),
        verificacoes: vs, reforcos: refs, notas: [], naoVerificado: nvP };
    }
  }

  /* ================================================================ VIGA SOLDADA DIRETO NO PILAR */
  function soldadaDireta(p) {
    var e = ent(p), g = gamas(), v = e.viga, vs = [], refs = [];
    var Ff = e.M * 1000 / (v.d - v.tf) + e.Nt / 2, FmRd = v.bf * v.tf * Math.min(e.fyV, e.fyA) / g.a1 / 1000;
    vs.push(verif("Mesas da viga em penetração total", ED08 + ", 6.2.5 e Tabela 8 (resistência do metal-base)", [passo("Força na mesa", "M/(d − tf) + N/2", br(Ff, 1) + " kN", comb(e.combM)), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN")], FmRd, Ff));
    var hw = v.d - 2 * v.tf - 2 * num(v.r, 0), aW = Math.max(pernaMin(Math.max(v.tw, e.tApoio)), 5), FwA = 2 * LC().soldaFilete(aW, hw, e.fw, Math.min(e.fyV, e.fyA));
    vs.push(verif("Alma da viga (filete " + aW + " mm dos dois lados, " + br(hw, 0) + " mm)", ED08 + ", 6.2.5", [passo("Resistente", "2·mín(0,60·0,707·a·L·fw/γw2; 0,60·a·L·fy/γa1)", br(FwA, 1) + " kN")], FwA, e.V));
    var enr = null, pr = null, nvP = [];
    if (e.apoio && e.apoio.d && e.face === "mesa") {
      var pl = pilarLocal(e.apoio, Ff, opPilar(e, v, { perto: !!p.topoPilar, ln: v.tf + 2 * 8 })); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
      var pn = painel(e.apoio, e.M * 1000 / (v.d - v.tf), e.fyA, opPainel(e)); vs = vs.concat(pn.vs); nvP = pn.nv; pr = pn.reforco; if (pr) refs.push(pn.reforco.texto);
    }
    var fe = fecha(vs);
    return comNaoVer({ ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "soldadaDireta", dimensoes: { soldaMesas: "penetração total", soldaAlma: aW, enrijecedores: enr, reforcoAlma: pr }, desenho: { soldada: true, nTotal: 0 },
      resumo: "Viga soldada no pilar: mesas em penetração total, alma com filete " + aW + " mm" + (refs.length ? "; " + refs.join("; ") : ""), verificacoes: vs, reforcos: refs,
      notas: ["Penetração total: inspeção por ultrassom; cantoneira de montagem provisória."], naoVerificado: nvP }, e);
  }
  function painelAlma(p) {
    var e = ent(p), pn = painel(e.apoio, e.M * 1000 / (e.viga.d - e.viga.tf), e.fyA, opPainel(e)), vs = pn.vs.slice(), fe = fecha(vs);
    return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "painelAlma", dimensoes: { reforcoAlma: pn.reforco }, desenho: pn.reforco ? { t: pn.reforco.t / 1000 } : null, resumo: pn.reforco ? pn.reforco.texto : "O painel da alma do pilar resiste sem reforço.", verificacoes: vs, reforcos: pn.reforco ? [pn.reforco.texto] : [], notas: [], naoVerificado: pn.nv };
  }
  function enrijecedorContinuidade(p) {
    var e = ent(p), Ff = e.M * 1000 / (e.viga.d - e.viga.tf) + e.Nt / 2, pl = pilarLocal(e.apoio, Ff, opPilar(e, e.viga, { perto: !!p.topoPilar, forcarEnrij: true })), fe = fecha(pl.vs);
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
    var eM = c + FOLGA, Msd = V * eM / 1000, MRd = S * e.fyV / g.a1 / 1e6, vs = [], nv = [], blq = [];
    vs.push(verif("Seção recortada à flexão no fim do recorte", "escoamento: W·fy/γa1 da seção T que sobra (AISC Steel Construction Manual, Parte 9 — Mn = Fy·Snet; " + PRATICA + ")", [passo("Recorte", "altura dc × comprimento c", dc + " × " + c + " mm"), passo("Módulo resistente", "W = I/(ho − ȳ)", br(S / 1000, 1) + "·10³ mm³", "ho = " + br(ho, 0) + " mm; ȳ = " + br(yb, 1) + " mm"),
      passo("Momento", "V·(c + folga)", br(Msd, 2) + " kN·m", comb(e.combV)), passo("Resistente", "W·fy/γa1", br(MRd, 2) + " kN·m")], MRd, Msd, "kN·m"));
    /* M2 (1.2.145): FLAMBAGEM LOCAL DA ALMA RECORTADA — AISC Steel Construction Manual, Parte 9 (viga recortada só em cima,
       válida para c ≤ 2·d e dc ≤ d/2): 14ª ed. Fcr = 0,904·E·(tw/ho)²·f·k (f = 2c/d até c/d = 1, senão 1 + c/d; k = 2,2·(ho/c)^1,65
       até c/ho = 1, senão 2,2·ho/c) e 15ª ed. Fcr = Fy·Q (λ = ho·√Fy/(10·tw·√(475 + 280·(ho/c)²)), Fy em ksi; Q = 1 até λ = 0,7;
       1,34 − 0,486λ até 1,41; 1,30/λ² acima) — vale a MENOR (a favor); Fcr ≤ fy. Antes: só uma nota quando c > 2d — e sem bloquear. */
    var fK = c / v.d <= 1 ? 2 * c / v.d : 1 + c / v.d, kK = c / ho <= 1 ? 2.2 * Math.pow(ho / c, 1.65) : 2.2 * ho / c, Fcr14 = Math.min(e.fyV, 0.904 * E * sq(tw / ho) * fK * kK);
    var Fyk = e.fyV / 6.894757, lam = ho * Math.sqrt(Fyk) / (10 * tw * Math.sqrt(475 + 280 * sq(ho / c))), Qc = lam <= 0.7 ? 1 : lam <= 1.41 ? 1.34 - 0.486 * lam : 1.30 / (lam * lam), Fcr15 = e.fyV * Qc;
    var Fcr = Math.min(Fcr14, Fcr15), MRdF = S * Fcr / g.a1 / 1e6;
    vs.push(verif("Flambagem local da alma recortada", "AISC Steel Construction Manual, Parte 9 (viga recortada em cima; 14ª ed. f·k e 15ª ed. Fy·Q — a menor); Mn = Fcr·Snet, γa1 no lugar do φ = 0,90",
      [passo("14ª ed.: f; k", "f = " + (c / v.d <= 1 ? "2c/d" : "1 + c/d") + "; k = " + (c / ho <= 1 ? "2,2·(ho/c)^1,65" : "2,2·ho/c"), br(fK, 3) + "; " + br(kK, 3)), passo("Fcr (14ª)", "0,904·E·(tw/ho)²·f·k ≤ fy", br(Fcr14, 1) + " MPa"),
       passo("15ª ed.: λ; Q", "ho·√Fy/(10·tw·√(475 + 280·(ho/c)²)) (Fy em ksi)", br(lam, 3) + "; " + br(Qc, 3)), passo("Fcr (15ª)", "Fy·Q", br(Fcr15, 1) + " MPa"),
       passo("Momento", "V·(c + folga)", br(Msd, 2) + " kN·m"), passo("Resistente", "Fcr·W/γa1, Fcr = " + br(Fcr, 1) + " MPa", br(MRdF, 2) + " kN·m")], MRdF, Msd, "kN·m"));
    if (c > 2 * v.d || dc > v.d / 2) { blq.push("recorte fora da validade das fórmulas da viga recortada (c ≤ 2·d e dc ≤ d/2: c = " + c + " mm, dc = " + dc + " mm, d = " + br(v.d, 0) + " mm) — flambagem do trecho recortado não verificada"); nv.push("Recorte fora de c ≤ 2·d e dc ≤ d/2 (AISC Manual, Parte 9): flambagem lateral/local do trecho recortado NÃO verificada — recorte menor ou enrijecer a alma."); }
    var con = op.conector === "chapaSimples" ? chapaSimples(p, { recorte: { topo: dc, ev: cima5(bordaMin(20, "laminada")) + 5 }, apoioT: num(pr.tw, 8) }) : cantoneiraDupla(p, { recorte: { topo: dc, ev: 35 } });
    var cd = con.dimensoes || {}, d = num(String(cd.parafuso || "M20").replace(/\D/g, ""), 20), n = num(cd.n || cd.linhas, 2), s = cima5(3 * d), dh2 = furo(d) + 2;
    /* M2: a distância do furo à PONTA da viga é a do conector — chapa simples: a − folga; cantoneira: o gabarito da aba − folga (antes:
       o gabarito ou 50 mm com o mínimo de 30, e a chapa simples, que não tem gabarito, ficava com 37 mm qualquer que fosse o "a") */
    var evW = 35, ehW = cd.a != null ? num(cd.a, 75) - FOLGA : num(cd.gage, 50) - FOLGA, rs = LC().rasgamento({ t: tw, fy: e.fyV, fu: e.fuV, lv: evW + (n - 1) * s, furosV: n - 0.5, lt: ehW, furosT: 0.5, dh: dh2, Cts: 1 });
    vs.push(verif("Colapso por rasgamento da alma recortada", ED08 + ", 6.5.6", [passo("Áreas", "Agv = (ev + (n − 1)·s)·tw; Ant = (eh − dh/2)·tw", "Agv " + br(rs.Agv, 0) + "; Anv " + br(rs.Anv, 0) + "; Ant " + br(rs.Ant, 0) + " mm²", "ev = " + evW + " mm do recorte; eh = " + br(ehW, 0) + " mm da ponta"), passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rs.Rd, 1) + " kN")], rs.Rd, V));
    con.verificacoes.forEach(function (x) { vs.push(x); });
    var fe = fecha(vs);
    return { bloqueante: blq.concat(arr(con.bloqueante)), ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "vigaRecortada", dimensoes: { recorte: { dc: dc, c: c }, conector: cd }, desenho: con.desenho,
      resumo: "Recorte da mesa " + dc + " × " + c + " mm; " + con.resumo, verificacoes: vs, reforcos: [], notas: ["O recorte vai no desenho de fabricação (o 3D não recorta a mesa)."].concat(con.notas || []), naoVerificado: nv.concat(con.naoVerificado || []), sugestao: fe.ok ? null : con.sugestao || "Recorte menor (viga secundária mais baixa) ou enrijecer a alma recortada." };
  }

  /* ================================================================ EMENDAS POR TALAS (viga e pilar) */
  function talasEmenda(e, sec, Ff, sold, rot) {
    var PF = PFs();
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
    var PF = PFs();
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
      if (e.apoio && e.apoio.d && e.face === "mesa") { var pl = pilarLocal(e.apoio, Ff, opPilar(e, { bf: s.bf, tf: s.tf }, { ln: s.tf + 16 })); vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores no pilar: " + enr.texto); }
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
    var PF = PFs();
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
  /* =====================================================================================================================
   * M2 (1.2.145, 14/10/2026) — LIGAÇÕES VIGA × PILAR NOVAS. Pedido do Rogério: "mais opções para ligações entre vigas e
   * pilares, tipos de ligações, tudo que tem no Brasil". Cada fórmula diz a fonte no passo; o que não tem fonte reconhecida
   * fica NÃO DIMENSIONADO (catálogo e desenho, sem Aplicar). Referências usadas além da NBR 8800 (texto da 2024 fora da
   * biblioteca — EDICAO.aviso): EN 1993-1-8:2005 (T-stub, cantoneira de mesa, nós de tubo — a formulação que a NBR 16239
   * adota), AISC 360-16 (J7, J10), AISC 358-16 (6.10), AISC Steel Construction Manual (Partes 9 e 10), AISC Design Guide 4.
   * ===================================================================================================================== */
  /* a 8ES experimenta M16 a M30 da tabela ÚNICA (js/acomateriais.js, DIAMETROS) — lida na hora, como o PFs() */
  function PF8s() { var M = Mat(), L = M && M.diametros ? M.diametros("parafuso") : []; return L.filter(function (x) { return x.d >= 16 - 1e-9 && x.d <= 30 + 1e-9; }); }
  var REF_TSTUB = "EN 1993-1-8:2005, 6.2.4 e Tabela 6.2 (T-stub: modos 1, 2 e 3 e o caso sem alavanca 1-2 — vale o MENOR, a favor; γa1 no lugar do γM0)";
  var REF_SEMALAV = "chapa sem efeito alavanca: AISC Steel Construction Manual, Parte 9 (t ≥ √(4·T·b'/(φ·p·Fu))) — aqui com fy e γa1 (a favor)";
  /* T-STUB equivalente (EN 1993-1-8:2005, 6.2.4, Tabela 6.2). leff1/leff2: comprimentos efetivos (mm) dos modos 1 e 2; t (mm);
     fy (MPa); m, n (mm; n ≤ 1,25·m); sFt (kN): a soma do Ft,Rd dos parafusos; al = { Lb (mm, comprimento de alongamento do
     parafuso), As (mm²), nb (linhas) } → com Lb ≤ Lb* = 8,8·m³·As·nb/(Σleff,1·t³) a ALAVANCA se desenvolve e valem os modos 1,
     2 e 3; com Lb > Lb*, o caso sem alavanca (1-2) e o modo 3. Sem al: o menor dos quatro (a favor). → { F (kN), modo, … } */
  function tstub(leff1, leff2, t, fy, m, n, sFt, al) {
    var g = gamas(), M1 = 0.25 * leff1 * t * t * fy / g.a1 / 1000, M2 = 0.25 * leff2 * t * t * fy / g.a1 / 1000;
    n = Math.max(0, Math.min(n, 1.25 * m)); m = Math.max(m, 1);
    var F1 = 4 * M1 / m, F2 = (2 * M2 + n * sFt) / (m + n), F3 = sFt, F12 = 2 * M1 / m, Lbx = null, alav = null, F;
    if (al && al.Lb > 0 && al.As > 0) { Lbx = 8.8 * Math.pow(m, 3) * al.As * Math.max(1, al.nb || 1) / (Math.max(leff1, 1) * Math.pow(t, 3)); alav = al.Lb <= Lbx; }
    F = alav === true ? Math.min(F1, F2, F3) : alav === false ? Math.min(F12, F3) : Math.min(F1, F2, F3, F12);
    var modo = F === F3 ? "modo 3: parafusos" : F === F12 && alav !== true ? "sem alavanca (1-2): escoamento da chapa" : F === F2 ? "modo 2: parafusos + chapa (com alavanca)" : "modo 1: chapa";
    return { F: F, modo: modo, F1: F1, F2: F2, F3: F3, F12: F12, M1: M1, M2: M2, m: m, n: n, Lb: al ? al.Lb : null, Lbx: Lbx, alav: alav };
  }
  function passosTstub(ts, leff1, leff2, t, rot) {
    var L = [passo(rot + ": comprimentos efetivos", "leff,1; leff,2", br(leff1, 0) + "; " + br(leff2, 0) + " mm", "t = " + br(t, 1) + " mm; m = " + br(ts.m, 1) + " mm; n = " + br(ts.n, 1) + " mm"),
            passo("Modo 1 (chapa)", "4·Mpl,1/m", br(ts.F1, 1) + " kN"), passo("Modo 2 (parafusos + chapa)", "(2·Mpl,2 + n·ΣFt,Rd)/(m + n)", br(ts.F2, 1) + " kN"),
            passo("Modo 3 (parafusos)", "ΣFt,Rd", br(ts.F3, 1) + " kN"), passo("Sem alavanca (1-2)", "2·Mpl,1/m", br(ts.F12, 1) + " kN")];
    if (ts.Lbx != null) L.push(passo("Alavanca", "Lb* = 8,8·m³·As·nb/(Σleff,1·t³)", "Lb = " + br(ts.Lb, 0) + " mm " + (ts.alav ? "≤" : ">") + " Lb* = " + br(ts.Lbx, 0) + " mm", ts.alav ? "a alavanca se desenvolve: modos 1, 2 e 3" : "sem alavanca: modo 1-2 e modo 3"));
    else L.push(passo("Alavanca", "comprimento do parafuso não informado", "o menor dos quatro modos (a favor)"));
    L.push(passo("Governa", ts.modo, br(ts.F, 1) + " kN"));
    return L;
  }
  /* comprimento de alongamento do parafuso (EN 1993-1-8, Tabela 6.2, nota): o aperto (as chapas + 2 arruelas) + metade da cabeça
     e da porca; As = área resistente à tração da rosca (π/4·(d − 0,9382·passo)²) — dimensões do catálogo de parafusos do
     js/metalnorma.js */
  function alongamento(d, tChapas, nb) {
    var N = Nor(), q = N && N.parafuso ? N.parafuso(d) : null; if (!q) return null;
    var hA = q.arr ? num(q.arr.h, 3) : 3, Lb = tChapas + 2 * hA + (num(q.k, 0.6 * d) + num(q.m, 0.8 * d)) / 2, As = Math.PI / 4 * sq(d - 0.9382 * num(q.passo, 0.12 * d));
    return { Lb: Lb, As: As, nb: nb || 1 };
  }
  /* NERVURA da extensão da chapa de extremidade (AISC 358-16, 6.10 — a do AISC Design Guide 4, 2ª ed.): ts ≥ tw·fyb/fys,
     hst/ts ≤ 0,56·√(E/fys), Lst = hst/tan 30°; solda de penetração total (o detalhe pré-qualificado pede CJP com ts > 10 mm) */
  function nervura(hst, tw, fyV, fyR) {
    var lim = 0.56 * Math.sqrt(E / fyR), tMin = Math.max(tw * fyV / fyR, hst / lim, 6.3), ts = CHAPAS.filter(function (t) { return t >= tMin - 1e-9; })[0] || CHAPAS[CHAPAS.length - 1], Lst = cima5(hst / Math.tan(Math.PI / 6));
    var v = verif("Nervura da extensão (" + br(hst, 0) + " × " + Lst + " × " + br(ts, 1) + " mm, no plano da alma)", "AISC 358-16, 6.10 (ts ≥ tw·fyb/fys; hst/ts ≤ 0,56·√(E/fys); Lst ≥ hst/tan 30°) — AISC Design Guide 4 (2ª ed.); solda de penetração total na chapa e na mesa",
      [passo("Espessura mínima", "máx(tw·fyb/fys; hst/(0,56·√(E/fys)))", br(tMin, 1) + " mm", "tw = " + br(tw, 2) + " mm; fyb = " + br(fyV, 0) + "; fys = " + br(fyR, 0) + " MPa"), passo("Adotada", "comercial", br(ts, 1) + " mm"), passo("Comprimento", "hst/tan 30°", Lst + " mm")], ts, tMin, "mm");
    v.razao = tMin / ts;
    return { v: v, t: ts, h: hst, L: Lst };
  }
  /* MESA DO PILAR sob LINHAS de parafusos tracionados — T-stub da EN 1993-1-8:2005, Tabela 6.4 (mesa sem enrijecedor: cada linha
     isolada e as linhas em grupo; a linha da ponta do pilar com e1). Com enrijecedores de continuidade entre as linhas, os
     valores da mesa SEM enrijecedor são o limite inferior (o enrijecedor só acrescenta — a favor). ys: posições das linhas ao
     longo do pilar (mm); Ft: força por parafuso (kN); 2 parafusos por linha no gabarito g. Antes desta frente, a chapa de
     extremidade só tinha a 5.7.2 (6,25·tf²·fy — a força de MESA SOLDADA), que não é a verificação da mesa sob parafusos. */
  function tstubPilar(c, ys, gage, ftr, Ft, fy, topo, e1, rot, op) {
    op = op || {};
    /* n = emin ≤ 1,25·m, emin = o menor entre a borda da mesa do pilar e a da chapa que encosta nela (EN 1993-1-8, Figura 6.8) */
    var m = Math.max((gage - c.tw) / 2 - 0.8 * num(c.r, 0), 1), ec = (c.bf - gage) / 2, n = Math.min(ec, op.eChapa > 0 ? op.eChapa : ec, 1.25 * m), vs = [], PI = Math.PI, dB = num(op.d, 20);
    ys = ys.slice().sort(function (a, b) { return a - b; });
    var topoY = ys[ys.length - 1];
    /* os enrijecedores de continuidade entre as linhas separam os grupos (EN 1993-1-8, Tabela 6.5: não há grupo que atravesse o
       enrijecedor); a linha junto ao enrijecedor fica com os valores da mesa sem enrijecedor — limite inferior (a favor) */
    var grupos = [[]], cortes = arr(op.cortes).slice().sort(function (a, b) { return a - b; });
    ys.forEach(function (y, i) { if (i > 0 && cortes.some(function (cz) { return cz > ys[i - 1] && cz < y; })) grupos.push([]); grupos[grupos.length - 1].push(y); });
    var pior = null;
    ys.forEach(function (y) {
      var ponta = topo && y === topoY, cp = ponta ? Math.min(2 * PI * m, PI * m + 2 * e1) : 2 * PI * m, nc = ponta ? Math.min(4 * m + 1.25 * ec, 2 * m + 0.625 * ec + e1) : 4 * m + 1.25 * ec;
      var ts = tstub(Math.min(cp, nc), nc, c.tf, fy, m, n, 2 * ftr, alongamento(dB, c.tf + num(op.tChapa, 0), 1)), rz = 2 * Ft / ts.F;
      if (!pior || rz > pior.rz) pior = { rz: rz, ts: ts, cp: cp, nc: nc, ponta: ponta };
    });
    vs.push(verif("Mesa do pilar à flexão sob cada linha de parafusos (" + (rot || "linha tracionada") + ")", "EN 1993-1-8:2005, Tabela 6.4 (mesa do pilar sem enrijecedor, linha isolada" + (pior.ponta ? "; linha da ponta do pilar com e1 = " + br(e1, 0) + " mm" : "") + "); " + REF_TSTUB,
      [passo("m; e", "m = (g − tw)/2 − 0,8·r; e = (bf − g)/2", br(m, 1) + "; " + br(ec, 1) + " mm")].concat(passosTstub(pior.ts, Math.min(pior.cp, pior.nc), pior.nc, c.tf, "Linha")).concat([passo("Força na linha", "2·Ft", br(2 * Ft, 1) + " kN")]), pior.ts.F, 2 * Ft));
    grupos.forEach(function (G) {
      var nR = G.length; if (nR < 2) return;
      var Scp = 0, Snc = 0;
      G.forEach(function (y, i) {
        var cp, nc;
        if (i === 0 || i === nR - 1) { var pp = i === 0 ? G[1] - G[0] : G[nR - 1] - G[nR - 2], ponta = topo && y === topoY; cp = ponta ? Math.min(PI * m + pp, 2 * e1 + pp) : PI * m + pp; nc = ponta ? Math.min(2 * m + 0.625 * ec + 0.5 * pp, e1 + 0.5 * pp) : 2 * m + 0.625 * ec + 0.5 * pp; }
        else { var pa = (G[i + 1] - G[i - 1]) / 2; cp = 2 * pa; nc = pa; }
        Scp += cp; Snc += nc;
      });
      var tsG = tstub(Math.min(Scp, Snc), Snc, c.tf, fy, m, n, 2 * nR * ftr, alongamento(dB, c.tf + num(op.tChapa, 0), nR));
      vs.push(verif("Mesa do pilar à flexão sob " + nR + " linhas em grupo" + (grupos.length > 1 ? " (de um lado do enrijecedor)" : ""), "EN 1993-1-8:2005, Tabela 6.4 (linhas como parte de um grupo: Σleff)" + (grupos.length > 1 ? " e Tabela 6.5 (o grupo não atravessa o enrijecedor)" : "") + "; " + REF_TSTUB,
        passosTstub(tsG, Math.min(Scp, Snc), Snc, c.tf, "Grupo").concat([passo("Força no grupo", 2 * nR + "·Ft", br(2 * nR * Ft, 1) + " kN")]), tsG.F, 2 * nR * Ft));
    });
    return vs;
  }
  /* a força por parafuso tracionado e o Ft,Rd de um resultado do motor existente (a verificação "Parafusos à tração") */
  function ftDe(r) { var v = arr(r && r.verificacoes).filter(function (x) { return /^Parafusos à tração/.test(x.nome); })[0]; return v ? { Ft: num(v.solicitante, 0), ftr: num(v.resistencia, 0) } : null; }

  /* ================================================================ CHAPA DE EXTREMIDADE ESTENDIDA — 8 PARAFUSOS POR MESA (8ES)
   * 4 linhas de 2 junto de CADA mesa (2 fora — a extensão com nervura — e 2 dentro), 16 parafusos; momento nos dois sentidos.
   * Parafusos: distribuição plástica M = 2·Ft·(h1 + h2 + h3 + h4) (AISC Design Guide 4 / AISC 358-16, 6.8 — exige chapa
   * espessa: verificada sem alavanca). Chapa: a raiz da mesa leva o momento das DUAS linhas do lado (Σ Ft·b'), sem contar a
   * nervura (a favor). Pilar: 5.7 + painel + a mesa do pilar sob os parafusos (sem alavanca). */
  function chapaExt8(p, op) {
    op = op || {};
    var e = ent(p), g = gamas(), v = e.viga, c = e.apoio && e.apoio.d && e.apoio.bf ? e.apoio : null, topo = !!p.topoPilar, melhor = null, ultimo = null;
    var ac0 = { id: e.acoId, fy: e.fy, fu: e.fu }, acos = [ac0]; if (ac0.fy < 345) acos.push({ id: "ASTM A572 Gr.50", fy: 345, fu: 450 });
    if (!(num(v.d, 0) > 0 && num(v.bf, 0) > 0 && num(v.tf, 0) > 0)) return { ok: false, razao: Infinity, governante: "viga sem perfil I", tipo: "chapaExt8", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "A chapa de extremidade de 8 parafusos por mesa pede viga de perfil I." };
    for (var ai = 0; ai < acos.length && !melhor; ai++) {
      var cands = [];
      var PF8c = pfLista(PF8s(), e), T8 = tFixo(e) ? [tFixo(e)] : CHAPAS.slice(3);
      for (var ip = 0; ip < PF8c.length; ip++) for (var it = 0; it < T8.length; it++) { var r = avaliar(PF8c[ip], T8[it], acos[ai]); if (!r) break; ultimo = r; if (r.ok) { cands.push(r); break; } }
      melhor = cands.filter(function (x) { return x.dimensoes.t <= Math.max(1.25 * x.dimensoes.d, 16); })[0] || cands.slice().sort(function (a, b) { return a.dimensoes.t - b.dimensoes.t; })[0] || null;
      if (melhor && ai > 0) melhor.notas.push("Chapa em " + acos[ai].id + ": em " + ac0.id + " nenhum arranjo passa.");
    }
    if (!melhor) {
      if (!ultimo) return { ok: false, razao: Infinity, governante: "altura da viga", tipo: "chapaExt8", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "A viga (d = " + br(v.d, 0) + " mm) é baixa para 2 linhas de parafusos dentro de cada mesa.", sugestao: "Chapa estendida de 4 parafusos por mesa (4E) ou mísula." };
      ultimo.sugestao = "Mísula, viga mais alta ou ligação soldada com enrijecedores."; return comNaoVer(ultimo, e);
    }
    return comNaoVer(melhor, e);
    function avaliar(pf, tp, ac) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, fy = ac.fy, fu = ac.fu, vs = [], nv = [];
      var eP = Math.max(cima5(bordaMin(d, e.bordaChapa)), 26), pb = cima5(3 * d), pfo = Math.max(cima5(1.5 * d), eP), pfi = Math.max(35, d + 8), ext = pfo + pb + eP;
      var livre = v.d - 2 * v.tf - 2 * (pfi + pb); if (livre < pb - 1e-6) return null;
      var eMinC = c ? bordaMin(d, "laminada") : 0, gMin = Math.max(cima5(3 * d), cima5(v.tw + 20 + 2 * d), c ? cima5(c.tw + 2 * num(c.r, 0) + 2.2 * d) : 0), gMax = c ? Math.floor((c.bf - 2 * eMinC) / 5) * 5 : Infinity;
      var gage = Math.min(Math.max(gMin, cima5(0.6 * v.bf)), Math.max(gMin, gMax)), bp = Math.max(v.bf, gage + 2 * cima5(bordaMin(d, e.bordaChapa)));
      var h1 = v.d - v.tf / 2 + pfo + pb, h2 = v.d - v.tf / 2 + pfo, h3 = v.d - 1.5 * v.tf - pfi, h4 = h3 - pb, Sh = h1 + h2 + h3 + h4;
      var ftr = FtRd(d, e.fub), fvr = FvRd(d, e.fub), Ft = 0, Vc = 0, it2 = 0, Ff = 0, Vmax = 0, Mmax = 0, cg = {};
      e.esf.forEach(function (s) {
        var M = Math.abs(num(s.M, 0)), V = Math.abs(num(s.V, 0)), N = num(s.N, 0), f = M * 1000 / (2 * Sh) + Math.max(0, N) / 16, vc = V / 8, i2 = sq(f / ftr) + sq(V / 8 / fvr);
        if (f > Ft) { Ft = f; cg.T = s.comb; } if (vc > Vc) { Vc = vc; cg.V = s.comb; } if (i2 > it2) { it2 = i2; cg.i = s.comb; }
        Ff = Math.max(Ff, M * 1000 / (v.d - v.tf) + Math.max(0, N) / 2); Vmax = Math.max(Vmax, V); Mmax = Math.max(Mmax, M);
      });
      vs.push(verif("Parafusos à tração (8 junto da mesa tracionada: 4 linhas de 2, " + pf.id + " " + e.classe + ")", ED08 + ", 6.3.3.1; distribuição plástica M = 2·Ft·(h1 + h2 + h3 + h4) — AISC Design Guide 4 (2ª ed.) e AISC 358-16, 6.8 (chapa espessa, sem alavanca)",
        [passo("Braços (do centro da mesa comprimida)", "h1 = d − tf/2 + pfo + pb; h2 = d − tf/2 + pfo; h3 = d − 1,5·tf − pfi; h4 = h3 − pb", br(h1, 0) + "; " + br(h2, 0) + "; " + br(h3, 0) + "; " + br(h4, 0) + " mm", "pfo = " + pfo + "; pfi = " + pfi + "; pb = " + pb + " mm"),
         passo("Ft,Sd por parafuso", "M/(2·Σh) + N/16", br(Ft, 1) + " kN", comb(cg.T)), passo("Ft,Rd", "0,75·Ab·fub/γa2", br(ftr, 1) + " kN")], ftr, Ft));
      vs.push(verif("Parafusos ao cisalhamento (os 8 da mesa comprimida)", ED24 + ", 6.3.3.2 (Fv,Rd = 0,45·Ab·fub/γa2) — a cortante só nos parafusos do lado comprimido (AISC Design Guide 4; a favor)", [passo("Fv,Sd", "V/8", br(Vc, 1) + " kN", comb(cg.V)), passo("Fv,Rd", "", br(fvr, 1) + " kN")], fvr, Vc));
      vs.push(verif("Tração + cisalhamento nos parafusos tracionados", ED08 + ", 6.3.3.4 (com Fv = V/8 em cada parafuso tracionado: a cortante que o lado comprimido levaria — a favor, e vale para o momento nos dois sentidos)", [passo("(Ft/FtRd)² + (Fv/FvRd)²", "Fv = V/8", br(it2, 3), comb(cg.i))], 1, it2, ""));
      var FcP = Fc(d, tp, fu, eP - dh / 2), FcM = Fc(d, tp, fu, pb - dh), FcC = c ? Fc(d, c.tf, e.fuA, Infinity) : FcP, FcR = Math.min(FcP, FcM, FcC);
      vs.push(verif("Pressão de contato (chapa t = " + br(tp, 1) + " mm" + (c ? "; mesa do pilar tf = " + br(c.tf, 1) + " mm" : "") + ")", ED08 + ", 6.3.3.3",
        [passo("Chapa: furo da ponta", "1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2, lf = eP − dh/2", br(FcP, 1) + " kN"), passo("Chapa: entre furos", "lf = pb − dh", br(FcM, 1) + " kN"), passo("Mesa do pilar", "2,4·db·tf·fu/γa2", br(FcC, 1) + " kN"), passo("Fv,Sd", "V/8", br(Vc, 1) + " kN")], FcR, Vc));
      var rsg = LC().rasgamento({ t: tp, fy: fy, fu: fu, lv: 2 * (eP + pb), furosV: 3, lt: Math.min(gage, bp - gage), furosT: 1, dh: dh2, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da extensão comprimida (4 parafusos)", ED08 + ", 6.5.6", [passo("Áreas", "Agv = 2·(eP + pb)·t; Ant = (mín(g; bp − g) − dh)·t", "Agv " + br(rsg.Agv, 0) + "; Anv " + br(rsg.Anv, 0) + "; Ant " + br(rsg.Ant, 0) + " mm²"), passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rsg.Rd, 1) + " kN"), passo("Força nos 4", "4·V/8", br(4 * Vc, 1) + " kN")], rsg.Rd, 4 * Vc));
      if (c) vs.push(vBorda("furos na mesa do pilar", (c.bf - gage) / 2, d, "laminada"));
      vs.push(vBorda("furos da chapa (lateral)", (bp - gage) / 2, d, e.bordaChapa));
      vs.push(vBorda("furos da chapa (ponta da extensão)", eP, d, e.bordaChapa));
      var w = (bp - v.tw) / 2, MRd = tp * tp * fy / 4 / g.a1, bo1 = pfo - d / 2, bo2 = pfo + pb - d / 2, bi1 = pfi - d / 2, bi2 = pfi + pb - d / 2;
      var MsE = Ft * 1000 * (bo1 + bo2) / w, MsI = Ft * 1000 * (bi1 + bi2) / w;
      vs.push(verif("Chapa à flexão na extensão (as 2 linhas de fora da mesa)", REF_SEMALAV + "; a raiz da mesa leva o momento das duas linhas; a nervura não é contada (a favor); a " + ED24 + " mudou o método da chapa (conferir)",
        [passo("Braços", "b' = pfo − db/2; pfo + pb − db/2", br(bo1, 0) + "; " + br(bo2, 0) + " mm"), passo("Largura por parafuso", "p = (bp − tw)/2", br(w, 0) + " mm"), passo("Momento por mm na raiz", "Ft·(b'1 + b'2)/p", br(MsE / 1000, 2) + " kN·m/m"), passo("Resistente por mm", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, MsE / 1000, "kN·m/m"));
      vs.push(verif("Chapa à flexão dentro da mesa (as 2 linhas de dentro)", REF_SEMALAV + "; sem contar o apoio da alma (a favor)",
        [passo("Braços", "b' = pfi − db/2; pfi + pb − db/2", br(bi1, 0) + "; " + br(bi2, 0) + " mm"), passo("Momento por mm na raiz", "Ft·(b'1 + b'2)/p", br(MsI / 1000, 2) + " kN·m/m"), passo("Resistente por mm", "t²·fy/(4·γa1)", br(MRd / 1000, 2) + " kN·m/m")], MRd / 1000, MsI / 1000, "kN·m/m"));
      var nvr = nervura(ext, v.tw, e.fyV, fy); vs.push(nvr.v);
      var FmRd = v.bf * v.tf * Math.min(fy, e.fyV) / g.a1 / 1000;
      vs.push(verif("Solda das mesas na chapa (penetração total)", ED08 + ", 6.2.5 e Tabela 8 (metal-base)", [passo("Força na mesa", "M/(d − tf) + N/2", br(Ff, 1) + " kN"), passo("Resistente", "bf·tf·fy/γa1", br(FmRd, 1) + " kN")], FmRd, Ff));
      var aA = Math.max(pernaMin(Math.max(tp, v.tw)), 5), FwA = LC().soldaFilete(aA, 2 * (v.d - 2 * v.tf), e.fw, Math.min(fy, e.fyV));
      vs.push(verif("Solda da alma da viga na chapa (filete " + aA + " mm nos dois lados)", ED08 + ", 6.2.5", [passo("Resistente", "2·mín(0,60·0,707·a·L·fw/γw2; 0,60·a·L·fy/γa1)", br(FwA, 1) + " kN")], FwA, Vmax));
      var refs = [], enr = null, pr = null;
      if (c && e.face === "mesa") {
        var aF = Math.max(pernaMin(Math.max(tp, v.tf)), 6), pl = pilarLocal(c, Ff, opPilar(e, v, { perto: topo, ln: v.tf + 2 * aF + 2 * tp }));
        vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
        vs = vs.concat(tstubPilar(c, [v.d / 2 - v.tf - pfi - pb, v.d / 2 - v.tf - pfi, v.d / 2 + pfo, v.d / 2 + pfo + pb], gage, ftr, Ft, e.fyA, topo, eP, "4 linhas junto da mesa tracionada", { d: d, tChapa: tp, eChapa: (bp - gage) / 2, cortes: enr ? [v.d / 2 - v.tf / 2] : [] }));
        var pn = painel(c, Mmax * 1000 / (v.d - v.tf), e.fyA, opPainel(e)); vs = vs.concat(pn.vs); nv = nv.concat(pn.nv); pr = pn.reforco; if (pr) refs.push(pr.texto);
      }
      var fe = fecha(vs), zs = [v.d / 2 + pfo + pb, v.d / 2 + pfo, v.d / 2 - v.tf - pfi, v.d / 2 - v.tf - pfi - pb];
      zs = zs.concat(zs.map(function (z) { return -z; }));
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "chapaExt8",
        dimensoes: { t: tp, largura: bp, altura: v.d + 2 * ext, aco: ac.id, parafuso: pf.id, d: d, classe: e.classe, n: 16, nTracao: 8, gage: gage, ext: ext, borda: eP, pfo: pfo, pfi: pfi, pb: pb,
                     nervura: { h: nvr.h, L: nvr.L, t: nvr.t }, soldaMesa: "penetração total", soldaAlma: aA, enrijecedores: enr, reforcoAlma: pr },
        desenho: { t: tp / 1000, parafuso: pf.id, classe: /8\.8/.test(e.classe) ? "8.8" : "A325", ext: ext / 1000, gage: gage / 1000, largura: bp / 1000, zs: zs.map(function (z) { return z / 1000; }), nervura: { h: nvr.h / 1000, L: nvr.L / 1000, t: nvr.t / 1000, ambas: true }, nTotal: 16, enrijecedores: enr ? { t: enr.t / 1000 } : null },
        resumo: "Chapa estendida 8 parafusos por mesa " + br(bp, 0) + " × " + br(v.d + 2 * ext, 0) + " × " + br(tp, 1) + " mm (" + ac.id + "), 16 parafusos " + pf.id + " " + e.classe + " (4 linhas de 2 junto de cada mesa, gage " + gage + " mm); nervuras " + br(nvr.h, 0) + " × " + nvr.L + " × " + br(nvr.t, 1) + " mm; mesas em penetração total" + (refs.length ? "; " + refs.join("; ") : ""),
        verificacoes: vs, reforcos: refs, notas: ["8ES: as nervuras da extensão vão no plano da alma, soldadas na mesa e na chapa (penetração total). Momento nos dois sentidos (a chapa é simétrica)."],
        naoVerificado: nv.concat(["Rigidez da ligação: tratada como rígida (classificação não calculada)."]) };
    }
  }
  /* CHAPA ESTENDIDA DE 4 PARAFUSOS COM NERVURA (4ES): o dimensionamento da 4E (o motor existente) + a nervura de detalhe — a
     nervura não é contada a favor da chapa (a favor). */
  function chapaExt4ES(p) {
    var e = ent(p), r = chapaExtendida(p), d = r.dimensoes || {};
    var nvr = nervura(num(d.ext, 0), num(e.viga.tw, 6), e.fyV, Math.max(num(e.fy, 250), d.aco === "ASTM A572 Gr.50" ? 345 : 0));
    r.verificacoes = arr(r.verificacoes).concat([nvr.v]); var fe = fecha(r.verificacoes); r.ok = fe.ok; r.razao = fe.razao; r.governante = fe.governante;
    r.tipo = "chapaExt4ES"; d.nervura = { h: nvr.h, L: nvr.L, t: nvr.t };
    r.desenho = r.desenho || {}; r.desenho.nervura = { h: nvr.h / 1000, L: nvr.L / 1000, t: nvr.t / 1000, ambas: true };
    r.resumo = String(r.resumo || "").replace(/^Joelho/, "Chapa estendida 4 parafusos por mesa com nervura") + "; nervuras " + br(nvr.h, 0) + " × " + nvr.L + " × " + br(nvr.t, 1) + " mm";
    r.notas = arr(r.notas).concat(["4ES: a nervura reduz a deformação da extensão; o cálculo da chapa NÃO a conta (a favor)."]);
    return r;
  }

  /* ================================================================ CANTONEIRAS DE TOPO E DE ASSENTO — SEMIRRÍGIDA
   * A de topo leva a tração do binário (T = M/z), a de assento leva a compressão e a cortante. Braço z do centro da compressão
   * (meia espessura da aba de assento) à linha tracionada (parafusos da aba vertical da de topo) — EN 1993-1-8:2005, 6.2.7 e
   * Figura 6.15. Aba vertical da de topo: T-stub com leff = 0,5·ba (6.2.6.6); m = gv − ta/2 (o maior dos dois casos da Figura
   * 6.13 — a favor). Mesa do pilar: T-stub da Tabela 6.4 (linha isolada, sem enrijecedor). Assento: a verificação do assento
   * (cortante) com a mesma cantoneira. Rigidez: não calculada (o cálculo trata o nó como rígido — declarado). */
  var ANG_TOPO = ["L127X127X12.7", "L152X152X12.7", "L152X152X15.9", "L152X152X19", "L203X203X19", "L203X203X25.4"];
  function angulo(cat) { var P = dep("PerfisAco", "./perfisaco.js"), a = P && P.paraPerfil ? P.paraPerfil(cat) : null; return a && a.forma === "L" ? { cat: cat, a: a.a * 1000, b: a.b * 1000, t: a.t * 1000, r: num(a.r, 0) * 1000 } : null; }
  function cantTopoAssento(p) {
    var e = ent(p), g = gamas(), v = e.viga, c = e.apoio && e.apoio.d && e.apoio.bf ? e.apoio : null, topo = !!p.topoPilar, melhor = null, ultimo = null;
    if (!(num(v.d, 0) > 0 && num(v.bf, 0) > 0)) return { ok: false, razao: Infinity, governante: "viga sem perfil I", tipo: "cantTopoAssento", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Cantoneiras de topo e assento: viga de perfil I." };
    var ANGc = e.forcar.cat ? [e.forcar.cat] : ANG_TOPO, PFt = pfLista(PFs(), e), NHt = e.forcar.linhas > 0 ? [num(e.forcar.linhas, 1)] : [1, 2, 3];
    for (var ia = 0; ia < ANGc.length && !melhor; ia++) {
      var ang = angulo(ANGc[ia]); if (!ang) continue;
      for (var ip = 0; ip < PFt.length && !melhor; ip++) for (var ih = 0; ih < NHt.length && !melhor; ih++) for (var il = 0; il < 2 && !melhor; il++) { var nh = NHt[ih], r = avaliar(ang, PFt[ip], nh, il); if (!r) continue; ultimo = r; if (r.ok) melhor = r; }
    }
    var out = melhor || ultimo;
    if (!out) return { ok: false, razao: Infinity, governante: "geometria", tipo: "cantTopoAssento", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Nenhuma cantoneira do catálogo cabe na viga e no pilar.", sugestao: "Chapa de extremidade estendida." };
    if (!melhor) out.sugestao = "Cantoneira mais grossa, mais parafusos ou chapa de extremidade estendida.";
    if (e.face === "alma") out.bloqueante = arr(out.bloqueante).concat(["cantoneiras de topo e assento (semirrígida) na ALMA do pilar: a alma flete fora do plano — não verificado"]);
    var smT = semMesaPilar(e); if (smT) out.bloqueante = arr(out.bloqueante).concat([smT]);
    return out;
    /* il = 0: a cantoneira no comprimento da mesa da viga; il = 1: até a largura da mesa do pilar (leff = 0,5·ba cresce — EN 1993-1-8,
       Figura 6.13: ba pode diferir das duas mesas). Gabaritos separados: gxC no pilar (livra a alma e a raiz com a arruela), gx na viga. */
    function avaliar(an, pf, nh, il) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, s = cima5(3 * d), eL = bordaMin(d, "laminada"), eS = bordaMin(d, "serra"), ta = an.t, ra = an.r, vs = [], nv = [];
      var gv = cima5(ta + ra + 0.93 * d), gh = cima5(Math.max(FOLGA + eS, ta + ra + 0.93 * d)), eTopo = an.b - gv, eToe = an.a - gh - (nh - 1) * s;
      if (eTopo < eL - 1e-6 || eToe < eL - 1e-6) return null;
      var gMinV = Math.max(3 * d, num(v.tw, 6) + 2 * num(v.r, 0) + 1.85 * d), gx = cima5(gMinV), gxC = cima5(Math.max(3 * d, c ? c.tw + 2 * num(c.r, 0) + 1.85 * d : 0));
      if ((v.bf - gx) / 2 < eL && (v.bf - Math.ceil(gMinV)) / 2 >= eL) gx = Math.ceil(gMinV);   /* mesa estreita: o gabarito exato (a arruela livra a raiz da alma) */
      var La0 = cima10(Math.max(v.bf + 20, Math.max(gx, gxC) + 2 * eS)), LaM = c ? Math.floor(c.bf / 10) * 10 : La0;
      if (il === 1 && !(LaM > La0)) return null;
      var La = il === 1 ? LaM : La0;
      var ftr = FtRd(d, e.fub), fvr = FvRd(d, e.fub), z = v.d + gv + ta / 2, T = 0, C = 0, Vmax = 0, Mmax = 0, cg = {};
      e.esf.forEach(function (q) { var M = Math.abs(num(q.M, 0)), N = num(q.N, 0), t1 = M * 1000 / z + Math.max(0, N) / 2, c1 = M * 1000 / z + Math.max(0, -N) / 2; if (t1 > T) { T = t1; cg.T = q.comb; } if (c1 > C) C = c1; Vmax = Math.max(Vmax, Math.abs(num(q.V, 0))); Mmax = Math.max(Mmax, M); });
      /* tração: a aba vertical da de topo (T-stub, leff = 0,5·ba); o braço z (EN 1993-1-8:2005, 6.2.7 e Figura 6.15) */
      var tsA = tstub(0.5 * La, 0.5 * La, ta, e.fy, gv - ta / 2, eTopo, 2 * ftr, alongamento(d, ta + (c ? c.tf : ta), 1));
      vs.push(verif("Cantoneira de topo " + an.cat + " × " + La + " mm: aba vertical à flexão + parafusos tracionados (2 × " + pf.id + ")", REF_TSTUB + "; cantoneira de mesa: leff = 0,5·ba (EN 1993-1-8, 6.2.6.6); m = gv − ta/2 (a favor); braço z da 6.2.7 / Figura 6.15",
        [passo("Braço do binário", "z = d + gv + ta/2 (centro da compressão na meia espessura da aba de assento)", br(z, 0) + " mm", "gv = " + gv + " mm"), passo("Tração na de topo", "T = M/z + N/2", br(T, 1) + " kN", comb(cg.T)), passo("Compressão na de assento", "C = M/z + Nc/2", br(C, 1) + " kN")].concat(passosTstub(tsA, 0.5 * La, 0.5 * La, ta, "Aba vertical")), tsA.F, T));
      if (c && e.face === "mesa") {
        var mc = (gxC - c.tw) / 2 - 0.8 * num(c.r, 0), ec = (c.bf - gxC) / 2, e1 = eL, cp = topo ? Math.min(2 * Math.PI * mc, Math.PI * mc + 2 * e1) : 2 * Math.PI * mc, nc = topo ? Math.min(4 * mc + 1.25 * ec, 2 * mc + 0.625 * ec + e1) : 4 * mc + 1.25 * ec;
        var tsC = tstub(Math.min(cp, nc), nc, c.tf, e.fyA, mc, Math.min(ec, (La - gxC) / 2), 2 * ftr, alongamento(d, c.tf + ta, 1));   /* emin: a borda da cantoneira também (Fig. 6.8) */
        vs.push(verif("Mesa do pilar à flexão sob os parafusos da de topo", "EN 1993-1-8:2005, Tabela 6.4 (mesa do pilar sem enrijecedor, linha isolada" + (topo ? ", linha de ponta com e1 = " + br(e1, 0) + " mm até o topo — a favor" : "") + "); " + REF_TSTUB, passosTstub(tsC, Math.min(cp, nc), nc, c.tf, "Mesa do pilar"), tsC.F, T));
        vs.push(vBorda("furos na mesa do pilar", ec, d, "laminada"));
      }
      vs.push(verif("Parafusos na mesa da viga (de topo: " + 2 * nh + " × " + pf.id + ", 1 plano)", ED24 + ", 6.3.3.2", [passo("Por parafuso", "T/" + 2 * nh, br(T / (2 * nh), 1) + " kN"), passo("Fv,Rd", "0,45·Ab·fub/γa2", br(fvr, 1) + " kN")], fvr, T / (2 * nh)));
      var bA = sumBearing(nh, d, ta, e.fu, eToe, s, false), bV = sumBearing(nh, d, v.tf, e.fuV, gh - FOLGA, s, false);
      vs.push(verif("Pressão de contato (aba da de topo t = " + br(ta, 1) + " mm e mesa da viga tf = " + br(v.tf, 1) + " mm)", ED08 + ", 6.3.3.3", [passo("Aba: 2 colunas (borda da ponta da aba)", "Σ 1,2·lf·t·fu/γa2 ≤ 2,4·db·t·fu/γa2", br(2 * bA.total, 1) + " kN"), passo("Mesa da viga: 2 colunas (borda da ponta da viga)", "", br(2 * bV.total, 1) + " kN")], Math.min(2 * bA.total, 2 * bV.total), T));
      var rsV = LC().rasgamento({ t: v.tf, fy: e.fyV, fu: e.fuV, lv: 2 * ((nh - 1) * s + gh - FOLGA), furosV: 2 * (nh - 0.5), lt: v.bf - gx, furosT: 1, dh: dh2, Cts: 1 });
      vs.push(verif("Colapso por rasgamento da mesa da viga", ED08 + ", 6.5.6", [passo("Fr,Rd", "(0,60·fu·Anv + fu·Ant)/γa2 ≤ (0,60·fy·Agv + fu·Ant)/γa2", br(rsV.Rd, 1) + " kN")], rsV.Rd, T));
      var rsA = Math.min(LC().rasgamento({ t: ta, fy: e.fy, fu: e.fu, lv: 2 * ((nh - 1) * s + eToe), furosV: 2 * (nh - 0.5), lt: La - gx, furosT: 1, dh: dh2, Cts: 1 }).Rd, LC().rasgamento({ t: ta, fy: e.fy, fu: e.fu, lv: 2 * ((nh - 1) * s + eToe), furosV: 2 * (nh - 0.5), lt: gx, furosT: 1, dh: dh2, Cts: 1 }).Rd);
      vs.push(verif("Colapso por rasgamento da aba horizontal da de topo", ED08 + ", 6.5.6 (blocos de fora ou entre as colunas — o menor)", [passo("Fr,Rd", "", br(rsA, 1) + " kN")], rsA, T));
      var TaRd = Math.min(La * ta * e.fy / g.a1, (La - 2 * dh2) * ta * e.fu / g.a2) / 1000, TfRd = Math.min(v.bf * v.tf * e.fyV / g.a1, (v.bf - 2 * dh2) * v.tf * e.fuV / g.a2) / 1000;
      vs.push(verif("Aba horizontal da de topo à tração", ED08 + ", 5.2 e 6.5.3 (área bruta e líquida)", [passo("Resistente", "mín(ba·t·fy/γa1; (ba − 2·dh)·t·fu/γa2)", br(TaRd, 1) + " kN")], TaRd, T));
      vs.push(verif("Mesa da viga na seção dos furos (tração da de topo)", ED08 + ", 5.2 e 6.5.3", [passo("Resistente", "mín(bf·tf·fy/γa1; (bf − 2·dh)·tf·fu/γa2)", br(TfRd, 1) + " kN")], TfRd, T));
      vs.push(vBorda("aba vertical da de topo (borda de cima)", eTopo, d, "laminada"));
      vs.push(vBorda("ponta da aba horizontal", eToe, d, "laminada"));
      vs.push(vBorda("pontas da cantoneira (serradas)", (La - Math.max(gx, gxC)) / 2, d, "serra"));
      vs.push(vBorda("ponta da viga (serrada)", gh - FOLGA, d, "serra"));
      vs.push(vBorda("furos na mesa da viga", (v.bf - gx) / 2, d, "laminada"));
      /* compressão: parafusos da aba horizontal do assento, mesa comprimida da viga */
      var bC = sumBearing(nh, d, ta, e.fu, gh - ta - ra, s, false), bCv = sumBearing(nh, d, v.tf, e.fuV, 0, s, true);
      vs.push(verif("Parafusos na mesa de baixo (assento: " + 2 * nh + " × " + pf.id + ") sob a compressão", ED24 + ", 6.3.3.2 e " + ED08 + ", 6.3.3.3", [passo("Por parafuso", "C/" + 2 * nh, br(C / (2 * nh), 1) + " kN"), passo("Fv,Rd", "", br(fvr, 1) + " kN"), passo("Pressão de contato: aba / mesa", "a borda é a aba vertical (a favor)", br(2 * bC.total, 1) + " / " + br(2 * bCv.total, 1) + " kN")], Math.min(fvr, 2 * bC.total / (2 * nh), 2 * bCv.total / (2 * nh)), C / (2 * nh)));
      var FcfRd = v.bf * v.tf * e.fyV / g.a1 / 1000;
      vs.push(verif("Mesa comprimida da viga", "EN 1993-1-8:2005, 6.2.6.7 (mesa da viga à compressão) — bf·tf·fy/γa1", [passo("Resistente", "bf·tf·fy/γa1", br(FcfRd, 1) + " kN")], FcfRd, C));
      /* a cortante no assento (a mesma cantoneira e os mesmos parafusos) */
      var sa = cantoneiraAssento(p, { catFixo: { cat: an.cat, a: an.a, t: an.t }, La: La, pf: pf, gx: gxC });
      arr(sa.verificacoes).forEach(function (x) { x.nome = "Assento (cortante): " + x.nome; vs.push(x); });
      var nbA = num(sa.dimensoes && sa.dimensoes.n, 2);
      /* MOMENTO INVERTIDO (o cálculo dá |M|: vento e afins invertem): a de ASSENTO fica tracionada e os parafusos dela no pilar levam a
         cortante junto — o T-stub da aba e da mesa do pilar com o Ft,Rd reduzido pela interação (NBR 8800, 6.3.3.4:
         Ft,Rd,red = Ft,Rd·√(1 − (Fv/Fv,Rd)²)) */
      var FvA = Vmax / nbA, red = Math.sqrt(Math.max(0, 1 - sq(FvA / fvr))), tsS = tstub(0.5 * La, 0.5 * La, ta, e.fy, gv - ta / 2, eTopo, 2 * ftr * red, alongamento(d, ta + (c ? c.tf : ta), 1));
      vs.push(verif("Momento invertido: a de assento tracionada com a cortante (aba vertical + parafusos no pilar)", REF_TSTUB + "; Ft,Rd reduzido pela interação tração + cisalhamento (" + ED08 + ", 6.3.3.4)",
        [passo("Cortante por parafuso do assento", "V/" + nbA, br(FvA, 1) + " kN", "Fv,Rd = " + br(fvr, 1) + " kN"), passo("Ft,Rd reduzido", "Ft,Rd·√(1 − (Fv/Fv,Rd)²)", br(ftr * red, 1) + " kN")].concat(passosTstub(tsS, 0.5 * La, 0.5 * La, ta, "Aba vertical do assento")), tsS.F, T));
      if (c && e.face === "mesa") {
        var tsS2 = tstub(Math.min(cp, nc), nc, c.tf, e.fyA, mc, Math.min(ec, (La - gxC) / 2), 2 * ftr * red, alongamento(d, c.tf + ta, 1));
        vs.push(verif("Momento invertido: a mesa do pilar sob os parafusos do assento (com a cortante)", "EN 1993-1-8:2005, Tabela 6.4; Ft,Rd reduzido pela interação (" + ED08 + ", 6.3.3.4)", passosTstub(tsS2, Math.min(cp, nc), nc, c.tf, "Mesa do pilar"), tsS2.F, T));
      }
      nv = nv.concat(arr(sa.naoVerificado));
      var refs = [], enr = null, pr = null;
      if (c && e.face === "mesa") {
        var pl = pilarLocal(c, Math.max(T, C), opPilar(e, { bf: La, tf: ta }, { perto: topo, ln: ta }));
        vs = vs.concat(pl.vs); enr = pl.enrij; if (enr) refs.push("Enrijecedores de continuidade: " + enr.texto);
        var pn = painel(c, Math.max(T, C), e.fyA, opPainel(e)); vs = vs.concat(pn.vs); nv = nv.concat(pn.nv); pr = pn.reforco; if (pr) refs.push(pr.texto);
      }
      var fe = fecha(vs);
      return { ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "cantTopoAssento",
        dimensoes: { cat: an.cat, comprimento: La, parafuso: pf.id, classe: e.classe, linhasViga: nh, gv: gv, gh: gh, gx: gx, gxPilar: gxC, z: z, ext: Math.ceil(an.b), nAssentoPilar: nbA, nTotal: nbA + 2 + 4 * nh, enrijecedores: enr, reforcoAlma: pr },
        desenho: { cat: an.cat, catTopo: an.cat, comprimento: La / 1000, parafuso: pf.id, parafusos: nbA, linhasViga: nh, gx: gx / 1000, gxPilar: gxC / 1000, gh: gh / 1000, gv: gv / 1000, passoViga: s / 1000, nTotal: nbA + 2 + 4 * nh, enrijecedores: enr ? { t: enr.t / 1000 } : null },
        resumo: "Cantoneiras de topo e assento " + an.cat + " × " + La + " mm (semirrígida): " + 2 * nh + " parafusos " + pf.id + " " + e.classe + " em cada mesa da viga e 2 no pilar em cada cantoneira (braço z = " + br(z, 0) + " mm)" + (refs.length ? "; " + refs.join("; ") : ""),
        verificacoes: vs, reforcos: refs,
        notas: ["Semirrígida: a cantoneira de topo transmite o momento M = T·z; a de assento leva a cortante e a compressão.", "A cantoneira de topo sobe " + Math.ceil(an.b) + " mm acima da viga: no topo do pilar, o pilar tem de continuar acima da viga."],
        naoVerificado: nv.concat(["Rigidez rotacional da ligação semirrígida: NÃO calculada — o cálculo da estrutura trata o nó como RÍGIDO (o momento aqui é o desse cálculo); a viga deve ser conferida também como biapoiada (a envoltória rígido/rotulado não é feita)."]) };
    }
  }

  /* ================================================================ PILAR TUBULAR */
  function tuboDe(ap) {
    ap = ap || {};
    var f = String(ap.forma || ""), rhs = /ret/.test(f) || (num(ap.b, 0) > 0 && !/circ/.test(f));
    var D = num(ap.d, num(ap.D, 0)), b0 = num(ap.b, D), h0 = num(ap.h, num(ap.d, b0));
    /* M2 (revisão 15/10/2026): sem espessura adotada — antes t0 = 6 mm entrava quando o tubo vinha sem t (e um pilar I virava "tubo") */
    return { rhs: rhs, D: rhs ? null : D, b0: rhs ? b0 : D, h0: rhs ? h0 : D, t0: num(ap.t, num(ap.tdes, 0)), A: num(ap.A, 0), W: num(ap.Wx, 0) };
  }
  function ehTubo(ap) { var f = String((ap && ap.forma) || ""); return /tubo|circ/.test(f) || (!(num(ap && ap.bf, 0) > 0) && num(ap && ap.t, 0) > 0 && num(ap && ap.d, 0) > 0); }
  /* M2 (revisão 15/10/2026): o apoio das tipologias de tubo TEM de ser tubo com as dimensões e a espessura informadas — senão
     INCOMPLETO (bloqueado). O revisor achou: pilar W310×97 aprovado como "tubo" de 6 mm; tubo sem t aprovado com 6 mm. */
  function tuboIncompleto(ap, tb, nome, tipo) {
    var m = null;
    if (!ehTubo(ap)) m = "o apoio não é tubo (" + ((ap && (ap.nome || ap.forma)) || "sem perfil") + "): a " + nome + " é para pilar tubular — no pilar de perfil I use a chapa simples comum";
    else if (tb.rhs ? !(tb.b0 > 0 && tb.h0 > 0) : !(tb.D > 0)) m = "as dimensões do tubo (" + (tb.rhs ? "b e h" : "diâmetro") + ") não foram informadas";
    else if (!(tb.t0 > 0)) m = "a espessura da parede do tubo (t) não foi informada";
    if (!m) return null;
    return { ok: false, razao: Infinity, governante: "INCOMPLETO: " + m, tipo: tipo, verificacoes: [], naoVerificado: [], notas: [], reforcos: [], bloqueante: ["INCOMPLETO: " + m], resumo: "INCOMPLETO — " + m + "." };
  }
  /* faixa de validade da parede (EN 1993-1-8:2005): tubo circular 10 ≤ d0/t0 ≤ 50 (Tabela 7.1); retangular b0/t0 ≤ 35 e
     h0/t0 ≤ 35 (Tabela 7.8). Fora dela as fórmulas da parede não valem → bloqueado. */
  function validadeParede(tb) {
    var b = [];
    if (!tb.rhs) { var r = tb.D / tb.t0; if (r > 50 || r < 10) b.push("tubo circular com d0/t0 = " + br(r, 1) + " fora da faixa 10 ≤ d0/t0 ≤ 50 da EN 1993-1-8:2005, Tabela 7.1 — a parede não está verificada"); }
    else { var rb = tb.b0 / tb.t0, rh = tb.h0 / tb.t0; if (rb > 35 || rh > 35) b.push("tubo retangular com b0/t0 = " + br(rb, 1) + " e h0/t0 = " + br(rh, 1) + " (limite 35 da EN 1993-1-8:2005, Tabela 7.8): parede esbelta, fora da faixa de validade — não verificada"); }
    return b;
  }
  /* a chapa simples no tubo e a passante são FLEXÍVEIS: momento DO CÁLCULO na ponta da viga não tem caminho verificado (a
     ESTIMATIVA sem cálculo põe um M para as rígidas — numa flexível ele não existe, como na chapa simples comum) */
  function momentoNaFlexivel(e, nome) { return e.M > 1 && !e.estimativa ? ["momento na ponta da viga (M = " + br(e.M, 1) + " kN·m do cálculo): a " + nome + " é ligação FLEXÍVEL — o momento não tem caminho verificado (recalcule com a viga rotulada ou use ligação de momento)"] : []; }
  /* a tensão no pilar tubular (para o kp do EN 1993-1-8): do cálculo (N e M do pilar) ou np = 0,6 adotado (a favor) */
  function npTubo(e, tb) {
    if (e.NcPilar != null && tb.A > 0) { var sg = e.NcPilar * 1000 / tb.A + (e.MPilar != null && tb.W > 0 ? e.MPilar * 1e6 / tb.W : 0); return { np: sg / e.fyA, txt: "do cálculo: σ0 = N/A" + (e.MPilar != null && tb.W > 0 ? " + M/W" : " (sem o momento do pilar)") + " = " + br(sg, 1) + " MPa" }; }
    return { np: 0.6, txt: "sem a força do pilar (sem cálculo): np = 0,6 adotado (a favor)", adotado: true };
  }
  /* CHAPA SIMPLES SOLDADA NO TUBO: a chapa simples (parafusos, chapa, solda — com a força axial da viga) + a PAREDE do tubo circular
     (EN 1993-1-8:2005, Tabela 7.2 — chapa longitudinal: N1,Rd pela força axial e Mip,1,Rd = h1·N1,Rd pelo momento no plano, com a
     interação de 7.4.2 (2) na forma linear (a favor); punção com σmáx·t1 = N/h1 + 6·M/h1²; a mesma forma da AISC 360-16, Tabela
     K1.1) + o cisalhamento da parede junto à solda. Tubo RETANGULAR: a parede sob o momento da chapa não tem fórmula no motor →
     BLOQUEADO (use a chapa passante). M2 (revisão 15/10/2026): antes a força axial N da viga era ignorada (HSS219,1×8,2 com
     N = +150 e V = 60 passava 0,849; a parede sozinha dá 150/79,6 = 1,88). */
  function chapaSimplesTubo(p) {
    var e = ent(p), g = gamas(), ap = e.apoio || {}, tb = tuboDe(ap), t0 = tb.t0, fy0 = e.fyA, fu0 = e.fuA, blq = [], nv = [], npi = npTubo(e, tb), Nax = Math.max(e.Nt, e.Nc);
    var inc = tuboIncompleto(ap, tb, "chapa simples no tubo", "chapaSimplesTubo"); if (inc) return inc;
    var kp = npi.np > 0 ? Math.max(0, 1 - 0.3 * npi.np * (1 + npi.np)) : 1;
    if (tb.rhs) blq.push("chapa simples em pilar tubular RETANGULAR: a plastificação da parede sob o momento da chapa (M = V·a) não está verificada — use a chapa passante");
    blq = blq.concat(validadeParede(tb), momentoNaFlexivel(e, "chapa simples no tubo"));
    function extra(r) {
      var dm = r.dimensoes || {}, h1 = num(dm.altura, 0), a = num(dm.a, 75), V = e.V, M = V * a, vs2 = [];   /* M em kN·mm */
      if (!tb.rhs) {
        var eta = h1 / tb.D, N1 = 5 * kp * fy0 * t0 * t0 * (1 + 0.25 * eta) / g.a1 / 1000, Mip = h1 * N1 / 1000, iW = Nax / N1 + (M / 1000) / Mip;
        vs2.push(verif("Parede do tubo: plastificação pela chapa (força axial N e momento no plano M = V·a)", "EN 1993-1-8:2005, Tabela 7.2 (chapa longitudinal: N1,Rd = 5·kp·fy0·t0²·(1 + 0,25·η)/γ; Mip,1,Rd = h1·N1,Rd) e 7.4.2 (2) (interação N/N1,Rd + (M/Mip,Rd)² ≤ 1 — aqui na forma linear, a favor) — a mesma forma da AISC 360-16, Tabela K1.1; " + ED16239 + "; γa1 no lugar do γM5 (a favor)",
          [passo("η = h1/d0", br(h1, 0) + "/" + br(tb.D, 1), br(eta, 3)), passo("np e kp", "kp = 1 − 0,3·np·(1 + np)", br(npi.np, 3) + "; " + br(kp, 3), npi.txt), passo("N1,Rd", "5·kp·fy0·t0²·(1 + 0,25·η)/γa1", br(N1, 1) + " kN", "t0 = " + br(t0, 2) + " mm"),
           passo("Mip,1,Rd", "h1·N1,Rd", br(Mip, 2) + " kN·m"), passo("Força axial da viga", "|N| (tração ou compressão)", br(Nax, 1) + " kN"), passo("Momento", "V·a", br(M / 1000, 2) + " kN·m", comb(e.combV)), passo("Interação", "N/N1,Rd + M/Mip,1,Rd ≤ 1 ⇔ M + N·h1 ≤ Mip,1,Rd (Mip,1,Rd/N1,Rd = h1)", br(iW, 3)), passo("Momento equivalente", "M + N·h1", br(M / 1000 + Nax * h1 / 1000, 2) + " kN·m")], Mip, M / 1000 + Nax * h1 / 1000, "kN·m"));
      }
      var sN = Nax * 1000 / h1, sM = 6 * M * 1000 / (h1 * h1), sP = sN + sM, RP = 2 * t0 * fy0 / Math.sqrt(3) / g.a1;
      vs2.push(verif("Parede do tubo: punção pela chapa", "EN 1993-1-8:2005, Tabela " + (tb.rhs ? "7.13" : "7.2") + " (σmáx·t1 = (N/A + M/Wel)·t1 = N/h1 + 6·M/h1² ≤ 2·t0·(fy0/√3)/γ; γa1 no lugar do γM5)", [passo("N/h1", br(Nax, 1) + " kN / " + br(h1, 0) + " mm", br(sN, 0) + " N/mm"), passo("6·M/h1²", "", br(sM, 0) + " N/mm"), passo("σmáx·t1", "N/h1 + 6·M/h1²", br(sP, 0) + " N/mm"), passo("Resistente", "2·t0·fy0/(√3·γa1)", br(RP, 0) + " N/mm")], RP, sP, "N/mm"));
      var Vw = Math.min(2 * h1 * t0 * 0.6 * fy0 / g.a1, 2 * h1 * t0 * 0.6 * fu0 / g.a2) / 1000;
      vs2.push(verif("Parede do tubo ao cisalhamento junto à solda (2 planos de " + br(h1, 0) + " mm)", ED08 + ", 6.5.5 (0,60·fy·Agv/γa1 e 0,60·fu·Anv/γa2)", [passo("Resistente", "mín(2·h1·t0·0,60·fy/γa1; 2·h1·t0·0,60·fu/γa2)", br(Vw, 1) + " kN")], Vw, V));
      r.verificacoes = r.verificacoes.concat(vs2); var fe = fecha(r.verificacoes); r.ok = fe.ok; r.razao = fe.razao; r.governante = fe.governante;
    }
    var r = chapaSimples(p, { apoioT: t0, extra: extra, semEncaixe: true, axial: { Nt: e.Nt, Nc: e.Nc } }), h1f = num(r.dimensoes && r.dimensoes.altura, 0);
    if (!tb.rhs && h1f / tb.D > 4) blq.push("chapa com η = h1/d0 = " + br(h1f / tb.D, 2) + " > 4: fora da validade da EN 1993-1-8, Tabela 7.2");
    if (npi.adotado) nv.push("Tensão no pilar tubular não informada (sem cálculo): np = 0,6 adotado no kp (a favor).");
    r.tipo = "chapaSimplesTubo"; r.bloqueante = arr(r.bloqueante).concat(blq); r.naoVerificado = arr(r.naoVerificado).concat(nv);
    r.resumo = String(r.resumo || "").replace("soldada no apoio", "soldada no tubo " + (tb.rhs ? "retangular" : "Ø " + br(tb.D, 1) + " × " + br(t0, 2) + " mm"));
    r.notas = arr(r.notas).concat(["Solda da chapa no tubo em todo o comprimento, dos dois lados (filete)."]);
    return r;
  }
  /* CHAPA PASSANTE: atravessa o tubo (rasgo nas duas paredes) e é soldada nas duas — a parede recebe só forças ao longo da solda
     (equilíbrio da chapa apoiada nas duas paredes); vale para tubo circular e retangular. Dw = a menor dimensão − t0 (a favor).
     M2 (revisão 15/10/2026): só com o apoio TUBO com t informado, a parede na faixa de validade e sem força axial nem momento na
     viga (a parede empurrada/puxada pela chapa nas duas paredes não está no motor) — senão bloqueada. */
  function chapaPassante(p) {
    var e = ent(p), g = gamas(), ap = e.apoio || {}, tb = tuboDe(ap), t0 = tb.t0, fy0 = e.fyA, fu0 = e.fuA, Dw = (tb.rhs ? Math.min(tb.b0, tb.h0) : tb.D) - t0;
    var inc = tuboIncompleto(ap, tb, "chapa passante", "chapaPassante"); if (inc) return inc;
    var blq = validadeParede(tb).concat(momentoNaFlexivel(e, "chapa passante")), Nax = Math.max(e.Nt, e.Nc);
    if (Nax > 1) blq.push("força axial na viga (|N| = " + br(Nax, 1) + " kN do cálculo): a parede do tubo sob a força axial levada pela chapa passante não está verificada no motor — use a chapa simples no tubo circular (verifica N) ou recalcule");
    function extra(r) {
      var dm = r.dimensoes || {}, h1 = num(dm.altura, 0), a = num(dm.a, 75), V = e.V, Rn = V * (a + Dw) / Dw;
      var Vw = Math.min(2 * h1 * t0 * 0.6 * fy0 / g.a1, 2 * h1 * t0 * 0.6 * fu0 / g.a2) / 1000;
      r.verificacoes.push(verif("Parede da frente do tubo ao cisalhamento junto à solda (2 planos de " + br(h1, 0) + " mm)", ED08 + ", 6.5.5 — a reação da chapa passante R = V·(a + Dw)/Dw", [passo("Reação", "V·(a + Dw)/Dw", br(Rn, 1) + " kN"), passo("Resistente", "mín(2·h1·t0·0,60·fy/γa1; 2·h1·t0·0,60·fu/γa2)", br(Vw, 1) + " kN")], Vw, Rn));
      var fe = fecha(r.verificacoes); r.ok = fe.ok; r.razao = fe.razao; r.governante = fe.governante;
    }
    var r = chapaSimples(p, { apoioT: t0, extra: extra, passante: { Dw: Dw }, semEncaixe: true });
    r.bloqueante = arr(r.bloqueante).concat(blq);
    r.tipo = "chapaPassante";
    var dm = r.dimensoes || {}; dm.passante = { Dw: Dw, comprimento: num(dm.largura, 0) + Dw + t0 };
    r.desenho = r.desenho || {}; r.desenho.passante = true;
    r.resumo = String(r.resumo || "").replace(/^Chapa simples/, "Chapa passante").replace("soldada no apoio", "atravessando o tubo, soldada nas duas paredes");
    r.notas = arr(r.notas).concat(["Rasgo nas duas paredes do tubo na largura da chapa + 2 mm; solda dos dois lados da chapa em cada parede.", "O rasgo é preenchido pela chapa soldada: a seção do pilar continua."]);
    return r;
  }

  /* ================================================================ VIGA CONTÍNUA SOBRE O PILAR — CHAPA DE CABEÇA
   * O pilar acaba sob a viga, que passa contínua: chapa de cabeça soldada no topo do pilar (ponta faceada: a compressão passa
   * por CONTATO — AISC 360-16, J1.4 a), 4 parafusos na mesa de baixo da viga, par de enrijecedores de apoio na viga sobre o
   * pilar (sempre: dão também o vínculo de garfo da viga contínua no apoio). Verifica a alma da viga (5.7.3/5.7.4), os
   * enrijecedores (AISC 360-16, J10.8 com o χ da 5.3; contato J7), as soldas, os parafusos (sucção e força horizontal) e a
   * chapa e a mesa da viga sob a sucção (T-stub). p.capDir: "d" (a altura do pilar ao longo da viga) | "bf". */
  function vigaContinuaCabeca(p) {
    var e = ent(p), g = gamas(), v = e.viga, c = e.apoio || {}, R = e.Nc, T = e.Nt, H = e.V, tubo = ehTubo(c), melhor = null, ultimo = null;
    if (!(num(v.d, 0) > 0 && num(v.bf, 0) > 0 && num(v.tw, 0) > 0)) return { ok: false, razao: Infinity, governante: "viga sem perfil I", tipo: "vigaContinuaCabeca", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "Viga contínua sobre o pilar: viga de perfil I." };
    /* M2 (revisão 15/10/2026): só o pilar de perfil I com a ALTURA ao longo da viga (capDir "d") tem o caminho da força verificado:
       as duas mesas do pilar atravessam sob a alma da viga e os 2 pares de enrijecedores ficam sobre elas. Pilar girado (capDir
       "bf") ou tubular: parte do pilar fica longe da alma e a força passaria pela flexão da chapa de cabeça + mesa da viga (não
       verificada) → bloqueado. O revisor achou: W530×66 sobre W200×35,9 girado, R = 500 → aprovada 0,990 com os enrijecedores no
       centro, fora das mesas do pilar. */
    var blqG = [];
    if (!tubo && !(num(c.d, 0) > 0 && num(c.bf, 0) > 0 && num(c.tf, 0) > 0 && num(c.tw, 0) > 0)) return { ok: false, razao: Infinity, governante: "INCOMPLETO: o pilar não tem perfil informado", tipo: "vigaContinuaCabeca", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], bloqueante: ["INCOMPLETO: o pilar sob a viga não tem perfil informado (d, bf, tf, tw)"], resumo: "INCOMPLETO — o pilar sob a viga não tem perfil informado." };
    if (tubo) blqG.push("pilar TUBULAR sob a viga contínua: a parede do tubo longe da alma da viga entrega a força pela flexão da chapa de cabeça e da mesa da viga — não verificada; use pilar de perfil I com a altura ao longo da viga");
    else if (p.capDir === "bf") blqG.push("pilar girado sob a viga (a alma do pilar atravessada): as mesas do pilar ficam a " + br((c.d - c.tf) / 2, 0) + " mm da alma da viga e entregam a força pela flexão da chapa de cabeça e da mesa da viga — não verificada; gire o pilar (a altura do pilar ao longo da viga)");
    var Lc, Bc, tbC = tubo ? tuboDe(c) : null;
    if (tubo) { Lc = tbC.rhs ? tbC.h0 : tbC.D; Bc = tbC.rhs ? tbC.b0 : tbC.D; } else { var aoLongo = p.capDir !== "bf"; Lc = aoLongo ? c.d : c.bf; Bc = aoLongo ? c.bf : c.d; }
    var Lw = tubo ? (tbC.rhs ? 2 * (tbC.b0 + tbC.h0) : Math.PI * tbC.D) : 2 * c.bf + 2 * (c.bf - c.tw - 2 * num(c.r, 0)) + 2 * (c.d - 2 * c.tf - 2 * num(c.r, 0));
    /* os 2 pares de enrijecedores de apoio sobre as mesas do pilar (ou as paredes do tubo, só para o desenho do bloqueado): ±xe do eixo */
    var tfc = tubo ? num(tbC.t0, 6) : c.tf, xe = (Lc - tfc) / 2;
    /* a parcela da força do pilar na ALMA do pilar (sob a alma da viga) e em cada MESA (sob cada par de enrijecedores): a divisão
       elástica pela área — Aw/A e bf·tf/A ≤ 1/2 (os pares levam R/2 cada, a favor) — limite inferior: tudo verificado para a sua
       parcela */
    var Ac = tubo ? 0 : num(c.A, 2 * c.bf * c.tf + (c.d - 2 * c.tf) * c.tw), fAlma = tubo ? 1 : Math.max(0, (Ac - 2 * c.bf * c.tf) / Ac), lnA = tubo ? Lc : c.d - 2 * c.tf;
    var PFv = pfLista(PFs(), e), TPv = tFixo(e) ? [tFixo(e)] : CHAPAS.slice(3);
    for (var ip = 0; ip < PFv.length && !melhor; ip++) for (var it = 0; it < TPv.length && !melhor; it++) { var r = avaliar(PFv[ip], TPv[it]); if (!r) continue; ultimo = r; if (r.ok) melhor = r; }
    if (!melhor && ultimo) ultimo.sugestao = "Pilar mais estreito que a mesa da viga, viga de alma mais grossa ou enrijecedores mais grossos.";
    var out = melhor || ultimo || { ok: false, razao: Infinity, governante: "geometria", tipo: "vigaContinuaCabeca", verificacoes: [], naoVerificado: [], notas: [], reforcos: [], resumo: "A mesa da viga não comporta 2 parafusos." };
    if (blqG.length) out.bloqueante = arr(out.bloqueante).concat(blqG);
    return out;
    function avaliar(pf, tp) {
      var d = pf.d, dh = furo(d), dh2 = dh + 2, eP = cima5(bordaMin(d, e.bordaChapa)), eF = bordaMin(d, "laminada"), vs = [], nv = [];
      /* a alma da viga sob a ALMA do pilar (longe da ponta: 5.7.3 e 5.7.4), com a parcela da alma */
      var k = v.tf + num(v.r, 0), ln = lnA, Resc = 1.10 * (5 * k + ln) * e.fyV * v.tw / g.a1 / 1000, Renr = 0.66 * v.tw * v.tw * (1 + 3 * (ln / v.d) * Math.pow(v.tw / v.tf, 1.5)) * Math.sqrt(E * e.fyV * v.tf / v.tw) / g.a1 / 1000, Rw = Math.min(Resc, Renr), Rweb = R * fAlma, R2 = R / 2;
      /* os 2 pares de enrijecedores de apoio: cada par + a faixa de alma (25·tw, limitada ao espaçamento 2·xe entre os pares — AISC
         360-16, J10.8) como barra comprimida, KL = 0,75·h, χ da 5.3.3; cada par com R/2 */
      var fyS = Math.min(e.fy, e.fyV), bs = Math.floor((v.bf - v.tw) / 2 - 5), lim = 0.56 * Math.sqrt(E / e.fy), h = v.d - 2 * v.tf, ch = Math.max(15, num(v.r, 0) + 5), ts = null, NcRd = 0, l0 = 0, Aef = 0, faixa = Math.min(25 * v.tw, 2 * xe);
      for (var i = 0; i < CHAPAS.length; i++) {
        var t = CHAPAS[i]; if (e.forcar.ts > 0 && t !== num(e.forcar.ts, 0)) continue; if (!(e.forcar.ts > 0) && (bs / t > lim || t < Math.max(6.3, tfc / 2))) continue;
        Aef = 2 * bs * t + faixa * v.tw; var I = t * Math.pow(2 * bs + v.tw, 3) / 12, rr = Math.sqrt(I / Aef); l0 = 0.75 * h / rr / Math.PI * Math.sqrt(fyS / E); NcRd = chi(l0) * Aef * fyS / g.a1 / 1000;
        ts = t; if (NcRd >= R2 && 1.8 * e.fy * 2 * (bs - ch) * t / g.a2 / 1000 >= R2) break;
      }
      if (ts == null) return null;
      var Apb = 2 * (bs - ch) * ts, RpRd = 1.8 * e.fy * Apb / g.a2 / 1000;
      vs.push(verif("Alma da viga sob a alma do pilar (a parcela da alma R·Aw/A)", ED08 + ", 5.7.3 e 5.7.4 (força longe da ponta; ln = d − 2·tf do pilar)",
        [passo("Força do pilar", "R (compressão no topo do pilar)", br(R, 1) + " kN"), passo("Parcela da alma do pilar", "R·(A − 2·bf·tf)/A", br(Rweb, 1) + " kN", "Aw/A = " + br(fAlma, 3)), passo("Escoamento local", "1,10·(5k + ln)·fy·tw/γa1, ln = " + br(ln, 0) + " mm", br(Resc, 1) + " kN"), passo("Enrugamento", "0,66·tw²·[1 + 3(ln/d)(tw/tf)^1,5]·√(E·fy·tf/tw)/γa1", br(Renr, 1) + " kN")], Rw, Rweb));
      vs.push(verif("Enrijecedores de apoio sobre as mesas do pilar (2 pares, cada um com R/2)", "AISC 360-16, J10.8 (enrijecedor + faixa de alma como barra comprimida, KL = 0,75·h; χ pela " + ED24 + ", 5.3); R/2 ≥ a parcela de cada mesa R·bf·tf/A (a favor)",
        [passo("Força por par", "R/2", br(R2, 1) + " kN"), passo("Posição", "±(d − tf)/2 do eixo do pilar (sobre as mesas)", "±" + br(xe, 0) + " mm"), passo("Enrijecedores " + bs + " × " + br(ts, 1) + " mm (par) + faixa de alma", "Aef = 2·b·t + mín(25·tw; 2·xe)·tw", br(Aef, 0) + " mm²", "λ0 = " + br(l0, 3)), passo("Nc,Rd", "χ·Aef·fy/γa1", br(NcRd, 1) + " kN")], NcRd, R2));
      vs.push(verif("Enrijecedores de apoio: contato na mesa (pontas faceadas, cada par)", "AISC 360-16, J7 (1,8·fy·Apb; γa2 = 1,35 no lugar do φ = 0,75 — a favor)", [passo("Apb", "2·(b − chanfro)·t", br(Apb, 0) + " mm²", "chanfro " + ch + " mm"), passo("Resistente", "1,8·fy·Apb/γa2", br(RpRd, 1) + " kN"), passo("Força por par", "R/2", br(R2, 1) + " kN")], RpRd, R2));
      var vTs = verif("Enrijecedores de apoio: esbeltez e espessura", ED08 + ", 5.7.9 (b/t ≤ 0,56·√(E/fy); t ≥ metade da espessura que entrega a força)", [passo("b/t", "≤ " + br(lim, 1), br(bs / ts, 1))], lim, bs / ts, "");
      vs.push(vTs);
      var fS = R2 * 1000 / (4 * Math.max(h - 2 * ch, 10)), sS = cordao(fS, ts, v.tw, Math.min(e.fy, e.fyV), e.fw, 0.6 * Math.min(ts * e.fy, v.tw * e.fyV) / g.a1 / 2, e.forcar.a);
      vs.push(verif("Solda dos enrijecedores na alma da viga (" + sS.texto + ", 4 cordões × " + br(h - 2 * ch, 0) + " mm por par)", ED08 + ", 6.2.5 (AISC 360-16, J10.8: a solda leva a força do enrijecedor para a alma — a força inteira do par, a favor)", [passo("Por mm", "(R/2)/(4·(h − 2·chanfro))", br(fS, 0) + " N/mm"), passo("Resistência por mm", "", br(sS.cap, 0) + " N/mm")], sS.cap, fS, "N/mm"));
      /* os parafusos fora do pilar, ao longo da viga: a cabeça (sextavada pesada, s ≈ 1,5·d + 5 mm) livra o enrijecedor e a solda
         dele + 3 mm (folga de montagem) */
      var cab = 1.155 * (1.5 * d + 5) / 2, aE = sS.a > 0 ? sS.a : ts, cb = Math.max(cima5(Math.max(1.5 * d, 0.93 * d + 15)), cima5(xe + ts / 2 + aE + cab + 3 - Lc / 2)), xb = Lc / 2 + cb, Lp = 2 * (xb + eP);
      var gMin = Math.max(cima5(3 * d), cima5(v.tw + 2 * num(v.r, 0) + 2.2 * d)), gMax = Math.floor((v.bf - 2 * eF) / 5) * 5, gx = Math.max(gMin, Math.min(cima5(0.6 * v.bf), gMax)), Bp = Math.max(Bc, gx + 2 * eP);
      /* a mesa da viga cobre o pilar (dispersão a 45° na chapa) — senão a chapa trabalharia à flexão (não verificada) */
      var cob = verif("A mesa da viga cobre a largura do pilar (bf + 2·tp ≥ largura do pilar)", "dispersão a 45° na espessura da chapa (sp = 2·tp — a mesma da EN 1993-1-8, 6.2.6.2); fora disso a chapa de cabeça trabalharia à flexão (não verificada)",
        [passo("Largura do pilar sob a viga", "", br(Bc, 0) + " mm"), passo("bf + 2·tp", br(v.bf, 0) + " + 2·" + br(tp, 1), br(v.bf + 2 * tp, 0) + " mm")], v.bf + 2 * tp, Bc, "mm");
      cob.razao = Bc / (v.bf + 2 * tp); vs.unshift(cob);
      /* parafusos (4): sucção T e força horizontal H */
      var ftr = FtRd(d, e.fub), fvr = FvRd(d, e.fub), Ft = T / 4, Fv = H / 4, i2 = sq(Ft / ftr) + sq(Fv / fvr);
      vs.push(verif("Parafusos da chapa de cabeça na mesa da viga (4 × " + pf.id + " " + e.classe + ")", ED08 + ", 6.3.3.1, 6.3.3.2 (" + ED24 + ") e 6.3.3.4", [passo("Tração (sucção)", "T/4", br(Ft, 1) + " kN", "Ft,Rd = " + br(ftr, 1) + " kN"), passo("Cisalhamento (força horizontal)", "H/4", br(Fv, 1) + " kN", "Fv,Rd = " + br(fvr, 1) + " kN"), passo("Interação", "(Ft/FtRd)² + (Fv/FvRd)²", br(i2, 3))], 1, Math.max(i2, Ft / ftr, Fv / fvr), ""));
      var lfP = Math.min(eP, (Bp - gx) / 2) - dh / 2, lfV = (v.bf - gx) / 2 - dh / 2, FcR = Math.min(Fc(d, tp, e.fu, lfP), Fc(d, v.tf, e.fuV, lfV));
      vs.push(verif("Pressão de contato (chapa de cabeça e mesa da viga)", ED08 + ", 6.3.3.3 (a borda mais próxima, qualquer que seja a direção de H — a favor)", [passo("Por parafuso", "mín(1,2·lf·t·fu; 2,4·db·t·fu)/γa2", br(FcR, 1) + " kN")], FcR, Fv));
      if (T > 0) {
        var mx = cb - 0.8 * Math.sqrt(2) * 6, wG = gx, eG = (Bp - gx) / 2, exG = eP;
        var cpE = Math.min(2 * Math.PI * mx, Math.PI * mx + wG, Math.PI * mx + 2 * eG), ncE = Math.min(4 * mx + 1.25 * exG, eG + 2 * mx + 0.625 * exG, 0.5 * Bp, 0.5 * wG + 2 * mx + 0.625 * exG);
        var tsP = tstub(Math.min(cpE, ncE), ncE, tp, e.fy, mx, exG, 2 * ftr, alongamento(d, tp + v.tf, 1));
        vs.push(verif("Chapa de cabeça à flexão sob a sucção (cada par de parafusos)", REF_TSTUB + "; linha fora do pilar como a extensão da chapa de extremidade (EN 1993-1-8, Tabela 6.6)", passosTstub(tsP, Math.min(cpE, ncE), ncE, tp, "Chapa de cabeça"), tsP.F, T / 2));
        var mf = (gx - v.tw) / 2 - 0.8 * num(v.r, 0), ef = (v.bf - gx) / 2, tsF = tstub(Math.min(2 * Math.PI * mf, 4 * mf + 1.25 * ef), 4 * mf + 1.25 * ef, v.tf, e.fyV, mf, ef, 2 * ftr, alongamento(d, tp + v.tf, 1));
        vs.push(verif("Mesa da viga à flexão sob a sucção (cada par de parafusos)", "EN 1993-1-8:2005, Tabela 6.4 (mesa sem enrijecedor, linha isolada); " + REF_TSTUB, passosTstub(tsF, Math.min(2 * Math.PI * mf, 4 * mf + 1.25 * ef), 4 * mf + 1.25 * ef, v.tf, "Mesa da viga"), tsF.F, T / 2));
      }
      var fP = Math.sqrt(sq(T / Lw) + sq(H / Lw)) * 1000, sP = cordao(fP, tp, tubo ? tbC.t0 : Math.min(c.tf, c.tw), Math.min(e.fy, e.fyA), e.fw, 0, e.forcar.a);
      vs.push(verif("Solda da chapa de cabeça no pilar (" + sP.texto + " em todo o contorno, " + br(Lw, 0) + " mm)", ED08 + ", 6.2.5 — a compressão passa por CONTATO (ponta faceada, AISC 360-16, J1.4 a); a solda leva a sucção e a força horizontal", [passo("Por mm", "√((T/L)² + (H/L)²)", br(fP, 0) + " N/mm"), passo("Resistência por mm", "", br(sP.cap, 0) + " N/mm")], sP.cap, fP, "N/mm"));
      vs.push(vBorda("furos na mesa da viga", (v.bf - gx) / 2, d, "laminada"));
      vs.push(vBorda("furos da chapa de cabeça (laterais)", (Bp - gx) / 2, d, e.bordaChapa));
      vs.push(vBorda("furos da chapa de cabeça (pontas)", eP, d, e.bordaChapa));
      var fe = fecha(vs), blqC = [];
      /* a chapa de cabeça ROTULA o pilar: momento no topo do pilar (o cálculo tratou o nó como rígido) não tem caminho aqui */
      if (e.M > 1) blqC.push("momento no topo do pilar (M = " + br(e.M, 1) + " kN·m do cálculo): a chapa de cabeça é rotulada — momento não verificado (recalcule com o topo do pilar rotulado ou use outra ligação)");
      return { bloqueante: blqC, ok: fe.ok, razao: fe.razao, governante: fe.governante, tipo: "vigaContinuaCabeca",
        dimensoes: { t: tp, B: Bp, L: Lp, parafuso: pf.id, classe: e.classe, n: 4, gx: gx, xb: xb, Lc: Lc, Bc: Bc, enrijecedores: { b: bs, t: ts, n: 4, pares: 2, x: xe, solda: sS.texto }, soldaPilar: sP.texto, contato: true },
        desenho: { t: tp / 1000, B: Bp / 1000, L: Lp / 1000, parafuso: pf.id, gx: gx / 1000, xb: xb / 1000, enrij: { t: ts / 1000, xs: [-xe / 1000, xe / 1000] }, nTotal: 4 },
        resumo: "Chapa de cabeça " + br(Lp, 0) + " × " + br(Bp, 0) + " × " + br(tp, 1) + " mm no topo do pilar (" + sP.texto + "), 4 parafusos " + pf.id + " " + e.classe + " na mesa de baixo da viga; 2 pares de enrijecedores de apoio " + bs + " × " + br(ts, 1) + " mm na viga sobre as mesas do pilar (±" + br(xe, 0) + " mm do eixo; " + sS.texto + ")",
        verificacoes: vs, reforcos: [], notas: ["OBRIGATÓRIO NA FABRICAÇÃO: ponta do pilar faceada (contato pleno com a chapa de cabeça) — AISC 360-16, J1.4 a).", "Os enrijecedores de apoio também dão o vínculo de garfo da viga contínua no apoio (hipótese do cálculo da viga)."],
        naoVerificado: ["A viga contínua (momento negativo e cortante sobre o apoio) é verificada como BARRA no cálculo da estrutura, não aqui."] };
    }
  }

  /* ================================================================ CHAPA SIMPLES NA ALMA DO PILAR COM AS MESAS DA VIGA RECORTADAS
   * Quando a viga não cabe entre as mesas do pilar: as mesas são recortadas na largura b' ≤ d − 2·tf − 2·r − 10 ao longo de c (até
   * passar a ponta das mesas do pilar); a seção reduzida no fim do recorte é verificada à flexão (escoamento W·fy/γa1 — a mesma
   * verificação da viga recortada, AISC Manual Parte 9); a ligação é a chapa simples. */
  function chapaSimplesMesasRec(p) {
    var e = ent(p), g = gamas(), v = e.viga, c = e.apoio || {}, blq = [], nv = [];
    if (e.face !== "alma") blq.push("o recorte das mesas da viga é para a viga que entra entre as mesas (ALMA do pilar)");
    var livre = num(c.d, 0) - 2 * num(c.tf, 0) - 2 * num(c.r, 0), bR = Math.min(num(v.bf, 0), Math.floor((livre - 10) / 5) * 5), cR = cima5(Math.max(20, (num(c.bf, 0) - num(c.tw, 0)) / 2 - FOLGA + 10));
    if (bR < num(v.tw, 6) + 2 * num(v.r, 0) + 20) blq.push("o recorte deixaria a mesa da viga com " + br(bR, 0) + " mm (menos que tw + 2·r + 20): é recorte quase total das mesas — não verificado");
    function extra(r) {
      var V = e.V, Ir = (bR * Math.pow(v.d, 3) - (bR - v.tw) * Math.pow(v.d - 2 * v.tf, 3)) / 12, Wr = 2 * Ir / v.d, M = V * (cR + FOLGA) / 1000, MRd = Wr * e.fyV / g.a1 / 1e6;
      r.verificacoes.push(verif("Viga com as mesas recortadas (b' = " + br(bR, 0) + " mm ao longo de " + cR + " mm) à flexão no fim do recorte", "escoamento da seção reduzida W·fy/γa1 (AISC Steel Construction Manual, Parte 9 — a mesma da viga recortada; " + PRATICA + ")",
        [passo("Seção reduzida", "I = [b'·d³ − (b' − tw)·(d − 2·tf)³]/12; W = 2·I/d", br(Wr / 1000, 1) + "·10³ mm³"), passo("Momento", "V·(c + folga)", br(M, 2) + " kN·m", comb(e.combV)), passo("Resistente", "W·fy/γa1", br(MRd, 2) + " kN·m")], MRd, M, "kN·m"));
      var fe = fecha(r.verificacoes); r.ok = fe.ok; r.razao = fe.razao; r.governante = fe.governante;
    }
    var r = chapaSimples(p, { extra: extra, semEncaixe: true });
    r.tipo = "chapaSimplesMesasRec"; r.bloqueante = arr(r.bloqueante).concat(blq); r.naoVerificado = arr(r.naoVerificado).concat(nv);
    var dm = r.dimensoes || {}; dm.recorteMesas = { b: bR, c: cR };
    r.resumo = "Mesas da viga recortadas na largura " + br(bR, 0) + " mm ao longo de " + cR + " mm; " + String(r.resumo || "");
    r.notas = arr(r.notas).concat(["O recorte das mesas vai no desenho de fabricação (o 3D não recorta a mesa)."]);
    return r;
  }

  /* ================================================================ NÃO DIMENSIONADAS (catálogo e desenho, sem Aplicar) */
  var NAO_DIM = {
    "chapa-ext-estendida-4w": "a distribuição da tração entre os 4 parafusos de cada linha depende da rigidez da mesa da viga e da chapa — sem fórmula amarrada a norma no motor; dimensionar à parte",
    "anel-tubo": "anel (colar) externo em pilar tubular para ligação de momento: as fórmulas da largura e da espessura do anel (CIDECT, Design Guide 9; AISC Design Guide 24) não estão no motor — dimensionar à parte"
  };
  function naoDimensionada(id) {
    var m = NAO_DIM[id] || "sem verificação no motor";
    return { ok: false, naoDimensionada: true, razao: NaN, governante: "não dimensionada: " + m, tipo: "naoDimensionada", verificacoes: [], reforcos: [], notas: [], naoVerificado: [], bloqueante: ["NÃO DIMENSIONADA: " + m], resumo: "Não dimensionada — " + m + ".", desenho: null };
  }

  function chapaDupla(p) { return chapaSimples(p, { dupla: true }); }

  var FUNCOES = {
    cantoneiraDupla: cantoneiraDupla, cantoneiraSimples: cantoneiraSimples, chapaSimples: chapaSimples, chapaTopoCurta: chapaTopoCurta, cantoneiraAssento: cantoneiraAssento,
    chapaExtendida: chapaExtendida, chapaAjustada: chapaAjustada, talasMesa: talasMesa, soldadaDireta: soldadaDireta, misula: misula, painelAlma: painelAlma, enrijecedorContinuidade: enrijecedorContinuidade,
    vigaRecortada: vigaRecortada, emendaVigaTalas: emendaVigaTalas, chapaCumeeira: chapaCumeeira, emendaPilarTalas: emendaPilarTalas, emendaPilarChapa: emendaPilarChapa, emendaPilarSoldada: emendaPilarSoldada,
    placaBase: placaBase, placaBaseEnrijecida: placaBaseEnrijecida, barraCisalhamento: barraCisalhamento, chumbadorQuimico: chumbadorQuimico,
    gussetContravento: gussetContravento, noTubular: noTubular, consolo: consolo, barraRedonda: barraRedonda, clipTerca: clipTerca,
    emendaTracao: emendaTracao, gussetTubo: gussetTubo, chapaDupla: chapaDupla,
    /* M2 (1.2.145) */
    chapaExt8: chapaExt8, chapaExt4ES: chapaExt4ES, cantTopoAssento: cantTopoAssento, chapaSimplesTubo: chapaSimplesTubo, chapaPassante: chapaPassante, vigaContinuaCabeca: vigaContinuaCabeca, chapaSimplesMesasRec: chapaSimplesMesasRec
  };
  /* dimensiona uma tipologia do catálogo: o resultado leva a tipologia, a edição e a marca de estimativa */
  function verificar(tipId, entrada) {
    var T = Tip(), t = T && T.obter(tipId); if (!t) return { ok: false, motivo: "Tipologia desconhecida: " + tipId + "." };
    /* M2 (1.2.145): tipologia NÃO DIMENSIONADA (sem fórmula amarrada a norma ou a referência reconhecida) — nunca passa, nunca Aplicar */
    if (!t.calc && (t.naoDimensionada || NAO_DIM[tipId])) { var rN = naoDimensionada(tipId); rN.tipologia = tipId; rN.nome = t.nome; rN.familia = t.familia; rN.edicao = T.EDICAO.aviso; rN.naoVerificado = ["NÃO DIMENSIONADA (a opção fica bloqueada, sem Aplicar): " + (t.naoDimensionada || NAO_DIM[tipId]) + "."]; return rN; }
    var f = FUNCOES[t.calc]; if (!f) return { ok: false, motivo: "A tipologia " + t.nome + " não tem verificação (" + t.calc + ")." };
    var r;
    try { r = f(entrada || {}, t.calcPar || {}); } catch (ex) { return { ok: false, motivo: "Erro na verificação de " + t.nome + ": " + (ex && ex.message ? ex.message : ex), tipologia: tipId }; }
    if (!r) return { ok: false, motivo: "Sem resultado.", tipologia: tipId };
    /* NOTA OBRIGATÓRIA DE CORTE: as bordas mínimas usadas nas chapas/talas são as de borda laminada ou cortada a maçarico
       (NBR 8800, Tabela 14); com serra ou tesoura a borda mínima sobe (e a entrada `corte: "serra"` já dimensiona com ela) */
    if (!/^(cant-dupla-paraf|cant-dupla-sold-paraf|cant-simples|cant-assento|cant-topo-assento-sr|viga-viga-recorte-cant|clip-terca|soldada-direta|tubo-t-y|tubo-k|contravento-barra-redonda|tirante|enrijecedor-continuidade|reforco-alma-pilar|emenda-pilar-soldada)$/.test(tipId)) {
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

  var AcoLigCalc2 = { verificar: verificar, FUNCOES: FUNCOES, memorialHtml: memorialHtml, pilarLocal: pilarLocal, painel: painel, linhaExcentrica: linhaExcentrica, tstub: tstub, nervura: nervura, NAO_DIM: NAO_DIM, ehTubo: ehTubo,
    cantoneiraDupla: cantoneiraDupla, cantoneiraSimples: cantoneiraSimples, chapaSimples: chapaSimples, chapaTopoCurta: chapaTopoCurta, cantoneiraAssento: cantoneiraAssento, chapaExtendida: chapaExtendida, chapaAjustada: chapaAjustada,
    talasMesa: talasMesa, soldadaDireta: soldadaDireta, misula: misula, vigaRecortada: vigaRecortada, emendaVigaTalas: emendaVigaTalas, emendaPilarTalas: emendaPilarTalas,
    placaBase: placaBase, placaBaseEnrijecida: placaBaseEnrijecida, barraCisalhamento: barraCisalhamento, gussetContravento: gussetContravento, noTubular: noTubular, consolo: consolo };
  global.AcoLigCalc2 = AcoLigCalc2;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigCalc2;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

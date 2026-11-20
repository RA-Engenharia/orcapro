/* =====================================================================
 * madt3l.js — T3L: TELHADO DE 4 ÁGUAS EM PLANTA EM L (com RINCÃO) em madeira engenharada. Motor PURO, ES5, sem DOM, Node-testável.
 * ESTENDE o T3 (madt3.js): só LÊ o T3 (util, upDe, FOLGA) e devolve os membros no MESMO formato ({ id, g, p0, p1, nos, ... }, ponto = [X, Z da planta, altura]) para que
 * o cálculo (madt3lcalc.js), as ligações, as saídas e os encaixes reaproveitem o que o T3 já tem. Decisões, fontes e conta à mão: docs/madeira/T3L-REFERENCIA.md.
 *
 * PLANTA (forma canônica): L formado por dois retângulos que se sobrepõem no quadrado do canto externo (origem):
 *     asa A (larga, ao longo de X):  [0, a] × [0, b]          asa B (ao longo de Z): [0, bb] × [0, c]        bb ≤ b      (a ≥ c NÃO é exigido: o vento é calculado POR ASA, cada uma com a cumeeira ao longo do próprio comprimento)
 *   vértices: (0,0) (a,0) (a,b) (bb,b)* (bb,c) (0,c)   (* = canto côncavo, onde nasce o RINCÃO). 5 cantos convexos (5 espigões) e 1 côncavo (rincão).
 * MESMA INCLINAÇÃO nas 6 águas e mesmo beiral nos 6 lados. Altura da água em (x, z) = i · max(h_A, h_B), h_A e h_B as alturas dos telhados de 4 águas de cada retângulo
 * (a interseção das águas ao longo do rincão é onde as duas se igualam: z = x + (b − bb), a 45° em planta).
 *   · cumeeira A a h = i·b/2 (de b/2 a a − b/2 em X, z = b/2); cumeeira B a h = i·bb/2 (x = bb/2, de b/2·… ver abaixo): ALTURAS DIFERENTES quando bb < b;
 *   · espigões E1…E5 nos cantos convexos; E6 = espigão "virtual" do canto (0, b) do retângulo A, que só existe entre o topo da cumeeira A e o vértice V (só se bb < b);
 *   · RINCÃO (RC): do canto côncavo (com o balanço do beiral até a ponta, em (bb+e, b+e)) até V = (bb/2, b − bb/2, h_B): nasce na cota do frechal e SOBE até a cumeeira B;
 *   · cumeeira B (CM) de (bb/2, bb/2) [ponto do espigão E1] à ponta (bb/2, c − bb/2) — na parte sul é uma terça da água oeste na cota da cumeeira B;
 *   · TESOURAS PRINCIPAIS (Pratt/Howe, as barras da T2) da asa A em x ∈ [x_f, a − b/2] (x_f = máx(b/2, bb + assento): a primeira tesoura inteira tem parede nos DOIS lados e fica a `assento` do pilar do canto côncavo)
 *     e da asa B em z ∈ [b, c − bb/2] (a "tesoura da boca" em z = b assenta no pilar do canto côncavo);
 *   · MEIAS-TESOURAS (MS, MI, MP, MG) nas cabeceiras leste (asa A) e norte (asa B), como no T3; na cabeceira OESTE (a água oeste é comum às duas asas): caibro de meio (CB) do
 *     pilar de meio de parede (0, b/2) ao topo da cumeeira A, com o tirante MI ligando o pé do caibro à primeira tesoura (leva o empuxo horizontal);
 *   · terças das 6 águas nas MESMAS linhas (dz = (b/2)/nH em planta; a asa B usa as mesmas linhas k·dz): cada uma de espigão/rincão a espigão/rincão, em bisel;
 *   · frechal em anel de 6 lados; contraventamento de madeira (DX, DV, DP) como no T3, nas duas asas.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T3 = req("MadT3", "madt3.js"), U = T3._util, D = U.D, rd = U.rd, linspace = U.linspace, ext = U.ext, norm = U.norm, mescla = U.mescla, copia = U.copia, br = U.br, subdiv = U.subdiv, hyp = U.hyp;
  var FOLGA = T3.FOLGA, MLC = "MLC GL24h (EN 14080) — pinus/eucalipto, cola PUR/MUF classe de serviço 3", INOX = "aço inox AISI 316 (A4)", GALV = "aço ASTM A36 galvanizado a fogo (NBR 6323)";

  var ASSENTO = 0.30;      /* MÍNIMO do assento: a primeira tesoura da asa A e a tesoura da boca da asa B ficam a `assento` do canto côncavo (assentam por inteiro no frechal, não na ponta onde os dois frechais se encontram). O assento EFETIVO é max(0,30 m; b_pilar + 0,02 m): 20 mm de folga entre o pilar do canto côncavo e o da tesoura (decisão 20/11/2026, recalculado depois do dimensionamento em madt3llig.projetar) */
  var L_PADRAO = ext({}, T3.PADRAO, { a: 12, b: 6, c: 10, bb: 5, nome: "Telhado de 4 águas em L" });
  function lParametros(p) {
    var q = mescla(L_PADRAO, p || {}), be = q.beiral;
    if (be && typeof be === "object") {
      var v = [be.frente, be.fundo, be.esq, be.dir].filter(function (x) { return x != null; });
      if (!v.length) be = 0.8; else { if (v.some(function (x) { return Math.abs(x - v[0]) > 1e-9; })) throw new Error("madt3l: o espigão e o rincão a 45° exigem o MESMO beiral nos 6 lados (informado: " + v.join("; ") + ")"); be = v[0]; }
    }
    q.assento = Math.max(ASSENTO, Number(q.assento) || 0); q.beiral = Number(be); q.a = Number(q.a); q.b = Number(q.b); q.c = Number(q.c); q.bb = Number(q.bb);
    if (!(q.beiral >= 0 && q.beiral <= 2.5)) throw new Error("madt3l: beiral fora de 0 a 2,5 m");
    if (!(q.incl > 0.05)) throw new Error("madt3l: inclinação mínima de 5 % (telha)");
    if (!(q.b >= 3 && q.bb >= 3)) throw new Error("madt3l: vão mínimo de 3 m em cada asa");
    if (q.bb > q.b + 1e-9) throw new Error("madt3l: a asa A (ao longo de X) é a LARGA: bb ≤ b (informado b = " + br(q.b) + " e bb = " + br(q.bb) + "); gire/espelhe a planta");
    if (q.b - q.bb > 1e-6 && q.b - q.bb < 0.5) throw new Error("madt3l: b − bb = " + br(q.b - q.bb) + " m (entre 0 e 0,5 m): use asas de larguras IGUAIS ou afaste-as de pelo menos 0,5 m");
    if (q.a < Math.max(q.b + 0.5, q.bb + q.assento + q.b / 2) - 1e-9) throw new Error("madt3l: comprimento a = " + br(q.a) + " m curto: exige a ≥ " + br(Math.max(q.b + 0.5, q.bb + q.assento + q.b / 2)) + " m (cumeeira A de pelo menos 0,5 m e a primeira tesoura da asa A com parede dos dois lados)");
    if (q.c < q.b + q.assento + q.bb / 2 - 1e-9) throw new Error("madt3l: comprimento c = " + br(q.c) + " m curto: exige c ≥ b + assento + bb/2 = " + br(q.b + q.assento + q.bb / 2) + " m (a asa B precisa de pelo menos a tesoura da boca e a de extremidade)");
    if (q.tesoura.tipo !== "pratt" && q.tesoura.tipo !== "howe") throw new Error("madt3l: tesoura.tipo deve ser \"pratt\" ou \"howe\"");
    q._t3l = true; q.planta = "L"; return q;
  }

  /** PAINÉIS DE PAREDE QUE LEVAM O X (DP): o primeiro e o último painel LARGOS (>= 0,8 m) de cada lado; painel mais estreito (ex.: entre o pilar do canto côncavo e o da tesoura) NÃO leva X —
   *  a diagonal cruzaria o pilar vizinho — e NÃO é tratado como rígido: a estabilidade horizontal daquela parede depende do X do painel largo vizinho e do anel de frechal (a confirmar pelo RT).
   *  Fallback (todos os painéis < 0,8 m): só o painel MAIS LARGO, com `curto: true` (o auditor marca "painel-estreito"). */
  function paineisDP(S) {
    var pn = [], q, w, melhor = null;
    for (q = 0; q + 1 < S.length; q++) { w = S[q + 1] - S[q]; if (w >= 0.8 - 1e-9) pn.push([S[q], S[q + 1]]); if (!melhor || w > melhor[1] - melhor[0]) melhor = [S[q], S[q + 1]]; }
    var r = !pn.length ? [melhor] : (pn.length > 1 ? [pn[0], pn[pn.length - 1]] : [pn[0]]);
    r.curto = !pn.length; return r;
  }
  /** GEOMETRIA: membros no formato do T3 e info */
  function lGeometria(pp) {
    var p = pp && pp._t3l ? pp : lParametros(pp), a = p.a, b = p.b, c = p.c, bb = p.bb, Hp = p.peDireito + p.baseZ, i = p.incl, sc = Math.sqrt(1 + i * i), e = p.beiral, cob = p.cobertura, tipE = e * sc, howe = p.tesoura.tipo === "howe", M = [], j, k;
    var nH = Math.max(2, Math.ceil((b / 2) * sc / cob.sTercaMax - 1e-9)), dz = (b / 2) / nH, lp = dz * sc, igual = Math.abs(b - bb) < 1e-6;
    var kB = Math.ceil(bb / 2 / dz - 1e-9) - 1; if (kB > 1 && bb / 2 - kB * dz < 0.3 * dz) kB--; if (kB < 1) kB = 1;
    var dlA = [0], dlB = [0]; for (k = 1; k <= nH; k++) dlA.push(k * dz); for (k = 1; k <= kB; k++) dlB.push(k * dz); dlB.push(bb / 2);
    var nHB = dlB.length - 1, xf = Math.max(b / 2, bb + p.assento), zm = b + p.assento, xE = a - b / 2, zE = c - bb / 2, yD = function (d) { return Hp + i * d; };
    var xs = xE - xf < 1e-6 ? [xE] : linspace(xf, xE, Math.max(1, Math.ceil((xE - xf) / p.tesoura.sTes - 1e-9)) + 1);
    var zs = zE - zm < 1e-6 ? [zm] : linspace(zm, zE, Math.max(1, Math.ceil((zE - zm) / p.tesoura.sTes - 1e-9)) + 1);
    var yTA = function (z) { return z < 0 ? Hp + i * z : (z > b ? Hp + i * (b - z) : Hp + i * Math.min(z, b - z)); };
    var yTB = function (x) { return x < 0 ? Hp + i * x : (x > bb ? Hp + i * (bb - x) : Hp + i * Math.min(x, bb - x)); };
    var P3 = function (x, z, y) { return [x, z, y]; }, hA = yD(b / 2), V = P3(bb / 2, b - bb / 2, yD(bb / 2)), ATOP = P3(b / 2, b / 2, hA);
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); if (o.nos) o.nos = o.nos.map(function (P) { return P.map(function (v) { return rd(v, 4); }); }); M.push(o); return o; }
    /* ---------------- pilares: perímetro de 6 lados ---------------- */
    var EDGES = [
      { id: "S", p0: [0, 0], p1: [a, 0], t: "x", face: "esquerda", br: [0, a].concat(xs) },
      { id: "Q", p0: [bb, b], p1: [a, b], t: "x", face: "direita", br: [bb, a].concat(xs) },
      { id: "L", p0: [a, 0], p1: [a, b], t: "z", face: "fundo", br: [0, b / 2, b] },
      { id: "W", p0: [0, 0], p1: [0, c], t: "z", face: "frente", br: [0, b / 2, c].concat(zs) },
      { id: "I", p0: [bb, b], p1: [bb, c], t: "z", face: "fundo", br: [b, c].concat(zs) },
      { id: "N", p0: [0, c], p1: [bb, c], t: "x", face: "direita", br: [0, bb / 2, bb] }];
    var pil = {}, ordemP = [];
    EDGES.forEach(function (E) {
      var lo = E.t === "x" ? E.p0[0] : E.p0[1], hi = E.t === "x" ? E.p1[0] : E.p1[1], br0 = E.br.filter(function (v) { return v >= lo - 1e-9 && v <= hi + 1e-9; }).sort(function (u, v) { return u - v; }).filter(function (v, q, A) { return !q || v - A[q - 1] > 1e-6; });
      E.S = subdiv(br0, p.vMaxPilar);
      E.S.forEach(function (s, q) {
        var pt = E.t === "x" ? [s, E.p0[1]] : [E.p0[0], s], key = Math.round(pt[0] * 1e4) + "," + Math.round(pt[1] * 1e4), tr = ((q > 0 ? s - E.S[q - 1] : 0) + (q < E.S.length - 1 ? E.S[q + 1] - s : 0)) / 2;
        if (!pil[key]) { pil[key] = { pt: pt, partes: [], vertice: (q === 0 || q === E.S.length - 1), emX: false }; ordemP.push(key); }
        pil[key].partes.push([E.face, s, tr]); if (E.t === "x" || q === 0 || q === E.S.length - 1) pil[key].emX = true;
      });
    });
    var nP = 0, nO = 0;
    ordemP.forEach(function (key) { var o = pil[key], g = o.emX ? "P" : "PO"; add({ id: g + (g === "P" ? ++nP : ++nO), g: g, p0: P3(o.pt[0], o.pt[1], p.baseZ), p1: P3(o.pt[0], o.pt[1], Hp), partes: o.partes, pinJ: true }); });
    /* ---------------- tesouras principais (as barras da T2): asa A (plano x = const) e asa B (plano z = const) ---------------- */
    function tesoura(asa, pos, k, span, dl, yT, plano, ovR) {
      var Pt = function (s, y) { return asa === "A" ? P3(pos, s, y) : P3(s, pos, y); }, nHt = dl.length - 1, sf = asa === "A" ? "" : "b", mid = span / 2, tag = asa;
      var nosBI = []; for (j = 1; j < nHt; j++) nosBI.push(Pt(dl[j], Hp)); nosBI.push(Pt(mid, Hp)); for (j = nHt - 1; j >= 1; j--) nosBI.push(Pt(span - dl[j], Hp));
      add({ id: "BI" + sf + k, g: "BI", tes: k, asa: asa, plano: plano, p0: Pt(0, Hp), p1: Pt(span, Hp), nos: nosBI, pinI: true, pinJ: true });
      [[asa === "A" ? "F" : "W", -1, true], [asa === "A" ? "B" : "I", 1, ovR]].forEach(function (S) {
        var ag = S[0], sg = S[1], ov = S[2], sOf = function (jj) { return sg < 0 ? dl[jj] : span - dl[jj]; }, zt = ov ? (sg < 0 ? -tipE / sc : span + tipE / sc) : (sg < 0 ? 0 : span), nos = (ov && tipE > 0) ? [Pt(sg < 0 ? 0 : span, Hp)] : [];
        for (j = 1; j < nHt; j++) nos.push(Pt(sOf(j), yD(dl[j])));
        add({ id: "BS" + ag + sf + k, g: "BS", tes: k, asa: asa, plano: plano, agua: ag, p0: Pt(zt, ov ? yT(zt) : Hp), p1: Pt(mid, yT(mid)), nos: nos });
        for (j = 1; j <= nHt; j++) {
          if (j < nHt || sg < 0) add({ id: "PD" + ag + j + "_" + sf + k, g: "PD", tes: k, asa: asa, plano: plano, p0: Pt(sOf(j), Hp), p1: Pt(sOf(j), yD(dl[j])), pinI: true, pinJ: true });
          if (j >= 2) add({ id: "DG" + ag + j + "_" + sf + k, g: "DG", tes: k, asa: asa, plano: plano, agua: ag, p0: howe ? Pt(sOf(j - 1), yD(dl[j - 1])) : Pt(sOf(j - 1), Hp), p1: howe ? Pt(sOf(j), Hp) : Pt(sOf(j), yD(dl[j])), pinI: true, pinJ: true });
        }
      });
    }
    xs.forEach(function (x, kx) { tesoura("A", x, kx, b, dlA, yTA, "z", x >= bb + e - 1e-9); });      /* sem balanço do lado do canto côncavo quando a tesoura cai sobre o beiral da asa B */
    zs.forEach(function (z, kz) { tesoura("B", z, kz, bb, dlB, yTB, "x", z >= b + e - 1e-9); });      /* a tesoura da boca (z = b) não tem balanço do lado do canto côncavo: ali a água é a da asa A */
    /* ---------------- meias-tesouras: leste (asa A) e norte (asa B) ---------------- */
    function meia(tag, Pm, dl, plano) {
      var nHt = dl.length - 1, mid = dl[nHt], nosS = e > 0 ? [Pm(0, Hp)] : [];
      for (j = 1; j < nHt; j++) nosS.push(Pm(dl[j], yD(dl[j])));
      add({ id: "MS" + tag, g: "MS", plano: plano, agua: tag, pinJ: true, p0: Pm(-e, yD(-e)), p1: Pm(mid, yD(mid)), nos: nosS });
      var nosI = []; for (j = 1; j < nHt; j++) nosI.push(Pm(dl[j], Hp));
      add({ id: "MI" + tag, g: "MI", plano: plano, agua: tag, p0: Pm(0, Hp), p1: Pm(mid, Hp), nos: nosI, pinI: true, pinJ: true });
      for (j = 1; j < nHt; j++) add({ id: "MP" + tag + j, g: "MP", plano: plano, agua: tag, p0: Pm(dl[j], Hp), p1: Pm(dl[j], yD(dl[j])), pinI: true, pinJ: true });
      for (j = 2; j <= nHt; j++) add({ id: "MG" + tag + j, g: "MG", plano: plano, agua: tag, p0: howe ? Pm(dl[j - 1], yD(dl[j - 1])) : Pm(dl[j - 1], Hp), p1: howe ? Pm(dl[j], Hp) : Pm(dl[j], yD(dl[j])), pinI: true, pinJ: true });
    }
    meia("E", function (u, y) { return P3(a - u, b / 2, y); }, dlA, "x");
    meia("N", function (u, y) { return P3(bb / 2, c - u, y); }, dlB, "z");
    /* cabeceira OESTE: caibro de meio (CB) do pilar de meio de parede ao topo da cumeeira A + tirante MI até a primeira tesoura da asa A */
    var cbNos = e > 0 ? [P3(0, b / 2, Hp)] : [], dW = []; for (k = 1; k < nH; k++) dW.push(k * dz);
    var dCB = dW.concat([bb / 2]).filter(function (d, q, A) { return A.indexOf(d) === q; }).sort(function (u, v) { return u - v; }); dCB.forEach(function (d) { if (d > 1e-6 && d < b / 2 - 1e-6) cbNos.push(P3(d, b / 2, yD(d))); });
    add({ id: "CBW", g: "CB", agua: "W", pinJ: true, p0: P3(-e, b / 2, yD(-e)), p1: ATOP, nos: cbNos, pe: P3(0, b / 2, Hp) });
    /* ---------------- espigões, rincão ---------------- */
    var CANTOS = [["E1", 0, 0, 1, 1, b / 2], ["E2", a, 0, -1, 1, b / 2], ["E3", a, b, -1, -1, b / 2], ["E4", 0, c, 1, -1, bb / 2], ["E5", bb, c, -1, -1, bb / 2]];
    CANTOS.forEach(function (C) {
      var cx = C[1], cz = C[2], sx = C[3], sz = C[4], top = C[5], nos = [], dl = (top === b / 2) ? dlA : dlB, jj;
      if (e > 0) nos.push(P3(cx, cz, Hp));
      for (jj = 1; jj < dl.length - 1; jj++) nos.push(P3(cx + sx * dl[jj], cz + sz * dl[jj], yD(dl[jj])));
      if (C[0] === "E1") nos.push(P3(bb / 2, bb / 2, yD(bb / 2)));
      add({ id: C[0], g: "E", p0: P3(cx - sx * e, cz - sz * e, yD(-e)), p1: P3(cx + sx * top, cz + sz * top, yD(top)), nos: nos, canto: [cx, cz], sx: sx, sz: sz, pinJ: true, tip: e > 0 ? P3(cx, cz, Hp) : null });
    });
    if (!igual) {
      var n6 = []; for (k = 1; k < nH; k++) if (k * dz > bb / 2 + 1e-6 && k * dz < b / 2 - 1e-6) n6.push(P3(k * dz, b - k * dz, yD(k * dz)));
      add({ id: "E6", g: "E", p0: V, p1: ATOP, nos: n6, canto: null, interior: true, sx: 1, sz: -1, pinJ: true, tip: null });
    }
    var nR = []; if (e > 0) nR.push(P3(bb, b, Hp)); for (k = 1; k <= kB; k++) nR.push(P3(bb - k * dz, b - k * dz, yD(k * dz)));
    add({ id: "RC", g: "RC", p0: P3(bb + e, b + e, yD(-e)), p1: V, nos: nR, canto: [bb, b], sx: 1, sz: 1, pinJ: true, tip: e > 0 ? P3(bb, b, Hp) : null, concavo: true });
    /* ---------------- terças das 6 águas, cumeeiras e frechal ---------------- */
    var xStart = function (d) { return d >= bb / 2 - 1e-9 ? d : bb - d; };
    var PL = {
      F: { sl: "F", top: b / 2, ridge: true, apex: false, Lp: function (d) { return a - 2 * d; }, ends: function (d) { return [[d, d], [a - d, d]]; }, sup: function (d, y, lo) { return xs.filter(function (x) { return x > d + 1e-6; }).map(function (x) { return P3(x, d, y); }); }, fr: "FR1" },
      Q: { sl: "B", top: b / 2, ridge: true, apex: false, Lp: function (d) { return a - d - xStart(d); }, ends: function (d) { return [[xStart(d), b - d], [a - d, b - d]]; }, sup: function (d, y) { return xs.filter(function (x) { return x > xStart(d) + 1e-6; }).map(function (x) { return P3(x, b - d, y); }); }, fr: "FR2" },
      L: { sl: "E", top: b / 2, ridge: false, apex: true, Lp: function (d) { return b - 2 * d; }, ends: function (d) { return [[a - d, d], [a - d, b - d]]; }, sup: function (d, y) { return [P3(a - d, b / 2, y)]; }, fr: "FR4" },
      W: { sl: "W", top: b / 2, ridge: false, apex: true, Lp: function (d) { return d < bb / 2 - 1e-9 ? c - 2 * d : b - 2 * d; }, ends: function (d) { return [[d, d], [d, d < bb / 2 - 1e-9 ? c - d : b - d]]; },
        sup: function (d, y) { var o = [P3(d, b / 2, y)]; if (d < bb / 2 - 1e-9) zs.forEach(function (z) { o.push(P3(d, z, y)); }); return o; }, fr: "FR3" },
      I: { sl: "E", top: bb / 2, ridge: true, apex: false, Lp: function (d) { return c - b; }, ends: function (d) { return [[bb - d, b - d], [bb - d, c - d]]; }, sup: function (d, y) { return zs.filter(function (z) { return z > b - d + 1e-6; }).map(function (z) { return P3(bb - d, z, y); }); }, fr: "FR5" },
      N: { sl: "B", top: bb / 2, ridge: false, apex: true, Lp: function (d) { return bb - 2 * d; }, ends: function (d) { return [[d, c - d], [bb - d, c - d]]; }, sup: function (d, y) { return [P3(bb / 2, c - d, y)]; }, fr: "FR6" } };
    var dK = function (n) { var o = []; for (k = 1; k <= n; k++) o.push(k * dz); return o; };
    var dLista = { F: dK(nH - 1), Q: dK(nH - 1), L: dK(nH - 1), I: dK(kB), N: dK(kB), W: dK(nH - 1).filter(function (d) { return d > bb / 2 + 1e-6 || (d < bb / 2 - 1e-6 && d <= kB * dz + 1e-6); }) };
    function area(pl, lo, hi) { var cuts = [lo, hi]; if (pl === "W" || pl === "Q") { var kk = bb / 2; if (kk > lo + 1e-9 && kk < hi - 1e-9) cuts = [lo, kk, hi]; } var s = 0, q; for (q = 0; q + 1 < cuts.length; q++) s += (cuts[q + 1] - cuts[q]) * PL[pl].Lp((cuts[q] + cuts[q + 1]) / 2); return s * sc; }
    var info = { planos: {}, areaPlanos: {} }, ridgeStrip = {};
    Object.keys(PL).forEach(function (pn) {
      var P = PL[pn], ds = (e > 0 ? [{ d: -e, nome: "tip" }] : []).concat([{ d: 0, nome: "fr" }]).concat(dLista[pn].map(function (d) { return { d: d, nome: "t" }; }));
      if (pn === "W") { ds.push({ d: bb / 2, nome: "cm" }); ds.sort(function (u, v) { return u.d - v.d; }); }
      var lastReal = ds[ds.length - 1].d, topLast = P.ridge ? lastReal + (P.top - lastReal) / 2 : P.top;
      if (pn === "W" && Math.abs(lastReal - P.top) < 1e-9) topLast = P.top;
      info.areaPlanos[pn] = area(pn, -e, P.top);
      ds.forEach(function (f, q) {
        var lo = q === 0 ? f.d : (ds[q - 1].d + f.d) / 2, hi = q === ds.length - 1 ? topLast : (f.d + ds[q + 1].d) / 2, ar = area(pn, lo, hi);
        if (f.nome === "cm") { ridgeStrip.W = { ar: ar, lo: lo, hi: hi }; return; }
        var ends = P.ends(f.d), Lm = hyp(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]), ws = ar / Lm, wsIn = f.nome === "tip" ? 0 : (f.nome === "fr" ? area(pn, 0, hi) / Lm : ws), y = yD(f.d), m, A = P3(ends[0][0], ends[0][1], y), B = P3(ends[1][0], ends[1][1], y);
        if (f.nome === "fr") m = add({ id: P.fr, g: "FR", pinI: true, pinJ: true, p0: P3(A[0], A[1], Hp), p1: P3(B[0], B[1], Hp), nos: [] });
        else m = add({ id: "T" + pn + (f.nome === "tip" ? 0 : Math.round(f.d / dz)), g: "T", agua: P.sl, aguaId: pn, p0: A, p1: B, nos: P.sup(f.d, y), artic: true, ends: true });
        m.faces = [{ sl: P.sl, ws: ws, wsIn: wsIn }]; m.ws = ws; m.wp = ws / sc; m.d = f.d; m.linha = f.d;
      });
      if (P.ridge) { var lr = ds[ds.length - 1].d, loR = lr + (P.top - lr) / 2; ridgeStrip[pn] = { ar: area(pn, loR, P.top), lo: loR, hi: P.top }; }
    });
    /* cumeeira A (F + Q) e cumeeira B (I + faixa de W em d = bb/2) */
    var LA = a - b, wsF = ridgeStrip.F.ar / LA, wsQ = ridgeStrip.Q.ar / LA;
    add({ id: "CMA", g: "CM", agua: "R", p0: ATOP, p1: P3(a - b / 2, b / 2, hA), nos: xs.map(function (x) { return P3(x, b / 2, hA); }), faces: [{ sl: "F", ws: wsF, wsIn: wsF }, { sl: "B", ws: wsQ, wsIn: wsQ }], artic: true, ends: true, ws: wsF + wsQ, wp: (wsF + wsQ) / sc, d: b / 2, linha: b / 2 });
    var LBm = c - bb, wsI = ridgeStrip.I.ar / LBm, wsWm = ridgeStrip.W.ar / LBm, hB = yD(bb / 2), nosB = zs.map(function (z) { return P3(bb / 2, z, hB); });
    if (!igual) nosB.push(V); nosB.push(P3(bb / 2, b / 2, hB));
    add({ id: "CMB", g: "CM", agua: "R", p0: P3(bb / 2, bb / 2, hB), p1: P3(bb / 2, zE, hB), nos: nosB, faces: [{ sl: "E", ws: wsI, wsIn: wsI }, { sl: "W", ws: wsWm, wsIn: wsWm }], artic: true, ends: true, ws: wsI + wsWm, wp: (wsI + wsWm) / sc, d: bb / 2, linha: bb / 2 });
    /* tirante do caibro oeste (MI) */
    var nosT = []; var sLB = []; for (j = 1; j < 2 * nHB; j++) if (j !== nHB) sLB.push(j <= nHB ? dlB[j] : bb - dlB[2 * nHB - j]);
    sLB.forEach(function (s) { if (s < xs[0] - 1e-6) nosT.push(P3(s, b / 2, Hp)); });
    add({ id: "MIW", g: "MI", plano: "x", agua: "W", p0: P3(0, b / 2, Hp), p1: P3(xs[0], b / 2, Hp), nos: nosT, pinI: true, pinJ: true });
    /* ---------------- linhas longitudinais do banzo inferior (LB; articuladas) ---------------- */
    for (j = 1; j < 2 * nH; j++) {
      var zj = j * dz;
      if (j === nH) { if (xs.length >= 2) add({ id: "LB" + j, g: "LB", uni: true, asa: "A", p0: P3(xs[0], zj, Hp), p1: P3(xs[xs.length - 1], zj, Hp), nos: xs.slice(1, xs.length - 1).map(function (x) { return P3(x, zj, Hp); }), linha: zj }); }
      else add({ id: "LB" + j, g: "LB", uni: true, asa: "A", p0: P3(xs[0], zj, Hp), p1: P3(a, zj, Hp), nos: xs.slice(1).map(function (x) { return P3(x, zj, Hp); }), linha: zj });
    }
    for (j = 1; j < 2 * nHB; j++) {
      var sj = j <= nHB ? dlB[j] : bb - dlB[2 * nHB - j];
      if (j === nHB) { if (zs.length >= 2) add({ id: "LBb" + j, g: "LB", uni: true, asa: "B", p0: P3(sj, zs[0], Hp), p1: P3(sj, zs[zs.length - 1], Hp), nos: zs.slice(1, zs.length - 1).map(function (z) { return P3(sj, z, Hp); }), linha: sj }); }
      else add({ id: "LBb" + j, g: "LB", uni: true, asa: "B", p0: P3(sj, 0, Hp), p1: P3(sj, c, Hp), nos: zs.map(function (z) { return P3(sj, z, Hp); }).concat([P3(sj, b / 2, Hp)]), linha: sj });
    }
    /* ---------------- contraventamento: diagonais em X (só tração) ---------------- */
    var fx = 0, fv = 0, selA = [], selB = [], baiasA = [], baiasB = [], MTp = D().MT.T2;
    for (k = 0; k < xs.length - 1; k++) baiasA.push([xs[k], xs[k + 1]]); for (k = 0; k < zs.length - 1; k++) baiasB.push([zs[k], zs[k + 1]]);
    selA = baiasA.length < 2 ? baiasA : MTp.baiasContraventadas(baiasA).map(function (ix) { return baiasA[ix]; }); selB = baiasB.length < 2 ? baiasB : MTp.baiasContraventadas(baiasB).map(function (ix) { return baiasB[ix]; });
    selA.forEach(function (bay) {
      [["F", 0, 1], ["B", b, -1]].forEach(function (S) {
        var zl = [S[1]], jj; for (jj = 1; jj <= nH; jj++) zl.push(S[1] + S[2] * dlA[jj]);
        zl.slice(0, zl.length - 1).forEach(function (za, q) { var zb = zl[q + 1]; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (dd) { add({ id: "DX" + (++fx), g: "DX", agua: S[0], asa: "A", p0: P3(dd[0], za, yTA(za)), p1: P3(dd[1], zb, yTA(zb)), tracao: true, mad: true }); }); });
      });
      for (k = 1; k < 2 * nH; k++) { var zk = k * dz; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (dd) { add({ id: "DV" + (++fv), g: "DV", asa: "A", p0: P3(dd[0], zk, Hp), p1: P3(dd[1], zk, yTA(zk)), tracao: true, mad: true }); }); }
    });
    selB.forEach(function (bay) {
      [["W", 0, 1], ["I", bb, -1]].forEach(function (S) {
        var xl = [S[1]], jj; for (jj = 1; jj <= nHB; jj++) xl.push(S[1] + S[2] * dlB[jj]);
        xl.slice(0, xl.length - 1).forEach(function (xa, q) { var xb = xl[q + 1]; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (dd) { add({ id: "DX" + (++fx), g: "DX", agua: S[0], asa: "B", p0: P3(xa, dd[0], yTB(xa)), p1: P3(xb, dd[1], yTB(xb)), tracao: true, mad: true }); }); });
      });
      for (k = 1; k < 2 * nHB; k++) { var sk = k <= nHB ? dlB[k] : bb - dlB[2 * nHB - k]; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (dd) { add({ id: "DV" + (++fv), g: "DV", asa: "B", p0: P3(sk, dd[0], Hp), p1: P3(sk, dd[1], yTB(sk)), tracao: true, mad: true }); }); }
    });
    var dpCurto = [];
    if (!p.vedacaoRigida) {
      var fxp = 0;
      EDGES.forEach(function (E) {
        var pares = paineisDP(E.S); if (pares.curto) dpCurto.push(E.id);
        pares.forEach(function (pr) { [[pr[0], pr[1]], [pr[1], pr[0]]].forEach(function (e2) { fxp++; var A = E.t === "x" ? P3(e2[0], E.p0[1], p.baseZ) : P3(E.p0[0], e2[0], p.baseZ), B2 = E.t === "x" ? P3(e2[1], E.p0[1], Hp) : P3(E.p0[0], e2[1], Hp); add({ id: "DP" + fxp, g: "DP", p0: A, p1: B2, tracao: true, mad: true }); }); });
      });
    }
    /* ---------------- nós implícitos: ponta de um membro que cai no EIXO de outro vira nó dele (frechal, cumeeiras, espigões, rincão, terças, tirante) ---------------- */
    var pontas = []; M.forEach(function (m) { if (m.tracao) return; pontas.push(m.p0); pontas.push(m.p1); (m.nos || []).forEach(function (P) { pontas.push(P); }); });
    M.forEach(function (m) {
      if (!/^(FR|E|RC|CM|CB|MI|MS|T|LB)$/.test(m.g)) return;
      var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], vistos = {};
      (m.nos || []).concat([m.p0, m.p1]).forEach(function (P) { vistos[P.map(function (v) { return Math.round(v * 1e3); }).join(",")] = 1; });
      pontas.forEach(function (P) {
        var t = ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / L2; if (t < 1e-6 || t > 1 - 1e-6) return;
        var q = [m.p0[0] + d[0] * t, m.p0[1] + d[1] * t, m.p0[2] + d[2] * t]; if (norm(q, P) > 2e-3) return; var key = P.map(function (v) { return Math.round(v * 1e3); }).join(","); if (vistos[key]) return; vistos[key] = 1; (m.nos = m.nos || []).push(P.slice());
      });
    });
    var G = { p: p, membros: M, info: ext(info, { dpCurto: dpCurto, assento: p.assento, tipologia: "T3L", tesouraTipo: howe ? "howe" : "pratt", xs: xs, zs: zs, nH: nH, nHB: nHB, kB: kB, dz: dz, lp: lp, sc: sc, Hp: Hp, a: a, b: b, c: c, bb: bb, incl: i, beiral: e, tipE: tipE, yD: yD, yT: yTA, yTB: yTB, dlA: dlA, dlB: dlB, igual: igual, V: V, ATOP: ATOP,
      hA: hA, hB: yD(bb / 2), reflexo: [bb, b], La: a - b, Lb: c - bb, xf: xf, zm: zm, pir: false, baias: selA, baiasB: selB, edges: EDGES.map(function (E) { return { id: E.id, p0: E.p0, p1: E.p1, S: E.S, t: E.t }; }), areaPlano: 0 }) };
    G.info.areaTotal = 0; Object.keys(info.areaPlanos).forEach(function (pn) { G.info.areaTotal += info.areaPlanos[pn]; });
    G.info.areaPlantaL = a * b + bb * (c - b); G.info.areaEsperada = (G.info.areaPlantaL + 2 * (a + c) * e + 4 * e * e) * sc;
    return G;
  }

  /* ---------------------------------------------------------------- FONTE (lista de peças) */
  function Lista() {
    var pecas = [];
    return { pecas: pecas, add: function (k) {
      if (k.qtd == null) k.qtd = 1; if (!k.unidade) k.unidade = "peça";
      if (k.p0 && k.p1) { var L = norm(k.p0, k.p1); k.comprimento_m = rd(L, 3); var s = k.secao; if (s) { var A = s.tipo === "ret" ? s.b * s.h : s.tipo === "circ" ? Math.PI * s.d * s.d / 4 : (s.area_media || 0); k.volume_m3 = rd(A * L * k.qtd, 4); } }
      k.p0 = k.p0 ? k.p0.map(function (v) { return rd(v, 4); }) : null; k.p1 = k.p1 ? k.p1.map(function (v) { return rd(v, 4); }) : null; if (k.secao === undefined) k.secao = null; pecas.push(k); return k;
    } };
  }
  function cm(x) { return rd(x * 100, 0); }
  var NOMES = { P: ["Telhado em L — pilares", "Pilar do perímetro"], PO: ["Telhado em L — pilares", "Pilar intermediário de parede"], FR: ["Telhado em L — frechal (anel de 6 lados)", "Frechal em anel (viga de respaldo; cinta nos cantos convexos, sela no côncavo)"],
    BS: ["Tesouras principais", "Banzo superior da tesoura"], BI: ["Tesouras principais", "Banzo inferior (tirante) da tesoura"], PD: ["Tesouras principais", "Montante da tesoura"], DG: ["Tesouras principais", "Diagonal da tesoura"],
    MS: ["Meias-tesouras (cabeceiras)", "Banzo superior da meia-tesoura"], MI: ["Meias-tesouras (cabeceiras)", "Banzo inferior (tirante) da meia-tesoura"], MP: ["Meias-tesouras (cabeceiras)", "Montante da meia-tesoura"], MG: ["Meias-tesouras (cabeceiras)", "Diagonal da meia-tesoura"],
    CB: ["Caibro de meio (cabeceira oeste)", "Caibro de meio da água oeste (do pilar de meio de parede ao topo da cumeeira A)"],
    E: ["Espigões", "Espigão (viga inclinada na aresta saliente)"], RC: ["Rincão (aresta reentrante, com calha)", "Rincão: viga inclinada do canto côncavo à cumeeira B; recebe as terças das duas águas e a CALHA"],
    T: ["Cobertura — terças", "Terça (pontas em bisel contra o espigão ou o rincão)"], CM: ["Cobertura — cumeeiras", "Viga de cumeeira"],
    LB: ["Contraventamento — linhas do banzo inferior", "Linha longitudinal do banzo inferior (6.6.4)"], DX: ["Contraventamento — águas (madeira)", "Diagonal de madeira em X no plano das águas (6.6.2 e 6.6.4)"],
    DV: ["Contraventamento — vertical (madeira)", "Diagonal de madeira em X nos planos verticais entre tesouras (6.6.4, Figura 5)"], DP: ["Contraventamento — paredes (madeira)", "Diagonal de madeira em X nos painéis das paredes (pilar → frechal)"] };
  var LINEAR = { T: 1, CM: 1, FR: 1, LB: 1, E: 1, RC: 1, CB: 1 };
  function lFonte(p, sec, ext2, apar) {
    ext2 = ext2 || {}; var G = lGeometria(p), lista = Lista(), M = G.membros, I = G.info, marcas = {}, ordem = [], cont = {};
    var nomeClasse = String(ext2.classe || "mlc:GL24h").split(":")[1] || "GL24h";
    function put(k) { ["material", "especificacao", "descricao"].forEach(function (c) { if (typeof k[c] === "string") k[c] = k[c].replace(/GL24h/g, nomeClasse); }); return lista.add(k); }
    if (apar) M = apar.membros;
    M.forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g === "DV" ? "DX" : m.g] || {}, L = norm(m.p0, m.p1), linear = !!LINEAR[m.g], key = [m.g, rd(L, 3), linear ? m.id : "", JSON.stringify(s), m.bisel ? 1 : 0].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var r = marcas[key], m = r.m, nm = NOMES[m.g], s = r.sec, linear = !!LINEAR[m.g], forma = s.forma === "circular" ? { tipo: "circ", d: s.d } : { tipo: "ret", b: s.b, h: s.h }, up = T3.upDe(m);
      cont[m.g] = (cont[m.g] || 0) + 1;
      var desc = nm[1]; if (I.tesouraTipo === "howe" && (m.g === "DG" || m.g === "MG")) desc = "Diagonal da " + (m.g === "MG" ? "meia-tesoura" : "tesoura") + " Howe (comprimida sob gravidade)"; if (I.tesouraTipo === "howe" && (m.g === "PD" || m.g === "MP")) desc = "Montante da " + (m.g === "MP" ? "meia-tesoura" : "tesoura") + " Howe (tracionado sob gravidade)";
      var k = { id: linear ? m.id : m.g + cont[m.g], marca: m.g, grupo: nm[0], descricao: desc, material: MLC, especificacao: "MLC GL24h " + (s.forma === "circular" ? "Ø" + cm(s.d) : cm(s.b) + "×" + cm(s.h)) + " cm", secao: forma, p0: m.p0, p1: m.p1, up: up, qtd: r.qtd };
      if (m.bisel) { k.bisel = m.bisel; k.especificacao += "; pontas em bisel (folga ≥ 10 mm, carga só por chapa + pinos)"; }
      if (m.g === "T") k.especificacao += "; extremidades em bisel de 45° em planta (assentam no espigão / no rincão)";
      if (m.g === "RC") k.especificacao += "; face superior com canal para a CALHA do rincão";
      put(k);
    });
    var nTes = M.filter(function (m) { return m.g === "BI"; }).length, nMt = M.filter(function (m) { return m.g === "MI"; }).length, nE = M.filter(function (m) { return m.g === "E"; }).length, nRC = M.filter(function (m) { return m.g === "RC"; }).length, nDX = M.filter(function (m) { return m.g === "DX" || m.g === "DV" || m.g === "DP"; }).length, nCB = M.filter(function (m) { return m.g === "CB"; }).length;
    var nHA = I.nH, nHBt = I.nHB;
    var qtdTes = M.filter(function (m) { return m.g === "BI"; }).reduce(function (s, m) { return s + (m.asa === "B" ? 2 * nHBt * 2 + 2 : 2 * nHA * 2 + 2); }, 0);
    if (nTes) put({ id: "LIG-TES", grupo: "Ligações — tesouras", descricao: "Nós das tesouras principais (asa A e asa B): chapa interna de aço + pinos (grupos dimensionados pela NBR 7190-1)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por nó", secao: null, qtd: qtdTes });
    if (nMt) put({ id: "LIG-MTS", grupo: "Ligações — meias-tesouras", descricao: "Nós das meias-tesouras (leste e norte), tirante oeste e ligação meia-tesoura × tesoura de extremidade: chapa interna + pinos inox", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por nó", secao: null, qtd: 2 * (2 * nHA + 2) + (2 * nHBt + 2) + 2 });
    if (nE) put({ id: "LIG-ESP", grupo: "Ligações — espigões", descricao: "Espigão × cumeeira (ponta) e espigão × canto (frechal + pilar + cinta): chapa interna + pinos inox + cinta de aço", material: INOX, especificacao: "chapa t = 8 mm + pinos inox; cinta de aço galvanizado no canto", secao: null, qtd: nE * 2 });
    if (nRC) put({ id: "LIG-RC", grupo: "Ligações — rincão", descricao: "Rincão × cumeeira B/espigão (ápice, em V) e rincão × canto côncavo (sela de aço sobre o frechal e o pilar do canto, com a calha): chapa interna + pinos inox", material: INOX, especificacao: "chapa t = 8 mm + pinos inox; sela de aço inox no canto côncavo", secao: null, qtd: 2 * nRC * 2 });
    if (nCB) put({ id: "LIG-CB", grupo: "Ligações — caibro de meio", descricao: "Caibro de meio da cabeceira oeste: pé sobre o pilar de meio de parede (sela) e topo na cumeeira A (chapa interna + pinos) e tirante até a primeira tesoura", material: INOX, especificacao: "chapa t = 8 mm + pinos inox", secao: null, qtd: 4 });
    if (nDX) put({ id: "LIG-DX", grupo: "Ligações — contraventamento", descricao: "Pontas das diagonais de madeira do contraventamento: chapa interna de aço + pinos inox (NBR 7190-1:2022, cap. 7)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por ponta de diagonal", secao: null, qtd: nDX * 2 });
    /* CALHA do rincão: calha metálica com 2 abas sobre as terças, comprimento = eixo do rincão (do canto côncavo à ponta do beiral até o vértice V) */
    var rc = M.filter(function (m) { return m.g === "RC"; })[0];
    if (rc) put({ id: "CALHA-RC", grupo: "Cobertura — calha do rincão", descricao: "Calha metálica do rincão (chapa galvanizada, 2 abas sobre as telhas; desenvolvimento ≥ 0,60 m)", material: "chapa de aço galvanizada pré-pintada", especificacao: "calha em V sobre o rincão; trecho do beiral lança para a calha do perímetro", secao: null, p0: rc.p0, p1: rc.p1, qtd: 1, unidade: "m", comprimento_m: rd(norm(rc.p0, rc.p1), 3) });
    return { pecas: lista.pecas, membros: M, info: I };
  }

  var MadT3L = { PADRAO: L_PADRAO, parametros: lParametros, geometria: lGeometria, fonte: lFonte, upDe: T3.upDe, FOLGA: FOLGA, NOMES: NOMES, volumePorMaterial: T3.volumePorMaterial, _util: U, T3: T3, paineisDP: paineisDP };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3L;
  else global.MadT3L = MadT3L;
})(typeof window !== "undefined" ? window : this);

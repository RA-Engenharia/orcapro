/* =====================================================================
 * madt3pranchas.js — PRANCHAS DA T3 (telhado de 4 águas) em MLC. Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo padrão e mesmo carimbo RA da T1/T2 (js/madengpranchas.js, v2.11 do Padrão RA): reaproveita os desenhistas internos (MadEngPranchas._p) e acrescenta só as folhas da T3.
 *   MadEngT3.gerar(res, opcoes) → { ok, folhas, avisos, tabela, marcas }
 * Folhas: E01 planta de cobertura com ESPIGÕES, cumeeira, terças, tesouras e meias-tesouras · E02 elevações (frontal e lateral) · E03 tesoura principal e meia-tesoura ·
 *         E04 detalhes dos 6 nós — sela e cinta do canto, espigão na cumeeira, meia-tesoura × tesoura, ponta da MI no BI, terça no espigão: elevação do nó com CHAPA + PINOS de cada grupo e a FOLGA de 10 mm COTADA, corte e chapa isolada (padrão da E06 da T2) · E05 lista de peças.
 * Peças desenhadas = as APARADAS (res.t3.membros: p0/p1 depois do aparo; o eixo de cálculo fica em eixo0/eixo1).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I, SX = function () { return dep("MadT3Saidas", "./madt3saidas.js"); };
  var VERMELHO = "#c00000";
  var PREF = { P: "PL", PO: "PL", FR: "FR", BS: "BS", BI: "BI", PD: "PD", DG: "DG", MS: "MS", MI: "MI", MP: "MP", MG: "MG", E: "EP", T: "TL", CM: "CM", LB: "LB", DX: "DX", DV: "CV", DP: "CP" };      /* DV e DP são prefixos do DECK na T1 (viga do deck superior, pilarete): na T3 o contraventamento vertical é CV e o das paredes, CP */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { return I.br(v, c); }
  function R(x, n) { var p = Math.pow(10, n == null ? 3 : n); return Math.round(x * p) / p; }

  function contexto(res) {
    var pecas = SX().pecasMembros(res), pcs = Q.desenhaveis(pecas), porId = {}, d = { res: res, pecasM: pecas };
    pecas.forEach(function (p) { porId[p.id] = p; });
    pcs.forEach(function (pc) { var p = porId[pc.id]; pc.g = p.g; pc.tes = p.tes; pc.agua = p.agua; pc.prefixo = PREF[p.g]; });
    d.pcs = pcs; d.marcas = Q.marcar(pcs);
    d.grupo = function () { var gs = Array.prototype.slice.call(arguments); return pcs.filter(function (p) { return gs.indexOf(p.g) >= 0; }); };
    d.pilares = d.grupo("P", "PO"); d.fonteTodos = arr(res.fonte && res.fonte.pecas);
    d.pend = {}; arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    pcs.forEach(function (pc) { if (!pc.marca) pc.marca = d.marcas.porId[pc.id]; });
    return d;
  }
  function eixos(pil, k) {
    var v = []; pil.forEach(function (p) { var x = R(p.p0[k], 3); if (v.indexOf(x) < 0) v.push(x); });
    v.sort(function (a, b) { return a - b; });
    return v.map(function (x, i) { return { v: x, nome: k === 0 ? String(i + 1) : String.fromCharCode(65 + i) }; });
  }
  function camadaDe(pc) { return /^(E|CM|BI|MI|T)$/.test(pc.g) ? "MAD-PRINCIPAL" : "MAD-PECA"; }

  /* ---- E01: planta de cobertura ---- */
  function folhaE01(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t3.info;
    var lista = d.pcs.filter(function (p) { return !/^(PD|DG|MP|MG|DX|DV|DP|LB)$/.test(p.g); });
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA DE COBERTURA - ESPIGÕES, CUMEEIRA, TERÇAS, TESOURAS E MEIAS-TESOURAS", fw: 0.64 }), f3 = pl.f3;
    var ord = { P: 0, PO: 0, FR: 1, T: 2, BS: 2, MS: 2, CM: 3, BI: 3, MI: 3, E: 4 };
    var itens = Q.desenharLista(D, c, lista.slice().sort(function (p, q) { return (ord[p.g] || 0) - (ord[q.g] || 0); }), f3, camadaDe);
    Q.eixosEmPlanta(c, f3, eixos(d.pilares, 0), eixos(d.pilares, 1).slice(0, 0), pl.caixa, 12);
    Q.rotular(c, itens.filter(function (it) { return /^(E|CM|BI|MI|FR)$/.test(it.pc.g); }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return /^(BS|MS|T)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 34 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.prefixo === "PL"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var xr = a.x + a.w * 0.66, yr = a.y + 18;
    var Lg = Q.legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "espigão EP, cumeeira CM, banzos inferiores BI e MI, terças TL" }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL, frechal FR (em anel), banzos superiores BS e MS" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    var yS = yr + Lg + 6, tx = [];
    tx.push("Telhado de 4 águas, i = " + Q.pct(inf.incl) + ", beiral " + br(inf.beiral, 2) + " m nos 4 lados; planta " + br(inf.a, 2) + " x " + br(inf.b, 2) + " m" + (inf.pir ? " (quadrada: pirâmide, sem cumeeira)" : "; cumeeira de " + br(inf.La, 2) + " m") + ".");
    tx.push("Espigões EP1 a EP4 a 45° em planta, do canto à ponta da cumeeira; terças das 4 águas nas mesmas linhas, com ponta em bisel de 45° assentada no espigão (estribo, folga >= 10 mm).");
    tx.push("Frechal FR em anel: para a >= 10 mm do espigão em cada canto; a tração do anel passa pela CINTA de aço (detalhe na folha E04).");
    var yy2 = yS + 4 + D.textos(xr, yS + 4, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 }) + 2;
    Q.tabMarcas(c, xr, yy2 + 4, ["PL", "FR", "EP", "CM", "BS", "BI", "MS", "MI", "TL"].filter(function (mk) { return lista.some(function (p) { return PREF[p.g] === mk; }); }), "QUADRO DE MARCAS DA COBERTURA", 150);
    return { escala: "1:" + pl.esc0 };
  }
  /* ---- vistas: escolhe a escala que cabe e desenha as peças filtradas ---- */
  function vistaPecas(c, lista, plano, x, y, w, h, titulo) {
    var D = c.D, T = D.E.T, xs = [], ys = [], proj = plano === "xz" ? function (P) { return [P[0], P[2]]; } : (plano === "yz" ? function (P) { return [P[1], P[2]]; } : function (P) { return [P[0], P[1]]; });
    lista.forEach(function (pc) { [pc.p0, pc.p1].forEach(function (P) { var q = proj(P); xs.push(q[0]); ys.push(q[1]); }); });
    var x0 = Math.min.apply(null, xs) - 0.4, x1 = Math.max.apply(null, xs) + 0.4, y0 = Math.min.apply(null, ys) - 0.3, y1 = Math.max.apply(null, ys) + 0.4;
    var esc = [20, 25, 30, 40, 50, 75, 100, 150, 200].filter(function (e) { return (x1 - x0) * 1000 / e <= w - 4 && (y1 - y0) * 1000 / e <= h - 12; })[0] || 200, s = 1000 / esc;
    var f3 = function (P) { var q = proj(P); return [x + 2 + (q[0] - x0) * s, y + 8 + (y1 - q[1]) * s]; };
    var hT = I.tituloVista(D, x, y, titulo, "ESC. 1:" + esc);
    var itens = Q.desenharLista(D, c, lista, f3, camadaDe);
    return { f3: f3, itens: itens, esc: esc, x0: x0, x1: x1, y0: y0, y1: y1, s: s };
  }
  function folhaE02(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, tudo = d.pcs.filter(function (p) { return !/^(DX|DV|DP|LB)$/.test(p.g); });
    var h = (a.h - 10) / 2, w = a.w * 0.68;
    var v1 = vistaPecas(c, tudo, "xz", a.x + 4, a.y + 2, w, h, "ELEVAÇÃO FRONTAL (EIXO X) - PROJEÇÃO DE TODAS AS PEÇAS");
    var v2 = vistaPecas(c, tudo, "yz", a.x + 4, a.y + 2 + h + 6, w, h, "ELEVAÇÃO LATERAL (EIXO Z) - PROJEÇÃO DE TODAS AS PEÇAS");
    Q.rotular(c, v1.itens.filter(function (it) { return /^(E|CM|T|FR)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var inf = c.res.t3.info, xr = a.x + w + 12, tx = ["Cumeeira a " + br(inf.yD ? 0 : inf.Hp + inf.incl * inf.b / 2, 2) + " m do piso (pé-direito " + br(inf.Hp - 0, 2) + " m no respaldo).", "Os 4 espigões aparecem em escorço nas duas elevações; as terças são projetadas sobre o plano.", "Elevações cotadas dos planos das tesouras e das meias-tesouras: folha E03."];
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc };
  }
  function folhaE03(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, h = (a.h - 12) / 2, w = a.w * 0.72, tes0 = d.pcs.filter(function (p) { return p.tes === 0 || p.tes == null ? (p.tes === 0) : false; });
    var mt = d.pcs.filter(function (p) { return p.agua === "W" && /^(MS|MI|MP|MG)$/.test(p.g); }).concat(d.pcs.filter(function (p) { return p.g === "P" || p.g === "PO" ? (Math.abs(p.p0[0]) < 1e-6 && Math.abs(p.p0[1] - res.t3.info.b / 2) < 1e-3) : false; }));
    var v1 = vistaPecas(c, tes0.concat(d.pcs.filter(function (p) { return /^(P|PO)$/.test(p.g) && Math.abs(p.p0[0] - res.t3.info.xs[0]) < 1e-3; })), "yz", a.x + 4, a.y + 2, w, h, "TESOURA PRINCIPAL " + (res.t3.info.tesouraTipo === "howe" ? "HOWE" : "PRATT") + " (EIXO X = " + br(res.t3.info.xs[0], 2) + " m) - ELEVAÇÃO");
    var v2 = vistaPecas(c, mt, "xz", a.x + 4, a.y + 2 + h + 8, w, h, "MEIA-TESOURA DA CABECEIRA (EIXO Z = " + br(res.t3.info.b / 2, 2) + " m) - ELEVAÇÃO");
    Q.rotular(c, v1.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 }); Q.rotular(c, v2.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 });
    var xr = a.x + w + 12, tx = ["A diagonal " + (res.t3.info.tesouraTipo === "howe" ? "Howe é comprimida: a ponta é cortada em bisel com folga >= 10 mm das faces do banzo e do montante; a carga passa só pela chapa interna e pelos pinos." : "Pratt é tracionada; o montante é comprimido sob gravidade.") + "", "A meia-tesoura apoia no pilar da parede (heel) e, no cume, na tesoura de extremidade (ponta do banzo superior com folga >= 10 mm, ligação por chapa + pinos).", "Os grupos de pinos de cada nó estão no quadro de ligações (folha E04) e no memorial."];
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc };
  }
  /* ---- E04: detalhes dos nós — planta das folgas (A, B, C) + elevação com chapa e pinos de CADA nó (padrão da E06 da T2: elevação do grupo, corte, chapa isolada), folga de 10 mm cotada ---- */
  function gPinos(nome, pn, S) {
    var cg = pn.centroGrupo || {}, a2 = pn.nc > 1 ? 2 * (cg.a || 0) * 1000 : null, across = S.h * 1000, a4 = a2 == null ? across / 2 : (across - a2) / 2;
    return { nome: nome, d: pn.d * 1000, a1: pn.nr > 1 ? pn.a1 * 1000 : null, a2: a2, a3: pn.a3 * 1000, a3c: pn.a3 * 1000, a4t: a4, a4c: a4, alfa: pn.alfa == null ? Math.PI / 2 : pn.alfa, n: pn.n, nc: pn.nc, nr: pn.nr, eta: pn.eta, ok: pn.ok !== false };
  }
  function posGrupo(pn) { var a1 = Math.round(pn.a1 * 1000), a3 = Math.round(pn.a3 * 1000), a2 = pn.nc > 1 ? Math.round(2 * pn.centroGrupo.a * 1000) : 0, xr = [], zc = [], i, j; for (j = 0; j < pn.nr; j++) xr.push(a3 + j * a1); for (i = 0; i < pn.nc; i++) zc.push((i - (pn.nc - 1) / 2) * a2); return { xr: xr, zc: zc, a1: a1, a3: a3, a2: a2, L: Math.round(pn.comprimento * 1000), d: Math.round(pn.d * 1000) }; }
  /** elevação do NÓ (corte na fenda): a peça A termina a FOLGA da peça B; a chapa interna atravessa a folga (visível) e entra nas duas peças (oculta) com o grupo de pinos de cada uma. Esquema em linha (o ângulo do encontro está nas folhas E01/E03). */
  function elevNo(o) {
    return function (cc, r) {
      var A = o.A, B = o.B, gA = posGrupo(A.pn), gB = posGrupo(B.pn), g = o.gap, hA = Math.round(A.S.h * 1000), hB = Math.round(B.S.h * 1000), hh = Math.max(hA, hB), chW = o.chW, m = 36;
      (cc.cels.pinosDes = cc.cels.pinosDes || []).push({ cod: o.cod, grupo: A.rot, n: gA.xr.length * gA.zc.length, d: gA.d }, { cod: o.cod, grupo: B.rot, n: gB.xr.length * gB.zc.length, d: gB.d });
      var V = Q.vista(cc, r, { x0: -gA.L - m, x1: g + gB.L + m, z0: -hh / 2, z1: hh / 2 }, [14, 14, 14, 24], [5, 10, 20, 25, 50]), xa = function (x) { return -gA.L + x; }, xb = function (x) { return g + gB.L - x; };
      V.fundo(-gA.L - m, -hA / 2, gA.L + m, hA); V.mad(-gA.L - m, -hA / 2, gA.L + m, hA, { horiz: true }); V.vis(-gA.L - m, -hA / 2, gA.L + m, hA, "MAD-PECA");
      V.fundo(g, -hB / 2, gB.L + m, hB); V.mad(g, -hB / 2, gB.L + m, hB, { horiz: true }); V.vis(g, -hB / 2, gB.L + m, hB, "MAD-PECA");
      V.oc(-gA.L, -chW / 2, gA.L, chW); V.oc(g, -chW / 2, gB.L, chW); V.aco(0, -chW / 2, g, chW);
      gA.xr.forEach(function (x) { gA.zc.forEach(function (z) { V.pino(xa(x), z, gA.d, true); }); }); gB.xr.forEach(function (x) { gB.zc.forEach(function (z) { V.pino(xb(x), z, gB.d, true); }); });
      V.cadH([-gA.L].concat(gA.xr.map(xa)).concat([0]), -hh / 2, -6, [String(gA.a3)].concat(gA.xr.slice(1).map(function () { return String(gA.a1); })).concat([String(gA.L - gA.xr[gA.xr.length - 1])]), { semExt: true });
      V.cadH([g].concat(gB.xr.map(xb).reverse()).concat([g + gB.L]), -hh / 2, -6, [String(gB.L - gB.xr[gB.xr.length - 1])].concat(gB.xr.slice(1).map(function () { return String(gB.a1); })).concat([String(gB.a3)]), { semExt: true });
      V.ch(0, g, hh / 2, 9, String(g), { semExt: false });           /* FOLGA CONSTRUTIVA 10 mm, cotada */
      V.tx(-gA.L - m + 4, hh / 2 + 5, A.rot + " (" + gA.xr.length * gA.zc.length + " pinos Ø" + gA.d + ")", null, { al: "L" }); V.tx(g + 6, hh / 2 + 5, B.rot + " (" + gB.xr.length * gB.zc.length + " pinos Ø" + gB.d + ")", null, { al: "L" });
      V.bal(g / 2, chW / 2, 0, -12, 1); V.bal(xa(gA.xr[0]), gA.zc[0], -12, -14, 2);
      return V;
    };
  }
  function corteNo(o) {
    return function (cc, r) {
      var A = o.A, g = posGrupo(A.pn), bw = Math.round(A.S.b * 1000), hh = Math.round(A.S.h * 1000), tch = o.tch, chW = o.chW, V = Q.vista(cc, r, { x0: -20, x1: bw + 20, z0: -hh / 2, z1: hh / 2 }, [18, 18, 8, 14], [5, 10, 20]);
      V.fundo(0, -hh / 2, bw, hh); V.mad(0, -hh / 2, bw, hh, { horiz: true }); V.aco(bw / 2 - tch / 2, -chW / 2, tch, chW);
      g.zc.forEach(function (z) { V.fundo(-12, z - g.d / 2, bw + 24, g.d); V.vis(-12, z - g.d / 2, bw + 24, g.d, "MAD-LIG"); V.ret(-12, z - 15, 12, 30, "MAD-LIG"); V.ret(bw, z - 15, 12, 30, "MAD-LIG"); V.eixoH(-18, bw + 18, z); });
      V.ch(0, bw, hh / 2, 5, String(bw), { semExt: true }); V.cv(hh / 2, -hh / 2, 0, -6, String(hh), { semExt: true }); V.ch(bw / 2 - tch / 2, bw / 2 + tch / 2, -hh / 2, -5, String(tch), { semExt: true });
      if (g.zc.length > 1) V.cv(g.zc[1], g.zc[0], bw, 6, String(g.a2), { semExt: true });
      return V;
    };
  }
  function chapaNo(o) {
    return function (cc, r) {
      var gA = posGrupo(o.A.pn), gB = posGrupo(o.B.pn), g = o.gap, L = gA.L + g + gB.L, chW = o.chW, V = Q.vista(cc, r, { x0: 0, x1: L, z0: -chW / 2, z1: chW / 2 }, [14, 14, 10, 18], [5, 10, 20, 25, 50]);
      V.acoV(0, -chW / 2, L, chW);
      gA.xr.forEach(function (x) { gA.zc.forEach(function (z) { V.furo(x, z, gA.d + 1, true); }); }); gB.xr.forEach(function (x) { gB.zc.forEach(function (z) { V.furo(L - x, z, gB.d + 1, true); }); });
      V.ch(0, L, -chW / 2, -6, String(L), { semExt: true }); V.cv(chW / 2, -chW / 2, 0, -6, String(chW), { semExt: true }); V.ch(gA.L, gA.L + g, chW / 2, 5, String(g), { semExt: false });
      return V;
    };
  }
  /** célula de detalhe do nó: título, elevação (folga cotada), corte, chapa isolada e notas com η */
  function celulaNo(c, x, y, w, h, o) {
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, x + 1, y + 1, o.cod + " - " + o.titulo, null), by = y + ht, bh = h - ht - 2, h1 = Math.round(bh * 0.36), h2 = Math.round(bh * 0.26), hv = 6, escs = [], reg = { cod: o.cod, vistas: [] };
    [["ELEVAÇÃO DO NÓ (corte na fenda; folga " + o.gap + " mm cotada)", elevNo(o), { x: x + 1, y: by, w: w - 2, h: h1 }], ["CORTE (peça " + o.A.rot + ")", corteNo(o), { x: x + 1, y: by + h1 + 2, w: w / 2 - 2, h: h2 }], ["CHAPA DE AÇO (peça isolada)", chapaNo(o), { x: x + w / 2 + 1, y: by + h1 + 2, w: w / 2 - 2, h: h2 }]].forEach(function (v) {
      var rp = v[2], V = v[1](c, { x: rp.x, y: rp.y + hv, w: rp.w, h: rp.h - hv });
      D.texto(rp.x + 0.5, rp.y + 3.4, v[0] + " - ESC 1:" + V.esc, T.nota, { peso: 0.12, attr: ' data-vista="1"' }); reg.vistas.push({ t: v[0], esc: V.esc }); if (escs.indexOf(V.esc) < 0) escs.push(V.esc);
    });
    var yn = by + h1 + h2 + 5, hu = D.textos(x + 1, yn, o.notas, T.nota * 0.92, { wmax: w - 3 });
    if (yn + hu > y + h + 0.5) c.avisos.push("Folha " + c.rotulo + ": a nota de " + o.cod + " passa do painel (" + Math.round(yn + hu - y) + " > " + Math.round(h) + " mm).");
    c.cels.push(reg); return escs;
  }
  function folhaE04(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, I3 = res.t3.info, L3 = (res.ligacoesT3 && res.ligacoesT3.ligacoes) || {}, ps = d.pcs, S = res.secoes, folg = res.aparo && res.aparo.resumo ? res.aparo.resumo : { n: 0, minimo_mm: 0 }, escs = [];
    function perto(P, r) { return ps.filter(function (pc) { var A = pc.p0, B = pc.p1, dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L2 = dx * dx + dy * dy + dz * dz, t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy + (P[2] - A[2]) * dz) / L2)), Q2 = [A[0] + dx * t, A[1] + dy * t, A[2] + dz * t]; return Math.hypot(Q2[0] - P[0], Q2[1] - P[1], Q2[2] - P[2]) < r; }); }
    var larg = 128, h = Math.round(a.h * 0.27);
    var canto = perto([0, 0, I3.Hp], 1.1).filter(function (p) { return !/^(DX|DV|DP|LB|BS|BI|PD|DG)$/.test(p.g); }), apice = perto([I3.xs[0], I3.b / 2, I3.Hp + I3.incl * I3.b / 2], 1.0).filter(function (p) { return !/^(DX|DV|DP|LB|MI|MP|MG|PD|DG)$/.test(p.g); }), ter = perto([I3.dz, I3.dz, I3.Hp + I3.incl * I3.dz], 0.9).filter(function (p) { return /^(E|T)$/.test(p.g); });
    var vs = [[canto, "A - ESPIGÃO NO CANTO (PLANTA)"], [apice, "B - ESPIGÃO NA CUMEEIRA (PLANTA)"], [ter, "C - TERÇA EM BISEL NO ESPIGÃO (PLANTA)"]], alvo = [[0, 0, I3.Hp], [I3.xs[0], I3.b / 2, I3.Hp + I3.incl * I3.b / 2], [I3.dz, I3.dz, I3.Hp + I3.incl * I3.dz]], k;
    for (k = 0; k < 3; k++) {
      var xk = a.x + 2 + k * (larg + 3), v = vistaPecas(c, vs[k][0], "xy", xk, a.y + 2, larg, h, vs[k][1]); Q.rotular(c, v.itens, T.marcaDensa, { umaPorMarca: true, raio: 20 });
      var pt = v.f3(alvo[k]); D.circ(pt[0], pt[1], 4, "MAD-FINA"); D.linha(pt[0] + 3, pt[1] - 3, pt[0] + 14, pt[1] - 16, "MAD-FINA"); escs.push(v.esc);
    }
    var xq = a.x + 2 + 3 * (larg + 3) + 3, wq = a.x + a.w - xq - 2, linhas = [], nome = { espigaoCumeeira: "Espigão x cumeeira", espigaoCanto: "Sela do espigão (canto)", cintaCanto: "Cinta do canto", torcaoFrechal: "Torção do frechal (canto)", meiaTesoura: "Meia-tesoura x tesoura", pontaMI: "Ponta da MI x BI", tercaEspigao: "Terça x espigão (rosca 45°)", tercaEspigaoAxial: "Terça x espigão (estribo)" };
    Object.keys(nome).forEach(function (kk) { var l = L3[kk]; if (!l) return; linhas.push([nome[kk], l.pinos && l.pinos.n ? l.pinos.n + " pinos Ø" + Math.round((l.pinos.d || 0) * 1000) + (l.banzo && l.banzo.BI ? " + " + l.banzo.BI.pinos.n + " no BI" : "") : (l.porApoio ? l.porApoio + " parafusos WT-T" : "-"), I.br(l.eta, 3), l.ok === false ? "NÃO ATENDE" : "ok"]); });
    D.tabela(xq, a.y + 2, [{ t: "LIGAÇÃO" }, { t: "FIXADORES" }, { t: "η" }, { t: "SITUAÇÃO" }], linhas, { fs: T.tabela * 0.85 });
    D.textos(xq, a.y + 2 + 6 * (linhas.length + 2), ["FOLGA CONSTRUTIVA >= 10 mm: " + folg.n + " pontas aparadas (espigão na cumeeira, frechal nos 2 lados do canto, terças em bisel de 45°" + (I3.tesouraTipo === "howe" ? ", diagonais Howe" : "") + "); mínima medida " + br(folg.minimo_mm, 1) + " mm. A carga passa SÓ pelas chapas de aço internas (t = 8 mm), selas/estribos e pinos inox.", "Empuxo horizontal do espigão no canto: " + br(res.espigao && res.espigao.heel ? res.espigao.heel.H : 0, 1) + " kN, resolvido pela tração do anel; a cinta transmite a força de extremidade do frechal (" + br(res.cinta && res.cinta.fim ? res.cinta.fim.N : 0, 1) + " kN)."], T.nota * 0.9, { wmax: wq - 1 });
    /* ---- detalhes: 6 nós, 3 colunas x 2 linhas ---- */
    var y0 = a.y + h + 6, cw = (a.w - 4 - 2 * 3) / 3, ch = (a.h - h - 6 - 2 - 3) / 2, tch = 8;
    function par(cod, titulo, chave, A, B, extra) {
      var l = L3[chave]; if (!l || !l.pinos || !l.pinos.n) return null;
      var pnB = B.pn || (l.banzo && l.banzo.BI ? l.banzo.BI.pinos : l.pinos), chW = Math.max(l.chapa ? l.chapa.largura_mm : 0, l.banzo && l.banzo.BI && l.banzo.BI.chapa ? l.banzo.BI.chapa.largura_mm : 0, 30), gA = gPinos(cod + " " + A.rot, l.pinos, A.S), gB = gPinos(cod + " " + B.rot, pnB, B.S);
      var notas = [{ t: cod + " - " + titulo + ": " + (l.descricao || "") }, "1 - chapa interna de aço t = " + tch + " mm, " + chW + " mm de largura, em fenda nas duas peças; 2 - " + l.pinos.n + " pinos inox A4 Ø" + Math.round(l.pinos.d * 1000) + " em " + A.rot + " e " + pnB.n + " pinos Ø" + Math.round(pnB.d * 1000) + " em " + B.rot + " (esquema em linha; posição e ângulo do encontro: folhas E01 e E03); 3 - FOLGA CONSTRUTIVA de 10 mm entre as peças (cotada): nada encosta, a carga passa só por chapa + pinos; furo da chapa Ø(d + 1).",
        "Espaçamentos real | mínimo (mm) - " + A.rot + ": " + Q.esp2(gA) + (pnB !== l.pinos ? "; " + B.rot + ": " + Q.esp2(gB) : "; a peça hospedeira " + B.rot + " leva o MESMO NÚMERO de pinos (grupo espelhado): o arranjo (a2, a4) se ajusta à seção da hospedeira respeitando os mínimos — a confirmar pelo RT/fabricante") + ". Mínimo: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.", Q.etaLinha(l.pinos, cod + "-pinos", "Pinos em " + A.rot + " (Johansen):")];
      if (pnB !== l.pinos) notas.push(Q.etaLinha(pnB, cod + "-pinos-b", "Pinos em " + B.rot + (l.banzo && l.banzo.BI ? " (força ⊥ às fibras)" : "") + " (Johansen):"));
      var chp = l.banzo && l.banzo.BI && l.banzo.BI.chapa && l.banzo.BI.chapa.eta > (l.chapa ? l.chapa.eta : 0) ? l.banzo.BI.chapa : l.chapa; if (chp) notas.push(Q.etaLinha(chp, cod + "-chapa", "Chapa (NBR 8800: bruta, líquida fu/1,35 e esmagamento):"));
      (extra || []).forEach(function (t) { notas.push(t); });
      return { cod: cod, titulo: titulo, A: { pn: l.pinos, S: A.S, rot: A.rot }, B: { pn: pnB, S: B.S, rot: B.rot }, gap: 10, chW: chW, tch: tch, notas: notas };
    }
    var folgaTxt = function (re) { var m = Infinity; (res.aparo ? res.aparo.folgas : []).forEach(function (f) { if (re.test(f.peca) && f.folga_mm < m) m = f.folga_mm; }); return isFinite(m) ? "Folga mínima medida no modelo aparado: " + br(m, 1) + " mm (>= 10 mm)." : "Folga de projeto: 10 mm (peça aparada na obra)."; };
    var hostApice = S.CM ? { rot: "CM", S: S.CM } : { rot: "BS", S: S.BS }, ms = L3.espigaoCanto && L3.espigaoCanto.momentoSela;
    var cels = [
      par("N1", "SELA DO ESPIGÃO NO CANTO", "espigaoCanto", { rot: "EP", S: S.E }, { rot: "FR", S: S.FR }, [{ t: (ms ? "Momento da sela M = N·δ = " + br(ms.M_d_kNm, 2) + " kN·m (δ = h_FR/2 = " + br(ms.delta_m * 100, 0) + " cm) no grupo de pinos; " : "") + "arrancamento " + br(L3.espigaoCanto ? L3.espigaoCanto.arrancamento_kN : 0, 2) + " kN (inclui a faixa de aresta, cpe local -1,2, a confirmar pelo RT). " + folgaTxt(/^FR\d\/(ini|fim)/) }]),
      par("N2", "CINTA DO CANTO (FRECHAL X FRECHAL)", "cintaCanto", { rot: "FR", S: S.FR }, { rot: "FR", S: S.FR }, [{ t: "Força de EXTREMIDADE do frechal no canto: " + br(L3.cintaCanto ? L3.cintaCanto.N_fim_kN : 0, 1) + " kN. Os dois frechais param a >= 10 mm do espigão. " + folgaTxt(/^FR\d\/(ini|fim)/) }]),
      par("N3", "ESPIGÃO NA CUMEEIRA", "espigaoCumeeira", { rot: "EP", S: S.E }, hostApice, [{ t: "Ponta do espigão aparada a >= 10 mm das faces de cumeeira, banzos, meia-tesoura e dos outros espigões; envolvente dos modelos (a) e (b). " + folgaTxt(/^E\d$/) }]),
      par("N4", "MEIA-TESOURA X TESOURA DE EXTREMIDADE", "meiaTesoura", { rot: "MS", S: S.MS }, { rot: "BS", S: S.BS }, [{ t: "Ponta do banzo superior da meia-tesoura a >= 10 mm das faces dos banzos da tesoura. Folga de projeto: 10 mm." }]),
      par("N5", "PONTA DA MI NO BI (NÓ CENTRAL)", "pontaMI", { rot: "MI", S: S.MI }, { rot: "BI", S: S.BI }, [{ t: "Ligação própria: N da MI = " + br(L3.pontaMI ? L3.pontaMI.F_d : 0, 1) + " kN + montante do mesmo nó = " + br(L3.pontaMI ? L3.pontaMI.montante_kN : 0, 1) + " kN; resultante ⊥ às fibras do BI = " + br(L3.pontaMI ? L3.pontaMI.resultante_perp_kN : 0, 1) + " kN. Folga de projeto: 10 mm." }]),
      par("N6", "TERÇA NO ESPIGÃO (ESTRIBO)", "tercaEspigaoAxial", { rot: "TL", S: S.T }, { rot: "EP", S: S.E }, [{ t: "Terça em bisel de 45° em planta, a >= 10 mm do espigão, em estribo de aço; rosca total a 45°: " + (L3.tercaEspigao ? L3.tercaEspigao.porApoio + " parafusos WT-T por apoio (eta " + br(L3.tercaEspigao.eta, 3) + ")" : "") + ". " + folgaTxt(/^T[FBWE]\d\/(ini|fim)/) }])
    ].filter(function (o) { return !!o; });
    cels.forEach(function (o, i) { escs = escs.concat(celulaNo(c, a.x + 2 + (i % 3) * (cw + 3), y0 + Math.floor(i / 3) * (ch + 3), cw, ch, o)); });
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "INDICADA" };
  }
  function folhaE05(c) { return Q.folhaE10(c); }

  function gerar(res, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    var P = Q.PR(); if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || res.tipologia !== "T3" || !res.t3 || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes || !res.secoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo da T3 sem fonte/ligações: não há pranchas."] };
    var E = I.estilo(opcoes.padrao);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA"), codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-T3", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var classe = Q.txt(opcoes.classe) || Q.classeDe((arr(res.fonte.pecas).filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h");
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [] }; ctx0.d = contexto(res); ctx0.pend = ctx0.d.pend;
    var ORDEM = [["E01", "cobertura", folhaE01, null, "PLANTA DE COBERTURA - ESPIGÕES, CUMEEIRA, TERÇAS, TESOURAS E MEIAS-TESOURAS"], ["E02", "elevacoes", folhaE02, null, "ELEVAÇÕES FRONTAL E LATERAL"], ["E03", "tesouras", folhaE03, null, "TESOURA PRINCIPAL E MEIA-TESOURA - ELEVAÇÕES"], ["E04", "nos", folhaE04, null, "DETALHES DOS NÓS - ESPIGÃO NO CANTO E NA CUMEEIRA, TERÇA EM BISEL, CINTA"], ["E10", "pecas", folhaE05, null, "LISTA DE PEÇAS POR POSIÇÃO"]];
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = "0" + (i + 1);
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: def[4] });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madt3pranchas", nome: "Estrutura de madeira engenharada (T3, 4 águas) - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt((opcoes.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + (opcoes.obra || "")), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var notas = [{ t: "Telhado de 4 águas (T3). Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho." }, { t: "Marca da peça: {marca} - MLC " + classe + " - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC." }, { t: "Pontas aparadas com folga >= 10 mm: a carga passa só por chapa de aço interna (t = 8 mm), sela/estribo e pinos inox. Tratamento NBR 16143 conforme a tabela E10." }, { t: "Vento em 4 águas: premissa da Tabela 5 da NBR 6123 (duas águas), a confirmar pelo RT." }, { t: SX().EXIGENCIA }, { t: "VERMELHO = o que impede emitir: não fabricar nem comprar o item antes de resolver." }];
    var blocos = [{ titulo: "NOTAS GERAIS", itens: notas }];
    var camadas = {}; Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = Q.MP.PADRAO_MAD.camadas[k]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (k) { camadas[k] = Q.PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      try { I.colunaNotas(Fd, geo, blocos); } catch (e) { avisos.push("Notas: " + e.message); }
      var rotuloFolha = f.rotulo + "/05"; I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(((opcoes.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + SX().FAIXA)) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, celulas: ctx0.cels, tabela: ctx0.d.marcas.tab, marcas: ctx0.d.marcas.porId, desenhaveis: ctx0.d.pcs };
  }

  var MadEngT3 = { gerar: gerar, contexto: contexto, _i: { elevNo: elevNo, corteNo: corteNo, chapaNo: chapaNo, vistaPecas: vistaPecas, celulaNo: celulaNo, gPinos: gPinos, posGrupo: posGrupo, camadaDe: camadaDe, eixos: eixos } };
  global.MadEngT3 = MadEngT3;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT3;
})(typeof window !== "undefined" ? window : this);

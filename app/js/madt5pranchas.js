/* =====================================================================
 * madt5pranchas.js — PRANCHAS DA T5 (pergolado de MLC, livre ou encostado) no carimbo RA. Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo padrão e mesmo carimbo da T1/T2/T3 (js/madengpranchas.js, Padrão RA v2.11): reaproveita os desenhistas internos (MadEngPranchas._p) e acrescenta só as folhas da T5.
 *   MadEngT5.gerar(res, opcoes) → { ok, folhas, avisos, tabela, marcas, ... }
 * Folhas: E01 planta (PL, VP, VS, RP, MF tracejada, eixos, cotas; parede hachurada quando encostado) · E02 elevações frontal (X–altura) e lateral (Z–altura) com níveis, inclinação, pé-direito, balanços e mãos-francesas ·
 *         E03 detalhes dos nós: cabeça do pilar, MF × pilar, MF × viga/caibro, base, caibro × viga principal, [parede] — elevação com CHAPA + PINOS pela geometria do grupo (n, nc, nr, d, a1, a3 do resultado),
 *         FOLGA de 10 mm COTADA, corte e chapa isolada (padrão da E04 da T3) · E04 lista de peças + quadro de ferragens.
 * Peças desenhadas = as APARADAS (res.t5.membros: p0/p1 depois do aparo; o eixo de cálculo fica em eixo0/eixo1). Pontos [X, Z, altura]: X no vão (caibros), Z no comprimento (vigas principais).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I;
  var SX = function () { return dep("MadT5Saidas", "./madt5saidas.js"); }, SE = function () { return dep("MadEngSaidas", "./madengsaidas.js"); };
  var VERMELHO = "#c00000", TCH = 8;
  var PREF = { P: "PL", VP: "VP", VS: "VS", MF: "MF", RP: "RP" };
  var NOME = { PL: "pilar", VP: "viga principal", VS: "viga secundária (caibro)", MF: "mão-francesa", RP: "ripa" };
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { return I.br(v, c); }
  function R(x, n) { var p = Math.pow(10, n == null ? 3 : n); return Math.round(x * p) / p; }
  function mm(v) { return Math.round(v * 1000); }

  function contexto(res) {
    var pecas = SX().pecasMembros(res), pcs = Q.desenhaveis(pecas), porId = {}, membros = {}, d = { res: res, pecasM: pecas };
    pecas.forEach(function (p) { porId[p.id] = p; });
    arr(res.t5.membros).forEach(function (m) { membros[m.id] = m; });
    pcs.forEach(function (pc) { var p = porId[pc.id]; pc.g = p.g; pc.prefixo = PREF[p.g]; pc.m = membros[pc.id] || null; });
    d.pcs = pcs; d.marcas = Q.marcar(pcs);
    d.grupo = function () { var gs = Array.prototype.slice.call(arguments); return pcs.filter(function (p) { return gs.indexOf(p.g) >= 0; }); };
    d.pilares = d.grupo("P"); d.fonteTodos = arr(res.fonte && res.fonte.pecas);
    d.pend = {}; arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    pcs.forEach(function (pc) { pc.marca = d.marcas.porId[pc.id]; });
    return d;
  }
  function eixos(pil, k) {
    var v = []; pil.forEach(function (p) { var x = R(p.p0[k], 3); if (v.indexOf(x) < 0) v.push(x); });
    v.sort(function (a, b) { return a - b; });
    return v.map(function (x, i) { return { v: x, nome: k === 0 ? String(i + 1) : String.fromCharCode(65 + i) }; });
  }
  function camadaDe(pc) { return pc.g === "VP" ? "MAD-PRINCIPAL" : (pc.g === "MF" ? "MAD-OCULTA" : (pc.g === "RP" ? "MAD-FINA" : "MAD-PECA")); }
  function cm(v) { return String(Math.round(v * 100)); }
  function peDireito(inf, x) { return Math.abs(x - 0) < 1e-6 ? inf.Hh : inf.Hl; }

  /* ---- planta: escala própria (1:20 a 1:100) — o Padrão da T1 só lista 1:50 e 1:100 e deixaria o pergolado pequeno na folha ---- */
  function planta(c, lista, o) {
    var D = c.D, a = c.geo.area, cx = Q.caixaPontos(lista), W = cx.x1 - cx.x0, H = cx.y1 - cx.y0;
    var disp = [a.x + 4, a.y + 18, a.x + a.w * (o.fw || 0.62), a.y + a.h - 2], mx = o.mx || 40, my = o.my || 40;
    var esc0 = I.escolher([20, 25, 30, 40, 50, 75, 100], function (e) { var s = 1000 / e; return W * s + 2 * mx <= disp[2] - disp[0] && H * s + 2 * my <= disp[3] - disp[1]; }), s = 1000 / esc0;
    var ox = disp[0] + mx, oy = disp[1] + my, f3 = Q.planoXY(s, ox, oy, cx.x0, cx.y1);
    I.tituloVista(D, a.x + 4, a.y + 2, o.tit, "ESC 1:" + esc0);
    return { f3: f3, s: s, esc0: esc0, cx: cx, caixa: [ox, oy, ox + W * s, oy + H * s], disp: disp };
  }

  /* ---- E01: planta ---- */
  function folhaE01(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t5.info, P5 = res.t5.params, L5 = (res.ligacoesT5 && res.ligacoesT5.ligacoes) || {}, e = 12;
    var pl = planta(c, d.pcs, { tit: "PLANTA - PILARES, VIGAS PRINCIPAIS, CAIBROS, RIPAS E MÃOS-FRANCESAS", fw: 0.62 }), f3 = pl.f3, s = pl.s, cx = pl.caixa;
    if (inf.encostado) {
      var w0 = 0.2, xa = inf.ladoEnc === "alto" ? inf.xa - w0 : inf.xb, A = f3([xa, inf.zN + 0.3, 0]), B = f3([xa + w0, inf.z0 - 0.3, 0]);
      D.ret(A[0], A[1], B[0] - A[0], B[1] - A[1], "MAD-CONTEXTO"); D.hachura(A[0], A[1], B[0] - A[0], B[1] - A[1], 2.4, "MAD-CONTEXTO");
    }
    var ord = { RP: 0, VS: 1, MF: 2, VP: 3, P: 4 }, itens = Q.desenharLista(D, c, d.pcs.slice().sort(function (p, q) { return ord[p.g] - ord[q.g]; }), f3, camadaDe);
    Q.eixosEmPlanta(c, f3, eixos(d.pilares, 0), eixos(d.pilares, 1), cx, e);
    /* cotas gerais: X embaixo (balanços e vão), Z à direita (balanços e vãos entre pilares) + total */
    var rb = D.raioBalao("1"), xs = [inf.xa].concat(inf.linhas).concat([inf.xb]), zs = [inf.z0].concat(inf.zP).concat([inf.zN]), yb = cx[3] + e + 2 * rb + 2, xr = cx[2] + e + 2 * rb + 2;
    xs = xs.filter(function (v, i) { return i === 0 || Math.abs(v - xs[i - 1]) > 1e-6; });
    if (xs.length > 1) D.cadeia(xs.map(function (v) { return [f3([v, 0, 0])[0], yb]; }), -6, xs.slice(1).map(function (v, i) { return cm(v - xs[i]); }), { semExt: true });
    if (zs.length > 1) D.cadeia(zs.map(function (v) { return [xr, f3([0, v, 0])[1]]; }).reverse(), 6, zs.slice(1).map(function (v, i) { return cm(v - zs[i]); }).reverse(), { semExt: true });
    D.cota(cx[0], cx[3] + e + 2 * rb + 14, cx[2], cx[3] + e + 2 * rb + 14, -3, cm(inf.xb - inf.xa), { semExt: true });
    D.cota(xr + 14, cx[1], xr + 14, cx[3], -3, cm(inf.zN - inf.z0), { semExt: true });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "VP"; }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "P"; }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "MF"; }), T.marcaDensa, { umaPorMarca: true, raio: 60 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "VS"; }), T.marcaDensa, { umaPorMarca: true, raio: 70 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "RP"; }), T.marcaDensa, { umaPorMarca: true, raio: 90 });
    var xl = a.x + a.w * 0.66, yl = a.y + 18;
    var leg = [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "viga principal VP" }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL e viga secundária (caibro) VS" }, { tipo: "ret", cam: "MAD-OCULTA", t: "mão-francesa MF (tracejada: abaixo das vigas)" }];
    if (inf.ripa) leg.push({ tipo: "ret", cam: "MAD-FINA", t: "ripa RP (acima dos caibros)" });
    if (inf.encostado) leg.push({ tipo: "ret", cam: "MAD-CONTEXTO", t: "parede/viga existente (fora do escopo)" });
    leg.push({ tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" });
    var Lg = Q.legenda(D, xl, yl, leg, T.nota * 0.9), yS = yl + Lg + 6, tx = [];
    tx.push("Pergolado " + (inf.encostado ? "ENCOSTADO numa parede/viga existente (lado " + (inf.ladoEnc === "alto" ? "alto" : "baixo") + ")" : "LIVRE (dois alinhamentos de pilares)") + ": vão " + br(inf.vao, 2) + " m (caibros) x comprimento " + br(inf.comp, 2) + " m (vigas principais); " + inf.nPilares + " pilares, " + inf.nCaibros + " caibros (máx. " + br(res.t5.params.sCaibro * 100, 0) + " cm)" + (inf.ripa ? ", " + inf.ripa.n + " ripas a " + br(inf.ripa.s * 100, 0) + " cm" : "") + ".");
    tx.push(P5.comCob ? "Cobertura leve (" + (P5.cobertura && P5.cobertura.tipo) + ") inclinada " + Q.pct(inf.incl) + ", área " + br(inf.areaCob, 1) + " m²; vão e fixação da placa: do fabricante." : "Sem cobertura: só sombreamento (ripado).");
    tx.push("Mão-francesa de " + br(inf.mfD, 2) + " m nas duas direções" + (inf.encostado ? " (só no plano das vigas principais: a parede trava a direção dos caibros)" : "") + ", ponta APARADA a >= 10 mm do pilar e da viga/caibro: a carga passa só por chapa interna e pinos (detalhes na folha E03).");
    if (inf.encostado && L5.parede) tx.push("Ligação na parede: estribo de aço (chapa interna t = 8 mm em fenda no caibro) + " + (L5.parede.chumbadores ? L5.parede.chumbadores.n + " chumbadores químicos M" + mm(L5.parede.chumbadores.d) : "chumbadores") + " por caibro. A capacidade da parede e do substrato é do RT: reações no detalhe da folha E03.");
    var yy2 = yS + 4 + D.textos(xl, yS + 4, tx, T.nota * 0.9, { wmax: a.x + a.w - xl - 3 }) + 2;
    Q.tabMarcas(c, xl, yy2 + 4, ["PL", "VP", "VS", "MF", "RP"].filter(function (mk) { return d.pcs.some(function (p) { return p.prefixo === mk; }); }), "QUADRO DE MARCAS", 150);
    return { escala: "1:" + pl.esc0 };
  }

  /* ---- vista em elevação com espaço para as cotas ---- */
  function elevacao(c, lista, plano, x, y, w, h, titulo, pad) {
    var D = c.D, proj = plano === "xz" ? function (P) { return [P[0], P[2]]; } : function (P) { return [P[1], P[2]]; }, xs = [], zs = [0], hT = 11;
    lista.forEach(function (pc) { I.caixaPeca(pc).cantos.forEach(function (P) { var q = proj(P); xs.push(q[0]); zs.push(q[1]); }); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    var esc = I.escolher([20, 25, 30, 40, 50, 75, 100, 150], function (e) { return (x1 - x0) * 1000 / e + pad[0] + pad[1] <= w && (z1 - z0) * 1000 / e + pad[2] + pad[3] + hT <= h; }), s = 1000 / esc;
    var f3 = function (P) { var q = proj(P); return [x + pad[0] + (q[0] - x0) * s, y + hT + pad[2] + (z1 - q[1]) * s]; };
    I.tituloVista(D, x, y, titulo, "ESC 1:" + esc);
    var g0 = f3([x0, x0, 0])[1]; D.linha(x + pad[0] - 6, g0, x + pad[0] + (x1 - x0) * s + 6, g0, "MAD-CONTEXTO");
    D.hachura(x + pad[0] - 6, g0, (x1 - x0) * s + 12, 3, 1.6, "MAD-CONTEXTO");
    return { f3: f3, esc: esc, s: s, x0: x0, x1: x1, z0: z0, z1: z1, gY: g0, xL: x + pad[0], xR: x + pad[0] + (x1 - x0) * s, topY: f3([0, 0, z1])[1] };
  }
  function folhaE02(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, inf = res.t5.info, pil0 = inf.zP[0], k = 1e-6;
    var h = (a.h - 6) / 2, w = a.w * 0.70, pad = [30, 30, 30, 34];
    var fr = d.pcs.filter(function (p) { return (p.g === "P" || p.g === "VS" || (p.g === "MF" && p.m && p.m.sub === "MX")) ? Math.abs(p.p0[1] - pil0) < k : (p.g === "VP" || p.g === "RP"); });
    var v1 = elevacao(c, fr, "xz", a.x + 4, a.y + 2, w, h, "ELEVAÇÃO FRONTAL (PLANO X - ALTURA), EIXO " + eixos(d.pilares, 1)[0].nome, pad), f1 = v1.f3;
    var it1 = Q.desenharLista(D, c, fr, f1, camadaDe);
    var lat = d.pcs.filter(function (p) { return p.g === "P" || p.g === "VP" || (p.g === "MF" && p.m && p.m.sub === "MZ"); });
    var v2 = elevacao(c, lat, "yz", a.x + 4, a.y + 2 + h + 6, w, h, "ELEVAÇÃO LATERAL (PLANO Z - ALTURA)", pad), f2 = v2.f3;
    var it2 = Q.desenharLista(D, c, lat, f2, camadaDe);
    Q.rotular(c, it1.filter(function (it) { return it.pc.g === "P" || it.pc.g === "VP" || it.pc.g === "VS"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, it1.filter(function (it) { return it.pc.g === "MF"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, it2.filter(function (it) { return it.pc.g === "P" || it.pc.g === "VP"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, it2.filter(function (it) { return it.pc.g === "MF"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    /* --- frontal: níveis, pé-direito dos dois lados, balanços, inclinação --- */
    var A0 = f1([0, 0, 0]), A1 = f1([0, 0, inf.Hh]), B0 = f1([inf.vao, 0, 0]), B1 = f1([inf.vao, 0, inf.Hl]), xa = f1([inf.xa, 0, 0])[0], xb = f1([inf.xb, 0, 0])[0];
    D.cota(A0[0], A0[1], A1[0], A1[1], (A0[0] - xa) + 12, cm(inf.Hh), { semExt: false });
    D.cota(B0[0], B0[1], B1[0], B1[1], -((xb - B0[0]) + 12), cm(inf.Hl), { semExt: false });
    var xs = [inf.xa].concat(inf.linhas).concat([inf.xb]); xs = xs.filter(function (v, i) { return i === 0 || Math.abs(v - xs[i - 1]) > 1e-6; });
    D.cadeia(xs.map(function (v) { return [f1([v, 0, 0])[0], v1.gY]; }), -9, xs.slice(1).map(function (v, i) { return cm(v - xs[i]); }), { semExt: false });
    D.nivel(A0[0] - 28, A0[1] + 0.2, "±0,00", 1, ' data-nivel="1"');
    D.nivel(A1[0] - 30, A1[1] - 0.2 + 4, "+" + br(inf.Hh, 2), 1, ' data-nivel="1"');
    D.nivel(B1[0] + 22, B1[1] + 4, "+" + br(inf.Hl, 2), 1, ' data-nivel="1"');
    var ti = v1.xL + 8, tj = v1.topY - 14;
    D.linha(ti, tj, ti + 20, tj, "MAD-FINA"); D.linha(ti + 20, tj, ti + 20, tj + 20 * inf.incl * (inf.Hh > inf.Hl ? 1 : -1), "MAD-FINA"); D.linha(ti, tj, ti + 20, tj + 20 * inf.incl * (inf.Hh > inf.Hl ? 1 : -1), "MAD-PECA");
    D.texto(ti + 24, tj + 1.5, "i = " + Q.pct(inf.incl) + " (" + br(Math.atan(inf.incl) * 180 / Math.PI, 1) + "°), caimento para o lado " + (inf.Hh > inf.Hl ? "baixo (X = " + br(inf.vao, 2) + " m)" : "alto"), T.nota, {});
    /* --- lateral: balanços/vãos entre pilares, pé-direito --- */
    var zz = [inf.z0].concat(inf.zP).concat([inf.zN]);
    D.cadeia(zz.map(function (v) { return [f2([0, v, 0])[0], v2.gY]; }), -9, zz.slice(1).map(function (v, i) { return cm(v - zz[i]); }), { semExt: false });
    var C0 = f2([0, inf.z0, 0]), C1 = f2([0, inf.z0, inf.Hh]), E0 = f2([0, inf.zN, 0]), E1 = f2([0, inf.zN, inf.Hl]);
    D.cota(C0[0], C0[1], C1[0], C1[1], 12, cm(inf.Hh) + " (lado alto)", { semExt: false });
    D.cota(E0[0], E0[1], E1[0], E1[1], -12, cm(inf.Hl) + " (lado baixo)", { semExt: false });
    var xr = a.x + w + 12, tx = [], mf = d.pcs.filter(function (p) { return p.g === "MF"; })[0];
    tx.push("Níveis em metros, cotas em centímetros. Pé-direito de " + br(inf.Hh, 2) + " m no lado alto e " + br(inf.Hl, 2) + " m no lado baixo (inclinação " + Q.pct(inf.incl) + (res.t5.params.comCob ? ", cobertura leve" : ", só ripado") + ").");
    tx.push("Balanço do caibro " + br(res.t5.params.balCaibro, 2) + " m e da viga principal " + br(res.t5.params.balViga, 2) + " m; caibros a no máximo " + br(res.t5.params.sCaibro * 100, 0) + " cm.");
    tx.push("Mãos-francesas: projeção de " + br(inf.mfD, 2) + " m do pilar" + (mf ? ", seção " + mf.secao.b * 100 + "x" + mf.secao.h * 100 + " cm" : "") + ", pontas aparadas (peça desenhada = a aparada; o eixo de cálculo vai ao pilar e à viga). Base rotulada: a fundação recebe só força, sem momento.");
    tx.push("Frontal: caibros VS e mãos-francesas MF no alinhamento " + eixos(d.pilares, 1)[0].nome + "; vigas principais e ripas em seção. Lateral: os caibros e as ripas aparecem na planta (E01) e na frontal.");
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc + " e 1:" + v2.esc };
  }

  /* ================== E03: detalhes dos nós ================== */
  function gPinos(nome, pn, S) {
    var cg = pn.centroGrupo || {}, a2 = pn.nc > 1 ? 2 * (cg.a || 0) * 1000 : null, across = S.h * 1000, a4 = a2 == null ? across / 2 : (across - a2) / 2;
    return { nome: nome, d: pn.d * 1000, a1: pn.nr > 1 ? pn.a1 * 1000 : null, a2: a2, a3: pn.a3 * 1000, a3c: pn.a3 * 1000, a4t: a4, a4c: a4, alfa: pn.alfa == null ? Math.PI / 2 : pn.alfa, n: pn.n, nc: pn.nc, nr: pn.nr, eta: pn.eta, ok: pn.ok !== false };
  }
  function posGrupo(pn) {   /* grupo recusado pelo cálculo (n = 0, sem a1/a3/comprimento): fica vazio e a ligação sai em vermelho nas notas */
    var vazio = !(pn.n > 0), a1 = Math.round((pn.a1 || 0) * 1000), a3 = Math.round((pn.a3 || 0) * 1000), a2 = pn.nc > 1 && pn.centroGrupo ? Math.round(2 * pn.centroGrupo.a * 1000) : 0, xr = [], zc = [], i, j;
    if (!vazio) { for (j = 0; j < pn.nr; j++) xr.push(a3 + j * a1); for (i = 0; i < pn.nc; i++) zc.push((i - (pn.nc - 1) / 2) * a2); }
    return { xr: xr, zc: zc, a1: a1, a3: a3, a2: a2, L: Math.round((pn.comprimento || 0) * 1000), d: Math.round(pn.d * 1000) };
  }
  function espTxt(nome, pn, S) { return pn.n > 0 ? Q.esp2(gPinos(nome, pn, S)) : "grupo RECUSADO pelo cálculo (n = 0)"; }
  function npinos(g) { return g.xr.length * g.zc.length; }
  function registra(o, rot, n, esp) { (o.reg.pinos = o.reg.pinos || []).push({ cod: o.cod, rot: rot, desenhados: n, esperado: esp }); }
  /** elevação do NÓ em linha: peça A, FOLGA g, peça B; a chapa interna atravessa a folga e entra nas duas peças com o grupo de pinos de cada uma (esquema em linha: ângulo do encontro nas folhas E01/E02) */
  function elevNo(o, A, B) {
    return function (cc, r) {
      var gA = posGrupo(A.pn), gB = posGrupo(B.pn), g = o.gap, hA = Math.round(A.S.h * 1000), hB = Math.round(B.S.h * 1000), hh = Math.max(hA, hB), chW = o.chW, m = 36, nA = 0, nB = 0, LA = Math.max(gA.L, 300), LB = Math.max(gB.L, 300);
      var V = Q.vista(cc, r, { x0: -LA - m, x1: g + LB + m, z0: -hh / 2, z1: hh / 2 }, [14, 14, 14, 24], [5, 10, 20, 25, 50]), xa = function (x) { return -gA.L + x; }, xb = function (x) { return g + gB.L - x; };
      V.fundo(-LA - m, -hA / 2, LA + m, hA); V.mad(-LA - m, -hA / 2, LA + m, hA, { horiz: true }); V.vis(-LA - m, -hA / 2, LA + m, hA, "MAD-PECA");
      V.fundo(g, -hB / 2, LB + m, hB); V.mad(g, -hB / 2, LB + m, hB, { horiz: true }); V.vis(g, -hB / 2, LB + m, hB, "MAD-PECA");
      V.oc(-gA.L, -chW / 2, gA.L, chW); V.oc(g, -chW / 2, gB.L, chW); if (g > 0) V.aco(0, -chW / 2, g, chW);
      gA.xr.forEach(function (x) { gA.zc.forEach(function (z) { V.pino(xa(x), z, gA.d, true); nA++; }); }); gB.xr.forEach(function (x) { gB.zc.forEach(function (z) { V.pino(xb(x), z, gB.d, true); nB++; }); });
      registra(o, A.rot, nA, A.pn.n); registra(o, B.rot, nB, B.pn.n);
      if (gA.xr.length) V.cadH([-gA.L].concat(gA.xr.map(xa)).concat([0]), -hh / 2, -6, [String(gA.a3)].concat(gA.xr.slice(1).map(function () { return String(gA.a1); })).concat([String(gA.L - gA.xr[gA.xr.length - 1])]), { semExt: true });
      var peq = V.k * (LA + g + LB + 2 * m) < 130;   /* desenho pequeno no papel: a cadeia da peça B desce uma linha e o rótulo de B fica alinhado à direita, para nada se tocar */
      if (gB.xr.length) V.cadH([g].concat(gB.xr.map(xb).reverse()).concat([g + gB.L]), -hh / 2, peq ? -12 : -6, [String(gB.L - gB.xr[gB.xr.length - 1])].concat(gB.xr.slice(1).map(function () { return String(gB.a1); })).concat([String(gB.a3)]), { semExt: true });
      if (g > 0) V.ch(0, g, hh / 2, 9, String(g), { semExt: false });
      V.tx(-LA - m + 4, hh / 2 + 5, A.rot + (nA ? " (" + nA + " pinos Ø" + gA.d + ")" : " (0)"), null, { al: "L" }); if (peq) V.tx(g + LB + m - 4, hh / 2 + 5 + 3.8 / V.k, B.rot + (nB ? " (" + nB + " pinos Ø" + gB.d + ")" : " (0)"), null, { al: "D" }); else V.tx(g + 6, hh / 2 + 5, B.rot + (nB ? " (" + nB + " pinos Ø" + gB.d + ")" : " (0)"), null, { al: "L" });
      if (g > 0) V.bal(g / 2, chW / 2, 0, -12, 1); if (gA.xr.length) V.bal(xa(gA.xr[0]), gA.zc[0], -12, -14, 2);
      return V;
    };
  }
  /** corte transversal da peça A no plano do grupo (chapa em fenda, pinos atravessando) */
  function corteNo(o, A) {
    return function (cc, r) {
      var g = posGrupo(A.pn), bw = Math.round(A.S.b * 1000), hh = Math.round(A.S.h * 1000), chW = o.chW, V = Q.vista(cc, r, { x0: -20, x1: bw + 20, z0: -hh / 2, z1: hh / 2 }, [18, 18, 8, 14], [5, 10, 20]);
      V.fundo(0, -hh / 2, bw, hh); V.mad(0, -hh / 2, bw, hh, { horiz: true }); V.aco(bw / 2 - TCH / 2, -chW / 2, TCH, chW);
      g.zc.forEach(function (z) { V.fundo(-12, z - g.d / 2, bw + 24, g.d); V.vis(-12, z - g.d / 2, bw + 24, g.d, "MAD-LIG"); V.ret(-12, z - 15, 12, 30, "MAD-LIG"); V.ret(bw, z - 15, 12, 30, "MAD-LIG"); V.eixoH(-18, bw + 18, z); });
      V.ch(0, bw, hh / 2, 5, String(bw), { semExt: true }); V.cv(hh / 2, -hh / 2, 0, -6, String(hh), { semExt: true }); V.ch(bw / 2 - TCH / 2, bw / 2 + TCH / 2, -hh / 2, -5, String(TCH), { semExt: true });
      if (g.zc.length > 1) V.cv(g.zc[1], g.zc[0], bw, 6, String(g.a2), { semExt: true });
      return V;
    };
  }
  /** chapa isolada: comprimento L (mm), largura W, furos [{x, z, d}] medidos da ponta esquerda */
  function chapaIso(ch) {
    return function (cc, r) {
      var V = Q.vista(cc, r, { x0: 0, x1: ch.L, z0: -ch.W / 2, z1: ch.W / 2 }, [14, 14, 10, 18], [5, 10, 20, 25, 50]), xs = [];
      V.acoV(0, -ch.W / 2, ch.L, ch.W);
      ch.furos.forEach(function (f) { V.furo(f.x, f.z, f.d + 1, true); if (xs.indexOf(f.x) < 0) xs.push(f.x); });
      xs.sort(function (p, q) { return p - q; });
      var pts = [0].concat(xs).concat([ch.L]), vals = []; for (var i = 0; i + 1 < pts.length; i++) vals.push(String(Math.round(pts[i + 1] - pts[i])));
      V.cadH(pts, -ch.W / 2, -6, vals, { semExt: true }); V.cv(ch.W / 2, -ch.W / 2, 0, -6, String(ch.W), { semExt: true }); if (ch.cota) V.ch(ch.cota[0], ch.cota[1], ch.W / 2, 5, String(ch.cota[1] - ch.cota[0]), { semExt: false });
      V.tx(ch.L / 2, ch.W / 2 + 12, "t = " + TCH + " mm, furos Ø(d + 1)", null, { al: "C" });
      return V;
    };
  }
  /** par de elevações/vistas por célula: vistas = { elevs: [{ t, fn }], subs: [{ t, fn }] } */
  function celula(c, x, y, w, h, o) {
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, x + 1, y + 1, o.cod + " - " + o.titulo, null), by = y + ht, bh = h - ht - 2, h1 = Math.round(bh * (o.fTop || 0.36)), h2 = Math.round(bh * (o.fSub || 0.26)), hv = 6, escs = [], reg = { cod: o.cod, vistas: [], pinos: o.reg.pinos };
    var P = [], ne = o.elevs.length, i;
    for (i = 0; i < ne; i++) P.push({ v: o.elevs[i], r: o.empilha ? { x: x + 1, y: by + i * (h1 / ne), w: w - 2, h: h1 / ne - 2 } : { x: x + 1 + i * (w / ne), y: by, w: w / ne - 2, h: h1 } });
    for (i = 0; i < o.subs.length; i++) P.push({ v: o.subs[i], r: { x: x + 1 + i * (w / o.subs.length), y: by + h1 + 2, w: w / o.subs.length - 2, h: h2 } });
    P.forEach(function (p) {
      var rp = p.r, V = p.v.fn(c, { x: rp.x, y: rp.y + hv, w: rp.w, h: rp.h - hv });
      D.texto(rp.x + 0.5, rp.y + 3.4, p.v.t + " - ESC 1:" + V.esc, T.nota, { peso: 0.12, attr: ' data-vista="1"' }); reg.vistas.push({ t: p.v.t, esc: V.esc }); if (escs.indexOf(V.esc) < 0) escs.push(V.esc);
    });
    var yn = by + h1 + h2 + 5, hu = D.textos(x + 1, yn, o.notas, T.nota * 0.92, { wmax: w - 3 });
    if (yn + hu > y + h + 0.5) c.avisos.push("Folha " + c.rotulo + ": a nota de " + o.cod + " passa do painel (" + Math.round(yn + hu - y) + " > " + Math.round(h) + " mm).");
    c.cels.push(reg); return escs;
  }
  function folgaTxt(res, re) { var m = Infinity; arr(res.aparo && res.aparo.folgas).forEach(function (f) { if (re.test(f.contra) && f.folga_mm < m) m = f.folga_mm; }); return isFinite(m) ? "Folga mínima medida no modelo aparado: " + br(m, 1) + " mm (>= 10 mm)." : "Folga de projeto: 10 mm."; }
  function notasPar(o, l, A, B, pnA, pnB, extra) {
    var chp = l.chapa;
    var n = [{ t: o.cod + " - " + o.titulo + ": " + (l.descricao || "") },
      "1 - chapa interna de aço t = " + TCH + " mm, " + o.chW + " mm de largura, em fenda nas duas peças; 2 - " + pnA.n + " pinos inox A4 Ø" + Math.round(pnA.d * 1000) + " em " + A.rot + " e " + pnB.n + " pinos Ø" + Math.round(pnB.d * 1000) + " em " + B.rot + " (esquema em linha: posição e ângulo do encontro nas folhas E01 e E02)" + (o.gap > 0 ? "; 3 - FOLGA CONSTRUTIVA de " + o.gap + " mm entre as peças (cotada): nada encosta, a carga passa só por chapa + pinos; furo da chapa Ø(d + 1)." : "; apoio por contato (sem folga): a viga assenta no topo do pilar e a chapa resiste ao arrancamento e ao cortante."),
      "Espaçamentos real | mínimo (mm) - " + A.rot + ": " + espTxt(o.cod, pnA, A.S) + "; " + B.rot + ": " + espTxt(o.cod, pnB, B.S) + ". Mínimo: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.",
      Q.etaLinha(pnA, o.cod + "-pinos-a", "Pinos em " + A.rot + " (Johansen):"), Q.etaLinha(pnB, o.cod + "-pinos-b", "Pinos em " + B.rot + " (Johansen):")];
    if (chp) n.push(Q.etaLinha(chp, o.cod + "-chapa", "Chapa (NBR 8800: bruta, líquida fu/1,35 e esmagamento):"));
    (extra || []).forEach(function (t) { n.push(t); });
    return n;
  }
  function furosInline(gA, gB, g) { var L = gA.L + g + gB.L, f = []; gA.xr.forEach(function (x) { gA.zc.forEach(function (z) { f.push({ x: x, z: z, d: gA.d }); }); }); gB.xr.forEach(function (x) { gB.zc.forEach(function (z) { f.push({ x: L - x, z: z, d: gB.d }); }); }); return f; }
  function chapaInline(A, B, g, chW) { var gA = posGrupo(A.pn), gB = posGrupo(B.pn); return { L: gA.L + g + gB.L, W: chW, furos: furosInline(gA, gB, g), cota: g > 0 ? [gA.L, gA.L + g] : null }; }
  function mkPar(res, cod, titulo, l, A, B, gap, chW, extra) {
    var o = { cod: cod, titulo: titulo, gap: gap, chW: chW, reg: {} };
    o.elevs = [{ t: "ELEVAÇÃO DO NÓ (folga cotada)", fn: elevNo(o, A, B) }];
    o.subs = [{ t: "CORTE (peça " + A.rot + ")", fn: corteNo(o, A) }, { t: "CHAPA DE AÇO", fn: chapaIso(chapaInline(A, B, gap, chW)) }];
    o.notas = notasPar(o, l, A, B, A.pn, B.pn, extra); return o;
  }
  /** base: pilar vertical, chapa interna, folga do pé, placa de base e chumbadores; planta da placa; chapa isolada */
  function mkBase(res, l, SP) {
    var pb = l.placaBase, pn = l.pinos, g = posGrupo(pn), lp = pb.dimensoes_mm[0], tp = pb.espessura_mm, fe = Q.FOLGA_PE, chW = Math.max(l.chapa ? l.chapa.largura_mm : 0, 30), hP = Math.round(SP.h * 1000), bP = Math.round(SP.b * 1000), dch = Math.round(pb.chumbDiametro_mm || 10), nch = pb.total, pl = pb.porLado || 2;
    var o = { cod: "N4", titulo: "BASE DO PILAR (PLACA, CHAPA INTERNA, PINOS E CHUMBADORES)", gap: fe, chW: chW, reg: {} };
    var zFoot = tp + fe, zTip = zFoot + g.L, borda = 50, xch = [];
    o.elevs = [{ t: "ELEVAÇÃO DA BASE", fn: function (cc, r) {
      var m = 30, V = Q.vista(cc, r, { x0: -lp / 2 - m, x1: lp / 2 + m, z0: -50, z1: zTip + 25 }, [14, 30, 10, 16], [5, 10, 20, 25, 50]), n = 0, ext = lp / 2 - borda;
      V.conc(-lp / 2 - m, -50, lp + 2 * m, 50);
      V.fundo(-hP / 2, zFoot, hP, g.L); V.mad(-hP / 2, zFoot, hP, g.L, { horiz: false }); V.vis(-hP / 2, zFoot, hP, g.L, "MAD-PECA");
      V.aco(-lp / 2, 0, lp, tp);
      V.oc(-chW / 2, zFoot, chW, g.L); V.acoV(-chW / 2, tp, chW, fe);
      [-ext, ext].forEach(function (xx) { V.fundo(xx - dch / 2, -45, dch, 45 + tp + 10); V.vis(xx - dch / 2, -45, dch, 45 + tp + 10, "MAD-LIG"); });
      g.xr.forEach(function (x) { g.zc.forEach(function (z) { V.pino(z, zTip - x, g.d, true); n++; }); });
      registra(o, "PL", n, pn.n);
      if (g.xr.length) V.cadV([zTip].concat(g.xr.map(function (x) { return zTip - x; })).concat([zFoot]), -hP / 2, -8, [String(g.a3)].concat(g.xr.slice(1).map(function () { return String(g.a1); })).concat([String(g.L - g.xr[g.xr.length - 1])]), { semExt: true });
      V.cv(zFoot, tp, hP / 2, 12, String(fe), { semExt: false }); V.cv(tp, 0, lp / 2, 8, String(tp), { semExt: true });
      V.ch(-lp / 2, lp / 2, -2, -10, String(lp), { semExt: true });
      V.tx(lp / 2 + 3, -25, "CONCRETO (FUNDAÇÃO)", null, { al: "E" }); V.bal(-hP / 2, zFoot + g.L / 2, -20, 0, 1); V.bal(0, tp / 2, 0, 0, 2);
      return V;
    } }];
    o.subs = [{ t: "PLANTA DA PLACA", fn: function (cc, r) {
      var V = Q.vista(cc, r, { x0: -lp / 2, x1: lp / 2, z0: -lp / 2, z1: lp / 2 }, [26, 16, 12, 18], [5, 10, 20, 25, 50]), ext = lp / 2 - borda, n = 0, ps = [];
      V.aco(-lp / 2, -lp / 2, lp, lp); V.mad(-bP / 2, -hP / 2, bP, hP, { horiz: true }); V.vis(-bP / 2, -hP / 2, bP, hP, "MAD-PECA"); V.aco(-TCH / 2, -chW / 2, TCH, chW);
      for (var i = 0; i < pl; i++) { var zz = pl > 1 ? -ext + i * (2 * ext) / (pl - 1) : 0; [-ext, ext].forEach(function (xx) { ps.push([xx, zz]); }); }
      ps.forEach(function (p) { V.furo(p[0], p[1], 22, true); n++; xch.push(p); });
      (o.reg.chumb = o.reg.chumb || []).push({ cod: o.cod, desenhados: n, esperado: nch });
      V.ch(-lp / 2, lp / 2, lp / 2, 5, String(lp), { semExt: true }); V.cv(lp / 2, -lp / 2, -lp / 2, -6, String(lp), { semExt: true }); V.ch(-lp / 2, -ext, -lp / 2, -5, String(borda), { semExt: true });
      if (pl > 1) V.cv(ext, -ext, lp / 2, 6, String(Math.round(2 * ext)), { semExt: true });
      return V;
    } }, { t: "CHAPA INTERNA (peça isolada)", fn: chapaIso({ L: g.L + fe, W: chW, furos: g.xr.reduce(function (acc, x) { g.zc.forEach(function (z) { acc.push({ x: g.L + fe - x, z: z, d: g.d }); }); return acc; }, []), cota: [0, fe] }) }];
    o.notas = [{ t: "N4 - " + l.descricao }, "1 - pilar com chapa interna t = " + TCH + " mm em fenda no pé e " + pn.n + " pinos inox A4 Ø" + Math.round(pn.d * 1000) + " (esquema da fenda: corte do N1); 2 - placa de base " + lp + "x" + pb.dimensoes_mm[1] + "x" + tp + " mm, aço galvanizado a fogo, com a chapa soldada (solda " + (pb.solda && pb.solda.tipo ? pb.solda.tipo : "de filete") + ", eta " + br(pb.solda ? pb.solda.eta : 0, 3) + "); chumbadores químicos inox A4-70 M" + dch + " x " + nch + " (" + pl + " por lado)." ,
      "Folga do pé do pilar acima da placa: " + fe + " mm (padrão RA, a confirmar: o cálculo não a fixa) — pé elevado e drenado. Embutimento e sistema químico do chumbador: pela fundação. Distância do chumbador à borda da placa: " + borda + " mm (braço z = lp - 100 do cálculo); posição ao longo do lado adotada uniforme, a confirmar pelo RT.",
      "Espaçamentos real | mínimo (mm): " + espTxt("N4", pn, SP) + ". Mínimo: " + Q.FONTE_MIN + ".", Q.etaLinha(pn, "N4-pinos", "Pinos no pilar (Johansen):"), Q.etaLinha(l.chapa, "N4-chapa", "Chapa (NBR 8800):"),
      Q.etaLinha({ eta: pb.chumbadoresVerif && pb.chumbadoresVerif.eta, ok: pb.chumbadoresVerif && pb.chumbadoresVerif.ok }, "N4-chumb", "Chumbadores (NBR 8800, tração + cortante):"), Q.etaLinha({ eta: pb.flexao && pb.flexao.eta, ok: pb.flexao && pb.flexao.ok }, "N4-placa", "Placa de base à flexão:"),
      "Fundação (arrancamento " + br(l.N_tracao_kN, 2) + " kN, compressão " + br(l.N_compressao_kN, 2) + " kN e cortante " + br(l.H_kN, 2) + " kN por pilar): bloco/sapata fora desta verificação, a cargo do RT."];
    return o;
  }
  /** caibro × viga principal: parafusos de rosca total a 45° em pares cruzados */
  function mkCaibro(res, l, SVS, SVP) {
    var o = { cod: "N5", titulo: "CAIBRO SOBRE A VIGA PRINCIPAL (PARAFUSOS A 45°)", gap: 0, chW: 0, reg: {} }, n = l.porApoio, lef = arr(l.lef_mm), hS = mm(SVS.h), hV = mm(SVP.h), bV = mm(SVP.b), bS = mm(SVS.b), d = 8.2, Ls = 300, k = Math.SQRT1_2;
    o.elevs = [{ t: "ELEVAÇÃO (PLANO DO CAIBRO)", fn: function (cc, r) {
      var V = Q.vista(cc, r, { x0: -Math.max(bV, 220) / 2 - 90, x1: Math.max(bV, 220) / 2 + 90, z0: -hV, z1: hS + 30 }, [14, 14, 14, 20], [5, 10, 20, 25, 50]), nd = 0, xv = bV / 2, hh = Ls * k / 2;
      V.fundo(-xv, -hV, bV, hV); V.mad(-xv, -hV, bV, hV, { horiz: true }); V.vis(-xv, -hV, bV, hV, "MAD-PRINCIPAL");
      V.fundo(-xv - 90, 0, bV + 180, hS); V.mad(-xv - 90, 0, bV + 180, hS, { horiz: true }); V.vis(-xv - 90, 0, bV + 180, hS, "MAD-PECA");
      for (var i = 0; i < 2; i++) { var s = i ? -1 : 1; V.lin(-s * hh, hh, s * hh, -hh, "MAD-LIG"); V.lin(-s * hh + 3, hh, s * hh + 3, -hh, "MAD-LIG"); nd++; }
      o.reg.parafusos = [{ cod: o.cod, desenhados: nd * (n / 2), esperado: n }];
      V.cadV([hS, 0, -hV], -xv - 90, -8, [String(hS), String(hV)], { semExt: false }); V.ch(-xv, xv, -hV, -6, String(bV), { semExt: true });
      V.bal(0, 0, 0, 0 + 20, 1); V.tx(xv + 94, hS / 2, "VS (caibro)", null, { al: "E" }); V.tx(xv + 4, -hV / 2, "VP", null, { al: "E" });
      return V;
    } }];
    o.subs = [{ t: "VISTA SUPERIOR DO APOIO", fn: function (cc, r) {
      var V = Q.vista(cc, r, { x0: -bS / 2 - 40, x1: bS / 2 + 40, z0: -bV / 2 - 20, z1: bV / 2 + 20 }, [18, 18, 10, 16], [5, 10, 20, 25, 50]), np = n / 2, nm = 0;
      V.fundo(-bS / 2 - 40, -bV / 2 - 20, bS + 80, bV + 40); V.vis(-bS / 2 - 40, -bV / 2, bS + 80, bV, "MAD-PRINCIPAL"); V.vis(-bS / 2, -bV / 2 - 20, bS, bV + 40, "MAD-PECA");
      for (var i = 0; i < np; i++) { var xx = -bS / 2 + bS * (i + 0.5) / np; V.furo(xx, 0, d * 3, true); V.lin(xx - 10, -10, xx + 10, 10, "MAD-LIG"); V.lin(xx - 10, 10, xx + 10, -10, "MAD-LIG"); nm += 2; }
      (o.reg.pares = o.reg.pares || []).push({ cod: o.cod, desenhados: nm, esperado: n });
      V.ch(-bS / 2, bS / 2, bV / 2 + 20, 6, String(bS), { semExt: true }); V.cv(bV / 2, -bV / 2, bS / 2 + 40, 6, String(bV), { semExt: true });
      return V;
    } }, { t: "PARAFUSO WT-T 8,2 x " + Ls, fn: function (cc, r) {
      var V = Q.vista(cc, r, { x0: 0, x1: Ls, z0: -12, z1: 12 }, [14, 14, 14, 16], [5, 10, 20, 25, 50]);
      V.fundo(0, -d / 2, Ls, d); V.vis(0, -d / 2, Ls, d, "MAD-LIG"); V.ret(-8, -9, 8, 18, "MAD-LIG");
      V.ch(0, Ls, d / 2, 8, String(Ls), { semExt: false }); if (lef.length) { V.ch(Ls - lef[0], Ls, -d / 2, -6, String(lef[0]), { semExt: true }); V.ch(0, lef[1] || lef[0], -d / 2, -6, String(lef[1] || lef[0]), { semExt: true }); }
      return V;
    } }];
    o.notas = [{ t: "N5 - " + l.descricao }, "1 - " + n + " parafusos SFS WT-T 8,2 x " + Ls + " por apoio (rosca total), a 45° em pares cruzados, comprimento efetivo de rosca " + lef.join(" / ") + " mm no caibro e na viga; " + (n / 2) + " par(es) distribuído(s) na largura do caibro (adotado uniforme, a confirmar pelo RT); o apoio vertical é por contato.",
      "Arrancamento " + br(l.arrancamento_kN, 2) + " kN, horizontal " + br(l.horizontal_kN, 2) + " kN, cortante " + br(l.cortante_kN, 2) + " kN; Rax,d = " + br(l.Rax_d, 2) + " kN por parafuso.", Q.etaLinha(l, "N5-parafusos", "Parafusos de rosca total (ETA-12/0063):")];
    return o;
  }
  /** parede: estribo de aço + chumbadores */
  function mkParede(res, l, SVS) {
    var pn = l.pinos, g = posGrupo(pn), ch = l.chumbadores || {}, nch = ch.n || 0, dch = Math.round((ch.d || 0.01) * 1000), chW = Math.max(l.chapa ? l.chapa.largura_mm : 0, 30), gap = 10, tpl = TCH, hS = mm(SVS.h), W = Math.max(chW, hS), pa = Math.max(chW, 60);
    var o = { cod: "N6", titulo: "CAIBRO NA PAREDE (ESTRIBO E CHUMBADORES)", gap: gap, chW: chW, reg: {} }, zch = [];
    for (var i = 0; i < nch; i++) zch.push(nch > 1 ? -pa / 2 + pa * (i + 0.5) / nch : 0);
    o.elevs = [{ t: "ELEVAÇÃO DO ESTRIBO", fn: function (cc, r) {
      var m = 30, xw = gap + tpl, V = Q.vista(cc, r, { x0: -g.L - m, x1: xw + 120, z0: -W / 2 - 10, z1: W / 2 + 10 }, [14, 14, 14, 22], [5, 10, 20, 25, 50]), n = 0, nc = 0;
      V.fundo(-g.L - m, -hS / 2, g.L + m, hS); V.mad(-g.L - m, -hS / 2, g.L + m, hS, { horiz: true }); V.vis(-g.L - m, -hS / 2, g.L + m, hS, "MAD-PECA");
      V.conc(xw, -W / 2 - 10, 120, W + 20); V.oc(-g.L, -chW / 2, g.L, chW); V.aco(0, -chW / 2, gap, chW); V.aco(gap, -pa / 2, tpl, pa);
      zch.forEach(function (z) { V.fundo(xw, z - dch / 2, 100, dch); V.vis(xw, z - dch / 2, 100, dch, "MAD-LIG"); V.eixoH(xw - 10, xw + 110, z); nc++; });
      g.xr.forEach(function (x) { g.zc.forEach(function (z) { V.pino(-g.L + x, z, g.d, true); n++; }); });
      registra(o, "VS", n, pn.n); (o.reg.chumb = o.reg.chumb || []).push({ cod: o.cod, desenhados: nc, esperado: nch });
      if (g.xr.length) V.cadH([-g.L].concat(g.xr.map(function (x) { return -g.L + x; })).concat([0]), -hS / 2, -6, [String(g.a3)].concat(g.xr.slice(1).map(function () { return String(g.a1); })).concat([String(g.L - g.xr[g.xr.length - 1])]), { semExt: true });
      V.ch(0, gap, hS / 2, 8, String(gap), { semExt: false }); V.tx(xw + 4, W / 2 + 4, "PAREDE / VIGA EXISTENTE", null, { al: "E" }); if (g.xr.length) V.bal(-g.L + g.xr[0], g.zc[0], -12, -16, 1); V.bal(gap + tpl / 2, pa / 2, 0, -14, 2);
      return V;
    } }];
    o.subs = [{ t: "CORTE (caibro VS)", fn: corteNo(o, { pn: pn, S: SVS }) }, { t: "CHAPA DO ESTRIBO", fn: chapaIso({ L: g.L + gap + tpl, W: chW, furos: g.xr.reduce(function (acc, x) { g.zc.forEach(function (z) { acc.push({ x: x, z: z, d: g.d }); }); return acc; }, []), cota: [g.L, g.L + gap] }) }];
    var re = l.reacoes || {};
    o.notas = [{ t: "N6 - " + l.descricao }, "1 - " + pn.n + " pinos inox A4 Ø" + Math.round(pn.d * 1000) + " no caibro e chapa interna t = " + TCH + " mm em fenda; 2 - placa do estribo fixada à parede por " + nch + " chumbadores químicos M" + dch + " (distribuídos na altura da placa, adotado uniforme, a confirmar pelo RT); folga de " + gap + " mm entre a ponta do caibro e a placa do estribo (adotada).",
      "Reações por caibro entregues ao RT: Ry (peso) " + br(re.Ry_kN, 2) + " kN, Ry (sucção) " + br(re.RyUp_kN, 2) + " kN, Rx " + br(re.Rx_kN, 2) + " kN, Rz " + br(re.Rz_kN, 2) + " kN. A capacidade da parede e do substrato não faz parte desta verificação.",
      "Espaçamentos real | mínimo (mm): " + espTxt("N6", pn, SVS) + ".", Q.etaLinha(pn, "N6-pinos", "Pinos no caibro (Johansen):"), Q.etaLinha(l.chapa, "N6-chapa", "Chapa (NBR 8800):"), Q.etaLinha({ eta: ch.eta, ok: ch.eta == null ? null : ch.eta <= 1 }, "N6-chumb", "Chumbadores da parede (tração + cortante):")];
    return o;
  }
  function folhaE03(c) {
    var D = c.D, a = c.geo.area, res = c.res, S = res.secoes, L5 = (res.ligacoesT5 && res.ligacoesT5.ligacoes) || {}, mu = (res.ligacoesT5 && res.ligacoesT5.multiplicidade) || {}, inf = res.t5.info, escs = [], cels = [];
    var wP = function (l) { return l && l.chapa ? l.chapa.largura_mm : 0; };
    if (L5.cabeca) cels.push(mkPar(res, "N1", "CABEÇA DO PILAR X VIGA PRINCIPAL", L5.cabeca, { rot: "PL", S: S.P, pn: L5.cabeca.pinosPilar }, { rot: "VP", S: S.VP, pn: L5.cabeca.pinosViga }, 0, Math.max(wP(L5.cabeca), 30)));
    if (L5.mfPilarBarra && L5.mfPilarNo) cels.push(mkPar(res, "N2", "MÃO-FRANCESA X PILAR (UMA CHAPA EM CRUZ POR NÓ)", L5.mfPilarNo, { rot: "MF", S: S.MF, pn: L5.mfPilarBarra.pinos }, { rot: "PL", S: S.P, pn: L5.mfPilarNo.pinos }, 10, Math.max(wP(L5.mfPilarBarra), wP(L5.mfPilarNo), 30),
      [{ t: "Chapa em CRUZ: duas chapas em fenda cruzadas, uma por plano de mão-francesa, no mesmo nó do pilar (" + (mu.nosMFPilar || 0) + " nós no pilar, " + (mu.pontasMF || 0) + " pontas); o grupo do pilar resiste à resultante das barras do nó. " + folgaTxt(res, /^pilar/) }, Q.etaLinha(L5.mfPilarBarra.chapa, "N2-chapa-mf", "Chapa na mão-francesa (NBR 8800):")]));
    if (L5.mfViga) {
      var o3 = mkPar(res, "N3", "MÃO-FRANCESA X VIGA PRINCIPAL" + (L5.mfCaibro && mu.mfNoCaibro ? " E CAIBRO" : ""), L5.mfViga, { rot: "MF", S: S.MF, pn: L5.mfPilarBarra.pinos }, { rot: "VP", S: S.VP, pn: L5.mfViga.pinos }, 10, Math.max(wP(L5.mfPilarBarra), wP(L5.mfViga), 30), [{ t: folgaTxt(res, /^viga principal/) }]);
      if (L5.mfCaibro && mu.mfNoCaibro) {
        var A = { rot: "MF", S: S.MF, pn: L5.mfPilarBarra.pinos }, B = { rot: "VS", S: S.VS, pn: L5.mfCaibro.pinos }, chW2 = Math.max(wP(L5.mfPilarBarra), wP(L5.mfCaibro), 30), oC = { cod: "N3", gap: 10, chW: chW2, reg: o3.reg };
        o3.elevs.push({ t: "ELEVAÇÃO: MF X CAIBRO", fn: elevNo(oC, A, B) });
        o3.notas.push({ t: "MF x caibro VS (" + mu.mfNoCaibro + " nós): " + L5.mfCaibro.descricao + " Chapa " + chW2 + " mm de largura. " + folgaTxt(res, /^caibro/) }, "Espaçamentos real | mínimo (mm) - VS: " + espTxt("N3", L5.mfCaibro.pinos, S.VS) + ".", Q.etaLinha(L5.mfCaibro.pinos, "N3-pinos-vs", "Pinos no caibro (Johansen):"), Q.etaLinha(L5.mfCaibro.chapa, "N3-chapa-vs", "Chapa no caibro (NBR 8800):"));
      }
      o3.empilha = true; o3.fTop = 0.56; o3.fSub = 0.2; cels.push(o3);
    }
    if (L5.base && L5.base.placaBase) { var o4 = mkBase(res, L5.base, S.P); o4.fTop = 0.5; o4.fSub = 0.3; cels.push(o4); }
    if (L5.caibroVP) cels.push(mkCaibro(res, L5.caibroVP, S.VS, S.VP));
    if (inf.encostado && L5.parede) cels.push(mkParede(res, L5.parede, S.VS));
    var n = cels.length, nl = n > 3 ? 2 : 1, cw = (a.w - 4 - 2 * 3) / 3, ch = (a.h - 4 - (nl - 1) * 3) / nl;
    cels.forEach(function (o, i) { escs = escs.concat(celula(c, a.x + 2 + (i % 3) * (cw + 3), a.y + 2 + Math.floor(i / 3) * (ch + 3), cw, ch, o)); c.det.push(o); });
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "INDICADA" };
  }

  /* ================== E04: lista de peças + quadro de ferragens ================== */
  function ferragens(res) {
    var L5 = (res.ligacoesT5 && res.ligacoesT5.ligacoes) || {}, mu = (res.ligacoesT5 && res.ligacoesT5.multiplicidade) || {}, M5 = arr(res.t5.membros), nPil = M5.filter(function (m) { return m.g === "P"; }).length, nMF = M5.filter(function (m) { return m.g === "MF"; }).length, G = SX().gruposDe, out = [];
    function lig(chave, nome, m, extraTxt) {
      var l = L5[chave]; if (!l) return; var gs = G(l), n = 0, txt = []; gs.forEach(function (g) { n += g.n; txt.push(g.nome + ": " + g.n + " x Ø" + mm(g.pn.d)); });
      out.push({ chave: chave, nome: nome, mult: m, porInst: n, total: m * n, pinosTxt: txt.join("; ") || "-", chapa: l.chapa ? TCH + " x " + l.chapa.largura_mm : "-", eta: l.eta, ok: l.ok !== false });
    }
    lig("mfPilarBarra", "MF: ponta no pilar (grupo na barra)", mu.pontasMF || 2 * nMF); lig("mfPilarNo", "Pilar: nó das mãos-francesas (chapa em cruz)", mu.nosMFPilar || 0); lig("mfViga", "MF na viga principal", mu.mfNaViga || 0); lig("mfCaibro", "MF no caibro", mu.mfNoCaibro || 0);
    lig("cabeca", "Cabeça do pilar x viga principal", mu.cabecas || nPil); lig("base", "Base do pilar (grupo no pilar)", mu.bases || nPil); lig("parede", "Caibro no estribo da parede", mu.caibroParede || 0);
    return out;
  }
  function folhaE04(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, tab = d.marcas.tab, L5 = (res.ligacoesT5 && res.ligacoesT5.ligacoes) || {}, mu = (res.ligacoesT5 && res.ligacoesT5.multiplicidade) || {};
    var hT = I.tituloVista(D, a.x + 4, a.y + 2, "LISTA DE PEÇAS POR POSIÇÃO", "SEM ESCALA - uma linha por marca; volumes da fonte, sem perdas") + 2;
    var cols = [{ t: "MARCA" }, { t: ["PEÇA"], al: "E" }, { t: "QTD" }, { t: ["CLASSE", "(GL)"] }, { t: ["b x h", "(cm)"] }, { t: ["L", "(cm)"] }, { t: ["VOLUME", "UNIT. (m3)"] }, { t: ["VOLUME", "TOTAL (m3)"] }, { t: ["TRATAMENTO", "(NBR 16143)"] }];
    var tvol = 0, tq = 0, linhas = tab.map(function (m) {
      tvol += m.volTot; tq += m.qtd;
      return [{ t: m.marca, attr: ' data-tab-marca="' + m.marca + '"' }, { t: NOME[m.prefixo] || m.desc, al: "E" }, { t: String(m.qtd), attr: ' data-tab-qtd="' + m.marca + '|' + m.qtd + '"' }, m.classe, m.sec, String(m.Lcm), br(m.volUnit, 4), { t: br(m.volTot, 3), attr: ' data-tab-vol="' + m.marca + '|' + Math.round(m.volTot * 1e6) / 1e6 + '"' }, "a definir (RT)"];
    });
    linhas.push({ total: [{ t: "TOTAL GERAL (MLC)" }, "", { t: String(tq), attr: ' data-tab-total-qtd="' + tq + '"' }, "", "", "", "", { t: br(tvol, 3), attr: ' data-tab-total-vol="' + Math.round(tvol * 1e6) / 1e6 + '"' }, ""] });
    var tb = D.tabela(a.x + 4, a.y + 2 + hT, cols, linhas, { fs: T.tabela * 0.92, hl: 4.6 }), y1 = a.y + 2 + hT + tb.h + 8;
    var h2 = I.tituloVista(D, a.x + 4, y1, "QUADRO DE FERRAGENS - CHAPAS, PINOS, PLACA E CHUMBADORES POR LIGAÇÃO", "SEM ESCALA - quantidade = ocorrências da ligação no pergolado x pinos por ocorrência (contados pela geometria do grupo)") + 2;
    var fr = ferragens(res), tp = 0, cf = [{ t: "LIGAÇÃO", al: "E" }, { t: ["QTD", "LIGAÇÕES"] }, { t: "PINOS POR LIGAÇÃO", al: "E" }, { t: ["TOTAL", "PINOS"] }, { t: ["CHAPA t x L", "(mm)"] }, { t: "η" }, { t: "SITUAÇÃO" }];
    var lf = fr.map(function (f) { tp += f.total; return [{ t: f.nome, al: "E" }, { t: String(f.mult), attr: ' data-ferr-mult="' + f.chave + '|' + f.mult + '"' }, { t: f.pinosTxt, al: "E" }, { t: String(f.total), attr: ' data-ferr-pinos="' + f.chave + '|' + f.total + '"' }, f.chapa, br(f.eta, 3), f.ok ? { t: "ok" } : { t: "NÃO ATENDE", cor: VERMELHO }]; });
    lf.push({ total: [{ t: "TOTAL DE PINOS INOX" }, "", "", { t: String(tp), attr: ' data-ferr-pinos-total="' + tp + '"' }, "", "", ""] });
    var tf = D.tabela(a.x + 4, y1 + h2, cf, lf, { fs: T.tabela * 0.92, hl: 4.6 }), y2 = y1 + h2 + tf.h + 6, pb = L5.base && L5.base.placaBase, nPil = d.pilares.length, ff = [];
    ff.push("Chapas internas de aço t = " + TCH + " mm (inox ou galvanizado a fogo), uma por nó, furo Ø(d + 1); pontas das mãos-francesas aparadas com folga >= 10 mm (folga mínima medida " + br(res.aparo && res.aparo.resumo ? res.aparo.resumo.minimo_mm : 0, 1) + " mm).");
    if (pb) ff.push("Placa de base " + pb.dimensoes_mm[0] + " x " + pb.dimensoes_mm[1] + " x " + pb.espessura_mm + " mm, aço galvanizado a fogo: " + (mu.bases || nPil) + " un.; chumbadores químicos inox A4-70 M" + Math.round(pb.chumbDiametro_mm || 10) + ": " + (mu.bases || nPil) * pb.total + " un. (" + pb.total + " por placa).");
    if (L5.caibroVP) ff.push("Parafusos SFS WT-T 8,2 x 300 (caibro x viga principal, a 45°): " + (mu.caibroVP || 0) + " apoios x " + L5.caibroVP.porApoio + " = " + (mu.caibroVP || 0) * L5.caibroVP.porApoio + " un.");
    if (L5.parede && L5.parede.chumbadores) ff.push("Parede: " + (mu.caibroParede || 0) + " estribos x " + L5.parede.chumbadores.n + " chumbadores químicos M" + mm(L5.parede.chumbadores.d) + " = " + (mu.caibroParede || 0) * L5.parede.chumbadores.n + " un.");
    if (res.t5.info.ripa) ff.push("Parafusos inox das ripas: 2 por cruzamento ripa x caibro = " + res.t5.info.ripa.n * res.t5.info.nCaibros * 2 + " un. (adotado).");
    ff.push("Código do fabricante e ETA dos pinos, chapas, placa e chumbadores: a definir (RT/fabricante); conferir o relatório ETA-12/0063 dos parafusos, não a folha de venda.");
    var hu = D.textos(a.x + 4, y2, ff, T.nota * 0.95, { wmax: a.w - 10 });
    if (y2 + hu > a.y + a.h) c.avisos.push("Folha E04: o texto passa do pé da folha.");
    c.ferr = { itens: fr, totalPinos: tp };
    return { escala: "SEM ESCALA" };
  }

  function gerar(res, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    var P = Q.PR(); if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || res.tipologia !== "T5" || !res.t5 || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoesT5 || !res.secoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo da T5 sem fonte/ligações: não há pranchas."] };
    var E = I.estilo(opcoes.padrao), SA = SE(), prel = opcoes.preliminar != null ? !!opcoes.preliminar : !!(SA && SA.preliminar(res).preliminar);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA"), codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-T5", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var classe = Q.txt(opcoes.classe) || Q.classeDe((arr(res.fonte.pecas).filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h");
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [], det: [] }; ctx0.d = contexto(res); ctx0.pend = ctx0.d.pend;
    var ORDEM = [["E01", "planta", folhaE01, null, "PLANTA - PILARES, VIGAS PRINCIPAIS, CAIBROS, RIPAS E MÃOS-FRANCESAS"], ["E02", "elevacoes", folhaE02, null, "ELEVAÇÕES FRONTAL E LATERAL"], ["E03", "nos", folhaE03, null, "DETALHES DOS NÓS - CABEÇA, MÃO-FRANCESA, BASE, CAIBRO" + (res.t5.info.encostado ? " E PAREDE" : "")], ["E04", "pecas", folhaE04, null, "LISTA DE PEÇAS E QUADRO DE FERRAGENS"]];
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = "0" + (i + 1);
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      if (c.ferr) ctx0.ferr = c.ferr;
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: def[4] });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00", FX = SX().FAIXA, PR_ = SA ? SA.ROTULO_PRELIMINAR : "PRELIMINAR — NÃO ATENDE";
    var pr = P.normalizar({ id: "madt5pranchas", nome: "Pergolado de madeira engenharada (T5) - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt((prel ? PR_ + " — " : "") + (opcoes.obra || "")), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var notas = [{ t: "Pergolado T5 (" + (res.t5.info.encostado ? "encostado" : "livre") + "). Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho." }, { t: "Marca da peça: {marca} - MLC " + classe + " - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC." },
      { t: "Mãos-francesas aparadas com folga >= 10 mm: a carga passa só por chapa de aço interna (t = 8 mm) e pinos inox. Base rotulada; a fundação recebe só força. Tratamento NBR 16143 conforme a tabela da folha E04." }, { t: SX().EXIGENCIA }, { t: "VERMELHO = o que impede emitir: não fabricar nem comprar o item antes de resolver." }];
    var blocos = []; if (prel) blocos.push({ titulo: PR_, cor: VERMELHO, itens: [{ t: "Estrutura que NÃO atende: documento PRELIMINAR, não serve para compra, fabricação nem execução.", cor: VERMELHO }] });
    blocos.push({ titulo: "NOTAS GERAIS", itens: notas });
    var camadas = {}; Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = Q.MP.PADRAO_MAD.camadas[k]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (k) { camadas[k] = Q.PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, opcoes.depurar ? [] : null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      try { I.colunaNotas(Fd, geo, blocos); } catch (e) { avisos.push("Notas: " + e.message); }
      var rotuloFolha = f.rotulo + "/0" + feitas.length; I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + f.rotulo, faixa = (prel ? PR_ + " — " : "") + FX;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(faixa) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha, preliminar: prel };
      if (opcoes.depurar) o.caixasTexto = (D.caixas || []).concat(Fd.caixas || []);
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, celulas: ctx0.cels, detalhes: ctx0.det.map(function (o) { return { cod: o.cod, reg: o.reg }; }), ferragens: ctx0.ferr || null, preliminar: prel, tabela: ctx0.d.marcas.tab, marcas: ctx0.d.marcas.porId, desenhaveis: ctx0.d.pcs };
  }

  var MadEngT5 = { gerar: gerar, contexto: contexto, ferragens: ferragens };
  global.MadEngT5 = MadEngT5;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT5;
})(typeof window !== "undefined" ? window : this);

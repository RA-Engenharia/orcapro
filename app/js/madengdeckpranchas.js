/* =====================================================================
 * madengdeckpranchas.js — PRANCHAS DO DECK (T7: deck + escada + guarda-corpo) em madeira (E4, rodada 7). Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo padrão e mesmo carimbo RA da T1/T2 (js/madengpranchas.js, v2.11 do Padrão RA — LG12 apoio do deck e LG13 guarda-corpo já existem no padrão): este arquivo só
 * acrescenta o CADERNO DO DECK e reaproveita os desenhistas internos (MadEngPranchas._p). Nada da T1/T2 muda. Vale para o deck SOZINHO e para o deck JUNTO com a T1.
 *   MadEngDeck.gerar(res, opcoes) → { ok, folhas, avisos, tabela, ferragens, reacoes, marcas, desenhaveis, celulas, pontos, naoEmitir }
 * res = resultado do worker com res.deck (js/madengworker.js › anexarDeck) e res.fonte.pecas (deck CALCULADO).
 * Folhas: D01 planta estrutural · D02 cortes · D03 guarda-corpo (chapa de apoio e bloqueio) · D04 escada · D05 ligações do deck · D06 tabelas (peças, ferragens, reações para a fundação).
 * Teste: node tools/test-mad-eng-deck-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I;
  var VERMELHO = "#c00000", PRETO = "#000";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function R3(x) { return Math.round(x * 1000) / 1000; }
  function mm(x) { return String(Math.round(x * 1000)); }
  function br(v, c) { return I.br(v, c); }
  var ALVO = /^(DS-|DI-|ESC-|GC)/;

  /* ================================================================ CONTEXTO */
  function contexto(res) {
    var pecas = arr(res.fonte && res.fonte.pecas).filter(function (p) { return ALVO.test(p.id); }), pcs = Q.desenhaveis(pecas), mk = Q.marcar(pcs), d = { res: res, pcs: pcs, marcas: mk, fonteTodos: pecas, pend: {} };
    d.por = function (re) { return pcs.filter(function (p) { return re.test(p.id); }); };
    d.decks = pcs.filter(function (p) { return /^(DS-|DI-|ESC-)/.test(p.id); });
    arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    pcs.forEach(function (pc) { if (!pc.marca) pc.marca = mk.porId[pc.id]; });
    return d;
  }
  function K(c) { return c.res.deck; }
  function sec(c, id) { return (K(c).secoes && K(c).secoes[id]) || {}; }
  function ids(c) { return Object.keys(K(c).decks || {}); }
  function passoBarrote(c, id) { var bs = c.d.fonteTodos.filter(function (p) { return new RegExp("^" + id + "-B\\d+$").test(p.id) && p.p0; }); if (bs.length < 2) return 0.5; var v = []; bs.forEach(function (p) { v.push(Math.abs(p.p0[0] - bs[0].p0[0]) + Math.abs(p.p0[1] - bs[0].p0[1])); }); v.sort(function (a, b) { return a - b; }); return v[1] > 0.05 && v[1] < 1.5 ? R3(v[1]) : 0.5; }
  function ligD(c, k) { var L = K(c).ligacoes && K(c).ligacoes.ligacoes; return (L && L[k]) || null; }

  /* ================================================================ D01 — PLANTA ESTRUTURAL */
  function folhaD01(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, lista = d.decks;
    if (!lista.length) { D.texto(a.x + 10, a.y + 20, "O projeto não tem decks.", T.titulo); return { escala: "INDICADA" }; }
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA ESTRUTURAL DO DECK - TÁBUAS, BARROTES, VIGAS, PILARETES E MÃOS-FRANCESAS", fw: 0.73, mx: 30, my: 26 }), f3 = pl.f3;
    var vs = lista.filter(function (p) { return /^(DS-V|DI-V|ESC-L)/.test(p.id); }), bs = lista.filter(function (p) { return /^(DS-B|DI-B|ESC-D)/.test(p.id); }), ps = lista.filter(function (p) { return /^(DS-P|DI-P)/.test(p.id); });
    var iB = Q.desenharLista(D, c, bs, f3, function () { return "MAD-FINA"; }), iV = Q.desenharLista(D, c, vs, f3, function () { return "MAD-PRINCIPAL"; }), iP = Q.desenharLista(D, c, ps, f3, function () { return "MAD-CORTE"; });
    iP.forEach(function (it) { D.cheio(it.poly, PRETO); });
    var cvl = lista.filter(function (p) { return /^D[SI]-CV\d/.test(p.id); }), iC = Q.desenharLista(D, c, cvl, f3, function () { return "MAD-LIG"; });      /* r11: diagonais do contraventamento em X (DY), em planta */
    c.d.fonteTodos.filter(function (p) { return /-(MF|CVT)\d+$/.test(p.id) && p.p0 && p.p1; }).forEach(function (p) { var A = f3(p.p0), B = f3(p.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-LIG"); });
    Q.rotular(c, iV, T.marca, { raio: 22 }); Q.rotular(c, iB, T.marcaDensa, { umaPorMarca: true, raio: 26 }); Q.rotular(c, iP, T.marcaDensa, { umaPorMarca: true, raio: 30 }); Q.rotular(c, iC, T.marcaDensa, { umaPorMarca: true, raio: 34 });
    var xr = a.x + a.w - 158, yy = a.y + 18;
    yy += Q.legenda(D, xr, yy, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "vigas DV, DW (barrote apoia por cima)" }, { tipo: "ret", cam: "MAD-FINA", t: "barrotes DB, DC" }, { tipo: "ret", cam: "MAD-CORTE", t: "pilaretes DP e pilares DQ (cortados)" }, { tipo: "linha", cam: "MAD-LIG", t: "mãos-francesas (45 gr, 6x12) e contraventamento em X (DY, folha D07)" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria" }], T.nota * 0.9) + 5;
    var k = K(c), nota = [];
    ids(c).forEach(function (id) { var s = sec(c, id), dk = k.decks[id]; nota.push(id + ": tábuas de cumaru " + mm((s.tabua && s.tabua.e) || 0.021) + " mm (D60 adotada) perpendiculares aos barrotes " + mm(s.barrote.b) + "x" + mm(s.barrote.h) + " a cada " + mm(passoBarrote(c, id)) + " mm; vigas " + mm(s.viga.b) + "x" + mm(s.viga.h) + "; " + (s.pilarete.d ? "pilares Ø" + mm(s.pilarete.d) : "pilaretes " + mm(s.pilarete.b) + "x" + mm(s.pilarete.b)) + "; estabilidade: " + estabTxt(dk.estabilidade) + "; altura do piso sobre o terreno/base +" + br(dk.alturaDeck, 2) + " m."); });
    nota.push({ t: "Deck, escada e guarda-corpo verificados (T7, NBR 7190-1:2022, classe de umidade " + k.umidade + "): η máximo " + br(k.etaMax, 2) + ". Premissas adotadas a confirmar pelo RT: ver o quadro da folha D06.", attr: ' data-deck-verificado="1"' });
    Object.keys(c.d.pend).forEach(function (id) { if (c.d.pcs.some(function (p) { return p.id === id; })) nota.push({ t: "Auditoria: " + c.d.pend[id], cor: VERMELHO, attr: ' data-pend="auditoria-' + id + '"' }); });
    yy += D.textos(xr, yy, nota, T.nota * 0.9, { wmax: 155 }) + 3;
    Q.tabMarcas(c, xr, yy, ["DV", "DB", "DP", "DW", "DC", "DQ", "DY", "EL", "ED"], "QUADRO DE MARCAS DO DECK", 150);
    return { escala: "1:" + pl.esc0 };
  }

  /* ================================================================ D02 — CORTES */
  function corteDeck(c, id) {
    var k = K(c), dk = k.decks[id], s = sec(c, id), e = ((s.tabua && s.tabua.e) || 0.021) * 1000, bB = s.barrote.b * 1000, hB = s.barrote.h * 1000, bV = s.viga.b * 1000, hV = s.viga.h * 1000, pas = passoBarrote(c, id) * 1000;
    var circ = !!s.pilarete.d, bP = (circ ? s.pilarete.d : s.pilarete.b) * 1000, hPil = Math.max(150, dk.alturaDeck * 1000 - e - hB - hV), eng = (dk.pilaretes[0] || {}).tipo === "balanço engastado" || dk.estabilidade.tipo === "base-engastada";
    var temMF = !!dk.maoFrancesa, zV0 = 0, zB0 = hV, zT0 = hV + hB, gh = (k.q && k.q.guardaCorpo && k.q.guardaCorpo.h || 1.1) * 1000, tem = arr(k.trechosGC).some(function (t) { return !t.deck || t.deck === id; });
    function v1(cc, r, full) {
      var brk = !full && hPil > 1500, H = brk ? 600 : hPil;      /* transversal à viga: barrote em vista longitudinal sobre a viga em corte */
      var W = Math.max(bP, bV) + 1100, V = Q.vista(cc, r, { x0: -300, x1: 800, z0: -H - 60, z1: zT0 + e + (tem && !brk ? gh + 60 : 40) }, [14, 16, 10, 10], [20, 50, 100]);
      V.lin(-300, -H, 800, -H, "MAD-CONTEXTO");
      V.fundo(-bP / 2, -H, bP, H); if (circ) V.ret(-bP / 2, -H, bP, H, "MAD-CORTE"); else { V.mad(-bP / 2, -H, bP, H, { horiz: false }); V.ret(-bP / 2, -H, bP, H, "MAD-CORTE"); }
      V.fundo(-bV / 2, zV0, bV, hV); V.mad(-bV / 2, zV0, bV, hV, { horiz: false });
      V.fundo(-300, zB0, 1100, hB); V.mad(-300, zB0, 1100, hB, { horiz: true }); V.fundo(-300, zT0, 1100, e); V.ret(-300, zT0, 1100, e, "MAD-FINA");
      if (tem && !brk) { V.fundo(740, zT0 + e, 60, gh); V.ret(740, zT0 + e, 60, gh, "MAD-PECA"); }
      V.cv(zT0 + e, zV0, -300, -22, mm((zT0 + e) / 1000), { semExt: true }); if (brk) { V.quebra(-bP / 2 - 3, -H, bP + 6); V.tx(bP / 2 + 40, -H + 160, "pilar continua: altura total " + mm(hPil / 1000) + " (ver elevação geral)", c.D.E.T.nota * 0.9); } else V.cv(zV0, -H, -bP / 2 - 60, -18, mm(H / 1000), { semExt: true });
      V.bal(bV / 2, hV / 2, 40, 12, 1); V.bal(300, zB0 + hB / 2, 20, 14, 2); V.bal(300, zT0 + e / 2, 20, -22, 3); V.bal(bP / 2, -H / 2, 40, 0, 4);
      return V;
    }
    function v2(cc, r) {
      var brk = hPil > 1500, H = brk ? 600 : hPil;      /* longitudinal à viga: barrotes em corte sobre a viga, pilaretes abaixo, mão-francesa */
      var L = 1700, V = Q.vista(cc, r, { x0: -200, x1: L + 200, z0: -H - 60, z1: zT0 + e + 60 }, [10, 12, 10, 10], [20, 50, 100]);
      V.lin(-200, -H, L + 200, -H, "MAD-CONTEXTO");
      V.fundo(-100, zV0, L + 200, hV); V.mad(-100, zV0, L + 200, hV, { horiz: true });
      [0, pas, 2 * pas].forEach(function (x) { var X = 100 + x; V.fundo(X - bB / 2, zB0, bB, hB); V.mad(X - bB / 2, zB0, bB, hB, { horiz: false }); });
      V.fundo(-200, zT0, L + 400, e); V.ret(-200, zT0, L + 400, e, "MAD-FINA");
      [0, L].forEach(function (x) { V.fundo(x - bP / 2, -H, bP, H); V.ret(x - bP / 2, -H, bP, H, "MAD-CORTE"); });
      if (temMF) { var mf = Math.min(700, H * 0.7); [0, L].forEach(function (x, i) { var sg = i ? -1 : 1; V.lin(x + sg * bP / 2, -mf, x + sg * (bP / 2 + mf), zV0, "MAD-PRINCIPAL"); V.lin(x + sg * (bP / 2 + 60), -mf, x + sg * (bP / 2 + mf + 60), zV0, "MAD-PRINCIPAL"); }); }
      V.ch(100, 100 + pas, zT0 + e, 6, mm(pas / 1000), { semExt: true }); if (brk) { [0, L].forEach(function (x) { V.quebra(x - bP / 2 - 3, -H, bP + 6); }); } V.ch(0, L, -H, -10, mm(L / 1000), { semExt: true });
      V.bal(100 + L / 2, hV / 2, 0, 18, 1); V.bal(100 + pas, zB0 + hB / 2, 30, 18, 2); V.bal(L / 2, zT0 + e / 2, 20, -22, 3);
      return V;
    }
    var nt = ["1 - viga DV/DW " + mm(s.viga.b) + "x" + mm(s.viga.h) + " (η " + br(dk.pior.viga.eta, 2) + "); 2 - barrote " + mm(s.barrote.b) + "x" + mm(s.barrote.h) + " a cada " + mm(passoBarrote(c, id)) + " mm (η " + br(dk.pior.barrote.eta, 2) + "); 3 - tábua de cumaru " + mm((s.tabua && s.tabua.e) || 0.021) + " mm com fixação oculta inox (η " + br(dk.tabua.eta, 2) + "); 4 - " + (circ ? "pilar roliço Ø" : "pilarete ") + mm(circ ? s.pilarete.d : s.pilarete.b) + " (η " + br(dk.pior.pilar.eta, 2) + ", " + (dk.contraventamento ? "engastado-apoiado, topo travado pelo contraventamento em X (folha D07): L0 = " + br((dk.pilaretes[0] || {}).beta || 0, 2) + "·h" : eng ? "base engastada, topo livre: L0 = 2,0·h" : (temMF ? "rotulado, travado por mãos-francesas" : "estabilidade pela amarração")) + ").",
      "Níveis em metros, medidas em mm; terreno e cota do piso do levantamento (altura do piso " + br(dk.alturaDeck, 2) + " m). Barrote contínuo sobre as vigas; tábua biapoiada entre barrotes." + (tem ? " Guarda-corpo h " + gh + " mm: detalhe na folha D03." : "")];
    if (hPil > 1500) return { cod: "CORTES " + id, titulo: "DECK " + id + " - ELEVAÇÃO GERAL E CORTES À VIGA (PILAR QUEBRADO)", layout: "T", fracW: 0.30, frac: [0.38, 0.38], vistas: [{ t: "ELEVAÇÃO GERAL (altura total do pilar)", fn: function (cc, r) { return v1(cc, r, true); } }, { t: "CORTE TRANSVERSAL À VIGA (detalhe)", fn: v1 }, { t: "CORTE LONGITUDINAL À VIGA (detalhe)", fn: v2 }], notas: nt };
    return { cod: "CORTES " + id, titulo: "DECK " + id + " - CORTE TRANSVERSAL E LONGITUDINAL À VIGA", layout: "G", vistas: [{ t: "CORTE TRANSVERSAL À VIGA", fn: v1 }, { t: "CORTE LONGITUDINAL À VIGA", fn: v2 }], notas: nt };
  }
  function folhaD02(c) {
    var D = c.D, a = c.geo.area, gap = 6, n = ids(c).length || 1, ch = (a.h - 4 - gap * (n - 1)) / n, escs = [];
    ids(c).forEach(function (id, i) { escs = escs.concat(Q.celulaDet(c, a.x + 2, a.y + 2 + i * (ch + gap), a.w - 4, ch, corteDeck(c, id))); });
    return { escala: escs.length ? escs.filter(function (e, i) { return escs.indexOf(e) === i; }).sort(function (p, q) { return p - q; }).map(function (e) { return "1:" + e; }).join(" e ") : "1:20 e 1:50" };
  }

  /* ================================================================ D03 — GUARDA-CORPO: chapa de apoio e bloqueio */
  function detGC(c) {
    var k = K(c), g = k.guardaCorpo, fx = g.fixacao, q = k.q.guardaCorpo, vd = c.d.por(/^(DS|DI)-V\d+$/)[0] || { b: 0.16, h: 0.24 }, bV = Math.round(vd.b * 1000), hV = Math.round(vd.h * 1000), bM = Math.round(q.montante.b * 1000), tU = Math.round(q.fixacao.tChapaU * 1000), dB = Math.round(q.fixacao.d * 1000);
    var lado = fx.lado === "3d" ? 3 * dB : Math.round(fx.lado * 1000), tCh = 8, z = Math.round(fx.z * 1000), cTop = Math.max(4 * dB, 50), hGc = Math.round(q.h * 1000), s0 = sec(c, ids(c)[0]), hB = Math.round((s0.barrote || { h: 0.16 }).h * 1000), eT = Math.round(((s0.tabua && s0.tabua.e) || 0.021) * 1000), pas = Math.round(q.montante.passo * 1000), nB = fx.bloqueio.n;
    var bCor = Math.round(q.corrimao.b * 1000), hCor = Math.round(q.corrimao.h * 1000), bRg = Math.round(q.regua.b * 1000), passoRg = Math.round(q.regua.passo * 1000), hTr = 90, zTr = 50;
    var zPiso = hB + eT, zTopoC = zPiso + hGc, zMb = -(cTop + z + 60), zBolt = [-cTop, -cTop - z], hU = z + 90, zU0 = -(cTop + z + 45), nPar = 2;
    /* réguas: n mínimo para o vão livre ficar <= (passo - b), no máximo 110 mm (NBR 14718, 4.4.2.1), entre dois montantes */
    var Lc = pas - bM, gMax = Math.min(passoRg - bRg, 110), nR = Math.max(1, Math.ceil((Lc - gMax) / (bRg + gMax))), gEf = (Lc - nR * bRg) / (nR + 1);
    var pA = Q.ponto(c, "gc-chapa", "D03", "Geometria do suporte U e da chapa de apoio: o cálculo dá o lado (" + lado + " mm) e a espessura mínima (" + (fx.tChapaReq_mm != null ? br(fx.tChapaReq_mm, 1) : "-") + " mm); o suporte U de " + tU + " mm segue o LG13", "chapa " + lado + "x" + lado + "x" + tCh + " mm inox AISI 316; furos Ø" + (dB + 1) + "; chapa sob o parafuso de cima, alinhada ao topo da viga (o de baixo leva arruela 3d)", "RT");
    var pT = Q.ponto(c, "gc-travessa", "D03", "Travessa inferior do guarda-corpo (" + bCor + "x" + hTr + " mm, a " + zTr + " mm do piso): o cálculo verifica montante, corrimão e réguas, não a travessa", "travessa " + bCor + "x" + hTr + " mm da mesma madeira do corrimão", "RT");
    function v1(cc, r) {
      var V = Q.vista(cc, r, { x0: -bV - tCh - 46, x1: tU + bM + 60, z0: -hV - 12, z1: zTopoC + 10 }, [26, 30, 6, 6], [5, 10]);
      V.fundo(-bV, -hV, bV, hV); V.mad(-bV, -hV, bV, hV, { horiz: true });                                           /* viga de borda em corte */
      V.fundo(-bV - 150, 0, bV + 150, hB); V.mad(-bV - 150, 0, bV + 150, hB, { horiz: true });                       /* barrote contínuo sobre a viga (corte longitudinal) */
      V.fundo(-bV - 150, hB, bV + 150, eT); V.ret(-bV - 150, hB, bV + 150, eT, "MAD-FINA");                          /* tábua */
      V.oc(-bV, 0, bV, hB);                                                                                          /* bloqueio entre barrotes, atrás do corte */
      V.lin(-bV, 0, 0, hB, "MAD-OCULTA"); V.lin(-bV, hB, 0, 0, "MAD-OCULTA");
      V.aco(-bV - tCh, -lado, tCh, lado);                                                                           /* chapa de apoio do lado oposto, topo alinhado ao da viga */
      V.aco(-bV - 3, zBolt[1] - 18, 3, 36);                                                                         /* arruela 3d do parafuso de baixo */
      V.aco(0, zU0, tU, hU);                                                                                         /* base do suporte em U, encostada na face da viga */
      V.fundo(tU, zMb, bM, zTopoC - hCor - zMb); V.mad(tU, zMb, bM, zTopoC - hCor - zMb, { horiz: false });         /* montante ENCOSTADO no suporte */
      V.fundo(tU + bM / 2 - bCor / 2, zTopoC - hCor, bCor, hCor); V.mad(tU + bM / 2 - bCor / 2, zTopoC - hCor, bCor, hCor, { horiz: true });
      zBolt.forEach(function (zb) { V.ret(-bV - tCh - 20, zb - dB / 2, bV + tCh + 20 + tU + bM + 18, dB, "MAD-LIG"); V.vis(tU + bM, zb - 9, 14, 18, "MAD-LIG"); V.vis(-bV - tCh - 14, zb - 9, 14, 18, "MAD-LIG"); V.lin(-bV - tCh - 26, zb, tU + bM + 20, zb, "MAD-EIXO"); });
      V.cv(zTopoC, zPiso, tU + bM + 30, 8, String(hGc), { semExt: true }); V.cv(0, zBolt[0], tU + bM + 30, 8, String(cTop), { semExt: true }); V.cv(zBolt[0], zBolt[1], tU + bM + 30, 8, String(z), { semExt: true });
      V.cv(0, -hV, -bV - tCh - 30, -8, String(hV), { semExt: true }); V.cv(0, -lado, -bV - tCh - 14, -8, String(lado), { semExt: true });
      V.ch(-bV, 0, -hV, -6, String(bV), { semExt: true }); V.ch(tU, tU + bM, zMb, -6, String(bM), { semExt: true });
      V.bal(-bV - tCh / 2, -lado / 2, -22, 40, 1); V.bal(tU / 2, zU0 + hU, 22, 36, 2); V.bal(-bV / 2, zBolt[0], 0, 50, 3); V.bal(tU + bM / 2, zPiso + 500, 40, 0, 4); V.bal(-bV / 2, hB / 2, -10, 60, 5); V.bal(tU + bM / 2 + bCor / 2, zTopoC - hCor / 2, 34, -20, 6);
      return V;
    }
    function v2(cc, r) {
      var V = Q.vista(cc, r, { x0: -pas - 190, x1: pas + 190, z0: -hV - 12, z1: zTopoC + 12 }, [14, 16, 6, 12], [10, 20]), xm = [-pas, 0, pas], wU = bM + 2 * tU + 12, i, j, x, xa;
      V.fundo(-pas - 190, -hV, 2 * pas + 380, hV); V.mad(-pas - 190, -hV, 2 * pas + 380, hV, { horiz: true });         /* viga de borda (face externa) */
      V.fundo(-pas - 190, 0, 2 * pas + 380, zPiso); V.ret(-pas - 190, 0, 2 * pas + 380, hB, "MAD-FINA"); V.ret(-pas - 190, hB, 2 * pas + 380, eT, "MAD-FINA");
      xm.forEach(function (xc) {
        V.oc(xc - lado / 2, -lado, lado, lado);                                                                      /* chapa de apoio (do lado oposto, oculta) */
        V.acoV(xc - wU / 2, zU0, wU, hU);                                                                            /* suporte em U */
        V.fundo(xc - bM / 2, zMb, bM, zTopoC - hCor - zMb); V.mad(xc - bM / 2, zMb, bM, zTopoC - hCor - zMb, { horiz: false });
        zBolt.forEach(function (zb) { V.furo(xc, zb, dB, true); });
      });
      for (i = 0; i < 2; i++) {
        xa = xm[i] + bM / 2;
        V.fundo(xa, zPiso + zTr, pas - bM, hTr); V.mad(xa, zPiso + zTr, pas - bM, hTr, { horiz: true });                                         /* travessa inferior */
        V.fundo(xa, zTopoC - hCor, pas - bM, hCor); V.mad(xa, zTopoC - hCor, pas - bM, hCor, { horiz: true });                                   /* corrimão */
        for (j = 0; j < nR; j++) { x = xa + gEf + j * (bRg + gEf); V.fundo(x, zPiso + zTr + hTr, bRg, zTopoC - hCor - zPiso - zTr - hTr); V.mad(x, zPiso + zTr + hTr, bRg, zTopoC - hCor - zPiso - zTr - hTr, { horiz: false }); }
      }
      V.ch(-pas, 0, zTopoC, 10, String(pas), { semExt: true }); V.ch(0, pas, zTopoC, 10, String(pas), { semExt: true });
      V.cv(zTopoC, zPiso, pas + 60, 8, String(hGc), { semExt: true }); V.cv(0, -hV, -pas - 190, -8, String(hV), { semExt: true });
      V.ch(xm[1] + bM / 2 + gEf + bRg, xm[1] + bM / 2 + 2 * gEf + bRg, zPiso + zTr + hTr + 400, 4, String(Math.round(gEf)), { semExt: true });
      V.bal(xm[1], zPiso + 600, 60, 0, 4); V.bal(xm[1] + pas / 2, zTopoC - hCor / 2, 0, 24, 6); V.bal(xm[1] + pas / 2, zPiso + zTr + hTr / 2, 0, -24, 8); V.bal(xm[1] + bM / 2 + gEf + bRg / 2 + 2 * (bRg + gEf), zPiso + 700, 0, 26, 7); V.bal(xm[0], zU0 + hU / 2, -36, 0, 2); V.bal(xm[0], zBolt[0], -52, 30, 3);
      return V;
    }
    function v3(cc, r) {
      var V = Q.vista(cc, r, { x0: -lado - 40, x1: lado + 120, z0: -lado / 2 - 8, z1: lado / 2 + 8 }, [18, 12, 8, 14], [1, 2]), xc = -lado / 2 - 20, hy = lado / 2 - cTop;
      V.acoV(xc - lado / 2, -lado / 2, lado, lado); V.furo(xc, hy, dB + 1, true);                                    /* planta da chapa: furo a cTop da borda de cima */
      V.ch(xc - lado / 2, xc + lado / 2, -lado / 2, -6, String(lado), { semExt: true }); V.cv(lado / 2, -lado / 2, xc - lado / 2, -6, String(lado), { semExt: true });
      V.cv(lado / 2, hy, xc + lado / 2, 8, String(cTop), { semExt: true }); V.ch(xc - lado / 2, xc, hy, 4, String(Math.round(lado / 2)), { semExt: true });
      V.tx(xc - lado / 2 + 4, lado / 2 + 2, "Ø" + (dB + 1) + " (M" + dB + ")", cc.D.E.T.nota * 0.9);
      V.acoV(lado / 2 + 30, -lado / 2, tCh, lado); V.lin(lado / 2 + 20, hy, lado / 2 + 30 + tCh + 20, hy, "MAD-EIXO");   /* vista lateral: espessura 8 mm */
      V.ch(lado / 2 + 30, lado / 2 + 30 + tCh, -lado / 2, -6, String(tCh), { semExt: true });
      return V;
    }
    var m1 = { d: dB, a1: 0, a2: z, a3: 200, a3c: 200, a4t: cTop, a4c: hV - cTop - z, alfa: Math.PI / 2 }, esp = EP.espacos(m1).filter(function (x) { return /^(a2|a4)/.test(x.nome); });
    var n = [
      { t: "D03 (derivado do LG13, Padrão v2.11): guarda-corpo h = " + hGc + " mm, montantes " + bM + "x" + bM + " a cada " + pas + " mm FIXADOS NA FACE da viga de borda, FIXAÇÃO CALCULADA: tração de " + br(fx.T, 1) + " kN no parafuso de cima (NBR 14718, 4.4.3.1; carga de segurança ou 1,0 kN/m, a maior)." },
      "1 - CHAPA DE APOIO inox AISI 316 " + lado + "x" + lado + "x" + tCh + " mm do lado OPOSTO da viga, sob o parafuso de cima (arruela 3d NÃO serve: η ≈ 9); 2 - suporte inox em U de " + tU + " mm; 3 - " + nPar + " parafusos passantes M" + dB + " A4-70 em prumo, z = " + z + " mm, atravessando montante, suporte, viga e chapa, com arruela e porca; 4 - montante encostado no suporte; 5 - BLOQUEIO entre barrotes (" + nB + " parafusos WT-T de rosca total) contra a torção da viga de borda; 6 - corrimão " + bCor + "x" + hCor + "; 7 - réguas " + bRg + " mm (" + nR + " por vão, vão livre " + Math.round(gEf) + " mm ≤ 110 mm, NBR 14718, 4.4.2.1); 8 - travessa inferior " + bCor + "x" + hTr + " (" + pT + ").",
      "Aço cotado: chapa " + lado + "x" + lado + "x" + tCh + " (espessura mínima calculada " + (fx.tChapaReq_mm != null ? br(fx.tChapaReq_mm, 1) : "-") + " mm); furos Ø" + (dB + 1) + "; parafuso de cima a " + cTop + " mm do topo da viga. η: embutimento " + br(fx.etaArr, 2) + ", aço " + br(fx.etaAco, 2) + ", bloqueio " + br(fx.bloqueio.eta, 2) + ", interação " + br(fx.eta, 2) + ".",
      "a1-a4 dos parafusos M" + dB + " (mm: real | mínimo, NBR 7190-1:2022, Tab. 14): " + esp.map(function (x) { return x.nome + " = " + Math.round(x.real) + " | " + br(x.min, 0) + (x.ok ? "" : " NÃO ATENDE"); }).join("; ") + ". " + pA + ".",
      "Carga de uso/segurança: " + g.dados.c.linha + ". Montante η " + br(g.montante.eta, 2) + ", deslocamento do topo " + br(g.deslocamento.mm, 1) + " mm (limite 25 mm)."];
    return { cod: "D03", titulo: "GUARDA-CORPO COM CHAPA DE APOIO E BLOQUEIO", layout: "T", fracW: 0.34, frac: [0.46, 0.22], vistas: [{ t: "CORTE (perpendicular à viga)", fn: v1 }, { t: "ELEVAÇÃO (ao longo da viga)", fn: v2 }, { t: "CHAPA DE APOIO (peça isolada)", fn: v3 }], notas: n };
  }

  function folhaD03(c) {
    var D = c.D, a = c.geo.area;
    if (!K(c).guardaCorpo) { D.texto(a.x + 10, a.y + 20, "O projeto não tem guarda-corpo de madeira.", D.E.T.titulo); return { escala: "INDICADA" }; }
    var escs = Q.celulaDet(c, a.x + 2, a.y + 2, a.w - 4, a.h - 4, detGC(c));
    return { escala: escs.map(function (e) { return "1:" + e; }).join(" e ") };
  }

  /* ================================================================ D04 — ESCADA */
  function folhaD04(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, k = K(c), E = k.escada, ep = k.escadaParams || {};
    I.tituloVista(D, a.x + 4, a.y + 2, "ESCADA - LONGARINAS, DEGRAUS, APOIO E LIGAÇÃO AO DECK", "ESC conforme as vistas");
    if (!E || E.tipo !== "madeira") {
      var vo = ep.vao, nd = ep.degraus || 0, nTxt = [];
      if (vo && nd > 0 && Math.abs(vo.y1 - vo.y0) > 0.3 && Math.abs(vo.z1 - vo.z0) > 0.2) {
        var Lh2 = Math.abs(vo.y1 - vo.y0) * 1000, dz2 = Math.abs(vo.z1 - vo.z0) * 1000, run2 = Lh2 / nd, rise2 = dz2 / nd, eD2 = ((ep.degrau && ep.degrau.e) || 0.04) * 1000;
        var v1o = function (cc, r) {
          var V = Q.vista(cc, r, { x0: -400, x1: Lh2 + 500, z0: -250, z1: dz2 + 400 }, [16, 16, 10, 12], [20, 50, 100]), i;
          V.lin(-400, 0, Lh2 + 500, 0, "MAD-CONTEXTO");
          var Pg = [[0, 0], [Lh2, dz2], [Lh2, 0]].map(function (q) { return [V.X(q[0]), V.Y(q[1])]; }); cc.D.poli(Pg, "MAD-CONTEXTO", true);
          for (i = 0; i < nd; i++) V.ret(i * run2, (i + 1) * rise2, run2 + 20, eD2, "MAD-FINA");
          V.ret(Lh2, dz2 - 60, 400, 60, "MAD-PECA"); V.tx(Lh2 + 40, dz2 + 120, "borda do deck", T.nota * 0.9); V.tx(Lh2 * 0.5 + 150, dz2 * 0.12, "ESTRUTURA: OUTRO MATERIAL", T.nota * 0.9);
          V.ch(0, Lh2, 0, -10, mm(Lh2 / 1000), { semExt: true }); V.cv(dz2, 0, -60, -10, mm(dz2 / 1000), { semExt: true });
          V.bal(run2 * 2.5, 3 * rise2 + eD2 / 2, -30, -40, 1); V.bal(Lh2 - 100, dz2 - 30, 40, 40, 2);
          return V;
        };
        var esO = Q.celulaDet(c, a.x + 2, a.y + 17, a.w - 4, a.h - 21, { cod: "D04", titulo: "ESCADA DE OUTRO MATERIAL - DEGRAUS DE CUMARU", layout: "G", fracA: 0.72, vistas: [{ t: "ELEVAÇÃO LATERAL (esquemática, medidas do levantamento)", fn: v1o }], notas: ["1 - " + nd + " degraus de cumaru " + Math.round(eD2) + " mm (marca ED, passo " + Math.round(run2) + " mm, espelho " + Math.round(rise2) + " mm); 2 - apoio do topo no deck: projeto da escada.", "Escada de OUTRO material (concreto, na arquitetura). A estrutura da escada e a fixação dos degraus são do projeto da escada.", "Entram neste projeto só os " + nd + " degraus de cumaru (marca ED) como item de orçamento. A reação da escada no deck é do projeto da escada (apoio em viga própria) ou informada ao RT.", "Sem longarinas de madeira neste projeto: nenhuma reação da escada foi somada às vigas do deck."] });
        return { escala: esO.map(function (x) { return "1:" + x; }).join(" e ") };
      }
      D.textos(a.x + 10, a.y + 24, ["Escada de OUTRO material (concreto, na arquitetura).", "A estrutura da escada e a fixação dos degraus são do projeto da escada.", "Entram neste projeto só os " + (ep.degraus || 0) + " degraus de cumaru (marca ED) como item de orçamento.", "A reação da escada no deck é do projeto da escada (apoio em viga própria) ou informada ao RT.", "Sem longarinas de madeira neste projeto: nenhuma reação da escada foi somada às vigas do deck."], T.nota, { wmax: a.w - 20 });
      return { escala: "SEM ESCALA" };
    }
    var e = ep.longarinas, Lh = E.Lh * 1000, dz = (e.z1 - e.z0) * 1000, bL = e.b * 1000, hL = e.h * 1000, n = ep.degraus || 6, eD = ((ep.degrau && ep.degrau.e) || 0.04) * 1000, run = Lh / n, rise = dz / n;
    function v1(cc, r) {
      var V = Q.vista(cc, r, { x0: -300, x1: Lh + 400, z0: -200, z1: dz + 500 }, [14, 16, 10, 10], [20, 50, 100]);
      V.lin(-300, 0, Lh + 400, 0, "MAD-CONTEXTO");
      var P = [[0, 0], [Lh, dz], [Lh, dz - hL / Math.cos(Math.atan(dz / Lh))], [0, -hL / Math.cos(Math.atan(dz / Lh))]].map(function (q) { return [V.X(q[0]), V.Y(q[1])]; }); cc.D.poli(P, "MAD-PRINCIPAL", true);
      for (var i = 0; i < n; i++) V.ret(i * run, (i + 1) * rise, run + 20, eD, "MAD-FINA");
      V.conc(-300, -200, 300, 200); V.fundo(Lh - 20, dz - 200, 400, 520); V.ret(Lh, dz - 100, 400, 100, "MAD-PECA");
      V.ch(0, Lh, 0, -10, mm(E.Lh), { semExt: true }); V.cv(dz, 0, -40, -8, mm(dz / 1000), { semExt: true });
      V.bal(Lh / 2, dz / 2 - 60, 30, 20, 1); V.bal(run * 2.5, 3 * rise + eD / 2, -20, -26, 2); V.bal(Lh + 100, dz - 50, 40, 20, 3); V.bal(0, 0, -26, -14, 4);
      return V;
    }
    function v2(cc, r) {
      var V = Q.vista(cc, r, { x0: -250, x1: 1250, z0: -hL - 20, z1: eD + 80 }, [8, 12, 10, 10], [10, 20]);
      var xs = (e.xs || []).map(function (x) { return (x - e.xs[0]) * 1000 + 100; });
      V.fundo(0, eD, 1000 + 100, 0); V.ret(0, 0, 1100, eD, "MAD-FINA"); xs.forEach(function (x) { V.fundo(x - bL / 2, -hL, bL, hL); V.mad(x - bL / 2, -hL, bL, hL, { horiz: false }); });
      V.ch(xs[0], xs[xs.length - 1] || xs[0] + 1, eD + 40, 6, mm((e.xs[e.xs.length - 1] - e.xs[0])), { semExt: true }); V.cv(0, -hL, -20, -6, mm(e.h), { semExt: true });
      V.bal(xs[0], -hL / 2, -24, 0, 1); V.bal(550, eD / 2, 0, 24, 2);
      return V;
    }
    var rcg = E.R, lb = ligD(c, "ESC/topo");
    var nt = ["1 - longarina " + mm(e.b) + "x" + mm(e.h) + " (η " + br(E.longarina.eta, 2) + "); 2 - degraus " + (n) + " un de cumaru " + eD + " mm (η " + br(Math.max(E.degrauConcentrada.eta, E.degrauDistribuida.eta), 2) + "); 3 - ligação ao deck: " + E.ligacaoTopo.n + " parafusos Ø12 em corte duplo (η " + br(E.ligacaoTopo.eta, 2) + "); 4 - apoio na base " + br(E.apoioBase.sigma, 2) + " MPa ≤ " + br(E.apoioBase.resistencia, 2) + " MPa (η " + br(E.apoioBase.eta, 2) + ").",
      "Reação de cálculo por longarina " + br(rcg, 2) + " kN; a reação do topo é SOMADA às vigas do deck (alavanca entre as duas vigas vizinhas): ver memorial T7.", "Inclinação " + br(E.inclinacao, 1) + " gr, vão horizontal " + br(E.Lh, 2) + " m, carga 2,5 kN/m² (NBR 6120, Tab. 10) e 2,5 kN no degrau (nota t)."];
    var escs = Q.celulaDet(c, a.x + 2, a.y + 10, a.w - 4, a.h - 14, { cod: "D04", titulo: "ESCADA DE MADEIRA", layout: "G", vistas: [{ t: "ELEVAÇÃO LATERAL", fn: v1 }, { t: "VISTA SUPERIOR DOS DEGRAUS (planta)", fn: v2 }], notas: nt });
    return { escala: escs.map(function (x) { return "1:" + x; }).join(" e ") };
  }

  /* ================================================================ D05 — LIGAÇÕES DO DECK */
  function detLig(c, tipo) {
    var id = ids(c)[0], s = sec(c, id), b = s.barrote, v = s.viga, p = s.pilarete, bB = b.b * 1000, hB = b.h * 1000, bV = v.b * 1000, hV = v.h * 1000, bP = (p.d || p.b) * 1000, ligK = { bv: id + "/barroteViga", vp: id + "/vigaPilarete", base: ids(c).slice().reverse()[0] + "/base", mf: id + "/maoFrancesa" }[tipo], L = ligD(c, ligK);
    if (!L) return null;
    var eta = L.eta != null ? br(L.eta, 2) : "-", nt = [(L.descricao || "") + " η = " + eta + (L.ok === false ? " (NÃO ATENDE)" : " (VERIFICADA)") + ".", (L.passos || []).slice(0, 2).join(" ")];
    var cod = { bv: "LGD1", vp: "LGD2", base: "LGD3", mf: "LGD4" }[tipo], tit = { bv: "BARROTE x VIGA", vp: "VIGA x PILARETE", base: "BASE DO PILAR", mf: "MÃO-FRANCESA" }[tipo];
    function va(cc, r) {
      var V = Q.vista(cc, r, { x0: -bV / 2 - 60, x1: bV / 2 + 60, z0: -hV - (tipo === "base" ? 200 : 140), z1: hB + 60 }, [12, 16, 10, 10], [5, 10, 20]);
      if (tipo === "bv") { V.fundo(-bV / 2, -hV, bV, hV); V.mad(-bV / 2, -hV, bV, hV, { horiz: false }); V.fundo(-bB / 2 - 120, 0, bB + 240, hB); V.mad(-bB / 2 - 120, 0, bB + 240, hB, { horiz: true }); [-1, 1].forEach(function (sg) { V.lin(sg * 20, hB * 0.8, sg * (20 + hB * 0.8), -hV * 0.45, "MAD-LIG"); }); V.ch(-bB / 2, bB / 2, hB, 8, mm(b.b), { semExt: true }); V.cv(hB, 0, bB / 2 + 120, 8, mm(b.h), { semExt: true }); V.bal(0, hB / 2, 30, 20, 1); V.bal(10, -hV / 2, 40, 10, 2); }
      else if (tipo === "vp") { V.fundo(-bV / 2 - 40, -hV, bV + 80, hV); V.mad(-bV / 2 - 40, -hV, bV + 80, hV, { horiz: true }); V.fundo(-bP / 2, -hV - 140, bP, 140); V.ret(-bP / 2, -hV - 140, bP, 140, "MAD-CORTE"); V.aco(-3, -hV - 140, 6, 200); [0, 1].forEach(function (i) { V.pino(0, -hV + 40 - i * 60, 12, true); }); V.ch(-bP / 2, bP / 2, -hV - 140, -8, mm(p.d || p.b), { semExt: true }); V.bal(0, -hV / 2, 40, -10, 1); V.bal(0, -hV - 70, 40, 10, 2); }
      else if (tipo === "base") { V.conc(-bV / 2 - 60, -hV - 200, bV + 120, 120); V.fundo(-bP / 2, -hV - 80, bP, 80 + hV); V.ret(-bP / 2, -hV - 80, bP, 80 + hV, "MAD-CORTE"); V.aco(-bP / 2 - 20, -hV - 100, bP + 40, 20); [-1, 1].forEach(function (sg) { V.oc(sg * (bP / 2 + 10) - 6, -hV - 200, 12, 180); }); V.ch(-bP / 2, bP / 2, -hV - 200, -6, mm(p.d || p.b), { semExt: true }); V.bal(0, -hV, 40, 0, 1); V.bal(bP / 2 + 10, -hV - 150, 40, 10, 2); }
      else { V.fundo(-bP / 2, -hV - 140, bP, hV + 140 + hB); V.ret(-bP / 2, -hV - 140, bP, hV + 140 + hB, "MAD-CORTE"); V.lin(bP / 2, -hV - 60, bP / 2 + 500, 0, "MAD-PRINCIPAL"); V.lin(bP / 2, -hV - 130, bP / 2 + 500, -70, "MAD-PRINCIPAL"); [0, 1].forEach(function (i) { V.pino(bP / 2 + 40 + i * 40, -hV - 70 - i * 35 * 0, 12, true); }); V.bal(bP / 2 + 250, -hV / 2, 30, 20, 1); }
      return V;
    }
    return { cod: cod, titulo: tit, layout: "G", vistas: [{ t: "VISTA", fn: va }], notas: nt };
  }
  function folhaD05(c) {
    var D = c.D, a = c.geo.area, gap = 6, cw = (a.w - 4 - gap) / 2, ch = (a.h - 66 - gap) / 2, escs = [];
    ["bv", "vp", "base", "mf"].forEach(function (t, i) { var det = detLig(c, t); if (!det) return; escs = escs.concat(Q.celulaDet(c, a.x + 2 + (i % 2) * (cw + gap), a.y + 2 + Math.floor(i / 2) * (ch + gap), cw, ch, det)); });
    var yy = a.y + 2 + ch + gap / 2; D.linha(a.x + 2, yy, a.x + a.w - 2, yy, "MAD-COTA"); var xx = a.x + 2 + cw + gap / 2; D.linha(xx, a.y + 2, xx, a.y + 2 + 2 * ch + gap, "MAD-COTA");
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "1:10 e 1:20" };
  }

  /* ================================================================ D06 — TABELAS: peças, ferragens, reações para a fundação, premissas */
  function ferragensDeck(c) {
    var k = K(c), it = [], fx = k.guardaCorpo && k.guardaCorpo.fixacao, bases = [], L = (k.ligacoes && k.ligacoes.ligacoes) || {};
    function fq(id) { var s = 0; c.d.fonteTodos.forEach(function (p) { if (p.id === id) s += p.qtd == null ? 1 : p.qtd; }); return s; }
    var nMont = c.d.fonteTodos.filter(function (p) { return /^GC\d+$/.test(p.id); }).reduce(function (a, p) { return a + Math.ceil((p.comprimento_m || 0) / ((k.q && k.q.guardaCorpo.montante.passo) || 1.2)) + 1; }, 0);
    if (fx) {
      if (fx.lado !== "3d") it.push({ ferr: "Chapa de apoio inox AISI 316 " + Math.round(fx.lado * 1000) + "x" + Math.round(fx.lado * 1000) + "x8 mm (guarda-corpo, lado oposto da viga)", qtd: nMont, kg: nMont * fx.lado * fx.lado * 0.008 * 7900, lig: "D03" });
      it.push({ ferr: "Parafuso passante inox A4-70 M12 com arruela e porca (2 por montante)", qtd: nMont * 2, kg: null, lig: "D03" });
      it.push({ ferr: "Parafuso de rosca total WT-T 8,2x190 do bloqueio entre barrotes (" + fx.bloqueio.n + " por bloqueio)", qtd: nMont * fx.bloqueio.n, kg: null, lig: "D03" });
    }
    it.push({ ferr: "Apoio da viga do deck: chapa inox em U 6 mm + 2 chumbadores M12 + calço de neoprene", qtd: fq("DS-APOIO") || null, kg: null, lig: "LG12" });
    Object.keys(L).forEach(function (kk) {
      if (/\/base$/.test(kk) && L[kk].n) { var np = (k.decks[kk.split("/")[0]] || { pilaretes: [] }).pilaretes.length; it.push({ ferr: "Chumbador inox A4-70 M" + Math.round(L[kk].d * 1000) + " com ancoragem química - base dos pilares do deck " + kk.split("/")[0] + " (" + L[kk].n + " por pilar)", qtd: L[kk].n * np, kg: null, lig: "LGD3" }); }
      if (/\/amarracao$/.test(kk)) it.push({ ferr: "Parafuso/chumbador inox Ø" + Math.round(L[kk].n ? 12 : 12) + " de amarração à edificação (deck " + kk.split("/")[0] + ") + chapa de apoio " + L[kk].chapaApoio_mm + " mm", qtd: L[kk].n, kg: null, lig: "LGD5" });
    });
    Object.keys(k.decks || {}).forEach(function (id2) {      /* E4 r11: ferragens do contraventamento em X (DY) */
      var cx = k.decks[id2].contraventamento; if (!cx) return; var lD = L[id2 + "/cvDiagonal"], lP = L[id2 + "/cvPilar"], nPt = cx.nDiag * 2;
      if (cx.tipo === "tirante") { it.push({ ferr: "Tirante inox A4-70 Ø" + Math.round(cx.d * 1000) + " mm com esticador e olhais (" + cx.nDiag + " tirantes, " + I.br(cx.comprimentoTotal_m, 1) + " m)", qtd: cx.nDiag, kg: cx.comprimentoTotal_m * Math.PI * cx.d * cx.d / 4 * 7900, lig: "D07" }); }
      else { it.push({ ferr: "Chapa interna de aço inox 316 t = 8 mm nas pontas das diagonais DY (fenda de 10 mm)", qtd: nPt, kg: nPt * 0.008 * Math.max(0.1, cx.h - 0.05) * 0.60 * 7900, lig: "D07" }); if (lD) it.push({ ferr: "Pino inox Ø" + Math.round(lD.d * 1000) + " mm das pontas das diagonais DY (" + lD.n + " por ponta)", qtd: nPt * lD.n, kg: null, lig: "D07" }); }
      it.push({ ferr: "Chapa/olhal inox 316 t = 8 mm de ligação ao pilar roliço (contraventamento)", qtd: nPt, kg: nPt * 0.008 * 0.20 * 0.30 * 7900, lig: "D07" });
      if (lP) it.push({ ferr: "Parafuso passante inox Ø" + Math.round(lP.d * 1000) + " mm da ligação ao pilar (" + lP.n + " por ponta)", qtd: nPt * lP.n, kg: null, lig: "D07" });
    });
    var nMF = fq("DS-MF") || c.d.fonteTodos.filter(function (p) { return /-MF\d+$/.test(p.id); }).reduce(function (a, p) { return a + (p.qtd == null ? 1 : p.qtd); }, 0);
    if (nMF) it.push({ ferr: "Mão-francesa MLC tratada 6x12 + 4 parafusos Ø12 inox (2 por ponta)", qtd: nMF, kg: null, lig: "LGD4" });
    return it;
  }
  function folhaD06(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, k = K(c), y = a.y + 2, wL = (a.w - 8) * 0.52, xR = a.x + 4 + wL + 6, wR = a.x + a.w - 4 - xR;
    var hT = I.tituloVista(D, a.x + 4, y, "TABELA DE PEÇAS DO DECK", "SEM ESCALA - volumes da fonte, sem perdas") + 2;
    var tab = c.d.marcas.tab, cols = [{ t: "MARCA" }, { t: "QTD" }, { t: "CLASSE" }, { t: ["b x h", "(cm)"] }, { t: ["L", "(cm)"] }, { t: ["VOL.", "(m3)"] }], tv = 0, tq = 0;
    var lin = tab.map(function (m) { tv += m.volTot; tq += m.qtd; return [{ t: m.marca, attr: ' data-tab-marca="' + m.marca + '"' }, { t: String(m.qtd), attr: ' data-tab-qtd="' + m.marca + "|" + m.qtd + '"' }, m.classe, m.sec, String(m.Lcm), { t: I.br(m.volTot, 3), attr: ' data-tab-vol="' + m.marca + "|" + Math.round(m.volTot * 1e6) / 1e6 + '"' }]; });
    lin.push({ total: [{ t: "TOTAL" }, { t: String(tq), attr: ' data-tab-total-qtd="' + tq + '"' }, "", "", "", { t: I.br(tv, 3), attr: ' data-tab-total-vol="' + Math.round(tv * 1e6) / 1e6 + '"' }] });
    var hl = Math.max(3.4, Math.min(4.6, (a.h - 30) / (lin.length + 2))), tb = D.tabela(a.x + 4, y + hT, cols, lin, { fs: T.tabela * 0.9, hl: hl });
    var yy = y + hT + tb.h + 6, sem = c.d.fonteTodos.filter(function (p) { return !p.secao && !/^(WT-|GC)/.test(p.id); });
    if (sem.length) { I.tituloVista(D, a.x + 4, yy, "ITENS SEM GEOMETRIA (ÁREA/METRAGEM/UNIDADE)", null); D.tabela(a.x + 4, yy + 8, [{ t: "ID" }, { t: "DESCRIÇÃO", al: "E" }, { t: "QTD" }, { t: "UN." }], sem.map(function (p) { return [p.id, String(p.descricao || "").slice(0, 60), { t: I.br(p.qtd, 2), attr: ' data-sem-geo="' + p.id + '"' }, p.unidade || ""]; }), { fs: T.tabela * 0.95, hl: 3.8 }); }
    /* ferragens */
    var f = ferragensDeck(c), h2 = I.tituloVista(D, xR, y, "TABELA DE FERRAGENS DO DECK", "SEM ESCALA - * kg estimado (volume x 7.900 kg/m3)") + 2;
    var tk = 0, lf = f.map(function (q, i) { tk += q.kg || 0; return [String(i + 1), { t: q.ferr, al: "E" }, { t: q.qtd == null ? "-" : I.br(q.qtd, 0), attr: ' data-ferr-qtd="' + (i + 1) + "|" + q.qtd + '"' }, q.kg ? I.br(q.kg, 1) + " *" : "-", q.lig]; });
    lf.push({ total: ["", { t: "TOTAL kg" }, "", { t: I.br(tk, 1) }, ""] });
    var t2 = D.tabela(xR, y + h2, [{ t: "ITEM" }, { t: "FERRAGEM", al: "E" }, { t: "QTD" }, { t: "kg" }, { t: "DETALHE" }], lf, { fs: T.tabela * 0.95, hl: 4.4 }), y2 = y + h2 + t2.h + 6;
    /* reações para a fundação */
    var h3 = I.tituloVista(D, xR, y2, "REAÇÕES PARA A FUNDAÇÃO (valores de cálculo, ELU)", "N > 0 compressão; Nmin = só permanente (arrancamento); H e M na base") + 2;
    var rl = arr(k.reacoes).map(function (r0) { return [r0.id, r0.tipo, { t: I.br(r0.Nmax, 1), attr: ' data-reac="' + r0.id + "|" + Math.round(r0.Nmax * 100) / 100 + '"' }, I.br(r0.Nmin, 1), I.br(r0.Hd, 2), r0.engastado ? I.br(r0.Md, 1) : "-"]; });
    var t3 = D.tabela(xR, y2 + h3, [{ t: "PILAR" }, { t: "BASE", al: "E" }, { t: ["N máx", "(kN)"] }, { t: ["N mín", "(kN)"] }, { t: ["H", "(kN)"] }, { t: ["M", "(kN.m)"] }], rl, { fs: T.tabela * 0.95, hl: Math.max(3.4, Math.min(4.4, (a.h - y2 - h3 - 70) / (rl.length + 1))) }), y3 = y2 + h3 + t3.h + 5;
    var pr = arr(k.premissas).map(function (p0) { return { t: p0.texto + " [confirma: " + p0.quem + "]", attr: ' data-premissa="' + p0.cod + '"' }; });
    pr.unshift("Vento do cálculo da base NÃO inclui a ação do vento em sucção no deck (arrancamento): conferir com o projetista da fundação.");
    I.tituloVista(D, xR, y3, "PREMISSAS ADOTADAS - A CONFIRMAR PELO RT", null);
    D.textos(xR, y3 + 8, pr, T.nota * 0.9, { wmax: wR });
    return { escala: "SEM ESCALA" };
  }

  /* E4 r12: estabilidade em português na nota da folha 01 (antes saía o identificador interno, "maos-francesas"/"base-engastada", e o deck inferior com X dizia só "base-engastada") */
  function estabTxt(e) {
    e = e || {}; var t = e.tipo, base = t === "maos-francesas" ? "mãos-francesas nos pilaretes" : t === "base-engastada" ? "pilares engastados na base" : t === "amarracao" ? "amarração à edificação" : (t || "NÃO DEFINIDA");
    return base + (e.contraventamento > 0 ? ", com contraventamento em X (folha D07)" : "");
  }

  /* ================================================================ D07 — PÓRTICOS CONTRAVENTADOS (E4 r11, R34): elevação dos quadros X e Y + detalhe da ligação da diagonal */
  function cvDeck(c) { var k = K(c), r = null; ids(c).forEach(function (id) { var dv = k.decks[id]; if (!r && dv && dv.contraventamento) r = { id: id, dv: dv, cv: dv.contraventamento }; }); return r; }
  function folhaD07(c) {
    var D = c.D, a = c.geo.area, X = cvDeck(c); if (!X) { D.texto(a.x + 10, a.y + 20, "O deck não tem contraventamento em X.", D.E.T.titulo); return { escala: "INDICADA" }; }
    var id = X.id, dv = X.dv, cv = X.cv, s = sec(c, id), pil = dv.pilaretes[0] || {}, bP = (s.pilarete.d || s.pilarete.b) * 1000, hV = s.viga.h * 1000, bV = s.viga.b * 1000, hB = s.barrote.h * 1000, e = ((s.tabua && s.tabua.e) || 0.021) * 1000;
    var hP = Math.round((pil.h || 6) * 1000), zn0 = 400, zn1 = hP - 400, tirante = cv.tipo === "tirante", wD = (tirante ? cv.d : cv.b) * 1000, hD = (tirante ? cv.d : cv.h) * 1000, gv = cv.gov, ligD = gv.ligDiag, ligP = gv.ligPilar;
    function quad(dir) { return cv.quadros.filter(function (q) { return q.dir === dir; })[0]; }
    function diagonal(V, x0, z0, x1, z1, w, cam) {
      if (tirante) { V.lin(x0, z0, x1, z1, cam); return; }
      var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), nx = -dz / L * w / 2, nz = dx / L * w / 2;
      V.lin(x0 + nx, z0 + nz, x1 + nx, z1 + nz, cam); V.lin(x0 - nx, z0 - nz, x1 - nx, z1 - nz, cam); V.lin(x0 + nx, z0 + nz, x0 - nx, z0 - nz, cam); V.lin(x1 + nx, z1 + nz, x1 - nx, z1 - nz, cam);
    }
    function elev(dir) {
      return function (cc, r) {
        var q = quad(dir) || { vao: 3 }, vao = Math.round(q.vao * 1000);
        var V = Q.vista(cc, r, { x0: -bP / 2 - 1100, x1: vao + bP / 2 + 700, z0: -520, z1: hP + hV + hB + e + 520 }, [16, 12, 10, 10], [50, 100, 200]);
        V.lin(-bP / 2 - 600, 0, vao + bP / 2 + 600, 0, "MAD-CONTEXTO");
        [0, vao].forEach(function (x) { V.conc(x - bP / 2 - 200, -300, bP + 400, 300); V.fundo(x - bP / 2, 0, bP, hP); V.ret(x - bP / 2, 0, bP, hP, "MAD-CORTE"); });
        if (dir === "X") { V.fundo(-bP / 2 - 150, hP, vao + bP + 300, hV); V.mad(-bP / 2 - 150, hP, vao + bP + 300, hV, { horiz: true }); }
        else [0, vao].forEach(function (x) { V.fundo(x - bV / 2, hP, bV, hV); V.mad(x - bV / 2, hP, bV, hV, { horiz: false }); });
        V.fundo(-bP / 2 - 300, hP + hV, vao + bP + 600, hB + e); V.ret(-bP / 2 - 300, hP + hV, vao + bP + 600, hB + e, "MAD-FINA");
        diagonal(V, 0, zn0, vao, zn1, wD, "MAD-PRINCIPAL"); diagonal(V, vao, zn0, 0, zn1, wD, "MAD-PRINCIPAL");
        V.cadV([hP, zn1, zn0, 0], -bP / 2 - 250, -16, [mm((hP - zn1) / 1000), mm((zn1 - zn0) / 1000), mm(zn0 / 1000)], { semExt: true }); V.cv(hP, 0, -bP / 2 - 560, -16, mm(hP / 1000), { semExt: true });
        V.ch(0, vao, 0, -8, mm(vao / 1000), { semExt: true }); V.niv(vao + bP / 2 + 300, hP + hV + hB + e, "+" + br(dv.alturaDeck, 2), 1); V.niv(vao + bP / 2 + 300, 0, "0,00", 1);
        V.bal(vao / 2, (zn0 + zn1) / 2 + 150, 120, 40, 1); V.bal(vao, hP * 0.55, 50, 0, 2); V.bal(dir === "X" ? vao / 3 : 0, hP + hV / 2, dir === "X" ? 0 : -60, 40, 3); V.bal(vao, zn1, 60, 40, 4); V.bal(0, 0, 60, -20, 5);
        return V;
      };
    }
    function det(cc, r) {
      var Ldet = 1000, h = Math.max(hD, 60), V = Q.vista(cc, r, { x0: -150, x1: Ldet + 1000, z0: -120, z1: h + 200 }, [14, 14, 10, 10], [5, 10, 20]);
      if (tirante) {
        V.lin(0, h / 2, 700, h / 2, "MAD-PRINCIPAL"); V.ret(250, h / 2 - 25, 220, 50, "MAD-LIG"); V.aco(700, 0, 8, h + 40); V.pino(704, h / 2, 20, true); V.bal(350, h / 2 + 40, 20, 40, 1); V.bal(704, h + 40, 40, 20, 2);
        V.tx(0, -80, "esticador (terminal de aperto) + olhal; chapa 8 mm com " + ((ligP && ligP.n) || 0) + " parafusos passantes Ø" + Math.round(((ligP && ligP.d) || 0.012) * 1000) + " no pilar", c.D.E.T.nota * 0.9);
        return V;
      }
      var nc = (ligD && ligD.nc) || 2, nr = (ligD && ligD.nr) || 2, d = ((ligD && ligD.d) || 0.016) * 1000, a1 = ((ligD && ligD.a1) || 0.1) * 1000, a3 = ((ligD && ligD.a3) || 0.1) * 1000, aa = ((ligD && ligD.centroGrupo && ligD.centroGrupo.a) || 0) * 1000;
      V.fundo(0, 0, Ldet, h); V.mad(0, 0, Ldet, h, { horiz: true }); V.oc(0, 25, a3 * 2 + (nr - 1) * a1 + 40, h - 50);
      var xs = [], zs = nc === 1 ? [h / 2] : [h / 2 - aa, h / 2 + aa], i;
      for (i = 0; i < nr; i++) { xs.push(a3 + i * a1); zs.forEach(function (zz) { V.pino(a3 + i * a1, zz, d, true); }); }
      V.ch(0, a3, h, 6, mm(a3 / 1000), { semExt: true }); if (nr > 1) V.cadH(xs, h, 18, xs.slice(1).map(function (x, k) { return mm((x - xs[k]) / 1000); }), { semExt: true });
      if (nc > 1) V.cv(h / 2 + aa, h / 2 - aa, xs[xs.length - 1] + 120, 10, mm(2 * aa / 1000), { semExt: true }); V.cv(h, 0, -60, -10, mm(h / 1000), { semExt: true });
      V.eixoV(xs[0], -90, h + 90); V.tx(xs[0] - 12, h + 110, "A", c.D.E.T.nota * 1.1); V.tx(xs[0] - 12, -150, "A", c.D.E.T.nota * 1.1);      /* traço do corte AA pelo eixo da primeira coluna de pinos */
      V.bal(Ldet - 120, h * 0.8, 30, 40, 1); V.bal(a3, h / 2, -40, -50, 2); V.bal(xs[Math.floor(nr / 2)], h / 2, 40, -50, 3);
      var X0 = Ldet + 350, b = wD; V.fundo(X0, 0, b, h); V.mad(X0, 0, b, h, { horiz: false }); V.aco(X0 + b / 2 - 4, 25, 8, h - 50); zs.forEach(function (zz) { V.pino(X0 + b / 2, zz, d, true); });
      V.ch(X0, X0 + b, 0, -8, mm(b / 1000), { semExt: true }); V.tx(X0 - 20, h + 60, "CORTE AA", c.D.E.T.nota * 0.9);
      return V;
    }
    var qx = quad("X"), qy = quad("Y"), nt = [];
    function eta(x) { return x == null || !isFinite(x) ? "sem solução" : br(x, 2); }
    nt.push({ t: "1 - " + (tirante ? "tirante inox Ø" + mm(cv.d) + " mm com esticador (só tração, pré-tensionado)" : "diagonal de MLC " + mm(cv.b) + "x" + mm(cv.h) + " mm (só tração no modelo; a comprimida não é creditada)") + ": Fd máx. " + br(gv.Fd, 1) + " kN, η tração " + eta(gv.etaTracao) + ", rigidez K_br η " + eta(gv.etaK) + ". 2 - pilar roliço Ø" + mm(s.pilarete.d) + ", engastado-apoiado, L0 = " + br(pil.beta || 0, 2) + "·h = " + br(pil.L0 || 0, 2) + " m, η " + eta(pil.eta) + ". 3 - viga " + mm(s.viga.b) + "x" + mm(s.viga.h) + ". 4 - ligação da diagonal ao pilar: chapa de aço t = 8 mm + " + ((ligP && ligP.n) || 0) + " parafusos passantes Ø" + Math.round(((ligP && ligP.d) || 0.012) * 1000) + " mm, η " + eta(ligP && ligP.eta) + ". 5 - base: chumbadores da folha D05 (LGD3).", attr: ' data-d07="notas"', cor: cv.ok ? null : VERMELHO });
    nt.push("Quadro X: vão " + (qx ? br(qx.vao, 2) : "-") + " m, Vd " + (qx ? br(qx.V, 1) : "-") + " kN, diagonal a " + (qx ? br(qx.theta, 0) : "-") + " gr. Quadro Y: vão " + (qy ? br(qy.vao, 2) : "-") + " m, Vd " + (qy ? br(qy.V, 1) : "-") + " kN, a " + (qy ? br(qy.theta, 0) : "-") + " gr. Binário vertical nos pilares: ± " + br(cv.Nov, 1) + " kN (arrancamento no pé do pilar do lado da diagonal tracionada).");
    nt.push("Ponta da diagonal: " + (ligD ? ligD.n + " pinos inox Ø" + mm(ligD.d) + " em " + ligD.nc + " coluna(s) x " + ligD.nr + " linha(s), a1 = " + mm(ligD.a1) + " mm, a3 = " + mm(ligD.a3) + " mm, chapa interna de aço t = 8 mm em fenda de 10 mm; η " + eta(ligD.eta) + " (NBR 7190-1:2022, cap. 7)." : "tirante com olhal; ver a nota 4.") + " Pré-tensão dos tirantes/esticadores e acabamento inox A4: pelo fabricante; ρk do pilar roliço para a ligação adotado igual ao da MLC (a favor), a confirmar.");
    var escs = Q.celulaDet(c, a.x + 2, a.y + 2, a.w - 4, a.h - 4, { cod: "D07", titulo: "DECK " + id + " - PÓRTICOS CONTRAVENTADOS EM X E LIGAÇÃO DA DIAGONAL", layout: "T", fracW: 0.30, frac: [0.38, 0.34], vistas: [{ t: "ELEVAÇÃO DO QUADRO Y (vão menor)", fn: elev("Y") }, { t: "ELEVAÇÃO DO QUADRO X (vão maior)", fn: elev("X") }, { t: tirante ? "DETALHE DO TIRANTE" : "DETALHE DA PONTA DA DIAGONAL E CORTE AA", fn: det }], notas: nt });
    return { escala: escs.length ? escs.filter(function (e0, i) { return escs.indexOf(e0) === i; }).sort(function (p, q) { return p - q; }).map(function (e0) { return "1:" + e0; }).join(" e ") : "1:50 e 1:10" };
  }

  /* ================================================================ NOTAS, GERAR */
  function naoEmitir(res) {
    var imp = [], k = res.deck; if (!k) return ["Sem resultado do cálculo do deck (T7): o caderno do deck não pode ser emitido."];
    if (k.semSolucao) imp.push("O dimensionamento do deck não encontrou solução: NÃO EMITIDO para execução.");
    if (k.ligacoes && k.ligacoes.ok === false) imp.push("Ligação do deck que NÃO ATENDE: ver folhas D03 e D05.");
    arr(res.auditoria && res.auditoria.achados).forEach(function (a0) { if (/^(DS-|DI-|ESC-|GC)/.test(a0.peca || "") || /deck|guarda|escada|ligacao-deck/.test(a0.regra)) imp.push("Auditoria: " + String(a0.mensagem || "").slice(0, 110)); });
    return imp;
  }
  function blocosNotas(c, rev) {
    var imp = naoEmitir(c.res).map(function (t) { return { t: t, cor: VERMELHO }; });
    var lista = ["D01 - Planta estrutural do deck", "D02 - Cortes transversal e longitudinal", "D03 - Guarda-corpo: chapa de apoio e bloqueio", "D04 - Escada", "D05 - Ligações do deck", "D06 - Tabelas de peças e ferragens, reações para a fundação"].concat(cvDeck(c) ? ["D07 - Pórticos contraventados em X e ligação da diagonal"] : []);
    var notas = ["Cotas e seções de madeira em milímetros nos detalhes e em centímetros nas tabelas; níveis em metros. Não medir no desenho.",
      "Deck calculado pela NBR 7190-1:2022 (classe de umidade 4, exposto), NBR 6120:2019 e NBR 14718:2019; memorial do T7 no pacote.",
      "Tratamento NBR 16143 (autoclave) nas peças em contato com a umidade; proteção de topo em toda peça exposta; ferragem inox A4 em área externa/litorânea; madeira nunca em contato com o concreto.",
      "Premissas adotadas (Qk da tábua, região do guarda-corpo, classes D40/D60 sem laudo, fu do parafuso e pressão do vento) estão listadas na folha D06 e dependem do RT.",
      "VERMELHO = o que impede emitir (ligação que não atende, achado aberto da auditoria). Pontos a confirmar e valores adotados ficam em preto no quadro da folha D05.",
      "Projeto executivo do deck - revisão " + rev + "."];
    var bl = []; if (imp.length) bl.push({ titulo: "NÃO EMITIR PARA EXECUÇÃO", cor: VERMELHO, itens: imp });
    bl.push({ titulo: "LISTA DE DESENHOS", itens: lista }, { titulo: "NOTAS GERAIS", numerar: true, itens: notas }, { titulo: "NORMAS", itens: ["NBR 7190-1:2022; NBR 7190:1997 Anexo A (desenho)", "NBR 6120:2019, 14718:2019, 8681:2003", "NBR 16143 (preservação)"] });
    return bl;
  }

  function gerar(res, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    var P = Q.PR(); if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || !res.deck || !res.fonte || !arr(res.fonte.pecas).length) return { ok: false, folhas: [], avisos: ["Resultado sem o cálculo do deck (res.deck): não há pranchas do deck."] };
    var E = I.estilo(opcoes.padrao); Object.keys(Q.PADRAO_ENG.base).forEach(function (kk) { var b = E.camadas[Q.PADRAO_ENG.base[kk]]; E.camadas[kk] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA"), codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-ENG", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: "", pc: [], cels: [] }; ctx0.d = contexto(res); ctx0.pend = ctx0.d.pend;
    var ORDEM = [["D01", "deck-planta", folhaD01, "PLANTA ESTRUTURAL DO DECK"], ["D02", "deck-cortes", folhaD02, "CORTES DO DECK"], ["D03", "deck-guarda-corpo", folhaD03, "GUARDA-CORPO: CHAPA DE APOIO E BLOQUEIO"], ["D04", "deck-escada", folhaD04, "ESCADA"], ["D05", "deck-ligacoes", folhaD05, "LIGAÇÕES DO DECK"], ["D06", "deck-tabelas", folhaD06, "TABELAS DE PEÇAS E FERRAGENS, REAÇÕES PARA A FUNDAÇÃO"]];
    if (cvDeck(ctx0)) ORDEM.push(["D07", "deck-porticos", folhaD07, "PÓRTICOS CONTRAVENTADOS EM X E LIGAÇÃO DA DIAGONAL"]);
    var feitas = [];
    ORDEM.forEach(function (def) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (kk) { c[kk] = ctx0[kk]; }); c.D = D; c.rotulo = def[0];
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: def[0], titulo: def[3] });
    });
    var ult = feitas[4]; if (ult) { var cq = {}; Object.keys(ctx0).forEach(function (kk) { cq[kk] = ctx0[kk]; }); cq.D = ult.D; cq.rotulo = ult.rotulo; if (ctx0.pc.length) { var aa = geo.area; cq.pc.pos = { x: aa.x + 4, y: aa.y + aa.h - 56, w: aa.w - 8, yb: aa.y + aa.h - 1, rotulo: ult.rotulo }; try { Q.quadroPontos(cq); } catch (e) { avisos.push("Quadro de pontos a confirmar: " + e.message); } } }
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madengdeckpranchas", nome: "Estrutura de madeira - DECK, escada e guarda-corpo - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt(opcoes.obra), proprietario: Q.txt(opcoes.proprietario), contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO DO DECK", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosNotas(ctx0, rev), camadas = {}; Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (kk) { camadas[kk] = Q.MP.PADRAO_MAD.camadas[kk]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (kk) { camadas[kk] = Q.PADRAO_ENG.layers[kk]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA"); if (!I.colunaNotas(Fd, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      var rotuloFolha = f.rotulo + "/" + feitas.length; I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '"><title>' + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(Q.FAIXA) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = D.caixas; return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, tabela: ctx0.d.marcas.tab, ferragens: ferragensDeck(ctx0), reacoes: arr(res.deck.reacoes), marcas: ctx0.d.marcas.porId, desenhaveis: ctx0.d.pcs, celulas: ctx0.cels, pontos: ctx0.pc, naoEmitir: naoEmitir(res) };
  }

  var MadEngDeck = { gerar: gerar, contexto: contexto, ferragens: function (res) { return ferragensDeck({ res: res, d: contexto(res) }); }, naoEmitir: naoEmitir };
  global.MadEngDeck = MadEngDeck;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngDeck;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

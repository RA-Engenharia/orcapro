/* =====================================================================
 * madt3tupranchas.js — PRANCHAS DA T3TU (telhado de 4 águas em T e U, rincão em cada canto côncavo) em MLC. Etapa 3b, item 2. Motor PURO, sem DOM, Node-testável.
 * Mesmo padrão, mesmo carimbo RA e mesmo conjunto de folhas da T3L (js/madt3lpranchas.js), adaptado a N asas: reaproveita os desenhistas internos do L (MadEngT3L._i: vista de peças, célula de nó,
 * grupos de pinos, elevação/corte/chapa do nó) e os da madeira engenharada (MadEngPranchas._p). O desenho SAI DOS MEMBROS do resultado (res.t3.membros, já APARADOS, com o eixo de cálculo em
 * eixo0/eixo1): nunca caixa cinza, nunca planta desenhada à mão. Nenhuma folha sai vazia: sem membros/ligações o gerador RECUSA com a mensagem.
 *   MadEngT3TU.gerar(res, opcoes) → { ok, folhas, avisos, tabela, marcas, celulas, desenhaveis }
 * Folhas: E01 planta de cobertura (espigões, rincões, cumeeiras, terças, tesouras) com EIXOS e COTAS · E02 planta de tesouras, terças e frechal (com o quadro de tesouras por asa) ·
 *         E03 elevações frontal e lateral · E04 cortes longitudinais por asa · E05 tesouras tipo e meias-tesouras por asa · E06 (e E06b) detalhes dos nós: espigão no canto e na cumeeira, rincão no vértice V
 *         e no canto côncavo, meia-tesoura, ponta da MI, terça no espigão/rincão, espigão interno e caibro de meio (elevação com chapa + pinos e a folga de 10 mm cotada) ·
 *         E07 quadro de ligações, folgas, NÃO VERIFICADO e pendências ao RT · E10 lista de peças · fichas de corte (js/madencaixepranchas.js).
 * Fontes e decisões: docs/madeira/T3TU-REFERENCIA.md (§10 e §11).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I;
  function PL() { return dep("MadEngT3L", "./madt3lpranchas.js"); }
  function SX() { return dep("MadT3LSaidas", "./madt3lsaidas.js"); }
  var VERMELHO = "#c00000";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { return I.br(v, c); }
  function R(x, n) { var p = Math.pow(10, n == null ? 3 : n); return Math.round(x * p) / p; }
  function X() { return PL()._i; }

  /** eixos de uma planta: valores distintos (mm), os mais importantes primeiro, sem dois a menos de `sep` metros */
  function eixosDe(prior, resto, sep) {
    var v = [];
    function poe(x, forte) { x = R(x, 3); for (var i = 0; i < v.length; i++) if (Math.abs(v[i] - x) < (forte ? 1e-6 : sep)) { return; } v.push(x); }
    prior.forEach(function (x) { poe(x, true); }); resto.forEach(function (x) { poe(x, false); });
    v.sort(function (a, b) { return a - b; });
    return v;
  }
  function eixosXY(res) {
    var TM = dep("MadT3TUMembros", "./madt3tumembros.js"), p = res.t3.params, inf = res.t3.info, cnt = TM.contornoDe(p).concat(TM.furoDe(p) || []), xs = [], ys = [];
    cnt.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); });
    var vx = eixosDe(xs, arr(inf.xs).concat(arr(inf.pernas).map(function (L) { return L.xc; })), 0.5), vy = eixosDe(ys, arr(inf.pernas).reduce(function (o, L) { return o.concat(arr(L.zs)); }, []).concat([inf.b / 2]).concat(inf.anel ? [inf.anel.c - inf.b / 2] : []), 0.5);
    return { X: vx.map(function (v, i) { return { v: v, nome: String(i + 1) }; }), Y: vy.map(function (v, i) { return { v: v, nome: String.fromCharCode(65 + i) }; }) };
  }
  function nomeAsa(res, asa) { return asa === "A" ? "BARRA (asa A)" : "PERNA " + (asa === "B" ? "1 (asa B)" : "2 (asa C)"); }
  function tipoTes(res) { return res.t3.info.tesouraTipo === "howe" ? "HOWE" : "PRATT"; }

  /* ---- E01: planta de cobertura ---- */
  function folhaE01(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t3.info, lista = d.pcs.filter(function (p) { return !/^(PD|DG|MP|MG|DX|DV|DP|LB)$/.test(p.g); });
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA DE COBERTURA - ESPIGÕES, RINCÕES, CUMEEIRAS, TERÇAS, TESOURAS E MEIAS-TESOURAS (EIXOS E COTAS)", fw: 0.64 }), f3 = pl.f3, camada = X().camadaDe;
    var ord = { P: 0, PO: 0, FR: 1, T: 2, BS: 2, MS: 2, CB: 2, CM: 3, BI: 3, MI: 3, E: 4, RC: 5 };
    var itens = Q.desenharLista(D, c, lista.slice().sort(function (p, q) { return (ord[p.g] || 0) - (ord[q.g] || 0); }), f3, camada), ex = eixosXY(res);
    Q.eixosEmPlanta(c, f3, ex.X, ex.Y, pl.caixa, 12);
    Q.rotular(c, itens.filter(function (it) { return /^(E|RC|CM|BI|MI|FR)$/.test(it.pc.g); }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return /^(BS|MS|CB|T)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 34 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.prefixo === "PL"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var xr = a.x + a.w * 0.66, yr = a.y + 18, PREFS = ["PL", "FR", "EP", "RC", "CB", "CM", "BS", "BI", "MS", "MI", "TL"];
    var Lg = Q.legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "espigão EP, RINCÃO RC, cumeeiras CM, banzos inferiores BI e MI, terças TL" }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL, frechal FR, banzos superiores BS e MS, caibro de meio CB" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    var yS = yr + Lg + 6, tx = [], legs = arr(inf.pernas), nRC = d.pcs.filter(function (p) { return p.g === "RC"; }).length, nEP = d.pcs.filter(function (p) { return p.g === "E"; }).length;
    tx.push("Telhado de 4 águas em " + inf.planta + " (MESMA inclinação i = " + Q.pct(inf.incl) + "), beiral " + br(inf.beiral, 2) + " m em todos os lados; barra " + br(inf.a, 2) + " x " + br(inf.b, 2) + " m (cumeeira a " + br(inf.hA - inf.Hp, 2) + " m do frechal)" + legs.map(function (L) { return "; perna " + (L.j + 1) + " de " + br(L.w, 2) + " x " + br(L.c - inf.b, 2) + " m a partir da barra (cumeeira a " + br(L.hB - inf.Hp, 2) + " m)"; }).join("") + ".");
    tx.push(nEP + " espigões EP (os do canto convexo vão do canto à cumeeira; os INTERNOS ligam o vértice V ao topo da cumeeira) e " + nRC + " RINCÃO(ÕES) RC, um por canto côncavo, até o vértice V da perna; terças das águas nas mesmas linhas, com ponta em bisel composto assentada no espigão ou no rincão (estribo, folga >= 10 mm). CALHA metálica sobre cada rincão.");
    tx.push("Frechal FR em anel: para a >= 10 mm do espigão/rincão em cada canto; a tração do anel passa pela CINTA de aço e a compressão do canto côncavo, pela sela do rincão (detalhes na folha E06). Eixos 1.. n e A.. n a partir dos vértices e das tesouras; cotas entre eixos em cm.");
    var yy2 = yS + 4 + D.textos(xr, yS + 4, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 }) + 2;
    Q.tabMarcas(c, xr, yy2 + 4, PREFS.filter(function (mk) { return d.pcs.some(function (p) { return p.prefixo === mk; }); }), "QUADRO DE MARCAS DA COBERTURA", 150);
    return { escala: "1:" + pl.esc0 };
  }

  /* ---- E02: planta de tesouras, terças e frechal + quadro de tesouras por asa ---- */
  function folhaE02(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t3.info, lista = d.pcs.filter(function (p) { return /^(P|PO|FR|T|BS|MS|CB|CM)$/.test(p.g); });
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA DE TESOURAS, TERÇAS E FRECHAL (BANZOS SUPERIORES, TERÇAS TL, FRECHAL FR E PILARES PL)", fw: 0.64 }), f3 = pl.f3;
    var itens = Q.desenharLista(D, c, lista.slice().sort(function (p, q) { var o = { P: 0, PO: 0, FR: 1, T: 2, CM: 2, BS: 3, MS: 3, CB: 3 }; return (o[p.g] || 0) - (o[q.g] || 0); }), f3, X().camadaDe), ex = eixosXY(res);
    Q.eixosEmPlanta(c, f3, ex.X, ex.Y, pl.caixa, 12);
    Q.rotular(c, itens.filter(function (it) { return /^(BS|MS|CB)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 34 });
    Q.rotular(c, itens.filter(function (it) { return /^(T|FR|CM)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.prefixo === "PL"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var xr = a.x + a.w * 0.66, yr = a.y + 18;
    var Lg = Q.legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "cumeeira CM, terças TL" }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL, frechal FR, banzo superior BS/MS (eixo da tesoura), caibro de meio CB" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    var linhas = [], legs = arr(inf.pernas);
    linhas.push(["Barra (A)", tipoTes(res) + ", planos Z = const", br(inf.b, 2), String(arr(inf.xs).length), arr(inf.xs).map(function (x) { return br(x, 2); }).join("; ")]);
    legs.forEach(function (L) { linhas.push(["Perna " + (L.j + 1) + " (" + L.asa + ")", tipoTes(res) + ", planos X = const", br(L.w, 2), String(arr(L.zs).length), arr(L.zs).map(function (z) { return br(z, 2); }).join("; ")]); });
    var meias = d.pcs.filter(function (p) { return p.g === "MS"; }).map(function (p) { return p.marca || p.id; }), yT = yr + Lg + 8;
    var hT = I.tituloVista(D, xr, yT, "QUADRO DE TESOURAS POR ASA", null) + 1;
    var tb = D.tabela(xr, yT + hT, [{ t: "ASA" }, { t: ["TIPO", "E PLANO"] }, { t: ["VÃO", "(m)"] }, { t: "Nº" }, { t: ["POSIÇÕES", "NO EIXO (m)"] }], linhas, { fs: T.tabela * 0.85 });
    var tx = ["Meias-tesouras nas cabeceiras livres: " + (meias.length ? meias.filter(function (m, i, A) { return A.indexOf(m) === i; }).join(", ") : "nenhuma (pontas da barra encostadas nas pernas levam caibro de meio CB e tirante MI)") + ".", "A tesoura só existe onde há parede nos DOIS lados; nas bocas das pernas o assento fica a >= " + br(inf.assento, 2) + " m do canto côncavo (folga >= 20 mm entre pilares). Terças BIAPOIADAS entre tesouras, com emenda passante em cada tesoura (só força axial).", "Onde a perna é SOLTA (T) a boca não tem tirante nem meia-tesoura do lado do canto côncavo: o travamento é feito pelo X de diagonais no plano do banzo inferior (DX), dimensionado no cálculo."];
    D.textos(xr, yT + hT + tb.h + 6, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + pl.esc0 };
  }

  /* ---- E03: elevações ---- */
  function folhaE03(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, tudo = d.pcs.filter(function (p) { return !/^(DX|DV|DP|LB)$/.test(p.g); }), h = (a.h - 10) / 2, w = a.w * 0.68, vp = X().vistaPecas;
    var v1 = vp(c, tudo, "xz", a.x + 4, a.y + 2, w, h, "ELEVAÇÃO FRONTAL (EIXO X) - PROJEÇÃO DE TODAS AS PEÇAS");
    var v2 = vp(c, tudo, "yz", a.x + 4, a.y + 2 + h + 6, w, h, "ELEVAÇÃO LATERAL (EIXO Z) - PROJEÇÃO DE TODAS AS PEÇAS");
    Q.rotular(c, v1.itens.filter(function (it) { return /^(E|RC|CM|T|FR)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var inf = c.res.t3.info, xr = a.x + w + 12, legs = arr(inf.pernas);
    var tx = ["Cumeeira da barra a " + br(inf.hA, 2) + " m do piso" + legs.map(function (L) { return "; cumeeira da perna " + (L.j + 1) + " a " + br(L.hB, 2) + " m" + (L.igual ? " (largura igual à da barra: mesma altura)" : " (mais estreita: cumeeira mais BAIXA)"); }).join("") + ". Pé-direito no respaldo: " + br(inf.Hp, 2) + " m.", "Espigões e rincões aparecem em escorço nas duas elevações; as terças são projetadas sobre o plano.", "Cortes longitudinais por asa: folha E04. Tesouras e meias-tesouras tipo de cada asa: folha E05."];
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc };
  }

  /* ---- E04: cortes longitudinais por asa (as peças que cruzam a faixa do plano da cumeeira da asa) ---- */
  function folhaE04(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, inf = res.t3.info, legs = arr(inf.pernas), n = 1 + legs.length, h = (a.h - 6 * n) / n, w = a.w * 0.72, vp = X().vistaPecas, tx = [], k = 0, esc0 = null;
    var base = d.pcs.filter(function (p) { return !/^(DX|DV|DP|LB)$/.test(p.g); });
    function faixa(lista, ci, lo, hi) { return lista.filter(function (p) { var m0 = Math.min(p.p0[ci], p.p1[ci]), m1 = Math.max(p.p0[ci], p.p1[ci]); return m1 >= lo - 1e-6 && m0 <= hi + 1e-6; }); }
    var ws = Math.max(0.6, inf.dz * 0.5), zc = inf.b / 2;
    var vA = vp(c, faixa(base, 1, zc - ws, zc + ws), "xz", a.x + 4, a.y + 2, w, h, "CORTE LONGITUDINAL DA BARRA (PLANO DA CUMEEIRA, Z = " + br(zc, 2) + " m) - PEÇAS NA FAIXA DE " + br(2 * ws, 2) + " m"); Q.rotular(c, vA.itens.filter(function (it) { return /^(E|RC|CM|T|FR|CB|MI)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 26 }); esc0 = vA.esc; k++;
    tx.push("Barra: faixa de " + br(2 * ws, 2) + " m em torno da cumeeira (Z = " + br(zc, 2) + " m); os banzos das tesouras aparecem em corte transversal.");
    legs.forEach(function (L) {
      var v = vp(c, faixa(base, 0, L.xc - ws, L.xc + ws), "yz", a.x + 4, a.y + 2 + k * (h + 6), w, h, "CORTE LONGITUDINAL DA PERNA " + (L.j + 1) + " (PLANO DA CUMEEIRA, X = " + br(L.xc, 2) + " m) - PEÇAS NA FAIXA DE " + br(2 * ws, 2) + " m");
      Q.rotular(c, v.itens.filter(function (it) { return /^(E|RC|CM|T|FR|MI|CB)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 26 }); k++;
      tx.push("Perna " + (L.j + 1) + ": faixa em torno da cumeeira (X = " + br(L.xc, 2) + " m); o rincão sobe do canto côncavo ao vértice V (Z = " + br(L.V[1], 2) + " m, cota " + br(L.hB, 2) + " m).");
    });
    var xr = a.x + w + 12; D.textos(xr, a.y + 8, tx.concat(["Cada corte é a projeção, no plano vertical da cumeeira, das peças cujo eixo cruza a faixa indicada (madeira engenharada, seções reais do cálculo)."]), T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + esc0 };
  }

  /* ---- E05: tesoura tipo e meia-tesoura de cada asa ---- */
  function folhaE05(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, inf = res.t3.info, legs = arr(inf.pernas), n = 1 + legs.length, h = (a.h - 8 * n) / n, w = a.w * 0.36, vp = X().vistaPecas, tx = [], escs = [];
    var pil = d.pcs.filter(function (p) { return /^(P|PO)$/.test(p.g); }), tip = tipoTes(res), M = res.t3.membros;
    function ult(asa) { var m = -1; M.forEach(function (x) { if (x.asa === asa && x.tes != null && x.tes > m) m = x.tes; }); return m; }
    var linhas = [{ asa: "A", nome: "BARRA", plano: "yz", pos: inf.xs[0], tes: 0, eixo: 0, msel: function (p) { return p.agua === "E" && /^(MS|MI|MP|MG)$/.test(p.g); }, mpos: [inf.a, inf.b / 2], mplano: "xz", mtxt: "MEIA-TESOURA DA CABECEIRA LESTE (EIXO Z = " + br(inf.b / 2, 2) + " m)" }];
    legs.forEach(function (L) { linhas.push({ asa: L.asa, nome: "PERNA " + (L.j + 1), plano: "xz", pos: L.zs[L.zs.length - 1], tes: ult(L.asa), eixo: 1, xl: L.xl, xr: L.xr, msel: function (p) { return p.agua === "N" && Math.abs(p.p0[0] - L.xc) < 1e-6 && /^(MS|MI|MP|MG)$/.test(p.g); }, mpos: [L.xc, L.c], mplano: "yz", mtxt: "MEIA-TESOURA DA CABECEIRA DA PERNA " + (L.j + 1) + " (EIXO X = " + br(L.xc, 2) + " m)" }); });
    linhas.forEach(function (ln, i) {
      var y = a.y + 2 + i * (h + 8), lista = d.pcs.filter(function (p) { return p.asa === ln.asa && p.tes === ln.tes && /^(BS|BI|PD|DG)$/.test(p.g); });
      var pp = pil.filter(function (p) { return ln.eixo === 0 ? Math.abs(p.p0[0] - ln.pos) < 1e-3 : (Math.abs(p.p0[1] - ln.pos) < 1e-3 && p.p0[0] >= ln.xl - 1e-3 && p.p0[0] <= ln.xr + 1e-3); });
      if (lista.length) { var v1 = vp(c, lista.concat(pp), ln.plano, a.x + 4, y, w, h, "TESOURA TIPO DA " + ln.nome + ", " + tip + " (EIXO " + (ln.eixo === 0 ? "X" : "Z") + " = " + br(ln.pos, 2) + " m) - ELEVAÇÃO"); Q.rotular(c, v1.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 }); escs.push(v1.esc); }
      var ml = d.pcs.filter(ln.msel);
      if (ml.length) { var pm = pil.filter(function (p) { return Math.abs(p.p0[0] - ln.mpos[0]) < 1e-3 && Math.abs(p.p0[1] - ln.mpos[1]) < 1e-3; }), v2 = vp(c, ml.concat(pm), ln.mplano, a.x + 8 + w, y, w, h, ln.mtxt + " - ELEVAÇÃO"); Q.rotular(c, v2.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 }); escs.push(v2.esc); }
      else { var cb = d.pcs.filter(function (p) { return (p.g === "CB" || p.g === "MI") && (p.agua === "E" || p.agua === "W") && ln.asa === "A"; }); if (cb.length) { var v3 = vp(c, cb, "xz", a.x + 8 + w, y, w, h, "CABECEIRA DA BARRA ENCOSTADA NA PERNA - CAIBRO DE MEIO CB E TIRANTE MI - ELEVAÇÃO"); Q.rotular(c, v3.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 }); escs.push(v3.esc); } }
    });
    var xr = a.x + 2 * w + 16;
    tx.push("A diagonal " + (inf.tesouraTipo === "howe" ? "Howe é comprimida: a ponta é cortada em bisel com folga >= 10 mm das faces do banzo e do montante; a carga passa só pela chapa interna e pelos pinos." : "Pratt é tracionada; o montante é comprimido sob gravidade."));
    tx.push("Cada asa tem a SUA tesoura (vão e altura próprios): barra com vão " + br(inf.b, 2) + " m" + legs.map(function (L) { return ", perna " + (L.j + 1) + " com vão " + br(L.w, 2) + " m"; }).join("") + ". A tesoura da boca de cada perna assenta no pilar do canto côncavo e na parede, a >= " + br(inf.assento, 2) + " m do canto; não tem balanço do lado do canto côncavo (ali a água é a da barra).");
    tx.push("Meias-tesouras apoiam no pilar da parede e, no cume, na tesoura de extremidade; o banzo inferior (MI) é o tirante. Nas pontas da barra encostadas a uma perna, o caibro de meio CB e o tirante MI fazem esse papel.");
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: escs.length ? "1:" + escs.filter(function (e, i, A) { return A.indexOf(e) === i; }).sort(function (p, q) { return p - q; }).join(" e 1:") : "INDICADA" };
  }

  /* ---- E06: detalhes dos nós ---- */
  var NOME_LIG = { espigaoCumeeira: "Espigão x cumeeira", espigaoCanto: "Sela do espigão (canto)", cintaCanto: "Cinta do canto", chapaUnicaCanto: "Chapa única sela + cinta", torcaoFrechal: "Torção do frechal (canto)", meiaTesoura: "Meia-tesoura x tesoura", pontaMI: "Ponta da MI x BI", tercaEspigao: "Terça x espigão (rosca 45°)", tercaEspigaoAxial: "Terça x espigão (estribo)", rincaoApice: "Rincão no vértice V", rincaoCanto: "Rincão no canto côncavo (sela)", espigaoInterno: "Espigão interno", caibroMeio: "Caibro de meio", tercaRincao: "Terça x rincão (rosca 45°)", emendaTerca: "Emenda passante da terça", torcaoResidualBanzo: "Torção residual do banzo", pontaFrechalCabe: "Pinos cabem na ponta do frechal" };
  function nosDe(c) {
    var res = c.res, I3 = res.t3.info, L3 = (res.ligacoesT3 && res.ligacoesT3.ligacoes) || {}, S = res.secoes, d = c.d, ps = d.pcs, M = res.t3.membros;
    function folgaTxt(re) { var m = Infinity; (res.aparo ? res.aparo.folgas : []).forEach(function (f) { if (re.test(f.peca) && f.folga_mm < m) m = f.folga_mm; }); return isFinite(m) ? "Folga mínima medida no modelo aparado: " + br(m, 1) + " mm (>= 10 mm)." : "Folga de projeto: 10 mm (peça aparada na obra)."; }
    var tch = 8, ms = L3.espigaoCanto && L3.espigaoCanto.momentoSela, hostApice = S.CM ? { rot: "CM", S: S.CM } : { rot: "BS", S: S.BS }, RC = M.filter(function (m) { return m.g === "RC"; }).length, nInt = M.filter(function (m) { return m.g === "E" && m.interior; }).length, nCB = M.filter(function (m) { return m.g === "CB"; }).length;
    function par(cod, titulo, chave, A, B, extra) {
      var l = L3[chave]; if (!l || !l.pinos || !l.pinos.n) return null;
      var pnB = B.pn || (l.banzo && l.banzo.BI ? l.banzo.BI.pinos : l.pinos), chW = Math.max(l.chapa ? l.chapa.largura_mm : 0, l.banzo && l.banzo.BI && l.banzo.BI.chapa ? l.banzo.BI.chapa.largura_mm : 0, 30), gA = X().gPinos(cod + " " + A.rot, l.pinos, A.S), gB = X().gPinos(cod + " " + B.rot, pnB, B.S);
      var notas = [{ t: cod + " - " + titulo + ": " + (l.descricao || "") }, "1 - chapa interna de aço t = " + tch + " mm, " + chW + " mm de largura, em fenda nas duas peças; 2 - " + l.pinos.n + " pinos inox A4 Ø" + Math.round(l.pinos.d * 1000) + " em " + A.rot + " e " + pnB.n + " pinos Ø" + Math.round(pnB.d * 1000) + " em " + B.rot + " (esquema em linha; posição e ângulo do encontro: folhas E01 e E05); 3 - FOLGA CONSTRUTIVA de 10 mm entre as peças (cotada): nada encosta, a carga passa só por chapa + pinos; furo da chapa Ø(d + 1).",
        "Espaçamentos real | mínimo (mm) - " + A.rot + ": " + Q.esp2(gA) + (pnB !== l.pinos ? "; " + B.rot + ": " + Q.esp2(gB) : "; a peça hospedeira " + B.rot + " leva o MESMO NÚMERO de pinos (grupo espelhado): o arranjo (a2, a4) se ajusta à seção da hospedeira respeitando os mínimos — a confirmar pelo RT/fabricante") + ". Mínimo: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.", Q.etaLinha(l.pinos, cod + "-pinos", "Pinos em " + A.rot + " (Johansen):")];
      if (pnB !== l.pinos) notas.push(Q.etaLinha(pnB, cod + "-pinos-b", "Pinos em " + B.rot + (l.banzo && l.banzo.BI ? " (força ⊥ às fibras)" : "") + " (Johansen):"));
      var chp = l.banzo && l.banzo.BI && l.banzo.BI.chapa && l.banzo.BI.chapa.eta > (l.chapa ? l.chapa.eta : 0) ? l.banzo.BI.chapa : l.chapa; if (chp) notas.push(Q.etaLinha(chp, cod + "-chapa", "Chapa (NBR 8800: bruta, líquida fu/1,35 e esmagamento):"));
      (extra || []).forEach(function (t) { notas.push(t); });
      return { cod: cod, titulo: titulo, A: { pn: l.pinos, S: A.S, rot: A.rot }, B: { pn: pnB, S: B.S, rot: B.rot }, gap: 10, chW: chW, tch: tch, notas: notas };
    }
    var cels = [
      par("N1", "SELA DO ESPIGÃO NO CANTO CONVEXO", "espigaoCanto", { rot: "EP", S: S.E }, { rot: "FR", S: S.FR }, [{ t: (ms ? "Momento da sela M = N·δ = " + br(ms.M_d_kNm, 2) + " kN·m (δ = h_FR/2 = " + br(ms.delta_m * 100, 0) + " cm); " : "") + "arrancamento " + br(L3.espigaoCanto ? L3.espigaoCanto.arrancamento_kN : 0, 2) + " kN (inclui a faixa de aresta, cpe local -1,2, a confirmar pelo RT). " + folgaTxt(/^FR\d+\/(ini|fim)/) }]),
      par("N2", "CINTA DO CANTO (FRECHAL X FRECHAL)", "cintaCanto", { rot: "FR", S: S.FR }, { rot: "FR", S: S.FR }, [{ t: "Força de EXTREMIDADE do frechal no canto: " + br(L3.cintaCanto ? L3.cintaCanto.N_fim_kN : 0, 1) + " kN. Os dois frechais param a >= 10 mm do espigão. " + folgaTxt(/^FR\d+\/(ini|fim)/) }]),
      par("N3", "ESPIGÃO NA CUMEEIRA", "espigaoCumeeira", { rot: "EP", S: S.E }, hostApice, [{ t: "Ponta do espigão aparada a >= 10 mm das faces de cumeeira, banzos, meia-tesoura e dos outros espigões; envolvente dos modelos (a) e (b). " + folgaTxt(/^E\d+$/) }]),
      par("N4", "MEIA-TESOURA X TESOURA DE EXTREMIDADE", "meiaTesoura", { rot: "MS", S: S.MS }, { rot: "BS", S: S.BS }, [{ t: "Ponta do banzo superior da meia-tesoura a >= 10 mm das faces dos banzos da tesoura. Folga de projeto: 10 mm." }]),
      par("N5", "PONTA DA MI NO BI (NÓ CENTRAL)", "pontaMI", { rot: "MI", S: S.MI }, { rot: "BI", S: S.BI }, [{ t: "Ligação própria: N da MI = " + br(L3.pontaMI ? L3.pontaMI.F_d : 0, 1) + " kN + montante do mesmo nó = " + br(L3.pontaMI ? L3.pontaMI.montante_kN : 0, 1) + " kN; resultante ⊥ às fibras do BI = " + br(L3.pontaMI ? L3.pontaMI.resultante_perp_kN : 0, 1) + " kN. Folga de projeto: 10 mm." }]),
      par("N6", "TERÇA NO ESPIGÃO OU NO RINCÃO (ESTRIBO)", "tercaEspigaoAxial", { rot: "TL", S: S.T }, { rot: "EP", S: S.E }, [{ t: "Terça em bisel COMPOSTO (45° em planta) a >= 10 mm do espigão ou do rincão, em estribo de aço; rosca total a 45°: " + (L3.tercaEspigao ? L3.tercaEspigao.porApoio + " parafusos WT-T por apoio (eta " + br(L3.tercaEspigao.eta, 3) + ")" : "") + ". " + folgaTxt(/^T[A-Z]*\d+_\d+\/(ini|fim)/) }]),
      par("N7", "RINCÃO NO VÉRTICE V (CUMEEIRA DA PERNA E ESPIGÃO INTERNO)", "rincaoApice", { rot: "RC", S: S.RC || S.E }, { rot: "CM", S: S.CM || S.BS }, [{ t: "Ponta do rincão aparada a >= 10 mm das faces da cumeeira da perna e do espigão interno; chapa interna em fenda + pinos (" + RC + " rincão(ões) na planta, um por canto côncavo). " + folgaTxt(/^RC\d+$/) }]),
      par("N8", "RINCÃO NO CANTO CÔNCAVO (SELA DE AÇO E CALHA)", "rincaoCanto", { rot: "RC", S: S.RC || S.E }, { rot: "FR", S: S.FR }, [{ t: "Sela de aço sobre o cruzamento dos frechais do canto côncavo; compressão do anel " + br(res.rincao && res.rincao.cintaC ? res.rincao.cintaC.N : 0, 1) + " kN passa pela chapa (os frechais param a >= 10 mm do rincão). A CALHA metálica do rincão lança no beiral para a calha do perímetro. A chapa do canto côncavo NÃO foi verificada à instabilidade: pendência ao RT." }]),
      nInt ? par("N9", "ESPIGÃO INTERNO (VÉRTICE V X TOPO DA CUMEEIRA)", "espigaoInterno", { rot: "EP", S: S.E }, { rot: "CM", S: S.CM || S.BS }, [{ t: "Espigão interno (canto virtual do retângulo da barra): " + nInt + " na planta; nas duas pontas chapa interna em fenda + pinos; pontas a >= 10 mm das faces vizinhas." }]) : null,
      nCB ? par("N10", "CAIBRO DE MEIO (CABECEIRA DA BARRA ENCOSTADA NA PERNA)", "caibroMeio", { rot: "CB", S: S.CB }, { rot: "CM", S: S.CM || S.BS }, [{ t: "Pé sobre o pilar de meio de parede (sela) e topo na cumeeira da barra; o tirante MI leva o empuxo horizontal do pé até a primeira tesoura da barra (" + nCB + " caibro(s) de meio na planta)." }]) : null
    ].filter(function (o) { return !!o; });
    return cels;
  }

  /* ---- desenho do nó (copiado do L e ajustado: o conferidor de sobreposição do T/U exige ZERO — no L, a cota de 10 mm cai sobre o balão 1, os dois rótulos de pinos se tocam na folga de 10 mm
     (a 1:50 são 0,2 mm) e o balão/cota sobem sobre o título da vista). Aqui: rótulos de cada lado da folga (direita/esquerda), balão 1 embaixo, vistas 10 mm abaixo do título. ---- */
  function posGrupo(pn) { return X().posGrupo(pn); }
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
      V.tx(-4, hh / 2 + 5, A.rot + " (" + gA.xr.length * gA.zc.length + " pinos Ø" + gA.d + ")", null, { al: "D" }); V.tx(g + 4, hh / 2 + 5, B.rot + " (" + gB.xr.length * gB.zc.length + " pinos Ø" + gB.d + ")", null, { al: "E" });
      V.bal(g / 2, -chW / 2, 0, 13, 1); V.bal(xa(gA.xr[0]), gA.zc[0], -12, -14, 2);
      return V;
    };
  }
  function corteNo(o) { return X().corteNo(o); }
  function chapaNo(o) { return X().chapaNo(o); }
  /** célula de detalhe do nó: título, elevação (folga cotada), corte, chapa isolada e notas com η */
  function celulaNo(c, x, y, w, h, o) {
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, x + 1, y + 1, o.cod + " - " + o.titulo, null), by = y + ht, bh = h - ht - 2, h1 = Math.round(bh * 0.32), h2 = Math.round(bh * 0.22), hv = 10, escs = [], reg = { cod: o.cod, vistas: [] };
    [["ELEVAÇÃO DO NÓ (corte na fenda; folga " + o.gap + " mm cotada)", elevNo(o), { x: x + 1, y: by, w: w - 2, h: h1 }], ["CORTE (peça " + o.A.rot + ")", corteNo(o), { x: x + 1, y: by + h1 + 2, w: w / 2 - 2, h: h2 }], ["CHAPA DE AÇO (peça isolada)", chapaNo(o), { x: x + w / 2 + 1, y: by + h1 + 2, w: w / 2 - 2, h: h2 }]].forEach(function (v) {
      var rp = v[2], V = v[1](c, { x: rp.x, y: rp.y + hv, w: rp.w, h: rp.h - hv });
      D.texto(rp.x + 0.5, rp.y + 3.4, v[0] + " - ESC 1:" + V.esc, T.nota, { peso: 0.12, attr: ' data-vista="1"' }); reg.vistas.push({ t: v[0], esc: V.esc }); if (escs.indexOf(V.esc) < 0) escs.push(V.esc);
    });
    var yn = by + h1 + h2 + 5, hu = D.textos(x + 1, yn, o.notas, T.nota * 0.92, { wmax: w - 3 });
    if (yn + hu > y + h + 0.5) c.avisos.push("Folha " + c.rotulo + ": a nota de " + o.cod + " passa do painel (" + Math.round(yn + hu - y) + " > " + Math.round(h) + " mm).");
    c.cels.push(reg); return escs;
  }
  function pontoPerto(ps, P, r) { return ps.filter(function (pc) { var A = pc.p0, B = pc.p1, dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L2 = dx * dx + dy * dy + dz * dz, t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy + (P[2] - A[2]) * dz) / (L2 || 1))), Q2 = [A[0] + dx * t, A[1] + dy * t, A[2] + dz * t]; return Math.hypot(Q2[0] - P[0], Q2[1] - P[1], Q2[2] - P[2]) < r; }); }
  function folhaNos(c, cels, ind) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, I3 = res.t3.info, ps = d.pcs, M = res.t3.membros, escs = [], vp = X().vistaPecas;
    var larg = 128, h = Math.round(a.h * 0.27), tira = /^(DX|DV|DP|LB|BS|BI|PD|DG)$/, tiraC = /^(DX|DV|DP|LB|MI|MP|MG|PD|DG)$/;
    var cm = M.filter(function (m) { return m.g === "CM"; })[0], rc = M.filter(function (m) { return m.g === "RC"; })[0], L0 = arr(I3.pernas)[0];
    var alvo = [[0, 0, I3.Hp], cm ? (cm.eixo0 || cm.p0) : [I3.b / 2, I3.b / 2, I3.hA], L0 ? L0.V : [I3.b / 2, I3.b / 2, I3.hA], rc && rc.canto ? [rc.canto[0], rc.canto[1], I3.Hp] : [0, I3.b, I3.Hp]];
    var tit = ["A - ESPIGÃO NO CANTO CONVEXO (PLANTA)", "B - ESPIGÃO NA CUMEEIRA (PLANTA)", "C - RINCÃO NO VÉRTICE V (PLANTA)", "D - RINCÃO NO CANTO CÔNCAVO (PLANTA)"], fil = [tira, tiraC, tiraC, tira], raio = [1.1, 1.0, 1.0, 1.1];
    if (ind === 0) {
      for (var k = 0; k < 4; k++) {
        var lst = pontoPerto(ps, alvo[k], raio[k]).filter(function (p) { return !fil[k].test(p.g); });
        if (!lst.length) { c.avisos.push("Folha " + c.rotulo + ": nenhuma peça perto do ponto " + tit[k]); continue; }
        var xk = a.x + 2 + k * (larg + 3), v = vp(c, lst, "xy", xk, a.y + 2, larg, h, tit[k]); Q.rotular(c, v.itens, T.marcaDensa, { umaPorMarca: true, raio: 20 });
        var pt = v.f3(alvo[k]); D.circ(pt[0], pt[1], 4, "MAD-FINA"); D.linha(pt[0] + 3, pt[1] - 3, pt[0] + 14, pt[1] - 16, "MAD-FINA"); escs.push(v.esc);
      }
    }
    var L3 = (res.ligacoesT3 && res.ligacoesT3.ligacoes) || {}, folg = res.aparo && res.aparo.resumo ? res.aparo.resumo : { n: 0, minimo_mm: 0 };
    if (ind === 0) {
      var xq = a.x + 2 + 4 * (larg + 3) + 3, wq = a.x + a.w - xq - 2, linhas = [];
      ["espigaoCumeeira", "espigaoCanto", "cintaCanto", "meiaTesoura", "pontaMI", "tercaEspigao", "rincaoApice", "rincaoCanto"].forEach(function (kk) { var l = L3[kk]; if (!l) return; linhas.push([NOME_LIG[kk], l.pinos && l.pinos.n ? l.pinos.n + " pinos Ø" + Math.round((l.pinos.d || 0) * 1000) : (l.porApoio ? l.porApoio + " parafusos WT-T" : "-"), br(l.eta, 3), l.ok === false ? "NÃO ATENDE" : "ok"]); });
      if (wq > 60) { D.tabela(xq, a.y + 2, [{ t: "LIGAÇÃO" }, { t: "FIXADORES" }, { t: "η" }, { t: "SITUAÇÃO" }], linhas, { fs: T.tabela * 0.8 }); D.textos(xq, a.y + 2 + 6 * (linhas.length + 2), ["FOLGA CONSTRUTIVA >= 10 mm: " + folg.n + " pontas aparadas; mínima medida " + br(folg.minimo_mm, 1) + " mm. A carga passa SÓ pelas chapas de aço internas (t = 8 mm), selas/estribos e pinos inox. Quadro completo de ligações: folha E07."], T.nota * 0.85, { wmax: wq - 2 }); }
    }
    var y0 = ind === 0 ? a.y + h + 6 : a.y + 2, cw = (a.w - 4 - 2 * 3) / 3, ch = ind === 0 ? (a.h - h - 6 - 2 - 6) / 3 : (a.h - 4 - 2 - 6) / 3;
    cels.forEach(function (o, i) { escs = escs.concat(celulaNo(c, a.x + 2 + (i % 3) * (cw + 3), y0 + Math.floor(i / 3) * (ch + 3), cw, ch, o)); });
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "INDICADA" };
  }
  function folhaE06(c) { var cs = nosDe(c); c.d.nos = cs; return folhaNos(c, cs.slice(0, 9), 0); }
  function folhaE06b(c) { return folhaNos(c, (c.d.nos || nosDe(c)).slice(9), 1); }

  /* ---- E07: quadro de ligações, folgas, NÃO VERIFICADO e pendências ao RT ---- */
  function folhaE07(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, res = c.res, L3 = (res.ligacoesT3 && res.ligacoesT3.ligacoes) || {}, linhas = [];
    Object.keys(NOME_LIG).forEach(function (k) {
      var l = L3[k]; if (!l) return;
      var fx = l.pinos && l.pinos.n ? l.pinos.n + " pinos Ø" + Math.round((l.pinos.d || 0) * 1000) + (l.banzo && l.banzo.BI ? " + " + l.banzo.BI.pinos.n + " no BI" : "") + (l.chapa && l.chapa.t_mm ? "; chapa t = " + l.chapa.t_mm + " mm" : "") : (l.porApoio ? l.porApoio + " parafusos WT-T 8,2 × 300 por apoio" : (l.chapa && l.chapa.t_mm ? "chapa t = " + l.chapa.t_mm + " mm" : "-"));
      linhas.push([NOME_LIG[k], fx, isFinite(l.eta) ? br(l.eta, 3) : "-", l.ok === false ? "NÃO ATENDE" : "ok"]);
    });
    var hT = I.tituloVista(D, a.x + 4, a.y + 2, "QUADRO DE LIGAÇÕES - FIXADORES, η E SITUAÇÃO (CÁLCULO DETALHADO DOS NÓS)", "SEM ESCALA") + 2;
    var tb = D.tabela(a.x + 4, a.y + 2 + hT, [{ t: "LIGAÇÃO" }, { t: "FIXADORES" }, { t: "η" }, { t: "SITUAÇÃO" }], linhas, { fs: T.tabela * 0.9, hl: 4.6 });
    var xr = a.x + a.w * 0.58, folg = res.aparo && res.aparo.resumo ? res.aparo.resumo : { n: 0, minimo_mm: 0 }, y = a.y + 2;
    var wmax = a.x + a.w - xr - 3, tx = [], nv = arr(res.naoVerificado), pe = arr(res.pendenciasRT);
    var hF = I.tituloVista(D, xr, y, "FOLGAS CONSTRUTIVAS (APARO)", "SEM ESCALA") + 2;
    y += hF + D.textos(xr, y + hF, ["Folga construtiva >= 10 mm em " + folg.n + " pontas aparadas (espigão x cumeeira, frechal nos 2 lados de cada canto, terças em bisel, " + (res.t3.info.tesouraTipo === "howe" ? "diagonais Howe, " : "") + "rincão): mínima medida " + br(folg.minimo_mm, 1) + " mm. Auditor de encontros: " + (res.auditoria && res.auditoria.ok ? "sem achado" : arr(res.auditoria && res.auditoria.achados).length + " achado(s) (peças em vermelho)") + "."], T.nota * 0.9, { wmax: wmax }) + 4;
    var hN = I.tituloVista(D, xr, y, "NÃO VERIFICADO - ESTRUTURA PRELIMINAR ATÉ O RT CONFERIR", null) + 2;
    y += hN + D.textos(xr, y + hN, nv.length ? nv : ["Nada declarado como não verificado."], T.nota * 0.9, { wmax: wmax, cor: VERMELHO }) + 4;
    var hP = I.tituloVista(D, xr, y, "PENDÊNCIAS AO RT - CANTOS CÔNCAVOS (VENTO)", null) + 2;
    y += hP + D.textos(xr, y + hP, pe.length ? pe.map(function (q) { return q.texto || String(q); }) : ["Sem canto côncavo com pendência."], T.nota * 0.9, { wmax: wmax }) + 4;
    D.textos(xr, y, ["Pinos inox A4, chapas t = 8 mm (NBR 8800: seção bruta, líquida fu/1,35 e esmagamento) e parafusos de rosca total (SFS WT-T 8,2 × 300, ETA-12/0063) dimensionados com os esforços do próprio modelo 3D. Mínimos: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.", SX().EXIGENCIA], T.nota * 0.85, { wmax: wmax });
    if (a.y + 2 + hT + tb.h > a.y + a.h) c.avisos.push("Folha " + c.rotulo + ": o quadro de ligações passa do pé da folha.");
    return { escala: "SEM ESCALA" };
  }
  function folhaE10(c) { return Q.folhaE10(c); }

  function gerar(res, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    if (!PL() || !SX()) return { ok: false, folhas: [], avisos: ["js/madt3lpranchas.js / js/madt3lsaidas.js não carregaram (desenhistas do nó)."] };
    var P = Q.PR(); if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || res.tipologia !== "T3TU" || !res.t3 || !arr(res.t3.membros).length || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes || !res.secoes || !res.ligacoesT3 || !res.ligacoesT3.ligacoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo da T3TU sem membros/ligações detalhadas: não há pranchas."] };
    var SAp = dep("MadEngSaidas", "./madengsaidas.js"), preliminar = opcoes.preliminar != null ? !!opcoes.preliminar : !!(SAp && SAp.preliminar(res).preliminar);
    var E = I.estilo(opcoes.padrao);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA"), codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-T3TU", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var classe = Q.txt(opcoes.classe) || Q.classeDe((arr(res.fonte.pecas).filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h");
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [] }; ctx0.d = PL().contexto(res); ctx0.pend = ctx0.d.pend;
    /* VOLUME DO QUADRO = VOLUME DO ORÇAMENTO. O orçamento conta cada membro pelo volume NOMINAL (seção × comprimento entre eixos, 'fonte de peças'); o sólido 3D cortado pelo encaixe perde o aparo das pontas, o rebaixo do frechal e o trecho embutido dos pilares. O quadro (E10) e as marcas mostram o volume nominal do grupo (peça a peça, proporcional ao sólido) para fechar com o orçamento; o volume do sólido cortado fica em `volSolido` e a diferença é declarada na nota do quadro. */
    var volOrcG = {}; arr(res.fonte.pecas).forEach(function (x) { if (/MLC/.test(x.material || "") && x.volume_m3) volOrcG[x.marca] = (volOrcG[x.marca] || 0) + x.volume_m3; });
    var volSolG = {}, volSolTot = 0, volNomTot = 0; arr(ctx0.d.pcs).forEach(function (pc) { pc.volSolido = pc.vol; volSolG[pc.g] = (volSolG[pc.g] || 0) + pc.vol; volSolTot += pc.vol; });
    arr(ctx0.d.pcs).forEach(function (pc) { if (volOrcG[pc.g] > 0 && volSolG[pc.g] > 0) pc.vol = pc.vol * volOrcG[pc.g] / volSolG[pc.g]; volNomTot += pc.vol; });
    var pcPorId = {}; arr(ctx0.d.pcs).forEach(function (pc) { pcPorId[pc.id] = pc; });
    arr(ctx0.d.marcas && ctx0.d.marcas.tab).forEach(function (m) { var vt = 0; arr(m.ids).forEach(function (id) { if (pcPorId[id]) vt += pcPorId[id].vol; }); m.volTot = vt; m.volUnit = m.qtd ? vt / m.qtd : 0; });
    if (!arr(ctx0.d.pcs).length) return { ok: false, folhas: [], avisos: ["Nenhuma peça desenhável nos membros do resultado: não há pranchas."] };
    var nNos = nosDe(Object.assign({}, ctx0, { d: ctx0.d })).length;
    var ORDEM = [["E01", "cobertura", folhaE01, null, "PLANTA DE COBERTURA - ESPIGÕES, RINCÕES, CUMEEIRAS, TERÇAS, TESOURAS (EIXOS E COTAS)"], ["E02", "planta-tesouras", folhaE02, null, "PLANTA DE TESOURAS, TERÇAS E FRECHAL"], ["E03", "elevacoes", folhaE03, null, "ELEVAÇÕES FRONTAL E LATERAL"], ["E04", "cortes", folhaE04, null, "CORTES LONGITUDINAIS POR ASA"], ["E05", "tesouras", folhaE05, null, "TESOURAS TIPO E MEIAS-TESOURAS POR ASA"], ["E06", "nos", folhaE06, null, "DETALHES DOS NÓS - ESPIGÃO, RINCÃO, CANTO CÔNCAVO, MEIA-TESOURA, TERÇA, CINTA"]];
    if (nNos > 9) ORDEM.push(["E06b", "nos-2", folhaE06b, null, "DETALHES DOS NÓS (CONTINUAÇÃO) - ESPIGÃO INTERNO E CAIBRO DE MEIO"]);
    ORDEM.push(["E07", "ligacoes", folhaE07, null, "QUADRO DE LIGAÇÕES, FOLGAS, NÃO VERIFICADO E PENDÊNCIAS AO RT"], ["E10", "pecas", folhaE10, null, "LISTA DE PEÇAS POR POSIÇÃO"]);
    var EPr = dep("MadEncaixePranchas", "./madencaixepranchas.js"); if (EPr && opcoes.fichasCorte !== false) { try { ORDEM = ORDEM.concat(EPr.defs(res, ORDEM.length + 1)); } catch (e) { avisos.push("Fichas de corte: " + e.message); } }
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = (i + 1 < 10 ? "0" : "") + (i + 1);
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: def[4] });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00", inf = res.t3.info;
    var pr = P.normalizar({ id: "madt3tupranchas", nome: "Estrutura de madeira engenharada (T3TU, 4 águas em " + inf.planta + " com rincão por canto côncavo) - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt((preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + (opcoes.obra || "")), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var notas = [{ t: "Telhado de 4 águas em " + inf.planta + " (T3TU). Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho." }, { t: "Marca da peça: {marca} - MLC " + classe + " - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC." }, { t: "Pontas aparadas com folga >= 10 mm: a carga passa só por chapa de aço interna (t = 8 mm), sela/estribo e pinos inox. Tratamento NBR 16143 conforme a tabela E10." }, { t: "Vento em 4 águas em " + inf.planta + ": premissa da Tabela 5 da NBR 6123 (duas águas) por asa, a confirmar pelo RT; sobrepressão local na reentrância de cada canto côncavo e sombreamento entre as asas: PENDENTES (folha E07)." }, { t: SX().EXIGENCIA }, { t: "NÃO VERIFICADO (folha E07): chapa do canto côncavo e, no T, ligações do travamento da boca — estrutura PRELIMINAR até o RT conferir." }, { t: "VERMELHO = o que a auditoria apontou." }];
    notas.push({ t: "Volume do quadro de peças = volume nominal (seção x comprimento entre eixos) = volume do orçamento: " + I.br(volNomTot, 3) + " m3. O sólido 3D cortado (aparo das pontas, encaixes, rebaixo do frechal) soma " + I.br(volSolTot, 3) + " m3; a diferença de " + I.br(volNomTot - volSolTot, 3) + " m3 é madeira de compra, não perda de serviço." });
    var blocos = [{ titulo: "NOTAS GERAIS", itens: notas }];
    var camadas = {}; Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = Q.MP.PADRAO_MAD.camadas[k]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (k) { camadas[k] = Q.PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, opcoes.depurar ? [] : null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      try { I.colunaNotas(Fd, geo, blocos); } catch (e) { avisos.push("Notas: " + e.message); }
      var rotuloFolha = f.rotulo + "/" + (feitas.length < 10 ? "0" : "") + feitas.length; I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(((preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + SX().FAIXA)) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      if (opcoes.depurar) o.caixasTexto = (D.caixas || []).concat(Fd.caixas || []);
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, celulas: ctx0.cels, tabela: ctx0.d.marcas.tab, marcas: ctx0.d.marcas.porId, desenhaveis: ctx0.d.pcs };
  }

  var MadEngT3TU = { gerar: gerar, nosDe: nosDe, eixosXY: eixosXY, NOME_LIG: NOME_LIG };
  global.MadEngT3TU = MadEngT3TU;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT3TU;
})(typeof window !== "undefined" ? window : this);

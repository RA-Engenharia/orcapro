/* =====================================================================
 * madt4pranchas.js — PRANCHAS DA T4 (telhado sextavado/oitavado) em MLC. Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo padrão e mesmo carimbo RA da T1/T2/T3: reaproveita os desenhistas internos (MadEngPranchas._p) e os da T3 (MadEngT3._i: vistas, células de nó) e acrescenta só o que é do polígono.
 *   MadEngT4.gerar(res, opcoes) → { ok, folhas, avisos, tabela, marcas }
 * Folhas: E01 planta de cobertura (espigões radiais, terças em anel, frechal, caibros) · E02 elevações (frontal e lateral) · E03 seção pelo espigão (elevação girada, canto a canto pelo cubo) e elevação pela face ·
 *         E04 detalhes dos nós — planta do canto, do CUBO DO ÁPICE e da terça, e a elevação de cada nó com CHAPA + PINOS e a FOLGA de 10 mm COTADA · E10 lista de peças.
 * Peças desenhadas = as APARADAS (res.t4.membros: p0/p1 depois do aparo; o eixo de cálculo fica em eixo0/eixo1).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I, SX = function () { return dep("MadT4Saidas", "./madt4saidas.js"); }, X3 = function () { var t = dep("MadEngT3", "./madt3pranchas.js"); return t && t._i; };
  var VERMELHO = "#c00000";
  var PREF = { P: "PL", PC: "PC", FR: "FR", E: "EP", T: "TL", CB: "CB", DX: "DX", DP: "CP" };
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { return I.br(v, c); }
  function camadaDe(pc) { return /^(E|CB|PC)$/.test(pc.g) ? "MAD-PRINCIPAL" : "MAD-PECA"; }

  function contexto(res) {
    var pecas = SX().pecasMembros(res), pcs = Q.desenhaveis(pecas), porId = {}, d = { res: res, pecasM: pecas };
    pecas.forEach(function (p) { porId[p.id] = p; });
    pcs.forEach(function (pc) { var p = porId[pc.id]; pc.g = p.g; pc.agua = p.agua; pc.prefixo = PREF[p.g]; });
    d.pcs = pcs; d.marcas = Q.marcar(pcs);
    d.grupo = function () { var gs = Array.prototype.slice.call(arguments); return pcs.filter(function (p) { return gs.indexOf(p.g) >= 0; }); };
    d.pilares = d.grupo("P"); d.fonteTodos = arr(res.fonte && res.fonte.pecas);
    d.pend = {}; arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    pcs.forEach(function (pc) { if (!pc.marca) pc.marca = d.marcas.porId[pc.id]; });
    return d;
  }
  /** gira as peças em torno do eixo vertical do centro (cx, cz) pelo ângulo `a` (rad): [X, Z, H] */
  function girar(pcs, a, cx, cz) {
    var c = Math.cos(a), s = Math.sin(a);
    function P(p) { var x = p[0] - cx, z = p[1] - cz; return [cx + x * c - z * s, cz + x * s + z * c, p[2]]; }
    function Vv(v) { return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
    return pcs.map(function (pc) { var o = {}; Object.keys(pc).forEach(function (k) { o[k] = pc[k]; }); o.p0 = P(pc.p0); o.p1 = P(pc.p1); ["u", "v", "w", "dl"].forEach(function (k) { if (pc[k]) o[k] = Vv(pc[k]); }); return o; });
  }

  /* ---- E01: planta de cobertura ---- */
  function folhaE01(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t4.info;
    var lista = d.pcs.filter(function (p) { return !/^(DX|DP)$/.test(p.g); });
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA DE COBERTURA - ESPIGÕES, TERÇAS EM ANEL, FRECHAL" + (inf.caibro ? ", CAIBROS" : ""), fw: 0.64 }), f3 = pl.f3;
    var ord = { P: 0, PC: 0, FR: 1, T: 2, CB: 3, E: 4 };
    var itens = Q.desenharLista(D, c, lista.slice().sort(function (p, q) { return (ord[p.g] || 0) - (ord[q.g] || 0); }), f3, camadaDe);
    Q.rotular(c, itens.filter(function (it) { return /^(E|CB|PC|FR)$/.test(it.pc.g); }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "T"; }), T.marcaDensa, { umaPorMarca: true, raio: 34 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.prefixo === "PL"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var pt = f3([inf.cx, inf.cz, inf.Hap]); D.circ(pt[0], pt[1], 2.2, "MAD-FINA"); D.texto(pt[0] + 3, pt[1] - 3, "CUBO", T.nota * 0.9, { peso: 0.1 });
    var xr = a.x + a.w * 0.66, yr = a.y + 18;
    var Lg = Q.legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "espigão EP" + (inf.caibro ? ", caibro CB" : "") + (inf.pilarCentral ? ", pilar central PC" : "") }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL, frechal FR (em anel), terça TL" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    var yS = yr + Lg + 6, tx = [];
    tx.push("Telhado de " + inf.n + " águas (planta " + (inf.n === 8 ? "octogonal" : "hexagonal") + " regular), i = " + Q.pct(inf.incl) + ", beiral " + br(inf.beiral, 2) + " m; raio " + br(inf.R, 2) + " m, lado " + br(inf.lado, 2) + " m, apótema " + br(inf.apotema, 2) + " m.");
    tx.push(inf.n + " espigões a " + br(180 / inf.n * 2, 0) + "° entre si, do canto ao CUBO DO ÁPICE (tubo de aço com chapas radiais; folga >= 10 mm entre as peças); terças das " + inf.n + " águas de espigão a espigão, com ponta aparada em bisel de " + br(90 - 180 / inf.n, 1) + "° em planta (estribo, folga >= 10 mm).");
    tx.push("Frechal FR em anel: para a >= 10 mm do espigão em cada canto; a tração do anel passa pela CINTA de aço (detalhe na folha E04).");
    var yy2 = yS + 4 + D.textos(xr, yS + 4, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 }) + 2;
    Q.tabMarcas(c, xr, yy2 + 4, ["PL", "PC", "FR", "EP", "CB", "TL"].filter(function (mk) { return lista.some(function (p) { return PREF[p.g] === mk; }); }), "QUADRO DE MARCAS DA COBERTURA", 150);
    return { escala: "1:" + pl.esc0 };
  }
  function folhaE02(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, tudo = d.pcs.filter(function (p) { return !/^(DX|DP)$/.test(p.g); }), V = X3().vistaPecas;
    var h = (a.h - 10) / 2, w = a.w * 0.68;
    var v1 = V(c, tudo, "xz", a.x + 4, a.y + 2, w, h, "ELEVAÇÃO FRONTAL (EIXO X) - PROJEÇÃO DE TODAS AS PEÇAS");
    var v2 = V(c, tudo, "yz", a.x + 4, a.y + 2 + h + 6, w, h, "ELEVAÇÃO LATERAL (EIXO Z) - PROJEÇÃO DE TODAS AS PEÇAS");
    Q.rotular(c, v1.itens.filter(function (it) { return /^(E|CB|PC|T|FR)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var inf = c.res.t4.info, xr = a.x + w + 12, tx = ["Ápice a " + br(inf.Hap, 2) + " m do piso (pé-direito " + br(inf.Hp, 2) + " m no respaldo).", "Os " + inf.n + " espigões convergem no cubo do ápice; as terças são projetadas sobre o plano.", "Seção pelo espigão e elevação pela face: folha E03."];
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc };
  }
  /* ---- E03: seção pelo espigão (elevação girada: espigão 1 e o oposto, pelo centro) e elevação pela face do lado 1 ---- */
  function folhaE03(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, inf = res.t4.info, V = X3().vistaPecas, h = (a.h - 12) / 2, w = a.w * 0.72, th0 = inf.ang0;
    var g1 = girar(d.pcs, -th0, inf.cx, inf.cz), perto = g1.filter(function (p) { return /^(E|PC|P|CB)$/.test(p.g) && Math.abs(p.p0[1] - inf.cz) < 0.5 && Math.abs(p.p1[1] - inf.cz) < 0.5; });
    var v1 = V(c, perto, "xz", a.x + 4, a.y + 2, w, h, "SEÇÃO PELO ESPIGÃO EP1 E PELO CUBO - ELEVAÇÃO GIRADA (ESPIGÕES NO PLANO)");
    var g2 = girar(d.pcs, -inf.angLado0, inf.cx, inf.cz), face = g2.filter(function (p) { return !/^(DX|DP)$/.test(p.g); });
    var v2 = V(c, face, "yz", a.x + 4, a.y + 2 + h + 8, w, h, "ELEVAÇÃO PELA FACE DO LADO 1 - PROJEÇÃO DE TODAS AS PEÇAS");
    Q.rotular(c, v1.itens, T.marcaDensa, { umaPorMarca: true, raio: 26 }); Q.rotular(c, v2.itens.filter(function (it) { return /^(E|CB|PC|FR)$/.test(it.pc.g); }), T.marcaDensa, { umaPorMarca: true, raio: 26 });
    var xr = a.x + w + 12, tx = ["O espigão trabalha como viga inclinada (canto → cubo) e, sem o pilar central, como ARCO: o empuxo horizontal no canto é resolvido pela tração do anel de frechal (cinta). Envolvente de modelos: " + (res.modelos || "") + ".", "No cubo, cada espigão" + (inf.caibro ? " e cada caibro" : "") + " entra com a sua chapa interna em fenda, a >= 10 mm do tubo e dos vizinhos: a carga passa só por chapa e pinos.", "Os grupos de pinos de cada nó estão no quadro de ligações (folha E04) e no memorial."];
    D.textos(xr, a.y + 8, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 });
    return { escala: "1:" + v1.esc };
  }
  /* ---- E04: planta das folgas (A canto, B cubo, C terça) + elevação com chapa e pinos de CADA nó ---- */
  function folhaE04(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, res = c.res, I4 = res.t4.info, L4 = (res.ligacoesT4 && res.ligacoesT4.ligacoes) || {}, ps = d.pcs, S = res.secoes, folg = res.aparo && res.aparo.resumo ? res.aparo.resumo : { n: 0, minimo_mm: 0 }, escs = [], XI = X3(), CUBO = dep("MadT4", "./madt4.js").CUBO;
    function perto(P, r) { return ps.filter(function (pc) { var A = pc.p0, B = pc.p1, dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L2 = dx * dx + dy * dy + dz * dz, t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy + (P[2] - A[2]) * dz) / L2)), Q2 = [A[0] + dx * t, A[1] + dy * t, A[2] + dz * t]; return Math.hypot(Q2[0] - P[0], Q2[1] - P[1], Q2[2] - P[2]) < r; }); }
    var larg = 128, h = Math.round(a.h * 0.27), c0 = I4.cantos[0], hip1 = I4.hip1;
    var canto = perto([c0[0], c0[1], I4.Hp], 1.1).filter(function (p) { return /^(E|FR|P)$/.test(p.g); }), apice = perto([I4.cx, I4.cz, I4.Hap], 1.0).filter(function (p) { return /^(E|CB)$/.test(p.g); }), ter = perto(hip1, 0.9).filter(function (p) { return /^(E|T)$/.test(p.g); });
    var vs = [[canto, "A - ESPIGÃO NO CANTO (PLANTA)"], [apice, "B - ESPIGÕES NO CUBO DO ÁPICE (PLANTA)"], [ter, "C - TERÇA EM BISEL NO ESPIGÃO (PLANTA)"]], alvo = [[c0[0], c0[1], I4.Hp], [I4.cx, I4.cz, I4.Hap], hip1], k;
    for (k = 0; k < 3; k++) {
      var xk = a.x + 2 + k * (larg + 3), v = XI.vistaPecas(c, vs[k][0], "xy", xk, a.y + 2, larg, h, vs[k][1]); Q.rotular(c, v.itens, T.marcaDensa, { umaPorMarca: true, raio: 20 });
      var pt = v.f3(alvo[k]); if (k === 1) D.circ(pt[0], pt[1], Math.max(0.8, CUBO.d / 2 * v.s), "MAD-FINA"); else { D.circ(pt[0], pt[1], 4, "MAD-FINA"); D.linha(pt[0] + 3, pt[1] - 3, pt[0] + 14, pt[1] - 16, "MAD-FINA"); } escs.push(v.esc);
    }
    var xq = a.x + 2 + 3 * (larg + 3) + 3, wq = a.x + a.w - xq - 2, linhas = [], nome = { espigaoApice: "Espigão x cubo do ápice", cuboApice: "Cubo (tubo de aço)", espigaoCanto: "Sela do espigão (canto)", cintaCanto: "Cinta do canto", torcaoFrechal: "Torção do frechal (canto)", tercaEspigao: "Terça x espigão (rosca 45°)", tercaEspigaoAxial: "Terça x espigão (estribo)", caibroApice: "Caibro x cubo", caibroPe: "Caibro x frechal (pé)", tercaCaibro: "Terça x caibro (rosca 45°)", pilarCentralTopo: "Pilar central x tubo", cuboRadial: "Chapa radial do cubo + solda", chapaUnicaCanto: "Chapa única sela + cinta", pontaFrechalCabe: "Grupos cabem na ponta do FR" };
    Object.keys(nome).forEach(function (kk) { var l = L4[kk]; if (!l) return; linhas.push([nome[kk], l.pinos && l.pinos.n ? l.pinos.n + " pinos Ø" + Math.round((l.pinos.d || 0) * 1000) : (l.porApoio ? l.porApoio + " parafusos WT-T" : (kk === "cuboApice" ? "tubo Ø114,3x6,3" : (kk === "cuboRadial" ? "solda filete " + l.solda.perna_mm + " mm" : "-"))), I.br(l.eta, 3), l.ok === false ? "NÃO ATENDE" : "ok"]); });
    D.tabela(xq, a.y + 2, [{ t: "LIGAÇÃO" }, { t: "FIXADORES" }, { t: "η" }, { t: "SITUAÇÃO" }], linhas, { fs: T.tabela * 0.85 });
    D.textos(xq, a.y + 2 + 6 * (linhas.length + 2), ["FOLGA CONSTRUTIVA >= 10 mm: " + folg.n + " pontas aparadas (espigão e caibro no cubo, frechal nos 2 lados do canto, terças em bisel de " + br(90 - 180 / I4.n, 1) + "°); mínima medida " + br(folg.minimo_mm, 1) + " mm. A carga passa SÓ pelas chapas de aço internas (t = 8 mm), selas/estribos, cubo e pinos inox.", "Empuxo horizontal do espigão no canto: " + br(res.espigao && res.espigao.heel ? res.espigao.heel.H : 0, 1) + " kN, resolvido pela tração do anel; a cinta transmite a força de extremidade do frechal (" + br(res.cinta && res.cinta.fim ? res.cinta.fim.N : 0, 1) + " kN)."], T.nota * 0.9, { wmax: wq - 1 });
    var y0 = a.y + h + 6, cw = (a.w - 4 - 2 * 3) / 3, ch = (a.h - h - 6 - 2 - 3) / 2, tch = 8;
    function par(cod, titulo, chave, A, B, extra) {
      var l = L4[chave]; if (!l || !l.pinos || !l.pinos.n) return null;
      var chW = Math.max(l.chapa ? l.chapa.largura_mm : 0, 30), gA = XI.gPinos(cod + " " + A.rot, l.pinos, A.S), pnB = B.pn || l.pinos, gB = XI.gPinos(cod + " " + B.rot, pnB, B.S);
      var notas = [{ t: cod + " - " + titulo + ": " + (l.descricao || "") }, "1 - chapa interna de aço t = " + tch + " mm, " + chW + " mm de largura, em fenda " + (B.aco ? "no espigão (a outra metade é a aba radial do cubo, soldada ao tubo)" : "nas duas peças") + "; 2 - " + l.pinos.n + " pinos inox A4 Ø" + Math.round(l.pinos.d * 1000) + " em " + A.rot + (B.aco ? "" : " e " + pnB.n + " pinos Ø" + Math.round(pnB.d * 1000) + " em " + B.rot) + " (esquema em linha; posição e ângulo do encontro: folhas E01 e E03); 3 - FOLGA CONSTRUTIVA de 10 mm entre as peças (cotada): nada encosta, a carga passa só por chapa + pinos; furo da chapa Ø(d + 1).",
        "Espaçamentos real | mínimo (mm) - " + A.rot + ": " + Q.esp2(gA) + (B.aco ? "" : (pnB !== l.pinos ? "; " + B.rot + ": " + Q.esp2(gB) : "; a hospedeira " + B.rot + " leva o MESMO NÚMERO de pinos (grupo espelhado) — a confirmar pelo RT/fabricante")) + ". Mínimo: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.", Q.etaLinha(l.pinos, cod + "-pinos", "Pinos em " + A.rot + " (Johansen):")];
      var chp = l.chapa; if (chp) notas.push(Q.etaLinha(chp, cod + "-chapa", "Chapa (NBR 8800: bruta, líquida fu/1,35 e esmagamento):"));
      (extra || []).forEach(function (t) { notas.push(t); });
      return { cod: cod, titulo: titulo, A: { pn: l.pinos, S: A.S, rot: A.rot }, B: { pn: pnB, S: B.S, rot: B.rot, aco: !!B.aco }, gap: 10, chW: chW, tch: tch, notas: notas, solda: B.aco && L4.cuboRadial ? L4.cuboRadial.solda.perna_mm : null };
    }
    var folgaTxt = function (re) { var m = Infinity; (res.aparo ? res.aparo.folgas : []).forEach(function (f) { if (re.test(f.peca) && f.folga_mm < m) m = f.folga_mm; }); return isFinite(m) ? "Folga mínima medida no modelo aparado: " + br(m, 1) + " mm (>= 10 mm)." : "Folga de projeto: 10 mm."; };
    var ms = L4.espigaoCanto && L4.espigaoCanto.momentoSela, tubo = { b: CUBO.d, h: CUBO.d };
    var cels = [
      par("N1", "SELA DO ESPIGÃO NO CANTO", "espigaoCanto", { rot: "EP", S: S.E }, { rot: "FR", S: S.FR }, [{ t: (ms ? "Momento da sela M = N·δ = " + br(ms.M_d_kNm, 2) + " kN·m (δ = h_FR/2 = " + br(ms.delta_m * 100, 0) + " cm) no grupo de pinos; " : "") + "arrancamento " + br(L4.espigaoCanto ? L4.espigaoCanto.arrancamento_kN : 0, 2) + " kN (inclui a faixa de aresta, cpe local -1,2, a confirmar pelo RT). " + folgaTxt(/^FR\d+\/(ini|fim)/) }]),
      par("N2", "CINTA DO CANTO (FRECHAL X FRECHAL)", "cintaCanto", { rot: "FR", S: S.FR }, { rot: "FR", S: S.FR }, [{ t: "Força de EXTREMIDADE do frechal no canto: " + br(L4.cintaCanto ? L4.cintaCanto.N_fim_kN : 0, 1) + " kN. Os dois frechais param a >= 10 mm do espigão. " + folgaTxt(/^FR\d+\/(ini|fim)/) }]),
      par("N3", "ESPIGÃO NO CUBO DO ÁPICE", "espigaoApice", { rot: "EP", S: S.E }, { rot: "CUBO", S: tubo, aco: true }, [{ t: "Ponta do espigão aparada a >= 10 mm do tubo do cubo e dos espigões e caibros vizinhos; envolvente de " + (I4.pilarCentral ? "4" : "3") + " modelos. " + (L4.cuboRadial ? "Chapa radial em balanço e = " + br(L4.cuboRadial.e_m * 1000, 0) + " mm do tubo ao centróide dos pinos: M = S·e = " + br(L4.cuboRadial.M_kNm, 2) + " kN·m, flambagem local chi = " + br(L4.cuboRadial.chi, 3) + "; SOLDA DE FILETE " + L4.cuboRadial.solda.perna_mm + " mm nos 2 lados (eta " + br(L4.cuboRadial.solda.eta, 2) + "), eletrodo fw = 485 MPa (adocao). " : "") + folgaTxt(/^E\d+$/) }]),
      par("N4", "TERÇA NO ESPIGÃO (ESTRIBO)", "tercaEspigaoAxial", { rot: "TL", S: S.T }, { rot: "EP", S: S.E }, [{ t: "Terça em bisel de " + br(90 - 180 / I4.n, 1) + "° em planta, a >= 10 mm do espigão, em estribo de aço; rosca total a 45°: " + (L4.tercaEspigao ? L4.tercaEspigao.porApoio + " parafusos WT-T por apoio (eta " + br(L4.tercaEspigao.eta, 3) + ")" : "") + ". " + folgaTxt(/^T\d+_\d+\/(ini|fim)/) }]),
      I4.caibro ? par("N5", "CAIBRO NO CUBO DO ÁPICE", "caibroApice", { rot: "CB", S: S.CB }, { rot: "CUBO", S: tubo, aco: true }, [{ t: "Ponta do caibro aparada a >= 10 mm do tubo e dos espigões vizinhos. " + folgaTxt(/^CB\d+$/) }]) : null,
      I4.caibro ? par("N6", "PÉ DO CAIBRO SOBRE O FRECHAL", "caibroPe", { rot: "CB", S: S.CB }, { rot: "FR", S: S.FR }, [{ t: "Pé do caibro sobre o frechal/pilar do meio do lado; terças contínuas sobre o caibro (rosca total 45°: " + (L4.tercaCaibro ? L4.tercaCaibro.porApoio : 0) + " parafusos por cruzamento)." }]) : (I4.pilarCentral ? par("N5", "PILAR CENTRAL NO TUBO DO CUBO", "pilarCentralTopo", { rot: "PC", S: S.PC }, { rot: "CUBO", S: tubo, aco: true }, [{ t: "O tubo desce " + br(CUBO.desce * 100, 0) + " cm dentro do pilar (fenda + pinos); a madeira do pilar termina abaixo do nó." }]) : null)
    ].filter(function (o) { return !!o; });
    cels.forEach(function (o, i) { escs = escs.concat(celulaNoT4(c, a.x + 2 + (i % 3) * (cw + 3), y0 + Math.floor(i / 3) * (ch + 3), cw, ch, o, XI)); });
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "INDICADA" };
  }
  /** célula do nó: como a da T3, mas com a elevação do cubo (aço) quando a peça B é o tubo */
  function elevAco(o, XI) {
    return function (cc, r) {
      var A = o.A, gA = XI.posGrupo(A.pn), g = o.gap, hA = Math.round(A.S.h * 1000), hT = Math.round(o.B.S.h * 1000), chW = o.chW, m = 36, Lt = 60, hh = Math.max(hA, hT);
      (cc.cels.pinosDes = cc.cels.pinosDes || []).push({ cod: o.cod, grupo: A.rot, n: gA.xr.length * gA.zc.length, d: gA.d });
      var V = Q.vista(cc, r, { x0: -gA.L - m, x1: g + Lt + m, z0: -hh / 2, z1: hh / 2 }, [14, 14, 14, 24], [5, 10, 20, 25, 50]), xa = function (x) { return -gA.L + x; };
      V.fundo(-gA.L - m, -hA / 2, gA.L + m, hA); V.mad(-gA.L - m, -hA / 2, gA.L + m, hA, { horiz: true }); V.vis(-gA.L - m, -hA / 2, gA.L + m, hA, "MAD-PECA");
      V.aco(g, -hT / 2, Lt + m, hT); V.oc(-gA.L, -chW / 2, gA.L, chW); V.aco(0, -chW / 2, g + Lt, chW);
      gA.xr.forEach(function (x) { gA.zc.forEach(function (z) { V.pino(xa(x), z, gA.d, true); }); });
      V.cadH([-gA.L].concat(gA.xr.map(xa)).concat([0]), -hh / 2, -6, [String(gA.a3)].concat(gA.xr.slice(1).map(function () { return String(gA.a1); })).concat([String(gA.L - gA.xr[gA.xr.length - 1])]), { semExt: true });
      V.ch(0, g, hh / 2, 9, String(g), { semExt: false });
      V.tx(-gA.L - m + 4, hh / 2 + 5, A.rot + " (" + gA.xr.length * gA.zc.length + " pinos Ø" + gA.d + ")", null, { al: "L" }); V.tx(g + 6, hh / 2 + 5, o.B.rot + " (aço, Ø" + hT + ")", null, { al: "L" }); if (o.solda) { V.tx(g + 6, -hh / 2 - 9, "SOLDA DE FILETE " + o.solda + " mm, 2 LADOS (tubo-chapa radial)", null, { al: "L" }); V.bal(g + 2, -chW / 2, 8, -14, 3); }
      V.bal(g / 2, chW / 2, 0, -12, 1); V.bal(xa(gA.xr[0]), gA.zc[0], -12, -14, 2);
      return V;
    };
  }
  function celulaNoT4(c, x, y, w, h, o, XI) {
    if (!o.B.aco) return XI.celulaNo(c, x, y, w, h, o);
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, x + 1, y + 1, o.cod + " - " + o.titulo, null), by = y + ht, bh = h - ht - 2, h1 = Math.round(bh * 0.36), h2 = Math.round(bh * 0.26), hv = 6, escs = [], reg = { cod: o.cod, vistas: [] };
    var oc = { cod: o.cod, A: o.A, B: { pn: o.B.pn, S: o.B.S, rot: o.B.rot }, gap: o.gap, chW: o.chW, tch: o.tch, solda: o.solda };
    [["ELEVAÇÃO DO NÓ (corte na fenda; folga " + o.gap + " mm cotada)", elevAco(o, XI), { x: x + 1, y: by, w: w - 2, h: h1 }], ["CORTE (peça " + o.A.rot + ")", XI.corteNo(oc), { x: x + 1, y: by + h1 + 2, w: w / 2 - 2, h: h2 }]].forEach(function (v) {
      var rp = v[2], V = v[1](c, { x: rp.x, y: rp.y + hv, w: rp.w, h: rp.h - hv });
      D.texto(rp.x + 0.5, rp.y + 3.4, v[0] + " - ESC 1:" + V.esc, T.nota, { peso: 0.12, attr: ' data-vista="1"' }); reg.vistas.push({ t: v[0], esc: V.esc }); if (escs.indexOf(V.esc) < 0) escs.push(V.esc);
    });
    var yn = by + h1 + h2 + 5, hu = D.textos(x + 1, yn, o.notas, T.nota * 0.92, { wmax: w - 3 });
    if (yn + hu > y + h + 0.5) c.avisos.push("Folha " + c.rotulo + ": a nota de " + o.cod + " passa do painel (" + Math.round(yn + hu - y) + " > " + Math.round(h) + " mm).");
    c.cels.push(reg); return escs;
  }
  function folhaE05(c) { return Q.folhaE10(c); }

  function gerar(res, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    var P = Q.PR(); if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || res.tipologia !== "T4" || !res.t4 || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes || !res.secoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo da T4 sem fonte/ligações: não há pranchas."] };
    var E = I.estilo(opcoes.padrao);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA"), codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-T4", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var classe = Q.txt(opcoes.classe) || Q.classeDe((arr(res.fonte.pecas).filter(function (x) { return /MLC/.test(x.material || ""); })[0] || {}).material || "MLC GL24h");
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [] }; ctx0.d = contexto(res); ctx0.pend = ctx0.d.pend;
    var inf = res.t4.info, hip0 = res.t4.membros.filter(function (m) { return m.id === "E1"; })[0]; inf.ang0 = Math.atan2(hip0.eixo0[1] - inf.cz, hip0.eixo0[0] - inf.cx); inf.angLado0 = inf.ang0 + inf.beta; inf.hip1 = res.t4.membros.filter(function (m) { return m.id === "E1"; })[0].nos[Math.min(1, hip0.nos.length - 1)] || hip0.eixo0;
    var ORDEM = [["E01", "cobertura", folhaE01, null, "PLANTA DE COBERTURA - ESPIGÕES, TERÇAS EM ANEL E FRECHAL"], ["E02", "elevacoes", folhaE02, null, "ELEVAÇÕES FRONTAL E LATERAL"], ["E03", "espigao", folhaE03, null, "SEÇÃO PELO ESPIGÃO E ELEVAÇÃO PELA FACE"], ["E04", "nos", folhaE04, null, "DETALHES DOS NÓS - CUBO DO ÁPICE, ESPIGÃO NO CANTO, TERÇA EM BISEL, CINTA"], ["E10", "pecas", folhaE05, null, "LISTA DE PEÇAS POR POSIÇÃO"]];
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = "0" + (i + 1);
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: def[4] });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madt4pranchas", nome: "Estrutura de madeira engenharada (T4, telhado " + (inf.n === 8 ? "oitavado" : "sextavado") + ") - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt((opcoes.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + (opcoes.obra || "")), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var notas = [{ t: "Telhado " + (inf.n === 8 ? "oitavado" : "sextavado") + " (T4). Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho." }, { t: "Marca da peça: {marca} - MLC " + classe + " - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC." }, { t: "Pontas aparadas com folga >= 10 mm: a carga passa só por chapa de aço interna (t = 8 mm), sela/estribo, cubo do ápice e pinos inox. Tratamento NBR 16143 conforme a tabela E10." }, { t: "Vento em telhado poligonal: premissa conservadora (Tabela 5 da NBR 6123 do retângulo circunscrito), a confirmar pelo RT." }, { t: SX().EXIGENCIA }, { t: "VERMELHO = o que impede emitir: não fabricar nem comprar o item antes de resolver." }];
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

  var MadEngT4 = { gerar: gerar, contexto: contexto, girar: girar };
  global.MadEngT4 = MadEngT4;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT4;
})(typeof window !== "undefined" ? window : this);

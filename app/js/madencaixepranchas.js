/* =====================================================================
 * madencaixepranchas.js — FOLHAS DE CARPINTARIA da madeira engenharada: FICHAS DE CORTE de cada peça-tipo (vistas com os cortes cotados, ângulo em planta e em elevação de
 * cada ponta, comprimento bruto e de cada face, furos dos pinos com cotas), LISTA DE CORTE e NÓS MONTADOS (ângulos, contato/folga, fixadores).
 * Padrão RA de detalhamento (skill padrao-detalhamento, v2.0): mesmo carimbo, camadas MAD-* e tipos de texto das folhas E01–E05 da T3 (js/madt3pranchas.js).
 * Entra no gerador de folhas da T3 por MadEncaixePranchas.defs(res) → [[id, chave, fn(c), null, titulo], …]. Motor PURO, ES5.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var ME = dep("MadEncaixe", "./madencaixe.js"), TP = dep("MadEncaixeTip", "./madencaixetip.js"), V = ME && ME.v;
  function br(x, n) { return (n == null ? Number(x).toFixed(2) : Number(x).toFixed(n)).replace(".", ","); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ---- geometria 2D ---- */
  function hull(pts) {
    var P = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), H = [], k;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    for (k = 0; k < P.length; k++) { while (H.length >= 2 && cr(H[H.length - 2], H[H.length - 1], P[k]) <= 1e-12) H.pop(); H.push(P[k]); }
    var t = H.length + 1; for (k = P.length - 2; k >= 0; k--) { while (H.length >= t && cr(H[H.length - 2], H[H.length - 1], P[k]) <= 1e-12) H.pop(); H.push(P[k]); }
    H.pop(); return H;
  }
  /** recorta o sólido da peça numa janela de comprimento junto a uma ponta (m) */
  function janelaPonta(P, e, Wn) {
    var S = ME.solidoDe(P), ex = P.ex;
    if (e === 0) { var s1 = ME.extensaoAxial(P)[0] + Wn; return ME.cortar(S, ex, V.dot(ex, P.p0) + s1); }
    var s2 = ME.extensaoAxial(P)[1] - Wn; return ME.cortar(S, V.mul(ex, -1), -(V.dot(ex, P.p0) + s2));
  }
  function projeta(S, P, modo) {
    return ME.vertices(S).map(function (q) { var d = V.sub(q, P.p0); return [V.dot(d, P.ex), modo === "elev" ? V.dot(d, P.ey) : V.dot(d, P.ez)]; });
  }

  /* ---- vista 3D isométrica pequena da ponta (faces voltadas para o observador, ordem de fundo para frente) ---- */
  function isoPonta(D, S, P, e, cx, cy, tam) {
    var c = V.un(e === 0 ? [-1, 1, 1] : [1, 1, 1]), r = V.un(V.cruz([0, 1, 0], c)), u = V.cruz(c, r), faces = [], mn = [1e9, 1e9], mx = [-1e9, -1e9];
    ME.prep(S);
    function L(q) { var d = V.sub(q, P.p0); return [V.dot(d, P.ex), V.dot(d, P.ey), V.dot(d, P.ez)]; }
    S.f.forEach(function (F) {
      var nl = [V.dot(F.n, P.ex), V.dot(F.n, P.ey), V.dot(F.n, P.ez)]; if (V.dot(nl, c) <= 1e-6) return;
      var pts = F.p.map(function (q) { var l = L(q); return [V.dot(l, r), V.dot(l, u)]; }), dep = F.p.reduce(function (m, q) { return m + V.dot(L(q), c); }, 0) / F.p.length;
      pts.forEach(function (q) { mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); });
      faces.push({ pts: pts, dep: dep });
    });
    var k = tam / Math.max(mx[0] - mn[0], mx[1] - mn[1], 1e-6), ox = cx - (mx[0] + mn[0]) / 2 * k, oy = cy + (mx[1] + mn[1]) / 2 * k;
    faces.sort(function (x, y) { return x.dep - y.dep; }).forEach(function (f) { D.poli(f.pts.map(function (q) { return [ox + q[0] * k, oy - q[1] * k]; }), "MAD-PECA", true); });
  }

  /* ---- ficha de uma peça-tipo (cartão de 1/9 da folha A1; texto >= 2,5 mm) ---- */
  function ficha(D, c, x, y, w, h, it, P) {
    var T = D.E.T, fs = Math.max(T.nota, 2.5), f = ME.fichaPeca(P), med = f.medidas, esc1 = Math.min((w - 16) / (med.bruto * 1000 + 1e-9), 0.04);
    D.ret(x, y, w, h, "MAD-FINA");
    D.texto(x + 3, y + 6, it.marca + "   MLC " + it.secao + " cm   " + it.qtd + " peça" + (it.qtd > 1 ? "s" : ""), fs * 1.3, { peso: 0.07 });
    D.texto(x + 3, y + 11.2, "bruto " + it.bruto_mm + " · eixo " + it.eixo_mm + " · face cima " + Math.round(it.faces_mm.topo * 1000) + " · baixo " + Math.round(it.faces_mm.fundo * 1000) + " mm   (nas pontas: cima = elevação, baixo = planta)", fs);
    var S = ME.solidoDe(P), hl = hull(projeta(S, P, "elev")), s0 = med.s0, yc = y + 22, hpx = Math.max(2, P.h * 1000 * esc1);
    D.poli(hl.map(function (q) { return [x + 8 + (q[0] - s0) * 1000 * esc1, yc - q[1] * 1000 * esc1]; }), "MAD-PECA", true);
    D.linha(x + 8, yc + hpx / 2 + 3, x + 8 + med.bruto * 1000 * esc1, yc + hpx / 2 + 3, "MAD-EIXO");
    D.texto(x + w / 2, yc + hpx / 2 + 7.4, "comprimento bruto " + it.bruto_mm + " mm (1:" + Math.round(1 / esc1) + ")", fs, { al: "C" });
    var Wn = Math.min(0.22, med.bruto * 0.45), yd = Math.max(y + 42, yc + hpx / 2 + 12), wd = (w - 9) / 2, esc2 = Math.min(0.24, (wd * 0.60) / (Wn * 1000)), hh = Math.max(P.h, 0.001) * 1000 * esc2, bb = Math.max(P.b || P.d || 0.01, 0.001) * 1000 * esc2;
    [0, 1].forEach(function (e) {
      var Sj = janelaPonta(P, e, Wn), xd = x + 3 + e * (wd + 3), pe = f.pontas[e];
      D.texto(xd, yd + 3, "PONTA " + (e === 0 ? "A" : "B") + " - " + pe.corte.toUpperCase(), fs * 1.1, { peso: 0.05 });
      if (!Sj) return;
      var ext = ME.extensaoAxial(P), sIni = e === 0 ? ext[0] : ext[1] - Wn;
      var he = hull(projeta(Sj, P, "elev")), hp = hull(projeta(Sj, P, "planta")), yE = yd + 11 + hh / 2, yP = yE + hh / 2 + 14 + bb / 2;
      function X(s) { return xd + 2 + (s - sIni) * 1000 * esc2; }
      D.poli(he.map(function (q) { return [X(q[0]), yE - q[1] * 1000 * esc2]; }), "MAD-PECA", true);
      D.poli(hp.map(function (q) { return [X(q[0]), yP - q[1] * 1000 * esc2]; }), "MAD-PECA", true);
      var fx = arr(P.fixa).filter(function (q) { return q.ponta === e; })[0] || { pos: [] }, pl = P.fins[e].planos.filter(function (z) { return z.contra; })[0];
      var den = pl ? V.dot(pl.n, P.ex) : 1, sF = pl && Math.abs(den) > 1e-6 ? (pl.d - V.dot(pl.n, P.p0)) / den : (e === 0 ? med.s0 : med.s1), seen = {};
      fx.pos.forEach(function (q) {
        var sp = e === 0 ? sF + q.s : sF - q.s, px = X(sp), py = yE - q.y * 1000 * esc2;
        D.circ(px, py, Math.max(0.6, q.d * 1000 * esc2 / 2), "MAD-FERRAGEM");
        var kx = Math.round(q.s * 1000); if (!seen[kx] && Object.keys(seen).length < 2) { seen[kx] = 1; D.cota(X(sF), yE + hh / 2 + 1, px, yE + hh / 2 + 1, 4.5 + 4.6 * Object.keys(seen).length, String(kx), { h: 2.5 }); }
      });
      isoPonta(D, Sj, P, e, xd + wd - 18, yd + 16, 30);
      var ty = yP + bb / 2 + 5 + 3.2 * Math.min(3, Object.keys(seen).length);
      pe.planos.forEach(function (a, k) { D.texto(xd, ty + k * 3.9, (a.tipo === "folga" ? "folga " + br(a.folga_mm, 0) : "contato") + " " + (a.contra || "-") + ": pl " + br(Math.abs(a.planta), 1) + " el " + br(Math.abs(a.elevacao), 1) + " bis " + br(a.bisel, 1), fs); });
      if (!pe.planos.length) D.texto(xd, ty, "esquadro (90 graus) ou ponta livre", fs);
    });
    var nfx = arr(P.fixa).reduce(function (q, z) { return q + z.n; }, 0);
    D.texto(x + 3, y + h - 2.2, (nfx ? nfx + " pinos inox por peça, chapa 8 mm. " : "") + "ids: " + it.ids.slice(0, 4).join(" ") + (it.ids.length > 4 ? " ..." : ""), fs);
  }

  /* ---- nó montado: peças da vizinhança num recorte, em planta e em elevação ---- */
  function recorte(S, c0, R) {
    var q = S, k, ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (k = 0; k < 3 && q; k++) { q = ME.cortar(q, ax[k], c0[k] + R); if (q) q = ME.cortar(q, V.mul(ax[k], -1), -(c0[k] - R)); }
    return q;
  }
  function noMontado(D, c, x, y, w, h, N, R, e0) {
    var T = D.E.T, fs = T.nota, Rj = N.R || 0.4, esc = Math.min((w - 6) / (2 * Rj * 1000), (h - 30) / (2 * Rj * 1000)), pcs = N.ids.map(function (id) { return R.pecas.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    D.ret(x, y, w, h, "MAD-FINA"); D.texto(x + 2, y + 4.2, N.cod + " — " + N.titulo, fs * 1.1, { peso: 0.06 });
    var vistas = [["planta", function (q) { return [q[0], q[1]]; }, 1, "PLANTA"], [N.vista || "lateral", N.vista === "frente" ? function (q) { return [q[0], -q[2]]; } : function (q) { return [q[1], -q[2]]; }, 1, N.vista === "frente" ? "ELEVAÇÃO (X–altura)" : "CORTE (Z–altura)"]];
    var linhas = []; N.txt.concat(["Peças desenhadas: " + N.ids.join(" ") + " (linha grossa: espigão, cumeeira, tirantes)"]).forEach(function (t) { var w = String(t).split(" "), cur = ""; w.forEach(function (pl) { if ((cur + " " + pl).length > 88) { linhas.push(cur); cur = pl; } else cur = cur ? cur + " " + pl : pl; }); if (cur) linhas.push(cur); });
    var hv = (h - 14 - 3.4 * linhas.length) / 2; esc = Math.min((w - 6) / (2 * Rj * 1000), hv * 0.92 / (2 * Rj * 1000));
    vistas.forEach(function (vw, k) {
      var cx = x + w / 2, cy = y + 8 + k * (hv + 2) + hv / 2;
      D.texto(x + 2, cy - hv / 2 + 2, vw[3], fs * 0.8);
      pcs.forEach(function (P, ix) {
        var S = recorte(ME.solidoDe(P), N.centro, Rj); if (!S) return;
        var pts = ME.vertices(S).map(function (q) { var p = vw[1](q), p0 = vw[1](N.centro); return [cx + (p[0] - p0[0]) * 1000 * esc, cy + (p[1] - p0[1]) * 1000 * esc]; });
        D.poli(hull(pts), P.g === "E" || P.g === "CM" || P.g === "BI" || P.g === "MI" ? "MAD-PRINCIPAL" : (P.aco ? "MAD-FERRAGEM" : "MAD-PECA"), true);
      });
    });
    var ty = y + h - 3 - 3.4 * linhas.length;
    linhas.forEach(function (t, k) { D.texto(x + 2, ty + k * 3.4, t, fs); });
  }

  function nosT3(R) {
    var I = R.info, esp = function (id) { return R.pecas.filter(function (p) { return p.id === id; })[0]; }, out = [], tc = function (id, e) { var P = esp(id); if (!P) return null; var S = ME.solidoDe(P), pl = P.fins[e].planos[0]; if (!pl) return null; var F = ME.faceNoPlano(P, pl); if (!F) return null; var c = [0, 0, 0]; F.p.forEach(function (q) { c = V.add(c, q); }); return V.mul(c, 1 / F.p.length); };
    var c1 = tc("TF2", 1), c2 = esp("E3") && tc("E3", 1), c3 = esp("BSF0") && esp("FR1") && [esp("BSF0").noCalc0[0], 0, esp("FR1").p0[2] + 0.1];
    function ang(id, e) { var P = esp(id); if (!P) return "—"; var f = ME.fichaPeca(P).pontas[e], a = f.planos[0]; return a ? f.corte + ": planta " + br(Math.abs(a.planta), 1) + "°, elevação " + br(Math.abs(a.elevacao), 1) + "°, bisel " + br(a.bisel, 1) + "°" : "esquadro"; }
    if (c1 && esp("E1")) out.push({ cod: "N1", titulo: "TERÇA ENCOSTADA NO ESPIGÃO (contato, folga 0)", ids: ["TF2", "E1", "TF1", "BSF0"], centro: c1, vista: "frente", R: 0.45, txt: ["Terça TF2: " + ang("TF2", 1), "Plano de corte = face lateral VERTICAL do espigão; a seção da terça está no plano da água.", "Terça EMBUTIDA no plano do banzo (eixo no eixo, e = 0): interrompida na tesoura, encostada na face do banzo (estribo) e emendada por chapa passante em fenda."] });
    if (c2) out.push({ cod: "N2", titulo: "ESPIGÃO NA PONTA DA CUMEEIRA (folga 10 mm, só chapa e pinos)", ids: ["E3", "E4", "BSF1", "MSE", "CM", "BSB1"], centro: c2, vista: "frente", R: 0.5, txt: ["Espigão E3: " + ang("E3", 1), "A ponta chega a 10 mm das faces do banzo, da meia-tesoura e da cumeeira (decisão do RT mantida).", "Carga: chapa interna t = 8 mm + pinos inox (LIG-E3b)."] });
    if (c3) out.push({ cod: "N3", titulo: "CALCANHAR DA TESOURA — BANZO E TIRANTE SOBRE O FRECHAL", ids: ["BSF0", "BI0", "FR1", "P2", "FR3"], centro: c3, vista: "lateral", R: 0.55, txt: ["Banzo BSF0 (rebaixo/boca de pássaro no frechal): " + ang("BSF0", 0), "Tirante BI0 assenta sobre o frechal (face contra face); frechal sobre o pilar.", "Frechal desce dFR = " + br(R.info.dFR * 100, 1) + " cm do eixo de cálculo (declarado)."] });
    var ap = esp("PDF3_0") && esp("CM"); if (ap) out.push({ cod: "N4", titulo: "ÁPICE — CUMEEIRA ENTRE OS BANZOS, MONTANTE NO CENTRO", ids: ["BSF0", "BSB0", "CM", "PDF3_0"], centro: [esp("BSF0").noCalc1[0], esp("BSF0").noCalc1[1], esp("BSF0").noCalc1[2] + 0.1], vista: "lateral", R: 0.45, txt: ["Banzo BSF0 na cumeeira: " + ang("BSF0", 1), "Os banzos encostam nas faces laterais da cumeeira (contato); topo da cumeeira sob o plano das terças.", "Altura de contato banzo × cumeeira: " + br(R.info.assentoCM * 100, 1) + " cm."] });
    var e1 = esp("E1"); if (e1 && e1.canto) out.push({ cod: "N5", titulo: "ESPIGÃO NO CRUZAMENTO DOS FRECHAIS (BICO DE PÁSSARO RASO + CHAPA ÚNICA)", ids: ["E1", "FR1", "FR3", "P1"], centro: [e1.canto[0], e1.canto[1], e1.noCalc0[2] - 0.0], vista: "frente", R: 0.45, txt: ["Espigão assentado no cruzamento dos frechais (sem sela-calço); frechais em esquadria no canto.", "Frechal em esquadria 45°: " + ang("FR1", 0), "e_v (eixo do espigão ao eixo do frechal) = " + br((R.info.dFR + R.info.evE) * 100, 1) + " cm: momento H·e_v na chapa única sela+cinta."] });
    var ta = esp("TF2a"), tb2 = esp("TF2b"); if (ta && tb2 && ta.noCalc1) out.push({ cod: "N7", titulo: "EMENDA PASSANTE E ESTRIBO DA TERÇA NO BANZO (terça BIAPOIADA)", ids: ["TF2a", "TF2b", "BSF0"], centro: ta.noCalc1, vista: "frente", R: 0.45, txt: ["Terça biapoiada entre tesouras, no plano do banzo (eixo no eixo): estribo/cantoneira na face do banzo leva o cortante V.", "Emenda passante: chapa interna 8 mm em fenda de 10 mm atravessando o banzo, 8 pinos Ø12: transmite só a força AXIAL (tirante do arco do espigão); NÃO é emenda rígida.", "Fenda do banzo: b_liq = b - 10 mm na seção líquida (verificada)."] });
    var dgId = R.info && esp("DGF2_0") ? "DGF2_0" : null; if (dgId) { var d0 = esp(dgId), nd = d0.noCalc1; out.push({ cod: "N6", titulo: "DIAGONAL DA TESOURA NO BANZO" + (R.cfg && /howe|fink/.test(String(I.tesouraTipo)) ? " (folga 10 mm)" : " (contato)"), ids: [dgId, "PDF2_0", "BSF0", "BI0"], centro: [nd[0], nd[1], nd[2]], vista: "lateral", R: 0.45, txt: ["Diagonal " + dgId + " ponta A: " + ang(dgId, 0), "Diagonal " + dgId + " ponta B: " + ang(dgId, 1)] }); }
    return out;
  }

  /* ---- as folhas ---- */
  var POR_FOLHA = 9;
  function listaFichas(c) {
    if (c._fichas) return c._fichas;
    var R = TP.resolvidoT3(c.res), mad = R.pecas.filter(function (P) { return !P.aco; }), LC = ME.listaCorte(mad), porId = {}; R.pecas.forEach(function (P) { porId[P.id] = P; });
    if (!R.fix) R.fix = TP.fixadoresT3(R, c.res.ligacoesT3 && c.res.ligacoesT3.ligacoes);
    c._fichas = { R: R, LC: LC, porId: porId }; return c._fichas;
  }
  function folhaFichas(k) {
    return function (c) {
      var D = c.D, a = c.geo.area, F = listaFichas(c), cols = 3, rows = 3, per = 9, w = (a.w - 2) / cols - 1, h = (a.h - 2) / rows - 1, ini = k * per, it, i;
      for (i = 0; i < per && ini + i < F.LC.length; i++) { it = F.LC[ini + i]; ficha(D, c, a.x + 1 + (i % cols) * (w + 1), a.y + 1 + Math.floor(i / cols) * (h + 1), w, h, it, F.porId[it.ids[0]]); }
      return { escala: "1:5 (pontas) e ajustada (peça)" };
    };
  }
  function folhaLista(c) {
    var D = c.D, a = c.geo.area, F = listaFichas(c), T = D.E.T, linhas = F.LC.map(function (x) {
      function pt(p) { var q = p.planos[0]; return q ? p.corte + " " + br(Math.abs(q.planta), 1) + "/" + br(Math.abs(q.elevacao), 1) + "/" + br(q.bisel, 1) : p.corte; }
      return [x.marca, x.secao, String(x.bruto_mm), String(Math.round(x.faces_mm.topo * 1000)), String(Math.round(x.faces_mm.fundo * 1000)), pt(x.pontaA), pt(x.pontaB), String(x.qtd)];
    });
    D.texto(a.x + 2, a.y + 5, "LISTA DE CORTE — peça, seção, comprimento bruto (ponta longa a ponta longa), faces de cima e de baixo, corte das duas pontas (planta / elevação / bisel real, em graus) e quantidade", T.nota * 1.1, { peso: 0.06 });
    var cols = 2, porCol = Math.ceil(linhas.length / cols), cw = (a.w - 6) / cols;
    for (var k = 0; k < cols; k++) D.tabela(a.x + 2 + k * (cw + 2), a.y + 10, [{ t: "MARCA" }, { t: "SEÇÃO cm" }, { t: "BRUTO mm" }, { t: "CIMA mm" }, { t: "BAIXO mm" }, { t: "PONTA A (pl/el/bisel)" }, { t: "PONTA B (pl/el/bisel)" }, { t: "QTD" }], linhas.slice(k * porCol, (k + 1) * porCol), { fs: T.tabela });
    return { escala: "S/ESC." };
  }
  function folhaNos(c) {
    var D = c.D, a = c.geo.area, F = listaFichas(c), N = nosT3(F.R), cols = 3, rows = 3, w = (a.w - 2) / cols - 1, h = (a.h - 2) / rows - 1;
    N.slice(0, cols * rows).forEach(function (n, i) { noMontado(D, c, a.x + 1 + (i % cols) * (w + 1), a.y + 1 + Math.floor(i / cols) * (h + 1), w, h, n, F.R); });
    return { escala: "1:" + Math.round(1 / Math.min((w - 6) / 900, 0.5) / 1) };
  }
  /** definições de folha para o gerador (mesmo formato de ORDEM em madt3pranchas.js) */
  function defs(res, inicio) {
    var F = listaFichas({ res: res }), nf = Math.max(1, Math.ceil(F.LC.length / POR_FOLHA)), out = [], k;
    function id2(n) { return "E" + (n < 10 ? "0" : "") + n; }
    for (k = 0; k < nf; k++) out.push([id2(inicio + k), "fichas" + (k + 1), folhaFichas(k), null, "FICHAS DE CORTE DE CARPINTARIA " + (k + 1) + "/" + nf + " - ÂNGULOS DE CADA PONTA, FACES E FUROS"]);
    out.push([id2(inicio + nf), "lista-corte", folhaLista, null, "LISTA DE CORTE"]);
    out.push([id2(inicio + nf + 1), "nos-montados", folhaNos, null, "NÓS MONTADOS - CORTES, CONTATOS, FOLGAS E FIXADORES"]);
    return out;
  }
  var MadEncaixePranchas = { defs: defs, ficha: ficha, noMontado: noMontado, nosT3: nosT3 };
  if (typeof module !== "undefined" && module.exports) module.exports = MadEncaixePranchas; else global.MadEncaixePranchas = MadEncaixePranchas;
})(typeof window !== "undefined" ? window : this);

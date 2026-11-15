/* =====================================================================
 * lajesmistageo.js — GEOMETRIA DA LAJE STEEL DECK E DA LAJE DE PAINEL WALL PARA O BIM (14/11/2026). Motor PURO (ES5), Node-testável.
 *
 * Irmão do js/lajespregeo.js: a laje sai do modelo com PEÇAS REAIS e o volume de cada peça é o da geometria que o 3D mostra.
 *
 * STEEL DECK   gerar({ serieId | serie, hCm, comprimentoM, larguraM, direcao:"x"|"z", origem:{x,y,z}, coberturaTelaM })
 *   comprimentoM = ao longo das nervuras ; larguraM = perpendicular (onde o passo da onda se repete)
 *   peças: "chapa" (extrusão do contorno da chapa trapezoidal: faixa de espessura t seguindo o perfil), "concreto" (extrusão do contorno entre o topo
 *   da chapa e a face superior da laje: capa + o que enche as nervuras) e "tela" (caixa fina de aço na cobertura da tela). O perfil começa pelo vale
 *   e é cortado em larguraM (onda partida no fim). ⚠ MODELAGEM DA RA (sai em `assumidos`): almas retas e simétricas; mossas de aderência e frisos
 *   ignorados; a chapa tem a espessura nominal deslocada na vertical; a mesa superior do Metform é MEDIDA no desenho do catálogo (não é cota impressa).
 * PAINEL WALL  gerar({ serieId | serie, comprimentoM, larguraM, direcao, origem, dimensaoPainel:{larguraMm, comprimentoMm}, juntaM, fracaoFibrocimento })
 *   comprimentoM = ao longo do comprimento do painel (PERPENDICULAR aos apoios: o painel vai atravessado nos apoios, Decorlit p. 12);
 *   larguraM = ao longo dos apoios. Faixas de painéis com junta (3 mm, Decorlit p. 14) e faixas ímpares com meia peça no início (juntas desencontradas).
 *   peças por painel: "face-inferior", "miolo", "face-superior". ⚠ A espessura das placas cimentícias NÃO é publicada: usa-se a fração em
 *   volume de fibrocimento da Eternit (14% a 20%; ponto médio 17%) como espessura TOTAL das duas faces (assumido, editável).
 *
 * SAÍDA   { ok, pecas:[...], resumo, avisos, assumidos }
 *   caixa    : { forma:"caixa", x, y, z (centro x/z, base y), dx, dy, dz }       (convenção de js/familiasra.js)
 *   extrusão : { forma:"extrusao", plano:"frente", x, y, z (origem do contorno), rot (0 | 90, graus em torno de Y), contorno:[[u,v]…], altura (comprimento extrudado) }
 *              o contorno está no plano (u = através das nervuras, v = vertical); com rot 0 a extrusão corre em +z; com rot 90 corre em +x e u vai a −z
 *              (por isso, na direção "x", z = origem.z + larguraM). volumeM3 = área do contorno × comprimento.
 *
 * PONTO DE FIAÇÃO NO BIM: ver o fim deste arquivo.  Testes: node tools/test-lajesmista.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var LM = dep("LajesMista", "./lajesmista.js");
  var D = dep("LajesMistaDados", "./lajesmistadados.js");
  var EPS = 1e-9;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function area(pts) {   /* shoelace (positivo = anti-horário) */
    var a = 0, i, n = pts.length;
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  /* "Ø3,8 x Ø3,8 - 150x150" → { d: 0.0038 (m), espacamento: 0.15 } */
  function fioDeTela(comp) {
    var m = /[ØøO]\s*([\d,.]+)/.exec(String(comp || ""));
    return m ? Number(m[1].replace(",", ".")) / 1000 : null;
  }

  /* ---------------------------------------------------------------- perfil da chapa (polilinha inferior) cortado em [0, W] */
  function polilinha(pf, W) {
    var pts = [], k, x0, cand;
    var nP = Math.ceil(W / pf.passo) + 1;
    for (k = 0; k <= nP; k++) {
      x0 = k * pf.passo;
      cand = [[x0, 0], [x0 + pf.vale, 0], [x0 + pf.vale + pf.alma, pf.altura], [x0 + pf.vale + pf.alma + pf.mesa, pf.altura]];
      cand.forEach(function (q) { pts.push(q); });
    }
    pts.push([nP * pf.passo + pf.passo, 0]);
    var out = [];
    for (k = 0; k < pts.length; k++) {
      if (pts[k][0] < W - EPS) { out.push(pts[k]); continue; }
      /* corta no segmento que cruza x = W */
      var a = pts[k - 1], b = pts[k], f = (W - a[0]) / (b[0] - a[0]);
      var yW = a[1] + f * (b[1] - a[1]);
      if (!out.length || Math.abs(out[out.length - 1][0] - W) > EPS || Math.abs(out[out.length - 1][1] - yW) > EPS) out.push([W, yW]);
      break;
    }
    /* tira duplicados consecutivos */
    var lim = [];
    out.forEach(function (q) { var u = lim[lim.length - 1]; if (!u || Math.abs(u[0] - q[0]) > EPS || Math.abs(u[1] - q[1]) > EPS) lim.push([q[0], q[1]]); });
    return lim;
  }

  function gerarSteelDeck(s, par, out) {
    var L = num(par.comprimentoM, NaN), W = num(par.larguraM, NaN), hCm = num(par.hCm, NaN);
    if (!(L > 0) || !(W > 0)) { out.motivo = "informe comprimentoM e larguraM (> 0)"; return out; }
    if (!isFinite(hCm)) { out.motivo = "informe a altura total da laje (hCm)"; return out; }
    var T = s.tabela, tem = false;
    LM.alturasCm(s).forEach(function (a) { if (Math.abs(a.hCm - hCm) < EPS) tem = true; });
    if (!tem && !(s.usuario)) { out.motivo = "altura " + hCm + " cm não consta da tabela desta série (" + s.designacao + ")"; return out; }
    var dir = par.direcao === "z" ? "z" : "x", o = par.origem || {}, ox = num(o.x, 0), oy = num(o.y, 0), oz = num(o.z, 0);
    var pf = LM.perfilSteelDeck(s), h = hCm / 100;
    if (!(h > pf.altura + pf.t + EPS)) { out.motivo = "a altura da laje (" + hCm + " cm) não passa da altura da chapa + espessura (" + r6((pf.altura + pf.t) * 100) + " cm): sem capa de concreto"; return out; }
    out.assumidos.push("perfil: almas retas e simétricas (projeção horizontal " + r6(pf.alma * 1000) + " mm), mossas de aderência e frisos ignorados; começa pelo vale e é cortado em " + W + " m; espessura da chapa (" + r6(pf.t * 1000) + " mm nominal) deslocada na vertical");
    if (/MEDIDA/.test(s.geometria.mesaSuperiorOrigem || "")) out.assumidos.push("mesa superior da nervura " + s.geometria.mesaSuperiorMm + " mm: " + s.geometria.mesaSuperiorOrigem);
    var cobTela = num(par.coberturaTelaM, pf.cobTela);
    if (/NÃO publicada/.test(s.geometria.coberturaTelaOrigem || "") && par.coberturaTelaM == null) out.assumidos.push("cobertura da tela " + (cobTela * 1000) + " mm: " + s.geometria.coberturaTelaOrigem);
    var Li = polilinha(pf, W);
    var Ls = Li.map(function (q) { return [q[0], q[1] + pf.t]; });
    var contChapa = Li.concat(Ls.slice().reverse());
    var contConc = Ls.concat([[W, h], [0, h]]);
    /* o contorno precisa ser anti-horário (volume positivo) */
    function norm(c) { return area(c) < 0 ? c.slice().reverse() : c; }
    contChapa = norm(contChapa); contConc = norm(contConc);
    function ext(id, papel, cont, material) {
      var p = { id: id, papel: papel, forma: "extrusao", plano: "frente", y: r6(oy), altura: r6(L), contorno: cont.map(function (q) { return [r6(q[0]), r6(q[1])]; }), material: material, celula: 0 };
      if (dir === "z") { p.x = r6(ox); p.z = r6(oz); p.rot = 0; } else { p.x = r6(ox); p.z = r6(oz + W); p.rot = 90; }
      p.areaSecaoM2 = r6(Math.abs(area(cont))); p.volumeM3 = r6(p.areaSecaoM2 * L);
      out.pecas.push(p);
    }
    ext("chapa", "chapa", contChapa, "Aço");
    ext("concreto", "concreto", contConc, "Concreto");
    /* tela */
    var ql = null, hq = null;
    if (T.tipo === "sobrecarga-por-vao-unica") { var ln = null; T.linhas.forEach(function (l) { if (Math.abs(l.hMm / 10 - hCm) < EPS) ln = l; }); if (ln) { ql = ln.tela; hq = ln; } }
    else { arrFor(s.concreto, function (c) { if (c.h === hCm && c.tela) { ql = c.tela; } }); }
    var dFio = ql ? fioDeTela(ql.composicao) : null;
    if (ql && dFio) {
      var yTop = h - cobTela;   /* face superior da tela (a "cobertura" é medida da face do concreto até a tela) */
      var dy = 2 * dFio;        /* 2 camadas de fio: caixa fina de representação (o volume de AÇO real sai do peso publicado) */
      if (yTop - dy < pf.altura + pf.t - EPS) out.avisos.push("a tela (cobertura " + r6(cobTela * 1000) + " mm) encosta/entra na chapa: aumente a altura da laje ou reduza a cobertura");
      var pt = { id: "tela", papel: "tela", forma: "caixa", y: r6(oy + yTop - dy), dy: r6(dy), material: "Aço", celula: 0, denominacao: ql.denominacao, composicao: ql.composicao };
      if (dir === "x") { pt.x = r6(ox + L / 2); pt.z = r6(oz + W / 2); pt.dx = r6(L); pt.dz = r6(W); } else { pt.x = r6(ox + W / 2); pt.z = r6(oz + L / 2); pt.dx = r6(W); pt.dz = r6(L); }
      pt.volumeM3 = r6(pt.dx * pt.dy * pt.dz);
      pt.massaAcoKg = ql.pesoKgM2 != null ? r6(ql.pesoKgM2 * L * W) : null;
      out.pecas.push(pt);
      if (ql.pesoKgM2 == null) out.assumidos.push("tela " + ql.denominacao + ": a Perfilor não publica o peso (kg/m²); massa de aço da tela não calculada");
    } else {
      out.avisos.push("tela soldada: esta altura não tem tela especificada na fonte (" + (s.fabricante) + "); peça \"tela\" não gerada");
    }
    var vol = { chapa: 0, concreto: 0, tela: 0 };
    out.pecas.forEach(function (p) { vol[p.papel] += p.volumeM3; });
    var A = L * W, cons = (T.tipo === "sobrecarga-por-vao-unica" && hq) ? hq.consumoConcretoM3M2 : (function () { var v = null; arrFor(s.concreto, function (c) { if (c.h === hCm) v = c.volumeDm3M2 / 1000; }); return v; })();
    out.resumo = { serieId: s.id, designacao: s.designacao, fonte: LM.fonteTxt(s), direcao: dir, comprimentoM: L, larguraM: W, areaM2: r6(A), hTotalM: r6(h), passoM: pf.passo, nOndas: r6(W / pf.passo),
      volumesM3: { chapa: r6(vol.chapa), concreto: r6(vol.concreto), tela: r6(vol.tela) }, concretoM3M2: r6(vol.concreto / A), concretoPublicadoM3M2: cons,
      chapaKgM2Publicado: s.fisicas.pesoKgM2, chapaKgGeometriaKg: r6(vol.chapa * 7850) };
    out.ok = true;
    return out;
  }
  function arrFor(a, fn) { (Array.isArray(a) ? a : []).forEach(fn); }

  /* ---------------------------------------------------------------- PAINEL WALL */
  function gerarPainel(s, par, out) {
    var L = num(par.comprimentoM, NaN), W = num(par.larguraM, NaN);
    if (!(L > 0) || !(W > 0)) { out.motivo = "informe comprimentoM e larguraM (> 0)"; return out; }
    var dir = par.direcao === "z" ? "z" : "x", o = par.origem || {}, ox = num(o.x, 0), oy = num(o.y, 0), oz = num(o.z, 0);
    var dim = par.dimensaoPainel || s.dimensoes[0], junta = num(par.juntaM, 0.003);
    var ok = false; s.dimensoes.forEach(function (m) { if (m.larguraMm === dim.larguraMm && m.comprimentoMm === dim.comprimentoMm) ok = true; });
    if (!ok) { out.motivo = "dimensão " + dim.larguraMm + " × " + dim.comprimentoMm + " mm não consta do catálogo desta série"; return out; }
    var pw = dim.larguraMm / 1000, pl = dim.comprimentoMm / 1000, e = s.espessuraMm / 1000;
    var fr = num(par.fracaoFibrocimento, 0.17), faixa = s.composicao.fibrocimentoVolPct;
    if (!(fr > 0 && fr < 0.5)) { out.motivo = "fração de fibrocimento fora de 0 a 0,5"; return out; }
    var tf = fr * e / 2, tm = e - 2 * tf;
    out.assumidos.push("espessura de cada placa cimentícia = " + r6(tf * 1000) + " mm (fração de fibrocimento " + fr * 100 + "% da espessura, repartida nas 2 faces): a espessura da placa NÃO é publicada; faixa da Eternit " + faixa[0] + "% a " + faixa[1] + "%");
    if (fr * 100 < faixa[0] - EPS || fr * 100 > faixa[1] + EPS) out.avisos.push("fração de fibrocimento " + fr * 100 + "% fora da faixa publicada pela Eternit (" + faixa[0] + "% a " + faixa[1] + "%)");
    if (!(par.juntaM == null) && junta < 0) { out.motivo = "junta negativa"; return out; }
    /* faixas ao longo da largura; em cada faixa, painéis ao longo do comprimento; faixas ímpares começam com meia peça */
    var v0 = 0, j = 0, id = 0;
    function caixa(papel, u0, u1, w0, w1, y0, y1, material, celula) {
      var du = u1 - u0, dv = w1 - w0, dy = y1 - y0;
      if (du <= EPS || dv <= EPS || dy <= EPS) return;
      var uc = (u0 + u1) / 2, vc = (w0 + w1) / 2, p = { id: papel + "-" + celula, papel: papel, forma: "caixa", y: r6(oy + y0), dy: r6(dy), material: material, celula: celula };
      if (dir === "x") { p.x = r6(ox + uc); p.z = r6(oz + vc); p.dx = r6(du); p.dz = r6(dv); } else { p.x = r6(ox + vc); p.z = r6(oz + uc); p.dx = r6(dv); p.dz = r6(du); }
      p.volumeM3 = r6(du * dv * dy);
      out.pecas.push(p);
    }
    var lista = [], inteiras = 0;
    while (v0 < W - EPS) {
      var v1 = Math.min(W, v0 + pw), u = 0, meia = (j % 2 === 1);
      var first = true;
      while (u < L - EPS) {
        var comp = (meia && first) ? pl / 2 : pl;
        var u1 = Math.min(L, u + comp);
        id++;
        caixa("face-inferior", u, u1, v0, v1, 0, tf, "Fibrocimento", id);
        caixa("miolo", u, u1, v0, v1, tf, tf + tm, "Madeira", id);
        caixa("face-superior", u, u1, v0, v1, tf + tm, e, "Fibrocimento", id);
        var inteiro = Math.abs((u1 - u) - pl) < 1e-9 && Math.abs((v1 - v0) - pw) < 1e-9;
        if (inteiro) inteiras++;
        lista.push({ i: id, faixa: j + 1, comprimentoM: r6(u1 - u), larguraM: r6(v1 - v0), inteiro: inteiro });
        u = u1 + junta; first = false;
      }
      v0 = v1 + junta; j++;
    }
    var vol = { "face-inferior": 0, miolo: 0, "face-superior": 0 };
    out.pecas.forEach(function (p) { vol[p.papel] += p.volumeM3; });
    var aPainel = pw * pl, aPecas = 0;
    lista.forEach(function (q) { aPecas += q.comprimentoM * q.larguraM; });
    out.paineis = lista;
    out.resumo = { serieId: s.id, designacao: s.designacao, fonte: LM.fonteTxt(s), direcao: dir, comprimentoM: L, larguraM: W, areaM2: r6(L * W), espessuraMm: s.espessuraMm, faceMm: r6(tf * 1000), miolo_mm: r6(tm * 1000),
      dimensaoPainelMm: { larguraMm: dim.larguraMm, comprimentoMm: dim.comprimentoMm }, pecas: lista.length, pecasInteiras: inteiras, pecasCortadas: lista.length - inteiras, faixas: j,
      areaPecasM2: r6(aPecas), paineisMinimo: Math.ceil(aPecas / aPainel - 1e-9), paineisSemReaproveitamento: lista.length,
      volumesM3: { faceInferior: r6(vol["face-inferior"]), miolo: r6(vol.miolo), faceSuperior: r6(vol["face-superior"]) }, juntaM: junta,
      pesoPublicadoKgM2: dim.pesoKgM2 };
    out.avisos.push("juntas de " + junta * 1000 + " mm entre painéis (Decorlit, manual p. 14); painéis perpendiculares aos apoios, apoios a no máximo " + (s.tabela.opcoes[s.tabela.opcoes.length - 1].espacamentoMm / 1000) + " m");
    out.ok = true;
    return out;
  }

  function gerar(par) {
    par = par || {};
    var out = { ok: false, pecas: [], resumo: {}, avisos: [], assumidos: [] };
    if (!LM || !D) { out.motivo = "catálogo não carregado (js/lajesmista.js, js/lajesmistadados.js)"; return out; }
    var s = par.serie || LM.serie(par.serieId);
    if (!s) { out.motivo = "série \"" + par.serieId + "\" não existe"; return out; }
    if (s.usuario && s.usuario.geometriaAlterada) out.avisos.push("série do usuário (" + s.usuario.marca + "): a tabela do fabricante não vale para esta geometria");
    if (LM.ehSteelDeck(s)) return gerarSteelDeck(s, par, out);
    if (LM.ehPainel(s)) return gerarPainel(s, par, out);
    out.motivo = "tipo de série desconhecido"; return out;
  }

  global.LajesMistaGeo = { gerar: gerar, polilinha: polilinha, area: area, fioDeTela: fioDeTela, versao: 1 };
  if (typeof module !== "undefined" && module.exports) module.exports = global.LajesMistaGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * PONTO DE FIAÇÃO NO 3D (a fazer pela sessão principal — NÃO mexi em js/bim.js, js/conclaje.js, js/concpilar.js, js/concdadoscalc.js nem em index.html)
 *   1. Carregar, nesta ordem, em index.html, logo DEPOIS de <script src="js/familiaslajepre.js"> (linha ~1097 deste worktree, mesmo grupo das lajes pré; nenhum dos 4 usa DOM):
 *        js/lajesmistadados.js, js/lajesmista.js, js/lajesmistageo.js, js/familiaslajemista.js
 *      (o último registra as famílias "ra-laje-steel-deck" e "ra-laje-painel-wall" em FamiliasRA: aparecem na biblioteca e os TIPOS já vêm do catálogo).
 *   2. Comando de lançar laje (o mesmo ponto onde a laje pré-fabricada entra — ver o fim de js/lajespregeo.js): quando o tipo for steel deck ou Painel Wall,
 *      chamar LajesMista.escolher({ vaoM, sobrecargaKnM2, revestimentoKnM2, apoio, tipo }) para sugerir a série/altura e, com a escolhida,
 *      LajesMistaGeo.gerar({ serieId, hCm, comprimentoM, larguraM, direcao, origem }) → UMA op "lote" com uma peça por item de `pecas`
 *      (forma "extrusao" com contorno/plano/rot como em js/familia.js; "caixa" como nas lajes pré), todas com a marca c.lajeMista = { id, serie, papel }.
 *   3. Orçamento: LajesMista.quantitativos(serie, par, resultado) (por m²: chapa kg, concreto m³, tela kg, ou painéis/parafusos) e a linha da laje guarda
 *      fabricante/série/página. Dimensionamento da laje no js/conclaje.js: o ponto de encaixe é a escolha da altura (como LajesPre.escolher na treliçada).
 * ===================================================================== */

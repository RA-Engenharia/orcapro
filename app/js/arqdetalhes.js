/* =====================================================================
 * arqdetalhes.js — DETALHES DE SACADA, CASA DO GÁS, LAREIRA E CHURRASQUEIRA (etapa 3 das pranchas de arquitetura, 15/11/2026).
 * Motor PURO, ES5, sem DOM, Node-testável. Antes a página desses elementos (js/arqcaderno.js) era só uma FICHA e a POSIÇÃO NA PLANTA; agora ela traz também a PLANTA
 * e o CORTE do próprio elemento, tirados da GEOMETRIA DO MODELO — nada é desenhado por fora:
 *   · planta: o contorno do elemento (peças da família, caixa ou ambiente), as paredes, os pilares e os guarda-corpos ao redor, recortados numa janela em volta do elemento,
 *     com as cotas do contorno e a linha do corte AA;
 *   · corte AA: o plano vertical que passa pelo meio do elemento (em x ou em z, o que atravessa mais tipos de peça; a seta na planta diz para onde se olha); mostra o que o plano corta (peças do elemento, paredes, laje, pilar,
 *     guarda-corpo) nas alturas do modelo, com a cota da altura e os níveis (relativos ao ±0,00 do térreo).
 * O que o modelo NÃO traz (material, acabamento, queda do piso, duto da lareira, altura do guarda-corpo que não foi modelado…) NÃO é inventado: sai "informe" em VERMELHO
 * e vira PENDÊNCIA da página e do resultado do caderno. Elemento sem FAMÍLIA no BIM (sacada e lareira) também é pendência, e o desenho sai só do que foi modelado
 * (ambiente + laje + guarda-corpo, ou a caixa modelada); casa do gás e churrasqueira têm família (ra-gas-abrigo, ra-lazer-churrasqueira-*), e modelados sem ela viram aviso.
 *
 *   ArqDetalhes.TIPOS                         ["sacada", "gas", "lareira", "churrasqueira"]
 *   ArqDetalhes.geometria(tipo, el, dados, cond)   { pts, base, topo, pecas, fonte, entorno, pendencias… } a partir do elemento de ArqCaderno.elementosCondicionais
 *   ArqDetalhes.desenhar(c, D, box, tipo, el, cond) desenha a planta e o corte dentro de box = { x, y, w, h }; devolve { escala, esc, ficha, pendencias, g }
 *   ArqDetalhes.NOTAS[tipo]                   as linhas da legenda na coluna de notas da página
 * Teste: tools/test-arq-detalhes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  var VERMELHO = "#c00000";
  var TIPOS = ["sacada", "gas", "lareira", "churrasqueira"];
  var ESCALAS = [10, 20, 25, 50, 75, 100];
  var MARGEM = 0.5;          /* m de contexto em volta do elemento (a janela do desenho) */
  var FILL_EL = "#e8e8e8";   /* o elemento: cinza claro (232) com contorno de parede cortada */
  var FILL_GUARDA = "#cfcfcf";

  var NOTAS = {
    comum: ["Planta e corte tirados da geometria do modelo: contorno do elemento e o que existe ao redor. Nada é desenhado por fora do modelo.",
      "Corte AA: plano vertical pelo meio do elemento (a seta na planta mostra para onde se olha; entre os dois planos fica o que atravessa mais peças). Poché escuro: parede, laje e pilar cortados. Cinza claro: o elemento.",
      "Cotas em metros; níveis referidos ao piso acabado do térreo (±0,00)."],
    sacada: ["Contorno da sacada = o ambiente do modelo; a laje e o guarda-corpo aparecem no corte quando o modelo os traz.", "O BIM não tem família de sacada: o desenho vem do ambiente, da laje e do guarda-corpo modelados."],
    gas: ["Abrigo / central de gás: o volume e as peças da família do modelo (ra-gas-abrigo) ou o que foi modelado como caixa ou ambiente.", "Ventilação, afastamentos e instalação seguem o projeto de gás e a norma vigente: conferir."],
    lareira: ["Volume da lareira como modelado (contorno e altura); o BIM não tem família de lareira.", "Fornalha, duto e chaminé: o modelo não traz, informar antes de emitir."],
    churrasqueira: ["Churrasqueira e fogão a lenha: as peças da família do modelo (ra-lazer-churrasqueira-*) ou o que foi modelado como caixa ou ambiente.", "Coifa, duto e acabamento: o que a família traz aparece no corte; o resto, informar."]
  };

  /* ------------------------------------------------------------ geometria básica */
  function intervalos(poly, zc) {   /* os trechos em x onde a reta z = zc está DENTRO do polígono */
    var xs = [], k = poly.length, i, a, b;
    for (i = 0; i < k; i++) { a = poly[i]; b = poly[(i + 1) % k]; if ((a[1] <= zc && b[1] > zc) || (b[1] <= zc && a[1] > zc)) xs.push(a[0] + (zc - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
    xs.sort(function (p, q) { return p - q; });
    var out = []; for (i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.002) out.push([xs[i], xs[i + 1]]);
    return out;
  }
  function recortar(poly, J) {      /* Sutherland–Hodgman contra o retângulo J = [x0, z0, x1, z1] */
    var P = poly.slice();
    function passo(dentro, inter) {
      var out = [], k = P.length, i;
      for (i = 0; i < k; i++) {
        var a = P[i], b = P[(i + 1) % k], da = dentro(a), db = dentro(b);
        if (da) out.push(a);
        if (da !== db) out.push(inter(a, b));
      }
      P = out;
    }
    passo(function (p) { return p[0] >= J[0]; }, function (a, b) { var t = (J[0] - a[0]) / (b[0] - a[0]); return [J[0], a[1] + t * (b[1] - a[1])]; });
    if (P.length) passo(function (p) { return p[0] <= J[2]; }, function (a, b) { var t = (J[2] - a[0]) / (b[0] - a[0]); return [J[2], a[1] + t * (b[1] - a[1])]; });
    if (P.length) passo(function (p) { return p[1] >= J[1]; }, function (a, b) { var t = (J[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), J[1]]; });
    if (P.length) passo(function (p) { return p[1] <= J[3]; }, function (a, b) { var t = (J[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), J[3]]; });
    return P;
  }
  function bb(pts) { return GEO().bbox(pts); }
  function cruza(b, J) { return !(b[2] < J[0] || b[0] > J[2] || b[3] < J[1] || b[1] > J[3]); }

  /* ------------------------------------------------------------ a geometria do elemento (do modelo) */
  function paraMundo(m, u, v) { var cs = Math.cos(num(m.rotY, 0)), sn = Math.sin(num(m.rotY, 0)); return [Math.round((num(m.x, 0) + u * cs + v * sn) * 10000) / 10000, Math.round((num(m.z, 0) - u * sn + v * cs) * 10000) / 10000]; }
  function geometria(tipo, el, dados, cond) {
    var d = dados || {}, g = { tipo: tipo, nome: txt(el && el.nome), pav: num(el && el.pav, 0), pts: arr(el && el.pts).slice(), base: null, topo: null, pecas: [], fonte: "", famId: "", familia: false, area: null, comp: null, prof: null, girado: false, pendencias: [], pe: null };
    if (el && el.movel) {
      var m = el.movel; g.fonte = "família"; g.famId = txt(m.famId); g.familia = true;
      if (arr(m.pts).length >= 3) g.pts = m.pts.slice();
      g.base = isFinite(m.h0) ? m.h0 : null; g.topo = isFinite(m.h1) ? m.h1 : null;
      arr(m.pecas).forEach(function (q) {
        if (![q.x0, q.x1, q.z0, q.z1, q.y0, q.y1].every(isFinite)) return;
        g.pecas.push({ pts: [paraMundo(m, q.x0, q.z0), paraMundo(m, q.x1, q.z0), paraMundo(m, q.x1, q.z1), paraMundo(m, q.x0, q.z1)], y0: num(m.y, 0) + q.y0, y1: num(m.y, 0) + q.y1, mat: txt(q.mat) });
      });
    } else if (el && el.cx) {
      g.fonte = "caixa"; var cx = el.cx, al = num(cx.altura, 0);
      if (al > 0 && isFinite(+cx.cy)) { g.base = num(cx.cy, 0) - al / 2; g.topo = num(cx.cy, 0) + al / 2; }
    } else if (el && el.ambiente) {
      g.fonte = "ambiente"; g.base = isFinite(el.ambiente.base) ? el.ambiente.base : null; g.pe = isFinite(el.ambiente.pe) && el.ambiente.pe > 0 ? el.ambiente.pe : null; g.area = isFinite(el.ambiente.area) ? el.ambiente.area : null;
    }
    if (g.pts.length < 3) { g.ok = false; return g; }
    g.ok = true;
    var G = GEO(), b = bb(g.pts);
    g.bbox = b; g.zc = (b[1] + b[3]) / 2 + 0.0007; g.xc = (b[0] + b[2]) / 2 + 0.0007;
    if (g.area == null) g.area = G.areaPol(g.pts);
    var L1 = g.pts.length >= 4 ? Math.sqrt(Math.pow(g.pts[1][0] - g.pts[0][0], 2) + Math.pow(g.pts[1][1] - g.pts[0][1], 2)) : b[2] - b[0], L2 = g.pts.length >= 4 ? Math.sqrt(Math.pow(g.pts[2][0] - g.pts[1][0], 2) + Math.pow(g.pts[2][1] - g.pts[1][1], 2)) : b[3] - b[1];
    g.comp = Math.max(L1, L2); g.prof = Math.min(L1, L2);
    g.girado = g.pts.length >= 4 && Math.abs(g.pts[1][0] - g.pts[0][0]) > 0.01 && Math.abs(g.pts[1][1] - g.pts[0][1]) > 0.01;
    /* o entorno: tudo o que o modelo tem dentro da janela (paredes, pilares, lajes, guarda-corpos) */
    var J = [b[0] - MARGEM, b[1] - MARGEM, b[2] + MARGEM, b[3] + MARGEM]; g.janela = J;
    var vivo = function (x) { return x && x.status !== "demolido" && arr(x.pts).length >= 3 && cruza(bb(x.pts), J); };
    g.entorno = {
      paredes: arr(d.paredes).filter(vivo).map(function (w) { return { pts: w.pts, y0: num(w.base, 0), y1: num(w.topo, 0), tipo: "parede" }; }),
      pilares: arr(d.pilares).filter(vivo).map(function (w) { return { pts: w.pts, y0: num(w.base, 0), y1: num(w.topo, 0), tipo: "pilar" }; }),
      lajes: arr(d.lajes).filter(vivo).map(function (l) { return { pts: l.pts, y0: num(l.topo, 0) - num(l.espessura, 0), y1: num(l.topo, 0), tipo: "laje" }; }),
      guardas: arr(cond && cond.guarda).filter(function (q) { return arr(q.pts).length >= 3 && cruza(bb(q.pts), J); }).map(function (q) { return { pts: q.pts, y0: num(q.cx && q.cx.cy, 0) - num(q.cx && q.cx.altura, 0) / 2, y1: num(q.cx && q.cx.cy, 0) + num(q.cx && q.cx.altura, 0) / 2, tipo: "guarda" }; })
    };
    g.pendencias = pendenciasDe(tipo, g);
    return g;
  }
  /* o que o BIM / o modelo não traz: nunca inventado, vira pendência (texto da página, aviso do caderno e lista do resultado) */
  function pendenciasDe(tipo, g) {
    var P = [], nome = ({ sacada: "Sacada", gas: "Casa do gás", lareira: "Lareira", churrasqueira: "Churrasqueira" })[tipo];
    if (tipo === "sacada") {
      P.push(nome + ": o BIM não tem família de sacada; o detalhe sai do ambiente, da laje e do guarda-corpo modelados.");
      if (!arr(g.entorno && g.entorno.guardas).length) P.push(nome + ": nenhum guarda-corpo modelado ao redor; informe a altura e o tipo.");
      P.push(nome + ": queda do piso, impermeabilização e acabamento: o modelo não traz, informe.");
    } else if (tipo === "lareira") {
      P.push(nome + ": o BIM não tem família de lareira; o detalhe sai só do volume modelado (contorno e altura).");
      P.push(nome + ": fornalha, duto e chaminé, material e acabamento: o modelo não traz, informe.");
    } else if (tipo === "gas") {
      if (!g.familia) P.push(nome + ": modelada sem a família de abrigo de GLP (ra-gas-abrigo); o detalhe sai só do contorno e da altura modelados.");
      P.push(nome + ": ventilação, porta e acabamento: o modelo não traz, informe.");
    } else if (tipo === "churrasqueira") {
      if (!g.familia) P.push(nome + ": modelada sem a família de churrasqueira (ra-lazer-churrasqueira-*); o detalhe sai só do contorno e da altura modelados.");
      P.push(nome + ": coifa, duto e acabamento: o que a família não traz, informe.");
    }
    if (g.fonte !== "ambiente" && (g.base == null || g.topo == null)) P.push(nome + ": o modelo não traz a altura do elemento; o corte sai sem a cota de altura.");
    if (g.fonte === "ambiente" && g.base == null) P.push(nome + ": o ambiente não traz o nível do piso; o corte sai sem nível.");
    return P;
  }

  /* ------------------------------------------------------------ o corte: o que o plano atravessa
     Dois planos possíveis pelo meio do elemento: "h" (z = constante, o desenho corre em x, olhando para o topo da folha) e "v" (x = constante, o desenho corre em z,
     olhando para a direita da folha). Fica o plano que atravessa MAIS tipos de peça (o da sacada corta o guarda-corpo, a laje e a mureta; o da churrasqueira, as peças da família). */
  function solidos(g, eixo) {
    var ax = eixo === "v" ? "v" : "h", out = [], c0 = ax === "h" ? g.zc : g.xc, J = g.janela, u0 = ax === "h" ? J[0] : J[1], u1 = ax === "h" ? J[2] : J[3];
    function vira(P) { return ax === "h" ? P : P.map(function (q) { return [q[1], q[0]]; }); }
    function pol(lista, kind) {
      lista.forEach(function (q) {
        intervalos(vira(q.pts), c0).forEach(function (iv) {
          var a = Math.max(iv[0], u0), b = Math.min(iv[1], u1);
          if (b - a > 0.002 && isFinite(q.y0) && isFinite(q.y1) && q.y1 > q.y0) out.push({ xa: a, xb: b, y0: q.y0, y1: q.y1, k: kind });
        });
      });
    }
    pol(g.entorno.lajes, "laje"); pol(g.entorno.paredes, "parede"); pol(g.entorno.pilares, "pilar"); pol(g.entorno.guardas, "guarda");
    if (g.pecas.length) pol(g.pecas, "el");
    else if (g.fonte !== "ambiente" && g.base != null && g.topo != null) pol([{ pts: g.pts, y0: g.base, y1: g.topo }], "el");
    out.eixo = ax; out.c0 = c0; out.u0 = u0; out.u1 = u1; out.vira = vira;
    return out;
  }
  function escolherPlano(g) {
    var h = solidos(g, "h"), v = solidos(g, "v");
    function pontos(sol) { var k = {}; sol.forEach(function (s) { k[s.k] = 1; }); return Object.keys(k).length * 100 + sol.length; }
    return pontos(v) > pontos(h) ? v : h;
  }
  /* a janela vertical do corte */
  function janelaVertical(g, sol) {
    var lo, hi;
    if (g.base != null) lo = g.base - 0.3; else lo = sol.length ? Math.min.apply(null, sol.map(function (s) { return s.y0; })) - 0.2 : -0.3;
    if (g.fonte !== "ambiente" && g.topo != null) hi = g.topo + 0.4;
    else {
      var gs = sol.filter(function (s) { return s.k === "guarda"; }).map(function (s) { return s.y1; });
      hi = (gs.length ? Math.max.apply(null, gs) : (g.base != null ? g.base + 1.1 : lo + 1.6)) + 0.45;
      if (g.pe && g.base != null) hi = Math.max(hi, Math.min(g.base + g.pe, g.base + 3.2) + 0.2);
    }
    return [lo, hi];
  }

  /* ------------------------------------------------------------ o desenho */
  function escolherEscala(g, box, hT, vJan, uSpan) {
    var W = Math.max(g.janela[2] - g.janela[0], uSpan), H = g.janela[3] - g.janela[1], i, k;
    var wBox = (box.w - 8) / 2;
    var melhor = ESCALAS[ESCALAS.length - 1];
    for (i = 0; i < ESCALAS.length; i++) {
      k = 1000 / ESCALAS[i];
      if (W * k + 2 * 14 + 12 <= wBox && hT + 6 + H * k + 14 <= box.h && hT + 6 + (vJan[1] - vJan[0]) * k + 16 <= box.h) { melhor = ESCALAS[i]; break; }
    }
    return melhor;
  }
  /* a planta e o corte do elemento dentro de box = { x, y, w, h } (mm de papel). `c` é o contexto de desenho das pranchas. */
  function desenhar(c, D, box, tipo, el, cond) {
    var d = DS(), T = D.E.T, K = d.K, g = geometria(tipo, el, c.dados, cond), avisos = c.avisos;
    var res = { escala: "SEM ESCALA", esc: null, g: g, ficha: [], pendencias: g.pendencias.slice(), larg: 0, alt: 14 };
    if (!g.ok) { res.pendencias.push(txt(g.nome) + ": o modelo não traz o contorno deste elemento; sem planta nem corte."); D.texto(box.x, box.y + 6, "SEM CONTORNO NO MODELO", T.tabela, { cor: VERMELHO }); return res; }
    var sol = escolherPlano(g), ax = sol.eixo, vJan = janelaVertical(g, sol), hT = 12;
    var uSpan = sol.u1 - sol.u0, esc = escolherEscala(g, box, hT, vJan, uSpan), k = 1000 / esc, J = g.janela, W = J[2] - J[0], H = J[3] - J[1], wSec = uSpan * k;
    res.esc = esc; res.escala = "ESC 1:" + esc;
    var CAM = D.E.camadas;
    /* ---------------- PLANTA */
    var bx1 = box.x, ox = bx1 + 14, oy = box.y + hT + 6;
    d.titulo(D, bx1, box.y, "PLANTA", "ESC 1:" + esc, "01");
    var M = d.mapa(J, ox, oy, k);
    function Pp(P) { return P.map(function (p) { return M.Pp(p); }); }
    function poche(lista, fill, cam) {
      lista.forEach(function (q) {
        var r = recortar(q.pts, J); if (r.length < 3) return;
        var P = Pp(r); d.fundoPol(D, P, fill); D.poli(P, cam, true);
      });
    }
    /* a laje não é cortada na planta (está sob o piso): ela só aparece no corte */
    poche(g.entorno.paredes.concat(g.entorno.pilares), K.pocheEscuro, "ARQ-PAREDE");
    poche(g.entorno.guardas, FILL_GUARDA, "ARQ-FINA");
    var Pel = Pp(g.pts);
    if (g.fonte === "ambiente") { d.fundoPol(D, Pel, "#f4f4f4"); D.poli(Pel, "ARQ-PAREDE", true); }
    else { d.fundoPol(D, Pel, FILL_EL); D.poli(Pel, "ARQ-PAREDE", true); }
    g.pecas.forEach(function (q) { D.poli(Pp(q.pts), "ARQ-FINA", true); });
    var bP = bb(Pel);
    /* a linha do corte AA, de lado a lado da janela: horizontal (olhando para o topo da folha) ou vertical (olhando para a direita) */
    if (ax === "h") { var zA = M.P(0, g.zc)[1]; d.marcaCorte(D, [ox - 0.1 * k, zA], [ox + W * k + 0.1 * k, zA], "A", -1); }
    else { var xA = M.P(g.xc, 0)[0]; d.marcaCorte(D, [xA, oy - 0.1 * k], [xA, oy + H * k + 0.1 * k], "A", -1); }
    if (g.fonte === "ambiente") {   /* o nome e a área, no lugar livre mais perto do centro (depois da linha do corte, para desviar dela); sem lugar livre, a ficha diz */
      var rot = txt(g.nome).toUpperCase().slice(0, 28), cen = [(bP[0] + bP[2]) / 2, (bP[1] + bP[3]) / 2];
      d.rotuloBloco(D, cen, [rot, br(g.area, 2) + " m²"], [bP[0] + 1, bP[1] + 1, bP[2] - 1, bP[3] - 1], { h: T.nota });
    }
    /* cotas do contorno: largura (embaixo) e profundidade (à direita) pelos eixos da folha */
    var ex = g.bbox, pA = M.P(ex[0], ex[3]), pB = M.P(ex[2], ex[3]), pC = M.P(ex[2], ex[1]), yCota = M.P(0, J[3])[1] + 5, xCota = M.P(J[2], 0)[0] + 6;
    D.linha(pA[0], pA[1] + 1, pA[0], yCota + 1.2, "ARQ-FINA"); D.linha(pB[0], pB[1] + 1, pB[0], yCota + 1.2, "ARQ-FINA");
    D.cota(pA[0], yCota, pB[0], yCota, 0, d.cotaTxt(ex[2] - ex[0]), { desde: [false, false], semExt: true });
    D.linha(pB[0] + 1, pB[1], xCota + 1.2, pB[1], "ARQ-FINA"); D.linha(pC[0] + 1, pC[1], xCota + 1.2, pC[1], "ARQ-FINA");
    D.cadeia([[xCota, pB[1]], [xCota, pC[1]]], 0, [d.cotaTxt(ex[3] - ex[1])], { offs: [4.5], desde: [false, false], semExt: true });
    /* ---------------- CORTE AA */
    var wUsada = W * k + 14 + 24, wSecU = wSec + 14 + 24, bx2 = box.x + wUsada + 8, ox2 = bx2 + 14, oy2 = box.y + hT + 6, Hv = vJan[1] - vJan[0];
    res.larg = wUsada + wSecU + 8 + 12; res.alt = hT + 6 + Math.max(H * k, Hv * k) + 18;   /* o que o desenho de fato usou (a página põe a posição na planta no que sobra) */
    function X(x) { return ox2 + (x - sol.u0) * k; }
    function Y(y) { return oy2 + (vJan[1] - y) * k; }
    d.titulo(D, bx2, box.y, "CORTE AA", "ESC 1:" + esc, "02");
    var kinds = [["laje", K.pocheEscuro, "ARQ-PAREDE"], ["parede", K.pocheEscuro, "ARQ-PAREDE"], ["pilar", K.pocheEscuro, "ARQ-PAREDE"], ["guarda", FILL_GUARDA, "ARQ-FINA"], ["el", FILL_EL, "ARQ-PAREDE"]];
    kinds.forEach(function (kd) {
      sol.filter(function (s) { return s.k === kd[0]; }).forEach(function (s) {
        var y0 = Math.max(s.y0, vJan[0]), y1 = Math.min(s.y1, vJan[1]); if (y1 - y0 <= 0.001) return;
        var P = [[X(s.xa), Y(y1)], [X(s.xb), Y(y1)], [X(s.xb), Y(y0)], [X(s.xa), Y(y0)]]; d.fundoPol(D, P, kd[1]); D.poli(P, kd[2], true);
      });
    });
    /* o nível do piso/base e o terreno */
    var yNivel = g.base != null ? g.base : null;
    if (yNivel != null && yNivel >= vJan[0] && yNivel <= vJan[1]) {
      D.linha(X(sol.u0), Y(yNivel), X(sol.u1), Y(yNivel), "ARQ-TERRENO");
      D.texto(X(sol.u0) - 1, Y(yNivel) - 0.8, d.nivelTxt(yNivel), T.nota * 0.9, { al: "D" });
    }
    var xs = sol.filter(function (s) { return s.k === "el"; });
    var ivA = g.fonte === "ambiente" ? intervalos(sol.vira(g.pts), sol.c0) : [], bbU = sol.eixo === "h" ? [g.bbox[0], g.bbox[2]] : [g.bbox[1], g.bbox[3]];
    var xa = xs.length ? Math.min.apply(null, xs.map(function (s) { return s.xa; })) : (ivA.length ? ivA[0][0] : bbU[0]);
    var xb = xs.length ? Math.max.apply(null, xs.map(function (s) { return s.xb; })) : (ivA.length ? ivA[ivA.length - 1][1] : bbU[1]);
    var yBase = yNivel != null ? Y(yNivel) : Y(vJan[0]) - 4;
    D.cota(X(xa), Y(vJan[0]) + 5, X(xb), Y(vJan[0]) + 5, 0, d.cotaTxt(xb - xa), { desde: [false, false], semExt: true });
    D.linha(X(xa), yBase + 1, X(xa), Y(vJan[0]) + 6.2, "ARQ-FINA"); D.linha(X(xb), yBase + 1, X(xb), Y(vJan[0]) + 6.2, "ARQ-FINA");
    var xH = X(sol.u1) + 6;
    if (g.fonte !== "ambiente" && g.base != null && g.topo != null) {
      D.linha(X(xb) + 1, Y(g.topo), xH + 1.2, Y(g.topo), "ARQ-FINA");
      D.cadeia([[xH, Y(g.base)], [xH, Y(g.topo)]], 0, [d.cotaTxt(g.topo - g.base)], { offs: [4.5], desde: [false, false], semExt: true });
      D.texto(X(xb) + 2, Y(g.topo) - 0.8, d.nivelTxt(g.topo), T.nota * 0.9, {});
    } else {
      var gd = sol.filter(function (s) { return s.k === "guarda"; })[0];
      if (gd) { D.linha(X(gd.xb) + 1, Y(gd.y1), xH + 1.2, Y(gd.y1), "ARQ-FINA"); D.linha(X(gd.xb) + 1, Y(gd.y0), xH + 1.2, Y(gd.y0), "ARQ-FINA"); D.cadeia([[xH, Y(gd.y0)], [xH, Y(gd.y1)]], 0, [d.cotaTxt(gd.y1 - gd.y0)], { offs: [4.5], desde: [false, false], semExt: true }); }
    }
    void CAM; void Hv; void avisos;
    /* ---------------- a ficha (valores do modelo; o que falta sai informe) */
    function inf(v, f) { return v != null && isFinite(v) ? f(v) : { t: "informe", cor: VERMELHO }; }
    var origem = g.fonte === "família" ? "família " + g.famId : (g.fonte === "caixa" ? "caixa do modelo" : "ambiente do modelo");
    res.ficha = [["Origem no modelo", origem], ["Comprimento (m)", br(g.comp, 2)], ["Profundidade (m)", br(g.prof, 2)], ["Área em planta (m²)", br(g.area, 2)]];
    if (g.fonte === "ambiente") { res.ficha.push(["Nível do piso (m)", inf(g.base, function (v) { return d.nivelTxt(v); })]); res.ficha.push(["Pé-direito (m)", inf(g.pe, function (v) { return br(v, 2); })]); }
    else { res.ficha.push(["Nível da base (m)", inf(g.base, function (v) { return d.nivelTxt(v); })]); res.ficha.push(["Altura (m)", inf(g.base != null && g.topo != null ? g.topo - g.base : null, function (v) { return br(v, 2); })]); }
    if (tipo === "sacada") { var gdr = arr(g.entorno.guardas)[0]; res.ficha.push(["Guarda-corpo, altura (m)", inf(gdr ? gdr.y1 - gdr.y0 : null, function (v) { return br(v, 2); })]); }
    if (g.girado) res.ficha.push(["Girado nos eixos", "sim (cotas = retângulo que o envolve)"]);
    return res;
  }

  var ArqDetalhes = { VERSAO: 1, TIPOS: TIPOS, NOTAS: NOTAS, ESCALAS: ESCALAS, geometria: geometria, desenhar: desenhar, solidos: solidos, intervalos: intervalos, recortar: recortar };
  global.ArqDetalhes = ArqDetalhes;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqDetalhes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

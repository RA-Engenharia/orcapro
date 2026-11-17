/* =====================================================================
 * svgpdf.js — FOLHA SVG (mm de papel) → PDF VETORIAL (motor PURO, ES5,
 * sem DOM, sem biblioteca, Node-testável).
 *
 * Para os desenhos que o próprio sistema gera (js/acopranchas.js Desenho,
 * js/metalfabdes.js): o SVG daqui usa um subconjunto pequeno e conhecido —
 * line, polyline, polygon, rect, circle, text (com rotate e text-anchor),
 * g com translate, stroke/fill/stroke-width/stroke-dasharray em mm. Esse
 * subconjunto vira operadores do PDF, um a um, na MESMA escala (1 mm de
 * papel = 1 mm no PDF): o PDF sai vetorial, imprime na escala e abre em
 * qualquer leitor. Não é um conversor de SVG genérico (path simples sim; gradiente,
 * clip, image e CSS ficam de fora — a imagem do logo do carimbo é pulada).
 *
 * Letra: Helvetica (fonte padrão do PDF, sem embutir) com as larguras do
 * AFM para o alinhamento (centro/fim). O Padrão RA pede RomanS — o PDF sai
 * com a Helvetica do leitor; o SVG (tela/prancha) continua com a RomanS.
 *
 *   paginas(svgs)   → [{ w, h, ops }]   (w, h em mm, da viewBox)
 *   pdf(svgs, info) → Uint8Array        (uma página por SVG)
 *   ler(bytes)      → { ok, paginas, textos, tamanhos }   (para os testes)
 * Teste: node tools/test-metal-desenho.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PT = 72 / 25.4;
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function f(v) { var n = Math.round(v * 100) / 100; return String(Math.abs(n) < 1e-9 ? 0 : n); }

  /* larguras da Helvetica (AFM padrão, milésimos do corpo), 32..126 */
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var HWB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  function semAcento(s) { return typeof s.normalize === "function" ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function largura(s, corpo, negrito) {
    var t = semAcento(txt(s)), w = 0, tab = negrito ? HWB : HW;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); w += c >= 32 && c <= 126 ? tab[c - 32] : 556; }
    return w / 1000 * corpo;
  }
  var WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
    0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f,
    0x2265: 0x3e, 0x2264: 0x3c, 0x2192: 0x3e };
  function win1252(s) {
    var o = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), b = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : (WIN[c] || 0x3f), ch = String.fromCharCode(b);
      o += ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch;
    }
    return o;
  }
  function desEsc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&"); }
  var NOMES = { black: "#000000", white: "#ffffff", red: "#ff0000", gray: "#808080", grey: "#808080" };
  /* COR: hex (#rgb/#rrggbb/#rrggbbaa), nome, rgb()/rgba(), url(#padrão) e currentColor. ⚠ Antes qualquer formato que não fosse hex virava PRETO (rgba de fundo de texto,
     url(#hachura) do desenho 2D): era a "tarja preta" sobre o texto no PDF. Agora: alfa mistura com o branco; url() = cinza claro (a hachura não existe no PDF);
     formato desconhecido = sem cor (null). `alfa` (0..1, opcional) vem de fill-opacity/opacity. */
  function misturar(c, a) { return a >= 1 ? c : [1 - a + c[0] * a, 1 - a + c[1] * a, 1 - a + c[2] * a]; }
  function cor(v, alfa) {
    var s = txt(v).trim().toLowerCase(); if (!s || s === "none" || s === "transparent") return null;
    var al = alfa == null || !isFinite(alfa) ? 1 : Math.max(0, Math.min(1, alfa)), r;
    if (al <= 0) return null;
    var mv = /^var\(\s*--[\w-]+\s*(?:,\s*([^)]+))?\)$/.exec(s);   /* var(--d2-tinta,#111): no papel vale o reserva (a folha não carrega as variáveis do app) */
    if (mv) { if (!mv[1]) return null; s = mv[1].trim(); }
    if (NOMES[s]) s = NOMES[s];
    if (/^url\(/.test(s)) return misturar([0.82, 0.82, 0.82], al);
    if (s === "currentcolor") return misturar([0, 0, 0], al);
    var m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,\/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) {
      var ch = function (x) { return /%$/.test(x) ? parseFloat(x) / 100 : parseFloat(x) / 255; };
      var a2 = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      if (a2 <= 0) return null;
      return misturar([Math.min(1, ch(m[1])), Math.min(1, ch(m[2])), Math.min(1, ch(m[3]))], Math.min(1, a2) * al);
    }
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s); if (m) s = "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/.exec(s); if (!m) return null;
    r = [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
    return misturar(r, (m[4] ? parseInt(m[4], 16) / 255 : 1) * al);
  }
  function attrs(s) {
    var o = {}, re = /([\w:-]+)\s*=\s*"([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = desEsc(m[2]);
    /* style="fill:#fff;stroke:#000" vale como atributo (e manda nele); antes era ignorado e a forma saía preta */
    if (o.style) o.style.split(";").forEach(function (d) { var i = d.indexOf(":"); if (i < 1) return; var k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); if (/^(fill|stroke|stroke-width|stroke-dasharray|fill-opacity|stroke-opacity|opacity|font-size|font-weight|font-style|text-anchor|display|fill-rule)$/.test(k)) o[k] = v; });
    return o;
  }
  function pontos(s) { var v = txt(s).trim().split(/[\s,]+/).map(Number), o = []; for (var i = 0; i + 1 < v.length; i += 2) o.push([v[i], v[i + 1]]); return o; }
  function translate(t) { var m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(txt(t)); return m ? [+m[1], +m[2]] : [0, 0]; }
  function escalaT(t) { var m = /scale\(\s*(-?[\d.e-]+)(?:[\s,]+(-?[\d.e-]+))?\s*\)/.exec(txt(t)); return m && +m[1] > 0 ? +m[1] : 1; }
  function rotate(t) { var m = /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(txt(t)); return m ? { a: +m[1], cx: m[2] != null ? +m[2] : null, cy: m[3] != null ? +m[3] : null } : null; }

  /* UMA folha SVG → { w, h, ops } (ops do conteúdo da página) */
  function pagina(svg) {
    var s = txt(svg), raiz = /<svg\b([^>]*)>/.exec(s); if (!raiz) return null;
    var ra = attrs(raiz[1]), vb = txt(ra.viewBox).split(/[\s,]+/).map(Number), W = vb.length === 4 ? vb[2] : num(ra.width, 210), H = vb.length === 4 ? vb[3] : num(ra.height, 297);
    var ops = ["1 J 1 j"], pilha = [{ tx: 0, ty: 0, k: 1, fill: null, stroke: null, sw: null, fs: null, anchor: null, peso: null, oculto: false }], re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>|([^<]+)/g, m, emTexto = null, emTitulo = false;
    var nTexto = 0, nTraco = 0, nPulado = 0, nSemEstilo = 0, ims = {}, clips = {}, emClip = null;
    var padroes = {}, emPad = null, xf = null;
    /* CAMADAS (OCG, 16/11/2026): data-ocg="id" (ou "mestre+variante": o conteúdo só aparece com os DOIS ligados) no <g> ou no elemento envolve o conteúdo em /OC /OCn BDC … EMC; com
       dois ids os BDC ficam ANINHADOS (conteúdo dentro de um OCG desligado some — vale em Acrobat, Edge/Chrome, MuPDF; o OCMD /AllOn não foi respeitado pelo MuPDF). O PDF lista as
       camadas no painel do leitor. Sem data-ocg nada muda. O nome do recurso (OCn) é da página; `ocs` guarda nome → [id]. */
    var ocs = {}, ocMap = {}, ocN = 0, ocPend = 0;
    function bdc(spec) {
      return txt(spec).split("+").map(function (q) { return q.trim(); }).filter(Boolean).map(function (id) {
        var nm = ocMap[id]; if (!nm) { nm = "OC" + (++ocN); ocMap[id] = nm; ocs[nm] = [id]; }
        return "/OC /" + nm + " BDC";
      });
    }
    function emc(n) { for (var q = 0; q < n; q++) ops.push("EMC"); }
    function X(x, g) { return (x * g.k + g.tx) * PT; }
    function Y(y, g) { return (H - (y * g.k + g.ty)) * PT; }
    function herda(a) {
      var g = pilha[pilha.length - 1], n = { tx: g.tx, ty: g.ty, k: g.k, fill: g.fill, stroke: g.stroke, sw: g.sw, fs: g.fs, anchor: g.anchor, peso: g.peso, clip: false, oculto: !!g.oculto || /^none$/.test(txt(a.display)) };
      var t = translate(a.transform); n.tx += t[0] * g.k; n.ty += t[1] * g.k; n.k = g.k * escalaT(a.transform);
      if (a.fill != null) n.fill = a.fill; if (a.stroke != null) n.stroke = a.stroke; if (a["stroke-width"] != null) n.sw = a["stroke-width"];
      if (a["font-size"] != null) n.fs = a["font-size"]; if (a["text-anchor"] != null) n.anchor = a["text-anchor"]; if (a["font-weight"] != null) n.peso = a["font-weight"];
      return n;
    }
    function pintar(a, g, fechado, ehForma) {
      var op = num(a.opacity, 1), fl = cor(a.fill != null ? a.fill : (g.fill != null ? g.fill : (ehForma ? "#000" : "none")), num(a["fill-opacity"], 1) * op), st = cor(a.stroke != null ? a.stroke : g.stroke, num(a["stroke-opacity"], 1) * op);
      /* TRAÇO SEM ESTILO (16/11/2026, cotas sem linha de chamada no PDF): <line>/<polyline> que nunca recebeu `stroke` (nem atributo, nem style, nem regra do papel) é invisível
         no SVG puro; na tela o CSS do app dá a tinta. Em vez de sumir no PDF, sai em preto fino e é CONTADO (nSemEstilo): o teste exige zero — falta regra em ESTILO_PAPEL. */
      if (!st && !ehForma && a.stroke == null && g.stroke == null) { st = [0.07, 0.07, 0.07]; nSemEstilo++; }
      var sw = num(a["stroke-width"] != null ? a["stroke-width"] : g.sw, 0.25) * g.k, eo = /evenodd/.test(txt(a["fill-rule"])) ? "*" : "";
      if (st) { ops.push(f(st[0]) + " " + f(st[1]) + " " + f(st[2]) + " RG", f(Math.max(0.05, sw) * PT) + " w"); var da = txt(a["stroke-dasharray"]).trim(); ops.push(da && da !== "none" ? "[" + da.split(/[\s,]+/).map(function (v) { return f(num(v, 1) * g.k * PT); }).join(" ") + "] 0 d" : "[] 0 d"); }
      if (fl) ops.push(f(fl[0]) + " " + f(fl[1]) + " " + f(fl[2]) + " rg");
      ops.push(fl && st ? (fechado ? "b" + eo : "B" + eo) : (fl ? "f" + eo : (st ? (fechado ? "s" : "S") : "n")));
      nTraco++;
    }
    /* <path d="…">: M L H V C Q A Z (maiúsculas e minúsculas); o arco vira reta até o ponto final. Várias partes (M) = um só caminho (fill-rule evenodd respeitado) */
    function caminhoD(d, g, bb) {
      var tk = txt(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, tem = false, fechou = false;
      function nx() { return parseFloat(tk[i++]); }
      function P(a, b) {
        if (bb && bb.cur) { if (a < bb.cur.x0) bb.cur.x0 = a; if (a > bb.cur.x1) bb.cur.x1 = a; if (b < bb.cur.y0) bb.cur.y0 = b; if (b > bb.cur.y1) bb.cur.y1 = b; }
        if (bb) { if (a < bb.x0) bb.x0 = a; if (a > bb.x1) bb.x1 = a; if (b < bb.y0) bb.y0 = b; if (b > bb.y1) bb.y1 = b; }
        if (xf) { var q = xf(a, b); a = q[0]; b = q[1]; }
        return f(X(a, g)) + " " + f(Y(b, g));
      }
      while (i < tk.length) {
        if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++]; else if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l";
        var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0, a, b, c1, c2, e, h;
        if (C === "Z") { ops.push("h"); x = sx; y = sy; fechou = true; continue; }
        if (C === "M") { a = nx() + ox; b = nx() + oy; if (bb && bb.subs) { bb.cur = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18 }; bb.subs.push(bb.cur); } ops.push(P(a, b) + " m"); x = sx = a; y = sy = b; tem = true; }
        else if (C === "L") { a = nx() + ox; b = nx() + oy; ops.push(P(a, b) + " l"); x = a; y = b; }
        else if (C === "H") { a = nx() + ox; ops.push(P(a, y) + " l"); x = a; }
        else if (C === "V") { b = nx() + oy; ops.push(P(x, b) + " l"); y = b; }
        else if (C === "C") { c1 = [nx() + ox, nx() + oy]; c2 = [nx() + ox, nx() + oy]; e = [nx() + ox, nx() + oy]; ops.push(P(c1[0], c1[1]) + " " + P(c2[0], c2[1]) + " " + P(e[0], e[1]) + " c"); x = e[0]; y = e[1]; }
        else if (C === "Q") { c1 = [nx() + ox, nx() + oy]; e = [nx() + ox, nx() + oy]; ops.push(P(x + 2 / 3 * (c1[0] - x), y + 2 / 3 * (c1[1] - y)) + " " + P(e[0] + 2 / 3 * (c1[0] - e[0]), e[1] + 2 / 3 * (c1[1] - e[1])) + " " + P(e[0], e[1]) + " c"); x = e[0]; y = e[1]; }
        else if (C === "A") { i += 5; a = nx() + ox; b = nx() + oy; ops.push(P(a, b) + " l"); x = a; y = b; }
        else { i++; }   /* comando desconhecido: pula o token (nunca trava) */
        h = 0;
      }
      return tem ? { fechado: fechou } : null;
    }
    function caminho(P, g, fechado) {
      if (!P.length) return false;
      if (xf) P = P.map(function (q) { return xf(q[0], q[1]); });
      ops.push(f(X(P[0][0], g)) + " " + f(Y(P[0][1], g)) + " m");
      for (var i = 1; i < P.length; i++) ops.push(f(X(P[i][0], g)) + " " + f(Y(P[i][1], g)) + " l");
      if (fechado) ops.push("h");
      return true;
    }
    /* PADRÃO (<pattern>) usado como fill="url(#id)": o PDF não leva padrão de ladrilho (isso mudaria a numeração dos objetos): o preenchimento vira o RECORTE da forma + as linhas do
       padrão repetidas no quadro girado (patternTransform rotate) — a hachura do corte da folha sai VETORIAL, igual à tela. Linhas que atravessam o ladrilho inteiro (a hachura a 45°)
       viram UMA linha comprida por coluna; as demais formas são repetidas por ladrilho (até 5000; acima disso cai no cinza claro). */
    function hachurar(pad, g, bb) {
      var w = pad.w, h = pad.h; if (!(w > 0 && h > 0) || bb.x1 < bb.x0) return false;
      var th = pad.rot * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), us = [], vs = [];
      [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]].forEach(function (q) { us.push(c * q[0] + sn * q[1]); vs.push(-sn * q[0] + c * q[1]); });
      var i0 = Math.floor(Math.min.apply(null, us) / w), i1 = Math.ceil(Math.max.apply(null, us) / w), j0 = Math.floor(Math.min.apply(null, vs) / h), j1 = Math.ceil(Math.max.apply(null, vs) / h);
      var rot = function (x, y) { return [c * x - sn * y, sn * x + c * y]; }, N = (i1 - i0 + 1) * (j1 - j0 + 1), eps = 1e-6, tiles = [];
      if (N > 400000) return false;
      pad.filhos.forEach(function (fl) {
        var a = fl.a, sc = fl.s;
        if (fl.nome === "rect" && a.fill != null && a.stroke == null && cor(a.fill)) {
          var cf = cor(a.fill, num(a["fill-opacity"], 1)); if (!cf) return;
          ops.push(f(cf[0]) + " " + f(cf[1]) + " " + f(cf[2]) + " rg " + f(X(bb.x0, g)) + " " + f(Y(bb.y1, g)) + " " + f((bb.x1 - bb.x0) * g.k * PT) + " " + f((bb.y1 - bb.y0) * g.k * PT) + " re f");
          return;
        }
        var sw = num(a["stroke-width"], 1) * sc;
        if (fl.nome === "line") {
          var x1 = num(a.x1, 0) * sc, y1 = num(a.y1, 0) * sc, x2 = num(a.x2, 0) * sc, y2 = num(a.y2, 0) * sc, la = { stroke: a.stroke, "stroke-width": String(sw), "stroke-opacity": a["stroke-opacity"], opacity: a.opacity };
          var vert = Math.abs(x1 - x2) < eps && Math.min(y1, y2) <= eps && Math.max(y1, y2) >= h - eps, hor = Math.abs(y1 - y2) < eps && Math.min(x1, x2) <= eps && Math.max(x1, x2) >= w - eps;
          if (vert) { for (var i = i0; i <= i1; i++) { var A = rot(i * w + x1, j0 * h), B = rot(i * w + x1, (j1 + 1) * h); if (caminho([A, B], g, false)) pintar(la, g, false, false); } return; }
          if (hor) { for (var j = j0; j <= j1; j++) { var A2 = rot(i0 * w, j * h + y1), B2 = rot((i1 + 1) * w, j * h + y1); if (caminho([A2, B2], g, false)) pintar(la, g, false, false); } return; }
        }
        tiles.push(fl);
      });
      if (tiles.length) {
        /* só os ladrilhos que tocam algum contorno do caminho (a caixa da planta inteira tem muito vazio): a parede fina não gera milhares de formas */
        var vivos = [], subs = bb.subs && bb.subs.length ? bb.subs : [bb];
        for (var ii = i0; ii <= i1; ii++) for (var jj = j0; jj <= j1; jj++) {
          var cs = [rot(ii * w, jj * h), rot((ii + 1) * w, jj * h), rot(ii * w, (jj + 1) * h), rot((ii + 1) * w, (jj + 1) * h)], tx0 = Math.min(cs[0][0], cs[1][0], cs[2][0], cs[3][0]), tx1 = Math.max(cs[0][0], cs[1][0], cs[2][0], cs[3][0]), ty0 = Math.min(cs[0][1], cs[1][1], cs[2][1], cs[3][1]), ty1 = Math.max(cs[0][1], cs[1][1], cs[2][1], cs[3][1]);
          if (subs.some(function (sb) { return !(sb.x1 < tx0 || sb.x0 > tx1 || sb.y1 < ty0 || sb.y0 > ty1); })) vivos.push([ii, jj]);
        }
        if (vivos.length * tiles.length > 40000) return false;
        var xfAntes = xf;
        vivos.forEach(function (vv) { var ii = vv[0], jj = vv[1]; tiles.forEach(function (fl) {
          var a = fl.a, sc = fl.s, a2 = {}; Object.keys(a).forEach(function (k2) { a2[k2] = a[k2]; }); if (a.stroke != null || a["stroke-width"] != null) a2["stroke-width"] = String(num(a["stroke-width"], 1) * sc);
          xf = function (x, y) { return rot(x * sc + ii * w, y * sc + jj * h); };
          if (fl.nome === "path" && txt(a.d).trim()) { var rp = caminhoD(a.d, g); if (rp) pintar(a2, g, rp.fechado, true); }
          else if (fl.nome === "line") { if (caminho([[num(a.x1, 0), num(a.y1, 0)], [num(a.x2, 0), num(a.y2, 0)]], g, false)) pintar(a2, g, false, false); }
          else if (fl.nome === "circle") { var ccx = num(a.cx, 0), ccy = num(a.cy, 0), crr = num(a.r, 0), cpt = []; for (var ci = 0; ci < 12; ci++) cpt.push([ccx + crr * Math.cos(ci * Math.PI / 6), ccy + crr * Math.sin(ci * Math.PI / 6)]); if (crr > 0 && caminho(cpt, g, true)) pintar(a2, g, true, true); }
          else if (fl.nome === "polygon" || fl.nome === "polyline") { if (caminho(pontos(a.points), g, fl.nome === "polygon")) pintar(a2, g, fl.nome === "polygon", true); }
          else if (fl.nome === "rect") { var rw = num(a.width, 0), rh = num(a.height, 0), rx = num(a.x, 0), ry = num(a.y, 0); if (rw > 0 && rh > 0 && caminho([[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]], g, true)) pintar(a2, g, true, true); }
        }); });
        xf = xfAntes;
      }
      return true;
    }
    while ((m = re.exec(s))) {
      if (ocPend) { emc(ocPend); ocPend = 0; }
      if (m[5] != null) { if (emTexto && !emTitulo) emTexto.t += m[5]; continue; }
      var fecha = m[1] === "/", nome = m[2].toLowerCase(), a = attrs(m[3]), auto = m[4] === "/";
      if (nome === "svg") continue;
      if (nome === "title" || nome === "desc") { emTitulo = !fecha && !auto; continue; }
      /* HIDRO-3D: <clipPath id><rect/></clipPath> + <g clip-path="url(#id)">: o recorte vira "q x y w h re W n" … "Q" (antes o <rect> do clipPath era DESENHADO como retângulo
         preto: a planta do ambiente saía com o fundo PRETO no PDF — defeito achado na prévia de 29/10/2026) */
      if (nome === "clippath") { emClip = fecha || auto ? null : (a.id || ""); continue; }
      if (emClip != null) { if (nome === "rect" && !fecha) clips[emClip] = { x: num(a.x, 0), y: num(a.y, 0), w: num(a.width, 0), h: num(a.height, 0) }; continue; }
      if (nome === "pattern") {
        if (fecha) { if (emPad && emPad.id) padroes[emPad.id] = emPad; emPad = null; }
        else { var rtp = rotate(a.patternTransform); emPad = { id: a.id || "", w: num(a.width, 0), h: num(a.height, 0), rot: rtp ? rtp.a : 0, filhos: [], sc: [1] }; if (auto) { if (emPad.id) padroes[emPad.id] = emPad; emPad = null; } }
        continue;
      }
      if (emPad) {
        if (nome === "g") { if (fecha) { if (emPad.sc.length > 1) emPad.sc.pop(); } else if (!auto) emPad.sc.push(emPad.sc[emPad.sc.length - 1] * escalaT(a.transform)); }
        else if (!fecha && /^(line|path|rect|circle|polygon|polyline)$/.test(nome)) emPad.filhos.push({ nome: nome, a: a, s: emPad.sc[emPad.sc.length - 1] });
        continue;
      }
      if (nome === "g") {
        if (fecha) { if (pilha.length > 1) { var sai = pilha.pop(); if (sai.clip) ops.push("Q"); if (sai.oc) emc(sai.oc); } }
        else if (!auto) {
          var ng = herda(a), mc = /url\(\s*#([^)\s]+)\s*\)/.exec(txt(a["clip-path"])), cl = mc ? clips[mc[1]] : null;
          if (a["data-ocg"]) { var bq = bdc(a["data-ocg"]); bq.forEach(function (o) { ops.push(o); }); ng.oc = bq.length; }
          if (cl && cl.w > 0 && cl.h > 0) { ops.push("q " + f(X(cl.x, ng)) + " " + f(Y(cl.y + cl.h, ng)) + " " + f(cl.w * ng.k * PT) + " " + f(cl.h * ng.k * PT) + " re W n"); ng.clip = true; }
          pilha.push(ng);
        }
        continue;
      }
      var g = pilha[pilha.length - 1];
      if ((g.oculto || /^none$/.test(txt(a.display))) && nome !== "text") continue;
      if (nome === "text") {
        if (!fecha) { emTexto = { a: a, g: herda(a), t: "" }; if (auto) emTexto = null; continue; }
        if (!emTexto) continue;
        if (emTexto.g.oculto || /^none$/.test(txt(emTexto.a.display))) { emTexto = null; continue; }
        var tg = emTexto.g, ta = emTexto.a, conteudo = /white-space:\s*pre/.test(txt(ta.style)) ? desEsc(emTexto.t).replace(/[\r\n\t]/g, " ") : desEsc(emTexto.t).replace(/\s+/g, " ").trim(); emTexto = null;   /* style="white-space:pre" (título espaçado do quadro de legendas, "Q U A D R O   D E …"): as palavras ficam separadas */
        if (!conteudo) continue;
        var corpo = num(tg.fs, 3) * tg.k, neg = /bold|[6-9]00/.test(txt(tg.peso)), w = largura(conteudo, corpo, neg), anc = tg.anchor || "start";
        var dx = anc === "middle" ? -w / 2 : (anc === "end" ? -w : 0), x = num(ta.x, 0) * tg.k, y = num(ta.y, 0) * tg.k, rt = rotate(ta.transform), ang = rt ? rt.a * Math.PI / 180 : 0;
        var c = Math.cos(ang), sn = Math.sin(ang), px = x + dx * c, py = y + dx * sn, gt = { tx: tg.tx, ty: tg.ty, k: 1 }, fc = cor(tg.fill != null ? tg.fill : "#000") || [0, 0, 0];
        ops.push(f(fc[0]) + " " + f(fc[1]) + " " + f(fc[2]) + " rg");
        var it = /italic|oblique/.test(txt(ta["font-style"])) ? 0.2 : 0;   /* itálico = inclinação de 0,2 na matriz do texto (sem fonte extra: a numeração dos objetos do PDF não muda) */
        ops.push("BT /" + (neg ? "F2" : "F1") + " " + f(corpo * PT) + " Tf " + f(c) + " " + f(-sn) + " " + f(sn + it * c) + " " + f(c - it * sn) + " " + f(X(px, gt)) + " " + f(Y(py, gt)) + " Tm (" + win1252(conteudo) + ") Tj ET");
        nTexto++;
        continue;
      }
      if (fecha) continue;
      if (a["data-ocg"] && nome !== "text") { var be = bdc(a["data-ocg"]); be.forEach(function (o) { ops.push(o); }); ocPend = be.length; }
      if (nome === "line") { if (caminho([[num(a.x1, 0), num(a.y1, 0)], [num(a.x2, 0), num(a.y2, 0)]], g, false)) pintar(a, g, false, false); }
      else if (nome === "path") {
        if (!/^none$/.test(txt(a.display)) && txt(a.d).trim()) {
          var mpf = /^url\(\s*#([^)\s]+)\s*\)/.exec(txt(a.fill != null ? a.fill : g.fill)), pad = mpf ? padroes[mpf[1]] : null, bb = { x0: 1e18, y0: 1e18, x1: -1e18, y1: -1e18, subs: [], cur: null };
          if (pad && pad.filhos.length) {
            var eoP = /evenodd/.test(txt(a["fill-rule"])) ? "*" : "", n0 = ops.length;
            ops.push("q"); caminhoD(a.d, g, bb); ops.push("W" + eoP + " n");
            if (hachurar(pad, g, bb)) {
              ops.push("Q"); var a2 = {}; Object.keys(a).forEach(function (k2) { a2[k2] = a[k2]; }); a2.fill = "none";
              var rp2 = caminhoD(a.d, g); if (rp2) pintar(a2, g, rp2.fechado, true);
              continue;
            }
            ops.length = n0;   /* o padrão não coube: volta ao cinza claro de sempre */
          }
          var rp = caminhoD(a.d, g); if (rp) pintar(a, g, rp.fechado, true);
        }
      }
      else if (nome === "polyline") { if (caminho(pontos(a.points), g, false)) pintar(a, g, false, true); }
      else if (nome === "polygon") { if (caminho(pontos(a.points), g, true)) pintar(a, g, true, true); }
      else if (nome === "rect") {
        var rx = num(a.x, 0), ry = num(a.y, 0), rw = num(a.width, 0), rh = num(a.height, 0);
        if (rw > 0 && rh > 0) { ops.push(f(X(rx, g)) + " " + f(Y(ry + rh, g)) + " " + f(rw * g.k * PT) + " " + f(rh * g.k * PT) + " re"); pintar(a, g, true, true); }
      } else if (nome === "circle") {
        var cx = num(a.cx, 0), cy = num(a.cy, 0), r = num(a.r, 0), k = 0.5523 * r;
        if (r > 0) {
          var P = function (xx, yy) { return f(X(xx, g)) + " " + f(Y(yy, g)); };
          ops.push(P(cx + r, cy) + " m", P(cx + r, cy + k) + " " + P(cx + k, cy + r) + " " + P(cx, cy + r) + " c", P(cx - k, cy + r) + " " + P(cx - r, cy + k) + " " + P(cx - r, cy) + " c",
                   P(cx - r, cy - k) + " " + P(cx - k, cy - r) + " " + P(cx, cy - r) + " c", P(cx + k, cy - r) + " " + P(cx + r, cy - k) + " " + P(cx + r, cy) + " c", "h");
          pintar(a, g, true, true);
        }
      } else if (nome === "image") {
        /* HIDRO-3D: <image data-im="chave" x y width height> = o raster (JPEG de info.imagensPorChave[chave]) desenhado NESTA ordem (atrás do que vem depois); sem data-im a imagem segue pulada */
        var ik = txt(a["data-im"]).replace(/[^A-Za-z0-9]/g, "");
        if (ik && num(a.width, 0) > 0 && num(a.height, 0) > 0) { ops.push("q " + f(num(a.width, 0) * g.k * PT) + " 0 0 " + f(num(a.height, 0) * g.k * PT) + " " + f(X(num(a.x, 0), g)) + " " + f(Y(num(a.y, 0) + num(a.height, 0), g)) + " cm /Im_" + ik + " Do Q"); ims[ik] = 1; } else nPulado++;
      }
    }
    if (ocPend) emc(ocPend);
    return { w: W, h: H, ocs: ocs, ops: ops, nTexto: nTexto, nTraco: nTraco, nPulado: nPulado, nSemEstilo: nSemEstilo, ims: Object.keys(ims) };
  }
  function paginas(svgs) { return (Array.isArray(svgs) ? svgs : [svgs]).map(pagina).filter(Boolean); }
  function pdf(svgs, info) {
    info = info || {};
    var pgs = paginas(svgs), objs = [];
    /* CAMADAS (OCG): info.camadas = { nomes: {id: "Nome"}, off: {id: true}, radios: [[ids]], ordem: [id | [filhos]] }. Objetos novos vão DEPOIS de tudo (a numeração dos demais não muda). */
    var cam = info.camadas || null, ocIds = [];
    pgs.forEach(function (p) { Object.keys(p.ocs || {}).forEach(function (nm) { p.ocs[nm].forEach(function (id) { if (ocIds.indexOf(id) < 0) ocIds.push(id); }); }); });
    var nPre = 5 + 2 * pgs.length + (Array.isArray(info.imagens) ? (info.imagens || []).filter(function (im) { return im && typeof im.jpeg === "string" && im.jpeg.length > 4 && num(im.pxW, 0) > 0 && num(im.pxH, 0) > 0 && pgs[num(im.pagina, 0)]; }).length : 0);
    var porChave0 = info.imagensPorChave || {}, nCh = 0, chv = [];
    pgs.forEach(function (p) { (p.ims || []).forEach(function (k) { if (porChave0[k] && (typeof porChave0[k].jpeg === "string" || typeof porChave0[k].flate === "string") && chv.indexOf(k) < 0) { chv.push(k); nCh++; } }); });
    var ocBase = nPre + nCh + 1, ocNum = {}, ocObjs = [];
    if (ocIds.length) {
      ocIds.forEach(function (id, i) { ocNum[id] = ocBase + i; ocObjs.push("<< /Type /OCG /Name (" + win1252(txt(cam && cam.nomes && cam.nomes[id] || id)) + ") /Intent /View >>"); });
    }
    var ref = function (id) { return ocNum[id] + " 0 R"; };
    var ordemT = function (L) { return (L || []).map(function (q) { return Array.isArray(q) ? "[" + ordemT(q) + "]" : (ocNum[q] && ocIds.indexOf(q) >= 0 ? ref(q) : ""); }).filter(function (q) { return q && q !== "[]"; }).join(" "); };
    var cat = "<< /Type /Catalog /Pages 2 0 R";
    if (ocIds.length) {
      var off = ocIds.filter(function (id) { return cam && cam.off && cam.off[id]; }).map(ref).join(" "), rbs = ((cam && cam.radios) || []).map(function (g2) { return g2.filter(function (id) { return ocIds.indexOf(id) >= 0; }); }).filter(function (g2) { return g2.length > 1; });
      cat += " /PageMode /UseOC /OCProperties << /OCGs [" + ocIds.map(ref).join(" ") + "] /D << /Name (Camadas) /BaseState /ON" + (off ? " /OFF [" + off + "]" : "") +
        " /Order [" + ordemT((cam && cam.ordem) || ocIds) + "]" + (rbs.length ? " /RBGroups [" + rbs.map(function (g2) { return "[" + g2.map(ref).join(" ") + "]"; }).join(" ") + "]" : "") + " /ListMode /AllPages >> >>";
    }
    objs.push(cat + " >>");
    objs.push("<< /Type /Pages /Kids [" + pgs.map(function (p, i) { return (6 + 2 * i) + " 0 R"; }).join(" ") + "] /Count " + pgs.length + " >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Title (" + win1252(txt(info.titulo || "Desenho")) + ") /Producer (OrcaPRO) /Creator (OrcaPRO Modela) >>");
    /* IMAGENS (opcional, js/marmproposta.js: o logo da empresa na proposta): info.imagens = [{ pagina, x, y, w, h (mm,
       origem no canto de cima como no SVG), jpeg (texto binário 0–255 de um JPEG), pxW, pxH }]. Só JPEG (DCTDecode: o
       PDF lê o arquivo como está, sem decodificar nada aqui). Sem `imagens` o PDF sai byte a byte como antes. */
    var imgs = (Array.isArray(info.imagens) ? info.imagens : []).filter(function (im) { return im && typeof im.jpeg === "string" && im.jpeg.length > 4 && num(im.pxW, 0) > 0 && num(im.pxH, 0) > 0 && pgs[num(im.pagina, 0)]; });
    var baseImg = 6 + 2 * pgs.length, porChave = info.imagensPorChave || {}, chavesUsadas = [];
    pgs.forEach(function (p) { (p.ims || []).forEach(function (k) { if (porChave[k] && (typeof porChave[k].jpeg === "string" || typeof porChave[k].flate === "string") && chavesUsadas.indexOf(k) < 0) chavesUsadas.push(k); }); });
    var baseCh = baseImg + imgs.length;
    pgs.forEach(function (p, i) {
      var cont = p.ops.join("\n"), xo = [];
      imgs.forEach(function (im, k) {
        if (num(im.pagina, 0) !== i) return;
        xo.push("/Im" + k + " " + (baseImg + k) + " 0 R");
        cont += "\nq " + f(num(im.w, 10) * PT) + " 0 0 " + f(num(im.h, 10) * PT) + " " + f(num(im.x, 0) * PT) + " " + f((p.h - num(im.y, 0) - num(im.h, 10)) * PT) + " cm /Im" + k + " Do Q";
      });
      (p.ims || []).forEach(function (kc) { var ix = chavesUsadas.indexOf(kc); if (ix >= 0) xo.push("/Im_" + kc + " " + (baseCh + ix) + " 0 R"); });
      var prop = Object.keys(p.ocs || {}).map(function (nm) { return "/" + nm + " " + ocNum[p.ocs[nm].join("+")] + " 0 R"; });
      objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + f(p.w * PT) + " " + f(p.h * PT) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>" + (xo.length ? " /XObject << " + xo.join(" ") + " >>" : "") + (prop.length ? " /Properties << " + prop.join(" ") + " >>" : "") + " >> /Contents " + (7 + 2 * i) + " 0 R >>");
      objs.push("<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream");
    });
    imgs.forEach(function (im) {
      objs.push("<< /Type /XObject /Subtype /Image /Width " + Math.round(num(im.pxW, 1)) + " /Height " + Math.round(num(im.pxH, 1)) + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.jpeg.length + " >>\nstream\n" + im.jpeg + "\nendstream");
    });
    /* por chave: JPEG (DCTDecode) ou RGB 8 bits deflate (FlateDecode, SEM perda — a vista 3D e o logo da folha) */
    chavesUsadas.forEach(function (k) { var im = porChave[k], ehF = typeof im.flate === "string", dado = ehF ? im.flate : im.jpeg; objs.push("<< /Type /XObject /Subtype /Image /Width " + Math.round(num(im.pxW, 1)) + " /Height " + Math.round(num(im.pxH, 1)) + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /" + (ehF ? "FlateDecode" : "DCTDecode") + " /Length " + dado.length + " >>\nstream\n" + dado + "\nendstream"); });
    ocObjs.forEach(function (o) { objs.push(o); });
    var s = (ocIds.length ? "%PDF-1.5" : "%PDF-1.4") + "\n%\xe2\xe3\xcf\xd3\n", offs = [];
    objs.forEach(function (o, i) { offs.push(s.length); s += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
    var xref = s.length;
    s += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offs.forEach(function (o) { s += ("0000000000" + o).slice(-10) + " 00000 n \n"; });
    s += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R /Info 5 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }
  /* leitura mínima (testes): páginas, tamanhos (mm) e textos */
  function ler(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var pags = (s.match(/\/Type \/Page\b(?!s)/g) || []).length, textos = [], tam = [], corpos = [];
    s.replace(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g, function (_, w, h) { tam.push([Math.round(+w / PT), Math.round(+h / PT)]); return _; });
    s.replace(/\/F[12] ([\d.]+) Tf[^(]*\(((?:\\.|[^\\)])*)\) Tj/g, function (_, c, t) { corpos.push(+c / PT); textos.push(t.replace(/\\(.)/g, "$1")); return _; });
    var xr = /startxref\n(\d+)\n%%EOF\s*$/.exec(s), xrOk = !!xr && s.substr(+xr[1], 4) === "xref";
    var imagens = (s.match(/\/Subtype \/Image\b/g) || []).length;
    return { ok: /^%PDF-1\.\d/.test(s) && xrOk, paginas: pags, tamanhos: tam, textos: textos, corpos: corpos, imagens: imagens, camadas: (s.match(/\/Type \/OCG\b/g) || []).length };
  }

  var SvgPdf = { pagina: pagina, paginas: paginas, pdf: pdf, ler: ler, largura: largura, PT: PT };
  global.SvgPdf = SvgPdf;
  if (typeof module !== "undefined" && module.exports) module.exports = SvgPdf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

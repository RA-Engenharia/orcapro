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
 * qualquer leitor. Não é um conversor de SVG genérico (path, gradiente,
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
  function cor(v) {
    var s = txt(v).trim().toLowerCase(); if (!s || s === "none" || s === "transparent") return null;
    if (NOMES[s]) s = NOMES[s];
    var m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s); if (m) s = "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s); if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  function attrs(s) { var o = {}, re = /([\w:-]+)\s*=\s*"([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = desEsc(m[2]); return o; }
  function pontos(s) { var v = txt(s).trim().split(/[\s,]+/).map(Number), o = []; for (var i = 0; i + 1 < v.length; i += 2) o.push([v[i], v[i + 1]]); return o; }
  function translate(t) { var m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(txt(t)); return m ? [+m[1], +m[2]] : [0, 0]; }
  function rotate(t) { var m = /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(txt(t)); return m ? { a: +m[1], cx: m[2] != null ? +m[2] : null, cy: m[3] != null ? +m[3] : null } : null; }

  /* UMA folha SVG → { w, h, ops } (ops do conteúdo da página) */
  function pagina(svg) {
    var s = txt(svg), raiz = /<svg\b([^>]*)>/.exec(s); if (!raiz) return null;
    var ra = attrs(raiz[1]), vb = txt(ra.viewBox).split(/[\s,]+/).map(Number), W = vb.length === 4 ? vb[2] : num(ra.width, 210), H = vb.length === 4 ? vb[3] : num(ra.height, 297);
    var ops = ["1 J 1 j"], pilha = [{ tx: 0, ty: 0, fill: null, stroke: null, sw: null, fs: null, anchor: null, peso: null }], re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>|([^<]+)/g, m, emTexto = null, emTitulo = false;
    var nTexto = 0, nTraco = 0, nPulado = 0;
    function X(x, g) { return (x + g.tx) * PT; }
    function Y(y, g) { return (H - (y + g.ty)) * PT; }
    function herda(a) {
      var g = pilha[pilha.length - 1], n = { tx: g.tx, ty: g.ty, fill: g.fill, stroke: g.stroke, sw: g.sw, fs: g.fs, anchor: g.anchor, peso: g.peso };
      var t = translate(a.transform); n.tx += t[0]; n.ty += t[1];
      if (a.fill != null) n.fill = a.fill; if (a.stroke != null) n.stroke = a.stroke; if (a["stroke-width"] != null) n.sw = a["stroke-width"];
      if (a["font-size"] != null) n.fs = a["font-size"]; if (a["text-anchor"] != null) n.anchor = a["text-anchor"]; if (a["font-weight"] != null) n.peso = a["font-weight"];
      return n;
    }
    function pintar(a, g, fechado, ehForma) {
      var fl = cor(a.fill != null ? a.fill : (g.fill != null ? g.fill : (ehForma ? "#000" : "none"))), st = cor(a.stroke != null ? a.stroke : g.stroke);
      var sw = num(a["stroke-width"] != null ? a["stroke-width"] : g.sw, 0.25);
      if (st) { ops.push(f(st[0]) + " " + f(st[1]) + " " + f(st[2]) + " RG", f(Math.max(0.05, sw) * PT) + " w"); var da = txt(a["stroke-dasharray"]).trim(); ops.push(da && da !== "none" ? "[" + da.split(/[\s,]+/).map(function (v) { return f(num(v, 1) * PT); }).join(" ") + "] 0 d" : "[] 0 d"); }
      if (fl) ops.push(f(fl[0]) + " " + f(fl[1]) + " " + f(fl[2]) + " rg");
      ops.push(fl && st ? (fechado ? "b" : "B") : (fl ? "f" : (st ? (fechado ? "s" : "S") : "n")));
      nTraco++;
    }
    function caminho(P, g, fechado) {
      if (!P.length) return false;
      ops.push(f(X(P[0][0], g)) + " " + f(Y(P[0][1], g)) + " m");
      for (var i = 1; i < P.length; i++) ops.push(f(X(P[i][0], g)) + " " + f(Y(P[i][1], g)) + " l");
      if (fechado) ops.push("h");
      return true;
    }
    while ((m = re.exec(s))) {
      if (m[5] != null) { if (emTexto && !emTitulo) emTexto.t += m[5]; continue; }
      var fecha = m[1] === "/", nome = m[2].toLowerCase(), a = attrs(m[3]), auto = m[4] === "/";
      if (nome === "svg") continue;
      if (nome === "title" || nome === "desc") { emTitulo = !fecha && !auto; continue; }
      if (nome === "g") { if (fecha) { if (pilha.length > 1) pilha.pop(); } else if (!auto) pilha.push(herda(a)); continue; }
      var g = pilha[pilha.length - 1];
      if (nome === "text") {
        if (!fecha) { emTexto = { a: a, g: herda(a), t: "" }; if (auto) emTexto = null; continue; }
        if (!emTexto) continue;
        var tg = emTexto.g, ta = emTexto.a, conteudo = /white-space:\s*pre/.test(txt(ta.style)) ? desEsc(emTexto.t).replace(/[\r\n\t]/g, " ") : desEsc(emTexto.t).replace(/\s+/g, " ").trim(); emTexto = null;   /* style="white-space:pre" (título espaçado do quadro de legendas, "Q U A D R O   D E …"): as palavras ficam separadas */
        if (!conteudo) continue;
        var corpo = num(tg.fs, 3), neg = /bold|[6-9]00/.test(txt(tg.peso)), w = largura(conteudo, corpo, neg), anc = tg.anchor || "start";
        var dx = anc === "middle" ? -w / 2 : (anc === "end" ? -w : 0), x = num(ta.x, 0), y = num(ta.y, 0), rt = rotate(ta.transform), ang = rt ? rt.a * Math.PI / 180 : 0;
        var c = Math.cos(ang), sn = Math.sin(ang), px = x + dx * c, py = y + dx * sn, fc = cor(tg.fill != null ? tg.fill : "#000") || [0, 0, 0];
        ops.push(f(fc[0]) + " " + f(fc[1]) + " " + f(fc[2]) + " rg");
        ops.push("BT /" + (neg ? "F2" : "F1") + " " + f(corpo * PT) + " Tf " + f(c) + " " + f(-sn) + " " + f(sn) + " " + f(c) + " " + f(X(px, g)) + " " + f(Y(py, g)) + " Tm (" + win1252(conteudo) + ") Tj ET");
        nTexto++;
        continue;
      }
      if (fecha) continue;
      if (nome === "line") { if (caminho([[num(a.x1, 0), num(a.y1, 0)], [num(a.x2, 0), num(a.y2, 0)]], g, false)) pintar(a, g, false, false); }
      else if (nome === "polyline") { if (caminho(pontos(a.points), g, false)) pintar(a, g, false, true); }
      else if (nome === "polygon") { if (caminho(pontos(a.points), g, true)) pintar(a, g, true, true); }
      else if (nome === "rect") {
        var rx = num(a.x, 0), ry = num(a.y, 0), rw = num(a.width, 0), rh = num(a.height, 0);
        if (rw > 0 && rh > 0) { ops.push(f(X(rx, g)) + " " + f(Y(ry + rh, g)) + " " + f(rw * PT) + " " + f(rh * PT) + " re"); pintar(a, g, true, true); }
      } else if (nome === "circle") {
        var cx = num(a.cx, 0), cy = num(a.cy, 0), r = num(a.r, 0), k = 0.5523 * r;
        if (r > 0) {
          var P = function (xx, yy) { return f(X(xx, g)) + " " + f(Y(yy, g)); };
          ops.push(P(cx + r, cy) + " m", P(cx + r, cy + k) + " " + P(cx + k, cy + r) + " " + P(cx, cy + r) + " c", P(cx - k, cy + r) + " " + P(cx - r, cy + k) + " " + P(cx - r, cy) + " c",
                   P(cx - r, cy - k) + " " + P(cx - k, cy - r) + " " + P(cx, cy - r) + " c", P(cx + k, cy - r) + " " + P(cx + r, cy - k) + " " + P(cx + r, cy) + " c", "h");
          pintar(a, g, true, true);
        }
      } else if (nome === "image") nPulado++;
    }
    return { w: W, h: H, ops: ops, nTexto: nTexto, nTraco: nTraco, nPulado: nPulado };
  }
  function paginas(svgs) { return (Array.isArray(svgs) ? svgs : [svgs]).map(pagina).filter(Boolean); }
  function pdf(svgs, info) {
    info = info || {};
    var pgs = paginas(svgs), objs = [];
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push("<< /Type /Pages /Kids [" + pgs.map(function (p, i) { return (6 + 2 * i) + " 0 R"; }).join(" ") + "] /Count " + pgs.length + " >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Title (" + win1252(txt(info.titulo || "Desenho")) + ") /Producer (OrcaPRO) /Creator (OrcaPRO Modela) >>");
    /* IMAGENS (opcional, js/marmproposta.js: o logo da empresa na proposta): info.imagens = [{ pagina, x, y, w, h (mm,
       origem no canto de cima como no SVG), jpeg (texto binário 0–255 de um JPEG), pxW, pxH }]. Só JPEG (DCTDecode: o
       PDF lê o arquivo como está, sem decodificar nada aqui). Sem `imagens` o PDF sai byte a byte como antes. */
    var imgs = (Array.isArray(info.imagens) ? info.imagens : []).filter(function (im) { return im && typeof im.jpeg === "string" && im.jpeg.length > 4 && num(im.pxW, 0) > 0 && num(im.pxH, 0) > 0 && pgs[num(im.pagina, 0)]; });
    var baseImg = 6 + 2 * pgs.length;
    pgs.forEach(function (p, i) {
      var cont = p.ops.join("\n"), xo = [];
      imgs.forEach(function (im, k) {
        if (num(im.pagina, 0) !== i) return;
        xo.push("/Im" + k + " " + (baseImg + k) + " 0 R");
        cont += "\nq " + f(num(im.w, 10) * PT) + " 0 0 " + f(num(im.h, 10) * PT) + " " + f(num(im.x, 0) * PT) + " " + f((p.h - num(im.y, 0) - num(im.h, 10)) * PT) + " cm /Im" + k + " Do Q";
      });
      objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + f(p.w * PT) + " " + f(p.h * PT) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>" + (xo.length ? " /XObject << " + xo.join(" ") + " >>" : "") + " >> /Contents " + (7 + 2 * i) + " 0 R >>");
      objs.push("<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream");
    });
    imgs.forEach(function (im) {
      objs.push("<< /Type /XObject /Subtype /Image /Width " + Math.round(num(im.pxW, 1)) + " /Height " + Math.round(num(im.pxH, 1)) + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.jpeg.length + " >>\nstream\n" + im.jpeg + "\nendstream");
    });
    var s = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", offs = [];
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
    return { ok: /^%PDF-1\.\d/.test(s) && xrOk, paginas: pags, tamanhos: tam, textos: textos, corpos: corpos, imagens: imagens };
  }

  var SvgPdf = { pagina: pagina, paginas: paginas, pdf: pdf, ler: ler, largura: largura, PT: PT };
  global.SvgPdf = SvgPdf;
  if (typeof module !== "undefined" && module.exports) module.exports = SvgPdf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

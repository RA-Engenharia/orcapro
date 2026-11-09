/* =====================================================================
 * js/pdfdireto.js — ESCRITOR DE PDF DIRETO (sem diálogo de impressão, sem dependência)
 *
 * ⚠ POR QUE ISTO EXISTE. A proposta de licitação ia para o PDF pelo "Imprimir / Salvar PDF" do navegador. Numa máquina com a
 *   impressora "Microsoft Print to PDF" o resultado era: 70 folhas 842x595 com o A4 em pé GIRADO 90 graus, nenhum texto
 *   selecionável (tudo em curvas) e 23 MB. Isso é do driver, e CSS não resolve. Aqui o PDF é escrito pelo próprio sistema, a
 *   partir das folhas já paginadas (.ld-pg): A4 em pé, texto de verdade, imagens do timbrado reaproveitadas uma vez só.
 *
 * COMO FUNCIONA (duas metades, de propósito separadas):
 *   1) coletarOps(pgEl)  — única parte que usa o DOM. Anda pelos elementos da folha e devolve uma lista de operações em px
 *      relativas ao canto da folha: retângulo de fundo, linha de borda, imagem, palavra, clip. O texto sai PALAVRA POR PALAVRA
 *      com o x que o navegador mediu (Range.getClientRects), para o justificado sair igual ao da tela.
 *   2) Escritor + renderizar(ops) — puro: transforma operações em PDF (Helvetica Base-14, WinAnsi, JPEG DCT, deflate quando o
 *      navegador tem CompressionStream). Testável em Node sem navegador (tools/test-pdfdireto.js).
 *
 * Fonte: Helvetica / -Bold / -Oblique / -BoldOblique (métrica igual à da Arial usada no CSS). Caractere fora de cp1252 vira
 * equivalente (ou "?"), nunca derruba. Imagem JPEG vai direto (DCTDecode); as demais passam por canvas sobre branco -> JPEG 0,92
 * (as folhas são brancas, então compor sobre branco é exato).
 * ===================================================================== */
(function (global) {
  "use strict";

  var PT = 0.75;                    // px -> pt
  var PAG_W = 595.276, PAG_H = 841.89;   // A4 em pé

  /* ------------------------------ codificação cp1252 ------------------------------ */
  var WIN = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139,
    338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154,
    8250: 155, 339: 156, 382: 158, 376: 159 };
  var TROCA = { 8722: "-", 8208: "-", 8209: "-", 8210: "-", 8213: "-", 8805: ">=", 8804: "<=", 8594: "->", 8592: "<-", 9888: "!",
    10003: "v", 10004: "v", 10005: "x", 10006: "x", 10007: "x", 8470: "No", 13217: "m2", 8201: " ", 8194: " ", 8195: " ", 8239: " ",
    8202: " ", 8203: "", 65279: "", 8206: "", 8207: "", 8729: "*", 9679: "*", 9642: "-", 8321: "1", 8322: "2", 8323: "3",
    8709: "Ø", 966: "Ø", 981: "Ø", 8539: "1/8", 8540: "3/8", 8541: "5/8", 8542: "7/8", 8532: "1/3", 8533: "1/5", 8776: "~", 956: "µ", 916: "Delta", 937: "Ohm", 8486: "Ohm", 8800: "<>", 177: "±", 8734: "inf" };
  /* devolve uma string em que cada caractere é um BYTE cp1252 */
  function codificar(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) { try { s = s.normalize("NFC"); } catch (eN) {} }   // texto decomposto (C + cedilha combinante) vira o caractere inteiro
    var o = "", i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) { i++; o += "?"; continue; }
      if (c === 173) continue;   // hífen condicional: não é para aparecer
      if (c < 32 || c === 127) o += " ";
      else if (c < 127 || (c >= 160 && c <= 255)) o += String.fromCharCode(c);
      else if (WIN[c]) o += String.fromCharCode(WIN[c]);
      else if (TROCA[c] !== undefined) o += TROCA[c];
      else o += "?";
    }
    return o;
  }
  /* string PDF literal a partir de bytes-em-string (escapa \ ( ) e tudo fora de ASCII imprimível) */
  function lit(b) {
    var o = "(", i, c;
    for (i = 0; i < b.length; i++) {
      c = b.charCodeAt(i);
      if (c === 92 || c === 40 || c === 41) o += "\\" + b.charAt(i);
      else if (c < 32 || c > 126) o += "\\" + ("00" + c.toString(8)).slice(-3);
      else o += b.charAt(i);
    }
    return o + ")";
  }
  /* texto de metadado: ASCII puro em (), senão UTF-16BE em hexadecimal */
  function textoPdf(s) {
    s = String(s == null ? "" : s);
    if (/^[\x20-\x7e]*$/.test(s)) return lit(s);
    var h = "FEFF", i;
    for (i = 0; i < s.length; i++) h += ("0000" + s.charCodeAt(i).toString(16)).slice(-4).toUpperCase();
    return "<" + h + ">";
  }
  function N(v) { var r = Math.round(v * 100) / 100; return String(r === 0 ? 0 : r); }
  function bytesDe(str) {
    var u = new Uint8Array(str.length), i;
    for (i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255;
    return u;
  }

  async function deflate(u8) {
    if (typeof CompressionStream === "undefined" || typeof Response === "undefined") return null;
    try {
      var cs = new CompressionStream("deflate"), w = cs.writable.getWriter();
      w.write(u8); w.close();
      return new Uint8Array(await new Response(cs.readable).arrayBuffer());
    } catch (e) { return null; }
  }

  /* ------------------------------ JPEG: dimensões e componentes ------------------------------ */
  function dadosDeUrl(url) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(String(url));
    if (!m) return null;
    var bin;
    try { bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); } catch (e) { return null; }
    return { tipo: m[1].toLowerCase(), bytes: bytesDe(bin) };
  }
  function infoJpeg(u) {
    if (u.length < 4 || u[0] !== 0xFF || u[1] !== 0xD8) return null;
    var p = 2;
    while (p + 9 < u.length) {
      if (u[p] !== 0xFF) { p++; continue; }
      var mk = u[p + 1];
      if (mk === 0xFF) { p++; continue; }
      if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01) { p += 2; continue; }
      var len = (u[p + 2] << 8) | u[p + 3];
      if ((mk >= 0xC0 && mk <= 0xCF) && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC)
        return { h: (u[p + 5] << 8) | u[p + 6], w: (u[p + 7] << 8) | u[p + 8], comps: u[p + 9], prog: mk === 0xC2 };
      p += 2 + len;
    }
    return null;
  }

  /* ------------------------------ o escritor ------------------------------ */
  var FONTES = [["F1", "Helvetica"], ["F2", "Helvetica-Bold"], ["F3", "Helvetica-Oblique"], ["F4", "Helvetica-BoldOblique"]];
  function nomeFonte(neg, ita) { return neg ? (ita ? "F4" : "F2") : (ita ? "F3" : "F1"); }

  function Escritor(opc) {
    this.opc = opc || {};
    this.objs = [];               // objs[i] = { dict, dados }  (número = i + 1)
    this.paginas = [];            // números dos objetos /Page
    this.imgs = {};               // url -> { nome, num, w, h }
    this.nImg = 0;
    this.gss = {};                // alpha -> nome
    this.nGs = 0;
    this.comprimiu = false;
  }
  Escritor.prototype._obj = function (dict, dados) { this.objs.push({ dict: dict, dados: dados || null }); return this.objs.length; };
  Escritor.prototype.gs = function (alpha) {
    var k = N(alpha * 1000) + "";
    if (!this.gss[k]) { this.nGs++; this.gss[k] = { nome: "GS" + this.nGs, a: Math.max(0, Math.min(1, alpha)) }; }
    return this.gss[k].nome;
  };
  /* registra uma imagem (uma só vez por url). Devolve { nome, w, h } ou null se não deu para ler. */
  Escritor.prototype.imagem = async function (url, ctx) {
    if (this.imgs[url]) return this.imgs[url];
    var d = dadosDeUrl(url), jpg = null, info = null, w, h, cs = "/DeviceRGB";
    if (d && (d.tipo === "image/jpeg" || d.tipo === "image/jpg")) {
      info = infoJpeg(d.bytes);
      if (info && (info.comps === 3 || info.comps === 1)) { jpg = d.bytes; w = info.w; h = info.h; cs = info.comps === 1 ? "/DeviceGray" : "/DeviceRGB"; }
    }
    if (!jpg) {
      var c = await rasterizar(url, this.opc.maxLargura || 2000, ctx);
      if (!c) return null;
      jpg = c.bytes; w = c.w; h = c.h; cs = "/DeviceRGB";
    }
    this.nImg++;
    var num = this._obj("/Type/XObject/Subtype/Image/Width " + w + "/Height " + h + "/ColorSpace" + cs + "/BitsPerComponent 8/Filter/DCTDecode", jpg);
    this.imgs[url] = { nome: "Im" + this.nImg, num: num, w: w, h: h };
    return this.imgs[url];
  };
  Escritor.prototype.pagina = async function (conteudo) {
    var b = bytesDe(conteudo), dict = "", dados = b;
    if (b.length > 300) {
      var z = await deflate(b);
      if (z && z.length < b.length) { dados = z; dict = "/Filter/FlateDecode"; this.comprimiu = true; }
    }
    var c = this._obj(dict, dados);
    var pg = this._obj("/Type/Page/Parent 2 0 R/MediaBox[0 0 " + N(PAG_W) + " " + N(PAG_H) + "]/Rotate 0/Contents " + c + " 0 R/Resources 3 0 R");
    this.paginas.push(pg);
    return this.paginas.length;
  };
  /* monta o arquivo. Números fixos: 1 catálogo, 2 páginas, 3 recursos, 4 informações, 5-8 fontes; o resto vem depois. */
  Escritor.prototype.fechar = function () {
    var self = this, resto = this.objs, i;
    var obj = [];
    var kids = this.paginas.map(function (n) { return (n + 8) + " 0 R"; }).join(" ");
    obj.push({ dict: "/Type/Catalog/Pages 2 0 R" });
    obj.push({ dict: "/Type/Pages/Kids[" + kids + "]/Count " + this.paginas.length });
    var xo = "", gsd = "";
    Object.keys(this.imgs).forEach(function (u) { var m = self.imgs[u]; xo += "/" + m.nome + " " + (m.num + 8) + " 0 R"; });
    Object.keys(this.gss).forEach(function (k) { var g = self.gss[k]; gsd += "/" + g.nome + "<</Type/ExtGState/ca " + N(g.a * 1000) / 1000 + "/CA " + N(g.a * 1000) / 1000 + ">>"; });
    var fd = FONTES.map(function (f, ix) { return "/" + f[0] + " " + (5 + ix) + " 0 R"; }).join("");
    obj.push({ dict: "/ProcSet[/PDF/Text/ImageC/ImageB]/Font<<" + fd + ">>" + (xo ? "/XObject<<" + xo + ">>" : "") + (gsd ? "/ExtGState<<" + gsd + ">>" : "") });
    var dt = new Date(), p2 = function (v) { return ("0" + v).slice(-2); };
    var data = "D:" + dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate()) + p2(dt.getHours()) + p2(dt.getMinutes()) + p2(dt.getSeconds());
    obj.push({ dict: "/Title " + textoPdf(this.opc.titulo || "Proposta") + "/Producer " + textoPdf(this.opc.produtor || "OrçaPRO") +
      "/Creator " + textoPdf(this.opc.produtor || "OrçaPRO") + "/CreationDate " + lit(data) });
    FONTES.forEach(function (f) { obj.push({ dict: "/Type/Font/Subtype/Type1/BaseFont/" + f[1] + "/Encoding/WinAnsiEncoding" }); });
    /* os objetos acumulados (imagens, conteúdo, páginas) já foram numerados a partir de 1: deslocam 8 e as referências internas também */
    for (i = 0; i < resto.length; i++) {
      var o = resto[i], d = o.dict;
      if (/\/Contents (\d+) 0 R/.test(d)) d = d.replace(/\/Contents (\d+) 0 R/, function (m, n) { return "/Contents " + (Number(n) + 8) + " 0 R"; });
      obj.push({ dict: d, dados: o.dados });
    }
    var partes = [], pos = 0, offs = [];
    function pu(x) { var u = typeof x === "string" ? bytesDe(x) : x; partes.push(u); pos += u.length; }
    pu("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    for (i = 0; i < obj.length; i++) {
      offs.push(pos);
      var ob = obj[i];
      if (ob.dados) {
        pu((i + 1) + " 0 obj\n<<" + ob.dict + "/Length " + ob.dados.length + ">>\nstream\n"); pu(ob.dados); pu("\nendstream\nendobj\n");
      } else pu((i + 1) + " 0 obj\n<<" + ob.dict + ">>\nendobj\n");
    }
    var xr = pos;
    var x = "xref\n0 " + (obj.length + 1) + "\n0000000000 65535 f \n";
    offs.forEach(function (of) { x += ("0000000000" + of).slice(-10) + " 00000 n \n"; });
    pu(x + "trailer\n<</Size " + (obj.length + 1) + "/Root 1 0 R/Info 4 0 R>>\nstartxref\n" + xr + "\n%%EOF\n");
    return { partes: partes, tamanho: pos };
  };
  Escritor.prototype.blob = function () {
    var r = this.fechar();
    return new Blob(r.partes, { type: "application/pdf" });
  };
  Escritor.prototype.bytes = function () {
    var r = this.fechar(), u = new Uint8Array(r.tamanho), p = 0;
    r.partes.forEach(function (b) { u.set(b, p); p += b.length; });
    return u;
  };

  /* imagem que não é JPEG: canvas sobre branco -> JPEG 0,92 (só no navegador) */
  async function rasterizar(url, maxL, ctx) {
    if (typeof document === "undefined" || typeof Image === "undefined") return null;
    try {
      var im = new Image();
      im.src = url;
      if (im.decode) await im.decode(); else await new Promise(function (ok, no) { im.onload = ok; im.onerror = no; });
      var w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) return null;
      var k = w > maxL ? maxL / w : 1, cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      var g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, cw, ch);
      g.drawImage(im, 0, 0, cw, ch);
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/jpeg", 0.92); });
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch };
    } catch (e) { return null; }
  }

  /* ------------------------------ operações -> conteúdo da página ------------------------------
   * ops em px relativos ao canto superior esquerdo da folha (origem no topo). Tipos:
   *   {t:"rect", x,y,w,h, c:[r,g,b], a}
   *   {t:"txt", s, x, y(baseline), fs(px), f:"F1".."F4", c:[r,g,b], a}
   *   {t:"img", url, x,y,w,h, tam, pos, fit, a}        tam/pos = background-size/position computados; fit = object-fit do <img>
   *   {t:"q", x,y,w,h}   clip retangular      {t:"Q"}
   */
  function posPct(v, livre) {
    v = String(v || "50%");
    if (/%$/.test(v)) return livre * parseFloat(v) / 100;
    var n = parseFloat(v); return isFinite(n) ? n : livre / 2;
  }
  function tamImagem(op, iw, ih) {
    var bw = op.w, bh = op.h, w = iw, h = ih, t = String(op.tam || "auto").trim();
    if (op.fit) {                              // <img>
      if (op.fit === "contain" || op.fit === "scale-down") { var k = Math.min(bw / iw, bh / ih); w = iw * k; h = ih * k; }
      else if (op.fit === "cover") { var k2 = Math.max(bw / iw, bh / ih); w = iw * k2; h = ih * k2; }
      else { w = bw; h = bh; }
      return { w: w, h: h, x: (bw - w) / 2, y: (bh - h) / 2 };
    }
    if (t === "contain") { var c1 = Math.min(bw / iw, bh / ih); w = iw * c1; h = ih * c1; }
    else if (t === "cover") { var c2 = Math.max(bw / iw, bh / ih); w = iw * c2; h = ih * c2; }
    else if (t !== "auto" && t !== "auto auto") {
      var p = t.split(/\s+/), a = p[0], b = p[1] || "auto";
      var ww = a === "auto" ? null : (/%$/.test(a) ? bw * parseFloat(a) / 100 : parseFloat(a));
      var hh = b === "auto" ? null : (/%$/.test(b) ? bh * parseFloat(b) / 100 : parseFloat(b));
      if (ww === null && hh === null) { w = iw; h = ih; }
      else if (ww === null) { h = hh; w = iw * hh / ih; }
      else if (hh === null) { w = ww; h = ih * ww / iw; }
      else { w = ww; h = hh; }
    }
    var ps = String(op.pos || "50% 50%").trim().split(/\s+/);
    return { w: w, h: h, x: posPct(ps[0], bw - w), y: posPct(ps[1] || "50%", bh - h) };
  }

  /* gera o conteúdo (string latin1) de uma página. `esc` fornece gs(); `imgs` = { url: {nome,w,h} } já registradas. */
  function renderizar(ops, esc, imgs) {
    var o = [], emTexto = false, fonte = "", cor = "", alfa = null, i;
    function fim() { if (emTexto) { o.push("ET"); emTexto = false; } }
    function setCor(c) { var k = N(c[0] * 1000) / 1000 + " " + N(c[1] * 1000) / 1000 + " " + N(c[2] * 1000) / 1000; if (k !== cor) { o.push(k + " rg"); cor = k; } }
    function setAlfa(a) { a = a === undefined ? 1 : a; if (a !== alfa) { o.push("/" + esc.gs(a) + " gs"); alfa = a; } }
    function Y(y, h) { return PAG_H - (y + (h || 0)) * PT; }
    for (i = 0; i < ops.length; i++) {
      var p = ops[i];
      if (p.t === "q") { fim(); o.push("q " + N(p.x * PT) + " " + N(Y(p.y, p.h)) + " " + N(p.w * PT) + " " + N(p.h * PT) + " re W n"); fonte = ""; cor = ""; alfa = null; }
      else if (p.t === "Q") { fim(); o.push("Q"); fonte = ""; cor = ""; alfa = null; }
      else if (p.t === "rect") {
        if (p.w <= 0 || p.h <= 0) continue;
        fim(); setAlfa(p.a); setCor(p.c);
        o.push(N(p.x * PT) + " " + N(Y(p.y, p.h)) + " " + N(p.w * PT) + " " + N(p.h * PT) + " re f");
      } else if (p.t === "img") {
        var im = imgs[p.url]; if (!im) continue;
        var g = tamImagem(p, im.w, im.h);
        if (g.w <= 0 || g.h <= 0) continue;
        fim(); setAlfa(p.a);
        o.push("q " + N(p.x * PT) + " " + N(Y(p.y, p.h)) + " " + N(p.w * PT) + " " + N(p.h * PT) + " re W n " +
          N(g.w * PT) + " 0 0 " + N(g.h * PT) + " " + N((p.x + g.x) * PT) + " " + N(Y(p.y + g.y, g.h)) + " cm /" + im.nome + " Do Q");
      } else if (p.t === "txt") {
        if (!emTexto) { o.push("BT"); emTexto = true; }
        setAlfa(p.a); setCor(p.c);
        var fk = p.f + " " + N(p.fs * PT);
        if (fk !== fonte) { o.push("/" + p.f + " " + N(p.fs * PT) + " Tf"); fonte = fk; }
        o.push("1 0 0 1 " + N(p.x * PT) + " " + N(PAG_H - p.y * PT) + " Tm " + lit(codificar(p.s)) + " Tj");
      }
    }
    fim();
    return o.join("\n");
  }

  /* ------------------------------ DOM -> operações ------------------------------ */
  function parseCor(s) {
    var m = /rgba?\(([^)]+)\)/.exec(String(s || ""));
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean), a = 1;
    if (p.length > 3) a = /%$/.test(p[3]) ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    var r = parseFloat(p[0]), g = parseFloat(p[1]), b = parseFloat(p[2]);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
    return { c: [r / 255, g / 255, b / 255], a: isFinite(a) ? a : 1 };
  }
  var PULA = { TEMPLATE: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1 };
  function urlDeBg(v) {
    var m = /url\(\s*["']?(data:image\/[a-z+.-]+;base64,[A-Za-z0-9+\/=]+)["']?\s*\)/i.exec(String(v || ""));
    return m ? m[1] : "";
  }

  function coletarOps(pgEl, opc) {
    opc = opc || {};
    var base = pgEl.getBoundingClientRect(), ox = base.left, oy = base.top, pw = base.width, ph = base.height;
    var win = pgEl.ownerDocument.defaultView, doc = pgEl.ownerDocument;
    var ops = [], rg = doc.createRange();
    var gcs = function (e) { return win.getComputedStyle(e); };

    function texto(node, cs, alfa) {
      var s0 = node.nodeValue;
      if (!s0 || !/\S/.test(s0)) return;
      var cor = parseCor(cs.color) || { c: [0, 0, 0], a: 1 };
      var fs = parseFloat(cs.fontSize) || 12;
      var neg = (parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400)) >= 600;
      var ita = cs.fontStyle === "italic" || cs.fontStyle === "oblique";
      var f = nomeFonte(neg, ita), maius = cs.textTransform === "uppercase", sub = /underline/.test(cs.textDecorationLine || cs.textDecoration || "");
      var re = /\S+/g, m;
      while ((m = re.exec(s0))) {
        rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
        var rs = rg.getClientRects();
        if (!rs.length) continue;
        var palavra = maius ? m[0].toUpperCase() : m[0];
        if (rs.length === 1) {
          emite(palavra + " ", rs[0], f, fs, cor, alfa, sub);
        } else {
          /* palavra quebrada em mais de uma linha (overflow-wrap:anywhere): letra a letra, agrupando por linha */
          var linha = null, buf = "", rIni = null, k;
          for (k = 0; k < m[0].length; k++) {
            rg.setStart(node, m.index + k); rg.setEnd(node, m.index + k + 1);
            var rc = rg.getClientRects()[0];
            if (!rc) continue;
            if (linha !== null && Math.abs(rc.top - linha) > 2) { emite(buf, rIni, f, fs, cor, alfa, sub); buf = ""; rIni = null; }
            if (rIni === null) { rIni = rc; linha = rc.top; }
            buf += maius ? m[0].charAt(k).toUpperCase() : m[0].charAt(k);
          }
          if (buf) emite(buf, rIni, f, fs, cor, alfa, sub);
        }
      }
    }
    function emite(s, r, f, fs, cor, alfa, sub) {
      if (r.bottom < oy || r.top > oy + ph || r.right < ox || r.left > ox + pw) return;
      var y = r.top - oy + 0.905 * fs;
      ops.push({ t: "txt", s: s, x: r.left - ox, y: y, fs: fs, f: f, c: cor.c, a: cor.a * alfa });
      if (sub) ops.push({ t: "rect", x: r.left - ox, y: y + fs * 0.1, w: r.width, h: Math.max(0.6, fs * 0.06), c: cor.c, a: cor.a * alfa });
    }

    function andar(el, alfa) {
      if (PULA[el.tagName]) return;
      var cl = el.classList;
      if (cl && (cl.contains("no-print") || cl.contains("ld-fonte"))) return;
      var cs = gcs(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      var op = parseFloat(cs.opacity); if (isFinite(op)) { if (op <= 0) return; alfa *= op; }
      var r = el.getBoundingClientRect(), x = r.left - ox, y = r.top - oy, w = r.width, h = r.height;
      var clip = (cs.overflowX !== "visible" || cs.overflowY !== "visible") && w > 0 && h > 0;
      /* marcador de lista (<li>) não é nó de texto: sem isto a lista da carta saía sem os pontos */
      if (cs.display === "list-item" && cs.listStyleType !== "none") {
        var rgL = el.ownerDocument.createRange(); rgL.selectNodeContents(el);
        var r1 = rgL.getClientRects()[0], fsL = parseFloat(cs.fontSize) || 12, corL = parseCor(cs.color) || { c: [0, 0, 0], a: 1 };
        if (r1) emite("•", { left: r.left - fsL * 0.85, right: r.left, top: r1.top, bottom: r1.bottom, width: fsL * 0.4 }, "F1", fsL, corL, alfa, false);
      }
      if (clip) ops.push({ t: "q", x: x, y: y, w: w, h: h });
      if (w > 0 && h > 0) {
        var bg = parseCor(cs.backgroundColor);
        if (bg && bg.a > 0) { ops.push({ t: "rect", x: x, y: y, w: w, h: h, c: bg.c, a: bg.a * alfa }); }
        var u = urlDeBg(cs.backgroundImage);
        if (u) ops.push({ t: "img", url: u, x: x, y: y, w: w, h: h, tam: cs.backgroundSize, pos: cs.backgroundPosition, a: alfa });
        if (el.tagName === "IMG" && /^data:image\//i.test(el.currentSrc || el.src || "")) ops.push({ t: "img", url: el.currentSrc || el.src, x: x, y: y, w: w, h: h, fit: cs.objectFit || "fill", a: alfa });
        var lados = [["Top", 0], ["Right", 1], ["Bottom", 2], ["Left", 3]];
        lados.forEach(function (L) {
          var bw = parseFloat(cs["border" + L[0] + "Width"]), st = cs["border" + L[0] + "Style"];
          if (!(bw > 0) || st === "none" || st === "hidden") return;
          var bc = parseCor(cs["border" + L[0] + "Color"]); if (!bc || bc.a <= 0) return;
          var rr = L[1] === 0 ? { x: x, y: y, w: w, h: bw } : L[1] === 2 ? { x: x, y: y + h - bw, w: w, h: bw } : L[1] === 3 ? { x: x, y: y, w: bw, h: h } : { x: x + w - bw, y: y, w: bw, h: h };
          ops.push({ t: "rect", x: rr.x, y: rr.y, w: rr.w, h: rr.h, c: bc.c, a: bc.a * alfa });
        });
      }
      var n = el.firstChild;
      while (n) {
        if (n.nodeType === 1) andar(n, alfa);
        else if (n.nodeType === 3) texto(n, cs, alfa);
        n = n.nextSibling;
      }
      if (clip) ops.push({ t: "Q" });
    }
    andar(pgEl, 1);
    return ops;
  }

  /* ------------------------------ interface ------------------------------ */
  function pausa() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* paginas: lista de elementos .ld-pg já paginados. Devolve { blob, bytes, paginas, ms, comprimido }. */
  async function gerar(paginas, opc) {
    opc = opc || {};
    var t0 = Date.now(), esc = new Escritor({ titulo: opc.titulo, produtor: opc.produtor }), i;
    paginas = [].slice.call(paginas || []);
    if (!paginas.length) throw new Error("nenhuma folha para gravar");
    /* ⚠ NUNCA gravar folha cortada: se algum corpo tem mais conteúdo que a folha comporta, o PDF perderia linhas (e o total) em silêncio */
    for (i = 0; i < paginas.length; i++) {
      var corpos = paginas[i].querySelectorAll ? paginas[i].querySelectorAll(".ld-corpo") : [];
      for (var kc = 0; kc < corpos.length; kc++) {
        if (corpos[kc].scrollHeight > corpos[kc].clientHeight + 1) throw new Error("a folha " + (i + 1) + " tem conteúdo que não cabe; o PDF sairia cortado");
      }
    }
    for (i = 0; i < paginas.length; i++) {
      var ops = coletarOps(paginas[i], opc);
      var imgs = {}, vistas = {}, k;
      for (k = 0; k < ops.length; k++) {
        var pp = ops[k];
        if (pp.t === "img" && !vistas[pp.url]) { vistas[pp.url] = 1; var inf = await esc.imagem(pp.url); if (inf) imgs[pp.url] = inf; }
      }
      await esc.pagina(renderizar(ops, esc, imgs));
      if (opc.aoProgresso) { try { opc.aoProgresso(i + 1, paginas.length); } catch (e) {} }
      if (i % 3 === 2) await pausa();
    }
    var blob = typeof Blob !== "undefined" ? esc.blob() : null;
    return { blob: blob, paginas: paginas.length, ms: Date.now() - t0, comprimido: esc.comprimiu, escritor: esc };
  }

  function baixar(blob, nome) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = nome || "documento.pdf";
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 4000);
  }

  var PdfDireto = {
    gerar: gerar, baixar: baixar, coletarOps: coletarOps, renderizar: renderizar, Escritor: Escritor,
    PAG_W: PAG_W, PAG_H: PAG_H,
    _interno: { codificar: codificar, lit: lit, textoPdf: textoPdf, infoJpeg: infoJpeg, tamImagem: tamImagem, parseCor: parseCor, N: N }
  };
  global.PdfDireto = PdfDireto;
  if (typeof module !== "undefined" && module.exports) module.exports = PdfDireto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

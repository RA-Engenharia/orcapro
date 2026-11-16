/* =====================================================================
 * folhapdf.js — a FOLHA do BIM (js/prancha.js + js/pranchaui.js) → PDF VETORIAL, sem diálogo de impressão
 *
 * ⚠ POR QUE ISTO EXISTE (16/11/2026). O "Imprimir / PDF" da folha abria uma janela com o HTML e entregava o desenho ao driver de impressão do Windows ("Microsoft Print to
 *   PDF" e afins): o resultado depende da máquina (curvas em vez de texto, hachura virando imagem de baixa resolução, texto e linhas borrados) enquanto a tela estava nítida.
 *   Aqui o PDF é escrito pelo próprio sistema, na MESMA escala do papel (1 mm de papel = 1 mm no PDF): linhas e hachura vetoriais com a pena de papel da tela, texto de verdade
 *   (selecionável), carimbo, moldura, títulos de vista, texto livre e tabela. Só a vista 3D (e os logos) é imagem — em PNG sem perda, no tamanho real da folha a >= 300 dpi.
 *
 * Motor PURO (sem DOM, Node-testável, ES5); quem escreve o arquivo é js/svgpdf.js. A parte que precisa de canvas (decodificar o PNG/JPEG e deflatar o RGB) é injetada
 * (`opc.codificar`) e tem a versão de navegador em `codificarNavegador`.
 *
 *   svgDaFolha(P, pr, folha, rec, geo, dims) → { svg, imagens: { chave: uri } }   (a folha inteira em SVG, 1 unidade = 1 mm)
 *   gerar(itens, opc) → Promise<{ bytes, paginas, imagens }>   itens: [{ pr, folha, rec, geo }]
 * Teste: node tools/test-folhapdf.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function n3(v) { return Math.round(v * 1000) / 1000; }
  function SP() { return global.SvgPdf || (typeof require === "function" ? require("./svgpdf.js") : null); }

  /* ------------------------------------------------ CSS do papel → atributo style
     O desenho 2D usa classes (d2-corte, d2-cota-tx…) que a janela de impressão resolvia com o <style> ESTILO_PAPEL; o PDF não tem CSS: cada regra vira o style do elemento
     (CSS vence atributo de apresentação; o style do próprio elemento vence o CSS — a mesma cascata). */
  function regras(css) {
    var out = [], c = txt(css).replace(/\/\*[\s\S]*?\*\//g, "");
    c.replace(/([^{}]+)\{([^{}]*)\}/g, function (_, sels, decl) {
      sels.split(",").forEach(function (s) {
        s = s.trim().replace(/^\.pv-vp\s+/, "");
        if (!s || /:/.test(s) || /\[/.test(s)) return;   /* :where(…) e seletores de atributo ficam de fora (o PDF não tem os dois) */
        out.push({ partes: s.split(/\s+/), decl: decl.trim().replace(/;$/, "") });
      });
      return _;
    });
    return out;
  }
  function casa(parte, el) { return parte.charAt(0) === "." ? el.cls.indexOf(parte.slice(1)) >= 0 : parte === el.tag; }
  function declsDe(rs, el, pilha) {
    var d = [];
    rs.forEach(function (r) {
      var ps = r.partes, i = ps.length - 1;
      if (!casa(ps[i], el)) return;
      var j = pilha.length - 1; i--;
      while (i >= 0 && j >= 0) { if (casa(ps[i], pilha[j])) i--; j--; }
      if (i < 0) d.push(r.decl);
    });
    return d.join(";");
  }
  function resolverCss(svg, css) {
    var rs = regras(css), pilha = [], re = /<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g;
    return txt(svg).replace(re, function (all, fecha, tag, at, auto) {
      var t = tag.toLowerCase();
      if (fecha) { pilha.pop(); return all; }
      var mc = /\bclass="([^"]*)"/.exec(at), el = { tag: t, cls: mc ? mc[1].split(/\s+/) : [] }, d = declsDe(rs, el, pilha);
      if (!auto) pilha.push(el);
      if (!d) return all;
      var ms = /\bstyle="([^"]*)"/.exec(at), st = d + (ms ? ";" + ms[1] : "");
      at = ms ? at.replace(/\bstyle="[^"]*"/, "style=\"" + st + "\"") : at + " style=\"" + st + "\"";
      return "<" + tag + at + (auto ? "/" : "") + ">";
    });
  }

  /* ------------------------------------------------ peças da folha em SVG (mm)
     O desenho 2D vem de PranchaUI.viewportSvg (as penas de papel já em metros do desenho), com o quadro e a vista em escala: translate + scale (mm por metro = 1000/escala). */
  function interiorSvg(svg) { return txt(svg).replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<style>[\s\S]*?<\/style>/g, ""); }

  function viewport(P, b, i, rec, ctx) {
    var vp = rec.viewports && ((b.escalaPropria && rec.viewports[b.vistaId + "@" + b.escala]) || rec.viewports[b.vistaId]);
    if (!vp) return "<rect x=\"" + n3(b.x) + "\" y=\"" + n3(b.y) + "\" width=\"" + n3(b.w) + "\" height=\"" + n3(b.h) + "\" fill=\"none\" stroke=\"#b3261e\" stroke-width=\"0.3\" stroke-dasharray=\"2 1\"/>" +
      "<text x=\"" + n3(b.x + b.w / 2) + "\" y=\"" + n3(b.y + b.h / 2) + "\" font-size=\"3\" text-anchor=\"middle\" fill=\"#b3261e\">vista sem desenho</text>";
    var vb = b.recorte ? { x: b.recorte.x0, y: b.recorte.y0, w: b.recorte.x1 - b.recorte.x0, h: b.recorte.y1 - b.recorte.y0 } : vp.vb;
    var s = P.viewportSvg(vp, b), k = Math.min(b.w / vb.w, b.h / vb.h), ox = b.x + (b.w - vb.w * k) / 2 - vb.x * k, oy = b.y + (b.h - vb.h * k) / 2 - vb.y * k;
    s = resolverCss(s, P.ESTILO_PAPEL);
    /* a vista 3D guarda a imagem no próprio SVG (<image href=data:…>): vira a imagem da folha, inteira, sem reamostrar */
    s = s.replace(/<image\b([^>]*?)\bhref="(data:[^"]+)"([^>]*?)\/?>/g, function (_, a1, uri, a2) {
      var ch = "v" + (ctx.n++); ctx.imagens[ch] = uri;
      var x = num((/\bx="([^"]*)"/.exec(a1 + a2) || [])[1], 0), y = num((/\by="([^"]*)"/.exec(a1 + a2) || [])[1], 0), w = num((/\bwidth="([^"]*)"/.exec(a1 + a2) || [])[1], 0), h = num((/\bheight="([^"]*)"/.exec(a1 + a2) || [])[1], 0);
      return "<image data-im=\"" + ch + "\" x=\"" + n3(x) + "\" y=\"" + n3(y) + "\" width=\"" + n3(w) + "\" height=\"" + n3(h) + "\"/>";
    });
    return "<clipPath id=\"cvp" + i + "\"><rect x=\"" + n3(b.x) + "\" y=\"" + n3(b.y) + "\" width=\"" + n3(b.w) + "\" height=\"" + n3(b.h) + "\"/></clipPath>" +
      "<g clip-path=\"url(#cvp" + i + ")\"><g transform=\"translate(" + n3(ox) + " " + n3(oy) + ") scale(" + (Math.round(k * 1e9) / 1e9) + ")\">" + interiorSvg(s) + "</g></g>" + titulo(b, vp);
  }
  function titulo(b, vp) {
    if (b.mostrarTitulo === false) return "";
    var x0 = b.x, y0 = b.y + b.h + 1.5, nome = txt(b.tituloVista).toUpperCase(), SPM = SP(), w = SPM ? SPM.largura(nome, 3.528, true) : nome.length * 2;
    var esc3d = vp && vp.tipo === "3d" ? "SEM ESCALA (VISTA 3D)" : "ESC 1:" + b.escala;
    return "<circle cx=\"" + n3(x0 + 4) + "\" cy=\"" + n3(y0 + 4) + "\" r=\"3.8\" fill=\"none\" stroke=\"#111\" stroke-width=\"0.25\"/>" +
      "<text x=\"" + n3(x0 + 4) + "\" y=\"" + n3(y0 + 5.1) + "\" font-size=\"3.1\" text-anchor=\"middle\" font-weight=\"bold\" fill=\"#111\">" + esc(b.numeroDetalhe) + "</text>" +
      "<text x=\"" + n3(x0 + 10) + "\" y=\"" + n3(y0 + 3.4) + "\" font-size=\"3.528\" font-weight=\"bold\" fill=\"#111\">" + esc(nome) + "</text>" +
      "<line x1=\"" + n3(x0 + 10) + "\" y1=\"" + n3(y0 + 4.5) + "\" x2=\"" + n3(x0 + 10 + w + 8) + "\" y2=\"" + n3(y0 + 4.5) + "\" stroke=\"#111\" stroke-width=\"0.5\"/>" +
      "<text x=\"" + n3(x0 + 10) + "\" y=\"" + n3(y0 + 7.2) + "\" font-size=\"2.469\" fill=\"#111\">" + esc(esc3d) + "</text>";
  }
  function quebrar(t, corpo, larg, neg) {
    var SPM = SP(), pal = txt(t).split(/\s+/), lin = [], at = "";
    pal.forEach(function (p) { var c = at ? at + " " + p : p; if (at && SPM.largura(c, corpo, neg) > larg) { lin.push(at); at = p; } else at = c; });
    if (at) lin.push(at); return lin;
  }
  function blocoTexto(b) {
    var fs = b.alt > 0 ? b.alt / 0.716 : 2.822, s = "";
    (b.linhas || []).forEach(function (l, i) { if (l) s += "<text x=\"" + n3(b.x) + "\" y=\"" + n3(b.y + i * fs * 1.3 + fs * 1.0) + "\" font-size=\"" + n3(fs) + "\" fill=\"#111\"" + (b.negrito ? " font-weight=\"bold\"" : "") + ">" + esc(l) + "</text>"; });
    return s;
  }
  function blocoTabela(b) {
    var cab = b.cabecalho || [], nc = Math.max(cab.length, ((b.linhas || [])[0] || []).length, 1), cw = b.w / nc, rh = 3.4, s = "", y = b.y;
    function linha(cel, fundo, neg, bord) {
      cel.forEach(function (c, j) {
        s += "<rect x=\"" + n3(b.x + j * cw) + "\" y=\"" + n3(y) + "\" width=\"" + n3(cw) + "\" height=\"" + rh + "\" fill=\"" + (fundo || "none") + "\" stroke=\"" + bord + "\" stroke-width=\"0.2\"/>" +
          "<text x=\"" + n3(b.x + j * cw + cw / 2) + "\" y=\"" + n3(y + 2.4) + "\" font-size=\"2.4\" text-anchor=\"middle\" fill=\"#111\"" + (neg ? " font-weight=\"bold\"" : "") + ">" + esc(c) + "</text>";
      }); y += rh;
    }
    if (cab.length) linha(cab, "#eef2f5", true, "#333");
    (b.linhas || []).forEach(function (l) { linha(l, null, false, "#999"); });
    return s;
  }
  function coluna(P, pr, g) {
    var k = g.coluna; if (!k || g.semColuna) return "";
    var altura = k.h - g.carimbo.h - 2; if (altura < 6) return "";
    var fs = Math.max(5.6, Math.min(7.6, k.w / 28)) * 25.4 / 72, y = k.y + 1.6, s = "<line x1=\"" + n3(k.x) + "\" y1=\"" + n3(k.y) + "\" x2=\"" + n3(k.x) + "\" y2=\"" + n3(k.y + altura) + "\" stroke=\"#111\" stroke-width=\"0.35\"/>";
    (pr.coluna || []).forEach(function (sec) {
      y += fs; s += "<text x=\"" + n3(k.x + 2.5) + "\" y=\"" + n3(y) + "\" font-size=\"" + n3(fs) + "\" font-weight=\"bold\" fill=\"#111\">" + esc(sec.titulo) + "</text>" +
        "<line x1=\"" + n3(k.x + 2.5) + "\" y1=\"" + n3(y + 0.4) + "\" x2=\"" + n3(k.x + 2.5 + (SP() ? SP().largura(sec.titulo, fs, true) : 10)) + "\" y2=\"" + n3(y + 0.4) + "\" stroke=\"#111\" stroke-width=\"0.15\"/>"; y += fs * 0.5;
      (sec.itens || []).forEach(function (it) {
        quebrar(it, fs, k.w - 8, false).forEach(function (l, i) { y += fs * 1.28; if (y < k.y + altura) s += (i === 0 ? "<text x=\"" + n3(k.x + 3) + "\" y=\"" + n3(y) + "\" font-size=\"" + n3(fs) + "\" fill=\"#111\">&#8226;</text>" : "") + "<text x=\"" + n3(k.x + 5.5) + "\" y=\"" + n3(y) + "\" font-size=\"" + n3(fs) + "\" fill=\"#111\">" + esc(l) + "</text>"; });
        y += fs * 0.3;
      }); y += fs * 0.8;
    });
    return s;
  }
  function carimbo(P, pr, fl, g, rec, ctx) {
    var k = g.carimbo, PR = global.Prancha, ra = PR && PR.modeloCarimbo && PR.modeloCarimbo(pr) === "RA" && PR.carimboRA;
    if (ra) {
      var h = P.carimboRA(pr, fl, g, { imagens: rec.imagens, logo: rec.logo, projeto: rec.projeto, empresa: rec.empresa, editor: false }), m = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(h); if (!m) return "";
      var dentro = m[1].replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<image\b[^>]*?\bhref="(data:[^"]+)"([^>]*?)\/?>/g, function (_, uri, resto) {
        var ch = "c" + (ctx.n++); ctx.imagens[ch] = uri;
        var gx = function (a) { return num((new RegExp("\\b" + a + "=\"([^\"]*)\"").exec(resto) || [])[1], 0); };
        return "<image data-im=\"" + ch + "\" data-fit=\"1\" x=\"" + gx("x") + "\" y=\"" + gx("y") + "\" width=\"" + gx("width") + "\" height=\"" + gx("height") + "\"/>";
      });
      return "<g transform=\"translate(" + n3(k.x) + " " + n3(k.y) + ")\">" + dentro + "</g>";
    }
    /* carimbo simples (sem o modelo RA): a mesma informação em linhas */
    var c = pr.carimbo || {}, E = rec.empresa || {}, s = "<rect x=\"" + n3(k.x) + "\" y=\"" + n3(k.y) + "\" width=\"" + n3(k.w) + "\" height=\"" + n3(k.h) + "\" fill=\"#fff\"/><line x1=\"" + n3(k.x) + "\" y1=\"" + n3(k.y) + "\" x2=\"" + n3(k.x + k.w) + "\" y2=\"" + n3(k.y) + "\" stroke=\"#111\" stroke-width=\"0.35\"/>";
    var fs = Math.max(5.2, Math.min(7.4, k.w / 30)) * 25.4 / 72, y = k.y;
    function lin(t, neg, cor) { y += fs * 1.4; s += "<text x=\"" + n3(k.x + k.w / 2) + "\" y=\"" + n3(y) + "\" font-size=\"" + n3(fs) + "\" text-anchor=\"middle\"" + (neg ? " font-weight=\"bold\"" : "") + " fill=\"" + (cor || "#111") + "\">" + esc(t) + "</text><line x1=\"" + n3(k.x) + "\" y1=\"" + n3(y + fs * 0.4) + "\" x2=\"" + n3(k.x + k.w) + "\" y2=\"" + n3(y + fs * 0.4) + "\" stroke=\"#111\" stroke-width=\"0.2\"/>"; }
    lin(c.empresa || E.nome || "", true); lin(c.obra || pr.nome || "", true, "#00406A"); lin("CONTEÚDO: " + (fl.conteudo || pr.nome || ""), true);
    lin("RT: " + (c.responsavel || E.responsavel || "")); if (c.local) lin("LOCAL: " + c.local);
    lin("DATA " + txt(c.data) + "   ESC " + txt(fl.escala) + "   COD " + txt(fl.numero || (c.codigo ? c.codigo + "-" + ("0" + fl.n).slice(-2) : "")) + "   FOLHA " + ("0" + fl.n).slice(-2) + "/" + ("0" + (pr.folhas || []).length).slice(-2));
    return s;
  }

  /* a folha inteira: 1 unidade = 1 mm. `dims` ({chave:{w,h}}) deixa a imagem "caber" no quadro sem esticar (object-fit: contain) */
  function svgDaFolha(P, pr, fl, rec, geo, dims) {
    rec = rec || {}; dims = dims || {};
    var g = geo, Pp = g.papel, M = g.moldura, ctx = { n: 0, imagens: {} }, s = "";
    s += "<rect x=\"0\" y=\"0\" width=\"" + Pp.w + "\" height=\"" + Pp.h + "\" fill=\"#fff\"/>";
    if (fl.imagemInteira && rec.imagens && rec.imagens[fl.imagemInteira]) {
      ctx.imagens.i0 = rec.imagens[fl.imagemInteira]; s += "<image data-im=\"i0\" x=\"0\" y=\"0\" width=\"" + Pp.w + "\" height=\"" + Pp.h + "\"/>";
    } else {
      s += "<rect x=\"" + n3(M.x + 0.25) + "\" y=\"" + n3(M.y + 0.25) + "\" width=\"" + n3(M.w - 0.5) + "\" height=\"" + n3(M.h - 0.5) + "\" fill=\"none\" stroke=\"#111\" stroke-width=\"0.5\"/>";
      (fl.blocos || []).forEach(function (b, i) {
        if (b.tipo === "viewport") s += viewport(P, b, i, rec, ctx);
        else if (b.tipo === "texto") s += blocoTexto(b);
        else if (b.tipo === "tabela") s += blocoTabela(b);
        else if (b.tipo === "vista" || b.tipo === "imagem") {
          var uri = b.tipo === "vista" ? rec.vistas && rec.vistas[b.vistaId || b.origemVista] : rec.imagens && rec.imagens[b.chave];
          if (uri) { var ch = "b" + i; ctx.imagens[ch] = uri; s += "<image data-im=\"" + ch + "\" data-fit=\"1\" x=\"" + n3(b.x) + "\" y=\"" + n3(b.y) + "\" width=\"" + n3(b.w) + "\" height=\"" + n3(b.h) + "\"/>"; }
          if (b.titulo) s += "<text x=\"" + n3(b.x) + "\" y=\"" + n3(b.y + b.h + 4) + "\" font-size=\"3.528\" fill=\"#111\">" + esc(b.titulo) + "</text>";
        }
      });
      s += coluna(P, pr, g) + carimbo(P, pr, fl, g, rec, ctx);
    }
    /* "caber" no quadro: troca x/y/width/height da imagem pelo retângulo contido, conforme as dimensões em pixel conhecidas */
    s = s.replace(/<image data-im="([^"]+)" data-fit="1" x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"\/>/g, function (_, ch, x, y, w, h) {
      var d = dims[ch]; x = +x; y = +y; w = +w; h = +h;
      if (d && d.w > 0 && d.h > 0) { var k = Math.min(w / d.w, h / d.h), nw = d.w * k, nh = d.h * k; x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh; }
      return "<image data-im=\"" + ch + "\" x=\"" + n3(x) + "\" y=\"" + n3(y) + "\" width=\"" + n3(w) + "\" height=\"" + n3(h) + "\"/>";
    });
    return { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + Pp.w + "mm\" height=\"" + Pp.h + "mm\" viewBox=\"0 0 " + Pp.w + " " + Pp.h + "\">" + s + "</svg>", imagens: ctx.imagens };
  }

  /* itens: [{ pr, folha, rec, geo }]. opc.codificar(uri) → Promise<{ flate|jpeg (texto binário), pxW, pxH }>; opc.dimensoes(uri) → Promise<{w,h}> (opcional). */
  function gerar(itens, opc) {
    opc = opc || {}; var P = opc.P || global.PranchaUI, SPM = SP();
    var codificar = opc.codificar || codificarNavegador, dimensoes = opc.dimensoes || null;
    var todas = [], pend = [];
    itens.forEach(function (it, ix) { var r0 = svgDaFolha(P, it.pr, it.folha, it.rec, it.geo, null); todas.push({ it: it, imagens: r0.imagens, pref: "p" + ix + "_" }); });
    var uris = {}, dims = {};
    todas.forEach(function (t) { Object.keys(t.imagens).forEach(function (ch) { uris[t.pref + ch] = t.imagens[ch]; }); });
    var chaves = Object.keys(uris), cod = {};
    var seq = Promise.resolve();
    chaves.forEach(function (k) { seq = seq.then(function () { return codificar(uris[k]); }).then(function (r) { if (r && (typeof r.flate === "string" || typeof r.jpeg === "string")) { cod[k] = r; dims[k] = { w: r.pxW, h: r.pxH }; } }); });
    return seq.then(function () {
      var svgs = todas.map(function (t) {
        var d = {}; Object.keys(t.imagens).forEach(function (ch) { if (dims[t.pref + ch]) d[ch] = dims[t.pref + ch]; });
        var r1 = svgDaFolha(P, t.it.pr, t.it.folha, t.it.rec, t.it.geo, d);
        return r1.svg.replace(/data-im="([^"]+)"/g, function (_, ch) { return "data-im=\"" + t.pref.replace(/[^A-Za-z0-9]/g, "") + ch + "\""; });
      });
      var porChave = {}; Object.keys(cod).forEach(function (k) { porChave[k.replace(/[^A-Za-z0-9]/g, "")] = cod[k]; });
      var bytes = SPM.pdf(svgs, { titulo: opc.titulo || "Folhas", imagensPorChave: porChave });
      return { bytes: bytes, paginas: svgs.length, imagens: Object.keys(porChave).length, svgs: svgs };
    });
  }

  /* navegador: decodifica a imagem (PNG/JPEG/SVG) no tamanho natural, compõe sobre branco e entrega RGB 8 bits deflate (sem perda). Sem CompressionStream cai em JPEG 0,97. */
  function binario(u8) { var s = "", n = 0x8000; for (var i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return s; }
  function codificarNavegador(uri, opc) {
    opc = opc || {};
    return new Promise(function (res) {
      var im = new global.Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth || im.width || 1, h = im.naturalHeight || im.height || 1, lado = opc.maxPx || 8192;
          if (/^data:image\/svg/.test(uri) || !(im.naturalWidth > 0)) { var q = Math.max(1, 2400 / Math.max(w, h)); w = Math.round(w * q); h = Math.round(h * q); }
          if (Math.max(w, h) > lado) { var r = lado / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
          var cv = global.document.createElement("canvas"); cv.width = w; cv.height = h;
          var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h);
          if (typeof global.CompressionStream === "function") {
            var px = cx.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3);
            for (var i = 0, j = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
            var cs = new global.CompressionStream("deflate"), blob = new global.Blob([rgb]).stream().pipeThrough(cs);
            new global.Response(blob).arrayBuffer().then(function (ab) { res({ flate: binario(new Uint8Array(ab)), pxW: w, pxH: h }); }, function () { res(null); });
            return;
          }
          var j2 = cv.toDataURL("image/jpeg", 0.97).split(",")[1], bin = global.atob(j2);
          res({ jpeg: bin, pxW: w, pxH: h });
        } catch (e) { res(null); }
      };
      im.onerror = function () { res(null); };
      im.src = uri;
    });
  }

  var FolhaPdf = { svgDaFolha: svgDaFolha, gerar: gerar, resolverCss: resolverCss, codificarNavegador: codificarNavegador };
  global.FolhaPdf = FolhaPdf;
  if (typeof module !== "undefined" && module.exports) module.exports = FolhaPdf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

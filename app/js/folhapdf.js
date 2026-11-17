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


  /* ------------------------------------------------ PDF INTERATIVO (CAMADAS / OCG, 16/11/2026)
     O SVG da vista já tem as classes de cada parte (d2-cota, a7-cota, d2-nivel, d2-eixo-g, d2-paginacao, d2-fase-*, d2-corte…). Aqui cada parte ganha `data-ocg` e o svgpdf a grava como
     camada liga/desliga do leitor (Acrobat, Edge, Chrome). Variantes em rádio (só uma ligada, as duas DESENHADAS): cotas coloridas × pretas (quando alguma cota tem cor) e parede
     hachura × cinza × branco (… o preenchimento da vista é o que começa ligado). A variante só aparece com o mestre ligado (OCMD /AllOn "mestre+variante"). O carimbo, a moldura
     e o desenho que não é de nenhuma camada ficam sempre. Config (por conjunto de folhas, pr.pdfCamadas): { ativo, incluir:{id:false}, desligadas:[ids], variantes:{cotas:"cor"|"preta", parede:"parede-…"} }. */
  var CAMADAS = [{ id: "cotas", nome: "Cotas" }, { id: "parede", nome: "Parede (preenchimento)" }, { id: "mobiliario", nome: "Mobiliário" }, { id: "paginacao", nome: "Paginação de piso" },
    { id: "construir", nome: "Construir" }, { id: "demolir", nome: "Demolir" }, { id: "existente", nome: "Existente" }, { id: "niveis", nome: "Níveis" }, { id: "textos", nome: "Textos e ambientes" }, { id: "eixos", nome: "Eixos" }];
  var NOMES_VAR = { "cotas-cor": "Cotas coloridas", "cotas-preta": "Cotas pretas", "parede-hachura": "Parede: hachura 45°", "parede-cinza": "Parede: cinza", "parede-branco": "Parede: branco", "parede-preto": "Parede: preto", "parede-outro": "Parede: preenchimento da vista" };
  var FILL_PAREDE = { cinza: "#cfd3d8", branco: "#ffffff" };
  function camCfg(c) {
    if (!c || c.ativo === false) return null;
    var o = { ativo: true, incluir: c.incluir || {}, desligadas: Array.isArray(c.desligadas) ? c.desligadas : [], variantes: c.variantes || {} };
    return o;
  }
  function classesDe(at) { var m = /\bclass="([^"]*)"/.exec(at); return m ? m[1].split(/\s+/) : []; }
  function fimDoG(s, ini) {   /* índice logo depois do </g> que fecha o <g> aberto antes de `ini` */
    var re = /<(\/?)g\b[^>]*?(\/?)>/g, d = 1, m; re.lastIndex = ini;
    while ((m = re.exec(s))) { if (m[1]) d--; else if (!m[2]) d++; if (d === 0) return re.lastIndex; }
    return -1;
  }
  function comOcg(tag, at, auto, id) { return "<" + tag + " data-ocg=\"" + id + "\"" + at + (auto ? "/" : "") + ">"; }
  /* tira a cor própria (o `style` posto por cima da regra do papel: "stroke:#111;stroke:#d00000" → "stroke:#111") */
  function semCor(seg) {
    return seg.replace(/\bstyle="([^"]*)"/g, function (_, st) {
      var vistos = {}, out = [];
      st.split(";").forEach(function (d) { var i = d.indexOf(":"); if (i < 1) return; var k = d.slice(0, i).trim(); if ((k === "stroke" || k === "fill") && vistos[k]) return; vistos[k] = 1; out.push(d.trim()); });
      return "style=\"" + out.join(";") + "\"";
    });
  }
  function temCorPropria(seg) {
    var re = /;\s*(?:stroke|fill)\s*:\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\s*(?=["';])/g, m;
    while ((m = re.exec(seg))) { var h = m[1].toLowerCase(); if (!/^(111|111111|000|000000|fff|ffffff)$/.test(h)) return true; }
    return false;
  }
  function chaveFill(f, idp) {
    var v = txt(f).trim().toLowerCase();
    if (!v || v === "none") return "branco";
    if (v === FILL_PAREDE.cinza) return "cinza";
    if (v === "#111111" || v === "#3a3a3a" || v === "#000" || v === "#000000") return "preto";
    if (v === "url(#" + idp.toLowerCase() + ")") return "hachura";
    if (v === "#fff" || v === "#ffffff") return "branco";
    return "outro";
  }
  function classificar(s, cfg, ctx, b) {
    var cam = ctx.cam, idp = "d2-hach-" + txt(b.vistaId).replace(/[^\w-]/g, "_"), re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g, out = "", ult = 0, pilha = [], m;
    function inc(id) { return cfg.incluir[id] !== false; }
    function marca(id) { cam.usados[id] = 1; return id; }
    while ((m = re.exec(s))) {
      var fecha = m[1] === "/", tag = m[2].toLowerCase(), at = m[3], auto = m[4] === "/", dentro = pilha.some(function (q) { return q; });
      if (tag === "g") {
        if (fecha) { pilha.pop(); continue; }
        var cl = classesDe(at), id = null;
        if (!dentro) {
          if (cl.indexOf("d2-cota") >= 0 || cl.indexOf("a7-cota") >= 0) id = "cotas";
          else if (cl.indexOf("d2-nivel") >= 0) id = "niveis";
          else if (cl.indexOf("d2-eixo-g") >= 0) id = "eixos";
          else if (cl.indexOf("d2-paginacao") >= 0) id = "paginacao";
          else if (cl.indexOf("d2-ambientes") >= 0 || cl.indexOf("d2-amb-legenda") >= 0 || cl.indexOf("d2-identificadores") >= 0 || cl.indexOf("d2-amb-cores") >= 0) id = "textos";
        }
        if (id && inc(id) && !auto) {
          out += s.slice(ult, m.index);
          if (id === "cotas") {
            var fim = fimDoG(s, re.lastIndex);
            if (fim > 0) {
              var seg = s.slice(m.index, fim), colorida = temCorPropria(seg);
              if (colorida) {
                marca("cotas"); marca("cotas-cor"); marca("cotas-preta");
                out += semCor(seg).replace(/^<g\b/, "<g data-ocg=\"cotas+cotas-preta\"") + seg.replace(/^<g\b/, "<g data-ocg=\"cotas+cotas-cor\"");   /* a da tela por último (por cima): leitor sem camadas mostra como a tela */
              } else out += seg.replace(/^<g\b/, "<g data-ocg=\"" + marca("cotas") + "\"");
              ult = fim; re.lastIndex = fim; continue;
            }
          }
          out += comOcg("g", at, false, marca(id)); ult = re.lastIndex; pilha.push(true); continue;
        }
        if (!auto) pilha.push(dentro);
        continue;
      }
      if (fecha || dentro || !/^(path|line|polyline|polygon|rect|circle)$/.test(tag)) continue;
      var cl2 = classesDe(at), cat = (/\bdata-cat="([^"]*)"/.exec(at) || [])[1] || "", id2 = null;
      if (cl2.indexOf("d2-corte-novo") >= 0 || cl2.indexOf("d2-fase-novo") >= 0) id2 = "construir";
      else if (cl2.indexOf("d2-fase-demolido") >= 0 || cl2.indexOf("d2-fase-temporario") >= 0) id2 = "demolir";
      else if (cl2.indexOf("d2-fase-existente") >= 0) id2 = "existente";
      else if (/furniture|mobili|casework|moveis|m[oó]vel/i.test(cat)) id2 = "mobiliario";
      if (id2) { if (inc(id2)) { out += s.slice(ult, m.index) + comOcg(tag, at, auto, marca(id2)); ult = re.lastIndex; } continue; }
      /* PAREDE: o corte da vista (non-P6: toda forma d2-corte; P6: a categoria parede). Contorno numa camada, o preenchimento em variantes (rádio). */
      if (cl2.indexOf("d2-corte") >= 0 && cl2.indexOf("d2-p6-sobre") < 0 && (!cat || /wall|parede/i.test(cat)) && inc("parede")) {
        var mf = /\bfill="([^"]*)"/.exec(at), fl = mf ? mf[1] : "none", todo = s.slice(m.index, re.lastIndex), res = "";
        if (!mf || fl === "none") { res = comOcg(tag, at, auto, marca("parede")); }
        else {
          var atual = chaveFill(fl, idp), lista = [[atual, fl]];
          ["hachura", "cinza", "branco"].forEach(function (k) { if (k !== atual) lista.push([k, k === "hachura" ? "url(#" + idp + ")" : FILL_PAREDE[k]]); });
          if (!cam.atual.parede) cam.atual.parede = "parede-" + atual;
          lista.reverse().forEach(function (q) {   /* a variante da tela por último (por cima): leitor sem camadas mostra como a tela */
            var idv = "parede-" + q[0], a2 = at.replace(/\bfill="[^"]*"/, "fill=\"" + q[1] + "\"");
            a2 = /\bstyle="/.test(a2) ? a2.replace(/\bstyle="([^"]*)"/, function (_, st) { return "style=\"" + st + ";stroke:none\""; }) : a2 + " style=\"stroke:none\"";
            marca("parede"); marca(idv); res += "<" + tag + " data-ocg=\"parede+" + idv + "\"" + a2 + (auto ? "/" : "") + ">";
          });
          res += comOcg(tag, at.replace(/\bfill="[^"]*"/, "fill=\"none\""), auto, marca("parede"));
        }
        void todo;
        out += s.slice(ult, m.index) + res; ult = re.lastIndex;
      }
    }
    return out + s.slice(ult);
  }
  /* o que o svgpdf precisa (nomes, quem começa desligada, rádios, ordem) a partir do que as vistas usaram */
  function infoCamadas(cfg, cam) {
    var U = cam.usados, nomes = {}, off = {}, radios = [], ordem = [];
    CAMADAS.forEach(function (d) { nomes[d.id] = d.nome; }); Object.keys(NOMES_VAR).forEach(function (k) { nomes[k] = NOMES_VAR[k]; });
    cfg.desligadas.forEach(function (id) { if (U[id]) off[id] = true; });
    var sub = { cotas: ["cotas-cor", "cotas-preta"], parede: ["parede-hachura", "parede-cinza", "parede-branco", "parede-preto", "parede-outro"] };
    var sel = { cotas: cfg.variantes.cotas === "preta" ? "cotas-preta" : "cotas-cor", parede: U[cfg.variantes.parede] ? cfg.variantes.parede : cam.atual.parede };
    CAMADAS.forEach(function (d) {
      if (!U[d.id]) return;
      ordem.push(d.id);
      var vs = (sub[d.id] || []).filter(function (v) { return U[v]; });
      if (vs.length > 1) { ordem.push(vs); radios.push(vs); vs.forEach(function (v) { if (v !== sel[d.id]) off[v] = true; }); }
    });
    return { nomes: nomes, off: off, radios: radios, ordem: ordem };
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
    if (ctx.cfg) s = classificar(s, ctx.cfg, ctx, b);
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
  function svgDaFolha(P, pr, fl, rec, geo, dims, camadas) {
    rec = rec || {}; dims = dims || {};
    var g = geo, Pp = g.papel, M = g.moldura, ctx = { n: 0, imagens: {}, cfg: camCfg(camadas), cam: { usados: {}, atual: {} } }, s = "";
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
    return { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + Pp.w + "mm\" height=\"" + Pp.h + "mm\" viewBox=\"0 0 " + Pp.w + " " + Pp.h + "\">" + s + "</svg>", imagens: ctx.imagens, cam: ctx.cam };
  }

  /* itens: [{ pr, folha, rec, geo }]. opc.codificar(uri) → Promise<{ flate|jpeg (texto binário), pxW, pxH }>; opc.dimensoes(uri) → Promise<{w,h}> (opcional). */
  function gerar(itens, opc) {
    opc = opc || {}; var P = opc.P || global.PranchaUI, SPM = SP();
    var codificar = opc.codificar || codificarNavegador, dimensoes = opc.dimensoes || null;
    var todas = [], pend = [];
    itens.forEach(function (it, ix) { var r0 = svgDaFolha(P, it.pr, it.folha, it.rec, it.geo, null, null); todas.push({ it: it, imagens: r0.imagens, pref: "p" + ix + "_" }); });
    var uris = {}, dims = {};
    todas.forEach(function (t) { Object.keys(t.imagens).forEach(function (ch) { uris[t.pref + ch] = t.imagens[ch]; }); });
    var chaves = Object.keys(uris), cod = {};
    var seq = Promise.resolve();
    chaves.forEach(function (k) { seq = seq.then(function () { return codificar(uris[k]); }).then(function (r) { if (r && (typeof r.flate === "string" || typeof r.jpeg === "string")) { cod[k] = r; dims[k] = { w: r.pxW, h: r.pxH }; } }); });
    var camTot = { usados: {}, atual: {} }, cfgCam = camCfg(opc.camadas);
    return seq.then(function () {
      var svgs = todas.map(function (t) {
        var d = {}; Object.keys(t.imagens).forEach(function (ch) { if (dims[t.pref + ch]) d[ch] = dims[t.pref + ch]; });
        var r1 = svgDaFolha(P, t.it.pr, t.it.folha, t.it.rec, t.it.geo, d, opc.camadas);
        Object.keys(r1.cam.usados).forEach(function (k) { camTot.usados[k] = 1; }); if (r1.cam.atual.parede && !camTot.atual.parede) camTot.atual.parede = r1.cam.atual.parede;
        return r1.svg.replace(/data-im="([^"]+)"/g, function (_, ch) { return "data-im=\"" + t.pref.replace(/[^A-Za-z0-9]/g, "") + ch + "\""; });
      });
      var porChave = {}; Object.keys(cod).forEach(function (k) { porChave[k.replace(/[^A-Za-z0-9]/g, "")] = cod[k]; });
      var camInfo = cfgCam && Object.keys(camTot.usados).length ? infoCamadas(cfgCam, camTot) : null;
      var bytes = SPM.pdf(svgs, { titulo: opc.titulo || "Folhas", imagensPorChave: porChave, camadas: camInfo });
      return { bytes: bytes, paginas: svgs.length, imagens: Object.keys(porChave).length, svgs: svgs, camadas: camInfo ? Object.keys(camTot.usados) : [] };
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

  var FolhaPdf = { CAMADAS: CAMADAS, classificar: classificar, svgDaFolha: svgDaFolha, gerar: gerar, resolverCss: resolverCss, codificarNavegador: codificarNavegador };
  global.FolhaPdf = FolhaPdf;
  if (typeof module !== "undefined" && module.exports) module.exports = FolhaPdf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

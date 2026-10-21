/* =====================================================================
 * marmproposta.js — PROPOSTA COMERCIAL DA MARMORARIA (motor puro, Node-testável)
 *
 * Módulo Marmoraria (pedido do Rogério, 20/10/2026): o marmorista modela a bancada e sai com a proposta DELE, com a
 * marca DELE (logo, nome, CNPJ e contato do cadastro ⚙ Empresa), os valores da tabela de preços DELE
 * (js/marmprecos.js), validade, prazo e condições — e o executivo de marmoraria anexo (js/marmorariapranchas.js).
 *
 *   paginas(orc, dados)        → [svg A4 (mm)]  as folhas da proposta (a tela mostra estas mesmas folhas)
 *   pdf(orc, dados, anexos)    → { bytes, paginas, placeholders }  proposta + as folhas do executivo, um PDF só
 *                                (js/svgpdf.js; o logo vai como JPEG — a tela converte o PNG do cadastro num canvas)
 *   dados = { empresa: Empresa.dados(), logo: { jpeg, pxW, pxH } | null, cliente, obra, local, numero, data,
 *             param (MarmPrecos tabela.param) }
 * ⚠ O QUE FALTA SAI EM VERMELHO ENTRE COLCHETES (padrão RA de proposta): [CNPJ], [VALIDADE], [PREÇO]… — nunca um
 *   valor de fábrica no lugar do que o marmorista não preencheu. A lista `placeholders` diz o que falta, para a tela
 *   avisar antes de ele mandar ao cliente.
 * ⚠ Nenhuma marca da RA nem do sistema na proposta: o documento é da marmoraria (o crédito "gerado por" segue a
 *   escolha de ⚙ Empresa › Documentos, Empresa.docsCfg().creditos).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  function SP() { return dep("SvgPdf", "svgpdf.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function brl(v) { return "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function br(v, c) { var p = Math.pow(10, c == null ? 2 : c); return (Math.round(v * p) / p).toFixed(c == null ? 2 : c).replace(".", ","); }
  function un(u) { return u === "m2" ? "m²" : u; }
  function dataBR(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso)); return m ? m[3] + "/" + m[2] + "/" + m[1] : txt(iso); }

  var W = 210, H = 297, ML = 18, MR = 18, MT = 16, MB = 18, LARG = W - ML - MR;
  var COR = { texto: "#1d232b", fraco: "#5b6470", linha: "#c9cfd6", faixa: "#eef1f4", falta: "#c00000", titulo: "#1d232b" };
  var CORPO = 3.3, CORPO_P = 2.8, LH = 4.6;

  function largura(s, corpo, negrito) { var S = SP(); return S && S.largura ? S.largura(s, corpo, negrito) : txt(s).length * corpo * 0.5; }
  function quebrar(s, corpo, max, negrito) {
    var pal = txt(s).split(/\s+/), out = [], l = "";
    pal.forEach(function (p) { var t = l ? l + " " + p : p; if (largura(t, corpo, negrito) > max && l) { out.push(l); l = p; } else l = t; });
    if (l) out.push(l);
    return out.length ? out : [""];
  }

  /* o DOCUMENTO como fluxo de blocos → páginas */
  function Doc(rodape) {
    var pags = [], cur = null, y = 0, self = this;
    this.placeholders = [];
    function nova() { cur = []; pags.push(cur); y = MT; }
    nova();
    this.y = function () { return y; };
    this.cabe = function (h) { if (y + h > H - MB - 6) nova(); };
    this.el = function (s) { cur.push(s); };
    this.texto = function (x, yy, s, o) {
      o = o || {};
      cur.push('<text x="' + x.toFixed(2) + '" y="' + yy.toFixed(2) + '" font-size="' + (o.corpo || CORPO) + '"' + (o.negrito ? ' font-weight="bold"' : "") + (o.al ? ' text-anchor="' + o.al + '"' : "") + ' fill="' + (o.cor || COR.texto) + '">' + esc(s) + "</text>");
    };
    /* parágrafo; trechos [{t, falta}] — o que falta sai em vermelho (um trecho por linha quando falta, para a cor não vazar) */
    this.par = function (trechos, o) {
      o = o || {}; var corpo = o.corpo || CORPO, x = o.x || ML, max = o.max || LARG;
      if (typeof trechos === "string") trechos = [{ t: trechos }];
      var linhas = [], l = [], lw = 0, sp = largura(" ", corpo);
      trechos.forEach(function (tr) {
        if (tr.falta) self.placeholders.push(tr.t);
        txt(tr.t).split(/\s+/).filter(Boolean).forEach(function (p) {
          var w = largura(p, corpo, o.negrito);
          if (lw + (l.length ? sp : 0) + w > max && l.length) { linhas.push(l); l = []; lw = 0; }
          lw += (l.length ? sp : 0) + w; l.push({ p: p, falta: !!tr.falta });
        });
      });
      if (l.length) linhas.push(l);
      /* uma <text> por TRECHO da mesma cor (não por palavra): o espaço entre as palavras é o da fonte, na tela e no PDF.
         Por palavra, a tela (outra fonte que a Helvetica do PDF) colava as palavras ("Fornecimentoe instalação") */
      linhas.forEach(function (ln) {
        self.cabe(LH); var xx = x, k = 0;
        while (k < ln.length) {
          var f = ln[k].falta, run = [];
          while (k < ln.length && ln[k].falta === f) { run.push(ln[k].p); k++; }
          var t = run.join(" ");
          self.texto(xx, y, t, { corpo: corpo, negrito: o.negrito, cor: f ? COR.falta : (o.cor || COR.texto) });
          xx += largura(t, corpo, o.negrito) + sp;
        }
        y += o.lh || LH;
      });
    };
    this.espaco = function (h) { y += h; };
    this.secao = function (n, t) { self.cabe(14); y += 3; self.texto(ML, y, n + ". " + t.toUpperCase(), { corpo: 3.6, negrito: true, cor: COR.titulo }); y += 1.6; cur.push('<line x1="' + ML + '" y1="' + y.toFixed(2) + '" x2="' + (W - MR) + '" y2="' + y.toFixed(2) + '" stroke="' + COR.linha + '" stroke-width="0.3"/>'); y += 4.6; };
    /* tabela: colunas [{t, w, al}] ; linhas [[{t, falta, negrito}]] */
    this.tabela = function (cols, linhas, o) {
      o = o || {}; var corpo = CORPO_P, lh = 4.4;
      function lin(cells, cab) {
        var alturas = cells.map(function (c, i) { return quebrar(c.t, corpo, cols[i].w - 2, cab || c.negrito).length; }), n = Math.max.apply(null, alturas), h = n * lh + 1.6;
        self.cabe(h);
        if (cab) cur.push('<rect x="' + ML + '" y="' + (y - 3.4).toFixed(2) + '" width="' + LARG + '" height="' + h.toFixed(2) + '" fill="' + COR.faixa + '"/>');
        var xx = ML;
        cells.forEach(function (c, i) {
          var ls = quebrar(c.t, corpo, cols[i].w - 2, cab || c.negrito), al = cols[i].al || "start", x0 = al === "end" ? xx + cols[i].w - 1 : xx + 1;
          if (c.falta) self.placeholders.push(c.t);
          ls.forEach(function (s, k) { self.texto(x0, y + k * lh, s, { corpo: corpo, negrito: cab || c.negrito, al: al === "end" ? "end" : null, cor: c.falta ? COR.falta : (cab ? COR.titulo : COR.texto) }); });
          xx += cols[i].w;
        });
        y += h - 1.6 + 1.2;
        cur.push('<line x1="' + ML + '" y1="' + (y - 2.6).toFixed(2) + '" x2="' + (W - MR) + '" y2="' + (y - 2.6).toFixed(2) + '" stroke="' + COR.linha + '" stroke-width="0.2"/>');
        y += 1.4;
      }
      lin(cols.map(function (c) { return { t: c.t }; }), true);
      linhas.forEach(function (l) { lin(l, false); });
    };
    this.paginas = function () {
      var n = pags.length;
      return pags.map(function (p, i) {
        var rod = '<line x1="' + ML + '" y1="' + (H - MB + 4) + '" x2="' + (W - MR) + '" y2="' + (H - MB + 4) + '" stroke="' + COR.linha + '" stroke-width="0.3"/>' +
          '<text x="' + ML + '" y="' + (H - MB + 8.5) + '" font-size="2.5" fill="' + COR.fraco + '">' + esc(rodape) + "</text>" +
          '<text x="' + (W - MR) + '" y="' + (H - MB + 8.5) + '" font-size="2.5" text-anchor="end" fill="' + COR.fraco + '">Página ' + (i + 1) + " de " + n + "</text>";
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" font-family="Helvetica, Arial, sans-serif"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>' + p.join("") + rod + "</svg>";
      });
    };
  }

  function falta(rotulo) { return { t: "[" + rotulo + "]", falta: true }; }
  function ou(v, rotulo) { return txt(v).trim() ? { t: txt(v).trim() } : falta(rotulo); }

  function montar(orc, d) {
    d = d || {}; orc = orc || { bancadas: [], pendencias: [] };
    var E = d.empresa || {}, P = d.param || orc.param || {}, nomeE = txt(E.nome).trim();
    var doc = new Doc((nomeE || "[NOME DA EMPRESA]") + (txt(d.numero) ? " · Proposta " + d.numero : ""));
    if (!nomeE) doc.placeholders.push("[NOME DA EMPRESA]");
    /* CABEÇALHO: logo à esquerda, dados da empresa à direita */
    var temLogo = !!(d.logo && d.logo.jpeg && d.logo.pxW > 0 && d.logo.pxH > 0), lw = 0, lh = 0;
    if (temLogo) { var r = d.logo.pxW / d.logo.pxH; lh = 18; lw = Math.min(48, lh * r); lh = lw / r; doc.logoCaixa = { x: ML, y: MT - 2, w: lw, h: lh }; if (d.logo.dataURI) doc.el('<image x="' + ML + '" y="' + (MT - 2) + '" width="' + lw.toFixed(2) + '" height="' + lh.toFixed(2) + '" href="' + esc(d.logo.dataURI) + '"/>'); }
    else { doc.el('<rect x="' + ML + '" y="' + (MT - 2) + '" width="40" height="16" fill="none" stroke="' + COR.falta + '" stroke-width="0.3" stroke-dasharray="1.2 0.8"/>'); doc.texto(ML + 20, MT + 7, "[LOGO]", { corpo: 3, al: "middle", cor: COR.falta }); doc.placeholders.push("[LOGO]"); }
    var xr = W - MR, yy = MT + 1;
    doc.texto(xr, yy, nomeE || "[NOME DA EMPRESA]", { corpo: 4.2, negrito: true, al: "end", cor: nomeE ? COR.titulo : COR.falta }); yy += 5;
    var cnpj = txt(E.cnpj).trim(); doc.texto(xr, yy, cnpj ? "CNPJ " + cnpj : "[CNPJ]", { corpo: 2.9, al: "end", cor: cnpj ? COR.fraco : COR.falta }); if (!cnpj) doc.placeholders.push("[CNPJ]"); yy += 4;
    var end = [txt(E.endereco).trim(), txt(E.cidade).trim()].filter(Boolean).join(" – ");
    doc.texto(xr, yy, end || "[ENDEREÇO]", { corpo: 2.9, al: "end", cor: end ? COR.fraco : COR.falta }); if (!end) doc.placeholders.push("[ENDEREÇO]"); yy += 4;
    var cont = [txt(E.telefone || E.whatsapp).trim(), txt(E.email).trim(), txt(E.site).trim()].filter(Boolean).join(" · ") || txt(E.contato).trim();
    doc.texto(xr, yy, cont || "[TELEFONE · E-MAIL]", { corpo: 2.9, al: "end", cor: cont ? COR.fraco : COR.falta }); if (!cont) doc.placeholders.push("[TELEFONE · E-MAIL]");
    doc.espaco(Math.max(lh, 20) + 4);
    doc.el('<rect x="' + ML + '" y="' + (doc.y() - 5.5).toFixed(2) + '" width="' + LARG + '" height="11" fill="' + COR.faixa + '"/>');
    doc.texto(ML + 3, doc.y() + 1.3, "PROPOSTA COMERCIAL" + (d.numero ? " Nº " + d.numero : ""), { corpo: 4.4, negrito: true });
    doc.texto(W - MR - 3, doc.y() + 1.3, dataBR(d.data || ""), { corpo: 3.2, al: "end", cor: COR.fraco });
    doc.espaco(11);
    doc.par([{ t: "Cliente:" }, ou(d.cliente, "CLIENTE")]);
    doc.par([{ t: "Obra:" }, ou(d.obra, "OBRA")].concat(txt(d.local).trim() ? [{ t: "— " + d.local }] : []));

    /* 1. OBJETO */
    doc.secao(1, "Objeto");
    var nB = orc.bancadas.length;
    doc.par("Fornecimento" + (P.instalacaoModo === "nao" ? "" : " e instalação") + " de " + (nB === 1 ? "1 bancada" : nB + " bancadas") + " em pedra, conforme as medidas e o projeto executivo de marmoraria anexo a esta proposta (" + br(orc.m2 || 0) + " m² de pedra).");

    /* 2. BANCADAS E VALORES */
    doc.secao(2, "Bancadas e valores");
    orc.bancadas.forEach(function (b) {
      doc.cabe(20);
      doc.par([{ t: b.rotulo + " — " + (b.nome || "Bancada") + ": " + b.pedra + ", " + br(b.L) + " × " + br(b.P) + " m, e = " + Math.round(b.e * 1000) + " mm, borda " + txt(b.borda).toLowerCase() + (b.cubas.length ? "; " + b.cubas.length + " cuba(s)" : "") + "." }], { negrito: true, corpo: 3.1 });
      doc.tabela([{ t: "Item", w: 82 }, { t: "Un", w: 12 }, { t: "Quant.", w: 20, al: "end" }, { t: "Unitário", w: 30, al: "end" }, { t: "Total", w: 30, al: "end" }],
        b.itens.map(function (it) {
          var q = it.quantidadeCobrada != null ? it.quantidadeCobrada : it.quantidade;
          return [{ t: it.descricao + (it.obs ? " (" + it.obs + ")" : "") }, { t: un(it.unidade) }, { t: br(q, it.unidade === "un" ? 0 : 2) },
            it.pendente ? { t: "[PREÇO]", falta: true } : { t: brl(it.unitario) }, it.pendente ? { t: "[PREÇO]", falta: true } : { t: brl(it.total) }];
        }).concat([[{ t: "Total da bancada " + b.rotulo, negrito: true }, { t: "" }, { t: "" }, { t: "" }, b.itens.some(function (i) { return i.pendente; }) ? { t: "[TOTAL]", falta: true } : { t: brl(b.total), negrito: true }]]));
      doc.espaco(2);
    });

    /* 3. RESUMO */
    doc.secao(3, "Resumo do investimento");
    var linhasR = [[{ t: "Bancadas" }, { t: brl(orc.subtotal) }]];
    if (orc.frete && orc.frete.modo !== "nao") linhasR.push([{ t: orc.frete.texto || "Frete" }, orc.frete.texto ? { t: brl(orc.frete.valor) } : falta("FRETE")]);
    if (orc.bdiValor) linhasR.push([{ t: "Margem / BDI (" + br(orc.bdiPct, 1) + " %)" }, { t: brl(orc.bdiValor) }]);
    if (orc.descontoValor) linhasR.push([{ t: "Desconto (" + br(orc.descontoPct, 1) + " %)" }, { t: "− " + brl(orc.descontoValor) }]);
    linhasR.push([{ t: "VALOR TOTAL DA PROPOSTA", negrito: true }, orc.completo ? { t: brl(orc.total), negrito: true } : falta("TOTAL — faltam preços")]);
    doc.tabela([{ t: "Descrição", w: 130 }, { t: "Valor", w: 44, al: "end" }], linhasR);

    /* 4. CONDIÇÕES COMERCIAIS */
    doc.secao(4, "Condições comerciais");
    doc.par([{ t: "Pagamento:" }, ou(P.pagamento, "CONDIÇÕES DE PAGAMENTO")]);
    var val = Number(P.validadeDias), pz = Number(P.prazoDias);
    doc.par([{ t: "Validade desta proposta:" }, val > 0 ? { t: val + " dias a partir da data de emissão." } : falta("VALIDADE (dias)")]);
    doc.par([{ t: "Prazo de entrega:" }, pz > 0 ? { t: pz + " dias após a aprovação da proposta e a conferência das medidas no local." } : falta("PRAZO (dias)")]);

    /* 5. INCLUSO E NÃO INCLUSO */
    doc.secao(5, "Incluso e não incluso");
    doc.par("Incluso: corte, acabamentos, furos e recortes descritos acima" + (P.instalacaoModo === "nao" ? "" : ", transporte e instalação") + ".");
    var nao = arr(orc.naoIncluso).slice();
    nao.push("pontos de água e esgoto, gabinete/marcenaria e acabamentos de parede e piso");
    doc.par("Não incluso: " + nao.join("; ").toLowerCase() + ".");

    /* 6. OBSERVAÇÕES */
    doc.secao(6, "Observações");
    doc.par("As medidas finais são conferidas no local antes do corte; diferença de medida em relação ao projeto anexo é informada ao cliente antes da produção. Pedra natural tem variação de cor e veio entre chapas.");
    if (txt(P.observacoes).trim()) doc.par(txt(P.observacoes).trim());

    /* 7. ACEITE */
    doc.secao(7, "Aceite");
    doc.par("De acordo com esta proposta e com o projeto executivo anexo.");
    doc.cabe(26); doc.espaco(16);
    var y1 = doc.y();
    doc.el('<line x1="' + ML + '" y1="' + y1 + '" x2="' + (ML + 76) + '" y2="' + y1 + '" stroke="' + COR.texto + '" stroke-width="0.3"/>');
    doc.el('<line x1="' + (W - MR - 76) + '" y1="' + y1 + '" x2="' + (W - MR) + '" y2="' + y1 + '" stroke="' + COR.texto + '" stroke-width="0.3"/>');
    doc.texto(ML + 38, y1 + 4.5, nomeE || "[NOME DA EMPRESA]", { corpo: 2.9, al: "middle", cor: nomeE ? COR.texto : COR.falta });
    doc.texto(W - MR - 38, y1 + 4.5, txt(d.cliente).trim() || "[CLIENTE]", { corpo: 2.9, al: "middle", cor: txt(d.cliente).trim() ? COR.texto : COR.falta });
    doc.espaco(10);
    if (d.credito) doc.par(d.credito, { corpo: 2.4, cor: COR.fraco });
    return doc;
  }

  function paginas(orc, d) { return montar(orc, d).paginas(); }
  /* texto 0–255 a partir de base64 (o JPEG do logo) */
  function b64bin(b64) {
    var s = txt(b64).replace(/^data:[^,]*,/, "");
    if (typeof global.atob === "function") return global.atob(s);
    if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("binary");
    return "";
  }
  function pdf(orc, d, anexos) {
    d = d || {};
    var doc = montar(orc, d), pags = doc.paginas(), S = SP();
    if (!S) return { ok: false, motivo: "o gerador de PDF (js/svgpdf.js) não carregou" };
    var imagens = [];
    if (doc.logoCaixa && d.logo) {
      var bin = d.logo.jpeg; if (bin && !/^\xff\xd8/.test(bin)) bin = b64bin(bin);
      if (bin && /^\xff\xd8/.test(bin)) imagens.push({ pagina: 0, x: doc.logoCaixa.x, y: doc.logoCaixa.y, w: doc.logoCaixa.w, h: doc.logoCaixa.h, jpeg: bin, pxW: d.logo.pxW, pxH: d.logo.pxH });
    }
    var todas = pags.concat(arr(anexos));
    var bytes = S.pdf(todas, { titulo: "Proposta " + txt(d.numero) + " — " + txt(d.empresa && d.empresa.nome), imagens: imagens });
    return { ok: true, bytes: bytes, paginasProposta: pags.length, paginas: todas.length, placeholders: doc.placeholders.filter(function (p, i, a) { return a.indexOf(p) === i; }), svgs: pags, logo: imagens.length > 0 };
  }

  var MarmProposta = { paginas: paginas, pdf: pdf, montar: montar, b64bin: b64bin, COR: COR };
  global.MarmProposta = MarmProposta;
  if (typeof module !== "undefined" && module.exports) module.exports = MarmProposta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

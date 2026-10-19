/* =====================================================================
 * hiddocumentos.js — GERAR DOCUMENTOS do hidrossanitário e da climatização: um lugar só, um clique.
 * Motor PURO, ES5, sem DOM, Node-testável. A tela é o js/hiddocumentosui.js.
 *
 * Pedido do Rogério (17/10/2026): "a parte única para gerar o memorial de cálculo, motor completo, certinho. A parte
 * que vai gerar o manual para execução, quero que tenha link, que tenha tudo."
 *
 *   HidDocumentos.gerar(entrada, opcoes) → { ok, memorial, descritivo, manual, pendencias, links, avisos }
 *     entrada  { resultado (HidDimensionar.calcular), clima (ClimDimensionar.calcular | null),
 *                pecas (HidPecas.listaMaterial), icones { nome: data URL }, pranchas [{ id, numero, titulo }],
 *                arquivoPranchas ("projeto-hidrossanitario.pdf"), portal { url } }
 *     opcoes   obra, responsavel, documento { numero, revisao, data }, revisoes, empresa, logos, local,
 *              contratanteAssinatura, links (registro conferido; padrão: global HidDocLinks)
 *   cada documento: { ok, titulo, html, nome (arquivo sem extensão), secoes, pendencias, links }
 *   HidDocumentos.verificarLinks(html) → { internos, quebrados, externos }   (o teste e a tela usam)
 *
 * O QUE CADA UM É:
 *   · MEMORIAL DE CÁLCULO ÚNICO — o js/hidmemorial.js com a climatização como seção do MESMO documento.
 *   · MEMORIAL DESCRITIVO — o que se compra e se instala, por DESEMPENHO (memória "memorial por especificação de
 *     desempenho": capacidade exigida + produto de referência; fabricante livre desde que declare atender), com a
 *     peça e o ícone, a norma do produto e o link da ficha técnica.
 *   · MANUAL DE EXECUÇÃO E USO — sequência, material, ferramentas, cuidados, testes, checklist com assinatura por
 *     etapa, por sistema e por ambiente; links internos (item ↔ prancha) e externos (ficha do fabricante, norma no
 *     catálogo da ABNT, vídeo oficial); QR do portal da obra; uso e manutenção do proprietário; garantia.
 *
 * ⚠ LINK EXTERNO SÓ CONFERIDO. A URL só vira link quando o registro conferido (js/hiddoclinks.js, gerado pelo
 *   tools/hid-doc-links.js, que abre cada uma e grava o status) a aprova. O que falhou ou não foi conferido sai como
 *   texto e entra na lista de pendências do documento — link quebrado em documento de obra é pior que nenhum.
 * ⚠ A CAPA NUNCA DIZ "ATENDE" COM PENDÊNCIA (decisão de 17/10/2026, revisão F7 C1), em nenhum dos três.
 * ⚠ NENHUM VALOR DE NORMA AQUI. Os números vêm do resultado, da ficha da peça ou do manual do fabricante (com
 *   página) — test-hid-sem-numero-magico varre este arquivo.
 * Teste: node tools/test-hid-documentos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { return null; } }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function objs(v) { return arr(v).filter(function (x) { return x && typeof x === "object" && !Array.isArray(x); }); }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }   // hid:ok texto/código de caractere e corte de frase (apresentação)
  function unicos(l) { var o = []; arr(l).forEach(function (x) { if (x != null && x !== "" && o.indexOf(x) < 0) o.push(x); }); return o; }
  function listaPt(l) { l = arr(l); return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : (l[0] || ""); }
  /* nome de arquivo e âncora sem acento ("casa-terrea", não "casa-t-rrea") */
  function idSeguro(s) { var x = txt(s); if (x.normalize) x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }   // hid:ok texto/código de caractere e corte de frase (apresentação)

  /* hid:fisica-inicio — APRESENTAÇÃO, não física: cores, tamanhos de letra e de ícone, casas decimais e margens de
     página. Nenhum valor de norma (os números técnicos chegam prontos do resultado, da ficha da peça ou do manual). */
  var COR = { azul: "#00406A", marrom: "#6F5F48", verde: "#3F7818", areia: "#A89868", falha: "#a3352b", alerta: "#9a5b12" };
  var LADO_ICONE = 52, QR_PX = 118, CASAS_M = 2;
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? CASAS_M : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? "−" : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function dataTxt(d) {
    if (d instanceof Date && !isNaN(d.getTime())) return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear();
    if (typeof d === "string" && d.trim()) return d.trim();
    return dataTxt(new Date());
  }
  function css(meta) {
    var A = COR.azul, mb = "font: 7.3pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    function q(s) { return '"' + txt(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
    return "@page { size: A4; margin: 20mm 12mm 17mm 16mm;" +
      " @top-left { content: " + q(meta.topoE) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @top-right { content: " + q(meta.topoD) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @bottom-left { content: " + q(meta.rodE) + "; " + mb + " vertical-align: top; padding-top: 3mm; }" +
      " @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " vertical-align: top; padding-top: 3mm; } }" +
      "@page :first { @top-left { content: none; border: none; } @top-right { content: none; border: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font: 9.2pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 190mm; margin: 10mm auto; padding: 0 8mm; } .sec, .sumario { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 19pt; font-weight: 600; margin: 2mm 0; color: " + A + "; }" +
      "h2 { font-size: 13.5pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid " + A + "; color: #1d2733; break-after: avoid; }" +
      "h2 .num { color: " + A + "; margin-right: 3mm; }" +
      "h3 { font-size: 10.6pt; font-weight: 600; margin: 5mm 0 2mm; color: " + A + "; break-after: avoid; }" +
      "h4 { font-size: 9.6pt; font-weight: 600; margin: 3.5mm 0 1.5mm; color: #2c3a48; break-after: avoid; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul, ol { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.9mm; }" +
      ".sec { break-before: page; } .sec.segue { break-before: auto; margin-top: 7mm; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 7.9pt; line-height: 1.3; }" +
      "table.t caption { caption-side: top; text-align: left; font-size: 8.1pt; padding-bottom: 1.2mm; }" +
      "table.t th { background: #e6edf3; color: " + A + "; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1mm 1.3mm; vertical-align: bottom; }" +
      "table.t td { border: 0.5pt solid #ccd5de; padding: 0.85mm 1.3mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.linha-alerta td { background: #fbf6ea; } table.t tr.linha-falha td { background: #fbefed; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; }" +
      "table.t td.ico { width: 15mm; text-align: center; vertical-align: middle; background: #fff !important; padding: 0.5mm; } img.peca-ico { width: 14mm; height: 14mm; object-fit: contain; display: block; margin: 0 auto; }" +
      "table.chk td.caixa-sel { white-space: nowrap; width: 20mm; } table.chk td.ass { width: 34mm; } table.chk td.dt { width: 18mm; }" +
      "table.curta { break-inside: avoid; } thead { display: table-header-group; } tr { break-inside: avoid; } caption { break-after: avoid; }" +
      ".nota { font-size: 7.6pt; color: #4a5664; } .fonte { font-size: 7.4pt; color: #5b6774; } .pend { color: " + COR.alerta + "; font-weight: 600; } .falha { color: " + COR.falha + "; font-weight: 700; } .ok { color: " + COR.verde + "; font-weight: 700; } .ph { color: #b3261e; font-weight: 600; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid " + A + "; background: #f3f6f9; padding: 2.2mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; }" +
      ".caixa.alerta { border-left-color: #c27c2c; background: #fbf6ea; } .caixa.erro { border-left-color: " + COR.falha + "; background: #fbf1ef; }" +
      "a { color: #0b5cad; text-decoration: underline; text-decoration-thickness: 0.5pt; } a.volta { font-size: 7.4pt; text-decoration: none; } .links-pr { font-size: 7.8pt; margin: 0 0 2mm; }" +
      ".capa { height: 258mm; display: flex; flex-direction: column; break-after: page; }" +
      ".capa-logos { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; } .logo-box { flex: 1; text-align: center; } .logo-box img { max-height: 24mm; max-width: 56mm; }" +
      ".logo-ph { height: 20mm; display: flex; align-items: center; justify-content: center; border: 0.6pt dashed #c9b9a0; font-size: 10pt; } .logo-rot { font-size: 6.8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #8a7a62; margin-top: 1.2mm; }" +
      ".capa-faixa { display: flex; height: 1.3mm; margin: 5mm 0 7mm; } .capa-faixa span { display: block; height: 100%; } .capa-faixa .f1 { flex: 6; background: " + A + "; } .capa-faixa .f2 { flex: 2; background: " + COR.areia + "; } .capa-faixa .f3 { flex: 1; background: " + COR.verde + "; }" +
      ".capa-tit .sobre { font-size: 8.5pt; letter-spacing: 0.2em; color: " + COR.marrom + "; font-weight: 600; } .capa-tit .sub { color: #4a5664; font-size: 9.6pt; } .capa-vazio { flex: 1; }" +
      ".capa-qr { display: flex; gap: 4mm; align-items: center; margin: 4mm 0; font-size: 8pt; } .capa-qr svg { width: 26mm; height: 26mm; }" +
      ".capa-ficha, .capa-rev { width: 100%; border-collapse: collapse; font-size: 8.1pt; margin-top: 1.5mm; } .capa-ficha td { border-bottom: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; vertical-align: top; } .capa-ficha td:first-child { width: 26%; color: #5b6774; } .capa-ficha td.sit-falha { background: #fbefed; color: " + COR.falha + "; }" +
      ".capa-rev caption { text-align: left; font-weight: 600; color: " + A + "; font-size: 8.2pt; padding: 2mm 0 1mm; } .capa-rev th { background: #e6edf3; border: 0.5pt solid #b8c4d0; padding: 1mm 1.5mm; text-align: left; font-weight: 600; } .capa-rev td { border: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; }" +
      ".sumario { break-after: page; } ol.sum { list-style: none; padding: 0; margin: 3mm 0 6mm; font-size: 10pt; } ol.sum li { padding: 1.3mm 0; border-bottom: 0.5pt solid #e1e7ed; } ol.sum ol { list-style: none; padding-left: 9mm; margin: 1mm 0 0; font-size: 8.6pt; } ol.sum ol li { border: none; padding: 0.5mm 0; }" +
      "ol.sum .sn { display: inline-block; width: 9mm; color: " + A + "; font-weight: 600; } ol.sum a { color: #1d2733; text-decoration: none; }" +
      ".assin-grade { display: flex; justify-content: space-between; gap: 6mm; margin: 20mm 0 6mm; break-inside: avoid; } .assin { flex: 1; text-align: center; font-size: 8.2pt; } .assin-linha { border-top: 0.7pt solid #1d2733; margin-bottom: 2mm; } .assin-tit { margin-top: 1.5mm; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: " + COR.marrom + "; }" +
      ".libera { display: flex; gap: 5mm; margin: 2mm 0 5mm; font-size: 8pt; break-inside: avoid; } .libera div { flex: 1; border-top: 0.6pt solid #1d2733; padding-top: 1mm; margin-top: 9mm; }";
  }
  /* hid:fisica-fim */

  /* ================================================================ LINKS */
  function Links(reg) { this.reg = reg || dep("HidDocLinks", "./hiddoclinks.js"); this.usados = []; this.falhos = []; this.alvos = {}; this.refs = {}; }
  /* URL externa: link só se o registro conferido aprovar a URL (sem o fragmento #page) */
  /* endereço do portal da OBRA: informado na tela (https), muda por obra — não passa pelo registro; o roteiro de
     qualidade confere a resposta dele no PDF gerado */
  Links.prototype.portal = function (url) { if (this.usados.indexOf(url) < 0) this.usados.push(url); return '<a href="' + esc(url) + '">' + esc(url) + "</a>"; };
  /* URL com espaço ou acento (manual da Midea) vai codificada no href — o Word e o leitor de PDF não aceitam espaço cru */
  function hrefSeguro(u) { try { return /[\s\u0080-\uffff]/.test(u) ? encodeURI(decodeURI(u)) : u; } catch (e) { return u; } }
  Links.prototype.ok = function (url) { var R = this.reg; return !!(R && R.ok && R.ok(txt(url).split("#")[0])); };
  Links.prototype.ext = function (url, texto, onde) {
    url = txt(url).trim();
    if (!url) return esc(texto);
    if (this.ok(url)) { if (this.usados.indexOf(url) < 0) this.usados.push(url); return '<a href="' + esc(hrefSeguro(url)) + '">' + esc(texto) + "</a>"; }
    if (!this.falhos.some(function (f) { return f.url === url; })) this.falhos.push({ url: url, onde: onde || texto, motivo: this.reg ? "link não conferido ou fora do ar no registro de links" : "registro de links não carregado" });
    return esc(texto) + ' <span class="pend">(link não conferido)</span>';
  };
  /* arquivo que vai junto (o PDF das pranchas na mesma pasta): link relativo, não precisa de conferência na internet */
  Links.prototype.arquivo = function (arq, pagina, texto) { return '<a href="' + esc(arq + (pagina ? "#page=" + pagina : "")) + '">' + esc(texto) + "</a>"; };
  Links.prototype.alvo = function (id) { this.alvos[id] = 1; return id; };
  Links.prototype.int = function (id, html) { this.refs[id] = 1; return '<a href="#' + esc(id) + '">' + html + "</a>"; };

  /* ================================================================ SITUAÇÃO (a mesma regra do memorial) */
  function situacao(r, k) {
    var vs = objs(r && r.verificacoes), rep = vs.filter(function (v) { return v.status === "reprovado"; }).length, pen = arr(r && r.pendencias).length + vs.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = objs(r && r.avisos).filter(function (a) { return a.gravidade === "erro"; }).length, fix = !!(r && r.fixture === true);
    if (k) {
      rep += objs(k.verificacoes).filter(function (v) { return v.status === "reprovado"; }).length + objs(k.avisos).filter(function (a) { return a.gravidade === "erro"; }).length;
      pen += arr(k.pendencias).length + objs(k.verificacoes).filter(function (v) { return v.status === "pendente"; }).length;
      if (k.fixture === true) fix = true;
    }
    if (fix) return { ok: false, rep: rep, pen: pen, txt: '<span class="falha">NÃO É NORMA</span> — calculado com tabelas de teste' };
    if (rep || erros) return { ok: false, rep: rep, pen: pen, txt: '<span class="falha">Não atende</span> — ' + [rep ? rep + " verificação(ões) reprovada(s)" : "", erros ? erros + " aviso(s) de erro" : "", pen ? pen + " pendência(s)" : ""].filter(Boolean).join("; ") + " (ver o memorial de cálculo)." };
    if (pen || !(r && r.ok === true) || (k && k.ok !== true)) return { ok: false, rep: rep, pen: pen, txt: '<span class="falha">Não verificado — ' + (pen ? pen + " pendência(s)" : "situação incompleta") + "</span> (ver o memorial de cálculo)." };
    return { ok: true, rep: 0, pen: 0, txt: '<span class="ok">Atende — todas as verificações desta emissão atendem</span>.' };
  }

  /* ================================================================ DOCUMENTO (capa, sumário, seções) */
  function Doc(c, tipo, titulo, sub) { this.c = c; this.tipo = tipo; this.titulo = titulo; this.sub = sub; this.secs = []; this.nTab = 0; this.pend = []; this.L = new Links(c.op.links); }
  Doc.prototype.tab = function (legenda, cab, linhas, op) {
    op = op || {};
    if (!linhas.length) return op.vazio ? '<p class="nota">' + op.vazio + "</p>" : "";
    this.nTab++;
    return '<table class="t' + (op.classe ? " " + op.classe : "") + (linhas.length <= 8 ? " curta" : "") + '"' + (op.id ? ' id="' + esc(op.id) + '"' : "") + "><caption><b>Tabela " + this.nTab + "</b> — " + legenda + "</caption><thead><tr>" +
      cab.map(function (h) { return typeof h === "string" ? "<th>" + h + "</th>" : '<th class="' + h.c + '">' + h.t + "</th>"; }).join("") + "</tr></thead><tbody>" + linhas.join("") + "</tbody></table>";
  };
  Doc.prototype.secao = function (id, titulo, html, op) { this.secs.push({ id: id, titulo: titulo, html: html, sub: arr(op && op.sub), segue: !!(op && op.segue) }); };
  Doc.prototype.pendencia = function (texto, motivo) { if (!this.pend.some(function (p) { return p.texto === texto; })) this.pend.push({ texto: texto, motivo: motivo || "" }); };
  function td(h, cls) { return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + (h == null ? "" : h) + "</td>"; }
  function trw(cells, cls, id) { return "<tr" + (id ? ' id="' + esc(id) + '"' : "") + (cls ? ' class="' + cls + '"' : "") + ">" + cells.join("") + "</tr>"; }
  function caixa(h, tipo) { return '<div class="caixa' + (tipo ? " " + tipo : "") + '">' + h + "</div>"; }
  function ph(v, rot) { var s = txt(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rot) + "]</span>"; }
  function logoBox(src, rot) { var ok = typeof src === "string" && /^(data:image\/(png|jpe?g|svg\+xml|webp)[;,]|https?:\/\/)/i.test(src); return '<div class="logo-box">' + (ok ? '<img src="' + esc(src) + '" alt="' + esc(rot) + '">' : '<div class="logo-ph"><span class="ph">[LOGO]</span></div>') + '<div class="logo-rot">' + esc(rot) + "</div></div>"; }
  Doc.prototype.capa = function () {
    var c = this.c, op = c.op, ob = c.ob, rp = c.rp, lg = obj(op.logos), revs = c.revs, g = c.sit;
    var qr = "";
    if (c.portal) {
      var Q = dep("QR", "./qr.js"), svg = Q && Q.svg ? Q.svg(c.portal, { tamanhoPx: QR_PX, correcao: "M" }) : "";
      qr = '<div class="capa-qr">' + (svg || "") + "<div><b>Portal da obra</b><br>" + this.L.portal(c.portal) + "<br><span class=\"nota\">Pranchas, modelo 3D e documentos atualizados.</span></div></div>";
    }
    return '<section class="capa" id="capa"><div class="capa-logos">' + logoBox(lg.ra, "Projeto") + logoBox(lg.contratante, "Contratante") + logoBox(lg.proprietario, "Proprietário") + "</div>" +
      '<div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">' + esc(this.tipo) + "</div><h1>" + esc(this.titulo) + " — " + esc(c.obraNome) + '</h1><div class="sub">' + esc(this.sub) + "</div></div>" + qr +
      '<div class="capa-vazio"></div><table class="capa-ficha"><tbody>' +
      "<tr><td>Documento</td><td><b>" + ph(c.num, "Nº DO DOCUMENTO") + " " + esc(c.rev) + "</b> — " + esc(c.data) + "</td></tr>" +
      "<tr><td>Obra</td><td>" + ph(ob.nome, "OBRA") + "</td></tr>" +
      "<tr><td>Endereço</td><td>" + ph([ob.endereco, ob.cidade].filter(Boolean).join(" — "), "ENDEREÇO") + "</td></tr>" +
      "<tr><td>Proprietário</td><td>" + ph(ob.proprietario || ob.cliente, "PROPRIETÁRIO") + "</td></tr>" +
      "<tr><td>Responsável técnico</td><td>" + ph(rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº") + " — " + ph(rp.empresa, "EMPRESA") + "</td></tr>" +
      "<tr><td>Situação do cálculo</td><td" + (g.ok ? "" : ' class="sit-falha"') + ">" + g.txt + "</td></tr></tbody></table>" +
      '<table class="capa-rev"><caption>Quadro de revisões</caption><thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Por</th></tr></thead><tbody>' +
      revs.map(function (x) { return "<tr><td>" + esc(x.rev) + "</td><td>" + esc(x.data) + "</td><td>" + esc(x.descricao) + "</td><td>" + esc(x.por || "") + "</td></tr>"; }).join("") + "</tbody></table></section>";
  };
  Doc.prototype.html = function () {
    var self = this, c = this.c;
    var sum = '<section class="sumario" id="sumario"><h2>Sumário</h2><ol class="sum">' + this.secs.map(function (s, i) {
      return '<li><a href="#' + esc(s.id) + '"><span class="sn">' + (i + 1) + "</span>" + esc(s.titulo) + "</a>" +
        (s.sub.length ? "<ol>" + s.sub.map(function (u, j) { return '<li><a href="#' + esc(u.id) + '">' + (i + 1) + "." + (j + 1) + " " + esc(u.titulo) + "</a></li>"; }).join("") + "</ol>" : "") + "</li>";
    }).join("") + "</ol></section>";
    var corpo = this.secs.map(function (s, i) {
      return '<section class="sec' + (s.segue ? " segue" : "") + '" id="' + esc(s.id) + '"><h2><span class="num">' + (i + 1) + "</span>" + esc(s.titulo) + "</h2>" + s.html.replace(/@@N@@/g, String(i + 1)) + '<p class="nota"><a class="volta" href="#sumario">↑ voltar ao sumário</a></p></section>';
    }).join("");
    var titulo = this.titulo + " — " + c.obraNome;
    var meta = { topoE: c.obraNome + " — " + this.titulo, topoD: this.tipo.charAt(0) + this.tipo.slice(1).toLowerCase() + " " + (c.num ? c.num + " " : "") + c.rev, rodE: [c.rp.empresa || "RA Engenharia", c.rp.nome ? "Resp. técnico: " + c.rp.nome + (c.rp.crea ? " — " + (c.rp.conselho || "CREA") + " " + c.rp.crea : "") : ""].filter(Boolean).join(" · ") };
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — HidDocumentos"><title>' + esc(titulo) + "</title><style>" + css(meta) + "</style></head><body>" +
      this.capa() + sum + corpo + "</body></html>";
    var ver = verificarLinks(html);
    return { ok: true, titulo: titulo, html: html, secoes: this.secs.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; }), tabelas: this.nTab,
             pendencias: this.pend.concat(this.L.falhos.map(function (f) { return { texto: "Link não conferido: " + f.url, motivo: f.onde + " — " + f.motivo }; })),
             links: { externos: this.L.usados.slice(), falhos: this.L.falhos.slice(), internos: ver.internos, quebrados: ver.quebrados } };
  };
  /* a seção de pendências do documento entra por último, depois de tudo o que pode gerar pendência */
  Doc.prototype.secaoPendencias = function (id, extra) {
    var self = this, todas = this.pend.concat(arr(extra));
    var falhos = this.L.falhos.map(function (f) { return { texto: "Link não conferido: " + f.url, motivo: f.onde + " — " + f.motivo }; });
    todas = todas.concat(falhos);
    this.secao(id, "Pendências deste documento", todas.length ? "<p>Os itens abaixo não têm fonte no acervo ou dependem de informação que não está no modelo. Não foram escritos de memória: ficam pendentes até a fonte existir.</p>" +
      this.tab("Pendências", ["#", "Item", "Motivo"], todas.map(function (p, i) { return trw([td(String(i + 1)), td(esc(p.texto)), td(esc(p.motivo))], "linha-alerta"); }), { classe: "compacta" }) : "<p>Nenhuma pendência.</p>");
    void self;
  };
  Doc.prototype.secaoTermo = function (id, declaracao) {
    var c = this.c, rp = c.rp, ca = obj(c.op.contratanteAssinatura);
    this.secao(id, "Responsabilidade técnica", "<p>" + declaracao + "</p>" +
      '<div class="assin-grade"><div class="assin"><div class="assin-linha"></div><div><b>' + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</b></div><div>" + ph(rp.titulo, "TÍTULO") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº") + '</div><div class="assin-tit">Responsável técnico</div></div>' +
      '<div class="assin"><div class="assin-linha"></div><div><b>' + ph(ca.nome, "NOME") + "</b></div><div>" + ph(ca.empresa || c.ob.contratante, "CONTRATANTE") + '</div><div class="assin-tit">Contratante</div></div></div>' +
      '<p style="text-align:center">' + ph(c.op.local, "LOCAL") + ", " + esc(c.data) + ".</p>");
  };

  /* ================================================================ CONTEXTO */
  var NOME_SIS = { agua_fria: "Água fria", agua_quente: "Água quente", esgoto: "Esgoto sanitário e ventilação", pluvial: "Águas pluviais", incendio: "Incêndio", tratamento_fossa: "Tratamento de esgoto (fossa, filtro e sumidouro)", tratamento_ete: "Tratamento de esgoto (ETE)", tratamento_eta: "Tratamento de água (ETA)", tratamento_outro: "Tratamento", industrial: "Fluidos industriais", climatizacao: "Climatização" };
  /* sistema do manual → sistemas do biminst (para filtrar a lista de material) e folhas das pranchas */
  var BIMSIS = { agua_fria: ["agua_fria"], agua_quente: ["agua_quente"], esgoto: ["esgoto", "ventilacao"], pluvial: ["pluvial"], incendio: ["incendio"], industrial: ["industrial", "ar_comprimido", "vapor", "gas", "oleo"], climatizacao: ["frigorigeno", "dreno"] };
  var FOLHA_SIS = { agua_fria: /^planta-af|esquema|^iso|detalhes/, agua_quente: /^planta-aq|^iso/, esgoto: /^planta-es|esquema|^iso|detalhes/, pluvial: /^planta-ap/, incendio: /^planta-in/, tratamento_fossa: /^tratamento/, tratamento_ete: /^tratamento/, tratamento_eta: /^tratamento/, tratamento_outro: /^tratamento/, industrial: /^planta-(ind|ar|vp|gas|ol)/, climatizacao: /^clim|^planta-cl/,
    /* ambiente: as plantas de água e esgoto, o esquema e os detalhes (o isométrico de cada conjunto já está na lista do sistema) */
    ambiente: /^planta-(af|es)|esquema|detalhes/ };
  function contexto(en, op) {
    op = op || {};
    var r = obj(en.resultado), k = en.clima && typeof en.clima === "object" && Array.isArray(en.clima.ambientes) ? en.clima : null;
    var ob = obj(op.obra), rp = obj(op.responsavel), dc = obj(op.documento);
    var revs = objs(op.revisoes); if (!revs.length) revs = [{ rev: dc.revisao || "R00", data: dataTxt(dc.data), descricao: "Emissão inicial" }];
    var HM = dep("HidManual", "./hidmanual.js"), presentes = HM ? HM.presentes(r, { clima: !!k }) : [];
    var portal = txt(obj(en.portal).url).trim();
    return { r: r, k: k, op: op, ob: ob, rp: rp, num: txt(dc.numero), rev: dc.revisao || "R00", data: dataTxt(dc.data), revs: revs, obraNome: ob.nome ? txt(ob.nome) : "[OBRA]",
             sis: presentes, pecas: objs(en.pecas), icones: obj(en.icones), pranchas: objs(en.pranchas), arqPranchas: txt(en.arquivoPranchas) || "projeto-hidrossanitario.pdf",
             portal: /^https:\/\/\S+$/i.test(portal) ? portal : "", sit: situacao(r, k), HM: HM, PC: dep("HidPecas", "./hidpecas.js"), CAT: dep("HidCatalogo", "./hidcatalogo.js") };
  }
  function nomeSis(k) { return NOME_SIS[k] || k; }
  function subtitulo(c) { var x = listaPt(c.sis.map(function (k, i) { var n = nomeSis(k); return i ? n.charAt(0).toLowerCase() + n.slice(1) : n; })); return x || "Instalações prediais"; }
  function pecasDoSistema(c, k) {
    var ss = BIMSIS[k];
    if (!ss) return [];
    return c.pecas.filter(function (l) { return ss.indexOf(l.sistema) >= 0; });
  }
  function loucas(c) { return c.pecas.filter(function (l) { return l.classe === "louca" || !l.sistema; }); }
  function folhasDo(c, k) { var re = FOLHA_SIS[k]; return re ? c.pranchas.filter(function (f) { return re.test(txt(f.id)); }) : []; }
  /* a ficha técnica da peça no catálogo do fabricante: URL + página (fragmento #page do PDF) */
  function linksFicha(c, D, l, onde) {
    var fc = l.ficha && c.PC ? c.PC.ficha(l.ficha) : null, fabs = fc ? objs(obj(fc.comercial).fabricante) : [], out = [];
    fabs.forEach(function (x) {
      var it = c.CAT && c.CAT.porCodigo ? c.CAT.porCodigo(x.fabricante, x.codigo) : null, f = it && it.fonte ? it.fonte : null;
      if (f && f.url) { var pg = f.pagina || x.pagina; out.push(D.L.ext(f.url + (pg ? "#page=" + pg : ""), x.fabricante + " " + x.codigo + (pg ? ", p. " + pg : ""), onde)); }
    });
    return unicos(out).join("<br>");
  }
  function iconeImg(c, l) {
    var src = l.icone ? c.icones[l.icone] : null;
    return src && /^data:image\//.test(src) ? '<img class="peca-ico" src="' + esc(src) + '" alt="' + esc(l.descricao) + '">' : '<span class="nota">sem ícone</span>';
  }
  function qtdTxt(l) { return fin(l.quantidade) ? br(l.quantidade, l.unidade === "m" ? CASAS_M : 0) + " " + esc(l.unidade || "") : "—"; }
  function tabelaMaterial(c, D, linhas, legenda, onde, comLink) {
    return D.tab(legenda, ["Peça", "Descrição", { t: "Qtd.", c: "n" }, "Código do fabricante", "Norma do produto", "Ficha técnica"],
      linhas.map(function (l) {
        if (!l.norma) D.pendencia("Norma do produto: " + txt(l.descricao), l.normaPendente ? "o catálogo do fabricante não imprime a norma do produto" : "peça sem ficha técnica no catálogo nativo");
        return trw([td(iconeImg(c, l), "ico"), td("<b>" + esc(l.descricao) + "</b>" + (l.produto ? "<br><span class=\"nota\">" + esc(l.produto) + "</span>" : "")), td(qtdTxt(l), "n"),
          td(arr(l.fabricante).length ? arr(l.fabricante).map(esc).join("<br>") : "—"), td(l.norma ? esc(l.norma) : '<span class="pend">não consta no catálogo</span>'),
          td(comLink !== false ? (linksFicha(c, D, l, onde) || "—") : "—")]);
      }), { classe: "compacta", vazio: "Sem peças deste sistema na lista de material do modelo." });
  }
  function itensHtml(D, itens) {
    return itens.length ? "<ul>" + itens.map(function (it) {
      if (it.pend) { D.pendencia(it.texto, it.pend); return '<li><span class="pend">PENDENTE</span> — ' + esc(it.texto) + ' <span class="nota">(' + esc(it.pend) + ")</span></li>"; }
      return "<li>" + esc(it.texto) + ' <span class="fonte">[' + it.fontes.map(function (f) { return f.url ? D.L.ext(f.url, f.ref, "fonte de instrução") : esc(f.ref); }).join("; ") + "]</span></li>";
    }).join("") + "</ul>" : '<p class="nota">Não se aplica a este sistema.</p>';
  }
  /* ⚠ O catálogo da ABNT não tem mais endereço fixo por norma (conferido em 18/10/2026: o pnm.aspx?ID responde "LINK
     EXPIRADO" e o pnm.aspx?Q= vence em ~10 min). O link vai ao catálogo e o texto diz o número e a EDIÇÃO VIGENTE,
     conferidos na ficha da ABNT; norma que a ABNT dá como fora de vigor sai dita, nunca como vigente. */
  function normaLink(D, nome) {
    var R = D.L.reg, u = R && R.norma ? R.norma(nome) : null;
    if (!u) return esc(nome);
    return "ABNT NBR " + esc(u.edicao || nome) + " (" + D.L.ext(u.url, "catálogo ABNT", "catálogo da ABNT: " + nome) + (u.emVigor === false ? ', <span class="pend">fora de vigor no catálogo da ABNT</span>' : "") + ")";
  }

  /* ================================================================ MEMORIAL DE CÁLCULO ÚNICO */
  function memorial(c, en) {
    var M = dep("HidMemorial", "./hidmemorial.js");
    if (!M || !M.gerar) return { ok: false, motivo: "o módulo do memorial (js/hidmemorial.js) não carregou", html: "" };
    var op = {}; Object.keys(c.op).forEach(function (k) { op[k] = c.op[k]; });
    op.clima = c.k; op.materiais = c.pecas; op.icones = c.icones; op.links = op.links || dep("HidDocLinks", "./hiddoclinks.js");
    var g = M.gerar(c.r, op);
    if (!g || !g.ok) return { ok: false, motivo: (g && g.motivo) || "não foi possível gerar", html: "" };
    var ver = verificarLinks(g.html);
    g.nome = "memorial-de-calculo-" + idSeguro(c.obraNome) + "-" + c.rev;
    g.pendencias = arr(g.naoAbrangidos).map(function (x) { return { texto: x, motivo: "não abrangido nesta emissão" }; });
    g.links = { externos: ver.externos, internos: ver.internos, quebrados: ver.quebrados, falhos: [] };
    void en;
    return g;
  }

  /* ================================================================ MEMORIAL DESCRITIVO */
  function descricaoSistema(c, k) {
    var r = c.r, S = obj(r.sistemas), h = "";
    function dns(trs) { return unicos(objs(trs).map(function (t) { return t.dn; }).filter(fin)).sort(function (a, b) { return a - b; }); }
    function mats(trs) { return unicos(objs(trs).map(function (t) { return t.material; })); }
    if (k === "agua_fria" && S.agua_fria) {
      var af = S.agua_fria, d = dns(af.trechos);
      var tAl = obj(r.entradaResumo).alimentacao || (af.alimentacao && af.alimentacao.tipo) || "", ROT_AL = { rede_publica: "rede pública", reservatorio: "reservatório" };
      h += "<p>Alimentação: <b>" + esc(ROT_AL[tAl] || tAl || "conforme o memorial de cálculo") + "</b>. Rede com " + objs(af.trechos).length + " trecho(s) e " + objs(af.pontos).length + " ponto(s) de utilização; diâmetros de " + (d.length ? "DN " + d[0] + " a DN " + d[d.length - 1] : "—") + " (resultado do cálculo).</p>";
    } else if (k === "esgoto" && S.esgoto) {
      var es = S.esgoto, d2 = dns(es.trechos);
      h += "<p>Rede de esgoto primário e secundário com " + objs(es.trechos).length + " trecho(s) e " + objs(es.pontos).length + " ponto(s) de contribuição; diâmetros de " + (d2.length ? "DN " + d2[0] + " a DN " + d2[d2.length - 1] : "—") + "; ventilação conforme o memorial de cálculo. Esgoto e águas pluviais em redes separadas.</p>";
    } else if (k === "agua_quente" && S.agua_quente) {
      h += "<p>Rede de água quente com " + objs(S.agua_quente.trechos).length + " trecho(s). Material e aquecimento conforme o memorial de cálculo e as pranchas.</p>";
    } else if (k === "pluvial" && S.pluvial) {
      h += "<p>Captação e condução das águas pluviais com " + objs(S.pluvial.trechos).length + " condutor(es) calculado(s).</p>";
    } else if (k === "incendio" && S.incendio) {
      var en = obj(S.incendio.enquadramento);
      h += "<p>Medidas de segurança contra incêndio do enquadramento " + esc(en.divisao || "—") + " (área " + br(en.area_m2, 0) + " m², altura " + br(en.altura_m, CASAS_M) + " m), conforme o memorial de cálculo.</p>";
    } else if (/^tratamento/.test(k) && S.tratamento) {
      h += "<p>Unidades de tratamento: " + esc(listaPt(objs(S.tratamento.unidades).map(function (u) { return u.nome || u.tipo; }))) + ".</p>";
    } else if (k === "climatizacao" && c.k) {
      var cl = objs(c.k.ambientes).filter(function (a) { return a.climatizar !== false; });
      h += "<p>Climatização de " + cl.length + " ambiente(s), com o equipamento escolhido pelo cálculo de carga térmica (ver o memorial de cálculo).</p>";
    }
    return h || "<p>Sistema conforme o memorial de cálculo e as pranchas.</p>";
  }
  function requisitos(l) {
    var co = objs(l.coeficientes).filter(function (x) { return /press|Di\b|vaz|DN m/i.test(x.rotulo); });
    var p = [];
    if (l.material) p.push("material " + esc(l.material));
    if (fin(l.dn)) p.push("DN " + esc(l.dn));
    co.forEach(function (x) { p.push(esc(x.rotulo) + ": " + (x.pendente ? '<span class="pend">' + esc(x.texto) + "</span>" : esc(x.texto) + (x.fonte ? ' <span class="fonte">(' + esc(x.fonte) + ")</span>" : ""))); });
    return p.length ? p.join("<br>") : "conforme a norma do produto";
  }
  function descritivo(c) {
    var D = new Doc(c, "MEMORIAL DESCRITIVO", "Especificação de materiais e desempenho", subtitulo(c));
    D.secao("dsc-objeto", "Objeto e documentos do projeto",
      "<p>Este memorial descreve os sistemas de instalações da obra <b>" + ph(c.ob.nome, "OBRA") + "</b> e especifica, por desempenho, os materiais e as peças a fornecer e instalar. Os diâmetros, as vazões e as verificações estão no memorial de cálculo; o traçado, nas pranchas; a execução e os testes, no manual de execução e uso.</p>" +
      D.tab("Documentos do projeto", ["Documento", "Conteúdo"], [
        trw([td("Memorial de cálculo " + esc(c.num) + " " + esc(c.rev)), td("Dimensionamento, verificações, decisões automáticas e pendências")]),
        trw([td("Pranchas (" + c.pranchas.length + " folha(s))"), td(c.pranchas.length ? c.pranchas.map(function (f) { return esc(f.numero) + " — " + esc(f.titulo); }).join("<br>") : '<span class="pend">pranchas não geradas nesta emissão</span>')]),
        trw([td("Manual de execução e uso"), td("Sequência, material, ferramentas, testes, checklists, uso e manutenção")])
      ], { classe: "compacta" }));
    D.secao("dsc-criterio", "Critério de especificação",
      "<p>Os produtos são especificados <b>por desempenho</b>: para cada componente, o requisito exigido (material, diâmetro, pressão de serviço e demais características que o cálculo usou), a norma do produto e um produto de referência com o código do fabricante. Pode ser empregado produto de outro fabricante, desde que o fornecedor declare atender à mesma norma e ao mesmo desempenho; a troca é registrada e aprovada pelo responsável técnico antes da compra.</p>" +
      "<p>Os coeficientes que o cálculo usou para cada peça estão no memorial de cálculo, com a fonte. A ficha técnica do produto de referência está ligada em cada linha das tabelas.</p>");
    c.sis.forEach(function (k, i) {
      var ls = pecasDoSistema(c, k);
      var h = "<h3>@@N@@.1 Descrição</h3>" + descricaoSistema(c, k) + "<h3>@@N@@.2 Especificação por desempenho</h3>";
      if (ls.length) h += D.tab("Especificação por desempenho — " + esc(nomeSis(k)), ["Peça", "Componente", "Requisito de desempenho", "Norma do produto", "Referência (código)", "Ficha técnica"],
        ls.map(function (l) {
          if (!l.norma) D.pendencia("Norma do produto: " + txt(l.descricao), l.normaPendente ? "o catálogo do fabricante não imprime a norma do produto" : "peça sem ficha técnica no catálogo nativo");
          return trw([td(iconeImg(c, l), "ico"), td("<b>" + esc(l.descricao) + "</b><br><span class=\"nota\">" + qtdTxt(l) + "</span>"), td(requisitos(l)), td(l.norma ? esc(l.norma) : '<span class="pend">não consta no catálogo</span>'),
            td(arr(l.fabricante).length ? arr(l.fabricante).map(esc).join("<br>") : "—"), td(linksFicha(c, D, l, "descritivo: " + txt(l.descricao)) || "—")]);
        }), { classe: "compacta" });
      else if (k === "climatizacao" && c.k) {
        var eq = objs(c.k.ambientes).filter(function (a) { return a.escolha && a.escolha.equipamento; });
        h += D.tab("Equipamentos de climatização", ["Ambiente", "Tipo", "Capacidade exigida", "Referência (evaporadora / condensadora)"],
          eq.map(function (a) { var e = a.escolha, q = e.equipamento; return trw([td(esc(a.nome)), td(esc(e.tipo)), td(br(obj(a.carga).requerida_BTUh, 0) + " BTU/h (carga térmica requerida); capacidade nominal de referência " + br(q.capacidade_BTUh, 0) + " BTU/h"), td(esc(q.fabricante) + " " + esc(q.evaporadora) + " / " + esc(q.condensadora))]); }),
          { classe: "compacta", vazio: "Nenhum equipamento escolhido pelo cálculo (ver pendências no memorial de cálculo)." });
      } else h += '<p class="nota">O modelo não trouxe peças deste sistema na lista de material.</p>';
      D.secao("dsc-sis-" + idSeguro(k), nomeSis(k), h, { segue: i > 0 });
    });
    var lc = loucas(c);
    D.secao("dsc-aparelhos", "Louças, metais e equipamentos", lc.length ? "<p>Aparelhos sanitários, metais e equipamentos do modelo, com o produto de referência do tipo escolhido.</p>" + tabelaMaterial(c, D, lc, "Louças, metais e equipamentos", "descritivo: aparelhos") : "<p>O modelo não tem louças, metais nem equipamentos com ficha.</p>");
    D.secao("dsc-material", "Lista completa de material", c.pecas.length ? tabelaMaterial(c, D, c.pecas, "Lista de material do modelo", "descritivo: lista de material") : '<p><span class="pend">Lista de material não informada</span> (o modelo não trouxe o quantitativo).</p>');
    if (!c.pecas.length) D.pendencia("Lista de material", "o modelo não trouxe o quantitativo de peças");
    D.secaoPendencias("dsc-pendencias");
    D.secaoTermo("dsc-termo", "O responsável técnico declara que as especificações acima correspondem ao projeto. Produto equivalente só substitui o de referência com a declaração do fornecedor de atendimento à mesma norma e ao mesmo desempenho, aprovada antes da compra.");
    var g = D.html();
    g.nome = "memorial-descritivo-" + idSeguro(c.obraNome) + "-" + c.rev;
    return g;
  }

  /* ================================================================ MANUAL DE EXECUÇÃO E USO */
  /* ambientes: pelas decisões automáticas ("Ambiente X (a, b, c)" + kits); sem elas, os aparelhos do cálculo num grupo só */
  var ROT_AP = { lavatorio: "lavatório", bacia_caixa_acoplada: "bacia com caixa acoplada", bacia_valvula: "bacia com válvula", pia_cozinha: "pia de cozinha", tanque: "tanque", chuveiro: "chuveiro", maquina_lavar_roupa: "máquina de lavar roupa", mictorio: "mictório" };
  function ambientes(c) {
    var da = objs(c.r.decisoesAutomaticas), out = [];
    da.forEach(function (x) {
      var m = /^Ambiente\s+(\S+)\s*\(([^)]*)\)/.exec(txt(x.elemento));
      if (m) out.push({ id: m[1], nome: "Ambiente " + m[1], aparelhos: m[2].split(/\s*,\s*/).filter(Boolean), decisoes: objs(x.decisoes).map(function (d) { return txt(d.texto); }), pendencias: objs(x.pendencias).map(function (p) { return txt(p.motivo || p.chave); }) });
    });
    var kits = {}; da.forEach(function (x) { var m = /^Kit de (\S+)\s+—\s+(.*)$/.exec(txt(x.elemento)); if (m) kits[m[1]] = { nome: m[2], decisoes: objs(x.decisoes).map(function (d) { return txt(d.texto); }), pendencias: objs(x.pendencias).map(function (p) { return txt(p.motivo || p.chave); }) }; });
    var af = obj(obj(c.r.sistemas).agua_fria), es = obj(obj(c.r.sistemas).esgoto), ap = {};
    objs(af.pontos).forEach(function (p) { if (p.famInst) { ap[p.famInst] = ap[p.famInst] || { id: p.famInst, aparelho: p.aparelho }; ap[p.famInst].af = p; } });
    objs(es.pontos).forEach(function (p) { if (p.famInst) { ap[p.famInst] = ap[p.famInst] || { id: p.famInst, aparelho: p.aparelho }; ap[p.famInst].es = p; } });
    if (!out.length) {
      var ids = Object.keys(ap);
      if (ids.length) out.push({ id: "aparelhos", nome: "Aparelhos do modelo", aparelhos: ids, decisoes: [], pendencias: [], semAmbiente: true });
    }
    out.forEach(function (a, i) {
      a.itens = a.aparelhos.map(function (id) { var base = ap[id] || ap[String(id).replace(/-vd$/, "")] || { id: id }; return { id: id, aparelho: base.aparelho || "", af: base.af || ap[id + "-vd"] && ap[id + "-vd"].af || null, es: base.es || null, kit: kits[id] || null }; });
      /* nome legível: o id do ambiente ("ambtan") é interno; o leitor da obra reconhece o cômodo pelos aparelhos */
      if (!a.semAmbiente) {
        var tipos = unicos(a.itens.map(function (x) { return x.kit ? x.kit.nome.split(" (")[0].split(" com ")[0].split(" / ")[0].toLowerCase() : (ROT_AP[x.aparelho] || txt(x.aparelho).replace(/_/g, " ")); }).filter(Boolean));
        a.nome = "Ambiente " + (i + 1) + (tipos.length ? " — " + listaPt(tipos) : "");
      }
    });
    return out;
  }
  function linksPranchas(c, D, k, de) {
    var fs = folhasDo(c, k);
    if (!fs.length) return "";
    fs.forEach(function (f) { var a = "pr-" + idSeguro(f.id); D.voltas = D.voltas || {}; (D.voltas[a] = D.voltas[a] || []).push(de); });
    return '<p class="links-pr">Pranchas deste item: ' + fs.map(function (f) { return D.L.int("pr-" + idSeguro(f.id), esc(f.numero || f.id) + " — " + esc(f.titulo)); }).join(" · ") + "</p>";
  }
  function checklist(D, legenda, etapas) {
    var linhas = [];
    etapas.forEach(function (e) {
      e.itens.forEach(function (it, j) {
        linhas.push(trw([td(j === 0 ? "<b>" + esc(e.nome) + "</b>" : ""), td(esc(it)), td("☐ Sim&nbsp; ☐ Não", "caixa-sel"), td("", "ass"), td("", "dt")]));
      });
    });
    return D.tab(legenda, ["Etapa", "Item verificado", "Conforme", "Responsável (nome e assinatura)", "Data"], linhas, { classe: "chk compacta" });
  }
  function primeiraFrase(s) { var t = txt(s); var i = t.search(/[.;:](\s|$)/); return (i > 0 && i < 170 ? t.slice(0, i) : t.slice(0, 170)).replace(/\s+$/, ""); }   // hid:ok texto/código de caractere e corte de frase (apresentação)
  function manual(c) {
    var HM = c.HM, D = new Doc(c, "MANUAL DE EXECUÇÃO E USO", "Manual de execução e uso", subtitulo(c));
    if (!HM || !HM.partes) return { ok: false, motivo: "o módulo do manual (js/hidmanual.js) não carregou", html: "" };
    var P = HM.partes(c.r, { clima: !!c.k, materiais: c.op.materiaisProjeto });
    var R = D.L.reg;
    /* 1 apresentação */
    var ap = "<p>Este manual orienta a execução, os testes, a inspeção e o uso das instalações da obra <b>" + ph(c.ob.nome, "OBRA") + "</b>. Cada instrução traz a fonte (documento e página). Instrução de fabricante vale para o produto dele e não substitui a norma; o que o acervo não cobre aparece como <span class=\"pend\">PENDENTE</span>, com o motivo, e não foi escrito de memória.</p>" +
      "<p>Os textos sublinhados são links: os internos levam à prancha, ao checklist ou ao item citado (e voltam); os externos abrem a ficha técnica do fabricante, a página da norma no catálogo da ABNT ou o vídeo oficial de instalação, conferidos em " + esc((R && R.conferidoEm) || "—") + ".</p>";
    if (!c.sit.ok) ap += caixa("<b>Situação do cálculo: " + c.sit.txt.replace(/<[^>]+>/g, "") + "</b> Este manual traz procedimentos de execução e de uso; <b>não afirma conformidade</b> do projeto. Os itens não verificados estão no memorial de cálculo.", "alerta");
    if (c.portal) ap += "<p>Portal da obra (pranchas, modelo 3D e documentos atualizados): " + D.L.portal(c.portal) + ".</p>";
    D.secao("man-apresentacao", "Apresentação e como usar este manual", ap);
    /* 2 sistemas */
    P.sistemas.forEach(function (S) {
      var k = S.chave, id = "man-" + idSeguro(k), h = "", n = "@@N@@";
      h += linksPranchas(c, D, k, { id: id + "-montagem", titulo: S.nome + " — sequência de execução" });
      h += '<h3 id="' + id + '-montagem">' + n + ".1 Sequência de execução</h3>" + itensHtml(D, S.secoes.filter(function (s) { return s.id === "montagem"; })[0].itens);
      var ls = pecasDoSistema(c, k);
      h += '<h3 id="' + id + '-material">' + n + ".2 Material</h3>" + (ls.length ? tabelaMaterial(c, D, ls, "Material — " + esc(S.nome), "manual: material de " + S.nome) : (k === "climatizacao" && c.k ? "<p>Equipamentos e linhas conforme o memorial descritivo.</p>" : '<p class="nota">O modelo não trouxe peças deste sistema na lista de material.</p>'));
      h += '<h3 id="' + id + '-ferramentas">' + n + ".3 Ferramentas e insumos</h3>" + itensHtml(D, S.ferramentas);
      h += '<h3 id="' + id + '-cuidados">' + n + ".4 Cuidados por material</h3>" + (S.materiais.length ? S.materiais.map(function (m) { return "<p><b>" + esc(m.nome) + "</b></p>" + itensHtml(D, m.itens); }).join("") : '<p class="nota">Sem material definido.</p>');
      var tes = S.secoes.filter(function (s) { return s.id === "teste"; })[0].itens;
      h += '<h3 id="' + id + '-testes">' + n + ".5 Testes</h3>" + itensHtml(D, tes);
      var lim = S.secoes.filter(function (s) { return s.id === "limpeza"; })[0].itens;
      if (lim.length) h += '<h3 id="' + id + '-limpeza">' + n + ".6 Limpeza e desinfecção</h3>" + itensHtml(D, lim);
      /* normas do sistema no catálogo da ABNT */
      var ns = R && R.normasDoSistema ? R.normasDoSistema(k) : [];
      if (ns.length) h += '<p class="nota">Normas deste sistema (edição vigente conferida na ficha da ABNT; no catálogo, buscar pelo número): ' + ns.map(function (x) { return normaLink(D, x); }).join(" · ") + "</p>";
      var vid = R && R.videos ? R.videos(k) : [];
      if (vid.length) h += '<p class="nota">Vídeos oficiais de instalação: ' + vid.map(function (v) { return D.L.ext(v.url, v.fabricante + " — " + v.titulo, "vídeo oficial (" + nomeSis(k) + ")"); }).join(" · ") + "</p>";
      /* checklist com assinatura */
      var etapas = [{ nome: "Recebimento", itens: ["Material conforme a especificação (material, DN, classe e norma do produto)", "Armazenamento conforme a sequência de execução (item " + n + ".1)"] }];
      var mont = S.secoes.filter(function (s) { return s.id === "montagem"; })[0].itens.filter(function (x) { return !x.pend; });
      if (mont.length) etapas.push({ nome: "Execução", itens: mont.map(function (x) { return primeiraFrase(x.texto); }) });
      var tst = tes.filter(function (x) { return !x.pend; });
      if (tst.length) etapas.push({ nome: "Testes", itens: tst.map(function (x) { return primeiraFrase(x.texto); }) });
      etapas.push({ nome: "Liberação", itens: ["Pendências da etapa resolvidas ou registradas", "Registro fotográfico e formulário de teste arquivados"] });
      h += '<h3 id="' + id + '-checklist">' + n + ".7 Checklist de inspeção</h3>" + checklist(D, "Checklist de inspeção — " + esc(S.nome), etapas) +
        '<div class="libera"><div>Executante</div><div>Fiscalização / responsável técnico</div><div>Data</div></div>';
      D.secao("man-sis-" + idSeguro(k), S.nome, h);
      D.secs[D.secs.length - 1].sub = [{ id: id + "-montagem", titulo: "Sequência de execução" }, { id: id + "-material", titulo: "Material" }, { id: id + "-ferramentas", titulo: "Ferramentas e insumos" }, { id: id + "-cuidados", titulo: "Cuidados por material" }, { id: id + "-testes", titulo: "Testes" }, { id: id + "-checklist", titulo: "Checklist de inspeção" }];
    });
    /* 3 por ambiente */
    var ams = ambientes(c), ha = "";
    if (ams.length) {
      ha += "<p>Para cada ambiente: os aparelhos, os pontos de água e de esgoto que o cálculo definiu e o checklist de entrega. As decisões automáticas (alturas dos pontos, caixa sifonada, ventilação, esperas) trazem a fonte no memorial de cálculo.</p>";
      ams.forEach(function (a, i) {
        var id = "amb-" + idSeguro(a.id);
        ha += '<h3 id="' + id + '">@@N@@.' + (i + 1) + " " + esc(a.nome) + "</h3>" + linksPranchas(c, D, "ambiente", { id: id, titulo: a.nome });
        ha += D.tab("Aparelhos e pontos — " + esc(a.nome), ["Aparelho", "Água fria (ponto)", "Esgoto (ponto)", "Kit e decisões"],
          a.itens.map(function (x) {
            var pa = x.af, pe = x.es;
            return trw([td("<b>" + esc(x.id) + "</b>" + (x.aparelho ? "<br><span class=\"nota\">" + esc(x.aparelho) + "</span>" : "")),
              td(pa ? (fin(pa.cota) ? "cota " + br(pa.cota, CASAS_M) + " m" : "") + (fin(pa.vazao_ls) ? (fin(pa.cota) ? "<br>" : "") + "vazão " + br(pa.vazao_ls, CASAS_M) + " L/s" : "") || "—" : "—"),
              td(pe ? (fin(pe.uhc) ? "UHC " + br(pe.uhc, 0) : "") + (fin(pe.dnMin) ? " · DN mín. " + br(pe.dnMin, 0) : "") || "—" : "—"),
              td(x.kit ? esc(x.kit.nome) + (x.kit.pendencias.length ? '<br><span class="pend">' + x.kit.pendencias.length + " pendência(s)</span>" : "") : "—")]);
          }), { classe: "compacta" });
        if (a.decisoes.length) ha += "<p><b>Decisões do ambiente:</b></p><ul>" + a.decisoes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
        a.pendencias.forEach(function (p) { D.pendencia(a.nome + ": " + p, "decisão automática sem fonte (ver o memorial de cálculo)"); });
        ha += checklist(D, "Checklist de entrega — " + esc(a.nome), [{ nome: "Pontos", itens: ["Pontos de água e de esgoto na posição e na altura das pranchas", "Caixa sifonada, ralos e ventilação conforme as pranchas"] },
          { nome: "Testes", itens: ["Estanqueidade da água fria do ambiente executada antes do revestimento (seção de testes da água fria)", "Ensaio do esgoto do ambiente executado (seção de testes do esgoto)"] },
          { nome: "Aparelhos", itens: ["Aparelhos fixados, vedados e funcionando", "Sifões e fechos hídricos cheios na entrega"] }]) + '<div class="libera"><div>Executante</div><div>Fiscalização / responsável técnico</div><div>Data</div></div>';
      });
      D.secao("man-ambientes", "Execução por ambiente", ha);
      D.secs[D.secs.length - 1].sub = ams.map(function (a) { return { id: "amb-" + idSeguro(a.id), titulo: a.nome }; });
    }
    /* 4 pranchas e detalhes (alvo dos links e volta) */
    var hp = "";
    if (c.pranchas.length) {
      hp += "<p>As pranchas estão no arquivo <b>" + esc(c.arqPranchas) + "</b>, que acompanha este manual na mesma pasta. Cada folha abaixo abre o PDF na página dela e lista os itens deste manual que remetem a ela.</p>";
      hp += D.tab("Pranchas e detalhes", ["Folha", "Conteúdo", "Abrir", "Itens deste manual que remetem a esta folha"],
        c.pranchas.map(function (f, i) {
          var a = "pr-" + idSeguro(f.id), vs = (D.voltas || {})[a] || [];
          D.L.alvo(a);
          return trw([td("<b>" + esc(f.numero || f.id) + "</b>"), td(esc(f.titulo)), td(D.L.arquivo(c.arqPranchas, i + 1, "abrir a folha")), td(vs.length ? vs.map(function (v) { return D.L.int(v.id, esc(v.titulo)); }).join("<br>") : "—")], "", a);
        }), { classe: "compacta" });
    } else { hp += '<p><span class="pend">Pranchas não geradas nesta emissão.</span> Gere as pranchas para os links da execução apontarem para as folhas.</p>'; D.pendencia("Pranchas do projeto", "as pranchas não foram geradas junto com este manual"); }
    D.secao("man-pranchas", "Pranchas e detalhes", hp);
    /* 5 uso e manutenção (proprietário) */
    var hu = "<p>Instruções ao proprietário e ao usuário, por sistema. Registre cada manutenção no quadro do fim desta seção; a gestão da manutenção da edificação segue a " + normaLink(D, "ABNT NBR 5674") + " e o conteúdo deste manual, a " + normaLink(D, "ABNT NBR 14037") + ".</p>";
    P.sistemas.forEach(function (S, i) {
      var uso = S.secoes.filter(function (s) { return s.id === "uso"; })[0].itens, man = S.secoes.filter(function (s) { return s.id === "manutencao"; })[0].itens, lim = S.secoes.filter(function (s) { return s.id === "limpeza"; })[0].itens;
      hu += '<h3 id="uso-' + idSeguro(S.chave) + '">@@N@@.' + (i + 1) + " " + esc(S.nome) + "</h3>";
      if (uso.length) hu += "<h4>Uso correto</h4>" + itensHtml(D, uso);
      if (S.proprietario.length) hu += "<h4>Limpeza das caixas e o que não descartar</h4>" + itensHtml(D, S.proprietario);
      if (man.length) hu += "<h4>Manutenção e periodicidade</h4>" + itensHtml(D, man);
      if (lim.length && !man.length) hu += "<h4>Limpeza</h4>" + itensHtml(D, lim);
    });
    var vazias = []; for (var q = 0; q < 8; q++) vazias.push(trw([td(""), td(""), td(""), td(""), td("")]));   // hid:ok linhas em branco do registro (formulário)
    hu += '<h3 id="uso-registro">Registro de manutenção</h3>' + D.tab("Registro de manutenção", ["Data", "Sistema e serviço executado", "Empresa / profissional", "Próxima data", "Assinatura"], vazias, { classe: "chk" });
    D.secao("man-uso", "Uso e manutenção — proprietário", hu);
    /* 6 garantia e responsabilidades */
    var cc = R && R.legal ? R.legal("cc618") : null;
    D.secao("man-garantia", "Garantia e responsabilidades",
      "<p><b>Solidez e segurança.</b> Nos contratos de empreitada de edifícios ou outras construções consideráveis, o empreiteiro de materiais e execução responde, durante o prazo irredutível de cinco anos, pela solidez e segurança do trabalho, em razão dos materiais e do solo (" + (cc ? D.L.ext(cc.url, "Código Civil, Lei 10.406/2002, art. 618", "garantia — Código Civil") : "Código Civil, Lei 10.406/2002, art. 618") + ").</p>" +
      "<p><b>Componentes.</b> Tubos, conexões, louças, metais e equipamentos têm o prazo e as condições do termo de garantia do fabricante, entregue com o produto; os prazos recomendados por sistema estão na " + normaLink(D, "ABNT NBR 17170") + ". A garantia do fabricante pode ser perdida sem a manutenção prevista no manual dele (ver a seção de uso e manutenção).</p>" +
      D.tab("Responsabilidades", ["Parte", "Responsabilidade"], [
        trw([td("<b>Projetista</b>"), td("O projeto e o cálculo, nos termos da ART, com as pendências declaradas no memorial de cálculo.")]),
        trw([td("<b>Construtor / instalador</b>"), td("Executar conforme as pranchas e este manual, fazer e registrar os testes, preencher os checklists e entregar o cadastro como executado (as built).")]),
        trw([td("<b>Proprietário / usuário</b>"), td("Usar e manter conforme este manual e os manuais dos fabricantes e registrar as manutenções no quadro deste manual.")])
      ], { classe: "compacta" }));
    /* 7 fontes e links */
    var fts = {};
    P.sistemas.forEach(function (S) { S.secoes.concat([{ itens: S.ferramentas }, { itens: S.proprietario }]).concat(S.materiais).forEach(function (s) { arr(s.itens).forEach(function (it) { arr(it.fontes).forEach(function (f) { fts[f.id] = f; }); }); }); });
    var lf = Object.keys(fts).map(function (k) { var f = fts[k]; return trw([td(esc(f.doc)), td(esc(f.tipo)), td(f.url ? D.L.ext(f.url, "abrir o documento", "fonte: " + f.doc) : "—")]); });
    D.secao("man-fontes", "Fontes e links", D.tab("Fontes das instruções", ["Documento", "Tipo", "Link"], lf, { classe: "compacta", vazio: "Nenhuma fonte citada." }) +
      (R && R.conferidoEm ? '<p class="nota">Links externos conferidos (resposta do servidor) em ' + esc(R.conferidoEm) + ". Link que não respondeu foi retirado e consta nas pendências.</p>" : ""));
    D.secaoPendencias("man-pendencias");
    D.secaoTermo("man-termo", "O responsável técnico declara que este manual corresponde ao projeto e às fontes indicadas. Os itens pendentes não estão cobertos por esta declaração.");
    var g = D.html();
    g.nome = "manual-execucao-e-uso-" + idSeguro(c.obraNome) + "-" + c.rev;
    g.ambientes = ams.length;
    return g;
  }

  /* ================================================================ VERIFICAR LINKS (internos resolvem; lista os externos) */
  function verificarLinks(html) {
    var h = txt(html), ids = {}, m, re = /\sid="([^"]+)"/g, internos = 0, quebrados = [], externos = [];
    while ((m = re.exec(h))) ids[m[1]] = 1;
    var ra = /<a\s[^>]*href="([^"]*)"/g;
    while ((m = ra.exec(h))) {
      var u = m[1].replace(/&amp;/g, "&");
      if (u.charAt(0) === "#") { internos++; if (!ids[u.slice(1)]) quebrados.push(u); }
      else if (/^https?:/i.test(u)) { if (externos.indexOf(u) < 0) externos.push(u); }
    }
    return { internos: internos, quebrados: quebrados, externos: externos };
  }

  /* ================================================================ GERAR TUDO */
  function gerar(entrada, opcoes) {
    entrada = entrada || {}; opcoes = opcoes || {};
    var r = entrada.resultado;
    if (!r || typeof r !== "object" || !r.sistemas) return { ok: false, motivo: "Dimensione primeiro: sem resultado de cálculo não há documento a gerar.", avisos: [] };
    var c = contexto(entrada, opcoes), out = { ok: true, avisos: [] };
    function tenta(nome, fn) { try { return fn(); } catch (e) { out.avisos.push(nome + ": " + (e && e.message ? e.message : e)); return { ok: false, motivo: (e && e.message) || String(e), html: "" }; } }
    out.memorial = tenta("memorial de cálculo", function () { return memorial(c, entrada); });
    out.descritivo = tenta("memorial descritivo", function () { return descritivo(c); });
    out.manual = tenta("manual", function () { return manual(c); });
    ["memorial", "descritivo", "manual"].forEach(function (k) {
      var d = out[k];
      if (!d || !d.ok) { out.ok = false; out.avisos.push(k + ": " + ((d && d.motivo) || "falhou")); return; }
      if (/\b(undefined|NaN)\b/.test(d.html.replace(/<style[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " "))) out.avisos.push(k + ": o texto tem valor indefinido (defeito do gerador)");
      if (arr(d.links && d.links.quebrados).length) out.avisos.push(k + ": " + d.links.quebrados.length + " link(s) interno(s) sem alvo");
    });
    out.situacao = c.sit;
    out.pendencias = [].concat(arr(out.descritivo && out.descritivo.pendencias), arr(out.manual && out.manual.pendencias));
    out.links = { externos: unicos([].concat(arr(out.memorial.links && out.memorial.links.externos), arr(out.descritivo.links && out.descritivo.links.externos), arr(out.manual.links && out.manual.links.externos))),
                  falhos: [].concat(arr(out.descritivo.links && out.descritivo.links.falhos), arr(out.manual.links && out.manual.links.falhos)) };
    return out;
  }

  var HidDocumentos = { VERSAO: 1, gerar: gerar, verificarLinks: verificarLinks, situacao: situacao, ambientes: function (en) { return ambientes(contexto(en, {})); }, NOME_SIS: NOME_SIS };
  global.HidDocumentos = HidDocumentos;
  if (typeof module !== "undefined" && module.exports) module.exports = HidDocumentos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

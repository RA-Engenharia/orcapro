/* =====================================================================
 * pranchaui.js — o HTML da FOLHA para imprimir (sem estado, sem DOM vivo)
 *
 *   folha(prancha, folha, recursos) → a folha em milímetros (moldura,
 *                                    blocos, coluna e carimbo)
 *   documento(prancha, recursos)    → o documento inteiro com @page no
 *                                    tamanho do papel, pronto para o
 *                                    "Imprimir → Salvar como PDF"
 *
 * `recursos` já vem resolvido pela tela (a foto de cada vista, as imagens
 * do IndexedDB, o logo da empresa): aqui nada é assíncrono.
 * ===================================================================== */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mm(v) { return (+v).toFixed(2) + 'mm'; }
  function abs(x, y, w, h, extra) { return 'position:absolute;left:' + mm(x) + ';top:' + mm(y) + ';width:' + mm(w) + ';height:' + mm(h) + ';' + (extra || ''); }

  /* ---------------------------------------------------------- CARIMBO RA
   * O modelo "RA" (js/prancha.js carimboRA: o gabarito 180 × 115 do
   * escritório, no fator do formato) em SVG: as mesmas primitivas que o DXF
   * desenha. Os campos ligados a parâmetro levam data-pr-param (o editor e
   * as e2e leem). Logos: os DA PRANCHA, senão o da conta. */
  var COR_DESTAQUE = '#00406A';
  var COR_CAMADA = { 'RA-CARIMBO-ROTULO': '#444', 'RA-CARIMBO-DESTAQUE': COR_DESTAQUE };
  function carimboRA(pr, fl, g, rec) {
    var PR = global.Prancha, c = pr.carimbo || {}, k = g.carimbo;
    var daPrancha = (c.logos || []).map(function (ch) { return rec.imagens && rec.imagens[ch]; }).filter(function (s) { return !!s; });
    var logos = daPrancha.length ? daPrancha : (rec.logo ? [rec.logo] : []);
    var L = PR.carimboRA(pr, fl, rec.projeto, rec.empresa, g, { logos: logos.length }), cam = PR.CAMADAS_CARIMBO_RA, A = PR.ALT_MAIUSCULA, s = [];
    function n(v) { return Math.round(v * 1000) / 1000; }
    function pena(c0) { return n((cam[c0] || [0, 0.18])[1]); }
    s.push('<rect x="0" y="0" width="' + n(L.w) + '" height="' + n(L.h) + '" fill="#fff"/>');
    L.logos.forEach(function (b, i) { s.push('<image href="' + esc(logos[i]) + '" x="' + n(b.x) + '" y="' + n(b.y) + '" width="' + n(b.w) + '" height="' + n(b.h) + '" preserveAspectRatio="xMidYMid meet"/>'); });
    L.retangulos.forEach(function (r) { s.push('<rect x="' + n(r.x) + '" y="' + n(r.y) + '" width="' + n(r.w) + '" height="' + n(r.h) + '" fill="none" stroke="#111" stroke-width="' + pena(r.camada) + '"/>'); });
    L.linhas.forEach(function (l) { s.push('<line x1="' + n(l.x1) + '" y1="' + n(l.y1) + '" x2="' + n(l.x2) + '" y2="' + n(l.y2) + '" stroke="' + (l.camada === 'RA-CARIMBO-DESTAQUE' ? COR_DESTAQUE : '#111') + '" stroke-width="' + pena(l.camada) + '"/>'); });
    L.textos.forEach(function (t) {
      s.push('<text x="' + n(t.x) + '" y="' + n(t.y) + '" font-size="' + n(t.h / A) + '" text-anchor="' + (t.al === 'C' ? 'middle' : 'start') + '" fill="' + (COR_CAMADA[t.camada] || '#111') + '"' +
        (t.negrito ? ' font-weight="bold"' : '') + (t.param ? ' data-pr-param="' + t.param + '"' : '') + (t.campo ? ' data-cr="' + t.campo + '"' : '') + '>' + esc(t.s) + '</text>');
    });
    return '<div data-pr-carimbo="RA" style="' + abs(k.x, k.y, k.w, k.h, 'background:#fff') + '"><svg xmlns="http://www.w3.org/2000/svg" width="' + mm(L.w) + '" height="' + mm(L.h) + '" viewBox="0 0 ' + n(L.w) + ' ' + n(L.h) + '" style="display:block;overflow:visible;white-space:pre;font-family:Arial,Helvetica,sans-serif">' + s.join('') + '</svg></div>';
  }

  function carimbo(pr, fl, g, rec) {
    if (global.Prancha && global.Prancha.modeloCarimbo && global.Prancha.modeloCarimbo(pr) === 'RA' && global.Prancha.carimboRA) return carimboRA(pr, fl, g, rec || {});
    var c = pr.carimbo || {}, k = g.carimbo, total = (pr.folhas || []).length;
    /* sem os dados na prancha, os do cadastro da conta (rec.empresa = Empresa.dados()) */
    var E = (rec && rec.empresa) || {}, cResp = c.responsavel || E.responsavel || '';
    var cReg = c.registro || (global.Prancha && global.Prancha.fmtRegistro ? global.Prancha.fmtRegistro(E.crea, c.titulo || E.titulo) : '');
    /* P8 — CARIMBO PARAMETRIZADO: os rótulos leem os parâmetros da folha (js/prancha.js
       parametrosFolha, nomes em PT-BR). Sem parâmetro preenchido, sai o carimbo de antes. */
    var PR = global.Prancha, pm = (PR && PR.mapaParametros) ? PR.mapaParametros(pr, fl, rec.projeto) : null;
    var revP = (PR && PR.revisoesNaFolha && rec.projeto) ? PR.revisoesNaFolha(fl, rec.projeto).map(function (r) { return [r.numero, r.descricao, r.data]; }) : [];
    var revs = (revP.length ? revP : (c.revisoes || [])).slice(-3).map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
    }).join('');
    var fs = Math.max(5.2, Math.min(7.4, k.w / 30));
    /* ⚠ os logos DA PRANCHA vêm antes do logo da conta: a prancha que a RA assina, aberta na conta da
       construtora, sairia só com o logo da construtora — e o nome de quem projetou sumia do carimbo */
    var logos = (c.logos || []).map(function (ch) { return rec.imagens && rec.imagens[ch]; }).filter(function (s) { return !!s; });
    if (!logos.length && rec.logo) logos = [rec.logo];
    var faixaLogo = logos.length ? logos.map(function (s) { return '<img src="' + esc(s) + '" style="max-height:' + mm(k.h * 0.15) + ';max-width:' + mm(k.w * 0.9 / logos.length) + '">'; }).join('')
      : '<b>' + esc(c.empresa || E.nome || '') + '</b>';
    return '<div style="' + abs(k.x, k.y, k.w, k.h, 'border-top:0.35mm solid #111;font-size:' + fs + 'pt;display:flex;flex-direction:column;background:#fff') + '">' +
      (revs ? '<table style="border-collapse:collapse;width:100%"><tr><th style="border:0.2mm solid #111;width:10%">REV</th><th style="border:0.2mm solid #111">DESCRIÇÃO</th><th style="border:0.2mm solid #111;width:18%">DATA</th></tr>' +
        revs.replace(/<td>/g, '<td style="border:0.2mm solid #111;padding:0.4mm 1mm">') + '</table>' : '') +
      '<div style="display:flex;align-items:center;justify-content:center;gap:4mm;flex:0 0 ' + mm(k.h * 0.18) + ';border-bottom:0.2mm solid #111">' +
        faixaLogo + '</div>' +
      '<div style="padding:0.8mm 1mm;border-bottom:0.2mm solid #111;text-align:center;font-weight:bold;color:#00406A">' + esc(c.obra || pr.nome) + '</div>' +
      '<div style="padding:0.6mm 1mm;border-bottom:0.2mm solid #111"><span style="font-size:0.8em;color:#444">CONTEÚDO DA PRANCHA</span><div style="text-align:center;font-weight:bold" data-pr-param="SHEET_NAME">' + esc(fl.conteudo || pr.nome) + '</div></div>' +
      '<div style="padding:0.6mm 1mm;border-bottom:0.2mm solid #111;flex:1"><span style="font-size:0.8em;color:#444">RESPONSÁVEL TÉCNICO</span><div>' + esc(cResp) + (cReg ? ' — ' + esc(cReg) : '') + '</div>' +
        (c.contratante ? '<span style="font-size:0.8em;color:#444">CONTRATANTE</span><div>' + esc(c.contratante) + '</div>' : '') +
        (c.proprietario ? '<span style="font-size:0.8em;color:#444">PROPRIETÁRIO</span><div>' + esc(c.proprietario) + '</div>' : '') +
        (c.local ? '<span style="font-size:0.8em;color:#444">LOCAL</span><div>' + esc(c.local) + '</div>' : '') + '</div>' +
      responsaveis(fl, pm) +
      '<div style="display:flex;border-top:0"><div style="flex:1;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">DATA</span><div data-pr-param="SHEET_ISSUE_DATE">' + esc(pm ? pm.SHEET_ISSUE_DATE : c.data) + '</div></div>' +
        '<div style="flex:1;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">ESCALA</span><div data-pr-param="SHEET_SCALE">' + esc(pm ? pm.SHEET_SCALE : fl.escala) + '</div></div>' +
        '<div style="flex:2;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">COD.</span><div data-pr-param="SHEET_NUMBER">' + esc(fl.numero || ((c.codigo || '') + (c.codigo ? '-' + ('0' + fl.n).slice(-2) : ''))) + '</div></div>' +
        '<div style="flex:1.2;padding:0.5mm 1mm;text-align:center"><span style="font-size:0.8em;color:#444">FOLHA</span><div style="font-size:1.9em">' + ('0' + fl.n).slice(-2) + '<span style="font-size:0.55em">/' + ('0' + total).slice(-2) + '</span></div></div></div>' +
      '</div>';
  }

  /* P8: Projetado / Desenhado / Verificado / Aprovado por (só quando a folha tem algum preenchido) */
  function responsaveis(fl, pm) {
    if (!pm || !(fl.projetadoPor || fl.desenhadoPor || fl.verificadoPor || fl.aprovadoPor)) return '';
    return '<div style="display:flex;border-bottom:0.2mm solid #111">' + [["PROJETO", "SHEET_DESIGNED_BY"], ["DESENHO", "SHEET_DRAWN_BY"], ["VERIFICAÇÃO", "SHEET_CHECKED_BY"], ["APROVAÇÃO", "SHEET_APPROVED_BY"]].map(function (q, i) {
      return '<div style="flex:1;padding:0.4mm 1mm;' + (i < 3 ? 'border-right:0.2mm solid #111' : '') + '"><span style="font-size:0.8em;color:#444">' + q[0] + '</span><div data-pr-param="' + q[1] + '">' + esc(pm[q[1]]) + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------- P8: VIEWPORT
   * A vista 2D em ESCALA: o SVG vetorial do js/desenho2d.js com a viewBox
   * em metros e o quadro em milímetros de papel (w = largura × 1000 / escala).
   * As penas de tela (px, non-scaling-stroke) viram mm de papel (NBR 8403,
   * Prancha.PENAS_PAPEL) — a mesma espessura do DXF.
   * vp = { svg, vb:{x,y,w,h}, pena, penasPx (Desenho2D.PENAS[pena]) } */
  var ESTILO_PAPEL = '.pv-vp .d2-papel{fill:#fff}.pv-vp .d2-corte{stroke:#111;stroke-linejoin:miter}.pv-vp .d2-vista{stroke:#2b2b2b;fill:none;stroke-linecap:round}' +
    '.pv-vp .d2-cota line,.pv-vp .d2-eixo,.pv-vp .d2-nivel-l,.pv-vp .d2-tit-l{stroke:#111}' +
    '.pv-vp .d2-cota-tx,.pv-vp .d2-nivel-tx,.pv-vp .d2-tit-tx,.pv-vp .d2-tit-esc,.pv-vp .d2-marca-tx,.pv-vp .d2-amb-tx,.pv-vp .d2-amb-leg-tit,.pv-vp .d2-amb-leg-tx{fill:#111;font-family:Arial,Helvetica,sans-serif}' +
    '.pv-vp .d2-tit-tx,.pv-vp .d2-marca-tx,.pv-vp .d2-amb-nome{font-weight:bold}.pv-vp .d2-cota-pt,.pv-vp .d2-marca-seta,.pv-vp .d2-nivel-tri{fill:#111}' +
    '.pv-vp .d2-marca-circ{fill:#fff;stroke:#111}.pv-vp pattern line{stroke:#111}.pv-vp .d2-cad-l{stroke:#9aa3ad;fill:none}.pv-vp .d2-cad-tx{fill:#9aa3ad}' +
    '.pv-vp .d2-amb-alvo{fill:none;stroke:none}.pv-vp .d2-amb-sep{stroke:#2b2b2b}.pv-vp .d2-amb-cor{stroke:none}.pv-vp .d2-amb-leg-cor{stroke:#111}.pv-vp .d2-amb-sel-l{display:none}';
  function penaMm(px, vp) {
    var r = vp.penasPx || {}, P = global.Prancha, t = vp.penasMm || (P && P.PENAS_PAPEL && P.PENAS_PAPEL[vp.pena]) || {};
    for (var k in r) if (r.hasOwnProperty(k) && Math.abs(+r[k] - px) < 1e-6 && t[k] != null) return t[k];
    return px * 0.2;   /* derivada (vínculo CAD, instalações): a mesma proporção */
  }
  function viewportSvg(vp, b) {
    var esc0 = +b.escala || 50, vb = b.recorte ? { x: b.recorte.x0, y: b.recorte.y0, w: b.recorte.x1 - b.recorte.x0, h: b.recorte.y1 - b.recorte.y0 } : vp.vb;
    var idp = 'd2-hach-' + String(b.vistaId).replace(/[^\w-]/g, '_');
    return String(vp.svg || '')
      .replace(/^<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" class="pv-vp" width="100%" height="100%" viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h + '" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:hidden"><style>' + ESTILO_PAPEL + '</style>')
      /* P6: a linha do estilo de objeto traz a pena de papel em `data-mm` (já com o fator de
         "Espessura das linhas", js/desenho2d.js FATOR_PENA) — vale ela, não o px de tela */
      .replace(/(data-mm="([\d.]+)"[^>]*?)?stroke-width="([\d.]+)" vector-effect="non-scaling-stroke"/g, function (m, pre, dmm, px) {
        var mmP = dmm != null && dmm !== '' && isFinite(+dmm) && +dmm > 0 ? +dmm : penaMm(+px, vp);
        return (pre || '') + 'stroke-width="' + (Math.round(mmP * esc0 / 1000 * 1e6) / 1e6) + '"';
      })
      .replace(/d2-hach/g, idp);
  }
  /* o título de vista: número de detalhe no círculo, nome sublinhado e a escala */
  function tituloVista(b) {
    if (b.mostrarTitulo === false) return '';
    return '<div data-pv-titulo="1" style="position:absolute;left:0;top:' + mm(b.h + 1.5) + ';display:flex;align-items:center;gap:2mm;white-space:nowrap">' +
      '<svg width="8mm" height="8mm" viewBox="0 0 8 8" style="flex:0 0 8mm"><circle cx="4" cy="4" r="3.8" fill="none" stroke="#111" stroke-width="0.25"/>' +
      '<text x="4" y="5.1" font-size="3.1" text-anchor="middle" font-weight="bold" font-family="Arial" fill="#111" data-pv-num="1">' + esc(b.numeroDetalhe) + '</text></svg>' +
      '<div><div data-pv-nome="1" style="font-weight:bold;font-size:10pt;border-bottom:0.5mm solid #111;padding-right:8mm">' + esc(String(b.tituloVista || '').toUpperCase()) + '</div>' +
      '<div data-pv-escala="1" style="font-size:7pt;margin-top:0.4mm">ESC 1:' + esc(b.escala) + '</div></div></div>';
  }

  function coluna(pr, g) {
    var k = g.coluna, altura = k.h - g.carimbo.h - 2;
    if (g.semColuna || altura < 6) return '';   /* folha em pé no modelo RA: sem coluna (o carimbo fica no pé) */
    var fs = Math.max(5.6, Math.min(7.6, k.w / 28));
    var h = (pr.coluna || []).map(function (s) {
      return '<div style="padding:1.6mm 2.5mm 0.6mm"><div style="font-weight:bold;text-decoration:underline;margin-bottom:0.8mm">' + esc(s.titulo) + '</div><ul style="margin:0;padding-left:3mm">' +
        s.itens.map(function (i) { return '<li style="margin:0 0 0.5mm">' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return '<div style="' + abs(k.x, k.y, k.w, altura, 'border-left:0.35mm solid #111;font-size:' + fs + 'pt;line-height:1.28;overflow:hidden') + '">' + h + '</div>';
  }

  function blocoHtml(b, rec, i) {
    var t = '';
    if (b.tipo === 'viewport') {
      var vp = rec.viewports && rec.viewports[b.vistaId];
      t = vp ? viewportSvg(vp, b)
             : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:0.3mm dashed #b3261e;color:#b3261e;font-size:9pt;text-align:center">vista "' + esc(b.tituloVista) + '" sem desenho (abra o modelo da obra)</div>';
      return '<div data-pv-bloco="' + i + '" data-pv-vp="' + esc(b.vistaId) + '" style="' + abs(b.x, b.y, b.w, b.h) + '">' + t + tituloVista(b) + '</div>';
    }
    if (b.tipo === 'vista') {
      var src = rec.vistas && rec.vistas[b.vistaId || b.origemVista];
      t = src ? '<img src="' + esc(src) + '" style="width:100%;height:100%;object-fit:contain">'
              : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:0.3mm dashed #b3261e;color:#b3261e;font-size:9pt;text-align:center">vista "' + esc(b.titulo) + '" não encontrada nesta obra</div>';
    } else if (b.tipo === 'imagem') {
      var im = rec.imagens && rec.imagens[b.chave];
      t = im ? '<img src="' + esc(im) + '" style="width:100%;height:100%;object-fit:contain">'
             : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:0.3mm dashed #b3261e;color:#b3261e;font-size:9pt">imagem não está neste computador</div>';
    } else if (b.tipo === 'texto') {
      t = '<div style="font-size:8pt;line-height:1.3">' + (b.linhas || []).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
    } else if (b.tipo === 'tabela') {
      t = '<table style="border-collapse:collapse;font-size:6.8pt;width:100%"><tr>' + (b.cabecalho || []).map(function (h) { return '<th style="border:0.2mm solid #333;background:#eef2f5;padding:0.3mm 0.8mm">' + esc(h) + '</th>'; }).join('') + '</tr>' +
        (b.linhas || []).map(function (l) { return '<tr>' + l.map(function (c) { return '<td style="border:0.2mm solid #999;padding:0.3mm 0.8mm;text-align:center">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    }
    var tit = b.titulo ? '<div style="position:absolute;left:0;top:' + mm(b.h + 1) + ';font-size:10pt;white-space:nowrap">' + esc(b.titulo) +
      (b.subtitulo ? '<div style="font-size:7pt">' + esc(b.subtitulo) + '</div>' : '') + '</div>' : '';
    return '<div style="' + abs(b.x, b.y, b.w, b.h) + '">' + t + tit + '</div>';
  }

  /* P8: o EIXO GUIA (o "Eixo guia"): só na tela do editor, nunca na impressão */
  function eixoGuia(fl, g, rec) {
    var P = global.Prancha; if (!rec.editor || !fl.eixoGuia || !P || !P.eixoGuiaLinhas) return '';
    var L = P.eixoGuiaLinhas(fl, g), a = g.area;
    return '<div data-pv-eixo="1" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none">' +
      L.xs.map(function (x) { return '<div style="' + abs(x, a.y, 0.0001, a.h, 'border-left:0.25mm dashed rgba(26,108,181,.45)') + '"></div>'; }).join('') +
      L.ys.map(function (y) { return '<div style="' + abs(a.x, y, a.w, 0.0001, 'border-top:0.25mm dashed rgba(26,108,181,.45)') + '"></div>'; }).join('') + '</div>';
  }

  function folha(pr, fl, rec, geo) {
    rec = rec || {};
    var g = geo, P = g.papel, M = g.moldura, corpo;
    if (fl.imagemInteira && rec.imagens && rec.imagens[fl.imagemInteira]) {
      // a folha já pronta (ex.: a prancha oficial gerada fora): a imagem inteira, sem moldura por cima
      corpo = '<img src="' + esc(rec.imagens[fl.imagemInteira]) + '" style="position:absolute;left:0;top:0;width:' + mm(P.w) + ';height:' + mm(P.h) + '">';
    } else {
      corpo = '<div style="' + abs(M.x, M.y, M.w, M.h, 'border:0.5mm solid #111') + '"></div>' +
        (fl.blocos || []).map(function (b, i) { return blocoHtml(b, rec, i); }).join('') + coluna(pr, g) + carimbo(pr, fl, g, rec) + eixoGuia(fl, g, rec);
    }
    return '<div class="folha" style="position:relative;width:' + mm(P.w) + ';height:' + mm(P.h) + ';overflow:hidden;page-break-after:always;break-after:page;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111">' + corpo + '</div>';
  }

  function documento0(pr, rec, geo) {
    var P = geo.papel;
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(pr.nome) + '</title><style>@page{size:' + P.w + 'mm ' + P.h + 'mm;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}.folha:last-child{page-break-after:auto;break-after:auto}' +
      '@media screen{body{background:#666}.folha{margin:10px auto;box-shadow:0 2px 12px rgba(0,0,0,.4)}}</style></head><body>' +
      (pr.folhas || []).map(function (f) { return folha(pr, f, rec, geo); }).join('') + '</body></html>';
  }

  /* P8: rec.titulo = o nome automático do arquivo (o "Salvar como PDF" usa o título) */
  function documento(pr, rec, geo) {
    var h = documento0(pr, rec, geo);
    if (rec && rec.titulo) h = h.replace('<title>' + esc(pr.nome) + '</title>', '<title>' + esc(rec.titulo) + '</title>');
    return h;
  }

  var PranchaUI = { folha: folha, documento: documento, viewportSvg: viewportSvg, tituloVista: tituloVista, ESTILO_PAPEL: ESTILO_PAPEL, carimboRA: carimboRA, COR_DESTAQUE: COR_DESTAQUE };
  global.PranchaUI = PranchaUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = PranchaUI;
})(typeof window !== 'undefined' ? window : this);

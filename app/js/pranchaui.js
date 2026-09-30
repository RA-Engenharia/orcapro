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

  function carimbo(pr, fl, g, rec) {
    var c = pr.carimbo || {}, k = g.carimbo, total = (pr.folhas || []).length;
    var revs = (c.revisoes || []).slice(-3).map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
    }).join('');
    var fs = Math.max(5.2, Math.min(7.4, k.w / 30));
    /* ⚠ os logos DA PRANCHA vêm antes do logo da conta: a prancha que a RA assina, aberta na conta da
       construtora, sairia só com o logo da construtora — e o nome de quem projetou sumia do carimbo */
    var logos = (c.logos || []).map(function (ch) { return rec.imagens && rec.imagens[ch]; }).filter(function (s) { return !!s; });
    if (!logos.length && rec.logo) logos = [rec.logo];
    var faixaLogo = logos.length ? logos.map(function (s) { return '<img src="' + esc(s) + '" style="max-height:' + mm(k.h * 0.15) + ';max-width:' + mm(k.w * 0.9 / logos.length) + '">'; }).join('')
      : '<b>' + esc(c.empresa) + '</b>';
    return '<div style="' + abs(k.x, k.y, k.w, k.h, 'border-top:0.35mm solid #111;font-size:' + fs + 'pt;display:flex;flex-direction:column;background:#fff') + '">' +
      (revs ? '<table style="border-collapse:collapse;width:100%"><tr><th style="border:0.2mm solid #111;width:10%">REV</th><th style="border:0.2mm solid #111">DESCRIÇÃO</th><th style="border:0.2mm solid #111;width:18%">DATA</th></tr>' +
        revs.replace(/<td>/g, '<td style="border:0.2mm solid #111;padding:0.4mm 1mm">') + '</table>' : '') +
      '<div style="display:flex;align-items:center;justify-content:center;gap:4mm;flex:0 0 ' + mm(k.h * 0.18) + ';border-bottom:0.2mm solid #111">' +
        faixaLogo + '</div>' +
      '<div style="padding:0.8mm 1mm;border-bottom:0.2mm solid #111;text-align:center;font-weight:bold;color:#00406A">' + esc(c.obra || pr.nome) + '</div>' +
      '<div style="padding:0.6mm 1mm;border-bottom:0.2mm solid #111"><span style="font-size:0.8em;color:#444">CONTEÚDO DA PRANCHA</span><div style="text-align:center;font-weight:bold">' + esc(fl.conteudo || pr.nome) + '</div></div>' +
      '<div style="padding:0.6mm 1mm;border-bottom:0.2mm solid #111;flex:1"><span style="font-size:0.8em;color:#444">RESPONSÁVEL TÉCNICO</span><div>' + esc(c.responsavel) + (c.registro ? ' — ' + esc(c.registro) : '') + '</div>' +
        (c.contratante ? '<span style="font-size:0.8em;color:#444">CONTRATANTE</span><div>' + esc(c.contratante) + '</div>' : '') +
        (c.proprietario ? '<span style="font-size:0.8em;color:#444">PROPRIETÁRIO</span><div>' + esc(c.proprietario) + '</div>' : '') +
        (c.local ? '<span style="font-size:0.8em;color:#444">LOCAL</span><div>' + esc(c.local) + '</div>' : '') + '</div>' +
      '<div style="display:flex;border-top:0"><div style="flex:1;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">DATA</span><div>' + esc(c.data) + '</div></div>' +
        '<div style="flex:1;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">ESCALA</span><div>' + esc(fl.escala) + '</div></div>' +
        '<div style="flex:2;padding:0.5mm 1mm;border-right:0.2mm solid #111"><span style="font-size:0.8em;color:#444">COD.</span><div>' + esc((c.codigo || '') + (c.codigo ? '-' + ('0' + fl.n).slice(-2) : '')) + '</div></div>' +
        '<div style="flex:1.2;padding:0.5mm 1mm;text-align:center"><span style="font-size:0.8em;color:#444">FOLHA</span><div style="font-size:1.9em">' + ('0' + fl.n).slice(-2) + '<span style="font-size:0.55em">/' + ('0' + total).slice(-2) + '</span></div></div></div>' +
      '</div>';
  }

  function coluna(pr, g) {
    var k = g.coluna, altura = k.h - g.carimbo.h - 2;
    var fs = Math.max(5.6, Math.min(7.6, k.w / 28));
    var h = (pr.coluna || []).map(function (s) {
      return '<div style="padding:1.6mm 2.5mm 0.6mm"><div style="font-weight:bold;text-decoration:underline;margin-bottom:0.8mm">' + esc(s.titulo) + '</div><ul style="margin:0;padding-left:3mm">' +
        s.itens.map(function (i) { return '<li style="margin:0 0 0.5mm">' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return '<div style="' + abs(k.x, k.y, k.w, altura, 'border-left:0.35mm solid #111;font-size:' + fs + 'pt;line-height:1.28;overflow:hidden') + '">' + h + '</div>';
  }

  function blocoHtml(b, rec) {
    var t = '';
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

  function folha(pr, fl, rec, geo) {
    rec = rec || {};
    var g = geo, P = g.papel, M = g.moldura, corpo;
    if (fl.imagemInteira && rec.imagens && rec.imagens[fl.imagemInteira]) {
      // a folha já pronta (ex.: a prancha oficial gerada fora): a imagem inteira, sem moldura por cima
      corpo = '<img src="' + esc(rec.imagens[fl.imagemInteira]) + '" style="position:absolute;left:0;top:0;width:' + mm(P.w) + ';height:' + mm(P.h) + '">';
    } else {
      corpo = '<div style="' + abs(M.x, M.y, M.w, M.h, 'border:0.5mm solid #111') + '"></div>' +
        (fl.blocos || []).map(function (b) { return blocoHtml(b, rec); }).join('') + coluna(pr, g) + carimbo(pr, fl, g, rec);
    }
    return '<div class="folha" style="position:relative;width:' + mm(P.w) + ';height:' + mm(P.h) + ';overflow:hidden;page-break-after:always;break-after:page;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111">' + corpo + '</div>';
  }

  function documento(pr, rec, geo) {
    var P = geo.papel;
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(pr.nome) + '</title><style>@page{size:' + P.w + 'mm ' + P.h + 'mm;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}.folha:last-child{page-break-after:auto;break-after:auto}' +
      '@media screen{body{background:#666}.folha{margin:10px auto;box-shadow:0 2px 12px rgba(0,0,0,.4)}}</style></head><body>' +
      (pr.folhas || []).map(function (f) { return folha(pr, f, rec, geo); }).join('') + '</body></html>';
  }

  var PranchaUI = { folha: folha, documento: documento };
  global.PranchaUI = PranchaUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = PranchaUI;
})(typeof window !== 'undefined' ? window : this);

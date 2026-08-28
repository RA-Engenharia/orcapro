/* =====================================================================
 * bimtuboxls.js — RELAÇÃO DE TUBOS POR RAMAL, em Excel.
 *
 * A folha que vai para a obra: cada tubo com o número que aparece no 3D, o
 * comprimento que o projeto publicou, e a peça que entra em cada extremidade.
 * Molde de js/blocokxls.js (mesma linguagem visual e mesmo `gerar`).
 *
 * ⚠ O QUE O NÚMERO É — e o que eu já errei aqui. Este cabeçalho dizia que a
 *   medida não descontava a folga de bolsa das conexões. Era dedução minha, e
 *   estava errada para o arquivo do cliente: medido depois, em 1.725 de 1.725
 *   tubos o `Length` publicado é EXATAMENTE a profundidade do sólido
 *   extrudado — é a peça física, não um vão entre faces. A planilha por isso
 *   não afirma convenção nenhuma: declara a origem do número e manda conferir
 *   UMA peça antes de cortar o lote, que é o que vale em qualquer modelagem.
 *
 * ⚠ COMPRIMENTO ENTRA COMO NÚMERO, nunca como texto. "2,45" numa célula faz a
 *   soma da coluna dar zero — e é justamente a coluna que alguém vai somar
 *   para comprar tubo.
 *
 * ⚠ E TODO TEXTO VINDO DO IFC É NEUTRALIZADO. Nome de família é conteúdo de
 *   terceiro; começando com = + - @, o Excel o executa como fórmula.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NAVY = 'FF0F2740', BRANCO = 'FFFFFFFF', ZEBRA = 'FFF1F6FB', TITULO = 'FF0F2740';
  var NUM3 = '#,##0.000', INT = '#,##0';
  /* ⚠ ESTE TEXTO JÁ AFIRMOU O CONTRÁRIO, E ESTAVA ERRADO.
   *
   * A primeira versão dizia "não descontam a folga de bolsa das conexões".
   * Eu deduzi que o IFC publicava o vão livre entre as faces das conexões —
   * o que É o comportamento comum quando o comprimento vem do conector do
   * Revit. Não é o que este arquivo faz, e o cliente viu antes de mim, na
   * tela: o tubo aparece entrando por dentro da conexão.
   *
   * Medido depois, no arquivo real: em 1.725 de 1.725 tubos o `Length`
   * publicado é EXATAMENTE a profundidade do sólido extrudado — ou seja, é o
   * comprimento da peça física, não de um vão. E numa amostra de 250 tubos,
   * todos os 250 sobrepõem a caixa de alguma conexão, com penetração mediana
   * de 4 cm no eixo — ordem de grandeza de bolsa.
   *
   * Então o rodapé parou de AFIRMAR uma convenção e passou a dizer o que foi
   * lido, mais a conferência que custa um tubo e evita um lote errado.
   * Deduzir a convenção de modelagem de um arquivo que não a declara foi o
   * erro; declarar a origem do número e mandar conferir é o certo. */
  var RODAPE = 'Comprimento lido do IFC — nenhum calculado pelo sistema: é a medida do trecho como foi modelado. '
    + 'A convenção de bolsa depende de quem modelou; confira UMA peça na obra antes de cortar o lote.';

  function thin() { var s = { style: 'thin', color: { argb: 'FFCBD5E1' } }; return { top: s, left: s, bottom: s, right: s }; }
  function nomeAba(s) { return (String(s == null ? '' : s).replace(/[:\\\/?*\[\]]/g, '-').trim().substring(0, 31)) || 'Aba'; }
  /* ⚠ conteúdo de terceiro não pode virar fórmula do Excel */
  function seguro(v) {
    if (typeof v !== 'string') return v;
    return /^[=+\-@]/.test(v) ? "'" + v : v;
  }
  /* nome de arquivo: o do modelo pode ter barra, dois-pontos, aspas */
  function nomeArquivo(s) {
    return String(s == null ? '' : s).replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 90) || 'Tubos por ramal';
  }

  function aba(wb, nome, cols, linhas, opts) {
    opts = opts || {};
    var ws = wb.addWorksheet(nomeAba(nome), { views: [{ state: 'frozen', ySplit: opts.titulo ? 3 : 1 }] });
    var r = 1;
    if (opts.titulo) {
      ws.mergeCells(1, 1, 1, cols.length);
      var ct = ws.getCell(1, 1); ct.value = opts.titulo;
      ct.font = { bold: true, size: 13, color: { argb: TITULO } };
      ws.mergeCells(2, 1, 2, cols.length);
      var cs = ws.getCell(2, 1); cs.value = opts.subtitulo || '';
      cs.font = { size: 10, color: { argb: 'FF64748B' } };
      r = 3;
    }
    var hr = ws.getRow(r);
    cols.forEach(function (c, i) {
      var cell = hr.getCell(i + 1); cell.value = c.h;
      cell.font = { bold: true, color: { argb: BRANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thin();
      ws.getColumn(i + 1).width = c.w || 16;
    });
    hr.height = 26;
    var linha = r;
    linhas.forEach(function (lin, k) {
      linha++;
      var row = ws.getRow(linha);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1), v = lin[c.k];
        cell.value = seguro(v == null ? '' : v);
        if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt;
        cell.border = thin();
        if (k % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
        if (c.centro) cell.alignment = { horizontal: 'center' };
      });
    });
    if (opts.totais) {
      linha++;
      var tr = ws.getRow(linha);
      cols.forEach(function (c, i) {
        var cell = tr.getCell(i + 1);
        var v = (i === 0 && opts.totais[c.k] == null) ? 'TOTAL' : opts.totais[c.k];
        cell.value = v == null ? '' : v;
        if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt;
        cell.font = { bold: true }; cell.border = thin();
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      });
    }
    /* rodapé de honestidade em TODA aba — quem imprime uma só tem de ver */
    linha += 2;
    ws.mergeCells(linha, 1, linha, cols.length);
    var cf = ws.getCell(linha, 1); cf.value = RODAPE;
    cf.font = { italic: true, size: 9.5, color: { argb: 'FFB45309' } };
    cf.alignment = { wrapText: true };
    if (linhas.length) ws.autoFilter = { from: { row: r, column: 1 }, to: { row: r + linhas.length, column: cols.length } };
    return ws;
  }

  function construir(ExcelJS, pac, meta) {
    meta = meta || {};
    var wb = new ExcelJS.Workbook();
    wb.creator = 'OrçaPRO IA'; wb.created = new Date();
    var res = pac.resumo || {};
    var sub = 'Gerado em ' + new Date().toLocaleString('pt-BR') +
      (meta.arquivo ? ' · modelo: ' + meta.arquivo : '') +
      ' · ' + res.numerados + ' de ' + res.tubosComComprimento + ' tubos encadeados';

    aba(wb, 'Tubos por ramal', [
      { h: 'Nº', k: 'n', w: 13, centro: true },
      { h: 'Ramal', k: 'ramal', w: 8, centro: true },
      { h: 'Ordem', k: 'ordem', w: 7, centro: true, fmt: INT },
      { h: 'Sistema', k: 'sistema', w: 16 },
      { h: 'Família / tipo', k: 'familia', w: 34 },
      /* Ø EXTERNO, nao 'DN' seco: no PVC brasileiro coincidem, em outro
         material nao — e a coluna vai para a mao de quem compra. */
      { h: 'Bitola Ø ext. (mm)', k: 'dn', w: 12, centro: true, fmt: INT },
      { h: 'Comprimento no modelo (m)', k: 'L', w: 15, fmt: NUM3 },
      { h: 'Fonte do comprimento', k: 'compFonte', w: 13, centro: true },
      { h: 'Conexão na ponta A', k: 'pontaA', w: 32 },
      { h: 'Conexão na ponta B', k: 'pontaB', w: 32 },
      { h: 'Anterior na sequência', k: 'antes', w: 14, centro: true },
      { h: 'Seguinte na sequência', k: 'depois', w: 14, centro: true },
      { h: 'Pavimento', k: 'pavimento', w: 14 },
      { h: 'Observação', k: 'obs', w: 20 }
    ], pac.linhas, {
      titulo: 'Relação de tubos por ramal — medidas do modelo',
      subtitulo: sub,
      totais: { L: res.metrosNumerados }
    });

    aba(wb, 'Resumo por ramal', [
      { h: 'Ramal', k: 'ramal', w: 10, centro: true },
      { h: 'Tubos', k: 'tubos', w: 10, centro: true, fmt: INT },
      { h: 'Metros', k: 'metros', w: 14, fmt: NUM3 },
      { h: 'Peças no ramal', k: 'pecas', w: 14, centro: true, fmt: INT },
      { h: 'Onde o percurso começou', k: 'origem', w: 52 }
    ], pac.ramais, {
      titulo: 'Resumo por ramal',
      subtitulo: 'A ordem dos ramais é: mais tubos primeiro, depois mais metros. O percurso segue o encadeamento da rede.',
      totais: { tubos: res.numerados, metros: res.metrosNumerados }
    });

    /* ⚠ ABA SEMPRE PRESENTE, mesmo vazia. Aba que só aparece quando há
       problema treina quem lê a não procurar por ela. */
    aba(wb, 'Fora da lista', [
      { h: 'Nº', k: 'n', w: 14, centro: true },
      { h: 'Sistema', k: 'sistema', w: 16 },
      { h: 'Família / tipo', k: 'familia', w: 34 },
      { h: 'Bitola Ø ext. (mm)', k: 'dn', w: 12, centro: true, fmt: INT },
      { h: 'Comprimento no modelo (m)', k: 'L', w: 15, fmt: NUM3 },
      { h: 'Pavimento', k: 'pavimento', w: 14 },
      { h: 'Por que ficou fora', k: 'motivo', w: 40 }
    ], pac.avulsos, {
      titulo: 'Tubos fora do encadeamento',
      subtitulo: pac.avulsos.length
        ? 'Têm comprimento publicado, mas o IFC não declara ligação — não dá para dizer em que ordem entram.'
        : 'Nenhum: todos os tubos com comprimento entraram no encadeamento.',
      totais: pac.avulsos.length ? { L: res.metrosAvulsos } : null
    });

    /* conferência: quem lê tem de conseguir fechar a conta sozinho */
    var ws = wb.addWorksheet('Conferência');
    ws.getColumn(1).width = 44; ws.getColumn(2).width = 26;
    var linhas = [
      ['Modelo', meta.arquivo || '—'],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Versão do OrçaPRO', meta.versao || '—'],
      ['', ''],
      ['Tubos com comprimento no IFC', res.tubosComComprimento],
      ['  numerados (encadeados)', res.numerados],
      ['  fora da lista (sem ligação)', res.avulsos],
      ['Fecha a conta?', res.fecha ? 'SIM' : 'NÃO — avise o suporte'],
      ['', ''],
      ['Metros totais', res.metrosTotais],
      ['  nos numerados', res.metrosNumerados],
      ['  nos fora da lista', res.metrosAvulsos],
      ['', ''],
      ['Ramais', res.ramais],
      ['Portas lidas do IFC', (pac.topo && pac.topo.portas) || 0],
      ['Ligações entre portas', (pac.topo && pac.topo.ligacoes) || 0]
    ];
    var lr = 1;
    var t = ws.getCell(1, 1); t.value = 'Conferência'; t.font = { bold: true, size: 13, color: { argb: TITULO } };
    lr = 3;
    linhas.forEach(function (it) {
      var row = ws.getRow(lr++);
      var c1 = row.getCell(1); c1.value = it[0];
      var c2 = row.getCell(2); c2.value = it[1];
      if (typeof it[1] === 'number') c2.numFmt = (String(it[0]).indexOf('etros') > -1 ? NUM3 : INT);
      c2.alignment = { horizontal: 'right' }; c2.font = { bold: true };
      if (it[0]) { c1.border = thin(); c2.border = thin(); }
    });
    lr += 1;
    ws.mergeCells(lr, 1, lr, 2);
    var cf = ws.getCell(lr, 1); cf.value = RODAPE;
    cf.font = { italic: true, size: 9.5, color: { argb: 'FFB45309' } };
    cf.alignment = { wrapText: true };

    return wb;
  }

  function gerar(pac, hooks) {
    hooks = hooks || {};
    var EX = global.ExcelOrc || global.Excel;
    if (!EX || !EX.ensureExcelJS) { if (hooks.erro) hooks.erro(new Error('Excel indisponível')); return; }
    EX.ensureExcelJS(function () {
      try {
        Promise.resolve(construir(global.ExcelJS, pac, hooks.meta || {})).then(function (wb) {
          return wb.xlsx.writeBuffer();
        }).then(function (buf) {
          var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = nomeArquivo(hooks.nome || 'Tubos por ramal') + '.xlsx'; a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          if (hooks.ok) hooks.ok();
        }).catch(function (e) { if (hooks.erro) hooks.erro(e); });
      } catch (e) { if (hooks.erro) hooks.erro(e); }
    });
  }

  global.BimTuboXLS = { construir: construir, gerar: gerar, _seguro: seguro, _nomeArquivo: nomeArquivo };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.BimTuboXLS;
})(typeof window !== 'undefined' ? window : globalThis);

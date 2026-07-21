/* =====================================================================
 * blocokxls.js — Planilha Excel PROFISSIONAL do Blocok (multi-abas).
 * Abas: Resumo · (uma por pavimento) · Paredes · Placas (romaneio) ·
 * Material · Insumos · Mão de obra · Cargas na fundação · Logística ·
 * Parâmetros. Estilo navy/aço, cabeçalho, zebra, bordas, freeze,
 * auto-filtro, subtotais, formatos numéricos.
 * Usa ExcelJS (reaproveita window.Excel.ensureExcelJS — lazy CDN).
 * `construir(ExcelJS, pacote, BK)` é montável/testável (recebe as deps).
 * ===================================================================== */
(function (global) {
  "use strict";

  var NAVY = 'FF0F2740', ACO = 'FF1858A8', BRANCO = 'FFFFFFFF', ZEBRA = 'FFF1F6FB',
      SUB = 'FFE7EEF6', TITULO = 'FF12314F', AMBAR = 'FFB26A00', TOT = 'FFDCE9F6';
  var NUM = '#,##0.00', INT = '#,##0', NUM3 = '#,##0.000', MOEDA = 'R$ #,##0.00';

  function thin() { var s = { style: 'thin', color: { argb: 'FFCBD5E1' } }; return { top: s, left: s, bottom: s, right: s }; }
  function fmtBR(n) { return (Math.round((+n || 0) * 100) / 100); }
  // nome de aba VÁLIDO no Excel: sem : \ / ? * [ ], ≤ 31 chars, não-vazio (senão addWorksheet lança)
  function nomeAba(s) { return (String(s == null ? '' : s).replace(/[:\\\/?*\[\]]/g, '-').trim().substring(0, 31)) || 'Aba'; }

  // monta uma aba genérica a partir de colunas + linhas (objetos)
  // cols: [{ h:'Título', k:'chave', w:14, fmt:NUM, al:'left'|'right'|'center', tot:true }]
  // linhas: [{ chave: valor, ... }]  ·  opts: { titulo, subtitulo, totais:{chave:valor}, filtro:true }
  function aba(wb, nome, cols, linhas, opts) {
    opts = opts || {};
    var ws = wb.addWorksheet(nomeAba(nome), { views: [{ state: 'frozen', ySplit: (opts.titulo ? 3 : 1) + (opts.subtitulo ? 1 : 0) }] });
    ws.columns = cols.map(function (c) { return { key: c.k, width: c.w || 14 }; });
    var r = 1;
    if (opts.titulo) {
      ws.mergeCells(1, 1, 1, cols.length);
      var ct = ws.getCell(1, 1); ct.value = opts.titulo; ct.font = { bold: true, size: 13, color: { argb: TITULO } }; ct.alignment = { vertical: 'middle' };
      ws.getRow(1).height = 20; r = 2;
      if (opts.subtitulo) { ws.mergeCells(2, 1, 2, cols.length); var cs = ws.getCell(2, 1); cs.value = opts.subtitulo; cs.font = { size: 10, color: { argb: 'FF5A6A78' } }; r = 3; }
      r++; // linha em branco antes do cabeçalho
    }
    // cabeçalho
    var hr = ws.getRow(r);
    cols.forEach(function (c, i) {
      var cell = hr.getCell(i + 1); cell.value = c.h;
      cell.font = { bold: true, color: { argb: BRANCO }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thin();
    });
    hr.height = 26;
    var headerRow = r;
    // linhas
    (linhas || []).forEach(function (lin, idx) {
      r++; var row = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1); var v = lin[c.k];
        cell.value = (v == null) ? '' : v;
        if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt;
        cell.alignment = { vertical: 'middle', horizontal: c.al || (typeof v === 'number' ? 'right' : 'left') };
        cell.border = thin();
        if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      });
    });
    // totais
    if (opts.totais) {
      r++; var tr = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = tr.getCell(i + 1);
        var v = (i === 0 && opts.totais[c.k] == null) ? 'TOTAL' : opts.totais[c.k];
        cell.value = (v == null) ? '' : v;
        if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt;
        cell.font = { bold: true, color: { argb: TITULO } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOT } };
        cell.alignment = { vertical: 'middle', horizontal: c.al || (typeof v === 'number' ? 'right' : 'left') };
        cell.border = thin();
      });
    }
    if (opts.filtro && linhas && linhas.length) {
      ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
    }
    return ws;
  }

  // aba de PARES chave/valor (parâmetros, KPIs verticais)
  function abaKV(wb, nome, titulo, blocos) {
    var ws = wb.addWorksheet(nomeAba(nome));
    ws.columns = [{ width: 42 }, { width: 20 }, { width: 14 }];
    ws.mergeCells(1, 1, 1, 3); var ct = ws.getCell(1, 1); ct.value = titulo; ct.font = { bold: true, size: 13, color: { argb: TITULO } };
    ws.getRow(1).height = 20; var r = 2;
    blocos.forEach(function (bl) {
      r++; ws.mergeCells(r, 1, r, 3); var cb = ws.getCell(r, 1); cb.value = bl.titulo;
      cb.font = { bold: true, color: { argb: BRANCO } }; cb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACO } };
      cb.alignment = { vertical: 'middle' }; ws.getRow(r).height = 18;
      (bl.itens || []).forEach(function (it) {
        r++; var row = ws.getRow(r);
        var c1 = row.getCell(1); c1.value = it[0]; c1.font = { color: { argb: 'FF334155' } }; c1.border = thin();
        var c2 = row.getCell(2); c2.value = it[1]; c2.alignment = { horizontal: 'right' }; c2.font = { bold: true }; c2.border = thin();
        if (it[3]) c2.numFmt = it[3];
        var c3 = row.getCell(3); c3.value = it[2] || ''; c3.font = { color: { argb: 'FF64748B' }, size: 10 }; c3.border = thin();
        if (it[4] === 'conf') c3.font = { color: { argb: AMBAR }, italic: true, size: 10 };
      });
    });
    return ws;
  }

  // ---- monta o workbook inteiro ----
  function construir(ExcelJS, pacote, BK) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'OrçaPRO BIM — RA Engenharia'; wb.created = pacote.dataObj || undefined;
    var P = pacote.paredes || [], m = pacote.material || {}, ins = pacote.insumos || {},
        cg = pacote.carga || {}, mo = pacote.maoObra || {}, lg = pacote.logistica || {};
    var obra = pacote.obra || 'Obra', hoje = pacote.data || '';

    // agrupa por pavimento (preserva ordem de aparição)
    var grupos = {}, ordemPav = [];
    P.forEach(function (p) { var k = p.pavimento || 'Pavimento único'; if (!grupos[k]) { grupos[k] = []; ordemPav.push(k); } grupos[k].push(p); });

    // ===== RESUMO =====
    var resumoPav = ordemPav.map(function (k) {
      var g = grupos[k], gm = BK.material(g, pacote.pesoCfg), gmo = BK.maoDeObra(gm, pacote.moCfg);
      return { pav: k, paredes: g.length, placas: gm.totalPlacas, area: fmtBR(gm.areaPlacas), peso: fmtBR(gm.pesoTotalKg), dias: gmo.dias };
    });
    aba(wb, 'Resumo', [
      { h: 'Pavimento', k: 'pav', w: 26, al: 'left' },
      { h: 'Paredes', k: 'paredes', w: 10, fmt: INT },
      { h: 'Placas', k: 'placas', w: 10, fmt: INT },
      { h: 'Área (m²)', k: 'area', w: 12, fmt: NUM },
      { h: 'Peso compra (kg)', k: 'peso', w: 16, fmt: NUM },
      { h: 'Dias montagem', k: 'dias', w: 14, fmt: INT }
    ], resumoPav, {
      titulo: '🧱 Plantas Executivas Blocok — ' + obra,
      subtitulo: hoje + ' · OrçaPRO BIM — RA Engenharia · Placa 90×90 cm · ' + P.length + ' paredes · ' + m.totalPlacas + ' placas · ' + fmtBR(m.pesoTotalT) + ' t (compra)',
      totais: { pav: 'TOTAL', paredes: P.length, placas: m.totalPlacas, area: fmtBR(m.areaPlacas), peso: fmtBR(m.pesoTotalKg), dias: mo.dias }
    });

    // ===== UMA ABA POR PAVIMENTO =====
    var colsPar = [
      { h: 'Parede', k: 'id', w: 9, al: 'left' },
      { h: 'Descrição', k: 'nome', w: 26, al: 'left' },
      { h: 'Comp. (m)', k: 'comp', w: 11, fmt: NUM },
      { h: 'Altura (m)', k: 'alt', w: 11, fmt: NUM },
      { h: 'Esp. (cm)', k: 'esp', w: 10, fmt: INT },
      { h: 'Inteiras', k: 'int', w: 10, fmt: INT },
      { h: 'Recortes', k: 'rec', w: 10, fmt: INT },
      { h: 'Placas', k: 'placas', w: 10, fmt: INT },
      { h: 'Área (m²)', k: 'area', w: 12, fmt: NUM },
      { h: 'Peso (kg)', k: 'peso', w: 12, fmt: NUM },
      { h: 'Carga (kN/m)', k: 'kNm', w: 13, fmt: NUM }
    ];
    function linhasParede(g) {
      var cf = BK.cargaFundacao(g, pacote.pesoCfg), mapKg = {};
      cf.linhas.forEach(function (l, i) { mapKg[g[i].id] = l; });
      return g.map(function (p) {
        var pg = p.pag, pesoP = BK.pesoPlaca(p.espessura, pacote.pesoCfg && pacote.pesoCfg.pesoPorEsp);
        return { id: p.id, nome: p.nome, comp: fmtBR(p.comprimento), alt: fmtBR(p.altura), esp: p.espessura,
          int: pg.inteiras, rec: pg.recortes, placas: pg.total, area: fmtBR(pg.areaPlacas),
          peso: fmtBR(pg.total * pesoP), kNm: (mapKg[p.id] ? fmtBR(mapKg[p.id].cargaKNm) : 0) };
      });
    }
    ordemPav.forEach(function (k, idx) {
      var g = grupos[k], gm = BK.material(g, pacote.pesoCfg), gcf = BK.cargaFundacao(g, pacote.pesoCfg);
      aba(wb, 'Pav ' + (idx + 1) + ' — ' + k, colsPar, linhasParede(g), {
        titulo: '🏢 ' + k + ' — ' + obra,
        subtitulo: g.length + ' paredes · ' + gm.totalPlacas + ' placas · ' + fmtBR(gm.areaPlacas) + ' m² · ' + fmtBR(gm.pesoTotalKg) + ' kg',
        totais: { id: 'TOTAL', placas: gm.totalPlacas, int: gm.totalInteiras, rec: gm.totalRecortes, area: fmtBR(gm.areaPlacas), peso: fmtBR(gm.pesoTotalKg) },
        filtro: true
      });
    });

    // ===== PAREDES (consolidada) =====
    var linhasTodas = [];
    ordemPav.forEach(function (k) { linhasParede(grupos[k]).forEach(function (l, i) { l.pav = k; linhasTodas.push(l); }); });
    aba(wb, 'Paredes', [{ h: 'Pavimento', k: 'pav', w: 20, al: 'left' }].concat(colsPar), linhasTodas, {
      titulo: '📋 Todas as paredes — ' + obra, subtitulo: P.length + ' paredes',
      totais: { pav: 'TOTAL', placas: m.totalPlacas, int: m.totalInteiras, rec: m.totalRecortes, area: fmtBR(m.areaPlacas), peso: fmtBR(m.pesoTotalKg) }, filtro: true
    });

    // ===== PLACAS (romaneio / lista de corte) =====
    var romaneio = [];
    ordemPav.forEach(function (k) {
      grupos[k].forEach(function (p) {
        (p.pag.placas || []).forEach(function (pl) {
          romaneio.push({ pav: k, parede: p.id, esp: p.espessura, n: pl.n, col: pl.col + 1, lin: pl.lin + 1,
            tipo: pl.tipo === 'recorte' ? 'RECORTE' : 'inteira',
            larg: Math.round(pl.w * 100), altp: Math.round(pl.h * 100), area: fmtBR(pl.w * pl.h) });
        });
      });
    });
    aba(wb, 'Placas (romaneio)', [
      { h: 'Pavimento', k: 'pav', w: 18, al: 'left' },
      { h: 'Parede', k: 'parede', w: 9, al: 'left' },
      { h: 'Esp. (cm)', k: 'esp', w: 9, fmt: INT },
      { h: 'Placa nº', k: 'n', w: 9, fmt: INT },
      { h: 'Coluna', k: 'col', w: 8, fmt: INT },
      { h: 'Fiada', k: 'lin', w: 8, fmt: INT },
      { h: 'Tipo', k: 'tipo', w: 10, al: 'center' },
      { h: 'Largura (cm)', k: 'larg', w: 12, fmt: INT },
      { h: 'Altura (cm)', k: 'altp', w: 12, fmt: INT },
      { h: 'Área (m²)', k: 'area', w: 11, fmt: NUM3 }
    ], romaneio, {
      titulo: '🧩 Romaneio de placas (lista de corte) — ' + obra,
      subtitulo: romaneio.length + ' placas · inteiras 90×90; recortes com a dimensão real p/ cortar na obra', filtro: true
    });

    // ===== MATERIAL por espessura =====
    aba(wb, 'Material', [
      { h: 'Espessura (cm)', k: 'esp', w: 14, fmt: INT, al: 'left' },
      { h: 'Placas', k: 'placas', w: 10, fmt: INT },
      { h: 'Inteiras', k: 'int', w: 10, fmt: INT },
      { h: 'Recortes', k: 'rec', w: 10, fmt: INT },
      { h: 'Área (m²)', k: 'area', w: 12, fmt: NUM },
      { h: 'Peso (kg)', k: 'peso', w: 12, fmt: NUM }
    ], (m.porEspessura || []).map(function (e) { return { esp: e.espessura, placas: e.placas, int: e.inteiras, rec: e.recortes, area: fmtBR(e.area), peso: fmtBR(e.peso) }; }), {
      titulo: '📦 Material — placas por espessura — ' + obra,
      subtitulo: 'Peso = placa CHEIA (compra/transporte).',
      totais: { esp: 'TOTAL', placas: m.totalPlacas, int: m.totalInteiras, rec: m.totalRecortes, area: fmtBR(m.areaPlacas), peso: fmtBR(m.pesoTotalKg) }
    });

    // ===== INSUMOS (produção + montagem) =====
    var linsIns = (ins.producao || []).map(function (i) { return { grupo: 'Produção das placas', nome: i.nome, q: fmtBR(i.total), unid: i.unid }; })
      .concat((ins.montagem || []).map(function (i) { return { grupo: 'Montagem / assentamento', nome: i.nome, q: fmtBR(i.total), unid: i.unid }; }));
    aba(wb, 'Insumos', [
      { h: 'Grupo', k: 'grupo', w: 24, al: 'left' },
      { h: 'Insumo', k: 'nome', w: 40, al: 'left' },
      { h: 'Quantidade', k: 'q', w: 14, fmt: NUM },
      { h: 'Unid.', k: 'unid', w: 8, al: 'center' }
    ], linsIns, {
      titulo: '🏭 Insumos — ' + obra,
      subtitulo: 'Produção por placa CHEIA (' + fmtBR(ins.areaCheia) + ' m²) · Montagem por m² INSTALADO (' + fmtBR(ins.areaInstalada) + ' m²) · junta: ' + (pacote.juntaNome || '') + ' · estimativa de referência editável'
    });

    // ===== MÃO DE OBRA =====
    var moPav = ordemPav.map(function (k) { var gm = BK.material(grupos[k]); var g = BK.maoDeObra(gm, pacote.moCfg); return [k, g.dias + ' dia(s)', gm.totalPlacas + ' placas']; });
    abaKV(wb, 'Mão de obra', '👷 Mão de obra (estimativa por rendimento) — ' + obra, [
      { titulo: 'Parâmetros (editáveis)', itens: [
        ['Rendimento por equipe', mo.placasDiaEquipe, 'placas/dia'],
        ['Equipes simultâneas', mo.nEquipes, 'equipe(s)'],
        ['Pessoas por equipe', mo.pessoasEquipe, 'pessoa(s)'],
        ['Jornada', mo.jornadaH, 'h/dia'],
        ['Custo de mão de obra', mo.custoHh, 'R$/Hh', MOEDA]
      ] },
      { titulo: 'Resultado (montagem)', itens: [
        ['Produção total', mo.producaoDia, 'placas/dia'],
        ['Prazo de montagem', mo.dias, 'dia(s)'],
        ['Pessoas na frente', mo.pessoasTotal, 'pessoa(s)'],
        ['Homem-hora (Hh)', mo.Hh, 'Hh'],
        ['Ritmo', mo.m2PorDia, 'm²/dia', NUM],
        ['Custo estimado da montagem', mo.custoTotal, '', MOEDA]
      ] },
      { titulo: 'Prazo por pavimento', itens: moPav }
    ]);

    // ===== CARGAS na fundação =====
    var linhasCarga = [];
    ordemPav.forEach(function (k) {
      var g = grupos[k], cf = BK.cargaFundacao(g, pacote.pesoCfg);
      cf.linhas.forEach(function (l, i) { linhasCarga.push({ id: g[i].id, pav: k, comp: fmtBR(l.comprimento), esp: l.espessura, placas: l.placas, peso: fmtBR(l.pesoKg), kgm: fmtBR(l.cargaKgM), kNm: fmtBR(l.cargaKNm) }); });
    });
    aba(wb, 'Cargas', [
      { h: 'Parede', k: 'id', w: 9, al: 'left' },
      { h: 'Pavimento', k: 'pav', w: 20, al: 'left' },
      { h: 'Comp. (m)', k: 'comp', w: 11, fmt: NUM },
      { h: 'Esp. (cm)', k: 'esp', w: 10, fmt: INT },
      { h: 'Placas', k: 'placas', w: 10, fmt: INT },
      { h: 'Peso próprio (kg)', k: 'peso', w: 16, fmt: NUM },
      { h: 'Carga (kg/m)', k: 'kgm', w: 13, fmt: NUM },
      { h: 'Carga (kN/m)', k: 'kNm', w: 13, fmt: NUM }
    ], linhasCarga, {
      titulo: '🏗️ Carga própria das paredes na fundação — ' + obra,
      subtitulo: 'Peso próprio LÍQUIDO (área instalada). Não inclui laje/cobertura/uso — somar no dimensionamento.',
      totais: { id: 'TOTAL', peso: fmtBR(cg.pesoTotalKg) }, filtro: true
    });

    // ===== LOGÍSTICA =====
    abaKV(wb, 'Logística', '🚚 Logística de transporte — ' + obra, [
      { titulo: 'Carga a transportar', itens: [
        ['Placas', m.totalPlacas, 'un'],
        ['Peso total (compra)', fmtBR(m.pesoTotalKg), 'kg', NUM],
        ['Peso total', fmtBR(m.pesoTotalT), 't', NUM]
      ] },
      { titulo: 'Parâmetros (editáveis)', itens: [
        ['Capacidade por viagem', lg.pesoViagemKg, 'kg'],
        ['Placas por pallet', lg.placasPallet, 'un']
      ] },
      { titulo: 'Resultado', itens: [
        ['Viagens estimadas', lg.viagens, 'viagem(ns)'],
        ['Placas por viagem (média)', lg.placasPorViagemMedia, 'un'],
        ['Pallets', lg.pallets, 'un']
      ] }
    ]);

    // ===== PARÂMETROS / PREMISSAS =====
    var pr = pacote.premissas || {};
    abaKV(wb, 'Parâmetros', '⚙️ Parâmetros e premissas — ' + obra, [
      { titulo: 'Painel Blocok', itens: [
        ['Placa (face)', '90 × 90', 'cm'],
        ['Face de micro concreto', pr.faceCm, 'cm cada (×2)'],
        ['Junta de assentamento', pacote.juntaNome, ''],
        ['Peso de referência', 46, 'kg/placa (editável)']
      ] },
      { titulo: 'Traço do micro concreto (por m³ — referência editável)', itens: [
        ['Cimento CP-V', pr.cimento, 'kg', null, 'conf'],
        ['Areia industrial', pr.areia, 'm³', null, 'conf'],
        ['Pedrisco', pr.pedrisco, 'm³', null, 'conf'],
        ['Aditivo polimérico', pr.aditivo, 'kg', null, 'conf']
      ] },
      { titulo: 'Observações', itens: [
        ['Comprimento/altura/espessura', 'extraídos do IFC (OBB 2D)', ''],
        ['Insumos', 'estimativa técnica — ajuste com a fábrica', '', null, 'conf'],
        ['Carga na fundação', 'peso próprio líquido das paredes', ''],
        ['Vãos', 'descontados quando 100% dentro do vão', '']
      ] }
    ]);

    return wb;
  }

  // ---- gerar + baixar (browser) ----
  function gerar(pacote, hooks) {
    hooks = hooks || {};
    var BK = (global.Blocok) || null;
    if (!BK) { if (hooks.erro) hooks.erro('motor Blocok ausente'); return; }
    var EX = global.ExcelOrc || global.Excel; // excel.js expõe window.ExcelOrc (carregador do ExcelJS)
    if (!EX || !EX.ensureExcelJS) { if (hooks.erro) hooks.erro('Excel indisponível'); return; }
    EX.ensureExcelJS(function () {
      try {
        Promise.resolve(construir(global.ExcelJS, pacote, BK)).then(function (wb) {
          return wb.xlsx.writeBuffer();
        }).then(function (buf) {
          var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = (hooks.nome || 'Blocok') + '.xlsx'; a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          if (hooks.ok) hooks.ok();
        }).catch(function (e) { if (hooks.erro) hooks.erro(e); });
      } catch (e) { if (hooks.erro) hooks.erro(e); }
    });
  }

  global.BlocokXLS = { construir: construir, gerar: gerar };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.BlocokXLS;
})(typeof self !== 'undefined' ? self : this);

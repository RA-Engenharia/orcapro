/* =====================================================================
 * excel.js — Exportação Excel PROFISSIONAL (workbook vivo, 3 abas)
 * Abas: Resumo · Sintética · Analítica. Tudo com FÓRMULAS (recalcula
 * ao mudar QTD, custo ou BDI) + formatação padrão de planilha
 * orçamentária (navy/aço, moeda R$, zebra, freeze, subtotais).
 * Usa ExcelJS (lazy-load CDN). `construir()` é pura/testável (Node).
 * ===================================================================== */
(function (global) {
  "use strict";

  var SH_RES = "Resumo", SH_SINT = "Sintética", SH_ANAL = "Analítica";
  var BDI_CELL = "'" + SH_RES + "'!$B$6"; // célula do BDI (parâmetro) — tudo referencia aqui
  function ref(sheet, cell) { return "'" + sheet + "'!" + cell; }

  var MOEDA = 'R$ #,##0.00', NUM = '#,##0.00', PCT = '0.00"%"';
  var navy = 'FF0F2740', aco = 'FF2E6F9E', cinza = 'FFEFF3F8', branco = 'FFFFFFFF',
      verde = 'FF16A34A', cinzaSub = 'FFE2E8F0', muted = 'FF64748B', amarelo = 'FFFFF7CC';

  function thin() { var s = { style: 'thin', color: { argb: 'FFCBD5E1' } }; return { top: s, left: s, bottom: s, right: s }; }
  function hStyle(c) { c.font = { bold: true, color: { argb: branco }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = thin(); }

  // ---------- Construtor PURO do workbook (testável em Node) ----------
  // deps: { num(v), fmtNum(v,casas), empresa }
  function construir(ExcelJS, orc, deps) {
    var num = deps.num, fmtNum = deps.fmtNum, empresa = deps.empresa || "RA Engenharia";
    var bdiPct = num(orc.bdi && orc.bdi.percentual) || 0;
    var etapas = Array.isArray(orc.etapas) ? orc.etapas : [];

    var wb = new ExcelJS.Workbook();
    wb.creator = "OrçaPRO — RA Engenharia"; wb.created = orc.criadoEm ? new Date(orc.criadoEm) : undefined;

    // abas na ORDEM de exibição pedida: Resumo, Sintética, Analítica
    var wr  = wb.addWorksheet(SH_RES,  { properties: { tabColor: { argb: verde } } });
    var wsi = wb.addWorksheet(SH_SINT, { properties: { tabColor: { argb: aco } },  views: [{ state: 'frozen', ySplit: 6 }] });
    var wa  = wb.addWorksheet(SH_ANAL, { properties: { tabColor: { argb: navy } }, views: [{ state: 'frozen', ySplit: 6 }] });
    var abc = deps.abc, crono = deps.crono, insMap = deps.insumosMap; // opcionais
    var wins = insMap ? wb.addWorksheet("Insumos", { properties: { tabColor: { argb: 'FF0EA5E9' } }, views: [{ state: 'frozen', ySplit: 5 }] }) : null;
    var wabc = abc   ? wb.addWorksheet("Curva ABC",  { properties: { tabColor: { argb: 'FFF59E0B' } }, views: [{ state: 'frozen', ySplit: 7 }] }) : null;
    var wcr  = crono ? wb.addWorksheet("Cronograma", { properties: { tabColor: { argb: 'FF8B5CF6' } }, views: [{ state: 'frozen', ySplit: 4 }] }) : null;

    // ===================== ANALÍTICA (preenche 1º p/ saber as linhas) =====================
    wa.columns = [{ width: 6 }, { width: 12 }, { width: 11 }, { width: 50 }, { width: 7 }, { width: 10 }, { width: 14 }, { width: 15 }, { width: 14 }, { width: 16 }];
    wa.mergeCells('A1:J1'); wa.getCell('A1').value = empresa; wa.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
    wa.mergeCells('A2:J2'); wa.getCell('A2').value = 'PLANILHA ORÇAMENTÁRIA ANALÍTICA — ' + (orc.numero || '') + (orc.nome ? ' · ' + orc.nome : ''); wa.getCell('A2').font = { bold: true, size: 11 };
    wa.mergeCells('A3:J3'); wa.getCell('A3').value = 'Cliente: ' + ((orc.cliente && orc.cliente.nome) || '-') + '   |   Obra: ' + ((orc.obra && orc.obra.nome) || '-') + (orc.obra && orc.obra.local ? ' (' + orc.obra.local + ')' : ''); wa.getCell('A3').font = { size: 9, color: { argb: muted } };
    wa.mergeCells('A4:J4'); wa.getCell('A4').value = 'SINAPI ' + (orc.competenciaSinapi || '') + '/' + (orc.uf || '') + '   |   BDI ' + fmtNum(bdiPct, 2) + '%   |   ' + (orc.desonerado ? 'Desonerado' : 'Não desonerado'); wa.getCell('A4').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };

    var hr = 6, colsA = ['Item', 'Código', 'Fonte', 'Descrição', 'Und', 'Qtd', 'Custo Unit', 'Custo Total', 'Preço Unit c/BDI', 'Preço Total c/BDI'];
    colsA.forEach(function (h, i) { hStyle(wa.getRow(hr).getCell(i + 1)); wa.getRow(hr).getCell(i + 1).value = h; });

    var r = hr + 1, n = 0, subCustoCells = [], etInfo = [], grandCusto = 0, grandMO = 0, grandMAT = 0, grandEQ = 0;
    etapas.forEach(function (et) {
      wa.mergeCells('A' + r + ':J' + r);
      var bc = wa.getCell('A' + r); bc.value = (et.codigo ? et.codigo + '  ' : '') + (et.nome || 'Etapa'); bc.font = { bold: true, color: { argb: branco } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aco } }; bc.border = thin();
      r++;
      var first = r, etCusto = 0, etVenda = 0;
      (Array.isArray(et.itens) ? et.itens : []).forEach(function (it) {
        n++; var row = wa.getRow(r);
        var qt = num(it.quantidade), cu = num(it.custoUnitario);
        var ct = qt * cu, pu = cu * (1 + bdiPct / 100), pt = qt * pu;
        etCusto += ct; etVenda += pt;
        // quebra MO/MAT/EQ do item (razão da composição analítica × custo real; próprio → material)
        var ana = insMap && insMap[String(it.codigo)];
        if (ana && ana.custoUnitario > 0) {
          grandMO += ct * ((ana.custoMO || 0) / ana.custoUnitario);
          grandMAT += ct * ((ana.custoMAT || 0) / ana.custoUnitario);
          grandEQ += ct * ((ana.custoEQ || 0) / ana.custoUnitario);
        } else { grandMAT += ct; }
        row.getCell(1).value = n;
        row.getCell(2).value = it.codigo || '';
        row.getCell(3).value = (it.origem === 'SINAPI') ? 'SINAPI' : 'Própria';
        row.getCell(4).value = it.descricao || '';
        row.getCell(5).value = it.unidade || 'un';
        row.getCell(6).value = qt;
        row.getCell(7).value = cu;
        row.getCell(8).value  = { formula: 'F' + r + '*G' + r, result: ct };
        row.getCell(9).value  = { formula: 'G' + r + '*(1+' + BDI_CELL + '/100)', result: pu };
        row.getCell(10).value = { formula: 'F' + r + '*I' + r, result: pt };
        row.getCell(6).numFmt = NUM;
        [7, 8, 9, 10].forEach(function (k) { row.getCell(k).numFmt = MOEDA; });
        row.getCell(3).alignment = { horizontal: 'center' };
        for (var k = 1; k <= 10; k++) { row.getCell(k).border = thin(); if (n % 2 === 0) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
        r++;
      });
      var last = r - 1, sr = wa.getRow(r);
      sr.getCell(4).value = 'Subtotal — ' + (et.nome || 'Etapa'); sr.getCell(4).font = { bold: true };
      if (last >= first) {
        sr.getCell(8).value = { formula: 'SUM(H' + first + ':H' + last + ')', result: etCusto };
        sr.getCell(10).value = { formula: 'SUM(J' + first + ':J' + last + ')', result: etVenda };
      } else { sr.getCell(8).value = 0; sr.getCell(10).value = 0; }
      [8, 10].forEach(function (k) { sr.getCell(k).numFmt = MOEDA; sr.getCell(k).font = { bold: true }; sr.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinzaSub } }; });
      subCustoCells.push('H' + r);
      etInfo.push({ nome: et.nome || 'Etapa', codigo: et.codigo || '', subRow: r, custo: etCusto, venda: etVenda });
      grandCusto += etCusto;
      r++;
    });
    r++;
    var gCustoRow = r;
    wa.getCell('D' + r).value = 'CUSTO DIRETO (sem BDI)'; wa.getCell('D' + r).font = { bold: true };
    wa.getCell('H' + r).value = { formula: subCustoCells.join('+') || '0', result: grandCusto }; wa.getCell('H' + r).numFmt = MOEDA; wa.getCell('H' + r).font = { bold: true };
    r++; var gBdiRow = r;
    wa.getCell('D' + r).value = 'BDI (' + fmtNum(bdiPct, 2) + '%)'; wa.getCell('D' + r).font = { bold: true };
    wa.getCell('H' + r).value = { formula: 'H' + gCustoRow + '*' + BDI_CELL + '/100', result: grandCusto * bdiPct / 100 }; wa.getCell('H' + r).numFmt = MOEDA;
    r++; var gVendaRow = r;
    wa.getCell('D' + r).value = 'PREÇO DE VENDA (com BDI)'; wa.getCell('D' + r).font = { bold: true, size: 12, color: { argb: branco } }; wa.getCell('D' + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
    wa.getCell('H' + r).value = { formula: 'H' + gCustoRow + '+H' + gBdiRow, result: grandCusto * (1 + bdiPct / 100) }; wa.getCell('H' + r).numFmt = MOEDA; wa.getCell('H' + r).font = { bold: true, size: 12, color: { argb: branco } }; wa.getCell('H' + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };

    // ===================== SINTÉTICA =====================
    wsi.columns = [{ width: 10 }, { width: 46 }, { width: 16 }, { width: 9 }, { width: 15 }, { width: 17 }, { width: 10 }];
    wsi.mergeCells('A1:G1'); wsi.getCell('A1').value = empresa; wsi.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
    wsi.mergeCells('A2:G2'); wsi.getCell('A2').value = 'PLANILHA SINTÉTICA (por etapa) — ' + (orc.numero || ''); wsi.getCell('A2').font = { bold: true, size: 11 };
    wsi.mergeCells('A3:G3'); wsi.getCell('A3').value = 'Cliente: ' + ((orc.cliente && orc.cliente.nome) || '-') + '   |   ' + ((orc.obra && orc.obra.nome) || '-'); wsi.getCell('A3').font = { size: 9, color: { argb: muted } };
    var colsS = ['Item', 'Etapa', 'Custo Direto', 'BDI %', 'BDI (R$)', 'Preço de Venda', 'Peso %'];
    colsS.forEach(function (h, i) { hStyle(wsi.getRow(6).getCell(i + 1)); wsi.getRow(6).getCell(i + 1).value = h; });
    var s0 = 7, sr = s0, totVenda = grandCusto * (1 + bdiPct / 100);
    etInfo.forEach(function (et, i) {
      var row = wsi.getRow(sr);
      row.getCell(1).value = et.codigo || ((i + 1) + '.0');
      row.getCell(2).value = et.nome;
      row.getCell(3).value = { formula: ref(SH_ANAL, 'H' + et.subRow), result: et.custo };
      row.getCell(4).value = { formula: BDI_CELL, result: bdiPct };
      row.getCell(5).value = { formula: 'C' + sr + '*' + BDI_CELL + '/100', result: et.custo * bdiPct / 100 };
      row.getCell(6).value = { formula: 'C' + sr + '+E' + sr, result: et.venda };
      row.getCell(3).numFmt = MOEDA; row.getCell(4).numFmt = PCT; row.getCell(5).numFmt = MOEDA; row.getCell(6).numFmt = MOEDA;
      for (var k = 1; k <= 7; k++) { row.getCell(k).border = thin(); if (i % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
      sr++;
    });
    var sintTot = sr, tr = wsi.getRow(sr);
    tr.getCell(2).value = 'TOTAL';
    tr.getCell(3).value = { formula: 'SUM(C' + s0 + ':C' + (sr - 1) + ')', result: grandCusto };
    tr.getCell(5).value = { formula: 'SUM(E' + s0 + ':E' + (sr - 1) + ')', result: grandCusto * bdiPct / 100 };
    tr.getCell(6).value = { formula: 'SUM(F' + s0 + ':F' + (sr - 1) + ')', result: totVenda };
    [2, 3, 5, 6].forEach(function (k) { tr.getCell(k).font = { bold: true, color: { argb: branco } }; tr.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; });
    [3, 5, 6].forEach(function (k) { tr.getCell(k).numFmt = MOEDA; });
    // peso % (precisa do total)
    for (var i = 0; i < etInfo.length; i++) {
      var rr = s0 + i, cell = wsi.getCell('G' + rr);
      cell.value = { formula: 'F' + rr + '/$F$' + sintTot + '*100', result: totVenda ? (etInfo[i].venda / totVenda * 100) : 0 };
      cell.numFmt = PCT;
    }

    // ===================== RESUMO (B6 = BDI parâmetro) =====================
    wr.columns = [{ width: 26 }, { width: 34 }];
    wr.mergeCells('A1:B1'); wr.getCell('A1').value = empresa; wr.getCell('A1').font = { bold: true, size: 16, color: { argb: navy } };
    wr.mergeCells('A2:B2'); wr.getCell('A2').value = 'RESUMO DO ORÇAMENTO — ' + (orc.numero || ''); wr.getCell('A2').font = { bold: true, size: 11, color: { argb: muted } };
    function lin(rw, lab, val, fmt, opt) {
      opt = opt || {};
      var a = wr.getCell('A' + rw), b = wr.getCell('B' + rw);
      a.value = lab; a.font = { bold: true, color: { argb: opt.head ? branco : navy } };
      b.value = val; if (fmt) b.numFmt = fmt;
      b.font = { bold: !!opt.bold || !!opt.head, size: opt.size || 11, color: { argb: opt.head ? branco : 'FF1E293B' } };
      if (opt.head) { a.fill = b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; }
      a.border = b.border = thin();
    }
    lin(4, 'Cliente', (orc.cliente && orc.cliente.nome) || '-');
    lin(5, 'Obra / Local', ((orc.obra && orc.obra.nome) || '-') + (orc.obra && orc.obra.local ? ' — ' + orc.obra.local : ''));
    lin(6, 'BDI (%)  ⟵ edite aqui', bdiPct, '0.00');
    wr.getCell('B6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: amarelo } }; wr.getCell('B6').font = { bold: true };
    lin(7, 'Competência SINAPI', (orc.competenciaSinapi || '-') + ' / ' + (orc.uf || '-'));
    lin(8, 'Nº de etapas / itens', etapas.length + ' / ' + n);
    lin(10, 'Custo Direto (sem BDI)', { formula: ref(SH_SINT, 'C' + sintTot), result: grandCusto }, MOEDA, { bold: true });
    lin(11, 'BDI (R$)', { formula: 'B10*$B$6/100', result: grandCusto * bdiPct / 100 }, MOEDA, { bold: true });
    lin(12, 'PREÇO DE VENDA', { formula: 'B10+B11', result: totVenda }, MOEDA, { head: true, bold: true, size: 13 });
    wr.getCell('A14').value = 'Dica: altere a QTD/custo na aba Analítica ou o BDI em B6 — Sintética e Resumo recalculam sozinhos.';
    wr.mergeCells('A14:B15'); wr.getCell('A14').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } }; wr.getCell('A14').alignment = { wrapText: true, vertical: 'top' };

    // Composição de custo MO/MAT/EQ (derivada da base analítica)
    if (insMap) {
      var gCat = (grandMO + grandMAT + grandEQ) || 1;
      wr.mergeCells('A17:B17'); wr.getCell('A17').value = 'COMPOSIÇÃO DE CUSTO (MO / MAT / EQ)'; wr.getCell('A17').font = { bold: true, color: { argb: navy } };
      lin(18, 'Mão de obra — ' + fmtNum(grandMO / gCat * 100, 1) + '%', grandMO, MOEDA);
      lin(19, 'Material — ' + fmtNum(grandMAT / gCat * 100, 1) + '%', grandMAT, MOEDA);
      lin(20, 'Equipamento — ' + fmtNum(grandEQ / gCat * 100, 1) + '%', grandEQ, MOEDA);
      wr.getCell('A21').value = 'Itens sem código SINAPI entram como material.'; wr.mergeCells('A21:B21'); wr.getCell('A21').font = { italic: true, size: 8, color: { argb: '#94A3B8'.replace('#', 'FF') } };
    }

    // ===================== CURVA ABC =====================
    if (wabc) {
      var corCl = { A: 'FF16A34A', B: 'FFF59E0B', C: 'FF94A3B8' };
      wabc.columns = [{ width: 8 }, { width: 12 }, { width: 48 }, { width: 7 }, { width: 10 }, { width: 15 }, { width: 9 }, { width: 10 }];
      wabc.mergeCells('A1:H1'); wabc.getCell('A1').value = empresa; wabc.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wabc.mergeCells('A2:H2'); wabc.getCell('A2').value = 'CURVA ABC — ' + (orc.numero || ''); wabc.getCell('A2').font = { bold: true, size: 11 };
      ['Classe', 'Itens', 'Valor', '% do total'].forEach(function (h, i) { var c = wabc.getRow(4).getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: muted } }; });
      ['A', 'B', 'C'].forEach(function (cl, i) {
        var rr = 5 + i, rs = (abc.resumo && abc.resumo[cl]) || { qtd: 0, valor: 0, pct: 0 };
        wabc.getCell('A' + rr).value = 'Classe ' + cl; wabc.getCell('A' + rr).font = { bold: true, color: { argb: corCl[cl] } };
        wabc.getCell('B' + rr).value = rs.qtd;
        wabc.getCell('C' + rr).value = num(rs.valor); wabc.getCell('C' + rr).numFmt = MOEDA;
        wabc.getCell('D' + rr).value = num(rs.pct) / 100; wabc.getCell('D' + rr).numFmt = '0.0%';
      });
      var hh = 8, colsABC = ['Classe', 'Código', 'Descrição', 'Und', 'Qtd', 'Custo Total', '%', '% Acum.'];
      colsABC.forEach(function (h, i) { hStyle(wabc.getRow(hh).getCell(i + 1)); wabc.getRow(hh).getCell(i + 1).value = h; });
      var ar = hh + 1;
      (abc.linhas || []).forEach(function (l, idx) {
        var row = wabc.getRow(ar);
        row.getCell(1).value = l.classe; row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(1).font = { bold: true, color: { argb: corCl[l.classe] || navy } };
        row.getCell(2).value = l.codigo || ''; row.getCell(3).value = l.descricao || ''; row.getCell(4).value = l.unidade || '';
        row.getCell(5).value = num(l.quantidade); row.getCell(5).numFmt = NUM;
        row.getCell(6).value = num(l.custoTotal); row.getCell(6).numFmt = MOEDA;
        row.getCell(7).value = num(l.pct) / 100; row.getCell(7).numFmt = '0.0%';
        row.getCell(8).value = num(l.acumPct) / 100; row.getCell(8).numFmt = '0.0%';
        for (var k = 1; k <= 8; k++) { row.getCell(k).border = thin(); if (idx % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
        ar++;
      });
    }

    // ===================== CRONOGRAMA FÍSICO-FINANCEIRO =====================
    if (wcr) {
      var M = crono.meses || 0, totalIdx = M + 2;
      var ws2 = [{ width: 34 }]; for (var m = 0; m < M; m++) ws2.push({ width: 13 }); ws2.push({ width: 15 });
      wcr.columns = ws2;
      var colFirst = wcr.getColumn(2).letter, colLast = wcr.getColumn(M + 1).letter;
      wcr.mergeCells(1, 1, 1, totalIdx); wcr.getCell('A1').value = empresa; wcr.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wcr.mergeCells(2, 1, 2, totalIdx); wcr.getCell('A2').value = 'CRONOGRAMA FÍSICO-FINANCEIRO (' + M + ' meses, com BDI) — ' + (orc.numero || ''); wcr.getCell('A2').font = { bold: true, size: 11 };
      var ch = 4, chdr = ['Etapa']; for (var m = 0; m < M; m++) chdr.push('Mês ' + (m + 1)); chdr.push('Total');
      chdr.forEach(function (h, i) { hStyle(wcr.getRow(ch).getCell(i + 1)); wcr.getRow(ch).getCell(i + 1).value = h; });
      var cr = ch + 1, firstData = cr;
      (crono.etapas || []).forEach(function (et, idx) {
        var row = wcr.getRow(cr);
        row.getCell(1).value = (et.codigo ? et.codigo + ' ' : '') + (et.nome || 'Etapa');
        for (var m = 0; m < M; m++) { var c = row.getCell(2 + m); c.value = num(et.meses[m]); c.numFmt = MOEDA; c.border = thin(); }
        row.getCell(totalIdx).value = { formula: 'SUM(' + colFirst + cr + ':' + colLast + cr + ')', result: num(et.total) };
        row.getCell(totalIdx).numFmt = MOEDA; row.getCell(totalIdx).font = { bold: true };
        row.getCell(1).border = thin(); row.getCell(totalIdx).border = thin();
        if (idx % 2 === 1) for (var k = 1; k <= totalIdx; k++) if (!row.getCell(k).fill) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } };
        cr++;
      });
      var lastData = cr - 1, tot = wcr.getRow(cr);
      tot.getCell(1).value = 'TOTAL / MÊS'; tot.getCell(1).font = { bold: true, color: { argb: branco } }; tot.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      for (var m = 0; m < M; m++) {
        var L = wcr.getColumn(2 + m).letter, c = tot.getCell(2 + m);
        c.value = { formula: 'SUM(' + L + firstData + ':' + L + lastData + ')', result: num(crono.totaisMes[m]) };
        c.numFmt = MOEDA; c.font = { bold: true, color: { argb: branco } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      }
      tot.getCell(totalIdx).value = { formula: 'SUM(' + colFirst + cr + ':' + colLast + cr + ')', result: num(crono.total) };
      tot.getCell(totalIdx).numFmt = MOEDA; tot.getCell(totalIdx).font = { bold: true, color: { argb: branco } }; tot.getCell(totalIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      var acc = wcr.getRow(cr + 1);
      acc.getCell(1).value = '% acumulado'; acc.getCell(1).font = { bold: true, color: { argb: muted } };
      for (var m = 0; m < M; m++) { var c2 = acc.getCell(2 + m); c2.value = num(crono.acumPct[m]) / 100; c2.numFmt = '0.0%'; c2.font = { color: { argb: muted } }; }
    }

    // ===================== INSUMOS (composições explodidas) =====================
    if (wins) {
      var catNome = { MO: 'Mão de obra', MAT: 'Material', EQ: 'Equipamento' };
      wins.columns = [{ width: 10 }, { width: 11 }, { width: 11 }, { width: 46 }, { width: 6 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }];
      wins.mergeCells('A1:I1'); wins.getCell('A1').value = empresa; wins.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wins.mergeCells('A2:I2'); wins.getCell('A2').value = 'DETALHAMENTO DE COMPOSIÇÕES (INSUMOS) — ' + (orc.numero || ''); wins.getCell('A2').font = { bold: true, size: 11 };
      wins.mergeCells('A3:I3'); wins.getCell('A3').value = 'Cada composição SINAPI explodida nos seus insumos (referência analítica ' + (deps.analiticoComp || '') + '). MO = mão de obra · MAT = material · EQ = equipamento.'; wins.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
      var hi = ['Composição', 'Cód. Item', 'Tipo', 'Insumo', 'Und', 'Coef.', 'Custo Unit', 'Custo Total', 'Categoria'];
      hi.forEach(function (h, i) { hStyle(wins.getRow(5).getCell(i + 1)); wins.getRow(5).getCell(i + 1).value = h; });
      var ir = 6, vistos = {};
      (etapas).forEach(function (et) {
        (Array.isArray(et.itens) ? et.itens : []).forEach(function (it) {
          if (it.origem !== 'SINAPI') return;
          var a = insMap[String(it.codigo)];
          if (!a || vistos[it.codigo]) return;
          vistos[it.codigo] = 1;
          wins.mergeCells('A' + ir + ':I' + ir);
          var bc = wins.getCell('A' + ir); bc.value = it.codigo + '  ' + (a.descricao || it.descricao || ''); bc.font = { bold: true, color: { argb: branco } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aco } }; bc.border = thin();
          ir++;
          (Array.isArray(a.insumos) ? a.insumos : []).forEach(function (ins, idx) {
            var row = wins.getRow(ir);
            row.getCell(1).value = it.codigo;
            row.getCell(2).value = ins.codigo;
            row.getCell(3).value = (ins.tipo === 'COMPOSICAO') ? 'Sub-comp.' : 'Insumo';
            row.getCell(4).value = ins.descricao;
            row.getCell(5).value = ins.unidade;
            row.getCell(6).value = num(ins.coeficiente); row.getCell(6).numFmt = '#,##0.0000';
            row.getCell(7).value = num(ins.custoUnitario); row.getCell(7).numFmt = MOEDA;
            row.getCell(8).value = num(ins.custoTotal); row.getCell(8).numFmt = MOEDA;
            row.getCell(9).value = catNome[ins.categoria] || ins.categoria;
            for (var k = 1; k <= 9; k++) { row.getCell(k).border = thin(); if (idx % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
            ir++;
          });
          var sr = wins.getRow(ir);
          sr.getCell(4).value = 'Σ  MO ' + fmtNum(a.custoMO, 2) + '  |  MAT ' + fmtNum(a.custoMAT, 2) + '  |  EQ ' + fmtNum(a.custoEQ, 2);
          sr.getCell(4).font = { bold: true, italic: true, color: { argb: muted } };
          sr.getCell(8).value = num(a.custoUnitario); sr.getCell(8).numFmt = MOEDA; sr.getCell(8).font = { bold: true }; sr.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinzaSub } };
          ir++;
        });
      });
    }

    // ===================== GANTT (agente de cronograma) =====================
    var cronoAg = deps.cronoAgente;
    if (cronoAg && cronoAg.etapas && cronoAg.etapas.length) {
      var fmtData = function (d) { return (d && d.toLocaleDateString) ? d.toLocaleDateString('pt-BR') : ''; };
      var nSem = cronoAg.totalSemanas || 1, dpw = (cronoAg.params && cronoAg.params.diasUteisSemana) || 5;
      var wg = wb.addWorksheet("Gantt", { properties: { tabColor: { argb: 'FF0EA5E9' } }, views: [{ state: 'frozen', xSplit: 5, ySplit: 5 }] });
      var gcols = [{ width: 30 }, { width: 18 }, { width: 7 }, { width: 11 }, { width: 11 }];
      for (var gs = 0; gs < nSem; gs++) gcols.push({ width: 3.4 });
      wg.columns = gcols;
      wg.mergeCells(1, 1, 1, 5 + nSem); wg.getCell('A1').value = empresa; wg.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wg.mergeCells(2, 1, 2, 5 + nSem); wg.getCell('A2').value = 'CRONOGRAMA / GANTT — ' + (orc.numero || ''); wg.getCell('A2').font = { bold: true, size: 11 };
      wg.mergeCells(3, 1, 3, 5 + nSem); wg.getCell('A3').value = 'Estimado pelo agente: ' + cronoAg.totalDias + ' dias úteis (~' + nSem + ' semanas) · Início ' + fmtData(cronoAg.dataInicio) + ' → Fim ' + fmtData(cronoAg.dataFim) + '. Edite no app (aba Cronograma).'; wg.getCell('A3').font = { italic: true, size: 9, color: { argb: muted } };
      ['Etapa', 'Categoria', 'Dias', 'Início', 'Fim'].forEach(function (h, i) { hStyle(wg.getRow(5).getCell(i + 1)); wg.getRow(5).getCell(i + 1).value = h; });
      for (var gh = 0; gh < nSem; gh++) { var hc = wg.getRow(5).getCell(6 + gh); hStyle(hc); hc.value = 'S' + (gh + 1); hc.alignment = { horizontal: 'center' }; }
      var grow = 6;
      cronoAg.etapas.forEach(function (e) {
        var row = wg.getRow(grow);
        row.getCell(1).value = (e.codigo ? e.codigo + ' ' : '') + e.nome;
        row.getCell(2).value = e.categoriaNome || e.categoria;
        row.getCell(3).value = e.duracao;
        row.getCell(4).value = fmtData(e.dataInicio);
        row.getCell(5).value = fmtData(e.dataFim);
        var argbCor = 'FF' + String(e.cor || '#0EA5E9').replace('#', '').toUpperCase();
        var s0 = Math.floor(e.inicio / dpw), s1 = Math.max(s0 + 1, Math.ceil(e.fim / dpw));
        for (var k = 1; k <= 5; k++) row.getCell(k).border = thin();
        for (var gw = 0; gw < nSem; gw++) {
          var cc = row.getCell(6 + gw); cc.border = thin();
          if (gw >= s0 && gw < s1) cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbCor } };
        }
        grow++;
      });
    }

    return wb;
  }

  // ---------- Camada browser ----------
  var ExcelOrc = {
    construir: construir,

    ensureExcelJS: function (cb) {
      if (global.ExcelJS) { cb(); return; }
      if (document.getElementById("exceljs-cdn")) {
        var t = setInterval(function () { if (global.ExcelJS) { clearInterval(t); cb(); } }, 120);
        setTimeout(function () { clearInterval(t); }, 15000); return;
      }
      var s = document.createElement("script"); s.id = "exceljs-cdn";
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      s.onload = function () { cb(); };
      s.onerror = function () { if (global.UI) UI.toast("Não foi possível carregar o gerador Excel (sem internet?).", "erro"); };
      document.head.appendChild(s);
    },

    gerar: function (orc) {
      this.ensureExcelJS(function () {
        var finalizar = function (insumosMap) {
          try {
            var deps = {
              num: Util.num,
              fmtNum: Util.fmtNum,
              empresa: (Auth.usuario && Auth.usuario()) ? Auth.usuario().empresa : (CONFIG.marca.fabricante || "RA Engenharia"),
              abc: (typeof Orcamento.curvaABC === "function") ? Orcamento.curvaABC(orc) : null,
              crono: (typeof Orcamento.cronograma === "function") ? Orcamento.cronograma(orc, orc.cronogramaMeses) : null,
              cronoAgente: (typeof Cronograma !== "undefined") ? Cronograma.estimar(orc) : null,
              insumosMap: insumosMap,
              analiticoComp: (typeof Analitico !== "undefined" && Analitico.carregado) ? (Analitico.competencia + "/" + Analitico.uf) : ""
            };
            var wb = construir(global.ExcelJS, orc, deps);
            wb.xlsx.writeBuffer().then(function (buf) {
              var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = (orc.numero || 'orcamento') + '_PRO.xlsx';
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
              if (global.UI) UI.toast(insumosMap ? "Excel gerado (com aba Insumos)!" : "Excel gerado (com fórmulas)!", "ok");
            }).catch(function (e) { console.error('[excel write]', e); if (global.UI) UI.toast("Falha ao escrever Excel: " + e.message, "erro"); });
          } catch (e) { console.error('[excel]', e); if (global.UI) UI.toast("Falha ao gerar Excel: " + e.message, "erro"); }
        };
        // tenta incluir a aba "Insumos" (carrega a base analítica sob demanda)
        var montarMapa = function () {
          var m = {};
          (orc.etapas || []).forEach(function (et) {
            (et.itens || []).forEach(function (it) {
              if (it.origem === "SINAPI") { var a = Analitico.obter(it.codigo); if (a) m[String(it.codigo)] = a; }
            });
          });
          return m;
        };
        if (typeof Analitico === "undefined") { finalizar(null); return; }
        if (Analitico.carregado) { finalizar(montarMapa()); return; }
        if (global.UI) UI.toast("Carregando insumos p/ o Excel (~17 MB, 1ª vez)…", "ok");
        Analitico.carregarArquivo().then(function () { finalizar(montarMapa()); }).catch(function () { finalizar(null); });
      });
    }
  };

  if (global) global.ExcelOrc = ExcelOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = ExcelOrc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

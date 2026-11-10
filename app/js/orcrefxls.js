/* =====================================================================
 * orcrefxls.js — XLSX do PACOTE DO ORÇAMENTO DE REFERÊNCIA (leva G2, 10/11/2026)
 *
 * Recebe os `dados` de OrcamentoReferencia.montar() e escreve uma planilha com FÓRMULAS VIVAS: o servidor da
 * prefeitura muda quantidade ou custo e preço unitário, total, subtotais, peso, curva ABC, BDI, cronograma e
 * mapa de cotação recalculam, com o MESMO critério de arredondamento do orçamento (TRUNC ou ROUND, `Arred`).
 * Cada fórmula leva o resultado já calculado (`result`), para quem abre sem recalcular ver o mesmo número.
 *
 * ⚠ Não calcula nada por conta própria: só escreve o que `montar` já provou fechar com o orçamento ao centavo.
 * ⚠ Colunas ocultas L (custo base, precisão cheia) e M (custo total): o preço unitário do motor parte do custo
 *   SEM arredondar; escondê-las é o que deixa a coluna G (custo unitário impresso) honesta sem mudar o preço.
 * Recebe o ExcelJS por parâmetro (testável em Node). ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NAVY = "FF0F2740", ACO = "FF1858A8", BRANCO = "FFFFFFFF", CINZA = "FFF1F5F9", SUB = "FFE2E8F0", VERM = "FFC00000";
  var NUM = "#,##0.00", MOEDA = "R$ #,##0.00", PCT = '0.00"%"', COEF = "#,##0.00000";

  function s(v) { return String(v == null ? "" : v); }
  function thin() { var b = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: b, left: b, bottom: b, right: b }; }
  function nomeAba(n) { return s(n).replace(/[:\\\/?*\[\]]/g, "-").slice(0, 31); }
  function colL(n) { var r = ""; while (n > 0) { var m = (n - 1) % 26; r = String.fromCharCode(65 + m) + r; n = Math.floor((n - 1) / 26); } return r; }

  function construir(ExcelJS, d) {
    var A = global.Arred || (typeof require === "function" ? require("./arredondamento.js") : null);
    var modo = d.modo;
    function wrap(expr, uni) {
      if (modo === "nenhum") return expr;
      var trunca = modo === "truncar2" || (uni && modo === "arred2truncpu");
      return (trunca ? "TRUNC(" : "ROUND(") + expr + ",2)";
    }
    var fV = function (e) { return wrap(e, false); }, fU = function (e) { return wrap(e, true); };
    var aV = function (v) { return A ? A.valor(v, modo) : v; };

    var wb = new ExcelJS.Workbook();
    wb.creator = s(d.emp && d.emp.nome) || "OrçaPRO"; wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };

    var wr = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: "FF16A34A" } } });
    var wsi = wb.addWorksheet("Sintética", { properties: { tabColor: { argb: ACO } } });
    var wan = wb.addWorksheet("Analítica", { properties: { tabColor: { argb: NAVY } } });
    var wbd = wb.addWorksheet("BDI", { properties: { tabColor: { argb: "FFF59E0B" } } });
    var wen = wb.addWorksheet("Encargos", { properties: { tabColor: { argb: "FFF59E0B" } } });
    var wa1 = wb.addWorksheet("Curva ABC Serviços", { properties: { tabColor: { argb: "FF8B5CF6" } } });
    var wa2 = wb.addWorksheet("Curva ABC Insumos", { properties: { tabColor: { argb: "FF8B5CF6" } } });
    var wcr = wb.addWorksheet("Cronograma", { properties: { tabColor: { argb: "FF0EA5E9" } } });
    var wme = wb.addWorksheet("Memória de Cálculo", { properties: { tabColor: { argb: "FF64748B" } } });
    var wco = wb.addWorksheet("Mapa de Cotação", { properties: { tabColor: { argb: "FF64748B" } } });
    var wca = d.caixa ? wb.addWorksheet("CAIXA - Repasse", { properties: { tabColor: { argb: "FF2563EB" } } }) : null;
    var wde = wb.addWorksheet("Declarações", { properties: { tabColor: { argb: "FF16A34A" } } });
    var wpe = (!d.pronto || d.pend.conferir.length) ? wb.addWorksheet("Pendências", { properties: { tabColor: { argb: VERM } } }) : null;

    function cab(ws, titulo, ncol) {
      ws.mergeCells(1, 1, 1, ncol); var c = ws.getCell(1, 1); c.value = titulo; c.font = { bold: true, size: 13, color: { argb: NAVY } };
      ws.mergeCells(2, 1, 2, ncol); var c2 = ws.getCell(2, 1);
      c2.value = "Órgão: " + (d.cab.orgao || "[PREENCHER: órgão]") + "  ·  Obra: " + (d.cab.obra || "[PREENCHER: obra]") + "  ·  " + (d.cab.local || "[PREENCHER: local]") + (d.cab.uf ? "/" + d.cab.uf : "");
      c2.font = { size: 9, color: { argb: "FF475569" } };
      ws.mergeCells(3, 1, 3, ncol); var c3 = ws.getCell(3, 1);
      c3.value = "Bases: " + (d.cab.dataBase || "não informadas") + "  ·  Regime: " + d.cab.regime + "  ·  BDI: " + d.bdiPct + "%  ·  " + d.cab.incidencia + "  ·  " + d.cab.arredondamento;
      c3.font = { size: 9, color: { argb: "FF475569" } };
      if (!d.pronto) { ws.mergeCells(4, 1, 4, ncol); var c4 = ws.getCell(4, 1); c4.value = "COM PENDÊNCIAS — NÃO PUBLICAR (ver a aba Pendências)"; c4.font = { bold: true, color: { argb: VERM } }; }
    }
    function head(ws, row, titulos) {
      titulos.forEach(function (t, i) {
        var c = ws.getCell(row, i + 1); c.value = t; c.font = { bold: true, color: { argb: BRANCO }, size: 10 };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = thin();
      });
      ws.getRow(row).height = 28;
    }
    function larg(ws, ws2) { ws2.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }
    function borda(ws, r, n) { for (var k = 1; k <= n; k++) ws.getCell(r, k).border = thin(); }
    function faixa(ws, r, n, texto, cor) {
      ws.mergeCells(r, 1, r, n); var c = ws.getCell(r, 1); c.value = texto; c.font = { bold: true, color: { argb: BRANCO } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor || ACO } }; c.border = thin();
    }

    /* ============================ RESUMO ============================ */
    larg(wr, [38, 70]);
    cab(wr, "Orçamento de referência — Resumo", 2);
    var rowsR = [
      ["Órgão contratante", d.cab.orgao || "[PREENCHER: órgão]"], ["Obra", d.cab.obra || "[PREENCHER: obra]"], ["Objeto", d.cab.objeto || "[PREENCHER: objeto]"],
      ["Local / UF", (d.cab.local || "[PREENCHER: local]") + (d.cab.uf ? " / " + d.cab.uf : "")], ["Processo", d.cab.processo || "—"], ["Orçamento nº", d.cab.numero],
      ["Bases e competências", d.cab.dataBase || "não informadas"], ["Regime dos encargos", d.cab.regime],
      ["Critério de arredondamento", d.cab.arredondamento], ["Incidência do BDI", d.cab.incidencia]
    ];
    var r0 = 6; rowsR.forEach(function (x, i) { wr.getCell(r0 + i, 1).value = x[0]; wr.getCell(r0 + i, 1).font = { bold: true }; wr.getCell(r0 + i, 2).value = x[1]; borda(wr, r0 + i, 2); });
    var rBdi = r0 + rowsR.length;               // célula do BDI: nome definido p_BDI
    wr.getCell(rBdi, 1).value = "BDI aplicado (%)"; wr.getCell(rBdi, 1).font = { bold: true };
    wr.getCell(rBdi, 2).value = d.bdiPct; wr.getCell(rBdi, 2).numFmt = PCT; wr.getCell(rBdi, 2).alignment = { horizontal: "left" }; borda(wr, rBdi, 2);
    wb.definedNames.add("Resumo!$B$" + rBdi, "p_BDI");
    var rCd = rBdi + 1, rBv = rBdi + 2, rTt = rBdi + 3, rCk = rBdi + 4;
    ["Custo direto", "BDI (R$)", "TOTAL GERAL", "Total no OrçaPRO (conferência)", "Diferença (deve ser zero)"].forEach(function (t, i) { wr.getCell(rCd + i, 1).value = t; wr.getCell(rCd + i, 1).font = { bold: true }; borda(wr, rCd + i, 2); });
    var rDif = rCk + 1;
    var rr = r0 + rowsR.length + 6;
    [["Responsável técnico", d.rt.nome || "[PREENCHER: nome]"], ["Registro", d.rt.registro || "[PREENCHER: registro CREA/CAU]"], [d.art.tipo + " do orçamento", d.art.numero || "[PREENCHER: número da ART/RRT]"]].forEach(function (x, i) {
      wr.getCell(rr + 1 + i, 1).value = x[0]; wr.getCell(rr + 1 + i, 1).font = { bold: true }; wr.getCell(rr + 1 + i, 2).value = x[1]; borda(wr, rr + 1 + i, 2);
    });

    /* ============================ SINTÉTICA ============================ */
    larg(wsi, [9, 14, 13, 52, 7, 12, 14, 8, 15, 17, 9, 13, 15]);
    wsi.getColumn(12).hidden = true; wsi.getColumn(13).hidden = true;
    cab(wsi, "Planilha orçamentária sintética", 11);
    var HR = 6;
    head(wsi, HR, ["ITEM", "CÓDIGO", "FONTE", "DESCRIÇÃO", "UN.", "QUANT.", "CUSTO UNIT. S/ BDI", "BDI %", "PREÇO UNIT. C/ BDI", d.bdiNoPU ? "TOTAL" : "TOTAL (CUSTO)", "PESO %", "Custo base (precisão cheia)", "Custo total s/ BDI"]);
    wsi.views = [{ state: "frozen", ySplit: HR }];
    var r = HR + 1, subRows = [], rowDe = {}, subDe = {}, firstItem = r;
    var totCell = null;                // preenchido depois (linha do TOTAL GERAL)
    var pesoFormulas = [];             // [{row, valor}] para fechar com o total depois
    d.etapas.forEach(function (E) {
      faixa(wsi, r, 11, E.numero + "  " + E.nome + (E.opcional ? "  (opcional)" : ""), ACO); r++;
      var f1 = r;
      E.itens.forEach(function (I, k) {
        wsi.getCell(r, 1).value = I.numero; wsi.getCell(r, 2).value = I.codigo; wsi.getCell(r, 3).value = I.fonte; wsi.getCell(r, 4).value = I.descricao; wsi.getCell(r, 5).value = I.unidade;
        wsi.getCell(r, 6).value = I.quantidade; wsi.getCell(r, 6).numFmt = NUM;
        wsi.getCell(r, 12).value = I.custoBase; wsi.getCell(r, 12).numFmt = "#,##0.0000";
        wsi.getCell(r, 7).value = { formula: fU("L" + r), result: I.cu }; wsi.getCell(r, 7).numFmt = MOEDA;
        if (d.bdiNoPU) wsi.getCell(r, 8).value = { formula: "p_BDI", result: d.bdiPct }; else wsi.getCell(r, 8).value = "—";
        wsi.getCell(r, 8).numFmt = PCT;
        wsi.getCell(r, 9).value = { formula: d.bdiNoPU ? fU("L" + r + "*(1+H" + r + "/100)") : fU("L" + r), result: I.pu }; wsi.getCell(r, 9).numFmt = MOEDA;
        wsi.getCell(r, 10).value = { formula: fV("F" + r + "*I" + r), result: d.bdiNoPU ? I.pt : aV(I.quantidade * I.pu) }; wsi.getCell(r, 10).numFmt = MOEDA;
        wsi.getCell(r, 13).value = { formula: fV("F" + r + "*G" + r), result: I.ct }; wsi.getCell(r, 13).numFmt = MOEDA;
        borda(wsi, r, 11);
        [6, 7, 9].forEach(function (c) { wsi.getCell(r, c).protection = { locked: false }; });
        if (k % 2) for (var c2 = 1; c2 <= 11; c2++) wsi.getCell(r, c2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
        rowDe[I.numero] = r; pesoFormulas.push({ row: r, valor: d.bdiNoPU ? I.pt : I.ct });
        r++;
      });
      var f2 = r - 1;
      wsi.mergeCells(r, 1, r, 9);
      wsi.getCell(r, 1).value = "Subtotal da etapa " + E.numero; wsi.getCell(r, 1).alignment = { horizontal: "right" }; wsi.getCell(r, 1).font = { bold: true };
      wsi.getCell(r, 10).value = { formula: "SUM(J" + f1 + ":J" + f2 + ")", result: E.total }; wsi.getCell(r, 10).numFmt = MOEDA; wsi.getCell(r, 10).font = { bold: true };
      for (var c3 = 1; c3 <= 11; c3++) wsi.getCell(r, c3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB } };
      borda(wsi, r, 11);
      subRows.push(r); subDe[E.numero] = r; pesoFormulas.push({ row: r, valor: E.total });
      r++;
    });
    var rCusto = null, rBdiL = null;
    if (!d.bdiNoPU) {
      wsi.mergeCells(r, 1, r, 9); wsi.getCell(r, 1).value = "Custo direto"; wsi.getCell(r, 1).alignment = { horizontal: "right" };
      wsi.getCell(r, 10).value = { formula: subRows.map(function (x) { return "J" + x; }).join("+"), result: d.tot.custoDireto }; wsi.getCell(r, 10).numFmt = MOEDA; borda(wsi, r, 11); rCusto = r; r++;
      wsi.mergeCells(r, 1, r, 9); wsi.getCell(r, 1).value = "BDI sobre o preço final"; wsi.getCell(r, 1).alignment = { horizontal: "right" };
      wsi.getCell(r, 10).value = { formula: fV("J" + rCusto + "*(1+p_BDI/100)") + "-J" + rCusto, result: d.tot.bdi }; wsi.getCell(r, 10).numFmt = MOEDA; borda(wsi, r, 11); rBdiL = r; r++;
    }
    var rTot = r;
    wsi.mergeCells(r, 1, r, 9); wsi.getCell(r, 1).value = "TOTAL GERAL"; wsi.getCell(r, 1).alignment = { horizontal: "right" }; wsi.getCell(r, 1).font = { bold: true };
    wsi.getCell(r, 10).value = { formula: d.bdiNoPU ? subRows.map(function (x) { return "J" + x; }).join("+") : "J" + rCusto + "+J" + rBdiL, result: d.tot.precoVenda };
    wsi.getCell(r, 10).numFmt = MOEDA; wsi.getCell(r, 10).font = { bold: true };
    for (var c4 = 1; c4 <= 11; c4++) wsi.getCell(r, c4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB } };
    borda(wsi, r, 11);
    var baseCell = d.bdiNoPU ? "J" + rTot : "J" + rCusto;
    pesoFormulas.forEach(function (p) {
      wsi.getCell(p.row, 11).value = { formula: "IFERROR(J" + p.row + "/" + "$" + baseCell.charAt(0) + "$" + baseCell.slice(1) + ",0)*100", result: (d.bdiNoPU ? d.tot.precoVenda : d.tot.custoDireto) > 0 ? p.valor / (d.bdiNoPU ? d.tot.precoVenda : d.tot.custoDireto) * 100 : 0 };
      wsi.getCell(p.row, 11).numFmt = NUM;
    });
    wsi.getCell(rTot, 11).value = 100; wsi.getCell(rTot, 11).numFmt = NUM;
    var rNota = rTot + 2;
    wsi.mergeCells(rNota, 1, rNota, 11);
    wsi.getCell(rNota, 1).value = "Quantidade (F), custo unitário (L, oculta) e BDI (Resumo) são editáveis; o resto recalcula com o critério: " + d.cab.arredondamento + ". Peso % sobre " + (d.bdiNoPU ? "o total geral" : "o custo direto") + ".";
    wsi.getCell(rNota, 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };

    /* resumo: valores ligados à Sintética */
    wr.getCell(rCd, 2).value = d.bdiNoPU ? { formula: "SUM(Sintética!M" + firstItem + ":M" + (rTot - 1) + ")", result: d.tot.custoDireto } : { formula: "Sintética!J" + rCusto, result: d.tot.custoDireto };
    wr.getCell(rBv, 2).value = { formula: "B" + rTt + "-B" + rCd, result: d.tot.bdi };
    wr.getCell(rTt, 2).value = { formula: "Sintética!J" + rTot, result: d.tot.precoVenda };
    wr.getCell(rCk, 2).value = d.tot.precoVenda;
    wr.getCell(rDif, 1).value = "Diferença (deve ser zero)"; wr.getCell(rDif, 1).font = { bold: true }; borda(wr, rDif, 2);
    wr.getCell(rDif, 2).value = { formula: "ROUND(B" + rTt + "-B" + rCk + ",2)", result: 0 };
    [rCd, rBv, rTt, rCk, rDif].forEach(function (x) { wr.getCell(x, 2).numFmt = MOEDA; wr.getCell(x, 2).alignment = { horizontal: "left" }; });
    wr.getCell(rTt, 2).font = { bold: true };
    wr.getCell(rCk, 1).value = "Total no OrçaPRO na emissão (conferência)";
    var rr2 = rr;
    wr.getCell(rr2, 1).value = "Responsabilidade técnica"; wr.getCell(rr2, 1).font = { bold: true, color: { argb: NAVY } };

    /* ============================ ANALÍTICA ============================ */
    larg(wan, [9, 14, 11, 56, 7, 12, 14, 16, 14]);
    cab(wan, "Planilha orçamentária analítica (composições)", 9);
    var ra = 6;
    d.itens.forEach(function (I) {
      var sr = rowDe[I.numero];
      wan.mergeCells(ra, 1, ra, 9); var h = wan.getCell(ra, 1);
      h.value = I.numero + "   " + I.codigo + "   [" + I.fonte + "]   " + I.descricao + "   (" + I.unidade + ")";
      h.font = { bold: true, color: { argb: BRANCO } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACO } }; ra++;
      if (I.composicao) {
        head(wan, ra, ["TIPO", "CÓDIGO", "UN.", "DESCRIÇÃO", "", "COEFICIENTE", "PREÇO UNIT.", "CUSTO", ""]); ra++;
        var i1 = ra;
        I.composicao.insumos.forEach(function (x) {
          wan.getCell(ra, 1).value = x.cat; wan.getCell(ra, 2).value = x.codigo; wan.getCell(ra, 3).value = x.unidade; wan.getCell(ra, 4).value = x.descricao;
          wan.getCell(ra, 6).value = x.coef; wan.getCell(ra, 6).numFmt = COEF; wan.getCell(ra, 7).value = x.cu; wan.getCell(ra, 7).numFmt = "#,##0.0000";
          wan.getCell(ra, 8).value = { formula: "F" + ra + "*G" + ra, result: x.ct }; wan.getCell(ra, 8).numFmt = "#,##0.0000"; borda(wan, ra, 8); ra++;
        });
        wan.getCell(ra, 4).value = "Custo unitário da composição (" + I.composicao.origem + ")"; wan.getCell(ra, 4).font = { bold: true };
        wan.getCell(ra, 8).value = { formula: "SUM(H" + i1 + ":H" + (ra - 1) + ")", result: I.composicao.soma }; wan.getCell(ra, 8).numFmt = "#,##0.0000"; wan.getCell(ra, 8).font = { bold: true };
        wan.getCell(ra, 9).value = { formula: 'IF(ABS(H' + ra + '-Sintética!G' + sr + ')<=MAX(0.02,Sintética!G' + sr + '*0.01),"confere","CONFERIR")', result: I.composicao.confere ? "confere" : "CONFERIR" };
        ra++;
      } else {
        wan.mergeCells(ra, 1, ra, 9); wan.getCell(ra, 1).value = "Composição sem detalhamento na base carregada" + (I.comBaseOficial ? "" : " (item sem base oficial: ver Mapa de Cotação)") + ". Nenhum insumo foi inventado.";
        wan.getCell(ra, 1).font = { italic: true, color: { argb: VERM } }; ra++;
      }
      wan.getCell(ra, 4).value = "Custo unitário (Sintética)"; wan.getCell(ra, 8).value = { formula: "Sintética!G" + sr, result: I.cu }; wan.getCell(ra, 8).numFmt = MOEDA; ra++;
      if (d.bdiNoPU) {
        wan.getCell(ra, 4).value = "BDI"; wan.getCell(ra, 7).value = { formula: "Sintética!H" + sr, result: d.bdiPct }; wan.getCell(ra, 7).numFmt = PCT;
        wan.getCell(ra, 8).value = { formula: "Sintética!I" + sr + "-Sintética!G" + sr, result: I.pu - I.cu }; wan.getCell(ra, 8).numFmt = MOEDA; ra++;
        wan.getCell(ra, 4).value = "Preço unitário com BDI"; wan.getCell(ra, 4).font = { bold: true };
        wan.getCell(ra, 8).value = { formula: "Sintética!I" + sr, result: I.pu }; wan.getCell(ra, 8).numFmt = MOEDA; wan.getCell(ra, 8).font = { bold: true }; ra++;
      }
      ra++;
    });

    /* ============================ BDI ============================ */
    larg(wbd, [14, 60, 14]);
    cab(wbd, "Composição do BDI — Acórdão TCU nº 2.622/2013", 3);
    function blocoBdi(ws, q, r1, titulo) {
      var r2 = r1;
      if (titulo) { ws.mergeCells(r2, 1, r2, 3); ws.getCell(r2, 1).value = titulo; ws.getCell(r2, 1).font = { bold: true, color: { argb: NAVY } }; r2++; }
      if (!q.parcelas) { ws.mergeCells(r2, 1, r2, 3); ws.getCell(r2, 1).value = "PENDÊNCIA: composição do BDI não informada (BDI de " + q.pct + "% digitado direto). Nenhuma parcela foi inventada."; ws.getCell(r2, 1).font = { bold: true, color: { argb: VERM } }; return r2 + 2; }
      head(ws, r2, ["SIGLA", "DESCRIÇÃO", "%"]); r2++;
      var p0 = r2;
      q.parcelas.forEach(function (p) { ws.getCell(r2, 1).value = p.sigla; ws.getCell(r2, 2).value = p.nome; ws.getCell(r2, 3).value = p.pct / 100; ws.getCell(r2, 3).numFmt = "0.00%"; ws.getCell(r2, 3).protection = { locked: false }; borda(ws, r2, 3); r2++; });
      var AC = "C" + p0, S = "C" + (p0 + 1), Rr = "C" + (p0 + 2), G = "C" + (p0 + 3), DF = "C" + (p0 + 4), L = "C" + (p0 + 5), I = "C" + (p0 + 6);
      ws.getCell(r2, 2).value = "BDI pela fórmula"; ws.getCell(r2, 2).font = { bold: true };
      ws.getCell(r2, 3).value = { formula: "(1+" + AC + "+" + S + "+" + Rr + "+" + G + ")*(1+" + DF + ")*(1+" + L + ")/(1-" + I + ")-1", result: q.calculado / 100 }; ws.getCell(r2, 3).numFmt = "0.00%"; ws.getCell(r2, 3).font = { bold: true }; var rf = r2; r2++;
      ws.getCell(r2, 2).value = "BDI aplicado no orçamento"; ws.getCell(r2, 3).value = q.pct / 100; ws.getCell(r2, 3).numFmt = "0.00%"; r2++;
      ws.getCell(r2, 2).value = "Confere?"; ws.getCell(r2, 3).value = { formula: 'IF(ABS(C' + rf + '-C' + (r2 - 1) + ')<=0.0005,"confere","DIVERGE")', result: Math.abs(q.calculado - q.pct) <= 0.05 ? "confere" : "DIVERGE" }; r2++;
      if (q.faixa) {
        ws.getCell(r2, 2).value = "Faixa do Acórdão (" + q.tipoObraRotulo + (q.tipoInformado ? "" : ", assumido") + "): " + q.faixa.min + "% a " + q.faixa.max + "%";
        ws.getCell(r2, 3).value = { formula: 'IF(AND(C' + (r2 - 2) + '>=' + (q.faixa.min / 100) + ',C' + (r2 - 2) + '<=' + (q.faixa.max / 100) + '),"dentro","FORA DA FAIXA")', result: (q.pct >= q.faixa.min && q.pct <= q.faixa.max) ? "dentro" : "FORA DA FAIXA" };
        r2++;
      }
      return r2 + 1;
    }
    var rb = blocoBdi(wbd, d.bdi, 5, "");
    if (d.bdi.diferenciado) blocoBdi(wbd, d.bdi.diferenciado, rb, "BDI diferenciado — fornecimento de materiais e equipamentos");
    else { wbd.getCell(rb, 1).value = "Um único BDI para todos os itens; não há BDI diferenciado informado para fornecimento de materiais e equipamentos."; wbd.getCell(rb, 1).font = { italic: true }; }

    /* ============================ ENCARGOS ============================ */
    larg(wen, [10, 70, 14, 16]);
    cab(wen, "Encargos sociais", 4);
    var re = 6;
    if (!d.enc.ok) {
      wen.mergeCells(re, 1, re, 4); wen.getCell(re, 1).value = "PENDÊNCIA: " + d.enc.motivo; wen.getCell(re, 1).font = { bold: true, color: { argb: VERM } };
      if (d.enc.declarado) { wen.getCell(re + 2, 2).value = "Declarado no orçamento (horista / mensalista)"; wen.getCell(re + 2, 3).value = d.enc.declarado.horista; wen.getCell(re + 2, 4).value = d.enc.declarado.mensalista; }
    } else {
      wen.getCell(re, 1).value = "Regime: " + d.enc.regimeRotulo + " · UF " + d.enc.uf + " · " + (d.enc.rotulo || d.enc.fonte); wen.getCell(re, 1).font = { bold: true }; re += 2;
      head(wen, re, ["COD", "DESCRIÇÃO", "HORISTA %", "MENSALISTA %"]); re++;
      var tg = [];
      d.enc.grupos.forEach(function (g) {
        faixa(wen, re, 4, "GRUPO " + g.grupo, ACO); re++;
        var g1 = re;
        g.linhas.forEach(function (l) { wen.getCell(re, 1).value = l.codigo; wen.getCell(re, 2).value = l.descricao; wen.getCell(re, 3).value = l.horista; wen.getCell(re, 3).numFmt = PCT; wen.getCell(re, 4).value = l.mensalistaNI ? "Não incide" : l.mensalista; wen.getCell(re, 4).numFmt = PCT; borda(wen, re, 4); re++; });
        wen.getCell(re, 2).value = "TOTAL GRUPO " + g.grupo; wen.getCell(re, 2).font = { bold: true };
        wen.getCell(re, 3).value = { formula: "SUM(C" + g1 + ":C" + (re - 1) + ")", result: g.horista }; wen.getCell(re, 3).numFmt = PCT;
        wen.getCell(re, 4).value = { formula: "SUM(D" + g1 + ":D" + (re - 1) + ")", result: g.mensalista }; wen.getCell(re, 4).numFmt = PCT;
        tg.push(re); re++;
      });
      wen.getCell(re, 2).value = "A + B + C + D"; wen.getCell(re, 2).font = { bold: true };
      wen.getCell(re, 3).value = { formula: tg.map(function (x) { return "C" + x; }).join("+"), result: d.enc.total.horista }; wen.getCell(re, 3).numFmt = PCT;
      wen.getCell(re, 4).value = { formula: tg.map(function (x) { return "D" + x; }).join("+"), result: d.enc.total.mensalista }; wen.getCell(re, 4).numFmt = PCT; re += 2;
      if (d.enc.outroRegime) { wen.getCell(re, 2).value = "Para comparação, regime " + d.enc.outroRegime.regime + " (totais)"; wen.getCell(re, 3).value = d.enc.outroRegime.horista; wen.getCell(re, 3).numFmt = PCT; wen.getCell(re, 4).value = d.enc.outroRegime.mensalista; wen.getCell(re, 4).numFmt = PCT; re++; }
      if (d.enc.declarado) { wen.getCell(re, 2).value = "Declarado no orçamento" + (d.enc.divergeDeclarado ? " (DIVERGE da tabela)" : " (confere)"); wen.getCell(re, 3).value = d.enc.declarado.horista; wen.getCell(re, 3).numFmt = PCT; wen.getCell(re, 4).value = d.enc.declarado.mensalista; wen.getCell(re, 4).numFmt = PCT; }
    }

    /* ============================ CURVA ABC ============================ */
    function abcSheet(ws, ab, tipo) {
      larg(ws, [11, 16, 58, 7, 14, 17, 10, 11, 7]);
      cab(ws, "Curva ABC de " + (tipo === "serv" ? "serviços" : "insumos"), 9);
      head(ws, 6, [tipo === "serv" ? "ITEM" : "TIPO", "CÓDIGO", "DESCRIÇÃO", "UN.", "QUANT.", "VALOR", "%", "ACUM. %", "CL."]);
      var q = 7, q1 = q, nL = ab.linhas.length, qT = q1 + nL;
      ab.linhas.forEach(function (c) {
        ws.getCell(q, 1).value = tipo === "serv" ? c.numero : c.cat; ws.getCell(q, 2).value = c.codigo; ws.getCell(q, 3).value = c.descricao; ws.getCell(q, 4).value = c.unidade;
        ws.getCell(q, 5).value = c.quantidade; ws.getCell(q, 5).numFmt = NUM;
        if (tipo === "serv") ws.getCell(q, 6).value = { formula: "Sintética!" + (d.bdiNoPU ? "J" : "M") + rowDe[c.numero], result: c.valor }; else ws.getCell(q, 6).value = c.valor;
        ws.getCell(q, 6).numFmt = MOEDA;
        ws.getCell(q, 7).value = { formula: "IFERROR(F" + q + "/F$" + qT + ",0)", result: c.pct / 100 }; ws.getCell(q, 7).numFmt = "0.00%";
        ws.getCell(q, 8).value = { formula: "IFERROR(SUM(F$" + q1 + ":F" + q + ")/F$" + qT + ",0)", result: c.acum / 100 }; ws.getCell(q, 8).numFmt = "0.00%";
        ws.getCell(q, 9).value = { formula: 'IF(H' + q + '<=0.8+1E-9,"A",IF(H' + q + '<=0.95+1E-9,"B","C"))', result: c.classe };
        borda(ws, q, 9); q++;
      });
      ws.getCell(qT, 3).value = "TOTAL"; ws.getCell(qT, 3).font = { bold: true };
      ws.getCell(qT, 6).value = { formula: "SUM(F" + q1 + ":F" + (qT - 1) + ")", result: ab.total }; ws.getCell(qT, 6).numFmt = MOEDA; ws.getCell(qT, 6).font = { bold: true };
      var qq = qT + 2;
      head(ws, qq, ["CLASSE", "ITENS", "VALOR", "%"]); qq++;
      ["A", "B", "C"].forEach(function (cl) {
        ws.getCell(qq, 1).value = cl;
        ws.getCell(qq, 2).value = { formula: 'COUNTIF(I' + q1 + ':I' + (qT - 1) + ',A' + qq + ')', result: ab.resumo[cl].qtd };
        ws.getCell(qq, 3).value = { formula: 'SUMIF(I' + q1 + ':I' + (qT - 1) + ',A' + qq + ',F' + q1 + ':F' + (qT - 1) + ')', result: ab.resumo[cl].valor }; ws.getCell(qq, 3).numFmt = MOEDA;
        ws.getCell(qq, 4).value = { formula: "IFERROR(C" + qq + "/F" + qT + ",0)", result: ab.resumo[cl].pct / 100 }; ws.getCell(qq, 4).numFmt = "0.00%"; borda(ws, qq, 4); qq++;
      });
      ws.getCell(qq + 1, 1).value = "Classe A: até 80% do valor acumulado; B: de 80% a 95%; C: acima de 95%.";
      ws.getCell(qq + 1, 1).font = { italic: true, size: 9 };
      ws.views = [{ state: "frozen", ySplit: 6 }];
    }
    abcSheet(wa1, d.abcServ, "serv");
    abcSheet(wa2, d.abcIns, "ins");

    /* ============================ CRONOGRAMA ============================ */
    cab(wcr, "Cronograma físico-financeiro", 6);
    if (!d.crono) {
      wcr.mergeCells(6, 1, 6, 6); wcr.getCell(6, 1).value = "PENDÊNCIA: " + d.cronoMotivo; wcr.getCell(6, 1).font = { bold: true, color: { argb: VERM } };
    } else {
      var c = d.crono, n = c.nMeses, cP = 4 + n + 1;   // colunas: A item, B etapa, C valor, D.. R$ por mês, depois TOTAL, depois % por mês
      var cTot = 4 + n, cPct = cTot + 1;
      wcr.getColumn(1).width = 8; wcr.getColumn(2).width = 40; wcr.getColumn(3).width = 17;
      var hd = ["ITEM", "ETAPA", "VALOR (R$)"], k;
      for (k = 0; k < n; k++) hd.push((c.rotulos[k] || ((k + 1) + "º mês")) + " (R$)");
      hd.push("TOTAL");
      for (k = 0; k < n; k++) hd.push((c.rotulos[k] || ((k + 1) + "º mês")) + " (% físico)");
      head(wcr, 6, hd);
      for (k = 4; k <= cPct + n - 1; k++) wcr.getColumn(k).width = 15;
      var rc = 7, rc1 = rc;
      c.linhas.forEach(function (l) {
        wcr.getCell(rc, 1).value = l.numero; wcr.getCell(rc, 2).value = l.nome;
        wcr.getCell(rc, 3).value = { formula: "Sintética!J" + subDe[l.numero], result: l.total }; wcr.getCell(rc, 3).numFmt = MOEDA;
        for (k = 0; k < n; k++) {
          var cp = colL(cPct + k);
          wcr.getCell(rc, cPct + k).value = l.pcts[k]; wcr.getCell(rc, cPct + k).numFmt = "0.00%"; wcr.getCell(rc, cPct + k).protection = { locked: false };
          var fm = k === n - 1 ? "$C" + rc + "-SUM(" + colL(4) + rc + ":" + colL(4 + n - 2) + rc + ")" : "ROUND($C" + rc + "*" + cp + rc + ",2)";
          if (k === n - 1 && n === 1) fm = "$C" + rc;
          wcr.getCell(rc, 4 + k).value = { formula: fm, result: l.valores[k] }; wcr.getCell(rc, 4 + k).numFmt = MOEDA;
        }
        wcr.getCell(rc, cTot).value = { formula: "SUM(" + colL(4) + rc + ":" + colL(4 + n - 1) + rc + ")", result: l.total }; wcr.getCell(rc, cTot).numFmt = MOEDA;
        borda(wcr, rc, cPct + n - 1); rc++;
      });
      wcr.getCell(rc, 2).value = "TOTAL"; wcr.getCell(rc, 2).font = { bold: true };
      wcr.getCell(rc, 3).value = { formula: "SUM(C" + rc1 + ":C" + (rc - 1) + ")", result: c.total }; wcr.getCell(rc, 3).numFmt = MOEDA;
      for (k = 0; k < n; k++) { wcr.getCell(rc, 4 + k).value = { formula: "SUM(" + colL(4 + k) + rc1 + ":" + colL(4 + k) + (rc - 1) + ")", result: c.totais[k].valor }; wcr.getCell(rc, 4 + k).numFmt = MOEDA; wcr.getCell(rc, 4 + k).font = { bold: true }; }
      wcr.getCell(rc, cTot).value = { formula: "SUM(" + colL(cTot) + rc1 + ":" + colL(cTot) + (rc - 1) + ")", result: c.total }; wcr.getCell(rc, cTot).numFmt = MOEDA;
      var rAc = rc + 1;
      wcr.getCell(rAc, 2).value = "Acumulado";
      for (k = 0; k < n; k++) { wcr.getCell(rAc, 4 + k).value = { formula: "SUM($" + colL(4) + rc + ":" + colL(4 + k) + rc + ")", result: c.totais[k].acumValor }; wcr.getCell(rAc, 4 + k).numFmt = MOEDA; }
      wcr.getCell(rAc + 1, 2).value = "% acumulado";
      for (k = 0; k < n; k++) { wcr.getCell(rAc + 1, 4 + k).value = { formula: "IFERROR(" + colL(4 + k) + rAc + "/$C" + rc + ",0)", result: c.totais[k].acumPct / 100 }; wcr.getCell(rAc + 1, 4 + k).numFmt = "0.00%"; }
      wcr.getCell(rAc + 3, 2).value = "Confere com a Sintética?";
      wcr.getCell(rAc + 3, 3).value = { formula: 'IF(ROUND(' + colL(cTot) + rc + '-Sintética!' + (d.bdiNoPU ? "J" : "J") + (d.bdiNoPU ? rTot : rCusto) + ',2)=0,"confere","DIVERGE")', result: "confere" };
      wcr.getCell(rAc + 4, 2).value = "Origem: " + c.origem + ". Meses: ROUND(valor × % físico); o último mês fecha a etapa.";
      wcr.getCell(rAc + 4, 2).font = { italic: true, size: 9 };
      wcr.views = [{ state: "frozen", ySplit: 6, xSplit: 3 }];
    }

    /* ============================ MEMÓRIA DE CÁLCULO ============================ */
    larg(wme, [9, 14, 50, 7, 13, 90]);
    cab(wme, "Memória de cálculo dos quantitativos", 6);
    head(wme, 6, ["ITEM", "CÓDIGO", "DESCRIÇÃO", "UN.", "QUANT.", "MEMÓRIA DE CÁLCULO"]);
    var rm = 7;
    d.itens.forEach(function (I) {
      wme.getCell(rm, 1).value = I.numero; wme.getCell(rm, 2).value = I.codigo; wme.getCell(rm, 3).value = I.descricao; wme.getCell(rm, 4).value = I.unidade;
      wme.getCell(rm, 5).value = { formula: "Sintética!F" + rowDe[I.numero], result: I.quantidade }; wme.getCell(rm, 5).numFmt = NUM;
      wme.getCell(rm, 6).value = I.memoria || "SEM MEMÓRIA DE CÁLCULO INFORMADA"; wme.getCell(rm, 6).alignment = { wrapText: true, vertical: "top" };
      if (!I.memoria) wme.getCell(rm, 6).font = { bold: true, color: { argb: VERM } };
      borda(wme, rm, 6); rm++;
    });

    /* ============================ MAPA DE COTAÇÃO ============================ */
    larg(wco, [9, 48, 7, 28, 14, 15, 15, 15, 15, 40]);
    cab(wco, "Mapa de cotação — itens sem base oficial", 10);
    if (!d.cot.linhas.length) { wco.getCell(6, 1).value = "Todos os itens têm código de base oficial; não há composição própria nem item a cotar."; }
    else {
      head(wco, 6, ["ITEM", "DESCRIÇÃO / FONTE", "UN.", "FORNECEDOR / BASE", "DATA", "VALOR", "MÉDIA", "MEDIANA", "MENOR", "ADOTADO · CUSTO NO ORÇAMENTO · SITUAÇÃO"]);
      var rk = 7;
      d.cot.linhas.forEach(function (l) {
        wco.mergeCells(rk, 2, rk, 4); wco.getCell(rk, 1).value = l.numero; wco.getCell(rk, 2).value = l.descricao; wco.getCell(rk, 2).font = { bold: true }; wco.getCell(rk, 3).value = l.unidade; rk++;
        var v1 = rk;
        l.fontes.forEach(function (f) {
          wco.getCell(rk, 4).value = f.fornecedor || f.base || f.tipo; wco.getCell(rk, 5).value = (f.data || "") + (f.hora ? " " + f.hora : ""); wco.getCell(rk, 6).value = f.valor; wco.getCell(rk, 6).numFmt = MOEDA; borda(wco, rk, 6); rk++;
        });
        if (l.fontes.length) {
          wco.getCell(rk - 1, 7).value = { formula: "AVERAGE(F" + v1 + ":F" + (rk - 1) + ")", result: l.media }; wco.getCell(rk - 1, 8).value = { formula: "MEDIAN(F" + v1 + ":F" + (rk - 1) + ")", result: l.mediana };
          wco.getCell(rk - 1, 9).value = { formula: "MIN(F" + v1 + ":F" + (rk - 1) + ")", result: l.menor };
          [7, 8, 9].forEach(function (q2) { wco.getCell(rk - 1, q2).numFmt = MOEDA; });
        } else { wco.getCell(rk, 4).value = "SEM PESQUISA ANEXADA"; wco.getCell(rk, 4).font = { bold: true, color: { argb: VERM } }; rk++; }
        wco.getCell(rk - 1, 10).value = (l.adotado != null ? "Adotado " + l.adotado + " (" + (l.metodo || "método n/i") + ")" : "PENDENTE") + " · custo no orçamento " + l.custoItem + " · " + l.situacao + (l.diverge ? " · DIVERGE" : "") + (l.justificativa ? " · " + l.justificativa : "");
        wco.getCell(rk - 1, 10).alignment = { wrapText: true, vertical: "top" };
        rk++;
      });
    }

    /* ============================ CAIXA ============================ */
    if (wca) {
      larg(wca, [14, 70, 20, 12]);
      cab(wca, "Padrão CAIXA — repasse federal (Decreto 7.983/2013)", 4);
      wca.mergeCells(5, 1, 5, 4); wca.getCell(5, 1).value = d.caixa.aviso; wca.getCell(5, 1).font = { bold: true, color: { argb: VERM } }; wca.getCell(5, 1).alignment = { wrapText: true }; wca.getRow(5).height = 32;
      var rx = 7;
      [["Proponente / órgão", d.cab.orgao || "[PREENCHER: órgão]"], ["Objeto", d.cab.objeto || "[PREENCHER: objeto]"], ["Local / UF", (d.cab.local || "[PREENCHER: local]") + " / " + d.cab.uf],
        ["Base de referência (SINAPI)", d.cab.dataBase || "não informada"], ["Regime de encargos", d.cab.regime], ["Itens sem código de base oficial", String(d.caixa.proprias)]].forEach(function (x) {
        wca.getCell(rx, 1).value = x[0]; wca.getCell(rx, 1).font = { bold: true }; wca.mergeCells(rx, 2, rx, 4); wca.getCell(rx, 2).value = x[1]; rx++;
      });
      rx++;
      wca.getCell(rx, 1).value = "Custo direto"; wca.getCell(rx, 3).value = { formula: "Resumo!B" + rCd, result: d.tot.custoDireto }; wca.getCell(rx, 3).numFmt = MOEDA; rx++;
      wca.getCell(rx, 1).value = "BDI"; wca.getCell(rx, 3).value = { formula: "Resumo!B" + rBv, result: d.tot.bdi }; wca.getCell(rx, 3).numFmt = MOEDA; rx++;
      rx++;
      head(wca, rx, ["ITEM", "ETAPA (QCI / PO)", "VALOR", "%"]); rx++;
      var x1 = rx;
      d.etapas.forEach(function (E) {
        wca.getCell(rx, 1).value = E.numero; wca.getCell(rx, 2).value = E.nome; wca.getCell(rx, 3).value = { formula: "Sintética!J" + subDe[E.numero], result: E.total }; wca.getCell(rx, 3).numFmt = MOEDA;
        borda(wca, rx, 4); rx++;
      });
      var xT = rx;
      wca.getCell(xT, 2).value = "TOTAL DO INVESTIMENTO"; wca.getCell(xT, 2).font = { bold: true };
      wca.getCell(xT, 3).value = { formula: "SUM(C" + x1 + ":C" + (xT - 1) + ")", result: d.bdiNoPU ? d.tot.precoVenda : d.tot.custoDireto }; wca.getCell(xT, 3).numFmt = MOEDA;
      for (var xr = x1; xr < xT; xr++) { wca.getCell(xr, 4).value = { formula: "IFERROR(C" + xr + "/C$" + xT + ",0)", result: 0 }; wca.getCell(xr, 4).numFmt = "0.00%"; }
      if (d.caixa.foraSinapi.length) { wca.mergeCells(xT + 2, 1, xT + 2, 4); wca.getCell(xT + 2, 1).value = "Bases fora da SINAPI: " + d.caixa.foraSinapi.join(", ") + ". Justificar pelo art. 6º do Decreto 7.983/2013."; wca.getCell(xT + 2, 1).font = { bold: true, color: { argb: VERM } }; }
    }

    /* ============================ DECLARAÇÕES ============================ */
    larg(wde, [30, 110]);
    cab(wde, "Declarações do responsável pelo orçamento", 2);
    var rd = 6;
    d.declaracoes.forEach(function (x) { wde.getCell(rd, 1).value = x.titulo; wde.getCell(rd, 1).font = { bold: true }; wde.getCell(rd, 2).value = x.texto; wde.getCell(rd, 2).alignment = { wrapText: true, vertical: "top" }; wde.getRow(rd).height = 48; borda(wde, rd, 2); rd++; });
    rd++;
    [["Responsável técnico", d.rt.nome || "[PREENCHER: nome]"], ["Registro (CREA/CAU)", d.rt.registro || "[PREENCHER: registro]"], [d.art.tipo + " do orçamento", d.art.numero || "[PREENCHER: número da ART/RRT]"], ["Data", "[PREENCHER: data]"]].forEach(function (x) {
      wde.getCell(rd, 1).value = x[0]; wde.getCell(rd, 1).font = { bold: true }; wde.getCell(rd, 2).value = x[1]; borda(wde, rd, 2); rd++;
    });
    wde.getCell(rd + 1, 1).value = "Minuta-base da RA Engenharia: revisar com o jurídico do órgão antes de assinar."; wde.getCell(rd + 1, 1).font = { italic: true, size: 9 };

    /* ============================ PENDÊNCIAS ============================ */
    if (wpe) {
      larg(wpe, [16, 140]);
      cab(wpe, "Pendências e pontos a conferir", 2);
      var rp = 6;
      d.pend.bloqueios.forEach(function (x) { wpe.getCell(rp, 1).value = "EM ABERTO"; wpe.getCell(rp, 1).font = { bold: true, color: { argb: VERM } }; wpe.getCell(rp, 2).value = x; wpe.getCell(rp, 2).alignment = { wrapText: true }; rp++; });
      d.pend.conferir.forEach(function (x) { wpe.getCell(rp, 1).value = "CONFERIR"; wpe.getCell(rp, 2).value = x; wpe.getCell(rp, 2).alignment = { wrapText: true }; rp++; });
    }
    return wb;
  }

  function gerar(ExcelJS, d) {
    var wb = construir(ExcelJS, d);
    return Promise.resolve(wb.xlsx.writeBuffer()).then(function (buf) {
      return typeof Blob !== "undefined" ? new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) : buf;
    });
  }

  var OrcamentoReferenciaXls = { construir: construir, gerar: gerar };
  global.OrcamentoReferenciaXls = OrcamentoReferenciaXls;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcamentoReferenciaXls;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

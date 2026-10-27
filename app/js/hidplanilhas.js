/* =====================================================================
 * hidplanilhas.js — PLANILHAS .xlsx DO HIDROSSANITÁRIO (água fria, esgoto,
 * recalque, quantitativo, pendências) — motor PURO, ES5, sem DOM.
 * Planilha é sempre .xlsx formatado, nunca CSV.
 *
 *   HidPlanilhas.gerar(resultado, quantitativo, opcoes)
 *        → { ok, workbook, abas: [nome], avisos: [texto], formulas: n }
 *   HidPlanilhas.escrever(resultado, quantitativo, opcoes)
 *        → Promise<Buffer> (workbook.xlsx.writeBuffer)
 *
 *   resultado     o de HidDimensionar.calcular (docs/hidro/CONTRATO.md §4);
 *                 a planilha LÊ os campos, não recalcula nada de norma.
 *   quantitativo  o de BimInst.qto(estado, avaliarFam) (tubos, conexoes,
 *                 pecas, acessorios, dispositivos, porSistema); null → a
 *                 aba sai com o aviso e a falta vai para as pendências.
 *   opcoes        ExcelJS (a biblioteca; padrão global.ExcelJS / require) ·
 *                 obra { nome, endereco, cidade } · documento { numero,
 *                 revisao, data } · responsavel { nome, crea }.
 *
 * FÓRMULAS VISÍVEIS (o engenheiro confere na célula):
 *   · Q = C·√ΣP, com C lido dos `passos` do próprio trecho (o contrato não
 *     tem campo para C; o motor escreve "Q = C·√ΣP = 0,3 × √1,1 …"). Se o
 *     passo não traz C, a coluna sai com o valor do motor, sem fórmula.
 *   · v = Q/A com Di do trecho; hf = J·L; hf total = distribuída + localizada;
 *     AMT = Hg + perdas + residual; decl. ≥ mín.; totais por SUMIFS.
 *   · Toda fórmula só entra se o valor dela BATE com o valor do motor
 *     (tolerância 1e-6 relativa). Não bate (ex.: vazão limitada ao mínimo
 *     do aparelho) → fica o valor do motor e a coluna "Observação" diz por
 *     quê. Planilha que contradiz o memorial é pior que sem fórmula.
 *   · Valor pendente do motor sai "não verificado", nunca 0 nem OK.
 * Teste: node tools/test-hid-planilhas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* hid:fisica-inicio — APRESENTAÇÃO, não física: todo número deste arquivo é casa decimal, índice de coluna/célula, largura, tamanho de fonte, cor ou tolerância de comparação de ponto flutuante. Valor de norma NUNCA é escrito aqui: chega pronto no resultado do HidDimensionar (verificado por tools/test-hid-memorial.js / test-hid-planilhas.js, que comparam com o resultado). Fonte da regra de leitura: CONTRATO §5. */
  var NUM = "#,##0.00", NUM3 = "#,##0.000", NUM4 = "#,##0.0000", INT = "#,##0";
  var navy = "FF0F2740", branco = "FFFFFFFF", cinza = "FFEFF3F8", amarelo = "FFFFF7CC", vermelhoBg = "FFFBEFED", alertaBg = "FFFBF6EA", vermelho = "FFA3352B";
  var NAO_VERIF = "não verificado";

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function objs(v) { return arr(v).filter(function (x) { return x && typeof x === "object" && !Array.isArray(x); }); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function txt(v) { var s = v == null ? "" : String(v); return /\b(undefined|NaN|null|Infinity)\b/.test(s) ? s.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]") : s; }
  function bate(a, b) { return fin(a) && fin(b) && Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-12; }
  function statusTxt(s) { return s === "ok" ? "OK" : (s === "reprovado" ? "NÃO ATENDE" : (s === "pendente" ? "PENDENTE" : NAO_VERIF)); }
  function tipoFonte(f) { f = obj(f); return f.tipo === "primaria" ? "primária" : (f.tipo === "secundaria" ? "secundária" : "não informado"); }
  function fonteTxt(f) { f = obj(f); return f.chave || f.norma ? txt([f.norma, f.edicao ? "ed. " + f.edicao : "", f.tabela ? "tab. " + f.tabela : "", f.pagina ? "p. " + f.pagina : ""].filter(Boolean).join(", ") + " (" + tipoFonte(f) + ")") : ""; }
  function letra(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      try { return require(nome.toLowerCase()); } catch (e) {}
      try { return require("C:/Users/USER/RA-Gestao-Obras/node_modules/" + nome.toLowerCase()); } catch (e2) {}
    }
    return null;
  }

  /* ---------- estilo */
  function thin() { var s = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: s, left: s, bottom: s, right: s }; }
  function cab(row) {
    row.eachCell(function (c) {
      c.font = { bold: true, color: { argb: branco }, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = thin();
    });
    row.height = 32;
  }
  function titulo(ws, texto, ate) {
    ws.mergeCells(1, 1, 1, ate);
    var c = ws.getCell(1, 1); c.value = texto; c.font = { bold: true, size: 14, color: { argb: navy } };
    ws.getRow(1).height = 24;
  }
  function selo(ws, linha, ate, fixture) {
    if (!fixture) return linha;
    ws.mergeCells(linha, 1, linha, ate);
    var c = ws.getCell(linha, 1); c.value = "TABELAS DE TESTE — NÃO É NORMA — não usar como memorial nem como planilha de projeto";
    c.font = { bold: true, color: { argb: vermelho }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: vermelhoBg } };
    c.alignment = { horizontal: "center" };
    return linha + 1;
  }
  function larguras(ws, ls) { ls.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }
  function corpoLinha(row, status, nCols) {
    for (var i = 1; i <= nCols; i++) {
      var c = row.getCell(i); c.border = thin();
      if (status === "reprovado") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: vermelhoBg } };
      else if (status === "pendente") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: alertaBg } };
    }
  }
  /* escreve número (ou "não verificado") */
  function numCel(row, col, v, fmt) {
    var c = row.getCell(col);
    if (fin(v)) { c.value = v; c.numFmt = fmt || NUM; c.alignment = { horizontal: "right" }; }
    else { c.value = NAO_VERIF; c.font = { italic: true, color: { argb: "FF6B5D45" } }; c.alignment = { horizontal: "right" }; }
    return c;
  }
  /* fórmula com resultado em cache; só entra se o valor bate com o do motor */
  function formulaCel(row, col, formula, esperado, atual, fmt, ctx) {
    var c = row.getCell(col);
    if (fin(esperado) && fin(atual) && bate(esperado, atual)) { c.value = { formula: formula, result: atual }; c.numFmt = fmt || NUM; c.alignment = { horizontal: "right" }; ctx.formulas++; return true; }
    numCel(row, col, atual, fmt); return false;
  }

  /* C do método dos pesos, lido do passo "Q = C·√ΣP = 0,3 × √1,1 = …" */
  function coeficienteC(trechos) {
    for (var i = 0; i < trechos.length; i++) {
      var ps = arr(trechos[i].passos);
      for (var j = 0; j < ps.length; j++) {
        var m = /Q\s*=\s*C\s*[·*x×]?\s*√\s*ΣP\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*[×x*]\s*√/.exec(String(ps[j]));
        if (m) { var v = parseFloat(m[1].replace(",", ".")); if (fin(v) && v > 0) return v; }
      }
    }
    return null;
  }

  /* ================================================================ ABAS */
  function abaResumo(wb, r, q, op, ctx) {
    var ws = wb.addWorksheet("Resumo"), N = 4, ob = obj(op.obra), dc = obj(op.documento), rp = obj(op.responsavel), rs = obj(r.resumo);
    larguras(ws, [46, 26, 26, 60]);
    titulo(ws, "Planilhas do hidrossanitário — " + (ob.nome ? txt(ob.nome) : "[OBRA]"), N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    function par(rot, val, fmt) { var row = ws.getRow(l++); row.getCell(1).value = rot; row.getCell(1).font = { bold: true }; var c = row.getCell(2); if (fin(val)) { c.value = val; c.numFmt = fmt || INT; } else c.value = txt(val); for (var i = 1; i <= 2; i++) row.getCell(i).border = thin(); return row; }
    par("Documento", [dc.numero || "[Nº DO DOCUMENTO]", dc.revisao || "R00"].join(" "));
    par("Endereço", [ob.endereco, ob.cidade].filter(Boolean).join(" — ") || "[ENDEREÇO]");
    par("Responsável técnico", rp.nome ? rp.nome + (rp.crea ? " — CREA " + rp.crea : "") : "[RESPONSÁVEL TÉCNICO]");
    l++;
    var hdr = ws.getRow(l++); ["Indicador", "Valor", "Situação"].forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr);
    var af = obj(obj(r.sistemas).agua_fria), es = obj(obj(r.sistemas).esgoto), rc = r.recalque;
    var vs = objs(r.verificacoes);
    function ind(rot, val, st, fmt) { var row = ws.getRow(l++); row.getCell(1).value = rot; numCel(row, 2, val, fmt || INT); row.getCell(3).value = st ? statusTxt(st) : ""; corpoLinha(row, st, 3); return row; }
    ind("Trechos de água fria", fin(rs.trechosAF) ? rs.trechosAF : objs(af.trechos).length, af.status);
    ind("Trechos de esgoto", fin(rs.trechosES) ? rs.trechosES : objs(es.trechos).length, es.status);
    ind("Recalque (AMT em m)", rc ? rc.AMT_m : NaN, rc ? rc.status : "pendente");
    if (!rc) ws.getRow(l - 1).getCell(2).value = "recalque não calculado";
    ind("Trechos com DN alterado (a aplicar no modelo)", arr(r.ops).length, null);
    ind("Verificações", vs.length, null);
    ind("Verificações que não atendem", vs.filter(function (v) { return v.status === "reprovado"; }).length, vs.some(function (v) { return v.status === "reprovado"; }) ? "reprovado" : "ok");
    ind("Verificações pendentes (não verificado)", vs.filter(function (v) { return v.status === "pendente"; }).length, vs.some(function (v) { return v.status === "pendente"; }) ? "pendente" : "ok");
    ind("Chaves de norma pendentes", arr(r.pendencias).length, arr(r.pendencias).length ? "pendente" : "ok");
    l++;
    var n0 = l; var h2 = ws.getRow(l++); ["Aba", "Conteúdo"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2);
    [["Dimensionamento AF", "água fria trecho a trecho, com fórmulas"], ["Dimensionamento ES", "esgoto: UHC, DN, declividade"], ["Recalque", "AMT, NPSHd, curva do sistema, bomba"], ["Quantitativo", "por sistema, material e DN, com código SINAPI quando existe"], ["Lista de material", "cada peça com o ícone, a ficha técnica, o preço SINAPI com data-base e o coeficiente do cálculo"], ["Pendências", "avisos, chaves de norma que faltam, verificações não feitas"]]
      .forEach(function (a) { var row = ws.getRow(l++); row.getCell(1).value = a[0]; row.getCell(2).value = a[1]; corpoLinha(row, null, 2); });
    void n0;
    l++;
    ws.mergeCells(l, 1, l, N);
    var nota = ws.getCell(l, 1); nota.value = "Cada fórmula visível confere com o valor do cálculo; onde o valor do cálculo não é reproduzido pela fórmula simples, a célula traz o valor e a coluna Observação diz o motivo. \"" + NAO_VERIF + "\" = valor de norma ausente: a verificação não foi feita.";
    nota.alignment = { wrapText: true, vertical: "top" }; ws.getRow(l).height = 44; nota.font = { italic: true, color: { argb: "FF64748B" } };
    return ws;
  }

  function abaAF(wb, r, op, ctx) {
    var ws = wb.addWorksheet("Dimensionamento AF"), af = obj(obj(r.sistemas).agua_fria), trs = objs(af.trechos);
    var COLS = ["Trecho", "De", "Para", "Material", "DN modelo", "DN calculado", "Di (mm)", "L (m)", "Desnível (m)", "ΣP (pesos)", "Q (L/s)", "v (m/s)", "J (m/m)", "hf distribuída (m)", "hf localizada (m)", "hf total (m)", "P montante (kPa)", "P jusante (kPa)", "Situação", "Observação"];
    var N = COLS.length;
    larguras(ws, [10, 8, 8, 14, 9, 10, 9, 9, 10, 11, 10, 9, 11, 13, 13, 11, 13, 13, 14, 50]);
    titulo(ws, "Água fria — dimensionamento trecho a trecho", N);
    var l = selo(ws, 2, N, r.fixture === true);
    var C = coeficienteC(trs);
    var rowC = ws.getRow(l); rowC.getCell(1).value = "C (L/s)"; rowC.getCell(1).font = { bold: true };
    ws.mergeCells(l, 2, l, 4); rowC.getCell(2).value = "método: " + txt(af.metodoVazao || NAO_VERIF) + " · perda: " + txt(af.formulaPerda || NAO_VERIF);
    var cC = rowC.getCell(5);
    if (C !== null) { cC.value = C; cC.numFmt = "0.000"; cC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: amarelo } }; cC.border = thin(); }
    else { cC.value = NAO_VERIF; }
    ws.mergeCells(l, 6, l, 12);
    rowC.getCell(6).value = C !== null ? "← coeficiente do método dos pesos, lido dos passos do cálculo (Q = C·√ΣP); alterar aqui recalcula Q e v; J, perdas e pressões são as do cálculo (não recalculam)" : "coeficiente C não consta nos passos do cálculo: coluna Q com o valor do motor, sem fórmula";
    rowC.getCell(6).font = { italic: true, color: { argb: "FF64748B" } };
    var refC = "$E$" + l;
    l += 2;
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }];
    var primeira = l + 1; l++;
    trs.forEach(function (x) {
      var row = ws.getRow(l), obs = [];
      row.getCell(1).value = txt(x.aresta || x.id); row.getCell(1).font = { bold: true };
      row.getCell(2).value = txt(x.de); row.getCell(3).value = txt(x.para); row.getCell(4).value = txt(x.material);
      numCel(row, 5, x.dnModelo, INT); numCel(row, 6, x.dn, INT); numCel(row, 7, x.di_mm, "0.0"); numCel(row, 8, x.comprimento_m); numCel(row, 9, x.desnivel_m); numCel(row, 10, x.somaPesos);
      var rr = l;
      /* Q */
      if (C !== null && fin(x.somaPesos)) {
        if (!formulaCel(row, 11, refC + "*SQRT(J" + rr + ")", C * Math.sqrt(x.somaPesos), x.vazao_ls, NUM3, ctx)) obs.push("Q do cálculo difere de C·√ΣP (vazão limitada ao mínimo do aparelho ou outro método): valor do cálculo");
      } else numCel(row, 11, x.vazao_ls, NUM3);
      /* v = Q/A */
      if (fin(x.vazao_ls) && fin(x.di_mm) && x.di_mm > 0) formulaCel(row, 12, "K" + rr + "/1000/(PI()*(G" + rr + "/1000)^2/4)", x.vazao_ls / 1000 / (Math.PI * Math.pow(x.di_mm / 1000, 2) / 4), x.velocidade_ms, NUM, ctx);
      else numCel(row, 12, x.velocidade_ms);
      numCel(row, 13, x.J_m_m, NUM4);
      var dist = fin(x.J_m_m) && fin(x.comprimento_m) ? x.J_m_m * x.comprimento_m : NaN;
      formulaCel(row, 14, "M" + rr + "*H" + rr, dist, x.perdaDistribuida_m, NUM4, ctx);
      numCel(row, 15, x.perdaLocalizada_m, NUM4);
      var tot = fin(x.perdaDistribuida_m) && fin(x.perdaLocalizada_m) ? x.perdaDistribuida_m + x.perdaLocalizada_m : NaN;
      formulaCel(row, 16, "N" + rr + "+O" + rr, tot, x.perda_m, NUM4, ctx);
      numCel(row, 17, x.pressaoMontante_kpa, "0.0"); numCel(row, 18, x.pressaoJusante_kpa, "0.0");
      row.getCell(19).value = statusTxt(x.status);
      if (x.travado) obs.push("DN travado (verificado, não alterado)");
      if (fin(x.dnModelo) && fin(x.dn) && x.dnModelo !== x.dn) obs.push("DN do modelo " + x.dnModelo + " → calculado " + x.dn);
      arr(x.pendencias).forEach(function (k) { obs.push("não verificado: falta " + k); });
      row.getCell(20).value = txt(obs.join("; ")); row.getCell(20).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(row, x.status, N); l++;
    });
    if (trs.length) {
      var ult = l - 1, tr = ws.getRow(l);
      tr.getCell(1).value = "Totais"; tr.getCell(1).font = { bold: true };
      var sL = trs.reduce(function (a, x) { return a + (fin(x.comprimento_m) ? x.comprimento_m : 0); }, 0);
      tr.getCell(8).value = { formula: "SUM(H" + primeira + ":H" + ult + ")", result: sL }; tr.getCell(8).numFmt = NUM; ctx.formulas++;
      var sH = trs.reduce(function (a, x) { return a + (fin(x.perda_m) ? x.perda_m : 0); }, 0);
      tr.getCell(16).value = { formula: "SUM(P" + primeira + ":P" + ult + ")", result: sH }; tr.getCell(16).numFmt = NUM4; ctx.formulas++;
      for (var i = 1; i <= N; i++) { tr.getCell(i).border = thin(); tr.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cinza } }; tr.getCell(i).font = { bold: true }; }
      ctx.afTot = { linha: l, comprimento: sL, perda: sH };
      l += 2;
      ws.mergeCells(l, 1, l, 12);
      ws.getCell(l, 1).value = "Σ hf total é a soma das perdas de todos os trechos (informativa, não é a perda do caminho crítico).";
      ws.getCell(l, 1).font = { italic: true, color: { argb: "FF64748B" } };
      l += 2;
    } else {
      ws.mergeCells(l, 1, l, 8); ws.getCell(l, 1).value = "O resultado não trouxe trechos de água fria."; l += 2;
    }
    /* pontos */
    var pts = objs(af.pontos);
    if (pts.length) {
      var h2 = ws.getRow(l); ["Ponto", "Aparelho", "", "Cota (m)", "Q (L/s)", "Peso", "P dinâmica (kPa)", "P estática (kPa)", "P mínima (kPa)", "η = Pmín/Pdin", "Situação"].forEach(function (t, i) { if (t) h2.getCell(i + 1).value = t; });
      for (var k = 1; k <= 11; k++) { var cc = h2.getCell(k); cc.font = { bold: true, color: { argb: branco } }; cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; cc.alignment = { horizontal: "center", wrapText: true }; cc.border = thin(); }
      h2.height = 30; l++;
      pts.forEach(function (p) {
        var row = ws.getRow(l); row.getCell(1).value = txt(p.famInst || p.no); row.getCell(2).value = txt(p.aparelho);
        numCel(row, 4, p.cota); numCel(row, 5, p.vazao_ls, NUM3); numCel(row, 6, p.peso); numCel(row, 7, p.pressaoDinamica_kpa, "0.0"); numCel(row, 8, p.pressaoEstatica_kpa, "0.0"); numCel(row, 9, p.pressaoMinima_kpa, "0.0");
        formulaCel(row, 10, "I" + l + "/G" + l, fin(p.pressaoMinima_kpa) && fin(p.pressaoDinamica_kpa) && p.pressaoDinamica_kpa > 0 ? p.pressaoMinima_kpa / p.pressaoDinamica_kpa : NaN, p.eta, NUM, ctx);
        var st = p.status || (p.ok === true ? "ok" : (p.ok === false ? "reprovado" : "pendente"));
        row.getCell(11).value = statusTxt(st); corpoLinha(row, st, 11); l++;
      });
    }
    return ws;
  }

  function abaES(wb, r, op, ctx) {
    var ws = wb.addWorksheet("Dimensionamento ES"), es = obj(obj(r.sistemas).esgoto), trs = objs(es.trechos);
    var COLS = ["Trecho", "Classe", "Material", "DN modelo", "DN calculado", "UHC", "Declividade (%)", "Decl. mínima (%)", "Decl. ≥ mínima?", "Situação", "Passos / observação"];
    var N = COLS.length;
    larguras(ws, [10, 20, 14, 10, 11, 8, 13, 13, 14, 14, 70]);
    titulo(ws, "Esgoto sanitário — dimensionamento pelo método tabular (UHC × DN)", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }]; l++;
    var NCL = { ramal_descarga: "ramal de descarga", ramal_esgoto: "ramal de esgoto", tubo_queda: "tubo de queda", subcoletor: "subcoletor / coletor" };
    trs.forEach(function (x) {
      var row = ws.getRow(l), obs = arr(x.passos).map(txt);
      row.getCell(1).value = txt(x.aresta || x.id); row.getCell(1).font = { bold: true }; row.getCell(2).value = NCL[x.classe] || txt(x.classe); row.getCell(3).value = txt(x.material);
      numCel(row, 4, x.dnModelo, INT); numCel(row, 5, x.dn, INT); numCel(row, 6, x.uhc, INT);
      if (fin(x.declividade_pct)) numCel(row, 7, x.declividade_pct); else row.getCell(7).value = "—";
      if (fin(x.declividadeMin_pct)) numCel(row, 8, x.declividadeMin_pct); else row.getCell(8).value = "—";
      if (fin(x.declividade_pct) && fin(x.declividadeMin_pct)) {
        row.getCell(9).value = { formula: 'IF(G' + l + '>=H' + l + ',"OK","NÃO")', result: x.declividade_pct >= x.declividadeMin_pct ? "OK" : "NÃO" }; ctx.formulas++;
      } else row.getCell(9).value = "—";
      row.getCell(10).value = statusTxt(x.status);
      arr(x.pendencias).forEach(function (k) { obs.push("não verificado: falta " + k); });
      if (x.travado) obs.push("DN travado (verificado, não alterado)");
      row.getCell(11).value = obs.join(" | "); row.getCell(11).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(row, x.status, N); l++;
    });
    if (!trs.length) { ws.mergeCells(l, 1, l, 8); ws.getCell(l, 1).value = "O resultado não trouxe trechos de esgoto."; l++; }
    l++;
    var pts = objs(es.pontos);
    if (pts.length) {
      var h2 = ws.getRow(l); ["Ponto", "Aparelho", "UHC", "DN mín. (mm)", "Situação"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2); l++;
      var p0 = l;
      pts.forEach(function (p) { var row = ws.getRow(l); row.getCell(1).value = txt(p.famInst || p.peca || p.no); row.getCell(2).value = txt(p.aparelho); numCel(row, 3, p.uhc, INT); numCel(row, 4, p.dnMin, INT); row.getCell(5).value = statusTxt(p.status); corpoLinha(row, p.status, 5); l++; });
      var tr = ws.getRow(l), s = pts.reduce(function (a, p) { return a + (fin(p.uhc) ? p.uhc : 0); }, 0);
      tr.getCell(1).value = "Σ UHC dos aparelhos"; tr.getCell(1).font = { bold: true };
      tr.getCell(3).value = { formula: "SUM(C" + p0 + ":C" + (l - 1) + ")", result: s }; tr.getCell(3).numFmt = INT; ctx.formulas++;
      for (var i = 1; i <= 5; i++) { tr.getCell(i).border = thin(); tr.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cinza } }; }
      l += 2;
    }
    var vt = objs(es.ventilacao);
    if (vt.length) {
      var h3 = ws.getRow(l); ["Ventilação", "Tipo", "DN modelo", "DN exigido", "UHC", "Compr. (m)", "Situação", "", "", "", "Passos"].forEach(function (t, i) { if (t) h3.getCell(i + 1).value = t; });
      for (var k = 1; k <= 11; k++) { var cc = h3.getCell(k); cc.font = { bold: true, color: { argb: branco } }; cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; cc.border = thin(); }
      l++;
      vt.forEach(function (v) { var row = ws.getRow(l); row.getCell(1).value = txt(v.id); row.getCell(2).value = txt(v.tipo); numCel(row, 3, v.dnModelo, INT); numCel(row, 4, v.dnReq, INT); numCel(row, 5, v.uhc, INT); numCel(row, 6, v.comprimento_m); row.getCell(7).value = statusTxt(v.status); row.getCell(11).value = arr(v.passos).map(txt).join(" | "); corpoLinha(row, v.status, 11); l++; });
    }
    return ws;
  }

  function abaRecalque(wb, r, op, ctx) {
    var ws = wb.addWorksheet("Recalque"), rc = r.recalque && typeof r.recalque === "object" ? r.recalque : null;
    larguras(ws, [46, 16, 16, 60]);
    titulo(ws, "Recalque — altura manométrica, NPSH e bomba", 4);
    var l = selo(ws, 2, 4, r.fixture === true) + 1;
    if (!rc) { ws.mergeCells(l, 1, l, 4); ws.getCell(l, 1).value = "Recalque não calculado: o cálculo foi executado sem dados de recalque (níveis, vazão, bombas)."; ws.getCell(l, 1).font = { italic: true }; return ws; }
    var hdr = ws.getRow(l++); ["Grandeza", "Valor", "Unidade", "Origem"].forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr);
    var rows = {};
    function linha(chave, rot, v, un, org, fmt) { var row = ws.getRow(l); row.getCell(1).value = rot; numCel(row, 2, v, fmt); row.getCell(3).value = un; row.getCell(4).value = org; corpoLinha(row, null, 4); rows[chave] = l; l++; return row; }
    linha("q", "Vazão de projeto", rc.vazao_m3h, "m³/h", "cálculo (consumo do programa ÷ horas de funcionamento, ou vazão informada)");
    linha("hg", "Altura geométrica Hg", rc.Hg_m, "m", "níveis de sucção e de chegada");
    linha("hs", "Perda de carga na sucção", rc.perdaSuccao_m, "m", "cálculo", NUM3);
    linha("hr", "Perda de carga no recalque", rc.perdaRecalque_m, "m", "cálculo", NUM3);
    var res = fin(rc.AMT_m) && fin(rc.Hg_m) && fin(rc.perdaSuccao_m) && fin(rc.perdaRecalque_m) ? rc.AMT_m - rc.Hg_m - rc.perdaSuccao_m - rc.perdaRecalque_m : NaN;
    if (fin(res) && Math.abs(res) < 1e-9) res = 0;
    linha("res", "Pressão residual exigida na chegada", res, "m", "derivada: AMT − Hg − perdas (o contrato não traz o campo separado)", NUM3);
    var rowA = linha("amt", "Altura manométrica total (AMT)", NaN, "m", "AMT = Hg + hf sucção + hf recalque + residual");
    formulaCel(rowA, 2, "B" + rows.hg + "+B" + rows.hs + "+B" + rows.hr + "+B" + rows.res, fin(res) ? rc.Hg_m + rc.perdaSuccao_m + rc.perdaRecalque_m + res : NaN, rc.AMT_m, NUM, ctx);
    rowA.getCell(1).font = { bold: true };
    linha("npsh", "NPSH disponível", rc.NPSHd_m, "m", "cálculo (altitude, temperatura, nível de sucção)");
    var e = obj(rc.escolha);
    l++;
    var h2 = ws.getRow(l++); ["Bomba escolhida", "Q operação (m³/h)", "H operação (m)", "NPSHr (m) · NPSHd (m) · situação"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2);
    var row = ws.getRow(l++);
    if (e.id) { row.getCell(1).value = txt(e.nome || e.id); numCel(row, 2, e.q_op); numCel(row, 3, e.h_op); row.getCell(4).value = "NPSHr " + (fin(e.npshr) ? e.npshr.toFixed(2).replace(".", ",") : NAO_VERIF) + " · NPSHd " + (fin(e.npshd) ? e.npshd.toFixed(2).replace(".", ",") : NAO_VERIF) + " · " + (e.aprovada === true ? "OK" : (e.aprovada === false ? "NÃO ATENDE" : NAO_VERIF)); }
    else row.getCell(1).value = "nenhuma bomba escolhida";
    corpoLinha(row, e.aprovada === false ? "reprovado" : null, 4);
    l++;
    var h3 = ws.getRow(l++); ["Curva do sistema", "Q (m³/h)", "H (m)"].forEach(function (t, i) { h3.getCell(i + 1).value = t; }); cab(h3);
    arr(rc.curvaSistema).forEach(function (p) { var rw = ws.getRow(l++); rw.getCell(1).value = "ponto"; numCel(rw, 2, p.q_m3h); numCel(rw, 3, p.h_m); corpoLinha(rw, null, 3); });
    l++;
    var h4 = ws.getRow(l++); ["Verificação", "η", "Situação", "Passos · fonte"].forEach(function (t, i) { h4.getCell(i + 1).value = t; }); cab(h4);
    objs(rc.verificacoes).forEach(function (v) { var rw = ws.getRow(l++); rw.getCell(1).value = txt(v.nome); numCel(rw, 2, v.eta); rw.getCell(3).value = statusTxt(v.status); rw.getCell(4).value = txt(arr(v.passos).join(" | ") + (v.fonte ? " — " + fonteTxt(v.fonte) : "")); rw.getCell(4).alignment = { wrapText: true, vertical: "top" }; corpoLinha(rw, v.status, 4); });
    return ws;
  }

  /* PRESSURIZAÇÃO: as tabelas do memorial parametrizado (entradas, seleção na curva de todos os candidatos, opções de
     correção com custo, especificação e quantitativo do conjunto com SINAPI real ou pendente) — a MESMA fonte do memorial */
  function abaPressao(wb, r, ctx) {
    var PZ = dep("HidPressao"), M = PZ && PZ.memorial ? PZ.memorial(r) : null;
    if (!M || !arr(M.secoes).length) return null;
    var ws = wb.addWorksheet("Pressurização"), N = 7;   // hid:ok apresentação da planilha (colunas, fonte)
    larguras(ws, [44, 22, 18, 18, 22, 40, 50]);   // hid:ok apresentação da planilha (colunas, fonte)
    titulo(ws, "Pressurização da água fria — seleção na curva do fabricante", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    M.secoes.forEach(function (s) {
      var rt = ws.getRow(l++); rt.getCell(1).value = txt(s.titulo); rt.getCell(1).font = { bold: true, size: 12 };   // hid:ok apresentação da planilha (colunas, fonte)
      arr(s.tabelas).forEach(function (tb) {
        var r0 = ws.getRow(l++); r0.getCell(1).value = txt(tb.titulo); r0.getCell(1).font = { bold: true };
        var hd = ws.getRow(l++); arr(tb.cab).forEach(function (c, i) { hd.getCell(i + 1).value = txt(c); }); cab(hd);
        arr(tb.linhas).forEach(function (ln) { var rw = ws.getRow(l++); arr(ln).forEach(function (c, i) { rw.getCell(i + 1).value = txt(c); rw.getCell(i + 1).alignment = { wrapText: true, vertical: "top" }; }); corpoLinha(rw, /não atende|não resolve|^não$/.test(arr(ln).join(" ")) ? "reprovado" : null, Math.max(arr(tb.cab).length, 1)); });
        l++;
      });
      arr(s.paragrafos).forEach(function (p) { ws.mergeCells(l, 1, l, N); var c = ws.getCell(l, 1); c.value = txt(p); c.alignment = { wrapText: true, vertical: "top" }; ws.getRow(l).height = Math.min(220, 15 * Math.ceil(txt(p).length / 160)); l++; });   // hid:ok altura da linha pelo tamanho do texto (apresentação)
      l++;
    });
    return ws;
  }

  /* quantitativo → linhas planas */
  function linhasQto(q) {
    var out = [], NSIS = {};
    arr(obj(q).porSistema).forEach(function (s) { NSIS[s.sistema] = s.nome; });
    function sis(s) { return NSIS[s] || s || ""; }
    /* B2 (frente 1c): o adaptador com flange que os serviços da caixa já orçam (sinapi.incluso) NÃO leva o código na linha — quem somar a coluna "Código SINAPI" não o conta duas vezes;
       a situação e a observação dizem em qual serviço ele está (a peça continua listada, com a quantidade, para a lista de material) */
    function sin(x, g) {
      var s = obj(x), gg = obj(g);
      /* FRENTE 1g (27/10/2026): insumo SINAPI (material) + MO da composição análoga, ou referência de mercado (+ MO): diz a origem de cada parcela e a pendência da instalação */
      if (s.status === "ok" && s.insumo && s.codigo) return { codigo: String(s.codigo), desc: s.descricao || "", un: s.unidade || "", sit: s.moFalta ? "insumo SINAPI (instalação PENDENTE)" : "insumo SINAPI + mão de obra análoga", mot: s.observacao || "" };
      if (s.status !== "ok" && gg.mercado && gg.mercado.valor > 0) return { codigo: "", desc: "", un: s.unidade || gg.mercado.unidade || "", sit: gg.moFalta ? "referência de mercado (instalação PENDENTE)" : (gg.mercado.nFontes === 1 ? "referência de mercado — 1 fonte, conferir" : "referência de mercado"),
        mot: "material: " + (gg.mercado.textoLongo || (gg.mercado.texto + " — " + gg.mercado.criterio)) + (gg.moDe ? "; instalação: mão de obra da composição " + gg.moDe.codigo + " (" + gg.moDe.observacao + ")" : (gg.moFalta ? "; PENDÊNCIA: " + gg.moFalta : "")) };
      if (s.incluso) return { codigo: "", desc: "", un: s.unidade || "", sit: "incluso nos serviços da caixa", mot: (s.observacao || "já orçado nos serviços da caixa d'água") + (s.codigo ? " (código " + s.codigo + " lá, não somar aqui)" : ""), incluso: true };
      return { codigo: s.status === "ok" && s.codigo ? String(s.codigo) : "", desc: s.status === "ok" ? (s.descricao || "") : "", un: s.unidade || "", sit: s.status === "ok" ? "código da tabela" : (s.status === "pendente" ? "PENDENTE" : "sem composição"), mot: s.status === "pendente" ? (s.motivo || "") : (s.observacao || "") };
    }
    arr(q.tubos).forEach(function (g) { out.push({ sistema: sis(g.sistema), material: g.material, item: "Tubo", desc: "Tubo " + (g.material || ""), dn: g.dn, dn2: "", qtd: g.quantidade, un: g.unidade || "m", n: g.n, s: sin(g.sinapi) }); });
    arr(q.conexoes).forEach(function (g) { out.push({ sistema: sis(g.sistema), material: g.material, item: "Conexão", desc: g.nome || g.tipo, dn: g.dn, dn2: g.dn2 || "", qtd: g.n, un: "un", n: g.n, s: sin(g.sinapi, g) }); });
    arr(q.pontosSemRosca).forEach(function (p) { out.push({ sistema: "agua_fria", material: "", item: "Pendência", desc: "Peça de ligação do ponto de água (" + (p.famId || "aparelho") + ")", dn: "", dn2: "", qtd: 1, un: "un", n: 1, s: { codigo: "", desc: "", un: "un", sit: "PENDENTE", mot: p.texto || "ponto de água sem rosca padrão — peça de ligação a definir" } }); });   /* M3 (frente 1c) */
    arr(q.pecas).forEach(function (g) { out.push({ sistema: sis(g.sistema), material: g.material, item: "Peça", desc: g.nome || g.peca, dn: g.dn, dn2: "", qtd: g.n, un: "un", n: g.n, s: sin(g.sinapi, g) }); });
    arr(q.acessorios).forEach(function (g) { out.push({ sistema: sis(g.sistema), material: g.material, item: "Acessório", desc: (g.nome || g.acessorio) + (g.variante ? " (" + g.variante + ")" : ""), dn: g.dn, dn2: "", qtd: g.n, un: "un", n: g.n, s: sin(g.sinapi) }); });
    /* a placa sem composição SINAPI única (mista / intermediário de vários módulos — js/biminst.js composInterruptor) é orçada por
       PARCELAS: uma linha por composição, com a quantidade dela (antes saía só a 1ª — a planilha não fechava com o orçamento) */
    arr(q.dispositivos).forEach(function (g) {
      if (arr(g.composicoes).length) { g.composicoes.forEach(function (cp, i) { out.push({ sistema: "dispositivos", material: g.material, item: "Dispositivo", desc: (g.rotulo || g.nome || g.peca) + (g.composicoes.length > 1 ? " — parcela " + (i + 1) + " de " + g.composicoes.length : ""), dn: g.dn, dn2: "", qtd: g.n * (cp.qtd != null ? cp.qtd : 1), un: "un", n: g.n, s: sin(cp) }); }); return; }
      out.push({ sistema: "dispositivos", material: g.material, item: "Dispositivo", desc: g.rotulo || g.nome || g.peca, dn: g.dn, dn2: "", qtd: g.n, un: "un", n: g.n, s: sin(g.sinapi) });
    });
    return out;
  }

  function abaQuantitativo(wb, r, q, op, ctx) {
    var ws = wb.addWorksheet("Quantitativo");
    var COLS = ["Sistema", "Material", "Item", "Descrição", "DN (mm)", "DN 2 (mm)", "Quantidade", "Un.", "Código SINAPI", "Descrição SINAPI", "Situação SINAPI", "Observação"], N = COLS.length;
    larguras(ws, [16, 18, 12, 40, 9, 9, 12, 6, 14, 52, 18, 60]);
    titulo(ws, "Quantitativo por sistema, material e DN", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    if (!q || typeof q !== "object") { ws.mergeCells(l, 1, l, N); ws.getCell(l, 1).value = "Quantitativo não informado: não foi possível levantar os materiais do modelo. Não verificado: quantitativo."; ws.getCell(l, 1).font = { italic: true, color: { argb: vermelho } }; ctx.semQto = true; return ws; }
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 0, ySplit: l }]; l++;
    var primeira = l, lin = linhasQto(q);
    lin.forEach(function (x) {
      var row = ws.getRow(l);
      row.getCell(1).value = txt(x.sistema); row.getCell(2).value = txt(x.material); row.getCell(3).value = x.item; row.getCell(4).value = txt(x.desc);
      if (fin(Number(x.dn)) && x.dn !== "" && x.dn !== "-") { row.getCell(5).value = Number(x.dn); row.getCell(5).numFmt = INT; } else row.getCell(5).value = x.dn === "" || x.dn == null ? "—" : txt(x.dn);
      if (fin(Number(x.dn2)) && x.dn2 !== "") { row.getCell(6).value = Number(x.dn2); row.getCell(6).numFmt = INT; }
      row.getCell(7).value = x.qtd; row.getCell(7).numFmt = x.un === "un" ? INT : NUM; row.getCell(8).value = x.un;
      row.getCell(9).value = x.s.codigo; row.getCell(10).value = txt(x.s.desc); row.getCell(11).value = x.s.sit; row.getCell(12).value = txt(x.s.mot);
      row.getCell(12).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(row, x.s.codigo || x.s.incluso ? null : "pendente", N); l++;
    });
    var ult = l - 1;
    if (!lin.length) { ws.mergeCells(l, 1, l, N); ws.getCell(l, 1).value = "O quantitativo veio vazio (sem tubos, conexões ou peças)."; l++; }
    l++;
    var h2 = ws.getRow(l++); ["Total de tubo por sistema", "", "", "", "", "", "Metros", "Un."].forEach(function (t, i) { if (t) h2.getCell(i + 1).value = t; });
    for (var k = 1; k <= 8; k++) { var cc = h2.getCell(k); cc.font = { bold: true, color: { argb: branco } }; cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; cc.border = thin(); }
    var sistemas = []; lin.forEach(function (x) { if (x.item === "Tubo" && sistemas.indexOf(x.sistema) < 0) sistemas.push(x.sistema); });
    ctx.qtoSistemas = [];
    sistemas.forEach(function (s) {
      var rw = ws.getRow(l), tot = lin.filter(function (x) { return x.item === "Tubo" && x.sistema === s && x.un === "m"; }).reduce(function (a, x) { return a + (fin(x.qtd) ? x.qtd : 0); }, 0);
      rw.getCell(1).value = s;
      rw.getCell(7).value = { formula: 'SUMIFS(G' + primeira + ':G' + ult + ',A' + primeira + ':A' + ult + ',A' + l + ',C' + primeira + ':C' + ult + ',"Tubo",H' + primeira + ':H' + ult + ',"m")', result: tot }; rw.getCell(7).numFmt = NUM; rw.getCell(8).value = "m"; ctx.formulas++;
      for (var i = 1; i <= 8; i++) rw.getCell(i).border = thin();
      ctx.qtoSistemas.push({ sistema: s, metros: tot }); l++;
    });
    var semCod = lin.filter(function (x) { return !x.s.codigo; }).length;
    l++;
    ws.mergeCells(l, 1, l, N);
    ws.getCell(l, 1).value = semCod ? semCod + " de " + lin.length + " linha(s) sem código SINAPI: a coluna fica vazia e a situação diz o motivo (nunca se usa a composição \"parecida\")." : "Todas as linhas têm código da tabela SINAPI do projeto.";
    ws.getCell(l, 1).font = { italic: true, color: { argb: semCod ? vermelho : "FF64748B" } };
    ctx.qtoLinhas = lin.length; ctx.qtoSemCodigo = semCod;
    return ws;
  }

  /* ================================================================ LISTA DE MATERIAL COM O ÍCONE DA PEÇA (frente PEÇA COMPLETA)
   * Pedido do Rogério (17/10/2026): "na lista de material sair o ícone da peça". Uma linha por peça com a ficha técnica
   * (js/hidpecas.js): a IMAGEM na célula (opcoes.icones = { nome: data URL ou Buffer PNG }), descrição padronizada,
   * código do fabricante, composição SINAPI da aplicação com o preço e a data-base, total por FÓRMULA (Qtd × preço) e o
   * coeficiente que o cálculo usa, com a fonte. Preço estimado (sem composição própria) sai marcado ESTIMATIVA; sem
   * preço, a célula fica vazia e a coluna diz o que falta (nunca 0). */
  function abaListaMaterial(wb, r, q, op, ctx) {
    var PC = op.HidPecas || dep("HidPecas"), ic = obj(op.icones);
    var lin = arr(op.materiais).length ? arr(op.materiais) : (PC && PC.listaMaterial ? PC.listaMaterial(q, op.familias, op) : []);
    var ws = wb.addWorksheet("Lista de material");
    var COLS = ["Peça", "Descrição padronizada", "Material", "DN (mm)", "Qtd.", "Un.", "Fabricante (código)", "Código SINAPI", "Descrição SINAPI", "Preço unit. (R$)", "Total (R$)", "Data-base", "Critério do preço", "Norma do produto", "Coeficientes de cálculo (fonte)"], N = COLS.length;
    larguras(ws, [9, 40, 20, 9, 9, 6, 26, 12, 46, 13, 14, 10, 40, 22, 60]);
    titulo(ws, "Lista de material — peças com ficha técnica (ícone, código, preço e coeficiente)", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    if (!lin.length) { ws.mergeCells(l, 1, l, N); ws.getCell(l, 1).value = PC ? "Sem peças no quantitativo do modelo." : "Fichas técnicas das peças não carregadas (js/hidpecas.js): lista não gerada."; ws.getCell(l, 1).font = { italic: true, color: { argb: vermelho } }; ctx.listaLinhas = 0; return ws; }
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 2, ySplit: l }]; l++;
    var primeira = l, imgs = {}, nImg = 0, semPreco = 0, est = 0;
    lin.forEach(function (x) {
      var row = ws.getRow(l), pr = obj(x.preco), q0 = typeof x.quantidade === "number" ? x.quantidade : null;
      row.height = 42;
      row.getCell(2).value = txt(x.descricao) + (x.produto ? " — " + txt(x.produto) : "") + (x.origem === "importada" ? " (família importada mapeada)" : ""); row.getCell(2).font = { bold: true };
      row.getCell(3).value = txt(x.material);
      if (fin(Number(x.dn)) && x.dn !== "" && x.dn !== null) { row.getCell(4).value = Number(x.dn); row.getCell(4).numFmt = INT; } else row.getCell(4).value = x.dn ? txt(x.dn) : "—";
      if (q0 != null) { row.getCell(5).value = q0; row.getCell(5).numFmt = x.unidade === "m" ? NUM : INT; }
      row.getCell(6).value = txt(x.unidade);
      row.getCell(7).value = arr(x.fabricante).map(txt).join("\n") || "—";
      row.getCell(8).value = pr.codigo ? String(pr.codigo) : "";
      row.getCell(9).value = txt(pr.descricao || "");
      if (fin(pr.valor)) { row.getCell(10).value = pr.valor; row.getCell(10).numFmt = NUM;
        if (q0 != null) { row.getCell(11).value = { formula: "E" + l + "*J" + l, result: Math.round(q0 * pr.valor * 100) / 100 }; row.getCell(11).numFmt = NUM; ctx.formulas++; } }
      else semPreco++;
      if (pr.estimativa) est++;
      row.getCell(12).value = pr.data ? String(pr.data).split("-").reverse().join("/") : "";
      row.getCell(13).value = pr.estimativa ? "ESTIMATIVA — " + txt(pr.criterio) : (fin(pr.valor) ? txt(pr.criterio) : "sem preço: " + txt(pr.criterio || pr.fonteNecessaria || "sem composição"));
      row.getCell(14).value = x.norma ? txt(x.norma) : (x.normaPendente ? "não consta no catálogo" : "—");
      row.getCell(15).value = arr(x.coeficientes).map(function (k) { return txt(k.rotulo) + ": " + txt(k.texto) + (k.fonte ? " (" + txt(k.fonte) + ")" : ""); }).join("\n") || "—";
      corpoLinha(row, fin(pr.valor) ? null : "pendente", N);
      for (var c = 2; c <= N; c++) row.getCell(c).alignment = { wrapText: true, vertical: "middle" };
      /* a IMAGEM da peça na coluna A (uma por ícone no arquivo, reaproveitada nas linhas) */
      var d = x.icone ? ic[x.icone] : null;
      if (d) {
        if (imgs[x.icone] == null) imgs[x.icone] = typeof d === "string" ? wb.addImage({ base64: d, extension: "png" }) : wb.addImage({ buffer: d, extension: "png" });
        ws.addImage(imgs[x.icone], { tl: { col: 0.12, row: l - 1 + 0.06 }, ext: { width: 52, height: 52 }, editAs: "oneCell" }); nImg++;
      } else row.getCell(1).value = "sem ícone";
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: branco } };
      l++;
    });
    var ult = l - 1, tot = ws.getRow(l);
    var soma = lin.reduce(function (a, x) { var pr = obj(x.preco); return a + (fin(pr.valor) && typeof x.quantidade === "number" ? Math.round(x.quantidade * pr.valor * 100) / 100 : 0); }, 0);
    tot.getCell(10).value = "Total"; tot.getCell(11).value = { formula: "SUM(K" + primeira + ":K" + ult + ")", result: Math.round(soma * 100) / 100 }; tot.getCell(11).numFmt = NUM; ctx.formulas++;
    for (var k = 10; k <= 11; k++) { tot.getCell(k).font = { bold: true }; tot.getCell(k).border = thin(); }
    l += 2;
    ws.mergeCells(l, 1, l, N);
    ws.getCell(l, 1).value = "Preço: composição SINAPI da aplicação do trecho (data-base na coluna L). " + (est ? est + " linha(s) com ESTIMATIVA pelo mais alto (sem composição própria — regra RA). " : "") + (semPreco ? semPreco + " linha(s) sem preço: a coluna M diz a fonte que falta. " : "") + "Coeficiente: o valor que o cálculo lê da ficha da peça, com a fonte.";
    ws.getCell(l, 1).font = { italic: true, color: { argb: semPreco ? vermelho : "FF64748B" } };
    ctx.listaLinhas = lin.length; ctx.listaImagens = nImg; ctx.listaSemPreco = semPreco; ctx.listaTotal = Math.round(soma * 100) / 100;
    return ws;
  }

  function abaPendencias(wb, r, q, op, ctx) {
    var ws = wb.addWorksheet("Pendências"), N = 5;
    larguras(ws, [16, 34, 70, 44, 44]);
    titulo(ws, "Avisos, pendências e verificações não feitas", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    function bloco(titulo_, cols, linhas, vazio) {
      var h = ws.getRow(l); h.getCell(1).value = titulo_; h.getCell(1).font = { bold: true, size: 11, color: { argb: navy } }; l++;
      var hd = ws.getRow(l); cols.forEach(function (t, i) { hd.getCell(i + 1).value = t; }); cab(hd); l++;
      if (!linhas.length) { ws.mergeCells(l, 1, l, N); ws.getCell(l, 1).value = vazio; ws.getCell(l, 1).font = { italic: true }; l++; }
      linhas.forEach(function (x) { var rw = ws.getRow(l); x.v.forEach(function (c, i) { rw.getCell(i + 1).value = txt(c); rw.getCell(i + 1).alignment = { wrapText: true, vertical: "top" }; }); corpoLinha(rw, x.st, N); l++; });
      l++;
    }
    var ORD = { erro: 0, aviso: 1, info: 2 };
    var av = objs(r.avisos).slice().sort(function (a, b) { return (ORD[a.gravidade] == null ? 3 : ORD[a.gravidade]) - (ORD[b.gravidade] == null ? 3 : ORD[b.gravidade]); });
    bloco("Avisos do cálculo", ["Gravidade", "Sistema / elementos", "Aviso", "Como corrigir", ""], av.map(function (a) { return { v: [String(a.gravidade || "").toUpperCase(), (a.sistema || "") + (arr(a.elementos).length ? " — " + arr(a.elementos).join(", ") : ""), a.texto, a.corrigir && a.corrigir.texto ? a.corrigir.texto : "", ""], st: a.gravidade === "erro" ? "reprovado" : (a.gravidade === "aviso" ? "pendente" : null) }; }), "O cálculo não emitiu avisos.");
    bloco("Valores de norma pendentes (não verificado)", ["Situação", "Chave que falta", "Motivo", "Não verificado em", ""], objs(r.pendencias).map(function (p) { return { v: ["NÃO VERIFICADO", "falta " + p.chave, p.motivo, arr(p.usadoEm).join(" | "), ""], st: "pendente" }; }), "Nenhuma chave de tabela de norma ficou pendente.");
    var vs = objs(r.verificacoes);
    bloco("Verificações pendentes ou que não atendem", ["Situação", "Sistema / alvo", "Verificação", "Passos", "Fonte"], vs.filter(function (v) { return v.status !== "ok"; }).map(function (v) { return { v: [statusTxt(v.status), (v.sistema || "") + " / " + (v.alvo || ""), v.nome + (v.status === "pendente" ? " — não verificado" : ""), arr(v.passos).join(" | "), fonteTxt(v.fonte)], st: v.status }; }), "Todas as verificações do resultado atendem.");
    var pr = [];
    if (q && typeof q === "object") {
      lin: { linhasQto(q).filter(function (x) { return !x.s.codigo && !x.s.incluso; }).forEach(function (x) { pr.push({ v: ["SEM CÓDIGO", x.sistema + " / " + x.item + " DN " + x.dn, x.desc, x.s.mot || x.s.sit, ""], st: "pendente" }); }); }
    } else pr.push({ v: ["NÃO VERIFICADO", "Quantitativo", "Quantitativo não informado ao gerar as planilhas", "", ""], st: "pendente" });
    if (!r.recalque) pr.push({ v: ["NÃO ABRANGIDO", "Recalque", "Cálculo executado sem dados de recalque", "", ""], st: null });
    if (!r.programa) pr.push({ v: ["NÃO ABRANGIDO", "Programa de necessidades", "Cálculo executado sem programa (população, consumo, reservação)", "", ""], st: null });
    pr.push({ v: ["NÃO ABRANGIDO", "Esgoto", "Caixas de inspeção, caixa de gordura e destino final do esgoto não são dimensionados nesta fase", "", ""], st: null });
    bloco("Itens sem código SINAPI e partes não abrangidas", ["Situação", "Onde", "Descrição", "Motivo", ""], pr, "Nenhum.");
    return ws;
  }


  /* ================================================================ ÁGUA QUENTE (fase 2) — só quando o resultado traz */
  function abaAQ(wb, r, op, ctx) {
    var aq = obj(obj(r.sistemas).agua_quente), trs = objs(aq.trechos);
    var ws = wb.addWorksheet("Dimensionamento AQ");
    var COLS = ["Trecho", "Material", "DN modelo", "DN calculado", "Di (mm)", "L (m)", "ΣP", "Q (L/s)", "v (m/s)", "hf (m)", "P jusante (kPa)", "Situação", "Passos / observação"];
    var N = COLS.length;
    larguras(ws, [10, 10, 10, 11, 9, 9, 8, 10, 9, 10, 13, 13, 70]);
    titulo(ws, "Água quente — mesmo método da água fria (vazões " + (aq.fonteVazoes === "envoltoria" ? "pela envoltória Tigre × USP" : txt(aq.fonteVazoes)) + ")", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }]; l++;
    trs.forEach(function (x) {
      var row = ws.getRow(l), obs = arr(x.passos).map(txt);
      row.getCell(1).value = txt(x.aresta || x.id); row.getCell(1).font = { bold: true }; row.getCell(2).value = txt(x.material);
      numCel(row, 3, x.dnModelo, INT); numCel(row, 4, x.dn, INT); numCel(row, 5, x.di_mm, NUM); numCel(row, 6, x.comprimento_m); numCel(row, 7, x.somaPesos);
      numCel(row, 8, x.vazao_ls, NUM3); numCel(row, 9, x.velocidade_ms); numCel(row, 10, x.perda_m, NUM4); numCel(row, 11, x.pressaoJusante_kpa);
      row.getCell(12).value = statusTxt(x.status);
      arr(x.pendencias).forEach(function (k) { obs.push("não verificado: falta " + k); });
      row.getCell(13).value = obs.join(" | "); row.getCell(13).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(row, x.status, N); l++;
    });
    if (!trs.length) { ws.mergeCells(l, 1, l, 8); ws.getCell(l, 1).value = "Sem rede de água quente no modelo (só consumo e aquecimento)."; l++; }
    l++;
    var h2 = ws.getRow(l); ["Item", "Valor", "Situação / passos"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2); l++;
    function item(rot, v, txtSit, st) { var rw = ws.getRow(l); rw.getCell(1).value = rot; if (typeof v === "number") numCel(rw, 2, v); else rw.getCell(2).value = txt(v == null ? NAO_VERIF : v); rw.getCell(3).value = txt(txtSit); rw.getCell(3).alignment = { wrapText: true, vertical: "top" }; corpoLinha(rw, st || null, 3); l++; }
    var cs = obj(aq.consumo), ah = obj(aq.aquecimento);
    if (aq.consumo) item("Volume diário de água quente (L)", cs.volumeNecessario_L, cs.metodoAdotado || "", cs.status);
    if (aq.aquecimento) item("Aquecimento (" + txt(ah.tipo) + ")", ah.volumeAdotado_L != null ? ah.volumeAdotado_L : (ah.nAquecedores != null ? ah.nAquecedores : null), arr(ah.passos).join(" | "), ah.status);
    objs(aq.misturadores).forEach(function (m) { item("Misturador " + txt(m.famInst) + " — |Δp| (kPa)", m.dif_kpa, m.limite_kpa == null ? "limite sem fonte — não verificado" : "limite " + m.limite_kpa + " kPa", m.status); });
    if (aq.recirculacao && aq.recirculacao.maior) item("Maior comprimento sem retorno (m)", aq.recirculacao.maior.comprimento_m, aq.recirculacao.limite_m == null ? "limite sem fonte — não verificado" : "limite " + aq.recirculacao.limite_m + " m", aq.recirculacao.limite_m == null ? "pendente" : (aq.recirculacao.precisaRetorno ? "reprovado" : "ok"));
    objs(aq.dilatacao).forEach(function (x) { if (fin(x.deltaL_mm)) item("Dilatação " + txt(x.aresta || x.trecho) + " (mm)", x.deltaL_mm, "α " + x.alfa_mm_m_C + " mm/(m·°C), ΔT " + x.deltaT_C + " °C"); });
    return ws;
  }

  /* ================================================================ PLUVIAL (fase 2) — só quando o resultado traz */
  function abaAP(wb, r, op, ctx) {
    var ap = obj(obj(r.sistemas).pluvial), trs = objs(ap.trechos), I = obj(ap.intensidade);
    var ws = wb.addWorksheet("Pluvial");
    var COLS = ["Trecho / item", "Classe", "Material", "DN modelo", "DN calculado", "Q (L/min)", "i (%)", "i mín. (%)", "i ≥ mín.?", "Situação", "Passos / observação"];
    var N = COLS.length;
    larguras(ws, [16, 18, 12, 10, 11, 11, 9, 9, 10, 13, 70]);
    titulo(ws, "Águas pluviais — I = " + (fin(I.valor_mm_h) ? I.valor_mm_h + " mm/h (" + (I.origem === "informada" ? "informada pelo projetista: " + txt(obj(I.fonte).doc) : txt(I.localidade || I.origem)) + ")" : NAO_VERIF), N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }]; l++;
    objs(ap.areas).forEach(function (a) { var rw = ws.getRow(l); rw.getCell(1).value = "área " + txt(a.id); rw.getCell(2).value = "caso " + txt(a.caso || "informada"); numCel(rw, 6, a.vazao_l_min); rw.getCell(10).value = statusTxt(a.status); rw.getCell(11).value = arr(a.passos).map(txt).join(" | "); corpoLinha(rw, a.status, N); l++; });
    objs(ap.calhas).forEach(function (x) { var rw = ws.getRow(l); rw.getCell(1).value = "calha " + txt(x.id); rw.getCell(2).value = txt(x.secao); numCel(rw, 6, x.vazaoProjeto_l_min); numCel(rw, 7, x.declividade_pct); rw.getCell(10).value = statusTxt(x.status); rw.getCell(11).value = "capacidade " + (fin(x.capacidade_l_min) ? x.capacidade_l_min.toFixed(1) : NAO_VERIF) + " L/min — " + txt(x.metodoCapacidade || "") + " | bocal pelo ábaco: não verificado"; corpoLinha(rw, x.status, N); l++; });
    trs.forEach(function (x) {
      var row = ws.getRow(l), obs = arr(x.passos).map(txt);
      row.getCell(1).value = txt(x.aresta || x.id); row.getCell(1).font = { bold: true }; row.getCell(2).value = x.classe === "condutor_vertical" ? "condutor vertical" : "condutor horizontal"; row.getCell(3).value = txt(x.material);
      numCel(row, 4, x.dnModelo, INT); numCel(row, 5, x.dn, INT); numCel(row, 6, x.vazao_l_min);
      if (fin(x.declividade_pct)) numCel(row, 7, x.declividade_pct); else row.getCell(7).value = "—";
      if (fin(x.declividadeMin_pct)) numCel(row, 8, x.declividadeMin_pct); else row.getCell(8).value = "—";
      if (fin(x.declividade_pct) && fin(x.declividadeMin_pct)) { row.getCell(9).value = { formula: 'IF(G' + l + '>=H' + l + ',"OK","NÃO")', result: x.declividade_pct >= x.declividadeMin_pct ? "OK" : "NÃO" }; ctx.formulas++; } else row.getCell(9).value = "—";
      row.getCell(10).value = statusTxt(x.status);
      arr(x.pendencias).forEach(function (k) { obs.push("não verificado: falta " + k); });
      row.getCell(11).value = obs.join(" | "); row.getCell(11).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(row, x.status, N); l++;
    });
    var apr = ap.aproveitamento;
    if (apr) {
      l++;
      var h2 = ws.getRow(l); ["Aproveitamento (NBR 15527 — métodos lidos em fonte da edição 2007)", "Volume (L)", "Situação / passos"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2); l++;
      objs(apr.metodos).forEach(function (m) { var rw = ws.getRow(l); rw.getCell(1).value = txt(m.metodo); numCel(rw, 2, m.volume_L, INT); rw.getCell(3).value = statusTxt(m.status) + " — " + arr(m.passos).map(txt).join(" | "); corpoLinha(rw, m.status, 3); l++; });
      if (fin(apr.descarte_L)) { var rd = ws.getRow(l); rd.getCell(1).value = "descarte do escoamento inicial (L por chuva)"; numCel(rd, 2, apr.descarte_L, INT); corpoLinha(rd, null, 3); l++; }
    }
    return ws;
  }

  /* ================================================================ INCÊNDIO (F3) */
  function abaINC(wb, r, op, ctx) {
    var inc = obj(obj(r.sistemas).incendio), en = obj(inc.enquadramento), rv = obj(inc.reserva), hd = obj(inc.hidrantes), ex = obj(inc.extintores), ch = obj(inc.chuveiros);
    var ws = wb.addWorksheet("Incêndio");
    var COLS = ["Item", "Grandeza", "Valor", "Unidade", "Situação", "Passos / fonte"];
    var N = COLS.length;
    larguras(ws, [30, 34, 14, 12, 13, 80]);
    titulo(ws, "Incêndio — " + txt(en.divisao || NAO_VERIF) + " " + txt(en.descricao || "") + " — IT 01, 16, 17 e 18 do CBMMG", N);
    var l = selo(ws, 2, N, r.fixture === true) + 1;
    var hdr = ws.getRow(l); COLS.forEach(function (t, i) { hdr.getCell(i + 1).value = t; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }]; l++;
    function linha(item, grandeza, valor, unidade, status, obs) {
      var rw = ws.getRow(l);
      rw.getCell(1).value = txt(item); rw.getCell(2).value = txt(grandeza);
      if (typeof valor === "string") { rw.getCell(3).value = txt(valor); rw.getCell(3).alignment = { horizontal: "right" }; } else numCel(rw, 3, valor);
      rw.getCell(4).value = txt(unidade || ""); rw.getCell(5).value = statusTxt(status);
      rw.getCell(6).value = (Array.isArray(obs) ? obs.map(txt).join(" | ") : txt(obs || "")); rw.getCell(6).alignment = { wrapText: true, vertical: "top" };
      corpoLinha(rw, status, N); l++;
    }
    var NOM = { extintores: "Extintores", hidrantes_mangotinhos: "Hidrantes e mangotinhos", chuveiros_automaticos: "Chuveiros automáticos" };
    Object.keys(NOM).forEach(function (k) {
      var m = obj(obj(en.medidas)[k]);
      linha("Enquadramento (IT 01" + (obj(en.tabela).tabela ? ", " + txt(en.tabela.tabela) : "") + ")", NOM[k], m.exigido === true ? "exigido" : (m.exigido === false ? "não exigido" : NAO_VERIF), "", m.exigido == null ? "pendente" : "ok", arr(m.passos).concat([fonteTxt(m.fonte)]));
    });
    linha("Hidrantes", "sistema / tipo", txt(hd.sistema || NAO_VERIF) + (hd.tipo != null ? " (tipo " + txt(hd.tipo) + ")" : ""), "", hd.exigido === false ? "ok" : (arr(hd.pontos).length ? "ok" : "pendente"), arr(hd.passosVazao));
    if (hd.exigido !== false) {
      linha("Hidrantes", "vazão mínima por saída", hd.vazaoMin_lpm, "L/min", fin(hd.vazaoMin_lpm) ? "ok" : "pendente", "");
      linha("Hidrantes", "alcance da mangueira", hd.alcance_m, "m", fin(hd.alcance_m) ? "ok" : "pendente", "");
      linha("Hidrantes", "pontos no projeto", arr(hd.pontos).length, "un", arr(hd.pontos).length ? "ok" : "pendente", arr(hd.pontos).map(function (p) { return txt(p.id) + " (" + txt(p.origem) + ")"; }));
      objs(hd.cobertura).forEach(function (cb) { linha("Cobertura — " + txt(cb.pavimento), "área descoberta", cb.area_descoberta_m2, "m²", cb.status, ""); });
      var cl = obj(hd.calculo);
      if (hd.calculo) {
        linha("Dois jatos mais desfavoráveis", "hidrante A / B", txt(cl.A) + " / " + txt(cl.B), "", "ok", arr(cl.passos));
        linha("Dois jatos mais desfavoráveis", "vazão A + B", fin(cl.QA) && fin(cl.QB) ? cl.QA + cl.QB : null, "L/min", "ok", "");
      }
      objs(hd.trechos).forEach(function (x) {
        linha("Trecho " + txt(x.id), "DN modelo → calculado", fin(x.dn) ? (fin(x.dnModelo) ? x.dnModelo + " → " : "") + x.dn : NAO_VERIF, "mm", x.status, arr(x.passos));
        linha("Trecho " + txt(x.id), "perda de carga (Hazen-Williams)", x.perda_m, "m", x.status, "J = " + (fin(x.J_m_m) ? x.J_m_m : NAO_VERIF) + " m/m; v = " + (fin(x.velocidade_ms) ? x.velocidade_ms : NAO_VERIF) + " m/s");
      });
      var bb = hd.bomba;
      if (bb) {
        linha("Bomba de incêndio", "vazão", bb.vazao_lpm, "L/min", "ok", "");
        linha("Bomba de incêndio", "AMT", bb.AMT_m, "m", "ok", arr(bb.passos));
        linha("Bomba de incêndio", "bomba do catálogo", txt(obj(bb.escolha).nome || NAO_VERIF), "", obj(bb.escolha).nome ? (bb.escolha.aConferir ? "pendente" : "ok") : "pendente", bb.escolha && bb.escolha.aConferir ? "a conferir com o fabricante" : "");
      }
    }
    linha("Reserva técnica de incêndio", "hidrantes", rv.hidrantes_m3, "m³", rv.status || "pendente", arr(rv.passos));
    linha("Reserva técnica de incêndio", "chuveiros", rv.chuveiros_m3, "m³", rv.status || "pendente", "");
    linha("Reserva técnica de incêndio", "total (somada à reservação)", rv.total_L, "L", rv.status || "pendente", "");
    if (ex.exigido !== false) {
      linha("Extintores", "risco / classes", txt(ex.risco || NAO_VERIF) + " / " + arr(ex.classes).map(txt).join(","), "", ex.risco ? "ok" : "pendente", "");
      objs(ex.porPavimento).forEach(function (x) { linha("Extintores — " + txt(x.pavimento), "total (mínimo " + (fin(x.minimo) ? x.minimo : NAO_VERIF) + ")", x.total, "un", x.status, ""); });
    }
    if (ch.exigido === true) {
      var dmc = obj(ch.demanda);
      linha("Chuveiros (NBR 10897:2020)", "classe de risco", txt(ch.risco || NAO_VERIF), "", ch.risco ? "ok" : "pendente", "sem classe informada o cálculo sugere pela Tabela A.1 e o RT confirma");
      linha("Chuveiros (NBR 10897:2020)", "densidade de projeto", ch.densidade, "mm/min", fin(ch.densidade) ? "ok" : "pendente", "Figura 42 — lido em gráfico, ±0,1 L/min/m² (lado seguro: maior densidade lida)");
      linha("Chuveiros (NBR 10897:2020)", "área de operação", ch.areaOperacao_m2, "m²", fin(ch.areaOperacao_m2) ? "ok" : "pendente", "ajustes de 8.5.5");
      linha("Chuveiros (NBR 10897:2020)", "chuveiros na área", ch.nChuveirosArea, "un", fin(ch.nChuveirosArea) ? "ok" : "pendente", "por ramal: " + (fin(ch.porRamal) ? ch.porRamal : NAO_VERIF));
      linha("Chuveiros (NBR 10897:2020)", "fator K", ch.k, "", fin(ch.k) ? "ok" : "pendente", "vazão mínima " + (fin(ch.vazaoMinChuveiro_lpm) ? Math.round(ch.vazaoMinChuveiro_lpm * 10) / 10 + " L/min" : NAO_VERIF));   // hid:ok arredondamento a 1 casa
      linha("Chuveiros (NBR 10897:2020)", "cálculo hidráulico (9.4)", ch.hidraulico ? "calculado" : "não verificado: falta a rede", "", ch.hidraulico ? "ok" : "pendente", "");
      linha("Chuveiros (NBR 10897:2020)", "reserva dos chuveiros", rv.chuveiros_m3, "m³", fin(rv.chuveiros_m3) ? "ok" : "pendente", arr(dmc.passos));
    }
    linha("Chuveiros automáticos", "exigência", ch.exigido === true ? "exigido" : (ch.exigido === false ? "não exigido" : NAO_VERIF), "", ch.exigido === true ? (ch.status || "pendente") : (ch.exigido === false ? "ok" : "pendente"), ch.exigido === true && ch.status !== "ok" ? "não verificado: faltam ramais e risco do dimensionamento" : "");
    arr(inc.pendencias).forEach(function (p) { linha("Pendência", "não verificado: falta " + txt(p.chave), NAO_VERIF, "", "pendente", txt(p.motivo)); });
    return ws;
  }

  /* ================================================================ TRATAMENTO e INDUSTRIAL (integração) */
  /* aba de linhas "item / grandeza / valor / unidade / situação / passos e fonte" — a mesma forma da aba de incêndio */
  function abaLinhas(wb, nome, tituloTxt, r, ctx) {
    var ws = wb.addWorksheet(nome), COLS = ["Item", "Grandeza", "Valor", "Unidade", "Situação", "Passos / fonte"], N = COLS.length, l;
    larguras(ws, [30, 34, 16, 12, 13, 80]);
    titulo(ws, tituloTxt, N);
    l = selo(ws, 2, N, r.fixture === true) + 1;
    var hdr = ws.getRow(l); COLS.forEach(function (tt, i) { hdr.getCell(i + 1).value = tt; }); cab(hdr); ws.views = [{ state: "frozen", xSplit: 1, ySplit: l }]; l++;
    return {
      ws: ws,
      linha: function (item, grandeza, valor, unidade, status, obs) {
        var rw = ws.getRow(l);
        rw.getCell(1).value = txt(item); rw.getCell(2).value = txt(grandeza);
        if (typeof valor === "string") { rw.getCell(3).value = txt(valor); rw.getCell(3).alignment = { horizontal: "right" }; } else numCel(rw, 3, valor);
        rw.getCell(4).value = txt(unidade || ""); rw.getCell(5).value = statusTxt(status);
        rw.getCell(6).value = (Array.isArray(obs) ? obs.map(txt).join(" | ") : txt(obs || "")); rw.getCell(6).alignment = { wrapText: true, vertical: "top" };
        corpoLinha(rw, status, N); l++;
      }
    };
  }
  function abaTR(wb, r, op, ctx) {
    var tr = obj(obj(r.sistemas).tratamento), A = abaLinhas(wb, "Tratamento", "Tratamento — " + (tr.sistema === "ete" ? "ETE" : (tr.sistema === "eta" ? "ETA" : "fossa + filtro + disposição")) + " — " + txt(tr.fonteAviso || ""), r, ctx);
    objs(tr.parametros).forEach(function (p) { A.linha("Parâmetro", p.nome, typeof p.valor === "number" ? p.valor : txt(p.valor), p.unidade, "ok", txt(p.edicao) + (p.fonte ? " — " + fonteTxt(p.fonte) : "")); });
    objs(tr.unidades).forEach(function (u) {
      var dm = u.dims || (u.id === "tanque" ? obj(obj(tr.tanque).geometria) : null), pr = obj(u.produto);
      A.linha("Unidade " + txt(u.id), "tipo / forma", txt(u.tipo) + " / " + txt(u.forma || "—"), "", u.status || (dm ? "ok" : "pendente"), pr.codigo ? "produto " + txt(pr.fabricante) + " " + txt(pr.codigo) : "");
      if (dm) {
        [["comprimento_m", "comprimento"], ["largura_m", "largura"], ["diametro_m", "diâmetro"], ["profundidade_m", "profundidade"], ["altura_m", "altura"], ["volume_m3", "volume"]].forEach(function (k) { if (fin(dm[k[0]])) A.linha("Unidade " + txt(u.id), k[1], dm[k[0]], k[0] === "volume_m3" ? "m³" : "m", u.status || "ok", ""); });
      } else A.linha("Unidade " + txt(u.id), "dimensões", NAO_VERIF, "", "pendente", "sem dimensões calculadas");
    });
    objs(tr.afastamentos).forEach(function (a) { A.linha("Afastamento — " + txt(a.unidade), txt(a.alvos), a.distancia_m, "m", a.status || "pendente", txt(a.edicao)); });
    objs(tr.premissas).forEach(function (p) { A.linha("Premissa", p.item, txt(p.valor), "", "ok", p.origem === "criterio_projetista" ? "critério do projetista (não normativo)" : txt(p.origem)); });
    objs(tr.pendencias).forEach(function (p) { A.linha("Pendência", "não verificado: falta " + txt(p.chave), NAO_VERIF, "", "pendente", txt(p.motivo)); });
    return A.ws;
  }
  function abaIND(wb, r, op, ctx) {
    var ind = obj(obj(r.sistemas).industrial), fl = obj(ind.fluido), A = abaLinhas(wb, "Industrial", "Fluido industrial — " + txt(fl.tipo || NAO_VERIF) + " — " + txt(ind.servico || ""), r, ctx);
    A.linha("Fluido", "pressão absoluta na origem", fl.pressaoAbs_kPa, "kPa", fin(fl.pressaoAbs_kPa) ? "ok" : "pendente", arr(fl.passos));
    A.linha("Fluido", "massa específica", fl.rho, "kg/m³", fin(fl.rho) ? "ok" : "pendente", "");
    objs(ind.trechos).forEach(function (x) {
      A.linha("Trecho " + txt(x.id), "DN modelo → calculado (série " + txt(x.serie || "—") + ")", fin(Number(x.dn)) ? txt(x.dnModelo) + " → " + txt(x.dn) : NAO_VERIF, "mm", x.status, arr(x.passos));
      A.linha("Trecho " + txt(x.id), "velocidade", x.velocidade_ms, "m/s", x.status, "Re = " + (fin(x.Re) ? Math.round(x.Re) : NAO_VERIF));
      A.linha("Trecho " + txt(x.id), "perda de carga", x.perda_kPa, "kPa", x.status, "P jusante = " + (fin(x.pressaoJusante_kPa) ? Math.round(x.pressaoJusante_kPa * 10) / 10 : NAO_VERIF) + " kPa");   // hid:ok arredondamento a 1 casa
      A.linha("Trecho " + txt(x.id), "classe de pressão", obj(x.classe).ok === true ? "atende" : (obj(x.classe).ok === false ? "NÃO ATENDE" : NAO_VERIF), "", obj(x.classe).ok === true ? "ok" : (obj(x.classe).ok === false ? "reprovado" : "pendente"), arr(obj(x.classe).passos));
    });
    objs(ind.consumidores).forEach(function (k) { A.linha("Consumidor " + txt(k.id), "pressão no consumidor", k.pressao_kPa, "kPa", fin(k.pressao_kPa) ? "ok" : "pendente", arr(k.passos)); });
    objs(ind.golpe).forEach(function (g) { A.linha("Golpe — " + txt(g.consumidor), "sobrepressão", g.sobrepressao_kPa, "kPa", g.status, arr(g.passos)); });
    objs(ind.dilatacao).forEach(function (x) { A.linha("Dilatação — " + txt(x.trecho), "ΔL / perna da lira", fin(x.dL_mm) ? x.dL_mm + " mm / " + (x.lira ? x.lira.perna_m + " m" : "sem lira") : NAO_VERIF, "", x.status, arr(x.passos)); });
    if (ind.arComprimido) A.linha("Ar comprimido", "reservatório mínimo", obj(ind.arComprimido.reservatorio).volume_L, "L", fin(obj(ind.arComprimido.reservatorio).volume_L) ? "ok" : "pendente", arr(obj(ind.arComprimido.reservatorio).passos));
    arr(ind.pendencias).forEach(function (p) { A.linha("Pendência", "não verificado: falta " + txt(p.chave), NAO_VERIF, "", "pendente", txt(p.motivo)); });
    return A.ws;
  }

  /* ================================================================ GERAR */
  function gerar(resultado, quantitativo, opcoes) {
    opcoes = opcoes || {};
    if (!resultado || typeof resultado !== "object" || !resultado.sistemas) return { ok: false, motivo: "Sem resultado de cálculo para gerar as planilhas.", workbook: null, abas: [], avisos: [], formulas: 0 };
    var ExcelJS = opcoes.ExcelJS || dep("ExcelJS");
    if (!ExcelJS) return { ok: false, motivo: "Biblioteca ExcelJS indisponível (js/vendor/exceljs.min.js).", workbook: null, abas: [], avisos: [], formulas: 0 };
    var wb = new ExcelJS.Workbook(), ctx = { formulas: 0 }, avisos = [];
    wb.creator = "OrçaPRO — HidPlanilhas"; wb.created = new Date();
    abaResumo(wb, resultado, quantitativo, opcoes, ctx);
    abaAF(wb, resultado, opcoes, ctx);
    abaES(wb, resultado, opcoes, ctx);
    abaRecalque(wb, resultado, opcoes, ctx);
    abaPressao(wb, resultado, ctx);   /* PRESSURIZAÇÃO (js/hidpressao.js): só quando o resultado traz o caso */
    /* fase 2: as abas só existem quando o resultado traz o sistema (projeto só de AF/ES fica como antes) */
    if (obj(resultado.sistemas).agua_quente) abaAQ(wb, resultado, opcoes, ctx);
    if (obj(resultado.sistemas).pluvial) abaAP(wb, resultado, opcoes, ctx);
    if (obj(resultado.sistemas).tratamento) abaTR(wb, resultado, opcoes, ctx);
    if (obj(resultado.sistemas).industrial) abaIND(wb, resultado, opcoes, ctx);
    if (obj(resultado.sistemas).incendio) abaINC(wb, resultado, opcoes, ctx);   /* F3: a aba só existe quando o resultado traz o incêndio */
    abaQuantitativo(wb, resultado, quantitativo, opcoes, ctx);
    if (quantitativo && typeof quantitativo === "object") abaListaMaterial(wb, resultado, quantitativo, opcoes, ctx);
    abaPendencias(wb, resultado, quantitativo, opcoes, ctx);
    if (resultado.fixture === true) avisos.push("TABELAS DE TESTE — NÃO É NORMA: planilhas geradas com resultado de fixture.");
    if (ctx.semQto) avisos.push("Quantitativo não informado.");
    if (ctx.qtoSemCodigo) avisos.push(ctx.qtoSemCodigo + " linha(s) do quantitativo sem código SINAPI.");
    return { ok: true, workbook: wb, abas: wb.worksheets.map(function (w) { return w.name; }), avisos: avisos, formulas: ctx.formulas, detalhes: ctx };
  }
  function escrever(resultado, quantitativo, opcoes) {
    var g = gerar(resultado, quantitativo, opcoes);
    if (!g.ok) return Promise.reject(new Error(g.motivo));
    return g.workbook.xlsx.writeBuffer();
  }

  /* hid:fisica-fim */

  var HidPlanilhas = { gerar: gerar, escrever: escrever, coeficienteC: coeficienteC, _linhasQto: linhasQto };
  global.HidPlanilhas = HidPlanilhas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPlanilhas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

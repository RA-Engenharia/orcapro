/* =====================================================================
 * eleplanilhas.js — PLANILHAS .xlsx DA INSTALAÇÃO ELÉTRICA (Elétrica v2, lote L5, 06/11/2026) — motor PURO, ES5, sem DOM.
 * Planilha é sempre .xlsx formatado, nunca CSV. Molde: js/hidplanilhas.js (cabeçalho com a marca, larguras, fórmulas visíveis).
 *
 *   ElePlanilhas.gerar(analise, opcoes) → { ok, workbook, abas: [nome], avisos, formulas, materiais[], pendencias[] }
 *   ElePlanilhas.escrever(analise, opcoes) → Promise<Buffer>   (workbook.xlsx.writeBuffer)
 *   ElePlanilhas.materiais(analise, opcoes) → [{ item, unidade, quantidade, codigo, situacao: "ok"|"provisório"|"pendente", origem, fontePreco, observacao, motivo }]
 *
 *     analise = EleCircuitos.analisar(...) (o MESMO cálculo do memorial e das pranchas — a planilha LÊ, não recalcula norma)
 *     opcoes  = { ExcelJS, obra, local, empresa, responsavel, registro, revisao, numero, data,
 *                 estado + avaliarFam (para EleCircuitos.servicosOrc e BimInst.qto), servicos, qto (já calculados), preco(codigo) → { valor, fonte } }
 *
 * ABAS: Quadro de cargas · Circuitos (dimensionamento) · Demanda · Eletrodutos e fiação · Lista de materiais · Pendências.
 * FÓRMULAS VISÍVEIS: IB = P/V, Iz corrigida = Iz × FCT × FCA, queda de tensão, demanda = soma × fator ÷ divisor, totais por SUM/SUMIFS.
 *   Toda fórmula só entra se o valor dela BATE com o do motor (a planilha nunca contradiz o memorial); não bate → fica o valor do motor.
 * ⚠ NUNCA INVENTA CÓDIGO SINAPI: item sem composição sai "pendente"; composição de maior preço da família sai "provisório — cotar".
 * ⚠ NENHUM VALOR DE NORMA AQUI: tabelas e fatores vêm de js/eletabelas.js; a ressalva da NBR 5410 sai no cabeçalho de toda aba.
 * Teste: node tools/test-ele-planilhas.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function EC() { return dep("EleCircuitos", "./elecircuitos.js"); }
  function EM() { return dep("EleMemorial", "./elememorial.js"); }
  function xl() {
    if (global.ExcelJS) return global.ExcelJS;
    if (typeof require === "function") {
      try { return require("exceljs"); } catch (e) {}
      try { return require("C:/Users/USER/RA-Gestao-Obras/node_modules/exceljs"); } catch (e2) {}
    }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { var s = v == null ? "" : String(v); return /\b(undefined|NaN|null|Infinity)\b/.test(s) ? s.replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]") : s; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function sec(S) { return fin(S) ? S : "-"; }
  function letra(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------- estilo (apresentação: nenhum valor de norma) */
  var NUM = "#,##0.00", NUM3 = "#,##0.000", INT = "#,##0";
  var navy = "FF0F2740", branco = "FFFFFFFF", cinza = "FFEFF3F8", areia = "FFA89868", vermelhoBg = "FFFBEFED", alertaBg = "FFFBF6EA", vermelho = "FFA3352B", amareloBg = "FFFFF7CC";
  function thin() { var s = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: s, left: s, bottom: s, right: s }; }
  function preenche(c, argb) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; }
  function cab(row) {
    row.eachCell(function (c) {
      c.font = { bold: true, color: { argb: branco }, size: 10 }; preenche(c, navy);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = thin();
    });
    row.height = 34;
  }
  function larguras(ws, ls) { ls.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }
  /* cabeçalho de toda aba: a marca, a obra, o documento e a ressalva da NBR 5410 → devolve a próxima linha livre */
  function cabecalho(ws, titulo, ate, opc) {
    var T = TB();
    ws.mergeCells(1, 1, 1, ate); var c1 = ws.getCell(1, 1); c1.value = "RA ENGENHARIA — " + titulo; c1.font = { bold: true, size: 14, color: { argb: branco } }; preenche(c1, navy); c1.alignment = { vertical: "middle" }; ws.getRow(1).height = 26;
    ws.mergeCells(2, 1, 2, ate); var c2 = ws.getCell(2, 1);
    c2.value = txt([opc.obra || "[OBRA]", (opc.numero || "[Nº DO DOCUMENTO]") + " " + (opc.revisao || "R00"), opc.data || "", opc.responsavel ? "RT: " + opc.responsavel + (opc.registro ? " — " + opc.registro : "") : "RT: [RESPONSÁVEL TÉCNICO]"].filter(Boolean).join(" · "));
    c2.font = { bold: true, color: { argb: navy } }; preenche(c2, cinza);
    ws.mergeCells(3, 1, 3, ate); var c3 = ws.getCell(3, 1); c3.value = txt(T.NORMA.ressalva); c3.font = { italic: true, size: 9, color: { argb: "FF64748B" } }; c3.alignment = { wrapText: true, vertical: "top" }; ws.getRow(3).height = 40;
    return 5;
  }
  function corpo(row, n, fundo) { for (var i = 1; i <= n; i++) { var c = row.getCell(i); c.border = thin(); if (fundo) preenche(c, fundo); } }
  function titSub(ws, linha, ate, texto) { ws.mergeCells(linha, 1, linha, ate); var c = ws.getCell(linha, 1); c.value = texto; c.font = { bold: true, size: 11, color: { argb: navy } }; ws.getRow(linha).height = 20; }
  /* escreve uma fórmula com o valor do motor em cache, só se o valor da fórmula BATE (tolerância absoluta tol) */
  function formula(ctx, row, col, f, result, fmt) {
    var c = row.getCell(col);
    if (typeof result === "string") { c.value = { formula: f, result: result }; ctx.formulas++; return c; }
    if (fin(result)) { c.value = { formula: f, result: result }; c.numFmt = fmt || NUM; c.alignment = { horizontal: "right" }; ctx.formulas++; return c; }
    c.value = "não verificado"; c.font = { italic: true, color: { argb: "FF6B5D45" } }; return c;
  }
  function valor(row, col, v, fmt) {
    var c = row.getCell(col);
    if (fin(v)) { c.value = v; c.numFmt = fmt || NUM; c.alignment = { horizontal: "right" }; }
    else { c.value = typeof v === "string" ? txt(v) : "-"; }
    return c;
  }

  /* ------------------------------------------------------------------ LISTA DE MATERIAIS */
  function situ(l) { return l.codigo && !l.provisorio && !/provis[óo]rio/i.test(txt(l.observacao)) ? "ok" : (l.codigo ? "provisório" : "pendente"); }
  function materiais(A, opc) {
    opc = opc || {}; var out = [], T = TB(), ECm = EC();
    var fontePrecoBase = T ? T.FONTES.SINAPI : "SINAPI";
    function add(item, un, q, cod, sit, origem, obs, motivo) {
      var pr = typeof opc.preco === "function" && cod ? opc.preco(cod) : null;
      out.push({ item: txt(item), unidade: un, quantidade: fin(q) ? Math.round(q * 10000) / 10000 : 0, codigo: cod || "", situacao: sit, origem: origem,
        preco: pr && fin(pr.valor) ? pr.valor : null, fontePreco: pr && pr.fonte ? txt(pr.fonte) : (cod ? fontePrecoBase + " — composição " + cod + " (preço no Orçamento do modelo)" : "sem composição: sem preço"), observacao: txt(obs || ""), motivo: txt(motivo || "") });
    }
    /* 1) o que o projeto de circuitos orça: cabo por seção, disjuntores, DR, DPS, eletroduto do alimentador */
    var serv = opc.servicos;
    if (!serv && opc.estado && ECm && ECm.servicosOrc) { try { serv = ECm.servicosOrc(opc.estado, opc.avaliarFam, { criterios: opc.criterios }); } catch (e) { serv = null; } }
    var temServ = !!(serv && serv.length);
    if (temServ) serv.forEach(function (l) { add(l.rotulo, l.unidade === "un" ? "un" : l.unidade, l.quantidade, l.codigo, situ(l), "projeto de circuitos (EleCircuitos.servicosOrc)", l.observacao, l.motivo); });
    else if (A && A.ok && ECm && T) {
      /* sem o modelo: o mesmo cabo, disjuntor, DR e DPS pelos códigos de js/eletabelas.js (nunca inventa: sem código → pendente) */
      var porS = {}; ECm.cabos(A).forEach(function (c) { porS[c.secao] = (porS[c.secao] || 0) + c.metros; });
      Object.keys(porS).sort(function (a, b) { return a - b; }).forEach(function (S) { var cod = T.SINAPI.cabo[S] || T.CABO_MAIOR[S] || ""; add("Cabo de cobre flexível " + String(S).replace(".", ",") + " mm²", "m", porS[S], cod, cod ? (T.SINAPI.cabo[S] ? "ok" : "provisório") : "pendente", "projeto de circuitos (resumo do cálculo)", "", cod ? "" : "cabo sem composição SINAPI"); });
      var pd = {}; A.circuitos.forEach(function (c) { var k = c.polos + "|" + c.dim.In; pd[k] = (pd[k] || 0) + 1; });
      if (A.geral.In) { var kg = A.geral.polos + "|" + A.geral.In; pd[kg] = (pd[kg] || 0) + 1; }
      Object.keys(pd).forEach(function (k) { var p = +k.split("|")[0], In = +k.split("|")[1], dc = T.disjuntorCodigo(p, In); add("Disjuntor " + p + "P " + In + " A", "un", pd[k], dc ? dc.codigo : "", dc ? (dc.provisorio ? "provisório" : "ok") : "pendente", "projeto de circuitos (resumo do cálculo)", dc && dc.provisorio ? dc.motivo : "", dc ? "" : "disjuntor sem composição SINAPI"); });
      var pr = {}; A.drs.forEach(function (g) { var k = g.polos + "|" + g.In; pr[k] = (pr[k] || 0) + 1; });
      Object.keys(pr).forEach(function (k) { var p = +k.split("|")[0], In = +k.split("|")[1], cod = (T.SINAPI.dr[p] || {})[In] || ""; add("Dispositivo DR " + p + "P " + In + " A, 30 mA", "un", pr[k], cod, cod ? "ok" : "pendente", "projeto de circuitos (resumo do cálculo)", "", cod ? "" : "DR sem composição SINAPI nesta corrente"); });
      if (A.dps && A.dps.exigido) add("DPS classe II 20 kA 175 V", "un", A.dps.quantidade, T.SINAPI.dps, "ok", "projeto de circuitos (resumo do cálculo)", "", "");
    }
    /* 2) o que o modelo 3D orça (BimInst.qto): eletrodutos, caixas e dispositivos — incluindo o quadro */
    var qto = opc.qto;
    if (!qto && opc.estado) { var BI = dep("BimInst", "./biminst.js"); if (BI && BI.qto) { try { qto = BI.qto(opc.estado, opc.avaliarFam); } catch (e3) { qto = null; } } }
    function linhaQto(g, un) {
      var s = g.sinapi || {}, cod = s.codigo || "", sit = cod && s.status === "ok" ? "ok" : "pendente";
      add(s.rotulo || g.rotulo || g.nome || g.peca, un, g.quantidade != null ? g.quantidade : g.n, cod, sit, "modelo 3D (BimInst.qto)", g.mercado ? "referência de mercado disponível" : "", cod ? "" : (s.motivo || s.descricao || "sem composição SINAPI"));
    }
    var temQuadroQto = false;
    if (qto) {
      arr(qto.tubos).filter(function (g) { return g.sistema === "eletrica"; }).forEach(function (g) { linhaQto(g, "m"); });
      arr(qto.pecas).filter(function (g) { return g.sistema === "eletrica"; }).forEach(function (g) { linhaQto(g, "un"); });
      arr(qto.dispositivos).forEach(function (g) { if (g.peca === "quadro") temQuadroQto = true; linhaQto(g, "un"); });
      if (!qto.caboDoProjeto) arr(qto.cabos).forEach(function (g) { linhaQto(g, "m"); });
    }
    if (!temQuadroQto && A && A.ok && A.quadroModelo) add("Quadro de distribuição " + (A.quadroModelo.material === "pvc" ? "PVC" : "aço") + " de " + A.quadroModelo.instalacao + ", " + A.quadroModelo.espacos + " espaços", "un", 1, A.quadroModelo.codigo, "ok", "projeto de circuitos (quadro escolhido)", "o modelo 3D não trouxe o quadro: entra pelo projeto", "");
    if (!qto) add("Eletrodutos, caixas, tomadas, interruptores e luminárias", "vb", 0, "", "pendente", "modelo 3D (BimInst.qto)", "", "quantitativo do modelo não informado: gere com o editor 3D aberto");
    return out;
  }

  /* ------------------------------------------------------------------ ABAS */
  function abaCargas(wb, A, opc, ctx) {
    var ws = wb.addWorksheet("Quadro de cargas"), N = 17, T = TB();
    larguras(ws, [7, 38, 11, 8, 9, 8, 13, 10, 12, 12, 12, 11, 7, 11, 11, 10, 14]);
    var l = cabecalho(ws, "Quadro de cargas", N, opc);
    var h = ws.getRow(l++);
    ["Circ.", "Descrição", "Tipo", "Pontos", "Tensão (V)", "Fases", "Potência (VA)", "IB (A)", "Fase A (VA)", "Fase B (VA)", "Fase C (VA)", "Disjuntor (A)", "Polos", "DR 30 mA", "Seção (mm²)", "PE (mm²)", "Situação"].forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    var p0 = l;
    A.circuitos.forEach(function (c) {
      var d = c.dim, row = ws.getRow(l), pontos = c.pontos.filter(function (id) { return A.existe[id] && A.existe[id].kind !== "interruptor"; }).length;
      row.getCell(1).value = c.id; row.getCell(2).value = txt(c.nome); row.getCell(3).value = c.tipo === "luz" ? "Iluminação" : (c.tipo === "tug" ? "Tomadas (TUG)" : "Uso específico (TUE)");
      valor(row, 4, pontos, INT); valor(row, 5, d.V, INT); row.getCell(6).value = c.fases || "?";
      valor(row, 7, d.va, NUM);
      if (Math.abs(d.va / d.V - d.ib) < 0.006) formula(ctx, row, 8, "G" + l + "/E" + l, d.va / d.V, NUM); else valor(row, 8, d.ib, NUM);
      var fs = (c.fases || "").split(""), cols = { A: 9, B: 10, C: 11 };
      ["A", "B", "C"].forEach(function (f) {
        var i = fs.indexOf(f), cc = row.getCell(cols[f]);
        if (i < 0) { cc.value = 0; cc.numFmt = NUM; return; }
        if (fs.length === 1) formula(ctx, row, cols[f], "G" + l, d.va, NUM); else formula(ctx, row, cols[f], "G" + l + "/" + fs.length, d.va / fs.length, NUM);
      });
      valor(row, 12, d.In, INT); valor(row, 13, c.polos, INT); row.getCell(14).value = c.drId || "-"; valor(row, 15, d.secao, "0.0"); valor(row, 16, d.pe, "0.0"); row.getCell(17).value = d.ok ? "atende" : "NÃO ATENDE";
      corpo(row, N, d.ok ? null : vermelhoBg); l++;
    });
    var p1 = l - 1, tr = ws.getRow(l++);
    tr.getCell(2).value = "TOTAL"; tr.font = { bold: true };
    var soma = { 4: 0, 7: 0, 9: 0, 10: 0, 11: 0 };
    A.circuitos.forEach(function (c) { var fs = (c.fases || "").split(""); soma[7] += c.dim.va; soma[4] += c.pontos.filter(function (id) { return A.existe[id] && A.existe[id].kind !== "interruptor"; }).length; fs.forEach(function (f) { soma[{ A: 9, B: 10, C: 11 }[f]] += c.dim.va / fs.length; }); });
    [4, 7, 9, 10, 11].forEach(function (col) { var L = letra(col); formula(ctx, tr, col, "SUM(" + L + p0 + ":" + L + p1 + ")", soma[col], col === 4 ? INT : NUM); });
    corpo(tr, N, cinza); ctx.cargas = { primeira: p0, ultima: p1, total: l - 1 };
    l++;
    titSub(ws, l++, N, "Resumo do quadro");
    var dm = A.demanda;
    [["Carga instalada (kW)", dm.cargaInstalada_kW, NUM], ["Demanda provável (kVA) — CEMIG ND-5.1", dm.demanda_kVA, NUM], ["Tipo de fornecimento / faixa", (dm.tipo || "?") + (dm.entrada ? " / " + dm.entrada.faixa : ""), null],
      ["Disjuntor geral (A) / polos", A.geral.In ? A.geral.In + " A / " + A.geral.polos + "P" : "não verificado", null], ["Alimentador (mm²) / comprimento (m)", A.alimentador.secao ? A.alimentador.secao + " mm² + PE " + A.alimentador.pe + " mm² / " + A.alimentador.comprimento + " m" + (A.alimentador.provisorio ? " (PROVISÓRIO)" : "") : "não verificado", null],
      ["DR (30 mA)", A.drs.map(function (g) { return g.id + " " + g.In + " A (" + g.circuitos.join("+") + ")"; }).join("; "), null], ["DPS", A.dps.exigido ? A.dps.quantidade + " × classe " + A.dps.classe + " " + A.dps.in_kA + " kA " + A.dps.uc_V + " V" : "não adotado", null],
      ["Quadro", A.quadroModelo ? A.quadroModelo.espacos + " espaços (" + A.modulos + " módulos com reserva de " + A.reserva + ")" : "não verificado", null]].forEach(function (r) {
      var row = ws.getRow(l++); row.getCell(1).value = r[0]; ws.mergeCells(row.number, 1, row.number, 3); row.getCell(1).font = { bold: true };
      var c = row.getCell(4); ws.mergeCells(row.number, 4, row.number, 9); if (r[2]) { c.value = r[1]; c.numFmt = r[2]; c.alignment = { horizontal: "left" }; } else c.value = txt(r[1]);
      for (var i = 1; i <= 9; i++) row.getCell(i).border = thin();
    });
    ws.views = [{ state: "frozen", ySplit: p0 - 1 }]; void T;
    return ws;
  }
  function abaCircuitos(wb, A, opc, ctx) {
    var ws = wb.addWorksheet("Circuitos"), T = TB(), M = EM(), N = 23;
    larguras(ws, [7, 34, 9, 9, 18, 11, 9, 7, 10, 7, 11, 10, 10, 11, 8, 10, 12, 9, 7, 11, 10, 14, 14]);
    var l = cabecalho(ws, "Dimensionamento dos circuitos (NBR 5410:2004, cópia não licenciada)", N, opc);
    var cols = ["Circ.", "Descrição", "Tensão (V)", "IB (A)", "Método (Tab. 33)", "R70 (Ω/km)", "L (m)", "FCT", "Circ. no eletroduto", "FCA", "S capacidade (mm²)", "S mínima (mm²)", "S queda (mm²)", "S adotada (mm²)", "PE (mm²)", "Iz tabela (A)", "Iz corrigida (A)", "In (A)", "Polos", "Queda (%)", "Limite (%)", "IB ≤ In ≤ Iz", "Situação"];
    var h = ws.getRow(l++); cols.forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    var lim = [];
    A.circuitos.forEach(function (c) {
      var d = c.dim, row = ws.getRow(l), L = fin(c.Lmax) ? c.Lmax : d.L, ibx = d.va / d.V, r70 = T.r70(d.secao), cap = M.secaoCapacidade(d.metodo.ref, d.In, d.ft, d.fa), qS = M.secaoQueda(L, ibx, d.V, d.limiteQueda);
      row.getCell(1).value = c.id; row.getCell(2).value = txt(c.nome); valor(row, 3, d.V, INT);
      if (Math.abs(ibx - d.ib) < 0.006) formula(ctx, row, 4, "'Quadro de cargas'!G" + (ctx.cargas.primeira + lim.length) + "/C" + l, ibx, NUM); else valor(row, 4, d.ib, NUM);
      row.getCell(5).value = d.metodo.ref + " (nº " + d.metodo.metodo + ", " + d.metodo.apl + ")";
      valor(row, 6, r70, NUM3); valor(row, 7, L, NUM); valor(row, 8, d.ft, NUM); valor(row, 9, d.nAgrup, INT); valor(row, 10, d.fa, NUM);
      valor(row, 11, sec(cap), "0.0"); valor(row, 12, d.secMin, "0.0"); valor(row, 13, sec(qS), "0.0"); valor(row, 14, d.secao, "0.0"); valor(row, 15, d.pe, "0.0"); valor(row, 16, d.iz, NUM);
      var izc = fin(d.iz) ? d.iz * d.ft * d.fa : null;
      if (izc != null && fin(d.izc) && Math.abs(izc - d.izc) < 0.06) formula(ctx, row, 17, "P" + l + "*H" + l + "*J" + l, izc, NUM); else valor(row, 17, d.izc, NUM);
      valor(row, 18, d.In, INT); valor(row, 19, c.polos, INT);
      var q = M.quedaTerminal(d.secao, L, ibx, d.V);
      if (q != null && fin(d.dv) && Math.abs(q - d.dv) < 0.006) formula(ctx, row, 20, "200*F" + l + "/1000*G" + l + "*D" + l + "/C" + l, q, NUM); else valor(row, 20, d.dv, NUM);
      valor(row, 21, d.limiteQueda, NUM);
      var ok = ibx <= d.In + 1e-9 && izc != null && d.In <= izc + 1e-9;
      formula(ctx, row, 22, 'IF(AND(D' + l + '<=R' + l + ',R' + l + '<=Q' + l + '),"atende","NÃO ATENDE")', ok ? "atende" : "NÃO ATENDE");
      row.getCell(23).value = d.ok ? "atende" : "NÃO ATENDE" + (d.estimado ? " (comprimento estimado)" : "");
      if (d.estimado && d.ok) row.getCell(23).value = "atende (comprimento ESTIMADO)";
      corpo(row, N, d.ok ? (d.estimado ? alertaBg : null) : vermelhoBg); lim.push(c.id); l++;
    });
    l++;
    ws.mergeCells(l, 1, l, N);
    var nota = ws.getCell(l, 1);
    nota.value = "Fórmulas: IB = P/V · Iz corrigida = Iz(" + T.T36.item + ") × FCT (" + T.T40.item + ") × FCA (" + T.T42.item + ") · queda % = 200 × R70 × L × IB / V (" + T.QUEDA.item + "). Seção adotada = maior entre capacidade, mínima (" + T.T47.item + ") e queda; PE pela " + T.T58.item + "; coordenação " + T.COORD.item + ". " + T.COORD.i2.fonte + ".";
    nota.font = { italic: true, size: 9, color: { argb: "FF64748B" } }; nota.alignment = { wrapText: true, vertical: "top" }; ws.getRow(l).height = 44;
    l += 2;
    titSub(ws, l++, N, "Alimentador e disjuntor geral");
    var al = A.alimentador, g = A.geral;
    [["Corrente de demanda da fase mais carregada (A)", g.ib, NUM], ["Disjuntor geral (A)", g.In, INT], ["Polos", g.polos, INT], ["Seção do alimentador (mm²)", al.secao, "0.0"], ["PE do alimentador (mm²)", al.pe, "0.0"], ["Comprimento (m)" + (al.provisorio ? " — PROVISÓRIO (critério RA)" : ""), al.comprimento, NUM], ["Queda de tensão no alimentador (%)", al.dv, NUM]].forEach(function (r) {
      var row = ws.getRow(l++); row.getCell(1).value = r[0]; ws.mergeCells(row.number, 1, row.number, 5); row.getCell(1).font = { bold: true }; valor(row, 6, r[1], r[2]); for (var i = 1; i <= 6; i++) row.getCell(i).border = thin();
    });
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];
    return ws;
  }
  function abaDemanda(wb, A, opc, ctx) {
    var ws = wb.addWorksheet("Demanda"), T = TB(), M = EM(), N = 8, C = A.criterios, c = M.contaDemanda(A), fp = C.fpNaoAquecimento.valor;
    larguras(ws, [8, 44, 14, 16, 12, 12, 16, 40]);
    var l = cabecalho(ws, "Demanda provável — CEMIG ND-5.1 " + T.CEMIG.demanda.item, N, opc);
    var h = ws.getRow(l++); ["Termo", "Grupo", "Aparelhos / pontos", "Potência somada", "Divisor", "Fator", "Demanda (kVA)", "Fonte do fator"].forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    var p0 = l, dm = A.demanda, gdesc = { b1: "chuveiros, torneiras e cafeteiras", b3: "fornos, fogões e grill", b4: "lavar/secar roupa, lava-louças e ferro", b5: "demais aparelhos", c: "condicionadores de ar", d: "motores" };
    var fonteFator = { a: T.CEMIG.tabela10.item, b1: T.CEMIG.tabela13.item, b3: T.CEMIG.tabela12.item, b4: T.CEMIG.tabela13.item, b5: T.CEMIG.tabela13.item, c: T.CEMIG.tabela13.item, d: "Tabelas 14 e 15 não transcritas: 100 % (conservador)" };
    c.tab.forEach(function (r) {
      var k = r[0], row = ws.getRow(l), div = (k === "b1" || k === "c" || k === "b3") ? 1 : fp;
      row.getCell(1).value = k; row.getCell(2).value = k === "a" ? "iluminação e tomadas" : gdesc[k]; row.getCell(3).value = r[2];
      var val = c.v[k], somaNum, fator;
      if (k === "a") { somaNum = c.ciA; fator = TB().fdTabela10(c.ciA); }
      else { var L = c.grupos[k]; somaNum = k === "c" ? L.reduce(function (s, p) { return s + p.va / 1000; }, 0) : L.reduce(function (s, p) { return s + p.w / 1000; }, 0); fator = somaNum > 0 ? val * div / somaNum : 0; }
      valor(row, 4, somaNum, NUM); valor(row, 5, div, NUM); valor(row, 6, fator, "0.000");
      formula(ctx, row, 7, "D" + l + "*F" + l + "/E" + l, somaNum * fator / div, NUM); row.getCell(8).value = txt(fonteFator[k]);
      corpo(row, N); l++;
    });
    var p1 = l - 1, tr = ws.getRow(l++); tr.getCell(1).value = "D"; tr.getCell(2).value = "DEMANDA PROVÁVEL"; formula(ctx, tr, 7, "SUM(G" + p0 + ":G" + p1 + ")", c.D, NUM); tr.font = { bold: true }; corpo(tr, N, cinza);
    ctx.demanda = { primeira: p0, ultima: p1, total: l - 1, D: c.D };
    l++;
    titSub(ws, l++, N, "Fornecimento e padrão de entrada");
    var en = dm.entrada, linhas = [["Carga instalada (kW)", dm.cargaInstalada_kW, NUM], ["Demanda provável do motor (kVA)", dm.demanda_kVA, NUM], ["Tipo de fornecimento", dm.tipo || "não verificado", null], ["Motivo", dm.motivoTipo, null]];
    if (en) linhas = linhas.concat([["Faixa", en.faixa + " (" + en.tabela + ")", null], ["Disjuntor da entrada (A)", en.disjuntor_A, INT], ["Condutor (mm²)", en.condutor_mm2, "0.0"], ["Eletroduto PVC (mm)", en.eletrodutoPVC_mm, INT], ["Aterramento Cu nu (mm²)", en.aterramento_mm2, "0.0"], ["Hastes", en.hastes, INT], ["Condutor de proteção (mm²)", en.pe_mm2, "0.0"]]);
    linhas.forEach(function (r) { var row = ws.getRow(l++); row.getCell(1).value = r[0]; ws.mergeCells(row.number, 1, row.number, 3); row.getCell(1).font = { bold: true }; var cc = row.getCell(4); ws.mergeCells(row.number, 4, row.number, 8); if (r[2]) { cc.value = r[1]; cc.numFmt = r[2]; cc.alignment = { horizontal: "left" }; } else cc.value = txt(r[1]); for (var i = 1; i <= 8; i++) row.getCell(i).border = thin(); });
    return ws;
  }
  function abaEletrodutos(wb, A, opc, ctx) {
    var ws = wb.addWorksheet("Eletrodutos e fiação"), T = TB(), N = 8, ECm = EC();
    larguras(ws, [26, 12, 12, 12, 16, 16, 14, 18]);
    var l = cabecalho(ws, "Eletrodutos e fiação", N, opc);
    titSub(ws, l++, N, "Eletrodutos (trechos iguais agrupados) — DN pelo número de condutores: " + T.OCUPACAO.fonte);
    var h = ws.getRow(l++); ["Circuitos", "Trechos", "Metros", "Condutores", "Seção maior (mm²)", "DN mínimo (ficha)", "DN no modelo", "Situação"].forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    var tr = A.grafo && A.grafo.trechos ? A.grafo.trechos : {}, grupos = {}, ordem = [];
    Object.keys(A.eletrodutos).forEach(function (t) { var e = A.eletrodutos[t], k = [e.circuitos.join(","), e.condutores, e.secaoMaior, e.dnMinimo, e.dn, e.lotado ? 1 : 0].join("|"), g = grupos[k]; if (!g) { g = grupos[k] = { e: e, n: 0, m: 0 }; ordem.push(k); } g.n++; g.m += tr[t] ? tr[t].comprimento : 0; });
    var p0 = l;
    ordem.forEach(function (k) { var g = grupos[k], e = g.e, row = ws.getRow(l++); row.getCell(1).value = e.circuitos.join(", "); valor(row, 2, g.n, INT); valor(row, 3, g.m, NUM); valor(row, 4, e.condutores, INT); valor(row, 5, e.secaoMaior, "0.0"); row.getCell(6).value = e.dnMinimo == null ? "não cabe em DN 32" : e.dnMinimo; valor(row, 7, e.dn, INT); row.getCell(8).value = e.lotado ? "LOTADO" : "atende"; corpo(row, N, e.lotado ? vermelhoBg : null); });
    var p1 = l - 1, tt = ws.getRow(l++), totN = 0, totM = 0; ordem.forEach(function (k) { totN += grupos[k].n; totM += grupos[k].m; });
    tt.getCell(1).value = "TOTAL"; formula(ctx, tt, 2, "SUM(B" + p0 + ":B" + p1 + ")", totN, INT); formula(ctx, tt, 3, "SUM(C" + p0 + ":C" + p1 + ")", totM, NUM); tt.font = { bold: true }; corpo(tt, N, cinza);
    ctx.eletrodutos = { primeira: p0, ultima: p1, trechos: totN, metros: totM };
    l++;
    titSub(ws, l++, N, "Metros de eletroduto por DN (do modelo)");
    var h2 = ws.getRow(l++); ["DN (mm)", "Metros"].forEach(function (t, i) { h2.getCell(i + 1).value = t; }); cab(h2);
    var dns = {}; ordem.forEach(function (k) { var g = grupos[k]; dns[g.e.dn] = (dns[g.e.dn] || 0) + g.m; });
    Object.keys(dns).sort(function (a, b) { return a - b; }).forEach(function (dn) { var row = ws.getRow(l++); valor(row, 1, Number(dn), INT); formula(ctx, row, 2, "SUMIFS(C" + p0 + ":C" + p1 + ",G" + p0 + ":G" + p1 + ",A" + row.number + ")", dns[dn], NUM); corpo(row, 2); });
    l++;
    titSub(ws, l++, N, "Fiação — metros por seção e cor (inclui sobras nos pontos e no quadro; cores: " + ECm.CORES.fonte + ")");
    var h3 = ws.getRow(l++); ["Seção (mm²)", "Cor", "Metros", "Dos quais estimados (m)", "Circuitos"].forEach(function (t, i) { h3.getCell(i + 1).value = t; }); cab(h3);
    var cabos = ECm.cabos(A), f0 = l;
    cabos.forEach(function (c) { var row = ws.getRow(l++); valor(row, 1, c.secao, "0.0"); row.getCell(2).value = c.cor; valor(row, 3, c.metros, NUM); valor(row, 4, c.estimado, NUM); row.getCell(5).value = c.circuitos.join(", "); corpo(row, 5, c.estimado > 0 ? alertaBg : null); });
    var f1 = l - 1, tc = ws.getRow(l++), totC = cabos.reduce(function (s, c) { return s + c.metros; }, 0);
    tc.getCell(1).value = "TOTAL"; formula(ctx, tc, 3, "SUM(C" + f0 + ":C" + f1 + ")", totC, NUM); tc.font = { bold: true }; corpo(tc, 5, cinza);
    ctx.fiacao = { primeira: f0, ultima: f1, total: totC };
    l++;
    titSub(ws, l++, N, "Total por seção (m)");
    var h4 = ws.getRow(l++); ["Seção (mm²)", "Metros"].forEach(function (t, i) { h4.getCell(i + 1).value = t; }); cab(h4);
    var porS = {}; cabos.forEach(function (c) { porS[c.secao] = (porS[c.secao] || 0) + c.metros; });
    Object.keys(porS).sort(function (a, b) { return a - b; }).forEach(function (S) { var row = ws.getRow(l++); valor(row, 1, Number(S), "0.0"); formula(ctx, row, 2, "SUMIFS(C" + f0 + ":C" + f1 + ",A" + f0 + ":A" + f1 + ",A" + row.number + ")", porS[S], NUM); corpo(row, 2); });
    return ws;
  }
  function abaMateriais(wb, A, mats, opc, ctx) {
    var ws = wb.addWorksheet("Lista de materiais"), N = 10;
    larguras(ws, [58, 8, 13, 14, 13, 30, 14, 14, 44, 38]);
    var l = cabecalho(ws, "Lista de materiais", N, opc);
    var h = ws.getRow(l++); ["Item", "Un.", "Quantidade", "Código SINAPI", "Situação", "Origem", "Preço unit. (R$)", "Total (R$)", "Fonte do preço", "Observação"].forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    var p0 = l, semCodigo = 0, comPreco = 0;
    mats.forEach(function (m) {
      var row = ws.getRow(l); row.getCell(1).value = txt(m.item); row.getCell(1).alignment = { wrapText: true, vertical: "top" }; row.getCell(2).value = m.unidade; valor(row, 3, m.quantidade, NUM);
      row.getCell(4).value = m.codigo || "pendente"; row.getCell(5).value = m.situacao === "ok" ? "ok" : (m.situacao === "provisório" ? "provisório — cotar" : "PENDENTE"); row.getCell(6).value = txt(m.origem);
      if (fin(m.preco)) { valor(row, 7, m.preco, NUM); formula(ctx, row, 8, "C" + l + "*G" + l, m.quantidade * m.preco, NUM); comPreco++; } else { row.getCell(7).value = "-"; row.getCell(8).value = "-"; }
      row.getCell(9).value = txt(m.fontePreco); row.getCell(10).value = txt([m.observacao, m.motivo].filter(Boolean).join(" — ")); row.getCell(9).alignment = row.getCell(10).alignment = { wrapText: true, vertical: "top" };
      if (!m.codigo) semCodigo++;
      corpo(row, N, m.situacao === "pendente" ? vermelhoBg : (m.situacao === "provisório" ? amareloBg : null)); l++;
    });
    var p1 = l - 1;
    if (comPreco) { var tr = ws.getRow(l++); tr.getCell(1).value = "TOTAL com preço"; formula(ctx, tr, 8, "SUM(H" + p0 + ":H" + p1 + ")", mats.reduce(function (s, m) { return s + (fin(m.preco) ? m.quantidade * m.preco : 0); }, 0), NUM); tr.font = { bold: true }; corpo(tr, N, cinza); }
    l++;
    ws.mergeCells(l, 1, l, N);
    var n = ws.getCell(l, 1); n.value = "Código SINAPI MG 06/2026 conferido na base; item sem composição = PENDENTE (nunca inventado); \"provisório\" = composição de maior preço da mesma família, cotar com o fornecedor. O cabo é do projeto de circuitos; eletroduto, caixas, dispositivos e quadro vêm do modelo 3D: nada é cobrado duas vezes. Preço: o do Orçamento do modelo (esta planilha só traz preço quando informado).";
    n.font = { italic: true, size: 9, color: { argb: "FF64748B" } }; n.alignment = { wrapText: true, vertical: "top" }; ws.getRow(l).height = 44;
    ctx.materiais = { primeira: p0, ultima: p1, linhas: mats.length, semCodigo: semCodigo };
    ws.views = [{ state: "frozen", ySplit: 5 }];
    return ws;
  }
  function abaPendencias(wb, pend, opc) {
    var ws = wb.addWorksheet("Pendências"), N = 4;
    larguras(ws, [6, 12, 110, 10]);
    var l = cabecalho(ws, "Pendências e itens sem fonte", N, opc);
    var h = ws.getRow(l++); ["Nº", "Gravidade", "Pendência", "Seção do memorial"].forEach(function (t, i) { h.getCell(i + 1).value = t; }); cab(h);
    pend.forEach(function (p, i) { var row = ws.getRow(l++); valor(row, 1, i + 1, INT); row.getCell(2).value = p.nivel === "vermelho" ? "VERMELHO" : "amarelo"; row.getCell(3).value = txt(p.texto); row.getCell(3).alignment = { wrapText: true, vertical: "top" }; row.getCell(4).value = p.secao; corpo(row, N, p.nivel === "vermelho" ? vermelhoBg : alertaBg); if (p.nivel === "vermelho") row.getCell(2).font = { bold: true, color: { argb: vermelho } }; });
    if (!pend.length) ws.getRow(l).getCell(3).value = "Nenhuma pendência registrada.";
    return ws;
  }

  /* ------------------------------------------------------------------ GERAR */
  function gerar(A, opc) {
    opc = opc || {};
    if (!A || !A.ok || !arr(A.circuitos).length) return { ok: false, motivo: A && A.motivo ? A.motivo : "Sem circuitos analisados: rode \"Circuitos e quadro\" antes das planilhas.", workbook: null, abas: [], avisos: [], formulas: 0 };
    var ExcelJS = opc.ExcelJS || xl(), M = EM();
    if (!ExcelJS) return { ok: false, motivo: "Biblioteca ExcelJS indisponível.", workbook: null, abas: [], avisos: [], formulas: 0 };
    var wb = new ExcelJS.Workbook(), ctx = { formulas: 0 }, avisos = [], mats = opc.materiais || materiais(A, opc);
    wb.creator = "OrçaPRO — ElePlanilhas"; wb.created = new Date();
    var o2 = {}; Object.keys(opc).forEach(function (k) { o2[k] = opc[k]; }); o2.materiais = mats;
    var pend = M.pendencias(A, o2);
    abaCargas(wb, A, opc, ctx); abaCircuitos(wb, A, opc, ctx); abaDemanda(wb, A, opc, ctx); abaEletrodutos(wb, A, opc, ctx); abaMateriais(wb, A, mats, opc, ctx); abaPendencias(wb, pend, opc);
    if (ctx.materiais.semCodigo) avisos.push(ctx.materiais.semCodigo + " linha(s) da lista de materiais sem código SINAPI (pendente).");
    return { ok: true, workbook: wb, abas: wb.worksheets.map(function (w) { return w.name; }), avisos: avisos, formulas: ctx.formulas, materiais: mats, pendencias: pend, detalhes: ctx };
  }
  function escrever(A, opc) {
    var g = gerar(A, opc);
    if (!g.ok) return Promise.reject(new Error(g.motivo));
    return g.workbook.xlsx.writeBuffer();
  }

  var ElePlanilhas = { VERSAO: 1, gerar: gerar, escrever: escrever, materiais: materiais };
  global.ElePlanilhas = ElePlanilhas;
  if (typeof module !== "undefined" && module.exports) module.exports = ElePlanilhas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

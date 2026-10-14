/* =====================================================================
 * blocokexecxls.js — Planilha Excel EXECUTIVA do Blocok (motor executivo
 * + orçamento + cronograma). Estilo navy/aço do js/blocokxls.js: cabeçalho,
 * zebra, bordas, freeze, auto-filtro, formatos numéricos.
 *
 * Abas: Resumo · Paredes · Peças (romaneio) · Compra · Reforços · Aço ·
 *       Composições · Orçamento · Preços · Cronograma · Pendências.
 *
 *   BlocokExecXLS.construir(ExcelJS, pacote [, hooks]) → workbook
 *   BlocokExecXLS.gerar(pacote, { nome, ok, erro })    → baixa o .xlsx
 *
 *   pacote = { obra, data, resultado (BlocokCalc.calcular ou lista de paginações),
 *              cfg (BlocokOrc), orc?, crono?, hist? }   — orc/crono/hist saem do
 *   BlocokOrc quando não vierem prontos.
 *
 * Orçamento COMPLETO (decisão do dono, 14/10/2026): coeficiente sem fonte
 * publicada é "parâmetro RA (editável)" (coluna Origem, sem cor de alerta);
 * preço vem de cfg.precos > cfg.base > referência RA (out/2026), com a origem
 * em cada linha. "sem preço" só aparece se o usuário apagar um preço.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NAVY = "FF0F2740", ACO = "FF1858A8", BRANCO = "FFFFFFFF", ZEBRA = "FFF1F6FB",
      TITULO = "FF12314F", AMBAR = "FFB26A00", TOT = "FFDCE9F6", CINZA = "FF5A6A78";
  var NUM = "#,##0.00", INT = "#,##0", NUM3 = "#,##0.000", NUM4 = "#,##0.0000", MOEDA = "R$ #,##0.00";

  function thin() { var s = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: s, left: s, bottom: s, right: s }; }
  function nomeAba(s) { return (String(s == null ? "" : s).replace(/[:\\\/?*\[\]]/g, "-").trim().substring(0, 31)) || "Aba"; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function cm(m) { return Math.round(num(m) * 1000) / 10; }
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m;
  }

  /* ---- tabela genérica numa aba, a partir da linha r0; devolve a próxima linha livre ---- */
  // cols: [{ h, k, w, fmt, al }]; linhas: objetos; linha._est = true pinta em âmbar
  function tabela(ws, r0, cols, linhas, opts) {
    opts = opts || {};
    var r = r0, hr = ws.getRow(r);
    cols.forEach(function (c, i) {
      var cell = hr.getCell(i + 1); cell.value = c.h;
      cell.font = { bold: true, color: { argb: BRANCO }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = thin();
    });
    hr.height = 26;
    var headerRow = r, ext = opts.estenderUltima || 0;
    if (ext) ws.mergeCells(r, cols.length, r, cols.length + ext);
    arr(linhas).forEach(function (lin, idx) {
      r++; var row = ws.getRow(r);
      if (ext) ws.mergeCells(r, cols.length, r, cols.length + ext);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1), v = lin[c.k];
        cell.value = v == null ? "" : v;
        if (c.fmt && typeof v === "number") cell.numFmt = c.fmt;
        cell.alignment = { vertical: "middle", horizontal: c.al || (typeof v === "number" ? "right" : "left"), wrapText: !!c.wrap };
        cell.border = thin();
        if (lin._est) cell.font = { color: { argb: AMBAR }, italic: true };
        if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    });
    if (opts.totais) {
      r++; var tr = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = tr.getCell(i + 1), v = (i === 0 && opts.totais[c.k] == null) ? "TOTAL" : opts.totais[c.k];
        cell.value = v == null ? "" : v;
        if (c.fmt && typeof v === "number") cell.numFmt = c.fmt;
        cell.font = { bold: true, color: { argb: TITULO } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOT } };
        cell.alignment = { vertical: "middle", horizontal: c.al || (typeof v === "number" ? "right" : "left") };
        cell.border = thin();
      });
    }
    if (opts.filtro && arr(linhas).length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
    return { proxima: r + 2, cabecalho: headerRow };
  }
  // aba nova com título/subtítulo; devolve { ws, r } (r = linha do cabeçalho da 1ª tabela)
  function novaAba(wb, nome, cols, titulo, subtitulo, congelar) {
    var cabecalho = subtitulo ? 4 : 3;
    var ws = wb.addWorksheet(nomeAba(nome), congelar === false ? {} : { views: [{ state: "frozen", ySplit: cabecalho }] });
    ws.columns = cols.map(function (c) { return { key: c.k, width: c.w || 14 }; });
    ws.mergeCells(1, 1, 1, cols.length);
    var ct = ws.getCell(1, 1); ct.value = titulo; ct.font = { bold: true, size: 13, color: { argb: TITULO } }; ct.alignment = { vertical: "middle" };
    ws.getRow(1).height = 20;
    if (subtitulo) { ws.mergeCells(2, 1, 2, cols.length); var cs = ws.getCell(2, 1); cs.value = subtitulo; cs.font = { size: 10, color: { argb: CINZA } }; }
    return { ws: ws, r: cabecalho };
  }
  function subtitulo(ws, r, n, texto) {
    ws.mergeCells(r, 1, r, n);
    var c = ws.getCell(r, 1); c.value = texto; c.font = { bold: true, color: { argb: BRANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACO } }; c.alignment = { vertical: "middle" };
    ws.getRow(r).height = 18; return r + 1;
  }
  // aba de pares chave/valor
  function abaKV(wb, nome, titulo, blocos) {
    var ws = wb.addWorksheet(nomeAba(nome));
    ws.columns = [{ width: 46 }, { width: 22 }, { width: 70 }];
    ws.mergeCells(1, 1, 1, 3);
    var ct = ws.getCell(1, 1); ct.value = titulo; ct.font = { bold: true, size: 13, color: { argb: TITULO } };
    ws.getRow(1).height = 20; var r = 2;
    blocos.forEach(function (bl) {
      r++; ws.mergeCells(r, 1, r, 3);
      var cb = ws.getCell(r, 1); cb.value = bl.titulo; cb.font = { bold: true, color: { argb: BRANCO } };
      cb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACO } }; cb.alignment = { vertical: "middle" }; ws.getRow(r).height = 18;
      arr(bl.itens).forEach(function (it) {
        r++; var row = ws.getRow(r);
        var c1 = row.getCell(1); c1.value = it[0]; c1.font = { color: { argb: "FF334155" } }; c1.border = thin();
        var c2 = row.getCell(2); c2.value = it[1] == null ? "" : it[1]; c2.alignment = { horizontal: "right" }; c2.font = { bold: true }; c2.border = thin();
        if (it[3] && typeof it[1] === "number") c2.numFmt = it[3];
        var c3 = row.getCell(3); c3.value = it[2] || ""; c3.font = { color: { argb: "FF64748B" }, size: 10 }; c3.border = thin(); c3.alignment = { wrapText: true };
        if (it[4] === "conf") { c3.font = { color: { argb: AMBAR }, italic: true, size: 10 }; c2.font = { bold: true, color: { argb: AMBAR } }; }
      });
    });
    return ws;
  }

  function pags(res) {
    var l = Array.isArray(res) ? res : (res && res.paredes) || [];
    return l.map(function (p) { return p && p.quant ? p : (p && p.pag); }).filter(function (p) { return p && p.quant; });
  }
  function calcDe(res, id) { // bloco de cálculo da parede (blocokcalc), se houver
    var l = res && !Array.isArray(res) ? res.paredes || [] : [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id && l[i].pag) return l[i];
    return null;
  }
  function nomePred(atv, ids) { return arr(ids).map(function (i) { for (var k = 0; k < atv.length; k++) if (atv[k].id === i) return atv[k].nome; return i; }).join(" + "); }
  function somaMap(m) { var s = 0; Object.keys(m || {}).forEach(function (k) { s += num(m[k]); }); return s; }

  /* ------------------------------------------------------------------ */
  function construir(ExcelJS, pacote) {
    pacote = pacote || {};
    var ORC = dep("BlocokOrc", "./blocokorc.js");
    if (!ORC) throw new Error("BlocokExecXLS: BlocokOrc ausente");
    var res = pacote.resultado, cfg = pacote.cfg || {};
    var PG = pags(res);
    var orc = pacote.orc || ORC.orcar(res, cfg);
    var crono = pacote.crono || ORC.cronograma(res, cfg);
    var hist = pacote.hist || ORC.histograma(res, cfg, crono);
    var comps = orc.composicoes || ORC.composicoes(cfg, res);
    var cons = (res && !Array.isArray(res) && res.consolidado && res.consolidado.totais) ? res.consolidado : dep("BlocokExec", "./blocokexec.js").consolidar(PG);
    /* aço: o motor de cálculo (blocokcalc) troca o construtivo pelo CALCULADO (quant.acoConstrutivo === false) */
    var acoCalc = PG.length > 0 && PG.every(function (p) { return p.quant && p.quant.acoConstrutivo === false; });
    var T = cons.totais, obra = pacote.obra || (res && res.obra && res.obra.nome) || "Obra", data = pacote.data || (res && res.data) || "";

    var wb = new ExcelJS.Workbook();
    wb.creator = (typeof Empresa !== "undefined" && Empresa.excelCreator) ? Empresa.excelCreator() : "Plantas Executivas";
    wb.created = pacote.dataObj || undefined;

    // ===== RESUMO =====
    var tt = orc.totais || {}, mv = function (v) { return (tt.parcial && !v) ? "sem preço" : v; }, merc = orc.mercado || {}, prod = orc.produtividade || ORC.produtividade(cfg);
    abaKV(wb, "Resumo", "Blocok executivo — " + obra, [
      { titulo: "Obra", itens: [
        ["Obra", obra, data], ["Paredes", T.paredes, ""], ["Peças paginadas (em amarração)", T.pecas, "", INT],
        ["Placas a comprar (com aproveitamento de retalho)", T.placasCompra, "Placa 90 × 90 cm", INT],
        ["Área líquida de parede (m²)", T.areaLiquida, "Eixo × altura, vãos descontados", NUM],
        ["Peso das peças (kg)", T.pesoPecasKg, "Peça cheia do catálogo", NUM],
        ["Problemas de paginação", T.problemas, "Transpasse < 33 %, junta no canto de vão etc.", INT]
      ] },
      { titulo: "Quantitativos (consolidar do motor executivo)", itens: [
        ["Concreto de preenchimento (m³)", T.concretoM3, "", NUM3],
        ["Argamassa de assentamento (m³)", T.argamassaM3, "Parâmetro RA (editável) — fabricante não publica traço nem consumo", NUM4],
        ["Aço (kg)", T.acoKg, (acoCalc ? "Armadura CALCULADA (NBR 6118); contraverga e porta-estribo construtivos — ver Pendências" : "Armadura CONSTRUTIVA do motor — ver Pendências"), NUM, acoCalc ? null : "conf"],
        ["Tela de fibra de vidro (m)", T.telaM, "Parâmetro RA (editável) — consumo do tratamento de juntas", NUM],
        ["AC-III (kg)", T.acIIIkg, "Parâmetro RA (editável)", NUM], ["Selador (L)", T.seladorL, "Parâmetro RA (editável)", NUM],
        ["Grampos de ligação (un)", T.grampos, "", INT], ["Escoramento de vergas (un)", T.escoramentoVergas, "", INT]
      ] },
      { titulo: "Custo direto (preços: " + (arr(tt.origensPreco).join(" + ") || "—") + ")", itens: [
        ["Situação do orçamento", tt.parcial ? "PARCIAL" : "COMPLETO", tt.parcial ? tt.linhasSemPreco + " linha(s) com preço apagado pelo usuário" : "Preços de referência RA (" + (orc.dataBasePrecos || "") + ") — confira com o seu fornecedor", null, tt.parcial ? "conf" : null],
        ["Mão de obra (R$)", mv(tt.MO), tt.parcial ? "só insumos com preço" : "", MOEDA], ["Material (R$)", mv(tt.MAT), tt.parcial ? "só insumos com preço" : "", MOEDA], ["Equipamento (R$)", mv(tt.EQ), tt.parcial ? "só insumos com preço" : "", MOEDA],
        ["Total direto (R$)", mv(tt.total), tt.parcial ? "PARCIAL — não é o custo da obra" : "BDI e impostos NÃO incluídos", MOEDA, tt.parcial ? "conf" : null],
        ["Custo por m² de parede (R$)", tt.custoPorM2 == null ? "sem preço" : tt.custoPorM2, tt.custoPorM2 == null ? "indisponível: há preço apagado" : "Custo direto, sem BDI", MOEDA, tt.custoPorM2 == null ? "conf" : null],
        ["  · material por m² (R$)", tt.porM2 ? tt.porM2.MAT : "", "", MOEDA], ["  · mão de obra por m² (R$)", tt.porM2 ? tt.porM2.MO : "", "", MOEDA], ["  · equipamento por m² (R$)", tt.porM2 ? tt.porM2.EQ : "", "", MOEDA],
        ["Referência de mercado (R$/m²)", merc.referenciaM2, "REFERÊNCIA, não preço. " + (merc.fonte || "") + (merc.texto ? " " + merc.texto : ""), MOEDA],
        ["Horas de mão de obra (h)", tt.horasTotal, "", NUM], ["Horas por m² de parede (h/m²)", tt.horasPorM2, "", NUM4]
      ] },
      { titulo: "Produtividade adotada", itens: [
        ["Produção da equipe (m²/dia)", prod.m2Dia, "Fabricante (45 m²/dia); equipe NÃO informada", NUM],
        ["Equipe (pedreiro + ajudantes)", prod.pedreiros + " + " + prod.ajudantes, "Premissa RA", null, "conf"],
        ["Pedreiro (h/m²)", prod.hPorM2.pedreiro, "", NUM4], ["Ajudante (h/m²)", prod.hPorM2.ajudante, "", NUM4], ["Total (h/m²)", prod.hPorM2.total, prod.texto, NUM4]
      ] },
      { titulo: "Prazo (dias úteis relativos)", itens: [
        ["Duração total", crono.duracaoTotal, arr(crono.avisos).join(" ") || "", INT], ["Equipes em paralelo", crono.equipes, "", INT],
        ["Caminho crítico", arr(crono.caminhoCritico).length + " atividades", "", null]
      ] }
    ]);

    // ===== PAREDES =====
    var colsPar = [
      { h: "Parede", k: "id", w: 9, al: "left" }, { h: "Descrição", k: "nome", w: 26, al: "left" },
      { h: "Esp. (cm)", k: "esp", w: 9, fmt: INT }, { h: "Comp. (m)", k: "comp", w: 10, fmt: NUM }, { h: "Altura (m)", k: "alt", w: 10, fmt: NUM },
      { h: "Área líq. (m²)", k: "area", w: 12, fmt: NUM }, { h: "Peças", k: "pecas", w: 8, fmt: INT }, { h: "Inteiras", k: "int", w: 8, fmt: INT },
      { h: "Meias", k: "meia", w: 8, fmt: INT }, { h: "Recortes", k: "rec", w: 9, fmt: INT }, { h: "Em L", k: "L", w: 8, fmt: INT },
      { h: "Placas compra", k: "compra", w: 10, fmt: INT }, { h: "Peso (kg)", k: "peso", w: 11, fmt: NUM }, { h: "Concreto (m³)", k: "conc", w: 11, fmt: NUM3 },
      { h: "Aço (kg)", k: "aco", w: 10, fmt: NUM }, { h: "Grampos", k: "gr", w: 9, fmt: INT }, { h: "Paginação", k: "ok", w: 12, al: "center" }
    ];
    var lPar = PG.map(function (p) {
      var q = p.quant, t = q.porTipo || {};
      return { id: p.id, nome: p.nome || "", esp: p.espessura, comp: p.comprimento, alt: p.altura, area: q.areaLiquida, pecas: q.pecas,
        int: t.inteira || 0, meia: t.meia || 0, rec: t.recorte || 0, L: t["recorte-L"] || 0, compra: q.placasCompra, peso: q.pesoPecasKg, conc: q.concretoM3,
        aco: q.acoKg, gr: q.grampos, ok: p.validacao && p.validacao.ok ? "ok" : (arr(p.validacao && p.validacao.problemas).length + " problema(s)") };
    });
    var a = novaAba(wb, "Paredes", colsPar, "Paredes — " + obra, PG.length + " paredes · paginação em amarração (SiNAT 019)");
    tabela(a.ws, a.r, colsPar, lPar, { filtro: true, totais: { id: "TOTAL", pecas: T.pecas, compra: T.placasCompra, area: T.areaLiquida, peso: T.pesoPecasKg, conc: T.concretoM3, aco: T.acoKg, gr: T.grampos } });

    // ===== PEÇAS (romaneio) =====
    var colsPc = [
      { h: "Parede", k: "par", w: 9, al: "left" }, { h: "Código", k: "cod", w: 11, al: "left" }, { h: "Fiada", k: "fiada", w: 7, fmt: INT },
      { h: "x (cm)", k: "x", w: 9, fmt: NUM }, { h: "y (cm)", k: "y", w: 9, fmt: NUM }, { h: "Largura (cm)", k: "w", w: 11, fmt: NUM }, { h: "Altura (cm)", k: "h", w: 11, fmt: NUM },
      { h: "Dimensões", k: "dim", w: 14, al: "center" }, { h: "Tipo", k: "tipo", w: 11, al: "center" }, { h: "Forma", k: "forma", w: 12, al: "center" },
      { h: "Área (m²)", k: "area", w: 10, fmt: NUM3 }, { h: "Peso (kg)", k: "peso", w: 10, fmt: NUM }, { h: "Reforços (EPS retirado)", k: "ref", w: 24, al: "left" }
    ];
    var lPc = [];
    PG.forEach(function (p) {
      arr(p.pecas).forEach(function (pc) {
        lPc.push({ par: p.id, cod: pc.cod, fiada: pc.fiada, x: cm(pc.x), y: cm(pc.y), w: cm(pc.w), h: cm(pc.h), dim: Math.round(cm(pc.w)) + " x " + Math.round(cm(pc.h)),
          tipo: String(pc.tipo || "").toUpperCase(), forma: pc.forma, area: pc.area, peso: pc.peso, ref: arr(pc.reforcos).join(", ") });
      });
    });
    a = novaAba(wb, "Peças", colsPc, "Romaneio de peças — " + obra, lPc.length + " peças · inteiras 90 × 90; recortes com a dimensão real para cortar na obra");
    tabela(a.ws, a.r, colsPc, lPc, { filtro: true, totais: { par: "TOTAL", peso: lPc.reduce(function (s, x) { return s + num(x.peso); }, 0), area: lPc.reduce(function (s, x) { return s + num(x.area); }, 0) } });

    // ===== COMPRA =====
    var colsCp = [
      { h: "Item", k: "item", w: 46, al: "left" }, { h: "Peças", k: "pecas", w: 10, fmt: INT }, { h: "Inteiras", k: "int", w: 10, fmt: INT },
      { h: "Meias", k: "meia", w: 10, fmt: INT }, { h: "Recortes", k: "rec", w: 10, fmt: INT }, { h: "Em L", k: "L", w: 9, fmt: INT },
      { h: "Placas a comprar", k: "compra", w: 14, fmt: INT }, { h: "Área (m²)", k: "area", w: 11, fmt: NUM }, { h: "Peso (kg)", k: "peso", w: 12, fmt: NUM }
    ];
    var lCp = arr(cons.porEspessura).map(function (e) {
      return { item: "Painel Blocok 90 × 90 cm, esp. " + e.espessura + " cm", pecas: e.pecas, int: e.inteira, meia: e.meia, rec: e.recorte, L: e["recorte-L"], compra: e.placasCompra, area: e.area, peso: e.peso };
    });
    a = novaAba(wb, "Compra", colsCp, "Lista de compra — " + obra, "Placas por espessura (retalho aproveitado) e insumos. Quantidades com origem parâmetro RA são editáveis (fabricante não publica).", false);
    var t1 = tabela(a.ws, a.r, colsCp, lCp, { totais: { item: "TOTAL", pecas: T.pecas, compra: T.placasCompra, area: T.areaPecas, peso: T.pesoPecasKg } });
    var colsIn = [{ h: "Insumo", k: "item", w: 46, al: "left" }, { h: "Quantidade", k: "q", w: 14, fmt: NUM3 }, { h: "Unidade", k: "un", w: 10, al: "center" }, { h: "Observação", k: "obs", w: 60, al: "left" }];
    var rr = subtitulo(a.ws, t1.proxima, colsIn.length, "Insumos (quantidades do consolidar)");
    var enc = (orc.quantidades && orc.quantidades["BLK-08"]) || 0;
    tabela(a.ws, rr, colsIn, [
      { item: "Concreto de preenchimento (pilaretes, vergas, cintas)", q: T.concretoM3, un: "m³", obs: "Volume geométrico; perda de obra no coeficiente da composição" },
      { item: "Argamassa de assentamento", q: T.argamassaM3, un: "m³", obs: "Parâmetro RA (editável) — traço/produto e consumo não publicados" },
      { item: "Aço para armadura", q: T.acoKg, un: "kg", obs: acoCalc ? "Armadura calculada (NBR 6118) — conferir com o detalhamento" : "Armadura construtiva do motor — conferir com o cálculo" },
      { item: "Tela de fibra de vidro", q: T.telaM, un: "m", obs: "Parâmetro RA (editável)" }, { item: "Argamassa AC-III aditivada", q: T.acIIIkg, un: "kg", obs: "Parâmetro RA (editável)" },
      { item: "Selador acrílico", q: T.seladorL, un: "L", obs: "Parâmetro RA (editável)" }, { item: "Grampos de ligação", q: T.grampos, un: "un", obs: "1 por fiada, ancorado ≥ 15 cm (SiNAT 019)" },
      { item: "Escoramento de vergas", q: T.escoramentoVergas, un: "un", obs: "" }, { item: "Encunhamento do topo", q: enc, un: "m", obs: "Folga ≥ 30 mm (SiNAT 019)" }
    ], { estenderUltima: 5 });

    // ===== REFORÇOS =====
    var colsRf = [
      { h: "Parede", k: "par", w: 9, al: "left" }, { h: "Elemento", k: "id", w: 14, al: "left" }, { h: "Tipo", k: "tipo", w: 12, al: "center" },
      { h: "x (cm)", k: "x", w: 9, fmt: NUM }, { h: "y (cm)", k: "y", w: 9, fmt: NUM }, { h: "Comp. (cm)", k: "w", w: 10, fmt: NUM }, { h: "Altura (cm)", k: "h", w: 10, fmt: NUM },
      { h: "Motivo / vão", k: "mot", w: 34, al: "left" }, { h: "Armadura calculada (blocokcalc)", k: "calc", w: 24, al: "left" }, { h: acoCalc ? "Armadura orçada (quantitativo calculado)" : "Armadura orçada (construtiva)", k: "constr", w: 40, al: "left" }
    ];
    var lRf = [];
    PG.forEach(function (p) {
      var cb = calcDe(res, p.id), constr = {};
      arr(p.quant.aco).forEach(function (x) {
        var m = /^(\S+(?: de respaldo| intermedi[aá]ria)?)\s+(\S+)$/.exec(x.elemento), mc = /^cinta\s+(\S+)\s+—\s+(\S+)/.exec(x.elemento);   /* "cinta CR — inferior" */
        var id = mc ? mc[1] : (m ? m[2] : x.elemento);
        if (id === "cinta" && /^estribos/.test(x.elemento)) id = (arr(p.reforcos && p.reforcos.cintas)[0] || { id: id }).id;
        constr[id] = (constr[id] ? constr[id] + " + " : "") + (/^estribos/.test(x.elemento) ? x.barras + " estribos φ" + x.bitola + " c=" + x.comprimento + " m" : (mc ? mc[2] + " " : "") + x.barras + " φ" + x.bitola + " c=" + x.comprimento + " m");
      });
      function calcArm(lista, id) { var l = arr(lista); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].armadura || ""; return ""; }
      var rf = p.reforcos || {};
      arr(rf.pilaretes).forEach(function (e) { lRf.push({ par: p.id, id: e.id, tipo: "pilarete", x: cm(e.x), y: cm(e.y), w: cm(e.w), h: cm(e.h), mot: e.motivo, calc: calcArm(cb && cb.pilaretes, e.id), constr: constr[e.id] || "" }); });
      arr(rf.vergas).forEach(function (e) { lRf.push({ par: p.id, id: e.id, tipo: e.viga ? "viga" : "verga", x: cm(e.x), y: cm(e.y), w: cm(e.w), h: cm(e.h), mot: "vão " + e.vao + (e.nota ? " — " + e.nota : ""), calc: calcArm(cb && cb.vergas, e.id), constr: constr[e.id] || "" }); });
      arr(rf.contravergas).forEach(function (e) { lRf.push({ par: p.id, id: e.id, tipo: "contraverga", x: cm(e.x), y: cm(e.y), w: cm(e.w), h: cm(e.h), mot: "vão " + e.vao, calc: "", constr: constr[e.id] || "" }); });
      arr(rf.cintas).forEach(function (e) { lRf.push({ par: p.id, id: e.id, tipo: "cinta", x: cm(e.x), y: cm(e.y), w: cm(e.w), h: cm(e.h), mot: e.nome, calc: (cb && cb.cinta && e.id === "CR") ? (cb.cinta.armadura || "") : "", constr: constr[e.id] || "" }); });
    });
    a = novaAba(wb, "Reforços", colsRf, "Pilaretes, vergas, contravergas e cintas — " + obra, lRf.length + " elementos · EPS retirado e concreto armado dentro da peça; faces como fôrma");
    tabela(a.ws, a.r, colsRf, lRf, { filtro: true });

    // ===== AÇO =====
    var colsAc = [{ h: "Bitola (mm)", k: "bit", w: 12, fmt: NUM, al: "left" }, { h: "Comprimento (m)", k: "m", w: 16, fmt: NUM }, { h: "Massa (kg)", k: "kg", w: 14, fmt: NUM3 }];
    a = novaAba(wb, "Aço", [{ k: "a", w: 12 }, { k: "b", w: 34 }, { k: "c", w: 14 }, { k: "d", w: 14 }, { k: "e", w: 14 }, { k: "f", w: 12 }, { k: "g", w: 12 }], "Aço por bitola — " + obra, (acoCalc ? "Armadura CALCULADA (NBR 6118; NBR 7480 para a massa linear) — contraverga e porta-estribo construtivos — ver Pendências" : "Armadura CONSTRUTIVA do motor executivo (NBR 7480 para a massa linear); o cálculo pode pedir mais — ver Pendências"), false);
    var tA = tabela(a.ws, a.r, colsAc, arr(cons.aco).map(function (x) { return { bit: x.bitola, m: x.metros, kg: x.kg }; }), { totais: { bit: "TOTAL", m: cons.aco.reduce(function (s, x) { return s + x.metros; }, 0), kg: T.acoKg } });
    var colsAe = [{ h: "Parede", k: "par", w: 12, al: "left" }, { h: "Elemento", k: "el", w: 34, al: "left" }, { h: "Barras", k: "n", w: 10, fmt: INT }, { h: "Bitola (mm)", k: "bit", w: 12, fmt: NUM }, { h: "Comp. unit. (m)", k: "c", w: 14, fmt: NUM }, { h: "Total (m)", k: "m", w: 12, fmt: NUM }, { h: "Massa (kg)", k: "kg", w: 12, fmt: NUM3 }];
    var rA = subtitulo(a.ws, tA.proxima, colsAe.length, "Aço por elemento");
    var lAe = []; PG.forEach(function (p) { arr(p.quant.aco).forEach(function (x) { lAe.push({ par: p.id, el: x.elemento, n: x.barras, bit: x.bitola, c: x.comprimento, m: x.metros, kg: x.kg }); }); });
    tabela(a.ws, rA, colsAe, lAe, { totais: { par: "TOTAL", kg: T.acoKg } });

    // ===== COMPOSIÇÕES =====
    var colsCo = [
      { h: "Código", k: "cod", w: 12, al: "left" }, { h: "Composição", k: "comp", w: 46, al: "left", wrap: true }, { h: "Unid. comp.", k: "uc", w: 9, al: "center" },
      { h: "Insumo", k: "ins", w: 50, al: "left", wrap: true }, { h: "Tipo", k: "tipo", w: 7, al: "center" }, { h: "Unid.", k: "un", w: 7, al: "center" },
      { h: "Coeficiente", k: "coef", w: 13, fmt: NUM4 }, { h: "Origem do coeficiente", k: "org", w: 24, al: "center", wrap: true },
      { h: "Preço (R$)", k: "preco", w: 12, fmt: MOEDA }, { h: "Origem do preço", k: "orgp", w: 16, al: "center" }, { h: "Cód. SINAPI", k: "sin", w: 14, al: "center" },
      { h: "Fonte do coeficiente", k: "orig", w: 80, al: "left", wrap: true }
    ];
    var lCo = [];
    comps.forEach(function (c) {
      c.insumos.forEach(function (it) {
        lCo.push({ cod: c.codigo, comp: c.descricao, uc: c.unidade, ins: it.descricao, tipo: it.tipo, un: it.unidade,
          coef: it.coeficiente == null ? "a derivar do resultado" : it.coeficiente, org: it.origem,
          preco: it.unidade === "%MO" ? "" : (it.precoUnitario == null ? "sem preço" : it.precoUnitario), orgp: it.unidade === "%MO" ? "" : (it.origemPreco || ""),
          sin: it.codigoSinapi || "própria (BLK)", orig: it.fonte });
      });
    });
    a = novaAba(wb, "Composições", colsCo, "Composições próprias BLK — " + obra, "Códigos BLK-xx são PRÓPRIOS (não existem na SINAPI). Coeficiente sem fonte publicada = parâmetro RA (editável em cfg.coeficientes); preço = configurado, base ou referência RA.");
    tabela(a.ws, a.r, colsCo, lCo, { filtro: true });

    // ===== ORÇAMENTO =====
    var colsOr = [
      { h: "Etapa", k: "etapa", w: 24, al: "left" }, { h: "Código", k: "cod", w: 12, al: "left" }, { h: "Descrição", k: "desc", w: 60, al: "left", wrap: true },
      { h: "Unid.", k: "un", w: 7, al: "center" }, { h: "Quantidade", k: "q", w: 13, fmt: NUM3 }, { h: "Custo unit. (R$)", k: "cu", w: 15, fmt: MOEDA },
      { h: "Custo total (R$)", k: "ct", w: 16, fmt: MOEDA }, { h: "MO (R$)", k: "mo", w: 13, fmt: MOEDA }, { h: "MAT (R$)", k: "mat", w: 13, fmt: MOEDA }, { h: "EQ (R$)", k: "eq", w: 12, fmt: MOEDA },
      { h: "Horas pedreiro", k: "hp", w: 11, fmt: NUM }, { h: "Horas ajudante", k: "ha", w: 11, fmt: NUM }, { h: "Horas armador", k: "hr", w: 11, fmt: NUM },
      { h: "Origem do preço", k: "orgp", w: 20, al: "center", wrap: true }, { h: "Situação", k: "sit", w: 16, al: "center" }, { h: "Insumos sem preço", k: "semp", w: 40, al: "left", wrap: true }, { h: "Origem", k: "orig", w: 60, al: "left", wrap: true }
    ];
    var F = ORC.FUNC;
    var lOr = arr(orc.linhas).map(function (l) {
      return { etapa: l.etapa, cod: l.codigo, desc: l.descricao, un: l.unidade, q: l.quantidade, cu: l.custoUnitario == null ? "sem preço" : l.custoUnitario, ct: l.custoTotal == null ? "sem preço" : l.custoTotal,
        mo: l.MO, mat: l.MAT, eq: l.EQ, hp: l.horas[F.pedreiro] || 0, ha: l.horas[F.ajudante] || 0, hr: l.horas[F.armador] || 0,
        orgp: l.origemPreco || "", sit: l.semPreco ? "SEM PREÇO" : "completa", semp: arr(l.insumosSemPreco).map(function (s) { return s.descricao + " (" + s.motivo + ")"; }).join("; "),
        orig: l.origem };
    });
    a = novaAba(wb, "Orçamento", colsOr, "Orçamento direto — " + obra, (tt.parcial ? "PARCIAL: há preço apagado (cfg.precos). " : "Preços de referência RA (" + (orc.dataBasePrecos || "") + ") — confira com o seu fornecedor. BDI NÃO incluso. ") + "Quantidades do consolidar() do motor executivo · composições próprias BLK.");
    var tO = tabela(a.ws, a.r, colsOr, lOr, { filtro: true, totais: { etapa: "TOTAL", mo: tt.MO, mat: tt.MAT, eq: tt.EQ, ct: tt.parcial ? "parcial" : tt.total,
      hp: (tt.horas || {})[F.pedreiro] || 0, ha: (tt.horas || {})[F.ajudante] || 0, hr: (tt.horas || {})[F.armador] || 0 } });
    var rM = subtitulo(a.ws, tO.proxima, 3, "Custo por m² de parede × referência de mercado");
    [["Custo direto por m² (R$)", tt.custoPorM2 == null ? "sem preço" : tt.custoPorM2, tt.custoPorM2 == null ? "Indisponível: há preço apagado (parcial R$ " + (tt.custoPorM2Parcial == null ? 0 : tt.custoPorM2Parcial) + "/m²)" : "Custo direto, sem BDI"],
     ["  · material / mão de obra / equipamento (R$/m²)", tt.porM2 ? tt.porM2.MAT + " / " + tt.porM2.MO + " / " + tt.porM2.EQ : "", "Separação do custo direto por m² de parede"],
     ["Referência de mercado (R$/m²)", merc.referenciaM2, "REFERÊNCIA, não preço. " + (merc.fonte || "")],
     ["Diferença (%)", merc.diferencaPct == null ? "n/d" : merc.diferencaPct, merc.texto || ""],
     ["Horas por m² de parede", tt.horasPorM2, "Conferência: TCCs Blocom 0,44 a 0,51 h/m² (só assentamento)"]].forEach(function (x, i) {
      var row = a.ws.getRow(rM + i);
      var c1 = row.getCell(1); c1.value = x[0]; c1.border = thin();
      var c2 = row.getCell(2); c2.value = x[1] == null ? "" : x[1]; c2.border = thin(); c2.font = { bold: true }; c2.alignment = { horizontal: "right" }; if (typeof x[1] === "number") c2.numFmt = NUM;
      var c3 = row.getCell(3); c3.value = x[2]; c3.border = thin(); c3.font = { color: { argb: CINZA }, size: 10 };
    });

    // ===== PREÇOS =====
    var colsPr = [
      { h: "Chave (cfg.precos)", k: "chave", w: 28, al: "left" }, { h: "Insumo", k: "desc", w: 62, al: "left", wrap: true }, { h: "Unid.", k: "un", w: 7, al: "center" },
      { h: "Referência RA (R$)", k: "ref", w: 16, fmt: MOEDA }, { h: "Preço usado (R$)", k: "uso", w: 16, fmt: MOEDA }, { h: "Origem do preço usado", k: "org", w: 20, al: "center" },
      { h: "Observação", k: "nota", w: 60, al: "left", wrap: true }
    ];
    var lPr = arr(orc.tabelaPrecos).map(function (t) {
      return { chave: t.chave, desc: t.descricao, un: t.unidade, ref: t.referencia, uso: t.preco == null ? "sem preço" : t.preco, org: t.origem || "", nota: t.nota || "" };
    });
    a = novaAba(wb, "Preços", colsPr, "Preços de referência RA — " + obra, "Data-base " + (orc.dataBasePrecos || "") + " · referência RA de mercado, editável (cfg.precos[chave] sobrepõe; cfg.base traz o preço de uma base) · BDI NÃO incluso");
    var tP = tabela(a.ws, a.r, colsPr, lPr, { filtro: true });
    var colsPc2 = [{ h: "Esp. (cm)", k: "esp", w: 28, fmt: INT, al: "left" }, { h: "Faces (m³)", k: "f", w: 62, fmt: NUM4 }, { h: "Traço (R$/m³)", k: "t", w: 7, fmt: NUM },
      { h: "Faces (R$)", k: "cf", w: 16, fmt: NUM }, { h: "EPS (m³)", k: "e", w: 16, fmt: NUM4 }, { h: "EPS (R$)", k: "ce", w: 20, fmt: NUM },
      { h: "Material (R$)", k: "m", w: 14, fmt: NUM }, { h: "Fator de fábrica", k: "fa", w: 14, fmt: NUM }, { h: "Preço da peça (R$)", k: "p", w: 16, fmt: MOEDA }, { h: "R$/m² de painel", k: "pm", w: 14, fmt: MOEDA }];
    var rPc = subtitulo(a.ws, tP.proxima, colsPc2.length, "Preço da peça Blocok 90 × 90 cm por custo de produção (faces de micro concreto + EPS) × fator de fábrica");
    var tPc = tabela(a.ws, rPc, colsPc2, arr(orc.pecas).map(function (x) {
      var c = x.conta || {};
      return { esp: x.espessura, f: c.facesM3, t: c.custoTracoM3, cf: c.custoFaces, e: c.epsM3, ce: c.custoEPS, m: c.custoMaterial, fa: c.fator, p: x.preco, pm: x.precoM2 };
    }), {});
    var ps = arr(orc.pecas);
    var rTx = tPc.proxima;
    ps.forEach(function (x, i) {
      a.ws.mergeCells(rTx + i, 1, rTx + i, colsPc2.length);
      var cT = a.ws.getCell(rTx + i, 1); cT.value = x.texto || ""; cT.alignment = { wrapText: true, vertical: "top" }; cT.font = { size: 10, color: { argb: CINZA } };
      a.ws.getRow(rTx + i).height = 42;
    });

    // ===== CRONOGRAMA =====
    var colsCr = [
      { h: "Id", k: "id", w: 16, al: "left" }, { h: "Atividade", k: "nome", w: 56, al: "left", wrap: true }, { h: "Duração (dias úteis)", k: "dur", w: 14, fmt: INT, al: "right" },
      { h: "Início (dia)", k: "ini", w: 10, fmt: INT }, { h: "Fim (dia)", k: "fim", w: 10, fmt: INT }, { h: "Predecessoras (término → início)", k: "pred", w: 48, al: "left", wrap: true },
      { h: "Folga (dias)", k: "folga", w: 10, fmt: INT }, { h: "Crítica", k: "crit", w: 8, al: "center" }, { h: "Escopo", k: "esc", w: 14, al: "center" },
      { h: "Horas de MO", k: "h", w: 11, fmt: NUM }, { h: "Origem da duração", k: "orig", w: 60, al: "left", wrap: true }
    ];
    var lCr = arr(crono.atividades).map(function (x) {
      return { id: x.id, nome: x.nome, dur: x.duracao == null ? "a definir" : x.duracao, ini: x.inicio, fim: x.fim, pred: nomePred(crono.atividades, x.predecessoras), folga: x.folga,
        crit: x.critica ? "sim" : "", esc: x.foraEscopo ? "fora do Blocok" : "Blocok", h: somaMap(x.horas), orig: x.origem || "", _est: x.aDefinir };
    });
    a = novaAba(wb, "Cronograma", colsCr, "Cronograma de execução — " + obra, "Dias úteis relativos (dia 0 = início da obra; fim exclusivo) · duração total " + crono.duracaoTotal + " dias · " + crono.equipes + " equipe(s) · tratamento de juntas só depois da laje e da retirada do escoramento");
    var tC = tabela(a.ws, a.r, colsCr, lCr, { filtro: true });
    var colsHs = [{ h: "Função", k: "f", w: 24, al: "left" }, { h: "Horas totais", k: "h", w: 14, fmt: NUM }, { h: "Pico (pessoas/dia)", k: "p", w: 16, fmt: INT }];
    var rH = subtitulo(a.ws, tC.proxima, 3, "Histograma — mão de obra por função (resumo)");
    var lH = Object.keys(hist.porFuncao || {}).map(function (f) { return { f: f, h: hist.porFuncao[f].horas, p: hist.porFuncao[f].picoPessoas }; });
    tabela(a.ws, rH, colsHs, lH, { totais: { f: "TOTAL", h: hist.totalHoras } });

    // ===== PENDÊNCIAS =====
    var pend = [];
    arr(orc.pendencias).forEach(function (p) { pend.push({ tipo: p.tipo === "sem-preco" ? "Sem preço" : p.tipo === "coeficiente" ? "Coeficiente pendente" : p.tipo === "aco" ? "Aço" : p.tipo === "codigo" ? "Código SINAPI" : "Outra", texto: p.texto, quem: "Rogério / fabricante" }); });
    arr(orc.notas).forEach(function (nt) { pend.push({ tipo: "Nota", texto: nt.texto, quem: "Informativo" }); });
    arr(res && res.pendencias).forEach(function (p) { pend.push({ tipo: "Cálculo", texto: p.texto, quem: "Fabricante" }); });
    arr(crono.avisos).forEach(function (t) { pend.push({ tipo: "Prazo", texto: t, quem: "Usuário" }); });
    [["Equipe do fabricante", "O fabricante informa 45 m²/dia por equipe, sem dizer o tamanho da equipe (1 pedreiro + 2 ajudantes é premissa RA).", "Fabricante"],
     ["Argamassa de assentamento", "Traço/produto e consumo por m² não publicados; o volume vem do motor (junta × espessura) e é parâmetro RA (editável).", "Fabricante"],
     ["Esperas do prazo", "Cura do concreto e cura da laje são parâmetros (premissa RA); fundação, laje e acabamento ficam 'a definir'.", "Rogério / obra"]
    ].forEach(function (x) { pend.push({ tipo: x[0], texto: x[1], quem: x[2] }); });
    var colsPe = [{ h: "Tipo", k: "tipo", w: 26, al: "left" }, { h: "Pendência", k: "texto", w: 120, al: "left", wrap: true }, { h: "Quem preenche", k: "quem", w: 22, al: "left" }];
    a = novaAba(wb, "Pendências", colsPe, "Pendências e notas — " + obra, pend.length + " item(ns) · nada aqui foi inventado: o que falta está listado");
    tabela(a.ws, a.r, colsPe, pend, { filtro: true });

    return wb;
  }

  /* ---- gerar + baixar (browser) ---- */
  function gerar(pacote, hooks) {
    hooks = hooks || {};
    var EX = global.ExcelOrc || global.Excel;
    if (!EX || !EX.ensureExcelJS) { if (hooks.erro) hooks.erro("Excel indisponível"); return; }
    EX.ensureExcelJS(function () {
      try {
        Promise.resolve(construir(global.ExcelJS, pacote)).then(function (wb) {
          return wb.xlsx.writeBuffer();
        }).then(function (buf) {
          var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          var url = URL.createObjectURL(blob), el = document.createElement("a");
          el.href = url; el.download = (hooks.nome || "Blocok-executivo") + ".xlsx"; el.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          if (hooks.ok) hooks.ok();
        }).catch(function (e) { if (hooks.erro) hooks.erro(e); });
      } catch (e) { if (hooks.erro) hooks.erro(e); }
    });
  }

  global.BlocokExecXLS = { construir: construir, gerar: gerar };
  if (typeof module !== "undefined" && module.exports) module.exports = global.BlocokExecXLS;
})(typeof self !== "undefined" ? self : this);

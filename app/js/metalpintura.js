/* =====================================================================
 * metalpintura.js — METÁLICA: ÁREA DE PINTURA, PESO e CONSUMO DE TINTA
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 *   calcular(numeracao, cfg)  por peça, por marca e total:
 *     perfil  → m² = perímetro de pintura do perfil (m²/m do catálogo; sem
 *               ele, o perímetro da seção desenhada) × comprimento pelo eixo;
 *     chapa   → m² = área líquida (furos e recortes descontados) × 2 lados
 *               (+ perímetro × espessura quando cfg.bordas);
 *     chapa dobrada → a planificada: Ld × L × 2 lados;
 *     mecânica → a área da superfície (js/metalpeca.js recalc).
 *   Peso = a massa da peça no quantitativo (a MESMA do js/metalfab.js listas
 *   e do içamento: geometria × 7 850 kg/m³).
 *   Tinta por demão (L) = m² × (1 + perda %) ÷ rendimento (m²/L).
 *   linhasOrcamento(r)  as linhas para o orçamento (o mesmo formato do
 *     levantamento do BIM: categoria, unidade, quantidade, fonte) — o
 *     App.criarOrcamentoDoBIM as lança sem inventar preço.
 *   xlsxPintura(r, ExcelJS)   a planilha formatada.
 *
 * ⚠ RENDIMENTO, DEMÃOS e PERDA de aplicação são de PARTIDA (editáveis): o
 *   rendimento real sai da ficha técnica da tinta (sólidos por volume ×
 *   espessura seca) e a perda do método (trincha, rolo, pistola).
 * Teste: node tools/test-metal-pintura.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Peso() { return dep("BimPeso", "./bimpeso.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  function Cat() { return dep("AcoCatalogoInd", "./acocatalogoind.js"); }   /* catálogo industrial (js/acocatalogoind.js): opcional */

  /* ⚠ DEMÃOS: de 1 a 4 (MAX_DEMAOS). `rendimento` é m²/L de cada demão.
   *   perdaModo "acrescimo" (o de sempre): litros = m² × (1 + perda %) ÷ rendimento — a perda é um acréscimo de partida;
   *   perdaModo "transferencia" (sistema do catálogo): rendimento = o TEÓRICO da ficha (SV × 10 ÷ EPS) e
   *     litros = m² ÷ (rendimento × (1 − perda %)) — a perda é a fração da tinta que não chega ao aço (a regra da Hempel
   *     para pistola: 1/3 no ar). Sem `sistema` o modo é sempre "acrescimo": o cálculo antigo não muda.
   * Uma demão pode trazer eps_um e sv_pct em vez de rendimento (rendimento = sv × 10 ÷ eps); sem rendimento nem SV+EPS ela
   * vai para `pendentes` (nunca zero silencioso) — e, com `sistema`, a lista NÃO cai nas demãos de partida. */
  var MAX_DEMAOS = 4;
  var CONFIG = { demaos: [{ nome: "Fundo (primer)", rendimento: 10 }, { nome: "Acabamento", rendimento: 10 }], perda: 0, bordas: false, perdaModo: "acrescimo" };
  function cfgDe(c) {
    c = c || {};
    var pend = [], sistema = c.sistema && typeof c.sistema === "object" ? c.sistema : null;
    var d = [];
    arr(c.demaos).slice(0, MAX_DEMAOS).forEach(function (x, i) {
      x = x || {};
      var o = { nome: txt(x.nome) || "Demão " + (i + 1), rendimento: num(x.rendimento, 0) };
      var eps = num(x.eps_um, null), sv = num(x.sv_pct, null);
      if (eps != null) o.eps_um = eps;
      if (sv != null) o.sv_pct = sv;
      ["ligante", "funcao", "produto"].forEach(function (k) { if (x[k] != null && txt(x[k])) o[k] = txt(x[k]); });
      if (arr(x.svFaixa).length === 2) o.svFaixa = [num(x.svFaixa[0], 0), num(x.svFaixa[1], 0)];
      if (!(o.rendimento > 0) && eps > 0 && sv > 0 && sv <= 100) o.rendimento = sv * 10 / eps;
      if (o.rendimento > 0) d.push(o); else if (sistema) pend.push(o.nome + ": sem rendimento — informe o SV (%) e a EPS (µm) da ficha técnica");
    });
    if (!d.length && !sistema) d = CONFIG.demaos.map(function (x) { return { nome: x.nome, rendimento: x.rendimento }; });
    var modo = sistema && c.perdaModo === "transferencia" ? "transferencia" : "acrescimo";
    var perda = Math.max(0, num(c.perda, CONFIG.perda));
    if (modo === "transferencia") perda = Math.min(perda, 99);
    var cfg = { demaos: d, perda: perda, bordas: !!c.bordas, perdaModo: modo };
    if (sistema) { cfg.sistema = sistema; cfg.pendentes = pend; }
    return cfg;
  }
  /* a área de pintura de UMA peça da fábrica (js/metalfab.js pecasFab) — m² */
  function areaPeca(p, cfg) {
    if (p.kind === "perfil") return { m2: num(p.m2m, 0) * num(p.L, 0) / 1000, fonte: "perímetro de pintura " + br(p.m2m, 3) + " m²/m × " + br(num(p.L, 0) / 1000, 3) + " m" };
    if (p.kind === "chapa") {
      var A = num(p.areaLiq, 0) > 0 ? p.areaLiq : num(p.L, 0) * num(p.B, 0) / 1e6, m2 = 2 * A, f = (p.dobras ? "planificada " : "") + br(A, 4) + " m² × 2 lados";
      if (cfg.bordas) {
        var per = 0, C = arr(p.contorno);
        for (var i = 0; i < C.length; i++) { var a = C[i], b = C[(i + 1) % C.length]; per += Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); }
        m2 += per / 1000 * num(p.t, 0) / 1000; f += " + bordas";
      }
      return { m2: m2, fonte: f };
    }
    return { m2: num(p.area, 0), fonte: "superfície da peça" };
  }
  function pesoKg(p) {
    var PS = Peso();
    if (PS && PS.pesoDe) { var r = PS.pesoDe({ tipo: p.ifc || "IFCPLATE", nome: p.nome, qto: { massa: p.massa } }, {}); if (r && r.ok) return r.kg; }
    return num(p.massa, 0);
  }
  /* "Sa 2½ (base da durabilidade…) - conferir PDS" → "Sa 2½"; "St 3" → "St 3" (o grau da ISO 8501-1 no começo do texto do preparo) */
  function grauDe(t) { var m = /^(Sa ?[0-3](?:½| 1\/2)?|St ?[23])/i.exec(txt(t).trim()); return m ? m[1] : ""; }
  function tipoDe(p) { return p.kind === "perfil" ? "Perfil" : (p.kind === "chapa" ? (p.dobras ? "Chapa dobrada" : "Chapa") : "Mecânica"); }
  /* n = BimMetalFab.numerar(estado) */
  function calcular(n, cfg0) {
    var cfg = cfgDe(cfg0), porPeca = [], porMarca = [], tot = { kg: 0, m2: 0, pecas: 0 }, porTipo = {};
    arr(n && n.grupos).forEach(function (g) {
      var p = g.rep, a = areaPeca(p, cfg), kg = pesoKg(p), q = g.ids.length;
      g.ids.forEach(function (id) { porPeca.push({ id: id, marca: g.marca, kg: r2(kg), m2: r3(a.m2) }); });
      var tp = tipoDe(p);
      porMarca.push({ marca: g.marca, tipo: tp, papel: txt(p.papel), perfil: p.kind === "perfil" ? p.nomePerfil : (p.kind === "chapa" ? "Chapa " + br(p.t, 1) + " mm" : txt(p.tipoMec)), qtd: q,
                      kgUnit: r2(kg), kgTotal: r2(kg * q), m2Unit: r3(a.m2), m2Total: r3(a.m2 * q), m2kg: kg > 0 ? r3(a.m2 / kg * 1000) : 0, fonte: a.fonte });
      tot.kg += kg * q; tot.m2 += a.m2 * q; tot.pecas += q;
      porTipo[tp] = porTipo[tp] || { tipo: tp, kg: 0, m2: 0, pecas: 0 }; porTipo[tp].kg += kg * q; porTipo[tp].m2 += a.m2 * q; porTipo[tp].pecas += q;
    });
    tot.kg = r2(tot.kg); tot.m2 = r3(tot.m2); tot.m2t = tot.kg > 0 ? r2(tot.m2 / tot.kg * 1000) : 0;
    /* litros por demão: "acrescimo" = m² × (1 + perda) ÷ rendimento (o de sempre); "transferencia" = m² ÷ (rendimento × (1 − perda)) */
    var fator = cfg.perdaModo === "transferencia" ? 1 / (1 - cfg.perda / 100) : 1 + cfg.perda / 100;
    var tinta = cfg.demaos.map(function (d, i) {
      var t = { n: i + 1, demao: d.nome, rendimento: d.rendimento, m2: tot.m2, litros: r2(tot.m2 * fator / d.rendimento) };
      ["eps_um", "sv_pct", "ligante", "funcao", "produto"].forEach(function (k) { if (d[k] != null) t[k] = d[k]; });
      if (d.svFaixa && d.sv_pct > 0 && d.eps_um > 0 && d.svFaixa[1] > d.svFaixa[0]) t.litrosFaixa = [r2(tot.m2 * d.eps_um * fator / (d.svFaixa[1] * 10)), r2(tot.m2 * d.eps_um * fator / (d.svFaixa[0] * 10))];   /* mais sólidos = menos litros */
      return t;
    });
    var lt = 0; tinta.forEach(function (t) { lt += t.litros; });
    var res = { porPeca: porPeca, porMarca: porMarca, porTipo: Object.keys(porTipo).sort().map(function (k) { var x = porTipo[k]; x.kg = r2(x.kg); x.m2 = r3(x.m2); return x; }),
                total: tot, tinta: tinta, litros: r2(lt), config: cfg };
    if (cfg.sistema) {   /* o sistema do catálogo: preparo de superfície, EPS e demãos pendentes (sem SV) ficam no resultado */
      var S = cfg.sistema;
      res.sistema = { id: S.id || "", ambiente: S.ambiente || "", durabilidade: S.durabilidade || "", preparo: S.preparo || "", preparoGrau: grauDe(S.preparo), epsTotal_um: S.epsTotal_um == null ? null : S.epsTotal_um,
                      referencia: S.referencia || "", conferir: !!S.conferir, pendencia: S.pendencia || "", fonte: S.fonte || null, viaEquivalencia: S.viaEquivalencia || null };
      res.pendentes = cfg.pendentes || [];
      res.completo = !res.pendentes.length;
      var faixaLo = 0, faixaHi = 0, temFaixa = tinta.length > 0;
      tinta.forEach(function (t) { if (t.litrosFaixa) { faixaLo += t.litrosFaixa[0]; faixaHi += t.litrosFaixa[1]; } else { faixaLo += t.litros; faixaHi += t.litros; } });
      res.litrosFaixa = temFaixa ? [r2(faixaLo), r2(faixaHi)] : null;
    }
    return res;
  }
  /* as linhas do orçamento (formato do levantamento do BIM, js/bimqto.js paraOrcamento) */
  function linhasOrcamento(r) {
    var S = r.sistema, L = [{ categoria: "Estrutura metálica — fornecimento e fabricação de aço (peças do modelo)", unidade: "kg", quantidade: r.total.kg, fonte: "ifc" }];
    if (S) {   /* com o sistema do catálogo: o preparo de superfície, a pintura do sistema (ambiente, durabilidade, EPS) e a tinta por demão com a EPS */
      if (S.preparoGrau) L.push({ categoria: "Preparo de superfície de aço — grau " + S.preparoGrau + " (ISO 8501-1) — área a preparar", unidade: "m²", quantidade: r2(r.total.m2), fonte: "ifc" });
      L.push({ categoria: "Pintura anticorrosiva — sistema " + S.id + " (ambiente " + S.ambiente + ", durabilidade " + S.durabilidade + ", " + r.tinta.length + " demão" + (r.tinta.length > 1 ? "s" : "") + (S.epsTotal_um != null ? ", EPS total " + br(S.epsTotal_um, 0) + " µm" : "") + ") — área a pintar", unidade: "m²", quantidade: r2(r.total.m2), fonte: "ifc" });
    } else L.push({ categoria: "Pintura de estrutura metálica — área a pintar (" + r.tinta.length + " demão" + (r.tinta.length > 1 ? "s" : "") + ")", unidade: "m²", quantidade: r2(r.total.m2), fonte: "ifc" });
    r.tinta.forEach(function (t) {
      var perdaTxt = r.config.perda ? ", perda " + br(r.config.perda, 0) + " %" : "";
      var txtL = S ? "Tinta — " + (t.funcao ? t.funcao + ": " : "") + (t.ligante || t.demao) + (t.eps_um != null ? ", " + br(t.eps_um, 0) + " µm secos" : "") + (t.sv_pct != null ? ", SV " + br(t.sv_pct, 1) + " %" : "") + perdaTxt
        : "Tinta — " + t.demao + " (rendimento " + br(t.rendimento, 1) + " m²/L" + perdaTxt + ")";
      L.push({ categoria: txtL, unidade: "L", quantidade: t.litros, fonte: "estimado" });
    });
    return { linhas: L.map(function (l) { l.nElementos = r.total.pecas; l.medida = "metalica"; return l; }), resumo: { nElementos: r.total.pecas, nEstimados: r.tinta.length } };
  }

  /* ============================================================ QUANTITATIVO DE PINTURA DO MODELO
   * quantitativo(n, op): a partir das peças metálicas do modelo (n = BimMetalFab.numerar(estado); a área de pintura é a que a
   * fabricação já calcula — perímetro do perfil × comprimento, chapas dos dois lados, bordas se op.bordas) e do SISTEMA de pintura
   * do catálogo industrial por ambiente (ISO 12944-2) e durabilidade, devolve:
   *   area_m2, kg, preparo { grau, texto, area_m2 }, demaos [{ funcao, ligante, produtoExemplo, eps_um, sv_pct, litros, litrosFaixa }],
   *   litrosTotal, e as LINHAS PRONTAS PARA O ORÇAMENTO — `linhas` [{ descricao, unidade, quantidade }] e `orcamento` (o mesmo, no
   *   formato do levantamento do BIM). SEM preço e SEM código SINAPI: a pessoa vincula a composição depois.
   * op: { ambiente, durabilidade, substrato } ou { sistema: id|objeto }; { perdaPct | metodo, geometria }, { sv: {índice: %} }, { bordas }.
   * Consumo = o do catálogo (consumoTinta): rendimento teórico = SV × 10 ÷ EPS; litros = m² ÷ rendimento ÷ (1 − perda). A perda é declarada
   * em perdaOrigem; demão sem SV vai em `pendentes` e fica FORA das linhas (nunca zero silencioso). */
  function quantitativo(n, op) {
    op = op || {};
    var CI = Cat();
    if (!CI || !CI.sistemaPintura || !CI.consumoTinta) return { ok: false, erro: "O catálogo industrial não carregou (js/acocatalogoind.js): sem ele não há sistema de pintura por ambiente." };
    var s = op.sistema != null ? (typeof op.sistema === "string" ? CI.sistemaPorId(op.sistema) : op.sistema) : CI.sistemaPintura(op.ambiente, op.durabilidade, { substrato: op.substrato });
    if (!s) return { ok: false, erro: "Não há sistema de pintura com fonte para " + (op.sistema != null ? "\"" + txt(op.sistema && op.sistema.id || op.sistema) + "\"" : "ambiente " + txt(op.ambiente) + " e durabilidade " + txt(op.durabilidade)) + " neste catálogo — consulte o fabricante da tinta (ISO 12944-5)." };
    var base = calcular(n, { bordas: !!op.bordas });
    if (!(base.total.m2 > 0)) return { ok: false, erro: "Não há peça de aço no modelo (área de pintura zero)." };
    var cons = CI.consumoTinta(base.total.m2, s, { perdaPct: op.perdaPct, metodo: op.metodo, geometria: op.geometria, sv: op.sv, eps: op.eps });
    if (!cons.ok) return { ok: false, erro: cons.erro };
    var grau = grauDe(s.preparo), prep = grau && CI.preparo ? CI.preparo(grau) : null, A = r2(base.total.m2);
    var demaos = cons.demaos.map(function (d, i) {
      var sd = arr(s.demaos)[i] || {};
      return { ordem: d.ordem, funcao: d.funcao, ligante: d.ligante, produtoExemplo: sd.produto || null, eps_um: d.eps_um, sv_pct: d.sv_pct, svOrigem: d.svOrigem, svFaixa: d.svFaixa || null,
               rendTeoricoM2L: d.rendTeoricoM2L == null ? null : r3(d.rendTeoricoM2L), litros: d.litros == null ? null : r2(d.litros), litrosFaixa: d.litrosFaixa ? [r2(d.litrosFaixa[0]), r2(d.litrosFaixa[1])] : null,
               pendente: !!d.pendente, motivo: d.motivo || null };
    });
    var q = { ok: true, sistema: { id: s.id, ambiente: s.ambiente, durabilidade: s.durabilidade, preparo: s.preparo || "", epsTotal_um: s.epsTotal_um == null ? null : s.epsTotal_um, referencia: s.referencia || "",
                                   conferir: !!s.conferir, pendencia: s.pendencia || "", viaEquivalencia: s.viaEquivalencia || null, alternativas: arr(s.alternativas) },
              area_m2: A, kg: base.total.kg, pecas: base.total.pecas, perdaPct: cons.perdaPct, perdaOrigem: cons.perdaOrigem,
              preparo: { grau: grau, texto: s.preparo || "", descricao: prep ? txt(prep.descricao) : "", sspc: prep ? prep.sspc || null : null, nace: prep ? prep.nace || null : null, nbr: prep ? prep.nbr || null : null, area_m2: grau ? A : 0 },
              demaos: demaos, litrosTotal: r2(cons.litrosTotal), litrosFaixa: cons.completo && cons.litrosFaixa ? [r2(cons.litrosFaixa[0]), r2(cons.litrosFaixa[1])] : null,
              completo: cons.completo, pendentes: cons.pendentes, avisos: cons.avisos };
    var L = [];
    if (grau) L.push({ descricao: "Preparo de superfície de aço — grau " + grau + " (ISO 8501-1) — área a preparar", unidade: "m²", quantidade: A });
    L.push({ descricao: "Pintura anticorrosiva — sistema " + s.id + " (ambiente " + s.ambiente + ", durabilidade " + s.durabilidade + ", " + demaos.length + " demão" + (demaos.length > 1 ? "s" : "") + (s.epsTotal_um != null ? ", EPS total " + br(s.epsTotal_um, 0) + " µm" : "") + ") — área a pintar", unidade: "m²", quantidade: A });
    demaos.forEach(function (d) {
      if (d.litros == null) return;
      L.push({ descricao: "Tinta — " + (d.funcao ? d.funcao + ": " : "") + (d.ligante || "demão " + d.ordem) + (d.eps_um != null ? ", " + br(d.eps_um, 0) + " µm secos" : "") + (d.sv_pct != null ? ", SV " + br(d.sv_pct, 1) + " %" : "") + (cons.perdaPct ? ", perda " + br(cons.perdaPct, 0) + " %" : ""), unidade: "L", quantidade: d.litros });
    });
    q.linhas = L;
    q.orcamento = { linhas: L.map(function (l) { return { categoria: l.descricao, unidade: l.unidade, quantidade: l.quantidade, fonte: l.unidade === "L" ? "estimado" : "ifc", nElementos: q.pecas, medida: "metalica" }; }), resumo: { nElementos: q.pecas, nEstimados: demaos.filter(function (d) { return d.litros != null; }).length } };
    return q;
  }
  /* o mesmo, direto do estado do editor do BIM (as peças metálicas do modelo) */
  function quantitativoDoModelo(estado, op) {
    var F = dep("BimMetalFab", "./metalfab.js");
    if (!F || !F.numerar) return { ok: false, erro: "A numeração das peças metálicas não carregou (js/metalfab.js)." };
    return quantitativo(F.numerar(estado), op);
  }
  function xlsxPintura(r, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var AZUL = "FF00406A";
    function aba(nome, tit, cols, linhas, tot) {
      var ws = wb.addWorksheet(nome, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
      ws.mergeCells(1, 1, 1, cols.length); ws.getCell(1, 1).value = tit; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
      ws.mergeCells(2, 1, 2, cols.length); ws.getCell(2, 1).value = (info.obra ? info.obra + " · " : "") + "Peso = massa das peças do modelo (7 850 kg/m³). Rendimento, demãos e perda: valores de partida."; ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF555555" } };
      var cab = ws.getRow(4);
      cols.forEach(function (c, i) { cab.getCell(i + 1).value = c[1]; ws.getColumn(i + 1).width = c[2] || 14; cab.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
      cab.font = { bold: true, color: { argb: "FFFFFFFF" } }; cab.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cab.height = 30;
      linhas.concat(tot ? [tot] : []).forEach(function (l, k) {
        var row = ws.getRow(5 + k);
        cols.forEach(function (c, i) { var v = l[c[0]]; row.getCell(i + 1).value = v == null ? "" : v; if (c[3]) row.getCell(i + 1).numFmt = c[3]; row.getCell(i + 1).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; });
        if (tot && k === linhas.length) { row.font = { bold: true }; cols.forEach(function (c, i) { row.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE5EE" } }; }); }
      });
      ws.views = [{ state: "frozen", ySplit: 4 }];
      return ws;
    }
    aba("Por marca", "Área de pintura e peso por marca", [["marca", "Marca", 9], ["tipo", "Tipo", 14], ["papel", "Função", 22], ["perfil", "Perfil / chapa", 20], ["qtd", "Qtd", 7, "0"], ["kgUnit", "Peso unit. (kg)", 13, "#,##0.00"], ["kgTotal", "Peso total (kg)", 13, "#,##0.00"],
      ["m2Unit", "Pintura unit. (m²)", 14, "#,##0.000"], ["m2Total", "Pintura total (m²)", 14, "#,##0.000"], ["m2kg", "m² por tonelada", 13, "#,##0.0"], ["fonte", "Como foi medido", 42]], r.porMarca, { marca: "TOTAL", qtd: r.total.pecas, kgTotal: r.total.kg, m2Total: r.total.m2, m2kg: r.total.m2t });
    aba("Por peça", "Área de pintura e peso por peça", [["id", "Peça (id)", 26], ["marca", "Marca", 9], ["kg", "Peso (kg)", 12, "#,##0.00"], ["m2", "Pintura (m²)", 12, "#,##0.000"]], r.porPeca, { id: "TOTAL", kg: r.total.kg, m2: r.total.m2 });
    var S = r.sistema, colsT = [["n", "Demão", 8, "0"], ["demao", "Produto", 26]];
    if (S) colsT = colsT.concat([["eps_um", "EPS seca (µm)", 13, "0"], ["sv_pct", "SV (%)", 9, "0.0"]]);
    colsT = colsT.concat([["m2", "Área (m²)", 12, "#,##0.000"], ["rendimento", "Rendimento (m²/L)", 16, "#,##0.0"], ["litros", "Consumo (L)", 12, "#,##0.00"]]);
    var wsT = aba("Tinta", S ? "Consumo estimado de tinta — sistema " + S.id : "Consumo estimado de tinta", colsT, r.tinta,
      { demao: "TOTAL" + (r.config.perda ? " (perda " + br(r.config.perda, 0) + " % incluída)" : ""), litros: r.litros });
    if (S) {   /* o sistema, o preparo e a conta, escritos embaixo da tabela */
      var base = 7 + r.tinta.length, notas = [
        "Sistema " + S.id + " — ambiente " + S.ambiente + ", durabilidade " + S.durabilidade + (S.epsTotal_um != null ? ", EPS total " + br(S.epsTotal_um, 0) + " µm" : "") + (S.referencia ? " — " + S.referencia : "") + (S.conferir ? " (CONFERIR: " + (S.pendencia || "ver a fonte") + ")" : ""),
        "Preparo de superfície: " + (S.preparo || "conforme a ficha técnica do primer") + (S.preparoGrau ? " (grau " + S.preparoGrau + ", ISO 8501-1) — " + br(r.total.m2, 2) + " m²" : ""),
        "Rendimento teórico = SV (%) × 10 ÷ EPS (µm); litros = área ÷ rendimento ÷ (1 − perda) — perda de " + br(r.config.perda, 0) + " % = fração da tinta que não chega ao aço.",
        "Estimativa de ficha técnica: conferir o SV e a EPS do produto escolhido." + (r.pendentes && r.pendentes.length ? " Demãos sem SV (fora da soma): " + r.pendentes.join("; ") : "")];
      notas.forEach(function (t, i) { var c = wsT.getCell(base + i, 1); c.value = t; c.font = { size: 9, italic: i > 1, color: { argb: "FF444444" } }; });
    }
    return wb;
  }

  var BimMetalPintura = { CONFIG: CONFIG, MAX_DEMAOS: MAX_DEMAOS, cfgDe: cfgDe, areaPeca: areaPeca, calcular: calcular, linhasOrcamento: linhasOrcamento, quantitativo: quantitativo, quantitativoDoModelo: quantitativoDoModelo, grauDe: grauDe, xlsxPintura: xlsxPintura };
  global.BimMetalPintura = BimMetalPintura;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalPintura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

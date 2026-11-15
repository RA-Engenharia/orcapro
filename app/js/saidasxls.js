/* =====================================================================
 * saidasxls.js — A PLANILHA POR PERFIL (14/11/2026, prévia ?previa=motor)
 *
 * O Excel de sempre tem uma cara só. Aqui cada tipo de orçamento (js/saidas.js) ganha a planilha que ele pede:
 *   prefeitura  base do pacote de referência (js/orcrefxls.js: sintética, analítica, BDI, encargos, ABC, memória, cotações,
 *               fórmulas vivas) vestida de forma SÓBRIA (preto/cinza, Arial), cronograma OFICIAL com a assinatura do RT, total por extenso;
 *   edital      a de prefeitura + aba Carta-proposta na frente + validade/prazo no cabeçalho + aba Conferência (preço global × teto,
 *               itens obrigatórios, regra de arredondamento escolhida na própria planilha);
 *   residencial limpa, com o logo e as cores da empresa: resumo por etapa com barras, itens por etapa, pagamento, incluso/excluso;
 *   comercial   a residencial + custo por m² + Gantt;   industrial  técnica: critério de medição, mob/desmob, equipamentos, segurança, Gantt;
 *   condomínio  rateio por unidade, comparativo de opções, desembolso mensal;   reforma  itens avulsos, imprevistos destacados, opcionais.
 *
 * ⚠ NÃO CALCULA PREÇO. Os valores vêm de `dados` (OrcamentoReferencia.montar), que já fechou com o orçamento ao centavo; aqui só
 *   se reparte (centavos alocados, o último fecha) e se escreve. O cronograma vem de js/cronoestilo.js (que usa js/cronograma.js).
 * ⚠ NADA É INVENTADO: o que o orçamento não traz (área, teto do edital, unidades do condomínio, % de imprevistos, equipamentos) vira
 *   CÉLULA AMARELA a preencher, e a fórmula ao lado mostra "informe …" até a pessoa preencher.
 * ⚠ O GRÁFICO do resumo por etapa é a barra de dados do próprio Excel (formatação condicional): a biblioteca de planilha do
 *   sistema não grava gráfico. A barra acompanha o valor se a pessoa editar.
 * ⚠ Abas desligadas no modelo (`secoes[id] === false`) não saem. Sem escolha, vale o que o perfil liga.
 * Recebe o ExcelJS por parâmetro (testável em Node). ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ESTÉTICA POR PERFIL — dados, não código. cab = faixa de cabeçalho; zebra; fonte; logo = coloca o logo da empresa. */
  var ESTETICA = {
    prefeitura: { fonte: "Arial", cab: "FF262626", acento: "FF595959", faixa: "FFD9D9D9", zebra: "FFF2F2F2", borda: "FFA6A6A6", aba: "FF7F7F7F", logo: false, sobrio: true },
    edital: { fonte: "Arial", cab: "FF262626", acento: "FF595959", faixa: "FFD9D9D9", zebra: "FFF2F2F2", borda: "FFA6A6A6", aba: "FF7F7F7F", logo: false, sobrio: true },
    residencial: { fonte: "Calibri", cab: "FF0F2740", acento: "FF1858A8", faixa: "FFE2E8F0", zebra: "FFF8FAFC", borda: "FFCBD5E1", aba: "FF1858A8", logo: true, empresa: true },
    comercial: { fonte: "Calibri", cab: "FF1F2937", acento: "FF0E7490", faixa: "FFE2E8F0", zebra: "FFF8FAFC", borda: "FFCBD5E1", aba: "FF0E7490", logo: true, empresa: true },
    industrial: { fonte: "Arial", cab: "FF1F3864", acento: "FFC55A11", faixa: "FFD6DCE5", zebra: "FFF2F2F2", borda: "FFADB9CA", aba: "FFC55A11", logo: true, empresa: true },
    condominio: { fonte: "Calibri", cab: "FF14532D", acento: "FF15803D", faixa: "FFDCFCE7", zebra: "FFF7FEF9", borda: "FFBBF7D0", aba: "FF15803D", logo: true, empresa: true },
    reforma: { fonte: "Calibri", cab: "FF7C2D12", acento: "FFC2410C", faixa: "FFFFEDD5", zebra: "FFFFFAF5", borda: "FFFED7AA", aba: "FFC2410C", logo: true, empresa: true }
  };
  var AMARELO = "FFFFF2CC", VERM = "FFC00000", BRANCO = "FFFFFFFF";
  var MOEDA = '"R$" #,##0.00', PCT = '0.00"%"', NUM = "#,##0.00";

  function s(v) { return String(v == null ? "" : v); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function arr2(v) { return Math.round(num(v) * 100 + (v < 0 ? -1e-9 : 1e-9)) / 100; }
  function nomeAba(n) { return s(n).replace(/[:\\\/?*\[\]]/g, "-").slice(0, 31); }
  function colL(n) { var r = ""; while (n > 0) { var q = (n - 1) % 26; r = String.fromCharCode(65 + q) + r; n = Math.floor((n - 1) / 26); } return r; }
  function dep(nome) {
    if (global[nome]) return global[nome];
    var arq = { OrcamentoReferencia: "orcref", OrcamentoReferenciaXls: "orcrefxls", CronoEstilo: "cronoestilo", Saidas: "saidas" }[nome];
    try { if (typeof require === "function" && arq) return require("./" + arq + ".js"); } catch (e) { /* módulo ausente */ }
    return null;
  }
  function hex8(c) { c = s(c).replace("#", "").toUpperCase(); return /^[0-9A-F]{6}$/.test(c) ? "FF" + c : ""; }

  /* ---------------------------------------------------------------------
   * VALOR POR EXTENSO (R$) — "mil e cem reais", "dois milhões de reais e cinquenta centavos"
   * --------------------------------------------------------------------- */
  var U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  var DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  var CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  function ate999(n) {
    if (n === 100) return "cem";
    var c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(CT[c]);
    if (r) { if (r < 20) p.push(U[r]); else { var d = Math.floor(r / 10), u = r % 10; p.push(DZ[d] + (u ? " e " + U[u] : "")); } }
    return p.join(" e ");
  }
  function inteiroExtenso(n) {
    if (n === 0) return "zero";
    var grupos = [], esc = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]], i = 0, x = n;
    while (x > 0 && i < 4) { grupos.push(x % 1000); x = Math.floor(x / 1000); i++; }
    var out = [];
    for (var k = grupos.length - 1; k >= 0; k--) {
      var g = grupos[k]; if (!g) continue;
      var t = k === 1 ? (g === 1 ? "mil" : ate999(g) + " mil") : (k === 0 ? ate999(g) : ate999(g) + " " + (g === 1 ? esc[k][0] : esc[k][1]));
      out.push({ t: t, g: g, k: k });
    }
    var txt = "";
    out.forEach(function (o, ix) {
      if (ix === 0) { txt = o.t; return; }
      /* "e" antes do último grupo quando ele é menor que 100 ou centena redonda; vírgula-espaço entre milhões e milhar */
      var ultimo = ix === out.length - 1;
      txt += (ultimo && (o.g < 100 || o.g % 100 === 0) ? " e " : " ") + o.t;
    });
    return txt;
  }
  function extenso(valor) {
    var v = Math.round(num(valor) * 100), reais = Math.floor(v / 100), cent = v % 100, partes = [];
    if (reais > 0) partes.push(inteiroExtenso(reais) + (reais % 1000000 === 0 ? " de reais" : (reais === 1 ? " real" : " reais")));
    if (cent > 0) partes.push(inteiroExtenso(cent) + (cent === 1 ? " centavo" : " centavos"));
    if (!partes.length) return "zero real";
    return partes.join(" e ");
  }

  /* ---------------------------------------------------------------------
   * AJUDANTES DE ESCRITA, ligados a uma estética
   * --------------------------------------------------------------------- */
  function kit(est) {
    var K = {};
    function fillS(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; }
    K.fillS = fillS;
    K.borda = function () { var b = { style: "thin", color: { argb: est.borda } }; return { top: b, left: b, bottom: b, right: b }; };
    K.put = function (ws, r, c, v, o) {
      o = o || {};
      var ce = ws.getCell(r, c); if (v !== undefined) ce.value = v;
      ce.font = { name: est.fonte, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: o.cor ? { argb: o.cor } : undefined };
      if (o.fmt) ce.numFmt = o.fmt;
      if (o.fill) ce.fill = fillS(o.fill);
      if (o.borda !== false) ce.border = K.borda();
      if (o.al || o.wrap) ce.alignment = { horizontal: o.al, vertical: o.wrap ? "top" : "middle", wrapText: !!o.wrap };
      if (o.livre) ce.protection = { locked: false };
      return ce;
    };
    K.head = function (ws, r, titulos, c0) {
      titulos.forEach(function (t, i) { K.put(ws, r, (c0 || 1) + i, t, { bold: true, fill: est.cab, cor: BRANCO, al: "center", size: 9, wrap: false }).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
      ws.getRow(r).height = 26;
    };
    K.faixa = function (ws, r, n, texto, cor) {
      ws.mergeCells(r, 1, r, n); K.put(ws, r, 1, texto, { bold: true, fill: cor || est.acento, cor: BRANCO });
    };
    K.largs = function (ws, ls) { ls.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); };
    K.entrada = function (ws, r, c, v, fmt) { return K.put(ws, r, c, v, { fill: AMARELO, fmt: fmt, livre: true }); };
    return K;
  }

  /* "Cidade/MG" + UF "MG" não vira "Cidade/MG/MG" */
  function localUf(d) {
    var l = s(d.cab.local) || "[PREENCHER: local]", uf = s(d.cab.uf);
    var m = l.replace(/\s+$/, ""), termina = uf && m.slice(-uf.length).toUpperCase() === uf.toUpperCase() && /[\/-]\s*$/.test(m.slice(0, m.length - uf.length));
    return uf && !termina ? l + "/" + uf : l;
  }

  /* cabeçalho comum das abas novas: logo (opcional), empresa, título, obra. Devolve a próxima linha livre. */
  function cabecalho(wb, ws, K, est, d, ctx, titulo, ncol) {
    var emp = (ctx && ctx.empresa) || d.emp || {}, r = 1;
    ws.mergeCells(r, 1, r, ncol); K.put(ws, r, 1, s(emp.nome) || "[EMPRESA]", { bold: true, size: 13, cor: est.cab, borda: false });
    if (est.logo && ctx && ctx.logo && /^data:image\/(png|jpeg);base64,/.test(ctx.logo)) {
      try {
        var id = wb.addImage({ base64: ctx.logo, extension: /jpeg/.test(ctx.logo.slice(0, 20)) ? "jpeg" : "png" });
        ws.addImage(id, { tl: { col: Math.max(0, ncol - 1.6), row: 0 }, ext: { width: 90, height: 40 } });
      } catch (e) { /* logo inválido: a planilha sai sem ele */ }
    }
    ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, ncol); K.put(ws, 2, 1, titulo, { bold: true, size: 12, borda: false });
    ws.mergeCells(3, 1, 3, ncol);
    K.put(ws, 3, 1, "Obra: " + (d.cab.obra || "[PREENCHER: obra]") + "  ·  Local: " + localUf(d) + "  ·  Orçamento " + s(d.cab.numero), { size: 9, cor: "FF475569", borda: false });
    ws.mergeCells(4, 1, 4, ncol); K.put(ws, 4, 1, "", { borda: false, size: 4 });
    var ln = ws.getRow(4); ln.height = 4;
    for (var c = 1; c <= ncol; c++) ws.getCell(4, c).fill = K.fillS(est.acento);
    return 6;
  }

  /* ---------------------------------------------------------------------
   * PREÇOS COM BDI EMBUTIDO — o preço de cada etapa e item já com o BDI, fechando ao centavo com o total
   * (a mesma alocação por centavos do pacote de referência). Com BDI no preço unitário, é o que `dados` já traz.
   * --------------------------------------------------------------------- */
  function alocar(valores, total) {
    var OR = dep("OrcamentoReferencia");
    if (OR && OR.alocarCentavos) return OR.alocarCentavos(valores, total);
    var soma = valores.reduce(function (a, b) { return a + b; }, 0), out = [], ac = 0;
    valores.forEach(function (v, i) { var x = i === valores.length - 1 ? arr2(total - ac) : arr2(soma > 0 ? total * v / soma : 0); out.push(x); ac = arr2(ac + x); });
    return out;
  }
  function precos(d) {
    var etapas = [];
    if (d.bdiNoPU) {
      d.etapas.forEach(function (E) { etapas.push({ idx: E.idx, numero: E.numero, nome: E.nome, opcional: E.opcional, preco: E.total, itens: E.itens.map(function (I) { return { numero: I.numero, codigo: I.codigo, fonte: I.fonte, descricao: I.descricao, unidade: I.unidade, quantidade: I.quantidade, pu: I.pu, total: I.pt, opcional: I.opcional, id: I.id }; }) }); });
    } else {
      var pe = alocar(d.etapas.map(function (E) { return E.custo; }), d.tot.precoVenda);
      d.etapas.forEach(function (E, k) {
        var pi = alocar(E.itens.map(function (I) { return I.ct; }), pe[k]);
        etapas.push({ idx: E.idx, numero: E.numero, nome: E.nome, opcional: E.opcional, preco: pe[k], itens: E.itens.map(function (I, j) { return { numero: I.numero, codigo: I.codigo, fonte: I.fonte, descricao: I.descricao, unidade: I.unidade, quantidade: I.quantidade, pu: I.quantidade > 0 ? arr2(pi[j] / I.quantidade) : 0, total: pi[j], opcional: I.opcional, id: I.id }; }) });
      });
    }
    return etapas;
  }

  /* modelo de cronograma para o perfil (CronoEstilo + js/cronograma.js). { m, estilo } ou { erro } */
  function cronoDe(d, ctx, estiloPadrao) {
    var CE = dep("CronoEstilo"), estilo = (ctx && ctx.estiloCronograma) || estiloPadrao;
    if (!CE || !CE.estiloValido(estilo)) return { erro: "Estilo de cronograma desconhecido." };
    if (!ctx || !ctx.orc) return { erro: "O orçamento não foi passado ao gerador de cronograma." };
    var valores = []; d.etapas.forEach(function (E) { valores[E.idx] = E.total; });
    var m = CE.modelo(ctx.orc, { atividades: estilo === "gantt", hoje: ctx.hoje, avanco: ctx.avanco, valores: valores.some(function (v) { return v == null; }) ? undefined : valores });
    if (!m.ok) return { erro: m.erro };
    return { m: m, estilo: estilo };
  }

  function ligada(perfil, ctx, id) {
    var Sd = dep("Saidas"), p = Sd ? Sd.perfil(perfil) : null;
    if (ctx && ctx.secoes && ctx.secoes[id] === false) return false;
    if (ctx && ctx.ligadas && ctx.ligadas[id] !== undefined) return ctx.ligadas[id] === true;
    return !!(p && p.secoes.indexOf(id) >= 0);
  }

  function textoPerfil(perfil, ctx, id) {
    var Sd = dep("Saidas"), p = Sd ? Sd.perfil(perfil) : null, t = ctx && ctx.textos && ctx.textos[id];
    if (t != null && t !== "") return s(t);
    if (p) for (var i = 0; i < p.parametros.length; i++) if (p.parametros[i].id === id) return p.parametros[i].padrao;
    return "";
  }
  /* troca {chave} pelos dados do orçamento; o que não tem valor fica {chave} à vista (pendência, não texto inventado) */
  function preencher(texto, mapa) {
    return s(texto).replace(/\{([^}]+)\}/g, function (m0, k) { return mapa && mapa[k] != null && mapa[k] !== "" ? s(mapa[k]) : "[a informar: " + k + "]"; });
  }
  function mapaTexto(d, ctx) {
    var rt = d.rt || {};
    return { "data-base": d.cab.dataBase, regime: d.cab.regime, prazo: ctx && ctx.prazoTexto, validade: ctx && ctx.validadeDias, representante: ctx && ctx.representante, "criterio-arredondamento": d.cab.arredondamento,
      "dias-pagamento": ctx && ctx.diasPagamento, "garantia-solidez": ctx && ctx.garantiaSolidez, "garantia-acabamentos": ctx && ctx.garantiaAcabamentos, horario: ctx && ctx.horario, antecedencia: ctx && ctx.antecedencia,
      "criterio-rateio": ctx && ctx.rateio && (ctx.rateio.criterio === "igual" ? "partes iguais entre as unidades" : "fração ideal"), "data-visita": ctx && ctx.dataVisita, "rt.nome": rt.nome };
  }

  /* ============================ PREFEITURA / EDITAL ============================ */
  function sobrio(wb, est) {
    var MAPA = { "FF0F2740": est.cab, "FF1858A8": est.acento, "FFF1F5F9": est.zebra, "FFE2E8F0": est.faixa, "FFCBD5E1": est.borda };
    wb.eachSheet(function (ws) {
      if (ws.properties && ws.properties.tabColor && ws.properties.tabColor.argb !== VERM) ws.properties.tabColor = { argb: est.aba };
      ws.eachRow({ includeEmpty: false }, function (row) {
        row.eachCell({ includeEmpty: false }, function (c) {
          var f = c.font || {}; c.font = Object.assign({}, f, { name: est.fonte });
          if (c.fill && c.fill.fgColor && MAPA[c.fill.fgColor.argb]) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAPA[c.fill.fgColor.argb] } };
          if (c.font.color && MAPA[c.font.color.argb]) c.font = Object.assign({}, c.font, { color: { argb: MAPA[c.font.color.argb] } });
          if (c.border) { var b = {}; ["top", "left", "bottom", "right"].forEach(function (k) { var x = c.border[k]; if (x) b[k] = { style: x.style, color: { argb: x.color && MAPA[x.color.argb] ? MAPA[x.color.argb] : (x.color && x.color.argb) || est.borda } }; }); c.border = b; }
        });
      });
    });
  }

  function acharLinhaTotal(wr) {   /* a linha "TOTAL GERAL" da aba Resumo do pacote de referência */
    var achou = 0; wr.eachRow(function (row, rn) { if (s(row.getCell(1).value) === "TOTAL GERAL") achou = rn; });
    return achou;
  }
  function trocarCronograma(wb, d, ctx, K, est, perfil) {
    var vel = wb.getWorksheet("Cronograma"); if (!vel) return { aviso: "" };
    var cr = cronoDe(d, ctx, "oficial");
    if (cr.erro) return { aviso: cr.erro };
    var ord = vel.orderNo; wb.removeWorksheet(vel.id);
    var ws = wb.addWorksheet("Cronograma", { properties: { tabColor: { argb: est.aba } } });
    ws.orderNo = ord;
    var CE = dep("CronoEstilo"), rt = d.rt || {};
    var ref = CE.xlsx(ws, cr.m, cr.estilo, { fonte: est.fonte, cabCor: est.cab, corBarra: "#595959", hoje: ctx && ctx.hoje, titulo: "Cronograma " + (cr.estilo === "oficial" ? "físico-financeiro" : cr.estilo) + " — " + (d.cab.obra || ""), rt: { nome: rt.nome, registro: rt.registro, art: d.art && d.art.numero, tipoArt: d.art && d.art.tipo } });
    return { ws: ws, m: cr.m, estilo: cr.estilo, ref: ref };
  }

  function construirOficial(ExcelJS, perfil, d, ctx) {
    var XLS = dep("OrcamentoReferenciaXls"), est = ESTETICA[perfil], K = kit(est), secoes = {};
    ["bdi", "encargos", "curvaAbc", "cronograma", "memoriaCalculo", "cotacoes", "declaracoes", "pendencias"].forEach(function (id) { if (!ligada(perfil, ctx, id)) secoes[id] = false; });
    var wb = XLS.construir(ExcelJS, d, secoes), wr = wb.getWorksheet("Resumo"), out = { wb: wb };
    var rTot = acharLinhaTotal(wr);
    /* total por extenso (e, no edital, validade e prazo no cabeçalho do Resumo) */
    var rx = wr.rowCount + 2;
    var tot = d.bdiNoPU ? d.tot.precoVenda : d.tot.precoVenda;
    wr.getCell(rx, 1).value = "Valor total por extenso"; wr.getCell(rx, 1).font = { bold: true };
    wr.mergeCells(rx, 2, rx, 2); wr.getCell(rx, 2).value = extenso(tot); wr.getCell(rx, 2).alignment = { wrapText: true, vertical: "top" }; wr.getRow(rx).height = 30;
    out.extenso = extenso(tot); out.linhaTotal = rTot;
    if (perfil === "edital") {
      var vd = ctx && ctx.validadeDias, pz = ctx && ctx.prazoTexto, r2 = rx + 1;
      wr.getCell(r2, 1).value = "Validade da proposta"; wr.getCell(r2, 1).font = { bold: true }; wr.getCell(r2, 2).value = vd ? vd + " dias" : "{validade}";
      wr.getCell(r2 + 1, 1).value = "Prazo de execução"; wr.getCell(r2 + 1, 1).font = { bold: true }; wr.getCell(r2 + 1, 2).value = pz || "{prazo}";
    }
    var tr = ligada(perfil, ctx, "cronograma") ? trocarCronograma(wb, d, ctx, K, est, perfil) : { aviso: "" };
    out.cronograma = tr; out.aviso = tr.aviso;
    if (est.sobrio) sobrio(wb, est);
    if (perfil === "edital") {
      if (ligada(perfil, ctx, "carta")) cartaProposta(wb, d, ctx, K, est, perfil, out);
      if (ligada(perfil, ctx, "conferencia")) conferencia(wb, d, ctx, K, est, perfil, out);
    }
    return out;
  }

  function cartaProposta(wb, d, ctx, K, est, perfil, out) {
    var ws = wb.addWorksheet("Carta-proposta", { properties: { tabColor: { argb: est.aba } } }), emp = (ctx && ctx.empresa) || d.emp || {};
    ws.orderNo = -1;   /* primeira aba */
    K.largs(ws, [26, 80]);
    var r = 1;
    ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, s(emp.nome) || "[EMPRESA]", { bold: true, size: 13, borda: false }); r++;
    ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, "CARTA-PROPOSTA", { bold: true, size: 12, borda: false }); r += 2;
    var linhas = [["À", d.cab.orgao || "[PREENCHER: órgão]"], ["Processo", d.cab.processo || "—"], ["Objeto", d.cab.objeto || "[PREENCHER: objeto]"]];
    linhas.forEach(function (x) { K.put(ws, r, 1, x[0], { bold: true, fill: est.faixa }); K.put(ws, r, 2, x[1], { wrap: true }); r++; });
    r++;
    var mapa = mapaTexto(d, ctx);
    ws.mergeCells(r, 1, r, 2);
    K.put(ws, r, 1, "Apresentamos nossa proposta para execução do objeto acima, pelo valor global de:", { borda: false, wrap: true }); ws.getRow(r).height = 30; r++;
    K.put(ws, r, 1, "Valor global", { bold: true, fill: est.faixa });
    K.put(ws, r, 2, { formula: "Resumo!B" + out.linhaTotal, result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, al: "left" }); r++;
    K.put(ws, r, 1, "Por extenso", { bold: true, fill: est.faixa }); K.put(ws, r, 2, out.extenso, { wrap: true }); ws.getRow(r).height = 30; r++;
    r++;
    ["validade", "prazo", "representante"].forEach(function (id) {
      var t = textoPerfil(perfil, ctx, id); if (!t) return;
      ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, preencher(t, mapa), { borda: false, wrap: true }); ws.getRow(r).height = 32; r++;
    });
    r += 2;
    ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, "_____________________________________", { borda: false }); r++;
    ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, (ctx && ctx.representante) || "{representante}", { borda: false, bold: true }); r++;
    ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, s(emp.nome) || "[EMPRESA]", { borda: false }); r++;
    return ws;
  }

  function conferencia(wb, d, ctx, K, est, perfil, out) {
    var ws = wb.addWorksheet("Conferência", { properties: { tabColor: { argb: est.aba } } }), wsi = wb.getWorksheet("Sintética"), r = 1;
    K.largs(ws, [10, 50, 14, 16, 16, 16, 16]);
    ws.mergeCells(r, 1, r, 7); K.put(ws, r, 1, "Conferência da proposta — preço global × teto do edital", { bold: true, size: 12, borda: false }); r += 2;
    var modo = d.modo === "truncar2" || d.modo === "arred2truncpu" ? "TRUNCAR" : "ARREDONDAR";
    K.put(ws, r, 1, "Regra", { bold: true, fill: est.faixa }); ws.mergeCells(r, 1, r, 2);
    var rRegra = r; K.entrada(ws, r, 3, (ctx && ctx.regraArredondamento) || modo);
    ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: false, formulae: ['"TRUNCAR,ARREDONDAR"'] };
    K.put(ws, r, 4, "Escolha TRUNCAR ou ARREDONDAR: o preço global da linha abaixo segue a regra do edital.", { borda: false, size: 9, italic: true }); r++;
    K.put(ws, r, 1, "Teto do edital", { bold: true, fill: est.faixa }); ws.mergeCells(r, 1, r, 2);
    var rTeto = r; K.entrada(ws, r, 3, ctx && ctx.teto != null ? num(ctx.teto) : null, MOEDA);
    K.put(ws, r, 4, ctx && ctx.teto != null ? "" : "informe o valor máximo do edital", { borda: false, size: 9, italic: true, cor: VERM }); r++;
    var rSomaT = r, rSomaA = r + 1, rGlob = r + 2, rDif = r + 3, rSit = r + 4, rSint = r + 5;
    r += 7;
    K.head(ws, r, ["ITEM", "DESCRIÇÃO", "QUANT.", "PREÇO UNIT.", "TRUNCADO", "ARREDONDADO", "OBRIGATÓRIO?"]); var rh = r; r++;
    var linhaDe = {};
    if (wsi) wsi.eachRow(function (row, rn) { linhaDe[s(row.getCell(1).value)] = rn; });
    var obrig = (ctx && ctx.itensObrigatorios) || [], r1 = r;
    d.itens.forEach(function (I) {
      var rs = linhaDe[I.numero]; if (!rs) return;
      K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao);
      K.put(ws, r, 3, { formula: "Sintética!F" + rs, result: I.quantidade }, { fmt: NUM });
      K.put(ws, r, 4, { formula: "Sintética!I" + rs, result: I.pu }, { fmt: MOEDA });
      K.put(ws, r, 5, { formula: "TRUNC(C" + r + "*D" + r + ",2)", result: Math.trunc(I.quantidade * I.pu * 100 + 1e-7) / 100 }, { fmt: MOEDA });
      K.put(ws, r, 6, { formula: "ROUND(C" + r + "*D" + r + ",2)", result: arr2(I.quantidade * I.pu) }, { fmt: MOEDA });
      var ob = obrig.indexOf(I.codigo) >= 0 || obrig.indexOf(I.numero) >= 0;
      K.put(ws, r, 7, ob ? "sim" : "", { al: "center" });
      r++;
    });
    var rU = r - 1;
    /* itens obrigatórios pedidos pelo edital que NÃO estão na planilha */
    var faltam = obrig.filter(function (cd) { return !d.itens.some(function (I) { return I.codigo === cd || I.numero === cd; }); });
    K.put(ws, rSomaT, 1, "Soma truncada", { bold: true, fill: est.faixa }); ws.mergeCells(rSomaT, 1, rSomaT, 2); K.put(ws, rSomaT, 3, { formula: "SUM(E" + r1 + ":E" + rU + ")", result: 0 }, { fmt: MOEDA });
    K.put(ws, rSomaA, 1, "Soma arredondada", { bold: true, fill: est.faixa }); ws.mergeCells(rSomaA, 1, rSomaA, 2); K.put(ws, rSomaA, 3, { formula: "SUM(F" + r1 + ":F" + rU + ")", result: 0 }, { fmt: MOEDA });
    K.put(ws, rGlob, 1, "Preço global pela regra", { bold: true, fill: est.faixa }); ws.mergeCells(rGlob, 1, rGlob, 2);
    K.put(ws, rGlob, 3, { formula: 'IF(C' + rRegra + '="TRUNCAR",C' + rSomaT + ',C' + rSomaA + ')', result: d.tot.precoVenda }, { fmt: MOEDA, bold: true });
    K.put(ws, rDif, 1, "Teto − preço global", { bold: true, fill: est.faixa }); ws.mergeCells(rDif, 1, rDif, 2);
    K.put(ws, rDif, 3, { formula: 'IF(C' + rTeto + '="","informe o teto",C' + rTeto + '-C' + rGlob + ')', result: "informe o teto" }, { fmt: MOEDA });
    K.put(ws, rSit, 1, "Situação", { bold: true, fill: est.faixa }); ws.mergeCells(rSit, 1, rSit, 2);
    K.put(ws, rSit, 3, { formula: 'IF(C' + rTeto + '="","sem teto informado",IF(C' + rGlob + '<=C' + rTeto + ',"dentro do teto","ACIMA DO TETO"))', result: "sem teto informado" }, { bold: true });
    K.put(ws, rSint, 1, "Total da Sintética", { bold: true, fill: est.faixa }); ws.mergeCells(rSint, 1, rSint, 2);
    K.put(ws, rSint, 3, { formula: "Resumo!B" + out.linhaTotal, result: d.tot.precoVenda }, { fmt: MOEDA });
    if (faltam.length) { r++; ws.mergeCells(r, 1, r, 7); K.put(ws, r, 1, "ITENS OBRIGATÓRIOS AUSENTES DA PLANILHA: " + faltam.join(", "), { bold: true, cor: VERM, borda: false }); }
    ws.views = [{ state: "frozen", ySplit: rh }];
    out.conferencia = { ws: ws, ausentes: faltam, linhaGlobal: rGlob, linhaTeto: rTeto, linhaRegra: rRegra, primeiraLinha: r1, ultimaLinha: rU };
    return ws;
  }

  /* ============================ RESIDENCIAL, COMERCIAL, INDUSTRIAL, CONDOMÍNIO, REFORMA ============================ */
  function abaResumo(wb, d, ctx, K, est, perfil, P, rotulo) {
    var ws = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [34, 60]);
    r = cabecalho(wb, ws, K, est, d, ctx, rotulo, 2);
    var cli = d.cab.orgao || "[PREENCHER: cliente]", linhas = [["Cliente", cli], ["Obra", d.cab.obra || "[PREENCHER: obra]"], ["Local", localUf(d)], ["Orçamento nº", d.cab.numero], ["Data-base", d.cab.dataBase || "não informada"],
      ["Prazo de execução", (ctx && ctx.prazoTexto) || "{prazo}"], ["Validade da proposta", ctx && ctx.validadeDias ? ctx.validadeDias + " dias" : "{validade}"]];
    linhas.forEach(function (x) { K.put(ws, r, 1, x[0], { bold: true, fill: est.faixa }); K.put(ws, r, 2, x[1], { al: "left" }); r++; });
    r++;
    K.put(ws, r, 1, "VALOR TOTAL", { bold: true, fill: est.cab, cor: BRANCO, size: 12 });
    var rT = r; K.put(ws, r, 2, 0, { bold: true, size: 12, fmt: MOEDA, al: "left" }); r++;
    if (ligada(perfil, ctx, "bdiOculto")) { ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, "Preço fechado: o BDI está embutido nos valores.", { borda: false, italic: true, size: 9 }); r++; }
    return { ws: ws, linhaTotal: rT, prox: r + 1 };
  }

  function abaResumoEtapas(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Resumo por etapa", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 48, 18, 12, 40]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Resumo por etapa", 5);
    K.head(ws, r, ["ETAPA", "DESCRIÇÃO", "VALOR (R$)", "PESO %", "PESO NO TOTAL"]); var rh = r; r++;
    var r1 = r;
    P.forEach(function (E, i) {
      K.put(ws, r, 1, E.numero, { al: "center" }); K.put(ws, r, 2, E.nome + (E.opcional ? " (opcional)" : ""));
      K.put(ws, r, 3, E.preco, { fmt: MOEDA });
      r++;
    });
    var rU = r - 1, rT = r;
    K.put(ws, rT, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, rT, 1, "", { fill: est.faixa });
    K.put(ws, rT, 3, { formula: "SUM(C" + r1 + ":C" + rU + ")", result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, fill: est.faixa });
    for (var q = r1; q <= rU; q++) {
      K.put(ws, q, 4, { formula: "IFERROR(C" + q + "/C$" + rT + ",0)", result: d.tot.precoVenda ? P[q - r1].preco / d.tot.precoVenda : 0 }, { fmt: "0.00%" });
      K.put(ws, q, 5, { formula: "C" + q, result: P[q - r1].preco }, { fmt: ";;;" });   /* a barra lê o valor; o número fica oculto */
    }
    K.put(ws, rT, 4, 1, { fmt: "0.00%", bold: true, fill: est.faixa }); K.put(ws, rT, 5, "", { fill: est.faixa });
    ws.addConditionalFormatting({ ref: "E" + r1 + ":E" + rU, rules: [{ type: "dataBar", priority: 1, gradient: false, showValue: false, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: { argb: est.acento } }] });
    return { ws: ws, linhaTotal: rT, primeira: r1, ultima: rU };
  }

  function abaItens(wb, d, ctx, K, est, perfil, P, o) {
    o = o || {};
    var ws = wb.addWorksheet(o.nome || "Itens por etapa", { properties: { tabColor: { argb: est.aba } } }), r;
    var mostrarCriterio = !!o.criterio, ncol = mostrarCriterio ? 7 : 6;
    K.largs(ws, mostrarCriterio ? [9, 54, 7, 12, 15, 16, 38] : [9, 56, 8, 12, 16, 18]);
    r = cabecalho(wb, ws, K, est, d, ctx, o.titulo || "Itens por etapa", ncol);
    var hd = ["ITEM", "DESCRIÇÃO", "UN.", "QUANT.", "PREÇO UNIT.", "TOTAL"]; if (mostrarCriterio) hd.push("CRITÉRIO DE MEDIÇÃO");
    K.head(ws, r, hd); var rh = r; r++;
    var subs = [];
    P.forEach(function (E) {
      K.faixa(ws, r, ncol, E.numero + "  " + E.nome + (E.opcional ? "  (opcional)" : ""), est.acento); r++;
      var f1 = r;
      E.itens.forEach(function (I, k) {
        K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao, { wrap: true }); K.put(ws, r, 3, I.unidade, { al: "center" });
        K.put(ws, r, 4, I.quantidade, { fmt: NUM }); K.put(ws, r, 5, I.pu, { fmt: MOEDA }); K.put(ws, r, 6, I.total, { fmt: MOEDA });
        if (mostrarCriterio) K.put(ws, r, 7, "Medição por " + (I.unidade || "unidade") + " executada e conferida em boletim.", { wrap: true, size: 9 });
        if (k % 2) for (var c = 1; c <= ncol; c++) ws.getCell(r, c).fill = K.fillS(est.zebra);
        r++;
      });
      K.put(ws, r, 1, "", { fill: est.faixa }); K.put(ws, r, 2, "Subtotal " + E.numero + " — " + E.nome, { bold: true, fill: est.faixa });
      for (var c2 = 3; c2 <= ncol; c2++) K.put(ws, r, c2, "", { fill: est.faixa });
      K.put(ws, r, 6, { formula: "SUM(F" + f1 + ":F" + (r - 1) + ")", result: E.preco }, { bold: true, fmt: MOEDA, fill: est.faixa });
      subs.push(r); r++;
    });
    K.put(ws, r, 2, "TOTAL GERAL", { bold: true, fill: est.cab, cor: BRANCO });
    K.put(ws, r, 6, { formula: subs.map(function (x) { return "F" + x; }).join("+"), result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, fill: est.cab, cor: BRANCO });
    ws.views = [{ state: "frozen", ySplit: rh }];
    return { ws: ws, linhaTotal: r, subtotais: subs };
  }

  function abaPagamento(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Pagamento por etapa", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 46, 18, 12, 46]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Pagamento por etapa", 5);
    var mapa = mapaTexto(d, ctx), t = textoPerfil(perfil, ctx, "pagamento");
    if (t) { ws.mergeCells(r, 1, r, 5); K.put(ws, r, 1, preencher(t, mapa), { borda: false, wrap: true }); ws.getRow(r).height = 34; r += 2; }
    K.head(ws, r, ["ETAPA", "DESCRIÇÃO", "VALOR A PAGAR", "% DO TOTAL", "QUANDO"]); r++;
    var r1 = r;
    P.forEach(function (E) {
      K.put(ws, r, 1, E.numero, { al: "center" }); K.put(ws, r, 2, E.nome); K.put(ws, r, 3, E.preco, { fmt: MOEDA });
      K.put(ws, r, 4, { formula: "IFERROR(C" + r + "/C$" + (r1 + P.length) + ",0)", result: d.tot.precoVenda ? E.preco / d.tot.precoVenda : 0 }, { fmt: "0.00%" });
      K.put(ws, r, 5, "Após a medição e a conferência da etapa concluída", { size: 9 });
      r++;
    });
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
    K.put(ws, r, 3, { formula: "SUM(C" + r1 + ":C" + (r - 1) + ")", result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, fill: est.faixa });
    K.put(ws, r, 4, { formula: "SUM(D" + r1 + ":D" + (r - 1) + ")", result: 1 }, { bold: true, fmt: "0.00%", fill: est.faixa }); K.put(ws, r, 5, "", { fill: est.faixa });
    return { ws: ws, linhaTotal: r };
  }

  function abaIncluso(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Incluso e excluso", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [60, 60]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Incluso, excluso, premissas e garantias", 2);
    var mapa = mapaTexto(d, ctx);
    K.head(ws, r, ["O QUE ESTÁ INCLUSO", "O QUE NÃO ESTÁ INCLUSO"]); r++;
    var excl = textoPerfil(perfil, ctx, "excluso") || textoPerfil(perfil, ctx, "imprevistos") || "[a informar: o que não está incluso]";
    var n = Math.max(P.length, 1), r1 = r;
    P.forEach(function (E, i) { K.put(ws, r + i, 1, "• " + E.nome + (E.opcional ? " (opcional)" : ""), { wrap: true }); K.put(ws, r + i, 2, "", { wrap: true }); });
    ws.mergeCells(r1, 2, r1 + n - 1, 2); K.put(ws, r1, 2, preencher(excl, mapa), { wrap: true });
    r += n + 1;
    [["Premissas", "premissas"], ["Garantias", "garantia"], ["Aviso aos moradores", "aviso"], ["Aprovação em assembleia", "assembleia"], ["Visita técnica", "visita"], ["Horário de execução", "horario"], ["Interferência no funcionamento", "interferencia"]].forEach(function (x) {
      var t = textoPerfil(perfil, ctx, x[1]);
      if (x[1] === "premissas" && !t) t = ctx && ctx.premissas ? ctx.premissas : "";
      if (!t) return;
      K.put(ws, r, 1, x[0], { bold: true, fill: est.faixa }); K.put(ws, r, 2, "", { fill: est.faixa }); r++;
      ws.mergeCells(r, 1, r, 2); K.put(ws, r, 1, preencher(t, mapa), { wrap: true }); ws.getRow(r).height = 46; r += 2;
    });
    return { ws: ws };
  }

  function abaCronograma(wb, d, ctx, K, est, perfil, padrao) {
    var ws = wb.addWorksheet("Cronograma", { properties: { tabColor: { argb: est.aba } } }), cr = cronoDe(d, ctx, padrao), CE = dep("CronoEstilo");
    if (cr.erro) {
      K.largs(ws, [90]); K.put(ws, 1, 1, "Cronograma — PENDÊNCIA", { bold: true, size: 12, borda: false }); K.put(ws, 3, 1, cr.erro + " O cronograma não foi inventado: elabore as durações e dependências das etapas e gere de novo.", { cor: VERM, bold: true, borda: false, wrap: true });
      return { ws: ws, erro: cr.erro };
    }
    var rt = d.rt || {};
    var ref = CE.xlsx(ws, cr.m, cr.estilo, { fonte: est.fonte, cabCor: est.cab, corBarra: est.acento, hoje: ctx && ctx.hoje, titulo: "Cronograma — " + (d.cab.obra || ""), rt: { nome: rt.nome, registro: rt.registro, art: d.art && d.art.numero, tipoArt: d.art && d.art.tipo } });
    return { ws: ws, m: cr.m, estilo: cr.estilo, ref: ref };
  }

  function abaCustoM2(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Custo por m²", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 44, 18, 16, 20]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Custo por m² construído", 5);
    K.put(ws, r, 2, "Área construída (m²)", { bold: true, fill: est.faixa }); var rA = r;
    K.entrada(ws, r, 3, ctx && ctx.areaM2 ? num(ctx.areaM2) : null, NUM);
    K.put(ws, r, 4, ctx && ctx.areaM2 ? "" : "informe a área", { borda: false, italic: true, cor: VERM, size: 9 }); r += 2;
    K.head(ws, r, ["ETAPA", "DESCRIÇÃO", "VALOR (R$)", "R$/m²", "% DO TOTAL"]); r++;
    var r1 = r;
    P.forEach(function (E) {
      K.put(ws, r, 1, E.numero, { al: "center" }); K.put(ws, r, 2, E.nome); K.put(ws, r, 3, E.preco, { fmt: MOEDA });
      K.put(ws, r, 4, { formula: 'IF($C$' + rA + '>0,C' + r + '/$C$' + rA + ',"informe a área")', result: "informe a área" }, { fmt: MOEDA });
      K.put(ws, r, 5, { formula: "IFERROR(C" + r + "/C$" + (r1 + P.length) + ",0)", result: d.tot.precoVenda ? E.preco / d.tot.precoVenda : 0 }, { fmt: "0.00%" });
      r++;
    });
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
    K.put(ws, r, 3, { formula: "SUM(C" + r1 + ":C" + (r - 1) + ")", result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, fill: est.faixa });
    K.put(ws, r, 4, { formula: 'IF($C$' + rA + '>0,C' + r + '/$C$' + rA + ',"informe a área")', result: "informe a área" }, { bold: true, fmt: MOEDA, fill: est.faixa });
    K.put(ws, r, 5, { formula: "SUM(E" + r1 + ":E" + (r - 1) + ")", result: 1 }, { bold: true, fmt: "0.00%", fill: est.faixa });
    return { ws: ws, linhaTotal: r };
  }

  function abaEquipamentos(wb, d, ctx, K, est, perfil) {
    var ws = wb.addWorksheet("Equipamentos", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 50, 12, 16, 18]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Equipamentos com horas de uso", 5);
    K.head(ws, r, ["Nº", "EQUIPAMENTO", "HORAS", "R$/HORA", "CUSTO (R$)"]); r++;
    var lista = (ctx && ctx.equipamentos && ctx.equipamentos.length) ? ctx.equipamentos : null, r1 = r, n = lista ? lista.length : 3;
    for (var i = 0; i < n; i++) {
      var e = lista ? lista[i] : null;
      K.put(ws, r, 1, i + 1, { al: "center" });
      if (e) { K.put(ws, r, 2, e.descricao); K.put(ws, r, 3, num(e.horas), { fmt: NUM }); K.put(ws, r, 4, num(e.custoHora), { fmt: MOEDA }); }
      else { K.entrada(ws, r, 2, null); K.entrada(ws, r, 3, null, NUM); K.entrada(ws, r, 4, null, MOEDA); }
      K.put(ws, r, 5, { formula: "C" + r + "*D" + r, result: e ? arr2(num(e.horas) * num(e.custoHora)) : 0 }, { fmt: MOEDA });
      r++;
    }
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
    K.put(ws, r, 3, { formula: "SUM(C" + r1 + ":C" + (r - 1) + ")", result: 0 }, { bold: true, fmt: NUM, fill: est.faixa }); K.put(ws, r, 4, "", { fill: est.faixa });
    K.put(ws, r, 5, { formula: "SUM(E" + r1 + ":E" + (r - 1) + ")", result: 0 }, { bold: true, fmt: MOEDA, fill: est.faixa });
    if (!lista) { ws.mergeCells(r + 2, 1, r + 2, 5); K.put(ws, r + 2, 1, "As linhas amarelas são para preencher: o orçamento não traz os equipamentos e as horas de cada um.", { borda: false, italic: true, cor: VERM, size: 9 }); }
    return { ws: ws };
  }

  function abaMobilizacao(ws, d, K, est, P, r) {
    /* itens de mobilização/desmobilização, destacados; se não há, a linha para preencher */
    var achados = [];
    P.forEach(function (E) { E.itens.forEach(function (I) { if (/mobiliza|desmobiliza/i.test(I.descricao)) achados.push(I); }); });
    ws.mergeCells(r, 1, r, 6); K.put(ws, r, 1, "MOBILIZAÇÃO E DESMOBILIZAÇÃO", { bold: true, fill: est.acento, cor: BRANCO }); r++;
    if (achados.length) achados.forEach(function (I) { K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao); K.put(ws, r, 3, I.unidade, { al: "center" }); K.put(ws, r, 4, I.quantidade, { fmt: NUM }); K.put(ws, r, 5, I.pu, { fmt: MOEDA }); K.put(ws, r, 6, I.total, { fmt: MOEDA }); r++; });
    else { ws.mergeCells(r, 1, r, 6); K.put(ws, r, 1, "Nenhum item de mobilização ou desmobilização no orçamento: confira se estão previstos em outra etapa.", { italic: true, cor: VERM, size: 9 }); r++; }
    return r + 1;
  }

  function abaSeguranca(wb, d, ctx, K, est, perfil) {
    var ws = wb.addWorksheet("Segurança e medição", { properties: { tabColor: { argb: est.aba } } }), r, mapa = mapaTexto(d, ctx);
    K.largs(ws, [32, 90]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Segurança do trabalho, responsabilidade técnica e medição", 2);
    [["Segurança do trabalho (NR-18, NR-35, NR-10)", "seguranca"], ["ART / RRT", "art"], ["Paradas programadas", "paradas"], ["Medição", "medicao"]].forEach(function (x) {
      var t = textoPerfil(perfil, ctx, x[1]); if (!t) return;
      K.put(ws, r, 1, x[0], { bold: true, fill: est.faixa, wrap: true }); K.put(ws, r, 2, preencher(t, mapa), { wrap: true }); ws.getRow(r).height = 64; r++;
    });
    return { ws: ws };
  }

  function abaRateio(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Rateio por unidade", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 34, 16, 18, 22]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Rateio por unidade", 5);
    var rt = (ctx && ctx.rateio) || { criterio: "fracao", unidades: [] }, igual = rt.criterio === "igual", un = rt.unidades && rt.unidades.length ? rt.unidades : null;
    K.put(ws, r, 2, "Valor total da obra", { bold: true, fill: est.faixa }); var rV = r;
    K.put(ws, r, 3, d.tot.precoVenda, { fmt: MOEDA, bold: true }); r++;
    K.put(ws, r, 2, "Critério de rateio", { bold: true, fill: est.faixa }); K.put(ws, r, 3, igual ? "Partes iguais" : "Fração ideal", { bold: true }); r += 2;
    K.head(ws, r, ["Nº", "UNIDADE", "FRAÇÃO IDEAL", "VALOR DA UNIDADE", ""]); var rh = r; r++;
    var r1 = r, n = un ? un.length : 4;
    for (var i = 0; i < n; i++) {
      var u = un ? un[i] : null;
      K.put(ws, r, 1, i + 1, { al: "center" });
      if (u) K.put(ws, r, 2, u.nome); else K.entrada(ws, r, 2, null);
      if (igual) K.put(ws, r, 3, { formula: "1/COUNTA($B$" + r1 + ":$B$" + (r1 + n - 1) + ")", result: u ? 1 / n : 0 }, { fmt: "0.0000%" });
      else if (u) K.put(ws, r, 3, num(u.fracao), { fmt: "0.0000%" }); else K.entrada(ws, r, 3, null, "0.0000%");
      K.put(ws, r, 4, { formula: "ROUND($C$" + rV + "*C" + r + ",2)", result: arr2(d.tot.precoVenda * (u ? (igual ? 1 / n : num(u.fracao)) : 0)) }, { fmt: MOEDA });
      r++;
    }
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
    K.put(ws, r, 3, { formula: "SUM(C" + r1 + ":C" + (r - 1) + ")", result: 1 }, { bold: true, fmt: "0.0000%", fill: est.faixa });
    K.put(ws, r, 4, { formula: "SUM(D" + r1 + ":D" + (r - 1) + ")", result: 0 }, { bold: true, fmt: MOEDA, fill: est.faixa });
    K.put(ws, r + 1, 2, "Diferença de centavos", { italic: true, size: 9 }); K.put(ws, r + 1, 4, { formula: "$C$" + rV + "-D" + r, result: 0 }, { fmt: MOEDA, size: 9 });
    K.put(ws, r + 2, 2, "Confere?", { italic: true, size: 9 }); K.put(ws, r + 2, 3, { formula: 'IF(ROUND(C' + r + ',6)=1,"a soma das frações fecha em 100%","AS FRAÇÕES NÃO SOMAM 100%")', result: "" }, { size: 9, bold: true });
    if (!un) { ws.mergeCells(r + 4, 1, r + 4, 5); K.put(ws, r + 4, 1, "As unidades não foram informadas: preencha as linhas amarelas (nome e fração ideal). O rateio por unidade não vem do orçamento.", { borda: false, italic: true, cor: VERM, size: 9, wrap: true }); ws.getRow(r + 4).height = 30; }
    return { ws: ws, linhaTotal: r, primeira: r1, ultima: r - 1 };
  }

  function abaComparativo(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Comparativo de opções", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 50, 18, 20, 18]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Comparativo de opções", 5);
    var base = P.filter(function (E) { return !E.opcional; }), opc = P.filter(function (E) { return E.opcional; });
    var totBase = arr2(base.reduce(function (a, E) { return a + E.preco; }, 0));
    K.head(ws, r, ["Nº", "OPÇÃO", "VALOR DA OPÇÃO", "TOTAL COM A OPÇÃO", "DIFERENÇA"]); r++;
    K.put(ws, r, 1, "", { al: "center" }); K.put(ws, r, 2, "Base (sem opcionais)", { bold: true }); K.put(ws, r, 3, totBase, { fmt: MOEDA });
    K.put(ws, r, 4, totBase, { fmt: MOEDA, bold: true }); K.put(ws, r, 5, 0, { fmt: MOEDA }); var rB = r; r++;
    if (!opc.length) { ws.mergeCells(r, 1, r, 5); K.put(ws, r, 1, "Este orçamento não tem etapas opcionais marcadas. Marque a etapa como opcional no orçamento para compará-la aqui.", { italic: true, borda: false, size: 9 }); r++; }
    opc.forEach(function (E, i) {
      K.put(ws, r, 1, i + 1, { al: "center" }); K.put(ws, r, 2, E.numero + " " + E.nome); K.put(ws, r, 3, E.preco, { fmt: MOEDA });
      K.put(ws, r, 4, { formula: "$C$" + rB + "+C" + r, result: arr2(totBase + E.preco) }, { fmt: MOEDA }); K.put(ws, r, 5, { formula: "D" + r + "-$D$" + rB, result: E.preco }, { fmt: MOEDA }); r++;
    });
    if (opc.length > 1) {
      var tOpc = arr2(opc.reduce(function (a, E) { return a + E.preco; }, 0));
      K.put(ws, r, 2, "Todas as opções", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
      K.put(ws, r, 3, { formula: "SUM(C" + (rB + 1) + ":C" + (r - 1) + ")", result: tOpc }, { fmt: MOEDA, bold: true, fill: est.faixa });
      K.put(ws, r, 4, { formula: "$C$" + rB + "+C" + r, result: arr2(totBase + tOpc) }, { fmt: MOEDA, bold: true, fill: est.faixa }); K.put(ws, r, 5, { formula: "D" + r + "-$D$" + rB, result: tOpc }, { fmt: MOEDA, bold: true, fill: est.faixa });
    }
    return { ws: ws };
  }

  function abaDesembolso(wb, d, ctx, K, est, perfil, cr) {
    var ws = wb.addWorksheet("Desembolso mensal", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [8, 16, 18, 18, 14, 20]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Desembolso mensal", 6);
    if (!cr || !cr.m) { ws.mergeCells(r, 1, r, 6); K.put(ws, r, 1, "PENDÊNCIA: sem cronograma elaborado não há desembolso mensal. " + ((cr && cr.erro) || ""), { cor: VERM, bold: true, borda: false, wrap: true }); return { ws: ws }; }
    var f = cr.m.fin, rt = (ctx && ctx.rateio) || {}, nun = rt.unidades && rt.unidades.length ? rt.unidades.length : 0;
    K.head(ws, r, ["Nº", "MÊS", "PARCELA (R$)", "ACUMULADO (R$)", "% ACUM.", nun && rt.criterio === "igual" ? "POR UNIDADE (PARTES IGUAIS)" : "% DO MÊS"]); var rh = r; r++;
    var r1 = r, k;
    for (k = 0; k < f.nMeses; k++) {
      K.put(ws, r, 1, k + 1, { al: "center" }); K.put(ws, r, 2, f.rotulos[k] || (k + 1) + "º mês", { al: "center" }); K.put(ws, r, 3, f.totais[k].valor, { fmt: MOEDA });
      K.put(ws, r, 4, { formula: "SUM($C$" + r1 + ":C" + r + ")", result: f.totais[k].acumValor }, { fmt: MOEDA });
      K.put(ws, r, 5, { formula: "IFERROR(D" + r + "/$C$" + (r1 + f.nMeses) + ",0)", result: f.totais[k].acumPct / 100 }, { fmt: "0.00%" });
      if (nun && rt.criterio === "igual") K.put(ws, r, 6, { formula: "ROUND(C" + r + "/" + nun + ",2)", result: arr2(f.totais[k].valor / nun) }, { fmt: MOEDA });
      else K.put(ws, r, 6, { formula: "IFERROR(C" + r + "/$C$" + (r1 + f.nMeses) + ",0)", result: f.totais[k].pct / 100 }, { fmt: "0.00%" });
      r++;
    }
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa });
    K.put(ws, r, 3, { formula: "SUM(C" + r1 + ":C" + (r - 1) + ")", result: f.total }, { bold: true, fmt: MOEDA, fill: est.faixa });
    K.put(ws, r, 4, "", { fill: est.faixa }); K.put(ws, r, 5, "", { fill: est.faixa }); K.put(ws, r, 6, "", { fill: est.faixa });
    ws.addConditionalFormatting({ ref: "C" + r1 + ":C" + (r - 1), rules: [{ type: "dataBar", priority: 1, gradient: false, showValue: true, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: { argb: est.acento } }] });
    return { ws: ws, linhaTotal: r, primeira: r1 };
  }

  function abaImprevistos(wb, d, ctx, K, est, perfil) {
    var ws = wb.addWorksheet("Imprevistos", { properties: { tabColor: { argb: VERM } } }), r;
    K.largs(ws, [44, 20, 50]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Verba de imprevistos", 3);
    var t = textoPerfil(perfil, ctx, "imprevistos");
    if (t) { ws.mergeCells(r, 1, r, 3); K.put(ws, r, 1, preencher(t, mapaTexto(d, ctx)), { borda: false, wrap: true }); ws.getRow(r).height = 48; r += 2; }
    K.put(ws, r, 1, "Total da obra (sem a verba)", { bold: true, fill: est.faixa }); K.put(ws, r, 2, d.tot.precoVenda, { fmt: MOEDA }); var rB = r; r++;
    K.put(ws, r, 1, "Reserva para imprevistos (%)", { bold: true, fill: est.faixa });
    K.entrada(ws, r, 2, ctx && ctx.imprevistosPct != null ? num(ctx.imprevistosPct) / 100 : null, "0.00%"); var rP = r;
    K.put(ws, r, 3, ctx && ctx.imprevistosPct != null ? "" : "defina o percentual com o cliente", { borda: false, italic: true, cor: VERM, size: 9 }); r++;
    K.put(ws, r, 1, "VERBA DE IMPREVISTOS (R$)", { bold: true, fill: "FFFEE2E2", cor: VERM, size: 11 });
    K.put(ws, r, 2, { formula: "ROUND(B" + rB + "*N(B" + rP + "),2)", result: ctx && ctx.imprevistosPct != null ? arr2(d.tot.precoVenda * num(ctx.imprevistosPct) / 100) : 0 }, { fmt: MOEDA, bold: true, fill: "FFFEE2E2", cor: VERM, size: 11 }); var rV = r; r++;
    K.put(ws, r, 1, "Total com a verba", { bold: true, fill: est.cab, cor: BRANCO }); K.put(ws, r, 2, { formula: "B" + rB + "+B" + rV, result: d.tot.precoVenda }, { fmt: MOEDA, bold: true, fill: est.cab, cor: BRANCO });
    ws.mergeCells(r + 2, 1, r + 2, 3); K.put(ws, r + 2, 1, "A verba só é usada com a concordância do contratante, e o que não for gasto não é cobrado.", { borda: false, italic: true, size: 9 });
    return { ws: ws, linhaVerba: rV };
  }

  function abaOpcionais(wb, d, ctx, K, est, perfil, P) {
    var ws = wb.addWorksheet("Opcionais", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [9, 54, 8, 12, 16, 18]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Itens opcionais com subtotal", 6);
    var opc = P.filter(function (E) { return E.opcional; }), avulsos = [];
    P.forEach(function (E) { if (!E.opcional) E.itens.forEach(function (I) { if (I.opcional) avulsos.push(I); }); });
    if (!opc.length && !avulsos.length) { ws.mergeCells(r, 1, r, 6); K.put(ws, r, 1, "Este orçamento não tem etapas nem itens opcionais marcados. Marque como opcional no orçamento para listá-los aqui, fora do preço-base.", { italic: true, borda: false, size: 9, wrap: true }); ws.getRow(r).height = 30; return { ws: ws }; }
    K.head(ws, r, ["ITEM", "DESCRIÇÃO", "UN.", "QUANT.", "PREÇO UNIT.", "TOTAL"]); r++;
    var subs = [];
    opc.forEach(function (E) {
      K.faixa(ws, r, 6, E.numero + "  " + E.nome + "  (opcional)", est.acento); r++; var f1 = r;
      E.itens.forEach(function (I) { K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao, { wrap: true }); K.put(ws, r, 3, I.unidade, { al: "center" }); K.put(ws, r, 4, I.quantidade, { fmt: NUM }); K.put(ws, r, 5, I.pu, { fmt: MOEDA }); K.put(ws, r, 6, I.total, { fmt: MOEDA }); r++; });
      K.put(ws, r, 2, "Subtotal — " + E.nome, { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa }); for (var c = 3; c <= 5; c++) K.put(ws, r, c, "", { fill: est.faixa });
      K.put(ws, r, 6, { formula: "SUM(F" + f1 + ":F" + (r - 1) + ")", result: E.preco }, { bold: true, fmt: MOEDA, fill: est.faixa }); subs.push(r); r++;
    });
    if (avulsos.length) {
      K.faixa(ws, r, 6, "Itens opcionais dentro de etapas do preço-base", est.acento); r++; var f2 = r;
      avulsos.forEach(function (I) { K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao, { wrap: true }); K.put(ws, r, 3, I.unidade, { al: "center" }); K.put(ws, r, 4, I.quantidade, { fmt: NUM }); K.put(ws, r, 5, I.pu, { fmt: MOEDA }); K.put(ws, r, 6, I.total, { fmt: MOEDA }); r++; });
      K.put(ws, r, 2, "Subtotal — itens opcionais avulsos", { bold: true, fill: est.faixa }); K.put(ws, r, 1, "", { fill: est.faixa }); for (var c3 = 3; c3 <= 5; c3++) K.put(ws, r, c3, "", { fill: est.faixa });
      K.put(ws, r, 6, { formula: "SUM(F" + f2 + ":F" + (r - 1) + ")", result: 0 }, { bold: true, fmt: MOEDA, fill: est.faixa }); subs.push(r); r++;
    }
    return { ws: ws, subtotais: subs };
  }

  function abaItensAvulsos(wb, d, ctx, K, est, perfil, P) {
    /* reforma: a lista corrida de serviços, sem agrupar por etapa */
    var ws = wb.addWorksheet("Itens avulsos", { properties: { tabColor: { argb: est.aba } } }), r;
    K.largs(ws, [9, 54, 8, 12, 16, 18, 24]);
    r = cabecalho(wb, ws, K, est, d, ctx, "Serviços da reforma (itens avulsos)", 7);
    K.head(ws, r, ["ITEM", "SERVIÇO", "UN.", "QUANT.", "PREÇO UNIT.", "TOTAL", "ETAPA"]); var rh = r; r++;
    var r1 = r;
    P.forEach(function (E) { E.itens.forEach(function (I, k) {
      K.put(ws, r, 1, I.numero, { al: "center" }); K.put(ws, r, 2, I.descricao, { wrap: true }); K.put(ws, r, 3, I.unidade, { al: "center" }); K.put(ws, r, 4, I.quantidade, { fmt: NUM });
      K.put(ws, r, 5, I.pu, { fmt: MOEDA }); K.put(ws, r, 6, I.total, { fmt: MOEDA }); K.put(ws, r, 7, E.nome + (I.opcional || E.opcional ? " (opcional)" : ""), { size: 9 }); r++;
    }); });
    K.put(ws, r, 2, "TOTAL", { bold: true, fill: est.cab, cor: BRANCO }); K.put(ws, r, 6, { formula: "SUM(F" + r1 + ":F" + (r - 1) + ")", result: d.tot.precoVenda }, { bold: true, fmt: MOEDA, fill: est.cab, cor: BRANCO });
    ws.views = [{ state: "frozen", ySplit: rh }];
    return { ws: ws, linhaTotal: r };
  }

  function construirPerfil(ExcelJS, perfil, d, ctx) {
    var est0 = ESTETICA[perfil], est = Object.assign({}, est0);
    if (est.empresa && ctx && ctx.empresa) {   /* residencial & cia.: as cores da empresa, quando ela as tem */
      var c1 = hex8(ctx.empresa.corPrimaria), c2 = hex8(ctx.empresa.corSecundaria);
      if (c1) est.cab = c1; if (c2) est.acento = c2;
      if (c1 || c2) { est.faixa = "FFE2E8F0"; est.zebra = "FFF8FAFC"; est.borda = "FFCBD5E1"; }   /* cores da empresa: neutros no resto, sem brigar com o verde/laranja do perfil */
    }
    var K = kit(est), wb = new ExcelJS.Workbook(), out = { wb: wb, abas: {} }, P = precos(d), L = function (id) { return ligada(perfil, ctx, id); };
    wb.creator = s((ctx && ctx.empresa && ctx.empresa.nome) || d.emp && d.emp.nome) || "OrçaPRO"; wb.created = new Date();
    var rot = { residencial: "Proposta — obra residencial", comercial: "Proposta — obra comercial", industrial: "Proposta — obra industrial", condominio: "Proposta — condomínio", reforma: "Proposta — reforma" }[perfil];
    var resumo = (L("resumo") || L("capa")) ? abaResumo(wb, d, ctx, K, est, perfil, P, rot) : null, resEt = null, itens = null;
    if (L("resumoEtapas")) resEt = abaResumoEtapas(wb, d, ctx, K, est, perfil, P);
    if (resumo) { resumo.ws.getCell(resumo.linhaTotal, 2).value = resEt ? { formula: "'Resumo por etapa'!C" + resEt.linhaTotal, result: d.tot.precoVenda } : d.tot.precoVenda; }
    if (L("sintetico")) itens = abaItens(wb, d, ctx, K, est, perfil, P, perfil === "industrial" ? { nome: "Itens e medição", titulo: "Itens e critério de medição", criterio: L("criterioMedicao") } : (perfil === "reforma" ? { nome: "Itens por etapa" } : {}));
    if (perfil === "industrial" && itens) {
      /* mobilização/desmobilização logo abaixo do total dos itens */
      abaMobilizacao(itens.ws, d, K, est, P, itens.linhaTotal + 2);
    }
    var cr = null;
    if (perfil === "reforma" && L("sintetico")) out.abas.avulsos = abaItensAvulsos(wb, d, ctx, K, est, perfil, P);
    if (perfil === "comercial" && L("custoM2")) out.abas.custoM2 = abaCustoM2(wb, d, ctx, K, est, perfil, P);
    if (perfil === "industrial" && L("equipamentos")) out.abas.equipamentos = abaEquipamentos(wb, d, ctx, K, est, perfil);
    if (perfil === "industrial" && L("seguranca")) out.abas.seguranca = abaSeguranca(wb, d, ctx, K, est, perfil);
    if (L("condicoesPagamento")) out.abas.pagamento = abaPagamento(wb, d, ctx, K, est, perfil, P);
    if (L("incluso") || L("premissas") || L("garantias")) out.abas.incluso = abaIncluso(wb, d, ctx, K, est, perfil, P);
    if (perfil === "condominio" && L("rateio")) out.abas.rateio = abaRateio(wb, d, ctx, K, est, perfil, P);
    if (perfil === "condominio" && L("comparativo")) out.abas.comparativo = abaComparativo(wb, d, ctx, K, est, perfil, P);
    if (perfil === "reforma" && L("imprevistos")) out.abas.imprevistos = abaImprevistos(wb, d, ctx, K, est, perfil);
    if (perfil === "reforma" && L("opcionais")) out.abas.opcionais = abaOpcionais(wb, d, ctx, K, est, perfil, P);
    if (L("cronograma") || (perfil === "condominio" && L("desembolso"))) {
      var padrao = (dep("CronoEstilo").PADRAO_PERFIL || {})[perfil] || "simples";
      if (L("cronograma")) { out.abas.cronograma = abaCronograma(wb, d, ctx, K, est, perfil, padrao); cr = out.abas.cronograma; }
      if (perfil === "condominio" && L("desembolso")) out.abas.desembolso = abaDesembolso(wb, d, ctx, K, est, perfil, cr || cronoDe(d, Object.assign({}, ctx, { estiloCronograma: "simples" }), "simples"));
    }
    out.abas.resumo = resumo; out.abas.resumoEtapas = resEt; out.abas.itens = itens; out.precos = P;
    return out;
  }

  /* ---------------------------------------------------------------------
   * API
   * ctx: { orc, secoes:{id:false}, ligadas:{id:bool}, estiloCronograma, textos, empresa, logo, hoje, avanco, prazoTexto, validadeDias, representante,
   *        teto, regraArredondamento, itensObrigatorios, areaM2, equipamentos, rateio:{criterio,unidades}, imprevistosPct, ... }
   * construir devolve { wb, ... } (testável); gerar devolve Promise<Blob|Buffer>.
   * --------------------------------------------------------------------- */
  function construir(ExcelJS, perfil, d, ctx) {
    if (!ESTETICA[perfil]) throw new Error("Perfil sem planilha: " + s(perfil));
    ctx = ctx || {};
    var o = (perfil === "prefeitura" || perfil === "edital") ? construirOficial(ExcelJS, perfil, d, ctx) : construirPerfil(ExcelJS, perfil, d, ctx);
    o.perfil = perfil;
    return o;
  }
  function abas(wb) { var a = []; wb.eachSheet(function (ws) { a.push(ws.name); }); return a; }
  function gerar(ExcelJS, perfil, d, ctx) {
    var o = construir(ExcelJS, perfil, d, ctx);
    o.wb.calcProperties = { fullCalcOnLoad: true };
    return Promise.resolve(o.wb.xlsx.writeBuffer()).then(function (buf) {
      return typeof Blob !== "undefined" ? new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) : buf;
    });
  }

  var SaidasXls = { ESTETICA: ESTETICA, construir: construir, gerar: gerar, abas: abas, extenso: extenso, precos: precos, nomeAba: nomeAba, preencher: preencher };
  global.SaidasXls = SaidasXls;
  if (typeof module !== "undefined" && module.exports) module.exports = SaidasXls;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

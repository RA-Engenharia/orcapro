/* =====================================================================
 * metalorcfab.js — METÁLICA: "ORÇAMENTO DE FÁBRICA POR KG E HORA"
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 * É o orçamento do ponto de vista da METALÚRGICA: o aço entra por kg (por
 * família de perfil), a mão de obra entra por HORA de cada posto da fábrica
 * (corte, furação, montagem e solda, pintura, expedição, montagem em campo),
 * somam-se os consumíveis e aplica-se o BDI/margem. Sai custo, preço de
 * venda, R$/kg e R$/m². Diferente de js/metalorc.js (orçamento da estrutura
 * por peso com composições SINAPI/próprias): aqui os preços e as
 * produtividades são DA FÁBRICA e vêm da tabela de parâmetros dela.
 *
 * REGRA DA CASA — NUNCA INVENTAR NÚMERO: a tabela de parâmetros nasce VAZIA.
 * Parâmetro não preenchido → o item sai "pendente — cotar" (ou "informar
 * produtividade") e fica FORA da soma; o total vem marcado "parcial" enquanto
 * houver pendência. Zero digitado é valor informado (posto que não se usa);
 * campo em branco é pendência.
 *
 * DE ONDE VEM CADA QUANTIDADE (tudo do modelo numerado, js/metalfab.js):
 *   kg por família     peso de cada marca × quantidade (o mesmo peso das listas);
 *   peças, conjuntos   n.grupos / n.conjuntos (conjunto soldado = tem partes);
 *   furos              furos de cada peça × quantidade;
 *   m de solda         ESTIMADO: comprimento da peça soldada × nº de lados da
 *                      solda (um = 1; dois ou contorno = 2). O modelo não tem
 *                      o comprimento real do cordão — a tela avisa;
 *   m² de pintura      área de cada peça (a mesma das listas).
 *   consumíveis        índice por tonelada de js/metalrelacaofab.js (editável)
 *                      × aço do modelo; preço unitário vem dos parâmetros.
 *
 * FORA DESTE ORÇAMENTO (de propósito): parafusos e chumbadores, tinta e
 * galvanização, içamento, frete — ficam no "Orçamento da estrutura".
 *
 * Teste: node tools/test-metalorcfab.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function RF() { return dep("BimMetalRelacaoFab", "./metalrelacaofab.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\./g, function (m, i, s) { return /,/.test(s) ? "" : m; }).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round((num(v, 0) + 1e-9) * 100) / 100; }
  function r3(v) { return Math.round(num(v, 0) * 1000) / 1000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function ceil(v) { return Math.ceil(r6(v) - 1e-9); }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function brl(v) { return "R$ " + br(v, 2); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var STATUS_COTAR = "pendente — cotar";
  var STATUS_PROD = "pendente — informar produtividade";
  var ENTIDADE = "metal_fab_param";

  /* ============================================ TABELAS DE ESTRUTURA DOS PARÂMETROS */
  var FAMILIAS = [
    ["perfil", "Perfil laminado / soldado (I, H, U, L, T)"], ["dobrado", "Dobrado (Ue, U, Z, cartola, chapa dobrada)"],
    ["tubo", "Tubo (retangular, quadrado, circular)"], ["chapa", "Chapa"], ["barra", "Barra (redonda, chata) e peça mecânica"]
  ];
  var POSTOS = [
    { id: "corte", nome: "Corte", drivers: [["ton", "h por tonelada"], ["peca", "h por peça"]] },
    { id: "furacao", nome: "Furação", drivers: [["furo", "h por furo"], ["ton", "h por tonelada"]] },
    { id: "montagem", nome: "Montagem e solda", drivers: [["conjunto", "h por conjunto soldado"], ["metroSolda", "h por metro de solda (estimado)"], ["ton", "h por tonelada"]] },
    { id: "pintura", nome: "Pintura", drivers: [["m2", "h por m² de pintura"], ["ton", "h por tonelada"]] },
    { id: "expedicao", nome: "Expedição", drivers: [["conjunto", "h por conjunto (unidade de carga)"], ["ton", "h por tonelada"]] },
    { id: "campo", nome: "Montagem em campo", drivers: [["conjunto", "h por conjunto"], ["ton", "h por tonelada"]] }
  ];
  var UNID_DRIVER = { ton: "t", peca: "peça", furo: "furo", conjunto: "conjunto", metroSolda: "m", m2: "m²" };
  function postoDe(id) { for (var i = 0; i < POSTOS.length; i++) if (POSTOS[i].id === id) return POSTOS[i]; return null; }

  /* ============================================ PARÂMETROS (defaults VAZIOS) */
  function vazio() {
    var p = { aco: {}, hora: {}, prod: {}, consum: {}, perdaPct: null, bdiPct: null };
    FAMILIAS.forEach(function (f) { p.aco[f[0]] = null; });
    POSTOS.forEach(function (po) { p.hora[po.id] = null; p.prod[po.id] = {}; po.drivers.forEach(function (d) { p.prod[po.id][d[0]] = null; }); });
    var R = RF(); if (R && R.INDICE_ROTULOS) Object.keys(R.INDICE_ROTULOS).forEach(function (k) { p.consum[k] = null; });
    return p;
  }
  function pos(v) { var n = num(v, null); return n != null && n >= 0 ? n : null; }
  /* normaliza o que veio da tela/disco: só número >= 0; qualquer outra coisa vira "não informado" (null) */
  function normalizar(c) {
    c = c || {}; var p = vazio();
    Object.keys(p.aco).forEach(function (k) { p.aco[k] = pos(c.aco && c.aco[k]); });
    POSTOS.forEach(function (po) {
      p.hora[po.id] = pos(c.hora && c.hora[po.id]);
      po.drivers.forEach(function (d) { p.prod[po.id][d[0]] = pos(c.prod && c.prod[po.id] && c.prod[po.id][d[0]]); });
    });
    Object.keys(p.consum).forEach(function (k) { p.consum[k] = pos(c.consum && c.consum[k]); });
    p.perdaPct = pos(c.perdaPct); p.bdiPct = pos(c.bdiPct);
    return p;
  }
  function algumPreenchido(p) {
    p = normalizar(p); var s = JSON.stringify(p);
    return /:\d/.test(s);
  }

  /* ============================================ FAMÍLIA DA PEÇA */
  function ehFrio(rep) {
    var cat = rep.perfil && rep.perfil.cat, A = Aco(), it = cat && A && A.obter ? A.obter(cat) : null;
    if (it && it.forma === "frio") return true;
    return /^(ue|u|z|ze|cr)\s+\d/i.test(txt(cat)) && /x\s*\d+,\d+\s*$/.test(txt(cat));
  }
  function familiaDe(rep) {
    if (rep.kind === "chapa") return rep.dobras ? "dobrado" : "chapa";
    if (rep.kind === "mec") return "barra";
    var forma = rep.perfil && rep.perfil.forma;
    if (forma === "tubo-ret" || forma === "tubo-circ") return "tubo";
    if (forma === "ret" || forma === "circ") return "barra";
    if (ehFrio(rep)) return "dobrado";
    return "perfil";
  }

  /* ============================================ LEVANTAMENTO (do modelo numerado) */
  function levantar(L, n) {
    L = L || {}; n = n || {};
    var porMarca = {}; arr(L.pecas).forEach(function (p) { porMarca[p.marca] = p; });
    var fam = {}; FAMILIAS.forEach(function (f) { fam[f[0]] = { kg: 0, pecas: 0 }; });
    var q = { kg: 0, pecas: 0, furos: 0, metroSolda: 0, m2: 0, conjuntos: 0, conjuntosSoldados: 0 }, avisos = [], semSolda = 0, semPeso = 0;
    arr(n.grupos).forEach(function (g) {
      var rep = g.rep || {}, qt = arr(g.ids).length, lp = porMarca[g.marca], kg = lp ? num(lp.pesoTotal, 0) : 0;
      if (!(kg > 0)) { semPeso += qt; }
      var f = familiaDe(rep);
      fam[f].kg += kg; fam[f].pecas += qt; q.kg += kg; q.pecas += qt;
      q.furos += arr(rep.furos).length * qt;
      if (lp) q.m2 += num(lp.pinturaTotal, 0);
      if (rep.soldadaEm) {
        var lados = rep.solda ? (rep.solda.lados === "um" ? 1 : 2) : 2;
        if (!rep.solda) semSolda += qt;
        q.metroSolda += num(rep.L, 0) / 1000 * lados * qt;
      }
    });
    arr(n.conjuntos).forEach(function (c) {
      var qc = arr(c.conjuntos).length; q.conjuntos += qc;
      if (arr(c.partes).length) q.conjuntosSoldados += qc;
    });
    if (semPeso) avisos.push(semPeso + " peça(s) sem peso no modelo (perfil sem catálogo?) ficaram com 0 kg — o aço delas não está no orçamento.");
    if (semSolda) avisos.push(semSolda + " peça(s) soldada(s) sem a especificação da solda: contei 2 lados para estimar os metros de solda.");
    if (q.metroSolda > 0) avisos.push("Metros de solda ESTIMADOS (comprimento da peça soldada × lados): o modelo não tem o comprimento real do cordão.");
    Object.keys(fam).forEach(function (k) { fam[k].kg = r2(fam[k].kg); });
    return { fam: fam, q: { kg: r2(q.kg), ton: r3(q.kg / 1000), pecas: q.pecas, furos: q.furos, metroSolda: r2(q.metroSolda), m2: r3(q.m2), conjuntos: q.conjuntos, conjuntosSoldados: q.conjuntosSoldados }, avisos: avisos };
  }

  /* ============================================ CÁLCULO */
  /* L = BimMetalFab.listas(estado, n); n = a numeração (L.numeracao); param = tabela da fábrica;
   * opts: { areaM2, relacao } (relacao = a config de consumíveis de metalrelacaofab, editada na tela) */
  function calcular(L, n, param, opts) {
    opts = opts || {}; n = n || (L && L.numeracao) || {};
    var P = normalizar(param), lev = levantar(L, n), q = lev.q, avisos = lev.avisos.slice(), pend = [];
    var perda = P.perdaPct == null ? 0 : P.perdaPct;
    if (P.perdaPct == null) avisos.push("Perda de material não informada: considerei 0 % (informe a perda da fábrica).");

    /* --- material por família */
    var material = [], custoMat = 0;
    FAMILIAS.forEach(function (f) {
      var k = f[0], kg = lev.fam[k].kg, bruto = r2(kg * (1 + perda / 100)), preco = P.aco[k], item = { familia: k, nome: f[1], pecas: lev.fam[k].pecas, kg: kg, kgBruto: bruto, precoKg: preco, custo: null, status: "" };
      if (!(kg > 0)) item.status = "sem peso no modelo";
      else if (preco == null) { item.status = STATUS_COTAR; pend.push("Aço — " + f[1] + ": informar o preço do kg (" + br(kg, 0) + " kg no modelo)."); }
      else { item.custo = r2(bruto * preco); custoMat += item.custo; item.status = "ok"; }
      material.push(item);
    });

    /* --- horas e custo por posto */
    var qtdDriver = { ton: q.ton, peca: q.pecas, furo: q.furos, conjunto: q.conjuntos, metroSolda: q.metroSolda, m2: q.m2 };
    var postos = [], custoMO = 0, horasTot = 0;
    POSTOS.forEach(function (po) {
      var pr = P.prod[po.id], hora = P.hora[po.id], drivers = [], horas = null;
      po.drivers.forEach(function (d) {
        if (pr[d[0]] == null) return;
        var qtd = d[0] === "conjunto" && po.id === "montagem" ? q.conjuntosSoldados : qtdDriver[d[0]];
        var h = r3(pr[d[0]] * qtd);
        drivers.push({ driver: d[0], rotulo: d[1], qtd: r3(qtd), unidade: UNID_DRIVER[d[0]], hPorUn: pr[d[0]], horas: h });
        horas = (horas || 0) + h;
      });
      var item = { posto: po.id, nome: po.nome, hora: hora, drivers: drivers, horas: horas == null ? null : r3(horas), custo: null, status: "" };
      if (horas == null) { item.status = STATUS_PROD; pend.push(po.nome + ": informar a produtividade (h por " + po.drivers.map(function (d) { return UNID_DRIVER[d[0]]; }).join(" ou ") + ")."); }
      else horasTot += horas;
      if (hora == null) { item.status = item.status ? item.status + "; pendente — cotar a hora" : "pendente — cotar a hora"; pend.push(po.nome + ": informar o custo da hora (R$/h)."); }
      if (horas != null && hora != null) { item.custo = r2(horas * hora); custoMO += item.custo; item.status = "ok"; }
      postos.push(item);
    });

    /* --- consumíveis: índice por tonelada (metalrelacaofab) × aço; preço da tabela */
    var consumiveis = [], custoCons = 0, R = RF();
    if (R && R.cfg && R.INDICE_ROTULOS) {
      var C = R.cfg(opts.relacao || {}), cat = {}; (R.catalogoPendente ? R.catalogoPendente() : []).forEach(function (c) { cat[c.chave] = c; });
      Object.keys(R.INDICE_ROTULOS).forEach(function (k) {
        var qtd = ceil(C.indice[k] * q.ton), preco = P.consum[k], c0 = cat[k] || {}, item = { chave: k, descricao: c0.descricao || R.INDICE_ROTULOS[k][0], unidade: c0.unidade || "", indice: C.indice[k], qtd: qtd, preco: preco, custo: null, status: "" };
        if (!(qtd > 0)) item.status = "sem aço no modelo";
        else if (preco == null) { item.status = STATUS_COTAR; pend.push("Consumível — " + item.descricao + ": informar o preço por " + item.unidade + " (" + qtd + " " + item.unidade + ")."); }
        else { item.custo = r2(qtd * preco); custoCons += item.custo; item.status = "ok"; }
        consumiveis.push(item);
      });
    } else avisos.push("Os índices de consumíveis (js/metalrelacaofab.js) não carregaram: consumíveis fora do orçamento.");

    /* --- totais */
    var custo = r2(custoMat + custoMO + custoCons), parcial = pend.length > 0;
    var venda = P.bdiPct == null ? null : r2(custo * (1 + P.bdiPct / 100));
    if (P.bdiPct == null) pend.push("BDI/margem: informar o percentual para obter o preço de venda.");
    var area = num(opts.areaM2, 0);
    var resumo = { custoMaterial: r2(custoMat), custoMaoDeObra: r2(custoMO), custoConsumiveis: r2(custoCons), custo: custo, bdiPct: P.bdiPct, precoVenda: venda, horasTotal: r3(horasTot),
      kg: q.kg, ton: q.ton, areaM2: area > 0 ? area : null, parcial: parcial || P.bdiPct == null,
      custoPorKg: q.kg > 0 && custo > 0 ? r2(custo / q.kg) : null,
      vendaPorKg: venda != null && q.kg > 0 ? r2(venda / q.kg) : null,
      custoPorM2: area > 0 && custo > 0 ? r2(custo / area) : null,
      vendaPorM2: venda != null && area > 0 ? r2(venda / area) : null };
    if (!(area > 0)) avisos.push("Área construída não informada: o R$/m² fica pendente (informe a área em m²).");
    if (!(q.kg > 0)) avisos.push("Não há aço no modelo para orçar.");
    if (resumo.parcial && custo > 0) avisos.push("Total PARCIAL: os itens pendentes ficaram fora da soma.");
    return { material: material, postos: postos, consumiveis: consumiveis, quantidades: q, resumo: resumo, pendencias: pend, avisos: avisos, parametros: P };
  }

  /* ============================================ SAÍDAS */
  function html(O, info) {
    info = info || {}; var s = O.resumo, h = '<div data-mof="orcamento">';
    if (info.obra) h += '<p style="margin:0 0 6px"><b>' + esc(info.obra) + "</b></p>";
    function v(x) { return x == null ? "—" : brl(x); }
    h += '<table class="tbl tbl-compacta" data-mof="resumo"><tbody>' +
      "<tr><td>Aço do modelo</td><td class=\"num\">" + br(s.kg, 0) + " kg (" + br(s.ton, 3) + " t)</td></tr>" +
      "<tr><td>Material (com perda)</td><td class=\"num\">" + brl(s.custoMaterial) + "</td></tr>" +
      "<tr><td>Mão de obra (" + br(s.horasTotal, 1) + " h)</td><td class=\"num\">" + brl(s.custoMaoDeObra) + "</td></tr>" +
      "<tr><td>Consumíveis</td><td class=\"num\">" + brl(s.custoConsumiveis) + "</td></tr>" +
      "<tr style=\"font-weight:600\"><td>Custo" + (s.parcial ? " (parcial)" : "") + "</td><td class=\"num\">" + brl(s.custo) + "</td></tr>" +
      "<tr><td>BDI / margem</td><td class=\"num\">" + (s.bdiPct == null ? "pendente — informar" : br(s.bdiPct, 2) + " %") + "</td></tr>" +
      "<tr style=\"font-weight:600\"><td>Preço de venda" + (s.parcial && s.precoVenda != null ? " (parcial)" : "") + "</td><td class=\"num\">" + v(s.precoVenda) + "</td></tr>" +
      "<tr><td>R$/kg (custo · venda)</td><td class=\"num\">" + v(s.custoPorKg) + " · " + v(s.vendaPorKg) + "</td></tr>" +
      "<tr><td>R$/m² (custo · venda)</td><td class=\"num\">" + (s.areaM2 ? v(s.custoPorM2) + " · " + v(s.vendaPorM2) : "pendente — informar a área") + "</td></tr></tbody></table>";
    h += '<h4 style="margin:10px 0 4px;font-size:13px">Material por família</h4><table class="tbl tbl-compacta" data-mof="material"><thead><tr><th>Família</th><th class="num">Peso (kg)</th><th class="num">Com perda (kg)</th><th class="num">R$/kg</th><th class="num">Custo</th><th>Situação</th></tr></thead><tbody>' +
      O.material.map(function (m) { return "<tr><td>" + esc(m.nome) + '</td><td class="num">' + br(m.kg, 2) + '</td><td class="num">' + br(m.kgBruto, 2) + '</td><td class="num">' + (m.precoKg == null ? "" : br(m.precoKg, 2)) + '</td><td class="num">' + (m.custo == null ? "" : brl(m.custo)) + "</td><td>" + esc(m.status) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<h4 style="margin:10px 0 4px;font-size:13px">Horas por posto</h4><table class="tbl tbl-compacta" data-mof="postos"><thead><tr><th>Posto</th><th>Base de cálculo</th><th class="num">Horas</th><th class="num">R$/h</th><th class="num">Custo</th><th>Situação</th></tr></thead><tbody>' +
      O.postos.map(function (p) { return "<tr><td>" + esc(p.nome) + "</td><td>" + esc(p.drivers.map(function (d) { return br(d.qtd, d.unidade === "t" || d.unidade === "m" || d.unidade === "m²" ? 2 : 0) + " " + d.unidade + " × " + br(d.hPorUn, 3) + " h"; }).join(" + ")) + '</td><td class="num">' + (p.horas == null ? "" : br(p.horas, 2)) + '</td><td class="num">' + (p.hora == null ? "" : br(p.hora, 2)) + '</td><td class="num">' + (p.custo == null ? "" : brl(p.custo)) + "</td><td>" + esc(p.status) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<h4 style="margin:10px 0 4px;font-size:13px">Consumíveis (índice por tonelada × aço)</h4><table class="tbl tbl-compacta" data-mof="consumiveis"><thead><tr><th>Consumível</th><th class="num">Qtd</th><th>Unid.</th><th class="num">Preço unit.</th><th class="num">Custo</th><th>Situação</th></tr></thead><tbody>' +
      O.consumiveis.map(function (c) { return "<tr><td>" + esc(c.descricao) + '</td><td class="num">' + br(c.qtd, 0) + "</td><td>" + esc(c.unidade) + '</td><td class="num">' + (c.preco == null ? "" : br(c.preco, 2)) + '</td><td class="num">' + (c.custo == null ? "" : brl(c.custo)) + "</td><td>" + esc(c.status) + "</td></tr>"; }).join("") + "</tbody></table>";
    if (O.pendencias.length) h += '<h4 style="margin:10px 0 4px;font-size:13px">Pendências (' + O.pendencias.length + ")</h4><ul data-mof=\"pendencias\" style=\"font-size:12px;margin:0 0 6px 18px\">" + O.pendencias.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
    O.avisos.forEach(function (a) { h += '<p style="font-size:12px;margin:4px 0;color:#a86a10">' + esc(a) + "</p>"; });
    h += '<p style="font-size:11px;margin:8px 0 0" class="muted">Preços, horas, produtividades e BDI são os da tabela de parâmetros da fábrica (nenhum valor é inventado). Fora deste orçamento: parafusos e chumbadores, tinta, galvanização, içamento e frete — ver o Orçamento da estrutura. Modelagem e fabricação; não é cálculo estrutural.</p>';
    return h + "</div>";
  }
  function htmlDocumento(O, info) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento de fábrica — por kg e hora</title><style>body{font:13px/1.4 Arial,sans-serif;margin:24px;color:#1d2733}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #9aa7b4;padding:3px 8px;text-align:left}th{background:#dde5ee}.num{text-align:right}</style></head><body><h2>Orçamento de fábrica — por kg e hora</h2>' + html(O, info) + "</body></html>";
  }

  /* .xlsx (ExcelJS): Resumo, Material, Mão de obra, Consumíveis, Pendências, Parâmetros, Leia-me */
  function xlsx(O, ExcelJS, info) {
    info = info || {}; var s = O.resumo, P = O.parametros;
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var CINZA = "FFDDE5EE", BORDA = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    function aba(nome, cols, linhas) {
      var ws = wb.addWorksheet(nome);
      ws.columns = cols.map(function (c) { return { header: c[1], key: c[0], width: c[2] || 14 }; });
      linhas.forEach(function (l) { ws.addRow(l); });
      var cab = ws.getRow(1); cab.font = { bold: true }; cab.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }; c.border = BORDA; });
      cols.forEach(function (c, i) { if (c[3]) ws.getColumn(i + 1).numFmt = c[3]; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      return ws;
    }
    var ws = wb.addWorksheet("Resumo");
    ws.columns = [{ width: 44 }, { width: 22 }, { width: 30 }];
    ws.getCell("A1").value = "ORÇAMENTO DE FÁBRICA — POR KG E HORA"; ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = info.obra || "";
    var linhas = [["Aço do modelo (kg)", s.kg, "#,##0.00"], ["Aço do modelo (t)", s.ton, "#,##0.000"], ["Material com perda (R$)", s.custoMaterial, "#,##0.00"],
      ["Mão de obra (R$)", s.custoMaoDeObra, "#,##0.00"], ["Horas totais", s.horasTotal, "#,##0.00"], ["Consumíveis (R$)", s.custoConsumiveis, "#,##0.00"],
      ["CUSTO" + (s.parcial ? " (PARCIAL — há pendências)" : "") + " (R$)", s.custo, "#,##0.00"], ["BDI / margem (%)", s.bdiPct, "0.00"], ["PREÇO DE VENDA (R$)", s.precoVenda, "#,##0.00"],
      ["Custo por kg (R$/kg)", s.custoPorKg, "#,##0.00"], ["Venda por kg (R$/kg)", s.vendaPorKg, "#,##0.00"], ["Área construída (m²)", s.areaM2, "#,##0.00"],
      ["Custo por m² (R$/m²)", s.custoPorM2, "#,##0.00"], ["Venda por m² (R$/m²)", s.vendaPorM2, "#,##0.00"]];
    linhas.forEach(function (l, i) { var r = 4 + i, c = ws.getCell("B" + r); ws.getCell("A" + r).value = l[0]; ws.getCell("A" + r).border = BORDA; c.border = BORDA; if (l[1] == null) { c.value = STATUS_COTAR.replace("cotar", "informar"); c.font = { italic: true }; } else { c.value = l[1]; c.numFmt = l[2]; } if (/^(CUSTO|PREÇO)/.test(l[0])) { ws.getCell("A" + r).font = { bold: true }; c.font = { bold: true }; } });
    aba("Material", [["nome", "Família", 42], ["pecas", "Peças", 8, "0"], ["kg", "Peso (kg)", 14, "#,##0.00"], ["kgBruto", "Com perda (kg)", 16, "#,##0.00"], ["precoKg", "R$/kg", 12, "#,##0.00"], ["custo", "Custo (R$)", 16, "#,##0.00"], ["status", "Situação", 22]],
      O.material.map(function (m) { return { nome: m.nome, pecas: m.pecas, kg: m.kg, kgBruto: m.kgBruto, precoKg: m.precoKg == null ? "" : m.precoKg, custo: m.custo == null ? "" : m.custo, status: m.status }; }));
    var linMO = []; O.postos.forEach(function (p) {
      if (!p.drivers.length) linMO.push({ posto: p.nome, base: "", qtd: "", hun: "", horas: "", hora: p.hora == null ? "" : p.hora, custo: "", status: p.status });
      p.drivers.forEach(function (d, i) { linMO.push({ posto: p.nome, base: d.rotulo, qtd: d.qtd, hun: d.hPorUn, horas: d.horas, hora: i === 0 ? (p.hora == null ? "" : p.hora) : "", custo: i === 0 ? (p.custo == null ? "" : p.custo) : "", status: i === 0 ? p.status : "" }); });
    });
    aba("Mão de obra", [["posto", "Posto", 22], ["base", "Base de cálculo", 36], ["qtd", "Quantidade", 14, "#,##0.00"], ["hun", "h por unidade", 14, "0.000"], ["horas", "Horas", 12, "#,##0.00"], ["hora", "R$/h", 12, "#,##0.00"], ["custo", "Custo (R$)", 16, "#,##0.00"], ["status", "Situação", 34]], linMO);
    aba("Consumíveis", [["descricao", "Consumível", 34], ["unidade", "Unid.", 8], ["indice", "Índice por tonelada", 18, "0.000"], ["qtd", "Quantidade", 12, "0"], ["preco", "Preço unit. (R$)", 16, "#,##0.00"], ["custo", "Custo (R$)", 16, "#,##0.00"], ["status", "Situação", 22]],
      O.consumiveis.map(function (c) { return { descricao: c.descricao, unidade: c.unidade, indice: c.indice, qtd: c.qtd, preco: c.preco == null ? "" : c.preco, custo: c.custo == null ? "" : c.custo, status: c.status }; }));
    aba("Pendências", [["t", "O que falta informar / cotar", 100]], O.pendencias.map(function (t) { return { t: t }; }));
    var par = []; FAMILIAS.forEach(function (f) { par.push({ g: "Aço (R$/kg)", i: f[1], v: P.aco[f[0]] == null ? "" : P.aco[f[0]] }); });
    POSTOS.forEach(function (po) { par.push({ g: "Hora (R$/h)", i: po.nome, v: P.hora[po.id] == null ? "" : P.hora[po.id] }); po.drivers.forEach(function (d) { par.push({ g: "Produtividade", i: po.nome + " — " + d[1], v: P.prod[po.id][d[0]] == null ? "" : P.prod[po.id][d[0]] }); }); });
    O.consumiveis.forEach(function (c) { par.push({ g: "Consumível (R$/unid.)", i: c.descricao, v: c.preco == null ? "" : c.preco }); });
    par.push({ g: "Perda", i: "Perda de material (%)", v: P.perdaPct == null ? "" : P.perdaPct }); par.push({ g: "BDI", i: "BDI / margem (%)", v: P.bdiPct == null ? "" : P.bdiPct });
    aba("Parâmetros", [["g", "Grupo", 24], ["i", "Item", 60], ["v", "Valor", 14, "#,##0.00##"]], par);
    var wl = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica: orçamento de fábrica por kg e hora.",
     "Aço por kg (por família de perfil) × peso do modelo, com a perda da fábrica; mão de obra por posto = horas (produtividade × quantidade do modelo) × custo da hora; consumíveis = índice por tonelada (js/metalrelacaofab.js) × aço × preço unitário; BDI/margem sobre o custo.",
     "Todos os preços, horas, produtividades e o BDI vêm da tabela de parâmetros da fábrica. Nenhum valor foi inventado: o que está em branco sai 'pendente' e fica fora da soma (total PARCIAL).",
     "Metros de solda são ESTIMADOS (comprimento da peça soldada × lados). Fora deste orçamento: parafusos e chumbadores, tinta, galvanização, içamento e frete (ver o Orçamento da estrutura).",
     "Modelagem e fabricação — não é cálculo estrutural."].concat(O.avisos).forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 150;
    return wb;
  }

  var BimMetalOrcFab = {
    ENTIDADE: ENTIDADE, STATUS_COTAR: STATUS_COTAR, STATUS_PROD: STATUS_PROD, FAMILIAS: FAMILIAS, POSTOS: POSTOS, UNID_DRIVER: UNID_DRIVER,
    vazio: vazio, normalizar: normalizar, algumPreenchido: algumPreenchido, familiaDe: familiaDe, levantar: levantar, calcular: calcular,
    html: html, htmlDocumento: htmlDocumento, xlsx: xlsx, br: br, postoDe: postoDe
  };
  global.BimMetalOrcFab = BimMetalOrcFab;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalOrcFab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

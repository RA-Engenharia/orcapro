/* =====================================================================
 * importador.js — AGENTE IMPORTADOR de planilhas (PURO, Node-testável).
 * "Analisa a planilha independente do formato e traz pra dentro já como
 *  etapas + itens." Recebe a MATRIZ 2D da planilha (a UI extrai do Excel/CSV
 *  via ExcelJS) e DETECTA a estrutura — não assume layout:
 *   1) acha a linha de cabeçalho (mais rótulos reconhecidos);
 *   2) detecta o PAPEL de cada coluna por sinônimos de cabeçalho + CONTEÚDO
 *      (código SINAPI = 5–7 dígitos; unidade ∈ dicionário; R$ = moeda BR/US;
 *       quantidade = número; descrição = coluna de mais texto);
 *   3) classifica cada linha: etapa/grupo × item × ignorar (totais);
 *   4) normaliza número BR (1.234,56) E US (1,234.56);
 *   5) devolve { etapas:[{nome,codigo,itens:[...]}], colunas, confianca, avisos }.
 * A UI depois casa o código na base SINAPI (Sinapi.obter) / sugere (Sinapi.buscar)
 * e cria o orçamento (Orcamento.addEtapa/addItem). NUNCA inventa código SINAPI.
 * ===================================================================== */
(function (global) {
  "use strict";

  // sinônimos de cabeçalho por papel (comparados normalizados: minúsculo, sem acento)
  var HDR = {
    codigo: ["codigo", "cod", "cod.", "referencia", "ref", "ref.", "banco", "fonte", "codigo sinapi", "cod sinapi", "item sinapi", "codigo do servico", "code"],
    descricao: ["descricao", "servico", "servicos", "discriminacao", "descriminacao", "especificacao", "atividade", "insumo", "composicao", "descricao dos servicos", "descricao do servico", "description", "service"],
    unidade: ["un", "und", "unid", "unidade", "medida", "um"],
    quantidade: ["qtd", "qtde", "quant", "quantidade", "qtd.", "qty", "quantity"],
    custoUnit: ["unitario", "preco unit", "preco unitario", "valor unit", "valor unitario", "custo unit", "custo unitario", "p unit", "punit", "vlr unit", "preco unit.", "unit price", "unit cost", "price"],
    custoTotal: ["total", "valor total", "custo total", "preco total", "vlr total", "subtotal", "amount"]
  };
  // unidades reconhecidas (normalizadas)
  var UNID = { "m2": 1, "m²": 1, "m3": 1, "m³": 1, "m": 1, "ml": 1, "kg": 1, "un": 1, "und": 1, "unid": 1, "pc": 1, "vb": 1, "cj": 1, "l": 1, "t": 1, "h": 1, "dia": 1, "mes": 1, "gl": 1, "pt": 1, "cx": 1, "par": 1, "km": 1, "ha": 1 };
  var UNID_NORM = { "m2": "m²", "m²": "m²", "m3": "m³", "m³": "m³", "und": "un", "unid": "un", "ml": "m" };
  var TOTAL_KW = ["total", "subtotal", "total geral", "totais", "bdi", "resumo"];

  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/\s+/g, " ").trim();
  }
  // extrai o valor primitivo de uma célula (aceita célula "crua" ou objeto ExcelJS)
  function txt(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v.result != null) return String(v.result);
      if (v.text != null) return String(v.text);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      if (v.hyperlink != null && v.text != null) return String(v.text);
      if (v.value != null) return String(v.value);
      return "";
    }
    return String(v);
  }
  // Número BR (1.234,56) e US (1,234.56): o ÚLTIMO separador é o decimal.
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    if (v && typeof v === "object" && v.result != null) return num(v.result);
    if (v == null) return NaN;
    var neg = /-/.test(String(v));
    var s = String(v).replace(/[^\d.,]/g, "");
    if (!s) return NaN;
    var hasC = s.indexOf(",") > -1, hasD = s.indexOf(".") > -1;
    if (hasC && hasD) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", "."); // BR
      else s = s.replace(/,/g, ""); // US
    } else if (hasC) {
      var pc = s.split(","); s = pc.slice(0, -1).join("") + "." + pc[pc.length - 1];
    } else if (hasD) {
      var pd = s.split(".");
      if (pd.length > 2) s = pd.slice(0, -1).join("") + "." + pd[pd.length - 1];        // 1.234.567 → milhar
      else if (pd[1] && pd[1].length === 3) s = pd.join("");                             // 1.234 → milhar
      // senão (1.5 / 12.34) fica decimal
    }
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -n : n;
  }
  // Código SINAPI = inteiro puro 5–8 dígitos (sem vírgula/ponto). Rejeita moeda ("24,50"),
  // hierárquico ("1.1") e quantidade decimal — que não são código.
  function ehCodSinapi(v) { var s = txt(v).trim(); return /^\d{5,8}$/.test(s) ? s : null; }
  function ehUnid(v) { return !!UNID[norm(v)]; }
  function normUnid(v) { var k = norm(v); return UNID_NORM[k] || (UNID[k] ? k : txt(v).trim()); }
  function ehMoeda(v) { var t = txt(v); return /r\$/i.test(t) || (/\d/.test(t) && /[.,]\d{2}\b/.test(t) && !ehUnid(v)); }
  function ehNum(v) { return !isNaN(num(v)); }
  // coluna estritamente 1,2,3… (índice de linha) — não é quantidade real
  function pareceIndice(vals) {
    var seq = vals.map(function (v) { return num(v); }).filter(function (n) { return !isNaN(n); });
    if (seq.length < 3) return false;
    for (var i = 0; i < seq.length; i++) { if (seq[i] !== i + 1 && seq[i] !== Math.round(seq[i]) ) return false; if (seq[i] !== i + 1) return false; }
    return true;
  }

  function acharCabecalho(linhas, nCols) {
    var melhor = -1, melhorScore = 1; // exige >= 2 rótulos p/ considerar cabeçalho
    var lim = Math.min(linhas.length, 15);
    for (var i = 0; i < lim; i++) {
      var sc = 0;
      for (var c = 0; c < nCols; c++) {
        var h = norm(txt(linhas[i][c])); if (!h) continue;
        for (var role in HDR) { if (achaHdr(h) === role) { sc++; break; } }
      }
      if (sc > melhorScore) { melhorScore = sc; melhor = i; }
    }
    return melhor;
  }
  // Match por PALAVRA INTEIRA (sinônimo de 1 palavra) ou substring (sinônimo multi-palavra).
  // Evita "custo unitário" casar 'un' (unidade) por conter " un".
  function achaHdr(h) {
    if (!h) return null;
    var words = h.split(/\s+/);
    for (var role in HDR) {
      var syn = HDR[role];
      for (var k = 0; k < syn.length; k++) {
        var sy = syn[k];
        if (h === sy) return role;
        if (sy.indexOf(" ") > -1) { if (h.indexOf(sy) > -1) return role; }
        else if (words.indexOf(sy) > -1) return role;
      }
    }
    return null;
  }

  function detectarColunas(linhas, headerIdx, nCols) {
    var roles = { codigo: null, descricao: null, unidade: null, quantidade: null, custoUnit: null, custoTotal: null };
    var hdr = headerIdx >= 0 ? linhas[headerIdx] : null;
    var sample = [], start = headerIdx >= 0 ? headerIdx + 1 : 0;
    for (var i = start; i < linhas.length && sample.length < 50; i++) sample.push(linhas[i]);
    var stat = [];
    for (var c = 0; c < nCols; c++) {
      var vals = sample.map(function (r) { return r[c]; }).filter(function (v) { return txt(v).trim() !== ""; });
      var n = vals.length || 1, cod = 0, unid = 0, moeda = 0, numero = 0, texto = 0, totLen = 0;
      vals.forEach(function (v) {
        var s = txt(v).trim();
        if (ehCodSinapi(v)) cod++;
        if (ehUnid(v)) unid++;
        if (ehMoeda(v)) moeda++;
        if (ehNum(v)) numero++;
        if (s && isNaN(num(v)) && !ehUnid(v)) { texto++; totLen += s.length; }
      });
      stat.push({ c: c, h: hdr ? norm(txt(hdr[c])) : "", n: n, vals: vals,
        f: { cod: cod / n, unid: unid / n, moeda: moeda / n, numero: numero / n, texto: texto / n }, avgLen: texto ? totLen / texto : 0 });
    }
    function usado(c) { for (var r in roles) if (roles[r] === c) return true; return false; }
    // 1) cabeçalho manda (forte)
    stat.forEach(function (s) { var role = achaHdr(s.h); if (role && roles[role] == null) roles[role] = s.c; });
    // 2) conteúdo p/ papéis ainda vazios
    function assign(role, scorer, min) { if (roles[role] != null) return; var best = null, bs = 0; stat.forEach(function (s) { if (usado(s.c)) return; var v = scorer(s); if (v > bs) { bs = v; best = s; } }); if (best && bs >= (min || 0.5)) roles[role] = best.c; }
    assign("codigo", function (s) { return s.f.cod; }, 0.5);
    assign("unidade", function (s) { return s.f.unid; }, 0.4);
    assign("quantidade", function (s) { return (s.f.numero > 0.5 && s.f.moeda < 0.4 && s.f.cod < 0.4 && !pareceIndice(s.vals)) ? s.f.numero - s.f.moeda : 0; }, 0.4);
    // custo unitário × total: distinguir por MAGNITUDE (total ≈ unit × qtd ≥ unit), não por posição
    // de coluna — a ordem posicional invertia unit/total em planilha sem cabeçalho (revisão adversarial).
    var moedaCols = stat.filter(function (s) { return !usado(s.c) && s.f.moeda >= 0.4; });
    moedaCols.forEach(function (s) { s._soma = s.vals.reduce(function (a, v) { var x = num(v); return a + (isFinite(x) && x > 0 ? x : 0); }, 0); });
    moedaCols.sort(function (a, b) { return b._soma - a._soma; }); // maior soma primeiro = candidato a total
    if (roles.custoTotal == null && roles.custoUnit == null && moedaCols.length >= 2) {
      roles.custoTotal = moedaCols[0].c; // maior magnitude = total
      roles.custoUnit = moedaCols[1].c;  // 2ª maior = unitário
    } else { // um dos papéis já veio do cabeçalho, ou só há 1 coluna de moeda
      if (roles.custoUnit == null && moedaCols.length) { var mu = moedaCols[moedaCols.length - 1]; if (mu.c !== roles.custoTotal) roles.custoUnit = mu.c; }
      if (roles.custoTotal == null && moedaCols.length) { var mt = moedaCols[0]; if (mt.c !== roles.custoUnit) roles.custoTotal = mt.c; }
    }
    if (roles.descricao == null) { var best = null, bl = 0; stat.forEach(function (s) { if (usado(s.c)) return; if (s.f.texto >= 0.4 && s.avgLen > bl) { bl = s.avgLen; best = s; } }); if (best) roles.descricao = best.c; }
    return roles;
  }

  function ehTotal(desc) { var nd = norm(desc); if (!nd) return false; for (var i = 0; i < TOTAL_KW.length; i++) { if (nd === TOTAL_KW[i] || nd.indexOf(TOTAL_KW[i] + " ") === 0) return true; } return false; }
  function classificar(row, cols) {
    var desc = cols.descricao != null ? txt(row[cols.descricao]).trim() : "";
    if (ehTotal(desc)) return "ignorar";
    var temCod = cols.codigo != null && !!ehCodSinapi(row[cols.codigo]);
    var temQtd = cols.quantidade != null && num(row[cols.quantidade]) > 0;
    var temUnit = cols.custoUnit != null && num(row[cols.custoUnit]) > 0;
    var temTot = cols.custoTotal != null && num(row[cols.custoTotal]) > 0;
    if (temCod || temQtd || temUnit || temTot) return "item";
    if (desc) return "etapa";
    return "ignorar";
  }
  function codigoEtapaDe(row, cols) {
    if (cols.codigo == null) return "";
    var s = txt(row[cols.codigo]).trim();
    return (/^\d{1,2}(\.\d{1,2})*$/.test(s) && !ehCodSinapi(row[cols.codigo])) ? s : "";
  }

  var Importador = {
    _num: num, _txt: txt, _norm: norm, _ehCodSinapi: ehCodSinapi, _detectarColunas: detectarColunas, _acharCabecalho: acharCabecalho,

    // Analisa a matriz 2D e devolve a estrutura detectada. opts:{ headerRow, colunas }
    // permite forçar cabeçalho/mapa (usado pelo mapeamento manual da UI).
    analisar: function (matriz, opts) {
      opts = opts || {};
      var avisos = [];
      var linhas = (matriz || []).filter(function (r) { return r && r.some(function (c) { return txt(c).trim() !== ""; }); });
      if (!linhas.length) return { erro: "vazia", etapas: [], colunas: {}, confianca: 0, avisos: ["Planilha sem dados legíveis."], resumo: { etapas: 0, itens: 0, ignoradas: 0 } };
      var nCols = 0; linhas.forEach(function (r) { if (r.length > nCols) nCols = r.length; });
      var headerIdx = opts.headerRow != null ? opts.headerRow : acharCabecalho(linhas, nCols);
      var cols = opts.colunas || detectarColunas(linhas, headerIdx, nCols);
      if (cols.descricao == null) avisos.push("Não identifiquei a coluna de descrição — ajuste no mapeamento.");
      if (cols.quantidade == null && cols.custoUnit == null && cols.custoTotal == null) avisos.push("Não identifiquei quantidade nem valores — ajuste no mapeamento.");

      var start = headerIdx >= 0 ? headerIdx + 1 : 0;
      var etapas = [], atual = null, nItens = 0, nEtapas = 0, nIgn = 0, semQtd = 0, semCusto = 0;
      for (var i = start; i < linhas.length; i++) {
        var row = linhas[i], cls = classificar(row, cols);
        if (cls === "ignorar") { nIgn++; continue; }
        var desc = cols.descricao != null ? txt(row[cols.descricao]).trim() : "";
        if (cls === "etapa") { atual = { nome: desc || ("Etapa " + (nEtapas + 1)), codigo: codigoEtapaDe(row, cols), itens: [] }; etapas.push(atual); nEtapas++; continue; }
        if (!atual) { atual = { nome: "Serviços", codigo: "", itens: [] }; etapas.push(atual); nEtapas++; }
        var qtd = cols.quantidade != null ? num(row[cols.quantidade]) : NaN;
        var unit = cols.custoUnit != null ? num(row[cols.custoUnit]) : NaN;
        var tot = cols.custoTotal != null ? num(row[cols.custoTotal]) : NaN;
        if (!(unit > 0) && tot > 0 && qtd > 0) unit = tot / qtd;      // deriva unitário
        if (!(qtd > 0) && tot > 0 && unit > 0) qtd = tot / unit;      // deriva quantidade
        if (!(qtd > 0)) { qtd = 1; semQtd++; }
        if (!(unit >= 0)) { unit = 0; }
        if (!(unit > 0)) semCusto++;
        atual.itens.push({
          codigo: cols.codigo != null ? (ehCodSinapi(row[cols.codigo]) || "") : "",
          descricao: desc || "(sem descrição)",
          unidade: cols.unidade != null ? normUnid(row[cols.unidade]) : "un",
          quantidade: Math.round(qtd * 10000) / 10000,
          custoUnitario: Math.round(unit * 100) / 100
        });
        nItens++;
      }
      etapas = etapas.filter(function (e) { return e.itens.length; });

      var conf = 0;
      if (cols.descricao != null) conf += 0.4;
      if (cols.codigo != null) conf += 0.2;
      if (cols.quantidade != null) conf += 0.15;
      if (cols.custoUnit != null || cols.custoTotal != null) conf += 0.15;
      if (nItens > 0) conf += 0.1;
      if (!nItens) avisos.push("Nenhum item reconhecido — confira o mapeamento das colunas.");
      if (semCusto && nItens) avisos.push(semCusto + " item(ns) sem custo na planilha — o preço virá da base SINAPI ao casar o código, ou entram como R$ 0,00 p/ você preencher.");

      return {
        etapas: etapas, colunas: cols, headerRow: headerIdx,
        confianca: Math.round(Math.min(1, conf) * 100) / 100,
        resumo: { etapas: etapas.length, itens: nItens, ignoradas: nIgn, semQtd: semQtd, semCusto: semCusto },
        avisos: avisos
      };
    }
  };

  global.Importador = Importador;
  if (typeof module !== "undefined" && module.exports) module.exports = Importador;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

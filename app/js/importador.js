/* =====================================================================
 * importador.js — AGENTE IMPORTADOR de planilhas (PURO, Node-testável).
 * "Analisa a planilha independente do formato e traz pra dentro já como
 *  etapas + itens." Recebe a MATRIZ 2D (a UI extrai do Excel/CSV) e DETECTA
 *  a estrutura — não assume layout.
 *
 * Endurecido por revisão adversarial (v1.1.41):
 *  - norm() remove pontuação → casa "Quant.", "P. Unit", "Un." nos sinônimos;
 *  - custos por MAGNITUDE (total≈unit×qtd≥unit) — fix do ops (f8ca422) preservado;
 *  - QUANTIDADE detectada DEPOIS dos custos (coluna numérica restante, mesmo com
 *    centavos) → não é mais roubada pela heurística de "moeda";
 *  - num() decide milhar/decimal por COLUNA (dotMode): coluna com vírgula → ponto=milhar
 *    ("1.234"→1234, planilha BR); coluna só com pontos → ponto=decimal ("0.750"→0,75);
 *    trata parênteses contábeis "(500,00)" como negativo;
 *  - txt() nunca devolve "[object Object]" (célula de fórmula com erro → "");
 *  - pareceIndice() reconhece numeração/hierarquia ("1,1.1,2,4,5"), não só 1,2,3;
 *  - confiança HONESTA: sem cabeçalho → baixa + aviso (força mapeamento manual).
 *  - NUNCA inventa código SINAPI.
 * ===================================================================== */
(function (global) {
  "use strict";

  var HDR = {
    codigo: ["codigo", "cod", "referencia", "ref", "banco", "fonte", "codigo sinapi", "cod sinapi", "item sinapi", "codigo do servico", "code"],
    descricao: ["descricao", "servico", "servicos", "discriminacao", "descriminacao", "especificacao", "atividade", "insumo", "composicao", "descricao dos servicos", "descricao do servico", "description", "service"],
    unidade: ["un", "und", "unid", "unidade", "medida", "um"],
    quantidade: ["qtd", "qtde", "quant", "quantidade", "qty", "quantity"],
    custoUnit: ["unitario", "preco unit", "preco unitario", "valor unit", "valor unitario", "custo unit", "custo unitario", "p unit", "punit", "vlr unit", "unit price", "unit cost", "price"],
    custoTotal: ["total", "valor total", "custo total", "preco total", "vlr total", "subtotal", "amount"]
  };
  var UNID = { "m2": 1, "m²": 1, "m3": 1, "m³": 1, "m": 1, "ml": 1, "kg": 1, "un": 1, "und": 1, "unid": 1, "pc": 1, "vb": 1, "cj": 1, "l": 1, "t": 1, "h": 1, "dia": 1, "mes": 1, "gl": 1, "pt": 1, "cx": 1, "par": 1, "km": 1, "ha": 1 };
  var UNID_NORM = { "m2": "m²", "m²": "m²", "m3": "m³", "m³": "m³", "und": "un", "unid": "un", "ml": "m" };
  var TOTAL_KW = ["total", "subtotal", "total geral", "totais", "bdi", "resumo"];

  // minúsculo, sem acento, SEM pontuação (. - _ / viram espaço) → casa "Quant."/"P. Unit"/"Un."
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/[.\-_/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  var HDR_N = {}; (function () { for (var r in HDR) { HDR_N[r] = HDR[r].map(function (x) { return norm(x); }); } })();

  // valor primitivo; célula de fórmula com erro ({result:{error}}) → "" (nunca "[object Object]")
  function txt(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v.result != null) return typeof v.result === "object" ? "" : String(v.result);
      if (v.text != null) return String(v.text);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      if (v.hyperlink != null && v.text != null) return String(v.text);
      return "";
    }
    return String(v);
  }

  // Número. dotMode: 'mil'(ponto=milhar) | 'dec'(ponto=decimal) | undefined(heurística BR).
  // BR (1.234,56), US (1,234.56) e parênteses contábeis "(500,00)" = negativo.
  function num(v, dotMode) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    if (v && typeof v === "object") return (v.result != null && typeof v.result !== "object") ? num(v.result, dotMode) : NaN;
    if (v == null) return NaN;
    var raw = String(v);
    // negativo SÓ quando o '-' é o prefixo do número (após R$/espaço) ou tudo entre parênteses;
    // hífen interno ("87-495", "100 - 200", "1-1/2") NÃO é negativo.
    var neg = /\(\s*[\d.,]+\s*\)/.test(raw) || /^\s*(r\$)?\s*-\s*[\d.,]/i.test(raw);
    var s = raw.replace(/[^\d.,]/g, "");
    if (!s) return NaN;
    var hasC = s.indexOf(",") > -1, hasD = s.indexOf(".") > -1;
    if (hasC && hasD) { if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); }
    else if (hasC) { var pc = s.split(","); s = pc.slice(0, -1).join("") + "." + pc[pc.length - 1]; }
    else if (hasD) {
      var pd = s.split(".");
      if (pd.length > 2) s = (dotMode === "dec") ? (pd.slice(0, -1).join("") + "." + pd[pd.length - 1]) : pd.join("");  // 2+ pontos sem vírgula = milhar: 1.234.567 → 1234567 (US só se dotMode='dec')
      else if (pd[1] && pd[1].length === 3) {
        // ambíguo (1 ponto, 3 díg): "1.234" (milhar BR) vs "0.750" (decimal) → dotMode/heurística decide.
        if (dotMode === "dec") { /* decimal: mantém */ }
        else if (dotMode === "mil" && pd[0] !== "0" && pd[0] !== "") s = pd.join("");  // guard de zero-à-esquerda também no 'mil': 0.750→0,75 (não 750)
        else if (dotMode !== "mil" && pd[0] !== "0" && pd[0] !== "") s = pd.join("");
      }
      // fração de 1-2 dígitos (10.5 / 12.34) → SEMPRE decimal (não ambíguo); dotMode não interfere.
    }
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  }
  function ehCodSinapi(v) { var s = txt(v).trim(); return /^\d{5,8}$/.test(s) ? s : null; }
  function ehUnid(v) { return !!UNID[norm(v)]; }
  function normUnid(v) { var k = norm(v); return UNID_NORM[k] || (UNID[k] ? k : txt(v).trim()); }
  function ehMoeda(v) { var t = txt(v); return /r\$/i.test(t) || (/\d/.test(t) && /[.,]\d{2}\b/.test(t) && !ehUnid(v)); }
  function ehNum(v) { return !isNaN(num(v)); }

  // coluna de numeração/hierarquia: maioria ^\d+(\.\d+)*$ e (tem N.N OU inteiro crescente passo ~1)
  function pareceIndice(vals) {
    var strs = vals.map(function (v) { return txt(v).trim(); }).filter(function (s) { return s !== ""; });
    if (strs.length < 3) return false;
    if (strs.filter(function (s) { return /^\d+(\.\d+)*$/.test(s); }).length / strs.length < 0.8) return false;
    var comPonto = strs.filter(function (s) { return s.indexOf(".") > -1; });
    if (comPonto.length) {
      // distingue HIERARQUIA (1,1.1,2,2.1 ou 1.1,1.2,1.3) de DECIMAIS (1.5,2.5,3.75 = quantidade):
      if (comPonto.length < strs.length) return true;                          // mistura inteiro+pontuado = hierarquia
      var lid = comPonto.map(function (s) { return s.split(".")[0]; }), repete = false;
      for (var j = 1; j < lid.length; j++) if (lid.indexOf(lid[j]) !== j) repete = true;
      return repete;                                                           // mesmo líder = hierarquia; líderes distintos = decimal
    }
    var ns = strs.map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
    if (ns.length < 3 || ns[0] > 2) return false;                              // numeração começa em 0/1/2
    for (var i = 1; i < ns.length; i++) if (ns[i] < ns[i - 1]) return false;   // monotônica (lacuna ok: 1,2,4,5)
    return true;
  }

  function achaHdr(h) {
    if (!h) return null;
    var words = h.split(" ");
    for (var role in HDR_N) {
      var syn = HDR_N[role];
      for (var k = 0; k < syn.length; k++) {
        var sy = syn[k];
        if (h === sy) return role;
        if (sy.indexOf(" ") > -1) { if (h.indexOf(sy) > -1) return role; }
        else if (words.indexOf(sy) > -1) return role;
      }
    }
    return null;
  }
  function acharCabecalho(linhas, nCols) {
    var melhor = -1, melhorScore = 1, lim = Math.min(linhas.length, 15);
    for (var i = 0; i < lim; i++) {
      var sc = 0;
      for (var c = 0; c < nCols; c++) { var h = norm(txt(linhas[i][c])); if (h && achaHdr(h)) sc++; }
      if (sc > melhorScore) { melhorScore = sc; melhor = i; }
    }
    return melhor;
  }

  // valor com EXATAMENTE 2 casas decimais (cara de preço R$)
  function ehDois(v) { var m = txt(v).match(/[.,](\d+)\s*$/); return m ? m[1].length === 2 : false; }
  function fracDois(vals) { var n = 0, ok = 0; vals.forEach(function (v) { if (txt(v).trim() === "") return; n++; if (ehDois(v)) ok++; }); return n ? ok / n : 0; }
  // Acha (qtd, unit, total) pela RELAÇÃO total ≈ qtd×unit entre colunas numéricas livres — robusto
  // p/ planilha SEM cabeçalho (não depende de magnitude, que troca qtd↔custo em material barato).
  // Só devolve se conseguir desambiguar qtd×unit (preço = mais casas-de-2-decimais); senão null
  // (deixa o magnitude/reorder decidir). Preserva o comportamento do ops nos casos que ele já cobre.
  function acharPorRelacao(stat, usado) {
    var cand = stat.filter(function (s) { return !usado(s.c) && s.f.numero > 0.6 && s.f.cod < 0.3 && !pareceIndice(s.vals); });
    if (cand.length < 3) return null;
    for (var ci = 0; ci < cand.length; ci++) {
      var C = cand[ci];
      for (var ai = 0; ai < cand.length; ai++) {
        if (ai === ci) continue;
        for (var bi = ai + 1; bi < cand.length; bi++) {
          if (bi === ci) continue;
          var A = cand[ai], B = cand[bi], nr = Math.min(A.vals.length, B.vals.length, C.vals.length), tot = 0, hit = 0;
          for (var r = 0; r < nr; r++) {
            var av = num(A.vals[r]), bv = num(B.vals[r]), cv = num(C.vals[r]);
            if (!(av > 0 && bv > 0 && cv > 0)) continue; tot++;
            if (Math.abs(av * bv - cv) <= Math.max(0.02, cv * 0.02)) hit++;
          }
          if (tot >= 3 && hit / tot >= 0.6) {
            var fa = fracDois(A.vals), fb = fracDois(B.vals);
            if (Math.abs(fa - fb) > 0.15) { var u = fa > fb ? A : B, q = fa > fb ? B : A; return { total: C.c, unit: u.c, qtd: q.c }; }
            return null; // relação achada, mas qtd×unit ambíguos → magnitude/reorder decide
          }
        }
      }
    }
    return null;
  }

  function detectarColunas(linhas, headerIdx, nCols) {
    var roles = { codigo: null, descricao: null, unidade: null, quantidade: null, custoUnit: null, custoTotal: null }, fonte = {};
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
    // 1) cabeçalho manda
    stat.forEach(function (s) { var role = achaHdr(s.h); if (role && roles[role] == null) { roles[role] = s.c; fonte[role] = "cabecalho"; } });
    function assign(role, scorer, min) { if (roles[role] != null) return; var best = null, bs = 0; stat.forEach(function (s) { if (usado(s.c)) return; var v = scorer(s); if (v > bs) { bs = v; best = s; } }); if (best && bs >= (min || 0.5)) { roles[role] = best.c; fonte[role] = "conteudo"; } }
    assign("codigo", function (s) { return s.f.cod; }, 0.5);
    assign("unidade", function (s) { return s.f.unid; }, 0.4);
    // 2a) RELAÇÃO total≈qtd×unit — só se NENHUM dos 3 papéis veio do cabeçalho (evita o swap por magnitude
    // em planilha de material sem cabeçalho: preço baixo × qtd grande faria soma(qtd)>soma(unit)).
    if (roles.quantidade == null && roles.custoUnit == null && roles.custoTotal == null) {
      var rel = acharPorRelacao(stat, usado);
      if (rel) { roles.custoTotal = rel.total; roles.custoUnit = rel.unit; roles.quantidade = rel.qtd; fonte.custoTotal = fonte.custoUnit = fonte.quantidade = "relacao"; }
    }
    // 2b) CUSTOS por MAGNITUDE (fix do ops f8ca422 — preservado): maior soma = total, 2ª = unit.
    var moedaCols = stat.filter(function (s) { return !usado(s.c) && s.f.moeda >= 0.4; });
    moedaCols.forEach(function (s) { s._soma = s.vals.reduce(function (a, v) { var x = num(v); return a + (isFinite(x) && x > 0 ? x : 0); }, 0); });
    moedaCols.sort(function (a, b) { return b._soma - a._soma; });
    // há uma 3ª coluna numérica de valor além das 2 de moeda? (indica que existe TOTAL de verdade)
    var terceiraNum = moedaCols.length >= 2 && stat.some(function (s) { return !usado(s.c) && s.c !== moedaCols[0].c && s.c !== moedaCols[1].c && s.f.numero > 0.6 && s.f.cod < 0.4 && !pareceIndice(s.vals); });
    if (roles.custoTotal == null && roles.custoUnit == null && roles.quantidade == null && moedaCols.length === 2 && !terceiraNum) {
      // 2 colunas de valor SEM total → qtd + unit (layout comum cód/desc/un/qtd/preço), NÃO unit+total.
      // unit = mais casas-de-2-decimais (preço tem centavos consistentes); empate → posição (qtd à esquerda).
      var esq = moedaCols[0].c < moedaCols[1].c ? moedaCols[0] : moedaCols[1], dir = esq === moedaCols[0] ? moedaCols[1] : moedaCols[0];
      var fe = fracDois(esq.vals), fd = fracDois(dir.vals), uC, qC;
      if (Math.abs(fe - fd) > 0.15) { uC = fe > fd ? esq : dir; qC = fe > fd ? dir : esq; } else { qC = esq; uC = dir; }
      roles.quantidade = qC.c; fonte.quantidade = "conteudo";
      roles.custoUnit = uC.c; fonte.custoUnit = "conteudo";
    } else if (roles.custoTotal == null && roles.custoUnit == null && moedaCols.length >= 2) {
      roles.custoTotal = moedaCols[0].c; fonte.custoTotal = "conteudo";
      roles.custoUnit = moedaCols[1].c; fonte.custoUnit = "conteudo";
    } else {
      if (roles.custoUnit == null && moedaCols.length) { var mu = moedaCols[moedaCols.length - 1]; if (mu.c !== roles.custoTotal) { roles.custoUnit = mu.c; fonte.custoUnit = "conteudo"; } }
      if (roles.custoTotal == null && moedaCols.length) { var mt = moedaCols[0]; if (mt.c !== roles.custoUnit) { roles.custoTotal = mt.c; fonte.custoTotal = "conteudo"; } }
    }
    // 3) QUANTIDADE — DEPOIS dos custos: coluna numérica restante (pode ter centavos), não código/índice.
    //    (correção adversarial: a coluna de quantidade com centavos NÃO é mais roubada pelo custo.)
    assign("quantidade", function (s) { return (s.f.numero > 0.5 && s.f.cod < 0.4 && !pareceIndice(s.vals)) ? s.f.numero : 0; }, 0.4);
    if (roles.descricao == null) { var bD = null, bl = 0; stat.forEach(function (s) { if (usado(s.c)) return; if (s.f.texto >= 0.4 && s.avgLen > bl) { bl = s.avgLen; bD = s; } }); if (bD) { roles.descricao = bD.c; fonte.descricao = "conteudo"; } }
    roles._fonte = fonte;
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
    if (!desc && !temCod) return "ignorar";   // sem descrição E sem código = linha solta/rodapé, não item real
    if (temCod || temUnit || temTot || temQtd) return "item";
    if (desc) return "etapa";
    return "ignorar";
  }
  function codigoEtapaDe(row, cols) {
    if (cols.codigo == null) return "";
    var s = txt(row[cols.codigo]).trim();
    return (/^\d{1,2}(\.\d{1,2})*$/.test(s) && !ehCodSinapi(row[cols.codigo])) ? s : "";
  }
  // 'mil' se a coluna usa vírgula decimal (ponto=milhar); 'dec' se só pontos (ponto=decimal, ex.: 0.750)
  function dotModeCol(linhas, start, col) {
    if (col == null) return undefined;
    var vir = false, pon = false;
    for (var i = start; i < linhas.length; i++) { var s = txt(linhas[i][col]); if (s.indexOf(",") > -1) vir = true; else if (s.indexOf(".") > -1) pon = true; }
    return vir ? "mil" : (pon ? "dec" : undefined);
  }

  var Importador = {
    _num: num, _txt: txt, _norm: norm, _ehCodSinapi: ehCodSinapi, _ehMoeda: ehMoeda, _pareceIndice: pareceIndice, _detectarColunas: detectarColunas, _acharCabecalho: acharCabecalho,

    analisar: function (matriz, opts) {
      opts = opts || {};
      var avisos = [];
      var linhas = (matriz || []).filter(function (r) { return r && r.some(function (c) { return txt(c).trim() !== ""; }); });
      if (!linhas.length) return { erro: "vazia", etapas: [], colunas: {}, confianca: 0, avisos: ["Planilha sem dados legíveis."], resumo: { etapas: 0, itens: 0, ignoradas: 0 } };
      var nCols = 0; linhas.forEach(function (r) { if (r.length > nCols) nCols = r.length; });
      var headerIdx = opts.headerRow != null ? opts.headerRow : acharCabecalho(linhas, nCols);
      var cols = opts.colunas || detectarColunas(linhas, headerIdx, nCols);
      var fonte = cols._fonte || {};
      if (cols.descricao == null) avisos.push("Não identifiquei a coluna de descrição — ajuste no mapeamento.");
      if (cols.quantidade == null && cols.custoUnit == null && cols.custoTotal == null) avisos.push("Não identifiquei quantidade nem valores — ajuste no mapeamento.");

      var start = headerIdx >= 0 ? headerIdx + 1 : 0;
      var dmQ = dotModeCol(linhas, start, cols.quantidade), dmU = dotModeCol(linhas, start, cols.custoUnit), dmT = dotModeCol(linhas, start, cols.custoTotal);
      var etapas = [], atual = null, nItens = 0, nEtapas = 0, nIgn = 0, semQtd = 0, semCusto = 0;
      for (var i = start; i < linhas.length; i++) {
        var row = linhas[i], cls = classificar(row, cols);
        if (cls === "ignorar") { nIgn++; continue; }
        var desc = cols.descricao != null ? txt(row[cols.descricao]).trim() : "";
        if (cls === "etapa") { atual = { nome: desc || ("Etapa " + (nEtapas + 1)), codigo: codigoEtapaDe(row, cols), itens: [] }; etapas.push(atual); nEtapas++; continue; }
        if (!atual) { atual = { nome: "Serviços", codigo: "", itens: [] }; etapas.push(atual); nEtapas++; }
        var qtd = cols.quantidade != null ? num(row[cols.quantidade], dmQ) : NaN;
        var unit = cols.custoUnit != null ? num(row[cols.custoUnit], dmU) : NaN;
        var tot = cols.custoTotal != null ? num(row[cols.custoTotal], dmT) : NaN;
        if (!(unit > 0) && tot > 0 && qtd > 0) unit = tot / qtd;
        if (!(qtd > 0) && tot > 0 && unit > 0) qtd = tot / unit;
        if (!(qtd > 0)) { qtd = 1; semQtd++; }
        if (!(unit >= 0) || isNaN(unit)) unit = 0;
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

      // confiança HONESTA — reflete a qualidade da detecção (não só "preencheu os slots")
      var conf = 0;
      if (cols.descricao != null) conf += 0.35;
      if (cols.quantidade != null) conf += 0.2;
      if (cols.custoUnit != null || cols.custoTotal != null) conf += 0.2;
      if (cols.codigo != null) conf += 0.1;
      if (nItens > 0) conf += 0.15;
      var porConteudo = ["descricao", "quantidade", "custoUnit", "custoTotal"].filter(function (r) { return cols[r] != null && fonte[r] === "conteudo"; }).length;
      if (headerIdx < 0) { conf *= 0.55; avisos.push("Não reconheci uma linha de cabeçalho — deduzi as colunas pelo conteúdo. ⚠️ Revise o mapeamento antes de importar."); }
      else if (porConteudo > 0) { conf *= 0.82; avisos.push("Algumas colunas foram deduzidas pelo conteúdo (cabeçalho parcial) — confira o mapeamento."); }
      if (!nItens) avisos.push("Nenhum item reconhecido — confira o mapeamento das colunas.");
      if (semCusto && nItens) avisos.push(semCusto + " item(ns) sem custo na planilha — o preço virá do SINAPI ao casar o código, ou entram como R$ 0,00 p/ você preencher.");

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

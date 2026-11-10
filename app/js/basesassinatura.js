/* =====================================================================
 * basesassinatura.js — IMPORTAR O ARQUIVO QUE A EMPRESA COMPROU (FDE, EMOP e afins)
 *
 * POR QUE ISTO EXISTE (10/11/2026, pedido do Rogério). Algumas tabelas de preço
 * só existem por ASSINATURA do órgão (FDE-SP, EMOP-RJ). A RA não pode comprar uma
 * e distribuir a todos: sem licença de redistribuição isso é cópia indevida. O
 * caminho certo é POR EMPRESA — cada uma contrata no site do órgão, baixa o
 * arquivo da área dela e o importa aqui. O arquivo nunca sai da conta dela.
 *
 * ⚠ NÃO EXISTE ARQUIVO REAL DA FDE NEM DA EMOP NESTA BASE DE CÓDIGO, e nenhum
 * leiaute foi confirmado em fonte pública. Por isso NÃO há "preset de leiaute"
 * inventado aqui: o motor lê o cabeçalho da planilha, SUGERE qual coluna é código,
 * descrição, unidade e preço, e a pessoa CONFIRMA numa prévia de 10 linhas. O
 * mapeamento confirmado vira o preset da empresa (impressão digital dos
 * cabeçalhos) e a edição seguinte entra reconhecida. Quando alguém tiver um
 * arquivo real, o leiaute documentado entra em PRESETS sem mexer no resto.
 *
 * Regras que não cedem:
 *   · Nunca inventar preço: linha sem preço numérico (> 0) NÃO entra.
 *   · Linha sem código não entra (a base é indexada por código).
 *   · Preço que a fonte publica COM BDI é guardado como custo direto (preço ÷
 *     (1+BDI), como a CPOS) e o BDI fica registrado no item — BDI em dobro é o
 *     erro clássico de orçamento.
 *   · Nada de rede aqui: motor puro. A tela guarda no IndexedDB DA EMPRESA.
 *
 * Roda em Node (tools/test-basesassinatura.js) e no navegador. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/[.\-_/:()]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function txt(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v.result != null && typeof v.result !== "object") return String(v.result);
      if (v.text != null) return String(v.text);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      return "";
    }
    return String(v);
  }

  /* papéis e seus sinônimos de cabeçalho (já normalizados por norm) */
  var SIN = {
    codigo: ["codigo", "cod", "cod servico", "codigo do servico", "codigo da composicao", "codigo do item", "item codigo", "referencia", "ref"],
    descricao: ["descricao", "descricao do servico", "descricao dos servicos", "descricao do item", "servico", "discriminacao", "especificacao", "insumo", "composicao"],
    unidade: ["un", "und", "unid", "unidade", "unid medida", "unidade de medida", "um"],
    custo: ["preco", "preco unitario", "preco unit", "preco r$", "preco em r$", "preco (r$)", "custo", "custo unitario", "custo unit", "valor", "valor unitario", "valor unit", "unitario", "preco total"],
    competencia: ["competencia", "data base", "mes referencia", "mes de referencia", "referencia mes"],
    regime: ["regime", "desoneracao", "encargos", "tipo de encargo"]
  };
  var SIN_N = {};
  Object.keys(SIN).forEach(function (k) { SIN_N[k] = SIN[k].map(norm); });
  var OBRIG = ["codigo", "descricao", "unidade", "custo"];
  var PAPEIS = ["codigo", "descricao", "unidade", "custo", "competencia", "regime"];
  var ROTULO = { codigo: "Código", descricao: "Descrição", unidade: "Unidade", custo: "Preço", competencia: "Competência", regime: "Regime" };

  function papelDe(cel) {
    var n = norm(cel);
    if (!n) return null;
    for (var i = 0; i < PAPEIS.length; i++) {
      if (SIN_N[PAPEIS[i]].indexOf(n) >= 0) return PAPEIS[i];
    }
    return null;
  }

  /* número BR/US. `milhar` = a COLUNA usa vírgula decimal, então ponto é milhar. */
  function num(v, milhar) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    if (v == null) return NaN;
    var s = String(v);
    if (/^\s*$/.test(s)) return NaN;
    /* ⚠ só aceita célula que SEJA número (com R$, espaço, sinal ou parênteses).
       Arrancar letras e ficar com os dígitos transformava a unidade "m3" em preço 3. */
    if (!/^\s*(r\$)?\s*[-(]?\s*\d[\d.,\s]*\)?\s*$/i.test(s)) return NaN;
    var neg = /^\s*(r\$)?\s*-/i.test(s) || /\(\s*[\d.,]+\s*\)/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    if (!s || !/\d/.test(s)) return NaN;
    var c = s.indexOf(",") >= 0, d = s.indexOf(".") >= 0;
    if (c && d) { s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""); }
    else if (c) { var pc = s.split(","); s = pc.slice(0, -1).join("") + "." + pc[pc.length - 1]; }
    else if (d) {
      var pd = s.split(".");
      if (pd.length > 2) s = pd.join("");
      else if (milhar && pd[1].length === 3) s = pd.join("");
    }
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  }

  function r2(x) { return Math.round(x * 100) / 100; }

  var BasesAssinatura = {
    PAPEIS: PAPEIS, OBRIGATORIOS: OBRIG, ROTULO: ROTULO,
    _num: num, _norm: norm,

    /* Metadados do topo da planilha: competência (AAAA-MM), BDI embutido e regime.
       null = a planilha não diz — e "não diz" nunca vira valor. */
    metaCabecalho: function (matriz) {
      var out = { competencia: null, bdiIncluso: null, desonerado: null };
      var MESES = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
      var lim = Math.min((matriz || []).length, 15), temDes = false, temOn = false;
      for (var i = 0; i < lim; i++) {
        var row = matriz[i] || [];
        for (var c = 0; c < row.length; c++) {
          var s = txt(row[c]).trim(); if (!s) continue;
          var ns = norm(s);
          var mb = ns.match(/(?:data ?base|competencia|referencia|mes)(?: de| da| do)? ([a-z]{3})[a-z]* ?(\d{2,4})\b/);
          if (mb && MESES[mb[1]] && !out.competencia) out.competencia = (mb[2].length === 2 ? "20" + mb[2] : mb[2]) + "-" + MESES[mb[1]];
          var mn = ns.match(/(?:data ?base|competencia|referencia)\D{0,12}(\d{2}) ?[\/ ] ?(\d{4})/);
          if (mn && !out.competencia) out.competencia = mn[2] + "-" + mn[1];
          var bdi = s.match(/com\s+bdi\s*(?:de)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
          if (bdi && out.bdiIncluso == null) out.bdiIncluso = parseFloat(bdi[1].replace(",", "."));
          if (/sem\s+bdi/i.test(s) && out.bdiIncluso == null) out.bdiIncluso = 0;
          if (/(sem|nao|não)\s+desonera|\bonerad/i.test(ns)) temOn = true;
          else if (/desonera/i.test(ns)) temDes = true;
        }
      }
      if (temDes && !temOn) out.desonerado = true;
      else if (temOn && !temDes) out.desonerado = false;
      return out;
    },

    /* Acha a linha de cabeçalho (a que tem mais papéis distintos, mínimo 3) e
       sugere o mapa {papel: coluna}. Devolve { cab, mapa, falta[], confianca }. */
    detectar: function (matriz) {
      var melhor = { cab: -1, mapa: {}, n: 0 };
      var lim = Math.min((matriz || []).length, 60);
      for (var i = 0; i < lim; i++) {
        var row = matriz[i] || [], mapa = {}, n = 0;
        for (var c = 0; c < row.length; c++) {
          var p = papelDe(txt(row[c]));
          if (p && mapa[p] == null) { mapa[p] = c; n++; }
        }
        if (n > melhor.n) melhor = { cab: i, mapa: mapa, n: n };
      }
      if (melhor.n < 3) return { cab: -1, mapa: {}, falta: OBRIG.slice(), confianca: "nenhuma" };
      var falta = OBRIG.filter(function (p) { return melhor.mapa[p] == null; });
      return { cab: melhor.cab, mapa: melhor.mapa, falta: falta, confianca: falta.length ? "parcial" : "alta" };
    },

    /* Impressão digital do cabeçalho nas colunas mapeadas: é o que prova, na
       edição seguinte, que o arquivo tem o MESMO leiaute que a empresa confirmou. */
    impressao: function (matriz, cab, mapa) {
      var row = (matriz && matriz[cab]) || [];
      return PAPEIS.filter(function (p) { return mapa[p] != null; }).map(function (p) {
        return p + "=" + mapa[p] + ":" + norm(txt(row[mapa[p]]));
      }).join("|");
    },

    /* O preset da empresa (salvo) reconhece este arquivo? Só se a impressão bater
       EXATAMENTE — meia coincidência não vale (coluna deslocada = preço errado). */
    reconhecerPreset: function (matriz, presetSalvo) {
      if (!presetSalvo || !presetSalvo.mapa || presetSalvo.cab == null) return null;
      var imp = this.impressao(matriz, presetSalvo.cab, presetSalvo.mapa);
      return imp && imp === presetSalvo.impressao ? { cab: presetSalvo.cab, mapa: presetSalvo.mapa, origem: "preset da empresa" } : null;
    },

    /* Prévia: as primeiras `n` linhas de dado com o mapa aplicado. Não filtra nada —
       a pessoa precisa ver o que o motor VÊ, inclusive o que será recusado. */
    previa: function (matriz, cab, mapa, n) {
      n = n || 10;
      var out = [], inicio = cab >= 0 ? cab + 1 : 0;
      for (var i = inicio; i < (matriz || []).length && out.length < n; i++) {
        var row = matriz[i] || [];
        var vazia = row.every(function (x) { return !txt(x).trim(); });
        if (vazia) continue;
        var l = { linha: i + 1 };
        PAPEIS.forEach(function (p) { l[p] = mapa[p] != null ? txt(row[mapa[p]]).trim() : ""; });
        out.push(l);
      }
      return out;
    },

    /* Valida o mapa que a pessoa confirmou: os 4 papéis obrigatórios, colunas
       distintas e existentes. Devolve "" se estiver bom, senão o motivo. */
    validarMapa: function (mapa, nCols) {
      mapa = mapa || {};
      for (var i = 0; i < OBRIG.length; i++) {
        if (mapa[OBRIG[i]] == null || mapa[OBRIG[i]] === "") return "Falta dizer qual coluna é " + ROTULO[OBRIG[i]].toLowerCase() + ".";
      }
      var usadas = {};
      for (var j = 0; j < PAPEIS.length; j++) {
        var c = mapa[PAPEIS[j]];
        if (c == null || c === "") continue;
        if (!(c >= 0) || (nCols != null && c >= nCols)) return "A coluna de " + ROTULO[PAPEIS[j]].toLowerCase() + " não existe na planilha.";
        if (usadas[c]) return "A mesma coluna foi escolhida para duas coisas (" + ROTULO[usadas[c]].toLowerCase() + " e " + ROTULO[PAPEIS[j]].toLowerCase() + ").";
        usadas[c] = PAPEIS[j];
      }
      return "";
    },

    /* LÊ a planilha inteira com o mapa confirmado.
       opts: { bdiIncluso (% — vence o do cabeçalho), competencia (AAAA-MM), uf, desonerado, fonte }
       Devolve { ok, erro, pacote:{fonte,dados,mes,uf,desonerado?}, resumo:{...}, ignoradas:[...] }.
       Item: { codigo, descricao, unidade, custoUnitario, origem, tipoItem:"composicao" [, precoComBDI, bdiIncluso] }.
       ⚠ sem preço > 0 NÃO entra (nem "para catálogo"): a regra do pedido é nunca
       inventar preço, e item a R$ 0,00 entraria numa proposta como grátis. */
    ler: function (matriz, cab, mapa, opts) {
      opts = opts || {};
      var nCols = 0; (matriz || []).forEach(function (r) { if (r && r.length > nCols) nCols = r.length; });
      var inv = this.validarMapa(mapa, nCols);
      if (inv) return { ok: false, erro: inv };
      var meta = this.metaCabecalho(matriz);
      var bdi = opts.bdiIncluso != null && opts.bdiIncluso !== "" ? Number(opts.bdiIncluso) : (meta.bdiIncluso || 0);
      if (!(bdi >= 0) || bdi > 200) return { ok: false, erro: "BDI embutido inválido (" + opts.bdiIncluso + "%)." };
      var fator = bdi > 0 ? 1 + bdi / 100 : 1;
      var fonte = String(opts.fonte || "PROPRIA").toUpperCase();
      var inicio = cab >= 0 ? cab + 1 : 0;
      // a coluna de preço usa vírgula decimal? então ponto é milhar
      var milhar = false;
      for (var k = inicio; k < matriz.length && !milhar; k++) {
        var cel = (matriz[k] || [])[mapa.custo];
        if (typeof cel === "string" && cel.indexOf(",") >= 0) milhar = true;
      }
      var dados = [], vistos = {}, ign = [], semPreco = 0, semCodigo = 0, dup = 0;
      var regimes = { d: 0, o: 0 }, comps = {};
      for (var i = inicio; i < matriz.length; i++) {
        var row = matriz[i] || [];
        var cod = txt(row[mapa.codigo]).trim().replace(/\s+/g, " ");
        var desc = txt(row[mapa.descricao]).trim();
        if (!cod && !desc) continue;                       // linha em branco
        if (!cod) { semCodigo++; ign.push({ linha: i + 1, motivo: "sem código" }); continue; }
        var p = num(row[mapa.custo], milhar);
        if (!(p > 0)) { semPreco++; ign.push({ linha: i + 1, codigo: cod, motivo: "sem preço numérico" }); continue; }
        if (vistos[cod]) { dup++; ign.push({ linha: i + 1, codigo: cod, motivo: "código repetido (ficou o primeiro)" }); continue; }
        vistos[cod] = 1;
        var it = { codigo: cod, descricao: desc, unidade: txt(row[mapa.unidade]).trim() || "un", custoUnitario: r2(p / fator), origem: fonte, tipoItem: "composicao" };
        if (fator > 1) { it.precoComBDI = r2(p); it.bdiIncluso = bdi; }
        if (mapa.regime != null) {
          var rg = norm(txt(row[mapa.regime]));
          if (/^(sem|nao) desonera|^onerad/.test(rg)) { it.desonerado = false; regimes.o++; }
          else if (/desonera|^des\b/.test(rg)) { it.desonerado = true; regimes.d++; }
        }
        if (mapa.competencia != null) {
          var cp = txt(row[mapa.competencia]).trim();
          var m1 = cp.match(/^(\d{4})-(\d{2})/), m2 = cp.match(/^(\d{2})\/(\d{4})$/);
          if (m1) comps[m1[1] + "-" + m1[2]] = 1;
          else if (m2) comps[m2[2] + "-" + m2[1]] = 1;
        }
        dados.push(it);
      }
      if (!dados.length) {
        return { ok: false, erro: "Nenhuma linha com código e preço numérico. Confira se a coluna de preço escolhida é a certa — " + semPreco + " linha(s) sem preço, " + semCodigo + " sem código.", ignoradas: ign };
      }
      var compsL = Object.keys(comps);
      var competencia = opts.competencia || (compsL.length === 1 ? compsL[0] : null) || meta.competencia || null;
      var des = opts.desonerado === true || opts.desonerado === false ? opts.desonerado
        : (regimes.d && !regimes.o ? true : (regimes.o && !regimes.d ? false : meta.desonerado));
      var pacote = { fonte: fonte, dados: dados, mes: competencia || undefined, uf: opts.uf || undefined };
      if (des === true || des === false) pacote.desonerado = des;
      return {
        ok: true, pacote: pacote, ignoradas: ign,
        resumo: { itens: dados.length, semPreco: semPreco, semCodigo: semCodigo, repetidos: dup, bdiIncluso: bdi, competencia: competencia, desonerado: (des === true || des === false) ? des : null }
      };
    },

    /* Registro de ORIGEM que acompanha a base dentro da conta da empresa. */
    origem: function (info) {
      info = info || {};
      return {
        id: String(info.id || "").toUpperCase(), importadaEm: String(info.importadaEm || ""), arquivo: String(info.arquivo || ""),
        sha256: String(info.sha256 || ""), cab: info.cab, mapa: info.mapa, impressao: info.impressao || "", bdiIncluso: info.bdiIncluso || 0
      };
    },
    /* "importada pela empresa em 10/11/2026, arquivo X, sha256 abcdef12…" */
    textoOrigem: function (o) {
      if (!o || !o.importadaEm) return "";
      var m = String(o.importadaEm).match(/^(\d{4})-(\d{2})-(\d{2})/);
      var data = m ? m[3] + "/" + m[2] + "/" + m[1] : o.importadaEm;
      return "importada pela empresa em " + data + ", arquivo " + (o.arquivo || "—") + (o.sha256 ? ", sha256 " + String(o.sha256).slice(0, 12) + "…" : "");
    },

    /* SHA-256 em hexa de um ArrayBuffer/Uint8Array. Promessa. Navegador: crypto.subtle;
       Node: crypto. Sem nenhum dos dois devolve "" (a origem diz que não calculou). */
    sha256: function (bytes) {
      try {
        if (global.crypto && global.crypto.subtle) {
          return global.crypto.subtle.digest("SHA-256", bytes).then(function (b) {
            return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
          });
        }
        if (typeof require === "function") {
          var h = require("crypto").createHash("sha256"); h.update(Buffer.from(bytes)); return Promise.resolve(h.digest("hex"));
        }
      } catch (e) {}
      return Promise.resolve("");
    }
  };

  global.BasesAssinatura = BasesAssinatura;
  if (typeof module !== "undefined" && module.exports) module.exports = BasesAssinatura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

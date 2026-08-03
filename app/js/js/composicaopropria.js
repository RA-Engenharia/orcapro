/* =====================================================================
 * composicaopropria.js — Motor do CRIADOR DE COMPOSIÇÕES PRÓPRIAS (v1.1.123)
 * Puro e Node-testável (sem DOM). Regras da casa levadas ao limite:
 *   - NUNCA inventa código, preço ou coeficiente: insumos vêm das bases
 *     reais (SINAPI/SICRO/…) e a estrutura proposta pelo agente vem de uma
 *     composição de REFERÊNCIA real da base analítica (rastreada).
 *   - "Zero margem de erro": validar() aplica um checklist DURO — a
 *     composição só grava se passar sem nenhum erro (avisos não bloqueiam,
 *     mas aparecem).
 * Métodos de cálculo espelham o orçamento (Arred): truncar2 (padrão TCU),
 * arred2, nenhum — o custo unitário da composição própria nasce coerente
 * com a planilha que vai usá-la.
 * ===================================================================== */
(function (global) {
  "use strict";

  // ---- arredondamento: delega ao motor oficial quando presente (browser),
  // senão réplica mínima idêntica (Node puro nos testes) ----
  function valor(n, modo) {
    var A = global.Arred || (typeof require === "function" ? (function () { try { return require("./arredondamento.js"); } catch (e) { return null; } })() : null);
    if (A && A.valor) return A.valor(n, modo === "nenhum" ? "nenhum" : (modo === "arred2" ? "arred2" : "truncar2"));
    var x = Number(n) || 0;
    if (modo === "nenhum") return x;
    // centavos inteiros via toPrecision(15) — mesma normalização do Excel/motor
    var cent = Number((x * 100).toPrecision(15));
    return (modo === "arred2" ? Math.round(cent) : Math.floor(cent + 1e-9)) / 100;
  }

  // unidades aceitas (vocabulário SINAPI/SICRO usual, minúsculo/normalizado)
  var UNIDADES = ["m", "m2", "m²", "m3", "m³", "un", "und", "kg", "t", "h", "l", "km", "cm", "mm", "vb", "par", "cj", "jg", "mes", "mês", "sc", "gl", "rl", "pc", "dm3", "dm³", "m3xkm", "txkm", "unxm", "m2xmes", "hxm"];

  // grupos/classes de serviço do criador (paridade com o mercado; edição livre)
  var GRUPOS = [
    "ASSENTAMENTO DE TUBOS E PEÇAS", "ALVENARIA E VEDAÇÃO", "CONCRETO E ARMADURA",
    "COBERTURA E TELHADO", "DEMOLIÇÃO E RETIRADA", "ESQUADRIAS E VIDROS",
    "FUNDAÇÕES", "IMPERMEABILIZAÇÃO", "INSTALAÇÕES ELÉTRICAS",
    "INSTALAÇÕES HIDROSSANITÁRIAS", "MOVIMENTO DE TERRA", "PAVIMENTAÇÃO",
    "PINTURA E ACABAMENTO", "REVESTIMENTO", "SERVIÇOS PRELIMINARES",
    "SERVIÇOS COMPLEMENTARES", "TRANSPORTE E CARGA", "OUTROS"
  ];

  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s;
  }
  var STOP = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, em: 1, com: 1, para: 1, a: 1, o: 1, na: 1, no: 1, por: 1, ou: 1, um: 1, uma: 1, af: 1 };
  function tokens(s) {
    return norm(s).replace(/[^a-z0-9,.\s]/g, " ").split(/[\s,;\/]+/).filter(function (t) {
      return t.length >= 3 && !STOP[t] && !/^\d+$/.test(t);
    });
  }

  /* Categoria normalizada do insumo: reconhece os códigos CURTOS do analítico
   * ("MO"/"MAT"/"EQ") e os rótulos longos ("Mão de obra", "Equipamento"…). */
  function catDe(c) {
    var s = norm(c).replace(/\s+/g, "");
    if (s === "mo" || /mao|m\.o|encargo/.test(s)) return "MO";
    if (s === "eq" || /equip/.test(s)) return "EQ";
    return "MAT";
  }

  var ComposicaoPropria = {
    UNIDADES: UNIDADES,
    GRUPOS: GRUPOS,
    catDe: catDe,

    /* Código sequencial da base própria: PROP-0001, PROP-0002… (nunca repete). */
    gerarCodigo: function (codigosExistentes) {
      var max = 0;
      (codigosExistentes || []).forEach(function (c) {
        var m = String(c || "").match(/^PROP-(\d{1,6})$/i);
        if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
      });
      var prox = String(max + 1);
      while (prox.length < 4) prox = "0" + prox;
      return "PROP-" + prox;
    },

    unidadeValida: function (u) {
      return UNIDADES.indexOf(norm(u).replace(/\s+/g, "")) >= 0;
    },

    /* Custo da composição a partir dos insumos, no método de cálculo escolhido.
     * Cada linha: coef × preço no método; total = Σ linhas no método (igual à
     * planilha). Categorias MO/MAT/EQ pela categoria do insumo. */
    custo: function (insumos, metodo) {
      var mo = 0, mat = 0, eq = 0, total = 0;
      (insumos || []).forEach(function (i) {
        var linha = valor((Number(i.coeficiente) || 0) * (Number(i.custoUnitario) || 0), metodo);
        total += linha;
        var cat = catDe(i.categoria);
        if (cat === "MO") mo += linha;
        else if (cat === "EQ") eq += linha;
        else mat += linha;
      });
      return { total: valor(total, metodo), mo: valor(mo, metodo), mat: valor(mat, metodo), eq: valor(eq, metodo) };
    },

    /* CHECKLIST DURO — "sem margem para erro de parâmetro".
     * ctx: { codigosExistentes: [..], resolve: function(codigo)->item|null,
     *        referencia: composicao analitica usada como base (ou null) }
     * Retorna { ok, erros: [..], avisos: [..] } — ok só sem NENHUM erro. */
    validar: function (comp, ctx) {
      ctx = ctx || {};
      var erros = [], avisos = [];
      var cod = String(comp.codigo || "").trim();
      if (!cod) erros.push("Código é obrigatório.");
      else if ((ctx.codigosExistentes || []).some(function (c) { return norm(c) === norm(cod); })) erros.push("Código \"" + cod + "\" já existe na base própria — os códigos nunca se repetem.");
      else if (ctx.existeOficial) {
        // código de composição própria NUNCA pode sombrear um código das bases
        // oficiais (SINAPI/SICRO/ORSE…) — senão o detalhamento do item oficial
        // passaria a abrir a composição própria homônima
        var fonteColide = ctx.existeOficial(cod);
        if (fonteColide) erros.push("Código \"" + cod + "\" já existe na base " + fonteColide + " — use um código próprio (ex.: PROP-0001) para não confundir com a composição oficial.");
      }
      if (String(comp.descricao || "").trim().length < 10) erros.push("Descrição muito curta — descreva o serviço com pelo menos 10 caracteres.");
      if (!comp.unidade) erros.push("Unidade é obrigatória.");
      else if (!this.unidadeValida(comp.unidade)) erros.push("Unidade \"" + comp.unidade + "\" não é reconhecida (use m, m2, m3, un, kg, h…).");
      if (!comp.grupo) erros.push("Escolha o tipo/grupo do serviço.");
      if (!comp.metodo || ["truncar2", "arred2", "nenhum"].indexOf(comp.metodo) < 0) erros.push("Método de cálculo inválido.");

      var insumos = comp.insumos || [];
      if (!insumos.length) erros.push("A composição precisa de pelo menos 1 insumo.");
      var temMO = false, vistos = {};
      insumos.forEach(function (i, idx) {
        var rot = "Insumo " + (idx + 1) + " (" + (i.codigo || "sem código") + ")";
        if (!i.codigo) { erros.push(rot + ": sem código."); return; }
        if (vistos[i.codigo]) erros.push(rot + ": código repetido na composição.");
        vistos[i.codigo] = 1;
        // o código TEM de existir na base real — nunca inventamos (a fonte do
        // insumo, quando conhecida, evita colisão de código entre bases)
        var real = ctx.resolve ? ctx.resolve(i.codigo, i.fonte) : null;
        if (ctx.resolve && !real) erros.push(rot + ": código não existe nas bases ativas — só entram insumos reais.");
        var coef = Number(i.coeficiente);
        if (!(coef > 0)) erros.push(rot + ": coeficiente deve ser maior que zero.");
        if (!(Number(i.custoUnitario) > 0)) erros.push(rot + ": sem preço — informe a cotação antes de gravar (composição não nasce zerada).");
        if (catDe(i.categoria) === "MO") temMO = true;
        // plausibilidade vs a referência REAL (quando o agente partiu de uma)
        if (ctx.referencia && ctx.referencia.insumos) {
          var refIns = null;
          for (var r = 0; r < ctx.referencia.insumos.length; r++) {
            if (String(ctx.referencia.insumos[r].codigo) === String(i.codigo)) { refIns = ctx.referencia.insumos[r]; break; }
          }
          if (refIns && Number(refIns.coeficiente) > 0 && coef > 0) {
            var razao = coef / Number(refIns.coeficiente);
            if (razao > 10 || razao < 0.1) avisos.push(rot + ": coeficiente " + coef + " está " + (razao > 10 ? "muito ACIMA" : "muito ABAIXO") + " da referência " + ctx.referencia.codigo + " (" + refIns.coeficiente + ") — confira a unidade/quantidade.");
          }
        }
      });
      if (comp.maoDeObra && !temMO) avisos.push("Marcada como \"com mão de obra\", mas nenhum insumo é de mão de obra.");
      if (!comp.maoDeObra && temMO) avisos.push("Tem insumo de mão de obra, mas a marcação \"Mão de Obra\" está desligada.");
      var c = this.custo(insumos, comp.metodo || "truncar2");
      if (!(c.total > 0)) erros.push("O custo total ficou zerado — confira coeficientes e preços.");

      return { ok: erros.length === 0, erros: erros, avisos: avisos, custo: c };
    },

    /* Composições ANÁLOGAS na base analítica real (para o agente): score de
     * sobreposição de tokens + bônus por termos na mesma ordem. Nunca inventa:
     * só devolve o que existe, com o score explicando o porquê. */
    analogas: function (descricao, dadosAnalitico, n) {
      var alvo = tokens(descricao);
      if (!alvo.length || !dadosAnalitico || !dadosAnalitico.length) return [];
      var alvoSet = {};
      alvo.forEach(function (t) { alvoSet[t] = 1; });
      var out = [];
      for (var i = 0; i < dadosAnalitico.length; i++) {
        var c = dadosAnalitico[i];
        if (!c || !c.insumos || !c.insumos.length) continue;
        var ts = tokens(c.descricao);
        if (!ts.length) continue;
        var hit = 0, seen = {};
        for (var j = 0; j < ts.length; j++) {
          var t = ts[j];
          if (alvoSet[t] && !seen[t]) { hit++; seen[t] = 1; }
        }
        if (!hit) continue;
        var score = hit / Math.max(alvo.length, 3) + (hit / Math.max(ts.length, 3)) * 0.5;
        out.push({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo || "", custoUnitario: c.custoUnitario, nInsumos: c.insumos.length, score: Math.round(score * 100) / 100, _comp: c });
      }
      out.sort(function (a, b) { return b.score - a.score; });
      return out.slice(0, n || 5);
    },

    /* Proposta do agente a partir de uma referência REAL: estrutura copiada
     * (códigos + coeficientes da base analítica), preços atualizados pela base
     * ativa quando o resolve achar, e rastreabilidade na observação. */
    daReferencia: function (ref, ctx) {
      ctx = ctx || {};
      var insumos = (ref.insumos || []).map(function (i) {
        // a referência é SINAPI → o resolve recebe a fonte para NUNCA precificar
        // com item homônimo de outra base (colisão de código numérico)
        var atual = ctx.resolve ? ctx.resolve(i.codigo, "SINAPI") : null;
        return {
          codigo: i.codigo,
          descricao: i.descricao,
          unidade: i.unidade,
          coeficiente: Number(i.coeficiente) || 0,
          custoUnitario: (atual && Number(atual.custoUnitario) > 0) ? Number(atual.custoUnitario) : (Number(i.custoUnitario) || 0),
          categoria: i.categoria || i.tipoInsumo || "",
          tipo: i.tipo || "insumo",
          fonte: "SINAPI"
        };
      });
      var temMO = insumos.some(function (i) { return catDe(i.categoria) === "MO"; });
      return {
        unidade: ref.unidade || "",
        grupo: ref.grupo || "",
        maoDeObra: temMO,
        insumos: insumos,
        observacao: "Estrutura baseada na composição " + ref.codigo + " — " + String(ref.descricao || "").slice(0, 90) + " (coeficientes oficiais; revise quantidades para o seu caso).",
        referenciaCodigo: ref.codigo
      };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ComposicaoPropria;
  global.ComposicaoPropria = ComposicaoPropria;
})(typeof window !== "undefined" ? window : globalThis);

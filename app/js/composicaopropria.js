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

  /* =====================================================================
   * CATÁLOGO DE UNIDADES (v1.1.209)
   *
   * A lista tinha 27 entradas e barrava a gravação: "Unidade «cx» não é
   * reconhecida". Só que "cx" é caixa — unidade de compra de metade do
   * material de acabamento. E não era caso isolado: MEDI as unidades dos
   * 8 bancos que o app já embarca (SINAPI, SETOP, ORSE, SEINFRA, SICRO,
   * IOPES, GOINFRA, SUDECAP — 59.697 itens) e elas usam 71 unidades
   * distintas depois de normalizadas. A lista velha cobria menos da
   * metade: faltavam pt, chp, chi, dia, ha, kwh, cento, mil, %, ciclo e
   * todos os compostos de transporte fora dos três que estavam ali.
   *
   * Duas decisões, e é a segunda que resolve de verdade:
   *  1. o catálogo abaixo nasce do que os bancos REALMENTE publicam, mais
   *     as unidades de comércio que o orçamentista digita todo dia (cx,
   *     fd, br, pct…) e que banco de órgão não tem porque não compra nada;
   *  2. unidade fora do catálogo NÃO BLOQUEIA MAIS — vira aviso. Bloquear
   *     era o defeito: nenhuma lista, por maior que seja, cobre o que o
   *     fornecedor inventa na nota, e o app não tem o direito de impedir
   *     alguém de gravar o próprio serviço por causa disso. Aviso ainda
   *     pega o dedo errado (o fluxo exige "Conferi — gravar assim").
   *
   * Grafia normativa na exibição (CONMETRO 12/1988): m², m³, kg, h, L.
   * A comparação é por chave — "M2", "m2" e "m²" são a mesma unidade.
   * ===================================================================== */
  var UNIDADES = [
    // — as mais usadas, primeiro (ordem da lista de sugestão)
    "un", "m", "m²", "m³", "kg", "h", "vb", "cj", "pç", "par", "jg", "pt",
    // — comprimento, área, volume
    "cm", "cm²", "cm³", "mm", "dm²", "dm³", "km", "ha", "are",
    // — massa, volume líquido, energia
    "g", "t", "L", "ml", "kWh",
    // — tempo e locação
    "min", "dia", "mês", "ano",
    // — custo horário do SICRO/DNIT (sigla do órgão, não unidade SI)
    "chp", "chi",
    // — contagem e embalagem de comércio (o que o banco de órgão não tem)
    "cx", "fd", "br", "bd", "pct", "sc", "saco", "rl", "rolo", "gl", "lata",
    "dz", "kit", "cento", "mil", "%", "u",
    // — o que os bancos publicam e não cabe nas famílias acima
    "ciclo", "quadra", "imóvel", "tb", "pa",
    // — compostos de transporte e de locação (multiplicação)
    "t·km", "m³·km", "m²·km", "m·km", "kg·km", "L·km", "un·km",
    "un·mês", "m²·mês", "m³·mês", "m·mês", "h·mês",
    "un·dia", "m·dia", "m²·dia", "m³·dia", "pt·dia",
    // — compostos de divisão (POR mês, POR dia): a barra é preservada na chave
    "m/mês", "m²/mês", "m³/mês", "un/dia", "m/dia", "m²/dia", "m³/dia", "h/dia",
    "pt/dia", "pç/dia"
    /* FORA DE PROPÓSITO (viram aviso, nunca bloqueio): VG, ARF, BAN, AMV, IM,
       PR A1, % A1, 100M, 310ML. São siglas de um órgão só, sem significado
       confirmado — a util.js já as deixa passar sem tradução pelo mesmo
       motivo, e sugerir o que não se entende é pior que não sugerir. */
  ];

  /* Chave de comparação: a MESMA do resto do app (Util.unidadeChave), com
   * réplica local porque este motor roda em Node puro nos testes — sem DOM
   * e sem util.js. Duas implementações da mesma regra é o defeito clássico;
   * por isso a de fora vence sempre que existir. */
  function chaveUnidade(u) {
    var U = global.Util || (typeof require === "function" ? (function () { try { return require("./util.js"); } catch (e) { return null; } })() : null);
    if (U && U.unidadeChave) return U.unidadeChave(u);
    var temBarra = /[\/]/.test(String(u == null ? "" : u));
    var s = norm(u).replace(/²/g, "2").replace(/³/g, "3").replace(/[^a-z0-9]/g, "");
    var antes;
    do { antes = s; s = s.replace(/([a-z0-9])x([a-z0-9])/g, "$1$2"); } while (s !== antes);
    if (s === "und" || s === "unid" || s === "uni" || s === "unidade") return "un";
    if (s === "ms" || s === "mes") return "mes";
    if (s === "hora" || s === "hr") return "h";
    return temBarra ? s + "/" : s;
  }
  var _chaves = null;
  function chavesAceitas() {
    if (_chaves) return _chaves;
    _chaves = {};
    for (var i = 0; i < UNIDADES.length; i++) {
      var u = UNIDADES[i];
      _chaves[chaveUnidade(u)] = 1;
      /* "%" (7 itens no ORSE) não sobrevive à chave: ela derruba tudo que não
         é alfanumérico e sobra string vazia. A chave é do app inteiro e não se
         mexe nela por causa de um símbolo — o cru normalizado entra junto. */
      _chaves["cru:" + norm(u).replace(/\s+/g, "")] = 1;
    }
    return _chaves;
  }

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

    /* Sigla de 3 letras por grupo — é o que torna o código legível e
     * procurável ("PROP-ALV-001" diz o que é; "PROP-0007" não diz nada). */
    SIGLAS: {
      "ALVENARIA E VEDAÇÃO": "ALV", "ASSENTAMENTO DE TUBOS E PEÇAS": "TUB",
      "CONCRETO E ARMADURA": "CON", "COBERTURA E TELHADO": "COB",
      "DEMOLIÇÃO E RETIRADA": "DEM", "ESQUADRIAS E VIDROS": "ESQ",
      "FUNDAÇÕES": "FUN", "IMPERMEABILIZAÇÃO": "IMP",
      "INSTALAÇÕES ELÉTRICAS": "ELE", "INSTALAÇÕES HIDROSSANITÁRIAS": "HID",
      "MOVIMENTO DE TERRA": "TER", "PAVIMENTAÇÃO": "PAV",
      "PINTURA E ACABAMENTO": "PIN", "REVESTIMENTO": "REV",
      "SERVIÇOS PRELIMINARES": "PRE", "SERVIÇOS COMPLEMENTARES": "COM",
      "TRANSPORTE E CARGA": "TRA", "OUTROS": "GER"
    },

    /* CÓDIGO LEGÍVEL POR GRUPO: PROP-ALV-001.
     *
     * ⚠ CONVIVE COM O LEGADO. Os PROP-0001 já gravados continuam válidos e
     * continuam sendo encontrados — a sequência nova é POR SIGLA e não
     * disputa numeração com eles. Renumerar o que o cliente já lançou em
     * orçamento seria trocar o código de um item que já está numa planilha
     * entregue: o oposto de rastreabilidade. */
    gerarCodigoLegivel: function (grupo, codigosExistentes) {
      var sig = this.SIGLAS[String(grupo || "").toUpperCase()] || "GER";
      var max = 0, re = new RegExp("^PROP-" + sig + "-(\\d{1,4})$", "i");
      (codigosExistentes || []).forEach(function (c) {
        var m = String(c || "").match(re);
        if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
      });
      var prox = String(max + 1);
      while (prox.length < 3) prox = "0" + prox;
      return "PROP-" + sig + "-" + prox;
    },

    unidadeValida: function (u) {
      var aceitas = chavesAceitas(), k = chaveUnidade(u);
      if (k && aceitas[k] === 1) return true;
      var cru = norm(u).replace(/\s+/g, "");
      return !!cru && aceitas["cru:" + cru] === 1;
    },
    /* Sugestões para o campo (datalist da tela). Devolve cópia: a lista é
     * do motor, e uma tela que ordenasse in-place mudaria a validação. */
    unidadesSugeridas: function () { return UNIDADES.slice(); },

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
      /* AVISO, NÃO ERRO (v1.1.209): "cx" existe, o catálogo é que não a tinha —
         e o app barrava a gravação da composição inteira por causa disso.
         Nenhuma lista cobre a unidade que o fornecedor põe na nota; travar a
         gravação por vocabulário é o app decidindo o que o orçamentista pode
         vender. O aviso ainda pega o dedo escorregado, e passar por ele exige
         o "Conferi — gravar assim". */
      else if (!this.unidadeValida(comp.unidade)) avisos.push("Unidade \"" + comp.unidade + "\" está fora do catálogo — confira se é isso mesmo (o catálogo tem un, m, m², m³, kg, h, cx, vb, cj, pç…).");
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
    /* ==================================================================
     * ELABORAR COMPOSIÇÃO — o agente, num ponto de entrada só (v1.1.220)
     *
     * "Agentes treinados pela engenharia do OrçaPRO" é isto, e vale dizer o
     * que significa aqui: o agente NÃO INVENTA. Ele procura, na base
     * analítica REAL, a composição oficial mais parecida com a descrição, e
     * copia dela os insumos e os COEFICIENTES — que são o resultado de
     * medição de produtividade, não de opinião.
     *
     * ⚠ SEM ANÁLOGA BOA, ELE DIZ QUE NÃO ACHOU. Montar do nada produziria um
     * preço que ninguém defende em auditoria — que é o oposto do que uma
     * composição própria existe para fazer.
     *
     * ctx: { analitico:[], resolve(cod,fonte), codigosExistentes:[],
     *        unidade, grupo, minimo }
     * Devolve { ok, comp, referencia, confianca, alternativas } ou
     * { ok:false, erro, alternativas }.
     * ================================================================== */
    LIMIAR: { alta: 0.60, media: 0.35, minimo: 0.20 },

    elaborar: function (descricao, ctx) {
      ctx = ctx || {};
      var desc = String(descricao || "").trim();
      if (desc.length < 4) return { ok: false, erro: "Descreva o serviço com pelo menos 4 letras." };
      var analitico = ctx.analitico || [];
      if (!analitico.length) {
        return { ok: false, erro: "A base analítica não está carregada — é dela que saem os insumos e os coeficientes reais." };
      }
      var cands = this.analogas(desc, analitico, 5);
      var minimo = ctx.minimo != null ? ctx.minimo : this.LIMIAR.minimo;
      if (!cands.length || cands[0].score < minimo) {
        return {
          ok: false,
          erro: "Não achei composição oficial parecida o bastante com \"" + desc + "\". " +
                "Monte manualmente ou descreva com os termos do serviço (material, espessura, aplicação).",
          alternativas: cands.slice(0, 3)
        };
      }
      var ref = cands[0];
      var prop = this.daReferencia(ref._comp, { resolve: ctx.resolve });
      var grupo = ctx.grupo || prop.grupo || "";
      if (GRUPOS.indexOf(String(grupo).toUpperCase()) < 0) grupo = "OUTROS";
      var unidade = ctx.unidade || prop.unidade || ref.unidade || "";
      var conf = ref.score >= this.LIMIAR.alta ? "alta" : (ref.score >= this.LIMIAR.media ? "media" : "baixa");
      var comp = {
        codigo: this.gerarCodigoLegivel(grupo, ctx.codigosExistentes || []),
        codigoSec: "",
        /* a descrição é a do USUÁRIO, não a da referência: ele pediu o
           serviço dele, e a referência é meio, não fim */
        descricao: desc,
        grupo: grupo,
        unidade: String(unidade).toLowerCase(),
        modeloRef: "SINAPI",
        metodo: "truncar2",
        maoDeObra: !!prop.maoDeObra,
        observacao: prop.observacao || "",
        insumos: prop.insumos || []
      };
      var custo = this.custo(comp.insumos, comp.metodo);
      return {
        ok: true, comp: comp, custo: custo,
        referencia: { codigo: ref.codigo, descricao: ref.descricao, unidade: ref.unidade, score: ref.score },
        confianca: conf,
        /* o usuário pode preferir outra referência — mostrar as demais é o que
           impede o agente de parecer um oráculo de uma resposta só */
        alternativas: cands.slice(1, 4),
        aviso: conf === "alta" ? "" :
          "Semelhança " + (conf === "media" ? "média" : "baixa") + " com a referência " + ref.codigo +
          " — confira coeficiente por coeficiente antes de gravar."
      };
    },

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

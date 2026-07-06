/* =====================================================================
 * escopo.js — Escopo Inteligente: texto livre -> itens SINAPI sugeridos
 * Regra de ouro (CLAUDE.md): NUNCA inventar código SINAPI.
 * Sem match -> status "pendente". Tudo rastreável (termos, candidatos, confiança).
 * Lógica pura: a UI consome a análise.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Stopwords PT-BR que não ajudam na busca
  var STOP = {
    "de": 1, "da": 1, "do": 1, "das": 1, "dos": 1, "e": 1, "a": 1, "o": 1, "as": 1, "os": 1,
    "com": 1, "em": 1, "para": 1, "por": 1, "no": 1, "na": 1, "um": 1, "uma": 1, "ao": 1,
    "tipo": 1, "ref": 1, "incl": 1, "incluso": 1, "qtd": 1, "total": 1, "x": 1
  };

  // Unidades reconhecidas (normalizadas)
  var UNID = {
    "m2": "m²", "m²": "m²", "m3": "m³", "m³": "m³", "m": "m", "ml": "m",
    "kg": "kg", "un": "un", "und": "un", "unid": "un", "pc": "un", "vb": "vb",
    "cj": "cj", "l": "l", "t": "t", "h": "h", "dia": "dia"
  };

  // Dicionário escalável de sinônimos: termo do usuário -> termo SINAPI provável
  var SINONIMOS = {
    "tijolo": "bloco", "parede": "alvenaria", "reboco": "emboco", "massa": "emboco",
    "ceramica": "ceramico", "porcelanato": "ceramico", "piso": "piso", "contrapiso": "contrapiso",
    "fundacao": "concreto", "sapata": "concreto", "viga": "concreto", "pilar": "concreto",
    "ferro": "armacao", "aco": "armacao", "vergalhao": "armacao",
    "telhado": "telha", "cobertura": "telha", "forro": "forro", "gesso": "gesso",
    "tinta": "tinta", "pintura": "tinta", "eletrica": "cabo", "fiacao": "cabo",
    "hidraulica": "tubo", "encanamento": "tubo", "esgoto": "esgoto", "agua": "agua",
    "vaso": "sanitario", "privada": "sanitario", "pia": "lavatorio", "janela": "janela",
    "porta": "porta", "impermeabilizacao": "impermeabilizacao", "manta": "manta",
    "limpeza": "limpeza", "terraplanagem": "escavacao", "escavacao": "escavacao"
  };

  var Escopo = {

    /* Analisa um bloco de texto: 1 item por linha. */
    analisar: function (texto) {
      var linhas = String(texto || "").split(/\r?\n/);
      var out = [];
      for (var i = 0; i < linhas.length; i++) {
        var bruto = linhas[i].trim();
        if (!bruto) continue;
        out.push(this.analisarLinha(bruto));
      }
      return out;
    },

    analisarLinha: function (bruto) {
      var norm = Util.normalizar(bruto);
      var tokens = norm.split(" ").filter(Boolean);

      // 1) Quantidade: primeiro número da linha (aceita 1.234,56)
      var quantidade = 1, qtdAchada = false;
      var mNum = bruto.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)/);
      if (mNum) { quantidade = Util.num(mNum[1]) || 1; qtdAchada = true; }

      // 2) Unidade: token que bate com UNID
      var unidade = null;
      for (var u = 0; u < tokens.length; u++) {
        if (UNID[tokens[u]]) { unidade = UNID[tokens[u]]; break; }
      }

      // 3) Termos de busca: tira números, unidades, stopwords; aplica sinônimos
      var termos = [];
      for (var t = 0; t < tokens.length; t++) {
        var tk = tokens[t];
        if (/^\d/.test(tk)) continue;
        if (UNID[tk]) continue;
        if (STOP[tk]) continue;
        if (tk.length < 3) continue;
        termos.push(SINONIMOS[tk] || tk);
      }

      // 4) Código digitado direto? -> match certo (multi-base)
      var codDigitado = (bruto.match(/\b(\d{5,7})\b/) || [])[1];
      var hit = codDigitado ? this._obter(codDigitado) : null;
      if (hit) {
        var itx = hit.item;
        return this._linha(bruto, quantidade, unidade || itx.unidade, termos,
          [{ item: itx, fonte: hit.fonte, confianca: 100, motivo: "código informado" }], "ok"); // FASE 1.2: fonte REAL, não "SINAPI" no chute
      }

      // 5) Busca por termos + ranking de confiança (multi-base)
      var candidatos = [];
      if (termos.length) {
        var res = this._buscar(termos.join(" "), 8);
        candidatos = res.map(function (r) {
          return { item: r.item, fonte: r.fonte || "SINAPI", confianca: Escopo._confianca(termos, unidade, r.item), motivo: "busca por termos" };
        }).sort(function (a, b) { return b.confianca - a.confianca; }).slice(0, 3);
      }

      var status = candidatos.length ? "ok" : "pendente";
      return this._linha(bruto, quantidade, unidade, termos, candidatos, status, qtdAchada);
    },

    /* Confiança 0-100: fração de termos achados na descrição + bônus de unidade. */
    _confianca: function (termos, unidade, item) {
      var desc = Util.normalizar(item.descricao);
      var achados = 0;
      for (var i = 0; i < termos.length; i++) {
        if (desc.indexOf(termos[i]) > -1) achados++;
      }
      var frac = termos.length ? achados / termos.length : 0;
      var bonusUnid = (unidade && Util.normalizar(item.unidade) === Util.normalizar(unidade)) ? 0.2 : 0;
      var score = Math.min(1, frac * 0.8 + bonusUnid);
      return Math.round(score * 100);
    },

    nivel: function (conf) {
      if (conf >= 70) return { rotulo: "Alta", cor: "verde" };
      if (conf >= 40) return { rotulo: "Média", cor: "amarelo" };
      return { rotulo: "Baixa", cor: "vermelho" };
    },

    _linha: function (bruto, quantidade, unidade, termos, candidatos, status, qtdAchada) {
      return {
        textoOriginal: bruto,
        quantidade: quantidade,
        qtdInferida: !qtdAchada,
        unidade: unidade,
        termos: termos,
        candidatos: candidatos,
        escolhido: candidatos.length ? 0 : -1, // índice do candidato selecionado (-1 = ignorar)
        status: status
      };
    },

    // Busca/obter multi-base (Bases) com fallback p/ Sinapi. Retorna [{item,fonte}].
    _buscar: function (q, max) {
      if (typeof Bases !== "undefined" && Bases.buscar) return Bases.buscar(q, max || 8);
      if (typeof Sinapi !== "undefined" && Sinapi.buscar) return Sinapi.buscar(q, { max: max || 8 }).map(function (it) { return { item: it, fonte: "SINAPI" }; });
      return [];
    },
    // FASE 1.2: devolve { item, fonte } com a fonte REAL de onde o código saiu.
    _obter: function (cod) {
      if (typeof Sinapi !== "undefined" && Sinapi.obter) {
        var s = Sinapi.obter(cod);
        if (s) return { item: s, fonte: "SINAPI" };
      }
      if (typeof Bases !== "undefined" && Bases.obter) {
        var it = Bases.obter(cod);
        if (it) {
          var fonte = it.baseFonte || "OUTRA";
          if (fonte === "OUTRA" && Bases.lista) { // descobre em QUAL base extra o código está
            var ls = Bases.lista() || [];
            for (var i = 0; i < ls.length; i++) {
              var f = ls[i] && ls[i].fonte;
              if (f && f !== "SINAPI" && Bases.obter(f, cod)) { fonte = f; break; }
            }
          }
          return { item: it, fonte: fonte };
        }
      }
      return null;
    },

    // Recebe os itens estruturados pela IA do ERP ({etapa,descricao,unidade,quantidade})
    // e casa cada um com as bases — reusa analisarLinha (que já busca + ranqueia).
    analisarItensIA: function (itens) {
      var self = this, out = [];
      (itens || []).forEach(function (it) {
        if (!it || !Util.naoVazio(it.descricao)) return;
        var l = self.analisarLinha(String(it.descricao));
        var q = Util.num(it.quantidade); if (q > 0) { l.quantidade = q; l.qtdInferida = false; }
        if (Util.naoVazio(it.unidade)) l.unidade = it.unidade;
        l.etapaSugerida = it.etapa || "";
        l.textoOriginal = (it.etapa ? "[" + it.etapa + "] " : "") + it.descricao;
        out.push(l);
      });
      return out;
    }
  };

  global.Escopo = Escopo;
})(window);

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

  // Dicionário escalável de sinônimos: termo do usuário -> termo SINAPI provável.
  // #21: expandido de ~30 p/ 100+ termos reais de obra. REGRA: todo VALOR deste
  // mapa precisa existir em descrição da base SINAPI real — validado automatica-
  // mente contra data/sinapi-MG-2026-05.json em tools/test-escopo.js (sem chute).
  var SINONIMOS = {
    // vedações e revestimentos
    "tijolo": "bloco", "parede": "alvenaria", "muro": "alvenaria", "reboco": "emboco",
    "massa": "emboco", "emboco": "emboco", "chapisco": "chapisco", "salpico": "chapisco",
    "ceramica": "ceramico", "azulejo": "ceramico", "porcelanato": "porcelanato",
    "pastilha": "pastilha", "textura": "textura", "grafiato": "textura",
    "drywall": "acartonado", "divisoria": "divisoria",
    // pisos
    "piso": "piso", "contrapiso": "contrapiso", "cimentado": "cimentado",
    "granilite": "granilite", "vinilico": "vinilico", "laminado": "laminado",
    "rodape": "rodape", "soleira": "soleira", "peitoril": "peitoril",
    "intertravado": "intertravado", "bloquete": "intertravado",
    // estrutura e fundação
    "fundacao": "concreto", "sapata": "sapata", "baldrame": "baldrame",
    "radier": "concreto", "broca": "estaca", "estaca": "estaca",
    "viga": "concreto", "pilar": "concreto", "laje": "laje", "concretagem": "concreto",
    "ferro": "armacao", "aco": "armacao", "vergalhao": "armacao", "armadura": "armacao",
    "estribo": "armacao", "arranque": "armacao", "forma": "forma",
    "escoramento": "escoramento", "graute": "graute", "grauteamento": "graute",
    // cobertura
    "telhado": "telha", "cobertura": "telha", "madeiramento": "trama",
    "cumeeira": "cumeeira", "calha": "calha", "rufo": "rufo",
    "forro": "forro", "gesso": "gesso",
    // pintura
    "tinta": "tinta", "pintura": "tinta", "latex": "latex", "acrilica": "acrilica",
    "selador": "selador", "verniz": "verniz", "esmalte": "esmalte",
    // elétrica
    "eletrica": "cabo", "fiacao": "cabo", "tomada": "tomada", "interruptor": "interruptor",
    "disjuntor": "disjuntor", "eletroduto": "eletroduto", "conduite": "eletroduto",
    "luminaria": "luminaria", "lampada": "lampada", "aterramento": "aterramento",
    "haste": "haste", "quadro": "quadro",
    // hidráulica e louças
    "hidraulica": "tubo", "encanamento": "tubo", "tubulacao": "tubo", "pvc": "pvc",
    "esgoto": "esgoto", "agua": "agua", "joelho": "joelho", "conexao": "conexoes",
    "registro": "registro", "torneira": "torneira", "chuveiro": "chuveiro",
    "ducha": "chuveiro", "ralo": "ralo", "sifao": "sifao",
    "vaso": "sanitario", "privada": "sanitario", "bacia": "bacia", "mictorio": "mictorio",
    "pia": "lavatorio", "louca": "sanitario", "tanque": "tanque",
    "reservatorio": "reservatorio", "hidrometro": "hidrometro", "cavalete": "cavalete",
    // esquadrias
    "janela": "janela", "porta": "porta", "portao": "portao", "vidro": "vidro",
    "basculante": "basculante", "veneziana": "veneziana", "fechadura": "fechadura",
    "dobradica": "dobradica", "corrimao": "corrimao", "grade": "grade",
    // impermeabilização
    "impermeabilizacao": "impermeabilizacao", "manta": "manta", "asfaltica": "manta",
    // terra, infra e urbanização
    "limpeza": "limpeza", "terraplanagem": "escavacao", "escavacao": "escavacao",
    "vala": "vala", "aterro": "aterro", "reaterro": "reaterro",
    "compactacao": "compactacao", "lastro": "lastro", "brita": "brita", "areia": "areia",
    "sarjeta": "sarjeta", "calcada": "passeio", "passeio": "passeio",
    "drenagem": "dreno", "dreno": "dreno", "alambrado": "alambrado", "cerca": "cerca",
    // demolição e serviços preliminares
    "demolicao": "demolicao", "remocao": "remocao", "retirada": "remocao",
    "entulho": "entulho", "cacamba": "entulho", "andaime": "andaime",
    "tapume": "tapume", "barracao": "container", "container": "container", "placa": "placa",
    "locacao": "locacao", "gabarito": "gabarito"
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
      // #22: unidade colada no número ("10m2 de piso", "3,5m3 concreto") —
      // separa dígito+letra p/ o token da unidade nascer solto e ser achado.
      norm = norm.replace(/(\d)([a-z])/g, "$1 $2");
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

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

    /* ⚠ O DICIONARIO SAI DAQUI PORQUE OUTRO MODULO PRECISAVA DELE E NAO TINHA.
       Medido em 23/08/2026 sobre os 140 termos deste mapa: o criador de
       composicoes recusava a palavra do usuario e aceitava a da base —
       "azulejo" recusado / "ceramico" aceito, "salpico" / "chapisco",
       "fiacao" / "cabo", "bloquete" / "intertravado", quatro em quatro. O
       Escopo Inteligente entendia; o criador, nao, e a mesma pessoa via os
       dois comportamentos no mesmo app.

       Exposto como leitura, nao como copia: duas listas de sinonimos
       divergiriam no primeiro termo novo. */
    SINONIMOS: SINONIMOS,

    /* ==================================================================
     * PACOTES DE ATIVIDADE (v1.1.219)
     *
     * O cliente escreve "alvenaria" e espera o serviço INTEIRO. Hoje volta
     * uma linha só, e o que a boa técnica exige junto — marcação, vergas,
     * encunhamento — fica por conta da memória de quem orça. É exatamente o
     * que some num orçamento apressado e vira aditivo depois.
     *
     * ⚠ VEM MARCADO, MAS APAGAR TEM DE SER BARATO. Trazer a mais só é a
     * decisão certa se desmarcar for um clique — senão a lista vira ruído e
     * o orçamentista para de ler.
     *
     * ⚠ CADA AUXILIAR DIZ POR QUE ENTROU. Sem isso o cliente não sabe o que
     * está apagando, e apagar no escuro é pior que não sugerir.
     * ================================================================== */
    PACOTES: {
      alvenaria: {
        gatilhos: ["alvenaria", "parede", "bloco ceramico", "bloco de concreto", "tijolo"],
        auxiliares: [
          { termo: "marcação de alvenaria", porque: "primeira fiada e locação — sempre precede a elevação" },
          { termo: "verga e contraverga em concreto", porque: "obrigatório sobre vãos de porta e janela" },
          { termo: "encunhamento de alvenaria", porque: "fecha a última fiada na viga; some do orçamento e vira aditivo" },
          { termo: "tela de amarração alvenaria estrutura", porque: "ligação da parede ao pilar" }
        ]
      },
      revestimentoParede: {
        gatilhos: ["reboco", "emboco", "chapisco", "revestimento de parede", "massa unica"],
        auxiliares: [
          { termo: "chapisco em parede", porque: "camada de aderência: sem ela o reboco descola" },
          { termo: "taliscamento e mestras", porque: "define prumo e espessura antes do reboco" }
        ]
      },
      piso: {
        gatilhos: ["piso", "contrapiso", "porcelanato", "ceramica", "concreto usinado"],
        auxiliares: [
          { termo: "regularização de base para piso", porque: "nivelamento sob o revestimento" },
          { termo: "junta de dilatação", porque: "pano grande sem junta trinca" },
          { termo: "rejuntamento", porque: "acabamento que fecha o serviço" }
        ]
      },
      pintura: {
        gatilhos: ["pintura", "tinta acrilica", "latex", "esmalte"],
        auxiliares: [
          { termo: "massa corrida em parede", porque: "regulariza antes da tinta" },
          { termo: "fundo selador acrilico", porque: "sela o substrato e reduz o consumo de tinta" },
          { termo: "lixamento de parede", porque: "preparo entre demãos" }
        ]
      },
      cobertura: {
        gatilhos: ["telhado", "cobertura", "telha", "estrutura de madeira"],
        auxiliares: [
          { termo: "estrutura de madeira para telhado", porque: "sustenta a telha" },
          { termo: "calha e rufo", porque: "sem eles a água entra na alvenaria" }
        ]
      },
      demolicao: {
        gatilhos: ["demolicao", "remocao", "retirada"],
        auxiliares: [
          { termo: "carga e transporte de entulho", porque: "o material demolido tem de sair da obra" },
          { termo: "caçamba para entulho", porque: "destinação do resíduo" }
        ]
      }
    },

    NIVEIS: {
      enxuto: { rotulo: "Enxuto", ajuda: "Só o que foi escrito — nada de auxiliares.", auxiliares: 0 },
      padrao: { rotulo: "Padrão", ajuda: "O serviço mais os auxiliares que a boa técnica exige.", auxiliares: 2 },
      completo: { rotulo: "Completo", ajuda: "Tudo: auxiliares, preparo e serviços de apoio.", auxiliares: 99 }
    },

    /* Quais auxiliares o texto pede. Puro: devolve sugestões, não mexe em nada.
     * `jaTem` evita sugerir o que o próprio usuário já escreveu. */
    auxiliaresPara: function (texto, nivel) {
      var N = this.NIVEIS[nivel] || this.NIVEIS.padrao;
      if (!N.auxiliares) return [];
      var t = Util.normalizar(String(texto || ""));
      var out = [], vistos = {};
      var self = this;
      Object.keys(this.PACOTES).forEach(function (k) {
        var p = self.PACOTES[k];
        var casou = p.gatilhos.some(function (g) { return t.indexOf(Util.normalizar(g)) >= 0; });
        if (!casou) return;
        p.auxiliares.slice(0, N.auxiliares).forEach(function (a) {
          var chave = Util.normalizar(a.termo);
          if (vistos[chave]) return;
          /* já escrito pelo usuário: não sugerir o que ele mesmo pediu */
          if (t.indexOf(chave) >= 0) return;
          vistos[chave] = 1;
          out.push({ termo: a.termo, porque: a.porque, pacote: k });
        });
      });
      return out;
    },

    /* ==================================================================
     * PLANILHA → TEXTO DE ESCOPO (v1.1.219)
     *
     * O cliente recebe a planilha de quantitativos do arquiteto e redigita
     * linha por linha. A matriz já chega pronta (App._lerPlanilha lê .xlsx,
     * .xls e .csv desde sempre) — o que faltava era virar escopo.
     *
     * ⚠ NÃO É O IMPORTADOR. O Importador monta orçamento com etapas e casa
     * código. Aqui é MATÉRIA-PRIMA para o escopo: descrição + quantidade +
     * unidade viram linhas de texto que o agente analisa como se tivessem
     * sido digitadas. Quem decide o que entra continua sendo o usuário.
     * ================================================================== */
    daMatriz: function (matriz, opts) {
      opts = opts || {};
      var linhas = Array.isArray(matriz) ? matriz : [];
      if (!linhas.length) return { ok: false, erro: "Planilha vazia." };
      var val = function (c) {
        if (c == null) return "";
        if (typeof c === "object") return String(c.text || c.result || c.richText && c.richText.map(function (r) { return r.text; }).join("") || "");
        return String(c);
      };
      /* v1.1.233 — Util.num, não um parser local: célula-texto "1.500" (mil e
         quinhentos, comum em CSV BR) virava 1,5 com o parser antigo.
         ⚠ v1.1.235 — E NÚMERO NÃO VIRA TEXTO. A troca acima criou um defeito
         PIOR: a célula NUMÉRICA do ExcelJS chega como Number (0.125), o val()
         a stringificava para "0.125", e o parser BR lia isso como MILHAR →
         125 m³ de concreto no lugar de 0,125. O dado chegou não-ambíguo e era
         destruído por um round-trip desnecessário — justo na faixa de 3 casas,
         que é o padrão de volume (m³) e peso (t) em quantitativo brasileiro.
         Número (e resultado de fórmula) passa direto; só texto vai ao parser. */
      var num = function (c) {
        var v = (c && typeof c === "object") ? (c.result != null ? c.result : c.value) : c;
        if (typeof v === "number") return isFinite(v) ? v : 0;
        return Util.num(val(c));
      };
      /* acha as colunas pelo cabeçalho; sem cabeçalho reconhecível, usa a
         coluna de texto mais longa como descrição — é o que a planilha de
         quantitativo tem de mais estável */
      var iDesc = -1, iQtd = -1, iUn = -1, cabLinha = -1;
      for (var r = 0; r < Math.min(linhas.length, 25); r++) {
        var L = linhas[r] || [];
        for (var c = 0; c < L.length; c++) {
          var t = Util.normalizar(val(L[c]));
          if (iDesc < 0 && /descri|servi|discrimina|especifica/.test(t)) { iDesc = c; cabLinha = r; }
          if (iQtd < 0 && /^(qtd|quant)/.test(t)) { iQtd = c; cabLinha = r; }
          if (iUn < 0 && /^(un|und|unid)/.test(t)) { iUn = c; cabLinha = r; }
        }
        if (iDesc >= 0 && iQtd >= 0) break;
      }
      if (iDesc < 0) {
        var maior = {}, melhor = -1, best = 0;
        linhas.slice(0, 60).forEach(function (L) {
          (L || []).forEach(function (cel, ci) {
            var s = val(cel); if (s.length > 12 && !/^\d/.test(s)) maior[ci] = (maior[ci] || 0) + 1;
          });
        });
        Object.keys(maior).forEach(function (ci) { if (maior[ci] > best) { best = maior[ci]; melhor = +ci; } });
        iDesc = melhor;
      }
      if (iDesc < 0) return { ok: false, erro: "Não achei uma coluna de descrição nesta planilha." };
      var out = [], ignoradas = 0;
      for (var i = (cabLinha >= 0 ? cabLinha + 1 : 0); i < linhas.length; i++) {
        var lin = linhas[i] || [];
        var desc = val(lin[iDesc]).trim();
        if (desc.length < 4) { ignoradas++; continue; }
        /* linha de etapa/total não é serviço: não tem quantidade e costuma
           vir em caixa alta — mandar isso ao agente polui o escopo inteiro */
        if (/^(total|subtotal|etapa|item)\b/i.test(desc)) { ignoradas++; continue; }
        var q = iQtd >= 0 ? num(lin[iQtd]) : 0;
        var u = iUn >= 0 ? val(lin[iUn]).trim() : "";
        out.push({ descricao: desc, quantidade: q, unidade: u,
                   texto: desc + (q > 0 ? " " + String(q).replace(".", ",") + (u ? " " + u : "") : "") });
      }
      if (!out.length) return { ok: false, erro: "Nenhuma linha de serviço reconhecida nesta planilha." };
      return { ok: true, linhas: out, texto: out.map(function (x) { return x.texto; }).join("\n"),
               colunas: { descricao: iDesc, quantidade: iQtd, unidade: iUn }, ignoradas: ignoradas };
    },

    /* ==================================================================
     * DOCUMENTO → ESCOPO (v1.1.222): planta DXF e PDF
     *
     * Um extrator só para as duas fontes, de propósito: o que interessa numa
     * planta e num memorial é a mesma coisa — AMBIENTE + ÁREA. O arquiteto
     * escreve "SALA 12,50 m²" na etiqueta do cômodo e repete no quadro de
     * áreas do PDF. Ler as duas com a mesma regra é uma regra para manter,
     * não duas para divergirem.
     *
     * ⚠ ISTO NÃO MEDE O DESENHO. Não fecha polilinha nem calcula área de
     * geometria: lê o que está ESCRITO. Área calculada de traço aberto sai
     * errada em silêncio, e num orçamento isso vira preço errado — enquanto
     * a etiqueta é o que o próprio projetista assinou.
     * ================================================================== */
    deTextos: function (linhas, opts) {
      opts = opts || {};
      var arr = Array.isArray(linhas) ? linhas : String(linhas || "").split(/\r?\n/);
      var achados = [], vistos = {};
      /* "SALA DE ESTAR 12,50 m2" / "A=12,50m²" / "Área: 12.50 m2" */
      var reArea = /([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?|[0-9]+(?:[.,][0-9]+)?)\s*m\s*(?:²|2\b)/i;
      arr.forEach(function (bruto) {
        var s = String(bruto == null ? "" : bruto).replace(/\s+/g, " ").trim();
        if (s.length < 3 || s.length > 160) return;
        var m = s.match(reArea);
        if (!m) return;
        /* v1.1.233 — mesma correção do daMatriz: "GALPAO 1.250 m2" convertia
           para 1,25 m² porque o milhar só era tratado com vírgula presente */
        var area = Util.num(m[1]);
        if (!(area > 0) || area > 100000) return;      // 100 mil m² num rótulo é erro de leitura
        /* o nome é o que sobra antes da medida, sem o ruído de cota */
        var nome = s.slice(0, m.index).replace(/[=:\-–—.]+\s*$/, "").replace(/\b(a|área|area)\s*$/i, "").trim();
        if (nome.length < 3) return;                    // "12,50 m²" solto não é ambiente
        var chave = Util.normalizar(nome) + "|" + area.toFixed(2);
        if (vistos[chave]) return;                      // etiqueta repetida em duas vistas
        vistos[chave] = 1;
        achados.push({ ambiente: nome, area: Math.round(area * 100) / 100, origem: s });
      });
      if (!achados.length) return { ok: false, erro: "Não achei ambientes com área escrita (ex.: \"SALA 12,50 m²\")." };
      var total = achados.reduce(function (s, a) { return s + a.area; }, 0);
      return {
        ok: true, ambientes: achados,
        total: Math.round(total * 100) / 100,
        /* vira linha de escopo com a área do ambiente — o serviço quem escolhe
           é o usuário, porque planta não diz se o piso é porcelanato ou vinílico */
        texto: achados.map(function (a) {
          return a.ambiente + " " + String(a.area).replace(".", ",") + " m2";
        }).join("\n")
      };
    },

    /* Da planta DXF: as etiquetas de ambiente. `layers` entra como pista do
     * que o projeto tem, mas não vira quantidade — nome de layer não é medida. */
    daPlantaDXF: function (parsed, opts) {
      if (!parsed || !parsed.textos) return { ok: false, erro: "DXF sem textos legíveis." };
      var r = this.deTextos(parsed.textos.map(function (t) { return t.txt; }), opts);
      if (r.ok) {
        r.layers = Object.keys(parsed.layers || {}).slice(0, 40);
        r.unidade = parsed.unidade || null;
      }
      return r;
    },

    /* Analisa um bloco de texto: 1 item por linha. */
    analisar: function (texto, opts) {
      var linhas = String(texto || "").split(/\r?\n/);
      var out = [];
      for (var i = 0; i < linhas.length; i++) {
        var bruto = linhas[i].trim();
        if (!bruto) continue;
        out.push(this.analisarLinha(bruto, opts));
      }
      return out;
    },

    analisarLinha: function (bruto, opts) {
      var norm = Util.normalizar(bruto);
      // #22: unidade colada no número ("10m2 de piso", "3,5m3 concreto") —
      // separa dígito+letra p/ o token da unidade nascer solto e ser achado.
      norm = norm.replace(/(\d)([a-z])/g, "$1 $2");
      var tokens = norm.split(" ").filter(Boolean);

      /* 1) Quantidade (v1.1.233 — dois defeitos moravam aqui):
         a) o ramo de milhar com `*` casava "125" DENTRO de "1250" e parava —
            todo inteiro de 4+ dígitos era truncado (1250 m² → 125). O `+`
            exige o grupo de milhar de verdade; sem ele, o número inteiro cai
            no 2º ramo.
         b) o PRIMEIRO número da linha nem sempre é a quantidade: em
            "BLOCO 14X19X39 250 m2" ela é o 250 — o número colado à unidade.
            A preferência agora é essa; o primeiro número segue como último
            recurso para linha sem unidade. */
      var quantidade = 1, qtdAchada = false;
      var mNum = bruto.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/);
      if (mNum) { quantidade = Util.num(mNum[1]) || 1; qtdAchada = true; }

      // 2) Unidade: token que bate com UNID
      var unidade = null, uIdx = -1;
      for (var u = 0; u < tokens.length; u++) {
        if (UNID[tokens[u]]) { unidade = UNID[tokens[u]]; uIdx = u; break; }
      }
      // o número imediatamente ANTES da unidade é o quantitativo de verdade
      if (uIdx > 0 && /^\d/.test(tokens[uIdx - 1])) {
        var qAntes = Util.num(tokens[uIdx - 1]);
        if (qAntes > 0) { quantidade = qAntes; qtdAchada = true; }
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

      /* 4) Código digitado direto? -> match certo (multi-base)
         v1.1.233 — número de NORMA não é código de base. "CONFORME NBR 12721
         50 m2" casava um insumo aleatório com confiança 100 e pré-selecionado:
         a NBR virava cotovelo de cobre na planilha. O código digitado em
         qualquer posição continua valendo (é fluxo documentado no teste da
         denylist) — só a referência normativa é descartada. */
      var codDigitado = (bruto.match(/\b(\d{5,7})\b/) || [])[1];
      if (codDigitado && new RegExp("\\b(?:NBR|NM|ISO|ABNT|DIN|ASTM|NR|EB|MB)\\s*[:.\\-]?\\s*" + codDigitado + "\\b", "i").test(bruto)) {
        codDigitado = null;
      }
      var hit = codDigitado ? this._obter(codDigitado) : null;
      if (hit) {
        var itx = hit.item;
        return this._linha(bruto, quantidade, unidade || itx.unidade, termos,
          [{ item: itx, fonte: hit.fonte, confianca: 100, motivo: "código informado" }], "ok"); // FASE 1.2: fonte REAL, não "SINAPI" no chute
      }

      // 5) Busca por termos + ranking de confiança (multi-base)
      var candidatos = [];
      if (termos.length) {
        var res = this._buscar(termos.join(" "), 8, opts);
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
      var _uk = function (u) { return (typeof Util !== "undefined" && Util.unidadeChave) ? Util.unidadeChave(u) : String(u || "").toLowerCase(); };
      var bonusUnid = (unidade && _uk(item.unidade) === _uk(unidade)) ? 0.2 : 0;
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
    /* ⚠ AQUI A DENYLIST DO ORÇAMENTO VALE — e em `_obter` (logo abaixo) NÃO.
     * A assimetria é proposital. O que sai daqui é um CANDIDATO escolhido pelo
     * ranking, que o usuário aceita em lote num clique só ("Adicionar
     * selecionados"): ele não escolheu a base, o score escolheu. Se o banco foi
     * desmarcado no passo 3, lançar preço dele é exatamente o que o usuário
     * pediu para não acontecer — e a linha tem estado honesto para a falta
     * ("Pendente"), então filtrar não esconde nada, só adia.
     * Em `_obter` o gesto é outro: o usuário DIGITOU o código. Digitar código é
     * escolher a base de propósito; filtrar ali transformaria escolha explícita
     * em "esse código não existe".
     *
     * ⚠ O MÓDULO CONTINUA PURO: a lista chega por PARÂMETRO. Nada de ler App
     * ou Orcamento daqui — tools/test-escopo.js e tools/test-medios.js carregam
     * este arquivo direto no Node, sem window. Sem `opts`, o comportamento é
     * byte a byte o de sempre. */
    _buscar: function (q, max, opts) {
      var negar = (opts && opts.excluirFontes && opts.excluirFontes.length) ? opts.excluirFontes : null;
      if (typeof Bases !== "undefined" && Bases.buscar) {
        if (!negar) return Bases.buscar(q, max || 8);
        return Bases.buscar(q, { max: max || 8, excluirFontes: negar });
      }
      if (typeof Sinapi !== "undefined" && Sinapi.buscar) {
        /* sem a camada multi-base o fallback é a SINAPI crua — e ele NÃO pode
           reintroduzir justamente o banco que o usuário desmarcou */
        for (var i = 0; negar && i < negar.length; i++) {
          if (String(negar[i]).toUpperCase() === "SINAPI") return [];
        }
        return Sinapi.buscar(q, { max: max || 8 }).map(function (it) { return { item: it, fonte: "SINAPI" }; });
      }
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
    analisarItensIA: function (itens, opts) {
      var self = this, out = [];
      (itens || []).forEach(function (it) {
        if (!it || !Util.naoVazio(it.descricao)) return;
        var l = self.analisarLinha(String(it.descricao), opts);
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

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

  /* ===================================================================
   * O GRUPO DA BASE NÃO É O GRUPO DO CRIADOR — e ninguém tinha traduzido
   *
   * ⚠ O DEFEITO, MEDIDO: a base publica **171 nomes de grupo** distintos
   *   ("Instalações Prediais de Água Fria em PVC", "Fôrmas para Estruturas de
   *   Concreto Armado", "Massa Única Externa"…) e o criador tem 18 rótulos
   *   fixos. A tradução era `GRUPOS.indexOf(grupo.toUpperCase()) >= 0`, ou
   *   seja, igualdade exata — e **nenhum** dos 171 é igual a nenhum dos 18.
   *   Resultado: toda composição elaborada a partir da base real nascia no
   *   grupo OUTROS, com código PROP-GER-001.
   *
   *   O código legível por grupo (PROP-ALV-001) existe desde a v1.1.223 para
   *   que o item se identifique sozinho numa planilha entregue. Nascendo
   *   sempre GER, ele identificava só que a tradução não existia.
   *
   * ⚠ A ORDEM DAS REGRAS É A REGRA. Primeira que casa vence, e por isso
   *   "Instalações de Gás e Incêndio" precisa ser decidido ANTES de
   *   "Instalações Elétricas" — as duas contêm "instalaç". Mexer na ordem sem
   *   rodar tools/medir-grupos.js troca o grupo de centenas de composições.
   *
   * ⚠ OUTROS CONTINUA SENDO RESPOSTA LEGÍTIMA, não fracasso do mapa. Três
   *   famílias da base não são serviço de obra e não têm grupo honesto entre
   *   os 18: custo horário de equipamento, depreciação/juros/seguros e o
   *   "Livro SINAPI: Cálculos e Parâmetros". Somam 1.708 das 10.454. Forçá-las
   *   num grupo de serviço seria mentir para melhorar uma métrica.
   * =================================================================== */
  var REGRAS_GRUPO = [
    /* --- ANTES DE TUDO: o que NAO e servico de obra ---
       Sem esta primeira regra, "Custos Horarios ... dos Equipamentos" casava
       com "equipamento" la embaixo e virava SERVICOS COMPLEMENTARES. Custo
       horario de escavadeira nao e um servico que alguem orca; e um insumo de
       calculo. OUTROS aqui e a resposta certa, nao a desistencia. */
    [/(custos horarios|depreciacao|livro sinapi|juros, impostos)/, "OUTROS"],

    /* --- o que precisa vencer antes do generico --- */
    [/(deteccao de incendio|alarme de incendio)/, "INSTALAÇÕES ELÉTRICAS"],
    [/(^|[^a-z])(gas|incendio|hidrante|sprinkler|combate a incendio)([^a-z]|$)/, "INSTALAÇÕES HIDROSSANITÁRIAS"],
    [/(agua fria|agua quente|esgoto|aguas pluviais|hidraulic|hidrossanitar|sanitari|loucas e metais|louca|valvula|registro|reservacao|recalque|[^a-z]pex[^a-z]|[^a-z]ppr[^a-z]|[^a-z]cpvc[^a-z]|caixa d.?agua|caixas de agua|ralo|sifao|fossa|sumidouro|hidrometro|sistemas de medicao|ponto de consumo|pontos de consumo)/, "INSTALAÇÕES HIDROSSANITÁRIAS"],
    [/(instalacoes em cobre)/, "INSTALAÇÕES HIDROSSANITÁRIAS"],
    [/(eletric|eletroduto|eletrocalha|disjuntor|contator|barramento|tomada|interruptor|cabo|quadro|poste|luminar|iluminac|lampada|spda|para.?raio|telefon|logic|cftv|antena|interfone|energia solar|fotovoltaic)/, "INSTALAÇÕES ELÉTRICAS"],

    /* --- redes enterradas: tubo assentado, nao instalacao predial. HDD e
           Tunnel Liner sao assentamento SEM vala — mesma familia. --- */
    [/(assentamento de tubo|rede de agua|redes de agua|rede de esgoto|redes de esgoto|[^a-z]pead[^a-z]|poco de visita|pocos de visita|boca de lobo|bocas de lobo|bueiro|drenagem|dreno|galeria|perfuracao horizontal|[^a-z]hdd[^a-z]|tunnel liner|caixas enterradas|caixa enterrada|dissipador)/, "ASSENTAMENTO DE TUBOS E PEÇAS"],

    /* --- estrutura --- */
    [/(fundac|estaca|sapata|tubul|bloco de coroamento|broca|baldrame|radier|tirante|solo grampeado|grampo para solo)/, "FUNDAÇÕES"],
    [/(forma|escoramento|cimbrament|concreto|armadura|armacao|aco para|laje|viga|pilar|estrutura de concreto|escada|pre.?moldad|premoldad)/, "CONCRETO E ARMADURA"],

    /* --- vedacao e fechamento --- */
    [/(alvenaria|vedacao|bloco ceramic|bloco de concreto|divisoria|drywall|gesso acartonado|parede|muro|cobogo)/, "ALVENARIA E VEDAÇÃO"],
    [/(cobertura|telhado|telha|trama|calha|rufo|cumeeira|domus|policarbonato)/, "COBERTURA E TELHADO"],
    [/(esquadria|porta|janela|vidro|portao|gradil|corrimao|guarda.?corpo|veneziana|persiana|alcapao|brise)/, "ESQUADRIAS E VIDROS"],
    [/(impermeabiliz|manta asfaltica|manta liquida)/, "IMPERMEABILIZAÇÃO"],

    /* --- acabamento: revestimento antes de pintura, porque "acabamento em
           argamassa" e revestimento e nao tinta --- */
    [/(revestiment|azulejo|ceramic|porcelanato|forro|gesso|massa unica|massa fina|monocapa|chapisco|emboco|reboco|argamassa|rodape|soleira|peitori|chapim|chapins|granito|marmore|pastilha|textura)/, "REVESTIMENTO"],
    [/(pintura|tinta|verniz|esmalte|grafiato|selador|fundo preparador|caiacao)/, "PINTURA E ACABAMENTO"],

    /* --- terra e piso ---
           "paviment" e nao "pavimenta": a base publica "Recomposicao de
           PavimentOS" e "Pavimento Intertravado", e o sufixo -a nao casava. */
    [/(paviment|calcada|meio.?fio|guia e sarjeta|sarjeta|asfalt|imprimac|[^a-z]cbuq[^a-z]|base e sub.?base|sub.?base|paralelepipedo|usinage|tratamento.{0,2} superficia|dispositivo.{0,4} auxiliar|viario|acessibilidade|podotatil)/, "PAVIMENTAÇÃO"],
    [/(escavac|aterro|terraplen|movimento de terra|reaterro|compactac|desmonte|corte de solo|regularizacao de terreno|supressao vegetal|dragagem|esgotamento de vala|rebaixamento|lencol freatico)/, "MOVIMENTO DE TERRA"],
    [/(piso|contrapiso|lastro)/, "PAVIMENTAÇÃO"],

    /* --- os que nao constroem nada --- */
    [/(demoli|retirada|remocao|desmontagem)/, "DEMOLIÇÃO E RETIRADA"],
    [/(transporte|carga e descarga|mobilizac|desmobilizac|movimentacao de material)/, "TRANSPORTE E CARGA"],
    [/(canteiro|tapume|barracao|placa de obra|locacao de obra|ligacao provisoria|servicos preliminares|protecao coletiva|[^a-z]epi[^a-z]|[^a-z]epc[^a-z]|sinalizacao|seguranca|grua|cremalheira)/, "SERVIÇOS PRELIMINARES"],
    [/(limpeza|paisagism|grama|jardim|mobiliario|bancada|rasgo|fixac|solda|estrutura metalica|serralheria|cerca|alambrado|protetor|peneiramento|ensacamento|parquinho|ginastica|quadra|playground)/, "SERVIÇOS COMPLEMENTARES"]

    /* ⚠ DUAS FAMILIAS FICAM EM OUTROS DE PROPOSITO, e isso e um achado sobre a
       LISTA DOS 18, nao sobre o mapa:

         "Instalacoes de ar condicionado" + "Dutos" + "em cobre" (132 no MA)
         "Estruturas de Madeira" (62 no MA — pilar rolico de eucalipto)

       Climatizacao e estrutura de madeira nao tem casa entre os 18 grupos do
       criador. Empurrar climatizacao para INSTALACOES ELETRICAS ou madeira
       para CONCRETO E ARMADURA faria o rotulo do item MENTIR numa planilha
       entregue — que e exatamente o que o codigo legivel por grupo existe para
       evitar. Ficam em OUTROS ate a lista ganhar os grupos que faltam, e o
       usuario continua podendo escolher o grupo na mao. */
  ];

  /* Traduz o grupo publicado pela base para um dos 18 do criador.
   * Entrada vazia, desconhecida ou que não é serviço de obra → "OUTROS". */
  function grupoDoCriador(grupoDaBase) {
    var g = String(grupoDaBase == null ? "" : grupoDaBase).toUpperCase();
    /* o rótulo já pode ser um dos 18 (composição própria salva, ou o usuário
       escolhendo na tela) — nesse caso não há o que traduzir */
    if (GRUPOS.indexOf(g) >= 0) return g;
    var n = norm(grupoDaBase);
    if (!n) return "OUTROS";
    for (var i = 0; i < REGRAS_GRUPO.length; i++) {
      if (REGRAS_GRUPO[i][0].test(n)) return REGRAS_GRUPO[i][1];
    }
    return "OUTROS";
  }

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

  /* ===================================================================
   * FILTRO DE INTENCAO
   * ===================================================================
   * A doutrina da casa protege contra INVENTAR. Ela nao protegia contra
   * ACERTAR O ALVO ERRADO — e o score abaixo e sobreposicao de tokens, que
   * nao tem nocao de verbo.
   *
   * Medido no analitico real do Maranhao (10.454 composicoes), em cinco
   * formulacoes de "revestimento de parede em marmore", o 1o colocado era
   * sempre 99813 LIMPEZA DE REVESTIMENTO ... EM PAREDE, R$ 3,03/m2, contra
   * R$ 1.335,31 do servico honesto. Erro de 443x, com confianca alta e aviso
   * vazio: "limpeza de revestimento de marmore em parede" contem TODOS os
   * tokens do alvo. Nenhum codigo inventado, nenhum preco inventado — e o
   * numero errado mesmo assim. Em lote, sao 50 erros com selo de qualidade.
   *
   * A CABECA DA DESCRICAO E A ANCORA, e isso foi medido, nao suposto:
   *   - so a cabeca ....... execucao 93,3% | transporte 5,0% | remocao 0,9%
   *   - marca em qualquer lugar  execucao 82,2% | transporte 11,7% | remocao 3,1%
   * A segunda forma erra: as 15 composicoes com "limpeza" no meio sao TIL
   * (Tubo de Inspecao e Limpeza) e caminhao de succao — OBJETOS cujo nome
   * contem a palavra, nao servicos de limpeza. Ancorar na cabeca e a mesma
   * escolha do veta_inicio do motor de regras do plugin.
   *
   * O PADRAO E EXECUCAO, e essa e a regra que conserta o caso do marmore:
   * quem escreve "revestimento de parede em marmore" quer EXECUTAR o
   * revestimento. Quem quer limpar escreve "limpeza". O filtro e simetrico —
   * pedir limpeza continua achando limpeza.
   * =================================================================== */
  var INTENCOES = {
    limpeza:    ["limpeza", "lavagem", "higienizacao", "varricao", "desinfeccao"],
    remocao:    ["demolicao", "demolicoes", "remocao", "retirada", "desmontagem", "extracao"],
    manutencao: ["manutencao", "recuperacao", "reparo", "recomposicao", "reforma", "restauracao", "substituicao"],
    transporte: ["transporte", "carga", "descarga", "movimentacao"],
    locacao:    ["locacao", "aluguel"],
    ensaio:     ["ensaio", "sondagem", "analise"]
  };
  var ROTULO_INTENCAO = {
    execucao: "executar o servico", limpeza: "limpeza", remocao: "demolicao/remocao",
    manutencao: "manutencao/reparo", transporte: "transporte/carga",
    locacao: "locacao", ensaio: "ensaio/sondagem"
  };

  /* A intencao declarada pela CABECA do texto. Sem marca reconhecida, e
   * "execucao" — que e o que 93,3% da base e, e o que a pessoa quer dizer
   * quando nao diz verbo nenhum. */
  function intencaoDe(texto) {
    var ts = norm(texto).replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/);
    var cabeca = ts.length ? ts[0] : "";
    if (cabeca) {
      for (var k in INTENCOES) {
        if (INTENCOES[k].indexOf(cabeca) >= 0) return k;
      }
    }
    return "execucao";
  }

  /* A cabeca de OBJETO: a primeira palavra util depois de descontada a
   * marca de intencao. Em "LIMPEZA DE REVESTIMENTO..." e "revestimento";
   * em "BANCADA DE MARMORE..." e "bancada". */
  function objetoDe(texto) {
    var ts = norm(texto).replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/)
      .filter(function (t) { return t.length >= 3 && !STOP[t]; });
    if (!ts.length) return "";
    for (var k in INTENCOES) {
      if (INTENCOES[k].indexOf(ts[0]) >= 0) return ts.length > 1 ? ts[1] : "";
    }
    return ts[0];
  }

  var ComposicaoPropria = {
    UNIDADES: UNIDADES,
    GRUPOS: GRUPOS,
    catDe: catDe,
    grupoDoCriador: grupoDoCriador,

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
      var det = this.analogasComDetalhe(desc, analitico, 5);
      var cands = det.itens;
      var minimo = ctx.minimo != null ? ctx.minimo : this.LIMIAR.minimo;
      if (!cands.length || cands[0].score < minimo) {
        /* ⚠ SE O FILTRO DE INTENÇÃO BARROU CANDIDATOS, ISSO TEM DE APARECER.
           Sem esta frase o usuário lê "não achei" e conclui que a base não
           tem o serviço — quando na verdade ela tem, com outra intenção, e a
           pergunta dele é que precisa mudar. */
        var porQue = det.descartados
          ? " Descartei " + det.descartados + " candidato(s) porque são de outra intenção (" +
            det.exemplos.map(function (e) { return (ROTULO_INTENCAO[e.intencao] || e.intencao); })
              .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ") +
            ") — você pediu " + (ROTULO_INTENCAO[det.intencao] || det.intencao) + "."
          : "";
        return {
          ok: false,
          erro: "Não achei composição oficial parecida o bastante com \"" + desc + "\". " +
                "Monte manualmente ou descreva com os termos do serviço (material, espessura, aplicação)." + porQue,
          intencao: det.intencao,
          descartadosPorIntencao: det.descartados,
          alternativas: cands.slice(0, 3)
        };
      }
      var ref = cands[0];
      /* referência escolhida por fora (o reforço de IA desempatando): só vale
         se estiver ENTRE AS CANDIDATAS que este motor achou — aceitar um
         código de fora seria deixar a IA inventar a referência, que é a porta
         por onde o coeficiente inventado entraria depois. */
      if (ctx.forcarReferencia) {
        var forc = cands.filter(function (c) { return String(c.codigo) === String(ctx.forcarReferencia); })[0];
        if (forc) ref = forc;
      }
      var prop = this.daReferencia(ref._comp, { resolve: ctx.resolve });
      var grupo = ctx.grupo || prop.grupo || "";
      /* `prop.grupo` vem da BASE, com um dos 171 nomes que ela publica — a
         igualdade exata contra os 18 do criador nunca casava e todo mundo
         nascia OUTROS/PROP-GER-001. Ver o comentário de REGRAS_GRUPO. */
      grupo = grupoDoCriador(grupo);
      var unidade = ctx.unidade || prop.unidade || ref.unidade || "";
      var conf = ref.score >= this.LIMIAR.alta ? "alta" : (ref.score >= this.LIMIAR.media ? "media" : "baixa");
      /* ⚠ CABEÇA DE OBJETO DIFERENTE NÃO PODE DAR "ALTA". O filtro de
         intenção tirou a LIMPEZA da frente, mas o mesmo score de sobreposição
         ainda põe "BANCADA DE MÁRMORE" (R$ 412) em 1º lugar para "revestimento
         de parede em mármore" — e dava `confianca: alta`, que é o que faz
         alguém gravar sem olhar. Objeto diferente não é motivo para DESCARTAR
         (a base raramente usa a palavra que o engenheiro usa), mas é motivo
         de sobra para não chamar de alta. */
      var objAlvo = objetoDe(desc), objRef = objetoDe(ref.descricao);
      var objBate = !objAlvo || !objRef || objAlvo === objRef ||
                    tokens(desc).indexOf(objRef) >= 0;
      if (conf === "alta" && !objBate) conf = "media";
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
      /* ⚠ AVISO VAZIO COM CONFIANÇA ALTA FOI METADE DO DEFEITO. No caso das
         50 paredes de mármore o motor devolvia R$ 3,01/m² no lugar de
         R$ 1.335,31 com `confianca: alta`, aviso vazio e toast verde: nada na
         tela pedia conferência. O score sozinho não sabe que errou de alvo —
         então o que ele NÃO sabe passa a ser dito. */
      var avisos = [];
      if (conf !== "alta") {
        avisos.push("Semelhança " + (conf === "media" ? "média" : "baixa") +
                    " com a referência " + ref.codigo +
                    " — confira coeficiente por coeficiente antes de gravar.");
      }
      if (!objBate && objAlvo && objRef) {
        avisos.push("Você descreveu \"" + objAlvo + "\" e a referência é \"" + objRef +
                    "\" — confira se é o mesmo serviço antes de gravar.");
      }
      if (det.descartados) {
        avisos.push("Você pediu " + (ROTULO_INTENCAO[det.intencao] || det.intencao) +
                    ": deixei de fora " + det.descartados + " composição(ões) de outra intenção" +
                    (det.exemplos.length ? " (ex.: " + det.exemplos[0].codigo + " " +
                      String(det.exemplos[0].descricao).slice(0, 46) + "…)" : "") + ".");
      }
      /* ⚠ ANTES DE CLONAR, PERGUNTE SE PRECISA CLONAR. Medido em 23/08/2026
         sobre 262 descrições reais do MA: em 208 delas (79%) o agente montava
         uma composição própria copiando uma referência QUE JÁ TINHA PREÇO na
         base do estado. Clone de item precificado é perda pura — congela o
         preço na competência de hoje, nasce com código PROP-xxxx que auditoria
         questiona, e é o que encheu o banco do cliente de 65 duplicatas.
         `rota` diz qual é o caminho certo; quem chama decide o que oferecer. */
      var rota = this.rotaDe(ref, comp, ctx);
      if (rota.tipo === "oficial") {
        avisos.unshift("A composição oficial " + rota.codigo + " já tem preço na base (" +
                       rota.preco.toFixed(2).replace(".", ",") + "/" + (rota.unidade || "un") +
                       ") — usá-la vale mais que copiar: ela se atualiza sozinha a cada competência.");
      } else if (rota.tipo === "cotar") {
        avisos.unshift("A base tem esta composição (" + rota.codigo + ") com os coeficientes oficiais; " +
                       "o que falta é preço de " + rota.faltam.length + " insumo(s) neste estado" +
                       (rota.faltam.length ? " (ex.: " + String(rota.faltam[0].descricao).slice(0, 44) + "…)" : "") +
                       ". Cotar sai mais barato que remontar: a produtividade medida você mantém.");
      }
      return {
        ok: true, comp: comp, custo: custo, rota: rota,
        referencia: { codigo: ref.codigo, descricao: ref.descricao, unidade: ref.unidade, score: ref.score },
        confianca: conf,
        intencao: det.intencao,
        descartadosPorIntencao: det.descartados,
        /* o usuário pode preferir outra referência — mostrar as demais é o que
           impede o agente de parecer um oráculo de uma resposta só */
        alternativas: cands.slice(1, 4),
        aviso: avisos.join(" ")
      };
    },

    /* ==================================================================
     * MEMÓRIA DO COEFICIENTE (v1.1.223)
     *
     * O coeficiente é o número mais difícil de defender numa composição
     * própria: "12,5 blocos por m²" está certo, mas quem pergunta "por quê?"
     * não tem resposta na tela — e é a primeira pergunta de qualquer
     * auditoria. A composição oficial traz o coeficiente medido; a própria
     * traz o coeficiente de alguém.
     *
     * As calculadoras abaixo fazem a conta E REDIGEM a justificativa. Cada
     * insumo passa a poder guardar a sua em `insumo.memoria`.
     *
     * ⚠ MOSTRA A CONTA, não o resultado. "1 ÷ (0,19 × 0,39) = 13,50 pç/m²;
     * com 5% de perda = 14,18" defende sozinho. "14,18" não defende nada.
     * ================================================================== */
    FORMAS_COEF: {
      porPeca: { rotulo: "Peças por m² (bloco, piso, telha)", campos: [
        { id: "largura", rotulo: "Largura da peça (m)" },
        { id: "altura", rotulo: "Altura da peça (m)" },
        { id: "perda", rotulo: "Perda (%)", padrao: 0 }
      ] },
      consumo: { rotulo: "Consumo por unidade", campos: [
        { id: "consumo", rotulo: "Consumo por unidade de serviço" },
        { id: "perda", rotulo: "Perda (%)", padrao: 0 }
      ] },
      produtividade: { rotulo: "Produtividade (mão de obra)", campos: [
        { id: "unidadesHora", rotulo: "Unidades por hora da equipe" },
        { id: "equipe", rotulo: "Pessoas na equipe", padrao: 1 }
      ] },
      espessura: { rotulo: "Volume por espessura", campos: [
        { id: "espessura", rotulo: "Espessura (m)" },
        { id: "perda", rotulo: "Perda (%)", padrao: 0 }
      ] }
    },

    calcularCoeficiente: function (forma, d) {
      var F = this.FORMAS_COEF[forma];
      if (!F) return { ok: false, erro: "Forma de cálculo desconhecida." };
      d = d || {};
      var n = function (k, pad) { var v = Number(String(d[k] == null ? "" : d[k]).replace(",", ".")); return (v > 0) ? v : (pad != null ? pad : 0); };
      var fm = function (v, c) { return valor(v, "nenhum").toFixed(c == null ? 4 : c).replace(".", ","); };
      var perda = n("perda", 0), coef = 0, texto = "";
      if (forma === "porPeca") {
        var L = n("largura"), A = n("altura");
        if (!(L > 0 && A > 0)) return { ok: false, erro: "Informe largura e altura da peça." };
        var base = 1 / (L * A);
        coef = base * (1 + perda / 100);
        texto = "1 ÷ (" + fm(L, 3) + " m × " + fm(A, 3) + " m) = " + fm(base, 2) + " peças/m²" +
          (perda > 0 ? "\ncom " + fm(perda, 1) + "% de perda = " + fm(coef, 4) : "");
      } else if (forma === "consumo") {
        var c0 = n("consumo");
        if (!(c0 > 0)) return { ok: false, erro: "Informe o consumo." };
        coef = c0 * (1 + perda / 100);
        texto = "Consumo " + fm(c0, 4) + " por unidade" + (perda > 0 ? "\ncom " + fm(perda, 1) + "% de perda = " + fm(coef, 4) : "");
      } else if (forma === "produtividade") {
        var uh = n("unidadesHora"), eq = n("equipe", 1);
        if (!(uh > 0)) return { ok: false, erro: "Informe quantas unidades a equipe faz por hora." };
        coef = eq / uh;
        texto = eq === 1
          ? "1 h ÷ " + fm(uh, 2) + " un/h = " + fm(coef, 4) + " h por unidade"
          : fm(eq, 0) + " pessoa(s) ÷ " + fm(uh, 2) + " un/h = " + fm(coef, 4) + " h por unidade";
      } else {
        var e0 = n("espessura");
        if (!(e0 > 0)) return { ok: false, erro: "Informe a espessura." };
        coef = e0 * (1 + perda / 100);
        texto = "Espessura " + fm(e0, 3) + " m × 1 m² = " + fm(e0, 4) + " m³/m²" +
          (perda > 0 ? "\ncom " + fm(perda, 1) + "% de perda = " + fm(coef, 4) : "");
      }
      if (!(coef > 0)) return { ok: false, erro: "A conta deu zero — confira os valores." };
      return { ok: true, coeficiente: Math.round(coef * 10000) / 10000, texto: texto };
    },

    /* ⚠ REFORÇO DE IA — SÓ TEXTO E ESCOLHA, NUNCA NÚMERO (v1.1.221)
     *
     * A IA faz duas coisas aqui, ambas seguras:
     *   1. ESCOLHER entre análogas que o score não separou (empate técnico);
     *   2. NOMEAR a composição em linguagem de orçamento.
     *
     * O que ela NÃO faz, por decisão de projeto: coeficiente, insumo, preço,
     * unidade. Esses vêm da base analítica REAL, sempre. Um número que veio
     * de modelo de linguagem dentro de um orçamento é um número que ninguém
     * consegue defender — e defender preço é o trabalho do orçamentista.
     *
     * Puro: recebe a resposta já decodificada e devolve o que aceita dela.
     * A rede fica na tela; o julgamento fica aqui, testável.
     */
    aplicarReforcoIA: function (base, resposta) {
      var out = { comp: base && base.comp, usouIA: false, mudou: [] };
      if (!base || !base.ok || !resposta) return out;
      var r = resposta || {};
      /* 1. troca de referência: só vale se o código veio das candidatas que o
         MOTOR ofereceu. Código de fora seria a IA inventando referência. */
      var escolhido = String(r.referencia || "").trim();
      if (escolhido && base.referencia && escolhido !== base.referencia.codigo) {
        var permitidas = (base.alternativas || []).filter(function (a) { return String(a.codigo) === escolhido; });
        if (permitidas.length) { out.trocarPara = permitidas[0]; out.usouIA = true; out.mudou.push("referencia"); }
      }
      /* 2. nome: texto, e só texto. Limite de tamanho e sem código dentro —
         descrição com código confunde a busca da planilha depois. */
      var nome = String(r.descricao || "").trim().replace(/\s+/g, " ");
      if (nome.length >= 10 && nome.length <= 180 && !/^\d/.test(nome)) {
        out.comp = out.comp || {};
        out.descricaoSugerida = nome; out.usouIA = true; out.mudou.push("descricao");
      }
      /* ⚠ qualquer coeficiente/preço que venha na resposta é IGNORADO em
         silêncio: não é campo dela, e aceitar "só desta vez" é como isso
         começa a virar praxe. */
      return out;
    },

    /* A intencao declarada pela cabeca do texto — exposta para os testes e
     * para quem consumir o motor de fora. */
    intencaoDe: function (texto) { return intencaoDe(texto); },
    ROTULO_INTENCAO: ROTULO_INTENCAO,

    analogas: function (descricao, dadosAnalitico, n, opts) {
      return this.analogasComDetalhe(descricao, dadosAnalitico, n, opts).itens;
    },

    /* Igual a `analogas`, mas devolve TAMBEM o que foi descartado por
     * intencao e por que. Sem isso o descarte seria invisivel — e foi o
     * silencio, mais que o score, que transformou o caso do marmore em erro
     * com selo de qualidade: confianca alta, aviso vazio, toast verde. */
    analogasComDetalhe: function (descricao, dadosAnalitico, n, opts) {
      opts = opts || {};
      var querem = intencaoDe(descricao);
      var alvo = tokens(descricao);
      var vazio = { itens: [], intencao: querem, descartados: 0, exemplos: [] };
      if (!alvo.length || !dadosAnalitico || !dadosAnalitico.length) return vazio;
      var alvoSet = {};
      alvo.forEach(function (t) { alvoSet[t] = 1; });
      var out = [], fora = [];
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
        /* O descarte vem DEPOIS do `hit`: contar os 10.454 nao diria nada.
         * O que interessa e quantos candidatos PLAUSIVEIS foram barrados. */
        var intC = intencaoDe(c.descricao);
        if (!opts.semFiltro && intC !== querem) {
          fora.push({ codigo: c.codigo, descricao: c.descricao, intencao: intC,
                      custoUnitario: c.custoUnitario,
                      score: hit / Math.max(alvo.length, 3) + (hit / Math.max(ts.length, 3)) * 0.5 });
          continue;
        }
        var score = hit / Math.max(alvo.length, 3) + (hit / Math.max(ts.length, 3)) * 0.5;
        out.push({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo || "", custoUnitario: c.custoUnitario, nInsumos: c.insumos.length, score: Math.round(score * 100) / 100, intencao: intC, _comp: c });
      }
      out.sort(function (a, b) { return b.score - a.score; });
      fora.sort(function (a, b) { return b.score - a.score; });
      return {
        itens: out.slice(0, n || 5),
        intencao: querem,
        descartados: fora.length,
        exemplos: fora.slice(0, 3).map(function (f) {
          return { codigo: f.codigo, descricao: f.descricao, intencao: f.intencao,
                   custoUnitario: f.custoUnitario };
        })
      };
    },

    /* ==================================================================
     * QUAL É O CONSERTO? — três diagnósticos que a tela tratava como um só
     *
     * "A base não tem" era a única frase disponível, e ela cobria três
     * situações com consertos diferentes e custos muito diferentes. Medido no
     * SINAPI MA 2026-06 (10.454 composições no analítico, 11.590 itens com
     * preço):
     *
     *   oficial — a composição existe E TEM PREÇO. Não há o que consertar:
     *             é só usá-la. 208 de 262 descrições reais (79%) caíam aqui e
     *             mesmo assim ganhavam um clone PROP-xxxx.
     *
     *   cotar   — a composição existe no analítico, com coeficiente oficial,
     *             mas a CAIXA não publica o custo porque falta coleta de preço
     *             de algum insumo NESTE estado. São 2.050 composições, e em
     *             1.272 delas (62%) falta UM único insumo. Cotar esse insumo
     *             devolve a composição inteira, com a produtividade medida em
     *             campo que ninguém reproduz montando à mão.
     *
     *   propria — a base realmente não modela o serviço. Aqui, e só aqui,
     *             montar composição própria é o caminho certo.
     *
     * ⚠ SEM `ctx.precoOficial` NÃO SE AFIRMA "oficial". O resolve comum cai no
     *   analítico de propósito (v1.1.202), então ele responder NÃO prova que o
     *   item está na base de preços do estado. Quem sabe disso é a base de
     *   preços, e ela entra por este parâmetro — na falta dele o diagnóstico
     *   desce para cotar/propria em vez de chutar.
     * ================================================================== */
    rotaDe: function (ref, comp, ctx) {
      ctx = ctx || {};
      var cod = String((ref && ref.codigo) || "");
      var un = (ref && ref.unidade) || (comp && comp.unidade) || "";
      if (cod && typeof ctx.precoOficial === "function") {
        var p = Number(ctx.precoOficial(cod)) || 0;
        if (p > 0) {
          return { tipo: "oficial", codigo: cod, descricao: (ref && ref.descricao) || "",
                   unidade: un, preco: p, faltam: [] };
        }
      }
      var faltam = ((comp && comp.insumos) || []).filter(function (i) {
        return !(Number(i.custoUnitario) > 0);
      }).map(function (i) {
        return { codigo: String(i.codigo), descricao: i.descricao || "",
                 unidade: i.unidade || "", coeficiente: Number(i.coeficiente) || 0 };
      });
      if (faltam.length) {
        return { tipo: "cotar", codigo: cod, descricao: (ref && ref.descricao) || "",
                 unidade: un, preco: 0, faltam: faltam };
      }
      return { tipo: "propria", codigo: cod, descricao: (ref && ref.descricao) || "",
               unidade: un, preco: 0, faltam: [] };
    },

    /* O mesmo diagnóstico quando o CÓDIGO já é conhecido (linha pendente do
     * Escopo, item que a busca recusou, resíduo vindo do Revit) — sem passar
     * pela busca por semelhança, que aqui não tem o que decidir. */
    rotaDoCodigo: function (codigo, ctx) {
      ctx = ctx || {};
      var cod = String(codigo || "").trim();
      if (!cod) return { tipo: "propria", codigo: "", descricao: "", unidade: "", preco: 0, faltam: [] };
      var ref = null, lista = ctx.analitico || [];
      for (var i = 0; i < lista.length; i++) {
        if (String(lista[i].codigo) === cod) { ref = lista[i]; break; }
      }
      if (!ref) {
        /* nem no analítico: a base não modela o serviço */
        if (typeof ctx.precoOficial === "function" && Number(ctx.precoOficial(cod)) > 0) {
          return { tipo: "oficial", codigo: cod, descricao: "", unidade: "",
                   preco: Number(ctx.precoOficial(cod)), faltam: [] };
        }
        return { tipo: "propria", codigo: cod, descricao: "", unidade: "", preco: 0, faltam: [] };
      }
      return this.rotaDe(ref, this.daReferencia(ref, ctx), ctx);
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
          memoria: i.memoria || "",   // justificativa viaja com o insumo
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

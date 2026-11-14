/* =====================================================================
 * mor/catalogo-dados/etapas-estrutura.js — F3: etapas NOVAS de terra, impermeabilização e estruturas
 *
 * Etapas que não existem no orçamento paramétrico antigo (`novo:true`): ficam fora da
 * paridade com OrcParam e só aparecem no Manual acelerado/Automático novo.
 * Mesmas regras de leitura de extensoes.js (qtd:null = vem do projeto; sugestao; implicito;
 * porque). Código só quando existe na base MG 2026-06 (tabela codigos-f3.js); senão item
 * pendente com descrição + intenção. Nenhum número inventado: onde a quantidade depende de
 * projeto a quantidade é `null`.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  function pend(chave, cod, formula, intencao, quando, extra) {
    var o = { chave: chave, quando: quando || "", qtd: null, formula: formula, intencao: intencao }, k;
    if (cod) o.cod = cod;
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }
  var E = (D.etapas = D.etapas || []);

  E.push({
    id: "movterra", etapa: "MOVIMENTO DE TERRA", ordem: 1.5, novo: true,
    premissas: ["Volumes de corte e aterro dependem do levantamento planialtimétrico e do projeto de terraplenagem: ficam pendentes; só a regularização da área de projeção tem número."],
    perguntas: [],
    itens: [
      { chave: "regularizacao", cod: "regMotoniv", qtd: "Ap", formula: "área de projeção Ap", intencao: "regularização de superfície com motoniveladora" },
      pend("corte", null, "volume de corte (projeto de terraplenagem)", "escavação mecânica de corte carga e transporte", "", { desc: "ESCAVAÇÃO MECANIZADA DE CORTE, CARGA E TRANSPORTE DE SOLO DE 1ª CATEGORIA", un: "m³" }),
      pend("aterro", null, "volume de aterro compactado (projeto de terraplenagem)", "aterro compactado com material de empréstimo", "", { desc: "ATERRO COMPACTADO COM MATERIAL DE EMPRÉSTIMO, EM CAMADAS", un: "m³" })
    ]
  });

  E.push({
    id: "imperm", etapa: "IMPERMEABILIZAÇÃO", ordem: 4.5, novo: true,
    premissas: [
      "Já estão em outras etapas: baldrame (INFRAESTRUTURA), piso de área molhada (PISOS) e laje de cobertura (COBERTURA). Aqui ficam as paredes das áreas molhadas, terraços/sacadas e reservatórios.",
      "Parede de banheiro impermeabilizada até 1,50 m em todo o perímetro molhado (7,5 m por banheiro, o mesmo do revestimento); box até o teto: acrescentar na quantidade."
    ],
    perguntas: [
      { id: "imp.terraco", txt: "Área descoberta a impermeabilizar: terraço, sacada, marquise (m²)", num: true, padrao: 0, min: 0, max: 5000 }
    ],
    itens: [
      { chave: "paredesMolhadas", cod: "impParede", qtd: "banheiros*7.5*1.5", formula: "banheiros × 7,5 m de parede × 1,50 m de altura", intencao: "impermeabilização de parede de área molhada argamassa polimérica", implicito: true,
        porque: "a umidade do chuveiro e da lavagem sobe pela parede: impermeabiliza-se até 1,50 m (e o box até o teto)" },
      { chave: "terracoManta", cod: "manta1", quando: "imp.terraco>0", qtd: "imp.terraco*1.10", formula: "área × 1,10 (rodapé de 30 cm na platibanda, a mesma conta da laje de cobertura)", intencao: "impermeabilização com manta asfáltica de 4 mm" },
      { chave: "terracoProtecao", cod: "protMec", quando: "imp.terraco>0", qtd: "imp.terraco", formula: "mesma área do terraço", intencao: "proteção mecânica de superfície horizontal argamassa 1:3 e=3 cm", implicito: true,
        porque: "a manta asfáltica descoberta precisa de proteção mecânica para não furar com o trânsito" },
      pend("terracoInformar", "manta1", "informe a área descoberta (terraço, sacada, marquise); sem área não há quantidade", "impermeabilização de terraço manta asfáltica", "imp.terraco==0"),
      pend("reservatorio", null, "área interna do reservatório (projeto) — a base não tem composição de impermeabilização cristalizante", "impermeabilização de reservatório com argamassa cristalizante", "", { desc: "IMPERMEABILIZAÇÃO DE RESERVATÓRIO COM ARGAMASSA CRISTALIZANTE (FUNDO E PAREDES)", un: "m²" })
    ]
  });

  E.push({
    id: "estmetal", etapa: "ESTRUTURA METÁLICA", ordem: 21, novo: true,
    premissas: ["A SINAPI não tem composição de fabricação e montagem de estrutura metálica por kg: o peso vem do projeto (ou do OrçaPRO Metálica) e o preço da cotação do fabricante."],
    perguntas: [],
    itens: [
      pend("estruturaAco", null, "peso de aço da estrutura (pilares, vigas, terças) do projeto metálico", "fabricação e montagem de estrutura metálica", "", { desc: "FABRICAÇÃO E MONTAGEM DE ESTRUTURA METÁLICA (PILARES, VIGAS E TERÇAS) EM AÇO", un: "kg" }),
      pend("chumbadores", null, "nº de chumbadores das bases de pilar (projeto)", "chumbadores das bases de pilar", "", { desc: "CHUMBADORES DE AÇO PARA BASES DE PILAR METÁLICO, COM PORCA E ARRUELA", un: "un" }),
      pend("contraventamento", null, "peso do contraventamento (projeto)", "contraventamento tirantes estrutura metálica", "", { desc: "CONTRAVENTAMENTO EM TIRANTES DE AÇO", un: "kg" }),
      pend("pinturaEstrutura", "esmalteMetal", "área de superfície da estrutura (m²): depende do peso e dos perfis", "pintura de estrutura metálica esmalte sintético", "")
    ]
  });

  E.push({
    id: "fechamentos", etapa: "FECHAMENTOS E VEDAÇÃO", ordem: 22, novo: true,
    premissas: ["Mureta de alvenaria de 1,20 m no perímetro e, acima dela, telha metálica de fechamento: é a composição usual de galpão, mas é SUGESTÃO — confirmar com o projeto."],
    perguntas: [],
    itens: [
      { chave: "mureta", cod: "alv14", qtd: "P*1.20", formula: "perímetro × 1,20 m de altura", intencao: "mureta de alvenaria de bloco cerâmico 14x19x39 galpão", sugestao: true },
      { chave: "fechamentoTelha", qtd: "P*(h-1.20)", desc: "FECHAMENTO LATERAL EM TELHA METÁLICA TRAPEZOIDAL, INCLUSO ACESSÓRIOS DE FIXAÇÃO", un: "m²", formula: "perímetro × (pé-direito − 1,20 m da mureta)", intencao: "fechamento lateral telha metálica trapezoidal", sugestao: true },
      pend("vergasPortoes", null, "vãos de portões e portas do galpão (projeto)", "vergas e requadros de portões", "", { desc: "VERGAS E PILARETES DE REQUADRO DE PORTÕES E PORTAS", un: "m" })
    ]
  });

  E.push({
    id: "pisoind", etapa: "PISO INDUSTRIAL", ordem: 23, novo: true,
    premissas: ["Piso industrial SINAPI já traz a lona plástica, a tela, as barras de transferência e o concreto; fica só a compactação do subleito e as juntas."],
    perguntas: [
      { id: "pisoind.esp", txt: "Espessura do piso industrial", op: ["12", "14", "15"], rotulos: { "12": "12 cm", "14": "14 cm", "15": "15 cm" }, padrao: "12" }
    ],
    itens: [
      { chave: "compactacaoSubleito", cod: "radComp", qtd: "Ap", formula: "área de projeção Ap", intencao: "compactação mecânica do solo para piso sobre solo" },
      { chave: "piso12", cod: "pisoInd12", quando: "pisoind.esp=='12'", qtd: "Ap", formula: "área de projeção Ap", intencao: "piso industrial de concreto armado fck 20 espessura 12 cm" },
      { chave: "piso14", cod: "pisoInd14", quando: "pisoind.esp=='14'", qtd: "Ap", formula: "área de projeção Ap", intencao: "piso industrial de concreto armado fck 20 espessura 14 cm" },
      { chave: "piso15", cod: "pisoInd15", quando: "pisoind.esp=='15'", qtd: "Ap", formula: "área de projeção Ap", intencao: "piso industrial de concreto armado fck 20 espessura 15 cm" },
      pend("juntasPiso", null, "metros de corte e selagem de juntas (paginação do piso)", "corte e selagem de juntas de piso industrial", "", { desc: "CORTE E SELAGEM DE JUNTAS EM PISO INDUSTRIAL", un: "m", implicito: true, porque: "o piso industrial retrai: as juntas serradas controlam a fissura e precisam de selante" })
    ]
  });

  E.push({
    id: "estmadeira", etapa: "ESTRUTURA DE MADEIRA", ordem: 24, novo: true,
    premissas: ["Comprimentos de pilares, vigas e ligações vêm do projeto (OrçaPRO Madeira): ficam pendentes. A trama do telhado está na etapa COBERTURA."],
    perguntas: [],
    itens: [
      pend("pilaresMadeira", "pilarMad", "comprimento total dos pilares de madeira roliça (projeto)", "pilar de madeira roliça eucalipto", ""),
      pend("vigasMadeira", "vigaMad", "comprimento total das vigas de madeira roliça (projeto)", "viga de madeira roliça eucalipto", ""),
      pend("ligacoesMetalicas", null, "nº de ligações (chapas, parafusos, estribos) do projeto", "ligações metálicas da estrutura de madeira", "", { desc: "LIGAÇÕES METÁLICAS DA ESTRUTURA DE MADEIRA (CHAPAS, PARAFUSOS E ESTRIBOS)", un: "kg", implicito: true, porque: "as peças de madeira só trabalham juntas por meio das ligações metálicas, que o desenho de peça não mostra" })
    ]
  });

  E.push({
    id: "trmadeira", etapa: "TRATAMENTO E PINTURA DA MADEIRA", ordem: 25, novo: true,
    premissas: ["A área de madeira a tratar e pintar vem do projeto/levantamento das peças."],
    perguntas: [],
    itens: [
      pend("tratamentoPreservativo", null, "área de superfície das peças de madeira (levantamento)", "tratamento preservativo da madeira contra cupim e fungos", "", { desc: "TRATAMENTO PRESERVATIVO DE MADEIRA (CUPINICIDA E FUNGICIDA), APLICAÇÃO MANUAL", un: "m²", implicito: true }),
      pend("vernizMadeira", "vernizMadeira2", "área de superfície das peças de madeira (levantamento)", "verniz incolor em madeira duas demãos", "")
    ]
  });

  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

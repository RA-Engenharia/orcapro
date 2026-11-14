/* =====================================================================
 * mor/catalogo-dados/etapas-tipologias.js — F3: muro/arrimo e pavimentação (etapas NOVAS)
 *
 * Obras que não são edificação não têm "área construída" que diga o tamanho do muro ou da
 * rua. Por isso estas etapas PERGUNTAM a medida (comprimento do muro, área de pavimento,
 * metros de meio-fio): com a medida, a quantidade sai da fórmula; sem ela (0), um item
 * pendente avisa que falta informar — nunca se estima pelo `area` da obra.
 * Mesmas regras de leitura de extensoes.js (qtd:null, sugestao, implicito, porque).
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

  /* ---------------- MURO / ARRIMO ---------------- */
  E.push({
    id: "muro", etapa: "ESTRUTURA DO MURO / ARRIMO", ordem: 30, novo: true,
    premissas: ["Muro de divisa de alvenaria de bloco cerâmico com cinta de amarração; arrimo (gabião ou concreto armado) só com projeto de contenção e sondagem: as quantidades ficam pendentes. A fundação do muro (baldrame/sapata corrida) está em INFRAESTRUTURA — ajustar o comprimento ao do muro."],
    perguntas: [
      { id: "mur.tipo", txt: "Tipo de muro", op: ["alvenaria", "gabiao", "concreto"], rotulos: { alvenaria: "Alvenaria de bloco (divisa)", gabiao: "Arrimo em gabião", concreto: "Arrimo em concreto armado" }, padrao: "alvenaria" },
      { id: "mur.comprimento", txt: "Comprimento do muro (m) — 0 = a informar", num: true, padrao: 0, min: 0, max: 5000 },
      { id: "mur.altura", txt: "Altura do muro (m)", num: true, padrao: 2, min: 0.5, max: 8 }
    ],
    itens: [
      { chave: "muroAlvenaria", cod: "alv14", quando: "mur.tipo=='alvenaria'", qtd: "mur.comprimento*mur.altura", formula: "comprimento × altura", intencao: "alvenaria de vedação bloco cerâmico 14x19x39 muro" },
      { chave: "muroCintaConcreto", cod: "concViga", quando: "mur.tipo=='alvenaria'", qtd: "mur.comprimento*0.14*0.20", formula: "cinta de amarração 14 × 20 cm × comprimento", intencao: "concretagem de cinta de amarração fck 25", sugestao: true,
        porque: "o muro precisa de cinta no topo para travar a alvenaria; a seção 14×20 cm é SUGESTÃO (o projeto define)" },
      { chave: "muroCintaArmacao", cod: "arm10e", quando: "mur.tipo=='alvenaria'", qtd: "mur.comprimento*4*0.617*1.15", formula: "4Ø10 (0,617 kg/m, +15 % traspasse) × comprimento", intencao: "armação de cinta aço CA-50 10 mm", sugestao: true },
      { chave: "muroChapim", cod: "chapim", quando: "mur.tipo=='alvenaria'", qtd: "mur.comprimento", formula: "comprimento do muro", intencao: "chapim rufo capa em aço galvanizado", implicito: true,
        porque: "o topo do muro sem chapim deixa a água entrar na alvenaria" },
      pend("muroInformar", "alv14", "informe o comprimento do muro; sem ele não há quantidade", "alvenaria de muro de divisa", "mur.comprimento==0"),
      pend("gabiaoMuro", "gabiao", "volume de gabião do projeto de contenção (caixas de 1,0 m)", "gabião tipo caixa malha hexagonal", "mur.tipo=='gabiao'"),
      pend("arrimoConcreto", null, "volumes de fôrma, aço e concreto do projeto de contenção", "muro de arrimo em concreto armado fôrma armação e concreto", "mur.tipo=='concreto'", { desc: "MURO DE ARRIMO EM CONCRETO ARMADO (FÔRMA, ARMAÇÃO E CONCRETAGEM)", un: "m³" })
    ]
  });

  E.push({
    id: "murodren", etapa: "DRENAGEM", ordem: 31, novo: true,
    premissas: ["Muro de contenção sem drenagem acumula água atrás e cai: dreno no pé e barbacãs são obrigatórios em arrimo; o comprimento é o do muro (pergunta da etapa ESTRUTURA DO MURO / ARRIMO)."],
    perguntas: [],
    usa: ["mur.tipo", "mur.comprimento"],
    itens: [
      { chave: "drenoPe", cod: "drenoPe", quando: "mur.tipo!='alvenaria' && mur.comprimento>0", qtd: "mur.comprimento", formula: "comprimento do muro", intencao: "dreno no pé do muro de contenção com tubo perfurado e brita", implicito: true,
        porque: "o dreno no pé do arrimo tira a água que se acumula atrás do muro e aumenta o empuxo" },
      pend("drenoInformar", "drenoPe", "informe o comprimento do muro de arrimo; sem ele não há quantidade", "dreno no pé do muro de contenção", "mur.tipo!='alvenaria' && mur.comprimento==0"),
      pend("barbacas", null, "nº de barbacãs (espaçamento do projeto de contenção)", "barbacãs em tubo pvc para drenagem de muro", "mur.tipo!='alvenaria'", { desc: "BARBACÃS EM TUBO PVC DN 50 MM PARA DRENAGEM DO MURO DE CONTENÇÃO", un: "un", implicito: true }),
      pend("geotextil", null, "área de manta geotêxtil atrás do muro (projeto de contenção)", "manta geotêxtil atrás de muro de contenção", "mur.tipo!='alvenaria'", { desc: "MANTA GEOTÊXTIL ATRÁS DO MURO DE CONTENÇÃO", un: "m²", implicito: true })
    ]
  });

  E.push({
    id: "murorev", etapa: "REVESTIMENTOS E ACABAMENTOS", ordem: 32, novo: true,
    premissas: ["Muro de alvenaria: chapisco, massa única e pintura nas duas faces."],
    perguntas: [],
    usa: ["mur.tipo", "mur.comprimento", "mur.altura"],
    itens: [
      { chave: "muroChapisco", cod: "chapExt", quando: "mur.tipo=='alvenaria'", qtd: "2*mur.comprimento*mur.altura", formula: "2 faces × comprimento × altura", intencao: "chapisco em alvenaria de fachada muro" },
      { chave: "muroMassa", cod: "massaExt", quando: "mur.tipo=='alvenaria'", qtd: "2*mur.comprimento*mur.altura", formula: "2 faces × comprimento × altura", intencao: "emboço ou massa única em muro" },
      { chave: "muroPintura", cod: "paredeExt", quando: "mur.tipo=='alvenaria'", qtd: "2*mur.comprimento*mur.altura", formula: "2 faces × comprimento × altura", intencao: "tinta látex acrílica paredes externas duas demãos" }
    ]
  });

  /* ---------------- PAVIMENTAÇÃO ---------------- */
  E.push({
    id: "pavmedidas", etapa: "TERRAPLENAGEM", ordem: 33, novo: true,
    premissas: ["A medida da via (área de pavimento) é informada aqui e vale para as etapas de drenagem, pavimento, meio-fio e sinalização."],
    perguntas: [
      { id: "pav.area", txt: "Área de pavimento (m²) — 0 = a informar", num: true, padrao: 0, min: 0, max: 200000 },
      { id: "pav.tipo", txt: "Revestimento do pavimento", op: ["intertravado", "cbuq"], rotulos: { intertravado: "Bloco de concreto intertravado (8 cm)", cbuq: "Concreto betuminoso usinado a quente (CBUQ)" }, padrao: "intertravado" },
      { id: "pav.meiofio", txt: "Meio-fio e sarjeta (m) — 0 = a informar", num: true, padrao: 0, min: 0, max: 100000 }
    ],
    itens: [
      { chave: "regularizacaoSubleito", cod: "regSub", quando: "pav.area>0", qtd: "pav.area", formula: "área de pavimento", intencao: "regularização e compactação de subleito argiloso" },
      pend("pavInformar", "regSub", "informe a área do pavimento; sem ela não há quantidade", "regularização e compactação do subleito", "pav.area==0"),
      pend("cortesAterros", null, "volumes de corte e aterro da via (projeto geométrico/terraplenagem)", "corte e aterro da plataforma da via", "", { desc: "ESCAVAÇÃO E ATERRO COMPACTADO DA PLATAFORMA DA VIA", un: "m³" })
    ]
  });

  E.push({
    id: "pavdren", etapa: "DRENAGEM SUPERFICIAL", ordem: 34, novo: true,
    premissas: ["Bocas de lobo, tubulação e poços de visita seguem o projeto de drenagem: ficam pendentes."],
    perguntas: [],
    itens: [
      pend("bocasLoboVia", "bocaLobo", "nº de bocas de lobo (projeto de drenagem)", "caixa para boca de lobo com grelha", ""),
      pend("redeDrenagem", null, "comprimento e diâmetro da rede de tubos de concreto (projeto de drenagem)", "assentamento de tubo de concreto para drenagem", "", { desc: "TUBO DE CONCRETO PARA REDE DE DRENAGEM PLUVIAL, ASSENTAMENTO E REJUNTE (DIÂMETRO DO PROJETO)", un: "m" })
    ]
  });

  E.push({
    id: "pavimento", etapa: "PAVIMENTO (SUB-BASE, BASE E REVESTIMENTO)", ordem: 35, novo: true,
    premissas: ["Base de brita graduada simples de 15 cm (a espessura é SUGESTÃO — o dimensionamento do pavimento define). CBUQ: a quantidade em toneladas depende da espessura e da densidade do projeto: fica pendente."],
    perguntas: [],
    usa: ["pav.area", "pav.tipo"],
    itens: [
      { chave: "baseBGS", cod: "bgs15", quando: "pav.area>0", qtd: "pav.area*0.15", formula: "área × 0,15 m de espessura", intencao: "base e sub-base de brita graduada simples 15 cm", sugestao: true },
      { chave: "revIntertravado", cod: "interT8", quando: "pav.area>0 && pav.tipo=='intertravado'", qtd: "pav.area", formula: "área de pavimento", intencao: "pavimento de bloco intertravado 8 cm" },
      pend("revCbuq", "cbuq", "toneladas = área × espessura da camada × densidade (projeto do pavimento)", "concreto betuminoso usinado a quente cbuq", "pav.tipo=='cbuq'"),
      pend("imprimacao", "imprim", "litros de ligante = área × taxa de aplicação (projeto do pavimento)", "imprimação com ligante asfáltico", "pav.tipo=='cbuq'", { implicito: true, porque: "a base de brita é imprimada antes do CBUQ para o asfalto aderir" }),
      pend("pavimentoInformar", "bgs15", "informe a área do pavimento; sem ela não há quantidade", "base de brita graduada simples", "pav.area==0")
    ]
  });

  E.push({
    id: "meiofio", etapa: "MEIO-FIO E SARJETAS", ordem: 36, novo: true,
    premissas: ["Meio-fio pré-fabricado de 100×15×13×30 cm e sarjeta moldada in loco de 30×15 cm, em trecho reto."],
    perguntas: [],
    usa: ["pav.meiofio"],
    itens: [
      { chave: "guia", cod: "meioFio", quando: "pav.meiofio>0", qtd: "pav.meiofio", formula: "metros de meio-fio informados", intencao: "assentamento de guia meio-fio em trecho reto" },
      { chave: "sarjeta", cod: "sarjetaReta", quando: "pav.meiofio>0", qtd: "pav.meiofio", formula: "mesmo comprimento do meio-fio", intencao: "sarjeta de concreto moldada in loco em trecho reto", implicito: true,
        porque: "a sarjeta é a calha que leva a água do pavimento até a boca de lobo e acompanha o meio-fio" },
      pend("meiofioInformar", "meioFio", "informe os metros de meio-fio; sem eles não há quantidade", "assentamento de guia meio-fio", "pav.meiofio==0")
    ]
  });

  E.push({
    id: "sinalizacao", etapa: "SINALIZAÇÃO", ordem: 37, novo: true,
    premissas: ["Sinalização horizontal e vertical seguem o projeto de sinalização: ficam pendentes."],
    perguntas: [],
    itens: [
      pend("faixaPedestre", "faixaPed", "área das faixas de pedestre (projeto de sinalização)", "pintura de faixa de pedestre com tinta acrílica", ""),
      pend("placasTransito", null, "nº de placas e suportes (projeto de sinalização)", "placa de sinalização viária com suporte", "", { desc: "PLACA DE SINALIZAÇÃO VIÁRIA COM SUPORTE METÁLICO (FORNECIMENTO E INSTALAÇÃO)", un: "un" })
    ]
  });

  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

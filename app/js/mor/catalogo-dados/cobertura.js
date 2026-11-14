/* =====================================================================
 * mor/catalogo-dados/cobertura.js — COBERTURA COMPLETA (etapa de referência da F2)
 *
 * É o modelo de como cada etapa do catálogo se escreve: perguntas (com padrão),
 * grandezas derivadas (js/mor/geometria.js → `cobertura`) e itens com `quando` e `qtd`.
 * Com as respostas padrão ele reproduz, linha a linha, a cobertura do orçamento
 * paramétrico antigo (tools/test-orcparam.js). O que é novo (estrutura metálica,
 * rufo, cumeeira de fibrocimento e de telha metálica, inclinação e beiral
 * escolhidos) só aparece quando a pessoa responde diferente do padrão.
 *
 * ⚠ CÓDIGOS: todos conferidos em data/sinapi-MG-2026-06.json (tabela
 *   catalogo-dados/codigos.js). Sem código na base: tesoura de madeira (a SINAPI tem
 *   por vão fixo — o vão não é conhecido aqui), tesoura de aço (kg depende do projeto),
 *   cumeeira de telha metálica e condutor pluvial → só descrição, "pendente".
 * ⚠ Quantidades pendentes (`qtd: null`): a quantidade depende de projeto
 *   (peso da tesoura em aço). O item aparece na prévia como pendente, nunca com
 *   número chutado.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  var NAO_LAJE = "cob.tipo!='laje'";
  var MADEIRA = NAO_LAJE + " && cob.estrutura=='madeira'";
  var METALICA = NAO_LAJE + " && cob.estrutura=='metalica'";
  var CER_CONC = "(cob.tipo=='ceramica'||cob.tipo=='concreto')";
  var FIBRO_MET = "(cob.tipo=='fibrocimento'||cob.tipo=='metalica')";

  (D.etapas = D.etapas || []).push({
    id: "cobertura", etapa: "COBERTURA", ordem: 5,
    geometria: "cobertura",
    premissas: [
      "Telhado de 2 águas sobre planta retangular 1:1,5; área de telhado = Ap × fator de beiral × fator de inclinação.",
      "Inclinação padrão por tipo de telha: cerâmica 35 %, concreto 30 %, fibrocimento 15 %, metálica termoacústica 10 % (a inclinação mínima do fabricante vale mais que este padrão)."
    ],
    perguntas: [
      { id: "cob.tipo", txt: "Tipo de cobertura", op: ["ceramica", "concreto", "fibrocimento", "metalica", "laje"],
        rotulos: { ceramica: "Telha cerâmica", concreto: "Telha de concreto", fibrocimento: "Telha de fibrocimento", metalica: "Telha metálica termoacústica (sanduíche)", laje: "Laje impermeabilizada (sem telhado)" }, padrao: "ceramica" },
      { id: "cob.estrutura", txt: "Estrutura do telhado", op: ["madeira", "metalica"], rotulos: { madeira: "Madeira", metalica: "Aço (metálica)" }, quando: NAO_LAJE, padrao: "madeira" },
      { id: "cob.inclinacao", txt: "Inclinação (%)", num: true, quando: NAO_LAJE, padraoDe: "cob.tipo", mapa: { ceramica: 35, concreto: 30, fibrocimento: 15, metalica: 10, laje: 0 }, min: 0, max: 100 },
      { id: "cob.beiral", txt: "Beiral (m)", num: true, quando: NAO_LAJE, padrao: 0.5, min: 0, max: 2 },
      { id: "cob.cumeeira", txt: "Cumeeira", bool: true, quando: NAO_LAJE, padraoExpr: CER_CONC },
      { id: "cob.calha", txt: "Calha e condutores de água pluvial", bool: true, quando: NAO_LAJE, padraoExpr: "padrao!='popular'" },
      { id: "cob.rufo", txt: "Rufo nas empenas", bool: true, quando: NAO_LAJE, padrao: false }
    ],
    itens: [
      /* laje impermeabilizada — no lugar do telhado */
      { chave: "impLaje", cod: "impLaje", quando: "cob.tipo=='laje'", qtd: "Ap*1.10", formula: "Ap × 1,10 (rodapé de 30 cm na platibanda)", intencao: "impermeabilização de laje de cobertura" },

      /* estrutura de madeira */
      { chave: "tramaMadeira", cod: "trama2", quando: MADEIRA + " && " + CER_CONC, qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "trama de madeira ripas caibros terças telha cerâmica ou concreto" },
      { chave: "tramaMadeiraTerca", cod: "tramaTerca", quando: MADEIRA + " && " + FIBRO_MET, qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "trama de madeira terças telha ondulada fibrocimento metálica" },
      { chave: "tesouraMadeira", quando: MADEIRA, qtd: "max(2,ceil(Lmaior/3-1e-9)+1)", desc: "FABRICAÇÃO E INSTALAÇÃO DE TESOURA INTEIRA EM MADEIRA NÃO APARELHADA, VÃO ATÉ 8 M, PARA TELHADO", un: "un", formula: "lado maior ÷ 3,00 m + 1 (tesouras a cada 3 m)", intencao: "tesoura de madeira telhado" },

      /* estrutura de aço */
      { chave: "tramaAcoCer", cod: "trAcoCer", quando: METALICA + " && cob.tipo=='ceramica'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "trama de aço ripas caibros terças telha cerâmica" },
      { chave: "tramaAcoConc", cod: "trAcoConc", quando: METALICA + " && cob.tipo=='concreto'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "trama de aço ripas caibros terças telha de encaixe concreto" },
      { chave: "tramaAcoOnd", cod: "trAcoOnd", quando: METALICA + " && " + FIBRO_MET, qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "trama de aço terças telha ondulada fibrocimento metálica termoacústica" },
      { chave: "tesouraAco", quando: METALICA, qtd: null, desc: "FABRICAÇÃO E INSTALAÇÃO DE TESOURA (INTEIRA OU MEIA) EM AÇO, INCLUSO IÇAMENTO, EXCLUSIVE PINTURA", un: "kg", formula: "peso da estrutura depende do projeto estrutural (vão e carga) — informar a quantidade", intencao: "tesoura de aço telhado" },

      /* telhamento */
      { chave: "telhaCer", cod: "telhaCer", quando: "cob.tipo=='ceramica'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "telhamento telha cerâmica" },
      { chave: "telhaConc", cod: "telhaConc", quando: "cob.tipo=='concreto'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "telhamento telha de concreto" },
      { chave: "telhaFibro", cod: "telhaFibro", quando: "cob.tipo=='fibrocimento'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "telhamento telha ondulada fibrocimento" },
      { chave: "telhaMet", cod: "telhaMet", quando: "cob.tipo=='metalica'", qtd: "Acob", formula: "Acob = Ap × fator de beiral × fator de inclinação", intencao: "telhamento telha metálica termoacústica" },

      /* cumeeira */
      { chave: "cumeCer", cod: "cumeCer", quando: "cob.cumeeira && cob.tipo=='ceramica'", qtd: "Lcumeeira", formula: "lado maior da projeção = √(1,5 × Ap)", intencao: "cumeeira telha cerâmica" },
      { chave: "cumeConc", cod: "cumeConc", quando: "cob.cumeeira && cob.tipo=='concreto'", qtd: "Lcumeeira", formula: "lado maior da projeção = √(1,5 × Ap)", intencao: "cumeeira telha de concreto" },
      { chave: "cumeFibro", cod: "cumeFibro", quando: "cob.cumeeira && cob.tipo=='fibrocimento'", qtd: "Lcumeeira", formula: "lado maior da projeção = √(1,5 × Ap)", intencao: "cumeeira telha ondulada fibrocimento" },
      { chave: "cumeMet", quando: "cob.cumeeira && cob.tipo=='metalica'", qtd: "Lcumeeira", desc: "CUMEEIRA PARA TELHA METÁLICA TERMOACÚSTICA, INCLUSO ACESSÓRIOS DE FIXAÇÃO", un: "m", formula: "lado maior da projeção = √(1,5 × Ap)", intencao: "cumeeira telha metálica termoacústica" },

      /* águas pluviais do telhado */
      { chave: "calha", cod: "calha", quando: NAO_LAJE + " && cob.calha", qtd: "Lcalha", formula: "2 beirais × lado maior da projeção", intencao: "calha de aço galvanizado" },
      { chave: "condutor", quando: NAO_LAJE + " && cob.calha", qtd: "4*Hdesc", desc: "TUBO PVC SÉRIE R ÁGUA PLUVIAL DN 100 MM, CONDUTOR VERTICAL", un: "m", formula: "4 descidas × (pé-direito × pavimentos + 0,50 m)", intencao: "condutor vertical água pluvial pvc dn 100" },
      { chave: "rufo", cod: "rufo", quando: NAO_LAJE + " && cob.rufo", qtd: "2*Lmenor*fi", formula: "empenas: 2 empenas × 2 águas × (lado menor ÷ 2) × fator de inclinação = 2 × lado menor × fi", intencao: "rufo de aço galvanizado empena" }
    ]
  });
  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

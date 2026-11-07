/* eleaparelhosdados.js — GERADO por tools/gerar-eleaparelhos.js a partir de dados-fonte/eletrica/aparelhos.json. NÃO EDITAR À MÃO.
 * Tabela dos aparelhos que pedem o próprio ponto (potência, altura, posição, fonte e nível). */
(function (global) {
  "use strict";
  var D = {
   "_comentario": "Elétrica v2 L3 (06/11/2026). Aparelhos que PEDEM O PRÓPRIO PONTO ao serem colocados. Cada número leva a fonte e o nível (A = fonte primária lida: CEMIG ND-5.1 rev. MAR/2026 e SINAPI MG 06/2026; N = NBR 5410:2004 item lido; C = decisão/critério RA; X = sem fonte, conferir). Gerado em js/eleaparelhosdados.js por tools/gerar-eleaparelhos.js. L2b (07/11/2026): as linhas com \"v2\": true são as das famílias de js/elefamilias2.js (e duas do hidro) e alimentam TAMBÉM o js/eleregras.js (EleRegras.aparelhosDe lê esta tabela: uma fonte só). Casar SEMPRE por id de família, por mep.peca ou por nome exato (casar.nomes) — nunca por semelhança.",
   "grupoCemig": {
    "b1": "chuveiro, torneira e aquecedor de passagem (ND-5.1 item 8.2.3, Tabela 13; kVA = kW)",
    "b3": "fogão, forno e cooktop (Tabela 12)",
    "b4": "lavar e secar roupa, lava-louças (Tabela 13)",
    "b5": "demais aparelhos (Tabela 13)",
    "c": "ar-condicionado",
    "d": "motores",
    "nivel": "A para o grupo da ND-5.1 lido; o agrupamento de cada aparelho é decisão RA sobre a ND-5.1"
   },
   "niveis": {
    "A": "fonte primária lida",
    "N": "NBR 5410:2004, item lido",
    "C": "decisão/critério RA",
    "X": "sem fonte — conferir"
   },
   "fontes": {
    "CEMIG": "CEMIG ND-5.1 rev. MAR/2026, Tabelas 8A/8B/9",
    "SINAPI": "SINAPI MG 06/2026: TOMADA BAIXA 0,30 m (91998-92001), MÉDIA 1,30 m (91994-91997), ALTA 2,00 m (91990-91993)",
    "NBR": "ABNT NBR 5410:2004, item lido (cópia não licenciada: só o valor)"
   },
   "limites": {
    "correnteT10": {
     "valor": 10,
     "nivel": "X",
     "fonte": "decisão RA da pesquisa (NBR 14136 não lida): até 10 A, tomada 10 A"
    },
    "correnteT20": {
     "valor": 20,
     "nivel": "X",
     "fonte": "decisão RA da pesquisa (NBR 14136 não lida): até 20 A, tomada 20 A; acima, ligação direta"
    },
    "correnteExclusivo": {
     "valor": 10,
     "nivel": "N",
     "fonte": "NBR 5410 9.5.3.1: acima de 10 A, circuito independente"
    },
    "distMax": {
     "valor": 1.5,
     "nivel": "N",
     "fonte": "NBR 5410 4.2.1.2.3 d): TUE a no máximo 1,5 m do aparelho"
    }
   },
   "aparelhos": [
    {
     "id": "geladeira",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Geladeira",
     "casar": {
      "fam": [
       "ra-coz-geladeira"
      ]
     },
     "potW": 300,
     "potWFonte": "CEMIG Tabela 8A (geladeira duplex 300 W)",
     "potWNivel": "A",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.25,
      "nivel": "C",
      "fonte": "decisão RA: atrás do aparelho, deslocada para o lado (a tomada não fica espremida entre o fundo e a parede)"
     },
     "circuito": "TUE-GELADEIRA",
     "dr": false,
     "notaDr": "DR só se o circuito atender área molhada (NBR 5410 5.1.3.2.2 — não lida)"
    },
    {
     "id": "forno_embutir",
     "grupoCemig": "b3",
     "aquecimento": true,
     "rotulo": "Forno elétrico de embutir",
     "casar": {
      "fam": [
       "ra-coz-torre-quente"
      ]
     },
     "potW": 4500,
     "potWFonte": "CEMIG Tabela 8A",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": -0.15,
      "nivel": "C",
      "fonte": "decisão RA: atrás da torre, do lado do forno"
     },
     "circuito": "TUE-FORNO",
     "dr": false
    },
    {
     "id": "micro_ondas",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Micro-ondas",
     "casar": {
      "fam": [
       "ra-coz-torre-quente"
      ],
      "quando": [
       {
        "param": "Com_micro",
        "op": "!=",
        "valor": false
       }
      ]
     },
     "potW": 750,
     "potWFonte": "CEMIG Tabela 8A",
     "potWNivel": "A",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 2,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada alta 2,00 m (faixa usual 1,90-2,20 m no nicho da torre)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.15,
      "nivel": "C",
      "fonte": "decisão RA: atrás do nicho do micro-ondas"
     },
     "circuito": "TUE-MICROONDAS",
     "dr": false,
     "sufixo": "mo"
    },
    {
     "id": "cooktop",
     "grupoCemig": "b3",
     "aquecimento": true,
     "rotulo": "Cooktop elétrico (4 bocas)",
     "casar": {
      "fam": [
       "ra-coz-inferior"
      ],
      "quando": [
       {
        "param": "Com_cooktop",
        "op": "==",
        "valor": true
       },
       {
        "param": "Comprimento",
        "op": ">=",
        "valor": 1.8
       }
      ]
     },
     "potW": 6000,
     "potWFonte": "CEMIG Tabela 8A (1.500 W por queimador x 4)",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m (sob a bancada)",
     "posicao": {
      "ref": "sob_bancada",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: sob a bancada, junto do cooktop"
     },
     "circuito": "TUE-COOKTOP",
     "dr": false,
     "confirmar": "cooktop: confirme se é elétrico (indução) e a potência da placa — se for a gás, apague este ponto"
    },
    {
     "id": "cooktop_ilha",
     "grupoCemig": "b3",
     "aquecimento": true,
     "rotulo": "Cooktop elétrico da ilha",
     "casar": {
      "fam": [
       "ra-coz-ilha"
      ],
      "quando": [
       {
        "param": "Com_cooktop",
        "op": "==",
        "valor": true
       },
       {
        "param": "Comprimento",
        "op": ">=",
        "valor": 1.8
       }
      ]
     },
     "potW": 6000,
     "potWFonte": "CEMIG Tabela 8A (1.500 W por queimador x 4)",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "piso",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "a ilha está no meio do ambiente: o ponto vem pelo piso (lançar à mão)"
     },
     "circuito": "TUE-COOKTOP-ILHA",
     "dr": false,
     "semParede": true
    },
    {
     "id": "lava_roupas",
     "grupoCemig": "b4",
     "aquecimento": false,
     "rotulo": "Máquina de lavar roupas",
     "casar": {
      "fam": [
       "ra-coz-lavadora"
      ]
     },
     "potW": 1500,
     "potWFonte": "CEMIG Tabela 8B",
     "potWNivel": "A",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m (faixa usual 0,30-0,60 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.3,
      "nivel": "C",
      "fonte": "decisão RA: atrás, ao lado da mangueira de entrada"
     },
     "circuito": "TUE-LAVADORA",
     "dr": false
    },
    {
     "id": "chuveiro_eletrico",
     "grupoCemig": "b1",
     "aquecimento": true,
     "rotulo": "Chuveiro elétrico",
     "casar": {
      "fam": [
       "hid-chuveiro"
      ],
      "quando": [
       {
        "param": "Eletrico",
        "op": "==",
        "valor": true
       }
      ]
     },
     "potW": 6000,
     "potWFonte": "CEMIG Tabela 8A",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "LD",
     "forcaDireta": true,
     "altura_m": 2.2,
     "alturaNivel": "C",
     "alturaFonte": "decisão RA: logo acima do ponto d'água (faixa 2,00-2,25 m); ligação direta, sem tomada (NBR 5410 9.5.2.3)",
     "posicao": {
      "ref": "fora_box",
      "lateral_m": 0,
      "nivel": "N",
      "fonte": "NBR 5410 9.1.4.2.4: no volume só a caixa do próprio aparelho; as demais a 0,60 m do box"
     },
     "circuito": "TUE-CHUVEIRO",
     "dr": true,
     "drFonte": "NBR 5410 9.1.4.3.2 c): DR <= 30 mA no banheiro",
     "drNivel": "N",
     "noVolume": true
    },
    {
     "id": "ar_evaporadora",
     "grupoCemig": "c",
     "aquecimento": false,
     "rotulo": "Ar-condicionado (evaporadora)",
     "casar": {
      "fam": [
       "ra-clim-evap-hiwall",
       "ra-clim-evap-pisoteto",
       "ra-clim-evap-cassete",
       "ra-clim-evap-duto",
       "ra-clim-janela"
      ]
     },
     "potW": "btu",
     "potWFonte": "CEMIG Tabela 9 (pela capacidade em BTU/h; sem capacidade, a placa)",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 2,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada alta 2,00 m (faixa usual do split 2,00-2,20 m)",
     "posicao": {
      "ref": "lateral",
      "lateral_m": 0.6,
      "nivel": "C",
      "fonte": "decisão RA: alto, ao lado da evaporadora"
     },
     "circuito": "TUE-AC",
     "dr": false
    },
    {
     "id": "ar_condensadora",
     "grupoCemig": "c",
     "aquecimento": false,
     "rotulo": "Ar-condicionado (condensadora)",
     "casar": {
      "fam": [
       "ra-clim-condensadora",
       "ra-clim-condensadora-multi"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do fabricante; a condensadora é alimentada conforme o esquema do modelo (própria ou pela evaporadora) e NÃO soma à potência da evaporadora",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "LD",
     "forcaDireta": true,
     "altura_m": 1.3,
     "alturaNivel": "C",
     "alturaFonte": "decisão RA: ponto de seccionamento/manutenção a 1,30 m (média), ligação direta",
     "posicao": {
      "ref": "lateral",
      "lateral_m": 0.6,
      "nivel": "C",
      "fonte": "decisão RA: ao lado da condensadora"
     },
     "circuito": "TUE-AC-COND",
     "dr": false,
     "confirmar": "condensadora: confirme no manual do modelo se a alimentação vem da condensadora ou da evaporadora"
    },
    {
     "id": "ventilador_teto",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Ventilador de teto",
     "casar": {
      "fam": [
       "ra-ilum-ventilador"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do aparelho",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TETO",
     "forcaDireta": true,
     "altura_m": null,
     "alturaNivel": "C",
     "alturaFonte": "ponto no teto (caixa octogonal) com interruptor/controle: lançado pela Ligação da iluminação (js/eletilum.js)",
     "posicao": {
      "ref": "teto",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "o ventilador é peça de luminária: ponto de luz + interruptor pelo motor da iluminação"
     },
     "circuito": "ILUM",
     "dr": false,
     "delegado": "eletilum"
    },
    {
     "id": "hidromassagem",
     "grupoCemig": "d",
     "aquecimento": false,
     "rotulo": "Banheira de hidromassagem (motor)",
     "casar": {
      "fam": [
       "ra-banho-hidromassagem"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do aparelho",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "LD",
     "forcaDireta": true,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA"
     },
     "circuito": "TUE-HIDRO",
     "dr": true,
     "drFonte": "NBR 5410 9.1.4.3.2 c)",
     "drNivel": "N",
     "noVolume": true
    },
    {
     "id": "bomba_dagua",
     "grupoCemig": "d",
     "aquecimento": false,
     "rotulo": "Bomba d'água",
     "casar": {
      "fam": [
       "hid-bomba"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do aparelho",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "LD",
     "forcaDireta": true,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA"
     },
     "circuito": "TUE-BOMBA",
     "dr": false
    },
    {
     "id": "micro_ondas_bancada_20",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Micro-ondas de bancada 20 L",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-microondas"
      ],
      "quando": [
       {
        "param": "Capacidade_L",
        "op": "==",
        "valor": 20
       }
      ]
     },
     "potW": 1200,
     "potWFonte": "catálogo L1 eq_microondas_20l: valor usual (a ND-5.1 Tabela 8A dá 750 W médio, defasado)",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 1.1,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 1,10 m (usual, na altura da bancada; a SINAPI só tem 0,30 / 1,30 / 2,00 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.16,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-MICROONDAS",
     "dr": false
    },
    {
     "id": "micro_ondas_bancada_30",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Micro-ondas de bancada 30 L",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-microondas"
      ],
      "quando": [
       {
        "param": "Capacidade_L",
        "op": "==",
        "valor": 30
       }
      ]
     },
     "potW": 1500,
     "potWFonte": "catálogo L1 eq_microondas_30l: valor usual",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 1.1,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 1,10 m (usual, na altura da bancada; a SINAPI só tem 0,30 / 1,30 / 2,00 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.2,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-MICROONDAS",
     "dr": false
    },
    {
     "id": "forno_embutir_50",
     "grupoCemig": "b3",
     "aquecimento": true,
     "rotulo": "Forno elétrico de embutir 50 L",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-forno-embutir"
      ]
     },
     "potW": 4500,
     "potWFonte": "CEMIG ND-5.1 Tabela 8A (forno elétrico 4.500 W) = catálogo L1 eq_forno_embutir_50l",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.6,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 0,60 m (usual no nicho do forno; a SINAPI tem 0,30 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.2,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-FORNO",
     "dr": false
    },
    {
     "id": "cooktop_inducao",
     "grupoCemig": "b3",
     "aquecimento": true,
     "rotulo": "Cooktop de indução 4 bocas (de embutir)",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-cooktop-inducao"
      ]
     },
     "potW": 7000,
     "potWFonte": "catálogo L1 eq_cooktop_inducao_4b: valor usual de indução (a ND-5.1 dá 1.500 W por boca de fogão elétrico comum)",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.6,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 0,60 m sob o tampo",
     "posicao": {
      "ref": "sob_bancada",
      "lateral_m": 0.2,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-COOKTOP-INDUCAO",
     "dr": false,
     "confirmar": "cooktop de indução: confirme a potência da placa (7.000 W é o usual do catálogo L1); um circuito exclusivo 220 V"
    },
    {
     "id": "coifa_60",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Coifa / depurador 60 cm",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-coifa"
      ],
      "quando": [
       {
        "param": "Largura_cm",
        "op": "==",
        "valor": 60
       }
      ]
     },
     "potW": 200,
     "potWFonte": "catálogo L1 eq_coifa_60: valor usual",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 2,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada alta 2,00 m (= catálogo L1)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-COIFA",
     "dr": false
    },
    {
     "id": "coifa_90",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Coifa / depurador 90 cm",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-coifa"
      ],
      "quando": [
       {
        "param": "Largura_cm",
        "op": "==",
        "valor": 90
       }
      ]
     },
     "potW": 250,
     "potWFonte": "catálogo L1 eq_coifa_90: valor usual",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 2,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada alta 2,00 m (= catálogo L1)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-COIFA",
     "dr": false
    },
    {
     "id": "lava_loucas",
     "grupoCemig": "b4",
     "aquecimento": false,
     "rotulo": "Lava-louças (8 e 14 serviços)",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-lava-loucas"
      ]
     },
     "potW": 1500,
     "potWFonte": "CEMIG ND-5.1 Tabelas 8A/8B (1.500 W) = catálogo L1 eq_lava_loucas_8/14",
     "potWNivel": "A",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.6,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 0,60 m (faixa usual 0,30-0,60 m; a SINAPI tem 0,30 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.22,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-LAVALOUCAS",
     "dr": false
    },
    {
     "id": "secadora",
     "grupoCemig": "b4",
     "aquecimento": false,
     "rotulo": "Secadora de roupas",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-secadora"
      ]
     },
     "potW": 3500,
     "potWFonte": "CEMIG ND-5.1 Tabela 8B (secadora 3.500 W) = catálogo L1 eq_secadora",
     "potWNivel": "A",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.2,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-SECADORA",
     "dr": false
    },
    {
     "id": "lava_seca",
     "grupoCemig": "b4",
     "aquecimento": false,
     "rotulo": "Lava e seca",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-lava-seca"
      ]
     },
     "potW": 2500,
     "potWFonte": "catálogo L1 eq_lava_e_seca: valor usual",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.2,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-LAVASECA",
     "dr": false
    },
    {
     "id": "freezer",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "Freezer (horizontal e vertical)",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-freezer"
      ]
     },
     "potW": 400,
     "potWFonte": "CEMIG ND-5.1 Tabela 8A (freezer 400 W) = catálogo L1 eq_freezer_horizontal (o vertical reaproveita)",
     "potWNivel": "A",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.3,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-FREEZER",
     "dr": false
    },
    {
     "id": "torneira_eletrica",
     "grupoCemig": "b1",
     "aquecimento": true,
     "rotulo": "Torneira elétrica",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-torneira-eletrica"
      ]
     },
     "potW": 5500,
     "potWFonte": "catálogo L1 eq_torneira_eletrica: o insumo SINAPI cita 5.500 W (conferir); a ND-5.1 Tabela 8B dá 2.000 W em 127 V",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 1.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada média 1,30 m (= catálogo L1)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-TORNEIRA",
     "dr": false,
     "confirmar": "torneira elétrica: confira a potência e a tensão da placa (5.500 W / 220 V é o do insumo SINAPI; a ND-5.1 dá 2.000 W em 127 V)"
    },
    {
     "id": "tv_parede",
     "grupoCemig": "b5",
     "aquecimento": false,
     "rotulo": "TV de parede 50\"",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-tv"
      ]
     },
     "potW": 150,
     "potWFonte": "catálogo L1 eq_tv_50: valor usual",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 1.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada média 1,30 m (= catálogo L1); o ponto de rede/antena é do projeto de dados",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.44,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-TV",
     "dr": false
    },
    {
     "id": "motor_portao",
     "grupoCemig": "d",
     "aquecimento": false,
     "rotulo": "Motor de portão deslizante",
     "v2": true,
     "casar": {
      "fam": [
       "ele-eq-motor-portao"
      ]
     },
     "potW": 370,
     "potWFonte": "catálogo L1 eq_motor_portao: valor usual (1/2 CV)",
     "potWNivel": "X",
     "tensaoV": 127,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": false,
     "altura_m": 1,
     "alturaNivel": "X",
     "alturaFonte": "catálogo L1: ponto a 1,00 m (usual; a SINAPI tem 0,30 / 1,30 m)",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0.05,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-PORTAO",
     "dr": false,
     "confirmar": "motor de portão: confirme a potência e a tensão da placa (370 W / 127 V é o usual do catálogo L1) e o grau de proteção do ponto (área externa)"
    },
    {
     "id": "aquecedor_eletrico_passagem",
     "grupoCemig": "b1",
     "aquecimento": true,
     "rotulo": "Aquecedor elétrico de passagem",
     "v2": true,
     "casar": {
      "fam": [
       "hid-aquecedor-eletrico-passagem"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do aparelho (a ficha do hidro traz Potencia_W por tipo; a tabela não duplica)",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": true,
     "altura_m": 1.3,
     "alturaNivel": "C",
     "alturaFonte": "decisão RA: ponto de força a 1,30 m (média), ligação direta, como a condensadora",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-AQUECEDOR",
     "dr": false,
     "confirmar": "aquecedor elétrico de passagem: informe a potência e a tensão da placa (circuito exclusivo; ligação direta)"
    },
    {
     "id": "bomba_piscina",
     "grupoCemig": "d",
     "aquecimento": false,
     "rotulo": "Motobomba da piscina",
     "v2": true,
     "casar": {
      "fam": [
       "hid-pisc-bomba"
      ]
     },
     "potW": null,
     "potWFonte": "a placa do aparelho",
     "potWNivel": "X",
     "tensaoV": 220,
     "fp": null,
     "tipoPonto": "TUE",
     "forcaDireta": true,
     "altura_m": 0.3,
     "alturaNivel": "A",
     "alturaFonte": "SINAPI tomada baixa 0,30 m",
     "posicao": {
      "ref": "atras",
      "lateral_m": 0,
      "nivel": "C",
      "fonte": "decisão RA: onde o cabo do aparelho sai (conector el da família), deslocado do centro"
     },
     "circuito": "TUE-BOMBA-PISCINA",
     "dr": false,
     "confirmar": "bomba da piscina: informe a potência e a tensão da placa e confira o DR e o afastamento da borda na NBR 5410 (seção de piscinas — não lida)"
    }
   ],
   "pendentes": []
  };
  global.EleAparelhosDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

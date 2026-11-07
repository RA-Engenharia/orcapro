/* elepadraodados.js — GERADO por tools/gerar-eleaparelhos.js a partir de dados-fonte/eletrica/padrao-ambientes.json. NÃO EDITAR À MÃO.
 * Padrão RA por ambiente e regras de lançamento pelo mobiliário. */
(function (global) {
  "use strict";
  var D = {
   "_comentario": "Elétrica v2 L3 (06/11/2026). PADRÃO RA POR AMBIENTE: o que cada móvel pede e o que cada ambiente leva. As regras com motor 'mobiliario' são executadas por js/elemobiliario.js (lidas de js/elepadraodados.js, gerado por tools/gerar-eleaparelhos.js); as demais já são executadas por js/eleauto.js/eleregras.js (perímetro, bancada, banheiro, interruptor) ou por js/eleaparelhos.js (aparelhos) — estão aqui para o documento docs/eletrica/PADRAO-PROJETO-ELETRICO-RA.md e para a tela. Nível: A = fonte primária lida; N = NBR 5410:2004 item lido; C = decisão/critério RA; X = sem fonte, conferir.",
   "mobiliario": {
    "cama": {
     "quando": {
      "fam": [
       "ra-mob-cama"
      ]
     },
     "ambientes": [
      "dormitorio",
      "suite",
      "generico"
     ],
     "casalMinimo_m": {
      "valor": 1.2,
      "nivel": "C",
      "fonte": "decisão RA: colchão de 1,20 m ou mais (casal 1,38; solteiro 0,88) leva uma tomada de cada lado"
     },
     "recuoLateral_m": {
      "valor": 0.25,
      "nivel": "C",
      "fonte": "decisão RA: centro do criado-mudo, 0,25 m além da lateral da cama (criado-mudo de 0,50 m)"
     },
     "altura_m": {
      "valor": 0.65,
      "nivel": "C",
      "fonte": "decisão RA da pesquisa: 0,60-0,75 m do piso, acima do criado-mudo (que tem 0,45-0,50 m)"
     },
     "alcance_m": {
      "valor": 0.8,
      "nivel": "C",
      "fonte": "decisão RA: parede da cabeceira a até 0,80 m do ponto desejado"
     },
     "origem": "cabeceira da cama"
    },
    "rack": {
     "quando": {
      "fam": [
       "ra-mob-rack-tv"
      ]
     },
     "ambientes": [
      "sala_estar",
      "sala_jantar",
      "dormitorio",
      "suite",
      "escritorio",
      "generico"
     ],
     "pontos": [
      {
       "lateral_m": -0.3,
       "altura_m": 1.1,
       "origem": "rack TV (TV)"
      },
      {
       "lateral_m": 0.3,
       "altura_m": 0.3,
       "origem": "rack TV (equipamentos)"
      }
     ],
     "nivel": "C",
     "fonte": "decisão RA da pesquisa: TV + 2 TUG atrás do painel, 0,30 m ou 1,10 m; o ponto de TV/dados fica pendente (não há família de ponto de dados)",
     "alcance_m": {
      "valor": 0.8,
      "nivel": "C",
      "fonte": "decisão RA"
     }
    },
    "sofa": {
     "quando": {
      "fam": [
       "ra-mob-sofa-reto",
       "ra-mob-sofa-l"
      ]
     },
     "ambientes": [
      "sala_estar",
      "generico"
     ],
     "recuoLateral_m": {
      "valor": 0.3,
      "nivel": "C",
      "fonte": "decisão RA: 0,30 m além da lateral do sofá, na parede de encosto"
     },
     "altura_m": {
      "valor": 0.3,
      "nivel": "A",
      "fonte": "SINAPI tomada baixa 0,30 m"
     },
     "alcance_m": {
      "valor": 0.6,
      "nivel": "C",
      "fonte": "decisão RA: só se o sofá encosta na parede (a até 0,60 m)"
     },
     "origem": "ao lado do sofá"
    },
    "escrivaninha": {
     "quando": {
      "fam": [
       "ra-mob-escrivaninha"
      ]
     },
     "ambientes": [
      "dormitorio",
      "suite",
      "escritorio",
      "sala_estar",
      "generico"
     ],
     "altura_m": {
      "valor": 1.1,
      "nivel": "C",
      "fonte": "decisão RA: acima do tampo (0,75 m), alcançável sentado"
     },
     "alcance_m": {
      "valor": 0.8,
      "nivel": "C",
      "fonte": "decisão RA"
     },
     "origem": "escrivaninha"
    }
   },
   "ambientes": [
    {
     "id": "dormitorio",
     "rotulo": "Dormitório / suíte",
     "motor": "mobiliario+perimetro",
     "pontos": [
      {
       "o": "TUG na cabeceira (1 de cada lado se casal; 1 do lado livre se solteiro)",
       "altura": "0,65 m",
       "regra": "cama no modelo",
       "fonte": "decisão RA (0,60-0,75 m)",
       "nivel": "C"
      },
      {
       "o": "Interruptor paralelo na cabeceira",
       "altura": "1,00 m",
       "regra": "Ligação da iluminação (js/eletilum.js) — não duplicar",
       "fonte": "NBR 9050:2020 4.6.9",
       "nivel": "A"
      },
      {
       "o": "Split: TUE alta ao lado da evaporadora",
       "altura": "2,00 m",
       "regra": "aparelho pede o ponto (js/eleaparelhos.js)",
       "fonte": "CEMIG ND-5.1 T9 + SINAPI alta",
       "nivel": "A"
      },
      {
       "o": "TUG da TV atrás do painel/rack",
       "altura": "1,10 m e 0,30 m",
       "regra": "rack no modelo",
       "fonte": "decisão RA",
       "nivel": "C"
      },
      {
       "o": "TUG da escrivaninha",
       "altura": "1,10 m",
       "regra": "escrivaninha no modelo",
       "fonte": "decisão RA",
       "nivel": "C"
      },
      {
       "o": "TUG pelo perímetro: 1 a cada 5 m (fração conta)",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 d)",
       "fonte": "NBR 5410",
       "nivel": "N"
      }
     ]
    },
    {
     "id": "sala",
     "rotulo": "Sala",
     "motor": "mobiliario+perimetro",
     "pontos": [
      {
       "o": "Rack: 2 TUG atrás do painel (TV e equipamentos); ponto de TV/dados pendente",
       "altura": "1,10 m e 0,30 m",
       "regra": "rack no modelo",
       "fonte": "decisão RA",
       "nivel": "C"
      },
      {
       "o": "TUG ao lado do sofá (parede de encosto)",
       "altura": "0,30 m",
       "regra": "sofá encostado na parede",
       "fonte": "decisão RA",
       "nivel": "C"
      },
      {
       "o": "TUG pelo perímetro: 1 a cada 5 m",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 d)",
       "fonte": "NBR 5410",
       "nivel": "N"
      }
     ]
    },
    {
     "id": "cozinha",
     "rotulo": "Cozinha / copa",
     "motor": "perimetro+bancada+aparelho",
     "pontos": [
      {
       "o": "TUG: 1 a cada 3,5 m de perímetro",
       "altura": "0,30 m (sobre bancada: ~1,10-1,30 m)",
       "regra": "NBR 5410 9.5.2.2.1 b)",
       "fonte": "NBR 5410",
       "nivel": "N"
      },
      {
       "o": "Pelo menos 2 TUG acima da bancada da pia, a >= 0,60 m do ponto de água",
       "altura": "tampo + 0,20 m (1,10-1,30 m)",
       "regra": "NBR 5410 9.5.2.2.1 b) + decisão RA (0,60 m)",
       "fonte": "NBR 5410 / decisão RA",
       "nivel": "N"
      },
      {
       "o": "Geladeira: TUE 10 A atrás/lado",
       "altura": "0,30 m",
       "regra": "aparelho pede o ponto",
       "fonte": "CEMIG T8A + SINAPI baixa",
       "nivel": "A"
      },
      {
       "o": "Micro-ondas (torre): TUE 10 A",
       "altura": "2,00 m",
       "regra": "aparelho pede o ponto",
       "fonte": "CEMIG T8A + SINAPI alta",
       "nivel": "A"
      },
      {
       "o": "Forno e cooktop elétricos: ligação direta sob a bancada",
       "altura": "0,30 m",
       "regra": "I > 20 A: sem tomada (decisão RA)",
       "fonte": "CEMIG T8A",
       "nivel": "A"
      },
      {
       "o": "Coifa: TUE 10 A (sem família no modelo: pendente)",
       "altura": "~2,10 m",
       "regra": "pendente",
       "fonte": "decisão RA",
       "nivel": "C"
      }
     ]
    },
    {
     "id": "banheiro",
     "rotulo": "Banheiro / lavabo",
     "motor": "perimetro+aparelho",
     "pontos": [
      {
       "o": "1 TUG junto ao lavatório, fora do volume do box (0,60 m além do volume 1), DR <= 30 mA",
       "altura": "1,10 m",
       "regra": "NBR 5410 9.5.2.2.1 a) + 9.1.4.3",
       "fonte": "NBR 5410",
       "nivel": "N"
      },
      {
       "o": "Chuveiro elétrico: ligação direta (caixa 4x2), circuito exclusivo, DR",
       "altura": "2,20 m",
       "regra": "NBR 5410 9.5.2.3; 9.5.3.1",
       "fonte": "NBR 5410 / decisão RA",
       "nivel": "N"
      }
     ]
    },
    {
     "id": "servico",
     "rotulo": "Área de serviço",
     "motor": "perimetro+aparelho",
     "pontos": [
      {
       "o": "TUG: 1 a cada 3,5 m de perímetro",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 b)",
       "fonte": "NBR 5410",
       "nivel": "N"
      },
      {
       "o": "Lavadora: TUE 20 A atrás/lado (11,8 A)",
       "altura": "0,30 m",
       "regra": "aparelho pede o ponto",
       "fonte": "CEMIG T8B + SINAPI baixa",
       "nivel": "A"
      },
      {
       "o": "Secadora e tanque: sem família no modelo (pendente)",
       "altura": "0,30 m",
       "regra": "pendente",
       "fonte": "decisão RA",
       "nivel": "C"
      }
     ]
    },
    {
     "id": "varanda",
     "rotulo": "Varanda / área externa",
     "motor": "perimetro",
     "pontos": [
      {
       "o": "1 TUG (mínimo) com DR",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 c); DR em área externa/molhada",
       "fonte": "NBR 5410",
       "nivel": "N"
      }
     ]
    },
    {
     "id": "garagem",
     "rotulo": "Garagem",
     "motor": "perimetro",
     "pontos": [
      {
       "o": "1 TUG (demais cômodos); ponto do portão (sem família: pendente)",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 e)",
       "fonte": "NBR 5410",
       "nivel": "N"
      }
     ]
    },
    {
     "id": "corredor",
     "rotulo": "Corredor / hall",
     "motor": "perimetro+interruptor",
     "pontos": [
      {
       "o": "1 TUG",
       "altura": "0,30 m",
       "regra": "NBR 5410 9.5.2.2.1 e)",
       "fonte": "NBR 5410",
       "nivel": "N"
      },
      {
       "o": "Interruptor paralelo (three-way) nas pontas",
       "altura": "1,00 m",
       "regra": "2 acessos",
       "fonte": "NBR 9050:2020 4.6.9",
       "nivel": "A"
      }
     ]
    }
   ],
   "posicionamento": [
    {
     "regra": "Interruptor: junto à porta, lado da maçaneta, a 0,10 m do batente (vão), 1,00 m do piso; paralelo se o ambiente tem 2 acessos",
     "fonte": "NBR 9050:2020 4.6.9 (altura); distância do batente: eng360 (X)",
     "nivel": "X"
    },
    {
     "regra": "Tomada nunca atrás da folha aberta da porta, nunca no vão de porta/janela, nunca atrás de móvel alto (guarda-roupa, geladeira — exceto a do próprio aparelho)",
     "fonte": "decisão RA da pesquisa",
     "nivel": "C"
    },
    {
     "regra": "Tomada e interruptor a >= 0,60 m do box (volume 2)",
     "fonte": "NBR 5410 9.1.4.3.1 + 9.1.2.1",
     "nivel": "N"
    },
    {
     "regra": "TUE a no máximo 1,50 m do aparelho",
     "fonte": "NBR 5410 4.2.1.2.3 d)",
     "nivel": "N"
    },
    {
     "regra": "Aparelho com corrente nominal > 10 A: circuito independente",
     "fonte": "NBR 5410 9.5.3.1",
     "nivel": "N"
    },
    {
     "regra": "Tomada de 10 A até 10 A; 20 A até 20 A; acima, ligação direta (sem tomada)",
     "fonte": "decisão RA (NBR 14136 não lida)",
     "nivel": "X"
    }
   ]
  };
  global.ElePadraoDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * mor/catalogo-dados/residencial.js — as demais etapas do orçamento paramétrico
 * antigo (js/orcparam.js), migradas para DADO. Preliminares e cobertura têm
 * arquivo próprio. Nada aqui muda número: a paridade (códigos, unidades, etapas
 * e quantidades, tolerância 1e-9) é cobrada por tools/test-orcparam.js.
 *
 * ⚠ ORDEM DAS CONTAS: as expressões repetem a ordem das operações do código
 *   antigo de propósito — a quantidade final é arredondada a 2 casas e uma conta
 *   em ordem diferente pode cair do outro lado de um .005. Não "simplifique".
 * ⚠ `vars` de uma etapa são autossuficientes: a etapa de pintura repete as
 *   variáveis do revestimento (Sint, Acer, Aext) em vez de depender de a outra
 *   ter rodado — no Manual acelerado cada etapa abre sozinha.
 * Coeficientes são premissas de estimativa, não projeto (ver geometria.js).
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  var E = (D.etapas = D.etapas || []);
  var SINT = ["Sint", "(P+2*Li)*h*pav-(Aj+2*Npi*1.47+Npe*1.89)"];
  var ACER = ["Acer", "banheiros*7.5*h+se(tipo=='comercial',0,10*1.5)"];
  var AEXT = ["Aext", "P*(h*pav+0.50)-(Aj+Npe*1.89)"];

  E.push({
    id: "infra", etapa: "INFRAESTRUTURA (FUNDAÇÕES)", ordem: 2,
    premissas: ["Fundação rasa: sapatas e vigas baldrame; confirmar com sondagem e projeto estrutural."],
    perguntas: [],
    vars: [["nS", "Npil"], ["escB", "Lb*0.40*0.50"], ["escS", "nS*(sap+0.2)*(sap+0.2)*1.0"], ["vB", "Lb*0.15*0.30"], ["vS", "nS*sap*sap*0.30"]],
    itens: [
      { chave: "escBald", cod: "escBald", qtd: "escB", formula: "Lb × 0,40 × 0,50 (vala); Lb = P + Li" },
      { chave: "escSap", cod: "escSap", qtd: "escS", formula: "sapatas × (lado + 0,20)² × 1,00" },
      { chave: "lastroSap", cod: "lastroSap", qtd: "nS*sap*sap", formula: "sapatas × lado²" },
      { chave: "arm10f", cod: "arm10f", qtd: "vS*50+Lb*4*0.617*1.10", formula: "sapatas 50 kg/m³ × volume + baldrame 4Ø10 (0,617 kg/m, +10 % traspasse) × Lb" },
      { chave: "arm5f", cod: "arm5f", qtd: "Lb*0.82", formula: "estribos Ø5 c/15 (0,80 m × 0,154 kg/m ÷ 0,15) = 0,82 kg/m × Lb" },
      { chave: "formaBald", cod: "formaBald", qtd: "Lb*2*0.30", formula: "2 faces × 0,30 m × Lb" },
      { chave: "concSap", cod: "concSap", qtd: "vS", formula: "sapatas × lado² × 0,30" },
      { chave: "concBald", cod: "concBald", qtd: "vB", formula: "0,15 × 0,30 × Lb" },
      { chave: "impBald", cod: "impBald", qtd: "Lb*0.75", formula: "(topo 0,15 + 2 faces × 0,30) × Lb" },
      { chave: "reaterro", cod: "reaterro", qtd: "(escB+escS)-(vB+vS)", formula: "escavação − concreto enterrado" }
    ]
  });

  E.push({
    id: "super", etapa: "SUPERESTRUTURA", ordem: 3, usa: ["forro.tipo"],
    premissas: ["Pilares 14×30 cm e vigas 14×30 cm sobre todas as paredes; laje pré-moldada nos pavimentos superiores."],
    perguntas: [],
    vars: [["hp", "h+0.30"], ["nP", "Npil*pav"], ["Lv", "(P+Li)*pav"]],
    itens: [
      { chave: "formaPil", cod: "formaPil", qtd: "nP*2*(0.14+0.30)*hp", formula: "pilares × perímetro 0,88 m × (h + 0,30)" },
      { chave: "formaViga", cod: "formaViga", qtd: "Lv*0.60", formula: "2 faces × 0,30 × comprimento de viga (fundo = alvenaria)" },
      { chave: "arm10e", cod: "arm10e", qtd: "(nP*hp+Lv)*4*0.617*1.15", formula: "4Ø10 (0,617 kg/m, +15 % traspasse) × (pilares × altura + vigas)" },
      { chave: "arm5e", cod: "arm5e", qtd: "(nP*hp+Lv)*0.82", formula: "estribos Ø5 c/15 = 0,82 kg/m × (pilares × altura + vigas)" },
      { chave: "concPil", cod: "concPil", qtd: "nP*0.14*0.30*hp", formula: "pilares × 0,14 × 0,30 × (h + 0,30)" },
      { chave: "concViga", qtd: "Lv*0.14*0.30", desc: "CONCRETAGEM DE VIGAS, FCK 25 MPA, LANÇAMENTO COM BALDES, ADENSAMENTO E ACABAMENTO", un: "m³", formula: "0,14 × 0,30 × comprimento de viga", intencao: "concretagem de vigas fck 25" },
      { chave: "lajePiso", cod: "lajePiso", quando: "pav>1", qtd: "Ap*(pav-1)", formula: "(pavimentos − 1) lajes de piso × Ap" },
      { chave: "lajeForro", cod: "lajeForro", quando: "forro.tipo=='laje'", qtd: "Ap", formula: "laje de cobertura/forro = Ap" }
    ]
  });

  E.push({
    id: "alvenaria", etapa: "ALVENARIA E VEDAÇÃO", ordem: 4,
    premissas: ["Alvenaria de bloco cerâmico 9×19×19 cm em todas as paredes; vergas e contravergas 0,30 m além do vão."],
    perguntas: [],
    vars: [["Aalv", "(P+Li)*(h-0.30)*pav-Avaos"]],
    itens: [
      { chave: "alvenaria", cod: "alvenaria", qtd: "Aalv", formula: "(P + Li) × (h − 0,30) × pav − vãos" },
      { chave: "verga", cod: "verga", qtd: "Nj*(1.20+0.60)+(Npi+Npe)*(0.80+0.60)", formula: "vão + 0,30 de cada lado: janelas × 1,80 + portas × 1,40" },
      { chave: "contraverga", cod: "contraverga", qtd: "Nj*(1.20+0.60)", formula: "janelas × 1,80" },
      { chave: "encunhamento", cod: "encunhamento", qtd: "(P+Li)*pav", formula: "topo de todas as paredes = (P + Li) × pav" }
    ]
  });

  E.push({
    id: "revestimento", etapa: "REVESTIMENTOS DE PAREDE", ordem: 6,
    premissas: ["Cerâmica de parede em banheiros (7,5 m de parede por banheiro, altura inteira) e, em residência, cozinha/serviço (10 m × 1,50 m)."],
    perguntas: [],
    vars: [SINT, ACER, AEXT],
    itens: [
      { chave: "chapInt", cod: "chapInt", qtd: "Sint", formula: "faces internas (P + 2 Li) × h × pav − vãos" },
      { chave: "massaInt", cod: "massaInt", qtd: "Sint-Acer", formula: "faces internas − áreas com cerâmica" },
      { chave: "emboco", cod: "emboco", qtd: "Acer", formula: "banheiros × 7,5 m × h (+ cozinha/serviço 10 m × 1,50 em residência)" },
      { chave: "cerParede", cod: "cerParede", qtd: "Acer", formula: "a mesma área do emboço" },
      { chave: "chapExt", cod: "chapExt", qtd: "Aext", formula: "P × (h × pav + 0,50 platibanda/oitão) − vãos externos" },
      { chave: "massaExt", cod: "massaExt", qtd: "Aext", formula: "a mesma área do chapisco externo" }
    ]
  });

  E.push({
    id: "pisos", etapa: "PISOS", ordem: 7,
    premissas: ["Piso em toda a área útil; calçada perimetral de 0,60 m fora do padrão popular."],
    perguntas: [
      { id: "piso.tipo", txt: "Piso", op: ["ceramica", "porcelanato"], rotulos: { ceramica: "Cerâmica", porcelanato: "Porcelanato" }, padraoExpr: "se(padrao=='alto','porcelanato','ceramica')" }
    ],
    vars: [["AutilT", "round(Autil/pav*100)/100"]],
    itens: [
      { chave: "compactacao", qtd: "Ap", desc: "COMPACTAÇÃO MECÂNICA DE SOLO PARA EXECUÇÃO DE PISO SOBRE SOLO, COM PLACA VIBRATÓRIA", un: "m²", formula: "projeção do térreo = Ap", intencao: "compactação mecânica de solo piso" },
      { chave: "lastroPiso", cod: "lastroPiso", qtd: "AutilT", formula: "área útil do térreo" },
      { chave: "contrapiso", cod: "contrapiso", qtd: "Autil", formula: "área útil total" },
      { chave: "pisoPorc", cod: "pisoPorc", quando: "piso.tipo=='porcelanato'", qtd: "Autil", formula: "área útil total" },
      { chave: "pisoCer", cod: "pisoCer", quando: "piso.tipo!='porcelanato'", qtd: "Autil", formula: "área útil total" },
      { chave: "rodape", cod: "rodape", qtd: "(P+2*Li)*pav-(Npi*2+Npe)*0.80-banheiros*7.5", formula: "perímetro dos cômodos (P + 2 Li) × pav − portas − banheiros (com cerâmica)" },
      { chave: "impMolh", cod: "impMolh", qtd: "banheiros*5+se(tipo=='comercial',0,4)", formula: "banheiros × 5 m² (piso + rodapé do box) (+ 4 m² área de serviço em residência)" },
      { chave: "soleira", cod: "soleira", qtd: "Npe*0.90+banheiros*0.70", formula: "portas externas × 0,90 + banheiros × 0,70" },
      { chave: "peitoril", cod: "peitoril", qtd: "Nj*1.20", formula: "janelas × 1,20 m" },
      { chave: "calcada", cod: "calcada", quando: "padrao!='popular'", qtd: "P*0.60", formula: "calçada perimetral 0,60 m × P" }
    ]
  });

  E.push({
    id: "forro", etapa: "FORRO", ordem: 8,
    premissas: ["Forro de gesso em toda a área útil; laje é tratada na superestrutura."],
    perguntas: [
      { id: "forro.tipo", txt: "Forro", op: ["gesso", "laje", "nenhum"], rotulos: { gesso: "Forro de gesso", laje: "Laje (forro em laje pré-moldada)", nenhum: "Sem forro" }, padraoExpr: "se(cob.tipo=='laje','laje',se(padrao=='popular','nenhum','gesso'))" }
    ],
    itens: [
      { chave: "forroGesso", cod: "forroGesso", quando: "forro.tipo=='gesso'", qtd: "Autil", formula: "área útil total" }
    ]
  });

  E.push({
    id: "esquadrias", etapa: "ESQUADRIAS", ordem: 9,
    premissas: ["Janelas de alumínio de correr 1,20 × 1,20 m; portas internas 0,70 × 2,10 m; portas externas 0,90 × 2,10 m."],
    perguntas: [],
    itens: [
      { chave: "janela", cod: "janela", qtd: "Aj", formula: "1/8 da área útil" },
      { chave: "portaInt", cod: "portaInt", qtd: "Npi", formula: "1 porta a cada 14 m² construídos" },
      { chave: "portaExt", cod: "portaExt", qtd: "Npe", formula: "acesso social + serviço (1 acesso em comercial)" }
    ]
  });

  E.push({
    id: "pintura", etapa: "PINTURA", ordem: 10,
    premissas: ["Massa corrida nas paredes internas no padrão normal (1 demão) e alto (2 demãos); látex econômico, standard ou premium conforme o padrão."],
    perguntas: [],
    vars: [SINT, ACER, AEXT, ["Apint", "Sint-Acer"], ["Ateto", "Autil"]],
    itens: [
      { chave: "massaPar2", cod: "massaPar2", quando: "padrao=='alto'", qtd: "Apint", formula: "paredes internas com massa única" },
      { chave: "massaPar1", cod: "massaPar1", quando: "padrao=='normal'", qtd: "Apint", formula: "paredes internas com massa única" },
      { chave: "massaTeto", cod: "massaTeto", quando: "padrao!='popular'", qtd: "Ateto", formula: "teto = área útil" },
      { chave: "tintaParEco", cod: "tintaParEco", quando: "padrao=='popular'", qtd: "Apint+Aext", formula: "paredes internas + fachada" },
      { chave: "tintaParStd", cod: "tintaParStd", quando: "padrao=='normal'", qtd: "Apint+Aext", formula: "paredes internas + fachada" },
      { chave: "tintaParPrem", cod: "tintaParPrem", quando: "padrao=='alto'", qtd: "Apint+Aext", formula: "paredes internas + fachada" },
      { chave: "tintaTetoEco", cod: "tintaTetoEco", quando: "padrao=='popular'", qtd: "Ateto", formula: "teto = área útil" },
      { chave: "tintaTetoStd", cod: "tintaTetoStd", quando: "padrao=='normal'", qtd: "Ateto", formula: "teto = área útil" },
      { chave: "tintaTetoPrem", cod: "tintaTetoPrem", quando: "padrao=='alto'", qtd: "Ateto", formula: "teto = área útil" },
      { chave: "seladorExt", cod: "seladorExt", qtd: "Aext", formula: "fachada" }
    ]
  });

  E.push({
    id: "eletrica", etapa: "INSTALAÇÕES ELÉTRICAS", ordem: 11,
    premissas: [
      "Elétrica: {Nt} tomadas (1 a cada 5 m², NBR 5410 pede 1 a cada 5 m de perímetro), {Nl} pontos de luz e interruptores (1 a cada 9 m²), 5 m de eletroduto por ponto."
    ],
    perguntas: [],
    vars: [["Nt", "ceil(area/5-1e-9)"], ["Nl", "ceil(area/9-1e-9)"], ["Leletro", "5*(Nt+2*Nl)"]],
    itens: [
      { chave: "entrada", cod: "entrada", qtd: "1", formula: "1 entrada bifásica" },
      { chave: "quadro", cod: "quadro", qtd: "pav", formula: "1 quadro por pavimento" },
      { chave: "disj16", cod: "disj16", qtd: "ceil(Nt/6-1e-9)+ceil(Nl/10-1e-9)", formula: "circuitos: tomadas ÷ 6 + iluminação ÷ 10" },
      { chave: "disj40", cod: "disj40", qtd: "banheiros", formula: "1 circuito de chuveiro por banheiro" },
      { chave: "eletroduto", cod: "eletroduto", qtd: "Leletro", formula: "5 m × (tomadas + luzes + interruptores)" },
      { chave: "cabo", cod: "cabo", qtd: "Leletro*3", formula: "3 condutores (F + N + T) × eletroduto" },
      { chave: "caixaBaixa", cod: "caixaBaixa", qtd: "Nt", formula: "1 por tomada" },
      { chave: "caixaMedia", cod: "caixaMedia", qtd: "Nl", formula: "1 por interruptor" },
      { chave: "tomada", cod: "tomada", qtd: "Nt", formula: "1 a cada 5 m²" },
      { chave: "interruptor", cod: "interruptor", qtd: "Nl", formula: "1 por ponto de luz" },
      { chave: "luminaria", cod: "luminaria", qtd: "Nl", formula: "1 a cada 9 m²" }
    ]
  });

  E.push({
    id: "hidro", etapa: "INSTALAÇÕES HIDROSSANITÁRIAS", ordem: 12,
    premissas: [
      { quando: "tipo!='comercial'", texto: "Hidráulica: {Npa} pontos de água (3 por banheiro + pia, tanque e máquina); reservação de 1 dia = {litros} L ({morad} pessoas × 150 L)." },
      { quando: "tipo=='comercial'", texto: "Hidráulica: {Npa} pontos de água (3 por banheiro + copa); reservação de 1 dia = {litros} L ({morad} pessoas × 50 L)." }
    ],
    perguntas: [
      { id: "esgoto.tipo", txt: "Destino do esgoto", op: ["rede", "fossa"], rotulos: { rede: "Rede pública", fossa: "Fossa séptica + sumidouro" }, padrao: "rede" }
    ],
    vars: [["Npa", "3*banheiros+se(tipo=='comercial',1,3)"], ["morad", "se(tipo=='comercial',max(2,ceil(area/10-1e-9)),2*quartos)"], ["litros", "se(tipo=='comercial',50,150)*morad"]],
    itens: [
      { chave: "tubo25", cod: "tubo25", qtd: "Npa*4+3*h*pav", formula: "pontos × 4 m + barrilete/prumada" },
      { chave: "registro", cod: "registro", qtd: "banheiros+2", formula: "1 por banheiro + cozinha + área de serviço" },
      { chave: "caixaDagua", cod: "caixaDagua", qtd: "max(1,ceil(litros/1000-1e-9))", formula: "reservação ÷ 1.000 L" },
      { chave: "tubo40", cod: "tubo40", qtd: "banheiros*6+4", formula: "banheiros × 6 m + 4 m (cozinha e serviço)" },
      { chave: "tubo100", cod: "tubo100", qtd: "banheiros*4+P/2", formula: "banheiros × 4 m (bacia) + coletor P/2" },
      { chave: "sifonada", cod: "sifonada", qtd: "banheiros+1", formula: "1 por banheiro + área de serviço" },
      { chave: "gordura", cod: "gordura", quando: "tipo!='comercial'", qtd: "1", formula: "1 caixa de gordura" },
      { chave: "caixaInspecao", qtd: "2", desc: "CAIXA DE INSPEÇÃO DE ESGOTO EM ALVENARIA, 60 X 60 CM, COM TAMPA DE CONCRETO", un: "un", formula: "2 caixas (mudança de direção e saída)", intencao: "caixa de inspeção de esgoto alvenaria 60x60" },
      { chave: "fossa", cod: "fossa", quando: "esgoto.tipo=='fossa'", qtd: "ceil(morad/5-1e-9)", formula: "1 tanque para cada 5 contribuintes" },
      { chave: "sumidouro", cod: "sumidouro", quando: "esgoto.tipo=='fossa'", qtd: "ceil(morad/5-1e-9)", formula: "1 sumidouro por tanque séptico" },
      { chave: "baciaPop", cod: "baciaPop", quando: "padrao=='popular'", qtd: "banheiros", formula: "1 por banheiro" },
      { chave: "baciaMed", cod: "baciaMed", quando: "padrao!='popular'", qtd: "banheiros", formula: "1 por banheiro" },
      { chave: "lavPop", cod: "lavPop", quando: "padrao=='popular'", qtd: "banheiros", formula: "1 por banheiro" },
      { chave: "lavMed", cod: "lavMed", quando: "padrao=='normal'", qtd: "banheiros", formula: "1 por banheiro" },
      { chave: "lavAlto", cod: "lavAlto", quando: "padrao=='alto'", qtd: "banheiros", formula: "1 por banheiro" },
      { chave: "chuveiro", cod: "chuveiro", qtd: "se(tipo=='comercial',0,banheiros)", formula: "1 por banheiro (só em residência)" },
      { chave: "pia", cod: "pia", quando: "tipo!='comercial'", qtd: "1", formula: "pia da cozinha" },
      { chave: "tanque", cod: "tanque", quando: "tipo!='comercial'", qtd: "1", formula: "tanque da área de serviço" }
    ]
  });

  E.push({
    id: "finais", etapa: "SERVIÇOS FINAIS", ordem: 13,
    premissas: [],
    perguntas: [],
    itens: [
      { chave: "limpezaFinal", qtd: "area", desc: "LIMPEZA FINAL DE OBRA, INCLUSIVE REMOÇÃO DE ENTULHO", un: "m²", formula: "área construída", intencao: "limpeza final de obra" }
    ]
  });

  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * mor/catalogo-dados/preliminares.js — SERVIÇOS PRELIMINARES (dado, não código)
 *
 * Os 5 primeiros itens são os do orçamento paramétrico antigo (paridade exata).
 * Os de `modo!='legado'` são os da fase 2 (mobilização e ART): não existem no
 * orçamento antigo, por isso ficam fora dele; no Manual acelerado entram na prévia.
 * ⚠ Sem código na SINAPI MG 2026-06 para barracão, ligação provisória, mobilização
 *   e ART (busca por descrição em 13/11/2026: nenhum item). Por isso levam SÓ a
 *   descrição e nascem "pendente": o casador/compositor (F4) procura depois. Nenhum
 *   código foi inventado.
 * Formato de cada item: ver js/mor/catalogo.js (cabeçalho).
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  (D.etapas = D.etapas || []).push({
    id: "preliminares", etapa: "SERVIÇOS PRELIMINARES", ordem: 1,
    premissas: ["Placa de obra 2,00 × 1,00 m; canteiro dimensionado pela área construída (barracão de 6 m² até 150 m², 9 m² acima)."],
    perguntas: [],
    itens: [
      { chave: "limpeza", cod: "limpeza", qtd: "Ap*1.5", formula: "Ap × 1,5 (projeção + faixa de trabalho)", intencao: "limpeza do terreno" },
      { chave: "locacao", cod: "locacao", qtd: "P+12", formula: "P + 12 (gabarito afastado 1,50 m)", intencao: "locação da obra gabarito" },
      { chave: "placa", cod: "placa", qtd: "2", formula: "placa 2,00 × 1,00 m", intencao: "placa de obra" },
      { chave: "ligacaoProvisoria", qtd: "1", desc: "LIGAÇÃO PROVISÓRIA DE ÁGUA E ENERGIA ELÉTRICA PARA CANTEIRO DE OBRA", un: "un", formula: "1 conjunto (água e energia provisórias)", intencao: "ligação provisória água energia canteiro" },
      { chave: "barracao", qtd: "se(area>150,9,6)", desc: "BARRACÃO DE OBRA PARA DEPÓSITO E SANITÁRIO, EM CHAPA DE MADEIRA COMPENSADA", un: "m²", formula: "9 m² (obra acima de 150 m²) ou 6 m² (até 150 m²)", intencao: "barracão de obra depósito sanitário" },
      { chave: "mobilizacao", quando: "modo!='legado'", qtd: "1", desc: "MOBILIZAÇÃO E DESMOBILIZAÇÃO DE CANTEIRO DE OBRAS (EQUIPE, EQUIPAMENTOS E FERRAMENTAS)", un: "vb", formula: "1 verba — o valor depende da distância e do porte; compor no orçamento", intencao: "mobilização desmobilização canteiro" },
      { chave: "art", quando: "modo!='legado'", qtd: "1", desc: "ART/RRT DE EXECUÇÃO DA OBRA (TAXA DO CONSELHO PROFISSIONAL)", un: "un", formula: "1 por obra — a taxa depende do valor do contrato e da tabela vigente do conselho", intencao: "ART RRT execução obra taxa" }
    ]
  });
  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

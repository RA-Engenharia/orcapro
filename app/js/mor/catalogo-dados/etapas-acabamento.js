/* =====================================================================
 * mor/catalogo-dados/etapas-acabamento.js — F3: reforma, escola/creche (etapas NOVAS)
 *
 * Mesmas regras de leitura de extensoes.js. Demolição e retirada, acessibilidade e áreas
 * externas dependem de LEVANTAMENTO e de projeto: todas as quantidades ficam pendentes
 * (`qtd:null`), com o código SINAPI quando existe. Nenhuma quantidade é estimada pela área
 * da obra — numa reforma a área construída não diz quanto se demole.
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
    id: "demolicoes", etapa: "DEMOLIÇÕES E RETIRADAS", ordem: 1.2, novo: true,
    premissas: ["Medir no local: o que sai (alvenaria, revestimento, piso, forro, telhas, calhas) e o que se reaproveita. A remoção do entulho acompanha em caçamba."],
    perguntas: [],
    itens: [
      pend("demolicaoAlvenaria", "demolAlv", "volume de alvenaria a demolir (levantamento no local)", "demolição de alvenaria de bloco furado sem reaproveitamento", ""),
      pend("demolicaoRevestimento", "demolCer", "área de revestimento cerâmico a demolir (levantamento)", "demolição de revestimento cerâmico", ""),
      pend("demolicaoPiso", "demolPiso", "volume de piso de concreto a demolir (levantamento)", "demolição de piso de concreto simples", ""),
      pend("retiradaTelhas", "retTelha", "área de telhado a retirar (levantamento)", "remoção de telhas", ""),
      pend("retiradaForro", "retForro", "área de forro a retirar (levantamento)", "remoção de forro de gesso", ""),
      pend("retiradaCalhas", "retCalha", "comprimento de calhas e rufos a retirar (levantamento)", "remoção de calhas e rufos", ""),
      pend("retiradaEntulhoReforma", "entulhoA", "volume de entulho: soma dos volumes demolidos × empolamento", "remoção de entulho classe A caçamba", "", { implicito: true, porque: "tudo o que se demole vira entulho e precisa de caçamba e destino licenciado" })
    ]
  });

  E.push({
    id: "acessibilidade", etapa: "ACESSIBILIDADE", ordem: 26, novo: true,
    premissas: ["Rotas acessíveis, sanitários e sinalização (NBR 9050) seguem o projeto de acessibilidade: as quantidades ficam pendentes."],
    perguntas: [],
    itens: [
      pend("pisoTatil", "podo", "metros quadrados de piso tátil de alerta e direcional (projeto)", "piso podotátil de alerta ou direcional de concreto", ""),
      pend("rampaAcessivel", "rampa", "metros quadrados de rampa (projeto)", "rampa de acessibilidade em concreto", ""),
      pend("corrimaoAcessivel", "corrimao", "metros de corrimão duplo (projeto)", "corrimão duplo fixado em parede", ""),
      pend("barraApoio", "barraL70", "nº de barras de apoio dos sanitários acessíveis (projeto)", "barra de apoio em L em aço inox", "")
    ]
  });

  E.push({
    id: "areasext", etapa: "ÁREAS EXTERNAS E PAISAGISMO", ordem: 27, novo: true,
    premissas: ["Áreas externas, paisagismo e playground seguem o projeto de implantação: as quantidades ficam pendentes."],
    perguntas: [],
    itens: [
      pend("calcadaExterna", "calcada", "metros quadrados de calçada e passeios (implantação)", "execução de passeio calçada de concreto", ""),
      pend("gramaExterna", "grama", "metros quadrados de gramado (implantação)", "plantio de grama batatais em placas", ""),
      pend("arvoresExternas", "arvore", "nº de árvores (projeto de paisagismo)", "plantio de árvore ornamental", "")
    ]
  });

  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

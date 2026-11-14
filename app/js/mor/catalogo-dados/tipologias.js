/* =====================================================================
 * mor/catalogo-dados/tipologias.js — TIPOLOGIAS DE OBRA: etapas padrão em ordem
 *
 * Ao criar o orçamento e escolher o tipo de obra, nascem as etapas desta lista
 * (a primeira é sempre SERVIÇOS PRELIMINARES). Só o NOME da etapa é dado aqui;
 * os ITENS vêm do catálogo (js/mor/catalogo-dados/*.js) quando existe uma etapa de
 * mesmo nome. Etapa sem definição no catálogo nasce vazia, e o assistente dela diz
 * que ainda não há itens cadastrados — nunca inventa.
 *
 * `base` = qual geometria do motor serve de estimativa (js/mor/geometria.js):
 * "residencial" (paredes internas densas) ou "comercial" (salão aberto). É uma
 * aproximação declarada: obra que não é edificação (muro, pavimentação) não usa a
 * geometria de planta e o assistente pede os quantitativos do projeto.
 * As etapas seguem a ordem usual de execução de obra.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};

  var PRELIM = "SERVIÇOS PRELIMINARES";
  var ACABAMENTO_RES = ["ALVENARIA E VEDAÇÃO", "IMPERMEABILIZAÇÃO", "COBERTURA", "REVESTIMENTOS DE PAREDE", "PISOS", "FORRO", "ESQUADRIAS", "PINTURA", "INSTALAÇÕES ELÉTRICAS", "INSTALAÇÕES HIDROSSANITÁRIAS", "INSTALAÇÕES PLUVIAIS"];

  D.tipologias = [
    { id: "residencial_unifamiliar", rotulo: "Residencial unifamiliar (casa / sobrado)", base: "residencial",
      etapas: [PRELIM, "INFRAESTRUTURA (FUNDAÇÕES)", "SUPERESTRUTURA"].concat(ACABAMENTO_RES, ["SERVIÇOS FINAIS"]) },
    { id: "residencial_multifamiliar", rotulo: "Residencial multifamiliar (edifício / conjunto)", base: "residencial",
      etapas: [PRELIM, "MOVIMENTO DE TERRA", "INFRAESTRUTURA (FUNDAÇÕES)", "SUPERESTRUTURA"].concat(ACABAMENTO_RES, ["SPDA (PARA-RAIOS)", "INSTALAÇÕES DE PREVENÇÃO E COMBATE A INCÊNDIO", "ELEVADORES", "ÁREAS COMUNS E PAISAGISMO", "SERVIÇOS FINAIS"]) },
    { id: "comercial", rotulo: "Comercial (loja / sala / escritório)", base: "comercial",
      etapas: [PRELIM, "INFRAESTRUTURA (FUNDAÇÕES)", "SUPERESTRUTURA"].concat(ACABAMENTO_RES, ["SPDA (PARA-RAIOS)", "INSTALAÇÕES DE PREVENÇÃO E COMBATE A INCÊNDIO", "CLIMATIZAÇÃO", "SERVIÇOS FINAIS"]) },
    { id: "galpao_industrial", rotulo: "Galpão / industrial", base: "comercial",
      etapas: [PRELIM, "MOVIMENTO DE TERRA", "INFRAESTRUTURA (FUNDAÇÕES)", "SUPERESTRUTURA", "ESTRUTURA METÁLICA", "COBERTURA", "FECHAMENTOS E VEDAÇÃO", "PISO INDUSTRIAL", "ESQUADRIAS", "PINTURA", "INSTALAÇÕES ELÉTRICAS", "INSTALAÇÕES HIDROSSANITÁRIAS", "INSTALAÇÕES PLUVIAIS", "SPDA (PARA-RAIOS)", "INSTALAÇÕES DE PREVENÇÃO E COMBATE A INCÊNDIO", "SERVIÇOS FINAIS"] },
    { id: "reforma", rotulo: "Reforma", base: "residencial",
      etapas: [PRELIM, "DEMOLIÇÕES E RETIRADAS", "ALVENARIA E VEDAÇÃO", "IMPERMEABILIZAÇÃO", "COBERTURA", "REVESTIMENTOS DE PAREDE", "PISOS", "FORRO", "ESQUADRIAS", "PINTURA", "INSTALAÇÕES ELÉTRICAS", "INSTALAÇÕES HIDROSSANITÁRIAS", "SERVIÇOS FINAIS"] },
    { id: "escola_creche", rotulo: "Escola / creche", base: "comercial",
      etapas: [PRELIM, "INFRAESTRUTURA (FUNDAÇÕES)", "SUPERESTRUTURA"].concat(ACABAMENTO_RES, ["ACESSIBILIDADE", "SPDA (PARA-RAIOS)", "INSTALAÇÕES DE PREVENÇÃO E COMBATE A INCÊNDIO", "ÁREAS EXTERNAS E PAISAGISMO", "SERVIÇOS FINAIS"]) },
    { id: "quiosque_madeira", rotulo: "Quiosque / estrutura de madeira", base: "comercial",
      etapas: [PRELIM, "INFRAESTRUTURA (FUNDAÇÕES)", "ESTRUTURA DE MADEIRA", "COBERTURA", "PISOS", "ESQUADRIAS", "TRATAMENTO E PINTURA DA MADEIRA", "INSTALAÇÕES ELÉTRICAS", "INSTALAÇÕES HIDROSSANITÁRIAS", "SERVIÇOS FINAIS"] },
    { id: "muro_arrimo", rotulo: "Muro / arrimo", base: "comercial",
      etapas: [PRELIM, "MOVIMENTO DE TERRA", "INFRAESTRUTURA (FUNDAÇÕES)", "ESTRUTURA DO MURO / ARRIMO", "DRENAGEM", "REVESTIMENTOS E ACABAMENTOS", "SERVIÇOS FINAIS"] },
    { id: "pavimentacao", rotulo: "Pavimentação", base: "comercial",
      etapas: [PRELIM, "TERRAPLENAGEM", "DRENAGEM SUPERFICIAL", "PAVIMENTO (SUB-BASE, BASE E REVESTIMENTO)", "MEIO-FIO E SARJETAS", "SINALIZAÇÃO", "SERVIÇOS FINAIS"] }
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = D.tipologias;
})(typeof window !== "undefined" ? window : globalThis);

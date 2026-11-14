/* =====================================================================
 * mor/catalogo-dados/etapas-instalacoes.js — F3: águas pluviais, SPDA e incêndio (etapas NOVAS)
 *
 * Mesmas regras de leitura de extensoes.js. Projeto de SPDA (NBR 5419) e de incêndio
 * (corpo de bombeiros) definem as QUANTIDADES: aqui o catálogo lista o que a obra costuma
 * ter, com o código SINAPI quando existe, e deixa a quantidade pendente. Nada de número
 * chutado — um extintor a mais ou a menos é questão de projeto aprovado, não de estimativa.
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
    id: "pluvial", etapa: "INSTALAÇÕES PLUVIAIS", ordem: 12.5, novo: true,
    premissas: ["Calha, condutor vertical e rufo estão na etapa COBERTURA. Aqui ficam a rede horizontal e as caixas, cuja extensão depende da implantação e do ponto de lançamento."],
    perguntas: [],
    itens: [
      pend("ramalPluvial", "plu100r", "comprimento da rede horizontal até o ponto de lançamento (implantação)", "tubo pvc série r água pluvial dn 100 ramal de encaminhamento", ""),
      pend("coletor150", "plu150v", "trecho de DN 150 mm, se a vazão pedir (cálculo da rede pluvial)", "tubo pvc série r água pluvial dn 150", ""),
      pend("caixaAreia", null, "nº de caixas de areia/passagem nas mudanças de direção (implantação)", "caixa de areia e passagem pluvial em alvenaria", "", { desc: "CAIXA DE AREIA/PASSAGEM PLUVIAL EM ALVENARIA, COM TAMPA", un: "un", implicito: true, porque: "a rede horizontal precisa de caixa onde muda de direção para limpeza e retenção de areia" }),
      pend("bocaLobo", "bocaLobo", "nº de bocas de lobo (implantação, junto à sarjeta)", "caixa para boca de lobo com grelha", "")
    ]
  });

  E.push({
    id: "spda", etapa: "SPDA (PARA-RAIOS)", ordem: 12.6, novo: true,
    premissas: ["O SPDA se dimensiona pela NBR 5419 (nível de proteção, esfera rolante, malha): captores, descidas e hastes vêm do projeto específico — as quantidades ficam pendentes."],
    perguntas: [],
    itens: [
      pend("captor", "captor", "nº de captores do projeto de SPDA", "captor franklin para spda", ""),
      pend("mastro", "mastro", "nº de bases de mastro do projeto de SPDA", "base metálica para mastro spda", ""),
      pend("cabosDescida", "caboNu50", "comprimento de cabo de descida e de malha do projeto de SPDA", "cabo de cobre nu 50 mm2 spda", ""),
      pend("hastesSpda", "haste", "nº de hastes de aterramento do projeto de SPDA", "haste de aterramento 5/8 3 metros", ""),
      pend("caixaInspecaoSpda", null, "1 caixa de inspeção por haste (projeto)", "caixa de inspeção de aterramento", "", { desc: "CAIXA DE INSPEÇÃO PARA ATERRAMENTO COM TAMPA", un: "un", implicito: true, porque: "cada haste de aterramento tem de poder ser inspecionada e medida" })
    ]
  });

  E.push({
    id: "incendio", etapa: "INSTALAÇÕES DE PREVENÇÃO E COMBATE A INCÊNDIO", ordem: 12.7, novo: true,
    premissas: ["O projeto de segurança contra incêndio aprovado no Corpo de Bombeiros define o que a obra leva (extintores, sinalização, iluminação de emergência, hidrantes): as quantidades ficam pendentes."],
    perguntas: [],
    itens: [
      pend("extintorPQS", "extPQS", "nº de extintores de pó químico do projeto aprovado", "extintor de incêndio portátil pó químico", ""),
      pend("extintorCO2", "extCO2", "nº de extintores de CO2 (quadros elétricos) do projeto aprovado", "extintor de incêndio portátil co2", ""),
      pend("sinalizacaoEmergencia", "sinalFoto", "nº de placas fotoluminescentes (saídas, extintores) do projeto aprovado", "placa de sinalização de segurança contra incêndio fotoluminescente", ""),
      pend("luminariaEmergencia", "emerg", "nº de luminárias de emergência do projeto aprovado", "luminária de emergência led", ""),
      pend("abrigoHidrante", "abrigoHid", "nº de hidrantes do projeto aprovado (obrigatório só em algumas edificações)", "abrigo para hidrante com registro e adaptador storz", ""),
      pend("mangueiraIncendio", "mangueira", "1 mangueira por hidrante (projeto aprovado)", "mangueira de incêndio tipo 1 de 1 1/2 polegada", "")
    ]
  });

  if (typeof module !== "undefined" && module.exports) module.exports = D.etapas;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * bdi.js — Cálculo de BDI (Benefícios e Despesas Indiretas)
 * Fórmula consagrada (Acórdão TCU nº 2.622/2013):
 *   BDI = [ (1+AC+S+R+G) * (1+DF) * (1+L) / (1 - I) ] - 1
 * onde AC, S, R, G, DF, L e I entram em fração (ex.: 4% -> 0,04).
 * ===================================================================== */
(function (global) {
  "use strict";

  var Bdi = {
    presets: function () { return CONFIG.bdiPresets; },

    paramsDoModelo: function (modeloId) {
      var p = CONFIG.bdiPresets[modeloId] || CONFIG.bdiPresets.padrao;
      return { AC: p.AC, S: p.S, R: p.R, G: p.G, DF: p.DF, L: p.L, I: p.I };
    },

    /* Recebe params em % e devolve o percentual de BDI (em %). */
    calcular: function (params) {
      var p = params || this.paramsDoModelo("padrao");
      var AC = Util.num(p.AC) / 100, S = Util.num(p.S) / 100, R = Util.num(p.R) / 100,
          G = Util.num(p.G) / 100, DF = Util.num(p.DF) / 100, L = Util.num(p.L) / 100,
          I = Util.num(p.I) / 100;
      if (I >= 1) I = 0.9999; // proteção contra divisão por zero/negativo
      var bdi = ((1 + AC + S + R + G) * (1 + DF) * (1 + L)) / (1 - I) - 1;
      return Math.round(bdi * 10000) / 100; // % com 2 casas
    },

    /* Aplica BDI sobre um custo direto -> preço de venda. */
    aplicar: function (custoDireto, percentualBdi) {
      return Util.num(custoDireto) * (1 + Util.num(percentualBdi) / 100);
    }
  };

  global.Bdi = Bdi;
})(window);

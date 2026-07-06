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
    },

    /* LOTE 4 — Faixas referenciais de BDI do Acórdão TCU nº 2.622/2013
     * (1º e 3º quartis por tipo de obra). Fonte: Acórdão TCU 2.622/2013,
     * Plenário. Uso: aviso NÃO-bloqueante — fora da faixa, em licitação
     * pública, o BDI precisa de justificativa formal. */
    FAIXAS_TCU: {
      edificacoes:  { label: "Construção de edifícios",                          min: 20.34, max: 25.00 },
      rodovias:     { label: "Construção de rodovias e ferrovias",               min: 19.60, max: 24.23 },
      saneamento:   { label: "Redes de abastecimento de água e coleta de esgoto", min: 20.76, max: 26.44 },
      energia:      { label: "Redes de distribuição de energia elétrica",         min: 24.00, max: 25.84 },
      portuarias:   { label: "Obras portuárias, marítimas e fluviais",            min: 22.80, max: 27.48 },
      fornecimento: { label: "Mero fornecimento de materiais e equipamentos",     min: 11.10, max: 16.80 }
    },

    /* Devolve string de aviso se o BDI estiver fora da faixa TCU do tipo de
     * obra (default: edificações), ou null se dentro. Nunca bloqueia. */
    avisoFaixa: function (percentual, tipoObra) {
      var fx = this.FAIXAS_TCU[tipoObra || "edificacoes"];
      if (!fx) return null;
      var p = Util.num(percentual);
      if (p >= fx.min && p <= fx.max) return null;
      return "BDI de " + Util.fmtNum(p, 2) + "% está FORA da faixa referencial do Acórdão TCU 2.622/2013 para " +
        fx.label + " (" + Util.fmtNum(fx.min, 2) + "% a " + Util.fmtNum(fx.max, 2) + "%). Em licitação pública, justifique formalmente ou ajuste.";
    }
  };

  global.Bdi = Bdi;
})(window);

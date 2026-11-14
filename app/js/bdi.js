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

    /* PARÂMETROS QUE PRODUZEM UM PERCENTUAL-ALVO.
     * Inverte a fórmula TCU ajustando SÓ o Lucro (L) sobre uma base.
     * Existe porque um orçamento pode carregar apenas o percentual (BDI
     * manual digitado no assistente) — e a aba BDI renderizava o preset
     * "padrão" (27,03 %) por baixo de um percentual configurado de 20 %:
     * campos contradizendo o número grande, e "Aplicar BDI" sem mexer em
     * nada trocava 20 % por 27,03 %. Com esta inversão os campos exibidos
     * SEMPRE produzem o percentual gravado. */
    paramsParaPercentual: function (alvoPct, base) {
      var b = base && typeof base === "object" ? JSON.parse(JSON.stringify(base)) : this.paramsDoModelo("padrao");
      var AC = Util.num(b.AC) / 100, S = Util.num(b.S) / 100, R = Util.num(b.R) / 100,
          G = Util.num(b.G) / 100, DF = Util.num(b.DF) / 100, I = Util.num(b.I) / 100;
      if (I >= 1) I = 0.9999;
      var denom = (1 + AC + S + R + G) * (1 + DF);
      var umMaisL = denom > 0 ? ((1 + Util.num(alvoPct) / 100) * (1 - I)) / denom : 1;
      var L = (umMaisL - 1) * 100;
      b.L = isFinite(L) ? Math.round(L * 10000) / 10000 : Util.num(b.L); // 4 casas: com 2, alvo 20 % reaplicava como 20,01 %
      return b;
    },

    /* AS SETE PARCELAS, na ordem e com os rótulos da aba BDI (renderBdi).
     * Fonte única: a aba BDI e a página "Composição do BDI" da proposta leem
     * esta lista — se uma renomear a parcela, a outra muda junto. */
    PARCELAS: [
      ["AC", "Administração Central"], ["S", "Seguro"], ["R", "Risco"],
      ["G", "Garantia"], ["DF", "Despesas Financeiras"], ["L", "Lucro"], ["I", "Impostos (PIS+COFINS+ISS)"]
    ],
    FORMULA_TCU: "BDI = [ (1 + AC + S + R + G) × (1 + DF) × (1 + L) ÷ (1 − I) ] − 1",

    /* AS PARCELAS DE UM ORÇAMENTO, como a aba BDI as mostra.
     * Devolve { percentual, modeloId, detalhado, parcelas:[{sigla,nome,pct}], calculado, confere }.
     * ⚠ SÓ HÁ PARCELA QUANDO O ORÇAMENTO A GUARDA (`orc.bdi.params`). Orçamento
     *   com BDI digitado só como percentual não tem composição: a aba BDI deriva
     *   o Lucro para fechar a conta, mas escrever essa derivação num documento
     *   para órgão público seria inventar parcela. Aí `detalhado` é false e a
     *   proposta mostra só o percentual, dizendo que a composição não foi detalhada.
     * ⚠ `percentual` é o que os PREÇOS usam (orc.bdi.percentual). `calculado` é o
     *   que as parcelas resultam na fórmula; se divergirem (> 0,01 ponto), `confere`
     *   é false e o documento diz as duas coisas em vez de esconder a diferença. */
    composicaoDoOrcamento: function (orc) {
      var b = (orc && orc.bdi) || {};
      var pct = b.percentual;
      var temParams = !!(b.params && typeof b.params === "object");
      var out = { percentual: Util.num(pct), modeloId: b.modeloId || "", detalhado: temParams, parcelas: [], calculado: null, confere: true };
      if (pct == null || !isFinite(Util.num(pct))) {
        try { out.percentual = Util.num(Orcamento.totais(orc).bdiPercentual); } catch (e) {}
      }
      if (!temParams) return out;
      this.PARCELAS.forEach(function (c) { out.parcelas.push({ sigla: c[0], nome: c[1], pct: Util.num(b.params[c[0]]) }); });
      out.calculado = this.calcular(b.params);
      out.confere = Math.abs(out.calculado - out.percentual) <= 0.01;
      return out;
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

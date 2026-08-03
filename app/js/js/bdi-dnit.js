/* =====================================================================
 * bdi-dnit.js — BDI oficial DNIT / Acórdão TCU nº 2.622/2013
 * Componentes ADOTADOS (Construção de Rodovias e Ferrovias) + tributos
 * com CPRB que se ATUALIZA SOZINHA por ano (Lei 14.973/2024 — reoneração
 * gradual da folha). Selic de referência da página do DNIT.
 * Fonte: gov.br/dnit .../bdi/bdi-2  +  Acórdão 2622/2013.
 * ===================================================================== */
(function (global) {
  "use strict";

  // CPRB (%) por ano — Lei 14.973/2024 (reoneração gradual). Página DNIT confirma 2025/26/27.
  var CPRB_ANO = { 2024: 4.50, 2025: 3.60, 2026: 2.70, 2027: 1.80, 2028: 0.90 };

  function anoAtual() { try { return new Date().getFullYear(); } catch (e) { return 2026; } }
  function cprbDoAno(ano) {
    ano = ano || anoAtual();
    if (CPRB_ANO[ano] != null) return CPRB_ANO[ano];
    if (ano < 2024) return 4.50;
    return 0; // 2029+ folha reonerada
  }

  var DnitBdi = {
    fonte: "DNIT · Acórdão TCU nº 2.622/2013",
    referencia: "Construção de Rodovias e Ferrovias (valores adotados)",
    paginaDnit: "https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-referenciais/sistemas-de-custos/bdi/bdi-2",
    selic: 14.50,            // % a.a. (referência DNIT, vigente desde 05/05/2026)
    vigenciaSelic: "05/05/2026",
    cprbAno: CPRB_ANO,

    // Componentes adotados (Acórdão 2622/2013 — rodovias/ferrovias)
    base: { AC: 4.09, S: 0.74, R: 0.97, G: 0, DF: 1.21, L: 6.64 },
    tributos: { pis: 0.65, cofins: 3.00, iss: 3.00 }, // ISS ajustável por município

    cprbDoAno: cprbDoAno,

    // Impostos (I) = PIS + COFINS + ISS + CPRB(ano)
    impostos: function (opts) {
      opts = opts || {};
      var iss = (opts.iss != null) ? Number(opts.iss) : this.tributos.iss;
      return Math.round((this.tributos.pis + this.tributos.cofins + iss + cprbDoAno(opts.ano)) * 100) / 100;
    },

    // Parâmetros no formato do Bdi.calcular ({AC,S,R,G,DF,L,I})
    params: function (opts) {
      opts = opts || {};
      return { AC: this.base.AC, S: this.base.S, R: this.base.R, G: this.base.G, DF: this.base.DF, L: this.base.L, I: this.impostos(opts) };
    },

    percentual: function (opts) { return (typeof Bdi !== "undefined") ? Bdi.calcular(this.params(opts)) : null; },

    resumo: function (opts) {
      opts = opts || {};
      var ano = opts.ano || anoAtual();
      return { fonte: this.fonte, ano: ano, cprb: cprbDoAno(ano), selic: this.selic, iss: (opts.iss != null ? Number(opts.iss) : this.tributos.iss), percentual: this.percentual(opts) };
    }
  };

  global.DnitBdi = DnitBdi;
  if (typeof module !== "undefined" && module.exports) module.exports = DnitBdi;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * analitico.js — Base ANALÍTICA do SINAPI (composição → insumos + MO/MAT/EQ)
 * Carrega sob demanda (lazy) o data/sinapi-MG-analitico.json (~17 MB):
 * cada composição traz seus insumos (coef, custo, categoria) e os totais
 * custoMO/MAT/EQ. Usado para "ver composição detalhada" e o filtro MO/MAT/EQ.
 * Lógica de lookup é pura/testável (Node).
 * ===================================================================== */
(function (global) {
  "use strict";

  var Analitico = {
    carregado: false,
    carregando: false,
    competencia: null,
    uf: null,
    _porCodigo: {},
    _total: 0,
    _promise: null,

    /* Carrega de um pacote já parseado { mes, uf, dados:[...] } */
    carregarDe: function (pacote) {
      var dados = (pacote && pacote.dados) ? pacote.dados : (Array.isArray(pacote) ? pacote : []);
      this._porCodigo = {};
      for (var i = 0; i < dados.length; i++) {
        var it = dados[i];
        if (it && it.codigo != null) this._porCodigo[String(it.codigo)] = it;
      }
      this._total = dados.length;
      this.competencia = (pacote && pacote.mes) || null;
      this.uf = (pacote && pacote.uf) || null;
      this.carregado = true;
      this.carregando = false;
      return dados.length;
    },

    /* Carrega o arquivo via fetch UMA vez (idempotente: reaproveita a promise). */
    carregarArquivo: function (url) {
      var self = this;
      if (this.carregado) return Promise.resolve(this._total);
      if (this._promise) return this._promise;
      this.carregando = true;
      this._promise = fetch(url || "data/sinapi-MG-analitico.json")
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) { return self.carregarDe(j); })
        .catch(function (e) { self.carregando = false; self._promise = null; throw e; });
      return this._promise;
    },

    /* Retorna o analítico de uma composição (ou null se não houver). */
    obter: function (codigo) { return this._porCodigo[String(codigo)] || null; },
    tem: function (codigo) { return !!this._porCodigo[String(codigo)]; },

    /* Razões MO/MAT/EQ (0..1) de uma composição — p/ aplicar sobre o preço do orçamento. */
    razoes: function (codigo) {
      var a = this.obter(codigo);
      if (!a) return null;
      var t = (a.custoMO || 0) + (a.custoMAT || 0) + (a.custoEQ || 0);
      if (t <= 0) return { mo: 0, mat: 1, eq: 0 };
      return { mo: (a.custoMO || 0) / t, mat: (a.custoMAT || 0) / t, eq: (a.custoEQ || 0) / t };
    },

    /* Quebra MO/MAT/EQ aplicada a um custo unitário REAL (preço do orçamento). */
    quebra: function (codigo, custoUnitarioReal) {
      var rz = this.razoes(codigo);
      var cu = Number(custoUnitarioReal) || 0;
      if (!rz) return { custoMO: 0, custoMAT: cu, custoEQ: 0 };
      return { custoMO: cu * rz.mo, custoMAT: cu * rz.mat, custoEQ: cu * rz.eq };
    },

    resumo: function () { return { carregado: this.carregado, total: this._total, competencia: this.competencia, uf: this.uf }; }
  };

  if (global) global.Analitico = Analitico;
  if (typeof module !== "undefined" && module.exports) module.exports = Analitico;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

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
    _epoca: 0,           // geração; reset() (troca de UF) incrementa p/ descartar fetch órfão

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
      this._normalizar(); // FASE 1.1: corrige categorias de sub-composições vindas erradas do gerador
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
      var epoca = this._epoca; // captura a geração atual
      this._promise = fetch(url || "data/sinapi-MG-analitico.json")
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) {
          if (epoca !== self._epoca) throw new Error("cancelado"); // trocou de UF durante o fetch → descarta
          return self.carregarDe(j);
        })
        .catch(function (e) { self.carregando = false; self._promise = null; throw e; });
      return this._promise;
    },

    /* Zera o estado (usado ao TROCAR de UF: descarta o analítico anterior). */
    reset: function () {
      this._epoca++; // invalida qualquer fetch em voo (o .then vê época obsoleta e descarta)
      this.carregado = false; this.carregando = false; this._promise = null;
      this._porCodigo = {}; this._total = 0; this.competencia = null; this.uf = null;
    },

    /* FASE 1.1 — Normaliza categorias: o gerador classificava SUB-COMPOSIÇÕES por
     * faixa de código de insumo (ex.: ARGAMASSA 88626 virava "EQ"). Aqui a sub usa
     * as razões MO/MAT/EQ DELA PRÓPRIA (recursivo, memo + guarda de ciclo) e os
     * totais custoMO/MAT/EQ do pai são reparticionados. Idempotente. */
    _normalizar: function () {
      var self = this, memo = {};
      // Convenção SINAPI/mercado: composição de hora-homem ("COM ENCARGOS
      // COMPLEMENTARES/SOCIAIS", HORISTA/MENSALISTA) é custo de MÃO DE OBRA por
      // inteiro. NÃO recursar nelas: os encargos complementares (alimentação,
      // transporte, EPI) são insumos rotulados MAT e diluiriam a MO em ~30%.
      var RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;
      var MO_PURA = { mo: 1, mat: 0, eq: 0 };
      function ehMoPura(txt) { return RE_MO.test(String(txt || '').toUpperCase()); }
      function gravadas(c) { // razões pelos totais gravados no arquivo (fallback)
        var t = (c.custoMO || 0) + (c.custoMAT || 0) + (c.custoEQ || 0);
        if (t <= 0) return { mo: 0, mat: 1, eq: 0 };
        return { mo: (c.custoMO || 0) / t, mat: (c.custoMAT || 0) / t, eq: (c.custoEQ || 0) / t };
      }
      function efetivas(cod, trilha) { // razões recomputadas bottom-up a partir dos insumos-folha
        cod = String(cod);
        if (memo[cod]) return memo[cod];
        var c = self._porCodigo[cod];
        if (!c) return null;
        if (ehMoPura(c.descricao)) { memo[cod] = MO_PURA; return MO_PURA; }
        if (trilha[cod]) return gravadas(c); // ciclo (não deveria existir): não recursa
        trilha[cod] = 1;
        var mo = 0, mat = 0, eq = 0, tem = false;
        var ins = Array.isArray(c.insumos) ? c.insumos : [];
        for (var i = 0; i < ins.length; i++) {
          var it = ins[i], ct = Number(it.custoTotal) || 0;
          if (ct <= 0) continue;
          tem = true;
          var rz = (it.tipo === "COMPOSICAO") ? (ehMoPura(it.descricao) ? MO_PURA : efetivas(it.codigo, trilha)) : null;
          if (rz) { mo += ct * rz.mo; mat += ct * rz.mat; eq += ct * rz.eq; }
          else if (it.categoria === "MO") mo += ct;
          else if (it.categoria === "EQ") eq += ct;
          else mat += ct;
        }
        delete trilha[cod];
        var r = (tem && (mo + mat + eq) > 0)
          ? { mo: mo / (mo + mat + eq), mat: mat / (mo + mat + eq), eq: eq / (mo + mat + eq) }
          : gravadas(c);
        memo[cod] = r;
        return r;
      }
      Object.keys(this._porCodigo).forEach(function (cod) {
        var c = self._porCodigo[cod];
        var ins = Array.isArray(c.insumos) ? c.insumos : [];
        var mo = 0, mat = 0, eq = 0, tem = false;
        ins.forEach(function (it) {
          var ct = Number(it.custoTotal) || 0;
          if (it.tipo === "COMPOSICAO") {
            var rz = ehMoPura(it.descricao) ? MO_PURA : efetivas(it.codigo, {});
            if (rz) { // categoria predominante REAL da sub + repartição fiel
              it.categoria = (rz.mo >= rz.mat && rz.mo >= rz.eq) ? "MO" : (rz.eq > rz.mat ? "EQ" : "MAT");
              mo += ct * rz.mo; mat += ct * rz.mat; eq += ct * rz.eq;
              if (ct > 0) tem = true;
              return;
            }
          }
          if (it.categoria === "MO") mo += ct; else if (it.categoria === "EQ") eq += ct; else mat += ct;
          if (ct > 0) tem = true;
        });
        if (tem && (mo + mat + eq) > 0) {
          // repartição nova sobre a MESMA escala gravada (não altera o custo total)
          var t = mo + mat + eq;
          var base = (c.custoMO || 0) + (c.custoMAT || 0) + (c.custoEQ || 0) || t;
          c.custoMO = Math.round(base * (mo / t) * 100) / 100;
          c.custoMAT = Math.round(base * (mat / t) * 100) / 100;
          c.custoEQ = Math.round(base * (eq / t) * 100) / 100;
        }
      });
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

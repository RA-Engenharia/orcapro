/* =====================================================================
 * atualizacao.js — Auto-atualização das tabelas (Fase 5)
 * Conversa com o sinapi-fetcher do ERP (http://localhost:3040, CORS *):
 *   /health · /sinapi/listar · /sinapi/listar-oficial ·
 *   POST /sinapi/baixar {mes} · /sinapi/dados?mes&uf&tipo
 * Atualiza a base SINAPI sozinho e avisa quando há competência nova.
 * ===================================================================== */
(function (global) {
  "use strict";

  var BACKEND = "http://localhost:3040";

  var Atualizacao = {
    backend: BACKEND,

    _get: function (path) {
      return fetch(BACKEND + path).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    },

    online: function () { return this._get("/health").then(function (j) { return !!(j && j.ok); }).catch(function () { return false; }); },

    /* Escaneia uma PASTA (dentro do projeto do ERP) → parseia tudo (SICRO etc.) e
       carrega cada base resultante no multi-base do OrçaPRO. Retorna o resumo. */
    escanearPasta: function (caminho, uf, mes, desonerado) {
      var self = this;
      return fetch(BACKEND + "/bases/escanear-pasta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: caminho, uf: uf || "", mes: mes || "", desonerado: !!desonerado })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ("HTTP " + r.status)); }, function () { throw new Error("HTTP " + r.status); });
        return r.json();
      }).then(function (res) {
        var fontes = Object.keys(res.bases || {});
        return Promise.all(fontes.map(function (b) {
          return self._get("/sinapi/dados?mes=" + encodeURIComponent(res.mes) + "&uf=" + encodeURIComponent(res.uf) + "&tipo=" + encodeURIComponent(b))
            .then(function (pacote) {
              var fonte = (b === "sicro") ? "SICRO" : String(b).toUpperCase();
              if (typeof Bases !== "undefined") Bases.registrar(fonte, pacote);
              return { fonte: fonte, total: (pacote && pacote.count) || (pacote && pacote.dados ? pacote.dados.length : 0) };
            });
        })).then(function (carregadas) {
          var grav = (typeof Bases !== "undefined" && typeof Auth !== "undefined") ? Bases.persistir(Auth.empresaId()) : { ok: true };
          return { mes: res.mes, uf: res.uf, carregadas: carregadas, relatorio: res.arquivos || [], persistido: grav.ok, gravErro: grav.erro };
        });
      });
    },
    cache: function () { return this._get("/sinapi/listar").then(function (j) { return (j && j.cache) || []; }).catch(function () { return []; }); },
    oficial: function () { return this._get("/sinapi/listar-oficial").then(function (j) { return (j && j.meses) || []; }).catch(function () { return []; }); },

    /* Status geral: { online, atual, uf, cacheMeses[], ultimaCache, ultimaOficial, desatualizado } */
    verificar: function (uf) {
      uf = (uf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "MG") || "MG").toUpperCase();
      var self = this, atual = (typeof Sinapi !== "undefined" ? Sinapi.competencia : null);
      return this.online().then(function (on) {
        if (!on) return { online: false, atual: atual, uf: uf };
        return Promise.all([self.cache(), self.oficial()]).then(function (res) {
          var cacheMeses = res[0].filter(function (c) { return c.uf === uf && c.tipo === "composicoes"; }).map(function (c) { return c.mes; }).sort();
          var oficiais = res[1].map(function (m) { return m.mes; }).sort();
          var ultimaCache = cacheMeses[cacheMeses.length - 1] || null;
          var ultimaOficial = oficiais[oficiais.length - 1] || null;
          var ultima = ultimaOficial || ultimaCache;
          return {
            online: true, atual: atual, uf: uf, cacheMeses: cacheMeses,
            ultimaCache: ultimaCache, ultimaOficial: ultimaOficial,
            desatualizado: !!(ultima && atual && String(ultima) > String(atual))
          };
        });
      });
    },

    /* Baixa (se preciso) + carrega a competência no Sinapi e salva por empresa. Retorna nº de itens. */
    baixar: function (mes, uf, jaCache) {
      uf = (uf || "MG").toUpperCase(); var self = this;
      var pegar = function () {
        return self._get("/sinapi/dados?mes=" + encodeURIComponent(mes) + "&uf=" + encodeURIComponent(uf) + "&tipo=composicoes").then(function (pacote) {
          if (typeof Sinapi !== "undefined") Sinapi.carregarDe(pacote);
          var grav = { ok: true };
          if (typeof Store !== "undefined" && typeof Auth !== "undefined") grav = Store.salvarBaseSinapi(Auth.empresaId(), pacote) || { ok: true };
          var total = (pacote && pacote.count) || (pacote && pacote.dados ? pacote.dados.length : 0);
          return { total: total, persistido: !!grav.ok, gravErro: grav.erro || "" };
        });
      };
      if (jaCache) return pegar();
      return fetch(BACKEND + "/sinapi/baixar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes: mes, uf: uf }) })
        .then(function (r) { if (!r.ok) throw new Error("baixar HTTP " + r.status); return r.json(); })
        .then(pegar);
    }
  };

  global.Atualizacao = Atualizacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Atualizacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

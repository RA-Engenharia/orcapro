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

    /* ================================================================
     * v1.1.122 — CENTRAL DE ATUALIZAÇÃO DE BASES (servidor OrçaPRO)
     * O VPS informa em /api/bases-status a competência mais recente de
     * cada banco; daqui o app atualiza a SINAPI com 1 clique (ou sozinho,
     * 1×/dia) e responde com honestidade quando NÃO há nada novo.
     * ================================================================ */

    /* Competências vêm em dois formatos históricos ("2026-06" e "06/2026"). */
    _normComp: function (c) {
      var m = String(c || "").match(/^(\d{2})\/(\d{4})$/);
      return m ? m[2] + "-" + m[1] : String(c || "");
    },
    fmtComp: function (c) {
      var m = String(this._normComp(c)).match(/^(\d{4})-(\d{2})$/);
      return m ? m[2] + "/" + m[1] : (String(c || "") || "—");
    },
    fmtData: function (iso) {
      var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
    },

    /* Consulta o status dos bancos no servidor OrçaPRO (VPS). */
    statusServidor: function () {
      return fetch(CONFIG.licencaServer + "/api/bases-status", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    },

    /* A base persistida da empresa é uma base PRÓPRIA (importada pelo cliente,
     * preços negociados)? A atualização oficial NUNCA passa por cima dela.
     * Só a base gravada pela própria atualização (flag _origem) é substituível. */
    _basePropriaDoCliente: function () {
      try {
        var b = (typeof Store !== "undefined" && Store.lerBaseSinapi) ? Store.lerBaseSinapi(Auth.empresaId()) : null;
        return !!(b && b.dados && b.dados.length && b._origem !== "atualizacao-oficial");
      } catch (eB) { return false; }
    },

    /* Atualiza a base SINAPI da UF ativa para a competência do servidor.
     * cb({ok, atualizou, de, para, publicadoEm, itens, erro, basePropria}) */
    atualizarSinapi: function (cb) {
      var self = this;
      var uf = String((global.App && global.App._baseUf) || Sinapi.uf || CONFIG.sinapi.ufPadrao).toUpperCase();
      // Base própria importada: proteger SEMPRE (achado do gate — o auto-update
      // destruía a tabela negociada da empresa sem confirmação).
      if (self._basePropriaDoCliente()) {
        cb({ ok: true, atualizou: false, basePropria: true, de: self._normComp(Sinapi.competencia) });
        return;
      }
      // token anti-corrida: se o usuário TROCAR de estado enquanto a atualização
      // baixa, aborta em vez de comitar a base da UF antiga por cima da nova
      var reqA = (global.App && global.App._ufReq != null) ? global.App._ufReq : null;
      var ufMudou = function () { return global.App && reqA !== null && global.App._ufReq !== reqA; };
      self.statusServidor().then(function (st) {
        var srv = st && st.sinapi;
        if (!srv || !srv.competencia) { cb({ ok: false, erro: "o servidor não informou a SINAPI" }); return; }
        var local = self._normComp(Sinapi.competencia);
        if (String(srv.competencia) <= String(local)) {
          cb({ ok: true, atualizou: false, de: local, para: srv.competencia, publicadoEm: srv.publicadoEm });
          return;
        }
        var url = CONFIG.licencaServer + "/analitico/sinapi-" + uf + "-" + srv.competencia + ".json";
        fetch(url, { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (j) {
          if (ufMudou()) { cb({ ok: false, erro: "você trocou de estado durante o download — verifique de novo" }); return; }
          // mesmo rigor do fallback de UF: só pacote VÁLIDO toca a base carregada
          if (!(j && j.dados && j.dados.length > 0 && String(j.uf || "").toUpperCase() === uf)) throw new Error("pacote do servidor inválido");
          j._origem = "atualizacao-oficial"; // marca substituível pela PRÓXIMA atualização (≠ base própria)
          Sinapi.carregarDe(j);
          try { if (typeof Store !== "undefined" && Store.salvarBaseSinapi) Store.salvarBaseSinapi(Auth.empresaId(), j); } catch (eP) {}
          if (global.App) {
            global.App._baseUf = uf;
            // Detalhamento acompanha a competência nova: o analítico LOCAL do pacote
            // é da competência embarcada — quando o servidor está à frente, o
            // detalhamento passa a vir do VPS (achado do gate: unitário 2026-07 com
            // insumos 2026-06 não fechava).
            if (String(srv.competencia) > String(CONFIG.sinapi.competenciaPadrao || "")) {
              global.App._analiticoArquivo = CONFIG.licencaServer + "/analitico/sinapi-" + uf + "-analitico.json";
            }
            if (typeof Analitico !== "undefined" && Analitico.reset) Analitico.reset();
          }
          cb({ ok: true, atualizou: true, de: local, para: srv.competencia, publicadoEm: srv.publicadoEm, itens: Sinapi.resumo().total });
        }).catch(function (e) {
          cb({ ok: false, erro: "não consegui baixar a base nova (" + ((e && e.message) || "falha") + ") — a atual foi mantida" });
        });
      }).catch(function (e) {
        cb({ ok: false, erro: "sem conexão com o servidor OrçaPRO (" + ((e && e.message) || "") + ")" });
      });
    },

    /* Checagem automática silenciosa 1×/dia (regra da casa: nunca pedir pra
     * atualizar — atualiza sozinho e só informa o que fez).
     * Achados do gate: (a) só marca o dia APÓS uma resposta ok — falha de rede
     * no boot re-tenta na próxima abertura; (b) não roda sem sessão (tenant
     * "default") nem na vitrine demo. */
    checarAuto: function () {
      var self = this;
      try {
        if (typeof Auth === "undefined" || !Auth.usuario()) return;
        if (global.App && global.App._demo) return;
        var hoje = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem("orcapro:bases:check") === hoje) return;
      } catch (eL) { return; }
      self.atualizarSinapi(function (r) {
        if (r && r.ok) { try { localStorage.setItem("orcapro:bases:check", new Date().toISOString().slice(0, 10)); } catch (eM) {} }
        if (r && r.ok && r.atualizou && typeof UI !== "undefined") {
          UI.toast("Base SINAPI atualizada sozinha: competência " + self.fmtComp(r.de) + " → " + self.fmtComp(r.para) + " (" + (r.itens || 0).toLocaleString("pt-BR") + " itens).", "ok");
        }
      });
    },

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

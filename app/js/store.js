/* =====================================================================
 * store.js — Camada de persistência com adapter trocável
 * Hoje: localStorage namespaced + migração versionada + autosave idempotente.
 * Amanhã (SaaS): basta implementar o mesmo contrato em FirebaseAdapter.
 * Namespace: orcapro:<empresaId>:<entidade>
 * ===================================================================== */
(function (global) {
  "use strict";

  var NS = "orcapro";

  function chave(empresaId, entidade) {
    return NS + ":" + (empresaId || "default") + ":" + entidade;
  }

  /* ---------- Adapter local (localStorage) ---------- */
  var LocalAdapter = {
    ler: function (empresaId, entidade, fallback) {
      try {
        var raw = localStorage.getItem(chave(empresaId, entidade));
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[store] leitura corrompida em", entidade, e);
        return fallback;
      }
    },
    gravar: function (empresaId, entidade, valor) {
      try {
        localStorage.setItem(chave(empresaId, entidade), JSON.stringify(valor));
        return true;
      } catch (e) {
        console.error("[store] falha ao gravar", entidade, e);
        return false;
      }
    },
    apagar: function (empresaId, entidade) {
      try { localStorage.removeItem(chave(empresaId, entidade)); return true; }
      catch (e) { return false; }
    }
  };

  /* ---------- Migrações versionadas ----------
   * Nunca apaga dados: transforma de uma versão de schema para a próxima.
   */
  function migrarOrcamento(o) {
    if (!o) return o;
    var v = o.schemaVersao || 1;
    // v1 -> v2: garante campos de BDI estruturado e desonerado
    if (v < 2) {
      o.desonerado = !!o.desonerado;
      if (!o.bdi || typeof o.bdi !== "object") o.bdi = { modeloId: "padrao", params: null, percentual: 0 };
      o.schemaVersao = 2;
    }
    // v2 -> v3: garante objetos cliente/obra/etapas (backups antigos podem não ter)
    if (v < 3) {
      if (!o.cliente || typeof o.cliente !== "object") o.cliente = { nome: "", doc: "", contato: "" };
      if (!o.obra || typeof o.obra !== "object") o.obra = { nome: "", local: "", regime: "Empreitada" };
      if (o.etapas == null) o.etapas = [];
      o.schemaVersao = 3;
    }
    return o;
  }

  /* ---------- API pública ---------- */
  var Store = {
    adapter: LocalAdapter,

    usarFirebase: function (firebaseAdapter) {
      // Ponto de extensão para o SaaS. Implementar ler/gravar/apagar async-compat.
      this.adapter = firebaseAdapter;
    },

    // ----- Orçamentos -----
    listarOrcamentos: function (empresaId) {
      var lista = this.adapter.ler(empresaId, "orcamentos", []);
      lista = Util.arr(lista).map(migrarOrcamento);
      return lista;
    },

    salvarOrcamento: function (empresaId, orc) {
      orc.atualizadoEm = Util.agoraISO();
      var lista = this.listarOrcamentos(empresaId);
      var idx = -1;
      for (var i = 0; i < lista.length; i++) { if (lista[i].id === orc.id) { idx = i; break; } }
      if (idx >= 0) lista[idx] = orc; else lista.push(orc);
      var ok = this.adapter.gravar(empresaId, "orcamentos", lista);
      return ok ? orc : null; // null = falhou ao gravar (cota cheia) — caller deve avisar
    },

    obterOrcamento: function (empresaId, id) {
      var lista = this.listarOrcamentos(empresaId);
      for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
      return null;
    },

    excluirOrcamento: function (empresaId, id) {
      var lista = this.listarOrcamentos(empresaId).filter(function (o) { return o.id !== id; });
      this.adapter.gravar(empresaId, "orcamentos", lista);
    },

    // ----- CRUD genérico de entidades da Gestão (obras, clientes, contratos, medicoes, financeiro) -----
    listar: function (empresaId, entidade) { return Util.arr(this.adapter.ler(empresaId, entidade, [])); },
    obter: function (empresaId, entidade, id) {
      var l = this.listar(empresaId, entidade);
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return null;
    },
    salvar: function (empresaId, entidade, obj) {
      if (!obj.id) obj.id = Util.uid(entidade.slice(0, 3));
      obj.atualizadoEm = Util.agoraISO();
      if (!obj.criadoEm) obj.criadoEm = obj.atualizadoEm;
      var l = this.listar(empresaId, entidade), i = -1;
      for (var k = 0; k < l.length; k++) if (l[k].id === obj.id) { i = k; break; }
      if (i >= 0) l[i] = obj; else l.push(obj);
      return this.adapter.gravar(empresaId, entidade, l) ? obj : null;
    },
    excluir: function (empresaId, entidade, id) {
      var l = this.listar(empresaId, entidade).filter(function (x) { return x.id !== id; });
      this.adapter.gravar(empresaId, entidade, l);
    },

    // ----- Preferências/empresa -----
    lerPrefs: function (empresaId) { return this.adapter.ler(empresaId, "prefs", {}); },
    salvarPrefs: function (empresaId, prefs) { this.adapter.gravar(empresaId, "prefs", prefs); },

    // ----- Base SINAPI personalizada da empresa (importada) -----
    lerBaseSinapi: function (empresaId) { return this.adapter.ler(empresaId, "sinapi_base", null); },
    temBaseSinapi: function (empresaId) {
      var b = this.lerBaseSinapi(empresaId);
      return !!(b && b.dados && b.dados.length);
    },
    salvarBaseSinapi: function (empresaId, pacote) {
      // Base grande pode estourar a cota do localStorage — devolve {ok, erro}.
      var okGravou = this.adapter.gravar(empresaId, "sinapi_base", pacote);
      return okGravou ? { ok: true } : { ok: false, erro: "Cota de armazenamento excedida — base mantida só nesta sessão." };
    },
    apagarBaseSinapi: function (empresaId) { this.adapter.apagar(empresaId, "sinapi_base"); },

    // ----- Saúde / observabilidade -----
    saude: function (empresaId) {
      var orcs = this.listarOrcamentos(empresaId);
      var bytes = 0;
      try {
        for (var k in localStorage) {
          if (localStorage.hasOwnProperty(k) && k.indexOf(NS + ":") === 0) {
            bytes += (localStorage.getItem(k) || "").length;
          }
        }
      } catch (e) {}
      return { orcamentos: orcs.length, tamanhoKB: Math.round(bytes / 1024), schemaVersao: CONFIG.schemaVersao };
    }
  };

  global.Store = Store;
})(window);

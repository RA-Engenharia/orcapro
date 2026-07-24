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
        // LOTE 1: falha de gravação NUNCA é silenciosa — o usuário precisa saber
        // que a última alteração não persistiu (antes só ia p/ o console).
        var cota = e && (e.name === "QuotaExceededError" || e.code === 22);
        try {
          if (global.UI && global.UI.toast) global.UI.toast(cota
            ? "⚠ Armazenamento CHEIO — a última alteração NÃO foi salva. Faça 💾 Backup e remova bases não usadas em 🗂 Tabelas."
            : "⚠ Falha ao salvar \"" + entidade + "\" — a última alteração não persistiu.", "erro");
        } catch (e2) {}
        return false;
      }
    },
    apagar: function (empresaId, entidade) {
      try { localStorage.removeItem(chave(empresaId, entidade)); return true; }
      catch (e) { return false; }
    }
  };

  /* ---------- Blobs GRANDES (IndexedDB) ----------
   * A base SINAPI enriquecida (~3 MB) e as bases extras estouram a cota de
   * ~5 MB do localStorage (QuotaExceededError). Ficam no IndexedDB (sem esse
   * limite), com espelho EM MEMÓRIA p/ os callers continuarem síncronos.
   * Migra automaticamente qualquer valor legado que esteja no localStorage.
   */
  var BIG = ["sinapi_base", "bases_extras"];
  var _big = {};        // chave -> valor (espelho em memória)
  var _bigInit = {};    // empresaId -> Promise (idempotente)
  function idbHas() { return typeof Idb !== "undefined" && Idb.disponivel(); }
  function primeUma(empresaId, entidade) {
    var k = chave(empresaId, entidade), legado = null;
    try { var raw = localStorage.getItem(k); if (raw) legado = JSON.parse(raw); } catch (e) {}
    if (legado != null) { // migra legado do localStorage p/ IDB e libera a cota
      _big[k] = legado;
      if (idbHas()) Idb.set(k, legado).then(function () { try { localStorage.removeItem(k); } catch (e) {} }).catch(function () {});
      return Promise.resolve();
    }
    if (!idbHas()) return Promise.resolve();
    return Idb.get(k).then(function (v) { if (v != null) _big[k] = v; }).catch(function () {});
  }

  /* ---------- Migrações versionadas ----------
   * Nunca apaga dados: transforma de uma versão de schema para a próxima.
   */
  // LOTE 1: toda migração fica registrada (suporte consegue reconstituir o histórico)
  function logMigracao(de, para, orcId) {
    try {
      var k = NS + ":migracoes";
      var arr = JSON.parse(localStorage.getItem(k) || "[]");
      arr.push({ de: de, para: para, orc: orcId || "", em: new Date().toISOString() });
      if (arr.length > 200) arr = arr.slice(-200); // teto p/ não crescer sem fim
      localStorage.setItem(k, JSON.stringify(arr));
    } catch (e) {}
  }

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
    if (o.schemaVersao !== v) logMigracao(v, o.schemaVersao, o.id);
    return o;
  }

  /* ---------- API pública ---------- */
  var Store = {
    adapter: LocalAdapter,

    // Prime o cache em memória dos blobs grandes (chamar no boot antes de ler a base).
    initBigStore: function (empresaId) {
      if (_bigInit[empresaId]) return _bigInit[empresaId];
      _bigInit[empresaId] = Promise.all(BIG.map(function (ent) { return primeUma(empresaId, ent); })).then(function () { return true; });
      return _bigInit[empresaId];
    },
    _bigGet: function (empresaId, entidade) { return _big[chave(empresaId, entidade)]; },
    _bigSet: function (empresaId, entidade, valor) {
      var k = chave(empresaId, entidade);
      _big[k] = valor; // espelho síncrono (vale nesta sessão mesmo se o IDB falhar)
      // LOTE 1: devolve Promise<bool> amarrada ao COMMIT real do IndexedDB
      // (Idb.set agora resolve no tx.oncomplete) e avisa o usuário na falha —
      // antes retornava true incondicional e a falha morria no console.
      var p = idbHas() ? Idb.set(k, valor) : Promise.reject(new Error("IndexedDB indisponível"));
      p = p.then(function () { return true; }).catch(function (e) {
        console.error("[store] FALHA ao persistir " + entidade + ":", e && e.message);
        try {
          if (global.UI && global.UI.toast) global.UI.toast("⚠ Não consegui salvar \"" + entidade + "\" no disco — os dados valem só até fechar o app. Faça 💾 Backup agora!", "erro");
        } catch (e2) {}
        return false;
      });
      try { localStorage.removeItem(k); } catch (e) {} // nunca deixa cópia grande no localStorage
      return p;
    },
    _bigDel: function (empresaId, entidade) {
      var k = chave(empresaId, entidade); delete _big[k];
      if (idbHas()) Idb.del(k).catch(function () {});
      try { localStorage.removeItem(k); } catch (e) {}
    },

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

    /* ---- Preços de insumo informados PELO USUÁRIO ----
     * O SINAPI publica em branco o que não coletou na região. Quando isso
     * acontece, o usuário cota e informa o preço dele — que fica guardado por
     * EMPRESA (código do insumo → preço) e vale para toda composição que usa o
     * insumo. É cotação própria: os entregáveis marcam "informado por você". */
    precosInsumos: function (empresaId) {
      var m = this.adapter.ler(empresaId, "precosinsumos", {});
      return (m && typeof m === "object" && !Array.isArray(m)) ? m : {};
    },
    salvarPrecoInsumo: function (empresaId, codigo, preco) {
      var m = this.precosInsumos(empresaId);
      var cod = String(codigo);
      if (preco == null || !(Number(preco) > 0)) delete m[cod];
      else m[cod] = { preco: Math.round(Number(preco) * 100) / 100, em: Util.agoraISO() };
      this.adapter.gravar(empresaId, "precosinsumos", m);
      return m[cod] || null;
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

    // ----- Base SINAPI personalizada da empresa (importada/atualizada) — IndexedDB -----
    lerBaseSinapi: function (empresaId) { return this._bigGet(empresaId, "sinapi_base") || null; },
    temBaseSinapi: function (empresaId) {
      var b = this.lerBaseSinapi(empresaId);
      return !!(b && b.dados && b.dados.length);
    },
    salvarBaseSinapi: function (empresaId, pacote) {
      // Agora no IndexedDB (sem a cota de ~5MB do localStorage) — não estoura mais.
      this._bigSet(empresaId, "sinapi_base", pacote);
      return { ok: true };
    },
    apagarBaseSinapi: function (empresaId) { this._bigDel(empresaId, "sinapi_base"); },
    // ----- Bases extras (multi-base: SICRO/SETOP/… + própria) — também grandes, IndexedDB -----
    lerBasesExtras: function (empresaId) { return this._bigGet(empresaId, "bases_extras") || []; },
    salvarBasesExtras: function (empresaId, payload) { this._bigSet(empresaId, "bases_extras", payload); return true; },

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
      // usoPct: estimativa sobre a cota típica de ~5M chars do localStorage —
      // base p/ o aviso de boot (>80%) que evita o QuotaExceeded silencioso.
      var usoPct = Math.min(100, Math.round(bytes / (5 * 1024 * 1024) * 100));
      var migr = [];
      try { migr = JSON.parse(localStorage.getItem(NS + ":migracoes") || "[]"); } catch (e) {}
      return { orcamentos: orcs.length, tamanhoKB: Math.round(bytes / 1024), usoPct: usoPct, migracoes: migr.length, schemaVersao: CONFIG.schemaVersao };
    }
  };

  global.Store = Store;
})(window);

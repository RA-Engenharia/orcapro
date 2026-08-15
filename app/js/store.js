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

    /* LÁPIDES (v1.1.126) — o merge da nuvem une as listas por id, então um registro
     * apagado num aparelho VOLTAVA quando o outro aparelho sincronizava a lista antiga.
     * Toda exclusão passa a deixar uma lápide (entidade + id + quando), que a nuvem
     * sincroniza e usa para descartar o ressuscitado. Guarda as 3.000 mais recentes. */
    _LAPIDES_MAX: 3000,
    /* Entidades IMUNES à cascata de obra: são cadastros da EMPRESA que a exclusão apenas
     * DESVINCULA (perdem o obraId e continuam na lista). Sem esta lista o merge da nuvem
     * lia "obraId aponta pra obra morta" e apagava o colaborador/veículo/bem no outro
     * aparelho — exatamente o que o modal promete preservar. Achado do gate de 25/07. */
    /* "fiscal" entrou junto: a nota fiscal passou a ser vinculada a obra na
       triagem, e o merge da nuvem apagaria o DOCUMENTO ao ver o obraId de uma
       obra excluida — documento que a empresa e obrigada a guardar 5 anos. */
    /* v1.1.231 — folha, ponto e movimento de frota entram aqui junto com a
       correção da sincronização. Enquanto não sincronizavam, a cascata não os
       alcançava e o problema não existia; passando a sincronizar, o merge
       leria "obraId aponta pra obra morta" e apagaria PAGAMENTO FEITO e CARTÃO
       DE PONTO no outro aparelho. É o mesmo motivo que já mantém `faltas` e
       `horas_extras` fora da cascata: jornada e dinheiro são de PESSOA, não da
       obra — a obra some, o que se deve a alguém não some junto. */
    _IMUNES_CASCATA: { colaboradores: 1, patrimonio: 1, frota: 1, fiscal: 1,
                       folha: 1, fs_lancamentos: 1, fs_pagamentos: 1, ponto: 1, frota_mov: 1 },
    imuneACascata: function (entidade) { return !!this._IMUNES_CASCATA[entidade]; },
    /* A lápide só serve para o merge da nuvem: entidade que NÃO sincroniza nunca ressuscita,
     * e gravar lápide dela só gastava o teto — empurrando para fora as que importam. */
    _sincroniza: function (entidade) {
      var L = (typeof Nuvem !== "undefined" && Nuvem.ENTIDADES) ? Nuvem.ENTIDADES : null;
      return L ? L.indexOf(entidade) >= 0 : true; // sem a lista carregada, erra pelo lado seguro
    },
    lapidar: function (empresaId, entidade, id) {
      if (!empresaId || !entidade || !id) return;
      if (!this._sincroniza(entidade)) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, { id: entidade + ":" + id, ent: entidade, ref: String(id), em: Util.agoraISO() });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* Uma obra apagada em cascata deixa UMA lápide, não uma por registro: a cascata de uma
     * obra de 1 ano passa de 2.000 registros e o teto expulsava justamente as lápides das
     * entidades que sincronizam (elas vinham primeiro) — os diários e medições voltavam da
     * nuvem órfãos, com a obra já apagada. Achado do gate de 25/07. */
    lapidarObraEmCascata: function (empresaId, obraId) {
      if (!empresaId || !obraId) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, { id: "cascata:obra:" + obraId, cascata: "obra", ref: String(obraId), em: Util.agoraISO() });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* v1.1.232 — lápide ganha `atualizadoEm = em`. O merge da nuvem decide por
       atualizadoEm; a lápide só tinha `em`, então duas lápides do mesmo id
       empatavam ("" === "") e o LOCAL vencia sempre — a re-exclusão nunca
       propagava. Provado em Node: no ciclo excluir→recriar→excluir de entidade
       com id determinístico (peso de bloco, composição própria), o registro
       excluído ressuscitava no outro aparelho para sempre. Dar à lápide o
       campo que o merge já compara conserta sem tocar no merge. */
    _porLapide: function (l, nova) {
      nova.atualizadoEm = nova.em;
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === nova.id) { l[i].em = nova.em; l[i].atualizadoEm = nova.em; return; }
      l.push(nova);
    },
    /* poda pela DATA (não pela posição no array: depois do merge da nuvem a ordem não é
     * cronológica) e nunca descarta lápide de cascata, que vale por milhares */
    _podarLapides: function (l) {
      if (l.length <= this._LAPIDES_MAX) return l;
      var cascatas = [], simples = [];
      l.forEach(function (t) { if (t && t.cascata) cascatas.push(t); else if (t) simples.push(t); });
      simples.sort(function (a, b) { return String(a.em || "") < String(b.em || "") ? -1 : 1; });
      var sobra = Math.max(0, this._LAPIDES_MAX - cascatas.length);
      return cascatas.concat(simples.slice(simples.length - sobra));
    },
    /* obras apagadas em cascata: { obraId: quando } — o merge da nuvem descarta por obraId.
     * Object.create(null): um registro com id "constructor"/"toString" era dado como
     * excluído por herança do protótipo. */
    cascatasDeObra: function (empresaId) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (t && t.cascata === "obra" && t.ref) m[t.ref] = t.em || "";
        });
      } catch (e) {}
      return m;
    },
    /* apaga vários de uma vez: 1 leitura + 1 gravação por entidade (a versão um-a-um
     * travava a aba por segundos numa obra grande). Devolve quantos SAÍRAM de fato — e 0
     * se a gravação falhar (cota cheia), senão o resumo final mentiria pro usuário. */
    excluirVarios: function (empresaId, entidade, ids, semLapide) {
      if (!ids || !ids.length) return 0;
      var alvo = Object.create(null);
      ids.forEach(function (i) { alvo[String(i)] = 1; });
      var antes = this.listar(empresaId, entidade);
      var l = antes.filter(function (x) { return !(x && alvo[String(x.id)]); });
      var saiu = antes.length - l.length;
      if (!this.adapter.gravar(empresaId, entidade, l)) return 0;
      if (!semLapide && saiu && this._sincroniza(entidade)) {
        // uma leitura/gravação só do bloco de lápides (o laço chamando lapidar era O(n²))
        try {
          var tl = Util.arr(this.adapter.ler(empresaId, "_lapides", [])), self = this, agora = Util.agoraISO();
          ids.forEach(function (i) { self._porLapide(tl, { id: entidade + ":" + i, ent: entidade, ref: String(i), em: agora }); });
          this.adapter.gravar(empresaId, "_lapides", this._podarLapides(tl));
        } catch (e) {}
      }
      return saiu;
    },
    /* mapa { id: quando } das exclusões de uma entidade — usado pelo merge da nuvem */
    lapidesDe: function (empresaId, entidade) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (t && t.ent === entidade && t.ref) m[t.ref] = t.em || "";
        });
      } catch (e) {}
      return m;
    },
    /* poda usada pelo merge da nuvem: sem isto o teto valia só nas exclusões locais e a
     * lista crescia sem fim quando dois aparelhos trocavam lápides. */
    podarLapidesDe: function (empresaId) {
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        if (l.length > this._LAPIDES_MAX) this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },

    excluirOrcamento: function (empresaId, id) {
      var lista = this.listarOrcamentos(empresaId).filter(function (o) { return o.id !== id; });
      this.adapter.gravar(empresaId, "orcamentos", lista);
      this.lapidar(empresaId, "orcamentos", id);
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
      this.lapidar(empresaId, entidade, id);
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

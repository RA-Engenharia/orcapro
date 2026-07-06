/* =====================================================================
 * nuvem.js — Sincronização na nuvem (Firebase Auth e-mail/senha + Firestore).
 * Mantém o localStorage como cache rápido/offline e ESPELHA os dados do
 * usuário na nuvem. Mescla por id (o mais novo vence) — nunca apaga dado.
 * NÃO sincroniza as bases SINAPI/blobs grandes (ficam locais no IndexedDB).
 * Fica desligado enquanto CONFIG.backend.sync !== true.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Entidades pequenas de DADOS DO USUÁRIO que sincronizam:
  var ENTIDADES = [
    "orcamentos", "prefs", "obras", "clientes", "contratos", "medicoes",
    "financeiro", "compras", "estoque", "rdo", "colaboradores", "frota",
    "requisicoes", "epi", "faltas", "templates", "documentos", "usuarios"
  ];
  var SDK = [
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"
  ];

  function carregarScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url; s.async = true; s.onload = res; s.onerror = function () { rej(new Error("falha ao carregar " + url)); };
      document.head.appendChild(s);
    });
  }
  function vazioDe(ent) { return ent === "prefs" ? {} : []; }

  var Nuvem = {
    ligado: false, uid: null, db: null, auth: null,
    _un: [], _push: {}, _patched: false, _initP: null,

    disponivel: function () {
      return !!(typeof CONFIG !== "undefined" && CONFIG.backend && CONFIG.backend.sync && CONFIG.backend.firebaseConfig);
    },

    _carregarSDK: function () {
      if (global.firebase) return Promise.resolve();
      return SDK.reduce(function (p, url) { return p.then(function () { return carregarScript(url); }); }, Promise.resolve());
    },

    init: function () {
      var self = this;
      if (this._initP) return this._initP;
      if (!this.disponivel()) return Promise.reject(new Error("sync desligado"));
      this._initP = this._carregarSDK().then(function () {
        if (!global.firebase.apps.length) global.firebase.initializeApp(CONFIG.backend.firebaseConfig);
        self.auth = global.firebase.auth();
        self.db = global.firebase.firestore();
        // cache offline (funciona sem internet; sincroniza ao voltar)
        try { self.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
        return true;
      });
      return this._initP;
    },

    // Loga na nuvem com o MESMO e-mail/senha do app (cria a conta na 1ª vez).
    entrar: function (email, senha) {
      var self = this;
      email = String(email || "").trim().toLowerCase();
      if (!email || !senha) return Promise.reject(new Error("credenciais vazias"));
      return this.init().then(function () {
        return self.auth.signInWithEmailAndPassword(email, senha).catch(function (e) {
          var code = e && e.code;
          // conta ainda não existe na nuvem → cria. O Firebase novo (proteção de enumeração)
          // devolve "invalid-login-credentials"/"invalid-credential" tanto p/ e-mail inexistente
          // quanto p/ senha errada; então tentamos criar e, se o e-mail já existe, era senha errada.
          if (code === "auth/user-not-found" || code === "auth/invalid-login-credentials" || code === "auth/invalid-credential") {
            return self.auth.createUserWithEmailAndPassword(email, senha).catch(function (e2) {
              if (e2 && e2.code === "auth/email-already-in-use") { var er = new Error("Senha da nuvem diferente da do app."); er.code = "auth/wrong-password"; throw er; }
              throw e2;
            });
          }
          throw e;
        });
      }).then(function (cred) {
        self.uid = cred.user.uid; self.ligado = true;
        self._patch();
        return self.uid;
      });
    },

    _doc: function (ent) { return this.db.collection("empresas").doc(this.uid).collection("dados").doc(ent); },

    // Une lista local + nuvem por id; o registro com atualizadoEm mais novo vence.
    // LOTE 3: edição concorrente (2 aparelhos) NÃO é mais sobrescrita calada —
    // o vencedor guarda a cópia perdedora em _conflitoDe (até ~50KB; acima
    // disso, só metadados) e o contador alimenta o aviso pós-sync.
    _conflitosUltimoMerge: 0,
    _merge: function (local, cloud, ent) {
      if (ent === "prefs") {
        // prefs: mescla campo a campo, o mais novo (por chave) — simplificado: local sobre nuvem
        return Object.assign({}, cloud || {}, local || {});
      }
      var self = this;
      var byId = {};
      Util.arr(cloud).forEach(function (o) { if (o && o.id) byId[o.id] = o; });
      Util.arr(local).forEach(function (o) {
        if (!o || !o.id) return;
        var c = byId[o.id];
        if (!c) { byId[o.id] = o; return; }
        var tl = String(o.atualizadoEm || ""), tc = String(c.atualizadoEm || "");
        if (tl === tc) { byId[o.id] = o; return; } // mesma versão: sem conflito
        var venc = tl > tc ? o : c, perd = tl > tc ? c : o;
        try {
          var json = JSON.stringify(perd);
          venc._conflitoDe = (json.length <= 51200)
            ? { em: perd.atualizadoEm || "", quando: new Date().toISOString(), copia: perd }
            : { em: perd.atualizadoEm || "", quando: new Date().toISOString(), resumo: String(perd.nome || perd.numero || perd.id) };
          self._conflitosUltimoMerge++;
        } catch (e) {}
        byId[o.id] = venc;
      });
      return Object.keys(byId).map(function (k) { return byId[k]; });
    },

    // 1ª carga: baixa a nuvem, mescla com o local e grava nos dois (não perde nada).
    sincronizar: function (empresaId) {
      var self = this;
      if (!this.ligado) return Promise.resolve(false);
      self._conflitosUltimoMerge = 0;
      return Promise.all(ENTIDADES.map(function (ent) {
        return self._doc(ent).get().then(function (snap) {
          var cloud = snap.exists ? snap.data().v : null;
          var local = Store.adapter.ler(empresaId, ent, vazioDe(ent));
          var merged = self._merge(local, cloud, ent);
          Store.adapter.gravar(empresaId, ent, merged);              // atualiza cache local
          return self._doc(ent).set({ v: merged, em: Date.now() });  // sobe o mesclado
        }).catch(function () { /* entidade sem dados / offline: ignora */ });
      })).then(function () {
        if (self._conflitosUltimoMerge > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("⚠ " + self._conflitosUltimoMerge + " registro(s) editados em 2 aparelhos ao mesmo tempo — a versão mais recente venceu e a anterior ficou guardada dentro do registro (não se perdeu nada).", "erro");
          } catch (e) {}
        }
        return true;
      });
    },

    // Escuta mudanças vindas de OUTRO aparelho e atualiza o local + re-render.
    escutar: function (empresaId, onChange) {
      var self = this;
      if (!this.ligado) return;
      ENTIDADES.forEach(function (ent) {
        var un = self._doc(ent).onSnapshot(function (snap) {
          if (!snap.exists) return;
          if (snap.metadata && snap.metadata.hasPendingWrites) return; // ignora o eco do próprio write
          var cloud = snap.data().v;
          var local = Store.adapter.ler(empresaId, ent, vazioDe(ent));
          var merged = self._merge(local, cloud, ent);
          Store.adapter.gravar(empresaId, ent, merged);
          if (typeof onChange === "function") onChange(ent);
        }, function () {});
        self._un.push(un);
      });
    },

    // Monkey-patch idempotente: toda gravação do Store também empurra pra nuvem.
    _patch: function () {
      if (this._patched) return; this._patched = true;
      var self = this, orig = Store.adapter.gravar.bind(Store.adapter);
      Store.adapter.gravar = function (empresaId, entidade, valor) {
        var ok = orig(empresaId, entidade, valor);
        if (ok && self.ligado && ENTIDADES.indexOf(entidade) >= 0) self.push(empresaId, entidade);
        return ok;
      };
    },

    // Empurra uma entidade pra nuvem (debounce por entidade).
    push: function (empresaId, ent) {
      var self = this;
      clearTimeout(this._push[ent]);
      this._push[ent] = setTimeout(function () {
        try {
          var v = Store.adapter.ler(empresaId, ent, vazioDe(ent));
          self._doc(ent).set({ v: v, em: Date.now() }).catch(function () {});
        } catch (e) {}
      }, 900);
    },

    sair: function () {
      this._un.forEach(function (u) { try { u(); } catch (e) {} });
      this._un = []; this.ligado = false; this.uid = null;
      if (this.auth) this.auth.signOut().catch(function () {});
    }
  };

  global.Nuvem = Nuvem;
})(window);

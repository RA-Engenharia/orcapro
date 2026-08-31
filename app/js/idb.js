/* =====================================================================
 * idb.js — KV mínimo sobre IndexedDB (promessas), p/ blobs GRANDES que
 * estouram a cota de ~5MB do localStorage (base SINAPI enriquecida, bases
 * extras). Sem dependências. Guarda o objeto direto (structured clone).
 * ===================================================================== */
(function (global) {
  "use strict";
  var DB = "orcapro-idb", STORE = "kv", VER = 1, _open = null;

  function open() {
    if (_open) return _open;
    _open = new Promise(function (res, rej) {
      try {
        if (!global.indexedDB) { rej(new Error("IndexedDB indisponível")); return; }
        var rq = global.indexedDB.open(DB, VER);
        rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error || new Error("open falhou")); };
      } catch (e) { rej(e); }
    });
    /* ⚠ UM open QUE FALHOU NÃO PODE FICAR GRAVADO PARA SEMPRE. `_open` guarda a
     * promessa, e uma promessa REJEITADA guardada aqui trancava o IndexedDB
     * para o resto da carga da página: a primeira falha (aba disputando o banco,
     * navegador ainda subindo o perfil, permissão que o usuário concede depois)
     * condenava todas as tentativas seguintes, mesmo já funcionando. Esquecer a
     * falha é o que permite a segunda chance. */
    _open["catch"](function () { _open = null; });
    return _open;
  }
  function os(mode) { return open().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); }); }
  function req(p) { return new Promise(function (res, rej) { p.onsuccess = function () { res(p.result); }; p.onerror = function () { rej(p.error); }; }); }

  // LOTE 1 (durabilidade): escrita SÓ confirma no oncomplete da TRANSAÇÃO.
  // O onsuccess do request dispara ANTES do commit — fechar o app nessa janela
  // perdia o dado mesmo com a Promise já resolvida.
  function mut(fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx, out;
        try { tx = db.transaction(STORE, "readwrite"); out = fn(tx.objectStore(STORE)); }
        catch (e) { rej(e); return; }
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror = function () { rej(tx.error || new Error("tx falhou")); };
        tx.onabort = function () { rej(tx.error || new Error("tx abortada")); };
      });
    });
  }

  var Idb = {
    /* ⚠ `disponivel` responde "a API existe", NÃO "dá para gravar". Janela
     * anônima e perfil com dado de site bloqueado expõem `indexedDB` e negam o
     * open. Quem for DECIDIR alguma coisa (o cache do BIM decide se guarda ou
     * não) tem de usar `pronto()`, que abre de verdade. */
    disponivel: function () { return !!global.indexedDB; },
    pronto: function () {
      if (!global.indexedDB) return Promise.resolve(false);
      return open().then(function () { return true; }, function () { return false; });
    },
    get: function (k) { return os("readonly").then(function (s) { return req(s.get(k)); }); },
    set: function (k, v) { return mut(function (s) { return s.put(v, k); }); },
    del: function (k) { return mut(function (s) { return s.delete(k); }); },

    /* ---------------------------------------------------------------
     * chaves(prefixo) — o banco é um KV plano, sem índice e sem namespace.
     *
     * Sem isto não existe LRU nem conserto de índice: o cache do BIM guarda um
     * índice separado (o que existe, tamanho, quando foi usado), e índice sem
     * como conferir contra a realidade apodrece — some uma entrada e o índice
     * continua prometendo que ela está lá.
     *
     * `getAllKeys` traz só as CHAVES, não os valores: varrer não carrega os
     * megabytes de geometria na memória.
     * ------------------------------------------------------------- */
    chaves: function (prefixo) {
      var p = String(prefixo == null ? "" : prefixo);
      return os("readonly").then(function (s) {
        if (!s.getAllKeys) return [];        /* navegador antigo: sem varredura */
        return req(s.getAllKeys()).then(function (ks) {
          return (ks || []).map(String).filter(function (k) { return !p || k.indexOf(p) === 0; });
        });
      });
    },

    /* ---------------------------------------------------------------
     * espaco() — quanto o navegador deu e quanto já foi usado, em bytes.
     *
     * ⚠ É ESTIMATIVA DO NAVEGADOR, e vale para a ORIGEM inteira (bases SINAPI,
     * fotos e cache do BIM no mesmo balde) — não é a conta deste banco. Serve
     * para avisar antes de encher, nunca para afirmar quanto cabe.
     * Devolve `null` quando o navegador não sabe responder, e quem chama
     * precisa tratar isso como "não sei", não como "tem espaço".
     * ------------------------------------------------------------- */
    espaco: function () {
      try {
        var st = global.navigator && global.navigator.storage;
        if (!st || !st.estimate) return Promise.resolve(null);
        return st.estimate().then(function (e) {
          if (!e || typeof e.quota !== "number") return null;
          return { cota: e.quota, usado: e.usage || 0, livre: Math.max(0, e.quota - (e.usage || 0)) };
        }, function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    }
  };

  global.Idb = Idb;
  if (typeof module !== "undefined" && module.exports) module.exports = Idb;
})(typeof window !== "undefined" ? window : this);

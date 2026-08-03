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
    disponivel: function () { return !!global.indexedDB; },
    get: function (k) { return os("readonly").then(function (s) { return req(s.get(k)); }); },
    set: function (k, v) { return mut(function (s) { return s.put(v, k); }); },
    del: function (k) { return mut(function (s) { return s.delete(k); }); }
  };

  global.Idb = Idb;
  if (typeof module !== "undefined" && module.exports) module.exports = Idb;
})(typeof window !== "undefined" ? window : this);

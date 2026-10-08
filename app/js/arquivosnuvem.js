/* =====================================================================
 * arquivosnuvem.js — cópia na nuvem (Cloudflare R2) dos arquivos da obra
 *
 * O arquivo continua morando PRIMEIRO no aparelho (IndexedDB): abre na hora
 * e funciona sem sinal, que é o normal de uma obra. Esta camada acrescenta a
 * cópia na nuvem, para que o OUTRO aparelho da empresa abra o mesmo arquivo
 * (antes ele só dizia "não está neste computador").
 *
 * Servidor: server/vps/arquivos-srv.js (rotas /api/arquivos/*). O espaço é
 * por empresa e vem no plano (PRO 2 GB, PLUS 20 GB, BIM 100 GB).
 *
 * A REFERÊNCIA é a própria chave do IndexedDB (ex.: docobra:<emp>:<obra>:…).
 * O servidor tira o id dela (sha256 → 24 hex), e aqui fazemos a mesma conta.
 * Assim nenhum aparelho precisa de uma lista sincronizada a mais para saber
 * onde o arquivo está.
 *
 * Sem internet o envio entra numa FILA (localStorage: sobrevive a fechar o
 * app) e anda sozinho quando a rede volta. Os bytes não vão para a fila; são
 * relidos do IndexedDB na hora de subir.
 * ===================================================================== */
(function (global) {
  "use strict";

  var FILA = "orcapro:arquivos:fila";

  function srv() {
    try { return (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : ""; }
    catch (e) { return ""; }
  }
  function chaveLic() {
    try { return (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : ""; } catch (e) { return ""; }
  }
  function demo() { try { return !!(typeof App !== "undefined" && App._demo); } catch (e) { return false; } }
  function lerFila() { try { return JSON.parse(localStorage.getItem(FILA) || "[]"); } catch (e) { return []; } }
  function gravarFila(f) { try { localStorage.setItem(FILA, JSON.stringify(f.slice(-500))); } catch (e) {} }

  var ArquivosNuvem = {
    /* liga quando há servidor, licença paga e não é a vitrine */
    ativo: function () { return !!(srv() && chaveLic() && !demo() && typeof fetch !== "undefined"); },

    idDe: function (ref) { return Util.sha256hex(String(ref || "")).slice(0, 24); },

    /* sobe UM arquivo; se falhar por rede, vai para a fila. Nunca rejeita:
       a cópia na nuvem não pode atrapalhar quem acabou de guardar o arquivo. */
    subir: function (ref, meta, bytes) {
      var self = this;
      if (!this.ativo() || !ref || !meta || !meta.obraId) return Promise.resolve({ ok: false, pulado: true });
      var url = srv() + "/api/arquivos/enviar?obra=" + encodeURIComponent(meta.obraId) +
        "&pasta=" + encodeURIComponent(meta.pasta || "documentos") +
        "&nome=" + encodeURIComponent(meta.nome || "arquivo") + "&ref=" + encodeURIComponent(ref);
      return fetch(url, { method: "POST", headers: { "x-licenca": chaveLic(), "Content-Type": meta.tipo || "application/octet-stream" }, body: bytes })
        .then(function (r) { return r.json().then(function (j) { j.status = r.status; return j; }); })
        .then(function (j) {
          if (j && j.ok) { self._tirarDaFila(ref); self._ultimoUso = { uso: j.uso, limite: j.limite }; return j; }
          /* espaço cheio (507) ou arquivo grande (413): não adianta tentar de novo sozinho */
          if (j && (j.status === 507 || j.status === 413)) {
            self._tirarDaFila(ref);
            try { UI.toast("Guardado neste aparelho, mas não subiu para a nuvem: " + (j.erro || "sem espaço."), "erro"); } catch (e) {}
            return j;
          }
          self._enfileirar(ref, meta); return j || { ok: false };
        }, function () { self._enfileirar(ref, meta); return { ok: false, naFila: true }; });
    },

    /* baixa da nuvem (outro aparelho); devolve Uint8Array ou rejeita */
    baixar: function (ref) {
      if (!this.ativo()) return Promise.reject(new Error("sem nuvem"));
      return fetch(srv() + "/api/arquivos/baixar/" + this.idDe(ref), { headers: { "x-licenca": chaveLic() } })
        .then(function (r) {
          if (!r.ok) { var e = new Error(r.status === 404 ? "o arquivo ainda não subiu para a nuvem" : "não consegui baixar agora"); e.codigo = r.status; throw e; }
          return r.arrayBuffer();
        }).then(function (ab) { return new Uint8Array(ab); });
    },

    uso: function () {
      if (!this.ativo()) return Promise.resolve(null);
      return fetch(srv() + "/api/arquivos/uso", { headers: { "x-licenca": chaveLic() } })
        .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
    },

    _enfileirar: function (ref, meta) {
      var f = lerFila().filter(function (x) { return x.ref !== ref; });
      f.push({ ref: ref, meta: meta, em: Date.now() }); gravarFila(f);
    },
    _tirarDaFila: function (ref) { gravarFila(lerFila().filter(function (x) { return x.ref !== ref; })); },

    /* anda a fila: relê os bytes do IndexedDB; se o arquivo sumiu do aparelho, sai da fila */
    processarFila: function () {
      var self = this;
      if (this._andando || !this.ativo() || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      var f = lerFila(); if (!f.length || typeof Idb === "undefined") return;
      this._andando = true;
      var i = 0;
      (function prox() {
        if (i >= f.length) { self._andando = false; return; }
        var it = f[i++];
        Idb.get(it.ref).then(function (v) {
          if (!v || !v.dados) { self._tirarDaFila(it.ref); return prox(); }
          return self.subir(it.ref, it.meta, new Uint8Array(v.dados)).then(prox, prox);
        }, prox);
      })();
    },

    iniciar: function () {
      var self = this;
      if (this._iniciado) return; this._iniciado = true;
      try { global.addEventListener("online", function () { self.processarFila(); }); } catch (e) {}
      setInterval(function () { self.processarFila(); }, 120000);
      setTimeout(function () { self.processarFila(); }, 15000);
    }
  };

  global.ArquivosNuvem = ArquivosNuvem;
  if (typeof module !== "undefined" && module.exports) module.exports = ArquivosNuvem;
  try { if (typeof window !== "undefined") ArquivosNuvem.iniciar(); } catch (e) {}
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

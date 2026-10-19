/* =====================================================================
 * memvigia.js — VIGIA DA MEMÓRIA DA PÁGINA (19/10/2026, 1.2.158).
 *
 * ⚠ ROTEIRO DO DEFEITO. Em 19/10/2026 o Edge derrubou o OrçaPRO do Rogério 17 vezes com "Esta página está com
 * problemas — Out of Memory": a memória do JavaScript da página chegava a 4 GB (o teto do Edge por aba) em ~10–14 min
 * de uso. Os registros de queda do Edge (Crashpad) não dizem QUEM cresceu; uma cópia dos dados dele, parada, fica em
 * ~100 MB; e o Edge não deixa depurar o perfil principal. A 1.2.157 tirou a volta do SDK da nuvem com documento acima
 * de 1 MiB — e a queda continuou (20:06, 12 min depois de atualizar). O que cresce só aparece no USO REAL.
 *
 * Por isso este vigia faz duas coisas, sem mexer em dado nenhum:
 *  1. MEDE a cada INTERVALO_MS: memória usada/limite (performance.memory, do Chromium), a tela (App.view) e o
 *     tamanho das estruturas que já foram suspeitas (cena do BIM, espelho do Store, nuvem, DOM) — e manda para o
 *     servidor LOCAL (/__diag/memoria → <pasta padrão>/diag/memoria-AAAA-MM-DD.jsonl). Nada sai do PC.
 *  2. PROTEGE: passou de FRACAO_RECARREGAR do limite, grava o pendente do BIM, avisa e RECARREGA a página antes de o
 *     Edge derrubá-la (o que se perde é só o estado da tela; a queda perderia o mesmo, sem aviso). Uma vez a cada
 *     JANELA_ANTI_LACO_MS no máximo — se voltar a encher logo depois, só avisa (nunca recarrega em laço).
 * Sem performance.memory (Firefox, Safari) não faz nada.
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE_RECARGA = "orcapro:memvigia:recarga";
  var V = {
    INTERVALO_MS: 20000,
    FRACAO_RECARREGAR: 0.62,
    ESPERA_RECARREGAR_MS: 6000,
    JANELA_ANTI_LACO_MS: 10 * 60 * 1000,
    _t: null, _seq: 0, _recarregando: false, _avisouLaco: false, _inicio: 0,

    medir: function () {
      var pm = global.performance && global.performance.memory;
      if (!pm || !pm.jsHeapSizeLimit) return null;
      return { usadoMB: Math.round(pm.usedJSHeapSize / 1048576), totalMB: Math.round(pm.totalJSHeapSize / 1048576), limiteMB: Math.round(pm.jsHeapSizeLimit / 1048576) };
    },
    /* contadores BARATOS (nada que percorra a cena ou serialize lista grande) */
    contadores: function () {
      var c = {}, d = global.document;
      try { c.tela = global.App ? String(global.App.view || "") : ""; } catch (e) {}
      try { if (d) { c.dom = d.getElementsByTagName("*").length; c.canvas = d.getElementsByTagName("canvas").length; c.iframes = d.getElementsByTagName("iframe").length; } } catch (e) {}
      try { var B = global.BIM; if (B) { c.bimOps = B.editarOps ? B.editarOps().length : -1; c.bimModelos = (B.modelos || []).length; } } catch (e) {}
      try { var G = global.Gestao; if (G) { c.bimSel = String(G._bimSel || ""); c.bimElementos = (G._bimElementos || []).length; } } catch (e) {}
      try {
        var esp = global.Store && global.Store._d && global.Store._d.esp;
        if (esp) { var n = 0, ch = 0; for (var k in esp) if (Object.prototype.hasOwnProperty.call(esp, k)) { n++; ch += (esp[k] && esp[k].raw) ? esp[k].raw.length : 0; } c.storeChaves = n; c.storeMB = Math.round(ch / 1048576); }
      } catch (e) {}
      try { var N = global.Nuvem; if (N) { c.nuvemLigada = !!N.ligado; c.nuvemFalhas = (N._falhas || []).length; c.nuvemOuvintes = (N._un || []).length; } } catch (e) {}
      try { var A = global.Analitico; if (A) { c.analitico = !!A.carregado; c.analiticoComp = String(A.competencia || ""); } } catch (e) {}
      try { if (global.Carregar && global.Carregar._grupos) c.grupos = Object.keys(global.Carregar._grupos).join(","); } catch (e) {}
      return c;
    },
    enviar: function (a) {
      try {
        var loc = global.location;
        if (!loc || !/^(localhost|127\.0\.0\.1)$/.test(loc.hostname) || typeof global.fetch !== "function") return;
        global.fetch("/__diag/memoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a), keepalive: true })["catch"](function () {});
      } catch (e) {}
    },
    _lerRecarga: function () { try { return +(global.sessionStorage.getItem(CHAVE_RECARGA) || 0); } catch (e) { return 0; } },
    _gravarRecarga: function (t) { try { global.sessionStorage.setItem(CHAVE_RECARGA, String(t)); } catch (e) {} },
    agora: function () { return Date.now(); },
    tick: function () {
      var m = this.medir(); if (!m) return null;
      var a = { em: new Date(this.agora()).toISOString(), seq: ++this._seq, segDesdeAbrir: Math.round((this.agora() - this._inicio) / 1000), m: m, c: this.contadores() };
      try { a.versao = global.CONFIG && global.CONFIG.versao; } catch (e) {}
      var fr = m.limiteMB ? m.usadoMB / m.limiteMB : 0;
      if (fr >= this.FRACAO_RECARREGAR) a.alerta = this.proteger(m) || "alto";
      this.enviar(a);
      return a;
    },
    /* devolve o que fez: "recarregando" | "so-aviso" | null */
    proteger: function (m) {
      if (this._recarregando) return "recarregando";
      var ult = this._lerRecarga(), t = this.agora();
      var toast = function (msg) { try { if (global.UI && global.UI.toast) global.UI.toast(msg, "aviso", 9000); } catch (e) {} };
      if (ult && t - ult < this.JANELA_ANTI_LACO_MS) {
        if (!this._avisouLaco) { this._avisouLaco = true; toast("A memória desta página está alta de novo (" + m.usadoMB + " MB). Salve o que estiver fazendo e recarregue (F5) quando puder."); }
        return "so-aviso";
      }
      this._recarregando = true;
      this._gravarRecarga(t);
      try { if (global.Gestao && global.Gestao._bimEdFlush) global.Gestao._bimEdFlush(); } catch (e) {}
      toast("A memória desta página chegou a " + m.usadoMB + " MB. O OrçaPRO vai salvar e recarregar em " + Math.round(this.ESPERA_RECARREGAR_MS / 1000) + " s para não cair. Seus dados ficam.");
      var self = this;
      (global.setTimeout || setTimeout)(function () { try { if (global.Gestao && global.Gestao._bimEdFlush) global.Gestao._bimEdFlush(); } catch (e) {} self.recarregar(); }, this.ESPERA_RECARREGAR_MS);
      return "recarregando";
    },
    recarregar: function () { try { global.location.reload(); } catch (e) {} },
    iniciar: function () {
      if (this._t || !this.medir()) return false;
      var self = this; this._inicio = this.agora();
      this._t = (global.setInterval || setInterval)(function () { try { self.tick(); } catch (e) {} }, this.INTERVALO_MS);
      return true;
    }
  };
  global.MemVigia = V;
  if (global.document && global.setTimeout) global.setTimeout(function () { V.iniciar(); }, 5000);
})(typeof window !== "undefined" ? window : this);

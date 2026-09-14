/* =====================================================================
 * OrçaPRO — janelas.js
 * Abrir uma aba do orçamento (Planilha, Cronograma, Gráficos…) numa JANELA
 * SEPARADA do navegador, para arrastar ao segundo monitor e editar/conferir
 * em tempo real.
 *
 * Como o "tempo real" funciona: cada janela roda o seu próprio App na MESMA
 * origem e no MESMO localStorage. O que uma grava chega à outra pelo evento
 * `storage`, e o App relê o orçamento (App._relerAberto, 1.2.78). A trava de
 * carimbo do Store (Store.CAS_ATIVO) impede uma janela de apagar calada o que
 * a outra gravou.
 * ⚠ Por isso a janela destacada RECUSA abrir sem Store.CAS_ATIVO === true:
 * sem a trava, duas janelas no mesmo orçamento perdiam dado sem aviso
 * (medido: e1=23 gravado numa janela sumia na gravação seguinte da outra).
 *
 * A rota vai no hash: #janela=v1/<orcId>/<aba>[/<sub>]. O hash é entrada de
 * quem digita a URL, e o id vai para seletor e atributo: lista branca.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ABAS = { planilha: 1, sintetico: 1, insumos: 1, cronograma: 1, execucao: 1, graficos: 1, relatorios: 1 };
  var SUBS = { cronograma: 1, fisico: 1, real: 1, parametros: 1 };
  var ROTULO = { planilha: "Planilha", sintetico: "Sintético", insumos: "Insumos", cronograma: "Cronograma", execucao: "Execução", graficos: "Gráficos", relatorios: "Relatórios" };
  var ROTULO_SUB = { cronograma: "Gantt", fisico: "Físico-financeiro", real: "Previsto × Realizado", parametros: "Parâmetros" };

  var Janelas = {
    VERSAO: "v1",

    montarRota: function (orcId, aba, sub) {
      if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(String(orcId || "")) || !ABAS[aba]) return null;
      var r = "#janela=" + this.VERSAO + "/" + orcId + "/" + aba;
      if (aba === "cronograma" && SUBS[sub]) r += "/" + sub;
      return r;
    },

    lerRota: function (hash) {
      var m = /^#janela=v1\/([A-Za-z0-9_.:-]{1,80})\/([a-z]{1,20})(?:\/([a-z]{1,20}))?$/.exec(String(hash || ""));
      if (!m || !ABAS[m[2]]) return null;
      var sub = (m[2] === "cronograma" && m[3] && SUBS[m[3]]) ? m[3] : (m[2] === "cronograma" ? "cronograma" : "");
      if (m[3] && !sub) return null;
      return {
        orcId: m[1], aba: m[2], sub: sub,
        // o Gantt ocupa a altura da janela (modo "preencher" do js/paineis.js)
        painel: m[2] === "cronograma" ? (sub === "cronograma" ? "gantt" : sub) : "aba"
      };
    },

    /* mesmo nome = o navegador REUSA a janela: clicar de novo traz a que já
       está aberta, em vez de empilhar cópias */
    nome: function (orcId, aba) {
      return ("orcapro_" + orcId + "_" + aba).replace(/[^A-Za-z0-9_]/g, "_");
    },

    /* ⚠ sem o `search`: ?demo, ?lic e ?importar seriam reprocessados na janela */
    url: function (loc, rota) {
      return loc.protocol + "//" + loc.host + loc.pathname + rota;
    },

    titulo: function (rota, orc) {
      var n = rota.aba === "cronograma" ? (ROTULO_SUB[rota.sub] || "Cronograma") : (ROTULO[rota.aba] || rota.aba);
      return n + " — " + ((orc && (orc.numero || orc.nome)) || "OrçaPRO");
    },

    suportado: function (win) {
      win = win || global;
      return !!(win && typeof win.open === "function");
    },

    podeEditar: function (Store) {
      return !!(Store && Store.CAS_ATIVO === true);
    },

    /* ⚠ SÍNCRONO dentro do clique: qualquer espera antes do window.open
       consome o gesto e o bloqueador de pop-up barra a janela. A mudança de
       monitor vem DEPOIS, com a janela já aberta. */
    abrir: function (orcId, aba, sub) {
      var rota = this.montarRota(orcId, aba, sub);
      if (!rota) { this._toast("Não consegui montar o endereço desta aba.", "erro"); return null; }
      var s = global.screen || {};
      var w = Math.max(900, Math.min(1400, (s.availWidth || 1366) - 80));
      var h = Math.max(600, Math.min(950, (s.availHeight || 768) - 80));
      var feat = "popup=yes,width=" + w + ",height=" + h + ",left=" + Math.round(((s.availLeft || 0) + ((s.availWidth || w) - w) / 2)) + ",top=" + Math.round((s.availTop || 0) + 40);
      var win = null;
      try { win = global.open(this.url(global.location, rota), this.nome(orcId, aba), feat); } catch (e) { win = null; }
      if (!win) {
        this._toast("O navegador bloqueou a janela nova. Libere as janelas pop-up para " + (global.location ? global.location.host : "este endereço") + " (ícone na barra de endereço) e clique de novo.", "erro");
        return null;
      }
      try { win.focus(); } catch (eF) {}
      this._levarParaOutraTela(win);
      return win;
    },

    _levarParaOutraTela: function (win) {
      var self = this;
      var arraste = function () { self._toast("Janela aberta. Arraste-a para o outro monitor — o que você gravar numa aparece na outra.", "ok"); };
      if (typeof global.getScreenDetails !== "function") { arraste(); return; }
      var jaPediu = false;
      try { jaPediu = global.localStorage.getItem("orcapro:tela:janelas:pediu") === "1"; } catch (eL) {}
      if (!jaPediu) {
        self._toast("Para abrir direto no seu outro monitor, o navegador vai pedir para ver as suas telas.", "ok");
        try { global.localStorage.setItem("orcapro:tela:janelas:pediu", "1"); } catch (eS) {}
      }
      try {
        global.getScreenDetails().then(function (sd) {
          var atual = sd.currentScreen, outra = null, i;
          for (i = 0; i < sd.screens.length; i++) {
            if (sd.screens[i] !== atual && (!outra || sd.screens[i].availWidth * sd.screens[i].availHeight > outra.availWidth * outra.availHeight)) outra = sd.screens[i];
          }
          if (!outra) { arraste(); return; }
          try { win.moveTo(outra.availLeft, outra.availTop); win.resizeTo(outra.availWidth, outra.availHeight); } catch (eM) { arraste(); }
        }, function () { arraste(); });
      } catch (eG) { arraste(); }
    },

    _toast: function (msg, tipo) {
      try { if (typeof UI !== "undefined") UI.toast(msg, tipo); } catch (e) {}
    }
  };

  global.Janelas = Janelas;
  if (typeof module !== "undefined" && module.exports) module.exports = Janelas;
})(typeof window !== "undefined" ? window : this);

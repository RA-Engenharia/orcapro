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
 * Prova: tools/test-janelas.js (com os controles negativos da lista branca).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ABAS = { planilha: 1, sintetico: 1, insumos: 1, cronograma: 1, execucao: 1, graficos: 1, relatorios: 1 };
  var SUBS = { cronograma: 1, fisico: 1, real: 1, parametros: 1 };
  var ROTULO = { planilha: "Planilha", sintetico: "Sintético", insumos: "Insumos", cronograma: "Cronograma", execucao: "Execução", graficos: "Gráficos", relatorios: "Relatórios" };
  var ROTULO_SUB = { cronograma: "Gantt", fisico: "Físico-financeiro", real: "Previsto × Realizado", parametros: "Parâmetros" };

  /* ⚠ hasOwnProperty, e não `ABAS[aba]`: "#janela=v1/x/constructor" casa
     [a-z]{1,20}, e `ABAS.constructor` é o construtor do Object — truthy.
     Medido antes deste conserto: a rota voltava com aba "constructor". */
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ⚠ A LISTA BRANCA DO ID mora AQUI, num lugar só (montar e ler usam a
     mesma). A classe de caracteres aceita ponto (há ids importados com
     ponto), e por isso "." e ".." passavam: "#janela=v1/../cronograma"
     virava orcId ".." (medido em 16/09/2026). Id começa por letra, dígito,
     _ : ou -, e nunca tem "..". */
  function idOk(id) {
    var s = (typeof id === "string" || typeof id === "number") ? String(id) : "";
    return /^[A-Za-z0-9_:-][A-Za-z0-9_.:-]{0,79}$/.test(s) && s.indexOf("..") < 0;
  }

  /* o painel que a janela mostra — é ele que vai no nome da janela */
  function painelDe(sub) { return (own(SUBS, sub) && sub !== "cronograma") ? sub : "gantt"; }

  function dois(n) { return (n < 10 ? "0" : "") + n; }

  var Janelas = {
    VERSAO: "v1",

    montarRota: function (orcId, aba, sub) {
      if (!idOk(orcId) || !own(ABAS, aba)) return null;
      var r = "#janela=" + this.VERSAO + "/" + orcId + "/" + aba;
      if (aba === "cronograma" && own(SUBS, sub)) r += "/" + sub;
      return r;
    },

    lerRota: function (hash) {
      /* o segmento do id é largo de propósito: quem decide se ele vale é o
         idOk, o mesmo do montarRota (duas listas brancas divergem) */
      var m = /^#janela=v1\/([^\/]{1,200})\/([a-z]{1,20})(?:\/([a-z]{1,20}))?$/.exec(typeof hash === "string" ? hash : "");
      if (!m || !idOk(m[1]) || !own(ABAS, m[2])) return null;
      /* ⚠ sub-aba escrita e fora da lista (ou em aba que não tem sub) → null.
         Antes caía no Gantt calada: "/cronograma/historico" abria o Gantt com
         o endereço mentindo o painel (o mesmo sintoma do nome sem a sub). */
      if (m[3] && !(m[2] === "cronograma" && own(SUBS, m[3]))) return null;
      var sub = m[2] === "cronograma" ? (m[3] || "cronograma") : "";
      return {
        orcId: m[1], aba: m[2], sub: sub,
        // o Gantt ocupa a altura da janela (modo "preencher" do js/paineis.js)
        painel: m[2] === "cronograma" ? (sub === "cronograma" ? "gantt" : sub) : "aba"
      };
    },

    /* mesmo nome = o navegador REUSA a janela: clicar de novo traz a que já
       está aberta, em vez de empilhar cópias.
       ⚠ UMA JANELA POR PAINEL: no Cronograma o nome leva o painel (gantt,
       fisico, real, parametros). Roteiro do defeito (auditoria da 1.2.80,
       tela.md item 3): com o Gantt aberto numa janela, ⧉ no Físico-financeiro
       chamava window.open com o MESMO nome; o navegador reaproveitava a
       janela do Gantt e trocava só o fragmento — sem recarregar e sem
       ninguém ouvindo `hashchange`. O endereço dizia /fisico, a tela seguia
       no Gantt e o recado dizia "Janela aberta". E o uso prometido (Gantt
       num monitor, físico no outro) não existia. */
    nome: function (orcId, aba, sub) {
      var pn = aba === "cronograma" ? "_" + painelDe(sub) : "";
      return ("orcapro_" + orcId + "_" + aba + pn).replace(/[^A-Za-z0-9_]/g, "_");
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

    /* "atualizado às 14:03:22" a partir do carimbo (ISO). Hora LOCAL: é a do
       relógio que a pessoa olha. Carimbo que não é data → "" (o cabeçalho
       esconde a linha em vez de mostrar "NaN:NaN").
       ⚠ E A DATA QUANDO NÃO É HOJE. Roteiro do defeito (revisão adversarial
       da 1.2.81): o galpão tinha carimbo de 15/07/2026 11:05, e o cabeçalho
       dizia "atualizado às 11:05:00" em 16/09 — lido como "hoje de manhã".
       `agora` (Date ou ms, opcional) existe para a bancada fixar o "hoje". */
    horaAtualizado: function (iso, agora) {
      if (typeof iso !== "string" || !iso) return "";
      var d = new Date(iso), ms = d.getTime();
      if (!isFinite(ms)) return "";
      var h = dois(d.getHours()) + ":" + dois(d.getMinutes()) + ":" + dois(d.getSeconds());
      var n = agora == null ? new Date() : new Date(typeof agora === "number" ? agora : agora.getTime());
      if (!isFinite(n.getTime()) || (n.getFullYear() === d.getFullYear() && n.getMonth() === d.getMonth() && n.getDate() === d.getDate())) {
        return "atualizado às " + h;
      }
      var dia = dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + (n.getFullYear() === d.getFullYear() ? "" : "/" + d.getFullYear());
      return "atualizado em " + dia + " às " + h;
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
      try { win = global.open(this.url(global.location, rota), this.nome(orcId, aba, sub), feat); } catch (e) { win = null; }
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

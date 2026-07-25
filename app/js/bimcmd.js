/* =====================================================================
 * bimcmd.js — Roteador de comandos do módulo BIM.
 *
 * A fita (js/bimribbon.js) diz QUE comandos existem. Este arquivo diz o
 * que cada um FAZ. Ficam separados de propósito: assim dá para conferir,
 * sem abrir o navegador, se algum botão da fita não leva a lugar nenhum
 * (`BimCmd.orfaos()`) e se alguma ação ficou sem botão (`BimCmd.soltas()`).
 * Botão que não faz nada é o defeito mais constrangedor de um produto —
 * aqui ele é pego no teste, não pelo cliente.
 *
 * As ações são registradas de fora (pelo gestao.js, que conhece o BIM e o
 * App). Este módulo não importa three.js nem toca no DOM: é uma tabela com
 * despacho, gate e telemetria de uso.
 *
 * Teste: node tools/test-bimcmd.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function str(v) { return v == null ? "" : String(v); }

  var BimCmd = {
    _acoes: {},        /* id -> function(ctx) */
    _rotulos: {},      /* id -> rótulo curto, para mensagens */
    _ultimo: null,
    _historico: [],    /* últimos comandos, para "repetir última ação" */
    _MAX_HIST: 30,

    _R: function () {
      return (typeof BimRibbon !== "undefined" && BimRibbon) || global.BimRibbon || null;
    },

    /* ---- registro ---------------------------------------------------
     * registrar("medir", fn) ou registrar({ medir: fn, area: fn })
     * Recusa id que não existe na fita: evita ação órfã nascendo por
     * erro de digitação. */
    registrar: function (id, fn) {
      var self = this;
      if (id && typeof id === "object") {
        var n = 0;
        Object.keys(id).forEach(function (k) { if (self.registrar(k, id[k])) n++; });
        return n;
      }
      if (typeof fn !== "function") return false;
      var R = this._R();
      if (R && !R.comando(id)) {
        try { console.warn('[BimCmd] ação registrada para "' + id + '", que não existe na fita.'); } catch (e) {}
        return false;
      }
      this._acoes[id] = fn;
      if (R) { var c = R.comando(id); if (c) this._rotulos[id] = str(c.rotulo).replace(/\n/g, " "); }
      return true;
    },
    tem: function (id) { return typeof this._acoes[id] === "function"; },

    /* ---- auditoria ---------------------------------------------------
     * Roda no teste e no boot em desenvolvimento. */
    orfaos: function () {              /* comando na fita, sem ação */
      var R = this._R(); if (!R) return [];
      var self = this;
      return R.ids().filter(function (id) { return !self.tem(id); });
    },
    soltas: function () {              /* ação registrada, sem comando na fita */
      var R = this._R(); if (!R) return [];
      return Object.keys(this._acoes).filter(function (id) { return !R.comando(id); });
    },
    cobertura: function () {
      var R = this._R(); if (!R) return { total: 0, comAcao: 0, pct: 0 };
      var ids = R.ids(), self = this;
      var com = ids.filter(function (i) { return self.tem(i); }).length;
      return { total: ids.length, comAcao: com, pct: ids.length ? Math.round(com / ids.length * 100) : 0 };
    },

    /* ---- execução ----------------------------------------------------
     * Devolve SEMPRE um objeto com o que aconteceu — quem chamou decide
     * se mostra toast, e o teste consegue afirmar sem espiar o DOM. */
    executar: function (id, ctx) {
      var R = this._R();
      var c = R ? R.comando(id) : null;
      if (!c) return { ok: false, motivo: "Comando desconhecido.", id: id };

      var d = R.disponibilidade(id);
      if (!d.ok) return { ok: false, motivo: d.motivo, id: id, bloqueado: true };

      var fn = this._acoes[id];
      if (!fn) {
        return { ok: false, id: id, semAcao: true,
          motivo: "\"" + str(c.rotulo).replace(/\n/g, " ") + "\" ainda não está disponível nesta versão." };
      }

      /* ferramenta que alterna: o estado muda ANTES, para a ação já
       * receber o valor novo e a fita repintar junto */
      var alterna = (c.tipo || "botao") === "alterna";
      var ligou = null;
      if (alterna) {
        ligou = !R.ativo(id);
        if (ligou) R.ligarExclusivo(id); else R.setAtivo(id, false);
      }

      var r;
      try {
        r = fn({ id: id, ligado: ligou, comando: c, ctx: ctx || {} });
      } catch (e) {
        /* a ação estourou: desfaz o estado para a fita não mentir */
        if (alterna) { if (ligou) R.setAtivo(id, false); else R.setAtivo(id, true); }
        try { console.error("[BimCmd] falha em " + id, e); } catch (e2) {}
        return { ok: false, id: id, erro: true, motivo: "Não consegui executar: " + (e && e.message ? e.message : "erro inesperado.") };
      }

      /* a ação pode devolver false para dizer "não deu, desfaz" */
      if (r === false) {
        if (alterna) { if (ligou) R.setAtivo(id, false); else R.setAtivo(id, true); }
        return { ok: false, id: id, motivo: "A ação não pôde ser concluída." };
      }

      this._ultimo = id;
      this._historico.push({ id: id, em: Date.now() });
      if (this._historico.length > this._MAX_HIST) this._historico.shift();

      return { ok: true, id: id, ligado: ligou, alterna: alterna, retorno: (r === true ? null : r) };
    },

    /* repete a última ação — o Enter/Espaço do Revit */
    repetir: function (ctx) {
      if (!this._ultimo) return { ok: false, motivo: "Nenhum comando para repetir." };
      return this.executar(this._ultimo, ctx);
    },
    ultimo: function () { return this._ultimo; },
    historico: function () { return this._historico.slice(); },

    /* Esc: sai da ferramenta ativa. Devolve quantas desligou. */
    cancelar: function () {
      var R = this._R(); if (!R) return 0;
      var n = R.desligarTodas();
      var fn = this._acoes["__cancelar"];
      if (typeof fn === "function") { try { fn({ id: "__cancelar" }); } catch (e) {} }
      return n;
    },
    /* gancho de cancelamento — registrado à parte porque não é um botão */
    aoCancelar: function (fn) { if (typeof fn === "function") this._acoes["__cancelar"] = fn; },

    limpar: function () {
      this._acoes = {}; this._rotulos = {};
      this._ultimo = null; this._historico = [];
    }
  };

  global.BimCmd = BimCmd;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCmd;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

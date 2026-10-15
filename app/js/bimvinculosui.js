/* =====================================================================
 * bimvinculosui.js — VÍNCULOS NA TELA (fiação fina; a conta é do
 * js/bimvinculos.js). 14/10/2026, frente S13.
 *
 * O que mora aqui:
 *   · LIGADO/DESLIGADO — o botão "Vínculos" da barra de baixo (js/
 *     bimbarrasnaps.js), lembrado por usuário no MESMO estado da precisão
 *     (js/bimbarraopcoes.js, campo `vinculos`; padrão ligado);
 *   · MOVER SOZINHO — a tecla ALT segurada durante o arraste (ou no clique do
 *     Mover, ou no Enter da cota): a peça anda sem levar as amarradas. Alt
 *     porque é a única modificadora que nenhum arraste do BIM lê (Shift = orto
 *     temporário, Ctrl no clique = alternar seleção). ⚠ No Windows, soltar o
 *     Alt sozinho manda o foco para o menu do navegador; o Alt que foi usado
 *     num arraste tem o keyup engolido aqui (e só ele);
 *   · GRAVAR — a op que a tela ia gravar passa pelo motor e sai a MESMA op
 *     (nada amarrado, ou Alt) ou UM lote (um Ctrl+Z desfaz tudo);
 *   · PRÉVIA — a topologia é lida uma vez no começo do arraste (`preparar`) e
 *     a cada movimento o motor diz para onde vão as pontas (sem refazer as
 *     barras metálicas: só as linhas);
 *   · BARRA DE ESTADO — "3 peças acompanharam" (e os avisos no balão).
 * ===================================================================== */
(function (global) {
  "use strict";

  function V() { return global.BimVinculos || null; }
  function BO() { var b = global.BimBarraOpcoes; return b && typeof b.precisao === "function" ? b : null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }

  var BimVinculosUI = {
    _alt: false, _altUsado: false, _ouvindo: false, _prep: null, _ultimo: null,

    /* o botão da barra de baixo (sem a barra de opções: ligado, como nasce) */
    ligado: function () { var b = BO(); try { return !b || b.precisao().vinculos !== false; } catch (e) { return true; } },
    alternar: function () {
      var b = BO(); if (!b || !b.alternar) return null;
      var v = b.alternar("vinculos");
      status(v ? "Vínculos ligados: ao mover ou esticar, o que está amarrado acompanha (segure Alt para mover só a peça)." : "Vínculos desligados: só a peça que você mexe anda (as amarradas ficam).");
      return v;
    },
    /* Alt segurado agora? (o evento manda; sem evento, o que os ouvintes viram por último) */
    sozinho: function (e) { if (e && typeof e.altKey === "boolean") return e.altKey; return !!this._alt; },
    _ouvir: function () {
      if (this._ouvindo || typeof document === "undefined") return;
      this._ouvindo = true;
      var self = this;
      function de(e) { if (e && typeof e.altKey === "boolean") { if (e.altKey && e.buttons) self._altUsado = true; self._alt = e.altKey; } }
      document.addEventListener("keydown", function (e) { if (e.key === "Alt") { self._alt = true; if (!e.repeat) self._altUsado = false; } }, true);
      document.addEventListener("keyup", function (e) {
        if (e.key !== "Alt") return;
        self._alt = false;
        /* o Alt que serviu para mover sozinho não abre o menu do navegador */
        if (self._altUsado) { e.preventDefault(); self._altUsado = false; }
      }, true);
      ["pointerdown", "pointermove", "pointerup"].forEach(function (t) { document.addEventListener(t, de, true); });
      global.addEventListener && global.addEventListener("blur", function () { self._alt = false; self._altUsado = false; });
    },

    /* a topologia de antes, guardada para o arraste inteiro */
    preparar: function (estado) {
      var M = V(); if (!M || !estado) { this._prep = null; return null; }
      this._ouvir();
      try { this._prep = M.preparar(estado); } catch (e) { this._prep = null; }
      return this._prep;
    },
    soltar: function () { this._prep = null; },
    /* para onde vão as amarradas com a op provisória (null: desligado, Alt ou nada amarrado) */
    previa: function (estado, op, e) {
      var M = V(); if (!M || !estado || !op || !this.ligado() || this.sozinho(e)) return null;
      var prep = this._prep && this._prep.estado === estado ? this._prep : this.preparar(estado);
      var r = null; try { r = M.propagar(estado, op, { prep: prep, previa: true }); } catch (eP) { r = null; }
      return r && (r.acompanharam.length || r.avisos.length || r.fundacoes.length || r.presas) ? r : null;
    },
    /* a op que a tela ia gravar → { op (a mesma ou o lote), res } */
    gravar: function (estado, op, o) {
      o = o || {};
      var M = V(); this._ouvir();
      if (!M || !estado || !op || !this.ligado() || this.sozinho(o.evento)) { this._prep = null; this._ultimo = null; return { op: op, res: null, sozinho: !!(M && this.sozinho(o.evento)) }; }
      var prep = this._prep && this._prep.estado === estado ? this._prep : null, r = null;
      try { r = M.propagar(estado, op, { prep: prep, novoId: o.novoId, nome: o.nome }); } catch (eG) { r = null; }
      this._prep = null; this._ultimo = r;
      if (!r) return { op: op, res: null };
      return { op: r.op || op, res: r };
    },
    /* o texto da barra de estado e o do balão */
    falar: function (res, base, dica) {
      var t = base || "";
      if (res && res.resumo) t += (t ? " · " : "") + res.resumo;
      if (res && (res.acompanharam.length || res.fundacoes.length || res.ligacoes.length)) t += " — Ctrl+Z desfaz tudo";
      else if (base && !/Ctrl\+Z/.test(base)) t += " (Ctrl+Z desfaz)";
      if (t) status(t);
      if (res && res.avisos.length && typeof dica === "function") dica(t + ". " + res.avisos[0] + (res.avisos.length > 1 ? " (+" + (res.avisos.length - 1) + ")" : ""));
      else if (typeof dica === "function" && t) dica(t + ".");
      return t;
    },
    /* o texto curto DURANTE o arraste */
    textoPrevia: function (res, e) {
      if (!this.ligado()) return "vínculos desligados";
      if (this.sozinho(e)) return "Alt: só esta peça";
      if (!res) return "";
      var n = res.acompanharam.length + res.fundacoes.length;
      return (n ? n + (n === 1 ? " peça acompanha" : " peças acompanham") : "nada acompanha") + (res.pendentes.length ? " · " + res.pendentes.length + " não acompanha(m)" : "") + " (Alt: só esta)";
    },
    /* as linhas-fantasma das que ACOMPANHAM (o movido a tela já desenha): [{a:[x,y,z], b:[x,y,z], k, h}] */
    linhas: function (res, excluir) {
      var fora = {}; (excluir || []).forEach(function (id) { fora[String(id)] = 1; });
      if (!res || !res.linhas) return [];
      return Object.keys(res.linhas).filter(function (id) { return !fora[id]; }).map(function (id) { var l = res.linhas[id]; return { id: id, a: l.a, b: l.b, k: l.k, h: l.h }; });
    },
    /* o contorno em planta de uma parede de eixo a→b e espessura h (para o fantasma) */
    contorno: function (l) {
      var dx = l.b[0] - l.a[0], dz = l.b[2] - l.a[2], L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L * (l.h || 0) / 2, nz = dx / L * (l.h || 0) / 2;
      var p = [{ x: l.a[0] + nx, z: l.a[2] + nz }, { x: l.b[0] + nx, z: l.b[2] + nz }, { x: l.b[0] - nx, z: l.b[2] - nz }, { x: l.a[0] - nx, z: l.a[2] - nz }];
      return [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]], [p[3], p[0]]];
    }
  };

  /* os ouvintes do Alt desde o carregamento: o 1º gesto (um clique do Mover com Alt) já sabe que é "só esta peça" */
  try { if (typeof document !== "undefined") BimVinculosUI._ouvir(); } catch (eO) {}
  global.BimVinculosUI = BimVinculosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVinculosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

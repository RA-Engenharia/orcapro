/* =====================================================================
 * bimfecharui.js — "FECHAR CANTOS ABERTOS" na tela (fiação fina; a conta é do
 * js/bimfechar.js). 20/10/2026.
 *
 * Modificar › Geometria, ao lado de "Juntas de parede": pega a SELEÇÃO (sem
 * seleção, o modelo inteiro), mostra a lista do que vai mudar (parede, ponta,
 * quanto) e só então aplica — UM lote, um Ctrl+Z desfaz tudo — e diz quantos
 * cantos fechou. O alcance (0,30 m) é configurável no diálogo. Parede desunida
 * de propósito (Unir nos cantos = Não, Desunir geometria, ponta desligada) não
 * é tocada.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function lerM(v, d) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) && n > 0 && n <= 5 ? n : d; }
  function brm(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }

  var BimFecharUI = {
    _seq: 0, _ultimo: null,
    estado: function () { var b = B(), e = null; try { e = b && b.editarEstado ? b.editarEstado() : null; } catch (x) { e = null; } return e ? e.estado : null; },
    novoId: function (p) { BimFecharUI._seq++; return (p || "l") + "fch" + Date.now().toString(36) + BimFecharUI._seq; },
    selecao: function () {
      var b = B(), ids = [], vistos = {};
      function add(x) { x = String(x).replace(/^edit:/, ""); if (!vistos[x]) { vistos[x] = 1; ids.push(x); } }
      try { var p = b && b.precisao ? b.precisao() : null; if (p && p.selecao) p.selecao().forEach(add); } catch (e) {}
      try { var s = b && b.selecao ? b.selecao().uids : []; arr(s).forEach(function (u) { if (/^edit:/.test(String(u))) add(u); }); } catch (e2) {}
      return ids;
    },
    /* a lista do que mudaria: o = { dist (m), semSelecao (true = o modelo inteiro), ids } → { ok, prop, linhas, st, ids } */
    planejar: function (o) {
      o = o || {};
      var F = global.BimFechar, st = this.estado();
      if (!F || !st) return { ok: false, erro: "O editor do modelo não está aberto." };
      var ids = o.semSelecao ? [] : (o.ids || this.selecao());
      var prop = F.propor(st, { dist: o.dist > 0 ? o.dist : F.DIST_PADRAO, ids: ids });
      return { ok: true, prop: prop, linhas: F.descrever(st, prop), st: st, ids: ids };
    },
    /* aplica: UM lote → { ok, n, erro, texto } (a porta do e2e) */
    executar: function (o) {
      o = o || {};
      var pl = this.planejar(o), F = global.BimFechar, b = B();
      if (!pl.ok) { status(pl.erro); this._ultimo = { ok: false, erro: pl.erro, n: 0 }; return this._ultimo; }
      if (!pl.prop.itens.length) {
        var t0 = "Nenhum canto aberto" + (pl.ids.length ? " na seleção" : "") + " a até " + brm(pl.prop.dist) + " m.";
        status(t0); this._ultimo = { ok: true, n: 0, texto: t0 }; return this._ultimo;
      }
      var ap = F.aplicar(pl.st, pl.prop.itens, { novoId: this.novoId });
      if (!ap.op || !b || !b.editarLote || !b.editarLote(ap.op)) { var er = ap.erro || "O editor recusou a mudança."; status(er); this._ultimo = { ok: false, erro: er, n: 0 }; return this._ultimo; }
      var t = ap.n + (ap.n === 1 ? " canto fechado" : " cantos fechados") + " (Ctrl+Z desfaz tudo).";
      status(t); toast(t, "info");
      this._ultimo = { ok: true, n: ap.n, texto: t, itens: pl.prop.itens };
      return this._ultimo;
    },
    abrir: function () {
      var U = global.UI, d = global.document, self = this;
      if (!global.BimFechar || !this.estado()) { status("Abra o editor do modelo para fechar cantos."); return false; }
      if (!U || !U.modal) return false;
      var ids = this.selecao();
      var h = '<div data-bfc="dlg" style="font-size:12.5px;min-width:360px">' +
        '<p style="margin:0 0 8px">' + (ids.length ? "<b>" + ids.length + (ids.length === 1 ? " peça selecionada</b>" : " peças selecionadas</b>") : "<b>Modelo inteiro</b> (nada selecionado)") + " — acha as pontas de parede que ficaram perto de outra e não estão no canto, e leva até o encontro dos eixos (L) ou até a face (T).</p>" +
        '<label style="display:flex;gap:8px;align-items:center;margin:0 0 8px">Alcance <input data-bfc="dist" inputmode="decimal" value="0,30" style="width:5em" aria-label="Alcance em metros"> m</label>' +
        (ids.length ? '<label style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><input type="checkbox" data-bfc="todo"> Modelo inteiro (ignora a seleção)</label>' : "") +
        '<div data-bfc="lista" style="max-height:220px;overflow:auto;border:1px solid var(--borda,#d0d5dd);border-radius:6px;padding:6px 8px" aria-live="polite"></div>' +
        '<p class="muted" style="margin:8px 0 0">Parede desunida de propósito (Unir nos cantos = Não, Desunir geometria, ponta desligada) e parede fixada não são tocadas.</p></div>';
      function q(k) { return d.querySelector('[data-bfc="' + k + '"]'); }
      function ler() { return { dist: lerM((q("dist") || {}).value, 0.3), semSelecao: !!(q("todo") && q("todo").checked), ids: ids }; }
      function lista() {
        var el = q("lista"); if (!el) return;
        var pl = self.planejar(ler());
        if (!pl.ok) { el.textContent = pl.erro; return; }
        var n = pl.linhas.length;
        el.innerHTML = n ? "<b>" + n + (n === 1 ? " canto a fechar:" : " cantos a fechar:") + "</b><ul style='margin:4px 0 0 16px;padding:0'>" + pl.linhas.slice(0, 14).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + (n > 14 ? "<li>… e mais " + (n - 14) + "</li>" : "") + "</ul>" : "Nenhum canto aberto neste alcance.";
      }
      U.modal("Fechar cantos abertos", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); status("Fechar cantos: nada mudou."); } },
        { texto: "Fechar cantos", classe: "primary", onClick: function () { var r = self.executar(ler()); if (r.ok) U.fecharModal(); } }
      ]);
      var raiz = q("dlg");
      if (raiz) { raiz.addEventListener("input", lista); raiz.addEventListener("change", lista); }
      lista();
      return true;
    },
    registrar: function (reg) {
      var self = this;
      reg["fechar-cantos"] = function () { self.abrir(); return true; };
      return true;
    }
  };
  global.BimFecharUI = BimFecharUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFecharUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

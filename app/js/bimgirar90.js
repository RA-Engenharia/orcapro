/* =====================================================================
 * bimgirar90.js — GIRAR 90° A PEÇA SELECIONADA, SEM FERRAMENTA. 04/11/2026.
 *
 * Pedido do Rogério (04/11/2026): "clicar na piscina e ela rotacionar 90 graus". A ferramenta Girar pede centro, referência e
 * ângulo; para família solta (piscina, casa de máquinas, móvel, equipamento) o giro é em volta da própria origem: Espaço, o
 * botão da aba contextual ou o clique direito. Vale para a família LIVRE (a hospedada segue a parede). Um Ctrl+Z desfaz.
 * A gravação é a op "transformar" de sempre: o que depende da peça (recorte e tubos, js/piscinaderiv.js) acompanha no replay.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  var BimGirar90 = {
    /* as famílias livres da seleção do desenho */
    alvos: function () {
      var b = B(), api = null, st = null;
      try { api = b && b.precisao ? b.precisao() : null; st = b && b.editarEstado ? b.editarEstado().estado : null; } catch (e) { return []; }
      if (!api || !api.selecao || !st) return [];
      var ids = arr(api.selecao()).map(String), fams = {};
      arr(st.familias).forEach(function (f) { fams[String(f.id)] = f; });
      return ids.map(function (i) { return fams[i]; }).filter(function (f) { return f && !f.host; });
    },
    pode: function () { return this.alvos().length > 0; },
    /* o botão que aparece ao clicar na peça: a fita tem o mesmo comando, mas no fim da aba, fora da vista (chamado pela fita ao mudar a seleção) */
    atualizar: function () {
      var d = global.document; if (!d) return;
      var raiz = d.querySelector(".bim-revit"), b = d.getElementById("bim-girar90"), mostra = !!raiz && this.pode();
      if (!mostra) { if (b) b.style.display = "none"; return; }
      if (!b || b.parentNode !== raiz) {
        if (b && b.parentNode) b.parentNode.removeChild(b);
        b = d.createElement("button"); b.id = "bim-girar90"; b.type = "button"; b.textContent = "⟳ Girar 90°  (Espaço)";
        b.style.cssText = "position:absolute;left:50%;bottom:104px;transform:translateX(-50%);z-index:60;padding:8px 16px;border:0;border-radius:999px;background:#17324d;color:#fff;font:600 13px/1 inherit;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.28)";
        b.addEventListener("click", function () { BimGirar90.girar(90); });
        raiz.appendChild(b);
      }
      b.style.display = "block";
    },
    girar: function (graus) {
      var b = B(), lista = this.alvos(), g = graus == null ? 90 : graus;
      if (!lista.length || !b || !b.editarLote) return false;
      return !!b.editarLote({ op: "lote", id: "girar90-" + Date.now().toString(36), origem: "girar90", pedido: "Girar " + g + "°",
        ops: lista.map(function (f) { return { op: "transformar", ids: [f.id], T: { tipo: "girar", cx: f.x, cz: f.z, graus: g }, copia: false }; }) });
    }
  };
  /* Espaço: só com o BIM na tela, fora de campo de texto, e depois de quem já usa a tecla (colocar peça, inverter porta, linha de corte) */
  try {
    if (global.document && global.document.addEventListener) global.document.addEventListener("keydown", function (e) {
      if ((e.key !== " " && e.code !== "Space") || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      var t = e.target, tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || (t && t.isContentEditable)) return;
      var raiz = global.document.querySelector(".bim-revit");
      if (!raiz || !raiz.getClientRects().length) return;
      if (BimGirar90.girar(90)) { e.preventDefault(); e.stopPropagation(); }
    });
  } catch (eK) {}
  global.BimGirar90 = BimGirar90;
  if (typeof module !== "undefined" && module.exports) module.exports = BimGirar90;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

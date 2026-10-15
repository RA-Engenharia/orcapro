/* =====================================================================
 * metalmodelosui.js — a GALERIA DE MODELOS de guarda-corpos e escadas
 * (Metálica & Mecânica › Acessos › Galeria de modelos; só com a prévia do
 * modelador). Frente M5, 14/10/2026.
 *
 * Quem tem os modelos é o js/metalmodelos.js (puro). Aqui: a janela com os
 * cartões por grupo (guarda-corpos, escadas, rampas e plataformas), a PRÉVIA
 * de cada um (planta e elevação das peças que o gerador faz), o selo da
 * norma e do cálculo (js/acoacessos.js, o mesmo da verificação), as normas
 * que o modelo cumpre e o botão que abre o diálogo das peças prontas com os
 * valores do modelo (posicionar por clique, criar nas coordenadas, editar
 * depois como componente). As prévias são desenhadas aos poucos (não trava
 * a tela). Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function MM() { return global.MetalModelos || null; }
  function PU() { return global.MetalProntasUI || null; }
  function MP() { return global.MetalProntas || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }

  function css() {
    if (typeof document === "undefined" || document.getElementById("mmod-css")) return;
    var s = document.createElement("style"); s.id = "mmod-css";
    s.textContent = ".mmod{display:flex;flex-direction:column;gap:10px;max-height:72vh;overflow:auto;padding-right:4px}" +
      ".mmod-abas{display:flex;gap:6px;flex-wrap:wrap}.mmod-abas button{min-height:32px}.mmod-abas button[aria-pressed=true]{background:var(--azul,#2563eb);color:#fff;border-color:transparent}" +
      ".mmod-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}" +
      ".mmod-card{border:1px solid var(--linha);border-radius:10px;background:var(--surface);padding:10px;display:flex;flex-direction:column;gap:6px;color:var(--texto)}" +
      ".mmod-card h4{margin:0;font-size:13px;display:flex;gap:6px;align-items:center}.mmod-novo{font-size:10px;font-weight:700;color:var(--verde);border:1px solid var(--verde);border-radius:999px;padding:0 6px}" +
      ".mmod-prev{min-height:96px;border-radius:6px;background:var(--fundo,transparent);display:flex;align-items:center;justify-content:center;color:var(--texto-fraco);font-size:11px}" +
      ".mmod-prev svg{width:100%;height:auto}.mmod-prev .mpr-esq-barra{stroke:var(--aco,#5b6b7c);stroke-width:1.3}.mmod-prev .mpr-esq-chapa{stroke:var(--texto-fraco);stroke-width:.6}.mmod-prev .mpr-esq-guarda{stroke:var(--amarelo);stroke-width:.8}.mmod-prev .mpr-esq-rot{fill:var(--texto-fraco);font-size:9px}" +
      ".mmod-desc{font-size:11.5px;margin:0;color:var(--texto)}.mmod-normas{font-size:10.5px;margin:0;padding-left:14px;color:var(--texto-fraco)}" +
      ".mmod-selos{display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px}.mmod-selo{border-radius:999px;padding:1px 8px;border:1px solid var(--linha)}" +
      ".mmod-selo.ok{color:var(--verde);border-color:var(--verde)}.mmod-selo.falha{color:var(--vermelho);border-color:var(--vermelho)}.mmod-selo.inc{color:var(--amarelo);border-color:var(--amarelo)}" +
      ".mmod-card button.primary{margin-top:auto;min-height:32px}";
    document.head.appendChild(s);
  }
  function selo(rot, st) {
    var cls = st === "conforme" || st === "aprovado" ? "ok" : (st === "nao-conforme" || st === "reprovado" ? "falha" : "inc");
    var tx = { conforme: "atende", aprovado: "passa", "nao-conforme": "NÃO ATENDE", reprovado: "NÃO PASSA", incompleto: "INCOMPLETO", "sem-requisitos": "sem regra" }[st] || "—";
    return '<span class="mmod-selo ' + cls + '" data-mmod-selo="' + esc(rot) + '">' + esc(rot) + ": " + tx + "</span>";
  }

  var MetalModelosUI = {
    ultimo: null, _grupo: "guarda",
    pronto: function () { return !!(MM() && PU() && MP() && global.UI); },
    abrir: function (grupo) {
      if (!this.pronto()) { toast("A galeria de modelos não carregou (js/metalmodelos.js).", "erro", 8000); return false; }
      css();
      var self = this, M = MM(); this._grupo = grupo || this._grupo || "guarda";
      var h = '<div class="mmod" data-mmod="galeria" data-modal-largo><div class="mmod-abas" role="tablist">' + M.GRUPOS.map(function (g) { return '<button type="button" class="secondary" data-mmod-grupo="' + g.id + '" aria-pressed="' + (g.id === self._grupo) + '">' + esc(g.rotulo) + " (" + M.lista(g.id).length + ")</button>"; }).join("") + "</div>" +
        '<p class="mmod-desc">Cada modelo abre o diálogo com os valores dele: mude o que quiser e a conformidade e o cálculo aparecem ao vivo. Depois de criado, ele é um <b>componente</b>: o clique seleciona tudo, o duplo clique edita, as alças esticam.</p>' +
        '<div class="mmod-grade" data-mmod="grade"></div></div>';
      UI.modal("Galeria de modelos — guarda-corpos e escadas", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector('[data-mmod="galeria"]'); if (!raiz) return false;
      raiz.addEventListener("click", function (e) {
        var gb = e.target.closest ? e.target.closest("[data-mmod-grupo]") : null;
        if (gb) { self._grupo = gb.getAttribute("data-mmod-grupo"); [].slice.call(raiz.querySelectorAll("[data-mmod-grupo]")).forEach(function (b) { b.setAttribute("aria-pressed", String(b === gb)); }); self.cartoes(raiz); return; }
        var ub = e.target.closest ? e.target.closest("[data-mmod-usar]") : null;
        if (ub) self.usar(ub.getAttribute("data-mmod-usar"));
      });
      this.cartoes(raiz);
      return true;
    },
    cartoes: function (raiz) {
      var M = MM(), gr = raiz.querySelector('[data-mmod="grade"]'); if (!gr) return;
      var lista = M.lista(this._grupo);
      gr.innerHTML = lista.map(function (m) {
        return '<article class="mmod-card" data-mmod-modelo="' + esc(m.id) + '"><h4>' + esc(m.rotulo) + (m.novo ? ' <span class="mmod-novo">novo</span>' : "") + "</h4>" +
          '<div class="mmod-prev" data-mmod-prev="' + esc(m.id) + '">desenhando…</div><div class="mmod-selos" data-mmod-selos="' + esc(m.id) + '"></div>' +
          '<p class="mmod-desc">' + esc(m.descricao) + '</p><ul class="mmod-normas">' + (m.normas || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" +
          '<button type="button" class="primary" data-mmod-usar="' + esc(m.id) + '">Usar este modelo</button></article>';
      }).join("");
      /* as prévias e os selos aos poucos (um modelo por quadro) */
      var i = 0, self = this, vez = ++this._vez;
      (function proximo() {
        if (vez !== self._vez || i >= lista.length || !gr.isConnected) return;
        var m = lista[i++], pv = gr.querySelector('[data-mmod-prev="' + m.id + '"]'), sl = gr.querySelector('[data-mmod-selos="' + m.id + '"]');
        try {
          var a = M.avaliar(m.id);
          if (pv) pv.innerHTML = a.ok ? MP().esquema(a.r) : esc(a.motivo || "sem prévia");
          if (sl && a.ok) sl.innerHTML = (a.norma ? selo("Norma", a.norma) : "") + (a.calculo ? selo("Cálculo", a.calculo) : "");
        } catch (e) { if (pv) pv.textContent = "sem prévia"; }
        setTimeout(proximo, 0);
      })();
    },
    _vez: 0,
    /* abre o diálogo das peças prontas com os valores do modelo */
    usar: function (id) {
      var M = MM(), U = PU(), m = M.modelo(id); if (!m || !U) return false;
      var par = M.parDe(id);
      UI.fecharModal();
      this.ultimo = { id: id, tipo: m.tipo };
      status("Modelo: " + m.rotulo + " — ajuste os valores e posicione (ou crie nas coordenadas).");
      return U.dialogo(m.tipo, { par: par });
    }
  };

  global.MetalModelosUI = MetalModelosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalModelosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimfocoui.js — a TELA da disciplina ativa e da visibilidade por categoria
 * (motor: js/bimfoco.js; aplica: js/bim.js, BIM.foco).
 *
 *  1. A DISCIPLINA DA FITA MANDA NO FOCO. O seletor de disciplina (js/bimshell.js, "Todas ▾") já escolhe a
 *     disciplina da modelagem; agora a escolha também esmaece e trava o que é das outras
 *     (Coordenação = tudo normal). `sincronizar()` é chamado pela casca a cada troca e na montagem.
 *  2. VISIBILIDADE POR CATEGORIA: Vista › Exibir › "Visibilidade por categoria" abre um painel pequeno sobre
 *     o 3D — cada categoria com liga/desliga e transparência (100, 75, 50, 25 %), a disciplina ativa no topo
 *     e "Mostrar tudo". Esc ou o X fecham. Só gráfico.
 * ES5, sem framework.
 * ===================================================================== */
(function (global) {
  "use strict";

  function F() { return global.BimFoco || null; }
  function B() { return global.BIM || null; }
  function SH() { return global.BimShell || null; }
  function R() { return global.BimRibbon || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function status(t) { try { if (SH() && SH().status) SH().status(t); } catch (e) {} }
  function ico(n, t) { try { return global.Icones ? global.Icones.get(n, t || 14) : ""; } catch (e) { return ""; } }

  /* o id da disciplina da FITA que corresponde a cada foco (o inverso de BimFoco.DA_FITA) */
  var PARA_FITA = { coordenacao: "completo", arquitetura: "civil", hidrossanitario: "hidraulica", eletrica: "eletrica", estrutura: "estrutura" };

  var UI = {
    _painel: null,
    _eventos: false,

    /* a casca avisa: a disciplina da fita mudou (ou acabou de montar) → o foco acompanha */
    sincronizar: function () {
      var f = F(), dd = global.BimDisciplinas;
      if (!f || !dd) return false;
      var id = "completo"; try { id = dd.atual(); } catch (e) {}
      var mudou = f.set({ disc: f.daFita(id) });
      if (mudou) { try { var b = B(); if (b && b.foco) b.foco({}); } catch (e2) {} this.repintar(); }
      return mudou;
    },
    /* texto da barra de status ao trocar de disciplina */
    frase: function () {
      var f = F(); if (!f) return "";
      var e = f.get(), d = null;
      f.DISCIPLINAS.forEach(function (x) { if (x.id === e.disc) d = x; });
      if (!d || e.disc === "coordenacao") return "Coordenação: todas as disciplinas visíveis e editáveis.";
      return d.rotulo + " em foco: as outras disciplinas ficam esmaecidas e sem clique" + (e.esmaecer ? "." : " (desligado no painel Visibilidade por categoria).");
    },

    /* ------------------------------------------------------------ fita */
    registrar: function (reg, G) {
      var self = this, r = R(); if (!r || !reg) return false;
      r.acrescentar("vista", "Vista", "Exibir", [
        { id: "foco-categorias", rotulo: "Visibilidade\npor categoria", icone: "olho", grande: true, tipo: "alterna", requer: "modelo",
          dica: "Liga e desliga cada categoria (paredes, tubos, conexões, pilares…) e muda a transparência dela — e escolhe a disciplina em foco: as outras ficam esmaecidas e sem clique. Só gráfico: não muda o modelo." }
      ]);
      reg["foco-categorias"] = function () { self.alternar(); return true; };
      this._ligarEventos();
      return true;
    },
    _ligarEventos: function () {
      var self = this; if (this._eventos) return; this._eventos = true;
      try {
        global.addEventListener("bim:modelos", function () { self.repintar(); });
        global.addEventListener("bim:foco", function () { self.repintar(); });
      } catch (e) {}
    },

    /* ------------------------------------------------------------ painel */
    aberto: function () { return !!(this._painel && this._painel.parentNode); },
    alternar: function (on) {
      var quer = on == null ? !this.aberto() : !!on;
      if (quer) return this.abrir(); this.fechar(); return false;
    },
    fechar: function () {
      if (this._painel && this._painel.parentNode) this._painel.parentNode.removeChild(this._painel);
      this._painel = null;
      try { if (R()) { R().setAtivo("foco-categorias", false); if (SH() && SH().pintarFita) SH().pintarFita(); } } catch (e) {}
    },
    abrir: function () {
      var sh = SH(), palco = sh && sh.palco ? sh.palco() : null, f = F();
      if (!palco || !f) return false;
      if (this._painel && this._painel.parentNode) { this.repintar(); return true; }
      var self = this, p = document.createElement("div");
      p.className = "bim-foco-painel";
      p.setAttribute("role", "dialog");
      p.setAttribute("aria-label", "Visibilidade por categoria");
      p.setAttribute("data-bim-foco", "1");
      palco.appendChild(p);
      this._painel = p;
      p.addEventListener("change", function (ev) { self._mudou(ev.target); });
      p.addEventListener("click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-bf]") : null; if (!b) return;
        var k = b.getAttribute("data-bf");
        if (k === "fechar") self.fechar();
        else if (k === "tudo") { f.restaurarCategorias(); self._aplicar(); status("Todas as categorias visíveis e opacas."); }
      });
      p.addEventListener("keydown", function (ev) {
        ev.stopPropagation();   /* digitar/usar o teclado aqui não aciona atalho do visualizador */
        if (ev.key === "Escape") { ev.preventDefault(); self.fechar(); }
      });
      this.repintar();
      try { if (R()) { R().setAtivo("foco-categorias", true); if (sh.pintarFita) sh.pintarFita(); } } catch (e) {}
      try { var c0 = p.querySelector("select,input"); if (c0) c0.focus(); } catch (e2) {}
      return true;
    },
    _aplicar: function () { try { var b = B(); if (b && b.foco) b.foco({}); } catch (e) {} this.repintar(); },
    _mudou: function (t) {
      var f = F(); if (!f || !t) return;
      if (t.hasAttribute("data-bf-disc")) {
        var id = PARA_FITA[t.value] || "completo", sh = SH();
        if (sh && sh.escolherDisciplina) { var res = sh.escolherDisciplina(id); if (res && res.ok === false) { this.repintar(); return; } }
        else { f.set({ disc: t.value }); this._aplicar(); }
        this.repintar();
        return;
      }
      if (t.hasAttribute("data-bf-esm")) { f.set({ esmaecer: !!t.checked }); this._aplicar(); status(this.frase()); return; }
      var cv = t.getAttribute("data-bf-vis"), co = t.getAttribute("data-bf-op");
      if (cv) { var o = {}; o[cv] = { vis: !!t.checked }; f.set({ cats: o }); this._aplicar(); return; }
      if (co) { var o2 = {}; o2[co] = { op: +t.value }; f.set({ cats: o2 }); this._aplicar(); }
    },
    repintar: function () {
      var p = this._painel, f = F(); if (!p || !p.parentNode || !f) return;
      var b = B(), est = f.get(), info = null;
      try { info = b && b.foco ? b.foco() : null; } catch (e) { info = null; }
      var grupos = (info && info.grupos) || [];
      /* não repinta por cima de um controle que a pessoa está usando */
      var ativo = document.activeElement;
      var h = '<div class="bf-cab"><b>Visibilidade por categoria</b><button type="button" class="bf-x" data-bf="fechar" aria-label="Fechar" title="Fechar (Esc)">' + ico("fechar", 12) + "</button></div>";
      h += '<div class="bf-disc"><label>Disciplina em foco <select data-bf-disc="1" aria-label="Disciplina em foco">' +
        f.DISCIPLINAS.map(function (d) { return '<option value="' + d.id + '"' + (d.id === est.disc ? " selected" : "") + ">" + esc(d.rotulo) + "</option>"; }).join("") + "</select></label>" +
        '<label class="bf-esm"><input type="checkbox" data-bf-esm="1"' + (est.esmaecer ? " checked" : "") + '> Esmaecer as outras e travar o clique nelas</label></div>';
      if (!grupos.length) h += '<p class="bf-vazio">Abra um modelo para ver as categorias.</p>';
      grupos.forEach(function (g) {
        h += '<div class="bf-grupo"><div class="bf-gtit">' + esc(g.rotulo) + "</div>";
        g.itens.forEach(function (it) {
          var c = est.cats[it.id] || { vis: true, op: 1 }, vis = c.vis !== false, op = c.op == null ? 1 : c.op;
          h += '<div class="bf-lin' + (vis ? "" : " bf-off") + '"><label class="bf-nome"><input type="checkbox" data-bf-vis="' + it.id + '"' + (vis ? " checked" : "") + ' aria-label="Mostrar ' + esc(it.rotulo) + '"> ' + esc(it.rotulo) + '</label><span class="bf-n">' + it.n + "</span>" +
            '<select data-bf-op="' + it.id + '" aria-label="Transparência de ' + esc(it.rotulo) + '"' + (vis ? "" : " disabled") + ">" +
            f.OPACIDADES.map(function (o) { return '<option value="' + o + '"' + (Math.abs(o - op) < 0.01 ? " selected" : "") + ">" + Math.round(o * 100) + " %</option>"; }).join("") + "</select></div>";
        });
        h += "</div>";
      });
      h += '<div class="bf-pe"><button type="button" class="bf-bt" data-bf="tudo">Mostrar tudo</button>' +
        '<span class="bf-leg">' + (info && info.on ? (info.fundo ? info.fundo + " peças esmaecidas" : "") + (info.fundo && info.ocultas ? " · " : "") + (info.ocultas ? info.ocultas + " ocultas" : "") : "Nada esmaecido nem oculto") + "</span></div>";
      if (ativo && p.contains(ativo) && ativo.tagName === "SELECT" && p.getAttribute("data-bf-mexendo") === "1") return;
      var rolou = p.scrollTop;
      p.innerHTML = h;
      p.scrollTop = rolou;
      try {
        if (ativo && ativo.getAttribute) {
          var q = ativo.getAttribute("data-bf-disc") ? "[data-bf-disc]" : ativo.getAttribute("data-bf-esm") ? "[data-bf-esm]" : ativo.getAttribute("data-bf-vis") ? '[data-bf-vis="' + ativo.getAttribute("data-bf-vis") + '"]' : ativo.getAttribute("data-bf-op") ? '[data-bf-op="' + ativo.getAttribute("data-bf-op") + '"]' : "";
          if (q) { var n = p.querySelector(q); if (n) n.focus(); }
        }
      } catch (e3) {}
    }
  };

  global.BimFocoUI = UI;
  if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

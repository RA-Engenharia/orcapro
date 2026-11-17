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
 *  3. (16/11/2026) POR DISCIPLINA E POR CATEGORIA, COM MEMÓRIA POR VISTA: o título de cada disciplina (Arquitetura, Estrutura,
 *     Hidrossanitário, Elétrica, Climatização) é uma caixa que esconde a disciplina inteira num clique (meio marcada = só parte das
 *     categorias); dentro dela, uma caixa por categoria (Hidro: tubos, conexões, acessórios, louças e metais, caixas, equipamentos;
 *     Elétrica: eletrodutos, fiação, caixas, luminárias, tomadas, quadros…). "Ocultar cotas no 3D" fica no topo do painel e na fita
 *     (Vista › Exibir). O que a pessoa escondeu fica GRAVADO por vista (BimFoco.salvarVista) e volta ao reabrir (`restaurar`).
 *     Só visible=false nos grupos — a cena não é recriada. As plantas, cortes e folhas abertos leem a mesma visibilidade da cena
 *     (cadeiaVisivel) e são redesenhados quando ela muda; por isso não há chave "valer no 2D".
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
      r.acrescentar("vista", "Vista", "Exibir", [
        { id: "cotas-ocultar", rotulo: "Ocultar\ncotas 3D", icone: "regua", grande: true, tipo: "alterna", requer: "modelo",
          dica: "Esconde (ou mostra) as cotas e os rótulos de medida que ficam sobre o 3D — as de seleção, as de precisão e as cotas gravadas. Só gráfico: nada é apagado, e as cotas da planta, do corte e da folha continuam. Fica lembrado por vista." }
      ]);
      reg["foco-categorias"] = function () { self.alternar(); return true; };
      reg["cotas-ocultar"] = function () { self.cotas(); return true; };
      this._ligarEventos();
      return true;
    },
    _ligarEventos: function () {
      var self = this; if (this._eventos) return; this._eventos = true;
      try {
        global.addEventListener("bim:modelos", function () { self.restaurar(); self.repintar(); });
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
        else if (k === "tudo") { f.restaurarCategorias(); self._aplicar(); status("Todas as disciplinas e categorias visíveis e opacas."); }
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
    /* a vista a que o estado pertence: a {3D} principal (as vistas 2D leem a visibilidade da cena) */
    VISTA: "3d",
    _aplicar: function () {
      var f = F();
      try { var b = B(); if (b && b.foco) b.foco({}); } catch (e) {}
      try { if (f) f.salvarVista(this.VISTA); } catch (e1) {}
      this._sincronizarBotao();
      this._redesenhar2D();
      this.repintar();
    },
    /* plantas, cortes e folhas abertos: leem a visibilidade da cena, então refazem o desenho (uma vez, sem recalcular o que não mudou) */
    _redesenhar2D: function () {
      var self = this; if (this._rd) return;
      this._rd = setTimeout(function () {
        self._rd = null;
        try { var B2 = global.Bim2D; if (B2 && B2._cache) Object.keys(B2._cache).forEach(function (k) { try { B2.redesenhar(k, true); } catch (e) {} }); } catch (e2) {}
      }, 120);
    },
    _sincronizarBotao: function () {
      try { var f = F(), r = R(); if (f && r) { r.setAtivo("cotas-ocultar", !!f.cotasOc()); var sh = SH(); if (sh && sh.pintarFita) sh.pintarFita(); } } catch (e) {}
    },
    /* liga/desliga o esconder cotas (a fita e o painel) */
    cotas: function (on) {
      var f = F(); if (!f) return false;
      var quer = on == null ? !f.cotasOc() : !!on;
      f.set({ cotasOc: quer });
      this._aplicar();
      status(quer ? "Cotas escondidas no 3D (nada foi apagado; a planta, o corte e a folha mantêm as cotas). Clique de novo para mostrar." : "Cotas do 3D visíveis de novo.");
      return quer;
    },
    /* o que estava gravado para esta vista volta uma vez por sessão, na primeira vez que o modelo aparece */
    restaurar: function () {
      var f = F(); if (!f || this._restaurado) return false;
      var b = B(); try { if (!(b && b.elementos && b.elementos.length)) return false; } catch (e) { return false; }
      this._restaurado = true;
      var tinha = false; try { tinha = f.carregarVista(this.VISTA); } catch (e1) {}
      if (!tinha) return false;
      try { if (b.foco) b.foco({}); } catch (e2) {}
      this._sincronizarBotao();
      var e3 = f.get(), nc = Object.keys(e3.cats).length, nd = Object.keys(e3.discOc).length;
      if (nc || nd) status("Visibilidade lembrada desta vista: " + (nd ? nd + (nd === 1 ? " disciplina escondida" : " disciplinas escondidas") : "") + (nd && nc ? " e " : "") + (nc ? nc + (nc === 1 ? " categoria alterada" : " categorias alteradas") : "") + ". Painel Visibilidade por categoria › Mostrar tudo desfaz.");
      this.repintar();
      return true;
    },
    _mudou: function (t) {
      var f = F(); if (!f || !t) return;
      if (t.hasAttribute("data-bf-disc")) {
        var id = PARA_FITA[t.value] || "completo", sh = SH();
        if (sh && sh.escolherDisciplina) { var res = sh.escolherDisciplina(id); if (res && res.ok === false) { this.repintar(); return; } }
        else { f.set({ disc: t.value }); this._aplicar(); }
        this.repintar();
        return;
      }
      var dv = t.getAttribute("data-bf-dvis");
      if (dv) {   /* a disciplina inteira num clique: marcada = visível */
        var od = {}; od[dv] = !t.checked; f.set({ discOc: od });
        if (t.checked) { var oc0 = {}; f.CATEGORIAS.forEach(function (c) { if (c.disc === dv) oc0[c.id] = { vis: true }; }); f.set({ cats: oc0 }); }   /* ligar a disciplina liga também as categorias que estavam apagadas dentro dela */
        this._aplicar(); status(t.checked ? "Disciplina visível." : "Disciplina escondida (" + dv + "): só visible=false, nada foi apagado."); return;
      }
      if (t.hasAttribute("data-bf-cotas")) { this.cotas(!!t.checked); return; }
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
      h += '<div class="bf-cotas bf-topo"><label><input type="checkbox" data-bf-cotas="1"' + (est.cotasOc ? " checked" : "") + '> Ocultar cotas no 3D</label>' +
        '<span class="bf-nota">Só esconde: as cotas continuam gravadas e saem na planta, no corte e na folha.</span></div>';
      if (!grupos.length) h += '<p class="bf-vazio">Abra um modelo para ver as categorias.</p>';
      grupos.forEach(function (g) {
        /* a caixa da DISCIPLINA: marcada = tudo visível; vazia = disciplina escondida; "meio" = parte das categorias escondida */
        var discOc = !!(est.discOc && est.discOc[g.disc]), escond = 0;
        g.itens.forEach(function (it) { var cc = est.cats[it.id]; if (discOc || (cc && cc.vis === false)) escond++; });
        var estadoD = discOc || escond === g.itens.length ? "off" : escond ? "meio" : "on";
        h += '<div class="bf-grupo' + (estadoD === "off" ? " bf-goff" : "") + '"><div class="bf-gtit">' + (g.disc === "outros" ? esc(g.rotulo) :
          '<label class="bf-gnome"><input type="checkbox" data-bf-dvis="' + g.disc + '" data-bf-meio="' + (estadoD === "meio" ? "1" : "0") + '"' + (estadoD === "on" || estadoD === "meio" ? " checked" : "") + ' aria-label="Mostrar a disciplina ' + esc(g.rotulo) + ' inteira" title="Esconde ou mostra a disciplina inteira num clique"> ' + esc(g.rotulo) + '</label><span class="bf-n">' + (g.n || "") + "</span>") + "</div>";
        g.itens.forEach(function (it) {
          var c = est.cats[it.id] || { vis: true, op: 1 }, vis = c.vis !== false && !discOc, op = c.op == null ? 1 : c.op;
          h += '<div class="bf-lin' + (vis ? "" : " bf-off") + '"><label class="bf-nome"><input type="checkbox" data-bf-vis="' + it.id + '"' + (vis ? " checked" : "") + ' aria-label="Mostrar ' + esc(it.rotulo) + '"> ' + esc(it.rotulo) + '</label><span class="bf-n">' + it.n + "</span>" +
            '<select data-bf-op="' + it.id + '" aria-label="Transparência de ' + esc(it.rotulo) + '"' + (vis ? "" : " disabled") + ">" +
            f.OPACIDADES.map(function (o) { return '<option value="' + o + '"' + (Math.abs(o - op) < 0.01 ? " selected" : "") + ">" + Math.round(o * 100) + " %</option>"; }).join("") + "</select></div>";
        });
        h += "</div>";
      });
      h += '<p class="bf-nota bf-aviso">Plantas, cortes e folhas abertos seguem o que está escondido aqui. A escolha fica lembrada nesta vista.</p>';
      h += '<div class="bf-pe"><button type="button" class="bf-bt" data-bf="tudo">Mostrar tudo</button>' +
        '<span class="bf-leg">' + (info && info.on ? (info.fundo ? info.fundo + " peças esmaecidas" : "") + (info.fundo && info.ocultas ? " · " : "") + (info.ocultas ? info.ocultas + " ocultas" : "") : "Nada esmaecido nem oculto") + "</span></div>";
      if (ativo && p.contains(ativo) && ativo.tagName === "SELECT" && p.getAttribute("data-bf-mexendo") === "1") return;
      var rolou = p.scrollTop;
      p.innerHTML = h;
      p.scrollTop = rolou;
      try { Array.prototype.forEach.call(p.querySelectorAll('[data-bf-meio="1"]'), function (c) { c.indeterminate = true; }); } catch (e4) {}   /* "meio marcada": só parte das categorias da disciplina está escondida */
      try {
        if (ativo && ativo.getAttribute) {
          var q = ativo.getAttribute("data-bf-dvis") ? '[data-bf-dvis="' + ativo.getAttribute("data-bf-dvis") + '"]' : ativo.getAttribute("data-bf-cotas") ? "[data-bf-cotas]" : ativo.getAttribute("data-bf-disc") ? "[data-bf-disc]" : ativo.getAttribute("data-bf-esm") ? "[data-bf-esm]" : ativo.getAttribute("data-bf-vis") ? '[data-bf-vis="' + ativo.getAttribute("data-bf-vis") + '"]' : ativo.getAttribute("data-bf-op") ? '[data-bf-op="' + ativo.getAttribute("data-bf-op") + '"]' : "";
          if (q) { var n = p.querySelector(q); if (n) n.focus(); }
        }
      } catch (e3) {}
    }
  };

  global.BimFocoUI = UI;
  if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

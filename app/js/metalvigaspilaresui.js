/* =====================================================================
 * metalvigaspilaresui.js — a TELA de "Lançar vigas entre pilares"
 * (prévia do modelador). 15/10/2026.
 *
 * Pedido do Rogério: "posicionei vários pilares, clico e ele lança as vigas
 * automaticamente, em todos os sentidos ou nos que eu marcar (X, Y), travando
 * todos os pilares. Tem de ser paramétrico."
 *
 * QUEM FAZ O QUÊ
 *   js/metalvigaspilares.js .. a CONTA (vizinhos alinhados, face mesa/alma,
 *                              recuo, comprimento máximo e emendas, as ops);
 *   este arquivo ............. o diálogo (sentidos X/Y, perfil, topo da viga,
 *                              tolerância, máximo da barra, emenda) com a
 *                              PRÉVIA no 3D (js/metalcriarui.js previaVP) e
 *                              o resumo antes de aplicar; o item do botão
 *                              direito com 2+ pilares selecionados;
 *   js/metalui.js ............ o botão na fita (Metálica › Peças);
 *   js/gestao.js ............. o menu do clique direito chama itensMenu().
 * Aplicar manda UM lote ao editor: Ctrl+Z desfaz tudo de uma vez.
 * A preferência (sentidos, topo, tolerância, máximo) fica no aparelho
 * (localStorage com try/catch); sem armazenamento, o padrão.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:metal:vigaspilares:v1";
  function MV() { return global.MetalVigasPilares || null; }
  function MU() { return global.BimMetalUI || null; }
  function MCU() { return global.MetalCriarUI || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 7000); } catch (e) {} }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function padrao() {
    var cat = "W250X25.3";
    try { var c = MCU() && MCU().cfg ? MCU().cfg().viga : null; if (c && c.cat) cat = c.cat; } catch (e) {}
    return { x: true, y: true, cat: cat, topo: "pilar", nivel: "", desl: 0, cota: 3, tol: 5, max: 12, emenda: "pilar" };
  }
  var cfg = null;
  function C() {
    if (cfg) return cfg;
    var p = padrao(), o = null;
    try { o = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); } catch (e) { o = null; }
    if (o && typeof o === "object") Object.keys(p).forEach(function (k) { if (o[k] != null && typeof o[k] === typeof p[k]) p[k] = o[k]; });
    cfg = p; return cfg;
  }
  function guardar() { try { global.localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch (e) { /* sem armazenamento: fica na memória */ } }
  function estado() { var M = MU(); try { var st = M && M.estado ? M.estado() : null; return st || { caixas: [] }; } catch (e) { return { caixas: [] }; } }
  function niveis() { try { var U = global.BimArqUI; return U && U.niveis ? U.niveis().map(function (n) { return { id: String(n.id), nome: n.nome, elevacao: +n.elevacao || 0 }; }) : []; } catch (e) { return []; } }
  /* os pilares da seleção (ids sem o "edit:") */
  function pilaresSel() {
    var M = MU(), V = MV(); if (!M || !V) return [];
    var ids = []; try { ids = M.selecao(); } catch (e) { ids = []; }
    return M.caixas(ids).filter(function (c) { return !!V.pilarDe(c); }).map(function (c) { return String(c.id); });
  }
  /* a cota do topo da viga pedida no diálogo (null = topo de cada pilar) */
  function cotaTopo(c) {
    if (c.topo === "pilar") return null;
    if (c.topo === "nivel") { var n = niveis().filter(function (x) { return x.id === c.nivel; })[0] || niveis()[0]; return n ? n.elevacao + num(c.desl, 0) : null; }
    return num(c.cota, null);
  }
  /* ⚠ o sentido Y é `y` e a cota do topo é `cota` (antes as duas eram `y`: a cota apagava o sentido e desmarcar Y não valia) */
  function opDe(c) { var ct = cotaTopo(c); return { x: !!c.x, y: !!c.y, cat: c.cat, topo: ct == null ? "pilar" : "cota", cota: ct, tol: num(c.tol, 5) / 100, max: num(c.max, 12), emenda: c.emenda }; }

  var MetalVigasPilaresUI = {
    COMANDO: "met-vigas-pilares",
    cfg: function () { return C(); },
    registrar: function (reg) {
      if (!previa() || !MV()) return false;
      var self = this;
      reg[this.COMANDO] = function () { try { self.dialogo(); } catch (e) { toast("Vigas entre pilares: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      return true;
    },
    /* o clique direito (js/gestao.js): com 2+ pilares selecionados */
    itensMenu: function () {
      if (!previa() || !MV()) return [];
      var self = this, ids = pilaresSel();
      return ids.length >= 2 ? [{ id: this.COMANDO, rotulo: "Lançar vigas entre pilares… (" + ids.length + " pilares)", fn: function () { self.dialogo(ids); } }] : [];
    },
    plano: function (ids, c) { var V = MV(); return V ? V.planoGrade(estado().caixas, ids, opDe(c || C())) : null; },
    _opDe: opDe,
    _previa: function (pl) {
      var t = MCU() && MCU()._3d, V = MV(); if (!t || !t.previaVP) return 0;
      if (!pl || !V) return t.previaVP(null);
      return t.previaVP(V.previa(pl, { cat: C().cat }), pl.emendas);
    },
    resumoHtml: function (pl) {
      if (!pl) return '<p class="muted">O motor não carregou.</p>';
      var h = '<p data-mvp="conta" style="margin:0 0 6px"><b>' + pl.pecas.length + " viga(s)</b>" + (pl.pecas.length ? " — " + pl.porEixo.x + " em X · " + pl.porEixo.y + " em Y" : "") +
        (pl.existentes ? " · " + pl.existentes + " vão(s) já têm viga (não duplica)" : "") + (pl.emendas.length ? " · " + pl.emendas.length + " emenda(s)" : "") + "</p>";
      if (pl.pendentes.length) h += '<ul data-mvp="pendentes" style="margin:4px 0;padding-left:18px;color:var(--vermelho)">' + pl.pendentes.map(function (p) { return "<li>" + esc(p.texto) + "</li>"; }).join("") + "</ul>";
      if (pl.emendas.length) h += '<ul data-mvp="emendas" style="margin:4px 0;padding-left:18px">' + pl.emendas.map(function (e) { return "<li>" + esc(e.texto) + "</li>"; }).join("") + "</ul>";
      if (pl.avisos.length) h += '<ul data-mvp="avisos" style="margin:4px 0;padding-left:18px" class="muted">' + pl.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>";
      h += '<p class="muted" style="margin:6px 0 0">Cada viga vai de eixo a eixo (o nó do cálculo fica no pilar) e para na face — mesa ou alma, conforme o giro do pilar — com a ligação parafusada flexível escolhida pela Ligação inteligente. Sem o cálculo da estrutura ela fica A DIMENSIONAR. Mover o pilar estica a viga.</p>';
      return h;
    },
    /* o diálogo; ids = os pilares (padrão: os selecionados) */
    dialogo: function (ids) {
      var self = this, U = global.UI, V = MV(); if (!U || !V) return false;
      ids = arr(ids).length ? ids.map(String) : pilaresSel();
      if (ids.length < 2) { toast("Selecione dois ou mais pilares (Ctrl + clique ou uma janela de seleção) e chame Vigas entre pilares.", "aviso", 8000); status("Vigas entre pilares: selecione 2 ou mais pilares."); return false; }
      var c = C(), L = niveis();
      var op = function (v, r, s) { return '<option value="' + esc(v) + '"' + (s ? " selected" : "") + ">" + esc(r) + "</option>"; };
      var campo = 'style="display:flex;flex-direction:column;gap:3px"';
      var h = '<div data-mvp="dlg"><p class="muted" style="margin:0 0 10px">' + ids.length + " pilares selecionados. O sistema acha os vizinhos alinhados (a diagonal fica de fora) e lança uma viga por vão, travando todos os pilares.</p>" +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 12px">' +
        '<div ' + campo + '>Sentidos<span style="display:flex;gap:12px"><label><input type="checkbox" data-mvp-c="x"' + (c.x ? " checked" : "") + "> X (horizontal da planta)</label><label><input type=\"checkbox\" data-mvp-c=\"y\"" + (c.y ? " checked" : "") + "> Y (vertical da planta)</label></span></div>" +
        '<label ' + campo + '>Perfil da viga<input class="inp" data-mvp-c="cat" list="mvp-perfis" autocomplete="off" value="' + esc(c.cat) + '"><datalist id="mvp-perfis">' + ["W150X13", "W200X15", "W200X26.6", "W250X25.3", "W250X32.7", "W310X38.7", "W360X44", "W410X53"].map(function (n) { return '<option value="' + n + '">'; }).join("") + "</datalist></label>" +
        '<label ' + campo + '>Topo da viga<select class="inp" data-mvp-c="topo">' + op("pilar", "No topo de cada pilar", c.topo === "pilar") + (L.length ? op("nivel", "Num nível", c.topo === "nivel") : "") + op("cota", "Numa cota (m)", c.topo === "cota") + "</select></label>" +
        (L.length ? '<label ' + campo + ' data-mvp="l-nivel">Nível<select class="inp" data-mvp-c="nivel">' + L.map(function (n) { return op(n.id, n.nome + " (" + br(n.elevacao) + " m)", n.id === c.nivel); }).join("") + "</select></label>" : "") +
        '<label ' + campo + ' data-mvp="l-cota">Cota do topo (m)<input class="inp" data-mvp-c="cota" inputmode="decimal" value="' + esc(br(c.cota, 2)) + '"></label>' +
        '<label ' + campo + '>Tolerância de alinhamento (cm)<input class="inp" data-mvp-c="tol" inputmode="decimal" value="' + esc(br(c.tol, 1)) + '"></label>' +
        '<label ' + campo + '>Comprimento máximo da barra (m)<span style="display:flex;gap:6px"><input class="inp" data-mvp-c="max" inputmode="decimal" style="width:5em" value="' + esc(br(c.max, 1)) + '"><button type="button" class="btn sm ghost" data-mvp-max="6">6 m</button><button type="button" class="btn sm ghost" data-mvp-max="12">12 m</button></span></label>' +
        '<label ' + campo + '>Vão maior que o máximo<select class="inp" data-mvp-c="emenda">' + op("pilar", "Não lançar (avisa)", c.emenda === "pilar") + op("continuidade", "Emenda de continuidade (0,2·L, talas)", c.emenda === "continuidade") + "</select></label>" +
        '</div><div data-mvp="resumo" style="margin-top:10px;border-top:1px solid var(--linha);padding-top:8px"></div></div>';
      var ultimo = null;
      function ler() {
        var raiz = document.querySelector('[data-mvp="dlg"]'); if (!raiz) return;
        function v(k) { var e = raiz.querySelector('[data-mvp-c="' + k + '"]'); return e ? (e.type === "checkbox" ? e.checked : e.value) : null; }
        c.x = !!v("x"); c.y = !!v("y");
        var cat = global.MetalCriar ? MetalCriar.perfilCat(v("cat")) : null; if (cat) c.cat = cat;
        c.topo = v("topo") || "pilar"; if (v("nivel") != null) c.nivel = String(v("nivel"));
        var co = num(v("cota"), NaN); if (isFinite(co)) c.cota = co;
        var tl = num(v("tol"), NaN); if (tl >= 0 && tl <= 100) c.tol = tl;
        var mx = num(v("max"), NaN); if (mx >= 1 && mx <= 60) c.max = mx;
        c.emenda = v("emenda") === "continuidade" ? "continuidade" : "pilar";
        guardar();
        var ln = raiz.querySelector('[data-mvp="l-nivel"]'), lc = raiz.querySelector('[data-mvp="l-cota"]');
        if (ln) ln.style.display = c.topo === "nivel" ? "" : "none"; if (lc) lc.style.display = c.topo === "cota" ? "" : "none";
        atualizar();
      }
      function atualizar() {
        ultimo = self.plano(ids, c);
        var rs = document.querySelector('[data-mvp="resumo"]'); if (rs) rs.innerHTML = self.resumoHtml(ultimo);
        self._previa(ultimo);
        var bt = document.querySelector('[data-mvp="aplicar"]');
        if (bt) { bt.textContent = ultimo && ultimo.pecas.length ? "Lançar " + ultimo.pecas.length + " viga(s)" : "Nada a lançar"; bt.disabled = !(ultimo && ultimo.pecas.length); }
      }
      U.modal("Lançar vigas entre pilares", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { self._previa(null); U.fecharModal(); } },
        { texto: "Lançar", classe: "primary", onClick: function () {
          if (!ultimo || !ultimo.pecas.length) return;
          var r = self.aplicar(ultimo);
          self._previa(null); U.fecharModal();
          if (r && r.ok && (r.ex.pendentes.length || r.ex.aDimensionar)) self.mostrarResultado(r.ex);
        } }
      ]);
      try {
        var bts = document.querySelectorAll("#modal-footer button"), ult = null;
        for (var i = 0; i < bts.length; i++) if (/^Lançar/.test(bts[i].textContent || "")) ult = bts[i];
        if (ult) ult.setAttribute("data-mvp", "aplicar");
      } catch (eB) {}
      var raiz = document.querySelector('[data-mvp="dlg"]');
      if (raiz) {
        raiz.addEventListener("change", ler); raiz.addEventListener("input", function (e) { if (e.target && e.target.getAttribute("data-mvp-c") === "cat") return; ler(); });
        raiz.addEventListener("click", function (e) { var b = e.target && e.target.closest ? e.target.closest("[data-mvp-max]") : null; if (!b) return; var q = raiz.querySelector('[data-mvp-c="max"]'); if (q) q.value = br(b.getAttribute("data-mvp-max"), 1); ler(); });
      }
      ler();
      return true;
    },
    /* o plano → o lote (um Ctrl+Z) */
    aplicar: function (pl) {
      var V = MV(), M = MU(); if (!V || !M || !pl) return null;
      var ex = V.executar(estado().caixas, pl, { cat: C().cat, novoId: M.novoId ? M.novoId.bind(M) : null });
      this._ultimo = ex;
      if (!ex.ops.length) { toast(ex.resumo, "aviso", 8000); status("Vigas entre pilares: " + ex.resumo); return { ok: false, ex: ex }; }
      if (!M.enviar({ op: "lote", id: M.novoId ? M.novoId() : "mvp-" + Date.now().toString(36), origem: "metal-vigas-pilares", pedido: "Vigas entre pilares — " + ex.resumo, ops: ex.ops })) { toast("O editor recusou as vigas.", "erro"); return { ok: false, ex: ex }; }
      var t = "Vigas entre pilares: " + ex.resumo + " Ctrl+Z desfaz.";
      status(t); toast(t, ex.aDimensionar || ex.pendentes.length ? "aviso" : "ok", 9000);
      return { ok: true, ex: ex };
    },
    mostrarResultado: function (ex) {
      var U = global.UI; if (!U || !ex) return;
      var h = '<div data-mvp="resultado"><p>' + esc(ex.resumo) + "</p>" +
        (ex.emendas.length ? "<p><b>Emendas</b></p><ul>" + ex.emendas.map(function (e) { return "<li>" + esc(e.texto) + (e.aDimensionar ? " — " + esc(e.aDimensionar) : "") + "</li>"; }).join("") + "</ul>" : "") +
        (ex.aDimensionar ? "<p><b>A dimensionar</b> — " + ex.aDimensionar + " ligação(ões): sem o cálculo da estrutura os esforços são estimados (nenhuma ligação sai aprovada). Calcule a Estrutura desenhada e confira as ligações com os esforços da análise.</p>" : "") +
        (ex.ligacoes.filter(function (l) { return l.pendente; }).length ? "<ul>" + ex.ligacoes.filter(function (l) { return l.pendente; }).map(function (l) { return "<li>" + esc(l.aDimensionar) + "</li>"; }).join("") + "</ul>" : "") +
        (ex.pendentes.length ? "<p><b>Não lançado</b></p><ul>" + ex.pendentes.map(function (p) { return '<li style="color:var(--vermelho)">' + esc(p.texto) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
      U.modal("Vigas entre pilares — resultado", h, [{ texto: "Ok", classe: "primary", onClick: function () { U.fecharModal(); } }]);
    },
    ultimo: function () { return this._ultimo || null; }
  };

  global.MetalVigasPilaresUI = MetalVigasPilaresUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalVigasPilaresUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

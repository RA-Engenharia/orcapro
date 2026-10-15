/* =====================================================================
 * bimelevarui.js — ELEVAR NA TELA (fiação fina; a conta é do
 * js/bimelevar.js). 15/10/2026, frente F1 da 1.2.147 (item 41).
 *
 * O que mora aqui:
 *   · o COMANDO "Elevar" (fita › Arquitetura › Modificar, botão direito na
 *     seleção, tecla EL): um diálogo com as três maneiras — subir/descer X m,
 *     levar a base (ou o topo) a um nível com deslocamento, e alinhar o topo
 *     com o topo da peça de apoio (viga sobre/entre pilares);
 *   · a seção "Elevação" das PROPRIEDADES (paleta do registro, js/bimpropsui.js,
 *     e as Propriedades da peça metálica, js/metalcriarui.js): Elevação da
 *     base e do topo, Nível de referência e Deslocamento — ‹vários› com mais de
 *     uma peça em cotas diferentes;
 *   · GRAVAR — o plano passa pelos VÍNCULOS (js/bimvinculos.js): o que está
 *     amarrado acompanha; Alt segurado (ou "Só a seleção") move só a seleção.
 *     Sai UM lote: um Ctrl+Z desfaz tudo.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM || null; }
  function EL() { return global.BimElevar || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  var VARIOS = "‹vários›";
  /* as categorias que já têm "Nível base" + "Deslocamento" nas Propriedades (P1-B, js/bimarq.js RESTR_TIPO) */
  var COM_RESTR = { parede: 1, pilar: 1, escada: 1, laje: 1, viga: 1, cobertura: 1 };

  var BimElevarUI = {
    _G: null, _seq: 0, _ultimo: null, _tecla: "", _teclaT: 0, _ouvindo: false,
    estado: function () { var b = B(), e = null; try { e = b && b.editarEstado ? b.editarEstado() : null; } catch (x) { e = null; } return e ? e.estado : null; },
    niveis: function () {
      try { var U = global.BimArqUI; return U && U.niveis ? U.niveis().map(function (n) { return { id: String(n.id), nome: n.nome, elevacao: +n.elevacao || 0 }; }) : []; } catch (e) { return []; }
    },
    novoId: function (p) { BimElevarUI._seq++; return (p || "l") + "elv" + Date.now().toString(36) + BimElevarUI._seq; },
    /* a seleção: a do desenho de precisão (Ctrl+clique soma) e a do 3D (clique, botão direito) */
    selecao: function () {
      var b = B(), ids = [], vistos = {};
      function add(x) { x = String(x).replace(/^edit:/, ""); if (!vistos[x]) { vistos[x] = 1; ids.push(x); } }
      try { var p = b && b.precisao ? b.precisao() : null; if (p && p.selecao) p.selecao().forEach(add); } catch (e) {}
      try { var s = b && b.selecao ? b.selecao().uids : []; arr(s).forEach(function (u) { if (/^edit:/.test(String(u))) add(u); }); } catch (e2) {}
      if (!ids.length) { var G = this._G || global.Gestao, u = G && G._bimSelecao && G._bimSelecao.uid; if (u && /^edit:/.test(u)) add(u); }
      return ids;
    },
    /* as peças prontas cortadas pela seleção: [{chave, nome, ids (todas), nSel}] */
    prontasParciais: function (st, ids) {
      var sel = {}, por = {}, out = [];
      ids.forEach(function (id) { sel[String(id)] = 1; });
      arr(st && st.caixas).forEach(function (c) { if (c && c.pronta != null) { var k = String(c.pronta); (por[k] = por[k] || []).push(String(c.id)); } });
      Object.keys(por).forEach(function (k) {
        var n = por[k].filter(function (id) { return sel[id]; }).length;
        if (n && n < por[k].length) { var c0 = arr(st.caixas).filter(function (c) { return String(c.id) === por[k][0]; })[0]; out.push({ chave: k, nome: (c0 && (c0.prontaNome || (c0.metal && c0.metal.prontaNome))) || "peça pronta", ids: por[k], nSel: n }); }
      });
      return out;
    },
    expandirProntas: function (st, ids) {
      var out = ids.slice(), na = {}; out.forEach(function (x) { na[x] = 1; });
      this.prontasParciais(st, ids).forEach(function (p) { p.ids.forEach(function (x) { if (!na[x]) { na[x] = 1; out.push(x); } }); });
      return out;
    },

    /* ------------------------------------------------ o plano e o gravar
     * modo = 'delta' | 'nivel' | 'apoio' | 'topo' | 'campo'; par = { dy | valor, nivel, ref, desloc, campo, bruto }.
     * → { ok, plano, op, res, texto, erro } (a porta do e2e: o diálogo chama isto) */
    planejar: function (modo, par, ids) {
      var M = EL(), st = this.estado(); par = par || {};
      if (!M || !st) return { ok: false, erro: "O editor do modelo não está aberto." };
      ids = ids || this.selecao();
      if (!ids.length) return { ok: false, erro: "Selecione as peças (clique; Ctrl+clique soma) e use Elevar." };
      if (par.prontaInteira) ids = this.expandirProntas(st, ids);
      var p;
      if (modo === "delta") { var l = typeof par.dy === "number" ? { ok: true, valor: par.dy } : M.lerMetros(par.dy); if (!l.ok) return { ok: false, erro: l.erro }; p = M.planoDelta(st, ids, l.valor); }
      else if (modo === "nivel") { var d = par.desloc == null || par.desloc === "" ? { ok: true, valor: 0 } : (typeof par.desloc === "number" ? { ok: true, valor: par.desloc } : M.lerMetros(par.desloc)); if (!d.ok) return { ok: false, erro: d.erro }; p = M.planoNivel(st, ids, par.nivel, { ref: par.ref, desloc: d.valor, niveis: this.niveis() }); }
      else if (modo === "apoio") p = M.planoApoio(st, ids);
      else if (modo === "campo") p = M.planoCampo(st, ids, par.campo, par.bruto, this.niveis());
      else return { ok: false, erro: "Modo desconhecido." };
      return { ok: !!p.ok, plano: p, ids: ids, st: st, erro: p.ok ? null : p.erro };
    },
    gravar: function (modo, par, o) {
      o = o || {};
      var pl = this.planejar(modo, par, o.ids), M = EL(), b = B();
      if (!pl.ok) { status(pl.erro); this._ultimo = { ok: false, erro: pl.erro, plano: pl.plano || null }; return this._ultimo; }
      var VU = global.BimVinculosUI, solto = !!(par && par.solto) || (VU && (!VU.ligado() || VU.sozinho(o.evento)));
      var f = M.opFinal(pl.st, pl.plano, { solto: solto, novoId: this.novoId, pedido: o.pedido || "Elevar", nome: null });
      if (!f.op || !b || !b.editarLote || !b.editarLote(f.op)) { var er = "O editor recusou a mudança."; status(er); this._ultimo = { ok: false, erro: er }; return this._ultimo; }
      var base = pl.plano.resumo + (solto && VU && VU.ligado() ? " (Alt: só a seleção)" : "");
      var texto = VU && VU.falar ? VU.falar(f.res, base, function (t) { if (f.res && f.res.avisos.length) toast(t, "aviso"); }) : base + " (Ctrl+Z desfaz).";
      if (!VU) status(texto);
      this._ultimo = { ok: true, plano: pl.plano, op: f.op, res: f.res, texto: texto, solto: solto };
      return this._ultimo;
    },

    /* ------------------------------------------------ o diálogo */
    abrir: function () {
      var U = global.UI, d = global.document, self = this, st = this.estado(), M = EL();
      if (!M || !st) { status("Abra o editor do modelo para elevar peças."); return false; }
      var ids = this.selecao();
      if (!ids.length) { status("Elevar: selecione as peças (clique; Ctrl+clique soma) e chame Elevar (EL)."); toast("Selecione as peças que vão subir ou descer.", "aviso"); return false; }
      if (!U || !U.modal) return false;
      var cp = M.campos(st, ids, this.niveis()), L = this.niveis(), parc = this.prontasParciais(st, ids);
      var n = ids.length, faixa = cp && isFinite(cp.menorBase) ? "base " + (cp.base !== undefined ? M.br(cp.base) + " m" : "de " + M.br(cp.menorBase) + " m (várias cotas)") + (cp.topo !== undefined && cp.topo != null ? " · topo " + M.br(cp.topo) + " m" : "") : "";
      var opN = L.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome) + " (" + M.sinal(x.elevacao) + " m)</option>"; }).join("");
      var h = '<div data-bel="dlg" style="font-size:12.5px;min-width:340px">' +
        '<p style="margin:0 0 10px"><b>' + n + (n === 1 ? " peça selecionada" : " peças selecionadas") + "</b>" + (faixa ? ' <span class="muted">— ' + esc(faixa) + "</span>" : "") + "</p>" +
        '<label style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><input type="radio" name="bel-modo" value="delta" data-bel="m-delta" checked> Subir/descer <input data-bel="dy" inputmode="decimal" placeholder="0,50" style="width:6em" aria-label="Distância em metros (negativo desce)"> m <span class="muted">(negativo desce)</span></label>' +
        '<label style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px"><input type="radio" name="bel-modo" value="nivel" data-bel="m-nivel"' + (L.length ? "" : " disabled") + "> Levar a " +
          '<select data-bel="ref" aria-label="Base ou topo"><option value="base">base</option><option value="topo">topo</option></select> ao nível ' +
          (L.length ? '<select data-bel="nivel" aria-label="Nível">' + opN + "</select>" : '<span class="muted">(a obra não tem níveis)</span>') +
          ' com deslocamento <input data-bel="desloc" inputmode="decimal" placeholder="0,00" style="width:5em" aria-label="Deslocamento em metros"> m</label>' +
        '<label style="display:flex;gap:8px;align-items:center;margin:0 0 10px"><input type="radio" name="bel-modo" value="apoio" data-bel="m-apoio"> Alinhar o topo com o topo da peça de apoio <span class="muted">(viga sobre/entre pilares)</span></label>' +
        (parc.length ? '<label style="display:flex;gap:8px;align-items:center;margin:0 0 6px"><input type="checkbox" data-bel="pronta" checked> Levar a peça pronta inteira (' + parc.map(function (p) { return p.nSel + " de " + p.ids.length + " de " + esc(p.nome); }).join("; ") + ")</label>" : "") +
        '<label style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><input type="checkbox" data-bel="solto"> Só a seleção — as peças ligadas não acompanham (o mesmo que segurar Alt)</label>' +
        '<p data-bel="previa" class="muted" style="margin:6px 0 0;min-height:1.3em" aria-live="polite"></p>' +
        '<p data-bel="erro" role="alert" style="margin:4px 0 0;color:var(--erro,#b42318)" hidden></p></div>';
      function q(k) { return d.querySelector('[data-bel="' + k + '"]'); }
      function ler() {
        var m = (d.querySelector('input[name="bel-modo"]:checked') || {}).value || "delta";
        return { modo: m, par: { dy: (q("dy") || {}).value || "", nivel: (q("nivel") || {}).value, ref: (q("ref") || {}).value, desloc: (q("desloc") || {}).value || "", prontaInteira: !!(q("pronta") && q("pronta").checked), solto: !!(q("solto") && q("solto").checked) } };
      }
      function previa() {
        var r = ler(), pv = q("previa"), er = q("erro"); if (!pv) return;
        if (r.modo === "delta" && !String(r.par.dy).trim()) { pv.textContent = "Digite quanto sobe (negativo desce)."; if (er) er.hidden = true; return; }
        var pl = self.planejar(r.modo, r.par, ids);
        pv.textContent = pl.ok ? "Prévia: " + pl.plano.resumo + "." : "";
        if (er) { er.textContent = pl.ok ? "" : (pl.erro || ""); er.hidden = !!pl.ok; }
      }
      function aplicar(ev) {
        var r = ler(), res = self.gravar(r.modo, r.par, { ids: ids, evento: ev, pedido: "Elevar " + ids.length + (ids.length === 1 ? " peça" : " peças") });
        if (!res.ok) { var er = q("erro"); if (er) { er.textContent = res.erro; er.hidden = false; } return; }
        U.fecharModal();
      }
      U.modal("Elevar", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); status("Elevar: nada mudou."); } },
        { texto: "Aplicar", classe: "primary", onClick: function (ev) { aplicar(ev || global.event); } }
      ]);
      var raiz = q("dlg");
      if (raiz) {
        raiz.addEventListener("input", previa); raiz.addEventListener("change", previa);
        raiz.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target && ev.target.tagName === "INPUT" && ev.target.type !== "checkbox" && ev.target.type !== "radio") { ev.preventDefault(); aplicar(ev); } });
        ["nivel", "ref", "desloc"].forEach(function (k) { var x = q(k); if (x) x.addEventListener("focus", function () { var r0 = q("m-nivel"); if (r0 && !r0.disabled) r0.checked = true; }); });
        var dy = q("dy"); if (dy) { dy.addEventListener("focus", function () { var r1 = q("m-delta"); if (r1) r1.checked = true; }); try { dy.focus(); } catch (eF) {} }
      }
      previa();
      return true;
    },

    /* ------------------------------------------------ Propriedades: a seção "Elevação"
     * ids = as peças; o = { semNivel (a categoria já tem Nível base/Deslocamento) }.
     * → seção no formato da casca ({ nome, params }) | null */
    secao: function (ids, o) {
      o = o || {};
      var M = EL(), st = this.estado(); if (!M || !st || !arr(ids).length) return null;
      var L = this.niveis(), cp = M.campos(st, ids, L); if (!cp) return null;
      function num(v) { return v === undefined ? "" : (v == null ? "" : M.br(v, 3).replace(/0$/, "")); }
      var dica = cp.n > 1 ? "Várias peças: +0,30 sobe todas 30 cm; um valor sem sinal leva a mais baixa até ele e as outras andam o mesmo tanto." : "Em metros (vírgula); Enter aplica. As peças ligadas acompanham (Alt: só esta).";
      var ps = [{ id: "elev:base", rotulo: "Elevação da base", unidade: "m", tipo: "texto", valor: num(cp.base), placeholder: cp.base === undefined ? VARIOS : "", title: dica }];
      if (cp.temTopo) ps.push({ id: "elev:topo", rotulo: "Elevação do topo", unidade: "m", tipo: "texto", valor: num(cp.topo), placeholder: cp.topo === undefined ? VARIOS : "", title: cp.vertical ? "Na peça vertical (pilar, parede) o topo muda a altura; a base fica." : "A peça inteira vai junto." });
      if (!o.semNivel && cp.comNivel && L.length) {
        ps.push({ id: "elev:nivel", rotulo: "Nível de referência", tipo: "lista", valor: cp.nivel ? String(cp.nivel.id) : "", opcoes: (cp.nivel ? [] : [{ id: "", rotulo: VARIOS }]).concat(L.map(function (x) { return { id: x.id, rotulo: x.nome + " (" + M.sinal(x.elevacao) + " m)" }; })) });
        ps.push({ id: "elev:desl", rotulo: "Deslocamento", unidade: "m", tipo: "texto", valor: num(cp.desloc), placeholder: cp.desloc === undefined ? VARIOS : "", title: "A base em relação ao nível de referência. " + dica });
      }
      return { nome: "Elevação", params: ps };
    },
    /* a seção para a paleta do registro (js/bimpropsui.js): só quando alguma peça NÃO está presa a nível */
    secaoPaleta: function (ids) {
      var st = this.estado(), M = EL(); if (!st || !M) return null;
      var fs = arr(ids).map(function (id) { return M.info(st, id); }).filter(function (f) { return f && f.el && !f.motivo && (f.k === "caixa" || f.k === "familia" || f.k === "cobertura"); });
      if (!fs.length || fs.every(function (f) { return M.presa(f.el); })) return null;
      return this.secao(fs.map(function (f) { return f.id; }), { semNivel: fs.some(function (f) { return COM_RESTR[f.el.tipo] || f.k === "cobertura"; }) });
    },
    /* uma mudança num campo da seção → { ok, erro } */
    mudarCampo: function (ids, pid, valor, ev) {
      var campo = String(pid).replace(/^elev:/, "");
      if (["base", "topo", "nivel", "desl"].indexOf(campo) < 0) return { ok: false, erro: "Campo desconhecido." };
      if (campo === "nivel" && !valor) return { ok: false, erro: "Escolha um nível." };
      if (campo !== "nivel" && String(valor == null ? "" : valor).trim() === "") return { ok: false, erro: "Digite a cota." };
      var r = this.gravar("campo", { campo: campo === "desl" ? "desloc" : campo, bruto: valor }, { ids: arr(ids).map(String), evento: ev, pedido: "Propriedades — elevação" });
      if (!r.ok) { status(r.erro); toast(r.erro, "aviso"); }
      return r;
    },

    /* ------------------------------------------------ a fita, o atalho e o menu */
    registrar: function (reg, G) {
      this._G = G || this._G;
      var self = this;
      reg.elevar = function () { self.abrir(); return true; };
      try { var P = global.BimPrecisao; if (P) { P.ATALHOS_CMD = P.ATALHOS_CMD || {}; if (!P.ATALHOS_CMD.EL) P.ATALHOS_CMD.EL = "elevar"; } } catch (eA) {}
      this._ouvir();
      return true;
    },
    /* EL fora do modo de edição (no modo de edição quem atende é o js/bimprecisaoui.js, pelo ATALHOS_CMD, e ele
       para o evento: aqui não dispara de novo) */
    _ouvir: function () {
      if (this._ouvindo || typeof document === "undefined") return;
      this._ouvindo = true;
      var self = this;
      document.addEventListener("keydown", function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key || "")) return;
        var t = e.target || {};
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (document.getElementById("modal-bg")) return;
        var S = global.BimShell, raiz = S && S._raiz;
        if (!raiz || !document.body.contains(raiz) || raiz.offsetParent === null) return;
        var agora = Date.now(); self._tecla = (agora - self._teclaT < 1200 ? self._tecla : "") + e.key.toUpperCase(); self._teclaT = agora;
        if (self._tecla.slice(-2) !== "EL") return;
        self._tecla = "";
        if (!self.selecao().length) return;
        e.preventDefault();
        try { if (S.executar) S.executar("elevar"); else self.abrir(); } catch (eX) { self.abrir(); }
      });
    }
  };

  global.BimElevarUI = BimElevarUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimElevarUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

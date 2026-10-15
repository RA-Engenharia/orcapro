/* =====================================================================
 * bimpaginacaoui.js — PAGINAÇÃO NO MODELO, a TELA (prévia do modelador,
 * a mesma do ambiente). O motor é o js/bimpaginacao.js (puro); aqui só se
 * MOSTRA e se GRAVA op.
 *
 * O CAMINHO DO ROGÉRIO (14/10/2026)
 *   1. Modela as paredes e coloca o AMBIENTE em cada cômodo (Arquitetura ›
 *      Ambiente) — o contorno sai das paredes, na face.
 *   2. Acabamentos › Piso e revestimento › "Paginar piso" (ou botão direito
 *      no ambiente, na planta ou no 3D): escolhe o ambiente, mexe na peça, na
 *      junta, no assentamento, no sentido e na reserva, e vê as configurações
 *      LADO A LADO com os números (menor recorte, peças, perda, cortadas). A
 *      mais eficiente vem marcada; clica e aplica.
 *   3. A paginação aparece na PLANTA BAIXA (as juntas, os recortes em tom
 *      claro, a bolacha em alerta, o ponto de partida) e no 3D (as juntas e os
 *      recortes no piso). Fica gravada no ambiente; Ctrl+Z desfaz.
 *   4. "Paginar revestimento": as paredes selecionadas (clique, Ctrl+clique,
 *      caixa) ou as do ambiente — cada face voltada para o cômodo. Com a MESMA
 *      peça e a MESMA junta do piso, a parede HERDA a grade do piso: a junta
 *      vertical sobe da junta do piso. Peça diferente: não força, e diz o
 *      motivo na linha da face.
 *   5. Mexeu a parede: "desatualizada — repaginar" na planta, no 3D, na tela e
 *      na linha do orçamento — e as peças nunca saem do contorno novo.
 *   Sem ambiente no modelo, os comandos abrem a tela antiga por medidas
 *   digitadas (Gestao._paginar), que continua valendo.
 *
 * GANCHOS (nenhum novo no js/bim.js): os EXTRAS do ambiente
 * (BimAmbienteUI.registrarExtra: anotarPlanta, montar3d, aposRebuild), a
 * camada svgPaginacao do js/desenho2d.js, os comandos da fita em
 * js/gestao.js (_bimCascaAcoes) e os itens do botão direito
 * (Gestao._nivAquiLigarMenu → itensMenu).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function fmt(v, c) {
    if (!fin(v)) return "—";
    var D = global.Desenho2D; if (D && D.fmtNum) return D.fmtNum(v, c);
    return v.toFixed(c).replace(".", ",");
  }
  function cm(v) { if (!fin(v)) return "—"; var x = v * 100; return fmt(x, Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1) + " cm"; }
  function BP() { return global.BimPaginacao || null; }
  function PG() { return global.Paginacao || null; }
  function AU() { return global.BimAmbienteUI || null; }
  function B() { return global.BIM || null; }
  function UIg() { return global.UI || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function semRaio(o) { o.raycast = function () {}; return o; }

  /* a miniatura de uma opção: só as peças (o recorte em tom claro, a bolacha em
     alerta), o contorno e as ilhas. yBaixo: o plano da planta (z desce) */
  function svgMini(res, yBaixo) {
    var P = arr(res && res.ambiente); if (!P.length) return "";
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    P.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    var w = x1 - x0, h = y1 - y0, m = Math.max(w, h) * 0.04;
    function Y(y) { return yBaixo ? y : y0 + y1 - y; }
    function d(pts) { return arr(pts).map(function (q, i) { return (i ? "L" : "M") + r4(q[0]) + " " + r4(Y(q[1])); }).join("") + "Z"; }
    var dI = "", dR = "", dB = "";
    arr(res.pecas).forEach(function (p) { var s = d(p.poli); if (p.bolacha) dB += s; else if (p.inteira) dI += s; else dR += s; });
    var s = '<svg viewBox="' + r4(x0 - m) + " " + r4(y0 - m) + " " + r4(w + 2 * m) + " " + r4(h + 2 * m) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
    if (dR) s += '<path d="' + dR + '" fill="#f4dcb4"/>';
    if (dB) s += '<path d="' + dB + '" fill="#f0b3b3"/>';
    s += '<path d="' + dI + dR + dB + '" fill="none" stroke="#6b7682" stroke-width="0.6" vector-effect="non-scaling-stroke"/>';
    arr(res.vaos).forEach(function (v) { s += '<path d="' + d([[v.x, v.y], [v.x + v.l, v.y], [v.x + v.l, v.y + v.c], [v.x, v.y + v.c]]) + '" fill="#ffffff" stroke="#94a3b8" stroke-width="0.8" vector-effect="non-scaling-stroke"/>'; });
    arr(res.furos).forEach(function (f) { s += '<path d="' + d(f) + '" fill="#ffffff" stroke="#0f172a" stroke-width="1" vector-effect="non-scaling-stroke"/>'; });
    s += '<path d="' + d(P) + '" fill="none" stroke="#0f172a" stroke-width="1.4" vector-effect="non-scaling-stroke"/>';
    return s + "</svg>";
  }

  /* RECUSA NUNCA CALADA (a mesma régua do Gestao._pagLigar): tudo aqui é METRO */
  var LIMITES = {
    L: [0.01, 3, "A medida da peça é em METROS: 60 cm é 0,60."], C: [0.01, 3, "A medida da peça é em METROS: 60 cm é 0,60."],
    j: [0, 0.05, "A junta é em METROS: 3 mm é 0,003. Acima de 5 cm não é junta de cerâmica."],
    rm: [0, 1, "O recorte mínimo é em METROS: 10 cm é 0,10."], esp: [0, 0.1, "A espessura da peça é em METROS: 9 mm é 0,009."],
    rs: [0, 100, "A reserva é em %: de 0 a 100."], ang: [-90, 90, "O giro extra é em graus, de −90 a 90."],
    H: [0.1, 20, "A altura do revestimento é em METROS, a partir do piso: 1,50 é 1,50."]
  };

  var BimPaginacaoUI = {
    _pz: null, _pw: null, _api: null, _grp: null, _mats: null, _memo: null, _G: null,
    _ultPiso: null, _ultParede: null,

    ativo: function () { var A = AU(); try { return !!(A && A.ativo && A.ativo() && BP() && PG()); } catch (e) { return false; } },
    estado: function () { var b = B(); var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    niveis: function () { var A = AU(); return A && A.niveisObra ? A.niveisObra() : []; },
    ctx: function (st) {
      var b = B(), E = global.BimEdit, av = b && b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null;
      var v = {}; try { v = E && E.vaosDasParedes && av ? E.vaosDasParedes(st, av) : {}; } catch (e) { v = {}; }
      return { niveis: this.niveis(), vaos: v };
    },
    ambientes: function (st) { return arr(st && st.ambientes).filter(function (a) { return a && a.calc && a.calc.estado === "delimitado"; }); },
    _amb: function (st, id) { var s = String(id); return arr(st && st.ambientes).filter(function (a) { return a && String(a.id) === s; })[0] || null; },
    rotuloAmb: function (a) { var A = AU(); try { return A && A.rotuloNavegador ? A.rotuloNavegador(a) : txt(a && a.nome) || "Ambiente"; } catch (e) { return txt(a && a.nome) || "Ambiente"; } },
    nomeAmb: function (a) { var A = AU(), t = A && A.textoIdentificador ? A.textoIdentificador(a) : null; return t ? (t.numero ? t.numero + " · " : "") + t.nome : txt(a && a.nome) || "Ambiente"; },
    /* as PAREDES da seleção (clique, Ctrl+clique, caixa — BIM.selecao) */
    paredesSelecionadas: function (st) {
      var b = B(), uids = []; try { uids = (b && b.selecao ? b.selecao().uids : []) || []; } catch (e) { uids = []; }
      var tipos = {}; arr(st && st.caixas).forEach(function (c) { if (c && c.id != null) tipos[String(c.id)] = c.tipo; });
      return uids.map(function (u) { return /^edit:/.test(String(u)) ? String(u).slice(5) : null; }).filter(function (id) { return id && tipos[id] === "parede"; });
    },
    _invalidar: function () { this._memo = null; },

    /* ============================================================ PISO */
    abrirPiso: function (ambId) {
      if (!this.ativo() || !UIg()) return false;
      var st = this.estado(), lst = this.ambientes(st); if (!lst.length) return false;
      var A = AU(), id = ambId != null ? String(ambId) : (A && A.selecionado ? A.selecionado() : null);
      if (!id || !lst.some(function (a) { return String(a.id) === String(id); })) id = String(lst[0].id);
      this._pz = { ambId: id, prm: this._prmPisoDe(this._amb(st, id)), est: null, estUsuario: false };
      var R = BP().lerParams(this._amb(st, id), BP().CHAVE_PISO); if (R) { this._pz.est = R.est; this._pz.estUsuario = true; }
      var self = this;
      UIg().modal("Paginar piso — do ambiente modelado", '<div class="pgm" id="pgm-corpo" data-pgm-tela="piso" data-modal-largo="1">' + this._corpoPiso() + "</div>", [
        { texto: "Medidas digitadas…", classe: "ghost", onClick: function () { UIg().fecharModal(); var G = self._G || global.Gestao; if (G && G._paginar) G._paginar("piso"); } },
        { texto: "Imprimir prancha", classe: "", onClick: function () { self.prancha(); } },
        { texto: "Remover paginação", classe: "", onClick: function () { self._removerPiso(); } },
        { texto: "Fechar", classe: "", onClick: function () { UIg().fecharModal(); } },
        { texto: "Aplicar no ambiente", classe: "primary", onClick: function () { self._aplicarPiso(); } }
      ]);
      this._ligar("piso");
      return true;
    },
    _prmPisoDe: function (a) {
      var R = a ? BP().lerParams(a, BP().CHAVE_PISO) : null, p = BP().paramsPadrao("piso");
      var base = R ? BP().prmDoRegistro(R) : (this._ultPiso ? clone(this._ultPiso) : null);
      if (base) Object.keys(base).forEach(function (k) { if (base[k] != null) p[k] = base[k]; });
      return p;
    },
    _calcPiso: function () {
      var z = this._pz, st = this.estado(); if (!z || !st) return { erro: "O modelo não está aberto." };
      var a = this._amb(st, z.ambId); if (!a) return { erro: "O ambiente não existe mais no modelo." };
      var ctx = this.ctx(st), geo = BP().geometriaPiso(st, a, ctx), ap = BP().pisoAplicado(st, a, ctx);
      var out = { amb: a, geo: geo, ap: ap, st: st };
      if (!geo.ok) { out.erro = geo.motivo; return out; }
      var r = BP().opcoesPiso(geo, z.prm);
      if (!r.ok) { out.erro = r.motivo; return out; }
      var sel = null;
      if (z.estUsuario) r.opcoes.forEach(function (o) { if (o.id === z.est) sel = o; });
      if (!sel) r.opcoes.forEach(function (o) { if (o.melhor) sel = o; });
      z.est = sel.id;
      out.r = r; out.sel = sel; out.partida = BP().partidaDe(sel.res, r.motor, sel.id, geo);
      z.atual = out;
      return out;
    },
    _corpoPiso: function () {
      var z = this._pz, P = PG(), self = this, st = this.estado(), c = this._calcPiso(), p = z.prm, h = "";
      /* ---- o ambiente ---- */
      var ops = this.ambientes(st).map(function (a) { return '<option value="' + esc(a.id) + '"' + (String(a.id) === String(z.ambId) ? " selected" : "") + ">" + esc(self.rotuloAmb(a)) + "</option>"; }).join("");
      h += '<div class="pgm-topo"><label>Ambiente modelado<select data-pgm="amb">' + ops + "</select></label></div>";
      if (c.geo && c.geo.ok) {
        var g = c.geo;
        h += '<p class="pgm-info" data-pgm-geo="1">Contorno lido do modelo, na face da parede: <b>' + fmt(g.area, 2) + " m²</b> · " + g.contorno.length + " vértices" +
             (g.furos.length ? " · <b>" + g.furos.length + "</b> ilha(s) (pilar solto) descontada(s)" : "") +
             (g.portas.length ? " · <b>" + g.portas.length + "</b> porta(s): " + g.portas.map(function (q) { return fmt(q.largura, 2) + " m"; }).join(", ") + " (a soleira do vão é à parte)" : " · sem porta no contorno") +
             " · direção de referência " + fmt(g.ref, 1) + "° (maior lado de parede).</p>";
      }
      if (c.ap) {
        h += c.ap.estado === "ok"
          ? '<div class="pgm-aviso pgm-aviso-ok" data-pgm-aplicada="ok">Este ambiente já tem paginação aplicada: <b>' + esc(c.ap.rotulo) + "</b>, " + esc(this._rotEst(c.ap.reg.est)) + ". Aplicar de novo substitui (e o Ctrl+Z volta).</div>"
          : '<div class="pgm-aviso pgm-aviso-erro" data-pgm-aplicada="velha"><b>Paginação desatualizada — repaginar.</b> ' + esc(c.ap.motivo) + " Escolha a configuração e aplique de novo.</div>";
      }
      /* ---- os parâmetros ---- */
      var fmts = P.FORMATOS.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === p.fmt ? " selected" : "") + ">" + esc(f.rotulo) + " — " + esc(f.uso) + "</option>"; }).join("");
      var ass = P.ASSENTAMENTOS.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === p.as ? " selected" : "") + ">" + esc(a.rotulo) + "</option>"; }).join("");
      h += '<div class="pgm-campos">' +
        '<label>Peça<select data-pgm="fmt">' + fmts + '<option value="custom"' + (P.formato(p.fmt) ? "" : " selected") + ">Outra medida…</option></select></label>" +
        '<label>Largura L (m)<input type="number" step="0.005" min="0" data-pgm="L" value="' + p.L + '"></label>' +
        '<label>Comprimento C (m)<input type="number" step="0.005" min="0" data-pgm="C" value="' + p.C + '"></label>' +
        '<label>Junta (m)<input type="number" step="0.001" min="0" data-pgm="j" value="' + p.j + '"></label>' +
        '<label>Assentamento<select data-pgm="as">' + ass + "</select></label>" +
        '<label>Sentido da peça<select data-pgm="sen"><option value="longo"' + (p.sen !== "atravessado" ? " selected" : "") + ">C ao longo do maior lado</option>" +
          '<option value="atravessado"' + (p.sen === "atravessado" ? " selected" : "") + ">C atravessado ao maior lado</option></select></label>" +
        '<label>Giro extra (°)<input type="number" step="1" data-pgm="ang" value="' + num(p.ang, 0) + '"></label>' +
        '<label>Reserva / perda (%)<input type="number" step="1" min="0" data-pgm="rs" value="' + num(p.rs, 0) + '"></label>' +
        '<label>Recorte mínimo (m)<input type="number" step="0.01" min="0" data-pgm="rm" placeholder="automático" value="' + (p.rm != null ? p.rm : "") + '"></label>' +
        "</div>";
      if (c.erro) return h + '<div class="pgm-aviso pgm-aviso-erro" data-pgm-erro="1">' + esc(c.erro) + "</div>";
      /* ---- as configurações lado a lado ---- */
      h += '<p class="pgm-sec">Ponto de partida — clique na configuração e aplique</p><div class="pgm-cards" role="group" aria-label="Configurações de paginação">';
      c.r.opcoes.forEach(function (o) {
        var n = o.numeros, sel = o.id === c.sel.id;
        h += '<button type="button" class="pgm-card" data-pgm-op="' + esc(o.id) + '" aria-pressed="' + (sel ? "true" : "false") + '"' + (o.melhor ? ' data-pgm-melhor="1"' : "") + ' title="' + esc(o.quando) + '">' +
          '<span class="pgm-card-cab"><span class="pgm-card-tit">' + esc(o.rotulo) + "</span>" + (o.melhor ? '<span class="pgm-melhor">mais eficiente</span>' : "") + "</span>" +
          '<span class="pgm-mini">' + svgMini(o.res, true) + "</span>" + self._dl(n) + "</button>";
      });
      h += "</div>";
      h += '<p class="pgm-info">' + esc(c.sel.quando) + "</p>";
      /* ---- o desenho grande ---- */
      h += '<div class="pgm-desenho">' + P.svg(c.sel.res, { largura: 820, yBaixo: true, partida: c.partida }) + "</div>";
      /* ---- os números de compra ---- */
      var n = c.sel.numeros, rj = P.rejunte(c.sel.res, { espessura: p.esp }), co = P.colante(c.sel.res, {}), jm = P.juntasMovimentacao(c.sel.res, {});
      h += '<table class="pgm-tbl"><tbody>' +
        this._linha("Área a revestir", fmt(n.areaCoberta, 2) + " m²", "a que vai para a planilha em m² (sem as ilhas)") +
        this._linha("Peças — número seguro", "<b>" + n.pecas + "</b> peças · " + fmt(n.m2Compra, 2) + " m² de face", "cada recorte gasta uma peça; já com a reserva de " + fmt(n.reservaPct, 0) + " %") +
        this._linha("Peças — com aproveitamento", n.pecasAprov + " peças", "o assentador tira o outro lado do mesmo pedaço — estimativa de bancada") +
        this._linha("Perda pelos recortes", fmt(n.perdaPct, 1) + " %", "medida contra a cerâmica assentada, sem a reserva") +
        (rj.ok && rj.kgM2 > 0 ? this._linha("Rejunte", fmt(rj.kg, 2) + " kg (" + fmt(rj.kgM2, 3) + " kg/m²)", rj.nota) : "") +
        (co.ok ? this._linha("Argamassa colante", "<b>" + esc(co.classe) + "</b> · " + esc(co.rotulo) + " · " + co.sacosMin + " a " + co.sacosMax + " sacos de 20 kg", co.porqueClasse) : "") +
        (jm.ok && jm.precisa ? this._linha("Juntas de movimentação", jm.linhas.length + " junta(s) · " + fmt(jm.metros, 2) + " m", jm.nota) : "") +
        "</tbody></table>";
      if (co.ok && co.aviso) h += '<div class="pgm-aviso">' + esc(co.aviso) + "</div>";
      return h;
    },
    _dl: function (n) {
      var ruimR = n.bolachas > 0 || n.rentes > 0;
      return '<dl class="pgm-num">' +
        "<dt>Menor recorte</dt><dd" + (ruimR ? ' class="pgm-ruim"' : "") + ">" + (n.menorRecorte != null ? cm(n.menorRecorte) : "sem recorte") + "</dd>" +
        "<dt>Peças</dt><dd>" + n.pecas + "</dd>" +
        "<dt>Perda</dt><dd>" + fmt(n.perdaPct, 1) + " %</dd>" +
        "<dt>Cortadas</dt><dd>" + n.cortadas + "</dd>" +
        (n.bolachas ? '<dt>Recorte fino</dt><dd class="pgm-ruim">' + n.bolachas + "</dd>" : "") +
        (n.rentes ? '<dt>Corte rente</dt><dd class="pgm-ruim">' + n.rentes + "</dd>" : "") + "</dl>";
    },
    _linha: function (rot, val, nota) { return "<tr><td><b>" + esc(rot) + "</b>" + (nota ? '<span class="pgm-nota">' + esc(nota) + "</span>" : "") + '</td><td class="pgm-d">' + val + "</td></tr>"; },
    _rotEst: function (id) { return { canto: "peça inteira no canto", central: "centralizada", porta: "peça inteira na porta", otimizada: "otimizada" }[id] || txt(id); },

    _aplicarPiso: function () {
      var z = this._pz, c = z && z.atual;
      if (!c || !c.sel || !c.r) { toast("Escolha uma configuração válida antes de aplicar.", "aviso"); return false; }
      var reg = BP().registroPiso(c.geo, z.prm, c.sel, c.r.motor), r = BP().opAplicarPiso(z.ambId, reg);
      if (!r.ok) { toast(r.motivo, "erro"); return false; }
      var b = B(); if (!b || !b.b2Op || !b.b2Op(r.op)) { toast("O modelo recusou a paginação (formato do ambiente).", "erro"); return false; }
      this._ultPiso = clone(z.prm); this._invalidar();
      var nome = this.nomeAmb(c.amb), msg = "Paginação do piso aplicada em " + nome + ": " + BP().rotuloPeca(z.prm.L, z.prm.C) + ", " + this._rotEst(c.sel.id) + " — " +
        c.sel.numeros.pecas + " peças, perda " + fmt(c.sel.numeros.perdaPct, 1) + " %. Aparece na planta baixa e no 3D; Ctrl+Z desfaz.";
      UIg().fecharModal(); status(msg); toast("Paginação aplicada em " + nome + ".", "ok");
      this._redesenhar();
      return true;
    },
    _removerPiso: function () {
      var z = this._pz, st = this.estado(), a = z && this._amb(st, z.ambId);
      if (!a || !BP().lerParams(a, BP().CHAVE_PISO)) { toast("Este ambiente não tem paginação de piso aplicada.", "aviso"); return false; }
      var r = BP().opRemoverPiso(z.ambId), b = B();
      if (!r.ok || !b || !b.b2Op(r.op)) { toast("Não consegui remover a paginação.", "erro"); return false; }
      this._invalidar(); UIg().fecharModal(); status("Paginação do piso removida de " + this.nomeAmb(a) + ". Ctrl+Z devolve."); this._redesenhar();
      return true;
    },

    /* ============================================================ PAREDE */
    /* opts: { paredes:[ids] } | { ambId } — sem nada: a seleção; sem seleção: o ambiente selecionado (ou o 1º) */
    abrirParede: function (opts) {
      if (!this.ativo() || !UIg()) return false;
      opts = opts || {};
      var st = this.estado(), lst = this.ambientes(st); if (!lst.length) return false;
      var ids = opts.paredes && opts.paredes.length ? opts.paredes.map(String) : (opts.ambId != null ? [] : this.paredesSelecionadas(st));
      var A = AU(), amb = opts.ambId != null ? String(opts.ambId) : (A && A.selecionado ? A.selecionado() : null);
      if (!amb || !this._amb(st, amb)) amb = String(lst[0].id);
      this._pw = { paredes: ids, ambId: amb, prm: null, est: "melhor", sel: null };
      this._pw.prm = this._prmParedeIni(st);
      var self = this;
      UIg().modal("Paginar revestimento — paredes do modelo", '<div class="pgm" id="pgm-corpo" data-pgm-tela="parede" data-modal-largo="1">' + this._corpoParede() + "</div>", [
        { texto: "Medidas digitadas…", classe: "ghost", onClick: function () { UIg().fecharModal(); var G = self._G || global.Gestao; if (G && G._paginar) G._paginar("parede"); } },
        { texto: "Imprimir prancha", classe: "", onClick: function () { self.prancha(); } },
        { texto: "Remover destas faces", classe: "", onClick: function () { self._aplicarParedes(true); } },
        { texto: "Fechar", classe: "", onClick: function () { UIg().fecharModal(); } },
        { texto: "Aplicar nas faces", classe: "primary", onClick: function () { self._aplicarParedes(false); } }
      ]);
      this._ligar("parede");
      return true;
    },
    /* a peça da parede começa pela do PISO do ambiente (a régua do pedido: o mesmo
       revestimento do chão sobe para as paredes); senão a última usada; senão 30 × 60 */
    _prmParedeIni: function (st) {
      var p = BP().paramsPadrao("parede"), piso = this._pisoDasFaces(st);
      if (this._ultParede) { var u = this._ultParede; Object.keys(u).forEach(function (k) { if (u[k] != null) p[k] = u[k]; }); }
      else if (piso) { p.fmt = piso.fmt; p.L = piso.L; p.C = piso.C; p.j = piso.j; if (piso.esp != null) p.esp = piso.esp; }
      return p;
    },
    _faces: function (st) {
      var z = this._pw, ctx = this.ctx(st);
      if (z.prm && z.prm.hm === "info") ctx.alturaInf = num(z.prm.H, null);
      if (z.paredes && z.paredes.length) {
        /* as 4 paredes do banheiro também fazem face com a sala (a parede de fora
           corre pelos dois cômodos): fica o cômodo que TODAS as selecionadas fecham,
           quando ele existe; senão, todas as faces delas */
        var fs = BP().facesDasParedes(st, z.paredes, ctx), por = {};
        fs.forEach(function (f) { (por[f.ambId] = por[f.ambId] || {})[f.paredeId] = 1; });
        var comuns = Object.keys(por).filter(function (id) { return z.paredes.every(function (p) { return por[id][p]; }); });
        if (comuns.length && comuns.length < Object.keys(por).length) fs = fs.filter(function (f) { return comuns.indexOf(f.ambId) >= 0; });
        return { ctx: ctx, faces: fs, comuns: comuns };
      }
      var a = this._amb(st, z.ambId);
      return { ctx: ctx, faces: a ? BP().facesDoAmbiente(st, a, ctx) : [] };
    },
    _pisoDasFaces: function (st) {
      var z = this._pw; if (!z) return null;
      var f = this._faces(st).faces, vistos = {}, R = null, self = this;
      (f.length ? f.map(function (x) { return x.ambId; }) : [z.ambId]).forEach(function (id) {
        if (R || vistos[id]) return; vistos[id] = 1;
        var a = self._amb(st, id), r = a ? BP().lerParams(a, BP().CHAVE_PISO) : null; if (r) R = r;
      });
      return R;
    },
    _calcParede: function () {
      var z = this._pw, st = this.estado(), self = this; if (!z || !st) return { erro: "O modelo não está aberto." };
      var F = this._faces(st), pisos = {}, linhas = [];
      F.faces.forEach(function (f) {
        var a = self._amb(st, f.ambId);
        if (!(f.ambId in pisos)) pisos[f.ambId] = a ? BP().pisoAplicado(st, a, F.ctx) : null;
        var pa = pisos[f.ambId], l = { face: f, amb: a, pa: pa };
        if (!f.ok) { l.erro = f.motivo; linhas.push(l); return; }
        l.her = BP().herancaPiso(pa, f, z.prm);
        l.of = BP().opcoesFace(f, z.prm, l.her);
        if (!l.of.ok) { l.erro = l.of.motivo; linhas.push(l); return; }
        var sel = null; l.of.opcoes.forEach(function (o) { if (z.est === "melhor" ? o.melhor : o.id === z.est) sel = o; });
        l.sel = sel || l.of.opcoes.filter(function (o) { return o.melhor; })[0];
        l.cj = l.her.herda && pa && pa.res ? BP().conferirJuntas(f, l.sel.res, pa.res) : null;
        l.ap = a ? BP().paredeAplicada(st, a, f.chave, F.ctx, pa) : null;
        linhas.push(l);
      });
      var out = { linhas: linhas, st: st };
      if (!linhas.length) out.erro = z.paredes && z.paredes.length
        ? "As paredes selecionadas não delimitam nenhum ambiente: coloque o ambiente do cômodo (Arquitetura › Ambiente) para paginar a face de dentro."
        : "Este ambiente não tem face de parede para revestir.";
      z.atual = out;
      return out;
    },
    _corpoParede: function () {
      var z = this._pw, P = PG(), self = this, st = this.estado(), c = this._calcParede(), p = z.prm, h = "";
      if (z.paredes && z.paredes.length) {
        var nAmb = {}; c.linhas.forEach(function (l) { nAmb[l.face.ambId] = 1; });
        h += '<p class="pgm-info" data-pgm-fonte="selecao"><b>' + z.paredes.length + "</b> parede(s) selecionada(s) → <b>" + c.linhas.length + "</b> face(s) voltada(s) para " + Object.keys(nAmb).length + " ambiente(s). " +
             "Para trocar, feche, selecione outras (clique, Ctrl+clique ou caixa) e abra de novo — ou escolha um ambiente inteiro:</p>";
      }
      var ops = this.ambientes(st).map(function (a) { return '<option value="' + esc(a.id) + '"' + (!(z.paredes && z.paredes.length) && String(a.id) === String(z.ambId) ? " selected" : "") + ">" + esc(self.rotuloAmb(a)) + " — todas as paredes</option>"; }).join("");
      h += '<div class="pgm-topo"><label>Paredes de<select data-pgm="ambPar">' + (z.paredes && z.paredes.length ? '<option value="" selected>a seleção (' + z.paredes.length + " parede(s))</option>" : "") + ops + "</select></label>" +
           (this._pisoDasFaces(st) ? '<div class="pgm-acoes"><button type="button" class="btn sm" data-pgm-acao="usarPiso">Usar a peça do piso do ambiente</button></div>' : "") + "</div>";
      var fmts = P.FORMATOS.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === p.fmt ? " selected" : "") + ">" + esc(f.rotulo) + " — " + esc(f.uso) + "</option>"; }).join("");
      var ass = P.ASSENTAMENTOS.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === p.as ? " selected" : "") + ">" + esc(a.rotulo) + "</option>"; }).join("");
      var ests = [["melhor", "A mais eficiente de cada face"], ["canto", "Peça inteira no piso"], ["central", "Centralizada na altura"], ["otimizada", "Otimizada (menor recorte máximo)"]];
      h += '<div class="pgm-campos">' +
        '<label>Peça<select data-pgm="fmt">' + fmts + '<option value="custom"' + (P.formato(p.fmt) ? "" : " selected") + ">Outra medida…</option></select></label>" +
        '<label>Largura L (m)<input type="number" step="0.005" min="0" data-pgm="L" value="' + p.L + '"></label>' +
        '<label>Comprimento C (m)<input type="number" step="0.005" min="0" data-pgm="C" value="' + p.C + '"></label>' +
        '<label>Junta (m)<input type="number" step="0.001" min="0" data-pgm="j" value="' + p.j + '"></label>' +
        '<label>Assentamento<select data-pgm="as">' + ass + "</select></label>" +
        '<label>Peça na parede<select data-pgm="ori"><option value="deitada"' + (p.ori !== "em-pe" ? " selected" : "") + ">Deitada (maior lado na horizontal)</option>" +
          '<option value="em-pe"' + (p.ori === "em-pe" ? " selected" : "") + ">Em pé (maior lado na vertical)</option></select></label>" +
        '<label>Altura<select data-pgm="hm"><option value="auto"' + (p.hm !== "info" ? " selected" : "") + ">Até o forro / teto</option><option value=\"info\"" + (p.hm === "info" ? " selected" : "") + ">Informada</option></select></label>" +
        (p.hm === "info" ? '<label>Altura a revestir (m)<input type="number" step="0.05" min="0" data-pgm="H" value="' + (p.H != null ? p.H : 1.5) + '"></label>' : "") +
        '<label>Partida na altura<select data-pgm="est">' + ests.map(function (e) { return '<option value="' + e[0] + '"' + (z.est === e[0] ? " selected" : "") + ">" + e[1] + "</option>"; }).join("") + "</select></label>" +
        '<label>Reserva / perda (%)<input type="number" step="1" min="0" data-pgm="rs" value="' + num(p.rs, 0) + '"></label>' +
        "</div>";
      h += '<p class="pgm-info">Com a <b>mesma peça e a mesma junta</b> do piso do ambiente, a parede herda a grade do piso: a junta vertical sobe da junta do piso e só a altura é escolhida. Com peça diferente, a parede é paginada sozinha e a linha diz o motivo.</p>';
      if (c.erro) return h + '<div class="pgm-aviso pgm-aviso-erro" data-pgm-erro="1">' + esc(c.erro) + "</div>";
      /* ---- as faces ---- */
      var sel = null; c.linhas.forEach(function (l) { if (z.sel && l.face.chave === z.sel.chave && l.face.ambId === z.sel.ambId) sel = l; });
      if (!sel) sel = c.linhas.filter(function (l) { return l.sel; })[0] || c.linhas[0];
      if (sel) z.sel = { chave: sel.face.chave, ambId: sel.face.ambId };
      var tot = { pecas: 0, area: 0, n: 0 };
      h += '<table class="pgm-tbl" data-pgm-faces="' + c.linhas.length + '"><thead><tr><th>Face</th><th>Medidas</th><th>Junta com o piso</th><th class="pgm-d">Peças</th><th class="pgm-d">Perda</th><th class="pgm-d">Menor recorte</th></tr></thead><tbody>';
      c.linhas.forEach(function (l) {
        var f = l.face, ehSel = l === sel, nm = self.nomeAmb(l.amb) + " · parede " + f.paredeId + " (" + f.face + ")";
        var est = l.ap ? (l.ap.estado === "ok" ? ' <span class="pgm-nota">aplicada</span>' : ' <span class="pgm-nota pgm-ruim">aplicada · desatualizada — repaginar</span>') : "";
        if (l.erro) { h += '<tr class="pgm-face" data-pgm-face="' + esc(f.ambId + "|" + f.chave) + '"><td>' + esc(nm) + "</td><td colspan=\"5\" class=\"pgm-naoherda\">" + esc(l.erro) + "</td></tr>"; return; }
        var n = l.sel.numeros; tot.pecas += n.pecas; tot.area += n.areaCoberta; tot.n++;
        var her = l.her.herda
          ? '<span class="pgm-herda" data-pgm-herda="1">Herda o piso' + (l.cj && l.cj.n ? " · " + l.cj.n + " juntas, erro " + fmt(l.cj.erroMax * 1000, 2) + " mm" : "") + "</span>"
          : '<span class="pgm-naoherda" data-pgm-herda="0">Não herda: ' + esc(l.her.motivo) + "</span>";
        h += '<tr class="pgm-face" tabindex="0" data-pgm-face="' + esc(f.ambId + "|" + f.chave) + '" aria-selected="' + (ehSel ? "true" : "false") + '"><td>' + esc(nm) + est + "</td>" +
          "<td>" + fmt(f.L, 2) + " × " + fmt(f.H, 2) + " m" + (f.vaos.length ? '<span class="pgm-nota">' + f.vaos.length + " vão(s) descontado(s)</span>" : "") + "</td>" +
          "<td>" + her + "</td>" + '<td class="pgm-d">' + n.pecas + '</td><td class="pgm-d">' + fmt(n.perdaPct, 1) + ' %</td><td class="pgm-d">' + (n.menorRecorte != null ? cm(n.menorRecorte) : "—") + "</td></tr>";
      });
      h += "</tbody></table>";
      h += '<p class="pgm-info">' + tot.n + " face(s) · <b>" + tot.pecas + "</b> peças (número seguro, com a reserva) · " + fmt(tot.area, 2) + " m² a revestir.</p>";
      /* ---- a elevação da face escolhida ---- */
      if (sel && sel.sel) {
        h += '<p class="pgm-sec">Elevação — ' + esc(self.nomeAmb(sel.amb) + " · parede " + sel.face.paredeId + " (" + sel.face.face + ")") + ", vista de dentro do cômodo</p>";
        h += '<div class="pgm-desenho">' + P.svg(sel.sel.res, { largura: 760, marcasBase: sel.her && sel.her.herda ? sel.her.juntasPiso : null }) + "</div>";
      }
      return h;
    },
    _aplicarParedes: function (remover) {
      var z = this._pw, c = z && z.atual, self = this;
      if (!c || !c.linhas) { toast("Nada para gravar.", "aviso"); return false; }
      var lista = [];
      c.linhas.forEach(function (l) {
        if (remover) { if (l.ap) lista.push({ ambId: l.face.ambId, chave: l.face.chave, reg: null }); return; }
        if (!l.sel || l.erro) return;
        lista.push({ ambId: l.face.ambId, chave: l.face.chave, reg: BP().registroParede(l.face, z.prm, l.sel, l.her, l.of.motor) });
      });
      if (!lista.length) { toast(remover ? "Nenhuma destas faces tem paginação aplicada." : "Nenhuma face válida para paginar.", "aviso"); return false; }
      var r = BP().opsAplicarParedes(lista), b = B();
      if (!r.ok) { toast(r.motivo, "erro"); return false; }
      var feitas = 0; r.ops.forEach(function (o) { if (b && b.b2Op && b.b2Op(o)) feitas++; });
      if (!feitas) { toast("O modelo recusou a paginação.", "erro"); return false; }
      if (!remover) this._ultParede = clone(z.prm);
      this._invalidar();
      var herd = c.linhas.filter(function (l) { return l.her && l.her.herda; }).length;
      UIg().fecharModal();
      status(remover ? "Paginação removida de " + lista.length + " face(s). Ctrl+Z devolve."
        : "Revestimento paginado em " + lista.length + " face(s) (" + herd + " herdando a grade do piso), em " + feitas + " ambiente(s). Aparece no 3D e na planta; Ctrl+Z desfaz por ambiente.");
      toast(remover ? "Paginação removida." : "Revestimento aplicado em " + lista.length + " face(s).", "ok");
      self._redesenhar();
      return true;
    },

    /* ============================================================ eventos do modal */
    _ligar: function (tela) {
      var self = this, cx = document.getElementById("pgm-corpo"); if (!cx) return;
      function z() { return tela === "piso" ? self._pz : self._pw; }
      function repintar() { self._repintar(tela); }
      function recusa(m) { toast(m, "aviso"); repintar(); }
      function mexeu(e) {
        var el = e.target; if (!el || !el.getAttribute) return;
        var k = el.getAttribute("data-pgm"); if (!k) return;
        var Z = z(), p = Z.prm;
        if (k === "amb") { Z.ambId = el.value; Z.prm = self._prmPisoDe(self._amb(self.estado(), el.value)); var R = BP().lerParams(self._amb(self.estado(), el.value), BP().CHAVE_PISO); Z.est = R ? R.est : null; Z.estUsuario = !!R; return repintar(); }
        if (k === "ambPar") { if (el.value) { Z.ambId = el.value; Z.paredes = []; } Z.sel = null; return repintar(); }
        if (k === "fmt") { var f = PG().formato(el.value); if (f) { p.fmt = f.id; p.L = f.l; p.C = f.c; p.j = f.junta; p.esp = f.esp; } else p.fmt = "custom"; return repintar(); }
        if (k === "est" && tela === "parede") { Z.est = el.value; return repintar(); }
        if (LIMITES[k]) {
          var s = String(el.value).trim();
          if (k === "rm" && s === "") { p.rm = null; return repintar(); }
          var v = num(s, NaN), L = LIMITES[k];
          if (!fin(v) || v < L[0] || v > L[1]) return recusa(L[2]);
          if ((k === "L" || k === "C") && v < 0.02) return recusa(L[2]);
          p[k] = v; if (k === "L" || k === "C") p.fmt = "custom";
          return repintar();
        }
        p[k] = el.value;
        if (k === "hm" && el.value === "info" && p.H == null) p.H = 1.5;
        repintar();
      }
      cx.addEventListener("change", mexeu);
      cx.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target : null; if (!t) return;
        var card = t.closest("[data-pgm-op]");
        if (card) { var Z = z(); Z.est = card.getAttribute("data-pgm-op"); Z.estUsuario = true; return repintar(); }
        var fa = t.closest("[data-pgm-face]");
        if (fa && tela === "parede") { var pp = fa.getAttribute("data-pgm-face").split("|"); self._pw.sel = { ambId: pp[0], chave: pp.slice(1).join("|") }; return repintar(); }
        var ac = t.closest("[data-pgm-acao]");
        if (ac && ac.getAttribute("data-pgm-acao") === "usarPiso") {
          var R = self._pisoDasFaces(self.estado()); if (!R) return;
          var p = self._pw.prm; p.fmt = R.fmt; p.L = R.L; p.C = R.C; p.j = R.j; if (R.esp != null) p.esp = R.esp;
          toast("Peça do piso: " + BP().rotuloPeca(R.L, R.C) + ", junta " + fmt(R.j * 1000, 1) + " mm — a parede herda a grade.", "ok");
          return repintar();
        }
      });
      cx.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var fa = e.target && e.target.closest ? e.target.closest("[data-pgm-face]") : null;
        if (fa && tela === "parede") { e.preventDefault(); fa.click(); }
      });
    },
    _repintar: function (tela) {
      var cx = document.getElementById("pgm-corpo"); if (!cx) return;
      var at = document.activeElement, k = at && at.getAttribute ? at.getAttribute("data-pgm") : null;
      cx.innerHTML = tela === "piso" ? this._corpoPiso() : this._corpoParede();
      if (k) { var n = cx.querySelector('[data-pgm="' + k + '"]'); if (n) { try { n.focus(); } catch (e) {} } }
    },

    /* ============================================================ dados (planta e 3D) */
    /* tudo o que a paginação gravada desenha, para o estado de agora — uma conta por replay */
    _dados: function (st) {
      if (this._memo && this._memo.st === st) return this._memo.d;
      var d = { porAmb: {} }, self = this, ctx = null, M = BP();
      if (M) arr(st && st.ambientes).forEach(function (a) {
        if (!a || !a.params || !a.calc || a.calc.estado !== "delimitado") return;
        var temP = typeof a.params[M.CHAVE_PISO] === "string", chs = M.chavesParede(a);
        if (!temP && !chs.length) return;
        if (!ctx) ctx = self.ctx(st);
        var pa = null; try { pa = temP ? M.pisoAplicado(st, a, ctx) : null; } catch (e) { pa = null; }
        var x = { amb: a, piso: pa && pa.res ? pa : null, paredes: [] };
        chs.forEach(function (k) { var w = null; try { w = M.paredeAplicada(st, a, k.slice(M.PREF_PAREDE.length), ctx, pa); } catch (e) { w = null; } if (w && w.res && w.face) x.paredes.push(w); });
        d.porAmb[String(a.id)] = x;
      });
      this._memo = { st: st, d: d };
      return d;
    },
    /* as juntas verticais da fiada de baixo de uma face (s) */
    _juntasBase: function (w) {
      var f = w.face, j = num(w.reg && w.reg.j, 0.002), xs = [];
      arr(w.res.pecas).forEach(function (p) {
        var naBase = arr(p.poli).some(function (q) { return Math.abs(q[1] - f.vb) < 1e-3; }); if (!naBase) return;
        var dir = -Infinity; p.poli.forEach(function (q) { if (q[0] > dir) dir = q[0]; });
        if (dir < f.L - 1e-3) xs.push(dir + j / 2);
      });
      return xs;
    },
    /* gancho do ambiente na planta: acrescenta r.paginacao ao que o desenho leva */
    anotarPlanta: function (r, st, d) {
      if (!r || !this.ativo()) return;
      var ids = {}; arr(r.itens).forEach(function (it) { ids[String(it.id)] = 1; });
      var D = this._dados(st), pisos = [], paredes = [], self = this;
      Object.keys(D.porAmb).forEach(function (id) {
        if (!ids[id]) return;
        var x = D.porAmb[id], a = x.amb;
        if (x.piso) pisos.push({ id: id, pecas: x.piso.res.pecas.map(function (p) { return { pts: p.poli, t: p.bolacha ? "b" : (p.inteira ? "i" : "r") }; }),
          partida: x.piso.partida, velha: x.piso.estado !== "ok", aviso: a.ponto ? [num(a.ponto.x, NaN), num(a.ponto.z, NaN)] : null });
        x.paredes.forEach(function (w) {
          var f = w.face, off = 0.04;
          function P(s, o) { return [f.F0[0] + s * f.s[0] + f.n[0] * o, f.F0[1] + s * f.s[1] + f.n[1] * o]; }
          paredes.push({ id: id + "|" + w.chave, a: P(0, off), b: P(f.L, off), velha: w.estado !== "ok",
            marcas: self._juntasBase(w).map(function (s) { var p0 = P(s, 0.015), p1 = P(s, 0.07); return [p0[0], p0[1], p1[0], p1[1]]; }) });
        });
      });
      if (pisos.length || paredes.length) r.paginacao = { pisos: pisos, paredes: paredes };
    },
    _redesenhar: function () {
      var P = global.Bim2D;
      try { if (P && P.plantasAbertas) P.plantasAbertas().forEach(function (k) { try { P.redesenhar(k, false); } catch (e) {} }); } catch (e2) {}
      var st = this.estado(); if (st) this._desenhar3d(st);
    },

    /* ============================================================ 3D */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return;
      var T = api.THREE;
      if (this._grp && this._grp.parent) this._grp.parent.remove(this._grp);
      this._api = api; this._mats = null;
      this._grp = new T.Group(); this._grp.name = "pag-paginacao"; api.scene.add(this._grp);
      if (api.edit && api.edit.estado) this._desenhar3d(api.edit.estado);
    },
    aposRebuild: function (st) { this._desenhar3d(st); },
    _mat: function (k) {
      var T = this._api.THREE, M = this._mats || (this._mats = {});
      if (M[k]) return M[k];
      var c = { junta: 0x5b6570, velha: 0xd33a2c, rec: 0xf0c27a, bol: 0xe06666 }[k];
      M[k] = (k === "junta" || k === "velha") ? new T.LineBasicMaterial({ color: c })
        : new T.MeshBasicMaterial({ color: c, transparent: true, opacity: k === "bol" ? 0.62 : 0.5, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      return M[k];
    },
    _desenhar3d: function (st) {
      var api = this._api, g = this._grp; if (!api || !g || !api.THREE) return;
      var T = api.THREE, self = this;
      g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); });
      if (!st || !this.ativo()) return;
      var D = this._dados(st);
      function addLinhas(pos, mat, ud) { if (!pos.length) return; var ge = new T.BufferGeometry(); ge.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); var l = semRaio(new T.LineSegments(ge, mat)); l.renderOrder = 993; l.userData = ud; g.add(l); }
      function addMalha(pos, mat, ud) { if (!pos.length) return; var ge = new T.BufferGeometry(); ge.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); var m = semRaio(new T.Mesh(ge, mat)); m.renderOrder = 992; m.userData = ud; g.add(m); }
      function tri2d(P) {
        try { return T.ShapeUtils.triangulateShape(P.map(function (q) { return new T.Vector2(q[0], q[1]); }), []); }
        catch (e) { var o = []; for (var i = 1; i + 1 < P.length; i++) o.push([0, i, i + 1]); return o; }
      }
      Object.keys(D.porAmb).forEach(function (id) {
        var x = D.porAmb[id], base = num(x.amb.calc.base, 0);
        if (x.piso) {
          var y = base + 0.006, lin = [], rec = [], bol = [];
          x.piso.res.pecas.forEach(function (p) {
            var P = p.poli, n = P.length, i;
            for (i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; lin.push(a[0], y, a[1], b[0], y, b[1]); }
            if (p.inteira) return;
            var alvo = p.bolacha ? bol : rec;
            tri2d(P).forEach(function (t) { t.forEach(function (k) { alvo.push(P[k][0], y - 0.001, P[k][1]); }); });
          });
          var ud = { pagAmb: id, tipo: "piso", pecas: x.piso.res.pecas.length, estado: x.piso.estado };
          addLinhas(lin, self._mat(x.piso.estado === "ok" ? "junta" : "velha"), ud); addMalha(rec, self._mat("rec"), ud); addMalha(bol, self._mat("bol"), ud);
        }
        x.paredes.forEach(function (w) {
          var f = w.face, off = 0.004, lin = [], rec = [];
          function W(q) { return [f.F0[0] + q[0] * f.s[0] + f.n[0] * off, base + q[1], f.F0[1] + q[0] * f.s[1] + f.n[1] * off]; }
          w.res.pecas.forEach(function (p) {
            var P = p.poli.map(W), n = P.length, i;
            for (i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; lin.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
            if (p.inteira) return;
            for (i = 1; i + 1 < n; i++) rec.push(P[0][0], P[0][1], P[0][2], P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2]);
          });
          var ud = { pagAmb: id, tipo: "parede", chave: w.chave, pecas: w.res.pecas.length, estado: w.estado };
          addLinhas(lin, self._mat(w.estado === "ok" ? "junta" : "velha"), ud); addMalha(rec, self._mat("rec"), ud);
        });
      });
    },

    /* ============================================================ botão direito */
    /* { ev, ponto:[x,z] (planta), uid } → itens [{id, rotulo, fn}] */
    itensMenu: function (o) {
      if (!this.ativo()) return [];
      o = o || {};
      var st = this.estado(); if (!st || !this.ambientes(st).length) return [];
      var self = this, it = [], amb = null, BA = global.BimAcabamento;
      var alvo = o.ev && o.ev.target && o.ev.target.closest ? o.ev.target.closest("[data-d2-amb]") : null;
      if (alvo) amb = this._amb(st, alvo.getAttribute("data-d2-amb"));
      var p = o.ponto;
      if (!amb && !p && o.ev && this._api && this._api.planoPonto) { try { var q = this._api.planoPonto(o.ev.clientX, o.ev.clientY); if (q) p = [q.x, q.z]; } catch (e) {} }
      if (!amb && p && BA && BA.ambienteNoPonto) amb = BA.ambienteNoPonto(st, { x: p[0], z: p[1] });
      var paredes = this.paredesSelecionadas(st), sob = o.uid && /^edit:/.test(String(o.uid)) ? String(o.uid).slice(5) : null;
      var ehParede = sob && arr(st.caixas).some(function (c) { return c && String(c.id) === sob && c.tipo === "parede"; });
      if (ehParede && paredes.indexOf(sob) < 0) paredes = [sob];
      if (paredes.length) it.push({ id: "pag-parede", rotulo: paredes.length > 1 ? "Paginar revestimento (" + paredes.length + " paredes)…" : "Paginar revestimento desta parede…", fn: function () { self.abrirParede({ paredes: paredes }); } });
      if (amb && amb.calc && amb.calc.estado === "delimitado") {
        var nome = this.nomeAmb(amb);
        it.push({ id: "pag-piso", rotulo: "Paginar piso — " + nome + "…", fn: function () { self.abrirPiso(amb.id); } });
        if (!paredes.length) it.push({ id: "pag-parede-amb", rotulo: "Paginar revestimento das paredes — " + nome + "…", fn: function () { self.abrirParede({ ambId: amb.id }); } });
      }
      return it;
    },

    /* ============================================================ prancha */
    /* as paginações APLICADAS no modelo, uma folha por ambiente: o piso (com o ponto
       de partida) e cada face de parede em elevação, com os números de compra */
    prancha: function () {
      var st = this.estado(), P = PG(), App = global.App, self = this; if (!st || !P) return false;
      var D = this._dados(st), ids = Object.keys(D.porAmb); if (!ids.length) return false;
      var html = "", velhas = 0;
      function tab(n, extra) {
        return '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0 14px">' +
          "<tr><td style='padding:4px;border-bottom:1px solid #e2e8f0'>Área a revestir</td><td style='padding:4px;border-bottom:1px solid #e2e8f0'><b>" + fmt(n.areaCoberta, 2) + " m²</b></td></tr>" +
          "<tr><td style='padding:4px;border-bottom:1px solid #e2e8f0'>Peças a comprar (número seguro, com " + fmt(n.reservaPct, 0) + " % de reserva)</td><td style='padding:4px;border-bottom:1px solid #e2e8f0'><b>" + n.pecas + "</b> · " + fmt(n.m2Compra, 2) + " m² de face</td></tr>" +
          "<tr><td style='padding:4px;border-bottom:1px solid #e2e8f0'>Com aproveitamento de recorte</td><td style='padding:4px;border-bottom:1px solid #e2e8f0'>" + n.pecasAprov + " peças</td></tr>" +
          "<tr><td style='padding:4px;border-bottom:1px solid #e2e8f0'>Perda pelos recortes · peças cortadas</td><td style='padding:4px;border-bottom:1px solid #e2e8f0'>" + fmt(n.perdaPct, 1) + " % · " + n.cortadas + " cortadas · menor recorte " + (n.menorRecorte != null ? cm(n.menorRecorte) : "—") + "</td></tr>" +
          (extra || "") + "</table>";
      }
      ids.forEach(function (id) {
        var x = D.porAmb[id], a = x.amb, nome = self.nomeAmb(a);
        html += '<section style="page-break-after:always">';
        html += '<h1 style="margin:0 0 4px">Paginação — ' + esc(nome) + "</h1>";
        if (x.piso) {
          var R = x.piso.reg;
          if (x.piso.estado !== "ok") velhas++;
          html += "<h2 style='font-size:15px;margin:10px 0 4px'>Piso — " + esc(BP().rotuloPeca(R.L, R.C)) + " · junta " + fmt(R.j * 1000, 1) + " mm · " + esc(x.piso.res.assentamentoRotulo) + " · " + esc(self._rotEst(R.est)) + "</h2>" +
            (x.piso.estado !== "ok" ? "<p style='color:#b42318;font-weight:700;margin:0 0 6px'>DESATUALIZADA — REPAGINAR: " + esc(x.piso.motivo) + "</p>" : "") +
            "<p style='margin:0 0 6px;color:#475569;font-size:12px'>O círculo com a cruz é o ponto de partida: o cruzamento de juntas onde a primeira peça cheia encosta.</p>" +
            '<div style="margin:0 0 6px">' + P.svg(x.piso.res, { largura: 720, yBaixo: true, partida: x.piso.partida }) + "</div>" + tab(x.piso.numeros);
        }
        x.paredes.forEach(function (w) {
          if (w.estado !== "ok") velhas++;
          var juntas = null;
          if (w.herda && x.piso) { var h = BP().herancaPiso(x.piso, w.face, BP().prmDoRegistro(w.reg)); if (h.herda) juntas = h.juntasPiso; }
          html += "<h2 style='font-size:15px;margin:14px 0 4px'>Revestimento — parede " + esc(w.face.paredeId) + " (face " + esc(w.face.face) + "), " + fmt(w.face.L, 2) + " × " + fmt(w.face.H, 2) + " m · " + esc(w.rotulo) + (w.herda ? " · herda a grade do piso" : "") + "</h2>" +
            (w.estado !== "ok" ? "<p style='color:#b42318;font-weight:700;margin:0 0 6px'>DESATUALIZADA — REPAGINAR: " + esc(w.motivo) + "</p>" : "") +
            '<div style="margin:0 0 6px">' + P.svg(w.res, { largura: 720, marcasBase: juntas }) + "</div>" + tab(w.numeros);
        });
        html += "</section>";
      });
      html += "<p style='font-size:11px;color:#64748b;margin:12px 0 0'>Paginação calculada no modelo do OrçaPRO a partir do contorno do ambiente (face da parede). O número seguro considera que cada recorte gasta uma peça; o aproveitamento é estimativa de bancada. Junta de dessolidarização no perímetro sempre; junta de movimentação conforme a NBR 13753 e a ficha do produto.</p>";
      if (App && App._abrirPrint) App._abrirPrint("Pranchas de paginação" + (velhas ? " (" + velhas + " desatualizada(s))" : ""), html);
      status("Pranchas de paginação: " + ids.length + " ambiente(s)" + (velhas ? ", " + velhas + " desatualizada(s) — repaginar antes de mandar para a obra" : "") + ".");
      return true;
    },

    /* ============================================================ registro */
    registrar: function (G) {
      this._G = G || this._G;
      var A = AU(); if (A && A.registrarExtra) A.registrarExtra(this);
      return true;
    }
  };

  global.BimPaginacaoUI = BimPaginacaoUI;
  try { BimPaginacaoUI.registrar(global.Gestao || null); } catch (eR) {}
  if (typeof module !== "undefined" && module.exports) module.exports = BimPaginacaoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

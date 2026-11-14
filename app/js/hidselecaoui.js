/* =====================================================================
 * hidselecaoui.js — A FIAÇÃO da seleção e edição da peça de instalação (14/11/2026, ramo bim-selecao). O motor é o js/hidselecao.js.
 * Global: HidSelecaoUI.
 *
 *   · alcas(estado, uid)     as setas na peça selecionada (js/biminstcon.js as desenha junto com os "+"): girar ↻ e inverter ⇄ na caixa/ralo,
 *                            girar na louça/equipamento, inverter o ramal ⇋ no tê/junção.
 *   · acao(tipo, uid)        executa a seta (UMA op: um Ctrl+Z desfaz).
 *   · trocar(cxId, tipo)     troca a conexão do nó (Propriedades › Trocar a conexão) — a rede refaz, o orçamento conta a peça nova.
 *   · SNAP VISÍVEL           com a prévia hidro, passar o mouse sobre a peça/tubo mostra um pontinho no encaixe (boca, ponta, meio, eixo, ponto
 *                            do aparelho) e o nome dele; com o Tubo armado, o clique usa EXATAMENTE esse ponto (BimInstUI.clique pergunta
 *                            encaixeDoClique). Nada de CSS da faixa/fundo: um <div> próprio, por cima da vista.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM || null; }
  function HS() { return global.HidSelecao || null; }
  function U() { return global.BimInstUI || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function estado() { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e && e.estado ? e.estado : null; } catch (e2) { return null; } }
  function aval() { var b = B(); return function (f, t, i) { return b && b.familiaAvaliar ? b.familiaAvaliar(f, t, i) : null; }; }
  function aplicar(op) { var b = B(); if (!b || !op) return false; return op.op === "lote" ? b.editarLote(op) : b.instOp(op); }
  function noDe(id) { var R = U() && U()._ultimaRede; return R && R.conexoes ? R.conexoes.filter(function (c) { return c.id === id; })[0] || null : null; }
  /* depois da op a rede se refaz e o id do nó pode mudar: seleciona de novo o nó que ficou no mesmo lugar */
  function reselecionar(uid, P) {
    var b = B(); if (!b || !b.selecionar) return;
    setTimeout(function () {
      try {
        var u = uid;
        if (P && global.HidComponentes && U() && U()._ultimaRede) { var n = global.HidComponentes.noEm(U()._ultimaRede, P, 0.05); if (n) u = "edit:" + n.id; }
        b.selecionar([u], "trocar");
      } catch (e) {}
    }, 30);
  }

  var SU = {
    alcas: function (st, uid) {
      var id = String(uid || "").replace(/^edit:/, ""), I = global.BimInst, out = [], ins = st.instalacoes || {};
      var k = arr(ins.pecas).filter(function (x) { return String(x.id) === id; })[0];
      if (k && I && I.PECAS[k.peca] && /^(caixa_|ralo_)/.test(k.peca)) {
        var pas = HS() ? HS().passoGiro(k.peca) : 90;
        out.push({ alca: "girar", icone: "↻", x: k.x + 0.22, y: k.y + 0.05, z: k.z, nome: "Girar " + pas + "° (Shift: ao contrário; os tubos das bocas vão junto)", livre: false });
        out.push({ alca: "inverter", icone: "⇄", x: k.x - 0.22, y: k.y + 0.05, z: k.z, nome: "Inverter (180°): a saída passa para o outro lado", livre: false });
        return out;
      }
      var fi = arr(st.familias).filter(function (f) { return String(f.id) === id; })[0];
      if (fi && !fi.host && global.BimInstColocar) { out.push({ alca: "girar", icone: "↻", x: fi.x + 0.3, y: fi.y + 0.1, z: fi.z, nome: "Girar 90° (os tubos dos pontos vão junto)", livre: false }); return out; }
      var no = noDe(id);
      if (no && /^(te|juncao)/.test(String(no.tipo))) out.push({ alca: "inverter-ramal", icone: "⇋", x: no.x, y: no.y + 0.15, z: no.z, nome: "Inverter o lado do ramal (" + no.nome + ")", livre: false });
      return out;
    },
    acao: function (tipo, uid, ev) {
      var st = estado(), H = HS(), id = String(uid || "").replace(/^edit:/, ""), r = null, sg = ev && ev.shiftKey ? -1 : 1;
      if (!st || !H) return { ok: false, motivo: "O 3D ainda não abriu." };
      var k = arr((st.instalacoes || {}).pecas).filter(function (x) { return String(x.id) === id; })[0];
      if (tipo === "girar" && k) r = H.girarPeca(st, id, sg * H.passoGiro(k.peca));
      else if (tipo === "inverter" && k) r = H.inverterPeca(st, id);
      else if (tipo === "girar" && global.BimInstColocar) { var b = B(); r = global.BimInstColocar.girar(st, aval(), uid, sg, { ops: b && b.editarOps ? b.editarOps() : [] }); }
      else if (tipo === "inverter-ramal") { var no = noDe(id); r = no ? H.inverterRamal(st, aval(), no) : { ok: false, motivo: "Não achei o nó." }; if (r.ok) r.P = { x: no.x, y: no.y, z: no.z }; }
      if (!r) return { ok: false };
      if (!r.ok) { status(r.motivo); return r; }
      aplicar(r.op);
      status(tipo === "inverter-ramal" ? "Ramal invertido. Ctrl+Z desfaz." : (tipo === "inverter" ? "Peça invertida (180°)" : "Peça girada") + (r.tubos ? "; " + r.tubos + " tubo(s) acompanharam" : "") + ". Ctrl+Z desfaz.");
      reselecionar(uid, r.P);
      return r;
    },
    trocar: function (cxId, tipo) {
      var st = estado(), H = HS(), no = noDe(cxId);
      if (!st || !H || !no) { status("Não achei o nó."); return { ok: false }; }
      var r = H.trocar(st, aval(), no, tipo);
      if (!r.ok) { status(r.motivo); return r; }
      aplicar(r.op);
      status("Conexão do nó trocada" + (tipo === "duplo45" ? " por 2 × 45° (um tubo a 45° no canto)" : "") + ". Os tubos seguem ligados; o orçamento conta a peça nova. Ctrl+Z desfaz.");
      reselecionar("edit:" + cxId, { x: no.x, y: no.y, z: no.z });
      return r;
    },

    /* ------------------------------------------------ SNAP VISÍVEL */
    _ult: null, _el: null, _t: 0, _lista: null, _listaSig: null, _cur: null,
    _ativo: function () { var u = U(); try { return !!(u && u._previaHidro && u._previaHidro()); } catch (e) { return false; } },
    _sistema: function () { var u = U(); return u && u.cfg && u.cfg.ferramenta === "tubo" ? u.cfg.sistema : null; },
    _sobreVista: function (ev) {
      var t = ev && ev.target; if (!t || !t.closest) return false;
      var tela = t.closest('.bim-tela[data-ativa="1"]'); if (!tela) return false;
      return t.tagName === "CANVAS" || !!t.closest("svg");
    },
    mover: function (ev) {
      var self = SU; self._cur = { x: ev.clientX, y: ev.clientY };
      if (!self._ativo() || !self._sobreVista(ev) || (ev.buttons & 7)) { self.esconder(); return; }
      var now = Date.now(); if (now - self._t < 40) return; self._t = now;
      var st = estado(), H = HS(), K = global.BimInstCon; if (!st || !H || !K || !K._projetor) { self.esconder(); return; }
      /* revisão A3: a lista se refaz quando QUALQUER geometria muda (arrastar um tubo, girar uma peça), não só a contagem */
      var sis = self._sistema(), sig = sis + "|" + self._assinatura(st);
      if (self._listaSt !== st || self._listaSig !== sig) { self._lista = H.encaixes(st, aval(), { sistema: sis }); self._listaSt = st; self._listaSig = sig; }
      var e = H.encaixeTela(st, aval(), K._projetor(), self._cur, { lista: self._lista, sistema: sis, tol: 12 });
      if (!e) { self.esconder(); return; }
      self._ult = { e: e, t: now, x: ev.clientX, y: ev.clientY, sis: sis, assin: self._assinatura(st) };
      self.desenhar(e, ev.clientX, ev.clientY);
    },
    desenhar: function (e, cx, cy) {
      if (typeof document === "undefined") return;
      if (!this._el) {
        this._el = document.createElement("div"); this._el.className = "hid-snap-ponto"; this._el.setAttribute("data-hid-snap", "1");
        this._el.style.cssText = "position:fixed;left:0;top:0;z-index:41;pointer-events:none;display:none";
        this._el.innerHTML = '<span data-p style="position:absolute;width:7px;height:7px;margin:-4px 0 0 -4px;border-radius:50%;background:#2f6fd0;box-shadow:0 0 0 2px #fff"></span>' +
          '<span data-n style="position:absolute;left:9px;top:-22px;white-space:nowrap;font:500 11px/14px system-ui,sans-serif;color:#1d3f73;background:rgba(255,255,255,.92);border:1px solid #9db8e3;border-radius:3px;padding:1px 5px"></span>';
        document.body.appendChild(this._el);
      }
      var K = global.BimInstCon, pr = K && K._projetor ? K._projetor() : null, q = pr ? pr(e.P) : null;
      if (!q) { this.esconder(); return; }
      this._el.style.display = ""; this._el.style.left = q.x + "px"; this._el.style.top = q.y + "px";
      this._el.setAttribute("data-tipo", e.tipo);
      this._el.querySelector("[data-n]").textContent = { boca: "Boca", conector: "Ponto", ponta: "Ponta", meio: "Meio", eixo: "Eixo" }[e.tipo] + " · " + e.nome;
    },
    esconder: function () { this._ult = null; if (this._el) this._el.style.display = "none"; },
    /* o clique do Tubo: o encaixe que está à vista (fresco e com o cursor parado nele), no mesmo sistema da ferramenta */
    _assinatura: function (st) {
      /* revisão volta 2: roda dentro do clique do Tubo — um trecho sem p1/p2 não pode derrubar o clique (assinatura nova = encaixe descartado) */
      try { return this._assinatura0(st); } catch (eA) { return "x" + Date.now(); }
    },
    _assinatura0: function (st) {
      var I = st.instalacoes || {}, h = 0, n = 0;
      arr(I.trechos).forEach(function (t) { n++; h += (t.p1.x * 3.1 + t.p1.y * 5.3 + t.p1.z * 7.7 + t.p2.x * 11.3 + t.p2.y * 13.1 + t.p2.z * 17.9 + (+t.dn || 0)) * (n % 97 + 1); });
      arr(I.pecas).forEach(function (k) { n++; h += (k.x * 19.1 + k.y * 23.3 + k.z * 29.7 + (+k.rotY || 0) * 31.1 + (+k.rebaixo || 0) * 37.3) * (n % 89 + 1); });
      arr(st.familias).forEach(function (fi) { n++; h += ((+fi.x || 0) * 41.3 + (+fi.z || 0) * 43.7 + (+fi.rotY || 0) * 47.1) * (n % 83 + 1); });
      return n + ":" + Math.round(h * 1e4);
    },
    encaixeDoClique: function (sistema) {
      var u = this._ult; if (!u || Date.now() - u.t > 1500 || !this._cur) return null;
      if (Math.hypot(this._cur.x - u.x, this._cur.y - u.y) > 4) return null;
      if (u.sis !== (sistema || null)) return null;
      /* revisão A3: zoom/órbita/teclado mexem a câmera sem pointermove — o ponto é REPROJETADO com a câmera de agora e tem de estar sob o cursor;
         e a geometria não pode ter mudado desde o pontinho */
      var K = global.BimInstCon, pr = K && K._projetor ? K._projetor() : null, q = pr ? pr(u.e.P) : null;
      if (!q || Math.hypot(q.x - this._cur.x, q.y - this._cur.y) > 12) { this.esconder(); return null; }
      var st = estado(); if (!st || this._assinatura(st) !== u.assin) { this.esconder(); return null; }
      return JSON.parse(JSON.stringify(u.e));
    },
    instalar: function () {
      if (this._instalado || typeof document === "undefined") return; this._instalado = true;
      document.addEventListener("pointermove", function (ev) { try { SU.mover(ev); } catch (e) {} }, true);
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" || /^(Arrow|Page|Home|End)/.test(ev.key)) SU.esconder(); }, true);
      document.addEventListener("wheel", function () { SU.esconder(); }, { capture: true, passive: true });   /* revisão A3: zoom = o pontinho sai */
    }
  };
  if (typeof document !== "undefined") SU.instalar();
  global.HidSelecaoUI = SU;
  if (typeof module !== "undefined" && module.exports) module.exports = SU;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

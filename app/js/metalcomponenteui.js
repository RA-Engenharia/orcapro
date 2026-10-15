/* =====================================================================
 * metalcomponenteui.js — a TELA do COMPONENTE PARAMÉTRICO (peças prontas e
 * acessos da Metálica; só com a prévia do modelador). Frente M5 (fase 2 da
 * S10), 14/10/2026.
 *
 * Quem decide é o js/metalcomponente.js (puro). Aqui:
 *   · o CLIQUE numa peça de uma peça pronta (3D, planta, vistas) seleciona o
 *     componente inteiro — ganchos de uma linha no js/bim.js (sel3Clique e o
 *     clique das vistas) e no js/bimselecao.js (clique da planta);
 *   · TAB entra na peça clicada (e passa para a próxima do componente);
 *     Shift+Tab volta ao todo; com um diálogo aberto ou digitando, o Tab é
 *     de quem está na frente;
 *   · DUPLO CLIQUE abre o diálogo da peça pronta com os dados dela (Editar →
 *     "Atualizar no lugar": apagar + criar num lote só, um Ctrl+Z);
 *   · ALÇAS: com o componente inteiro selecionado, os botões no 3D esticam o
 *     comprimento, a largura ou a altura (arrastar com o mouse, ou setas do
 *     teclado com a alça em foco; Shift = passo de 5 cm); ao soltar, o
 *     componente é refeito no lugar pelo gerador de sempre (montantes
 *     redistribuídos pelo espaçamento máximo) — um Ctrl+Z por edição;
 *   · FIXAÇÃO AUTOMÁTICA POR MONTANTE: guarda-corpo com fixação "auto" lê o
 *     apoio embaixo de cada montante (laje → chapa chumbada; aço → soldado;
 *     nada → crítico) — gancho no resolver das peças prontas.
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function MC() { return global.MetalComponente || null; }
  function PU() { return global.MetalProntasUI || null; }
  function MP() { return global.MetalProntas || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var st = null;                                     /* { pronta, tipo, peca, dentro } — o componente da última seleção */
  var A = { lista: [], camada: null, pronta: null, arrasto: null, raf: 0, ultimo: null };

  function css() {
    if (typeof document === "undefined" || document.getElementById("mcomp-css")) return;
    var s = document.createElement("style"); s.id = "mcomp-css";
    s.textContent = ".mcomp-camada{position:absolute;inset:0;pointer-events:none;z-index:6}" +
      ".mcomp-alca{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid var(--surface,#fff);background:var(--amarelo,#d99a1e);box-shadow:0 0 0 1px var(--texto,#1d2733);pointer-events:auto;cursor:grab;padding:0}" +
      ".mcomp-alca[data-k=y]{border-radius:3px;cursor:ns-resize}.mcomp-alca:focus-visible{outline:2px solid var(--verde,#15803d);outline-offset:2px}.mcomp-alca.arrastando{cursor:grabbing;background:var(--verde,#15803d)}" +
      ".mcomp-rot{position:absolute;transform:translate(14px,-50%);white-space:nowrap;font-size:11.5px;padding:3px 7px;border-radius:6px;background:var(--surface,#fff);color:var(--texto,#1d2733);border:1px solid var(--linha,#9aa5b1);pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.18)}" +
      ".mcomp-rot.falha{border-color:var(--vermelho,#b91c1c);color:var(--vermelho,#b91c1c)}";
    document.head.appendChild(s);
  }
  function caixas() { var U = PU(); return U ? U.caixas() : []; }
  function bbox(ids) {
    var BM = global.BimMetal, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], por = {};
    caixas().forEach(function (c) { por[String(c.id)] = c; });
    (ids || []).forEach(function (id) {
      var c = por[String(id)]; if (!c) return;
      var pts = [];
      try { if (BM && BM.solidos && c.metal) BM.solidos(c).forEach(function (s) { s.poli.forEach(function (q) { pts.push(s.ponto(q[0], q[1], s.z0)); pts.push(s.ponto(q[0], q[1], s.z1)); }); }); } catch (e) { pts = []; }
      if (!pts.length && isFinite(+c.cx)) pts.push([+c.cx, +c.cy + num(c.altura, 0) / 2, +c.cz], [+c.cx, +c.cy - num(c.altura, 0) / 2, +c.cz]);
      pts.forEach(function (P) { for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[k]); mx[k] = Math.max(mx[k], P[k]); } });
    });
    return isFinite(mn[0]) ? { mn: mn, mx: mx } : null;
  }
  function modalAberto() { try { return !!(global.document && global.document.getElementById("modal-bg")); } catch (e) { return false; } }
  function bimNaTela() { var b = B(), h = b && b.host ? b.host() : null; return !!(h && h.isConnected && h.getClientRects().length); }

  var MetalComponenteUI = {
    ativo: function () { return previa() && !!MC() && !!PU() && !!MP(); },
    estado: function () { return { st: st ? JSON.parse(JSON.stringify(st)) : null, alcas: A.lista.map(function (a) { return { k: a.k, campo: a.campo, valor: a.valor, p: a.p, dir: a.dir }; }), pronta: A.pronta, arrastando: !!A.arrasto, ultimo: A.ultimo }; },

    /* ------------------------------------------------ 1) o CLIQUE: o componente inteiro */
    expandir: function (uid, o) {
      if (!this.ativo() || !uid) return uid ? [uid] : [];
      var r = MC().expandir(caixas(), uid, st);
      st = r.st;
      if (st && !st.dentro) { var T = MP().TIPOS[st.tipo] || {}; status("Componente: " + (T.rotulo || st.tipo) + " (" + r.uids.length + " peças). Tab entra na peça; duplo clique edita; as alças esticam e tudo se refaz."); }
      return r.uids;
    },
    /* ------------------------------------------------ 2) TAB */
    tecla: function (e) {
      if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey || !st || !this.ativo() || modalAberto() || A.arrasto) return false;
      var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName || "") && !(t.classList && t.classList.contains("mcomp-alca"))) return false;
      if (t.isContentEditable || !bimNaTela()) return false;
      var b = B(), sel = b && b.selecao ? b.selecao().uids || [] : [], g = MP().prontas(caixas()).filter(function (p) { return p.id === st.pronta; })[0];
      if (!g || !sel.length || !sel.every(function (u) { return g.pecas.indexOf(MC().idDe(u)) >= 0; })) return false;
      var r = MC().tab(caixas(), st, !!e.shiftKey); if (!r) return false;
      e.preventDefault(); e.stopPropagation();
      st = r.st;
      try { b.selecionar(r.uids, "trocar"); } catch (eS) {}
      status(r.texto);
      return true;
    },
    /* ------------------------------------------------ 3) DUPLO CLIQUE: abre o diálogo da peça pronta */
    duplo: function (uid) {
      if (!this.ativo() || !uid) return false;
      var id = MC().idDe(uid); if (!id) return false;
      var g = MC().grupo(caixas(), id); if (!g || !g.info || !g.info.par) return false;
      var U = PU(), alvo = U.pronta(g.id); if (!alvo) return false;
      try { B().selecionar(g.pecas.map(function (p) { return "edit:" + p; }), "trocar"); } catch (e) {}
      st = { pronta: g.id, tipo: g.tipo, peca: uid, dentro: false };
      this.ultimoDuplo = { pronta: g.id, tipo: alvo.tipo, n: g.n };
      U.dialogo(alvo.tipo, { alvo: alvo });
      return true;
    },
    /* ------------------------------------------------ 4) as ALÇAS (com o componente inteiro selecionado) */
    aoSelecionar: function (uids) {
      if (!this.ativo() || A.arrasto) return;
      var pr = MC().inteiro(caixas(), uids);
      if (!pr) { this.limparAlcas(); return; }
      if (A.pronta === pr && A.lista.length) return;
      this.montarAlcas(pr);
    },
    limparAlcas: function () { A.lista = []; A.pronta = null; if (A.camada) A.camada.innerHTML = ""; if (A.raf && global.cancelAnimationFrame) global.cancelAnimationFrame(A.raf); A.raf = 0; },
    montarAlcas: function (prontaId) {
      var U = PU(), M = MP(), b = B(); if (!U || !M || !b || !b.host || !b.telaDe) return false;
      var pr = U.pronta(prontaId); if (!pr || !pr.info || !pr.info.par) { this.limparAlcas(); return false; }
      var par = M.parParaRefazer(pr), lista = MC().alcas(pr.tipo, par, bbox(pr.pecas));
      this.limparAlcas(); if (!lista.length) return false;
      css();
      var host = b.host(); if (!host) return false;
      if (!A.camada || A.camada.parentNode !== host) { A.camada = global.document.createElement("div"); A.camada.className = "mcomp-camada"; A.camada.setAttribute("data-mcomp", "alcas"); host.appendChild(A.camada); this._ligar(A.camada); }
      A.pronta = prontaId; A.lista = lista; A.tipo = pr.tipo;
      lista.forEach(function (a, i) {
        var bt = global.document.createElement("button"); bt.type = "button"; bt.className = "mcomp-alca"; bt.setAttribute("data-mcomp-alca", String(i)); bt.setAttribute("data-k", a.k);
        bt.title = a.rotulo + " (" + br(a.valor) + " m) — arraste para esticar; setas: 1 cm (Shift: 5 cm). Tudo se refaz; Ctrl+Z volta.";
        bt.setAttribute("aria-label", a.rotulo + " — alça para esticar"); A.camada.appendChild(bt); a.dom = bt;
      });
      var self = this, passo = function () { if (!A.lista.length) { A.raf = 0; return; } self.posicionar(); A.raf = global.requestAnimationFrame ? global.requestAnimationFrame(passo) : 0; };
      passo();
      return true;
    },
    _tela: function (P) { var b = B(), h = b.host(), t = b.telaDe(P[0], P[1], P[2]), r = h.getBoundingClientRect(); return t ? { x: t.x - r.left, y: t.y - r.top, cx: t.x, cy: t.y, fora: !!t.atras } : null; },
    posicionar: function () {
      var self = this;
      A.lista.forEach(function (a) {
        if (!a.dom) return;
        var P = A.arrasto && A.arrasto.a === a ? A.arrasto.P : a.p, t = self._tela(P); if (!t) return;
        a.dom.style.display = t.fora ? "none" : ""; a.dom.style.left = t.x + "px"; a.dom.style.top = t.y + "px";
        if (A.arrasto && A.arrasto.a === a && A.arrasto.rot) { A.arrasto.rot.style.left = t.x + "px"; A.arrasto.rot.style.top = t.y + "px"; }
      });
    },
    /* o texto ao vivo da alça: o valor e, no guarda-corpo, quantos montantes ficam e a que distância */
    _previa: function (a, valor) {
      var U = PU(), M = MP(), pr = U.pronta(A.pronta); if (!pr) return { ok: false, texto: "" };
      var e = MC().esticar(pr.tipo, M.parParaRefazer(pr), a.k, valor); if (!e.ok) return { ok: false, texto: e.motivo || "não cabe", valor: e.valor };
      var tx = a.rotulo + ": " + br(e.valor) + " m";
      if (pr.tipo === "guardacorpo" && global.MetalAcessos && MetalAcessos.postsGuarda) { var ps = MetalAcessos.postsGuarda(e.par), L = num(e.par.comprimento, 0), es = num(e.par.espac, 1); tx += " · " + ps.length + " montantes a ≤ " + br(es) + " m"; }
      return { ok: true, texto: tx, valor: e.valor, par: e.par };
    },
    _ligar: function (camada) {
      var self = this;
      camada.addEventListener("pointerdown", function (e) {
        var bt = e.target.closest ? e.target.closest("[data-mcomp-alca]") : null; if (!bt) return;
        var a = A.lista[+bt.getAttribute("data-mcomp-alca")]; if (!a) return;
        e.preventDefault(); e.stopPropagation();
        try { bt.setPointerCapture(e.pointerId); } catch (eC) {}
        var t0 = self._tela(a.p), d1 = [a.p[0] + a.dir[0], a.p[1] + a.dir[1], a.p[2] + a.dir[2]], t1 = self._tela(d1);
        var v = t0 && t1 ? [t1.x - t0.x, t1.y - t0.y] : [1, 0], v2 = v[0] * v[0] + v[1] * v[1];
        if (v2 < 4) { v = a.k === "y" ? [0, -40] : [40, 0]; v2 = 1600; }   /* a direção aponta para a câmera: 40 px por metro */
        var rot = global.document.createElement("div"); rot.className = "mcomp-rot"; rot.setAttribute("data-mcomp", "rotulo"); camada.appendChild(rot);
        A.arrasto = { a: a, x0: e.clientX, y0: e.clientY, v: v, v2: v2, valor: a.valor, P: a.p.slice(), rot: rot, bt: bt, id: e.pointerId };
        bt.classList.add("arrastando");
        var pv = self._previa(a, a.valor); rot.textContent = pv.texto; self.posicionar();
      });
      camada.addEventListener("pointermove", function (e) {
        var d = A.arrasto; if (!d || e.pointerId !== d.id) return;
        var m = ((e.clientX - d.x0) * d.v[0] + (e.clientY - d.y0) * d.v[1]) / d.v2, passo = e.shiftKey ? 0.05 : 0.01;
        var valor = Math.round((d.a.valor + m) / passo) * passo, pv = self._previa(d.a, valor);
        d.valor = pv.valor != null ? pv.valor : valor; var dl = d.valor - d.a.valor;
        d.P = [d.a.p[0] + d.a.dir[0] * dl, d.a.p[1] + d.a.dir[1] * dl, d.a.p[2] + d.a.dir[2] * dl];
        d.rot.textContent = pv.texto; d.rot.classList.toggle("falha", !pv.ok); d.okPrev = pv.ok;
        self.posicionar();
      });
      function soltar(e, cancelou) {
        var d = A.arrasto; if (!d) return;
        A.arrasto = null;
        try { d.bt.releasePointerCapture(d.id); } catch (eR) {}
        d.bt.classList.remove("arrastando"); if (d.rot && d.rot.parentNode) d.rot.parentNode.removeChild(d.rot);
        if (cancelou || Math.abs(d.valor - d.a.valor) < 0.005) { self.posicionar(); return; }
        self.esticar(d.a.k, d.valor);
      }
      camada.addEventListener("pointerup", function (e) { soltar(e, false); });
      camada.addEventListener("pointercancel", function (e) { soltar(e, true); });
      camada.addEventListener("keydown", function (e) {
        var bt = e.target.closest ? e.target.closest("[data-mcomp-alca]") : null; if (!bt) return;
        var a = A.lista[+bt.getAttribute("data-mcomp-alca")]; if (!a) return;
        var s = e.shiftKey ? 0.05 : 0.01, dv = (e.key === "ArrowRight" || e.key === "ArrowUp") ? s : ((e.key === "ArrowLeft" || e.key === "ArrowDown") ? -s : 0);
        if (e.key === "Escape" && A.arrasto) { e.preventDefault(); soltar(e, true); return; }
        if (!dv) return;
        e.preventDefault(); e.stopPropagation();
        self.esticar(a.k, a.valor + dv);
      });
    },
    /* ESTICAR pela alça (k) até o valor: refaz o componente no lugar (um lote: apagar + criar — um Ctrl+Z) e seleciona de novo */
    esticar: function (k, valor) {
      var U = PU(), M = MP(), b = B(), pr = U ? U.pronta(A.pronta || (st && st.pronta)) : null;
      if (!pr || !pr.info || !pr.info.par) return { ok: false, motivo: "Selecione o componente." };
      var e = MC().esticar(pr.tipo, M.parParaRefazer(pr), k, valor);
      if (!e.ok) { status("Esticar: " + e.motivo); toast(e.motivo, "aviso", 7000); return e; }
      var opsAntes = b && b.editarEstado ? (b.editarEstado() || {}).ops : null;
      var r = U.colocar(pr.tipo, e.par, {}, pr, { semEnquadrar: true });
      if (!r || !r.ok) return r || { ok: false };
      A.ultimo = { tipo: pr.tipo, prontaId: pr.id, campo: e.campo, valor: e.valor, antes: opsAntes, depois: b && b.editarEstado ? (b.editarEstado() || {}).ops : null, montantes: r.medidas ? r.medidas.montantes : null, espac: e.par.espac, resumo: r.resumo };
      if (pr.tipo === "guardacorpo" && MC().espacamentoGuarda) { var eg = MC().espacamentoGuarda(r); if (eg) { A.ultimo.vaoMax = eg.max; A.ultimo.espacOk = eg.ok; } }
      status(e.texto + " — refeito no lugar (" + Object.keys(r.finais || {}).length + " peças). Ctrl+Z volta.");
      this.reselecionar(pr.id);
      return { ok: true, r: r, valor: e.valor };
    },
    reselecionar: function (prontaId) {
      var self = this, n = 0;
      A.lista = []; A.pronta = null;
      (function tenta() {
        var U = PU(), b = B(), pr = U ? U.pronta(prontaId) : null;
        var ok = pr && b && b.selecionar ? b.selecionar(pr.pecas.map(function (p) { return "edit:" + p; }), "trocar") : [];
        if ((!ok || !ok.length) && ++n < 30) { setTimeout(tenta, 60); return; }
        st = pr ? { pronta: prontaId, tipo: pr.tipo, peca: "edit:" + pr.pecas[0], dentro: false } : null;
        if (pr) self.montarAlcas(prontaId);
      })();
    },

    /* ------------------------------------------------ 5) FIXAÇÃO AUTOMÁTICA POR MONTANTE (o resolver das peças prontas) */
    resolverPar: function (tipo, par) {
      if (tipo !== "guardacorpo" || !par || par.fixacao !== "auto" || !global.MetalAcessos || !MetalAcessos.postsGuarda) return par;
      var E = global.MetalEscadaLinha; if (!E || !E.elementos || !E.elementoEm) return par;
      var ignorar = par._prontaId ? String(par._prontaId) : null;
      var els = E.elementos(caixas()).filter(function (el) { var c = el.caixa || {}; return !(c.metal && c.metal.acessorio) && !(ignorar && String(c.pronta) === ignorar); });
      var posts = MetalAcessos.postsGuarda(par), fx = MC().fixacaoPorMontante(posts, els, E.elementoEm);
      var q = JSON.parse(JSON.stringify(par));
      q.fixacoes = fx.codigos.join(";");
      q.suporte = fx.por.c && !fx.por.s ? "concreto" : (fx.por.s && !fx.por.c ? "aco" : (fx.por.c ? "misto" : ""));
      if (fx.concreto) { if (!(num(q.concEsp, 0) > 0) && fx.concreto.esp) q.concEsp = fx.concreto.esp; if (!(num(q.concFck, 0) > 0) && fx.concreto.fck) q.concFck = fx.concreto.fck; }
      q.fixAuto = fx.texto;
      return q;
    }
  };

  /* o Tab na CAPTURA (antes de o navegador trocar o foco) */
  if (typeof global.addEventListener === "function") global.addEventListener("keydown", function (e) { try { MetalComponenteUI.tecla(e); } catch (eT) {} }, true);

  global.MetalComponenteUI = MetalComponenteUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalComponenteUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

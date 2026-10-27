/* =====================================================================
 * bimapoiarui.js — APOIAR EM… NA TELA (fiação fina; a conta é do js/bimapoiar.js, a cena do js/bim.js).
 * 27/10/2026. Pedido do Rogério: "clicar na caixa d'água, identificou ela, aí eu clico agora onde vai ser o apoio dela,
 * aí ela pega e baixa para aquele apoio. Ou subir."
 *
 * COMO SE USA
 *   · o comando "Apoiar em…" (fita › Modificar, botão direito na peça, atalho AE);
 *   · 1º clique escolhe a peça — com uma seleção já feita, ela vale e pula direto para o 2º;
 *   · 2º clique em QUALQUER superfície (laje, forro, telhado, piso, estrado, terreno, outra peça): a peça sobe ou desce até a
 *     face de baixo encostar nela. Antes de clicar, o cursor mostra a silhueta da peça na cota nova e o texto
 *     "base a 6,35 m (sobe 0,42)"; Esc cancela.
 *   · UMA operação: a MESMA do Elevar (op `elevar`, js/bimelevar.js) — vínculos, Alt ("só a seleção") e Ctrl+Z são os de hoje.
 *
 * POR QUE OS CLIQUES SÃO ESCUTADOS AQUI (e não no S._aoTocar): com o editor ligado o js/bim.js não chama o S._aoTocar
 * (`ferramentaClique()`), e o esquerdo é da seleção (`S._sel3Up`). Enquanto o Apoiar está armado `S._apoiando` tira a seleção
 * do caminho (semFerramenta3d) e a captura da janela recebe o ponteiro. O botão do meio (mover a vista) segue livre.
 *
 * O QUE ACONTECE COM OS TUBOS (caixa d'água do Hidro): o mesmo que no Mover/Elevar de hoje — a peça muda de cota e os tubos
 * ligados NÃO a acompanham sozinhos (só o Alinhar leva a rede); o Traçar automaticamente (TA) refaz na cota nova. Depois de
 * gravar, a barra de estado diz quantos tubos ficaram para trás.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM || null; }
  function AP() { return global.BimApoiar || null; }
  function EU() { return global.BimElevarUI || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  var LIMIAR_CLIQUE = 10;     /* px: mais que isto entre apertar e soltar é arrasto, não clique */
  var INTERVALO_PREVIA = 220; /* ms entre duas contas de prévia (umas 600 raios por conta: o contorno de 1 cm) */

  var BimApoiarUI = {
    levarRede: true,   /* a rede ligada à peça vai junto (desligar só para o e2e provar que sem isto o Hidro acusa) */
    _on: false, _passo: null, _ids: [], _uids: [], _excluir: [], _caixa: null, _down: null, _tPrev: 0, _rot: null, _fn: null, _ultimo: null, _hoverUid: null,

    estado: function () { var b = B(), e = null; try { e = b && b.editarEstado ? b.editarEstado() : null; } catch (x) { e = null; } return e ? e.estado : null; },
    ativo: function () { return this._on; },
    passo: function () { return this._passo; },

    /* ------------------------------------------------ o comando */
    iniciar: function () {
      var b = B(), st = this.estado(), M = AP();
      if (!M || !b || !st || !b.apoiarCanvas || !b.apoiarCanvas()) { status("Abra o editor do modelo (3D) para usar o Apoiar em…."); return false; }
      if (this._on) this._desarmar();
      var eu = EU(), ids = eu && eu.selecao ? eu.selecao() : [];
      this._armar();
      if (ids.length && this._escolher(ids)) return true;
      this._passo = "peca";
      status("Apoiar em…: clique a peça que vai subir ou descer (Esc cancela).");
      return true;
    },

    /* a peça escolhida (ids do editor): expande o componente, mede a caixa, monta a silhueta → passa ao 2º clique */
    _escolher: function (ids) {
      var M = AP(), b = B(), st = this.estado();
      var ex = M.expandir(st, ids), uids = ex.ids.map(function (i) { return "edit:" + i; });
      var cx = b.apoiarCaixa(uids);
      if (!cx) { status("Apoiar em…: não achei a peça no 3D (ela está oculta?). Clique outra peça."); return false; }
      this._ids = ex.ids; this._uids = uids; this._caixa = cx;
      /* quem não pode ser o apoio: a própria peça e as ligadas a ela (tubos presos nos conectores) */
      var fora = uids.slice(), presos = this._presos(st, ex.ids);
      presos.forEach(function (t) { fora.push("edit:" + t); });
      this._excluir = fora;
      b.apoiarFantasma(uids);
      this._passo = "apoio";
      status("Apoiar em…: clique a superfície onde a peça vai apoiar — laje, forro, telhado, piso ou outra peça (Esc cancela)." + (ex.expandiu ? " O componente vai inteiro (" + ex.ids.length + " partes)." : ""));
      return true;
    },

    /* os tubos presos nos conectores das famílias (o mesmo achado do Alinhar) */
    _presos: function (st, ids) {
      var AI = global.BimAlinharInst, out = {};
      if (!AI || !AI.alinhar) return [];
      arr(st && st.familias).forEach(function (f) {
        if (!f || ids.indexOf(String(f.id)) < 0 || !f.famId) return;
        try { var inf = AI.alinhar(st, String(f.id), { x: 0, z: 0 }, f); (inf && inf.presos ? inf.presos : []).forEach(function (t) { out[String(t)] = 1; }); } catch (e) {}
      });
      return Object.keys(out);
    },

    /* ------------------------------------------------ a conta de um ponto da tela → o que o clique faria */
    avaliar: function (x, y) {
      var b = B(), M = AP(), st = this.estado();
      var p = b.pontoNaTela ? b.pontoNaTela(x, y) : null;
      if (!p || !p.uid) return { ok: false, vazio: true, erro: "Clique numa superfície do modelo." };
      if (this._excluir.indexOf(p.uid) >= 0) return { ok: false, uid: p.uid, erro: "A peça não pode apoiar em si mesma (nem nos tubos ligados a ela): clique em outra superfície." };
      /* o contorno a cada 1 cm + a malha 9 × 9, e depois o REFINO em volta do ponto mais alto (4 voltas): a peça não entra no telhado
         (≤ 5 mm), nem na crista que cruza a borda nem no ápice que fica dentro da pegada */
      var cx = this._caixa, alvo = { alvo: p.uid, excluir: this._excluir };
      var am = M.amostrar(b.apoiarRaios(M.pontosFinos(cx), { soUid: p.uid }), alvo);
      var r = M.cotaApoio(am, { yClique: p.p && p.p.length > 1 ? p.p[1] : null });
      if (r.ok && !r.deClique && r.spread > M.TOL_INCL) {
        var passo = Math.max(cx.max[0] - cx.min[0], cx.max[2] - cx.min[2]) / 8, volta, melhor;
        for (volta = 0; volta < 4; volta++) {
          melhor = am.filter(function (a) { return a.y === r.cota; })[0]; if (!melhor) break;
          var v = M.vizinhos(melhor, passo, cx); passo = v.passo;
          am = am.concat(M.amostrar(b.apoiarRaios(v.pontos, { soUid: p.uid }), alvo)); r = M.cotaApoio(am, { yClique: r.cota });
        }
      }
      if (!r.ok) return { ok: false, uid: p.uid, erro: r.erro };
      var pl = M.planejar(st, this._ids, r.cota, this._caixa.min[1]);
      return { ok: pl.ok, ja: !!pl.ja, uid: p.uid, nome: p.nome, r: r, pl: pl, texto: pl.rotulo, avisos: r.avisos, erro: pl.ok ? null : pl.erro };
    },

    /* ------------------------------------------------ gravar (a op do Elevar) */
    aplicar: function (x, y, evento) {
      var av = this.avaliar(x, y);
      if (!av.ok) { status("Apoiar em…: " + (av.erro || "não deu para apoiar.")); if (!av.vazio && !av.ja) toast(av.erro || "Não deu para apoiar.", "aviso"); return av; }
      var eu = EU(), E = global.BimElevar, b = B(), st0 = this.estado(), antes = this._presos(st0, this._ids), VU = global.BimVinculosUI;
      var solto = !!(VU && (!VU.ligado() || VU.sozinho(evento)));
      var f = E.opFinal(st0, av.pl.plano, { solto: solto, novoId: eu.novoId, pedido: "Apoiar em…" });
      if (!f.op) { status("Apoiar em…: o editor recusou a mudança."); return { ok: false, erro: "sem op" }; }
      /* A REDE LIGADA VAI JUNTO (pedido de 27/10): as ops dos tubos entram no MESMO lote da subida — um Ctrl+Z desfaz tudo */
      var rede = this.levarRede ? AP().levarRede(st0, this._ids, av.pl.dy, { I: global.BimInst, avaliar: function (a, t, i) { return b.familiaAvaliar(a, t, i); } }) : { ops: [], ajustados: 0, esticados: 0, deslocados: 0, acessorios: 0, avisos: [] };
      var base = f.op.op === "lote" ? f.op.ops.slice() : [f.op], lote = { op: "lote", id: eu.novoId("l"), origem: "modificar", pedido: ("Apoiar em…" + (av.nome ? " " + av.nome : "")).slice(0, 300), ops: base.concat(rede.ops) };
      if (!b.editarLote(lote)) { status("Apoiar em…: o editor recusou a mudança."); return { ok: false, erro: "recusado" }; }
      var res = { ok: true };
      /* os tubos que estavam ligados e agora não tocam a peça: o que o Hidro acusaria (só sem o "leva junto") */
      var depois = this._presos(this.estado(), this._ids), pra = antes.filter(function (t) { return depois.indexOf(t) < 0; });
      var nTubos = rede.ops.filter(function (o) { return o.op === "trecho"; }).length;
      var partes = [av.texto + " — Ctrl+Z desfaz"];
      if (nTubos) partes.push(nTubos + (nTubos === 1 ? " tubo ajustado" : " tubos ajustados") + " (" + rede.esticados + " esticaram para absorver o desnível, " + rede.deslocados + " andaram com a peça" + (rede.acessorios ? ", " + rede.acessorios + (rede.acessorios === 1 ? " registro junto" : " registros juntos") : "") + ")");
      if (av.avisos.length) partes.push(av.avisos.join("; "));
      if (pra.length) partes.push(pra.length === 1 ? "1 tubo ligado à peça ficou onde estava" : pra.length + " tubos ligados à peça ficaram onde estavam");
      if (pra.length) partes[partes.length - 1] += ": refaça com o Traçar automaticamente (TA) — o Hidro acusa a ligação até lá";
      var txt = partes.join(" · ") + ".";
      status(txt); if (av.avisos.length || pra.length) toast(txt, "aviso");
      this._ultimo = { ok: true, dy: av.pl.dy, cota: av.r.cota, texto: txt, avisos: av.avisos.slice(), tubosParaTras: pra, tubosAjustados: nTubos, rede: { esticados: rede.esticados, deslocados: rede.deslocados, acessorios: rede.acessorios },  inclinado: av.r.inclinado, uid: av.uid, ids: this._ids.slice() };
      this._desarmar();
      return this._ultimo;
    },

    /* ------------------------------------------------ a escuta do ponteiro */
    _armar: function () {
      var self = this, W = global, cv = B().apoiarCanvas();
      this._on = true; this._down = null; this._hoverUid = null;
      try { if (global.BIM && global.BIM._apoiando) global.BIM._apoiando(true); } catch (e0) {}
      this._fn = {
        down: function (e) {
          if (e.button !== 0 || e.target !== cv) return;
          self._down = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.stopPropagation(); e.preventDefault();
        },
        up: function (e) {
          var d = self._down; if (!d || e.button !== 0 || e.pointerId !== d.id) return;
          self._down = null; e.stopPropagation(); e.preventDefault();
          var dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (dx * dx + dy * dy > LIMIAR_CLIQUE * LIMIAR_CLIQUE) return;
          self._clique(e);
        },
        move: function (e) {
          if (e.target !== cv) { self._esconderRot(); return; }
          var t = Date.now(); if (t - self._tPrev < INTERVALO_PREVIA) { self._seguirRot(e); return; }
          self._tPrev = t; self._previa(e);
        },
        dbl: function (e) { if (e.target === cv) { e.stopPropagation(); e.preventDefault(); } },
        tecla: function (e) {
          if (e.key !== "Escape") return;
          var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
          e.preventDefault(); e.stopPropagation(); self.cancelar();
        }
      };
      W.addEventListener("pointerdown", this._fn.down, true);
      W.addEventListener("pointerup", this._fn.up, true);
      W.addEventListener("pointermove", this._fn.move, true);
      W.addEventListener("dblclick", this._fn.dbl, true);
      W.addEventListener("keydown", this._fn.tecla, true);
      try { cv.style.cursor = "crosshair"; } catch (e1) {}
    },
    _desarmar: function () {
      var W = global, f = this._fn, cv = null;
      try { cv = B() && B().apoiarCanvas ? B().apoiarCanvas() : null; } catch (e0) {}
      if (f) {
        W.removeEventListener("pointerdown", f.down, true); W.removeEventListener("pointerup", f.up, true); W.removeEventListener("pointermove", f.move, true);
        W.removeEventListener("dblclick", f.dbl, true); W.removeEventListener("keydown", f.tecla, true);
      }
      this._fn = null; this._on = false; this._passo = null; this._down = null; this._hoverUid = null;
      try { if (global.BIM && global.BIM._apoiando) global.BIM._apoiando(false); } catch (e1) {}
      try { if (B() && B().apoiarLimpar) B().apoiarLimpar(); } catch (e2) {}
      this._esconderRot();
      try { if (cv) cv.style.cursor = ""; } catch (e3) {}
    },
    cancelar: function () {
      if (!this._on) return false;
      this._desarmar(); status("Apoiar em…: nada mudou."); return true;
    },

    /* o clique: no 1º passo escolhe a peça; no 2º grava */
    _clique: function (e) {
      var b = B();
      if (this._passo === "peca") {
        var p = b.pontoNaTela ? b.pontoNaTela(e.clientX, e.clientY) : null;
        if (!p || !p.uid) { status("Apoiar em…: clique sobre a peça que vai subir ou descer."); return; }
        if (!/^edit:/.test(p.uid)) { status("Apoiar em…: só as peças criadas no OrçaPRO se movem (esta é do IFC importado)."); toast("Esta peça é do IFC importado e não se move aqui.", "aviso"); return; }
        var id = p.uid.replace(/^edit:/, "");
        try { b.selecionar([p.uid], "trocar"); } catch (e1) {}
        this._escolher([id]);
        return;
      }
      if (this._passo === "apoio") this.aplicar(e.clientX, e.clientY, e);
    },

    /* a prévia: a silhueta na cota nova + o texto ao lado do cursor */
    _previa: function (e) {
      if (this._passo !== "apoio") { this._esconderRot(); return; }
      var b = B(), av;
      try { av = this.avaliar(e.clientX, e.clientY); } catch (x) { av = { ok: false, erro: "" }; }
      if (av.ok) {
        b.apoiarDy(av.pl.dy);
        this._rotulo(e, av.texto + (av.avisos.length ? "\n" + av.avisos[0] : ""), false);
      } else {
        b.apoiarDy(NaN);
        this._rotulo(e, av.ja ? av.erro : (av.vazio ? "" : av.erro), true);
      }
    },
    _rotulo: function (e, texto, aviso) {
      if (!texto) { this._esconderRot(); return; }
      var d = global.document; if (!d || !d.body) return;
      if (!this._rot) {
        this._rot = d.createElement("div"); this._rot.setAttribute("data-bapo", "rotulo");
        this._rot.style.cssText = "position:fixed;z-index:70;pointer-events:none;background:#0b3b5c;color:#fff;font:600 12px/1.35 sans-serif;padding:4px 8px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:pre;max-width:360px";
        d.body.appendChild(this._rot);
      }
      this._rot.textContent = texto; this._rot.style.background = aviso ? "#8a1c1c" : "#0b3b5c"; this._rot.style.display = "block";
      this._seguirRot(e);
    },
    _seguirRot: function (e) { if (this._rot && this._rot.style.display !== "none") { this._rot.style.left = (e.clientX + 16) + "px"; this._rot.style.top = (e.clientY + 18) + "px"; } },
    _esconderRot: function () { if (this._rot) this._rot.style.display = "none"; },

    /* ------------------------------------------------ a fita, o atalho e o menu */
    registrar: function (reg, G) {
      var self = this;
      reg.apoiar = function () { return self.iniciar(); };
      try { var P = global.BimPrecisao; if (P) { P.ATALHOS_CMD = P.ATALHOS_CMD || {}; if (!P.ATALHOS_CMD.AE) P.ATALHOS_CMD.AE = "apoiar"; } } catch (eA) {}
      return true;
    }
  };

  global.BimApoiarUI = BimApoiarUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimApoiarUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

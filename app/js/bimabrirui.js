/* =====================================================================
 * bimabrirui.js — PORTAS, PORTÕES E GAVETAS QUE ABREM NO CLIQUE DO 3D (fiação + regras puras)
 *
 * Pedido do engenheiro (20/10/2026): "todas as portas implementadas dentro do sistema: quando eu clicar nela no 3D,
 * ela abre — para a gente conseguir andar dentro do ambiente sem atravessar porta. Armários também: o que for gaveta
 * vem para frente, o que for porta de armário abre."
 *
 * O motor do movimento é o js/partesmoveis.js (a parte móvel da família) e a animação é a do js/bim.js (pose × matriz
 * fechada, `_solta` tira a peça do mesclado). Este arquivo só faz DUAS coisas:
 *   [PURA]  as regras: quando o modo "interagir" vale, o que é um clique (e não um arrasto), e a colisão do passeio
 *           com a porta fechada. Sem DOM: tools/test-c487-portas.js roda em Node.
 *   [VIVA]  o clique do mouse/toque, o cursor de mão, a tecla O, os botões da barra da vista e o freio do passeio.
 *
 * ⚠ COMO O CLIQUE NÃO ATRAPALHA A SELEÇÃO (a regra escolhida, e por quê):
 *   · O clique simples SELECIONA e o arrasto move/faz janela (js/bimselecao.js, sel3 do js/bim.js). Abrir a porta no
 *     clique de sempre brigaria com isso — quem seleciona uma porta para editar abriria a porta.
 *   · Por isso o clique só abre quando o MODO "Abrir portas" está ligado (botão de mão na barra da vista, tecla O),
 *     ou com ALT+clique, ou sozinho no PASSEIO (primeira pessoa) e na APRESENTAÇÃO — onde ninguém está editando.
 *   · Fora desse modo nada muda: o código de seleção nem chega a ver este módulo.
 *   · No modo ligado, o clique numa PARTE móvel (porta, gaveta) a abre/fecha e NÃO seleciona; o clique em qualquer
 *     outra coisa seleciona como sempre; o arrasto (> 4 px) é navegação ou seleção por janela, como sempre.
 *   · Desempenho: nenhum laço por quadro quando nada está animando. O raio só roda em clique e, com o modo ligado,
 *     no movimento do mouse (no máximo 1 a cada 70 ms). O freio do passeio só roda com o passeio ligado.
 * ===================================================================== */
(function (global) {
  "use strict";

  var LIMIAR_CLIQUE = 4;      /* px: até aqui é clique, depois é arrasto */
  var ALCANCE_PASSEIO = 3.5;  /* m: no passeio só abre o que está ao alcance */
  var RAIO_CORPO = 0.25;      /* m: o "corpo" de quem anda no passeio */
  var DUR_ABRIR = 0.6;        /* s: o movimento de uma porta */
  var SALTO_MAX = 6;          /* m: acima disto, no quadro, é teletransporte e não passo */

  /* ----------------------------------------------------------- [PURA] */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /* o modo de interagir está valendo? est = { manual, passeio, apresentacao } */
  function modoAtivo(est) { est = est || {}; return !!(est.manual || est.passeio || est.apresentacao); }
  /* este clique abre? (modo ligado OU Alt) e é o botão esquerdo */
  function deveAbrir(est, ev) { ev = ev || {}; return (ev.button == null || ev.button === 0) && (modoAtivo(est) || !!ev.altKey); }
  /* clique ou arrasto? */
  function ehClique(x0, y0, x1, y1, lim) { var dx = num(x1, 0) - num(x0, 0), dy = num(y1, 0) - num(y0, 0), l = lim == null ? LIMIAR_CLIQUE : lim; return dx * dx + dy * dy <= l * l; }

  /* o segmento (a→b), no plano, cruza a caixa [x0..x1]×[z0..z1] ENGORDADA de r? (método das lajes). Vale para o passo grande
     (Shift = 3× a velocidade): o salto de um quadro não atravessa uma folha fina. */
  function segmentoNaCaixa(ax, az, bx, bz, cx, r) {
    var x0 = cx.x0 - r, x1 = cx.x1 + r, z0 = cx.z0 - r, z1 = cx.z1 + r, t0 = 0, t1 = 1, dx = bx - ax, dz = bz - az;
    function laje(p, d, lo, hi) {
      if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
      var u = (lo - p) / d, v = (hi - p) / d; if (u > v) { var t = u; u = v; v = t; }
      if (u > t0) t0 = u; if (v < t1) t1 = v;
      return t0 <= t1;
    }
    return laje(ax, dx, x0, x1) && laje(az, dz, z0, z1);
  }
  function pontoNaCaixa(px, pz, cx, r) { return px >= cx.x0 - r && px <= cx.x1 + r && pz >= cx.z0 - r && pz <= cx.z1 + r; }
  /* o freio do passeio: de `a` para `b` (x, y, z da câmera), contra as folhas FECHADAS.
     Só barra quem ENTRA (a estava fora): quem já está dentro da caixa (a porta fechou em cima dele) sai livre.
     A altura: o corpo vai do chão ao olho; a folha tem y0..y1 — barra se a altura da câmera cruza a faixa da folha (com folga).
     Devolve a posição permitida { x, y, z, barrou }. A altura sempre passa (voar por cima da porta é permitido). */
  function freiar(a, b, caixas, r) {
    r = r == null ? RAIO_CORPO : r;
    var out = { x: b.x, y: b.y, z: b.z, barrou: false };
    for (var i = 0; i < (caixas || []).length; i++) {
      var cx = caixas[i];
      if (!cx || cx.aberta) continue;
      var yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
      if (yMax < cx.y0 - 0.3 || yMin > cx.y1 + 0.3) continue;   /* por cima ou por baixo da folha */
      if (pontoNaCaixa(a.x, a.z, cx, r)) continue;               /* já estava dentro: deixa sair */
      if (segmentoNaCaixa(a.x, a.z, out.x, out.z, cx, r)) { out.x = a.x; out.z = a.z; out.barrou = true; }
    }
    return out;
  }

  /* ----------------------------------------------------------- [VIVA] */
  var CSS = ".rv-pt{display:inline-flex;align-items:center;gap:2px;margin-left:6px;padding-left:6px;border-left:1px solid rgba(128,128,128,.35)}" +
    ".rv-pt[hidden]{display:none}.rv-pt button{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:5px;padding:3px 6px;background:transparent;color:inherit;font:600 11px var(--fonte,system-ui),sans-serif;cursor:pointer}" +
    ".rv-pt button:hover{background:rgba(128,128,128,.22)}.rv-pt button[aria-pressed=true]{background:var(--aco,#2d6a9c);color:#fff}.rv-pt button:focus-visible{outline:2px solid var(--aco,#2d6a9c);outline-offset:1px}";
  var botoes = [];        /* os grupos de botões criados (um por barra) */
  var inst = null;        /* a instalação viva (uma por viewer) */

  function injetarCss() {
    if (typeof document === "undefined" || document.getElementById("rv-pt-css")) return;
    var st = document.createElement("style"); st.id = "rv-pt-css"; st.textContent = CSS; document.head.appendChild(st);
  }

  /* o botão da barra da vista (js/bimshell.js › _vistabar chama isto, como faz com a Apresentação): mão = modo Abrir portas */
  function botaoBarra(el, ico) {
    injetarCss();
    var box = el("span", "rv-pt"); box.setAttribute("data-rv-pt", "1"); box.hidden = true;
    var b1 = el("button", null, ""); b1.type = "button"; b1.setAttribute("data-pt", "modo");
    b1.innerHTML = ico("mao", 14) + "<span>Portas</span>";
    b1.title = "Abrir portas (O): com o botão ligado, o clique numa porta, portão ou gaveta a abre ou fecha. Desligado, o Alt+clique faz o mesmo e o clique seleciona como sempre.";
    b1.setAttribute("aria-label", "Abrir portas"); b1.setAttribute("aria-pressed", "false");
    b1.onclick = function () { if (inst) inst.alternar(); };
    var b2 = el("button", null, ""); b2.type = "button"; b2.setAttribute("data-pt", "abrir");
    b2.innerHTML = ico("porta", 14) + "<span>Abrir todas</span>"; b2.title = "Abrir todas as portas, portões e gavetas do modelo"; b2.onclick = function () { if (inst) inst.todas(true); };
    var b3 = el("button", null, ""); b3.type = "button"; b3.setAttribute("data-pt", "fechar");
    b3.innerHTML = ico("porta", 14) + "<span>Fechar todas</span>"; b3.title = "Fechar tudo o que está aberto"; b3.onclick = function () { if (inst) inst.todas(false); };
    box.appendChild(b1); box.appendChild(b2); box.appendChild(b3);
    botoes.push(box);
    atualizar();
    return box;
  }
  /* mostra os botões só quando o modelo tem parte móvel; marca o modo */
  function atualizar() {
    var n = 0, on = false;
    try { n = inst && inst.S._partes ? inst.S._partes.total() : 0; on = !!(inst && inst.estado().manual); } catch (e) { n = 0; }
    /* só descarta o grupo que JÁ esteve na tela e saiu (a barra foi refeita); o recém-criado ainda não foi pendurado */
    botoes = botoes.filter(function (b) { if (b.isConnected) b._visto = true; return b.isConnected || !b._visto; });
    botoes.forEach(function (b) {
      b.hidden = !n;
      var m = b.querySelector('[data-pt="modo"]'); if (m) m.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function instalar(S, THREE, env) {
    env = env || {};
    var win = env.win || (typeof window !== "undefined" ? window : null);
    var doc = env.doc || (typeof document !== "undefined" ? document : null);
    if (!win || !doc || !S || !THREE) return { dispor: function () {}, gate: function () { return false; } };
    if (win.__bimAbrirDispor) { try { win.__bimAbrirDispor(); } catch (e0) {} }

    var diag = { ticks: 0, barrou: 0, caixas: 0, passos: 0, desceu: 0, anotou: 0, subiu: 0, abriu: 0 };   /* diag: gancho de teste (quantas vezes o clique e o freio rodaram) */
    var cv = S.renderer.domElement, manual = false, pend = null, hoverT = 0, hoverOn = false, rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
    rc.layers.enableAll();

    function apresentando() { try { var A = win.BimApresentacaoUI && win.BimApresentacaoUI.Apres; return !!(A && A.ativa); } catch (e) { return false; } }
    function estado() { return { manual: manual, passeio: !!(S.fly && S.fly.on), apresentacao: apresentando() }; }
    function raizDoBim() { var h = S.host; return h && h.closest ? (h.closest(".bim-revit") || h) : h; }
    function naTela() { var r = raizDoBim(); return !!(r && r.isConnected && r.getClientRects().length); }

    /* a parte móvel sob o ponto da tela (o raio pega a PARTE — porta, gaveta —, não a família inteira) */
    function visivel(o) { for (var n = o; n; n = n.parent) { if (n.visible === false) return false; if (n === S.modelRoot) break; } return true; }
    function alvoEm(cx, cy, centro) {
      if (!S._partes || !S._partes.total()) return null;
      var r = cv.getBoundingClientRect(); if (!r.width || !r.height) return null;
      if (centro) ndc.set(0, 0); else ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, S.camera);
      var hits = rc.intersectObjects(S.modelRoot.children, true), pls = S.renderer.clippingPlanes || [];
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i], o = h.object;
        if (!o.isMesh || !visivel(o)) continue;
        var cortada = false; for (var q = 0; q < pls.length; q++) if (pls[q].distanceToPoint(h.point) < -1e-6) { cortada = true; break; }
        if (cortada) continue;
        if (!o.userData || o.userData.expressID == null) continue;
        var pt = o.userData.parte ? S._partes.de(o) : null;
        if (!pt) return null;   /* o primeiro que o raio encontra não é parte móvel (uma parede na frente): não abre */
        if (S.fly && S.fly.on && h.distance > ALCANCE_PASSEIO) return null;
        return { pt: pt, mesh: o, dist: h.distance };
      }
      return null;
    }
    function centroDoPasseio() { return !!(S.fly && S.fly.on && doc.pointerLockElement === cv); }

    /* ---- o clique: pointerdown anota (sem consumir); pointerup abre e consome o evento ---- */
    function aoDescer(e) {
      pend = null; diag.desceu++;
      if (!S.alive || S._visitante || !naTela() || e.button !== 0) { diag.motivo = "viva/tela/botao " + [S.alive, S._visitante, naTela(), e.button].join(); return; }
      if (!deveAbrir(estado(), e)) { diag.motivo = "modo"; return; }
      if (S.medir && S.medir.on) { diag.motivo = "trena"; return; }
      var a = alvoEm(e.clientX, e.clientY, centroDoPasseio());
      diag.motivo = a ? "achou" : "sem alvo (centro=" + centroDoPasseio() + ", lock=" + !!doc.pointerLockElement + ")";
      if (a) { pend = { id: e.pointerId, x: e.clientX, y: e.clientY, pt: a.pt }; diag.anotou++; }
    }
    function aoSubir(e) {
      var p = pend; pend = null; diag.subiu++;
      if (!p || p.id !== e.pointerId) return;
      if (!ehClique(p.x, p.y, e.clientX, e.clientY)) return;   /* arrastou: era navegação / janela de seleção */
      /* revalida: o que está sob o ponteiro AGORA ainda é a mesma parte */
      var a = alvoEm(e.clientX, e.clientY, centroDoPasseio());
      if (!a || a.pt !== p.pt) return;
      e.stopImmediatePropagation(); e.preventDefault();
      var abriu = S._partes.abrir(a.pt, null); diag.abriu++;
      if (S._hint) S._hint((abriu ? "Aberta: " : "Fechada: ") + (a.pt.nome || "peça") + " — " + a.pt.rotulo);
    }
    function aoCancelar() { pend = null; }
    /* o duplo clique de sempre seleciona; com a parte sob o ponteiro e o modo ligado, ele não deve selecionar */
    function aoDuplo(e) {
      if (!S.alive || !naTela() || !deveAbrir(estado(), e)) return;
      if (alvoEm(e.clientX, e.clientY, centroDoPasseio())) { e.stopImmediatePropagation(); e.preventDefault(); }
    }

    /* ---- o cursor de mão sobre a parte móvel (só com o modo ligado) ---- */
    function aoMover(e) {
      if (!modoAtivo(estado()) || !S.alive) { if (hoverOn) { cv.style.cursor = ""; hoverOn = false; } return; }
      var t = (win.performance && performance.now) ? performance.now() : Date.now();
      if (t - hoverT < 70 || e.buttons) return;
      hoverT = t;
      var a = alvoEm(e.clientX, e.clientY, centroDoPasseio());
      if (a && !hoverOn) { cv.style.cursor = "pointer"; hoverOn = true; }
      else if (!a && hoverOn) { cv.style.cursor = ""; hoverOn = false; }
    }

    /* ---- a tecla O ---- */
    function aoTecla(e) {
      if (!S.alive || S._visitante || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
      if (String(e.key || "").toLowerCase() !== "o") return;
      var t = e.target || {}, ae = doc.activeElement || {};
      function campo(x) { return /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName || "") || !!x.isContentEditable; }
      if (campo(t) || campo(ae) || !naTela() || doc.getElementById("modal-bg")) return;
      if (!S._partes || !S._partes.total()) return;
      e.preventDefault(); alternar();
    }

    /* ---- o freio do passeio: porta fechada não se atravessa; aberta, sim ---- */
    var ant = null, cache = null, cacheVer = -1;
    function caixasFechadas() {
      var ver = S._partes ? S._partes.versao() : 0;
      if (cache && cacheVer === ver) return cache;
      cache = []; cacheVer = ver;
      (S._partes ? S._partes.lista() : []).forEach(function (pt) {
        if (pt.categoria !== "porta" && pt.categoria !== "janela") return;
        var bb = new THREE.Box3();
        pt.folhas.forEach(function (f) { f.malhas.forEach(function (m) {
          if (!m.geometry) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          bb.union(m.geometry.boundingBox.clone().applyMatrix4(m.userData._matFechada || m.matrix));
        }); });
        if (bb.isEmpty()) return;
        cache.push({ pt: pt, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, y0: bb.min.y, y1: bb.max.y, aberta: false });
      });
      return cache;
    }
    function freioTick() {
      if (!S.fly || !S.fly.on) { ant = null; return; }
      diag.ticks++;
      var c = S.camera.position;
      /* um salto de mais de 6 m num quadro não é andar (é "ir para a vista", teletransporte): não freia e recomeça daqui */
      if (ant && Math.abs(c.x - ant.x) + Math.abs(c.z - ant.z) > SALTO_MAX) ant = null;
      if (ant) {
        var cx = caixasFechadas(), n = 0;
        cx.forEach(function (b) { b.aberta = b.pt.t > 0.5 && b.pt.alvo > 0; n++; });
        diag.caixas = n; diag.passos++;
        if (n) {
          var r = freiar(ant, { x: c.x, y: c.y, z: c.z }, cx, RAIO_CORPO);
          if (r.barrou) { diag.barrou++; c.x = r.x; c.z = r.z; if (S._hint && !S._freioAviso) { S._freioAviso = 1; S._hint("Porta fechada: clique nela para abrir (Alt+clique, ou o botão Portas) e passe."); setTimeout(function () { S._freioAviso = 0; }, 4000); } }
        }
      }
      ant = { x: c.x, y: c.y, z: c.z };
    }
    S._tickExtra.push(freioTick);

    function alternar(v) {
      manual = v == null ? !manual : !!v;
      if (!modoAtivo(estado()) && hoverOn) { cv.style.cursor = ""; hoverOn = false; }
      atualizar();
      if (S._hint) S._hint(manual ? "Abrir portas ligado: clique numa porta, portão ou gaveta para abrir ou fechar (O desliga)." : "Abrir portas desligado: o clique volta a selecionar.");
      return manual;
    }
    function todas(abrir) {
      var n = S._partes ? S._partes.todas(!!abrir) : 0;
      if (S._hint) S._hint(n ? ((abrir ? "Abrindo " : "Fechando ") + n + " parte(s) móvel(is).") : (abrir ? "Tudo já está aberto." : "Tudo já está fechado."));
      return n;
    }

    cv.addEventListener("pointerdown", aoDescer, true);
    cv.addEventListener("pointerup", aoSubir, true);
    cv.addEventListener("pointercancel", aoCancelar, true);
    cv.addEventListener("dblclick", aoDuplo, true);
    cv.addEventListener("pointermove", aoMover, { passive: true });
    win.addEventListener("keydown", aoTecla, true);
    function dispor() {
      cv.removeEventListener("pointerdown", aoDescer, true); cv.removeEventListener("pointerup", aoSubir, true);
      cv.removeEventListener("pointercancel", aoCancelar, true); cv.removeEventListener("dblclick", aoDuplo, true);
      cv.removeEventListener("pointermove", aoMover, { passive: true }); win.removeEventListener("keydown", aoTecla, true);
      var ix = S._tickExtra.indexOf(freioTick); if (ix >= 0) S._tickExtra.splice(ix, 1);
      if (win.__bimAbrirDispor === dispor) win.__bimAbrirDispor = null;
      if (inst && inst.S === S) inst = null;
      botoes = [];
    }
    win.__bimAbrirDispor = dispor;
    inst = {
      S: S, dispor: dispor, alternar: alternar, todas: todas, estado: estado, atualizar: atualizar,
      /* a porta sob o ponteiro foi anotada no pointerdown (capturado antes do sel3 do js/bim.js)? então a seleção não começa */
      gate: function (e) { return !!(pend && pend.id === e.pointerId); },
      alvoEm: alvoEm, caixas: caixasFechadas, diag: diag, resetFreio: function () { var c = S.camera.position; ant = S.fly && S.fly.on ? { x: c.x, y: c.y, z: c.z } : null; }
    };
    return inst;
  }

  var BimAbrirUI = {
    LIMIAR_CLIQUE: LIMIAR_CLIQUE, ALCANCE_PASSEIO: ALCANCE_PASSEIO, RAIO_CORPO: RAIO_CORPO, DUR_ABRIR: DUR_ABRIR,
    modoAtivo: modoAtivo, deveAbrir: deveAbrir, ehClique: ehClique, segmentoNaCaixa: segmentoNaCaixa, pontoNaCaixa: pontoNaCaixa, freiar: freiar,
    instalar: instalar, botaoBarra: botaoBarra, atualizar: atualizar,
    atual: function () { return inst; }
  };
  global.BimAbrirUI = BimAbrirUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAbrirUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

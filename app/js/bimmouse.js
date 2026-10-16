/* =====================================================================
 * bimmouse.js — AJUSTES DE MOUSE E TECLADO NO BIM (BACKLOG #56, 16/10/2026).
 * ES5, sem build. Aprovado pelo dono em 16/10.
 *
 * O QUE ENTRA
 *   1. girar em torno do PONTO SOB O CURSOR: ao começar a girar, o alvo da
 *      órbita vira o ponto 3D sob o cursor (raycast); no vazio, mantém o alvo.
 *   2. a RODA aproxima/afasta na direção do cursor, com avanço que não trava
 *      perto do alvo: pelo fator (como sempre) quando longe; por passo mínimo
 *      linear, que ATRAVESSA o alvo, quando perto (mesma ideia do controle).
 *   3. Shift + botão do meio gira. ⚠ JÁ FUNCIONAVA: botoesOrbita() deixa o meio
 *      em "mover" e o OrbitControls inverte com Shift (mover+Shift = girar).
 *      O que NÃO gira é o Ctrl + meio (que move, como sempre foi). O e2e prova.
 *   4. teclas de UMA letra/número, sem Ctrl/Alt/Shift, com o foco fora de
 *      campo de texto: F enquadrar (sem seleção = tudo) · H ocultar · I isolar ·
 *      C caixa de corte · M medir (trena) · 1 topo · 2 frente · 3 lateral
 *      direita · 4 trás · 5 lateral esquerda · 6 isométrica.
 *      COLISÕES conferidas (grep keydown em js/bim*.js e js/gestao.js):
 *        G = grade do chão (bimshell.js) — não usada aqui;
 *        "EL" = Elevar (bimelevarui.js) lê E e L em sequência — nenhuma das
 *        nossas é E ou L; F3/F8 = snap/orto, Espaço = gira a peça, Enter,
 *        Esc, Delete, Ctrl+Z/Y — nenhum é nosso. WASD/Q/E do passeio (voo)
 *        usam e.code: as nossas teclas ficam MUDAS durante o voo.
 *   5. botões laterais do mouse (3 = voltar, 4 = avançar) = aba de ponto de
 *      vista anterior/próxima (a mesma ação do LB/RB do controle). Com o
 *      mouse sobre o BIM o navegador NÃO volta a página.
 *   6. duplo clique no VAZIO enquadra tudo (a parte do js/bim.js; duplo clique
 *      numa peça segue selecionando).
 *   7. passeio automático: já saiu com o START do controle; aqui só ganha a
 *      tecla P (trivial — a mesma ação). ⚠ P não colide com nada acima.
 *
 * DUAS METADES
 *   [PURA]  mapa tecla → ação, "esta pressão gira?", passo do zoom, botão
 *           lateral → passo. Sem DOM: tools/test-bim-mouse.js roda em Node.
 *   [VIVA]  instalar(S, env): teclas e botões laterais (window, captura). O
 *           pivô e o zoom ficam no js/bim.js (precisam do raycast da cena).
 *           Devolve dispor(); o js/bim.js chama no desmontarMorto.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { v = +v; return isFinite(v) ? v : 0; }

  /* ----------------------------------------------------------- [PURA] */
  var TECLAS = {
    f: "enquadrar", h: "ocultar", i: "isolar", c: "caixaCorte", m: "trena", p: "passeioAuto",
    "1": "vistaTopo", "2": "vistaFrente", "3": "vistaLateral", "4": "vistaTras", "5": "vistaEsquerda", "6": "vistaIso"
  };
  /* códigos do OrbitControls (THREE.MOUSE) */
  var GIRAR = 0, MOVER = 2;
  var LIMIAR_PIVO = 3;   /* px: só começa a girar (e troca o alvo) depois de mexer isto */

  function campoDeTexto(el) {
    if (!el) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "") || !!el.isContentEditable;
  }
  /* ev = { key, ctrlKey, altKey, metaKey, shiftKey, repeat }; ctx = { campo, naTela, voo, bloqueado }
     → o nome da ação (a mesma do mapa do controle: js/bimcontrole.js) ou null */
  function acaoDaTecla(ev, ctx) {
    ctx = ctx || {};
    if (!ev || ctx.campo || !ctx.naTela || ctx.voo || ctx.bloqueado) return null;
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey || ev.repeat) return null;
    var k = String(ev.key == null ? "" : ev.key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(TECLAS, k) ? TECLAS[k] : null;
  }
  /* botão do mouse (e.button) → passo de aba: 3 = voltar = -1, 4 = avançar = +1; outros = 0 */
  function passoLateral(botao) { return botao === 3 ? -1 : (botao === 4 ? 1 : 0); }
  /* esta pressão vai GIRAR a vista? É a regra do OrbitControls do projeto (bim/vendor/OrbitControls.js):
     girar + (Ctrl|Meta|Shift) vira mover; mover + (Ctrl|Meta|Shift) vira girar. mb = { LEFT, MIDDLE, RIGHT } */
  function vaiGirar(botao, mb, mods) {
    mb = mb || {}; mods = mods || {};
    var acao = botao === 0 ? mb.LEFT : (botao === 1 ? mb.MIDDLE : (botao === 2 ? mb.RIGHT : -1));
    var mod = !!(mods.ctrlKey || mods.metaKey || mods.shiftKey);
    if (acao === GIRAR) return !mod;
    if (acao === MOVER) return mod;
    return false;
  }
  function passouDoLimiar(x0, y0, x1, y1, lim) {
    var dx = num(x1) - num(x0), dy = num(y1) - num(y0), l = lim == null ? LIMIAR_PIVO : lim;
    return dx * dx + dy * dy > l * l;
  }
  /* o menor passo de um toque da roda, em unidades da cena: uma fração do modelo (nunca zero) */
  function pisoZoom(tamModelo) { return Math.max(num(tamModelo) * 0.004, 0.01); }
  /* UM toque da roda. o = { dP: distância câmera→ponto do cursor, dAlvo: câmera→alvo da órbita, f: fator (<1 aproxima),
     piso, minD, maxD }.
     → { modo: "escala", g }  : camera e alvo escalam em torno do ponto (o de sempre, o ponto fica parado na tela)
       { modo: "avanca", avanco } : camera E alvo andam `avanco` na direção do ponto (+ aproxima, − afasta) — atravessa
       { modo: "nada" }       : fora dos limites da órbita ao afastar
     ⚠ Por que existe "avanca": só com o fator, perto do ponto o passo (dP × 0,107) encolhe a zero e, quando a distância
       ao alvo chegava no mínimo da órbita, a roda simplesmente parava (o "trava perto do alvo" do pedido). */
  function passoZoom(o) {
    o = o || {};
    var dP = Math.max(num(o.dP), 0), dA = Math.max(num(o.dAlvo), 0), f = num(o.f) || 1, piso = Math.max(num(o.piso), 1e-6);
    var minD = num(o.minD) > 0 ? num(o.minD) : 0, maxD = (o.maxD == null || !isFinite(o.maxD)) ? 1e12 : num(o.maxD), entra = f < 1;
    var base = dP * Math.abs(1 - f);
    if (base >= piso) {
      var nd = dA * f;
      if (nd >= minD && nd <= maxD) return { modo: "escala", g: f };
      if (!entra) return { modo: "nada" };
    }
    return { modo: "avanca", avanco: (entra ? 1 : -1) * Math.max(base, piso) };
  }

  /* ----------------------------------------------------------- [VIVA] */
  /* S = o viewer do js/bim.js (S._ctl.agir = a camada de ação do controle). env: { win, doc } para teste. */
  function instalar(S, env) {
    env = env || {};
    var win = env.win || (typeof window !== "undefined" ? window : null);
    var doc = env.doc || (typeof document !== "undefined" ? document : null);
    if (!win || !doc || !S) return { dispor: function () {} };
    if (win.__bimMouseDispor) { try { win.__bimMouseDispor(); } catch (e0) {} }

    function raizDoBim() { var h = S.host; return h && h.closest ? (h.closest(".bim-revit") || h) : h; }
    function naTela() { var r = raizDoBim(); return !!(r && r.isConnected && r.getClientRects().length); }
    function bloqueado() {
      if (doc.getElementById && doc.getElementById("modal-bg")) return true;   /* um diálogo aberto: a tecla é dele */
      try { if (win.BimSelInst && win.BimSelInst.menuAberto && win.BimSelInst.menuAberto()) return true; } catch (e) {}
      return false;
    }
    function agir(a) { try { if (S._ctl && S._ctl.agir) S._ctl.agir(a); } catch (er) { if (typeof console !== "undefined") console.warn("BimMouse:", a, er); } }

    function aoTecla(e) {
      if (!S.alive || S._visitante) return;
      var t = e.target || {};
      var a = acaoDaTecla(e, { campo: campoDeTexto(t) || campoDeTexto(doc.activeElement), naTela: naTela(), voo: !!(S.fly && S.fly.on), bloqueado: bloqueado() });
      if (!a) return;
      e.preventDefault();
      agir(a);
    }
    /* botões laterais: age no mousedown; o navegador volta a página no mouseup/auxclick — barra os três, SÓ sobre o BIM */
    function sobreOBim(e) { var r = raizDoBim(), t = e.target; return !!(r && t && r.contains && r.contains(t) && naTela()); }
    function aoMouseDown(e) {
      var p = passoLateral(e.button); if (!p || !S.alive || S._visitante || !sobreOBim(e)) return;
      e.preventDefault();
      agir(p < 0 ? "abaAnterior" : "abaProxima");
    }
    function aoMouseUpAux(e) {
      if (!passoLateral(e.button) || !S.alive || S._visitante || !sobreOBim(e)) return;
      e.preventDefault();
    }
    win.addEventListener("keydown", aoTecla, true);
    win.addEventListener("mousedown", aoMouseDown, true);
    win.addEventListener("mouseup", aoMouseUpAux, true);
    win.addEventListener("auxclick", aoMouseUpAux, true);
    function dispor() {
      win.removeEventListener("keydown", aoTecla, true);
      win.removeEventListener("mousedown", aoMouseDown, true);
      win.removeEventListener("mouseup", aoMouseUpAux, true);
      win.removeEventListener("auxclick", aoMouseUpAux, true);
      if (win.__bimMouseDispor === dispor) win.__bimMouseDispor = null;
    }
    win.__bimMouseDispor = dispor;
    return { dispor: dispor };
  }

  var BimMouse = {
    TECLAS: TECLAS, LIMIAR_PIVO: LIMIAR_PIVO,
    campoDeTexto: campoDeTexto, acaoDaTecla: acaoDaTecla, passoLateral: passoLateral, vaiGirar: vaiGirar,
    passouDoLimiar: passouDoLimiar, pisoZoom: pisoZoom, passoZoom: passoZoom,
    instalar: instalar
  };
  global.BimMouse = BimMouse;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMouse;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

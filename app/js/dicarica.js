/* =====================================================================
 * dicarica.js — a DICA ILUSTRADA: passar o mouse (ou chegar pelo teclado)
 * num comando da fita ou num campo do assistente mostra um cartão com o
 * DESENHO do que é e de onde se aplica (ex.: "Clipe de terça"), o "o que
 * é", o "onde se usa" e uma dica prática. Some ao sair, ao clicar, ao
 * rolar e com Esc.
 *
 * Onde aparece:
 *   · botão da fita com `data-rv-cmd` cujo id tem ilustração: o id do
 *     comando é procurado em DicaRica.MAPA (ex.: "met-clip" → "clip-terca")
 *     e depois direto no MetalDicas;
 *   · qualquer elemento com `data-dica="<id>"` (campos do assistente de
 *     cálculo, cartões de escolha) — o id é do MetalDicas ou de um item
 *     registrado pela tela com DicaRica.item(id, {titulo, oQueE, ondeUsa,
 *     dica, svg}).
 * A ilustração vem pronta (SVG em texto, js/metaldicas.js); aqui é só a
 * casca: posição, tempo, acessibilidade.
 *
 * ⚠ O TOOLTIP NATIVO (title) BRIGA COM O CARTÃO. O botão da fita tem
 *   `title` (js/bimshell.js) e o navegador o mostraria POR CIMA do cartão
 *   ~0,5 s depois. Ao entrar num alvo com dica ilustrada, o title sai na
 *   hora (guardado em data-dica-titulo e mostrado DENTRO do cartão, como
 *   "Neste comando") e volta ao sair. A fita é redesenhada a cada comando;
 *   o elemento novo nasce com o title, sem resto deste guarda-volumes.
 * ⚠ TOQUE NÃO TEM "PASSAR POR CIMA": no celular o cartão não abre pelo
 *   dedo (o toque é o clique do comando).
 * API: DicaRica.iniciar(), .registrar(cmdId, dicaId), .item(id, dados),
 *      .mostrar(el), .esconder(), .atual() → { id, alvo } | null
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;

  /* comando da fita → ilustração do MetalDicas */
  var MAPA = {
    "met-clip": "clip-terca", "met-placa-base": "placa-base-rotulada", "met-chapa-ext": "chapa-extremidade",
    "met-cant-dupla": "cantoneira-dupla", "met-emenda": "emenda-cobrejunta", "met-contravento": "contraventamento-cobertura",
    "met-no": "gusset", "met-enrijecedor": "enrijecedor", "met-perfil": "secao-w", "met-conferir": "parafuso",
    "met-galpao": "portico-alma-cheia", "met-calc-assistente": "portico-alma-cheia", "met-calc-modelos": "portico-trelicado",
    "met-calc-calcular": "deformada", "met-calc-resultados": "flambagem-lateral"
  };
  var EXTRA = {};
  var ESPERA = 260, cartao = null, atual = null, timer = null, timerSai = null;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function obter(id) {
    if (!id) return null;
    if (Object.prototype.hasOwnProperty.call(EXTRA, id)) return EXTRA[id];
    var D = global.MetalDicas;
    return D && D.obter ? D.obter(id) : null;
  }
  /* o id da dica de um elemento (ou null) */
  function idDe(el) {
    if (!el || el.nodeType !== 1) return null;
    var d = el.getAttribute("data-dica");
    if (d) return obter(d) ? d : null;
    var c = el.getAttribute("data-rv-cmd");
    if (c) { var m = MAPA[c] || c; return obter(m) ? m : null; }
    return null;
  }
  function alvoDe(el) {
    var n = el;
    while (n && n.nodeType === 1 && n !== doc.body) {
      if ((n.hasAttribute("data-dica") || n.hasAttribute("data-rv-cmd")) && idDe(n)) return n;
      n = n.parentNode;
    }
    return null;
  }

  function estilo() {
    if (!doc || doc.getElementById("dica-rica-css")) return;
    var s = doc.createElement("style");
    s.id = "dica-rica-css";
    s.textContent = [
      ".dica-rica{position:fixed;z-index:95;width:348px;max-width:calc(100vw - 16px);box-sizing:border-box;pointer-events:none;",
      "background:#fff;color:#1d2733;border:1px solid #d5dde6;border-radius:12px;overflow:hidden;",
      "box-shadow:0 2px 6px rgba(13,27,42,.08),0 14px 34px rgba(13,27,42,.22);font:13px/1.45 var(--fonte,'Segoe UI',system-ui,sans-serif);",
      "opacity:0;transform:translateY(4px);transition:opacity .14s ease,transform .14s ease}",
      ".dica-rica.on{opacity:1;transform:none}",
      ".dica-rica .dr-cab{display:flex;align-items:center;gap:8px;padding:10px 14px 8px;border-top:3px solid #e9a23b}",
      ".dica-rica .dr-selo{font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#a86a10;background:#fdf3e2;border-radius:99px;padding:2px 8px}",
      ".dica-rica .dr-tit{font-size:14.5px;font-weight:700;letter-spacing:-.1px}",
      ".dica-rica .dr-fig{margin:0 12px;border:1px solid #e3e9ef;border-radius:8px;background-color:#f8fafc;",
      "background-image:linear-gradient(#eef2f6 1px,transparent 1px),linear-gradient(90deg,#eef2f6 1px,transparent 1px);background-size:16px 16px}",
      ".dica-rica .dr-fig svg{display:block;width:100%;height:auto}",
      ".dica-rica .dr-corpo{padding:9px 14px 12px}",
      ".dica-rica .dr-l{margin:0 0 6px}",
      ".dica-rica .dr-l b{display:block;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:#5d6b7a;font-weight:700;margin-bottom:1px}",
      ".dica-rica .dr-dica{margin:8px 0 0;padding:7px 10px;background:#f2f7fc;border-left:3px solid #0d6ebd;border-radius:0 6px 6px 0;font-size:12.5px}",
      ".dica-rica .dr-cmd{margin:8px 0 0;padding-top:7px;border-top:1px dashed #d5dde6;color:#516375;font-size:12px}",
      "@media (prefers-reduced-motion:reduce){.dica-rica{transition:none}}"
    ].join("");
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* o rótulo do botão da fita vem em linhas ("Clip de" / "terça"; "Contra-" / "ventamento"):
     junta com espaço, e sem o hífen quando a palavra foi partida */
  function rotuloDe(alvo) {
    var ls = alvo.querySelectorAll ? alvo.querySelectorAll(".rv-cmd-rot span") : [], t = "";
    if (!ls.length) return (alvo.textContent || "").replace(/\s+/g, " ").trim();
    for (var k = 0; k < ls.length; k++) {
      var s = String(ls[k].textContent || "").trim(); if (!s) continue;
      if (!t) t = s; else if (/-$/.test(t)) t = t.slice(0, -1) + s; else t += " " + s;
    }
    return t;
  }
  function montar(id, alvo) {
    var it = obter(id); if (!it) return null;
    estilo();
    if (!cartao) {
      cartao = doc.createElement("div");
      cartao.className = "dica-rica";
      cartao.id = "dica-rica";
      cartao.setAttribute("role", "tooltip");
      doc.body.appendChild(cartao);
    }
    var cmdTxt = alvo.getAttribute("data-dica-titulo") || alvo.getAttribute("title") || "";
    var rotCmd = alvo.getAttribute("data-rv-cmd") ? rotuloDe(alvo) : "";
    cartao.setAttribute("data-dica-id", id);
    cartao.innerHTML =
      '<div class="dr-cab"><span class="dr-selo">Dica</span><span class="dr-tit">' + esc(it.titulo) + "</span></div>" +
      (it.svg ? '<div class="dr-fig">' + it.svg + "</div>" : "") +
      '<div class="dr-corpo">' +
      (it.oQueE ? '<p class="dr-l"><b>O que é</b>' + esc(it.oQueE) + "</p>" : "") +
      (it.ondeUsa ? '<p class="dr-l"><b>Onde se usa</b>' + esc(it.ondeUsa) + "</p>" : "") +
      (it.dica ? '<p class="dr-dica">' + esc(it.dica) + "</p>" : "") +
      (cmdTxt ? '<p class="dr-cmd"><b>' + esc(rotCmd ? "Neste comando (" + rotCmd + ")" : "Neste campo") + ":</b> " + esc(cmdTxt) + "</p>" : "") +
      "</div>";
    return cartao;
  }

  function posicionar(alvo) {
    if (!cartao) return;
    var r = alvo.getBoundingClientRect(), W = global.innerWidth || 1200, H = global.innerHeight || 800, m = 8;
    cartao.style.left = "0px"; cartao.style.top = "0px";
    var w = cartao.offsetWidth || 348, h = cartao.offsetHeight || 320;
    var lado = alvo.getAttribute("data-dica-lado"), x, y;
    if (lado === "direita" && r.right + m + w <= W - m) { x = r.right + m; y = Math.min(Math.max(m, r.top), H - h - m); }
    else if (lado === "esquerda" && r.left - m - w >= m) { x = r.left - m - w; y = Math.min(Math.max(m, r.top), H - h - m); }
    else {
      x = r.left + r.width / 2 - w / 2;
      y = r.bottom + m;
      if (y + h > H - m) { y = r.top - m - h; if (y < m) { y = Math.max(m, H - h - m); x = r.right + m; if (x + w > W - m) x = r.left - m - w; } }
    }
    x = Math.min(Math.max(m, x), W - w - m);
    cartao.style.left = Math.round(x) + "px"; cartao.style.top = Math.round(y) + "px";
  }

  function guardarTitulo(alvo) {
    if (alvo && alvo.hasAttribute("title")) { alvo.setAttribute("data-dica-titulo", alvo.getAttribute("title")); alvo.removeAttribute("title"); }
  }
  function devolverTitulo(alvo) {
    if (alvo && alvo.hasAttribute("data-dica-titulo")) {
      if (!alvo.hasAttribute("title")) alvo.setAttribute("title", alvo.getAttribute("data-dica-titulo"));
      alvo.removeAttribute("data-dica-titulo");
    }
  }

  function mostrar(alvo) {
    var id = idDe(alvo); if (!id) return false;
    clearTimeout(timer); clearTimeout(timerSai);
    if (atual && atual.alvo !== alvo) esconder();
    guardarTitulo(alvo);
    if (!montar(id, alvo)) return false;
    posicionar(alvo);
    alvo.setAttribute("aria-describedby", "dica-rica");
    atual = { id: id, alvo: alvo };
    /* força o reflow antes da classe: a transição de entrada acontece */
    void cartao.offsetWidth;
    cartao.classList.add("on");
    return true;
  }
  function esconder() {
    clearTimeout(timer); clearTimeout(timerSai);
    if (atual && atual.alvo) { devolverTitulo(atual.alvo); if (atual.alvo.getAttribute("aria-describedby") === "dica-rica") atual.alvo.removeAttribute("aria-describedby"); }
    atual = null;
    if (cartao) { cartao.classList.remove("on"); cartao.removeAttribute("data-dica-id"); }
  }

  var pendente = null, clique = null;
  function aoEntrar(e) {
    if (e.pointerType === "touch") return;
    var alvo = alvoDe(e.target); if (!alvo) return;
    /* ⚠ DEPOIS DO CLIQUE A TELA SE REDESENHA SOB O MOUSE PARADO: o elemento novo
       recebe "pointerover" e o cartão abriria sozinho em cima do que a pessoa
       acabou de escolher. Enquanto o mouse não sai do ponto do clique, não abre. */
    if (clique && Math.abs(e.clientX - clique.x) < 4 && Math.abs(e.clientY - clique.y) < 4) { guardarTitulo(alvo); return; }
    if (atual && atual.alvo === alvo) { clearTimeout(timerSai); return; }
    guardarTitulo(alvo);
    pendente = alvo;
    clearTimeout(timer);
    timer = setTimeout(function () { if (pendente === alvo && doc.body.contains(alvo)) mostrar(alvo); }, atual ? 60 : ESPERA);
  }
  function aoSair(e) {
    var alvo = alvoDe(e.target); if (!alvo) return;
    var para = e.relatedTarget;
    if (para && alvo.contains(para)) return;
    if (pendente === alvo) { pendente = null; clearTimeout(timer); }
    if (atual && atual.alvo === alvo) { clearTimeout(timerSai); timerSai = setTimeout(esconder, 70); }
    else devolverTitulo(alvo);
  }
  function aoFoco(e) {
    var alvo = alvoDe(e.target); if (!alvo) return;
    /* só pelo teclado: o foco que vem do clique não abre cartão (o clique já é a ação) */
    var porTeclado = true;
    try { porTeclado = e.target.matches(":focus-visible"); } catch (x) {}
    if (porTeclado) mostrar(alvo);
  }
  function aoPerderFoco(e) { var alvo = alvoDe(e.target); if (alvo && atual && atual.alvo === alvo) esconder(); }

  var iniciado = false;
  var DicaRica = {
    MAPA: MAPA,
    iniciar: function () {
      if (iniciado || !doc || !doc.addEventListener) return false;
      iniciado = true;
      var temPointer = typeof global.PointerEvent === "function";
      doc.addEventListener(temPointer ? "pointerover" : "mouseover", aoEntrar, true);
      doc.addEventListener(temPointer ? "pointerout" : "mouseout", aoSair, true);
      doc.addEventListener("focusin", aoFoco, true);
      doc.addEventListener("focusout", aoPerderFoco, true);
      doc.addEventListener("pointerdown", function (e) { pendente = null; clique = { x: e.clientX, y: e.clientY }; esconder(); }, true);
      doc.addEventListener("pointermove", function (e) {
        if (!clique || (Math.abs(e.clientX - clique.x) < 4 && Math.abs(e.clientY - clique.y) < 4)) return;
        clique = null;
        /* saiu do ponto do clique ainda em cima de um alvo: agora pode abrir */
        var alvo = alvoDe(e.target); if (alvo && !atual) { pendente = alvo; clearTimeout(timer); timer = setTimeout(function () { if (pendente === alvo && doc.body.contains(alvo)) mostrar(alvo); }, ESPERA); }
      }, true);
      /* Esc na JANELA e na captura: chega antes de quem para a propagação no documento */
      global.addEventListener("keydown", function (e) { if (e.key === "Escape" && atual) { esconder(); e.stopPropagation(); } }, true);
      doc.addEventListener("wheel", function () { if (atual) esconder(); }, { capture: true, passive: true });
      global.addEventListener("scroll", function () { if (atual) esconder(); }, true);
      global.addEventListener("blur", function () { esconder(); });
      return true;
    },
    registrar: function (cmdId, dicaId) { if (cmdId && dicaId) MAPA[cmdId] = dicaId; },
    item: function (id, dados) { if (id && dados) EXTRA[id] = dados; return EXTRA[id] || null; },
    obter: obter,
    tem: function (id) { return !!obter(MAPA[id] || id); },
    mostrar: function (el) { return mostrar(el); },
    esconder: esconder,
    atual: function () { return atual ? { id: atual.id, alvo: atual.alvo } : null; }
  };

  global.DicaRica = DicaRica;
  if (doc && doc.addEventListener) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { DicaRica.iniciar(); });
    else DicaRica.iniciar();
  }
  if (typeof module !== "undefined" && module.exports) module.exports = DicaRica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

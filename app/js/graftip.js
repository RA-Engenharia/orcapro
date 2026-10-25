/* =====================================================================
 * graftip.js — DICA FLUTUANTE, DESTAQUE LIGADO E LEGENDA CLICÁVEL DOS GRÁFICOS
 *
 * POR QUE EXISTE (23/10/2026, pedido do Rogério: "melhorar os gráficos e deixar
 * tudo mais interativo"):
 * os gráficos do Painel diziam o valor por `<title>` do SVG — a dica NATIVA do
 * navegador, que só aparece depois de ~1 s parada, sem formatação, não aparece
 * no toque nem no teclado, e não dizia o que o clique faz. Aqui há UMA dica
 * para todos os gráficos, desenhada pelo sistema:
 *   - segue o ponteiro e nunca sai da tela (`posicionar`, motor puro);
 *   - aparece também com o foco do teclado (Tab) e some com Esc;
 *   - no toque, o 1º toque mostra a dica e o 2º executa a ação (um toque só
 *     que já abre outra tela, sem dizer o quê, é o "clique sem querer");
 *   - destaca no gráfico tudo o que tem a mesma chave (`data-gt-k`): passar o
 *     mouse na linha da legenda acende a fatia e vice-versa;
 *   - a legenda é botão: ligar/desligar uma série sem refazer o gráfico.
 *
 * COMO O GRÁFICO FALA COM ELA (contrato — quem desenha só escreve atributos):
 *   data-gt='{"t":"06/26","l":[["Recebido","R$ 207.200,00","var(--graf-a)"]],"r":"Clique: abrir no Financeiro"}'
 *   data-gt-k="chave"          liga o elemento ao seu par (fatia ↔ legenda)
 *   data-gt-serie="a"          o elemento pertence à série "a" (some quando ela é desligada)
 *   data-gt-serie-bt="a"       o BOTÃO da legenda que liga/desliga a série "a"
 *   data-gt-grafico            o contêiner que guarda `data-off="a b"` (séries desligadas)
 * A ação do clique continua sendo a de sempre (`data-gacao`/`data-view`, tratada
 * pelo app.js): este módulo NÃO navega, só mostra o que vai acontecer.
 *
 * ⚠ A cor da linha da dica vem de dentro de um atributo HTML — conteúdo que
 *   qualquer coisa pode ter escrito. `decodificar` só aceita `var(--token)` ou
 *   #hex; o resto vira cinza. Texto vai sempre por `textContent`/`esc`.
 * ⚠ Motor puro (`html`, `decodificar`, `posicionar`, `alternar`) testado em
 *   tools/test-graftip.js; a fiação (`ligar`) é provada no navegador por
 *   tools/e2e-graf-interativo.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var COR_OK = /^(var\(--[a-z0-9-]+\)|#[0-9a-fA-F]{3,8})$/;
  function corSegura(c) { return COR_OK.test(String(c || "")) ? String(c) : ""; }

  /* o que o gráfico escreve no atributo: título, linhas [rótulo, valor, cor?], rodapé (o que o clique faz) */
  function codificar(c) { return JSON.stringify(c || {}); }

  function decodificar(txt) {
    var o;
    try { o = JSON.parse(String(txt)); } catch (e) { return null; }
    if (!o || typeof o !== "object") return null;
    var linhas = [];
    (Array.isArray(o.l) ? o.l : []).forEach(function (x) {
      if (!Array.isArray(x) || x.length < 2) return;
      linhas.push([String(x[0]), String(x[1]), corSegura(x[2])]);
    });
    var t = o.t == null ? "" : String(o.t), r = o.r == null ? "" : String(o.r);
    if (!t && !linhas.length && !r) return null;
    return { t: t, l: linhas, r: r };
  }

  function html(c) {
    if (!c) return "";
    var h = "";
    if (c.t) h += '<div class="gt-t">' + esc(c.t) + "</div>";
    (c.l || []).forEach(function (x) {
      h += '<div class="gt-l">' + (x[2] ? '<i style="background:' + esc(x[2]) + '"></i>' : "<i></i>") + "<span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>";
    });
    if (c.r) h += '<div class="gt-r">' + esc(c.r) + "</div>";
    return h;
  }

  /* onde a dica fica: à direita e abaixo do ponto; se não cabe, vira para o outro lado;
     nunca sai da janela (folga mínima nas bordas). */
  function posicionar(x, y, w, h, vw, vh, folga, desl) {
    folga = folga == null ? 8 : folga; desl = desl == null ? 14 : desl;
    var px = x + desl, py = y + desl;
    if (px + w + folga > vw) px = x - desl - w;
    if (py + h + folga > vh) py = y - desl - h;
    px = Math.max(folga, Math.min(px, vw - w - folga));
    py = Math.max(folga, Math.min(py, vh - h - folga));
    return { x: Math.round(px), y: Math.round(py) };
  }

  /* liga/desliga uma série na lista "a b". Sempre sobra pelo menos uma ligada:
     gráfico com tudo apagado parece quebrado. `total` = quantas séries existem. */
  function alternar(offTxt, serie, total) {
    var off = String(offTxt || "").split(/\s+/).filter(Boolean);
    var i = off.indexOf(serie);
    if (i > -1) off.splice(i, 1);
    else {
      if (total != null && off.length + 1 >= total) return off.join(" ");
      off.push(serie);
    }
    return off.join(" ");
  }

  var GrafTip = { esc: esc, codificar: codificar, decodificar: decodificar, html: html, posicionar: posicionar, alternar: alternar, corSegura: corSegura };

  /* ---------------------------------------------------------------- fiação */
  var ligado = false;
  GrafTip.ligar = function (doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || ligado) return false;
    ligado = true;
    try { doc.documentElement.classList.add("gt-ativo"); } catch (eCl) {}
    var win = doc.defaultView || global;
    var tip = null, atual = null, armado = null, bloqueiaClick = false, timer = null;

    function caixa() {
      if (tip && tip.parentNode) return tip;
      tip = doc.createElement("div");
      tip.id = "gt-tip"; tip.className = "gt-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
      doc.body.appendChild(tip);
      return tip;
    }
    function alvoDe(n) { return n && n.closest ? n.closest("[data-gt]") : null; }
    function esconder() {
      if (timer) { win.clearTimeout(timer); timer = null; }
      if (tip) tip.hidden = true;
      if (atual) { try { atual.removeAttribute("aria-describedby"); } catch (e) {} }
      atual = null;
    }
    function mostrar(el, x, y) {
      var c = decodificar(el.getAttribute("data-gt"));
      if (!c) return;
      var t = caixa();
      if (atual !== el) {
        t.innerHTML = html(c);
        if (atual) { try { atual.removeAttribute("aria-describedby"); } catch (e) {} }
        try { el.setAttribute("aria-describedby", "gt-tip"); } catch (e2) {}
        atual = el;
      }
      t.hidden = false;
      var p = posicionar(x, y, t.offsetWidth, t.offsetHeight, win.innerWidth || 1024, win.innerHeight || 768);
      t.style.left = p.x + "px"; t.style.top = p.y + "px";
    }
    function ancora(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 24) };
    }

    /* destaque ligado: tudo com a mesma `data-gt-k` dentro do mesmo gráfico acende; o resto esmaece */
    function destacar(el, ligarOuDesligar) {
      var k = el && el.getAttribute ? el.getAttribute("data-gt-k") : null;
      if (!k) return;
      var raiz = el.closest("[data-gt-grafico]") || el.parentNode;
      if (!raiz || !raiz.querySelectorAll) return;
      var par = raiz.querySelectorAll("[data-gt-k]");
      for (var i = 0; i < par.length; i++) {
        if (ligarOuDesligar && par[i].getAttribute("data-gt-k") === k) par[i].classList.add("gt-hl");
        else par[i].classList.remove("gt-hl");
      }
      if (ligarOuDesligar) raiz.classList.add("gt-tem-hl"); else raiz.classList.remove("gt-tem-hl");
    }

    doc.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var el = alvoDe(e.target);
      if (!el) { if (atual && !(doc.activeElement && doc.activeElement === atual)) esconder(); return; }
      mostrar(el, e.clientX, e.clientY);
    }, true);
    doc.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var k = e.target && e.target.closest ? e.target.closest("[data-gt-k]") : null;
      if (k) destacar(k, true);
    }, true);
    doc.addEventListener("pointerout", function (e) {
      var k = e.target && e.target.closest ? e.target.closest("[data-gt-k]") : null;
      if (k) destacar(k, false);
      if (e.pointerType !== "touch" && alvoDe(e.target) && !alvoDe(e.relatedTarget)) esconder();
    }, true);
    doc.addEventListener("focusin", function (e) {
      var k = e.target && e.target.closest ? e.target.closest("[data-gt-k]") : null;
      if (k) destacar(k, true);
      var el = alvoDe(e.target);
      if (!el) return;
      var a = ancora(el); mostrar(el, a.x, a.y);
    });
    doc.addEventListener("focusout", function (e) {
      var k = e.target && e.target.closest ? e.target.closest("[data-gt-k]") : null;
      if (k) destacar(k, false);
      if (alvoDe(e.target)) esconder();
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && atual) { esconder(); return; }
      /* Enter/Espaço no ponto focado faz o mesmo que o clique (elemento SVG não vira botão sozinho) */
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.hasAttribute && e.target.hasAttribute("data-gt") && (e.target.hasAttribute("data-gacao") || e.target.hasAttribute("data-view"))) {
        e.preventDefault();
        e.target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    });

    /* TOQUE: 1º toque mostra a dica (e segura o clique), 2º toque no mesmo ponto executa */
    doc.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") return;
      var el = alvoDe(e.target);
      if (!el) { esconder(); armado = null; return; }
      if (armado === el) { bloqueiaClick = false; return; }
      armado = el; bloqueiaClick = el.hasAttribute("data-gacao") || el.hasAttribute("data-view");
      mostrar(el, e.clientX, e.clientY);
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(function () { esconder(); armado = null; }, 4500);
    }, true);
    doc.addEventListener("click", function (e) {
      if (!bloqueiaClick) return;
      bloqueiaClick = false;
      if (alvoDe(e.target)) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    /* legenda clicável: liga/desliga a série (o desenho some por CSS, via data-off no contêiner) */
    doc.addEventListener("click", function (e) {
      var bt = e.target && e.target.closest ? e.target.closest("[data-gt-serie-bt]") : null;
      if (!bt) return;
      var raiz = bt.closest("[data-gt-grafico]");
      if (!raiz) return;
      var serie = bt.getAttribute("data-gt-serie-bt");
      var total = raiz.querySelectorAll("[data-gt-serie-bt]").length;
      var novo = alternar(raiz.getAttribute("data-off") || "", serie, total);
      if (novo) raiz.setAttribute("data-off", novo); else raiz.removeAttribute("data-off");
      var todos = raiz.querySelectorAll("[data-gt-serie-bt]");
      for (var i = 0; i < todos.length; i++) {
        var lig = (" " + novo + " ").indexOf(" " + todos[i].getAttribute("data-gt-serie-bt") + " ") < 0;
        todos[i].setAttribute("aria-pressed", lig ? "true" : "false");
      }
      esconder();
    });
    return true;
  };

  global.GrafTip = GrafTip;
  if (typeof module !== "undefined" && module.exports) module.exports = GrafTip;
  if (typeof document !== "undefined" && document.addEventListener) {
    var iniciar = function () { try { GrafTip.ligar(document); } catch (e) {} };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  }
})(typeof window !== "undefined" ? window : this);

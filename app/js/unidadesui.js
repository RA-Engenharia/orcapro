/* =====================================================================
 * unidadesui.js — O CAMPO COM UNIDADE (tela, ES5). 14/10/2026.
 *
 * Um <input> marcado com data-grandeza="forca" (ou momento, linear,
 * superficie, tensao, peso) ganha, sozinho, um SELETOR de unidade ao lado
 * (kN · kgf · tf; kN·m · kgf·m · tf·m; kN/m² · kgf/m² · tf/m² …) e aceita a
 * unidade digitada ("2 tf", "2000 kgf", "2.000 kg"). Embaixo, discreto, o
 * valor que vai para o cálculo ("= 19,61 kN"); em kN, a equivalência
 * ("≈ 2,00 tf"). Conversão pelo js/unidades.js (g = 9,80665 m/s²).
 *
 * CONTRATO COM AS TELAS (mexer o mínimo):
 *   · a tela continua escrevendo o valor em kN no value do input (o modelo e
 *     os projetos salvos continuam em kN) e só marca data-grandeza;
 *   · a tela lê o campo por UnidadesUI.texto(el): devolve o valor NA UNIDADE
 *     INTERNA como texto com vírgula ("19,6133"), que o num() de cada tela já
 *     entende; campo sem data-grandeza → el.value, sem mudança nenhuma;
 *   · texto inválido ou de outra grandeza ("2 tf·m" num campo de força)
 *     devolve o texto cru (a tela acusa "Número inválido" como sempre) e o
 *     campo mostra o motivo embaixo, em vermelho.
 * Liga sozinho: um MutationObserver acha os inputs marcados que entram na
 * página (diálogos, telas redesenhadas). A unidade escolhida fica gravada
 * por usuário e por grandeza (localStorage, sempre em try/catch).
 * ⚠ O "change" do próprio input roda antes do da tela (fase alvo × bolha):
 *   é ali que "2 tf" vira "2" com o seletor em tf.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;
  function U() { return global.Unidades || null; }
  var SEL = "input[data-grandeza],select[data-grandeza]";
  var PREF = "orcapro:unidades:";

  function usuario() { try { var u = global.Auth && Auth.usuario ? Auth.usuario() : null; return String((u && (u.id || u.uid || u.email)) || "anon"); } catch (e) { return "anon"; } }
  function chave(g) { return PREF + usuario() + ":" + g; }
  function pref(g) { try { var v = global.localStorage.getItem(chave(g)); var Gd = U() && U().GRANDEZAS[g]; return v && Gd && Gd.unidades[v] != null ? v : null; } catch (e) { return null; } }
  function gravar(g, u) { try { global.localStorage.setItem(chave(g), u); } catch (e) {} }

  /* o valor que a tela escreveu (em kN, sem milhar, vírgula ou ponto decimal) */
  function numSimples(s) { s = String(s == null ? "" : s).trim().replace(/[−–]/g, "-"); if (!s) return null; var n = Number(s.replace(",", ".")); return isFinite(n) ? n : NaN; }
  /* número para o campo: milhar com ponto, vírgula decimal, zeros aparados, "-" de teclado */
  function fmtCampo(x, u) {
    if (x == null || !isFinite(x)) return "";
    var casas = /^(kgf|N|Pa)/.test(u) && !/^N\/mm²/.test(u) ? 2 : 4;
    return U().numeroBR(x, casas, { aparar: true, menos: "-" });
  }
  function css() {
    if (!doc || doc.getElementById("un-ui-css")) return;
    var s = doc.createElement("style"); s.id = "un-ui-css";
    s.textContent = ".un-campo{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0;width:100%}" +
      ".un-campo>input{flex:1 1 64px;min-width:0}" +
      ".un-campo select.un-sel{flex:0 0 auto;width:auto;min-width:0;max-width:none;height:auto;min-height:28px;padding:0 4px;font:inherit;font-size:12px;border:1px solid var(--linha,#c9d3dd);border-radius:6px;background:var(--surface,#fff);color:var(--texto,#1d2733);cursor:pointer}" +
      ".un-campo select.un-sel:focus-visible{outline:2px solid #0d6ebd;outline-offset:1px}" +
      ".un-campo .un-eq{flex:1 0 100%;font-size:11px;line-height:1.3;color:var(--texto-2,#5b6774);min-height:0}" +
      ".un-campo .un-eq:empty{display:none}.un-campo .un-eq.erro{color:#c81e25}.un-campo .un-eq.aviso{color:#8a5a00}" +
      ".mc-in .un-campo{padding-right:4px}.mc-in .un-campo .un-eq{padding:0 0 3px 10px}";
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------ valor do campo */
  function estado(el) { return el && el.__un ? el.__un : null; }
  function valorInterno(el) {
    var e = estado(el), Un = U(); if (!e || !Un) return numSimples(el && el.value);
    if (el.value === e.texto) return e.valor;
    var r = Un.ler(el.value, e.g, e.u);
    if (r.ok) return r.valor;
    return r.vazio ? null : NaN;
  }
  /* para a tela: o valor em kN como texto com vírgula ("19,6133"); campo comum → el.value */
  function texto(el) {
    if (!el || !el.getAttribute || !el.getAttribute("data-grandeza")) return el ? el.value : "";
    if (!estado(el) || el.tagName === "SELECT") return el.value;
    var v = valorInterno(el);
    if (v == null) return "";
    if (!isFinite(v)) return el.value;
    return String(v).replace(".", ",");
  }

  function dica(el) {
    var e = estado(el), Un = U(); if (!e || !e.eq) return;
    var r = Un.ler(el.value, e.g, e.u), Gd = Un.GRANDEZAS[e.g], t = "", cls = "un-eq";
    if (el.value === e.texto && e.valor != null && isFinite(e.valor)) r = { ok: true, valor: e.valor, unidade: e.u, aviso: null };
    if (r.ok) {
      if (r.unidade !== Gd.interna) t = "= " + Un.formatar(r.valor, e.g, Gd.interna, { casas: 2 }) + " no cálculo";
      else if (r.valor) t = "≈ " + Un.formatar(r.valor, e.g, "tecnica");
      if (r.aviso) { t += (t ? " · " : "") + r.aviso; cls += " aviso"; }
    } else if (!r.vazio) { t = r.motivo || "Valor inválido."; cls += " erro"; }
    e.eq.className = cls; e.eq.textContent = t;
    el.setAttribute("aria-invalid", !r.ok && !r.vazio ? "true" : "false");
  }
  function mostrarEm(el, u) {
    var e = estado(el), Un = U(); if (!e || !Un || e.u === u) return;
    var v = valorInterno(el);
    e.u = u; e.sel.value = u;
    if (v != null && isFinite(v)) { el.value = fmtCampo(Un.converter(v, e.g, Un.GRANDEZAS[e.g].interna, u), u); e.valor = v; e.texto = el.value; }
    dica(el);
  }
  /* "2 tf" digitado: o seletor vai para tf e o campo fica "2" */
  function normalizar(el) {
    var e = estado(el), Un = U(); if (!e || !Un) return;
    var r = Un.ler(el.value, e.g, e.u);
    if (r.ok) {
      var Gd = Un.GRANDEZAS[e.g];
      if (r.unidade !== e.u) {
        if (Gd.seletor.indexOf(r.unidade) >= 0) { e.u = r.unidade; e.sel.value = r.unidade; el.value = fmtCampo(r.numero, r.unidade); gravar(e.g, r.unidade); }
        else el.value = fmtCampo(Un.converter(r.valor, e.g, Gd.interna, e.u), e.u);
      }
      e.valor = r.valor; e.texto = el.value;
    }
    dica(el);
  }

  /* o rótulo do campo dizia a unidade ("Fy (kN, − para baixo)", "g (kN/m²)"): o seletor passa a dizer */
  function limparRotulo(el, interna) {
    var lb = el.closest ? el.closest("label") : null; if (!lb) return;
    var esc = interna.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    function limpar(n) { if (n.nodeType === 3 && n.nodeValue.indexOf(interna) >= 0) n.nodeValue = n.nodeValue.replace(new RegExp("\\s*\\(" + esc + "\\)"), "").replace(new RegExp("\\(" + esc + ",\\s*"), "("); }
    /* o texto direto do <label> ou o do <span> do rótulo (diálogo das peças prontas e dos acessos) */
    for (var n = lb.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) limpar(n);
      else if (n.nodeType === 1 && n.tagName === "SPAN" && !/un-campo/.test(n.className || "")) for (var m = n.firstChild; m; m = m.nextSibling) limpar(m);
    }
  }

  /* <select data-grandeza> de valores da norma ("2,0 kN/m — atividade industrial"): cada opção ganha a
     equivalência técnica logo depois do valor ("2,0 kN/m (≈ 204 kgf/m) — …"); o value não muda */
  function anotarOpcoes(el, g) {
    var Un = U(), Gd = Un.GRANDEZAS[g]; el.__un = { g: g, select: true };
    var simb = Object.keys(Gd.unidades).filter(function (u) { return /^(kN|N|kPa|MPa)/.test(u); }).sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("([+\\-−]?\\d+(?:,\\d+)?)\\s*(" + simb.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }).join("|") + ")(?![\\wÀ-ÿ²³·/])");
    [].slice.call(el.options).forEach(function (o) {
      var t = o.textContent, m = re.exec(t); if (!m || /≈/.test(t)) return;
      var v = Un.lerNumero(m[1]) * Gd.unidades[m[2]]; if (!isFinite(v) || !v) return;
      var fim = m.index + m[0].length;
      o.textContent = t.slice(0, fim) + " (≈ " + Un.formatar(v, g, "tecnica") + ")" + t.slice(fim);
    });
    return true;
  }
  function ligar(el) {
    var Un = U(); if (!Un || !el || el.__un || el.type === "checkbox" || el.type === "hidden") return false;
    var g = el.getAttribute("data-grandeza"), Gd = Un.GRANDEZAS[g]; if (!Gd) return false;
    if (el.tagName === "SELECT") return anotarOpcoes(el, g);
    css();
    var v0 = numSimples(el.value), u = pref(g) || Gd.interna;
    var box = doc.createElement("span"); box.className = "un-campo";
    var sel = doc.createElement("select"); sel.className = "un-sel"; sel.setAttribute("aria-label", "Unidade de " + Gd.nome); sel.setAttribute("data-un-sel", g);
    sel.title = "Unidade — o cálculo é em " + Gd.interna + "; 1 kgf = 9,80665 N";
    Gd.seletor.forEach(function (x) { var o = doc.createElement("option"); o.value = x; o.textContent = x; sel.appendChild(o); });
    var eq = doc.createElement("small"); eq.className = "un-eq"; eq.setAttribute("aria-live", "polite"); eq.setAttribute("data-un-eq", g);
    el.parentNode.insertBefore(box, el); box.appendChild(el); box.appendChild(sel); box.appendChild(eq);
    var irmao = box.nextElementSibling; if (irmao && /(^|\s)mc-un(\s|$)/.test(irmao.className || "")) irmao.style.display = "none";
    limparRotulo(el, Gd.interna);
    el.__un = { g: g, u: Gd.interna, sel: sel, eq: eq, valor: isFinite(v0) ? v0 : null, texto: el.value };
    sel.value = Gd.interna;
    if (u !== Gd.interna) mostrarEm(el, u); else dica(el);
    el.addEventListener("input", function () { dica(el); });
    el.addEventListener("change", function () { normalizar(el); });
    sel.addEventListener("change", function (ev) {
      ev.stopPropagation();
      var novo = sel.value; mostrarEm(el, novo); gravar(g, novo);
      /* os outros campos da mesma grandeza na tela seguem a escolha */
      if (doc) [].slice.call(doc.querySelectorAll('input[data-grandeza="' + g + '"]')).forEach(function (o) { if (o !== el && estado(o)) mostrarEm(o, novo); });
    });
    return true;
  }
  function ligarEm(raiz) {
    if (!raiz || !U()) return 0; var n = 0;
    if (raiz.nodeType === 1 && raiz.matches && raiz.matches(SEL)) { if (ligar(raiz)) n++; }
    if (raiz.querySelectorAll) [].slice.call(raiz.querySelectorAll(SEL)).forEach(function (el) { if (ligar(el)) n++; });
    return n;
  }
  var obs = null;
  function iniciar() {
    if (!doc || obs || typeof global.MutationObserver !== "function") return;
    obs = new global.MutationObserver(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var ad = lista[i].addedNodes;
        for (var k = 0; k < ad.length; k++) { var nd = ad[k]; if (nd.nodeType === 1 && (nd.tagName === "INPUT" || nd.tagName === "SELECT" ? nd.hasAttribute("data-grandeza") : nd.querySelector && nd.querySelector(SEL))) ligarEm(nd); }
      }
    });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    ligarEm(doc.documentElement);
  }

  var UnidadesUI = {
    ligar: ligar, ligarEm: ligarEm, texto: texto, valor: valorInterno, iniciar: iniciar,
    unidade: function (el) { var e = estado(el); return e ? e.u : null; },
    preferida: function (g) { return pref(g); },
    escolher: function (g, u) { var Gd = U() && U().GRANDEZAS[g]; if (!Gd || Gd.unidades[u] == null) return false; gravar(g, u); if (doc) [].slice.call(doc.querySelectorAll('input[data-grandeza="' + g + '"]')).forEach(function (o) { if (estado(o)) mostrarEm(o, u); }); return true; }
  };
  global.UnidadesUI = UnidadesUI;
  if (typeof module !== "undefined" && module.exports) module.exports = UnidadesUI;
  if (doc) { if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", iniciar); else iniciar(); }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

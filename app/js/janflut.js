/* =====================================================================
 * janflut.js — GERENCIADOR ÚNICO de janelas flutuantes do OrçaPRO (16/11/2026)
 *
 * Pedido do Rogério: os auditores ("Auditar estrutura (concreto)" e os outros)
 * abriam no meio da tela, com véu escuro, e tapavam o 3D. Toda janela flutuante
 * passa a ter, num componente só:
 *   1. arrastar pela barra de título, sem sair da tela;
 *   2. minimizar (pílula na borda inferior), maximizar/restaurar e fechar —
 *      três botões no canto direito, padrão Windows;
 *   3. "abrir em janela separada" (window.open; no Electron o mesmo window.open
 *      vira BrowserWindow própria). A destacada é um ESPELHO: o conteúdo
 *      original continua no app, escondido, e cada clique/digitação lá é
 *      repassado ao original — por isso "Mostrar no 3D" lá continua enquadrando
 *      o 3D desta janela, sem reescrever handler de ninguém. Fechar a destacada
 *      devolve a janela ao app;
 *   4. "Mostrar no 3D"/localizar disparado de dentro da janela a minimiza
 *      (JanelasFlut.aoLocalizar), e a pílula a traz de volta;
 *   5. posição, tamanho e estado lembrados POR TIPO (localStorage, try/catch),
 *      sempre trazidos para dentro da tela visível;
 *   6. Esc fecha a janela do topo. Janela flutuante NÃO prende foco nem tem
 *      véu; os modais de verdade (UI.modal: confirmar/excluir/formulário)
 *      continuam modais — ganham só a barra (arrastar + maximizar).
 *
 * Motor puro (limitar/estado/chave) separado da fiação de DOM: o teste de
 * unidade (tools/test-janflut.js) roda o motor sem navegador; a e2e
 * (tools/e2e-janflut.js) prova a fiação no Chrome.
 * ===================================================================== */
(function (global) {
  "use strict";
  var PREFIXO = "raerp:janelas:";
  var BARRA_MIN = 34;      // o que da barra precisa ficar à vista para ainda dar para pegar
  var Z0 = 100000;

  /* ---------------- motor puro ---------------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  /* põe o retângulo dentro da tela: a largura/altura nunca passam da tela e a barra fica sempre pegável */
  function limitar(r, vw, vh) {
    vw = Math.max(200, num(vw, 1200)); vh = Math.max(160, num(vh, 800));
    var w = Math.max(220, Math.min(num(r && r.w, 560), vw - 8));
    var h = r && r.h != null ? Math.max(120, Math.min(num(r.h, 400), vh - 8)) : null;
    var x = Math.max(0, Math.min(num(r && r.x, vw - w - 16), vw - w));
    var y = Math.max(0, Math.min(num(r && r.y, 64), vh - BARRA_MIN));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: h == null ? null : Math.round(h) };
  }
  /* posição de nascer: encostada à DIREITA, abaixo da fita — o centro (onde está o modelo) fica livre */
  function posInicial(largura, vw, vh, n) {
    var w = Math.min(num(largura, 560), Math.max(220, vw - 8)), off = (num(n, 0) % 6) * 24;
    return limitar({ x: vw - w - 16 - off, y: 96 + off, w: w, h: null }, vw, vh);
  }
  function chave(tipo) { return PREFIXO + String(tipo || "geral").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase(); }
  function lerEstado(tipo, ls) {
    try { var s = (ls || global.localStorage).getItem(chave(tipo)); if (!s) return null; var o = JSON.parse(s); return o && typeof o === "object" ? o : null; } catch (e) { return null; }
  }
  function gravarEstado(tipo, o, ls) {
    try { (ls || global.localStorage).setItem(chave(tipo), JSON.stringify({ x: o.x, y: o.y, w: o.w, h: o.h, estado: o.estado === "max" ? "max" : "normal" })); return true; } catch (e) { return false; }
  }
  /* o estado guardado volta só como normal/max: minimizado ao reabrir esconderia a janela que a pessoa acabou de pedir */
  function estadoAoAbrir(salvo) { return salvo && salvo.estado === "max" ? "max" : "normal"; }

  /* ---------------- fiação de DOM ---------------- */
  var doc = global.document || null;
  var lista = [];          // { el, tipo, titulo, estado, pilula, ext, aoFechar }
  var zTopo = Z0, ultima = null, instalado = false;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function vw() { return global.innerWidth || (doc && doc.documentElement && doc.documentElement.clientWidth) || 1200; }
  function vh() { return global.innerHeight || (doc && doc.documentElement && doc.documentElement.clientHeight) || 800; }
  function reg(el) { for (var i = 0; i < lista.length; i++) if (lista[i].el === el) return lista[i]; return null; }
  function vivo(j) { return j && j.el && j.el.parentNode; }
  function limpar() { lista = lista.filter(function (j) { if (vivo(j)) return true; if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); fecharExt(j); return false; }); }

  function css() {
    if (!doc || !doc.head || doc.getElementById("jn-estilo")) return;
    var st = doc.createElement("style"); st.id = "jn-estilo";
    st.textContent =
      ".jn-janela{position:fixed;display:flex;flex-direction:column;box-sizing:border-box;min-width:220px;min-height:120px;max-height:calc(100vh - 8px);background:var(--surface,var(--card,#fff));color:var(--text,var(--texto,#16202a));border:1px solid var(--rv-linha-forte,var(--linha,rgba(0,0,0,.25)));border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.32);font:13px/1.45 system-ui,sans-serif;overflow:hidden;resize:both}" +
      ".jn-janela.jn-max{left:4px!important;top:4px!important;width:calc(100vw - 8px)!important;height:calc(100vh - 8px)!important;resize:none}" +
      ".jn-janela.jn-min,.jn-janela.jn-fora,.modal-bg.jn-min,.modal-bg-min.jn-min,.modal-bg-min.jn-fora{display:none!important}" +
      ".jn-barra{display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:4px 4px 4px 12px;background:var(--rv-painel-cab,rgba(127,127,127,.12));border-bottom:1px solid rgba(127,127,127,.25);cursor:move;user-select:none;touch-action:none}" +
      ".jn-titulo{flex:1;min-width:0;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".jn-botoes{display:flex;gap:2px;flex:0 0 auto}" +
      ".jn-bt{width:32px;height:26px;border:0;border-radius:4px;background:transparent;color:inherit;font:15px/1 system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}" +
      ".jn-bt:hover{background:rgba(127,127,127,.22)} .jn-bt[data-jn-acao=fechar]:hover{background:#c42b1c;color:#fff}" +
      ".jn-bt:focus-visible,.jn-pilula:focus-visible{outline:2px solid var(--accent,#1a73e8);outline-offset:1px}" +
      ".jn-corpo{flex:1 1 auto;overflow:auto;padding:12px 16px}" +
      "#jn-doca{position:fixed;left:8px;right:8px;bottom:6px;z-index:" + (Z0 + 5000) + ";display:flex;flex-wrap:wrap;gap:6px;pointer-events:none}" +
      ".jn-pilula{pointer-events:auto;max-width:260px;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:1px solid rgba(127,127,127,.4);background:var(--surface,var(--card,#fff));color:var(--text,var(--texto,#16202a));box-shadow:0 4px 14px rgba(0,0,0,.25);font:12.5px/1.2 system-ui,sans-serif;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".modal .jn-mbar{cursor:move;touch-action:none}" +
      ".jn-janela.jn-adotada{display:block;overflow:auto} .jn-adotada>.jn-barra{position:sticky;top:0;z-index:1;margin:-8px -8px 6px;border-radius:8px 8px 0 0}";
    doc.head.appendChild(st);
  }
  function doca() {
    var d = doc.getElementById("jn-doca");
    if (!d) { d = doc.createElement("div"); d.id = "jn-doca"; d.setAttribute("aria-label", "JanelasFlut minimizadas"); doc.body.appendChild(d); }
    return d;
  }
  function frente(j) { if (!j || !j.el) return; zTopo += 1; j.el.style.zIndex = String(zTopo); ultima = j; }
  function retAtual(j) {
    var r = j.el.getBoundingClientRect ? j.el.getBoundingClientRect() : { left: 0, top: 0, width: 560, height: 400 };
    return { x: r.left, y: r.top, w: r.width, h: j.temAltura ? r.height : null };
  }
  function aplicarRet(j, r) {
    var l = limitar(r, vw(), vh());
    j.el.style.left = l.x + "px"; j.el.style.top = l.y + "px"; j.el.style.width = l.w + "px";
    if (l.h != null) { j.el.style.height = l.h + "px"; j.temAltura = true; }
    return l;
  }
  function salvar(j) {
    if (!j || !j.tipo || j.estado === "min" || j.estado === "fora") return;
    var r = j.estado === "max" && j.normal ? j.normal : retAtual(j);
    gravarEstado(j.tipo, { x: r.x, y: r.y, w: r.w, h: r.h, estado: j.estado });
  }

  function minimizar(j) {
    j = j && j.el ? j : reg(j); if (!vivo(j) || j.estado === "min" || j.estado === "fora") return false;
    j.antesMin = j.estado; j.estado = "min"; j.el.classList.add("jn-min");
    var p = doc.createElement("button"); p.type = "button"; p.className = "jn-pilula"; p.setAttribute("data-jn-pilula", j.tipo || "");
    p.title = "Reabrir: " + j.titulo; p.textContent = "▢ " + j.titulo;
    p.addEventListener("click", function () { restaurar(j); });
    doca().appendChild(p); j.pilula = p;
    return true;
  }
  function restaurar(j) {
    j = j && j.el ? j : reg(j); if (!vivo(j)) return false;
    if (j.estado === "min") { j.el.classList.remove("jn-min"); j.estado = j.antesMin === "max" ? "max" : "normal"; }
    else if (j.estado === "max") { j.el.classList.remove("jn-max"); j.estado = "normal"; if (j.normal) aplicarRet(j, j.normal); }
    if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null;
    if (j.estado === "normal" && !j.modal) aplicarRet(j, retAtual(j));
    frente(j); salvar(j); botaoMax(j);
    return true;
  }
  function maximizar(j) {
    j = j && j.el ? j : reg(j); if (!vivo(j)) return false;
    if (j.estado === "max") return restaurar(j);
    if (j.estado === "min") restaurar(j);
    j.normal = retAtual(j); j.estado = "max"; j.el.classList.add("jn-max"); frente(j); salvar(j); botaoMax(j);
    return true;
  }
  function botaoMax(j) {
    var b = j.el.querySelector('[data-jn-acao="maximizar"]'); if (!b) return;
    var mx = j.estado === "max"; b.textContent = mx ? "❐" : "□"; b.title = mx ? "Restaurar" : "Maximizar"; b.setAttribute("aria-label", b.title);
  }
  function fechar(j) {
    j = j && j.el ? j : reg(j); if (!j) return false;
    /* janela ADOTADA (o elemento é do módulo e é reaproveitado): fechar = o "cancelar" do dono; o elemento fica */
    if (j.adotada) {
      salvar(j); if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null;
      j.el.classList.remove("jn-min"); j.el.classList.remove("jn-max"); j.estado = "normal";
      if (typeof j.aoFechar === "function") { try { j.aoFechar(); } catch (eA) {} }
      return true;
    }
    salvar(j);
    if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula);
    fecharExt(j);
    lista = lista.filter(function (x) { return x !== j; });
    if (j.modal && j.el.id === "modal-bg") { try { if (global.UI && UI.fecharModal) UI.fecharModal(); } catch (e) {} }
    else if (j.modal) { if (j.el.parentNode) j.el.parentNode.removeChild(j.el); }
    else if (j.el.parentNode) j.el.parentNode.removeChild(j.el);
    if (typeof j.aoFechar === "function") { try { j.aoFechar(); } catch (e2) {} }
    if (ultima === j) ultima = null;
    return true;
  }

  /* arrastar pela barra (pointer events; o botão da barra não arrasta) */
  function ligarArrasto(j, barra, mover) {
    barra.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || (e.target && e.target.closest && e.target.closest(".jn-bt"))) return;
      if (j.estado === "max") return;
      var r = mover.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      frente(j);
      try { barra.setPointerCapture(e.pointerId); } catch (eC) {}
      function mv(ev) {
        var l = limitar({ x: ev.clientX - dx, y: ev.clientY - dy, w: r.width, h: null }, vw(), vh());
        if (j.modal) { mover.style.position = "fixed"; mover.style.margin = "0"; mover.style.width = r.width + "px"; }
        mover.style.left = l.x + "px"; mover.style.top = l.y + "px";
      }
      function up() { barra.removeEventListener("pointermove", mv); barra.removeEventListener("pointerup", up); barra.removeEventListener("pointercancel", up); if (!j.modal) salvar(j); }
      barra.addEventListener("pointermove", mv); barra.addEventListener("pointerup", up); barra.addEventListener("pointercancel", up);
      e.preventDefault();
    });
    barra.addEventListener("dblclick", function (e) { if (e.target && e.target.closest && e.target.closest(".jn-bt")) return; maximizar(j); });
  }
  function botoes(destacar) {
    return '<span class="jn-botoes">' +
      (destacar ? '<button type="button" class="jn-bt" data-jn-acao="destacar" title="Abrir em janela separada" aria-label="Abrir em janela separada">⧉</button>' : "") +
      '<button type="button" class="jn-bt" data-jn-acao="minimizar" title="Minimizar" aria-label="Minimizar">–</button>' +
      '<button type="button" class="jn-bt" data-jn-acao="maximizar" title="Maximizar" aria-label="Maximizar">□</button>' +
      '<button type="button" class="jn-bt" data-jn-acao="fechar" data-jn-fechar title="Fechar (Esc)" aria-label="Fechar">✕</button></span>';
  }
  function ligarBotoes(j, raiz) {
    raiz.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-jn-acao]") : null; if (!b) return;
      var a = b.getAttribute("data-jn-acao");
      if (a === "fechar") fechar(j); else if (a === "minimizar") minimizar(j); else if (a === "maximizar") maximizar(j); else if (a === "destacar") destacar(j);
    });
  }

  /* abre (ou troca) uma janela flutuante NÃO modal. opts: tipo, titulo, html | elemento, id, attrCorpo, attrFechar,
     largura, aoFechar, destacavel (padrão true). Devolve o elemento raiz (com o id pedido). */
  function abrir(o) {
    if (!doc || !doc.body) return null;
    o = o || {}; instalar(); css(); limpar();
    var velho = o.id ? doc.getElementById(o.id) : null; if (velho) { var jv = reg(velho); if (jv) fechar(jv); else if (velho.parentNode) velho.parentNode.removeChild(velho); }
    var tipo = String(o.tipo || o.id || "geral"), titulo = String(o.titulo || "");
    var el = doc.createElement("div"); if (o.id) el.id = o.id;
    el.className = "jn-janela"; el.setAttribute("data-jn-tipo", tipo); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", titulo);
    var fecharAttr = o.attrFechar ? " " + o.attrFechar : "";
    el.innerHTML = '<div class="jn-barra" data-jn-barra><span class="jn-titulo">' + esc(titulo) + "</span>" + botoes(o.destacavel !== false).replace(" data-jn-fechar", " data-jn-fechar" + fecharAttr) + "</div>" +
      '<div class="jn-corpo"' + (o.attrCorpo ? " " + o.attrCorpo : "") + "></div>";
    var corpo = el.querySelector(".jn-corpo");
    if (o.elemento) corpo.appendChild(o.elemento); else corpo.innerHTML = o.html == null ? "" : String(o.html);
    doc.body.appendChild(el);
    var j = { el: el, corpo: corpo, tipo: tipo, titulo: titulo, estado: "normal", aoFechar: o.aoFechar, modal: false };
    lista.push(j);
    var salvo = lerEstado(tipo);
    aplicarRet(j, salvo ? { x: salvo.x, y: salvo.y, w: salvo.w, h: salvo.h } : posInicial(o.largura || 560, vw(), vh(), lista.length - 1));
    if (estadoAoAbrir(salvo) === "max") { j.normal = retAtual(j); j.estado = "max"; el.classList.add("jn-max"); }
    ligarArrasto(j, el.querySelector(".jn-barra"), el); ligarBotoes(j, el.querySelector(".jn-barra"));
    el.addEventListener("pointerdown", function () { frente(j); }, true);
    /* o botão "Fechar" que o próprio conteúdo trouxer (data-xxx-fechar) continua fechando */
    if (o.attrFechar && /^[a-z][a-z0-9-]*$/i.test(o.attrFechar)) corpo.addEventListener("click", function (e) { var b = e.target && e.target.closest ? e.target.closest("[" + o.attrFechar + "]") : null; if (b) fechar(j); });
    if (global.ResizeObserver) { try { var t = null; new global.ResizeObserver(function () { if (j.estado !== "normal") return; j.temAltura = true; clearTimeout(t); t = setTimeout(function () { salvar(j); }, 250); }).observe(el); } catch (eR) {} }
    frente(j); botaoMax(j);
    return el;
  }

  /* UI.modal (modal de verdade, com véu e foco): ganha a barra padrão — arrastar e maximizar/restaurar.
     Minimiza só por aoLocalizar ("Mostrar no 3D" de dentro dele): o véu some junto e a pílula o devolve. */
  /* MINIMIZAR o modal de verdade (1.2.361): o véu e a caixa somem, o 3D por trás fica livre, mas o DOM, os campos e a
     promessa do chamador continuam vivos. Para as ~80 checagens "tem modal aberto?" (getElementById("modal-bg"),
     .modal-bg) o minimizado conta como SEM modal: o id e a classe trocam para modal-bg-min — atalhos, teclado do 3D e
     Esc deixam de ser barrados por ele, e o Esc não o fecha. Restaurar devolve id, classe e o foco. */
  function modalEsconder(j) {
    var bg = j.el; j.focoAntes = doc.activeElement && bg.contains(doc.activeElement) ? doc.activeElement : null;
    try { if (j.focoAntes && j.focoAntes.blur) j.focoAntes.blur(); } catch (eB) {}
    bg.id = "modal-bg-min"; bg.classList.remove("modal-bg"); bg.classList.add("modal-bg-min"); bg.classList.add("jn-min");
  }
  function modalMostrar(j) {
    var bg = j.el; if (doc.getElementById("modal-bg") && doc.getElementById("modal-bg") !== bg) return false;
    bg.id = "modal-bg"; bg.classList.remove("modal-bg-min"); bg.classList.remove("jn-min"); bg.classList.add("modal-bg");
    var f = j.focoAntes && bg.contains(j.focoAntes) ? j.focoAntes : bg.querySelector(".body input,.body select,.body textarea,footer button,[data-fechar]");
    try { if (f && f.focus) f.focus(); } catch (eF) {}
    return true;
  }
  function modalMinimizar(j) {
    if (!vivo(j) || j.estado === "min" || j.estado === "fora") return false;
    modalEsconder(j); j.estado = "min";
    var p = doc.createElement("button"); p.type = "button"; p.className = "jn-pilula"; p.setAttribute("data-jn-pilula", "modal"); p.textContent = "▢ " + j.titulo; p.title = "Reabrir: " + j.titulo;
    p.addEventListener("click", function () { modalRestaurar(j); });
    doca().appendChild(p); j.pilula = p; return true;
  }
  function modalRestaurar(j) {
    if (!vivo(j)) { limpar(); return false; }
    if (!modalMostrar(j)) return false;
    j.estado = "normal"; if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null; return true;
  }
  function decorarModal(bg, titulo, opts) {
    opts = opts || {};
    if (!doc || !bg || !bg.querySelector) return null;
    instalar(); css(); limpar();
    var m = bg.querySelector(".modal"), cab = m && m.querySelector("header"); if (!cab) return null;
    var j = { el: bg, caixa: m, corpo: m, tipo: "modal", destacavel: opts.destacavel === true, titulo: String(titulo || "").replace(/<[^>]*>/g, "").trim() || "Janela", estado: "normal", modal: true };
    var hT = cab.querySelector("h2"); if (hT && hT.textContent) j.titulo = hT.textContent.trim() || j.titulo;
    cab.classList.add("jn-mbar");
    var fx = cab.querySelector("[data-fechar]");
    var bx = doc.createElement("button"); bx.type = "button"; bx.className = "btn ghost sm jn-bt"; bx.setAttribute("data-jn-acao", "maximizar"); bx.title = "Maximizar"; bx.setAttribute("aria-label", "Maximizar"); bx.textContent = "□";
    if (fx) cab.insertBefore(bx, fx); else cab.appendChild(bx);
    var bn = doc.createElement("button"); bn.type = "button"; bn.className = "btn ghost sm jn-bt"; bn.setAttribute("data-jn-acao", "minimizar"); bn.title = "Minimizar"; bn.setAttribute("aria-label", "Minimizar"); bn.textContent = "–";
    cab.insertBefore(bn, bx);
    bn.addEventListener("click", function () { modalMinimizar(j); });
    /* destacar só quando o chamador garante que o conteúdo não tem estado preso em closure (leitura) */
    if (opts.destacavel === true) {
      var bd = doc.createElement("button"); bd.type = "button"; bd.className = "btn ghost sm jn-bt"; bd.setAttribute("data-jn-acao", "destacar"); bd.title = "Abrir em janela separada"; bd.setAttribute("aria-label", "Abrir em janela separada"); bd.textContent = "⧉";
      cab.insertBefore(bd, bn); bd.addEventListener("click", function () { destacar(j); });
    }
    if (fx) { fx.title = fx.title || "Fechar (Esc)"; if (!fx.getAttribute("aria-label")) fx.setAttribute("aria-label", "Fechar"); }
    bx.addEventListener("click", function () {
      var mx = m.classList.toggle("jn-max"); j.estado = mx ? "max" : "normal";
      if (mx) { m.style.cssText += ";position:fixed;left:4px;top:4px;width:calc(100vw - 8px);max-width:none;height:calc(100vh - 8px);max-height:none;margin:0"; }
      else { m.style.position = ""; m.style.left = ""; m.style.top = ""; m.style.width = ""; m.style.maxWidth = ""; m.style.height = ""; m.style.maxHeight = ""; m.style.margin = ""; }
      bx.textContent = mx ? "❐" : "□"; bx.title = mx ? "Restaurar" : "Maximizar";
    });
    ligarArrasto(j, cab, m);
    lista.push(j);
    return j;
  }

  /* ---------------- destacar (janela separada) ---------------- */
  function caminho(raiz, n) { var p = []; while (n && n !== raiz) { var pai = n.parentNode; if (!pai) return null; p.unshift(Array.prototype.indexOf.call(pai.childNodes, n)); n = pai; } return n === raiz ? p : null; }
  function porCaminho(raiz, p) { var n = raiz; for (var i = 0; p && i < p.length && n; i++) n = n.childNodes[p[i]]; return n; }
  function campos(raiz) { return raiz.querySelectorAll("input,select,textarea"); }
  function copiarCampos(de, para) {
    var a = campos(de), b = campos(para);
    for (var i = 0; i < a.length && i < b.length; i++) { if (a[i].type === "checkbox" || a[i].type === "radio") b[i].checked = a[i].checked; else if (b[i].value !== a[i].value) b[i].value = a[i].value; }
  }
  function fecharExt(j) {
    if (!j || !j.ext) return;
    var w = j.ext; j.ext = null;
    try { if (j.obs) j.obs.disconnect(); } catch (e0) {} j.obs = null;
    try { clearInterval(j.vigia); } catch (e1) {}
    try { if (!w.closed) w.close(); } catch (e2) {}
  }
  function devolver(j) {
    if (!j || !j.ext) return;
    fecharExt(j);
    if (vivo(j) && j.modal) { j.el.classList.remove("jn-fora"); j.estado = "normal"; modalMostrar(j); return; }
    if (vivo(j)) { j.estado = "normal"; j.el.classList.remove("jn-fora"); aplicarRet(j, retAtual(j)); frente(j); }
  }
  function destacar(j) {
    j = j && j.el ? j : reg(j); if (!vivo(j) || (j.modal && !j.destacavel)) return null;
    if (j.ext && !j.ext.closed) { try { j.ext.focus(); } catch (e) {} return j.ext; }
    var r = retAtual(j), sx = (global.screenX || 0) + Math.round(r.x) + 40, sy = (global.screenY || 0) + Math.round(r.y) + 40;
    /* sem "noopener": a destacada precisa do opener (mesma origem) para o espelho funcionar. No Electron o window.open
       da página vira BrowserWindow própria pelo nativeWindowOpen — sem nodeIntegration, sem ponte nova. */
    var w = null;
    try { w = global.open("", "jn-" + j.tipo + "-" + Date.now().toString(36), "popup=yes,width=" + Math.round(Math.max(420, r.w)) + ",height=" + Math.round(Math.max(360, r.h || j.el.offsetHeight || 520)) + ",left=" + sx + ",top=" + sy); } catch (eO) { w = null; }
    if (!w || !w.document) { try { if (global.UI && UI.toast) UI.toast("O navegador bloqueou a janela separada. Libere pop-ups para este endereço.", "warn"); } catch (eT) {} return null; }
    var d = w.document, cab = "";
    var ls = doc.querySelectorAll('link[rel="stylesheet"],style'), base = doc.baseURI || (global.location && global.location.href) || "";
    d.open();
    d.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="' + esc(base) + '"><title>' + esc(j.titulo) + " — OrçaPRO</title></head><body class=\"jn-destacada-body\" style=\"margin:0\"></body></html>");
    d.close();
    for (var i = 0; i < ls.length; i++) { try { d.head.appendChild(d.importNode(ls[i], true)); } catch (eS) {} }
    try { if (doc.documentElement.getAttribute("data-theme")) d.documentElement.setAttribute("data-theme", doc.documentElement.getAttribute("data-theme")); d.body.className += " " + (doc.body.className || ""); } catch (eTh) {}
    var box = d.createElement("div"); box.className = "jn-corpo"; box.setAttribute("data-jn-espelho", j.tipo); box.style.cssText = "padding:12px 16px;font:13px/1.45 system-ui,sans-serif";
    d.body.appendChild(box);
    function pinta() { var st = box.scrollTop; box.innerHTML = j.corpo.innerHTML; copiarCampos(j.corpo, box); box.scrollTop = st; }
    pinta();
    var trava = false;
    function repassa(ev) {
      if (trava) return;
      var p = caminho(box, ev.target), alvo = p ? porCaminho(j.corpo, p) : null;
      if (!alvo) return;
      copiarCampos(box, j.corpo);
      if (ev.type === "click") {
        var a = ev.target.closest ? ev.target.closest("a[href]") : null;
        if (a && !/^#|^javascript:/i.test(a.getAttribute("href") || "")) return;   // link de verdade segue na destacada
        ev.preventDefault();
        ultima = j;
        trava = true; try { if (alvo.click) alvo.click(); else alvo.dispatchEvent(new global.MouseEvent("click", { bubbles: true })); } finally { trava = false; }
      } else {
        try { alvo.dispatchEvent(new global.Event(ev.type, { bubbles: true })); } catch (eE) {}
      }
    }
    box.addEventListener("click", repassa, true);
    box.addEventListener("change", repassa, true);
    box.addEventListener("input", function (ev) { var p = caminho(box, ev.target), alvo = p ? porCaminho(j.corpo, p) : null; if (alvo && "value" in alvo) { alvo.value = ev.target.value; try { alvo.dispatchEvent(new global.Event("input", { bubbles: true })); } catch (eI) {} } }, true);
    d.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { try { w.close(); } catch (eK) {} } });
    if (global.MutationObserver) {
      var t = null; j.obs = new global.MutationObserver(function () { if (trava) return; clearTimeout(t); t = setTimeout(pinta, 30); });
      j.obs.observe(j.corpo, { childList: true, subtree: true, characterData: true, attributes: true });
    }
    try { var stE = d.createElement("style"); stE.textContent = "[data-jn-espelho] .jn-bt{display:none!important}"; d.head.appendChild(stE); } catch (eSE) {}
    if (j.modal) { if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null; if (j.estado !== "min") modalEsconder(j); }
    j.ext = w; j.estado = "fora"; j.el.classList.add("jn-fora");
    if (j.pilula && j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null;
    try { w.addEventListener("beforeunload", function () { setTimeout(function () { devolver(j); }, 0); }); } catch (eU) {}
    j.vigia = setInterval(function () { if (!vivo(j)) { clearInterval(j.vigia); fecharExt(j); return; } if (!j.ext || j.ext.closed) { clearInterval(j.vigia); if (j.ext) devolver(j); } }, 500);
    return w;
  }

  /* "Mostrar no 3D" / localizar / selecionar disparado de dentro de uma janela: ela se minimiza e o 3D fica livre.
     `origem` (opcional) = elemento clicado; sem ele vale a última janela tocada. A destacada não minimiza (já está fora). */
  function aoLocalizar(origem) {
    limpar();
    var j = null;
    if (origem && origem.closest) { var raiz = origem.closest(".jn-janela,.modal-bg"); if (raiz) j = reg(raiz); }
    if (!j) { var bgA = doc.getElementById("modal-bg"); if (bgA) j = reg(bgA); }   // modal aberto por cima de tudo: é dele o clique
    if (!j) j = ultima && vivo(ultima) ? ultima : null;
    if (!j || j.estado === "fora" || j.estado === "min") return false;
    if (j.modal) return modalMinimizar(j);
    return minimizar(j);
  }

  function topo() {
    limpar(); var m = null;
    lista.forEach(function (j) { if (j.modal || j.semEsc || j.estado === "min" || j.estado === "fora" || (j.el.style && j.el.style.display === "none")) return; if (!m || (+j.el.style.zIndex || 0) > (+m.el.style.zIndex || 0)) m = j; });
    return m;
  }
  function instalar() {
    if (instalado || !doc) return; instalado = true;
    /* Esc: com modal de verdade aberto quem responde é ele; senão fecha a flutuante do topo */
    doc.addEventListener("keydown", function (e) {
      if (!(e.key === "Escape" || e.keyCode === 27)) return;
      var bg = doc.getElementById("modal-bg"); if (bg && !bg.classList.contains("jn-min")) return;
      var j = topo(); if (j) fechar(j);
    }, true);
    /* "Mostrar no 3D"/"Localizar"/"Ver no 3D" de QUALQUER UI.modal (não só os do ProblemaCard): depois do clique, se o
       modal ainda está à vista, ele se minimiza e o 3D fica livre */
    doc.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button,a,[role=button]") : null; if (!b) return;
      var bg = b.closest("#modal-bg"); if (!bg || b.closest("header")) return;
      var t = (b.getAttribute("data-pc-acao") === "mostrar") ? "mostrar" : String(b.textContent || "") + " " + String(b.title || "");
      if (t !== "mostrar" && !/mostrar no 3d|ver no 3d|localizar|selecionar no 3d|enquadrar/i.test(t)) return;
      setTimeout(function () { var j = reg(bg); if (j && j.estado === "normal" && bg.id === "modal-bg") modalMinimizar(j); }, 0);
    }, false);
    global.addEventListener && global.addEventListener("resize", function () { limpar(); lista.forEach(function (j) { if (!j.modal && j.estado === "normal") aplicarRet(j, retAtual(j)); }); });
    global.addEventListener && global.addEventListener("beforeunload", function () { lista.forEach(function (j) { if (!j.modal) salvar(j); fecharExt(j); }); });
  }
  /* ADOTAR um elemento flutuante que o módulo já cria e reaproveita (ex.: o cartão #hid-tracar do Traçar automaticamente,
     que reescreve o próprio innerHTML a cada prévia): o id, o HTML e os ouvintes do dono ficam; ganha a barra padrão
     (re-inserida se o dono reescrever o conteúdo), arrastar, pílula, maximizar, fechar (= opts.aoFechar), posição por
     tipo e "Mostrar no 3D" (opts.localizar = seletor dos botões que localizam) minimizando. Idempotente: chame a cada
     vez que o dono redesenhar. Sem destacar: o estado e o teclado do dono vivem nesta janela. */
  function adotar(el, o) {
    if (!doc || !el) return null;
    o = o || {}; instalar(); css(); limpar();
    var j = reg(el);
    if (!j) {
      j = { el: el, corpo: el, tipo: String(o.tipo || el.id || "adotada"), titulo: String(o.titulo || ""), estado: "normal", aoFechar: o.aoFechar, adotada: true, semEsc: o.semEsc !== false, modal: false };
      el.classList.add("jn-janela"); el.classList.add("jn-adotada"); el.setAttribute("data-jn-tipo", j.tipo);
      el.style.right = "auto"; el.style.resize = "both";   /* a altura máxima é a do dono (o cartão tem a sua) */
      var salvo = lerEstado(j.tipo), r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      aplicarRet(j, salvo ? { x: salvo.x, y: salvo.y, w: salvo.w, h: salvo.h } : { x: r ? r.left : vw() - 380, y: r ? r.top : 120, w: r && r.width ? r.width : 360, h: null });
      el.addEventListener("pointerdown", function () { frente(j); }, true);
      if (o.localizar) el.addEventListener("click", function (e) { var b = e.target && e.target.closest ? e.target.closest(o.localizar) : null; if (b) setTimeout(function () { if (j.estado === "normal" || j.estado === "max") minimizar(j); }, 0); });
      /* o dono escondeu o cartão (aplicou/cancelou): a pílula sai junto */
      if (global.MutationObserver) { try { new global.MutationObserver(function () { if (el.style.display === "none" && j.pilula) { if (j.pilula.parentNode) j.pilula.parentNode.removeChild(j.pilula); j.pilula = null; el.classList.remove("jn-min"); j.estado = "normal"; } }).observe(el, { attributes: true, attributeFilter: ["style"] }); } catch (eM) {} }
      lista.push(j);
    }
    if (o.titulo) j.titulo = String(o.titulo);
    var bar = el.firstElementChild && el.firstElementChild.classList && el.firstElementChild.classList.contains("jn-barra") ? el.firstElementChild : null;
    if (!bar) {
      var tmp = doc.createElement("div");
      tmp.innerHTML = '<div class="jn-barra" data-jn-barra><span class="jn-titulo">' + esc(j.titulo) + "</span>" + botoes(false) + "</div>";
      bar = tmp.firstChild; el.insertBefore(bar, el.firstChild);
      ligarArrasto(j, bar, el); ligarBotoes(j, bar); botaoMax(j);
    }
    if (j.estado !== "min") frente(j);
    return el;
  }
  function abertas() { limpar(); return lista.map(function (j) { return { tipo: j.tipo, titulo: j.titulo, estado: j.estado, modal: !!j.modal, id: j.el.id || "" }; }); }
  function achar(x) { limpar(); for (var i = 0; i < lista.length; i++) { var j = lista[i]; if (j.el === x || j.tipo === x || (x && j.el.id === x)) return j; } return null; }
  function api(fn) { return function (x) { var j = x && x.el ? x : achar(x); return j ? fn(j) : false; }; }

  var JanelasFlut = {
    abrir: abrir, adotar: adotar, decorarModal: decorarModal, aoLocalizar: aoLocalizar, abertas: abertas,
    minimizar: api(function (j) { return j.modal ? modalMinimizar(j) : minimizar(j); }), restaurar: api(function (j) { return j.modal ? modalRestaurar(j) : restaurar(j); }),
    modal: function () { limpar(); for (var i = lista.length - 1; i >= 0; i--) if (lista[i].modal) return lista[i]; return null; },
    /* "há modal VISÍVEL?" — minimizado conta como não */
    modalVisivel: function () { return !!(doc && doc.getElementById("modal-bg")); }, maximizar: api(maximizar), fechar: api(fechar), destacar: api(destacar),
    /* motor puro (teste de unidade) */
    _limitar: limitar, _posInicial: posInicial, _chave: chave, _lerEstado: lerEstado, _gravarEstado: gravarEstado, _estadoAoAbrir: estadoAoAbrir
  };
  global.JanelasFlut = JanelasFlut;
  if (typeof module !== "undefined" && module.exports) module.exports = JanelasFlut;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

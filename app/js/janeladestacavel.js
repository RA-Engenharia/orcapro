/* =====================================================================
 * janeladestacavel.js — "ABRIR EM OUTRA JANELA" para qualquer tela do OrçaPRO.
 * 16/10/2026 (BACKLOG #54: o dono trabalha com 2 monitores — o 3D num, o
 * cálculo no outro).
 *
 *   JanelaDestacavel.destacar(elementoConteudo, { titulo, aoVoltar, ... })
 *
 * Como funciona (e por quê):
 *  - abre uma janela da MESMA origem (window.open("", nome, "popup,...") — um
 *    about:blank que o próprio opener escreve; não depende de arquivo novo
 *    no servidor, no service worker nem no `--app=` do Edge);
 *  - copia as folhas de estilo do app (<link rel=stylesheet> com href
 *    absoluto e os <style>) e os atributos do <html>/<body> (tema escuro);
 *  - MOVE o nó (document.adoptNode): o MESMO nó, com os MESMOS ouvintes de
 *    evento e o mesmo estado em JS. Os cliques são tratados pelo código da
 *    janela principal; nada é duplicado nem copiado;
 *  - um marcador (comentário) guarda o lugar de origem: "voltar" devolve o nó
 *    exatamente ali, sem perder estado;
 *  - fechar a janela destacada (X do sistema, botão "Voltar para a tela
 *    principal") devolve o conteúdo; fechar a janela principal fecha a
 *    destacada;
 *  - posição e tamanho ficam em localStorage (try/catch), para reabrir no
 *    último lugar — o 2º monitor;
 *  - pop-up bloqueado: avisa na tela e o conteúdo FICA onde estava.
 *
 * opções:
 *   titulo            título da janela;
 *   aoVoltar()        chamado depois de o conteúdo voltar à janela principal;
 *   aoMudarDocumento(doc, janela)  chamado quando o conteúdo muda de documento (para
 *                     o código que guarda `document` — use `doc` do conteúdo);
 *   chaveArmazem      chave do localStorage da posição (padrão orcapro:janela:<nome>);
 *   nome              nome da janela (reabrir reaproveita);
 *   barra             true (padrão) põe uma barra fina com "Voltar para a tela
 *                     principal"; false se a tela já tem o próprio botão;
 *   css               CSS extra da janela destacada;
 *   aviso(texto)      como avisar (padrão: UI.toast).
 * devolve { ok, motivo?, aviso?, janela, voltar(), descartar(), focar(), destacada() }.
 * ES5, sem dependências.
 * ===================================================================== */
(function (global) {
  "use strict";

  var AVISO_BLOQUEIO = "O navegador bloqueou a nova janela — libere pop-ups para este site e tente de novo.";
  var ativas = [];

  function lerPos(chave) {
    try {
      var s = global.localStorage && global.localStorage.getItem(chave); if (!s) return null;
      var p = JSON.parse(s);
      if (!p || !isFinite(p.w) || !isFinite(p.h) || p.w < 320 || p.h < 220 || p.w > 10000 || p.h > 10000) return null;
      if (!isFinite(p.x) || !isFinite(p.y)) { p.x = null; p.y = null; }
      return p;
    } catch (e) { return null; }
  }
  function gravarPos(chave, p) { try { if (global.localStorage) global.localStorage.setItem(chave, JSON.stringify(p)); } catch (e) {} }
  function lerJanela(w) {
    try {
      var p = { x: Math.round(w.screenX != null ? w.screenX : w.screenLeft), y: Math.round(w.screenY != null ? w.screenY : w.screenTop), w: Math.round(w.outerWidth), h: Math.round(w.outerHeight) };
      return isFinite(p.x) && isFinite(p.y) && p.w >= 320 && p.h >= 220 ? p : null;
    } catch (e) { return null; }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function slug(s) { return String(s || "janela").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "janela"; }
  function avisar(opt, texto) {
    try { if (typeof opt.aviso === "function") return opt.aviso(texto); if (global.UI && global.UI.toast) return global.UI.toast(texto, "aviso", 10000); } catch (e) {}
  }

  function destacada(el) { for (var i = 0; i < ativas.length; i++) if (ativas[i].no === el) return ativas[i].api; return null; }

  function destacar(el, opt) {
    opt = opt || {};
    if (!el) return { ok: false, motivo: "sem-conteudo" };
    var ja = destacada(el); if (ja) { ja.focar(); return ja; }
    var principal = el.ownerDocument || global.document;
    var nome = opt.nome || "orcapro-" + slug(opt.titulo), chave = opt.chaveArmazem || "orcapro:janela:" + nome;
    var pos = lerPos(chave), feat = "popup=yes,resizable=yes,scrollbars=yes";
    if (pos) feat += ",width=" + pos.w + ",height=" + pos.h + (pos.x != null ? ",left=" + pos.x + ",top=" + pos.y : "");
    else {
      var lw = Math.max(900, Math.min(1280, ((global.screen && global.screen.availWidth) || 1280) - 120)), lh = Math.max(640, Math.min(900, ((global.screen && global.screen.availHeight) || 900) - 100));
      feat += ",width=" + lw + ",height=" + lh + ",left=" + Math.round((global.screenX || 0) + 60) + ",top=" + Math.round((global.screenY || 0) + 40);
    }
    var w = null;
    try { w = global.open("", nome, feat); } catch (e) { w = null; }
    var vivo = false; try { vivo = !!(w && !w.closed && w.document); } catch (e2) { vivo = false; }
    if (!vivo) { avisar(opt, AVISO_BLOQUEIO); return { ok: false, motivo: "bloqueada", aviso: AVISO_BLOQUEIO }; }

    var wd = w.document, estado = { fim: false, ultima: pos };
    try {
      wd.open();
      wd.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(opt.titulo || "OrçaPRO") + '</title></head><body></body></html>');
      wd.close();
    } catch (e3) { try { w.close(); } catch (e4) {} avisar(opt, AVISO_BLOQUEIO); return { ok: false, motivo: "sem-documento", aviso: AVISO_BLOQUEIO }; }

    /* o <html> e o <body> do app (tema escuro, classes) e as folhas de estilo, na ordem */
    try {
      var at = principal.documentElement.attributes;
      for (var a = 0; a < at.length; a++) { if (at[a].name !== "lang") wd.documentElement.setAttribute(at[a].name, at[a].value); }
      if (principal.body && principal.body.className) wd.body.className = principal.body.className;
      var fontes = principal.head ? principal.head.querySelectorAll('link[rel~="stylesheet"],style') : [];
      for (var f = 0; f < fontes.length; f++) {
        var n = fontes[f], c;
        if (/^link$/i.test(n.tagName)) { c = wd.createElement("link"); c.rel = "stylesheet"; c.href = n.href || n.getAttribute("href"); if (n.media) c.media = n.media; }
        else { c = wd.createElement("style"); c.textContent = n.textContent; }
        wd.head.appendChild(c);
      }
    } catch (e5) {}
    var base = wd.createElement("style");
    base.textContent = "html,body{margin:0;height:100%;overflow:hidden}body{display:flex;flex-direction:column;background:#0e1824;color:#e3ecf5;font-family:'Segoe UI',system-ui,sans-serif}" +
      ".jd-barra{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:6px 12px;background:#0f2740;color:#e6eff8;border-bottom:2px solid #e9a23b;font-size:13px}" +
      ".jd-barra b{flex:1;font-weight:650}.jd-barra button{height:28px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;font:600 12.5px inherit;cursor:pointer}" +
      ".jd-conteudo{flex:1 1 auto;min-height:0;position:relative;overflow:auto}" + (opt.css || "");
    wd.head.appendChild(base);

    var marcador = principal.createComment("janela-destacavel"), pai = el.parentNode;
    if (pai) pai.insertBefore(marcador, el);
    var cont = wd.createElement("div"); cont.className = "jd-conteudo";
    var api = null, timer = null;
    if (opt.barra !== false) {
      var barra = wd.createElement("div"); barra.className = "jd-barra";
      var tt = wd.createElement("b"); tt.textContent = opt.titulo || "OrçaPRO"; barra.appendChild(tt);
      var bv = wd.createElement("button"); bv.type = "button"; bv.textContent = "Voltar para a tela principal";
      bv.addEventListener("click", function () { api.voltar(); });
      barra.appendChild(bv); wd.body.appendChild(barra);
    }
    wd.body.appendChild(cont);
    var no = wd.adoptNode(el); cont.appendChild(no);

    function salvarPos() { var p = lerJanela(w); if (p) { var u = estado.ultima; if (!u || u.x !== p.x || u.y !== p.y || u.w !== p.w || u.h !== p.h) { estado.ultima = p; gravarPos(chave, p); } } }
    function desligar() {
      estado.fim = true;
      if (timer) { try { global.clearInterval(timer); } catch (e) {} timer = null; }
      try { w.removeEventListener("pagehide", aoFechar); } catch (e1) {}
      try { global.removeEventListener("pagehide", aoFecharPrincipal); global.removeEventListener("beforeunload", aoFecharPrincipal); } catch (e2) {}
      for (var i = ativas.length - 1; i >= 0; i--) if (ativas[i].no === el) ativas.splice(i, 1);
    }
    function mudou(d, j) { try { if (typeof opt.aoMudarDocumento === "function") opt.aoMudarDocumento(d, j); } catch (e) {} }
    function aoFechar() { if (!estado.fim) api.voltar(); }
    function aoFecharPrincipal() { if (estado.fim) return; salvarPos(); desligar(); try { w.close(); } catch (e) {} }

    api = {
      ok: true, janela: w, nome: nome, chave: chave,
      destacada: function () { return !estado.fim; },
      focar: function () { try { w.focus(); } catch (e) {} },
      posicao: function () { return estado.ultima; },
      /* devolve o conteúdo ao lugar de origem (idempotente) */
      voltar: function () {
        if (estado.fim) return false;
        salvarPos(); desligar();
        var d = principal, volta = null;
        try { volta = d.adoptNode(el); } catch (e) { volta = null; }
        if (!volta) { try { volta = d.importNode(el, true); } catch (e2) { volta = null; } }
        if (volta) {
          if (marcador.parentNode) marcador.parentNode.insertBefore(volta, marcador);
          else if (d.body) d.body.appendChild(volta);
        }
        try { if (marcador.parentNode) marcador.parentNode.removeChild(marcador); } catch (e3) {}
        mudou(d, global);
        try { if (!w.closed) w.close(); } catch (e4) {}
        try { if (typeof opt.aoVoltar === "function") opt.aoVoltar(volta || el); } catch (e5) { try { if (global.console) global.console.error(e5); } catch (e6) {} }
        return true;
      },
      /* fecha a janela SEM trazer o conteúdo de volta (quem chama vai descartá-lo) */
      descartar: function () {
        if (estado.fim) return false;
        salvarPos(); desligar();
        try { if (marcador.parentNode) marcador.parentNode.removeChild(marcador); } catch (e) {}
        mudou(principal, global);
        try { if (!w.closed) w.close(); } catch (e2) {}
        return true;
      }
    };
    ativas.push({ no: el, api: api });
    mudou(wd, w);
    try { w.addEventListener("pagehide", aoFechar); } catch (e6) {}
    try { global.addEventListener("pagehide", aoFecharPrincipal); global.addEventListener("beforeunload", aoFecharPrincipal); } catch (e7) {}
    /* o X do sistema nem sempre dispara pagehide no app instalado: o relógio pega (e guarda a posição) */
    try { timer = global.setInterval(function () { if (estado.fim) return; var fechada = false; try { fechada = !!w.closed; } catch (e) { fechada = true; } if (fechada) api.voltar(); else salvarPos(); }, 500); } catch (e8) {}
    try { w.focus(); } catch (e9) {}
    return api;
  }

  global.JanelaDestacavel = { destacar: destacar, destacada: destacada, AVISO_BLOQUEIO: AVISO_BLOQUEIO };
  if (typeof module !== "undefined" && module.exports) module.exports = global.JanelaDestacavel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

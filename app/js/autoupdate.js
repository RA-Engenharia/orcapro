/* =====================================================================
 * autoupdate.js — Aviso e aplicação de atualização (1 clique).
 * Conversa com o servidor local (server/static.js):
 *   GET  /__update/check  -> { temAtualizacao, instalada, disponivel, notas }
 *   POST /__update/apply  -> baixa e extrai a nova versão por cima
 * A faixa só aparece quando há versão nova; some sozinha depois de atualizar
 * (a versão instalada alcança a disponível). "Agora não" não repete a mesma versão.
 * Os dados do cliente ficam no navegador (localStorage) — a troca de arquivos não os toca.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ADIADA_KEY = "orcapro:update:adiada";
  var estilosInjetados = false;

  function injetarEstilos() {
    if (estilosInjetados) return; estilosInjetados = true;
    var css =
      "#opr-upd{position:fixed;left:0;right:0;top:0;z-index:99999;display:flex;align-items:center;gap:14px;" +
      "padding:11px 18px;background:linear-gradient(90deg,#0f2740,#1c4b73);color:#fff;" +
      "font-family:'Segoe UI',system-ui,Arial,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.28);animation:oprUpdIn .35s ease}" +
      "@keyframes oprUpdIn{from{transform:translateY(-100%)}to{transform:translateY(0)}}" +
      "#opr-upd .opr-ic{font-size:20px;flex:none}" +
      "#opr-upd .opr-tx{flex:1;min-width:0;font-size:14.5px;line-height:1.3}" +
      "#opr-upd .opr-tx b{font-weight:800}" +
      "#opr-upd .opr-tx small{display:block;color:#bcd4e8;font-size:12.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#opr-upd button{font-family:inherit;font-weight:700;font-size:13.5px;border:0;border-radius:9px;padding:9px 16px;cursor:pointer;white-space:nowrap}" +
      "#opr-upd .opr-go{background:#16a34a;color:#fff}" +
      "#opr-upd .opr-go:hover{background:#12833c}" +
      "#opr-upd .opr-later{background:transparent;color:#bcd4e8;border:1px solid rgba(255,255,255,.35)}" +
      "#opr-upd .opr-later:hover{color:#fff}" +
      "#opr-upd .opr-sp{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:oprSpin .8s linear infinite;flex:none}" +
      "@keyframes oprSpin{to{transform:rotate(360deg)}}";
    var s = document.createElement("style"); s.id = "opr-upd-style"; s.textContent = css;
    document.head.appendChild(s);
  }

  function fechar() { var b = document.getElementById("opr-upd"); if (b) b.parentNode.removeChild(b); }

  function primeiraLinha(txt) {
    if (!txt) return "";
    var l = String(txt).split(/\r?\n/).filter(function (x) { return x.trim(); })[0] || "";
    l = l.replace(/^[\s\-*•]+/, "").trim();
    return l.length > 90 ? l.slice(0, 88) + "…" : l;
  }

  function mostrarBanner(d) {
    injetarEstilos();
    fechar();
    var bar = document.createElement("div");
    bar.id = "opr-upd";
    var nota = primeiraLinha(d.notas);
    bar.innerHTML =
      '<span class="opr-ic">🎉</span>' +
      '<div class="opr-tx"><b>Nova versão ' + esc(d.disponivel) + ' disponível.</b>' +
      (nota ? '<small>' + esc(nota) + '</small>' : '<small>Correções e melhorias. Seus orçamentos ficam salvos.</small>') +
      '</div>' +
      '<button class="opr-go">⬇ Atualizar agora</button>' +
      '<button class="opr-later">Agora não</button>';
    document.body.appendChild(bar);
    bar.querySelector(".opr-go").onclick = function () { aplicar(d); };
    bar.querySelector(".opr-later").onclick = function () { adiar(d); };
  }

  function estado(html) {
    var bar = document.getElementById("opr-upd"); if (!bar) return;
    bar.innerHTML = html;
  }

  function aplicar(d) {
    estado('<span class="opr-sp"></span><div class="opr-tx"><b>Atualizando para a versão ' + esc(d.disponivel) + '…</b>' +
      '<small>Baixando e instalando. Não feche o app — leva alguns segundos.</small></div>');
    fetch("/__update/apply", { method: "POST" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: "resposta inválida" }; }); })
      .then(function (res) {
        if (res && res.ok) {
          try { localStorage.removeItem(ADIADA_KEY); } catch (e) {}
          estado('<span class="opr-ic">✅</span><div class="opr-tx"><b>Atualizado! Recarregando…</b>' +
            '<small>Pronto — você já está na versão ' + esc(res.versao || d.disponivel) + '.</small></div>');
          limparCachesERecarregar();
        } else {
          erro(d, (res && res.erro) || "Não foi possível atualizar agora.");
        }
      })
      .catch(function () { erro(d, "Sem conexão para baixar a atualização."); });
  }

  function erro(d, msg) {
    estado('<span class="opr-ic">⚠️</span><div class="opr-tx"><b>Não deu pra atualizar.</b><small>' + esc(msg) + '</small></div>' +
      '<button class="opr-go">Tentar de novo</button><button class="opr-later">Fechar</button>');
    var bar = document.getElementById("opr-upd"); if (!bar) return;
    bar.querySelector(".opr-go").onclick = function () { aplicar(d); };
    bar.querySelector(".opr-later").onclick = function () { fechar(); };
  }

  function limparCachesERecarregar() {
    var done = false;
    function go() {
      if (done) return; done = true;
      var url = location.pathname + "?upd=" + Date.now();
      location.replace(url);
    }
    try {
      var tarefas = [];
      if (global.caches && caches.keys) tarefas.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) tarefas.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      Promise.all(tarefas).then(go, go);
    } catch (e) { go(); }
    setTimeout(go, 1500); // fallback: recarrega de qualquer jeito
  }

  function adiar(d) {
    try { localStorage.setItem(ADIADA_KEY, d.disponivel); } catch (e) {}
    fechar();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var AutoUpdate = {
    // Verifica no boot. Silencioso se: não há servidor de update, offline, ou já é a última.
    verificar: function () {
      fetch("/__update/check", { method: "GET" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.temAtualizacao || !d.disponivel) return;
          var adiada = null; try { adiada = localStorage.getItem(ADIADA_KEY); } catch (e) {}
          if (adiada && adiada === d.disponivel && !d.obrigatoria) return; // "agora não" p/ ESTA versão
          mostrarBanner(d);
        })
        .catch(function () { /* sem endpoint / offline: não faz nada */ });
    }
  };

  global.AutoUpdate = AutoUpdate;
})(window);

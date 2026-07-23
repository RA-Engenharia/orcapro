/* =====================================================================
 * autoupdate.js — Atualização AUTOMÁTICA e silenciosa (sem pedir nada).
 * Conversa com o servidor local (server/static.js):
 *   GET  /__update/check  -> { temAtualizacao, instalada, disponivel, notas }
 *   POST /__update/apply  -> baixa e extrai a nova versão por cima
 *
 * Política (v1.1.113): havendo versão nova, o app BAIXA E APLICA sozinho em
 * segundo plano e recarrega SOZINHO — mas só num momento seguro (sem modal
 * aberto, sem documento em impressão, sem campo sendo digitado, sem reunião
 * BIM ativa). O cliente nunca precisa clicar em "Atualizar". Falhou (offline,
 * servidor fora)? Silencioso — tenta de novo na próxima verificação/boot.
 * Os dados do cliente ficam no navegador (localStorage/IndexedDB) — a troca
 * de arquivos não os toca.
 * ===================================================================== */
(function (global) {
  "use strict";

  var estilosInjetados = false;
  var aplicando = false;          // evita apply duplo (boot + verificação periódica)
  var recarregarPendente = false; // update aplicado no disco, aguardando momento seguro
  var ultimaInteracao = 0;        // último keydown/pointerdown — mede ociosidade REAL

  // higiene: chave do fluxo antigo ("agora não") não existe mais
  try { localStorage.removeItem("orcapro:update:adiada"); } catch (e) {}
  try {
    document.addEventListener("keydown", function () { ultimaInteracao = Date.now(); }, true);
    document.addEventListener("pointerdown", function () { ultimaInteracao = Date.now(); }, true);
  } catch (e) {}

  function injetarEstilos() {
    if (estilosInjetados) return; estilosInjetados = true;
    var css =
      "#opr-upd{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;gap:12px;" +
      "padding:9px 16px calc(9px + env(safe-area-inset-bottom,0px));background:linear-gradient(90deg,#0f2740,#1c4b73);color:#fff;" +
      "}body:has(#opr-upd) .toasts{bottom:64px}#opr-upd{" +
      "font-family:'Segoe UI',system-ui,Arial,sans-serif;box-shadow:0 -3px 14px rgba(0,0,0,.25);animation:oprUpdIn .35s ease}" +
      "@keyframes oprUpdIn{from{transform:translateY(100%)}to{transform:translateY(0)}}" +
      "#opr-upd .opr-ic{font-size:17px;flex:none}" +
      "#opr-upd .opr-tx{flex:1;min-width:0;font-size:13px;line-height:1.3}" +
      "#opr-upd .opr-tx b{font-weight:800}" +
      "#opr-upd .opr-tx small{display:block;color:#bcd4e8;font-size:11.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#opr-upd .opr-sp{width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:oprSpin .8s linear infinite;flex:none}" +
      "@keyframes oprSpin{to{transform:rotate(360deg)}}";
    var s = document.createElement("style"); s.id = "opr-upd-style"; s.textContent = css;
    document.head.appendChild(s);
  }

  function fechar() { var b = document.getElementById("opr-upd"); if (b) b.parentNode.removeChild(b); }

  function faixa(html) {
    injetarEstilos();
    var bar = document.getElementById("opr-upd");
    if (!bar) { bar = document.createElement("div"); bar.id = "opr-upd"; document.body.appendChild(bar); }
    bar.innerHTML = html;
  }

  /* Momento seguro pra recarregar: nada aberto/digitando/carregado que o reload perderia. */
  function seguroRecarregar() {
    try {
      if (document.querySelector(".modal-bg")) return false;                 // modal aberto
      if (document.getElementById("proposta-print")) return false;           // documento em impressão
      if (document.getElementById("opr-upd-forcar")) return false;           // update manual em curso
      if (global.BIM && BIM.reuniao && BIM.reuniao.ativa) return false;      // reunião RA/RV ao vivo
      // modelo IFC carregado vive só em MEMÓRIA — recarregar descartaria o trabalho do viewer;
      // sessão BIM fica na versão atual e pega a nova no próximo boot (update já está no disco)
      if (global.BIM && BIM.visiveis && BIM.visiveis() > 0) return false;
      if (document.getElementById("ui-loading")) return false;               // operação longa em curso (spinner)
      var ae = document.activeElement;
      // foco em campo NÃO trava sozinho (cursor esquecido numa busca prenderia p/ sempre):
      // com foco, exige 60s sem NENHUMA interação; sem foco, basta não estar no meio de algo
      if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && Date.now() - ultimaInteracao < 60000) return false;
    } catch (e) {}
    return true;
  }

  function limparCachesERecarregar() {
    var done = false;
    function go() {
      if (done) return; done = true;
      // PRESERVA ?query e #hash — o visor da RA/RV na nuvem carrega o token no #rv?t=<token>;
      // recarregar só com pathname perderia o token e quebraria o link. Cache-bust no query,
      // removendo _upd anteriores (senão a URL acumula um parâmetro por atualização).
      var s = location.search.replace(/[?&]_upd=\d+/g, "").replace(/^&/, "?");
      var sep = s ? "&" : "?";
      location.replace(location.pathname + s + sep + "_upd=" + Date.now() + location.hash);
    }
    try {
      var tarefas = [];
      if (global.caches && caches.keys) tarefas.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) tarefas.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      Promise.all(tarefas).then(go, go);
    } catch (e) { go(); }
    setTimeout(go, 1500); // fallback: recarrega de qualquer jeito
  }

  /* Update já está no disco: recarrega agora se seguro, senão espera ficar. */
  function agendarRecarga(versao) {
    if (recarregarPendente) return;
    recarregarPendente = true;
    function tentar() {
      if (seguroRecarregar()) {
        faixa('<span class="opr-ic">✅</span><div class="opr-tx"><b>Atualizado para a versão ' + esc(versao) + ' — recarregando…</b></div>');
        // re-checa DEPOIS da faixa aparecer: se o cliente voltou a mexer nesses 400ms, espera de novo
        setTimeout(function () { if (seguroRecarregar()) limparCachesERecarregar(); else setTimeout(tentar, 15000); }, 400);
      } else {
        // discreto: avisa que está pronto e recarrega sozinho quando o cliente terminar o que está fazendo
        faixa('<span class="opr-ic">✅</span><div class="opr-tx"><b>Versão ' + esc(versao) + ' instalada.</b><small>O app recarrega sozinho assim que você concluir o que está fazendo.</small></div>');
        setTimeout(tentar, 15000);
      }
    }
    tentar();
  }

  /* Baixa e aplica SEM perguntar. Silencioso na falha (tenta de novo depois). */
  function aplicarSilencioso(d) {
    if (aplicando || recarregarPendente) return;
    aplicando = true;
    faixa('<span class="opr-sp"></span><div class="opr-tx"><b>Atualizando para a versão ' + esc(d.disponivel) + ' em segundo plano…</b>' +
      '<small>Pode continuar usando normalmente — seus dados não são tocados.</small></div>');
    fetch("/__update/apply", { method: "POST" })
      .then(function (r) {
        // 409 = outra aba já está aplicando: o disco vai ficar atualizado — esta aba
        // só precisa recarregar quando seguro (senão ficaria no JS velho pra sempre)
        if (r.status === 409) { aplicando = false; agendarRecarga(d.disponivel); return null; }
        return r.json().catch(function () { return { ok: false }; });
      })
      .then(function (res) {
        if (res === null) return;
        aplicando = false;
        if (res && res.ok) { agendarRecarga(res.versao || d.disponivel); }
        else { fechar(); } // falhou: silencioso — próximo check tenta de novo
      })
      .catch(function () { aplicando = false; fechar(); });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Botão manual "🔄 Buscar atualização" (topbar + visor da nuvem): puxa a versão nova SEM baixar ZIP —
  // limpa o cache do navegador + desregistra o service worker e recarrega buscando os arquivos novos do
  // servidor. Essencial no CELULAR, que não tem Ctrl+Shift+R. Preserva o token do visor da nuvem (#rv?t=).
  function forcarAtualizacao() {
    injetarEstilos(); // garante os keyframes do spinner
    // Um /apply está em voo (arquivos sendo trocados no disco)? Recarregar AGORA pegaria
    // uma mistura de versão velha+nova. Espera o apply terminar — a recarga vem sozinha.
    if (aplicando) {
      faixa('<span class="opr-sp"></span><div class="opr-tx"><b>A atualização já está sendo instalada…</b><small>O app recarrega sozinho em instantes.</small></div>');
      return;
    }
    if (!document.getElementById("opr-upd-forcar")) {
      var ov = document.createElement("div");
      ov.id = "opr-upd-forcar";
      ov.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;gap:14px;" +
        "align-items:center;justify-content:center;background:rgba(11,26,43,.94);color:#fff;text-align:center;padding:24px;" +
        "font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:16px;font-weight:600";
      ov.innerHTML = '<div class="opr-sp" style="width:30px;height:30px"></div><div>🔄 Buscando a versão mais nova…</div>';
      document.body.appendChild(ov);
    }
    limparCachesERecarregar();
  }

  var AutoUpdate = {
    forcar: forcarAtualizacao, // botão manual (mobile-friendly)
    // Verifica e ATUALIZA sozinho. Silencioso se: não há servidor de update, offline, ou já é a última.
    verificar: function () {
      fetch("/__update/check", { method: "GET" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.temAtualizacao || !d.disponivel) return;
          aplicarSilencioso(d);
        })
        .catch(function () { /* sem endpoint / offline: não faz nada */ });
      // App aberto o dia todo também se mantém em dia: re-verifica a cada 4h.
      if (!AutoUpdate._timer) {
        AutoUpdate._timer = setInterval(function () {
          if (aplicando || recarregarPendente) return;
          fetch("/__update/check", { method: "GET" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && d.temAtualizacao && d.disponivel) aplicarSilencioso(d); })
            .catch(function () {});
        }, 4 * 60 * 60 * 1000);
      }
    }
  };

  global.AutoUpdate = AutoUpdate;
})(window);

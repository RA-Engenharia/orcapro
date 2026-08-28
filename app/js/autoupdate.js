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

  // higiene: limpa a chave do fluxo ANTIGO de "agora não" (v1), que não existe mais.
  // ⚠ A chave do fluxo atual é OUTRA (:v2) de propósito — usar o mesmo nome fazia
  // esta linha apagar a escolha do usuário a cada boot, e o aviso de versão nova
  // voltava em TODA abertura do app.
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
      /* ⚠ v1.1.235 — APRESENTAÇÃO AO CLIENTE É AO VIVO. Recarregar a página
         no meio dela derruba o deck na frente de quem está comprando: a tela
         pisca, volta ao Painel e o vendedor perde o fio. Mesma razão da
         reunião RA/RV logo abaixo — o update espera o próximo boot. */
      if (document.querySelector(".apres-overlay")) return false;            // apresentação em curso
      if (document.fullscreenElement) return false;                          // qualquer tela cheia (deck, viewer)
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
        faixa('<span class="opr-ic">' + (typeof Icones !== 'undefined' ? Icones.get('check', 15) : '') + '</span><div class="opr-tx"><b>Atualizado para a versão ' + esc(versao) + ' — recarregando…</b></div>');
        // re-checa DEPOIS da faixa aparecer: se o cliente voltou a mexer nesses 400ms, espera de novo
        setTimeout(function () { if (seguroRecarregar()) limparCachesERecarregar(); else setTimeout(tentar, 15000); }, 400);
      } else {
        // discreto: avisa que está pronto e recarrega sozinho quando o cliente terminar o que está fazendo
        faixa('<span class="opr-ic">' + (typeof Icones !== 'undefined' ? Icones.get('check', 15) : '') + '</span><div class="opr-tx"><b>Versão ' + esc(versao) + ' instalada.</b><small>O app recarrega sozinho assim que você concluir o que está fazendo.</small></div>');
        setTimeout(tentar, 15000);
      }
    }
    tentar();
  }

  /* ⚠ O DISCO ANDOU EMBAIXO DESTA PÁGINA.
   *
   * `agendarRecarga` só era chamado por quem TINHA acabado de aplicar o update.
   * Quando os arquivos trocam por fora — outra janela do app que atualizou
   * primeiro, o instalador, ou alguém chamando /__update/apply direto — esta
   * página continua executando o código que carregou, para sempre, sem nada na
   * tela. O `/__update/check` respondia `temAtualizacao: false` (o disco JÁ
   * está na última) e as duas chamadas desistiam ali, com `d.instalada` na mão
   * e sem comparar com a versão que a própria página está rodando.
   *
   * MEDIDO NA FROTA, 28/08/2026: uma janela aberta havia 13h20 e 161 pings
   * seguia reportando 1.2.4 com o disco em 1.2.7 — três versões de correção
   * atrás, incluindo a guarda que impede duas empresas de caírem no mesmo
   * balde. Quem olhasse a telemetria leria "instalação desatualizada" e iria
   * procurar defeito no pacote, que estava certo.
   *
   * ⚠ TRAVA DE LAÇO: se por algum motivo o recarregamento não trouxer a versão
   *   nova (service worker preso servindo o js antigo), sem isto a página
   *   recarregaria em círculo. Marca a versão já tentada na sessão e não
   *   insiste — melhor ficar velho e visível do que piscar para sempre. */
  var CHAVE_ALVO = "orcapro:recarga-alvo";
  var alvosTentados = {};   // rede de segurança quando sessionStorage não existe (aba anônima)

  /* Uma recarga por versão-alvo, e só uma. O `sessionStorage` é o freio que
     SOBREVIVE ao reload (é a mesma aba); o mapa em memória cobre o navegador
     que proíbe storage, onde o freio persistente não existe. */
  function pedirRecarga(alvo) {
    var v = String(alvo || "").trim();
    if (!v || alvosTentados[v]) return false;
    try { if (sessionStorage.getItem(CHAVE_ALVO) === v) { alvosTentados[v] = 1; return false; } } catch (e) {}
    alvosTentados[v] = 1;
    try { sessionStorage.setItem(CHAVE_ALVO, v); } catch (e) {}
    agendarRecarga(v);
    return true;
  }

  function conferirDescompasso(d) {
    var noDisco = String((d && d.instalada) || "").trim();
    var rodando = String((typeof CONFIG !== "undefined" && CONFIG.versao) || "").trim();
    if (!noDisco || !rodando || noDisco === rodando) return false;
    return pedirRecarga(noDisco);
  }

  /* ===================================================================
   * ATUALIZAR NO CELULAR E NO TABLETE — onde não existe servidor local.
   *
   * `/__update/check` e `/__update/apply` só existem onde roda o
   * server/static.js: o computador. No celular, no tablete e em qualquer
   * aparelho que abre o app pela LAN ou pelo endereço público, aquele fetch
   * dá 404, cai no `.catch` e o app NUNCA soube que saiu versão nova. A
   * única saída era o cliente achar o botão "Buscar atualização" — ou seja,
   * justamente depender de ele procurar.
   *
   * O que serve nos dois mundos é o próprio `sw.js`: ele fica ao lado do
   * index.html em toda hospedagem (servidor local, LAN, GitHub Pages, VPS) e
   * carrega a versão no nome do cache — `orcapro-app-vX.Y.Z`. O packer já
   * REPROVA o pacote se esse número divergir de js/config.js
   * (tools/check-versao.js), então ele é uma fonte confiável de "qual versão
   * este servidor está entregando agora".
   *
   * Comparar isso com a versão que a página está EXECUTANDO responde a
   * pergunta certa — "o que estou rodando é o que existe?" — sem precisar de
   * endpoint nenhum. E quando difere, `limparCachesERecarregar` apaga os
   * caches, desregistra o service worker e recarrega: no celular não há zip
   * para baixar, os arquivos novos vêm do servidor na própria recarga. É o
   * "já atualizar completo" sem download e sem clique.
   *
   * ⚠ NÃO SUBSTITUI o caminho do computador. Lá os arquivos precisam mesmo
   *   ser trocados no disco (`/__update/apply`), senão a recarga volta a
   *   servir o mesmo código velho. Os dois convivem: onde há disco, o disco
   *   anda primeiro; onde não há, a recarga basta. */
  function urlDoSw() {
    try { return new URL("sw.js", document.baseURI || location.href).href; }
    catch (e) { return "sw.js"; }
  }
  function versaoDoServidor() {
    /* no-store E cache-bust no endereço: o próprio service worker intercepta
       este fetch (mesma origem) e, offline, devolveria a cópia do cache — que
       é exatamente a versão velha que estamos tentando detectar. */
    return fetch(urlDoSw() + "?_v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) { var m = /orcapro-app-v([0-9][0-9.]*)/.exec(t || ""); return m ? m[1] : ""; })
      .catch(function () { return ""; });   // offline: fica quieto e tenta depois
  }
  function conferirServidor() {
    if (aplicando || recarregarPendente) return;
    var rodando = String((typeof CONFIG !== "undefined" && CONFIG.versao) || "").trim();
    if (!rodando) return;
    versaoDoServidor().then(function (noServidor) {
      if (!noServidor || noServidor === rodando) return;
      /* pede ao navegador para trocar o service worker ANTES de recarregar: o
         sw.js novo tem `skipWaiting` + `clients.claim` e o `activate` apaga os
         caches das versões antigas. Sem isso a recarga poderia ser servida
         pelo worker velho mais uma vez. */
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration()
            .then(function (reg) { if (reg && reg.update) reg.update(); })
            .catch(function () {});
        }
      } catch (e) {}
      pedirRecarga(noServidor);
    });
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
        else if (d && d.pediuUsuario) {
          /* O usuário CLICOU em "Atualizar agora": sumir em silêncio faz ele achar
             que atualizou. Quando ele não pediu (update silencioso), o silêncio é
             correto — o próximo check tenta de novo sozinho. */
          faixa('<span class="opr-ic">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + '</span><div class="opr-tx"><b>Não consegui atualizar agora.</b>' +
            '<small>Verifique a internet — o app tenta de novo sozinho. Você pode continuar trabalhando normalmente.</small></div>');
          setTimeout(fechar, 12000);
        } else { fechar(); } // silencioso: próximo check tenta de novo
      })
      .catch(function () { aplicando = false; fechar(); });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ⚠ NÃO EXISTE MAIS "PERGUNTAR SE ATUALIZA".
   *
   * Havia aqui uma tela cheia com "Agora não" / "Atualizar agora", usada
   * quando o manifesto marcava a versão como "maior", mais um localStorage
   * que lembrava quem tinha dispensado para não perguntar de novo.
   *
   * Saiu inteira, por decisão de produto de 28/08/2026: atualização sobe
   * sozinha em TODO aparelho, sem o cliente aprovar nem procurar nada. Quem
   * está orçando não tem como julgar se deve clicar em "Atualizar agora" — a
   * pergunta transferia para ele um risco que é nosso, e a resposta natural
   * ("agora não") deixava a máquina parada em versão com defeito já corrigido.
   * Medido na frota em 28/08: 13 de 14 instalações ativas fora da última.
   *
   * O que sobra é `agendarRecarga`, que já espera o momento seguro — sem modal
   * aberto, sem campo sendo digitado, sem apresentação ou reunião BIM em curso.
   * O cliente vê a faixa dizendo que atualizou; nunca uma pergunta. */

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
      ov.innerHTML = '<div class="opr-sp" style="width:30px;height:30px"></div><div>' + (typeof Icones !== 'undefined' ? Icones.get('ciclo', 15) : '') + ' Buscando a versão mais nova…</div>';
      document.body.appendChild(ov);
    }
    limparCachesERecarregar();
  }

  /* Uma rodada de verificação. Roda os DOIS caminhos, sempre, porque um
     aparelho só tem um deles:
       · disco  — /__update/apply troca os arquivos (só onde há servidor local);
       · página — sw.js diz qual versão o servidor entrega (vale em toda parte).
     Nenhum dos dois fala se estiver offline ou se já estamos em dia. */
  function umaRodada() {
    if (aplicando || recarregarPendente) return;
    fetch("/__update/check", { method: "GET" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (conferirDescompasso(d)) return;   // o disco andou embaixo desta página
        if (!d.temAtualizacao || !d.disponivel) return;
        aplicarSilencioso(d);                 // sempre sozinho: ninguém é perguntado
      })
      .catch(function () { /* sem endpoint (celular/tablete) ou offline */ });
    conferirServidor();
  }

  /* ⚠ 4 HORAS ERA TARDE DEMAIS, e no celular nem isso valia.
   * O intervalo antigo era de 4h e só existia o caminho do disco. Publicar às
   * 9h e o cliente seguir na versão velha até as 13h não é "atualização
   * automática" — e no aparelho sem servidor local não havia intervalo nenhum.
   * 15 minutos é um GET pequeno; para a frota inteira é ruído.
   *
   * ⚠ E O GATILHO QUE MAIS IMPORTA NO CELULAR NÃO É O RELÓGIO. O app fica em
   *   segundo plano e o navegador congela os timers: um PWA aberto na segunda
   *   e retomado na sexta não teria disparado nem um `setInterval`. Voltar
   *   para o app é o momento em que a pessoa está lá e a rede está viva —
   *   é aí que a verificação tem de acontecer. Com trava de 60s para o
   *   vai-e-volta de trocar de aba não virar enxurrada de fetch. */
  var INTERVALO = 15 * 60 * 1000;
  var ultimaConferencia = 0;
  function conferirComTrava() {
    var agora = Date.now();
    if (agora - ultimaConferencia < 60000) return;
    ultimaConferencia = agora;
    umaRodada();
  }

  var AutoUpdate = {
    forcar: forcarAtualizacao, // botão manual — continua existindo para quem quiser puxar na hora
    // Verifica e ATUALIZA sozinho. Silencioso se: não há servidor de update, offline, ou já é a última.
    verificar: function () {
      ultimaConferencia = Date.now();
      umaRodada();
      if (AutoUpdate._timer) return;          // já armado: não duplica relógio nem ouvintes
      AutoUpdate._timer = setInterval(umaRodada, INTERVALO);
      try {
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) conferirComTrava();
        });
        // iOS devolve o PWA por 'pageshow' vindo do cache de retrocesso, sem visibilitychange
        global.addEventListener("pageshow", function () { conferirComTrava(); });
        global.addEventListener("online", function () { conferirComTrava(); });
      } catch (e) {}
    }
  };

  global.AutoUpdate = AutoUpdate;
})(window);

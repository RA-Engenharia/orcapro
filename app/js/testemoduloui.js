/* =====================================================================
 * testemoduloui.js — a TELA do teste de 1 hora por módulo (fiação fina
 * sobre js/testemodulo.js) e a preferência "Mostrar só o que comprei".
 *
 *  - SELO discreto no canto ("Teste: 42 min"), do módulo da tela aberta;
 *    clique abre a oferta. Encerrado: "Teste encerrado · comprar".
 *  - AVISOS aos 10 min e a 1 min do fim (toast) e, no fim, a OFERTA.
 *  - FAIXA no alto da tela do módulo vencido: o trabalho continua visível,
 *    só leitura, com o botão de compra e o "não mostrar mais".
 *  - OFERTA (modal): o que o módulo faz, os minutos, o botão de compra (a
 *    loja do Modela pela chave, /modelagem; os planos pelo link do servidor
 *    ou o WhatsApp da RA) e o link "Não mostrar mais os módulos que não comprei".
 *    ⚠ origem=play (app da Google Play): nenhum botão nem link de compra.
 *  - IMPRESSÃO: faixa "VERSÃO DE TESTE" em toda folha impressa do módulo em
 *    teste; vencido, a folha sai só com o recado (não imprime o entregável).
 *  - CARTÃO na tela da licença: os módulos em teste + a preferência.
 *
 * ⚠ PREÇO NENHUM AQUI: o valor vem do servidor (/api/modela/oferta). Para os
 *   planos do OrçaPRO, o link de compra também vem do servidor
 *   (testeModulos.compra no vendas-config): mandar um cliente PRO comprar o
 *   Plus pelo /comprar daria uma CHAVE NOVA — e chave nova é banco novo na
 *   nuvem. Sem link configurado, a oferta manda para o WhatsApp da RA.
 * ===================================================================== */
(function (global) {
  "use strict";
  var MIN = 60000;
  function TM() { return global.TesteModulo || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function minutos(ms) { return Math.ceil(Math.max(0, ms) / MIN) + " min"; }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function play() {
    try { if (global.document.documentElement.getAttribute("data-origem") === "play") return true; } catch (e) {}
    try { return global.localStorage.getItem("orcapro:origem") === "play"; } catch (e2) { return false; }
  }

  /* =================================================================
   * A PREFERÊNCIA "Mostrar só o que comprei" — por USUÁRIO, dentro das
   * preferências da empresa (Store.lerPrefs/salvarPrefs, que a nuvem
   * sincroniza como as outras). Reversível: o mesmo interruptor desliga.
   * ================================================================= */
  var Pref = {
    _usuario: function () {
      var A = global.Auth, u = null;
      try { u = A && A.usuario ? A.usuario() : null; } catch (e) { u = null; }
      return String((u && (u.usuarioId || u.email)) || "dono").toLowerCase();
    },
    _eid: function () { try { return global.Auth && Auth.empresaId ? Auth.empresaId() : "default"; } catch (e) { return "default"; } },
    /* ⚠ FORMATO { v, em } POR USUÁRIO (revisão adversarial R10): o merge de prefs do js/nuvem.js é "o local vence
       campo a campo"; com o bloco inteiro decidido assim, a escolha feita num aparelho nunca chegava ao outro e o
       desligar (um `delete`) não tinha como viajar. Com a data, o js/nuvem.js escolhe a MAIS NOVA por usuário.
       `true` (o formato da primeira versão) continua valendo como ligado sem data. */
    ler: function () {
      var S = global.Store; if (!S || !S.lerPrefs) return false;
      try { var p = S.lerPrefs(this._eid()) || {}, t = p.testeModulos || {}, x = t.soComprados ? t.soComprados[this._usuario()] : null; return x === true || !!(x && x.v === true); } catch (e) { return false; }
    },
    gravar: function (ligar) {
      var S = global.Store; if (!S || !S.lerPrefs || !S.salvarPrefs) return false;
      var eid = this._eid(), u = this._usuario();
      try {
        var p = S.lerPrefs(eid) || {};
        p.testeModulos = p.testeModulos || {}; p.testeModulos.soComprados = p.testeModulos.soComprados || {};
        p.testeModulos.soComprados[u] = { v: !!ligar, em: Date.now() };
        S.salvarPrefs(eid, p);
      } catch (e) { return false; }
      var T = TM();
      try { if (T) { T._registrar("preferencia", "", { soComprados: !!ligar }); T.redesenhar(); } } catch (e2) {}
      return true;
    }
  };
  global.TesteModuloPref = Pref;

  var UIT = {
    Pref: Pref,

    /* o texto do selo (puro): "" = sem selo */
    rotulo: function (id, info) {
      if (!id || !info) return "";
      if (info.estado === "teste") return "Teste: " + minutos(info.restanteMs);
      if (info.estado === "vencido") return "Teste encerrado · comprar";
      if (info.estado === "pausado") return "Teste pausado · sem internet";
      return "";
    },
    /* o módulo que o selo mostra: o primeiro em uso na tela com teste/vencido/pausado */
    _doSelo: function () {
      var T = TM(); if (!T) return "";
      var s = T.status(); if (!s.regime) return "";
      var ativos = T.ativos();
      for (var i = 0; i < ativos.length; i++) {
        var m = s.mods[ativos[i]];
        if (m && (m.estado === "teste" || m.estado === "vencido" || m.estado === "pausado")) return ativos[i];
      }
      return "";
    },
    _css: function () {
      var d = global.document; if (!d || d.getElementById("teste-modulo-css")) return;
      var st = d.createElement("style"); st.id = "teste-modulo-css";
      st.textContent = "#teste-modulo-selo{position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:9500;padding:3px 10px;border-radius:99px;border:1px solid #d97706;background:rgba(255,251,235,.96);color:#92400e;font:600 11.5px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap}"
        + "#teste-modulo-selo[data-estado=vencido]{border-color:#b91c1c;background:#fef2f2;color:#991b1b}"
        + "#teste-modulo-selo[data-estado=pausado]{border-color:#64748b;background:#f8fafc;color:#334155}"
        + "#teste-modulo-selo:focus-visible{outline:2px solid #2563eb;outline-offset:2px}"
        + "body.bim-app #teste-modulo-selo{bottom:36px}"
        + ".teste-faixa{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:10px 14px;border:1px solid #fca5a5;background:#fef2f2;color:#7f1d1d;border-radius:10px;font-size:13.5px}"
        + ".teste-faixa .btn{margin-left:auto}"
        + "@media print{"
        + "html[data-teste-marca] body::before{content:'VERSÃO DE TESTE — OrçaPRO (teste de 1 hora do módulo)';position:fixed;top:0;left:0;right:0;z-index:2147483647;text-align:center;font:700 9pt Arial,sans-serif;color:#b91c1c;background:#fff;border-bottom:1px solid #b91c1c;padding:2px 0}"
        + "html[data-teste-marca] body::after{content:'VERSÃO DE TESTE';position:fixed;top:42%;left:0;right:0;z-index:2147483647;text-align:center;font:700 64pt Arial,sans-serif;color:rgba(185,28,28,.14);transform:rotate(-28deg);pointer-events:none}"
        + "html[data-teste-bloqueio] body>*{display:none!important}"
        + "html[data-teste-bloqueio] body::before{content:'Teste encerrado: este entregável sai depois da compra do módulo. O seu trabalho continua salvo no OrçaPRO.';display:block;padding:40px;font:600 14pt Arial,sans-serif;color:#7f1d1d}"
        + "#teste-modulo-selo{display:none!important}}";
      (d.head || d.documentElement).appendChild(st);
    },
    /* repinta o selo e as marcas de impressão (o relógio chama a cada tique) */
    pintar: function () {
      var d = global.document, T = TM(); if (!d || !d.body || !T) return null;
      this._css();
      var id = this._doSelo(), info = id ? T.info(id) : null, txt = this.rotulo(id, info);
      var b = d.getElementById("teste-modulo-selo");
      try {
        if (T.marcaAtiva()) d.documentElement.setAttribute("data-teste-marca", "1"); else d.documentElement.removeAttribute("data-teste-marca");
        if (T.guardaGravacao()) d.documentElement.setAttribute("data-teste-bloqueio", "1"); else d.documentElement.removeAttribute("data-teste-bloqueio");
      } catch (eM) {}
      if (!txt) { if (b) b.remove(); return null; }
      if (!b) {
        b = d.createElement("button"); b.type = "button"; b.id = "teste-modulo-selo";
        b.onclick = function () { UIT.oferta(b.getAttribute("data-teste-selo") || "", null, { forcar: true }); };
        d.body.appendChild(b);
      }
      b.textContent = txt;
      b.setAttribute("data-teste-selo", id);
      b.setAttribute("data-estado", info.estado);
      b.title = T.nome(id) + " — teste de " + (info.limiteMs / MIN) + " minutos de uso (conta só enquanto você usa). Clique para ver a oferta.";
      return b;
    },

    /* os eventos do relógio */
    aoEvento: function (ev) {
      var T = TM(); if (!T || !ev) return;
      var nome = T.nome(ev.modulo);
      if (ev.tipo === "inicio") toast("Começou o teste de 1 hora de " + nome + ". O relógio só anda enquanto você usa o módulo.", "info", 7000);
      else if (ev.tipo === "aviso") toast("Teste de " + nome + ": falta" + (ev.min === 1 ? " 1 minuto" : "m " + ev.min + " minutos") + ". O que você fizer continua salvo.", "aviso", 9000);
      else if (ev.tipo === "fim") {
        try { T.redesenhar(); } catch (e) {}
        this.oferta(ev.modulo, "O teste de 1 hora de " + nome + " terminou. O que você fez continua salvo e visível; para editar e exportar, compre o módulo.");
      }
    },

    /* a faixa do alto da tela do módulo bloqueado (App.render a põe antes do HTML da Gestão) */
    faixa: function (view) {
      var T = TM(); if (!T) return "";
      var id = T.moduloDaView(view), e = id ? T.estado(id) : "";
      if (e !== "vencido" && e !== "pausado") return "";
      var txt = e === "pausado" ? "O teste de <b>" + esc(T.nome(id)) + "</b> está pausado: o OrçaPRO não conseguiu confirmar o tempo de uso com o servidor. Conecte à internet e ele continua de onde parou."
        : "O teste de 1 hora de <b>" + esc(T.nome(id)) + "</b> terminou. O que você fez continua aqui, só para consulta: editar e exportar voltam com a compra.";
      return '<div class="teste-faixa" data-teste-faixa="' + esc(id) + '" role="status"><span>' + txt + "</span>"
        + (e === "vencido" ? '<button class="btn primary sm" data-teste-acao="oferta" data-mod="' + esc(id) + '">Ver a oferta</button>'
          + '<button class="btn ghost sm" data-teste-acao="so-comprados">Não mostrar mais os módulos que não comprei</button>' : "")
        + "</div>";
    },

    /* o conteúdo da oferta (puro): { titulo, html, url, zap } */
    conteudo: function (id, motivo, extra) {
      var T = TM(); extra = extra || {};
      var m = T ? T.modulo(id) : null, info = T ? T.info(id) : null;
      var nome = m ? m.nome : String(id || ""), h = [];
      var est = info ? info.estado : "";
      var abre = motivo || (est === "teste" ? "Você está testando <b>" + esc(nome) + "</b>: restam <b>" + minutos(info.restanteMs) + "</b> de uso (o relógio só anda enquanto você usa o módulo). Durante o teste tudo funciona; o que você exportar sai com a marca \"Versão de teste\"."
        : est === "pausado" ? "O teste de <b>" + esc(nome) + "</b> está pausado: o OrçaPRO não fala com o servidor há algumas horas. Conecte à internet e ele continua de onde parou."
        : "O teste de 1 hora de <b>" + esc(nome) + "</b> terminou. O que você fez continua salvo e visível; para editar e exportar, compre o módulo.");
      h.push("<p data-teste-oferta=\"" + esc(id) + "\">" + (motivo ? esc(motivo) : abre) + "</p>");
      if (m && m.oque) h.push("<p class=\"muted\" style=\"margin-top:8px\">" + esc(m.oque) + "</p>");
      if (arr(extra.planos).length) {
        h.push("<ul style=\"margin:8px 0 0 18px\">" + extra.planos.map(function (p) {
          return "<li><b>" + esc(p.nome) + "</b> — R$ " + esc(fmt(p.valor)) + " " + esc(p.periodo || "") + "</li>";
        }).join("") + "</ul>");
      }
      if (extra.semVenda) h.push("<p class=\"muted\" style=\"margin-top:8px\">A venda deste módulo abre em breve. Para usar agora, fale com a RA Engenharia.</p>");
      if (play()) h.push("<p class=\"muted\" style=\"margin-top:10px\">Este aplicativo não faz contratações. O que for liberado para a sua conta aparece aqui sozinho.</p>");
      h.push("<p style=\"margin-top:12px;font-size:12.5px\"><a href=\"#\" data-teste-acao=\"so-comprados\">Não mostrar mais os módulos que não comprei</a> <span class=\"muted\">(volta em Configurações › Licença)</span></p>");
      return { titulo: nome, html: h.join(""), url: play() ? "" : (extra.url || ""), zap: play() ? "" : (extra.zap || "") };
    },
    _srv: function () { return (global.CONFIG && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : ""; },
    _chave: function () { try { return global.Licenca && Licenca.chave ? Licenca.chave() : ""; } catch (e) { return ""; } },
    /* o link de compra: Modela/Blocok/Marmoraria pela loja do Modela COM a chave (não gera chave nova);
       os planos do OrçaPRO pelo link que o servidor mandar, senão WhatsApp */
    _compra: function (id, cb) {
      var T = TM(), m = T ? T.modulo(id) : null, srv = this._srv(), self = this, st = T ? T._estado() : {};
      var cfgSrv = (st && st.cfg) || {}, zap = String(cfgSrv.whatsapp || "").replace(/\D/g, "");
      var zapUrl = zap ? "https://wa.me/" + zap + "?text=" + encodeURIComponent("Olá! Testei o módulo " + (m ? m.nome : id) + " no OrçaPRO e quero liberar na minha licença.") : "";
      if (!m) { cb({ zap: zapUrl }); return; }
      if (m.tipo === "plano") {
        var link = cfgSrv.compra && cfgSrv.compra[id] ? String(cfgSrv.compra[id]) : "";
        /* só link da própria loja (o servidor manda o caminho; o domínio é o do licencaServer) */
        cb({ url: link && /^\/[A-Za-z0-9_\-\/?=&.#]*$/.test(link) && srv ? srv + link : "", zap: zapUrl });
        return;
      }
      if (!srv || typeof global.fetch === "undefined") { cb({ zap: zapUrl }); return; }
      var alvo = m.tipo === "disciplina" ? m.disciplina : m.extra, k = self._chave();
      try {
        global.fetch(srv + "/api/modela/oferta", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
          var p = (d && d.planos) || {}, re = new RegExp("^modela_" + alvo + "_");
          var lista = Object.keys(p).filter(function (x) { return re.test(x); }).map(function (x) { var o = p[x]; return { id: x, nome: o.nome, valor: o.valor, periodo: o.periodo }; });
          if (!lista.length) { cb({ semVenda: true, zap: zapUrl }); return; }
          cb({ planos: lista, url: srv + "/modelagem?plano=" + encodeURIComponent(lista[0].id) + (k ? "#lic=" + encodeURIComponent(k) : ""), zap: zapUrl });
        }, function () { cb({ zap: zapUrl }); });
      } catch (e) { cb({ zap: zapUrl }); }
    },
    /* opts.forcar: a pessoa PEDIU a oferta (selo, faixa, botão) — abre mesmo com outro quadro aberto */
    oferta: function (id, motivo, opts) {
      var self = this;
      if (!id) return false;
      /* ⚠ QUADRO ABERTO (o formulário que a pessoa estava preenchendo): a oferta NÃO o substitui — o UI.modal é um
         só, e trocar o formulário pela oferta apagaria o que ela digitou. Vai o recado, e a oferta fica no selo. */
      var aberto = false; try { aberto = !!(global.document && global.document.getElementById("modal-bg")); } catch (eA) {}
      if (aberto && !(opts && opts.forcar)) {
        var T0 = TM();
        toast((motivo || ("O teste de 1 hora de " + (T0 ? T0.nome(id) : id) + " terminou.")) + " Nada foi gravado. A oferta está no selo do canto da tela.", "erro", 10000);
        try { this.pintar(); } catch (eP) {}
        return false;
      }
      this._compra(id, function (extra) {
        var a = self.conteudo(id, motivo, extra);
        var bts = [{ texto: "Agora não", classe: "ghost", onClick: function () { try { UI.fecharModal(); } catch (e) {} } }];
        if (a.zap) bts.push({ texto: "Falar com a RA", classe: "ghost", onClick: function () { try { global.open(a.zap, "_blank", "noopener"); } catch (e) {} } });
        if (a.url) bts.push({ texto: "Comprar", classe: "primary", onClick: function () {
          try { global.open(a.url, "_blank", "noopener"); } catch (e) {}
          try { var T = TM(); if (T) T._registrar("oferta-comprar", id, null); } catch (e2) {}
          try { UI.fecharModal(); } catch (e3) {}
        } });
        try { if (global.UI && UI.modal) UI.modal(a.titulo, a.html, bts); } catch (e) {}
      });
      return true;
    },

    /* o cartão da tela da licença (UI.renderLicenca acrescenta) */
    cartaoLicenca: function () {
      var T = TM(); if (!T) return "";
      var s = T.status(), on = Pref.ler();
      if (!s.regime && !on) return "";
      var linhas = T.MODULOS.filter(function (m) { var x = s.mods[m.id]; return x && (x.estado === "teste" || x.estado === "vencido" || x.estado === "pausado"); })
        .map(function (m) {
          var x = s.mods[m.id];
          return "<li>" + esc(m.nome) + " — " + (x.estado === "teste" ? (x.usadoMs > 0 ? "em teste: restam " + minutos(x.restanteMs) : "teste de " + (x.limiteMs / MIN) + " min disponível") : x.estado === "pausado" ? "teste pausado (sem internet)" : "teste encerrado") + "</li>";
        }).join("");
      return '<div class="card" style="margin-top:8px" data-teste-cartao="1"><b>Módulos para testar</b>'
        + '<p class="muted" style="margin:4px 0 6px;font-size:13px">Cada módulo que não está na sua licença pode ser usado por 1 hora de uso ativo. Vencida a hora, o que você fez continua salvo e o módulo pede a compra.</p>'
        + (linhas ? '<ul style="margin:0 0 8px 18px;font-size:13px">' + linhas + "</ul>" : "")
        + '<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-teste-acao="pref"' + (on ? " checked" : "") + "> Mostrar só o que comprei (esconde os módulos que não estão na licença)</label></div>";
    },

    _ligado: false,
    ligar: function () {
      if (this._ligado || !global.document) return;
      this._ligado = true;
      var self = this;
      global.document.addEventListener("click", function (ev) {
        var el = ev.target && ev.target.closest ? ev.target.closest("[data-teste-acao]") : null;
        if (!el || el.tagName === "INPUT") return;
        var ac = el.getAttribute("data-teste-acao");
        if (ac === "oferta") { ev.preventDefault(); self.oferta(el.getAttribute("data-mod") || "", null, { forcar: true }); }
        else if (ac === "so-comprados") {
          ev.preventDefault();
          try { UI.fecharModal(); } catch (e) {}
          Pref.gravar(true);
          toast("Pronto: aparece só o que você comprou. Para mostrar de novo, Configurações › Licença › \"Mostrar só o que comprei\".", "ok", 9000);
        }
      }, true);
      global.document.addEventListener("change", function (ev) {
        var el = ev.target; if (!el || !el.getAttribute || el.getAttribute("data-teste-acao") !== "pref") return;
        Pref.gravar(!!el.checked);
        toast(el.checked ? "Só o que você comprou fica à vista." : "Os módulos para testar voltaram ao menu.", "ok");
      }, true);
      try { global.addEventListener("beforeprint", function () { self.pintar(); }); } catch (e) {}
      try { global.addEventListener("orcapro:teste-modulo", function () { self.pintar(); }); } catch (e) {}
    }
  };
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function fmt(v) { var n = Number(v) || 0; try { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return n.toFixed(2); } }

  global.TesteModuloUI = UIT;
  try { if (typeof window !== "undefined" && global.document) { if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", function () { UIT.ligar(); }); else UIT.ligar(); } } catch (eL) {}
  if (typeof module !== "undefined" && module.exports) module.exports = UIT;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

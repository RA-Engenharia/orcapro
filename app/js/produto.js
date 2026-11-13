/* =====================================================================
 * PRODUTO — qual cara o MESMO núcleo veste (OrçaPRO ou CPLPRO)
 *
 * Decisão de 13/11/2026: o CPLPRO é produto próprio na vitrine
 * (https://app.cplpro.com.br), mas roda do MESMO código: um motor de
 * orçamento, um store, uma nuvem, uma licença. Duplicar o app seria dois
 * produtos para corrigir a cada release.
 *
 * ⚠ A DIFERENÇA É DADO, NÃO `if` ESPALHADO. Tudo o que muda entre os dois
 *   (nome, slogan, ícone, manifest, perfil, módulo de abertura) está na
 *   TABELA abaixo; o resto do app só pergunta `Produto.atual()` / `Produto.cfg()`.
 *   Produto novo = linha nova na tabela.
 *
 * ⚠ DETECÇÃO: host terminando em `cplpro.com.br` (o próprio domínio ou
 *   subdomínio — "xcplpro.com.br" NÃO conta) OU `?produto=cplpro` na URL.
 *   O parâmetro fica em sessionStorage porque a navegação por hash e o
 *   recarregamento perdem a query; `?produto=orcapro` apaga a escolha.
 *   Armazenamento bloqueado (aba anônima) não derruba nada: vale a URL.
 *
 * ⚠ O PERFIL FORÇADO NÃO É GRAVADO. `Perfis.idAtual()` responde o perfil do
 *   produto enquanto o app está no modo CPLPRO, sem tocar no registro da
 *   conta: a mesma conta, aberta no domínio do OrçaPRO, continua exatamente
 *   como estava (os dados e a nuvem são os mesmos).
 *
 * ⚠ SEM A LIBERAÇÃO, MENSAGEM — NUNCA TELA QUEBRADA. No modo CPLPRO a conta só
 *   entra se a chave traz o módulo `cplpro` (Licenca.modulosExtras), se a
 *   conta JÁ era de órgão (perfil gravado `orgao_publico`, como já funcionava)
 *   ou na vitrine. Fora disso, `telaSemAcesso` explica e dá contato.
 * =================================================================== */
var Produto = (function () {
  "use strict";

  var CHAVE_SESSAO = "orcapro:produto";
  var CONTATO_WA = "https://wa.me/553492869383";

  /* A TABELA. `orcapro` = o que o app já era (nada muda para quem não é órgão). */
  var TABELA = {
    orcapro: {
      id: "orcapro", nome: "OrçaPRO",
      perfilForcado: null, moduloInicial: null
    },
    cplpro: {
      id: "cplpro",
      nome: "CPLPRO",
      slogan: "Do projeto ao edital — Lei 14.133",
      titulo: "CPLPRO — Do projeto ao edital",
      assinatura: "um produto RA Engenharia",
      corPrimaria: "#0b2447",
      corSecundaria: "#1d4f8c",
      icone: "img/cplpro.svg",
      icone192: "img/cplpro-192.png",
      icone512: "img/cplpro-512.png",
      manifest: "manifest-cplpro.webmanifest",
      perfilForcado: "orgao_publico",
      moduloInicial: "cplpro",
      loginTitulo: "Entrar no CPLPRO — acesso do órgão",
      loginChamada: "Do projeto ao edital.",
      loginDestaque: "Lei 14.133.",
      loginLinhas: [
        "O processo em 10 passos, da demanda à publicação — Lei 14.133",
        "Orçamento de referência com SINAPI, SICRO e bases estaduais",
        "Minuta, parecer jurídico e acompanhamento do contrato"
      ],
      semAcessoTitulo: "Seu acesso ao CPLPRO ainda não foi liberado",
      semAcessoTexto: "Esta conta ainda não tem a liberação do CPLPRO. A liberação vem com a chave do órgão: se você já a recebeu, use “Ativar chave”; se não, fale com a RA Engenharia.",
      contatoUrl: CONTATO_WA,
      contatoRotulo: "Falar com a RA Engenharia (WhatsApp)",
      avisoOrcapro: "O CPLPRO agora tem endereço próprio: app.cplpro.com.br",
      avisoUrl: "https://app.cplpro.com.br/"
    }
  };

  /* ---------- detecção (pura: recebe o ambiente, para o teste não depender de navegador) ---------- */
  function _hostDoCplpro(h) {
    h = String(h || "").toLowerCase().replace(/\.$/, "");
    return h === "cplpro.com.br" || /\.cplpro\.com\.br$/.test(h);
  }

  /* env: { hostname, search, sessao: { get(k), set(k,v), del(k) } } — `sessao` opcional */
  function detectar(env) {
    env = env || {};
    var q = String(env.search || "");
    var m = /[?&]produto=([a-z0-9_-]+)/i.exec(q);
    var pedido = m ? m[1].toLowerCase() : "";
    var s = env.sessao || null;
    function lerS() { try { return s ? s.get(CHAVE_SESSAO) : null; } catch (e) { return null; } }
    function gravS(v) { try { if (s) { if (v) s.set(CHAVE_SESSAO, v); else s.del(CHAVE_SESSAO); } } catch (e) {} }
    if (_hostDoCplpro(env.hostname)) return "cplpro";
    if (pedido === "orcapro") { gravS(null); return "orcapro"; }
    if (pedido === "cplpro") { gravS("cplpro"); return "cplpro"; }
    return lerS() === "cplpro" ? "cplpro" : "orcapro";
  }

  function _ambiente() {
    var env = { hostname: "", search: "", sessao: null };
    try { env.hostname = location.hostname; env.search = location.search; } catch (e) {}
    try {
      if (typeof sessionStorage !== "undefined") {
        env.sessao = {
          get: function (k) { return sessionStorage.getItem(k); },
          set: function (k, v) { sessionStorage.setItem(k, v); },
          del: function (k) { sessionStorage.removeItem(k); }
        };
      }
    } catch (e2) {}
    return env;
  }

  var _id = null;
  function atual() {
    if (_id === null) _id = detectar(_ambiente());
    return _id;
  }
  function cfg(id) { return TABELA[id || atual()] || TABELA.orcapro; }
  function ehCplpro() { return atual() === "cplpro"; }
  function perfilForcado() { return cfg().perfilForcado || null; }
  function moduloInicial() { return cfg().moduloInicial || ""; }
  /* só para teste: refaz a detecção com outro ambiente */
  function _redetectar(env) { _id = detectar(env); return _id; }

  /* ---------- acesso (puro) ----------
     d: { extras: Licenca.modulosExtras(), perfilGravado: perfil REAL da conta, demo: bool } */
  function temAcesso(d) {
    d = d || {};
    if (!ehCplpro()) return true;
    if (d.demo) return true;
    if (d.perfilGravado === "orgao_publico") return true;
    return (d.extras || []).indexOf("cplpro") > -1;
  }

  /* o aviso discreto do domínio antigo: conta de órgão aberta no OrçaPRO. null = sem aviso */
  function avisoDominioNovo(perfilGravado) {
    if (ehCplpro() || perfilGravado !== "orgao_publico") return null;
    var c = TABELA.cplpro;
    return { texto: c.avisoOrcapro, url: c.avisoUrl };
  }

  /* ---------- marca ---------- */
  function _esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* troca o CONFIG.marca (uma vez, no boot): topbar, "Gerado pelo …" e o rodapé do menu leem dele */
  function aplicarMarca(config) {
    var c = cfg();
    if (c.id === "orcapro" || !config || !config.marca) return false;
    config.marca.nome = c.nome;
    config.marca.nomeProduto = c.nome;
    config.marca.slogan = c.slogan;
    config.marca.corPrimaria = c.corPrimaria;
    config.marca.corSecundaria = c.corSecundaria;
    config.marca.logoTexto = '<span class="marca-top">' + _esc(c.nome) + '</span>';
    config.marca.assinatura = c.assinatura;
    return true;
  }

  /* título da aba, ícone, manifest e theme-color. `doc` = document (ou um falso, no teste) */
  function aplicarDocumento(doc) {
    var c = cfg();
    if (c.id === "orcapro" || !doc) return false;
    function elLink(rel, ach) {
      var el = null;
      try { el = doc.querySelector(ach); } catch (e) {}
      if (!el && doc.createElement && doc.head) { el = doc.createElement("link"); el.setAttribute("rel", rel); doc.head.appendChild(el); }
      return el;
    }
    try { doc.title = c.titulo; } catch (e1) {}
    var ic = elLink("icon", 'link[rel="icon"]');
    if (ic) { ic.setAttribute("href", c.icone); ic.setAttribute("type", "image/svg+xml"); }
    var mf = elLink("manifest", 'link[rel="manifest"]');
    if (mf) mf.setAttribute("href", c.manifest);
    var at = elLink("apple-touch-icon", 'link[rel="apple-touch-icon"]');
    if (at) at.setAttribute("href", c.icone192);
    try {
      var tc = doc.querySelector('meta[name="theme-color"]');
      if (tc) tc.setAttribute("content", c.corPrimaria);
      var ap = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (ap) ap.setAttribute("content", c.nome);
    } catch (e2) {}
    return true;
  }

  /* o selo (escudo) em HTML — o mesmo arquivo do ícone */
  function seloHtml(px) {
    var c = cfg();
    return '<img class="produto-selo" src="' + c.icone + '" width="' + px + '" height="' + px + '" alt="' + _esc(c.nome) + '" style="flex:none;border-radius:' + Math.round(px / 4.5) + 'px">';
  }

  /* o que renderLogin precisa trocar: null = OrçaPRO como sempre */
  function login() {
    var c = cfg();
    if (c.id === "orcapro") return null;
    return { nome: c.nome, titulo: c.loginTitulo, chamada: c.loginChamada, destaque: c.loginDestaque, linhas: c.loginLinhas.slice(), assinatura: c.assinatura };
  }

  /* a tela de "sem liberação": mensagem clara + as portas (ativar chave, contato, sair) */
  function telaSemAcesso() {
    var c = cfg();
    return '<div class="card" id="produto-sem-acesso" role="alert" style="max-width:560px;margin:48px auto;padding:28px 26px;text-align:center">' +
      seloHtml(64) +
      '<h2 style="margin:14px 0 8px">' + _esc(c.semAcessoTitulo) + '</h2>' +
      '<p style="margin:0 0 18px;line-height:1.5">' + _esc(c.semAcessoTexto) + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button class="btn primary" data-acao="licenca">Ativar chave</button>' +
        '<a class="btn" href="' + _esc(c.contatoUrl) + '" target="_blank" rel="noopener">' + _esc(c.contatoRotulo) + '</a>' +
        '<button class="btn" data-acao="logout">Sair</button>' +
      '</div>' +
      '<p class="muted" style="margin:16px 0 0;font-size:12px">' + _esc(c.nome) + ' · ' + _esc(c.assinatura) + '</p>' +
    '</div>';
  }

  /* ---------- fiação fina: aplica no boot ---------- */
  function iniciar() {
    if (atual() === "orcapro") return false;
    try { if (typeof CONFIG !== "undefined") aplicarMarca(CONFIG); } catch (e) {}
    try { if (typeof document !== "undefined") aplicarDocumento(document); } catch (e2) {}
    return true;
  }

  var API = {
    TABELA: TABELA, detectar: detectar, atual: atual, cfg: cfg, ehCplpro: ehCplpro,
    perfilForcado: perfilForcado, moduloInicial: moduloInicial, temAcesso: temAcesso,
    avisoDominioNovo: avisoDominioNovo, aplicarMarca: aplicarMarca, aplicarDocumento: aplicarDocumento,
    seloHtml: seloHtml, login: login, telaSemAcesso: telaSemAcesso, iniciar: iniciar, _redetectar: _redetectar
  };
  iniciar();
  return API;
})();

if (typeof module !== "undefined" && module.exports) module.exports = Produto;

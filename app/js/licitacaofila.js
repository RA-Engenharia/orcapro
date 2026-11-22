/* =====================================================================
 * licitacaofila.js — FILA DO CERTAMEPRO SEM POP-UP (motor puro)
 * CertamePRO -> OrçaPRO -> CertamePRO. Contrato: C:\Users\USER\Licitacoes\
 * docs\INTEGRACAO-ORCAPRO.md, seção "Fila no servidor". Fiação: js/licitacaofilaui.js.
 *
 * O QUE ESTE ARQUIVO FAZ (tudo testável em Node, com fetch e storage injetados):
 *   · destinoBase       — só https://app.certamepro.com.br, sem porta, sem usuário.
 *   · lerFragmento /
 *     consumirFragmento — o código de pareamento vem no #fragmento
 *                         (#parear_certamepro=XXXXX-XXXXX); lê e limpa a URL.
 *   · decidir           — o que fazer com cada código HTTP (401, 403, 404, 409,
 *                         429, 503...).
 *   · criar(opts)       — o cliente das rotas (previa, parear, fila, reservar,
 *                         pacote, naoOrcei, destinoDevolver). Todo POST leva
 *                         X-Licitacoes: 1; as rotas da fila levam Bearer.
 *   · estado local      — pareamento (token), interruptor, tentativas por
 *                         assinatura e id estável do aparelho, em localStorage.
 *   · executarCiclo     — UM certame por vez: fila -> reservar -> pacote ->
 *                         orçar -> devolver, com no máximo 3 tentativas por
 *                         assinatura (depois, nao-orcei).
 *
 * ⚠ O TOKEN do aparelho vive só no localStorage deste computador. Nunca entra
 *   em log, em mensagem de erro nem em objeto devolvido para a tela
 *   (estadoPublico não o traz). O cliente só o põe no cabeçalho Authorization.
 * ⚠ NUNCA PAREIA SOZINHO. `previa` não consome o código e não grava nada; só
 *   `parear` grava, e quem o chama é o clique de confirmação da tela. Um link
 *   malicioso que ligasse este OrçaPRO à conta de OUTRA pessoa vazaria base de
 *   preços e composições dele; por isso, havendo pareamento diferente, a tela
 *   pergunta antes de trocar (decidirPareamento).
 * ⚠ 404 NA FILA É SILÊNCIO: a chave do servidor está desligada. Sem aviso,
 *   só recua o intervalo.
 * ===================================================================== */
(function (global) {
  "use strict";

  var HOST_OFICIAL = "app.certamepro.com.br";
  var BASE_OFICIAL = "https://" + HOST_OFICIAL;
  var ROTA = "/api/integracao/orcapro";
  var MAX_TENTATIVAS = 3;
  var INTERVALO_PADRAO_S = 60;      /* o servidor limita a 2 consultas por minuto */
  var INTERVALO_MIN_S = 30;
  var INTERVALO_MAX_S = 1800;
  var TETO_RESERVA_MS = 2 * 60 * 60 * 1000;
  var PREFIXO = "orcapro:fila-certamepro:";

  function s(x) { return x === null || x === undefined ? "" : String(x); }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  /* nenhum texto que sai daqui (log, aviso, erro, motivo enviado ao servidor) pode levar o token */
  function mascarar(t, token) { var r = s(t); return token ? r.split(token).join("***") : r; }
  function texto(x, max) { var t = s(x).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); return t.length > max ? t.slice(0, max) : t; }

  /* ------------------------------------------------------------------ *
   * Endereço: o oficial por https e mais nada. O token sairia do aparelho.
   * ------------------------------------------------------------------ */
  function destinoBase(url) {
    var u = s(url).replace(/\/+$/, "");
    var erro = "A fila do CertamePRO só conversa com " + BASE_OFICIAL + " (https).";
    if (!u) return { ok: false, erro: erro };
    var p = null;
    if (typeof URL === "function") { try { p = new URL(u); } catch (e) { return { ok: false, erro: erro }; } }
    if (p) {
      if (p.protocol !== "https:" || p.username || p.password || p.port || String(p.hostname).toLowerCase() !== HOST_OFICIAL || (p.pathname && p.pathname !== "/") || p.search || p.hash) return { ok: false, erro: erro };
      return { ok: true, url: BASE_OFICIAL, host: HOST_OFICIAL };
    }
    if (u.toLowerCase() === BASE_OFICIAL) return { ok: true, url: BASE_OFICIAL, host: HOST_OFICIAL };
    return { ok: false, erro: erro };
  }

  /* ------------------------------------------------------------------ *
   * Fragmento da URL: #parear_certamepro=XXXXX-XXXXX
   * ------------------------------------------------------------------ */
  var RE_CHAVE = /(^|[#&])parear_certamepro=([^&]*)/;
  function lerFragmento(hash) {
    var m = RE_CHAVE.exec(s(hash));
    if (!m) return "";
    var c = /^([A-Za-z0-9]{5})-?([A-Za-z0-9]{5})$/.exec(decodeURIComponent_(m[2]));
    return c ? (c[1] + "-" + c[2]).toUpperCase() : "";
  }
  function decodeURIComponent_(t) { try { return decodeURIComponent(t); } catch (e) { return ""; } }
  /* o hash sem o parâmetro do código (o resto do fragmento fica) */
  function hashSemCodigo(hash) {
    var h = s(hash).replace(/^#/, "");
    var partes = h.split("&").filter(function (p) { return p && p.indexOf("parear_certamepro=") !== 0; });
    return partes.length ? "#" + partes.join("&") : "";
  }
  /* lê o código e LIMPA a URL (history.replaceState), tenha ele vindo certo ou não */
  function consumirFragmento(loc, hist) {
    var hash = loc && loc.hash ? s(loc.hash) : "";
    if (!RE_CHAVE.test(hash)) return { presente: false, codigo: "" };
    var codigo = lerFragmento(hash);
    try { if (hist && hist.replaceState) hist.replaceState(null, "", s(loc.pathname) + s(loc.search) + hashSemCodigo(hash)); } catch (e) {}
    return { presente: true, codigo: codigo };
  }

  /* ------------------------------------------------------------------ *
   * O que fazer com cada resposta. `ctx`: "fila", "reservar", "pacote",
   * "devolver", "nao-orcei", "previa", "parear".
   * ------------------------------------------------------------------ */
  function segundos(retryAfter, padrao) {
    var t = s(retryAfter);
    if (/^\d+$/.test(t)) { var n = parseInt(t, 10); return Math.max(1, Math.min(3600, n)); }
    return padrao;
  }
  function decidir(status, corpo, retryAfter, ctx) {
    status = num(status);
    ctx = s(ctx);
    var porCertame = ctx === "reservar" || ctx === "pacote" || ctx === "devolver" || ctx === "nao-orcei";
    var pareando = ctx === "previa" || ctx === "parear";
    if (status >= 200 && status < 300) return { acao: "ok" };
    if (status === 0) return { acao: "rede", semContar: true, aviso: "Sem conexão com o CertamePRO." };
    if (status === 401 && !pareando) return { acao: "reparear", limparToken: true, aviso: "A conexão com o CertamePRO foi revogada ou venceu. Gere um novo código no CertamePRO (Meu perfil > Conectar o OrçaPRO) para voltar a receber a fila." };
    if (status === 403) return { acao: "senha", semContar: true, aviso: "O CertamePRO pede a troca de senha antes de liberar a fila. Entre nele e troque a senha." };
    if (status === 404) {
      if (pareando) return { acao: "indisponivel", aviso: "A fila do OrçaPRO não está ligada neste servidor do CertamePRO ou o código não existe." };
      if (porCertame) return { acao: "pular", quieto: true };
      return { acao: "quieto", quieto: true };
    }
    if (status === 409) return { acao: ctx === "devolver" ? "recusado" : "pular" };
    if (status === 429) return { acao: "espera", semContar: true, espera_s: segundos(retryAfter, INTERVALO_PADRAO_S) };
    if (status === 503) return { acao: "depois", semContar: true };
    return { acao: "erro", aviso: "O CertamePRO respondeu com erro " + status + "." };
  }

  /* quanto esperar até a próxima consulta */
  function proximaEspera(p) {
    p = p || {};
    var base = Math.max(INTERVALO_MIN_S, Math.min(INTERVALO_MAX_S, num(p.base_s) || INTERVALO_PADRAO_S));
    var d = p.decisao || {}, n = Math.max(0, Math.min(6, num(p.falhasSeguidas)));
    var r;
    if (d.acao === "espera") r = Math.max(base, num(d.espera_s));
    else if (d.acao === "quieto" || d.acao === "rede" || d.acao === "erro") r = base * Math.pow(2, n + 1);
    else if (d.acao === "senha" || d.acao === "reparear") r = INTERVALO_MAX_S;
    else r = base;
    return Math.max(INTERVALO_MIN_S, Math.min(INTERVALO_MAX_S, Math.round(r)));
  }

  /* ------------------------------------------------------------------ *
   * Estado local (localStorage; nunca na nuvem).
   * ------------------------------------------------------------------ */
  function kPar(emp) { return PREFIXO + "par:" + s(emp || "default"); }
  function kCfg(emp) { return PREFIXO + "cfg:" + s(emp || "default"); }
  function kTent(emp) { return PREFIXO + "tent:" + s(emp || "default"); }
  var K_APARELHO = PREFIXO + "aparelho";

  function lerJson(st, k) { try { var o = JSON.parse(st.getItem(k) || "null"); return o && typeof o === "object" ? o : null; } catch (e) { return null; } }
  function gravarJson(st, k, o) { try { st.setItem(k, JSON.stringify(o)); return true; } catch (e) { return false; } }

  function lerPareamento(st, emp) {
    var o = st ? lerJson(st, kPar(emp)) : null;
    if (!o || typeof o.token !== "string" || o.token.length < 16) return null;
    return o;
  }
  function gravarPareamento(st, emp, o) { return st ? gravarJson(st, kPar(emp), o) : false; }
  /* token morto ou aparelho desligado: apaga o pareamento (o id do aparelho fica) */
  function desligar(st, emp) { try { if (st) st.removeItem(kPar(emp)); return true; } catch (e) { return false; } }
  /* o que a tela pode mostrar: NUNCA o token */
  function estadoPublico(st, emp) {
    var o = lerPareamento(st, emp);
    if (!o) return { pareado: false };
    return { pareado: true, conta: s(o.conta), papel: s(o.papel), empresas: arr(o.empresas), nome: s(o.nome), pareadoEm: s(o.pareadoEm), consultarACadaS: num(o.consultar_a_cada_s) || INTERVALO_PADRAO_S };
  }

  function lerConfig(st, emp) {
    var o = st ? lerJson(st, kCfg(emp)) : null;
    return { ligado: !!(o && o.ligado === true) };       /* desligado por padrão */
  }
  function gravarConfig(st, emp, cfg) { return st ? gravarJson(st, kCfg(emp), { ligado: !!(cfg && cfg.ligado === true) }) : false; }

  /* id ESTÁVEL por computador (o contrato exige nome de aparelho DIFERENTE em cada máquina: o mesmo nome revoga o anterior) */
  function aparelhoId(st) {
    var id = "";
    try { id = st ? s(st.getItem(K_APARELHO)) : ""; } catch (e) { id = ""; }
    if (/^[0-9a-f]{12}$/.test(id)) return id;
    var novo = "";
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        var b = new Uint8Array(6); global.crypto.getRandomValues(b);
        for (var i = 0; i < b.length; i++) novo += ("0" + b[i].toString(16)).slice(-2);
      }
    } catch (e1) { novo = ""; }
    while (novo.length < 12) novo += Math.floor(Math.random() * 16).toString(16);
    novo = novo.slice(0, 12);
    try { if (st) st.setItem(K_APARELHO, novo); } catch (e2) {}
    return novo;
  }
  function nomeAparelho(st) { return "OrçaPRO - " + aparelhoId(st); }

  /* tentativas por assinatura (persistidas: fechar o app no meio não zera a conta) */
  function lerTentativas(st, emp) { return (st && lerJson(st, kTent(emp))) || {}; }
  function tentativas(st, emp, assinatura) { return num(lerTentativas(st, emp)[s(assinatura)]) | 0; }
  function contarTentativa(st, emp, assinatura) {
    var m = lerTentativas(st, emp), k = s(assinatura);
    m[k] = (num(m[k]) | 0) + 1;
    var ks = Object.keys(m);
    if (ks.length > 100) ks.slice(0, ks.length - 100).forEach(function (x) { delete m[x]; });
    if (st) gravarJson(st, kTent(emp), m);
    return m[k];
  }
  function reembolsarTentativa(st, emp, assinatura) {
    var m = lerTentativas(st, emp), k = s(assinatura);
    if (num(m[k]) > 0) { m[k] = (m[k] | 0) - 1; if (m[k] <= 0) delete m[k]; if (st) gravarJson(st, kTent(emp), m); }
  }
  function limparTentativas(st, emp, assinatura) {
    var m = lerTentativas(st, emp), k = s(assinatura);
    if (k in m) { delete m[k]; if (st) gravarJson(st, kTent(emp), m); }
  }

  /* pareamento novo: pergunta antes de trocar? (conta, papel ou empresas diferentes do que já está pareado) */
  function decidirPareamento(estadoAtual, previa) {
    previa = previa || {};
    if (!estadoAtual || !estadoAtual.pareado) return { confirmar: true, perguntarTroca: false };
    var ids = function (l) { return arr(l).map(function (e) { return s(e && e.id); }).sort().join(","); };
    var igual = s(estadoAtual.conta) === s(previa.conta) && s(estadoAtual.papel) === s(previa.papel) && ids(estadoAtual.empresas) === ids(previa.empresas);
    return { confirmar: true, perguntarTroca: !igual, contaAtual: s(estadoAtual.conta) };
  }

  /* O PACOTE DA FILA É DE FORA: entra só como licitação do certame. Devolve { ok, pacote } com `gestao` removida (clientes e obras do
     arquivo não entram na conta) ou { ok:false, erro }. `existente` = orçamento já gravado com o mesmo id (ou null): só pode ser
     a licitação do MESMO certame — nunca sobrescreve orçamento da pessoa. */
  function prepararPacote(pacote, existente) {
    if (!pacote || typeof pacote !== "object") return { ok: false, erro: "pacote vazio" };
    if (!pacote.certamepro || typeof pacote.certamepro !== "object" || Array.isArray(pacote.certamepro)) return { ok: false, erro: "o pacote da fila não traz o bloco certamepro" };
    var orcs = arr(pacote.orcamentos);
    if (orcs.length !== 1 || !orcs[0] || !s(orcs[0].id)) return { ok: false, erro: "o pacote da fila deve trazer um orçamento só, com id" };
    var cert = s(pacote.certamepro.certame);
    if (!cert) return { ok: false, erro: "o pacote não trouxe o certame" };
    if (existente) {
      var lic = existente.config && existente.config.licitacao;
      if (!lic || lic.certamepro !== true || s(lic.certame) !== cert) return { ok: false, erro: "já existe um orçamento com este id que não é a licitação deste certame; não foi sobrescrito" };
    }
    var copia = {}; Object.keys(pacote).forEach(function (k) { if (k !== "gestao") copia[k] = pacote[k]; });
    return { ok: true, pacote: copia };
  }

  /* o que o _meta do _PRO.xlsx devolvido precisa levar (config.licitacao.automatico) */
  function marca(assinatura, certame) { return { assinatura: s(assinatura), certame: s(certame) }; }

  /* ------------------------------------------------------------------ *
   * O cliente das rotas. opts = { fetch, storage, emp, servico?, log? }
   * Toda função devolve uma Promise que NUNCA rejeita: resolve
   * { ok, status, corpo, decisao, ... }.
   * ------------------------------------------------------------------ */
  function criar(opts) {
    opts = opts || {};
    var d = destinoBase(opts.servico || BASE_OFICIAL);
    if (!d.ok) throw new Error(d.erro);
    var st = opts.storage || null, emp = opts.emp;
    var base = d.url + ROTA;

    function token() { var p = lerPareamento(st, emp); return p ? p.token : ""; }
    function semToken(t) { return mascarar(t, token()); }
    function log(ev) {
      if (typeof opts.log !== "function") return;
      var o = {}; Object.keys(ev).forEach(function (k) { o[k] = typeof ev[k] === "string" ? semToken(ev[k]) : ev[k]; });
      try { opts.log(o); } catch (e) {}
    }
    function lerCorpo(r) {
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }, function () { return null; });
    }
    function chamar(metodo, rota, corpo, comToken, ctx) {
      var cab = { Accept: "application/json" }, tk = "";
      if (comToken) {
        tk = token();
        if (!tk) return Promise.resolve({ ok: false, status: 0, corpo: null, decisao: { acao: "reparear", limparToken: false, aviso: "Este OrçaPRO não está conectado ao CertamePRO." } });
        cab.Authorization = "Bearer " + tk;
      }
      var init = { method: metodo, headers: cab };
      if (metodo === "POST") { cab["Content-Type"] = "application/json"; cab["X-Licitacoes"] = "1"; init.body = JSON.stringify(corpo || {}); }
      return Promise.resolve().then(function () { return opts.fetch(base + rota, init); }).then(function (r) {
        return lerCorpo(r).then(function (j) {
          var ra = r.headers && r.headers.get ? r.headers.get("Retry-After") : null;
          var dec = decidir(r.status, j, ra, ctx);
          log({ metodo: metodo, rota: rota, status: r.status, acao: dec.acao });
          return { ok: r.status >= 200 && r.status < 300, status: r.status, corpo: j, decisao: dec };
        });
      }, function (e) {
        var dec = decidir(0, null, null, ctx);
        log({ metodo: metodo, rota: rota, status: 0, acao: dec.acao, erro: semToken(texto(e && e.message, 120)) });
        return { ok: false, status: 0, corpo: null, decisao: dec };
      });
    }
    function idOk(id) { return /^[A-Za-z0-9_-]{1,64}$/.test(s(id)) ? encodeURIComponent(s(id)) : ""; }
    function semId() { return Promise.resolve({ ok: false, status: 0, corpo: null, decisao: { acao: "erro", aviso: "Identificador de certame inválido." } }); }
    function codigoLimpo(c) { return s(c).replace(/\s/g, "").toUpperCase(); }

    return {
      base: base,
      /* a prévia NÃO consome o código e NÃO grava nada */
      previa: function (codigo) {
        var c = codigoLimpo(codigo);
        if (!/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(c)) return Promise.resolve({ ok: false, status: 0, decisao: { acao: "erro", aviso: "Código de pareamento inválido." } });
        return chamar("POST", "/parear/previa", { codigo: c }, false, "previa").then(function (r) {
          if (!r.ok) return r;
          var j = r.corpo || {};
          r.previa = { conta: texto(j.conta, 120), papel: texto(j.papel, 40), todasAsDoUsuario: j.todas_as_do_usuario === true,
            empresas: arr(j.empresas).map(function (e) { return { id: e && e.id, nome: texto(e && e.nome, 160) }; }) };
          return r;
        });
      },
      /* só o clique de confirmação chama isto. `previa` (a que a pessoa viu) é guardada para comparar na próxima troca */
      parear: function (codigo, previa) {
        var c = codigoLimpo(codigo);
        return chamar("POST", "/parear", { codigo: c, aparelho: nomeAparelho(st) }, false, "parear").then(function (r) {
          if (!r.ok) return r;
          var j = r.corpo || {};
          if (typeof j.token !== "string" || j.token.length < 16) {
            r.ok = false; r.decisao = { acao: "erro", aviso: "O CertamePRO devolveu uma conexão sem token. Nada foi guardado." }; return r;
          }
          var pv = previa || {};
          var gravou = gravarPareamento(st, emp, {
            token: j.token, aparelhoId: j.aparelho_id, nome: texto(j.nome, 80), usuario: texto(j.usuario, 120),
            conta: texto(pv.conta, 120), papel: texto(pv.papel, 40), empresas: arr(pv.empresas),
            consultar_a_cada_s: num(j.consultar_a_cada_s) || INTERVALO_PADRAO_S, pareadoEm: new Date().toISOString()
          });
          r.corpo = null;            /* o token não sobe para a tela */
          if (!gravou) { r.ok = false; r.decisao = { acao: "erro", aviso: "Não consegui guardar a conexão neste computador (armazenamento cheio ou bloqueado)." }; }
          return r;
        });
      },
      fila: function () {
        return chamar("GET", "/fila", null, true, "fila").then(function (r) {
          if (!r.ok) return r;
          var j = r.corpo || {};
          if (j.ligado === false) { r.ok = false; r.decisao = { acao: "quieto", quieto: true }; return r; }
          r.itens = arr(j.fila);
          r.consultarACadaS = num(j.consultar_a_cada_s) || 0;
          return r;
        });
      },
      /* `assinatura` só vai quando é a da fila e não é a provisória do PNCP (pncp:<n>) */
      reservar: function (id, assinatura) {
        var i = idOk(id); if (!i) return semId();
        var corpo = {}; if (s(assinatura)) corpo.assinatura = s(assinatura);
        return chamar("POST", "/certames/" + i + "/reservar", corpo, true, "reservar").then(function (r) {
          if (!r.ok) return r;
          var j = r.corpo || {};
          r.reserva = { assinatura: s(j.assinatura), assinaturaAtual: s(j.assinatura_atual), expiraTs: num(j.expira_ts), retomada: j.retomada === true, desatualizada: j.desatualizada === true };
          return r;
        });
      },
      pacote: function (id) {
        var i = idOk(id); if (!i) return semId();
        return chamar("GET", "/certames/" + i + "/pacote", null, true, "pacote").then(function (r) { if (r.ok) r.pacote = r.corpo; return r; });
      },
      naoOrcei: function (id, motivo) {
        var i = idOk(id); if (!i) return semId();
        return chamar("POST", "/certames/" + i + "/nao-orcei", { motivo: texto(motivo, 300) || "nao_orcei" }, true, "nao-orcei");
      },
      /* o destino da devolução para App._licPost: URL da rota `devolver` (sem ?t=) + cabeçalhos. Leva o token: NÃO logar. */
      destinoDevolver: function (id) {
        var i = idOk(id), tk = token();
        if (!i || !tk) return null;
        return { ok: true, url: base + "/certames/" + i + "/devolver", host: HOST_OFICIAL, local: false, confiavel: true,
          cabecalhos: { Authorization: "Bearer " + tk, "X-Licitacoes": "1" } };
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * O CICLO: um certame por vez.
   *   ctx = { cliente, storage, emp, orcar(pacote, info) -> Promise<resultado>,
   *           pronto?() -> bool, pulados?: {}, agora?() -> ms, log? }
   *   resultado do orcar = { ok, status?, erro?, recusar? }
   *     · ok            -> devolvido; zera as tentativas;
   *     · recusar:motivo-> nao-orcei com esse motivo (ex.: "sem_preco_do_orgao"); não conta tentativa;
   *     · status 401    -> reparear; 429/503 -> espera, sem contar tentativa;
   *     · outro         -> falha: conta; na 3ª da mesma assinatura, nao-orcei.
   *   Resolve { acao, ... } com `espera_s` quando o intervalo muda.
   * ------------------------------------------------------------------ */
  function executarCiclo(ctx) {
    var st = ctx.storage, emp = ctx.emp, cli = ctx.cliente, pulados = ctx.pulados || {};
    var agora = ctx.agora || function () { return Date.now(); };
    var par = lerPareamento(st, emp);
    var base_s = par ? (num(par.consultar_a_cada_s) || INTERVALO_PADRAO_S) : INTERVALO_PADRAO_S;
    var tokenCiclo = par ? par.token : "";
    var limpo = function (x) { return mascarar(x, tokenCiclo); };
    var log = function (o) {
      if (typeof ctx.log !== "function") return;
      var c = {}; Object.keys(o).forEach(function (k) { c[k] = typeof o[k] === "string" ? limpo(o[k]) : o[k]; });
      try { ctx.log(c); } catch (e) {}
    };
    var sai = function (acao, extra) {
      var r = extra || {}; r.acao = acao;
      return r;
    };
    var trata = function (r, ate) {
      /* decisão que encerra o ciclo (não é "ok" nem "pular") */
      var dec = r.decisao || {};
      if (dec.acao === "reparear") { if (dec.limparToken !== false) desligar(st, emp); return sai("reparear", { aviso: dec.aviso }); }
      return sai(dec.acao, { aviso: dec.aviso, espera_s: dec.espera_s, semContar: dec.semContar === true, quieto: dec.quieto === true });
    };

    if (!lerConfig(st, emp).ligado) return Promise.resolve(sai("desligado"));
    if (!par) return Promise.resolve(sai("sem-pareamento"));
    if (typeof ctx.pronto === "function" && !ctx.pronto()) return Promise.resolve(sai("ocupado"));

    return cli.fila().then(function (rf) {
      if (!rf.ok) return trata(rf);
      var base = rf.consultarACadaS || base_s;
      var itens = rf.itens.filter(function (it) {
        if (!it || it.certame_id == null) return false;
        var chave = s(it.certame_id) + "|" + s(it.assinatura);
        if (pulados[chave]) return false;
        if (tentativas(st, emp, it.assinatura) >= MAX_TENTATIVAS) return false;
        return true;
      });
      if (!itens.length) return sai("vazia", { base_s: base });

      var proximo = function (i, reservas) {
        if (i >= itens.length || reservas >= 4) return Promise.resolve(sai("vazia", { base_s: base }));
        var it = itens[i], chave = s(it.certame_id) + "|" + s(it.assinatura);
        var assFila = (it.reservado_por_mim === true || /^pncp:/i.test(s(it.assinatura))) ? "" : s(it.assinatura);
        return cli.reservar(it.certame_id, assFila).then(function (rr) {
          if (!rr.ok) {
            if (rr.decisao.acao === "pular") { pulados[chave] = true; return proximo(i + 1, reservas + 1); }
            return trata(rr);
          }
          return atender(it, chave, rr.reserva);
        });
      };

      var atender = function (it, chave, reserva) {
        var id = it.certame_id;
        var assinatura = reserva.assinatura || s(it.assinatura);
        if (tentativas(st, emp, assinatura) >= MAX_TENTATIVAS) {
          pulados[chave] = true;
          return cli.naoOrcei(id, "falhou_" + MAX_TENTATIVAS + "_vezes").then(function () { return sai("desistiu", { certame_id: id, assinatura: assinatura, base_s: base }); });
        }
        contarTentativa(st, emp, assinatura);
        var reembolsa = function () { reembolsarTentativa(st, emp, assinatura); };
        return cli.pacote(id).then(function (rp) {
          if (!rp.ok) {
            reembolsa();
            if (rp.decisao.acao === "pular") { pulados[chave] = true; return sai("vazia", { base_s: base }); }
            return trata(rp);
          }
          var info = { certame_id: id, codigo: s(it.codigo), assinatura: assinatura, assinaturaReserva: reserva.assinatura,
            marca: null, destinoDevolver: cli.destinoDevolver(id) };
          var pc = rp.pacote && rp.pacote.certamepro ? rp.pacote.certamepro : {};
          /* o servidor compara com a assinatura/certame do PACOTE; sem eles ali, vale a da reserva */
          info.marca = marca(s(pc.assinatura) || reserva.assinatura || s(it.assinatura), s(pc.certame));
          return Promise.resolve().then(function () { return ctx.orcar(rp.pacote, info); }).then(function (o) { return o || { ok: false, erro: "sem resultado" }; }, function (e) {
            return { ok: false, erro: limpo(texto(e && e.message ? e.message : e, 200)) };
          }).then(function (o) {
            o.erro = limpo(o.erro);
            if (o.ok) { limparTentativas(st, emp, assinatura); return sai("devolvido", { certame_id: id, assinatura: assinatura, base_s: base }); }
            if (o.recusar) {
              reembolsa(); pulados[chave] = true;
              return cli.naoOrcei(id, o.recusar).then(function () { return sai("recusado", { certame_id: id, motivo: s(o.recusar), base_s: base }); });
            }
            var stt = num(o.status);
            /* 409 NA DEVOLUÇÃO: o CertamePRO já tem orçamento conferido/valor digitado e não gravou nada. Não é falha do OrçaPRO: sem nao-orcei
               (a reserva segue), sem gastar tentativa, e o certame fica pulado nesta sessão (não reimporta). */
            if (stt === 409) {
              reembolsa(); pulados[chave] = true;
              return sai("nao-aplicado", { certame_id: id, assinatura: assinatura, motivo: texto(o.erro, 200), base_s: base });
            }
            if (stt === 401) { reembolsa(); desligar(st, emp); return sai("reparear", { aviso: decidir(401, null, null, "devolver").aviso }); }
            if (stt === 429 || stt === 503) { reembolsa(); return sai(stt === 429 ? "espera" : "depois", { semContar: true, espera_s: stt === 429 ? decidir(429, null, o.retryAfter, "devolver").espera_s : undefined }); }
            var n = tentativas(st, emp, assinatura);
            log({ evento: "falha", certame_id: id, tentativa: n, erro: texto(o.erro, 160) });
            if (n >= MAX_TENTATIVAS) {
              pulados[chave] = true;
              return cli.naoOrcei(id, "falhou_" + MAX_TENTATIVAS + "_vezes: " + limpo(texto(o.erro, 150))).then(function () { return sai("desistiu", { certame_id: id, assinatura: assinatura, base_s: base }); });
            }
            return sai("falhou", { certame_id: id, tentativa: n, erro: texto(o.erro, 200), base_s: base });
          });
        });
      };

      return proximo(0, 0);
    });
  }

  var LicitacaoFila = {
    HOST_OFICIAL: HOST_OFICIAL, BASE_OFICIAL: BASE_OFICIAL, MAX_TENTATIVAS: MAX_TENTATIVAS, TETO_RESERVA_MS: TETO_RESERVA_MS,
    INTERVALO_PADRAO_S: INTERVALO_PADRAO_S, INTERVALO_MIN_S: INTERVALO_MIN_S, INTERVALO_MAX_S: INTERVALO_MAX_S,
    destinoBase: destinoBase, lerFragmento: lerFragmento, consumirFragmento: consumirFragmento,
    decidir: decidir, proximaEspera: proximaEspera,
    lerPareamento: lerPareamento, estadoPublico: estadoPublico, desligar: desligar,
    lerConfig: lerConfig, gravarConfig: gravarConfig,
    aparelhoId: aparelhoId, nomeAparelho: nomeAparelho,
    tentativas: tentativas, contarTentativa: contarTentativa, limparTentativas: limparTentativas,
    decidirPareamento: decidirPareamento, marca: marca, prepararPacote: prepararPacote, mascarar: mascarar,
    criar: criar, executarCiclo: executarCiclo
  };
  global.LicitacaoFila = LicitacaoFila;
  if (typeof module !== "undefined" && module.exports) module.exports = LicitacaoFila;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

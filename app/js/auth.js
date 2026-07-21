/* =====================================================================
 * auth.js — Autenticação multi-empresa + gate de plano (licença)
 * MVP: login local (cada e-mail = uma "empresa"/tenant isolado no Store).
 * SaaS: trocar LocalAuth por FirebaseAuth implementando o mesmo contrato.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SESSAO_KEY = "orcapro:sessao";

  var LocalAuth = {
    // Lista de usuários demo cadastrados localmente (em SaaS isto vai pro backend)
    _usuariosKey: "orcapro:usuarios",

    _lerUsuarios: function () {
      try { return JSON.parse(localStorage.getItem(this._usuariosKey) || "[]"); }
      catch (e) { return []; }
    },
    _gravarUsuarios: function (us) {
      localStorage.setItem(this._usuariosKey, JSON.stringify(us));
    },

    /* LOTE 3 — hash de senha v2: SHA-256 iterado 3000× com salt por usuário
     * (formato "v2$<salt>$<hex>"). O formato antigo era Base64 REVERSÍVEL —
     * segue aceito SÓ para migrar no primeiro login válido (transparente,
     * nenhuma conta invalidada). Sem WebCrypto de propósito: o app roda em
     * http/file:// onde crypto.subtle não existe. */
    _salt: function () {
      var s = "";
      try {
        var a = new Uint8Array(8);
        (global.crypto || {}).getRandomValues(a);
        for (var i = 0; i < 8; i++) s += ("0" + a[i].toString(16)).slice(-2);
      } catch (e) {}
      while (s.length < 16) s += Math.floor(Math.random() * 16).toString(16);
      return s.slice(0, 16);
    },
    _hashV2: function (senha, salt) {
      var h = String(senha) + "|" + salt;
      for (var i = 0; i < 3000; i++) h = Util.sha256hex(h + "|" + salt + "|" + i);
      return "v2$" + salt + "$" + h;
    },
    _conferir: function (senha, armazenado) {
      var s = String(armazenado || "");
      if (s.indexOf("v2$") === 0) {
        var partes = s.split("$");
        return { ok: this._hashV2(senha, partes[1] || "") === s, legado: false };
      }
      // formato legado (Base64): confere para permitir a migração no login
      return { ok: btoa(unescape(encodeURIComponent(senha))) === s, legado: true };
    },

    registrar: function (empresa, email, senha, plano) {
      email = String(email || "").trim().toLowerCase();
      if (!Util.naoVazio(email) || !Util.naoVazio(senha)) {
        return { ok: false, erro: "E-mail e senha são obrigatórios." };
      }
      var us = this._lerUsuarios();
      if (us.some(function (u) { return u.email === email; })) {
        return { ok: false, erro: "Já existe conta com este e-mail." };
      }
      var u = {
        empresaId: Util.uid("emp"),
        empresa: empresa || "Minha Empresa",
        email: email,
        senhaHash: this._hashV2(senha, this._salt()), // v2 desde o nascimento
        plano: plano || "PRO", // demo nasce PRO para mostrar tudo
        criadoEm: Util.agoraISO()
      };
      us.push(u);
      this._gravarUsuarios(us);
      return { ok: true, usuario: u };
    },

    login: function (email, senha) {
      email = String(email || "").trim().toLowerCase();
      var us = this._lerUsuarios();
      var u = us.filter(function (x) { return x.email === email; })[0];
      if (!u) return { ok: false, erro: "E-mail ou senha inválidos." };
      var c = this._conferir(senha, u.senhaHash);
      if (!c.ok) return { ok: false, erro: "E-mail ou senha inválidos." };
      if (c.legado) { // migração transparente: Base64 morre aqui, conta preservada
        u.senhaHash = this._hashV2(senha, this._salt());
        this._gravarUsuarios(us);
      }
      return { ok: true, usuario: u };
    },

    existe: function (email) {
      email = String(email || "").trim().toLowerCase();
      return this._lerUsuarios().some(function (u) { return u.email === email; });
    },
    listar: function () {
      return this._lerUsuarios().map(function (u) { return { empresa: u.empresa, email: u.email, plano: u.plano }; });
    },
    // Redefinição local (é o próprio navegador/dados do usuário) — não recupera senha, define uma nova.
    redefinirSenha: function (email, nova) {
      email = String(email || "").trim().toLowerCase();
      if (!Util.naoVazio(nova)) return { ok: false, erro: "Informe a nova senha." };
      var us = this._lerUsuarios();
      var u = us.filter(function (x) { return x.email === email; })[0];
      if (!u) return { ok: false, erro: "Não há conta com esse e-mail neste navegador." };
      u.senhaHash = this._hashV2(nova, this._salt()); // sempre v2
      this._gravarUsuarios(us);
      return { ok: true, usuario: u };
    }
  };

  var Auth = {
    backend: LocalAuth,
    _usuario: null,

    init: function () {
      try {
        var s = JSON.parse(localStorage.getItem(SESSAO_KEY) || "null");
        if (s && s.email) this._usuario = s;
      } catch (e) {}
      var u = this._usuario;
      // v1.1.79 (1× por empresa): módulo Cotações é novo — quem já operava Requisições ganha acesso;
      // depois da migração, o que o admin marcar/desmarcar no usuário vale normalmente.
      if (u && u.empresaId && typeof Store !== "undefined" && Store.listar) {
        try {
          var flagCot = "orcapro:mig:cotacoes79:" + u.empresaId;
          if (!localStorage.getItem(flagCot)) {
            (Store.listar(u.empresaId, "equipe") || []).forEach(function (m) {
              if (m && m.modulos && m.modulos.indexOf("requisicoes") > -1 && m.modulos.indexOf("cotacoes") === -1) { m.modulos.push("cotacoes"); Store.salvar(u.empresaId, "equipe", m); }
            });
            localStorage.setItem(flagCot, "1");
          }
        } catch (eMig) {}
      }
      // sub-usuário: re-sincroniza permissões (o admin pode ter alterado/desativado desde o último login)
      if (u && u.papel === "usuario" && u.usuarioId) {
        var eq = this._equipe(u.empresaId), atual = null;
        for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { atual = eq[i]; break; } }
        if (!atual || atual.ativo === false) { this.logout(); return null; } // removido/desativado → desloga
        u.modulos = atual.modulos || []; u.departamento = atual.departamento || ""; u.nome = atual.nome || u.nome; u.aprovador = atual.aprovador === true; u.trocarSenha = atual.trocarSenha === true;
        localStorage.setItem(SESSAO_KEY, JSON.stringify(u));
      }
      return this._usuario;
    },

    usuario: function () { return this._usuario; },
    empresaId: function () { return this._usuario ? this._usuario.empresaId : "default"; },
    plano: function () { return this._usuario ? this._usuario.plano : "FREE"; },

    podeUsar: function (featureKey) { return CONFIG.feature(featureKey, this.plano()); },
    limite: function (limiteKey) { return CONFIG.limite(limiteKey, this.plano()); },

    registrar: function (empresa, email, senha) {
      var r = this.backend.registrar(empresa, email, senha);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    login: function (email, senha) {
      var r = this.backend.login(email, senha);        // 1) tenta o DONO da empresa (admin)
      if (r.ok) { r.usuario._papel = "admin"; this._iniciarSessao(r.usuario); return r; }
      var sub = this._loginEquipe(email, senha);        // 2) tenta um SUB-USUÁRIO (login) de qualquer empresa local
      if (sub.ok) { this._iniciarSessao(sub.usuario); return sub; }
      var nuv = this.loginNuvem(email, senha, this.empresaId()); // 3) modo nuvem: conta mestre + equipe sincronizadas (multi-aparelho)
      if (nuv.ok) { this._iniciarSessao(nuv.usuario); return nuv; }
      return r;
    },

    existeEmail: function (email) { return this.backend.existe(email); },
    listarContas: function () { return this.backend.listar(); },

    // ---------- Equipe: sub-usuários por empresa (RBAC de módulos) ----------
    _hashSenha: function (senha) { return btoa(unescape(encodeURIComponent(String(senha || "")))); },
    _equipe: function (empresaId) {
      if (typeof Store === "undefined" || !Store.listar) return [];
      try { return Store.listar(empresaId, "equipe") || []; } catch (e) { return []; }
    },
    _loginEquipe: function (login, senha) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return { ok: false, erro: "Usuário ou senha inválidos." };
      var hash = this._hashSenha(senha), contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var dono = contas[i], equipe = this._equipe(dono.empresaId);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login && u.senhaHash === hash) {
            return { ok: true, usuario: { empresaId: dono.empresaId, empresa: dono.empresa, email: u.login, nome: u.nome || u.login, plano: dono.plano || "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _aprovador: u.aprovador === true, _trocarSenha: u.trocarSenha === true } };
          }
        }
      }
      return { ok: false, erro: "Usuário ou senha inválidos." };
    },
    existeLoginEquipe: function (login) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return false;
      var contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var equipe = this._equipe(contas[i].empresaId);
        for (var j = 0; j < equipe.length; j++) { if (String(equipe[j].login || "").trim().toLowerCase() === login) return true; }
      }
      return false;
    },
    // Login de sub-usuário deve ser ÚNICO GLOBALMENTE (senão o login cairia na empresa errada em navegador multi-conta).
    // Retorna true se o login já é usado por OUTRO usuário (ignora o próprio registro em edição).
    loginEquipeEmUso: function (login, exceptEmpresaId, exceptId) {
      login = String(login || "").trim().toLowerCase();
      if (!login) return false;
      var contas = this.backend._lerUsuarios();
      for (var i = 0; i < contas.length; i++) {
        var empId = contas[i].empresaId, equipe = this._equipe(empId);
        for (var j = 0; j < equipe.length; j++) {
          var u = equipe[j];
          if (String(u.login || "").trim().toLowerCase() === login && !(empId === exceptEmpresaId && u.id === exceptId)) return true;
        }
      }
      return false;
    },
    // Papel/permissões da sessão atual
    ehAdmin: function () { var u = this._usuario; return !u || u.papel !== "usuario"; },
    papel: function () { return (this._usuario && this._usuario.papel) || "admin"; },
    nome: function () { var u = this._usuario; return u ? (u.nome || u.empresa || u.email || "") : ""; },
    podeModulo: function (id) {
      if (this.ehAdmin()) return true;                 // dono/demo vê tudo
      if (id === "dashboard" || id === "ajuda") return true; // painel e ajuda sempre acessíveis
      if (id === "usuarios") return false;             // gestão de usuários é exclusiva do admin
      var mods = (this._usuario && this._usuario.modulos) || [];
      return mods.indexOf(id) > -1;
    },
    // G3: quem pode APROVAR/rejeitar medições, compras e requisições.
    // Dono/demo sempre pode; sub-usuário só com a flag "aprovador" marcada pelo admin.
    podeAprovar: function () {
      if (this.ehAdmin()) return true;
      return !!(this._usuario && this._usuario.aprovador);
    },
    // 1º acesso do sub-usuário: precisa definir a própria senha antes de usar o sistema.
    precisaTrocarSenha: function () { return !!(this._usuario && this._usuario.papel === "usuario" && this._usuario.trocarSenha); },
    // Sub-usuário troca a própria senha (1º acesso). Atualiza o registro na equipe + a sessão.
    trocarMinhaSenha: function (nova) {
      var u = this._usuario;
      if (!u || u.papel !== "usuario" || !u.usuarioId) return { ok: false, erro: "Apenas sub-usuário troca a própria senha aqui." };
      if (!Util.naoVazio(nova) || String(nova).length < 4) return { ok: false, erro: "A nova senha precisa de ao menos 4 caracteres." };
      var eq = this._equipe(u.empresaId), rec = null;
      for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { rec = eq[i]; break; } }
      if (!rec) return { ok: false, erro: "Usuário não encontrado." };
      rec.senhaHash = this._hashSenha(nova); rec.trocarSenha = false;
      try { Store.salvar(u.empresaId, "equipe", rec); } catch (e) { return { ok: false, erro: "Falha ao salvar a nova senha." }; }
      u.trocarSenha = false; localStorage.setItem(SESSAO_KEY, JSON.stringify(u));
      return { ok: true };
    },

    // ---------- Modo nuvem multi-aparelho: conta mestre (admin) + login por licença ----------
    _adapter: function () { return (typeof Store !== "undefined" && Store.adapter) ? Store.adapter : null; },
    // Lê a conta de administrador sincronizada (o "dono" da licença, compartilhado na nuvem).
    contaMestre: function (empresaId) {
      var a = this._adapter(); if (!a) return null;
      try { var c = a.ler(empresaId || this.empresaId(), "conta", {}); return (c && c.email) ? c : null; } catch (e) { return null; }
    },
    // Cria/atualiza a conta de ADMINISTRADOR (sincroniza pela nuvem-tenant da licença) —
    // é o que permite o admin e a equipe logarem nos aparelhos deles.
    criarContaMestre: function (empresa, email, senha) {
      email = String(email || "").trim().toLowerCase();
      if (!email || !Util.naoVazio(senha) || String(senha).length < 4) return { ok: false, erro: "Informe e-mail e uma senha (mín. 4)." };
      var a = this._adapter(); if (!a) return { ok: false, erro: "Armazenamento indisponível." };
      var eid = this.empresaId();
      var conta = { id: "conta", empresa: empresa || (this._usuario && this._usuario.empresa) || "Minha Empresa", email: email, senhaHash: this._hashSenha(senha), criadoEm: Util.agoraISO(), atualizadoEm: Util.agoraISO() };
      try { a.gravar(eid, "conta", conta); } catch (e) { return { ok: false, erro: "Falha ao salvar." }; }
      if (this._usuario) { this._usuario.email = email; this._usuario.empresa = conta.empresa; localStorage.setItem(SESSAO_KEY, JSON.stringify(this._usuario)); }
      return { ok: true, conta: conta };
    },
    // Login no modo nuvem: valida contra a CONTA mestre (admin) + a EQUIPE sincronizadas
    // sob empresaId — funciona em QUALQUER aparelho, sem dono registrado localmente.
    loginNuvem: function (idOuEmail, senha, empresaId) {
      empresaId = empresaId || this.empresaId();
      var login = String(idOuEmail || "").trim().toLowerCase(), hash = this._hashSenha(senha);
      var conta = this.contaMestre(empresaId);
      if (conta && conta.email === login && conta.senhaHash === hash) {
        return { ok: true, usuario: { empresaId: empresaId, empresa: conta.empresa, email: conta.email, nome: conta.empresa, plano: "PRO", _papel: "admin" } };
      }
      var eq = this._equipe(empresaId);
      for (var i = 0; i < eq.length; i++) {
        var u = eq[i];
        if (u.ativo !== false && String(u.login || "").trim().toLowerCase() === login && u.senhaHash === hash) {
          return { ok: true, usuario: { empresaId: empresaId, empresa: (conta && conta.empresa) || "Minha Empresa", email: u.login, nome: u.nome || u.login, plano: "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [], _aprovador: u.aprovador === true, _trocarSenha: u.trocarSenha === true } };
        }
      }
      return { ok: false, erro: "Usuário ou senha inválidos." };
    },
    // Este aparelho é secundário/anônimo mas o tenant já tem admin? → precisa logar (não auto-entra).
    precisaLoginNuvem: function () {
      var u = this._usuario, conta = this.contaMestre();
      return !!(conta && u && u.papel === "admin" && !u.email && !u.usuarioId);
    },
    redefinirSenha: function (email, nova) {
      var r = this.backend.redefinirSenha(email, nova);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    // Auto-entrada (uso solo/local): abre o app direto, sem a barreira de login.
    // Regras: já há sessão -> nada; algum dono com sub-usuários (RBAC) -> mantém o login;
    // 1 dono solo já cadastrado -> entra nele; primeiro uso -> sessão local direta (namespace estável "local").
    // O login continua acessível via "Sair" p/ quem usa RBAC/multiempresa ou quer conta com e-mail.
    autoEntrar: function () {
      if (this._usuario) return this._usuario;                 // init já restaurou a sessão
      var contas = [];
      try { contas = this.backend._lerUsuarios() || []; } catch (e) {}
      for (var i = 0; i < contas.length; i++) {                // RBAC configurado? respeita o login por perfil
        var eq = this._equipe(contas[i].empresaId);
        if (eq && eq.length) return null;
      }
      if (contas.length) {                                     // dono solo já cadastrado -> entra nele (sem senha)
        var dono = contas[0]; dono._papel = "admin";
        this._iniciarSessao(dono);
        return this._usuario;
      }
      // primeiro uso: sessão local direta (sem cadastro). empresaId estável p/ os dados persistirem entre boots.
      this._iniciarSessao({ empresaId: "local", empresa: "Minha Empresa", email: "", plano: "PRO", _papel: "admin" });
      return this._usuario;
    },

    _iniciarSessao: function (u) {
      this._usuario = {
        empresaId: u.empresaId, empresa: u.empresa, email: u.email, plano: u.plano,
        papel: u._papel || "admin",
        nome: u.nome || u.empresa || u.email,
        usuarioId: u._usuarioId || null,
        departamento: u._departamento || "",
        modulos: u._modulos || null,  // null = admin (todos os módulos)
        aprovador: u._aprovador === true,
        trocarSenha: u._trocarSenha === true   // 1º acesso do sub-usuário: força definir a própria senha
      };
      localStorage.setItem(SESSAO_KEY, JSON.stringify(this._usuario));
    },

    logout: function () {
      this._usuario = null;
      localStorage.removeItem(SESSAO_KEY);
    }
  };

  global.Auth = Auth;
})(window);

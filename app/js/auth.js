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
        // Demo: hash trivial. Em SaaS use Firebase Auth (nunca senha em texto).
        senhaHash: btoa(unescape(encodeURIComponent(senha))),
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
      var hash = btoa(unescape(encodeURIComponent(senha)));
      var u = us.filter(function (x) { return x.email === email && x.senhaHash === hash; })[0];
      if (!u) return { ok: false, erro: "E-mail ou senha inválidos." };
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
      u.senhaHash = btoa(unescape(encodeURIComponent(nova)));
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
      // sub-usuário: re-sincroniza permissões (o admin pode ter alterado/desativado desde o último login)
      var u = this._usuario;
      if (u && u.papel === "usuario" && u.usuarioId) {
        var eq = this._equipe(u.empresaId), atual = null;
        for (var i = 0; i < eq.length; i++) { if (eq[i].id === u.usuarioId) { atual = eq[i]; break; } }
        if (!atual || atual.ativo === false) { this.logout(); return null; } // removido/desativado → desloga
        u.modulos = atual.modulos || []; u.departamento = atual.departamento || ""; u.nome = atual.nome || u.nome;
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
            return { ok: true, usuario: { empresaId: dono.empresaId, empresa: dono.empresa, email: u.login, nome: u.nome || u.login, plano: dono.plano || "PRO", _papel: "usuario", _usuarioId: u.id, _departamento: u.departamento || "", _modulos: u.modulos || [] } };
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
      if (id === "dashboard") return true;             // painel sempre acessível
      if (id === "usuarios") return false;             // gestão de usuários é exclusiva do admin
      var mods = (this._usuario && this._usuario.modulos) || [];
      return mods.indexOf(id) > -1;
    },
    redefinirSenha: function (email, nova) {
      var r = this.backend.redefinirSenha(email, nova);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    _iniciarSessao: function (u) {
      this._usuario = {
        empresaId: u.empresaId, empresa: u.empresa, email: u.email, plano: u.plano,
        papel: u._papel || "admin",
        nome: u.nome || u.empresa || u.email,
        usuarioId: u._usuarioId || null,
        departamento: u._departamento || "",
        modulos: u._modulos || null   // null = admin (todos os módulos)
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

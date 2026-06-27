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
      var r = this.backend.login(email, senha);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    existeEmail: function (email) { return this.backend.existe(email); },
    listarContas: function () { return this.backend.listar(); },
    redefinirSenha: function (email, nova) {
      var r = this.backend.redefinirSenha(email, nova);
      if (r.ok) this._iniciarSessao(r.usuario);
      return r;
    },

    _iniciarSessao: function (u) {
      this._usuario = {
        empresaId: u.empresaId, empresa: u.empresa, email: u.email, plano: u.plano
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

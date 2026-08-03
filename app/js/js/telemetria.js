/* =====================================================================
 * telemetria.js — Cadastro do TESTE GRÁTIS + uso do app (trial e licenciado)
 * TRIAL: nome+telefone (com consentimento LGPD) antes de liberar.
 * Enquanto o app roda, manda pings leves (só metadados de USO — nada do
 * conteúdo dos orçamentos): boot + heartbeat a cada 5 min + contador de
 * módulos usados. O painel de vendas agrega: quem testa/usa, online agora,
 * horas de uso, empresa que mais usa e módulos mais usados (p/ priorizar).
 * Fire-and-forget: sem internet, o app segue 100% (offline-first).
 * ===================================================================== */
(function (global) {
  "use strict";
  var KEYREG = "orcapro:trialreg", KEYMODS = "orcapro:telemetria:mods";

  var Telemetria = {
    _timer: null, _sessao: null,

    reg: function () { try { return JSON.parse(localStorage.getItem(KEYREG) || "null"); } catch (e) { return null; } },
    salvarReg: function (r) { try { localStorage.setItem(KEYREG, JSON.stringify(r)); } catch (e) {} },

    /* trial ativo */
    ehTrial: function () {
      try { var s = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; return !!(s && s.trial && s.ativo); }
      catch (e) { return false; }
    },
    /* licença ativada (não-trial) */
    ehLicenciado: function () {
      try { var s = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; return !!(s && s.ativo && !s.trial); }
      catch (e) { return false; }
    },
    _ativo: function () { return this.ehTrial() ? !!this.reg() : this.ehLicenciado(); },

    _mods: function () { try { return JSON.parse(localStorage.getItem(KEYMODS) || "{}"); } catch (e) { return {}; } },
    contaModulo: function (v) {
      if (!v) return;
      try { var m = this._mods(); m[v] = (m[v] || 0) + 1; localStorage.setItem(KEYMODS, JSON.stringify(m)); } catch (e) {}
    },

    /* identidade do cliente licenciado (empresa/usuário logado/papel/licença) */
    _licInfo: function () {
      var A = (typeof Auth !== "undefined") ? Auth : null;
      var u = (A && A.usuario) ? (A.usuario() || {}) : {};
      var email = "";
      try { if (typeof Licenca !== "undefined" && Licenca._ler) email = (Licenca._ler() || {}).email || ""; } catch (e) {}
      var dev = "";
      try { if (typeof Licenca !== "undefined" && Licenca.deviceId) dev = Licenca.deviceId(); } catch (e2) {}
      return {
        empresa: u.empresa || "Minha Empresa",
        usuario: (A && A.nome) ? A.nome() : (u.nome || u.email || "Usuário"),
        papel: (A && A.papel) ? A.papel() : "admin",
        licencaEmail: email, deviceId: dev
      };
    },

    enviar: function (evento) {
      try {
        if (!this._ativo()) return;
        if (!this._sessao) this._sessao = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        var base = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
        if (!base) return;
        var ev = evento === "boot" ? "boot" : "ping";
        var ver = (typeof CONFIG !== "undefined") ? CONFIG.versao : "";
        var body;
        if (this.ehTrial()) {
          var r = this.reg(); if (!r) return;
          var email = r.email || "";
          try { if (!email && typeof Auth !== "undefined" && Auth.usuario) email = (Auth.usuario() || {}).email || ""; } catch (e2) {}
          body = { tipo: "trial", evento: ev, sessaoId: this._sessao, nome: r.nome || "", telefone: r.telefone || "", email: email, versao: ver, modulos: this._mods() };
        } else {
          var i = this._licInfo();
          body = { tipo: "licenciado", evento: ev, sessaoId: this._sessao, empresa: i.empresa, usuario: i.usuario, papel: i.papel, licencaEmail: i.licencaEmail, deviceId: i.deviceId, versao: ver, modulos: this._mods() };
        }
        fetch(base + "/api/telemetria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () {});
      } catch (e) {}
    },

    iniciar: function () {
      var self = this;
      if (!this._ativo()) return;
      try { localStorage.setItem(KEYMODS, "{}"); } catch (e) {} // sessão nova = contador de módulos zerado
      this.enviar("boot");
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () { self.enviar("ping"); }, 5 * 60 * 1000);
    },

    /* true = bloqueou (modal de cadastro na tela); false = segue o boot. Só TRIAL. */
    gate: function (aoLiberar) {
      if (!this.ehTrial() || this.reg()) return false;
      var self = this;
      var emailPre = ""; try { if (typeof Auth !== "undefined" && Auth.usuario) emailPre = (Auth.usuario() || {}).email || ""; } catch (e) {}
      var corpo =
        '<p class="muted" style="margin:0 0 12px">Bem-vindo ao <b>teste grátis de 7 dias</b> — sistema completo, sem cartão. Só precisamos saber quem está testando:</p>' +
        '<div class="field"><label>Seu nome *</label><input id="tg-nome" placeholder="Nome e sobrenome" autocomplete="name"></div>' +
        '<div class="field"><label>WhatsApp / telefone *</label><input id="tg-fone" placeholder="(34) 90000-0000" inputmode="tel" autocomplete="tel"></div>' +
        '<div class="field"><label>E-mail</label><input id="tg-email" value="' + String(emailPre).replace(/"/g, "&quot;") + '" placeholder="voce@empresa.com.br" autocomplete="email"></div>' +
        '<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;font-size:12.5px;color:var(--texto-fraco);margin-top:6px"><input type="checkbox" id="tg-ok" style="margin-top:3px">Autorizo o contato da RA Engenharia sobre o meu teste e o uso dos meus dados para esse fim (LGPD).</label>';
      UI.modal("🚀 Liberar meu teste grátis", corpo, [
        { texto: "Liberar meu teste grátis →", classe: "primary", onClick: function () {
          var nome = (UI.el("tg-nome") || {}).value || "", fone = (UI.el("tg-fone") || {}).value || "";
          var email = (UI.el("tg-email") || {}).value || "", ok = (UI.el("tg-ok") || {}).checked;
          if (nome.replace(/\s+/g, " ").trim().length < 3) { UI.toast("Informe o seu nome.", "erro"); return; }
          if (fone.replace(/\D/g, "").length < 10) { UI.toast("Informe um telefone válido com DDD.", "erro"); return; }
          if (!ok) { UI.toast("Marque o consentimento pra liberar o teste.", "erro"); return; }
          self.salvarReg({ nome: nome.trim(), telefone: fone.trim(), email: email.trim(), em: new Date().toISOString() });
          UI.fecharModal();
          if (typeof aoLiberar === "function") aoLiberar();
        } }
      ]);
      return true;
    }
  };

  global.Telemetria = Telemetria;
  if (typeof module !== "undefined" && module.exports) module.exports = Telemetria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

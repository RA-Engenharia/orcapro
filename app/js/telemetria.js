/* =====================================================================
 * telemetria.js — Cadastro obrigatório do TESTE GRÁTIS + uso do trial
 * Sem nome+telefone (com consentimento) ninguém testa. Enquanto o trial
 * roda, o app manda pings leves pro servidor de licença: boot + heartbeat
 * a cada 5 min + contador de módulos usados. O servidor agrega e o admin
 * vê: quem está testando, online agora, nº de entradas, horas de uso e
 * módulos mais usados. Clientes LICENCIADOS não são rastreados.
 * Fire-and-forget: sem internet, o app segue 100% (offline-first).
 * ===================================================================== */
(function (global) {
  "use strict";
  var KEYREG = "orcapro:trialreg", KEYMODS = "orcapro:telemetria:mods";

  var Telemetria = {
    _timer: null, _sessao: null,

    reg: function () { try { return JSON.parse(localStorage.getItem(KEYREG) || "null"); } catch (e) { return null; } },
    salvarReg: function (r) { try { localStorage.setItem(KEYREG, JSON.stringify(r)); } catch (e) {} },

    /* só rastreia TRIAL (licenciado/demo ficam de fora) */
    ehTrial: function () {
      try { var s = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; return !!(s && s.trial && s.ativo); }
      catch (e) { return false; }
    },

    _mods: function () { try { return JSON.parse(localStorage.getItem(KEYMODS) || "{}"); } catch (e) { return {}; } },
    contaModulo: function (v) {
      if (!v) return;
      try { var m = this._mods(); m[v] = (m[v] || 0) + 1; localStorage.setItem(KEYMODS, JSON.stringify(m)); } catch (e) {}
    },

    enviar: function (evento) {
      try {
        var r = this.reg(); if (!r || !this.ehTrial()) return;
        if (!this._sessao) this._sessao = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        var email = r.email || "";
        try { if (!email && typeof Auth !== "undefined" && Auth.usuario) email = (Auth.usuario() || {}).email || ""; } catch (e2) {}
        var body = {
          evento: evento === "boot" ? "boot" : "ping", sessaoId: this._sessao,
          nome: r.nome || "", telefone: r.telefone || "", email: email,
          versao: (typeof CONFIG !== "undefined") ? CONFIG.versao : "",
          modulos: this._mods() // cumulativo DA SESSÃO (zera a cada boot; o server guarda o maior)
        };
        var base = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
        if (!base) return;
        fetch(base + "/api/telemetria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () {});
      } catch (e) {}
    },

    iniciar: function () {
      var self = this;
      if (!this.ehTrial() || !this.reg()) return;
      try { localStorage.setItem(KEYMODS, "{}"); } catch (e) {} // sessão nova = contador de módulos zerado
      this.enviar("boot");
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () { self.enviar("ping"); }, 5 * 60 * 1000);
    },

    /* true = bloqueou (modal de cadastro na tela); false = segue o boot */
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

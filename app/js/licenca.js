/* =====================================================================
 * licenca.js — Licenciamento do OrçaPRO (trial + ativação por chave)
 * A licença é ASSINADA NO SERVIDOR (HMAC, segredo só no VPS). O app NÃO
 * guarda segredo nenhum: ele lê e-mail/validade da chave e DELEGA a
 * verificação ao servidor (/api/ativar), que controla a assinatura e a
 * trava de máquina. Por isso a chave não pode ser forjada no cliente.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TRIAL_MS = 3 * 60 * 60 * 1000; // teste de 3 HORAS — depois bloqueia gerar/salvar
  var GRACE_MS = 7 * 24 * 3600 * 1000; // carência offline: até 7 dias sem reconectar; depois exige revalidação online
  var KEY = "orcapro:licenca";

  function agora() { return new Date().getTime(); }
  function rotuloTempo(ms) {
    if (ms <= 0) return "encerrado";
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (h + "h" + (m < 10 ? "0" : "") + m) : (m + "min");
  }

  var Licenca = {
    _ler: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    _gravar: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },

    // ID do dispositivo (gerado 1x e guardado) — base da trava anti-compartilhamento
    deviceId: function () {
      try {
        var k = "orcapro:deviceid", d = localStorage.getItem(k);
        if (!d) { d = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)); localStorage.setItem(k, d); }
        return d;
      } catch (e) { return "nodev"; }
    },
    _servidor: function () { return (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : ""; },
    _ehV2: function (chave) { return String(chave || "").indexOf("v2.") === 0; },
    // Lê email/exp do payload da chave (v2 ou v1) SEM verificar assinatura — só p/ exibir/checar validade
    _lerExpDe: function (chave) {
      try {
        var c = String(chave || "").trim(), s;
        if (c.indexOf("v2.") === 0) {
          var parts = c.split("."); if (parts.length !== 3) return null;
          s = parts[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
        } else {
          var i = c.lastIndexOf("-"); if (i < 0) return null;
          s = c.slice(0, i);
        }
        var payload = (typeof atob !== "undefined") ? atob(s) : Buffer.from(s, "base64").toString();
        var seg = payload.split("|");
        return { email: seg[0], exp: parseInt(seg[1], 10) || 0 };
      } catch (e) { return null; }
    },
    _ativarLocal: function (chave, v, verificado) {
      var l = this._ler() || {};
      l.chave = String(chave).trim(); l.email = v.email; l.expira = v.expira;
      l.ativadoEm = agora(); l.deviceId = this.deviceId();
      l.verificado = !!verificado; if (verificado) l.validadoEm = agora();
      this._gravar(l);
    },
    // Ativação ONLINE obrigatória p/ licenças v2: o servidor assina + trava o dispositivo (sem furo offline).
    ativarOnline: function (chave, cb) {
      var self = this, c = String(chave || "").trim();
      if (!this._ehV2(c)) { cb({ ok: false, erro: "Chave inválida." }); return; }
      var srv = this._servidor();
      if (!srv || typeof fetch === "undefined") { cb({ ok: false, erro: "Ative com a internet ligada — a licença é validada no servidor." }); return; }
      fetch(srv + "/api/ativar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: c, deviceId: this.deviceId() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { self._ativarLocal(c, { email: d.email, expira: d.expira }, true); cb({ ok: true, email: d.email, expira: d.expira }); }
          else cb({ ok: false, erro: (d && d.erro) || "Não foi possível ativar." });
        }, function () { cb({ ok: false, erro: "Sem conexão com o servidor de licença. Tente novamente com a internet." }); });
    },
    // Revalida com o servidor: renova a carência e detecta bloqueio/troca de máquina.
    revalidar: function (cb) {
      cb = cb || function () {};
      var self = this, l = this._ler() || {};
      if (!l.chave || !l.verificado) { cb({ ok: true, skip: true }); return; }
      var srv = this._servidor(); if (!srv || typeof fetch === "undefined") { cb({ ok: true, offline: true }); return; }
      fetch(srv + "/api/ativar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: l.chave, deviceId: this.deviceId() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { l.validadoEm = agora(); l.email = d.email; l.expira = d.expira; self._gravar(l); cb({ ok: true }); }
          else if (d && d.bloqueado) { try { localStorage.removeItem(KEY); } catch (e) {} cb({ ok: false, bloqueado: true, erro: d.erro }); }
          else cb({ ok: true }); // recusa temporária: mantém (a carência cobre)
        }, function () { cb({ ok: true, offline: true }); });
    },
    // Ping de teste + ancora o início do trial no servidor (por dispositivo)
    registrarTeste: function () {
      try {
        var self = this, srv = this._servidor(); if (!srv || typeof fetch === "undefined") return;
        fetch(srv + "/api/teste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: this.deviceId() }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            try {
              if (d && d.trialInicio) { var l = self._ler() || {}; if (!l.trialServidor || d.trialInicio < l.trialServidor) { l.trialServidor = d.trialInicio; self._gravar(l); } }
              localStorage.setItem("orcapro:teste_pingado", "1");
            } catch (e) {}
          }).catch(function () {});
      } catch (e) {}
    },

    status: function () {
      var l = this._ler() || {};
      if (l.chave) {
        var info = this._lerExpDe(l.chave);
        var expirada = !!(info && info.exp && info.exp < agora());
        if (l.verificado) {
          // v2: ativada e verificada pelo servidor; respeita validade + dispositivo + carência offline
          if (expirada) return { ativo: false, trial: false, expirada: true, email: (l.email || (info && info.email)) };
          if (l.deviceId && l.deviceId !== this.deviceId()) return { ativo: false, trial: false, outroDispositivo: true };
          var dias = (info && info.exp) ? Math.ceil((info.exp - agora()) / 86400000) : null;
          if (agora() < (l.validadoEm || 0) + GRACE_MS) return { ativo: true, trial: false, email: l.email, expira: l.expira, diasRestantes: dias };
          return { ativo: false, trial: false, revalidar: true, email: l.email, diasRestantes: dias }; // carência vencida: reconectar
        }
        // chave presente mas sem ativação verificada pelo servidor -> não concede (cai p/ trial)
      }
      // trial: usa o início ancorado no servidor, se houver
      var ini = l.trialServidor || l.trialInicio;
      if (!ini) { ini = agora(); l.trialInicio = ini; this._gravar(l); }
      var fim = ini + TRIAL_MS;
      var rest = fim - agora();
      return { ativo: rest > 0, trial: true, expira: fim, expirado: rest <= 0, restanteMs: Math.max(0, rest), rotulo: rotuloTempo(rest) };
    }
  };

  global.Licenca = Licenca;
  if (typeof module !== "undefined" && module.exports) { module.exports = Licenca; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

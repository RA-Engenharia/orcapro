/* =====================================================================
 * licenca.js — Licenciamento do OrçaPRO (trial + ativação por chave)
 * Validação OFFLINE (deterrente). A chave codifica e-mail + validade e é
 * assinada com um SEGREDO. O revendedor gera chaves com tools/gerar-licenca.js
 * usando o MESMO segredo. Troque o SEGREDO abaixo pelo seu antes de vender.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SEGREDO = "OPR-mcPMPlrllGKQu02s05Ik-2026"; // segredo do licenciamento — mantenha privado
  var TRIAL_MS = 3 * 60 * 60 * 1000; // teste de 3 HORAS — depois bloqueia gerar/salvar
  var KEY = "orcapro:licenca";

  function checksum(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = (h * 33 + s.charCodeAt(i)) >>> 0; } return h.toString(36); }
  function agora() { return new Date().getTime(); }
  function rotuloTempo(ms) {
    if (ms <= 0) return "encerrado";
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (h + "h" + (m < 10 ? "0" : "") + m) : (m + "min");
  }

  var Licenca = {
    _ler: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    _gravar: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },

    // formato da chave: BASE64(email|expiraMs)-CHECKSUM
    validarChave: function (chave) {
      try {
        var c = String(chave || "").trim();
        var i = c.lastIndexOf("-"); if (i < 0) return { ok: false, erro: "Formato inválido." };
        var b64 = c.slice(0, i), sig = c.slice(i + 1);
        var dec = (typeof atob !== "undefined") ? atob(b64) : Buffer.from(b64, "base64").toString();
        var seg = dec.split("|"), email = seg[0], exp = parseInt(seg[1], 10);
        if (checksum(SEGREDO + "|" + email + "|" + exp) !== sig) return { ok: false, erro: "Chave inválida." };
        if (exp && exp < agora()) return { ok: false, erro: "Licença expirada." };
        return { ok: true, email: email, expira: exp };
      } catch (e) { return { ok: false, erro: "Chave inválida." }; }
    },

    ativar: function (chave) {
      var v = this.validarChave(chave); if (!v.ok) return v;
      var l = this._ler() || {}; l.chave = String(chave).trim(); l.email = v.email; l.expira = v.expira; l.ativadoEm = agora();
      this._gravar(l);
      return { ok: true, email: v.email, expira: v.expira };
    },

    status: function () {
      var l = this._ler() || {};
      if (l.chave) {
        var v = this.validarChave(l.chave);
        if (v.ok) return { ativo: true, trial: false, email: v.email, expira: v.expira, diasRestantes: v.expira ? Math.ceil((v.expira - agora()) / 86400000) : null };
      }
      // trial de 3 horas: marca o início no 1º uso
      if (!l.trialInicio) { l.trialInicio = agora(); this._gravar(l); }
      var fim = l.trialInicio + TRIAL_MS;
      var rest = fim - agora();
      return { ativo: rest > 0, trial: true, expira: fim, expirado: rest <= 0, restanteMs: Math.max(0, rest), rotulo: rotuloTempo(rest) };
    }
  };

  global.Licenca = Licenca;
  if (typeof module !== "undefined" && module.exports) { module.exports = Licenca; module.exports.SEGREDO = SEGREDO; module.exports.checksum = checksum; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

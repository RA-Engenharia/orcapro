/* =====================================================================
 * empresa.js — Identidade da empresa / Responsável Técnico + Logo
 * Usado nos documentos (Anexo de Laudo, Proposta). Lê/grava em prefs
 * (por empresa, no Store). Os defaults abaixo são o "setup" inicial
 * desta instância — editáveis em ⚙ Empresa (no produto vira wizard).
 * ===================================================================== */
(function (global) {
  "use strict";

  // Em branco de fábrica — cada cliente preenche os SEUS dados em ⚙ Empresa
  // (ficam salvos no navegador dele). Nada da RA embarca na cópia vendida.
  var DEFAULT = {
    nome: "",
    cnpj: "",
    responsavel: "",
    titulo: "Engenheiro Civil",
    crea: "",
    registroNacional: "",
    cidade: "",
    contato: ""
  };

  var Empresa = {
    campos: ["nome", "cnpj", "responsavel", "titulo", "crea", "registroNacional", "cidade", "contato"],

    _prefs: function () {
      try { return (typeof Store !== "undefined" && typeof Auth !== "undefined") ? (Store.lerPrefs(Auth.empresaId()) || {}) : {}; }
      catch (e) { return {}; }
    },

    /* Dados do responsável técnico (prefs sobrepõem o default). */
    dados: function () {
      var rt = (this._prefs().responsavelTecnico) || {};
      var d = {};
      this.campos.forEach(function (k) { d[k] = (rt[k] != null && String(rt[k]).trim() !== "") ? rt[k] : DEFAULT[k]; });
      return d;
    },

    /* Logo em base64 (data URI) ou null. */
    logo: function () { return this._prefs().logo || null; },

    /* HTML do logo p/ documentos: <img> se houver, senão placeholder. */
    logoHTML: function (maxH) {
      var l = this.logo();
      if (l) return '<img src="' + l + '" alt="logo" style="max-height:' + (maxH || 80) + 'px;max-width:260px;object-fit:contain">';
      return '<div class="logo-ph">[LOGO ' + (typeof Util !== "undefined" ? Util.esc(this.dados().nome) : this.dados().nome) + ']</div>';
    },

    salvar: function (dados, logoBase64) {
      var p = this._prefs();
      p.responsavelTecnico = dados;
      if (logoBase64 !== undefined) { if (logoBase64) p.logo = logoBase64; else delete p.logo; }
      Store.salvarPrefs(Auth.empresaId(), p);
      return true;
    },
    salvarLogo: function (logoBase64) {
      var p = this._prefs(); p.logo = logoBase64; Store.salvarPrefs(Auth.empresaId(), p);
    },
    DEFAULT: DEFAULT
  };

  global.Empresa = Empresa;
  if (typeof module !== "undefined" && module.exports) module.exports = Empresa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

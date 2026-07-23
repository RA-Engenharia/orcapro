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
    endereco: "",
    contato: ""
  };

  var Empresa = {
    campos: ["nome", "cnpj", "responsavel", "titulo", "crea", "registroNacional", "cidade", "endereco", "contato"],

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

    /* ================= WHITE-LABEL DOS ENTREGÁVEIS =================
     * Os documentos saem com a marca da EMPRESA DO CLIENTE. A menção ao
     * OrçaPRO ("Gerado pelo…"), a marca d'água e o QR de verificação são
     * OPCIONAIS — configurados em ⚙ Empresa e salvos nas prefs. */
    docsCfg: function () {
      var d = this._prefs().docs || {};
      return {
        creditos: d.creditos !== false,          // "Gerado pelo OrçaPRO IA" nos rodapés (default: mostra)
        marcaDagua: d.marcaDagua || "empresa",   // "empresa" (nome do cliente) | "nenhuma"
        qr: d.qr !== false                       // bloco QR de verificação nos impressos
      };
    },
    salvarDocsCfg: function (cfg) {
      var p = this._prefs();
      p.docs = { creditos: !!cfg.creditos, marcaDagua: cfg.marcaDagua === "nenhuma" ? "nenhuma" : "empresa", qr: !!cfg.qr };
      Store.salvarPrefs(Auth.empresaId(), p);
    },

    /* Nome que ASSINA os documentos: sempre a empresa do cliente (nunca o fabricante). */
    nomeDoc: function () {
      var n = this.dados().nome;
      if (n) return n;
      try { var u = (typeof Auth !== "undefined") && Auth.usuario(); if (u && u.empresa) return u.empresa; } catch (e) {}
      return "";
    },
    /* Texto da marca d'água das páginas internas ("" = sem marca d'água). */
    marcaDaguaTexto: function () {
      return this.docsCfg().marcaDagua === "nenhuma" ? "" : this.nomeDoc();
    },
    /* Crédito do produto: "" quando o cliente desliga. */
    creditoTexto: function () {
      if (!this.docsCfg().creditos) return "";
      return "Gerado pelo " + ((typeof CONFIG !== "undefined" && CONFIG.marca && CONFIG.marca.nome) || "OrçaPRO IA");
    },
    /* Rodapé-crédito pronto p/ os impressos (div discreta ou ""). */
    creditoHTML: function (comData) {
      var t = this.creditoTexto();
      if (!t) return "";
      return "<div style='text-align:right;font-size:8px;color:#999;margin-top:12px'>" + t +
        (comData ? " em " + new Date().toLocaleDateString("pt-BR") : "") + "</div>";
    },
    /* creator dos .xlsx (metadado visível no Excel). */
    excelCreator: function () {
      if (this.docsCfg().creditos) return (typeof CONFIG !== "undefined" && CONFIG.marca && CONFIG.marca.nome) || "OrçaPRO IA";
      return this.nomeDoc() || " ";
    },
    DEFAULT: DEFAULT
  };

  global.Empresa = Empresa;
  if (typeof module !== "undefined" && module.exports) module.exports = Empresa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

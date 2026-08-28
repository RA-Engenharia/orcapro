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
    DEFAULT: DEFAULT,

    /* =================================================================
     * FOTO DE PERFIL DE QUEM ESTA USANDO O SISTEMA
     *
     * ⚠ ONDE GUARDAR NAO E DETALHE. As prefs sao POR EMPRESA, nao por
     * pessoa: se a foto do sub-usuario fosse para la, o encarregado subiria
     * a dele e ela apareceria para todo mundo da conta. Entao:
     *   - dono da conta  -> prefs da empresa (`fotoDono`), que e dele mesmo;
     *   - sub-usuario    -> o registro dele em `equipe`.
     *
     * E fica como data URI pequeno (128 px, ~10 KB), NAO como referencia de
     * IndexedDB: a barra do topo desenha em toda tela e nao pode esperar uma
     * Promise para saber se mostra a foto ou as iniciais. Nesse tamanho o
     * peso e irrelevante para a sincronizacao — diferente da foto de obra,
     * que e grande e por isso vai por referencia.
     * ================================================================= */
    fotoUsuario: function () {
      try {
        var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
        if (u.usuarioId) {
          var m = (Store.listar(Auth.empresaId(), "equipe") || []).filter(function (x) { return x && x.id === u.usuarioId; })[0];
          return (m && m.foto) || "";
        }
        return this._prefs().fotoDono || "";
      } catch (e) { return ""; }
    },

    salvarFotoUsuario: function (dataURI) {
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      if (u.usuarioId) {
        var eq = Store.listar(Auth.empresaId(), "equipe") || [];
        var m = eq.filter(function (x) { return x && x.id === u.usuarioId; })[0];
        if (!m) return false;
        if (dataURI) m.foto = dataURI; else delete m.foto;
        Store.salvar(Auth.empresaId(), "equipe", m);
        this._avisarPerfil();
        return true;
      }
      var p = this._prefs();
      if (dataURI) p.fotoDono = dataURI; else delete p.fotoDono;
      Store.salvarPrefs(Auth.empresaId(), p);
      this._avisarPerfil();
      return true;
    },
    _avisarPerfil: function () {
      try { if (typeof Telemetria !== "undefined" && Telemetria.perfilMudou) Telemetria.perfilMudou(); } catch (e) {}
    },

    /* =================================================================
     * O NOME DE QUEM ESTA USANDO — mesma casa da foto, mesma regra.
     *
     * ⚠ POR QUE ISTO EXISTE. A conta mestre guarda empresa, e-mail e senha, e
     * NENHUM campo para a pessoa. Entao o dono da licenca nao tinha onde
     * escrever o proprio nome, e todo lugar que perguntava "quem esta logado"
     * recebia a RAZAO SOCIAL: a aprovacao de uma medicao saia assinada
     * "RA Engenharia Especial Ltda." no lugar do engenheiro que aprovou.
     *
     * Fica ao lado da foto (prefs.nomeDono / equipe[].nome) porque e o mesmo
     * dado — quem voce e — e porque e ali que o usuario ja vai mexer. Guardar
     * em `conta` faria o nome da pessoa viajar junto com o cadastro fiscal da
     * empresa, que e outra coisa e tem outro dono.
     * ================================================================= */
    nomeUsuario: function () {
      try {
        var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
        if (u.usuarioId) {
          var m = (Store.listar(Auth.empresaId(), "equipe") || []).filter(function (x) { return x && x.id === u.usuarioId; })[0];
          return (m && m.nome) || "";
        }
        return String(this._prefs().nomeDono || "").trim();
      } catch (e) { return ""; }
    },

    salvarNomeUsuario: function (nome) {
      var n = String(nome == null ? "" : nome).trim();
      /* ⚠ o limite e do RENDER, nao do banco: este nome desenha na barra do
         topo e no carimbo da aprovacao. Cortar aqui evita descobrir o estouro
         na tela de outra pessoa. */
      if (n.length > 60) n = n.substring(0, 60);
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      if (u.usuarioId) {
        /* ⚠ O SUB-USUARIO NAO EDITA O PROPRIO CADASTRO. `equipe[]` e area do
         * admin: `Auth.podeModulo("usuarios")` devolve false para ele de
         * propósito. A primeira versao desta funcao gravava ali sem olhar o
         * papel, e o botao "Meu perfil" e desenhado para todo mundo — o
         * encarregado abria, digitava "Ana Gerente", e a partir dali TODA
         * medicao, compra, requisicao e RDO que ele aprovasse saia carimbada
         * com esse nome, sem registro nenhum da troca. Num commit cujo
         * objetivo e tornar CONFIAVEL quem assina a aprovacao, deixar o
         * assinante escolher o proprio nome desfaz o trabalho inteiro.
         * A foto continua sendo dele (nao identifica ninguem num documento);
         * o NOME quem define e quem cadastrou a pessoa. */
        return "somente-admin";
      }
      if (u.papel && u.papel !== "admin") return "somente-admin";

      var p = this._prefs();
      if (n) {
        p.nomeDono = n;
        /* ⚠ CARIMBO DE QUANDO, e nao so o texto. `Nuvem._merge` resolve prefs
         * com `Object.assign({}, nuvem, local)` — campo a campo, o LOCAL
         * vence, sem desempate. Sem este carimbo o nome corrigido no celular
         * nunca alcancaria o computador (que reempurraria o velho para a
         * nuvem, para sempre), e apagar o nome seria impossivel: o outro
         * aparelho traria de volta no sync seguinte. Este repositorio ja
         * documentou o mesmo estrago tres vezes no proprio nuvem.js
         * (carp_param, portal_padrao, perfil_impl). */
        p.nomeDonoEm = new Date().toISOString();
      } else {
        delete p.nomeDono;
        /* apagar tambem e um ato datado: sem isto o aparelho que ainda tem o
           nome venceria o merge e o nome VOLTARIA sozinho */
        p.nomeDonoEm = new Date().toISOString();
      }
      Store.salvarPrefs(Auth.empresaId(), p);

      /* a sessao viva tem de sentir na hora — senao o nome so aparece no
         proximo login, e quem acabou de digitar acha que nao salvou */
      try {
        if (typeof Auth !== "undefined") {
          if (Auth.esquecerNome) Auth.esquecerNome();
          var s = Auth.usuario && Auth.usuario();
          if (s) s.nomePessoal = n;
        }
      } catch (e2) {}
      try { if (typeof Telemetria !== "undefined" && Telemetria.perfilMudou) Telemetria.perfilMudou(); } catch (e3) {}
      return true;
    },

    /* Iniciais para quando nao ha foto — melhor que um bonequinho generico:
       o usuario reconhece a propria conta de relance. */
    iniciais: function (nome) {
      var n = String(nome || "").trim();
      if (!n) return "?";
      var p = n.split(/\s+/).filter(function (x) { return x.length > 1; });
      if (!p.length) return n.charAt(0).toUpperCase();
      if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
      return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
    }
  };

  global.Empresa = Empresa;
  if (typeof module !== "undefined" && module.exports) module.exports = Empresa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bases.js — Camada MULTI-BASE de preços (aditiva)
 * A SINAPI continua no motor `Sinapi` (não duplica índice). Bases extras
 * (SICRO, SEINFRA, SETOP, ORSE, SBC, Própria) ficam aqui. Busca unificada
 * em todas as bases ativas, com badge de origem. Lógica pura/testável.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EXTRA = []; // bases extras: {fonte,label,cor,competencia,uf,itens,porCodigo,tokens,ativa}

  function norm(s) {
    if (typeof Util !== "undefined" && Util.normalizar) return Util.normalizar(s);
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }

  var Bases = {
    sinapiAtiva: true,
    META: {
      SINAPI: { label: "SINAPI", cor: "sinapi" },
      SICRO: { label: "SICRO (DNIT)", cor: "sicro" },
      SEINFRA: { label: "SEINFRA-CE", cor: "seinfra" },
      SETOP: { label: "SETOP-MG", cor: "setop" },
      ORSE: { label: "ORSE-SE", cor: "orse" },
      SUDECAP: { label: "SUDECAP-BH", cor: "sudecap" },
      SBC: { label: "SBC", cor: "sbc" },
      EMOP: { label: "EMOP-RJ", cor: "emop" },
      CPOS: { label: "CPOS-SP", cor: "cpos" },
      FDE: { label: "FDE-SP", cor: "fde" },
      AGETOP: { label: "AGETOP-GO", cor: "agetop" },
      SEDOP: { label: "SEDOP-PA", cor: "sedop" },
      CEHOP: { label: "CEHOP-SE", cor: "cehop" },
      IOPES: { label: "IOPES-ES", cor: "iopes" },
      DEINFRA: { label: "DEINFRA-SC", cor: "deinfra" },
      DER: { label: "DER (rodovias)", cor: "der" },
      CDHU: { label: "CDHU-SP", cor: "cdhu" },
      PROPRIA: { label: "Própria", cor: "proprio" }
    },

    _indexar: function (b) {
      b.porCodigo = {}; b.tokens = new Array(b.itens.length);
      for (var i = 0; i < b.itens.length; i++) {
        var it = b.itens[i];
        if (it && it.codigo != null) { b.porCodigo[String(it.codigo)] = it; b.tokens[i] = norm(it.codigo + " " + (it.descricao || "")); }
        else b.tokens[i] = "";
      }
      return b;
    },

    /* Registra/atualiza uma base extra a partir de um pacote { dados, mes, uf }. */
    registrar: function (fonte, pacote) {
      fonte = String(fonte || "PROPRIA").toUpperCase();
      var dados = (pacote && pacote.dados) ? pacote.dados : (Array.isArray(pacote) ? pacote : []);
      var meta = this.META[fonte] || { label: fonte, cor: "proprio" };
      var b = this._indexar({ fonte: fonte, label: meta.label, cor: meta.cor, competencia: (pacote && pacote.mes) || null, uf: (pacote && pacote.uf) || null, itens: dados, ativa: true });
      EXTRA = EXTRA.filter(function (x) { return x.fonte !== fonte; });
      EXTRA.push(b);
      return dados.length;
    },

    extras: function () { return EXTRA; },
    remover: function (fonte) { fonte = String(fonte).toUpperCase(); EXTRA = EXTRA.filter(function (x) { return x.fonte !== fonte; }); },
    setAtiva: function (fonte, val) {
      fonte = String(fonte).toUpperCase();
      if (fonte === "SINAPI") { this.sinapiAtiva = !!val; return; }
      var b = EXTRA.filter(function (x) { return x.fonte === fonte; })[0]; if (b) b.ativa = !!val;
    },

    /* Lista de TODAS as bases (inclui SINAPI) p/ a UI do gerenciador. */
    lista: function () {
      var out = [];
      if (typeof Sinapi !== "undefined" && Sinapi.carregado) {
        out.push({ fonte: "SINAPI", label: "SINAPI", cor: "sinapi", competencia: Sinapi.competencia, uf: Sinapi.uf, total: Sinapi.resumo().total, ativa: this.sinapiAtiva });
      }
      EXTRA.forEach(function (b) { out.push({ fonte: b.fonte, label: b.label, cor: b.cor, competencia: b.competencia, uf: b.uf, total: b.itens.length, ativa: b.ativa }); });
      return out;
    },

    /* Tipo do item: "composicao" | "insumo" (heurística sobre tipoItem/tipo/categoria). */
    tipoDe: function (it) {
      var t = String((it && (it.tipoItem || it.tipo || it.categoria)) || "").toLowerCase();
      return t.indexOf("insumo") !== -1 ? "insumo" : "composicao";
    },

    /* Busca unificada com FILTROS. opts: número (=max, retrocompat) OU
       { max, fonte:"SINAPI"|"SICRO"|…|null(todas), tipo:"composicao"|"insumo"|null, desonerado:true|false|null }.
       Retorna [{item,fonte,label,cor,tipo}]. */
    buscar: function (texto, opts) {
      if (typeof opts === "number") opts = { max: opts };
      opts = opts || {};
      var self = this, max = opts.max || 40;
      var fFonte = opts.fonte ? String(opts.fonte).toUpperCase() : null;
      // Filtros por orçamento (passo 3 do assistente):
      //   opts.fontes         — allowlist explícita (quem passar decide tudo)
      //   opts.excluirFontes  — DENYLIST: só o que o usuário desmarcou sai; tabela
      //                         instalada depois continua aparecendo sozinha.
      var permit = null;
      if (opts.fontes && opts.fontes.length) {
        permit = {};
        for (var pi = 0; pi < opts.fontes.length; pi++) { permit[String(opts.fontes[pi]).toUpperCase()] = 1; }
      }
      var negar = null;
      if (opts.excluirFontes && opts.excluirFontes.length) {
        negar = {};
        for (var ni = 0; ni < opts.excluirFontes.length; ni++) { negar[String(opts.excluirFontes[ni]).toUpperCase()] = 1; }
      }
      var fTipo = (opts.tipo === "composicao" || opts.tipo === "insumo") ? opts.tipo : null;
      var fDeson = (opts.desonerado === true || opts.desonerado === false) ? opts.desonerado : null;
      var alvo = norm(texto), termos = alvo.split(" ").filter(Boolean), out = [];
      if (!termos.length) return out;
      function passa(it) {
        if (fTipo && self.tipoDe(it) !== fTipo) return false;
        // desoneração: só exclui itens EXPLICITAMENTE do regime oposto (não penaliza base sem flag)
        if (fDeson !== null && (it.desonerado === true || it.desonerado === false) && it.desonerado !== fDeson) return false;
        return true;
      }
      if ((!fFonte || fFonte === "SINAPI") && (!permit || permit.SINAPI) && !(negar && negar.SINAPI) && this.sinapiAtiva && typeof Sinapi !== "undefined" && Sinapi.carregado) {
        Sinapi.buscar(texto, { max: max * 2, tipo: fTipo }).forEach(function (it) { if (passa(it)) out.push({ item: it, fonte: "SINAPI", label: "SINAPI", cor: "sinapi", tipo: self.tipoDe(it) }); });
      }
      EXTRA.forEach(function (b) {
        if (!b.ativa) return;
        if (permit && !permit[String(b.fonte).toUpperCase()]) return;
        if (negar && negar[String(b.fonte).toUpperCase()]) return;
        if (fFonte && b.fonte !== fFonte) return;
        for (var i = 0; i < b.itens.length && out.length < max * 4; i++) {
          var it = b.itens[i], hay = b.tokens[i], ok = true;
          for (var t = 0; t < termos.length; t++) { if (hay.indexOf(termos[t]) === -1) { ok = false; break; } }
          if (ok && passa(it)) out.push({ item: it, fonte: b.fonte, label: b.label, cor: b.cor, tipo: self.tipoDe(it) });
        }
      });
      var q = String(texto).trim();
      out.sort(function (a, b) {
        var ea = (String(a.item.codigo) === q) ? 0 : 1, eb = (String(b.item.codigo) === q) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return (a.item.descricao || "").length - (b.item.descricao || "").length;
      });
      return out.slice(0, max);
    },

    /* Obtém item por (fonte, código). Sem fonte → tenta SINAPI e depois extras. */
    obter: function (fonte, codigo) {
      if (codigo === undefined) { codigo = fonte; fonte = null; }
      fonte = fonte ? String(fonte).toUpperCase() : null;
      if ((!fonte || fonte === "SINAPI") && typeof Sinapi !== "undefined") { var s = Sinapi.obter(codigo); if (s) return s; }
      if (fonte && fonte !== "SINAPI") { var b = EXTRA.filter(function (x) { return x.fonte === fonte; })[0]; return b ? (b.porCodigo[String(codigo)] || null) : null; }
      for (var i = 0; i < EXTRA.length; i++) { var it = EXTRA[i].porCodigo[String(codigo)]; if (it) return it; }
      return null;
    },

    /* Como obter(codigo), mas devolve { item, fonte } com a base REAL que resolveu o código
       (itens crus das bases extras não carregam baseFonte — rotular SINAPI no chute violaria a fonte honesta). */
    obterComFonte: function (codigo) {
      if (typeof Sinapi !== "undefined" && Sinapi.carregado) { var s = Sinapi.obter(codigo); if (s) return { item: s, fonte: "SINAPI" }; }
      for (var i = 0; i < EXTRA.length; i++) { var it = EXTRA[i].porCodigo[String(codigo)]; if (it) return { item: it, fonte: EXTRA[i].fonte }; }
      return null;
    },

    /* Carrega uma base inclusa no app (JSON em data/), same-origin. */
    carregarInclusa: function (arquivo, fonte, regiao) {
      var self = this;
      return fetch(arquivo).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (pacote) {
        // base regionalizada (ex.: SETOP): usa o preço da região escolhida
        if (regiao && pacote.dados) pacote.dados.forEach(function (it) { if (it.precos && it.precos[regiao] != null) it.custoUnitario = it.precos[regiao]; });
        var n = self.registrar(fonte || pacote.fonte || "PROPRIA", pacote);
        var grav = { ok: true };
        if (typeof Store !== "undefined" && typeof Auth !== "undefined") grav = self.persistir(Auth.empresaId());
        return { total: n, fonte: (fonte || pacote.fonte || "PROPRIA"), competencia: pacote.mes, uf: pacote.uf, regiao: regiao || null, persistido: grav.ok, gravErro: grav.erro };
      });
    },

    /* Importa base extra de texto colado/arquivo (JSON do fetcher ou CSV). */
    importarTexto: function (fonte, texto, nome, opts) {
      opts = opts || {};
      texto = String(texto || "").replace(/^﻿/, "").trim();
      if (!texto) return { ok: false, erro: "Conteúdo vazio." };
      var pacote = null, pareceJson = texto.charAt(0) === "{" || texto.charAt(0) === "[" || /\.json$/i.test(nome || "");
      if (pareceJson) {
        try { var j = JSON.parse(texto); pacote = (j && j.dados) ? j : { dados: Array.isArray(j) ? j : [] }; }
        catch (e) { return { ok: false, erro: "JSON inválido: " + e.message }; }
      } else if (typeof Sinapi !== "undefined" && Sinapi._parseCSV) {
        pacote = Sinapi._parseCSV(texto);
        if (!pacote) return { ok: false, erro: "Não reconheci as colunas do CSV (Código, Descrição e Custo)." };
      } else { return { ok: false, erro: "CSV não suportado." }; }
      if (opts.competencia) pacote.mes = opts.competencia;
      if (opts.uf) pacote.uf = opts.uf;
      var n = this.registrar(fonte, pacote);
      if (!n) return { ok: false, erro: "Nenhum item válido." };
      return { ok: true, total: n, fonte: String(fonte).toUpperCase(), pacote: pacote };
    },

    /* Persistência por empresa (localStorage via Store). */
    persistir: function (empresaId) {
      if (typeof Store === "undefined") return { ok: false };
      var payload = EXTRA.map(function (b) { return { fonte: b.fonte, mes: b.competencia, uf: b.uf, dados: b.itens }; });
      Store.salvarBasesExtras(empresaId, payload); // IndexedDB — sem cota do localStorage
      return { ok: true };
    },
    carregar: function (empresaId, ufAtiva) {
      if (typeof Store === "undefined") return 0;
      var arr = Store.lerBasesExtras(empresaId);
      var self = this; var n = 0;
      // LOTE 2: base de OUTRA UF não entra ativa por padrão — preço regional
      // errado em proposta é bug de valor. Dados preservados; reativar em 🗂
      // Tabelas é decisão consciente do usuário.
      ufAtiva = String(ufAtiva || (typeof Sinapi !== "undefined" && Sinapi.uf) || "").toUpperCase();
      var desativadas = [];
      (Array.isArray(arr) ? arr : []).forEach(function (p) {
        if (!p || !p.fonte) return;
        self.registrar(p.fonte, p); n++;
        var ufBase = String(p.uf || "").toUpperCase();
        if (ufAtiva && ufBase && ufBase !== ufAtiva && ufBase !== "BR") {
          self.setAtiva(p.fonte, false);
          desativadas.push(p.fonte + " (" + ufBase + ")");
        }
      });
      if (desativadas.length) {
        try {
          if (global.UI && global.UI.toast) global.UI.toast("Bases de outra UF desativadas: " + desativadas.join(", ") + " — UF atual é " + ufAtiva + ". Reative em 🗂 Tabelas se for intencional.", "erro");
        } catch (e) {}
      }
      return n;
    }
  };

  global.Bases = Bases;
  if (typeof module !== "undefined" && module.exports) module.exports = Bases;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

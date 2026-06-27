/* =====================================================================
 * sinapi.js — Motor SINAPI: carregar, indexar e buscar composições/insumos
 * Consome EXATAMENTE o formato do sinapi-fetcher do ERP:
 *   { tabela, mes, uf, count, dados: [ { codigo, descricao, unidade,
 *     custoUnitario, custoMO, custoMAT, custoEQ, tipoItem, categoria, desonerado } ] }
 * ===================================================================== */
(function (global) {
  "use strict";

  var Sinapi = {
    carregado: false,
    competencia: null,
    uf: null,
    _itens: [],          // todos os registros
    _porCodigo: {},      // índice código -> item
    _tokens: [],         // descrição normalizada por item (mesma ordem de _itens)

    /* Carrega de um objeto já parseado (ou {dados:[...]}) */
    carregarDe: function (pacote) {
      var dados = pacote && pacote.dados ? pacote.dados : (Array.isArray(pacote) ? pacote : []);
      this._itens = Util.arr(dados).filter(function (d) { return d && Util.naoVazio(d.codigo); });
      this.competencia = (pacote && pacote.mes) || CONFIG.sinapi.competenciaPadrao;
      this.uf = (pacote && pacote.uf) || CONFIG.sinapi.ufPadrao;
      this._indexar();
      this.carregado = true;
      return this._itens.length;
    },

    /* Carrega via fetch do arquivo principal; cai na amostra se falhar. */
    carregarArquivo: function (url) {
      var self = this;
      var principal = url || CONFIG.sinapi.arquivoDemo;
      return fetch(principal)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (j) { return self.carregarDe(j); })
        .catch(function (e) {
          console.warn("[SINAPI] falhou base principal (" + principal + "): " + e.message + " — usando amostra.");
          return fetch(CONFIG.sinapi.arquivoAmostra)
            .then(function (r) { return r.json(); })
            .then(function (j) { return self.carregarDe(j); });
        });
    },

    _indexar: function () {
      this._porCodigo = {};
      this._tokens = new Array(this._itens.length);
      for (var i = 0; i < this._itens.length; i++) {
        var it = this._itens[i];
        this._porCodigo[String(it.codigo)] = it;
        this._tokens[i] = Util.normalizar(it.codigo + " " + it.descricao);
      }
    },

    obter: function (codigo) { return this._porCodigo[String(codigo)] || null; },

    /* Busca por código ou palavras-chave (todas precisam aparecer).
     * filtro: { tipo: "composicao"|"insumo"|null, desonerado: bool|null, max: N }
     */
    buscar: function (texto, filtro) {
      filtro = filtro || {};
      var max = filtro.max || 60;
      var alvo = Util.normalizar(texto);
      var termos = alvo.split(" ").filter(Boolean);
      var out = [];
      if (!termos.length) return out;

      for (var i = 0; i < this._itens.length && out.length < max; i++) {
        var it = this._itens[i];
        if (filtro.tipo && String(it.tipoItem || it.tipo || it.categoria).indexOf(filtro.tipo) === -1) continue;
        if (filtro.desonerado != null && !!it.desonerado !== !!filtro.desonerado) continue;
        var hay = this._tokens[i];
        var ok = true;
        for (var t = 0; t < termos.length; t++) {
          if (hay.indexOf(termos[t]) === -1) { ok = false; break; }
        }
        if (ok) out.push(it);
      }
      // Ordena: código exato primeiro, depois descrição mais curta (mais específica)
      out.sort(function (a, b) {
        var ea = (String(a.codigo) === texto.trim()) ? 0 : 1;
        var eb = (String(b.codigo) === texto.trim()) ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return (a.descricao || "").length - (b.descricao || "").length;
      });
      return out;
    },

    resumo: function () {
      return { carregado: this.carregado, total: this._itens.length, competencia: this.competencia, uf: this.uf };
    },

    /* Importa de texto colado/arquivo. Detecta JSON (formato do fetcher) ou CSV.
     * opts: { competencia, uf } sobrescreve metadados (útil p/ CSV). */
    importarTexto: function (texto, nome, opts) {
      opts = opts || {};
      texto = String(texto || "").replace(/^﻿/, "").trim();
      if (!texto) return { ok: false, erro: "Conteúdo vazio." };

      var pacote = null;
      var pareceJson = texto.charAt(0) === "{" || texto.charAt(0) === "[" || /\.json$/i.test(nome || "");
      if (pareceJson) {
        try {
          var j = JSON.parse(texto);
          pacote = j && j.dados ? j : { dados: Array.isArray(j) ? j : [] };
        } catch (e) { return { ok: false, erro: "JSON inválido: " + e.message }; }
      } else {
        pacote = this._parseCSV(texto);
        if (!pacote) return { ok: false, erro: "Não reconheci as colunas do CSV (preciso de Código, Descrição e Custo)." };
      }

      if (opts.competencia) pacote.mes = opts.competencia;
      if (opts.uf) pacote.uf = opts.uf;

      var n = this.carregarDe(pacote);
      if (!n) return { ok: false, erro: "Nenhum item válido encontrado." };
      return { ok: true, total: n, competencia: this.competencia, uf: this.uf, pacote: pacote };
    },

    /* CSV simples com cabeçalho. Detecta delimitador ; ou , e mapeia colunas. */
    _parseCSV: function (texto) {
      var linhas = texto.split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (linhas.length < 2) return null;
      var delim = (linhas[0].split(";").length >= linhas[0].split(",").length) ? ";" : ",";
      var head = this._splitCSV(linhas[0], delim).map(Util.normalizar);

      function acharCol(aliases) {
        for (var i = 0; i < head.length; i++) {
          for (var a = 0; a < aliases.length; a++) { if (head[i].indexOf(aliases[a]) > -1) return i; }
        }
        return -1;
      }
      var iCod = acharCol(["codigo", "cod"]);
      var iDesc = acharCol(["descricao", "servico", "insumo"]);
      var iUn = acharCol(["unidade", "und", "unid"]);
      var iCusto = acharCol(["custo unitario", "custounitario", "custo total", "custo", "preco", "valor"]);
      var iMO = acharCol(["mao de obra", "mo "]);
      var iMAT = acharCol(["material", "mat "]);
      var iEQ = acharCol(["equipamento", "eq "]);
      if (iCod < 0 || iCusto < 0) return null;

      var dados = [];
      for (var r = 1; r < linhas.length; r++) {
        var c = this._splitCSV(linhas[r], delim);
        var cod = (c[iCod] || "").trim();
        var custo = Util.num(c[iCusto]);
        if (!cod || custo <= 0) continue; // descarta cabeçalhos/linhas vazias/totais
        dados.push({
          codigo: cod,
          descricao: iDesc > -1 ? (c[iDesc] || "").trim() : "",
          unidade: iUn > -1 ? (c[iUn] || "un").trim() : "un",
          custoUnitario: custo,
          custoMO: iMO > -1 ? Util.num(c[iMO]) : 0,
          custoMAT: iMAT > -1 ? Util.num(c[iMAT]) : 0,
          custoEQ: iEQ > -1 ? Util.num(c[iEQ]) : 0,
          tipo: "composicao"
        });
      }
      return dados.length ? { tabela: "composicoes", count: dados.length, dados: dados } : null;
    },

    /* Split de linha CSV respeitando aspas duplas. */
    _splitCSV: function (linha, delim) {
      var out = [], cur = "", emAspas = false;
      for (var i = 0; i < linha.length; i++) {
        var ch = linha[i];
        if (ch === '"') { if (emAspas && linha[i + 1] === '"') { cur += '"'; i++; } else emAspas = !emAspas; }
        else if (ch === delim && !emAspas) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    }
  };

  global.Sinapi = Sinapi;
})(window);

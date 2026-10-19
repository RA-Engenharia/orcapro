/* =====================================================================
 * hidnormas.js — TABELAS DE NORMA do hidrossanitário (motor PURO, ES5,
 * Node-testável). Fase 1 do plano docs/hidro/PLANO-HIDROSSANITARIO.md.
 *
 * POR QUE ESTE ARQUIVO EXISTE. O cálculo hidráulico vai para memorial
 * assinado. Valor de norma escrito à mão no .js não tem página, não tem
 * edição e ninguém confere — e a NBR 5626 mudou inteira em 2020. Por isso
 * NENHUM motor hid*.js guarda número de norma: todos perguntam aqui, e aqui
 * só responde o que veio de dados-fonte/hidro/normas/*.json (com fonte,
 * edição, página e tipo primária/secundária), por tools/gerar-hid-normas.js
 * → js/hidnormasdados.js (GERADO, não editar).
 *
 * ⚠ Faltou a tabela (ou o valor está vazio) → a consulta devolve
 *   { ok:false, chave, motivo } e o contexto guarda a PENDÊNCIA com a chave.
 *   Nunca há "valor típico" de reserva: o motor que perguntou marca a
 *   verificação como pendente. Recado que mente é pior que recado nenhum.
 *
 * ⚠ FIXTURE: os testes carregam tabelas de teste por carregar(). Elas trazem
 *   `fixture: true` e TODO contexto criado com elas avisa "TABELAS DE TESTE —
 *   NÃO É NORMA" (o orquestrador põe no resultado). O gerador recusa fixture
 *   dentro de dados-fonte/.
 *
 * Formato (docs/hidro/CONTRATO.md §1): tabela = { titulo, unidade, fonte,
 * colunas, dados } com dados em linhas-array (ordem das colunas) ou objetos;
 * escalar = colunas ["valor"] e dados [[v]] (ou dados: v).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function vazio(v) { return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v)); }

  /* apelido: a chave que o motor pergunta → a chave que a F1 gravou. Fica
     vazio até o gerente decidir (CONTRATO §1.1); a tabela lida por apelido
     sai no memorial com a chave REAL, para ninguém procurar a errada. */
  var APELIDOS = {};

  var DADOS = null;

  /* junta as tabelas: aceita o formato GERADO ({tabelas, pendentes, fixture})
     ou uma lista de arquivos de norma crus ([{norma, edicao, tabelas, pendentes}]) */
  function normalizar(d) {
    var out = { tabelas: {}, pendentes: [], fixture: false, arquivos: [] };
    if (!d) return out;
    var lista = Array.isArray(d) ? d : (d.tabelas && !d.norma && d.gerado !== undefined ? null : [d]);
    if (!lista) {                                        /* formato gerado */
      out.fixture = !!d.fixture;
      out.arquivos = arr(d.arquivos).slice();
      Object.keys(d.tabelas || {}).forEach(function (k) { out.tabelas[k] = d.tabelas[k]; });
      out.pendentes = arr(d.pendentes).map(normPendente);
      return out;
    }
    lista.forEach(function (f) {
      if (!f) return;
      if (f.fixture) out.fixture = true;
      out.arquivos.push({ norma: f.norma || "", edicao: f.edicao || "", arquivo: f.arquivo || "" });
      Object.keys(f.tabelas || {}).forEach(function (k) {
        var t = copia(f.tabelas[k]);
        if (t.norma == null) t.norma = f.norma || "";
        if (t.edicao == null) t.edicao = f.edicao || "";
        out.tabelas[k] = t;
      });
      arr(f.pendentes).forEach(function (p) { var q = normPendente(p); if (q.norma == null || q.norma === "") q.norma = f.norma || ""; out.pendentes.push(q); });
    });
    return out;
  }
  function normPendente(p) { return typeof p === "string" ? { chave: p, motivo: "sem fonte (pendente na F1)" } : { chave: p.chave, motivo: p.motivo || "sem fonte (pendente na F1)", norma: p.norma }; }

  function base() {
    if (DADOS) return DADOS;
    var d = global.HidNormasDados;
    if (!d && typeof require === "function") { try { d = require("./hidnormasdados.js"); } catch (e) { d = null; } }
    DADOS = normalizar(d);
    return DADOS;
  }
  /* testes e a tela (tabela do município, do estado) trocam o conjunto inteiro */
  function carregar(d) { DADOS = normalizar(d); return DADOS; }
  function reiniciar() { DADOS = null; }
  function ehFixture() { return !!base().fixture; }

  function real(chave) { return Object.prototype.hasOwnProperty.call(APELIDOS, chave) ? APELIDOS[chave] : chave; }

  /* a tabela já com as linhas como OBJETOS (coluna → valor) */
  function tabela(chave) {
    var k = real(chave), t = base().tabelas[k];
    if (!t) return null;
    var cols = arr(t.colunas), linhas;
    if (Array.isArray(t.dados)) {
      linhas = t.dados.map(function (l) {
        if (Array.isArray(l)) { var o = {}; cols.forEach(function (c, i) { o[c] = l[i]; }); return o; }
        return copia(l);
      });
    } else if (t.dados !== undefined && t.dados !== null && typeof t.dados !== "object") {
      linhas = [{ valor: t.dados }];
      if (!cols.length) cols = ["valor"];
    } else linhas = [];
    return { chave: k, pedida: chave, titulo: t.titulo || "", unidade: t.unidade || "", norma: t.norma || "", edicao: t.edicao || "",
             fonte: copia(t.fonte) || null, colunas: cols.slice(), linhas: linhas, pendente: !!t.pendente };
  }

  /* filtro {coluna: valor}: número compara por número; a linha com "*" na
     coluna vale para qualquer valor pedido (ex.: reservação para todo uso) */
  function casa(linha, filtro) {
    var ks = Object.keys(filtro || {});
    for (var i = 0; i < ks.length; i++) {
      var c = ks[i], v = filtro[c], lv = linha[c];
      if (lv === "*") continue;
      if (typeof v === "number" || (typeof lv === "number" && !isNaN(Number(v)))) { if (Number(lv) !== Number(v)) return false; }
      else if (String(lv) !== String(v)) return false;
    }
    return true;
  }
  /* as linhas que casam; as linhas exatas antes das de "*" (a regra específica manda) */
  function linhas(chave, filtro) {
    var t = tabela(chave); if (!t) return [];
    var l = t.linhas.filter(function (x) { return casa(x, filtro); });
    var exatas = l.filter(function (x) { return !Object.keys(filtro || {}).some(function (c) { return x[c] === "*"; }); });
    return exatas.concat(l.filter(function (x) { return exatas.indexOf(x) < 0; }));
  }

  function fonte(chave) {
    var t = tabela(chave); if (!t) return null;
    var f = t.fonte || {};
    return { chave: t.chave, titulo: t.titulo, norma: t.norma, edicao: t.edicao, doc: f.doc || "", url: f.url || "", pagina: f.pagina == null ? "" : f.pagina,
             tabela: f.tabela || "", tipo: f.tipo || "", unidade: t.unidade,
             /* cópia não licenciada conferida (NBR 10844, 17/10/2026): o resultado avisa que falta o exemplar próprio */
             exemplarLicenciado: f.exemplarLicenciado === false ? false : undefined, obs: f.exemplarLicenciado === false ? (f.obs || "") : undefined };
  }
  function descFiltro(filtro) { var ks = Object.keys(filtro || {}); return ks.length ? "[" + ks.map(function (k) { return k + "=" + filtro[k]; }).join(", ") + "]" : ""; }

  /* a consulta completa: { ok, valor, linha, chave, fonte } ou { ok:false, chave, motivo } */
  function consulta(chave, filtro, coluna) {
    var col = coluna || "valor", ref = chave + descFiltro(filtro) + (col !== "valor" ? "." + col : "");
    var marc = base().pendentes.filter(function (p) { return p.chave === real(chave); })[0];
    var t = tabela(chave);
    if (!t) return { ok: false, chave: chave, ref: ref, motivo: marc ? marc.motivo : "tabela " + chave + " não carregada (dados-fonte/hidro/normas)" };
    if (t.pendente) return { ok: false, chave: chave, ref: ref, motivo: "tabela " + chave + " marcada pendente na fonte" };
    if (!t.fonte || !t.fonte.doc || !t.fonte.tipo) return { ok: false, chave: chave, ref: ref, motivo: "tabela " + chave + " sem fonte (doc/tipo) — valor sem fonte não entra no cálculo" };
    var ls = linhas(chave, filtro);
    if (!ls.length) return { ok: false, chave: chave, ref: ref, motivo: "nenhuma linha de " + chave + " com " + (descFiltro(filtro) || "esse critério") };
    var v = ls[0][col];
    if (vazio(v)) return { ok: false, chave: chave, ref: ref, motivo: "coluna \"" + col + "\" vazia em " + chave + descFiltro(filtro) };
    var fl = fonte(chave);
    if (ls[0].fonte && typeof ls[0].fonte === "object") fl = mesclarFonte(fl, ls[0].fonte);
    else if (typeof ls[0].fonte === "string" && ls[0].fonte) fl = mesclarFonte(fl, { doc: ls[0].fonte });
    return { ok: true, valor: v, linha: ls[0], chave: chave, ref: ref, fonte: fl, unidade: t.unidade };
  }
  function mesclarFonte(a, b) { var o = copia(a) || {}; Object.keys(b || {}).forEach(function (k) { if (!vazio(b[k])) o[k] = b[k]; }); return o; }
  function valor(chave, filtro, coluna) { var c = consulta(chave, filtro, coluna); return c.ok ? c.valor : null; }
  /* null = há valor; senão { chave, motivo } */
  function pendente(chave, filtro, coluna) { var c = consulta(chave, filtro, coluna); return c.ok ? null : { chave: chave, ref: c.ref, motivo: c.motivo }; }

  /* -------------------------------------------------------- CONTEXTO
   * Um contexto por cálculo: cada motor consulta por ele e o contexto
   * guarda (a) as tabelas usadas, para a seção "normas" do memorial, e
   * (b) as pendências agrupadas por chave, com onde faltou. */
  function contexto() {
    var usadas = {}, ordemU = [], pend = {}, ordemP = [];
    function usou(c) { if (!usadas[c.fonte.chave]) { usadas[c.fonte.chave] = c.fonte; ordemU.push(c.fonte.chave); } }
    function faltou(c, usadoEm) {
      if (!pend[c.ref]) { pend[c.ref] = { chave: c.chave, ref: c.ref, motivo: c.motivo, usadoEm: [] }; ordemP.push(c.ref); }
      if (usadoEm && pend[c.ref].usadoEm.indexOf(usadoEm) < 0) pend[c.ref].usadoEm.push(usadoEm);
    }
    var ctx = {
      fixture: ehFixture(),
      consulta: function (chave, filtro, coluna, usadoEm) {
        var c = consulta(chave, filtro, coluna);
        if (c.ok) usou(c); else faltou(c, usadoEm);
        return c;
      },
      /* a tabela inteira (linhas que casam com o filtro) — null + pendência se a tabela não serve */
      linhas: function (chave, filtro, usadoEm) {
        var t = tabela(chave);
        var c = consulta(chave, null, t && t.colunas.length ? t.colunas[0] : "valor");
        if (!c.ok) { faltou(c, usadoEm); return null; }
        usou(c);
        return linhas(chave, filtro);
      },
      /* pendência que não é de tabela (ex.: aparelho sem nome conhecido) */
      pendencia: function (chave, motivo, usadoEm) { faltou({ chave: chave, ref: chave, motivo: motivo }, usadoEm); },
      normas: function () { return ordemU.map(function (k) { return usadas[k]; }); },
      pendencias: function () { return ordemP.map(function (k) { return pend[k]; }); },
      temPendencia: function () { return ordemP.length > 0; }
    };
    return ctx;
  }

  var HidNormas = {
    VERSAO: 1, APELIDOS: APELIDOS,
    carregar: carregar, reiniciar: reiniciar, ehFixture: ehFixture, normalizar: normalizar,
    tabela: tabela, linhas: linhas, consulta: consulta, valor: valor, fonte: fonte, pendente: pendente,
    contexto: contexto,
    chaves: function () { return Object.keys(base().tabelas); },
    pendentesDaFonte: function () { return base().pendentes.slice(); }
  };
  global.HidNormas = HidNormas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidNormas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

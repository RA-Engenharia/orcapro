/* =====================================================================
 * roundtrip.js — Reimportar Excel editado (FASE 4, exclusivo no mercado)
 * O Excel exportado leva a aba _meta (snapshot do orçamento na exportação).
 * O cliente edita Qtd/Custo NA PLANILHA; a reimportação:
 *   1) lê a _meta (mapa linha→item, pela ORDEM do snapshot);
 *   2) lê as células editadas da Analítica (linhas de item = coluna K
 *      preenchida, a âncora do SUMIFS);
 *   3) diffa contra o orçamento ABERTO no app;
 *   4) o usuário aceita/rejeita mudança a mudança.
 * Funções puras e testáveis em Node (tools/test-roundtrip.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  var Roundtrip = {

    /* Lê e remonta a aba _meta de um workbook ExcelJS carregado.
     * Retorna { cab, orc } ou { erro } — nunca lança. */
    lerMeta: function (wb) {
      try {
        var ws = wb.getWorksheet("_meta");
        if (!ws) return { erro: "sem-meta" };
        var cab = JSON.parse(String(ws.getCell("A1").value || ""));
        if (!cab || cab.tipo !== "orcapro-meta") return { erro: "sem-meta" };
        var json = "";
        for (var i = 0; i < (cab.partes || 1); i++) json += String(ws.getCell("A" + (i + 2)).value || "");
        return { cab: cab, orc: JSON.parse(json) };
      } catch (e) { return { erro: "meta-corrompida", detalhe: e.message }; }
    },

    /* Itens do snapshot achatados NA MESMA ORDEM em que o gerador escreve
     * as linhas da Analítica (etapas → itens). */
    _flatten: function (orcMeta) {
      var out = [];
      Util.arr(orcMeta && orcMeta.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) { out.push({ etapa: e.nome || e.codigo || "", it: it }); });
      });
      return out;
    },

    /* Extrai as EDIÇÕES da Analítica: linhas de item = coluna K preenchida.
     * Mapeia pela ordem do snapshot. Retorna [{itemId, codigo, descricao,
     * etapa, qtd, custoUnit}] ou { erro } se a contagem não bater. */
    extrairEdicoes: function (wb, orcMeta) {
      var ws = wb.getWorksheet("Analítica");
      if (!ws) return { erro: "sem-analitica" };
      var flat = this._flatten(orcMeta);
      var linhas = [];
      ws.eachRow(function (row, rn) {
        if (rn <= 6) return; // cabeçalhos
        var k = row.getCell(11).value;
        if (k == null || String(k).trim() === "" || String(k) === "Etapa") return;
        var vF = row.getCell(6).value, vG = row.getCell(7).value;
        linhas.push({ qtd: Util.num(vF && vF.result != null ? vF.result : vF), custoUnit: Util.num(vG && vG.result != null ? vG.result : vG) });
      });
      if (linhas.length !== flat.length) return { erro: "estrutura-alterada", detalhe: linhas.length + " linhas de item no Excel vs " + flat.length + " no snapshot (linhas inseridas/removidas não são suportadas — edite quantidades e custos)" };
      return linhas.map(function (L, i) {
        return { itemId: flat[i].it.id, codigo: flat[i].it.codigo || "", descricao: flat[i].it.descricao || "", etapa: flat[i].etapa, qtd: L.qtd, custoUnit: L.custoUnit };
      });
    },

    /* Diff PURO contra o orçamento aberto: só quantidade e custoUnitario
     * (memória/descrição não são editáveis pela planilha). */
    diff: function (orcAtual, edicoes) {
      var porId = {};
      Util.arr(orcAtual && orcAtual.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) { porId[it.id] = it; });
      });
      var mudancas = [];
      var r4 = function (n) { return Math.round((Util.num(n) + Number.EPSILON) * 10000) / 10000; };
      (Array.isArray(edicoes) ? edicoes : []).forEach(function (ed) {
        var it = porId[ed.itemId];
        if (!it) return; // item removido no app depois do export — ignora
        if (r4(it.quantidade) !== r4(ed.qtd) && ed.qtd > 0) {
          mudancas.push({ itemId: ed.itemId, codigo: ed.codigo, descricao: ed.descricao, etapa: ed.etapa, campo: "quantidade", de: Util.num(it.quantidade), para: r4(ed.qtd) });
        }
        if (r4(it.custoUnitario) !== r4(ed.custoUnit) && ed.custoUnit > 0) {
          mudancas.push({ itemId: ed.itemId, codigo: ed.codigo, descricao: ed.descricao, etapa: ed.etapa, campo: "custoUnitario", de: Util.num(it.custoUnitario), para: r4(ed.custoUnit) });
        }
      });
      return mudancas;
    },

    /* Valida a compatibilidade _meta × app × orçamento aberto.
     * Retorna { ok } ou { erro, ... } p/ a UI mensagear. */
    validar: function (cab, orcAtual) {
      var schemaApp = (typeof CONFIG !== "undefined" && CONFIG.schemaVersao) || 3;
      if (cab.schemaVersao && cab.schemaVersao > schemaApp) return { erro: "schema-novo" };
      if (orcAtual && cab.id && orcAtual.id !== cab.id) return { erro: "outro-orcamento", numero: cab.numero || "" };
      return { ok: true };
    },

    /* Aplica as mudanças ACEITAS no orçamento (via motor oficial). */
    aplicar: function (orc, mudancas) {
      var n = 0;
      Util.arr(orc && orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          (mudancas || []).forEach(function (m) {
            if (m.itemId !== it.id) return;
            var campos = {};
            campos[m.campo] = m.para;
            Orcamento.atualizarItem(orc, e.id, it.id, campos);
            n++;
          });
        });
      });
      return n;
    }
  };

  global.Roundtrip = Roundtrip;
  if (typeof module !== "undefined" && module.exports) module.exports = Roundtrip;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

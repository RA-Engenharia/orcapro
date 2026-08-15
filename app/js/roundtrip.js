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
        var out = { cab: cab, orc: JSON.parse(json) };
        /* COLUNA B — as composições próprias usadas pelo orçamento (v1.1.211).
           Só existe em planilha gerada da 1.1.211 para cá; arquivo mais velho
           simplesmente não tem, e isso NÃO é erro: o orçamento volta igual, só
           sem a estrutura das próprias. Falha aqui nunca derruba a leitura do
           orçamento — a coluna A é o que importa. */
        try {
          if (cab.propriasPartes > 0) {
            var jp = "";
            for (var p = 0; p < cab.propriasPartes; p++) jp += String(ws.getCell("B" + (p + 2)).value || "");
            var pr = JSON.parse(jp);
            if (pr && Array.isArray(pr.itens) && pr.itens.length) out.proprias = pr.itens;
          }
        } catch (ep) { out.propriasErro = String((ep && ep.message) || ep); }
        return out;
      } catch (e) { return { erro: "meta-corrompida", detalhe: e.message }; }
    },
    /* Quais composições próprias do arquivo NÃO estão (ou estão desatualizadas)
     * na base do usuário. Puro: quem resolve o código é quem chama. */
    propriasFaltando: function (proprias, resolve) {
      var out = [];
      (Array.isArray(proprias) ? proprias : []).forEach(function (p) {
        if (!p || !p.codigo) return;
        var atual = null;
        try { atual = resolve(p.codigo); } catch (e) {}
        if (!atual) { out.push({ item: p, motivo: "ausente" }); return; }
        var difere = Number(atual.custoUnitario) !== Number(p.custoUnitario) ||
          (Util.arr(atual.insumos).length !== Util.arr(p.insumos).length);
        if (difere) out.push({ item: p, motivo: "diferente", atual: atual });
      });
      return out;
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
      /* v1.1.232 — a recusa de zero fica, mas deixa de ser MUDA. Cliente que
         zerava Qtd ou Custo no Excel ouvia "Nenhuma diferença entre o Excel e
         o orçamento" — mensagem falsa: havia diferença, o app a descartou.
         As recusadas voltam em `mudancas.recusadas` para a tela listar. */
      mudancas.recusadas = [];
      var r4 = function (n) { return Math.round((Util.num(n) + Number.EPSILON) * 10000) / 10000; };
      (Array.isArray(edicoes) ? edicoes : []).forEach(function (ed) {
        var it = porId[ed.itemId];
        if (!it) return; // item removido no app depois do export — ignora
        if (r4(it.quantidade) !== r4(ed.qtd)) {
          if (ed.qtd > 0) mudancas.push({ itemId: ed.itemId, codigo: ed.codigo, descricao: ed.descricao, etapa: ed.etapa, campo: "quantidade", de: Util.num(it.quantidade), para: r4(ed.qtd) });
          else mudancas.recusadas.push({ codigo: ed.codigo, campo: "quantidade", motivo: "zerada no Excel — zero não é quantidade; para remover o item, remova no app" });
        }
        if (r4(it.custoUnitario) !== r4(ed.custoUnit)) {
          if (ed.custoUnit > 0) mudancas.push({ itemId: ed.itemId, codigo: ed.codigo, descricao: ed.descricao, etapa: ed.etapa, campo: "custoUnitario", de: Util.num(it.custoUnitario), para: r4(ed.custoUnit) });
          else mudancas.recusadas.push({ codigo: ed.codigo, campo: "custo unitário", motivo: "zerado no Excel — zero não é preço; cote e preencha no app" });
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

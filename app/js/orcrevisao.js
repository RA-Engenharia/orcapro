/* =====================================================================
 * orcrevisao.js — REVISÕES DO ORÇAMENTO (R00, R01, R02…): congelar e comparar (motor)
 *
 * "Salvar revisão" tira um INSTANTÂNEO enxuto do orçamento — data, motivo, total e
 * uma linha por item — para a pessoa voltar a ver (e comparar) o que foi o R01
 * antes de mexer no R02. Não é a "revisão" de orçamento aprovado (Orcamento.novaRevisao,
 * que cria OUTRO orçamento com sufixo -R1): esta é um retrato guardado dentro do
 * próprio orçamento, em `orc.revisoes`.
 *
 * ⚠ ENXUTO DE PROPÓSITO. A entidade `orcamentos` sobe para a nuvem num documento só
 *   (teto de 1 MiB — ver a memória de armazenamento). Cada instantâneo guarda só o
 *   que serve para listar e comparar: [id do item, nº da etapa, número, código,
 *   descrição (corta em 90), unidade, quantidade, custo unitário, preço total, custo
 *   total]. Limites: no máximo MAX revisões e MAX_BYTES por orçamento; passou, recusa
 *   e diz o que fazer (excluir uma antiga). Nunca apaga sozinho.
 * ⚠ NÃO ATRAVESSA CÓPIA: `revisoes` está em Orcamento.CAMPOS_IA_LOCAIS (copiar
 *   orçamento, criar revisão de aprovado e o _meta do Excel não levam o histórico).
 * ⚠ É RETRATO, NÃO BACKUP: restaurar o orçamento a partir de uma revisão não existe
 *   aqui (só descrição, quantidade e preço, sem composição). Serve para CONFERIR.
 * Motor puro, ES5, Node-testável: tools/test-orcrevisao.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MAX = 10, MAX_BYTES = 150000, DESC_MAX = 90;
  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r4(v) { return Math.round(num(v) * 10000) / 10000; }
  function r2(v) { return Math.round(num(v) * 100) / 100; }
  function rotuloDe(n) { return "R" + (n < 10 ? "0" + n : "" + n); }
  function uid() { return "rev" + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36); }

  var OrcRevisao = { MAX: MAX, MAX_BYTES: MAX_BYTES };

  /* o retrato do orçamento como ele está agora (não grava nada) */
  OrcRevisao.instantaneo = function (orc) {
    var c = Orcamento.calcular(orc), t = Orcamento.totais(orc);
    var etapas = [], idx = {};
    arr(orc && orc.etapas).forEach(function (e, i) { idx[e.id] = i; etapas.push(txt(e.nome)); });
    var linhas = arr(c.linhas).map(function (L) {
      return [txt(L.itemId), idx[L.etapaId] == null ? 0 : idx[L.etapaId], txt(L.numero), txt(L.codigo), txt(L.descricao).slice(0, DESC_MAX),
        txt(L.unidade), r4(L.quantidade), r4(L.custoUnitario), r2(L.precoTotal), r2(L.custoTotal)];
    });
    var b = (orc && orc.bdi) || {};
    return {
      total: r2(t.precoVenda), custoDireto: r2(t.custoDireto), bdi: r2(t.bdiPercentual), bdiModelo: txt(b.modeloId),
      comp: txt(orc && orc.competenciaSinapi), uf: txt(orc && orc.uf), regime: (orc && orc.desonerado) ? "desonerado" : "onerado",
      nItens: linhas.length, etapas: etapas, linhas: linhas
    };
  };

  OrcRevisao.lista = function (orc) { return arr(orc && orc.revisoes); };
  function bytes(o) { try { return JSON.stringify(o).length; } catch (e) { return 0; } }
  OrcRevisao.bytes = function (orc) { return bytes(OrcRevisao.lista(orc)); };

  /* SALVA a revisão: { ok, rev } ou { ok:false, motivo } */
  OrcRevisao.salvar = function (orc, motivo, ctx) {
    ctx = ctx || {};
    var lista = OrcRevisao.lista(orc);
    /* congelar um orçamento aprovado é permitido: o retrato não muda o preço dele */
    if (lista.length >= MAX) return { ok: false, motivo: "O orçamento já tem " + MAX + " revisões guardadas. Exclua uma antiga para guardar outra." };
    var n = 0; lista.forEach(function (r) { if (r.n >= n) n = r.n + 1; });
    var snap = OrcRevisao.instantaneo(orc);
    var rev = { id: uid(), n: n, rotulo: rotuloDe(n), em: txt(ctx.agoraISO), por: txt(ctx.por), motivo: txt(motivo).replace(/^\s+|\s+$/g, "").slice(0, 300),
      auto: !!ctx.auto };
    for (var k in snap) rev[k] = snap[k];
    if (bytes(lista) + bytes(rev) > MAX_BYTES)
      return { ok: false, motivo: "As revisões deste orçamento passariam de " + Math.round(MAX_BYTES / 1000) + " KB (teto para não pesar na nuvem). Exclua uma antiga e tente de novo." };
    if (!orc.revisoes) orc.revisoes = [];
    orc.revisoes.push(rev);
    return { ok: true, rev: rev };
  };

  OrcRevisao.excluir = function (orc, id) {
    var l = OrcRevisao.lista(orc), antes = l.length;
    orc.revisoes = l.filter(function (r) { return r.id !== id; });
    if (!orc.revisoes.length) delete orc.revisoes;
    return antes !== OrcRevisao.lista(orc).length;
  };

  OrcRevisao.obter = function (orc, id) {
    return OrcRevisao.lista(orc).filter(function (r) { return r.id === id; })[0] || null;
  };

  /* COMPARA duas revisões (ou uma revisão e o instantâneo atual). Itens casam pelo id. */
  OrcRevisao.comparar = function (a, b) {
    function mapa(s) { var m = {}; arr(s.linhas).forEach(function (L) { m[L[0]] = L; }); return m; }
    function lin(s, L) {
      return { itemId: L[0], etapa: txt(arr(s.etapas)[L[1]]), numero: L[2], codigo: L[3], descricao: L[4], unidade: L[5], quantidade: L[6], custoUnitario: L[7], preco: L[8], custo: L[9] };
    }
    var ma = mapa(a), mb = mapa(b), inc = [], exc = [], alt = [], k;
    for (k in mb) if (!ma[k]) inc.push(lin(b, mb[k]));
    for (k in ma) {
      if (!mb[k]) { exc.push(lin(a, ma[k])); continue; }
      var x = ma[k], y = mb[k], campos = [];
      if (x[3] !== y[3]) campos.push("código");
      if (x[4] !== y[4]) campos.push("descrição");
      if (x[5] !== y[5]) campos.push("unidade");
      if (Math.abs(x[6] - y[6]) > 0.00005) campos.push("quantidade");
      if (Math.abs(x[7] - y[7]) > 0.00005) campos.push("custo unitário");
      if (!campos.length && Math.abs(x[8] - y[8]) > 0.005) campos.push("preço");   /* BDI ou arredondamento mexeu */
      if (campos.length) alt.push({ item: lin(b, y), antes: lin(a, x), campos: campos, dif: r2(y[8] - x[8]) });
    }
    inc.sort(function (p, q) { return q.preco - p.preco; });
    exc.sort(function (p, q) { return q.preco - p.preco; });
    alt.sort(function (p, q) { return Math.abs(q.dif) - Math.abs(p.dif); });
    var dif = r2(num(b.total) - num(a.total));
    return {
      incluidos: inc, excluidos: exc, alterados: alt,
      totalA: num(a.total), totalB: num(b.total), dif: dif, pct: num(a.total) > 0 ? (dif / num(a.total)) * 100 : null,
      difIncluidos: r2(inc.reduce(function (s, i) { return s + i.preco; }, 0)),
      difExcluidos: r2(-exc.reduce(function (s, i) { return s + i.preco; }, 0)),
      difAlterados: r2(alt.reduce(function (s, i) { return s + i.dif; }, 0)),
      bdiA: num(a.bdi), bdiB: num(b.bdi)
    };
  };

  global.OrcRevisao = OrcRevisao;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcRevisao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

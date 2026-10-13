/* =====================================================================
 * madcatalogo.js — CATÁLOGO DE PRODUTOS da madeira (motor PURO, ES5, sem
 * DOM): madeira serrada, painéis (Evoply, Painel Wall, cimentícia),
 * parafusos, pregos, conectores, membranas, fitas, telhas, vidro —
 * cada item com a página do catálogo de onde saiu, link e, quando houver,
 * o preço do orçamento recebido (com data e fornecedor).
 *
 * ⚠ ARQUIVO GERADO por tools/gerar-madcatalogo.js a partir de
 *   dados-fonte/madeira/catalogos/*.json. Editar o cabeçalho em
 *   js/madcatalogo.cabecalho.js e os dados no JSON; nunca o gerado.
 *
 * REGRAS
 *   · Valor que o catálogo não traz é null — o motor de cálculo trata null
 *     como PENDÊNCIA (nunca como zero nem como "valor típico").
 *   · Preço só vem de orçamento recebido (data + fornecedor). Sem
 *     orçamento → sem preço (o orçamento do sistema mostra "a cotar").
 *   · pset(): parâmetros da FAMÍLIA (BIM/IFC/Revit) — mesmos nomes em todo
 *     o sistema (RA_Produto_*). O que é null não entra no pset.
 * Teste: node tools/test-mad-catalogo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var DADOS = /*__DADOS__*/null;

  var MC = { DADOS: DADOS };
  var ix = {};
  DADOS.produtos.forEach(function (p) { ix[p.id] = p; });

  MC.produto = function (id) { return ix[id] || null; };
  MC.porCategoria = function (cat) { return DADOS.produtos.filter(function (p) { return p.categoria === cat; }); };
  MC.categorias = function () {
    var c = {};
    DADOS.produtos.forEach(function (p) { c[p.categoria] = (c[p.categoria] || 0) + 1; });
    return c;
  };
  MC.fonte = function (p) { return DADOS.fontes[p.catalogo] || null; };

  function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  /** busca por texto em id, linha, nome, aplicação */
  MC.buscar = function (texto) {
    var t = norm(texto).split(/\s+/).filter(Boolean);
    return DADOS.produtos.filter(function (p) {
      var s = norm([p.id, p.linha, p.nome_pt, p.aplicacao, p.categoria].join(" "));
      return t.every(function (w) { return s.indexOf(w) >= 0; });
    });
  };

  /** variante cujo campo = valor (ex.: espessura_mm = 12) */
  MC.variante = function (p, campo, valor) {
    var v = (p && p.variantes) || [];
    for (var i = 0; i < v.length; i++) if (v[i][campo] === valor) return v[i];
    return null;
  };

  /** itens de orçamento recebidos para o produto (mais recente primeiro) */
  MC.precos = function (produtoId) {
    var out = [];
    DADOS.orcamentos.forEach(function (o) {
      o.itens.forEach(function (i) {
        if (i.produtoId === produtoId) out.push({ valorUnit: i.valorUnit, unidade: i.unidade, data: o.data, fornecedor: o.fornecedor,
          orcamento: o.numero, variante: i.variante, descricao: i.descricao, codigo: i.codigo, qtd: i.qtd });
      });
    });
    return out.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  };

  /** acrescenta um orçamento recebido (JSON transcrito: cabecalho + itens) — fora do pacote público; volta o orçamento normalizado */
  MC.adicionarOrcamento = function (j) {
    if (!j || !j.cabecalho || !j.itens) throw new Error("MadCatalogo.adicionarOrcamento: JSON sem cabecalho/itens");
    var c = j.cabecalho, o = { arquivo: j.fonte && j.fonte.arquivo, numero: c.numero_curto || c.numero, data: c.data_inclusao,
      fornecedor: c.emitente && c.emitente.razao_social, frete: c.frete && c.frete.valor, total: c.totais && c.totais.valor_total, condicoes: c.condicoes_pagamento || [],
      itens: j.itens.map(function (i) {
        return { codigo: i.codigo_nibra || i.codigo, descricao: i.descricao, unidade: i.unidade, qtd: i.quantidade, valorUnit: i.valor_unitario,
          total: i.valor_total, entrega: i.data_entrega, produtoId: i.ligacao_catalogo && i.ligacao_catalogo.produto_id,
          variante: i.ligacao_catalogo && i.ligacao_catalogo.variante, obs: i.obs || null };
      }) };
    DADOS.orcamentos = DADOS.orcamentos.filter(function (x) { return String(x.numero) !== String(o.numero); });
    DADOS.orcamentos.push(o);
    return o;
  };

  /** itens de orçamento sem produto no catálogo (ficha técnica a obter) */
  MC.itensSemFicha = function () {
    var out = [];
    DADOS.orcamentos.forEach(function (o) { o.itens.forEach(function (i) { if (!i.produtoId || !ix[i.produtoId]) out.push({ orcamento: o.numero, codigo: i.codigo, descricao: i.descricao }); }); });
    return out;
  };

  /** parâmetros da família (pset RA_Produto_*) — só o que tem valor */
  MC.pset = function (p, variante) {
    if (!p) return {};
    var f = MC.fonte(p) || {}, ps = {};
    function put(k, v) { if (v != null && v !== "") ps[k] = v; }
    put("RA_Produto_Id", p.id);
    put("RA_Produto_Fabricante", f.fabricante);
    put("RA_Produto_Linha", p.linha);
    put("RA_Produto_Nome", p.nome_pt);
    put("RA_Produto_Categoria", p.categoria);
    put("RA_Produto_Material", p.material);
    put("RA_Produto_Revestimento", p.revestimento);
    put("RA_Produto_Aprovacao", p.aprovacao);
    put("RA_Produto_Acionamento", (variante && variante.acionamento) || p.acionamento);
    put("RA_Produto_Catalogo", f.arquivo);
    put("RA_Produto_Pagina", (variante && variante.pagina) || p.pagina);
    put("RA_Produto_Link", p.link || f.site);
    put("RA_Produto_Distribuidor", f.distribuidor_br);
    if (variante) Object.keys(variante).forEach(function (k) {
      if (k === "pagina" || k === "acionamento") return;
      var v = variante[k];
      if (v != null && typeof v !== "object") put("RA_Produto_" + k, v);
    });
    var dt = p.dados_tecnicos || {};
    var d = variante && variante.d_mm != null ? String(variante.d_mm) : null;
    Object.keys(dt).forEach(function (k) {
      if (k === "pagina" || k === "obs" || dt[k] == null) return;
      if (typeof dt[k] !== "object") put("RA_Produto_" + k, dt[k]);
      else if (d != null && dt[k][d] != null) put("RA_Produto_" + k, dt[k][d]);     /* valor por diâmetro (Klimas: My,k, fax,k…) */
    });
    return ps;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MC;
  else global.MadCatalogo = MC;
})(typeof window !== "undefined" ? window : this);

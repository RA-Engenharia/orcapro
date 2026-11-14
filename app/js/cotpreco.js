/* =====================================================================
 * cotpreco.js — PREÇO DE COTAÇÃO DE FORNECEDOR NO ITEM DO ORÇAMENTO (motor)
 *
 * O item do orçamento nasce com o preço de uma base (SINAPI, SEINFRA…). Quando o
 * fornecedor já cotou ou tem catálogo, a pessoa quer usar ESSE preço — sem perder
 * de onde veio o outro. Este módulo:
 *   - junta as ofertas que já existem (cotações com preço válido e catálogo do
 *     fornecedor) numa lista só;
 *   - diz quais casam com o item (código ou descrição, e SEMPRE a mesma unidade);
 *   - aplica o preço no item guardando a ORIGEM em `item.cotacao` (campo opcional:
 *     orçamento sem ele continua igual) e devolve ao preço da base quando a pessoa pede.
 *
 * ⚠ A UNIDADE TEM QUE SER A MESMA. Preço por barra de 6 m num item em metro seria
 *   um erro de dinheiro com cara de economia — recusa, não converte.
 * ⚠ O PREÇO ENTRA PELA PORTA DE SEMPRE (Orcamento.atualizarItem): o selo "alterado
 *   por você" (Ajustes) e a repartição de MO/MAT/EQ funcionam como na edição à mão,
 *   e "voltar ao SINAPI" devolve o valor da BASE (regra 4 do ajustes.js).
 * ⚠ Frete e condição de pagamento da cotação NÃO entram: é o preço unitário do
 *   item. Quem compara frete é o Mapa de Cotação.
 * ⚠ Item `modoCusto: "mo"` (só mão de obra) recusa: preço de fornecedor é de material.
 * ⚠ Preço mexido à mão depois da cotação apaga o carimbo (Orcamento.atualizarItem);
 *   preço mexido por outro caminho deixa o carimbo "vencido" — `vigente` confere.
 * Motor puro: não toca em DOM nem em Store; a tela é js/orcprecosui.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function semAcento(s) { s = txt(s); try { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { return s; } }
  function chave(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function un(s) { return semAcento(txt(s)).toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[^a-z0-9]/g, ""); }
  function cod(s) { var c = txt(s).replace(/^\s+|\s+$/g, "").toLowerCase(); return (c === "—" || c === "-") ? "" : c; }
  function COT() { return global.Cotacoes || (typeof require === "function" ? require("./cotacoes.js") : null); }

  var CotPreco = {};

  /* TODAS as ofertas que existem. cotacoes: lista de cotações; catalogo: itens PROPRIA com fornecedorRef. */
  CotPreco.ofertas = function (cotacoes, catalogo) {
    var out = [], C = COT();
    arr(cotacoes).forEach(function (cot) {
      if (!cot || !C) return;
      arr(cot.itens).forEach(function (it, i) {
        arr(cot.fornecedores).forEach(function (fr, f) {
          var p = C.preco(cot, i, f);
          if (p == null || !(p > 0)) return;
          out.push({
            origem: "cotacao", cotacaoId: txt(cot.id), numero: txt(cot.numero), data: txt(cot.data).slice(0, 10), status: txt(cot.status),
            fornecedorId: txt(fr.fornecedorId), fornecedor: txt(fr.nome) || ("Fornecedor " + (f + 1)),
            codigo: txt(it.codigo), descricao: txt(it.descricao), unidade: txt(it.unidade), preco: r2(p)
          });
        });
      });
    });
    arr(catalogo).forEach(function (d) {
      if (!d || !d.fornecedorRef || d.foraDoCatalogoDesde) return;
      if (txt(d.tipoItem || "insumo") !== "insumo") return;
      var p = num(d.custoUnitario);
      if (!(p > 0)) return;
      out.push({
        origem: "catalogo", cotacaoId: "", numero: "", data: txt(d.precoData).slice(0, 10), status: "",
        fornecedorId: txt(d.fornecedorRef.id), fornecedor: txt(d.fornecedorRef.nome),
        codigo: txt(d.codigo), descricao: txt(d.descricao), unidade: txt(d.unidade), preco: r2(p)
      });
    });
    return out;
  };

  /* como a oferta casa com o item: "codigo" | "descricao" | "" ; `mesmaUnidade` vai à parte */
  CotPreco.casa = function (item, of) {
    var por = "";
    if (cod(item.codigo) && cod(item.codigo) === cod(of.codigo)) por = "codigo";
    else if (chave(item.descricao) && chave(item.descricao) === chave(of.descricao)) por = "descricao";
    return { por: por, mesmaUnidade: un(item.unidade) === un(of.unidade) };
  };

  /* ofertas que servem ao item (casam e têm a mesma unidade): mais barata primeiro, empate = mais recente */
  CotPreco.sugeridas = function (item, ofertas) {
    var lista = [];
    arr(ofertas).forEach(function (of) {
      var c = CotPreco.casa(item, of);
      if (c.por && c.mesmaUnidade) lista.push(of);
    });
    lista.sort(function (a, b) { return (a.preco - b.preco) || (a.data < b.data ? 1 : a.data > b.data ? -1 : 0); });
    return lista;
  };

  /* o carimbo só vale se o preço do item ainda é o cotado */
  CotPreco.vigente = function (item) {
    return !!(item && item.cotacao && Math.abs(num(item.custoUnitario) - num(item.cotacao.preco)) < 0.005);
  };

  function achar(orc, etapaId, itemId) {
    var e = arr(orc && orc.etapas).filter(function (x) { return x.id === etapaId; })[0];
    var it = e && arr(e.itens).filter(function (x) { return x.id === itemId; })[0];
    return it || null;
  }

  function dia(iso) { var s = txt(iso).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s; }
  CotPreco.rotulo = function (c) {
    if (!c) return "";
    return (c.fornecedor || "Fornecedor") + (c.origem === "cotacao" ? ", cotação " + (c.numero || "") : ", catálogo") + (c.data ? ", " + dia(c.data) : "");
  };

  /* APLICA a oferta ao item. Devolve { ok, motivo?, preco?, antes? } — nunca lança. */
  CotPreco.aplicar = function (orc, etapaId, itemId, of, ctx) {
    ctx = ctx || {};
    var it = achar(orc, etapaId, itemId);
    if (!it) return { ok: false, motivo: "Item não encontrado." };
    if (global.Orcamento && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc))
      return { ok: false, motivo: "Orçamento aprovado não muda o preço. Crie uma revisão." };
    var p = r2(num(of && of.preco));
    if (!(p > 0)) return { ok: false, motivo: "A oferta não tem preço válido." };
    if (it.modoCusto === "mo") return { ok: false, motivo: "Este item cobra só mão de obra; preço de fornecedor é de material." };
    if (un(it.unidade) !== un(of.unidade))
      return { ok: false, motivo: "Unidade diferente (item em " + txt(it.unidade) + ", oferta em " + txt(of.unidade) + "). O preço não é comparável." };
    /* o preço de ANTES da primeira cotação é o que "voltar" devolve quando a base não o guardou */
    var antes = it.cotacao && it.cotacao.antes != null ? num(it.cotacao.antes) : num(it.custoUnitario);
    Orcamento.atualizarItem(orc, etapaId, itemId, { custoUnitario: p });
    /* `atualizarItem` apaga o carimbo antigo quando o preço muda; grava o novo */
    it.cotacao = {
      origem: of.origem === "catalogo" ? "catalogo" : "cotacao",
      cotacaoId: txt(of.cotacaoId), numero: txt(of.numero), data: txt(of.data).slice(0, 10),
      fornecedorId: txt(of.fornecedorId), fornecedor: txt(of.fornecedor),
      preco: p, antes: antes, em: txt(ctx.agoraISO), por: txt(ctx.por)
    };
    try {
      if (it.ajustes && it.ajustes.custoUnitario) it.ajustes.custoUnitario.motivo = "Preço de " + CotPreco.rotulo(it.cotacao);
    } catch (e) {}
    return { ok: true, preco: p, antes: antes };
  };

  /* VOLTA ao preço da base: o valor que o Ajustes guardou da base, ou o de antes da cotação */
  CotPreco.voltar = function (orc, etapaId, itemId) {
    var it = achar(orc, etapaId, itemId);
    if (!it || !it.cotacao) return { ok: false, motivo: "Este item não tem preço de cotação." };
    if (global.Orcamento && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc))
      return { ok: false, motivo: "Orçamento aprovado não muda o preço. Crie uma revisão." };
    var base = null;
    if (global.Ajustes && Ajustes.restaurar && it.ajustes && it.ajustes.custoUnitario) base = Ajustes.restaurar(it, "custoUnitario");
    if (base == null) base = num(it.cotacao.antes);
    var antesU = num(it.custoUnitario);
    it.custoUnitario = base;
    try { Orcamento.repartirParcelas(it, base, Orcamento.garantirConfig(orc).arredondamento, antesU); } catch (e) {}
    delete it.cotacao;
    return { ok: true, preco: base };
  };

  /* O RELATÓRIO: um registro por item com preço de cotação VIGENTE */
  CotPreco.resumo = function (orc) {
    var linhas = [], total = 0;
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e.itens).forEach(function (it) {
        if (!CotPreco.vigente(it)) return;
        var c = it.cotacao, q = num(it.quantidade), imp = r2((num(c.preco) - num(c.antes)) * q);
        total += imp;
        linhas.push({
          etapaId: e.id, etapa: txt(e.nome), itemId: it.id, codigo: txt(it.codigo), descricao: txt(it.descricao), unidade: txt(it.unidade),
          quantidade: q, preco: num(c.preco), antes: num(c.antes), impacto: imp,
          fornecedor: txt(c.fornecedor), data: txt(c.data), numero: txt(c.numero), origem: txt(c.origem), rotulo: CotPreco.rotulo(c)
        });
      });
    });
    return { n: linhas.length, linhas: linhas, impacto: r2(total) };
  };

  global.CotPreco = CotPreco;
  if (typeof module !== "undefined" && module.exports) module.exports = CotPreco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

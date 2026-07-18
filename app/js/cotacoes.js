/* OrçaPRO — Cotações (Mapa de Cotação de Compras) — motor puro, Node-testável
 *
 * Compara fornecedores item a item numa cotação de compra:
 *  - vencedor por ITEM (menor preço unitário válido; empate → fornecedor de menor total)
 *  - vencedor ÚNICO (menor total geral entre fornecedores que cotaram TODOS os itens)
 *  - cenário MISTO (comprar cada item do mais barato) e a economia entre cenários
 *  - geração dos pedidos de compra (agrupados por fornecedor vencedor)
 *
 * Honestidade RA: item sem preço num fornecedor NÃO participa daquele fornecedor;
 * fornecedor que não cotou tudo NUNCA vence como único (compraria com buraco);
 * economia declarada só quando os dois cenários são comparáveis. Nada estimado.
 */
(function (global) {
  "use strict";

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }

  var Cotacoes = {

    /* estrutura nova (a view completa obraId/numero/datas) */
    novo: function () {
      return { itens: [], fornecedores: [], status: "rascunho" };
      // item:       { codigo?, descricao, unidade, quantidade, precoRef? }
      // fornecedor: { fornecedorId?, nome, frete?, prazoDias?, condPgto?, precos: { [itemIdx]: precoUnit } }
    },

    /* preço unitário válido do fornecedor f para o item i (null = não cotou) */
    preco: function (cot, i, f) {
      var fr = (cot.fornecedores || [])[f]; if (!fr || !fr.precos) return null;
      var p = fr.precos[i];
      if (p == null || p === "") return null;
      p = num(p);
      return p > 0 ? p : null;
    },

    /* totais por fornecedor: subtotal só dos itens cotados, frete, total e completude */
    totais: function (cot) {
      var itens = cot.itens || [], self = this;
      return (cot.fornecedores || []).map(function (fr, f) {
        var sub = 0, cotados = 0;
        itens.forEach(function (it, i) {
          var p = self.preco(cot, i, f);
          if (p != null) { sub += r2(num(it.quantidade) * p); cotados++; } // parcela a 2 casas (mesma régua dos pedidos)
        });
        return { nome: fr.nome || ("Fornecedor " + (f + 1)), subtotal: r2(sub), frete: r2(num(fr.frete)), total: r2(sub + num(fr.frete)), cotados: cotados, completo: itens.length > 0 && cotados === itens.length };
      });
    },

    /* vencedor por item: menor preço; empate → fornecedor de menor total geral */
    melhorPorItem: function (cot) {
      var tot = this.totais(cot), self = this;
      return (cot.itens || []).map(function (it, i) {
        var melhor = null;
        (cot.fornecedores || []).forEach(function (_fr, f) {
          var p = self.preco(cot, i, f);
          if (p == null) return;
          if (!melhor || p < melhor.preco || (p === melhor.preco && tot[f].total < tot[melhor.fornecedorIdx].total)) melhor = { fornecedorIdx: f, preco: p };
        });
        return melhor; // null = ninguém cotou este item
      });
    },

    /* decisão: cenário único × misto (+ economia declarada só quando comparável) */
    decisao: function (cot) {
      var tot = this.totais(cot);
      var porItem = this.melhorPorItem(cot);
      var itens = cot.itens || [];

      // vencedor único: menor total entre COMPLETOS (null-check explícito: índice 0 é falsy!)
      var unico = null;
      tot.forEach(function (t, f) { if (t.completo && (unico === null || t.total < tot[unico].total)) unico = f; });

      // misto: todo item precisa ter ao menos um preço
      var mistoCompleto = itens.length > 0 && porItem.every(function (m) { return !!m; });
      var totalMisto = null;
      if (mistoCompleto) {
        var soma = 0, fretes = {};
        itens.forEach(function (it, i) {
          var m = porItem[i];
          soma += r2(num(it.quantidade) * m.preco); // parcela a 2 casas (mesma régua dos pedidos)
          fretes[m.fornecedorIdx] = 1;
        });
        Object.keys(fretes).forEach(function (f) { soma += num((cot.fornecedores[f] || {}).frete); });
        totalMisto = r2(soma);
      }

      var economia = (unico != null && totalMisto != null) ? r2(tot[unico].total - totalMisto) : null;
      return {
        totais: tot,
        porItem: porItem,
        vencedorUnico: unico,                 // idx do fornecedor ou null
        totalUnico: unico != null ? tot[unico].total : null,
        mistoCompleto: mistoCompleto,
        totalMisto: totalMisto,
        economiaMisto: economia               // >0 = misto economiza; null = não comparável
      };
    },

    /* pedidos de compra do cenário escolhido ('unico' | 'misto') —
       cada pedido: { fornecedorIdx, itens:[{...item, valorUnit, subtotal}], frete, total } */
    pedidos: function (cot, modo) {
      if (modo !== "unico" && modo !== "misto") return []; // modo desconhecido: explícito, nunca silencioso
      var d = this.decisao(cot), itens = cot.itens || [], self = this, grupos = {};
      if (modo === "unico") {
        if (d.vencedorUnico == null) return [];
        var f0 = d.vencedorUnico;
        grupos[f0] = itens.map(function (it, i) { return { item: it, itemIdx: i, preco: self.preco(cot, i, f0) }; });
      } else {
        if (!d.mistoCompleto) return [];
        itens.forEach(function (it, i) {
          var m = d.porItem[i];
          (grupos[m.fornecedorIdx] = grupos[m.fornecedorIdx] || []).push({ item: it, itemIdx: i, preco: m.preco });
        });
      }
      return Object.keys(grupos).map(function (fIdx) {
        var fr = cot.fornecedores[fIdx] || {};
        var its = grupos[fIdx].map(function (g) {
          var sub = r2(num(g.item.quantidade) * g.preco);
          return { codigo: g.item.codigo || "", descricao: g.item.descricao, unidade: g.item.unidade, quantidade: num(g.item.quantidade), valorUnit: g.preco, precoRef: g.preco, itemIdx: g.itemIdx, subtotal: sub };
        });
        var soma = r2(its.reduce(function (s, x) { return s + x.subtotal; }, 0));
        return { fornecedorIdx: +fIdx, fornecedorId: fr.fornecedorId || null, fornecedorNome: fr.nome || "", condPgto: fr.condPgto || "", prazoDias: fr.prazoDias != null ? num(fr.prazoDias) : null, itens: its, frete: r2(num(fr.frete)), total: r2(soma + num(fr.frete)) };
      });
    },

    /* economia contra o preço de referência do banco/orçamento (quando os itens têm precoRef) */
    economiaVsReferencia: function (cot, modo) {
      var itens = cot.itens || [];
      var comRef = itens.filter(function (it) { return num(it.precoRef) > 0; });
      if (!comRef.length) return null;
      var peds = this.pedidos(cot, modo);
      if (!peds.length) return null;
      var pago = 0, refe = 0, cobertos = 0;
      peds.forEach(function (p) {
        p.itens.forEach(function (x) {
          // casa pelo ÍNDICE do item original (descrições repetidas não se contaminam;
          // item sem precoRef fica FORA da comparação — nada estimado)
          var orig = itens[x.itemIdx];
          if (orig && num(orig.precoRef) > 0) { pago += x.subtotal; refe += num(orig.precoRef) * x.quantidade; cobertos++; }
        });
      });
      if (!cobertos) return null;
      return { itensComparados: cobertos, totalPago: r2(pago), totalReferencia: r2(refe), economia: r2(refe - pago) };
    },

    validar: function (cot) {
      var erros = [];
      if (!cot || !Array.isArray(cot.itens) || !cot.itens.length) erros.push("Inclua ao menos 1 item.");
      else cot.itens.forEach(function (it, i) {
        if (!it.descricao) erros.push("Item " + (i + 1) + " sem descrição.");
        if (!(num(it.quantidade) > 0)) erros.push("Item " + (i + 1) + " com quantidade inválida.");
      });
      if (!cot || !Array.isArray(cot.fornecedores) || cot.fornecedores.length < 1) erros.push("Inclua ao menos 1 fornecedor.");
      else cot.fornecedores.forEach(function (fr, f) {
        if (!fr.nome) erros.push("Fornecedor " + (f + 1) + " sem nome.");
        if (num(fr.frete) < 0) erros.push("Fornecedor " + (f + 1) + " com frete negativo.");
        Object.keys(fr.precos || {}).forEach(function (k) {
          if (!(Number(k) >= 0) || Number(k) >= (cot.itens || []).length) return; // chave órfã (item removido): inerte no motor, não acusa
          var p = fr.precos[k];
          if (p != null && p !== "" && !(num(p) > 0)) erros.push("Preço inválido no fornecedor " + (f + 1) + ", item " + (Number(k) + 1) + ".");
        });
      });
      return erros;
    }
  };

  global.Cotacoes = Cotacoes;
  if (typeof module !== "undefined" && module.exports) module.exports = Cotacoes;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * compranota.js — VINCULAR A NOTA FISCAL AO PEDIDO DE COMPRA, para o mesmo
 * material não virar duas despesas.
 *
 * O QUE ACONTECIA (relato da VLC Engenharia): você recebe a compra e o
 * sistema lança a despesa. Depois chega a nota daquela mesma compra, você
 * lança, e o sistema lança OUTRA. O Financeiro fica com o dobro, e ainda por
 * valores diferentes — porque na hora da compra deram desconto.
 *
 * ⚠ O VÍNCULO NUNCA SE FAZ SOZINHO. Este motor SUGERE candidatos e diz por
 *   que sugeriu; quem decide é a pessoa. Casar automático por "mesmo
 *   fornecedor e valor parecido" é mover dinheiro por adivinhação, e um
 *   palpite errado aqui apaga a despesa de uma compra que não é essa.
 *
 * ⚠ E A DESPESA DA COMPRA É APAGADA, NÃO "CANCELADA".
 *   Marcar como cancelado parece mais conservador e é pior: `PorObra.totais`
 *   soma `r.despesa += v` SEM olhar o status (js/porobra.js:118). Esse total
 *   alimenta o cabeçalho do Financeiro, o quadro por obra, o relatório mensal
 *   que vai à diretoria e ao cliente, o centro de custo e o Previsto ×
 *   Realizado. Uma linha "cancelada" continuaria dobrando a despesa em todos
 *   eles — a queixa do cliente inteira, com uma etiqueta cinza ao lado.
 *   Que isso é lacuna e não escolha, o mesmo arquivo prova: em COMPRAS ele
 *   descarta `cancelado` (js/porobra.js:186); em financeiro, não.
 *   Apagar é também o que o app já faz com as parcelas da própria nota ao
 *   relançar. O histórico não se perde: mora no pedido e na nota, que são os
 *   documentos — e é de lá que a linha nasceu.
 *
 * ⚠ DESPESA JÁ PAGA NÃO SE TOCA. Se o pedido já foi pago, o vínculo é
 *   RECUSADO — e recusado é a resposta certa, não um meio-termo. O caminho
 *   "vincula mas não apaga" gravaria a nota inteira por cima do pagamento e
 *   reproduziria a duplicata justamente onde o dinheiro já saiu.
 * ===================================================================== */
(function (global) {
  "use strict";

  var DIAS_JANELA = 60;

  function txt(x) { return String(x == null ? "" : x).trim(); }
  function chave(x) {
    return txt(x).toLowerCase()
      .replace(/[àáâãä]/g, "a").replace(/[éêë]/g, "e").replace(/[íï]/g, "i")
      .replace(/[óôõö]/g, "o").replace(/[úü]/g, "u").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
  function dias(a, b) {
    var ta = Date.parse(a), tb = Date.parse(b);
    if (isNaN(ta) || isNaN(tb)) return null;
    return Math.round((tb - ta) / 86400000);
  }

  /* A despesa que o recebimento da compra gerou. Reconhecida pelo carimbo
     `docTipo:"PC"` + `docId`. Sem carimbo (lançamento antigo), devolve null —
     o backfill é oferecido à parte, e sempre com confirmação. */
  function despesaDaCompra(financeiro, compraId) {
    var id = txt(compraId); if (!id) return null;
    var achou = null;
    (financeiro || []).forEach(function (f) {
      if (!f || achou) return;
      if (txt(f.docTipo) !== "PC" || txt(f.docId) !== id) return;
      /* ⚠ o espelho de estorno copia fornecedor/obra/categoria mas é OUTRO
         lançamento (um crédito). Carimbá-lo ou apagá-lo ressuscitaria a
         despesa que o estorno tinha anulado. */
      if (f.estornoDe) return;
      achou = f;
    });
    return achou;
  }

  /* Candidato SEM carimbo, para o backfill: casa pela descrição que o próprio
     app escreveu, ancorada NO COMEÇO — "contains" pegaria o espelho de estorno
     ("Estorno — Compra PC-0007 …"). Empate nunca escolhe: devolve nada. */
  function despesaAntigaDaCompra(financeiro, compra) {
    var pre = "Compra " + txt(compra && compra.numero) + " — ";
    if (!txt(compra && compra.numero)) return null;
    var achados = (financeiro || []).filter(function (f) {
      return f && !f.estornoDe && !f.docTipo && txt(f.tipo) === "despesa"
        && txt(f.desc).indexOf(pre) === 0;
    });
    return achados.length === 1 ? achados[0] : null;
  }

  /* Pedidos que PODEM ser a origem desta nota, do mais forte ao mais fraco.
     Nenhum vem marcado: a lista é sugestão, não decisão. */
  function candidatos(nf, compras, hoje) {
    nf = nf || {};
    var xped = {};
    (nf.itens || []).forEach(function (it) {
      var p = chave(it && it.pedido); if (p) xped[p] = 1;
    });
    var forn = chave(nf.parceiro), ref = txt(hoje) || txt(nf.dataEmissao);
    var out = [];
    (compras || []).forEach(function (c) {
      if (!c || txt(c.status) !== "recebido") return;
      if (txt(c.notaId)) return;                      // já vinculado a outra nota
      var motivo = "", forca = 0;
      if (xped[chave(c.numero)]) {
        motivo = "o fornecedor citou este pedido na nota (xPed)"; forca = 3;
      } else if (forn && chave(c.fornecedorNome) === forn) {
        var d = dias(c.dataRecebimento, ref);
        if (d != null && d >= -DIAS_JANELA && d <= DIAS_JANELA) {
          motivo = "mesmo fornecedor, recebido " + (d === 0 ? "hoje" : (Math.abs(d) + " dia(s) " + (d > 0 ? "antes" : "depois"))); forca = 2;
        }
      }
      if (!forca) return;
      out.push({ compraId: c.id, numero: txt(c.numero), valor: num(c.valor),
        fornecedor: txt(c.fornecedorNome), obraId: txt(c.obraId),
        dataRecebimento: txt(c.dataRecebimento), motivo: motivo, forca: forca });
    });
    out.sort(function (a, b) {
      return (b.forca - a.forca) || (b.valor - a.valor) ||
        (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0);
    });
    return out;
  }

  /* O que vai acontecer se este vínculo for confirmado — em texto que a
     pessoa lê ANTES de gravar. `pode:false` é recusa, não aviso. */
  function plano(compra, despesaPC, totalNota) {
    var r = { pode: false, motivo: "", acao: "", apagarId: null,
      valorPedido: num(compra && compra.valor), valorNota: num(totalNota),
      dif: 0, difPct: 0, avisos: [] };
    if (!compra) { r.motivo = "Escolha o pedido."; return r; }
    if (txt(compra.status) !== "recebido") {
      r.motivo = "O pedido " + txt(compra.numero) + " ainda não foi recebido — vincule depois do recebimento."; return r;
    }
    if (txt(compra.notaId)) {
      r.motivo = "O pedido " + txt(compra.numero) + " já está vinculado a outra nota."; return r;
    }
    r.dif = r.valorNota - r.valorPedido;
    r.difPct = r.valorPedido > 0 ? (r.dif / r.valorPedido) * 100 : 0;

    if (!despesaPC) {
      /* recebimento antigo, sem carimbo, ou despesa já removida à mão: o
         vínculo documental ainda vale — só não há o que substituir */
      r.pode = true; r.acao = "vincular";
      r.avisos.push("Não achei a despesa deste pedido no Financeiro. Vou vincular os documentos e lançar a nota; confira se sobrou algum lançamento antigo da compra para apagar à mão.");
      return r;
    }
    if (txt(despesaPC.status) === "pago") {
      r.motivo = "A despesa do pedido " + txt(compra.numero) + " já foi PAGA ("
        + r.valorPedido.toFixed(2).replace(".", ",") + "). Não mexo em pagamento: estorne o pagamento antes de vincular, ou lance só a diferença.";
      return r;
    }
    r.pode = true; r.acao = "substituir"; r.apagarId = despesaPC.id;
    if (Math.abs(r.dif) >= 0.01) {
      r.avisos.push("O pedido era " + r.valorPedido.toFixed(2).replace(".", ",")
        + " e a nota veio " + r.valorNota.toFixed(2).replace(".", ",")
        + " (" + (r.dif > 0 ? "+" : "") + r.dif.toFixed(2).replace(".", ",")
        + ", " + (r.difPct > 0 ? "+" : "") + r.difPct.toFixed(1).replace(".", ",") + "%).");
    }
    return r;
  }

  /* Desfazer: devolve a despesa do pedido ao Financeiro, do jeito que ela era.
     Chamado TAMBÉM por "Desfazer lançamento" e por "Excluir nota" — são portas
     anteriores que chegam no mesmo estado, e se elas apagarem as parcelas da
     nota sem restaurar isto, a compra recebida fica com ZERO despesa viva. */
  function despesaARestaurar(compra) {
    if (!compra || !compra.despesaSubstituida) return null;
    var d = compra.despesaSubstituida, o = {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) o[k] = d[k];
    delete o.id;                       // renasce como linha nova
    return o;
  }

  global.CompraNota = {
    candidatos: candidatos, plano: plano,
    despesaDaCompra: despesaDaCompra, despesaAntigaDaCompra: despesaAntigaDaCompra,
    despesaARestaurar: despesaARestaurar,
    _chave: chave, DIAS_JANELA: DIAS_JANELA
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.CompraNota;
})(typeof window !== "undefined" ? window : globalThis);

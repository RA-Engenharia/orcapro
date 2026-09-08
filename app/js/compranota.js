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
  function cent(v) { return Math.round(num(v) * 100) / 100; }
  function reais(v) { return cent(v).toFixed(2).replace(".", ","); }
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


  /* =================================================================
   * UMA NOTA COBRE VARIOS PEDIDOS; UM PEDIDO VEM EM VARIAS NOTAS
   *
   * ⚠ MEDIDO EM 07/09/2026. O vínculo era UM CAMPO de cada lado
   * (`nf.compraId` / `pc.notaId`), e os dois arranjos mais comuns de obra
   * não cabiam nele — sem aviso e sem alternativa:
   *
   *   · UMA NOTA, DOIS PEDIDOS — o fornecedor junta duas entregas numa nota
   *     só. A tela deixava escolher um: a despesa DELE saía, entravam as
   *     parcelas da nota INTEIRA (que cobre os dois), e a despesa do segundo
   *     pedido continuava viva. O mesmo material contava duas vezes — a
   *     duplicata que este arquivo existe para impedir — e a única coisa que
   *     a tela dizia era que a nota estava "acima do pedido", o que a pessoa
   *     confirma porque é verdade.
   *
   *   · UM PEDIDO, DUAS NOTAS — faturamento parcial, o normal em entrega
   *     parcelada. Na segunda nota o pedido não aparecia em lista nenhuma
   *     (`if (txt(c.notaId)) return`), sem uma palavra dizendo por quê. E
   *     DESFAZER a primeira nota devolvia a despesa CHEIA do pedido com a
   *     segunda ainda lançada — duplicata de novo, agora pela porta do
   *     Desfazer.
   *
   * A verdade do faturamento passou a ser uma LISTA nos dois lados
   * (`pc.notas` / `nf.compras`), cada linha com a fatia que aquela nota cobre
   * daquele pedido. Os campos antigos continuam existindo como o PRIMEIRO da
   * lista, porque várias telas os leem; quem escreve os dois lados é só
   * `aplicarVinculo` / `desfazerVinculo`, para eles nunca discordarem.
   * ================================================================= */
  function lista(x) { return Array.isArray(x) ? x : []; }

  /* as notas que faturam este pedido, com a fatia de cada uma */
  function notasDoPedido(pc) {
    if (!pc) return [];
    var arr = lista(pc.notas).filter(function (n) { return n && txt(n.id); });
    if (arr.length) {
      return arr.map(function (n) {
        return { id: txt(n.id), numero: txt(n.numero), valor: num(n.valor), em: txt(n.em) };
      });
    }
    /* vínculo antigo (um campo só) vira uma fatia: o resto do motor não
       precisa saber que existiram dois formatos */
    if (txt(pc.notaId)) {
      return [{ id: txt(pc.notaId), numero: txt(pc.notaNumero), valor: num(pc.valorFaturado), em: txt(pc.vinculadoEm) }];
    }
    return [];
  }

  function pedidosDaNota(nf) {
    if (!nf) return [];
    var arr = lista(nf.compras).filter(function (c) { return c && txt(c.id); });
    if (arr.length) {
      return arr.map(function (c) { return { id: txt(c.id), numero: txt(c.numero), valor: num(c.valor) }; });
    }
    if (txt(nf.compraId)) return [{ id: txt(nf.compraId), numero: txt(nf.compraNumero), valor: num(nf.valorTotal) }];
    return [];
  }

  function faturado(pc) {
    return cent(notasDoPedido(pc).reduce(function (a, n) { return a + num(n.valor); }, 0));
  }
  function saldoDoPedido(pc) {
    var s = num(pc && pc.valor) - faturado(pc);
    return s > 0.005 ? cent(s) : 0;
  }

  /* ⚠ VÍNCULO ANTIGO SEM VALOR FATURADO fica de fora: `valorFaturado` vazio
     é o vínculo só documental (vinculado sem lançar), e sem saber quanto a
     primeira nota cobriu, oferecer a segunda seria convidar a faturar duas
     vezes o mesmo pedido. Para esses o caminho é desfazer e refazer. */
  function podeReceberNota(c) {
    if (!notasDoPedido(c).length) return true;
    if (!(faturado(c) > 0)) return false;
    return saldoDoPedido(c) >= 0.01;
  }

  /* ⚠ RATEIO PELO SALDO, NÃO PELO VALOR CHEIO: com um dos pedidos já
     faturado pela metade, ratear pelo valor daria fatia demais a ele e de
     menos ao outro — e a fatia é o que o Desfazer devolve depois. */
  function ratear(pedidos, total) {
    var ps = lista(pedidos), t = cent(total);
    if (!ps.length) return [];
    var bases = ps.map(function (p) { return saldoDoPedido(p); });
    var soma = bases.reduce(function (a, b) { return a + b; }, 0);
    /* sem base nenhuma (pedidos sem valor) divide em partes iguais — inventar
       proporção onde não há número seria pior que dividir igual */
    if (!(soma > 0)) { bases = ps.map(function () { return 1; }); soma = ps.length; }
    var out = [], acc = 0, i;
    for (i = 0; i < ps.length; i++) {
      /* o último fecha a conta: senão a soma das fatias arredondadas fica um
         centavo longe do total da nota, e esse centavo vira diferença eterna */
      var v = (i === ps.length - 1) ? cent(t - acc) : cent(t * bases[i] / soma);
      acc = cent(acc + v);
      out.push(v);
    }
    return out;
  }

  /* O que vai acontecer com CADA pedido escolhido, em texto que a pessoa lê
     antes de gravar. `pode:false` recusa a operação INTEIRA: meia
     substituição deixaria uma despesa apagada e outra viva. */
  function planoVinculo(nf, pedidos, financeiro, totalNota) {
    var ps = lista(pedidos).filter(Boolean);
    var r = { pode: false, motivo: "", acao: "", itens: [], avisos: [],
      valorNota: cent(totalNota), jaAlocado: 0, disponivel: 0,
      somaSaldos: 0, dif: 0, difPct: 0 };
    var doNf = pedidosDaNota(nf);
    r.jaAlocado = cent(doNf.reduce(function (a, c) { return a + num(c.valor); }, 0));
    r.disponivel = cent(r.valorNota - r.jaAlocado);
    if (!ps.length) {
      r.motivo = "Escolha pelo menos um pedido — ou feche a caixa, se esta nota não é de pedido nenhum.";
      return r;
    }
    /* ⚠ nota já inteira em outros pedidos: acrescentar mais um obrigaria a
       refazer o rateio do que já está gravado, mexendo em vínculo que a pessoa
       não está vendo. Recusa dizendo onde a nota está e como redistribuir. */
    if (doNf.length && r.disponivel < 0.01) {
      r.motivo = "Esta nota já está inteira no(s) pedido(s) " + doNf.map(function (c) { return c.numero || c.id; }).join(", ")
        + " (" + reais(r.jaAlocado) + " de " + reais(r.valorNota) + "). Para redistribuir, desfaça o vínculo primeiro.";
      return r;
    }
    var fatias = ratear(ps, r.disponivel), erro = "", i;
    for (i = 0; i < ps.length; i++) {
      var pc = ps[i], jaNota = notasDoPedido(pc), nesta = false, j;
      for (j = 0; j < jaNota.length; j++) { if (txt(jaNota[j].id) === txt(nf && nf.id)) nesta = true; }
      if (txt(pc.status) !== "recebido") {
        erro = "O pedido " + txt(pc.numero) + " ainda não foi recebido — vincule depois do recebimento."; break;
      }
      if (nesta) { erro = "O pedido " + txt(pc.numero) + " já está nesta nota."; break; }
      if (jaNota.length && !podeReceberNota(pc)) {
        erro = "O pedido " + txt(pc.numero) + " já está vinculado a outra nota"
          + (faturado(pc) > 0 ? " e não tem saldo a faturar (" + reais(faturado(pc)) + " de " + reais(num(pc.valor)) + ")."
             : " sem valor faturado — desfaça aquele vínculo antes de refazer, senão o mesmo pedido é faturado duas vezes.");
        break;
      }
      var desp = despesaDaCompra(financeiro, pc.id);
      if (desp && txt(desp.status) === "pago") {
        erro = "A despesa do pedido " + txt(pc.numero) + " já foi PAGA (" + reais(num(pc.valor))
          + "). Não mexo em pagamento: estorne o pagamento antes de vincular, ou lance só a diferença.";
        break;
      }
      var it = { compraId: txt(pc.id), numero: txt(pc.numero), valor: num(pc.valor),
        jaFaturado: faturado(pc), saldo: saldoDoPedido(pc), fatia: fatias[i],
        apagarId: desp ? desp.id : null, parcial: jaNota.length > 0 };
      /* ⚠ na SEGUNDA nota do mesmo pedido a despesa dele já saiu na primeira:
         não há o que apagar, e avisar "não achei a despesa" ali seria recado
         que mente. O `despesaSubstituida` guardado lá continua sendo o que
         volta quando a ÚLTIMA nota do pedido for desfeita. */
      if (!desp && !it.parcial) {
        r.avisos.push("Não achei a despesa do pedido " + txt(pc.numero) + " no Financeiro. Vou vincular os documentos assim mesmo; confira se sobrou algum lançamento antigo da compra para apagar à mão.");
      }
      r.somaSaldos = cent(r.somaSaldos + it.saldo);
      r.itens.push(it);
    }
    if (erro) { r.motivo = erro; r.itens = []; return r; }
    r.pode = true;
    r.acao = r.itens.filter(function (x) { return x.apagarId; }).length ? "substituir" : "vincular";
    r.dif = cent(r.disponivel - r.somaSaldos);
    r.difPct = r.somaSaldos > 0 ? (r.dif / r.somaSaldos) * 100 : 0;
    if (Math.abs(r.dif) >= 0.01) {
      r.avisos.push((ps.length > 1
          ? "Os " + ps.length + " pedidos somam " + reais(r.somaSaldos)
          : "O pedido era " + reais(r.somaSaldos))
        + " e a nota veio " + reais(r.disponivel)
        + " (" + (r.dif > 0 ? "+" : "") + reais(r.dif)
        + ", " + (r.difPct > 0 ? "+" : "") + cent(r.difPct).toFixed(1).replace(".", ",") + "%).");
      /* ⚠ NOTA MENOR QUE O PEDIDO NÃO É SÓ UMA DIFERENÇA: a despesa do pedido
         sai inteira e entram só as parcelas da nota, então o custo da obra CAI
         pelo que ainda não foi faturado. Isso é correto (a segunda nota
         completa depois), mas calar sobre ele faz o relatório da obra parecer
         mais barato do que é sem ninguém saber por quê. */
      if (r.dif < 0) {
        r.avisos.push("Ficam " + reais(-r.dif) + " a faturar no(s) pedido(s): até a próxima nota chegar, o custo da obra mostra só o que foi faturado.");
      }
    }
    return r;
  }

  /* =================================================================
   * VÍNCULO FEITO SEM LANÇAR — a despesa do pedido continua viva
   *
   * ⚠ MEDIDO EM 07/09/2026: vincular uma nota AINDA NÃO LANÇADA só anota a
   * ligação e não encosta em dinheiro — o que está certo, senão a obra
   * ficaria com material recebido e despesa nenhuma. Só que o botão
   * "Lançar" resolvia o pedido pelo que estivesse MARCADO na tela, e a tela
   * não oferece o bloco de vínculo quando a nota já tem pedido. Resultado:
   * vincular primeiro e lançar depois somava as parcelas da nota à despesa do
   * pedido, que continuava lá — a duplicata de sempre, pelo caminho mais
   * inocente da tela.
   *
   * Esta função responde: dos pedidos que JÁ estão nesta nota, quais ainda
   * têm despesa viva para substituir na hora do lançamento.
   * ================================================================= */
  function pendentesDeSubstituir(nf, compras, financeiro) {
    var quero = {}, out = [];
    pedidosDaNota(nf).forEach(function (c) { quero[txt(c.id)] = 1; });
    lista(compras).forEach(function (pc) {
      if (!pc || !quero[txt(pc.id)]) return;
      var d = despesaDaCompra(financeiro, pc.id);
      if (!d) return;
      out.push({ compraId: txt(pc.id), numero: txt(pc.numero), apagarId: d.id,
        valor: num(d.valor), pago: txt(d.status) === "pago", despesa: d });
    });
    return out;
  }

  /* ⚠ A ESCRITA DO VÍNCULO MORA AQUI, NUM LUGAR SÓ. Os dois lados e os
     campos antigos que as telas leem são gravados juntos; espalhar isso pelas
     telas é como o `notaId` passou a dizer uma coisa e o Financeiro outra.
     `em` chega de fora para o motor continuar puro (testável sem relógio). */
  function aplicarVinculo(nf, pedidos, pl, em) {
    var mapa = {}, novos = [];
    lista(pedidos).forEach(function (p) { if (p) mapa[txt(p.id)] = p; });
    var numTxt = txt(nf && nf.numero) || "s/n";
    if (txt(nf && nf.serie)) numTxt += "/" + txt(nf.serie);
    lista(pl && pl.itens).forEach(function (it) {
      var pc = mapa[txt(it.compraId)]; if (!pc) return;
      pc.notas = notasDoPedido(pc);      /* materializa o vínculo antigo antes de somar */
      pc.notas.push({ id: txt(nf.id), numero: numTxt, valor: cent(it.fatia), em: txt(em) });
      pc.valorFaturado = faturado(pc);
      pc.diferenca = cent(pc.valorFaturado - num(pc.valor));
      pc.notaId = txt(pc.notas[0].id); pc.notaNumero = txt(pc.notas[0].numero);
      pc.vinculadoEm = txt(em);
      novos.push({ id: txt(pc.id), numero: txt(pc.numero), valor: cent(it.fatia) });
    });
    nf.compras = pedidosDaNota(nf).concat(novos);
    nf.compraId = nf.compras.length ? nf.compras[0].id : "";
    nf.compraNumero = nf.compras.length ? nf.compras[0].numero : "";
    return novos;
  }

  /* Tira esta nota de todos os pedidos dela e diz, por pedido, o que volta.
     ⚠ A DESPESA DO PEDIDO SÓ VOLTA QUANDO ELE FICA SEM NOTA NENHUMA: com
     outra nota ainda lançada, devolvê-la recria a duplicata que o vínculo
     tinha tirado — era o buraco do "um pedido, duas notas" pela porta do
     Desfazer. */
  function desfazerVinculo(nf, pedidos) {
    var out = [], nid = txt(nf && nf.id);
    lista(pedidos).forEach(function (pc) {
      if (!pc) return;
      var antes = notasDoPedido(pc);
      var ficam = antes.filter(function (n) { return txt(n.id) !== nid; });
      if (ficam.length === antes.length) return;          /* esta nota não era dele */
      var saiu = cent(antes.reduce(function (a, n) { return a + (txt(n.id) === nid ? num(n.valor) : 0); }, 0));
      pc.notas = ficam;
      if (ficam.length) {
        pc.valorFaturado = faturado(pc);
        pc.diferenca = cent(pc.valorFaturado - num(pc.valor));
        pc.notaId = ficam[0].id; pc.notaNumero = ficam[0].numero;
        out.push({ compraId: txt(pc.id), numero: txt(pc.numero), fatia: saiu, restaurar: null, aindaTem: ficam.length });
      } else {
        pc.notaId = ""; pc.notaNumero = ""; pc.valorFaturado = null; pc.diferenca = null; pc.vinculadoEm = "";
        var volta = despesaARestaurar(pc);
        pc.despesaSubstituida = null;
        out.push({ compraId: txt(pc.id), numero: txt(pc.numero), fatia: saiu, restaurar: volta, aindaTem: 0 });
      }
    });
    nf.compras = []; nf.compraId = ""; nf.compraNumero = "";
    return out;
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
    var nesta = {};
    pedidosDaNota(nf).forEach(function (c) { nesta[txt(c.id)] = 1; });
    var out = [];
    (compras || []).forEach(function (c) {
      if (!c || txt(c.status) !== "recebido") return;
      /* antes: `if (txt(c.notaId)) return`. Pedido faturado PELA METADE some
         daqui e a segunda nota fica sem onde encostar — ver o bloco do
         vínculo N:N. Sai de cena quem não tem mais saldo, não quem tem nota. */
      if (!podeReceberNota(c)) return;
      if (nesta[txt(c.id)]) return;                   // já está NESTA nota
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
        dataRecebimento: txt(c.dataRecebimento), motivo: motivo, forca: forca,
        /* o que a tela precisa dizer para a pessoa não faturar duas vezes o
           mesmo pedido: quanto já foi, e quanto falta */
        jaFaturado: faturado(c), saldo: saldoDoPedido(c) });
    });
    out.sort(function (a, b) {
      return (b.forca - a.forca) || (b.valor - a.valor) ||
        (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0);
    });
    return out;
  }

  /* =================================================================
   * TODOS OS PEDIDOS QUE PODEM RECEBER ESTA NOTA — não só os sugeridos.
   *
   * ⚠ MEDIDO EM 07/09/2026: a tela oferecia os TRÊS primeiros `candidatos`,
   * e `candidatos` só devolve quem tem força (xPed citado, ou mesmo fornecedor
   * dentro da janela de dias). Se o pedido certo estava fora disso — nome do
   * fornecedor escrito diferente na nota, entrega de mês passado, quarto da
   * lista — a única opção que sobrava era "Nenhum — esta nota não é de
   * pedido", que é mentira e deixa a compra virar despesa em dobro.
   *
   * Este devolve TODO pedido elegível (recebido e ainda sem nota), com a
   * sugestão na frente e o resto atrás, para a tela poder oferecer busca. Ele
   * não casa nada: `motivo` continua vindo do `candidatos`, e quem não foi
   * sugerido vem com `motivo: ""` — escolher ali é decisão da pessoa, que é a
   * regra 2 da skill `dinheiro` (nunca ligar dinheiro por semelhança).
   * ================================================================= */
  function elegiveis(nf, compras, hoje) {
    var sug = candidatos(nf, compras, hoje);
    var nesta = {};
    pedidosDaNota(nf).forEach(function (c) { nesta[txt(c.id)] = 1; });
    var jaTem = {};
    sug.forEach(function (c) { jaTem[c.compraId] = 1; });
    var resto = [];
    (compras || []).forEach(function (c) {
      if (!c || txt(c.status) !== "recebido") return;
      if (!podeReceberNota(c)) return;                // ver `podeReceberNota`
      if (nesta[txt(c.id)]) return;                   // já está NESTA nota
      if (jaTem[c.id]) return;
      resto.push({ compraId: c.id, numero: txt(c.numero), valor: num(c.valor),
        fornecedor: txt(c.fornecedorNome), obraId: txt(c.obraId),
        dataRecebimento: txt(c.dataRecebimento), motivo: "", forca: 0,
        jaFaturado: faturado(c), saldo: saldoDoPedido(c) });
    });
    /* o resto sai do mais recente para o mais antigo: quem procura um pedido
       para casar com a nota de hoje começa por baixo do calendário */
    resto.sort(function (a, b) {
      return (b.dataRecebimento < a.dataRecebimento ? -1 : b.dataRecebimento > a.dataRecebimento ? 1 : 0)
        || (a.numero < b.numero ? 1 : a.numero > b.numero ? -1 : 0);
    });
    return { sugeridos: sug, outros: resto, total: sug.length + resto.length };
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
    candidatos: candidatos, elegiveis: elegiveis,
    /* ⚠ UMA PORTA SÓ PARA A MESMA PERGUNTA. O `plano` de um pedido só foi
       substituído por este: manter os dois deixaria duas regras para "posso
       vincular?", e a antiga recusava o faturamento parcial que a nova
       permite — qual delas valeria dependeria da tela por onde a pessoa
       entrou. */
    planoVinculo: planoVinculo, aplicarVinculo: aplicarVinculo,
    pendentesDeSubstituir: pendentesDeSubstituir,
    desfazerVinculo: desfazerVinculo, ratear: ratear,
    notasDoPedido: notasDoPedido, pedidosDaNota: pedidosDaNota,
    faturado: faturado, saldoDoPedido: saldoDoPedido, podeReceberNota: podeReceberNota,
    despesaDaCompra: despesaDaCompra, despesaAntigaDaCompra: despesaAntigaDaCompra,
    despesaARestaurar: despesaARestaurar,
    _chave: chave, DIAS_JANELA: DIAS_JANELA
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.CompraNota;
})(typeof window !== "undefined" ? window : globalThis);

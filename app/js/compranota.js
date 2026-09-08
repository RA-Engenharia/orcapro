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
  /* =================================================================
   * UM PEDIDO PODE TER MAIS DE UMA DESPESA VIVA — e por muito tempo esta
   * função devolveu só a primeira.
   *
   * ⚠ MEDIDO EM 07/09/2026: com entrega parcial, a viagem 1 lança R$ 6.000;
   * se ALGUÉM PAGAR essa conta, a viagem que fecha o pedido não pode somar
   * nela (dinheiro pago não se toca) e nasce uma SEGUNDA despesa de R$ 3.500,
   * com o mesmo carimbo. A partir daí, quem perguntasse "qual é a despesa
   * deste pedido?" recebia só a paga: o vínculo da nota recusava com o valor
   * errado (imprimia o valor do PEDIDO, não o pago), estornar não destravava,
   * e a única saída era lançar a nota sem vínculo — R$ 13.000 de custo para
   * uma compra de R$ 9.500.
   *
   * ⚠ VIVA é quem não foi anulada por nenhum dos três caminhos: não é o
   * espelho de um estorno (`estornoDe`), não TEM espelho apontando para si, e
   * não está cancelada. Tratar espelho como despesa faria o estorno travar o
   * pagamento que ele acabou de liberar.
   * ================================================================= */
  /* ⚠ A RÉGUA DE "VIVA" MORA AQUI, sozinha. Ela saíu de dentro de
     `despesasDaCompra` porque duas portas perguntam a mesma coisa — "a despesa
     de UM pedido" e "o índice da lista inteira" — e duas cópias de uma régua de
     dinheiro é como o `Util.parseNum` virou 33, com duas erradas em sentidos
     opostos, as duas movendo dinheiro. */
  function espelhosDe(financeiro) {
    var e = {};
    lista(financeiro).forEach(function (f) { if (f && txt(f.estornoDe)) e[txt(f.estornoDe)] = 1; });
    return e;
  }
  function despesaViva(f, espelhos) {
    if (!f) return false;
    if (txt(f.estornoDe)) return false;          /* é crédito, não despesa */
    if (espelhos[txt(f.id)]) return false;       /* já tem espelho: morta */
    if (txt(f.status) === "cancelado") return false;
    return true;
  }

  function despesasDaCompra(financeiro, compraId) {
    var id = txt(compraId); if (!id) return [];
    var fin = lista(financeiro), espelhos = espelhosDe(fin), out = [];
    fin.forEach(function (f) {
      if (!f) return;
      if (txt(f.docTipo) !== "PC" || txt(f.docId) !== id) return;
      if (!despesaViva(f, espelhos)) return;
      out.push(f);
    });
    return out;
  }

  /* a primeira viva — mantida porque várias telas perguntam por UMA. Quem
     precisa decidir sobre dinheiro usa `despesasDaCompra` (plural). */
  function despesaDaCompra(financeiro, compraId) {
    var v = despesasDaCompra(financeiro, compraId);
    return v.length ? v[0] : null;
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

  /* =================================================================
   * O QUE JÁ ENTROU É O QUE PODE SER FATURADO — não o status
   *
   * ⚠ MEDIDO EM 07/09/2026, e vale dinheiro de obra: chegaram 150 dos 200
   * sacos, o app lançou a despesa de R$ 6.000 e o pedido FICOU em
   * "confirmado" (só vira "recebido" quando a entrega fecha, que é o certo).
   * Quando a nota desses 150 chegou, as duas portas do vínculo exigiam
   * `status === "recebido"` e respondiam "não há pedido de compra recebido com
   * saldo a faturar" — mentira. A pessoa lançava a nota sozinha e a mesma
   * compra virava DUAS despesas: R$ 12.000 para R$ 6.000 de material, com o
   * estoque dobrando junto (o dedupe da triagem só protege o que está
   * vinculado). Era a duplicata que este arquivo existe para impedir,
   * entrando pela porta que ele mesmo fechou.
   *
   * ⚠ E O SALDO NÃO É O VALOR DO PEDIDO, É O QUE JÁ VIROU DESPESA. Faturar
   * 200 sacos quando chegaram 150 poria no custo da obra material que não
   * existe lá — e deixaria a nota do resto sem saldo quando ele chegasse.
   * ================================================================= */
  /* ⚠ PEDIDO MORTO NÃO RECEBE NOTA — E ESTA LINHA NASCE JUNTO COM A
     TRANSCRIÇÃO DA ENTREGA LEGADA, porque é ela que abre o buraco.
     `recebeuAlgo` responde "sim" a quem tem `recebimentos`, e
     `Gestao._transcreveEntregaLegada` passa a escrever essa lista também na
     saída `recebido → cancelado`. Medido em 07/09/2026: com a lista, um pedido
     CANCELADO dava `podeReceberNota` true e aparecia em `elegiveis` (total 1);
     sem a lista, false. Vincular nota a pedido cancelado ressuscitaria o
     dinheiro dele nas parcelas da NF — num pedido que o
     `PorObra.totaisCompras` já mandou para "Fora da conta".
     ⚠ Nem `candidatos` nem `elegiveis` filtram status: o filtro por
     `status === "recebido"` saiu daqui de propósito, porque escondia a entrega
     parcial. A régua certa não é "está recebido", é "não está morto". */
  var PC_MORTO = { rejeitado: 1, cancelado: 1 };
  function pedidoMorto(pc) { return !!PC_MORTO[txt(pc && pc.status)]; }

  function recebeuAlgo(pc) {
    if (!pc) return false;
    if (txt(pc.status) === "recebido") return true;
    return lista(pc.recebimentos).length > 0;
  }

  /* quanto do pedido já entrou, em dinheiro. Pedido fechado vale o total
     (inclui frete e o que não está por item); aberto vale a soma do que as
     viagens de fato lançaram — zero enquanto não houver preço por item, que
     é quando não existe despesa parcial nenhuma para a nota substituir. */
  function recebidoEmDinheiro(pc) {
    if (!pc) return 0;
    if (txt(pc.status) === "recebido") return num(pc.valor);
    return cent(lista(pc.recebimentos).reduce(function (a, v) { return a + num(v && v.valor); }, 0));
  }

  function saldoDoPedido(pc) {
    var s = recebidoEmDinheiro(pc) - faturado(pc);
    return s > 0.005 ? cent(s) : 0;
  }


  /* =================================================================
   * ⚠ QUANTO DESTE PEDIDO JÁ É DESPESA — e a resposta sai do que EXISTE no
   * Financeiro, nunca do histórico das viagens.
   *
   * ⚠ MEDIDO EM 07/09/2026, e esta base já gravou a decisão em dois lugares:
   * `comprasReceber` (js/gestao.js) e tools/test-entrega-parcial.js [9]. A
   * viagem 1 lançou R$ 6.000; a pessoa errou a data e CANCELOU aquele
   * lançamento — a porta que o próprio app ensina (`_portaDoLanc`). Somar
   * `recebimentos[].valor` responderia 6.000 por uma despesa que não existe
   * mais: o valor sairia do Comprometido sem entrar no Realizado, sumindo das
   * DUAS colunas e subindo o Saldo da etapa — que é o número que autoriza a
   * próxima compra. Aqui a pergunta é quanto EXISTE.
   *
   * ⚠ E A NOTA CONTA COMO DESPESA. Vincular a nota APAGA a despesa `PC` de
   * propósito (ver o cabeçalho deste arquivo) e deixa as parcelas `NF` no
   * lugar. Sem somar `faturado(pc)`, um pedido faturado certinho pareceria
   * "sem despesa nenhuma" e voltaria a ser cobrado inteiro no Comprometido —
   * o mesmo falso alarme que `ComprasLinha.linhaDoTempo` já teve de consertar.
   *
   * ⚠ LIGA POR CARIMBO, SEMPRE: `docTipo:"PC"` + `docId`, e a lista de notas do
   * próprio pedido. Nada aqui procura por valor, descrição ou data.
   *
   * ⚠ NÃO EXISTE CASO ESPECIAL PARA O PEDIDO LEGADO. `ComprasLinha.recebimento`
   * trata `dataRecebimento` sem `recebimentos` como "chegou tudo" — mas aquela
   * pergunta é de QUANTIDADE. Esta é de dinheiro: dizer "já virou despesa" sem
   * achar a despesa faria o valor sumir das duas colunas. Sem despesa
   * encontrável o pedido continua comprometido inteiro — superestima a
   * exposição, que é o único erro que nunca convida a gastar.
   * ================================================================= */
  function jaEDespesa(financeiro, pc) {
    if (!pc || !txt(pc.id)) return 0;
    var vivas = despesasDaCompra(financeiro, pc.id).reduce(function (a, f) { return a + num(f.valor); }, 0);
    return cent(vivas + faturado(pc));
  }

  /* O mesmo, para uma lista inteira, numa varredura só do Financeiro: a tela de
     Compras chama isto UMA vez e passa o índice adiante. Sem índice pronto,
     `PorObra.porObra` varreria o Financeiro inteiro uma vez por obra. Tem de dar
     exatamente o mesmo número que `jaEDespesa` — é o que o assert de paridade cobra. */
  function jaEDespesaPorPedido(financeiro, compras) {
    var fin = lista(financeiro), espelhos = espelhosDe(fin), vivo = {}, idx = {};
    fin.forEach(function (f) {
      if (!f) return;
      if (txt(f.docTipo) !== "PC" || !txt(f.docId)) return;
      if (!despesaViva(f, espelhos)) return;
      var k = txt(f.docId);
      vivo[k] = num(vivo[k]) + num(f.valor);
    });
    lista(compras).forEach(function (pc) {
      if (!pc || !txt(pc.id)) return;
      idx[txt(pc.id)] = cent(num(vivo[txt(pc.id)]) + faturado(pc));
    });
    return idx;
  }

  /* ⚠ VÍNCULO ANTIGO SEM VALOR FATURADO fica de fora: `valorFaturado` vazio
     é o vínculo só documental (vinculado sem lançar), e sem saber quanto a
     primeira nota cobriu, oferecer a segunda seria convidar a faturar duas
     vezes o mesmo pedido. Para esses o caminho é desfazer e refazer. */
  function podeReceberNota(c) {
    if (pedidoMorto(c)) return false;              /* ver `pedidoMorto` */
    /* nada entrou ainda: não há o que faturar (ver `recebeuAlgo`) */
    if (!recebeuAlgo(c)) return false;
    /* ⚠ SEM NOTA NENHUMA, o saldo NÃO e a regua: pedido sem valor informado
       (ou de valor zero) tambem se vincula a nota — o vinculo tambem e
       documental. Exigir saldo aqui tirava da lista pedido legitimo, que foi
       justamente o defeito que este bloco veio consertar. */
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
      /* ⚠ A RÉGUA É O QUE ENTROU, NÃO O STATUS — ver `recebeuAlgo`. Recusar
         por status deixava a nota da entrega parcial sem onde encostar, e a
         mesma compra virava duas despesas. */
      /* ⚠ o `recebeuAlgo` abaixo diria "sim" para um pedido cancelado que já
         recebeu — e a frase dele mandaria esperar o material chegar, que não é
         o que está errado. A recusa tem de dizer o estado real. */
      if (pedidoMorto(pc)) {
        erro = "O pedido " + txt(pc.numero) + " está " + txt(pc.status)
          + " — nota fiscal não se vincula a pedido rejeitado ou cancelado. Se ele voltou a valer, reabra o pedido antes."; break;
      }
      if (!recebeuAlgo(pc)) {
        erro = "O pedido " + txt(pc.numero) + " ainda não recebeu nada — vincule depois que o material chegar."; break;
      }
      /* chegou material, mas nada dele virou despesa ainda: pedido sem preço
         por item só lança quando a entrega fecha. Dizer isso é melhor que
         oferecer um vínculo que não tem o que substituir. */
      if (!notasDoPedido(pc).length && !(recebidoEmDinheiro(pc) > 0)) {
        erro = "Chegou material do pedido " + txt(pc.numero) + ", mas ainda não há despesa dele para a nota substituir: este pedido não tem preço por item, então a despesa entra quando a entrega fechar."; break;
      }
      if (nesta) { erro = "O pedido " + txt(pc.numero) + " já está nesta nota."; break; }
      if (jaNota.length && !podeReceberNota(pc)) {
        erro = "O pedido " + txt(pc.numero) + " já está vinculado a outra nota"
          + (faturado(pc) > 0 ? " e não tem saldo a faturar (" + reais(faturado(pc)) + " de " + reais(num(pc.valor)) + ")."
             : " sem valor faturado — desfaça aquele vínculo antes de refazer, senão o mesmo pedido é faturado duas vezes.");
        break;
      }
      /* ⚠ TODAS as despesas vivas, não a primeira: com entrega parcial o
         pedido pode ter uma por viagem (ver `despesasDaCompra`). */
      var desps = despesasDaCompra(financeiro, pc.id);
      var pagas = [], somaPagas = 0, somaVivas = 0, di;
      for (di = 0; di < desps.length; di++) {
        somaVivas = cent(somaVivas + num(desps[di].valor));
        if (txt(desps[di].status) === "pago") { pagas.push(desps[di]); somaPagas = cent(somaPagas + num(desps[di].valor)); }
      }
      if (pagas.length) {
        /* ⚠ O VALOR QUE APARECE AQUI É O QUE FOI PAGO. Imprimir o valor do
           PEDIDO (era o que esta linha fazia) mandava a pessoa procurar no
           Financeiro um pagamento de R$ 9.500 que não existe — pagos foram
           R$ 6.000, da primeira viagem. */
        erro = "A despesa do pedido " + txt(pc.numero) + " já foi PAGA (" + reais(somaPagas)
          + (desps.length > pagas.length ? ", de " + reais(somaVivas) + " lançados neste pedido" : "")
          + "). Não mexo em pagamento: estorne o pagamento antes de vincular, ou lance só a diferença.";
        break;
      }
      var apagarIds = [];
      for (di = 0; di < desps.length; di++) { apagarIds.push(desps[di].id); }
      var it = { compraId: txt(pc.id), numero: txt(pc.numero), valor: num(pc.valor),
        jaFaturado: faturado(pc), saldo: saldoDoPedido(pc), fatia: fatias[i],
        /* a lista é a verdade; o campo no singular é a primeira, para as telas
           que ainda perguntam por uma só */
        apagarIds: apagarIds, apagarId: apagarIds.length ? apagarIds[0] : null,
        parcial: jaNota.length > 0 };
      /* ⚠ na SEGUNDA nota do mesmo pedido a despesa dele já saiu na primeira:
         não há o que apagar, e avisar "não achei a despesa" ali seria recado
         que mente. O `despesaSubstituida` guardado lá continua sendo o que
         volta quando a ÚLTIMA nota do pedido for desfeita. */
      if (!desps.length && !it.parcial) {
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
        var voltam = despesasARestaurar(pc);
        pc.despesaSubstituida = null; pc.despesasSubstituidas = null;
        out.push({ compraId: txt(pc.id), numero: txt(pc.numero), fatia: saiu,
          /* `restaurar` no singular continua sendo a primeira, para a tela que
             ainda lê uma só; `restaurarTodas` é o que de fato tem de voltar */
          restaurar: voltam.length ? voltam[0] : null, restaurarTodas: voltam, aindaTem: 0 });
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
      if (!c) return;
      /* antes: `if (txt(c.status) !== "recebido") return` — e o pedido com
         entrega PARCIAL (que fica em "confirmado" até fechar) sumia das duas
         listas, com a nota dele já na mão. Ver `recebeuAlgo`.
         E antes disso: `if (txt(c.notaId)) return`. Pedido faturado PELA METADE some
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
      if (!c) return;
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
  /* ⚠ PLURAL: um pedido com entrega parcial pode ter tido MAIS DE UMA
     despesa substituída pela nota (uma por viagem). Devolver só a primeira
     deixaria o resto do material recebido sem despesa nenhuma — e sem sinal. */
  function despesasARestaurar(compra) {
    if (!compra) return [];
    var guardadas = lista(compra.despesasSubstituidas);
    /* registro gravado antes desta versão guardava uma só, no singular */
    if (!guardadas.length && compra.despesaSubstituida) guardadas = [compra.despesaSubstituida];
    var out = [];
    guardadas.forEach(function (d) {
      if (!d) return;
      var o = {}, k;
      for (k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) o[k] = d[k]; }
      delete o.id;                     // renasce como linha nova
      out.push(o);
    });
    return out;
  }

  /* mantida para quem pergunta por uma só */
  function despesaARestaurar(compra) {
    var v = despesasARestaurar(compra);
    return v.length ? v[0] : null;
  }

  /* =================================================================
   * VÍNCULO QUE APONTA PARA UMA NOTA QUE NÃO RESPONDE MAIS
   *
   * ⚠ MEDIDO EM 07/09/2026, com a 1.2.52 rodando de verdade sobre um disco
   * escrito pela 1.2.53. O dono decidiu MANTER a nota que cobre vários
   * pedidos; então o conserto não é impedir, é tornar o estrago visível e
   * reversível — a versão velha continua na mão de cliente e o
   * `_desvincularCompraDaNota` dela lia UM campo (`nf.compraId`):
   *
   *   nota de R$ 10.000 cobrindo PC-01 (6.000) e PC-02 (4.000). A 1.2.53
   *   apaga as DUAS despesas e guarda cópia de cada uma no seu pedido. O
   *   outro aparelho, na 1.2.52, clica Desfazer: apaga as parcelas da nota,
   *   devolve SÓ a de PC-01 e diz "a despesa do pedido PC-01 voltou". PC-02
   *   fica com `notas` apontando a nota, `despesaSubstituida` intacto e
   *   NENHUMA despesa viva: R$ 4.000 de material recebido somem do custo da
   *   obra. E somem calados — `podeReceberNota(PC-02)` responde false, o
   *   pedido não aparece em `candidatos` nem em `elegiveis`, e não há tela
   *   por onde desfazer. Trava sem porta.
   *
   * ⚠ O MESMO ESTADO NASCE POR OUTRAS TRÊS PORTAS que existem HOJE, na
   * versão nova: excluir a nota, editar `nf.compras` até ela deixar de citar
   * o pedido, e apagar as parcelas da nota direto no Financeiro. Por isso a
   * regra olha o ESTADO, não a versão que o produziu.
   *
   * ⚠ O QUE SEPARA ÓRFÃO DE ESTADO LEGÍTIMO é uma coisa só: vincular SEM
   * lançar não encosta na despesa do pedido (ver `fiscalVincularPedido`,
   * `if (lancAgora.length)`), e ali a nota também não tem lançamento. Os dois
   * estados têm a MESMA cara no vínculo. Quem os separa é a despesa viva do
   * pedido — por isso ela é condição, não enfeite.
   *
   * ⚠ E SÃO QUATRO DESFECHOS, NÃO UM. Tratar diagnósticos diferentes como um
   * só já custou caro nesta base. Duas perguntas independentes — "o pedido
   * tem despesa viva?" e "ele ainda guarda a cópia do que a nota levou?" —
   * dão quatro estados, e cada um tem uma saída diferente:
   *
   *   cópia sim / despesa não  → `itens`    devolve a cópia e solta
   *   cópia não / despesa não  → `semCopia` só solta: não sei quanto devolver
   *   cópia não / despesa sim  → `presos`   só solta: o dinheiro está certo
   *   cópia sim / despesa sim  → `revisar`  NÃO SEI se a cópia já voltou
   *
   * O quarto é real e é ambíguo de propósito. Ele nasce (a) da entrega
   * parcial — a nota substituiu a despesa da viagem 1, a viagem 2 lançou
   * outra depois, e a cópia da viagem 1 ainda falta de verdade; e (b) da
   * 1.2.52 ter devolvido só o campo singular deixando `despesasSubstituidas`
   * para trás, caso em que a cópia já voltou e devolvê-la seria duplicata.
   * Existe até uma impressão digital que separa os dois (`despesasSubstituidas`
   * cheio com `despesaSubstituida` nulo é assinatura da 1.2.52), e MESMO
   * ASSIM não agimos por ela: seria deduzir o que outra versão fez com o
   * dinheiro de alguém. O app diz que não sabe, solta o vínculo e ARQUIVA a
   * cópia sem devolvê-la nem destruí-la.
   * ================================================================= */

  /* ⚠ DE PROPÓSITO MAIS LARGA QUE O `_lancamentosDaNota` (js/gestao.js), e
     esta diferença é a guarda, não um descuido. Lá a régua é EXCLUSIVA
     (com chave, só a chave); aqui é chave OU id. Motivo: os dois caminhos
     que gravam parcela de nota escrevem a chave de jeitos diferentes
     (`nf.chaveAcesso` cru em `triLancar`, só dígitos no formulário da IA,
     js/gestao.js:29444). Um desencontro ali faz o `_lancamentosDaNota`
     apenas dizer "esta nota não tem lançamento" — chato. Aqui faria o app
     DEVOLVER uma despesa por cima de parcelas vivas: duplicata de dinheiro.
     Os custos são assimétricos, então a régua erra para o lado seguro:
     falso positivo aqui = deixamos de avisar; falso negativo = dinheiro em
     dobro. Ids são prefixados por entidade (`Util.uid`), então o OR não
     confunde parcela de nota com despesa de pedido.
     ⚠ FORA DE ESCOPO, REGISTRADO: parcela ESTORNADA (espelho `estornoDe`,
     par soma zero) continua contando como "lançada" pelas duas réguas. A
     nota fica com custo zero e a despesa do pedido segue apagada — órfão que
     este detector NÃO vê. Mudar a régua aqui e não lá criaria duas verdades
     para "esta nota está lançada", que é o defeito que o ⚠ do `notaId`
     documenta. Fica anotado, não consertado. */
  /* ⚠ A REGRA MORA NUMA FUNÇÃO SÓ (`notaNoIndice`) e o índice é só o jeito de
     não reler o Financeiro N vezes. Escrever a régua duas vezes — uma para a
     pergunta de uma nota, outra para a varredura — é como o `Util.parseNum`
     virou 33 cópias, com duas erradas em sentidos opostos, as duas movendo
     dinheiro. Aqui a paridade entre as duas portas é cobrada por assert. */
  function indiceLancamentos(financeiro) {
    var porChave = {}, porDoc = {};
    lista(financeiro).forEach(function (f) {
      if (!f) return;
      var ch = String(f.docChave || ""); if (ch) porChave[ch] = 1;
      var di = String(f.docId || ""); if (di) porDoc[di] = 1;
    });
    return { chave: porChave, doc: porDoc };
  }
  function notaNoIndice(nf, idx) {
    var ch = String((nf && nf.chaveAcesso) || ""), id = String((nf && nf.id) || "");
    if (ch && idx.chave[ch]) return true;
    return !!(id && idx.doc[id]);
  }
  function notaTemLancamento(nf, financeiro) {
    return notaNoIndice(nf, indiceLancamentos(financeiro));
  }

  var VINC_MORTO = { cancelado: 1, rejeitado: 1 };

  function vinculosMortos(compras, notas, financeiro) {
    var porId = {};
    lista(notas).forEach(function (nf) { if (nf && txt(nf.id)) porId[txt(nf.id)] = nf; });
    /* ⚠ UMA VARREDURA SÓ DO FINANCEIRO, e não uma por pedido mais uma por nota.
       MEDIDO EM 07/09/2026: perguntando pedido a pedido, este detector custava
       397 ms POR RENDER do Painel numa base de 1.500 pedidos e 15.000
       lançamentos — e o Painel redesenha o tempo todo. É o mesmo motivo do
       `jaEDespesaPorPedido`: sem índice pronto, a resposta de uma linha custa a
       lista inteira. As regras não mudam de lugar: `espelhosDe` e `despesaViva`
       continuam sendo quem decide o que é despesa viva, e `notaNoIndice`
       continua sendo a régua de "esta nota está lançada". */
    var fin = lista(financeiro), espelhos = espelhosDe(fin);
    var idxLanc = indiceLancamentos(fin), temDesp = {};
    fin.forEach(function (f) {
      if (!f) return;
      if (txt(f.docTipo) !== "PC" || !txt(f.docId)) return;
      if (!despesaViva(f, espelhos)) return;
      temDesp[txt(f.docId)] = 1;
    });
    var itens = [], semCopia = [], presos = [], revisar = [], somaValor = 0;
    lista(compras).forEach(function (pc) {
      if (!pc || !txt(pc.id)) return;
      /* pedido rejeitado/cancelado não tem custo a devolver: acusá-lo seria
         alarme que nunca se resolve, e alarme assim ensina a ignorar o card */
      if (VINC_MORTO[txt(pc.status)]) return;
      /* ⚠ E A RÉGUA DA CASA É O QUE ENTROU, NÃO O STATUS (ver `recebeuAlgo`):
         pedido que não recebeu nada nunca teve despesa para a nota substituir,
         então não há órfão possível — `planoVinculo` nem deixa vincular. */
      if (!recebeuAlgo(pc)) return;
      var minhas = notasDoPedido(pc);
      if (!minhas.length) return;
      /* ⚠ MEDIDA ANTES DO LAÇO, e não depois, porque é ELA que decide se
         `sem-lancamento` é prova de alguma coisa — ver o `continue` abaixo. */
      var temDespesa = !!temDesp[txt(pc.id)];
      var mortas = [], viva = false, i, j;
      for (i = 0; i < minhas.length; i++) {
        var nf = porId[txt(minhas[i].id)], diag = "";
        if (!nf) diag = "sumiu";
        else {
          var dela = pedidosDaNota(nf), cita = false;
          for (j = 0; j < dela.length; j++) { if (txt(dela[j].id) === txt(pc.id)) cita = true; }
          if (!cita) diag = "nao-cita";
          else if (!notaNoIndice(nf, idxLanc)) diag = "sem-lancamento";
        }
        /* ⚠ O FALSO ALARME MAIS CARO DESTE DETECTOR, e ele cabe numa linha.
           MEDIDO EM 07/09/2026, num disco sem defeito nenhum: 1 pedido em
           `presos`. VINCULAR SEM LANÇAR é rotina — a tela grava o vínculo, NÃO
           encosta na despesa do pedido e diz isso em voz alta ("Nada mudou no
           Financeiro — o custo continua vindo da despesa do pedido até você
           lançar a nota", `fiscalVincularPedido`). Nesse estado a nota está
           VIVA, CITA o pedido e não tem lançamento: `sem-lancamento`, palavra
           por palavra o mesmo que o órfão. Sem esta linha, TODO pedido
           vinculado e ainda não lançado caía em `presos` e o card anunciava
           "preso a uma nota que não existe mais" sobre uma nota que existe —
           alarme falso em cima de operação normal, que é o que ensina a
           ignorar o card.
           O que separa os dois é uma coisa só: no órfão a despesa do pedido
           SUMIU. Por isso ela é condição, não enfeite.
           ⚠ E O QUE ESTA LINHA NÃO VÊ, dito em voz alta em vez de escondido:
           a versão anterior que devolveu a despesa e esqueceu a cópia em
           `despesasSubstituidas` deixa a nota viva, citando e sem lançamento —
           idêntico ao estado legítimo. Esse caso fica de fora, e a cópia
           esquecida continua sendo risco (o `triLancar` CONCATENA nela).
           Calar sobre um caso raro é melhor que alarmar sobre a rotina de
           todo mundo: alarme que grita no normal ninguém lê no dia do erro. */
        if (diag === "sem-lancamento" && temDespesa) continue;
        /* ⚠ UMA NOTA VIVA BASTA: com outra nota ainda lançada a despesa
           continua legitimamente substituída, e devolvê-la recria a duplicata
           que o vínculo existe para impedir (mesma regra do `desfazerVinculo`). */
        if (!diag) { viva = true; }
        else {
          mortas.push({ id: txt(minhas[i].id), numero: txt(minhas[i].numero),
            valor: num(minhas[i].valor), diag: diag });
        }
      }
      if (viva || !mortas.length) return;
      var voltam = despesasARestaurar(pc);
      var vCopia = cent(voltam.reduce(function (a, d) { return a + num(d && d.valor); }, 0));
      var temCopia = voltam.length > 0;
      var base = { compraId: txt(pc.id), numero: txt(pc.numero), obraId: txt(pc.obraId),
        fornecedor: txt(pc.fornecedorNome), valorPedido: num(pc.valor),
        mortas: mortas, restaurar: [], valor: 0, valorCopia: vCopia,
        podeDevolver: false, temDespesa: temDespesa, temCopia: temCopia };
      if (temCopia && !temDespesa) {
        base.restaurar = voltam; base.valor = vCopia; base.podeDevolver = true;
        somaValor = cent(somaValor + vCopia);
        itens.push(base);
      } else if (!temCopia && !temDespesa) {
        /* ⚠ SEM CÓPIA NÃO SE INVENTA VALOR. Vínculo feito por versão que não
           guardava a despesa, ou feito sem lançar, não deixou o que devolver:
           usar `pc.valor` aqui seria o app lançando dinheiro por dedução.
           Mas soltar o vínculo continua sendo dele — sem isso o pedido nunca
           volta às listas, e a trava fica sem porta também neste ramo. */
        semCopia.push(base);
      } else if (!temCopia && temDespesa) {
        presos.push(base);
      } else {
        revisar.push(base);
      }
    });
    return { total: itens.length, valor: somaValor, itens: itens,
      semCopia: semCopia, presos: presos, revisar: revisar,
      soltaveis: semCopia.length + presos.length + revisar.length };
  }

  /* ⚠ O LADO DA NOTA. `soltarVinculoMorto` sozinho escreveria METADE de um
     vínculo de dois lados — e este arquivo existe porque `pc.notaId` dizia
     uma coisa e o Financeiro outra. No diagnóstico `sem-lancamento` a nota
     está VIVA e CITA o pedido: deixá-la citando faz `planoVinculo` somar esse
     pedido em `jaAlocado`, e a nota passa a responder para sempre "já está
     inteira no(s) pedido(s) X" — trava nova no lugar da que consertamos.
     Devolve false quando não havia o que tirar (nota que já não cita), para a
     fiação não gravar a nota à toa. Escreve `compraId`/`compraNumero` junto,
     como o `aplicarVinculo`. */
  function soltarPedidoDaNota(nf, compraId) {
    if (!nf) return false;
    var id = txt(compraId);
    var antes = pedidosDaNota(nf);
    var ficam = antes.filter(function (c) { return txt(c.id) !== id; });
    if (ficam.length === antes.length) return false;
    nf.compras = ficam;
    nf.compraId = ficam.length ? ficam[0].id : "";
    nf.compraNumero = ficam.length ? ficam[0].numero : "";
    return true;
  }

  /* ⚠ A ESCRITA MORA AQUI, NUM LUGAR SÓ — mesma razão do `aplicarVinculo`.
     Os campos antigos (`notaId`, `notaNumero`, `valorFaturado`, `diferenca`)
     saem JUNTO: metade das telas os lê (js/compraslinha.js monta a linha
     do tempo por eles), e deixá-los para trás mantém o pedido parecendo
     faturado — a trava sem porta continuaria fechada depois do conserto.

     ⚠ E A CÓPIA GUARDADA SÓ SOME QUANDO ELA DE FATO VOLTOU (`devolveu`).
     Zerá-la sempre destruía dinheiro: entrega parcial em que a nota
     substituiu a despesa da viagem 1, a viagem 2 lançou outra depois e a nota
     morreu — o pedido tem despesa viva (a da viagem 2) e a cópia da viagem 1
     é a única prova de R$ 6.000 que faltam. Não voltou: ARQUIVA em
     `despesasOrfas` com carimbo, e some das duas chaves vivas. Arquivar, e
     não deixar onde está, porque o `triLancar` CONCATENA em
     `despesasSubstituidas` (js/gestao.js) — cópia velha esquecida ali
     ressuscita como despesa fantasma no Desfazer seguinte. Quem lê
     `despesasOrfas` é o modal e o toast desta mesma tela: campo gravado que
     ninguém lê é campo que a próxima limpeza apaga. */
  function soltarVinculoMorto(pc, mortas, devolveu, em) {
    if (!pc) return [];
    var fora = {};
    lista(mortas).forEach(function (m) { if (m && txt(m.id)) fora[txt(m.id)] = 1; });
    var ficam = notasDoPedido(pc).filter(function (n) { return !fora[txt(n.id)]; });
    pc.notas = ficam;
    if (ficam.length) {
      /* ramo defensivo: quem chama desta feature descarta o pedido inteiro
         quando sobra nota viva, então aqui `ficam` é sempre vazio. Se um dia
         não for, a cópia NÃO se mexe — a nota que ficou continua substituindo
         a despesa, e devolvê-la seria a duplicata de volta. */
      pc.valorFaturado = faturado(pc);
      pc.diferenca = cent(pc.valorFaturado - num(pc.valor));
      pc.notaId = ficam[0].id; pc.notaNumero = ficam[0].numero;
      return ficam;
    }
    pc.notaId = ""; pc.notaNumero = ""; pc.valorFaturado = null;
    pc.diferenca = null; pc.vinculadoEm = "";
    if (!devolveu) {
      var guardadas = despesasARestaurar(pc);
      if (guardadas.length) {
        var arq = lista(pc.despesasOrfas);
        guardadas.forEach(function (d) {
          d.arquivadoEm = txt(em); d.arquivadoPor = "vinculo-morto";
          arq.push(d);
        });
        pc.despesasOrfas = arq;
      }
    }
    pc.despesaSubstituida = null; pc.despesasSubstituidas = null;
    return ficam;
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
    vinculosMortos: vinculosMortos, soltarVinculoMorto: soltarVinculoMorto,
    soltarPedidoDaNota: soltarPedidoDaNota, notaTemLancamento: notaTemLancamento,
    notasDoPedido: notasDoPedido, pedidosDaNota: pedidosDaNota,
    faturado: faturado, saldoDoPedido: saldoDoPedido, podeReceberNota: podeReceberNota,
    despesaDaCompra: despesaDaCompra, despesasDaCompra: despesasDaCompra,
    jaEDespesa: jaEDespesa, jaEDespesaPorPedido: jaEDespesaPorPedido,
    despesaAntigaDaCompra: despesaAntigaDaCompra,
    despesaARestaurar: despesaARestaurar, despesasARestaurar: despesasARestaurar,
    recebeuAlgo: recebeuAlgo, recebidoEmDinheiro: recebidoEmDinheiro,
    pedidoMorto: pedidoMorto,
    _chave: chave, DIAS_JANELA: DIAS_JANELA
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.CompraNota;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * compraslinha.js — a LINHA DO TEMPO do pedido de compra, derivada, sem DOM.
 *
 * POR QUE EXISTE: entre "aprovado" e "recebido" o pedido sumia. O prazo do
 * fornecedor ia como texto em `obs`, ninguém sabia se ele tinha visto o
 * pedido, e "atrasado" não era um conceito do sistema — a obra descobria o
 * atraso quando o caminhão não chegava. Este motor responde, para cada
 * pedido, "em que etapa está", "qual data vale", "está atrasado", "está
 * parado" e "o que já aconteceu" — e é fiado na lista, no formulário, no sino
 * e no Portal, sempre a partir da MESMA conta.
 *
 * ⚠ ATRASADO, PARADO E PAGO NÃO SÃO STATUS. São derivados a cada render.
 *   Gravar "atrasado" no registro faria o merge da nuvem ressuscitar um
 *   atraso já resolvido (o registro com `atualizadoEm` mais novo vence, e o
 *   outro aparelho não sabe que a entrega chegou) e obrigaria alguém a lembrar
 *   de tirar — passo que depende de alguém lembrar é passo que não acontece.
 *
 * ⚠ `status` É ESPELHO; A VERDADE MORA NOS CARIMBOS COM DATA E AUTOR:
 *   `pc.envio`, `pc.confirmacao`, `pc.dataRecebimento`, `historicoAprovacao`
 *   (js/aprovacao.js) e o lançamento carimbado `docTipo:"PC"` no Financeiro.
 *   Um aparelho que salvou o formulário depois devolve o status antigo, mas
 *   não apaga o carimbo — por isso toda pergunta aqui olha o carimbo primeiro.
 *
 * Datas: aritmética em calendário LOCAL (new Date(y, m-1, d)), nunca
 * Date.parse de "yyyy-mm-dd" — que é UTC e volta um dia em dezembro/horário
 * de verão (já mordeu esta base).
 *
 * Motor puro: roda no navegador (global.ComprasLinha) e no Node (module.exports).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* estados que não andam mais; tudo o que não está aqui é "em aberto" */
  var TERMINAL = { recebido: 1, rejeitado: 1, cancelado: 1 };
  /* pedido que já é compromisso de dinheiro e ainda não virou despesa */
  var COMPROMISSO = { aprovado: 1, enviado: 1, confirmado: 1 };

  /* para onde cada status pode ir. `cotacao` é o nome da chave desde a v1.0
     ("Aguardando aprovação" na tela) — a chave fica pelos 38 clientes. */
  var TRANSICOES = {
    cotacao:    { aprovado: 1, rejeitado: 1, cancelado: 1 },
    aprovado:   { enviado: 1, recebido: 1, cancelado: 1 },      /* Receber sem enviar: o material chega sem clique */
    enviado:    { confirmado: 1, recebido: 1, cancelado: 1 },
    confirmado: { recebido: 1, cancelado: 1 },
    recebido:   { cancelado: 1 },                                 /* passa por _travaLancDoDoc (dinheiro) */
    rejeitado:  { cotacao: 1 },
    cancelado:  { cotacao: 1 }
  };

  /* relógio de "parado": dias sem ninguém mexer, por etapa */
  var PARADO = { cotacao: 3, aprovado: 2, enviado: 2 };

  var ETAPA = {
    cotacao: "Aguardando aprovação", aprovado: "Aprovado — pronto para enviar",
    enviado: "Enviado — aguardando fornecedor", confirmado: "Confirmado pelo fornecedor",
    recebido: "Recebido", rejeitado: "Rejeitado", cancelado: "Cancelado"
  };

  /* ⚠ QUANTIDADE, SEM ESCREVER MAIS UM PARSER. Esta base tem 33 módulos que
     copiaram `Util.parseNum` e dois deles divergiram em sentidos opostos, os
     dois movendo dinheiro — por isso aqui se DELEGA ao `Util` sempre que ele
     existir (navegador, e Node quando o teste o carrega). O caminho de baixo
     só atende o módulo rodando sozinho, e só o que este motor de fato recebe:
     número, ou string já normalizada por quem gravou. Ele não inventa regra de
     vírgula: se algum dia chegar "1.234,56" aqui, o certo é carregar o `Util`,
     não crescer esta função. */
  function qtd(v) {
    if (typeof Util !== "undefined" && Util && Util.num) return Util.num(v);
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? "" : v));
    return isFinite(n) ? n : 0;
  }
  function isoDia(v) {
    var s = String(v == null ? "" : v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  function paraData(iso) {
    var p = iso.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function paraISO(d) {
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
  }
  /* b - a em dias corridos; as duas em ISO válido */
  function difDias(a, b) {
    var da = paraData(a), db = paraData(b);
    return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
  }
  function somarDias(iso, n) { var d = paraData(iso); return paraISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
  /* dias úteis entre a (exclusive) e b (inclusive): seg–sex, sem feriado — o
     feriado aqui seria promessa de precisão que o pedido não tem */
  function diasUteis(a, b) {
    if (b <= a) return 0;
    var n = 0, d = paraData(a);
    for (var i = 0, lim = difDias(a, b); i < lim; i++) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      var w = d.getDay(); if (w !== 0 && w !== 6) n++;
    }
    return n;
  }
  function br(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  function brCurto(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : ""; }
  function plural(n, s, p) { return n + " " + (n === 1 ? s : p); }

  var ComprasLinha = {
    TERMINAL: TERMINAL,
    TRANSICOES: TRANSICOES,
    PARADO_DIAS: PARADO,
    ETAPA: ETAPA,
    isoDia: isoDia, difDias: difDias, somarDias: somarDias, diasUteis: diasUteis, br: br,

    ehTerminal: function (status) { return !!TERMINAL[String(status || "")]; },

    /* ⚠ DINHEIRO JÁ COMPROMETIDO, AINDA NÃO VIRADO DESPESA. A regra mora AQUI,
       e não em cada tela, porque ela já se espalhou e já divergiu: a Fase 0b
       criou `enviado` e `confirmado`, o `PorObra.totaisCompras` foi corrigido
       para contá-los e o `CustoEtapa.consolidar` NÃO — e as duas telas do mesmo
       app passaram a mostrar "Comprometido" com números diferentes para a mesma
       obra (R$ 15.700 em Compras, R$ 1.900 em Previsto × Realizado). Pior que
       divergir: o Saldo da etapa, que é o número que decide se dá para comprar,
       subia R$ 13.800 no clique de um botão que promete não mover dinheiro.
       `recebido` fica de fora de propósito — já virou despesa, e contar aqui
       seria contar duas vezes. Quem acrescentar status novo mexe nesta linha,
       e o tools/test-compras-fase0b.js reprova quem esquecer. */
    COMPROMISSO: COMPROMISSO,
    ehCompromisso: function (status) { return !!COMPROMISSO[String(status || "")]; },
    podeIr: function (de, para) { var t = TRANSICOES[String(de || "")]; return !!(t && t[String(para || "")]); },

    /* A DATA QUE VALE: quem sabe mais recente vence. O fornecedor que
       confirmou com outra data sabe mais do que o prazo que o Mapa calculou. */
    dataVigente: function (pc) {
      pc = pc || {};
      var conf = pc.confirmacao && isoDia(pc.confirmacao.dataEntrega);
      return conf || isoDia(pc.previsaoEntrega) || "";
    },

    /* a foto de um pedido num dia: etapa, data, atraso, parado, sem data */
    situacao: function (pc, hojeISO) {
      pc = pc || {};
      var hoje = isoDia(hojeISO), st = String(pc.status || "cotacao");
      var aberto = !TERMINAL[st];
      var vig = this.dataVigente(pc);
      var r = { status: st, etapa: ETAPA[st] || st, aberto: aberto, dataVigente: vig,
                atrasado: false, diasAtraso: 0, parado: false, diasParado: 0, motivoParado: "",
                semData: false, chegaEm: null, confirmado: !!(pc.confirmacao && pc.confirmacao.em), enviado: !!(pc.envio && pc.envio.em) };
      if (!hoje) return r;                                   /* sem "hoje" confiável não se afirma atraso */
      var esperaEntrega = st === "aprovado" || st === "enviado" || st === "confirmado";
      if (esperaEntrega) {
        if (!vig) r.semData = true;
        else if (hoje > vig) { r.atrasado = true; r.diasAtraso = difDias(vig, hoje); }
        else r.chegaEm = difDias(hoje, vig);
      }
      /* parado: o relógio conta desde o último carimbo daquela etapa */
      var desde = "";
      if (st === "cotacao") desde = isoDia(pc.data) || isoDia(pc.criadoEm);
      else if (st === "aprovado") desde = isoDia(pc.aprovadoEm) || isoDia(pc.data);
      else if (st === "enviado") desde = pc.envio && isoDia(pc.envio.em);
      if (desde && PARADO[st] != null) {
        var dias = st === "enviado" ? diasUteis(desde, hoje) : difDias(desde, hoje);
        if (dias > PARADO[st]) {
          r.parado = true; r.diasParado = dias;
          r.motivoParado = st === "cotacao" ? "aguardando aprovação há " + plural(dias, "dia", "dias")
            : st === "aprovado" ? "aprovado e não enviado há " + plural(dias, "dia", "dias")
            : "sem confirmação há " + plural(dias, "dia útil", "dias úteis");   /* o status ao lado já diz "aguardando fornecedor" */
        }
      }
      return r;
    },

    /* o que a coluna "Entrega" da lista mostra: texto curto + cor */
    pillEntrega: function (pc, hojeISO) {
      var s = this.situacao(pc, hojeISO);
      if (!s.aberto) {
        if (s.status === "recebido") return { texto: pc.dataRecebimento ? "recebido " + brCurto(isoDia(pc.dataRecebimento)) : "recebido", cor: "#15803d" };
        return { texto: "", cor: "" };
      }
      if (s.status === "cotacao") return { texto: s.parado ? s.motivoParado : "", cor: s.parado ? "#b45309" : "" };
      if (s.atrasado) return { texto: "atrasado " + plural(s.diasAtraso, "dia", "dias"), cor: "#dc2626" };
      if (s.status === "enviado" && s.parado) return { texto: s.motivoParado, cor: "#b45309" };
      if (s.semData) return { texto: "sem previsão de entrega", cor: "#64748b" };
      if (s.status === "confirmado") return { texto: "confirmado · " + brCurto(s.dataVigente), cor: "#15803d" };
      if (s.status === "enviado") return { texto: "aguardando fornecedor · " + brCurto(s.dataVigente), cor: "#2563eb" };
      return { texto: "previsto " + brCurto(s.dataVigente), cor: "#2563eb" };
    },

    /* filtros da lista — cada chave é uma pergunta que o comprador faz */
    FILTROS: [
      ["todos", "Todos"], ["aprovacao", "Aguardando aprovação"], ["nao_enviado", "Aprovado, não enviado"],
      ["fornecedor", "Aguardando fornecedor"], ["atrasados", "Atrasados"], ["chegando", "Chegam em 7 dias"], ["recebidos", "Recebidos"]
    ],
    passaFiltro: function (pc, chave, hojeISO) {
      var s = this.situacao(pc, hojeISO);
      switch (String(chave || "todos")) {
        case "aprovacao": return s.status === "cotacao";
        case "nao_enviado": return s.status === "aprovado";
        case "fornecedor": return s.status === "enviado";
        case "atrasados": return s.atrasado;
        case "chegando": return s.aberto && s.chegaEm != null && s.chegaEm <= 7 && !s.atrasado;
        case "recebidos": return s.status === "recebido";
        default: return true;
      }
    },

    /* LINHA DO TEMPO — o que aconteceu, na ordem, com quem e quando.
       `lanc` é o lançamento vivo do Financeiro (carimbo docTipo PC) ou null:
       sem carimbo a linha diz que NÃO ENCONTROU — nunca "não pago". */
    linhaDoTempo: function (pc, lanc) {
      pc = pc || {};
      var ev = [];
      function quem(x) { return x ? String(x) : ""; }
      ev.push({ tipo: "gerado", quando: isoDia(pc.data) || isoDia(pc.criadoEm), titulo: "Pedido criado",
                detalhe: pc.cotacaoId ? "a partir do Mapa de Cotação" : (pc.requisicaoId ? "a partir da requisição" : ""), feito: true });
      (pc.historicoAprovacao || []).forEach(function (h) {
        if (!h) return;
        var a = String(h.acao || "");
        var t = a === "aprovar" ? "Aprovado" : a === "rejeitar" ? "Rejeitado" : a === "reabrir" ? "Reaberto" : a;
        ev.push({ tipo: "aprovacao-" + a, quando: isoDia(h.em), titulo: t + (quem(h.por) ? " por " + quem(h.por) : ""),
                  detalhe: h.motivo ? String(h.motivo) : (h.autoriaNaoVerificada ? "autoria do pedido não verificada" : ""), feito: true });
      });
      if (pc.envio && pc.envio.em) ev.push({ tipo: "enviado", quando: isoDia(pc.envio.em), titulo: "Enviado ao fornecedor" + (quem(pc.envio.por) ? " por " + quem(pc.envio.por) : ""),
        detalhe: pc.envio.canal ? "por " + String(pc.envio.canal) + (pc.envio.obs ? " · " + String(pc.envio.obs) : "") : String(pc.envio.obs || ""), feito: true });
      else ev.push({ tipo: "enviado", quando: "", titulo: "Enviado ao fornecedor", detalhe: "ainda não", feito: false });
      if (pc.confirmacao && pc.confirmacao.em) ev.push({ tipo: "confirmado", quando: isoDia(pc.confirmacao.em),
        titulo: "Fornecedor confirmou" + (quem(pc.confirmacao.nome) ? " (" + quem(pc.confirmacao.nome) + ")" : ""),
        detalhe: (isoDia(pc.confirmacao.dataEntrega) ? "entrega prevista " + br(isoDia(pc.confirmacao.dataEntrega)) : "") + (pc.confirmacao.canal ? " · por " + String(pc.confirmacao.canal) : ""), feito: true });
      else ev.push({ tipo: "confirmado", quando: "", titulo: "Fornecedor confirmou", detalhe: "ainda não", feito: false });
      if (pc.status === "recebido" || pc.dataRecebimento) ev.push({ tipo: "recebido", quando: isoDia(pc.dataRecebimento), titulo: "Recebido na obra",
        detalhe: pc.estoqueLancado ? "material no almoxarifado" : "", feito: true });
      else ev.push({ tipo: "recebido", quando: "", titulo: "Recebido na obra", detalhe: "ainda não", feito: false });
      if (lanc) {
        var pago = !!(lanc.dataPgto) || String(lanc.status || "") === "pago";
        ev.push({ tipo: "pago", quando: isoDia(lanc.dataPgto) || "", titulo: pago ? "Pago" : "Despesa lançada no Financeiro (pendente)",
                  detalhe: pago ? "" : (lanc.vencimento ? "vence " + br(isoDia(lanc.vencimento)) : ""), feito: pago });
      } else if (pc.notaId || (pc.notas && pc.notas.length)) {
        /* ⚠ DEPOIS DE VINCULAR CERTO, O PEDIDO DIZIA QUE TINHA PERDIDO O
           DINHEIRO. Medido em 07/09/2026: vincular a nota ao pedido APAGA a
           despesa do pedido de propósito (senão a mesma compra vira duas
           despesas) e deixa as parcelas da NOTA no lugar. Só que a linha do
           tempo procura o lançamento pelo carimbo do PEDIDO — não acha nada, e
           anunciava "não encontrei o lançamento desta compra no Financeiro"
           justamente para quem tinha feito tudo certo. O recado assustava e
           mandava procurar um buraco que não existe.
           Aqui o pedido diz o que de fato aconteceu: o dinheiro dele agora é a
           nota. `lanc` continua sendo a única fonte quando existe — este ramo
           só responde quando NÃO há lançamento próprio E há nota vinculada. */
        /* ⚠ UM PEDIDO PODE VIR EM MAIS DE UMA NOTA (faturamento parcial, o
           normal em entrega parcelada). Dizer só a primeira faria a linha do
           tempo esconder metade do faturamento — e o pedido parecer faturado
           por inteiro quando ainda falta nota. */
        /* a lista é a verdade; o campo antigo é o vínculo de uma nota só.
           Lido do próprio registro para esta linha não depender de outro módulo. */
        var nts = (pc.notas && pc.notas.length) ? pc.notas : [{ id: pc.notaId, numero: pc.notaNumero, valor: pc.valorFaturado }];
        var somaNt = nts.reduce(function (a, n) { return a + qtd(n && n.valor); }, 0);
        var faltaNt = qtd(pc.valor) - somaNt;
        ev.push({ tipo: "pago", quando: isoDia(pc.vinculadoEm),
          titulo: nts.length > 1 ? "Faturado por " + nts.length + " notas fiscais" : "Faturado pela nota fiscal",
          detalhe: "o valor virou conta a pagar da NF " + (nts.map(function (n) { return String(n.numero || ""); })
              .filter(function (s) { return s; }).join(", ") || "vinculada")
            + " — a despesa do pedido saiu para não contar duas vezes"
            /* o que falta faturar é o que manda a pessoa cobrar a próxima nota */
            + (faltaNt >= 0.01 && somaNt > 0 ? " · faltam " + faltaNt.toFixed(2).replace(".", ",") + " a faturar" : ""),
          feito: true });
      } else if (pc.status === "recebido") {
        ev.push({ tipo: "pago", quando: "", titulo: "Pagamento", detalhe: "não encontrei o lançamento desta compra no Financeiro", feito: false });
      }
      /* ordem: o que tem data primeiro (cronológica), o que "ainda não" depois, na ordem natural */
      var feitos = ev.filter(function (e) { return e.feito && e.quando; }).sort(function (a, b) { return a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0; });
      var resto = ev.filter(function (e) { return !(e.feito && e.quando); });
      return feitos.concat(resto);
    },

    /* texto pronto para cobrar o fornecedor pelo WhatsApp — o app NÃO avisa
       ninguém sozinho; ele só abre a mensagem, e a tela diz isso */
    textoCobranca: function (pc, empresa, hojeISO) {
      var s = this.situacao(pc, hojeISO);
      var quemAssina = empresa ? " — " + String(empresa) : "";
      if (s.atrasado) return "Olá! O pedido " + (pc.numero || "") + " estava previsto para " + br(s.dataVigente) + " e ainda não chegou na obra. Consegue me dizer a nova data?" + quemAssina;
      if (s.status === "enviado") return "Olá! Enviamos o pedido " + (pc.numero || "") + (pc.envio && pc.envio.em ? " em " + br(isoDia(pc.envio.em)) : "") + ". Pode confirmar o recebimento e a data de entrega?" + quemAssina;
      return "Olá! Sobre o pedido " + (pc.numero || "") + (s.dataVigente ? " (entrega prevista " + br(s.dataVigente) + ")" : "") + ": pode me dar uma posição?" + quemAssina;
    },

    /* =================================================================
     * ENTREGA PARCIAL — quanto de cada item já chegou
     *
     * ⚠ MEDIDO EM 07/09/2026: [Receber] era um clique seco. Chegando 150 dos
     * 200 sacos, o app dava entrada de 200 no almoxarifado, lançava a despesa
     * CHEIA e marcava o pedido como recebido. A obra ficava com 50 sacos que
     * só existem no sistema, o custo médio recalculado sobre quantidade que
     * não chegou, e o pedido fora de qualquer fila de cobrança — ninguém mais
     * ia atrás do que faltou. Entrega parcial é o caso NORMAL em obra, e era o
     * único que a tela não sabia representar.
     *
     * A conta mora aqui, pura: `pc.recebimentos` é a lista do que chegou em
     * cada viagem, e cada linha carrega `itemIdx` — o ÍNDICE do item no
     * pedido, nunca a descrição (casar material por nome é ligar dinheiro por
     * semelhança, o que a regra 2 da skill `dinheiro` proíbe, e duas linhas
     * parecidas no mesmo pedido fariam o saldo do errado andar).
     *
     * ⚠ COMPATIBILIDADE: pedido recebido ANTES desta versão não tem
     * `recebimentos`, só `dataRecebimento` — e para ele "chegou tudo" é a
     * leitura certa: foi assim que o app o marcou. Ler zero ali faria 38
     * instalações acordarem com todo pedido antigo "faltando material".
     * ================================================================= */
    recebimento: function (pc) {
      var itens = (pc && Array.isArray(pc.itens)) ? pc.itens : [];
      var viagens = (pc && Array.isArray(pc.recebimentos)) ? pc.recebimentos : [];
      /* o pedido antigo (só `dataRecebimento`, sem lista) conta como completo */
      var legado = !viagens.length && !!(pc && pc.dataRecebimento);
      var porIdx = {};
      viagens.forEach(function (v) {
        ((v && Array.isArray(v.itens)) ? v.itens : []).forEach(function (r) {
          if (!r || r.itemIdx == null) return;
          var k = String(r.itemIdx);
          porIdx[k] = qtd(porIdx[k]) + qtd(r.qtd);
        });
      });
      var linhas = itens.map(function (it, i) {
        var pedida = qtd(it && it.quantidade);
        var receb = legado ? pedida : qtd(porIdx[String(i)]);
        /* ⚠ falta nunca é negativa: receber A MAIS que o pedido acontece (o
           fornecedor manda a caixa fechada), e transformar isso em "-12 de
           falta" faria a soma de pendências mentir. O excesso aparece em
           `aMais`, que é outra pergunta. */
        return { itemIdx: i, descricao: (it && it.descricao) || "", unidade: (it && it.unidade) || "",
          pedida: pedida, recebida: receb,
          falta: Math.max(0, Math.round((pedida - receb) * 1000) / 1000),
          aMais: Math.max(0, Math.round((receb - pedida) * 1000) / 1000) };
      });
      var comFalta = linhas.filter(function (l) { return l.falta > 0; });
      /* ⚠ pedido SEM itens detalhados (digitado à mão) não tem como ser
         parcial: não há quantidade para comparar. Dizer "faltou" ali seria
         inventar pendência — ele é completo assim que houver uma viagem. */
      var completo = !linhas.length ? (legado || viagens.length > 0) : !comFalta.length;
      return { linhas: linhas, viagens: viagens.length, legado: legado,
        completo: completo, comFalta: comFalta,
        iniciado: legado || viagens.length > 0 };
    },

    /* ⚠ O TEXTO DE MANDAR O PEDIDO — o passo que não tinha botão nenhum.
       "Enviar" no OrçaPRO só MARCAVA que o pedido foi mandado; mandar mesmo era
       trabalho à parte, em outro aplicativo, com o PDF que a pessoa tinha de
       lembrar de gerar antes. O caminho mais comum do fluxo era o único sem
       ajuda — e a tela ainda dizia "o app não envia nada sozinho" sem oferecer
       o que ele PODE fazer: abrir o papel e abrir a conversa.
       Continua sem enviar nada sozinho; só deixa de esconder as duas metades. */
    textoEnvio: function (pc, empresa) {
      var quemAssina = empresa ? " — " + String(empresa) : "";
      var quando = pc && pc.previsaoEntrega ? " Precisamos para " + br(isoDia(pc.previsaoEntrega)) + "." : "";
      return "Olá! Segue nosso pedido de compra " + ((pc && pc.numero) || "") + "."
        + quando + " Pode confirmar o recebimento e a data de entrega?" + quemAssina;
    }
  };

  global.ComprasLinha = ComprasLinha;
  if (typeof module !== "undefined" && module.exports) module.exports = ComprasLinha;
})(typeof window !== "undefined" ? window : global);

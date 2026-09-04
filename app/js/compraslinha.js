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
    }
  };

  global.ComprasLinha = ComprasLinha;
  if (typeof module !== "undefined" && module.exports) module.exports = ComprasLinha;
})(typeof window !== "undefined" ? window : global);

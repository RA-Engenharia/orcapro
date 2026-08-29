/* =====================================================================
 * aditivo.js — O TETO DO CONTRATO, E QUEM O LEVANTOU.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Medir acima do contratado não encontrava obstáculo: o excesso virava um
 * `UI.toast` e o boletim gravava do mesmo jeito. E "aditivo" era apagar o
 * valor do contrato e digitar outro — sem trilha, sem aprovador, e destruindo
 * o valor original no caminho. Depois não havia como responder as duas
 * perguntas que um aditivo existe para responder: **quem aumentou o contrato,
 * e com base em quê**.
 *
 * O MODELO, QUE É O DA ADMINISTRAÇÃO CONTRATUAL DE VERDADE
 * O contrato guarda o valor ORIGINAL e não é reescrito. Cada aditivo é um
 * REGISTRO próprio, com motivo, data, autor e aprovação. O valor vigente é
 * uma conta, não um campo:
 *
 *     vigente = original + Σ (aditivos APROVADOS)
 *
 * Supressão entra como aditivo NEGATIVO — é o mesmo instrumento, e tratá-la
 * como "editar para menos" perderia o registro do mesmo jeito.
 *
 * ⚠ SÓ APROVADO LEVANTA O TETO. Um aditivo em rascunho ou aguardando
 * aprovação não pode liberar faturamento: se liberasse, bastaria digitar um
 * aditivo para medir o que se quisesse, e a aprovação viraria enfeite. O
 * pendente aparece na tela como "há R$ X aguardando aprovação", que é
 * informação útil e não é permissão.
 *
 * ⚠ E O TETO É COMPARADO CONTRA O ACUMULADO, NÃO CONTRA O BOLETIM.
 * Três boletins de 40% passam um a um e estouram juntos. A conta que decide
 * é sempre `acumulado anterior + este boletim`.
 *
 * ⚠ POR QUE PURO (sem DOM, sem Store)
 * É a conta que decide se o cliente pode ser faturado. Conta que decide
 * faturamento não pode ser código sem teste, e `js/gestao.js` não entra no
 * gate. Mesmo padrão de `js/porobra.js`, `js/custoetapa.js`, `js/bimpeca.js`.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js), e não uma versão curta.
   * O módulo é puro — o gate o roda em Node, onde `Util` não existe — mas a
   * versão curta (`replace(/\./g,"")`) e a versão meio-curta (só tratar ponto
   * quando há vírgula) erram em direções OPOSTAS e as duas movem dinheiro:
   *   - a curta lê "1234.56" como 123456        (×100, infla)
   *   - a meio-curta lê "1.850.000" como 1,85   (÷1.000.000, some)
   * Há teste de PARIDADE contra o `Util.parseNum` real em
   * tools/test-numbr.js: se um dos dois lados mudar, o gate acusa. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      /* "1.000" e "25.000" são milhar; "0.125" NÃO — ninguém escreve milhar
         começando com zero, e essa leitura virava 125 m³ (v1.1.235). */
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(s) { return String(s == null ? "" : s).trim(); }

  /* Um centavo de folga. Sem isso, `40 + 30 + 30` em ponto flutuante estoura
     o próprio contrato que fecha exatamente em 100% — e a trava recusaria o
     último boletim de uma obra concluída.

     ⚠ E ELA ACOMPANHA A ESCALA DO CONTRATO. Meio centavo fixo cobre o ponto
     flutuante, mas não cobre a diferença LEGÍTIMA entre o contrato digitado
     (R$ 1.850.000,00 — assinatura arredondada) e o orçamento calculado com BDI
     (R$ 1.850.000,37). O boletim que fecha 100% dos itens sai do segundo e é
     medido contra o primeiro: 37 centavos de estouro, e o último boletim de uma
     obra entregue seria recusado pedindo "aditivo de R$ 0,37". Um milionésimo
     do teto é tolerância de arredondamento, não permissão — R$ 1,85 num
     contrato de R$ 1,85 milhão. */
  var FOLGA = 0.005;
  function folga(teto) { var t = num(teto); return Math.max(FOLGA, Math.abs(t) * 1e-6); }

  /* ⚠ APROVADO É UMA LISTA CURTA, E DE PROPÓSITO. Qualquer outro estado —
     rascunho, aguardando, rejeitado, cancelado — NÃO levanta o teto. */
  function ehAprovado(a) {
    var s = txt(a && a.status).toLowerCase();
    return s === "aprovado" || s === "aprovada";
  }
  function ehMorto(a) {
    var s = txt(a && a.status).toLowerCase();
    return s === "rejeitado" || s === "rejeitada" || s === "cancelado" || s === "cancelada";
  }

  /* ---------------------------------------------------------------
   * vigente — quanto vale o contrato HOJE, e o que está a caminho
   * ------------------------------------------------------------- */
  function vigente(contrato, aditivos) {
    var original = num(contrato && contrato.valor);
    var cid = txt(contrato && contrato.id);
    var somaAprov = 0, somaPend = 0, nAprov = 0, nPend = 0;
    var prazoAprov = 0, prazoPend = 0;

    arr(aditivos).forEach(function (a) {
      if (!a || txt(a.contratoId) !== cid) return;
      if (ehMorto(a)) return;
      var v = num(a.valor), d = num(a.prazoDias);
      if (ehAprovado(a)) { somaAprov += v; prazoAprov += d; nAprov++; }
      else { somaPend += v; prazoPend += d; nPend++; }
    });

    return {
      original: original,
      aditivoAprovado: somaAprov,
      /* ⚠ o pendente sai SEPARADO e NUNCA somado no vigente. Ele é aviso, não
         permissão — senão bastaria digitar um aditivo para poder faturar. */
      aditivoPendente: somaPend,
      valor: original + somaAprov,
      nAprovados: nAprov,
      nPendentes: nPend,
      prazoDiasAprovado: prazoAprov,
      prazoDiasPendente: prazoPend,
      /* percentual do aditivo sobre o original — o número que a fiscalização
         olha (e que em obra pública tem teto legal) */
      pctAditivo: original > 0 ? (somaAprov / original * 100) : 0
    };
  }

  /* ---------------------------------------------------------------
   * cabe — esta medição pode ser faturada?
   * ------------------------------------------------------------- */
  function cabe(p) {
    p = p || {};
    var teto = num(p.contratoVigente);
    var ant = num(p.acumuladoAnterior);
    var este = num(p.valorBoletim);
    var acum = ant + este;

    /* ⚠ CONTRATO SEM VALOR NÃO É CONTRATO COM TETO ZERO.
       Obra sem contrato e sem orçamento vinculado tem teto 0; recusar tudo
       ali seria travar quem mede por valor livre — que é caso real, e a
       trava não existe para isso. Sem teto conhecido, ela se declara
       inaplicável em vez de inventar um limite. */
    if (!(teto > 0)) {
      return { cabe: true, semTeto: true, teto: 0, acumulado: acum, excedente: 0,
        pctAcum: 0, faltaAditivo: 0,
        porque: "esta obra não tem valor de contrato nem orçamento vinculado — não há teto para conferir" };
    }

    var excedente = acum - teto;
    var passa = excedente <= folga(teto);
    var pct = teto > 0 ? (acum / teto * 100) : 0;

    return {
      cabe: passa,
      semTeto: false,
      teto: teto,
      acumulado: acum,
      anterior: ant,
      esteBoletim: este,
      excedente: passa ? 0 : excedente,
      /* quanto de aditivo APROVADO faltaria para este boletim caber — é a
         frase que o usuário precisa, não "não pode" */
      faltaAditivo: passa ? 0 : excedente,
      pctAcum: pct,
      porque: passa
        ? ""
        : "este boletim leva o acumulado a " + String(Math.round(pct * 10) / 10).replace(".", ",") +
          "% do contratado. Faltam " + fmt(excedente) + " de aditivo aprovado para ele caber."
    };
  }

  function fmt(v) {
    var n = Math.abs(num(v));
    var s = n.toFixed(2).split(".");
    return "R$ " + (num(v) < 0 ? "-" : "") +
      s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
  }

  /* ---------------------------------------------------------------
   * saldo — o que o boletim IMPRESSO tem de dizer
   *
   * ⚠ O IMPRESSO ESCONDIA O ESTOURO. `Math.max(0, contratado - acumulado)`
   * fazia o papel que o fiscal assina mostrar SALDO ZERO onde havia
   * excedente — o documento contratual afirmando que está tudo em ordem
   * exatamente quando não está. Saldo negativo é a verdade e tem de aparecer.
   * ------------------------------------------------------------- */
  function saldo(contratado, acumulado) {
    var c = num(contratado), a = num(acumulado);
    var s = c - a;
    return {
      saldo: s,
      excedeu: s < -folga(c),
      excedente: s < -folga(c) ? -s : 0,
      rotulo: s < -folga(c) ? "EXCEDIDO" : "Saldo a faturar"
    };
  }

  /* ---------------------------------------------------------------
   * numero — sequência por contrato, para o documento ter identidade
   * ------------------------------------------------------------- */
  function proximoNumero(contrato, aditivos) {
    var cid = txt(contrato && contrato.id);
    var maior = 0;
    arr(aditivos).forEach(function (a) {
      if (!a || txt(a.contratoId) !== cid) return;
      /* ⚠ o número fica no INÍCIO ("01º TA"), não no fim. Procurar `\d+$`
         devolvia 0 para todo aditivo já existente e a sequência ficava presa
         no 01 — dois termos aditivos com o mesmo número, num documento cuja
         serventia é justamente ter identidade. Aceita também "TA 3" e "3". */
      var t = txt(a.numero);
      var m = /^\D*(\d+)/.exec(t) || /(\d+)\D*$/.exec(t);
      var n = m ? parseInt(m[1], 10) : 0;
      if (n > maior) maior = n;
    });
    return String(maior + 1).replace(/^(\d)$/, "0$1") + "º TA";
  }

  /* =================================================================
   * A DECISÃO INTEIRA, EM CÓDIGO TESTÁVEL — e por que ela mudou de casa.
   *
   * A primeira versão desta trava morava em js/gestao.js, que NÃO ENTRA NO
   * GATE. Os testes que escrevi para ela eram asserts de TEXTO ("existe uma
   * chamada a `_medicaoCalc(obj)` no fonte"), e uma revisão adversarial
   * mostrou o custo disso: eu tinha trocado a soma dos OUTROS boletins pela
   * soma dos ANTERIORES, e o assert de texto EXIGIA justamente a chamada que
   * abria o buraco. Gate verde ratificando o defeito.
   *
   * Aqui a decisão é uma função pura de dados, e o teste é numérico.
   * ================================================================= */

  function ehBoletimMorto(x) {
    var s = txt(x && x.status).toLowerCase();
    return s === "rejeitada" || s === "rejeitado" || s === "cancelada" || s === "cancelado";
  }
  /* aprovar (ou pagar) é o ato que transforma o boletim em fatura */
  function ehBoletimFaturavel(x) {
    var s = txt(x && x.status).toLowerCase();
    return s === "aprovada" || s === "aprovado" || s === "paga" || s === "pago";
  }

  /* ---------------------------------------------------------------
   * ehSoEdicao — a única porta da exceção do "não piorou"
   *
   * ⚠ ESTA FUNÇÃO EXISTE PORQUE A REGRA ESTAVA ESCRITA DUAS VEZES. O ramo
   * principal ganhou as guardas de mudança de estado; o ramo vizinho — criado
   * no MESMO commit — ficou com uma segunda cópia da exceção que não as
   * consultava. Quatro revisores independentes acharam o mesmo buraco pelo
   * mesmo caminho: o formulário aprovava o boletim que o botão recusava.
   * Regra de dinheiro escrita duas vezes diverge; esta é a única cópia.
   *
   * A exceção vale para EDIÇÃO — corrigir a data de um boletim já estourado
   * não pode ser impossível. Não vale quando o boletim ENTRA em fatura
   * (aprovar/pagar), nem quando SAI de morto (rejeitado volta à sequência e
   * portanto ACRESCENTA valor), nem quando muda de obra ou de contrato (é
   * outra conta, não "não piorar").
   * ------------------------------------------------------------- */
  function ehSoEdicao(b, orig) {
    if (!orig) return false;
    if (txt(b.obraId) !== txt(orig.obraId)) return false;
    if (txt(b.contratoId) !== txt(orig.contratoId)) return false;
    if (ehBoletimFaturavel(b) && !ehBoletimFaturavel(orig)) return false;
    if (ehBoletimMorto(orig) && !ehBoletimMorto(b)) return false;
    return true;
  }

  /* ---------------------------------------------------------------
   * sequencia — QUAIS boletins somam junto com este
   *
   * ⚠ A RÉGUA É O Nº DE CONTRATOS VIVOS DA OBRA, não o campo Contrato do
   * boletim. O campo é OPCIONAL: numa obra de contrato único cujo 1º boletim
   * foi salvo sem apontá-lo, filtrar por contratoId zeraria o acumulado e
   * inflaria o saldo no mesmo tanto — regressão de dinheiro em documento
   * assinado, num caso muito mais frequente que a obra de dois contratos.
   * É a mesma régua de `_medicaoCalc`, de propósito: a trava e o papel que o
   * fiscal assina têm de somar a mesma coisa.
   * ------------------------------------------------------------- */
  function sequencia(p) {
    var obraId = txt(p && p.obraId), contratoId = txt(p && p.contratoId);
    var vivos = arr(p && p.contratosDaObra);
    var porContrato = vivos.length > 1 && !!contratoId;
    var dentro = [], ambiguas = 0;
    arr(p && p.medicoes).forEach(function (x) {
      if (!x || txt(x.obraId) !== obraId) return;
      if (ehBoletimMorto(x)) return;
      if (porContrato && txt(x.contratoId) !== contratoId) {
        if (!txt(x.contratoId)) ambiguas++;
        return;
      }
      dentro.push(x);
    });
    return { porContrato: porContrato, medicoes: dentro, ambiguas: ambiguas };
  }

  /* ---------------------------------------------------------------
   * outros — quanto JÁ está medido na sequência, FORA este boletim
   *
   * ⚠ "OUTROS", NÃO "ANTERIORES". O impresso responde outra pergunta —
   * "quanto tinha sido medido ATÉ aqui" — e a conta dele PARA no próprio
   * boletim. Usar aquele número na trava fazia com que editar qualquer
   * boletim que não fosse o último enxergasse zero atrás de si: três
   * boletins de R$ 100.000 num contrato de R$ 300.000, abrir o primeiro e
   * trocar para R$ 250.000 gravava sem uma palavra, deixando R$ 450.000
   * medidos. Boletim sem período preenchido caía sempre nesse caso, porque
   * ordenava em primeiro lugar.
   * ------------------------------------------------------------- */
  function outros(p) {
    var seq = sequencia(p), id = txt(p && p.boletimId), soma = 0, n = 0, pend = 0, nPend = 0;
    seq.medicoes.forEach(function (x) {
      if (id && txt(x.id) === id) return;
      soma += num(x.valor); n++;
      /* ⚠ QUANTO DO TETO ESTÁ PRESO EM BOLETIM QUE NINGUÉM APROVOU. Sem este
         número, a recusa culpa o aditivo — "faltam R$ 150.000 de aditivo
         aprovado" — quando o que consome o teto é um rascunho de R$ 250.000
         que talvez devesse ser rejeitado. O aprovador não tem como saber isso
         pela mensagem, e vai registrar um aditivo que não era necessário. */
      if (!ehBoletimFaturavel(x)) { pend += num(x.valor); nPend++; }
    });
    return { valor: soma, n: n, pendente: pend, nPendentes: nPend,
      porContrato: seq.porContrato, ambiguas: seq.ambiguas };
  }

  /* ---------------------------------------------------------------
   * podeMedir — a decisão
   * ------------------------------------------------------------- */
  function podeMedir(p) {
    p = p || {};
    var b = p.boletim || {}, orig = p.original || null;
    var fora = outros({
      medicoes: p.medicoes, contratosDaObra: p.contratosDaObra,
      obraId: b.obraId, contratoId: b.contratoId, boletimId: b.id
    });

    /* ⚠ O TETO SÓ PODE VIR DE UM INSTRUMENTO QUE AUTORIZA COBRAR.
       O contrato (mais os aditivos APROVADOS) autoriza. O orçamento vinculado
       serve quando não há contrato — é a base do escopo acordado.
       O `valor` digitado na ficha da OBRA não: é estimativa, campo de texto
       livre que ninguém aprova. Usá-lo como teto trancava a obra por
       administração — que mede série de preços sem valor global fechado — e
       ainda mandava o usuário registrar um termo aditivo, que exige um
       contrato que ali não existe. Trocar "sem trava" por "trancado sem
       chave" é piorar. Sem instrumento, a trava se declara inaplicável. */
    var teto = 0, fonte = "";
    var ctr = p.contrato;
    var soEdicao = ehSoEdicao(b, orig);
    /* ⚠ O CONTRATO TEM DE SER DA OBRA DO BOLETIM.
       O `<select>` do boletim lista os contratos da EMPRESA e mostra só o
       número ("001/2026", "002/2026"): escolher o vizinho de linha fazia o
       teto virar o de outra obra, e R$ 900.000 caberem num contrato de
       R$ 100.000. A tela já recusa no salvar, mas a regra tem de morar AQUI —
       é o motor que cobre todos os caminhos (formulário, botão Aprovar, e o
       próximo que aparecer) e é ele que entra no gate.
       Contrato SEM obra continua valendo: é dado legítimo antigo, e o campo
       Obra do contrato é opcional. */
    if (ctr && txt(ctr.obraId) && txt(ctr.obraId) !== txt(b.obraId)) ctr = null;
    /* ⚠ O CAMPO CONTRATO DO BOLETIM É OPCIONAL, E NASCE VAZIO ("— nenhum —").
       Sem isto, a trava inteira era desligada pelo valor PADRÃO de um
       dropdown: obra com contrato ativo de R$ 300.000, boletim no modo manual
       sem apontar contrato, R$ 9.999.999 gravados sem uma palavra. E os dois
       modos em que isso acontece (manual e atividades) zeram `orcamentoId` e
       `valorContratado` antes da conta, então não havia outra fonte.
       A régua é a mesma que `sequencia` usa: com UM contrato vivo, ele é o
       instrumento da obra, apontado ou não. */
    var vivosComValor = arr(p.contratosDaObra).filter(function (c) { return c && num(c.valor) > 0; });
    if (!ctr && vivosComValor.length === 1) ctr = vivosComValor[0];

    /* ⚠ A AMBIGUIDADE VEM ANTES DE QUALQUER FONTE. Deixá-la depois do
       orçamento fazia o orçamento vinculado curto-circuitar a recusa: obra com
       dois contratos vivos somando R$ 500.000 e um orçamento maior aceitava
       R$ 1.500.000, contra a regra escrita neste mesmo arquivo — o orçamento
       serve quando NÃO há contrato, e aqui há dois. */
    if (vivosComValor.length > 1 && !txt(b.contratoId)) {
      var amb = {
        pode: false, semTeto: false, teto: 0, fonte: "ambiguo",
        anterior: fora.valor, acumulado: fora.valor + num(b.valor),
        porContrato: fora.porContrato, ambiguas: fora.ambiguas, excedente: 0, faltaAditivo: 0, pctAcum: 0,
        porque: "esta obra tem " + vivosComValor.length + " contratos vivos e este boletim não aponta nenhum.",
        comoResolver: "Escolha o contrato no campo Contrato — sem ele não há teto para conferir."
      };
      /* ⚠ A MESMA porta da exceção do ramo principal — `ehSoEdicao`. A cópia
         que existia aqui não consultava as guardas de mudança de estado, e o
         formulário voltava a aprovar o que o botão recusava. Sem teto não há
         excedente para comparar, então a comparação é por valor. */
      if (soEdicao && num(b.valor) <= num(orig.valor)) { amb.pode = true; amb.naoPiorou = true; }
      return amb;
    }

    if (ctr) {
      var vg = vigente(ctr, p.aditivos);
      if (vg.valor > 0) { teto = vg.valor; fonte = "contrato"; }
      else if (!(num(p.tetoOrcamento) > 0)) {
        /* ⚠ INSTRUMENTO CORROMPIDO NÃO É AUSÊNCIA DE INSTRUMENTO. Uma
           supressão digitada errada — o valor do contrato no lugar do valor a
           suprimir, o engano mais provável neste formulário — leva o vigente a
           zero. Cair em "sem teto" aqui DESLIGARIA a trava exatamente onde o
           dado está corrompido, e o impresso do mesmo boletim já diria
           EXCEDIDO. Sem orçamento para servir de base, recusa e diz o que
           conferir. */
        var zer = {
          pode: false, semTeto: false, teto: 0, fonte: "contrato_zerado",
          anterior: fora.valor, acumulado: fora.valor + num(b.valor),
          porContrato: fora.porContrato, ambiguas: fora.ambiguas, excedente: 0, faltaAditivo: 0, pctAcum: 0,
          porque: "o valor vigente deste contrato está em " + fmt(vg.valor) +
            " — as supressões aprovadas zeraram ou inverteram o contrato.",
          comoResolver: "Confira os termos aditivos de supressão: um deles provavelmente foi lançado com o valor do contrato em vez do valor a suprimir."
        };
        if (soEdicao && num(b.valor) <= num(orig.valor)) { zer.pode = true; zer.naoPiorou = true; }
        return zer;
      }
    }
    if (!fonte && num(p.tetoOrcamento) > 0) { teto = num(p.tetoOrcamento); fonte = "orcamento"; }

    var r = cabe({ contratoVigente: teto, acumuladoAnterior: fora.valor, valorBoletim: num(b.valor) });
    var base = {
      teto: teto, fonte: fonte, semTeto: !!r.semTeto,
      anterior: fora.valor, acumulado: fora.valor + num(b.valor),
      porContrato: fora.porContrato, ambiguas: fora.ambiguas, excedente: r.excedente || 0,
      faltaAditivo: r.faltaAditivo || 0, pctAcum: r.pctAcum || 0
    };
    if (r.cabe) { base.pode = true; base.porque = ""; base.comoResolver = ""; return base; }

    /* ⚠ RECUSAR SÓ QUANDO A EDIÇÃO PIORA — e "piorar" se mede pelo EXCEDENTE,
       não pelo valor. A base de quem já mediu além do contratado é a razão de
       esta versão existir: comparando o acumulado absoluto, abrir um boletim
       antigo para corrigir a DATA seria impossível.
       ⚠ E SÓ NA MESMA BASE. Comparando só o valor, arrastar um boletim de
       R$ 900.000 do contrato grande para o pequeno passava — o valor não
       mudou — e o contrato de destino ia a 1800% em silêncio. Trocar a obra
       ou o contrato NÃO é "não piorar": é outra conta. */
    /* a exceção do "não piorou" — a MESMA porta dos outros dois ramos */
    if (soEdicao) {
      var antes = cabe({ contratoVigente: teto, acumuladoAnterior: fora.valor, valorBoletim: num(orig.valor) });
      if ((r.excedente || 0) <= (antes.excedente || 0) + FOLGA) {
        base.pode = true; base.naoPiorou = true; base.porque = ""; base.comoResolver = "";
        return base;
      }
    }

    base.pode = false;
    base.porque = r.porque;
    base.anteriorPendente = fora.pendente;
    /* ⚠ DIZER O QUE ESTÁ CONSUMINDO O TETO — E SE ISSO RESOLVE.
       Culpar o aditivo quando o teto está preso em boletim que ninguém aprovou
       manda registrar um termo aditivo desnecessário. A primeira versão desta
       frase só aparecia quando o pendente resolvia o problema INTEIRO; quando
       resolvia metade, o usuário continuava sem saber que havia metade a
       resolver ali. Agora ela sai sempre que há pendente, e diz o que sobra. */
    if (fora.pendente > 0) {
      var restante = Math.max(0, (r.excedente || 0) - fora.pendente);
      base.porque += " Desse acumulado, " + fmt(fora.pendente) + " está em " +
        fora.nPendentes + " boletim(ns) ainda não aprovado(s) — rejeitando-os, " +
        (restante > 0 ? "faltariam " + fmt(restante) + " de aditivo." : "este boletim passa a caber sem aditivo.");
    }
    /* ⚠ A SAÍDA TEM DE EXISTIR. Mandar "registre o termo aditivo" numa obra
       sem contrato manda o usuário para uma tela que responde "o aditivo
       precisa de um contrato" — fazer algo que não resolve é o pior tipo de
       recusa. Aqui a frase segue a FONTE do teto. */
    base.comoResolver = fonte === "contrato"
      ? "Registre o termo aditivo em Contratos → Aditivos."
      : "O teto veio do orçamento vinculado: para medir mais, o orçamento precisa crescer — ou cadastre o contrato e o termo aditivo.";
    return base;
  }

  var Aditivo = {
    vigente: vigente,
    cabe: cabe,
    saldo: saldo,
    proximoNumero: proximoNumero,
    ehAprovado: ehAprovado,
    sequencia: sequencia,
    outros: outros,
    podeMedir: podeMedir,
    FOLGA: FOLGA
  };

  global.Aditivo = Aditivo;
  if (typeof module !== "undefined" && module.exports) module.exports = Aditivo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

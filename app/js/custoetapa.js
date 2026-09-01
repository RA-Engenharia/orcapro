/* =====================================================================
 * custoetapa.js — QUANTO JÁ SAIU EM CADA ETAPA, E POR QUAL PORTA ENTROU
 * O QUE NINGUÉM ETIQUETOU.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * A pergunta "quanto já gastei na etapa de estrutura?" só tem resposta se o
 * gasto souber a que etapa pertence. Hoje ele quase nunca sabe: `etapaId` é
 * escrito no formulário manual e na cópia do estorno, e NENHUM dos caminhos
 * automáticos o carimba — compra recebida, parcela de nota fiscal, folha e
 * medição entram todos sem etiqueta. Como material e mão de obra entram
 * justamente por esses caminhos, "Não apropriado" tende a ser a maior linha
 * da tabela.
 *
 * ⚠ E O PIOR NÃO É A LINHA GRANDE — É A TELA RESPONDER ERRADO COM CARA DE
 * CERTA. As etapas aparecem com consumo perto de zero, sugerindo folga
 * orçamentária onde o dinheiro já saiu. Quem lê "Estrutura: orçado 200k,
 * realizado 8k" autoriza a próxima compra.
 *
 * POR ISSO `naoApropriado.porOrigem` É O PRODUTO, NÃO SOBRA.
 * Ele diz por QUAL PORTA o dinheiro entrou sem etiqueta — e é o que prova,
 * depois, que o carimbo novo funcionou. Um número grande em `PC` aponta para
 * o recebimento de compra; em `folha`, para o fechamento da folha. Sem essa
 * quebra, "72% não apropriado" é uma reclamação; com ela, é uma lista de
 * consertos.
 *
 * ⚠ POR QUE ELE É PURO (sem DOM, sem Store, sem Util)
 * É a conta que decide se há saldo para comprar. Conta que decide compra não
 * pode ser código sem teste, e `js/gestao.js` não entra no gate. Tudo chega
 * por parâmetro — mesmo padrão de `js/porobra.js`, `js/bimpeca.js` e
 * `js/bimtubo.js`.
 *
 * ⚠ TRÊS REGIMES DE "REALIZADO", E ELES NÃO SÃO O MESMO NÚMERO
 *   · competência — o que já é obrigação (pago + em aberto). É o que se
 *     compara contra o orçamento, porque o orçamento também é obrigação.
 *   · caixa       — só o que saiu da conta. É o que se compara com o extrato.
 *   · comprometido— pedido de compra APROVADO e ainda não recebido. Não é
 *     despesa ainda, e é justamente o número que falta na hora de autorizar
 *     a próxima compra.
 * Misturar os três num só "realizado" é o defeito que o Painel já tem em
 * outra forma; aqui eles saem separados e rotulados.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js) — e ela precisou de DUAS
   * tentativas, o que é a lição. O módulo é puro (o gate o roda em Node, onde
   * `Util` não existe), então a regra vem copiada; mas meia regra erra tanto
   * quanto nenhuma, e nas duas direções:
   *   - `replace(/\./g,"")` às cegas lê "1234.56" como 123456   (×100)
   *   - só tratar o ponto quando há vírgula lê "1.850.000" como 1,85
   *     (÷1.000.000) — e essa foi a que eu escrevi consertando a primeira.
   * O segundo erro é pior: infla o saldo da etapa e a tela que decide compra
   * mostra a obra praticamente sem gasto.
   * A paridade com o `Util.parseNum` real é verificada em tools/test-numbr.js;
   * se um dos dois lados mudar, o gate acusa. */
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
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  /* pt-BR na mão: o módulo é puro e não enxerga `Util` (o gate o roda em Node) */
  function fmt(v) {
    var n = Math.abs(num(v)), s = n.toFixed(2).split(".");
    return "R$ " + (num(v) < 0 ? "-" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
  }
  function txt(s) { return String(s == null ? "" : s).trim(); }

  /* ⚠ ESTADO MORTO NÃO É GASTO. `cancelado` é registro morto: não é dívida
     nem saída. A tela antiga somava tudo, inclusive cancelado — e Compras já
     descartava, então as duas telas discordavam sobre a mesma obra.
     `estornado` não é estado: é o espelho de sinal oposto, que se cancela
     sozinho na soma (doutrina do js/finstatus.js). */
  function ehMorto(f) { return txt(f.status).toLowerCase() === "cancelado"; }
  function ehQuitado(f) {
    /* ⚠ SEM STATUS É PAGO, não é pendente. É a doutrina do js/finstatus.js
       (`norm(undefined) === "pago"`), e o registro legado do cliente nasceu
       sem o campo. Exigindo a string, `realizadoCaixa` descartava tudo que é
       anterior ao ciclo de vida novo — e a coluna que diz o que JÁ SAIU DO
       BANCO mostrava menos do que saiu, na mesma tela em que
       `realizadoCompetencia` contava certo. */
    var st = txt(f.status).toLowerCase();
    return st === "" || st === "pago";
  }

  /* De qual porta veio o lançamento sem etiqueta. O carimbo `docTipo` existe
     em compra (PC) e nota (NF); os outros se reconhecem pela descrição, que é
     o que há — e quando nem isso, entra em `semCarimbo`, que é a resposta
     honesta. */
  /* ⚠ ROTULO HUMANO AO LADO DE QUEM CRIA A CHAVE. `semCarimbo` e nome de
     CAMPO, e vazava para a tela dentro do aviso de cobertura: o usuario lia
     "Entrou principalmente por: compra, semCarimbo". A tela de Previsto x
     Realizado ja tinha o mapa de rotulos, mas o aviso e montado AQUI, no
     motor, e nao passava por ele. Nome interno na frase do usuario e
     vazamento de implementacao — quem le nao sabe o que e "semCarimbo". */
  var ROT_ORIGEM = { compra: "compra recebida", nota: "nota fiscal", folha: "folha",
    medicao: "medição", frota: "frota", semCarimbo: "sem origem identificada" };
  function rotuloOrigem(k) { return ROT_ORIGEM[k] || txt(k); }

  function origemDe(f) {
    var d = txt(f.docTipo).toUpperCase();
    if (d === "PC") return "compra";
    if (d === "NF") return "nota";
    /* ⚠ a receita da medição passou a ter carimbo próprio. Hoje o resultado
       é o mesmo que a descrição já dava — mas descrição é texto, e texto alguém
       edita: no dia em que “Recebimento medição 01ª” virar outra coisa, o
       dinheiro deixaria de ser atribuído à medição sem ninguém notar. */
    if (d === "MED") return "medicao";
    var s = txt(f.desc).toLowerCase();
    if (/^folha /.test(s)) return "folha";
    if (/^compra /.test(s)) return "compra";
    if (/medi[cç][aã]o/.test(s)) return "medicao";
    if (/^frota|ve[ií]culo/.test(s)) return "frota";
    return "semCarimbo";
  }

  /* ---------------------------------------------------------------
   * A árvore: etapa raiz e subetapa, com o item apontando para uma das duas
   * ------------------------------------------------------------- */
  function montarLinhas(orcamento) {
    var linhas = [], porId = {};
    arr(orcamento && orcamento.etapas).forEach(function (e) {
      var raiz = {
        etapaId: e.id, subEtapaId: "", nivel: 1,
        nome: (e.codigo ? e.codigo + " " : "") + (e.nome || "Etapa"),
        previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0
      };
      linhas.push(raiz); porId[e.id] = raiz;
      arr(e.subetapas).forEach(function (s) {
        var sub = {
          etapaId: e.id, subEtapaId: s.id, nivel: 2,
          nome: (s.codigo ? s.codigo + " " : "") + (s.nome || "Subetapa"),
          previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0
        };
        linhas.push(sub); porId[s.id] = sub;
      });
      /* ⚠ O PREVISTO É CUSTO DIRETO, SEM BDI — a mesma base do "custo real",
         senão previsto e realizado seriam grandezas diferentes com o mesmo
         nome, e o saldo mentiria a favor da obra. */
      arr(e.itens).forEach(function (it) {
        var v = num(it.quantidade) * num(it.custoUnitario);
        raiz.previsto += v;
        var sid = txt(it.subEtapaId);
        if (sid && porId[sid] && porId[sid].nivel === 2) porId[sid].previsto += v;
      });
    });
    return { linhas: linhas, porId: porId };
  }

  /* Onde o valor cai: na linha exata e, quando ela é subetapa, TAMBÉM na
     raiz — sem contar duas vezes no total (o total soma só nível 1). */
  function creditar(porId, id, campo, valor) {
    var alvo = porId[txt(id)];
    if (!alvo) return false;
    alvo[campo] += valor;
    if (alvo.nivel === 2) {
      var raiz = porId[alvo.etapaId];
      if (raiz && raiz !== alvo) raiz[campo] += valor;
    }
    return true;
  }

  /* ---------------------------------------------------------------
   * consolidar
   * ------------------------------------------------------------- */
  function consolidar(entrada) {
    entrada = entrada || {};
    var obraId = txt(entrada.obraId);
    var m = montarLinhas(entrada.orcamento);
    var linhas = m.linhas, porId = m.porId;

    var naoApropriado = { valor: 0, n: 0, porOrigem: {} };
    var compSemEtapa = { valor: 0, n: 0 };

    arr(entrada.financeiro).forEach(function (f) {
      if (!f || txt(f.tipo) !== "despesa") return;
      if (obraId && txt(f.obraId) !== obraId) return;
      if (ehMorto(f)) return;
      var v = num(f.valor);
      var quitado = ehQuitado(f);
      var caiu = creditar(porId, f.etapaId, "realizadoCompetencia", v);
      if (caiu) { if (quitado) creditar(porId, f.etapaId, "realizadoCaixa", v); return; }
      naoApropriado.valor += v; naoApropriado.n++;
      var o = origemDe(f);
      naoApropriado.porOrigem[o] = (naoApropriado.porOrigem[o] || 0) + v;
    });

    /* ⚠ COMPROMETIDO É PEDIDO APROVADO E AINDA NÃO RECEBIDO.
       Recebido já virou despesa e seria contado duas vezes — a mesma regra
       que `PorObra.totaisCompras` usa (`comprometido = aprovado`). */
    arr(entrada.compras).forEach(function (c) {
      if (!c) return;
      if (obraId && txt(c.obraId) !== obraId) return;
      if (txt(c.status).toLowerCase() !== "aprovado") return;
      var v = num(c.valor);
      if (creditar(porId, c.etapaId, "comprometido", v)) return;
      compSemEtapa.valor += v; compSemEtapa.n++;
    });

    var tot = { previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0 };
    linhas.forEach(function (l) {
      /* ⚠ O SALDO DESCONTA O COMPROMETIDO. É o número que decide se dá para
         comprar: "orçado 500k, realizado 300k, saldo 200k" convida a gastar
         quando há 180k em pedidos já aprovados esperando entrega. */
      l.saldo = l.previsto - l.comprometido - l.realizadoCompetencia;
      l.pct = l.previsto > 0 ? (l.realizadoCompetencia / l.previsto * 100)
        : (l.realizadoCompetencia > 0 ? 999 : 0);
      l.estouro = (l.comprometido + l.realizadoCompetencia) > l.previsto + 0.005;
      l.semPrevisto = !(l.previsto > 0);
      if (l.nivel === 1) {
        tot.previsto += l.previsto; tot.comprometido += l.comprometido;
        tot.realizadoCompetencia += l.realizadoCompetencia; tot.realizadoCaixa += l.realizadoCaixa;
      }
    });
    tot.saldo = tot.previsto - tot.comprometido - tot.realizadoCompetencia;

    /* ⚠ A COBERTURA É O AVISO QUE IMPEDE A TELA DE MENTIR. Com 70% do gasto
       sem etiqueta, as etapas parecem folgadas — e é exatamente aí que
       alguém autoriza a próxima compra olhando um saldo que não existe. */
    var gastoTotal = tot.realizadoCompetencia + naoApropriado.valor;
    var pctApropriado = gastoTotal > 0 ? (tot.realizadoCompetencia / gastoTotal * 100) : 100;
    var avisos = [];
    if (naoApropriado.valor > 0) {
      avisos.push(Math.round(100 - pctApropriado) + "% do gasto desta obra não está apropriado em etapa — " +
        "as etapas abaixo parecem ter mais saldo do que têm.");
      var portas = Object.keys(naoApropriado.porOrigem)
        .sort(function (a, b) { return naoApropriado.porOrigem[b] - naoApropriado.porOrigem[a]; });
      if (portas.length) avisos.push("Entrou principalmente por: " + portas.slice(0, 3).map(rotuloOrigem).join(", ") + ".");
    }
    if (compSemEtapa.valor > 0) {
      avisos.push(compSemEtapa.n + " pedido(s) de compra aprovado(s) somando " + fmt(compSemEtapa.valor) +
        " sem etapa — o dinheiro já está empenhado, mas não baixa o saldo de etapa nenhuma.");
    }

    return {
      linhas: linhas,
      naoApropriado: naoApropriado,
      comprometidoSemEtapa: compSemEtapa,
      totais: tot,
      cobertura: { pctApropriado: pctApropriado, avisos: avisos }
    };
  }

  var CustoEtapa = {
    consolidar: consolidar,
    origemDe: origemDe,
    _montarLinhas: montarLinhas
  };

  global.CustoEtapa = CustoEtapa;
  if (typeof module !== "undefined" && module.exports) module.exports = CustoEtapa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

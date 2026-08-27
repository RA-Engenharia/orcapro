/* =====================================================================
 * avancoservico.js — QUANTO JÁ FOI FEITO DESTE SERVIÇO, E QUANTO FALTA
 *
 * O diário sempre soube o que foi feito HOJE. O que ele nunca soube foi o
 * que já tinha sido feito ANTES. Na tela, "18 de 200" aparecia como
 * "9% do item" — o mesmo 9% que apareceria se nos dias anteriores a equipe
 * tivesse levantado 180 m² daquela parede. Quem apontava o dia não tinha
 * como saber se estava no começo ou terminando, e o previsto × realizado
 * da obra só existia depois, na medição, quando já era tarde para reagir.
 *
 * Aqui o serviço passa a ter as quatro contas que interessam:
 *
 *   anterior  — o que outros diários da MESMA obra já lançaram
 *   hoje      — o que está sendo digitado agora
 *   total     — anterior + hoje
 *   saldo     — previsto − total  (o que ainda falta)
 *
 * ⚠ TRÊS ARMADILHAS, TODAS JÁ PAGAS CARO NESTE SISTEMA:
 *
 * 1) DIÁRIO DO FUTURO NÃO ENTRA NO "ANTERIOR". Na medição por preços
 *    unitários, o acumulado anterior somava boletim com data POSTERIOR e o
 *    erro só apareceu quando alguém leu o impresso. Aqui a data manda:
 *    só conta diário com data ANTERIOR à do diário em edição (e, no
 *    empate, só os que já existiam).
 *
 * 2) O PRÓPRIO DIÁRIO NÃO PODE ENTRAR NA CONTA DELE MESMO. Ao editar um
 *    diário já salvo, o `hoje` que está na tela é o mesmo que está gravado:
 *    somar os dois dobra a quantidade em silêncio.
 *
 * 3) IDENTIDADE DE SERVIÇO NÃO É POSIÇÃO NA LISTA. Na folha por produção,
 *    a chave era o ÍNDICE do item e o preço de um serviço acabou pagando
 *    outro. Aqui a identidade é, em ordem: o vínculo com o orçamento
 *    (origem+refId), depois código, depois descrição — sempre com a
 *    unidade junto, porque 200 m² e 200 m³ não são o mesmo serviço.
 *
 * E o total NÃO é aparado no previsto. Executar 210 de 200 previstos é um
 * fato — pode ser aditivo, pode ser erro de apontamento —, e esconder isso
 * atrás de um "100%" tira do usuário justamente o aviso de que algo saiu
 * do combinado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    /* número em português: 1.234,56 — e também aceita 1234.56 de importação */
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  /* sem acento, sem caixa, sem espaço duplo: "Alvenaria de Vedação" e
     "ALVENARIA DE VEDACAO " são o mesmo serviço para quem aponta o dia */
  function normal(s) {
    var t = texto(s).toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t.replace(/\s+/g, " ");
  }
  /* duas casas: o resto é ruído de ponto flutuante virando "179.99999999998" */
  function r2(n) { return Math.round(n * 100) / 100; }

  /* -------------------------------------------------------------------
   * A CHAVE DO SERVIÇO.
   * Devolve string ou "" quando não há como identificar — e "" NUNCA casa
   * com nada. Serviço sem descrição e sem vínculo não pode ser somado com
   * outro serviço sem descrição: seriam dois desconhecidos virando um.
   * ----------------------------------------------------------------- */
  function chaveServico(it) {
    if (!it) return "";
    var un = normal(it.unidade);
    var ref = texto(it.refId);
    if (ref) return "r|" + normal(it.origem) + "|" + ref + "|" + un;
    var cod = texto(it.numero) || texto(it.codigo);
    if (cod) return "c|" + normal(cod) + "|" + un;
    var desc = normal(it.descricao);
    if (desc) return "d|" + desc + "|" + un;
    return "";
  }

  /* -------------------------------------------------------------------
   * O QUE OS OUTROS DIÁRIOS JÁ LANÇARAM DESTE SERVIÇO.
   *
   * `d`: { rdos, obraId, data, rdoId, item }
   *   data  — a data do diário em edição (ISO). Diário com data MAIOR não
   *           entra; com data IGUAL entra só se for outro diário já salvo.
   *   rdoId — o diário em edição, para ele não se somar (armadilha 2).
   *
   * `opc.estados` — quais estados contam. Por padrão contam TODOS, porque
   * o serviço foi executado independentemente de o gestor já ter aprovado
   * o papel; quem quiser a régua da medição passa a lista.
   * ----------------------------------------------------------------- */
  function anterior(d, opc) {
    d = d || {}; var o = opc || {};
    var chave = chaveServico(d.item);
    var vazio = { qtd: 0, diarios: 0, porDiario: [], semChave: !chave,
      refeito: 0, diariosRefeito: 0, porDiarioRefeito: [] };
    if (!chave) return vazio;

    var dataAtual = texto(d.data);
    var meuId = texto(d.rdoId);
    var estados = o.estados && o.estados.length ? o.estados : null;
    var soma = 0, quais = [];
    var refeito = 0, quaisRefeito = [];

    (d.rdos || []).forEach(function (r) {
      if (!r) return;
      if (d.obraId && texto(r.obraId) !== texto(d.obraId)) return;
      if (meuId && texto(r.id) === meuId) return;          // armadilha 2

      /* armadilha 1: diário de data POSTERIOR não é "anterior" */
      var dr = texto(r.data);
      if (dataAtual && dr && dr > dataAtual) return;

      if (estados) {
        var e = texto(r.estado) || texto(r.status);
        if (estados.indexOf(e) < 0) return;
      }

      (r.atividadesItens || r.ativ || []).forEach(function (it) {
        if (chaveServico(it) !== chave) return;
        var q = num(it.qtdExecutada);
        if (!q) return;
        /* ⚠ RETRABALHO NÃO SOMA NO AVANÇO — E SOMAVA.
         * O encarregado marca "Retrabalho" no serviço quando REFAZ o que já
         * estava feito. A quantidade refeita não é obra nova: contá-la de
         * novo infla o físico. Numa parede de 200 m², 100 m² executados mais
         * 60 m² marcados como retrabalho davam "160 m², 80%" — quando existem
         * 100 m² em pé, 50%. E esse número inflado ia para o Portal do
         * cliente e para o boletim impresso.
         * A palavra `situacao` não aparecia neste arquivo: o campo era lido
         * para MOSTRAR e nunca para decidir. Fica registrado à parte, porque
         * quanto se refez é informação que o dono quer — só não é avanço. */
        if (texto(it.situacao) === "retrabalho") {
          refeito += q;
          quaisRefeito.push({ rdoId: r.id, data: dr, numero: r.numero || "", qtd: q });
          return;
        }
        soma += q;
        quais.push({ rdoId: r.id, data: dr, numero: r.numero || "", qtd: q, estado: texto(r.estado) });
      });
    });

    quais.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
    return { qtd: r2(soma), diarios: quais.length, porDiario: quais, semChave: false,
      /* o que foi REFEITO: fora do avanço, mas à vista — o dono quer saber */
      refeito: r2(refeito), diariosRefeito: quaisRefeito.length, porDiarioRefeito: quaisRefeito };
  }

  /* -------------------------------------------------------------------
   * O RETRATO COMPLETO DA LINHA, que é o que a tela e o impresso mostram.
   * ----------------------------------------------------------------- */
  function calcular(d, opc) {
    d = d || {};
    var item = d.item || {};
    var ant = anterior(d, opc);
    var prev = num(item.qtdPrevista);
    /* ⚠ O DIA DE HOJE SEGUE A MESMA REGRA DOS ANTERIORES.
       O laço de `anterior` já tira o retrabalho; se `hoje` não tirasse, a
       linha mostraria 80% no dia em que a marca é lançada e 50% no dia
       seguinte, e o impresso daquele dia sairia com o número inflado bem ao
       lado de "(60 refeitos)". Duas contas para a mesma quantidade, com um
       dia de distância. */
    var hojeRefeito = texto(item.situacao) === "retrabalho";
    var hoje = hojeRefeito ? 0 : num(item.qtdExecutada);
    var refeitoHoje = hojeRefeito ? num(item.qtdExecutada) : 0;
    var total = r2(ant.qtd + hoje);
    var saldo = prev > 0 ? r2(prev - total) : 0;

    function pct(q) { return prev > 0 ? Math.round((q / prev) * 1000) / 10 : 0; }

    return {
      unidade: texto(item.unidade),
      previsto: r2(prev),
      anterior: ant.qtd,
      hoje: r2(hoje),
      total: total,
      saldo: saldo,
      /* percentuais SEM aparar: 105% precisa aparecer como 105% */
      pctAnterior: pct(ant.qtd),
      pctHoje: pct(hoje),
      pctTotal: pct(total),
      pctSaldo: prev > 0 ? Math.round((saldo / prev) * 1000) / 10 : 0,
      temPrevisto: prev > 0,
      /* passou do previsto: fato a mostrar, não erro a esconder */
      excedeu: prev > 0 && total > prev,
      excedente: prev > 0 && total > prev ? r2(total - prev) : 0,
      concluido: prev > 0 && total >= prev,
      diarios: ant.diarios,
      porDiario: ant.porDiario,
      /* refeito NÃO entra em `total` nem em `pctTotal` — ver a nota no laço.
         Soma o dos dias anteriores com o de hoje, para a linha não mudar de
         número quando o diário do dia for salvo. */
      refeito: r2((ant.refeito || 0) + refeitoHoje),
      refeitoHoje: r2(refeitoHoje),
      temRetrabalho: ((ant.refeito || 0) + refeitoHoje) > 0,
      semChave: ant.semChave
    };
  }

  /* -------------------------------------------------------------------
   * ENTRADA POR PORCENTAGEM
   *
   * ⚠ "20%" É AMBÍGUO, E A AMBIGUIDADE CORROMPE QUANTIDADE EM SILÊNCIO.
   * Quem aponta pode querer dizer duas coisas completamente diferentes:
   *
   *   modo "hoje"      — "hoje eu fiz 20% do serviço"     → qtd = 20% do previsto
   *   modo "acumulado" — "o serviço chegou a 20%"          → qtd = 20% do previsto
   *                                                            MENOS o que já havia
   *
   * Com 200 previstos e 150 já feitos, "20%" vale 40 no primeiro caso e é
   * IMPOSSÍVEL no segundo (o serviço já passou de 20%). Por isso o modo é
   * explícito e a função devolve `impossivel` em vez de um número negativo
   * disfarçado de zero.
   * ----------------------------------------------------------------- */
  function qtdDePct(pct, d, modo) {
    var p = num(pct);
    var prev = num(d && d.previsto);
    var ant = num(d && d.anterior);
    if (prev <= 0) return { ok: false, motivo: "sem-previsto", qtd: 0 };

    var alvo = r2(prev * p / 100);
    if (modo === "acumulado") {
      var q = r2(alvo - ant);
      if (q < 0) {
        return { ok: false, motivo: "impossivel", qtd: 0, jaEm: prev > 0 ? Math.round((ant / prev) * 1000) / 10 : 0 };
      }
      return { ok: true, qtd: q, alvoTotal: alvo };
    }
    return { ok: true, qtd: alvo, alvoTotal: r2(ant + alvo) };
  }

  /* o caminho inverso, para a tela mostrar a % enquanto se digita quantidade */
  function pctDeQtd(qtd, previsto) {
    var prev = num(previsto);
    if (prev <= 0) return 0;
    return Math.round((num(qtd) / prev) * 1000) / 10;
  }

  /* -------------------------------------------------------------------
   * TOTAIS DA OBRA — previsto × realizado, para o cabeçalho e o impresso.
   * Só entram serviços COM previsto: somar quantidade de m² com unidade e
   * com m³ daria um número que não significa nada.
   * ----------------------------------------------------------------- */
  function resumoObra(rdos, obraId, opc) {
    var porChave = {};
    (rdos || []).forEach(function (r) {
      if (!r) return;
      if (obraId && texto(r.obraId) !== texto(obraId)) return;
      if (opc && opc.ate && texto(r.data) && texto(r.data) > opc.ate) return;
      (r.atividadesItens || r.ativ || []).forEach(function (it) {
        var k = chaveServico(it);
        if (!k) return;
        if (!porChave[k]) {
          porChave[k] = { chave: k, descricao: texto(it.descricao), numero: texto(it.numero),
                          unidade: texto(it.unidade), previsto: 0, executado: 0, refeito: 0, lancamentos: 0 };
        }
        var linha = porChave[k];
        /* o previsto é o MAIOR já visto, não a soma: ele se repete em todo
           diário do mesmo serviço, e somar daria 200 × número de dias */
        var prev = num(it.qtdPrevista);
        if (prev > linha.previsto) linha.previsto = prev;
        var q = num(it.qtdExecutada);
        /* mesmo motivo do laço de `anterior`: refazer não é avançar */
        if (q && texto(it.situacao) === "retrabalho") { linha.refeito = r2((linha.refeito || 0) + q); return; }
        if (q) { linha.executado = r2(linha.executado + q); linha.lancamentos++; }
      });
    });
    var itens = Object.keys(porChave).map(function (k) {
      var l = porChave[k];
      l.saldo = l.previsto > 0 ? r2(l.previsto - l.executado) : 0;
      l.pct = l.previsto > 0 ? Math.round((l.executado / l.previsto) * 1000) / 10 : 0;
      l.excedeu = l.previsto > 0 && l.executado > l.previsto;
      return l;
    });
    itens.sort(function (a, b) { return (a.numero || a.descricao).localeCompare(b.numero || b.descricao); });
    return { itens: itens, total: itens.length };
  }

  var Avanco = {
    chaveServico: chaveServico,
    anterior: anterior,
    calcular: calcular,
    qtdDePct: qtdDePct,
    pctDeQtd: pctDeQtd,
    resumoObra: resumoObra
  };
  global.Avanco = Avanco;
  if (typeof module !== "undefined" && module.exports) module.exports = Avanco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

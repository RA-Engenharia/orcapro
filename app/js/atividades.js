/* =====================================================================
 * atividades.js — TABELA DE PREÇOS UNITÁRIOS DA OBRA e o cálculo da
 * medição que nasce dela. Motor PURO, Node-testável — a view fica no
 * gestao.js.
 *
 * POR QUE EXISTE: a medição só sabia dois caminhos — medir os itens de um
 * ORÇAMENTO (por % de execução sobre a quantidade contratada) ou lançar um
 * VALOR solto com uma descrição. Quem toca obra **sem valor global fechado**
 * ficava de fora: administração, série de preços, execução por diária. Esse
 * cliente executa 40 m² de reboco a R$ 32/m² e precisa medir isso, sem que
 * exista um contrato por cima para dar o denominador de nenhum percentual.
 *
 * DUAS REGRAS QUE NÃO PODEM CAIR:
 *
 * 1) O BOLETIM CONGELA O PREÇO. A linha da medição guarda descrição, unidade
 *    e valor unitário COPIADOS da atividade no momento do lançamento — nunca
 *    uma referência viva. Reajustar a tabela em setembro não pode mudar o
 *    valor de um boletim assinado em agosto. É a mesma regra que a v1.1.170
 *    trouxe para a medição aprovada.
 *
 * 2) O ACUMULADO É POR QUANTIDADE, não por percentual. Sem valor global não
 *    existe "% do contrato": o que se acompanha é quanto já foi medido de
 *    cada serviço. Inventar um percentual aqui seria inventar o denominador.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
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

  function limpo(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  /* Arredonda a 2 casas ANTES de somar, como planilha faz. Sem isso a soma
     float diverge um centavo do que o usuário confere na calculadora — e num
     boletim de medição um centavo é o suficiente para o cliente recusar. */
  function cent(v) { return Math.round((num(v) + Number.EPSILON) * 100) / 100; }

  /* valor de UMA linha medida: quantidade × preço unitário */
  function valorLinha(l) {
    if (!l) return 0;
    return cent(num(l.qtd) * num(l.valorUnitario));
  }

  /* total do boletim = soma das linhas, cada uma já arredondada */
  function totalMedicao(linhas) {
    var t = 0;
    (linhas || []).forEach(function (l) { t = cent(t + valorLinha(l)); });
    return t;
  }

  /* Congela a atividade dentro da medição. O `valorUnitario` pode vir
     sobrescrito na linha (aquela obra combinou outro preço) — o que vale é o
     que está escrito aqui, não o que a tabela disser amanhã. */
  function linhaDaAtividade(atv, qtd, valorUnitario) {
    atv = atv || {};
    var vu = (valorUnitario === undefined || valorUnitario === null || valorUnitario === "")
      ? num(atv.valorUnitario) : num(valorUnitario);
    var l = {
      atividadeId: atv.id || "",
      codigo: limpo(atv.codigo),
      descricao: limpo(atv.descricao),
      unidade: limpo(atv.unidade),
      valorUnitario: vu,
      qtd: num(qtd)
    };
    l.valor = valorLinha(l);
    return l;
  }

  /* Ordem de um boletim na obra: período primeiro, número como desempate.
     É a MESMA chave que a medição por orçamento usa (`_medKey`) — duas contas
     de "anterior" com ordens diferentes fariam o mesmo boletim ter dois
     acumulados. */
  function chaveOrdem(m) {
    m = m || {};
    return String(m.periodoFim || m.periodoInicio || "") + "|" + String(m.numero || "");
  }

  /* Quanto já foi medido de cada atividade nos boletins ANTERIORES da obra.
     Sem valor global, é isto que dá a noção de acumulado.
     `atual` pode ser o registro inteiro ou só o id.

     ⚠ ANTERIOR É ANTERIOR NO TEMPO, não "todos os outros". A primeira versão
     somava qualquer outro boletim da obra, e aí o boletim de AGOSTO impresso
     depois trazia a quantidade medida em SETEMBRO na coluna "Qtd anterior" —
     um documento assinado afirmando um acumulado que não existia na data
     dele. Boletim emitido não pode mudar porque veio um depois. */
  function qtdAnteriorPorAtividade(medicoes, obraId, atual) {
    var acc = {};
    var ehObj = atual && typeof atual === "object";
    var atualId = ehObj ? atual.id : atual;
    /* Só dá para ordenar se o boletim atual tiver período ou número. Sem
       isso — prévia no formulário, ou registro antigo salvo sem período —
       a conta cai no "tudo o que já foi medido nesta obra": entregar 0 ali
       esconderia o acumulado e faria o usuário remedir o que já mediu. */
    var kAtual = ehObj ? chaveOrdem(atual) : "|";
    var daParaOrdenar = kAtual !== "|";
    (medicoes || []).forEach(function (m) {
      if (!m || m.obraId !== obraId) return;
      if (m.status === "rejeitada") return; // v1.1.234 — boletim recusado não é medido
      if (atualId != null && String(m.id) === String(atualId)) return;
      if (daParaOrdenar && chaveOrdem(m) >= kAtual) return;
      (m.itens || []).forEach(function (l) {
        if (!l || !l.atividadeId) return;
        acc[l.atividadeId] = num(acc[l.atividadeId]) + num(l.qtd);
      });
    });
    return acc;
  }

  /* Resumo de um boletim por preços unitários, pronto para a tela e para o
     impresso: cada linha com anterior/período/acumulado em QUANTIDADE. */
  function resumo(medicao, medicoesDaObra) {
    var m = medicao || {};
    /* passa o REGISTRO, não o id: é o que permite contar só os boletins
       anteriores no tempo (ver qtdAnteriorPorAtividade) */
    var ant = qtdAnteriorPorAtividade(medicoesDaObra || [], m.obraId, m);
    var linhas = (m.itens || []).map(function (l) {
      var a = num(ant[l.atividadeId]), q = num(l.qtd);
      return {
        atividadeId: l.atividadeId, codigo: l.codigo, descricao: l.descricao,
        unidade: l.unidade, valorUnitario: num(l.valorUnitario),
        qtdAnterior: a, qtd: q, qtdAcumulada: a + q, valor: valorLinha(l)
      };
    });
    return { linhas: linhas, total: totalMedicao(m.itens) };
  }

  /* Cópia da tabela de uma obra para outra. Gera registros PRÓPRIOS (id novo),
     nunca referência: mexer no preço da obra A não pode mexer no da B.
     Não duplica o que já existe na obra destino — a chave é código quando há,
     senão descrição + unidade, sem depender de maiúscula/acento de digitação. */
  function chaveAtv(a) {
    var cod = limpo(a && a.codigo).toUpperCase();
    if (cod) return "C|" + cod;
    return "D|" + limpo(a && a.descricao).toUpperCase() + "|" + limpo(a && a.unidade).toUpperCase();
  }
  function copiarParaObra(origem, jaNaDestino, obraDestinoId, novoId) {
    var existentes = {};
    (jaNaDestino || []).forEach(function (a) { existentes[chaveAtv(a)] = true; });
    var novas = [], puladas = 0;
    (origem || []).forEach(function (a, i) {
      if (existentes[chaveAtv(a)]) { puladas++; return; }
      existentes[chaveAtv(a)] = true;
      novas.push({
        id: typeof novoId === "function" ? novoId(a, i) : undefined,
        obraId: obraDestinoId,
        codigo: limpo(a.codigo), descricao: limpo(a.descricao),
        /* a etapa vai junto na cópia: sem ela a obra destino recebia a tabela
           inteira "sem etapa" e o avanço por etapa do Portal nascia vazio
           justamente na obra que copiou de uma que já estava classificada */
        etapa: limpo(a.etapa),
        unidade: limpo(a.unidade), valorUnitario: num(a.valorUnitario),
        ativo: a.ativo !== false
      });
    });
    return { novas: novas, puladas: puladas };
  }

  var Atividades = {
    num: num, cent: cent,
    valorLinha: valorLinha, totalMedicao: totalMedicao,
    linhaDaAtividade: linhaDaAtividade,
    qtdAnteriorPorAtividade: qtdAnteriorPorAtividade,
    resumo: resumo, chaveAtv: chaveAtv, chaveOrdem: chaveOrdem, copiarParaObra: copiarParaObra
  };

  global.Atividades = Atividades;
  if (typeof module !== "undefined" && module.exports) module.exports = Atividades;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

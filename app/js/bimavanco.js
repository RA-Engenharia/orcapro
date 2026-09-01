/* =====================================================================
 * bimavanco.js — O AVANÇO REAL CHEGA AO 4D (motor PURO)
 *
 * O QUE ESTAVA ERRADO. A simulação 4D decide o estado de cada tarefa
 * OLHANDO SÓ DATAS (`bimtarefa.estadoEm`): `realInicio || previstoInicio`.
 * Como `realInicio`/`realFim` só existem se alguém os digitar — quatro
 * campos de data por tarefa, à mão, tarefa a tarefa — na prática o 4D
 * mostra o PLANO e o chama de realidade. O contorno do atraso, que o B6
 * construiu com malha mesclada para aguentar 4.000 peças, só aparece se
 * alguém tiver digitado que atrasou.
 *
 * E o app JÁ SABE o avanço real: a medição. Cada boletim guarda
 * `itens: [{ itemId, pctPeriodo }]` e o período em que foi medido. É
 * documento auditado — é o que virou dinheiro.
 *
 * Três campos de `bim_tarefas` foram criados para essa ponte e nunca
 * ganharam fiação:
 *   · `percentual` — o comentário do arquivo diz, com todas as letras, "o
 *     percentual é o que a medição informa". Só os importadores de CSV e
 *     MS Project o escrevem, e NINGUÉM o lê. Quem importa um .xml com
 *     "60% completo" tem o número guardado e silenciosamente ignorado.
 *   · `itemOrcId` e `etapaOrc` — não são escritos nem lidos em lugar
 *     nenhum do app. (`alvo.tipo === "etapaOrcamento"` engana pelo nome:
 *     o `ref` dele é o carimbo `el.etapa` da PEÇA do IFC, não a etapa do
 *     orçamento.)
 *
 * Este motor calcula o número; quem decide o estado continua sendo o
 * `bimtarefa.js`, que ganhou um argumento opcional.
 *
 * ---------------------------------------------------------------------
 * AS CINCO REGRAS QUE MANDAM AQUI
 * ---------------------------------------------------------------------
 *
 * 1. ⚠ A MEDIÇÃO TEM LINHA DO TEMPO, NÃO É UMA FOTO DE HOJE. Só entram os
 *    boletins cujo período FECHOU até a data pedida. Usar o acumulado de
 *    hoje em toda a régua faria março exibir o avanço de agosto — e o
 *    vídeo do 4D, que vai para a reunião, mostraria uma obra que não
 *    existiu. Boletim sem data de período NÃO entra: não há onde pô-lo na
 *    régua, e empurrá-lo para "hoje" é inventar.
 *
 * 2. ⚠ BOLETIM REJEITADO NÃO É AVANÇO. Mesma regra que o financeiro já
 *    aplica (v1.1.234): o fiscal recusou, então aquilo não foi executado.
 *
 * 3. ⚠ A ETAPA É PONDERADA POR VALOR, NUNCA POR MÉDIA SIMPLES. Uma etapa
 *    com um item de R$ 100 a 100% e outro de R$ 100.000 a 0% está 0,1%
 *    executada, não 50%. E quando a etapa inteira está com custo zerado —
 *    que é exatamente como o quantitativo do BIM lança (`custoUnitario:
 *    0`) — não dá para ponderar por valor: aí cai para média simples E
 *    DIZ QUE CAIU, em vez de fingir precisão que não tem.
 *
 * 4. ⚠ "SEM DETALHE POR ITEM" NÃO É ZERO POR CENTO. Boletim no modo valor
 *    aberto ou por atividades não tem percentual por item do orçamento.
 *    Tratá-lo como 0% pintaria de "não iniciado" uma obra que já faturou —
 *    a pior leitura possível. Ele é contado à parte e a tela avisa.
 *
 * 5. ⚠ NADA AQUI ESCREVE NO CRONOGRAMA. O motor devolve o número e a
 *    FONTE dele; o plano continua sendo o que o engenheiro planejou. Um
 *    avanço que reescrevesse a data prevista apagaria a única referência
 *    contra a qual o atraso é medido.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* a régua de datas é a do bimtarefa — uma só implementação, como no resto
     da casa. Réplica nenhuma: sem ele, este motor não roda e diz por quê. */
  function BT() {
    if (global.BimTarefa) return global.BimTarefa;
    if (typeof require === "function") { try { return require("./bimtarefa.js"); } catch (e) { /* sem bimtarefa */ } }
    return null;
  }

  function txt(v) { return String(v == null ? "" : v).trim(); }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function dia(v) { var b = BT(); return b && b.dia ? b.dia(v) : txt(v).slice(0, 10); }

  /* ---------------------------------------------------------------------
   * ⚠ O QUE CONTA COMO OBRA FEITA
   *
   * O boletim NASCE `pendente` e o fiscal aprova ou rejeita. Esta lista
   * começou só com "rejeitada" — e o comentário que estava aqui já dizia,
   * com todas as letras, que rascunho é intenção e não obra feita, uma regra
   * que o código NÃO aplicava. O resultado, medido: obra com um boletim
   * aprovado de 30% e outro PENDENTE de 55% aparecia como
   *     30% no Painel (Gestao._avancoMedido, que sempre exigiu aprovada/paga)
   *     85% no 4D, na pintura do modelo e no RELATÓRIO IMPRESSO PARA O CLIENTE
   *     55% no arquivo que vai para o plugin do Revit
   * Três respostas para a mesma obra, e a que ia para o cliente era a maior —
   * baseada numa medição que o fiscal podia rejeitar no dia seguinte. Quando
   * rejeitasse, o modelo despintava e o documento já entregue ficava sem
   * explicação.
   *
   * ⚠ É LISTA DE EXCLUSÃO, NÃO DE INCLUSÃO, e isso é decisão: boletim ANTIGO
   *   pode não ter o campo `status` (ele nem sempre existiu). Exigir
   *   "aprovada" apagaria o histórico dessas obras da tela e do relatório —
   *   regressão visível em dado real de cliente. Só quem está explicitamente
   *   pendente ou rejeitado fica de fora.
   *
   * ⚠ E `_pctAnterioresPorItem` (js/gestao.js) NÃO segue esta regra, de
   *   propósito: lá a pergunta é "quanto já foi RECLAMADO", para não medir
   *   duas vezes o mesmo serviço — e para isso um boletim pendente tem de
   *   contar. São perguntas diferentes com respostas diferentes.
   * ------------------------------------------------------------------- */
  var NAO_CONTA = { rejeitada: 1, pendente: 1 };
  /* separadas porque as duas frases são diferentes: "o fiscal recusou" é um
     fato encerrado; "aguardando o fiscal" é uma coisa que ainda vai mudar */
  var AGUARDANDO = { pendente: 1 };

  /* ---------------------------------------------------------------------
   * O MAPA DO ORÇAMENTO — item → etapa e valor
   *
   * O valor é o CUSTO DIRETO do item (quantidade × unitário), sem BDI: a
   * ponderação compara peso relativo entre itens da mesma etapa, e o BDI,
   * sendo percentual, não muda essa proporção — mas muda o número, e
   * número que muda sem motivo é o que faz alguém desconfiar do relatório.
   * ------------------------------------------------------------------- */
  function mapaDoOrcamento(orcamento) {
    var porItem = {}, etapas = [];
    arr(orcamento && orcamento.etapas).forEach(function (e) {
      if (!e) return;
      var eid = txt(e.id), enome = txt(e.nome);
      var lista = [];
      arr(e.itens).forEach(function (it) {
        if (!it || !txt(it.id)) return;
        var v = num(it.quantidade) * num(it.custoUnitario);
        porItem[txt(it.id)] = { etapaId: eid, etapaNome: enome, valor: v, descricao: txt(it.descricao), unidade: txt(it.unidade) };
        lista.push(txt(it.id));
      });
      etapas.push({ id: eid, nome: enome, itens: lista });
    });
    return { porItem: porItem, etapas: etapas };
  }

  /* ---------------------------------------------------------------------
   * O AVANÇO NUMA DATA
   *
   * `dataISO` vazia = tudo o que já foi medido (o acumulado de hoje).
   * ------------------------------------------------------------------- */
  function avancoEm(medicoes, orcamento, dataISO, opts) {
    var o = opts || {};
    var d = dia(dataISO);
    var mapa = mapaDoOrcamento(orcamento);
    var orcId = txt(orcamento && orcamento.id);

    var porItem = {}, usados = 0, ignorados = [], pendentes = [], semDetalhe = [], orfaos = {}, ultimo = null;

    /* ordem por período fechado: o acumulado tem de ser somado na ordem em
       que a obra aconteceu, e a lista do Store não promete ordem nenhuma */
    var lista = arr(medicoes).filter(Boolean).slice().sort(function (a, b) {
      return String(quandoFechou(a)).localeCompare(String(quandoFechou(b)));
    });

    lista.forEach(function (m) {
      var rot = txt(m.numero) || txt(m.id) || "(sem número)";
      var st = txt(m.status).toLowerCase();
      if (AGUARDANDO[st]) {
        pendentes.push({ rotulo: rot, quando: quandoFechou(m), pct: num(m.percentual),
          motivo: "Aguardando aprovação do fiscal — ainda não é obra feita." });
        return;
      }
      if (NAO_CONTA[st]) {
        ignorados.push({ rotulo: rot, motivo: "Boletim rejeitado — o fiscal recusou, então não é obra feita." });
        return;
      }
      /* boletim de OUTRO orçamento não fala destes itens */
      if (orcId && txt(m.orcamentoId) && txt(m.orcamentoId) !== orcId) {
        ignorados.push({ rotulo: rot, motivo: "É de outro orçamento." });
        return;
      }
      var quando = quandoFechou(m);
      if (!quando) {
        /* ⚠ regra 1: sem data não há lugar na régua, e chutar "hoje" faria o
           passado exibir avanço que ainda não existia naquele dia. */
        ignorados.push({ rotulo: rot, motivo: "Sem data de período — não dá para posicioná-lo na linha do tempo." });
        return;
      }
      if (d && quando > d) return;                 // ainda não aconteceu nesta data

      var itens = arr(m.itens).filter(function (it) { return it && txt(it.itemId) && it.pctPeriodo != null; });
      if (!itens.length) {
        /* ⚠ regra 4 */
        semDetalhe.push({ rotulo: rot, quando: quando, valor: num(m.valor), modo: txt(m.modo) });
        return;
      }
      usados++;
      if (!ultimo || quando > ultimo.quando) ultimo = { rotulo: rot, quando: quando };
      itens.forEach(function (it) {
        var id = txt(it.itemId);
        if (!mapa.porItem[id]) {
          /* item apagado do orçamento depois do boletim: o percentual existe e
             não tem mais onde pousar. Some da conta, aparece na tela. */
          orfaos[id] = (orfaos[id] || 0) + num(it.pctPeriodo);
          return;
        }
        porItem[id] = Math.min(100, num(porItem[id]) + num(it.pctPeriodo));
      });
    });

    /* --- por etapa, ponderado por valor (regra 3) --- */
    var porEtapa = {}, ponderacao = {};
    mapa.etapas.forEach(function (e) {
      if (!e.itens.length) return;
      var somaV = 0, somaVP = 0, somaP = 0;
      e.itens.forEach(function (id) {
        var v = mapa.porItem[id].valor, p = num(porItem[id]);
        somaV += v; somaVP += v * p; somaP += p;
      });
      var chave = e.id || e.nome;
      if (somaV > 0) { porEtapa[chave] = somaVP / somaV; ponderacao[chave] = "valor"; }
      else { porEtapa[chave] = somaP / e.itens.length; ponderacao[chave] = "simples"; }
      porEtapa[chave] = Math.round(porEtapa[chave] * 10) / 10;
      /* a etapa também responde pelo nome: a tarefa pode ter sido ligada
         antes de a etapa ganhar id, e o nome é o que o usuário escolheu */
      if (e.nome && e.nome !== chave && porEtapa[e.nome] === undefined) {
        porEtapa[e.nome] = porEtapa[chave]; ponderacao[e.nome] = ponderacao[chave];
      }
    });

    /* o que o orçamento CONHECE viaja junto: sem isto, `pctDaTarefa` teria de
       remontar o mapa do orçamento a cada tarefa e a cada quadro do vídeo —
       144 quadros × 40 tarefas × 100 itens para responder uma pergunta que já
       estava respondida aqui. */
    var conhecidos = {};
    Object.keys(mapa.porItem).forEach(function (k) { conhecidos[k] = 1; });
    var etapasConhecidas = {};
    Object.keys(porEtapa).forEach(function (k) { etapasConhecidas[k] = 1; });

    return {
      data: d, porItem: porItem, porEtapa: porEtapa, ponderacao: ponderacao,
      itensDoOrcamento: conhecidos, etapasDoOrcamento: etapasConhecidas,
      boletins: usados, ignorados: ignorados, pendentes: pendentes, semDetalhe: semDetalhe,
      orfaos: Object.keys(orfaos).map(function (id) { return { itemId: id, pct: orfaos[id] }; }),
      ultimo: ultimo,
      /* a tela precisa saber se há QUALQUER medição utilizável antes de
         oferecer o modo "real" — senão o botão liga e não muda nada */
      temFonte: usados > 0
    };
  }

  function quandoFechou(m) {
    return dia(m && (m.periodoFim || m.data || m.periodoInicio));
  }

  /* ---------------------------------------------------------------------
   * O PERCENTUAL DE UMA TAREFA
   *
   * ⚠ "0%" E "SEM FONTE" SÃO COISAS DIFERENTES, e confundi-las é o defeito
   *   que faria a obra inteira nascer atrasada. Item que existe no
   *   orçamento e ninguém mediu está a 0% — fato medido. Tarefa que não
   *   aponta para item nenhum não tem fonte: ali o PLANO continua mandando,
   *   e a tela diz que aquela tarefa não é conferível.
   * ------------------------------------------------------------------- */
  function pctDaTarefa(tarefa, avanco, orcamento) {
    var t = tarefa || {}, a = avanco || {};
    /* o `avanco` já traz o que o orçamento conhece; o 3º argumento continua
       aceito para quem chamar sem ter rodado `avancoEm` antes */
    var conhece = a.itensDoOrcamento || (orcamento ? mapaDoOrcamento(orcamento).porItem : null);

    var iid = txt(t.itemOrcId);
    if (iid) {
      if (conhece && !conhece[iid]) {
        return { pct: null, fonte: "sem-fonte", motivo: 'A tarefa aponta para um item que não está mais neste orçamento.' };
      }
      return { pct: num(a.porItem && a.porItem[iid]), fonte: "item", motivo: "" };
    }
    var eid = txt(t.etapaOrc);
    if (eid) {
      var v = a.porEtapa ? a.porEtapa[eid] : undefined;
      if (v === undefined) {
        return { pct: null, fonte: "sem-fonte", motivo: 'A tarefa aponta para uma etapa que não está mais neste orçamento.' };
      }
      return { pct: num(v), fonte: "etapa", ponderacao: (a.ponderacao || {})[eid] || "valor", motivo: "" };
    }
    return { pct: null, fonte: "sem-fonte", motivo: "Esta tarefa não está ligada a nenhum item nem etapa do orçamento — o cronograma continua mandando nela." };
  }

  /* ---------------------------------------------------------------------
   * O QUE O PLANO PROMETIA NAQUELE DIA
   *
   * ⚠ INTERPOLAÇÃO LINEAR, E ISSO É UMA SUPOSIÇÃO — a mesma que o MS
   *   Project faz para comparar "% completo" com "% previsto". Obra real
   *   tem curva S, então o número aqui é referência, não sentença: por isso
   *   o atraso parcial exige uma folga em pontos percentuais antes de
   *   acusar, e a tela diz de onde veio a comparação.
   * ------------------------------------------------------------------- */
  function planejadoEm(tarefa, dataISO) {
    var b = BT(); if (!b) return 0;
    var t = b.tarefa ? b.tarefa(tarefa) : (tarefa || {});
    var d = dia(dataISO);
    var ini = t.previstoInicio, fim = t.previstoFim;
    if (!d || !ini || !fim) return 0;
    if (d < ini) return 0;
    if (d >= fim) return 100;
    var total = b.diasEntre(ini, fim);
    if (!(total > 0)) return 100;
    return Math.max(0, Math.min(100, (b.diasEntre(ini, d) / total) * 100));
  }

  /* frase honesta para a tela — inclui o que NÃO entrou na conta */
  function fraseAvanco(a) {
    if (!a) return "";
    if (!a.boletins) {
      if (a.semDetalhe.length) {
        return "Há " + a.semDetalhe.length + " boletim(ns) medido(s), mas nenhum com percentual por item do orçamento — " +
          "medição por valor aberto ou por atividades não diz QUAIS serviços andaram. O cronograma continua mandando na simulação.";
      }
      if (a.pendentes && a.pendentes.length) {
        return a.pendentes.length + " boletim(ns) de medição aguardando aprovação do fiscal — enquanto não forem aprovados, não contam como obra feita. A simulação mostra o plano.";
      }
      return "Nenhum boletim de medição aproveitável até aqui — a simulação mostra o plano.";
    }
    var p = a.boletins + " boletim(ns) de medição" + (a.ultimo ? ", o último fechando em " + a.ultimo.quando : "") + ".";
    var extra = [];
    if (a.pendentes && a.pendentes.length) extra.push(a.pendentes.length + " aguardando aprovação do fiscal");
    if (a.semDetalhe.length) extra.push(a.semDetalhe.length + " sem percentual por item (valor aberto ou atividades)");
    if (a.ignorados.length) extra.push(a.ignorados.length + " fora da conta");
    if (a.orfaos.length) extra.push(a.orfaos.length + " item(ns) medido(s) que não estão mais no orçamento");
    return p + (extra.length ? " Fora: " + extra.join(" · ") + "." : "");
  }

  /* =====================================================================
   * B10 — O AVANÇO MEDIDO EM CIMA DA GEOMETRIA
   *
   * O B9 pinta a cena pelas TAREFAS do cronograma 4D. Só que cronograma 4D
   * é trabalho: a obra precisa ter tarefas criadas, com alvo, e ligadas a
   * item do orçamento. A maioria das obras não tem nenhuma delas.
   *
   * Mas toda obra tem orçamento e medição, e o elo do B8 já diz qual item
   * do orçamento corresponde a qual categoria do modelo. Com isso dá para
   * pintar a geometria pelo que foi MEDIDO, sem cronograma nenhum — que é
   * o "previsto × real" que o engenheiro leva para a reunião.
   *
   * ⚠ E AQUI MORA A COISA QUE A COR NÃO PODE DIZER. "Paredes / Alvenaria a
   *   40%" significa que 40% do SERVIÇO de alvenaria foi medido. NÃO
   *   significa que 40% das paredes estão prontas, e o app não tem como
   *   saber quais estão. Pintar 40% das peças de verde e 60% de cinza
   *   inventaria uma informação que ninguém mediu — e inventaria bonito, do
   *   jeito que passa despercebido numa reunião. Por isso TODAS as peças da
   *   categoria recebem a MESMA cor, e a legenda diz o número em letra
   *   cheia. Uma cor por categoria é a verdade disponível.
   * =================================================================== */

  /* a escala. Quatro faixas, porque três não distinguem "começou" de "quase
     pronto" e cinco ninguém lê num modelo 3D. */
  var FAIXAS = [
    { ate: 0,   id: "nada",    cor: "#94a3b8", rotulo: "Nada medido" },
    { ate: 50,  id: "inicio",  cor: "#f59e0b", rotulo: "Começou (até 50%)" },
    { ate: 100, id: "avanc",   cor: "#84cc16", rotulo: "Mais da metade" },
    { ate: Infinity, id: "ok", cor: "#16a34a", rotulo: "Medido por inteiro" }
  ];

  function faixaDe(pct) {
    var p = num(pct);
    if (p <= 0) return FAIXAS[0];
    if (p < 50) return FAIXAS[1];
    if (p < 100) return FAIXAS[2];
    return FAIXAS[3];
  }

  /* ---------------------------------------------------------------------
   * O % MEDIDO DE CADA CATEGORIA, pelos elos do B8
   *
   * ⚠ "0%" E "SEM ELO" CONTINUAM SENDO COISAS DIFERENTES, como no B9 — e
   *   aqui a diferença vira COR: a categoria sem elo não é pintada de cinza
   *   (que diria "não começou"), ela não é pintada de jeito nenhum e sai na
   *   lista do que o app não sabe. Peça com a cor original é a única forma
   *   honesta de dizer "não faço ideia".
   * ------------------------------------------------------------------- */
  function pctPorCategoria(vinculos, avanco) {
    var a = avanco || {};
    var porCategoria = {}, semItem = [];
    arr(vinculos).forEach(function (v) {
      if (!v) return;
      var cat = txt(v.categoria), iid = txt(v.itemId);
      if (!cat || !iid) return;
      var conhece = a.itensDoOrcamento;
      if (conhece && !conhece[iid]) {
        semItem.push({ categoria: cat, itemId: iid, itemDescricao: txt(v.itemDescricao) });
        return;
      }
      var p = num(a.porItem && a.porItem[iid]);
      /* duas categorias podem apontar para o mesmo item, e um item pode
         receber dois elos: quem manda é o MAIOR percentual, porque o menor
         seria dizer que a obra andou menos do que já foi faturado */
      if (porCategoria[cat] === undefined || p > porCategoria[cat].pct) {
        porCategoria[cat] = { pct: p, itemId: iid, itemDescricao: txt(v.itemDescricao) };
      }
    });
    return { porCategoria: porCategoria, semItem: semItem };
  }

  /* ---------------------------------------------------------------------
   * A PINTURA
   *
   * `linhas` é o levantamento do BIMQto rodado com `{ comChaves: true }`.
   * Devolve o mapa `{ chave: "#rrggbb" }` que o `BIM.pintarChaves` consome.
   * ------------------------------------------------------------------- */
  function pinturaDeAvanco(linhas, porCategoria, opts) {
    var o = opts || {};
    var mapa = porCategoria || {};
    var pinturas = {}, semElo = [], semChaves = [], porFaixa = {}, nPintadas = 0;

    arr(linhas).forEach(function (l) {
      if (!l) return;
      var cat = txt(l.categoria);
      var info = mapa[cat];
      if (!info) { semElo.push({ categoria: cat, nElementos: num(l.nElementos), unidade: txt(l.unidade) }); return; }
      if (!arr(l.chaves).length) {
        /* ⚠ o levantamento veio SEM as chaves: quem chamou esqueceu o
           `comChaves`. Falhar calado aqui pintaria nada e pareceria "a obra
           não começou" — o oposto do que está acontecendo. */
        semChaves.push(cat);
        return;
      }
      var f = faixaDe(info.pct);
      var acc = porFaixa[f.id] || (porFaixa[f.id] = { id: f.id, cor: f.cor, rotulo: f.rotulo, categorias: [], nPecas: 0 });
      acc.categorias.push({ categoria: cat, pct: Math.round(num(info.pct) * 10) / 10, itemDescricao: info.itemDescricao });
      arr(l.chaves).forEach(function (k) { if (k) { pinturas[k] = f.cor; acc.nPecas++; nPintadas++; } });
    });

    var legenda = FAIXAS.map(function (f) { return porFaixa[f.id]; }).filter(Boolean);
    return {
      pinturas: pinturas, legenda: legenda, semElo: semElo, semChaves: semChaves,
      nPintadas: nPintadas, nCategorias: Object.keys(mapa).length
    };
  }

  /* ---------------------------------------------------------------------
   * QUANTO DO DINHEIRO LIGADO AO MODELO JÁ FOI MEDIDO
   *
   * ⚠ SOBRE O QUE ESTÁ LIGADO, E DIZENDO ISSO. O total do orçamento inclui
   *   serviço que não tem peça no modelo (mobilização, projeto, limpeza
   *   final). Apresentar "45% do orçamento medido" a partir só dos itens
   *   ligados seria dar um número de obra inteira calculado sobre um pedaço
   *   dela. O que sai daqui é sempre "do que está ligado ao modelo".
   * ------------------------------------------------------------------- */
  function dinheiroLigado(vinculos, avanco, orcamento, opts) {
    var o = opts || {};
    var mapa = mapaDoOrcamento(orcamento).porItem;
    var a = avanco || {};
    /* ⚠ ELO PARA CATEGORIA QUE NÃO ESTÁ NO ARQUIVO ABERTO. A obra pode ter
       cinco IFCs e só um carregado: o elo da hidráulica continua valendo,
       mas a categoria dele não aparece na conferência da tela. Somar esse
       item no mesmo total deixava o RELATÓRIO sem fechar — a tabela com três
       linhas e a linha do dinheiro contando quatro itens, sem nada dizendo
       por quê. Quem informa `categoriasNoModelo` recebe a separação. */
    var noModelo = o.categoriasNoModelo || null;
    var catDoItem = {};
    arr(vinculos).forEach(function (v) { if (v && txt(v.itemId)) catDoItem[txt(v.itemId)] = txt(v.categoria); });

    var vistos = {}, total = 0, medido = 0, nItens = 0;
    var fTotal = 0, fMedido = 0, fN = 0, fCats = {};
    arr(vinculos).forEach(function (v) {
      if (!v) return;
      var iid = txt(v.itemId);
      if (!iid || vistos[iid] || !mapa[iid]) return;
      vistos[iid] = 1;
      var val = num(mapa[iid].valor);
      var med = val * (num(a.porItem && a.porItem[iid]) / 100);
      var cat = catDoItem[iid];
      if (noModelo && cat && !noModelo[cat]) {
        fN++; fTotal += val; fMedido += med; fCats[cat] = 1;
        return;
      }
      nItens++; total += val; medido += med;
    });
    var totalOrc = 0;
    Object.keys(mapa).forEach(function (k) { totalOrc += num(mapa[k].valor); });
    return {
      nItens: nItens, total: Math.round(total * 100) / 100, medido: Math.round(medido * 100) / 100,
      pct: total > 0 ? Math.round((medido / total) * 1000) / 10 : 0,
      totalOrcamento: Math.round(totalOrc * 100) / 100,
      /* a fatia do orçamento que o modelo alcança — o resto é serviço sem peça */
      coberturaDoModelo: totalOrc > 0 ? Math.round((total / totalOrc) * 1000) / 10 : 0,
      /* o que está ligado mas ficou fora do arquivo aberto (federação parcial) */
      foraDoModelo: {
        nItens: fN, total: Math.round(fTotal * 100) / 100, medido: Math.round(fMedido * 100) / 100,
        categorias: Object.keys(fCats)
      }
    };
  }

  function frasePintura(p, d) {
    if (!p) return "";
    if (!p.nPintadas) {
      if (p.semChaves.length) return "O levantamento foi feito sem as chaves das peças — recarregue os quantitativos para pintar.";
      return "Nenhuma categoria do modelo está ligada ao orçamento ainda. Ligue em \"Conferir com o orçamento\".";
    }
    var s = p.nPintadas + " peça(s) pintadas em " + p.legenda.reduce(function (n, f) { return n + f.categorias.length; }, 0) + " categoria(s).";
    if (d && d.nItens) {
      s += " Do que está ligado ao modelo (" + d.coberturaDoModelo + "% do orçamento), " + d.pct + "% já foi medido.";
    }
    if (p.semElo.length) s += " " + p.semElo.length + " categoria(s) sem elo ficaram com a cor original — o app não sabe o avanço delas.";
    return s;
  }

  var BimAvanco = {
    NAO_CONTA: NAO_CONTA,
    FAIXAS: FAIXAS,
    avancoEm: avancoEm,
    pctPorCategoria: pctPorCategoria,
    pinturaDeAvanco: pinturaDeAvanco,
    dinheiroLigado: dinheiroLigado,
    frasePintura: frasePintura,
    _faixaDe: faixaDe,
    pctDaTarefa: pctDaTarefa,
    planejadoEm: planejadoEm,
    fraseAvanco: fraseAvanco,
    _mapaDoOrcamento: mapaDoOrcamento,
    _quandoFechou: quandoFechou
  };

  global.BimAvanco = BimAvanco;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAvanco;
})(typeof window !== "undefined" ? window : this);

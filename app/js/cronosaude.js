/* =====================================================================
 * cronosaude.js — SAÚDE DO CRONOGRAMA (motor puro, régua determinística)
 *
 * Responde "este cronograma se sustenta?" com CONTA, não com opinião. Roda
 * sobre o resultado de `Cronograma.estimar(orc, override, {eap:true})` e
 * devolve, por checagem: o número MEDIDO, o LIMITE, de onde o limite veio, o
 * NÓ exato de cada achado (para a tela levar a pessoa até lá) e o que fazer.
 *
 * ⚠ POR QUE UMA RÉGUA EM JS, E NÃO UM MODELO. Risco de cronograma se DETECTA
 *   com régua e se PRIORIZA com gente. Uma régua falha ruidosamente (o assert
 *   reprova); um modelo falha calado — o risco que ele não citou é o que
 *   ninguém viu, e não há teste que prove que ele viu. Aqui nenhum número sai
 *   de heurística sem estar ROTULADO como heurística, com o porquê escrito no
 *   lado dele (`heuristica: true` + `porque`).
 *
 * ⚠ ESTE MÓDULO NÃO CALCULA DATA, FOLGA NEM CAMINHO CRÍTICO. Esses números
 *   têm dono: `Cronograma.estimar`. Aqui só se LÊ o que ele devolveu e se
 *   MEDE contra um limite. A única coisa que este módulo faz o motor rodar é
 *   o TESTE DO CAMINHO CRÍTICO — e aí ele roda o motor de verdade
 *   (empurra → recalcula → compara), nunca deduz da estrutura.
 *
 * A RÉGUA é a DCMA-14 (Defense Contract Management Agency, 14-point schedule
 * assessment) adaptada ao que ESTE produto tem. O que não cabe aqui ficou de
 * fora com o motivo escrito (ver DECISÕES, no fim do arquivo).
 *
 * API (global.CronoSaude, também module.exports):
 *   checar(orc, r, opts) → {ok, camada, resumo, nota, achados, piores,
 *                           checagens, naoAvaliado, criticoTeste}
 *   testeCritico(orc, r, opts) → só o teste do caminho crítico
 *   LIMITES / CHECAGENS — a tabela dos limites e o catálogo das checagens,
 *       para a tela mostrar "limite: 44 dias úteis (DCMA-14)" sem repetir
 *       número nenhum (número repetido em duas telas diverge na 1ª manutenção).
 *
 * opts: {override, hoje, realizado, empurrar, maxEmpurroes, criticoTeste}
 *   realizado = {noId: pct 0..100} (de CronoPlan.realizadoPorNo). SEM ele a
 *   checagem "começou no passado" sai NÃO AVALIADA — nunca "tudo certo":
 *   recado que mente é pior que recado nenhum.
 *   criticoTeste: false (ou maxEmpurroes: 0) desliga o teste do caminho
 *   crítico — o único ponto que roda o motor, e que custa até 21
 *   `Cronograma.estimar` inteiros. Desligado ele sai NÃO AVALIADO com o
 *   motivo e uma RESSALVA ao lado da nota, nunca "passou".
 *
 * ⚠ A 18ª CHECAGEM PRECISA DO CronoSeq. `sequenciaConstrutiva` pergunta se a
 *   rede contraria a ordem da obra, e ela é a única que depende de outro
 *   módulo: sem `global.CronoSeq` carregado sai NÃO AVALIADA, com a ressalva
 *   "esta nota NÃO diz que a rede respeita a ordem da obra". Na tela, o
 *   js/cronoseq.js tem de vir ANTES deste arquivo.
 * ===================================================================== */
(function (global) {
  "use strict";

  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : 0; }
  function C() { return global.Cronograma; }
  // chave local "AAAA-MM-DD" (⚠ nunca toISOString: em UTC-3 ele volta um dia)
  function chData(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function dma(s) { var p = String(s).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function dataBR(d) {
    return d && d.getFullYear ? ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear() : "";
  }
  function corta(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function pct1(v) { return Math.round(v * 10) / 10; }
  function meiaNoite(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

  /* ================== OS LIMITES, E DE ONDE ELES VIERAM ==================
     ⚠ Limite sem fonte é chute com cara de norma. Cada linha diz quem mandou.
     Os de `fonte: "DCMA-14"` são a régua pública de qualidade de cronograma
     (Defense Contract Management Agency, 14-point assessment); os marcados
     `heuristica: true` são NOSSOS, calibrados nos orçamentos reais desta base
     (a medição está em tools/test-cronosaude.js, bloco 9) — e a tela tem de
     dizer "heurística" quando mostrar o número, senão vira norma por engano.
     Trocar um número aqui muda a nota de todos os orçamentos: o `porque` é o
     que impede a próxima sessão de "arredondar" um limite que custou medição. */
  var LIMITES = {
    semLigacaoPct: { valor: 5, unidade: "% das tarefas", fonte: "DCMA-14 (Logic)",
      porque: "tarefa sem predecessora nem sucessora não é empurrada por nada — ela mente na data e some do caminho crítico" },
    duracaoDias: { valor: 44, unidade: "dias úteis", fonte: "DCMA-14 (High Duration)",
      porque: "acima de ~2 meses a tarefa não se acompanha: ela fica 80% feita por semanas e ninguém sabe se atrasou" },
    duracaoAltaPct: { valor: 5, unidade: "% das tarefas", fonte: "DCMA-14 (High Duration)", porque: "a régua aceita exceção; o que ela não aceita é regra" },
    folgaDias: { valor: 44, unidade: "dias úteis", fonte: "DCMA-14 (High Float)",
      porque: "folga grande demais quase sempre é elo que FALTA, não sobra de prazo: a tarefa não está presa a nada depois dela" },
    folgaAltaPct: { valor: 5, unidade: "% das tarefas", fonte: "DCMA-14 (High Float)", porque: "idem" },
    lagNegativoPct: { valor: 0, unidade: "% dos elos", fonte: "DCMA-14 (Leads)",
      porque: "avanço explícito (começar antes de o predecessor terminar) esconde a decisão real, que é quebrar a tarefa em duas" },
    lagDias: { valor: 20, unidade: "dias úteis", heuristica: true,
      porque: "cura de concreto (7 a 14 dias) e secagem de reboco são esperas legítimas e comuns nesta base; acima de 20 dias úteis (um mês de calendário) a espera costuma estar no lugar de uma tarefa que ninguém escreveu" },
    lagAltoPct: { valor: 5, unidade: "% dos elos", heuristica: true, porque: "mesma régua de exceção da DCMA-14" },
    sequenciaAchados: { valor: 0, unidade: "elos contra a ordem da obra (graves + altos)", heuristica: true,
      porque: "quantos elos a matriz de sequência de obra (CronoSeq) acusa como invertidos ou fora de ordem, contando só os de gravidade grave e alta. Limite zero: nenhum. O pior caso é 6 — medido nos orçamentos reais, onde a mediana dos que têm achado é 3 e o máximo num só orçamento é 22; com 6 a nota do item já está em zero e não há o que separar acima disso" },
    piorSequencia: { valor: 6, unidade: "elos", heuristica: true,
      porque: "onde a nota de \"rede contra a ordem da obra\" chega a zero (ver sequenciaAchados)" },
    restricaoPct: { valor: 5, unidade: "% das tarefas", fonte: "DCMA-14 (Hard Constraints)",
      porque: "data fixada substitui a rede: com muitas, o cronograma para de reagir ao atraso e vira um desenho" },
    criticoPct: { valor: 50, unidade: "% das tarefas", heuristica: true,
      porque: "com metade da obra crítica não há o que priorizar — mas numa rede em CASCATA isso é 100% por construção, então esta linha é informação e NÃO pontua (ver CHECAGENS)" },
    fatorPior: { valor: 4, unidade: "× o limite", heuristica: true,
      porque: "onde a nota do item chega a ZERO. Medido nos 55 orçamentos reais dos 34 backups desta base: com o pior caso em 100% um cronograma com 37,5% das tarefas acima de 44 dias tirava 66 de 100 no item — nota que diz \"quase bom\" para um plano que não se acompanha. Com 4× o limite (5% → 0 em 20%) o número volta a separar os cronogramas" },
    tetoComFalhaGrave: { valor: 60, unidade: "pontos", heuristica: true,
      porque: "teto da nota quando uma checagem GRAVE zera. Grave = o plano NÃO FECHA (laço de dependência, caminho crítico quebrado, prazo contratual estourado, teste do crítico reprovado) — não é sujeira que a média dilui. ⚠ E só essas quatro: \"ligações faltando\" a 25% é desleixo, e desleixo a média já pune. Medido nos reais: as quatro graves passam em 55 de 55, então o teto nunca é acionado por dado real — ele é provado por fixture em tools/test-cronosaude.js" },
    /* ⚠ OS QUATRO "PIOR CASO" QUE NÃO SÃO 4× O LIMITE. Estas quatro
       checagens têm limite ZERO (nenhuma tarefa pode estar assim), e 4×0 = 0
       faria a nota cair no ramo binário: 12,5% de serviços sem base valeria
       0 em vez dos 50 que o código sempre deu. O número estava CRAVADO no
       corpo da função, fora desta tabela — e a `FORMULA_NOTA`, que sai
       impressa ao lado da nota, afirmava "o pior caso é 4× o limite" para
       todas. Era falso para 4 das 14 que pontuam, 20% do peso. Agora cada
       uma tem linha própria, com o porquê, e o `pior` sai em `nota.itens`. */
    piorDuracaoSemBase: { valor: 25, unidade: "% das tarefas", heuristica: true,
      porque: "onde a nota de \"duração sem base de cálculo\" chega a zero. Um quarto das tarefas com duração de placeholder (1 dia de piso, por falta de quantidade lançada) não é um cronograma com furos: é um cronograma que ninguém quantificou" },
    piorLagNegativo: { valor: 10, unidade: "% dos elos", heuristica: true,
      porque: "onde a nota de \"avanço (lag negativo)\" chega a zero. É mais apertado que os outros (10% e não 20%) porque avanço é decisão elo a elo escondida no \"Depende de\": um em cada dez elos já é regra, não exceção" },
    piorComecouNoPassado: { valor: 50, unidade: "% das tarefas vencidas", heuristica: true,
      porque: "onde a nota de \"já devia ter começado\" chega a zero. Metade das tarefas vencidas sem nenhum realizado quer dizer que o plano não descreve mais a obra — daí em diante a nota não tem como piorar, é refazer" },
    piorMarcoSemData: { valor: 100, unidade: "% dos marcos", heuristica: true,
      porque: "onde a nota de \"marco sem data fixada\" chega a zero: TODOS os marcos sem data. A reta aqui é a proporção simples, porque o item é de peso 1 e a régua é binária por marco" },
    empurrarDias: { valor: 5, unidade: "dias úteis", heuristica: true,
      porque: "empurrão do teste do caminho crítico: grande o bastante para atravessar arredondamento de escala, pequeno o bastante para não estourar o calendário de feriados" },
    maxEmpurroes: { valor: 14, unidade: "tarefas", heuristica: true,
      porque: "cada empurrão roda o motor inteiro; 14 cobre o caminho crítico das obras desta base sem travar a aba" }
  };

  /* O catálogo das checagens: `peso` é o que ela vale na nota geral;
     `pontua: false` = medida e mostrada, mas FORA da nota (o número é
     informação, não defeito — ver o `porque` de cada uma). */
  var CHECAGENS = [
    { id: "ligacoes", nome: "Ligações faltando", peso: 3, pontua: true, limite: "semLigacaoPct",
      porque: "é a checagem que mais estraga previsão: a tarefa solta não anda quando a obra atrasa" },
    { id: "ciclo", nome: "Dependência circular", peso: 3, pontua: true, grave: true, limite: null,
      porque: "A depende de B que depende de A: o motor desempata ignorando um elo, e a data que sai não é a de ninguém" },
    { id: "semDuracao", nome: "Tarefa sem duração", peso: 2, pontua: true, limite: null,
      porque: "barra de duração zero que não é marco não se mede, não se realiza e some do Gantt" },
    { id: "duracaoSemBase", nome: "Duração sem base de cálculo", peso: 2, pontua: true, limite: null, heuristica: true,
      porque: "serviço sem quantidade recebe 1 dia de piso para não sumir do desenho — esse 1 não é estimativa, é placeholder" },
    { id: "duracaoAlta", nome: "Duração longa demais", peso: 2, pontua: true, limite: "duracaoAltaPct",
      porque: "num orçamento SEM subetapas a etapa é a folha, e ela nasce grossa: a porta é detalhar pelo cronograma executivo. Medido: 16 dos 55 orçamentos reais reprovam, um deles com 100% das etapas acima de 44 dias úteis (o mesmo que a auditoria achou — 5 obras passam de 500 dias úteis)" },
    { id: "lagNegativo", nome: "Avanço (lag negativo)", peso: 1, pontua: true, limite: "lagNegativoPct",
      porque: "o avanço (\"1-5\" no Depende de) é recurso do produto e às vezes é o que a obra faz mesmo — por isso peso 1 e severidade baixa. A régua marca porque ele esconde a decisão real (quebrar a tarefa em duas) e porque, quando a obra atrasa, ninguém lembra que aquele elo tinha 5 dias de avanço embutidos. Medido: 17 dos 44 orçamentos reais com elo têm avanço explícito" },
    { id: "lagAlto", nome: "Espera longa demais", peso: 1, pontua: true, limite: "lagAltoPct", heuristica: true },
    { id: "restricoes", nome: "Datas fixadas demais", peso: 2, pontua: true, limite: "restricaoPct" },
    { id: "folgaNegativa", nome: "Folga negativa (prazo estourado)", peso: 3, pontua: true, grave: true, limite: null,
      porque: "neste motor a folga é presa em zero (Math.max(0, …)) — o equivalente honesto é a restrição “terminar até” que o plano não cumpre" },
    { id: "folgaAlta", nome: "Folga alta demais", peso: 2, pontua: true, limite: "folgaAltaPct" },
    { id: "criticoQuebrado", nome: "Caminho crítico quebrado", peso: 3, pontua: true, grave: true, limite: null,
      porque: "buraco no caminho crítico = dia em que nada crítico corre e ninguém sabe o que segura a entrega" },
    { id: "criticoTeste", nome: "Teste do caminho crítico", peso: 3, pontua: true, grave: true, limite: null,
      porque: "empurrar a tarefa crítica N dias tem de empurrar a entrega N dias; se não empurra, o vermelho do Gantt está apontando para a tarefa errada" },
    { id: "marcoSemData", nome: "Marco sem data fixada", peso: 1, pontua: true, limite: null, heuristica: true,
      porque: "marco é promessa contratual; sem data fixada ele anda sozinho quando qualquer coisa antes dele muda" },
    { id: "comecouNoPassado", nome: "Tarefa que já devia ter começado", peso: 2, pontua: true, limite: null,
      porque: "início previsto vencido e zero realizado é atraso que o cronograma ainda não sabe que tem" },
    /* ⚠ A RÉGUA MEDIA TOPOLOGIA E PRAZO, E NÃO PERGUNTAVA SE A REDE RESPEITA
       A ORDEM DA OBRA. ROTEIRO DO DEFEITO (12/09/2026): um plano gravado
       como Pintura → Alvenaria → Revestimento tirava 89 de 100 aqui, com 2
       ressalvas, nenhuma sobre sequência — enquanto o módulo irmão
       (`CronoSeq.conferir`, no mesmo commit) classificava o MESMO plano com
       um achado GRAVE. 89 lê-se como aprovação. É o roteiro do "elogio
       educado escondendo o mesmo defeito". Peso 2 e não 3: a sequência é
       HEURÍSTICA (tabela escrita à mão), e heurística não zera nota de
       plano como laço de dependência zera. Sem o CronoSeq carregado sai NÃO
       AVALIADA com o motivo, do mesmo jeito que "começou no passado". */
    { id: "sequenciaConstrutiva", nome: "Rede contra a ordem da obra", peso: 2, pontua: true, limite: "sequenciaAchados", heuristica: true,
      porque: "elo escrito ao contrário da sequência de obra (pintura antes do reboco, revestimento antes da instalação embutida). Vem da matriz do CronoSeq, que é heurística rotulada — por isso pontua com peso 2 e NÃO entra nas checagens graves" },
    { id: "criticoPct", nome: "Percentual de tarefas críticas", peso: 0, pontua: false, limite: "criticoPct", heuristica: true },
    { id: "redeImplicita", nome: "Rede herdada da ordem da planilha", peso: 0, pontua: false, limite: null,
      porque: "elo que ninguém decidiu: a etapa depende da ANTERIOR DA LISTA só porque está embaixo dela. É o retrato mais honesto destes cronogramas — e por isso é informação, não nota: pontuar faria todo orçamento nascer reprovado no mesmo item, o que não ajuda a escolher o que consertar" },
    { id: "sobreposicaoAuto", nome: "Sobreposição automática", peso: 0, pontua: false, limite: null,
      porque: "o parâmetro `paralelismo` antecipa cada etapa em floor(p × duração da anterior). Pela DCMA isso seria um LEAD em 100% dos elos; aqui é um parâmetro declarado da obra, não uma decisão elo a elo — conta como informação, com o número à vista" }
  ];
  function checagem(id) { for (var i = 0; i < CHECAGENS.length; i++) if (CHECAGENS[i].id === id) return CHECAGENS[i]; return null; }

  var FORMULA_NOTA =
    "nota do item = 100 enquanto o medido cabe no limite; acima dele cai em linha reta até 0 num PIOR CASO declarado por checagem — 4× o limite onde o limite é percentual, e um valor próprio nas quatro de limite zero (duração sem base 25%, avanço 10%, já devia ter começado 50%, marco sem data 100%). O pior caso de cada uma sai na coluna \"pior\" de nota.itens e em `limites`. " +
    "Nota geral = média das notas PONDERADA pelos pesos das checagens, contando só as que deu para avaliar. " +
    "Uma checagem GRAVE zerada (laço de dependência, caminho crítico quebrado, prazo contratual estourado, teste do crítico reprovado — as que dizem que o plano não fecha) limita a nota geral a 60. " +
    "Checagem de informação (percentual de críticas, rede herdada, sobreposição automática) é medida e mostrada, mas NÃO entra na nota.";

  /* nota de um item: 100 dentro do limite, 0 no pior caso, reta no meio.
     ⚠ `pior` é declarado por checagem e nunca inferido: sem ele um medido de
     6% num limite de 5% valeria 0 e a nota geral viraria ruído. */
  function notaDe(medido, limite, pior) {
    if (!(pior > limite)) return medido <= limite ? 100 : 0;
    if (medido <= limite) return 100;
    if (medido >= pior) return 0;
    return Math.round(100 * (1 - (medido - limite) / (pior - limite)));
  }
  // o pior caso dos limites em PORCENTAGEM: `fatorPior` vezes o limite (ver LIMITES)
  function piorPct(limite) { return limite * LIMITES.fatorPior.valor; }

  /* ================== O ESCOPO: QUEM ENTRA NA RÉGUA ==================
     ⚠ SERVIÇO NÃO ENTRA. Neste motor o serviço não tem rede própria: o
     `_distribuir` crava `preds: []`, `marco: false` e distribui a barra dentro
     da janela do pai (js/cronograma.js, `_distribuir`). Medir "ligação
     faltando" nele reprovaria 100% dos serviços de 100% dos orçamentos, por
     construção — uma checagem que sempre acusa não é checagem, é ruído que
     ensina a pessoa a ignorar o painel.
     ⚠ ETAPA-RESUMO entra só na régua de REDE (o elo macro mora nela), nunca
     na de duração/folga: a duração dela é o vão das subetapas, e a DCMA tira
     tarefa-resumo de todas as 14 métricas pelo mesmo motivo. */
  function montarEscopo(r) {
    var nos = [], camada = Array.isArray(r.atividades) ? "executivo" : "etapa";
    if (camada === "etapa") {
      r.etapas.forEach(function (e, i) {
        nos.push({ id: e.id, tipo: "etapa", papel: "folha", numero: String(i + 1), nome: e.nome || "", etapaId: e.id,
          escopo: "@obra", duracao: num(e.duracao), inicio: num(e.inicio), fim: num(e.fim), folga: num(e.folga),
          critico: !!e.critico, marco: !!e.marco, fonte: null, preds: arr(e.preds), predLag: e.predLag || {},
          predTipo: {}, predsExplicito: !!e.predsExplicito, restricao: e.restricao || null, cicloDep: !!e.cicloDep,
          dataInicio: e.dataInicio, rede: true, folha: true });
      });
      return { camada: camada, nos: nos };
    }
    r.atividades.forEach(function (n) {
      if (n.tipo === "servico") return;                       // ver o ⚠ acima
      var ehFolha = n.papel === "folha";
      nos.push({ id: n.id, tipo: n.tipo, papel: n.papel, numero: String(n.numero == null ? "" : n.numero), nome: n.nome || "",
        etapaId: n.etapaId, escopo: n.tipo === "etapa" ? "@obra" : n.etapaId,
        duracao: num(n.duracao), inicio: num(n.inicio), fim: num(n.fim), folga: num(n.folga),
        critico: !!n.critico, marco: !!n.marco, fonte: n.fonte || null, preds: arr(n.preds), predLag: n.predLag || {},
        predTipo: n.predTipo || {}, predsExplicito: !!n.predsExplicito, restricao: n.restricao || null,
        cicloDep: !!n.cicloDep, dataInicio: n.dataInicio, rede: true, folha: ehFolha });
    });
    return { camada: camada, nos: nos };
  }

  /* sucessores DENTRO DO PRÓPRIO ESCOPO de rede (a obra, para as etapas; a
     etapa, para as folhas dela) — elo entre folhas de etapas diferentes não
     existe neste motor (js/cronograma.js, `_redeInterna`: `own(porId, …)`),
     então procurá-lo fora do escopo inventaria um elo que o Gantt não desenha. */
  function ligar(nos) {
    var porId = {}, succ = {};
    nos.forEach(function (n) { porId[n.id] = n; succ[n.id] = []; });
    nos.forEach(function (n) {
      n.preds.forEach(function (p) {
        if (own(porId, p) && porId[p].escopo === n.escopo) succ[p].push(n.id);
      });
    });
    return { porId: porId, succ: succ };
  }

  /* pontas do escopo: quem começa junto com o escopo não precisa de
     predecessora, e quem termina junto com ele não precisa de sucessora. */
  function pontas(nos) {
    var ini = {}, fim = {};
    nos.forEach(function (n) {
      if (!own(ini, n.escopo) || n.inicio < ini[n.escopo]) ini[n.escopo] = n.inicio;
      if (!own(fim, n.escopo) || n.fim > fim[n.escopo]) fim[n.escopo] = n.fim;
    });
    return { ini: ini, fim: fim };
  }

  /* ============================ ACHADOS ============================
     ⚠ O `id` LEVA UM SEQUENCIAL. Ele é a âncora do botão "isso não é
     problema" e da lista da tela; sem o sequencial, dois achados da MESMA
     checagem no MESMO nó (uma folha com duas predecessoras, cada uma com
     avanço) nasceriam com o mesmo id — e dispensar um sumiria com os dois. */
  var seqAchado = 0;
  function novoAchado(check, no, sev, texto, acao, extra) {
    var c = checagem(check) || {};
    var a = { id: check + ":" + (no ? no.id : "@geral") + ":" + (++seqAchado), check: check, checkNome: c.nome || check,
      severidade: sev, texto: texto, acao: acao || "",
      heuristica: !!(c.heuristica || (extra && extra.heuristica)), porque: (extra && extra.porque) || c.porque || "",
      diasCriticos: 0, no: null };
    if (no) a.no = { id: no.id, tipo: no.tipo, numero: no.numero, nome: corta(no.nome, 60), etapaId: no.etapaId };
    if (extra) for (var k in extra) if (own(extra, k) && k !== "porque" && k !== "heuristica") a[k] = extra[k];
    return a;
  }

  /* =================================================================
     O TESTE DO CAMINHO CRÍTICO — o que mais pega defeito, e o único
     lugar deste módulo que RODA o motor.

     A conta: empurrar uma tarefa CRÍTICA em N dias tem de empurrar o fim da
     obra em N dias. Se não empurra, o vermelho do Gantt está mentindo — a
     pessoa aperta a tarefa errada e o prazo não anda.

     E o CONTROLE do próprio teste, que é o que o torna uma prova e não uma
     cerimônia: empurrar uma tarefa DENTRO DA FOLGA dela não pode mexer no
     fim. Sem esse lado, um motor que respondesse "empurrou N" para qualquer
     coisa passaria no teste inteiro.

     ⚠ COMO SE EMPURRA. Não se mexe em `duracoes`: no modo executivo a etapa
     com subetapas ignora o que está gravado lá (o vão ao vivo manda), e num
     orçamento APROVADO a duração é a gravada. Empurra-se pelo mapa de
     RESTRIÇÕES (`restricoes[etapaId] = {tipo:"nia", data}`), que é o piso de
     início do CPM e vale nos três casos. A data sai do calendário do próprio
     motor (`Cronograma.calendario(r).dia(k)`), nunca de uma conta própria de
     dia útil — duas réguas de calendário divergem na primeira manutenção.

     ⚠ O INÍCIO TEM DE SER FIXADO NOS DOIS LADOS. Sem `dataInicio` gravado, o
     `estimar` usa `new Date()`: uma rodada antes e outra depois da meia-noite
     dariam calendários diferentes e o teste acusaria o motor por um defeito
     do relógio. Por isso as duas rodadas levam o MESMO override de início, e
     a rodada de referência (clone sem mudança nenhuma) tem de bater com o `r`
     que chegou — se não bater, o teste sai NÃO COMPARADO em vez de mentir.
     ================================================================= */
  function testeCritico(orc, r, opts) {
    opts = opts || {};
    var Cr = C();
    var out = { ok: false, motivo: "", empurrao: 0, testadas: [], criticasTotais: 0, testadasCriticas: 0,
      falhas: [], controles: [], controlesFalhos: [], camadaTestada: "etapa", criticasNaoTestadas: [] };
    /* ⚠ DESLIGÁVEL DE PROPÓSITO — e sai NÃO AVALIADO, nunca "passou".
       Este é o único ponto do módulo que roda o motor, e ele o roda até 21
       vezes (1 referência + 14 empurrões + 7 controles). Medido: num
       orçamento sintético de 2.400 serviços, `checar` custava 4.854 ms e o
       `testeCritico` sozinho 4.839 ms — 98% do total. Quem monta CONTEXTO de
       IA (js/cronoia.js) não precisa dele e não podia desligá-lo: `opts.
       maxEmpurroes` menor que 1 caía no padrão 14. Agora `criticoTeste:false`
       (ou `maxEmpurroes: 0`) sai como não avaliado com o motivo — a checagem
       já sabe sair assim, com ressalva, sem mentir. */
    if (opts.criticoTeste === false || (opts.maxEmpurroes != null && num(opts.maxEmpurroes) < 1)) {
      out.motivo = "o teste do caminho crítico não foi pedido nesta chamada (cada empurrão é um recálculo inteiro do cronograma) — a nota saiu SEM ele";
      out.naoPedido = true;
      return out;
    }
    if (!Cr || !Cr.estimar || !Cr.calendario) { out.motivo = "o motor Cronograma não está carregado"; return out; }
    if (!r || !arr(r.etapas).length || !r.dataInicio || isNaN(r.dataInicio.getTime())) { out.motivo = "cronograma sem etapas ou sem data de início"; return out; }
    var N = num(opts.empurrar) >= 1 ? Math.round(num(opts.empurrar)) : LIMITES.empurrarDias.valor;
    var maxE = num(opts.maxEmpurroes) >= 1 ? Math.round(num(opts.maxEmpurroes)) : LIMITES.maxEmpurroes.valor;
    var cal = Cr.calendario(r);
    if (!cal) { out.motivo = "calendário do cronograma indisponível (data de início inválida)"; return out; }
    var override = { dataInicio: chData(r.dataInicio) };
    function roda(mut) {
      var c;
      try { c = JSON.parse(JSON.stringify(orc)); } catch (e) { return null; }
      c.cronograma = c.cronograma && typeof c.cronograma === "object" && !Array.isArray(c.cronograma) ? c.cronograma : {};
      if (mut) mut(c);
      try { return Cr.estimar(c, override); } catch (e2) { return null; }
    }
    var base = roda(null);
    if (!base) { out.motivo = "não consegui recalcular o cronograma para o teste"; return out; }
    if (num(base.totalDias) !== num(r.totalDias)) {
      out.motivo = "a rodada de referência deu " + base.totalDias + " dias úteis e o cronograma da tela diz " +
        r.totalDias + " — sem as duas baterem, o teste não prova nada (não comparado)";
      out.referencia = { base: num(base.totalDias), tela: num(r.totalDias) };
      return out;
    }
    out.empurrao = N;
    out.baseDias = num(base.totalDias);
    /* o piso "nia" é uma DATA: o dia útil `inicio + k` do calendário do motor.
       ⚠ a restrição existente da etapa (se houver) é substituída na CÓPIA —
       "tae" só avisa e não move data, e um "nia" anterior já está embutido no
       `inicio` que estamos empurrando, então o piso novo é sempre o maior. */
    function empurrar(etapaId, k) {
      return roda(function (c) {
        var m = c.cronograma.restricoes;
        if (!m || typeof m !== "object" || Array.isArray(m)) m = c.cronograma.restricoes = {};
        m[etapaId] = { tipo: "nia", data: chData(cal.dia(k)) };
      });
    }
    var criticas = r.etapas.filter(function (e) { return e.critico && !e.marco; });
    var folgadas = r.etapas.filter(function (e) { return !e.critico && num(e.folga) > 0 && !e.marco; });
    out.criticasTotais = criticas.length;
    /* ⚠ O EMPURRÃO SÓ ALCANÇA ETAPA — E ISSO TEM DE SAIR ESCRITO.
       ROTEIRO DO DEFEITO (12/09/2026): no modo executivo o motor marca as
       FOLHAS como críticas (6 subetapas numa fixture de 2 etapas), e o teste
       iterava `r.etapas`. O resultado saía "passou (2 de 2 testadas)" e a
       nota 100 — com o denominador "2" redefinindo em silêncio o total de 8
       nós críticos para 2, e nenhuma das 6 subetapas críticas tocada. Não dá
       para consertar aqui: o mapa `restricoes` do motor só existe por
       ETAPA (js/cronograma.js, `_restricoes` percorre `etapas`), então não
       há como fixar data de subetapa. Enquanto não houver, o teste DECLARA o
       que testou e o que ficou de fora — recado que mente por omissão do
       denominador é o defeito que este módulo existe para não cometer. */
    if (Array.isArray(r.atividades)) {
      arr(r.atividades).forEach(function (n) {
        if (!n || n.tipo === "servico" || n.tipo === "etapa" || !n.critico || n.marco) return;
        out.criticasNaoTestadas.push({ id: n.id, tipo: n.tipo, numero: String(n.numero == null ? "" : n.numero), nome: corta(n.nome, 50) });
      });
    }
    var i, e, res;
    for (i = 0; i < criticas.length && out.testadas.length < maxE; i++) {
      e = criticas[i];
      res = empurrar(e.id, num(e.inicio) + N);
      var medido = res ? num(res.totalDias) - out.baseDias : null;
      var reg = { etapaId: e.id, nome: corta(e.nome, 50), inicio: num(e.inicio), folga: num(e.folga),
        empurrao: N, esperado: N, medido: medido, ok: medido === N };
      out.testadas.push(reg);
      if (!reg.ok) out.falhas.push(reg);
    }
    out.testadasCriticas = out.testadas.length;
    /* CONTROLE: dentro da folga, o fim NÃO pode andar. É o que separa este
       teste de uma cerimônia — um motor que dissesse "andou N" para tudo
       reprovaria aqui. Empurrão = min(folga, N) (a folga é o teto do que
       pode ser absorvido). */
    for (i = 0; i < folgadas.length && out.controles.length < Math.max(2, Math.floor(maxE / 2)); i++) {
      e = folgadas[i];
      var d = Math.min(num(e.folga), N);
      if (d < 1) continue;
      res = empurrar(e.id, num(e.inicio) + d);
      var med2 = res ? num(res.totalDias) - out.baseDias : null;
      var reg2 = { etapaId: e.id, nome: corta(e.nome, 50), folga: num(e.folga), empurrao: d, esperado: 0, medido: med2, ok: med2 === 0 };
      out.controles.push(reg2);
      if (!reg2.ok) out.controlesFalhos.push(reg2);
    }
    out.ok = true;
    out.passou = out.falhas.length === 0 && out.controlesFalhos.length === 0;
    if (out.criticasNaoTestadas.length) {
      out.motivoCamada = "o empurrão foi aplicado só nas " + out.testadasCriticas + " de " + out.criticasTotais +
        " ETAPAS críticas; as " + out.criticasNaoTestadas.length +
        " subetapas críticas não têm como receber data fixada neste motor (o mapa `restricoes` só existe por etapa) e NÃO foram testadas";
    }
    return out;
  }

  /* =================================================================
     A CHECAGEM INTEIRA
     ================================================================= */
  function checar(orc, r, opts) {
    opts = opts || {};
    var Cr = C();
    if (!Cr || !Cr.estimar) return { ok: false, motivo: "o motor Cronograma não está carregado — a saúde do cronograma não roda sem ele." };
    if (!r) {
      try { r = Cr.estimar(orc, opts.override || null, { eap: true }); }
      catch (e) { return { ok: false, motivo: "não consegui calcular o cronograma deste orçamento (" + ((e && e.message) || e) + ")." }; }
    }
    if (!r || !arr(r.etapas).length) return { ok: false, motivo: "este orçamento não tem etapas — não há cronograma para conferir." };

    var E = montarEscopo(r), nos = E.nos, L = ligar(nos), P = pontas(nos), pt = P.ini, pf = P.fim;
    var achados = [], checagens = {}, naoAvaliado = [];
    var folhas = nos.filter(function (n) { return n.folha; });
    var totalDias = num(r.totalDias);

    function reg(id, o) {
      var c = checagem(id) || {};
      o.check = id; o.nome = c.nome || id; o.peso = c.peso || 0; o.pontua = !!c.pontua;
      if (c.heuristica) o.heuristica = true;
      if (!o.porque && c.porque) o.porque = c.porque;
      if (c.limite && own(LIMITES, c.limite)) { o.limiteFonte = LIMITES[c.limite].fonte || (LIMITES[c.limite].heuristica ? "heurística da casa" : ""); }
      /* ⚠ O PIOR CASO VAI JUNTO DO LIMITE, sempre. A `FORMULA_NOTA` sai
         impressa na tela; se ela disser "4× o limite" e o item usar outro
         número, a tela não tem como saber quais. Onde a escala é binária
         (0 ou 100 — laço, buraco no crítico, prazo estourado) `pior` é null
         e o item diz isso, em vez de deixar a fórmula falar por ele. */
      if (o.pior === undefined) o.pior = (typeof o.limite === "number" && o.limite > 0) ? piorPct(o.limite) : null;
      checagens[id] = o;
      if (o.avaliado === false) naoAvaliado.push({ check: id, nome: o.nome, motivo: o.motivo || "" });
      return o;
    }

    /* ---------- 1) LIGAÇÕES FALTANDO (DCMA-14: Logic) ---------- */
    (function () {
      var soltas = [], semPred = [], semSucc = [];
      nos.forEach(function (n) {
        var temP = n.preds.length > 0, temS = L.succ[n.id].length > 0;
        var pontaIni = n.inicio === pt[n.escopo], pontaFim = n.fim === pf[n.escopo];
        if (!temP && !temS) { if (!(pontaIni && pontaFim)) soltas.push(n); return; }
        if (!temP && !pontaIni) semPred.push(n);
        if (!temS && !pontaFim) semSucc.push(n);
      });
      var quantos = soltas.length + semPred.length + semSucc.length;
      var pct = nos.length ? (quantos / nos.length) * 100 : 0;
      var o = reg("ligacoes", { medido: pct1(pct), unidade: "% das tarefas", quantos: quantos, de: nos.length,
        limite: LIMITES.semLigacaoPct.valor, avaliado: true, nota: notaDe(pct, LIMITES.semLigacaoPct.valor, piorPct(LIMITES.semLigacaoPct.valor)),
        soltas: soltas.length, semPred: semPred.length, semSucc: semSucc.length });
      soltas.forEach(function (n) {
        achados.push(novoAchado("ligacoes", n, "alta",
          n.tipo + " " + n.numero + " não depende de nada e nada depende dela — ela flutua no desenho e não anda quando a obra atrasa.",
          "Ligue-a: escreva o \"Depende de\" dela, ou ponha alguém dependendo dela.",
          { diasCriticos: n.critico ? n.duracao : 0, tipoFalha: "solta" }));
      });
      semPred.forEach(function (n) {
        achados.push(novoAchado("ligacoes", n, "media",
          n.tipo + " " + n.numero + " começa no dia " + n.inicio + " sem depender de nada (e a obra/etapa começa no dia " + pt[n.escopo] + ").",
          "Diga de quem ela depende no \"Depende de\" — ou fixe a data, se for entrega de terceiro.",
          { diasCriticos: n.critico ? n.duracao : 0, tipoFalha: "semPred" }));
      });
      semSucc.forEach(function (n) {
        achados.push(novoAchado("ligacoes", n, "media",
          n.tipo + " " + n.numero + " termina no dia " + n.fim + " e nada depende dela (o fim é o dia " + pf[n.escopo] + ") — atrasá-la não atrasa nada no papel.",
          "Ponha o que vem depois dela dependendo dela.",
          { diasCriticos: 0, tipoFalha: "semSucc" }));
      });
      o.nota = notaDe(pct, LIMITES.semLigacaoPct.valor, piorPct(LIMITES.semLigacaoPct.valor));
    })();

    /* ---------- 2) DEPENDÊNCIA CIRCULAR ---------- */
    (function () {
      var ciclo = nos.filter(function (n) { return n.cicloDep; });
      var o = reg("ciclo", { medido: ciclo.length, unidade: "tarefas", limite: 0, avaliado: true,
        nota: ciclo.length ? 0 : 100, temCicloEtapa: !!r.temCiclo });
      ciclo.forEach(function (n) {
        achados.push(novoAchado("ciclo", n, "alta",
          n.tipo + " " + n.numero + " está num laço de dependência (A depende de B que depende de A). O motor desenhou ignorando um dos elos — a data dela não é a de ninguém.",
          "Abra o \"Depende de\" dessa tarefa e das vizinhas e quebre o laço.",
          { diasCriticos: n.critico ? n.duracao : 0 }));
      });
      o.nota = ciclo.length ? 0 : 100;
    })();

    /* ---------- 3) TAREFA SEM DURAÇÃO / SEM BASE ---------- */
    (function () {
      var zero = folhas.filter(function (n) { return !n.marco && !(n.duracao > 0); });
      var pct = folhas.length ? (zero.length / folhas.length) * 100 : 0;
      reg("semDuracao", { medido: zero.length, unidade: "tarefas", de: folhas.length, pct: pct1(pct), limite: 0,
        avaliado: true, nota: zero.length ? 0 : 100 });
      zero.forEach(function (n) {
        achados.push(novoAchado("semDuracao", n, "alta",
          n.tipo + " " + n.numero + " tem duração zero e não está marcada como marco — ela não desenha barra, não se mede e não se realiza.",
          "Dê uma duração a ela, ou marque-a como marco (entrega/vistoria) de propósito.",
          { diasCriticos: 0 }));
      });
      var sb = folhas.filter(function (n) { return n.fonte === "semBase"; });
      var pctB = folhas.length ? (sb.length / folhas.length) * 100 : 0;
      var oB = reg("duracaoSemBase", { medido: sb.length, unidade: "tarefas", de: folhas.length, pct: pct1(pctB),
        limite: 0, pior: LIMITES.piorDuracaoSemBase.valor, avaliado: true, nota: notaDe(pctB, 0, LIMITES.piorDuracaoSemBase.valor) });
      sb.forEach(function (n) {
        achados.push(novoAchado("duracaoSemBase", n, "media",
          n.tipo + " " + n.numero + " não tem quantidade lançada: o " + n.duracao + " dia(s) do desenho é piso para a barra não sumir, não estimativa.",
          "Lance a quantidade do serviço, ou digite a duração desta tarefa à mão.",
          { diasCriticos: n.critico ? n.duracao : 0 }));
      });
      oB.nota = notaDe(pctB, 0, LIMITES.piorDuracaoSemBase.valor);
    })();

    /* ---------- 4) DURAÇÃO LONGA DEMAIS (DCMA-14: High Duration) ---------- */
    (function () {
      var lim = LIMITES.duracaoDias.valor;
      var longas = folhas.filter(function (n) { return !n.marco && n.duracao > lim; });
      var pct = folhas.length ? (longas.length / folhas.length) * 100 : 0;
      var o = reg("duracaoAlta", { medido: pct1(pct), unidade: "% das tarefas", quantos: longas.length, de: folhas.length,
        limite: LIMITES.duracaoAltaPct.valor, limiteDias: lim, avaliado: true,
        maior: longas.reduce(function (m, n) { return Math.max(m, n.duracao); }, 0) });
      longas.forEach(function (n) {
        achados.push(novoAchado("duracaoAlta", n, n.critico ? "alta" : "media",
          n.tipo + " " + n.numero + " dura " + n.duracao + " dias úteis — o limite da régua é " + lim + " (≈2 meses). " +
          "Uma barra dessas fica \"80% feita\" por semanas e ninguém sabe se atrasou.",
          "Quebre em subetapas (ou em tarefas menores) para conseguir medir o andamento.",
          { diasCriticos: n.critico ? n.duracao : 0, dias: n.duracao }));
      });
      o.nota = notaDe(pct, LIMITES.duracaoAltaPct.valor, piorPct(LIMITES.duracaoAltaPct.valor));
    })();

    /* ---------- 5) LAGS: AVANÇO (negativo) E ESPERA LONGA ----------
       ⚠ SÓ LAG EXPLÍCITO. A sobreposição automática do `paralelismo` também é
       um deslocamento negativo em CADA elo — pela letra da DCMA, 100% de
       leads em 100% dos orçamentos. Mas ela é um parâmetro declarado da obra
       (um número só, visível na aba), não uma decisão elo a elo escondida no
       "Depende de". Contá-la aqui reprovaria todo cronograma pelo mesmo
       motivo e esconderia os avanços de verdade. Ela sai em `sobreposicaoAuto`,
       com o número à vista. */
    (function () {
      var elos = 0, neg = [], altos = [], lim = LIMITES.lagDias.valor;
      nos.forEach(function (n) {
        n.preds.forEach(function (pid) {
          elos++;
          if (!own(n.predLag, pid)) return;
          var l = num(n.predLag[pid]);
          if (l < 0) neg.push({ no: n, pid: pid, lag: l });
          else if (l > lim) altos.push({ no: n, pid: pid, lag: l });
        });
      });
      var pctN = elos ? (neg.length / elos) * 100 : 0, pctA = elos ? (altos.length / elos) * 100 : 0;
      var oN = reg("lagNegativo", { medido: pct1(pctN), unidade: "% dos elos", quantos: neg.length, de: elos,
        limite: LIMITES.lagNegativoPct.valor, pior: LIMITES.piorLagNegativo.valor, avaliado: elos > 0, nota: notaDe(pctN, 0, LIMITES.piorLagNegativo.valor),
        motivo: elos ? "" : "este cronograma não tem nenhum elo de dependência" });
      neg.forEach(function (x) {
        var p = L.porId[x.pid];
        achados.push(novoAchado("lagNegativo", x.no, "baixa",
          x.no.tipo + " " + x.no.numero + " começa " + (-x.lag) + " dia(s) ANTES de " + (p ? p.numero + " (" + corta(p.nome, 30) + ")" : "a predecessora") + " terminar.",
          "Se as duas correm juntas de verdade, quebre a predecessora em duas e ligue a parte certa — avanço escondido no elo ninguém enxerga no Gantt.",
          { diasCriticos: x.no.critico ? Math.abs(x.lag) : 0, lag: x.lag, predId: x.pid }));
      });
      oN.nota = notaDe(pctN, 0, LIMITES.piorLagNegativo.valor);
      var oA = reg("lagAlto", { medido: pct1(pctA), unidade: "% dos elos", quantos: altos.length, de: elos,
        limite: LIMITES.lagAltoPct.valor, limiteDias: lim, avaliado: elos > 0,
        motivo: elos ? "" : "este cronograma não tem nenhum elo de dependência" });
      altos.forEach(function (x) {
        var p = L.porId[x.pid];
        achados.push(novoAchado("lagAlto", x.no, "baixa",
          x.no.tipo + " " + x.no.numero + " espera " + x.lag + " dias úteis depois de " + (p ? p.numero : "a predecessora") + " — o limite da régua é " + lim + ".",
          "Espera desse tamanho costuma ser uma tarefa que ninguém escreveu (aprovação, entrega de material, cura longa). Escreva-a.",
          { diasCriticos: x.no.critico ? x.lag : 0, lag: x.lag, predId: x.pid }));
      });
      oA.nota = notaDe(pctA, LIMITES.lagAltoPct.valor, piorPct(LIMITES.lagAltoPct.valor));
      // informação: a sobreposição automática, com o número à vista
      var par = num(r.params && r.params.paralelismo) * 100;
      reg("sobreposicaoAuto", { medido: pct1(par), unidade: "% da duração da anterior", elos: elos, avaliado: true,
        parSub: r.exec ? pct1(num(r.exec.paralelismoSub) * 100) : null,
        texto: "Cada etapa começa " + pct1(par) + "% da duração da anterior antes de ela terminar" +
          (r.exec ? " (entre subetapas: " + pct1(num(r.exec.paralelismoSub) * 100) + "%)" : "") +
          ". É parâmetro da obra, igual para todos os " + elos + " elos — não é uma decisão tomada elo a elo." });
    })();

    /* ---------- 6) DATAS FIXADAS (DCMA-14: Hard Constraints) ---------- */
    (function () {
      var fixadas = nos.filter(function (n) { return n.restricao && n.restricao.tipo === "nia"; });
      var pct = nos.length ? (fixadas.length / nos.length) * 100 : 0;
      var o = reg("restricoes", { medido: pct1(pct), unidade: "% das tarefas", quantos: fixadas.length, de: nos.length,
        limite: LIMITES.restricaoPct.valor, avaliado: true });
      if (pct > LIMITES.restricaoPct.valor) {
        fixadas.forEach(function (n) {
          achados.push(novoAchado("restricoes", n, "media",
            n.tipo + " " + n.numero + " tem data fixada (" + dma(n.restricao.data) + ") — com " + fixadas.length +
            " de " + nos.length + " tarefas fixadas (" + pct1(pct) + "%), o cronograma para de reagir ao atraso.",
            "Tire a data e deixe a rede mandar, onde a data não for contratual.",
            { diasCriticos: 0, data: n.restricao.data }));
        });
      }
      o.nota = notaDe(pct, LIMITES.restricaoPct.valor, piorPct(LIMITES.restricaoPct.valor));
    })();

    /* ---------- 7) FOLGA NEGATIVA ----------
       ⚠ NESTE MOTOR ELA NÃO EXISTE: `estimar` grava `folga = Math.max(0, …)`
       (e a rede interna também). Procurar `folga < 0` aqui daria zero em
       100% dos orçamentos e a tela diria "sem prazo estourado" — que é
       exatamente a mentira que esta régua existe para não contar. O
       equivalente honesto é a restrição "terminar até" (tae) que o plano de
       hoje NÃO cumpre: o motor já mede quantos dias passou. */
    (function () {
      var negs = [];
      nos.forEach(function (n) { if (num(n.folga) < 0) negs.push({ no: n, dias: -num(n.folga) }); });
      var avisos = (r.restricoes && arr(r.restricoes.avisos)) || [];
      var estouradas = avisos.filter(function (a) { return a && a.tipo === "tae"; });
      estouradas.forEach(function (a) {
        var n = L.porId[a.etapaId];
        if (n) negs.push({ no: n, dias: num(a.fim) - num(a.indice), data: a.data });
      });
      var o = reg("folgaNegativa", { medido: negs.length, unidade: "tarefas", limite: 0, avaliado: true,
        clampado: true, restricoesTae: estouradas.length,
        porque: "a folga deste motor é presa em zero (Math.max(0, …)); o que se mede aqui é a restrição “terminar até” não cumprida" });
      negs.forEach(function (x) {
        achados.push(novoAchado("folgaNegativa", x.no, "alta",
          x.no.tipo + " " + x.no.numero + (x.data ? " tem \"terminar até " + dma(x.data) + "\" e o plano de hoje termina " + x.dias + " dia(s) útil(eis) depois."
            : " está com folga negativa de " + x.dias + " dia(s)."),
          "Ou a data muda, ou a tarefa encolhe (mais equipe, menos escopo), ou o compromisso é renegociado — a restrição avisa, ela não encurta nada sozinha.",
          { diasCriticos: x.dias, dias: x.dias }));
      });
      o.nota = negs.length ? 0 : 100;
    })();

    /* ---------- 8) FOLGA ALTA DEMAIS (DCMA-14: High Float) ---------- */
    (function () {
      var lim = LIMITES.folgaDias.valor;
      var altas = folhas.filter(function (n) { return num(n.folga) > lim; });
      var pct = folhas.length ? (altas.length / folhas.length) * 100 : 0;
      var o = reg("folgaAlta", { medido: pct1(pct), unidade: "% das tarefas", quantos: altas.length, de: folhas.length,
        limite: LIMITES.folgaAltaPct.valor, limiteDias: lim, avaliado: true,
        maior: altas.reduce(function (m, n) { return Math.max(m, num(n.folga)); }, 0) });
      altas.forEach(function (n) {
        achados.push(novoAchado("folgaAlta", n, "media",
          n.tipo + " " + n.numero + " tem " + num(n.folga) + " dias úteis de folga (limite da régua: " + lim + "). " +
          "Folga desse tamanho quase sempre é elo que FALTA depois dela, não sobra de prazo.",
          "Confira quem deveria depender dessa tarefa — se ninguém depende, ela pode escorregar dois meses sem ninguém notar.",
          { diasCriticos: 0, folga: num(n.folga) }));
      });
      o.nota = notaDe(pct, LIMITES.folgaAltaPct.valor, piorPct(LIMITES.folgaAltaPct.valor));
    })();

    /* ---------- 9) CAMINHO CRÍTICO CONTÍNUO ----------
       Buraco no crítico = dia em que NADA crítico corre. Mas nem todo buraco
       é defeito: uma espera declarada (lag +7 de cura) e uma data fixada
       (nia) são partes legítimas do caminho. Só entra como achado o buraco
       que não tem explicação nenhuma. */
    (function () {
      var criticas = nos.filter(function (n) { return n.escopo === "@obra" && n.critico; })
        .sort(function (a, b) { return a.inicio - b.inicio || a.fim - b.fim; });
      var o = reg("criticoQuebrado", { medido: 0, unidade: "buracos", limite: 0, avaliado: criticas.length > 0,
        motivo: criticas.length ? "" : "nenhuma tarefa crítica — o motor não achou caminho crítico neste cronograma",
        criticas: criticas.length, esperas: [] });
      if (!criticas.length) { o.nota = 0; return; }
      var cobre = 0, buracos = [], esperas = [], ant = null;
      criticas.forEach(function (n) {
        if (n.inicio > cobre) {
          var lacuna = { de: cobre, ate: n.inicio, dias: n.inicio - cobre, no: n, antes: ant, explicacao: "" };
          // espera declarada no elo que chega nesta tarefa
          n.preds.forEach(function (pid) {
            if (own(n.predLag, pid) && num(n.predLag[pid]) > 0 && L.porId[pid] && L.porId[pid].critico) {
              var p = L.porId[pid];
              if (p.fim + num(n.predLag[pid]) === n.inicio) lacuna.explicacao = "espera de " + num(n.predLag[pid]) + " dia(s) declarada no elo com " + p.numero;
            }
          });
          if (!lacuna.explicacao && n.restricao && n.restricao.tipo === "nia" && num(n.restricao.indice) === n.inicio)
            lacuna.explicacao = "data fixada em " + dma(n.restricao.data);
          if (lacuna.explicacao) esperas.push(lacuna); else buracos.push(lacuna);
        }
        if (n.fim > cobre) cobre = n.fim;
        ant = n;
      });
      if (cobre < totalDias) buracos.push({ de: cobre, ate: totalDias, dias: totalDias - cobre, no: ant, explicacao: "", fim: true });
      o.medido = buracos.length;
      o.esperas = esperas.map(function (x) { return { de: x.de, ate: x.ate, dias: x.dias, noId: x.no.id, explicacao: x.explicacao }; });
      buracos.forEach(function (x) {
        achados.push(novoAchado("criticoQuebrado", x.no, "alta",
          "O caminho crítico tem um buraco de " + x.dias + " dia(s) útil(eis) — entre o dia " + x.de + " e o dia " + x.ate +
          " nenhuma tarefa crítica está correndo" + (x.fim ? ", e é justamente o trecho que chega na entrega" : "") + ".",
          "Ligue as tarefas desse trecho: sem corrente contínua do começo ao fim, ninguém sabe o que segura a data da obra.",
          { diasCriticos: x.dias, de: x.de, ate: x.ate }));
      });
      o.nota = buracos.length ? 0 : 100;
    })();

    /* ---------- 10) MARCOS ----------
       ⚠ SÓ ETAPA. Data fixada (`restricoes`) só existe para ETAPA neste motor
       (js/cronograma.js, `_restricoes` percorre `etapas`). Cobrar data de um
       marco de SUBETAPA seria cobrar o que o produto ainda não tem como
       gravar — reprovaria 100% deles e mandaria a pessoa por uma porta que
       não abre. Fica como pendência, e o número sai à parte. */
    (function () {
      var marcosEt = nos.filter(function (n) { return n.marco && n.tipo === "etapa"; });
      var semData = marcosEt.filter(function (n) { return !n.restricao; });
      var marcosSub = nos.filter(function (n) { return n.marco && n.tipo !== "etapa"; });
      var o = reg("marcoSemData", { medido: semData.length, unidade: "marcos", de: marcosEt.length,
        limite: 0, pior: LIMITES.piorMarcoSemData.valor, avaliado: marcosEt.length > 0, marcosSubetapa: marcosSub.length,
        motivo: marcosEt.length ? "" : "este cronograma não tem nenhum marco de etapa" });
      semData.forEach(function (n) {
        achados.push(novoAchado("marcoSemData", n, "baixa",
          "O marco " + n.numero + " (" + corta(n.nome, 40) + ") cai em " + dataBR(n.dataInicio) +
          " por causa da rede — não há data fixada nele. Qualquer coisa que mude antes dele muda a data do marco, calada.",
          "Se é entrega contratual, fixe a data (arraste a barra no Gantt) para o cronograma avisar quando ela deixar de caber.",
          { diasCriticos: 0 }));
      });
      o.nota = marcosEt.length ? notaDe((semData.length / marcosEt.length) * 100, 0, LIMITES.piorMarcoSemData.valor) : 100;
    })();

    /* ---------- 11) COMEÇOU NO PASSADO SEM REALIZADO ----------
       ⚠ SEM O REALIZADO NÃO SE RESPONDE. Data de início vencida só vira
       atraso se ninguém começou; sem `opts.realizado` (CronoPlan.realizadoPorNo)
       o módulo NÃO SABE, e dizer "tudo certo" aqui seria o recado que mente.
       Sai como NÃO AVALIADA, com o número de tarefas vencidas no motivo —
       a mesma régua do "não comparado" do RDO.chuvaExtraordinaria. */
    (function () {
      var hoje = opts.hoje ? (typeof opts.hoje === "string" ? new Date(opts.hoje.slice(0, 10) + "T00:00:00") : new Date(opts.hoje.getTime ? opts.hoje.getTime() : opts.hoje)) : null;
      if (!hoje || isNaN(hoje.getTime())) {
        reg("comecouNoPassado", { avaliado: false, motivo: "sem a data de hoje (opts.hoje) não dá para dizer o que já devia ter começado" });
        return;
      }
      var ms = meiaNoite(hoje);
      var vencidas = folhas.filter(function (n) { return n.dataInicio && n.dataInicio.getTime && meiaNoite(n.dataInicio) < ms; });
      if (!opts.realizado || typeof opts.realizado !== "object") {
        reg("comecouNoPassado", { avaliado: false, vencidas: vencidas.length,
          motivo: vencidas.length + " tarefa(s) têm início previsto antes de " + dataBR(hoje) +
            ", mas sem o realizado da obra (CronoPlan.realizadoPorNo) não dá para saber se começaram — não comparado." });
        return;
      }
      var paradas = vencidas.filter(function (n) { return !(num(opts.realizado[n.id]) > 0); });
      var pct = vencidas.length ? (paradas.length / vencidas.length) * 100 : 0;
      var o = reg("comecouNoPassado", { medido: paradas.length, unidade: "tarefas", de: vencidas.length, pct: pct1(pct),
        limite: 0, pior: LIMITES.piorComecouNoPassado.valor, avaliado: true, hoje: chData(hoje) });
      paradas.forEach(function (n) {
        achados.push(novoAchado("comecouNoPassado", n, n.critico ? "alta" : "media",
          n.tipo + " " + n.numero + " devia ter começado em " + dataBR(n.dataInicio) + " e o realizado dela é zero" +
          (n.critico ? " — e ela está no caminho crítico." : "."),
          "Ou ela começou e ninguém lançou no diário, ou o plano precisa ser refeito a partir de hoje.",
          { diasCriticos: n.critico ? n.duracao : 0 }));
      });
      o.nota = notaDe(pct, 0, LIMITES.piorComecouNoPassado.valor);
    })();

    /* ---------- 11b) A REDE CONTRA A ORDEM DA OBRA (CronoSeq) ----------
       ⚠ HEURÍSTICA, E SAI ROTULADA. A matriz do CronoSeq é tabela escrita à
       mão; o que ela acusa vem com `heuristica: true` e o motivo construtivo.
       Sem o CronoSeq carregado, NÃO AVALIADA com o motivo — nunca "tudo
       certo". Só entram grave e alta: "sobreposição proibida" (média) é o
       caso em que a obra às vezes faz mesmo, e pontuar isso reprovaria
       quase todo cronograma pela sobreposição automática de 15%. */
    (function () {
      var SQ = global.CronoSeq;
      if (!SQ || typeof SQ.conferir !== "function") {
        reg("sequenciaConstrutiva", { avaliado: false,
          motivo: "o módulo de sequência de obra (CronoSeq) não está carregado — esta nota NÃO diz que a rede respeita a ordem da obra" });
        return;
      }
      var cf;
      try { cf = SQ.conferir(orc, r); } catch (e) { cf = null; }
      if (!cf || !cf.ok) {
        reg("sequenciaConstrutiva", { avaliado: false,
          motivo: "o CronoSeq não conseguiu conferir este cronograma" + (cf && cf.erro ? " (" + corta(cf.erro, 80) + ")" : "") });
        return;
      }
      var pesados = arr(cf.achados).filter(function (a) { return a.gravidade === "grave" || a.gravidade === "alta"; });
      var o = reg("sequenciaConstrutiva", { medido: pesados.length, unidade: LIMITES.sequenciaAchados.unidade,
        limite: LIMITES.sequenciaAchados.valor, pior: LIMITES.piorSequencia.valor, avaliado: true,
        graves: arr(cf.achados).filter(function (a) { return a.gravidade === "grave"; }).length,
        total: cf.resumo.total, naoAvaliadosPelaMatriz: arr(cf.naoAvaliados).length,
        nota: notaDe(pesados.length, LIMITES.sequenciaAchados.valor, LIMITES.piorSequencia.valor) });
      pesados.slice(0, 12).forEach(function (a) {
        var n = L.porId[(a.para && a.para.id) || ""] || L.porId[(a.de && a.de.id) || ""] || null;
        achados.push(novoAchado("sequenciaConstrutiva", n, a.gravidade === "grave" ? "alta" : "media",
          corta(a.msg, 260),
          "Confira o \"Depende de\" das duas: " + (a.de ? a.de.num + " (" + a.de.catNome + ")" : "?") +
          " vem antes de " + (a.para ? a.para.num + " (" + a.para.catNome + ")" : "?") + " na obra.",
          { diasCriticos: (n && n.critico) ? num(a.dias) : 0, heuristica: true,
            porque: a.porque || "", seqTipo: a.tipo, seqGravidade: a.gravidade, conf: a.conf, direto: a.direto }));
      });
      o.nota = notaDe(pesados.length, LIMITES.sequenciaAchados.valor, LIMITES.piorSequencia.valor);
    })();

    /* ---------- 12) INFORMAÇÃO: % crítico e rede herdada ---------- */
    (function () {
      var crit = folhas.filter(function (n) { return n.critico; }).length;
      var pct = folhas.length ? (crit / folhas.length) * 100 : 0;
      reg("criticoPct", { medido: pct1(pct), unidade: "% das tarefas", quantos: crit, de: folhas.length,
        limite: LIMITES.criticoPct.valor, avaliado: true,
        texto: pct1(pct) + "% das tarefas estão no caminho crítico." +
          (pct >= 99 ? " Numa rede em cascata (cada tarefa depois da anterior) isso é 100% por construção — o número só vira sinal depois que a rede tiver elos decididos." : "") });
      /* só quem TEM predecessora entra: uma tarefa sem elo nenhum não é "elo
         herdado", é elo faltando — e isso já é a checagem 1. */
      var comPred = nos.filter(function (n) { return n.preds.length > 0; });
      var herdados = comPred.filter(function (n) { return !n.predsExplicito; }).length;
      var pctH = comPred.length ? (herdados / comPred.length) * 100 : 0;
      /* ⚠ sem nenhum elo o denominador é ZERO, e "0% herdado" leria como
         "rede toda decidida" — exatamente ao contrário do que aconteceu. */
      reg("redeImplicita", { medido: comPred.length ? pct1(pctH) : null, unidade: "% das tarefas com predecessora",
        quantos: herdados, de: comPred.length, avaliado: comPred.length > 0,
        motivo: comPred.length ? "" : "nenhuma tarefa deste cronograma tem predecessora — não há elo para classificar",
        texto: herdados + " de " + comPred.length + " tarefas dependem da ANTERIOR DA LISTA só porque estão embaixo dela — ninguém decidiu esse elo. " +
          "Ele é o padrão do motor, não um erro; mas um cronograma cuja rede inteira é herdada da ordem da planilha não sabe o que corre em paralelo na obra." });
    })();

    /* ---------- 13) O TESTE DO CAMINHO CRÍTICO (roda o motor) ---------- */
    var tc = testeCritico(orc, r, opts);
    (function () {
      var o = reg("criticoTeste", { avaliado: tc.ok, motivo: tc.motivo || "", detalhe: tc });
      if (!tc.ok) { o.nota = null; return; }
      o.medido = tc.falhas.length + tc.controlesFalhos.length;
      o.unidade = "tarefas que não responderam ao empurrão";
      o.limite = 0;
      o.testadas = tc.testadasCriticas; o.de = tc.criticasTotais; o.controles = tc.controles.length;
      /* ⚠ O DENOMINADOR DIZ DE QUE CAMADA ELE FALA. "2 de 2" num cronograma
         com 8 nós críticos é um recado que mente por omissão. */
      o.camadaTestada = tc.camadaTestada;
      o.criticasNaoTestadas = arr(tc.criticasNaoTestadas).length;
      if (tc.motivoCamada) o.camadaMotivo = tc.motivoCamada;
      o.nota = o.medido ? 0 : 100;
      /* ⚠ O CONTROLE DO TESTE PODE NÃO TER ONDE RODAR. Numa rede em cascata
         TODAS as etapas são críticas e não sobra nenhuma com folga para
         provar o outro lado ("empurrar dentro da folga não move a entrega").
         Medido: 38 dos 55 orçamentos reais desta base caem nesse caso. A
         tela precisa saber disso — senão "teste do crítico: passou" soa mais
         forte do que foi. */
      if (!tc.controles.length) o.controleMotivo = "nenhuma etapa com folga: numa rede em cascata tudo é crítico e o outro lado do teste (empurrar dentro da folga não pode mexer na entrega) não teve onde rodar";
      tc.falhas.forEach(function (f) {
        var n = L.porId[f.etapaId];
        achados.push(novoAchado("criticoTeste", n || { id: f.etapaId, tipo: "etapa", numero: "?", nome: f.nome, etapaId: f.etapaId }, "alta",
          "Empurrei a etapa " + (n ? n.numero : "") + " (" + corta(f.nome, 40) + "), que o motor marca como CRÍTICA, em " + f.empurrao +
          " dias úteis e a entrega andou " + (f.medido == null ? "não deu para medir" : f.medido + " dia(s)") + " — devia andar " + f.esperado + ".",
          "O vermelho do Gantt está apontando para a tarefa errada nessa etapa: apertá-la não recupera prazo. Confira o \"Depende de\" dela e das seguintes.",
          { diasCriticos: n ? n.duracao : 0, medido: f.medido, esperado: f.esperado }));
      });
      tc.controlesFalhos.forEach(function (f) {
        var n = L.porId[f.etapaId];
        achados.push(novoAchado("criticoTeste", n || { id: f.etapaId, tipo: "etapa", numero: "?", nome: f.nome, etapaId: f.etapaId }, "alta",
          "Empurrei a etapa " + (n ? n.numero : "") + " (" + corta(f.nome, 40) + ") em " + f.empurrao + " dia(s), DENTRO da folga de " +
          f.folga + " que o motor dá a ela, e a entrega andou " + (f.medido == null ? "não deu para medir" : f.medido + " dia(s)") + " — devia ficar parada.",
          "A folga dessa etapa não é real: o prazo depende dela mais do que o Gantt mostra.",
          { diasCriticos: 0, medido: f.medido, esperado: 0, controle: true }));
      });
    })();

    /* ---------- NOTA GERAL ---------- */
    var soma = 0, pesos = 0, itens = [], avaliadas = 0, total = 0, graves = [], reprovadas = 0;
    CHECAGENS.forEach(function (c) {
      var o = checagens[c.id];
      if (!o) return;
      if (c.pontua) total++;
      var item = { check: c.id, nome: c.nome, peso: c.peso, pontua: !!c.pontua, nota: o.nota == null ? null : o.nota,
        medido: o.medido == null ? null : o.medido, unidade: o.unidade || "", limite: o.limite == null ? null : o.limite,
        pior: o.pior == null ? null : o.pior,
        escala: o.pior == null ? "binária: 100 dentro do limite, 0 fora" : "reta: 100 no limite, 0 no pior caso",
        avaliado: o.avaliado !== false, motivo: o.motivo || "", heuristica: !!c.heuristica };
      itens.push(item);
      if (!c.pontua || o.avaliado === false || o.nota == null) return;
      avaliadas++; soma += o.nota * c.peso; pesos += c.peso;
      if (o.nota < 100) reprovadas++;
      if (c.grave && o.nota === 0) graves.push(c.nome);
    });
    var media = pesos ? Math.round(soma / pesos) : null;
    /* ⚠ O TETO DA FALHA GRAVE. Uma checagem de peso máximo zerada não é um
       detalhe que a média dilui — é o cronograma não fechando. Medido antes
       do teto: um plano com uma dessas saía com 89 de 100, e 89 se lê como
       "está bom". O teto é heurístico e está declarado em LIMITES. */
    var nota = media, tetoAplicado = null;
    if (media != null && graves.length && media > LIMITES.tetoComFalhaGrave.valor) {
      nota = LIMITES.tetoComFalhaGrave.valor; tetoAplicado = graves;
    }

    /* ⚠ NOTA ALTA NÃO É ATESTADO. "100" aqui quer dizer "nada do que esta
       régua mede está quebrado" — e ela NÃO mede se a rede foi decidida por
       alguém, nem o que não deu para avaliar. Sem estas ressalvas ao lado do
       número, um cronograma cuja rede inteira é a ordem da planilha sai com
       100 e a pessoa lê como aprovação. É o roteiro de "erro educado esconde
       defeito", ao contrário: elogio educado escondendo o mesmo defeito. */
    var ressalvas = [];
    var ri = checagens.redeImplicita, cp = checagens.criticoPct, ct = checagens.criticoTeste;
    if (ri && ri.avaliado !== false && num(ri.medido) >= 90)
      ressalvas.push("esta nota não diz que a rede foi DECIDIDA: " + ri.medido + "% dos elos são a ordem da planilha (a tarefa depende da anterior porque está embaixo dela).");
    if (cp && num(cp.medido) >= 99)
      ressalvas.push("todas as tarefas estão no caminho crítico — numa rede em cascata isso é automático, e não há o que priorizar.");
    if (ct && ct.controleMotivo)
      ressalvas.push("o teste do caminho crítico rodou só de um lado: " + ct.controleMotivo + ".");
    if (ct && ct.camadaMotivo)
      ressalvas.push("o teste do caminho crítico não alcançou a camada folha: " + ct.camadaMotivo + ".");
    if (ct && ct.avaliado === false && tc && tc.naoPedido)
      ressalvas.push("a nota saiu SEM o teste do caminho crítico (não pedido nesta chamada) — ela não diz que empurrar a tarefa crítica empurra a entrega.");
    var sq = checagens.sequenciaConstrutiva;
    if (!sq || sq.avaliado === false)
      ressalvas.push("esta nota NÃO diz que a rede respeita a ordem da obra: a checagem de sequência construtiva não foi avaliada" +
        (sq && sq.motivo ? " (" + sq.motivo + ")" : "") + ".");
    if (naoAvaliado.length)
      ressalvas.push(naoAvaliado.length + " checagem(ns) não deu(deram) para avaliar: " + naoAvaliado.map(function (x) { return x.nome; }).join(", ") + ".");

    /* ---------- OS 3 QUE MAIS CUSTAM PRAZO ----------
       ⚠ O CRITÉRIO É DECLARADO, E NÃO É PREVISÃO DE ATRASO. Ordena por DIAS
       ÚTEIS DE CAMINHO CRÍTICO TOCADOS pelo achado (medidos pelo motor):
       buraco no crítico = o tamanho do buraco; prazo estourado = os dias que
       passou; tarefa crítica com defeito = a duração dela. Achado em tarefa
       com folga não custa prazo hoje e cai para o fim. Dizer "isto vai
       atrasar N dias" seria inventar um número — e número inventado vai para
       reunião com cliente. */
    var ordemSev = { alta: 0, media: 1, baixa: 2 };
    var piores = achados.slice().sort(function (a, b) {
      return (b.diasCriticos - a.diasCriticos) || (ordemSev[a.severidade] - ordemSev[b.severidade]) ||
        ((checagem(b.check) || {}).peso || 0) - ((checagem(a.check) || {}).peso || 0);
    }).slice(0, 3).map(function (a) {
      return { achadoId: a.id, check: a.check, no: a.no, diasCriticos: a.diasCriticos, severidade: a.severidade, texto: a.texto };
    });

    achados.sort(function (a, b) {
      return (ordemSev[a.severidade] - ordemSev[b.severidade]) || (b.diasCriticos - a.diasCriticos) ||
        (((checagem(b.check) || {}).peso || 0) - ((checagem(a.check) || {}).peso || 0));
    });

    return {
      ok: true,
      camada: E.camada,
      resumo: {
        nos: nos.length, folhas: folhas.length, etapas: nos.filter(function (n) { return n.tipo === "etapa"; }).length,
        servicosForaDaRegua: E.camada === "executivo" ? arr(r.atividades).filter(function (n) { return n.tipo === "servico"; }).length : 0,
        criticas: folhas.filter(function (n) { return n.critico; }).length,
        totalDias: totalDias, dataInicio: r.dataInicio, dataFim: r.dataFim,
        modoExecutivo: !!(r.exec && r.exec.rede)
      },
      nota: { valor: nota, media: media, formula: FORMULA_NOTA, itens: itens, avaliadas: avaliadas, pontuaveis: total, reprovadas: reprovadas,
        ressalvas: ressalvas, teto: tetoAplicado ? { valor: LIMITES.tetoComFalhaGrave.valor, por: tetoAplicado } : null },
      achados: achados,
      piores: { criterio: "dias úteis de caminho crítico tocados pelo achado (medidos pelo motor) — NÃO é previsão de atraso", lista: piores },
      checagens: checagens,
      naoAvaliado: naoAvaliado,
      criticoTeste: tc,
      limites: LIMITES
    };
  }

  var CronoSaude = {
    LIMITES: LIMITES,
    CHECAGENS: CHECAGENS,
    FORMULA_NOTA: FORMULA_NOTA,
    checar: checar,
    testeCritico: testeCritico,
    _notaDe: notaDe,
    _escopo: montarEscopo
  };

  /* =================================================================
     DECISÕES QUE ESTE ARQUIVO TOMOU (e o que as sustenta)
      1) Serviço fora da régua de rede: ele não tem rede própria no motor
         (`_distribuir` crava preds:[]). Medi-lo reprovaria 100% por
         construção.
      2) Folga negativa não existe neste motor (clamp em Math.max(0,…));
         o equivalente medido é a restrição "terminar até" não cumprida.
      3) A sobreposição automática do `paralelismo` NÃO conta como lead da
         DCMA: é parâmetro declarado da obra, não decisão elo a elo. Sai como
         informação, com o número.
      4) % de tarefas críticas e rede herdada da ordem da planilha são
         INFORMAÇÃO (não pontuam): numa rede em cascata os dois dão 100% em
         todo orçamento, e uma nota que todo mundo tira igual não ajuda
         ninguém a escolher o que consertar.
      5) Marco sem data só se cobra de ETAPA: subetapa não tem como gravar
         data fixada neste motor (pendência).
      6) "Começou no passado" exige o realizado; sem ele sai NÃO AVALIADA,
         nunca "tudo certo".
      7) O teto de 60 vale só para as QUATRO checagens `grave` (o plano não
         fecha). "Ligações faltando" a 25% num cronograma de 4 etapas é
         desleixo — e desleixo a média já pune. Medido: com o teto ligado
         para peso 3, três orçamentos reais caíam a 60 por um único elo
         faltando num cronograma de 4 tarefas.
      8) O empurrão do teste do crítico vai pelo mapa de RESTRIÇÕES, nunca
         por `duracoes`: no modo executivo a etapa com subetapas ignora
         `duracoes`, e no APROVADO a duração é a gravada — nos dois casos um
         empurrão por duração não moveria nada e o teste sairia "passou"
         sem ter testado.
      9) A nota vem com RESSALVAS. "100" só quer dizer "nada do que esta
         régua mede está quebrado"; ela não mede se a rede foi decidida por
         alguém. Medido: 44 dos 55 reais avaliáveis têm a mediana de 100% dos
         elos herdados da ordem da planilha e ainda assim tiram 90+.
     10) O teste do crítico DECLARA a camada que alcançou (12/09/2026). Ele
         empurra por `restricoes`, que só existe para ETAPA — no modo
         executivo as subetapas críticas ficam fora. "passou (2 de 2)" num
         cronograma com 8 nós críticos é um recado que mente por omissão do
         denominador: agora saem `camadaTestada`, `criticasNaoTestadas` e uma
         ressalva. PENDÊNCIA para a frente do js/cronograma.js: `restricoes`
         por subetapaId destravaria o teste na camada folha.
     11) O PIOR CASO mora em LIMITES, por checagem (12/09/2026). Quatro
         checagens de limite ZERO usavam um `pior` cravado no corpo da função
         (25, 10, 50, 100) enquanto a FORMULA_NOTA — que sai impressa ao lado
         da nota — afirmava "4× o limite" para todas. Era falso para 4 das 15
         que pontuam. O `pior` de cada uma sai agora em `nota.itens[]`, e a
         escala binária se declara como binária.
     12) A 18ª checagem (rede contra a ordem da obra) depende do CronoSeq e
         PONTUA com peso 2 (12/09/2026). Peso 2 e não 3 porque a matriz é
         heurística: ela não zera plano como laço de dependência zera. Medido
         nos 55 reais: reprova 29 (53%) — não é ruído que acusa sempre, e a
         mediana da nota geral caiu de 93 para 93 com a mínima indo de 80
         para 74, que é a separação que faltava.
     ================================================================= */

  global.CronoSaude = CronoSaude;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoSaude;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

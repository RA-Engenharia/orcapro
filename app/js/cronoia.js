/* =====================================================================
 * cronoia.js — O QUE A IA VÊ, E O QUE SE FAZ COM O QUE ELA RESPONDE
 * (motor PURO — roda em Node, sem DOM, sem Store e SEM REDE)
 * Espec "cronograma pro", 12/09/2026.
 *
 * ⚠ AQUI NÃO SE CHAMA MODELO NENHUM. Quem fala com o provedor é a fiação
 *   (js/iaedit.js monta o corpo; o servidor chama). Este arquivo faz as três
 *   coisas que precisam de teste e não podem depender de uma resposta de rede:
 *     1) CONTEXTO — o texto compacto que descreve o cronograma para o modelo,
 *        com TETO DE BYTES e degradação DECLARADA (resume por etapa e diz que
 *        resumiu; nunca corta calado).
 *     2) REPLANEJAR — roda o MOTOR para descobrir o que de fato recupera
 *        prazo depois de um atraso, com o efeito MEDIDO de cada alternativa.
 *     3) NARRATIVA — os números do painel viram 4 a 6 frases de português de
 *        obra, montadas por REGRA (determinístico, testável). Não é chamada
 *        de modelo, não pode virar uma.
 *
 * O PRINCÍPIO QUE MANDA AQUI: a IA propõe, o MOTOR calcula, a PESSOA decide.
 *   Nenhuma linha deste arquivo inventa duração, produtividade ou data.
 *   - duração, folga, caminho crítico, término: `Cronograma.estimar`;
 *   - previsto × realizado, IDP, curva, projeção: `CronoPlan`;
 *   - sequência de obra: `CronoSeq` (que já sai rotulada como heurística);
 *   - saúde do plano: `CronoSaude`.
 *   O que este módulo faz é ESCOLHER O QUE MOSTRAR e MEDIR O EFEITO — rodando
 *   o motor de verdade sobre uma CÓPIA, nunca deduzindo da estrutura.
 *
 * ⚠ NÚMERO NÃO MEDIDO NÃO SAI COM CARA DE MEDIDO. Toda alternativa de
 *   replanejamento carrega `medido: true|false`; com `false`, `dias` é `null`
 *   e vem o `porqueNaoMedido` escrito. "Recupera 12 dias" que ninguém rodou é
 *   o número que vai para reunião com cliente — e é o defeito que este
 *   arquivo existe para não cometer.
 *
 * ⚠ O QUE É HEURÍSTICA SAI ROTULADO. O que vem do CronoSeq (sequência de
 *   obra) e do CronoSaude (limites calibrados) é heurística e viaja com
 *   `heuristica: true` e o `porque`. O que sai do `Cronograma.estimar` é
 *   conta do produto e não leva rótulo nenhum.
 *
 * API (global.CronoIA, também module.exports)
 *   contexto(orc, r, extras)        → {ok, texto, bytes, camada, resumido, …}
 *   replanejar(orc, atraso, opts)   → {ok, alvo, base, opcoes[], inertes[], …}
 *   narrativa(painel, opts)         → {ok, frases[], texto, origens[], …}
 *   OPS_PROPOSTAS                   → o que FALTA no catálogo de js/iaedit.js
 *                                     (proposta, não implementação)
 *   TETOS / LEGENDA / ADJETIVOS_VETADOS / TENDENCIA_VETADA
 *   _numeros(txt) / _conferirNumeros(txt, origens)  → a régua de "número novo
 *                                     no texto", aqui em cima do que EU
 *                                     escrevo (a suíte cobra)
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : 0; }
  function copia(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function chaves(o) { return (o && typeof o === "object") ? Object.keys(o) : []; }
  function C() { return global.Cronograma; }
  function SEQ() { return global.CronoSeq; }
  function SAU() { return global.CronoSaude; }
  function mapaDe(o, k) { if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {}; return o[k]; }
  function corta(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  /* bytes UTF-8: o teto do servidor é em BYTES e acento vale 2 — contar
     caractere aqui daria um contexto 15% maior que o medido (o mesmo
     `bytesUtf8` de js/iaedit.js). */
  function bytes(s) {
    try { return unescape(encodeURIComponent(String(s))).length; } catch (e) { return String(s).length * 3; }
  }
  function brNum(v, c) {
    if (v == null || !isFinite(v)) return "";
    c = c == null ? 1 : c;
    var s = Math.abs(num(v)).toFixed(c).replace(".", ",");
    if (c > 0) s = s.replace(/,?0+$/, "");
    return (num(v) < 0 ? "-" : "") + (s === "" ? "0" : s);
  }
  function dataBR(s) {
    s = String(s == null ? "" : s);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "";
  }
  function dataDeObj(d) {
    return (d && d.getFullYear) ? (("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear()) : "";
  }
  function plural(n, um, muitos) { return Math.abs(n) === 1 ? um : muitos; }
  /* meia-noite local em ms. ⚠ nunca `toISOString`: em UTC-3 ele volta um dia. */
  function meiaNoiteMs(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function msDaData(s) {
    var m = String(s == null ? "" : s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  /* ================= TETOS — ⚠ PENDÊNCIA DO ROGÉRIO =================
     Números iniciais conservadores, em constante nomeada para trocar num
     lugar só. O de contexto NÃO é chute: o corpo do POST /ia/editar tem teto
     de 20.000 caracteres de contexto e 64 KB de corpo (js/iaedit.js TETOS,
     = server/ia-editar.js LIMITES_PADRAO), e o texto daqui vai DENTRO desse
     contexto, dividindo o espaço com a rede em JSON, o catálogo e o pedido.
     MEDIDO nos 55 orçamentos reais dos backups (366 nós de etapa e subetapa):
     a linha de um nó custa 62 bytes na mediana, 76 no p90 e 108 no pior caso
     (id de 18 caracteres, nome, categoria, 5 números e as predecessoras); o
     cabeçalho fixo custa 554. Com 12.000 bytes cabem ~170 nós na mediana e
     ~139 no p90 — e nenhum dos 55 reais chegou perto (o maior deu 2.230
     bytes). Acima do teto a camada cai para etapa, com o aviso escrito. */
  var TETOS = {
    contextoBytes: 12000,   // o texto inteiro; passou, resume por ETAPA e DIZ
    nome: 60,               // nome de nó no texto (o id é que identifica)
    nomeObra: 80,
    maxMedicoes: 40,        // cada medição é um `Cronograma.estimar` inteiro
    maxOpcoes: 12,          // o que passar disso vira "não medido", com motivo
    combinarTop: 3,         // quantas opções entram na medição COMBINADA
    compressaoMax: 0.5,     // comprimir mais que metade não é comprimir: é outro plano
    fatorEquipesMax: 3,     // triplicar a frente idem
    /* ⚠ RÉPLICA DECLARADA dos tetos de js/iaedit.js (diasMin/diasMax,
       equipesMin/equipesMax, motivo). Este módulo é PURO e roda em Node sem o
       IAEdit carregado; sem a réplica ele proporia `n: 80` equipes, a op
       viajaria até o validador para ser recusada lá, e a pessoa leria
       "equipes fora da faixa" sem saber de onde veio. Mudou lá, muda aqui —
       tools/test-cronoia.js compara os dois quando o IAEdit está presente. */
    diasMin: 1, diasMax: 999,
    equipesMin: 1, equipesMax: 50,
    motivo: 200,
    frasesMin: 4, frasesMax: 6
  };

  var LEGENDA = "num|id|nome|categoria|dur|ini|fim|folga|C|preds|feito";

  /* ⚠ ADJETIVO VAZIO É O QUE FAZ A PESSOA PARAR DE LER. "A obra está em
     situação confortável" não se confere; "executado 54,2% contra 61,0%
     previstos" se confere. A lista é cobrada pela suíte em TODOS os
     cenários — se uma frase nova trouxer um destes, o teste reprova. */
  var ADJETIVOS_VETADOS = ["excelente", "ótimo", "otimo", "péssimo", "pessimo", "satisfatório", "satisfatorio",
    "preocupante", "confortável", "confortavel", "saudável", "saudavel", "robusto", "sólido", "solido",
    "significativo", "expressivo", "considerável", "consideravel", "substancial", "promissor", "alarmante",
    "animador", "tranquilo", "grave", "ruim", "excelentes", "delicado", "crítica", "critico da obra"];

  /* ⚠ TENDÊNCIA SEM DADO É O PIOR DOS DOIS MUNDOS: tem cara de número e é
     palpite. Estas expressões só podem aparecer quando `painel.curva.projecao`
     existe — e ela só existe com ritmo MEDIDO em 3 semanas de diário
     publicado (js/cronoplan.js, `projetarCurva`). Sem projeção, a frase certa
     é "ainda não dá para dizer", com o motivo do painel. */
  var TENDENCIA_VETADA = ["tendência", "tendencia", "no ritmo atual", "vai terminar", "deve terminar",
    "projeção", "projecao", "previsão de término", "previsao de termino", "estimativa de término",
    "caminha para", "deve fechar", "projetado"];

  /* =====================================================================
     O QUE FALTA NO CATÁLOGO FECHADO DE js/iaedit.js — PROPOSTA, NÃO CÓDIGO

     ⚠ Nada aqui está implementado, e de propósito: operação nova entra em
     TRÊS lugares ao mesmo tempo (server/ia-editar.js CATALOGO, js/iaedit.js
     CATALOGO+validar+aplicar+desfazer, e tools/test-ia-editar-srv.js, que
     compara as duas listas). Meia implementação produz o pior defeito
     possível — uma camada aceita o que a outra recusaria, e a promessa de
     universo fechado vira falsa sem ninguém ver. Os três arquivos são de
     outra frente; isto aqui é o pedido escrito, com a validação de cada uma.
     ===================================================================== */
  var OPS_PROPOSTAS = [
    { op: "mover_tarefa", grupo: "cronograma", campos: ["alvoId", "diaUtil", "motivo"],
      porque: "É o que a barra arrastada no Gantt grava (orc.cronograma.restricoes = {id:{tipo:'nia', data}}, js/cronograma.js `_restricoes`). Sem ela a IA só sabe mudar duração e elo — e 'esta frente só começa depois da liberação da concessionária' não tem como ser escrito.",
      validacao: [
        "⚠ `diaUtil` é ÍNDICE de dia útil (inteiro ≥ 0), NUNCA data: o modelo não sabe o dia de hoje, e data vinda dele é o vetor de escrever 'início em 30/02'. O app converte com o calendário do próprio resultado (Cronograma.calendario(r).dia(k)) antes de gravar em `restricoes`.",
        "faixa: 0 ≤ diaUtil ≤ totalDias + 365 (empurrar um ano além do fim já é outro plano, não um ajuste)",
        "alvoId ∈ ids do contexto (etapa; subetapa não tem como gravar data neste motor — ver CronoSaude, decisão 5)",
        "recusa se o nó estiver 100% realizado (mover o que já foi feito reescreve fato)",
        "recusa no orçamento aprovado (Cronograma.congeladoPorAprovacao) — a porta é a revisão"
      ] },
    { op: "limpar_dependencia", grupo: "cronograma", campos: ["alvoId", "motivo"],
      porque: "Hoje `definir_dependencia` com preds:[] significa 'sem predecessora, começa no dia 0' (js/cronograma.js: `parsePreds`), que NÃO é o mesmo que voltar ao padrão 'depende da anterior'. Sem esta op, um replanejamento que erra a topologia só volta pelo Desfazer de 1 nível — e um replanejamento de 30 ops passa do teto de desfazer (js/iaedit.js TETOS.desfazerBytes).",
      validacao: [
        "apaga a chave em `predecessoras`/`sub.predecessoras` (e em `lags`/`tipos`), não grava []",
        "alvoId ∈ ids do contexto",
        "o diff tem de mostrar 'volta ao padrão: depende da anterior da lista' — não 'sem dependência'"
      ] },
    { op: "definir_equipes", grupo: "cronograma", campos: ["folhaId", "n", "motivo"], jaExiste: true,
      porque: "JÁ EXISTE, mas só aceita `tipo === 'folha'` (server/ia-editar.js) e o contexto só marca como folha `subetapa` e `soltos` (js/iaedit.js). Uma etapa SEM subetapas — que é a folha real do trabalho na maioria dos orçamentos reais — nunca recebe equipes pela IA, e isso mata metade do crashing.",
      validacao: [
        "marcar como folha, no contexto, a etapa que não tem subetapa (ou aceitar tipo==='etapa' quando o nó não tiver filhos na rede enviada)",
        "n inteiro de " + TETOS.equipesMin + " a " + TETOS.equipesMax + " (já é a régua de hoje)",
        "⚠ a op é INERTE onde a duração está digitada: js/cronograma.js `_preparar` dá precedência a `sub.duracoes[id]` sobre equipes. O diff tem de dizer isso, senão a pessoa marca uma mudança que não muda nada"
      ] },
    { op: "criar_marco", grupo: "cronograma", campos: ["alvoId", "marco", "motivo"],
      porque: "`marcar_marco` só LIGA. Não há como desmarcar: uma etapa que a IA transformou em marco por engano fica com duração zero até alguém achar o campo na tela.",
      validacao: [
        "marco booleano (true liga, false desliga) — sem terceiro estado",
        "recusa marcar como marco um nó com realizado > 0 (zerar a duração de algo em andamento apaga a barra que o diário está medindo)",
        "⚠ marco NÃO fixa data neste motor (js/cronograma.js: marco só zera a duração; a data continua derivada da rede). O diff não pode dizer 'entrega em 30/06' — quem fixa data é `mover_tarefa`"
      ] },
    { op: "definir_restricao_fim", grupo: "cronograma", campos: ["alvoId", "diaUtil", "motivo"],
      porque: "O par do `mover_tarefa`: 'terminar até' (tipo 'tae' do mapa `restricoes`, que hoje só avisa). É como se escreve prazo contratual de fase sem mentir que a rede o garante.",
      validacao: [
        "mesma régua de `diaUtil` (índice, nunca data)",
        "o motor só AVISA quando o 'tae' não é cumprido — o diff tem de dizer que isto não empurra nada, senão a pessoa acha que marcou e resolveu"
      ] }
  ];

  /* =====================================================================
     1) CONTEXTO — o que o modelo vê
     ===================================================================== */

  function nosDe(r) {
    /* a árvore EAP (ctx.eap) é a camada folha; sem ela só há etapa. */
    if (r && Array.isArray(r.atividades)) {
      return { camada: "folha", lista: r.atividades.filter(function (n) { return n && n.tipo !== "servico"; }) };
    }
    var es = arr(r && r.etapas).map(function (e, i) {
      return { id: e.id, tipo: "etapa", numero: String(i + 1), nome: e.nome, etapaId: e.id,
        categoria: e.categoria, duracao: e.duracao, inicio: e.inicio, fim: e.fim, folga: e.folga,
        critico: !!e.critico, marco: !!e.marco, preds: arr(e.preds), equipeDias: e.equipeDias };
    });
    return { camada: "etapa", lista: es };
  }

  function linhaDoNo(n, numPorId, realizado) {
    var preds = arr(n.preds).map(function (p) { return numPorId[p] || "?"; }).join(",");
    var cols = [
      n.numero,
      String(n.id),
      corta(n.nome, TETOS.nome),
      n.marco ? "marco" : String(n.categoria || "outros"),
      n.marco ? "0" : String(num(n.duracao)),
      String(num(n.inicio)),
      String(num(n.fim)),
      String(num(n.folga)),
      n.critico ? "C" : "",
      preds || "-"
    ];
    if (realizado) cols.push(own(realizado, n.id) ? (brNum(num(realizado[n.id]), 0) + "%") : "-");
    return cols.join("|");
  }

  /* as linhas de CABEÇALHO: o que o modelo precisa saber para não escrever
     besteira. ⚠ A primeira delas é a que impede data inventada. */
  function cabecalhoDe(r, D, extras, camada) {
    var L = [];
    L.push("CRONOGRAMA — " + D.lista.length + " " + plural(D.lista.length, "nó", "nós") + ", " +
      num(r.totalDias) + " " + plural(num(r.totalDias), "dia útil", "dias úteis") + " no total.");
    /* ⚠ ÍNDICE DE DIA ÚTIL, NUNCA DATA. Data vinda de um modelo que não sabe o
       dia de hoje é o defeito que a espec do iaedit já barrou em
       `definir_parametro`. Sem esta linha, o modelo devolve "início em
       15/04/2026" e alguém marca no diff. */
    L.push("⚠ ini/fim/folga são ÍNDICES DE DIA ÚTIL a partir do dia 0 (0 = primeiro dia de obra). NÃO HÁ DATA NESTE TEXTO, e você não deve escrever nenhuma: quem converte índice em data é o aplicativo.");
    L.push("⚠ dur/folga/C (caminho crítico) foram CALCULADOS pelo motor do produto. Não recalcule, não some, não proponha número de dia que você mesmo tenha estimado.");
    L.push("camada: " + camada + (camada === "etapa" ? " (só etapas — ver AVISOS)" : " (etapas e subetapas)"));
    L.push("colunas: " + LEGENDA + (extras && extras.realizado ? "" : "  [a coluna 'feito' não veio — ver AVISOS]"));
    return L;
  }

  function CronoIA_contexto(orc, r, extras) {
    extras = extras || {};
    var res = { ok: false, heuristica: true, texto: "", bytes: 0, teto: 0, camada: "", camadaPedida: "",
      resumido: false, porque: "", nos: 0, etapas: 0, folhas: 0, linhas: 0,
      cabecalho: [], avisos: [], mapa: {}, fontes: [] };
    var Cr = C();
    if (!Cr || typeof Cr.estimar !== "function") {
      res.erro = "o motor do cronograma (Cronograma.estimar) não está disponível — sem ele não há duração, folga nem caminho crítico, e este módulo não inventa nenhum dos três";
      return res;
    }
    if (!orc || !arr(orc.etapas).length) { res.erro = "orçamento sem etapas"; return res; }
    var R = r;
    if (!R || !R.etapas) {
      try { R = Cr.estimar(orc, extras.override || null, { eap: true }); }
      catch (e) { res.erro = "o motor não conseguiu calcular o cronograma (" + e.message + ")"; return res; }
    }
    var teto = num(extras.teto) > 0 ? Math.floor(num(extras.teto)) : TETOS.contextoBytes;
    res.teto = teto;

    var D = nosDe(R);
    res.camadaPedida = D.camada;
    var realizado = (extras.realizado && typeof extras.realizado === "object" && !Array.isArray(extras.realizado)) ? extras.realizado : null;
    var numPorId = {};
    D.lista.forEach(function (n) { numPorId[n.id] = n.numero; res.mapa[n.numero] = n.id; });
    res.nos = D.lista.length;
    D.lista.forEach(function (n) { if (n.tipo === "etapa") res.etapas++; else res.folhas++; });

    /* ---- avisos que são INFORMAÇÃO, não enfeite ---- */
    /* ⚠ o cabeçalho diz "camada: etapa (só etapas — ver AVISOS)"; sem esta
       linha ele apontava para um aviso que não existia quando a camada caiu
       por falta da árvore EAP, e não por tamanho. Recado que aponta para o
       nada é o mesmo que recado nenhum. */
    if (D.camada === "etapa") {
      res.avisos.push("o resultado do motor veio SEM a árvore EAP (Cronograma.estimar(orc, override, {eap:true})): só as etapas foram descritas. Nenhuma proposta pode mexer em subetapa, porque nenhuma foi enviada.");
    }
    if (!realizado) {
      res.avisos.push("realizado NÃO informado: o modelo não sabe o que já foi executado (vem de CronoPlan.realizadoPorNo). Nada aqui pode ser lido como \"a obra ainda não começou\".");
    }
    /* ⚠ PESO EM PONTOS PERCENTUAIS FICA DE FORA POR PADRÃO. `r.atividades[].peso`
       existe e é participação no VALOR DE VENDA. Não é preço nem margem, mas é
       a primeira informação derivada de dinheiro que atravessaria a fronteira
       para um provedor externo — e essa decisão é do Rogério, não deste
       arquivo (CLAUDE.md §5). Com `extras.peso === true` ele entra, e o texto
       diz o que é. Sem ele, a IA prioriza por duração e folga, e o aviso
       abaixo obriga a tela a dizer isso. */
    if (extras.peso !== true) {
      res.avisos.push("participação de cada etapa no escopo (peso) NÃO foi enviada: a priorização sai por duração, folga e caminho crítico. Comprimir uma frente pequena pode não mudar nada além da data.");
    }

    /* ---- saúde (CronoSaude) ---- */
    var saude = extras.saude, saudeSemCritico = false;
    if (saude === undefined && SAU() && typeof SAU().checar === "function") {
      /* ⚠ O TESTE DO CAMINHO CRÍTICO FICA DE FORA POR PADRÃO — e o texto diz.
         MEDIDO em 12/09/2026: montar contexto de um orçamento sintético de
         2.400 serviços custava 4.600 ms, dos quais 4.839 ms eram o
         `CronoSaude.checar` e 4.839 desses o `testeCritico` — até 21
         `Cronograma.estimar` inteiros. 98% do custo. Este arquivo já
         desligava a medição do CronoSeq três linhas acima "porque montar
         contexto é operação de tela", e ligava a mais cara de todas logo
         abaixo. Nos 55 orçamentos REAIS o pior caso é 136 ms (o maior tem 67
         serviços), então isto não dói hoje — mas é a mesma tecla que
         `sugerir` e `replanejar` apertam, tudo síncrono na thread da tela.
         O texto do contexto usa a NOTA e os 6 primeiros achados; nenhum
         deles vem do teste do crítico. Quem quiser a nota completa passa
         `extras.saude` já calculado — o contrato que o arquivo já tem. */
      var comCritico = extras.criticoTeste === true;
      saudeSemCritico = !comCritico;
      try { saude = SAU().checar(orc, R, { realizado: realizado || undefined, criticoTeste: comCritico ? undefined : false }); }
      catch (e) { saude = null; }
    }
    var linhasSaude = [];
    if (saude && saude.ok && saude.nota && saude.nota.valor != null) {
      linhasSaude.push("SAÚDE DO PLANO (régua determinística CronoSaude, camada " + saude.camada + "): nota " +
        brNum(saude.nota.valor, 0) + " de 100, com " + num(saude.nota.avaliadas) + " " +
        plural(num(saude.nota.avaliadas), "checagem avaliada", "checagens avaliadas") + " e " +
        num(arr(saude.naoAvaliado).length) + " não " + plural(arr(saude.naoAvaliado).length, "avaliada", "avaliadas") + ".");
      if (saude.resumo) {
        linhasSaude.push("achados: " + num(saude.resumo.grave) + " graves, " + num(saude.resumo.alta) +
          " de severidade alta, " + num(saude.resumo.media) + " média — parte dos limites é HEURÍSTICA desta casa, não norma.");
      }
      /* ⚠ O QUE FICOU DE FORA SAI DITO, na mesma régua da economia não medida
         do CronoSeq logo abaixo: nota sem o teste do crítico NÃO quer dizer
         que empurrar a tarefa crítica empurra a entrega. */
      if (saudeSemCritico) {
        linhasSaude.push("- esta nota saiu SEM o teste do caminho crítico (cada empurrão é um recálculo inteiro, e montar contexto é operação de tela): ela não diz que apertar a tarefa vermelha recupera prazo.");
      }
      arr(saude.achados).slice(0, 6).forEach(function (a) {
        linhasSaude.push("- [" + a.severidade + "] " + corta(a.texto, 150));
      });
      res.fontes.push("CronoSaude.checar");
    } else if (saude === false) {
      linhasSaude.push("SAÚDE DO PLANO: não pedida nesta chamada.");
    } else {
      linhasSaude.push("SAÚDE DO PLANO: não avaliada (CronoSaude não respondeu) — a ausência de achado aqui NÃO quer dizer que o plano esteja certo.");
    }

    /* ---- paralelismos (CronoSeq) ---- */
    var seq = extras.seq;
    if (seq === undefined && SEQ() && typeof SEQ().sugerir === "function") {
      /* ⚠ `medir: false` de propósito: medir cada paralelismo é um
         `Cronograma.estimar` por elo, e montar contexto é operação de tela.
         Sem medição NENHUM número de dia aparece aqui — o texto diz que não
         mediu. Quem quiser o número passa `extras.seq` já medido, ou chama
         `CronoIA.replanejar`, que mede. */
      try { seq = SEQ().sugerir(orc, R, { medir: false }); } catch (e) { seq = null; }
    }
    var linhasSeq = [];
    if (seq && seq.ok) {
      var ps = arr(seq.paralelismos);
      linhasSeq.push("SEQUÊNCIA DE OBRA (matriz CronoSeq — ⚠ HEURÍSTICA, tabela de precedência escrita à mão): " +
        arr(seq.ligacoes).length + " " + plural(arr(seq.ligacoes).length, "ligação sugerida", "ligações sugeridas") + ", " +
        ps.length + " " + plural(ps.length, "frente que hoje espera sem precisar", "frentes que hoje esperam sem precisar") + ".");
      /* ⚠ SEM MEDIÇÃO, NENHUM DIA É PROMETIDO — e o texto diz que não mediu,
         em vez de ficar calado. "0 frentes que esperam sem precisar" quando a
         medição nem rodou seria um recado que mente. */
      if (!(seq.economia && seq.economia.medido)) {
        linhasSeq.push("- economia em dias NÃO medida nesta chamada" +
          ((seq.economia && seq.economia.porque) ? " (" + corta(seq.economia.porque, 120) + ")" : "") +
          ": nenhum número de prazo desta seção pode ser usado como ganho.");
      }
      ps.slice(0, 8).forEach(function (p) {
        linhasSeq.push("- " + p.bNum + " espera " + p.aNum + ": " + corta(p.porque, 150) +
          (p.medido && p.dias != null ? " (medido: " + p.dias + " " + plural(p.dias, "dia", "dias") + ")" : " (economia NÃO medida nesta chamada)"));
      });
      if (arr(seq.pendentes).length) {
        linhasSeq.push("- " + arr(seq.pendentes).length + " " + plural(arr(seq.pendentes).length, "nó", "nós") +
          " sem categoria reconhecida: a matriz não fala deles e nada foi proposto.");
      }
      res.fontes.push("CronoSeq.sugerir");
    } else {
      linhasSeq.push("SEQUÊNCIA DE OBRA: não avaliada (CronoSeq não respondeu).");
    }

    res.fontes.push("Cronograma.estimar");

    /* ---- montagem, com a degradação DECLARADA ---- */
    function montar(camada) {
      var lista = camada === "etapa" ? D.lista.filter(function (n) { return n.tipo === "etapa"; }) : D.lista;
      var cab = cabecalhoDe(R, D, { realizado: realizado }, camada);
      var corpo = lista.map(function (n) { return linhaDoNo(n, numPorId, realizado); });
      var av = res.avisos.slice();
      if (camada === "etapa" && D.camada === "folha") {
        av.unshift("⚠ RESUMIDO: as " + res.folhas + " subetapas NÃO cabem no teto de " + teto +
          " bytes e ficaram de fora — abaixo estão só as " + res.etapas +
          " etapas. Nenhuma proposta sua pode mexer em subetapa, porque você não as viu. Para trabalhar nelas, peça uma etapa por vez.");
      }
      var txt = cab.join("\n") + "\n\n" + corpo.join("\n") + "\n\n" + linhasSaude.join("\n") + "\n\n" + linhasSeq.join("\n") +
        (av.length ? "\n\nAVISOS\n" + av.map(function (x) { return "- " + x; }).join("\n") : "");
      return { texto: txt, cab: cab, linhas: corpo.length, avisos: av };
    }

    var m = montar(D.camada), b = bytes(m.texto);
    if (b > teto && D.camada === "folha") {
      var m2 = montar("etapa"), b2 = bytes(m2.texto);
      if (b2 <= teto) {
        res.resumido = true;
        res.porque = "o texto na camada folha tinha " + b + " bytes, acima do teto de " + teto +
          " — resumido para a camada etapa (" + b2 + " bytes). As subetapas não foram enviadas, e o texto diz isso.";
        m = m2; b = b2;
        res.camada = "etapa";
      }
    }
    if (b > teto) {
      /* ⚠ NÃO CORTO LINHA. Metade da rede é pior que rede nenhuma: o modelo
         propõe um plano para uma obra que ele não viu inteira, e o diff parece
         completo. A resposta honesta é a mesma que o js/iaedit.js já dá —
         "escolha as etapas" — com o número para a pessoa conferir. */
      res.erro = "cronograma grande demais para um pedido só: " + b + " bytes contra o teto de " + teto +
        " (" + res.etapas + " " + plural(res.etapas, "etapa", "etapas") + ", " + res.folhas + " " +
        plural(res.folhas, "subetapa", "subetapas") + "). Escolha as etapas e peça uma parte por vez — mandar metade da rede faria a IA propor um plano para uma obra que ela não viu inteira.";
      res.bytes = b;
      res.camada = res.camada || D.camada;
      return res;
    }
    if (!res.camada) res.camada = D.camada;
    res.texto = m.texto; res.bytes = b; res.cabecalho = m.cab; res.linhas = m.linhas; res.avisos = m.avisos;
    res.ok = true;
    return res;
  }

  /* =====================================================================
     2) REPLANEJAR — o que de fato recupera prazo, MEDIDO
     ===================================================================== */

  /* CÓPIA com as mudanças escritas nos mapas do cronograma. ⚠ Cada tipo tem
     um mapa próprio, e escrever no errado é mudança que não muda nada:
     - duração de ETAPA  → cronograma.duracoes[id]
     - duração de FOLHA  → cronograma.sub.duracoes[id]
     - equipes de FOLHA  → cronograma.sub.equipes[id]
     - ligação           → (sub.)predecessoras / lags / tipos (a mesma régua do
                            CronoSeq.aplicarEmCopia, replicada aqui para o
                            módulo não depender dele para medir duração). */
  function copiaCom(orc, muds) {
    var c = copia(orc) || {};
    if (!c.cronograma || typeof c.cronograma !== "object" || Array.isArray(c.cronograma)) c.cronograma = {};
    arr(muds).forEach(function (m) {
      var cron = c.cronograma;
      if (m.tipo === "duracao") {
        var alvo = m.nivel === "folha" ? mapaDe(cron, "sub") : cron;
        mapaDe(alvo, "duracoes")[m.id] = m.para;
      } else if (m.tipo === "equipes") {
        mapaDe(mapaDe(cron, "sub"), "equipes")[m.id] = m.para;
      } else if (m.tipo === "ligacao") {
        var mm = m.nivel === "folha" ? mapaDe(cron, "sub") : cron;
        var pc = mapaDe(mm, "predecessoras"), lc = mapaDe(mm, "lags"), tc = mapaDe(mm, "tipos");
        pc[m.id] = arr(m.preds).slice();
        if (chaves(m.lags).length) lc[m.id] = copia(m.lags); else delete lc[m.id];
        if (m.nivel === "folha") { if (chaves(m.tipos).length) tc[m.id] = copia(m.tipos); else delete tc[m.id]; }
      }
    });
    return c;
  }

  /* ⚠ O PRAZO VEM COM "FECHOU LAÇO?" COLADO NELE. O motor NÃO recusa laço de
     dependência: ele desenha IGNORANDO um elo e devolve
     `temCiclo`/`exec.avisos[tipo:"ciclo"]`. Um prazo medido assim é sempre
     MENOR (é a rede com um elo a menos) e não é de ninguém.
     ⚠ SEGUNDO CONSUMIDOR DO MESMO DEFEITO. O js/cronoseq.js ganhou esta
     guarda no mesmo commit; aqui ela precisava existir de novo porque
     `replanejar` NÃO usa a medição do CronoSeq — ele mede por conta própria,
     contra a mesma linha de partida das outras alternativas (é o que evita
     dois números divergentes na tela). Medido nos 55 orçamentos reais antes
     da guarda: o maior ganho anunciado por `replanejar` era 512 dias úteis,
     e ele nascia de uma rede com laço. É o roteiro de "conserto que para no
     segundo consumidor". O `{eap:true}` é obrigatório: sem a árvore,
     `r.exec.avisos` não existe e o laço ENTRE SUBETAPAS passa calado. */
  function medir(orc) {
    var Cr = C();
    if (!Cr || !Cr.estimar) return null;
    try {
      var r = Cr.estimar(orc, null, { eap: true });
      var cic = !!r.temCiclo;
      arr(r.exec && r.exec.avisos).forEach(function (a) { if (a && a.tipo === "ciclo") cic = true; });
      return { dias: num(r.totalDias), fim: r.dataFim ? new Date(r.dataFim.getTime()) : null,
        criticos: arr(r.caminhoCritico).slice(), ciclo: cic };
    } catch (e) { return null; }
  }

  function diffCritico(antes, depois, nomePorId) {
    var A = {}, B = {}, entraram = [], sairam = [];
    arr(antes).forEach(function (id) { A[id] = 1; });
    arr(depois).forEach(function (id) { B[id] = 1; });
    arr(depois).forEach(function (id) { if (!own(A, id)) entraram.push({ id: id, nome: nomePorId[id] || "" }); });
    arr(antes).forEach(function (id) { if (!own(B, id)) sairam.push({ id: id, nome: nomePorId[id] || "" }); });
    return { entraram: entraram, sairam: sairam };
  }

  function lerAtraso(a, R) {
    var Cr = C();
    if (a == null) {
      return { dias: null, fonte: "", porque: "não foi dito quanto recuperar — as alternativas saem medidas do mesmo jeito, e nenhuma é marcada como suficiente" };
    }
    if (typeof a === "number") {
      if (!(a > 0)) return { dias: null, fonte: "número", porque: "o atraso informado não é positivo — nada a recuperar" };
      return { dias: Math.round(a), fonte: "número passado", porque: "" };
    }
    if (typeof a === "object") {
      if (num(a.dias) > 0) return { dias: Math.round(num(a.dias)), fonte: "atraso.dias", porque: "" };
      if (a.ate && Cr && typeof Cr.diaUtilDoCorte === "function" && R) {
        /* ⚠ FORA DA FAIXA É RESPOSTA, NÃO FALHA TÉCNICA.
           ROTEIRO DO DEFEITO (12/09/2026): `Cronograma.diaUtilDoCorte`
           devolve `null` em DOIS casos — data antes do início da obra e data
           depois do fim — e os dois caíam na mesma frase ("não consegui
           situar a data-alvo no calendário"). A frase escrita para o caso
           "já termina antes disso" era INALCANÇÁVEL: quem perguntava "dá
           para entregar até 2030?" recebia uma falha técnica em vez da
           resposta, que é "você já termina antes". Por isso a faixa se
           confere ANTES, contra o `dataInicio`/`dataFim` que o próprio
           motor devolveu, e o recado técnico fica só para o `null` inesperado. */
        var alvoMs = msDaData(a.ate);
        var iniMs = R.dataInicio && R.dataInicio.getTime ? meiaNoiteMs(R.dataInicio) : null;
        var fimMs = R.dataFim && R.dataFim.getTime ? meiaNoiteMs(R.dataFim) : null;
        var fonteTxt = "atraso.ate (" + dataBR(a.ate) + ")";
        if (alvoMs == null) return { dias: null, fonte: fonteTxt, porque: "não entendi a data-alvo — use \"AAAA-MM-DD\"" };
        if (iniMs != null && alvoMs < iniMs) {
          return { dias: null, fonte: fonteTxt, foraDaFaixa: "antes",
            porque: "a data-alvo (" + dataBR(a.ate) + ") é ANTERIOR ao começo da obra (" + dataDeObj(R.dataInicio) + ") — não é um prazo a recuperar, é outra obra" };
        }
        if (fimMs != null && alvoMs >= fimMs) {
          return { dias: null, fonte: fonteTxt, foraDaFaixa: "depois",
            porque: "o plano já termina em " + dataDeObj(R.dataFim) + ", antes da data-alvo (" + dataBR(a.ate) + ") — não há prazo a recuperar" };
        }
        var k = Cr.diaUtilDoCorte(R, String(a.ate));
        if (k != null && isFinite(k)) {
          var d = num(R.totalDias) - num(k);
          if (d > 0) return { dias: Math.round(d), fonte: fonteTxt, porque: "" };
          return { dias: null, fonte: fonteTxt, porque: "a data-alvo cai no último dia útil do plano — não há prazo a recuperar" };
        }
        return { dias: null, fonte: "atraso.ate", porque: "não consegui situar a data-alvo no calendário deste cronograma (Cronograma.diaUtilDoCorte não respondeu) — a data está dentro da faixa da obra, então isto é defeito: avise" };
      }
    }
    return { dias: null, fonte: "", porque: "atraso em formato que não reconheço — use {dias: N} ou {ate: \"AAAA-MM-DD\"}" };
  }

  /* frentes implícitas numa duração, pela FÓRMULA DO PRÓPRIO MOTOR
     (js/cronograma.js `_preparar`: dur = max(1, ceil(equipeDias / equipes))).
     ⚠ FRENTES, NÃO HOMENS — o comentário do motor é explícito sobre isso, e
     repetir "pessoas" aqui poria um número de gente que ninguém calculou. */
  function frentesPara(ed, dias) {
    if (!(num(ed) > 0) || !(num(dias) > 0)) return null;
    return Math.max(1, Math.ceil(num(ed) / num(dias)));
  }

  function CronoIA_replanejar(orc, atraso, opts) {
    /* ⚠ ASSINATURA TOLERANTE. A espec escreveu `replanejar(r, atraso, opc)`,
       mas `r` sozinho NÃO volta ao motor: `Cronograma.estimar` precisa do
       ORÇAMENTO para recalcular, e sem recalcular não há efeito MEDIDO —
       que é a coisa toda desta função. Então o 1º argumento é o orçamento e
       o 2º aceita as duas formas: o atraso, ou o `r` já calculado (com o
       atraso indo em `opts.atraso`). */
    opts = opts || {};
    var R = opts.r || null;
    if (atraso && typeof atraso === "object" && !Array.isArray(atraso) &&
        atraso.params && own(atraso, "totalDias") && Array.isArray(atraso.etapas)) {
      R = atraso; atraso = opts.atraso;
    }
    var res = { ok: false, heuristica: true, alvo: null, base: null,
      opcoes: [], inertes: [], combinado: null, naoMedidos: [], pendentes: [], avisos: [],
      medicoes: 0, fontes: ["Cronograma.estimar"] };
    var Cr = C();
    if (!Cr || typeof Cr.estimar !== "function") {
      res.erro = "o motor do cronograma (Cronograma.estimar) não está disponível — sem ele nada aqui pode ser MEDIDO, e este módulo não devolve recuperação de prazo que não mediu";
      return res;
    }
    if (!orc || !arr(orc.etapas).length) { res.erro = "orçamento sem etapas"; return res; }
    /* ⚠ APROVADO NÃO SE REPLANEJA. A data aprovada é a gravada
       (Cronograma.congeladoPorAprovacao) e não muda nem aqui, nem na proposta,
       nem nos outros aparelhos: qualquer opção sairia com efeito medido ZERO,
       e a pessoa acharia que o sistema não funciona. A porta é a revisão do
       orçamento — ou o plano de execução da obra, que é outro documento
       (`orc._planoDaObra`) e passa direto por esta guarda. */
    if (typeof Cr.congeladoPorAprovacao === "function" && Cr.congeladoPorAprovacao(orc)) {
      res.erro = "este orçamento está APROVADO: a data dele é a que foi aprovada e não muda por replanejamento. Para replanejar, abra a revisão do orçamento — ou, se a obra já começou, o plano de execução dela.";
      return res;
    }
    if (!R || !R.etapas) {
      try { R = Cr.estimar(orc, opts.override || null, { eap: true }); }
      catch (e) { res.erro = "o motor não conseguiu calcular o cronograma (" + e.message + ")"; return res; }
    }

    var base = medir(orc);
    if (!base) { res.erro = "o motor não devolveu prazo para o orçamento como está — sem linha de partida não há efeito a medir"; return res; }
    res.base = { dias: base.dias, fim: base.fim, criticos: base.criticos.length };
    res.alvo = lerAtraso(atraso, R);

    var D = nosDe(R);
    var nomePorId = {}, numPorId = {};
    D.lista.forEach(function (n) { nomePorId[n.id] = n.nome; numPorId[n.id] = n.numero; });
    var cron = (orc.cronograma && typeof orc.cronograma === "object") ? orc.cronograma : {};
    var redeLigada = !!(cron.exec && cron.exec.rede === true);
    var realizado = (opts.realizado && typeof opts.realizado === "object" && !Array.isArray(opts.realizado)) ? opts.realizado : null;
    if (!realizado) {
      res.avisos.push("realizado não informado: não dá para saber o que já foi executado, então NENHUMA alternativa foi descartada por estar em andamento. Passe CronoPlan.realizadoPorNo antes de aplicar qualquer coisa.");
    }
    var temFolha = D.lista.some(function (n) { return n.tipo !== "etapa"; });
    if (temFolha && !redeLigada) {
      res.avisos.push("o modo executivo (\"Detalhar o prazo pelas subetapas\") está DESLIGADO: a duração da subetapa é desenhada dentro da janela da etapa. Alternativas em subetapa aparecem medidas — e o que vier com zero está aí em \"inertes\", com o motivo.");
    }

    var teto = num(opts.maxMedicoes) > 0 ? num(opts.maxMedicoes) : TETOS.maxMedicoes;
    var alvoDias = res.alvo.dias;

    function registrar(cand) {
      /* cand = {tipo, nivel, noId, num, nome, cat, de, para, muds, op, custo, porque, exigeContratar} */
      if (res.medicoes >= teto) {
        res.naoMedidos.push({ tipo: cand.tipo, noId: cand.noId, num: cand.num, nome: cand.nome,
          porqueNaoMedido: "acima do teto de " + teto + " medições nesta chamada (cada medição é um recálculo inteiro do cronograma)" });
        return;
      }
      res.medicoes++;
      var m = medir(copiaCom(orc, cand.muds));
      if (!m) {
        res.naoMedidos.push({ tipo: cand.tipo, noId: cand.noId, num: cand.num, nome: cand.nome,
          porqueNaoMedido: "o motor não devolveu prazo com esta alternativa aplicada" });
        return;
      }
      /* ⚠ LAÇO = SEM NÚMERO. Ver o comentário de `medir`. E o produto RECUSA
         a op ("cria dependência circular", js/iaedit.js), então o número
         seria de um estado que a pessoa nem alcança pelo caminho normal. */
      if (m.ciclo) {
        res.naoMedidos.push({ tipo: cand.tipo, noId: cand.noId, num: cand.num, nome: cand.nome, fechaLaco: true,
          porqueNaoMedido: "aplicada sozinha, esta alternativa fecha um laço de dependência: o motor desenha ignorando um elo e o prazo que sai não é de ninguém. O produto também a recusaria (\"cria dependência circular\"). Só faz sentido junto com as companheiras — veja `CronoSeq.sugerir().ligacoes[].dependeDe`." });
        return;
      }
      var dc = diffCritico(base.criticos, m.criticos, nomePorId);
      var o = {
        id: cand.tipo + ":" + cand.noId,
        tipo: cand.tipo, nivel: cand.nivel, noId: cand.noId, num: cand.num, nome: cand.nome, cat: cand.cat,
        de: cand.de, para: cand.para,
        medido: true, diasRecuperados: base.dias - m.dias, diasDepois: m.dias, fimDepois: m.fim,
        entraramNoCritico: dc.entraram, sairamDoCritico: dc.sairam,
        custo: cand.custo, exigeContratar: !!cand.exigeContratar,
        atendeSozinha: alvoDias == null ? null : ((base.dias - m.dias) >= alvoDias),
        porque: cand.porque, op: cand.op, muds: cand.muds, heuristica: false
      };
      if (o.diasRecuperados > 0) res.opcoes.push(o);
      else {
        o.porqueInerte = o.diasRecuperados === 0
          ? "medido: o término não mudou. " + cand.porqueInerte
          : "medido: esta mudança ALONGA o prazo em " + Math.abs(o.diasRecuperados) + " " + plural(Math.abs(o.diasRecuperados), "dia útil", "dias úteis") + ".";
        res.inertes.push(o);
      }
    }

    /* ---------- candidatos: só o CAMINHO CRÍTICO ----------
       ⚠ Comprimir fora do caminho crítico não recupera um dia sequer — é a
       primeira regra de crashing e fast tracking, e é o erro mais comum de
       quem replaneja no susto. Os não-críticos não entram nem como opção. */
    var criticos = D.lista.filter(function (n) {
      if (!n.critico) return false;
      if (n.marco) return false;
      if (!(num(n.duracao) > 0)) return false;
      /* etapa com subetapas no modo executivo: a duração dela É o vão das
         subetapas e `duracoes[etapaId]` é IGNORADO pelo motor. Propor aqui
         seria propor uma mudança que não muda nada. */
      if (n.tipo === "etapa" && redeLigada && D.lista.some(function (x) { return x.tipo !== "etapa" && x.etapaId === n.id; })) {
        res.pendentes.push({ noId: n.id, num: n.numero, nome: n.nome,
          porque: "etapa com subetapas no modo executivo: a duração dela é o vão das subetapas e o campo de duração da etapa é ignorado pelo motor — comprima as subetapas dela" });
        return false;
      }
      if (realizado && num(realizado[n.id]) >= 100) {
        res.pendentes.push({ noId: n.id, num: n.numero, nome: n.nome,
          porque: "já concluída (100% no realizado) — comprimir o que já foi feito reescreve fato, não plano" });
        return false;
      }
      return true;
    });
    if (!criticos.length && !res.pendentes.length) {
      res.avisos.push("nenhuma tarefa crítica com duração para comprimir — o caminho crítico deste cronograma é só de marcos, ou a rede não tem nada preso a nada.");
    }

    criticos.forEach(function (n) {
      var ehFolha = n.tipo !== "etapa";
      var dur = Math.round(num(n.duracao)), ed = num(n.equipeDias);
      var emAndamento = realizado && num(realizado[n.id]) > 0;
      var rotulo = n.numero + " " + corta(n.nome, 40);

      /* ---- A) MAIS FRENTES (crashing) — só onde o motor deriva a duração
         da produtividade. Com duração DIGITADA, `sub.duracoes` manda sobre
         `sub.equipes` (js/cronograma.js `_preparar`) e mexer em equipes é
         mudança que não muda nada. */
      if (ehFolha && ed > 0) {
        var eqAtual = Math.max(1, Math.round(num(n.equipes) || 1));
        var digitada = n.fonte === "usuario" || n.fonte === "ia" || n.fonte === "exec" || n.duracaoDigitada != null;
        if (digitada) {
          res.pendentes.push({ noId: n.id, num: n.numero, nome: n.nome,
            porque: "a duração desta subetapa está DIGITADA (" + dur + " dias): o motor dá precedência a ela sobre o número de frentes, então aumentar frentes aqui não muda a data. O que muda é a duração." });
        } else {
          var durAlvo = alvoDias != null ? Math.max(1, dur - alvoDias) : Math.max(1, Math.ceil(dur / 2));
          var eqPrec = frentesPara(ed, durAlvo) || (eqAtual + 1);
          var eqNovo = Math.min(TETOS.equipesMax, Math.max(eqAtual + 1, Math.min(eqPrec, eqAtual * TETOS.fatorEquipesMax)));
          if (eqNovo > eqAtual) {
            registrar({
              tipo: "equipes", nivel: "folha", noId: n.id, num: n.numero, nome: n.nome, cat: n.categoria,
              de: eqAtual, para: eqNovo,
              muds: [{ tipo: "equipes", nivel: "folha", id: n.id, para: eqNovo }],
              custo: { frentesAntes: eqAtual, frentesDepois: eqNovo, frentesAMais: eqNovo - eqAtual,
                porque: "⚠ FRENTES, não pessoas: o motor conta equipe-dia e divide pelo número de frentes (js/cronograma.js). Quantas pessoas cada frente tem, o sistema não sabe." },
              exigeContratar: true,
              porque: "mais frentes na mesma tarefa (crashing): o motor recalcula a duração como equipe-dias ÷ frentes" +
                (emAndamento ? " — ⚠ esta subetapa já começou, e frente nova não rende desde o dia 0" : ""),
              porqueInerte: "aumentar frentes não mexeu no término — ou a duração desta subetapa não vem da produtividade, ou o caminho crítico passa por outro lugar.",
              op: { op: "definir_equipes", folhaId: n.id, n: eqNovo,
                motivo: corta("mais frentes em " + rotulo + " para recuperar prazo no caminho crítico", TETOS.motivo) }
            });
          }
        }
      }

      /* ---- B) COMPRIMIR A DURAÇÃO ---- */
      var piso = Math.max(TETOS.diasMin, Math.ceil(dur * (1 - TETOS.compressaoMax)));
      var novo = alvoDias != null ? Math.max(piso, dur - alvoDias) : piso;
      if (novo < dur && novo >= TETOS.diasMin && novo <= TETOS.diasMax) {
        var fA = frentesPara(ed, dur), fB = frentesPara(ed, novo);
        registrar({
          tipo: "duracao", nivel: ehFolha ? "folha" : "etapa", noId: n.id, num: n.numero, nome: n.nome, cat: n.categoria,
          de: dur, para: novo,
          muds: [{ tipo: "duracao", nivel: ehFolha ? "folha" : "etapa", id: n.id, para: novo }],
          custo: { frentesAntes: fA, frentesDepois: fB, frentesAMais: (fA != null && fB != null) ? (fB - fA) : null,
            porque: fA == null
              ? "esta tarefa não tem equipe-dias calculado (serviço sem quantidade ou sem base) — o custo em frentes não pôde ser derivado, e não foi estimado"
              : "frentes implícitas pela fórmula do próprio motor (equipe-dias ÷ duração, arredondando para cima). ⚠ FRENTES, não pessoas." },
          exigeContratar: !!(fA != null && fB != null && fB > fA),
          porque: "comprimir a duração de " + dur + " para " + novo + " " + plural(novo, "dia útil", "dias úteis") +
            " (teto de compressão: metade da duração — abaixo disso não é ajuste, é outro plano)" +
            (emAndamento ? " — ⚠ esta tarefa já começou; a compressão vale sobre o que falta, e isso o sistema não sabe calcular" : ""),
          porqueInerte: "comprimir esta tarefa não mexeu no término — o caminho crítico passa por outro lugar, ou uma restrição de data segura a rede depois dela.",
          op: { op: "definir_duracao", alvoId: n.id, dias: novo,
            motivo: corta("comprimir " + rotulo + " de " + dur + " para " + novo + " dias (caminho crítico)", TETOS.motivo) }
        });
      }
    });

    /* ---------- C) LIGAR PARALELISMO (fast tracking) ----------
       Vem do CronoSeq, que é HEURÍSTICA rotulada: a matriz de precedência de
       obra diz quais frentes hoje esperam sem precisar. O que NÃO é
       heurística é o efeito — cada ligação é aplicada sozinha numa cópia e o
       prazo é medido pelo motor. */
    var S = SEQ();
    if (S && typeof S.sugerir === "function") {
      var sug = null;
      /* ⚠ `medir: false` DE PROPÓSITO: o CronoSeq mediria cada elo por conta
         dele, e eu mediria de novo — dois recálculos por elo, e dois números
         que podem divergir na tela. Aqui eu só quero a TABELA (quem depende de
         quem, e por quê); a medição é minha, contra a MESMA linha de partida
         das outras alternativas. */
      try { sug = S.sugerir(orc, R, { medir: false }); } catch (e) { sug = null; }
      if (sug && sug.ok) {
        res.fontes.push("CronoSeq.sugerir (matriz — heurística)");
        var predsHoje = {};
        D.lista.forEach(function (n) { predsHoje[n.id] = arr(n.preds).slice(); });
        arr(sug.ligacoes).forEach(function (g) {
          var hoje = arr(predsHoje[g.alvoId]), novos = arr(g.preds);
          /* o que a matriz SOLTA: predecessora que hoje segura este nó e que a
             matriz não exige. Sem nenhuma solta e sem sobreposição nova, a
             ligação só reordena — não há prazo a ganhar, e medir custaria um
             recálculo para devolver zero. */
          var soltas = hoje.filter(function (p) { return novos.indexOf(p) < 0; });
          var sobre = false;
          chaves(g.lags).forEach(function (k) { if (num(g.lags[k]) < 0) sobre = true; });
          if (chaves(g.tipos).length) sobre = true;
          if (!soltas.length && !sobre) return;
          /* ⚠ TAREFA JÁ CONCLUÍDA NÃO RECEBE PROPOSTA — NEM AQUI.
             ROTEIRO DO DEFEITO (12/09/2026): a guarda do realizado existia
             SÓ no laço dos `criticos` (compressão e equipes) e não era
             repetida neste. Numa obra com `realizado[e] = 100` em TODAS as
             8 etapas, `replanejar` devolvia 8 `pendentes` corretas ("já
             concluída") E DUAS opções sobre nós 100% executados, com
             `medido: true`, op real `definir_dependencia` e um combinado de
             3 dias de recuperação. Religar a dependência do que já foi
             feito reescreve FATO, não plano — e o número ia para a tela de
             quem procura onde recuperar prazo. */
          if (realizado && num(realizado[g.alvoId]) >= 100) {
            res.pendentes.push({ noId: g.alvoId, num: g.alvoNum, nome: g.alvoNome,
              porque: "já concluída (100% no realizado) — religar a dependência do que já foi feito reescreve fato, não plano" });
            return;
          }
          var jaComecou = realizado && num(realizado[g.alvoId]) > 0;
          var porques = arr(g.elos).map(function (e) { return e.porque; }).filter(function (x) { return !!x; });
          registrar({
            tipo: "paralelismo", nivel: g.nivel, noId: g.alvoId, num: g.alvoNum, nome: g.alvoNome, cat: g.cat,
            de: hoje.map(function (p) { return numPorId[p] || "?"; }).join(",") || "-",
            para: arr(g.predsNum).join(",") || "-",
            muds: [{ tipo: "ligacao", nivel: g.nivel, id: g.alvoId, preds: novos.slice(), lags: g.lags || {}, tipos: g.tipos || {} }],
            custo: { frentesAntes: null, frentesDepois: null, frentesAMais: 0,
              porque: "não custa frente nova: é a mesma gente, com duas tarefas correndo juntas. O custo é de RISCO — retrabalho se a frente de trás mudar depois." },
            exigeContratar: false,
            /* ⚠ o QUE MUDOU vem antes do porquê: sem isso a linha saía "de 5
               para 5" quando a mudança era o elo virar início-início (a mesma
               predecessora, correndo junto), e a pessoa lia como mudança
               nenhuma. */
            porque: (soltas.length ? "deixa de esperar " + soltas.map(function (p) { return numPorId[p] || "?"; }).join(", ") : "") +
              (soltas.length && sobre ? " e " : "") +
              (sobre ? "passa a correr junto com a frente de trás (elo início-início, com a sobreposição que a matriz permite)" : "") +
              (jaComecou ? " — ⚠ esta frente já começou (" + brNum(num(realizado[g.alvoId]), 0) + "% no realizado); soltar a espera do que já está em andamento não recupera o passado" : "") +
              ". ⚠ HEURÍSTICA (matriz de sequência de obra, CronoSeq): " +
              corta(porques.length ? porques.join(" · ") : String(g.motivo || "a matriz não exige a espera que a ordem da planilha impôs"), 300),
            porqueInerte: "religar esta dependência não mexeu no término — a frente liberada não estava no caminho crítico.",
            op: copia(g.op)
          });
        });
      }
    }

    /* ---------- ordenação e combinação ---------- */
    res.opcoes.sort(function (a, b) {
      return (b.diasRecuperados - a.diasRecuperados) ||
        (num(a.custo && a.custo.frentesAMais) - num(b.custo && b.custo.frentesAMais)) ||
        String(a.num).localeCompare(String(b.num));
    });
    if (res.opcoes.length > TETOS.maxOpcoes) {
      /* ⚠ NÃO CORTO A LISTA: todas foram medidas, e esconder alternativa
         medida é esconder informação que custou um recálculo. O aviso é para
         a TELA cortar — com o número, para a pessoa saber que há mais. */
      res.avisos.push(res.opcoes.length + " alternativas com efeito medido — a tela deve mostrar as " +
        TETOS.maxOpcoes + " maiores e guardar o resto atrás de um \"ver todas\". Todas estão em `opcoes`, todas medidas.");
    }

    /* ⚠ A SOMA DOS GANHOS INDIVIDUAIS NÃO É O GANHO DO CONJUNTO. Duas
       compressões no MESMO caminho crítico não somam; e comprimir o crítico
       faz outro caminho virar crítico, que passa a mandar. Por isso a
       combinação é MEDIDA de novo, e os dois números vão para a tela. */
    /* ⚠ UMA ALTERNATIVA POR NÓ NA COMBINAÇÃO. "Mais frentes em 2.3" e
       "comprimir 2.3" são a MESMA alavanca escrita de dois jeitos: juntas, a
       duração digitada ganha da equipe (js/cronograma.js `_preparar`) e a
       combinação recuperaria menos que a soma por um motivo que não é o do
       recado — além de a tela mostrar duas linhas para uma única ação. */
    var usados = {}, topo = [];
    var quantasComb = num(opts.combinarTop) > 0 ? num(opts.combinarTop) : TETOS.combinarTop;
    res.opcoes.forEach(function (o) {
      if (topo.length >= quantasComb || own(usados, o.noId)) return;
      usados[o.noId] = 1; topo.push(o);
    });
    if (topo.length > 1 && res.medicoes < teto) {
      res.medicoes++;
      var muds = [];
      topo.forEach(function (o) { muds = muds.concat(o.muds); });
      var mc = medir(copiaCom(orc, muds));
      if (mc && mc.ciclo) {
        res.combinado = { medido: false, fechaLaco: true,
          porque: "as " + topo.length + " alternativas juntas fecham um laço de dependência — o motor desenharia ignorando um elo, e o prazo daí não é de ninguém" };
      } else if (mc) {
        var soma = 0;
        topo.forEach(function (o) { soma += o.diasRecuperados; });
        var dcc = diffCritico(base.criticos, mc.criticos, nomePorId);
        res.combinado = { medido: true, quantas: topo.length,
          quais: topo.map(function (o) { return { id: o.id, num: o.num, nome: o.nome, tipo: o.tipo }; }),
          diasRecuperados: base.dias - mc.dias, diasDepois: mc.dias, fimDepois: mc.fim,
          somaDosIndividuais: soma,
          entraramNoCritico: dcc.entraram, sairamDoCritico: dcc.sairam,
          atende: alvoDias == null ? null : ((base.dias - mc.dias) >= alvoDias),
          porque: (base.dias - mc.dias) === soma
            ? "medido: juntas recuperam " + (base.dias - mc.dias) + " " + plural(base.dias - mc.dias, "dia", "dias") +
              ", exatamente a soma dos ganhos individuais — neste cronograma elas não disputam a mesma folga"
            : "⚠ juntas elas recuperam " + (base.dias - mc.dias) + " " + plural(base.dias - mc.dias, "dia", "dias") +
              ", e não os " + soma + " da soma: comprimir o caminho crítico faz outro caminho virar crítico, e é ele que passa a mandar." };
      } else {
        res.combinado = { medido: false, porque: "o motor não devolveu prazo com as alternativas aplicadas juntas" };
      }
    } else if (topo.length <= 1) {
      res.combinado = { medido: false, porque: "menos de duas alternativas com efeito medido — não há o que combinar" };
    } else {
      res.combinado = { medido: false, porque: "acima do teto de " + teto + " medições nesta chamada" };
    }

    /* ⚠ UM NÓ, UMA LINHA EM `pendentes`. Os dois laços (compressão e
       paralelismo) podem descartar o MESMO nó pelo mesmo motivo de fundo, e
       a tela mostraria a etapa duas vezes dizendo quase a mesma coisa — o
       tipo de repetição que faz a pessoa parar de ler a lista. Os motivos
       diferentes são juntados numa linha só, na ordem em que apareceram. */
    (function () {
      var vistos = {}, out = [];
      res.pendentes.forEach(function (p) {
        if (own(vistos, p.noId)) {
          var a = vistos[p.noId];
          if (a.porque.indexOf(p.porque) < 0) a.porque += " · " + p.porque;
          return;
        }
        vistos[p.noId] = p; out.push(p);
      });
      res.pendentes = out;
    })();

    if (alvoDias != null) {
      /* ⚠ ZERO MEDIÇÃO NÃO É "O MELHOR MEDIDO FOI 0".
         ROTEIRO DO DEFEITO (12/09/2026): num cronograma só de marcos,
         `replanejar` devolvia `medicoes: 0`, `opcoes: 0`, `inertes: 0`,
         `naoMedidos: 0` — nada rodou no motor — e mesmo assim o aviso final
         dizia "o melhor que o motor mediu foi 0". É a promessa do cabeçalho
         deste arquivo ("número não medido não sai com cara de medido")
         quebrada na própria frase de fechamento. Os três casos agora são
         três frases diferentes. */
      var melhor = res.opcoes.length ? res.opcoes[0].diasRecuperados : 0;
      var comb = (res.combinado && res.combinado.medido) ? res.combinado.diasRecuperados : melhor;
      var alvoTxt = alvoDias + " " + plural(alvoDias, "dia útil", "dias úteis") + " de atraso";
      if (res.medicoes === 0) {
        res.avisos.push("⚠ NENHUMA alternativa chegou a ser medida nesta chamada (nada foi rodado no motor): não há como dizer quanto dos " +
          alvoTxt + " se recupera. Veja `pendentes` (" + res.pendentes.length + ") e `naoMedidos` (" + res.naoMedidos.length + ") para saber por quê.");
      } else if (!res.opcoes.length) {
        res.avisos.push("⚠ as " + res.medicoes + " " + plural(res.medicoes, "alternativa medida", "alternativas medidas") +
          " recuperaram ZERO dia (estão em `inertes`, cada uma com o número medido e o motivo) — nenhuma toca os " + alvoTxt + ".");
      } else if (comb < alvoDias) {
        res.avisos.push("⚠ NENHUMA combinação medida aqui recupera os " + alvoTxt +
          ": o melhor que o motor mediu foi " + comb + ". Recuperar o resto é decisão de escopo, de contrato ou de turno — não de replanejamento, e este módulo não vai fingir que é.");
      }
    }
    res.ok = true;
    return res;
  }

  /* =====================================================================
     3) NARRATIVA — os números do painel em 4 a 6 frases

     ⚠ ISTO NÃO É CHAMADA DE MODELO, E NÃO PODE VIRAR UMA. Um modelo escrevendo
     o parágrafo do diretor erra o número calado e ninguém confere; aqui cada
     número entra por um campo NOMEADO do painel e fica registrado em
     `origens`, para a suíte poder cobrar que nenhum número do texto tenha
     nascido dentro desta função.
     ===================================================================== */

  function Texto() {
    this.partes = [];
    this.origens = [];
  }
  /* n(): o ÚNICO caminho por onde número entra na frase. Registra o campo do
     painel de onde ele veio — é o que permite à suíte provar que nenhum
     número foi inventado aqui dentro. */
  /* ⚠ NÚMERO QUE NÃO DÁ PARA ESCREVER VIRA BURACO NA PROSA, e a
     autoconferência era CEGA para isso: ela pega o número que SOBRA no texto
     (sem origem) e nunca o que FALTA. Executado com um painel de valores não
     finitos: "executado % do orçamento até 10/09/2026", "o previsto para hoje
     era % e o feito é -12%", "o índice de desempenho de prazo está em (abaixo
     de um…)" — três frases furadas com `avisos: 0`. É o mesmo roteiro do
     "undefined" no rótulo do Gantt. Agora `n()` recusa: devolve o marcador
     `«?»`, registra em `vazios`, e `fecharNarrativa` sobe o aviso e conta o
     buraco. A frase que depende de um valor que não existe não pode ser
     escrita — e este objeto é o único caminho por onde número entra. */
  var MARCA_VAZIA = "«?»";
  Texto.prototype.n = function (valor, campo, casas, sufixo) {
    var s = typeof valor === "string" ? valor : brNum(valor, casas == null ? 1 : casas);
    if (s === "" || s == null) {
      this.vazios = this.vazios || [];
      this.vazios.push({ campo: campo, valor: valor === undefined ? "undefined" : String(valor) });
      this.origens.push({ campo: campo, valor: valor, texto: MARCA_VAZIA, vazio: true });
      return MARCA_VAZIA;
    }
    s = s + (sufixo || "");
    this.origens.push({ campo: campo, valor: valor, texto: s });
    return s;
  };
  /* dá para escrever este número? (a guarda ANTES de montar a frase) */
  function dizivel(v) { return v != null && typeof v !== "boolean" && isFinite(typeof v === "number" ? v : parseFloat(v)); }
  /* cita(): texto do PRÓPRIO painel entrando na frase (motivo, rótulo, nome da
     obra). ⚠ Precisa ser marcado como citação porque as duas conferências da
     saída medem o que EU escrevo, não o que o painel escreveu: "a projeção
     aparece assim que o executado começar" é o motivo do painel dizendo que
     NÃO há projeção, e sem a marca a palavra "projeção" era acusada de
     tendência sem dado — alarme falso que ensina a ignorar o alarme. */
  Texto.prototype.cita = function (s, campo) {
    s = String(s == null ? "" : s);
    this.origens.push({ campo: campo, valor: s, texto: s, citacao: true });
    return s;
  };
  Texto.prototype.frase = function (s) { this.partes.push(String(s).replace(/\s+/g, " ").trim()); return this; };

  function CronoIA_narrativa(painel, opts) {
    opts = opts || {};
    var res = { ok: false, frases: [], texto: "", origens: [], naoDaParaDizer: [], fontes: ["CronoPlan.painel"], heuristica: false };
    if (!painel || typeof painel !== "object") {
      res.erro = "sem painel — a narrativa é a leitura dos números do CronoPlan.painel, e não há de onde tirá-los";
      return res;
    }
    var T = new Texto();
    var K = painel.kpis || {}, curva = painel.curva || {};
    var nomeObra = corta((painel.obra && painel.obra.nome) || "", TETOS.nomeObra);
    /* nome que já começa com "obra" não ganha o prefixo — "Obra Obra Nova" */
    var quem = nomeObra ? (/^obra\b/i.test(nomeObra) ? T.cita(nomeObra, "obra.nome") : "Obra " + T.cita(nomeObra, "obra.nome")) : "";
    /* ⚠ O PISO DE 4 FRASES NÃO SE NEGOCIA POR `opts`. Com `maxFrases: 2` a
       fatia cortava em 2 e o preenchimento logo abaixo devolvia para 4 — dois
       números discordando no mesmo caminho. O contrato é 4 a 6; `opts` só
       escolhe dentro dessa faixa. */
    var maxF = Math.max(TETOS.frasesMin,
      Math.min(TETOS.frasesMax, num(opts.maxFrases) > 0 ? num(opts.maxFrases) : TETOS.frasesMax));

    /* --- estado ruim do painel: a narrativa diz o que falta, e o que fazer --- */
    if (painel.estado && painel.estado !== "ok") {
      T.frase((quem ? quem + ": o" : "O") + " acompanhamento não pôde ser montado.");
      T.frase("Motivo: " + (painel.erro ? T.cita(String(painel.erro), "painel.erro") : "o painel não disse qual."));
      T.frase("Enquanto isso não se resolve, nenhum número de avanço, prazo ou desempenho desta obra pode ser usado — nem para dentro, nem para o cliente.");
      T.frase("Não dá para dizer se a obra está adiantada ou atrasada.");
      res.naoDaParaDizer.push("tudo: o painel não foi montado (estado \"" + painel.estado + "\")");
      /* ⚠ o caminho do painel quebrado passa pela MESMA autoconferência. Ele
         escapava dela na primeira versão — e é justamente o caminho em que a
         frase é toda escrita à mão, sem número do painel para ancorar. */
      return fecharNarrativa(res, T, null, maxF);
    }

    var corte = painel.dataCorte ? dataBR(painel.dataCorte) : "";
    var exec = K.executadoOrcamento || {};
    var prev = K.previstoNaData || null;
    var idp = K.idp || null;
    var proj = curva.projecao || null;

    /* --- FRASE 1: onde a obra está ---
       ⚠ `!= null` NÃO BASTA: NaN e Infinity passam por ele, `brNum` devolve
       "" e a frase sai furada ("executado % do orçamento"). `dizivel()` é a
       guarda de todos os ramos daqui para baixo. */
    if (dizivel(exec.pct)) {
      T.frase((quem ? quem + ": " : "") + "executado " +
        T.n(exec.pct, "kpis.executadoOrcamento.pct", 1, "%") + " do orçamento" +
        (corte ? " até " + T.n(corte, "dataCorte") : "") + "." +
        (exec.base === "simples" ? " Esse número é média simples: menos de três quintos dos serviços têm valor para pesar." : ""));
    } else {
      T.frase((quem ? quem + ": " : "") +
        "nenhum serviço foi lançado em diário publicado, então não há executado para medir" + (corte ? " até " + T.n(corte, "dataCorte") : "") + ".");
      res.naoDaParaDizer.push("executado: sem diário publicado");
    }

    /* --- FRASE 2: previsto × realizado --- */
    if (prev && dizivel(prev.pct) && dizivel(prev.realPct)) {
      var dif = num(prev.realPct) - num(prev.pct);
      var comoEsta = K.situacao ? T.cita(String(K.situacao), "kpis.situacao") : "";
      T.frase("Contra " + (prev.fonte === "base" ? "a linha de base" : "o plano atual") + ", o previsto para hoje era " +
        T.n(prev.pct, "kpis.previstoNaData.pct", 1, "%") + " e o feito é " + T.n(prev.realPct, "kpis.previstoNaData.realPct", 1, "%") +
        " — " + (Math.abs(dif) < 0.05 ? "em cima do plano" : (dif < 0 ? T.n(Math.abs(dif), "kpis.previstoNaData (diferença)", 1) + " pontos percentuais abaixo" : T.n(Math.abs(dif), "kpis.previstoNaData (diferença)", 1) + " pontos percentuais acima")) +
        (comoEsta ? " (" + comoEsta + ")" : "") + ".");
      if (prev.fonte !== "base") {
        res.naoDaParaDizer.push("comparação contra plano congelado: não há linha de base — o plano atual muda a cada edição");
      }
    } else {
      T.frase("Não há previsto para a data" + (painel.base ? "" : " porque a linha de base não foi congelada") +
        ", então não dá para dizer se a obra está adiantada ou atrasada.");
      res.naoDaParaDizer.push("adiantada/atrasada: sem previsto na data");
    }

    /* --- FRASE 3: IDP --- */
    if (idp && dizivel(idp.valor)) {
      /* ⚠ "abaixo de um", por extenso: o "1" é a definição do índice, não um
         dado do painel — escrito em algarismo ele acusava "número sem origem"
         na autoconferência, e alarme falso ensina a ignorar o alarme. */
      T.frase("O índice de desempenho de prazo está em " + T.n(idp.valor, "kpis.idp.valor", 3) +
        " " + (Number(idp.valor) < 1 ? "(abaixo de um: entregou-se menos do que o plano previa para a data)" : (Number(idp.valor) > 1 ? "(acima de um: entregou-se mais do que o plano previa para a data)" : "(em um: entregue exatamente o previsto para a data)")) +
        (idp.rotulo ? ", " + T.cita(String(idp.rotulo), "kpis.idp.rotulo") : "") + ".");
    } else {
      var mIdp = (K.evm && K.evm.idpMotivo) ? String(K.evm.idpMotivo) : "sem linha de base congelada, o índice de desempenho de prazo não se calcula.";
      T.frase("Sem índice de desempenho de prazo: " + T.cita(mIdp, "kpis.evm.idpMotivo"));
      res.naoDaParaDizer.push("IDP: " + mIdp);
    }

    /* --- FRASE 4: término --- */
    if (dizivel(K.desvioTerminoDias) && painel.base) {
      var dv = Math.round(num(K.desvioTerminoDias));
      T.frase(dv === 0
        ? "O término do plano bate com o da linha de base."
        : "O término do plano está " + T.n(Math.abs(dv), "kpis.desvioTerminoDias", 0) + " " + plural(Math.abs(dv), "dia útil", "dias úteis") +
          " " + (dv > 0 ? "depois" : "antes") + " do da linha de base.");
    } else if (painel.termino && painel.termino.ref) {
      T.frase("O cadastro da obra termina em " + T.n(dataBR(painel.termino.obra), "termino.obra") +
        " e " + T.cita(String(painel.termino.fonte || "o plano"), "termino.fonte") + " termina em " + T.n(dataBR(painel.termino.ref), "termino.ref") +
        (painel.termino.diasUteis ? " (" + T.n(Math.abs(num(painel.termino.diasUteis)), "termino.diasUteis", 0) + " " + plural(Math.abs(num(painel.termino.diasUteis)), "dia útil", "dias úteis") + " de diferença)" : "") + ".");
    } else {
      T.frase("Não há linha de base para comparar o término, então o desvio de prazo em dias não existe nesta tela.");
      res.naoDaParaDizer.push("desvio de término: sem linha de base");
    }

    /* --- FRASE 5: ritmo/projeção — a que mais tenta mentir ---
       ⚠ SÓ COM PROJEÇÃO MEDIDA. `curva.projecao` só nasce com ritmo apurado em
       diários publicados (js/cronoplan.js `projetarCurva`: mínimo de semanas de
       histórico, avanço recente, término dentro da escala). Sem ela, a frase é
       "ainda não dá para dizer" com o motivo do próprio painel — e a suíte
       cobra que nenhuma palavra de tendência apareça. */
    /* ⚠ O RITMO DA FRASE É O QUE ENTROU NA CONTA DA DATA, E ESCRITO DE UM
       JEITO QUE NÃO SE DESMINTA AO LADO DELA. `curva.projecao.ritmoSemanal` é
       o número de TELA do `Fisico.previsao` (arredondado em 2 casas): numa
       obra que anda 0,004 ponto por semana ele vale 0, e esta frase — a que
       vai ao diretor — saía "Pelo ritmo medido nos diários, 0% por semana …
       a conclusão cai em 22/03/2027". Ritmo zero não conclui obra nenhuma;
       número que se contradiz na própria linha é pior que número nenhum, e
       quem lê passa a duvidar também do resto do parágrafo.
       MEDIDO com a série real 99,888 / 99,892 / 99,896 % (a mesma do bloco 2b
       do test-crono-evm): ritmoSemanal 0, ritmoUsado 0,004, dataProvavel
       22/03/2027 — as três telas do painel escreviam "0% por semana".
       O `CronoPlan.projetarCurva` publica `ritmoTexto`, a escrita honesta do
       ritmo que ELE usou ("menos de 0,01" quando o arredondado zera). A regra
       mora lá e só lá: formatar de novo aqui seria a segunda cópia que
       envelhece sozinha (memória "réplica de parser apodrece"). Painel antigo
       ou montado à mão, sem o campo, continua caindo no número de tela — é
       fallback, não silêncio. */
    var ritmoTx = (proj && typeof proj.ritmoTexto === "string" && proj.ritmoTexto) ? proj.ritmoTexto : "";
    if (proj && (ritmoTx || dizivel(proj.ritmoSemanal)) && dizivel(proj.semanasHistorico) && proj.dataProvavel) {
      T.frase("Pelo ritmo medido nos diários, " +
        (ritmoTx ? T.n(ritmoTx, "curva.projecao.ritmoTexto", 0, "%") : T.n(proj.ritmoSemanal, "curva.projecao.ritmoSemanal", 2, "%")) +
        " por semana em " + T.n(proj.semanasHistorico, "curva.projecao.semanasHistorico", 0) + " " +
        plural(num(proj.semanasHistorico), "semana", "semanas") + " de histórico, a conclusão cai em " +
        T.n(dataBR(proj.dataProvavel), "curva.projecao.dataProvavel") + ".");
    } else {
      var mp = curva.projecaoMotivo ? String(curva.projecaoMotivo) : "sem ritmo medido nos diários.";
      T.frase("Ainda não dá para dizer para onde a obra caminha: " + T.cita(mp, "curva.projecaoMotivo"));
      res.naoDaParaDizer.push("ritmo/conclusão: " + mp);
    }

    /* --- FRASE 6: o que puxa --- */
    var at = arr(painel.atencao);
    if (at.length && at[0] && dizivel(at[0].desvioPP) && dizivel(at[0].realPct) && dizivel(at[0].previstoPct)) {
      var a0 = at[0];
      /* ⚠ `painel.atencao` É UMA LISTA JÁ CORTADA EM 5 (js/cronoplan.js,
         `out.atencao … .slice(0, 5)`). Contar por ela dava um teto de "mais
         4 frentes na mesma situação" — numa obra com 30 frentes atrasadas o
         parágrafo que vai ao diretor dizia 4, e o leitor concluía 5 no
         total. O número passava pela autoconferência porque ELE TINHA
         origem: a régua confere a PROCEDÊNCIA do número, não o significado
         dele. O total vem de `painel.nos`, que é a lista inteira; sem ela, a
         frase diz o escopo em vez de inventar um total. */
      var totalAtrasadas = null;
      if (Array.isArray(painel.nos)) {
        /* ⚠ O MESMO FILTRO do js/cronoplan.js antes do `.slice(0, 5)`:
           folha + desvio medido + situação "atrasada"/"atrasada (não
           iniciada)". Dois filtros diferentes para a mesma pergunta dariam
           dois totais na mesma tela. */
        totalAtrasadas = painel.nos.filter(function (n) {
          return n && n.folha && n.desvioPP != null && /^atrasada/.test(String(n.situacao || ""));
        }).length;
        if (totalAtrasadas < at.length) totalAtrasadas = at.length;   // a lista curta é piso, nunca teto
      }
      var cauda = "";
      if (totalAtrasadas != null && totalAtrasadas > 1) {
        cauda = ", e há mais " + T.n(totalAtrasadas - 1, "nos (frentes atrasadas, lista inteira)", 0) + " " +
          plural(totalAtrasadas - 1, "frente na mesma situação", "frentes na mesma situação");
      } else if (totalAtrasadas == null && at.length > 1) {
        cauda = ", e há mais " + T.n(at.length - 1, "atencao (quantidade — lista curta do painel)", 0) + " " +
          plural(at.length - 1, "frente", "frentes") + " nesta lista (o painel manda só as primeiras; o total da obra não veio)";
        res.naoDaParaDizer.push("quantas frentes atrasadas ao todo: o painel não mandou `nos`, e `atencao` vem cortada em 5");
      }
      T.frase("O maior atraso está em " + T.n(String(a0.numero || ""), "atencao[0].numero") + " " + T.cita(corta(a0.nome, 50), "atencao[0].nome") +
        ": " + T.n(a0.realPct, "atencao[0].realPct", 1, "%") + " feito contra " + T.n(a0.previstoPct, "atencao[0].previstoPct", 1, "%") +
        " previstos" + cauda + ".");
    } else if (dizivel(exec.pct)) {
      T.frase("Nenhuma frente aparece como atrasada na comparação por nó.");
    }

    return fecharNarrativa(res, T, proj, maxF);
  }

  /* ⚠ AUTOCONFERÊNCIA, na saída, para TODOS os caminhos: nenhum número do
     texto pode ter nascido aqui dentro, e nenhuma palavra de tendência pode
     aparecer sem projeção medida. Se algo escapar, sai em `avisos` — nunca
     calado. */
  function fecharNarrativa(res, T, proj, maxF) {
    var frases = T.partes.slice(0, maxF);
    while (frases.length < TETOS.frasesMin && frases.length < T.partes.length) frases.push(T.partes[frases.length]);
    res.frases = frases;
    res.origens = T.origens;
    res.texto = frases.join(" ");
    res.avisos = [];
    var cf = conferirNumeros(res.texto, T.origens);
    if (!cf.ok) res.avisos.push("⚠ número sem origem no painel: " + cf.estranhos.join(", ") + " — isto é defeito deste módulo, não do painel.");
    /* ⚠ A OUTRA METADE DA CONFERÊNCIA: número que SUMIU.
       `conferirNumeros` mede o que sobra no texto; era cega para o que
       falta. Um valor não finito no painel fazia `brNum` devolver "" e a
       frase saía com um buraco ("executado % do orçamento"), com
       `avisos: 0`. Agora o buraco vira marcador, é contado, e a frase
       furada é RETIRADA — melhor 4 frases certas que 6 com furo. */
    var vazios = arr(T.vazios);
    res.vazios = vazios;
    if (vazios.length) {
      var furadas = res.frases.filter(function (f) { return f.indexOf(MARCA_VAZIA) > -1; });
      res.frases = res.frases.filter(function (f) { return f.indexOf(MARCA_VAZIA) < 0; });
      res.texto = res.frases.join(" ");
      res.naoDaParaDizer = arr(res.naoDaParaDizer).concat(vazios.map(function (v) {
        return "campo sem valor representável no painel (" + v.campo + " = " + v.valor + ") — a frase que dependia dele não foi escrita";
      }));
      res.avisos.push("⚠ " + vazios.length + " " + plural(vazios.length, "campo do painel não tinha valor representável", "campos do painel não tinham valor representável") +
        " (" + vazios.map(function (v) { return v.campo; }).join(", ") + "): " + furadas.length + " " +
        plural(furadas.length, "frase foi retirada", "frases foram retiradas") + " em vez de sair com buraco.");
    }
    /* e a rede de segurança do buraco que escapar por outro caminho */
    if (/\s\s|\bem\s+semanas\b|está em \(|executado % |era % /.test(" " + res.texto + " ")) {
      res.avisos.push("⚠ o texto tem buraco onde deveria haver número — isto é defeito deste módulo.");
    }
    /* ⚠ As duas conferências de PALAVRA medem só o que ESTE módulo escreveu:
       as citações do painel (motivos, rótulos, nomes) saem antes. Sem isso, o
       motivo do painel que diz "a projeção aparece assim que o executado
       começar" — que é exatamente a frase que NEGA a tendência — era acusado
       de afirmar tendência. */
    var proprio = res.texto;
    arr(T.origens).forEach(function (o) { if (o.citacao && o.texto) proprio = proprio.split(o.texto).join(" "); });
    proprio = proprio.toLowerCase();
    res.proprio = proprio;
    var achouAdj = [];
    ADJETIVOS_VETADOS.forEach(function (w) { if (proprio.indexOf(w) > -1) achouAdj.push(w); });
    if (achouAdj.length) res.avisos.push("⚠ adjetivo sem conta no texto: " + achouAdj.join(", "));
    if (!proj) {
      var achouT = [];
      TENDENCIA_VETADA.forEach(function (w) { if (proprio.indexOf(w) > -1) achouT.push(w); });
      if (achouT.length) res.avisos.push("⚠ palavra de tendência sem projeção medida: " + achouT.join(", "));
    }
    res.ok = true;
    return res;
  }

  /* números do texto, na mesma régua do "número novo" do js/iaedit.js:
     sequência de dígitos com separador decimal/milhar. */
  function numerosDoTexto(s) {
    return String(s == null ? "" : s).match(/\d+(?:[.,]\d+)*/g) || [];
  }
  function conferirNumeros(texto, origens) {
    var permitidos = {};
    arr(origens).forEach(function (o) {
      numerosDoTexto(o.texto).forEach(function (x) { permitidos[x] = (permitidos[x] || 0) + 1; });
    });
    var estranhos = [];
    numerosDoTexto(texto).forEach(function (x) {
      if (permitidos[x] > 0) permitidos[x]--;
      else if (estranhos.indexOf(x) < 0) estranhos.push(x);
    });
    return { ok: estranhos.length === 0, estranhos: estranhos };
  }

  var CronoIA = {
    VERSAO: "1.0",
    TETOS: TETOS,
    LEGENDA: LEGENDA,
    ADJETIVOS_VETADOS: ADJETIVOS_VETADOS,
    TENDENCIA_VETADA: TENDENCIA_VETADA,
    OPS_PROPOSTAS: OPS_PROPOSTAS,

    contexto: CronoIA_contexto,
    replanejar: CronoIA_replanejar,
    narrativa: CronoIA_narrativa,

    _numeros: numerosDoTexto,
    _conferirNumeros: conferirNumeros,
    _copiaCom: copiaCom
  };

  /* =================================================================
     DECISÕES QUE ESTE ARQUIVO TOMOU (e o que as sustenta)

     1) `replanejar` recebe o ORÇAMENTO, não o `r`. A espec pedia
        `replanejar(r, atraso, opc)`, mas o efeito MEDIDO exige rodar
        `Cronograma.estimar` de novo, e ele precisa do orçamento. O 2º
        argumento aceita as duas formas para não quebrar quem seguir a espec
        ao pé da letra.
     2) Só o CAMINHO CRÍTICO vira candidato. Comprimir fora dele não recupera
        um dia — e uma lista com 40 alternativas inúteis faz a pessoa marcar
        qualquer uma.
     3) Alternativa com efeito medido ZERO (ou negativo) NÃO entra em
        `opcoes`: vai para `inertes` com o número medido e o motivo. Foi assim
        que o modo executivo desligado apareceu — comprimir subetapa com a
        rede desligada não muda o término, porque a folha é desenhada dentro
        da janela da etapa.
     4) `definir_equipes` só é proposta onde a duração NÃO está digitada: o
        motor dá precedência a `sub.duracoes` sobre `sub.equipes`, então a op
        seria mudança que não muda nada. Onde está digitada, sai em
        `pendentes` com o motivo — a pessoa precisa saber por que não há a
        opção que ela esperava.
     5) Etapa com subetapas no modo executivo não recebe proposta de duração:
        o campo é ignorado pelo motor (a duração dela é o vão). Sai em
        `pendentes` apontando para as subetapas.
     6) A combinação é MEDIDA de novo, e os dois números (soma dos
        individuais × medido junto) vão para a tela. Somar ganhos de
        compressões no mesmo caminho crítico é o erro clássico, e ele produz
        uma promessa de prazo que não se cumpre.
     7) O contexto NÃO leva data absoluta, só índice de dia útil — e diz isso
        em linha própria no cabeçalho. Data vinda de um modelo que não sabe o
        dia de hoje é o defeito que o catálogo do js/iaedit.js já barrou em
        `definir_parametro`.
     8) O contexto NÃO leva peso em pontos percentuais por padrão. É a
        primeira informação derivada de valor que atravessaria para um
        provedor externo, e a decisão é do Rogério. Sem ela, o texto AVISA que
        a priorização sai por duração e folga.
     9) Contexto que não cabe RECUSA em vez de cortar. Meia rede faz o modelo
        propor um plano para uma obra que ele não viu inteira, e o diff parece
        completo — a resposta é a mesma do js/iaedit.js: "escolha as etapas",
        com o número para conferir.
    10) A narrativa é montada por REGRA e cada número entra por `Texto.n`,
        que registra o campo de origem. É o que permite à suíte provar que
        nenhum número nasceu dentro desta função.
    11) TAREFA 100% CONCLUÍDA NÃO RECEBE PROPOSTA — nos DOIS laços
        (12/09/2026). A guarda do realizado existia só no laço dos
        `criticos`; o do paralelismo não a repetia, e uma obra inteiramente
        executada recebia duas opções medidas e 3 dias de "recuperação".
        Religar a dependência do que já foi feito reescreve fato, não plano.
    12) NÚMERO NÃO REPRESENTÁVEL NÃO VIRA FRASE (12/09/2026). `brNum`
        devolve "" para valor não finito e a autoconferência só pegava número
        que SOBRA — era cega para o que falta. `Texto.n` agora recusa,
        registra em `vazios`, e a frase furada é RETIRADA: melhor 4 frases
        certas que 6 com buraco. E o sentido não inverte mais em silêncio —
        `num(NaN)` dava 0, e 0 < 1 fazia um IDP não finito ser descrito como
        "abaixo de um".
    13) A CONTAGEM DE FRENTES ATRASADAS vem de `painel.nos`, não de
        `painel.atencao` (12/09/2026): o CronoPlan já corta essa lista em 5, e
        o teto da frase era "mais 4". A autoconferência não pegava, porque ela
        confere a PROCEDÊNCIA do número, não o significado dele.
    14) MONTAR CONTEXTO NÃO PAGA O TESTE DO CAMINHO CRÍTICO (12/09/2026).
        Medido: 98% do custo de `contexto` era ele. O texto DIZ que a nota
        saiu sem ele; `extras.criticoTeste = true` religa.
     ================================================================= */

  global.CronoIA = CronoIA;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoIA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

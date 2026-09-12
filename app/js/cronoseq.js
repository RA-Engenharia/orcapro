/* =====================================================================
 * cronoseq.js — MATRIZ DE PRECEDÊNCIA DE OBRA (motor puro, heurística
 * rotulada). Espec "cronograma pro", 12/09/2026.
 *
 * O PROBLEMA. Hoje o cronograma nasce em FILA: sem "Depende de" escrito,
 * cada etapa depende da ANTERIOR da lista (js/cronograma.js, `estimar`:
 * `else if (i > 0) out.push(etapas[i - 1].id)`) e ganha uma sobreposição
 * ÚNICA de 15% (`paralelismo`, js/cronograma.js DEFAULTS) aplicada a tudo,
 * igual para fundação e para limpeza. Obra não é fila: fundação e montagem
 * de canteiro andam juntas; a instalação embutida entra DENTRO da alvenaria;
 * esquadria espera o contrapiso e não espera a pintura. O prazo que sai
 * dessa fila é o que vai impresso na proposta como promessa ao cliente.
 *
 * O QUE ESTE MÓDULO É — E O QUE ELE NÃO É
 *   É     uma TABELA de precedência entre as 14 categorias que o
 *         `Cronograma.classificar` já reconhece, com o MOTIVO CONSTRUTIVO de
 *         cada linha escrito por extenso, mais a aplicação dessa tabela a um
 *         orçamento real.
 *   NÃO É fonte de duração, de produtividade nem de data. Nenhuma linha
 *         daqui inventa dia: a sobreposição sai de uma PROPORÇÃO da duração
 *         que o motor calculou, e a economia de dias é MEDIDA rodando
 *         `Cronograma.estimar` com e sem a sugestão. Sem o motor carregado,
 *         `economia.medido` sai `false` com o porquê — nunca um número
 *         estimado no lugar do medido.
 *   NÃO GRAVA nada. Devolve ops `definir_dependencia` no formato do catálogo
 *         de js/iaedit.js; quem confere e grava é ele, pela porta de sempre
 *         (a IA propõe → o motor valida → o diff com checkbox → a pessoa
 *         marca → aplicar → desfazer).
 *
 * ⚠ TUDO AQUI É HEURÍSTICA, E SAI ROTULADO. Cada elo leva `heuristica:
 *   true`, o `porque` em português de obra e `conf` — que é um peso
 *   EDITORIAL escrito à mão (0,95 = não vi obra em que fosse diferente;
 *   0,70 = a categoria cobre dois momentos diferentes da obra). `conf` NÃO
 *   é estatística e não saiu de medição nenhuma; ele existe só para ordenar
 *   as sugestões na tela. A confiança de uma sugestão é `conf × pureza`, e a
 *   PUREZA é MEDIDA no orçamento (quanto do nó é mesmo da categoria que o
 *   rotulou) — as duas metades saem separadas no retorno, de propósito, para
 *   ninguém confundir o palpite com a medição.
 *
 * ⚠ A SUGESTÃO PODE AUMENTAR O PRAZO, E ISSO NÃO É DEFEITO. A fila de hoje
 *   sobrepõe 15% de TUDO, inclusive onde a obra não permite (não se reveste
 *   parede antes de a instalação embutida ser testada). Quando a matriz diz
 *   "não sobrepõe", ela grava lag 0, que SUBSTITUI a sobreposição automática
 *   naquele elo (js/cronograma.js, `desloc`) — e o prazo honesto pode ficar
 *   maior que o prazo otimista. Por isso `economia.dias` pode ser negativo e
 *   o retorno diz, com número, quanto aumentou.
 *
 * ⚠ "outros" NÃO ENTRA. 20,9% das etapas dos 55 orçamentos reais dos 34 backups (49 de 235,
 *   medido nos backups) caem em "outros" — forro de gesso, ar-condicionado,
 *   elevador, estrutura metálica, sondagem, projeto. A matriz não fala delas
 *   e este módulo NÃO propõe elo nenhum para elas: elas saem em `pendentes`
 *   com o motivo, e o cronograma delas continua o de hoje. Inventar
 *   precedência para "outros" seria inventar sequência de obra.
 *
 * API (global.CronoSeq, também module.exports)
 *   matriz()             → a tabela inteira: 14 categorias, os elos diretos
 *                          com tipo/lag/porque e os 196 pares ordenados
 *                          (direto ou herdado, com o caminho).
 *   sugerir(orc, r, o)   → as ligações sugeridas para um orçamento real, em
 *                          op `definir_dependencia` E em token do "Depende
 *                          de" ("3+2", "2.3II+5"), com confiança e motivo;
 *                          mais os PARALELISMOS possíveis com a economia de
 *                          dias MEDIDA pelo motor (com e sem).
 *                          ⚠ `ligacoes` e `ops` saem em ORDEM TOPOLÓGICA da
 *                          rede proposta — predecessor antes do sucessor —,
 *                          e essa é a ordem em que têm de ser APLICADAS: o
 *                          `IAEdit.aplicar` aplica op a op e recusa a que
 *                          fecha laço no meio do caminho. Cada ligação traz
 *                          `dependeDe` (índices das companheiras que vêm
 *                          antes) e `sozinha` (se ela, aplicada isolada,
 *                          fecha laço — e nesse caso NÃO traz dias).
 *   conferir(orc, r)     → o que um cronograma JÁ MONTADO contraria na
 *                          matriz, com gravidade e os dias medidos.
 *   aplicarEmCopia(orc, ligacoes) → o orçamento com as ligações escritas,
 *                          numa CÓPIA (é o que a medição usa; gravar é do
 *                          js/iaedit.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function copia(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function chaves(o) { return (o && typeof o === "object") ? Object.keys(o) : []; }
  function C() { return global.Cronograma; }
  function mapaDe(o, k) { if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {}; return o[k]; }
  function cortar(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* ⚠ `NOME[]` NÃO COBRE "outros" — e 20,9% das etapas reais caem nele.
     Escrever `NOME[cat]` com categoria vinda de DADO produzia a palavra
     `undefined` dentro de uma frase que a pessoa lê ("undefined e Pintura não
     têm precedência entre si na matriz"). É o mesmo roteiro do "undefined" no
     rótulo do Gantt: 160 asserts verdes e a palavra na tela. Categoria vinda
     da TABELA pode usar NOME direto (a chave existe por construção);
     categoria vinda de nó passa por aqui. */
  function nomeCat(c, fallback) {
    if (c && own(NOME, c)) return NOME[c];
    if (fallback) return cortar(fallback, 40);
    return "Outros";
  }
  /* a matriz CONHECE esta categoria? "outros" e categoria em branco não estão
     na tabela — e "a tabela não fala dela" NÃO é a mesma coisa que "a tabela
     diz que as duas podem andar juntas". */
  function conhecida(c) { return !!(c && c !== "outros" && own(NOME, c)); }

  /* ⚠ RÉPLICA DECLARADA dos tetos de js/iaedit.js (TETOS.lagMax,
     TETOS.predsMax, TETOS.motivo). O módulo é PURO e roda em Node sem o
     IAEdit carregado; se ele propusesse um lag de 300 dias, a op viajaria
     até o validador para ser recusada lá, e a pessoa veria "dependências
     demais" sem entender de onde veio. Mudou lá, muda aqui —
     tools/test-cronoseq.js compara os dois quando o IAEdit está presente. */
  var TETOS = { lag: 120, preds: 20, motivo: 200 };

  /* As 14 categorias, na ORDEM de Cronograma.CATS. ⚠ Lista repetida de
     propósito: este motor precisa responder `matriz()` sem o cronograma
     carregado (é a tabela, não a aplicação dela). A paridade com
     `Cronograma.CATS` é cobrada em tools/test-cronoseq.js — categoria nova
     lá sem linha aqui reprova a suíte, senão a matriz calaria sobre ela. */
  var CATS = ["preliminares", "demolicao", "terraplenagem", "fundacao", "estrutura", "alvenaria",
    "cobertura", "impermeabilizacao", "instalacoes", "revestimento", "esquadrias", "loucas", "pintura", "limpeza"];
  var NOME = {
    preliminares: "Preliminares/Canteiro", demolicao: "Demolição/Remoção",
    terraplenagem: "Movimento de terra", fundacao: "Fundação", estrutura: "Estrutura/Concreto",
    alvenaria: "Alvenaria", cobertura: "Cobertura", impermeabilizacao: "Impermeabilização",
    instalacoes: "Instalações", revestimento: "Revestimentos", esquadrias: "Esquadrias",
    loucas: "Louças/Metais", pintura: "Pintura", limpeza: "Limpeza final"
  };

  /* A espera que NÃO sai do orçamento: cura de concreto, desforma, secagem.
     ⚠ O número é do PROJETO e do fabricante, não daqui — 14 dias de desforma
     de laje não são uma proporção da duração da estrutura, e fingir que são
     colocaria um número inventado dentro da data de entrega. O elo sai com
     lag 0 (não sobrepõe, que é o mínimo verdadeiro) e a pendência escrita. */
  var ESPERA = "a espera técnica (cura/secagem) não sai do orçamento: informe os dias no \"Depende de\" (ex.: 5+14), pelo projeto";

  /* =====================================================================
     OS ELOS DIRETOS. Cada linha é conhecimento de construção com o motivo
     escrito; nenhuma é medição nem norma citada.
       tipo   "TI" término-início · "II" início-início (a frente entra
              DENTRO da anterior)
       lag    0    = não sobrepõe (a razão física proíbe); grava lag 0, que
                     substitui a sobreposição automática naquele elo
              null = pode sobrepor; vale o `paralelismo` da obra (o de hoje)
       lagPct só em elo II: a fração da duração do predecessor que tem de
              passar antes de a frente entrar. Vira DIA no `sugerir`,
              multiplicando pela duração que o MOTOR calculou.
       conf   peso editorial (ver o cabeçalho): NÃO é estatística.
       ambigua a categoria cobre dois momentos diferentes da obra — o elo
              vale, mas a pessoa tem de olhar.
     ===================================================================== */
  var ELOS_ESCRITOS = [
    { de: "preliminares", para: "demolicao", tipo: "II", lagPct: 0.30, conf: 0.85,
      porque: "demolir exige a área isolada e o tapume de pé — proteção de passeio e de vizinho é condição de licença; o resto do canteiro se monta com a demolição andando" },
    { de: "preliminares", para: "terraplenagem", tipo: "II", lagPct: 0.30, conf: 0.85,
      porque: "a máquina de terra só entra com acesso, tapume e ligação provisória de água e energia prontos; barracão e almoxarifado continuam sendo montados ao lado" },
    { de: "preliminares", para: "fundacao", tipo: "II", lagPct: 0.50, conf: 0.90,
      porque: "locação e gabarito são serviço preliminar e têm de estar prontos para a primeira escavação; barracão e almoxarifado seguem sendo montados — as duas frentes andam JUNTAS, não em fila" },
    { de: "demolicao", para: "terraplenagem", tipo: "TI", lag: 0, conf: 0.90,
      porque: "não se corta nem se aterra com estrutura velha em pé: o entulho sai antes, senão vira aterro com material impróprio" },
    { de: "demolicao", para: "fundacao", tipo: "TI", lag: 0, conf: 0.85,
      porque: "fundação nova no lugar da antiga: sapata velha, piso e entulho saem antes da escavação" },
    { de: "terraplenagem", para: "fundacao", tipo: "TI", lag: 0, conf: 0.95,
      porque: "a cota de projeto tem de estar atingida e o solo compactado antes de escavar sapata ou cravar estaca — fundação assentada em aterro solto recalca" },
    { de: "fundacao", para: "estrutura", tipo: "TI", lag: 0, conf: 0.95, espera: ESPERA,
      porque: "o pilar arranca da fundação: bloco, sapata e baldrame concretados e curados antes de subir a estrutura" },
    { de: "fundacao", para: "impermeabilizacao", tipo: "TI", lag: 0, conf: 0.70, ambigua: true,
      porque: "a impermeabilização começa no baldrame, contra a umidade que sobe do solo, e a alvenaria assenta em cima dela" },
    { de: "estrutura", para: "alvenaria", tipo: "TI", lag: 0, conf: 0.90, espera: ESPERA,
      porque: "a alvenaria de vedação sobe sobre a laje desformada e com o escoramento liberado — parede apoiada em laje ainda cimbrada trinca quando o escoramento sai" },
    { de: "estrutura", para: "cobertura", tipo: "TI", lag: 0, conf: 0.90,
      porque: "o madeiramento se apoia na estrutura: a última laje e os últimos pilares concretados antes de armar o telhado" },
    { de: "estrutura", para: "impermeabilizacao", tipo: "TI", lag: 0, conf: 0.70, ambigua: true,
      porque: "manta e membrana de laje vão sobre concreto curado e regularizado — impermeabilizar concreto verde descola" },
    { de: "alvenaria", para: "cobertura", tipo: "TI", lag: 0, conf: 0.75,
      porque: "em obra térrea o telhado se apoia na cinta de amarração e nos oitões — a alvenaria fecha antes do madeiramento" },
    { de: "alvenaria", para: "instalacoes", tipo: "II", lagPct: 0.30, conf: 0.90,
      porque: "a instalação embutida entra DENTRO da alvenaria: eletroduto, caixa e tubulação sobem junto com a parede — rasgar parede pronta depois é retrabalho" },
    { de: "alvenaria", para: "revestimento", tipo: "TI", lag: 0, conf: 0.95, espera: ESPERA,
      porque: "chapisco e emboço só sobre alvenaria assentada e curada; revestir parede recém-levantada fissura na retração da argamassa de assentamento" },
    { de: "cobertura", para: "revestimento", tipo: "TI", lag: 0, conf: 0.85,
      porque: "revestimento interno só com a obra coberta: reboco e gesso molhados pela chuva descolam — é por isso que se cobre antes de revestir" },
    { de: "instalacoes", para: "revestimento", tipo: "TI", lag: 0, conf: 0.95,
      porque: "revestimento só depois das instalações embutidas e testadas — quebrar parede revestida para achar vazamento é o retrabalho mais caro da obra" },
    { de: "impermeabilizacao", para: "revestimento", tipo: "TI", lag: 0, conf: 0.90, espera: ESPERA,
      porque: "contrapiso e piso de área molhada vão por cima da impermeabilização, depois do teste de lâmina d'água — furar a manta depois obriga a refazer tudo" },
    { de: "revestimento", para: "esquadrias", tipo: "TI", lag: 0, conf: 0.85,
      porque: "a esquadria se assenta com o vão requadrado e o piso na cota final — porta colocada antes do contrapiso fica raspando ou sobrando" },
    { de: "revestimento", para: "pintura", tipo: "TI", lag: 0, conf: 0.95, espera: ESPERA,
      porque: "pintura sobre reboco e massa curados e secos: tinta sobre reboco úmido descasca, mancha e sai em placas" },
    { de: "revestimento", para: "loucas", tipo: "TI", lag: 0, conf: 0.90,
      porque: "bacia, cuba e metais se fixam em piso e parede já revestidos — assentar antes obriga a remover a louça para azulejar" },
    { de: "instalacoes", para: "loucas", tipo: "TI", lag: 0, conf: 0.90,
      porque: "louça e metal se ligam a pontos de água e esgoto já prontos e testados" }
  ];

  /* A MOBILIZAÇÃO é fonte, e nunca fila: nada começa antes do canteiro,
     mas o canteiro se completa com a obra andando. Por isso II, e não TI. */
  var PORQUE_FONTE = "nada começa antes da mobilização do canteiro; mas o canteiro se completa com a obra andando — preliminares é frente paralela, não fila";
  /* A LIMPEZA FINAL é sumidouro: qualquer serviço depois dela suja de novo
     o que foi entregue limpo. É o único elo que vale contra TODAS as
     categorias sem exceção. */
  var PORQUE_SUMIDOURO = "limpeza final é a última frente da obra — serviço feito depois dela suja de novo o que já foi entregue limpo";

  function montarElos() {
    var out = [], vistos = {};
    ELOS_ESCRITOS.forEach(function (e) {
      var x = copia(e);
      x.lag = own(e, "lag") ? e.lag : null;
      x.lagPct = own(e, "lagPct") ? e.lagPct : null;
      x.espera = e.espera || null;
      x.ambigua = !!e.ambigua;
      x.heuristica = true;
      vistos[e.de + ">" + e.para] = 1;
      out.push(x);
    });
    CATS.forEach(function (c) {
      if (c === "preliminares" || c === "limpeza") return;
      if (!vistos["preliminares>" + c]) out.push({ de: "preliminares", para: c, tipo: "II", lag: null, lagPct: 0.50,
        conf: 0.80, espera: null, ambigua: false, heuristica: true, porque: PORQUE_FONTE });
    });
    CATS.forEach(function (c) {
      if (c === "limpeza") return;
      if (!vistos[c + ">limpeza"]) out.push({ de: c, para: "limpeza", tipo: "TI", lag: 0, lagPct: null,
        conf: 0.90, espera: null, ambigua: false, heuristica: true, porque: PORQUE_SUMIDOURO });
    });
    return out;
  }

  var _cache = null;
  function tabela() {
    if (_cache) return _cache;
    var elos = montarElos(), diretos = {}, adj = {}, i;
    CATS.forEach(function (c) { adj[c] = []; });
    elos.forEach(function (e) { diretos[e.de + ">" + e.para] = e; adj[e.de].push(e.para); });
    /* CAMINHO MAIS CURTO (largura) de cada categoria a cada outra: é o que
       transforma "A vem antes de B" numa resposta para TODO par, dizendo
       POR ONDE. ⚠ O grafo é acíclico por construção (todo elo anda para a
       frente na ordem de CATS) e tools/test-cronoseq.js cobra isso — um elo
       para trás fecharia ciclo e a sugestão viraria "depende de si mesma". */
    var pares = [], porPar = {};
    CATS.forEach(function (ca) {
      var dist = {}, ant = {}, fila = [ca];
      dist[ca] = 0;
      while (fila.length) {
        var at = fila.shift();
        adj[at].forEach(function (nx) {
          if (own(dist, nx)) return;
          dist[nx] = dist[at] + 1; ant[nx] = at; fila.push(nx);
        });
      }
      CATS.forEach(function (cb) {
        var p = { de: ca, para: cb, depende: false, direto: false, via: [], tipo: null, lag: null, lagPct: null,
          conf: null, porque: "", espera: null, ambigua: false, heuristica: true };
        if (cb !== ca && own(dist, cb)) {
          p.depende = true;
          var d = diretos[ca + ">" + cb];
          if (d) {
            p.direto = true; p.tipo = d.tipo; p.lag = d.lag; p.lagPct = d.lagPct;
            p.conf = d.conf; p.porque = d.porque; p.espera = d.espera; p.ambigua = d.ambigua;
          } else {
            /* HERDADO: A vem antes de B porque passa por C. Vira sempre
               término-início (compor dois II daria uma conta que ninguém
               conferiu), a confiança cai (0,85) e o `porque` diz o caminho
               — precedência sem motivo visível é a que alguém "simplifica"
               depois. Sobreposição: só fica proibida (lag 0) se TODO elo do
               caminho a proibir. */
            var cam = [], cur = cb, confs = [], zero = true;
            while (cur !== ca) { cam.unshift(cur); var pai = ant[cur]; var ed = diretos[pai + ">" + cur];
              confs.push(ed.conf); if (ed.lag !== 0) zero = false; cur = pai; }
            p.via = cam.slice(0, cam.length - 1);
            p.tipo = "TI"; p.lag = zero ? 0 : null; p.lagPct = null;
            var mc = confs.reduce(function (m, v) { return Math.min(m, v); }, 1);
            p.conf = Math.round(mc * 0.85 * 100) / 100;
            p.ambigua = p.via.some(function (v) { return v === "impermeabilizacao"; });
            var ult = diretos[ant[cb] + ">" + cb];
            p.porque = cortar("na ordem da obra " + NOME[ca] + " vem antes de " + NOME[cb] +
              (p.via.length ? " (por " + p.via.map(function (v) { return NOME[v]; }).join(", ") + ")" : "") +
              ": " + ult.porque, 190);
          }
        }
        pares.push(p); porPar[ca + ">" + cb] = p;
      });
    });
    var paralelas = [];
    for (i = 0; i < CATS.length; i++) {
      for (var j = i + 1; j < CATS.length; j++) {
        if (!porPar[CATS[i] + ">" + CATS[j]].depende && !porPar[CATS[j] + ">" + CATS[i]].depende)
          paralelas.push([CATS[i], CATS[j]]);
      }
    }
    _cache = { versao: 1, heuristica: true, cats: CATS.slice(), nomes: copia(NOME), ordem: CATS.slice(),
      elos: elos, pares: pares, porPar: porPar, paralelas: paralelas,
      fonte: "conhecimento de sequência de obra, escrito à mão. Não é norma, não é medição e não é estatística: cada linha traz o motivo construtivo, e o campo conf é peso editorial." };
    return _cache;
  }

  function dep(ca, cb) { var p = tabela().porPar[ca + ">" + cb]; return !!(p && p.depende); }
  function par(ca, cb) { return tabela().porPar[ca + ">" + cb] || null; }

  /* =====================================================================
     PUREZA — a metade MEDIDA da confiança.
     O motor rotula um nó pela categoria que tem MAIOR CUSTO dentro dele
     (js/cronograma.js: `catPred` na etapa, `catMaior` na folha). Pureza =
     a menor das duas participações dessa categoria: em CUSTO (que é como o
     rótulo foi escolhido) e em EQUIPE-DIAS (que é o que move a data). A
     menor das duas, de propósito: uma etapa 90% revestimento no preço e 40%
     no tempo não pode sair com confiança de 0,9.
     ⚠ Nenhum R$ sai daqui — só a RAZÃO. O custo é interno ao motor (o
     próprio js/cronograma.js diz isso em `_itemEd`) e este módulo alimenta
     contexto de IA; deixar um valor escapar seria dinheiro indo ao provedor.
     ===================================================================== */
  function pureza(itens, params, cat) {
    var Cr = C();
    if (!Cr || !Cr.estimarItem || !cat || cat === "outros") return null;
    var totEd = 0, totCu = 0, ed = {}, cu = {};
    arr(itens).forEach(function (it) {
      if (!it || it.qtdPendente) return;
      var q = num(it.quantidade);
      if (!(q > 0)) return;
      var x;
      try { x = Cr.estimarItem(it, params || {}); } catch (e) { return; }
      var e1 = isFinite(x.equipeDias) ? x.equipeDias : 0, c1 = q * num(it.custoUnitario);
      totEd += e1; totCu += c1;
      ed[x.categoria] = (ed[x.categoria] || 0) + e1;
      cu[x.categoria] = (cu[x.categoria] || 0) + c1;
    });
    if (!(totEd > 0) && !(totCu > 0)) return null;
    var pEd = totEd > 0 ? (ed[cat] || 0) / totEd : null;
    var pCu = totCu > 0 ? (cu[cat] || 0) / totCu : null;
    var v = (pEd == null) ? pCu : ((pCu == null) ? pEd : Math.min(pEd, pCu));
    if (v == null) return null;
    return { valor: Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000,
      tempo: pEd == null ? null : Math.round(pEd * 1000) / 1000,
      custo: pCu == null ? null : Math.round(pCu * 1000) / 1000 };
  }

  /* ================= TOKEN do "Depende de" =================
     O texto que a pessoa digitaria na coluna — e que
     `Cronograma.parsePreds` (etapa) e `Cronograma.parsePredsSub` (folha)
     leem de volta. É a MESMA gramática dos dois: "1", "1+7", "1-3" na
     etapa; "2.3", "2.g", "2.3+2", "2.3II", "2.3II+5" na folha.
     ⚠ Sem predecessora o token é "0" e NUNCA "" — vazio, no parser, quer
     dizer "o padrão (depende da anterior)", que é justamente o contrário. */
  function token(preds, numPorId, lags, tipos) {
    if (!preds || !preds.length) return "0";
    return preds.map(function (p) {
      var n = numPorId && numPorId[p] != null ? String(numPorId[p]) : "?";
      var l = lags && own(lags, p) ? num(lags[p]) : null;
      var ii = tipos && own(tipos, p) && String(tipos[p]).toUpperCase() === "II";
      return n + (ii ? "II" : "") + (l == null ? "" : (l < 0 ? "-" + (-l) : "+" + l));
    }).join(",");
  }

  function assinatura(preds, lags, tipos) {
    var p = arr(preds).slice().sort();
    return JSON.stringify({ p: p, l: ordenado(lags), t: ordenado(tipos) });
  }
  function ordenado(o) { var r = {}; chaves(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  /* ================= ESCREVER NUMA CÓPIA (só para MEDIR) =================
     ⚠ ISTO NÃO É A GRAVAÇÃO DO PRODUTO. Quem grava é o js/iaedit.js, pelo
     `definir_dependencia` do catálogo, com retrato, diff, checkbox e
     desfazer. Esta função existe só para o motor poder rodar COM e SEM a
     sugestão e a economia sair MEDIDA em vez de estimada. Ela escreve nos
     mesmos mapas que o `estimar` lê (`predecessoras`/`lags` da etapa,
     `sub.predecessoras`/`sub.lags`/`sub.tipos` da folha) — e a suíte prova
     isso rodando o motor e conferindo `preds` nó a nó, em vez de confiar. */
  function aplicarEmCopia(orc, ligacoes) {
    var c = copia(orc) || {};
    if (!c.cronograma || typeof c.cronograma !== "object" || Array.isArray(c.cronograma)) c.cronograma = {};
    arr(ligacoes).forEach(function (g) {
      var m = g.nivel === "folha" ? mapaDe(c.cronograma, "sub") : c.cronograma;
      var pc = mapaDe(m, "predecessoras"), lc = mapaDe(m, "lags"), tc = mapaDe(m, "tipos");
      pc[g.alvoId] = arr(g.preds).slice();
      if (chaves(g.lags).length) lc[g.alvoId] = copia(g.lags); else delete lc[g.alvoId];
      if (g.nivel === "folha") { if (chaves(g.tipos).length) tc[g.alvoId] = copia(g.tipos); else delete tc[g.alvoId]; }
    });
    return c;
  }

  /* ⚠ O PRAZO VEM COM A RESPOSTA "FECHOU LAÇO?" COLADA NELE, e não é
     enfeite. Medido em 12/09/2026 sobre os orçamentos reais: 65 das 174
     ligações sugeridas, aplicadas SOZINHAS (que é o caminho normal do
     produto — checkbox a checkbox), fechavam um laço de dependência. O
     motor não recusa laço: ele desenha IGNORANDO um elo e devolve
     `temCiclo`/`avisos[tipo:"ciclo"]`. Quem só lia `totalDias` recebia um
     número menor (a rede com um elo a menos) e publicava como economia — e
     esse número ia para a tela antes de a pessoa marcar a caixa. Daí o
     `{eap:true}`: sem a árvore, `r.exec.avisos` não existe e o laço ENTRE
     SUBETAPAS passa calado. */
  function estimarTotal(orc) {
    var Cr = C();
    if (!Cr || !Cr.estimar) return null;
    try {
      var r = Cr.estimar(orc, null, { eap: true });
      var cic = !!r.temCiclo, quais = [];
      arr(r.exec && r.exec.avisos).forEach(function (a) {
        if (a && a.tipo === "ciclo") { cic = true; quais = quais.concat(arr(a.folhas)); }
      });
      return { dias: num(r.totalDias), fim: r.dataFim ? new Date(r.dataFim.getTime()) : null,
        ciclo: cic, cicloFolhas: quais };
    } catch (e) { return null; }
  }

  /* ================= ORDEM TOPOLÓGICA =================
     ⚠ A ORDEM DA PLANILHA É A ORDEM ERRADA justamente no caso que este
     módulo existe para consertar. `IAEdit.aplicar` aplica op a op e recusa a
     que fecha laço NO MEIO do caminho (js/iaedit.js, `definir_dependencia`:
     conta `cicloDep` antes e depois e devolve "cria dependência circular").
     Medido na planilha fora de ordem (pintura, revestimento, alvenaria): das
     3 ops, 1 aceita e 2 RECUSADAS — e o que sobrava gravado era
     Pintura → Alvenaria → Revestimento, isto é, o módulo chamado para
     consertar a sequência produzia pintura terminando antes de a alvenaria
     começar, 20 dias úteis mais curto, na data impressa na proposta.
     Emitindo na ordem da REDE PROPOSTA (predecessor antes do sucessor), cada
     op encontra as predecessoras dela já repontadas e nenhuma fecha laço
     intermediário. Desempate: a ordem da planilha, para a lista sair estável.
     ===================================================================== */
  function ordenarTopologicamente(ligs) {
    var idx = {}, grau = {}, saem = {}, fila = [], out = [], usado = {}, faltaram = [];
    ligs.forEach(function (g, i) { idx[g.alvoId] = i; grau[g.alvoId] = 0; saem[g.alvoId] = []; });
    ligs.forEach(function (g) {
      arr(g.preds).forEach(function (p) {
        if (own(idx, p) && p !== g.alvoId) { grau[g.alvoId]++; saem[p].push(g.alvoId); }
      });
    });
    ligs.forEach(function (g) { if (grau[g.alvoId] === 0) fila.push(g.alvoId); });
    while (fila.length) {
      fila.sort(function (a, b) { return idx[a] - idx[b]; });
      var at = fila.shift();
      if (usado[at]) continue;
      usado[at] = 1; out.push(ligs[idx[at]]);
      saem[at].forEach(function (nx) { if (--grau[nx] === 0) fila.push(nx); });
    }
    /* ⚠ SOBROU ALGUÉM = A REDE PROPOSTA TEM LAÇO. Não pode acontecer (a
       matriz é acíclica e a suíte cobra isso nos dois sentidos), mas se
       acontecer o resto vai no fim, na ordem da planilha, E SAI DITO — uma
       lista silenciosamente incompleta seria pior que a ordem errada. */
    ligs.forEach(function (g) { if (!usado[g.alvoId]) { faltaram.push(g); out.push(g); } });
    return { lista: out, faltaram: faltaram };
  }

  /* ================= SUGERIR ================= */

  function nosDaEtapa(r, etapaId) {
    return arr(r && r.atividades).filter(function (n) {
      return (n.tipo === "subetapa" || n.tipo === "soltos") && n.etapaId === etapaId;
    });
  }

  /* O miolo: dado um nível (lista de nós na ordem da planilha), quem depende
     de quem pela matriz. Devolve as LIGAÇÕES, sem medir nada ainda. */
  function ligacoesDoNivel(nivel, nos, numPorId, pendentes) {
    var presentes = {}, out = [];
    nos.forEach(function (n) {
      if (n.marco) { pendentes.push({ nivel: nivel, id: n.id, num: n.num, nome: n.nome,
        porque: "é marco (duração zero) — a posição dele é decisão de contrato, não sequência construtiva" }); return; }
      if (!n.cat || n.cat === "outros") { pendentes.push({ nivel: nivel, id: n.id, num: n.num, nome: n.nome,
        porque: "sem categoria reconhecida (\"outros\") — a matriz não fala deste serviço e nada foi proposto; o \"Depende de\" dele continua o de hoje" }); return; }
      presentes[n.cat] = true;
    });
    var uteis = nos.filter(function (n) { return !n.marco && n.cat && n.cat !== "outros"; });
    var primeiroDaCat = {}, ultimoDaCat = {};
    uteis.forEach(function (n) { if (!own(primeiroDaCat, n.cat)) primeiroDaCat[n.cat] = n; ultimoDaCat[n.cat] = n; });

    uteis.forEach(function (alvo, iAlvo) {
      var cx = alvo.cat, candidatas = [];
      chaves(presentes).forEach(function (cy) { if (cy !== cx && dep(cy, cx)) candidatas.push(cy); });
      /* REDUÇÃO TRANSITIVA: se cy já chega em cx passando por cz (e cz também
         está no orçamento), o elo cy→cx é redundante. Sem isto a etapa de
         revestimento sairia dependendo de preliminares, terraplenagem,
         fundação, estrutura, alvenaria e instalações ao mesmo tempo — seis
         linhas dizendo o que duas dizem, e o "Depende de" vira ilegível.

         ⚠ SÓ SE PODE REDUZIR POR UM ELO QUE NÃO SOBREPÕE. Medido numa
         fixture de alvenaria → instalações → revestimento → pintura: como
         alvenaria→instalações é INÍCIO-INÍCIO (a instalação entra dentro da
         parede), a instalação TERMINA antes da alvenaria (dia 19 contra 20).
         Reduzindo por ela, o revestimento ficava só atrás da instalação e
         começava com a alvenaria ainda de pé — o elo que o transitivo
         "herdaria" simplesmente não existia no tempo. Por isso o atalho por
         cz só vale quando a CONTA fecha, e ela fecha em dois casos:
          (a) cy→cz é término-início sem sobreposição (lag 0): cz termina
              depois de cy, então o que vem depois de cz vem depois de cy —
              sempre, seja qual for a duração;
          (b) cy→cz é início-início com fração p, cy→cx também é
              início-início com fração p', e p ≥ p': o caminho dá
              ini_cx ≥ ini_cy + p·dur_cy + dur_cz, e o elo direto pede
              ini_cy + p'·dur_cy — com p ≥ p' o caminho é o mais apertado
              dos dois, sem depender de nenhuma duração.
         Em qualquer outro caso o elo direto FICA. Uma linha a mais no
         "Depende de" custa leitura; uma linha a menos custa a data. */
      var reduzidas = candidatas.filter(function (cy) {
        var direto = par(cy, cx);
        return !candidatas.some(function (cz) {
          if (cz === cy) return false;
          var pCyCz = par(cy, cz), pCzCx = par(cz, cx);
          if (!pCyCz || !pCyCz.depende || !pCzCx || !pCzCx.depende) return false;
          // a 2ª perna tem de pôr cx em cima ou depois do INÍCIO de cz
          if (!(pCzCx.tipo === "II" || pCzCx.lag === 0)) return false;
          if (pCyCz.tipo === "TI" && pCyCz.lag === 0) return true;
          return pCyCz.tipo === "II" && direto && direto.tipo === "II" &&
            num(pCyCz.lagPct) >= num(direto.lagPct);
        });
      });
      var preds = [], lags = {}, tipos = {}, elos = [], convertidos = [], capados = [], foraDeOrdem = [];
      reduzidas.forEach(function (cy) {
        var p = par(cy, cx), ehII = p.tipo === "II" && p.lagPct != null;
        /* II pega o PRIMEIRO nó da categoria (a frente entra quando a
           primeira parede já andou), TI pega o ÚLTIMO (só depois que toda
           aquela frente fechou). Como os nós da mesma categoria ficam
           encadeados entre si, depender do último equivale a depender de
           todos — e o "Depende de" fica com uma linha em vez de N. */
        var pn = ehII ? primeiroDaCat[cy] : ultimoDaCat[cy];
        if (!pn) return;
        var e = { de: cy, para: cx, tipo: p.tipo, conf: p.conf, porque: p.porque, espera: p.espera,
          direto: p.direto, via: p.via.slice(), ambigua: p.ambigua, predId: pn.id, predNum: pn.num, predNome: pn.nome };
        /* ⚠ PREDECESSOR DEPOIS DO ALVO NA PLANILHA. O elo SAI MESMO ASSIM: o
           motor liga por id, não por índice (js/cronograma.js, `predsCfg`), e
           calar aqui seria pior — sem o elo, as duas frentes ficariam
           PARALELAS, que é exatamente o contrário do que a obra manda. Mas o
           Gantt vai desenhar a etapa 1 depois da 2, e isso precisa estar
           escrito: reordenar a planilha é da pessoa (mover etapa está FORA do
           catálogo da IA — js/iaedit.js, FORA.mover_etapa). */
        if (pn.ordem >= alvo.ordem) {
          e.foraDeOrdem = true;
          foraDeOrdem.push({ predNum: pn.num, alvoNum: alvo.num,
            porque: alvo.num + " (" + nomeCat(cx, alvo.nome) + ") vem depois de " + pn.num + " (" + nomeCat(cy, pn.nome) + ") na obra, mas está ANTES dele na planilha — o elo vale, e o Gantt vai desenhar fora da ordem da lista. Reordenar a planilha é com você." });
        }
        if (preds.indexOf(pn.id) < 0) preds.push(pn.id);
        if (ehII) {
          var dias = Math.round(num(p.lagPct) * num(pn.dur));
          if (dias < 0) dias = 0;
          if (dias > num(pn.dur)) dias = Math.max(0, Math.round(num(pn.dur)));
          if (nivel === "folha") {
            tipos[pn.id] = "II"; lags[pn.id] = Math.min(TETOS.lag, dias);
            e.aplicado = { tipo: "II", lag: lags[pn.id] };
          } else {
            /* ⚠ NO NÍVEL ETAPA NÃO EXISTE INÍCIO-INÍCIO. O motor só tem
               término-início entre etapas (js/cronograma.js: `n.predTipo[p] =
               "TI"` para toda etapa), e o validador recusa "II" fora de
               subetapa (js/iaedit.js: "início-início (II) só entre
               subetapas"). A sobreposição vira AVANÇO (lag negativo), que dá
               a mesma data HOJE — mas acompanha o FIM do predecessor, não o
               início: se a duração dele mudar, a sobreposição muda junto e
               a pessoa precisa rever. Sai declarado em `convertidos`. */
            var av = -Math.round((1 - num(p.lagPct)) * num(pn.dur));
            if (av < -TETOS.lag) { av = -TETOS.lag; capados.push(pn.id); }
            lags[pn.id] = av;
            e.aplicado = { tipo: "TI", lag: av };
            e.conf = Math.round(e.conf * 0.9 * 100) / 100;
            convertidos.push({ predId: pn.id, predNum: pn.num, lag: av,
              porque: "o cronograma por ETAPA só tem elo término-início: a sobreposição virou avanço de " + (-av) + " dia(s) útil(eis). Mesma data hoje; se a duração de " + pn.num + " mudar, reveja." });
          }
        } else if (p.lag === 0) {
          lags[pn.id] = 0;
          e.aplicado = { tipo: "TI", lag: 0 };
        } else {
          e.aplicado = { tipo: "TI", lag: null };
        }
        elos.push(e);
      });
      /* MESMA CATEGORIA: a matriz não diz nada sobre duas etapas de
         revestimento — podem ser dois pavimentos (fila, mesma equipe) ou
         interno e externo (paralelo). Não dá para saber daqui, então o
         conservador: mantém a ordem da planilha entre elas, com a
         sobreposição de hoje (lag ausente = o `paralelismo` da obra). Sai
         rotulado para a pessoa poder soltar. */
      var ant = null;
      for (var k = iAlvo - 1; k >= 0; k--) if (uteis[k].cat === cx) { ant = uteis[k]; break; }
      var mesma = null;
      if (ant && preds.indexOf(ant.id) < 0) {
        preds.push(ant.id);
        mesma = { predId: ant.id, predNum: ant.num, predNome: ant.nome,
          porque: "mesma categoria (" + nomeCat(cx, alvo.nome) + "): a matriz não separa dois pavimentos de duas frentes — ficou na ordem da planilha, com a sobreposição de hoje. Se forem frentes diferentes, solte." };
      }
      if (preds.length > TETOS.preds) { preds = preds.slice(0, TETOS.preds); }
      var sigNova = assinatura(preds, lags, nivel === "folha" ? tipos : {});
      var sigHoje = assinatura(alvo.predsHoje, alvo.lagsHoje, alvo.tiposHoje);
      if (sigNova === sigHoje) return;   // já está assim: op que não muda nada é ruído no diff
      var pz = alvo.pureza;
      var confElo = elos.length ? elos.reduce(function (m, e) { return Math.min(m, e.conf); }, 1) : 0.80;
      if (!elos.length && !mesma) confElo = 0.80;   // "começa no dia 0": a matriz não achou predecessor
      var lig = {
        nivel: nivel, alvoId: alvo.id, alvoNum: alvo.num, alvoNome: alvo.nome, cat: cx, catNome: nomeCat(cx, alvo.nome),
        etapaId: alvo.etapaId || null,
        preds: preds, predsNum: preds.map(function (p) { return numPorId[p] != null ? numPorId[p] : "?"; }),
        lags: ordenado(lags), tipos: nivel === "folha" ? ordenado(tipos) : {},
        token: token(preds, numPorId, lags, nivel === "folha" ? tipos : null),
        tokenHoje: token(alvo.predsHoje, numPorId, alvo.lagsHoje, alvo.tiposHoje),
        elos: elos, mesmaCategoria: mesma, convertidos: convertidos, foraDeOrdem: foraDeOrdem,
        semSobreposicao: chaves(lags).some(function (k2) { return num(lags[k2]) === 0; }),
        espera: elos.filter(function (e) { return !!e.espera; }).map(function (e) { return { de: e.de, predNum: e.predNum, porque: e.espera }; }),
        heuristica: true,
        conf: Math.round(confElo * 100) / 100,
        pureza: pz ? pz.valor : null, purezaMedida: !!pz, purezaDetalhe: pz || null,
        confianca: pz ? Math.round(confElo * pz.valor * 100) / 100 : Math.round(confElo * 100) / 100,
        sobrescreve: alvo.predsExplicito ? { explicito: true, atual: arr(alvo.predsHoje).slice(),
          porque: "o \"Depende de\" desta linha foi escrito por gente — a sugestão não passa por cima sem alguém marcar" } : null,
        liberadoNoDia0: !preds.length
      };
      if (capados.length) lig.aviso = "avanço limitado a " + TETOS.lag + " dias (teto do \"Depende de\") — a sobreposição proposta ficou menor que a da matriz";
      lig.motivo = motivoDe(lig);
      lig.op = { op: "definir_dependencia", alvoId: lig.alvoId, preds: lig.preds.slice(),
        lags: copia(lig.lags), tipos: copia(lig.tipos), motivo: lig.motivo };
      out.push(lig);
    });
    return out;
  }

  function motivoDe(lig) {
    var base;
    if (lig.elos.length) {
      base = lig.elos[0].porque;
      if (lig.elos.length > 1) base += " (+" + (lig.elos.length - 1) + " razão construtiva)";
    } else if (lig.mesmaCategoria) {
      base = lig.mesmaCategoria.porque;
    } else {
      base = "nenhuma categoria do orçamento precisa vir antes de " + nomeCat(lig.cat, lig.alvoNome) + " — esta frente pode começar junto com as outras, em vez de esperar a fila";
    }
    return cortar("Sequência de obra (heurística, confira): " + base, TETOS.motivo);
  }

  function coletarNos(orc, r) {
    var nivelFolha = !!(r && r.exec && r.exec.rede === true && arr(r.atividades).length);
    var numPorId = {}, etapas = [], porEtapa = {};
    var params = (r && r.params) || (C() && C()._params ? C()._params(orc) : {});
    arr(r && r.etapas).forEach(function (e, i) {
      var itens = arr(arr(orc.etapas)[i] && arr(orc.etapas)[i].itens);
      numPorId[e.id] = String(i + 1);
      etapas.push({ id: e.id, num: String(i + 1), nome: String(e.nome || ""), cat: e.categoria,
        dur: num(e.duracao), marco: !!e.marco, ordem: i, inicio: num(e.inicio), fim: num(e.fim),
        predsHoje: arr(e.preds).slice(), lagsHoje: copia(e.predLag) || {}, tiposHoje: {},
        predsExplicito: !!e.predsExplicito, pureza: pureza(itens, params, e.categoria), etapaId: e.id });
    });
    if (nivelFolha) {
      arr(r.atividades).forEach(function (n) { if (n.numero != null) numPorId[n.id] = String(n.numero); });
      arr(r.etapas).forEach(function (e, i) {
        var fs = nosDaEtapa(r, e.id);
        if (!fs.length) return;
        porEtapa[e.id] = fs.map(function (n, j) {
          var itens = arr(r.atividades).filter(function (s) { return s.tipo === "servico" && s.paiId === n.id; })
            .map(function (s) { return arr(arr(orc.etapas)[s.etapaIdx] && arr(orc.etapas)[s.etapaIdx].itens)[s.itemIdx]; })
            .filter(function (it) { return !!it; });
          return { id: n.id, num: String(n.numero), nome: String(n.nome || ""), cat: n.categoria,
            dur: num(n.duracaoRede != null ? n.duracaoRede : n.duracao), marco: !!n.marco, ordem: j,
            inicio: num(n.inicio), fim: num(n.fim), etapaId: e.id,
            predsHoje: arr(n.preds).slice(), lagsHoje: copia(n.predLag) || {}, tiposHoje: copia(n.predTipo) || {},
            predsExplicito: !!n.predsExplicito, pureza: pureza(itens, params, n.categoria) };
        });
      });
    }
    return { nivelFolha: nivelFolha, numPorId: numPorId, etapas: etapas, porEtapa: porEtapa };
  }

  function rDe(orc, r) {
    if (r && arr(r.etapas).length) return r;
    var Cr = C();
    if (!Cr || !Cr.estimar) return null;
    try { return Cr.estimar(copia(orc), null, { eap: true }); } catch (e) { return null; }
  }

  var CronoSeq = {
    VERSAO: 1,
    CATS: CATS.slice(),
    NOME: NOME,
    TETOS: TETOS,
    ELOS_ESCRITOS: ELOS_ESCRITOS,

    /* A TABELA INTEIRA. Cópia a cada chamada, de propósito: o objeto é
       compartilhado por todas as telas e uma alteração acidental viraria
       precedência diferente em cada aba. */
    matriz: function () { return copia(tabela()); },
    elo: function (de, para) { var p = par(de, para); return p ? copia(p) : null; },
    depende: function (de, para) { return dep(de, para); },

    /* ================= SUGERIR =================
       `orc` = orçamento (ou o plano da obra); `r` = o resultado de
       `Cronograma.estimar(orc, null, {eap:true})` — se não vier, é
       calculado aqui. `opts.medir` (padrão true) roda o motor com e sem;
       `opts.maxMedicoes` (padrão 60) limita as medições individuais dos
       paralelismos em orçamento grande. */
    sugerir: function (orc, r, opts) {
      opts = opts || {};
      var res = { ok: false, heuristica: true, nivelFolha: false, ligacoes: [], ops: [],
        paralelismos: [], pendentes: [], avisos: [],
        economia: { medido: false, porque: "não medido" } };
      if (!orc || !arr(orc.etapas).length) { res.erro = "orçamento sem etapas"; return res; }
      var R = rDe(orc, r);
      if (!R) { res.erro = "o motor do cronograma (Cronograma.estimar) não está disponível — sem ele não dá para saber a duração de nada, e este módulo não inventa duração"; return res; }
      var D = coletarNos(orc, R);
      res.nivelFolha = D.nivelFolha;
      var ligs = ligacoesDoNivel("etapa", D.etapas, D.numPorId, res.pendentes);
      if (D.nivelFolha) chaves(D.porEtapa).forEach(function (eid) {
        ligs = ligs.concat(ligacoesDoNivel("folha", D.porEtapa[eid], D.numPorId, res.pendentes));
      });
      /* ⚠ ORDEM TOPOLÓGICA ANTES DE QUALQUER COISA — ver `ordenarTopologicamente`.
         A lista que sai daqui é a ordem em que as ops têm de ser APLICADAS. */
      var TOPO = ordenarTopologicamente(ligs);
      ligs = TOPO.lista;
      if (TOPO.faltaram.length) {
        res.avisos.push("⚠ " + TOPO.faltaram.length + " ligação(ões) não couberam na ordem topológica (a rede proposta teria laço) — foram para o fim da lista, na ordem da planilha. Isto é defeito deste módulo: avise.");
      }
      /* companheiras que TÊM de vir antes desta: o fecho para cima pelas
         predecessoras NOVAS. É o que a tela precisa para não deixar marcar
         uma caixa sozinha quando ela depende de outra — e é o que o
         `IAEdit.fechoDesmarcar` já sabe arrastar, quando alguém ligar os
         dois (ver PENDÊNCIA, no fim do arquivo). */
      var posPorId = {};
      ligs.forEach(function (g, i) { posPorId[g.alvoId] = i; });
      ligs.forEach(function (g) {
        var dep = [], visto = {}, pilha = arr(g.preds).slice();
        while (pilha.length) {
          var p = pilha.shift();
          if (visto[p] || !own(posPorId, p)) continue;
          visto[p] = 1; dep.push(posPorId[p]);
          pilha = pilha.concat(arr(ligs[posPorId[p]].preds));
        }
        g.dependeDe = dep.sort(function (a, b) { return a - b; });
        g.ordemAplicacao = posPorId[g.alvoId];
      });
      res.ligacoes = ligs;
      res.ops = ligs.map(function (g) { return copia(g.op); });
      res.ok = true;
      if (!ligs.length) {
        res.avisos.push("nada a mudar: a rede de hoje já é a que a matriz propõe (ou o orçamento só tem serviço sem categoria reconhecida)");
      }
      var fdo = 0;
      ligs.forEach(function (g) { fdo += arr(g.foraDeOrdem).length; });
      if (fdo) res.avisos.push(fdo + " elo(s) ligam uma linha a outra que vem DEPOIS dela na planilha (a ordem da lista não é a ordem da obra) — o elo vale, mas o Gantt desenha fora da ordem da lista; reordenar a planilha é com você");

      /* ================= A ECONOMIA, MEDIDA =================
         ⚠ NÚMERO MEDIDO, NUNCA ESTIMADO. Roda o `Cronograma.estimar` no
         orçamento como está e no MESMO orçamento com as ligações escritas
         numa cópia, e compara o `totalDias`. Se o motor não estiver aqui,
         `medido: false` com o porquê — recado que mente é pior que recado
         nenhum. E o número pode ser NEGATIVO: a fila de hoje sobrepõe 15%
         de tudo, inclusive onde a obra não permite. */
      if (opts.medir === false) { res.economia.porque = "medição desligada no pedido (opts.medir === false)"; return res; }
      var base = estimarTotal(orc);
      if (!base) { res.economia.porque = "o motor não devolveu prazo para o orçamento como está"; return res; }
      var comTudo = ligs.length ? estimarTotal(aplicarEmCopia(orc, ligs)) : base;
      if (!comTudo) { res.economia.porque = "o motor não devolveu prazo com as ligações aplicadas"; return res; }
      res.economia = { medido: true, diasAntes: base.dias, diasDepois: comTudo.dias,
        dias: base.dias - comTudo.dias, fimAntes: base.fim, fimDepois: comTudo.fim,
        /* ⚠ ESTE NÚMERO É O DO CONJUNTO INTEIRO, e a tela tem de dizer isso.
           Ele foi medido com TODAS as ligações escritas de uma vez; marcar
           metade das caixas não entrega metade dele — e, antes da ordem
           topológica, 27 de 34 orçamentos nem alcançavam esse estado pelo
           caminho do produto, porque o `aplicar` recusava as do meio. */
        soValeComTodas: true,
        escopo: "as " + ligs.length + " ligação(ões) aplicadas JUNTAS, na ordem em que saem em `ops`",
        ciclo: !!comTudo.ciclo,
        sentido: base.dias === comTudo.dias ? "igual" : (base.dias > comTudo.dias ? "encurta" : "alonga"),
        porque: base.dias > comTudo.dias ? "as frentes que a matriz libera passam a andar juntas"
          : (base.dias < comTudo.dias ? "a fila de hoje sobrepõe 15% de tudo; a matriz proíbe a sobreposição onde a obra não permite, e o prazo honesto é maior" : "a rede mudou, o caminho crítico não") };
      if (comTudo.ciclo) {
        /* não pode acontecer (a rede proposta é acíclica), e se acontecer o
           `totalDias` é o de uma rede com um elo IGNORADO — número que não é
           de ninguém. Sai sem medição, com o motivo. */
        res.economia = { medido: false, ciclo: true,
          porque: "com todas as ligações aplicadas o motor acusou laço de dependência e desenhou ignorando um elo — o prazo daí não é de ninguém, e não vai sair como economia. Isto é defeito deste módulo: avise." };
        res.avisos.push("⚠ a rede proposta fechou laço no motor — nenhuma economia foi publicada.");
      }

      /* ================= PARALELISMOS =================
         "hoje em fila, e poderia andar junto": B depende de A na rede de
         HOJE e a matriz não põe A antes de B (independentes), ou põe com
         início-início (podem se sobrepor). Cada um é medido SOZINHO — o
         orçamento como está + APENAS a ligação daquele nó — para o número
         ser a contribuição dele, e não a soma de todos. */
      var porId = {};
      D.etapas.forEach(function (n) { porId[n.id] = n; });
      chaves(D.porEtapa).forEach(function (eid) { D.porEtapa[eid].forEach(function (n) { porId[n.id] = n; }); });
      var max = num(opts.maxMedicoes) > 0 ? num(opts.maxMedicoes) : 60, medidas = 0, naoMedidos = 0, comLaco = 0, desconhecidas = 0;
      /* ⚠ TODA LIGAÇÃO É RODADA SOZINHA, mesmo a que não gera paralelismo:
         é assim que a pessoa marca (checkbox a checkbox), e é o único jeito
         de saber se aquela caixa, sozinha, fecha laço. O resultado fica na
         própria ligação (`g.sozinha`), e é ELE que alimenta os dias do
         paralelismo — nunca uma segunda medição que poderia divergir. */
      ligs.forEach(function (g) {
        var um = null, motivoSem = "";
        if (medidas < max) { medidas++; um = estimarTotal(aplicarEmCopia(orc, [g])); }
        else { naoMedidos++; motivoSem = "acima do teto de " + max + " medições individuais nesta chamada"; }
        if (um && um.ciclo) {
          comLaco++;
          g.sozinha = { medido: false, fechaLaco: true, dias: null,
            porqueNaoMedido: "sozinha esta ligação fecha um laço de dependência — o número só existe com as " +
              g.dependeDe.length + " companheira(s) que vêm antes dela em `ops`. O produto RECUSA a op sozinha (\"cria dependência circular\"), e um prazo medido numa rede com elo ignorado não é de ninguém." };
        } else if (um) {
          g.sozinha = { medido: true, fechaLaco: false, dias: base.dias - um.dias, diasDepois: um.dias };
        } else {
          g.sozinha = { medido: false, fechaLaco: null, dias: null,
            porqueNaoMedido: motivoSem || "o motor não devolveu prazo com esta ligação aplicada sozinha" };
        }
      });
      if (comLaco) {
        res.avisos.push(comLaco + " de " + ligs.length + " ligação(ões) fecham laço quando aplicadas SOZINHAS — elas não trazem número de dias e a tela tem de exigir as companheiras de `dependeDe` junto. Aplicadas TODAS, na ordem de `ops`, nenhuma fecha laço.");
      }
      res.resumoLaco = { sozinhasComLaco: comLaco, de: ligs.length, comTodasNaOrdem: !!(res.economia && res.economia.ciclo) };
      ligs.forEach(function (g) {
        var alvo = porId[g.alvoId];
        if (!alvo) return;
        var soltos = arr(alvo.predsHoje).filter(function (p) { return g.preds.indexOf(p) < 0; });
        var sobre = g.elos.filter(function (e) { return e.aplicado && e.aplicado.lag != null && e.aplicado.lag < 0; });
        if (!soltos.length && !sobre.length) return;
        var S = g.sozinha || { medido: false, dias: null, porqueNaoMedido: "não medida" };
        soltos.forEach(function (pid) {
          var pn = porId[pid];
          var catP = pn ? pn.cat : null;
          /* ⚠ "A MATRIZ NÃO SABE" ≠ "A MATRIZ DIZ QUE PODEM ANDAR JUNTAS".
             `par()` devolve nulo em dois casos bem diferentes: as duas
             categorias existem na tabela e não há precedência entre elas
             (paralelismo de verdade), ou UMA DELAS não está na tabela
             ("outros": forro de gesso, ar-condicionado, elevador, sondagem —
             20,9% das etapas reais). No segundo caso a frase de antes
             afirmava o paralelismo, e ainda imprimia `undefined` no lugar do
             nome. Agora diz o que é, e NÃO promete dia nenhum. */
          var pr = (conhecida(catP) && conhecida(alvo.cat)) ? par(catP, alvo.cat) : null;
          var semMatriz = !conhecida(catP) || !conhecida(alvo.cat);
          if (semMatriz) desconhecidas++;
          res.paralelismos.push({ tipo: semMatriz ? "fora-da-matriz" : "independente", nivel: g.nivel,
            aId: pid, aNum: D.numPorId[pid] || "?", aNome: pn ? pn.nome : "", catA: catP,
            bId: g.alvoId, bNum: g.alvoNum, bNome: g.alvoNome, catB: alvo.cat,
            heuristica: !semMatriz, foraDaMatriz: semMatriz,
            porque: semMatriz
              ? "a matriz não fala de " + nomeCat(catP, pn && pn.nome) + " — ela NÃO diz que " +
                nomeCat(catP, pn && pn.nome) + " e " + nomeCat(alvo.cat, alvo.nome) +
                " podem andar juntas, só que não sabe. Decidir a sequência de um serviço que a tabela não conhece é o que este módulo promete não fazer: confira você."
              : ((catP !== alvo.cat && !(pr && pr.depende))
                ? nomeCat(catP, pn && pn.nome) + " e " + nomeCat(alvo.cat, alvo.nome) + " não têm precedência entre si na matriz — hoje estão em fila só por causa da ordem da planilha"
                : "hoje " + g.alvoNum + " espera " + (D.numPorId[pid] || "?") + " só pela ordem da planilha; a matriz não exige essa espera"),
            dias: semMatriz ? null : S.dias, medido: semMatriz ? false : !!S.medido,
            fechaLacoSozinha: S.fechaLaco === true,
            porqueNaoMedido: semMatriz
              ? "a matriz não conhece esta categoria — nenhum dia é prometido aqui"
              : (S.medido ? null : S.porqueNaoMedido) });
        });
        sobre.forEach(function (e) {
          res.paralelismos.push({ tipo: "sobreposicao", nivel: g.nivel,
            aId: e.predId, aNum: e.predNum, aNome: e.predNome, catA: e.de,
            bId: g.alvoId, bNum: g.alvoNum, bNome: g.alvoNome, catB: alvo.cat,
            heuristica: true, foraDaMatriz: false,
            porque: e.porque, lag: e.aplicado.lag,
            dias: S.dias, medido: !!S.medido, fechaLacoSozinha: S.fechaLaco === true,
            porqueNaoMedido: S.medido ? null : S.porqueNaoMedido });
        });
      });
      if (naoMedidos) res.avisos.push(naoMedidos + " ligação(ões) ficaram sem medição individual (teto de " + max + " por chamada) — a economia TOTAL continua medida");
      if (desconhecidas) res.avisos.push(desconhecidas + " espera(s) foram soltas contra um nó que a matriz NÃO conhece (\"outros\") — elas saem sem número de dias e precisam de conferência humana; a matriz não decidiu a sequência desse nó.");
      res.paralelismos.sort(function (a, b) { return (b.dias == null ? -1 : b.dias) - (a.dias == null ? -1 : a.dias); });
      return res;
    },

    /* ================= CONFERIR =================
       Olha um cronograma JÁ MONTADO e aponta o que contraria a matriz.
       Duas lentes, porque elas pegam coisas diferentes:
        (1) o ELO ESCRITO ao contrário — "a alvenaria depende da pintura" —
            que é erro de topologia e continua errado mesmo que as datas
            pareçam boas hoje;
        (2) as DATAS desenhadas — pintura terminando antes de o reboco
            começar — que é o que a pessoa vê no Gantt.
       Gravidade: "grave" inversão completa (uma frente inteira antes da que
       a precede), "alta" começar antes do começo da predecessora, "media"
       sobreposição onde a matriz diz que não pode haver.

       ⚠ "GRAVE" SÓ COM ELO DIRETO E CONFIANÇA ALTA. Medido nos orçamentos
       reais: `conferir` produzia 247 achados, 155 deles "grave", em 29 de 55
       orçamentos (até 22 num só) — e NENHUM dos 247 trazia a palavra
       "heurística" na `msg`, que é o campo redigido para ser lido. Palpite
       editorial com vocabulário de regra, 155 vezes, é a formalidade que a
       pessoa aprende a ignorar (a mesma memória do "erro educado esconde
       defeito"). Duas correções: toda `msg` nasce com o carimbo da
       heurística, como o `motivoDe` do `sugerir` já fazia; e um elo HERDADO
       (a precedência existe por transitividade, com a confiança já rebaixada
       por 0,85) não é da mesma família do "o plano não fecha" — ele cai para
       "alta" e a frase diz por onde a precedência passa. */
    conferir: function (orc, r, opts) {
      opts = opts || {};
      var res = { ok: false, heuristica: true, achados: [],
        resumo: { grave: 0, alta: 0, media: 0, total: 0 }, naoAvaliados: [], nos: 0, pares: 0 };
      if (!orc || !arr(orc.etapas).length) { res.erro = "orçamento sem etapas"; return res; }
      var R = rDe(orc, r);
      if (!R) { res.erro = "o motor do cronograma (Cronograma.estimar) não está disponível — sem as datas dele não há o que conferir"; return res; }
      var D = coletarNos(orc, R), grupos = [];
      grupos.push({ nivel: "etapa", nos: D.etapas });
      chaves(D.porEtapa).forEach(function (eid) { grupos.push({ nivel: "folha", nos: D.porEtapa[eid] }); });
      /* carimbo + procedência do elo, na MESMA frase que a tela imprime.
         `p` é o par da matriz; `alta` é a gravidade proposta pela lente. */
      function carimbo(p) {
        return "Sequência de obra (heurística, confira" +
          (p && p.direto === false
            ? "; precedência HERDADA" + (arr(p.via).length ? " por " + p.via.map(function (v) { return NOME[v]; }).join(", ") : "") + ", confiança " + p.conf
            : "") + "): ";
      }
      /* ⚠ a escala não pode chamar de "grave" o que a matriz só supõe. */
      function gravidadeDe(p, proposta) {
        if (proposta !== "grave") return proposta;
        return (p && p.direto === true && num(p.conf) >= 0.9) ? "grave" : "alta";
      }
      function poe(a) {
        res.achados.push(a);
        res.resumo[a.gravidade] = (res.resumo[a.gravidade] || 0) + 1;
        res.resumo.total++;
      }
      grupos.forEach(function (G) {
        var porId = {};
        G.nos.forEach(function (n) { porId[n.id] = n; });
        G.nos.forEach(function (n) {
          res.nos++;
          if (!n.cat || n.cat === "outros") {
            res.naoAvaliados.push({ nivel: G.nivel, id: n.id, num: n.num, nome: n.nome,
              porque: "sem categoria reconhecida (\"outros\") — a matriz não fala deste serviço" });
          }
        });
        // (1) elo escrito ao contrário da matriz
        G.nos.forEach(function (n) {
          if (!n.cat || n.cat === "outros" || n.marco) return;
          arr(n.predsHoje).forEach(function (pid) {
            var p = porId[pid];
            if (!p || !p.cat || p.cat === "outros" || p.marco) return;
            if (p.cat === n.cat) return;
            var inv = par(n.cat, p.cat);
            if (!inv || !inv.depende) return;
            /* ⚠ `de` é SEMPRE quem deveria vir antes, nos dois tipos de
               achado — senão a tela leria o mesmo campo com dois sentidos. */
            poe({ tipo: "elo-invertido", gravidade: gravidadeDe(inv, "grave"), nivel: G.nivel,
              de: { id: n.id, num: n.num, nome: n.nome, cat: n.cat, catNome: nomeCat(n.cat, n.nome) },
              para: { id: p.id, num: p.num, nome: p.nome, cat: p.cat, catNome: nomeCat(p.cat, p.nome) },
              dias: null, heuristica: true, conf: inv.conf, direto: inv.direto, via: arr(inv.via).slice(),
              porque: inv.porque,
              msg: carimbo(inv) + n.num + " (" + nomeCat(n.cat, n.nome) + ") está escrito como dependente de " + p.num + " (" + nomeCat(p.cat, p.nome) + "), e na obra é o contrário: " + inv.porque });
          });
        });
        // (2) as datas desenhadas contra a matriz
        G.nos.forEach(function (a) {
          if (!a.cat || a.cat === "outros" || a.marco) return;
          G.nos.forEach(function (b) {
            if (a === b || !b.cat || b.cat === "outros" || b.marco) return;
            var p = par(a.cat, b.cat);
            if (!p || !p.depende) return;
            res.pares++;
            var achou = null;
            var nA = nomeCat(a.cat, a.nome), nB = nomeCat(b.cat, b.nome);
            if (b.fim <= a.inicio) {
              achou = { tipo: "inversao", gravidade: gravidadeDe(p, "grave"), dias: a.inicio - b.fim,
                msg: carimbo(p) + b.num + " (" + nB + ") termina " + (a.inicio - b.fim) + " dia(s) útil(eis) ANTES de " + a.num + " (" + nA + ") começar — e " + nA + " vem antes: " + p.porque };
            } else if (b.inicio < a.inicio) {
              achou = { tipo: "comeca-antes", gravidade: "alta", dias: a.inicio - b.inicio,
                msg: carimbo(p) + b.num + " (" + nB + ") começa " + (a.inicio - b.inicio) + " dia(s) útil(eis) antes de " + a.num + " (" + nA + ") — e " + nA + " vem antes: " + p.porque };
            } else if (p.lag === 0 && b.inicio < a.fim) {
              achou = { tipo: "sobreposicao-proibida", gravidade: "media", dias: a.fim - b.inicio,
                msg: carimbo(p) + b.num + " (" + nB + ") começa " + (a.fim - b.inicio) + " dia(s) antes de " + a.num + " (" + nA + ") terminar, e neste elo a obra não permite sobreposição: " + p.porque };
            }
            if (!achou) return;
            achou.nivel = G.nivel; achou.heuristica = true; achou.conf = p.conf;
            achou.direto = p.direto; achou.via = arr(p.via).slice();
            achou.ambigua = p.ambigua; achou.porque = p.porque;
            achou.de = { id: a.id, num: a.num, nome: a.nome, cat: a.cat, catNome: nomeCat(a.cat, a.nome) };
            achou.para = { id: b.id, num: b.num, nome: b.nome, cat: b.cat, catNome: nomeCat(b.cat, b.nome) };
            poe(achou);
          });
        });
      });
      var peso = { grave: 3, alta: 2, media: 1 };
      res.achados.sort(function (x, y) {
        var d = peso[y.gravidade] - peso[x.gravidade];
        if (d) return d;
        return (num(y.dias) - num(x.dias)) || 0;
      });
      var teto = num(opts.max) > 0 ? num(opts.max) : 200;
      if (res.achados.length > teto) { res.cortados = res.achados.length - teto; res.achados = res.achados.slice(0, teto); }
      res.ok = true;
      return res;
    },

    aplicarEmCopia: aplicarEmCopia,
    token: token,
    _ordenarTopologicamente: ordenarTopologicamente,
    _nomeCat: nomeCat
  };

  /* =====================================================================
     PENDÊNCIAS DE FIAÇÃO (arquivo de OUTRA frente — não toquei)

     1) js/iaedit.js · `validar` → honrar `ligacao.dependeDe`.
        HOJE: `res.dependencias[idx]` só nasce de REFERÊNCIA a nó novo
        (`novo:N`, js/iaedit.js `A.dependeDe.push(X.refMeta[eRef].idx)`), e
        `fechoDesmarcar` arrasta o fecho a partir dela. A máquina existe
        inteira — só não há como um chamador DECLARAR a dependência.
        PEDIDO: aceitar `op.dependeDe = [idx, …]` (índices na mesma lista de
        ops) e somá-lo a `A.dependeDe`. CONTRATO: índices da própria lista,
        menores que o índice da op, sem repetição; fora disso, recusar a op
        inteira (não ignorar calado).
        POR QUE: sem isso a pessoa desmarca a op 1 e a op 5 — que só é válida
        DEPOIS da 1 — segue marcada, é aplicada e o produto a recusa com
        "cria dependência circular". Medido antes da ordem topológica: 65 de
        174 ligações fechavam laço aplicadas sozinhas, em 27 de 55
        orçamentos. A ordem topológica resolve o caso "marcar tudo"; o
        `dependeDe` é o que resolve o caso "marcar parte".
        ENQUANTO NÃO HOUVER: `sugerir` devolve `ligacoes[].dependeDe` e
        `ligacoes[].sozinha.fechaLaco`, e a TELA tem de usar os dois — caixa
        que fecha laço sozinha nasce desmarcada, ou arrasta as companheiras.

     2) js/cronograma.js · elo entre folhas de etapas DIFERENTES.
        `_redeInterna` roda por etapa (`own(porId, …)`), então um elo
        cruzado vira `[]` sem aviso. A matriz sabe que "reboco do 2º
        pavimento depende da laje do 3º", e este módulo não tem como
        propor isso enquanto o motor não aceitar.
     ===================================================================== */

  global.CronoSeq = CronoSeq;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoSeq;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * cronograma.js — "Cérebro" do Cronograma (agente de planejamento)
 * Lê cada composição, classifica por categoria de serviço, estima o tempo
 * (produtividade por categoria + custo de mão de obra) e monta um Gantt
 * PARAMETRIZADO e EDITÁVEL (o usuário ajusta durações/parâmetros).
 * Lógica pura/testável — sem dependências externas.
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
  function norm(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  /* lista que não é lista vira [] — a mesma régua do `Util.arr` que o
     `Orcamento.calcular` usa; sem ela a árvore EAP e a planilha numerariam
     diferente uma etapa com `subetapas: {}` (forma torta que já existe). */
  function arr(v) { return Array.isArray(v) ? v : []; }
  // chave própria: id "constructor"/"toString" não pode achar o protótipo
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function meiaNoite(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  /* ---- planejador 1A: ajudantes do motor integrado (§2.3–§2.7) ---- */
  function ehObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  // mapa de verdade: lista ou escalar no lugar de mapa vale como ausente (a forma que voltou torta do sync)
  function mapaDe(o, k) { var m = ehObj(o) ? o[k] : null; return ehObj(m) ? m : null; }
  function temChave(m) { if (!ehObj(m)) return false; for (var k in m) if (own(m, k)) return true; return false; }
  function rasa(o) { var c = {}; for (var k in o) if (own(o, k)) c[k] = o[k]; return c; }
  /* "AAAA-MM-DD" → ms da meia-noite LOCAL, ou null. ⚠ Data que não existe
     no calendário (30/02) também é null: o `new Date(2026, 1, 30)` rolaria
     para março calado, e um piso cairia dois dias depois do digitado. */
  function msDeData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? "" : s).slice(0, 10));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d.getTime() : null;
  }
  // n dias CORRIDOS depois (pelo calendário, nunca por 86.400.000 ms: horário de verão)
  function maisDias(ms, n) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  function chMs(ms) { var d = new Date(ms); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function brMs(ms) { var d = new Date(ms); return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); }
  // máximo/mínimo que ignoram o "sem valor" (null)
  function maxN(a, b) { return a == null ? b : (b == null ? a : Math.max(a, b)); }
  function minN(a, b) { return a == null ? b : (b == null ? a : Math.min(a, b)); }

  // Base de produtividade (unidades por EQUIPE-DIA) + cor p/ o Gantt
  var CATS = [
    { id: "preliminares", nome: "Preliminares/Canteiro", cor: "#64748b", prod: 20, kw: ["barracao", "tapume", "placa de obra", "ligacao provis", "mobiliz", "administ", "canteiro", "limpeza do terreno", "locacao de obra", "gabarito"] },
    { id: "demolicao", nome: "Demolição/Remoção", cor: "#9ca3af", prod: 22, kw: ["demolic", "remoc", "remoç", "retirada", "demol"] },
    { id: "terraplenagem", nome: "Movimento de terra", cor: "#a16207", prod: 28, kw: ["escava", "aterro", "reaterro", "terraplen", "bota-fora", "bota fora", "compactac", "apiloamento"] },
    { id: "fundacao", nome: "Fundação", cor: "#7c3aed", prod: 6, kw: ["fundac", "sapata", "estaca", "baldrame", "broca", "tubulao", "tubulão", "coroamento", "radier", "viga baldrame"] },
    { id: "estrutura", nome: "Estrutura/Concreto", cor: "#2563eb", prod: 9, kw: ["concreto", "pilar", "viga", "laje", "forma", "fôrma", "armadura", "aco ca", "aço ca", "armacao", "ferragem", "escoramento"] },
    { id: "alvenaria", nome: "Alvenaria", cor: "#dc2626", prod: 14, kw: ["alvenaria", "parede", "bloco ceram", "bloco de concreto", "tijolo", "vedacao", "vedação", "mureta", "muro"] },
    { id: "cobertura", nome: "Cobertura", cor: "#0891b2", prod: 24, kw: ["cobertura", "telha", "telhado", "madeiramento", "trama", "cumeeira", "rufo", "calha"] },
    { id: "impermeabilizacao", nome: "Impermeabilização", cor: "#0d9488", prod: 20, kw: ["impermeabiliz", "manta asf", "membrana", "asfaltic", "asfáltic"] },
    { id: "instalacoes", nome: "Instalações", cor: "#ca8a04", prod: 16, kw: ["instalac", "eletric", "elétric", "hidraul", "hidrául", "tubo", "eletrod", "fio", "cabo", "tomada", "ponto de", "esgoto", "agua fria", "água fria", "dreno", "quadro de", "disjuntor", "luminaria", "luminária"] },
    { id: "revestimento", nome: "Revestimentos", cor: "#16a34a", prod: 16, kw: ["revestiment", "reboco", "emboco", "emboço", "chapisco", "massa unica", "massa única", "ceramic", "cerâmic", "porcelanato", "azulejo", "piso", "contrapiso", "regulariz", "rodape", "rodapé", "soleira"] },
    { id: "esquadrias", nome: "Esquadrias", cor: "#db2777", prod: 6, kw: ["porta", "janela", "esquadria", "caixilho", "vidro", "batente", "fechadura", "portao", "portão", "guarda-corpo", "corrimao", "corrimão"] },
    { id: "loucas", nome: "Louças/Metais", cor: "#8b5cf6", prod: 8, kw: ["louca", "louça", "bacia", "lavator", "lavató", "metais", "torneira", "registro", "sifao", "sifão", "valvula", "válvula", "cuba", "pia", "tanque", "ducha", "chuveiro"] },
    { id: "pintura", nome: "Pintura", cor: "#f59e0b", prod: 34, kw: ["pintura", "tinta", "textura", "massa corrida", "selador", "verniz", "esmalte", "latex", "látex", "fundo prepar"] },
    { id: "limpeza", nome: "Limpeza final", cor: "#22c55e", prod: 60, kw: ["limpeza final", "limpeza geral", "limpeza permanente", "entrega da obra"] }
  ];

  var Cronograma = {
    CATS: CATS,
    /* ⚠ `descontarFeriados` NASCE LIGADO, e isso muda a data de entrega de
       orçamentos que já existiam. É de propósito: a data de antes estava
       ERRADA — contava Natal, Carnaval e Sexta-feira Santa como dia de obra —
       e essa data ia impressa na proposta comercial como promessa ao cliente.
       Uma obra de um ano atravessa uns 12 feriados; o prazo saía quase duas
       semanas e meia otimista. Quem trabalha em feriado desmarca na aba, e a
       tela conta quantos foram descontados para o número ser conferível. */
    /* ⚠ `opcionaisNoPrazo` — A ETAPA OPCIONAL NO PRAZO (12/09/2026, defeito D4).
       Ligado (o padrão DESTE MOTOR) é o comportamento de sempre: a etapa
       marcada `opcional` entra na duração, na rede e no caminho crítico.
       Desligado, ela sai do prazo: fica no array com `duracao: 0` e
       `foraDoPrazo: true`, o elo padrão a PULA, e o total passa a ser o do
       escopo CONTRATADO — com `totalDiasComOpcionais`/`dataFimComOpcionais` ao
       lado, para a tela mostrar os dois números.

       POR QUE ISSO É UM DEFEITO. O preço já separa o opcional
       (`precoObrigatorio`, js/orcamento.js:1046), a linha de base já pergunta
       quais opcionais entram (js/cronoplan.js:876) e o PDF já marca "opcional"
       (js/cronopdf.js:373). Só a DATA não separava: a entrega impressa na
       proposta contava um escopo que o "Valor total" não cobra. MEDIDO numa
       fixture com 1 etapa opcional: 70 dias úteis com ela, 31 sem — e ela saía
       no `caminhoCritico`.

       ⚠ POR QUE O MOTOR NASCE LIGADO E NÃO DESLIGADO. A decisão de produto é o
       contrário — o prazo padrão é o do escopo contratado, opcional FORA —, e
       o blast radius dela é zero na base da RA: MEDIDO em 12/09/2026 nos 34
       arquivos de OrcaPRO-Backups, 0 de 51 orçamentos distintos têm
       `e.opcional`. ⚠ A RÉGUA DA CONTAGEM VAI JUNTO porque foi ela que mudou o
       número: 51 é a contagem por md5 do JSON inteiro do orçamento, que é o
       que tools/test-crono-honestidade.js (bloco 6) imprime; por `id` dariam
       22. Uma revisão anterior escreveu "55" aqui de cabeça — número escrito de
       cabeça é número errado, e num arquivo de regras ele é obedecido. Mas o padrão do
       MOTOR não pode carregar essa decisão: `tools/test-cronograma-paridade.js`
       compara toda a saída com o master b8907ef em 15 fixtures + 500 gerados
       (a fixture `bdi-final-negativo-opcional-estouro` e ~8% dos gerados TÊM
       etapa opcional), e mudar o número no caminho padrão é exatamente o que a
       trava existe para impedir nas 38 instalações. Então o interruptor nasce
       aqui no número de hoje e o PADRÃO DE PRODUTO é da fiação: quem monta a
       tela grava `orc.cronograma.params.opcionaisNoPrazo = false`. Fora da
       base da RA vale o precedente do `descontarFeriados` logo abaixo — nasce
       ligado na tela, com o motivo escrito e os dois números conferíveis. */
    DEFAULTS: {
      equipes: 1, diasUteisSemana: 5, custoDiaEquipe: 700, paralelismo: 0.15, dataInicio: null,
      descontarFeriados: true, feriadosFacultativos: true, feriadosExtras: null,
      opcionaisNoPrazo: true
    },

    classificar: function (desc) {
      // FASE 1.3: numa descrição de serviço PT-BR a 1ª palavra é o SERVIÇO e o
      // resto é o objeto ("DEMOLIÇÃO de alvenaria" = demolição; "ALVENARIA de
      // blocos de concreto" = alvenaria). Vence o match mais perto do INÍCIO;
      // empate de posição -> keyword mais longa (mais específica); depois ordem CATS.
      var d = norm(desc), melhor = null, melhorPos = Infinity, melhorLen = 0;
      for (var i = 0; i < CATS.length; i++) {
        var c = CATS[i];
        for (var k = 0; k < c.kw.length; k++) {
          var kw = c.kw[k], pos = d.indexOf(kw);
          if (pos === -1) continue;
          if (pos < melhorPos || (pos === melhorPos && kw.length > melhorLen)) {
            melhor = c; melhorPos = pos; melhorLen = kw.length;
          }
        }
      }
      return melhor;
    },
    cat: function (id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { id: "outros", nome: "Outros", cor: "#94a3b8", prod: 12 }; },

    // Tempo de 1 item em EQUIPE-DIAS
    estimarItem: function (it, params) {
      var cat = this.classificar(it.descricao);
      var qtd = num(it.quantidade), ed;
      if (cat && cat.prod && qtd > 0 && !/^(vb|verba|%)$/i.test(String(it.unidade || "").trim())) {
        ed = qtd / cat.prod;
      } else {
        var mo = num(it.custoMO) * qtd;
        if (!mo) mo = num(it.custoUnitario) * qtd * 0.35; // sem quebra: assume 35% MO
        ed = mo / (params.custoDiaEquipe || 700);
      }
      return { equipeDias: ed, categoria: cat ? cat.id : "outros" };
    },

    /* "1,3" digitado na coluna "Depende de" -> ids de etapa. Vive no MOTOR
       (e não no app.js) para o parse ter teste puro — fiação fina.
         ""        -> preds null  (padrão: depende da etapa anterior)
         "0" / "-" -> preds []    (sem predecessora: começa no dia 0)
         "1,3"     -> [id da 1ª, id da 3ª etapa da lista]
         "1+7"     -> depende da 1ª com ESPERA de 7 dias úteis (cura de concreto,
                      secagem de reboco); "1-3" -> começa 3 dias ANTES do fim da
                      1ª (avanço). O lag sai em `lags[id]` e substitui, naquele
                      elo, a sobreposição automática do paralelismo — quem
                      escreveu "1+0" quis "só depois que a 1ª terminar", e o
                      motor não pode desfazer isso em silêncio.
       Token inválido (nº fora da lista, auto-referência, texto, lag não inteiro)
       sai em `invalidos` e NUNCA vira []: gravar "sem predecessora" no lugar de
       um erro de digitação mudaria o cronograma em silêncio. */
    parsePreds: function (txt, ordemIds, selfId, opts) {
      // ⚠ SEM o 4º argumento, a saída de hoje, linha a linha (a paridade e a 1.2.81 leem assim)
      if (opts) return this._parseRede(txt, "etapa", { ordem: ordemIds, selfId: selfId, opts: opts });
      var s = String(txt == null ? "" : txt).trim();
      if (!s) return { preds: null, lags: {}, invalidos: [] };
      if (s === "0" || s === "-") return { preds: [], lags: {}, invalidos: [] };
      var preds = [], lags = {}, invalidos = [];
      s.split(/[,;\s]+/).forEach(function (tk) {
        if (!tk) return;
        var m = /^(\d+)(?:([+\-])(\d+))?$/.exec(tk);
        var n = m ? parseInt(m[1], 10) : 0;
        var id = (n >= 1 && n <= ordemIds.length) ? ordemIds[n - 1] : null;
        if (!id || id === selfId) { invalidos.push(tk); return; }
        if (preds.indexOf(id) < 0) preds.push(id);
        if (m[2]) lags[id] = (m[2] === "-" ? -1 : 1) * parseInt(m[3], 10);
      });
      return { preds: preds.length ? preds : null, lags: lags, invalidos: invalidos };
    },

    /* O inverso do parse: a rede EFETIVA de uma etapa de volta ao texto que a
       pessoa digitaria ("1+7,3"). Usado pela tabela, pelo Excel e pelo PDF —
       um só lugar para o formato, senão cada tela inventa o seu. */
    predsTexto: function (et, numPorId, opts) {
      /* planejador 1A (EXTRAS): `opts.extras` = os elos das tarefas sem preço
         que seguram a etapa ({i, t, l}, ou o `et.porExtras` do motor), escritos
         depois como "T1", "T2II+2" — `numPorId` traz o "T" de cada id */
      if (opts && Array.isArray(opts.extras) && opts.extras.length) {
        var baseT = Array.isArray(opts.elos) ? this._textoRede(opts.elos, numPorId, { vazioExplicito: false })
          : this.predsTexto(et, numPorId);
        if (baseT === "" && et && et.predsExplicito) baseT = "0";   // "0,T1": sem etapa predecessora, só a T1 (O23)
        var xs = opts.extras.map(function (x) { return { i: x.i != null ? x.i : x.id, t: x.t || x.tipo || "TI", l: x.l != null ? x.l : (x.lag || 0), x: true }; });
        var tx = this._textoRede(xs, numPorId);
        return baseT ? baseT + "," + tx : tx;
      }
      if (opts && Array.isArray(opts.elos)) return this._textoRede(opts.elos, numPorId, opts);
      if (!et || !et.preds || !et.preds.length) {
        var soCruz = this._elosLegiveis(this.elosDoNo(et), numPorId);
        if (soCruz) return this._textoRede(soCruz, numPorId, { vazioExplicito: false });
        return et && et.predsExplicito ? "0" : "";
      }
      /* ⚠ COM REDE DIGITADA, O TEXTO SAI DA REDE — NUNCA DO `predLag`.
         Roteiro do defeito, medido em 21/09/2026 na e2e-planejador-completo
         (passo 1, galpão): a pessoa digita "11TT+2,9" no "Depende de" da 12,
         o disco guarda {i:e8,t:"TT",l:2} e a CÉLULA volta escrita "11-12,9".
         `predLag`/`predDesloc` são, por contrato (§1.8, O20), o deslocamento
         EQUIVALENTE DE TI — o número que a 1.2.81 usa para chegar à mesma
         data; num TT+2 entre etapas de 10 e 4 dias ele vale −12. Escrito aqui,
         diz ao leitor o CONTRÁRIO do que ele digitou. Quem lê por esta função:
         a célula da grade, a dica da barra do Gantt, a tabela da aba
         (`CronoExecUI`) e a tabela do orçamento (`js/ui.js`) — quatro telas, e
         o PDF (que já saía certo pelo `CronoPDF._dependeDe`) contra elas.
         Sem rede (`elosDoNo` devolve []), o texto é o de sempre, byte a byte. */
      var elosR = this._elosLegiveis(this.elosDoNo(et), numPorId);
      if (elosR) return this._textoRede(elosR, numPorId, { vazioExplicito: false });
      return et.preds.map(function (p) {
        var lag = et.predLag && et.predLag[p];
        return numPorId[p] + (lag != null ? (lag < 0 ? "-" + (-lag) : "+" + lag) : "");
      }).join(",");
    },

    /* =================================================================
       textoDependeDe — o texto EDITÁVEL do "Depende de" de uma etapa do
       RESULTADO do motor: a rede dela MAIS as tarefas sem preço que a seguram
       (`et.porExtras`, com o nº T de cada uma).
       ⚠ É O QUE A CÉLULA TEM DE MOSTRAR, porque é o que a pessoa corrige e
         devolve. A grade do Gantt, a tabela da aba e a tabela do orçamento
         mostravam só `predsTexto` ("2+0,3+0"), sem a T1 — e o caminho único
         da digitação (`GanttUI.opsDaDigitacao`) lê o texto devolvido sem T1
         como "tirar a T1": a pessoa que só corrigia a espera da 3 soltava a
         etapa 4 da aprovação do cliente, calada (e2e-planejador-completo,
         [2.celula-e4]/[2.ida-volta], 22/09/2026). O23: "a digitação aceita
         o texto que a tela mostra" — então a tela mostra o texto inteiro.
       Sem T que segure: o texto de sempre, só quando o "Depende de" foi
       digitado (vazio = a cascata implícita, que o placeholder ensina).
       Com T e cascata implícita: só "T1" — que, digitado de volta, é "a
       cascata continua e a T1 segura" (O23), exatamente o que está gravado.
       ================================================================= */
    textoDependeDe: function (et, numPorId) {
      if (!et) return "";
      var xs = arr(et.porExtras).filter(function (x) { return x && x.id != null; });
      if (!xs.length) return et.predsExplicito ? this.predsTexto(et, numPorId) : "";
      var num = {}, k;
      for (k in (numPorId || {})) if (own(numPorId, k)) num[k] = numPorId[k];
      xs.forEach(function (x) { if (x.numero != null) num[x.id] = x.numero; });
      return this.predsTexto(et.predsExplicito ? et : { preds: [], predsExplicito: false }, num, { extras: xs });
    },

    /* =================================================================
       elosDoNo — os elos de um nó do RESULTADO do motor na régua do tipo
       ({i, t, l}), ou [] quando o nó não tem rede digitada.
       Régua única do "Depende de" escrito a partir do resultado: a tela
       (`predsTexto`/`predsTextoSub`) e o papel (`CronoPDF._dependeDe`) leem
       daqui. Com duas cópias da regra, um TT+2 sai "TT+2" numa e "-12" na
       outra (memória "réplica de parser apodrece").
       ⚠ Inclui o ELO CRUZADO (O26): a ligação com uma subetapa de OUTRA etapa
       mora só em `predTipoRede`/`predLagTipo` — `preds` continua com ids de
       etapa (I3). Sem o segundo laço, "5.2TT" sumia do texto e a etapa
       aparecia dependendo de nada.
       ================================================================= */
    /* os elos só valem como TEXTO se todo id deles tem número no mapa de quem
       chama: sem isso o "Depende de" sairia "11TT+2,?" — e "?" numa coluna
       que a pessoa usa para conferir a rede é pior que o texto antigo. Nesse
       caso devolve null e quem chama fica com o de sempre (o elo cruzado que
       não resolve continua sem aparecer, como hoje).
       `opts.etapasNum` (subetapa) também resolve: de lá sai "E5". */
    _elosLegiveis: function (elos, numPorId, opts) {
      if (!elos || !elos.length) return null;
      var en = (opts && opts.etapasNum) || {};
      for (var i = 0; i < elos.length; i++) {
        var k = elos[i].i;
        if (own(en, k)) continue;
        if (!numPorId || numPorId[k] == null) return null;
      }
      return elos;
    },

    elosDoNo: function (no) {
      if (!no) return [];
      var tR = no.predTipoRede || null, lT = no.predLagTipo || null;
      if (!tR && !lT) return [];
      function lagDe(p) { return (lT && lT[p] != null) ? lT[p] : null; }
      var vistos = {}, elos = [];
      arr(no.preds).forEach(function (p) {
        vistos[p] = 1;
        elos.push({ i: p, t: (tR && tR[p]) || (no.predTipo && no.predTipo[p] === "II" ? "II" : "TI"), l: lagDe(p) });
      });
      [tR, lT].forEach(function (mp) {
        if (!mp) return;
        for (var k in mp) {
          if (!own(mp, k) || own(vistos, k)) continue;
          vistos[k] = 1;
          elos.push({ i: k, t: (tR && tR[k]) || "TI", l: lagDe(k) });
        }
      });
      return elos;
    },

    _params: function (orc, p) {
      var d = {}, k;
      for (k in this.DEFAULTS) d[k] = this.DEFAULTS[k];
      if (orc && orc.cronograma && orc.cronograma.params) for (k in orc.cronograma.params) if (orc.cronograma.params[k] != null) d[k] = orc.cronograma.params[k];
      if (p) for (k in p) if (p[k] != null) d[k] = p[k];
      /* ⚠ o regime que o calendário realmente usa (ver diasSemanaEfetivo):
         sem isto, 1 a 4 gravado dava datas de 5 e semanas de 4 */
      d.diasUteisSemana = this.diasSemanaEfetivo(d.diasUteisSemana);
      return d;
    },

    /* `feriados` é o mapa {"2026-12-25": "Natal"} — opcional para não quebrar
       os chamadores antigos (execucao.js, gestao.js), que passam 3 argumentos.
       ⚠ A GUARDA DE 10 ANOS não é paranoia: um mapa que marcasse todos os dias
       (extras digitados errado, ou 7 dias/semana com feriado em cada um) faria
       este laço rodar para sempre e travar a aba do orçamento. */
    addDiasUteis: function (start, n, diasSemana, feriados) {
      diasSemana = diasSemana || 5;
      var d = new Date(start.getTime()), add = 0, giros = 0, lim = 3660 + n * 3;
      while (add < n && giros++ < lim) {
        d.setDate(d.getDate() + 1);
        if (this.diaUtil(d, diasSemana, feriados)) add++;
      }
      return d;
    },

    // chave local "AAAA-MM-DD" (nunca toISOString: em UTC-3 ele volta um dia)
    _ch: function (d) {
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    },

    /* =================================================================
       DIAS ÚTEIS POR SEMANA: SÓ 5, 6 OU 7 (16/09/2026)
       ⚠ O CALENDÁRIO SÓ CONHECE TRÊS REGIMES: `diaUtil` logo abaixo folga
       sábado e domingo (5), só domingo (6) ou nenhum dia (7). Qualquer outro
       número cai no ramo de 5.
       Roteiro do defeito: a tela aceitava de 1 a 7 e gravava o número
       digitado. Com 4, as DATAS saíam do calendário de 5 dias e as SEMANAS do
       `totalSemanas` (dias ÷ 4): medido na obra de demonstração, "73 dias
       úteis (~19 semanas)" com as mesmas datas que no regime de 5 dão ~15 —
       prazo contraditório na tela que alimenta a proposta, que ainda escrevia
       "4 dias por semana" ao lado das datas de 5.
       ⚠ POR QUE TRAVAR E NÃO MODELAR 1 A 4: seriam dias de folga a escolher
       (qual dia para?) em seis consumidores que repetem a regra — `diaUtil`,
       `Execucao._diasUteisEntre`, o calendário do XML do MS Project, as
       semanas do Gantt, do Excel e do PDF — mais a paridade com o master
       b8907ef. Quem para mais dias lança esses dias como feriado local.
       `diasSemanaEfetivo` devolve o número que o calendário REALMENTE usa, e
       `_params` o aplica: quem já gravou 1 a 4 passa a ver as mesmas datas de
       sempre com as semanas e o texto da proposta concordando com elas.
       ⚠ SÓ NÚMERO. O texto "6" o calendário também lê como 5 (a comparação
       ali é `=== 6`), mas a paridade com o master sorteia esse texto de
       propósito e cobra a saída de antes, bit a bit — e o formulário sempre
       gravou número (parseInt). Mexer nele é outra decisão, com outra prova. */
    diasSemanaEfetivo: function (v) {
      if (typeof v !== "number" || !isFinite(v)) return v;
      return v >= 7 ? 7 : (v === 6 ? 6 : 5);   // 0 e negativo também são 5 no calendário (`|| 5`)
    },
    /* O que a pessoa DIGITOU no campo "Dias/sem." → {ok, valor, erro}.
       Vazio = null (o motor usa o padrão, 5). Acima de 7 continua virando 7,
       como sempre foi (7 = obra sem folga; tools/test-crono-fiacao.js cobra
       isso). Abaixo de 5, fração que não é 5/6/7 e texto são RECUSADOS com o
       motivo — nunca trocados calados por 5, que seria gravar um número
       diferente do digitado sem dizer. */
    validarDiasSemana: function (txt) {
      var s = String(txt == null ? "" : txt).trim();
      if (s === "") return { ok: true, valor: null, erro: "" };
      var n = Number(s.replace(",", "."));
      var porque = "o calendário do OrçaPRO conta 5 (folga sábado e domingo), 6 (folga só domingo) ou 7 (sem folga). " +
        "Com outro número as datas sairiam como 5 dias e as semanas pelo número digitado, e a proposta mostraria um prazo que não fecha. " +
        "Se a obra para mais dias, use 5 e lance os dias parados em Feriados locais.";
      if (!isFinite(n)) return { ok: false, valor: null, erro: "Dias úteis por semana: “" + s + "” não é número. Use 5, 6 ou 7 — " + porque };
      if (n > 7) return { ok: true, valor: 7, erro: "" };
      if (n !== 5 && n !== 6 && n !== 7) return { ok: false, valor: null, erro: "Dias úteis por semana aceita só 5, 6 ou 7 (você digitou " + s + "): " + porque };
      return { ok: true, valor: n, erro: "" };
    },

    diaUtil: function (d, diasSemana, feriados) {
      var wd = d.getDay();
      if (diasSemana >= 7) { /* obra 7x7: só feriado para */ }
      else if (diasSemana === 6) { if (wd === 0) return false; }
      else if (wd === 0 || wd === 6) return false;
      return !(feriados && feriados[this._ch(d)]);
    },

    /* O mapa de feriados que cobre uma obra: do ano do início até o ano do fim
       (com folga de 1). Sem o módulo `Feriados` carregado, devolve vazio — o
       cronograma degrada para o comportamento antigo em vez de quebrar. */
    _feriadosDe: function (params, ini, totalDias) {
      var vazio = { mapa: {}, lista: [], invalidos: [] };
      if (!params.descontarFeriados) return vazio;
      var F = (typeof Feriados !== "undefined") ? Feriados : (typeof global !== "undefined" ? global.Feriados : null);
      if (!F || !F.entre) return vazio;
      var dpw = params.diasUteisSemana || 5;
      var corridos = Math.ceil((totalDias || 0) * (7 / dpw)) + 30;
      var fim = new Date(ini.getTime()); fim.setDate(fim.getDate() + corridos);
      var r = F.entre(ini.getFullYear(), fim.getFullYear() + 1, params.feriadosExtras, params.feriadosFacultativos !== false);
      return { mapa: F.mapa(r.lista), lista: r.lista, invalidos: r.invalidos };
    },

    /* =================================================================
       DISTRIBUIÇÃO NO TEMPO — mês a mês, seguindo o Gantt de verdade.
       Base do desembolso (quanto sai por mês) e do histograma de frentes
       (quantas equipes a obra exige ao mesmo tempo).

       ⚠ POR QUE ISTO EXISTE. A régua antiga (`Orcamento.cronograma`) fatiava
       o valor pela ORDEM e pelo PESO das etapas, sem olhar a duração: uma
       estrutura de 350 dias e uma limpeza de 6 caíam no mesmo tamanho de
       fatia. O desembolso saía com dinheiro em mês onde não havia serviço, e
       com mês de pico aparecendo no lugar errado — justamente o número que o
       cliente usa para planejar o caixa dele.

       ⚠ E É "FRENTES", NÃO "HOMENS". O motor sabe quantos DIAS-EQUIPE cada
       etapa consome, não de quantas pessoas a equipe é feita. Chamar isto de
       histograma de mão de obra seria inventar um número que ninguém informou;
       o que sai é quantas frentes precisam estar abertas ao mesmo tempo.
       ================================================================= */
    periodos: function (r, opts) {
      opts = opts || {};
      /* ⚠ camada OMITIDA (ou "etapa") = o código de sempre, intocado: é o que
         a proposta, o Excel, o `Orcamento.cronograma` e o Portal leem, e a
         paridade com o master b8907ef cobra isso. As camadas detalhadas vivem
         em `_periodosCamada`, com valores de venda OBRIGATÓRIOS. */
      if (opts.camada && opts.camada !== "etapa") return this._periodosCamada(r, opts);
      if (!r || !r.etapas || !r.etapas.length || !r.dataInicio) return { lista: [], total: 0 };
      var self = this, dpw = (r.params && r.params.diasUteisSemana) || 5;
      var fer = (r.feriados && r.feriados.mapa) || {};
      var valores = opts.valores || null;   // {etapaId: valor} — sem isso, o custo da etapa
      var y0 = r.dataInicio.getFullYear(), m0 = r.dataInicio.getMonth();
      function bal(d) { return (d.getFullYear() - y0) * 12 + (d.getMonth() - m0); }
      /* ⚠ A RÉGUA VAI ATÉ A ÚLTIMA ETAPA, NÃO ATÉ O FIM CONTRATADO (12/09/2026).
         Com `opcionaisNoPrazo` desligado a etapa opcional tem duração 0 e o
         `maiorFim` a tira do `totalDias` — então a data dela pode cair DEPOIS
         do último mês da régua, e o laço abaixo só soma quando o mês existe
         (`if (lista[bm])` / `if (lista[bi])`). Resultado MEDIDO na fixture
         `rNia` de tools/test-crono-honestidade.js (opcional fixada em
         01/12/2026): total DECLARADO R$ 82.400,00, soma das COLUNAS
         R$ 39.200,00 — R$ 43.200,00 (52,4% do orçamento) sumiam CALADOS, a
         curva fechava em 47,57% e a linha do desembolso saía com total próprio
         e meses [0,0]. Não precisa de restrição: um "1+60" de espera na coluna
         "Depende de" faz igual.
         ⚠ E NÃO SE USA O CLAMP DO `_periodosCamada`: empilhar o valor no
         último mês contratado troca um buraco por uma mentira (dinheiro num mês
         em que não há serviço). Os meses entre o fim contratado e o opcional
         saem com 0 valor e 0 dia útil, que é a verdade.
         ⚠ SÓ COM `r.opcionais` — a chave nasce apenas com o interruptor
         desligado E etapa opcional no orçamento. No caminho de sempre esta
         linha devolve `r.dataFim` e a saída sai bit a bit igual (a paridade
         com o master b8907ef cobra isso). */
      var fimReg = r.dataFim;
      if (r.opcionais) r.etapas.forEach(function (e) { if (e.dataFim && e.dataFim > fimReg) fimReg = e.dataFim; });
      var nMax = Math.max(1, bal(fimReg) + 1), lista = [], i;
      var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      for (i = 0; i < nMax; i++) {
        var dRef = new Date(y0, m0 + i, 1);
        lista.push({ i: i, ano: dRef.getFullYear(), mes: dRef.getMonth(),
          rotulo: MES[dRef.getMonth()] + "/" + String(dRef.getFullYear()).slice(2),
          valor: 0, equipeDias: 0, diasUteis: 0, frentes: 0, etapas: [] });
      }
      /* ⚠ AQUI O DIA A DIA FICA, E ISSO FOI MEDIDO (12/09/2026). A auditoria
         propôs trocar este laço (e o das etapas, abaixo) pela tabela
         `Cronograma.calendario`, como se fez no `estimar`. FEITO E MEDIDO —
         e a troca sai MAIS LENTA, em todas as cinco fixturas:

           periodos, ms          dia a dia   pela tabela
           8 etapas · 1.390 d ..... 1,06 ....... 2,22
           30 etapas · 1.539 d .... 1,77 ....... 2,10
           50 etapas · 1.706 d .... 1,33 ....... 2,71
           100 etapas paralelas ... 2,23 ....... 2,66   (diaUtil 8.787 → 88)

         Contar chamadas de `diaUtil()` NÃO é medir: mesmo com 100× menos
         chamadas o relógio subiu. O motivo é a diferença entre os dois
         lugares. No `estimar`, cada `addDiasUteis` refazia a varredura DESDE
         O DIA 0, três vezes por etapa — a tabela amortiza isso (é quadrático
         virando linear). Aqui cada etapa anda só o PRÓPRIO trecho, uma vez:
         não há nada para amortizar, e `cal.dia(k)` (chamada de closure +
         guarda + um `new Date` por dia) custa mais do que andar o dia.
         Antes de trocar isto, meça — tools/test-crono-desempenho.js, bloco 4,
         imprime os dois números. */
      // dias úteis de cada mês DENTRO da obra (denominador do histograma)
      var cur = new Date(r.dataInicio.getTime());
      while (cur < r.dataFim) {
        if (self.diaUtil(cur, dpw, fer)) { var b = bal(cur); if (lista[b]) lista[b].diasUteis++; }
        cur.setDate(cur.getDate() + 1);
      }
      var total = 0, porEtapa = {};
      r.etapas.forEach(function (e) {
        var col = []; for (var z = 0; z < nMax; z++) col.push(0);
        porEtapa[e.id] = col;
        var v = valores ? (valores[e.id] || 0) : (e.custo || 0);
        total += v;
        var dias = Math.max(0, e.duracao || 0);
        if (!dias) {   // marco: o evento inteiro cai no dia dele
          var bm = bal(e.dataInicio);
          if (lista[bm]) { lista[bm].valor += v; col[bm] += v; if (lista[bm].etapas.indexOf(e.id) < 0) lista[bm].etapas.push(e.id); }
          return;
        }
        // ⚠ pela mesma medição do ⚠ lá em cima, este laço também fica dia a dia
        var vDia = v / dias, edDia = (e.equipeDias || 0) / dias;
        var d = new Date(e.dataInicio.getTime()), contados = 0, giros = 0;
        while (contados < dias && giros++ < dias * 8 + 400) {
          if (self.diaUtil(d, dpw, fer)) {
            var bi = bal(d);
            if (lista[bi]) {
              lista[bi].valor += vDia; lista[bi].equipeDias += edDia; col[bi] += vDia;
              if (lista[bi].etapas.indexOf(e.id) < 0) lista[bi].etapas.push(e.id);
            }
            contados++;
          }
          d.setDate(d.getDate() + 1);
        }
      });
      var acum = 0;
      lista.forEach(function (p) {
        // frentes simultâneas MÉDIAS do mês: dias-equipe ÷ dias de trabalho do mês
        p.frentes = p.diasUteis ? Math.round((p.equipeDias / p.diasUteis) * 10) / 10 : 0;
        acum += p.valor;
        p.acum = acum;
        p.pct = total ? (p.valor / total) * 100 : 0;
        p.acumPct = total ? (acum / total) * 100 : 0;
      });
      var pico = lista.reduce(function (m, p) { return p.frentes > (m ? m.frentes : -1) ? p : m; }, null);
      return { lista: lista, total: total, meses: lista.length, porEtapa: porEtapa,
        picoFrentes: pico ? pico.frentes : 0, mesPico: pico };
    },

    /* PREVISTO × REALIZADO, alinhados pelo MÊS-CALENDÁRIO.

       ⚠ O EIXO É A ARMADILHA. O painel da obra desenhava o planejado em
       colunas "Mês 1..N" (fatias do orçamento) e jogava o realizado em blocos
       de 30,44 dias contados a partir de `obra.inicio`. Duas réguas de tempo
       no mesmo gráfico: bastava a obra começar num mês diferente do previsto
       para as curvas ficarem deslocadas e a leitura "estamos atrasados" ser um
       artefato do eixo. Aqui as duas se casam por "AAAA-MM", que é a única
       chave que as duas fontes têm em comum.

       ⚠ E NÃO SE PROJETA REALIZADO NO FUTURO. Mês sem lançamento HERDA o
       acumulado anterior (avanço não anda sozinho, mas também não volta);
       depois do último mês com dado, o realizado é `null` — e null vira
       "não medido" na tela, não zero. Zero ali desenharia uma queda a pique
       na curva do cliente.

       `real` = periodos de `Fisico.serieMes` ({chave:"2026-09", pctAcumulado}). */
    confronto: function (per, real) {
      if (!per || !per.lista || !per.lista.length) return null;
      var mapa = {}, ultimoMes = "";
      ((real && real.periodos) || real || []).forEach(function (p) {
        if (!p || p.pctAcumulado == null) return;
        var k = String(p.chave || "").slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(k)) return;
        mapa[k] = p.pctAcumulado;
        if (k > ultimoMes) ultimoMes = k;
      });
      var temReal = !!ultimoMes, herda = null, linhas = [];
      per.lista.forEach(function (p) {
        var k = p.ano + "-" + ("0" + (p.mes + 1)).slice(-2);
        var rv = null;
        if (temReal && k <= ultimoMes) {
          if (mapa[k] != null) herda = mapa[k];
          rv = herda;   // mês sem lançamento fica no acumulado anterior
        }
        linhas.push({ rotulo: p.rotulo, chave: k, previsto: p.acumPct,
          realizado: rv, desvio: rv == null ? null : Math.round((rv - p.acumPct) * 10) / 10 });
      });
      var atual = null;
      for (var i = linhas.length - 1; i >= 0; i--) { if (linhas[i].realizado != null) { atual = linhas[i]; break; } }
      return {
        linhas: linhas, temReal: temReal, mesAtual: atual,
        desvio: atual ? atual.desvio : null,
        situacao: !atual ? "sem medição" : (atual.desvio >= 1 ? "adiantada" : (atual.desvio <= -1 ? "atrasada" : "no prazo"))
      };
    },

    /* =================================================================
       CRONOGRAMA EXECUTIVO (espec v2, 11/09/2026) — a árvore da planilha
       (etapa → subetapa → serviço) dentro do Gantt.

       ⚠ AS TRÊS REGRAS QUE SEGURAM AS 38 INSTALAÇÕES
        1) `estimar(orc)` e `estimar(orc, override)` — sem o 3º argumento —
           continuam sendo o código de antes, linha a linha. A árvore só nasce
           com `ctx.eap === true`, DEPOIS de o resultado de etapa estar pronto,
           e nunca escreve nele. `tools/test-cronograma-paridade.js` compara
           com o master b8907ef em 515 orçamentos; `r.etapas` fica 1:1 com
           `orc.etapas` (cinco consumidores casam por ÍNDICE com o sintético).
        2) NENHUMA DATA DEPENDE DO `ctx`. O ctx só acrescenta número EAP,
           valor e peso. Proposta, PDF, desembolso, Portal, Last Planner e o
           aparelho com versão antiga chamam SEM ctx: se a data de um nó
           dependesse dele, cada tela imprimiria uma entrega diferente para a
           mesma obra. Por isso o serviço sem equipe-dias se distribui pelo
           CUSTO DIRETO que o motor já calcula, nunca por `ctx.valores`.
        3) O modo executivo é lido AO VIVO pelo `estimar` (adendo A1,
           11/09/2026): com `exec.rede === true`, a etapa com folhas dura o vão
           S da rede interna calculado na hora — a MESMA conta do
           `materializar` (`_vaosExec`) —, ignorando `duracoes[etapaId]`. Com
           `exec.rede` desligado nenhuma linha disso roda (I2, a paridade).
           ⚠ POR QUE AO VIVO: 22 lugares gravam o orçamento sem passar pelo
           `App.persistir` (reprecificação em lote, assistente, EAP do BIM,
           importação...). Com o vão só materializado, PDF, proposta, desembolso
           e Portal mostravam o vão VELHO até alguém salvar pela aba.
           O `materializar` continua gravando S com a marca "subetapas" — é o
           que faz o aparelho com a versão ANTIGA (que só conhece `duracoes`)
           dar a mesma data —, mas a data da versão nova não depende dele.
           `tools/test-crono-vivo.js` prova: novo sem materializar === master
           lendo o materializado.

       Os mapas novos moram SEPARADOS dos de etapa (I3): `orc.cronograma.sub`
       ({duracoes, marcos, predecessoras, lags, tipos, equipes, agente,
       iaMotivos}, chaveados por id de FOLHA) e o interruptor em
       `orc.cronograma.exec` — FORA de `params`, porque o "Recalcular" das
       versões antigas SUBSTITUI `params` inteiro e apagaria o modo calado.
       ================================================================= */
    ROTULO_SOLTOS: "Serviços gerais da etapa",
    ROTULO_CAMADA: "distribuição pelo cronograma executivo — pode diferir mês a mês do desembolso da proposta",
    DETALHES: ["etapa", "subetapa", "servico"],

    /* Árvore EAP ACHATADA, na ordem da planilha. O FILTRO de quem desenha é
       por TIPO/PAPEL, nunca pela profundidade: serviço solto de etapa sem
       subetapa fica na mesma profundidade de uma subetapa, e filtrar por nível
       punha 40 serviços no Gantt de todo orçamento sem subetapa.
         etapa    — papel "resumo" se tem folhas, senão "folha" (a própria
                    etapa é a folha da rede e os serviços penduram nela)
         subetapa — subetapa COM itens (vazia não vira nó: não tem número na
                    planilha e não tem o que durar); papel "folha"
         soltos   — os itens sem subetapa de uma etapa que TAMBÉM tem
                    subetapa; id `etapaId + "~g"`, nº `N.g` (token reservado:
                    "2.1" já é o 1º serviço solto, então o grupo não tinha número
                    nem como ser citado no "Depende de" ou no MS Project)
         servico  — item; `semBase` quando quantidade ≤ 0 ou `qtdPendente`
       Numeração: a de `Orcamento.calcular` quando `calc` vier (fonte única);
       sem ela, a MESMA regra copiada (contador compartilhado: soltos 1..n,
       subetapas depois; subetapa vazia não gasta número). A cópia é cobrada
       contra o `calcular` real em tools/test-cronograma-executivo.js. */
    eap: function (orc, calc) {
      var self = this, lista = [], numLinha = {}, numGrupo = {}, temCalc = !!(calc && Array.isArray(calc.linhas));
      if (temCalc) {
        calc.linhas.forEach(function (L) { if (L) numLinha[L.etapaIdx + "|" + L.itemIdx] = L.numero; });
        arr(calc.grupos).forEach(function (g) { if (g) numGrupo[g.etapaIdx + "|" + g.subEtapaId] = g.numero; });
      }
      arr(orc && orc.etapas).forEach(function (e, ei) {
        var en = String(ei + 1), subs = arr(e.subetapas), itens = arr(e.itens);
        var valido = {}, nItensSub = {}, nSoltos = 0, numSub = {}, cnt = {}, seq = 0, seq2;
        subs.forEach(function (s) { valido[s.id] = true; nItensSub[s.id] = 0; });
        itens.forEach(function (it) { if (it.subEtapaId && valido[it.subEtapaId]) nItensSub[it.subEtapaId]++; else nSoltos++; });
        seq2 = nSoltos;
        subs.forEach(function (s) {
          if (nItensSub[s.id]) { seq2++; numSub[s.id] = en + "." + seq2; } else numSub[s.id] = "";
          cnt[s.id] = 0;
        });
        var soltos = [], porSub = {};
        itens.forEach(function (it, ii) {
          var sid = (it.subEtapaId && valido[it.subEtapaId]) ? it.subEtapaId : "";
          var numero = sid ? numSub[sid] + "." + (++cnt[sid]) : en + "." + (++seq);
          if (temCalc && numLinha[ei + "|" + ii] != null) numero = numLinha[ei + "|" + ii];
          var q = num(it.quantidade);
          /* `subEtapaGravada`: o subEtapaId COMO ESTÁ no item, mesmo quando a
             subetapa não existe mais (aí o item conta como solto, `subEtapaId`
             ""). É o rastro que o previsto × realizado usa para achar os
             serviços de uma subetapa da linha de base que foi apagada depois —
             sem ele, "reagrupada" e "removida" eram a mesma coisa e o IDP da
             obra caía para menos da metade com os serviços executados. */
          var no = { id: it.id != null ? it.id : e.id + "~i" + ii, tipo: "servico", papel: "servico", paiId: null,
            etapaId: e.id, etapaIdx: ei, subEtapaId: sid, subEtapaGravada: it.subEtapaId ? String(it.subEtapaId) : "",
            itemId: it.id != null ? it.id : null, itemIdx: ii,
            numero: numero, nome: it.descricao || "", codigo: it.codigo || "", unidade: it.unidade || "",
            quantidade: q, semBase: !(q > 0) || !!it.qtdPendente, prof: 2 };
          if (sid) { if (!own(porSub, sid)) porSub[sid] = []; porSub[sid].push(no); } else soltos.push(no);
        });
        var folhas = [], vistos = {};
        subs.forEach(function (s, si) {
          if (!nItensSub[s.id] || own(vistos, s.id)) return;
          vistos[s.id] = true;
          var ng = temCalc ? numGrupo[ei + "|" + s.id] : null;
          folhas.push({ id: s.id, tipo: "subetapa", papel: "folha", paiId: e.id, etapaId: e.id, etapaIdx: ei,
            subEtapaId: s.id, subIdx: si, itemId: null, numero: ng ? ng : numSub[s.id], nome: s.nome || "Sub etapa",
            unidade: "", quantidade: null, prof: 1, filhos: [], _serv: porSub[s.id] || [] });
        });
        var etNo = { id: e.id, tipo: "etapa", papel: folhas.length ? "resumo" : "folha", paiId: null, etapaId: e.id,
          etapaIdx: ei, subEtapaId: "", itemId: null, numero: en, nome: e.nome || "", codigo: e.codigo || "",
          unidade: "", quantidade: null, opcional: !!e.opcional, prof: 0, filhos: [] };
        lista.push(etNo);
        function pendura(pai, servs, prof) {
          servs.forEach(function (sv) { sv.paiId = pai.id; sv.prof = prof; pai.filhos.push(sv.id); lista.push(sv); });
        }
        if (!folhas.length) { pendura(etNo, soltos, 1); return; }
        if (soltos.length) {
          var g = { id: e.id + "~g", tipo: "soltos", papel: "folha", paiId: e.id, etapaId: e.id, etapaIdx: ei,
            subEtapaId: "", itemId: null, numero: en + ".g", nome: self.ROTULO_SOLTOS, unidade: "", quantidade: null, prof: 1, filhos: [] };
          etNo.filhos.push(g.id); lista.push(g); pendura(g, soltos, 2);
        }
        folhas.forEach(function (f) {
          var sv = f._serv; delete f._serv;
          etNo.filhos.push(f.id); lista.push(f); pendura(f, sv, 2);
        });
      });
      return lista;
    },

    /* equipe-dias, categoria e custo direto de UM item — o `estimarItem` de
       sempre, sem mudança, mais a FONTE do número (I7: a tela rotula o que é
       heurística de categoria e o que é custo de MO ÷ R$/dia-equipe). O custo
       é interno: serve de peso para distribuir serviço sem equipe-dias e para
       escolher a cor da folha — ⚠ nunca sai no nó (vai para documento do
       cliente). */
    _itemEd: function (it, params) {
      var r = this.estimarItem(it, params), q = num(it.quantidade), base = q > 0 && !it.qtdPendente;
      var ed = isFinite(r.equipeDias) ? r.equipeDias : 0;
      var porCat = r.categoria !== "outros" && q > 0 && !/^(vb|verba|%)$/i.test(String(it.unidade || "").trim());
      return { ed: base ? ed : 0, categoria: r.categoria, custo: base ? q * num(it.custoUnitario) : 0, base: base,
        fonte: !base ? "semBase" : (porCat ? "categoria" : (num(it.custoMO) * q ? "custoMO" : "custoEstimado")) };
    },

    /* paralelismo INTERNO (entre folhas da mesma etapa): `exec.paralelismoSub`
       quando informado, senão o da obra. Preso a [0; 0,9] — o de etapa não é
       preso (paridade), mas aqui um valor torto não pode abrir vão negativo. */
    _parSub: function (orc, params) {
      var ex = (orc && orc.cronograma && orc.cronograma.exec) || {}, v = ex.paralelismoSub;
      var n = (v != null && v !== "") ? num(v) : num(params && params.paralelismo);
      return Math.max(0, Math.min(0.9, n || 0));
    },

    /* O CONTEXTO DA ÁRVORE — `{nos, P}` (a EAP achatada mais o `_preparar`
       dela), memoizado DENTRO DE UMA CHAMADA de `estimar`.

       POR QUE EXISTE (12/09/2026). Com `exec.rede` ligado + `ctx.eap`,
       `eap()` e `_preparar()` rodavam DUAS vezes por `estimar`: o `_vaosExec`
       monta a árvore inteira para achar o vão da rede interna e o `_arvore` a
       monta de novo logo em seguida. MEDIDO no motor de 11/09: a 3.000
       serviços o `estimar(eap+rede)` custava 267,06 ms; a 11.250, 1.153 ms —
       com metade da conta jogada fora.

       ⚠ NUNCA ENTRE CHAMADAS. O memo é uma lista LOCAL, criada em cada
       `estimar` e esquecida no fim. `estimar` é chamado com `override`
       diferente (o Last Planner passa `obra.inicio`; um cenário passa 3
       equipes), e o `_vaosExec` usa params GRAVADOS DE PROPÓSITO — o aparelho
       com a versão anterior lê o vão MATERIALIZADO, que não sabe de override.
       Memo que atravessasse chamadas devolveria a árvore de outro cenário.

       ⚠ A CHAVE CARREGA OS PARAMS POR VALOR — menos os do CALENDÁRIO, que são
       lista preta declarada (ver `PARAMS_CALENDARIO` abaixo). Chavear por "os
       params que hoje importam" apodrece calada no dia em que `_preparar`
       passar a ler mais um: a conta velha voltaria com cara de nova. `orc` e
       `calc` entram por IDENTIDADE — dois objetos iguais em conteúdo só PERDEM
       o memo (refazem a conta), nunca devolvem a conta de outro orçamento.
       A invariante que isto não pode quebrar está executada em
       tools/test-crono-desempenho.js, bloco 5 (o vão sai dos params gravados,
       a folha sai dos params do override).

       ⚠ OS NÓS SÃO ESCRITOS pelo `_arvore` (ele pendura duração, data, cor e
       fonte em cada nó). Quem viesse DEPOIS dele na mesma chamada receberia
       os nós já preenchidos — hoje não há ninguém: o `_vaosExec` roda ANTES e
       só lê. E AGORA A ÁRVORE É COMPARTILHADA entre duas entradas do memo
       (ver os DOIS NÍVEIS abaixo), o que continua seguro pelo MESMO motivo: só
       o `_arvore` escreve, e ele roda uma vez, por último. Quem acrescentar um
       segundo escritor precisa reler esta linha antes de qualquer outra. */
    _contexto: function (mem, orc, params, calc, semPiso) {
      var ch = this._chaveParams(params), i, e, nos = null;
      semPiso = !!semPiso;
      calc = calc || null;
      if (mem) for (i = 0; i < mem.length; i++) {
        e = mem[i];
        if (e.orc !== orc || e.calc !== calc) continue;
        /* ⚠ DOIS NÍVEIS (12/09/2026). A ÁRVORE não depende de `params`:
           `eap(orc, calc)` lê etapas, subetapas e itens, e `calc` muda só a
           NUMERAÇÃO. Com um nível só, qualquer override fazia chave nova e a
           árvore inteira nascia DE NOVO. MEDIDO num orçamento de 20 etapas ·
           160 subetapas · 1.280 serviços (modo executivo + ctx.eap, média de
           20 com aquecimento): sem override eap()=1×, _preparar()=1×,
           16,56 ms; com `{dataInicio}` eap()=2×, _preparar()=2×, 25,12 ms
           (+52%). E `{dataInicio}` é o override do PLANO DE EXECUÇÃO DA OBRA —
           js/cronoplan.js (congelar a linha de base), js/app.js e
           js/cronosaude.js passam exatamente esse. Agora a árvore é
           reaproveitada por (orc, calc) e só o `_preparar` refaz. */
        nos = e.nos;
        if (e.semPiso === semPiso && e.ch === ch) return e;
      }
      if (!nos) nos = this.eap(orc, calc);
      e = { orc: orc, calc: calc, semPiso: semPiso, ch: ch, nos: nos, P: this._preparar(orc, params, nos, semPiso) };
      if (mem) mem.push(e);
      return e;
    },

    /* ⚠ OS PARAMS QUE SÃO DO CALENDÁRIO, E NUNCA DO TRABALHO (12/09/2026).
       Lista PRETA declarada, usada só na chave do memo do `_contexto`. O que o
       `_preparar` realmente lê é `equipes`, `paralelismo` e `custoDiaEquipe`
       (este por baixo, no `_itemEd` → `estimarItem`), mais `exec.paralelismoSub`,
       que nem está em `params`. Estes seis mexem em DATA, não em quanto
       trabalho cada folha tem — e mantê-los na chave fazia o override mais
       comum do produto (`{dataInicio}`) perder o memo inteiro por nada: MEDIDO,
       a linha de base de 1.280 serviços caía de 21,53 para 29,28 ms (+36%) só
       por causa disso.
       ⚠ LISTA PRETA APODRECE CALADA, e por isso ela NÃO fica só escrita:
       tools/test-crono-desempenho.js (bloco 5b) roda `_preparar` com DOIS
       valores diferentes de CADA um destes seis, sobre a MESMA árvore, e exige
       saída idêntica. No dia em que o `_preparar` passar a ler um deles aquele
       assert cai — e a correção é tirar o nome DAQUI, nunca "ajustar" o teste. */
    PARAMS_CALENDARIO: ["dataInicio", "diasUteisSemana", "descontarFeriados", "feriadosFacultativos", "feriadosExtras", "opcionaisNoPrazo"],

    /* Os params em texto, chaves em ordem — a chave do memo acima, MENOS os do
       calendário (⚠ acima). O tipo entra junto do valor: sem ele `1` e `"1"`
       (ou `null` e `"null"`) dariam a mesma chave, e o cenário do chamador
       comeria o do orçamento. */
    _chaveParams: function (p) {
      var ks = [], out = [], k, i, v, fora = this.PARAMS_CALENDARIO;
      for (k in p) if (own(p, k) && fora.indexOf(k) < 0) ks.push(k);
      ks.sort();
      for (i = 0; i < ks.length; i++) {
        v = p[ks[i]];
        out.push(ks[i] + "=" + (v && typeof v === "object" ? "o:" + JSON.stringify(v) : typeof v + ":" + String(v)));
      }
      return out.join("");
    },

    /* Agrupa a árvore por etapa e roda a REDE INTERNA de cada etapa com
       folhas. `semPiso` = a mesma rede sem o arredondamento (duração
       fracionária, sem o mínimo de 1 dia) — é o que separa, no "antes →
       depois", o efeito da rede do efeito de arredondar cada subetapa. */
    _preparar: function (orc, params, nos, semPiso) {
      var self = this, cron = (orc && orc.cronograma) || {}, sub = (cron.sub && typeof cron.sub === "object") ? cron.sub : {};
      var subDur = sub.duracoes || {}, subMarco = sub.marcos || {}, subEq = sub.equipes || {}, subAg = sub.agente || {};
      var parSub = this._parSub(orc, params), eqPadrao = num(params && params.equipes) > 0 ? num(params.equipes) : 1;
      var grupos = [], gE = null, gF = null, infos = [];
      /* ⚠ TODAS as folhas do orçamento, com o número EAP e a etapa de cada uma
         — é o que deixa o `_redeInterna` DIZER por que recusou um elo. Ele roda
         por etapa e só enxerga as folhas da própria; sem este mapa ele não tem
         como distinguir "a subetapa 2.1 é de outra etapa" de "essa subetapa não
         existe mais", e as duas saíam iguais: caladas (defeito D6). */
      var folhaDe = {};
      nos.forEach(function (n) {
        if (n.tipo === "subetapa" || n.tipo === "soltos") folhaDe[n.id] = { numero: n.numero, nome: n.nome, etapaIdx: n.etapaIdx, etapaId: n.etapaId };
      });
      /* ⚠ E O ÍNDICE DE **TODOS** OS NÓS, PREGUIÇOSO (12/09/2026). Sem ele,
         `folhaDe` só conhece folhas e TUDO que não é folha caía no motivo
         `inexistente`: EXECUTADO com `sub.predecessoras = {b1:["e2"], b2:["j3"]}`
         — um id de ETAPA e um id de SERVIÇO, os dois EXISTINDO no orçamento —
         os dois produziam "aponta para uma subetapa que não existe mais". A
         pessoa digitou um número EAP que está na tela e o sistema disse que ele
         não existe: é o "erro educado esconde defeito" com o diagnóstico
         trocado justamente para quem acertou o número.
         ⚠ PREGUIÇOSO DE PROPÓSITO: são 12.250 nós num orçamento de escala
         executiva, e elo recusado é raro (0 dos 51 orçamentos reais têm
         `sub.predecessoras` gravado). Montar o mapa em toda chamada pagaria uma
         passada extra sobre a árvore inteira para um caso que quase nunca
         acontece; a função monta UMA vez, na primeira recusa, e nunca se o
         orçamento estiver são. */
      var noDe = null;
      function idxNo() {
        if (!noDe) { noDe = {}; nos.forEach(function (n) { if (!own(noDe, n.id)) noDe[n.id] = n; }); }
        return noDe;
      }
      nos.forEach(function (n, i) {
        if (n.tipo === "etapa") { gE = { i: i, no: n, folhas: [], servicos: [] }; gF = null; grupos.push(gE); return; }
        if (n.tipo === "subetapa" || n.tipo === "soltos") { gF = { i: i, no: n, servicos: [] }; gE.folhas.push(gF); return; }
        infos[i] = self._itemEd(arr(orc.etapas[n.etapaIdx].itens)[n.itemIdx], params);
        (gF ? gF.servicos : gE.servicos).push(i);
      });
      grupos.forEach(function (g) {
        if (!g.folhas.length) return;
        g.folhasRede = g.folhas.map(function (gf) {
          var id = gf.no.id, ed = 0, temBase = false, catC = {};
          gf.servicos.forEach(function (i) {
            var x = infos[i]; if (!x.base) return;
            temBase = true; ed += x.ed; catC[x.categoria] = (catC[x.categoria] || 0) + x.custo;
          });
          var marco = own(subMarco, id) && subMarco[id] === true;
          var ov = own(subDur, id) ? num(subDur[id]) : 0;
          var eq = own(subEq, id) && num(subEq[id]) >= 1 ? num(subEq[id]) : eqPadrao, dur, fonte;
          if (marco) { dur = 0; fonte = "marco"; }
          // duração digitada manda (inteira: a pessoa lê dias, e fração aqui viraria vão fracionário materializado)
          else if (ov > 0) { dur = Math.max(1, Math.round(ov)); fonte = (own(subAg, id) && (subAg[id] === "ia" || subAg[id] === "exec")) ? subAg[id] : "usuario"; }
          else if (temBase) { dur = semPiso ? ed / eq : Math.max(1, Math.ceil(ed / eq)); fonte = "estimado"; }
          else { dur = semPiso ? 0 : 1; fonte = "semBase"; }
          return { id: id, dur: dur, marco: marco, override: !marco && ov > 0, ov: ov, eq: eq, ed: ed, temBase: temBase,
            fonte: fonte, catC: catC, g: gf };
        });
        g.rede = self._redeInterna(g.folhasRede, sub, parSub, semPiso, folhaDe, idxNo);
      });
      // `noDe` é FUNÇÃO (o índice preguiçoso acima), não mapa: quem usar chama.
      return { grupos: grupos, infos: infos, parSub: parSub, folhaDe: folhaDe, noDe: idxNo };
    },

    /* CPM entre as folhas de UMA etapa — o mesmo algoritmo da rede externa
       (ida por Kahn, volta, folga), com um tipo a mais: "II" (início-início,
       `ini_s ≥ ini_p + lag`). Padrão = cascata (cada folha depois da anterior
       da etapa), com sobreposição `floor(paralelismoSub × dur_anterior)`.
       ⚠ ELO QUE NÃO CABE NESTA REDE NÃO MORRE MAIS CALADO (12/09/2026,
       defeito D6). A rede é POR ETAPA, então `porId` só tem as folhas da
       própria etapa e um elo para folha de OUTRA etapa virava `[]` sem uma
       linha de aviso — "o reboco do 2º pavimento depende da laje do 3º" é
       exatamente esse caso, e é o que a obra real tem. O elo continua NÃO
       sendo aplicado (aceitá-lo aqui mudaria datas, e o elo macro é da etapa),
       mas agora sai em `rede.invalidos` com o motivo, e o `_arvore` vira isso
       num recado com a PORTA. Elo que some calado é pior que elo recusado: a
       pessoa desenha a dependência, o Gantt desenha outra coisa, e ninguém
       tem como saber. `folhaDe` (o mapa de TODAS as folhas do orçamento,
       montado no `_preparar`) é quem separa "é de outra etapa" de "não existe
       mais" — dois defeitos com consertos diferentes.
       ⚠ Ciclo NÃO trava: quem sobra entra em ordem de lista ignorando o elo
       não resolvido, sai `cicloDep` e a tela avisa. */
    /* `Hi` (7º argumento, planejador T1): null = a rede interna de hoje. Com
       `Hi`, a 1A passa os elos com os quatro tipos, a capacidade por folha, o
       avanço e a base absoluta, e recebe as posições absolutas (espec §2.2).
       ⚠ ONDA 0: ninguém passa `Hi`, e ele é ignorado. */
    _redeInterna: function (fs, sub, parSub, semPiso, folhaDe, noDe, Hi) {
      void Hi;
      var porId = {}, pc = sub.predecessoras || {}, lc = sub.lags || {}, tc = sub.tipos || {}, invalidos = [];
      fs.forEach(function (f) { porId[f.id] = f; });
      /* ⚠ QUATRO MOTIVOS, NÃO DOIS — consertos diferentes, recados diferentes.
         `folhaDe` só conhece FOLHAS, então tudo que não é folha (etapa,
         serviço) saía como "não existe mais". `noDe` é a função preguiçosa do
         `_preparar` e só roda aqui, na recusa: `outraEtapa` é o D6 de verdade
         ("ligue as ETAPAS"); `etapa` e `servico` são número EAP que EXISTE na
         tela e a pessoa pôs no campo errado; `inexistente` é o que sobrou de
         uma subetapa apagada. */
      function motivoDe(f, pid) {
        if (pid === f.id) return "propria";
        if (folhaDe && own(folhaDe, pid)) return "outraEtapa";
        var mapa = typeof noDe === "function" ? noDe() : noDe;
        var alvo = mapa && own(mapa, pid) ? mapa[pid] : null;
        if (alvo && alvo.tipo === "etapa") return "etapa";
        if (alvo && alvo.tipo === "servico") return "servico";
        return "inexistente";
      }
      fs.forEach(function (f, i) {
        var cfg = own(pc, f.id) ? pc[f.id] : null, out = [], k, pid;
        f.predsExplicito = Object.prototype.toString.call(cfg) === "[object Array]";
        if (f.predsExplicito) {
          for (k = 0; k < cfg.length; k++) {
            pid = cfg[k];
            if (pid !== f.id && own(porId, pid)) { if (out.indexOf(pid) < 0) out.push(pid); continue; }
            invalidos.push({ folhaId: f.id, predId: pid, motivo: motivoDe(f, pid) });
          }
        } else if (i > 0) out.push(fs[i - 1].id);
        f.preds = out; f.predLag = {}; f.predTipo = {};
        var lf = own(lc, f.id) && lc[f.id] ? lc[f.id] : {}, tf = own(tc, f.id) && tc[f.id] ? tc[f.id] : {};
        out.forEach(function (pid) {
          var l = own(lf, pid) ? lf[pid] : null;
          // lag só se for número de verdade: "x" virar 0 desligaria a sobreposição calado
          if (typeof l === "number" ? isFinite(l) : /^\s*[+\-]?\d+([.,]\d+)?\s*$/.test(String(l == null ? "" : l))) f.predLag[pid] = Math.round(num(l));
          f.predTipo[pid] = String(own(tf, pid) ? tf[pid] : "").toUpperCase() === "II" ? "II" : "TI";
        });
      });
      function sobre(p) { return semPiso ? parSub * p.dur : Math.floor(parSub * p.dur); }
      function desloc(p, s) {
        var l = s.predLag[p.id];
        if (s.predTipo[p.id] === "II") return l != null ? l : 0;
        return l != null ? l : -sobre(p);
      }
      var indeg = {}, succ = {}, ordem = [], fila = [];
      fs.forEach(function (f) { indeg[f.id] = f.preds.length; succ[f.id] = []; });
      fs.forEach(function (f) { f.preds.forEach(function (p) { succ[p].push(f.id); }); });
      fs.forEach(function (f) { if (!indeg[f.id]) fila.push(f.id); });
      while (fila.length) {
        var at = fila.shift(); ordem.push(at);
        succ[at].forEach(function (s) { if (--indeg[s] === 0) fila.push(s); });
      }
      var ciclo = [];
      if (ordem.length < fs.length) fs.forEach(function (f) { if (ordem.indexOf(f.id) < 0) { f.cicloDep = true; ciclo.push(f.id); ordem.push(f.id); } });
      var feito = {}, self = this;
      // o corpo do laço é o `_passoInterno` (uma cópia só, ver lá)
      ordem.forEach(function (id) { self._passoInterno(porId[id], porId, desloc, null, feito); });
      var S = fs.reduce(function (m, f) { return Math.max(m, f.fim); }, 0);
      for (var vi = ordem.length - 1; vi >= 0; vi--) {
        var fv = porId[ordem[vi]], lfim = S;
        succ[fv.id].forEach(function (sid) {
          var s = porId[sid];
          if (s.folga == null || s.predsResolvidos.indexOf(fv.id) < 0) return;
          var d = desloc(fv, s), lsS = s.ini + s.folga;
          lfim = Math.min(lfim, s.predTipo[fv.id] === "II" ? lsS - d + fv.dur : lsS - d);
        });
        fv.folga = Math.max(0, lfim - fv.fim);
      }
      /* ⚠ `invalidos` só nasce quando há elo recusado — chave a mais no
         retorno é contrato novo, e quem só lê `S` (o `_vaosExec`, e por trás
         dele o prazo de etapa que o aparelho antigo materializa) não pode
         sentir nada desta entrega. */
      var r = { S: S, temCiclo: ciclo.length > 0, ciclo: ciclo };
      if (invalidos.length) r.invalidos = invalidos;
      return r;
    },

    /* ESCALONAMENTO para dentro de uma janela [iniW, fimW] (a da etapa, para
       as folhas; a da folha, para os serviços). O algoritmo é o da espec 1.2:
        (a) janela de 0 dia (etapa marco) ou vão S = 0 (todas marco): cada
            item herda a janela, `escala: "sem-vao"` — ⚠ sem isto era 0×d/0 =
            NaN, e `addDiasUteis(NaN)` datava a folha no DIA 0 DA OBRA, calado;
        (b) ini = iniW + floor(iniInt × dur / S); fim = iniW + ceil(fimInt ×
            dur / S); item não-marco dura ≥ 1 (senão vira losango no Gantt e o
            `periodos` joga o valor inteiro num dia); corte ini ≤ fimW − 1 e
            fim ≤ fimW. Marco: fim = ini (um marco com barra de 1 dia mentiria).
        (c) folga medida JÁ na escala final: o fim tardio interno escalado por
            ceil e cortado à janela. Sem isto a folga da folha podia passar do
            tamanho da própria etapa.
       `comprimida`: a escala desfez a ORDEM que a rede interna dizia (o
       sucessor terminou/começou junto ou antes do predecessor). Um dia de
       fronteira dividido pelo arredondamento NÃO conta — senão o aviso
       apareceria em quase toda etapa e a pessoa aprenderia a ignorá-lo. */
    _escalar: function (itens, iniW, fimW) {
      var dur = fimW - iniW, S = 0, porId = {};
      itens.forEach(function (it) { S = Math.max(S, it.fimInt); porId[it.id] = it; });
      var semVao = !(dur > 0) || !(S > 0), exata = dur === S;
      itens.forEach(function (it) {
        if (semVao) { it.ini = iniW; it.fim = it.marco ? iniW : fimW; it.escala = "sem-vao"; it.folgaEsc = 0; return; }
        var ini = iniW + Math.floor((it.iniInt * dur) / S + 1e-9), fim;
        if (it.marco) { ini = Math.min(ini, fimW); fim = ini; }
        else {
          fim = iniW + Math.ceil((it.fimInt * dur) / S - 1e-9);
          fim = Math.max(fim, ini + 1);
          if (dur >= 1) ini = Math.min(ini, fimW - 1);
          fim = Math.min(fim, fimW);
        }
        it.ini = ini; it.fim = fim; it.escala = exata ? "exata" : "escalada";
        if (it.folgaInt != null) {
          /* ⚠ o fim tardio usa o MESMO arredondamento da posição: o marco é
             posto por floor (acima); com ceil aqui, o marco crítico no meio
             da etapa saía com folga 1 e fora do caminho crítico (79 de 79 casos
             em 3.000 orçamentos gerados) — a corrente vermelha do Gantt
             quebrava nele e o dataLimite andava 1 dia. */
          var lf = it.marco ? Math.min(fimW, iniW + Math.floor(((it.fimInt + it.folgaInt) * dur) / S + 1e-9))
            : Math.min(fimW, iniW + Math.ceil(((it.fimInt + it.folgaInt) * dur) / S - 1e-9));
          it.folgaEsc = Math.max(0, lf - fim);
        } else it.folgaEsc = 0;
      });
      if (!semVao) itens.forEach(function (s) {
        (s.preds || []).forEach(function (pid) {
          var p = porId[pid]; if (!p || p === s) return;
          if ((s.fimInt > p.fimInt && s.fim <= p.fim) || (s.iniInt > p.iniInt && s.ini <= p.ini)) s.comprimida = true;
        });
      });
      return { S: S, semVao: semVao };
    },

    /* Serviços dentro da janela do pai (folha, ou etapa sem subetapa): parte
       proporcional às equipe-dias; se nenhum tem equipe-dias, ao CUSTO DIRETO
       do motor (`num(q) × num(custoUnitario)` — ⚠ nunca `ctx.valores`, senão a
       data do serviço mudaria conforme quem chamou passou valores); sem custo,
       partes iguais. Cascata simples com o paralelismo interno, escalada e
       cortada à janela. Serviço `semBase` não ganha barra: seria uma barra que
       nenhum diário jamais poderá realizar. */
    _distribuir: function (pai, idxs, nos, infos, parSub, dataDe) {
      var self = this, somaEd = 0, somaC = 0, esc = [], fimAnt = 0, lenAnt = 0;
      idxs.forEach(function (i) { if (infos[i].base) { somaEd += infos[i].ed; somaC += infos[i].custo; } });
      idxs.forEach(function (i) {
        var x = infos[i], n = nos[i], cat = self.cat(x.categoria);
        n.equipeDias = Math.round(x.ed * 10) / 10; n.categoria = x.categoria; n.categoriaNome = cat.nome; n.cor = cat.cor;
        n.fonte = x.fonte; n.folga = pai.folga; n.critico = !!pai.critico; n.marco = false; n.editado = false;
        n.preds = []; n.predsExplicito = false; n.predLag = {}; n.predTipo = {}; n.predDesloc = {};
        n.inicio = null; n.fim = null; n.duracao = 0; n.escala = null; n.dataInicio = null; n.dataFim = null;
        if (!x.base) return;
        var len = somaEd > 0 ? x.ed : (somaC > 0 ? x.custo : 1);
        var ini = esc.length ? Math.max(0, fimAnt - parSub * lenAnt) : 0;
        esc.push({ id: "#" + i, i: i, iniInt: ini, fimInt: ini + len, marco: false });
        fimAnt = ini + len; lenAnt = len;
      });
      this._escalar(esc, pai.inicio, pai.fim);
      esc.forEach(function (e) {
        var n = nos[e.i];
        n.inicio = e.ini; n.fim = e.fim; n.duracao = e.fim - e.ini; n.escala = e.escala;
        n.dataInicio = dataDe(e.ini); n.dataFim = dataDe(e.fim);
      });
      /* ⚠ DEVOLVE A LISTA para a segunda passada da JANELA PLENA (etapa
         opcional fora do prazo, `_arvore`): a distribuição interna
         (`iniInt`/`fimInt`) é a mesma, muda só a janela em que ela é escalada,
         e refazê-la aqui custa duas contas do mesmo número. Quem não precisa
         simplesmente ignora o retorno. */
      return esc;
    },

    /* Monta `r.atividades` e `r.exec` (só com ctx.eap). Lê `r` e nunca o
       reescreve: etapa, total e datas de etapa ficam os do caminho de sempre.
       `vivo` = o `_vaosExec` que o próprio `estimar` usou para a duração das
       etapas (null com o modo desligado) — o aviso compara com ELE, nunca com
       uma segunda conta do vão.
       `cong` = `{vaos}` quando o orçamento está APROVADO e a duração veio da
       GRAVADA (`congeladoPorAprovacao`): o vão de hoje está aí só para o
       recado dizer os dois números. */
    _arvore: function (orc, r, ctx, vivo, cong, cal, mem) {
      var self = this, params = r.params, cron = (orc && orc.cronograma) || {}, ex = cron.exec || {};
      var agEt = cron.duracoesAgente || {}, durEt = cron.duracoes || {}, rede = ex.rede === true;
      /* quantas vezes o vão da rede interna pode passar da duração da etapa
         antes do aviso de escala. 1,25 é o começo, parametrizável como o
         `exec.toleranciaPP` já é; valor ≤ 1 (ou torto) cai no padrão, senão
         um "1" digitado avisaria em toda etapa escalada e a pessoa aprenderia
         a ignorar o aviso — que é como um aviso morre. */
      var tolEscala = num(ex.toleranciaEscala) > 1 ? num(ex.toleranciaEscala) : 1.25;
      /* ⚠ APROVADO: muda a PORTA dos recados desta árvore, não o número. Com o
         modo executivo ligado ele já chega por `cong`; com o modo desligado não
         chegava por caminho nenhum, e o aviso de escala saía mandando ligar o
         interruptor (recusado pela trava) ou aumentar a duração (congelada). */
      var aprovOrc = this.congeladoPorAprovacao(orc);
      /* a árvore e o `_preparar` vêm do memo da chamada (ver `_contexto`): com
         `exec.rede` ligado o `_vaosExec` já montou os dois, e montá-los de
         novo era metade do custo do `estimar` num orçamento grande. E o
         calendário é o do `estimar` — uma tabela só por chamada. */
      var cx = this._contexto(mem, orc, params, (ctx && ctx.calc) ? ctx.calc : null, false);
      var nos = cx.nos, P = cx.P;
      var integ = (mem && mem.integ) ? mem.integ : null;
      if (!cal) cal = this.calendario(r);
      var avisos = [];
      var V = ctx.valores ? (ctx.valores.porId || ctx.valores) : null;
      if (ctx.valores && ctx.valores.ok === false) {
        V = null;
        avisos.push({ tipo: "valores", msg: "Valor de venda por subetapa indisponível" + (ctx.valores.motivo ? " (" + ctx.valores.motivo + ")" : "") + " — a coluna de valor fica em branco; custo direto não é mostrado no lugar." });
      }
      function dataDe(k) { return (k == null || !cal) ? null : cal.dia(k); }
      function copia(o) { var c = {}; for (var k in o) if (own(o, k)) c[k] = o[k]; return c; }
      /* cópia rasa de uma lista de itens do `_escalar`, só com o que ELE lê
         (`iniInt`/`fimInt`/`folgaInt`/`marco`/`preds`) — é o que deixa a mesma
         distribuição ser escalada numa segunda janela (a PLENA da etapa
         opcional) sem contaminar `ini`/`fim`/`escala`/`comprimida` já lidos. */
      function escCopia(lst) {
        return (lst || []).map(function (x) {
          return { id: x.id, i: x.i, iniInt: x.iniInt, fimInt: x.fimInt, folgaInt: x.folgaInt, marco: x.marco, preds: x.preds };
        });
      }
      function catMaior(catC) {
        var c = Object.keys(catC).sort(function (a, b) { return catC[b] - catC[a]; })[0] || "outros";
        return self.cat(c);
      }
      P.grupos.forEach(function (g, gi) {
        var n = g.no, et = r.etapas[n.etapaIdx], alvo = [];
        n.codigo = et.codigo != null ? et.codigo : n.codigo;
        n.categoria = et.categoria; n.categoriaNome = et.categoriaNome; n.cor = et.cor; n.equipeDias = et.equipeDias;
        n.duracao = et.duracao; n.inicio = et.inicio; n.fim = et.fim; n.folga = et.folga; n.critico = !!et.critico; n.marco = !!et.marco;
        if (et.cicloDep) n.cicloDep = true;
        // data fixada pelo arrasto no Gantt: a tela desenha a âncora e recusa o
        // arrasto para a esquerda de `inicioRede` (⚠ só existe com restrição gravada)
        if (et.restricao) n.restricao = et.restricao;
        n.editado = !!et.editado;
        var temBase = g.servicos.concat.apply(g.servicos, g.folhas.map(function (f) { return f.servicos; }))
          .some(function (i) { return P.infos[i].base; });
        /* no modo executivo a duração da etapa com folhas É o vão ao vivo, seja
           qual for a marca gravada (um "10" digitado numa versão antiga não
           vale aqui): a fonte diz isso, senão a tela rotularia "usuário" um
           número que a pessoa não digitou */
        n.fonte = et.marco ? "marco" : (vivo && own(vivo.porId, et.id) ? "subetapas"
          : (et.editado ? ((own(agEt, et.id) && agEt[et.id]) || "usuario") : (temBase ? "estimado" : "semBase")));
        n.preds = et.preds.slice(); n.predsExplicito = !!et.predsExplicito; n.predLag = copia(et.predLag); n.predDesloc = copia(et.predDesloc);
        n.predTipo = {}; n.preds.forEach(function (p) { n.predTipo[p] = "TI"; });
        n.dataInicio = new Date(et.dataInicio.getTime()); n.dataFim = new Date(et.dataFim.getTime());
        n.dataLimite = new Date(et.dataLimite.getTime());
        n.escala = null; n.comprimida = false;
        /* planejador 1A (§1.8): a chave `folgaLivre` só nasce com extensão (a
           passada integrada) e com a árvore; o VALOR a passada já calculou */
        if (integ && own(integ.NP, et.id)) {
          var nI = integ.NP[et.id];
          n.folgaLivre = Math.max(0, Math.min(integ.folgaLivreEt(nI), et.folga));
          if (et.folgaReal != null) n.folgaReal = et.folgaReal;
          if (et.predTipoRede) n.predTipoRede = copia(et.predTipoRede);
          if (et.predLagTipo) n.predLagTipo = copia(et.predLagTipo);
          /* as tarefas sem preço que seguram a etapa: a tabela e a grade leem o
             NÓ (o "Depende de" com T1 e o ⧗ saem daqui; sem a cópia, digitar
             "3" numa etapa segurada pela T1 não soltava a T1) */
          if (et.porExtras) { n.porExtras = et.porExtras.map(function (q) { return { id: q.id, numero: q.numero, tipo: q.tipo, lag: q.lag }; }); n.redeEtapas = et.redeEtapas; }
        }
        if (!g.folhas.length) { alvo.push({ no: n, servicos: g.servicos }); }
        else {
          var fs = g.folhasRede, porFolha = {};
          var esc = fs.map(function (f) {
            var o = { id: f.id, iniInt: f.ini, fimInt: f.fim, folgaInt: f.folga, marco: f.marco, preds: f.predsResolvidos };
            porFolha[f.id] = o; return o;
          });
          /* ⚠ POSIÇÕES ABSOLUTAS DA PASSADA INTEGRADA (planejador, T1): com a
             1A, a subetapa sai da posição que a passada calculou (`mem.abs`,
             propriedade da LISTA do memo — nunca escrita nos nós), e não da
             escala. Sem ela (hoje, sempre), a escala de sempre. */
          var absEt = (mem && mem.abs && own(mem.abs, et.id)) ? mem.abs[et.id] : null;
          if (!(absEt && self._absNaEscala(esc, absEt, et))) self._escalar(esc, et.inicio, et.fim);
          var comp = [];
          fs.forEach(function (f, j) {
            var e2 = esc[j], fn = f.g.no, cat = catMaior(f.catC);
            fn.categoria = cat.id; fn.categoriaNome = cat.nome; fn.cor = cat.cor;
            fn.equipeDias = Math.round(f.ed * 10) / 10; fn.equipes = f.eq;
            fn.duracaoRede = f.dur; fn.inicioRede = f.ini; fn.fimRede = f.fim; fn.folgaRede = f.folga;
            if (f.override) fn.duracaoDigitada = f.ov;
            fn.inicio = e2.ini; fn.fim = e2.fim; fn.duracao = e2.fim - e2.ini;
            fn.folgaInterna = e2.folgaEsc; fn.folga = e2.folgaEsc + (et.folga || 0);
            fn.critico = !!et.critico && e2.folgaEsc === 0;
            fn.marco = f.marco; fn.escala = e2.escala; fn.comprimida = !!e2.comprimida;
            if (f.cicloDep) fn.cicloDep = true;
            fn.fonte = f.fonte; fn.editado = f.override;
            fn.preds = f.preds.slice(); fn.predsExplicito = f.predsExplicito; fn.predLag = copia(f.predLag);
            fn.predTipo = copia(f.predTipo); fn.predDeslocRede = copia(f.predDeslocRede);
            /* deslocamento EFETIVO na escala desenhada: é o número que o MS
               Project precisa para reproduzir a mesma data (no modo padrão o
               "+7" digitado de cura vira o que coube na janela da etapa) */
            fn.predDesloc = {};
            fn.preds.forEach(function (pid) { var p = porFolha[pid]; fn.predDesloc[pid] = e2.ini - (fn.predTipo[pid] === "II" ? p.ini : p.fim); });
            fn.dataInicio = dataDe(fn.inicio); fn.dataFim = dataDe(fn.fim);
            fn.dataLimite = fn.folga ? dataDe(fn.fim + fn.folga) : dataDe(fn.fim);
            /* planejador 1A: os tipos e esperas DIGITADOS da folha (o `predTipo`
               continua o legado da sombra, O20) e a folga livre da passada */
            var GI = integ && integ.G[et.id] ? integ.G[et.id] : null, fI = GI ? GI.porId[f.id] : null;
            // o círculo que a passada integrada ignorou (a rede digitada pode fechar um que o legado não tem)
            if (fI) { if (fI.cicloDep) fn.cicloDep = true; else delete fn.cicloDep; }
            if (fI && fI.rede) {
              var tpF = {}, lgF = {};
              fI.elos.forEach(function (l) { if (l.tipo !== "TI") tpF[l.p] = l.tipo; if (l.L != null) lgF[l.p] = l.L; });
              arr(fI.ef && fI.ef.elos).forEach(function (el) {
                if (fI.elos.some(function (l) { return l.p === el.i; })) return;   // o elo cruzado (O26)
                if (el.t !== "TI") tpF[el.i] = el.t;
                if (el.l != null) lgF[el.i] = el.l;
              });
              if (temChave(tpF)) fn.predTipoRede = tpF;
              if (temChave(lgF)) fn.predLagTipo = lgF;
            }
            if (integ) {
              var absF = absEt && own(absEt, f.id) ? absEt[f.id] : null;
              if (absF) {
                var flF = null;
                GI.succ[f.id].forEach(function (sid) {
                  if (!own(absEt[sid].L, f.id)) return;
                  var rF = absEt[sid].iniO - (absF.fimO + integ.dEqF(GI, absEt, sid, f.id));
                  flF = flF == null ? rF : Math.min(flF, rF);
                });
                if (flF == null) flF = et.fim - absF.fimO;
                fn.folgaLivre = Math.max(0, Math.min(flF, e2.folgaEsc));
              } else fn.folgaLivre = null;   // desenhada em escala: a folga livre só existe com o prazo detalhado (REDE §c.4)
            }
            if (fn.comprimida) comp.push(f.id);
            alvo.push({ no: fn, servicos: f.g.servicos });
          });
          n.vao = g.rede.S; n.comprimida = comp.length > 0;
          if (comp.length) avisos.push({ tipo: "comprimida", etapaId: n.id, folhas: comp,
            msg: "Etapa " + n.numero + " curta demais para as subetapas — " + comp.length + " de " + fs.length + " se sobrepõem no desenho (a rede pede " + g.rede.S + " dias; a etapa tem " + et.duracao + ")." });
          /* planejador 1A: com a passada integrada, o círculo é o da rede que ELA
             usou (a digitada, quando vale) — a 1.2.81 lê a mesma rede na sombra e
             avisa o mesmo círculo; sem o aviso aqui, só o aparelho antigo contava
             (compat-1281 (d), "exec:ciclo") */
          var GIc = integ && integ.G[et.id] ? integ.G[et.id] : null;
          var cicloFs = GIc ? GIc.lista.filter(function (x) { return x.cicloDep; }).map(function (x) { return x.id; }) : (g.rede.temCiclo ? g.rede.ciclo : []);
          if (cicloFs.length) avisos.push({ tipo: "ciclo", etapaId: n.id, folhas: cicloFs,
            msg: "Etapa " + n.numero + ": dependência circular entre subetapas — " + cicloFs.length + " subetapa(s) desenhada(s) ignorando o elo de volta. Corrija o \"Depende de\"." });
          /* ⚠ O AVISO DE ESCALA PASSA A MEDIR O FATOR (12/09/2026, defeito D8).
             O `comprimida` acima só dispara quando a ESCALA DESFAZ A ORDEM (o
             sucessor passa na frente do predecessor). Compressão que preserva
             a ordem passava calada, e o Gantt desenhado é uma mentira por um
             fator que ninguém vê. MEDIDO nos 34 arquivos de OrcaPRO-Backups
             (51 orçamentos distintos por md5 do JSON — ⚠ a régua da contagem
             vai junto porque foi ela que mudou o número; por `id` dariam 22):
             19 etapas-resumo com duração > 0, das quais 4 desenham acima de
             1,25× e só 2 já tinham aviso `comprimida` — as outras 2 saíam
             mudas. (Uma revisão anterior escreveu aqui "55 / 6 / 3" de cabeça,
             contradizendo a própria suíte: tools/test-crono-honestidade.js,
             bloco 6, imprime 51 / 4 / 2 e é quem confere isto.) No
             corpus da auditoria havia uma etapa de 15 dias cujas subetapas
             pediam 134 (9×) com UM único aviso, e outra de 4 pedindo 10 com
             NENHUM. Os dois números e a porta vão no texto: aviso sem número a
             pessoa lê como formalidade, e trava sem porta faz procurar saída
             errada.
             ⚠ É aviso SEPARADO do `comprimida`, de propósito: o `comprimida` é
             reescrito e vai ao PAPEL do cliente (js/cronopdf.js `_avisosPapel`)
             e este é só da TELA — "ligue o modo executivo" é instrução ao
             engenheiro, não recado de proposta. Com o modo executivo ligado e
             materializado a duração É o vão, o fator dá 1 e ele não aparece.

             ⚠ DUAS GUARDAS, AS DUAS ACHADAS EXECUTANDO O MOTOR (12/09/2026) —
             porque o recado saía por PORTA FECHADA, que é o defeito que este
             arquivo mais documenta:

             (1) NO ORÇAMENTO APROVADO as duas portas do texto não existem.
                 EXECUTADO: `Cronograma.materializar(orc)` num aprovado devolve
                 {aprovado:true, mudou:false, gravadas:0} com o modo ligado E
                 com ele desligado — "ligue Detalhar o prazo pelas subetapas"
                 não faz nada; e `Cronograma.limparEdicoes(orc)` devolve
                 {aprovado:true} e `congeladoPorAprovacao` congela a duração —
                 não há como "aumentar a duração da etapa". É o MESMO defeito
                 que o ⚠ do `nao-materializado`, logo abaixo, já conserta.
                 Alcance MEDIDO nos 34 backups: marcando os 51 orçamentos como
                 aprovados, 4 avisos de `escala` em 3 orçamentos saem com as
                 duas portas fechadas; com o modo executivo ligado esses 3
                 recebem TAMBÉM o `aprovado-gravado`, que já diz os dois números
                 com a porta certa — dois recados sobre o mesmo fato, um deles
                 impossível de obedecer. Então: com `cong` o aviso não sai (o
                 fator vira campo do `aprovado-gravado`), e no aprovado sem
                 `cong` (modo desligado) ele sai com a PORTA CERTA — a revisão.

             (2) COM O MODO EXECUTIVO AO VIVO o fator compara DUAS RÉGUAS.
                 `et.duracao` vem do `_vaosExec`, que usa os params GRAVADOS de
                 propósito (ver o ⚠ de lá); `g.rede.S` vem do `_contexto` com os
                 params do OVERRIDE. Sem override os dois são o mesmo número e o
                 fator dá 1. Com override — e `js/cronoia.js` e
                 `js/cronosaude.js` chamam `estimar(orc, opts.override, {eap})` —
                 eles divergem: EXECUTADO com `equipes:5` gravado e override
                 `{equipes:1}`, a etapa dura 4 (gravados), a árvore pede 29
                 (override), sai "4,1× fora de escala" e o recado manda LIGAR o
                 interruptor que já está ligado. Com o modo ligado a duração É o
                 vão por construção: não há o que este aviso diga. */
          var dEt = num(et.duracao);
          /* a duração desta etapa veio do vão ao vivo (modo executivo): fator 1
             por construção, e qualquer diferença é só a troca de régua acima */
          var vaoVivo = !!(vivo && own(vivo.porId, et.id));
          if (!cong && !vaoVivo && !et.marco && g.rede.S > 0 && dEt > 0 && g.rede.S / dEt > tolEscala) {
            var fatEsc = Math.round((g.rede.S / dEt) * 10) / 10;
            /* no APROVADO a porta é a revisão do orçamento (nem ligar o modo
               nem editar a duração passam pela trava de aprovação) */
            var portaEsc = aprovOrc
              ? "O orçamento está APROVADO: a duração não muda por aqui — nem ligando \"Detalhar o prazo pelas subetapas\", nem editando o campo. " +
                "Para mudar o desenho, faça uma revisão do orçamento; com obra aberta, replaneje pelo plano de execução dela."
              : "Ligue \"Detalhar o prazo pelas subetapas\" (a etapa passa a durar " + g.rede.S + " dias) ou aumente a duração da etapa.";
            avisos.push({ tipo: "escala", etapaId: n.id, vao: g.rede.S, duracao: dEt, fator: fatEsc, tolerancia: tolEscala,
              aprovado: !!aprovOrc,
              msg: "Etapa " + n.numero + " dura " + dEt + " dia(s) útil(eis) e as subetapas dela pedem " + g.rede.S +
                " — o desenho está " + String(fatEsc).replace(".", ",") + "× fora de escala, e as barras abaixo não são o tempo real de cada uma. " +
                portaEsc });
          }
          /* ⚠ ELO RECUSADO PELA REDE INTERNA (defeito D6) — um recado por
             SUBETAPA, não um por elo: um mapa torto com dez elos quebrados
             empurraria os avisos de ciclo e de escala para fora dos 5 que a
             tela desenha. */
          if (g.rede.invalidos) {
            var porFolhaInv = {}, ordemInv = [];
            g.rede.invalidos.forEach(function (x) {
              if (!own(porFolhaInv, x.folhaId)) { porFolhaInv[x.folhaId] = []; ordemInv.push(x.folhaId); }
              porFolhaInv[x.folhaId].push(x);
            });
            var ND = P.noDe ? (typeof P.noDe === "function" ? P.noDe() : P.noDe) : {};
            ordemInv.forEach(function (fid) {
              var lst = porFolhaInv[fid], meu = P.folhaDe[fid] || {}, cita = [], outra = [], citaEt = [], citaSv = [];
              lst.forEach(function (x) {
                var alvoF = P.folhaDe[x.predId], alvoN = own(ND, x.predId) ? ND[x.predId] : null;
                if (x.motivo === "outraEtapa" && alvoF) { cita.push(alvoF.numero); outra.push(alvoF.etapaIdx + 1); }
                else if (x.motivo === "propria") cita.push("ela mesma");
                else if (x.motivo === "etapa" && alvoN) { citaEt.push(alvoN.numero); cita.push("a ETAPA " + alvoN.numero); }
                else if (x.motivo === "servico" && alvoN) { citaSv.push(alvoN.numero); cita.push("o SERVIÇO " + alvoN.numero); }
                else cita.push("uma subetapa que não existe mais");
              });
              var msg;
              if (outra.length) {
                msg = "A subetapa " + meu.numero + " não pode depender de " + cita.slice(0, 2).join(" nem de ") +
                  (cita.length > 2 ? " (e mais " + (cita.length - 2) + ")" : "") + ", que " + (outra.length > 1 ? "são de outras etapas" : "é de outra etapa") +
                  " — o elo foi IGNORADO no cálculo das datas. Ligue as ETAPAS " + (meu.etapaIdx + 1) + " e " + outra[0] +
                  " no \"Depende de\" da etapa, ou fixe a data de início de " + meu.numero + ".";
              /* ⚠ NÚMERO EAP QUE EXISTE, NO CAMPO ERRADO (12/09/2026). Sem este
                 ramo os dois casos abaixo saíam com "aponta para uma subetapa
                 que não existe mais" — dizer que não existe um número que está
                 na tela manda a pessoa procurar no lugar errado. O "Depende de"
                 da SUBETAPA só aceita subetapa da MESMA etapa; etapa se liga a
                 etapa, no campo da etapa; serviço não tem elo próprio. */
              } else if (citaEt.length || citaSv.length) {
                msg = "O \"Depende de\" da subetapa " + meu.numero + " aponta para " + cita.slice(0, 2).join(" e ") +
                  (cita.length > 2 ? " (e mais " + (cita.length - 2) + ")" : "") +
                  " — o elo foi IGNORADO no cálculo das datas. " +
                  (citaEt.length
                    ? "Etapa se liga a etapa: ponha " + citaEt[0] + " no \"Depende de\" da ETAPA " + (meu.etapaIdx + 1) +
                      ", ou ligue " + meu.numero + " a uma subetapa da própria etapa."
                    : "No \"Depende de\" da subetapa só entra subetapa da MESMA etapa — o serviço não tem elo próprio. Ligue " +
                      meu.numero + " à subetapa que contém " + citaSv[0] + ", ou fixe a data de início de " + meu.numero + ".");
              } else {
                msg = "O \"Depende de\" da subetapa " + meu.numero + " aponta para " + cita.slice(0, 2).join(" e ") +
                  " — o elo foi IGNORADO no cálculo das datas. Corrija o \"Depende de\" de " + meu.numero + ".";
              }
              avisos.push({ tipo: "elo-invalido", etapaId: n.id, folhaId: fid,
                preds: lst.map(function (x) { return x.predId; }), motivos: lst.map(function (x) { return x.motivo; }), msg: msg });
            });
          }
          if (rede && !et.marco) {
            /* o vão da MESMA conta que deu a duração da etapa acima (params
               GRAVADOS, sem override — é o que o materializar grava); só sem
               `vivo` (a conta ao vivo falhou) cai no desta árvore. No aprovado
               a duração NÃO veio do vão, mas o vão de hoje veio junto (`cong`)
               para o recado poder dizer os dois números. */
            var vR = vivo || (cong && cong.vaos), x0 = vR && vR.grupos[gi], S0 = x0 ? x0.bruto : g.rede.S;
            /* ⚠ o número do recado é o GRAVADO em `duracoes`, nunca `et.duracao`:
               com o cálculo ao vivo (A1) `et.duracao` já é o vão, e o recado
               sairia "a duração gravada (12 dias) não é a das subetapas (12)" */
            var grav = own(durEt, n.id) && num(durEt[n.id]) > 0 ? num(durEt[n.id]) : null;
            /* ⚠ A MARCA DO CONGELAMENTO VEM ANTES DE SEPARAR OS CASOS. Ela
               estava dentro do `else if (cong)`, e por isso a etapa aprovada
               cujas subetapas são TODAS marco (vão zero) não recebia
               `congelado` — a tela caía no ramo antigo e o `title` do campo
               voltava a dizer "a duração desta etapa é o vão das subetapas
               (3 dias). Edite as subetapas abaixo, ou desligue 'Detalhar o
               prazo pelas subetapas'": duas portas fechadas num aprovado
               (editar subetapa não muda mais a data, e desligar o interruptor
               é recusado pela trava de aprovação). Achado na revisão de
               11/09/2026, executando o motor. */
            if (cong) { n.congelado = true; n.vaoHoje = S0; }
            if (!(S0 > 0)) avisos.push({ tipo: "sem-vao", etapaId: n.id,
              msg: "Etapa " + n.numero + ": todas as subetapas são marco — a duração da etapa não vem delas." });
            /* ⚠ APROVADO: esta tela mostra a data APROVADA (a gravada), e ela
               não muda. O recado só existe quando os DOIS números divergem —
               dizer "aprovado com 9, as subetapas dão 9" é ruído. Nada de
               "salve o orçamento": a trava do aprovado recusa o salvar, e
               mandar por uma porta fechada é o que faz a pessoa procurar
               saída errada. A porta é a revisão (ou, com obra, o plano de
               execução dela). */
            else if (cong) {
              /* a marca `congelado`/`vaoHoje` já subiu (ver o ⚠ acima): a TELA
                 precisa dela para não rotular a linha "a duração desta etapa é
                 o vão das subetapas (6 dias)" enquanto o ícone diz "vão de 15
                 dia(s)" — dois números discordando na mesma linha, num campo
                 que mostra o 6. */
              /* ⚠ `fator` VEM PARA CÁ porque o aviso de `escala` não sai no
                 aprovado (ver o ⚠ (1) dele): a informação do desenho fora de
                 escala não pode sumir junto com o recado impossível — ela vira
                 campo deste, que já tem a porta certa. */
              if (num(et.duracao) !== S0) avisos.push({ tipo: "aprovado-gravado", etapaId: n.id, duracao: grav, duracaoUsada: et.duracao, vao: S0,
                fator: num(et.duracao) > 0 ? Math.round((S0 / num(et.duracao)) * 10) / 10 : null,
                msg: "Etapa " + n.numero + ": esta é a data aprovada (" + (grav != null ? "gravada, " + grav + " dias" : "sem duração gravada — a etapa vale a estimativa por categoria, " + et.duracao + " dias") +
                  "); as subetapas hoje dariam " + S0 + " dias. O orçamento aprovado não muda — nem aqui, nem na proposta, nem para os outros aparelhos." });
            }
            /* ⚠ ETAPA FORA DO PRAZO: O RECADO DE SEMPRE AFIRMA UM NÚMERO QUE
               ESTA TELA NÃO USA (12/09/2026). Com `opcionaisNoPrazo` desligado
               a opcional é desenhada com duração 0 — mas o texto dizia "Esta
               tela já usa 15" e mandava salvar "para que aparelhos com versão
               anterior vejam o mesmo prazo". As duas afirmações são falsas: a
               tela usa 0, e o aparelho antigo não conhece `opcionaisNoPrazo` —
               ele vai contar os 15 dias DENTRO do prazo, que é o contrário de
               "o mesmo prazo". Recado que mente é pior que recado nenhum. */
            else if (!(own(agEt, n.id) && agEt[n.id] === "subetapas" && num(durEt[n.id]) === S0)) {
              if (et.foraDoPrazo) avisos.push({ tipo: "nao-materializado", etapaId: n.id, duracao: grav, vao: S0, foraDoPrazo: true,
                msg: "Etapa " + n.numero + " é opcional e está fora do prazo contratado — esta tela a desenha com 0 dia (a barra tracejada usa " +
                  (et.duracaoPlena != null ? et.duracaoPlena : S0) + "). As subetapas dela pedem " + S0 +
                  " dia(s) útil(eis); aparelhos com a versão anterior do app não conhecem \"opcional fora do prazo\" e vão contar esses " + S0 +
                  " dias DENTRO do prazo. Para os dois verem o mesmo, tire o \"opcional\" da etapa — ou deixe como está e trate-a como adicional." });
              else avisos.push({ tipo: "nao-materializado", etapaId: n.id, duracao: grav, vao: S0,
                msg: "Etapa " + n.numero + ": a duração gravada no orçamento (" + (grav != null ? grav + " dias" : "nenhuma") +
                  ") não é a das subetapas (" + S0 + " dias). Esta tela já usa " + S0 +
                  "; salve o orçamento para que aparelhos com versão anterior do app vejam o mesmo prazo." });
            }
          }
        }
        alvo.forEach(function (a) { a.esc = self._distribuir(a.no, a.servicos, nos, P.infos, P.parSub, dataDe); });
        /* ⚠ A MARCA `foraDoPrazo` DESCE A ÁRVORE INTEIRA. Sem isto o Gantt
           desenharia a etapa opcional tracejada e as subetapas e serviços dela
           sólidos, no mesmo dia, como se fossem escopo contratado — e é o nó
           filho que a pessoa clica.
           ⚠ E A JANELA PLENA DESCE JUNTO (12/09/2026). `duracaoPlena` ficava só
           no nó da ETAPA: MEDIDO numa etapa opcional de 3 subetapas e 3
           serviços, com o interruptor ligado os nós saem 2.1 dur=5 ini=5,
           2.2 dur=5 ini=10, 2.3 dur=4 ini=15; desligado, os SETE nós saíam
           `duracao=0 ini=5 fim=5 escala="sem-vao"` e SEM `duracaoPlena` — as
           três subetapas empilhadas no mesmo dia útil, e no detalhe "serviço"
           o bloco opcional inteiro virando uma coluna de um dia sem nada
           desenhável. A tela teria de INVENTAR o tamanho da barra tracejada, e
           inventar número de data é o que este arquivo inteiro existe para
           impedir.
           CONTRATO PARA A TELA: todo nó com `foraDoPrazo` leva
           `duracaoPlena`/`inicioPlena`/`fimPlena` (índices de dia útil, na
           mesma régua de `inicio`/`fim`). Serviço sem base fica com
           `inicioPlena`/`fimPlena` null e `duracaoPlena` 0 — o mesmo que ele já
           tem em `inicio`/`fim`: barra que nenhum diário poderá realizar não
           ganha barra em janela nenhuma.
           ⚠ É A MESMA CONTA, OUTRA JANELA: `_escalar` sobre CÓPIAS das mesmas
           listas (`iniInt`/`fimInt` intactos), nunca uma segunda régua. Cópias
           porque `_escalar` ESCREVE `ini`/`fim`/`escala`/`comprimida` no item —
           reusar os objetos contaminaria o que já foi lido acima. */
        if (et.foraDoPrazo) {
          n.foraDoPrazo = true;
          if (et.duracaoPlena != null) n.duracaoPlena = et.duracaoPlena;
          var iniP = n.inicio, fimP = n.inicio + num(et.duracaoPlena), janela = {};
          n.inicioPlena = iniP; n.fimPlena = fimP;
          if (g.folhas.length) {
            var escP = escCopia(esc);
            self._escalar(escP, iniP, fimP);
            fs.forEach(function (f, j) {
              var e3 = escP[j], fn = f.g.no;
              fn.inicioPlena = e3.ini; fn.fimPlena = e3.fim; fn.duracaoPlena = e3.fim - e3.ini;
              janela[fn.id] = e3;
            });
          }
          alvo.forEach(function (a) {
            a.no.foraDoPrazo = true;
            var w = own(janela, a.no.id) ? janela[a.no.id] : { ini: iniP, fim: fimP };
            a.servicos.forEach(function (i) {
              if (!nos[i]) return;
              nos[i].foraDoPrazo = true;
              nos[i].inicioPlena = null; nos[i].fimPlena = null; nos[i].duracaoPlena = 0;
            });
            var escS = escCopia(a.esc || []);
            self._escalar(escS, w.ini, w.fim);
            escS.forEach(function (e4) {
              var ns = nos[e4.i];
              if (!ns) return;
              ns.inicioPlena = e4.ini; ns.fimPlena = e4.fim; ns.duracaoPlena = e4.fim - e4.ini;
            });
          });
        }
      });
      var tot = 0;
      if (V) nos.forEach(function (n) { if (n.tipo === "etapa" && own(V, n.id) && V[n.id] != null) tot += num(V[n.id]); });
      nos.forEach(function (n) {
        n.valor = (V && own(V, n.id) && V[n.id] != null) ? num(V[n.id]) : null;
        n.peso = (n.valor != null && tot > 0) ? (n.valor / tot) * 100 : null;
      });
      r.atividades = nos;
      r.exec = { rede: rede, paralelismoSub: P.parSub, toleranciaPP: num(ex.toleranciaPP) > 0 ? num(ex.toleranciaPP) : 1,
        toleranciaEscala: tolEscala,
        detalhe: this.DETALHES.indexOf(ex.detalhe) > -1 ? ex.detalhe : "subetapa", avisos: avisos };
      return r;
    },

    /* TABELA DE CALENDÁRIO de um resultado de `estimar`: `dia(k)` = a data do
       k-ésimo dia útil depois do início, com feriados — construída uma vez por
       chamada, no lugar de um `addDiasUteis` que anda dia a dia desde o dia 0
       para CADA nó (350 nós × 3 datas custavam ~106 ms por render).
       ⚠ EXATA POR CONSTRUÇÃO: anda o calendário com os mesmos passos do
       `addDiasUteis` e guarda em que giro achou cada dia; se aquele giro
       passaria da guarda de 10 anos do `addDiasUteis` (calendário degenerado),
       ou se `k` não é inteiro, devolve o próprio `addDiasUteis` — o nó nunca
       tem data diferente da que a etapa teria. */
    calendario: function (r) {
      var self = this, ini = r && r.dataInicio;
      if (!ini || typeof ini.getTime !== "function" || isNaN(ini.getTime())) return null;
      var dpw = (r.params && r.params.diasUteisSemana) || 5, fer = (r.feriados && r.feriados.mapa) || {};
      var t = [ini.getTime()], g = [0], cur = new Date(ini.getTime()), giros = 0;
      function passo() {
        giros++; cur.setDate(cur.getDate() + 1);
        if (self.diaUtil(cur, dpw, fer)) { t.push(cur.getTime()); g.push(giros); }
      }
      function ate(k) { var lim = 3660 + k * 3; while (t.length <= k && giros < lim) passo(); }
      return {
        dia: function (k) {
          if (typeof k === "number" && k >= 0 && k % 1 === 0) {
            ate(k);
            if (k < t.length && g[k] <= 3660 + 3 * k) return new Date(t[k]);
          }
          return self.addDiasUteis(ini, k, dpw, fer);
        },
        /* nº de dias úteis em (início, data] — a mesma conta da linha "hoje"
           do Gantt, agora com feriado. Para em `max` (o chamador só quer saber
           se passou do fim). */
        indice: function (ms, max) {
          var lim = 3660 + (max + 1) * 3;
          while (t.length <= max + 1 && meiaNoite(new Date(t[t.length - 1])) <= ms && giros < lim) passo();
          var lo = 0, hi = t.length - 1;
          if (meiaNoite(new Date(t[0])) > ms) return -1;
          while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (meiaNoite(new Date(t[mid])) <= ms) lo = mid; else hi = mid - 1; }
          return lo;
        }
      };
    },

    /* Índice de dia útil da data de corte ("hoje") dentro da obra, COM
       feriados. ⚠ A linha "hoje" do Gantt contava só fim de semana
       (ui.js:2403-2408): numa obra que atravessou Carnaval e Páscoa ela
       ficava 3 dias à frente da barra — e "à frente" é lido como atraso.
       Devolve null antes do início ou depois do fim (sem marcador). */
    diaUtilDoCorte: function (r, data) {
      if (!r || !r.dataInicio || typeof r.dataInicio.getTime !== "function") return null;
      var hj = data == null ? new Date() : (typeof data === "string" ? new Date(data.slice(0, 10) + "T00:00:00") : new Date(data.getTime ? data.getTime() : data));
      if (isNaN(hj.getTime())) return null;
      var ms = meiaNoite(hj);
      if (ms < meiaNoite(r.dataInicio)) return null;
      var cal = this.calendario(r), tot = Math.max(0, Math.ceil(r.totalDias || 0));
      if (!cal) return null;
      var j = cal.indice(ms, tot);
      return (j < 0 || j > tot) ? null : j;
    },

    /* Parâmetros do formulário → params gravados, SÓ com as chaves que
       vieram. ⚠ O `cronRecalc` lia `(UI.el("cron-x") || {}).value`: input que
       não estava na tela virava padrão — paralelismo 0 (o do motor é 0,15),
       início "hoje", feriado local apagado — e `feriadosFacultativos`, que não
       tem input, sumia a cada Recalcular. Mudava a entrega impressa na
       proposta sem recado. Aqui: chave ausente conserva o gravado; chave
       presente com null grava null (é assim que se volta para "hoje"). */
    mesclarParams: function (atual, doForm) {
      var out = {}, k;
      if (atual && typeof atual === "object") for (k in atual) if (own(atual, k)) out[k] = Array.isArray(atual[k]) ? atual[k].slice() : atual[k];
      if (doForm && typeof doForm === "object") for (k in doForm) if (own(doForm, k) && doForm[k] !== undefined) out[k] = Array.isArray(doForm[k]) ? doForm[k].slice() : doForm[k];
      return out;
    },

    /* MODO EXECUTIVO materializado. Com `exec.rede === true`, grava em cada
       etapa com folhas (não-marco) `duracoes[id] = S` (vão da rede interna) e
       `duracoesAgente[id] = "subetapas"`. Desligado, apaga SÓ o que tem essa
       marca — duração digitada, da IA ou da Execução fica. Idempotente: a 2ª
       chamada não muda nada e devolve `mudou:false`.
       ⚠ Duração SEM marca (digitada numa versão antiga, que apaga a marca ao
       editar) diferente de S é sobrescrita — no modo executivo a etapa com
       folhas é só leitura — mas volta em `avisos` com os DOIS números, para a
       tela dizer o que mudou em vez de trocar calada.
       ⚠ `mudancas`: a duração que JÁ tinha a marca "subetapas" e mudou de
       valor (as subetapas mudaram: preço, quantidade ou item, inclusive por
       gravadores que não passam pelo App.persistir, como a reprecificação em
       lote). Sem isto o próximo salvar — de qualquer campo — levava o prazo de
       85 para 186 dias úteis sem nenhum recado.
       ⚠ LIGAR E DESLIGAR TEM DE VOLTAR AO PONTO DE PARTIDA (revisão da
       Fase 2, 11/09/2026). Ligar sobrescreve a duração que a etapa tinha
       (digitada, da IA com o motivo, do Hh da Execução); desligar só apagava a
       marca — a etapa caía na estimativa por categoria. Medido: um orçamento
       de 67 dias úteis foi a 358 ligando e a 401 desligando (a IA tinha dito
       45 d numa etapa; a categoria deu 385), sem caminho de volta ao prazo
       impresso na proposta. Agora o valor sobrescrito fica guardado em
       `exec.anterior[etapaId] = {dur, agente, ia}` (fora de `duracoes`: I3/I5;
       a versão antiga não lê `exec`) e volta ao desligar — só na etapa que
       AINDA está com a marca "subetapas" (se alguém editou a etapa depois, a
       edição dessa pessoa vale e o guardado é descartado).
       Retorno: {mudou, gravadas:[ids], apagadas:[ids], avisos:[{etapaId,
       digitado, vao, agente}], mudancas:[{etapaId, antes, depois}],
       semVao:[ids], restauradas:[{etapaId, dur, agente}]}. */
    /* A PROJEÇÃO ÚNICA (planejador, O4; T1 da Onda 0). Todo gravador entra
       por aqui: `persistir`, `_cronoMaterializar`, `_materializarSeExec` e
       `_cronoSalvarPlano`. `materializar` e `materializarSeExec` continuam
       como APELIDOS (quem já chama não muda).
       ⚠ ONDA 0: é o `materializar` de hoje (vão das subetapas com a marca
       "subetapas"); `opts.seNecessario` é a regra barata de hoje do
       `materializarSeExec` (modo desligado e nenhuma marca → null, sem montar
       árvore — a reprecificação em lote passa por dezenas de orçamentos). A
       projeção das quatro funções de data (P0–P7 da espec §2.7) é da 1A. */
    materializarCrono: function (orc, opts) {
      opts = opts || {};
      if (opts.seNecessario) {
        var cron = orc && orc.cronograma, k;
        if (!cron || typeof cron !== "object") return null;
        // ⚠ com dado novo (ou sombra a desfazer) a projeção roda sempre: os gravadores diretos mantêm a sombra em dia
        if (!(cron.exec && cron.exec.rede === true) && !this._temNovo(cron)) {
          var ag = cron.duracoesAgente, marca = false;
          if (ag && typeof ag === "object") for (k in ag) if (own(ag, k) && ag[k] === "subetapas") { marca = true; break; }
          if (!marca) return null;
        }
      }
      var out;
      var R = this._recursos, ligado = !(R && R.motor === false) && this.suporta(orc).ok;
      var X = ligado ? this._ext(orc, opts.inicioEfetivo ? { dataInicio: opts.inicioEfetivo } : null) : null;
      /* ⚠ APROVADO NÃO SE REGRAVA (I5): o `_materializarHoje` devolve
         {aprovado:true} sem tocar em nada; e com o motor desligado ou o
         formato mais novo que este motor (I12, I14), vale o de hoje */
      if (!ligado || (!(opts.simulacao) && this.congeladoPorAprovacao(orc)) || (!X && !this._temSombra(orc))) out = this._materializarHoje(orc, opts);
      else out = this._projetar(orc, opts, X);
      /* P7 (revisão 4, O30): o teto pela régua do alvo — só quando quem grava
         pede (`opts.teto`), porque custa um `medirIniciar` no orçamento; os
         gravadores em lote não pedem */
      if (opts.teto && out && !out.aprovado) this._tetoNaProjecao(orc, out, opts);
      return out;
    },
    /* A MEDIDA DO TETO DENTRO DA PROJEÇÃO (P5 da `semIniciar1281` e P7).
       `opts.teto` = {plano, cronOrc, obra, bytesAntes}.
       ⚠ `mat.semIniciar1281` (a porta D-INICIAR-1281): no PLANO não existe (a
       porta é do orçamento: é o aparelho antigo INICIANDO plano a partir dele);
       no ORÇAMENTO só fica enquanto a régua da 1.2.81 não couber — quando a
       pessoa desfaz o que ocupava, a porta some sozinha e os aparelhos 1.2.81
       voltam a iniciar o plano. Quem CRIA a marca é a porta
       (`opts.semIniciar1281`), nunca a projeção. */
    _tetoNaProjecao: function (orc, out, opts) {
      var self = this, T = opts.teto || {}, cr = orc.cronograma;
      if (!cr || typeof cr !== "object") return;
      var ehPlano = own(orc, "_planoDaObra");
      var mat = (cr.mat && typeof cr.mat === "object" && !Array.isArray(cr.mat)) ? cr.mat : null;
      if (ehPlano) {
        if (mat && own(mat, "semIniciar1281")) { delete mat.semIniciar1281; out.mudou = true; }
      } else {
        if (opts.semIniciar1281) {
          if (!mat) { mat = cr.mat = { v: 1 }; }
          if (mat.semIniciar1281 !== 1) { mat.semIniciar1281 = 1; out.mudou = true; }
        }
        if (mat && own(mat, "semIniciar1281") && !opts.semIniciar1281) {
          var CB0 = this._mod("CronoBase"), m81 = CB0 ? CB0.medirIniciar(orc, T.obra || null, { regua: "1281" }) : null;
          if (m81 && !m81.erro && m81.cabe) { delete mat.semIniciar1281; out.mudou = true; out.avisos.push({ tipo: "D-INICIAR-1281-retirado", bytes: m81.bytes }); }
        }
      }
      var med = this.medirTeto(orc, { plano: T.plano, cronOrc: T.cronOrc, obra: T.obra,
        comSemSombra: function (c) {
          var o2 = {}, k2;
          for (k2 in orc) if (own(orc, k2)) o2[k2] = orc[k2];
          o2.cronograma = c;
          if (!c.mat || typeof c.mat !== "object") c.mat = { v: 1 };
          c.mat.semSombra = true;
          self.materializarCrono(o2, { simulacao: true, inicioEfetivo: opts.inicioEfetivo });
          return c;
        } });
      out.bytes = med.bytes;
      out.regua = med.regua;
      if (med.preExistente) out.avisos.push({ tipo: "D-INICIAR-1281", preExistente: true, bytes: med.bytes, base81: med.base81 });
      if (med.excede) {
        med.cresceu = (T.bytesAntes == null) ? null : med.bytes > T.bytesAntes;
        out.teto = med;
      }
    },
    // apelido (quem já chama não muda): a projeção é o `materializarCrono`
    materializar: function (orc, _opts) { return this.materializarCrono(orc, _opts); },
    /* o cronograma tem alguma chave desta versão (ou sombra a desfazer) */
    _temNovo: function (cron) {
      for (var i = 0; i < this.CHAVES_NOVAS_CRON.length; i++) if (own(cron, this.CHAVES_NOVAS_CRON[i])) return true;
      return this._temSombra({ cronograma: cron });
    },
    _materializarHoje: function (orc, _opts) {
      var out = { mudou: false, gravadas: [], apagadas: [], avisos: [], mudancas: [], semVao: [], restauradas: [] };
      var cron = orc && orc.cronograma;
      if (!cron || typeof cron !== "object") return out;
      /* ⚠ APROVADO NÃO SE REGRAVA — nem por aqui (12/09/2026). No aprovado a
         data é a GRAVADA (`congeladoPorAprovacao`): materializar sobre ele
         trocaria no DISCO a entrega que já foi ao cliente, e a tela passaria a
         mostrar a troca (ela lê `duracoes`). Os caminhos do app já param
         antes (persistir, o interruptor, `materializarSeExec`); esta é a
         última porta. `_opts.simulacao` é o "e se" do `simularExec`, que
         trabalha em CÓPIA e nunca grava. O plano de execução da obra leva a
         marca `_planoDaObra` e passa — é ele que a obra replaneja. */
      if (!(_opts && _opts.simulacao) && this.congeladoPorAprovacao(orc)) { out.aprovado = true; return out; }
      var ligado = !!(cron.exec && cron.exec.rede === true), k;
      /* ⚠ mapa que voltou como LISTA ([]): chave com nome posta num array
         some no JSON do salvar — o vão "gravado" não chegaria ao disco e o
         aparelho com a versão anterior ficaria no prazo velho, calado. Lido
         como ausente; na hora de gravar vira objeto (a mesma régua do `obj()`
         do app.js e do `mapaObj` do execucao.js). */
      function mapa(m) { return m && typeof m === "object" && !Array.isArray(m) ? m : null; }
      var dur = mapa(cron.duracoes), ag = mapa(cron.duracoesAgente);
      var ex = mapa(cron.exec), ant = ex ? mapa(ex.anterior) : null;
      function apaga(id) {
        if (ag) delete ag[id];
        if (dur) delete dur[id];
        out.apagadas.push(id); out.mudou = true;
      }
      if (!ligado) {
        var marcadas = [];
        if (ag) for (k in ag) if (own(ag, k) && ag[k] === "subetapas") marcadas.push(k);
        marcadas.forEach(apaga);
        if (ex && own(ex, "anterior")) {
          // devolve o que ligar sobrescreveu (ver ⚠ acima); etapa apagada não volta
          var existe = {};
          arr(orc.etapas).forEach(function (e) { if (e && e.id) existe[e.id] = true; });
          if (ant) marcadas.forEach(function (id) {
            var a = mapa(ant[id]);
            if (!a || !own(existe, id)) return;
            var d = num(a.dur);
            if (d > 0) { if (!dur) dur = cron.duracoes = {}; dur[id] = d; }
            if (a.agente) { if (!ag) ag = cron.duracoesAgente = {}; ag[id] = String(a.agente); }
            if (a.ia) { if (!mapa(cron.iaMotivos)) cron.iaMotivos = {}; cron.iaMotivos[id] = String(a.ia); }
            out.restauradas.push({ etapaId: id, dur: d > 0 ? d : null, agente: a.agente ? String(a.agente) : null });
          });
          delete ex.anterior; out.mudou = true;
        }
        return out;
      }
      /* guarda o que a etapa tinha ANTES de virar o vão (uma vez: se já está
         com a marca, o guardado é o original e fica) */
      var antMudou = false;
      function guarda(id) {
        if (!ex) return;
        var s = {}, im = mapa(cron.iaMotivos);
        if (dur && own(dur, id) && num(dur[id]) > 0) s.dur = num(dur[id]);
        if (ag && own(ag, id) && ag[id] && ag[id] !== "subetapas") s.agente = String(ag[id]);
        if (im && own(im, id) && im[id]) s.ia = String(im[id]).slice(0, 120);
        if (s.dur != null || s.agente || s.ia) { if (!ant) { ant = ex.anterior = {}; } ant[id] = s; antMudou = true; }
        else if (ant && own(ant, id)) { delete ant[id]; antMudou = true; }
      }
      /* ⚠ UMA CONTA SÓ: o vão vem do `_vaosExec`, o mesmo que o `estimar`
         usa ao vivo. Duas contas do mesmo vão divergem na primeira
         manutenção, e aí o aparelho antigo (que lê o que se grava aqui) e o
         novo (que calcula na hora) imprimem entregas diferentes. */
      var V = this._vaosExec(orc, !!(_opts && _opts.semPiso)), vistos = {};
      V.grupos.forEach(function (x) {
        var id = x.id, S = x.S; vistos[id] = true;
        if (!x.vale) {
          if (ag && own(ag, id) && ag[id] === "subetapas") apaga(id);
          // não virou vão: o que está gravado é o da pessoa, e o guardado não vale mais
          if (ant && own(ant, id)) { delete ant[id]; antMudou = true; }
          if (x.temFolhas && !x.marco) out.semVao.push(id);
          return;
        }
        if (!dur) { dur = cron.duracoes = {}; }
        if (!ag) { ag = cron.duracoesAgente = {}; }
        if (own(ag, id) && ag[id] === "subetapas") {
          if (num(dur[id]) !== S || typeof dur[id] !== "number") {
            if (num(dur[id]) !== S) out.mudancas.push({ etapaId: id, antes: num(dur[id]), depois: S });
            dur[id] = S; out.gravadas.push(id); out.mudou = true;
          }
          return;
        }
        if (own(dur, id) && num(dur[id]) > 0 && num(dur[id]) !== S)
          out.avisos.push({ etapaId: id, digitado: num(dur[id]), vao: S, agente: own(ag, id) ? ag[id] : null });
        guarda(id);
        dur[id] = S; ag[id] = "subetapas";
        if (cron.iaMotivos && own(cron.iaMotivos, id)) delete cron.iaMotivos[id];
        out.gravadas.push(id); out.mudou = true;
      });
      // marca "subetapas" de etapa que não existe mais: lixo que só a marca nova pôs lá
      if (ag) for (k in ag) if (own(ag, k) && ag[k] === "subetapas" && !own(vistos, k)) apaga(k);
      if (ant) for (k in ant) if (own(ant, k) && !own(vistos, k)) { delete ant[k]; antMudou = true; }
      if (ant && !Object.keys(ant).length) { delete ex.anterior; antMudou = true; }
      if (antMudou) out.mudou = true;
      return out;
    },

    /* O VÃO DO MODO EXECUTIVO, calculado na hora — a conta ÚNICA que o
       `estimar` (ao vivo) e o `materializar` (gravado) usam (adendo A1).
       null com `exec.rede` desligado: o caminho de hoje não executa nada daqui.
       ⚠ Params GRAVADOS, nunca o override do chamador: o aparelho antigo lê o
       vão materializado, que não sabe de override; se o Last Planner (que
       passa `obra.inicio`) ou um cenário com 3 equipes recalculassem o vão, a
       versão nova e a antiga dariam entregas diferentes para a mesma obra.
       O override continua valendo para o que ele sempre valeu (início,
       feriados, a etapa sem subetapa) — como numa duração digitada.
       Retorno: {porId: {etapaId: S} — o estado de `duracoes` DEPOIS de
       materializar, inclusive "o último vence" em id repetido —, grupos: [{id,
       temFolhas, marco, vale, S, bruto}] na ordem das etapas}.
       `semPiso`: S sem o mínimo de 1 dia por subetapa (arredondado para cima
       só no fim) — é o que separa o arredondamento no "antes → depois". */
    _vaosExec: function (orc, semPiso, mem, calc) {
      var cron = orc && orc.cronograma;
      if (!cron || typeof cron !== "object" || !cron.exec || cron.exec.rede !== true) return null;
      /* ⚠ `mem`/`calc` só existem quando quem chama é o `estimar` (ver
         `_contexto`): ele já vai montar esta MESMA árvore no `_arvore` logo
         adiante. O `calc` muda SÓ a numeração EAP dos nós — nem o id, nem o
         agrupamento, nem a rede —, então recebê-lo aqui não move um número
         deste retorno e faz a árvore nascer uma vez para os dois usos.
         Os params continuam sendo os GRAVADOS (o ⚠ acima). */
      var P = this._contexto(mem, orc, this._params(orc), calc, !!semPiso).P;
      var marcos = cron.marcos || {}, porId = {}, grupos = [];
      P.grupos.forEach(function (g) {
        var id = g.no.id, ehMarco = own(marcos, id) && marcos[id] === true, bruto = g.rede ? g.rede.S : 0;
        // etapa marco e etapa só de marcos (S = 0) não têm vão: 0 em `duracoes` o master ignora
        var vale = !!g.rede && !ehMarco && bruto > 0;
        var S = vale ? (semPiso ? Math.max(1, Math.ceil(bruto - 1e-9)) : bruto) : 0;
        grupos.push({ id: id, temFolhas: !!g.rede, marco: ehMarco, vale: vale, S: S, bruto: bruto });
        if (vale) porId[id] = S; else if (own(porId, id)) delete porId[id];
      });
      return { porId: porId, grupos: grupos };
    },

    /* ⚠ A DATA DO ORÇAMENTO APROVADO É A GRAVADA (12/09/2026).
       Com o vão ao vivo (adendo A1) a duração de uma etapa COM subetapas passa
       a ser o vão calculado AGORA. Num orçamento APROVADO isso reabre pela
       janela o que a trava de aprovação fecha na porta: qualquer coisa que
       mexa nas subetapas por fora — reprecificação em lote, EAP do BIM,
       vínculo do BIM, Hh da Execução, importação — mudaria a ENTREGA impressa
       numa proposta que já virou contrato, sem ninguém salvar nada e sem
       recado. Medido antes desta trava: a mesma aprovada dava 217 dias úteis
       nesta versão e 124 na anterior.
       No aprovado, então, `estimar` volta a ler `duracoes` como está GRAVADA:
       é o número materializado no momento da aprovação (`App.orcAprovar`
       materializa ANTES de virar o estado) e é o que o PDF já entregue, a
       proposta, o Portal e o aparelho com a versão anterior têm na mão.
       ⚠ O PLANO DE EXECUÇÃO DA OBRA NÃO É O APROVADO. O clone que
       `CronoBase.orcComPlano` entrega leva a marca `_planoDaObra` e continua
       AO VIVO — é nele que a obra se replaneja (chuva, atraso, outra
       sequência) sem tocar na proposta. Por isso a marca é conferida aqui: o
       clone copia `estadoAprovacao` do orçamento e, sem ela, o plano da obra
       nasceria congelado no prazo do contrato.
       ⚠ REGRA REPLICADA de `Orcamento.travadoPorAprovacao` (orcamento.js), de
       propósito: o motor é PURO (I4) e roda onde o Orcamento pode não estar
       carregado — no vm da paridade, no Node das suítes, no PDF. A réplica é
       UMA expressão, e as duas são comparadas EXECUTANDO em
       tools/test-crono-vivo.js sobre a mesma lista de estados: se uma mudar
       sem a outra, a suíte reprova. */
    congeladoPorAprovacao: function (orc) {
      if (!orc || typeof orc !== "object") return false;
      if (own(orc, "_planoDaObra")) return false;
      return String((orc && orc.estadoAprovacao) || "").trim() === "aprovado";
    },

    /* Para os GRAVADORES DIRETOS (os que gravam o orçamento sem passar pelo
       App.persistir). Com o cálculo ao vivo a versão nova já dá a data certa;
       isto só mantém o que fica GRAVADO igual a ela, para o aparelho com a
       versão anterior. BARATO quando não há nada a fazer: modo desligado e
       nenhuma marca "subetapas" → devolve null sem montar árvore (a
       reprecificação em lote passa por dezenas de orçamentos).
       ⚠ Não decide trava de aprovação nem chama `Orcamento.sincronizarPrazo`:
       isso é do chamador (a mesma ordem do persistir: trava → materializar →
       sincronizarPrazo). Devolve null ou o retorno do `materializar`. */
    materializarSeExec: function (orc) { return this.materializarCrono(orc, { seNecessario: true }); },

    /* O prazo que o aparelho com a VERSÃO ANTERIOR do app mostra para este
       orçamento: o `estimar` de hoje lendo `duracoes` como estão gravadas
       (com o modo desligado o motor novo é o master — a paridade prova). É o
       "antes" honesto do recado do salvar: com o cálculo ao vivo, o prazo
       desta tela não muda no salvar; o que muda é o dos outros aparelhos.
       Não toca no orçamento (cópia rasa só do caminho até `exec`).

       ⚠ A CÓPIA TEM DE APAGAR **TUDO** O QUE A VERSÃO ANTERIOR NÃO LÊ
       (12/09/2026). Ela zerava só `exec.rede`. Quando a 1.2.76 acrescentou
       dois campos que o motor da 1.2.75 ignora — o mapa `cronograma.restricoes`
       (a data fixada pelo arrasto da barra no Gantt) e o parâmetro
       `params.opcionaisNoPrazo` (a etapa opcional fora do prazo) — a cópia
       continuou LENDO os dois, e a função passou a responder o prazo DESTA
       versão com a etiqueta da anterior. MEDIDO numa obra de 4 etapas (1
       opcional, restrição "não iniciar antes de" na Pintura): a função dizia
       103 dias úteis e o motor de 24fa087 (a 1.2.75 instalada) dá 111 — o
       recado do salvar (js/app.js, `_cronoMaterializar`) afirmava ao usuário
       que o outro aparelho ia ver 103. Recado que mente é pior que recado
       nenhum: quem confere o prazo com o sócio no celular vê outro número.
       Por isso a cópia agora nasce também quando NÃO há modo executivo — os
       dois campos novos mudam a data em qualquer modo, e a função é pública
       (a tela, a e2e e o `alinhado` do test-crono-fiacao chamam).
       ⚠ O `override` entra na mesma régua: params passados pelo chamador
       vencem os do orçamento (`_params`), e um `opcionaisNoPrazo` vindo de lá
       reabriria o mesmo buraco por outra porta.
       ⚠ UMA CÓPIA SÓ PARA OS DOIS USOS (`_semCamposNovos`): `estimarFrota`
       precisa exatamente da mesma limpeza, e duas rotinas de cópia do mesmo
       contrato divergem na primeira manutenção — aqui divergir é a mesma obra
       com duas datas de entrega. */
    estimarVersaoAnterior: function (orc, override) {
      return this.estimar(this._semCamposNovos(orc, true), this._ovSemCamposNovos(override));
    },

    /* O prazo que TODA a frota calcula IGUAL: a limpeza acima sem desligar o
       modo executivo — porque a 1.2.75 CONHECE o modo e calcula o vão ao vivo
       igualzinho a esta versão (o que ela não conhece são os dois campos
       novos). É a régua de qualquer número que vá para campo PERSISTIDO e
       SINCRONIZADO (hoje `cronogramaMeses`, via `Orcamento.mesesSugeridos`).
       ⚠ POR QUE NÃO SERVE O `estimarVersaoAnterior` AQUI (medido em
       12/09/2026, corpus de 600 orçamentos gerados, 465 com campo novo):
       `mesesSugeridos` como estava divergia da 1.2.75 em 293 deles; pela régua
       do `estimarVersaoAnterior` (que desliga o `exec.rede`) ainda divergia em
       33 — o dia de diferença do modo desligado cai em cima da virada do mês e
       vira uma COLUNA de desembolso a mais na proposta; por esta régua,
       0 de 600. Campo que a nuvem carrega e que duas versões calculam
       diferente fica em pingue-pongue a cada abertura. */
    estimarFrota: function (orc, override) {
      return this.estimar(this._semCamposNovos(orc, false), this._ovSemCamposNovos(override));
    },

    /* A cópia RASA do orçamento sem o que a versão anterior do app não lê.
       `desligarExec` = também fingir que o modo executivo está desligado (só o
       `estimarVersaoAnterior` pede isso; ver o ⚠ dele).
       ⚠ Devolve o PRÓPRIO orçamento quando não há nada a tirar: é o caminho de
       quase todo orçamento da base, e nele esta função não custa nem uma
       alocação. NUNCA escreve no original — quem chama passa o orçamento vivo
       da tela. */
    _semCamposNovos: function (orc, desligarExec) {
      var cr = orc && orc.cronograma, k;
      if (!cr || typeof cr !== "object") return orc;
      var pr = cr.params && typeof cr.params === "object" ? cr.params : null;
      var temExec = !!desligarExec && !!(cr.exec && cr.exec.rede === true);
      var temRestr = own(cr, "restricoes") && cr.restricoes != null;
      var temOpc = !!(pr && pr.opcionaisNoPrazo != null && pr.opcionaisNoPrazo !== true);
      /* planejador 1A (I9): a régua da frota (1.2.75) nunca lê extensão — a
         sombra que ela lê é a dos mapas de sempre */
      var CH = this.CHAVES_NOVAS_CRON, temNovo = false, i2;
      for (i2 = 0; i2 < CH.length; i2++) if (own(cr, CH[i2])) { temNovo = true; break; }
      var temObj = own(orc, "_avancoDaObra") || own(orc, "_iaOrc") || own(orc, "_iaResumo");
      if (!temExec && !temRestr && !temOpc && !temNovo && !temObj) return orc;
      var c = {}, c2 = {};
      for (k in orc) if (own(orc, k) && k !== "_avancoDaObra") c[k] = orc[k];
      for (k in cr) if (own(cr, k) && CH.indexOf(k) < 0) c2[k] = cr[k];
      if (temExec) {
        var ex = {};
        for (k in cr.exec) if (own(cr.exec, k)) ex[k] = cr.exec[k];
        ex.rede = false; c2.exec = ex;
      }
      // a versão anterior ignora o mapa: ela desenha a etapa na posição da REDE
      if (temRestr) delete c2.restricoes;
      if (temOpc) {
        var p2 = {};
        for (k in pr) if (own(pr, k)) p2[k] = pr[k];
        p2.opcionaisNoPrazo = true; c2.params = p2;
      }
      c.cronograma = c2;
      return c;
    },

    /* O mesmo para o `override` do chamador (ver o ⚠ de `estimarVersaoAnterior`). */
    _ovSemCamposNovos: function (override) {
      if (!override || override.opcionaisNoPrazo == null || override.opcionaisNoPrazo === true) return override;
      var o2 = {}, k;
      for (k in override) if (own(override, k)) o2[k] = override[k];
      delete o2.opcionaisNoPrazo;
      return o2;
    },

    /* "Antes → depois" de ligar (ou desligar) o modo executivo, sem tocar no
       orçamento. `arredondamento` = dias que vêm só do piso de 1 dia (e do
       ceil) por subetapa: cinco subetapas de 0,2 equipe-dia davam 1 dia e
       passam a 5 — a pessoa lia "+4 dias, mais realista" quando era só
       arredondamento. `prazoTexto` compara com o texto "Prazo de execução" da
       proposta (só avisa; não edita o texto). */
    simularExec: function (orc, ligar) {
      var self = this, atual = !!(orc && orc.cronograma && orc.cronograma.exec && orc.cronograma.exec.rede === true);
      ligar = ligar == null ? !atual : !!ligar;
      function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
      function comModo(liga, semPiso) {
        var c = clone(orc); c.cronograma = c.cronograma || {};
        var ex = {}, k; for (k in (c.cronograma.exec || {})) ex[k] = c.cronograma.exec[k];
        ex.rede = liga; c.cronograma.exec = ex;
        /* `simulacao`: a CÓPIA é materializada mesmo num orçamento aprovado —
           senão o "antes → depois" de um aprovado sairia "não muda nada", que
           é falso. Nada daqui é gravado; o orçamento de verdade continua com a
           data aprovada (ver `congeladoPorAprovacao`). */
        var m = self.materializar(c, { semPiso: semPiso, simulacao: true });
        /* ⚠ SEM PISO, a cópia DESLIGA o modo depois de gravar: ligado, o
           `estimar` ao vivo (A1) recalcularia o vão COM o piso de 1 dia e a
           parcela de arredondamento sairia sempre 0 — "+4 dias, mais
           realista" quando era só arredondamento. Desligado, ele lê o vão sem
           piso que acabou de ser gravado (o caminho de hoje). */
        if (semPiso) ex.rede = false;
        return { orc: c, mat: m };
      }
      var p0 = this._params(orc), fix = p0.dataInicio ? null : { dataInicio: this._ch(new Date()) };
      var rA = this.estimar(clone(orc), fix), D = comModo(ligar, false), rD = this.estimar(D.orc, fix), semPiso = null, arred = 0;
      if (ligar) {
        var SP = comModo(true, true), rS = this.estimar(SP.orc, fix);
        semPiso = { totalDias: rS.totalDias, dataFim: rS.dataFim };
        arred = Math.max(0, rD.totalDias - rS.totalDias);
      }
      var etapas = [];
      rA.etapas.forEach(function (e, i) {
        var d = rD.etapas[i];
        if (d && d.duracao !== e.duracao) etapas.push({ etapaId: e.id, antes: e.duracao, depois: d.duracao });
      });
      return { ligar: ligar, antes: { totalDias: rA.totalDias, dataFim: rA.dataFim }, depois: { totalDias: rD.totalDias, dataFim: rD.dataFim },
        arredondamento: arred, semPiso: semPiso, etapas: etapas, avisos: D.mat.avisos, semVao: D.mat.semVao, restauradas: D.mat.restauradas || [],
        prazoTexto: this._prazoTexto(orc && orc.comercial && orc.comercial.prazoExecucao, rD) };
    },

    /* ⚠ QUAL DOS DOIS PRAZOS VAI AO PAPEL (decidido em 12/09/2026, defeito D4).
       Com `opcionaisNoPrazo` desligado o motor devolve DOIS números:
       `r.totalDias` (escopo contratado) e `r.totalDiasComOpcionais`. Esta
       função — e `Orcamento.sincronizarPrazo`, que grava `cronogramaMeses` — só
       leem `r.totalDias`, DE PROPÓSITO: o texto "Prazo de execução" fica na
       mesma folha do "Valor total", e o "Valor total" cobra o
       `precoObrigatorio` (js/orcamento.js:1046), que não inclui opcional.
       Prometer no papel a data do escopo maior e cobrar o menor é a promessa
       que não fecha — é justamente o que este aviso existe para pegar.
       O número COM opcionais é da TELA (os dois lado a lado) e do bloco de
       "adicionais" da proposta, nunca do prazo contratual. */
    /* "90 dias" / "4 meses" no texto livre da proposta × o prazo do cronograma.
       ⚠ O QUALIFICADOR MANDA. "90 dias corridos" só se compara com os dias
       CORRIDOS do cronograma; "90 dias úteis", só com os ÚTEIS. Antes os dois
       números valiam para qualquer texto: numa obra de 90 úteis = 128
       corridos, a proposta dizendo "90 dias corridos" (38 dias a menos do que
       a obra precisa) passava calada — justamente o aviso criado para pegar a
       promessa ao cliente que não fecha.
       "dias" SEM qualificador é ambíguo (contrato costuma ler corrido; muita
       gente escreve pensando em úteis): não se decide pela pessoa — se bater
       só com um dos dois, sai `ambiguo` com os dois números e o pedido de
       escrever "úteis" ou "corridos" na proposta. */
    _prazoTexto: function (txt, r) {
      var m = /(\d+)\s*(dias?(?:\s+(?:úteis|uteis|corridos))?|meses|m[eê]s|semanas?)/i.exec(String(txt == null ? "" : txt));
      if (!m || !r || !r.dataInicio || !r.dataFim) return null;
      var n = parseInt(m[1], 10), u = m[2].toLowerCase(), dpw = num((r.params && r.params.diasUteisSemana) || 5) || 5;
      var corridos = Math.round((meiaNoite(r.dataFim) - meiaNoite(r.dataInicio)) / 86400000);
      var meses = Math.max(1, Math.ceil(r.totalDias / (dpw * 4.345)));
      var unidade = /^d/.test(u) ? "dias" : (/^s/.test(u) ? "semanas" : "meses");
      var qual = unidade !== "dias" ? null : (/corridos/.test(u) ? "corridos" : (/[uú]teis/.test(u) ? "uteis" : null));
      var difere, ambiguo = false;
      if (unidade === "dias") {
        if (qual === "corridos") difere = n !== corridos;
        else if (qual === "uteis") difere = n !== r.totalDias;
        else { difere = n !== r.totalDias && n !== corridos; ambiguo = !difere && r.totalDias !== corridos; }
      } else difere = unidade === "semanas" ? (n !== r.totalSemanas && n !== Math.ceil(corridos / 7)) : n !== meses;
      var f = r.dataFim, fim = ("0" + f.getDate()).slice(-2) + "/" + ("0" + (f.getMonth() + 1)).slice(-2) + "/" + f.getFullYear();
      var dois = r.totalDias + " dias úteis (" + corridos + " corridos, " + meses + " " + (meses === 1 ? "mês" : "meses") + ", término " + fim + ")";
      /* ⚠ PRAZO CONTRATADO ZERO NÃO MANDA CORRIGIR A PROPOSTA PARA ZERO
         (12/09/2026). Num orçamento em que TODAS as etapas são opcionais e o
         interruptor está desligado, `r.totalDias` é 0 — e o texto de sempre
         saía "o cronograma passa a dar 0 dias úteis (0 corridos, 1 mês,
         término 08/09/2026)", que é mandar a pessoa por uma porta fechada:
         ninguém escreve "prazo: 0 dias" numa proposta. `r.opcionais` só existe
         com o interruptor desligado E etapa opcional — no caminho de sempre
         esta guarda não roda e o texto é o de antes (a paridade cobra). */
      var semEscopo = r.totalDias === 0 && !!r.opcionais;
      return { texto: m[0], numero: n, unidade: unidade, qualificador: qual, cronograma: { diasUteis: r.totalDias, corridos: corridos, semanas: r.totalSemanas, meses: meses },
        difere: difere, ambiguo: ambiguo, semEscopo: semEscopo,
        msg: semEscopo ? "O texto da proposta diz \"" + m[0] + "\", mas este orçamento não tem prazo CONTRATADO: todas as etapas estão marcadas como opcionais" +
            (r.totalDiasComOpcionais != null ? " (com elas dentro, a obra pede " + r.totalDiasComOpcionais + " dias úteis)" : "") +
            ". Desmarque \"opcional\" no que o \"Valor total\" cobra antes de comparar o prazo."
          : (difere ? "O texto da proposta diz \"" + m[0] + "\"; o cronograma passa a dar " + dois + "."
          : (ambiguo ? "O texto da proposta diz \"" + m[0] + "\" sem dizer se são úteis ou corridos; o cronograma dá " + dois +
            ". Escreva \"dias úteis\" ou \"dias corridos\" no prazo da proposta." : null)) };
    },

    /* "Limpar edições" (cronReset) em função pura: zera as edições de etapa E
       de folha (`sub.*`), mantém `params` e `exec` (são parâmetros, não
       edições) e rematerializa — sem isto o recado "voltaram à estimativa do
       agente" mentia: a duração "subetapas" e a rede interna continuavam. */
    limparEdicoes: function (orc) {
      if (!orc) return null;
      /* ⚠ no APROVADO não se limpa nada: a duração gravada É a data aprovada
         (`congeladoPorAprovacao`), e zerá-la jogaria a entrega do contrato na
         estimativa por categoria. A tela já para antes (cronReset olha
         `alvo.travado`); esta é a segunda porta. O plano da obra passa. */
      if (this.congeladoPorAprovacao(orc)) return { aprovado: true, materializacao: null };
      var c = orc.cronograma;
      if (c && typeof c === "object") {
        c.duracoes = {}; c.iaMotivos = {}; c.duracoesAgente = {}; c.predecessoras = {}; c.lags = {}; c.marcos = {};
        c.sub = {};
        /* ⚠ a DATA FIXADA pelo arrasto também é edição. Ficando, "Limpar
           edições" devolvia a estimativa do agente e mantinha a etapa presa
           no dia que alguém arrastou — o recado dizia que tudo voltou ao
           automático e a entrega continuava sendo a de antes. */
        c.restricoes = {};
        /* ⚠ a marca de proveniência da IA no "Depende de" (js/iaedit.js) sai
           junto (a das subetapas já saiu com `sub`). Ficando, um "Depende de"
           refeito à mão IGUAL ao que a IA tinha gravado passaria por "da IA"
           e viria MARCADO no próximo diff — por cima de uma decisão humana. */
        delete c.iaProv;
        /* ⚠ a duração guardada ao ligar o modo executivo também é EDIÇÃO: sem
           isto, "Limpar edições" seguido de desligar trazia de volta o 45
           digitado que a pessoa acabou de mandar limpar */
        if (c.exec && typeof c.exec === "object" && !Array.isArray(c.exec)) delete c.exec.anterior;
        /* planejador 1A (§2.9): a rede digitada e a sombra saem junto (as
           ligações TT/IT e as restrições voltam ao padrão); ficam as tarefas
           sem preço, os calendários e o avanço lançado — e as datas que eles
           seguram voltam no `materializar` logo abaixo */
        delete c.rede; delete c.mat;
        if (ehObj(c.cal)) { delete c.cal.dur; delete c.cal.agente; }
      }
      return { materializacao: this.materializar(orc) };
    },

    /* "Depende de" de uma FOLHA, pelo nº EAP da MESMA etapa: "2.3", "2.g",
       "2.3+2" (espera), "2.3-1" (avanço), "2.3II" (início-início),
       "2.3II+5", "0" (sem predecessora = início da etapa), vazio (padrão:
       cascata). Nº de outra etapa, de serviço, inexistente, a própria folha ou
       texto → `invalidos`, e NUNCA vira [] (gravar "sem predecessora" no lugar
       de um erro de digitação mudaria o cronograma calado).
       `folhas` = [{id, numero}] das folhas da etapa (nós de `r.atividades`). */
    parsePredsSub: function (txt, folhas, selfId, opts) {
      if (opts) return this._parseRede(txt, "folha", { folhas: folhas, selfId: selfId, opts: opts });
      var s = String(txt == null ? "" : txt).trim();
      if (!s) return { preds: null, lags: {}, tipos: {}, invalidos: [] };
      if (s === "0" || s === "-") return { preds: [], lags: {}, tipos: {}, invalidos: [] };
      var porNum = {}, preds = [], lags = {}, tipos = {}, invalidos = [];
      arr(folhas).forEach(function (f) { if (f && f.numero) porNum[String(f.numero).toLowerCase()] = f.id; });
      s.split(/[,;\s]+/).forEach(function (tk) {
        if (!tk) return;
        var m = /^(\d+\.(?:\d+|g))(ii)?(?:([+\-])(\d+))?$/i.exec(tk);
        var chave = m ? m[1].toLowerCase() : "", id = m && own(porNum, chave) ? porNum[chave] : null;
        if (!id || id === selfId) { invalidos.push(tk); return; }
        if (preds.indexOf(id) < 0) preds.push(id);
        if (m[3]) lags[id] = (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10);
        if (m[2]) tipos[id] = "II";
      });
      return { preds: preds.length ? preds : null, lags: lags, tipos: tipos, invalidos: invalidos };
    },

    // o inverso: a rede EFETIVA de uma folha de volta ao texto ("2.g,2.3II+5")
    predsTextoSub: function (no, numPorId, opts) {
      if (opts && Array.isArray(opts.elos)) return this._textoRede(opts.elos, numPorId, opts);
      // ⚠ mesma razão do `predsTexto`: com rede digitada o texto sai da rede
      var elosS = this._elosLegiveis(this.elosDoNo(no), numPorId, opts);
      if (elosS) return this._textoRede(elosS, numPorId, { etapasNum: (opts && opts.etapasNum) || null, vazioExplicito: false });
      if (!no || !no.preds || !no.preds.length) return no && no.predsExplicito ? "0" : "";
      return no.preds.map(function (p) {
        var lag = no.predLag && no.predLag[p], ii = !!(no.predTipo && no.predTipo[p] === "II");
        return (numPorId && numPorId[p] != null ? numPorId[p] : "?") + (ii ? "II" : "") + (lag != null ? (lag < 0 ? "-" + (-lag) : "+" + lag) : "");
      }).join(",");
    },

    /* =================================================================
       O "DEPENDE DE" COM OS QUATRO TIPOS (planejador 1A, O23; REDE §c.1).
       token := REF [TIPO] [(+|-)N]
         na ETAPA:   REF = nº da etapa (1..n) · nº EAP de subetapa de OUTRA
                     etapa ("5.2", o elo cruzado, O26) · "0" sozinho = sem
                     predecessora
         na SUBETAPA: REF = nº EAP de subetapa da MESMA etapa ("7.1") · de
                     OUTRA etapa ("5.1") · "E5" = a etapa 5 inteira.
                     ⚠ "5" SOZINHO CONTINUA RECUSADO (O23): na 1.2.81 o "1" na
                     linha da 7.2 é recusado com a dica "use 7.1, 7.3…"; o
                     desenho da REDE (c.1) o transformava em "depende da etapa
                     1 inteira" — o atalho para a irmã virava elo cruzado sem
                     aviso.
         na LINHA T (tarefa sem preço, `nivel` "extra"): REF = nº da etapa ·
                     "T2" (outra tarefa sem preço); subetapa é RECUSADA
                     ("Tarefa sem preço se liga a etapa, não a subetapa.")
         "T3" (commit EXTRAS): na etapa, a tarefa sem preço que SEGURA a etapa
                     (vai a `x.sucs`, nunca a `predecessoras`); "0,T1" = sem
                     etapa predecessora, só a T1 (O23). Na subetapa, recusado.
         TIPO = TI (padrão) | II | TT | IT — maiúscula ou minúscula
       "#11" é RECUSADO com o motivo: é o nº da linha da planilha do Excel
       (`rowDe[pid] − 6`, js/excel.js), não o nº da tarefa.
       A mesma ref duas vezes é RECUSADA ("entre duas tarefas só existe uma
       ligação") — hoje ela era deduplicada calada.
       Devolve {preds, lags, tipos, elos: [{i, t, l}], extras: [{i, t, l}],
       invalidos: [token], motivos: [{token, motivo, dica?}]}: `elos` é a rede
       DIGITADA, na ordem (a forma de `rede.*.e`), SEM as tarefas sem preço;
       `extras` = os elos com T (espera ausente = 0); `preds`/`lags`/`tipos`
       são a parte que cabe nos mapas de sempre (só refs do MESMO nível). Nada
       parcial: quem chama recusa tudo quando `invalidos` não está vazio.
       `ctx.opts`: {folhas: [{id, numero, etapaId}] de TODA a obra (a ref
       cruzada), etapaId (a da linha, na subetapa), etapas: [ids em ordem],
       extras: [ids na ordem da lista] (T1 = o primeiro)}.
       ================================================================= */
    _parseRede: function (txt, nivel, ctx) {
      var s = String(txt == null ? "" : txt).trim(), o = ctx.opts || {};
      var out = { preds: null, lags: {}, tipos: {}, elos: [], extras: [], invalidos: [], motivos: [] };
      if (!s) return out;
      if (s === "0" || s === "-") { out.preds = []; return out; }
      var extras = arr(o.extras), toks0 = s.split(/[,;\s]+/).filter(function (x) { return !!x; });
      /* "0,T1" (O23): o zero junto de T quer dizer "sem etapa predecessora" —
         só na ETAPA, e só com T (zero com etapa continua recusado) */
      var zeroComT = nivel === "etapa" && toks0.indexOf("0") >= 0 && toks0.length > 1 &&
        toks0.every(function (x) { return x === "0" || /^t\d+/i.test(x); });
      var porNumF = {}, porIdF = {}, etapas = arr(nivel === "etapa" ? ctx.ordem : o.etapas), selfEt = nivel === "folha" ? o.etapaId : (nivel === "extra" ? null : ctx.selfId);
      arr(o.folhas).forEach(function (f) { if (f && f.numero != null) { porNumF[String(f.numero).toLowerCase()] = f; porIdF[f.id] = f; } });
      if (nivel === "folha") arr(ctx.folhas).forEach(function (f) { if (f && f.numero != null && !own(porNumF, String(f.numero).toLowerCase())) { var x = { id: f.id, numero: f.numero, etapaId: selfEt }; porNumF[String(f.numero).toLowerCase()] = x; porIdF[f.id] = x; } });
      var vistos = {}, mesmoNivel = [];
      function recusa(tk, motivo, dica) { out.invalidos.push(tk); var m = { token: tk, motivo: motivo }; if (dica) m.dica = dica; out.motivos.push(m); }
      s.split(/[,;\s]+/).forEach(function (tk) {
        if (!tk) return;
        if (/^#\d+/.test(tk)) { recusa(tk, "linha", "é o nº da linha da planilha; aqui use o nº da etapa"); return; }
        if (tk === "0" && zeroComT) return;
        var mT = /^t(\d+)(ti|ii|tt|it)?(?:([+\-])(\d{1,3}))?$/i.exec(tk);
        if (mT) {
          if (nivel === "folha") { recusa(tk, "extra-folha", "tarefa sem preço se liga a etapa, não a subetapa"); return; }
          var nx = parseInt(mT[1], 10), xid = (nx >= 1 && nx <= extras.length) ? extras[nx - 1] : null;
          if (!xid) { recusa(tk, "numero"); return; }
          if (xid === ctx.selfId) { recusa(tk, "propria"); return; }
          if (own(vistos, xid)) { recusa(tk, "repetido"); return; }
          vistos[xid] = true;
          out.extras.push({ i: xid, t: (mT[2] || "TI").toUpperCase(), l: mT[3] ? (mT[3] === "-" ? -1 : 1) * parseInt(mT[4], 10) : 0 });
          return;
        }
        var m = /^(e\d+|\d+(?:\.(?:\d+|g))?)(ti|ii|tt|it)?(?:([+\-])(\d{1,3}))?$/i.exec(tk);
        if (!m) { recusa(tk, /^\d+(?:\.(?:\d+|g))?[a-z]+/i.test(tk) ? "tipo" : "forma"); return; }
        var ref = m[1].toLowerCase(), tipo = (m[2] || "TI").toUpperCase(), lag = m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) : null;
        var id = null, mesmo = false;
        if (ref === "0") { recusa(tk, "zero"); return; }
        if (/^e\d+$/.test(ref)) {
          if (nivel !== "folha") { recusa(tk, "forma"); return; }
          var ne = parseInt(ref.slice(1), 10);
          id = (ne >= 1 && ne <= etapas.length) ? etapas[ne - 1] : null;
          if (!id) { recusa(tk, "numero"); return; }
          if (id === selfEt) { recusa(tk, "propria-etapa"); return; }
        } else if (ref.indexOf(".") < 0) {
          var n = parseInt(ref, 10);
          if (nivel === "extra") {
            id = (n >= 1 && n <= etapas.length) ? etapas[n - 1] : null;
            if (!id) { recusa(tk, "numero"); return; }
            if (own(vistos, id)) { recusa(tk, "repetido"); return; }
            vistos[id] = true;
            out.extras.push({ i: id, t: (m[2] || "TI").toUpperCase(), l: m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) : 0 });
            return;
          }
          if (nivel === "folha") {
            recusa(tk, "etapa-sem-e", "para depender da etapa " + n + " inteira, escreva E" + n);
            return;
          }
          id = (n >= 1 && n <= etapas.length) ? etapas[n - 1] : null;
          if (!id) { recusa(tk, "numero"); return; }
          if (id === ctx.selfId) { recusa(tk, "propria"); return; }
          mesmo = true;
        } else {
          if (nivel === "extra") { recusa(tk, "extra-folha", "tarefa sem preço se liga a etapa, não a subetapa"); return; }
          var f = own(porNumF, ref) ? porNumF[ref] : null;
          if (!f) { recusa(tk, "numero"); return; }
          id = f.id;
          if (nivel === "etapa") {
            if (f.etapaId === ctx.selfId) { recusa(tk, "folha-da-propria"); return; }
          } else {
            if (id === ctx.selfId) { recusa(tk, "propria"); return; }
            mesmo = f.etapaId === selfEt;
          }
        }
        if (own(vistos, id)) { recusa(tk, "repetido"); return; }
        vistos[id] = true;
        var el = { i: id, t: tipo, l: lag };
        out.elos.push(el);
        if (mesmo) mesmoNivel.push(el);
      });
      if (out.invalidos.length) { out.extras = []; return out; }
      if (nivel === "extra") { out.preds = null; return out; }
      /* só T (sem etapa nem subetapa) na etapa: a cascata de sempre continua
         (preds null) e a T entra; "0,T1" é que tira a cascata */
      if (nivel === "etapa" && !out.elos.length && out.extras.length && !zeroComT) return out;
      out.preds = [];
      mesmoNivel.forEach(function (el) {
        out.preds.push(el.i);
        if (el.l != null) out.lags[el.i] = el.l;
        if (el.t !== "TI") out.tipos[el.i] = el.t;
      });
      return out;
    },
    /* o "Depende de" da LINHA T (tarefa sem preço): etapas e outras T.
       Devolve o `_parseRede` com `extras` = os elos digitados (vazio → []:
       "começa no dia 0 da obra"; a linha T não tem cascata implícita). */
    parsePredsExtra: function (txt, xid, opts) {
      var s = String(txt == null ? "" : txt).trim();
      if (!s || s === "0" || s === "-") return { preds: null, lags: {}, tipos: {}, elos: [], extras: [], invalidos: [], motivos: [] };
      return this._parseRede(s, "extra", { selfId: xid, opts: opts || {} });
    },

    /* o texto de uma rede DIGITADA (a mesma sintaxe do parse): REF + tipo
       (≠ TI) + espera (quando digitada). `num` = {id: "3" | "5.2" | "T1"};
       na subetapa, a etapa inteira sai "E5" (`opts.etapasNum`). */
    _textoRede: function (elos, num, opts) {
      if (!elos.length) return (opts && opts.vazioExplicito === false) ? "" : "0";
      var en = (opts && opts.etapasNum) || {};
      return elos.map(function (el) {
        var ref = own(en, el.i) ? "E" + en[el.i] : (num && num[el.i] != null ? String(num[el.i]) : "?");
        // ⚠ elo com tarefa sem preço: espera 0 é o padrão (não se escreve "+0")
        var lz = el.x ? (el.l ? el.l : null) : el.l;
        return ref + (el.t && el.t !== "TI" ? el.t : "") + (lz != null ? (lz < 0 ? "-" + (-lz) : "+" + lz) : "");
      }).join(",");
    },

    /* Distribuição mensal por CAMADA do cronograma executivo. `"folha"` =
       cada folha de rede (etapa sem filhos entra como ela mesma); `"servico"`
       = cada serviço (os soltos também) e a etapa sem nenhum serviço.
       ⚠ Valores de venda OBRIGATÓRIOS (`Orcamento.valoresEAP`): sem eles,
       erro — nunca o custo direto no lugar (margem do escritório virando
       curva do cliente). O TOTAL fecha com o nível etapa e cada nó fecha o
       próprio valor; mês a mês NÃO fecha com o desembolso da proposta (é
       matemática, não defeito: dentro da etapa o dinheiro vai para quando a
       subetapa acontece), por isso sai com `rotulo`. O desembolso de REGISTRO
       continua no nível etapa. */
    _periodosCamada: function (r, opts) {
      var self = this, camada = opts.camada;
      function vazio(erro) {
        var o = { lista: [], total: 0, meses: 0, porNo: {}, camada: camada, rotulo: self.ROTULO_CAMADA, picoFrentes: 0, mesPico: null, nos: 0 };
        if (erro) o.erro = erro; return o;
      }
      if (camada !== "folha" && camada !== "servico") return vazio("camada desconhecida: " + camada + " (use \"folha\" ou \"servico\")");
      if (!r || !Array.isArray(r.atividades)) return vazio("o cronograma não tem a árvore EAP — chame Cronograma.estimar(orc, override, {eap: true})");
      var Vo = opts.valores;
      if (!Vo) return vazio("valores de venda ausentes — a camada detalhada só distribui preço de venda (Orcamento.valoresEAP), nunca custo");
      if (Vo.ok === false) return vazio(Vo.motivo || "valores de venda indisponíveis");
      var V = Vo.porId || Vo;
      if (!r.etapas || !r.etapas.length || !r.dataInicio) return vazio(null);
      var cal = this.calendario(r), porId = {};
      /* ⚠ início INVÁLIDO (Invalid Date é objeto, então o `!r.dataInicio` acima
         não pega): sem esta guarda o `cal.dia(i)` lançava TypeError e levava a
         aba junto — o nível etapa (master) devolve vazio sem lançar. */
      if (!cal) return vazio("a data de início do cronograma é inválida — corrija o campo Início da aba Cronograma.");
      var y0 = r.dataInicio.getFullYear(), m0 = r.dataInicio.getMonth();
      r.atividades.forEach(function (n) { if (!own(porId, n.id)) porId[n.id] = n; });
      function bal(d) { return (d.getFullYear() - y0) * 12 + (d.getMonth() - m0); }
      /* ⚠ A MESMA RÉGUA ESTICADA DO `periodos` (12/09/2026). Aqui o valor não
         SUMIA — o clamp abaixo o punha no último mês contratado —, mas isso é
         pior: MEDIDO na fixture `rNia` (opcional fixada em 01/12/2026, régua de
         2 meses) os R$ 43.200,00 da piscina caíam em out/26, um mês em que não
         há serviço nenhum dela. Buraco a pessoa vê; mês errado ela confere e
         acredita. Com a régua até a última etapa o valor cai em dez/26, que é
         onde a barra está. `r.opcionais` só existe com o interruptor desligado
         e etapa opcional — sem ela isto devolve `r.dataFim`, o de sempre. */
      var fimReg = r.dataFim;
      if (r.opcionais) r.atividades.forEach(function (n) { if (n.dataFim && n.dataFim > fimReg) fimReg = n.dataFim; });
      var nMax = Math.max(1, bal(fimReg) + 1), lista = [], i;
      // ⚠ mês fora da régua cai no 1º/último: valor não pode sumir da soma
      function idx(d) { return Math.max(0, Math.min(nMax - 1, bal(d))); }
      var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      for (i = 0; i < nMax; i++) {
        var dRef = new Date(y0, m0 + i, 1);
        lista.push({ i: i, ano: dRef.getFullYear(), mes: dRef.getMonth(), rotulo: MES[dRef.getMonth()] + "/" + String(dRef.getFullYear()).slice(2),
          valor: 0, equipeDias: 0, diasUteis: 0, frentes: 0, etapas: [], nos: [] });
      }
      var totDias = Math.ceil((r.totalDias || 0) - 1e-9);
      for (i = 0; i < totDias; i++) lista[idx(cal.dia(i))].diasUteis++;
      var sel = r.atividades.filter(function (n) {
        if (camada === "folha") return n.tipo === "subetapa" || n.tipo === "soltos" || (n.tipo === "etapa" && n.papel === "folha");
        return n.tipo === "servico" || (n.tipo === "etapa" && !(n.filhos && n.filhos.length));
      });
      var total = 0, porNo = {};
      sel.forEach(function (n) {
        var col = [], z; for (z = 0; z < nMax; z++) col.push(0);
        porNo[n.id] = col;
        var v = (own(V, n.id) && V[n.id] != null) ? num(V[n.id]) : 0; total += v;
        var w = n.inicio == null ? (porId[n.paiId] || n) : n;   // serviço sem base: janela do pai (o valor dele não some)
        var ed = n.equipeDias || 0;
        function poe(b, val, edv) {
          lista[b].valor += val; lista[b].equipeDias += edv; col[b] += val;
          if (lista[b].nos.indexOf(n.id) < 0) lista[b].nos.push(n.id);
          if (lista[b].etapas.indexOf(n.etapaId) < 0) lista[b].etapas.push(n.etapaId);
        }
        if (w.inicio == null) { poe(0, v, ed); return; }
        var nd = Math.ceil(Math.max(0, (w.fim || 0) - w.inicio) - 1e-9);
        if (!nd) { poe(idx(cal.dia(w.inicio)), v, ed); return; }
        for (var k = 0; k < nd; k++) poe(idx(cal.dia(w.inicio + k)), v / nd, ed / nd);
      });
      var acum = 0, foraDe100 = false;
      lista.forEach(function (p) {
        p.frentes = p.diasUteis ? Math.round((p.equipeDias / p.diasUteis) * 10) / 10 : 0;
        acum += p.valor; p.acum = acum;
        p.pct = total ? (p.valor / total) * 100 : 0;
        p.acumPct = total ? (acum / total) * 100 : 0;
        if (p.acumPct > 100.005 || p.acumPct < -0.005) foraDe100 = true;
      });
      /* ⚠ NUNCA uma curva acumulada fora de 0–100%. Uma subetapa de DESCONTO
         (valor negativo) numa janela própria faz a camada subir a 44.000% e
         84.000% antes de voltar a 100% (R$ 12.500 de serviço e −12.487,50 de
         desconto: total R$ 12,50). Na curva por etapa o desconto se dilui na
         etapa inteira e a curva é sã. Recusa com o nome de quem causou e a
         porta, em vez de pôr esse número na linha de base da obra. */
      if (foraDe100) {
        var neg = sel.filter(function (n) { return own(V, n.id) && num(V[n.id]) < 0; });
        return vazio((neg.length ? (camada === "folha" ? "a subetapa " : "o serviço ") + neg[0].numero + " (" + String(neg[0].nome || "").slice(0, 40) + ") tem valor negativo (desconto)" +
          (neg.length > 1 ? " — e mais " + (neg.length - 1) : "") : "a distribuição tem valor negativo") +
          " e a curva por " + (camada === "folha" ? "subetapa" : "serviço") + " passaria de 100% — lance o desconto como item dentro das subetapas que ele abate, ou use a distribuição por etapa.");
      }
      var pico = lista.reduce(function (m, p) { return p.frentes > (m ? m.frentes : -1) ? p : m; }, null);
      return { lista: lista, total: total, meses: lista.length, porNo: porNo, picoFrentes: pico ? pico.frentes : 0, mesPico: pico,
        camada: camada, rotulo: this.ROTULO_CAMADA, nos: sel.length };
    },

    /* =================================================================
       RESTRIÇÕES DE DATA DA ETAPA (12/09/2026) — o que a barra arrastada
       no Gantt grava.

       `orc.cronograma.restricoes = { etapaId: {tipo, data} }`, com
         "nia" — NÃO INICIAR ANTES DE: piso na ida do CPM (`inicio =
                 max(rede, restrição)`). É o "Não iniciar antes de" do MS
                 Project (SNET), e é o único jeito honesto de fixar uma
                 barra no calendário sem mentir sobre a rede: a dependência
                 continua mandando quando ela EMPURRA para a direita; a
                 restrição só proíbe começar antes.
         "tae" — TERMINAR ATÉ: só AVISA (`res.restricoes.avisos`), nunca
                 empurra nem encolhe nada. Prazo contratual de uma etapa é
                 recado para a pessoa decidir, não licença para o motor
                 inventar uma duração menor que a obra precisa.

       ⚠ POR QUE MAPA NOVO, E NÃO LAG (a decisão, 12/09/2026). Arrastar uma
       barra podia virar lag na cascata (`lags[id][predId] += N`). Três coisas
       reprovaram o lag para a ETAPA:
        (a) a 1ª etapa (e toda etapa com "Depende de" = 0) não tem elo onde
            pendurar o lag — a barra simplesmente não se moveria, e o recurso
            nasceria com um buraco sem explicação;
        (b) lag ACOMPANHA o predecessor: encurtou a etapa de cima, a barra que
            a pessoa fixou no dia 03/11 anda sozinha — ela fixou uma DATA, não
            uma distância;
        (c) o MS Project (js/msproject.js) já exporta SNET; lag mentiria na
            exportação.
       ⚠ E A VERSÃO ANTERIOR DO APP LÊ SEM CAIR: o mapa é NOVO e SEPARADO
       (I3), `duracoes`/`predecessoras`/`lags`/`marcos` não são tocados. O
       aparelho antigo ignora `restricoes` e desenha a etapa na posição da
       REDE — a mesma que ele desenhava antes do arrasto. Ele nunca vê um
       número errado; vê o número de antes. (A porta para igualar os dois é
       materializar a restrição em lag quando ela couber — pendência.)

       Devolve null quando não há mapa (ou ele voltou como lista): sem isto o
       cronograma de todo orçamento que já existe mudaria de forma. */
    _restricoes: function (orc, etapas) {
      var cron = orc && orc.cronograma, m = cron && cron.restricoes, out = [], inv = [], k;
      if (!m || typeof m !== "object" || Array.isArray(m)) return null;
      var existe = {};
      arr(etapas).forEach(function (e) { if (e && e.id != null) existe[e.id] = true; });
      for (k in m) {
        if (!own(m, k)) continue;
        var v = m[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) { inv.push({ id: k, motivo: "forma" }); continue; }
        var tipo = String(v.tipo == null ? "" : v.tipo).toLowerCase().trim();
        var data = String(v.data == null ? "" : v.data).slice(0, 10);
        if (tipo !== "nia" && tipo !== "tae") { inv.push({ id: k, motivo: "tipo" }); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { inv.push({ id: k, motivo: "data" }); continue; }
        // etapa apagada depois de fixada: a restrição é lixo, e some sem mexer em nada
        if (!own(existe, k)) { inv.push({ id: k, motivo: "etapa" }); continue; }
        out.push({ id: k, tipo: tipo, data: data });
      }
      if (!out.length && !inv.length) return null;
      return { lista: out, invalidos: inv };
    },

    /* Converte cada restrição em ÍNDICE de dia útil (pelo calendário do
       motor, com feriado), roda a ida de novo com o piso e devolve o novo
       totalDias + o que a tela precisa dizer.
       ⚠ A data largada num domingo (ou num feriado) sobe para o PRÓXIMO dia
       útil, nunca desce: "não iniciar antes de domingo" com o índice da
       sexta-feira anterior permitiria começar ANTES do que a pessoa pediu. */
    _aplicarRestricoes: function (restr, etapas, porId, ini, params, fer, totalDias, folgaRest, ida, cal) {
      var self = this, piso = {}, temPiso = false, avisos = [], redeOut = null;
      /* ⚠ A TABELA VEM DO `estimar` (12/09/2026): esta função montava a sua
         própria, e duas tabelas do mesmo calendário divergem na primeira
         manutenção — a restrição cairia num índice de dia útil e a etapa em
         outro. O argumento é opcional só para não deixar chamador de fora sem
         saída; dentro do motor ele sempre vem. */
      if (!cal) cal = this.calendario({ dataInicio: ini, params: params, feriados: { mapa: fer.mapa } });
      var maxR = Math.ceil(totalDias + folgaRest) + 10;
      function dmaS(s) { var p = String(s).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
      function numEt(id) { for (var i = 0; i < etapas.length; i++) if (etapas[i].id === id) return i + 1; return "?"; }
      restr.lista.forEach(function (x) {
        var t = new Date(x.data + "T00:00:00");
        if (isNaN(t.getTime()) || !cal) { restr.invalidos.push({ id: x.id, motivo: "data" }); return; }
        var ms = meiaNoite(t), j = cal.indice(ms, maxR);
        if (j < 0) j = 0;                                   // antes do início da obra: sem efeito
        else if (meiaNoite(cal.dia(j)) < ms) j = j + 1;      // domingo/feriado sobe para o próximo dia útil
        x.indice = j;
        if (x.tipo === "nia") { piso[x.id] = j; temPiso = true; }
      });
      if (temPiso) { redeOut = {}; ida(piso, redeOut); }
      /* ⚠ mesma guarda do `maiorFim` do `estimar`: etapa fora do prazo
         (opcional, duração 0) não estica o total mesmo com data fixada nela.
         `foraDoPrazo` é undefined no caminho de sempre. */
      var novoTotal = etapas.reduce(function (m, e) { return e.foraDoPrazo ? m : Math.max(m, e.fim); }, 0);
      restr.lista.forEach(function (x) {
        var et = porId[x.id];
        if (!et || x.indice == null) return;
        var rede = redeOut && own(redeOut, x.id) ? redeOut[x.id] : et.inicio;
        var estourada = x.tipo === "tae" && et.fim > x.indice;
        et.restricao = { tipo: x.tipo, data: x.data, indice: x.indice, inicioRede: rede,
          ativa: x.tipo === "nia" && et.inicio === x.indice && x.indice > rede, estourada: estourada };
        if (estourada) avisos.push({ tipo: "tae", etapaId: x.id, data: x.data, fim: et.fim, indice: x.indice,
          msg: "Etapa " + numEt(x.id) + ": a restrição “terminar até " + dmaS(x.data) + "” não é cumprida — o plano de hoje termina " +
            (et.fim - x.indice) + " dia(s) útil(eis) depois. A restrição avisa; ela não encurta a etapa nem empurra as outras." });
      });
      restr.invalidos.forEach(function (v) {
        avisos.push({ tipo: "invalida", etapaId: v.id, motivo: v.motivo,
          msg: v.motivo === "etapa" ? "Uma data fixada aponta para uma etapa que não existe mais neste orçamento — ela foi ignorada."
            : "Data fixada em formato inválido (" + v.motivo + ") — ela foi ignorada; o cronograma seguiu pela rede." });
      });
      return { totalDias: novoTotal, saida: { lista: restr.lista, invalidos: restr.invalidos, avisos: avisos } };
    },

    /* =================================================================
       PLANEJADOR — ONDA 0 (T1): o `estimar` VIROU DESPACHANTE.

       POR QUE (espec do planejador, §0.1-2 e §2.2). Quatro frentes (rede,
       tarefas sem preço, calendário, avanço) reescreviam o `estimar` cada uma
       com uma arquitetura, e a mesma função com quatro donos é merge perdido.
       A Onda 0 separa, SEM MUDAR UM NÚMERO:
         `estimar`       — decide QUAL leitura vale (desligado, extensão,
                           formato mais novo, aprovado, sem início);
         `_estimarBase`  — o corpo de sempre, em três fases:
                           (a) etapas e durações, (b) `_idaVolta` (rede, ida,
                           restrições e volta), (c) datas, feriados,
                           opcionais e a árvore;
         `_passoIda` / `_passoInterno` — o corpo do laço da ida (etapas e
                           subetapas), que a projeção da 1A reaproveita para
                           simular a versão anterior sem uma segunda cópia.
       ⚠ I2: sem extensão (`_ext` → null) o resultado é o de hoje, LINHA A
         LINHA, sem chave nova — tools/test-cronograma-paridade.js compara com
         o master b8907ef e reprova chave a mais; tools/test-crono-tomadas.js
         compara com o motor da 1.2.81 real (1e04763).
       ⚠ Até a 1A, `_ext` devolve sempre null: toda chamada cai no caminho de
         hoje. Os stubs abaixo existem para as ondas seguintes se ligarem sem
         editar a mesma função, e cada um diz o que ainda NÃO faz.
       ================================================================= */

    /* ⚠ SUBIR O NÚMERO DE UM RECURSO = MUDANÇA DE REGRA DA SOMBRA = migração
       declarada no commit (espec §1.9). É a porta de "esta versão sabe
       calcular isto?": um aparelho que recebe `mat.requer` maior do que o que
       ele conhece lê como a versão anterior e avisa, em vez de calcular errado
       calado. */
    VERSAO_RECURSO: { rede: "1.2.82", extras: "1.2.82", cal: "1.2.82", avanco: "1.2.82" },

    /* CHAVES DE DESLIGAR (espec §6.2, T12). Padrão: tudo ligado. O motor é
       PURO: quem lê `CONFIG.cronoRecursos` e a chave local
       `orcapro:tela:crono-recursos:v1` é o App, no boot, e entrega aqui por
       `definirRecursos`. O motor nunca abre o localStorage.
       ⚠ `motor: false` é TUDO-OU-NADA para as quatro funções de data (a leitura
       da 1.2.81, sombra incluída): desligar metade de uma sombra composta
       mudaria a data. As outras chaves só escondem portas (tela). */
    RECURSOS_PADRAO: { motor: true, rede: true, extras: true, cal: true, avanco: true, bases: true, seloTardio: true, historico: true, filtro: true, pilha: true, sino: true },
    _recursos: null,
    recursos: function () {
      var out = {}, k, P = this.RECURSOS_PADRAO, R = this._recursos;
      for (k in P) if (own(P, k)) out[k] = !(R && own(R, k) && R[k] === false);
      return out;
    },
    /* aceita só as chaves conhecidas e só `false` desliga (um "0" ou "não"
       vindo de uma chave local torta NÃO desliga o motor calado). `null`
       volta ao padrão. Devolve o efetivo. */
    definirRecursos: function (obj) {
      var R = {}, k, P = this.RECURSOS_PADRAO;
      if (obj && typeof obj === "object") for (k in P) if (own(P, k) && own(obj, k) && obj[k] === false) R[k] = false;
      this._recursos = R;
      return this.recursos();
    },

    /* A MESMA regra de `App._versaoMaior` (js/app.js): três partes numéricas,
       a que falta vale 0. Devolve -1, 0 ou 1. ⚠ Comparadas executando em
       tools/test-crono-tomadas.js — réplica que diverge apodrece calada. */
    _cmpVersao: function (a, b) {
      var pa = String(a).split("."), pb = String(b).split("."), i, x, y;
      for (i = 0; i < 3; i++) {
        x = parseInt(pa[i] || 0, 10); y = parseInt(pb[i] || 0, 10);
        if (x > y) return 1;
        if (x < y) return -1;
      }
      return 0;
    },
    /* a maior versão que ESTE motor sabe calcular: a maior de VERSAO_RECURSO.
       ⚠ Não é `CONFIG.versao`: o motor é puro (roda em Node, no PDF, no vm), e
       entre uma entrega e a publicação o número do app fica atrás do número
       das regras — ler o app recusaria o próprio dado desta versão. */
    _versaoMotor: function () {
      var V = this.VERSAO_RECURSO, k, m = "0.0.0";
      for (k in V) if (own(V, k) && this._cmpVersao(V[k], m) > 0) m = V[k];
      return m;
    },
    /* "esta versão sabe ler o cronograma gravado?" (espec I14). Sem `mat` →
       sim. `mat.requer` maior que o motor, ou recurso desconhecido em
       `mat.recursos` → não, e quem chama lê como a versão anterior. */
    suporta: function (orc) {
      var cr = orc && orc.cronograma, m = cr && typeof cr === "object" ? cr.mat : null;
      if (!m || typeof m !== "object" || Array.isArray(m)) return { ok: true, requer: null, desconhecidos: [] };
      var des = [], V = this.VERSAO_RECURSO, req = m.requer == null ? null : String(m.requer);
      arr(m.recursos).forEach(function (r) { if (!own(V, String(r)) && des.indexOf(String(r)) < 0) des.push(String(r)); });
      var ok = !des.length && !(req && this._cmpVersao(req, this._versaoMotor()) > 0);
      return { ok: ok, requer: req, desconhecidos: des };
    },

    /* AS FOLHAS DA ÁRVORE, sem montar a árvore: {folhaId: etapaId}, pela
       MESMA regra do `eap` (subetapa com pelo menos um serviço; o grupo de
       soltos `etapaId~g` só quando a etapa tem subetapa com serviço). É o que
       deixa o `_ext` dizer "este id é folha de outra etapa" num orçamento de
       12.250 nós sem pagar o `_contexto` (espec §2.11: a árvore só entra
       quando a data precisa dela). ⚠ Se o `eap` mudar a regra, esta muda
       junto — tools/test-crono-rede.js confere as duas executando. */
    _folhasDe: function (orc) {
      var out = {};
      arr(orc && orc.etapas).forEach(function (e) {
        if (!e) return;
        var subs = arr(e.subetapas), valido = {}, nIt = {}, soltos = 0, algum = false;
        subs.forEach(function (s) { if (s && s.id != null) { valido[s.id] = true; nIt[s.id] = 0; } });
        arr(e.itens).forEach(function (it) { if (it.subEtapaId && valido[it.subEtapaId]) nIt[it.subEtapaId]++; else soltos++; });
        subs.forEach(function (s) { if (s && s.id != null && nIt[s.id] && !own(out, s.id)) { out[s.id] = e.id; algum = true; } });
        if (algum && soltos) out[e.id + "~g"] = e.id;
      });
      return out;
    },

    /* OS GANCHOS DA LEITURA DO AVANÇO (§1.4; 18/09/2026, achado A1).
       Devolve `{noExiste, mandaNaData}` para o `CronoAvanco.ler`.
       `noExiste(id)`: o nó existe neste orçamento (etapa, folha — inclusive o
       grupo `<etapa>~g` dos serviços soltos — ou tarefa sem preço).
       `mandaNaData(id, entrada)`: a §1.4 é literal —
         • a FOLHA, no modo executivo;
         • a ETAPA, no modo padrão ou quando não tem folha;
         • a EXTRA, sempre;
         • a etapa com `rs: 1` (resumida), no modo executivo.
       ⚠ NÃO É ENFEITE: sem este gancho a entrada do nível errado não ficava
         "inerte com aviso" como o `CronoAvanco` promete — ela sumia calada, e
         a pessoa via o realizado que digitou não mudar nada. O que ela faz em
         seguida é digitar de novo, mais alto, até desistir do recurso. */
    _ganchosAvanco: function (orc, cr, folhaDe, EXn) {
      var etapas = {}, temFolha = {}, extras = {};
      arr(orc && orc.etapas).forEach(function (e) { if (e && e.id != null) etapas[e.id] = true; });
      Object.keys(folhaDe || {}).forEach(function (f) { temFolha[folhaDe[f]] = true; });
      if (EXn) arr(EXn.lista).forEach(function (x) { if (x && x.id != null) extras[x.id] = true; });
      var exO = mapaDe(cr, "exec"), execRede = !!(exO && exO.rede === true);
      return {
        noExiste: function (id) { return own(etapas, id) || own(folhaDe, id) || own(extras, id); },
        mandaNaData: function (id, ent) {
          if (own(extras, id)) return true;
          if (own(folhaDe, id)) return execRede;
          if (!own(temFolha, id)) return true;
          return execRede ? !!(ent && ent.rs === 1) : true;
        }
      };
    },

    /* A REDE EFETIVA DE CADA NÓ, conferida contra o DISCO (§1.3, O22).
       ⚠ A ASSINATURA É DO QUE ESTÁ GRAVADO: quem lê o planejado (a cópia
       desprojetada) não pode reconferir nela — a restrição coberta pela sombra
       volta ao `u` na cópia, e toda data da rede pareceria "substituída".
       Por isso a conferência acontece UMA vez, aqui, e a passada integrada e a
       projeção usam o resultado. */
    _efetivas: function (cr, R, folhaDe, porEtapa) {
      var CRd = this._mod("CronoRede"), out = { etapas: {}, folhas: {}, datas: {}, substituidas: [], avisos: [] };
      if (!R || !CRd) return out;
      ["etapas", "folhas"].forEach(function (nv) {
        Object.keys(R[nv]).forEach(function (id) {
          var ef = CRd.efetiva(cr, R, nv, id);
          out[nv][id] = ef;
          if (ef.substituida) out.substituidas.push({ nivel: nv, id: id, de: ef.substituida });
        });
      });
      Object.keys(R.datas).forEach(function (id) {
        var d = R.datas[id], ehFolha = own(folhaDe, id), dono = ehFolha ? folhaDe[id] : id;
        var tiposOk = ehFolha ? CRd.TIPOS_DATA.folha : CRd.TIPOS_DATA.etapa;
        if (!ehFolha && !own(porEtapa, id)) { out.avisos.push({ tipo: "rede-data-inexistente", id: id }); return; }
        if (tiposOk.indexOf(d.t) < 0) { out.avisos.push({ tipo: "rede-tipo", nivel: "datas", id: id, t: d.t }); return; }
        // só "o mais tarde possível" e a marca `tae` de etapa vivem sem data
        if (!d.d && d.t !== "mtp" && !(d.t === "tae" && !ehFolha)) { out.avisos.push({ tipo: "rede-forma", nivel: "datas", id: id }); return; }
        if (d.d && msDeData(d.d) == null) { out.avisos.push({ tipo: "rede-forma", nivel: "datas", id: id }); return; }
        var ok = d.s === CRd.assinatura(cr, "datas", dono);
        var ent = { t: d.t, d: d.d, dono: dono, folha: ehFolha, fonte: ok ? "rede" : "legado" };
        /* a MARCA `tae` de etapa (O22) só vale com o "terminar até" que ela
           marca (na entrada de `restricoes` ou em `mat.restricoes[id].u`);
           sem ele, vale a regra da 1.2.81 */
        if (ok && d.t === "tae" && !ehFolha) {
          ent.marca = CRd.marcaTae(cr, R, id);
          if (!ent.marca) { out.avisos.push({ tipo: "rede-marca-tae-invalida", id: id }); ent.fonte = "legado"; }
        }
        out.datas[id] = ent;
        if (!ok) out.substituidas.push({ nivel: "datas", id: id, de: { t: d.t, d: d.d || null } });
      });
      return out;
    },

    /* AS EXTENSÕES COM DADO VÁLIDO (§2.8), lidas do DISCO: `null` quando não
       há nenhuma — e aí o `estimar` roda o código de hoje, linha a linha (I2).
       `{rede, extras, cal, avanco}` (cada parte null sem dado válido),
       `mtp`, `precisaInicio` (extra, calendário próprio, mtp gravado ou
       avanço), `pendente` (precisa de início e não tem), `soMat` (só há
       sombra antiga a desfazer: o plano perdeu a extensão mas o `mat` ficou),
       `efetivas` (a conferência das assinaturas), `folhaDe`, `recursos`.
       ⚠ O `mat` COM ENTRADAS SOZINHO JÁ LIGA A LEITURA DO PLANEJADO: a
       sombra de um avanço que foi limpo (ou de uma tarefa que deixou de valer)
       não pode ser lida como planejado — ela traz atraso e piso de data. */
    ORDEM_RECURSOS: ["rede", "extras", "cal", "avanco"],
    _ext: function (orc, override) {
      var cr = orc && orc.cronograma;
      if (!ehObj(cr)) return null;
      var CRd = this._mod("CronoRede");
      var X = { rede: null, extras: null, cal: null, avanco: null, mtp: false, precisaInicio: false, pendente: false,
        soMat: false, efetivas: null, folhaDe: null, recursos: [], ini: null };
      var R = null;
      if (own(cr, "rede") && CRd) {
        R = CRd.normalizar(cr.rede);
        if (R && (temChave(R.etapas) || temChave(R.folhas) || temChave(R.datas) || R.avisos.length)) { X.rede = R; X.recursos.push("rede"); }
        else R = null;
      }
      /* as TAREFAS SEM PREÇO (commit EXTRAS): a régua única do que vale é o
         `CronoExtras.normalizar` — lista torta ou só com itens inválidos é
         "sem tarefas" (a 1.2.81 também não as vê) */
      var CEx = own(cr, "extras") ? this._mod("CronoExtras") : null, folhaDe0 = null;
      if (CEx && CEx.pronto) {
        folhaDe0 = this._folhasDe(orc);
        var ocup = {};
        Object.keys(folhaDe0).forEach(function (f) { ocup[f] = true; });
        arr(orc.etapas).forEach(function (e) { arr(e && e.itens).forEach(function (it) { if (it && typeof it.id === "string" && it.id.indexOf("x_") === 0) ocup[it.id] = true; }); });
        var EXn = CEx.normalizar(cr.extras, arr(orc.etapas), ocup);
        if (EXn.lista.length) { X.extras = EXn; X.recursos.push("extras"); }
      }
      /* os CALENDÁRIOS das frentes (commit CAL): `CronoCal.contexto` é a
         régua única do que vale — calendário torto, atribuição a calendário
         inexistente ou a nó que sumiu saem com aviso, e sem NENHUMA
         atribuição válida o recurso não nasce (I2). */
      var CCa = own(cr, "cal") ? this._mod("CronoCal") : null, CC = null;
      if (CCa && CCa.pronto) {
        CC = CCa.contexto(cr.cal, this._feriadoFn(this._params(orc, override)), this._nosDoCal(orc, folhaDe0 || this._folhasDe(orc)));
        if (CC && CC.usados.length) { X.cal = CC; X.recursos.push("cal"); }
        else if (CC) X.calAvisos = CC.avisos;
      }
      /* O AVANÇO LANÇADO (commit AVANÇO). Só no PLANO da obra: o motor lê o
         registro apenas quando o clone traz `_planoDaObra` e `_avancoDaObra`
         (I5). Um orçamento nunca é reprogramado, nem por engano de chamador —
         a proposta, o desembolso e o Portal leem o orçamento, e o dia em que
         um deles reprogramasse por causa do avanço o cliente receberia outro
         prazo sem ninguém ter pedido. */
      var CAv = (orc && orc._planoDaObra && orc._avancoDaObra != null) ? this._mod("CronoAvanco") : null;
      if (CAv && CAv.pronto) {
        /* ⚠ OS DOIS GANCHOS DA LEITURA SÃO OBRIGATÓRIOS (18/09/2026, achado A1).
           A chamada era `CAv.ler(rec, {})`, sem `noExiste` e sem `mandaNaData`
           — os dois ganchos que o próprio `CronoAvanco` tem para AVISAR. Sem
           eles a leitura aceitava qualquer id e o motor simplesmente não
           achava o nó depois: a pessoa lançava o realizado numa SUBETAPA no
           modo executivo e o número não aparecia em lugar nenhum, o prazo não
           mexia e NÃO SAÍA UMA LINHA DE AVISO. Medido na fixture do galpão
           (`tools/fixtures/galpao-demo-v3.json`, `exec.rede` ligado): o mesmo
           lançamento na etapa `e1` levava o prazo de 108 para 107 DU e
           contava 1 concluída; na subetapa `s1b` dava 108 DU, `concluidas` 0,
           `no.s1b.avanco` undefined e `r.compat.avisos` vazio.
           Com os ganchos: o nó que sumiu do orçamento sai em `descartadas`
           (motivo `no-sumiu`, contado pelo `orfasDoPlano` do painel) e o nó do
           nível errado sai com `avanco-nivel-errado` — "o dado não se perde, e
           a pessoa sabe por que o número dela não apareceu".
           ⚠ O GANCHO PRECISA DO `folhaDe` ANTES do `X.folhaDe` lá embaixo: é
             por ele que se sabe quem é folha e quem é etapa com folhas. */
        folhaDe0 = folhaDe0 || this._folhasDe(orc);
        var AV = CAv.ler(orc._avancoDaObra, this._ganchosAvanco(orc, cr, folhaDe0, X.extras));
        if (AV.corteMs != null && AV.lista.length) { X.avanco = AV; X.recursos.push("avanco"); }
        else if (AV.avisos.length || AV.descartadas.length) { X.avancoAvisos = AV.avisos; X.avancoDescartadas = AV.descartadas; }
      }
      var mat = mapaDe(cr, "mat");
      var temMat = !!mat && (temChave(mapaDe(mat, "etapas")) || temChave(mapaDe(mat, "folhas")) || temChave(mapaDe(mat, "restricoes")) || temChave(mapaDe(mat, "pend")));
      /* ⚠ CALENDÁRIO QUE NÃO SEGURA NADA, MAS TEM AVISO. A pessoa atribuiu um
         calendário e ele está torto (sem dia de trabalho, id que não existe,
         linha que sumiu): a linha volta para a régua da obra, mas ela PRECISA
         saber disso — senão o prazo muda e nada explica por quê ("recado que
         mente é pior que recado nenhum"). O aviso nasce; o recurso, não (a
         régua é a da obra, e `mat.recursos` não ganha "cal"). */
      if (!X.recursos.length && !temMat && !(X.calAvisos && X.calAvisos.length) && !(X.avancoAvisos && X.avancoAvisos.length)
          && !(X.avancoDescartadas && X.avancoDescartadas.length)) return null;
      if (!X.recursos.length) X.soMat = true;
      var porEtapa = {};
      arr(orc.etapas).forEach(function (e) { if (e && e.id != null) porEtapa[e.id] = true; });
      X.folhaDe = folhaDe0 || this._folhasDe(orc);
      X.efetivas = this._efetivas(cr, R, X.folhaDe, porEtapa);
      Object.keys(X.efetivas.datas).forEach(function (id) {
        var d = X.efetivas.datas[id];
        if (d.fonte === "rede" && d.t === "mtp") X.mtp = true;
      });
      /* ⚠ O14: toda sombra de DATA ABSOLUTA exige início fixo — o mtp, a
         tarefa sem preço que SEGURA etapa (a que só existe, sem ligar, não
         empurra nada: criar é livre) e o CALENDÁRIO PRÓPRIO. O calendário
         depende do dia da semana em que a frente começa: 7×7 começando no
         sábado ou na segunda ocupa vãos diferentes na régua da obra, e com o
         início em "hoje" a 1.2.81 recalcularia amanhã com a sombra de hoje
         (medido pela frente EXTRAS: 15 de 16 etapas divergiam uma semana
         depois). O avanço entra no commit seguinte. */
      X.extrasLigadas = !!(X.extras && X.extras.lista.some(function (x) { return x.sucs.length > 0; }));
      X.precisaInicio = X.mtp || X.extrasLigadas || !!X.cal || !!X.avanco;
      var ini = this._params(orc, override).dataInicio;
      X.ini = ini ? String(ini).slice(0, 10) : null;
      X.pendente = X.precisaInicio && msDeData(X.ini) == null;
      return X;
    },
    /* o mesmo X sem as funções que dependem do início (I13: `D-PENDENTE`) —
       a rede digitada (os elos) não depende do início e continua valendo */
    _extSemDatas: function (X) {
      var Y = rasa(X), EF = X.efetivas, e2 = rasa(EF), d2 = {};
      Object.keys(EF.datas).forEach(function (id) { if (EF.datas[id].t !== "mtp") d2[id] = EF.datas[id]; });
      e2.datas = d2;
      Y.efetivas = e2; Y.cal = null; Y.avanco = null; Y.mtp = false; Y.precisaInicio = false; Y.pendente = false;
      /* as tarefas sem preço CONTINUAM na tela, mas sem segurar etapa: sem o
         início fixo a sombra delas não é gravada, e a 1.2.81 não as veria */
      if (X.extras) {
        var ex2 = rasa(X.extras);
        ex2.lista = X.extras.lista.map(function (x) { var c = rasa(x); c.sucs = []; return c; });
        ex2.semInicio = true;
        Y.extras = ex2;
      }
      Y.extrasLigadas = false;
      return Y;
    },
    /* `mat.recursos` diz que o registro tem este recurso gravado (O25) */
    _matTem: function (orc, recurso) {
      var m = mapaDe(orc && orc.cronograma, "mat");
      return !!m && Array.isArray(m.recursos) && m.recursos.indexOf(recurso) > -1;
    },
    /* a versão mínima dos recursos em uso (a mesma régua do `suporta`) */
    _requerDe: function (recursos) {
      var self = this, m = null;
      arr(recursos).forEach(function (r) { var v = self.VERSAO_RECURSO[r]; if (v && (m == null || self._cmpVersao(v, m) > 0)) m = v; });
      return m;
    },
    /* MOTOR DESLIGADO (suporte, §6.2): a leitura da 1.2.81, sombra incluída.
       `r.compat.desligado` só nasce quando o registro TEM extensão (I2: sem
       dado, nenhuma chave nova) — é o que a tela usa para dizer por que as
       tarefas sem preço e os calendários sumiram das datas. */
    _marcaDesligado: function (orc, r) {
      var cr = orc && orc.cronograma, tem = false, CH = this.CHAVES_NOVAS_CRON;
      if (ehObj(cr)) for (var i = 0; i < CH.length; i++) if (own(cr, CH[i])) { tem = true; break; }
      if (tem || (orc && orc._avancoDaObra != null)) r.compat = { requer: null, suporta: true, recursos: [], desligado: true, avisos: [] };
      return r;
    },

    /* A leitura da 1.2.81 sobre o gravado: cópia RASA sem `rede`, `cal`,
       `extras`, `mat` e `_avancoDaObra`, com a marca `_lerComoLegado` (as
       restrições com `origem` valem como {tipo, data}, que é o que a 1.2.81 lê
       delas). ⚠ Devolve o PRÓPRIO orçamento quando não há o que tirar — o caso
       de todo orçamento de hoje, sem alocação. Nunca escreve no original. */
    CHAVES_NOVAS_CRON: ["rede", "cal", "extras", "mat"],
    _comoFrota: function (orc) {
      if (!orc || typeof orc !== "object") return orc;
      var cr = orc.cronograma, CH = this.CHAVES_NOVAS_CRON, temCr = !!cr && typeof cr === "object" && !Array.isArray(cr), tira = false, i, k;
      if (temCr) for (i = 0; i < CH.length; i++) if (own(cr, CH[i])) { tira = true; break; }
      /* `_iaOrc`/`_iaResumo` (revisão 4) são NÃO enumeráveis: a cópia rasa
         abaixo já não os leva — basta forçar a cópia quando existem */
      if (!tira && !own(orc, "_avancoDaObra") && !own(orc, "_iaOrc") && !own(orc, "_iaResumo")) return orc;
      var c = {};
      for (k in orc) if (own(orc, k) && k !== "_avancoDaObra") c[k] = orc[k];
      if (temCr) {
        var c2 = {};
        for (k in cr) if (own(cr, k) && CH.indexOf(k) < 0) c2[k] = cr[k];
        c.cronograma = c2;
      }
      c._lerComoLegado = true;
      return c;
    },

    /* O PLANEJADO (espec §1.3.1, E1): a cópia com a projeção desfeita, pela
       tabela da §1.3.1 (`desprojetar`, modo "leitura"). Devolve
       {orc, avisos, limpeza}. ⚠ NUNCA escreve no original: copia só o que a
       desprojeção mexe (os mapas de duração, de marca, de marco e as
       restrições), o resto vai por referência — um cronograma de 60 KB não
       pode ser clonado inteiro a cada render (§2.11). */
    _planejado: function (orc) {
      var cr = orc && orc.cronograma;
      if (!ehObj(cr)) return { orc: orc, avisos: [], limpeza: false };
      var c = rasa(orc), c2 = rasa(cr);
      ["duracoes", "duracoesAgente", "marcos", "restricoes"].forEach(function (m) { if (ehObj(cr[m])) c2[m] = rasa(cr[m]); });
      if (ehObj(cr.sub)) {
        c2.sub = rasa(cr.sub);
        ["duracoes", "agente", "marcos"].forEach(function (m) { if (ehObj(cr.sub[m])) c2.sub[m] = rasa(cr.sub[m]); });
      }
      c.cronograma = c2;
      var d = this.desprojetar(c2, "leitura");
      return { orc: c, avisos: d.avisos, limpeza: d.limpeza };
    },
    /* O PLANEJADO SEM AS FUNÇÕES QUE DEPENDEM DO INÍCIO (I13): sem tarefas
       sem preço, sem a atribuição de calendário, sem o "mais tarde possível"
       (que mora em `rede.datas` e sai pela `_extSemDatas`) e com o avanço
       "carregado, sem registro". É o que a 1.2.81 calcula sobre o gravado sem
       sombra (`D-PENDENTE`). Cópia rasa; nunca escreve no original. */
    _planejadoSemDatas: function (orc) {
      var cr = orc && orc.cronograma;
      if (!ehObj(cr)) return orc;
      var c = rasa(orc), c2 = rasa(cr);
      delete c2.extras;
      if (ehObj(cr.cal)) { c2.cal = rasa(cr.cal); delete c2.cal.de; }
      c.cronograma = c2;
      if (own(orc, "_avancoDaObra")) c._avancoDaObra = null;
      return c;
    },

    /* MODO ÂNCORA (§2.6): orçamento APROVADO com extensões. As chaves de
       sempre são as GRAVADAS (a sombra do dia da aprovação: é o que a
       proposta, o PDF entregue, o Portal e a 1.2.81 têm na mão); as chaves
       novas se posicionam em volta das etapas fixas. Avanço nunca (I5). */
    _estimarAncorado: function (orc, override, ctx, X) {
      var r = this._estimarBase(this._comoFrota(orc), override, ctx);
      var EF = X.efetivas || { etapas: {}, substituidas: [] };
      if (X.rede) {
        r.etapas.forEach(function (et) {
          var ef = EF.etapas[et.id];
          if (!ef || ef.fonte !== "rede" || ef.c) return;
          var tp = {}, lg = {};
          arr(ef.elos).forEach(function (el) { if (el.t !== "TI") tp[el.i] = el.t; if (el.l != null) lg[el.i] = el.l; });
          if (temChave(tp)) et.predTipoRede = tp;
          if (temChave(lg)) et.predLagTipo = lg;
        });
        r.rede = { avisos: this._avisosSubstituidas(orc, EF).concat(EF.avisos || []), substituidas: EF.substituidas };
      }
      var mat = mapaDe(orc.cronograma, "mat"), div = mat ? mat.div : null;
      var cods = ehObj(div) && Array.isArray(div.cods) ? div.cods : [], CAT = this.CATALOGO_DIV, fora = [];
      cods.forEach(function (c) { if (c === "D-PENDENTE" || CAT.indexOf(c) < 0) fora.push(c); });
      var avisos = [];
      if (fora.length) avisos.push({ tipo: "nao-garantido", cods: fora,
        msg: "Este orçamento foi aprovado com datas que não consegui garantir para aparelhos com versão anterior do app (" + fora.join(", ") +
          "). A data aprovada é a gravada; confira o prazo impresso na proposta antes de enviar." });
      /* ⚠ a forma de `r.compat` é FECHADA (§1.8, fixture T21): o modo âncora
         não ganha chave própria — a tela sabe que é aprovado pelo orçamento */
      r.compat = { requer: this._requerDe(X.recursos), suporta: true, recursos: X.recursos.slice(), avisos: avisos };
      return r;
    },

    /* O CATÁLOGO FECHADO DE DIVERGÊNCIAS COM A 1.2.81 (§1.11). Código fora
       daqui é defeito: o recado do salvar diz "não consegui garantir". */
    CATALOGO_DIV: ["D-FOLHA-INI", "D-INICIO-FRENTE", "D-TETO", "D-CRIT", "D-VAO0", "D-VELHA", "D-AVANCO-PENDENTE", "D-INICIO-VELHO",
      "D-PENDENTE", "D-SEM-SOMBRA", "D-175", "D-INICIAR-1281", "D-IA-TEXTO", "D-ESPERA-AVANCO"],
    /* ⚠ OS CÓDIGOS QUE NÃO SÃO DATA (§1.11). O recado do salvar não pode
       dizer "vejam as mesmas datas" nem mandar procurar o suporte por causa
       deles: as datas SÃO as mesmas, e o que difere está declarado. */
    DIV_NAO_DATA: ["D-ESPERA-AVANCO"],
    divEhData: function (cods) {
      var self = this, achou = false;
      arr(cods).forEach(function (c) { if (self.DIV_NAO_DATA.indexOf(String(c)) < 0) achou = true; });
      return achou;
    },

    /* o recado de cada entrada de rede que um aparelho antigo substituiu
       (REDE §a.4): o texto de antes e o de agora, pelo formatador único */
    _avisosSubstituidas: function (orc, EF) {
      var out = [], num0 = {};
      arr(orc && orc.etapas).forEach(function (e, i) { if (e) num0[e.id] = i + 1; });
      arr(EF && EF.substituidas).forEach(function (s) {
        var nome = s.nivel === "datas" ? "A restrição de data" : "O “Depende de”";
        var alvo = own(num0, s.id) ? "da etapa " + num0[s.id] : "da subetapa";
        out.push({ tipo: "rede-substituida", nivel: s.nivel, id: s.id,
          msg: nome + " " + alvo + " foi alterado num aparelho com versão anterior do app (ou por um recurso que ainda não conhece TT/IT): " +
            "vale o que ficou gravado lá. Confira e digite de novo se quiser a ligação ou a restrição desta versão." });
      });
      return out;
    },

    /* A RÉGUA DA OBRA (E5): `dia(k)` e `phi(d)` sobre a tabela `cal` do
       `estimar` — a MESMA tabela das datas das etapas.
       ⚠ I15: `phi(d)` = o menor k ≥ 0 com O.dia(k) ≥ d, SEM TETO. Nunca
       `diaUtilDoCorte` (null depois do fim previsto) nem `cal.indice(ms,
       totalDias)` (prende em totalDias + 1 e depende de quanto a tabela já
       cresceu numa chamada anterior). Com o limite de ~14 anos o `indice` só
       cresce a tabela até passar da data (medido na revisão 3). */
    LIM_REGUA: 3700,
    _regua: function (cal) {
      var LIM = this.LIM_REGUA;
      function dia(k) { return meiaNoite(cal.dia(k < 0 ? 0 : k)); }
      function phi(ms) {
        var j = cal.indice(ms, LIM);
        if (j < 0) return 0;
        return dia(j) < ms ? j + 1 : j;
      }
      return { dia: dia, phi: phi };
    },

    /* O DESLOCAMENTO EQUIVALENTE DE TI (O20, I11 — a régua única): o elo
       p → s de tipo `tipo` e espera L vale "início(s) ≥ fim(p) + desloc".
       É o que a sombra grava em `lags`, o que sai em `predDesloc` e o que a
       volta usa; `dP`/`dS` = as durações na régua da obra. */
    _deslocTI: function (tipo, L, dP, dS) {
      if (tipo === "II") return L - dP;
      if (tipo === "TT") return L - dS;
      if (tipo === "IT") return L - dP - dS;
      return L;
    },

    /* AS FOLHAS DE UMA ETAPA NA PASSADA INTEGRADA: os elos efetivos de cada
       uma (a rede digitada quando a assinatura bate; senão, EXATAMENTE o que
       o `_redeInterna` leu dos mapas de sempre) e a ordem de Kahn interna, com
       a mesma regra de ciclo. O elo para subetapa de OUTRA etapa (ou para uma
       etapa inteira, "E5") sai daqui como aresta cruzada (O26). */
    _grupoInteg: function (g, EF, execRede, folhaDe, porId, cruz, avR) {
      var fs = g.folhasRede, irm = {}, F = { etapaId: g.no.id, ordem: [], porId: {}, lista: [], succ: {} };
      fs.forEach(function (fr) { irm[fr.id] = true; });
      fs.forEach(function (fr, i) {
        var fn = { id: fr.id, D: fr.dur, marco: !!fr.marco, fr: fr, elos: [], ef: EF.folhas[fr.id] || null, explicito: false };
        var ef = execRede ? fn.ef : null, vistos = {};
        function poe(p, tipo, L, fonte) {
          if (own(vistos, p)) { avR({ tipo: "rede-elo-repetido", nivel: "folhas", id: fr.id, elo: p }); return; }
          vistos[p] = true;
          fn.elos.push({ p: p, tipo: tipo, L: L, fonte: fonte });
        }
        if (ef && ef.fonte === "rede" && !ef.c) {
          fn.explicito = true; fn.rede = true;
          arr(ef.elos).forEach(function (el) {
            if (el.i === fr.id) { avR({ tipo: "rede-elo-proprio", nivel: "folhas", id: fr.id }); return; }
            if (own(irm, el.i)) { poe(el.i, el.t, el.l, "rede"); return; }
            if (own(folhaDe, el.i)) { cruz.push({ Ep: folhaDe[el.i], Ef: g.no.id, pf: el.i, f: fr.id, tipo: el.t, lag: el.l }); return; }
            if (own(porId, el.i)) {
              if (el.i === g.no.id) { avR({ tipo: "rede-elo-proprio", nivel: "folhas", id: fr.id, elo: el.i }); return; }
              cruz.push({ Ep: el.i, Ef: g.no.id, pf: null, f: fr.id, tipo: el.t, lag: el.l });
              return;
            }
            avR({ tipo: "rede-elo-inexistente", nivel: "folhas", id: fr.id, elo: el.i });
          });
        } else if (ef && ef.fonte === "rede" && ef.c) {
          fn.cascata = true;
          if (i > 0) poe(fs[i - 1].id, "TI", null, "cascata");
        } else {
          // ⚠ o LEGADO é o que o `_redeInterna` leu (preds, predLag, predTipo): uma régua só
          fn.explicito = !!fr.predsExplicito;
          arr(fr.preds).forEach(function (p) {
            var l = own(fr.predLag, p) ? fr.predLag[p] : null;
            if (fr.predTipo[p] === "II") poe(p, "II", l != null ? l : 0, "legado");
            else poe(p, "TI", l, "legado");
          });
        }
        F.porId[fr.id] = fn; F.lista.push(fn);
      });
      var indeg = {}, fila = [], at;
      F.lista.forEach(function (f) { indeg[f.id] = f.elos.length; F.succ[f.id] = []; });
      F.lista.forEach(function (f) { f.elos.forEach(function (l) { F.succ[l.p].push(f.id); }); });
      F.lista.forEach(function (f) { if (!indeg[f.id]) fila.push(f.id); });
      while (fila.length) { at = fila.shift(); F.ordem.push(at); F.succ[at].forEach(function (s) { if (--indeg[s] === 0) fila.push(s); }); }
      if (F.ordem.length < F.lista.length) F.lista.forEach(function (f) { if (F.ordem.indexOf(f.id) < 0) { f.cicloDep = true; F.ordem.push(f.id); } });
      return F;
    },

    /* A REDE INTERNA EM TEMPO ABSOLUTO (o 7º argumento da espec, `Hi`, na
       forma de função própria): cada folha na régua da obra a partir de
       `base.esO` (o início que a etapa pode ter), com os quatro tipos. É o
       `_passoInterno` com a base: TI/II pelo início (`max`), TT/IT pelo fim
       (`fimMin`), `pisoFolha` por cima. Sem piso nem corte, `fimO − base` é a
       posição relativa do `_redeInterna` sobre a sombra (a prova é a paridade
       da `test-crono-rede`). Devolve {id: {iniO, fimO, L: {p: espera usada}}}. */
    _redeAbsInteg: function (F, base, parSub, H) {
      var abs = {}, pisoF = base.pisoFolha || {}, O = H && H.O, CCm = H && H.CCm, CC = H && H.CC;
      var temCal = !!(H && H.temCal), temAv = !!(H && H.temAv), AV = (H && H.AV) || {}, CAvm = H && H.CAvm;
      var C = H && H.C, CD = H && H.CD;
      var precisaD = temCal || temAv;
      function estA(a) { return a ? CAvm.estadoDe(a) : null; }
      function consumirF(ctx, d, dur) {
        if (ctx) { var u = CCm.consumir(ctx, d, dur); return u != null ? u : d; }
        if (!(dur > 0)) return O.dia(O.phi(d));
        return O.dia(O.phi(d) + Math.ceil(dur) - 1);
      }
      function avancarF(ctx, d, feito) {
        if (!(feito > 0)) return d;
        if (ctx) { var a = CCm.avancar(ctx, d, feito); return a != null ? a : d; }
        return O.dia(O.phi(d) + Math.ceil(feito));
      }
      F.ordem.forEach(function (id) {
        var f = F.porId[id], esO = base.esO, fimMin = null, Ls = {}, retTIf = [];
        var esD = precisaD ? (base.esD != null ? base.esD : O.dia(base.esO)) : null;
        f.elos.forEach(function (l) {
          var p = abs[l.p];
          if (!p) return;                         // só dentro de ciclo: o elo de volta é ignorado (a regra de hoje)
          var L = l.L != null ? l.L : (l.tipo === "TI" ? -Math.floor(parSub * (p.fimO - p.iniO)) : 0), tipo = l.tipo;
          Ls[l.p] = L;
          // O11 (dado de fora): TT/IT com a folha sucessora em calendário próprio vale como TI
          if (temCal && (tipo === "TT" || tipo === "IT") && f.calProprio) tipo = "TI";
          if (tipo === "TI") {
            esO = Math.max(esO, p.fimO + L);
            if (precisaD) esD = Math.max(esD, (L === 0 && p.BD != null) ? p.BD : O.dia(p.fimO + L));
            if (temAv) retTIf.push({ id: l.p, cD: (L === 0 && p.BD != null) ? p.BD : O.dia(p.fimO + L) });
          } else if (tipo === "II") {
            esO = Math.max(esO, p.iniO + L);
            if (precisaD) esD = Math.max(esD, L !== 0 ? O.dia(p.iniO + L) : (p.calId === f.calId && p.iniD != null ? p.iniD : (p.iniPermD != null ? p.iniPermD : O.dia(p.iniO))));
          } else fimMin = maxN(fimMin, (tipo === "TT" ? p.fimO : p.iniO) + L);
        });
        if (own(pisoF, id) && pisoF[id] > esO) esO = pisoF[id];
        if (precisaD) {
          if (f.pisoD != null && f.pisoD > esD) esD = f.pisoD;
          if (O.phi(esD) < esO) esD = O.dia(esO);      // a invariante phi(esD) === esO (§2.4)
        }
        /* ---- A FOLHA COM REAL LANÇADO (§2.4) ----
           A folha resumida (`rs: 1` na etapa) vale como CONCLUÍDA, com as
           posições planejadas escaladas na janela real [i, f] da etapa — é o
           que a porta [Resumir] do teto troca, e o recado diz isso. */
        var aF = temAv ? AV[id] : null, stF = aF ? estA(aF) : null;
        if (temAv && !aF && F.resumida) { aF = F.resumida; stF = "concluida"; }
        if (temAv && (stF === "concluida" || stF === "iniciada")) {
          var ctxF = (temCal && f.calProprio) ? CC.ctxDe[f.calId] : null;
          var DnF = (temCal && f.calProprio) ? f.durF : f.D;
          var iF = msDeData(aF.i), oF = { id: id, L: Ls, calId: f.calId || null, iniPermD: esD };
          oF.iniD = iF; oF.iniO = O.phi(iF);
          if (stF === "concluida") {
            oF.BD = maisDias(msDeData(aF.f), 1); oF.ultDia = msDeData(aF.f);
            oF.fimO = Math.max(oF.iniO, O.phi(oF.BD));
            oF.avEstado = "concluida";
          } else {
            var ftF = (aF.r != null) ? Math.max(0, DnF - aF.r) : Math.round(DnF * ((aF.p == null ? 0 : aF.p) / 100));
            var rsF = (aF.r != null) ? aF.r : Math.max(1, DnF - ftF);
            var reF = Math.max(CD, avancarF(ctxF, iF, ftF));
            // LÓGICA RETIDA também dentro da etapa
            retTIf.forEach(function (q) {
              var ap = AV[q.id];
              if (ap && estA(ap) === "concluida") return;
              if (q.cD > reF) reF = q.cD;
            });
            var uF = consumirF(ctxF, reF, rsF);
            oF.BD = maisDias(uF, 1); oF.ultDia = uF;
            oF.fimO = O.phi(oF.BD);
            if (fimMin != null && oF.fimO < fimMin && !(temCal && f.calProprio)) { oF.fimO = fimMin; oF.BD = O.dia(fimMin); }
            if (oF.fimO <= oF.iniO) oF.fimO = oF.iniO + 1;
            oF.avEstado = "andamento"; oF.avFeito = ftF; oF.avRest = rsF;
          }
          oF.foraSeq = oF.iniO < esO;
          abs[id] = oF;
          return;
        }
        var sO = esO, sD = esD, sRedeF = esO;
        if (temAv) { sO = Math.max(sO, C); if (sD != null && CD != null && sD < CD) sD = CD; }
        if (fimMin != null && !(temCal && f.calProprio)) { sO = Math.max(sO, fimMin - f.D); sRedeF = Math.max(esO, fimMin - f.D); if (precisaD) sD = Math.max(sD, O.dia(sO)); }
        if (temCal && f.calProprio) {
          /* a FOLHA em calendário próprio: dias de trabalho da frente em data
             real, e a régua da obra recebe o resultado por `phi` (§2.4) */
          var cx = CC.ctxDe[f.calId], p3 = cx ? CCm.primeiroDia(cx, sD) : null, u3 = p3 != null ? CCm.consumir(cx, p3, f.durF) : null;
          if (u3 != null) {
            if (temAv) { sO = Math.max(sO, C); if (sD < CD) sD = CD; p3 = CCm.primeiroDia(cx, sD); u3 = p3 != null ? CCm.consumir(cx, p3, f.durF) : null; }
          }
          if (u3 != null) {
            abs[id] = { id: id, iniO: sO, fimO: Math.max(sO, O.phi(maisDias(u3, 1))), L: Ls,
              iniD: p3, BD: maisDias(u3, 1), ultDia: u3, calId: f.calId, iniPermD: sD };
            return;
          }
          // sem dia de trabalho ou consumo longo demais: a linha volta para a régua da obra (o aviso sai no nó)
        }
        abs[id] = { id: id, iniO: sO, fimO: sO + f.D, L: Ls };
        if (precisaD) { abs[id].iniD = O.dia(sO); abs[id].BD = O.dia(sO + f.D); abs[id].calId = f.calId || null; abs[id].iniPermD = sD; }
        if (temAv) { abs[id].avEstado = sO > sRedeF ? "empurrada" : "nao-iniciada"; abs[id].avEmpurrado = Math.max(0, sO - sRedeF); }
      });
      return abs;
    },

    /* O MAIOR FIM e o MENOR INÍCIO de um conjunto de posições */
    _extremos: function (A) {
      var ini = null, fim = null;
      for (var k in A) if (own(A, k)) { ini = minN(ini, A[k].iniO); fim = maxN(fim, A[k].fimO); }
      return { ini: ini, fim: fim };
    },

    /* =================================================================
       A PASSADA INTEGRADA (§2.3 E3–E10, §2.4, §2.5): troca a fase (b) do
       `_estimarBase` quando há extensão. Devolve a MESMA forma do `_idaVolta`
       ({totalDias, ini, iniPedido, ajusteInicio, fer, cal, infoRestr,
       temCiclo, opcDependida}) mais `integ` (os nós, as posições absolutas e
       os avisos) para a fase (c) e a projeção.
       ⚠ SEM EXTENSÃO NENHUMA NUM NÓ, O NÓ SAI COM A CONTA DE HOJE: os elos
       legados são lidos com a regra do `_idaVolta` (cascata, opcional fora do
       prazo, lag), a ida é o `max` do `_passoIda`, a volta é a de hoje com o
       deslocamento equivalente (a prova: tools/test-crono-rede.js roda o
       corpus sem rede pelos dois caminhos e compara a saída inteira).
       ================================================================= */
    _idaVoltaIntegrada: function (etapas, orc, params, X, mem, opcFora, temFora, calc) {
      var self = this, cron = orc.cronograma || {};
      var EF = X.efetivas || { etapas: {}, folhas: {}, datas: {} };
      var folhaDe = X.folhaDe || {};
      var CC = X.cal || null;              // os calendários das frentes (commit CAL), ou null
      var exO = mapaDe(cron, "exec"), execRede = !!(exO && exO.rede === true);
      var par = params.paralelismo || 0;
      var porId = {};
      etapas.forEach(function (et) { porId[et.id] = et; });
      var avisosRede = (EF.avisos || []).slice(), opcDependida = [], jaAvisou = {};
      function avR(a) {
        var ch = a.tipo + "|" + (a.id || "") + "|" + (a.elo || "");
        if (own(jaAvisou, ch)) return;
        jaAvisou[ch] = true; avisosRede.push(a);
      }

      /* ---- E4: os elos que ENTRAM em cada etapa ---- */
      var predsCfg = (orc.cronograma && orc.cronograma.predecessoras) || {};
      var lagsCfg = (orc.cronograma && orc.cronograma.lags) || {};
      var N = [], NP = {}, cruz = [];
      etapas.forEach(function (et, i) {
        var n = { id: et.id, i: i, et: et, D: et.duracao, marco: !!et.marco, fora: !!et.foraDoPrazo, elos: [], cruzIn: [], ef: EF.etapas[et.id] || null };
        N.push(n); NP[et.id] = n;
      });
      N.forEach(function (n, i) {
        n.porExtras = [];
        var et = n.et, ef = n.ef, vistos = {};
        function poe(p, tipo, L, fonte) {
          if (own(vistos, p)) { avR({ tipo: "rede-elo-repetido", nivel: "etapas", id: n.id, elo: p }); return; }
          vistos[p] = true;
          n.elos.push({ p: p, tipo: tipo, L: L, fonte: fonte });
          /* a mesma regra de hoje: elo EXPLÍCITO para etapa que saiu do prazo
             continua valendo, e a tela diz (a cascata pula a opcional) */
          if (opcFora && fonte !== "cascata" && porId[p].foraDoPrazo && opcDependida.indexOf(n.id + "|" + p) < 0) opcDependida.push(n.id + "|" + p);
        }
        if (ef && ef.fonte === "rede" && !ef.c) {
          n.rede = true;
          et.predsExplicito = true;
          arr(ef.elos).forEach(function (el) {
            if (el.i === n.id) { avR({ tipo: "rede-elo-proprio", nivel: "etapas", id: n.id }); return; }
            if (own(porId, el.i)) { poe(el.i, el.t, el.l, "rede"); return; }
            if (own(folhaDe, el.i)) {
              if (folhaDe[el.i] === n.id) { avR({ tipo: "rede-elo-proprio", nivel: "etapas", id: n.id, elo: el.i }); return; }
              cruz.push({ Ep: folhaDe[el.i], Ef: n.id, pf: el.i, f: null, tipo: el.t, lag: el.l });
              return;
            }
            avR({ tipo: "rede-elo-inexistente", nivel: "etapas", id: n.id, elo: el.i });
          });
          return;
        }
        /* LEGADO (ou `{c: 1}`, a cascata que só existe para carregar a sombra
           da âncora): os mapas de sempre, com a regra de hoje. No `{c: 1}` o
           `lags` é sombra, e não vale. */
        var cascata = !!(ef && ef.fonte === "rede" && ef.c);
        n.cascataRede = cascata;
        var cfg = cascata ? undefined : predsCfg[n.id], lagEt = cascata ? {} : (lagsCfg[n.id] || {}), out = [], k;
        et.predsExplicito = Object.prototype.toString.call(cfg) === "[object Array]";
        if (et.predsExplicito) {
          for (k = 0; k < cfg.length; k++) if (cfg[k] !== et.id && porId[cfg[k]] && out.indexOf(cfg[k]) < 0) out.push(cfg[k]);
        } else if (i > 0) {
          var j = i - 1;
          while (opcFora && j >= 0 && etapas[j].foraDoPrazo) j--;
          if (j >= 0) out.push(etapas[j].id);
        }
        out.forEach(function (pid) {
          var l = lagEt[pid];
          poe(pid, "TI", (l != null && isFinite(num(l))) ? Math.round(num(l)) : null, et.predsExplicito ? "legado" : "cascata");
        });
      });

      /* ---- E3/E4: AS TAREFAS SEM PREÇO, nós DEPOIS de todas as etapas ----
         ⚠ nunca em `etapas` nem em `et.preds`: seis consumidores casam
         `r.etapas[i]` com `orc.etapas[i]`, e a 1.2.81 apagaria o id da extra
         na primeira digitação. A etapa recebe o elo que ENTRA da extra
         (`x.sucs`) como elo `fonte: "extra"`, que só a passada integrada lê;
         a sombra da 1.2.81 é o piso `nia` (P2). Elo com extra nunca tem
         sobreposição automática (`l` ausente = 0). */
      var XE = X.extras || null, NX = [];
      if (XE) {
        XE.lista.forEach(function (x, k) {
          var n = { id: x.id, i: etapas.length + k, extra: true, x: x, et: null, D: x.dur, marco: x.dur === 0, fora: false, elos: [], cruzIn: [], ef: null, porExtras: [] };
          N.push(n); NP[x.id] = n; NX.push(n);
        });
        NX.forEach(function (n) {
          n.x.preds.forEach(function (el) {
            if (!own(NP, el.i)) return;
            n.elos.push({ p: el.i, tipo: el.t, L: el.l, fonte: "extra" });
          });
          n.x.sucs.forEach(function (el) {
            var s = NP[el.i];
            if (!s || s.extra) return;
            s.elos.push({ p: n.id, tipo: el.t, L: el.l, fonte: "extra" });
            s.porExtras.push({ id: n.id, numero: XE.numero[n.id], tipo: el.t, lag: el.l });
          });
        });
      }

      /* ---- E3: a árvore, só quando a data precisa dela (§2.11) ---- */
      var temRedeFolha = false, temDataFolha = false, fid;
      for (fid in EF.folhas) if (own(EF.folhas, fid) && EF.folhas[fid].fonte === "rede") temRedeFolha = true;
      for (fid in EF.datas) if (own(EF.datas, fid) && EF.datas[fid].folha && EF.datas[fid].fonte === "rede") temDataFolha = true;
      if (!execRede && (temRedeFolha || temDataFolha)) avR({ tipo: "rede-folha-modo-padrao",
        msg: "Há ligações ou restrições digitadas em subetapas, mas o prazo não está detalhado pelas subetapas — elas não mudam as datas. Ligue \"Detalhar o prazo pelas subetapas\" para valerem." });
      /* ⚠ O AVANÇO LANÇADO NUMA FOLHA TAMBÉM PEDE A ÁRVORE (18/09/2026, achado
         A1). No modo executivo quem manda na data é a FOLHA (§1.4), mas quem
         posiciona a folha com real lançado é o `_redeAbsInteg`, e ele só roda
         quando o `G` da etapa nasce. Antes desta linha o `G` só nascia por
         ligação ou restrição DIGITADA em subetapa: um plano executivo sem rede
         interna — o caso normal, a cascata — deixava o `abs` sem nascer, e
         todo avanço de subetapa ia para o lixo sem prazo, sem posição e sem
         aviso (medido na fixture do galpão: 108 DU antes e depois, `concluidas`
         0, `no.s1b.avanco` undefined).
         ⚠ A ETAPA RESUMIDA (`rs: 1`) NÃO ENTRA AQUI, e isso foi MEDIDO: ela cai
           no ramo "tarefa com real lançado" logo acima do `rede0`, que nunca
           monta `abs` para essa etapa — as folhas dela saem escaladas na janela
           real pelo `_arvore`, como a §1.4 manda. Ligar a árvore por causa dela
           dava exatamente o mesmo resultado (107 DU, e1 0..5, s1a 0..1,
           s1b 0..4, s1c 4..5), só que pagando um `_contexto` a mais. */
      var temAvancoFolha = false;
      if (execRede && X.avanco) {
        X.avanco.lista.forEach(function (e) { if (own(folhaDe, e.id)) temAvancoFolha = true; });
      }
      var precisaArvore = cruz.length > 0 || (execRede && (temRedeFolha || temDataFolha || temAvancoFolha));
      var G = {}, parSub = 0;
      if (precisaArvore) {
        var P = self._contexto(mem, orc, self._params(orc), calc || null, false).P;
        parSub = P.parSub;
        P.grupos.forEach(function (g) {
          if (g.folhasRede && g.folhasRede.length) G[g.no.id] = self._grupoInteg(g, EF, execRede, folhaDe, porId, cruz, avR);
        });
      }
      // as datas das folhas (só com o prazo detalhado pelas subetapas)
      var datasEt = {}, datasFo = {};
      for (fid in EF.datas) {
        if (!own(EF.datas, fid)) continue;
        var dd = EF.datas[fid];
        if (dd.fonte !== "rede") continue;
        if (dd.folha) { if (execRede && G[dd.dono] && G[dd.dono].porId[fid]) datasFo[fid] = dd; continue; }
        if (own(NP, fid)) datasEt[fid] = dd;
      }

      /* ---- KAHN, passo 1: só etapa → etapa (a regra de hoje sobre a sombra) ----
         A sombra de uma etapa com rede é `predecessoras` = os elos digitados +
         os derivados cruzados; então o grafo que a 1.2.81 vê é este, e o
         ciclo que ela acusa é o mesmo. */
      var cruzPara = {};
      cruz.forEach(function (c) {
        if (!own(porId, c.Ep) || !own(porId, c.Ef) || c.Ep === c.Ef) return;
        (cruzPara[c.Ef] = cruzPara[c.Ef] || []).push(c);
      });
      N.forEach(function (n) {
        var ps = [], pe = [];
        n.elos.forEach(function (l) {
          if (ps.indexOf(l.p) < 0) ps.push(l.p);
          if (!NP[l.p].extra && pe.indexOf(l.p) < 0) pe.push(l.p);
        });
        n.cruzIn = cruzPara[n.id] || [];
        n.cruzIn.forEach(function (c) { if (ps.indexOf(c.Ep) < 0) ps.push(c.Ep); if (pe.indexOf(c.Ep) < 0) pe.push(c.Ep); });
        n.preds = ps;      // todos (a ordem de Kahn do passo 2)
        n.predsEt = pe;    // só etapas: o que a 1.2.81 vê na sombra (I3)
        if (n.cruzIn.length) n.et.predsExplicito = true;   // a sombra passa a ter a lista explícita (O26)
      });
      var NE = N.filter(function (n) { return !n.extra; });
      var indeg = {}, succ = {}, ordem = [], fila = [], at;
      NE.forEach(function (n) { indeg[n.id] = n.predsEt.length; succ[n.id] = []; });
      NE.forEach(function (n) { n.predsEt.forEach(function (p) { succ[p].push(n.id); }); });
      NE.forEach(function (n) { if (!indeg[n.id]) fila.push(n.id); });
      while (fila.length) { at = fila.shift(); ordem.push(at); succ[at].forEach(function (s) { if (--indeg[s] === 0) fila.push(s); }); }
      var temCiclo = ordem.length < NE.length;
      if (temCiclo) NE.forEach(function (n) { if (ordem.indexOf(n.id) < 0) { n.et.cicloDep = true; ordem.push(n.id); } });
      var posOrd = {};
      ordem.forEach(function (id, k) { posOrd[id] = k; });
      /* KAHN, passo 2 (§2.3-E4): todos os nós. O elo etapa→etapa que o passo 1
         ignorou continua ignorado (a data da 1.2.81); travou por causa de
         extra → o primeiro nó (etapas na ordem da lista, depois extras) cujos
         elos pendentes TOCAM extra ignora esses elos, com o aviso
         `extras-ciclo`. Num laço etapa → extra → etapa, a etapa ignora o elo
         da extra e fica com a data da 1.2.81 (sem código no catálogo). */
      var ignElo = {}, avisosExtras = [];
      if (NX.length) {
        var pend2 = {}, falta2 = {}, suc2 = {}, feito2 = {}, ord2 = [], fila2 = [];
        N.forEach(function (n) { suc2[n.id] = []; });
        N.forEach(function (n) {
          var ps2 = [];
          n.preds.forEach(function (p) {
            if (!n.extra && !NP[p].extra && posOrd[p] > posOrd[n.id]) { ignElo[n.id + "|" + p] = true; return; }
            ps2.push(p);
          });
          pend2[n.id] = ps2; falta2[n.id] = ps2.length;
          ps2.forEach(function (p) { suc2[p].push(n.id); });
        });
        N.forEach(function (n) { if (!falta2[n.id]) fila2.push(n.id); });
        var guarda2 = 0;
        while (ord2.length < N.length && guarda2++ < 4 * N.length + 10) {
          if (!fila2.length) {
            var esc = null;
            for (var q = 0; q < N.length && !esc; q++) {
              var nq = N[q];
              if (feito2[nq.id]) continue;
              var toca = pend2[nq.id].filter(function (p) { return !feito2[p] && !ignElo[nq.id + "|" + p] && (NP[p].extra || nq.extra); });
              if (toca.length) esc = { n: nq, toca: toca };
            }
            if (!esc) break;
            esc.toca.forEach(function (p) { ignElo[esc.n.id + "|" + p] = true; falta2[esc.n.id]--; });
            if (esc.n.extra) esc.n.cicloDep = true; else esc.n.et.cicloDep = true;
            avisosExtras.push({ tipo: "extras-ciclo", id: esc.n.id, elos: esc.toca.slice() });
            if (!falta2[esc.n.id]) fila2.push(esc.n.id);
            continue;
          }
          at = fila2.shift(); ord2.push(at); feito2[at] = true;
          suc2[at].forEach(function (s) { if (!ignElo[s + "|" + at] && --falta2[s] === 0) fila2.push(s); });
        }
        N.forEach(function (n) { if (!feito2[n.id]) ord2.push(n.id); });
        ordem = ord2;
      }

      /* ---- E10: o alcance dos feriados ----
         A régua precisa existir ANTES da ida (datas reais viram índice), e o
         `_feriadosDe` cobre anos inteiros a partir de uma estimativa do prazo:
         a soma das durações, das esperas positivas e da maior distância até
         uma data digitada. Se a ida terminar depois do último ano coberto, a
         passada roda de novo, UMA vez, com o alcance certo. */
      var dpw = params.diasUteisSemana || 5;
      var ini0 = params.dataInicio ? new Date(params.dataInicio + (String(params.dataInicio).length <= 10 ? "T00:00:00" : "")) : new Date();
      var est = 0, distMax = 0;
      etapas.forEach(function (et) { est += Math.max(0, num(et.duracaoPlena != null ? et.duracaoPlena : et.duracao)); });
      NX.forEach(function (n) { est += Math.max(0, n.D); });
      N.forEach(function (n) { n.elos.forEach(function (l) { if (l.L > 0) est += l.L; }); });
      cruz.forEach(function (c) { if (c.lag > 0) est += c.lag; });
      function distAte(s) {
        var ms = msDeData(s);
        if (ms == null || isNaN(ini0.getTime())) return;
        var corr = Math.round((ms - meiaNoite(ini0)) / 86400000);
        if (corr > distMax) distMax = corr;
      }
      var rsU = mapaDe(cron, "restricoes");
      if (rsU) Object.keys(rsU).forEach(function (k) { if (rsU[k] && typeof rsU[k] === "object") distAte(rsU[k].data); });
      Object.keys(EF.datas).forEach(function (k) { if (EF.datas[k].d) distAte(EF.datas[k].d); });
      est = est + Math.ceil(distMax * (dpw / 7)) + 1;

      function passada(estP) {
        /* ---- o dia 0 e a tabela: a MESMA conta do `_idaVolta` ---- */
        var iniD = new Date(ini0.getTime());
        var fer = self._feriadosDe(params, iniD, estP);
        var iniPedido = new Date(iniD.getTime()), ajusteInicio = null, giros = 0;
        while (!self.diaUtil(iniD, params.diasUteisSemana, fer.mapa) && giros++ < 40) iniD.setDate(iniD.getDate() + 1);
        if (iniD.getTime() !== iniPedido.getTime()) {
          ajusteInicio = { de: self._ch(iniPedido), para: self._ch(iniD), motivo: fer.mapa[self._ch(iniPedido)] || "fim de semana" };
        }
        var cal = self.calendario({ dataInicio: iniD, params: params, feriados: { mapa: fer.mapa } });
        if (!cal) throw new Error("a data de início do cronograma é inválida");
        var O = self._regua(cal);
        N.forEach(function (n) {
          n.pisoU = null; n.taeU = null; n.pisoR = null; n.fimMinR = null; n.tetoIniO = null; n.tetoFimO = null; n.mtp = false;
          n.taeMarca = false; n.dataRede = null; n.pisoBloco = null; n.folgaReal = null; n.mtpAndou = 0; n.aperta = null;
          n.tetoIniD = null; n.tetoFimD = null; n.pisoD = null;
        });

        /* ---- E5: OS CALENDÁRIOS DAS FRENTES ----
           Quem tem calendário próprio conta a duração em dias de TRABALHO DA
           FRENTE, em data real; a régua da obra só recebe o resultado por
           `phi`. Espera e sobreposição continuam em dias úteis da OBRA
           (decisão técnica da §5.1: é a única forma de paridade com a
           1.2.81 — medido 85 × 80 DU).
           ⚠ `calDe(id, dono)` é a régua ÚNICA da herança: folha ← etapa,
             grupo de soltos ← etapa, e o `cal.padrao` no fim. */
        var CCm = CC ? self._mod("CronoCal") : null;
        function calIdDe(id, dono) { return CC ? CCm.calDe(CC, id, dono) : null; }
        function ctxDe(cid) { return cid ? CC.ctxDe[cid] : null; }
        var temCal = !!CC;
        /* ---- E7: O AVANÇO LANÇADO ----
           `C` é o índice do corte + 1 dia corrido, na régua da obra.
           ⚠ `phi`, NUNCA `diaUtilDoCorte` nem `cal.indice(ms, totalDias)`
             (I15). O `diaUtilDoCorte` devolve `null` depois do fim previsto
             (js/cronograma.js:1381-1390) e o `cal.indice` com teto prende em
             `totalDias + 1` — e o resultado passa a depender de quanto a
             tabela já cresceu numa chamada ANTERIOR. Medido num plano de 67
             DU com fim em 30/10: corte 13/11 → `diaUtilDoCorte` null,
             `indice(ms, 67)` 68 (03/11) e `indice(ms, 400)` 76 (13/11), que é
             o certo. Um corte depois do fim previsto é o caso normal de uma
             obra atrasada. */
        var AV = {}, temAv = false, C = null, CD = null;
        if (X.avanco && X.avanco.corteMs != null) {
          CD = maisDias(X.avanco.corteMs, 1);
          C = O.phi(CD);
          temAv = true;
          X.avanco.lista.forEach(function (e) { AV[e.id] = e; });
          /* a entrada `rs: 1` de etapa resumida vale por TODAS as folhas dela:
             elas são lidas como concluídas e escaladas na janela real [i, f] */
          Object.keys(G).forEach(function (eid) {
            var a = AV[eid];
            if (!a || a.rs !== 1) return;
            G[eid].resumida = a;
          });
        }
        var CAvm = temAv ? self._mod("CronoAvanco") : null;
        function estadoAv(a) { return a ? CAvm.estadoDe(a) : "nao-iniciada"; }
        /* ---- as duas funções de data que o avanço usa, nas DUAS réguas ----
           `ctx` null = régua da obra; `ctx` = o calendário da frente.
           ⚠ `consumir` na régua da obra é `O.dia(phi(d) + dur − 1)`, com
             `phi`, e NUNCA o índice por piso: o corte na sexta com `CD` no
             sábado cairia na sexta e encurtaria um dia (crítica 2, achado 6).
             Caso escrito à mão: D = 10 com início na segunda 31/08 e 40% no
             corte da sexta 04/09, feriado na segunda 07/09 → feito 4,
             rest 6, `avancar` = sex 04/09, CD = sáb 05/09, reD = sáb 05/09,
             `phi(sáb)` = ter 08/09 e `consumir` = ter 15/09 (BD = qua 16/09).
             Com o índice por piso daria segunda 14/09. */
        function consumirEm(ctx, d, dur) {
          if (ctx) { var u = CCm.consumir(ctx, d, dur); return u != null ? u : d; }
          if (!(dur > 0)) return O.dia(O.phi(d));
          return O.dia(O.phi(d) + Math.ceil(dur) - 1);
        }
        function avancarEm(ctx, d, feito) {
          if (!(feito > 0)) return d;
          if (ctx) { var a = CCm.avancar(ctx, d, feito); return a != null ? a : d; }
          return O.dia(O.phi(d) + Math.ceil(feito));
        }
        function temAvancoEm(n) {
          if (!temAv) return false;
          var a = AV[n.id], st = a ? estadoAv(a) : null;
          if (st === "concluida" || st === "iniciada") return true;
          if (!G[n.id]) return false;
          var achou = false;
          G[n.id].lista.forEach(function (f) {
            var b = AV[f.id], s2 = b ? estadoAv(b) : null;
            if (s2 === "concluida" || s2 === "iniciada") achou = true;
          });
          if (G[n.id].resumida) achou = true;
          return achou;
        }
        /* o que a rede INTERNA precisa saber do calendário e do avanço (sem
           eles, `null`: a folha sai pela conta de hoje, byte a byte) */
        var HCal = (temCal || temAv) ? { temCal: temCal, O: O, CC: CC, CCm: CCm,
          temAv: temAv, AV: AV, C: C, CD: CD, CAvm: CAvm, ctxDe: ctxDe } : null;
        if (temCal) {
          N.forEach(function (n) {
            n.calId = calIdDe(n.id, null);
            n.calProprio = !!n.calId;
            /* a DURAÇÃO DA FRENTE: a digitada (`cal.dur`) manda; sem ela, a
               estimativa da obra vale como dias de trabalho da frente, já
               dividida pelos turnos (D12: dois turnos reduzem a estimada, a
               digitada não muda) */
            if (!n.calProprio) { n.durF = null; return; }
            var c = CC.porId[n.calId];
            n.durF = own(CC.dur, n.id) ? CC.dur[n.id] : (n.D > 0 ? Math.ceil(n.D / Math.max(1, c.turnos)) : 0);
          });
          Object.keys(G).forEach(function (eid) {
            G[eid].lista.forEach(function (f) {
              f.calId = calIdDe(f.id, eid);
              f.calProprio = !!f.calId;
              if (!f.calProprio) { f.durF = null; return; }
              var c = CC.porId[f.calId];
              f.durF = own(CC.dur, f.id) ? CC.dur[f.id] : (f.D > 0 ? Math.ceil(f.D / Math.max(1, c.turnos)) : 0);
            });
          });
          /* ⚠ O11: a etapa com FOLHA em calendário próprio não aceita TT/IT
             nem restrição de término, porque o vão em dias úteis da obra muda
             com o dia da semana em que a frente começa. A digitação recusa;
             dado de fora vale como TI/piso de início, com aviso. */
          N.forEach(function (n) {
            n.folhaCal = false;
            if (!n.et || !G[n.id]) return;
            G[n.id].lista.forEach(function (f) { if (f.calProprio) n.folhaCal = true; });
          });
        }

        /* ---- E6: as restrições, em índice da régua da obra ---- */
        var restr = self._restricoes(orc, etapas);
        if (restr) restr.lista.forEach(function (x) {
          var t0 = new Date(x.data + "T00:00:00");
          if (isNaN(t0.getTime())) { restr.invalidos.push({ id: x.id, motivo: "data" }); return; }
          x.indice = O.phi(meiaNoite(t0));   // ⚠ o dia parado SOBE (a regra de hoje, `_aplicarRestricoes`)
          if (x.tipo === "nia") {
            NP[x.id].pisoU = x.indice;
            calRestricao(NP[x.id], "nia", meiaNoite(t0));   // em calendário próprio, o 1º dia de trabalho da FRENTE (O27)
          } else NP[x.id].taeU = x;
        });
        // o "não começa antes de" da própria tarefa sem preço
        NX.forEach(function (n) { var mx = n.x.nia ? msDeData(n.x.nia) : null; if (mx != null) n.pisoU = O.phi(mx); });
        Object.keys(datasEt).forEach(function (id) {
          var d = datasEt[id], n = NP[id], ms = d.d ? msDeData(d.d) : null;
          n.dataRede = d;
          if (d.t === "mtp") { n.mtp = true; return; }
          if (d.t === "tae") { n.taeMarca = !!d.marca; return; }
          if (ms == null) return;
          /* ⚠ INÍCIO: o dia parado SOBE (piso e o "deve iniciar em" começam no
             mesmo dia útil — senão uma tarefa que começou certo acusaria
             violação). TÉRMINO: a data é o ÚLTIMO dia trabalhado (O15), e o
             `fim` do motor é exclusivo — `phi(u + 1 dia)` = k(u') + 1. */
          if (d.t === "dia") { n.pisoR = O.phi(ms); n.tetoIniO = n.pisoR; }
          else if (d.t === "nid") n.tetoIniO = O.phi(maisDias(ms, 1)) - 1;
          else if (d.t === "nta") n.fimMinR = O.phi(maisDias(ms, 1));
          else if (d.t === "dta") { n.fimMinR = O.phi(maisDias(ms, 1)); n.tetoFimO = n.fimMinR; }
          calRestricao(n, d.t, ms);
        });
        /* ---- E6 em CALENDÁRIO PRÓPRIO (O27, I16): a restrição é julgada em
           DATA REAL, no calendário do nó — o piso pelo `recuar`, e o teto pela
           data real (a regra de sinal da §2.5).
           ⚠ Pela régua da obra, "deve terminar em" numa frente 7×7 erra: D=10
             com término pedido na sexta 13/11 dá 04/11..13/11 pelo calendário
             da frente e 02/11..11/11 pelo índice da obra.
           ⚠ ETAPA COM FOLHA em calendário próprio (O11): `nta`/`dta` é
             recusada na digitação; dado de fora vale como piso de INÍCIO
             k(u')+1−D na régua da obra, com aviso — o vão dela em dias úteis
             da obra muda com o dia da semana em que a frente começa, e não há
             conta exata. */
        function calRestricao(n, t, ms) {
          if (!temCal) return;
          if (t === "dia" || t === "nia") { if (n.calProprio) { var p0 = CCm.primeiroDia(ctxDe(n.calId), ms); if (p0 != null) { n.pisoD = maxN(n.pisoD, p0); n.pisoR = maxN(n.pisoR, O.phi(p0)); if (t === "dia") { n.tetoIniD = p0; n.tetoIniO = O.phi(p0); } } } return; }
          if (t === "nid") { if (n.calProprio) n.tetoIniD = msDeData(chMs(ms)); return; }
          if (t !== "nta" && t !== "dta") return;
          if (n.folhaCal) {
            avR({ tipo: "restricao-calendario", id: n.id, restricao: t,
              msg: "A etapa " + (NP[n.id].i + 1) + " tem subetapa em calendário próprio: “" + (t === "dta" ? "deve terminar em" : "não terminar antes de") +
                "” foi lida como um piso de início na régua da obra. Nessa combinação o vão em dias úteis da obra muda com o dia da semana em que a frente começa." });
            if (n.fimMinR != null) { n.pisoR = maxN(n.pisoR, n.fimMinR - n.D); n.fimMinR = null; n.tetoFimO = null; }
            return;
          }
          if (!n.calProprio) return;
          var pr = CCm.recuar(ctxDe(n.calId), ms, n.durF);
          if (pr != null) { n.pisoD = maxN(n.pisoD, pr); n.pisoR = maxN(n.pisoR, O.phi(pr)); }
          n.fimMinR = null;                       // o piso de término já entrou como piso de INÍCIO, exato no calendário do nó
          if (t === "dta") n.tetoFimD = msDeData(chMs(ms));
        }
        N.forEach(function (n) {
          // o "terminar até" do usuário COM a marca (O22) entra na volta, com a data como último dia (O15)
          if (n.taeU && n.taeMarca) {
            var mt = msDeData(n.taeU.data);
            if (mt != null) {
              n.tetoFimO = minN(n.tetoFimO, O.phi(maisDias(mt, 1)));
              // em calendário próprio, o SINAL da folga do teto sai da data real (§2.5, I16)
              if (temCal && (n.calProprio || n.folhaCal)) n.tetoFimD = minN(n.tetoFimD, mt);
            }
          }
        });
        Object.keys(G).forEach(function (eid) {
          G[eid].lista.forEach(function (f) {
            f.pisoO = null; f.fimMinR = null; f.tetoIniO = null; f.tetoFimO = null; f.mtp = false; f.dataRede = null;
            f.tetoIniD = null; f.tetoFimD = null;
            var d = datasFo[f.id], ms;
            if (!d) return;
            f.dataRede = d;
            if (d.t === "mtp") { f.mtp = true; return; }
            ms = msDeData(d.d);
            if (ms == null) return;
            if (d.t === "dia" || d.t === "nia") f.pisoO = O.phi(ms);
            if (d.t === "dia") f.tetoIniO = f.pisoO;
            else if (d.t === "nid") f.tetoIniO = O.phi(maisDias(ms, 1)) - 1;
            else if (d.t === "nta") f.fimMinR = O.phi(maisDias(ms, 1));
            else if (d.t === "dta") { f.fimMinR = O.phi(maisDias(ms, 1)); f.tetoFimO = f.fimMinR; }
            else if (d.t === "tae") f.tetoFimO = O.phi(maisDias(ms, 1));
            /* a mesma regra da etapa em calendário próprio (O27, I16): o piso
               de início pelo 1º dia de trabalho da frente, o piso de término
               pelo `recuar`, e o teto guardado em data real para o sinal */
            if (temCal && f.calProprio) {
              if (d.t === "dia" || d.t === "nia") { var p1 = CCm.primeiroDia(ctxDe(f.calId), ms); if (p1 != null) { f.pisoO = maxN(f.pisoO, O.phi(p1)); f.pisoD = p1; if (d.t === "dia") { f.tetoIniD = p1; f.tetoIniO = O.phi(p1); } } }
              else if (d.t === "nid") f.tetoIniD = ms;
              else if (d.t === "nta" || d.t === "dta") {
                var pr1 = CCm.recuar(ctxDe(f.calId), ms, f.durF);
                if (pr1 != null) { f.pisoO = maxN(f.pisoO, O.phi(pr1)); f.pisoD = maxN(f.pisoD, pr1); }
                f.fimMinR = null;
                if (d.t === "dta") f.tetoFimD = ms;
              } else if (d.t === "tae") f.tetoFimD = ms;
            }
          });
        });

        /* posição RELATIVA planejada de cada folha (base 0, sem piso): o modelo
           bloco (D7) desloca a etapa inteira por ela */
        var rels = {};
        function relDe(eid) { if (!rels[eid]) rels[eid] = self._redeAbsInteg(G[eid], { esO: 0 }, parSub, HCal); return rels[eid]; }
        var abs = {};
        function posFolha(eid, pfid) {
          var F = G[eid];
          if (!F || !F.porId[pfid]) return null;
          if (execRede) return abs[eid] ? abs[eid][pfid] : null;
          /* modo padrão: a folha é DESENHADA em escala na janela da etapa (a
             mesma `_escalar` do `_arvore`) — é essa a posição que o "8, 5.2"
             digitado na etapa enxerga */
          var Ep = NP[eid];
          if (!F.esc || F.escIni !== Ep.iniO || F.escFim !== Ep.fimO) {
            var esc = F.lista.map(function (f) { return { id: f.id, iniInt: f.fr.ini, fimInt: f.fr.fim, folgaInt: f.fr.folga, marco: f.marco, preds: f.fr.predsResolvidos }; });
            self._escalar(esc, Ep.iniO, Ep.fimO);
            F.esc = {};
            esc.forEach(function (e) { F.esc[e.id] = { iniO: e.ini, fimO: e.fim }; });
            F.escIni = Ep.iniO; F.escFim = Ep.fimO;
          }
          return F.esc[pfid];
        }
        /* o início que o elo cruzado pede para a etapa sucessora (O26):
           {vIni, cO (a etapa inteira anda), f (a folha ligada)} */
        function alvoCruz(c) {
          var Ep = NP[c.Ep], q = c.pf ? posFolha(c.Ep, c.pf) : { iniO: Ep.iniO, fimO: Ep.fimO };
          if (!q) return null;
          var Lq = c.lag != null ? c.lag : (c.tipo === "TI" ? -Math.floor(parSub * (q.fimO - q.iniO)) : 0);
          var alvo = ((c.tipo === "II" || c.tipo === "IT") ? q.iniO : q.fimO) + Lq;
          var n = NP[c.Ef], Dd = c.f ? G[c.Ef].porId[c.f].D : (rede0(c.Ef) ? maxFim(relDe(c.Ef)) : n.D);
          var vIni = alvo - ((c.tipo === "TT" || c.tipo === "IT") ? Dd : 0);
          return { vIni: vIni, cO: vIni - (c.f ? relDe(c.Ef)[c.f].iniO : 0) };
        }
        /* "a etapa já começou": com avanço iniciado ou concluído nela ou em
           qualquer folha dela. É o que segura o BLOCO — uma etapa que já
           começou não anda por causa de um elo cruzado nem de um piso de
           término (o elo passa a cobrar só a subetapa ligada, O26). */
        function iniciadaEt(n) { return temAvancoEm(n); }
        function maxFim(A) { return self._extremos(A).fim; }
        /* a etapa cuja duração É o vão das folhas (a mesma regra do `_vaosExec`:
           modo executivo, não-marco, vão > 0). ⚠ Etapa só de marcos (vão 0)
           vale a duração digitada ou a estimativa, como hoje — pela rede
           interna ela sairia com 0 e a 1.2.81 com 1. */
        function rede0(eid) { var n0 = NP[eid]; return !!(G[eid] && execRede && !n0.marco && maxFim(relDe(eid)) > 0); }

        /* ---- E8: A IDA INTEGRADA ---- */
        var resolvido = {};
        ordem.forEach(function (id) {
          var n = NP[id], et = n.et, esO = 0, fimMin = null, pisoFolha = {}, etIni = iniciadaEt(n);
          var aperta = null, apertaV = null, retTI = [];
          var esOEt = 0, esD = temCal ? O.dia(0) : null;
          n.elos.forEach(function (l) {
            l.ign = !resolvido[l.p] || own(ignElo, n.id + "|" + l.p);
            if (l.ign) return;
            var p = NP[l.p], dP = p.fimO - p.iniO;
            var L = l.L != null ? l.L : (l.tipo === "TI" ? -Math.floor(par * dP) : 0), c, cD = null, tipo = l.tipo;
            l.Lef = L;
            /* ⚠ O11 (dado de fora): TT/IT com o SUCESSOR em calendário próprio
               (ou com folha em calendário próprio) vale como TI com a mesma
               espera, com aviso. Ninguém mediu essa combinação, e a sombra
               dela não é exata: o vão em dias úteis da obra muda com o dia da
               semana em que a frente começa. A digitação recusa antes. */
            if (temCal && (tipo === "TT" || tipo === "IT") && (n.calProprio || n.folhaCal)) {
              avR({ tipo: "tipo-calendario", id: n.id, elo: l.p, de: tipo,
                msg: "A ligação " + tipo + " com a etapa " + (NP[l.p] && NP[l.p].et ? NP[l.p].i + 1 : l.p) + " não vale em linha de calendário próprio — ela foi lida como “depois de”, com a mesma espera." });
              tipo = "TI"; l.tipoEf = "TI";
            }
            if (tipo === "TI") {
              c = p.fimO + L; cD = (L === 0 && temCal) ? p.BD : (temCal ? O.dia(c) : null);
              /* LÓGICA RETIDA (decisão técnica da §5.1): o que FALTA de uma
                 tarefa em andamento espera a predecessora TI que ainda não
                 terminou. Medido: 47 de 47 prazos batem com a 1.2.81 com ela,
                 e 39 de 47 sem ela. É o padrão do Primavera P6. */
              if (temAv) retTI.push({ p: p, cO: c, cD: cD != null ? cD : O.dia(c) });
            }
            else if (tipo === "II") {
              c = p.iniO + L;   // ⚠ do início EFETIVO da predecessora (crítica 2, achado 1)
              if (temCal) {
                /* espera 0 entre calendários DIFERENTES: a data real é o
                   início PERMITIDO da predecessora (é o que mantém a paridade;
                   o começo efetivo dela pode ser dias depois, no 1º dia de
                   trabalho da frente dela) */
                if (L !== 0) cD = O.dia(c);
                else if (calIdDe(p.id, null) === n.calId) cD = p.iniD;
                else { cD = p.iniPermD != null ? p.iniPermD : O.dia(c); avR({ tipo: "ii-calendarios", id: n.id, elo: l.p }); }
              }
            } else { var alvoT = (tipo === "TT" ? p.fimO : p.iniO) + L; fimMin = maxN(fimMin, alvoT); c = alvoT - n.D; }
            if (tipo === "TI" || tipo === "II") {
              esO = Math.max(esO, c);
              if (temCal && cD != null) esD = Math.max(esD, cD);
              if (!p.extra) esOEt = Math.max(esOEt, c);
            }
            if (c != null && (apertaV == null || c > apertaV)) { apertaV = c; aperta = l.p; }
          });
          n.cruzIn.forEach(function (c) {
            c.ign = !resolvido[c.Ep]; c.cO = null;
            if (c.ign) return;
            var a = alvoCruz(c);
            if (!a) { avR({ tipo: "rede-cruzado-sem-posicao", id: n.id, elo: c.pf || c.Ep }); return; }
            /* etapa já iniciada: o bloco não anda, o elo cobra só a subetapa ligada */
            if (c.f && etIni) { pisoFolha[c.f] = Math.max(pisoFolha[c.f] || 0, a.vIni); return; }
            c.cO = a.cO;
            if (a.cO > esO) esO = a.cO;
            if (a.cO > esOEt) esOEt = a.cO;
            if (apertaV == null || a.cO > apertaV) { apertaV = a.cO; aperta = c.Ep; }
          });
          /* a restrição de SUBETAPA também é da etapa deslocada (bloco, REDE F4) */
          if (rede0(id)) G[id].lista.forEach(function (f) {
            if (f.pisoO == null && f.fimMinR == null) return;
            var vI = maxN(f.pisoO, f.fimMinR != null ? f.fimMinR - f.D : null);
            if (etIni) { pisoFolha[f.id] = Math.max(pisoFolha[f.id] || 0, vI); return; }
            n.pisoBloco = maxN(n.pisoBloco, vI - relDe(id)[f.id].iniO);
          });
          n.redeO = Math.max(0, esO);
          n.redeEtO = Math.max(0, esOEt);   // o início que só as ETAPAS pedem (a tela: "empurrada por T1")
          n.aperta = aperta;
          var piso = maxN(maxN(n.pisoU, n.pisoR), n.pisoBloco);
          if (piso != null && piso > esO) esO = piso;
          esO = Math.max(0, esO);
          n.iniPermO = esO;
          if (temCal) {
            if (n.pisoD != null && n.pisoD > esD) esD = n.pisoD;
            /* ⚠ A INVARIANTE É `phi(esD) === esO`, e NÃO `esD >= O.dia(esO)`.
               É ela que faz a 1.2.81, lendo a sombra, cair no mesmo índice.
               Subir `esD` até o próximo dia DE OBRA quebraria o piso que
               nasceu no calendário da frente: uma 7×7 com "deve iniciar em"
               no sábado 14/11 começaria na segunda 16/11, porque
               `O.dia(phi(sábado))` é a segunda. A data real pode ser um dia
               em que a obra não trabalha — quem não pode é o ÍNDICE. */
            if (O.phi(esD) < esO) esD = O.dia(esO);
          }
          n.iniPermD = temCal ? esD : null;
          var fimMinP = maxN(fimMin, n.fimMinR);
          n.fimMin = fimMin; n.fimMinP = fimMinP;
          var aN = temAv ? AV[n.id] : null, estN = aN ? estadoAv(aN) : null;
          if (n.fora || n.marco) {
            /* ⚠ TT/IT e o piso de término valem no marco (crítica 2, achado 3),
               e o corte empurra o marco que ainda não aconteceu. O marco
               CONCLUÍDO cai no dia do evento, e nada o move. */
            if (estN === "concluida") {
              n.iniO = n.fimO = O.phi(msDeData(aN.f)); n.iniD = n.BD = msDeData(aN.f); n.ultDia = msDeData(aN.f);
              /* ⚠ O MARCO CONCLUÍDO TAMBÉM PRECISA DO ESTADO. Sem ele, a âncora
                 da O16 não ajusta o `predDesloc` deste nó, e o motor devolvia 0
                 enquanto a sombra gravava −9 no mesmo elo: a `conferirFrota`
                 acusava divergência num plano certo, e o recado do salvar
                 dizia "não consegui garantir" sem nada errado. */
              n.avEstado = "concluida";
              n.foraSeq = n.iniO < esO;
            } else {
              n.iniO = n.fimO = Math.max(esO, fimMinP != null ? fimMinP : 0, temAv ? C : 0);
              if (temAv) {
                var sRedeM = Math.max(esO, fimMinP != null ? fimMinP : 0);
                n.avEstado = n.iniO > sRedeM ? "empurrada" : "nao-iniciada";
                n.avEmpurrado = Math.max(0, n.iniO - sRedeM);
              }
            }
          } else if (temAv && (estN === "concluida" || estN === "iniciada")) {
            /* ---- A TAREFA COM REAL LANÇADO (§2.4) ----
               ⚠ O REAL MANDA sobre a rede, sobre o piso e sobre o corte. Uma
                 tarefa que começou dia 24 começou dia 24, mesmo que a rede só
                 deixasse começar dia 27 — foi o que a obra fez. Quem cobra a
                 diferença é o `foraSeq` e a âncora da projeção (O16), não o
                 motor mudando o número que a pessoa lançou. */
            var ctxA = (temCal && n.calProprio) ? ctxDe(n.calId) : null;
            var Dn = (temCal && n.calProprio) ? n.durF : n.D;
            var iMs = msDeData(aN.i);
            n.iniD = iMs; n.iniO = O.phi(iMs);
            if (estN === "concluida") {
              n.BD = maisDias(msDeData(aN.f), 1); n.ultDia = msDeData(aN.f);
              n.fimO = O.phi(n.BD);
              if (n.fimO < n.iniO) n.fimO = n.iniO;
              n.avEstado = "concluida";
            } else {
              /* `r` (dias que faltam) MANDA sobre o `p`: ele é o número que a
                 obra informou, e o % é derivado. Com 100% e sem fim real (dado
                 de fora, O24) `feito` dá `D` e `rest` dá max(1, 0) = 1. */
              var feito = (aN.r != null) ? Math.max(0, Dn - aN.r) : Math.round(Dn * ((aN.p == null ? 0 : aN.p) / 100));
              var rest = (aN.r != null) ? aN.r : Math.max(1, Dn - feito);
              var reD = Math.max(CD, avancarEm(ctxA, iMs, feito));
              // LÓGICA RETIDA: o que falta espera a predecessora TI não concluída
              retTI.forEach(function (q) {
                var ap = temAv ? AV[q.p.id] : null;
                if (ap && estadoAv(ap) === "concluida") return;
                if (q.cD > reD) reD = q.cD;
              });
              var ultA = consumirEm(ctxA, reD, rest);
              n.BD = maisDias(ultA, 1); n.ultDia = ultA;
              n.fimO = O.phi(n.BD);
              if (fimMin != null && n.fimO < fimMin && !(temCal && n.calProprio)) { n.fimO = fimMin; n.BD = O.dia(fimMin); n.ultDia = O.dia(Math.max(0, fimMin - 1)); }
              if (n.fimO <= n.iniO) n.fimO = n.iniO + 1;
              n.avEstado = "andamento";
              n.avFeito = feito; n.avRest = rest;
            }
            n.foraSeq = n.iniO < esO;
          } else if (temCal && n.calProprio) {
            /* ---- A TAREFA EM CALENDÁRIO PRÓPRIO (§2.4) ----
               A duração é contada em dias de TRABALHO DA FRENTE, em data
               real; a régua da obra vê o início na posição PERMITIDA
               (`phi(esD) = esO` por construção) e o fim em `phi(BD)`.
               ⚠ `BD` é o dia CORRIDO seguinte ao último dia trabalhado — é
                 ele que a sucessora TI com espera 0 lê. "BD − 1 dia" cairia
                 num domingo e o recado mostraria o dia errado; quem precisa
                 do último dia trabalhado usa `ultD`. */
            var sDc = esD, sOc = esO, sRedeC = esO;
            if (temAv && C > sOc) { sOc = C; sDc = Math.max(sDc, CD); }   // o não iniciado não começa antes do corte
            if (fimMinP != null && fimMinP - n.D > sOc) { sOc = fimMinP - n.D; sDc = Math.max(sDc, O.dia(sOc)); }
            if (fimMinP != null) sRedeC = Math.max(esO, fimMinP - n.D);
            if (temAv) { n.avEstado = sOc > sRedeC ? "empurrada" : "nao-iniciada"; n.avEmpurrado = Math.max(0, sOc - sRedeC); }
            var cx = ctxDe(n.calId);
            var p2 = CCm.primeiroDia(cx, sDc);
            if (p2 == null) {
              avR({ tipo: "calendario-sem-dia", id: n.id, cal: n.calId,
                msg: "O calendário “" + (CC.porId[n.calId] || {}).nome + "” não tem dia de trabalho nos próximos dez anos a partir de " + brMs(sDc) + " — esta linha ficou na régua da obra." });
              n.calProprio = false; n.calId = null;
              n.iniO = sOc; n.fimO = sOc + n.D;
            } else {
              var u2 = CCm.consumir(cx, p2, n.durF);
              if (u2 == null) {
                avR({ tipo: "calendario-consumo-longo", id: n.id, cal: n.calId,
                  msg: "A linha " + (et ? n.i + 1 : n.id) + " precisaria de mais de dez anos no calendário “" + (CC.porId[n.calId] || {}).nome + "” — ela ficou na régua da obra." });
                n.calProprio = false; n.calId = null;
                n.iniO = sOc; n.fimO = sOc + n.D;
              } else {
                n.iniD = p2; n.BD = maisDias(u2, 1); n.ultDia = u2;
                n.iniO = sOc; n.fimO = O.phi(n.BD);
                /* ⚠ vão ZERO na régua da obra (a frente só trabalha em dia
                   sem obra): a 1.2.81 ignora duração 0 e exigiria valor
                   positivo — a sombra grava `marcos = true` (D-VAO0) */
                if (n.fimO < n.iniO) n.fimO = n.iniO;
              }
            }
          } else if (rede0(id)) {
            var base = { esO: esO, esD: temCal ? esD : null, pisoFolha: pisoFolha };
            var A = self._redeAbsInteg(G[id], base, parSub, HCal);
            if (fimMinP != null && maxFim(A) < fimMinP && !etIni) {
              /* ⚠ O AJUSTE EXATO EM DUAS PASSADAS (O27; crítica 2, achado 4).
                 Cada fim de folha é max(b + a_f, c_f): só "max" e "+ constante".
                 Logo g(b) = max(b + A, K), com K < alvo. Passada 1 acha A;
                 passada 2 põe a base em alvo − A. "Refaz uma vez" (revisão 2)
                 deixava a folha empurrada pelo corte fora do alvo. */
              var A1 = self._redeAbsInteg(G[id], { esO: fimMinP, esD: O.dia(fimMinP), pisoFolha: pisoFolha }, parSub, HCal);
              base = { esO: fimMinP - (maxFim(A1) - fimMinP), esD: null, pisoFolha: pisoFolha };
              A = self._redeAbsInteg(G[id], base, parSub, HCal);
              var voltas = 0;
              while (maxFim(A) !== fimMinP && voltas++ < 50) {
                base = { esO: base.esO + (fimMinP - maxFim(A)), esD: null, pisoFolha: pisoFolha };
                A = self._redeAbsInteg(G[id], base, parSub, HCal);
              }
              if (maxFim(A) !== fimMinP) { avR({ tipo: "tt-etapa-nao-cumprido", id: id, alvo: fimMinP, fim: maxFim(A) }); n.defeito = true; }
            }
            var ext = self._extremos(A);
            n.iniO = ext.ini; n.fimO = ext.fim;
            abs[id] = A;
          } else {
            var sO = esO;
            if (temAv) sO = Math.max(sO, C);          // o não iniciado não começa antes do corte
            var sRede = esO;
            if (fimMinP != null) { sO = Math.max(sO, fimMinP - n.D); sRede = Math.max(esO, fimMinP - n.D); }
            n.iniO = sO; n.fimO = sO + n.D;
            /* ⚠ "empurrada PELO CORTE" se compara com `sRede`, e nunca com
               `esO`: com o piso de término em `fimMinP` (O27), comparar com
               `esO` chamaria de "empurrada pelo corte" o que foi a restrição
               de término — e o recado culparia o corte pelo que a pessoa
               digitou. */
            if (temAv) { n.avEstado = sO > sRede ? "empurrada" : "nao-iniciada"; n.avEmpurrado = Math.max(0, sO - sRede); }
          }
          /* as DATAS REAIS de quem está na régua da obra (§2.4): quem tem
             calendário próprio já as tem da conta acima. A etapa com folhas
             junta as das folhas — é `n.BD` que a sucessora TI com espera 0 lê,
             e ele precisa ser o dia seguinte ao último dia TRABALHADO por
             qualquer frente dentro dela. */
          if (temCal && !n.calProprio) {
            if (abs[id] && G[id]) {
              var iD = null, bD = null;
              Object.keys(abs[id]).forEach(function (k) {
                var a = abs[id][k];
                iD = iD == null ? a.iniD : Math.min(iD, a.iniD);
                bD = bD == null ? a.BD : Math.max(bD, a.BD);
              });
              n.iniD = iD != null ? iD : O.dia(n.iniO);
              n.BD = bD != null ? bD : O.dia(n.fimO);
            } else { n.iniD = O.dia(n.iniO); n.BD = O.dia(n.fimO); }
          }
          if (et) {
            et.inicio = n.iniO; et.fim = n.fimO;
            if (abs[id] && !n.fora && !n.marco) et.duracao = n.fimO - n.iniO;
            if (temCal && n.calProprio && !n.fora && !n.marco) et.duracao = n.fimO - n.iniO;
            /* ⚠ a etapa com real lançado dura o que a JANELA REAL dura: é esse
               o número que vai à sombra, e sem ele a `conferirFrota` acusaria
               divergência de duração contra a 1.2.81 num plano certo */
            if (temAv && n.avEstado && !n.fora && !n.marco) et.duracao = n.fimO - n.iniO;
          }
          resolvido[id] = true;
        });

        /* T = o fim do CONTRATADO (a régua de hoje: a etapa fora do prazo não estica) */
        var T = etapas.reduce(function (m, e) { return e.foraDoPrazo ? m : Math.max(m, e.fim); }, 0);
        var maxTudo = T;
        N.forEach(function (n) { if (n.fimO > maxTudo) maxTudo = n.fimO; });
        var alc = self._alcanceFeriados(params, new Date(ini0.getTime()), estP);
        if (alc != null && O.dia(maxTudo) > alc) return { refazer: maxTudo + 20 };

        /* ---- E9: A VOLTA ---- */
        var succI = {};
        N.forEach(function (n) { succI[n.id] = []; });
        N.forEach(function (s) {
          s.elos.forEach(function (l) { if (!l.ign) succI[l.p].push({ s: s, l: l }); });
          s.cruzIn.forEach(function (c) { if (!c.ign && c.cO != null) succI[c.Ep].push({ s: s, cruz: c }); });
        });
        function dEq(x, p) {
          if (x.cruz) return x.cruz.cO - p.fimO;
          return self._deslocTI(x.l.tipo, x.l.Lef, p.fimO - p.iniO, x.s.fimO - x.s.iniO);
        }
        /* ---- `ultD` e `SINAL` (§2.5, O27, I16) ----
           Em calendário próprio, o ÍNDICE DA OBRA erra o sinal da folga do
           teto no fim de semana, nos dois sentidos:
             • termina sáb 14/11 com "terminar até" sex 13/11 → `fimO` =
               phi(domingo) = segunda = `tetoFimO`, folga 0 — mas estourou;
             • começa sáb 14/11 com "não iniciar depois de" sáb 14/11 →
               `iniO` = phi(sáb) = segunda > `tetoIniO` = sexta, folga −1 —
               mas cumpriu.
           Por isso o VIOLADO sai da data real e o termo em dias úteis da obra
           é ajustado para o mesmo lado. */
        function ultD(n) {
          if (!temCal) return null;
          if (n.calProprio) return (n.marco || n.fora) ? n.iniD : maisDias(n.BD, -1);
          var A = abs[n.id], m = null;
          if (A && G[n.id]) Object.keys(A).forEach(function (k) {
            var f = G[n.id].porId[k], a = A[k];
            var u = (f && f.calProprio) ? ((f.marco) ? a.iniD : maisDias(a.BD, -1)) : O.dia(a.fimO - 1);
            m = m == null ? u : Math.max(m, u);
          });
          // ⚠ nunca "BD − 1 dia" na régua da obra: `BD` é O.dia(fimO), o próximo dia DE OBRA, e cairia no domingo
          return m != null ? m : O.dia(Math.max(0, n.fimO - 1));
        }
        function sinal(n, lado, tO) {
          if (!temCal || !(n.calProprio || n.folhaCal)) return tO;   // régua da obra: a conta de sempre
          var alvoD = lado === "fim" ? n.tetoFimD : n.tetoIniD;
          if (alvoD == null) return tO;
          var violado = lado === "fim" ? (ultD(n) > alvoD) : (n.iniD > alvoD);
          var t = lado === "fim" ? tO - n.fimO : tO - n.iniO;
          var ajuste = violado ? Math.min(t, -1) - t : Math.max(t, 0) - t;
          return tO + ajuste;
        }
        // os tetos de SUBETAPA voltam como teto da etapa deslocada (bloco)
        function tetosEtapa(n) {
          var tf = n.tetoFimO != null ? sinal(n, "fim", n.tetoFimO) : null;
          var ti = n.tetoIniO != null ? sinal(n, "ini", n.tetoIniO) + (n.fimO - n.iniO) : null, A = abs[n.id];
          if (A && G[n.id]) G[n.id].lista.forEach(function (f) {
            var a = A[f.id];
            if (!a) return;
            if (f.tetoFimO != null) tf = minN(tf, sinalF(f, a, "fim", f.tetoFimO) + (n.fimO - a.fimO));
            if (f.tetoIniO != null) ti = minN(ti, sinalF(f, a, "ini", f.tetoIniO) + (n.fimO - a.iniO));
          });
          return minN(tf, ti);
        }
        function sinalF(f, a, lado, tO) {
          if (!temCal || !f.calProprio) return tO;
          var alvoD = lado === "fim" ? f.tetoFimD : f.tetoIniD;
          if (alvoD == null) return tO;
          var u = f.marco ? a.iniD : maisDias(a.BD, -1);
          var violado = lado === "fim" ? (u > alvoD) : (a.iniD > alvoD);
          var t = lado === "fim" ? tO - a.fimO : tO - a.iniO;
          var ajuste = violado ? Math.min(t, -1) - t : Math.max(t, 0) - t;
          return tO + ajuste;
        }
        var temTeto = false;
        for (var vi = ordem.length - 1; vi >= 0; vi--) {
          var nv = NP[ordem[vi]], lf = (nv.extra && nv.fimO > T) ? nv.fimO : T;
          succI[nv.id].forEach(function (x) {
            if (x.s.folgaReal == null) return;
            lf = Math.min(lf, x.s.iniO + x.s.folgaReal - dEq(x, nv));
          });
          var tt = tetosEtapa(nv);
          if (tt != null) { temTeto = true; lf = Math.min(lf, tt); }
          nv.folgaReal = lf - nv.fimO;
          /* ⚠ O QUE JÁ TERMINOU NÃO ATRASA MAIS NADA: folga 0 e fora do
             caminho crítico. Sem isto, uma etapa concluída com atraso ficaria
             com folga negativa para sempre e pintaria a cadeia inteira de
             vermelho — o vermelho passaria a significar "já aconteceu", e
             quem lê o caminho crítico procura o que ainda dá para mudar. */
          if (temAv && nv.avEstado === "concluida") nv.folgaReal = 0;
        }

        /* ---- "O MAIS TARDE POSSÍVEL" (crítica 2, achado 9): em ordem
           REVERSA, cada um anda a folga livre recalculada contra os
           sucessores que JÁ andaram. T, as outras datas e a folga total dos
           outros não mudam. ---- */
        function folgaLivreEt(n) {
          var fl = null;
          succI[n.id].forEach(function (x) { var r = x.s.iniO - (n.fimO + dEq(x, n)); fl = fl == null ? r : Math.min(fl, r); });
          if (fl == null) fl = ((n.fora || (n.extra && n.fimO > T)) ? n.fimO : T) - n.fimO;
          return fl;
        }
        for (vi = ordem.length - 1; vi >= 0; vi--) {
          var nm = NP[ordem[vi]];
          // o que já começou não anda: "o mais tarde possível" é planejamento
          if (!nm.mtp || nm.fora || nm.extra || iniciadaEt(nm)) continue;
          var anda = Math.max(0, Math.min(folgaLivreEt(nm), nm.folgaReal));
          if (!(anda > 0)) continue;
          nm.iniO += anda; nm.fimO += anda; nm.folgaReal -= anda; nm.mtpAndou = anda;
          /* ⚠ o ELO CRUZADO que sai desta etapa anda junto (a subetapa
             predecessora andou com ela): sem isto o `cO` da ida ficava velho, e
             o `predDesloc` e a folga livre saíam contados da posição de antes
             do mtp (compat-1281: e6 com −129 aqui e −23 na sombra) */
          succI[nm.id].forEach(function (x) { if (x.cruz && x.cruz.cO != null) x.cruz.cO += anda; });
          nm.et.inicio = nm.iniO; nm.et.fim = nm.fimO;
          if (abs[nm.id]) Object.keys(abs[nm.id]).forEach(function (k) { abs[nm.id][k].iniO += anda; abs[nm.id][k].fimO += anda; });
          /* ⚠ as DATAS REAIS andam junto, e em calendário próprio elas são
             REFEITAS: andar N dias úteis da obra não é andar N dias da frente
             (numa 7×7 são dias diferentes), e a barra sairia num dia parado */
          if (temCal) recalcDatasMtp(nm);
        }
        function recalcDatasMtp(nm) {
          if (nm.calProprio) {
            var cx = ctxDe(nm.calId), p4 = cx ? CCm.primeiroDia(cx, O.dia(nm.iniO)) : null;
            var u4 = p4 != null ? CCm.consumir(cx, p4, nm.durF) : null;
            if (u4 != null) { nm.iniD = p4; nm.BD = maisDias(u4, 1); nm.ultDia = u4; return; }
          }
          if (abs[nm.id] && G[nm.id]) {
            var iD = null, bD = null;
            Object.keys(abs[nm.id]).forEach(function (k) {
              var a = abs[nm.id][k], f = G[nm.id].porId[k];
              if (f && f.calProprio) {
                var cy = ctxDe(f.calId), q4 = cy ? CCm.primeiroDia(cy, O.dia(a.iniO)) : null, v4 = q4 != null ? CCm.consumir(cy, q4, f.durF) : null;
                if (v4 != null) { a.iniD = q4; a.BD = maisDias(v4, 1); a.ultDia = v4; }
              } else { a.iniD = O.dia(a.iniO); a.BD = O.dia(a.fimO); }
              iD = iD == null ? a.iniD : Math.min(iD, a.iniD);
              bD = bD == null ? a.BD : Math.max(bD, a.BD);
            });
            nm.iniD = iD != null ? iD : O.dia(nm.iniO);
            nm.BD = bD != null ? bD : O.dia(nm.fimO);
            return;
          }
          nm.iniD = O.dia(nm.iniO); nm.BD = O.dia(nm.fimO);
        }

        /* ---- as folhas: a volta interna (relativa ao fim da etapa, a regra
           do `_redeInterna`) e o "mais tarde possível" de cada uma ---- */
        function dEqF(F, A, s, pid) {
          var sf = F.porId[s], l = null;
          sf.elos.forEach(function (e) { if (e.p === pid) l = e; });
          var p = A[pid], q = A[s];
          return self._deslocTI(l.tipo, q.L[pid], p.fimO - p.iniO, q.fimO - q.iniO);
        }
        Object.keys(abs).forEach(function (eid) {
          var F = G[eid], A = abs[eid], En = NP[eid], k;
          function volta() {
            Object.keys(A).forEach(function (x) { A[x].folgaInt = null; });
            for (k = F.ordem.length - 1; k >= 0; k--) {
              var f = F.porId[F.ordem[k]], pf = A[f.id], lf2 = En.fimO;
              F.succ[f.id].forEach(function (sid) {
                var ps = A[sid];
                if (ps.folgaInt == null || !own(ps.L, f.id)) return;   // elo de volta (ciclo) não aperta
                lf2 = Math.min(lf2, ps.iniO + ps.folgaInt - dEqF(F, A, sid, f.id));
              });
              pf.folgaInt = Math.max(0, lf2 - pf.fimO);
            }
          }
          volta();
          var andou = false;
          for (k = F.ordem.length - 1; k >= 0; k--) {
            var f = F.porId[F.ordem[k]], pf = A[f.id];
            if (!f.mtp) continue;
            var fl = null;
            F.succ[f.id].forEach(function (sid) {
              if (!own(A[sid].L, f.id)) return;
              var r = A[sid].iniO - (pf.fimO + dEqF(F, A, sid, f.id));
              fl = fl == null ? r : Math.min(fl, r);
            });
            if (fl == null) fl = En.fimO - pf.fimO;
            var an = Math.max(0, Math.min(fl, pf.folgaInt));
            if (an > 0) { pf.iniO += an; pf.fimO += an; pf.mtpAndou = an; andou = true; }
          }
          /* ⚠ a folha anda DENTRO da janela da etapa: nem o início nem o fim
             da etapa mudam (a sucessora já foi calculada com eles); a 1.2.81
             vê a barra mais comprida (`D-FOLHA-INI`, declarado) */
          if (andou) volta();
        });

        /* ---- as chaves de sempre: folga, crítico, preds, predLag, predDesloc (O20) ---- */
        N.forEach(function (n) {
          if (n.extra) return;
          var et = n.et;
          et.folga = Math.max(0, n.folgaReal);
          et.critico = n.folgaReal <= 0;
          if (temAv && n.avEstado === "concluida") { et.folga = 0; et.critico = false; }
          if (temFora && et.foraDoPrazo) et.critico = false;
          et.preds = n.predsEt.slice();
          et.predLag = {}; et.predDesloc = {};
          if (n.porExtras.length) { et.porExtras = n.porExtras.slice(); et.redeEtapas = n.redeEtO; }
          var tipoR = {}, lagT = {};
          n.elos.forEach(function (l) {
            if (l.fonte === "extra") return;
            var p = NP[l.p], dP = p.fimO - p.iniO, dS = n.fimO - n.iniO;
            var L = l.L != null ? l.L : (l.tipo === "TI" ? -Math.floor(par * dP) : 0);
            var d = self._deslocTI(l.tipo, L, dP, dS);
            /* ⚠ ELO ANCORADO (O16): o nó começou ANTES do que este elo deixa.
               A projeção rebaixa a espera até a 1.2.81 desenhar o início real,
               e o `predDesloc` é o que ELA vai ler — `predDesloc[p]` é sempre o
               deslocamento equivalente de TI sobre a sombra (O20). Sem isto o
               motor devolvia −1 e a sombra −7 no mesmo elo, e a
               `conferirFrota` acusava divergência num plano certo. */
            if (temAv && n.avEstado && (n.avEstado === "concluida" || n.avEstado === "andamento") && p.fimO + d > n.iniO) d = n.iniO - p.fimO;
            et.predDesloc[l.p] = d;
            if (l.fonte !== "rede") { if (l.L != null) et.predLag[l.p] = l.L; return; }
            // a rede digitada: o `predLag` é a espera EQUIVALENTE que a sombra grava (o que a 1.2.81 mostra)
            if (!(l.tipo === "TI" && l.L == null)) et.predLag[l.p] = d;
            if (l.tipo !== "TI") tipoR[l.p] = l.tipo;
            if (l.L != null) lagT[l.p] = l.L;
          });
          n.cruzIn.forEach(function (c) {
            var v = c.cO != null ? c.cO : (function () { var a = alvoCruz(c); return a ? a.cO : null; })();
            if (v == null) return;
            var d = v - NP[c.Ep].fimO;
            et.predDesloc[c.Ep] = own(et.predDesloc, c.Ep) ? Math.max(et.predDesloc[c.Ep], d) : d;
            et.predLag[c.Ep] = et.predDesloc[c.Ep];
            var chave = c.pf || c.Ep;
            if (c.tipo !== "TI") tipoR[chave] = c.tipo;
            if (c.lag != null) lagT[chave] = c.lag;
          });
          if (temChave(tipoR)) et.predTipoRede = tipoR;
          if (temChave(lagT)) et.predLagTipo = lagT;
        });

        /* ---- as restrições: a saída de hoje (`res.restricoes`) e os recados novos ---- */
        var infoRestr = null, avRestr = [];
        function numEt(id) { return NP[id] ? NP[id].i + 1 : "?"; }
        function nomeEt(id) {
          var e = porId[id];
          if (!e && NP[id] && NP[id].extra) return (XE.numero[id] || "T") + " " + String(NP[id].x.nome || "").slice(0, 60);
          return e ? numEt(id) + " " + String(e.nome || "").slice(0, 60) : String(id);
        }
        function dmaS(s) { var p = String(s).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
        if (restr) {
          restr.lista.forEach(function (x) {
            var et = porId[x.id], n = NP[x.id];
            if (!et || x.indice == null) return;
            var estourada = x.tipo === "tae" && et.fim > x.indice;
            et.restricao = { tipo: x.tipo, data: x.data, indice: x.indice, inicioRede: n.redeO,
              ativa: x.tipo === "nia" && et.inicio === x.indice && x.indice > n.redeO, estourada: estourada };
            // o `tae` COM a marca (O22) tem o recado novo (último dia); o sem marca, o de hoje
            if (estourada && !n.taeMarca) avRestr.push({ tipo: "tae", etapaId: x.id, data: x.data, fim: et.fim, indice: x.indice,
              msg: "Etapa " + numEt(x.id) + ": a restrição “terminar até " + dmaS(x.data) + "” não é cumprida — o plano de hoje termina " +
                (et.fim - x.indice) + " dia(s) útil(eis) depois. A restrição avisa; ela não encurta a etapa nem empurra as outras." });
          });
          restr.invalidos.forEach(function (v) {
            avRestr.push({ tipo: "invalida", etapaId: v.id, motivo: v.motivo,
              msg: v.motivo === "etapa" ? "Uma data fixada aponta para uma etapa que não existe mais neste orçamento — ela foi ignorada."
                : "Data fixada em formato inválido (" + v.motivo + ") — ela foi ignorada; o cronograma seguiu pela rede." });
          });
          infoRestr = { totalDias: T, saida: { lista: restr.lista, invalidos: restr.invalidos, avisos: avRestr } };
        }
        N.forEach(function (n) {
          var d = n.dataRede, et = n.et, redeData = null;
          if (n.taeU && n.taeMarca) d = { t: "tae", d: n.taeU.data };
          if (!d) return;
          var dias = 0, falha = false, txt = null;
          var nomeP = n.aperta ? "por causa de " + nomeEt(n.aperta) : "pela rede";
          if (d.t === "mtp") {
            if (n.mtpAndou > 0) txt = "Etapa " + nomeEt(n.id) + ": o mais tarde possível — começa em " + brMs(O.dia(n.iniO)) +
              " (usou " + n.mtpAndou + " dia(s) de folga livre; nenhuma outra tarefa mudou).";
            redeData = { tipo: "mtp", andou: n.mtpAndou };
          } else if (d.t === "dia") {
            falha = n.iniO > n.tetoIniO; dias = n.iniO - n.tetoIniO;
            if (falha) txt = "Etapa " + nomeEt(n.id) + ": “deve iniciar em " + dmaS(d.d) + "” não é cumprida — a rede só deixa começar em " + brMs(O.dia(n.iniO)) +
              " (" + dias + " dia(s) útil(eis) depois), " + nomeP + ". A dependência manda; a data fica como aviso. Para cumprir: encurte a predecessora, mude o “Depende de” da etapa " + numEt(n.id) + " ou mude a data.";
          } else if (d.t === "nid") {
            falha = n.iniO > n.tetoIniO; dias = n.iniO - n.tetoIniO;
            if (falha) txt = "Etapa " + nomeEt(n.id) + ": “não iniciar depois de " + dmaS(d.d) + "” não é cumprida — começa em " + brMs(O.dia(n.iniO)) +
              " (" + dias + " dia(s) útil(eis) depois), " + nomeP + ". A restrição avisa; ela não empurra as outras.";
          } else if (d.t === "dta" || d.t === "tae") {
            falha = n.fimO > n.tetoFimO; dias = n.fimO - n.tetoFimO;
            if (falha) txt = "Etapa " + nomeEt(n.id) + ": “" + (d.t === "dta" ? "deve terminar em " : "não terminar depois de ") + dmaS(d.d) +
              "” não é cumprida — o plano termina " + dias + " dia(s) útil(eis) depois. A restrição avisa; ela não encurta a etapa nem empurra as outras." +
              (n.folgaReal < 0 ? " A folga fica negativa (" + n.folgaReal + ")." : "");
          }
          if (d.t !== "mtp") redeData = { tipo: d.t, data: d.d, inicioRede: n.redeO, cumprida: !falha, dias: falha ? dias : 0, folgaReal: n.folgaReal };
          if (d.t !== "tae" && d.t !== "mtp" && !(et.restricao && et.restricao.tipo === "nia")) {
            et.restricao = { tipo: d.t, data: d.d, indice: d.t === "nid" ? n.tetoIniO : (d.t === "dia" ? n.pisoR : n.fimMinR),
              inicioRede: n.redeO, ativa: (d.t === "dia" || d.t === "dta" || d.t === "nta") && n.iniO > n.redeO && !falha, estourada: falha, folgaReal: n.folgaReal };
          } else if (d.t === "mtp" && !et.restricao) et.restricao = { tipo: "mtp", data: null, indice: null, inicioRede: n.redeO, ativa: n.mtpAndou > 0, estourada: false };
          if (txt) avisosRede.push({ tipo: falha ? "restricao-nao-cumprida" : "mtp", etapaId: n.id, restricao: d.t, dias: dias, msg: txt });
          n.saidaData = redeData;
        });

        /* ⚠ `fer` é o do alcance da E10 (a estimativa ANTES da ida): a
           `r.feriados.lista`/`mapa` pode sair com um ano a mais que a do
           `_idaVolta` (que mede o prazo antes de aplicar a restrição). As
           DATAS não mudam; o `noPeriodo` é o mesmo; e quem lê a lista inteira
           (a aba Feriados do Excel, o período + 6 meses do CronoPlan) só
           ganha cobertura. tools/test-crono-rede.js (g) confere as três
           coisas: tudo igual, `noPeriodo` igual, lista = superconjunto. */
        return { totalDias: T, ini: iniD, iniPedido: iniPedido, ajusteInicio: ajusteInicio, fer: fer, cal: cal, infoRestr: infoRestr,
          temCiclo: temCiclo, opcDependida: opcDependida,
          integ: { N: N, NP: NP, G: G, abs: abs, ordem: ordem, posOrd: posOrd, O: O, T: T, temTeto: temTeto, succI: succI,
            avisos: avisosRede, rels: rels, relDe: relDe, alvoCruz: alvoCruz, parSub: parSub, par: par, execRede: execRede, EF: EF, X: X,
            folgaLivreEt: folgaLivreEt, dEq: dEq, dEqF: dEqF, NX: NX, XE: XE, avisosExtras: avisosExtras, ignElo: ignElo,
            CC: CC, CCm: CCm, temCal: temCal, ultD: ultD, calIdDe: calIdDe, ctxDe: ctxDe,
            temAv: temAv, AV: AV, C: C, CD: CD, estadoAv: estadoAv, temAvancoEm: temAvancoEm } };
      }
      var B = passada(est);
      if (B.refazer != null) {
        // E10: o plano passou do último ano de feriados coberto — repete UMA vez com o alcance certo
        avisosRede.length = (EF.avisos || []).length; jaAvisou = {};
        (EF.avisos || []).forEach(function (a) { jaAvisou[a.tipo + "|" + (a.id || "") + "|" + (a.elo || "")] = true; });
        opcDependida.length = 0;
        B = passada(B.refazer);
        if (B.refazer != null) throw new Error("o prazo passou do alcance dos feriados duas vezes");
      }
      /* ⚠ `mem.abs`/`mem.integ` são propriedades da LISTA do memo (uma chamada
         só): o `_arvore` lê as posições absolutas daqui e NUNCA a passada
         escreve nos nós do `_contexto` (o ⚠ do `_contexto` continua valendo) */
      if (mem) { mem.integ = B.integ; mem.abs = B.integ.abs; }
      return B;
    },

    /* O ALCANCE DO `_feriadosDe` (E10): o último dia coberto pelo mapa de
       feriados que ele monta para (início, prazo) — a MESMA conta dele, sem
       mudar o que ele devolve (a paridade cobra o de hoje). null = sem
       feriado a descontar (nada a cobrir). */
    _alcanceFeriados: function (params, ini, totalDias) {
      if (!params.descontarFeriados) return null;
      var F = (typeof Feriados !== "undefined") ? Feriados : (typeof global !== "undefined" ? global.Feriados : null);
      if (!F || !F.entre || isNaN(ini.getTime())) return null;
      var dpw = params.diasUteisSemana || 5;
      var corridos = Math.ceil((totalDias || 0) * (7 / dpw)) + 30;
      var fim = new Date(ini.getTime()); fim.setDate(fim.getDate() + corridos);
      return new Date(fim.getFullYear() + 1, 11, 31).getTime();
    },

    /* A FASE (c) DA PASSADA INTEGRADA: as chaves novas (§1.8), só com o dado
       correspondente. `L` = o planejado (avisos da leitura, §1.3.1). */
    _saidaIntegrada: function (res, B, X, L) {
      var I = B.integ, EF = I.EF;
      var avisos = [];
      arr(L && L.avisos).forEach(function (a) { avisos.push(a); });
      if (L && L.limpeza) avisos.push({ tipo: "limpeza-1281", msg: "As edições do cronograma foram limpas num aparelho de versão anterior. As tarefas sem preço, os calendários e o avanço lançado ficaram." });
      if (X.rede) {
        res.rede = { avisos: this._avisosSubstituidas(res, EF).concat(I.avisos), substituidas: EF.substituidas.slice() };
      } else if (I.avisos.length) {
        res.rede = { avisos: I.avisos.slice(), substituidas: [] };
      }
      if (I.temTeto) res.etapas.forEach(function (et) { et.folgaReal = I.NP[et.id].folgaReal; });
      if (I.NX && I.NX.length) this._saidaExtras(res, B, I);
      if (X.cal) this._saidaCal(res, B, I, X);
      else if (X.calAvisos) arr(X.calAvisos).forEach(function (a) { avisos.push(a); });
      if (X.avanco) this._saidaAvanco(res, B, I, X, avisos);
      else if (X.avancoAvisos) arr(X.avancoAvisos).forEach(function (a) { avisos.push(a); });
      /* ⚠ A FORMA É FECHADA (§1.8, tools/fixtures/planejador-formas.js): a
         1B e a 1C leem `r.compat` em paralelo — chave nova só com a espec */
      res.compat = { requer: this._requerDe(X.recursos), suporta: true, recursos: X.recursos.slice(), avisos: avisos };
    },

    /* OS CALENDÁRIOS NO RESULTADO (§1.8; CAL §c): as chaves novas por nó
       (`calendarioId`, `duracaoFrente`, `dataInicioFrente`, `dataUltimoDia`,
       `inicioEixo`, `fimEixo`) e, em `res`, `calendarios`, `eixo` e
       `dataUltimoDia`.
       ⚠ `Cronograma.calendario(r)` NÃO muda: ela continua sendo a régua da
         obra, e é ela que a linha de base, o P×R, a saúde e a IA usam por
         índice. O eixo de DESENHO é outro objeto (`res.eixo`) — misturar os
         dois faria o índice da base cair noutro dia depois que alguém
         atribuísse um calendário. */
    _saidaCal: function (res, B, I, X) {
      var CC = X.cal, CCm = this._mod("CronoCal"), O = I.O, NP = I.NP, G = I.G, abs = I.abs, temCal = true;
      void temCal;
      function porNo(alvo, n, a) {
        var calId = a ? a.calId : n.calId;
        if (!calId) return;
        alvo.calendarioId = calId;
        var f = a ? (G[n.id] && G[n.id].porId[a.id]) : n;
        alvo.duracaoFrente = f ? f.durF : null;
        var iniD = a ? a.iniD : n.iniD, ult = a ? a.ultDia : n.ultDia;
        if (iniD != null) alvo.dataInicioFrente = new Date(iniD);
        if (ult != null) alvo.dataUltimoDia = new Date(ult);
      }
      res.etapas.forEach(function (et) {
        var n = NP[et.id];
        if (n) porNo(et, n, null);
      });
      arr(res.extras).forEach(function (x) { var n = NP[x.id]; if (n) porNo(x, n, null); });
      arr(res.atividades).forEach(function (no) {
        var dono = no.etapaId || no.paiId, A = dono ? abs[dono] : null, a = A ? A[no.id] : null;
        if (a && a.calId) porNo(no, NP[dono], a);
        else if (NP[no.id]) porNo(no, NP[no.id], null);
      });
      /* o maior último dia TRABALHADO por qualquer frente: é ele que o
         rodapé "‡ 12 dias de trabalho, 7 dias por semana, de 03/10 a 13/10"
         e o eixo do Gantt usam */
      var ultMax = null, iniMin = null;
      Object.keys(NP).forEach(function (id) {
        var n = NP[id];
        if (n.ultDia != null) ultMax = ultMax == null ? n.ultDia : Math.max(ultMax, n.ultDia);
        if (n.iniD != null) iniMin = iniMin == null ? n.iniD : Math.min(iniMin, n.iniD);
      });
      Object.keys(abs).forEach(function (eid) {
        Object.keys(abs[eid]).forEach(function (k) {
          var a = abs[eid][k];
          if (a.ultDia != null) ultMax = ultMax == null ? a.ultDia : Math.max(ultMax, a.ultDia);
          if (a.iniD != null) iniMin = iniMin == null ? a.iniD : Math.min(iniMin, a.iniD);
        });
      });
      var fimObra = O.dia(Math.max(0, I.T - 1));
      if (ultMax == null || fimObra > ultMax) ultMax = fimObra;
      if (iniMin == null) iniMin = O.dia(0);
      res.calendarios = { v: 1, lista: CC.lista.map(function (c) { return CCm.itemDisco(c); }), usados: CC.usados.slice(),
        padrao: CC.padrao, de: rasa(CC.de), avisos: CC.avisos.slice() };
      res.dataUltimoDia = new Date(ultMax);
      var params = res.params || {};
      var dpw = params.diasUteisSemana || 5;
      var fmapa = (res.feriados && res.feriados.mapa) || {};
      res.eixo = CCm.eixo(CC, function (ms) { return Cronograma.diaUtil(new Date(ms), dpw, fmapa); }, iniMin, ultMax);
      if (res.eixo) {
        res.etapas.forEach(function (et) { eixoDe(et, et.dataInicioFrente, et.dataUltimoDia); });
        arr(res.extras).forEach(function (x) { eixoDe(x, x.dataInicioFrente, x.dataUltimoDia); });
        arr(res.atividades).forEach(function (no) { eixoDe(no, no.dataInicioFrente, no.dataUltimoDia); });
      }
      function eixoDe(alvo, di, du) {
        if (!di || !du) return;
        var a = res.eixo.indiceDe[chMs(di.getTime())], b = res.eixo.indiceDe[chMs(du.getTime())];
        if (a != null) alvo.inicioEixo = a;
        if (b != null) alvo.fimEixo = b + 1;
      }
    },

    /* O AVANÇO NO RESULTADO (§1.8; a forma é a da fixture T21,
       tools/fixtures/planejador-formas.js, "r.avanco" e "no.avanco").
       ⚠ O LASTRO `b` NÃO SAI NO MOTOR (E-MC5): quem rotula "medição 01a" é o
         `confrontoPorNo` da 2B, que lê o registro e tem o mapa dos números. O
         motor devolve só a `fonte` (`digitado` | `diario` | `medicao`), que é
         o `o` DEPOIS da validação — uma medição sem lastro válido já chega
         aqui como "digitado" (E-MC1). */
    /* O AVANÇO DE UM NÓ, a régua ÚNICA (etapa, tarefa sem preço e FOLHA).
       Era uma função fechada dentro do `_saidaAvanco`; virou método porque a
       parte das FOLHAS passou a rodar depois da árvore (`_saidaAvancoFolhas`),
       e duas cópias da mesma conta divergem na primeira manutenção. */
    _avancoDoNo: function (e, no, a, A) {
      function fonteDe(q) { return q && q.o ? q.o : "digitado"; }
      var est = a ? (a.avEstado || null) : (no ? no.avEstado : null);
        /* ⚠ `pct`, `feito` e `rest` SEMPRE com número (a forma da fixture T21):
           a coluna da grade e o cartão escrevem estes três em toda linha, e
           `null` ali sairia como "null" na tela ou pediria um `|| 0` em cada
           consumidor — quatro deles, em três fatias diferentes. Concluída:
           feito = a duração inteira, resta 0. Não iniciada: feito 0, resta a
           duração. */
        var o = { estado: est || "nao-iniciada", pct: 0, fonte: e ? fonteDe(e) : "digitado",
          ini: null, fim: null, feito: 0, rest: 0, iniReal: null, fimReal: null,
          empurradoDias: 0, foraSeq: false, naoAtualizado: false, em: (e && e.em) || null };
        var fonteNo = a || no;
        if (fonteNo) {
          o.ini = fonteNo.iniO; o.fim = fonteNo.fimO;
          if (fonteNo.iniD != null) o.iniReal = chMs(fonteNo.iniD);
          if (fonteNo.ultDia != null) o.fimReal = chMs(fonteNo.ultDia);
          var dur = fonteNo.fimO - fonteNo.iniO;
          if (fonteNo.avFeito != null) o.feito = fonteNo.avFeito;
          else if (est === "concluida") o.feito = dur;
          if (fonteNo.avRest != null) o.rest = fonteNo.avRest;
          else if (est !== "concluida") o.rest = dur;
          if (fonteNo.avEmpurrado) o.empurradoDias = fonteNo.avEmpurrado;
          if (fonteNo.foraSeq) o.foraSeq = true;
        }
        if (e) {
          if (e.p != null) o.pct = e.p;
          if (o.estado === "concluida") o.pct = 100;
          /* ⚠ "não atualizada desde dd/mm": a entrada foi lançada num corte
             ANTERIOR ao de agora, e ninguém a mexeu desde então. O número
             continua valendo (o restante é empurrado para depois do corte
             novo), mas quem lê precisa saber que ele envelheceu. */
          if (e.em && A.corte && e.em < A.corte && o.estado === "andamento") o.naoAtualizado = true;
        }
        if (o.estado === "concluida" && o.pct == null) o.pct = 100;
        return o;
    },

    /* A LINHA DE "FORA DE SEQUÊNCIA" (`r.avanco.foraDeSequencia[]`, T21). */
    _avancoPoeFora: function (res, O, id, no, a) {
      var num = null;
      res.etapas.forEach(function (e, i) { if (e.id === id) num = String(i + 1); });
      if (num == null) arr(res.extras).forEach(function (x) { if (x.id === id) num = x.numero; });
      var fonteNo = a || no;
      res.avanco.foraDeSequencia.push({ id: id, numero: num || id,
        inicioReal: (fonteNo && fonteNo.iniD != null) ? chMs(fonteNo.iniD) : null,
        inicioRede: (no && no.redeO != null) ? chMs(O.dia(no.redeO)) : null });
    },

    _saidaAvanco: function (res, B, I, X, avisos) {
      var self = this, A = X.avanco, NP = I.NP, O = I.O, abs = I.abs;
      arr(A.avisos).forEach(function (a) { avisos.push(a); });
      /* ⚠ SEM `semAvanco` AQUI (§2.8): o "antes" da linha do prazo é um
         `estimar` à parte, que a TELA pede pelo `Cronograma.semAvanco(orc)` e
         memoiza pelo token de render. Calculá-lo dentro de todo `estimar`
         dobraria o custo de ~130 chamadas que nem mostram a comparação. */
      res.avanco = { corte: A.corte, indiceCorte: I.C, C: I.C,
        contagem: { concluidas: 0, andamento: 0, empurradas: 0, foraSeq: 0, naoAtualizadas: 0 },
        foraDeSequencia: [], avisos: arr(A.avisos).slice() };
      var contagem = res.avanco.contagem;
      res.etapas.forEach(function (et) {
        var n = NP[et.id];
        if (!n) return;
        var e = A.porId[et.id] || null;
        if (!e && !n.avEstado) return;
        et.avanco = self._avancoDoNo(e, n, null, A);
        if (et.avanco.estado === "concluida") contagem.concluidas++;
        else if (et.avanco.estado === "andamento") contagem.andamento++;
        else if (et.avanco.estado === "empurrada") contagem.empurradas++;
        if (et.avanco.naoAtualizado) contagem.naoAtualizadas++;
        if (et.avanco.foraSeq) { contagem.foraSeq++; self._avancoPoeFora(res, O, et.id, n, null); }
      });
      arr(res.extras).forEach(function (x) {
        var n = NP[x.id];
        if (!n) return;
        var e = A.porId[x.id] || null;
        if (!e && !n.avEstado) return;
        x.avanco = self._avancoDoNo(e, n, null, A);
        if (x.avanco.naoAtualizado) contagem.naoAtualizadas++;
        if (x.avanco.foraSeq) { contagem.foraSeq++; self._avancoPoeFora(res, O, x.id, n, null); }
      });
      /* ⚠ AS FOLHAS CONTAM AQUI, E NÃO NO `_saidaAvancoFolhas` (18/09/2026,
         achado A1). No modo executivo o que a pessoa lança é a SUBETAPA, então
         sem isto o cartão dizia "0 concluídas" com cinco subetapas concluídas
         na tela — recado que mente. E a contagem tem de sair daqui, do `abs`,
         porque `res.avanco.contagem` NÃO PODE DEPENDER de `ctx.eap`: o cartão
         e a grade leriam números diferentes do mesmo plano, e a divergência só
         apareceria na tela de quem usa. O que depende da árvore é só o
         `no.avanco` de cada linha, que é escrito depois.
         ⚠ A ETAPA QUE JÁ CONTOU NÃO CONTA DE NOVO: a resumida (`rs: 1`) vale
           por todas as folhas dela e já entrou como 1 concluída acima. */
      var contadas = {};
      res.etapas.forEach(function (et) { if (et.avanco) contadas[et.id] = true; });
      Object.keys(abs || {}).forEach(function (eid) {
        if (own(contadas, eid)) return;
        var M = abs[eid];
        Object.keys(M).forEach(function (fid) {
          var a = M[fid], e = A.porId[fid] || null;
          if (!e && !a.avEstado) return;
          var av = self._avancoDoNo(e, null, a, A);
          if (av.estado === "concluida") contagem.concluidas++;
          else if (av.estado === "andamento") contagem.andamento++;
          else if (av.estado === "empurrada") contagem.empurradas++;
          if (av.naoAtualizado) contagem.naoAtualizadas++;
          if (av.foraSeq) { contagem.foraSeq++; self._avancoPoeFora(res, O, fid, NP[eid], a); }
        });
      });
    },

    /* O AVANÇO NAS FOLHAS (subetapas), depois da árvore (§1.8).
       ⚠ ISTO NÃO PODE VOLTAR PARA DENTRO DO `_saidaAvanco` (18/09/2026,
         achado A1). `res.atividades` nasce no `_arvore`, e o `_arvore` roda
         DEPOIS do `_saidaIntegrada`: o laço das atividades que morava lá
         varria uma lista VAZIA — era código morto. Medido na fixture do
         galpão com a subetapa `s1b` concluída: 168 atividades, ZERO com
         `avanco`, mesmo com a folha já posicionada na janela real (1..4).
         No modo executivo é a folha que a pessoa lança (§1.4), então o
         `no.avanco` dela é justamente o número que a grade e o cartão mostram.
       ⚠ AQUI SÓ SE ESCREVE `no.avanco`: quem CONTA é o `_saidaAvanco`, pelo
         `abs`, porque `res.avanco.contagem` não pode depender de `ctx.eap`. */
    _saidaAvancoFolhas: function (res, I, X) {
      var self = this, A = X.avanco, NP = I.NP, abs = I.abs;
      if (!A || !res.avanco || !res.atividades) return;
      arr(res.atividades).forEach(function (no) {
        var dono = no.etapaId || no.paiId, M = dono ? abs[dono] : null, a = M ? M[no.id] : null;
        var e = A.porId[no.id] || null;
        if (a) {
          if (!e && !a.avEstado) return;
          no.avanco = self._avancoDoNo(e, null, a, A);
          return;
        }
        var n2 = NP[no.id];
        if (n2 && (e || n2.avEstado)) no.avanco = self._avancoDoNo(e, n2, null, A);
      });
    },

    /* AS TAREFAS SEM PREÇO NO RESULTADO (§1.8; a forma é a da fixture T21,
       tools/fixtures/planejador-formas.js "r.extras[]"): `r.extras`,
       `r.extrasAvisos` e, só quando a última extra passa da entrega,
       `r.totalDiasComExtras`/`r.dataFimComExtras` (D2: o prazo contratual
       continua o das etapas — proposta, desembolso e `cronogramaMeses` não
       mudam). */
    _saidaExtras: function (res, B, I) {
      var T = I.T, cal = B.cal, O = I.O, TX = T;
      function dia(k) { return cal ? cal.dia(k) : O.dia(k); }
      res.extras = I.NX.map(function (n) {
        var x = n.x, depois = n.fimO > T, preds = [], predLag = {}, predTipo = {};
        n.elos.forEach(function (l) {
          if (l.ign) return;
          preds.push(l.p); predTipo[l.p] = l.tipo;
          if (l.L) predLag[l.p] = l.L;
        });
        if (n.fimO > TX) TX = n.fimO;
        var o = { id: x.id, numero: I.XE.numero[x.id], nome: x.nome, marco: n.marco, duracao: n.fimO - n.iniO, inicio: n.iniO, fim: n.fimO,
          dataInicio: dia(n.iniO), dataFim: dia(n.fimO), folga: Math.max(0, n.folgaReal), critico: n.folgaReal <= 0,
          preds: preds, predLag: predLag, predTipo: predTipo,
          sucs: x.sucs.map(function (s) { return { i: s.i, t: s.t, l: s.l }; }), resp: x.resp, proposta: x.proposta, apos: x.apos,
          depoisDaEntrega: depois };
        if (x.nia) o.restricao = { tipo: "nia", data: x.nia, ativa: n.pisoU != null && n.iniO === n.pisoU && n.pisoU > n.redeO };
        if (n.cicloDep) o.cicloDep = true;
        if (I.temTeto) o.folgaReal = n.folgaReal;
        return o;
      });
      var av = [];
      arr(I.XE.avisos).forEach(function (a) { av.push(a); });
      arr(I.XE.invalidos).forEach(function (q) { av.push({ tipo: "extra-invalida", indice: q.indice, id: q.id, motivo: q.motivo }); });
      arr(I.avisosExtras).forEach(function (a) { av.push(a); });
      if (I.XE.semInicio && I.XE.lista.length) av.push({ tipo: "extras-sem-inicio",
        msg: "As tarefas sem preço não seguram as etapas enquanto o cronograma não tiver data de início fixa." });
      res.extrasAvisos = av;
      if (TX > T) { res.totalDiasComExtras = TX; res.dataFimComExtras = dia(TX); }
    },

    /* A régua "1.2.76–1.2.81 sobre o gravado" (O9): o que um aparelho na
       versão anterior calcula para ESTE registro. Para orçamento e plano.
       ⚠ Não confundir com `estimarFrota` (1.2.75, `cronogramaMeses`), que
       continua com o papel de sempre. */
    /* O "ANTES" DA LINHA DO PRAZO (§2.8): o mesmo plano SEM o avanço lançado.
       ⚠ A propriedade `_avancoDaObra` EXISTE, com `null`: é assim que a O25
         distingue "carregado, sem avanço" de "ninguém carregou". Sem ela, o
         despachante leria a SOMBRA — que já traz o avanço do último salvar —
         e o "antes" sairia IGUAL ao "depois", com a linha do prazo dizendo
         "+0 DU" numa obra atrasada ("recado que mente").
       ⚠ Sem `ctx.eap`: o "antes" é só o prazo e as datas de etapa, e montar a
         árvore aqui dobraria o custo de cada render. */
    /* ⚠ O TERCEIRO ARGUMENTO É REPASSADO (`{eap: true, calc, valores}`), e
       existe porque a ESPEC-medicao-cc §3.5 pede o INÍCIO PLANEJADO POR NÓ
       ("i = max(obra.inicio, min(início planejado do nó em
       Cronograma.semAvanco(orc), dataRef do 1º boletim))"). Sem ele, quem
       precisasse desse mapa teria de montar aqui fora uma segunda cópia do
       "orçamento sem o avanço" — e duas cópias da mesma régua divergem na
       primeira manutenção. Chamada com dois argumentos, nada muda. */
    semAvanco: function (orc, override, ctx) {
      if (!orc || typeof orc !== "object") return this.estimar(orc, override, ctx);
      var c = {}, k;
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      c._avancoDaObra = null;
      return this.estimar(c, override, ctx);
    },

    estimarLegado: function (orc, override) {
      return this._estimarBase(this._comoFrota(orc), override);
    },

    /* A CONFERÊNCIA DO CONTRATO C1 (espec §1.11): compara a leitura da versão
       anterior (`estimarLegado`) com a desta (`estimar`) sobre o GRAVADO, nas
       chaves que o contrato promete iguais — `inicio`, `fim`, `duracao`,
       `dataInicio`, `dataFim` e `predDesloc` de cada etapa; `totalDias` e
       `dataFim` do resultado. Não escreve nada.
       `opts.rn` = o resultado desta versão que quem chama JÁ calculou (a
       projeção da 1A reaproveita o seu `T`, §2.11): custa só o legado.
       ⚠ ONDA 0: toda diferença sai com `cod: "sem-codigo"` — o catálogo de
       divergências declaradas (§1.11) é da 1A. Diferença sem código é
       DEFEITO: o recado do salvar diz que não conseguiu garantir. Sem
       extensão as duas leituras são a mesma conta, e sai `exato`.
       Prova de fidelidade (a lista é a diferença real, nos dois sentidos):
       tools/test-crono-compat-1281.js. */
    conferirFrota: function (orc, override, opts) {
      opts = opts || {};
      var leg = this.estimarLegado(orc, override);
      var nov = opts.rn ? opts.rn : this.estimar(orc, override);
      var div = this._difC1(leg, nov);
      // ⚠ o código de cada diferença sai do catálogo (§1.11); diferença sem código é defeito
      if (div.length) this._codificar(orc, override, div, opts, nov);
      return { exato: div.length === 0, divergencias: div };
    },
    CAMPOS_C1: ["inicio", "fim", "duracao", "dataInicio", "dataFim", "predDesloc"],
    _difC1: function (leg, nov) {
      var self = this, out = [];
      function val(v) {
        if (v && typeof v.getTime === "function") return isNaN(v.getTime()) ? "data-invalida" : self._ch(v);
        if (v && typeof v === "object") {
          var ks = Object.keys(v).sort(), o = {};
          ks.forEach(function (k) { o[k] = v[k]; });
          return JSON.stringify(o);
        }
        return v === undefined ? null : v;
      }
      function dif(cod, id, numero, campo, a, b) {
        var va = val(a), vb = val(b);
        if (va !== vb) out.push({ cod: cod, id: id, numero: numero, campo: campo, legado: va, novo: vb });
      }
      var eL = arr(leg && leg.etapas), eN = arr(nov && nov.etapas), n = Math.max(eL.length, eN.length), i;
      for (i = 0; i < n; i++) {
        var a = eL[i], b = eN[i];
        if (!a || !b || a.id !== b.id) {
          out.push({ cod: "sem-codigo", id: (a || b || {}).id == null ? null : (a || b).id, numero: i + 1, campo: "etapa",
            legado: a ? a.id : null, novo: b ? b.id : null });
          continue;
        }
        self.CAMPOS_C1.forEach(function (c) { dif("sem-codigo", a.id, i + 1, c, a[c], b[c]); });
      }
      dif("sem-codigo", null, null, "totalDias", leg && leg.totalDias, nov && nov.totalDias);
      dif("sem-codigo", null, null, "dataFim", leg && leg.dataFim, nov && nov.dataFim);
      return out;
    },

    /* Estima o cronograma inteiro — o DESPACHANTE (ver o bloco acima).
       `ctx` (3º argumento, opcional) — ver o bloco CRONOGRAMA EXECUTIVO:
       só `ctx.eap === true` acrescenta `r.atividades` e `r.exec`, DEPOIS de o
       resultado de etapa estar pronto. Sem ele, nenhuma linha nova roda.
       ⚠ A ORDEM DAS PERGUNTAS É O CONTRATO (espec §2.2):
         1) motor desligado (suporte) → a leitura da 1.2.81, sombra incluída;
         2) sem extensão → o caminho de hoje, linha a linha (I2);
         3) formato mais novo que este motor → a leitura da 1.2.81 (I14);
         4..) aprovado (âncora), sem início (pendente) e a passada integrada
            são da 1A — até lá, inalcançáveis (`_ext` → null). */
    estimar: function (orc, override, ctx) {
      var R = this._recursos;
      if (R && R.motor === false) return this._marcaDesligado(orc, this._estimarBase(this._comoFrota(orc), override, ctx));
      /* O25: o registro tem avanço gravado e quem chamou NÃO carregou o
         avanço (a propriedade nem existe): a leitura é a da sombra — as datas
         do último salvar, que é o que a 1.2.81 vê — e a tela diz por quê */
      if (this._matTem(orc, "avanco") && !own(orc, "_avancoDaObra")) {
        var rA = this._estimarBase(this._comoFrota(orc), override, ctx), mA = orc.cronograma.mat;
        rA.compat = { requer: mA.requer || null, suporta: true, recursos: arr(mA.recursos).slice(),
          avisos: [{ tipo: "avanco-nao-carregado", msg: "O avanço lançado desta obra não foi lido aqui: as datas são as do último salvar do plano." }] };
        return rA;
      }
      var X = this._ext(orc, override);
      if (!X) return this._estimarBase(orc, override, ctx);
      var sup = this.suporta(orc);
      if (!sup.ok) {
        // I14: formato mais novo que este motor — a leitura da 1.2.81, com a faixa "atualize"
        var rS = this._estimarBase(this._comoFrota(orc), override, ctx);
        rS.compat = { requer: sup.requer, suporta: false, recursos: X.recursos.slice(),
          avisos: [{ tipo: "versao", desconhecidos: (sup.desconhecidos || []).slice(), msg: "Este cronograma usa recursos da versão " + (sup.requer || "mais nova") + " — atualize o app (menu → Atualizar) para editar." }] };
        return rS;
      }
      if (this.congeladoPorAprovacao(orc)) return this._estimarAncorado(orc, override, ctx, X);
      try {
        var XI = X.pendente ? this._extSemDatas(X) : X;
        var PL = this._planejado(X.pendente ? this._planejadoSemDatas(orc) : orc);
        var r = this._estimarBase(PL.orc, override, ctx, { integrada: XI, leitura: PL, orig: orc });
        if (X.pendente) r.compat.pendente = "sem-inicio";
        return r;
      } catch (eI) {
        /* I1: a passada integrada falhou — vale a data que a 1.2.81 mostra, e a
           tela diz que não conseguiu (nunca some com o cronograma) */
        var rE = this._estimarBase(this._comoFrota(orc), override, ctx), msgE = String((eI && eI.message) || eI);
        rE.compat = { requer: this._requerDe(X.recursos), suporta: true, recursos: X.recursos.slice(), erro: msgE,
          avisos: [{ tipo: "motor-erro", msg: "Não consegui calcular as ligações, restrições e tarefas novas deste cronograma (" + msgE.slice(0, 120) + "). As datas mostradas são as que aparelhos com a versão anterior veem." }] };
        return rE;
      }
    },

    /* O CORPO DE HOJE do `estimar`, em três fases (ver o bloco do despachante).
       `H` (4º argumento): null = o caminho de sempre; `H.integrada` = as
       extensões, e a fase (b) é a passada integrada da 1A. */
    _estimarBase: function (orc, override, ctx, H) {
      var params = this._params(orc, override), self = this;
      var manual = (orc.cronograma && orc.cronograma.duracoes) || {};
      /* ⚠ MODO EXECUTIVO AO VIVO (adendo A1). Com `exec.rede === true`, a
         etapa com folhas dura o vão S da rede interna calculado AGORA
         (`_vaosExec`, a mesma conta do `materializar`), seja o que for que
         esteja gravado em `duracoes[id]`; a marca "subetapas" que o
         materializar APAGARIA (etapa marco, só de marcos, sem subetapa) é
         ignorada aqui. Resultado: este `estimar` sem materializar === o
         master lendo o orçamento materializado (tools/test-crono-vivo.js).
         Sem isto, os 22 gravadores que não passam pelo App.persistir
         deixavam PDF, proposta e Portal com o vão velho até o próximo salvar.
         Desligado: `vivo` fica null e o laço abaixo é o de sempre (I2).
         O try: um orçamento torto que derrube a árvore não pode derrubar a
         data de etapa — cai no gravado, que é o que a versão antiga mostra. */
      /* memo de UMA chamada: a árvore EAP + o `_preparar` que o `_vaosExec`
         monta aqui em cima e o `_arvore` refazia lá embaixo. Ver `_contexto` —
         inclusive o ⚠ de por que ele NÃO pode atravessar chamadas. */
      var mem = [], calcCtx = (ctx && ctx.eap === true && ctx.calc) ? ctx.calc : null;
      var vivo = null, agVivo = null, cong = null;
      if (orc.cronograma && orc.cronograma.exec && orc.cronograma.exec.rede === true) {
        try { vivo = self._vaosExec(orc, false, mem, calcCtx); } catch (eVivo) { vivo = null; }
        agVivo = (orc.cronograma.duracoesAgente && typeof orc.cronograma.duracoesAgente === "object") ? orc.cronograma.duracoesAgente : {};
        /* ⚠ APROVADO: a data é a GRAVADA (ver `congeladoPorAprovacao`). O vão
           de hoje continua sendo calculado — mas SÓ para o recado da tela
           mostrar os dois números; ele não entra na duração da etapa. Com isto
           o aprovado volta a dar exatamente o que a versão anterior do app dá,
           que é o prazo impresso na proposta. O plano de execução da obra
           (marca `_planoDaObra`) não entra aqui: ele é ao vivo. */
        if (self.congeladoPorAprovacao(orc)) { cong = { vaos: vivo }; vivo = null; agVivo = null; }
      }
      // Marco = etapa de duração ZERO (entrega, vistoria, liberação). Vive num
      // mapa próprio porque um 0 em `duracoes` já significa "não estimável, cai
      // no cálculo" (ver abaixo) — reaproveitar o 0 confundiria os dois.
      var marcos = (orc.cronograma && orc.cronograma.marcos) || {};
      /* ⚠ ETAPA OPCIONAL FORA DO PRAZO (ver `opcionaisNoPrazo` no DEFAULTS).
         `opcFora` só é true quando alguém DESLIGOU o parâmetro — com ele
         ligado (o padrão do motor) nenhuma linha nova roda e a saída é a do
         master, bit a bit, que é o que a paridade cobra. */
      var opcFora = params.opcionaisNoPrazo === false, temFora = false;
      var etapas = (orc.etapas || []).map(function (e) {
        var ed = 0, catCusto = {}, custo = 0;
        (e.itens || []).forEach(function (it) {
          var r = self.estimarItem(it, params); ed += r.equipeDias;
          var ct = num(it.quantidade) * num(it.custoUnitario); custo += ct;
          catCusto[r.categoria] = (catCusto[r.categoria] || 0) + ct;
        });
        var catPred = Object.keys(catCusto).sort(function (a, b) { return catCusto[b] - catCusto[a]; })[0] || "outros";
        var catO = self.cat(catPred);
        // override manual só vale se POSITIVO — um 0 gravado (ex.: etapa "não estimável" do agente de
        // execução) NÃO pode zerar a barra do Gantt; cai no cálculo próprio por categoria.
        var mEt = manual[e.id];
        // modo executivo: o vão ao vivo manda; a marca "subetapas" que o materializar apagaria não vale (ver `vivo` acima)
        if (vivo) mEt = own(vivo.porId, e.id) ? vivo.porId[e.id] : ((own(agVivo, e.id) && agVivo[e.id] === "subetapas") ? null : mEt);
        var temOverride = mEt != null && num(mEt) > 0;
        var marco = marcos[e.id] === true;
        var dur = marco ? 0 : (temOverride ? num(mEt) : Math.max(1, Math.ceil(ed / (params.equipes || 1))));
        var out = { id: e.id, codigo: e.codigo, nome: e.nome, categoria: catPred, categoriaNome: catO.nome, cor: catO.cor, custo: custo, equipeDias: Math.round(ed * 10) / 10, duracao: dur, editado: temOverride, marco: marco };
        /* ⚠ I2: A OPCIONAL NÃO SAI DO ARRAY. `r.etapas` é 1:1 com `orc.etapas`
           e cinco consumidores casam por ÍNDICE (ver o bloco CRONOGRAMA
           EXECUTIVO). Ela fica com duração 0 e a marca `foraDoPrazo`; quem
           desenha usa `duracaoPlena` para a barra tracejada — o tamanho que
           ela teria SE fosse comprada, ancorado no `inicio` que a cascata deu. */
        if (opcFora && e.opcional === true) { out.duracaoPlena = dur; out.duracao = 0; out.foraDoPrazo = true; temFora = true; }
        return out;
      });
      /* ---- (b) REDE, IDA, RESTRIÇÕES E VOLTA ----
         ⚠ Extraída para `_idaVolta` SEM MUDAR UMA LINHA (planejador, T1): é a
         fase que a passada integrada da 1A troca (`H.integrada`). As duas
         devolvem a MESMA forma — {totalDias, ini, iniPedido, ajusteInicio,
         fer, cal, infoRestr, temCiclo, opcDependida} —, e a fase (c) abaixo
         não sabe qual das duas rodou. */
      var B;
      if (H && H.integrada) {
        if (typeof self._idaVoltaIntegrada !== "function") throw new Error("passada integrada do cronograma ausente (planejador 1A) — nada foi calculado com as extensões");
        B = self._idaVoltaIntegrada(etapas, orc, params, H.integrada, mem, opcFora, temFora, calcCtx);
      } else B = self._idaVolta(etapas, orc, params, opcFora, temFora);
      var totalDias = B.totalDias, ini = B.ini, iniPedido = B.iniPedido, ajusteInicio = B.ajusteInicio, fer = B.fer, cal = B.cal;
      var infoRestr = B.infoRestr, temCiclo = B.temCiclo, opcDependida = B.opcDependida;
      // a data de cada índice sai da tabela `cal` da fase (b) (ver o ⚠ "UMA TABELA DE CALENDÁRIO" em `_idaVolta`)
      function dataDeIdx(k) { return cal ? cal.dia(k) : self.addDiasUteis(ini, k, params.diasUteisSemana, fer.mapa); }
      // as três datas de cada etapa saem da tabela (ver o ⚠ de `cal` acima)
      etapas.forEach(function (et) {
        et.dataInicio = dataDeIdx(et.inicio);
        et.dataFim = dataDeIdx(et.fim);
        et.dataLimite = et.folga ? dataDeIdx(et.fim + et.folga) : et.dataFim;
      });
      var dataFim = dataDeIdx(totalDias);
      /* só os feriados que REALMENTE custaram dia de obra: um Natal que cai no
         domingo não atrasa nada, e contá-lo daria um número que não fecha com
         a diferença entre as datas. */
      var noPeriodo = fer.lista.filter(function (f) {
        var d = new Date(f.data + "T12:00:00");
        if (d < ini || d > dataFim) return false;
        var wd = d.getDay(), dpw = params.diasUteisSemana || 5;
        return dpw >= 7 || (dpw === 6 ? wd !== 0 : (wd !== 0 && wd !== 6));
      });
      var res = {
        etapas: etapas, totalDias: totalDias,
        totalSemanas: Math.max(1, Math.ceil(totalDias / (params.diasUteisSemana || 5))),
        dataInicio: ini, dataFim: dataFim, params: params,
        caminhoCritico: etapas.filter(function (e) { return e.critico; }).map(function (e) { return e.id; }),
        temCiclo: temCiclo,
        feriados: { mapa: fer.mapa, lista: fer.lista, noPeriodo: noPeriodo, invalidos: fer.invalidos, ajusteInicio: ajusteInicio }
      };
      /* ⚠ A CHAVE SÓ NASCE COM RESTRIÇÃO GRAVADA. Chave a mais no resultado é
         mudança de contrato e a paridade com o master reprova — por isso
         `infoRestr` é null quando `orc.cronograma.restricoes` está ausente,
         vazio ou é uma lista (mapa que voltou torto da sincronização). */
      if (infoRestr) res.restricoes = infoRestr.saida;
      /* ⚠ OS DOIS NÚMEROS DO PRAZO (defeito D4). `totalDias`/`dataFim` são o
         escopo CONTRATADO; `totalDiasComOpcionais`/`dataFimComOpcionais` são o
         mesmo plano com os opcionais dentro. A tela tem de mostrar os dois —
         um número só, aqui, é o que fazia a proposta prometer data de um
         escopo que o "Valor total" não cobra.
         ⚠ O SEGUNDO NÚMERO SAI DA MESMA FUNÇÃO, chamada com o interruptor
         LIGADO — nunca de uma segunda cópia da regra. Duas contas do mesmo
         prazo divergem na primeira manutenção, e aqui divergir é a mesma obra
         com duas entregas. A recursão não se repete (lá dentro
         `params.opcionaisNoPrazo` é true e `temFora` fica false) e só acontece
         quando o interruptor está desligado E existe etapa opcional — na base
         da RA isso é 0 de 51 orçamentos distintos, medido (a régua da contagem
         está no ⚠ de `opcionaisNoPrazo`, lá em cima).
         ⚠ `dataInicio` VAI EXPLÍCITA: sem início gravado o motor usa
         `new Date()`, e duas chamadas em lados diferentes da meia-noite
         datariam obras diferentes. Vai a data PEDIDA (antes do ajuste do dia
         0), que é de onde a chamada de cima também partiu. */
      if (temFora) {
        var ovPleno = {}, kOv;
        if (override) for (kOv in override) if (own(override, kOv)) ovPleno[kOv] = override[kOv];
        ovPleno.opcionaisNoPrazo = true;
        ovPleno.dataInicio = self._ch(iniPedido);
        var pleno = null;
        /* ⚠ na passada integrada, `orc` é a CÓPIA desprojetada: o pleno relê o
           ORIGINAL (as assinaturas da rede são do disco) */
        try { pleno = self.estimar((H && H.orig) || orc, ovPleno, null); } catch (ePl) { pleno = null; }
        var avOpc = [];
        etapas.forEach(function (et, i) {
          if (!et.foraDoPrazo) return;
          avOpc.push({ tipo: "fora-do-prazo", etapaId: et.id, numero: i + 1, duracaoPlena: et.duracaoPlena,
            msg: "Etapa " + (i + 1) + " é opcional: ela está FORA do prazo de " + totalDias + " dia(s) útil(eis) e fora do caminho crítico, " +
              "porque o \"Valor total\" não a cobra. Se o cliente comprá-la, ela pede " + et.duracaoPlena + " dia(s) útil(eis)" +
              (pleno ? " e a obra inteira passa a " + pleno.totalDias : "") + "." });
        });
        opcDependida.forEach(function (par) {
          var p = par.split("|"), sN = "?", pN = "?";
          etapas.forEach(function (et, i) { if (et.id === p[0]) sN = i + 1; if (et.id === p[1]) pN = i + 1; });
          avOpc.push({ tipo: "depende-de-opcional", etapaId: p[0], predId: p[1],
            msg: "Etapa " + sN + " depende da etapa " + pN + ", que é opcional e está fora do prazo contratado — o elo continua, mas com duração 0. " +
              "Ligue a etapa " + sN + " a uma etapa contratada no \"Depende de\", ou traga a " + pN + " para o escopo." });
        });
        /* ⚠ A DATA SEPARA; O DINHEIRO, AINDA NÃO — e isso é DITO, não escondido.
           `periodos` continua distribuindo o valor de TODA etapa, inclusive a
           que saiu do prazo: com duração 0 ela cai no ramo do marco e o valor
           inteiro dela pousa num dia só. MEDIDO (12/09/2026, fixture de 3
           etapas): com o interruptor ligado a obra dá 53 dias úteis em 3 meses;
           desligado, 14 dias úteis em 1 mês — e nos DOIS a soma da curva é a
           mesma, com 56% dela sendo a etapa opcional, agora empilhada no
           primeiro mês. Tirar esse dinheiro da curva é outra decisão de
           produto (o desembolso, o Portal, o físico-financeiro e o
           `Orcamento.cronograma` leem isto, e o chamador é quem passa os
           valores), e mudar número calado é exatamente o que não se faz aqui.
           Então o motor AVISA. Sem valor em R$ no texto: o que o motor tem à
           mão é CUSTO DIRETO, e ele não sai do motor. */
        /* ⚠ ESTE ERA O ÚNICO AVISO NOVO SEM NENHUM NÚMERO — e é o que fala de
           DINHEIRO. Texto constante, igual em todo orçamento, enquanto os
           outros três citam etapa e prazo. "Aviso genérico a pessoa lê como
           formalidade; número ela confere" (CLAUDE.md §7), e aqui o número
           existe e está à mão: quais etapas saíram, quantas são, e quantos
           meses a curva mensal continua ocupando contra os do prazo
           contratado. Sem cifra em R$: o que o motor tem à mão é CUSTO DIRETO,
           e custo direto não sai do motor. */
        if (avOpc.length) {
          var numFora = [];
          etapas.forEach(function (et, i) { if (et.foraDoPrazo) numFora.push(i + 1); });
          // expressão, não declaração: declaração de função dentro de bloco é
          // erro em ES5 estrito, e o produto roda em WebView de instalador antigo
          var mesesAte = function (d) { return (d.getFullYear() - ini.getFullYear()) * 12 + (d.getMonth() - ini.getMonth()) + 1; };
          var fimCurva = dataFim;
          etapas.forEach(function (et) { if (et.dataFim && et.dataFim > fimCurva) fimCurva = et.dataFim; });
          var mC = mesesAte(dataFim), mT = mesesAte(fimCurva);
          avOpc.push({ tipo: "curva-com-opcional", etapas: numFora, mesesContratado: mC, mesesCurva: mT,
            msg: "A distribuição mensal (desembolso, curva S e físico-financeiro) ainda conta o valor " +
              (numFora.length > 1 ? "das etapas opcionais " + numFora.slice(0, 3).join(", ") + (numFora.length > 3 ? " (e mais " + (numFora.length - 3) + ")" : "")
                : "da etapa opcional " + numFora[0]) +
              " — só o PRAZO foi separado: a obra CONTRATADA cabe em " + mC + " mês(es) e a curva mensal continua espalhada por " + mT + ". " +
              "O \"Valor total\" da proposta já separa (os opcionais saem como adicionais); a curva mensal, não. " +
              "Confira o desembolso antes de mandá-lo ao cliente." });
        }
        /* ⚠ ORÇAMENTO SEM NENHUM ESCOPO CONTRATADO (12/09/2026). Com TODAS as
           etapas marcadas `opcional` e o interruptor desligado o motor devolve
           `totalDias: 0`, `dataFim === dataInicio` e `caminhoCritico: []` — e
           nada dizia por quê. Pior: `Orcamento.mesesSugeridos` devolve 0 e o
           `_prazoTexto` monta "o cronograma passa a dar 0 dias úteis", que é
           mandar corrigir a proposta para ZERO — porta fechada. O "orçamento de
           adicionais" tem exatamente essa forma, então isto não é teórico. */
        var nFora = etapas.filter(function (e) { return e.foraDoPrazo; }).length;
        if (totalDias === 0 && nFora === etapas.length) avOpc.push({ tipo: "sem-escopo-contratado", opcionais: nFora,
          totalDiasComOpcionais: pleno ? pleno.totalDias : null,
          msg: "Todas as " + etapas.length + " etapa(s) deste orçamento estão marcadas como opcionais — não há prazo contratado (0 dia útil), " +
            "porque o \"Valor total\" não cobra nenhuma delas" + (pleno ? ". Com os opcionais dentro, a obra pede " + pleno.totalDias + " dia(s) útil(eis)" : "") +
            ". Desmarque \"opcional\" no que o \"Valor total\" cobra, ou trate este orçamento como proposta de adicionais (e leia o prazo pelo número COM opcionais)." });
        res.opcionais = { fora: etapas.filter(function (e) { return e.foraDoPrazo; }).map(function (e) { return e.id; }), avisos: avOpc };
        if (pleno) {
          res.totalDiasComOpcionais = pleno.totalDias;
          res.dataFimComOpcionais = pleno.dataFim;
        }
      }
      /* ⚠ A árvore do cronograma executivo entra DEPOIS, só com `ctx.eap`, e
         só LÊ `res` (nunca reescreve etapa, data ou total). O try é a guarda do
         I1: um defeito na árvore nova não pode derrubar o Gantt de etapas que a
         aba já desenhava — a tela recebe `exec.erro` e diz que não conseguiu,
         em vez de sumir com o cronograma inteiro. */
      if (B.integ) {
        self._saidaIntegrada(res, B, H.integrada, H.leitura);
        if (H.projecao) Object.defineProperty(res, "_integ", { value: B.integ, enumerable: false, configurable: true });
      }
      if (ctx && ctx.eap === true) {
        try {
          self._arvore(orc, res, ctx, vivo, cong, cal, mem);
          /* ⚠ o `no.avanco` das FOLHAS só existe depois daqui: `res.atividades`
             nasce no `_arvore` (achado A1, 18/09/2026). Dentro do mesmo try:
             um defeito aqui não pode derrubar o Gantt de etapas. */
          if (B.integ && H.integrada && H.integrada.avanco) self._saidaAvancoFolhas(res, B.integ, H.integrada);
        }
        catch (errArv) {
          res.atividades = null;
          res.exec = { rede: false, paralelismoSub: 0, toleranciaPP: 1, detalhe: "etapa", avisos: [],
            erro: "Não consegui montar o cronograma por subetapas (" + String((errArv && errArv.message) || errArv) + "). O Gantt por etapa continua valendo." };
        }
      }
      return res;
    },

    /* A FASE (b) DE HOJE — rede de precedência, ida, restrições de data e
       volta —, extraída do `estimar` sem mudar uma linha (planejador, T1).
       Escreve em cada etapa (`preds`, `predLag`, `predDesloc`, `inicio`,
       `fim`, `folga`, `critico`, `cicloDep`, `restricao`) e devolve o que a
       fase (c) lê: {totalDias, ini, iniPedido, ajusteInicio, fer, cal,
       infoRestr, temCiclo, opcDependida}.
       ⚠ A passada integrada da 1A (`_idaVoltaIntegrada`) devolve a MESMA
       forma: é o que deixa a fase (c) ser uma só. */
    _idaVolta: function (etapas, orc, params, opcFora, temFora) {
      var self = this;
      // ---- rede de precedência (CPM: ida, volta, folga e caminho crítico) ----
      // O padrão continua a cascata de sempre: cada etapa depois da ANTERIOR,
      // começando floor(paralelismo × duração da anterior) dias antes do fim
      // dela — com rede vazia, início/fim saem IDÊNTICOS ao modelo antigo (a
      // Curva S, o Excel, o 4D e o Last Planner leem esses dois campos).
      // `orc.cronograma.predecessoras[id]` muda a rede: [] = começa no dia 0;
      // [ids] = depende dessas etapas. Elo para etapa apagada ou para si mesma
      // morre em silêncio — dependência podre não pode travar o Gantt.
      var predsCfg = (orc.cronograma && orc.cronograma.predecessoras) || {};
      // `orc.cronograma.lags[id][predId]` = espera (+) ou avanço (−) em dias
      // úteis naquele elo. Mapa SEPARADO de `predecessoras` de propósito: a
      // lista continua sendo só ids, e a versão anterior do app (que não sabe o
      // que é lag) lê a rede do mesmo orçamento sem cair.
      var lagsCfg = (orc.cronograma && orc.cronograma.lags) || {};
      var porId = {};
      etapas.forEach(function (et) { porId[et.id] = et; });
      var opcDependida = [];
      etapas.forEach(function (et, i) {
        var cfg = predsCfg[et.id], out = [], k, lagEt = lagsCfg[et.id] || {};
        et.predsExplicito = Object.prototype.toString.call(cfg) === "[object Array]";
        if (et.predsExplicito) {
          for (k = 0; k < cfg.length; k++) if (cfg[k] !== et.id && porId[cfg[k]] && out.indexOf(cfg[k]) < 0) out.push(cfg[k]);
          /* ⚠ ELO EXPLÍCITO PARA UMA ETAPA QUE SAIU DO PRAZO. O elo CONTINUA
             valendo (apagá-lo mudaria a rede que a pessoa desenhou), mas o
             predecessor dura 0: na prática o sucessor começa onde o opcional
             começa. Isso precisa ser DITO — a pessoa ligou a etapa 5 à piscina
             e o plano contratado a ignora. Vai em `r.opcionais.avisos`. */
          if (opcFora) for (k = 0; k < out.length; k++) if (porId[out[k]].foraDoPrazo && opcDependida.indexOf(et.id + "|" + out[k]) < 0) opcDependida.push(et.id + "|" + out[k]);
        } else if (i > 0) {
          /* ⚠ A CASCATA PULA A ETAPA FORA DO PRAZO. Sem isto, `etapas[i-1].id`
             pendura a etapa seguinte numa barra de duração 0 e o plano
             contratado fica preso à posição de um escopo que não foi vendido.
             Se TODAS as anteriores estiverem fora, não há predecessora e a
             etapa começa no dia 0 — que é o certo: nada contratado a segura. */
          var j = i - 1;
          while (opcFora && j >= 0 && etapas[j].foraDoPrazo) j--;
          if (j >= 0) out.push(etapas[j].id);
        }
        et.preds = out;
        et.predLag = {};
        out.forEach(function (pid) { var l = lagEt[pid]; if (l != null && isFinite(num(l))) et.predLag[pid] = Math.round(num(l)); });
      });
      function sobre(p) { return Math.floor((params.paralelismo || 0) * p.duracao); }
      // deslocamento do elo p→s em relação ao FIM de p: lag explícito manda;
      // sem lag, vale a sobreposição automática do paralelismo (negativa).
      function desloc(p, s) { var l = s.predLag[p.id]; return l != null ? l : -sobre(p); }
      // o deslocamento EFETIVO de cada elo sai no resultado (`predDesloc`) para
      // o Gantt, o Excel vivo e o MS Project usarem o mesmo número do motor
      etapas.forEach(function (et) { et.predDesloc = {}; et.preds.forEach(function (pid) { et.predDesloc[pid] = desloc(porId[pid], et); }); });
      // ida (Kahn). ⚠ Ciclo NÃO pode travar o app: quem sobrar entra em ordem
      // de lista ignorando o elo não resolvido, e sai marcado (temCiclo) para
      // a tela avisar — em vez de um laço infinito na aba do orçamento.
      var indeg = {}, succ = {}, ordem = [], fila = [];
      etapas.forEach(function (et) { indeg[et.id] = et.preds.length; succ[et.id] = []; });
      etapas.forEach(function (et) { et.preds.forEach(function (p) { succ[p].push(et.id); }); });
      etapas.forEach(function (et) { if (!indeg[et.id]) fila.push(et.id); });
      while (fila.length) {
        var atual = fila.shift(); ordem.push(atual);
        succ[atual].forEach(function (s) { if (--indeg[s] === 0) fila.push(s); });
      }
      var temCiclo = ordem.length < etapas.length;
      if (temCiclo) etapas.forEach(function (et) { if (ordem.indexOf(et.id) < 0) { et.cicloDep = true; ordem.push(et.id); } });
      /* A IDA virou função para poder rodar DUAS vezes: a 1ª sem piso nenhum
         (o caminho de sempre, linha a linha) e a 2ª com o piso das RESTRIÇÕES
         DE DATA, que só existe quando há restrição gravada. Duas cópias do
         mesmo laço divergiriam na primeira manutenção — e aqui divergir
         significa a mesma obra com duas datas de entrega. */
      function ida(piso, redeOut) {
        var resolvido = {};
        ordem.forEach(function (id) {
          // o corpo do laço é o `_passoIda` (uma cópia só: a projeção da 1A o reaproveita)
          var rede = self._passoIda(porId[id], porId, desloc, piso, resolvido);
          if (redeOut) redeOut[id] = rede;
        });
      }
      ida(null, null);
      /* ⚠ O TOTAL É O DA ÚLTIMA ETAPA CONTRATADA. A etapa fora do prazo tem
         duração 0, mas o `fim` dela ainda é uma posição no calendário — e uma
         DATA FIXADA nela (o mapa `restricoes`, o que a barra arrastada no
         Gantt grava) a joga para frente. Sem esta guarda, arrastar a barra da
         piscina para dezembro esticava o prazo CONTRATADO junto: medido, 20
         dias úteis viravam 57. `foraDoPrazo` é undefined no caminho padrão,
         então esta linha continua sendo a de sempre (a paridade cobra). */
      function maiorFim(m, e) { return e.foraDoPrazo ? m : Math.max(m, e.fim); }
      var totalDias = etapas.reduce(maiorFim, 0);
      var ini = params.dataInicio ? new Date(params.dataInicio + (String(params.dataInicio).length <= 10 ? "T00:00:00" : "")) : new Date();
      /* ⚠ RESTRIÇÕES DE DATA (mapa novo `orc.cronograma.restricoes`) — ver o
         bloco `_restricoes`. Nada daqui roda sem restrição gravada: `restr`
         fica null e o cronograma sai bit a bit igual ao de sempre (a paridade
         com o master cobra isso). O feriado precisa cobrir até a restrição
         mais distante, senão uma etapa fixada em 2029 cairia fora do mapa. */
      var restr = self._restricoes(orc, etapas), folgaRest = 0;
      if (restr) restr.lista.forEach(function (x) {
        var t = new Date(x.data + "T00:00:00");
        if (isNaN(t.getTime())) return;
        var corr = Math.round((meiaNoite(t) - meiaNoite(ini)) / 86400000);
        if (corr > folgaRest) folgaRest = corr;
      });
      var fer = self._feriadosDe(params, ini, totalDias + Math.ceil(folgaRest * ((params.diasUteisSemana || 5) / 7)));
      /* ⚠ O DIA 0 TEM DE SER DIA DE OBRA. Sem isto, quem escolhia um domingo
         (ou 07/09, que é feriado) via a primeira etapa "começando" num dia em
         que não há ninguém no canteiro, e todas as datas seguintes herdavam o
         deslocamento. Empurra para o primeiro dia útil e guarda o ajuste, para
         a tela poder dizer POR QUE a data mudou — data que muda sozinha e sem
         explicação faz a pessoa achar que o sistema errou. */
      var iniPedido = new Date(ini.getTime()), ajusteInicio = null, giros = 0;
      while (!self.diaUtil(ini, params.diasUteisSemana, fer.mapa) && giros++ < 40) ini.setDate(ini.getDate() + 1);
      if (ini.getTime() !== iniPedido.getTime()) {
        ajusteInicio = { de: self._ch(iniPedido), para: self._ch(ini), motivo: fer.mapa[self._ch(iniPedido)] || "fim de semana" };
      }
      /* ⚠ UMA TABELA DE CALENDÁRIO POR `estimar` (12/09/2026), montada aqui —
         DEPOIS do ajuste do dia 0, porque é dele que ela parte.
         POR QUE: cada etapa era datada por TRÊS `addDiasUteis`, e cada um anda
         o calendário dia a dia desde o dia 0 chamando `diaUtil()`. MEDIDO no
         motor de 11/09: 69.635 chamadas num orçamento de 30 etapas / 1.539
         dias úteis (19,71 ms) e 126.980 num de 50 etapas / 1.706 (32,46 ms) —
         o custo é da RÉGUA do calendário, não do tamanho do orçamento: o mesmo
         orçamento com prazo curto custava 0,8 ms. A tabela faz a varredura UMA
         vez e responde por índice, e a data é EXATAMENTE a mesma (ela anda com
         os mesmos passos do `addDiasUteis` e cai NELE quando o giro passaria
         da guarda de 10 anos — ver `calendario`). Conferido em 17.359 datas,
         zero divergência: tools/test-crono-desempenho.js, bloco 1.
         ⚠ UMA SÓ, E COMPARTILHADA: o `_aplicarRestricoes` e o `_arvore`
         montavam cada um a sua. Duas tabelas do mesmo calendário divergem na
         primeira manutenção — e aqui divergir é a mesma obra com duas datas de
         entrega. Início inválido (Invalid Date) devolve null, e aí vale o
         `addDiasUteis` de sempre: o contrato não muda. */
      var cal = self.calendario({ dataInicio: ini, params: params, feriados: { mapa: fer.mapa } });
      var infoRestr = null;
      if (restr) {
        infoRestr = self._aplicarRestricoes(restr, etapas, porId, ini, params, fer, totalDias, folgaRest, ida, cal);
        totalDias = infoRestr.totalDias;
      }
      // volta: um sucessor exige que eu termine até (início tardio dele + a
      // minha sobreposição); folga = quanto posso atrasar sem mudar o fim da
      // obra. Folga zero = caminho crítico. Isso vale também na cascata
      // clássica: uma etapa curta que cabe dentro da sobreposição da anterior
      // termina antes do fim da obra e ganha folga de verdade.
      for (var vi = ordem.length - 1; vi >= 0; vi--) {
        var etv = porId[ordem[vi]], lf = totalDias;
        succ[etv.id].forEach(function (sid) {
          var sv = porId[sid];
          if (sv.folga == null) return; // sucessor dentro de ciclo: não aperta
          lf = Math.min(lf, sv.inicio + sv.folga - desloc(etv, sv));
        });
        etv.folga = Math.max(0, lf - etv.fim);
        etv.critico = etv.folga === 0;
      }
      /* ⚠ A ETAPA FORA DO PRAZO NÃO É CAMINHO CRÍTICO. Com duração 0 ela cai
         na conta de folga como qualquer marco e, quando fica na ponta do
         plano, sai com folga 0 — e apareceria no `caminhoCritico` pintada de
         vermelho no Gantt, dizendo que o escopo NÃO vendido atrasa a obra.
         Era metade do defeito D4: medido na fixture, a opcional saía no
         caminho crítico. Caminho crítico é do que foi contratado. */
      if (temFora) etapas.forEach(function (et) { if (et.foraDoPrazo) et.critico = false; });
      return { totalDias: totalDias, ini: ini, iniPedido: iniPedido, ajusteInicio: ajusteInicio, fer: fer, cal: cal,
        infoRestr: infoRestr, temCiclo: temCiclo, opcDependida: opcDependida };
    },

    /* O CORPO DO LAÇO DA IDA de etapas (planejador, T1): o início que os elos
       resolvidos pedem, o piso da restrição por cima, e o fim. Devolve o
       início que a REDE pede (antes do piso) — é o `redeOut` da tela ("começa
       em X porque…") e o `legIni` da projeção da 1A.
       ⚠ UMA CÓPIA SÓ: a ida de hoje e a simulação da versão anterior na
       projeção chamam esta. Duas cópias do laço divergem na primeira
       manutenção, e aqui divergir é a mesma obra com duas datas de entrega. */
    _passoIda: function (et, porId, desloc, piso, resolvido) {
      var ini0 = 0, id = et.id;
      et.preds.forEach(function (pid) {
        if (!resolvido[pid]) return; // só dentro de ciclo: o elo de volta é ignorado
        var p = porId[pid]; ini0 = Math.max(ini0, p.fim + desloc(p, et));
      });
      // o início que a REDE pede, antes do piso — é o que o Gantt precisa para
      // recusar um arrasto para a esquerda dizendo de quem é a culpa
      var rede = Math.max(0, ini0);
      if (piso && own(piso, id) && piso[id] > ini0) ini0 = piso[id];
      et.inicio = Math.max(0, ini0); et.fim = et.inicio + et.duracao; resolvido[id] = true;
      return rede;
    },

    /* O MESMO, entre as subetapas de uma etapa (`_redeInterna`): II parte do
       INÍCIO da predecessora, TI do fim. `pisoF` = piso por folha (a 1A usa
       para o elo cruzado e o corte; hoje ninguém passa). Devolve o início que
       a rede pede, antes do piso. */
    _passoInterno: function (f, porId, desloc, pisoF, feito) {
      var ini0 = 0, fid = f.id;
      f.predsResolvidos = []; f.predDeslocRede = {};
      f.preds.forEach(function (pid) {
        var p = porId[pid], d = desloc(p, f);
        f.predDeslocRede[pid] = d;
        if (!feito[pid]) return;   // só dentro de ciclo: o elo de volta é ignorado
        f.predsResolvidos.push(pid);
        ini0 = Math.max(ini0, (f.predTipo[pid] === "II" ? p.ini : p.fim) + d);
      });
      var rede = Math.max(0, ini0);
      if (pisoF && own(pisoF, fid) && pisoF[fid] > ini0) ini0 = pisoF[fid];
      f.ini = Math.max(0, ini0); f.fim = f.ini + f.dur; feito[fid] = true;
      return rede;
    },

    /* =================================================================
       PLANEJADOR 1A — FORMA NO DISCO (revisão 4 da espec, D31)
       ================================================================= */

    /* FORMA ENXUTA F1 (O29): o valor PADRÃO não vai ao disco.
       Saem: nos elos de `extras[].preds/sucs`, `t:"TI"` e `l:0`; na tarefa,
       `nia` nulo, `nota` vazia e `proposta` falsa; `por` em `restricoes`
       (o motivo do piso sai do MOTOR, na mesma renderização); em `mat`, os
       mapas vazios, o `div` zerado e o `semIniciar1281` que não é 1.
       ⚠ POR QUE: a M0 mediu 2,3 KB a menos no realista da base cheia
       (67,5 → 65,2), sem custo para a 1.2.81 — as chaves são novas ou ela não
       as lê (`restricoes` só em `tipo`/`data`, js/cronograma.js da 1.2.81
       :2020-2031). A LEITURA devolve o padrão (§1.9); a forma cheia continua
       sendo lida, porque nenhuma versão publicada a gravou.
       ⚠ Nos elos da REDE o `l` ausente NÃO é 0: é a sobreposição automática
       do TI (§1.3) — por isso esta função não toca `rede` (quem a grava já
       escreve a forma curta, `CronoRede.eloDisco`). */
    _formaEnxuta: function (cron) {
      if (!cron || typeof cron !== "object" || Array.isArray(cron)) return cron;
      function eloExtra(z) {
        if (!z || typeof z !== "object" || Array.isArray(z)) return z;
        if (z.t === "TI") delete z.t;
        if (own(z, "l") && (z.l === 0 || z.l === null)) delete z.l;
        return z;
      }
      if (Array.isArray(cron.extras)) cron.extras.forEach(function (x) {
        if (!x || typeof x !== "object" || Array.isArray(x)) return;
        if (Array.isArray(x.preds)) x.preds.forEach(eloExtra);
        if (Array.isArray(x.sucs)) x.sucs.forEach(eloExtra);
        if (own(x, "nia") && (x.nia === null || x.nia === "")) delete x.nia;
        if (own(x, "nota") && (x.nota === "" || x.nota === null)) delete x.nota;
        if (own(x, "proposta") && x.proposta !== true) delete x.proposta;
      });
      var rs = cron.restricoes;
      if (rs && typeof rs === "object" && !Array.isArray(rs)) Object.keys(rs).forEach(function (k) {
        if (rs[k] && typeof rs[k] === "object" && own(rs[k], "por")) delete rs[k].por;
      });
      var mt = cron.mat;
      if (mt && typeof mt === "object" && !Array.isArray(mt)) {
        ["etapas", "folhas", "restricoes", "pend"].forEach(function (k) {
          if (own(mt, k) && (!mt[k] || typeof mt[k] !== "object" || Array.isArray(mt[k]) || !Object.keys(mt[k]).length)) delete mt[k];
        });
        if (own(mt, "div") && !(mt.div && typeof mt.div === "object" && num(mt.div.n) > 0)) delete mt.div;
        if (own(mt, "semIniciar1281") && mt.semIniciar1281 !== 1) delete mt.semIniciar1281;
        if (own(mt, "semSombra") && mt.semSombra !== true) delete mt.semSombra;
      }
      return cron;
    },

    /* =================================================================
       A PROJEÇÃO DAS FUNÇÕES DE DATA (§2.7, P0–P6). `X` = o `_ext` lido do
       DISCO antes de qualquer escrita (as assinaturas são do gravado).
       ⚠ ESCREVE NO OBJETO RECEBIDO (é o registro que se grava) e só nele.
       ⚠ Idempotente (I7): a segunda chamada devolve `mudou:false` e o
       registro byte a byte igual; o único relógio é `mat.em`, que só muda
       quando algo mudou.
       ================================================================= */
    _projetar: function (orc, opts, X) {
      var self = this, cr = orc.cronograma, CRd = this._mod("CronoRede");
      var out = { mudou: false, gravadas: [], apagadas: [], avisos: [], mudancas: [], semVao: [], restauradas: [],
        divergencias: [], pendente: null, aprovado: false, leitura: [] };
      var antes = this._canonSemEm(cr), emAntes = mapaDe(cr, "mat") ? cr.mat.em : undefined;
      function mapaEm(o, k) { if (!mapaDe(o, k)) o[k] = {}; return o[k]; }
      function limpaVazio(o, k) { if (own(o, k) && ehObj(o[k]) && !temChave(o[k])) delete o[k]; }

      /* P0 — desprojeta NO OBJETO (§1.3.1): o planejado volta, a restrição
         escondida volta, o que espera escolha fica com `mat.pend` */
      var d0 = this.desprojetar(cr, "gravacao");
      out.leitura = d0.avisos;
      if (!X) {
        // sem extensão: fica só o que uma pendência ainda segura; o resto da sombra já saiu
        var mt0 = mapaDe(cr, "mat");
        if (mt0) {
          if (!temChave(mapaDe(mt0, "pend"))) delete cr.mat;
          else ["v", "requer", "recursos", "em", "ini", "avEm", "div", "semSombra"].forEach(function (k) { delete mt0[k]; });
        }
        var mh0 = this._materializarHoje(orc, opts);
        ["gravadas", "apagadas", "avisos", "mudancas", "semVao", "restauradas"].forEach(function (k) { out[k] = mh0[k]; });
        out.mudou = this._canonSemEm(cr) !== antes;
        return out;
      }
      /* P0b — MODO EXECUTIVO DESLIGADO: o `materializar` de hoje devolve ANTES
         do T as durações que o modo ligado tinha sobrescrito (marca
         "subetapas", `exec.anterior`). Roteiro do defeito (compat-1281, 184 de
         600 casos com rede): a etapa com a marca velha "subetapas" (6 dias)
         entrava no T com 6, o P4 a apagava (volta à estimativa, 8) e a sombra
         saía calculada para 6 — a 1.2.81 via 8, o registro carimbava
         "sem-codigo", e o salvar seguinte mudava de novo (não idempotente).
         Ligado, o `estimar` usa o vão ao vivo e não lê a duração gravada: o
         P4 continua depois do P2, que escreve as `sub.duracoes` que ele lê. */
      var exLig = !!(mapaDe(cr, "exec") && cr.exec.rede === true);
      var mh0 = exLig ? null : this._materializarHoje(orc, opts);
      var ini = opts.inicioEfetivo || this._params(orc).dataInicio || null;
      var ov = opts.inicioEfetivo ? { dataInicio: opts.inicioEfetivo } : null;
      var XT = X.pendente ? this._extSemDatas(X) : X;
      if (X.pendente) out.pendente = "sem-inicio";
      /* T: a passada integrada com os params GRAVADOS e o início efetivo (I7) */
      var PL = this._planejado(X.pendente ? this._planejadoSemDatas(orc) : orc);
      var T = this._estimarBase(PL.orc, ov, null, { integrada: XT, leitura: PL, orig: orc, projecao: true });
      var I = T._integ, NP = I.NP, G = I.G, abs = I.abs, EF = I.EF;
      var semSombra = !!(mapaDe(cr, "mat") && cr.mat.semSombra === true) || !!opts.semSombra;
      var rede = mapaDe(cr, "rede");
      var predM = mapaDe(cr, "predecessoras"), lagsM = mapaDe(cr, "lags");
      var subM = mapaDe(cr, "sub");
      var divP = [];   // as divergências que a própria projeção acha (P2): DEFEITO e D-FOLHA-INI
      function div(cod, id, campo, legado, novo) { divP.push({ cod: cod, id: id, numero: NP[id] ? NP[id].i + 1 : null, campo: campo, legado: legado, novo: novo }); }
      // "este nó (ou uma folha dele) já começou": a única licença para a âncora da O16
      function temAvP(n) { return !!(I.temAv && I.temAvancoEm && I.temAvancoEm(n)); }

      /* P1 — A REDE DIGITADA VIRA MAPAS DE SEMPRE (a sombra dos elos) */
      if (rede || I.N.some(function (n) { return n.cruzIn.length; })) {
        I.N.forEach(function (n) {
          if (n.extra) return;
          var temRede = !!n.rede, id = n.id;
          if (!temRede && !n.cruzIn.length && !n.cascataRede) return;   // legado puro: os mapas são da pessoa
          if (n.cascataRede && !n.cruzIn.length) {
            // `{c: 1}` só carrega a âncora (P2 recria se ela ainda valer)
            if (rede && mapaDe(rede, "etapas")) delete rede.etapas[id];
            if (lagsM) delete lagsM[id];
            return;
          }
          if (!temRede) {
            /* etapa LEGADA com derivado cruzado: a entrada guarda os elos legados
               (O26: o derivado não é elo da pessoa) */
            var ent = n.et.predsExplicito && !n.cascataRede && Object.prototype.toString.call(predM && predM[id]) === "[object Array]"
              ? { e: n.elos.map(function (l) { return CRd.eloDisco({ i: l.p, t: "TI", l: l.L }); }) } : { c: 1 };
            if (!rede) rede = cr.rede = { v: 1 };
            mapaEm(rede, "etapas")[id] = ent;
          }
          var ps = [], lg = {}, temLg = false;
          n.elos.forEach(function (l) {
            if (l.fonte === "extra") return;                     // ⚠ id de extra nunca vai a `predecessoras` (a 1.2.81 o apagaria)
            ps.push(l.p);
            var p = NP[l.p], dP = p.fimO - p.iniO, dS = n.fimO - n.iniO;
            if (l.tipo === "TI" && l.L == null) return;          // sobreposição automática: sem entrada
            lg[l.p] = self._deslocTI(l.tipo, l.L != null ? l.L : 0, dP, dS); temLg = true;
          });
          n.cruzIn.forEach(function (c) {
            var a = I.alvoCruz(c);
            if (!a) return;
            if (ps.indexOf(c.Ep) < 0) ps.push(c.Ep);
            var Ep = NP[c.Ep], v = a.cO - Ep.fimO;
            /* ⚠ elo digitado TI sem espera + derivado para a MESMA etapa: a
               sombra só tem UMA espera, e a sobreposição automática deixaria de
               valer — vale o maior dos dois (os dois pedem "no mínimo") */
            var auto = null;
            n.elos.forEach(function (l) { if (l.p === c.Ep && l.tipo === "TI" && l.L == null) auto = -Math.floor(I.par * (Ep.fimO - Ep.iniO)); });
            if (own(lg, c.Ep)) v = Math.max(lg[c.Ep], v);
            if (auto != null) v = Math.max(auto, v);
            lg[c.Ep] = v; temLg = true;
          });
          var cascataPura = !n.et.predsExplicito;
          if (!predM && !cascataPura) predM = cr.predecessoras = {};
          if (cascataPura) { if (predM) delete predM[id]; }
          else predM[id] = ps;
          if (temLg) { if (!lagsM) lagsM = cr.lags = {}; lagsM[id] = lg; }
          else if (lagsM) delete lagsM[id];
          /* cabe inteira no legado (só TI entre etapas, sem cruzado): a entrada
             sai, e os mapas de sempre são a rede digitada (§1.3) */
          if (temRede && !n.cruzIn.length && n.elos.every(function (l) { return l.tipo === "TI"; })) delete rede.etapas[id];
        });
        if (I.execRede) Object.keys(G).forEach(function (eid) {
          var F = G[eid], A = abs[eid];
          F.lista.forEach(function (f) {
            if (!f.rede && !f.cascata) return;
            if (!subM) subM = cr.sub = {};
            var fid = f.id, sP = mapaEm(subM, "predecessoras"), sL = mapaEm(subM, "lags"), sT = mapaEm(subM, "tipos");
            if (f.cascata) {
              delete sP[fid]; delete sL[fid]; delete sT[fid];
              if (rede && mapaDe(rede, "folhas")) delete rede.folhas[fid];
              return;
            }
            var ps2 = [], lg2 = {}, tp2 = {}, cabe = true;
            f.elos.forEach(function (l) {
              ps2.push(l.p);
              var dS = A ? A[fid].fimO - A[fid].iniO : f.D;
              if (l.tipo === "II" || l.tipo === "IT") tp2[l.p] = "II";
              if (l.tipo === "TI") { if (l.L != null) lg2[l.p] = l.L; }
              else if (l.tipo === "II") { if (l.L != null) lg2[l.p] = l.L; }
              else { lg2[l.p] = (l.L != null ? l.L : 0) - dS; cabe = false; }
            });
            // o elo cruzado desta folha não vai a `sub.*` (a 1.2.81 diria "IGNORADO", G3): vira derivado na etapa
            I.N.forEach(function (n) { n.cruzIn.forEach(function (c) { if (c.f === fid) cabe = false; }); });
            sP[fid] = ps2;
            if (temChave(lg2)) sL[fid] = lg2; else delete sL[fid];
            if (temChave(tp2)) sT[fid] = tp2; else delete sT[fid];
            /* ⚠ A ENTRADA SAI, MAS O MOTOR DE FOLHA NÃO PODE SAIR COM ELA
               (18/09/2026, achado A2). A entrada de `rede.folhas` some porque
               `sub.predecessoras`/`lags`/`tipos` já a expressam inteira — e
               isso está certo. O que estava errado era o LADO DA LEITURA: o
               `precisaArvore` só montava a árvore quando havia ligação ou data
               DIGITADA em subetapa, então apagar esta entrada desligava o `abs`
               e, com ele, o avanço lançado nas folhas.
               ROTEIRO: plano executivo com s1 (6 DU) → s2 (4 DU) e avanço
               concluindo s1 em 2 DU. Antes do salvar, 18 DU. O salvar apagava
               `rede.folhas.s2`; o MESMO registro passava a dar 24 DU no motor
               novo (a 1.2.81 continuava lendo 18), a `conferirFrota` acusava
               11 divergências `D-VELHA` e o 2º salvar ainda devolvia
               `mudou: true`. Hoje o `precisaArvore` tem o termo de avanço
               (`temAvancoFolha`) e o registro fica em 18 DU dos dois lados,
               com `mudou: false` no 2º salvar.
               Quem mexer aqui roda tools/test-crono-avanco-folha.js. */
            if (cabe) delete rede.folhas[fid];
          });
        });
      }

      /* P2 — ÂNCORA, PISOS E DURAÇÕES: simula a 1.2.81 sobre o que já foi
         escrito (a ida dela, na ordem dela) e escreve só a diferença */
      /* ⚠ O ELO DIGITADO QUE A ÂNCORA GUARDA LEVA O TIPO E A ESPERA DE
         VERDADE (§1.3: `e` = a rede DIGITADA do nó; `l` ausente = sobreposição
         automática no TI). A âncora (O16) rebaixa a espera em `lags` para a
         1.2.81 desenhar o início real, e a entrada de rede é o ÚNICO lugar
         onde a espera planejada continua existindo — `mat` não guarda lags.
         Até 22/09/2026 ela era escrita só com o id (`{i: "e3"}`): a espera de
         5 dias que a pessoa digitou em e3 → e5f1 (o galpão) virava
         "sobreposição automática". Roteiro medido (e2e-planejador-completo e
         scratchpad fech3/sonda-lag.js): 1º salvar com avanço → lags 5 → 4 e
         `rede.etapas.e5f1 = {e:[{i:"e3"}]}`; 2º salvar → a espera some do
         disco (vira piso `nia`); lido sem o avanço, a e5f1 começa no dia 4 e
         não no 9. E o 2º salvar mudava o registro sem ninguém mexer em nada
         (a projeção deixava de ser idempotente — o (e) da compat-1281). */
      function eloDigitado(elos, p) {
        var o = { i: p }, l = null;
        arr(elos).forEach(function (x) { if (!l && x && x.p === p) l = x; });
        if (!l) return o;
        if (l.tipo && l.tipo !== "TI") o.t = l.tipo;
        if (l.L != null && isFinite(num(l.L))) o.l = Math.round(num(l.L));
        return o;
      }
      var R0 = mapaEm(cr, "restricoes");
      var matO = mapaEm(cr, "mat"), matE = mapaEm(matO, "etapas"), matF = mapaEm(matO, "folhas"), matR = mapaEm(matO, "restricoes");
      var O = I.O, legFim = {}, legDur = {}, pos = I.posOrd;
      if (!X.pendente) I.ordem.forEach(function (id) {
        var n = NP[id], et = n.et;
        if (n.extra) return;                                     // a tarefa sem preço não tem sombra: ela É o piso das etapas
        var legIni = 0;
        /* ⚠ a lista que a 1.2.81 LÊ é a gravada (P1 acabou de escrevê-la), não
           `n.preds`: o elo cruzado sem posição (a subetapa predecessora numa
           etapa só de marcos) entra na ordem de Kahn mas não vai à sombra — com
           `n.preds` a simulação contava um elo que a 1.2.81 não tem e
           carimbava DEFEITO num registro certo (compat-1281, rede#317) */
        var psLeg = (predM && Object.prototype.toString.call(predM[id]) === "[object Array]") ? predM[id].filter(function (p) { return own(NP, p) && p !== id && !NP[p].extra; }) : n.predsEt;
        var apertaLeg = [];
        psLeg.forEach(function (p) {
          if (pos[p] > pos[id]) return;                          // o elo de volta do ciclo: a 1.2.81 também ignora
          var lgm = lagsM ? lagsM[id] : null, lv = lgm && typeof lgm === "object" && own(lgm, p) ? lgm[p] : null;
          var d = (lv != null && isFinite(num(lv))) ? Math.round(num(lv)) : -Math.floor(I.par * legDur[p]);
          apertaLeg.push({ p: p, v: legFim[p] + d, fim: legFim[p] });
          legIni = Math.max(legIni, legFim[p] + d);
        });
        legIni = Math.max(0, legIni);
        if (n.pisoU != null && n.pisoU > legIni) legIni = n.pisoU;
        var Ti = n.iniO;
        if (Ti < legIni) {
          /* ---- A ÂNCORA DO INÍCIO REAL (O16) ----
             A tarefa começou ANTES do que a rede da 1.2.81 deixa (fora de
             sequência). A sombra de DURAÇÃO não consegue desenhar um início
             anterior: a 1.2.81 encurtaria a barra, e aí
               • a sobreposição automática da sucessora sairia MENOR e ela
                 andaria (medido: 22 × 23, crítica 2, achado 2);
               • uma tarefa concluída antes da predecessora ficaria com 1 dia
                 no lugar errado.
             Por isso o que se rebaixa é a ESPERA dos elos que chegam ao nó,
             até a 1.2.81 desenhar o início REAL. O custo, declarado: ela mostra
             a espera ajustada ("3−4d") no "Depende de" dessa tarefa — que está
             travada para arrasto, IA e sequência (§2.10), e a assinatura da
             rede pega qualquer edição dela num aparelho antigo.
             ⚠ SÓ EXISTE OUTRO CAMINHO LEGÍTIMO SE O NÓ COMEÇOU: sem avanço,
               começar antes do que a rede deixa é DEFEITO do motor. */
          if (temAvP(n)) {
            var lgW = mapaEm(cr, "lags"), lgN = null;
            apertaLeg.forEach(function (q) {
              if (q.v <= Ti) return;
              if (!lgN) lgN = mapaEm(lgW, id);
              lgN[q.p] = Ti - q.fim;                              // a espera rebaixada, na régua da obra
            });
            /* a entrada de rede carrega a âncora: sem ela, a assinatura da
               próxima leitura não reconheceria a espera como escrita por nós */
            if (lgN) {
              var RW = mapaEm(cr, "rede"); RW.v = 1;
              var mEt = mapaEm(RW, "etapas");
              if (!own(mEt, id)) mEt[id] = (predM && own(predM, id)) ? { e: psLeg.map(function (q) { return eloDigitado(n.elos, q); }) } : { c: 1 };
            }
            var pisoAnc = R0[id] && !R0[id].origem ? msDeData(R0[id].data) : null;
            if (pisoAnc != null && O.phi(pisoAnc) > Ti) {
              /* o piso do usuário também empurraria: ele vai para `mat` e a
                 entrada passa a ser a data REAL (o `u` fica guardado, nunca
                 apagado — a pessoa nunca viu a troca) */
              var uA = { tipo: R0[id].tipo, data: R0[id].data };
              R0[id] = { tipo: "nia", data: chMs(O.dia(Ti)), origem: "mat" };
              matR[id] = { u: uA, s: CRd.assinar({ tipo: "nia", data: R0[id].data }) };
            }
            legIni = Ti;
          } else div("DEFEITO", id, "inicio", legIni, Ti);
        }
        if (Ti > legIni) {
          var u = R0[id] && !R0[id].origem ? { tipo: R0[id].tipo, data: R0[id].data } : null;
          R0[id] = { tipo: "nia", data: chMs(O.dia(Ti)), origem: "mat" };
          matR[id] = u ? { u: u, s: CRd.assinar({ tipo: "nia", data: R0[id].data }) } : { s: CRd.assinar({ tipo: "nia", data: R0[id].data }) };
          legIni = Ti;
          n.pisoMat = true;
        }
        var D0 = mapaDe(cr, "duracoes"), A0 = mapaDe(cr, "duracoesAgente"), K0 = mapaDe(cr, "marcos");
        function planE() {
          var e = {};
          if (D0 && own(D0, id) && num(D0[id]) > 0) e.d = D0[id];
          if (A0 && own(A0, id) && A0[id] != null) e.a = A0[id];
          if (K0 && K0[id] === true) e.m = 1;
          return e;
        }
        if (!abs[id]) {
          var dm = n.fimO - n.iniO;
          if (n.fora) legDur[id] = 0;
          else if (n.marco) legDur[id] = 0;
          else if (dm === 0) {
            var pe = planE(); pe.s = "m";
            mapaEm(cr, "marcos")[id] = true; if (A0) delete A0[id];
            matE[id] = pe; legDur[id] = 0;
          } else if (dm < 0) { div("DEFEITO", id, "duracao", n.D, dm); legDur[id] = n.D; }
          else if (dm !== n.D) {
            var pe2 = planE(); pe2.s = dm;
            mapaEm(cr, "duracoes")[id] = dm; if (A0) delete A0[id];
            matE[id] = pe2; legDur[id] = dm;
          } else legDur[id] = n.D;
        } else {
          /* a etapa de modo executivo: cada folha, na ordem interna da 1.2.81,
             com a posição que ELA dá (o `_passoInterno` sobre a sombra) */
          var F = G[id], A = abs[id], base = Ti, legRel = {}, S = 0;
          var sub = subM || {}, sD = mapaDe(sub, "duracoes"), sA = mapaDe(sub, "agente"), sK = mapaDe(sub, "marcos");
          var sLm = mapaDe(sub, "lags"), sTm = mapaDe(sub, "tipos");
          F.ordem.forEach(function (fid) {
            var f = F.porId[fid], a = A[fid], sLeg = 0;
            f.elos.forEach(function (l) {
              var q = legRel[l.p];
              if (!q) return;
              var tl = sTm && sTm[fid] && typeof sTm[fid] === "object" && String(sTm[fid][l.p] || "").toUpperCase() === "II" ? "II" : "TI";
              var lm = sLm && sLm[fid] && typeof sLm[fid] === "object" && own(sLm[fid], l.p) ? sLm[fid][l.p] : null;
              var lv2 = (typeof lm === "number" ? isFinite(lm) : /^\s*[+\-]?\d+([.,]\d+)?\s*$/.test(String(lm == null ? "" : lm))) ? Math.round(num(lm)) : null;
              var d2 = tl === "II" ? (lv2 != null ? lv2 : 0) : (lv2 != null ? lv2 : -Math.floor(I.parSub * q.dur));
              sLeg = Math.max(sLeg, (tl === "II" ? q.ini : q.fim) + d2);
            });
            sLeg = Math.max(0, sLeg);
            var rel = a.iniO - base, relFim = a.fimO - base, durL;
            if (rel < sLeg) {
              /* ÂNCORA NA FOLHA (O16): a subetapa começou antes do que a rede
                 interna da 1.2.81 deixa. Rebaixa a espera dos elos que
                 apertam, até ela desenhar a posição real. */
              if (temAvP(n) && a.avEstado) {
                if (!subM) subM = cr.sub = {};
                var sLw = mapaEm(subM, "lags");
                f.elos.forEach(function (l2) {
                  var q2 = legRel[l2.p];
                  if (!q2) return;
                  var tl2 = sTm && sTm[fid] && typeof sTm[fid] === "object" && String(sTm[fid][l2.p] || "").toUpperCase() === "II" ? "II" : "TI";
                  var ref2 = tl2 === "II" ? q2.ini : q2.fim;
                  if (ref2 <= rel) return;
                  mapaEm(sLw, fid)[l2.p] = rel - ref2;
                });
                var RWf = mapaEm(cr, "rede"); RWf.v = 1;
                var mFo = mapaEm(RWf, "folhas");
                if (!own(mFo, fid)) {
                  mFo[fid] = { e: f.elos.map(function (l2) { return eloDigitado(f.elos, l2.p); }) };
                  /* ⚠ E A LISTA EXPLÍCITA QUE O P1 ESCREVERIA NA PRÓXIMA
                     PASSADA: com a entrada de rede, o P1 da chamada seguinte
                     trata a folha como rede digitada e grava
                     `sub.predecessoras[fid]` — a 1ª projeção deixava a cascata
                     implícita e a 2ª a escrevia, e cada salvar depois do
                     primeiro mudava o registro (medido no galpão: 8 folhas,
                     scratchpad fech3/sonda-idem.js). Escrever aqui o que o P1
                     escreveria é o que torna a 1ª projeção o ponto fixo. */
                  mapaEm(subM, "predecessoras")[fid] = f.elos.map(function (l2) { return l2.p; });
                  var tpA = {};
                  f.elos.forEach(function (l2) { if (l2.tipo === "II" || l2.tipo === "IT") tpA[l2.p] = "II"; });
                  if (temChave(tpA)) mapaEm(subM, "tipos")[fid] = tpA;
                }
                sLeg = rel;
              } else div("DEFEITO", fid, "inicio", sLeg, rel);
            } else if (rel > sLeg) div("D-FOLHA-INI", fid, "inicio", sLeg, rel);
            function planF() {
              var e = {};
              if (sD && own(sD, fid) && num(sD[fid]) > 0) e.d = sD[fid];
              if (sA && own(sA, fid) && sA[fid] != null) e.a = sA[fid];
              if (sK && sK[fid] === true) e.m = 1;
              return e;
            }
            if (f.marco) durL = 0;
            else if (a.fimO === a.iniO) {
              var pf0 = planF(); pf0.s = "m";
              if (!subM) subM = cr.sub = {};
              mapaEm(subM, "marcos")[fid] = true; if (sA) delete sA[fid];
              matF[fid] = pf0; durL = 0;
            } else {
              var dmf = relFim - sLeg;
              if (dmf < 1) { div("DEFEITO", fid, "duracao", f.D, dmf); dmf = 1; }
              if (dmf !== f.D) {
                var pf1 = planF(); pf1.s = dmf;
                if (!subM) subM = cr.sub = {};
                mapaEm(subM, "duracoes")[fid] = dmf; if (sA) delete sA[fid];
                matF[fid] = pf1;
              }
              durL = dmf;
            }
            legRel[fid] = { ini: sLeg, fim: sLeg + durL, dur: durL };
            S = Math.max(S, sLeg + durL);
          });
          legDur[id] = S;
        }
        /* TETO sem piso (nid, a parte-teto de dta): a 1.2.81 só avisa um
           "terminar até"; com piso na mesma etapa, fica só o piso (D-TETO) */
        var d = n.dataRede;
        if (!n.pisoMat && d && (d.t === "nid" || d.t === "dta") && !R0[id]) {
          var tf = d.t === "nid" ? n.tetoIniO + (n.fimO - n.iniO) : n.tetoFimO;
          R0[id] = { tipo: "tae", data: chMs(O.dia(tf)), origem: "mat" };
          matR[id] = { s: CRd.assinar({ tipo: "tae", data: R0[id].data }) };
        }
        legFim[id] = legIni + legDur[id];
      });

      /* P3 — sem a sombra das folhas (a porta (3), `D-SEM-SOMBRA`): tudo o
         que é de FOLHA volta ao planejado; a 1.2.81 calcula outra data nas
         folhas e diz isso no catálogo */
      if (semSombra) {
        Object.keys(matF).forEach(function (fid) {
          var e = matF[fid];
          if (!subM) subM = cr.sub = {};
          var sD2 = mapaEm(subM, "duracoes"), sA2 = mapaEm(subM, "agente"), sK2 = mapaEm(subM, "marcos");
          if (own(e, "d")) sD2[fid] = e.d; else delete sD2[fid];
          if (own(e, "a")) sA2[fid] = e.a; else delete sA2[fid];
          if (e.m) sK2[fid] = true; else delete sK2[fid];
          delete matF[fid];
        });
        if (rede && mapaDe(rede, "folhas") && subM) Object.keys(rede.folhas).forEach(function (fid) {
          ["predecessoras", "lags", "tipos"].forEach(function (k) { if (mapaDe(subM, k)) delete subM[k][fid]; });
        });
        matO.semSombra = true;
      }

      /* P4 — o `materializar` de hoje (vão das subetapas com a marca), que lê
         as `sub.duracoes` já escritas */
      var mh = this._materializarHoje(orc, opts);
      ["gravadas", "apagadas", "avisos", "mudancas", "semVao", "restauradas"].forEach(function (k) { out[k] = (mh0 ? mh0[k] : []).concat(mh[k]); });

      /* P5 — ASSINA sobre os mapas FINAIS; o selo; a forma enxuta.
         ⚠ A RETENÇÃO É PELAS EFETIVAS DO DISCO (`X.efetivas`), NUNCA pelas da
         passada (`I.EF`): sem início fixo a passada roda sem as funções de
         data (`_extSemDatas` tira o mtp), e com `I.EF` o "o mais tarde
         possível" da pessoa era APAGADO do disco no salvar — o caso da
         compat-1281 (sem início, dois mtp encadeados) perdia os dois e o
         salvar seguinte ainda mudava o registro de novo. */
      var EFd = X.efetivas || EF;
      /* ⚠ RELÊ O `rede` DO OBJETO: o P1 (o elo cruzado) e a ÂNCORA do P2
         CRIAM `cr.rede` num registro que não tinha nenhum. A variável local
         foi capturada antes de P1, e com ela o P5 pulava a assinatura da
         entrada recém-criada. O efeito era exatamente o que a assinatura
         existe para evitar: na leitura seguinte a entrada aparecia como
         "substituída por um aparelho antigo", o `lags` da sombra passava a
         valer como espera DIGITADA, e a projeção deixava de ser idempotente —
         o mesmo plano dava dois prazos em dois salvares seguidos. */
      rede = mapaDe(cr, "rede");
      if (rede) {
        ["etapas", "folhas"].forEach(function (nv) {
          var m = mapaDe(rede, nv);
          if (!m) return;
          Object.keys(m).forEach(function (id) {
            var ef = EFd[nv][id];
            // a entrada que um aparelho antigo substituiu, ou de nó que não existe mais: sai (§1.3)
            var existe = nv === "etapas" ? own(NP, id) : own(X.folhaDe, id);
            if (!existe || (ef && ef.fonte !== "rede")) { delete m[id]; return; }
            m[id].s = CRd.assinatura(cr, nv, id);
          });
          if (!temChave(m)) delete rede[nv];
        });
        var md = mapaDe(rede, "datas");
        if (md) {
          Object.keys(md).forEach(function (id) {
            var ed = EFd.datas[id];
            if (!ed || ed.fonte !== "rede") { delete md[id]; return; }
          });
          Object.keys(md).forEach(function (id) { md[id].s = CRd.assinatura(cr, "datas", EFd.datas[id].dono); });
          if (!temChave(md)) delete rede.datas;
        }
        if (!temChave(mapaDe(rede, "etapas")) && !temChave(mapaDe(rede, "folhas")) && !temChave(mapaDe(rede, "datas"))) { delete cr.rede; rede = null; }
        else rede.v = 1;
      }
      ["restricoes", "predecessoras", "lags"].forEach(function (k) { limpaVazio(cr, k); });
      if (subM) ["predecessoras", "lags", "tipos", "duracoes", "agente", "marcos"].forEach(function (k) { limpaVazio(subM, k); });
      var recursos = [];
      if (rede) recursos.push("rede");
      if (X.extras) recursos.push("extras");
      /* o CALENDÁRIO entra em `mat.recursos` quando ele ainda segura alguma
         data: sem atribuição válida, a régua volta a ser a da obra e a
         versão mínima cai junto (I12) */
      if (X.cal) recursos.push("cal");
      if (X.avanco) recursos.push("avanco");
      var temSombraMat = temChave(matE) || temChave(matF) || temChave(matR) || temChave(mapaDe(matO, "pend"));
      if (!recursos.length && !temSombraMat && !matO.semSombra && matO.semIniciar1281 !== 1) {
        delete cr.mat;
      } else {
        matO.v = 1;
        if (recursos.length) { matO.requer = this._requerDe(recursos); matO.recursos = recursos; }
        else { delete matO.requer; delete matO.recursos; }
        if (ini) matO.ini = String(ini).slice(0, 10); else delete matO.ini;
        /* ⚠ `mat.avEm` = o `atualizadoEm` do registro de avanço que ESTA
           projeção usou. Quando ele ficar diferente do registro de agora, a
           leitura sabe que alguém lançou avanço DEPOIS do último salvar do
           plano e declara `D-AVANCO-PENDENTE`: os aparelhos 1.2.81 continuam
           vendo as datas do último salvar, e a porta [Atualizar as datas para
           aparelhos de versão anterior] existe para fechar a janela. O
           aparelho que LANÇA avanço nunca regrava o plano (O17). */
        if (X.avanco && orc._avancoDaObra && orc._avancoDaObra.atualizadoEm) matO.avEm = String(orc._avancoDaObra.atualizadoEm);
        else delete matO.avEm;
      }

      /* P6 — A CONFERÊNCIA: a 1.2.81 sobre o gravado × o T (reaproveitado;
         a compat-1281 (g) prova que é o mesmo `estimar`) */
      var cf = this.conferirFrota(orc, ov, { rn: T, projecao: true, X: X });
      out.divergencias = cf.divergencias.concat(divP);
      var cods = [];
      out.divergencias.forEach(function (x) { if (cods.indexOf(x.cod) < 0) cods.push(x.cod); });
      if (X.pendente && cods.indexOf("D-PENDENTE") < 0) cods.push("D-PENDENTE");
      if (cods.length) {
        if (!mapaDe(cr, "mat")) cr.mat = { v: 1 };
        cr.mat.div = { n: out.divergencias.length || 1, cods: cods.sort() };
      } else if (mapaDe(cr, "mat")) delete cr.mat.div;
      var foraCat = cods.filter(function (c) { return self.CATALOGO_DIV.indexOf(c) < 0; });
      if (foraCat.length) out.avisos.push({ tipo: "nao-garantido", cods: foraCat,
        msg: "Não consegui garantir que aparelhos com versão anterior do app vejam as mesmas datas (" + foraCat.join(", ") + ")." });
      this._formaEnxuta(cr);
      var U = this._mod("Util");
      if (U && typeof U.semListaAninhada === "function" && !U.semListaAninhada(cr)) throw new Error("erro de programação: o cronograma ficaria com lista dentro de lista (O18) — nada foi gravado");
      var depois = this._canonSemEm(cr);
      if (depois !== antes) {
        if (mapaDe(cr, "mat")) cr.mat.em = opts.agora || new Date().toISOString();
        out.mudou = true;
      } else if (mapaDe(cr, "mat")) {
        if (emAntes !== undefined) cr.mat.em = emAntes; else delete cr.mat.em;
      }
      out.T = T;
      return out;
    },
    /* A EDIÇÃO VAI AO PLANEJADO (§2.7-P0; `GanttUI.aplicarOps`). Antes de a
       pessoa mexer num cronograma com sombra, a sombra sai e o valor planejado
       volta — senão a duração digitada cairia em cima do valor reprogramado,
       e o próximo salvar a leria como edição de um aparelho antigo.
       ⚠ As entradas da rede que VALIAM continuam valendo: a desprojeção mexe
       em `restricoes`, e a assinatura das datas é desse mapa. Elas são
       reassinadas sobre os mapas de depois (a mudança é desta versão, não de
       um aparelho antigo). `folhaDe` diz de que etapa é cada subetapa (a
       assinatura da data de subetapa é a da etapa dela). */
    _redeValidas: function (cron, folhaDe) {
      var CRd = this._mod("CronoRede"), R = CRd && ehObj(cron) ? CRd.normalizar(cron.rede) : null;
      var out = { etapas: {}, folhas: {}, datas: {} };
      if (!R) return out;
      ["etapas", "folhas"].forEach(function (nv) {
        Object.keys(R[nv]).forEach(function (id) { if (R[nv][id].s === CRd.assinatura(cron, nv, id)) out[nv][id] = true; });
      });
      var rs = mapaDe(cron, "restricoes") || {}, mr = mapaDe(mapaDe(cron, "mat"), "restricoes") || {};
      Object.keys(R.datas).forEach(function (id) {
        var s = R.datas[id].s, dono = null;
        if (folhaDe && own(folhaDe, id)) dono = folhaDe[id];
        else if (folhaDe) dono = id;
        else {
          // sem o mapa das folhas: só a etapa que casa SOZINHA (na dúvida, a entrada não é reassinada)
          var cands = {}, achou = [];
          cands[id] = true;
          Object.keys(rs).forEach(function (k) { cands[k] = true; });
          Object.keys(mr).forEach(function (k) { cands[k] = true; });
          Object.keys(cands).forEach(function (k) { if (CRd.assinatura(cron, "datas", k) === s) achou.push(k); });
          dono = achou.length === 1 ? achou[0] : (achou.indexOf(id) > -1 && own(rs, id) ? id : null);
        }
        if (dono != null && CRd.assinatura(cron, "datas", dono) === s) out.datas[id] = dono;
      });
      return out;
    },
    _reassinar: function (cron, validas) {
      var CRd = this._mod("CronoRede"), R = mapaDe(cron, "rede");
      if (!R || !CRd || !validas) return;
      ["etapas", "folhas"].forEach(function (nv) {
        var m = mapaDe(R, nv);
        if (m) Object.keys(validas[nv]).forEach(function (id) { if (ehObj(m[id])) m[id].s = CRd.assinatura(cron, nv, id); });
      });
      var md = mapaDe(R, "datas");
      if (md) Object.keys(validas.datas).forEach(function (id) { if (ehObj(md[id])) md[id].s = CRd.assinatura(cron, "datas", validas.datas[id]); });
    },
    prepararEdicao: function (cron, opts) {
      opts = opts || {};
      if (!ehObj(cron)) return { avisos: [], validas: null };
      var folhaDe = opts.folhaDe || (opts.orc ? this._folhasDe(opts.orc) : null);
      var validas = this._redeValidas(cron, folhaDe);
      var d = (own(cron, "mat") || this._temSombra({ cronograma: cron })) ? this.desprojetar(cron, "gravacao") : { avisos: [] };
      this._reassinar(cron, validas);
      return { avisos: d.avisos, validas: validas, folhaDe: folhaDe };
    },

    /* A TRAVA DOS GRAVADORES QUE ESCREVEM DIRETO NOS MAPAS DE SEMPRE — a IA
       (`iaedit`, `cronoia`), a sequência construtiva (`cronoseq`) e o "Enviar
       ao cronograma" da Execução (§2.10, R9). Devolve o MOTIVO (texto) ou
       null. Eles gravam `predecessoras`/`lags`/`duracoes` por cima da sombra:
       - nó com entrada em `rede` (a ligação TT/IT, o elo cruzado ou a
         restrição de data que eles ainda não editam) — a gravação apagaria a
         rede digitada, ou a deixaria mentindo;
       - nó com `mat.pend` (a escolha que a pessoa ainda não fez, §1.3.1).
       (o calendário próprio e o avanço iniciado entram nos commits seguintes)
       `nivel` = "etapa" | "folha". */
    travaGravador: function (cron, id, nivel, orc) {
      if (!ehObj(cron) || id == null) return null;
      /* ⚠ TAREFA QUE JÁ COMEÇOU NÃO SE MOVE NEM SE ESTICA (§2.10; commit
         AVANÇO). A IA, a sequência construtiva e o "Enviar ao cronograma" da
         Execução trocam a DURAÇÃO PLANEJADA de um nó. Num nó que já tem real
         lançado isso não é replanejar: é reescrever o que a obra fez. O
         número real continua no registro de avanço, e a data desenhada sai
         dele — então a troca ou não teria efeito nenhum (e a pessoa acharia
         que o app ignorou o clique) ou entraria em briga com o realizado no
         próximo salvar. Quem quer mexer no que já começou mexe no AVANÇO,
         não na duração. */
      var av = orc && orc._avancoDaObra;
      if (av && typeof av === "object" && Array.isArray(av.nos)) {
        var CA = this._mod("CronoAvanco"), i, e, st;
        if (CA && CA.pronto) for (i = 0; i < av.nos.length; i++) {
          e = av.nos[i];
          if (!e || e.id !== id) continue;
          st = CA.estadoDe(e);
          if (st === "concluida") return "esta tarefa já está concluída (real lançado): a IA, a sequência construtiva e o “Enviar ao cronograma” não mexem no que a obra já fez — para corrigir, edite o avanço lançado";
          if (st === "iniciada") return "esta tarefa já começou (real lançado): mudar a duração planejada dela não muda a data desenhada, que sai do realizado — para corrigir, edite o avanço lançado";
        }
      }
      var R = mapaDe(cron, "rede");
      if (R) {
        if (own(mapaDe(R, nivel === "folha" ? "folhas" : "etapas"), id))
          return "este nó tem ligação de outro tipo (TT, IT, II entre etapas) ou com outra etapa, que a IA e a sequência construtiva ainda não editam — ajuste o “Depende de” dele na tabela";
        var dd = mapaDe(R, "datas");
        if (dd && own(dd, id) && ehObj(dd[id]) && dd[id].t !== "tae")
          return "este nó tem restrição de data (" + String(dd[id].t) + "), que a IA e a sequência construtiva ainda não editam — ajuste a restrição dele no cartão da barra";
      }
      var pend = mapaDe(mapaDe(cron, "mat"), "pend");
      if (pend && own(pend, id)) return "este nó foi alterado num aparelho com versão anterior do app e espera a sua escolha (veja o recado de compatibilidade na aba Cronograma)";
      return null;
    },

    /* AS PORTAS DE ESCOLHA DA §1.3.1 — só resolvem `mat.pend` (e o valor
       planejado que a pessoa escolheu), nunca apagam dado sem ela ver.
       `escolha`: duração → "usar" (o valor que o aparelho antigo gravou vira
       o planejado, com a marca dele), "estimativa" (volta à estimativa) ou
       "manter" (fica o planejado desta versão); restrição → "restaurar" (a
       restrição escondida volta a valer) ou "descartar" (fica a do disco).
       Depois da escolha a entrada de `mat` do nó sai: o salvar seguinte
       reprojeta a partir do planejado escolhido. Devolve {ok, recado} ou
       {ok:false, erro}. */
    escolherPendencia: function (cron, id, escolha, opts) {
      if (!ehObj(cron)) return { ok: false, erro: "cronograma ausente." };
      var mat = mapaDe(cron, "mat"), pend = mapaDe(mat, "pend");
      if (!pend || !own(pend, id)) return { ok: false, erro: "esta escolha já foi feita (ou não existe mais)." };
      this.prepararEdicao(cron, opts);
      mat = mapaDe(cron, "mat"); pend = mapaDe(mat, "pend");
      if (!pend || !own(pend, id)) return { ok: false, erro: "esta escolha já foi feita (ou não existe mais)." };
      var p = pend[id], mR = mapaDe(mat, "restricoes"), recado;
      function obj(o, k) { if (!mapaDe(o, k)) o[k] = {}; return o[k]; }
      if (p.c === "restricao-1281") {
        var e = mR && ehObj(mR[id]) ? mR[id] : null;
        /* depois do `prepararEdicao` a restrição do mapa pode ser a guardada
           (a entrada ainda era a sombra) ou a do outro aparelho: a escolha
           escreve as duas saídas explicitamente, sem depender de qual ficou */
        if (escolha === "restaurar") {
          if (!e || !ehObj(e.u)) return { ok: false, erro: "não há restrição guardada para restaurar." };
          obj(cron, "restricoes")[id] = { tipo: e.u.tipo, data: e.u.data };
          recado = "a restrição guardada voltou a valer.";
        } else if (escolha === "descartar") {
          if (ehObj(p.e)) obj(cron, "restricoes")[id] = { tipo: p.e.tipo, data: p.e.data };
          else if (mapaDe(cron, "restricoes")) delete cron.restricoes[id];
          recado = ehObj(p.e) ? "a restrição guardada foi descartada; vale a do outro aparelho." : "a restrição guardada foi descartada; a tarefa ficou sem restrição, como o outro aparelho deixou.";
        } else return { ok: false, erro: "escolha desconhecida (" + escolha + ")." };
        if (mR) delete mR[id];
      } else {
        var mE = mapaDe(mat, "etapas"), mF = mapaDe(mat, "folhas");
        var nivel = mE && own(mE, id) ? "etapa" : (mF && own(mF, id) ? "folha" : null);
        if (!nivel) return { ok: false, erro: "não há duração guardada para esta tarefa." };
        var base = nivel === "folha" ? obj(cron, "sub") : cron, kAg = nivel === "folha" ? "agente" : "duracoesAgente";
        if (escolha === "usar") {
          if (p.v === 0) { obj(base, "marcos")[id] = true; if (mapaDe(base, "duracoes")) delete base.duracoes[id]; }
          else if (p.v != null && num(p.v) > 0) { obj(base, "duracoes")[id] = num(p.v); if (mapaDe(base, "marcos")) delete base.marcos[id]; }
          else return { ok: false, erro: "o valor do outro aparelho não está guardado." };
          if (p.a) obj(base, kAg)[id] = p.a; else if (mapaDe(base, kAg)) delete base[kAg][id];
          recado = "o valor do outro aparelho (" + p.v + ") passou a ser o planejado.";
        } else if (escolha === "estimativa") {
          if (mapaDe(base, "duracoes")) delete base.duracoes[id];
          if (mapaDe(base, kAg)) delete base[kAg][id];
          if (mapaDe(base, "marcos")) delete base.marcos[id];
          recado = "a tarefa voltou à estimativa.";
        } else if (escolha === "manter") recado = "ficou o planejado desta versão.";
        else return { ok: false, erro: "escolha desconhecida (" + escolha + ")." };
        delete (nivel === "etapa" ? mE : mF)[id];
      }
      delete pend[id];
      this._formaEnxuta(cron);
      return { ok: true, recado: recado };
    },

    /* o cronograma em texto canônico SEM `mat.em` (o relógio da projeção) */
    _canonSemEm: function (cr) {
      var CRd = this._mod("CronoRede");
      if (!ehObj(cr)) return String(cr);
      var c = rasa(cr);
      if (ehObj(cr.mat)) { c.mat = rasa(cr.mat); delete c.mat.em; }
      return CRd ? CRd.canon(c) : JSON.stringify(c);
    },
    /* o registro tem sombra desta versão a desfazer (mesmo sem extensão) */
    _temSombra: function (orc) {
      var cr = orc && orc.cronograma, k;
      if (!ehObj(cr)) return false;
      if (own(cr, "mat")) return true;
      var rs = mapaDe(cr, "restricoes");
      if (rs) for (k in rs) if (own(rs, k) && rs[k] && rs[k].origem != null) return true;
      return false;
    },

    /* A CONFERÊNCIA DO CONTRATO C1 (§1.11) COM O CATÁLOGO: cada diferença
       entre a leitura da 1.2.81 (`estimarLegado`) e a desta versão sobre o
       GRAVADO recebe um código. Os de JANELA (`D-VELHA`, `D-AVANCO-PENDENTE`,
       `D-INICIO-VELHO`) saem de REPROJETAR uma cópia: a diferença que um
       salvar novo apaga é janela; a que fica é estrutural (`D-SEM-SOMBRA`,
       `D-PENDENTE`) ou defeito ("sem-codigo"). Nunca de adivinhação. */
    _codificar: function (orc, override, div, opts, nov) {
      var cr = orc && orc.cronograma, mat = mapaDe(cr, "mat");
      var X = opts.X || this._ext(orc, override);
      /* =================================================================
         D-ESPERA-AVANCO (§1.11, 21/09/2026) — A ESPERA REBAIXADA DA ÂNCORA.
         ROTEIRO: a tarefa começou ANTES do que a rede deixa (fora de
         sequência, O16). A sombra de DURAÇÃO não desenha um início anterior,
         então o que se rebaixa é a ESPERA dos elos que chegam ao nó, até a
         1.2.81 desenhar o início REAL (o bloco da âncora, mais abaixo, já
         declara o custo: "ela mostra a espera ajustada no 'Depende de' dessa
         tarefa"). AS DATAS SÃO AS MESMAS nas duas versões; o que difere é o
         `predDesloc`, que o contrato C1 compara.
         Sem código no catálogo, o salvar de TODA obra com avanço lançado
         passava a dizer "não consegui garantir que aparelhos com versão
         anterior vejam as mesmas datas (sem-codigo) … avise o suporte da RA"
         — assustando com "outras datas" quando as datas são iguais, em cada
         gravação (revisão adversarial da Onda 2). Recado que mente é pior que
         recado nenhum.
         ⚠ O GUARDA QUE IMPEDE ESTE CÓDIGO DE VIRAR GUARDA-CHUVA: ele só vale
           para a etapa em que NENHUMA data difere. Se uma data da mesma etapa
           também divergiu, a espera não é o custo declarado — é defeito, e
           continua saindo sem código.
         ⚠ O DONO: quem ficou fora de sequência pode ser a FOLHA (subetapa ou
           o resto "<etapa>~g"); o `predDesloc` que muda é o da ETAPA dela.
         ================================================================= */
      var esperaAv = {}, self = this;
      if (X && X.avanco && nov && nov.avanco && arr(nov.avanco.foraDeSequencia).length) {
        var donoF = this._folhasDe(orc) || {}, foraEt = {}, temData = {};
        arr(nov.avanco.foraDeSequencia).forEach(function (f) {
          if (!f || f.id == null) return;
          foraEt[own(donoF, f.id) ? donoF[f.id] : f.id] = true;
        });
        div.forEach(function (x) { if (x.id != null && x.campo !== "predDesloc") temData[x.id] = true; });
        div.forEach(function (x, i) {
          if (x.campo === "predDesloc" && x.id != null && own(foraEt, x.id) && !own(temData, x.id)) { x.cod = "D-ESPERA-AVANCO"; esperaAv[i] = true; }
        });
      }
      function todos(c) { div.forEach(function (x, i) { if (!own(esperaAv, i)) x.cod = c; }); }
      if (!X) { todos("sem-codigo"); return; }
      if (mat && mat.semSombra === true) { todos("D-SEM-SOMBRA"); return; }
      if (X.pendente) { todos("D-PENDENTE"); return; }
      /* o REGISTRO foi gravado pendente (sem início e com função de data
         absoluta) e é lido agora com um início (o plano pelo início da obra,
         o `override` de quem chama): a sombra dessas funções nunca foi
         escrita — é a mesma pendência, não uma edição de aparelho antigo */
      if (override && override.dataInicio) { var Xd = this._ext(orc); if (Xd && Xd.pendente) { todos("D-PENDENTE"); return; } }
      if (opts.projecao) { todos("sem-codigo"); return; }
      var copia = rasa(orc);
      copia.cronograma = JSON.parse(JSON.stringify(cr));
      var ini = this._params(orc, override).dataInicio;
      var iniEf = ini ? String(ini).slice(0, 10) : null;
      var fica = {};
      try {
        this._projetar(copia, { simulacao: true, inicioEfetivo: iniEf }, this._ext(copia, override));
        this._difC1(this.estimarLegado(copia, override), this.estimar(copia, override)).forEach(function (x) { fica[x.id + "|" + x.campo] = true; });
        /* ⚠ O GUARDA DA PROMESSA DO `D-VELHA` (18/09/2026, achado A2).
           `D-VELHA` diz à pessoa "um aparelho de versão anterior editou depois
           do último salvar novo — o próximo salvar novo fecha". As duas metades
           precisam ser verdade, e a segunda só é se a projeção for IDEMPOTENTE
           (I7): reprojetar de novo tem de devolver `mudou: false`.
           ROTEIRO DO DEFEITO: com o `precisaArvore` sem o termo de avanço, o
           salvar apagava a rede interna da folha, o avanço da subetapa saía do
           cálculo e o prazo do MESMO registro ia de 18 para 24 DU. A
           `conferirFrota` então carimbava as onze diferenças como `D-VELHA` —
           "um aparelho antigo editou" — sem que ninguém tivesse encostado no
           plano, e o salvar seguinte reproduzia tudo. Recado que mente é pior
           que recado nenhum: o dono do plano ia procurar um aparelho que não
           existia enquanto o número dele andava sozinho.
           Sem idempotência a diferença não é janela: é DEFEITO desta versão, e
           sai sem código — que é como a §1.11 manda tratar o que o catálogo
           não explica. */
        var re = this._projetar(copia, { simulacao: true, inicioEfetivo: iniEf }, this._ext(copia, override));
        if (re && re.mudou) { todos("sem-codigo"); return; }
      } catch (e) { todos("sem-codigo"); return; }
      var iniVelho = !!(mat && mat.ini && ini && String(ini).slice(0, 10) !== mat.ini);
      div.forEach(function (x, i) {
        if (own(esperaAv, i)) return;              // já tem código declarado
        if (own(fica, x.id + "|" + x.campo)) x.cod = "sem-codigo";
        else x.cod = iniVelho ? "D-INICIO-VELHO" : "D-VELHA";
      });
    },

    /* =================================================================
       DESPROJETAR (§1.3.1, E1/P0) — a sombra de volta ao PLANEJADO.
       `modo` "leitura": `cron` é uma CÓPIA (quem chama copia); os valores
       planejados voltam e os avisos saem; `mat` fica como está.
       `modo` "gravacao": `cron` é o objeto que se grava; além disso, as
       entradas resolvidas de `mat` saem e as que esperam escolha ganham
       `mat.pend[id]` (nunca descartadas até a pessoa escolher).
       Devolve {avisos, limpeza}.

       ⚠ O PADRÃO É DIFERENTE PARA DURAÇÃO E PARA RESTRIÇÃO (§1.3.1):
       - DURAÇÃO: o valor que a sombra escreveu já contém atraso (avanço) ou
         está em outra unidade (calendário). Lido como planejado, ele
         corrompe o plano — o atraso conta duas vezes e dias da obra viram
         dias da frente (crítica 1, achado 5). Então vale SEMPRE o planejado
         guardado; o que o aparelho antigo gravou vai ao aviso, com as portas.
       - RESTRIÇÃO: a entrada que a pessoa arrastou ou soltou é a decisão que
         ela VIU. A restrição escondida (`u`) nunca foi vista, então fica
         guardada e oferecida, sem ser aplicada nem apagada.
       ⚠ A sombra de duração NÃO TEM MARCA (O1): quem distingue a edição do
       aparelho antigo é o VALOR (`s`), porque a edição manual da 1.2.81 apaga
       a marca (js/ganttui.js:763) — marca nenhuma distinguiria. */
    desprojetar: function (cron, modo) {
      var gravar = modo === "gravacao", CRd = this._mod("CronoRede"), out = { avisos: [], limpeza: false };
      if (!cron || typeof cron !== "object" || Array.isArray(cron)) return out;
      function mp(o, k) { var m = o && typeof o === "object" ? o[k] : null; return (m && typeof m === "object" && !Array.isArray(m)) ? m : null; }
      function obj(o, k) { if (!mp(o, k)) o[k] = {}; return o[k]; }
      function vazio(m) { return !m || typeof m !== "object" || Array.isArray(m) || !Object.keys(m).length; }
      var mat = mp(cron, "mat");
      var R = mp(cron, "restricoes");
      var mR = mat ? mp(mat, "restricoes") : null;
      /* restrição com `origem:"mat"` sem registro em `mat`: sombra órfã — não
         é do usuário (e não pode prender a etapa, EXTRAS §c.1-4); `por` e
         qualquer outra `origem` saem da leitura (O29; §1.9) */
      function limparEntradas() {
        if (!R) return;
        Object.keys(R).forEach(function (id) {
          var x = R[id];
          if (!x || typeof x !== "object" || Array.isArray(x)) return;
          if (x.origem === "mat") { if (!(mR && own(mR, id))) delete R[id]; return; }
          if (own(x, "origem") || own(x, "por")) R[id] = { tipo: x.tipo, data: x.data };
        });
      }
      if (!mat) { limparEntradas(); return out; }
      var mE = mp(mat, "etapas"), mF = mp(mat, "folhas"), pend = mp(mat, "pend");
      var sub = mp(cron, "sub");
      var temEnt = !vazio(mE) || !vazio(mF) || !vazio(mR);
      /* LIMPEZA DA 1.2.81 (`limparEdicoes` dela zera os mapas de sempre e
         mantém `rede` e `mat`): vale a limpeza, como na versão nova (§2.9).
         ⚠ "vazio" nas durações de etapa CONTA a marca "subetapas": o
         `limparEdicoes` dela termina com o `materializar`, que no modo
         executivo regrava o vão das etapas com subetapas — sem isto a
         limpeza no executivo era lida como "editado num aparelho antigo" em
         cada subetapa (test-crono-portas-1281, [REDE]) */
      function soVao(m) {
        if (vazio(m)) return true;
        var ag = mp(cron, "duracoesAgente") || {};
        return Object.keys(m).every(function (k) { return ag[k] === "subetapas"; });
      }
      if (temEnt && soVao(cron.duracoes) && vazio(cron.marcos) && vazio(sub && sub.duracoes) && vazio(sub && sub.marcos) &&
        vazio(R) && vazio(cron.predecessoras) && vazio(cron.lags)) {
        out.limpeza = true;
        out.avisos.push({ tipo: "limpeza-1281",
          msg: "As edições do cronograma foram limpas num aparelho de versão anterior. As tarefas sem preço, os calendários e o avanço lançado ficaram." });
        if (gravar) { delete cron.mat; delete cron.rede; }
        return out;
      }
      function aviso(a) { out.avisos.push(a); }
      function pendDe(id) { return pend && own(pend, id) ? pend[id] : null; }
      function poePend(id, v) { if (!gravar) return; if (!pend) pend = obj(mat, "pend"); pend[id] = v; }
      /* as durações (etapa: duracoes/duracoesAgente/marcos; folha: sub.*) */
      function durs(mm, nivel) {
        if (!mm) return;
        var base = nivel === "folha" ? (sub || (sub = obj(cron, "sub"))) : cron;
        var kAg = nivel === "folha" ? "agente" : "duracoesAgente";
        Object.keys(mm).forEach(function (id) {
          var e = mm[id];
          if (!e || typeof e !== "object" || Array.isArray(e) || !own(e, "s")) {
            // entrada sem assinatura: descartada; o valor gravado vale como digitado (§1.9)
            aviso({ tipo: "mat-sem-assinatura", nivel: nivel, id: id });
            if (gravar) delete mm[id];
            return;
          }
          var D = mp(base, "duracoes"), A = mp(base, kAg), K = mp(base, "marcos");
          var v = D && own(D, id) ? D[id] : undefined, a = A && own(A, id) ? A[id] : undefined, m = K && own(K, id) ? K[id] : undefined;
          /* modo executivo ligado por um aparelho antigo DEPOIS da sombra: o
             valor guardado em `exec.anterior` é a própria sombra, e ele volta
             sem marca ao desligar (js/cronograma.js da 1.2.81 :1470-1488) —
             enquanto o modo estiver ligado, nada a fazer (§1.3.1) */
          if (nivel === "etapa" && a === "subetapas") {
            var ex = mp(cron, "exec"), an = ex ? mp(ex, "anterior") : null;
            if (an && an[id] && an[id].dur === e.s) return;
          }
          var intacta = e.s === "m" ? (m === true && a === undefined && v === undefined) : (v === e.s && a === undefined);
          function repoe() {
            if (own(e, "d")) obj(base, "duracoes")[id] = e.d; else if (D) delete D[id];
            if (own(e, "a")) obj(base, kAg)[id] = e.a; else if (mp(base, kAg)) delete base[kAg][id];
            if (e.m) obj(base, "marcos")[id] = true; else if (mp(base, "marcos")) delete base.marcos[id];
          }
          var p = pendDe(id);
          repoe();
          if (intacta && !p) { if (gravar) delete mm[id]; return; }
          var gravado = intacta ? (p && p.v !== undefined ? p.v : null) : (v !== undefined ? v : (m === true ? 0 : null));
          var marca = intacta ? (p ? p.a || null : null) : (a !== undefined ? a : null);
          aviso({ tipo: "editado-versao-anterior", nivel: nivel, id: id, gravado: gravado, marca: marca,
            planejado: own(e, "d") ? e.d : null, planejadoMarca: own(e, "a") ? e.a : null, estimativa: !intacta && v === undefined && m === undefined });
          if (!p) { var pv = { c: "editado-versao-anterior" }; if (gravado != null) pv.v = gravado; if (marca) pv.a = marca; poePend(id, pv); }
        });
      }
      durs(mE, "etapa");
      if (mF) durs(mF, "folha");
      if (mR) {
        if (!R && gravar) R = obj(cron, "restricoes");
        Object.keys(mR).forEach(function (id) {
          var e = mR[id];
          if (!e || typeof e !== "object" || Array.isArray(e) || typeof e.s !== "string") {
            aviso({ tipo: "mat-sem-assinatura", nivel: "restricao", id: id });
            if (gravar) delete mR[id];
            return;
          }
          var ent = R && own(R, id) ? R[id] : undefined, p = pendDe(id);
          var u = (e.u && typeof e.u === "object" && !Array.isArray(e.u)) ? { tipo: e.u.tipo, data: e.u.data } : null;
          var intacta = !!ent && typeof ent === "object" && ent.origem === "mat" && !!CRd && CRd.assinar({ tipo: ent.tipo, data: ent.data }) === e.s;
          if (intacta) {
            if (u) { if (!R) R = obj(cron, "restricoes"); R[id] = u; } else if (R) delete R[id];
            if (p) aviso({ tipo: "restricao-1281", id: id, u: u, entrada: p.e || null, acao: p.acao || "substituida" });
            else if (gravar) delete mR[id];
            return;
          }
          if (ent && typeof ent === "object" && !Array.isArray(ent)) {
            var ve = { tipo: ent.tipo, data: ent.data };
            R[id] = ve;   // vale o que a pessoa viu e mexeu
            if (u && !(u.tipo === ve.tipo && u.data === ve.data)) {
              aviso({ tipo: "restricao-1281", id: id, u: u, entrada: ve, acao: "substituida" });
              if (!p) poePend(id, { c: "restricao-1281", acao: "substituida", e: ve });
            } else if (gravar && !p) delete mR[id];
            return;
          }
          if (u) {
            aviso({ tipo: "restricao-1281", id: id, u: u, entrada: null, acao: "solta" });
            if (!p) poePend(id, { c: "restricao-1281", acao: "solta" });
          } else if (gravar && !p) delete mR[id];
        });
      }
      limparEntradas();
      /* pendência sem entrada que ela proteja: resolvida por outro caminho */
      if (gravar && pend) Object.keys(pend).forEach(function (id) {
        if (!((mE && own(mE, id)) || (mF && own(mF, id)) || (mR && own(mR, id)))) delete pend[id];
      });
      return out;
    },

    /* módulo irmão resolvido NA CHAMADA (no index.html os módulos novos
       carregam DEPOIS deste arquivo; em Node, o require relativo) */
    /* O FERIADO DA OBRA COMO FUNÇÃO (ms → bool), para o `CronoCal`.
       ⚠ POR ANO, SOB DEMANDA, e não por um mapa montado de antemão: o
       calendário da frente é consultado DENTRO do consumo, que pode passar do
       último ano que o `_feriadosDe` cobriu (ele mede pela estimativa do
       prazo, antes da ida). Um mapa curto faria a frente 7×7 trabalhar no
       Natal do ano seguinte, calada — e a sombra e o desenho discordariam.
       O cache por ano deixa a conta barata no laço dia a dia. */
    _feriadoFn: function (params) {
      if (!params || !params.descontarFeriados) return function () { return false; };
      var F = (typeof Feriados !== "undefined") ? Feriados : (typeof global !== "undefined" ? global.Feriados : null);
      if (!F || !F.entre || !F.mapa) return function () { return false; };
      var cache = {}, extras = params.feriadosExtras, fac = params.feriadosFacultativos !== false;
      return function (ms) {
        var d = new Date(ms), a = d.getFullYear();
        if (!own(cache, a)) cache[a] = F.mapa(F.entre(a, a, extras, fac).lista);
        return !!cache[a][chMs(ms)];
      };
    },

    /* os nós que PODEM receber calendário: etapa, folha, grupo de soltos
       (`etapaId~g`) e tarefa sem preço. O serviço não recebe (ele herda a
       janela da folha). Atribuição a quem não existe mais sai na leitura, com
       aviso — nunca apaga o dado (a etapa pode voltar num desfazer). */
    _nosDoCal: function (orc, folhaDe) {
      var nos = {};
      arr(orc && orc.etapas).forEach(function (e) {
        if (!e || e.id == null) return;
        nos[e.id] = true;
        nos[e.id + "~g"] = true;
      });
      Object.keys(folhaDe || {}).forEach(function (f) { nos[f] = true; });
      var cr = orc && orc.cronograma;
      arr(cr && cr.extras).forEach(function (x) { if (ehObj(x) && typeof x.id === "string") nos[x.id] = true; });
      return nos;
    },

    _mod: function (nome) {
      var arq = { CronoRede: "./cronorede.js", CronoCal: "./cronocal.js", CronoExtras: "./cronoextras.js", CronoAvanco: "./cronoavanco.js",
        CronoBase: "./cronobase.js", CronoPlan: "./cronoplan.js", Util: "./util.js" }[nome];
      var g = (typeof global !== "undefined" && global) ? global : null;
      var m = g ? g[nome] : null;
      if (!m && typeof require !== "undefined" && arq) { try { m = require(arq); } catch (e) { m = null; } }
      return m || null;
    },

    /* =================================================================
       O TETO DE 60 KB, PELA RÉGUA DO ALVO (revisão 4, O30, §1.10-5, P7).
       `orc` = o orçamento, ou o clone do plano (`_planoDaObra`).
       `opts`:
         plano       — o registro do plano (no alvo plano; o cronograma medido
                       é o de `orc`, e o resto do registro vem daqui);
         cronOrc     — o cronograma do orçamento de ORIGEM (porta (1));
         obra        — a obra ligada ao orçamento (alvo orçamento; sem ela, a
                       obra-sonda do lado seguro);
         comSemSombra(cron) → o cronograma projetado SEM a sombra das folhas
                       (a simulação da porta (3); quem chama projeta);
         semDadosNovos(orc) → o orçamento sem os dados novos (o "excesso
                       anterior"); sem ela, a desprojeção desta versão.
       Devolve {alvo, regua, bytes, teto, excede, portas:[...], porFuncao,
       base81?, preExistente?}.
       ⚠ PORTA PROMETIDA PRECISA EXISTIR: cada porta é SIMULADA, de forma
       cumulativa e na ordem da O30, e só entra a PRIMEIRA que traz o registro
       para ≤ 60 KB. A M0 mediu que a `D-SEM-SOMBRA` não resgata a base cheia
       e às vezes PIORA (77,6 × 73,0 KB no E-REDE cheio): oferecê-la sem
       simular seria trava com porta falsa. [Ver o que ocupa espaço] vem
       sempre.
       ⚠ Esta função MEDE; quem recusa é quem chama (a operação que fez
       passar). Ela nunca corta dado sozinha. */
    TETO_PLANO: 60 * 1024,
    medirTeto: function (orc, opts) {
      opts = opts || {};
      var self = this, CB = this._mod("CronoBase"), P = this._mod("CronoPlan"), TETO = this.TETO_PLANO;
      function copia(x) { return JSON.parse(JSON.stringify(x)); }
      var cron = (orc && orc.cronograma && typeof orc.cronograma === "object") ? orc.cronograma : {};
      var alvo = opts.alvo || (own(orc || {}, "_planoDaObra") ? "plano" : "orcamento");
      var out = { alvo: alvo, regua: alvo === "plano" ? "plano" : "1281", bytes: null, teto: TETO, excede: false, portas: [], porFuncao: this._porFuncao(cron) };
      if (!CB || !P || typeof CB.bytesPlano !== "function") { out.erro = "motor do planejamento não carregado"; return out; }
      if (alvo === "plano") {
        var pl = opts.plano || {};
        var iaAtual = CB.normalizarIaResumo(pl.iaResumo) || {};
        var obraId = String(pl.obraId || orc._planoDaObra || "obr_sonda000000000000");
        function medirPlano(cr, ia) {
          var rec = {}, k;
          for (k in pl) if (own(pl, k) && k !== "_conflitoDe") rec[k] = pl[k];
          if (!own(rec, "id")) { rec.id = "plano_" + obraId; rec.tipo = "plano"; rec.obraId = obraId; }
          if (!own(rec, "orcamentoId")) rec.orcamentoId = String((orc && orc.id) || "");
          if (!own(rec, "atualizadoEm")) { rec.iniciadoEm = rec.criadoEm = rec.atualizadoEm = "2026-01-01T00:00:00.000Z"; }
          if (!own(rec, "por")) rec.por = "Responsavel pela obra - planejamento - medicao - supervisao.";
          rec.cronograma = copia(cr);
          var ian = CB.normalizarIaResumo(ia);
          if (ian) rec.iaResumo = ian; else delete rec.iaResumo;
          ultimoRep = P.cortarMotivos(rec.cronograma, CB.opcoesCorte(ian, opts.cronOrc));
          rec.atualizadoEm = "2026-01-01T00:00:00.000Z";
          return CB.bytesPlano(rec);
        }
        var ultimoRep = null;
        /* quantas ligações e equipes têm a origem da IA guardada (o recado da porta (2)) */
        function nProv(cr) {
          var n = 0;
          [cr && cr.iaProv, cr && cr.sub && cr.sub.iaProv].forEach(function (m) { if (m && typeof m === "object" && !Array.isArray(m)) n += Object.keys(m).length; });
          return n;
        }
        out.bytes = medirPlano(cron, iaAtual);
        out.excede = out.bytes > TETO;
        if (!out.excede) return out;
        var ia1 = copia(iaAtual); ia1.texto = 1;
        var b1 = medirPlano(cron, ia1), rep1 = ultimoRep || {};
        if (!iaAtual.texto && b1 <= TETO) {
          out.portas.push({ id: "marca-ia", bytes: b1, libera: out.bytes - b1, aplica: ["marca-ia"], marcados: rep1.marcados || 0, soNoPlano: rep1.soNoPlano || 0 });
          return out;
        }
        var ia2 = copia(ia1); ia2.origem = 1;
        var b2 = medirPlano(cron, ia2);
        if (!iaAtual.origem && b2 <= TETO && b2 < b1) {
          out.portas.push({ id: "sem-origem-ia", bytes: b2, libera: out.bytes - b2, aplica: (iaAtual.texto ? [] : ["marca-ia"]).concat(["sem-origem-ia"]),
            marcados: rep1.marcados || 0, soNoPlano: rep1.soNoPlano || 0, ligacoes: nProv(cron) });
          return out;
        }
        var semSomb = !!(cron.mat && cron.mat.semSombra === true);
        if (!semSomb && typeof opts.comSemSombra === "function") {
          var c3 = null;
          try { c3 = opts.comSemSombra(copia(cron)); } catch (e3) { c3 = null; }
          if (c3) {
            var b3 = medirPlano(c3, ia2);
            if (b3 <= TETO) out.portas.push({ id: "sem-sombra", bytes: b3, libera: out.bytes - b3,
              aplica: (iaAtual.texto ? [] : ["marca-ia"]).concat(iaAtual.origem ? [] : ["sem-origem-ia"]).concat(["sem-sombra"]),
              marcados: rep1.marcados || 0, soNoPlano: rep1.soNoPlano || 0, ligacoes: nProv(cron) });
          }
        }
        return out;
      }
      /* ORÇAMENTO (não aprovado): pela régua da 1.2.81 — o plano que o
         `iniciarPlano` DELA montaria (O30; D31-c) */
      var semIni = !!(cron.mat && cron.mat.semIniciar1281 === 1);
      var obra = opts.obra || null;
      var m = semIni ? CB.medirIniciar(orc, obra, { regua: "nova", iaResumo: { texto: 1 } }) : CB.medirIniciar(orc, obra, { regua: "1281" });
      out.regua = semIni ? "nova" : "1281";
      if (m.erro) { out.erro = m.erro; return out; }
      out.bytes = m.bytes;
      out.excede = m.bytes > TETO;
      if (!out.excede) return out;
      /* EXCESSO ANTERIOR: sem os dados novos a régua da 1.2.81 já passa — a
         1.2.81 já não inicia esse plano, e não fomos nós que causamos isso.
         Não se recusa; declara-se `D-INICIAR-1281` pré-existente. */
      var sem = null;
      try { sem = typeof opts.semDadosNovos === "function" ? opts.semDadosNovos(orc) : self._orcSemDadosNovos(orc); } catch (eS) { sem = null; }
      var m81 = sem ? CB.medirIniciar(sem, obra, { regua: "1281" }) : null;
      out.base81 = m81 && !m81.erro ? m81.bytes : null;
      if (out.base81 != null && out.base81 > TETO) { out.preExistente = true; out.excede = false; out.excedeRegua = true; return out; }
      if (!semIni) {
        var mn = CB.medirIniciar(orc, obra, { regua: "nova", iaResumo: { texto: 1 } });
        if (!mn.erro && mn.cabe) out.portas.push({ id: "sem-iniciar1281", bytes: mn.bytes, libera: out.bytes - mn.bytes, aplica: ["sem-iniciar1281"] });
      }
      return out;
    },
    /* o orçamento SEM os dados novos (a medida do "excesso anterior"): cópia
       com a projeção desfeita e sem `rede`, `extras`, `cal` e `mat` */
    _orcSemDadosNovos: function (orc) {
      var c = {}, k;
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      var cr = JSON.parse(JSON.stringify(orc.cronograma || {}));
      this.desprojetar(cr, "gravacao");
      /* a sombra da REDE (os elos TT/IT/cruzados escritos como espera) também
         é dado novo: o nó com entrada em `rede` fica sem os mapas de sempre.
         Subestimar aqui só faz a recusa valer (o lado seguro); a medida do
         excesso anterior existe para o volume que a 1.2.81 já tinha. */
      var rd = cr.rede, sub = cr.sub && typeof cr.sub === "object" ? cr.sub : null;
      if (rd && typeof rd === "object") {
        Object.keys(rd.etapas || {}).forEach(function (id) { if (cr.predecessoras) delete cr.predecessoras[id]; if (cr.lags) delete cr.lags[id]; });
        Object.keys(rd.folhas || {}).forEach(function (id) { if (sub) { if (sub.predecessoras) delete sub.predecessoras[id]; if (sub.lags) delete sub.lags[id]; if (sub.tipos) delete sub.tipos[id]; } });
      }
      this.CHAVES_NOVAS_CRON.forEach(function (x) { delete cr[x]; });
      c.cronograma = cr;
      return c;
    },
    /* o que mais ocupa, POR FUNÇÃO (§1.10-5, [Ver o que ocupa espaço]) — em
       bytes UTF-8 do JSON de cada parte. "sombra" é o que esta versão escreveu
       para a versão anterior (as entradas `origem:"mat"` e o `mat`). */
    _porFuncao: function (cron) {
      var P = this._mod("CronoPlan");
      function b(x) { return (x === undefined || !P) ? 0 : P.bytes(x); }
      var sub = (cron && cron.sub && typeof cron.sub === "object") ? cron.sub : {};
      var sombraR = {};
      var rs = cron && cron.restricoes;
      if (rs && typeof rs === "object" && !Array.isArray(rs)) Object.keys(rs).forEach(function (k) { if (rs[k] && rs[k].origem === "mat") sombraR[k] = rs[k]; });
      var o = {
        rede: b(cron.rede), cal: b(cron.cal), extras: b(cron.extras),
        sombra: b(cron.mat) + (Object.keys(sombraR).length ? b(sombraR) : 0),
        textosIA: b(cron.iaMotivos) + b(sub.iaMotivos),
        origemIA: b(cron.iaProv) + b(sub.iaProv)
      };
      var tot = cron ? b(cron) : 0;
      o.mapas1281 = Math.max(0, tot - o.rede - o.cal - o.extras - o.sombra - o.textosIA - o.origemIA);
      return o;
    },

    /* As posições ABSOLUTAS da passada integrada no lugar da escala (espec
       §2.2, `mem.abs`): a subetapa cai no dia que a passada calculou ("exata"),
       com a folga interna dela. Devolve false (e a árvore escala como sempre)
       quando falta a posição de alguma folha — nunca meia árvore. */
    _absNaEscala: function (esc, abs, et) {
      void et;
      if (!abs || !esc || !esc.length) return false;
      for (var i = 0; i < esc.length; i++) if (!own(abs, esc[i].id)) return false;
      esc.forEach(function (it) {
        var a = abs[it.id];
        it.ini = a.iniO; it.fim = a.fimO; it.escala = "exata"; it.comprimida = false;
        it.folgaEsc = a.folgaInt != null ? a.folgaInt : 0;
      });
      return true;
    }
  };

  global.Cronograma = Cronograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Cronograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

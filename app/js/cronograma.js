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
    parsePreds: function (txt, ordemIds, selfId) {
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
    predsTexto: function (et, numPorId) {
      if (!et || !et.preds || !et.preds.length) return et && et.predsExplicito ? "0" : "";
      return et.preds.map(function (p) {
        var lag = et.predLag && et.predLag[p];
        return numPorId[p] + (lag != null ? (lag < 0 ? "-" + (-lag) : "+" + lag) : "");
      }).join(",");
    },

    _params: function (orc, p) {
      var d = {}, k;
      for (k in this.DEFAULTS) d[k] = this.DEFAULTS[k];
      if (orc && orc.cronograma && orc.cronograma.params) for (k in orc.cronograma.params) if (orc.cronograma.params[k] != null) d[k] = orc.cronograma.params[k];
      if (p) for (k in p) if (p[k] != null) d[k] = p[k];
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
    _redeInterna: function (fs, sub, parSub, semPiso, folhaDe, noDe) {
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
      var feito = {};
      ordem.forEach(function (id) {
        var f = porId[id], ini0 = 0;
        f.predsResolvidos = []; f.predDeslocRede = {};
        f.preds.forEach(function (pid) {
          var p = porId[pid], d = desloc(p, f);
          f.predDeslocRede[pid] = d;
          if (!feito[pid]) return;   // só dentro de ciclo: o elo de volta é ignorado
          f.predsResolvidos.push(pid);
          ini0 = Math.max(ini0, (f.predTipo[pid] === "II" ? p.ini : p.fim) + d);
        });
        f.ini = Math.max(0, ini0); f.fim = f.ini + f.dur; feito[id] = true;
      });
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
        if (!g.folhas.length) { alvo.push({ no: n, servicos: g.servicos }); }
        else {
          var fs = g.folhasRede, porFolha = {};
          var esc = fs.map(function (f) {
            var o = { id: f.id, iniInt: f.ini, fimInt: f.fim, folgaInt: f.folga, marco: f.marco, preds: f.predsResolvidos };
            porFolha[f.id] = o; return o;
          });
          self._escalar(esc, et.inicio, et.fim);
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
            if (fn.comprimida) comp.push(f.id);
            alvo.push({ no: fn, servicos: f.g.servicos });
          });
          n.vao = g.rede.S; n.comprimida = comp.length > 0;
          if (comp.length) avisos.push({ tipo: "comprimida", etapaId: n.id, folhas: comp,
            msg: "Etapa " + n.numero + " curta demais para as subetapas — " + comp.length + " de " + fs.length + " se sobrepõem no desenho (a rede pede " + g.rede.S + " dias; a etapa tem " + et.duracao + ")." });
          if (g.rede.temCiclo) avisos.push({ tipo: "ciclo", etapaId: n.id, folhas: g.rede.ciclo,
            msg: "Etapa " + n.numero + ": dependência circular entre subetapas — " + g.rede.ciclo.length + " subetapa(s) desenhada(s) ignorando o elo de volta. Corrija o \"Depende de\"." });
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
    materializar: function (orc, _opts) {
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
    materializarSeExec: function (orc) {
      var cron = orc && orc.cronograma, k;
      if (!cron || typeof cron !== "object") return null;
      if (!(cron.exec && cron.exec.rede === true)) {
        var ag = cron.duracoesAgente, marca = false;
        if (ag && typeof ag === "object") for (k in ag) if (own(ag, k) && ag[k] === "subetapas") { marca = true; break; }
        if (!marca) return null;
      }
      return this.materializar(orc);
    },

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
      if (!temExec && !temRestr && !temOpc) return orc;
      var c = {}, c2 = {};
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      for (k in cr) if (own(cr, k)) c2[k] = cr[k];
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
    parsePredsSub: function (txt, folhas, selfId) {
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
    predsTextoSub: function (no, numPorId) {
      if (!no || !no.preds || !no.preds.length) return no && no.predsExplicito ? "0" : "";
      return no.preds.map(function (p) {
        var lag = no.predLag && no.predLag[p], ii = !!(no.predTipo && no.predTipo[p] === "II");
        return (numPorId && numPorId[p] != null ? numPorId[p] : "?") + (ii ? "II" : "") + (lag != null ? (lag < 0 ? "-" + (-lag) : "+" + lag) : "");
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

    /* Estima o cronograma inteiro. Retorna etapas com duração/início/fim + datas.
       `ctx` (3º argumento, opcional) — ver o bloco CRONOGRAMA EXECUTIVO acima:
       só `ctx.eap === true` acrescenta `r.atividades` e `r.exec`, DEPOIS de o
       resultado de etapa estar pronto. Sem ele, nenhuma linha nova roda. */
    estimar: function (orc, override, ctx) {
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
          var et = porId[id], ini0 = 0;
          et.preds.forEach(function (pid) {
            if (!resolvido[pid]) return; // só dentro de ciclo: o elo de volta é ignorado
            var p = porId[pid]; ini0 = Math.max(ini0, p.fim + desloc(p, et));
          });
          // o início que a REDE pede, antes do piso — é o que o Gantt precisa para
          // recusar um arrasto para a esquerda dizendo de quem é a culpa
          if (redeOut) redeOut[id] = Math.max(0, ini0);
          if (piso && own(piso, id) && piso[id] > ini0) ini0 = piso[id];
          et.inicio = Math.max(0, ini0); et.fim = et.inicio + et.duracao; resolvido[id] = true;
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
      function dataDeIdx(k) { return cal ? cal.dia(k) : self.addDiasUteis(ini, k, params.diasUteisSemana, fer.mapa); }
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
        try { pleno = self.estimar(orc, ovPleno, null); } catch (ePl) { pleno = null; }
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
      if (ctx && ctx.eap === true) {
        try { self._arvore(orc, res, ctx, vivo, cong, cal, mem); }
        catch (errArv) {
          res.atividades = null;
          res.exec = { rede: false, paralelismoSub: 0, toleranciaPP: 1, detalhe: "etapa", avisos: [],
            erro: "Não consegui montar o cronograma por subetapas (" + String((errArv && errArv.message) || errArv) + "). O Gantt por etapa continua valendo." };
        }
      }
      return res;
    }
  };

  global.Cronograma = Cronograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Cronograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

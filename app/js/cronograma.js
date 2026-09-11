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
    DEFAULTS: {
      equipes: 1, diasUteisSemana: 5, custoDiaEquipe: 700, paralelismo: 0.15, dataInicio: null,
      descontarFeriados: true, feriadosFacultativos: true, feriadosExtras: null
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
      var nMax = Math.max(1, bal(r.dataFim) + 1), lista = [], i;
      var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      for (i = 0; i < nMax; i++) {
        var dRef = new Date(y0, m0 + i, 1);
        lista.push({ i: i, ano: dRef.getFullYear(), mes: dRef.getMonth(),
          rotulo: MES[dRef.getMonth()] + "/" + String(dRef.getFullYear()).slice(2),
          valor: 0, equipeDias: 0, diasUteis: 0, frentes: 0, etapas: [] });
      }
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

    /* Agrupa a árvore por etapa e roda a REDE INTERNA de cada etapa com
       folhas. `semPiso` = a mesma rede sem o arredondamento (duração
       fracionária, sem o mínimo de 1 dia) — é o que separa, no "antes →
       depois", o efeito da rede do efeito de arredondar cada subetapa. */
    _preparar: function (orc, params, nos, semPiso) {
      var self = this, cron = (orc && orc.cronograma) || {}, sub = (cron.sub && typeof cron.sub === "object") ? cron.sub : {};
      var subDur = sub.duracoes || {}, subMarco = sub.marcos || {}, subEq = sub.equipes || {}, subAg = sub.agente || {};
      var parSub = this._parSub(orc, params), eqPadrao = num(params && params.equipes) > 0 ? num(params.equipes) : 1;
      var grupos = [], gE = null, gF = null, infos = [];
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
        g.rede = self._redeInterna(g.folhasRede, sub, parSub, semPiso);
      });
      return { grupos: grupos, infos: infos, parSub: parSub };
    },

    /* CPM entre as folhas de UMA etapa — o mesmo algoritmo da rede externa
       (ida por Kahn, volta, folga), com um tipo a mais: "II" (início-início,
       `ini_s ≥ ini_p + lag`). Padrão = cascata (cada folha depois da anterior
       da etapa), com sobreposição `floor(paralelismoSub × dur_anterior)`.
       Elo para folha de OUTRA etapa, apagada ou para si mesma morre calado
       (não há elo entre folhas de etapas diferentes — o elo macro é da etapa).
       ⚠ Ciclo NÃO trava: quem sobra entra em ordem de lista ignorando o elo
       não resolvido, sai `cicloDep` e a tela avisa. */
    _redeInterna: function (fs, sub, parSub, semPiso) {
      var porId = {}, pc = sub.predecessoras || {}, lc = sub.lags || {}, tc = sub.tipos || {};
      fs.forEach(function (f) { porId[f.id] = f; });
      fs.forEach(function (f, i) {
        var cfg = own(pc, f.id) ? pc[f.id] : null, out = [], k;
        f.predsExplicito = Object.prototype.toString.call(cfg) === "[object Array]";
        if (f.predsExplicito) {
          for (k = 0; k < cfg.length; k++) if (cfg[k] !== f.id && own(porId, cfg[k]) && out.indexOf(cfg[k]) < 0) out.push(cfg[k]);
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
      return { S: S, temCiclo: ciclo.length > 0, ciclo: ciclo };
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
    },

    /* Monta `r.atividades` e `r.exec` (só com ctx.eap). Lê `r` e nunca o
       reescreve: etapa, total e datas de etapa ficam os do caminho de sempre.
       `vivo` = o `_vaosExec` que o próprio `estimar` usou para a duração das
       etapas (null com o modo desligado) — o aviso compara com ELE, nunca com
       uma segunda conta do vão. */
    _arvore: function (orc, r, ctx, vivo) {
      var self = this, params = r.params, cron = (orc && orc.cronograma) || {}, ex = cron.exec || {};
      var agEt = cron.duracoesAgente || {}, durEt = cron.duracoes || {}, rede = ex.rede === true;
      var nos = this.eap(orc, ctx.calc), P = this._preparar(orc, params, nos, false), cal = this.calendario(r);
      var avisos = [];
      var V = ctx.valores ? (ctx.valores.porId || ctx.valores) : null;
      if (ctx.valores && ctx.valores.ok === false) {
        V = null;
        avisos.push({ tipo: "valores", msg: "Valor de venda por subetapa indisponível" + (ctx.valores.motivo ? " (" + ctx.valores.motivo + ")" : "") + " — a coluna de valor fica em branco; custo direto não é mostrado no lugar." });
      }
      function dataDe(k) { return (k == null || !cal) ? null : cal.dia(k); }
      function copia(o) { var c = {}; for (var k in o) if (own(o, k)) c[k] = o[k]; return c; }
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
          if (rede && !et.marco) {
            /* o vão da MESMA conta que deu a duração da etapa acima (params
               GRAVADOS, sem override — é o que o materializar grava); só sem
               `vivo` (a conta ao vivo falhou) cai no desta árvore */
            var x0 = vivo && vivo.grupos[gi], S0 = x0 ? x0.bruto : g.rede.S;
            /* ⚠ o número do recado é o GRAVADO em `duracoes`, nunca `et.duracao`:
               com o cálculo ao vivo (A1) `et.duracao` já é o vão, e o recado
               sairia "a duração gravada (12 dias) não é a das subetapas (12)" */
            var grav = own(durEt, n.id) && num(durEt[n.id]) > 0 ? num(durEt[n.id]) : null;
            if (!(S0 > 0)) avisos.push({ tipo: "sem-vao", etapaId: n.id,
              msg: "Etapa " + n.numero + ": todas as subetapas são marco — a duração da etapa não vem delas." });
            else if (!(own(agEt, n.id) && agEt[n.id] === "subetapas" && num(durEt[n.id]) === S0))
              avisos.push({ tipo: "nao-materializado", etapaId: n.id, duracao: grav, vao: S0,
                msg: "Etapa " + n.numero + ": a duração gravada no orçamento (" + (grav != null ? grav + " dias" : "nenhuma") +
                  ") não é a das subetapas (" + S0 + " dias). Esta tela já usa " + S0 +
                  "; salve o orçamento para que aparelhos com versão anterior do app vejam o mesmo prazo." });
          }
        }
        alvo.forEach(function (a) { self._distribuir(a.no, a.servicos, nos, P.infos, P.parSub, dataDe); });
      });
      var tot = 0;
      if (V) nos.forEach(function (n) { if (n.tipo === "etapa" && own(V, n.id) && V[n.id] != null) tot += num(V[n.id]); });
      nos.forEach(function (n) {
        n.valor = (V && own(V, n.id) && V[n.id] != null) ? num(V[n.id]) : null;
        n.peso = (n.valor != null && tot > 0) ? (n.valor / tot) * 100 : null;
      });
      r.atividades = nos;
      r.exec = { rede: rede, paralelismoSub: P.parSub, toleranciaPP: num(ex.toleranciaPP) > 0 ? num(ex.toleranciaPP) : 1,
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
    _vaosExec: function (orc, semPiso) {
      var cron = orc && orc.cronograma;
      if (!cron || typeof cron !== "object" || !cron.exec || cron.exec.rede !== true) return null;
      var P = this._preparar(orc, this._params(orc), this.eap(orc), !!semPiso);
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
       Não toca no orçamento (cópia rasa só do caminho até `exec`). */
    estimarVersaoAnterior: function (orc, override) {
      var cr = orc && orc.cronograma;
      if (!cr || typeof cr !== "object" || !cr.exec || cr.exec.rede !== true) return this.estimar(orc, override);
      var c = {}, c2 = {}, ex = {}, k;
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      for (k in cr) if (own(cr, k)) c2[k] = cr[k];
      for (k in cr.exec) if (own(cr.exec, k)) ex[k] = cr.exec[k];
      ex.rede = false; c2.exec = ex; c.cronograma = c2;
      return this.estimar(c, override);
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
        var m = self.materializar(c, { semPiso: semPiso });
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
      return { texto: m[0], numero: n, unidade: unidade, qualificador: qual, cronograma: { diasUteis: r.totalDias, corridos: corridos, semanas: r.totalSemanas, meses: meses },
        difere: difere, ambiguo: ambiguo,
        msg: difere ? "O texto da proposta diz \"" + m[0] + "\"; o cronograma passa a dar " + dois + "."
          : (ambiguo ? "O texto da proposta diz \"" + m[0] + "\" sem dizer se são úteis ou corridos; o cronograma dá " + dois +
            ". Escreva \"dias úteis\" ou \"dias corridos\" no prazo da proposta." : null) };
    },

    /* "Limpar edições" (cronReset) em função pura: zera as edições de etapa E
       de folha (`sub.*`), mantém `params` e `exec` (são parâmetros, não
       edições) e rematerializa — sem isto o recado "voltaram à estimativa do
       agente" mentia: a duração "subetapas" e a rede interna continuavam. */
    limparEdicoes: function (orc) {
      if (!orc) return null;
      var c = orc.cronograma;
      if (c && typeof c === "object") {
        c.duracoes = {}; c.iaMotivos = {}; c.duracoesAgente = {}; c.predecessoras = {}; c.lags = {}; c.marcos = {};
        c.sub = {};
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
      var nMax = Math.max(1, bal(r.dataFim) + 1), lista = [], i;
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
      var vivo = null, agVivo = null;
      if (orc.cronograma && orc.cronograma.exec && orc.cronograma.exec.rede === true) {
        try { vivo = self._vaosExec(orc); } catch (eVivo) { vivo = null; }
        agVivo = (orc.cronograma.duracoesAgente && typeof orc.cronograma.duracoesAgente === "object") ? orc.cronograma.duracoesAgente : {};
      }
      // Marco = etapa de duração ZERO (entrega, vistoria, liberação). Vive num
      // mapa próprio porque um 0 em `duracoes` já significa "não estimável, cai
      // no cálculo" (ver abaixo) — reaproveitar o 0 confundiria os dois.
      var marcos = (orc.cronograma && orc.cronograma.marcos) || {};
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
        return { id: e.id, codigo: e.codigo, nome: e.nome, categoria: catPred, categoriaNome: catO.nome, cor: catO.cor, custo: custo, equipeDias: Math.round(ed * 10) / 10, duracao: dur, editado: temOverride, marco: marco };
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
      etapas.forEach(function (et, i) {
        var cfg = predsCfg[et.id], out = [], k, lagEt = lagsCfg[et.id] || {};
        et.predsExplicito = Object.prototype.toString.call(cfg) === "[object Array]";
        if (et.predsExplicito) {
          for (k = 0; k < cfg.length; k++) if (cfg[k] !== et.id && porId[cfg[k]] && out.indexOf(cfg[k]) < 0) out.push(cfg[k]);
        } else if (i > 0) out.push(etapas[i - 1].id);
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
      var resolvido = {};
      ordem.forEach(function (id) {
        var et = porId[id], ini0 = 0;
        et.preds.forEach(function (pid) {
          if (!resolvido[pid]) return; // só dentro de ciclo: o elo de volta é ignorado
          var p = porId[pid]; ini0 = Math.max(ini0, p.fim + desloc(p, et));
        });
        et.inicio = Math.max(0, ini0); et.fim = et.inicio + et.duracao; resolvido[id] = true;
      });
      var totalDias = etapas.reduce(function (m, e) { return Math.max(m, e.fim); }, 0);
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
      var ini = params.dataInicio ? new Date(params.dataInicio + (String(params.dataInicio).length <= 10 ? "T00:00:00" : "")) : new Date();
      var fer = self._feriadosDe(params, ini, totalDias);
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
      etapas.forEach(function (et) {
        et.dataInicio = self.addDiasUteis(ini, et.inicio, params.diasUteisSemana, fer.mapa);
        et.dataFim = self.addDiasUteis(ini, et.fim, params.diasUteisSemana, fer.mapa);
        et.dataLimite = et.folga ? self.addDiasUteis(ini, et.fim + et.folga, params.diasUteisSemana, fer.mapa) : et.dataFim;
      });
      var dataFim = self.addDiasUteis(ini, totalDias, params.diasUteisSemana, fer.mapa);
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
      /* ⚠ A árvore do cronograma executivo entra DEPOIS, só com `ctx.eap`, e
         só LÊ `res` (nunca reescreve etapa, data ou total). O try é a guarda do
         I1: um defeito na árvore nova não pode derrubar o Gantt de etapas que a
         aba já desenhava — a tela recebe `exec.erro` e diz que não conseguiu,
         em vez de sumir com o cronograma inteiro. */
      if (ctx && ctx.eap === true) {
        try { self._arvore(orc, res, ctx, vivo); }
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

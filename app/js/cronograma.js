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

    // Estima o cronograma inteiro. Retorna etapas com duração/início/fim + datas.
    estimar: function (orc, override) {
      var params = this._params(orc, override), self = this;
      var manual = (orc.cronograma && orc.cronograma.duracoes) || {};
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
        var temOverride = manual[e.id] != null && num(manual[e.id]) > 0;
        var marco = marcos[e.id] === true;
        var dur = marco ? 0 : (temOverride ? num(manual[e.id]) : Math.max(1, Math.ceil(ed / (params.equipes || 1))));
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
      return {
        etapas: etapas, totalDias: totalDias,
        totalSemanas: Math.max(1, Math.ceil(totalDias / (params.diasUteisSemana || 5))),
        dataInicio: ini, dataFim: dataFim, params: params,
        caminhoCritico: etapas.filter(function (e) { return e.critico; }).map(function (e) { return e.id; }),
        temCiclo: temCiclo,
        feriados: { mapa: fer.mapa, lista: fer.lista, noPeriodo: noPeriodo, invalidos: fer.invalidos, ajusteInicio: ajusteInicio }
      };
    }
  };

  global.Cronograma = Cronograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Cronograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

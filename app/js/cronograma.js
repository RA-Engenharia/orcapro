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
    DEFAULTS: { equipes: 1, diasUteisSemana: 5, custoDiaEquipe: 700, paralelismo: 0.15, dataInicio: null },

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
       Token inválido (nº fora da lista, auto-referência, texto) sai em
       `invalidos` e NUNCA vira []: gravar "sem predecessora" no lugar de um
       erro de digitação mudaria o cronograma em silêncio. */
    parsePreds: function (txt, ordemIds, selfId) {
      var s = String(txt == null ? "" : txt).trim();
      if (!s) return { preds: null, invalidos: [] };
      if (s === "0" || s === "-") return { preds: [], invalidos: [] };
      var preds = [], invalidos = [];
      s.split(/[,;\s]+/).forEach(function (tk) {
        if (!tk) return;
        var n = /^\d+$/.test(tk) ? parseInt(tk, 10) : 0;
        var id = (n >= 1 && n <= ordemIds.length) ? ordemIds[n - 1] : null;
        if (!id || id === selfId) invalidos.push(tk);
        else if (preds.indexOf(id) < 0) preds.push(id);
      });
      return { preds: preds.length ? preds : null, invalidos: invalidos };
    },

    _params: function (orc, p) {
      var d = {}, k;
      for (k in this.DEFAULTS) d[k] = this.DEFAULTS[k];
      if (orc && orc.cronograma && orc.cronograma.params) for (k in orc.cronograma.params) if (orc.cronograma.params[k] != null) d[k] = orc.cronograma.params[k];
      if (p) for (k in p) if (p[k] != null) d[k] = p[k];
      return d;
    },

    addDiasUteis: function (start, n, diasSemana) {
      diasSemana = diasSemana || 5;
      var d = new Date(start.getTime()), add = 0;
      while (add < n) { d.setDate(d.getDate() + 1); var wd = d.getDay(); if (diasSemana >= 7) add++; else if (diasSemana === 6) { if (wd !== 0) add++; } else { if (wd !== 0 && wd !== 6) add++; } }
      return d;
    },

    // Estima o cronograma inteiro. Retorna etapas com duração/início/fim + datas.
    estimar: function (orc, override) {
      var params = this._params(orc, override), self = this;
      var manual = (orc.cronograma && orc.cronograma.duracoes) || {};
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
        var dur = temOverride ? num(manual[e.id]) : Math.max(1, Math.ceil(ed / (params.equipes || 1)));
        return { id: e.id, codigo: e.codigo, nome: e.nome, categoria: catPred, categoriaNome: catO.nome, cor: catO.cor, custo: custo, equipeDias: Math.round(ed * 10) / 10, duracao: dur, editado: temOverride };
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
      var porId = {};
      etapas.forEach(function (et) { porId[et.id] = et; });
      etapas.forEach(function (et, i) {
        var cfg = predsCfg[et.id], out = [], k;
        if (Object.prototype.toString.call(cfg) === "[object Array]") {
          for (k = 0; k < cfg.length; k++) if (cfg[k] !== et.id && porId[cfg[k]] && out.indexOf(cfg[k]) < 0) out.push(cfg[k]);
        } else if (i > 0) out.push(etapas[i - 1].id);
        et.preds = out;
      });
      function sobre(p) { return Math.floor((params.paralelismo || 0) * p.duracao); }
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
          var p = porId[pid]; ini0 = Math.max(ini0, p.fim - sobre(p));
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
          lf = Math.min(lf, sv.inicio + sv.folga + sobre(etv));
        });
        etv.folga = Math.max(0, lf - etv.fim);
        etv.critico = etv.folga === 0;
      }
      var ini = params.dataInicio ? new Date(params.dataInicio + (String(params.dataInicio).length <= 10 ? "T00:00:00" : "")) : new Date();
      etapas.forEach(function (et) {
        et.dataInicio = self.addDiasUteis(ini, et.inicio, params.diasUteisSemana);
        et.dataFim = self.addDiasUteis(ini, et.fim, params.diasUteisSemana);
        et.dataLimite = et.folga ? self.addDiasUteis(ini, et.fim + et.folga, params.diasUteisSemana) : et.dataFim;
      });
      return {
        etapas: etapas, totalDias: totalDias,
        totalSemanas: Math.max(1, Math.ceil(totalDias / (params.diasUteisSemana || 5))),
        dataInicio: ini, dataFim: self.addDiasUteis(ini, totalDias, params.diasUteisSemana), params: params,
        caminhoCritico: etapas.filter(function (e) { return e.critico; }).map(function (e) { return e.id; }),
        temCiclo: temCiclo
      };
    }
  };

  global.Cronograma = Cronograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Cronograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

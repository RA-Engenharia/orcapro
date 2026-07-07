/* =====================================================================
 * bim4d.js — Motor 4D do BIM (PURO, sem DOM/Three): liga cada elemento IFC
 * a uma ETAPA da obra (via categoria de serviço do Cronograma) e a uma
 * JANELA no tempo, para o timeline 4D revelar/colorir a construção.
 *
 * Contrato viewer-agnóstico: recebe elementos [{id, tipo}] (tipo = string do
 * tipo IFC, ex. "IFCCOLUMN") + opcionalmente o cronograma (Cronograma.estimar).
 * Não depende de Three.js nem do web-ifc — o viewer (js/bim.js) só consome
 * o plano que este motor devolve. Node-testável.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Mapa tipo IFC → categoria de serviço (mesmos ids do Cronograma.CATS)
  var TIPO_CAT = {
    IFCFOOTING: "fundacao", IFCPILE: "fundacao", IFCPILECAP: "fundacao",
    IFCCOLUMN: "estrutura", IFCBEAM: "estrutura", IFCSLAB: "estrutura",
    IFCMEMBER: "estrutura", IFCPLATE: "estrutura", IFCREINFORCINGBAR: "estrutura", IFCREINFORCINGELEMENT: "estrutura",
    IFCWALL: "alvenaria", IFCWALLSTANDARDCASE: "alvenaria", IFCCURTAINWALL: "alvenaria",
    IFCROOF: "cobertura",
    IFCCOVERING: "revestimento",
    IFCFLOWSEGMENT: "instalacoes", IFCPIPESEGMENT: "instalacoes", IFCDUCTSEGMENT: "instalacoes",
    IFCCABLECARRIERSEGMENT: "instalacoes", IFCFLOWFITTING: "instalacoes", IFCFLOWTERMINAL: "instalacoes",
    IFCWINDOW: "esquadrias", IFCDOOR: "esquadrias", IFCRAILING: "esquadrias",
    IFCSTAIR: "estrutura", IFCSTAIRFLIGHT: "estrutura", IFCRAMP: "estrutura"
    // IFCSPACE / IFCBUILDINGELEMENTPROXY → sem categoria física (fallback)
  };

  // Ordem canônica de execução (fallback quando não há cronograma casando)
  var SEQUENCIA = ["preliminares", "demolicao", "terraplenagem", "fundacao", "estrutura",
    "alvenaria", "cobertura", "impermeabilizacao", "instalacoes", "revestimento",
    "esquadrias", "loucas", "pintura", "limpeza"];

  var NOME_CAT = {
    preliminares: "Preliminares", demolicao: "Demolição", terraplenagem: "Mov. de terra",
    fundacao: "Fundação", estrutura: "Estrutura", alvenaria: "Alvenaria", cobertura: "Cobertura",
    impermeabilizacao: "Impermeabilização", instalacoes: "Instalações", revestimento: "Revestimentos",
    esquadrias: "Esquadrias", loucas: "Louças/Metais", pintura: "Pintura", limpeza: "Limpeza",
    outros: "Outros"
  };
  var COR_CAT = {
    preliminares: "#64748b", fundacao: "#7c3aed", estrutura: "#2563eb", alvenaria: "#dc2626",
    cobertura: "#0891b2", instalacoes: "#ca8a04", revestimento: "#16a34a", esquadrias: "#db2777",
    pintura: "#f59e0b", limpeza: "#22c55e", outros: "#94a3b8"
  };

  function num(x) { var n = parseFloat(x); return isNaN(n) ? 0 : n; }
  function normKey(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
  function Util_arr(a) { return (a && a.length) ? a : []; }

  var BIM4D = {
    TIPO_CAT: TIPO_CAT, SEQUENCIA: SEQUENCIA,
    nomeCat: function (id) { return NOME_CAT[id] || id || "Outros"; },
    corCat: function (id) { return COR_CAT[id] || "#94a3b8"; },

    // Categoria de serviço a partir do tipo IFC (case-insensitive, com/sem prefixo IFC).
    catDoTipo: function (tipo) {
      if (!tipo) return "outros";
      var t = String(tipo).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (t.indexOf("IFC") !== 0) t = "IFC" + t;
      return TIPO_CAT[t] || "outros";
    },

    // Monta as FASES (janelas de tempo em semanas) a partir do cronograma real
    // ou, na ausência, distribui as categorias presentes na sequência canônica.
    // etapasCrono = Cronograma.estimar(orc).etapas (cada uma tem categoria/inicio/fim em semanas).
    _fases: function (catsPresentes, etapasCrono) {
      var fases = {}; // cat -> {inicio, fim}
      var i, e;
      // 1) do cronograma: pega a janela agregada por categoria
      if (etapasCrono && etapasCrono.length) {
        for (i = 0; i < etapasCrono.length; i++) {
          e = etapasCrono[i];
          var c = e.categoria || "outros";
          if (!fases[c]) fases[c] = { inicio: num(e.inicio), fim: num(e.fim) };
          else { fases[c].inicio = Math.min(fases[c].inicio, num(e.inicio)); fases[c].fim = Math.max(fases[c].fim, num(e.fim)); }
        }
      }
      // 2) categorias do IFC sem etapa no cronograma → encaixa na sequência canônica
      var faltantes = catsPresentes.filter(function (c) { return !fases[c]; });
      if (faltantes.length) {
        // duração-base: média das fases do cronograma, ou 2 semanas
        var durs = [], k;
        for (k in fases) if (fases.hasOwnProperty(k)) durs.push(fases[k].fim - fases[k].inicio);
        var durBase = durs.length ? (durs.reduce(function (s, d) { return s + d; }, 0) / durs.length) : 2;
        if (!(durBase > 0)) durBase = 2;
        // ordena TODAS as categorias (as com fase + as faltantes) pela sequência canônica
        var todas = {}, c2;
        for (c2 in fases) if (fases.hasOwnProperty(c2)) todas[c2] = 1;
        faltantes.forEach(function (c) { todas[c] = 1; });
        var ordenadas = Object.keys(todas).sort(function (a, b) {
          var ia = SEQUENCIA.indexOf(a), ib = SEQUENCIA.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        // reposiciona em cascata garantindo que faltantes tenham janela coerente com a vizinhança
        var cursor = 0;
        ordenadas.forEach(function (c) {
          if (fases[c]) { cursor = Math.max(cursor, fases[c].fim); }
          else { fases[c] = { inicio: cursor, fim: cursor + durBase }; cursor += durBase; }
        });
      }
      return fases;
    },

    // Plano 4D: cada elemento ganha categoria + janela (semInicio/semFim).
    // PRIORIDADE: se o elemento traz `etapa` (property OrcaPRO_Etapa do exportador pyRevit),
    // casa direto com a etapa do cronograma (EXATO) — código/nome/id/categoria. Senão, cai no
    // mapa de tipos (catDoTipo). Carrega `codOrc` (OrcaPRO_CodOrc) p/ o 5D (custo por elemento).
    // Retorna { elementos:[{id,tipo,cat,codOrc,exato,semInicio,semFim}], semanas, fases:[...] }.
    planejar: function (elementos, etapasCrono) {
      elementos = elementos || [];
      var idxEtapa = {}; // chave normalizada (código/nome/id/categoria) -> etapa do cronograma
      Util_arr(etapasCrono).forEach(function (e) {
        [e.codigo, e.nome, e.id, e.categoria].forEach(function (kk) { if (kk != null && kk !== "") idxEtapa[normKey(kk)] = e; });
      });
      // fallback por tipo só p/ elementos SEM etapa carimbada (ou carimbo que não casa)
      var catsFallback = {};
      elementos.forEach(function (el) { if (!(el.etapa && idxEtapa[normKey(el.etapa)])) catsFallback[BIM4D.catDoTipo(el.tipo)] = 1; });
      var fasesCat = BIM4D._fases(Object.keys(catsFallback), etapasCrono);
      var semanas = 0, k;
      for (k in fasesCat) if (fasesCat.hasOwnProperty(k)) semanas = Math.max(semanas, fasesCat[k].fim);
      Util_arr(etapasCrono).forEach(function (e) { semanas = Math.max(semanas, num(e.fim)); });
      if (!(semanas > 0)) semanas = 1;
      var agg = {}; // cat -> {inicio,fim,qtd}
      var out = elementos.map(function (el) {
        var e = el.etapa ? idxEtapa[normKey(el.etapa)] : null, cat, ini, fim, exato = false;
        if (e) { cat = e.categoria || BIM4D.catDoTipo(el.tipo); ini = num(e.inicio); fim = num(e.fim); exato = true; }
        else { cat = BIM4D.catDoTipo(el.tipo); var f = fasesCat[cat] || { inicio: 0, fim: semanas }; ini = f.inicio; fim = f.fim; }
        if (!agg[cat]) agg[cat] = { inicio: ini, fim: fim, qtd: 0 };
        else { agg[cat].inicio = Math.min(agg[cat].inicio, ini); agg[cat].fim = Math.max(agg[cat].fim, fim); }
        agg[cat].qtd++;
        return { id: el.id, tipo: el.tipo, cat: cat, codOrc: el.codOrc || "", exato: exato, semInicio: ini, semFim: fim };
      });
      var resumoFases = Object.keys(agg).map(function (c) {
        return { cat: c, nome: BIM4D.nomeCat(c), cor: BIM4D.corCat(c), inicio: agg[c].inicio, fim: agg[c].fim, qtd: agg[c].qtd };
      }).sort(function (a, b) { return a.inicio - b.inicio || a.fim - b.fim; });
      // 5D-lite: custo por etapa do cronograma (quando há orçamento vinculado) → curva físico-financeira
      var custoFases = Util_arr(etapasCrono).map(function (e) { return { inicio: num(e.inicio), fim: num(e.fim), custo: num(e.custo) }; });
      var custoTotal = custoFases.reduce(function (s, f) { return s + f.custo; }, 0);
      return { elementos: out, semanas: semanas, fases: resumoFases, custoFases: custoFases, custoTotal: custoTotal };
    },
    // 5D-lite: custo ACUMULADO na semana W (etapas concluídas = custo cheio; em andamento = proporcional
    // ao tempo decorrido na janela). Base = custo por etapa do Cronograma; 0 se não há orçamento vinculado.
    custoEm: function (plano, semana) {
      var t = 0;
      Util_arr(plano && plano.custoFases).forEach(function (f) {
        if (semana >= f.fim) t += f.custo;
        else if (semana > f.inicio && f.fim > f.inicio) t += f.custo * (semana - f.inicio) / (f.fim - f.inicio);
      });
      return t;
    },

    // Estado da obra numa dada SEMANA (para o slider): construído / em andamento / futuro.
    estadoEm: function (plano, semana) {
      var construidos = [], emAndamento = [], futuros = [];
      (plano.elementos || []).forEach(function (el) {
        if (semana >= el.semFim) construidos.push(el.id);
        else if (semana >= el.semInicio) emAndamento.push(el.id);
        else futuros.push(el.id);
      });
      return { construidos: construidos, emAndamento: emAndamento, futuros: futuros };
    },

    // % de avanço físico (por nº de elementos concluídos) numa semana — para KPI/curva.
    avancoEm: function (plano, semana) {
      var tot = (plano.elementos || []).length; if (!tot) return 0;
      var st = BIM4D.estadoEm(plano, semana);
      return Math.round(st.construidos.length / tot * 1000) / 10;
    },
    // Curva S: avanço FÍSICO (% elementos) e FINANCEIRO (% custo) semana a semana. financeiro=null sem custo.
    curva: function (plano) {
      var n = Math.max(1, (plano && plano.semanas) || 1), fis = [], fin = [], temCusto = plano && plano.custoTotal > 0;
      for (var w = 0; w <= n; w++) {
        fis.push(BIM4D.avancoEm(plano, w));
        fin.push(temCusto ? Math.round(BIM4D.custoEm(plano, w) / plano.custoTotal * 1000) / 10 : null);
      }
      return { semanas: n, fisico: fis, financeiro: fin, temCusto: !!temCusto };
    }
  };

  global.BIM4D = BIM4D;
  if (typeof module !== "undefined" && module.exports) module.exports = BIM4D;
})(typeof window !== "undefined" ? window : this);

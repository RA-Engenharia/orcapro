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
      // Índices SEPARADOS por campo (evita colisão silenciosa de last-write-wins entre etapas).
      // Casamento do carimbo por PRIORIDADE: código > nome > id (identificadores 1:1, com guard
      // `if(!idx[k])` = first-write-wins dentro do campo). A CATEGORIA é many-to-1 → tratada à
      // parte: um carimbo de categoria usa a JANELA AGREGADA da categoria (fasesCat), não uma
      // etapa isolada. Assim 'Alvenaria' (2 etapas) vira {min início, max fim}, não uma só.
      var idxCod = {}, idxNome = {}, idxId = {}, catsCrono = {};
      Util_arr(etapasCrono).forEach(function (e) {
        var kc = normKey(e.codigo), kn = normKey(e.nome), ki = normKey(e.id);
        if (kc && !idxCod[kc]) idxCod[kc] = e;
        if (kn && !idxNome[kn]) idxNome[kn] = e;
        if (ki && !idxId[ki]) idxId[ki] = e;
        if (e.categoria != null && e.categoria !== "") catsCrono[normKey(e.categoria)] = e.categoria;
      });
      // resolve carimbo -> { e: etapa|null, cat: categoria|null }. e=null + cat!=null = casou só
      // por categoria (usa janela agregada). null = não casou nada (cai no fallback por tipo).
      function casa(stamp) {
        var k = normKey(stamp); if (!k) return null;
        var e = idxCod[k] || idxNome[k] || idxId[k];
        if (e) return { e: e, cat: e.categoria || null };
        if (catsCrono[k]) return { e: null, cat: catsCrono[k] };
        return null;
      }
      // categorias que precisam de janela: fallback por tipo (sem carimbo/carimbo que não casa)
      // + carimbos que casaram só por categoria.
      var catsFallback = {};
      elementos.forEach(function (el) {
        var m = el.etapa ? casa(el.etapa) : null;
        if (!m) catsFallback[BIM4D.catDoTipo(el.tipo)] = 1;
        else if (!m.e && m.cat) catsFallback[m.cat] = 1;
        // reforma: quem vai ser demolido precisa de uma janela de demolição na timeline
        if (String(el.fase || "").toLowerCase() === "demolir") catsFallback.demolicao = 1;
      });
      var fasesCat = BIM4D._fases(Object.keys(catsFallback), etapasCrono);
      var semanas = 0, k;
      for (k in fasesCat) if (fasesCat.hasOwnProperty(k)) semanas = Math.max(semanas, fasesCat[k].fim);
      Util_arr(etapasCrono).forEach(function (e) { semanas = Math.max(semanas, num(e.fim)); });
      if (!(semanas > 0)) semanas = 1;
      var agg = {}; // cat -> {inicio,fim,qtd}
      var out = elementos.map(function (el) {
        var m = el.etapa ? casa(el.etapa) : null, cat, ini, fim, exato = false, f;
        if (m && m.e) { cat = m.e.categoria || BIM4D.catDoTipo(el.tipo); ini = num(m.e.inicio); fim = num(m.e.fim); exato = true; }
        else if (m && m.cat) { cat = m.cat; f = fasesCat[cat] || { inicio: 0, fim: semanas }; ini = f.inicio; fim = f.fim; exato = true; }
        else { cat = BIM4D.catDoTipo(el.tipo); f = fasesCat[cat] || { inicio: 0, fim: semanas }; ini = f.inicio; fim = f.fim; }
        // reforma (OrcaPRO_Fase): existente já está de pé (visível desde a semana 0);
        // demolir usa a janela da demolição e SOME depois dela (estadoEm inverte a semântica)
        var fase = String(el.fase || "").toLowerCase();
        if (fase === "existente") { ini = 0; fim = 0; }
        else if (fase === "demolir" || fase === "demolicao") { fase = "demolir"; f = fasesCat.demolicao || { inicio: 0, fim: 1 }; ini = f.inicio; fim = f.fim; }
        if (!agg[cat]) agg[cat] = { inicio: ini, fim: fim, qtd: 0 };
        else { agg[cat].inicio = Math.min(agg[cat].inicio, ini); agg[cat].fim = Math.max(agg[cat].fim, fim); }
        agg[cat].qtd++;
        return { id: el.id, tipo: el.tipo, cat: cat, codOrc: el.codOrc || "", exato: exato, fase: fase || null, semInicio: ini, semFim: fim };
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
    // Reforma: 'demolir' INVERTE — em pé no início, âmbar durante a demolição, some (futuros) depois.
    estadoEm: function (plano, semana) {
      var construidos = [], emAndamento = [], futuros = [];
      (plano.elementos || []).forEach(function (el) {
        if (el.fase === "demolir") {
          if (semana >= el.semFim) futuros.push(el.id);          // demolido: some da cena
          else if (semana >= el.semInicio) emAndamento.push(el.id);
          else construidos.push(el.id);                           // ainda de pé
          return;
        }
        if (semana >= el.semFim) construidos.push(el.id);
        else if (semana >= el.semInicio) emAndamento.push(el.id);
        else futuros.push(el.id);
      });
      return { construidos: construidos, emAndamento: emAndamento, futuros: futuros };
    },

    // % de avanço físico (por nº de elementos concluídos) numa semana — para KPI/curva.
    // Existente (reforma) fica FORA do denominador: não é trabalho da obra. Demolir conta
    // como trabalho feito quando a demolição termina (mesmo comparador semana>=semFim).
    avancoEm: function (plano, semana) {
      var els = (plano.elementos || []).filter(function (e) { return e.fase !== "existente"; });
      var tot = els.length; if (!tot) return 0;
      var done = 0;
      els.forEach(function (e) { if (semana >= e.semFim) done++; });
      return Math.round(done / tot * 1000) / 10;
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

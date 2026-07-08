/* =====================================================================
 * lastplanner.js — Last Planner System (PPC) — MOTOR PURO (sem DOM).
 * Planejamento enxuto (Lean Construction): o médio prazo (Lookahead)
 * remove RESTRIÇÕES; só tarefa livre de restrição pode ser COMPROMETIDA
 * na semana; no fim da semana mede-se o PPC (% do plano concluído) e
 * registram-se as CAUSAS de não-cumprimento pra melhoria contínua.
 *
 * Modelo (por obra, persistido em raerp:lastplanner:<obraId>):
 *   { obraId, tarefas:[ {
 *       id, titulo, responsavel, frente,
 *       semana: "YYYY-MM-DD" (a SEGUNDA da semana — chave única),
 *       comprometida: bool,                       // entrou no Plano da Semana
 *       status: "afazer"|"feito"|"naofeito",
 *       causa: "" (categoria, quando naofeito),
 *       restricoes: [ { id, tipo, descricao, responsavel, prazo, removida:bool } ],
 *       criadoEm, atualizadoEm
 *   } ] }
 *
 * Node-testável. Sem inventar nada: PPC e causas saem só do que foi lançado.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Categorias padrão (parametrizáveis pelo app se quiser).
  var CAUSAS = ["Material", "Mão de obra", "Projeto / detalhamento", "Equipamento", "Programação", "Retrabalho", "Clima", "Cliente / terceiros", "Frente anterior atrasada", "Outros"];
  var RESTRICOES = ["Material", "Projeto", "Mão de obra", "Equipamento", "Área / frente", "Contrato / financeiro", "Aprovação / licença", "Outros"];
  var STATUS = { AFAZER: "afazer", FEITO: "feito", NAOFEITO: "naofeito" };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function ehData(d) { return d instanceof Date && !isNaN(d.getTime()); }

  // Segunda-feira 00:00 da semana que contém a data d (semana Seg–Dom).
  function segundaDe(d) {
    var x = new Date(d.getTime());
    var dow = (x.getDay() + 6) % 7;      // 0 = segunda … 6 = domingo
    x.setDate(x.getDate() - dow);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  // Chave de semana = data ISO (YYYY-MM-DD) da SEGUNDA. Única e ordenável.
  function chaveSemana(d) { var s = segundaDe(d); return s.getFullYear() + "-" + pad2(s.getMonth() + 1) + "-" + pad2(s.getDate()); }
  function fmtDia(d) { return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1); }

  // Janela do Lookahead: n semanas a partir da semana de 'base' (default: a atual = idx 0).
  function semanas(base, n) {
    if (!ehData(base)) base = new Date();
    n = n > 0 ? Math.floor(n) : 6;
    var seg = segundaDe(base), out = [];
    for (var i = 0; i < n; i++) {
      var ini = new Date(seg.getTime()); ini.setDate(ini.getDate() + i * 7);
      var fim = new Date(ini.getTime()); fim.setDate(fim.getDate() + 6);
      out.push({
        idx: i, chave: chaveSemana(ini), ini: ini, fim: fim,
        rotulo: i === 0 ? "Esta semana" : "Sem " + (i + 1),
        periodo: fmtDia(ini) + "–" + fmtDia(fim)
      });
    }
    return out;
  }

  function arr(x) { return Array.isArray(x) ? x : (x ? [x] : []); }
  function tarefasDe(plano) { return plano && Array.isArray(plano.tarefas) ? plano.tarefas : []; }

  // Restrições em aberto (não removidas) de UMA tarefa.
  function restricoesAbertas(t) {
    var n = 0, r = t && arr(t.restricoes);
    for (var i = 0; i < r.length; i++) { if (r[i] && !r[i].removida) n++; }
    return n;
  }
  // Tarefa está LIVRE (pode ser comprometida) quando não tem restrição em aberto.
  function podeComprometer(t) { return restricoesAbertas(t) === 0; }

  // Tarefas de uma semana (por chave).
  function daSemana(tarefas, chave) {
    return arr(tarefas).filter(function (t) { return t && t.semana === chave; });
  }

  // PPC de UMA semana: só as COMPROMETIDAS entram na conta. feito/comprometidas.
  function ppcSemana(tarefas, chave) {
    var comp = daSemana(tarefas, chave).filter(function (t) { return t.comprometida; });
    var feitas = 0, naofeitas = 0, pend = 0;
    comp.forEach(function (t) {
      if (t.status === STATUS.FEITO) feitas++;
      else if (t.status === STATUS.NAOFEITO) naofeitas++;
      else pend++;
    });
    var total = comp.length;
    return {
      chave: chave, comprometidas: total, feitas: feitas, naofeitas: naofeitas, pendentes: pend,
      ppc: total > 0 ? feitas / total : null   // null = sem tarefas comprometidas (não força 0%/100%)
    };
  }

  // Histórico de PPC pelas semanas dadas (pro gráfico "últimas N semanas").
  function historicoPPC(tarefas, listaSemanas) {
    return arr(listaSemanas).map(function (s) {
      var p = ppcSemana(tarefas, s.chave);
      return { chave: s.chave, rotulo: s.rotulo, periodo: s.periodo, ppc: p.ppc, comprometidas: p.comprometidas, feitas: p.feitas };
    });
  }
  // PPC médio (só semanas que tiveram comprometidas).
  function ppcMedio(hist) {
    var soma = 0, n = 0;
    arr(hist).forEach(function (h) { if (h.ppc != null) { soma += h.ppc; n++; } });
    return n > 0 ? soma / n : null;
  }

  // Causas de não-cumprimento agregadas (Pareto). Opcional: limitar às chaves dadas.
  function causasAgregadas(tarefas, chavesRestrito) {
    var lim = chavesRestrito ? {} : null;
    if (lim) arr(chavesRestrito).forEach(function (c) { lim[c] = 1; });
    var mapa = {}, total = 0;
    arr(tarefas).forEach(function (t) {
      if (!t || t.status !== STATUS.NAOFEITO) return;
      if (lim && !lim[t.semana]) return;
      var c = (t.causa && String(t.causa).trim()) || "Não informada";
      mapa[c] = (mapa[c] || 0) + 1; total++;
    });
    var linhas = Object.keys(mapa).map(function (c) { return { causa: c, n: mapa[c], pct: total > 0 ? mapa[c] / total : 0 }; });
    linhas.sort(function (a, b) { return b.n - a.n; });   // Pareto: maior primeiro
    return { linhas: linhas, total: total };
  }

  // Restrições agregadas (todas em aberto, pra reunião de médio prazo).
  function restricoesPendentes(tarefas) {
    var out = [];
    arr(tarefas).forEach(function (t) {
      arr(t && t.restricoes).forEach(function (r) {
        if (r && !r.removida) out.push({ tarefaId: t.id, tarefa: t.titulo, semana: t.semana, tipo: r.tipo, descricao: r.descricao, responsavel: r.responsavel, prazo: r.prazo, id: r.id });
      });
    });
    // ordena por prazo (as sem prazo ao fim)
    out.sort(function (a, b) { return String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")); });
    return out;
  }

  // Resumo geral pro cabeçalho do painel.
  function resumo(tarefas, listaSemanas) {
    var atual = listaSemanas && listaSemanas.length ? listaSemanas[0] : null;
    var pAtual = atual ? ppcSemana(tarefas, atual.chave) : { comprometidas: 0, feitas: 0, ppc: null };
    var hist = historicoPPC(tarefas, listaSemanas || []);
    var restr = restricoesPendentes(tarefas);
    var noLookahead = 0, comprometiveis = 0;
    var chavesLook = {}; arr(listaSemanas).forEach(function (s) { chavesLook[s.chave] = 1; });
    arr(tarefas).forEach(function (t) {
      if (!t || !chavesLook[t.semana]) return;
      if (!t.comprometida) { noLookahead++; if (podeComprometer(t)) comprometiveis++; }
    });
    return {
      ppcSemana: pAtual.ppc, comprometidas: pAtual.comprometidas, feitas: pAtual.feitas,
      ppcMedio: ppcMedio(hist),
      restricoesAbertas: restr.length,
      naLista: noLookahead, comprometiveis: comprometiveis
    };
  }

  var LastPlanner = {
    CAUSAS: CAUSAS, RESTRICOES: RESTRICOES, STATUS: STATUS,
    segundaDe: segundaDe, chaveSemana: chaveSemana, semanas: semanas,
    tarefasDe: tarefasDe, daSemana: daSemana,
    restricoesAbertas: restricoesAbertas, podeComprometer: podeComprometer,
    ppcSemana: ppcSemana, historicoPPC: historicoPPC, ppcMedio: ppcMedio,
    causasAgregadas: causasAgregadas, restricoesPendentes: restricoesPendentes,
    resumo: resumo,
    novo: function (obraId) { return { obraId: obraId || "", tarefas: [] }; }
  };

  global.LastPlanner = LastPlanner;
  if (typeof module !== "undefined" && module.exports) module.exports = LastPlanner;
})(typeof window !== "undefined" ? window : this);

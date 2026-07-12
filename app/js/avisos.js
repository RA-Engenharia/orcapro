/* =====================================================================
 * avisos.js — Motor da CENTRAL DE AVISOS (sino da topbar) — PURO, sem
 * DOM/Store/localStorage. Promessa do site: "medições a aprovar, tarefas
 * atrasadas e restrições num sino só".
 *
 * Contrato: recebe SNAPSHOTS de dados (o wiring em ui.js/app.js lê o Store
 * e chama aqui) + a data de hoje em ISO yyyy-mm-dd, e devolve os avisos
 * agrupados e ordenados por prioridade (1 = alta):
 *   1. medicao-aprovar   → medições aguardando aprovação          (view "medicoes")
 *   1. tarefa-atrasada   → tarefas com prazo vencido              (view "tarefas")
 *   2. restricao-aberta  → restrições não resolvidas, críticas 1º (view "lastplanner")
 *   3. contrato-vencendo → contratos ativos vencendo em ≤30d OU
 *                          já vencidos (rótulo "vencido")         (view "contratos")
 *
 * Regras duras:
 *  - datas comparadas SEMPRE como string ISO yyyy-mm-dd (lexicográfico =
 *    cronológico; zero bug de timezone). Contagem de dias usa Date.UTC dos
 *    componentes — NUNCA new Date("yyyy-mm-dd") (que desloca no fuso local).
 *  - item malformado (null, sem id, prazo lixo) é PULADO — nunca derruba.
 *  - grupos vazios ficam FORA do resultado; total = soma dos itens.
 * Node-testável: node tools/test-avisos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MS_DIA = 86400000;
  // status de medição que contam como "a aprovar" (comparados em minúsculas)
  var STATUS_APROVAR = { "pendente": 1, "aguardando-aprovacao": 1, "pendente-aprovacao": 1, "enviada": 1 }; // "pendente" = status real do app (P.medicaoStatus)

  // "2026-07-11..." válido → devolve os 10 primeiros chars; qualquer lixo → null.
  function isoDia(s) {
    if (typeof s !== "string") return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var mm = +m[2], dd = +m[3];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return s.slice(0, 10);
  }
  function utcDe(iso) { // iso já validado por isoDia
    return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  }
  function difDias(deISO, ateISO) { // ate - de, em dias inteiros (UTC, sem DST)
    return Math.round((utcDe(ateISO) - utcDe(deISO)) / MS_DIA);
  }
  function maisDias(iso, n) {
    var d = new Date(utcDe(iso) + n * MS_DIA);
    function p2(x) { return (x < 10 ? "0" : "") + x; }
    return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
  }
  function fmtBR(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4); }
  function plural(n) { return n + " dia" + (n === 1 ? "" : "s"); }

  function mapaObras(obras) {
    var m = {};
    (obras || []).forEach(function (o) { if (o && o.id != null) m[o.id] = String(o.nome || ""); });
    return m;
  }
  function nomeObra(mapa, obraId) { return (obraId != null && mapa[obraId]) || ""; }
  function porChave(k) { // sort estável por chave string asc
    return function (a, b) { return a[k] < b[k] ? -1 : (a[k] > b[k] ? 1 : 0); };
  }

  var Avisos = {
    STATUS_APROVAR: STATUS_APROVAR,

    // Utilitários públicos de data (ISO yyyy-mm-dd; entrada inválida → null).
    diasEntre: function (deISO, ateISO) {
      var a = isoDia(deISO), b = isoDia(ateISO);
      return (a && b) ? difDias(a, b) : null;
    },
    somarDias: function (iso, n) {
      var a = isoDia(iso);
      return a ? maisDias(a, Math.round(+n) || 0) : null;
    },

    // dados = { medicoes, tarefas, restricoes, contratos, obras } (snapshots)
    // hojeISO = "yyyy-mm-dd"
    // → { total, grupos:[{ tipo, rotulo, prioridade, itens:[{id,titulo,detalhe,view,prioridade}] }] }
    calcular: function (dados, hojeISO) {
      var hoje = isoDia(hojeISO);
      if (!hoje) return { total: 0, grupos: [] }; // sem "hoje" confiável não há aviso certo
      dados = dados || {};
      var obras = mapaObras(dados.obras);
      var horizonteRestricao = maisDias(hoje, 7);
      var horizonteContrato = maisDias(hoje, 30);

      // 1) medições a aprovar (status na lista STATUS_APROVAR)
      var itMed = [];
      (dados.medicoes || []).forEach(function (m) {
        if (!m || m.id == null) return;
        var st = String(m.status == null ? "" : m.status).toLowerCase();
        if (!STATUS_APROVAR[st]) return;
        var nome = nomeObra(obras, m.obraId);
        itMed.push({
          id: m.id,
          titulo: "Medição Nº " + (m.numero != null ? m.numero : m.id) + " aguardando aprovação",
          detalhe: nome ? "Obra " + nome : "Obra não identificada",
          view: "medicoes", prioridade: 1
        });
      });

      // 2) tarefas atrasadas: !concluida && prazo && prazo < hoje (string ISO)
      var itTar = [];
      (dados.tarefas || []).forEach(function (t) {
        if (!t || t.id == null || t.concluida) return;
        var prazo = isoDia(t.prazo);
        if (!prazo || !(prazo < hoje)) return; // sem prazo / prazo>=hoje → não é atrasada
        var nome = nomeObra(obras, t.obraId);
        itTar.push({
          id: t.id, _prazo: prazo,
          titulo: String(t.titulo || ("Tarefa " + t.id)),
          detalhe: "venceu há " + plural(difDias(prazo, hoje)) + (nome ? " — Obra " + nome : ""),
          view: "tarefas", prioridade: 1
        });
      });
      itTar.sort(porChave("_prazo")); // mais antiga (pior) primeiro
      itTar.forEach(function (x) { delete x._prazo; });

      // 3) restrições abertas: status !== "resolvida"; crítica = sem prazo OU prazo < hoje+7d
      var itRes = [];
      (dados.restricoes || []).forEach(function (r) {
        if (!r || r.id == null) return;
        if (String(r.status == null ? "" : r.status).toLowerCase() === "resolvida") return;
        var prazo = isoDia(r.prazo); // prazo lixo/ausente → sem prazo (crítica)
        var critica = !prazo || prazo < horizonteRestricao;
        var det;
        if (!prazo) det = "crítica — sem prazo definido";
        else if (prazo < hoje) det = "crítica — prazo vencido em " + fmtBR(prazo);
        else if (critica) det = "crítica — prazo " + fmtBR(prazo);
        else det = "prazo " + fmtBR(prazo);
        var nome = nomeObra(obras, r.obraId);
        itRes.push({
          id: r.id, _ordem: (critica ? "0" : "1") + (prazo || ""), critica: critica,
          titulo: String(r.desc || ("Restrição " + r.id)),
          detalhe: det + (nome ? " — Obra " + nome : ""),
          view: "lastplanner", prioridade: 2
        });
      });
      itRes.sort(porChave("_ordem")); // críticas primeiro; dentro, prazo mais cedo primeiro
      itRes.forEach(function (x) { delete x._ordem; });

      // 4) contratos: só ativos/indefinidos; fim ≤ hoje+30d entra —
      //    já vencido (fim < hoje) TAMBÉM avisa, com rótulo "vencido".
      var itCon = [];
      (dados.contratos || []).forEach(function (c) {
        if (!c || c.id == null) return;
        var st = String(c.status == null ? "" : c.status).toLowerCase();
        if (st && st !== "ativo") return; // encerrado/cancelado/etc → fora
        var fim = isoDia(c.fim);
        if (!fim || fim > horizonteContrato) return; // sem fim ou além de 30d → fora
        var det;
        if (fim < hoje) det = "vencido há " + plural(difDias(fim, hoje));
        else if (fim === hoje) det = "vence hoje";
        else det = "vence em " + plural(difDias(hoje, fim));
        itCon.push({
          id: c.id, _fim: fim,
          titulo: String(c.titulo || ("Contrato " + c.id)),
          detalhe: det, view: "contratos", prioridade: 3
        });
      });
      itCon.sort(porChave("_fim")); // vencidos primeiro, depois quem vence mais cedo
      itCon.forEach(function (x) { delete x._fim; });

      // monta grupos (vazios ficam FORA), já em ordem de prioridade
      var grupos = [];
      if (itMed.length) grupos.push({ tipo: "medicao-aprovar", rotulo: "Medições a aprovar", prioridade: 1, itens: itMed });
      if (itTar.length) grupos.push({ tipo: "tarefa-atrasada", rotulo: "Tarefas atrasadas", prioridade: 1, itens: itTar });
      if (itRes.length) grupos.push({ tipo: "restricao-aberta", rotulo: "Restrições abertas", prioridade: 2, itens: itRes });
      if (itCon.length) grupos.push({ tipo: "contrato-vencendo", rotulo: "Contratos vencendo", prioridade: 3, itens: itCon });
      var total = 0;
      grupos.forEach(function (g) { total += g.itens.length; });
      return { total: total, grupos: grupos };
    }
  };

  global.Avisos = Avisos;
  if (typeof module !== "undefined" && module.exports) module.exports = Avisos;
  // global = window no browser; no Node (teste) usa o global real.
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

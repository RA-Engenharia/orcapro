/* =====================================================================
 * conccombina.js — COMBINAÇÕES de ações do concreto (fase C1, 14/11/2026). Motor PURO (ES5, Node-testável).
 * NBR 6118 item 11.8 (Tabela 11.3 combinações últimas normais; 11.7.2 e 11.8.3 combinações de serviço) com os γf da Tabela 11.1 e
 * os ψ da Tabela 11.2 — todos lidos de js/concdadoscalc.js (com fonte, item e página). A NBR 8681 não foi aberta nesta fase.
 *
 *  ELU normal:  Fd = γg·ΣG + γq·(Q1 + Σ ψ0j·Qj)           (permanentes desfavoráveis γg = 1,4; variáveis γq = 1,4)
 *  ELU, permanente FAVORÁVEL (só com vento): Fd = γg,F·ΣG + γq·W   (γg,F = 1,0) — arrancamento/estabilidade
 *  ELS quase permanente:  Fser = ΣG + Σ ψ2j·Qj
 *  ELS frequente:         Fser = ΣG + ψ1·Q1 + Σ ψ2j·Qj
 *  Ações variáveis: SC (sobrecarga de uso) e o vento (uma ação com 4 sentidos W+X, W-X, W+Z, W-Z, um por vez).
 *  Desaprumo global (casos D+X D-X D+Z D-Z de ConcCargas, só ELU): regras a/b/c da 11.3.3.4.1 — ver o bloco do desaprumo abaixo.
 *  Sem vento informado (status "pendente" em ConcCargas) nenhuma combinação com vento é gerada. Temperatura e retração: fora da C1.
 *
 * API  ConcCombina.gerar(casos, opc) → { ok, combinacoes: [{ id, nome, tipo, fatores, norma }], psi, avisos }
 *   casos = ConcCargas.gerar(...).casos · opc = { uso: "resid"|"comercial"|"biblioteca" (padrão resid, Tabela 11.2 nota b) }
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function CD() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function cv(k, d) { var D = CD(); return D ? D.v(k, d) : d; }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  function gerar(casos, opc) {
    opc = opc || {};
    var avisos = [], uso = opc.uso || "resid";
    if (["resid", "comercial", "biblioteca"].indexOf(uso) < 0) return { ok: false, motivo: "uso desconhecido: " + uso };
    var ids = arr(casos).map(function (c) { return c.id; });
    var G = ["PP", "REV", "ALV"].filter(function (k) { return ids.indexOf(k) >= 0; }), temSC = ids.indexOf("SC") >= 0;
    var W = ids.filter(function (k) { return /^W[+-][XZ]$/.test(k); });
    var gG = cv("gammaG_normal_desfavoravel", 1.4), gGF = cv("gammaG_normal_favoravel", 1.0), gQ = cv("gammaQ_normal", 1.4);
    var psiSC = { p0: cv("psi_" + uso + "_0", null), p1: cv("psi_" + uso + "_1", null), p2: cv("psi_" + uso + "_2", null) };
    var psiW = { p0: cv("psi_vento_0", 0.6), p1: cv("psi_vento_1", 0.3), p2: cv("psi_vento_2", 0) };
    var combs = [], n = 0;
    function fat(g, extra) { var f = {}; G.forEach(function (k) { f[k] = g; }); Object.keys(extra || {}).forEach(function (k) { if (extra[k]) f[k] = extra[k]; }); return f; }
    function add(tipo, nome, f, norma) { n++; combs.push({ id: tipo + n, nome: nome, tipo: tipo, fatores: f, norma: norma }); }
    var N0 = "NBR 6118 Tabela 11.3 (11.8.2.4), γf da Tabela 11.1, ψ da Tabela 11.2";
    /* ELU */
    if (temSC) { var f1 = fat(gG, { SC: gQ }); add("ELU", "1,4·G + 1,4·SC", f1, N0); }
    /* desaprumo global (11.3.3.4.1; casos D±X/Z de ConcCargas): só ELU. regime "combinado" → a combinação leva W e D juntos (ação de vento ampliada); regime "so-desaprumo" → o vento
     * dessa direção deixa de entrar no ELU e o D entra sozinho com a sobrecarga cheia (a força D já é proporcional a G + SC); regime "so-vento" não gera caso D. */
    var Dc = arr(casos).filter(function (c) { return c.tipo === "desaprumo"; });
    function dDe(w) { return Dc.filter(function (c) { return c.regime === "combinado" && c.vento === w; })[0]; }
    function soD(w) { return Dc.filter(function (c) { return c.regime === "so-desaprumo" && c.vento === w; })[0]; }
    W.forEach(function (w) {
      var dc = dDe(w), tag = dc ? " + " + dc.id + " (desaprumo combinado, 11.3.3.4.1-c)" : "";
      if (soD(w)) return;                       /* vento < 30 % do desaprumo: só o desaprumo (11.3.3.4.1-b) */
      if (temSC) { var fa = fat(gG, { SC: gQ }); fa[w] = r3(gQ * psiW.p0); if (dc) fa[dc.id] = fa[w]; add("ELU", "1,4·G + 1,4·SC + 1,4·ψ0·" + w + tag + " (ψ0 vento " + psiW.p0 + ")", fa, N0); }
      var fb = fat(gG, {}); fb[w] = gQ; if (dc) fb[dc.id] = gQ; if (temSC) fb.SC = r3(gQ * psiSC.p0); add("ELU", "1,4·G + 1,4·" + w + tag + (temSC ? " + 1,4·ψ0·SC (ψ0 " + psiSC.p0 + ")" : ""), fb, N0);
      var fc = fat(gGF, {}); fc[w] = gQ; if (dc) fc[dc.id] = gQ; add("ELU", "1,0·G(favorável) + 1,4·" + w + tag, fc, N0 + " — permanente favorável γg = 1,0");
    });
    Dc.filter(function (c) { return c.regime === "so-desaprumo"; }).forEach(function (c) {
      var fd = fat(gG, temSC ? { SC: gQ } : {}); fd[c.id] = gQ; add("ELU", "1,4·G" + (temSC ? " + 1,4·SC" : "") + " + 1,4·" + c.id + " (só desaprumo)", fd, "NBR 6118:2023 11.3.3.4.1 e Em1:2026 Fig. 11.1; Tabela 11.1");
    });
    /* ⚠ 1,4·G SEMPRE (revisão de cálculo 14/11/2026): antes as combinações ELU só existiam com sobrecarga (1,4·G + 1,4·SC) ou com vento. Sem sobrecarga (ou numa laje/viga em que a
     * sobrecarga é favorável) a combinação dos permanentes sós podia faltar e o dimensionamento só enxergava o que tinha SC. Vai DEPOIS das demais ELU para os ids de antes não se mexerem. */
    if (G.length) add("ELU", "1,4·G (permanentes sós)", fat(gG, {}), N0);
    /* ELS */
    var fq = fat(1, {}); if (temSC) fq.SC = psiSC.p2;
    add("ELS-QP", "Quase permanente: G + ψ2·SC (ψ2 " + psiSC.p2 + ")", fq, "NBR 6118 11.7.2 e 11.8.3 — γf2 = ψ2");
    if (temSC) { var ff = fat(1, { SC: psiSC.p1 }); add("ELS-F", "Frequente: G + ψ1·SC (ψ1 " + psiSC.p1 + ")", ff, "NBR 6118 11.7.2 e 11.8.3 — γf2 = ψ1"); }
    W.forEach(function (w) {
      var fv = fat(1, {}); fv[w] = psiW.p1; if (temSC) fv.SC = psiSC.p2; add("ELS-F", "Frequente: G + ψ1·" + w + " + ψ2·SC (ψ1 vento " + psiW.p1 + ")", fv, "NBR 6118 11.7.2 e 11.8.3 — γf2 = ψ1");
    });
    if (!W.length) avisos.push("Sem vento informado: nenhuma combinação com vento (ELU e ELS) foi gerada.");
    if (!temSC) avisos.push("Sem sobrecarga: combinações só com permanentes.");
    return { ok: true, combinacoes: combs, psi: { SC: psiSC, vento: psiW, uso: uso }, avisos: avisos };
  }

  var ConcCombina = { gerar: gerar };
  global.ConcCombina = ConcCombina;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcCombina;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

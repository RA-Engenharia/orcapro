/* =====================================================================
 * mor/abc.js — CURVA ABC AUTOMÁTICA (F11 do MOR, ESPEC §15 item 4)
 *
 * Ordena os itens do orçamento por valor (quantidade × custo unitário), acumula o percentual sobre o total e marca:
 *   A — o item entra em A enquanto o acumulado ANTES dele for < 80 % (o item que cruza os 80 % ainda é A);
 *   B — idem, até 95 %; C — o resto.
 * Item com valor ≤ 0 ou NaN não entra no ranking (fica em `semValor`) e nunca vira A.
 * Empate de valor: mantém a ordem do orçamento (estável). Sugere COTAR PRIMEIRO os itens A que ainda não têm
 * cotação de fornecedor. Puro, ES5, sem DOM; não grava nada.
 *   curva(orc, opts) → { linhas[], resumo:{A,B,C,total,nItens,semValor,pctItensA}, cotarPrimeiro[], texto }
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(x) { return Math.round(num(x) * 100) / 100; }

  var LIM_A = 80, LIM_B = 95;

  function curva(orc, opts) {
    opts = opts || {};
    var limA = opts.limiteA || LIM_A, limB = opts.limiteB || LIM_B, todos = [], semValor = 0, total = 0;
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e && e.itens).forEach(function (it) {
        if (!it) return;
        var v = num(it.quantidade) * num(it.custoUnitario);
        if (!(v > 0)) { semValor++; return; }
        total += v;
        todos.push({ ord: todos.length, etapaId: e.id, etapa: e.nome || "", itemId: it.id, codigo: String(it.codigo == null ? "" : it.codigo), descricao: it.descricao || "", unidade: it.unidade || "", quantidade: num(it.quantidade), custoUnitario: num(it.custoUnitario), valor: v, cotado: !!(it.cotacao && typeof it.cotacao === "object") });
      });
    });
    todos.sort(function (a, b) { return (b.valor - a.valor) || (a.ord - b.ord); });
    var ac = 0, S = { A: { n: 0, valor: 0, pct: 0 }, B: { n: 0, valor: 0, pct: 0 }, C: { n: 0, valor: 0, pct: 0 } };
    todos.forEach(function (l) {
      var antes = total > 0 ? (ac / total) * 100 : 0;
      l.classe = antes < limA ? "A" : (antes < limB ? "B" : "C");
      ac += l.valor;
      l.pct = total > 0 ? r2((l.valor / total) * 100) : 0;
      l.acumPct = total > 0 ? r2((ac / total) * 100) : 0;
      l.valor = r2(l.valor);
      S[l.classe].n++; S[l.classe].valor += l.valor;
    });
    ["A", "B", "C"].forEach(function (k) { S[k].valor = r2(S[k].valor); S[k].pct = total > 0 ? r2((S[k].valor / total) * 100) : 0; });
    var n = todos.length;
    var resumo = { A: S.A, B: S.B, C: S.C, total: r2(total), nItens: n, semValor: semValor, pctItensA: n ? r2((S.A.n / n) * 100) : 0 };
    var cotar = todos.filter(function (l) { return l.classe === "A" && !l.cotado; });
    var texto;
    if (!n) texto = "Sem itens com valor: não há curva ABC a mostrar.";
    else texto = S.A.n + " de " + n + " itens (" + String(resumo.pctItensA).replace(".", ",") + "%) são " + String(S.A.pct).replace(".", ",") + "% do valor (classe A)." +
      (cotar.length ? " Cotar primeiro: " + cotar.slice(0, 5).map(function (l) { return l.descricao.slice(0, 40); }).join("; ") + (cotar.length > 5 ? " e mais " + (cotar.length - 5) : "") + "." : " Todos os itens A já têm cotação de fornecedor.");
    return { linhas: todos, resumo: resumo, cotarPrimeiro: cotar, texto: texto };
  }

  var Abc = { LIM_A: LIM_A, LIM_B: LIM_B, curva: curva };
  if (typeof module !== "undefined" && module.exports) module.exports = Abc;
  global.MorAbc = Abc;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * acocargas.js — AÇÕES E COMBINAÇÕES do cálculo de estruturas de aço
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 *   sobrecargaCobertura(i%)   carga variável de cobertura acessível só para
 *                             manutenção — NBR 6120:2019, 6.4 e Figura 2
 *                             (TEXTO OFICIAL na biblioteca da RA):
 *                             q = 0,50·α kN/m², 0,25 ≤ q ≤ 0,50, com
 *                             α = 1,0 (1 % ≤ i ≤ 2 %), 2,0 − 0,5·i (2 % < i < 3 %),
 *                             0,5 (i ≥ 3 %); 0,25 em qualquer inclinação se a
 *                             verificação de empoçamento (Anexo D) for feita.
 *                             Instalações, forro, isolamento, sprinklers e
 *                             painéis solares são PERMANENTES (6.4).
 *                             Cada terça/elemento isolado: 1 kN concentrado na
 *                             posição mais desfavorável, isolado das demais
 *                             variáveis (6.4).
 *   combinacoes(casos, op)    combinações últimas normais e de serviço com os
 *                             coeficientes γf e ψ — NBR 8800:2008, Tabelas 1 e
 *                             2 (as da NBR 8681 aplicadas às estruturas de aço);
 *                             forças nocionais (0,3 % — 4.9.7.1.1) na direção
 *                             certa de cada combinação.
 *
 * ⚠ EDIÇÕES: a NBR 8681 vigente é a 2025 e a NBR 8800 a 2024; a biblioteca
 *   ainda não tem esses textos. Os coeficientes abaixo são os da NBR 8800:2008
 *   (Tabelas 1 e 2) — ficam numa tabela só, com a edição dita, e o memorial
 *   mostra isso até a conferência na edição nova.
 * Teste: node tools/test-aco-cargas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace(".", ","); }

  var EDICAO = "NBR 8800:2008 (Tabelas 1 e 2) — conferir na NBR 8800:2024 / NBR 8681:2025";

  /* γf das ações (combinações últimas normais) — NBR 8800:2008, Tabela 1 */
  var GAMA_F = {
    "G-metalica":      { desf: 1.25, fav: 1.00, nome: "peso próprio de estruturas metálicas" },
    "G-premoldada":    { desf: 1.30, fav: 1.00, nome: "peso próprio de estruturas pré-moldadas" },
    "G-industrializado": { desf: 1.35, fav: 1.00, nome: "peso próprio de estruturas moldadas no local e de elementos construtivos industrializados" },
    "G-insitu":        { desf: 1.40, fav: 1.00, nome: "peso próprio de elementos construtivos industrializados com adições in loco" },
    "G-geral":         { desf: 1.50, fav: 1.00, nome: "peso próprio de elementos construtivos em geral e equipamentos" },
    "Q-temperatura":   { desf: 1.20, nome: "efeito de temperatura" },
    "W":               { desf: 1.40, nome: "ação do vento" },
    "Q-truncada":      { desf: 1.20, nome: "ações truncadas" },
    "Q":               { desf: 1.50, nome: "demais ações variáveis, incluindo as decorrentes do uso e ocupação" }
  };
  /* ψ0, ψ1, ψ2 — NBR 8800:2008, Tabela 2 */
  var PSI = {
    "Q-uso-a":     { psi0: 0.5, psi1: 0.4, psi2: 0.3, nome: "uso e ocupação: locais sem predominância de pesos e equipamentos fixos por longos períodos nem de elevadas concentrações de pessoas" },
    "Q-uso-b":     { psi0: 0.7, psi1: 0.6, psi2: 0.4, nome: "uso e ocupação: locais com predominância de pesos e equipamentos fixos por longos períodos ou de elevadas concentrações de pessoas" },
    "Q-cobertura": { psi0: 0.8, psi1: 0.7, psi2: 0.6, nome: "bibliotecas, arquivos, depósitos, oficinas, garagens e SOBRECARGAS EM COBERTURAS" },
    "W":           { psi0: 0.6, psi1: 0.3, psi2: 0.0, nome: "pressão dinâmica do vento nas estruturas em geral" },
    "Q-temperatura": { psi0: 0.6, psi1: 0.5, psi2: 0.3, nome: "variações uniformes de temperatura em relação à média anual local" }
  };
  var NOCIONAL = 0.003;   /* 4.9.7.1.1: imperfeição geométrica inicial h/333 → forças horizontais de 0,3 % das cargas gravitacionais de cálculo */

  /* =================================================== COBERTURA (NBR 6120) */
  function sobrecargaCobertura(iPct, op) {
    op = op || {};
    var i = num(iPct, 0), alfa, q, txt;
    if (i < 1) return { ok: false, q: null, motivo: "NBR 6120:2019, 6.4: a cobertura deve ter no mínimo 1 % de inclinação (informado " + br(i, 1) + " %)." };
    if (op.empocamentoVerificado) {
      q = 0.25; alfa = 0.5;
      txt = "Cobertura com drenagem e rigidez que impedem o empoçamento progressivo, verificada pelo Anexo D: q = 0,25 kN/m² (NBR 6120:2019, 6.4).";
    } else {
      alfa = i <= 2 ? 1.0 : (i < 3 ? 2.0 - 0.5 * i : 0.5);
      q = Math.min(0.50, Math.max(0.25, 0.50 * alfa));
      txt = "q = 0,50·α = 0,50 × " + br(alfa, 2) + " = " + br(q, 2) + " kN/m² (inclinação i = " + br(i, 1) + " %; α = " + (i <= 2 ? "1,0 para 1 % ≤ i ≤ 2 %" : i < 3 ? "2,0 − 0,5·i para 2 % < i < 3 %" : "0,5 para i ≥ 3 %") + "), em projeção horizontal.";
    }
    var avisos = [];
    if (i < 2) avisos.push("Inclinação abaixo de 2 %: a NBR 6120:2019 não recomenda (acúmulo de água, granizo, pó).");
    if (i < 5 && !op.empocamentoVerificado) avisos.push("Inclinação abaixo de 5 %: verificar o empoçamento progressivo (NBR 6120:2019, Anexo D).");
    return { ok: true, q: q, alfa: alfa, texto: txt, referencia: "ABNT NBR 6120:2019, 6.4 e Figura 2", concentrada: 1.0,
             concentradaTexto: "Cada terça (elemento isolado da cobertura) também é verificada para 1 kN concentrado na posição mais desfavorável, isolado das demais variáveis, além do permanente (NBR 6120:2019, 6.4).",
             avisos: avisos };
  }

  /* =================================================== COMBINAÇÕES
   * casos: [{ id, tipo: "G" | "Q" | "W", categoria: chave de GAMA_F / PSI (opcional), nome,
   *           direcao: 0 | 90 | 180 | 270 (vento), nocionalDir: [x, y, z] (opcional) }]
   * op: { nocional: true, segundaOrdem: true, sobrecargaPrincipal: true }
   * Devolve [{ id, nome, tipo: "ELU" | "ELS-rara" | "ELS-frequente" | "ELS-qp", fatores: {caso: f}, descricao, nocional, segundaOrdem }] */
  function combinacoes(casos, op) {
    op = op || {};
    var G = arr(casos).filter(function (c) { return c.tipo === "G"; }),
        Q = arr(casos).filter(function (c) { return c.tipo === "Q"; }),
        W = arr(casos).filter(function (c) { return c.tipo === "W"; });
    function gf(c, fav) { var g = GAMA_F[c.categoria || "G-metalica"] || GAMA_F["G-metalica"]; return fav ? g.fav : g.desf; }
    function gq(c) { return c.tipo === "W" ? GAMA_F.W.desf : (GAMA_F[c.categoria] || GAMA_F.Q).desf; }
    function psi(c, k) { var p = PSI[c.tipo === "W" ? "W" : (c.categoria || "Q-cobertura")] || PSI["Q-cobertura"]; return p[k]; }
    function dirW(c) { var a = num(c.direcao, 90) * Math.PI / 180; return [Math.round(Math.sin(a) * 1e6) / 1e6, 0, Math.round(Math.cos(a) * 1e6) / 1e6]; }
    var out = [], n = 0;
    function add(nome, tipo, fat, desc, nocDir) {
      n++;
      var c = { id: (tipo === "ELU" ? "ELU" : tipo === "ELS-rara" ? "ELSr" : tipo === "ELS-frequente" ? "ELSf" : "ELSq") + n, nome: nome, tipo: tipo, fatores: fat, descricao: desc };
      if (tipo === "ELU") { c.segundaOrdem = op.segundaOrdem !== false; if (op.nocional !== false && nocDir) c.nocional = { fracao: NOCIONAL, dir: nocDir }; }
      out.push(c);
    }
    function f2(v) { return br(v, 2); }
    /* ---- ELU ---- */
    var dirsGrav = op.nocionalDirecoes || [[1, 0, 0], [0, 0, 1]];
    /* 1) variável de uso/cobertura principal, sem vento — forças nocionais em cada direção */
    Q.forEach(function (q) {
      dirsGrav.forEach(function (dg, k) {
        var fat = {}, d = [];
        G.forEach(function (g) { fat[g.id] = gf(g, false); d.push(f2(gf(g, false)) + "·" + g.id); });
        fat[q.id] = gq(q); d.push(f2(gq(q)) + "·" + q.id);
        Q.forEach(function (q2) { if (q2 !== q) { fat[q2.id] = gq(q2) * psi(q2, "psi0"); d.push(f2(gq(q2) * psi(q2, "psi0")) + "·" + q2.id); } });
        add(q.nome + " principal" + (dirsGrav.length > 1 ? " (nocional " + (dg[0] ? "X" : "Z") + ")" : ""), "ELU", fat, d.join(" + "), dg);
      });
    });
    if (!Q.length && G.length) dirsGrav.forEach(function (dg) { var fat = {}; G.forEach(function (g) { fat[g.id] = gf(g, false); }); add("Permanentes", "ELU", fat, G.map(function (g) { return f2(gf(g, false)) + "·" + g.id; }).join(" + "), dg); });
    W.forEach(function (w) {
      var nd = dirW(w);
      /* 2) vento principal + sobrecarga secundária (ψ0) */
      if (Q.length) {
        var fat = {}, d = [];
        G.forEach(function (g) { fat[g.id] = gf(g, false); d.push(f2(gf(g, false)) + "·" + g.id); });
        fat[w.id] = gq(w); d.push(f2(gq(w)) + "·" + w.id);
        Q.forEach(function (q) { fat[q.id] = gq(q) * psi(q, "psi0"); d.push(f2(gq(q) * psi(q, "psi0")) + "·" + q.id); });
        add(w.nome + " principal + sobrecarga", "ELU", fat, d.join(" + "), nd);
        /* 3) sobrecarga principal + vento secundário (ψ0 = 0,6) */
        Q.forEach(function (q) {
          var fat3 = {}, d3 = [];
          G.forEach(function (g) { fat3[g.id] = gf(g, false); d3.push(f2(gf(g, false)) + "·" + g.id); });
          fat3[q.id] = gq(q); d3.push(f2(gq(q)) + "·" + q.id);
          fat3[w.id] = gq(w) * psi(w, "psi0"); d3.push(f2(gq(w) * psi(w, "psi0")) + "·" + w.id);
          add(q.nome + " principal + " + w.nome, "ELU", fat3, d3.join(" + "), nd);
        });
      }
      /* 4) vento principal com o permanente FAVORÁVEL (sucção: arrancamento, terças, chumbadores) */
      var fat4 = {}, d4 = [];
      G.forEach(function (g) { fat4[g.id] = gf(g, true); d4.push(f2(gf(g, true)) + "·" + g.id); });
      fat4[w.id] = gq(w); d4.push(f2(gq(w)) + "·" + w.id);
      add(w.nome + " principal, permanente favorável", "ELU", fat4, d4.join(" + "), nd);
    });
    /* ---- ELS ---- (raras: G + Q1 + Σψ1·Qj — para os deslocamentos-limite) */
    function els(nome, tipo, principal, outros, kOutro) {
      var fat = {}, d = [];
      G.forEach(function (g) { fat[g.id] = 1; d.push(g.id); });
      if (principal) { fat[principal.id] = 1; d.push(principal.id); }
      outros.forEach(function (o) { var v = psi(o, kOutro); if (v) { fat[o.id] = v; d.push(br(v, 1) + "·" + o.id); } });
      add(nome, tipo, fat, d.join(" + "));
    }
    Q.forEach(function (q) { els(q.nome + " (rara)", "ELS-rara", q, Q.filter(function (x) { return x !== q; }), "psi1"); });
    W.forEach(function (w) { els(w.nome + " (rara)", "ELS-rara", w, Q, "psi1"); });
    W.forEach(function (w) { var fat = {}; fat[w.id] = 1; add(w.nome + " — só o vento (deslocamento horizontal)", "ELS-rara", fat, w.id); });
    if (G.length) els("Quase permanente", "ELS-qp", null, Q.concat(W), "psi2");
    return out;
  }

  var AcoCargas = { EDICAO: EDICAO, GAMA_F: GAMA_F, PSI: PSI, NOCIONAL: NOCIONAL, sobrecargaCobertura: sobrecargaCobertura, combinacoes: combinacoes };
  global.AcoCargas = AcoCargas;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoCargas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

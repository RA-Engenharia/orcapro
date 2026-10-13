/* =====================================================================
 * madespecie.js — ESPECIFICAÇÃO DE ESPÉCIE POR FUNÇÃO da peça (motor PURO,
 * ES5, sem DOM, Node-testável).
 *
 * Quem decide a madeira é o cliente (é ele que compra); o cálculo só pode
 * recusar uma espécie que não passa. Por isso a espécie não fica gravada
 * peça a peça como verdade: uma tabela de REGRAS por função (grupo da peça)
 * diz qual espécie vale, de onde veio a decisão e quando. Ao trocar a regra,
 * todas as peças da função trocam juntas, e o que conflita com o cálculo vira
 * aviso — nunca troca calada.
 *
 * Regra: { grupo: RegExp (no `grupo` da peça), especie, origem, data,
 *          secoes?: ["10x20"] (só estas seções), nota?, conferir? (true =
 *          interpretação a confirmar com o cliente) }
 * A PRIMEIRA regra que casa vale (ordem importa: exceções antes da geral).
 * Teste: node tools/test-mad-especie.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ME = {};

  function chave(sec) { return sec ? Math.min(sec[0], sec[1]) + "x" + Math.max(sec[0], sec[1]) : ""; }
  function chaveOriginal(sec) { return sec ? sec[0] + "x" + sec[1] : ""; }

  /* Quiosque de referência — material passado pelo cliente à carpintaria (mensagem de 11/10/2026 21:33):
   * "Pergolado, brise: Itaúba · Estrutura piso: Tatajuba · Wood frame: Pinus". */
  var CLIENTE = "cliente (mensagem de 11/10/2026 21:33)";
  ME.QUIOSQUE = [
    { grupo: /^WF_GUIA_SUP$/, secoes: ["10x20"], especie: "tatajuba", origem: "DEFINIÇÃO RA (RT, 12/10/2026 — decisão delegada pelo Rogério)", data: "2026-10-12",
      nota: "Viga de topo embutida na parede de wood frame: madeira dura POR CÁLCULO (Pinus 5×10 deitado chegava a 592 %; Tatajuba 10×20 dá η 0,66). Tatajuba = mesma compra do piso, peça não aparente; a Itaúba fica para o aparente (pergolado/brise)." },
    { grupo: /^WF_VERGA$/, secoes: ["5x20"], especie: "tatajuba", origem: "DEFINIÇÃO RA (RT, 12/10/2026 — decisão delegada pelo Rogério)", data: "2026-10-12",
      nota: "Verga 5×20 em madeira dura por cálculo, embutida na parede de Pinus — Tatajuba, como a viga de topo." },
    { grupo: /^FORRO_BARROTE$/, especie: "tatajuba", origem: "DEFINIÇÃO RA (RT, 12/10/2026 — decisão delegada pelo Rogério)", data: "2026-10-12",
      nota: "Barrotes do forro dos blocos: Pinus 5×15 reprovava (η até 2,96, escora do vento no topo das paredes) → Tatajuba 10×15 (η 0,61). A seção nova vem de MadDimensionar.QUIOSQUE.decisoesRT." },
    { grupo: /^WF_|^FORRO_/, especie: "pinus_cca", origem: CLIENTE, data: "2026-10-11" },
    { grupo: /^PISO_/, especie: "tatajuba", origem: CLIENTE, data: "2026-10-11" },
    { grupo: /^PILAR_|^COB_/, especie: "itauba", origem: CLIENTE + "; pilares incluídos no pergolado — confirmado pelo Rogério em 12/10/2026", data: "2026-10-12",
      nota: "\"Pergolado\" = a estrutura aparente da cobertura sobre o vidro: pilares compostos, vigas e bloqueadores das coberturas (era Tatajuba pelo projeto original)." },
    { grupo: /^BRISE|^RIPADO|^PERGOLADO/, especie: "itauba", origem: CLIENTE, data: "2026-10-11" }
  ];

  /** regra que vale para a peça (ou null) */
  ME.regraDe = function (peca, regras) {
    var g = String(peca.grupo || ""), k = chave(peca.secao_cm), ko = chaveOriginal(peca.secao_cm);
    for (var i = 0; i < regras.length; i++) {
      var r = regras[i];
      if (!r.grupo.test(g)) continue;
      if (r.secoes && r.secoes.indexOf(k) < 0 && r.secoes.indexOf(ko) < 0) continue;
      return r;
    }
    return null;
  };

  /** espécie atual da peça pelo texto da fonte (só para comparar) */
  ME.especieDaFonte = function (peca) {
    var s = String(peca.especie || peca.material || "").toLowerCase();
    if (/tatajuba/.test(s)) return "tatajuba";
    if (/ita[uú]ba/.test(s)) return "itauba";
    if (/pinus/.test(s)) return "pinus_cca";
    return null;
  };

  /**
   * Aplica as regras às peças de madeira (as que têm secao_cm).
   * → { pecas: [{id, grupo, secao, de, para, regra}], trocas: {"de→para": {n, volume_m3}},
   *     porEspecie: {especie: {n, volume_m3, m}}, semRegra: [...], conferir: [{nota, n}] }
   */
  ME.aplicar = function (pecas, regras) {
    var out = [], trocas = {}, por = {}, sem = [], conf = {};
    pecas.forEach(function (p) {
      if (!p.secao_cm) return;
      var r = ME.regraDe(p, regras), de = ME.especieDaFonte(p);
      if (!r) { sem.push(p.id + " (" + p.grupo + ")"); return; }
      var v = p.volume_m3 || 0, L = p.comprimento_m || 0;
      out.push({ id: p.id, grupo: p.grupo, secao: chaveOriginal(p.secao_cm), de: de, para: r.especie, regra: r });
      if (de !== r.especie) {
        var k = (de || "?") + "→" + r.especie;
        trocas[k] = trocas[k] || { n: 0, volume_m3: 0 };
        trocas[k].n++; trocas[k].volume_m3 += v;
      }
      por[r.especie] = por[r.especie] || { n: 0, volume_m3: 0, m: 0 };
      por[r.especie].n++; por[r.especie].volume_m3 += v; por[r.especie].m += L;
      if (r.conferir) { conf[r.nota] = (conf[r.nota] || 0) + 1; }
    });
    return { pecas: out, trocas: trocas, porEspecie: por, semRegra: sem,
      conferir: Object.keys(conf).map(function (n) { return { nota: n, n: conf[n] }; }) };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ME;
  else global.MadEspecie = ME;
})(typeof window !== "undefined" ? window : this);

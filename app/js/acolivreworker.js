/* =====================================================================
 * acolivreworker.js — o CÁLCULO DA ESTRUTURA DESENHADA (js/acodimlivre.js)
 * num Web Worker, com PROGRESSO e CANCELAR de verdade (20/11/2026, pedido
 * do Rogério: "parece travado"). O mesmo padrão do js/acocalcworker.js:
 *   · new Worker("js/acolivreworker.js") — carrega os motores com
 *     importScripts, recebe { tipo: "calcular", id, entrada, op } e devolve
 *     { tipo: "progresso", fase, k, n, rodada } (no máximo ~4 por segundo,
 *     para não atrasar o cálculo) e { tipo: "fim", texto } (o resultado em
 *     JSON) — ou { tipo: "erro", mensagem };
 *   · CANCELAR = a tela chama worker.terminate(): o processo morre no meio,
 *     nada volta e nada é gravado (o resultado só existe quando chega "fim");
 *   · na página (script do grupo "bim") registra `AcoLivreWorker` com
 *     `rodar(entrada, op, aoProgresso)` — o caminho sem Worker (a tela trava
 *     enquanto calcula, como antes; o progresso aparece no fim).
 * O resultado é o MESMO do cálculo na página: o motor é o mesmo e o progresso
 * só ouve (tools/test-acolivreworker.js compara com e sem progresso).
 * ===================================================================== */
(function (global) {
  "use strict";
  var NO_WORKER = typeof global.importScripts === "function" && typeof global.document === "undefined";
  var MOTORES = ["perfisaco.js", "bimarq.js", "bimedit.js", "bimprecisao.js", "metalnorma.js", "metalpeca.js", "metalcriar.js", "metalligacao.js",
                 "acomateriais.js", "acosecao.js", "acofsm.js", "acodim14762.js", "acoanalise.js", "acocargas.js", "acomodelo.js", "acodim8800.js",
                 "acoisopletas.js", "acovento.js", "acosecundarias.js", "acoligcalc.js", "acodimensionar.js", "acomodelolivre.js", "acofechamentos.js",
                 "acoenvoltorio.js", "acodimlivre.js", "acoligcalc2.js", "metalnostubo.js", "metaltubou.js", "metalchapano.js", "metalligdim.js", "acoresolverlivre.js"];   /* 21/11: as soluções do mecanismo no problema (o "Calcular e corrigir" aplica a mais leve) */   /* AUDITORIA A3: nós tubo-tubo */
  var OBRIGATORIOS = { "perfisaco.js": 1, "acomateriais.js": 1, "acosecao.js": 1, "acoanalise.js": 1, "acocargas.js": 1, "acodim8800.js": 1, "acomodelolivre.js": 1, "acodimlivre.js": 1 };
  function agora() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
  /* o aviso do motor vira mensagem no máximo a cada `ms` (e sempre na troca de fase) */
  function limitador(enviar, ms) {
    var ult = -1e9, faseUlt = null;
    return function (p) { var t = agora(); if (p.fase !== faseUlt || t - ult >= ms) { ult = t; faseUlt = p.fase; enviar(p); } };
  }
  function rodar(entrada, op, aoProgresso) {
    var DL = global.AcoDimLivre; if (!DL) return { ok: false, motivo: "O cálculo da estrutura desenhada (js/acodimlivre.js) não carregou." };
    var o = {}; Object.keys(op || {}).forEach(function (k) { o[k] = op[k]; });
    if (typeof aoProgresso === "function") o.aoProgresso = aoProgresso;
    return DL.calcular(entrada, o);
  }
  function limpo(r) { return JSON.parse(JSON.stringify(r)); }
  var API = { MOTORES: MOTORES, rodar: rodar, limpo: limpo, limitador: limitador };
  if (!NO_WORKER) {
    global.AcoLivreWorker = API;
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    return;
  }
  /* ============================================================ WORKER */
  var carregados = null, faltam = [], ver = "";
  try { var mv = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); if (mv) ver = "?v=" + mv[1]; } catch (e) {}
  function carregar() {
    if (carregados) return; carregados = [];
    MOTORES.forEach(function (arq) { try { global.importScripts(arq + ver); carregados.push(arq); } catch (e) { if (OBRIGATORIOS[arq]) faltam.push(arq + " (" + (e && e.message) + ")"); } });
  }
  /* 22/11/2026 ("Calcular e corrigir"): op.leve = a tela recebe o resultado SEM r.analise (as estações de esforço: ~95 % dos
     ~370 MB de JSON por volta no Gabriel) — a autocorreção não as lê. A análise das 2 últimas voltas fica aqui; no fim a tela pede
     a do resultado escolhido ({ tipo: "analise", id }) e recebe só ela. */
  var guardadas = [];
  global.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.tipo === "analise") {
      var g0 = guardadas.filter(function (x) { return x.id === m.de; })[0];
      if (g0 && g0.compacta && global.AcoDimLivre.descompactar) { global.AcoDimLivre.descompactar(g0.analise); g0.compacta = false; }
      var ta = g0 ? JSON.stringify(g0.analise) : "null";
      global.postMessage({ tipo: "analise", id: m.id, de: m.de, achou: !!g0, bytes: ta.length, texto: ta }); return;
    }
    if (m.tipo !== "calcular") return;
    var t0 = Date.now();
    try {
      carregar();
      if (faltam.length) { global.postMessage({ tipo: "erro", id: m.id, mensagem: "Não carregou: " + faltam.join(", ") }); return; }
      var prog = limitador(function (p) { p.tipo = "progresso"; p.id = m.id; global.postMessage(p); }, 250);
      var r = rodar(m.entrada, m.op || {}, prog), an = null;
      if (m.op && m.op.leve && r && r.analise) { an = r.analise; r.analise = null; r._analiseNoWorker = m.id; /* guardada COMPACTADA (Float64Array, os mesmos números): duas análises inteiras vivas no Worker deixavam a volta seguinte 8× mais lenta (coleta de lixo) */
        var cp = !!global.AcoDimLivre.compactar; if (cp) global.AcoDimLivre.compactar(an); guardadas.push({ id: m.id, analise: an, compacta: cp }); if (guardadas.length > 2) guardadas.shift(); }
      var tx = JSON.stringify(r);
      global.postMessage({ tipo: "fim", id: m.id, ms: Date.now() - t0, bytes: tx.length, texto: tx });
    } catch (e) {
      global.postMessage({ tipo: "erro", id: m.id, mensagem: e && e.message ? e.message : String(e), pilha: e && e.stack ? String(e.stack).slice(0, 1200) : "" });
    }
  };
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this)));

/* =====================================================================
 * acocalcworker.js — o CÁLCULO DO GALPÃO num Web Worker (processo paralelo
 * do navegador), para a tela não travar enquanto o motor trabalha (vento,
 * terças e travessas, 2 a 4 rodadas de pórtico com 2ª ordem, ligações).
 *
 * DOIS JEITOS DE RODAR, O MESMO CÓDIGO:
 *   · como Worker (new Worker("js/acocalcworker.js")): carrega os motores
 *     com importScripts, NA ORDEM DO CONTRATO (docs/metalica/CONTRATO.md:
 *     acomateriais, perfisaco, acosecao, acofsm, acodim14762, acosecundarias,
 *     acoanalise, acocargas, acomodelo, acodim8800, acoisopletas, acovento,
 *     acoligcalc, acodimensionar), recebe { tipo: "calcular", id, par, op } e
 *     devolve { tipo: "progresso", etapa, rodada, … } durante o cálculo e
 *     { tipo: "fim", texto } (o resultado em JSON) no fim — ou { tipo: "erro" };
 *   · na página (o <script> do grupo "bim"): registra `AcoCalcWorker` com as
 *     mesmas funções — a tela usa quando o navegador não deixa abrir o Worker
 *     (arquivo local, política do navegador) e para a PRÉVIA do vento (V0, q
 *     e a sucção local na telha, antes de calcular).
 *
 * PROGRESSO SEM MEXER NOS MOTORES: o orquestrador (js/acodimensionar.js)
 * chama os outros motores pelo objeto global. Durante o cálculo, algumas
 * funções são EMBRULHADAS (avisam a etapa e chamam a original) e voltam ao
 * normal no fim, dê certo ou não:
 *   AcoVento.calcular → "vento" · AcoSecundarias.dimensionar → "secundarias"
 *   AcoModelo.cargas → nova RODADA (o orquestrador chama uma vez por rodada)
 *   AcoAnalise.analisar/flambagem → "analise"/"analise80"/"flambagem"
 *   AcoDim8800.verificarBarra → "verificacao" · AcoLigCalc.* → "ligacoes"
 * O VENTO É DO MOTOR: com `par.vento` o orquestrador chama o AcoVento e monta
 * as pressões por face (desde 12/10/2026). A prévia daqui (entradaVento) usa
 * a mesma tradução das faces, só para mostrar V0 e q e escolher o vão da telha.
 * ⚠ O resultado viaja como TEXTO: com o vento ele passa de 20 MB (estações de
 *   todas as barras em todas as combinações) e a cópia estruturada de um objeto
 *   desse tamanho levava segundos; um texto atravessa como um bloco só. A
 *   cópia por JSON também tira as funções (a cópia estruturada recusa função).
 * ===================================================================== */
(function (global) {
  "use strict";

  var NO_WORKER = typeof global.importScripts === "function" && typeof global.document === "undefined";
  var MOTORES = ["acomateriais.js", "perfisaco.js", "acosecao.js", "acofsm.js", "acodim14762.js", "acosecundarias.js", "acoanalise.js", "acocargas.js",
                 "acomodelo.js", "acodim8800.js", "acoisopletas.js", "acovento.js", "acoligcalc.js", "acodimensionar.js"];
  var OBRIGATORIOS = { "acomateriais.js": 1, "perfisaco.js": 1, "acosecao.js": 1, "acoanalise.js": 1, "acocargas.js": 1, "acomodelo.js": 1, "acodim8800.js": 1, "acodimensionar.js": 1 };

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ============================================================ PRÉVIA DO VENTO
   * a entrada do AcoVento.calcular a partir dos parâmetros do cálculo — a mesma
   * tradução que o orquestrador faz (faces → vedação e aberturas, cumeeira, uma
   * água com o beiral alto à DIREITA, que é o lado que o AcoModelo sobe) */
  var FACES = ["frente", "fundo", "esquerda", "direita"];
  function vedacaoDe(tipo) {
    var t = String(tipo || "").toLowerCase();
    if (!t || /abert/.test(t)) return null;
    if (/pr[eé].?moldad/.test(t)) return "pré-moldado";
    if (/misto/.test(t)) return "misto";
    if (/bloco|alvenaria|cer[aâ]mic|concreto/.test(t)) return "alvenaria";
    return "telha";
  }
  function entradaVento(par) {
    var g = (par && par.geometria) || {}, v = (par && par.vento) || {}, f = (par && par.fechamentos) || {};
    var vao = num(g.vao, 20), Lt = num(g.comprimento, 40), H = num(g.peDireito, 6), i = num(g.inclinacaoPct, 10) / 100;
    var aguas = num(g.aguas, 2) === 1 ? 1 : 2, faces = {}, abertas = 0;
    FACES.forEach(function (k) {
      var x = f[k] || { tipo: "telha" }, ved = vedacaoDe(x.tipo);
      var ab = arr(x.aberturas).map(function (o) {
        var a = { area: num(o.area, num(o.largura, 0) * num(o.altura, 0)), dominante: !!o.dominante };
        if (o.s0 != null) a.s0 = num(o.s0, 0); if (o.s1 != null) a.s1 = num(o.s1, 0);
        return a;
      }).filter(function (o) { return o.area > 0; });
      if (ved) faces[k] = { fechada: true, vedacao: ved, aberturas: ab }; else { faces[k] = { fechada: false }; abertas++; }
    });
    return {
      local: { lat: v.lat, lon: v.lon, v0: v.v0, descricao: v.endereco || v.descricao || "" }, s1: v.s1 || { tipo: "plano" },
      categoria: v.categoria || "II", grupoS3: num(v.grupoS3, 2),
      geometria: { a: Lt, b: vao, h: H, hCumeeira: aguas === 1 ? H + vao * i : H + vao / 2 * i, inclinacaoGraus: Math.atan(i) * 180 / Math.PI,
                   cobertura: aguas === 1 ? "uma-agua" : "duas-aguas", aberta: abertas === 4, ladoAlto: aguas === 1 ? "direita" : undefined },
      faces: faces
    };
  }
  function calcularVento(par) {
    var V = global.AcoVento; if (!V || !V.calcular) return { ok: false, erros: ["o motor de vento (js/acovento.js) não carregou"] };
    try { return V.calcular(entradaVento(par), { isopletas: global.AcoIsopletas || null }); } catch (e) { return { ok: false, erros: ["vento: " + (e && e.message ? e.message : e)] }; }
  }

  /* ============================================================ PROGRESSO */
  function comProgresso(fn, aviso) {
    var M = global.AcoModelo, A = global.AcoAnalise, D = global.AcoDim8800, V = global.AcoVento, S = global.AcoSecundarias, L = global.AcoLigCalc;
    var orig = [], rodada = 0, nVer = 0, ultimo = 0, t0 = Date.now();
    function av(x) { x.rodada = rodada; x.ms = Date.now() - t0; try { aviso(x); } catch (e) {} }
    function embrulha(obj, nome, antes) {
      if (!obj || typeof obj[nome] !== "function") return;
      var f0 = obj[nome]; orig.push([obj, nome, f0]);
      obj[nome] = function () { antes.apply(this, arguments); return f0.apply(this, arguments); };
    }
    embrulha(V, "calcular", function () { av({ etapa: "vento" }); });
    embrulha(S, "dimensionar", function () { av({ etapa: "secundarias" }); });
    embrulha(M, "cargas", function () { rodada++; nVer = 0; av({ etapa: "modelo" }); });
    embrulha(A, "analisar", function (mod, op) {
      var n = op && op.combinacoes ? op.combinacoes.length : 0, red = op && op.combinacoes && op.combinacoes.some(function (c) { return c && c.reducaoRigidez; });
      av({ etapa: red ? "analise80" : "analise", combinacoes: n, barras: mod && mod.barras ? mod.barras.length : 0 });
    });
    embrulha(A, "flambagem", function () { av({ etapa: "flambagem" }); });
    embrulha(D, "verificarBarra", function () { nVer++; var t = Date.now(); if (t - ultimo > 150) { ultimo = t; av({ etapa: "verificacao", n: nVer }); } });
    if (L) Object.keys(L).forEach(function (k) { if (typeof L[k] === "function") embrulha(L, k, function () { var t = Date.now(); if (t - ultimo > 150) { ultimo = t; av({ etapa: "ligacoes" }); } }); });
    try { return fn(); }
    finally { orig.forEach(function (o) { o[0][o[1]] = o[2]; }); }
  }

  /* ============================================================ RODAR */
  function rodar(par, op, aviso) {
    aviso = typeof aviso === "function" ? aviso : function () {};
    var D = global.AcoDimensionar;
    if (!D || !D.calcular) return { ok: false, motivo: "O motor do cálculo (js/acodimensionar.js) não carregou." };
    return comProgresso(function () { return D.calcular(JSON.parse(JSON.stringify(par || {})), op || {}); }, aviso);
  }
  /* o mesmo galpão com a OUTRA condição de base (AcoDimensionar.alternativaBase): `atual` é o
     resumo do resultado da tela (só o que a comparação lê — peso, perfis, reações, placa de base) */
  function rodarAlternativa(par, op, atual, aviso) {
    aviso = typeof aviso === "function" ? aviso : function () {};
    var D = global.AcoDimensionar;
    if (!D || !D.alternativaBase) return { ok: false, motivo: "O motor desta versão não compara as bases (AcoDimensionar.alternativaBase)." };
    return comProgresso(function () { return D.alternativaBase(JSON.parse(JSON.stringify(par || {})), op || {}, atual || null); }, aviso);
  }
  /* cópia sem funções (o que a cópia estruturada aceita) */
  function limpo(r) { return JSON.parse(JSON.stringify(r)); }

  var API = { MOTORES: MOTORES, entradaVento: entradaVento, calcularVento: calcularVento, rodar: rodar, rodarAlternativa: rodarAlternativa, limpo: limpo, comProgresso: comProgresso };

  if (!NO_WORKER) {
    global.AcoCalcWorker = API;
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    return;
  }

  /* ============================================================ WORKER */
  var carregados = null, faltam = [], opcionais = [], ver = "";
  try { var m = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); if (m) ver = "?v=" + m[1]; } catch (e) {}
  function carregar() {
    if (carregados) return;
    carregados = [];
    MOTORES.forEach(function (arq) {
      try { global.importScripts(arq + ver); carregados.push(arq); }
      catch (e) { if (OBRIGATORIOS[arq]) faltam.push(arq); else opcionais.push(arq); }
    });
  }
  global.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.tipo !== "calcular" && m.tipo !== "alternativaBase") return;
    var t0 = Date.now();
    try {
      carregar();
      global.postMessage({ tipo: "motores", id: m.id, carregados: carregados, faltam: faltam, opcionais: opcionais });
      if (faltam.length) { global.postMessage({ tipo: "erro", id: m.id, mensagem: "Não carregou: " + faltam.join(", ") }); return; }
      var prog = function (p) { p.tipo = "progresso"; p.id = m.id; global.postMessage(p); };
      var r = m.tipo === "alternativaBase" ? rodarAlternativa(m.par, m.op, m.atual, prog) : rodar(m.par, m.op, prog);
      var tx = JSON.stringify(r);
      global.postMessage({ tipo: "fim", id: m.id, ms: Date.now() - t0, bytes: tx.length, texto: tx });
    } catch (e) {
      global.postMessage({ tipo: "erro", id: m.id, mensagem: e && e.message ? e.message : String(e), pilha: e && e.stack ? String(e.stack).slice(0, 1200) : "" });
    }
  };
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this)));

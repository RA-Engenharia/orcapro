/* =====================================================================
 * mor/porque.js — «POR QUÊ?» E «CONFERIR» (F7 do MOR, ESPEC §7 e §16.5)
 *
 * Cada linha que o motor gerou carrega `item.mor`. Este arquivo transforma isso em explicação humana e decide
 * quais linhas levam a marca amarela «conferir»:
 *   explicar(item) → { regra, formula, formulaNumeros, premissas[], origem:{codigo,rotulo}, elemento, porque, … }
 *   origem: medido (a quantidade está ESCRITA no documento) · implicito (consequência de outro serviço) ·
 *           sugerido (o motor sugere; só entra com o seu OK) · memoria (decidido igual antes) ·
 *           casador (código achado pelo texto) · composta (composição própria por família) · estimado (regra por área)
 *   precisaConferir(item): tudo o que NÃO é medido/estimado com confiança alta e não foi confirmado.
 *   conferir(orc, etapaId?, itemId?, quem) marca OK (só `mor.conferido`/`conferidoEm`/`conferidoPor`; nada de preço/quantidade).
 * Puro, ES5, sem DOM. Não toca cálculo nenhum.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function fmt(v) { return typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v); }

  var ROTULOS = {
    medido: "medido — a quantidade está escrita no documento",
    implicito: "implícito — consequência de outro serviço",
    sugerido: "sugerido — o motor sugere; só vale com o seu OK",
    memoria: "memória — decidido igual nas vezes anteriores",
    casador: "casado pelo texto — o código foi achado pela descrição",
    composta: "composição própria por família — a partir de uma composição SINAPI irmã",
    estimado: "estimado — regra por área/geometria do catálogo"
  };

  function origemDe(mor) {
    mor = mor || {};
    if (mor.origem === "memoria" || (mor.casamento && mor.casamento.memoria) || mor.via === "memoria") return "memoria";
    if (mor.origem === "composta") return "composta";
    if (mor.origem === "casador") return "casador";
    if (mor.origem === "documento") return "medido";
    if (mor.origem === "ifc" && ROTULOS[mor.qtdOrigem]) return mor.qtdOrigem;   /* F13: o orçamento pelo modelo já traz a origem de cada linha */
    if (mor.qtdOrigem === "sugerido") return "sugerido";
    if (mor.qtdOrigem === "implicito") return "implicito";
    return "estimado";
  }

  /* «Ap*1.15» com Ap = 120 → «120 × 1,15»; devolve também o resultado se a quantidade for conhecida */
  function formulaComNumeros(mor, quantidade) {
    var f = mor && mor.formula; if (f === undefined || f === null || f === "") return "";
    var vars = (mor && mor.vars) || {}, achou = false;
    var t = String(f).replace(/[A-Za-z_][A-Za-z0-9_.]*/g, function (nome) {
      if (Object.prototype.hasOwnProperty.call(vars, nome)) { achou = true; return typeof vars[nome] === "boolean" ? (vars[nome] ? "sim" : "não") : fmt(vars[nome]); }
      return nome;
    }).replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\s+/g, " ");
    return t + (quantidade !== undefined && quantidade !== null ? " = " + fmt(Number(quantidade)) : "") + (achou ? "" : "");
  }

  function explicar(it) {
    var mor = (it && it.mor) || null;
    if (!mor) return { tem: false };
    var o = origemDe(mor);
    return {
      tem: true,
      regra: mor.regra || "",
      formula: mor.formula || "",
      formulaNumeros: formulaComNumeros(mor, it.quantidade),
      variaveis: mor.vars || {},
      premissas: arr(mor.premissas),
      origem: { codigo: o, rotulo: ROTULOS[o] },
      elemento: mor.elementoOrigem || "",
      porque: mor.porque || "",
      casamento: mor.casamento || null,
      composicao: mor.composicao || null,
      confianca: mor.confianca || "",
      conferido: mor.conferido === true,
      conferidoEm: mor.conferidoEm || "",
      conferir: precisaConferir(it)
    };
  }

  function precisaConferir(it) {
    var mor = it && it.mor; if (!mor || mor.conferido === true) return false;
    var o = origemDe(mor);
    if (o === "sugerido" || o === "memoria" || o === "casador" || o === "composta" || o === "implicito") return true;
    return mor.confianca !== "alta";
  }

  function contar(orc, etapaId) {
    var n = 0;
    arr(orc && orc.etapas).forEach(function (e) { if (etapaId && e.id !== etapaId) return; arr(e.itens).forEach(function (it) { if (precisaConferir(it)) n++; }); });
    return n;
  }

  /* marca OK. etapaId+itemId = um item; só etapaId = todos da etapa; nada = todos do orçamento. Devolve quantos marcou. */
  function conferir(orc, etapaId, itemId, quem, agora) {
    var n = 0, em = agora || new Date().toISOString();
    arr(orc && orc.etapas).forEach(function (e) {
      if (etapaId && e.id !== etapaId) return;
      arr(e.itens).forEach(function (it) {
        if (itemId && it.id !== itemId) return;
        if (!precisaConferir(it)) return;
        it.mor.conferido = true; it.mor.conferidoEm = em; it.mor.conferidoPor = quem || "";
        n++;
      });
    });
    return n;
  }

  var Porque = { ROTULOS: ROTULOS, origemDe: origemDe, explicar: explicar, precisaConferir: precisaConferir, contar: contar, conferir: conferir, formulaComNumeros: formulaComNumeros };
  if (typeof module !== "undefined" && module.exports) module.exports = Porque;
  global.MorPorque = Porque;
})(typeof window !== "undefined" ? window : globalThis);

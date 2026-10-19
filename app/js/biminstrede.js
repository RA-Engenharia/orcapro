/* =====================================================================
 * biminstrede.js — a op "hidRede" do editor: a LINHA DA REDE de esgoto que o projetista desenha (eixo por onde passa o
 * coletor/subcoletor). PROJETO INTELIGENTE, etapa 2 (17/10/2026). Só o registro da op no replay (BimEdit.estender):
 *   { op: "hidRede", id, pontos: [{x, z}, …] (de montante para a SAÍDA), baldrame?: "por_baixo" | "atravessar",
 *     cotaTerreno?: m, nome? }        → estado.hidRedes = [{ id, pontos, baldrame, cotaTerreno, nome }]
 *   apagar com o id tira a linha.
 * ⚠ FICA NO GRUPO "bim" (sempre carregado com o BIM), não no "hidro": o BimEdit.sanear DESCARTA op que nenhum motor
 *   conhece — abrir e salvar uma obra com a linha da rede sem o grupo hidro carregado apagava a linha para sempre.
 * O que a linha GERA (coletor, caixas de inspeção, ramais, baldrame) é do js/hidrede.js (grupo hidro).
 * ===================================================================== */
(function (global) {
  "use strict";
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  var MODOS = { por_baixo: 1, atravessar: 1 };
  function valida(o) {
    if (!o || o.op !== "hidRede") return undefined;
    return o.id != null && Array.isArray(o.pontos) && o.pontos.length >= 2 && o.pontos.length <= 200 && o.pontos.every(function (p) { return p && fin(p.x) && fin(p.z); }) &&
      (o.baldrame == null || !!MODOS[o.baldrame]) && (o.cotaTerreno == null || fin(o.cotaTerreno));
  }
  var Ext = {
    nome: "hidRede",
    valida: valida,
    aplicar: function (o, ctx) {
      var M = ctx.ext.hidRede || (ctx.ext.hidRede = { porId: {}, ordem: [] });
      if (o.op === "hidRede") {
        if (!valida(o)) return false;
        M.porId[o.id] = { id: o.id, pontos: o.pontos.map(function (p) { return { x: num(p.x, 0), z: num(p.z, 0) }; }), baldrame: o.baldrame || "por_baixo",
                          cotaTerreno: o.cotaTerreno == null ? null : num(o.cotaTerreno, 0), nome: o.nome ? String(o.nome).slice(0, 60) : "" };
        if (M.ordem.indexOf(o.id) < 0) M.ordem.push(o.id);
        return true;
      }
      if (o.op === "apagar" && o.id != null && M.porId[o.id]) { delete M.porId[o.id]; M.ordem.splice(M.ordem.indexOf(o.id), 1); return true; }
      return false;
    },
    fim: function (ctx, saida) {
      var M = ctx.ext.hidRede; if (!M || !M.ordem.length) return;
      saida.hidRedes = M.ordem.map(function (id) { return JSON.parse(JSON.stringify(M.porId[id])); });
    }
  };
  function registrar() {
    var BE = global.BimEdit || (typeof require === "function" ? (function () { try { return require("./bimedit.js"); } catch (e) { return null; } })() : null);
    if (BE && BE.estender) BE.estender(Ext);
    return !!BE;
  }
  registrar();
  var BimInstRede = { VERSAO: 1, valida: valida, registrar: registrar, MODOS: MODOS };
  global.BimInstRede = BimInstRede;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

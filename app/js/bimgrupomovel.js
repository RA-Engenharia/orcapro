/* =====================================================================
 * bimgrupomovel.js — GRUPO MÓVEL: o portão (ou a folha) que é feito de VOLUMES soltos, e não de uma família (motor puro)
 *
 * Por que existe. Portão ripado, portão de garagem, grade e folha de vidro modelados peça a peça (montantes, travessas,
 * lâminas — cada uma um volume livre) não têm família para declarar a parte móvel. A op `movel` agrupa esses elementos e
 * diz o movimento do conjunto: ele abre no clique do 3D como qualquer porta (js/bimabrirui.js, js/partesmoveis.js).
 *
 *   { op: "movel", id: "portao-1", nome: "Portão de pedestres", categoria: "porta" | "janela" | "generico",
 *     ids: ["<id de volume>", …],                       os elementos que andam juntos
 *     parte: { tipo: "giro" | "basculante" | "pivotante" | "correr" | "gaveta",
 *              eixo: [x, y, z], dir?: [dx, dy, dz], angulo: graus (0 a 180), sentido: 1 | −1,     (rotação)
 *              vetor: [vx, vy, vz], curso: metros }                                                (translação)
 *     }                                                  coordenadas do MODELO (as mesmas da op `familia`: X, Y = altura, Z)
 *
 * O estado aberto/fechado NÃO está na op (é da sessão): abrir um portão não muda o quantitativo nem o orçamento.
 * Op nova, sem migração: modelo antigo não a tem e abre igual.
 * ES5, IIFE, Node-testável.
 * ===================================================================== */
(function (global) {
  "use strict";

  function PMo() {
    if (global.PartesMoveis) return global.PartesMoveis;
    if (typeof require === "function") { try { return require("./partesmoveis.js"); } catch (e) { return null; } }
    return null;
  }
  function fin(v) { return typeof v === "number" && isFinite(v); }

  /* a parte normalizada de uma op (ou null) */
  function normalizar(o) {
    var PM = PMo(); if (!PM || !o || !o.parte || typeof o.parte !== "object") return null;
    var d = {}; Object.keys(o.parte).forEach(function (k) { d[k] = o.parte[k]; });
    d.id = "grupo"; d.nome = o.nome || d.nome || "Portão";
    var r = PM.normalizar(d);
    return r.ok ? r.parte : null;
  }
  function valida(o) {
    if (!o || o.op !== "movel") return undefined;
    if (o.id == null || !Array.isArray(o.ids) || !o.ids.length) return false;
    if (!o.ids.every(function (x) { return (typeof x === "string" && x.length > 0) || fin(x); })) return false;
    return !!normalizar(o);
  }
  function aplicar(o, ctx) {
    if (!o || o.op !== "movel") return false;
    if (!valida(o)) return false;
    var m = ctx.ext.moveis = ctx.ext.moveis || { ordem: [], por: {} };
    if (!m.por[o.id]) m.ordem.push(o.id);
    m.por[o.id] = { id: String(o.id), nome: String(o.nome || "Portão").slice(0, 80), categoria: o.categoria === "janela" || o.categoria === "generico" ? o.categoria : "porta",
                    ids: o.ids.map(String), parte: normalizar(o) };
    return true;
  }
  /* no fim do replay: só os elementos que EXISTEM entram no grupo (apagou um volume, o resto segue) */
  function fim(ctx, saida) {
    var m = ctx.ext && ctx.ext.moveis; if (!m) return;
    var existe = {};
    (saida.volumes || []).forEach(function (v) { existe[String(v.id)] = 1; });
    (saida.caixas || []).forEach(function (c) { existe[String(c.id)] = 1; });
    saida.moveisGrupo = m.ordem.map(function (id) {
      var g = m.por[id];
      return { id: g.id, nome: g.nome, categoria: g.categoria, parte: g.parte, ids: g.ids.filter(function (x) { return existe[x]; }) };
    }).filter(function (g) { return g.ids.length; });
  }

  var BimGrupoMovel = { normalizar: normalizar, valida: valida, aplicar: aplicar, fim: fim };
  global.BimGrupoMovel = BimGrupoMovel;
  if (typeof global.BimEdit !== "undefined" && global.BimEdit && global.BimEdit.estender) global.BimEdit.estender({ nome: "grupomovel", valida: valida, aplicar: aplicar, fim: fim });
  else if (typeof require === "function" && typeof module !== "undefined") {
    /* em Node o teste registra explicitamente (BimEdit.estender(BimGrupoMovel.extensao)) */
  }
  BimGrupoMovel.extensao = { nome: "grupomovel", valida: valida, aplicar: aplicar, fim: fim };
  if (typeof module !== "undefined" && module.exports) module.exports = BimGrupoMovel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

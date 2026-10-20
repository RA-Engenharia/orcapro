/* =====================================================================
 * biminstpiscina.js — a op "hidPiscina" do editor + os SISTEMAS de tubulação da piscina (frente PISCINA, 18/10/2026).
 * Só o REGISTRO (replay e sistemas). O que a piscina GERA (dispositivos, casa de máquinas, tubos) é do js/hidpiscinarede.js.
 *
 *   { op: "hidPiscina", id, nome?, ref?: { tipo: "volume" | "caixa" | "ifc", id }, contorno?: [{x, z}, …],
 *     yBorda?, bordaLivre?, profRasa?, profFunda?, params?: {…}, cm?: { x, z, rotY } }
 *       → estado.hidPiscinas = [{ id, nome, ref, contorno, yBorda, bordaLivre, profRasa, profFunda, params, cm }]
 *   apagar com o id tira a piscina (os tubos e as peças que ela gerou saem pelo lote do js/hidpiscinarede.js).
 *
 * ⚠ FICA NO GRUPO "bim" (sempre carregado), como o js/biminstrede.js: o BimEdit.sanear DESCARTA op que nenhum motor
 *   conhece, e o BimInst descarta trecho de sistema desconhecido — abrir e salvar a obra sem o grupo hidro apagava a
 *   piscina e todos os tubos dela para sempre.
 * ⚠ SISTEMAS: sucção, retorno, hidromassagem, aquecimento e dreno/descarte são sistemas PRÓPRIOS (não "água fria"):
 *   o cálculo de água fria (js/hidaf.js, js/hidgrafo.js) lê os trechos de agua_fria — tubo de piscina lá dentro
 *   entraria na vazão de pico do prédio. Grupo "agua" = as aplicações e a SINAPI do tubo de PVC soldável (o mesmo
 *   produto); a cor de cada um separa sucção de retorno na planta (convenção RA; não achei norma de simbologia).
 * ===================================================================== */
(function (global) {
  "use strict";
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  var REF = { volume: 1, caixa: 1, ifc: 1 };
  var MAX_PONTOS = 400, MAX_PARAMS = 8000;   /* contorno até 400 vértices; params até 8 kB de JSON (cabe na lista da nuvem) */

  var SISTEMAS = {
    pisc_succao:  { nome: "Piscina — sucção", abrev: "PS", cor: "#00838F", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true },
    pisc_retorno: { nome: "Piscina — retorno", abrev: "PR", cor: "#29B6F6", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true },
    pisc_hidro:   { nome: "Piscina — hidromassagem", abrev: "PH", cor: "#7E57C2", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true },
    pisc_aquec:   { nome: "Piscina — aquecimento", abrev: "PA", cor: "#EF6C00", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true },
    pisc_dreno:   { nome: "Piscina — dreno e descarte", abrev: "PD", cor: "#8D6E63", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true },
    /* REPOSIÇÃO (frente C, 19/10/2026): a água potável que repõe o tanque, da espera da rede da obra até a bica de descarga
       livre. Sistema PRÓPRIO pelo mesmo motivo dos outros: fora do cálculo de pico de água fria do prédio (a reposição é
       manual, por registro, fora do horário de pico) — o projetista de água fria soma o ponto se quiser */
    pisc_reposicao: { nome: "Piscina — reposição de água potável", abrev: "PW", cor: "#1565C0", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel"], material: "pvc_soldavel", piscina: true }
  };
  function registrarSistemas() {
    var BI = global.BimInst || (typeof require === "function" ? (function () { try { return require("./biminst.js"); } catch (e) { return null; } })() : null);
    if (!BI || !BI.SISTEMAS) return false;
    Object.keys(SISTEMAS).forEach(function (k) { if (!BI.SISTEMAS[k]) BI.SISTEMAS[k] = JSON.parse(JSON.stringify(SISTEMAS[k])); });
    return true;
  }

  function contornoOk(c) { return Array.isArray(c) && c.length >= 3 && c.length <= MAX_PONTOS && c.every(function (p) { return p && fin(p.x) && fin(p.z); }); }
  function valida(o) {
    if (!o || o.op !== "hidPiscina") return undefined;
    if (o.id == null) return false;
    if (o.ref != null && !(o.ref && REF[o.ref.tipo] && o.ref.id != null)) return false;
    if (o.contorno != null && !contornoOk(o.contorno)) return false;
    /* sem geometria = op de ATUALIZAÇÃO (mover a casa de máquinas, trocar um parâmetro): precisa trazer alguma coisa */
    if (o.ref == null && o.contorno == null && o.cm == null && o.params == null && o.yBorda == null && o.bordaLivre == null && o.profRasa == null && o.profFunda == null && o.nome == null) return false;
    var nums = ["yBorda", "bordaLivre", "profRasa", "profFunda"];
    for (var i = 0; i < nums.length; i++) if (o[nums[i]] != null && !fin(o[nums[i]])) return false;
    if (o.cm != null && !(o.cm && fin(o.cm.x) && fin(o.cm.z) && (o.cm.rotY == null || fin(o.cm.rotY)))) return false;
    if (o.params != null) { if (typeof o.params !== "object") return false; try { if (JSON.stringify(o.params).length > MAX_PARAMS) return false; } catch (e) { return false; } }
    return true;
  }
  var Ext = {
    nome: "hidPiscina",
    valida: valida,
    aplicar: function (o, ctx) {
      var M = ctx.ext.hidPiscina || (ctx.ext.hidPiscina = { porId: {}, ordem: [] });
      if (o.op === "hidPiscina") {
        if (!valida(o)) return false;
        if (!M.porId[o.id] && o.ref == null && o.contorno == null) return false;   /* atualização de piscina que não existe */
        var ant = M.porId[o.id] || {};
        /* a op REPETIDA com o mesmo id ATUALIZA (só o que veio): mover a casa de máquinas grava { id, cm } sem repetir o resto */
        var p = { id: o.id, nome: o.nome != null ? String(o.nome).slice(0, 60) : (ant.nome || "Piscina"),
                  ref: o.ref != null ? { tipo: o.ref.tipo, id: o.ref.id } : (ant.ref || null),
                  contorno: o.contorno != null ? o.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }) : (ant.contorno || null),
                  params: o.params != null ? JSON.parse(JSON.stringify(o.params)) : (ant.params || {}),
                  cm: o.cm != null ? { x: num(o.cm.x, 0), z: num(o.cm.z, 0), rotY: num(o.cm.rotY, 0) } : (ant.cm || null) };
        ["yBorda", "bordaLivre", "profRasa", "profFunda"].forEach(function (k) { p[k] = o[k] != null ? num(o[k], null) : (ant[k] != null ? ant[k] : null); });
        M.porId[o.id] = p;
        if (M.ordem.indexOf(o.id) < 0) M.ordem.push(o.id);
        return true;
      }
      if (o.op === "apagar" && o.id != null && M.porId[o.id]) { delete M.porId[o.id]; M.ordem.splice(M.ordem.indexOf(o.id), 1); return true; }
      return false;
    },
    fim: function (ctx, saida) {
      var M = ctx.ext.hidPiscina; if (!M || !M.ordem.length) return;
      saida.hidPiscinas = M.ordem.map(function (id) { return JSON.parse(JSON.stringify(M.porId[id])); });
    }
  };
  function registrar() {
    var BE = global.BimEdit || (typeof require === "function" ? (function () { try { return require("./bimedit.js"); } catch (e) { return null; } })() : null);
    if (BE && BE.estender) BE.estender(Ext);
    registrarSistemas();
    return !!BE;
  }
  registrar();
  var BimInstPiscina = { VERSAO: 1, valida: valida, registrar: registrar, registrarSistemas: registrarSistemas, SISTEMAS: SISTEMAS };
  global.BimInstPiscina = BimInstPiscina;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstPiscina;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

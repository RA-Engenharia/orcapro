/* =====================================================================
 * bimnivelmover.js — MOVER UM NÍVEL SEM MEXER NA VOLUMETRIA (motor PURO, ES5, Node-testável).
 *
 * Pedido do Rogério (16/11/2026): "ao editar a elevação de um nível, opção 'Manter os elementos onde estão'".
 *
 * Por que existe: as peças do modelador guardam o NÍVEL e o DESLOCAMENTO (js/bimarq.js, P1-B), não a cota
 * absoluta. Mudou a elevação do nível, tudo o que está preso a ele acompanha — é o comportamento de sempre e
 * continua o PADRÃO. Com a opção marcada, cada peça presa ao nível recebe o deslocamento compensatório
 * (base −Δ, topo −Δ) e fica exatamente na mesma posição 3D: o que muda é só a cota do nível.
 *
 *   BimNivelMover.deltas(antes, depois)          → { idDoNivel: Δ } (só os que andaram mais de 0,1 mm)
 *   BimNivelMover.compensar(estado, deltas)      → { ops: [ajustar…], n }   (estado = BimEdit.aplicar(...) de AGORA)
 *   BimNivelMover.lote(ops, id)                  → { op:'lote', … } (UM Ctrl+Z desfaz tudo) ou null
 *   BimNivelMover.encaixar(niveis, id, cota)     → lista nova com o nível na cota (sem gravar nada)
 *
 * Quem acompanha o nível: só a peça v:2 (nivelBase / restricaoSuperior). A peça v:1 (cota absoluta + nivelId
 * informativo) já FICA onde nasceu por conta da migração do replay — não precisa de compensação.
 * Famílias livres, tubos e portas hospedadas: as livres têm cota absoluta (ficam); a hospedada pega a base
 * da parede, que a compensação mantém — ficam também. ⚠ Nada aqui grava: quem grava é o gestao.js.
 *
 * Teste: node tools/test-bim-nivel-manter.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL = 1e-4;   /* 0,1 mm: abaixo disto o nível "não andou" */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function mapa(niveis) {
    var m = {};
    arr(niveis).forEach(function (n) {
      if (!n || n.id == null) return;
      var e = Number(n.elevacao); if (!isFinite(e)) return;
      m[String(n.id)] = e;
    });
    return m;
  }

  /* quanto cada nível andou (depois − antes); nível novo ou excluído não entra */
  function deltas(antes, depois) {
    var a = mapa(antes), d = mapa(depois), out = {};
    Object.keys(d).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(a, id)) return;
      var dz = d[id] - a[id];
      if (Math.abs(dz) > TOL) out[id] = r6(dz);
    });
    return out;
  }

  var VERTICAIS = { parede: 1, pilar: 1, escada: 1 };
  var DE_NIVEL = { laje: 1, viga: 1, cobertura: 1 };

  /* o estado do replay de AGORA (níveis antigos) → as ops `ajustar` com o deslocamento já compensado */
  function compensar(estado, deltasMap) {
    var ops = [], dl = deltasMap || {};
    if (!Object.keys(dl).length) return { ops: ops, n: 0 };
    var lista = arr(estado && estado.caixas).concat(arr(estado && estado.coberturas));
    lista.forEach(function (c) {
      if (!c || c.id == null || c.v !== 2 || !(VERTICAIS[c.tipo] || DE_NIVEL[c.tipo])) return;
      var r = {}, mexeu = false;
      var nb = c.nivelBase != null && c.nivelBase !== "" ? String(c.nivelBase) : null;
      if (nb != null && Object.prototype.hasOwnProperty.call(dl, nb) && fin(c.deslocBase)) {
        r.nivelBase = nb; r.deslocBase = r6(c.deslocBase - dl[nb]); mexeu = true;
      }
      if (VERTICAIS[c.tipo]) {
        var rs = c.restricaoSuperior != null && c.restricaoSuperior !== "" ? String(c.restricaoSuperior) : null;
        if (rs != null && Object.prototype.hasOwnProperty.call(dl, rs)) {
          var ds = fin(c.deslocSuperior) ? c.deslocSuperior : 0;
          r.restricaoSuperior = rs; r.deslocSuperior = r6(ds - dl[rs]); mexeu = true;
        }
      }
      if (mexeu) ops.push({ op: "ajustar", id: c.id, campos: { restricoes: r } });
    });
    return { ops: ops, n: ops.length };
  }

  function lote(ops, id) {
    if (!arr(ops).length) return null;
    return { op: "lote", id: id || ("nv" + Date.now().toString(36)), origem: "nivel", pedido: "Mover nível mantendo os elementos", ops: ops };
  }

  /* "Encaixar nível no topo de…": o nível vai para a cota da peça (arredondada a 1 mm) */
  function encaixar(niveis, id, cota) {
    var c = Number(cota); if (!isFinite(c)) return null;
    var achou = false;
    var nova = arr(niveis).map(function (n) {
      if (n && String(n.id) === String(id)) { achou = true; var o = {}; Object.keys(n).forEach(function (k) { o[k] = n[k]; }); o.elevacao = Math.round(c * 1000) / 1000; return o; }
      return n;
    });
    return achou ? nova : null;
  }

  var BimNivelMover = { deltas: deltas, compensar: compensar, lote: lote, encaixar: encaixar, TOL: TOL };
  global.BimNivelMover = BimNivelMover;
  /* a ponte fina com a tela: o Desfazer/Refazer do editor (js/bim.js) pede a cota do nível de volta ao Gestao */
  global.BimNivelMoverUI = { restaurar: function (mapa) { var G = global.Gestao; if (G && G._nivRestaurar) G._nivRestaurar(mapa); } };
  if (typeof module !== "undefined" && module.exports) module.exports = BimNivelMover;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimparafusosver.js — "MOSTRAR PARAFUSOS" no 3D (21/11/2026). ES5.
 *
 * Milhares de parafusos (o Pedido Gabriel parafusado tem ~1.700 peças de
 * fixação) não podem travar a cena. O 3D (js/bim.js) faz cada parafuso em no
 * máximo DUAS malhas — o corpo (cabeça, haste, porca) e o detalhe (rosca e
 * arruelas), cada uma com os sólidos juntos numa geometria só — guardadas
 * por peça (o cache metGeo) e fora da malha mesclada; aqui fica o NÍVEL DE
 * DETALHE pela distância da câmera (js/metalparafusos.js lod):
 *   auto   (padrão) — de perto tudo; no meio só o corpo; de longe somem;
 *   sempre — tudo, a qualquer distância;   nunca — nenhum.
 * Escondido = camada 7 (a câmera e o clique não veem; .visible fica com
 * quem oculta/isola elemento). A escolha fica neste computador.
 *   registrar(mesh, det) · limpar() · atualizar(camera, forcar) ·
 *   alternar() → modo · modo() · rotulo(modo) · definir(modo)
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE = "orcapro:bim:parafusos-ver", MODOS = ["auto", "sempre", "nunca"], ROT = { auto: "automático (só de perto)", sempre: "sempre", nunca: "ocultos" };
  var lista = [], modoAtual = "auto", tUlt = 0, sujo = true, CAMADA_OCULTA = 7;
  try { var v = global.localStorage && global.localStorage.getItem(CHAVE); if (MODOS.indexOf(v) >= 0) modoAtual = v; } catch (e) {}
  function lod(d) { var P = global.MetalParafusos; if (P && P.lod) return P.lod(d); return d <= 6 ? "detalhe" : d <= 25 ? "simples" : "oculto"; }
  function registrar(mesh, det) { lista.push({ m: mesh, det: !!det, P: null }); sujo = true; }
  function limpar() { lista = []; sujo = true; }
  function mostrar(m, sim) { if (sim) { m.layers.set(0); m.layers.enable(1); } else m.layers.set(CAMADA_OCULTA); }
  function atualizar(camera, forcar) {
    if (!camera || !lista.length) return 0;
    var agora = Date.now(); if (!forcar && !sujo && agora - tUlt < 120) return 0;
    tUlt = agora; sujo = false;
    var cp = camera.position, n = 0;
    for (var i = 0; i < lista.length; i++) {
      var e = lista[i], m = e.m, ver;
      if (modoAtual === "sempre") ver = true;
      else if (modoAtual === "nunca") ver = false;
      else {
        if (!e.P) { var g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); var c = g.boundingSphere.center; m.updateMatrixWorld && m.updateMatrixWorld(); var me = m.matrixWorld.elements; e.P = [me[0] * c.x + me[4] * c.y + me[8] * c.z + me[12], me[1] * c.x + me[5] * c.y + me[9] * c.z + me[13], me[2] * c.x + me[6] * c.y + me[10] * c.z + me[14]]; }
        var dx = e.P[0] - cp.x, dy = e.P[1] - cp.y, dz = e.P[2] - cp.z, nv = lod(Math.sqrt(dx * dx + dy * dy + dz * dz));
        ver = e.det ? nv === "detalhe" : nv !== "oculto";
      }
      mostrar(m, ver); if (ver) n++;
    }
    return n;
  }
  function definir(m) { if (MODOS.indexOf(m) < 0) return modoAtual; modoAtual = m; sujo = true; try { global.localStorage && global.localStorage.setItem(CHAVE, m); } catch (e) {} return modoAtual; }
  function alternar() { return definir(MODOS[(MODOS.indexOf(modoAtual) + 1) % MODOS.length]); }
  var BimParafusosVer = { registrar: registrar, limpar: limpar, atualizar: atualizar, alternar: alternar, definir: definir, modo: function () { return modoAtual; }, rotulo: function (m) { return ROT[m || modoAtual] || m; }, total: function () { return lista.length; }, sujar: function () { sujo = true; } };
  global.BimParafusosVer = BimParafusosVer;
  if (typeof module !== "undefined" && module.exports) module.exports = BimParafusosVer;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

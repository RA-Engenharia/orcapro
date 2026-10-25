/* =====================================================================
 * bimluzassada-uv.js — WORKER CLÁSSICO que abre a UV2 (o "segundo mapa"
 * de textura, só para a luz) com o xatlas (MIT, WASM). Usado pelo
 * js/bimluzassada.js. Ver bim/vendor/jsm/xatlas/ORIGEM.txt.
 *
 * ⚠ CLÁSSICO, não módulo: a fábrica do emscripten reconhece "worker" por
 *   `typeof importScripts == 'function'` — num worker de módulo ela aborta.
 *
 * Mensagem: { cmd:'uv', malhas:[{ id, pos:Float32Array, idx:Uint32Array,
 *   escala }], texel (m), maxTexels, padding }
 * Resposta: { cmd:'uv', malhas:[{ id, xref:Uint32Array (vértice de origem),
 *   idx:Uint32Array, uv:Float32Array (0..1) }], largura, altura, tpu, ms }
 *
 * escala: a malha entra MAIOR ou MENOR no xatlas só para a densidade de
 * texel (o terreno de 275 m entra com escala 0,1 → texel 10× maior); a
 * posição de saída é a original (o worker só devolve índices e UV).
 * ===================================================================== */
'use strict';
var BASE = new URL('../bim/vendor/jsm/xatlas/', self.location.href).href;
importScripts(BASE + 'xatlas.js');

var modPromessa = null, progresso = 0;
function modulo() {
  if (!modPromessa) {
    /* global createXAtlasModule */
    modPromessa = createXAtlasModule({
      locateFile: function (p) { return BASE + p; },
      onAtlasProgress: function (modo, p) { progresso = p; },
      print: function () {}, printErr: function (t) { try { console.warn('xatlas:', t); } catch (e) {} }
    });
  }
  return modPromessa;
}

/* as opções do xatlas: o embind exige TODOS os campos (os padrões são os da Api do pacote) */
var CHART = { fixWinding: false, maxBoundaryLength: 0, maxChartArea: 0, maxCost: 2, maxIterations: 1, normalDeviationWeight: 2,
  normalSeamWeight: 4, roundnessWeight: 0.009999999776482582, straightnessWeight: 6, textureSeamWeight: 0.5, useInputMeshUvs: false };
function pack(tpu, padding) {
  return { bilinear: true, blockAlign: false, bruteForce: false, createImage: false, maxChartSize: 0, padding: padding,
    resolution: 0, rotateCharts: true, rotateChartsToAxis: true, texelsPerUnit: tpu };
}

/* fatia uma malha em pedaços de ≤ 65 000 vértices (o índice de entrada do wrapper é de 16 bits) */
function fatiar(m) {
  var idx = m.idx, pos = m.pos, s = m.escala || 1, pedacos = [], mapa = new Int32Array(pos.length / 3).fill(-1);
  var i = 0;
  while (i < idx.length) {
    var locais = [], tri = [], usados = [];
    for (; i < idx.length; i += 3) {
      var novos = 0;
      for (var q = 0; q < 3; q++) if (mapa[idx[i + q]] < 0) novos++;
      if (locais.length + novos > 65000) break;
      for (var q2 = 0; q2 < 3; q2++) { var v = idx[i + q2]; if (mapa[v] < 0) { mapa[v] = locais.length; locais.push(v); usados.push(v); } tri.push(mapa[v]); }
    }
    var p = new Float32Array(locais.length * 3);
    for (var k = 0; k < locais.length; k++) { var o = locais[k] * 3; p[k * 3] = pos[o] * s; p[k * 3 + 1] = pos[o + 1] * s; p[k * 3 + 2] = pos[o + 2] * s; }
    pedacos.push({ origem: Uint32Array.from(locais), pos: p, idx: Uint16Array.from(tri) });
    for (var u = 0; u < usados.length; u++) mapa[usados[u]] = -1;
  }
  return pedacos;
}

function gerar(M, pedacos, tpu, padding) {
  M.createAtlas();
  pedacos.forEach(function (pd) {
    var d = M.createMesh(pd.pos.length / 3, pd.idx.length, false, false);
    M.HEAPU16.set(pd.idx, d.indexOffset / 2);
    M.HEAPF32.set(pd.pos, d.positionOffset / 4);
    var r = M.addMesh();
    if (r !== 0) throw new Error('xatlas addMesh: erro ' + r);
    pd.meshId = d.meshId;
  });
  M.generateAtlas(CHART, pack(tpu, padding));
  return M.getAtlas();
}

self.onmessage = function (ev) {
  var m = ev.data;
  if (m.cmd !== 'uv') return;
  var t0 = performance.now();
  modulo().then(function (M) {
    var todos = [];
    m.malhas.forEach(function (ml) { fatiar(ml).forEach(function (pd) { pd.malha = ml.id; todos.push(pd); }); });
    /* 1º palpite do texel por unidade pela ÁREA (eficiência de empacotamento ~0,6 com a margem de 2 texels) */
    var area = 0;
    todos.forEach(function (pd) {
      var p = pd.pos, ix = pd.idx;
      for (var t = 0; t < ix.length; t += 3) {
        var a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      }
    });
    var tpu = Math.min(1 / m.texel, Math.sqrt(m.maxTexels * 0.6 / Math.max(1e-6, area)));
    var at = null, tent = 0;
    /* até 12 tentativas, encolhendo o texel até caber (modelo com muita área: o 1º palpite pela área erra para cima) */
    for (; tent < 12; tent++) {
      at = gerar(M, todos, tpu, m.padding || 2);
      var w = at.width, h = at.height;
      if (at.atlasCount <= 1 && w * h <= m.maxTexels * 1.02 && Math.max(w, h) <= 8192) break;
      M.destroyAtlas();
      tpu *= Math.min(at.atlasCount > 1 ? 0.8 : 0.92, Math.sqrt(m.maxTexels / (w * h)) * 0.95, 8192 / Math.max(w, h) * 0.95);
      at = null;
    }
    if (!at) throw new Error('xatlas: o atlas não coube no teto (' + m.maxTexels + ' texels)');
    /* a saída lida direto do HEAPU32 (a Api do pacote truncava em 16 bits) */
    var porMalha = {};
    todos.forEach(function (pd) {
      var d = M.getMeshData(pd.meshId), nv = d.newVertexCount, ni = d.newIndexCount;
      var ix = new Uint32Array(M.HEAPU32.buffer, d.indexOffset, ni).slice();
      var xr = new Uint32Array(M.HEAPU32.buffer, d.originalIndexOffset, nv).slice();
      var uv = new Float32Array(M.HEAPF32.buffer, d.uvOffset, nv * 2).slice();
      M.destroyMeshData(d); try { d.subMeshes.delete(); } catch (e) { /* sem vetor */ }
      for (var k = 0; k < nv; k++) xr[k] = pd.origem[xr[k]];   /* local do pedaço → vértice da malha */
      (porMalha[pd.malha] = porMalha[pd.malha] || []).push({ xref: xr, idx: ix, uv: uv });
    });
    M.destroyAtlas();
    var malhas = [], transf = [];
    m.malhas.forEach(function (ml) {
      var ps = porMalha[ml.id] || [], nv = 0, ni = 0;
      ps.forEach(function (p) { nv += p.xref.length; ni += p.idx.length; });
      var xref = new Uint32Array(nv), idx = new Uint32Array(ni), uv = new Float32Array(nv * 2), ov = 0, oi = 0;
      ps.forEach(function (p) {
        xref.set(p.xref, ov); uv.set(p.uv, ov * 2);
        for (var k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + ov;
        ov += p.xref.length; oi += p.idx.length;
      });
      malhas.push({ id: ml.id, xref: xref, idx: idx, uv: uv }); transf.push(xref.buffer, idx.buffer, uv.buffer);
    });
    self.postMessage({ cmd: 'uv', malhas: malhas, largura: at.width, altura: at.height, tpu: tpu, tentativas: tent + 1, area: area, ms: Math.round(performance.now() - t0) }, transf);
  }).catch(function (e) { self.postMessage({ cmd: 'erro', erro: String(e && e.stack || e) }); });
};

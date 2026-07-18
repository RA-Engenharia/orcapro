// ============================================================
// OrçaPRO — BimPlanta: motor puro da PLANTA BAIXA TÉCNICA
// Cotas automáticas a partir dos AABBs das paredes cortadas.
// ES5 puro, sem dependências — testável em Node (tools/test-bimplanta.js).
//
// Honestidade: as cotas saem dos ALINHAMENTOS das faces das paredes
// retas nos eixos X/Y do modelo (AABB). Parede fora de esquadro
// (diagonal/curva) NÃO entra nas parciais — é contada e declarada.
// ============================================================
var BimPlanta = (function () {
  'use strict';

  // metros → "3,50" (sempre 2 casas, vírgula BR)
  function fmtM(v) { return (Math.round(v * 100) / 100).toFixed(2).replace('.', ','); }

  var TIPOS_PAREDE = { IFCWALL: 1, IFCWALLSTANDARDCASE: 1, IFCWALLELEMENTEDCASE: 1 };

  var finito = function (v) { return typeof v === 'number' && isFinite(v); };

  // Filtra, dos elementos do modelo, as paredes que o plano de corte atravessa.
  // els: [{tipo, aabb:{min:[x,y,z],max:[x,y,z]}}] (mundo, metros, Y vertical)
  // → [{minx,maxx,minz,maxz}]. Ignora AABB com coordenada não-finita (NaN/Infinity):
  // o filtro só olha Y, então um NaN em X/Z passaria e imprimiria "NaN" na prancha.
  function paredesDoCorte(els, yCorte) {
    var out = [];
    (els || []).forEach(function (el) {
      if (!el || !TIPOS_PAREDE[el.tipo] || !el.aabb) return;
      var a = el.aabb;
      if (!finito(a.min[0]) || !finito(a.max[0]) || !finito(a.min[1]) || !finito(a.max[1]) || !finito(a.min[2]) || !finito(a.max[2])) return;
      if (!(a.min[1] < yCorte && a.max[1] > yCorte)) return; // corte não atravessa
      out.push({ minx: a.min[0], maxx: a.max[0], minz: a.min[2], maxz: a.max[2] });
    });
    return out;
  }

  // Solda coordenadas coincidentes (faces encostadas) num tick só — média do grupo.
  // O corte do grupo é pelo DIÂMETRO (dist. ao início do grupo), não pelo gap consecutivo:
  // senão coords encadeadas dentro de `tol` cada (0, tol, 2·tol, ...) fundiriam num tick só e
  // um vão real some da cadeia (encadeamento de linkagem simples).
  function weld(coords, tol) {
    coords.sort(function (a, b) { return a - b; });
    var out = [], grupo = [], ini = null;
    for (var i = 0; i < coords.length; i++) {
      if (grupo.length && (coords[i] - grupo[grupo.length - 1] > tol || coords[i] - ini > tol)) {
        out.push(grupo.reduce(function (s, v) { return s + v; }, 0) / grupo.length);
        grupo = []; ini = null;
      }
      if (!grupo.length) ini = coords[i];
      grupo.push(coords[i]);
    }
    if (grupo.length) out.push(grupo.reduce(function (s, v) { return s + v; }, 0) / grupo.length);
    return out;
  }

  function cadeiaDe(ticks) {
    if (ticks.length < 2) return null;
    var segs = [];
    for (var i = 1; i < ticks.length; i++) segs.push({ a: ticks[i - 1], b: ticks[i], v: ticks[i] - ticks[i - 1] });
    return { ticks: ticks, segs: segs, total: { a: ticks[0], b: ticks[ticks.length - 1], v: ticks[ticks.length - 1] - ticks[0] } };
  }

  // Cadeias de cota automáticas nos 2 eixos da planta.
  // paredes: [{minx,maxx,minz,maxz}] (saída de paredesDoCorte)
  // opts: {tol: weld em m (default 0,012), espMax: menor dimensão em planta acima
  //        da qual a parede é tratada como fora de esquadro (default 0,60),
  //        aspectoMin: razão comprimento/espessura mínima p/ ser reta (default 2,5)}
  // → {x:{ticks,segs,total}|null, z:{...}|null, paredes:n usadas, diagonais:n fora}
  //
  // Só entra na cadeia a parede RETA (alinhada a X ou Z): AABB fino num eixo (menor lado ≤ espMax)
  // E comprido no outro (razão ≥ aspectoMin). Uma parede em 45° CURTA tem AABB quadrado (menor lado
  // pequeno, mas razão ~1) — cairia como reta e imprimiria tick FALSO; a razão a barra e ela é
  // contada como diagonal (declarada no desenho, cotada com a trena).
  function cadeias(paredes, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.012;
    var espMax = opts.espMax != null ? opts.espMax : 0.6;
    var aspectoMin = opts.aspectoMin != null ? opts.aspectoMin : 2.5;
    var tx = [], tz = [], diagonais = 0, usadas = 0;
    (paredes || []).forEach(function (p) {
      var dx = p.maxx - p.minx, dz = p.maxz - p.minz;
      var menor = Math.min(dx, dz), maior = Math.max(dx, dz);
      var reta = menor <= espMax && maior >= menor * aspectoMin;
      if (!reta) { diagonais++; return; } // fora de esquadro OU curta/quadrada: não representa faces
      usadas++;
      tx.push(p.minx, p.maxx);
      tz.push(p.minz, p.maxz);
    });
    return { x: cadeiaDe(weld(tx, tol)), z: cadeiaDe(weld(tz, tol)), paredes: usadas, diagonais: diagonais };
  }

  return { fmtM: fmtM, paredesDoCorte: paredesDoCorte, cadeias: cadeias, _weld: weld };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BimPlanta;

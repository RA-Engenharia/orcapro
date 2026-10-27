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

  // ------------------------------------------------------------------
  // COTAS EXTERNAS LIMPAS (padrão da planta, 27/10/2026): uma cadeia por LADO
  // da planta (topo, base, esquerda, direita) em vez de uma por eixo.
  // Em cada lado entram SÓ: as faces externas dos cantos da parede de fora
  // daquele lado + as duas faces de cada parede interna que ENCOSTA nessa
  // parede de fora (as divisões dos ambientes ao longo da fachada). Fica de
  // fora: parede interna que não chega à parede de fora, vão de porta/janela
  // (não é parede) e peça solta. A cota TOTAL vai por fora da cadeia.
  // Planta: x do modelo para a direita, z para BAIXO (norte em cima) →
  // topo = menor z, base = maior z, esquerda = menor x, direita = maior x.
  // Honestidade: o lado vale pelas paredes de fora que estão na face extrema
  // da planta; recorte interno de planta em L (fachada recuada) não ganha
  // cadeia própria — a cadeia segue a face extrema. Parede fora de esquadro
  // continua contada em `diagonais`, como em cadeias().
  // → {topo,base,esq,dir: {ticks,segs,total}|null, paredes, diagonais}
  // opts: {tol (weld, 0,012), tolEncosta (0,02), tolFachada (0,05), espMax, aspectoMin}
  function ladosPlanta(paredes, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.012;
    var tolEnc = opts.tolEncosta != null ? opts.tolEncosta : 0.02;
    var tolFac = opts.tolFachada != null ? opts.tolFachada : 0.05;
    var espMax = opts.espMax != null ? opts.espMax : 0.6;
    var aspectoMin = opts.aspectoMin != null ? opts.aspectoMin : 2.5;
    var retas = [], diagonais = 0;
    (paredes || []).forEach(function (p) {
      var dx = p.maxx - p.minx, dz = p.maxz - p.minz;
      var menor = Math.min(dx, dz), maior = Math.max(dx, dz);
      if (menor <= espMax && maior >= menor * aspectoMin) retas.push(p); else diagonais++;
    });
    // projeta a parede num lado: u ao longo da fachada, v para DENTRO (0 = face de fora)
    var LADOS = {
      topo: function (p) { return { u0: p.minx, u1: p.maxx, v0: p.minz, v1: p.maxz }; },
      base: function (p) { return { u0: p.minx, u1: p.maxx, v0: -p.maxz, v1: -p.minz }; },
      esq: function (p) { return { u0: p.minz, u1: p.maxz, v0: p.minx, v1: p.maxx }; },
      dir: function (p) { return { u0: p.minz, u1: p.maxz, v0: -p.maxx, v1: -p.minx }; }
    };
    var out = { topo: null, base: null, esq: null, dir: null, faces: {}, paredes: retas.length, diagonais: diagonais };
    Object.keys(LADOS).forEach(function (nome) {
      var T = retas.map(LADOS[nome]);
      if (!T.length) return;
      var vMin = Infinity; T.forEach(function (t) { if (t.v0 < vMin) vMin = t.v0; });
      // paredes de fora deste lado: correm ao longo (u maior que v) e estão na face extrema
      var F = T.filter(function (t) { return (t.u1 - t.u0) >= (t.v1 - t.v0) && Math.abs(t.v0 - vMin) <= tolFac; });
      if (!F.length) return;
      var uMin = Infinity, uMax = -Infinity, vIn = -Infinity;
      F.forEach(function (t) { if (t.u0 < uMin) uMin = t.u0; if (t.u1 > uMax) uMax = t.u1; if (t.v1 > vIn) vIn = t.v1; });
      // perpendiculares que tocam a face de dentro da fachada e seguem para dentro
      var P = T.filter(function (t) {
        return (t.u1 - t.u0) <= (t.v1 - t.v0) && t.v0 <= vIn + tolEnc && t.v1 > vIn + tolEnc &&
          t.u1 >= uMin - tolFac && t.u0 <= uMax + tolFac;
      });
      var divisoes = [];
      var uA = uMin, uB = uMax;
      P.forEach(function (t) {
        // canto: parede de ponta da fachada — só a face de FORA do canto entra
        if (t.u0 <= uMin + tolFac || t.u1 >= uMax - tolFac) { if (t.u0 < uA) uA = t.u0; if (t.u1 > uB) uB = t.u1; }
        else divisoes.push(t);
      });
      var ticks = [uA, uB];
      divisoes.forEach(function (t) { ticks.push(t.u0, t.u1); });
      out[nome] = cadeiaDe(weld(ticks, tol));
      // face de fora da edificação neste lado, em coordenada do modelo (a cadeia fica a afastamento fixo DELA)
      out.faces[nome] = (nome === 'base' || nome === 'dir') ? -vMin : vMin;
    });
    return out;
  }

  // ------------------------------------------------------------------
  // EDIFICAÇÃO: a cota externa é da CASA, não do terreno. Só entra a parede que delimita
  // ambiente: a que fica a até `dist` (0,30 m) do contorno de algum ambiente (face de ambiente
  // ou casca da edificação). Muro, divisa, mureta e parede solta no terreno ficam de fora.
  // paredes: [{minx,maxx,minz,maxz}]; ambientes: [{pts:[{x,z}]}] → {paredes, fora}
  function distSegRet(a, b, r) {
    // distância do segmento ab ao retângulo r (0 se cruza ou está dentro)
    function dentro(p) { return p.x >= r.minx && p.x <= r.maxx && p.z >= r.minz && p.z <= r.maxz; }
    if (dentro(a) || dentro(b)) return 0;
    var cant = [{ x: r.minx, z: r.minz }, { x: r.maxx, z: r.minz }, { x: r.maxx, z: r.maxz }, { x: r.minx, z: r.maxz }];
    function ccw(p, q, s) { return (s.z - p.z) * (q.x - p.x) - (q.z - p.z) * (s.x - p.x); }
    for (var i = 0; i < 4; i++) {
      var c = cant[i], d = cant[(i + 1) % 4];
      if (ccw(a, b, c) * ccw(a, b, d) < 0 && ccw(c, d, a) * ccw(c, d, b) < 0) return 0;
    }
    function pontoSeg(p, s0, s1) {
      var dx = s1.x - s0.x, dz = s1.z - s0.z, l2 = dx * dx + dz * dz;
      var t = l2 > 0 ? ((p.x - s0.x) * dx + (p.z - s0.z) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
      var qx = s0.x + t * dx - p.x, qz = s0.z + t * dz - p.z; return Math.sqrt(qx * qx + qz * qz);
    }
    var m = Infinity, k;
    for (k = 0; k < 4; k++) m = Math.min(m, pontoSeg(cant[k], a, b));
    // extremos do segmento ao retângulo
    [a, b].forEach(function (p) {
      var dx = Math.max(r.minx - p.x, 0, p.x - r.maxx), dz = Math.max(r.minz - p.z, 0, p.z - r.maxz);
      m = Math.min(m, Math.sqrt(dx * dx + dz * dz));
    });
    return m;
  }
  function pontoNoPoligono(p, pts) {
    var dentro = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i].z > p.z) !== (pts[j].z > p.z) && p.x < (pts[j].x - pts[i].x) * (p.z - pts[i].z) / (pts[j].z - pts[i].z) + pts[i].x) dentro = !dentro;
    }
    return dentro;
  }
  function paredesDaEdificacao(paredes, ambientes, dist) {
    var d = dist != null ? dist : 0.3, ok = [], fora = 0;
    var polis = (ambientes || []).filter(function (a) { return a && a.pts && a.pts.length >= 3; });
    (paredes || []).forEach(function (p) {
      var perto = false;
      for (var i = 0; i < polis.length && !perto; i++) {
        var pts = polis[i].pts;
        if (pontoNoPoligono({ x: (p.minx + p.maxx) / 2, z: (p.minz + p.maxz) / 2 }, pts)) { perto = true; break; }
        for (var k = 0; k < pts.length; k++) {
          if (distSegRet(pts[k], pts[(k + 1) % pts.length], p) <= d) { perto = true; break; }
        }
      }
      if (perto) ok.push(p); else fora++;
    });
    return { paredes: ok, fora: fora };
  }

  // ------------------------------------------------------------------
  // COTAS INTERNAS dos ambientes: o vão livre face a face, MEDIDO de verdade ao longo de uma
  // linha horizontal e de uma vertical que atravessam o ambiente (raio entre as faces das paredes
  // que o limitam) — vale para retangular E para ortogonal em L/T. Nunca o retângulo envolvente.
  // ambientes: [{nome, pts:[{x,z}]}] (contorno JÁ na face: BimAmbiente.calcular, regra "face").
  // opts.obstaculos: [{minx,maxx,minz,maxz}] louça/móvel no chão; a linha da cota é escolhida onde
  //   NÃO há obstáculo (nem o rótulo do centro); se nenhuma servir, a de menor sobreposição.
  // Só PULA (declarado em `pulados`) o que for curvo ou diagonal (aresta fora dos eixos).
  // Vão menor que minVao (0,6 m) → `semLugar`.
  // → {cotas:[{amb,tipo:'larg'|'prof',a,b,fixo,v,sobre}], pulados, semLugar, total}
  //   larg: horizontal de x=a a x=b na linha z=fixo; prof: vertical de z=a a z=b em x=fixo.
  function intervalos(pts, eixo, c) {
    // cruzamentos do contorno com a linha (eixo 'z': horizontal z=c; eixo 'x': vertical x=c) → intervalos internos
    var cr = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      var p0 = eixo === 'z' ? p.z : p.x, q0 = eixo === 'z' ? q.z : q.x;
      var pu = eixo === 'z' ? p.x : p.z, qu = eixo === 'z' ? q.x : q.z;
      if ((p0 > c) !== (q0 > c)) cr.push(pu + (c - p0) * (qu - pu) / (q0 - p0));
    }
    cr.sort(function (a, b) { return a - b; });
    var out = [];
    for (var k = 0; k + 1 < cr.length; k += 2) out.push([cr[k], cr[k + 1]]);
    return out;
  }
  function sobreposicao(a, b, eixo, c, obst) {
    // comprimento do trecho [a,b] da linha coberto por obstáculo que cruza a faixa da cota (e do texto)
    var s = 0, faixaIni = c - 0.22, faixaFim = c + 0.06;
    (obst || []).forEach(function (o) {
      var f0 = eixo === 'z' ? o.minz : o.minx, f1 = eixo === 'z' ? o.maxz : o.maxx;
      if (f1 < faixaIni || f0 > faixaFim) return;
      var u0 = eixo === 'z' ? o.minx : o.minz, u1 = eixo === 'z' ? o.maxx : o.maxz;
      var ov = Math.min(b, u1) - Math.max(a, u0);
      if (ov > 0) s += ov;
    });
    return s;
  }
  function cotasInternas(ambientes, opts) {
    opts = opts || {};
    var minVao = opts.minVao != null ? opts.minVao : 0.6;
    var obst = opts.obstaculos || [];
    var margem0 = opts.margem != null ? opts.margem : 0.25;   // folga da linha à face da parede (≈ 3 mm no papel + o texto)
    var cotas = [], pulados = 0, semLugar = 0, total = 0;
    (ambientes || []).forEach(function (a, idx) {
      var pts = (a && a.pts) || [];
      if (pts.length < 3) return;
      var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ok = true, orto = true, cx = 0, cz = 0;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = pts[(i + 1) % pts.length];
        if (!finito(p.x) || !finito(p.z)) { ok = false; break; }
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
        if (Math.abs(p.x - q.x) > 0.01 && Math.abs(p.z - q.z) > 0.01) orto = false; // diagonal ou curva
        cx += p.x; cz += p.z;
      }
      if (!ok) return;
      total++;
      if (!orto || !(x1 > x0 && z1 > z0)) { pulados++; return; }
      cx /= pts.length; cz /= pts.length;
      var nome = a.nome != null ? String(a.nome) : ('Ambiente ' + (idx + 1));
      // o rótulo (nome + área) fica no centro: entra como obstáculo
      var obA = obst.concat([{ minx: cx - 0.8, maxx: cx + 0.8, minz: cz - 0.3, maxz: cz + 0.3 }]);
      function melhor(eixo) {
        var lo = eixo === 'z' ? z0 : x0, hi = eixo === 'z' ? z1 : x1, best = null;
        var mg = margem0;
        for (var c = lo + mg; c <= hi - mg + 1e-9; c += 0.05) {
          intervalos(pts, eixo, c).forEach(function (iv) {
            var v = iv[1] - iv[0]; if (v < minVao) return;
            var so = sobreposicao(iv[0], iv[1], eixo, c, obA);
            // menor sobreposição; depois o MAIOR vão livre; depois o mais perto de uma borda (canto)
            var perto = Math.min(c - lo, hi - c);
            var cand = { a: iv[0], b: iv[1], fixo: c, v: v, sobre: so, perto: perto };
            if (!best || so < best.sobre - 1e-6 || (Math.abs(so - best.sobre) <= 1e-6 && (v > best.v + 1e-6 || (Math.abs(v - best.v) <= 1e-6 && perto < best.perto - 1e-6)))) best = cand;
          });
        }
        return best;
      }
      var h = melhor('z'), vv = melhor('x');
      if (!h && !vv) { semLugar++; return; }
      if (h) cotas.push({ amb: nome, tipo: 'larg', a: h.a, b: h.b, fixo: h.fixo, v: h.v, sobre: h.sobre });
      if (vv) cotas.push({ amb: nome, tipo: 'prof', a: vv.a, b: vv.b, fixo: vv.fixo, v: vv.v, sobre: vv.sobre });
    });
    return { cotas: cotas, pulados: pulados, semLugar: semLugar, total: total };
  }

  return { fmtM: fmtM, paredesDoCorte: paredesDoCorte, cadeias: cadeias, ladosPlanta: ladosPlanta, paredesDaEdificacao: paredesDaEdificacao, cotasInternas: cotasInternas, _weld: weld };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BimPlanta;

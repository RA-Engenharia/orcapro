/* =====================================================================
 * bimvolume.js — VOLUME LIVRE do modelador BIM (fase B4 do
 * PLANO-BIM-MODELADOR.md, 08/10/2026). Motor PURO, Node-testável.
 *
 * O "qualquer volume" do pedido do Rogério: extrusão de qualquer contorno,
 * revolução (perfil + eixo + ângulo), varredura (perfil ao longo de um
 * caminho), união e subtração entre volumes e empurrar/puxar face no estilo
 * do SketchUp.
 *
 * COMO O VOLUME É GUARDADO: pela RECEITA, não pela malha. A op do editor
 * (js/bimedit.js) leva { forma, ... } e a malha é refeita no replay — o mesmo
 * princípio do resto do editor (lista de operações, desfazer por replay). A
 * malha nunca vai para o storage: lista grande na nuvem estoura 1 MiB.
 *
 *   { forma:'extrusao',  contorno:[[a,b]…], plano:{o,u,v}, altura }
 *   { forma:'revolucao', perfil:[[r,h]…], eixo:{o,d,ref}, angulo (graus), segmentos }
 *   { forma:'varredura', perfil:[[a,b]…], caminho:[[x,y,z]…] }
 *   { forma:'bool',      tipo:'uniao'|'subtracao'|'intersecao', a:receita, b:receita }
 *   { forma:'empurrar',  base:receita, ponto:[x,y,z], normal:[x,y,z], dist }
 *   { forma:'mover',     base:receita, dx, dy, dz }
 *
 * MALHA = { v:[x,y,z, x,y,z…], f:[a,b,c, a,b,c…] }, coordenadas da CENA
 * (three.js Y-up, metros), triângulos com a normal para FORA (regra da mão
 * direita). É dela que sai o quantitativo: volume pelo teorema da divergência
 * (soma dos tetraedros com a origem) e área pela soma dos triângulos — EXATO
 * para a peça modelada, nada estimado. Revolução é desenhada com N segmentos:
 * o volume é o da peça facetada (é ela que vai ao IFC e ao orçamento); o da
 * revolução perfeita (Pappus) vai junto em `meta.volumeTeorico` para quem
 * quiser comparar.
 *
 * CSG (união/subtração) é do three-bvh-csg (bim/vendor/jsm/csg, MIT). Para o
 * motor continuar puro, a função de CSG ENTRA de fora: `csgCom(THREE, LIB)`
 * monta a função a partir do three e da biblioteca que quem chama carregou —
 * o js/bim.js no navegador, o tools/test-bim-b4.js no Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL = 1e-6;          /* solda de vértice e coplanaridade, em metros */

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* ------------------------------------------------------------ vetores */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function vec3(p) { return Array.isArray(p) && p.length === 3 && p.every(function (x) { return typeof x === "number" && isFinite(x); }) ? [p[0], p[1], p[2]] : null; }

  /* ------------------------------------------------------------- 2D */
  function area2(p) { var s = 0; for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function cruz2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
  function ponto2(q) { return Array.isArray(q) && q.length >= 2 && isFinite(Number(q[0])) && isFinite(Number(q[1])) ? [Number(q[0]), Number(q[1])] : null; }
  /* tira ponto repetido, o fechamento (último = primeiro) e ponto colinear —
     colinear não muda a forma e trava o recorte de orelhas */
  function limparContorno(pts) {
    var p = arr(pts).map(ponto2);
    if (p.some(function (x) { return !x; })) return null;
    var out = [];
    p.forEach(function (q) { var u = out[out.length - 1]; if (!u || Math.abs(u[0] - q[0]) > TOL || Math.abs(u[1] - q[1]) > TOL) out.push(q); });
    while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= TOL && Math.abs(out[0][1] - out[out.length - 1][1]) <= TOL) out.pop();
    var mudou = true;
    while (mudou && out.length >= 3) {
      mudou = false;
      for (var i = 0; i < out.length; i++) {
        var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        var lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (Math.abs(cruz2(a, b, c)) <= 1e-9 * Math.max(1, lab * lbc)) { out.splice(i, 1); mudou = true; break; }
      }
    }
    return out;
  }
  function segCruza(a, b, c, d) {
    var d1 = cruz2(c, d, a), d2 = cruz2(c, d, b), d3 = cruz2(a, b, c), d4 = cruz2(a, b, d);
    return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
  }
  /* polígono simples = nenhuma aresta cruza outra que não seja vizinha */
  function simples(p) {
    var n = p.length;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCruza(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
    }
    return true;
  }
  function noTri(p, a, b, c) {
    var d1 = cruz2(a, b, p), d2 = cruz2(b, c, p), d3 = cruz2(c, a, p);
    return d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12;
  }
  /* recorte de orelhas: devolve os triângulos [i,j,k] no sentido ANTI-HORÁRIO */
  function triangular(pts) {
    var n = pts.length; if (n < 3) return null;
    var idx = []; for (var i = 0; i < n; i++) idx.push(i);
    if (area2(pts) < 0) idx.reverse();
    var tris = [], volta = 0;
    while (idx.length > 3) {
      if (++volta > n * n + 10) return null;
      var achou = false;
      for (var k = 0; k < idx.length; k++) {
        var a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
        if (cruz2(pts[a], pts[b], pts[c]) <= 1e-14) continue;
        var dentro = false;
        for (var j = 0; j < idx.length; j++) { var q = idx[j]; if (q === a || q === b || q === c) continue; if (noTri(pts[q], pts[a], pts[b], pts[c])) { dentro = true; break; } }
        if (dentro) continue;
        tris.push([a, b, c]); idx.splice(k, 1); achou = true; break;
      }
      if (!achou) return null;
    }
    tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }

  /* ------------------------------------------------------------- plano */
  /* plano de trabalho = { o, u, v } (u e v ortonormais; a normal é u × v).
     O horizontal (o do editor) tem a normal para CIMA: u = +X, v = −Z, e o
     ponto do mundo (x, z) vira (a, b) = (x, −z). */
  function planoHorizontal(base) { return { o: [0, num(base, 0), 0], u: [1, 0, 0], v: [0, 0, -1] }; }
  /* plano VERTICAL que passa por p1 e p2 (no chão): u = p1→p2, v = +Y */
  function planoVertical(p1, p2) {
    var u = norm([p2[0] - p1[0], 0, p2[2] - p1[2]]); if (!u) return null;
    return { o: [p1[0], p1[1], p1[2]], u: u, v: [0, 1, 0] };
  }
  function lerPlano(pl) {
    pl = pl || planoHorizontal(0);
    var o = vec3(pl.o), u = vec3(pl.u), v = vec3(pl.v);
    if (!o || !u || !v) return null;
    u = norm(u); if (!u) return null;
    v = norm(sub(v, mul(u, dot(v, u)))); if (!v) return null;   /* Gram-Schmidt: v ⟂ u */
    return { o: o, u: u, v: v, n: cross(u, v) };
  }
  function doPlano(pl, ab) { return add(pl.o, add(mul(pl.u, ab[0]), mul(pl.v, ab[1]))); }
  function paraPlano(pl, p) { var d = sub(p, pl.o); return [dot(d, pl.u), dot(d, pl.v)]; }

  /* ------------------------------------------------------------ malha */
  function Malha() { this.v = []; this.f = []; }
  Malha.prototype.pt = function (p) { this.v.push(p[0], p[1], p[2]); return this.v.length / 3 - 1; };
  Malha.prototype.tri = function (a, b, c) { if (a !== b && b !== c && a !== c) this.f.push(a, b, c); };
  function vert(m, i) { return [m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]]; }
  function nTri(m) { return m.f.length / 3; }
  function triPts(m, t) { return [vert(m, m.f[3 * t]), vert(m, m.f[3 * t + 1]), vert(m, m.f[3 * t + 2])]; }
  function triNormal(m, t) { var p = triPts(m, t); return cross(sub(p[1], p[0]), sub(p[2], p[0])); }
  function copiar(m) { return { v: m.v.slice(), f: m.f.slice() }; }

  function volume(m) {
    var s = 0;
    for (var t = 0, n = nTri(m); t < n; t++) { var p = triPts(m, t); s += dot(p[0], cross(p[1], p[2])); }
    return s / 6;
  }
  function area(m) {
    var s = 0;
    for (var t = 0, n = nTri(m); t < n; t++) s += len(triNormal(m, t)) / 2;
    return s;
  }
  function caixa(m) {
    if (!m.v.length) return null;
    var b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (var i = 0; i < m.v.length; i += 3) for (var k = 0; k < 3; k++) { var x = m.v[i + k]; if (x < b.min[k]) b.min[k] = x; if (x > b.max[k]) b.max[k] = x; }
    return b;
  }
  function inverter(m) { for (var i = 0; i < m.f.length; i += 3) { var x = m.f[i + 1]; m.f[i + 1] = m.f[i + 2]; m.f[i + 2] = x; } return m; }
  function transladar(m, dx, dy, dz) {
    var o = copiar(m);
    for (var i = 0; i < o.v.length; i += 3) { o.v[i] += dx; o.v[i + 1] += dy; o.v[i + 2] += dz; }
    return o;
  }
  /* junta vértices a menos de `tol` e tira triângulo degenerado */
  function soldar(m, tol) {
    tol = tol || TOL;
    var mapa = {}, nv = [], novo = [], f = [];
    for (var i = 0; i < m.v.length / 3; i++) {
      var k = Math.round(m.v[3 * i] / tol) + "," + Math.round(m.v[3 * i + 1] / tol) + "," + Math.round(m.v[3 * i + 2] / tol);
      if (mapa[k] == null) { mapa[k] = nv.length / 3; nv.push(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]); }
      novo[i] = mapa[k];
    }
    var out = { v: nv, f: f };
    for (var t = 0; t < m.f.length; t += 3) {
      var a = novo[m.f[t]], b = novo[m.f[t + 1]], c = novo[m.f[t + 2]];
      if (a === b || b === c || a === c) continue;
      var pa = vert(out, a), n = cross(sub(vert(out, b), pa), sub(vert(out, c), pa));
      if (len(n) < 1e-14) continue;
      f.push(a, b, c);
    }
    return out;
  }
  /* malha FECHADA = cada aresta orientada (a→b) aparece uma vez e tem a sua
     volta (b→a). É a condição para o volume da divergência valer e para o
     IfcFacetedBrep ser uma casca fechada de verdade. */
  function fechada(m) {
    var ar = {}, rep = 0, abertas = 0;
    for (var t = 0; t < m.f.length; t += 3) for (var k = 0; k < 3; k++) {
      var a = m.f[t + k], b = m.f[t + (k + 1) % 3], key = a + ">" + b;
      if (ar[key]) rep++; ar[key] = (ar[key] || 0) + 1;
    }
    Object.keys(ar).forEach(function (key) { var p = key.split(">"); if (!ar[p[1] + ">" + p[0]]) abertas++; });
    return { ok: rep === 0 && abertas === 0 && m.f.length > 0, repetidas: rep, abertas: abertas };
  }
  /* CSG devolve junção em T: um triângulo tem a aresta AB inteira e o vizinho
     tem AC + CB, com C no meio de AB. A malha fica fechada no espaço mas não
     na topologia — e aí nem a face plana do empurrar nem o Brep do IFC fecham.
     Aqui o triângulo que tem vértice alheio no meio da aresta vira um leque a
     partir do próprio centro (todo triângulo novo tem área: o polígono é
     convexo e o centro é interior). */
  function costurar(m) {
    var nvt = m.v.length / 3, out = { v: m.v.slice(), f: [] };
    var cx = caixa(m); if (!cx) return out;
    var celula = Math.max(cx.max[0] - cx.min[0], cx.max[1] - cx.min[1], cx.max[2] - cx.min[2]) / 16 || 1;
    var grade = {};
    function chaveC(i, j, k) { return i + "," + j + "," + k; }
    for (var i = 0; i < nvt; i++) {
      var p = vert(m, i), g = chaveC(Math.floor((p[0] - cx.min[0]) / celula), Math.floor((p[1] - cx.min[1]) / celula), Math.floor((p[2] - cx.min[2]) / celula));
      (grade[g] = grade[g] || []).push(i);
    }
    function noMeio(a, b) {
      var pa = vert(m, a), pb = vert(m, b), ab = sub(pb, pa), L2 = dot(ab, ab), res = [];
      if (L2 < 1e-18) return res;
      var lo = [Math.min(pa[0], pb[0]), Math.min(pa[1], pb[1]), Math.min(pa[2], pb[2])], hi = [Math.max(pa[0], pb[0]), Math.max(pa[1], pb[1]), Math.max(pa[2], pb[2])];
      for (var gi = Math.floor((lo[0] - TOL - cx.min[0]) / celula); gi <= Math.floor((hi[0] + TOL - cx.min[0]) / celula); gi++)
        for (var gj = Math.floor((lo[1] - TOL - cx.min[1]) / celula); gj <= Math.floor((hi[1] + TOL - cx.min[1]) / celula); gj++)
          for (var gk = Math.floor((lo[2] - TOL - cx.min[2]) / celula); gk <= Math.floor((hi[2] + TOL - cx.min[2]) / celula); gk++) {
            (grade[chaveC(gi, gj, gk)] || []).forEach(function (q) {
              if (q === a || q === b) return;
              var pq = vert(m, q), s = dot(sub(pq, pa), ab) / L2;
              if (s <= 1e-9 || s >= 1 - 1e-9) return;
              var d = sub(pq, add(pa, mul(ab, s)));
              if (dot(d, d) < TOL * TOL) res.push({ q: q, s: s });
            });
          }
      res.sort(function (x, y) { return x.s - y.s; });
      return res;
    }
    var mudou = 0;
    for (var t = 0; t < m.f.length; t += 3) {
      var tri = [m.f[t], m.f[t + 1], m.f[t + 2]], anel = [], extra = 0;
      for (var k = 0; k < 3; k++) {
        var a = tri[k], b = tri[(k + 1) % 3]; anel.push(a);
        noMeio(a, b).forEach(function (x) { anel.push(x.q); extra++; });
      }
      if (!extra) { out.f.push(tri[0], tri[1], tri[2]); continue; }
      mudou++;
      var c = [0, 0, 0]; tri.forEach(function (ix) { c = add(c, vert(m, ix)); }); c = mul(c, 1 / 3);
      var ic = out.v.length / 3; out.v.push(c[0], c[1], c[2]);
      for (var j = 0; j < anel.length; j++) out.f.push(ic, anel[j], anel[(j + 1) % anel.length]);
    }
    out.costuras = mudou;
    return out;
  }

  /* ------------------------------------------------------- primitivas */
  function erro(msg) { return { ok: false, erro: msg }; }

  /* EXTRUSÃO: contorno (no plano) puxado `altura` na direção da normal do
     plano (negativa = para o outro lado). Prisma reto: a área da base vezes a
     altura é o volume, e é por isso que ela vai ao IFC como IfcExtrudedAreaSolid. */
  function extrusao(def) {
    def = def || {};
    var pl = lerPlano(def.plano); if (!pl) return erro("plano de trabalho inválido");
    var c = limparContorno(def.contorno); if (!c || c.length < 3) return erro("o contorno precisa de 3 pontos distintos ou mais");
    if (!simples(c)) return erro("o contorno se cruza — desenhe sem cruzar as linhas");
    var A = area2(c); if (Math.abs(A) < 1e-8) return erro("o contorno não tem área");
    var h = num(def.altura, NaN); if (!isFinite(h) || Math.abs(h) < 1e-6) return erro("a altura da extrusão precisa ser diferente de zero");
    if (A < 0) c = c.slice().reverse();
    var o = pl.o; if (h < 0) { o = add(o, mul(pl.n, h)); h = -h; }
    var tris = triangular(c); if (!tris) return erro("não consegui triangular o contorno");
    var m = new Malha(), n = c.length, bi = [], ti = [];
    c.forEach(function (q) { var p = add(o, add(mul(pl.u, q[0]), mul(pl.v, q[1]))); bi.push(m.pt(p)); });
    c.forEach(function (q) { var p = add(o, add(mul(pl.u, q[0]), add(mul(pl.v, q[1]), mul(pl.n, h)))); ti.push(m.pt(p)); });
    tris.forEach(function (t) { m.tri(bi[t[0]], bi[t[2]], bi[t[1]]); m.tri(ti[t[0]], ti[t[1]], ti[t[2]]); });
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; m.tri(bi[i], bi[j], ti[j]); m.tri(bi[i], ti[j], ti[i]); }
    var per = 0; for (var k = 0; k < n; k++) per += Math.hypot(c[(k + 1) % n][0] - c[k][0], c[(k + 1) % n][1] - c[k][1]);
    return { ok: true, malha: { v: m.v, f: m.f }, meta: { prisma: true, areaBase: Math.abs(A), perimetro: per, altura: h, contorno: c, plano: { o: o, u: pl.u, v: pl.v, n: pl.n } } };
  }

  /* REVOLUÇÃO: perfil (r, h) — r = distância ao eixo (≥ 0), h = ao longo do
     eixo — girado `angulo` graus em volta do eixo { o, d (direção), ref (para
     onde o r aponta no ângulo zero) }. Ponto do perfil EM CIMA do eixo vira um
     vértice só (o polo), sem triângulo degenerado. */
  function revolucao(def) {
    def = def || {};
    var ex = def.eixo || {}, o = vec3(ex.o), d = vec3(ex.d), ref = vec3(ex.ref);
    if (!o || !d || !ref) return erro("eixo da revolução inválido");
    d = norm(d); if (!d) return erro("eixo sem direção");
    ref = norm(sub(ref, mul(d, dot(ref, d)))); if (!ref) return erro("a referência do perfil não pode ser paralela ao eixo");
    var w = cross(d, ref);
    var c = limparContorno(def.perfil); if (!c || c.length < 3) return erro("o perfil precisa de 3 pontos distintos ou mais");
    if (c.some(function (q) { return q[0] < -TOL; })) return erro("o perfil passa para o outro lado do eixo (r negativo)");
    if (!simples(c)) return erro("o perfil se cruza");
    var A = area2(c); if (Math.abs(A) < 1e-8) return erro("o perfil não tem área");
    if (A < 0) c = c.slice().reverse();
    c = c.map(function (q) { return [Math.max(0, q[0]), q[1]]; });
    var ang = num(def.angulo, 360); if (!(ang > 0)) return erro("o ângulo precisa ser maior que zero");
    ang = Math.min(360, ang);
    var cheio = ang >= 360 - 1e-9, N = Math.max(8, Math.round(num(def.segmentos, 48)));
    var nseg = cheio ? N : Math.max(2, Math.ceil(N * ang / 360));
    var rad = ang * Math.PI / 180, m = new Malha(), n = c.length, idx = [];
    for (var i = 0; i < n; i++) {
      idx[i] = [];
      var r = c[i][0], h = c[i][1], noEixo = r <= TOL;
      var polo = noEixo ? m.pt(add(o, mul(d, h))) : -1;
      for (var k = 0; k <= nseg; k++) {
        if (noEixo) { idx[i][k] = polo; continue; }
        if (cheio && k === nseg) { idx[i][k] = idx[i][0]; continue; }
        var phi = rad * k / nseg, e = add(mul(ref, Math.cos(phi)), mul(w, Math.sin(phi)));
        idx[i][k] = m.pt(add(o, add(mul(d, h), mul(e, r))));
      }
    }
    for (var a = 0; a < n; a++) {
      var b = (a + 1) % n;
      for (var s = 0; s < nseg; s++) {
        m.tri(idx[a][s], idx[a][s + 1], idx[b][s + 1]);
        m.tri(idx[a][s], idx[b][s + 1], idx[b][s]);
      }
    }
    if (!cheio) {
      var tris = triangular(c); if (!tris) return erro("não consegui triangular o perfil");
      tris.forEach(function (t) { m.tri(idx[t[0]][0], idx[t[1]][0], idx[t[2]][0]); m.tri(idx[t[0]][nseg], idx[t[2]][nseg], idx[t[1]][nseg]); });
    }
    var malha = { v: m.v, f: m.f };
    if (volume(malha) < 0) inverter(malha);
    /* Pappus: área do perfil × caminho do centroide */
    var cr = 0; for (var q = 0; q < n; q++) { var p0 = c[q], p1 = c[(q + 1) % n], cr0 = p0[0] * p1[1] - p1[0] * p0[1]; cr += (p0[0] + p1[0]) * cr0; }
    cr = cr / (6 * Math.abs(A));
    return { ok: true, malha: malha, meta: { areaPerfil: Math.abs(A), angulo: ang, segmentos: nseg, volumeTeorico: Math.abs(A) * rad * cr } };
  }

  /* VARREDURA: perfil (a = lado, b = para cima) que corre pelo caminho. Nas
     dobras a seção fica no plano da bissetriz (meia-esquadria), como a
     moldura de um quadro: os trechos encostam sem fresta e sem sobra. Com o
     centroide do perfil sobre o caminho, o volume é área × comprimento. */
  function varredura(def) {
    def = def || {};
    var c = limparContorno(def.perfil); if (!c || c.length < 3) return erro("o perfil precisa de 3 pontos distintos ou mais");
    if (!simples(c)) return erro("o perfil se cruza");
    var A = area2(c); if (Math.abs(A) < 1e-8) return erro("o perfil não tem área");
    if (A < 0) c = c.slice().reverse();
    var cam = [];
    arr(def.caminho).forEach(function (p) { var q = vec3(p); if (!q) return; var u = cam[cam.length - 1]; if (!u || len(sub(q, u)) > TOL) cam.push(q); });
    if (cam.length < 2) return erro("o caminho precisa de 2 pontos distintos ou mais");
    var ts = [], sides = [], ups = [], L = 0;
    for (var s = 0; s < cam.length - 1; s++) {
      var t = sub(cam[s + 1], cam[s]); L += len(t); t = norm(t);
      var up = Math.abs(t[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
      var side = norm(cross(t, up)), up2 = cross(side, t);
      ts.push(t); sides.push(side); ups.push(up2);
    }
    var aneis = [], m = new Malha();
    for (var j = 0; j < cam.length; j++) {
      var P = cam[j], anel = [];
      if (j === 0 || j === cam.length - 1) {
        var fs = j === 0 ? 0 : ts.length - 1;
        c.forEach(function (q) { anel.push(m.pt(add(P, add(mul(sides[fs], q[0]), mul(ups[fs], q[1]))))); });
      } else {
        var t1 = ts[j - 1], t2 = ts[j], bis = norm(add(t1, t2));
        if (!bis) return erro("o caminho volta sobre si mesmo (dobra de 180°)");
        var den = dot(t1, bis); if (den < 0.05) return erro("dobra fechada demais no caminho (mais de 170°)");
        c.forEach(function (q) {
          var Q = add(P, add(mul(sides[j - 1], q[0]), mul(ups[j - 1], q[1])));
          anel.push(m.pt(add(Q, mul(t1, dot(sub(P, Q), bis) / den))));
        });
      }
      aneis.push(anel);
    }
    var n = c.length;
    for (var r = 0; r < aneis.length - 1; r++) for (var i = 0; i < n; i++) {
      var k = (i + 1) % n, A0 = aneis[r], A1 = aneis[r + 1];
      m.tri(A0[i], A1[k], A0[k]); m.tri(A0[i], A1[i], A1[k]);
    }
    var tris = triangular(c); if (!tris) return erro("não consegui triangular o perfil");
    var ini = aneis[0], fim = aneis[aneis.length - 1];
    tris.forEach(function (t) { m.tri(ini[t[0]], ini[t[1]], ini[t[2]]); m.tri(fim[t[0]], fim[t[2]], fim[t[1]]); });
    var malha = { v: m.v, f: m.f };
    if (volume(malha) < 0) inverter(malha);
    return { ok: true, malha: malha, meta: { areaPerfil: Math.abs(A), comprimento: L } };
  }

  /* ------------------------------------------------------ faces planas */
  /* triângulos que estão no MESMO plano e se tocam (vértice em comum) = uma
     face, a que a pessoa aponta para empurrar */
  function regioesPlanas(m) {
    var n = nTri(m), info = [], grupos = {}, pai = [];
    function acha(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    for (var t = 0; t < n; t++) {
      var nn = norm(triNormal(m, t)); pai[t] = t;
      if (!nn) { info.push(null); continue; }
      var d = dot(nn, vert(m, m.f[3 * t]));
      info.push({ n: nn, d: d });
    }
    /* vértice → triângulos (para unir só os que se tocam) */
    var porV = {};
    for (var u = 0; u < n; u++) { if (!info[u]) continue; for (var k = 0; k < 3; k++) (porV[m.f[3 * u + k]] = porV[m.f[3 * u + k]] || []).push(u); }
    Object.keys(porV).forEach(function (vk) {
      var ts = porV[vk];
      for (var i = 0; i < ts.length; i++) for (var j = i + 1; j < ts.length; j++) {
        var a = info[ts[i]], b = info[ts[j]];
        if (dot(a.n, b.n) > 1 - 1e-7 && Math.abs(a.d - b.d) < 1e-5) { var ra = acha(ts[i]), rb = acha(ts[j]); if (ra !== rb) pai[ra] = rb; }
      }
    });
    for (var w = 0; w < n; w++) { if (!info[w]) continue; var rr = acha(w); (grupos[rr] = grupos[rr] || []).push(w); }
    return Object.keys(grupos).map(function (k) {
      var ts = grupos[k], a = 0; ts.forEach(function (x) { a += len(triNormal(m, x)) / 2; });
      return { tris: ts, n: info[ts[0]].n, d: info[ts[0]].d, area: a };
    });
  }
  function noTri3(p, a, b, c, n) {
    var e = 1e-7;
    return dot(cross(sub(b, a), sub(p, a)), n) >= -e && dot(cross(sub(c, b), sub(p, b)), n) >= -e && dot(cross(sub(a, c), sub(p, c)), n) >= -e;
  }
  /* a face plana sob um ponto (com a normal que o raio achou) */
  function faceNoPonto(m, ponto, normal) {
    var P = vec3(ponto), N = vec3(normal); if (!P || !N) return null; N = norm(N); if (!N) return null;
    var regs = regioesPlanas(m);
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (dot(r.n, N) < 0.999 || Math.abs(dot(r.n, P) - r.d) > 1e-3) continue;
      for (var j = 0; j < r.tris.length; j++) { var tp = triPts(m, r.tris[j]); if (noTri3(P, tp[0], tp[1], tp[2], r.n)) return r; }
    }
    return null;
  }
  /* contorno(s) da face: as arestas orientadas que não têm volta dentro dela */
  function lacos(m, regiao) {
    var ar = {};
    regiao.tris.forEach(function (t) { for (var k = 0; k < 3; k++) { var a = m.f[3 * t + k], b = m.f[3 * t + (k + 1) % 3]; ar[a + ">" + b] = [a, b]; } });
    var prox = {}, nb = 0;
    Object.keys(ar).forEach(function (key) { var e = ar[key]; if (ar[e[1] + ">" + e[0]]) return; (prox[e[0]] = prox[e[0]] || []).push(e[1]); nb++; });
    var out = [], usados = 0;
    Object.keys(prox).forEach(function (ini) {
      while (prox[ini] && prox[ini].length) {
        var laco = [+ini], cur = prox[ini].shift(), guarda = 0; usados++;
        while (cur !== +ini && guarda++ < 100000) {
          laco.push(cur);
          if (!prox[cur] || !prox[cur].length) { laco = null; break; }
          cur = prox[cur].shift(); usados++;
        }
        if (laco && laco.length >= 3) out.push(laco);
      }
    });
    return usados === nb ? out : null;
  }
  /* prisma da face entre os deslocamentos off0 < off1 ao longo da normal */
  function prismaDaFace(m, regiao, off0, off1) {
    var lc = lacos(m, regiao); if (!lc || !lc.length) return null;
    var o = new Malha(), mapa0 = {}, mapa1 = {}, n = regiao.n;
    function v0(i) { if (mapa0[i] == null) mapa0[i] = o.pt(add(vert(m, i), mul(n, off0))); return mapa0[i]; }
    function v1(i) { if (mapa1[i] == null) mapa1[i] = o.pt(add(vert(m, i), mul(n, off1))); return mapa1[i]; }
    regiao.tris.forEach(function (t) {
      var a = m.f[3 * t], b = m.f[3 * t + 1], c = m.f[3 * t + 2];
      o.tri(v0(a), v0(c), v0(b)); o.tri(v1(a), v1(b), v1(c));
    });
    lc.forEach(function (l) { for (var i = 0; i < l.length; i++) { var a = l[i], b = l[(i + 1) % l.length]; o.tri(v0(a), v0(b), v1(b)); o.tri(v0(a), v1(b), v1(a)); } });
    return { v: o.v, f: o.f };
  }
  /* EMPURRAR/PUXAR (estilo SketchUp). Dois caminhos:
     1) a face só encosta em faces PERPENDICULARES a ela (o topo de uma caixa,
        o lado de uma extrusão): os vértices dela andam `dist` na normal e as
        vizinhas esticam no próprio plano — exato e sem CSG, a malha continua
        limpa (é o caso de 9 em 10 empurrões);
     2) senão, um prisma da face vai por CSG: puxar = unir, empurrar = subtrair.
     dist > 0 puxa para fora; dist < 0 empurra para dentro. */
  function empurrar(m, ponto, normal, dist, csg) {
    dist = num(dist, 0); if (Math.abs(dist) < 1e-6) return erro("distância zero");
    var reg = faceNoPonto(m, ponto, normal); if (!reg) return erro("a face apontada não foi encontrada no volume");
    var naFace = {}; reg.tris.forEach(function (t) { naFace[t] = 1; });
    var vs = {}; reg.tris.forEach(function (t) { for (var k = 0; k < 3; k++) vs[m.f[3 * t + k]] = 1; });
    var vizinhosOk = true, afetados = [];
    for (var t = 0, nt = nTri(m); t < nt; t++) {
      if (naFace[t]) continue;
      if (!(vs[m.f[3 * t]] || vs[m.f[3 * t + 1]] || vs[m.f[3 * t + 2]])) continue;
      var nn = norm(triNormal(m, t));
      if (!nn || Math.abs(dot(nn, reg.n)) > 1e-6) { vizinhosOk = false; break; }
      afetados.push({ t: t, n: nn });
    }
    var v0 = volume(m), esperado = v0 + reg.area * dist;
    if (vizinhosOk) {
      var o = copiar(m), desl = mul(reg.n, dist);
      Object.keys(vs).forEach(function (k) { var i = +k; o.v[3 * i] += desl[0]; o.v[3 * i + 1] += desl[1]; o.v[3 * i + 2] += desl[2]; });
      var invertido = afetados.some(function (x) { var n2 = norm(triNormal(o, x.t)); return !n2 || dot(n2, x.n) < 0.5; });
      if (!invertido && esperado > 1e-9 && Math.abs(volume(o) - esperado) <= 1e-6 * Math.max(1, Math.abs(esperado))) return { ok: true, malha: o, modo: "mover" };
      if (dist < 0 && esperado <= 1e-9) return erro("empurrar " + Math.abs(dist).toFixed(2) + " m atravessa o volume inteiro");
    }
    if (typeof csg !== "function") return { ok: false, pendente: true, erro: "esta face precisa do CSG (carregando)" };
    /* o prisma nasce EXATAMENTE na face, sem folga: com folga de 0,1 mm para
       dentro, o topo e o fundo do prisma ficavam coplanares com o topo e o
       fundo do volume nessa faixa, o CSG mantinha os dois e a malha saía com
       8 arestas repetidas (medido no prisma triangular do test-bim-b4) */
    var pr = dist > 0 ? prismaDaFace(m, reg, 0, dist) : prismaDaFace(m, reg, dist, 0);
    if (!pr) return erro("não consegui achar o contorno da face");
    var r = csg(m, pr, dist > 0 ? "uniao" : "subtracao");
    return r && r.f && r.f.length ? { ok: true, malha: r, modo: "csg" } : erro("o CSG não devolveu volume");
  }

  /* ------------------------------------------------------------- CSG */
  /* a função de CSG a partir do three e do three-bvh-csg que QUEM CHAMA
     carregou. Centraliza as duas malhas na origem antes (o three trabalha em
     Float32: a 1 km da origem são 0,06 mm de erro; perto dela, nada) e
     devolve soldada, costurada (sem junção em T) e arredondada a 1 µm. */
  function csgCom(THREE, LIB) {
    if (!THREE || !LIB || !LIB.Evaluator || !LIB.Brush) return null;
    var ev = new LIB.Evaluator(); ev.attributes = ["position"]; ev.useGroups = false;
    var OPS = { uniao: LIB.ADDITION, subtracao: LIB.SUBTRACTION, intersecao: LIB.INTERSECTION };
    return function (a, b, tipo) {
      if (OPS[tipo] == null) throw new Error("operação de CSG desconhecida: " + tipo);
      var ca = caixa(a), cb = caixa(b); if (!ca || !cb) return { v: [], f: [] };
      var c = [(Math.min(ca.min[0], cb.min[0]) + Math.max(ca.max[0], cb.max[0])) / 2, (Math.min(ca.min[1], cb.min[1]) + Math.max(ca.max[1], cb.max[1])) / 2, (Math.min(ca.min[2], cb.min[2]) + Math.max(ca.max[2], cb.max[2])) / 2];
      function pincel(m) {
        var g = new THREE.BufferGeometry(), p = new Float32Array(m.f.length * 3);
        for (var i = 0; i < m.f.length; i++) { var k = m.f[i]; p[3 * i] = m.v[3 * k] - c[0]; p[3 * i + 1] = m.v[3 * k + 1] - c[1]; p[3 * i + 2] = m.v[3 * k + 2] - c[2]; }
        g.setAttribute("position", new THREE.BufferAttribute(p, 3));
        var br = new LIB.Brush(g); br.updateMatrixWorld(); return br;
      }
      var r = ev.evaluate(pincel(a), pincel(b), OPS[tipo]), g2 = r.geometry, pos = g2.attributes.position, ix = g2.index, out = { v: [], f: [] };
      for (var i = 0; i < pos.count; i++) out.v.push(r6(pos.getX(i) + c[0]), r6(pos.getY(i) + c[1]), r6(pos.getZ(i) + c[2]));
      var nIdx = ix ? ix.count : pos.count;
      for (var j = 0; j < nIdx; j++) out.f.push(ix ? ix.getX(j) : j);
      try { g2.dispose(); } catch (e) {}
      var s = soldar(out, TOL);
      return costurar(s);
    };
  }

  /* ------------------------------------------------------------ receita */
  var FORMAS = { extrusao: 1, revolucao: 1, varredura: 1, bool: 1, empurrar: 1, mover: 1 };
  function precisaCsg(r) {
    if (!r || typeof r !== "object") return false;
    if (r.forma === "bool") return true;
    if (r.forma === "empurrar") return true;   /* pode ou não — o caminho 1 dispensa; quem chama tenta sem */
    return r.forma === "mover" ? precisaCsg(r.base) : false;
  }
  /* avalia a receita → { ok, malha, meta, pendente, erro }. `cache` (objeto)
     guarda a malha de cada sub-receita pelo texto dela: refazer a cena depois
     de mover uma parede não refaz o CSG de todos os volumes. */
  function avaliar(receita, csg, cache) {
    cache = cache || {};
    function av(r, prof) {
      if (!r || typeof r !== "object" || !FORMAS[r.forma]) throw { erro: "receita de volume inválida" };
      if (prof > 64) throw { erro: "receita aninhada demais" };
      var chave = JSON.stringify(r);
      if (cache[chave]) return cache[chave];
      var res;
      if (r.forma === "extrusao") res = extrusao(r);
      else if (r.forma === "revolucao") res = revolucao(r);
      else if (r.forma === "varredura") res = varredura(r);
      else if (r.forma === "mover") { var b0 = av(r.base, prof + 1); res = { ok: true, malha: transladar(b0.malha, num(r.dx, 0), num(r.dy, 0), num(r.dz, 0)), meta: b0.meta ? { herdado: b0.meta, dx: num(r.dx, 0), dy: num(r.dy, 0), dz: num(r.dz, 0) } : null }; }
      else if (r.forma === "bool") {
        var A = av(r.a, prof + 1), B = av(r.b, prof + 1);
        if (typeof csg !== "function") throw { pendente: true, erro: "o CSG ainda não carregou" };
        var mr = csg(A.malha, B.malha, r.tipo);
        res = mr && mr.f.length ? { ok: true, malha: mr, meta: { bool: r.tipo } } : (r.tipo === "subtracao" ? { ok: false, erro: "a subtração consumiu o volume inteiro" } : { ok: false, erro: "o CSG não devolveu volume" });
      } else {
        var Bm = av(r.base, prof + 1), e = empurrar(Bm.malha, r.ponto, r.normal, r.dist, csg);
        if (e.pendente) throw { pendente: true, erro: e.erro };
        res = e.ok ? { ok: true, malha: e.malha, meta: { empurrar: e.modo } } : e;
      }
      if (!res.ok) throw { erro: res.erro };
      cache[chave] = res;
      return res;
    }
    try { var x = av(receita, 0); return { ok: true, malha: x.malha, meta: x.meta || null }; }
    catch (e) { return { ok: false, pendente: !!(e && e.pendente), erro: (e && e.erro) || (e && e.message) || String(e) }; }
  }
  /* o quantitativo do volume. As medidas que só valem para a forma pura
     (altura e área da base da extrusão, comprimento da varredura) só saem se
     a receita ainda é a forma pura (ou a forma pura só deslocada). */
  function medir(malha, receita, meta) {
    var vol = volume(malha), ar = area(malha), cx = caixa(malha), fx = fechada(malha);
    var out = { volume: r6(Math.abs(vol)), area: r6(ar), fechada: fx.ok, caixa: cx };
    var r = receita; while (r && r.forma === "mover") r = r.base;
    if (r && r.forma === "extrusao") {
      var ex = extrusao(r);
      if (ex.ok) {
        out.altura = r6(ex.meta.altura); out.areaBase = r6(ex.meta.areaBase); out.perimetro = r6(ex.meta.perimetro);
        if (Math.abs(Math.abs(ex.meta.plano.n[1]) - 1) < 1e-9) out.areaProjecao = out.areaBase;   /* plano horizontal: a base É a projeção */
      }
    } else if (r && r.forma === "varredura") {
      var vr = varredura(r); if (vr.ok) { out.comprimento = r6(vr.meta.comprimento); out.areaPerfil = r6(vr.meta.areaPerfil); }
    } else if (r && r.forma === "revolucao") {
      var rv = revolucao(r); if (rv.ok) { out.volumeTeorico = r6(rv.meta.volumeTeorico); out.segmentos = rv.meta.segmentos; }
    }
    return out;
  }
  /* a receita é um prisma reto puro (vai ao IFC como IfcExtrudedAreaSolid)?
     → { contorno, plano:{o,u,v,n}, altura } já com o deslocamento aplicado */
  function prismaDe(receita) {
    var dx = 0, dy = 0, dz = 0, r = receita;
    while (r && r.forma === "mover") { dx += num(r.dx, 0); dy += num(r.dy, 0); dz += num(r.dz, 0); r = r.base; }
    if (!r || r.forma !== "extrusao") return null;
    var ex = extrusao(r); if (!ex.ok) return null;
    var pl = ex.meta.plano;
    return { contorno: ex.meta.contorno, plano: { o: add(pl.o, [dx, dy, dz]), u: pl.u, v: pl.v, n: pl.n }, altura: ex.meta.altura, areaBase: ex.meta.areaBase };
  }
  /* sanidade da receita vinda do storage (forma conhecida, números finitos) */
  function receitaValida(r, prof) {
    prof = prof || 0;
    if (!r || typeof r !== "object" || prof > 64 || !FORMAS[r.forma]) return false;
    function pts2(a) { return Array.isArray(a) && a.length >= 3 && a.every(function (q) { return !!ponto2(q); }); }
    if (r.forma === "extrusao") return pts2(r.contorno) && isFinite(Number(r.altura)) && (r.plano == null || !!lerPlano(r.plano));
    if (r.forma === "revolucao") return pts2(r.perfil) && !!r.eixo && !!vec3(r.eixo.o) && !!vec3(r.eixo.d) && !!vec3(r.eixo.ref);
    if (r.forma === "varredura") return pts2(r.perfil) && Array.isArray(r.caminho) && r.caminho.length >= 2 && r.caminho.every(function (p) { return !!vec3(p); });
    if (r.forma === "bool") return (r.tipo === "uniao" || r.tipo === "subtracao" || r.tipo === "intersecao") && receitaValida(r.a, prof + 1) && receitaValida(r.b, prof + 1);
    if (r.forma === "empurrar") return !!vec3(r.ponto) && !!vec3(r.normal) && isFinite(Number(r.dist)) && receitaValida(r.base, prof + 1);
    return isFinite(num(r.dx, 0)) && isFinite(num(r.dy, 0)) && isFinite(num(r.dz, 0)) && receitaValida(r.base, prof + 1);
  }
  /* perfis prontos da varredura (a = lado, b = para cima) */
  function perfilRetangulo(largura, altura) { var w = num(largura, 0.2) / 2, h = num(altura, 0.2); return [[-w, 0], [w, 0], [w, h], [-w, h]]; }
  function perfilCirculo(diametro, n) {
    var r = num(diametro, 0.1) / 2, k = Math.max(8, Math.round(num(n, 24))), out = [];
    for (var i = 0; i < k; i++) { var a = 2 * Math.PI * i / k; out.push([r6(r * Math.cos(a)), r6(r * Math.sin(a))]); }
    return out;
  }

  var BimVolume = {
    TOL: TOL,
    CATEGORIAS: { generico: "Genérico", parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", cobertura: "Cobertura" },
    IFC_DA_CATEGORIA: { generico: "IFCBUILDINGELEMENTPROXY", parede: "IFCWALL", laje: "IFCSLAB", pilar: "IFCCOLUMN", viga: "IFCBEAM", cobertura: "IFCROOF" },
    /* geometria */
    area2: area2, limparContorno: limparContorno, simples: simples, triangular: triangular,
    planoHorizontal: planoHorizontal, planoVertical: planoVertical, lerPlano: lerPlano, doPlano: doPlano, paraPlano: paraPlano,
    extrusao: extrusao, revolucao: revolucao, varredura: varredura,
    perfilRetangulo: perfilRetangulo, perfilCirculo: perfilCirculo,
    /* malha */
    volume: volume, area: area, caixa: caixa, soldar: soldar, fechada: fechada, costurar: costurar, transladar: transladar, inverter: inverter,
    regioesPlanas: regioesPlanas, faceNoPonto: faceNoPonto, lacos: lacos, prismaDaFace: prismaDaFace, empurrar: empurrar,
    /* receita */
    csgCom: csgCom, precisaCsg: precisaCsg, avaliar: avaliar, medir: medir, prismaDe: prismaDe, receitaValida: receitaValida,
    vetor: { sub: sub, add: add, mul: mul, dot: dot, cross: cross, len: len, norm: norm }
  };
  global.BimVolume = BimVolume;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVolume;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

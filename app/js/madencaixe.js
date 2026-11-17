/* =====================================================================
 * madencaixe.js — ENCAIXES E CORTES PERFEITOS da madeira engenharada (motor PURO, ES5, sem DOM, Node-testável).
 *
 * POR QUÊ (print do Rogério, 4 águas no BIM, 17/11/2026): a peça era uma CAIXA (prisma de pontas perpendiculares) posta entre dois nós de eixo.
 * Terça terminava antes do espigão ou o atravessava, barras cruzavam no meio, ponta solta. Madeira é acabamento fino: o corte tem que ser no
 * ângulo certo, a peça encosta na outra e o carpinteiro precisa do ângulo de cada corte.
 *
 * O QUE FAZ:
 *   1. SÓLIDO CONVEXO por peça = prisma (seção b×h ao longo do eixo) cortado por PLANOS nas pontas (esquadro, bisel simples, composto, duplo bisel).
 *      Rebaixo (entalhe) = sólido convexo subtraído da peça ("boca de pássaro": a peça contínua assenta no hospedeiro).
 *   2. RESOLVEDOR: para cada par de peças que se interpenetram, a de maior posto (hospedeira) fica e a outra (convidada) é cortada pelo plano de uma
 *      FACE da hospedeira (contato exato, folga 0) ou por esse plano deslocado de FOLGA (carga só por chapa + pinos, 10 mm). Postos iguais: meia-esquadria.
 *   3. CONFERÊNCIA: interpenetração (> 1 mm³ ou > 1 mm), contato previsto que falta (folga > 1 mm), folga construtiva fora de 9,5–12 mm, ponta solta,
 *      eixos concorrentes (ou excentricidade declarada) — relatório por nó.
 *   4. SAÍDAS: malha (IFC/COLLADA), receita booleana (BIM), ângulos de corte de cada ponta (planta, elevação e bisel real), comprimento bruto e de cada
 *      face, LISTA DE CORTE, fixadores (pino, parafuso, chapa) como sólidos.
 *   As regras de cada tipologia (postos, folgas, camada de cobertura) ficam em js/madencaixetip.js. Decisões: docs/madeira/ENCAIXES-REFERENCIA.md.
 *
 * CONVENÇÃO: ponto = [X, Z da planta, altura] (a mesma da T1/T2/T3/T7); índice 2 = para cima. Metros.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EPS = 1e-9;
  var TOL_VOL = 1e-9;          /* 1 mm³ em m³ */
  var TOL_PEN = 0.001;         /* 1 mm */
  var TOL_NUM = 0.0001;        /* 0,1 mm: ruído do arredondamento a 0,1 mm das coordenadas do modelo de cálculo (contato face a face não é interpenetração) */
  var FOLGA = 0.010;           /* folga construtiva padrão (m) */

  /* ------------------------------------------------------------ vetores */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function un(a) { var l = len(a); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function dist(a, b) { return len(sub(a, b)); }
  function rd(x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }
  function deg(r) { return r * 180 / Math.PI; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  /* ------------------------------------------------------------ SÓLIDO CONVEXO: { f: [ { p: [pts] } ] }, polígonos CCW vistos de fora */
  function newell(P) {
    var n = [0, 0, 0], i, a, b;
    for (i = 0; i < P.length; i++) { a = P[i]; b = P[(i + 1) % P.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
    return n;
  }
  function areaPoli(P) { return len(newell(P)) / 2; }
  function centroideV(S) {
    var c = [0, 0, 0], k = 0, i, j; for (i = 0; i < S.f.length; i++) for (j = 0; j < S.f[i].p.length; j++) { c = add(c, S.f[i].p[j]); k++; } return k ? mul(c, 1 / k) : c;
  }
  /** acrescenta n (unitário, para fora), d e área em cada face; orienta para fora */
  function prep(S) {
    if (S._prep) return S;
    var c = centroideV(S);
    S.f.forEach(function (F) {
      var n = un(newell(F.p)); if (dot(n, sub(F.p[0], c)) < 0) { F.p.reverse(); n = mul(n, -1); }
      F.n = n; F.d = dot(n, F.p[0]); F.a = areaPoli(F.p);
    });
    S._prep = true; return S;
  }
  function volume(S) { prep(S); var v = 0; S.f.forEach(function (F) { v += F.a * F.d / 3; }); return v; }
  function vertices(S) {
    var o = [], i, j, k, P;
    for (i = 0; i < S.f.length; i++) for (j = 0; j < S.f[i].p.length; j++) { P = S.f[i].p[j]; for (k = 0; k < o.length; k++) if (dist(o[k], P) < 1e-8) break; if (k === o.length) o.push(P); }
    return o;
  }
  function caixaDe(S) {
    var V = vertices(S), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], i, k;
    for (i = 0; i < V.length; i++) for (k = 0; k < 3; k++) { if (V[i][k] < mn[k]) mn[k] = V[i][k]; if (V[i][k] > mx[k]) mx[k] = V[i][k]; }
    return { mn: mn, mx: mx };
  }
  /** corta: mantém n·x ≤ d. Devolve sólido novo ou null (vazio/degenerado) */
  function cortar(S, n, d) {
    var out = [], cut = [], F, P, i, a, b, da, db, res, q, k, jaCoincide = false;
    for (k = 0; k < S.f.length; k++) {
      F = S.f[k]; P = F.p; res = []; var todosNoPlano = true;
      for (i = 0; i < P.length; i++) {
        a = P[i]; b = P[(i + 1) % P.length]; da = dot(n, a) - d; db = dot(n, b) - d;
        if (Math.abs(da) > EPS) todosNoPlano = false;
        if (da <= EPS) res.push(a);
        if (Math.abs(da) <= EPS) cut.push(a);
        if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) { q = lerp(a, b, da / (da - db)); res.push(q); cut.push(q); }
      }
      if (todosNoPlano && F.n && dot(F.n, n) > 0.999999) jaCoincide = true;
      if (res.length >= 3 && areaPoli(res) > 1e-12) out.push({ p: res });
    }
    if (!out.length) return null;
    var capa = [];
    cut.forEach(function (p) { for (var j = 0; j < capa.length; j++) if (dist(capa[j], p) < 1e-7) return; capa.push(p); });
    if (capa.length >= 3 && !jaCoincide) {
      var c = [0, 0, 0]; capa.forEach(function (p) { c = add(c, p); }); c = mul(c, 1 / capa.length);
      var u = Math.abs(n[0]) < 0.9 ? un(cruz(n, [1, 0, 0])) : un(cruz(n, [0, 1, 0])), v = cruz(n, u);
      capa.sort(function (p, q2) { var dp = sub(p, c), dq = sub(q2, c); return Math.atan2(dot(dp, v), dot(dp, u)) - Math.atan2(dot(dq, v), dot(dq, u)); });
      if (dot(newell(capa), n) < 0) capa.reverse();
      if (areaPoli(capa) > 1e-12) out.push({ p: capa });
    }
    if (out.length < 4) return null;
    var R = { f: out }; prep(R); return R;
  }
  /** volume de A ∩ (n·x ≤ d + folga para cada face de B) */
  function volInter(A, B, infla) {
    prep(B); var S = A, k;
    for (k = 0; k < B.f.length; k++) { S = cortar(S, B.f[k].n, B.f[k].d + (infla || 0)); if (!S) return 0; }
    return Math.max(0, volume(S));
  }
  function interSolido(A, B) {
    prep(B); var S = A, k;
    for (k = 0; k < B.f.length; k++) { S = cortar(S, B.f[k].n, B.f[k].d); if (!S) return null; }
    return S;
  }
  function bboxSobrepoe(a, b, m) { for (var k = 0; k < 3; k++) if (a.mn[k] > b.mx[k] + m || b.mn[k] > a.mx[k] + m) return false; return true; }

  /** prisma de seção poligonal (poli = [[y,z]…], y ao longo de ey, z ao longo de ez) de s0 a s1 ao longo de ex a partir de o */
  function prismaPoli(o, ex, ey, ez, poli, s0, s1) {
    var K = poli.length, A = [], B = [], i, f = [];
    function P(q, s) { return add(add(add(o, mul(ex, s)), mul(ey, q[0])), mul(ez, q[1])); }
    for (i = 0; i < K; i++) { A.push(P(poli[i], s0)); B.push(P(poli[i], s1)); }
    for (i = 0; i < K; i++) { var j = (i + 1) % K; f.push({ p: [A[i], A[j], B[j], B[i]] }); }
    f.push({ p: A.slice() }); f.push({ p: B.slice() });
    var S = { f: f }; prep(S); return S;
  }
  function retPoli(b, h) { return [[-h / 2, -b / 2], [h / 2, -b / 2], [h / 2, b / 2], [-h / 2, b / 2]]; }
  function circPoli(d, n) { var o = [], i, t; n = n || 16; for (i = 0; i < n; i++) { t = 2 * Math.PI * i / n; o.push([d / 2 * Math.cos(t), d / 2 * Math.sin(t)]); } return o; }

  /* ------------------------------------------------------------ SAT: separação (>0) ou penetração (<0) entre convexos */
  function arestas(S) {
    var E = [], i, j, a, b, d, k, ok;
    for (i = 0; i < S.f.length; i++) for (j = 0; j < S.f[i].p.length; j++) {
      a = S.f[i].p[j]; b = S.f[i].p[(j + 1) % S.f[i].p.length]; d = un(sub(b, a)); ok = true;
      for (k = 0; k < E.length; k++) if (Math.abs(dot(E[k], d)) > 0.999999) { ok = false; break; }
      if (ok && len(d) > 0) E.push(d);
    }
    return E;
  }
  function sat(A, B) {
    prep(A); prep(B);
    var eixos = [], VA = vertices(A), VB = vertices(B), best = -Infinity, i, j, k, ax, l, a0, a1, b0, b1, p, s;
    A.f.forEach(function (F) { eixos.push(F.n); }); B.f.forEach(function (F) { eixos.push(F.n); });
    var EA = A._ar || (A._ar = arestas(A)), EB = B._ar || (B._ar = arestas(B));
    for (i = 0; i < EA.length; i++) for (j = 0; j < EB.length; j++) { ax = cruz(EA[i], EB[j]); l = len(ax); if (l > 1e-6) eixos.push(mul(ax, 1 / l)); }
    for (k = 0; k < eixos.length; k++) {
      ax = eixos[k]; a0 = Infinity; a1 = -Infinity; b0 = Infinity; b1 = -Infinity;
      for (p = 0; p < VA.length; p++) { s = dot(ax, VA[p]); if (s < a0) a0 = s; if (s > a1) a1 = s; }
      for (p = 0; p < VB.length; p++) { s = dot(ax, VB[p]); if (s < b0) b0 = s; if (s > b1) b1 = s; }
      var sep = Math.max(b0 - a1, a0 - b1);          /* >0: separados nesse eixo; <0: sobreposição (−profundidade) */
      if (sep > best) best = sep;
    }
    return best;     /* >0 folga (limite inferior da distância); <0 = −(profundidade mínima de penetração) */
  }
  /** distância de um ponto a um polígono plano (exata) */
  function distPtPoli(Q, F) {
    var n = F.n, dn = dot(n, Q) - F.d, pr = sub(Q, mul(n, dn)), P = F.p, i, inside = true;
    for (i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; if (dot(cruz(sub(b, a), sub(pr, a)), n) < -1e-12) { inside = false; break; } }
    if (inside) return Math.abs(dn);
    var m = Infinity;
    for (i = 0; i < P.length; i++) { var a2 = P[i], b2 = P[(i + 1) % P.length], e = sub(b2, a2), t = Math.max(0, Math.min(1, dot(sub(Q, a2), e) / (dot(e, e) || 1))); m = Math.min(m, dist(Q, add(a2, mul(e, t)))); }
    return m;
  }
  /** distância (limite superior, exata para faces paralelas) entre dois convexos: vértices de um às faces do outro */
  function distancia(A, B) {
    prep(A); prep(B); var VA = vertices(A), VB = vertices(B), m = Infinity, i, k;
    for (i = 0; i < VA.length; i++) for (k = 0; k < B.f.length; k++) m = Math.min(m, distPtPoli(VA[i], B.f[k]));
    for (i = 0; i < VB.length; i++) for (k = 0; k < A.f.length; k++) m = Math.min(m, distPtPoli(VB[i], A.f[k]));
    return m;
  }

  /** distância entre uma face (polígono plano com n, d) e um sólido convexo */
  function distFaceSolido(F, S) {
    prep(S); var m = Infinity, i, k;
    for (i = 0; i < F.p.length; i++) for (k = 0; k < S.f.length; k++) m = Math.min(m, distPtPoli(F.p[i], S.f[k]));
    var V = vertices(S); for (i = 0; i < V.length; i++) m = Math.min(m, distPtPoli(V[i], F));
    return m;
  }
  /** folga medida entre a região da face (camada de 3 mm junto ao plano da ponta) e a hospedeira: menor inflação da hospedeira que a toca. 0 = encosta. */
  function folgaPlano(G, pl, H) {
    var S = solidoDe(G), SH = solidoDe(H); if (!S || !SH) return null;
    var cam = cortar(S, mul(pl.n, -1), -(pl.d - 0.003)); if (!cam) return null;
    var lo = 0, hi = 0.35, k;
    if (volInter(cam, SH, 0) > 1e-10 && penetracao({ _S: cam, _box: caixaDe(cam), p0: [0, 0, 0], rebaixos: [], fins: [{ planos: [] }, { planos: [] }] }, H) > 0.0045) return 0;
    if (volInter(cam, SH, hi) <= 1e-10) return Infinity;
    for (k = 0; k < 18; k++) { var m = (lo + hi) / 2; if (volInter(cam, SH, m) > 1e-10) hi = m; else lo = m; }
    return hi;
  }
  /** folga entre duas peças (convexos de base): 0 se encostam ou se interpenetram; senão a menor inflação que as toca */
  function folgaPecas(A, B) {
    var SA = solidoDe(A), SB = solidoDe(B); if (!SA || !SB) return null; var lo = 0, hi = 0.5, k;
    if (volInter(SA, SB, 1e-9) > 1e-10 || sat(SA, SB) <= 0) return 0;
    if (volInter(SA, SB, hi) <= 1e-10) return Infinity;
    for (k = 0; k < 20; k++) { var m = (lo + hi) / 2; if (volInter(SA, SB, m) > 1e-10) hi = m; else lo = m; }
    return hi;
  }
  /** a face de G que está sobre o plano da ponta (ou null se um corte posterior a apagou) */
  function faceNoPlano(G, pl) {
    var S = solidoDe(G); if (!S) return null; prep(S); var i, F, melhor = null;
    for (i = 0; i < S.f.length; i++) { F = S.f[i]; if (dot(F.n, pl.n) > 0.999 && Math.abs(F.d - pl.d) < 1e-6 && (!melhor || F.a > melhor.a)) melhor = F; }
    return melhor;
  }

  /* ------------------------------------------------------------ PEÇA = prisma + planos de ponta + rebaixos */
  var EXT = 3.0;   /* extensão (m) além do nó nas pontas que recebem corte: o plano da face da hospedeira define o fim real */
  function quadro(p0, p1, up) {
    var ex = un(sub(p1, p0)), u = up && len(up) > 0 ? up : [0, 0, 1], ey = sub(u, mul(ex, dot(u, ex)));
    if (len(ey) < 1e-6) { u = Math.abs(ex[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; ey = sub(u, mul(ex, dot(u, ex))); }
    ey = un(ey); return { ex: ex, ey: ey, ez: cruz(ex, ey) };
  }
  /** def = { id, g, p0, p1, up, b, h | d, rank, ... } → peça com solido() */
  function criarPeca(def) {
    var q = quadro(def.p0, def.p1, def.up), P = {};
    Object.keys(def).forEach(function (k) { P[k] = def[k]; });
    P.ex = q.ex; P.ey = q.ey; P.ez = q.ez; P.L = dist(def.p0, def.p1);
    P.poli = def.d ? circPoli(def.d, 16) : retPoli(def.b, def.h); P.area = def.d ? Math.PI * def.d * def.d / 4 : def.b * def.h;
    P.fins = [{ planos: [] }, { planos: [] }]; P.rebaixos = []; P._S = null;
    return P;
  }
  function solidoDe(P) {
    if (P._S) return P._S;
    if (P.fixo) { P._S = P.fixo; prep(P._S); P._box = caixaDe(P._S); return P._S; }          /* sólido pronto (perfil de viga de altura variável): não tem ponta cortável */
    var s0 = P.fins[0].planos.length ? -EXT : 0, s1 = P.L + (P.fins[1].planos.length ? EXT : 0), S = prismaPoli(P.p0, P.ex, P.ey, P.ez, P.poli, s0, s1), e, k;
    for (e = 0; e < 2; e++) for (k = 0; k < P.fins[e].planos.length; k++) { var pl = P.fins[e].planos[k]; S = S && cortar(S, pl.n, pl.d); }
    if (P.clips) for (k = 0; k < P.clips.length; k++) S = S && cortar(S, P.clips[k].n, P.clips[k].d);       /* planos laterais (ex.: base da sela no topo do frechal) */
    P._S = S; P._box = S ? caixaDe(S) : null; return S;
  }
  function invalidar(P) { P._S = null; P._box = null; P._mesh = null; }
  /** coordenada s (ao longo do eixo, a partir de p0) de um ponto */
  function sDe(P, X) { return dot(sub(X, P.p0), P.ex); }
  function extensaoAxial(P) { var S = solidoDe(P); if (!S) return null; var V = vertices(S), mn = Infinity, mx = -Infinity, i, s; for (i = 0; i < V.length; i++) { s = sDe(P, V[i]); if (s < mn) mn = s; if (s > mx) mx = s; } return [mn, mx]; }
  /** volume do prisma de seção da peça de fato (inclui rebaixos) */
  function volumePeca(P) {
    var S = solidoDe(P); if (!S) return 0; var v = volume(S), i;
    for (i = 0; i < P.rebaixos.length; i++) v -= volInter(S, P.rebaixos[i], 0);
    return v;
  }
  /** volume de A∩B de duas peças (com rebaixos de ambas, que não se interceptam entre si) */
  function volInterPecas(A, B) {
    var SA = solidoDe(A), SB = solidoDe(B); if (!SA || !SB) return 0;
    if (!A._box || !B._box || !bboxSobrepoe(A._box, B._box, 0)) return 0;
    var I = interSolido(SA, SB); if (!I) return 0; var v = volume(I), i, j;
    for (i = 0; i < A.rebaixos.length; i++) v -= volInter(I, A.rebaixos[i], 0);
    for (j = 0; j < B.rebaixos.length; j++) v -= volInter(I, B.rebaixos[j], 0);
    for (i = 0; i < A.rebaixos.length; i++) { var IA = interSolido(I, A.rebaixos[i]); if (!IA) continue; for (j = 0; j < B.rebaixos.length; j++) v += volInter(IA, B.rebaixos[j], 0); }
    return Math.max(0, v);
  }
  /** profundidade mínima de penetração (m) entre as peças: do SAT dos convexos de base; 0 se não há volume em comum */
  function penetracao(A, B) {
    var SA = solidoDe(A), SB = solidoDe(B); if (!SA || !SB) return 0; var s = sat(SA, SB); return s < 0 ? -s : 0;
  }

  /* ------------------------------------------------------------ ÂNGULOS DE CORTE DE UMA PONTA */
  /** plano de ponta { n (para fora da peça), d } → ângulos medidos no quadro da peça. n·ex = 1 é esquadro. */
  function angulosPlano(P, e, pl) {
    var ex = e === 0 ? mul(P.ex, -1) : P.ex, ey = P.ey, ez = e === 0 ? mul(P.ez, -1) : P.ez;     /* ex para fora; ez mantém a destra (ex×ey = ez com ex para dentro) */
    var nx = dot(pl.n, ex), ny = dot(pl.n, ey), nz = dot(pl.n, P.ez);
    return { planta: deg(Math.atan2(nz, nx)), elevacao: deg(Math.atan2(ny, nx)), bisel: deg(Math.acos(Math.max(-1, Math.min(1, nx)))), nx: nx, ny: ny, nz: nz };
  }
  function tipoCorte(planos, P, e) {
    if (!planos.length) return "esquadro";
    if (planos.length > 1) return "duplo bisel";
    var a = angulosPlano(P, e, planos[0]);
    if (a.bisel < 0.1) return "esquadro";
    if (Math.abs(a.planta) < 0.1 || Math.abs(a.elevacao) < 0.1) return "bisel simples";
    return "bisel composto";
  }

  /* ------------------------------------------------------------ MALHA (triângulos) e RECEITA */
  function malhaDeSolido(S, off) {
    prep(S); var v = [], f = [], F, i, j, base;
    for (i = 0; i < S.f.length; i++) {
      F = S.f[i]; base = v.length / 3;
      for (j = 0; j < F.p.length; j++) { var P = off ? sub(F.p[j], off) : F.p[j]; v.push(rd(P[0], 5), rd(P[1], 5), rd(P[2], 5)); }
      for (j = 1; j + 1 < F.p.length; j++) f.push(base, base + j, base + j + 1);
    }
    return { v: v, f: f };
  }
  function cena(p) { return [p[0], p[2], -p[1]]; }
  /** partes convexas da peça (base menos rebaixos, por fatiamento BSP): lista de sólidos disjuntos cuja união é a peça */
  function partesConvexas(P) {
    var S = solidoDe(P); if (!S) return []; var partes = [S], r, k, nova, N, pl;
    for (r = 0; r < P.rebaixos.length; r++) {
      N = prep(P.rebaixos[r]); nova = [];
      partes.forEach(function (Q) {
        var resto = Q, k2, fora;
        for (k2 = 0; k2 < N.f.length; k2++) {
          pl = N.f[k2]; fora = resto && cortar(resto, mul(pl.n, -1), -pl.d);            /* parte do resto do lado de fora do plano k */
          if (fora && volume(fora) > 1e-12) nova.push(fora);
          resto = resto && cortar(resto, pl.n, pl.d);                                    /* fica o que está dentro do plano k e segue */
          if (!resto) break;
        }
      });
      partes = nova;
    }
    return partes;
  }
  /** malha da peça na cena do BIM ([x, z, -y] = [X, altura, −Z]); com rebaixos, as partes convexas vão juntas */
  function malhaPeca(P) {
    if (P._mesh) return P._mesh;
    var ps = partesConvexas(P), v = [], f = [];
    ps.forEach(function (S) { var m = malhaDeSolido(S), b = v.length / 3, i; for (i = 0; i < m.v.length; i += 3) { var c = cena([m.v[i], m.v[i + 1], m.v[i + 2]]); v.push(rd(c[0], 5), rd(c[1], 5), rd(c[2], 5)); } for (i = 0; i < m.f.length; i++) f.push(m.f[i] + b); });
    P._mesh = { v: v, f: f }; return P._mesh;
  }
  /** laje (extrusão quadrada grande) que ocupa o semiespaço n·x > d (n, d em coordenadas do modelo [X, Z, altura]) */
  function laje(n, dd) {
    var G = 8, nn = cena(n), uu = un(cruz(nn, Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), vv = cruz(nn, uu), c0 = mul(nn, dd);
    return { forma: "extrusao", contorno: [[-G, -G], [G, -G], [G, G], [-G, G]], altura: G, plano: { o: [rd(c0[0], 6), rd(c0[1], 6), rd(c0[2], 6)], u: uu.map(function (q) { return rd(q, 6); }), v: vv.map(function (q) { return rd(q, 6); }) } };
  }
  /** receita booleana do BIM: prisma estendido − (semiespaço de cada plano de ponta) − rebaixos (cada rebaixo = caixa − semiespaços de suas faces). O BIM avalia por CSG (js/bimvolume.js). */
  function receitaPeca(P, semRebaixos) {
    var S = solidoDe(P); if (!S) return null;
    var ext = extensaoAxial(P), s0 = ext[0] - 0.02, s1 = ext[1] + 0.02, o = add(P.p0, mul(P.ex, s0));
    var d = cena(P.ex), v = cena(P.ey), u = un(cruz(v, d));
    var r = { forma: "extrusao", contorno: P.poli.map(function (q) { var c = cena(add(mul(P.ey, q[0]), mul(P.ez, q[1]))); return [rd(dot(c, u), 5), rd(dot(c, v), 5)]; }), altura: rd(s1 - s0, 5), plano: { o: cena(o), u: u, v: v } };
    var e, k;
    for (e = 0; e < 2; e++) for (k = 0; k < P.fins[e].planos.length; k++) { var pl = P.fins[e].planos[k]; r = { forma: "bool", tipo: "subtracao", a: r, b: laje(pl.n, pl.d) }; }
    if (P.clips) P.clips.forEach(function (c) { r = { forma: "bool", tipo: "subtracao", a: r, b: laje(c.n, c.d) }; });
    if (!semRebaixos) P.rebaixos.forEach(function (N) { r = { forma: "bool", tipo: "subtracao", a: r, b: receitaConvexo(N) }; });
    return r;
  }
  function receitaConvexo(N) {
    prep(N); var bx = caixaDe(N), c = mul(add(bx.mn, bx.mx), 0.5), dx = bx.mx[0] - bx.mn[0] + 0.2, dy = bx.mx[1] - bx.mn[1] + 0.2, dz = bx.mx[2] - bx.mn[2] + 0.2;
    var pc = cena([bx.mn[0] - 0.1, bx.mn[1] - 0.1, bx.mn[2] - 0.1]);
    var r = { forma: "extrusao", contorno: [[0, 0], [dx, 0], [dx, dz], [0, dz]], altura: rd(dy, 5), plano: { o: [rd(pc[0], 5), rd(pc[1], 5), rd(pc[2], 5)], u: [1, 0, 0], v: [0, 1, 0] } };
    /* plano u=(1,0,0) [X], v=(0,1,0) [altura da cena]; u×v = (0,0,1) cena = −Z do modelo: a caixa vai de Z = bx.mx[1]+0.1 para trás */
    r.plano.o = [rd(pc[0], 5), rd(pc[1], 5), rd(cena([0, bx.mx[1] + 0.1, 0])[2], 5)];
    r.contorno = [[0, 0], [rd(dx, 5), 0], [rd(dx, 5), rd(dz, 5)], [0, rd(dz, 5)]];
    N.f.forEach(function (F) { r = { forma: "bool", tipo: "subtracao", a: r, b: laje(F.n, F.d) }; });
    return r;
  }

  /* ------------------------------------------------------------ RESOLVEDOR */
  /** postos: cfg.rank(g) (maior = hospedeira); cfg.folga(gA, gB) → m (0 = contato); cfg.hospeda(gH, gG) → true força H hospeda G; cfg.ignora(A, B) → true pula o par */
  function resolver(pecas, cfg) {
    cfg = cfg || {}; var rel = { contatos: [], folgas: [], mitres: [], rebaixos: [], naoResolvidos: [], passos: 0 }, passo, i, j;
    pecas.forEach(function (P) { solidoDe(P); });
    function postoDe(P) { return cfg.rank ? cfg.rank(P) : 0; }
    function ehHosp(H, G) {
      if (cfg.hospeda) { var r = cfg.hospeda(H, G); if (r === true) return true; if (r === false) return false; var r2 = cfg.hospeda(G, H); if (r2 === true) return false; }
      var a = postoDe(H), b = postoDe(G); if (a !== b) return a > b;
      if (Math.abs(H.area - G.area) > 1e-9) return H.area > G.area;
      return null;      /* empate: meia-esquadria */
    }
    for (passo = 0; passo < 12; passo++) {
      var mudou = false, pares = [];
      for (i = 0; i < pecas.length; i++) for (j = i + 1; j < pecas.length; j++) {
        var A = pecas[i], B = pecas[j]; if (!A._box || !B._box || !bboxSobrepoe(A._box, B._box, 0)) continue;
        if (cfg.ignora && cfg.ignora(A, B)) continue;
        var vol = volInterPecas(A, B); if (vol > TOL_VOL && penetracao(A, B) > TOL_NUM) pares.push({ A: A, B: B, vol: vol });
      }
      rel.passos = passo + 1;
      if (!pares.length) break;
      /* primeiro as hierarquias (hospedeira × convidada), depois os empates (meia-esquadria): um corte de hierarquia costuma desfazer o empate */
      pares.forEach(function (q) { q.emp = ehHosp(q.A, q.B) === null ? 1 : 0; q.pg = Math.min(postoDe(q.A), postoDe(q.B)); });
      /* a peça de posto alto (que é hospedeira de outras) é cortada ANTES de oferecer suas faces: ordem pelo posto da convidada, do maior para o menor */
      pares.sort(function (x, y) { return x.emp !== y.emp ? x.emp - y.emp : (x.pg !== y.pg ? y.pg - x.pg : y.vol - x.vol); });
      for (i = 0; i < pares.length; i++) {
        var par = pares[i], A2 = par.A, B2 = par.B;
        if (volInterPecas(A2, B2) <= TOL_VOL || penetracao(A2, B2) <= TOL_NUM) continue;        /* já resolvido por um corte anterior deste passo */
        var h = ehHosp(A2, B2), H, G, fol = cfg.folga ? cfg.folga(A2, B2) : 0, ok;
        if (h === null) { ok = mitre(A2, B2, fol, rel); }
        else {
          H = h ? A2 : B2; G = h ? B2 : A2;
          /* a sobreposição está NA PONTA da convidada (corte de ponta) ou no meio dela (a peça passa pela hospedeira: rebaixo / boca de pássaro) */
          var Ix = interSolido(solidoDe(G), solidoDe(H)), dPonta = 0;
          if (Ix) { var sc0 = sDe(G, centroideV(Ix)); dPonta = Math.min(sc0, G.L - sc0); }
          var naPonta = dPonta <= Math.max(0.5, 2.5 * Math.max(G.b || G.d || 0, G.h || G.d || 0));
          ok = (naPonta && (cortarConvidada(G, H, fol, rel, cfg) || cortarConvidadaDupla(G, H, fol, rel))) || rebaixar(G, H, rel);
        }
        if (ok) mudou = true;
      }
      if (!mudou) break;
    }
    pecas.forEach(function (P) { solidoDe(P); });
    /* poda: plano de ponta que não forma face na peça (corte posterior o tornou redundante) sai da lista */
    pecas.forEach(function (P) {
      var e, mudou = false;
      for (e = 0; e < 2; e++) {
        var antes = P.fins[e].planos.length;
        P.fins[e].planos = P.fins[e].planos.filter(function (pl) {
          var F = faceNoPlano(P, pl); if (!(F && F.a > 1e-6)) return false;
          var S1 = solidoDe(P), salvo = P.fins[e].planos; P.fins[e].planos = salvo.filter(function (q) { return q !== pl; }); invalidar(P);
          var S2 = solidoDe(P), dif = 1; if (S1 && S2) { var Ix = interSolido(S1, S2); dif = volume(S1) + volume(S2) - 2 * (Ix ? volume(Ix) : 0); }
          P.fins[e].planos = salvo; invalidar(P); solidoDe(P);
          return dif > 1e-9;       /* o plano que não muda a peça em ao menos 1 mm³ (diferença simétrica) é redundante */
        });
        if (P.fins[e].planos.length !== antes) mudou = true;
      }
      if (mudou) { invalidar(P); solidoDe(P); }
    });
    /* o que sobrou */
    for (i = 0; i < pecas.length; i++) for (j = i + 1; j < pecas.length; j++) {
      var A3 = pecas[i], B3 = pecas[j]; if (!A3._box || !B3._box || !bboxSobrepoe(A3._box, B3._box, 0)) continue;
      if (cfg.ignora && cfg.ignora(A3, B3)) continue;
      var v3 = volInterPecas(A3, B3); if (v3 > TOL_VOL && penetracao(A3, B3) > TOL_NUM) rel.naoResolvidos.push({ a: A3.id, b: B3.id, volume_mm3: v3 * 1e9, penetracao_mm: penetracao(A3, B3) * 1000 });
    }
    return rel;
  }
  function volumeSolidoSimples(G) { var S = solidoDe(G); return S ? volume(S) : 0; }
  /** qual ponta de G fica mais perto da região de sobreposição com H */
  function pontaPerto(G, H) {
    var I = interSolido(solidoDe(G), solidoDe(H)); if (!I) return 0; var c = centroideV(I), s = sDe(G, c);
    return s < G.L / 2 ? 0 : 1;
  }
  function planoDeFace(F, fol) { return { n: mul(F.n, -1), d: -(F.d + fol) }; }       /* mantém o lado de fora da face de H, afastado de fol */
  /** corta a ponta de G no plano de uma face de H. O melhor = o que anula a sobreposição perdendo menos do corpo nominal. */
  function cortarConvidada(G, H, fol, rel, cfg) {
    var SH = solidoDe(H); if (!SH) return false; prep(SH);
    var e = pontaPerto(G, H), melhor = null, vNom = G.area * G.L, k, F, pl, antes = G.fins[e].planos.slice();
    var sNo = e === 0 ? 0 : G.L, vAntes = volumeSolidoSimples(G);
    for (k = 0; k < SH.f.length; k++) {
      F = SH.f[k]; pl = planoDeFace(F, fol);
      if (dot(pl.n, e === 0 ? mul(G.ex, -1) : G.ex) < 0.2) continue;          /* o plano tem de FECHAR a ponta (transversal): plano paralelo ao eixo fatiaria a peça no comprimento */
      G.fins[e].planos = antes.concat([pl]); invalidar(G);
      var S = solidoDe(G), okv = !!S;
      if (okv) {
        var ex = extensaoAxial(G), sFim = e === 0 ? ex[0] : ex[1], enc = Math.abs(sFim - sNo), outro = e === 0 ? ex[1] : ex[0];
        var vi = volInterPecas(G, H), curto = Math.abs(outro - (e === 0 ? G.L : 0)) > 0.35 * G.L;
        if ((vi <= TOL_VOL || penetracao(G, H) <= TOL_NUM) && !curto && ex[1] - ex[0] > 0.3 * G.L && enc <= Math.max(0.35, 0.2 * G.L)) {
          var sc = Math.abs(volumeSolidoSimples(G) - vAntes) + 1e-4 * enc; if ((!melhor || sc < melhor.sc) && Math.abs(folgaPlano(G, pl, H) - fol) < 0.0006) melhor = { pl: pl, sc: sc, k: k };
        }
      }
    }
    G.fins[e].planos = antes; invalidar(G);
    if (!melhor) return false;
    var plm = melhor.pl; plm.contra = H.id; plm.contras = [H.id]; plm.tipo = fol > 0 ? "folga" : "contato"; plm.folga = fol; plm.faceDe = melhor.k;
    var igual = null; antes.forEach(function (o) { if (Math.abs(dot(o.n, plm.n) - 1) < 1e-9 && Math.abs(o.d - plm.d) < 1e-7) igual = o; });
    if (igual) { (igual.contras = igual.contras || [igual.contra]).push(H.id); G.fins[e].planos = antes; }
    else G.fins[e].planos = antes.concat([plm]);
    invalidar(G); solidoDe(G);
    (fol > 0 ? rel.folgas : rel.contatos).push({ convidada: G.id, hospedeira: H.id, ponta: e, folga: fol });
    return true;
  }
  /** duas faces de H na mesma ponta de G (duplo bisel: ex. espigão que se encaixa entre dois planos) */
  function cortarConvidadaDupla(G, H, fol, rel) {
    var SH = solidoDe(H); if (!SH) return false; prep(SH);
    var e = pontaPerto(G, H), antes = G.fins[e].planos.slice(), melhor = null, a, b;
    for (a = 0; a < SH.f.length; a++) for (b = a + 1; b < SH.f.length; b++) {
      var p1 = planoDeFace(SH.f[a], fol), p2 = planoDeFace(SH.f[b], fol), od = e === 0 ? mul(G.ex, -1) : G.ex;
      if (dot(p1.n, od) < 0.2 && dot(p2.n, od) < 0.2) continue;
      G.fins[e].planos = antes.concat([p1, p2]); invalidar(G); var S = solidoDe(G);
      if (S) { var ex = extensaoAxial(G); if ((volInterPecas(G, H) <= TOL_VOL || penetracao(G, H) <= TOL_NUM) && ex[1] - ex[0] > 0.5 * G.L) { var sc = Math.abs(ex[1] - ex[0] - G.L); if (!melhor || sc < melhor.sc) melhor = { p1: p1, p2: p2, sc: sc }; } }
    }
    G.fins[e].planos = antes; invalidar(G);
    if (!melhor) return false;
    [melhor.p1, melhor.p2].forEach(function (p) { p.contra = H.id; p.tipo = fol > 0 ? "folga" : "contato"; p.folga = fol; });
    G.fins[e].planos = antes.concat([melhor.p1, melhor.p2]); invalidar(G); solidoDe(G);
    (fol > 0 ? rel.folgas : rel.contatos).push({ convidada: G.id, hospedeira: H.id, ponta: e, folga: fol, duplo: true });
    return true;
  }
  /** postos iguais: meia-esquadria no nó (plano bissetor); cada peça fica com seu lado, afastada de fol/2 */
  function mitre(A, B, fol, rel) {
    var eA, eB, best = Infinity, ends = [[0, 0], [0, 1], [1, 0], [1, 1]];
    ends.forEach(function (pe) { var d = dist(pe[0] === 0 ? A.p0 : A.p1, pe[1] === 0 ? B.p0 : B.p1); if (d < best) { best = d; eA = pe[0]; eB = pe[1]; } });
    if (best > 0.35) return false;
    var PA = eA === 0 ? A.p0 : A.p1, PB = eB === 0 ? B.p0 : B.p1, N = mul(add(PA, PB), 0.5);
    var uA = un(eA === 0 ? A.ex : mul(A.ex, -1)), uB = un(eB === 0 ? B.ex : mul(B.ex, -1)), n = un(sub(uA, uB));       /* aponta de B para A */
    if (len(n) < 1e-6) return false;
    var plA = { n: mul(n, -1), d: -dot(n, N) - fol / 2, contra: B.id, tipo: fol > 0 ? "folga" : "contato", folga: fol, mitre: true };
    var plB = { n: n, d: dot(n, N) - fol / 2, contra: A.id, tipo: fol > 0 ? "folga" : "contato", folga: fol, mitre: true };
    A.fins[eA].planos.push(plA); B.fins[eB].planos.push(plB); invalidar(A); invalidar(B); solidoDe(A); solidoDe(B);
    rel.mitres.push({ a: A.id, b: B.id, pontaA: eA, pontaB: eB, folga: fol });
    return true;
  }
  /** peça contínua que atravessa a hospedeira: rebaixo = forma da hospedeira (boca de pássaro). Recusa se corta a peça ao meio ou passa de 1/3 da altura. */
  function rebaixar(G, H, rel) {
    var SG = solidoDe(G), SH = solidoDe(H); if (!SG || !SH) return false;
    var I = interSolido(SG, SH); if (!I) return false;
    var Nn = SH, prof = 0, V = vertices(I), i;
    for (i = 0; i < V.length; i++) { prof = Math.max(prof, Math.abs(dot(sub(V[i], G.p0), G.ey))); }
    /* corta ao meio? procura uma fatia em que H cobre a seção inteira de G */
    var n = 24, s, cob = 0;
    for (s = 0; s <= n; s++) {
      var sp = G.L * s / n, fat = prismaPoli(add(G.p0, mul(G.ex, sp)), G.ex, G.ey, G.ez, G.poli, -0.002, 0.002), av = volume(fat), vi = volInter(fat, SH, 0);
      if (av > 0) cob = Math.max(cob, vi / av);
    }
    if (cob > 0.98) return false;
    var vSec = volume(I) / Math.max(volume(SG), 1e-12);
    if (vSec > 0.5) return false;
    G.rebaixos.push(I); invalidar(G); solidoDe(G);
    rel.rebaixos.push({ peca: G.id, hospedeira: H.id, volume_cm3: volume(I) * 1e6 });
    return true;
  }

  /* ------------------------------------------------------------ CONFERÊNCIA */
  /** pecas já resolvidas. cfg: { toleranciaContato (m), folgaMin, folgaMax, livre(P, e) → motivo|null, apoiosDeclarados:[{a,b}] } */
  function conferir(pecas, cfg, rel) {
    cfg = cfg || {}; var achados = [], avisos = [], porNo = {}, i, j, e, k, tolC = cfg.toleranciaContato || 0.001, fMin = cfg.folgaMin == null ? 0.0095 : cfg.folgaMin, fMax = cfg.folgaMax == null ? 0.0125 : cfg.folgaMax;
    pecas.forEach(function (P) { solidoDe(P); });
    /* 1. interpenetração */
    var pen = [];
    for (i = 0; i < pecas.length; i++) for (j = i + 1; j < pecas.length; j++) {
      var A = pecas[i], B = pecas[j]; if (!A._box || !B._box || !bboxSobrepoe(A._box, B._box, 0)) continue;
      if (cfg.ignora && cfg.ignora(A, B)) continue;
      var v = volInterPecas(A, B), p = v > 0 ? penetracao(A, B) : 0;
      if ((v > TOL_VOL && p > TOL_NUM) || p > TOL_PEN) pen.push({ a: A.id, b: B.id, volume_mm3: rd(v * 1e9, 2), penetracao_mm: rd(p * 1000, 2) });
    }
    pen.forEach(function (x) { achados.push({ regra: "interpenetracao", a: x.a, b: x.b, texto: "peças " + x.a + " e " + x.b + " se interpenetram (" + x.volume_mm3 + " mm³; " + x.penetracao_mm + " mm)" }); });
    /* 2. contato previsto / folga prevista (do resolvedor) */
    var cont = [], fol = [];
    function porId(id) { for (var q = 0; q < pecas.length; q++) if (pecas[q].id === id) return pecas[q]; return null; }
    pecas.forEach(function (G) {
      for (e = 0; e < 2; e++) G.fins[e].planos.forEach(function (pl) {
        if (!pl.contra) return; var H = porId(pl.contra); if (!H) return;
        var Fp = faceNoPlano(G, pl); if (!Fp || Fp.a < 4e-4) return;
        /* vários hospedeiros no MESMO plano (ex.: os dois banzos de uma tesoura): basta um tocar */
        var cand = (pl.contras || [pl.contra]).slice();
        pecas.forEach(function (O) {      /* quem tem uma face no mesmo plano também pode ser quem toca */
          if (O === G || cand.indexOf(O.id) >= 0) return; var SO = solidoDe(O); if (!SO) return; prep(SO);
          for (var q = 0; q < SO.f.length; q++) if (dot(SO.f[q].n, pl.n) < -0.999999 && Math.abs(SO.f[q].d + pl.d + (pl.folga || 0)) < 1e-6) { cand.push(O.id); return; }
        });
        var d = Infinity, melhorH = H; cand.forEach(function (hid) { var Hq = porId(hid); if (!Hq) return; var dq = folgaPlano(G, pl, Hq); if (dq != null && dq < d) { d = dq; melhorH = Hq; } });
        if (d === Infinity && !isFinite(d)) d = folgaPlano(G, pl, H);
        H = melhorH;
        var reg = { convidada: G.id, hospedeira: H.id, ponta: e, tipo: pl.tipo, distancia_mm: rd(d * 1000, 3), folga_prevista_mm: rd((pl.folga || 0) * 1000, 1), mitre: !!pl.mitre };
        if (pl.tipo === "contato" && d > tolC && cfg.parcial && cfg.parcial(G)) {        /* peça só-tração presa por chapa: contato parcial vira AVISO, nunca esconde interpenetração */
          reg.parcial = true; cont.push(reg); avisos.push({ regra: "contato_parcial", a: G.id, b: H.id, texto: "contato parcial " + G.id + " × " + H.id + " (" + rd(d * 1000, 1) + " mm em parte da face; peça só-tração presa por chapa)" }); return;
        }
        if (pl.tipo === "contato") { cont.push(reg); if (d > tolC) achados.push({ regra: "contato_faltando", a: G.id, b: H.id, texto: "contato previsto " + G.id + " × " + H.id + " com folga de " + rd(d * 1000, 2) + " mm (> 1 mm)" }); }
        else { fol.push(reg); if (d < fMin || d > fMax) achados.push({ regra: "folga_fora", a: G.id, b: H.id, texto: "folga construtiva " + G.id + " × " + H.id + " = " + rd(d * 1000, 2) + " mm (previsto " + rd((pl.folga || 0) * 1000, 0) + " mm; aceita " + rd(fMin * 1000, 1) + " a " + rd(fMax * 1000, 1) + " mm)" }); }
      });
    });
    /* 2b. apoios declarados (a peça repousa na outra sem corte: terça sobre o banzo, tesoura sobre o frechal, frechal sobre o pilar, espigão sobre a sela) */
    var apo = [];
    (cfg.apoios ? cfg.apoios(pecas) : []).forEach(function (x) {
      if (!x.b) { apo.push({ a: x.a.id, b: null, motivo: x.motivo, distancia_mm: 1e6 }); achados.push({ regra: "contato_faltando", a: x.a.id, b: null, texto: "apoio previsto sem peça: " + x.motivo }); return; }
      var g = folgaPecas(x.a, x.b); apo.push({ a: x.a.id, b: x.b.id, motivo: x.motivo, distancia_mm: g === Infinity ? 1e6 : rd(g * 1000, 3) });
      if (g > tolC) achados.push({ regra: "contato_faltando", a: x.a.id, b: x.b.id, texto: "apoio previsto (" + x.motivo + ") " + x.a.id + " sobre " + x.b.id + " com folga de " + (g === Infinity ? "> 500" : rd(g * 1000, 2)) + " mm (> 1 mm)" });
    });
    /* 3. ponta solta: cada ponta termina numa face de outra peça (contato ou folga) ou é declarada livre/apoio */
    var pontas = [];
    pecas.forEach(function (P) {
      for (e = 0; e < 2; e++) {
        var planos = P.fins[e].planos, livre = cfg.livre ? cfg.livre(P, e) : null, ok = false, razao = "";
        if (planos.length && planos.every(function (pl) { return pl.contra; })) { ok = true; razao = "termina na face de " + planos.map(function (pl) { return pl.contra; }).join(", "); }
        else if (livre) { ok = true; razao = livre; }
        else {
          /* ponta em esquadro no nó: ok se a face da ponta encosta (≤ 1 mm) em outra peça */
          var ext = extensaoAxial(P), sEnd = e === 0 ? ext[0] : ext[1], lamina = prismaPoli(add(P.p0, mul(P.ex, e === 0 ? sEnd : sEnd - 0.002)), P.ex, P.ey, P.ez, P.poli, 0, 0.002);
          for (k = 0; k < pecas.length; k++) { var O = pecas[k]; if (O === P || !O._box) continue; if (volInter(lamina, solidoDe(O), tolC + 1e-9) > 1e-10) { ok = true; razao = "encosta em " + O.id; break; } }
        }
        pontas.push({ peca: P.id, ponta: e, ok: ok, razao: razao });
        if (!ok) achados.push({ regra: "ponta_solta", a: P.id, b: null, texto: "ponta " + (e === 0 ? "inicial" : "final") + " de " + P.id + " não termina num nó nem na face de outra peça" });
      }
    });
    /* 4. nós: eixos concorrentes (ou excentricidade declarada) */
    var nos = nosDe(pecas, cfg);
    nos.forEach(function (N) { if (!N.ok) achados.push({ regra: "eixos_nao_concorrem", a: N.pecas.join(","), b: null, texto: "nó " + N.id + ": eixos de " + N.pecas.join(", ") + " passam a até " + rd(N.maxDesvio_mm, 1) + " mm do ponto do nó sem excentricidade declarada" }); });
    /* 5. cruzamentos não resolvidos (do resolvedor) */
    if (rel) rel.naoResolvidos.forEach(function (x) { if (!pen.some(function (q) { return q.a === x.a && q.b === x.b; })) achados.push({ regra: "interpenetracao", a: x.a, b: x.b, texto: "peças " + x.a + " e " + x.b + " se interpenetram sem corte possível (" + rd(x.volume_mm3, 1) + " mm³)" }); });
    var porRegra = {}; achados.forEach(function (a) { porRegra[a.regra] = (porRegra[a.regra] || 0) + 1; });
    return { ok: achados.length === 0, achados: achados, avisos: avisos, porRegra: porRegra, interpenetracoes: pen, contatos: cont, folgas: fol, apoios: apo, pontas: pontas, nos: nos, nPecas: pecas.length };
  }
  /** nós: pontos onde ≥ 2 peças se encontram (pontas e nós internos de cada peça, a 2 mm). Distância do ponto ao eixo FÍSICO de cada peça. */
  function nosDe(pecas, cfg) {
    var mapa = {}, lista = [], idc = 0;
    function chave(P) { return Math.round(P[0] * 250) + "," + Math.round(P[1] * 250) + "," + Math.round(P[2] * 250); }
    function ponto(P, peca) { var k = chave(P), N = mapa[k]; if (!N) { N = mapa[k] = { id: "N" + (++idc), p: P, pecas: [], eix: [] }; lista.push(N); } if (N.pecas.indexOf(peca.id) < 0) { N.pecas.push(peca.id); N.eix.push(peca); } }
    pecas.forEach(function (P) { var c0 = P.noCalc0 || P.p0, c1 = P.noCalc1 || P.p1; ponto(c0, P); ponto(c1, P); (P.nosCalc || []).forEach(function (Q) { ponto(Q, P); }); });
    var out = [];
    lista.forEach(function (N) {
      if (N.pecas.length < 2) return;
      var mx = 0, dados = [];
      N.eix.forEach(function (P) {
        var ref = P.noCalc ? null : null, Q = N.p, e = P.excent || 0;       /* distância do nó de CÁLCULO ao eixo físico da peça = excentricidade real */
        var t = dot(sub(Q, P.p0), P.ex), foot = add(P.p0, mul(P.ex, t)), d = dist(Q, foot);
        dados.push({ peca: P.id, desvio_mm: rd(d * 1000, 1), declarada_mm: rd(e * 1000, 1) });
        var excesso = Math.max(0, d - e - 0.001); if (excesso * 1000 > mx) mx = excesso * 1000;
      });
      out.push({ id: N.id, ponto: N.p.map(function (v) { return rd(v, 3); }), pecas: N.pecas, desvios: dados, maxDesvio_mm: mx, ok: mx <= 1, excentrico: dados.some(function (x) { return x.desvio_mm > 1; }) });
    });
    return out;
  }

  /* ------------------------------------------------------------ FICHA DE CORTE e LISTA DE CORTE */
  /** comprimento do eixo, bruto (ponta longa a ponta longa) e de cada face lateral (topo, fundo, lado +z, lado −z) */
  function medidasPeca(P) {
    var S = solidoDe(P); if (!S) return null; var ext = extensaoAxial(P), bruto = ext[1] - ext[0], i, j, F;
    var faces = { topo: null, fundo: null, ladoA: null, ladoB: null }, alvo = { topo: P.ey, fundo: mul(P.ey, -1), ladoA: P.ez, ladoB: mul(P.ez, -1) };
    prep(S);
    Object.keys(alvo).forEach(function (k) {
      var melhor = null; S.f.forEach(function (F2) { if (dot(F2.n, alvo[k]) > 0.999 && (!melhor || F2.a > melhor.a)) melhor = F2; });
      if (melhor) { var mn = Infinity, mx = -Infinity; melhor.p.forEach(function (Q) { var s = sDe(P, Q); if (s < mn) mn = s; if (s > mx) mx = s; }); faces[k] = rd(mx - mn, 4); }
    });
    return { eixo: rd(P.L, 4), bruto: rd(bruto, 4), faces: faces, s0: ext[0], s1: ext[1] };
  }
  function fichaPeca(P) {
    var med = medidasPeca(P), pontas = [0, 1].map(function (e) {
      var pl = P.fins[e].planos, ang = pl.map(function (p) { var a = angulosPlano(P, e, p); return { planta: rd(a.planta, 2), elevacao: rd(a.elevacao, 2), bisel: rd(a.bisel, 2), contra: p.contra || null, tipo: p.tipo || null, folga_mm: rd((p.folga || 0) * 1000, 1) }; });
      return { ponta: e, corte: tipoCorte(pl, P, e), planos: ang };
    });
    return { id: P.id, g: P.g, b: P.b, h: P.h, d: P.d || null, medidas: med, pontas: pontas, rebaixos: P.rebaixos.length };
  }
  function assinatura(f) {
    function p(x) { return x.planos.map(function (a) { return a.planta + "/" + a.elevacao + "/" + a.bisel; }).join("+") || "0"; }
    return [f.g, f.b, f.h, f.d, f.medidas.bruto, f.pontas[0].corte, p(f.pontas[0]), f.pontas[1].corte, p(f.pontas[1]), f.rebaixos].join("|");
  }
  /** lista de corte: agrupa peças iguais (mesma seção, mesmo comprimento bruto, mesmos ângulos nas duas pontas) */
  function listaCorte(pecas) {
    var g = {}, ord = [];
    pecas.forEach(function (P) {
      var f = fichaPeca(P); if (!f.medidas) return; var k = assinatura(f);
      if (!g[k]) { g[k] = { f: f, ids: [], qtd: 0 }; ord.push(k); } g[k].ids.push(P.id); g[k].qtd++;
    });
    return ord.map(function (k, i) {
      var x = g[k], f = x.f; return { marca: f.g + "-" + (i + 1), g: f.g, secao: f.d ? "Ø" + rd(f.d * 100, 1) : rd(f.b * 100, 1) + "×" + rd(f.h * 100, 1), bruto_mm: Math.round(f.medidas.bruto * 1000), eixo_mm: Math.round(f.medidas.eixo * 1000), faces_mm: f.medidas.faces, pontaA: f.pontas[0], pontaB: f.pontas[1], rebaixos: f.rebaixos, qtd: x.qtd, ids: x.ids };
    }).sort(function (a, b) { return a.g < b.g ? -1 : a.g > b.g ? 1 : b.bruto_mm - a.bruto_mm; });
  }

  /* ------------------------------------------------------------ FIXADORES (pino, parafuso, prego, chapa) como sólidos */
  /** cilindro de eixo `dir` com centro `c`, diâmetro d, comprimento L (n lados) */
  function cilindro(c, dir, d, L, n) {
    var u = Math.abs(dir[0]) < 0.9 ? un(cruz(dir, [1, 0, 0])) : un(cruz(dir, [0, 1, 0])), v = cruz(dir, u), poli = [], k = n || 10, t;
    for (t = 0; t < k; t++) poli.push([d / 2 * Math.cos(2 * Math.PI * t / k), d / 2 * Math.sin(2 * Math.PI * t / k)]);
    return prismaPoli(sub(c, mul(dir, L / 2)), dir, u, v, poli, 0, L);
  }
  function chapaPlana(c, ex, ey, ez, comp, alt, esp) { return prismaPoli(c, ex, ey, ez, [[-alt / 2, -esp / 2], [alt / 2, -esp / 2], [alt / 2, esp / 2], [-alt / 2, esp / 2]], -comp / 2, comp / 2); }

  var MadEncaixe = {
    FOLGA: FOLGA, TOL_VOL: TOL_VOL, TOL_PEN: TOL_PEN,
    v: { dot: dot, sub: sub, add: add, mul: mul, cruz: cruz, un: un, len: len, dist: dist, lerp: lerp, rd: rd, deg: deg },
    prismaPoli: prismaPoli, retPoli: retPoli, circPoli: circPoli, cortar: cortar, volume: volume, vertices: vertices, caixaDe: caixaDe, volInter: volInter, interSolido: interSolido, prep: prep,
    sat: sat, distancia: distancia, distFaceSolido: distFaceSolido, folgaPlano: folgaPlano, folgaPecas: folgaPecas, faceNoPlano: faceNoPlano, TOL_NUM: TOL_NUM, criarPeca: criarPeca, solidoDe: solidoDe, invalidar: invalidar, extensaoAxial: extensaoAxial, volumePeca: volumePeca, volInterPecas: volInterPecas, penetracao: penetracao,
    angulosPlano: angulosPlano, tipoCorte: tipoCorte, malhaPeca: malhaPeca, malhaDeSolido: malhaDeSolido, receitaPeca: receitaPeca, partesConvexas: partesConvexas,
    resolver: resolver, conferir: conferir, nosDe: nosDe, medidasPeca: medidasPeca, fichaPeca: fichaPeca, listaCorte: listaCorte, cilindro: cilindro, chapaPlana: chapaPlana, quadro: quadro, sDe: sDe
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MadEncaixe; else global.MadEncaixe = MadEncaixe;
})(typeof window !== "undefined" ? window : this);

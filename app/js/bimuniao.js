/* =====================================================================
 * bimuniao.js — UNIÃO DE PAREDES, motor PURO (09/10/2026).
 *
 * Pedido do Rogério (09/10/2026): "tem que ter a opção das paredes irem
 * UNINDO. Quando eu chegar de uma parede a outra, ela unir, e não ficar
 * aquela LINHA CORTANDO."
 *
 * O QUE ACONTECIA (diagnóstico de 09/10/2026, medido no navegador)
 *   · A GEOMETRIA do encontro já saía certa do BimArq.juntas (js/bimarq.js):
 *     L em topo / meia-esquadria / esquadrar, T, X e emenda colinear — os
 *     prismas encostam sem sobrepor e sem fresta, e o volume do canto conta
 *     uma vez (sala 5 × 4 de 15 cm: 2,163 + 1,68 + 2,10 + 1,617 = 7,56 m³ =
 *     (5,15 × 4,15 − 4,85 × 3,85) × 2,8).
 *   · A PLANTA (BIM.vista2d → tela, folha/PDF e DXF) cortava CADA prisma como
 *     um contorno à parte: no encontro a face de uma parede atravessava a
 *     ponta da outra — a LINHA CORTANDO — e as arestas de baixo da parede,
 *     vistas por dentro do corte (a malha cortada é oca), desenhavam a junta
 *     de novo em pena fina.
 *   · O L desenhado SEPARADO (a 2ª parede começando no canto da face da 1ª,
 *     não no eixo) não virava canto: as pontas dos eixos tinham de estar a
 *     3 cm. Virava um T e sobrava um DENTE no canto de fora.
 *   · O IFC não dizia quem está ligado a quem.
 *
 * O QUE ESTÁ AQUI (Node-testável: node tools/test-bimuniao.js)
 *   1) encontroL — a DETECÇÃO do canto pela proximidade: as duas pontas a
 *      menos de (meia espessura da OUTRA parede, medida ao longo do eixo) +
 *      1 cm do encontro dos eixos = canto em L. O BimArq.juntas pergunta
 *      ANTES do T (é o que fecha o dente).
 *   2) unirContornos — junta polígonos que se encostam num contorno só:
 *      cancela as arestas comuns (também as que só se sobrepõem em parte),
 *      emenda as colineares e devolve os furos (a sala fechada vira um ANEL).
 *   3) grupos — quem se une com quem NA PLANTA: as paredes ligadas por junta
 *      (L, T, X, emenda) e do MESMO tipo (e material de projeto). Tipo
 *      diferente = troca de material: a linha entre elas FICA (é desenho).
 *   4) unirCortes + limparLinhas (= planta) — o pós-processo da vista 2D.
 *   5) conexoes — os pares para o IfcRelConnectsPathElements (js/ifcsaida.js).
 *
 * REGRAS DE UNIÃO (as do BimArq.juntas, escritas aqui para quem orça)
 *   · L — TOPO (padrão): a parede criada ANTES passa até a face de fora da
 *     outra; a de depois para na face dela. Troca por canto: Modificar ›
 *     Juntas de parede (topo / meia-esquadria / esquadrar) e Alternar ordem
 *     de união; por parede: Propriedades › Canto em L.
 *   · T — a que CHEGA para na face da que recebe; a que recebe não é cortada.
 *     A ponta que chega pode parar até (meia espessura dela + 1 cm) antes da
 *     face: a união estica até lá.
 *   · X — a criada ANTES atravessa inteira; a criada DEPOIS ganha o vão —
 *     o volume do cruzamento é da que atravessa (conta UMA vez). Alternar
 *     ordem de união troca.
 *   · Emenda colinear (pontas a 3 cm): na planta a junta some só com o mesmo
 *     tipo e a mesma espessura.
 *   · Camadas (js/alvtipos.js): o 3D e a planta são o núcleo único; as
 *     camadas vivem no QUANTITATIVO (BimArq.camadasDe): o núcleo mede pelo
 *     eixo e o acabamento pela SUA face, que termina no canto de fora/de
 *     dentro (faceIni/faceFim) — reboco encontra reboco no canto, núcleo
 *     encontra núcleo, com tipos iguais ou diferentes; no T e no X o trecho
 *     da face coberto pela outra parede (abut) não leva acabamento.
 *   · Desunir: "Unir" desligado na barra da ferramenta Parede (a parede
 *     NOVA nasce sem unir; lembrado por usuário), "Unir nos cantos" = Não
 *     nas Propriedades da parede, ou Modificar › Desunir geometria no par.
 *   · A união é DERIVADA: nada aqui é gravado. Mover/esticar uma parede
 *     refaz o replay, e o BimArq.derivar recalcula as juntas das vizinhas.
 *
 * MEDIÇÃO (não mudou — a do js/bimparam.js e do orçamento):
 *   volume = soma dos prismas que o 3D desenha; área = volume ÷ espessura;
 *   comprimento = eixo líquido entre os cortes das pontas; faces = até o
 *   canto de fora/de dentro. Sala fechada: Σ volumes = (área do contorno de
 *   fora − área do de dentro) × altura — o tools/test-bimuniao.js confere à
 *   mão, com o controle negativo (sem a união, o canto conta duas vezes).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL_UNIAO = 0.01;     /* 1 cm além da meia espessura: a ponta "chegou" na outra parede */
  var TOL_PLANTA = 0.001;   /* 1 mm: vértices iguais e "na borda" no desenho (malha em float32) */
  var TOL_ARCO = 0.003;     /* a corda do arco (2 mm do js/bimcurva.js) + 1 mm */

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function areaSinal(P) {
    var s = 0;
    for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function dentroPar(p, P) {   /* par/ímpar, sem tratar a borda (quem chama mede a borda à parte) */
    var x = p[0], y = p[1], d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }

  /* ================================================================ 1) DETECÇÃO
   * A ponta `a` (ponto E, direção de SAÍDA d — do corpo para a ponta) e a
   * ponta `b` de outra parede: o encontro dos EIXOS (X) está a menos de
   * (t da outra / 2) / sen θ + tol de cada ponta? Então é canto em L, mesmo
   * que as pontas desenhadas não se toquem (a 2ª começou no canto da face).
   * Abaixo de ~10° não é canto (a ponta iria longe): devolve null. */
  function encontroL(A, B, o) {
    var tol = o && fin(o.tol) ? o.tol : TOL_UNIAO;
    if (!A || !B || !A.E || !B.E || !A.d || !B.d) return null;
    var cr = A.d[0] * B.d[1] - A.d[1] * B.d[0], s = Math.abs(cr);
    if (!(s >= 0.17)) return null;
    /* E_A + λ·d_A = E_B + μ·d_B */
    var rx = B.E[0] - A.E[0], ry = B.E[1] - A.E[1];
    var lam = (rx * B.d[1] - ry * B.d[0]) / cr, mu = (rx * A.d[1] - ry * A.d[0]) / cr;
    var limA = num(B.t, 0) / 2 / s + tol, limB = num(A.t, 0) / 2 / s + tol;
    if (Math.abs(lam) > limA || Math.abs(mu) > limB) return null;
    return { X: [A.E[0] + lam * A.d[0], A.E[1] + lam * A.d[1]], lamA: lam, lamB: mu };
  }
  /* o T: quanto a ponta pode ficar ANTES da face da que recebe (meia espessura dela + 1 cm; nunca menos que os 3 cm de sempre) */
  function folgaT(tChega, tolBase) { return Math.max(num(tolBase, 0.03), num(tChega, 0) / 2 + TOL_UNIAO); }

  /* ================================================================ 2) CONTORNOS
   * lista: [{ pts: [[x,y]…], arcos? }] — polígonos simples que se ENCOSTAM
   * (não se sobrepõem: é o que as juntas garantem). Devolve os laços do
   * contorno unido: [{ pts, arcos?, area (com sinal: > 0 = contorno, < 0 =
   * furo), de: [índices da lista] }]. `arcos` (o do js/bimcurva.js
   * cortePlanta) atravessa a união quando o arco fica inteiro. */
  function unirContornos(lista, o) {
    var tol = o && o.tol > 0 ? o.tol : TOL_PLANTA;
    /* a corda de um ARCO fica até 2 mm (js/bimcurva.js TOL_CORDA) dentro do arco: a ponta da reta que
       encosta na parede curva está NO arco, a até 2 mm da corda — a corda se parte ali (o arco partido
       vira cordas, de 2 mm) */
    var tolArco = o && o.tolArco > 0 ? o.tolArco : TOL_ARCO;
    var V = [], grade = {};
    function vid(p) {
      var ix = Math.round(p[0] / tol), iy = Math.round(p[1] / tol);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var l = grade[(ix + dx) + "," + (iy + dy)]; if (!l) continue;
        for (var k = 0; k < l.length; k++) { var q = V[l[k]]; if (Math.abs(q[0] - p[0]) <= tol && Math.abs(q[1] - p[1]) <= tol) return l[k]; }
      }
      V.push([p[0], p[1]]); var ch = ix + "," + iy; (grade[ch] = grade[ch] || []).push(V.length - 1);
      return V.length - 1;
    }
    /* as arestas orientadas (área > 0: o miolo fica à ESQUERDA de cada aresta) */
    var E = [];
    arr(lista).forEach(function (c, pi) {
      var pts = arr(c && c.pts).filter(function (q) { return q && fin(q[0]) && fin(q[1]); });
      if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-12 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-12) pts = pts.slice(0, -1);
      var N = pts.length; if (N < 3) return;
      var tags = [], arcos = c.arcos || null, k, j;
      for (k = 0; k < N; k++) tags[k] = null;
      /* a marca do arco é o CÍRCULO (raio e sentido): a corda partida continua do mesmo arco */
      if (arcos) for (k = 0; k < N; k++) { var a = arcos[k]; if (a && a.n > 0 && a.r > 0) for (j = 0; j < a.n; j++) tags[(k + j) % N] = { r: a.r, horario: !!a.horario }; }
      var ids = pts.map(vid), inv = areaSinal(pts) < 0;
      for (k = 0; k < N; k++) {
        var u = ids[k], v = ids[(k + 1) % N], t = tags[k];
        if (u === v) continue;
        if (inv) { var tr = u; u = v; v = tr; if (t) t = { r: t.r, horario: !t.horario }; }
        E.push({ u: u, v: v, tag: t, p: pi });
      }
    });
    /* parte cada aresta nos vértices que caem DENTRO dela (o fim de uma parede na face da outra) */
    var E2 = [];
    E.forEach(function (e) {
      var a = V[e.u], b = V[e.v], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, cortes = [], lim = e.tag ? tolArco : tol;
      var x0 = Math.min(a[0], b[0]) - lim, x1 = Math.max(a[0], b[0]) + lim, y0 = Math.min(a[1], b[1]) - lim, y1 = Math.max(a[1], b[1]) + lim;
      for (var w = 0; w < V.length; w++) {
        if (w === e.u || w === e.v) continue;
        var p = V[w]; if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
        var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
        if (!(t > 0 && t < 1) || distSeg(p, a, b) > lim) continue;
        cortes.push({ t: t, w: w });
      }
      if (!cortes.length) { E2.push(e); return; }
      cortes.sort(function (x, y) { return x.t - y.t; });
      var ini = e.u;
      cortes.forEach(function (c) { if (c.w !== ini) E2.push({ u: ini, v: c.w, tag: e.tag, p: e.p }); ini = c.w; });
      if (ini !== e.v) E2.push({ u: ini, v: e.v, tag: e.tag, p: e.p });   /* o pedaço da corda continua no arco */
    });
    /* as arestas COMUNS (uma em cada sentido) se cancelam: é a linha que cortava o encontro */
    var abertas = {};
    E2.forEach(function (e, i) {
      var rv = abertas[e.v + ">" + e.u];
      if (rv && rv.length) { E2[rv.pop()].morta = true; e.morta = true; return; }
      (abertas[e.u + ">" + e.v] = abertas[e.u + ">" + e.v] || []).push(i);
    });
    var vivas = E2.filter(function (e) { return !e.morta; }), saem = {};
    vivas.forEach(function (e, i) { (saem[e.u] = saem[e.u] || []).push(i); });
    /* encadeia: no vértice com mais de uma saída, a curva mais à ESQUERDA (o mesmo miolo) */
    var usada = [], lacos = [], quebrou = false;
    for (var i0 = 0; i0 < vivas.length; i0++) {
      if (usada[i0]) continue;
      var laco = [i0], cur = i0; usada[i0] = true;
      for (var guarda = 0; guarda <= vivas.length; guarda++) {
        var ev = vivas[cur], vtx = ev.v;
        if (vtx === vivas[i0].u) break;
        var cand = (saem[vtx] || []).filter(function (x) { return !usada[x]; });
        if (!cand.length) { quebrou = true; break; }
        var din = [V[ev.v][0] - V[ev.u][0], V[ev.v][1] - V[ev.u][1]], melhor = cand[0], mAng = -Infinity;
        cand.forEach(function (x) {
          var q = vivas[x], dout = [V[q.v][0] - V[q.u][0], V[q.v][1] - V[q.u][1]];
          var ang = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
          if (ang > mAng) { mAng = ang; melhor = x; }
        });
        usada[melhor] = true; laco.push(melhor); cur = melhor;
      }
      lacos.push(laco);
    }
    var out = [];
    lacos.forEach(function (laco) {
      var P = laco.map(function (x) { return V[vivas[x].u].slice(); }), T = laco.map(function (x) { return vivas[x].tag; }), de = {};
      laco.forEach(function (x) { de[vivas[x].p] = 1; });
      /* tira os vértices no meio de uma reta (as emendas) — nunca dentro de um arco */
      var mudou = true;
      while (mudou && P.length > 3) {
        mudou = false;
        for (var k = 0; k < P.length && P.length > 3; k++) {
          var ia = (k - 1 + P.length) % P.length, ic = (k + 1) % P.length;
          if (T[ia] || T[k]) continue;
          var a = P[ia], b = P[k], c = P[ic];
          if (distSeg(b, a, c) <= tol / 2 || (Math.abs(a[0] - c[0]) <= tol && Math.abs(a[1] - c[1]) <= tol)) { P.splice(k, 1); T.splice(k, 1); mudou = true; k--; }
        }
      }
      if (P.length < 3) return;
      var Ar = areaSinal(P); if (Math.abs(Ar) < tol * tol) return;
      /* as cordas seguidas do mesmo círculo voltam a ser UM arco (o comando A do SVG, de
         js/desenho2d.js caminho): do 1º ponto da sequência, n cordas; "grande" pelo ângulo varrido.
         O laço começa fora de um arco (o caminho não atravessa o ponto 0 no meio de um) */
      var n = P.length, rot = -1;
      function ch(t) { return t ? Math.round(t.r * 1e6) + (t.horario ? "h" : "a") : null; }
      for (var s = 0; s < n; s++) { var kp = ch(T[(s - 1 + n) % n]), ks = ch(T[s]); if (ks == null || kp !== ks) { rot = s; break; } }
      var arcos = [], temArco = false;
      if (rot >= 0) {
        if (rot) { P = P.slice(rot).concat(P.slice(0, rot)); T = T.slice(rot).concat(T.slice(0, rot)); }
        for (var q = 0; q < n; q++) arcos[q] = null;
        for (q = 0; q < n;) {
          var kq = ch(T[q]); if (kq == null) { q++; continue; }
          var m = 1; while (q + m < n && ch(T[q + m]) === kq) m++;
          var ang = 0; for (var z = 0; z < m; z++) { var pa = P[q + z], pb = P[(q + z + 1) % n], cd = Math.sqrt((pb[0] - pa[0]) * (pb[0] - pa[0]) + (pb[1] - pa[1]) * (pb[1] - pa[1])); ang += 2 * Math.asin(Math.min(1, cd / (2 * T[q].r))); }
          arcos[q] = { r: T[q].r, grande: ang > Math.PI + 1e-9, horario: T[q].horario, n: m }; temArco = true;
          q += m;
        }
      }
      var r = { pts: P, area: Ar, de: Object.keys(de).map(Number).sort(function (x, y) { return x - y; }) };
      if (temArco) r.arcos = arcos;
      out.push(r);
    });
    if (quebrou) out.quebrou = true;
    return out;
  }
  function areaContornos(lacos) { return arr(lacos).reduce(function (s, l) { return s + areaSinal(l.pts || l); }, 0); }
  function perimetroDe(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }

  /* ================================================================ 3) GRUPOS
   * A ASSINATURA de desenho de uma parede: o tipo (a foto do js/alvtipos.js)
   * — sem tipo, "genérica". Duas paredes ligadas por junta só se juntam no
   * desenho com a MESMA assinatura (tipo diferente = troca de material: a
   * linha fica). Na emenda colinear, também a mesma espessura. */
  function assinatura(c) { return c && c.tipoParede && c.tipoParede.id ? "tipo:" + c.tipoParede.id : "generica"; }
  function grupos(paredes, o) {
    var chave = o && typeof o.chave === "function" ? o.chave : assinatura;
    var pai = {}, por = {}, ch = {};
    arr(paredes).forEach(function (c) { if (c && c.id != null) { var k = String(c.id); pai[k] = k; por[k] = c; ch[k] = chave(c); } });
    function raiz(k) { while (pai[k] !== k) { pai[k] = pai[pai[k]]; k = pai[k]; } return k; }
    function une(a, b) { var ra = raiz(a), rb = raiz(b); if (ra === rb) return; if (ra < rb) pai[rb] = ra; else pai[ra] = rb; }
    Object.keys(por).forEach(function (k) {
      arr(por[k].juntas).forEach(function (j) {
        var o2 = j && j.com != null ? String(j.com) : null;
        if (o2 == null || !por[o2] || ch[k] !== ch[o2]) return;
        if (j.tipo === "I" && Math.abs(num(por[k].espessura, 0) - num(por[o2].espessura, 0)) > 5e-4) return;
        une(k, o2);
      });
    });
    var out = {}; Object.keys(por).forEach(function (k) { out[k] = raiz(k); });
    return out;
  }

  /* ================================================================ 4) PLANTA
   * cortes: os contornos da vista 2D (js/bim.js vista2d); grupoDe(corte) → a
   * chave do grupo (null = não une). Os do mesmo grupo viram os laços do
   * contorno unido; cada laço leva as marcas (t, u, ifc, fase…) do 1º. Se a
   * união não fechar a conta (área diferente da soma, laço quebrado), o
   * grupo fica como veio — o desenho nunca perde peça. */
  function unirCortes(cortes, grupoDe, o) {
    var tol = o && o.tol > 0 ? o.tol : TOL_PLANTA, por = {}, seq = [], unidos = 0, regioes = {};
    arr(cortes).forEach(function (c) {
      var g = c && c.fechado && arr(c.pts).length >= 3 ? grupoDe(c) : null;
      if (g == null) { seq.push({ c: c }); return; }
      if (!por[g]) { por[g] = []; seq.push({ g: g }); }
      por[g].push(c);
    });
    var out = [];
    seq.forEach(function (s) {
      if (!s.g) { out.push(s.c); return; }
      var L = por[s.g];
      if (L.length < 2) { out.push(L[0]); regioes[s.g] = [L[0].pts]; return; }
      var lacos = unirContornos(L, { tol: tol }), soma = 0, per = 0;
      L.forEach(function (c) { soma += Math.abs(areaSinal(c.pts)); per += perimetroDe(c.pts); });
      var ok = !lacos.quebrou && lacos.length && Math.abs(areaContornos(lacos) - soma) <= Math.max(1e-6, tol * per);
      if (!ok) { L.forEach(function (c) { out.push(c); }); regioes[s.g] = L.map(function (c) { return c.pts; }); return; }
      var base = L[0];
      lacos.forEach(function (l) {
        var n = {}; Object.keys(base).forEach(function (k) { if (k !== "pts" && k !== "arcos" && k !== "fechado") n[k] = base[k]; });
        n.pts = l.pts; n.fechado = true; if (l.arcos) n.arcos = l.arcos;
        n.unidos = L.length;
        out.push(n);
      });
      regioes[s.g] = lacos.map(function (l) { return l.pts; });
      unidos += L.length - 1;
    });
    return { cortes: out, regioes: Object.keys(regioes).map(function (k) { return regioes[k]; }), unidos: unidos };
  }
  /* as arestas VISTAS por dentro do corte de uma parede (a malha cortada é
     oca: a junta de baixo aparecia) saem; o que encosta na borda fica (é o
     mesmo traço do contorno). linhas: [[x1,y1,x2,y2]…]; regioes: [[laço…]…]
     (par/ímpar por região). Devolve { linhas, idx } (idx = de qual linha
     veio cada pedaço, para os vizinhos linhasIfc/linhasUd). */
  function limparLinhas(linhas, regioes, o) {
    var tol = o && o.tol > 0 ? o.tol : TOL_PLANTA;
    var R = arr(regioes).map(function (lacos) {
      var b = [Infinity, Infinity, -Infinity, -Infinity], ar = [];
      arr(lacos).forEach(function (P) { P.forEach(function (q, i) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); ar.push([q, P[(i + 1) % P.length]]); }); });
      return { lacos: lacos, caixa: b, arestas: ar };
    }).filter(function (r) { return r.arestas.length; });
    function escondido(p, rs) {
      return rs.some(function (r) {
        var dn = false; r.lacos.forEach(function (P) { if (dentroPar(p, P)) dn = !dn; });
        if (!dn) return false;
        for (var i = 0; i < r.arestas.length; i++) if (distSeg(p, r.arestas[i][0], r.arestas[i][1]) <= tol) return false;
        return true;
      });
    }
    var out = [], idx = [];
    arr(linhas).forEach(function (l, li) {
      var a = [l[0], l[1]], b = [l[2], l[3]];
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      var rs = R.filter(function (r) { return !(x1 < r.caixa[0] - tol || x0 > r.caixa[2] + tol || y1 < r.caixa[1] - tol || y0 > r.caixa[3] + tol); });
      if (!rs.length) { out.push(l); idx.push(li); return; }
      var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (L2 < tol * tol) { if (!escondido([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], rs)) { out.push(l); idx.push(li); } return; }
      var ts = [0, 1];
      rs.forEach(function (r) {
        r.arestas.forEach(function (e) {
          [e[0], e[1]].forEach(function (q) { if (distSeg(q, a, b) <= tol) { var t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2; if (t > 0 && t < 1) ts.push(t); } });
          var ex = e[1][0] - e[0][0], ey = e[1][1] - e[0][1], den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-15) return;
          var t2 = ((e[0][0] - a[0]) * ey - (e[0][1] - a[1]) * ex) / den, s2 = ((e[0][0] - a[0]) * dy - (e[0][1] - a[1]) * dx) / den;
          if (t2 > 0 && t2 < 1 && s2 >= 0 && s2 <= 1) ts.push(t2);
        });
      });
      ts.sort(function (x, y) { return x - y; });
      var ini = null, fim = null, pedacos = [];
      for (var k = 0; k + 1 < ts.length; k++) {
        var ta = ts[k], tb = ts[k + 1]; if (tb - ta < 1e-12) continue;
        var tm = (ta + tb) / 2, vis = !escondido([a[0] + dx * tm, a[1] + dy * tm], rs);
        if (vis) { if (ini == null) ini = ta; fim = tb; }
        else if (ini != null) { pedacos.push([ini, fim]); ini = null; }
      }
      if (ini != null) pedacos.push([ini, fim]);
      if (pedacos.length === 1 && pedacos[0][0] === 0 && pedacos[0][1] === 1) { out.push(l); idx.push(li); return; }
      pedacos.forEach(function (pq) {
        if ((pq[1] - pq[0]) * Math.sqrt(L2) < tol) return;
        out.push([a[0] + dx * pq[0], a[1] + dy * pq[0], a[0] + dx * pq[1], a[1] + dy * pq[1]]); idx.push(li);
      });
    });
    return { linhas: out, idx: idx };
  }
  /* o pós-processo inteiro da vista 2D: os cortes de parede (marcados com
     `_pid` = id da parede) unidos por grupo, e as linhas vistas por dentro
     deles fora. o.chave(parede) = a assinatura (com o material do projeto). */
  function planta(dados, estado, o) {
    o = o || {};
    var paredes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; });
    if (!paredes.length || !dados) return { unidos: 0, linhasFora: 0 };
    var G = grupos(paredes, o);
    var r = unirCortes(dados.cortes, function (c) {
      if (c._pid == null) return null;
      var g = G[String(c._pid)]; if (g == null) return null;
      return g + "|" + (c.fase || "");
    }, o);
    dados.cortes = r.cortes;
    var n0 = arr(dados.linhas).length, lp = limparLinhas(dados.linhas, r.regioes, o);
    dados.linhas = lp.linhas;
    (o.vizinhas || []).forEach(function (nome) { var v = dados[nome]; if (Array.isArray(v)) dados[nome] = lp.idx.map(function (i) { return v[i]; }); });
    return { unidos: r.unidos, linhasFora: n0 - lp.idx.length };
  }

  /* ================================================================ 5) IFC
   * Os pares unidos → IfcRelConnectsPathElements: RelatingElement = a que
   * PASSA (L em topo), a que RECEBE (T) ou a primeira criada (X); o lado de
   * cada uma: ATSTART/ATEND (a ponta do eixo junto do encontro) ou ATPATH
   * (no meio: a que recebe o T, as duas do X). */
  function pontas(c) {
    var L = num(c.comprimento, 0) / 2, r = num(c.rotY, 0), co = Math.cos(r), si = Math.sin(r), x = num(c.cx, 0), z = num(c.cz, 0);
    return [[x - L * co, z + L * si], [x + L * co, z - L * si]];
  }
  function onde(c, outro, tipo) {
    if (tipo === "X") return "ATPATH";
    var P = pontas(c), Q = pontas(outro), lim = num(outro.espessura, 0) / 2 + num(c.espessura, 0) / 2 + 0.05;
    var d0 = distSeg(P[0], Q[0], Q[1]), d1 = distSeg(P[1], Q[0], Q[1]);
    if (Math.min(d0, d1) > lim) return "ATPATH";
    return d0 <= d1 ? "ATSTART" : "ATEND";
  }
  function conexoes(paredes) {
    var por = {}, vistos = {}, out = [];
    arr(paredes).forEach(function (c) { if (c && c.id != null) por[String(c.id)] = c; });
    arr(paredes).forEach(function (c) {
      if (!c) return;
      arr(c.juntas).forEach(function (j) {
        var o = j && j.com != null ? por[String(j.com)] : null; if (!o) return;
        var k = [String(c.id), String(o.id)].sort().join("|"); if (vistos[k]) return; vistos[k] = 1;
        var a = c, b = o;
        if (j.tipo === "L" && j.passa === false) { a = o; b = c; }
        var ta = onde(a, b, j.tipo), tb = onde(b, a, j.tipo);
        if (j.tipo === "T" && ta !== "ATPATH" && tb === "ATPATH") { var tr = a; a = b; b = tr; var tt = ta; ta = tb; tb = tt; }
        out.push({ a: a.id, b: b.id, tipo: j.tipo, modo: j.modo || null, ondeA: ta, ondeB: tb });
      });
    });
    return out;
  }

  var BimUniao = {
    TOL_UNIAO: TOL_UNIAO, TOL_PLANTA: TOL_PLANTA, TOL_ARCO: TOL_ARCO,
    encontroL: encontroL, folgaT: folgaT,
    unirContornos: unirContornos, areaContornos: areaContornos,
    assinatura: assinatura, grupos: grupos,
    unirCortes: unirCortes, limparLinhas: limparLinhas, planta: planta,
    pontas: pontas, conexoes: conexoes
  };
  global.BimUniao = BimUniao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimUniao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

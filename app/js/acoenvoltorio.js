/* =====================================================================
 * acoenvoltorio.js — O QUE O SISTEMA ENTENDE DA ESTRUTURA DESENHADA:
 * níveis, pilares, vigas, bases, contraventamentos, os EIXOS e as FACES do
 * envoltório (com o fechamento de cada uma) — motor PURO, ES5, sem DOM,
 * Node-testável. 14/10/2026 (frente S5, Metálica).
 *
 * Pedido do Rogério (14/10/2026): "uma vez que a estrutura estiver
 * MODELADA, se eu for calcular, ele já vai entender a geometria e eu não
 * vou precisar preencher nada. Ele vai ter os lados da geometria, ali eu
 * coloco o que vai ser o fechamento (se vai ser aberto, etc.), e através
 * disso eu vou conseguir gerar os memoriais de cálculo, as pranchas e o
 * DWG."
 *
 *   ler(G, op)            G = AcoModeloLivre.montar(...) → envoltório:
 *                         { tipo: "retangular"|"poligonal"|"plano"|"pontual"
 *                         |"vazio", contorno [[x, z]…] (anti-horário),
 *                         faces [{ id, nome, eixo, orientacao, a, b, L,
 *                         normal, hBase, hTopo, pilares, membros, diagonais,
 *                         legado }], cobertura, niveis, eixos, contagem,
 *                         resumo [texto…] }
 *   eixos(G, eixosModelo) os eixos da planta: os do modelo (Grade de eixos)
 *                         quando passam pelos pilares; sem eles, os eixos
 *                         AUTOMÁTICOS pelas linhas de pilares (x → 1, 2, 3…;
 *                         z → A, B, C…, a mesma regra da Grade de eixos)
 *   FECHAMENTOS / fechamentoDe(id) / fechamentoPadrao()
 *   vento(env, fech, cfg) → { ok, faces (as 4 do motor de vento) } ou
 *                         { ok: false, naoVerificado: motivo } — o vento só
 *                         usa o motor da NBR 6123 (js/acovento.js) quando a
 *                         forma está nas tabelas dele (planta retangular com
 *                         os lados nos eixos x e z; faces com pilar na
 *                         linha); fora disso: "não verificado" com o motivo
 *   situacao(r, env, fech) depois do cálculo: aprovado / reprovado /
 *                         incompleto (verificação crítica não feita)
 *   contraventar(G, env, op) os X que faltam (planos verticais das faces sem
 *                         diagonal e o plano de cada nível) → linhas
 *   ligarSoltas(G, op)    a ponta solta → o ponto mais perto de outra peça
 *   cantosApoio(G, env, pecas)  as pontas que o "Apoiar os cantos" pode apoiar (vértice do contorno, sem peça passando)
 *
 * CONVENÇÕES: planta x (leste +) e z (sul +), Y para cima — as do modelador
 * (as elevações Norte/Sul/Leste/Oeste do js/bim2dui.js: norte = z mínimo).
 * As 4 faces do motor de vento (js/acovento.js): frente = z mín. (norte),
 * fundo = z máx. (sul), esquerda = x mín. (oeste), direita = x máx. (leste).
 * Nada inventado: o que a norma/o motor não cobre volta como "não
 * verificado: <motivo>", nunca como número.
 * Teste: node tools/test-aco-envoltorio.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Fch() { return dep("AcoFechamentos", "./acofechamentos.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); if (/^-0(\.0*)?$/.test(s)) s = s.slice(1); return s.replace("-", "−").replace(".", ","); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function hyp(x, z) { return Math.sqrt(x * x + z * z); }
  var TOL = 0.05;            /* 5 cm: pontos da planta "no mesmo lugar" */
  var TOL_FACE = 0.30;       /* 30 cm: pilar "na linha da face" (o mesmo do vento da estrutura desenhada) */

  /* ================================================================ EIXOS */
  function letra(k) { var s = ""; k = Math.max(0, k); do { s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26) - 1; } while (k >= 0); return s; }
  function agrupar(vals, tol) {
    var v = vals.slice().sort(function (a, b) { return a - b; }), g = [];
    v.forEach(function (x) { var u = g[g.length - 1]; if (u && x - u.max <= tol) { u.max = x; u.soma += x; u.n++; } else g.push({ min: x, max: x, soma: x, n: 1 }); });
    return g.map(function (q) { return r6(q.soma / q.n); });
  }
  function pilaresPlanta(G) {
    return arr(G.membros).filter(function (m) { return m.papelLivre === "pilar"; }).map(function (m) {
      var lo = m.a[1] <= m.b[1] ? m.a : m.b, hi = lo === m.a ? m.b : m.a;
      return { membro: m.id, peca: m.peca, nome: m.nome, x: lo[0], z: lo[2], base: lo[1], topo: hi[1], perfil: m.secao && m.secao.nome };
    });
  }
  /* eixos: [{ nome, dir: "x"|"z" (a coordenada constante), c (valor), x0, z0, x1, z1, auto }] */
  function eixos(G, eixosModelo) {
    var P = pilaresPlanta(G), out = [];
    if (!P.length) return out;
    var xs = agrupar(P.map(function (p) { return p.x; }), TOL), zs = agrupar(P.map(function (p) { return p.z; }), TOL);
    var xmn = Math.min.apply(null, P.map(function (p) { return p.x; })), xmx = Math.max.apply(null, P.map(function (p) { return p.x; }));
    var zmn = Math.min.apply(null, P.map(function (p) { return p.z; })), zmx = Math.max.apply(null, P.map(function (p) { return p.z; }));
    var ext = 1.0;
    /* os do modelo (Grade de eixos) — retos e paralelos a x ou a z */
    var mod = arr(eixosModelo).filter(function (e) { return e && !(e.arco && e.arco.m); }).map(function (e) {
      var dx = num(e.x1, 0) - num(e.x0, 0), dz = num(e.z1, 0) - num(e.z0, 0), L = hyp(dx, dz); if (!(L > 0.05)) return null;
      if (Math.abs(dx) / L < 0.01) return { nome: String(e.nome || ""), dir: "x", c: (num(e.x0, 0) + num(e.x1, 0)) / 2 };
      if (Math.abs(dz) / L < 0.01) return { nome: String(e.nome || ""), dir: "z", c: (num(e.z0, 0) + num(e.z1, 0)) / 2 };
      return null;
    }).filter(Boolean);
    function nomeDe(dir, c, k) { var e = mod.filter(function (q) { return q.dir === dir && Math.abs(q.c - c) <= 0.10 && q.nome; })[0]; return e ? { nome: e.nome, auto: false } : { nome: dir === "x" ? String(k + 1) : letra(k), auto: true }; }
    xs.forEach(function (x, k) { var n = nomeDe("x", x, k); out.push({ nome: n.nome, auto: n.auto, dir: "x", c: x, x0: x, z0: r6(zmn - ext), x1: x, z1: r6(zmx + ext) }); });
    zs.forEach(function (z, k) { var n = nomeDe("z", z, k); out.push({ nome: n.nome, auto: n.auto, dir: "z", c: z, x0: r6(xmn - ext), z0: z, x1: r6(xmx + ext), z1: z }); });
    /* nomes repetidos (eixo do modelo + automático): o automático ganha um apóstrofo */
    var vistos = {}; out.forEach(function (e) { var k = e.nome; while (vistos[k]) k += "'"; e.nome = k; vistos[k] = true; });
    return out;
  }
  /* a marca do pilar no cruzamento ("B-2"): letra (z) + número (x) */
  function marcaPilar(ex, x, z) {
    var ax = ex.filter(function (e) { return e.dir === "x" && Math.abs(e.c - x) <= TOL; })[0], az = ex.filter(function (e) { return e.dir === "z" && Math.abs(e.c - z) <= TOL; })[0];
    return (az ? az.nome : "?") + "-" + (ax ? ax.nome : "?");
  }

  /* ================================================================ PLANTA (grafo) */
  function grafoPlanta(G) {
    var V = [], E = {}, nos = {};
    arr(G.modelo && G.modelo.nos).forEach(function (n) { nos[n.id] = n; });
    function vert(x, z) { for (var i = 0; i < V.length; i++) if (Math.abs(V[i][0] - x) <= TOL && Math.abs(V[i][1] - z) <= TOL) return i; V.push([x, z]); return V.length - 1; }
    function aresta(i, j) { if (i === j) return; var k = i < j ? i + "|" + j : j + "|" + i; E[k] = [Math.min(i, j), Math.max(i, j)]; }
    arr(G.modelo && G.modelo.barras).forEach(function (b) { var a = nos[b.i], c = nos[b.j]; if (!a || !c) return; aresta(vert(a.x, a.z), vert(c.x, c.z)); });
    /* pilar isolado também é ponto da planta */
    pilaresPlanta(G).forEach(function (p) { vert(p.x, p.z); });
    var lista = Object.keys(E).map(function (k) { return E[k]; });
    /* cruzamentos sem nó (vigas de níveis diferentes, X de piso): viram vértice da planta */
    for (var it = 0; it < 3; it++) {
      var novas = [], mudou = false;
      lista.forEach(function (e) {
        var A = V[e[0]], B = V[e[1]], d = [B[0] - A[0], B[1] - A[1]], L = hyp(d[0], d[1]); if (!(L > 1e-9)) return;
        var cortes = [];
        V.forEach(function (P, k) { if (k === e[0] || k === e[1]) return; var t = ((P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1]) / (L * L); if (t <= 1e-6 || t >= 1 - 1e-6) return; var q = [A[0] + d[0] * t - P[0], A[1] + d[1] * t - P[1]]; if (hyp(q[0], q[1]) <= TOL) cortes.push({ t: t, k: k }); });
        lista.forEach(function (f) {
          if (f === e || f[0] === e[0] || f[0] === e[1] || f[1] === e[0] || f[1] === e[1]) return;
          var C = V[f[0]], D = V[f[1]], s = [D[0] - C[0], D[1] - C[1]], den = d[0] * s[1] - d[1] * s[0]; if (Math.abs(den) < 1e-12) return;
          var t = ((C[0] - A[0]) * s[1] - (C[1] - A[1]) * s[0]) / den, u = ((C[0] - A[0]) * d[1] - (C[1] - A[1]) * d[0]) / den;
          if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) cortes.push({ t: t, k: vert(A[0] + d[0] * t, A[1] + d[1] * t) });
        });
        if (!cortes.length) { novas.push(e); return; }
        mudou = true;
        cortes.sort(function (x, y) { return x.t - y.t; });
        var seq = [e[0]].concat(cortes.map(function (c) { return c.k; })).concat([e[1]]);
        for (var q = 0; q + 1 < seq.length; q++) if (seq[q] !== seq[q + 1]) novas.push([Math.min(seq[q], seq[q + 1]), Math.max(seq[q], seq[q + 1])]);
      });
      var dd = {}; lista = []; novas.forEach(function (e) { var k = e[0] + "|" + e[1]; if (!dd[k]) { dd[k] = true; lista.push(e); } });
      if (!mudou) break;
    }
    return { V: V, E: lista };
  }
  /* a face externa do grafo da planta: anda pela borda com o interior à esquerda (anti-horário) */
  function contornoExterno(gr) {
    var V = gr.V, adj = V.map(function () { return []; });
    gr.E.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    var usados = V.map(function (v, k) { return adj[k].length > 0; });
    var s = -1; V.forEach(function (v, k) { if (!usados[k]) return; if (s < 0 || v[0] < V[s][0] - 1e-9 || (Math.abs(v[0] - V[s][0]) <= 1e-9 && v[1] < V[s][1])) s = k; });
    if (s < 0) return [];
    function ang(a, b) { return Math.atan2(V[b][1] - V[a][1], V[b][0] - V[a][0]); }
    function prox(cur, voltaAng) {
      var best = null, bestA = Infinity;
      adj[cur].forEach(function (w) { var a = ang(cur, w), d = a - voltaAng; while (d <= 1e-9) d += 2 * Math.PI; if (d < bestA) { bestA = d; best = w; } });
      return best;
    }
    var out = [s], cur = s, volta = -Math.PI / 2, primeiro = null, guarda = 0;
    while (guarda++ < 4 * gr.E.length + 8) {
      var w = prox(cur, volta); if (w == null) break;
      if (primeiro == null) primeiro = w; else if (cur === s && w === primeiro) break;
      volta = ang(w, cur); cur = w; out.push(cur);
    }
    if (out.length > 1 && out[out.length - 1] === s) out.pop();
    return out.map(function (k) { return V[k].slice(); });
  }
  /* REVISÃO S5 C2 (14/10/2026): as faces são as do contorno dos PILARES — a parede fica na linha dos pilares; o que passa
     dela (beiral, marquise, balanço) não é face. Antes: o contorno das barras incluía o beiral e as faces ficavam na borda
     dele, sem pilar (com "aberta" o vento não chegava aos pilares — r9/r8 do revisor). Grafo dos pilares: vértice = pilar,
     aresta = o trecho reto entre dois pilares coberto pelas barras projetadas (sem outro pilar no meio). */
  function grafoPilares(gr, P) {
    var V = [], E = [];
    P.forEach(function (p) { if (!V.some(function (v) { return Math.abs(v[0] - p.x) <= TOL && Math.abs(v[1] - p.z) <= TOL; })) V.push([p.x, p.z]); });
    for (var i = 0; i < V.length; i++) for (var j = i + 1; j < V.length; j++) {
      var A = V[i], B = V[j], d = [B[0] - A[0], B[1] - A[1]], L = hyp(d[0], d[1]); if (!(L > TOL)) continue;
      var u = [d[0] / L, d[1] / L];
      function tN(q) { return (q[0] - A[0]) * u[0] + (q[1] - A[1]) * u[1]; }
      function dN(q) { var t = tN(q); return hyp(A[0] + u[0] * t - q[0], A[1] + u[1] * t - q[1]); }
      if (V.some(function (q, k) { if (k === i || k === j) return false; var t = tN(q); return t > TOL && t < L - TOL && dN(q) <= TOL; })) continue;
      var iv = [];
      gr.E.forEach(function (e) { var a = gr.V[e[0]], b = gr.V[e[1]]; if (dN(a) > TOL || dN(b) > TOL) return; var ta = tN(a), tb = tN(b); iv.push([Math.min(ta, tb), Math.max(ta, tb)]); });
      iv.sort(function (x, y) { return x[0] - y[0]; });
      var at = 0, ok = true;
      for (var k = 0; k < iv.length && at < L - TOL; k++) { if (iv[k][0] > at + TOL) { ok = false; break; } at = Math.max(at, iv[k][1]); }
      if (ok && at >= L - TOL) E.push([i, j]);
    }
    return { V: V, E: E };
  }
  function componentes(gr) {
    var pai = gr.V.map(function (v, k) { return k; });
    function raiz(k) { while (pai[k] !== k) { pai[k] = pai[pai[k]]; k = pai[k]; } return k; }
    gr.E.forEach(function (e) { var a = raiz(e[0]), b = raiz(e[1]); if (a !== b) pai[Math.max(a, b)] = Math.min(a, b); });
    var c = {}; gr.V.forEach(function (v, k) { c[raiz(k)] = true; }); return Object.keys(c).length;
  }
  function areaSinal(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* tira vértice repetido e colinear */
  function simplificar(P) {
    var Q = P.slice(), mudou = true;
    while (mudou && Q.length > 2) {
      mudou = false;
      for (var i = 0; i < Q.length; i++) {
        var a = Q[(i - 1 + Q.length) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
        var ab = [b[0] - a[0], b[1] - a[1]], bc = [c[0] - b[0], c[1] - b[1]], la = hyp(ab[0], ab[1]), lc = hyp(bc[0], bc[1]);
        if (la < TOL || lc < 1e-9) { Q.splice(i, 1); mudou = true; break; }
        var cr = (ab[0] * bc[1] - ab[1] * bc[0]) / (la * lc), dt = (ab[0] * bc[0] + ab[1] * bc[1]) / (la * lc);
        if (Math.abs(cr) < 0.01 && dt > 0) { Q.splice(i, 1); mudou = true; break; }
      }
    }
    return Q;
  }

  function dentroP(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  function distPoli(P, x, z) { var dm = Infinity; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0; dm = Math.min(dm, hyp(x - a[0] - t * dx, z - a[1] - t * dz)); } return dm; }
  /* ================================================================ ORIENTAÇÃO */
  var ROSA = ["leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste", "norte", "nordeste"];
  function orientacao(nx, nz) { var a = Math.atan2(nz, nx), k = Math.round(a / (Math.PI / 4)); return ROSA[((k % 8) + 8) % 8]; }
  var LEGADO = { norte: "frente", sul: "fundo", oeste: "esquerda", leste: "direita" };

  /* ================================================================ LER */
  function ler(G, op) {
    op = op || {};
    var env = { ok: true, tipo: "vazio", contorno: [], area: 0, faces: [], cobertura: null, niveis: [], eixos: [], contagem: {}, resumo: [], avisos: [] };
    if (!G || !G.modelo) { env.ok = false; env.motivo = "Sem modelo lido."; return env; }
    var membros = arr(G.membros), P = pilaresPlanta(G);
    /* contagem */
    var c = { pilares: P.length, vigas: 0, tercas: 0, diagonais: 0, diagVert: 0, diagHoriz: 0, diagInclinadas: 0, bases: arr(G.bases).length, basesEngastadas: arr(G.bases).filter(function (b) { return b.tipo === "engastada"; }).length,
              nos: arr(G.modelo.nos).length, barras: arr(G.modelo.barras).length, apoios: arr(G.modelo.apoios).length };
    membros.forEach(function (m) {
      if (m.papelLivre === "viga") c.vigas++; else if (m.papelLivre === "terca") c.tercas++;
      else if (m.papelLivre === "diagonal") { c.diagonais++; var dy = Math.abs(m.X[1]); if (dy < 0.2) c.diagHoriz++; else { var hz = hyp(m.X[0], m.X[2]); if (hz > 1e-6) c.diagVert++; else c.diagInclinadas++; } }
    });
    env.contagem = c;
    /* níveis: cotas das vigas horizontais (até ~11°), agrupadas a 60 cm (as do "Um piso por nível") */
    var hz = membros.filter(function (m) { return (m.papelLivre === "viga" || m.papelLivre === "terca") && Math.abs(m.X[1]) < 0.2; });
    var niv = [];
    hz.forEach(function (m) { var y = (m.a[1] + m.b[1]) / 2, nv = niv.filter(function (q) { return Math.abs(q.cota - y) <= 0.6; })[0]; if (!nv) { nv = { cota: y, vigas: [] }; niv.push(nv); } nv.vigas.push(m.peca); nv.cota = Math.max(nv.cota, y); });
    niv.sort(function (a, b) { return a.cota - b.cota; });
    /* a COTA do nível é a do topo do aço (TOS): o topo dos pilares que chegam nele — a linha de cálculo da viga pode ser o
       eixo do perfil (a ligação desenhada passa a linha do topo ao eixo); sem pilar no nível, a linha das vigas */
    env.niveis = niv.map(function (n, k) {
      var pt = P.filter(function (p) { return Math.abs(p.topo - n.cota) <= 0.6 && p.topo >= n.cota - 1e-6; }).map(function (p) { return p.topo; });
      var tos = pt.length ? Math.max.apply(null, pt) : n.cota;
      return { id: "nivel" + (k + 1), cota: r6(tos), cotaLinha: r6(n.cota), nome: "Nível " + br(tos, 2) + " m", vigas: n.vigas };
    });
    /* REVISÃO S5 A5: longarina de escada não é viga de cobertura */
    var papelDe = {}; arr(G.pecas).forEach(function (p) { if (p) papelDe[String(p.id)] = String(p.papelBim || ""); });
    var inclinadas = membros.filter(function (m) { return (m.papelLivre === "viga" || m.papelLivre === "terca") && Math.abs(m.X[1]) >= 0.2 && !/longarin|escad|degrau|rampa/i.test(papelDe[String(m.peca)] || ""); });
    /* eixos */
    env.eixos = eixos(G, op.eixos);
    /* contorno */
    var gr = grafoPlanta(G), ct = contornoExterno(gr), area = ct.length >= 3 ? areaSinal(ct) : 0;
    if (area < 0) { ct.reverse(); area = -area; }
    ct = simplificar(ct);
    area = ct.length >= 3 ? Math.abs(areaSinal(ct)) : 0;
    /* REVISÃO S5 A3: estruturas SEPARADAS na planta (dois blocos) — o vento de uma e a proteção de uma pela outra não são
       da NBR 6123 do motor; o envoltório lia um bloco e o vento a caixa dos dois (r10b) */
    env.blocos = componentes(gr);
    /* REVISÃO S5 C2: com pilares formando um contorno, ELE é o envoltório; o que passa dele é balanço (beiral/marquise) */
    env.balanco = null;
    if (P.length >= 3) {
      var gp = grafoPilares(gr, P), cp = gp.E.length ? contornoExterno(gp) : [], ap = cp.length >= 3 ? areaSinal(cp) : 0;
      if (ap < 0) { cp.reverse(); ap = -ap; }
      cp = simplificar(cp); ap = cp.length >= 3 ? Math.abs(areaSinal(cp)) : 0;
      if (ap > 0.05 && componentes(gp) === 1) {
        var bal = 0, nBal = 0;
        gr.V.forEach(function (v) { if (dentroP(cp, v[0], v[1])) return; var dd = distPoli(cp, v[0], v[1]); if (dd > TOL_FACE) { nBal++; bal = Math.max(bal, dd); } });
        if (nBal) env.balanco = { max: r6(bal), pontos: nBal };
        ct = cp; area = ap; env.contornoPilares = true;
      }
    }
    env.contorno = ct.map(function (q) { return [r6(q[0]), r6(q[1])]; }); env.area = r6(area);
    var xs = gr.V.map(function (v) { return v[0]; }), zs = gr.V.map(function (v) { return v[1]; });
    env.caixa = xs.length ? { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) } : null;
    var yTopo = membros.length ? Math.max.apply(null, membros.map(function (m) { return Math.max(m.a[1], m.b[1]); })) : 0;
    var yBase = membros.length ? Math.min.apply(null, membros.map(function (m) { return Math.min(m.a[1], m.b[1]); })) : 0;
    env.yBase = r6(yBase); env.yTopo = r6(yTopo);
    if (!membros.length) { env.tipo = "vazio"; }
    else if (gr.V.length <= 1) env.tipo = "pontual";
    else if (area < 0.05 || ct.length < 3) {
      /* tudo num plano vertical (pórtico plano, treliça): as faces são os dois lados do plano */
      env.tipo = "plano";
      var V0 = gr.V, iMax = 0, jMax = 0, dMax = 0;
      for (var i = 0; i < V0.length; i++) for (var j = i + 1; j < V0.length; j++) { var d = hyp(V0[j][0] - V0[i][0], V0[j][1] - V0[i][1]); if (d > dMax) { dMax = d; iMax = i; jMax = j; } }
      var A = V0[iMax], B = V0[jMax], u = dMax > 0 ? [(B[0] - A[0]) / dMax, (B[1] - A[1]) / dMax] : [1, 0];
      [[u[1], -u[0]], [-u[1], u[0]]].forEach(function (nrm, k) { env.faces.push(face(k === 0 ? A : B, k === 0 ? B : A, nrm, "f" + (k + 1))); });
    } else {
      var n = ct.length;
      for (var k2 = 0; k2 < n; k2++) { var a2 = ct[k2], b2 = ct[(k2 + 1) % n], d2 = [b2[0] - a2[0], b2[1] - a2[1]], L2 = hyp(d2[0], d2[1]); env.faces.push(face(a2, b2, [d2[1] / L2, -d2[0] / L2], "f" + (k2 + 1))); }
      var reto = n === 4 && env.faces.every(function (f, k) { var g = env.faces[(k + 1) % 4]; return Math.abs(f.normal[0] * g.normal[0] + f.normal[1] * g.normal[1]) < 0.02; });
      env.tipo = reto ? "retangular" : "poligonal";
      env.alinhado = env.faces.every(function (f) { return Math.abs(f.normal[0]) > 0.9998 || Math.abs(f.normal[1]) > 0.9998; });
      if (reto && env.alinhado) env.faces.forEach(function (f) { f.legado = LEGADO[f.orientacao] || null; });
    }
    function face(a, b, nrm, id) {
      var d = [b[0] - a[0], b[1] - a[1]], L = hyp(d[0], d[1]), u = L > 0 ? [d[0] / L, d[1] / L] : [1, 0];
      function naLinha(x, z) { var t = (x - a[0]) * u[0] + (z - a[1]) * u[1], q = [a[0] + u[0] * t - x, a[1] + u[1] * t - z]; return hyp(q[0], q[1]) <= TOL_FACE && t >= -TOL_FACE && t <= L + TOL_FACE; }
      var pil = P.filter(function (p) { return naLinha(p.x, p.z); });
      var ms = membros.filter(function (m) { return naLinha(m.a[0], m.a[2]) && naLinha(m.b[0], m.b[2]); });
      var hT = ms.length ? Math.max.apply(null, ms.map(function (m) { return Math.max(m.a[1], m.b[1]); })) : yTopo;
      var hB = ms.length ? Math.min.apply(null, ms.map(function (m) { return Math.min(m.a[1], m.b[1]); })) : yBase;
      var ori = orientacao(nrm[0], nrm[1]);
      /* o eixo da face (do modelo ou automático) */
      var eixo = env.eixos.filter(function (e) { var dirOk = e.dir === "x" ? Math.abs(u[0]) < 0.02 : Math.abs(u[1]) < 0.02; return dirOk && (e.dir === "x" ? Math.abs(a[0] - e.c) <= 0.10 && Math.abs(b[0] - e.c) <= 0.10 : Math.abs(a[1] - e.c) <= 0.10 && Math.abs(b[1] - e.c) <= 0.10); })[0] || null;
      var nome = eixo ? "Face eixo " + eixo.nome + " (" + ori + ")" : "Face " + ori + " (" + br(a[0], 2) + "; " + br(a[1], 2) + " → " + br(b[0], 2) + "; " + br(b[1], 2) + ")";
      return { id: id, nome: nome, eixo: eixo ? eixo.nome : null, orientacao: ori, a: [r6(a[0]), r6(a[1])], b: [r6(b[0]), r6(b[1])], L: r6(L), normal: [r6(nrm[0]), r6(nrm[1])],
               hBase: r6(hB), hTopo: r6(hT), altura: r6(hT - hB), pilares: pil.map(function (p) { return p.peca; }), marcas: pil.map(function (p) { return marcaPilar(env.eixos, p.x, p.z); }),
               membros: ms.map(function (m) { return m.id; }), diagonais: ms.filter(function (m) { return m.papelLivre === "diagonal"; }).length, legado: null };
    }
    /* repetidos: duas faces com o mesmo nome ganham o número */
    var cnt = {}; env.faces.forEach(function (f) { cnt[f.nome] = (cnt[f.nome] || 0) + 1; });
    var seqN = {}; env.faces.forEach(function (f) { if (cnt[f.nome] > 1) { seqN[f.nome] = (seqN[f.nome] || 0) + 1; f.nome += " — trecho " + seqN[f.nome]; } });
    /* cobertura: o nível mais alto (vigas horizontais) ou as vigas inclinadas do topo */
    var topo = env.niveis.length ? env.niveis[env.niveis.length - 1] : null;
    /* a cobertura olha a viga com caimento a partir de ~1° (|sen| ≥ 0,02): o telhado de 10 % (5,7°) entra nos níveis como
       "horizontal" (até ~11°), mas é água de telhado — duas águas a 10 % não pode passar como laje plana */
    var incCob = membros.filter(function (m) { return (m.papelLivre === "viga" || m.papelLivre === "terca") && Math.abs(m.X[1]) >= 0.02 && !/longarin|escad|degrau|rampa/i.test(papelDe[String(m.peca)] || ""); });
    var incTopo = incCob.filter(function (m) { return Math.max(m.a[1], m.b[1]) >= yTopo - 0.6; });
    /* REVISÃO S5 A5: vigas inclinadas chegando ao topo = cobertura inclinada, mesmo com a cumeeira horizontal no mesmo nível
       (antes: "nível 6,50 m" plano e o vento pela Tabela 6 de uma água num telhado de duas águas — r2 do revisor). O sentido
       de subida de cada viga em planta diz uma água (todas para o mesmo lado) ou duas águas (sentidos opostos). */
    /* PÓRTICOS M4 (14/10/2026): a tolerância é 5 cm + MEIA SEÇÃO da viga inclinada mais alta — a terça APOIADA em cima do banzo
       ou da viga fica até meia seção acima da linha de cálculo dela (achado no teste: banzo TQ 100 a 5 %, terça 50,06 mm acima —
       a cobertura saía "plana" e o vento pela Tabela 6 num telhado de duas águas) */
    var meiaSec = incTopo.reduce(function (s, m) { var q = (m.secao && m.secao.mm) || {}; return Math.max(s, num(q.d, num(q.h, 0)) / 2000 / Math.max(0.2, Math.sqrt(1 - m.X[1] * m.X[1]))); }, 0);
    if (incTopo.length && (!topo || Math.max.apply(null, incTopo.map(function (m) { return Math.max(m.a[1], m.b[1]); })) >= topo.cota - 0.05 - meiaSec)) {
      var ang = Math.max.apply(null, incTopo.map(function (m) { return Math.asin(Math.min(1, Math.abs(m.X[1]))) * 180 / Math.PI; }));
      var sobe = incTopo.map(function (m) { var lo = m.a[1] <= m.b[1] ? m.a : m.b, hi = lo === m.a ? m.b : m.a, dx = hi[0] - lo[0], dz = hi[2] - lo[2], L = hyp(dx, dz) || 1; return [dx / L, dz / L]; });
      var duas = sobe.some(function (u) { return sobe.some(function (w) { return u[0] * w[0] + u[1] * w[1] < -0.5; }); });
      var media = sobe.reduce(function (acc, u) { return [acc[0] + u[0], acc[1] + u[1]]; }, [0, 0]);
      var eixoSobe = Math.abs(media[0]) >= Math.abs(media[1]) ? (media[0] >= 0 ? "x+" : "x-") : (media[1] >= 0 ? "z+" : "z-");
      env.cobertura = { tipo: "inclinada", duasAguas: duas, sobe: duas ? null : eixoSobe, cota: r6(yTopo), inclinacaoGraus: r6(ang), inclinacaoPct: r6(Math.tan(ang * Math.PI / 180) * 100), vigas: incTopo.map(function (m) { return m.peca; }) };
      /* PÓRTICOS M4 (14/10/2026): a FORMA do telhado pelas pontas das vigas inclinadas do topo — um plano só (uma água),
         duas águas SIMÉTRICAS com a cumeeira no meio do vão e correndo em z, ou telhado múltiplo/irregular (shed, multivão
         geminado, cumeeira fora do meio): é ela que decide se o vento tem tabela no motor (js/acovento.js: Tabelas 5 e 6) */
      env.cobertura.forma = formaCobertura(incTopo, ct, env.caixa);
    } else if (topo) env.cobertura = { tipo: "plana", cota: topo.cota, inclinacaoGraus: 0, inclinacaoPct: 0, vigas: topo.vigas, nivel: topo.id };
    /* resumo em texto */
    var R = env.resumo;
    R.push(c.pilares + " pilar(es), " + c.vigas + " viga(s)" + (c.tercas ? ", " + c.tercas + " terça(s)" : "") + (c.diagonais ? ", " + c.diagonais + " contraventamento(s) (" + c.diagVert + " em plano vertical, " + c.diagHoriz + " em plano horizontal)" : ", sem contraventamento") + ".");
    if (env.niveis.length) R.push(env.niveis.length + " nível(is): " + env.niveis.map(function (q) { return br(q.cota, 2) + " m"; }).join("; ") + (inclinadas.length ? " + " + inclinadas.length + " viga(s) inclinada(s)" : "") + ".");
    R.push(c.bases + " base(s) de pilar" + (c.bases ? " (" + (c.basesEngastadas ? c.basesEngastadas + " engastada(s), " : "") + (c.bases - c.basesEngastadas) + " rotulada(s))" : "") + ".");
    var exAuto = env.eixos.filter(function (e) { return e.auto; }).length;
    if (env.eixos.length) R.push("Eixos: " + env.eixos.filter(function (e) { return e.dir === "x"; }).map(function (e) { return e.nome; }).join(", ") + " (x) × " + env.eixos.filter(function (e) { return e.dir === "z"; }).map(function (e) { return e.nome; }).join(", ") + " (z)" + (exAuto ? " — " + (exAuto === env.eixos.length ? "automáticos pelas linhas de pilares" : exAuto + " automático(s)") : " — os da Grade de eixos") + ".");
    if (env.tipo === "retangular" || env.tipo === "poligonal") R.push("Planta " + (env.tipo === "retangular" ? "retangular" : "poligonal (" + env.faces.length + " lados)") + ", " + br(env.area, 2) + " m², altura " + br(yTopo - yBase, 2) + " m: " + env.faces.length + " faces no contorno.");
    else if (env.tipo === "plano") R.push("Estrutura num plano vertical só (pórtico/treliça plana, " + br(env.faces[0].L, 2) + " m): as faces são os dois lados do plano.");
    if (env.cobertura) R.push("Topo: " + (env.cobertura.tipo === "plana" ? "nível " + br(env.cobertura.cota, 2) + " m (" + env.cobertura.vigas.length + " vigas)" : (env.cobertura.duasAguas ? "telhado de DUAS ÁGUAS, " : "uma água, ") + "vigas inclinadas a " + br(env.cobertura.inclinacaoGraus, 1) + "° (" + br(env.cobertura.inclinacaoPct, 1) + " %)") + " — pode receber cobertura.");
    if (env.blocos > 1) R.push(env.blocos + " estruturas SEPARADAS na planta (blocos sem barra entre eles).");
    if (env.balanco) R.push("Balanço (beiral/marquise) até " + br(env.balanco.max, 2) + " m além da linha dos pilares: as faces são as da linha dos pilares.");
    return env;
  }

  /* ================================================================ FORMA DA COBERTURA (PÓRTICOS M4, 14/10/2026)
   * ms = as vigas inclinadas do topo; ct = o contorno (anti-horário) — a caixa dele dá x0, x1 (os beirais) e z0, z1.
   * As PONTAS das vigas (a linha de cálculo) têm de cair, a 5 cm, em:
   *   uma água ............ y = c0 + c1·(x − x0)                         (um plano só, a água caindo ao longo de x)
   *   duas águas .......... y = yE + i·mín(x − x0, x1 − x)               (cumeeira em x = (x0 + x1)/2, correndo em z)
   * Fora disso: "assimetrica" (uma cumeeira fora do meio do vão), "multipla" (shed, multivão geminado, irregular) ou "z"
   * (a água cai ao longo de z) — com o motivo do "não verificado" pronto (o motor não tem a tabela dessas formas). */
  var TOL_COB = 0.05;
  function ajusteLinear(pts, f) {
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { var u = f(p[0]); sx += u; sy += p[1]; sxx += u * u; sxy += u * p[1]; });
    var den = n * sxx - sx * sx, c1 = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : 0, c0 = (sy - c1 * sx) / n, res = 0;
    pts.forEach(function (p) { res = Math.max(res, Math.abs(c0 + c1 * f(p[0]) - p[1])); });
    return { c0: c0, c1: c1, res: res };
  }
  function formaCobertura(ms, ct, caixa) {
    var P = arr(ct).length >= 3 ? ct : (caixa ? [[caixa.x0, caixa.z0], [caixa.x1, caixa.z0], [caixa.x1, caixa.z1], [caixa.x0, caixa.z1]] : []);
    if (!ms.length || P.length < 3) return { tipo: "irregular", motivo: "a cobertura inclinada não tem contorno em planta para a NBR 6123" };
    var x0 = Math.min.apply(null, P.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, P.map(function (q) { return q[0]; })), xc = (x0 + x1) / 2;
    var foraX = ms.filter(function (m) { var hz = hyp(m.X[0], m.X[2]); return hz > 1e-6 && Math.abs(m.X[2]) / hz > 0.02; });
    if (foraX.length) return { tipo: "z", motivo: "cobertura com água caindo ao longo de z (ou viga inclinada do topo fora da direção x em planta): o motor de vento aplica as Tabelas 5 e 6 com a água caindo ao longo de x — não verificado" };
    /* as pontas E pontos ao longo de cada viga: só as pontas não distinguem a cumeeira fora do meio (as duas pontas da água
       longa caem na superfície simétrica — achado no teste do controle negativo) */
    var pts = []; ms.forEach(function (m) { [0, 0.25, 0.5, 0.75, 1].forEach(function (t) { pts.push([m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t]); }); });
    var u1 = ajusteLinear(pts, function (x) { return x - x0; });
    if (u1.res <= TOL_COB && Math.abs(u1.c1) > 0.005) return { tipo: "uma-agua", i: r6(Math.abs(u1.c1)), sobe: u1.c1 > 0 ? "x+" : "x-", x0: r6(x0), x1: r6(x1) };
    var esq = pts.filter(function (p) { return p[0] < xc - TOL; }).length, dir = pts.filter(function (p) { return p[0] > xc + TOL; }).length;
    var u2 = ajusteLinear(pts, function (x) { return Math.min(x - x0, x1 - x); });
    if (esq && dir && u2.res <= TOL_COB && u2.c1 > 0.005) return { tipo: "duas-aguas", i: r6(u2.c1), yE: r6(u2.c0), xc: r6(xc), x0: r6(x0), x1: r6(x1),
      inclinacaoGraus: r6(Math.atan(u2.c1) * 180 / Math.PI) };
    /* uma cumeeira só, fora do meio do vão (duas águas assimétricas): dois planos que se encontram no ponto mais alto */
    var top = pts.reduce(function (a, p) { return p[1] > a[1] ? p : a; }, pts[0]), xr = top[0];
    var pe = pts.filter(function (p) { return p[0] <= xr + TOL; }), pd = pts.filter(function (p) { return p[0] >= xr - TOL; });
    if (pe.length >= 2 && pd.length >= 2) {
      var ae = ajusteLinear(pe, function (x) { return x; }), ad = ajusteLinear(pd, function (x) { return x; });
      if (ae.res <= TOL_COB && ad.res <= TOL_COB && ae.c1 > 0.005 && ad.c1 < -0.005)
        return { tipo: "assimetrica", motivo: "cobertura em DUAS ÁGUAS ASSIMÉTRICAS (cumeeira em x = " + br(xr, 2) + " m, fora do meio do vão " + br(xc, 2) + " m, ou inclinações diferentes): a Tabela 5 da NBR 6123 é de duas águas simétricas — o vento desta cobertura não foi verificado" };
    }
    return { tipo: "multipla", motivo: "cobertura que não é um plano só nem duas águas simétricas com a cumeeira no meio do vão — telhado MÚLTIPLO (shed/dente de serra, multivão geminado) ou irregular: os coeficientes de telhados múltiplos (NBR 6123, Tabelas 7 e 8) não estão no motor de vento — não verificado" };
  }

  /* ================================================================ FECHAMENTOS */
  var FECHAMENTOS = [
    { id: "aberta", nome: "Aberta", fechada: false },
    { id: "telha-trapezoidal", nome: "Telha trapezoidal", fechada: true, vedacao: "telha", grupoTelha: "trapezoidal" },
    { id: "telha-sanduiche", nome: "Telha sanduíche", fechada: true, vedacao: "telha", grupoTelha: "sanduiche" },
    { id: "alvenaria", nome: "Alvenaria até h (aberta acima)", fechada: true, vedacao: "alvenaria", comH: true },
    { id: "misto", nome: "Misto: alvenaria até h + telha acima", fechada: true, vedacao: "misto", comH: true, grupoTelha: "trapezoidal" },
    { id: "pre-moldado", nome: "Painel pré-moldado", fechada: true, vedacao: "pré-moldado" }
  ];
  var COBERTURAS = [
    { id: "sem", nome: "Sem cobertura" },
    { id: "telha-trapezoidal", nome: "Telha trapezoidal", grupoTelha: "trapezoidal" },
    { id: "telha-sanduiche", nome: "Telha sanduíche", grupoTelha: "sanduiche" }
  ];
  function fechamentoDe(id) { for (var i = 0; i < FECHAMENTOS.length; i++) if (FECHAMENTOS[i].id === id) return FECHAMENTOS[i]; return FECHAMENTOS[0]; }
  function coberturaDe(id) { for (var i = 0; i < COBERTURAS.length; i++) if (COBERTURAS[i].id === id) return COBERTURAS[i]; return COBERTURAS[0]; }
  /* a telha do catálogo (js/acofechamentos.js) de cada grupo: a de partida do catálogo */
  function telhaPadrao(grupo) {
    var F = Fch(); if (!F) return null;
    if (grupo === "trapezoidal" && F.PADRAO_TELHA && F.telha(F.PADRAO_TELHA)) return F.PADRAO_TELHA;
    var l = F.telhas(grupo); return l.length ? l[0].id : null;
  }
  function telhaInfo(id) {
    var F = Fch(); if (!F || !id) return null;
    var t = F.telha(id); if (!t) return null;
    var p = F.peso(id) || {}, nm = F.nome(t) || [   /* PÓRTICOS M4: nome(t) recebe a TELHA, não o id — com o id saía a palavra "undefined" no texto da área de cobertura (e o memorial acusava texto indefinido) */t.fabricante, t.modelo, t.espessura ? String(t.espessura).replace(".", ",") + " mm" : ""].filter(Boolean).join(" ") || id;
    return { id: id, nome: nm, peso: num(p.valor, null), origem: p.origem || "", texto: p.texto || "", inclMin: num(t.inclMin, null), inclObs: t.inclObs || "" };
  }
  /* fech = { situacao: "livre"|"interna", faces: { faceId: { tipo, h, telha } }, cobertura: { tipo, telha } } */
  function fechamentoPadrao(env) {
    var o = { situacao: "livre", faces: {}, cobertura: { tipo: "sem" } };
    arr(env && env.faces).forEach(function (f) { o.faces[f.id] = { tipo: "aberta" }; });
    return o;
  }
  /* REVISÃO S5 A4 (14/10/2026): o fechamento é guardado pela FACE (o eixo e a orientação — "eixo A, norte"), não pela posição
     das pontas: desenhar mais um vão mudava as pontas e 3 faces voltavam a "aberta" sem aviso (r11 do revisor). Face sem
     fechamento guardado fica marcada (semEscolha) e o cálculo para com "escolha o fechamento" — nunca vira "aberta" calada.
     fech.todasAbertas: quem chama declara que as faces não escolhidas são abertas (plataforma dos Acessos). */
  function casarFechamentos(env, fech) {
    var out = { situacao: (fech && fech.situacao) || "livre", faces: {}, cobertura: (fech && fech.cobertura) || { tipo: "sem" }, semEscolha: [] };
    arr(env.faces).forEach(function (f) {
      var pc = (fech && fech.porChave) || {}, dado = pc[chaveFace(f)] || pc[chavePosicao(f)] || (fech && fech.faces && fech.faces[f.id]);
      if (!dado) { if (fech && fech.todasAbertas) dado = { tipo: "aberta" }; else { out.semEscolha.push(f.id); dado = { tipo: "sem-escolha", semEscolha: true }; } }
      out.faces[f.id] = dado;
    });
    return out;
  }
  function chavePosicao(f) { return [f.a[0], f.a[1], f.b[0], f.b[1]].map(function (v) { return Math.round(v * 20) / 20; }).join(","); }
  function chaveFace(f) { return f.eixo ? "eixo:" + f.eixo + ":" + f.orientacao : chavePosicao(f); }

  /* ================================================================ VENTO
   * O motor de vento (js/acovento.js) é o do galpão: planta RETANGULAR com as faces nos eixos x e z. Para a estrutura
   * desenhada isso vale quando o contorno é um retângulo alinhado; as 4 faces viram frente/fundo/esquerda/direita. */
  function vento(env, fech, cfg) {
    cfg = cfg || {};
    if (!fech || fech.situacao === "interna") return { ok: true, semVento: true, motivo: "estrutura dentro de outra edificação (declarado pelo engenheiro): sem vento" };
    if (env.tipo === "vazio" || env.tipo === "pontual") return { ok: false, naoVerificado: "a estrutura não tem contorno em planta para a NBR 6123 (um pilar só ou nenhum)" };
    /* REVISÃO S5 A4: face sem fechamento escolhido — não calcula o vento com um fechamento suposto */
    if (arr(fech.semEscolha).length) return { ok: false, naoVerificado: arr(fech.semEscolha).length + " face(s) sem fechamento escolhido (" + env.faces.filter(function (f) { return fech.semEscolha.indexOf(f.id) >= 0; }).map(function (f) { return f.nome; }).join("; ") + "): escolha o fechamento no envoltório" };
    /* REVISÃO S5 A3: dois blocos ou mais */
    if (num(env.blocos, 1) > 1) return { ok: false, naoVerificado: env.blocos + " estruturas separadas na planta: o vento de cada uma (e a proteção de uma pela outra) não foi verificado — calcule cada estrutura separadamente (\"Calcular só as peças selecionadas\")" };
    /* REVISÃO S5 C2: beiral/marquise em balanço além da linha dos pilares */
    if (env.balanco) return { ok: false, naoVerificado: "beiral/marquise em balanço até " + br(env.balanco.max, 2) + " m além da linha dos pilares: o motor de vento do OrçaPRO não calcula a pressão nas duas faces do balanço (NBR 6123) — não verificado. As faces do envoltório ficam na linha dos pilares" };
    var abertas = env.faces.filter(function (f) { return !fechamentoDe((fech.faces[f.id] || {}).tipo).fechada; }).length;
    var cob = coberturaDe(fech.cobertura && fech.cobertura.tipo);
    /* REVISÃO S5 A5: a forma do telhado — o vento da estrutura desenhada só tem a cobertura de UMA água com a água caindo
       ao longo de x (a convenção do motor); duas águas ou água ao longo de z → não verificado */
    var cb0 = env.cobertura, temCob = cob.id !== "sem" || cfg.coberturaArea, ladoAlto = null, cobV = "uma-agua", fm = null;
    if (temCob && cb0 && cb0.tipo === "inclinada") {
      /* PÓRTICOS M4 (14/10/2026): DUAS ÁGUAS SIMÉTRICAS (cumeeira no meio do vão, correndo em z — a forma da Tabela 5, a mesma
         do galpão) calcula; assimétrica, telhado múltiplo (shed, multivão geminado) ou água ao longo de z continuam NÃO
         VERIFICADO com o motivo (a REVISÃO S5 A5 travava todas as duas águas) */
      fm = cb0.forma || {};
      if (cb0.duasAguas || fm.tipo === "duas-aguas") {
        if (fm.tipo !== "duas-aguas") return { ok: false, naoVerificado: fm.motivo || ("cobertura em DUAS ÁGUAS (" + br(cb0.inclinacaoGraus, 1) + "°) fora da forma da Tabela 5 da NBR 6123 — não verificado") };
        cobV = "duas-aguas";
      } else if (fm.tipo === "uma-agua" || !fm.tipo) {
        if (cb0.sobe === "x+") ladoAlto = "direita"; else if (cb0.sobe === "x-") ladoAlto = "esquerda";
        else return { ok: false, naoVerificado: "cobertura de uma água com a água caindo ao longo de z: o motor de vento aplica a Tabela 6 com a água caindo ao longo de x — não verificado" };
      } else if (fm.tipo === "z") return { ok: false, naoVerificado: "cobertura de uma água com a água caindo ao longo de z: o motor de vento aplica a Tabela 6 com a água caindo ao longo de x — não verificado" };
      else return { ok: false, naoVerificado: fm.motivo };
    }
    if (env.tipo === "plano") return { ok: false, naoVerificado: "pórtico/treliça num plano só, ao ar livre: o vento age nas próprias barras (NBR 6123, coeficientes de força de barras e reticulados) — o motor de vento do OrçaPRO não tem essas tabelas. Declare \"dentro de outra edificação\" se for o caso, ou calcule o vento nas barras à parte e lance como carga" };
    if (env.tipo !== "retangular" || !env.alinhado) return { ok: false, naoVerificado: "planta " + (env.tipo === "retangular" ? "retangular girada em relação aos eixos x e z do modelo" : "não retangular (" + env.faces.length + " lados)") + ": as tabelas de coeficientes de pressão do motor (NBR 6123, Tabelas 4, 5 e 6) são de planta retangular com as faces nos eixos — o vento desta forma não foi verificado" };
    /* a área marcada como COBERTURA nas cargas (telha lançada à mão) também é cobertura */
    if (abertas === env.faces.length && cob.id === "sem" && !cfg.coberturaArea) return { ok: false, naoVerificado: "todas as faces abertas e sem cobertura: o vento age nas próprias barras (NBR 6123, coeficientes de força) — o motor de vento do OrçaPRO não tem essas tabelas" };
    var faces = {}, faltaPilar = [];
    env.faces.forEach(function (f) {
      var fc = fech.faces[f.id] || {}, F = fechamentoDe(fc.tipo), lado = f.legado;
      if (!lado) return;
      if (!F.fechada) { faces[lado] = { fechada: false }; return; }
      if (!f.pilares.length) faltaPilar.push(f.nome);
      var o = { fechada: true, vedacao: F.vedacao, aberturas: [] };
      var H = Math.max(0.01, num(f.altura, 0)), h = F.comH ? Math.max(0, Math.min(H, num(fc.h, H))) : H;
      /* REVISÃO S5 C1 (14/10/2026): alvenaria só até h, aberta acima — a faixa de cima é ABERTURA DOMINANTE (NBR 6123, 6.2.4:
         abertura permanente maior que as demais; 6.2.5-c: a barlavento cpi = +0,8 conforme a razão) em toda a face; o motor
         monta a envoltória das duas situações. Antes "dominante: false" levava ao 6.2.5-b (cpi −0,3/0) e APROVAVA o que a
         mesma face toda aberta reprovava (r1f do revisor: V4 0,854 × 1,072) */
      if (F.id === "alvenaria" && h < H - 0.01) o.aberturas.push({ area: r6(f.L * (H - h)), dominante: true, s0: 0, s1: r6(f.L), descricao: "faixa aberta acima da alvenaria (" + br(H - h, 2) + " m) — abertura dominante" });
      faces[lado] = o;
    });
    /* REVISÃO S5 C2: a mensagem NÃO sugere trocar para "aberta" (com a parede de verdade isso tira o vento dos pilares) */
    if (faltaPilar.length) return { ok: false, naoVerificado: "face(s) fechada(s) sem pilar na linha — o vento dela não tem caminho no modelo: " + faltaPilar.join("; ") + " (desenhe os pilares da face; o fechamento é o da obra)" };
    /* duas águas: as condições da Tabela 5 (js/acovento.js cpeTelhado5) checadas AQUI, para sair "não verificado" com o motivo em
       vez de o cálculo parar — comprimento a ≥ vão b (cumeeira ao longo do lado maior), h/b ≤ 6, θ ≤ 60° */
    var hBeiral = null;
    if (cobV === "duas-aguas") {
      var xsC = arr(env.contorno).map(function (q) { return q[0]; }), zsC = arr(env.contorno).map(function (q) { return q[1]; });
      var bV = Math.max.apply(null, xsC) - Math.min.apply(null, xsC), aV = Math.max.apply(null, zsC) - Math.min.apply(null, zsC);
      hBeiral = r6(num(fm.yE, env.yTopo) - num(env.yBase, 0));
      if (aV < bV - 1e-6) return { ok: false, naoVerificado: "cobertura em duas águas com o comprimento (" + br(aV, 2) + " m, ao longo da cumeeira) menor que o vão (" + br(bV, 2) + " m): a Tabela 5 da NBR 6123 pede a cumeeira ao longo do lado maior (a ≥ b) — não verificado; aumente o número de pórticos" };
      if (!(hBeiral / bV <= 6)) return { ok: false, naoVerificado: "duas águas com h/b = " + br(hBeiral / bV, 2) + " > 6: fora da Tabela 5 da NBR 6123 — não verificado" };
      if (!(num(fm.inclinacaoGraus, 0) <= 60)) return { ok: false, naoVerificado: "duas águas com θ = " + br(fm.inclinacaoGraus, 1) + "° > 60°: fora da Tabela 5 da NBR 6123 — não verificado" };
    }
    return { ok: true, faces: faces, coberturaIsolada: abertas === 4, inclinacaoGraus: cobV === "duas-aguas" ? num(fm.inclinacaoGraus, 0) : (env.cobertura ? num(env.cobertura.inclinacaoGraus, 0) : 0), ladoAlto: ladoAlto,
             cobertura: cobV, hBeiral: hBeiral, forma: fm };
  }

  /* ================================================================ SITUAÇÃO (depois do cálculo)
   * aprovado só com as barras aprovadas E o vento verificado (ou a estrutura declarada interna); senão "incompleto"
   * com o que faltou, ou "reprovado" */
  function situacao(r, naoVerificados) {
    var nv = arr(naoVerificados);
    if (!r || !r.ok) return { id: "nao-calculou", texto: "Não calculou", naoVerificados: nv };
    if (!r.aprovado) return { id: "reprovado", texto: "Reprovado", naoVerificados: nv };
    if (nv.length) return { id: "incompleto", texto: "Incompleto", naoVerificados: nv, motivo: nv.map(function (x) { return x.tema + ": " + x.motivo; }).join(" · ") };
    return { id: "aprovado", texto: "Aprovado", naoVerificados: nv };
  }

  /* ================================================================ CONTRAVENTAR (a solução do mecanismo)
   * Os X que faltam: em cada face (plano vertical) que tem 2+ pilares e nenhuma diagonal, um X no vão de canto (entre os
   * dois primeiros pilares, da base ao topo da face); em cada nível de vigas sem diagonal horizontal, um X no vão de
   * canto do contorno. → [{ plano, a, b, motivo }] (linhas em 3D; a tela cria as peças com a ferramenta Diagonal) */
  function contraventar(G, env, op) {
    op = op || {};
    var out = [], P = pilaresPlanta(G);
    arr(env.faces).forEach(function (f, kf) {
      if (f.diagonais > 0 || f.pilares.length < 2) return;
      if (env.tipo === "plano" && kf > 0) return;   /* os dois lados do plano são o mesmo plano */
      var ps = P.filter(function (p) { return f.pilares.indexOf(p.peca) >= 0; }), u = [f.b[0] - f.a[0], f.b[1] - f.a[1]], L = hyp(u[0], u[1]); if (!(L > 0)) return;
      u = [u[0] / L, u[1] / L];
      ps.sort(function (p, q) { return ((p.x - f.a[0]) * u[0] + (p.z - f.a[1]) * u[1]) - ((q.x - f.a[0]) * u[0] + (q.z - f.a[1]) * u[1]); });
      var p0 = ps[0], p1 = ps[1], yb = Math.max(p0.base, p1.base), yt = Math.min(p0.topo, p1.topo);
      if (!(yt - yb > 0.3)) return;
      out.push({ plano: f.nome, a: [p0.x, yb, p0.z], b: [p1.x, yt, p1.z] }, { plano: f.nome, a: [p1.x, yb, p1.z], b: [p0.x, yt, p0.z] });
    });
    if (env.tipo === "plano" && !out.length) return out;
    /* plano de cada nível: X no vão de canto (o retângulo de 4 pilares mais perto do canto do contorno) */
    var temHoriz = arr(G.membros).some(function (m) { return m.papelLivre === "diagonal" && Math.abs(m.X[1]) < 0.2; });
    if (!temHoriz && op.niveis !== false) arr(env.niveis).forEach(function (nv) {
      var ex = env.eixos, xs = ex.filter(function (e) { return e.dir === "x"; }).map(function (e) { return e.c; }), zs = ex.filter(function (e) { return e.dir === "z"; }).map(function (e) { return e.c; });
      if (xs.length < 2 || zs.length < 2) return;
      function tem(x, z) { return P.some(function (p) { return Math.abs(p.x - x) <= TOL && Math.abs(p.z - z) <= TOL && p.topo >= nv.cota - 0.6; }); }
      for (var i = 0; i + 1 < xs.length; i++) for (var j = 0; j + 1 < zs.length; j++) {
        if (tem(xs[i], zs[j]) && tem(xs[i + 1], zs[j]) && tem(xs[i], zs[j + 1]) && tem(xs[i + 1], zs[j + 1])) {
          out.push({ plano: nv.nome, a: [xs[i], nv.cota, zs[j]], b: [xs[i + 1], nv.cota, zs[j + 1]] }, { plano: nv.nome, a: [xs[i + 1], nv.cota, zs[j]], b: [xs[i], nv.cota, zs[j + 1]] });
          return;
        }
      }
    });
    return out;
  }

  /* ================================================================ LIGAR AS PEÇAS SOLTAS
   * a ponta solta vai para o ponto mais perto de outra peça (ponta ou meio), até `maxDist` (1 m) — devolve as linhas
   * novas por peça: [{ peca, a, b, de: "ini"|"fim", d, alvo }]; o que não acha alvo vai em `semAlvo` */
  function dist3(p, q) { return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2)); }
  /* REVISÃO S5 C3 (14/10/2026): o "Apoiar os cantos" só apoia o nó que é VÉRTICE do contorno da estrutura (em planta,
     tolerância 5 cm) e onde nenhuma peça PASSA — uma ponta por nó. Antes a regra "≤ 2 peças no nó" pegava o T no meio do
     vão (a secundária chegando na principal) e o apoio declarado ali aprovava a grelha (r3 do revisor: 1,376 → 0,036). */
  function cantosApoio(G, env, pecas) {
    var ct = env ? arr(env.contorno) : [], vistos = {}, out = [], pc = arr(pecas).map(String);
    function vertice(P) { return ct.some(function (q) { return Math.abs(q[0] - P[0]) <= 0.05 && Math.abs(q[1] - P[2]) <= 0.05; }); }
    arr(G && G.membros).forEach(function (m) {
      if (pc.length && pc.indexOf(String(m.peca)) < 0) return;
      [["ini", m.nos[0]], ["fim", m.nos[m.nos.length - 1]]].forEach(function (k) {
        var I = G.noInfo[k[1]]; if (!I || vistos[k[1]] || arr(I.passa).length || !vertice(I.P)) return;
        vistos[k[1]] = true; out.push({ chave: m.peca + ":" + k[0], no: k[1], P: I.P, mid: m.id });
      });
    });
    return out;
  }
  function ligarSoltas(G, pecas, op) {
    op = op || {};
    var maxD = num(op.maxDist, 1.0), out = [], sem = [], ms = arr(G.membros);
    function proj(P, m) { var d = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], t = L2 > 0 ? ((P[0] - m.a[0]) * d[0] + (P[1] - m.a[1]) * d[1] + (P[2] - m.a[2]) * d[2]) / L2 : 0; t = Math.max(0, Math.min(1, t)); var Q = [m.a[0] + d[0] * t, m.a[1] + d[1] * t, m.a[2] + d[2] * t]; return { Q: Q, d: Math.sqrt(Math.pow(P[0] - Q[0], 2) + Math.pow(P[1] - Q[1], 2) + Math.pow(P[2] - Q[2], 2)) }; }
    arr(pecas).forEach(function (id) {
      var m = ms.filter(function (x) { return x.peca === id; })[0]; if (!m) return;
      var outros = ms.filter(function (x) { return x !== m && arr(pecas).indexOf(x.peca) < 0; });
      if (!outros.length) outros = ms.filter(function (x) { return x !== m; });
      /* cada ponta SOLTA procura o seu alvo (a viga 40 cm acima desce as DUAS pontas; só uma ponta perto → só ela anda).
         REVISÃO S5 M1: a ponta já ligada (no nó com outra peça) não sai do lugar — r4 do revisor: a base da diagonal subia
         0,80 m do pé do P1 */
      var ach = {}, noI = G.noInfo || {};
      function presa(idNo) { var I = noI[idNo]; return !!I && arr(I.ends).length + arr(I.passa).length > 1; }
      var presaIni = presa(m.nos[0]), presaFim = presa(m.nos[m.nos.length - 1]);
      [["ini", m.a], ["fim", m.b]].forEach(function (k) { if ((k[0] === "ini" && presaIni) || (k[0] === "fim" && presaFim)) return; outros.forEach(function (o) { var q = proj(k[1], o); if (q.d > 1e-4 && q.d <= maxD && (!ach[k[0]] || q.d < ach[k[0]].d)) ach[k[0]] = { Q: q.Q, d: q.d, alvo: o.id }; }); });
      if (!ach.ini && !ach.fim) { sem.push(id); return; }
      var a = ach.ini ? ach.ini.Q : m.a.slice(), b = ach.fim ? ach.fim.Q : m.b.slice();
      if (dist3(a, b) < 0.05) { a = m.a.slice(); b = m.b.slice(); var k1 = ach.ini && (!ach.fim || ach.ini.d <= ach.fim.d) ? "ini" : "fim"; if (k1 === "ini") a = ach.ini.Q; else b = ach.fim.Q; ach = k1 === "ini" ? { ini: ach.ini } : { fim: ach.fim }; }
      out.push({ peca: id, a: a.map(r6), b: b.map(r6), de: ach.ini && ach.fim ? "ambas" : (ach.ini ? "ini" : "fim"), d: r6(Math.max(ach.ini ? ach.ini.d : 0, ach.fim ? ach.fim.d : 0)), alvo: (ach.ini || ach.fim).alvo });
    });
    return { linhas: out, semAlvo: sem };
  }

  /* ================================================================ ENTRADA DO CÁLCULO
   * entrada.envoltorio = { situacao, porChave | faces, cobertura, eixos } (o que a tela guarda) → a entrada do
   * AcoDimLivre com o vento montado pelas faces (ou nenhum, com o "não verificado") e a COBERTURA de telha virando área
   * de cobertura com o peso do catálogo — sem formulário. Devolve { entrada, env, fech, vento, naoVerificados, decisoes } */
  function MLv() { return dep("AcoModeloLivre", "./acomodelolivre.js"); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function prepararEntrada(entrada) {
    var M = MLv(); if (!M || !entrada || !entrada.envoltorio) return null;
    var lido = M.ler(entrada.caixas, { ids: entrada.ids, acoEstrutura: entrada.acoEstrutura }); if (!lido.pecas.length || lido.semPerfil.length || lido.semAco.length) return null;
    var ap = entrada.apoios || {}, lg = entrada.ligacoes || {}, G0;
    try { G0 = M.montar(lido, { bases: ap.bases, basePadrao: ap.basePadrao, apoios: ap.extras, ligacoes: lg.pontas, vigaPilar: lg.vigaPilar, vigaViga: lg.vigaViga, pontos: [] }); } catch (e) { return null; }
    var env = ler(G0, { eixos: entrada.envoltorio.eixos }), fech = casarFechamentos(env, entrada.envoltorio);
    var e2 = {}; Object.keys(entrada).forEach(function (k) { e2[k] = entrada[k]; });
    var cg = e2.cargas = copia(entrada.cargas || {}); cg.areas = arr(cg.areas); cg.pontuais = arr(cg.pontuais);
    var nv = [], dec = [], problemas = [], cfgV = cg.vento || {};
    /* cobertura de telha → área de cobertura (se o engenheiro não marcou uma) */
    var cob = coberturaDe(fech.cobertura && fech.cobertura.tipo), tInfo = null;
    if (cob.id !== "sem") {
      if (!env.cobertura) nv.push({ tema: "Cobertura", motivo: "a cobertura de telha foi escolhida mas a estrutura não tem nível de topo com vigas para recebê-la" });
      else if (!cg.areas.some(function (a) { return a.cobertura; })) {
        var area = null, aguas2 = null;
        if (env.cobertura.tipo === "plana") area = M.areasPorNivel(G0).filter(function (a) { return Math.abs(a.cota - env.cobertura.cota) <= 0.6; })[0] || null;
        else if (env.cobertura.forma && env.cobertura.forma.tipo === "duas-aguas") {
          /* PÓRTICOS M4: duas águas → UMA área por água, cada uma com a normal externa dela (o vento entra na normal) */
          var fmA = env.cobertura.forma, thA = Math.atan(num(fmA.i, 0)), porX = {}; arr(G0.membros).forEach(function (m) { porX[m.peca] = (m.a[0] + m.b[0]) / 2; });
          aguas2 = [["esquerda", [-Math.sin(thA), Math.cos(thA), 0], function (x) { return x < fmA.xc; }], ["direita", [Math.sin(thA), Math.cos(thA), 0], function (x) { return x > fmA.xc; }]].map(function (ag) {
            var a2 = M.areaDasVigas(G0, env.cobertura.vigas.filter(function (id) { return porX[id] != null && ag[2](porX[id]); }), "Cobertura — água " + ag[0]);
            if (a2) { a2.normal = ag[1].map(r6); a2.agua = ag[0]; }
            return a2;
          });
          if (aguas2[0] && aguas2[1]) area = aguas2[0]; else aguas2 = null;
        }
        else area = M.areaDasVigas(G0, env.cobertura.vigas, "Cobertura");
        tInfo = telhaInfo((fech.cobertura && fech.cobertura.telha) || telhaPadrao(cob.grupoTelha));
        if (!area) nv.push({ tema: "Cobertura", motivo: "não deu para formar a área da cobertura com as vigas do topo" });
        else (aguas2 || [area]).forEach(function (area, kA) {
          area.id = "cob-envoltorio" + (kA ? "-" + (kA + 1) : ""); area.nome = "Cobertura" + (area.agua ? " — água " + area.agua : "") + " (" + (tInfo ? tInfo.nome : cob.nome) + ")"; area.cobertura = true; area.uso = "cobertura";
          /* a inclinação: a informada no envoltório; senão a do topo desenhado; topo PLANO (a telha cai sobre terças não
             desenhadas) → a inclinação mínima da telha do catálogo do fabricante, com a decisão no memorial */
          var incInf = num(fech.cobertura && fech.cobertura.inclinacaoPct, null), incGeo = num(env.cobertura.inclinacaoPct, 0), incTxt;
          if (incInf != null && incInf > 0) { area.inclinacaoPct = incInf; incTxt = "informada pelo engenheiro"; }
          else if (incGeo >= 1) { area.inclinacaoPct = incGeo; incTxt = "a das vigas do topo"; }
          else if (tInfo && tInfo.inclMin > 0) { area.inclinacaoPct = tInfo.inclMin; incTxt = "o topo desenhado é plano: adotada a inclinação mínima da telha no catálogo do fabricante (" + br(tInfo.inclMin, 0) + " %) — confira com o projeto da cobertura"; }
          else { area.inclinacaoPct = incGeo; incTxt = "o topo desenhado é plano e a telha não traz inclinação mínima: informe a inclinação da cobertura"; }
          area.direcao = "auto";
          area.g = tInfo && tInfo.peso != null ? tInfo.peso : 0; area.gCategoria = "G-industrializado";
          area.gTexto = tInfo ? tInfo.nome + " — " + (tInfo.texto || "catálogo") : "telha sem peso no catálogo";
          if ((!tInfo || tInfo.peso == null) && !kA) nv.push({ tema: "Cobertura", motivo: "a telha escolhida não tem peso no catálogo — o peso da telha NÃO entrou" });
          cg.areas.push(area);
          dec.push({ tema: "Cobertura", decisao: "área de cobertura automática no topo" + (area.agua ? ", água " + area.agua : "") + " (" + br(M.areaPoligono(area.poligono), 2) + " m²): " + area.gTexto + " (g = " + br(area.g, 4) + " kN/m²) + sobrecarga de cobertura (NBR 6120:2019, 6.4) com inclinação de " + br(area.inclinacaoPct, 1) + " % (" + incTxt + ")", motivo: "o engenheiro escolheu cobertura de telha no envoltório; as vigas do topo recebem a telha por faixas (terças não desenhadas não entram no modelo)" + (area.agua ? "; duas águas: o vento entra na normal de cada água" : "") });
        });
      }
    }
    /* PÓRTICOS M4: o que as peças da TIPOLOGIA declararam que o motor não verifica (a mísula cônica, a fadiga da viga de
       rolamento…) entra nos "não verificados" — a situação fica "incompleto", nunca "aprovado" */
    arr(lido.naoVerificados).forEach(function (x) { if (!nv.some(function (q) { return q.tema === x.tema && q.motivo === x.motivo; })) nv.push({ tema: x.tema, motivo: x.motivo }); });
    if (arr(lido.tipologias).length) dec.push({ tema: "Tipologia", decisao: "pórtico paramétrico: " + lido.tipologias.join("; "), motivo: "estrutura gerada pela biblioteca de pórticos industriais (Metálica › Pórticos): as ligações e as bases declaradas pela tipologia valem quando a tela não escolhe outra e não há ligação desenhada" });
    var cfgV2 = {}; Object.keys(cfgV).forEach(function (k) { cfgV2[k] = cfgV[k]; }); cfgV2.coberturaArea = cg.areas.some(function (a) { return a.cobertura; });
    /* REVISÃO S5 A4: face sem fechamento escolhido → o cálculo para e pede a escolha */
    if (fech.situacao !== "interna" && fech.semEscolha.length) {
      var nomesSem = env.faces.filter(function (f) { return fech.semEscolha.indexOf(f.id) >= 0; }).map(function (f) { return f.nome; });
      problemas.push({ tipo: "envoltorio", texto: "Envoltório: escolha o fechamento de " + nomesSem.length + " face(s) — " + nomesSem.join("; ") + " (a face é nova ou o modelo mudou desde a escolha). O vento depende disso: nada vira \"aberta\" sozinho.", faces: fech.semEscolha.slice(),
        solucoes: [{ id: "faces-abertas", texto: "Essas faces são ABERTAS" }, { id: "rever-envoltorio", texto: "Rever o envoltório" }, { id: "interna", texto: "Dentro de outra edificação (sem vento)" }] });
    }
    var v = vento(env, fech, cfgV2);
    if (v.semVento) { cg.vento = null; dec.push({ tema: "Vento", decisao: "não considerado: estrutura dentro de outra edificação", motivo: "declarado pelo engenheiro no envoltório (NBR 6123 não se aplica a estrutura protegida do vento)" }); }
    else if (!v.ok) { cg.vento = null; nv.push({ tema: "Vento (NBR 6123)", motivo: v.naoVerificado }); }
    /* REVISÃO M4 alto c (15/10/2026): duas águas com área de cobertura SEM a normal da água (desenhada à mão): a pressão sairia
       vertical, sem a componente horizontal de cada água — não verificado (a cobertura de telha do envoltório faz uma área por
       água, com a normal) */
    else if (v.cobertura === "duas-aguas" && cg.areas.some(function (a) { return a && a.cobertura && !Array.isArray(a.normal); })) {
      cg.vento = null;
      nv.push({ tema: "Vento (NBR 6123)", motivo: "cobertura em DUAS ÁGUAS com área de cobertura sem a normal da água (marcada à mão): a pressão de cada água entraria vertical, sem a componente horizontal — não verificado; use a cobertura de telha do envoltório (uma área por água)" });
    }
    else if (num(cfgV.v0, null) == null && (num(cfgV.lat, null) == null || num(cfgV.lon, null) == null)) {
      cg.vento = null;
      problemas.push({ tipo: "vento-local", texto: "Vento (NBR 6123): falta o LOCAL da obra para tirar o V0 do mapa de isopletas — escreva o endereço, cole o link do mapa ou as coordenadas (ou informe o V0); se a estrutura fica dentro de outra edificação, declare isso no envoltório.", solucoes: [{ id: "vento-local", texto: "Ir ao local do vento" }, { id: "interna", texto: "Dentro de outra edificação (sem vento)" }] });
    }
    else {
      var vt = {}; Object.keys(cfgV).forEach(function (k) { vt[k] = cfgV[k]; });
      vt.faces = v.faces; vt.inclinacaoGraus = v.inclinacaoGraus; if (v.ladoAlto) vt.ladoAlto = v.ladoAlto;
      /* PÓRTICOS M4: duas águas simétricas → a Tabela 5 do motor, com h = a altura do BEIRAL (não a do pilar mais alto: o
         pilar central do multivão vai até a cumeeira) */
      if (v.cobertura === "duas-aguas") { vt.cobertura = "duas-aguas"; if (v.hBeiral != null && v.hBeiral > 0) vt.h = v.hBeiral; vt.yBase = env.yBase; }
      /* REVISÃO S5 C2/A3: a caixa do vento é a do contorno do envoltório (os pilares), não a de todas as barras */
      if (env.contorno && env.contorno.length >= 3) { var xsC = env.contorno.map(function (q) { return q[0]; }), zsC = env.contorno.map(function (q) { return q[1]; }); vt.caixa = { x0: Math.min.apply(null, xsC), x1: Math.max.apply(null, xsC), z0: Math.min.apply(null, zsC), z1: Math.max.apply(null, zsC) }; }
      cg.vento = vt;
      dec.push({ tema: "Envoltório", decisao: env.faces.map(function (f) { var F = fechamentoDe((fech.faces[f.id] || {}).tipo); return f.nome + ": " + F.nome.toLowerCase() + (F.comH ? " (h = " + br(num((fech.faces[f.id] || {}).h, f.altura), 2) + " m)" : ""); }).join("; ") + "; cobertura: " + cob.nome.toLowerCase(),
        motivo: "faces do contorno lidas da geometria (planta " + env.tipo + "); o fechamento de cada face foi escolhido pelo engenheiro e decide os coeficientes de pressão (NBR 6123, Tabela 4) e o cpi (6.2 e Anexo D)" });
    }
    return { entrada: e2, env: env, fech: fech, vento: v, naoVerificados: nv, decisoes: dec, telha: tInfo, problemas: problemas };
  }
  function completarResultado(r, PE) {
    if (!r || !PE) return r;
    var env = PE.env, fech = PE.fech;
    r.envoltorio = { tipo: env.tipo, contorno: env.contorno, area: env.area, eixos: env.eixos, niveis: env.niveis, cobertura: env.cobertura, contagem: env.contagem, resumo: env.resumo, caixa: env.caixa, yBase: env.yBase, yTopo: env.yTopo,
      situacao: fech.situacao, coberturaFechamento: { tipo: coberturaDe(fech.cobertura && fech.cobertura.tipo).id, nome: coberturaDe(fech.cobertura && fech.cobertura.tipo).nome, telha: PE.telha },
      faces: env.faces.map(function (f) { var d = fech.faces[f.id] || {}, F = fechamentoDe(d.tipo), o = copia(f); o.fechamento = { tipo: F.id, nome: F.nome, h: F.comH ? num(d.h, f.altura) : null, telha: d.telha || (F.grupoTelha ? telhaPadrao(F.grupoTelha) : null) }; return o; }),
      vento: PE.vento.semVento ? "interna" : (PE.vento.ok ? "calculado" : "nao-verificado") };
    r.naoVerificados = arr(PE.naoVerificados).slice();
    if (r.ok) {
      arr(PE.decisoes).forEach(function (d) { r.decisoes.push(d); });
      r.naoVerificados.forEach(function (x) { var t = "NÃO VERIFICADO — " + x.tema + ": " + x.motivo; if (arr(r.avisos).indexOf(t) < 0) r.avisos.unshift(t); if (arr(r.naoAbrangidos).indexOf(t) < 0) r.naoAbrangidos.unshift(t); });
    }
    r.situacao = situacao(r, r.naoVerificados);
    return r;
  }

  var AcoEnvoltorio = { ler: ler, eixos: eixos, marcaPilar: marcaPilar, prepararEntrada: prepararEntrada, completarResultado: completarResultado, FECHAMENTOS: FECHAMENTOS, COBERTURAS: COBERTURAS, fechamentoDe: fechamentoDe, coberturaDe: coberturaDe,
    fechamentoPadrao: fechamentoPadrao, casarFechamentos: casarFechamentos, chaveFace: chaveFace, telhaPadrao: telhaPadrao, telhaInfo: telhaInfo,
    vento: vento, situacao: situacao, contraventar: contraventar, ligarSoltas: ligarSoltas, cantosApoio: cantosApoio, pilaresPlanta: pilaresPlanta,
    _int: { grafoPlanta: grafoPlanta, contornoExterno: contornoExterno, simplificar: simplificar, orientacao: orientacao, letra: letra } };
  global.AcoEnvoltorio = AcoEnvoltorio;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoEnvoltorio;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimcontorno.js — CONTORNO LIVRE de laje, piso, forro e telhado (motor PURO, ES5, Node).
 *
 * Pedido do Rogério (27/10/2026): "na edição de lajes, pisos e telhados (e forro) eu preciso editar e
 * seguir o CONTORNO da edificação. A laje não vai ser só retangular: vai ter um caixote, depois vai para
 * frente, virar, ter um canto mais puxado. O mesmo no telhado: um telhado de uma água, eu delimito todo o
 * contorno e ele faz por aquele contorno. Serve para piso, para tudo."
 *
 * O QUE JÁ EXISTIA (diagnóstico): os motores aceitam polígono qualquer (laje: BimArq.lajeContorno;
 * forro: BimForro; telhado: BimTelhado por perímetro, com esqueleto reto ponderado). O que faltava era
 * ACHAR o contorno sem desenhar canto a canto e EDITAR o contorno de uma peça pronta. Aqui:
 *
 *   validar(pts)                    contorno que se cruza, < 3 pontos, aresta < 1 cm → recusa com o motivo
 *                                   e o que fazer ("problema com solução": { motivo, corrigir })
 *   contornoDeParedes(caixas, ids, { alinhar })
 *                                   "Escolher paredes": o contorno sai das faces das paredes escolhidas.
 *                                   alinhar: "externa" (laje/telhado) | "eixo" | "interna" (piso/forro:
 *                                   uma peça por ambiente)
 *   contornoDaEdificacao(caixas, { cota, alinhar })
 *                                   1 clique: o contorno externo de TODAS as paredes que delimitam
 *                                   ambiente no nível (sem mureta/divisa: BimPlanta.paredesDaEdificacao)
 *   cadeiaDeParedes(caixas, id)     "Tab": a parede e todas as que encostam nela
 *   moverVertice / inserirVertice / removerVertice / moverAresta
 *                                   EDITAR o contorno de uma peça pronta (cada uma devolve o contorno
 *                                   novo JÁ validado, ou { ok:false, motivo, corrigir })
 *   aguasContorno(pts, tipo, aresta) o atalho do telhado: "uma água (a aresta que define)", "duas águas",
 *                                   "várias águas" → o contorno com o "define inclinação" de cada aresta
 *
 * Tudo em metros, planta (x, z). O grafo da união das paredes é o do forro (BimForro.montarLacos).
 * Teste: node tools/test-contorno-livre.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function BF() { return dep("BimForro", "./bimforro.js"); }
  function BPl() { return dep("BimPlanta", "./bimplanta.js"); }

  var ARESTA_MIN = 0.01;   /* aresta menor que 1 cm = recusa */
  var ALINHAMENTOS = [{ id: "externa", rotulo: "Face externa" }, { id: "eixo", rotulo: "Eixo da parede" }, { id: "interna", rotulo: "Face interna" }];

  /* ------------------------------------------------------------ geometria básica */
  function aP(l) { return arr(l).map(function (p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p && p.x), Number(p && p.z)]; }); }
  function aO(P) { return P.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }); }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perimetro(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); } return s; }
  function dist(a, b) { return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); }
  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function noSeg(p, a, b) {
    if (Math.abs(cross(a, b, p)) > 1e-9 * Math.max(1, dist(a, b))) return false;
    return p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
  }
  /* os segmentos a-b e c-d se tocam/cruzam (inclui encostar) */
  function segsSeTocam(a, b, c, d) {
    var d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) return true;
    return noSeg(c, a, b) || noSeg(d, a, b) || noSeg(a, c, d) || noSeg(b, c, d);
  }
  function seCruza(P) {
    var n = P.length;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;   /* arestas vizinhas só dividem o vértice */
        if (segsSeTocam(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
      }
    }
    return false;
  }
  /* vizinhas colineares sobrepostas (o contorno volta por cima de si mesmo: "espinho") */
  function temEspinho(P) {
    var n = P.length;
    for (var i = 0; i < n; i++) {
      var a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
      if (Math.abs(cross(a, b, c)) < 1e-9 && ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 0) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ validar */
  /* lista: [{x,z}] ou [[x,z]]. → { ok:true, pts:[{x,z}], area, perimetro } | { ok:false, motivo, corrigir } */
  function validar(lista) {
    var P = aP(lista), i;
    if (P.some(function (q) { return !fin(q[0]) || !fin(q[1]); })) return { ok: false, motivo: "Há ponto inválido no contorno.", corrigir: "Refaça o contorno clicando os cantos na planta." };
    /* o ponto de fechamento repetido (último = primeiro) não conta */
    if (P.length > 1 && dist(P[0], P[P.length - 1]) < 1e-6) P.pop();
    if (P.length < 3) return { ok: false, motivo: "O contorno precisa de pelo menos 3 pontos (tem " + P.length + ").", corrigir: "Clique mais cantos, ou use \"Retângulo\" para a forma simples." };
    for (i = 0; i < P.length; i++) {
      var d = dist(P[i], P[(i + 1) % P.length]);
      if (d < ARESTA_MIN) return { ok: false, motivo: "A aresta " + (i + 1) + " tem " + (Math.round(d * 1000) / 10).toString().replace(".", ",") + " cm: menor que 1 cm.", corrigir: "Apague o vértice colado em outro (Editar contorno › Delete no vértice) ou clique mais longe do ponto anterior." };
    }
    if (seCruza(P) || temEspinho(P)) return { ok: false, motivo: "O contorno cruza a si mesmo.", corrigir: "Arraste o vértice que fez o cruzamento para o outro lado, ou apague-o, e feche o contorno sem atravessar as arestas." };
    var A = Math.abs(areaSinal(P));
    if (A < 0.01) return { ok: false, motivo: "O contorno não fecha área (pontos alinhados ou muito próximos).", corrigir: "Afaste os pontos: o contorno precisa de largura." };
    return { ok: true, pts: aO(P), area: A, perimetro: perimetro(P) };
  }

  /* ------------------------------------------------------------ edição do contorno */
  function refazer(P) { var v = validar(aO(P)); if (!v.ok) v.bruto = aO(P); return v; }   /* bruto: a forma como ficou, para a tela mostrar o erro */
  function moverVertice(lista, i, p) {
    var P = aP(lista); i = Math.round(num(i, -1));
    if (i < 0 || i >= P.length) return { ok: false, motivo: "Vértice inexistente.", corrigir: "Clique em um vértice do contorno." };
    var q = aP([p])[0]; if (!fin(q[0]) || !fin(q[1])) return { ok: false, motivo: "Ponto inválido.", corrigir: "Solte o vértice dentro da planta." };
    P[i] = q; return refazer(P);
  }
  /* insere um vértice na aresta `a` (a→a+1), no ponto p (projetado na aresta se `projetar`) */
  function inserirVertice(lista, a, p, projetar) {
    var P = aP(lista); a = Math.round(num(a, -1));
    if (a < 0 || a >= P.length) return { ok: false, motivo: "Aresta inexistente.", corrigir: "Clique em cima de uma aresta do contorno." };
    var A = P[a], B = P[(a + 1) % P.length], q = aP([p])[0];
    if (projetar !== false) {
      var dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((q[0] - A[0]) * dx + (q[1] - A[1]) * dz) / L2 : 0.5;
      t = Math.max(0, Math.min(1, t)); q = [A[0] + t * dx, A[1] + t * dz];
    }
    P.splice(a + 1, 0, q); return refazer(P);
  }
  function removerVertice(lista, i) {
    var P = aP(lista); i = Math.round(num(i, -1));
    if (i < 0 || i >= P.length) return { ok: false, motivo: "Vértice inexistente.", corrigir: "Clique em um vértice do contorno." };
    if (P.length <= 3) return { ok: false, motivo: "Um contorno precisa de pelo menos 3 vértices.", corrigir: "Apague a peça inteira, ou arraste os vértices." };
    P.splice(i, 1); return refazer(P);
  }
  /* reta por dois pontos → interseção de duas retas (null se paralelas) */
  function interReta(p1, d1, p2, d2) {
    var den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return null;
    var t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
  }
  /* arrasta a aresta `a` PARALELA a ela mesma até passar por p: as vizinhas esticam (ou encolhem) */
  function moverAresta(lista, a, p) {
    var P = aP(lista), n = P.length; a = Math.round(num(a, -1));
    if (a < 0 || a >= n) return { ok: false, motivo: "Aresta inexistente.", corrigir: "Clique em cima de uma aresta do contorno." };
    var i0 = a, i1 = (a + 1) % n, A = P[i0], B = P[i1], d = [B[0] - A[0], B[1] - A[1]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
    if (!(L > 1e-9)) return { ok: false, motivo: "A aresta não tem comprimento.", corrigir: "Apague um dos vértices dela." };
    var q = aP([p])[0], nv = [-d[1] / L, d[0] / L], desl = (q[0] - A[0]) * nv[0] + (q[1] - A[1]) * nv[1];
    var A2 = [A[0] + nv[0] * desl, A[1] + nv[1] * desl], B2 = [B[0] + nv[0] * desl, B[1] + nv[1] * desl];
    var ant = P[(i0 + n - 1) % n], prox = P[(i1 + 1) % n];
    /* a vizinha anterior (ant→A) e a próxima (B→prox) são esticadas até a reta nova */
    var nA = interReta(ant, [A[0] - ant[0], A[1] - ant[1]], A2, d), nB = interReta(prox, [B[0] - prox[0], B[1] - prox[1]], A2, d);
    P[i0] = nA || A2; P[i1] = nB || B2;
    return refazer(P);
  }

  /* a edição inteira em uma chamada, LEVANDO as marcas de cada aresta (d = "não define inclinação", i = % da aresta):
     a = { tipo:"mover"|"inserir"|"remover"|"aresta", i, p } */
  function editar(lista, a) {
    var r, fl = arr(lista).map(function (q) { return { d: q && q.d, i: q && q.i }; });
    if (!a) return { ok: false, motivo: "Edição vazia.", corrigir: "Arraste um vértice ou uma aresta." };
    if (a.tipo === "mover") r = moverVertice(lista, a.i, a.p);
    else if (a.tipo === "inserir") { r = inserirVertice(lista, a.i, a.p); if (r.ok || r.bruto) fl.splice(Math.round(a.i) + 1, 0, { d: fl[Math.round(a.i)].d, i: fl[Math.round(a.i)].i }); }
    else if (a.tipo === "remover") { r = removerVertice(lista, a.i); if (r.ok || r.bruto) fl.splice(Math.round(a.i), 1); }
    else if (a.tipo === "aresta") r = moverAresta(lista, a.i, a.p);
    else return { ok: false, motivo: "Edição desconhecida.", corrigir: "Arraste um vértice ou uma aresta." };
    arr(r.ok ? r.pts : r.bruto).forEach(function (q, k) { var f = fl[k]; if (!f) return; if (f.d === false) q.d = false; if (f.i != null && fin(Number(f.i))) q.i = Number(f.i); });
    return r;
  }

  /* ------------------------------------------------------------ paredes → contorno */
  function ehParede(c) { return !!c && c.tipo === "parede" && num(c.comprimento, 0) > 0.01 && num(c.espessura, 0) > 0; }
  function caixaParede(c) {
    var F = BF(); if (!F || !F.retangulo) return null;
    var R = F.retangulo(c), xs = R.map(function (q) { return q[0]; }), zs = R.map(function (q) { return q[1]; });
    return { id: c.id, c: c, rect: R, minx: Math.min.apply(null, xs), maxx: Math.max.apply(null, xs), minz: Math.min.apply(null, zs), maxz: Math.max.apply(null, zs) };
  }
  /* distância entre dois retângulos convexos (0 = encostam/sobrepõem) */
  function distRects(A, B) {
    if (A.minx > B.maxx + 0.05 || B.minx > A.maxx + 0.05 || A.minz > B.maxz + 0.05 || B.minz > A.maxz + 0.05) return 9;
    var m = 9, i, j;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
      var a = A.rect[i], b = A.rect[(i + 1) % 4], c = B.rect[j], d = B.rect[(j + 1) % 4];
      if (segsSeTocam(a, b, c, d)) return 0;
    }
    function dentroR(p, R) { for (var k = 0; k < 4; k++) if (cross(R[k], R[(k + 1) % 4], p) < -1e-9) return false; return true; }
    if (dentroR(A.rect[0], B.rect) || dentroR(B.rect[0], A.rect)) return 0;
    function dPS(p, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * dx, a[1] + t * dz]); }
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { m = Math.min(m, dPS(A.rect[i], B.rect[j], B.rect[(j + 1) % 4]), dPS(B.rect[j], A.rect[i], A.rect[(i + 1) % 4])); }
    return m;
  }

  /* o contorno que sai do grafo das paredes traz degraus de 1 mm (a ponta que avança na outra parede,
     BimForro JUNTA) e pontos no meio da reta: junta pontos a menos de 1,5 cm e tira o que está a menos de
     1,5 cm da reta dos vizinhos (parede de espessura diferente deixa degrau de 0,5 a 1 cm) — o canto de verdade (>= espessura da parede) nunca some */
  function limpar(P) {
    var TOLD = 0.015, out = P.map(function (q) { return [q[0], q[1]]; }), mudou = true, i;
    while (mudou && out.length > 3) {
      mudou = false;
      for (i = 0; i < out.length && out.length > 3; i++) {
        var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        if (dist(a, b) < TOLD || distPontoSeg(b, a, c) < TOLD) { out.splice(i, 1); mudou = true; i--; }
      }
    }
    return out;
  }
  function distPontoSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * dx, a[1] + t * dz]);
  }

  /* a análise do conjunto de paredes: as laçadas da união separadas em
     externas (a parede fica à ESQUERDA: o contorno de fora de cada bloco) e ambientes (o vazio à esquerda) */
  function analisar(caixasParede) {
    var F = BF();
    if (!F || !F.montarLacos) return { ok: false, motivo: "O motor do forro (js/bimforro.js) não carregou.", corrigir: "Recarregue o aplicativo." };
    if (!caixasParede.length) return { ok: false, motivo: "Não há paredes para o contorno.", corrigir: "Modele as paredes do nível primeiro, ou desenhe o contorno clicando os cantos." };
    var ml = F.montarLacos(caixasParede);
    if (!ml.ok) return { ok: false, motivo: ml.motivo || "As paredes não fecham um contorno.", corrigir: "Feche o contorno das paredes ou desenhe-o clicando os cantos." };
    var ext = [], amb = [];
    ml.lacos.forEach(function (l) {
      if (!(l.area > 1e-9)) return;
      var P0 = F.semColineares(l.pts), P = limpar(P0); if (P.length < 3) return;
      /* o lado de dentro se testa no meio da aresta MAIS COMPRIDA já limpa (a 1ª pode ser um degrau de 1 mm) */
      var ia = 0, la = -1, kk;
      for (kk = 0; kk < P0.length; kk++) { var dl = dist(P0[kk], P0[(kk + 1) % P0.length]); if (dl > la) { la = dl; ia = kk; } }   /* o contorno ORIGINAL do grafo: o limpo anda até 1,5 cm */
      var a = P0[ia], b = P0[(ia + 1) % P0.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 1e-9)) return;
      var M = [(a[0] + b[0]) / 2 - dz / L * 1e-4, (a[1] + b[1]) / 2 + dx / L * 1e-4];
      (ml.naUniao(M) ? ext : amb).push({ pts: P, area: Math.abs(areaSinal(P)) });
    });
    ext.sort(function (x, y) { return y.area - x.area; });
    amb.sort(function (x, y) { return y.area - x.area; });
    return { ok: true, externos: ext, ambientes: amb, curva: !!ml.temCurva };
  }

  /* o deslocamento do contorno (anti-horário) para DENTRO: d[i] na aresta i. Vértice = interseção das duas
     retas vizinhas deslocadas (esquadria); paralelas = o ponto anda pela normal. */
  function deslocarPara(P, d) {
    var n = P.length, out = [], i;
    var ln = P.map(function (a, k) {
      var b = P[(k + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L, nz = dx / L;
      return { p: [a[0] + nx * d[k], a[1] + nz * d[k]], d: [dx, dz], n: [nx, nz], dk: d[k] };
    });
    for (i = 0; i < n; i++) {
      var pr = ln[(i + n - 1) % n], at = ln[i], X = interReta(pr.p, pr.d, at.p, at.d);
      out.push(X || [P[i][0] + at.n[0] * at.dk, P[i][1] + at.n[1] * at.dk]);
    }
    return out;
  }
  /* a espessura da parede que gera a aresta (a que contém o meio da aresta, com 2 cm de folga) */
  function espessuraDaAresta(a, b, caixas) {
    var M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], melhor = null, dm = 9;
    caixas.forEach(function (w) {
      var R = w.rect, k, dd = 9;
      for (k = 0; k < 4; k++) {
        var p = R[k], q = R[(k + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((M[0] - p[0]) * dx + (M[1] - p[1]) * dz) / L2 : 0;
        t = Math.max(0, Math.min(1, t)); dd = Math.min(dd, dist(M, [p[0] + t * dx, p[1] + t * dz]));
      }
      if (dd < dm) { dm = dd; melhor = w; }
    });
    return melhor ? num(melhor.c.espessura, 0.15) : 0.15;
  }
  function alinhado(P, alinhar, caixas) {
    var A = areaSinal(P) < 0 ? P.slice().reverse() : P.slice();   /* o deslocamento supõe anti-horário */
    if (alinhar === "externa" || !alinhar) return A;
    var n = A.length, f = alinhar === "eixo" ? 0.5 : 1;
    var d = A.map(function (a, k) { return espessuraDaAresta(a, A[(k + 1) % n], caixas) * f; });
    return deslocarPara(A, d);
  }

  function filtrarParedes(caixas, o) {
    o = o || {};
    var cota = o.cota;
    return arr(caixas).filter(function (c) {
      if (!ehParede(c) || c.delimitaAmbiente === false) return false;
      if (o.nivelId != null && c.nivelId != null && String(c.nivelId) !== String(o.nivelId)) return false;
      if (fin(cota)) {
        var y0 = num(c.cy, 0) - num(c.altura, 0) / 2, y1 = num(c.cy, 0) + num(c.altura, 0) / 2;
        if (!(y0 <= cota + 0.05 && y1 >= cota - 0.05)) return false;
      }
      return true;
    });
  }

  function resultado(lista, alinhar, caixas, extra) {
    var cont = lista.map(function (P) {
      var v = validar(aO(P.map(function (q) { return [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]; })));
      return v.ok ? { pts: v.pts, area: v.area, perimetro: v.perimetro } : null;
    }).filter(Boolean);
    if (!cont.length) return { ok: false, motivo: "O contorno achado nas paredes não é válido.", corrigir: "Confira se as paredes fecham sem se cruzar, ou desenhe o contorno clicando os cantos." };
    var r = { ok: true, alinhar: alinhar, contornos: cont, contorno: cont[0].pts };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  /* "Escolher paredes": ids das paredes (a escolha do usuário). */
  function contornoDeParedes(caixas, ids, o) {
    o = o || {};
    var alinhar = o.alinhar || "externa", set = {};
    arr(ids).forEach(function (x) { set[String(x)] = 1; });
    var esc = arr(caixas).filter(function (c) { return ehParede(c) && set[String(c.id)]; }).map(caixaParede).filter(Boolean);
    if (!esc.length) return { ok: false, motivo: "Nenhuma parede escolhida.", corrigir: "Clique nas paredes (Tab pega a cadeia) e confirme com Enter." };
    var an = analisar(esc.map(function (w) { return w.c; }));
    if (!an.ok) return an;
    if (!an.ambientes.length && !an.externos.length) return { ok: false, motivo: "As paredes escolhidas não formam contorno.", corrigir: "Escolha as paredes que fecham o recinto." };
    if (!an.ambientes.length) return { ok: false, motivo: "As paredes escolhidas não fecham um contorno (a cadeia está aberta).", corrigir: "Escolha também as paredes que faltam para fechar, ou use \"Desenhar contorno\"." };
    if (alinhar === "interna" && (o.porAmbiente !== false || an.ambientes.length === 1)) {
      var L = an.ambientes.map(function (a) { return a.pts; });
      return resultado(L, alinhar, esc, { paredes: esc.length });
    }
    /* externa / eixo: o contorno de fora do bloco escolhido */
    return resultado([alinhado(an.externos[0].pts, alinhar, esc)], alinhar, esc, { paredes: esc.length });
  }

  /* "Contorno da edificação" (1 clique). Piso/forro (alinhar "interna"): um contorno por ambiente. */
  function contornoDaEdificacao(caixas, o) {
    o = o || {};
    var alinhar = o.alinhar || "externa";
    var base = filtrarParedes(caixas, o).map(caixaParede).filter(Boolean);
    if (!base.length) return { ok: false, motivo: "Não há paredes que delimitam ambiente neste nível.", corrigir: "Modele as paredes do nível, ou desenhe o contorno clicando os cantos." };
    var an = analisar(base.map(function (w) { return w.c; }));
    if (!an.ok) return an;
    var usadas = base, ignoradas = 0, BP = BPl();
    /* a mureta e a divisa saem: só fica parede a até 0,30 m de um ambiente (o filtro da planta baixa) */
    if (an.ambientes.length && BP && BP.paredesDaEdificacao) {
      var ed = BP.paredesDaEdificacao(base.map(function (w) { return { id: w.id, minx: w.minx, maxx: w.maxx, minz: w.minz, maxz: w.maxz }; }), an.ambientes.map(function (a) { return { pts: aO(a.pts) }; }), 0.3);
      var ok = {}; ed.paredes.forEach(function (p) { ok[String(p.id)] = 1; });
      /* o filtro da planta olha a distância ao ambiente; a parede da fachada de um ambiente aberto (varanda,
         sala sem fechar) ficaria de fora. Por isso o filtro só SEMEIA: entra também toda parede que ENCOSTA numa
         parede aprovada (a cadeia da edificação). A mureta solta e a divisa não encostam em nada */
      var fila = base.filter(function (w) { return ok[String(w.id)]; });
      var visto = {}; fila.forEach(function (w) { visto[String(w.id)] = 1; });
      for (var qi = 0; qi < fila.length; qi++) {
        base.forEach(function (o2) { if (!visto[String(o2.id)] && distRects(fila[qi], o2) <= 0.02) { visto[String(o2.id)] = 1; fila.push(o2); } });
      }
      usadas = base.filter(function (w) { return visto[String(w.id)]; });
      ignoradas = base.length - usadas.length;
      if (ignoradas && usadas.length) { var an2 = analisar(usadas.map(function (w) { return w.c; })); if (an2.ok) an = an2; }
    }
    if (!an.externos.length) return { ok: false, motivo: "Não achei o contorno externo das paredes.", corrigir: "Desenhe o contorno clicando os cantos." };
    var extra = { paredes: usadas.length, ignoradas: ignoradas, ambientes: an.ambientes.length };
    if (alinhar === "interna" && o.porAmbiente !== false) {
      if (!an.ambientes.length) return { ok: false, motivo: "Não há ambiente fechado por paredes.", corrigir: "Feche as paredes dos ambientes, ou escolha \"Face externa\"." };
      /* os ambientes DENTRO do bloco externo (o miolo de um pátio fica de fora) */
      return resultado(an.ambientes.map(function (a) { return a.pts; }), alinhar, usadas, extra);
    }
    return resultado([alinhado(an.externos[0].pts, alinhar, usadas)], alinhar, usadas, extra);
  }

  /* "Tab": a parede e todas as que encostam nela (cadeia conectada, 2 cm de folga) */
  function cadeiaDeParedes(caixas, id) {
    var W = arr(caixas).filter(ehParede).map(caixaParede).filter(Boolean), mapa = {}, vistos = {}, fila = [];
    W.forEach(function (w) { mapa[String(w.id)] = w; });
    if (!mapa[String(id)]) return [];
    fila.push(mapa[String(id)]); vistos[String(id)] = 1;
    while (fila.length) {
      var w = fila.shift();
      W.forEach(function (o) { if (!vistos[String(o.id)] && distRects(w, o) <= 0.02) { vistos[String(o.id)] = 1; fila.push(o); } });
    }
    return Object.keys(vistos);
  }

  /* ------------------------------------------------------------ águas do telhado */
  /* tipo: "uma" | "duas" | "varias". `aresta` (uma água): o índice da aresta que define a inclinação (a que
     fica no beiral, de onde o plano sobe); sem ela vale a mais comprida. Devolve o contorno com `d:false`
     nas arestas que NÃO definem (oitão). */
  function aguasContorno(lista, tipo, aresta) {
    var P = aP(lista), n = P.length, C = aO(P);
    if (n < 3) return C;
    var L = P.map(function (a, k) { return dist(a, P[(k + 1) % n]); }), maxI = 0, k;
    for (k = 1; k < n; k++) if (L[k] > L[maxI] + 1e-9) maxI = k;
    var def = {};
    if (tipo === "uma") def[fin(aresta) && aresta >= 0 && aresta < n ? Math.round(aresta) : maxI] = 1;
    else if (tipo === "duas") {
      def[maxI] = 1;
      var dm = [P[(maxI + 1) % n][0] - P[maxI][0], P[(maxI + 1) % n][1] - P[maxI][1]], best = -1, bl = -1;
      for (k = 0; k < n; k++) {
        if (k === maxI) continue;
        var dk = [P[(k + 1) % n][0] - P[k][0], P[(k + 1) % n][1] - P[k][1]], cos = (dm[0] * dk[0] + dm[1] * dk[1]) / (L[maxI] * L[k] || 1);
        if (cos < -0.97 && L[k] > bl) { bl = L[k]; best = k; }   /* a oposta, anti-paralela */
      }
      if (best < 0) { for (k = 0; k < n; k++) if (k !== maxI && L[k] > bl) { bl = L[k]; best = k; } }
      if (best >= 0) def[best] = 1;
    } else { for (k = 0; k < n; k++) def[k] = 1; }
    C.forEach(function (q, i) { if (!def[i]) q.d = false; });
    return C;
  }
  /* a aresta mais perto de um ponto (para o clique "esta é a que sobe") */
  function arestaMaisPerto(lista, p) {
    var P = aP(lista), q = aP([p])[0], n = P.length, best = -1, bd = 1e9;
    for (var k = 0; k < n; k++) {
      var a = P[k], b = P[(k + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      var d = dist(q, [a[0] + t * dx, a[1] + t * dz]);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function verticeMaisPerto(lista, p, raio) {
    var P = aP(lista), q = aP([p])[0], best = -1, bd = raio == null ? 1e9 : raio;
    P.forEach(function (a, k) { var d = dist(a, q); if (d <= bd) { bd = d; best = k; } });
    return best;
  }

  var BimContorno = {
    ALINHAMENTOS: ALINHAMENTOS, ARESTA_MIN: ARESTA_MIN, _analisar: analisar, _caixaParede: caixaParede,
    validar: validar, areaSinal: areaSinal, perimetro: perimetro,
    editar: editar, moverVertice: moverVertice, inserirVertice: inserirVertice, removerVertice: removerVertice, moverAresta: moverAresta,
    contornoDeParedes: contornoDeParedes, contornoDaEdificacao: contornoDaEdificacao, cadeiaDeParedes: cadeiaDeParedes,
    aguasContorno: aguasContorno, arestaMaisPerto: arestaMaisPerto, verticeMaisPerto: verticeMaisPerto,
    /* o alinhamento padrão de cada peça: laje e telhado pela face externa; piso e forro pela interna */
    alinharPadrao: function (peca) { return peca === "piso" || peca === "forro" ? "interna" : "externa"; }
  };

  global.BimContorno = BimContorno;
  if (typeof module !== "undefined" && module.exports) module.exports = BimContorno;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

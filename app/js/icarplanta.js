/* =====================================================================
 * icarplanta.js — A PLANTA DO PROJETO NO 3D E O AGENTE DA VOLUMETRIA (ESPEC-ICAMENTO-CENARIO.md §II.6).
 * Motor PURO (ES5, testável em Node). Quem lê o arquivo é o js/dxf.js (DXF em metros) ou o js/pdfvetor.js (traços do PDF);
 * quem desenha é o js/bim.js; quem orquestra é o gestao.js.
 *
 * 1. CALIBRAÇÃO por semelhança de 2 pontos: planta p1, p2 → modelo q1, q2 dá escala s, rotação r e translação t
 *    (q = s·R(r)·p + t). Ou 2 pontos + distância conhecida (rotação 0: norte da planta = norte do modelo). Um 3º ponto dá o
 *    RESÍDUO em metros — a calibração diz quanto erra, não jura que acertou.
 *    ⚠ Pontos da planta com y PARA CIMA: imagem (linha cresce para baixo) entra como (coluna, −linha). Semelhança não espelha.
 * 2. AGENTE DA VOLUMETRIA: segmentos (metros) + textos → propostas de EDIFICAÇÃO, MURO, ÁGUA e LOTE, com altura lida do texto
 *    ("2 PAV", "TÉRREO + 1", "H=9,00", "+6,00") ou PADRÃO marcada como estimada. Grafo plano: pontas a menos de 2 cm viram o
 *    mesmo nó, traços se dividem nos cruzamentos, pontas soltas são aparadas e cada grupo ligado dá o seu CONTORNO EXTERNO
 *    (paredes internas não viram prédios separados).
 * ⚠ Proposta é proposta: a tela mostra em laranja e a pessoa aceita, ajusta a altura ou descarta. Nunca vira peça do IFC.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = {
    tol_m: 0.02,             // pontas a menos disso são o mesmo ponto (ESPEC §II.6.4 — 2 cm na escala real)
    areaMinEdif_m2: 6,       // menor que isso não é edificação (mobiliário, pilar, caixa)
    areaMaxEdif_m2: 5000,    // maior que isso é lote/quadra
    muroEspMin_m: 0.08,      // faixa estreita = muro (ESPEC: 0,10–0,30 m; folga de 2 cm para o traço de projeto)
    muroEspMax_m: 0.32,
    muroCompMin_m: 2.0,
    alturaPav_m: 3.0,        // premissa: 1 pavimento = 3,00 m
    alturaPadrao_m: 3.0,     // edificação sem texto de altura (ESTIMADA)
    alturaMuroPadrao_m: 2.0, // muro sem texto de altura (ESTIMADA)
    distTexto_m: 3.0         // texto até essa distância do contorno ainda é do polígono (rótulo fora do desenho)
  };
  function prem(p) { var o = {}, k; for (k in PREMISSAS) o[k] = PREMISSAS[k]; if (p) for (k in p) if (p[k] != null && p[k] !== "") o[k] = +p[k]; return o; }
  function br(v, c) { var x = +v; if (!isFinite(x)) return "—"; var f = Math.pow(10, c == null ? 2 : c); return String(Math.round(x * f) / f).replace(".", ","); }

  /* ======================= CALIBRAÇÃO ======================= */
  function calibrar2(p1, p2, q1, q2) {
    var dpx = p2.x - p1.x, dpy = p2.y - p1.y, dqx = q2.x - q1.x, dqy = q2.y - q1.y;
    var lp = Math.sqrt(dpx * dpx + dpy * dpy), lq = Math.sqrt(dqx * dqx + dqy * dqy);
    if (!(lp > 1e-9) || !(lq > 1e-9)) return { ok: false, motivo: "os dois pontos estão juntos — use pontos afastados" };
    var s = lq / lp, r = Math.atan2(dqy, dqx) - Math.atan2(dpy, dpx), c = Math.cos(r), sn = Math.sin(r);
    var t = { x: q1.x - s * (c * p1.x - sn * p1.y), y: q1.y - s * (sn * p1.x + c * p1.y) };
    return { ok: true, s: s, r: r, rGraus: r * 180 / Math.PI, t: t };
  }
  /* escala pela distância conhecida; rotação 0; p1 cai em q1 (ou na origem) */
  function calibrarDist(p1, p2, metros, q1) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y, l = Math.sqrt(dx * dx + dy * dy);
    if (!(l > 1e-9)) return { ok: false, motivo: "os dois pontos estão juntos — use pontos afastados" };
    if (!(+metros > 0)) return { ok: false, motivo: "informe a distância real entre os dois pontos, em metros" };
    var s = +metros / l, q = q1 || { x: 0, y: 0 };
    return { ok: true, s: s, r: 0, rGraus: 0, t: { x: q.x - s * p1.x, y: q.y - s * p1.y } };
  }
  function aplicar(cal, p) { var c = Math.cos(cal.r), sn = Math.sin(cal.r); return { x: cal.s * (c * p.x - sn * p.y) + cal.t.x, y: cal.s * (sn * p.x + c * p.y) + cal.t.y }; }
  function inverter(cal, q) { var c = Math.cos(cal.r), sn = Math.sin(cal.r), x = (q.x - cal.t.x) / cal.s, y = (q.y - cal.t.y) / cal.s; return { x: c * x + sn * y, y: -sn * x + c * y }; }
  function residuo(cal, p3, q3) { var q = aplicar(cal, p3), dx = q.x - q3.x, dy = q.y - q3.y; return Math.sqrt(dx * dx + dy * dy); }

  /* ======================= GEOMETRIA ======================= */
  function area(pol) { var a = 0; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) a += (pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1]); return a / 2; }
  function perimetro(pol) { var p = 0; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) { var dx = pol[i][0] - pol[j][0], dy = pol[i][1] - pol[j][1]; p += Math.sqrt(dx * dx + dy * dy); } return p; }
  function dentro(pt, pol) {
    var d = false;
    for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var xi = pol[i][0], yi = pol[i][1], xj = pol[j][0], yj = pol[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi)) d = !d;
    }
    return d;
  }
  function distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t; var x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
  }
  function distPol(pt, pol) { var m = Infinity; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) m = Math.min(m, distSeg(pt[0], pt[1], pol[j][0], pol[j][1], pol[i][0], pol[i][1])); return m; }

  /* ======================= GRAFO PLANO ======================= */
  /* segmentos [{x1,y1,x2,y2}] → { nos:[[x,y]], arestas:[[a,b]] } com pontas fundidas, cruzamentos divididos e sem duplicata */
  function grafo(segs, tol) {
    var cel = Math.max(tol * 4, 0.5), grade = {}, S = [];
    (segs || []).forEach(function (s) {
      var x1 = +s.x1, y1 = +s.y1, x2 = +s.x2, y2 = +s.y2;
      if (!isFinite(x1 + y1 + x2 + y2)) return;
      if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < tol) return;
      S.push({ a: [x1, y1], b: [x2, y2], cortes: [0, 1] });
    });
    /* grade de segmentos por caixa: só os vizinhos se testam */
    var CEL = 2;
    S.forEach(function (s, k) {
      var i0 = Math.floor(Math.min(s.a[0], s.b[0]) / CEL), i1 = Math.floor(Math.max(s.a[0], s.b[0]) / CEL);
      var j0 = Math.floor(Math.min(s.a[1], s.b[1]) / CEL), j1 = Math.floor(Math.max(s.a[1], s.b[1]) / CEL);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var kk = i + "|" + j; (grade[kk] || (grade[kk] = [])).push(k); }
    });
    var visto = {};
    Object.keys(grade).forEach(function (kk) {
      var L = grade[kk];
      for (var m = 0; m < L.length; m++) for (var n = m + 1; n < L.length; n++) {
        var a = L[m], b = L[n], par = a < b ? a + "|" + b : b + "|" + a; if (visto[par]) continue; visto[par] = 1;
        cortar(S[a], S[b], tol);
      }
    });
    /* nós fundidos por proximidade (grade de tol) */
    var nos = [], gn = {};
    function no(x, y) {
      var i = Math.floor(x / cel), j = Math.floor(y / cel);
      for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) {
        var l = gn[(i + di) + "|" + (j + dj)]; if (!l) continue;
        for (var q = 0; q < l.length; q++) { var nn = nos[l[q]]; if (Math.abs(nn[0] - x) <= tol && Math.abs(nn[1] - y) <= tol) return l[q]; }
      }
      nos.push([x, y]); (gn[i + "|" + j] || (gn[i + "|" + j] = [])).push(nos.length - 1); return nos.length - 1;
    }
    var arestas = [], ja = {};
    S.forEach(function (s) {
      var ts = s.cortes.slice().sort(function (u, v) { return u - v; }), ant = null;
      ts.forEach(function (t) {
        var id = no(s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t);
        if (ant != null && ant !== id) { var key = ant < id ? ant + "|" + id : id + "|" + ant; if (!ja[key]) { ja[key] = 1; arestas.push([ant, id]); } }
        ant = id;
      });
    });
    return { nos: nos, arestas: arestas };
  }
  /* marca em s e em u os parâmetros onde um corta o outro (cruzamento próprio) ou onde a ponta de um encosta no outro */
  function cortar(s, u, tol) {
    var rx = s.b[0] - s.a[0], ry = s.b[1] - s.a[1], qx = u.b[0] - u.a[0], qy = u.b[1] - u.a[1];
    var den = rx * qy - ry * qx, ls = Math.sqrt(rx * rx + ry * ry), lu = Math.sqrt(qx * qx + qy * qy);
    if (Math.abs(den) > 1e-12) {
      var wx = u.a[0] - s.a[0], wy = u.a[1] - s.a[1], t = (wx * qy - wy * qx) / den, v = (wx * ry - wy * rx) / den;
      var ets = tol / ls, etu = tol / lu;
      if (t > -ets && t < 1 + ets && v > -etu && v < 1 + etu) { s.cortes.push(Math.max(0, Math.min(1, t))); u.cortes.push(Math.max(0, Math.min(1, v))); }
    }
    /* ponta encostada no meio do outro (T, ou trecho colinear sobreposto) */
    [[s, u], [u, s]].forEach(function (pq) {
      var A = pq[0], B = pq[1], bx = B.b[0] - B.a[0], by = B.b[1] - B.a[1], L2 = bx * bx + by * by;
      [A.a, A.b].forEach(function (pt) {
        var tt = ((pt[0] - B.a[0]) * bx + (pt[1] - B.a[1]) * by) / L2;
        if (tt <= 0 || tt >= 1) return;
        if (distSeg(pt[0], pt[1], B.a[0], B.a[1], B.b[0], B.b[1]) <= tol) B.cortes.push(tt);
      });
    });
  }
  /* apara as pontas soltas (nó de grau 1, repetido): porta, cota, linha de chamada não fecham nada */
  function aparar(g) {
    var viz = g.nos.map(function () { return []; }), vivas = g.arestas.map(function () { return true; });
    g.arestas.forEach(function (e, k) { viz[e[0]].push(k); viz[e[1]].push(k); });
    var grau = viz.map(function (l) { return l.length; }), fila = [];
    grau.forEach(function (d, i) { if (d === 1) fila.push(i); });
    while (fila.length) {
      var n = fila.pop();
      viz[n].forEach(function (k) {
        if (!vivas[k]) return; vivas[k] = false;
        var e = g.arestas[k], o = e[0] === n ? e[1] : e[0];
        grau[n]--; grau[o]--; if (grau[o] === 1) fila.push(o);
      });
    }
    var soltas = g.arestas.filter(function (e, k) { return !vivas[k]; });
    return { nos: g.nos, arestas: g.arestas.filter(function (e, k) { return vivas[k]; }), soltas: soltas };
  }
  /* faces: para cada aresta orientada u→v, a próxima é v→w com w o vizinho de v logo DEPOIS de u no sentido horário.
     Face com área positiva = região limitada; NEGATIVA = o contorno externo de um grupo ligado (é esse que vira volume). */
  function contornos(g) {
    var adj = g.nos.map(function () { return []; });
    g.arestas.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    adj.forEach(function (l, i) {
      var p = g.nos[i];
      l.sort(function (a, b) { return Math.atan2(g.nos[a][1] - p[1], g.nos[a][0] - p[0]) - Math.atan2(g.nos[b][1] - p[1], g.nos[b][0] - p[0]); });
    });
    var usado = {}, externos = [], internos = 0;
    g.arestas.forEach(function (e) {
      [[e[0], e[1]], [e[1], e[0]]].forEach(function (d) {
        if (usado[d[0] + ">" + d[1]]) return;
        var u = d[0], v = d[1], pol = [], guarda = 0;
        while (!usado[u + ">" + v] && guarda++ < 100000) {
          usado[u + ">" + v] = 1; pol.push(g.nos[u].slice());
          var l = adj[v], k = l.indexOf(u), w = l[(k - 1 + l.length) % l.length];   // o anterior no anti-horário = o próximo no horário
          u = v; v = w;
        }
        var A = area(pol);
        if (A < -1e-9) externos.push(pol.reverse()); else if (A > 1e-9) internos++;
      });
    });
    return { externos: externos, internos: internos };
  }

  /* ======================= ALTURA PELO TEXTO ======================= */
  function num(s) { return +String(s).replace(/\./g, "").replace(",", "."); }
  function numDec(s) { return +String(s).replace(",", "."); }
  /* "H=9,00" > "+6,00" > "TÉRREO + 1" > "2 PAV" > "TÉRREO"; devolve { altura, regra, txt } ou null */
  function alturaDoTexto(txt, pp) {
    var t = String(txt || "").toUpperCase().replace(/\s+/g, " ").trim(), m;
    if ((m = /\bH\s*=\s*(\d+(?:[.,]\d+)?)/.exec(t))) return { altura: numDec(m[1]), regra: "H=", txt: txt };
    if ((m = /(?:^|\s)\+\s*(\d+[.,]\d+)\b/.exec(t))) return { altura: numDec(m[1]), regra: "cota", txt: txt };
    if ((m = /T[ÉE]RREO\s*\+\s*(\d+)/.exec(t))) return { altura: (+m[1] + 1) * pp.alturaPav_m, regra: "térreo + n", txt: txt };
    if ((m = /\b(\d+)\s*(?:PAVTOS?|PAVIMENTOS?|PAVS?|PVTOS?)\b/.exec(t))) return { altura: +m[1] * pp.alturaPav_m, regra: "n pav", txt: txt };
    if (/\bT[ÉE]RREO\b/.test(t)) return { altura: pp.alturaPav_m, regra: "térreo", txt: txt };
    return null;
  }
  var AGUA = /\b(LAGO|LAGOA|RIO|[ÁA]GUA|PISCINA|REPRESA|C[ÓO]RREGO|A[ÇC]UDE)\b/;

  /* ======================= O AGENTE ======================= */
  /* ent = { segmentos (m), textos [{txt, x, y}] (m), origem: "dxf" | "pdf p.1", premissas } → { propostas, descartes, conta } */
  function volumetria(ent, opts) {
    opts = opts || {};
    var pp = prem(ent && ent.premissas), t0 = Date.now();
    var g0 = grafo((ent && ent.segmentos) || [], pp.tol_m), g = aparar(g0), cs = contornos(g);
    var textos = ((ent && ent.textos) || []).filter(function (x) { return x && x.txt != null && isFinite(+x.x) && isFinite(+x.y); });
    var propostas = [], descartes = { pequenos: 0, soltas: g.soltas.length };
    /* cada texto pertence ao MENOR contorno que o contém: o "LAGO" está dentro do lago E do lote, e é do lago */
    var areas = cs.externos.map(function (pol) { return Math.abs(area(pol)); }), dono = textos.map(function (x) {
      var melhor = -1; cs.externos.forEach(function (pol, k) { if (dentro([+x.x, +x.y], pol) && (melhor < 0 || areas[k] < areas[melhor])) melhor = k; }); return melhor;
    });
    cs.externos.forEach(function (pol, kp) {
      var A = areas[kp], P = perimetro(pol), meio = P / 2, disc = meio * meio - 4 * A;
      /* espessura e comprimento da faixa: as raízes de x² − (P/2)·x + A = 0 (retângulo L × e: L + e = P/2, L·e = A) — o 2A/P
         erra nas pontas (0,149 numa faixa de 0,15 × 15 m) */
      var esp = disc >= 0 ? (meio - Math.sqrt(disc)) / 2 : (P > 0 ? 2 * A / P : 0), comp = meio - esp;
      /* textos do polígono: os de dentro (que não são de um contorno menor); senão o mais perto até distTexto_m */
      var dentroT = textos.filter(function (x, k) { return dono[k] === kp; });
      var pertoT = dentroT.length ? dentroT : textos.map(function (x) { return { x: x, d: distPol([+x.x, +x.y], pol) }; }).filter(function (o) { return o.d <= pp.distTexto_m; })
        .sort(function (a, b) { return a.d - b.d; }).map(function (o) { return o.x; });
      var tipo = null, motivos = [];
      if (esp >= pp.muroEspMin_m && esp <= pp.muroEspMax_m && comp >= pp.muroCompMin_m) { tipo = "muro"; motivos.push("faixa de " + br(esp, 2) + " m × " + br(comp, 1) + " m"); }
      else if (A < pp.areaMinEdif_m2) { descartes.pequenos++; return; }
      else if (pertoT.some(function (x) { return AGUA.test(String(x.txt).toUpperCase()); })) { tipo = "agua"; motivos.push("texto \"" + pertoT.filter(function (x) { return AGUA.test(String(x.txt).toUpperCase()); })[0].txt + "\""); }
      else if (A > pp.areaMaxEdif_m2) { tipo = "lote"; motivos.push("área de " + br(A, 0) + " m² (maior que " + br(pp.areaMaxEdif_m2, 0) + " m²: lote ou quadra)"); }
      else { tipo = "edificacao"; motivos.push("contorno fechado de " + br(A, 1) + " m²"); }
      var alt = null, estimada = false, conf;
      if (tipo === "edificacao" || tipo === "muro") {
        for (var i = 0; i < pertoT.length && !alt; i++) alt = alturaDoTexto(pertoT[i].txt, pp);
        if (alt) motivos.push("texto \"" + alt.txt + "\" (" + alt.regra + ") → " + br(alt.altura, 2) + " m");
        else { estimada = true; motivos.push("sem texto de altura: " + br(tipo === "muro" ? pp.alturaMuroPadrao_m : pp.alturaPadrao_m, 2) + " m (premissa, ESTIMADA)"); }
      }
      conf = tipo === "edificacao" ? (alt ? 0.9 : 0.5) : tipo === "muro" ? (alt ? 0.85 : 0.7) : tipo === "agua" ? 0.8 : 0.6;
      propostas.push({ tipo: tipo, poligono: pol, area: Math.round(A * 100) / 100, espessura: tipo === "muro" ? Math.round(esp * 1000) / 1000 : null,
        altura: tipo === "edificacao" || tipo === "muro" ? (alt ? alt.altura : (tipo === "muro" ? pp.alturaMuroPadrao_m : pp.alturaPadrao_m)) : null,
        alturaEstimada: estimada, origem: (ent && ent.origem) || "", confianca: conf, motivos: motivos });
    });
    var ordem = { edificacao: 0, muro: 1, agua: 2, lote: 3 };
    propostas.sort(function (a, b) { return (ordem[a.tipo] - ordem[b.tipo]) || (b.area - a.area); });
    var conta = { segmentos: ((ent && ent.segmentos) || []).length, nos: g0.nos.length, arestas: g0.arestas.length, aparadas: g.soltas.length, contornos: cs.externos.length, regioes: cs.internos, ms: Date.now() - t0 };
    var por = {}; propostas.forEach(function (p) { por[p.tipo] = (por[p.tipo] || 0) + 1; });
    return { ok: true, propostas: propostas, porTipo: por, descartes: descartes, conta: conta, premissas: pp };
  }

  var IcarPlanta = { PREMISSAS: PREMISSAS, calibrar2: calibrar2, calibrarDist: calibrarDist, aplicar: aplicar, inverter: inverter, residuo: residuo,
    area: area, grafo: grafo, aparar: aparar, contornos: contornos, alturaDoTexto: function (t, p) { return alturaDoTexto(t, prem(p)); }, volumetria: volumetria };
  global.IcarPlanta = IcarPlanta;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarPlanta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimdesenho.js — o painel DESENHAR do modelador, motor PURO (ES5).
 *
 * Pedido do Rogério (09/10/2026): "tem que ter a opção de criar a parede
 * curva, aquele comando onde você seleciona o tipo de forma — retângulo,
 * polígono, triângulo —, a opção de criar uma curva por três pontos". O
 * painel completo de desenho de um modelador BIM: linha, retângulo,
 * polígono inscrito e circunscrito (3 lados = triângulo), círculo, arco
 * por três pontos, arco por centro e pontas, arco tangente, arco de
 * concordância, elipse, elipse parcial, spline, selecionar linhas e
 * selecionar paredes; com deslocamento, raio (cantos arredondados),
 * encadear e número de lados.
 *
 * Este arquivo só faz GEOMETRIA (Node-testável, sem DOM, sem three.js):
 * quem clica e mostra a barra de opções é a tela (outra frente), que
 * consome o contrato abaixo. Quem transforma o resultado em peça (parede
 * reta, parede curva — js/bimcurva.js —, laje por contorno…) é o motor
 * da peça.
 *
 * CONTRATO
 *   BimDesenho.ferramentas(alvo) → [{ id, rotulo, icone, dica, pontos,
 *       opcoes: [nomes das opções que a barra mostra], requer? }]
 *     alvo: "parede" | "laje" | "forro" | "telhado" | "furo" | "viga" |
 *           "guarda" | "separador" | "linhaDetalhe" | "regiao" | "eixo"
 *     (arco só onde a peça GUARDA arco: parede, laje, forro, guarda-corpo,
 *     viga retangular, linha de detalhe e região; telhado, furo, separador
 *     e eixo ficam com os trechos retos e sem a opção Raio)
 *     pontos: quantos cliques a ferramenta pede (número) ou "livre"
 *     requer: "anterior" (arco tangente: o trecho anterior), "segmentos"
 *             (concordância: os dois trechos), "linhas" (selecionar)
 *   BimDesenho.gerar(id, pontos, opcoes) → { ok: true, segmentos, fechado,
 *       forma?, substitui? }  |  { ok: false, motivo }
 *   BimDesenho.previa(id, pontosParciais, cursor, opcoes) → o mesmo, mais
 *       provisorio: true quando faltam cliques (linha-guia até o cursor)
 *   segmentos: [{ tipo: "reta", a, b } | { tipo: "arco", a, b, m }]
 *       pontos { x, z } em metros (o plano da planta do modelo); m = o
 *       PONTO MÉDIO do arco (sempre o meio, mesmo que o clique tenha sido
 *       outro ponto do arco).
 *   Da forma para a peça: BimDesenho.paredesDe(segmentos, cfg) → as caixas
 *   (reta: BimEdit.parede; arco: BimEdit.paredeCurva); paraContorno(segs)
 *   → [{x, z, m?}] (laje, forro, região); paraCaminho(segs, y) → o caminho
 *   do guarda-corpo.
 *   opcoes: { deslocamento (m), raio (m), encadear (bool), lados (3..64),
 *             sentido (1 | -1, só no arco por centro de 180°), tolCorda (m,
 *             elipse/spline), anterior (segmento), segmentos ([s1, s2]),
 *             linhas ([segmento + fonte]), tolerancia (m, selecionar),
 *             linhaCentral (bool, selecionar paredes) }
 *
 * CONVENÇÕES (as de js/bimarq.js)
 *   · Formas FECHADAS saem anti-horárias no plano (x, z) do modelo — na
 *     planta vista de cima (z para baixo na tela) isso é o sentido HORÁRIO:
 *     a face "fora" da parede (w < 0, à direita do sentido no plano x, z)
 *     fica do lado de fora do retângulo/polígono/círculo.
 *   · deslocamento > 0: na forma FECHADA, para fora (cresce); na ABERTA,
 *     para o lado +w (a esquerda de quem anda, no plano x, z).
 *   · Círculo = dois arcos de 180° (um arco só não fecha em si mesmo).
 *   · Elipse e spline viram trechos RETOS pela tolerância de corda (padrão
 *     2 mm) — só existem para linha de detalhe e região; a forma exata vai
 *     em `forma` para quem desenha. Não são oferecidas para parede.
 *   · Caso degenerado (três pontos alinhados, raio maior que o lado, dois
 *     cliques no mesmo lugar) devolve { ok: false, motivo } — nunca uma
 *     geometria inventada.
 *
 * Teste: node tools/test-bimdesenho.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL = 1e-9, TOL_PT = 1e-6, DOIS_PI = 2 * Math.PI;
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  /* ponto em qualquer forma ({x,z} ou [x,z]) → [x, z] */
  function P(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function O(q) { return { x: q[0], z: q[1] }; }
  function ok2(q) { return fin(q[0]) && fin(q[1]); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function dist(a, b) { return len(sub(a, b)); }
  function unit(a) { var l = len(a); return l > TOL ? [a[0] / l, a[1] / l] : null; }
  /* a esquerda de quem anda na direção d (plano x, z) = o lado +w */
  function esq(d) { return [-d[1], d[0]]; }
  function ang(v) { return Math.atan2(v[1], v[0]); }
  function polar(c, r, t) { return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; }
  /* ângulo em [0, 2π) */
  function mod2pi(t) { t = t % DOIS_PI; return t < 0 ? t + DOIS_PI : t; }
  function cm(v) { return String(Math.round(v * 1000) / 10).replace(".", ","); }
  function m2(v) { return String(Math.round(v * 1000) / 1000).replace(".", ","); }
  function erro(motivo) { return { ok: false, motivo: motivo }; }

  /* ============================================================ ARCO
   * O arco pelos pontos a (início), b (fim) e m (qualquer ponto dele):
   * { ok, c (centro), r, a0 (ângulo de a), s (varredura COM SINAL: > 0 =
   * anti-horário no plano x, z), L (comprimento), meio (o ponto médio) }. */
  function arco(a0, b0, m0) {
    var a = P(a0), b = P(b0), m = P(m0);
    if (!ok2(a) || !ok2(b) || !ok2(m)) return erro("Há ponto inválido no arco.");
    if (dist(a, b) < TOL_PT) return erro("O início e o fim do arco estão no mesmo ponto.");
    if (dist(a, m) < TOL_PT || dist(b, m) < TOL_PT) return erro("O ponto do arco coincide com uma das pontas.");
    var ab = sub(b, a), am = sub(m, a), cr = cross(ab, am);
    /* alinhados: a flecha (a distância de m à reta ab) abaixo de 1e-9 da corda */
    if (Math.abs(cr) / len(ab) < 1e-9 * Math.max(1, len(ab))) return erro("Os três pontos estão alinhados: não há arco por eles (o raio seria infinito). Use a linha.");
    /* centro: o circuncentro */
    var d = 2 * cr, a2 = dot(ab, ab), m2_ = dot(am, am);
    var c = [a[0] + (am[1] * a2 - ab[1] * m2_) / d, a[1] + (ab[0] * m2_ - am[0] * a2) / d];
    var r = dist(c, a), ta = ang(sub(a, c)), tb = ang(sub(b, c)), tm = ang(sub(m, c));
    var sCCW = mod2pi(tb - ta), dm = mod2pi(tm - ta);
    if (sCCW < TOL) sCCW = DOIS_PI;
    var s = dm < sCCW ? sCCW : sCCW - DOIS_PI;
    return { ok: true, c: c, r: r, a0: ta, s: s, L: r * Math.abs(s), meio: polar(c, r, ta + s / 2) };
  }
  /* arco pelo centro, raio, ângulo inicial e varredura */
  function arcoCentroSeg(c, r, t0, s) {
    return { tipo: "arco", a: O(polar(c, r, t0)), b: O(polar(c, r, t0 + s)), m: O(polar(c, r, t0 + s / 2)) };
  }
  function reta(a, b) { return { tipo: "reta", a: O(P(a)), b: O(P(b)) }; }
  /* o arco de um segmento (null se reta ou degenerado) */
  function infoSeg(sg) { return sg && sg.tipo === "arco" ? arco(sg.a, sg.b, sg.m) : null; }
  function comprimento(sg) {
    if (!sg) return 0;
    if (sg.tipo === "arco") { var i = infoSeg(sg); return i.ok ? i.L : dist(P(sg.a), P(sg.b)); }
    return dist(P(sg.a), P(sg.b));
  }
  /* ÁREA EXATA de um contorno fechado de retas e arcos (Green):
   *   reta a→b:  ½ (ax·bz − bx·az)
   *   arco a→b de centro c, raio r, varredura s:
   *              ½ [cx (bz − az) − cz (bx − ax) + r²·s]
   * Com sinal: > 0 = anti-horário no plano x, z. */
  function areaContorno(segs) {
    var A = 0;
    (segs || []).forEach(function (sg) {
      var a = P(sg.a), b = P(sg.b);
      if (sg.tipo === "arco") {
        var i = infoSeg(sg);
        if (i && i.ok) { A += (i.c[0] * (b[1] - a[1]) - i.c[1] * (b[0] - a[0]) + i.r * i.r * i.s) / 2; return; }
      }
      A += (a[0] * b[1] - b[0] * a[1]) / 2;
    });
    return A;
  }
  function perimetro(segs) { return (segs || []).reduce(function (s, sg) { return s + comprimento(sg); }, 0); }
  /* quantos trechos retos um arco pede para a corda não se afastar mais que tol */
  function nCordas(r, s, tol, minimo) {
    tol = tol > 0 ? tol : 0.002;
    var passo = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
    return Math.max(minimo || 2, Math.min(720, Math.ceil(Math.abs(s) / passo - 1e-9)));
  }
  /* os pontos de um caminho (abre na 1ª ponta; o fechado não repete a 1ª) */
  function tesselar(segs, tol, fechado) {
    var out = [];
    (segs || []).forEach(function (sg, k) {
      var a = P(sg.a);
      if (k === 0 || dist(out[out.length - 1], a) > TOL_PT) out.push(a);
      if (sg.tipo === "arco") {
        var i = infoSeg(sg);
        if (i && i.ok) { var n = nCordas(i.r, i.s, tol); for (var j = 1; j < n; j++) out.push(polar(i.c, i.r, i.a0 + i.s * j / n)); }
      }
      out.push(P(sg.b));
    });
    if (fechado && out.length > 1 && dist(out[0], out[out.length - 1]) < TOL_PT) out.pop();
    return out;
  }

  /* ===================================================== INTERSEÇÕES */
  /* reta P + s·d com reta Q + r·e (null se paralelas) */
  function interRetas(p, d, q, e) {
    var den = cross(d, e); if (Math.abs(den) < 1e-12) return null;
    var s = cross(sub(q, p), e) / den;
    return add(p, mul(d, s));
  }
  /* reta P + s·d (d não precisa ser unitário) com o círculo (C, r): 0, 1 ou 2 pontos */
  function interRetaCirculo(p, d, c, r) {
    var u = unit(d); if (!u) return [];
    var f = sub(p, c), b = dot(f, u), cc = dot(f, f) - r * r, D = b * b - cc;
    if (D < -1e-12) return [];
    if (D < 1e-12) return [add(p, mul(u, -b))];
    var sq = Math.sqrt(D);
    return [add(p, mul(u, -b - sq)), add(p, mul(u, -b + sq))];
  }
  function interCirculos(c1, r1, c2, r2) {
    var dv = sub(c2, c1), D = len(dv);
    if (D < 1e-12 || D > r1 + r2 + 1e-12 || D < Math.abs(r1 - r2) - 1e-12) return [];
    var a = (r1 * r1 - r2 * r2 + D * D) / (2 * D), h2 = r1 * r1 - a * a, u = mul(dv, 1 / D), M = add(c1, mul(u, a));
    if (h2 < 1e-12) return [M];
    var h = Math.sqrt(h2), n = esq(u);
    return [add(M, mul(n, h)), add(M, mul(n, -h))];
  }
  /* a CURVA de apoio de um segmento: { reta: true, p, d } ou { c, r } */
  function apoio(sg) {
    if (sg.tipo === "arco") { var i = infoSeg(sg); if (i && i.ok) return { c: i.c, r: i.r }; }
    var a = P(sg.a), b = P(sg.b); return { reta: true, p: a, d: sub(b, a) };
  }
  function interApoios(A, B) {
    if (A.reta && B.reta) { var X = interRetas(A.p, A.d, B.p, B.d); return X ? [X] : []; }
    if (A.reta) return interRetaCirculo(A.p, A.d, B.c, B.r);
    if (B.reta) return interRetaCirculo(B.p, B.d, A.c, A.r);
    return interCirculos(A.c, A.r, B.c, B.r);
  }
  function maisPerto(lista, alvo) {
    var best = null, dm = Infinity;
    lista.forEach(function (q) { var d = dist(q, alvo); if (d < dm) { dm = d; best = q; } });
    return best;
  }
  /* distância de um ponto a um segmento (reta ou arco) */
  function distSeg(p, sg) {
    var a = P(sg.a), b = P(sg.b);
    if (sg.tipo === "arco") {
      var i = infoSeg(sg);
      if (i && i.ok) {
        var t = mod2pi(ang(sub(p, i.c)) - i.a0);
        var dentro = i.s > 0 ? t <= i.s : (t === 0 || t >= DOIS_PI + i.s);
        if (dentro) return Math.abs(dist(p, i.c) - i.r);
        return Math.min(dist(p, a), dist(p, b));
      }
    }
    var d = sub(b, a), L2 = dot(d, d), tt = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0;
    return dist(p, add(a, mul(d, tt)));
  }
  /* a tangente (unitária, no sentido do caminho) no fim (k = 1) ou no início (k = 0) */
  function tangente(sg, k) {
    var a = P(sg.a), b = P(sg.b);
    if (sg.tipo === "arco") {
      var i = infoSeg(sg);
      if (i && i.ok) { var q = k ? b : a, rv = mul(sub(q, i.c), 1 / i.r); return i.s > 0 ? [-rv[1], rv[0]] : [rv[1], -rv[0]]; }
    }
    return unit(sub(b, a));
  }

  /* ===================================================== DESLOCAMENTO
   * Cada trecho anda `d` para a ESQUERDA (o lado +w); os cantos se
   * refazem pela interseção das curvas deslocadas (reta × reta, reta ×
   * círculo, círculo × círculo — a mais perto do canto). Trecho que some ou
   * inverte → erro com motivo. */
  function deslocarEsq(segs, d, fechado) {
    if (!(Math.abs(d) > TOL)) return { ok: true, segmentos: segs };
    var novos = [], n = segs.length;
    for (var i = 0; i < n; i++) {
      var sg = segs[i], a = P(sg.a), b = P(sg.b);
      if (sg.tipo === "arco") {
        var I = infoSeg(sg); if (!I || !I.ok) return erro(I ? I.motivo : "arco inválido");
        /* anti-horário: a esquerda é o centro (o raio diminui) */
        var r2 = I.r - (I.s > 0 ? d : -d);
        if (!(r2 > 1e-6)) return erro("O deslocamento de " + m2(Math.abs(d)) + " m passa do centro do arco de raio " + m2(I.r) + " m.");
        novos.push({ arco: true, c: I.c, r: r2, s: I.s, a: add(I.c, mul(sub(a, I.c), r2 / I.r)), b: add(I.c, mul(sub(b, I.c), r2 / I.r)), orig: sg });
      } else {
        var u = unit(sub(b, a)); if (!u) return erro("Há um trecho de comprimento zero.");
        var nn = mul(esq(u), d);
        novos.push({ arco: false, a: add(a, nn), b: add(b, nn), u: u, orig: sg });
      }
    }
    function sup(x) { return x.arco ? { c: x.c, r: x.r } : { reta: true, p: x.a, d: sub(x.b, x.a) }; }
    var ncant = fechado ? n : n - 1;
    for (var k = 0; k < ncant; k++) {
      var X = novos[k], Y = novos[(k + 1) % n];
      if (dist(X.b, Y.a) < TOL_PT) continue;              /* continuidade tangente: nada a fazer */
      var cands = interApoios(sup(X), sup(Y));
      if (!cands.length) return erro("O deslocamento não fecha o canto entre o trecho " + (k + 1) + " e o " + ((k + 1) % n + 1) + ".");
      var Q = maisPerto(cands, mul(add(X.b, Y.a), 0.5));
      X.b = Q; Y.a = Q;
    }
    var out = [];
    for (var j = 0; j < n; j++) {
      var x = novos[j];
      if (x.arco) {
        var ta = ang(sub(x.a, x.c)), tb = ang(sub(x.b, x.c)), s2 = x.s > 0 ? mod2pi(tb - ta) : -mod2pi(ta - tb);
        if (Math.abs(s2) < 1e-9 || Math.abs(s2) > Math.abs(x.s) + Math.PI) return erro("O deslocamento faz o arco " + (j + 1) + " sumir.");
        out.push({ tipo: "arco", a: O(x.a), b: O(x.b), m: O(polar(x.c, x.r, ta + s2 / 2)) });
      } else {
        if (dot(sub(x.b, x.a), x.u) <= TOL_PT) return erro("O deslocamento faz o trecho " + (j + 1) + " sumir (ou virar do avesso).");
        out.push({ tipo: "reta", a: O(x.a), b: O(x.b) });
      }
    }
    return { ok: true, segmentos: out };
  }
  /* d > 0: fechado = para fora; aberto = para a esquerda (+w) */
  function deslocar(segs, d, fechado) {
    d = num(d, 0); if (!(Math.abs(d) > TOL)) return { ok: true, segmentos: segs };
    if (fechado) { var A = areaContorno(segs); return deslocarEsq(segs, A > 0 ? -d : d, true); }
    return deslocarEsq(segs, d, false);
  }

  /* ===================================================== CONCORDÂNCIA
   * O arco de raio r tangente às retas que chegam no canto V (vindo de A,
   * saindo para B). Devolve { t1 (na reta VA), t2 (na reta VB), m, c, dt
   * (a distância do canto à tangência) } ou erro. */
  function concordarCanto(A, V, B, r, rotulo) {
    var u1 = unit(sub(A, V)), u2 = unit(sub(B, V));
    if (!u1 || !u2) return erro("Há um trecho de comprimento zero no canto" + (rotulo ? " " + rotulo : "") + ".");
    var cosa = Math.max(-1, Math.min(1, dot(u1, u2))), alfa = Math.acos(cosa);
    if (alfa < 1e-6 || Math.PI - alfa < 1e-6) return erro("Os trechos do canto" + (rotulo ? " " + rotulo : "") + " estão alinhados: não há canto para arredondar.");
    var dt = r / Math.tan(alfa / 2), bis = unit(add(u1, u2)), dc = r / Math.sin(alfa / 2);
    var c = add(V, mul(bis, dc));
    return { ok: true, t1: add(V, mul(u1, dt)), t2: add(V, mul(u2, dt)), c: c, m: add(c, mul(bis, -r)), dt: dt, alfa: alfa };
  }
  /* um polígono (vértices) → trechos, com os cantos arredondados pelo raio */
  function poligonoSegs(V, raio, fechado) {
    var n = V.length, segs = [];
    if (!(raio > 0)) {
      for (var i = 0; i < (fechado ? n : n - 1); i++) segs.push(reta(V[i], V[(i + 1) % n]));
      return { ok: true, segmentos: segs };
    }
    /* a tangência de cada canto e a folga de cada lado */
    var C = [], i0 = fechado ? 0 : 1, i1 = fechado ? n : n - 1;
    for (var k = i0; k < i1; k++) {
      var q = concordarCanto(V[(k - 1 + n) % n], V[k], V[(k + 1) % n], raio, k + 1);
      if (!q.ok) return q;
      C[k] = q;
    }
    for (var e = 0; e < (fechado ? n : n - 1); e++) {
      var j = (e + 1) % n, Lado = dist(V[e], V[j]), usa = (C[e] ? C[e].dt : 0) + (C[j] ? C[j].dt : 0);
      if (usa > Lado + 1e-9) {
        /* o maior raio que cabe neste lado */
        var tanE = C[e] ? Math.tan(C[e].alfa / 2) : Infinity, tanJ = C[j] ? Math.tan(C[j].alfa / 2) : Infinity;
        var rmax = Lado / ((C[e] ? 1 / tanE : 0) + (C[j] ? 1 / tanJ : 0));
        return erro("Raio de " + m2(raio) + " m grande demais: o lado " + (e + 1) + " (" + m2(Lado) + " m) não comporta as duas concordâncias — cabe até " + m2(Math.floor(rmax * 1000 + 1e-6) / 1000) + " m.");
      }
    }
    for (var s = 0; s < (fechado ? n : n - 1); s++) {
      var t = (s + 1) % n, ini = C[s] ? C[s].t2 : V[s], fim = C[t] ? C[t].t1 : V[t];
      if (dist(ini, fim) > TOL_PT) segs.push(reta(ini, fim));
      if (C[t] && (fechado || t < n - 1)) segs.push({ tipo: "arco", a: O(C[t].t1), b: O(C[t].t2), m: O(C[t].m) });
    }
    if (fechado && segs.length && segs[0].tipo !== "reta") segs.push(segs.shift());   /* começa por uma reta */
    return { ok: true, segmentos: segs };
  }

  /* ===================================================== FERRAMENTAS */
  var DEF = {
    linha: { rotulo: "Linha", pontos: 2, opcoes: ["encadear", "deslocamento", "raio"], dica: "Clique o início e o fim. Com Encadear, cada clique continua do último ponto; com Raio, os cantos do encadeamento saem arredondados." },
    retangulo: { rotulo: "Retângulo", pontos: 2, opcoes: ["deslocamento", "raio"], dica: "Clique dois cantos opostos. Com Raio, os quatro cantos saem arredondados." },
    poligonoInscrito: { rotulo: "Polígono inscrito", pontos: 2, opcoes: ["lados", "deslocamento", "raio"], dica: "Clique o centro e um VÉRTICE. Três lados = triângulo. O polígono fica dentro do círculo que passa pelos vértices." },
    poligonoCircunscrito: { rotulo: "Polígono circunscrito", pontos: 2, opcoes: ["lados", "deslocamento", "raio"], dica: "Clique o centro e o MEIO DE UM LADO. Três lados = triângulo. O polígono fica em volta do círculo que toca os lados." },
    circulo: { rotulo: "Círculo", pontos: 2, opcoes: ["deslocamento"], dica: "Clique o centro e um ponto do círculo (o raio)." },
    arco3p: { rotulo: "Arco por três pontos", pontos: 3, opcoes: ["deslocamento"], dica: "Clique o início, o fim e um ponto por onde o arco passa." },
    arcoCentro: { rotulo: "Arco por centro e pontas", pontos: 3, opcoes: ["deslocamento"], dica: "Clique o centro, o início (define o raio) e a direção do fim. Vai até 180°." },
    arcoTangente: { rotulo: "Arco tangente", pontos: 1, requer: "anterior", opcoes: ["deslocamento"], dica: "Continua do fim do último trecho, tangente a ele: clique o ponto final." },
    arcoConcordancia: { rotulo: "Arco de concordância", pontos: 1, requer: "segmentos", opcoes: ["raio"], dica: "Escolha dois trechos retos e o raio (ou arraste até o raio): o canto vira um arco tangente aos dois." },
    elipse: { rotulo: "Elipse", pontos: 3, opcoes: ["deslocamento"], dica: "Clique o centro, a ponta do primeiro eixo e a largura do segundo eixo." },
    elipseParcial: { rotulo: "Elipse parcial", pontos: 3, opcoes: [], dica: "Clique as duas pontas do eixo e a altura da meia elipse." },
    spline: { rotulo: "Spline", pontos: "livre", opcoes: [], dica: "Clique os pontos por onde a curva passa; Enter termina." },
    selecionarLinhas: { rotulo: "Selecionar linhas", pontos: 1, requer: "linhas", opcoes: ["deslocamento"], dica: "Clique uma linha existente (eixo, linha de detalhe, face de parede, aresta de laje) para copiar a geometria dela." },
    selecionarParedes: { rotulo: "Selecionar paredes", pontos: 1, requer: "linhas", opcoes: ["deslocamento", "linhaCentral"], dica: "Clique uma parede: o contorno segue a face dela do lado do clique (ou a linha central)." }
  };
  var COMUM = ["linha", "retangulo", "poligonoInscrito", "poligonoCircunscrito", "circulo", "arco3p", "arcoCentro", "arcoTangente", "arcoConcordancia", "selecionarLinhas"];
  /* só trechos RETOS: a peça ainda não guarda arco (telhado por perímetro, furo de laje, separador de
     ambiente, eixo) — oferecer arco ali seria entregar corda no lugar do arco; sem a opção Raio */
  var RETOS = ["linha", "retangulo", "poligonoInscrito", "poligonoCircunscrito", "selecionarLinhas"];
  var ALVOS = {
    parede: COMUM,                                       /* parede curva: js/bimcurva.js */
    laje: COMUM.concat(["selecionarParedes"]),           /* contorno com aresta em arco ({x, z, m}) */
    forro: COMUM.concat(["selecionarParedes"]),
    guarda: COMUM,                                       /* caminho com trecho em arco */
    viga: ["linha", "arco3p", "arcoCentro", "arcoTangente", "arcoConcordancia", "selecionarLinhas"],   /* curva: só seção retangular */
    telhado: RETOS.concat(["selecionarParedes"]),
    furo: RETOS.concat(["selecionarParedes"]),
    separador: RETOS,
    eixo: ["linha", "selecionarLinhas"],
    linhaDetalhe: COMUM.concat(["elipse", "elipseParcial", "spline"]),
    regiao: COMUM.concat(["elipse", "elipseParcial", "spline", "selecionarParedes"])
  };
  var SO_RETAS = { telhado: 1, furo: 1, separador: 1, eixo: 1 };
  /* o nome do ícone em js/icones.js (bloco CURVA) */
  var ICONE = { linha: "desLinha", retangulo: "desRetangulo", poligonoInscrito: "desPoligonoInscrito", poligonoCircunscrito: "desPoligonoCircunscrito",
                circulo: "desCirculo", arco3p: "desArco3p", arcoCentro: "desArcoCentro", arcoTangente: "desArcoTangente", arcoConcordancia: "desArcoConcordancia",
                elipse: "desElipse", elipseParcial: "desElipseParcial", spline: "desSpline", selecionarLinhas: "desSelecionarLinhas", selecionarParedes: "desSelecionarParedes" };
  var FECHADAS = { retangulo: 1, poligonoInscrito: 1, poligonoCircunscrito: 1, circulo: 1, elipse: 1 };

  function ferramentas(alvo) {
    var ids = ALVOS[alvo] || [];
    return ids.map(function (id) {
      var d = DEF[id], o = { id: id, rotulo: d.rotulo, icone: ICONE[id], dica: d.dica, pontos: d.pontos, opcoes: d.opcoes.slice(), fechada: !!FECHADAS[id] };
      if (SO_RETAS[alvo]) o.opcoes = o.opcoes.filter(function (k) { return k !== "raio"; });   /* o raio faria arco nos cantos */
      if (d.requer) o.requer = d.requer;
      return o;
    });
  }

  function lados(opc) {
    var n = opc && opc.lados != null ? Number(opc.lados) : 6;
    return (n === Math.floor(n) && n >= 3 && n <= 64) ? n : null;
  }
  function pontosValidos(lista) {
    var pts = (lista || []).map(P);
    for (var i = 0; i < pts.length; i++) if (!ok2(pts[i])) return null;
    return pts;
  }
  /* a forma pura (sem deslocamento) */
  function bruto(id, pts, opc) {
    var raio = num(opc.raio, 0), i, V;
    if (id === "linha") {
      if (pts.length < 2) return erro("A linha pede dois pontos.");
      var usados = opc.encadear ? pts : pts.slice(0, 2);
      for (i = 0; i + 1 < usados.length; i++) if (dist(usados[i], usados[i + 1]) < TOL_PT) return erro("Dois cliques seguidos no mesmo ponto: o trecho " + (i + 1) + " não tem comprimento.");
      var fech = opc.encadear && usados.length >= 4 && dist(usados[0], usados[usados.length - 1]) < TOL_PT;
      if (fech) usados = usados.slice(0, -1);
      var r1 = poligonoSegs(usados, opc.encadear ? raio : 0, fech);
      if (!r1.ok) return r1;
      return { ok: true, segmentos: r1.segmentos, fechado: !!fech };
    }
    if (id === "retangulo") {
      if (pts.length < 2) return erro("O retângulo pede dois cantos opostos.");
      var x0 = Math.min(pts[0][0], pts[1][0]), x1 = Math.max(pts[0][0], pts[1][0]), z0 = Math.min(pts[0][1], pts[1][1]), z1 = Math.max(pts[0][1], pts[1][1]);
      if (x1 - x0 < TOL_PT || z1 - z0 < TOL_PT) return erro("Os dois cantos estão alinhados: o retângulo não tem " + (x1 - x0 < TOL_PT ? "largura" : "altura") + ".");
      V = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      var r2 = poligonoSegs(V, raio, true); if (!r2.ok) return r2;
      return { ok: true, segmentos: r2.segmentos, fechado: true };
    }
    if (id === "poligonoInscrito" || id === "poligonoCircunscrito") {
      if (pts.length < 2) return erro("O polígono pede o centro e mais um ponto.");
      var n = lados(opc); if (!n) return erro("Número de lados entre 3 e 64 (inteiro).");
      var c = pts[0], R = dist(pts[1], c), t0 = ang(sub(pts[1], c));
      if (R < TOL_PT) return erro("O segundo ponto está no centro: o polígono não tem tamanho.");
      var Rv = id === "poligonoInscrito" ? R : R / Math.cos(Math.PI / n), tv = id === "poligonoInscrito" ? t0 : t0 - Math.PI / n;
      V = []; for (i = 0; i < n; i++) V.push(polar(c, Rv, tv + DOIS_PI * i / n));
      var r3 = poligonoSegs(V, raio, true); if (!r3.ok) return r3;
      return { ok: true, segmentos: r3.segmentos, fechado: true, forma: { tipo: "poligono", centro: O(c), lados: n, raioVertice: Rv, apotema: Rv * Math.cos(Math.PI / n), inscrito: id === "poligonoInscrito" } };
    }
    if (id === "circulo") {
      if (pts.length < 2) return erro("O círculo pede o centro e um ponto dele.");
      var cc = pts[0], rc = dist(pts[1], cc); if (rc < TOL_PT) return erro("O raio do círculo é zero.");
      var tc = ang(sub(pts[1], cc));
      return { ok: true, segmentos: [arcoCentroSeg(cc, rc, tc, Math.PI), arcoCentroSeg(cc, rc, tc + Math.PI, Math.PI)], fechado: true, forma: { tipo: "circulo", centro: O(cc), raio: rc } };
    }
    if (id === "arco3p") {
      if (pts.length < 3) return erro("O arco pede três pontos: início, fim e um ponto dele.");
      var I3 = arco(pts[0], pts[1], pts[2]); if (!I3.ok) return I3;
      return { ok: true, segmentos: [{ tipo: "arco", a: O(pts[0]), b: O(pts[1]), m: O(I3.meio) }], fechado: false, forma: { tipo: "arco", centro: O(I3.c), raio: I3.r, varredura: I3.s } };
    }
    if (id === "arcoCentro") {
      if (pts.length < 3) return erro("O arco pede o centro, o início e o fim.");
      var ce = pts[0], ra = dist(pts[1], ce);
      if (ra < TOL_PT) return erro("O início está no centro: o raio é zero.");
      if (dist(pts[2], ce) < TOL_PT) return erro("O fim está no centro: a direção do fim não existe.");
      var ta = ang(sub(pts[1], ce)), tb = ang(sub(pts[2], ce)), s = mod2pi(tb - ta);
      if (s < 1e-9 || DOIS_PI - s < 1e-9) return erro("O início e o fim estão na mesma direção a partir do centro: o arco não tem abertura.");
      if (s > Math.PI) s -= DOIS_PI;                       /* o arco menor (até 180°) */
      if (Math.abs(Math.abs(s) - Math.PI) < 1e-9) s = (opc.sentido === -1 ? -1 : 1) * Math.PI;
      else if (opc.sentido === 1 || opc.sentido === -1) s = opc.sentido > 0 ? mod2pi(tb - ta) : -mod2pi(ta - tb);
      return { ok: true, segmentos: [arcoCentroSeg(ce, ra, ta, s)], fechado: false, forma: { tipo: "arco", centro: O(ce), raio: ra, varredura: s } };
    }
    if (id === "arcoTangente") {
      var ant = opc.anterior;
      if (!ant || !ant.a || !ant.b) return erro("O arco tangente começa no fim de um trecho já desenhado: desenhe um trecho antes.");
      if (pts.length < 1) return erro("O arco tangente pede o ponto final.");
      var A = P(ant.b), Bp = pts[pts.length - 1], t = tangente(ant, 1);
      if (!t) return erro("O trecho anterior não tem direção.");
      var AB = sub(Bp, A), nn = esq(t), k = dot(AB, nn);
      if (len(AB) < TOL_PT) return erro("O ponto final está no começo do arco.");
      if (Math.abs(k) < 1e-9 * Math.max(1, len(AB))) return erro("O ponto final está na direção da tangente: não há arco (use a linha).");
      var rho = dot(AB, AB) / (2 * k), C = add(A, mul(nn, rho)), rr = Math.abs(rho);
      var tA = ang(sub(A, C)), tB = ang(sub(Bp, C)), st = rho > 0 ? mod2pi(tB - tA) : -mod2pi(tA - tB);
      return { ok: true, segmentos: [{ tipo: "arco", a: O(A), b: O(Bp), m: O(polar(C, rr, tA + st / 2)) }], fechado: false, forma: { tipo: "arco", centro: O(C), raio: rr, varredura: st } };
    }
    if (id === "arcoConcordancia") return concordancia(pts, opc);
    if (id === "elipse" || id === "elipseParcial") return elipse(id, pts, opc);
    if (id === "spline") return spline(pts, opc);
    if (id === "selecionarLinhas" || id === "selecionarParedes") return selecionar(id, pts, opc);
    return erro("Ferramenta de desenho desconhecida: " + id + ".");
  }

  /* concordância entre dois trechos RETOS (s1, s2): o canto é a interseção
     das retas; cada trecho perde (ou ganha) até a tangência — a ponta mais
     perto do canto é a que muda. Raio pela opção, ou pelo ponto (o arco
     passa pela projeção dele na bissetriz). */
  function concordancia(pts, opc) {
    var S = opc.segmentos;
    if (!Array.isArray(S) || S.length < 2 || !S[0] || !S[1]) return erro("Escolha os dois trechos que o arco vai concordar.");
    if (S[0].tipo === "arco" || S[1].tipo === "arco") return erro("A concordância é entre dois trechos retos.");
    var a1 = P(S[0].a), b1 = P(S[0].b), a2 = P(S[1].a), b2 = P(S[1].b);
    var V = interRetas(a1, sub(b1, a1), a2, sub(b2, a2));
    if (!V) return erro("Os trechos são paralelos: não há canto para concordar.");
    var perto1 = dist(a1, V) < dist(b1, V) ? "a" : "b", perto2 = dist(a2, V) < dist(b2, V) ? "a" : "b";
    var longe1 = perto1 === "a" ? b1 : a1, longe2 = perto2 === "a" ? b2 : a2;
    if (dist(longe1, V) < TOL_PT || dist(longe2, V) < TOL_PT) return erro("Um dos trechos termina no canto pelo lado de fora: não há o que concordar.");
    var r = num(opc.raio, 0);
    if (!(r > 0)) {
      var q = pts.length ? pts[pts.length - 1] : null;
      if (!q) return erro("Informe o raio da concordância (ou arraste até ele).");
      var u1 = unit(sub(longe1, V)), u2 = unit(sub(longe2, V)), al = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2)))), bis = unit(add(u1, u2));
      if (!bis || al < 1e-6) return erro("Os trechos estão alinhados: não há canto para concordar.");
      var dq = dot(sub(q, V), bis), fator = 1 / Math.sin(al / 2) - 1;
      if (!(dq > TOL_PT)) return erro("Arraste para dentro do canto para dar o raio.");
      r = dq / fator;
    }
    var K = concordarCanto(longe1, V, longe2, r);
    if (!K.ok) return K;
    var cabe = Math.min(dist(longe1, V), dist(longe2, V));
    if (K.dt > cabe + 1e-9) {
      var rmax = cabe * Math.tan(K.alfa / 2);
      return erro("Raio de " + m2(r) + " m grande demais: a concordância passaria do fim do trecho — cabe até " + m2(Math.floor(rmax * 1000 + 1e-6) / 1000) + " m.");
    }
    var n1 = perto1 === "a" ? reta(K.t1, b1) : reta(a1, K.t1), n2 = perto2 === "a" ? reta(K.t2, b2) : reta(a2, K.t2);
    /* o arco continua o caminho: sai do trecho que CHEGA no canto */
    var arc = perto1 === "b" ? { tipo: "arco", a: O(K.t1), b: O(K.t2), m: O(K.m) } : { tipo: "arco", a: O(K.t2), b: O(K.t1), m: O(K.m) };
    return { ok: true, segmentos: [n1, arc, n2], fechado: false, substitui: [0, 2], forma: { tipo: "arco", centro: O(K.c), raio: r } };
  }

  function elipse(id, pts, opc) {
    if (pts.length < 3) return erro(id === "elipse" ? "A elipse pede o centro, a ponta do primeiro eixo e a largura do segundo." : "A elipse parcial pede as duas pontas do eixo e a altura.");
    var c, a, b, u, lado = 1;
    if (id === "elipse") {
      c = pts[0]; u = unit(sub(pts[1], c)); a = dist(pts[1], c);
      if (!u) return erro("A ponta do primeiro eixo está no centro.");
      b = Math.abs(cross(u, sub(pts[2], c)));
    } else {
      c = mul(add(pts[0], pts[1]), 0.5); u = unit(sub(pts[1], pts[0])); a = dist(pts[0], pts[1]) / 2;
      if (!u) return erro("As duas pontas do eixo estão no mesmo ponto.");
      var cr = cross(u, sub(pts[2], c)); b = Math.abs(cr); lado = cr >= 0 ? 1 : -1;
    }
    if (b < TOL_PT) return erro("O terceiro ponto está sobre o primeiro eixo: a elipse não tem largura.");
    var v = esq(u), tol = num(opc.tolCorda, 0.002), Rm = Math.max(a, b), n = nCordas(Math.max(a, b) * Math.max(a, b) / Math.min(a, b), DOIS_PI, tol, 8);
    var tot = id === "elipse" ? n : Math.ceil(n / 2), out = [], pt = function (t) { return add(c, add(mul(u, a * Math.cos(t)), mul(v, lado * b * Math.sin(t)))); };
    var Pts = [];
    for (var i = 0; i <= tot; i++) Pts.push(pt((id === "elipse" ? DOIS_PI : Math.PI) * (id === "elipse" ? i / tot : 1 - i / tot)));
    for (var k = 0; k + 1 < Pts.length; k++) out.push(reta(Pts[k], Pts[k + 1]));
    void Rm;
    return { ok: true, segmentos: out, fechado: id === "elipse", forma: { tipo: id, centro: O(c), a: a, b: b, ang: ang(u) } };
  }
  /* spline pelos pontos (Catmull–Rom centrípeta), em trechos retos pela tolerância */
  function spline(pts, opc) {
    if (pts.length < 2) return erro("A spline pede pelo menos dois pontos.");
    for (var i = 0; i + 1 < pts.length; i++) if (dist(pts[i], pts[i + 1]) < TOL_PT) return erro("Dois pontos seguidos no mesmo lugar na spline.");
    if (pts.length === 2) return { ok: true, segmentos: [reta(pts[0], pts[1])], fechado: false, forma: { tipo: "spline", pontos: pts.map(O) } };
    var tol = num(opc.tolCorda, 0.002), Q = [sub(mul(pts[0], 2), pts[1])].concat(pts).concat([sub(mul(pts[pts.length - 1], 2), pts[pts.length - 2])]), out = [];
    function tj(ti, a, b) { return ti + Math.pow(dist(a, b), 0.5); }
    for (var s = 1; s + 2 < Q.length; s++) {
      var p0 = Q[s - 1], p1 = Q[s], p2 = Q[s + 1], p3 = Q[s + 2];
      var t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
      var n = Math.max(4, Math.min(64, Math.ceil(dist(p1, p2) / Math.max(0.01, Math.sqrt(8 * tol * Math.max(0.05, dist(p1, p2)))))));
      var ant = p1;
      for (var k = 1; k <= n; k++) {
        var t = t1 + (t2 - t1) * k / n;
        var A1 = add(mul(p0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0))), A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1))), A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(p3, (t - t2) / (t3 - t2)));
        var B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0))), B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)));
        var Cq = k === n ? p2 : add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1)));
        out.push(reta(ant, Cq)); ant = Cq;
      }
    }
    return { ok: true, segmentos: out, fechado: false, forma: { tipo: "spline", pontos: pts.map(O) } };
  }
  /* SELECIONAR: a linha (ou a face de parede) mais perto do clique */
  function selecionar(id, pts, opc) {
    if (!pts.length) return erro("Clique a linha a selecionar.");
    var q = pts[pts.length - 1], tol = num(opc.tolerancia, 0.3), L = Array.isArray(opc.linhas) ? opc.linhas : [];
    if (id === "selecionarParedes") L = L.filter(function (x) { return x && x.fonte && x.fonte.tipo === "parede" && (opc.linhaCentral ? x.fonte.face === "eixo" : x.fonte.face !== "eixo"); });
    if (!L.length) return erro(id === "selecionarParedes" ? "Não há parede para selecionar." : "Não há linha para selecionar.");
    var best = null, dm = Infinity;
    L.forEach(function (x) { if (!x || !x.a || !x.b) return; var d = distSeg(q, x); if (d < dm) { dm = d; best = x; } });
    if (!best || dm > tol) return erro("Nenhuma " + (id === "selecionarParedes" ? "parede" : "linha") + " a menos de " + cm(tol) + " cm do clique.");
    var sg = best.tipo === "arco" ? { tipo: "arco", a: O(P(best.a)), b: O(P(best.b)), m: O(P(best.m)) } : reta(best.a, best.b);
    var d = num(opc.deslocamento, 0), res = { ok: true, segmentos: [sg], fechado: false };
    if (best.fonte) res.fonte = best.fonte;
    if (Math.abs(d) > TOL) {
      /* o deslocamento vai para o LADO DO CLIQUE */
      var t = tangente(sg, 0), lado = dot(sub(q, P(sg.a)), esq(t));
      if (sg.tipo === "arco") { var I = infoSeg(sg); lado = (dist(q, I.c) < I.r ? 1 : -1) * (I.s > 0 ? 1 : -1); }
      var r = deslocarEsq([sg], lado >= 0 ? Math.abs(d) : -Math.abs(d), false);
      if (!r.ok) return r;
      res.segmentos = r.segmentos;
    }
    return res;
  }

  /* os pontos chegam como {x,z} ou [x,z] */
  function gerar(id, pontos, opcoes) {
    var opc = opcoes || {};
    if (!DEF[id]) return erro("Ferramenta de desenho desconhecida: " + id + ".");
    var pts = pontosValidos(pontos); if (!pts) return erro("Há ponto inválido.");
    var r = bruto(id, pts, opc);
    if (!r.ok) return r;
    /* o deslocamento (a seleção já aplicou o dela, para o lado do clique) */
    var d = num(opc.deslocamento, 0);
    if (Math.abs(d) > TOL && id !== "selecionarLinhas" && id !== "selecionarParedes" && id !== "arcoConcordancia" && id !== "elipseParcial" && id !== "spline") {
      if (id === "elipse") return erro("Elipse com deslocamento não é exata (a curva paralela de uma elipse não é elipse): desenhe a elipse já no lugar.");
      var dz = deslocar(r.segmentos, d, r.fechado);
      if (!dz.ok) return dz;
      r.segmentos = dz.segmentos;
      if (r.forma && r.forma.tipo === "circulo") r.forma.raio += d;
      if (r.forma && r.forma.tipo === "arco") delete r.forma.centro;   /* o raio mudou: a forma exata é a dos segmentos */
    }
    return r;
  }

  function previa(id, parciais, cursor, opcoes) {
    var opc = opcoes || {}, d = DEF[id];
    if (!d) return erro("Ferramenta de desenho desconhecida: " + id + ".");
    var pts = pontosValidos(parciais || []); if (!pts) return erro("Há ponto inválido.");
    var cur = cursor != null ? P(cursor) : null;
    if (cur && ok2(cur)) pts = pts.concat([cur]);
    var precisa = d.pontos === "livre" ? 2 : d.pontos;
    if (id === "linha" && opc.encadear) precisa = 2;
    if (pts.length >= precisa) {
      var usa = (d.pontos === "livre" || (id === "linha" && opc.encadear)) ? pts : pts.slice(0, precisa);
      var r = gerar(id, usa, opc); r.provisorio = !!cur; return r;
    }
    /* faltam cliques: a linha-guia do último ponto até o cursor */
    if (pts.length >= 2 && dist(pts[pts.length - 2], pts[pts.length - 1]) > TOL_PT) return { ok: true, segmentos: [reta(pts[pts.length - 2], pts[pts.length - 1])], fechado: false, provisorio: true };
    return { ok: true, segmentos: [], fechado: false, provisorio: true };
  }

  /* ============================================ DOS TRECHOS PARA A PEÇA
   * O que a tela grava depois de gerar(): */
  /* contorno de laje/forro/região: [{x, z, m?}] — o ponto com m começa a aresta em arco (sem lista dentro de lista) */
  function paraContorno(segs) {
    var out = [];
    (segs || []).forEach(function (sg) { var p = P(sg.a), o = { x: p[0], z: p[1] }; if (sg.tipo === "arco" && sg.m) o.m = { x: Number(sg.m.x), z: Number(sg.m.z) }; out.push(o); });
    if (segs && segs.length) { var u = P(segs[segs.length - 1].b), f = out[0]; if (dist(u, [f.x, f.z]) > TOL_PT) out.push({ x: u[0], z: u[1] }); }
    return out;
  }
  /* caminho do guarda-corpo: [{x, y, z, m?}] na altura y */
  function paraCaminho(segs, y) {
    var out = paraContorno(segs).map(function (p) { var o = { x: p.x, y: num(y, 0), z: p.z }; if (p.m) o.m = p.m; return o; });
    if (segs && segs.length) { var u = P(segs[segs.length - 1].b), l = out[out.length - 1]; if (dist(u, [l.x, l.z]) > TOL_PT) out.push({ x: u[0], y: num(y, 0), z: u[1] }); }
    return out;
  }
  /* as PAREDES dos trechos: reta → BimEdit.parede, arco → BimEdit.paredeCurva (js/bimcurva.js), cada uma
     marcada pelo BimArq.marcarParede(c, cfg) — tipo, linha de localização, nível, restrições, canto.
     cfg: { espessura, altura, base, tipoParede, linhaLoc, nivelId, restricoes, niveis, juntaCanto, unir, anexarTopo }.
     → { ok, caixas } | { ok: false, motivo } (nada pela metade: um trecho ruim recusa o lote) */
  function paredesDe(segs, cfg) {
    cfg = cfg || {};
    var BE = global.BimEdit, BA = global.BimArq, BC = global.BimCurva;
    if (typeof require === "function") { try { BE = BE || require("./bimedit.js"); BA = BA || require("./bimarq.js"); BC = BC || require("./bimcurva.js"); } catch (e) {} }
    if (!BE || !BA) return erro("O motor do modelador (js/bimedit.js, js/bimarq.js) não carregou.");
    var esp = cfg.tipoParede && num(cfg.tipoParede.espessura, 0) > 0 ? num(cfg.tipoParede.espessura, 0) : num(cfg.espessura, 0.15), alt = num(cfg.altura, 2.8), base = num(cfg.base, 0), caixas = [];
    for (var i = 0; i < (segs || []).length; i++) {
      var sg = segs[i], c;
      if (sg.tipo === "arco") {
        if (!BC) return erro("A parede curva precisa do js/bimcurva.js.");
        c = BE.paredeCurva(sg.a, sg.b, sg.m, esp, alt, base);
        if (!c) return erro("Trecho " + (i + 1) + ": " + (BC.motivoArco(P(sg.a), P(sg.b), P(sg.m), esp) || "o arco não vira parede."));
      } else {
        c = BE.parede(sg.a, sg.b, esp, alt, base);
        if (!c) return erro("Trecho " + (i + 1) + ": a parede não tem comprimento.");
      }
      BA.marcarParede(c, cfg);
      caixas.push(c);
    }
    return caixas.length ? { ok: true, caixas: caixas } : erro("Nenhum trecho para virar parede.");
  }

  /* as LINHAS que dá para selecionar no estado do editor (BimEdit.aplicar):
     eixos, faces e linha central das paredes (as curvas como arco, pelo
     js/bimcurva.js), arestas das lajes por contorno e linhas de detalhe. */
  function linhasDoEstado(estado) {
    var L = [], BC = global.BimCurva || (typeof require === "function" ? (function () { try { return require("./bimcurva.js"); } catch (e) { return null; } })() : null);
    ((estado && estado.eixos) || []).forEach(function (e) {
      if (!e) return;
      if (e.arco && e.arco.m) L.push({ tipo: "arco", a: { x: e.x0, z: e.z0 }, b: { x: e.x1, z: e.z1 }, m: { x: e.arco.m.x, z: e.arco.m.z }, fonte: { tipo: "eixo", id: e.id } });
      else L.push({ tipo: "reta", a: { x: e.x0, z: e.z0 }, b: { x: e.x1, z: e.z1 }, fonte: { tipo: "eixo", id: e.id } });
    });
    ((estado && estado.caixas) || []).forEach(function (c) {
      if (!c) return;
      if (c.tipo === "parede") {
        if (c.arco && BC && BC.linhasParede) { BC.linhasParede(c).forEach(function (x) { L.push(x); }); return; }
        var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, t = num(c.espessura, 0) / 2;
        [["eixo", 0], ["fora", -t], ["dentro", t]].forEach(function (f) {
          var w = c.inverterFaces && f[0] !== "eixo" ? -f[1] : f[1];
          L.push({ tipo: "reta", a: { x: c.cx - h * co + w * si, z: c.cz + h * si + w * co }, b: { x: c.cx + h * co + w * si, z: c.cz - h * si + w * co }, fonte: { tipo: "parede", id: c.id, face: f[0] } });
        });
      } else if (Array.isArray(c.contorno) && c.contorno.length >= 3) {
        var Q = c.contorno;
        Q.forEach(function (p, i) {
          var q = Q[(i + 1) % Q.length];
          if (p.m) L.push({ tipo: "arco", a: { x: p.x, z: p.z }, b: { x: q.x, z: q.z }, m: { x: p.m.x, z: p.m.z }, fonte: { tipo: c.tipo, id: c.id, aresta: i } });
          else L.push({ tipo: "reta", a: { x: p.x, z: p.z }, b: { x: q.x, z: q.z }, fonte: { tipo: c.tipo, id: c.id, aresta: i } });
        });
      }
    });
    var an = estado && estado.anot2d;
    ((an && an.itens) || []).forEach(function (x) {
      if (!x || x.tipo !== "linha" || !Array.isArray(x.pts)) return;
      for (var i = 0; i + 1 < x.pts.length; i++) L.push({ tipo: "reta", a: { x: x.pts[i].x, z: x.pts[i].y }, b: { x: x.pts[i + 1].x, z: x.pts[i + 1].y }, fonte: { tipo: "linhaDetalhe", id: x.id } });
    });
    return L;
  }

  var BimDesenho = {
    ferramentas: ferramentas, gerar: gerar, previa: previa, linhasDoEstado: linhasDoEstado,
    paraContorno: paraContorno, paraCaminho: paraCaminho, paredesDe: paredesDe,
    ALVOS: Object.keys(ALVOS), FECHADAS: FECHADAS,
    /* geometria exposta (js/bimcurva.js e os testes usam a mesma) */
    arco: arco, areaContorno: areaContorno, perimetro: perimetro, comprimento: comprimento, tesselar: tesselar, nCordas: nCordas,
    interRetas: interRetas, interRetaCirculo: interRetaCirculo, interCirculos: interCirculos, deslocar: deslocar, concordarCanto: concordarCanto,
    tangente: tangente, distSeg: distSeg, mod2pi: mod2pi
  };
  global.BimDesenho = BimDesenho;
  if (typeof module !== "undefined" && module.exports) module.exports = BimDesenho;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

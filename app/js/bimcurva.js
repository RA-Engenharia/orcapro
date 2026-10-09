/* =====================================================================
 * bimcurva.js — PAREDE CURVA (e o que tem segmento curvo), motor PURO.
 *
 * Pedido do Rogério (09/10/2026): "tem que ter a opção de criar a parede
 * curva". ES5, Node-testável, sem DOM e sem three.js. Os arquivos de
 * sempre (js/bimarq.js, js/bimedit.js, js/bimambiente.js, js/ifcsaida.js,
 * js/bim.js, js/bimanot.js, js/desenho2d.js) chamam este por GANCHOS
 * pequenos marcados "CURVA"; sem este arquivo carregado, a parede curva vira
 * a caixa da corda (e o motor avisa).
 *
 * A PEÇA (a op `criar` de sempre, BimEdit.paredeCurva monta a caixa)
 *   caixa de parede + arco: { m: { x, z } }. A caixa (cx, cz, comprimento,
 *   rotY) é a da CORDA do eixo do CORPO (o meio da espessura) — de p1 a p2;
 *   m é o ponto MÉDIO do arco desse eixo. O arco é o que passa por p1, m, p2
 *   (centro, raio e varredura saem daí: BimDesenho.arco). Assim mover,
 *   girar e espelhar a caixa (e o m junto — ganchos CURVA em
 *   BimArq.transladar e js/bimprecisao.js) levam o arco inteiro.
 *   Coordenadas locais (as do BimArq, dobradas no arco):
 *     u = comprimento ao longo do EIXO (o arco do meio da espessura), de
 *         −L/2 (p1) a +L/2 (p2), com L = R·|varredura|;
 *     w = a mesma régua da parede reta: w > 0 à esquerda de quem anda de
 *         p1 para p2 (plano x, z); w < 0 = a face "fora".
 *     raio no ponto (u, w): ρ = R − sinal(varredura)·w — as FACES são
 *     CONCÊNTRICAS (raio R ± t/2), e a LINHA DE LOCALIZAÇÃO (P4) também:
 *     desenhar pela face faz o corpo crescer para dentro/fora do arco.
 *
 * REGRAS (escritas aqui e provadas em tools/test-parede-curva.js)
 *   · QUANTIDADES EXATAS (nada estimado; os trechos retos da tela são só
 *     desenho):
 *       comprimento = o arco do EIXO entre os cortes das pontas (como a
 *         parede reta mede o eixo líquido);
 *       área de cada FACE = o arco DAQUELA face × altura — a face de fora e
 *         a de dentro têm raios diferentes, então áreas diferentes;
 *       volume = a área do ANEL (o setor entre as duas faces, recortado
 *         pelas pontas) × altura, pela fórmula de Green com o termo do arco;
 *       área (eixo) = volume ÷ espessura, a mesma régua da parede reta.
 *   · UNIÕES com parede reta e com outra curva (L em topo, meia-esquadria,
 *     alternar ordem de união; T) com o canto calculado entre arco e reta:
 *     a interseção EXATA das faces (reta × círculo, círculo × círculo).
 *     Topo: a parede de antes vai até a face de lá da outra; a de depois
 *     para na face da primeira — quando essa face é um círculo, o corte da
 *     parede reta é um ARCO (a ponta acompanha a face curva). As faces
 *     terminam na linha da meia-esquadria (o canto de fora e o de dentro),
 *     como na parede reta. "Esquadrar" não se aplica a arco: vira topo.
 *     Cruzamento em X com parede curva não se une (fica sem recorte).
 *   · VÃO (porta/janela) numa parede curva de alvenaria é RETO: a porta e o
 *     batente são retos e ficam na TANGENTE do ponto onde a porta está; o
 *     furo é a faixa de largura igual à da abertura, perpendicular à
 *     tangente (dois cortes paralelos ao raio do meio do vão). O que sai da
 *     parede é exatamente essa faixa ∩ o anel: volume da faixa, e em CADA
 *     face o arco DELA que cai na faixa (2ρ·asen(largura/2ρ): um pouco mais
 *     que a largura, e mais na face de dentro, que é mais curva). O
 *     IfcOpeningElement é a mesma caixa reta.
 *   · TOPO sob laje: plana, por trechos do arco (a laje que cobre parte da
 *     parede corta só aquela parte). Telhado inclinado sobre parede curva
 *     NÃO se acompanha (a altura de um plano ao longo de um arco não é
 *     linear): a parede fica na própria altura e o aviso diz.
 *   · Uniões de geometria (unir parede × pilar/viga/laje com a ordem
 *     alternada) com parede curva: o volume comum usa o desenho em trechos
 *     retos da tela (tolerância de corda de 2 mm) — declarado no aviso.
 *
 * Teste: node tools/test-parede-curva.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BD() { return dep("BimDesenho", "./bimdesenho.js"); }
  var DOIS_PI = 2 * Math.PI, TOL_CORDA = 0.002;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r8(v) { return Math.round(v * 1e8) / 1e8; }
  function P(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function O(q) { return { x: q[0], z: q[1] }; }
  function O6(q) { return { x: r6(q[0]), z: r6(q[1]) }; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function dist(a, b) { return len(sub(a, b)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : null; }
  function esq(d) { return [-d[1], d[0]]; }
  function ang(v) { return Math.atan2(v[1], v[0]); }
  function polar(c, r, t) { return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; }
  function wrapPi(t) { t = t % DOIS_PI; if (t <= -Math.PI) t += DOIS_PI; else if (t > Math.PI) t -= DOIS_PI; return t; }
  function m2(v) { return String(Math.round(v * 1000) / 1000).replace(".", ","); }
  /* propriedade de replay que NÃO vai para op, JSON nem nuvem (como o _exato do BimArq) */
  function anotar(c, k, v) { try { Object.defineProperty(c, k, { value: v, enumerable: false, configurable: true, writable: true }); } catch (e) {} return v; }

  /* ================================================== O EIXO DO CORPO */
  function pontasCorda(c) {
    var L = num(c.comprimento, 0), r = num(c.rotY, 0), co = Math.cos(r), si = Math.sin(r), cx = num(c.cx, 0), cz = num(c.cz, 0);
    return [[cx - L / 2 * co, cz + L / 2 * si], [cx + L / 2 * co, cz - L / 2 * si]];
  }
  /* o arco do eixo do corpo: { ok, c, r, a0 (ângulo de p1), s (varredura com sinal), L, p1, p2, m } */
  function eixoArco(c) {
    if (!c || !c.arco || !c.arco.m) return { ok: false, motivo: "não é parede curva" };
    var B = BD(); if (!B) return { ok: false, motivo: "o motor de desenho (js/bimdesenho.js) não carregou" };
    var pp = pontasCorda(c), m = P(c.arco.m), i = B.arco(pp[0], pp[1], m);
    if (!i.ok) return i;
    i.p1 = pp[0]; i.p2 = pp[1]; i.m = i.meio;
    return i;
  }
  /* o que impede o arco de virar parede (null = pode) */
  function motivoArco(p1, p2, m, espessura) {
    var B = BD(); if (!B) return "o motor de desenho (js/bimdesenho.js) não carregou";
    var i = B.arco(p1, p2, m); if (!i.ok) return i.motivo;
    var t = num(espessura, 0.15);
    if (i.r - t / 2 < 0.01) return "O raio do arco (" + m2(i.r) + " m) é menor que meia espessura da parede (" + m2(t / 2) + " m): a face de dentro não existe.";
    if (Math.abs(i.s) > DOIS_PI - 0.01) return "O arco dá a volta inteira: desenhe o círculo (duas paredes de meia volta).";
    return null;
  }

  /* MODELO da parede para o recorte (reta ou curva): ponto (u, w), local de
     um ponto do mundo, a tangente, a curva da face em w, as pontas do eixo */
  function modelo(c) {
    var t = num(c.espessura, 0), H = num(c.altura, 0), y0 = num(c.cy, 0) - H / 2, W = { ok: true, c: c, t: t, y0: y0, y1: y0 + H };
    if (c.arco) {
      var e = eixoArco(c); if (!e.ok) return e;
      var C = e.c, R = e.r, sg = e.s > 0 ? 1 : -1, tm = e.a0 + e.s / 2;
      W.arco = true; W.C = C; W.R = R; W.sg = sg; W.s = e.s; W.L = e.L; W.tm = tm;
      W.pt = function (u, w) { return polar(C, R - sg * w, tm + sg * u / R); };
      W.local = function (Q) { var v = sub(Q, C); return [sg * wrapPi(ang(v) - tm) * R, sg * (R - len(v))]; };
      W.tan = function (u) { var th = tm + sg * u / R, rv = [Math.cos(th), Math.sin(th)]; return sg > 0 ? [-rv[1], rv[0]] : [rv[1], -rv[0]]; };
      W.face = function (w) { return { c: C, r: R - sg * w }; };
      W.rho = function (w) { return R - sg * w; };
    } else {
      var r = num(c.rotY, 0), d = [Math.cos(r), -Math.sin(r)], n = [Math.sin(r), Math.cos(r)], M = [num(c.cx, 0), num(c.cz, 0)];
      W.arco = false; W.L = num(c.comprimento, 0); W.d = d; W.n = n; W.M = M;
      W.pt = function (u, w) { return [M[0] + u * d[0] + w * n[0], M[1] + u * d[1] + w * n[1]]; };
      W.local = function (Q) { var v = sub(Q, M); return [dot(v, d), dot(v, n)]; };
      W.tan = function () { return d; };
      W.face = function (w) { return { reta: true, p: [M[0] + w * n[0], M[1] + w * n[1]], d: d }; };
    }
    W.E = [W.pt(-W.L / 2, 0), W.pt(W.L / 2, 0)];
    return W;
  }
  /* comprimento NA FACE w entre ua e ub (u do eixo) */
  function compFace(W, ua, ub, w) { return W.arco ? (ub - ua) * W.rho(w) / W.R : ub - ua; }

  /* ================================================== CURVAS (cortes)
   * { reta: true, p, d } ou { c, r } (círculo) */
  function inter(K1, K2) {
    var B = BD();
    if (K1.reta && K2.reta) { var X = B.interRetas(K1.p, K1.d, K2.p, K2.d); return X ? [X] : []; }
    if (K1.reta) return B.interRetaCirculo(K1.p, K1.d, K2.c, K2.r);
    if (K2.reta) return B.interRetaCirculo(K2.p, K2.d, K1.c, K1.r);
    return B.interCirculos(K1.c, K1.r, K2.c, K2.r);
  }
  function maisPerto(lista, alvo) { var b = null, dm = Infinity; lista.forEach(function (q) { var d = dist(q, alvo); if (d < dm) { dm = d; b = q; } }); return b; }
  /* o u (eixo) onde a face w encontra a curva K, o mais perto de uN */
  function uCorte(W, K, w, uN) {
    var X = inter(W.face(w), K), best = null, dm = Infinity;
    X.forEach(function (q) { var u = W.local(q)[0], d = Math.abs(u - uN); if (d < dm) { dm = d; best = u; } });
    return best;
  }
  /* a reta perpendicular ao eixo no u (na curva: o raio) */
  function cortePerp(W, u) {
    var Pu = W.pt(u, 0);
    return { reta: true, p: Pu, d: W.arco ? unit(sub(Pu, W.C)) : W.n };
  }
  /* reta local da parede reta (u = c0 + c1·w) → curva no mundo */
  function retaDeLocal(W, l) { var a = W.pt(l.c0 - l.c1, -1), b = W.pt(l.c0 + l.c1, 1); return { reta: true, p: a, d: sub(b, a) }; }
  /* curva → reta local (só reta não paralela ao eixo) */
  function localDeReta(W, K) {
    if (!K.reta) return null;
    var a = W.local(K.p), b = W.local(add(K.p, K.d)), dw = b[1] - a[1];
    if (Math.abs(dw) < 1e-12) return null;
    var c1 = (b[0] - a[0]) / dw; return { c0: a[0] - c1 * a[1], c1: c1 };
  }
  /* o corte de uma ponta: { K (o corte do corpo), F (onde as faces terminam) } */
  function corteDe(W, un, k) {
    var cs = un && un.cortes && un.cortes[k ? "fim" : "ini"];
    if (cs && cs.K) return { K: cs.K, F: cs.F || cs.K };
    if (!W.arco && un) {
      var l = k ? un.fim : un.ini, lf = k ? (un.faceFim || un.fim) : (un.faceIni || un.ini);
      if (l) return { K: retaDeLocal(W, l), F: retaDeLocal(W, lf || l) };
    }
    var K0 = cortePerp(W, k ? W.L / 2 : -W.L / 2); return { K: K0, F: K0 };
  }
  function temCorteCurvo(un) {
    var cs = un && un.cortes;
    return !!cs && ["ini", "fim"].some(function (k) { return cs[k] && ((cs[k].K && !cs[k].K.reta) || (cs[k].F && !cs[k].F.reta)); });
  }
  /* parede que o recorte deste arquivo desenha e mede */
  function ehCurva(c) { return !!c && c.tipo === "parede" && (!!c.arco || temCorteCurvo(c.uniao)); }

  /* ================================================== CONTORNO EXATO
   * um trecho em arco por três pontos (q em qualquer lugar do arco) → { tipo, a, b, m (o MEIO) } */
  function segArco(a, b, q) {
    var i = BD().arco(a, b, q);
    if (!i.ok) return { tipo: "reta", a: O(a), b: O(b) };
    return { tipo: "arco", a: O(a), b: O(b), m: O(i.meio) };
  }
  function segReta(a, b) { return { tipo: "reta", a: O(a), b: O(b) }; }
  /* o contorno da fatia entre os cortes A e B (u nas faces −t/2 e +t/2: uA, uB) */
  function contornoFatia(W, A, B, uA, uB) {
    var h = W.t / 2, p1 = W.pt(uA[0], -h), p2 = W.pt(uB[0], -h), p3 = W.pt(uB[1], h), p4 = W.pt(uA[1], h), s = [];
    function poe(sg, lado) { sg.lado = lado; s.push(sg); }
    if (dist(p1, p2) > 1e-9) poe(W.arco ? segArco(p1, p2, W.pt((uA[0] + uB[0]) / 2, -h)) : segReta(p1, p2), -1);
    if (dist(p2, p3) > 1e-9) poe(B.K.reta ? segReta(p2, p3) : segArco(p2, p3, W.pt(B.u0, 0)), 0);
    if (dist(p3, p4) > 1e-9) poe(W.arco ? segArco(p3, p4, W.pt((uA[1] + uB[1]) / 2, h)) : segReta(p3, p4), 1);
    if (dist(p4, p1) > 1e-9) poe(A.K.reta ? segReta(p4, p1) : segArco(p4, p1, W.pt(A.u0, 0)), 0);
    return s;
  }
  /* ÁREA e CENTROIDE exatos de um contorno de retas e arcos: o polígono das
     cordas + o segmento circular de cada arco (área r²/2·(φ − sen φ),
     centroide a 4r·sen³(φ/2) / (3(φ − sen φ)) do centro, na direção do meio
     do arco), com o sinal do lado em que o arco estufa. A área com sinal é
     a mesma da fórmula de Green (BimDesenho.areaContorno) — o teste confere. */
  function momentos(segs) {
    var A = 0, Mx = 0, Mz = 0, B = BD();
    segs.forEach(function (sg) {
      var a = P(sg.a), b = P(sg.b), k = a[0] * b[1] - b[0] * a[1];
      A += k / 2; Mx += (a[0] + b[0]) * k / 6; Mz += (a[1] + b[1]) * k / 6;
      if (sg.tipo !== "arco") return;
      var i = B.arco(sg.a, sg.b, sg.m); if (!i.ok) return;
      var fi = Math.abs(i.s), As = i.r * i.r / 2 * (fi - Math.sin(fi));
      if (!(As > 0)) return;
      var dcen = 4 * i.r * Math.pow(Math.sin(fi / 2), 3) / (3 * (fi - Math.sin(fi))), dir = unit(sub(P(sg.m), i.c));
      var cen = add(i.c, mul(dir, dcen)), sig = cross(sub(b, a), sub(P(sg.m), a)) > 0 ? -1 : 1;
      A += sig * As; Mx += sig * As * cen[0]; Mz += sig * As * cen[1];
    });
    return { A: A, cx: A ? Mx / A : 0, cz: A ? Mz / A : 0 };
  }
  /* os pontos do desenho (as cordas pela tolerância), com o lado de cada aresta */
  function tesselarSegs(segs, tol) {
    var B = BD(), pts = [], lados = [];
    segs.forEach(function (sg) {
      var a = P(sg.a);
      if (!pts.length || dist(pts[pts.length - 1], a) > 1e-9) { pts.push(a); lados.push(sg.lado); }
      if (sg.tipo === "arco") {
        var i = B.arco(sg.a, sg.b, sg.m);
        if (i.ok) { var n = B.nCordas(i.r, i.s, tol || TOL_CORDA); for (var j = 1; j < n; j++) { pts.push(polar(i.c, i.r, i.a0 + i.s * j / n)); lados.push(sg.lado); } }
      }
      pts.push(P(sg.b)); lados.push(null);
    });
    if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-9) { pts.pop(); lados.pop(); }
    return pts;
  }

  /* ================================================== AS FATIAS (pecas)
   * O mesmo contrato do BimArq.pecasParede: { pecas:[{ pts (o desenho, em
   * trechos retos pela tolerância de corda), segs (o contorno EXATO), y0,
   * ytopo:[por ponto], lin, q, area }], volume, faces:{fora, dentro},
   * comprimento (eixo líquido) } — os prismas que o 3D desenha e que o
   * quantitativo soma, recortados nas pontas, nos vãos e nas quebras do topo. */
  function linhasVao(W, v) {
    if (!W.arco) return [cortePerp(W, v.x0), cortePerp(W, v.x1)];
    /* o vão RETO: dois cortes paralelos ao raio do meio do vão, a meia largura para cada lado na tangente */
    var Pm = W.pt(v.t, 0), T = W.tan(v.t), nr = esq(T), a = v.larg / 2;
    return [{ reta: true, p: sub(Pm, mul(T, a)), d: nr }, { reta: true, p: add(Pm, mul(T, a)), d: nr }];
  }
  function pecas(c, vaos) {
    var W = modelo(c), vazio = { pecas: [], volume: 0, faces: { fora: 0, dentro: 0 }, comprimento: 0 };
    if (!W.ok || !(W.t > 0) || !(W.L > 0)) return vazio;
    var t = W.t, h = t / 2, L = W.L, un = c.uniao || {}, ini = corteDe(W, un, 0), fim = corteDe(W, un, 1);
    function U(K, w, uN) { return uCorte(W, K, w, uN); }
    var u0i = U(ini.K, 0, -L / 2), u0f = U(fim.K, 0, L / 2);
    if (u0i == null || u0f == null || !(u0f > u0i)) return vazio;
    var topo = arr(c.topo).length ? c.topo : [{ u0: -1e9, u1: 1e9, a: W.y1, b: 0 }];
    var vz = arr(vaos).map(function (v) {
      var x0 = num(v.x0, 0), x1 = num(v.x1, 0);
      return { x0: x0, x1: x1, y0: num(v.y0, 0), y1: num(v.y1, 0), t: v.t != null ? num(v.t, (x0 + x1) / 2) : (x0 + x1) / 2, larg: v.largura != null ? num(v.largura, x1 - x0) : x1 - x0 };
    });
    var cort = [];
    arr(un.cruz).forEach(function (g, gi) { cort.push({ K: retaDeLocal(W, g.a), uN: g.a.c0, cruz: gi }, { K: retaDeLocal(W, g.b), uN: g.b.c0, cruz: gi }); });
    vz.forEach(function (v, vi) { var ls = linhasVao(W, v); cort.push({ K: ls[0], uN: v.x0, vao: vi }, { K: ls[1], uN: v.x1, vao: vi }); });
    topo.forEach(function (sg) { if (sg.u0 > -1e8 && sg.u0 > u0i + 0.005 && sg.u0 < u0f - 0.005) cort.push({ K: cortePerp(W, sg.u0), uN: sg.u0 }); });
    cort.forEach(function (x) { x.u0 = U(x.K, 0, x.uN); });
    /* as faixas dos vãos e dos cruzamentos, no eixo */
    var faixaVao = {}, faixaCruz = {};
    cort.forEach(function (x) {
      if (x.u0 == null) return;
      var M = x.vao != null ? faixaVao : (x.cruz != null ? faixaCruz : null), k = x.vao != null ? x.vao : x.cruz;
      if (!M) return; M[k] = M[k] || [Infinity, -Infinity]; M[k][0] = Math.min(M[k][0], x.u0); M[k][1] = Math.max(M[k][1], x.u0);
    });
    cort = cort.filter(function (x) { return x.u0 != null && x.u0 > u0i + 1e-6 && x.u0 < u0f - 1e-6; });
    cort.sort(function (p, q) { return p.u0 - q.u0; });
    var lista = [{ K: ini.K, uN: -L / 2, u0: u0i, ponta: 0 }].concat(cort).concat([{ K: fim.K, uN: L / 2, u0: u0f, ponta: 1 }]);
    function segEm(m) { for (var k = 0; k < topo.length; k++) if (m >= topo[k].u0 - 1e-9 && m <= topo[k].u1 + 1e-9) return topo[k]; return topo[m < topo[0].u0 ? 0 : topo.length - 1]; }
    var out = [], vol = 0, fm = 0, fp = 0, comp = 0;
    for (var i = 0; i + 1 < lista.length; i++) {
      var A = lista[i], Bc = lista[i + 1], m = (A.u0 + Bc.u0) / 2;
      if (Bc.u0 - A.u0 < 1e-7) continue;
      if (Object.keys(faixaCruz).some(function (k) { return m > faixaCruz[k][0] && m < faixaCruz[k][1]; })) continue;
      comp += Bc.u0 - A.u0;
      var sg = segEm(m), vk = null;
      Object.keys(faixaVao).forEach(function (k) { if (m > faixaVao[k][0] && m < faixaVao[k][1]) vk = Number(k); });
      var v = vk != null ? vz[vk] : null;
      var uA = [U(A.K, -h, A.uN), U(A.K, h, A.uN)], uB = [U(Bc.K, -h, Bc.uN), U(Bc.K, h, Bc.uN)];
      if (uA[0] == null || uA[1] == null || uB[0] == null || uB[1] == null) continue;
      if (uB[0] < uA[0]) uB[0] = uA[0];
      if (uB[1] < uA[1]) uB[1] = uA[1];
      var segs = contornoFatia(W, A, Bc, uA, uB), Mo = momentos(segs), Aq = Math.abs(Mo.A);
      if (Aq < 1e-12) continue;
      var ucen = W.local([Mo.cx, Mo.cz])[0];
      /* as FACES terminam nos cantos da meia-esquadria (F) nas pontas unidas */
      var FA = A.ponta === 0 ? ini.F : A.K, FB = Bc.ponta === 1 ? fim.F : Bc.K;
      var uf = [U(FA, -h, A.uN), U(FB, -h, Bc.uN), U(FB, h, Bc.uN), U(FA, h, A.uN)];
      if (uf.some(function (x) { return x == null; })) uf = [uA[0], uB[0], uB[1], uA[1]];
      if (uf[1] < uf[0]) uf[1] = uf[0];
      if (uf[2] < uf[3]) uf[2] = uf[3];
      var pts = tesselarSegs(segs, TOL_CORDA), us = pts.map(function (q) { return W.local(q)[0]; });
      var faixas = v ? [[W.y0, W.y0 + v.y0], [W.y0 + v.y1, null]] : [[W.y0, null]];
      faixas.forEach(function (fx) {
        var yb = fx[0];
        function hTopo(u) { return fx[1] == null ? Math.max(yb, sg.a + sg.b * u) : fx[1]; }
        var yt = us.map(hTopo);
        if (Math.max.apply(null, yt) - yb < 1e-6) return;
        vol += Aq * (hTopo(ucen) - yb);
        fm += compFace(W, uf[0], uf[1], -h) * ((hTopo(uf[0]) - yb) + (hTopo(uf[1]) - yb)) / 2;
        fp += compFace(W, uf[3], uf[2], h) * ((hTopo(uf[3]) - yb) + (hTopo(uf[2]) - yb)) / 2;
        out.push({ pts: pts.map(function (q) { return [r6(q[0]), r6(q[1])]; }), y0: r6(yb), ytopo: yt.map(r6),
                   lin: fx[1] == null ? { a: sg.a, b: sg.b } : { a: fx[1], b: 0 }, q: pts.map(function (q) { return [q[0], q[1]]; }),
                   segs: segs, area: Aq });
      });
    }
    var inv = !!c.inverterFaces;
    return { pecas: out, volume: vol, faces: { fora: inv ? fp : fm, dentro: inv ? fm : fp }, comprimento: comp };
  }

  /* ================================================== TOPO (sob laje)
   * trechos do EIXO [{ u0, u1, a, b: 0 }] — a laje que cobre um trecho do
   * arco corta só aquele trecho. Superfície inclinada: não acompanha (aviso). */
  function topo(c, sups) {
    var W = modelo(c); if (!W.ok) return [];
    var base = W.y0, proprio = W.y1, anexar = !!c.anexarTopo, L = W.L, avisos = [];
    var ext = Math.min(2 * W.t + 0.5, Math.max(0, (Math.PI * W.R - L / 2) * 0.9)), U0 = -L / 2 - ext, U1 = L / 2 + ext, bps = [U0, U1];
    arr(sups).forEach(function (s) {
      arr(s.bordas).forEach(function (sg) {
        var a = sg[0], b = sg[1];
        BD().interRetaCirculo(a, sub(b, a), W.C, W.R).forEach(function (q) {
          var tt = dot(sub(q, a), sub(b, a)) / Math.max(1e-18, dot(sub(b, a), sub(b, a)));
          if (tt < -1e-9 || tt > 1 + 1e-9) return;
          var u = W.local(q)[0]; if (u > U0 && u < U1) bps.push(u);
        });
      });
    });
    bps.sort(function (x, y) { return x - y; });
    bps = bps.filter(function (v, k) { return k === 0 || v - bps[k - 1] > 1e-7; });
    var segs = [], inclinada = false;
    for (var k = 0; k + 1 < bps.length; k++) {
      var u0 = bps[k], u1 = bps[k + 1], m = (u0 + u1) / 2, p = W.pt(m, 0), G = [];
      var pa = W.pt(m - Math.min(0.05, (u1 - u0) / 4), 0), pb = W.pt(m + Math.min(0.05, (u1 - u0) / 4), 0);
      arr(sups).forEach(function (s) {
        if (!s.cobre(p[0], p[1], W.t / 2)) return;
        var y = s.y(p[0], p[1]); if (!(y > base + 0.1)) return;
        if (arr(s.dobras).length || Math.abs(s.y(pa[0], pa[1]) - y) > 1e-9 || Math.abs(s.y(pb[0], pb[1]) - y) > 1e-9) { inclinada = true; return; }
        G.push(y);
      });
      if (!anexar || !G.length) G.push(proprio);
      var a = Math.min.apply(null, G), ult = segs[segs.length - 1];
      if (ult && Math.abs(ult.a - a) < 1e-9) ult.u1 = u1; else segs.push({ u0: u0, u1: u1, a: a, b: 0 });
    }
    if (inclinada) avisos.push("Telhado ou superfície inclinada sobre a parede curva: o topo não acompanha a inclinação (fica na altura da parede).");
    anotar(c, "_avisosCurva", avisos);
    return segs;
  }

  /* ================================================== UNIÕES
   * Chamado pelo BimArq.juntas (gancho CURVA) quando há parede curva: as
   * retas entre si ficam com o motor de sempre; aqui entra todo par com
   * pelo menos uma curva (L e T). Devolve o mesmo mapa { id: { ini, fim,
   * faceIni, faceFim, cruz, abut, juntas, livre } } com, em quem tem corte
   * vindo de uma curva, `cortes: { ini|fim: { K, F } }` (as curvas exatas). */
  function juntas(BA, paredes, o) {
    o = o || {};
    var out = BA.juntas(arr(paredes).filter(function (c) { return c && !c.arco; }), { juntaCanto: o.juntaCanto, _semCurva: true });
    var TOL = 0.03, Ws = [], padrao = o.juntaCanto === "esquadria" ? "esquadria" : "topo";
    arr(paredes).forEach(function (c) {
      if (!c) return;
      var W = modelo(c); if (!W.ok || !(W.L > 0.01 && W.t > 0)) return;
      if (!out[c.id]) out[c.id] = { ini: null, fim: null, faceIni: null, faceFim: null, cruz: [], abut: [], juntas: [], livre: [true, true] };
      var lv = out[c.id].livre || [true, true];
      W.usado = [!lv[0], !lv[1]]; W.ext = [-W.L / 2, W.L / 2]; W.k = Ws.length;
      Ws.push(W);
    });
    function sobrepoe(A, B) { return Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.05; }
    function desunidas(A, B) { return BA.geoUniao(A.c, B.c).unida === false; }
    function secaoPonta(A, k) { return [A.pt(A.ext[k], -A.t / 2), A.pt(A.ext[k], A.t / 2)]; }
    function distSegs(p, q, r, s) {
      var B = BD();
      return Math.min(B.distSeg(p, { tipo: "reta", a: O(r), b: O(s) }), B.distSeg(q, { tipo: "reta", a: O(r), b: O(s) }), B.distSeg(r, { tipo: "reta", a: O(p), b: O(q) }), B.distSeg(s, { tipo: "reta", a: O(p), b: O(q) }));
    }
    function encostam(A, a, B, b) {
      if (dist(A.E[a], B.E[b]) <= TOL) return true;
      if (!A.c.linhaLoc && !B.c.linhaLoc) return false;
      var sa = secaoPonta(A, a), sb = secaoPonta(B, b);
      return distSegs(sa[0], sa[1], sb[0], sb[1]) <= TOL;
    }
    /* a direção de quem SAI pela ponta k (para fora da parede) */
    function sai(A, k) { var T = A.tan(A.ext[k]); return k === 1 ? T : mul(T, -1); }
    /* a face de W do lado para onde `dir` aponta a partir de P */
    function faceLado(W, Pq, dir) {
      var w0 = W.local(Pq)[1], w1 = W.local(add(Pq, mul(dir, 1e-3)))[1];
      return W.face((w1 - w0 >= 0 ? 1 : -1) * W.t / 2);
    }
    /* u das duas faces na ponta k pelo corte K (null se não corta) */
    function usPonta(W, k, K) { var a = uCorte(W, K, -W.t / 2, W.ext[k]), b = uCorte(W, K, W.t / 2, W.ext[k]); return a == null || b == null ? null : [a, b]; }
    function corteAtual(W, k) {
      var o2 = out[W.c.id], cs = o2.cortes && o2.cortes[k ? "fim" : "ini"];
      if (cs) return cs.K;
      var l = !W.arco ? (k ? o2.fim : o2.ini) : null;   /* a ponta que o motor das retas já cortou */
      return l ? retaDeLocal(W, l) : cortePerp(W, W.ext[k]);
    }
    /* o corte deixa comprimento nas duas faces, sem ir longe demais (ângulo muito fechado) */
    function pontaValida(W, k, K) {
      var u = usPonta(W, k, K), uo = usPonta(W, 1 - k, corteAtual(W, 1 - k));
      if (!u || !uo) return false;
      if (Math.abs(u[1] - u[0]) / W.t > 6) return false;
      if (u.some(function (x) { return Math.abs(x - W.ext[k]) > W.L / 2 + 3 * W.t + 0.5; })) return false;
      return k === 0 ? (u[0] < uo[0] - 0.01 && u[1] < uo[1] - 0.01) : (u[0] > uo[0] + 0.01 && u[1] > uo[1] + 0.01);
    }
    function poeCorte(W, k, K, F) {
      var o2 = out[W.c.id], nome = k ? "fim" : "ini";
      (o2.cortes = o2.cortes || {})[nome] = { K: K, F: F || K };
      if (!W.arco) {
        /* a parede reta: a reta local exata (corte reto) ou a corda dos cantos (corte em arco) — quem
           lê ini/fim continua achando a ponta; a fatia exata sai do recorte deste arquivo */
        var lK = localDeReta(W, K), lF = localDeReta(W, F || K), u = usPonta(W, k, K);
        if (!lK && u) lK = { c0: (u[0] + u[1]) / 2, c1: (u[1] - u[0]) / W.t };
        if (!lF) lF = lK;
        if (lK) o2[nome] = lK;
        if (lF) o2[k ? "faceFim" : "faceIni"] = lF;
      }
    }
    function junta(A, B, tipo, modo, inv) {
      var ja = { tipo: tipo, com: B.c.id }, jb = { tipo: tipo, com: A.c.id };
      if (modo) { ja.modo = jb.modo = modo; if (modo === "topo") { ja.passa = !inv; jb.passa = !!inv; } }
      if (inv) ja.alternada = jb.alternada = true;
      ja.curva = jb.curva = true;
      out[A.c.id].juntas.push(ja); out[B.c.id].juntas.push(jb);
    }
    var i, j, a, b;
    /* ---- L (pontas que se encontram) ---- */
    for (i = 0; i < Ws.length; i++) for (j = i + 1; j < Ws.length; j++) {
      var A = Ws[i], B = Ws[j];
      if ((!A.arco && !B.arco) || !sobrepoe(A, B) || desunidas(A, B)) continue;
      for (a = 0; a < 2; a++) for (b = 0; b < 2; b++) {
        if (A.usado[a] || B.usado[b] || !encostam(A, a, B, b)) continue;
        var Pq = mul(add(A.E[a], B.E[b]), 0.5), di = sai(A, a), ej = mul(sai(B, b), -1);
        var cr = cross(di, ej), dt = dot(di, ej);
        if (Math.abs(cr) < 0.02) { if (dt > 0) { A.usado[a] = B.usado[b] = true; junta(A, B, "I"); } continue; }
        /* as faces da ESQUERDA do caminho A → canto → B e as da direita */
        var sA = a === 1 ? 1 : -1, sB = b === 0 ? 1 : -1;
        var Ql = maisPerto(inter(A.face(sA * A.t / 2), B.face(sB * B.t / 2)), Pq), Qr = maisPerto(inter(A.face(-sA * A.t / 2), B.face(-sB * B.t / 2)), Pq);
        if (!Ql || !Qr || dist(Ql, Pq) > 2 * (A.t + B.t) + 0.5 || dist(Qr, Pq) > 2 * (A.t + B.t) + 0.5 || dist(Ql, Qr) < 1e-9) continue;
        var meia = { reta: true, p: Ql, d: sub(Qr, Ql) };
        if (!pontaValida(A, a, meia) || !pontaValida(B, b, meia)) continue;
        var modo = (A.c.juntaCanto === "esquadria" || B.c.juntaCanto === "esquadria") ? "esquadria" : padrao;
        var cfg = BA.uniaoPar(A.c, B.c), inv = !!cfg.inverter;
        if (cfg.modo) modo = cfg.modo === "quadrado" ? "topo" : cfg.modo;
        var KA = meia, KB = meia;
        if (modo === "topo") {
          KA = faceLado(B, Pq, inv ? mul(di, -1) : di); KB = faceLado(A, Pq, inv ? mul(ej, -1) : ej);
          if (!pontaValida(A, a, KA) || !pontaValida(B, b, KB)) { KA = KB = meia; modo = "esquadria"; inv = false; }
        } else inv = false;
        poeCorte(A, a, KA, meia); poeCorte(B, b, KB, meia);
        A.usado[a] = B.usado[b] = true;
        junta(A, B, "L", modo, inv);
      }
    }
    /* ---- T (a ponta morre dentro da outra) ---- */
    for (j = 0; j < Ws.length; j++) for (b = 0; b < 2; b++) {
      var J = Ws[j]; if (J.usado[b]) continue;
      var Ep = J.E[b];
      for (i = 0; i < Ws.length; i++) {
        if (i === j) continue;
        var I = Ws[i];
        if ((!I.arco && !J.arco) || !sobrepoe(I, J) || desunidas(I, J)) continue;
        var lc = I.local(Ep);
        if (Math.abs(lc[1]) > I.t / 2 + TOL || lc[0] < -I.L / 2 - TOL || lc[0] > I.L / 2 + TOL) continue;
        if (Math.abs(cross(I.tan(lc[0]), J.tan(J.ext[b]))) < 0.2) continue;   /* quase paralelas: não é T */
        var lo = I.local(J.E[1 - b]);
        if (Math.abs(lo[1]) <= I.t / 2) continue;
        var s = lo[1] > 0 ? 1 : -1, K = I.face(s * I.t / 2);
        if (!pontaValida(J, b, K)) continue;
        poeCorte(J, b, K, K); J.usado[b] = true;
        /* o trecho da face de I coberto por J (não leva revestimento) */
        var us = [-1, 1].map(function (sj) { var q = maisPerto(inter(J.face(sj * J.t / 2), K), Ep); return q ? I.local(q)[0] : null; });
        if (us[0] != null && us[1] != null) {
          var u0 = Math.max(-I.L / 2, Math.min(us[0], us[1])), u1 = Math.min(I.L / 2, Math.max(us[0], us[1]));
          if (u1 - u0 > 1e-6) {
            var ab = { lado: s, u0: r6(u0), u1: r6(u1), com: J.c.id, topo: J.y1, base: J.y0 };
            if (I.arco) ab.comp = r6(compFace(I, u0, u1, s * I.t / 2));
            out[I.c.id].abut.push(ab);
          }
        }
        junta(I, J, "T");
        break;
      }
    }
    Ws.forEach(function (W) { out[W.c.id].livre = [!W.usado[0], !W.usado[1]]; });
    return out;
  }

  /* ================================================== VÃOS NA PAREDE CURVA
   * o mesmo contrato do BimEdit.vaosNaParede; aceitos levam também t e
   * largura (o vão reto pela tangente). areaVaos = o volume que a faixa tira
   * ÷ espessura (a régua "área × espessura = volume" do orçamento); o que
   * cada FACE perde vai em c._vaosCurva (não enumerável) para o
   * BimEdit.medidasDe e o BimArq.camadasDe. */
  function vaosNaParede(c, vaos) {
    var W = modelo(c), H = num(c.altura, 0), ok = [], conflitos = [], vazio = { pedacos: [], areaVaos: 0, areaLiquida: r4(num(c.area, 0)), conflitos: [], aceitos: [] };
    if (!W.ok) return vazio;
    var h = W.t / 2, Rin = W.R - h, lista = [];
    arr(vaos).forEach(function (v) {
      var larg = num(v.largura, 0), tt = num(v.t, 0), y0 = Math.max(0, num(v.peitoril, 0)), y1 = Math.min(H, num(v.peitoril, 0) + num(v.altura, 0));
      if (!(larg > 0.01) || !(y1 - y0 > 0.01)) return;
      if (larg / 2 >= Rin - 1e-6) { conflitos.push(v.id); return; }
      var ls = linhasVao(W, { t: tt, larg: larg }), us = [];
      [[0, -h], [0, 0], [0, h], [1, -h], [1, 0], [1, h]].forEach(function (k) { us.push(uCorte(W, ls[k[0]], k[1], tt + (k[0] ? 1 : -1) * larg / 2)); });
      if (us.some(function (u) { return u == null || u < -W.L / 2 - 1e-9 || u > W.L / 2 + 1e-9; })) { conflitos.push(v.id); return; }   /* o vão sai da parede */
      lista.push({ id: v.id, x0: us[1], x1: us[4], y0: y0, y1: y1, t: tt, largura: larg, K: ls, uA: [us[0], us[2]], uB: [us[3], us[5]] });
    });
    lista.sort(function (p, q) { return p.x0 - q.x0; });
    var Vrem = 0, ded = { fora: 0, dentro: 0 }, inv = !!c.inverterFaces, abert = 0;
    lista.forEach(function (v) {
      var ult = ok[ok.length - 1];
      if (ult && v.x0 < ult.x1 - 1e-6) { conflitos.push(v.id); return; }
      ok.push(v);
      var segs = contornoFatia(W, { K: v.K[0], u0: v.x0 }, { K: v.K[1], u0: v.x1 }, v.uA, v.uB), hv = v.y1 - v.y0;
      Vrem += Math.abs(momentos(segs).A) * hv;
      var dm = compFace(W, v.uA[0], v.uB[0], -h) * hv, dp = compFace(W, v.uA[1], v.uB[1], h) * hv;
      ded[inv ? "dentro" : "fora"] += dm; ded[inv ? "fora" : "dentro"] += dp;
      abert += v.largura * hv;
    });
    var aV = W.t > 0 ? Vrem / W.t : 0;
    anotar(c, "_vaosCurva", { areaVaos: r4(aV), exata: aV, fora: ded.fora, dentro: ded.dentro, volume: Vrem, abertura: abert });
    return {
      pedacos: [], areaVaos: r4(aV), areaLiquida: r4(num(c.area, 0) - aV), conflitos: conflitos,
      aceitos: ok.map(function (v) { return { id: v.id, x0: r6(v.x0), x1: r6(v.x1), y0: r4(v.y0), y1: r4(v.y1), t: v.t, largura: v.largura }; })
    };
  }
  /* família hospedada: o pé do vão no eixo, girada na TANGENTE */
  function posicaoHospedada(c, t) {
    var W = modelo(c); if (!W.ok) return null;
    var p = W.pt(num(t, 0), 0), T = W.tan(num(t, 0));
    return { x: r4(p[0]), y: r4(W.y0), z: r4(p[1]), rotY: r4(Math.atan2(-T[1], T[0])) };
  }
  function tNaParede(c, p) { var W = modelo(c); return W.ok ? r4(Math.max(-W.L / 2, Math.min(W.L / 2, W.local(P(p))[0]))) : 0; }

  /* ================================================== CRIAR / AJUSTAR */
  function caixaPelaCorda(o, p1, p2) {
    var dx = p2[0] - p1[0], dz = p2[1] - p1[1];
    o.cx = r6((p1[0] + p2[0]) / 2); o.cz = r6((p1[1] + p2[1]) / 2); o.comprimento = r6(Math.sqrt(dx * dx + dz * dz)); o.rotY = r8(Math.atan2(-dz, dx));
    return o;
  }
  /* a caixa da parede curva (o par do BimEdit.parede): null se o arco não serve (motivoArco diz por quê) */
  function parede(p1, p2, m, espessura, altura, base) {
    var a = P(p1), b = P(p2), q = P(m);
    espessura = num(espessura, 0.15); altura = num(altura, 2.8); base = num(base, 0);
    if (!(espessura > 0) || !(altura > 0) || motivoArco(a, b, q, espessura)) return null;
    var i = BD().arco(a, b, q);
    var c = caixaPelaCorda({ tipo: "parede", ifc: "IFCWALL" }, a, b);
    c.cy = r4(base + altura / 2); c.altura = r4(altura); c.espessura = r4(espessura);
    c.arco = { m: O6(i.meio) };
    c.area = r4(i.L * altura); c.volume = r4(i.L * altura * espessura);
    return c;
  }
  function validar(c) {
    if (!c || !c.arco || !c.arco.m || !fin(Number(c.arco.m.x)) || !fin(Number(c.arco.m.z))) return { ok: false, motivo: "arco sem o ponto do meio" };
    var pp = pontasCorda(c), mot = motivoArco(pp[0], pp[1], c.arco.m, c.espessura);
    return mot ? { ok: false, motivo: mot } : { ok: true };
  }
  /* LINHA DE LOCALIZAÇÃO no arco: o corpo cresce para dentro/fora,
     concêntrico (a linha desenhada fica no lugar) */
  function deslocarPorLinha(c, w) {
    var e = eixoArco(c); if (!e.ok || !fin(w) || !w) return false;
    var sg = e.s > 0 ? 1 : -1, Rb = e.r + sg * w;
    if (!(Rb - num(c.espessura, 0) / 2 > 0.01)) return false;
    var k = Rb / e.r, f = function (q) { return add(e.c, mul(sub(q, e.c), k)); };
    caixaPelaCorda(c, f(e.p1), f(e.p2));
    c.arco = { m: O6(f(e.meio)) };
    return true;
  }
  function transladar(c, dx, dz) { if (c && c.arco && c.arco.m) { c.arco.m.x = r6(num(c.arco.m.x, 0) + dx); c.arco.m.z = r6(num(c.arco.m.z, 0) + dz); } return c; }
  /* o comprimento da LINHA DE LOCALIZAÇÃO (o arco onde a parede foi desenhada: ρ·|varredura|) */
  function comprimentoLocalizacao(c) {
    var e = eixoArco(c); if (!e.ok) return null;
    var BA = dep("BimArq", "./bimarq.js"), w = c.linhaLoc && BA && BA.wLinhaLoc ? BA.wLinhaLoc(c, BA.linhaLocDe(c.linhaLoc)) : 0;
    return (e.r - (e.s > 0 ? 1 : -1) * w) * Math.abs(e.s);
  }
  /* área e volume BRUTOS (sem uniões) — os da caixa recém-criada */
  function brutos(c) { var e = eixoArco(c); return e.ok ? { comprimento: e.L, area: e.L * num(c.altura, 0), volume: e.L * num(c.altura, 0) * num(c.espessura, 0) } : null; }

  /* ================================================== AMBIENTE
   * As pegadas das paredes curvas (e das retas com ponta em arco) para o
   * arranjo plano do js/bimambiente.js: cada arco vira cordas numa GRADE
   * de ângulos comum a todos os arcos do mesmo círculo (e com as pontas de
   * todos eles): duas peças que dividem uma face curva dividem as mesmas
   * cordas, e o arranjo acha a região. Cada aresta leva o arco de onde veio
   * — a área exata sai depois (medirCiclo). */
  var TOL_AMB = 0.001;
  function chaveCirc(c, r) { return r6(c[0]) + "," + r6(c[1]) + "," + r6(r); }
  function contornosAmbiente(paredes) {
    var B = BD(), lista = [], circ = {};
    arr(paredes).forEach(function (c) {
      var r = pecas(c, []), W = modelo(c);
      r.pecas.forEach(function (pc) {
        pc.segs.forEach(function (sg) {
          if (sg.tipo !== "arco") return;
          var i = B.arco(sg.a, sg.b, sg.m); if (!i.ok) return;
          var k = chaveCirc(i.c, i.r); sg._i = i; sg._k = k;
          (circ[k] = circ[k] || { c: i.c, r: i.r, angs: [] }).angs.push(ang(sub(P(sg.a), i.c)), ang(sub(P(sg.b), i.c)));
        });
      });
      lista.push({ c: c, W: W, pecas: r.pecas });
    });
    return lista.map(function (x) {
      return { c: x.c, pecas: x.pecas.map(function (pc) {
        var arestas = [], pts = [];
        pc.segs.forEach(function (sg) {
          var a = P(sg.a), b = P(sg.b);
          if (sg.tipo !== "arco" || !sg._i) { arestas.push({ a: a, b: b, lado: sg.lado, arco: null }); return; }
          var i = sg._i, C = circ[sg._k], n = Math.max(16, Math.ceil(DOIS_PI / (2 * Math.acos(Math.max(-1, 1 - TOL_AMB / i.r))))), d = DOIS_PI / n;
          /* os ângulos dentro do arco: a grade k·d e as pontas dos outros arcos do mesmo círculo */
          var ts = [], pontas = [0, Math.abs(i.s)], folga = 0.005 / i.r;
          function dentro(t) { var x = i.s > 0 ? BD().mod2pi(t - i.a0) : BD().mod2pi(i.a0 - t); return x > 1e-9 && x < Math.abs(i.s) - 1e-9 ? x : null; }
          /* as pontas dos outros arcos do mesmo círculo entram sempre; a grade fica
             a mais de 5 mm delas (o arranjo junta pontos a menos de 1 mm) */
          C.angs.forEach(function (t) { var x2 = dentro(t); if (x2 != null) { ts.push(x2); pontas.push(x2); } });
          for (var k = 0; k < n; k++) { var x = dentro(k * d); if (x != null && !pontas.some(function (q) { return Math.abs(q - x) < folga; })) ts.push(x); }
          ts.sort(function (p, q) { return p - q; });
          ts = ts.filter(function (v, k2) { return k2 === 0 || v - ts[k2 - 1] > 1e-9; });
          var arc = { c: C.c, r: C.r, k: sg._k }, ant = a;
          ts.forEach(function (x3) { var q = polar(i.c, i.r, i.a0 + (i.s > 0 ? x3 : -x3)); arestas.push({ a: ant, b: q, lado: sg.lado, arco: arc }); ant = q; });
          arestas.push({ a: ant, b: b, lado: sg.lado, arco: arc });
        });
        arestas.forEach(function (e) { pts.push(e.a); });
        return { pts: pts, arestas: arestas };
      }) };
    });
  }
  /* a medida de um ciclo do arranjo com lados em ARCO (área de Green com o
     termo do arco e perímetro pelo comprimento do arco), na regra da área:
     cada lado anda para FORA pela distância da regra; o lado em arco anda
     concêntrico (o raio muda), os cantos se refazem pela interseção exata
     das curvas. T = as tags do ciclo (tagsDoCiclo). */
  function medirCiclo(cy, regra, T) {
    var B = BD(), Pn = cy.pts, n = Pn.length;
    function offDe(t) { return regra === "face" ? 0 : num(t && t.off && t.off[regra], 0); }
    /* runs: lados seguidos do mesmo arco viram um lado só */
    var lados = [];
    for (var i = 0; i < n; i++) {
      var t = T[i], a = Pn[i], b = Pn[(i + 1) % n], k = t && t.arco ? t.arco.k : null;
      lados.push({ a: a, b: b, k: k, arco: t && t.arco ? t.arco : null, off: offDe(t), tag: t });
    }
    /* começa num lado que não continua o anterior */
    var ini = 0;
    for (var s = 0; s < n; s++) { var p = lados[(s - 1 + n) % n], q = lados[s]; if (!(q.k && p.k === q.k && Math.abs(p.off - q.off) < 1e-12)) { ini = s; break; } }
    var L = [];
    for (var j = 0; j < n; j++) {
      var x = lados[(ini + j) % n], u = L[L.length - 1];
      if (u && x.k && u.k === x.k && Math.abs(u.off - x.off) < 1e-12) { u.b = x.b; u.angulo += angCorda(x); continue; }
      if (u && !x.k && !u.k && Math.abs(u.off - x.off) < 1e-12 && Math.abs(cross(sub(u.b, u.a), sub(x.b, x.a))) / (len(sub(u.b, u.a)) * len(sub(x.b, x.a)) + 1e-30) < 1e-9 && dot(sub(u.b, u.a), sub(x.b, x.a)) > 0) { u.b = x.b; continue; }
      L.push({ a: x.a, b: x.b, k: x.k, arco: x.arco, off: x.off, angulo: x.k ? angCorda(x) : 0 });
    }
    function angCorda(x) { var c = x.arco.c; return wrapPi(ang(sub(x.b, c)) - ang(sub(x.a, c))); }
    /* as curvas deslocadas (para a DIREITA de quem anda = para fora da região) */
    var Cv = L.map(function (x) {
      if (x.k) {
        var ccw = x.angulo > 0, r2 = x.arco.r + (ccw ? x.off : -x.off);
        return { c: x.arco.c, r: r2, ccw: ccw };
      }
      var d = sub(x.b, x.a), l = len(d), nr = [d[1] / l, -d[0] / l];
      return { reta: true, p: add(x.a, mul(nr, x.off)), d: d };
    });
    var m = L.length, J = [];
    for (var v = 0; v < m; v++) {
      var A = Cv[(v - 1 + m) % m], Bq = Cv[v], V = L[v].a;
      if (L[(v - 1 + m) % m].off === 0 && L[v].off === 0) { J.push([V]); continue; }
      var X = maisPerto(inter(A, Bq), V);
      if (X && dist(X, V) < 10 * (Math.abs(L[v].off) + Math.abs(L[(v - 1 + m) % m].off)) + 1e-6) J.push([X]);
      else {
        /* paralelos com deslocamentos diferentes: degrau */
        var pa = projetar(A, V), pb = projetar(Bq, V); J.push([pa, pb]);
      }
    }
    function projetar(K, Vq) { if (K.reta) { var u2 = unit(K.d), w2 = sub(Vq, K.p); return add(K.p, mul(u2, dot(w2, u2))); } return add(K.c, mul(unit(sub(Vq, K.c)), K.r)); }
    var segs = [];
    /* o CÍRCULO inteiro (a sala dentro de uma parede redonda): um lado só, que volta ao começo — duas metades */
    if (m === 1 && !Cv[0].reta) {
      var K1 = Cv[0], p0 = J[0][0], t00 = ang(sub(p0, K1.c)), sgn = K1.ccw ? 1 : -1, pm = polar(K1.c, K1.r, t00 + sgn * Math.PI);
      segs.push({ tipo: "arco", a: O(p0), b: O(pm), m: O(polar(K1.c, K1.r, t00 + sgn * Math.PI / 2)) }, { tipo: "arco", a: O(pm), b: O(p0), m: O(polar(K1.c, K1.r, t00 + sgn * 1.5 * Math.PI)) });
      m = 0;
    }
    for (var z = 0; z < m; z++) {
      var ent = J[z], sai2 = J[(z + 1) % m], pa2 = ent[ent.length - 1], pb2 = sai2[0], K2 = Cv[z];
      if (K2.reta) { if (dist(pa2, pb2) > 1e-12) segs.push({ tipo: "reta", a: O(pa2), b: O(pb2) }); }
      else {
        var t0 = ang(sub(pa2, K2.c)), t1 = ang(sub(pb2, K2.c)), sw = K2.ccw ? B.mod2pi(t1 - t0) : -B.mod2pi(t0 - t1);
        if (Math.abs(sw) > 1e-12) segs.push({ tipo: "arco", a: O(pa2), b: O(pb2), m: O(polar(K2.c, K2.r, t0 + sw / 2)) });
      }
      if (sai2.length > 1 && dist(sai2[0], sai2[1]) > 1e-12) segs.push({ tipo: "reta", a: O(sai2[0]), b: O(sai2[1]) });
    }
    var area = B.areaContorno(segs), per = B.perimetro(segs), pts = B.tesselar(segs, TOL_CORDA, true);
    return { pts: pts, area: area, perimetro: per, segs: segs };
  }
  /* os lados de um ciclo (rodapé): as cordas do mesmo arco viram um lado, com o comprimento do ARCO */
  function juntarLadosArco(lados) {
    var out = [];
    function mesmo(u, x) { return u && x.arco && u.arco && u.arco.k === x.arco.k && u.fonte && x.fonte && u.fonte.id === x.fonte.id && u.fonte.face === x.fonte.face && Math.abs(u.x1 - x.x0) < 1e-9 && Math.abs(u.z1 - x.z0) < 1e-9; }
    lados.forEach(function (x) {
      if (x.arco) { x._ang = wrapPi(ang([x.x1 - x.arco.c[0], x.z1 - x.arco.c[1]]) - ang([x.x0 - x.arco.c[0], x.z0 - x.arco.c[1]])); x.comprimento = r6(Math.abs(x._ang) * x.arco.r); }
      var u = out[out.length - 1];
      if (mesmo(u, x)) { u.x1 = x.x1; u.z1 = x.z1; u._ang += x._ang; u.comprimento = r6(Math.abs(u._ang) * u.arco.r); return; }
      out.push(x);
    });
    /* o ciclo pode começar no meio do arco: a última volta emenda na primeira */
    if (out.length > 1 && mesmo(out[out.length - 1], out[0])) {
      var ul = out.pop(), pr = out[0];
      pr.x0 = ul.x0; pr.z0 = ul.z0; pr._ang += ul._ang; pr.comprimento = r6(Math.abs(pr._ang) * pr.arco.r);
    }
    out.forEach(function (x) { if (x.arco) { x.arco = { cx: r6(x.arco.c[0]), cz: r6(x.arco.c[1]), r: r6(x.arco.r) }; delete x._ang; } });
    return out;
  }

  /* ================================================== CONTORNO COM ARCO (laje, forro)
   * o ponto do contorno pode levar m: { x, z } — a aresta DELE até o
   * próximo é o arco que passa por m (sem lista dentro de lista: a nuvem
   * aceita). Área e perímetro EXATOS (Green); o desenho e a validação de
   * polígono simples usam as cordas pela tolerância. */
  function temArco(contorno) { return arr(contorno).some(function (p) { return p && p.m && fin(Number(p.m.x)) && fin(Number(p.m.z)); }); }
  function segsContorno(contorno) {
    var C = arr(contorno), n = C.length, out = [];
    for (var i = 0; i < n; i++) {
      var p = C[i], q = C[(i + 1) % n];
      if (p.m && fin(Number(p.m.x)) && fin(Number(p.m.z))) out.push(segArco(P(p), P(q), P(p.m)));
      else out.push(segReta(P(p), P(q)));
    }
    return out;
  }
  function pontosContorno(contorno, tol) { return BD().tesselar(segsContorno(contorno), tol || TOL_CORDA, true); }
  /* o contorno de entrada (lista de pontos, alguns com m) → limpo e conferido */
  function contornoValido(lista, BA) {
    var C = [];
    arr(lista).forEach(function (p) {
      var q = P(p); if (!fin(q[0]) || !fin(q[1])) { C.push(null); return; }
      var u = C[C.length - 1];
      if (u && Math.abs(u.x - q[0]) < 0.005 && Math.abs(u.z - q[1]) < 0.005) return;
      var o = { x: r6(q[0]), z: r6(q[1]) };
      if (p && p.m && fin(Number(p.m.x)) && fin(Number(p.m.z))) o.m = { x: r6(Number(p.m.x)), z: r6(Number(p.m.z)) };
      C.push(o);
    });
    if (C.some(function (x) { return !x; })) return { ok: false, motivo: "Há ponto inválido no contorno." };
    if (C.length > 2 && Math.abs(C[0].x - C[C.length - 1].x) < 0.005 && Math.abs(C[0].z - C[C.length - 1].z) < 0.005) { var ul = C.pop(); if (ul.m) C[C.length - 1].m = C[C.length - 1].m || null; }
    if (C.length < 2) return { ok: false, motivo: "O contorno precisa de pelo menos 2 pontos com um arco." };
    var B = BD();
    for (var i = 0; i < C.length; i++) if (C[i].m) { var a = B.arco(C[i], C[(i + 1) % C.length], C[i].m); if (!a.ok) return { ok: false, motivo: "Aresta " + (i + 1) + ": " + a.motivo }; }
    var tes = pontosContorno(C), v = BA.validarPoligono(tes.map(function (q) { return { x: q[0], z: q[1] }; }));
    if (!v.ok) return v;
    C.forEach(function (x) { if (!x.m) delete x.m; });
    return { ok: true, contorno: C, pts: tes, chaves: chavesContorno(C) };   /* as cordas que são arco, do MESMO contorno limpo */
  }
  /* a chave de uma CORDA (as duas pontas a 10 µm, sem ordem) */
  function chaveCorda(a, b) {
    function k(p) { var q = P(p); return Math.round(q[0] * 1e5) + "," + Math.round(q[1] * 1e5); }
    var x = k(a), y = k(b); return x < y ? x + "|" + y : y + "|" + x;
  }
  /* as cordas de um contorno com aresta em arco (pontos com m) → { chave: { c, r } } */
  function chavesContorno(contorno) {
    var B = BD(), out = {}, C = arr(contorno), n = C.length;
    for (var i = 0; i < n; i++) {
      var p = C[i]; if (!(p && p.m)) continue;
      var sg = segArco(P(p), P(C[(i + 1) % n]), P(p.m)); if (sg.tipo !== "arco") continue;
      var I = B.arco(sg.a, sg.b, sg.m), pts = B.tesselar([sg], TOL_CORDA, false);
      for (var k = 0; k + 1 < pts.length; k++) out[chaveCorda(pts[k], pts[k + 1])] = { c: I.c, r: I.r };
    }
    return out;
  }
  /* a correção EXATA de um laço de cordas: cada corda que é arco (chaves) põe o segmento circular
     r²/2·(φ − sen φ) na REGIÃO se o centro do arco fica do lado dela, tira se não; o perímetro troca a
     corda pelo arco r·φ. dentro = a região é o miolo do laço (contorno) ou o que fica fora (furo).
     Devolve { regiao (o que a área da região muda), perimetro } */
  function corrigirArcos(laco, chaves, dentro) {
    var dA = 0, dP = 0, n = laco.length, S = 0, i;
    for (i = 0; i < n; i++) { var p0 = P(laco[i]), p1 = P(laco[(i + 1) % n]); S += p0[0] * p1[1] - p1[0] * p0[1]; }
    var regiaoEsq = dentro === false ? S < 0 : S > 0;
    for (i = 0; i < n; i++) {
      var a = P(laco[i]), b = P(laco[(i + 1) % n]), x = chaves[chaveCorda(a, b)];
      if (!x) continue;
      var c = dist(a, b), fi = 2 * Math.asin(Math.min(1, c / (2 * x.r))), seg = x.r * x.r / 2 * (fi - Math.sin(fi));
      dA += (cross(sub(b, a), sub(x.c, a)) > 0) === regiaoEsq ? seg : -seg;
      dP += x.r * fi - c;
    }
    return { regiao: dA, perimetro: dP };
  }
  /* laje por contorno com aresta curva (o par do BimArq.lajeContorno) */
  function lajeContorno(BA, lista, o) {
    o = o || {};
    var v = contornoValido(lista, BA); if (!v.ok) return null;
    var esp = num(o.espessura, 0.12), topoL = num(o.topo, 0);
    if (!(esp >= 0.03 && esp <= 1)) return null;
    var c = { tipo: "laje", ifc: "IFCSLAB", b2: 1, contorno: v.contorno, furos: [], altura: r4(esp), cy: r4(topoL - esp / 2), rotY: 0 };
    if (o.tipoLaje) c.tipoLaje = { id: String(o.tipoLaje.id || ""), rotulo: String(o.tipoLaje.rotulo || "") };
    if (o.nivelId != null) c.nivelId = String(o.nivelId);
    var Cp = v.pts.map(function (q) { return { x: q[0], z: q[1] }; });
    arr(o.furos).forEach(function (f) { var vf = BA.validarFuro(Cp, f, c.furos); if (vf.ok) c.furos.push({ pts: vf.pts.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }) }); });
    recalcLaje(BA, c);
    if (o.restricoes) BA.restringir(c, o.restricoes, o.niveis);
    return c;
  }
  function recalcLaje(BA, c) {
    var segs = segsContorno(c.contorno), B = BD(), Cp = pontosContorno(c.contorno), Cpo = Cp.map(function (q) { return { x: q[0], z: q[1] }; });
    var bons = [], avisos = [];
    arr(c.furos).forEach(function (f, i) { var vf = BA.validarFuro(Cpo, f && f.pts, bons); if (vf.ok) bons.push({ pts: vf.pts.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }) }); else avisos.push("furo " + (i + 1) + " ignorado: " + vf.motivo); });
    c.furos = bons;
    var aC = Math.abs(B.areaContorno(segs)), aF = 0, per = B.perimetro(segs);
    bons.forEach(function (f) { aF += Math.abs(BA.areaSinal(f.pts.map(P))); per += BA.perimetro(f.pts.map(P)); });
    var xs = Cp.map(function (p) { return p[0]; }), zs = Cp.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    c.cx = r6((x0 + x1) / 2); c.cz = r6((z0 + z1) / 2); c.comprimento = r6(Math.max(0.01, x1 - x0)); c.espessura = r6(Math.max(0.01, z1 - z0)); c.rotY = 0;
    c.area = r4(aC - aF); c.areaFuros = r4(aF); c.volume = r4((aC - aF) * c.altura); c.perimetro = r4(per);
    try { Object.defineProperty(c, "_exato", { value: { area: aC - aF, areaFuros: aF, volume: (aC - aF) * num(c.altura, 0), perimetro: per }, enumerable: false, configurable: true, writable: true }); } catch (e) {}
    if (avisos.length) c.avisos = avisos; else delete c.avisos;
    return c;
  }

  /* ================================================== VIGA CURVA
   * Só de seção RETANGULAR (o concreto da viga que acompanha a parede curva):
   * a peça é o anel de largura b (raios R ± b/2) entre o fundo e o topo —
   * o mesmo sólido da parede curva, exato no 3D, no IFC e na conta:
   *   comprimento = R·|varredura| (o eixo); volume = b·h·comprimento (o anel);
   *   fôrma = (2h + b)·comprimento (as duas faces laterais somam 2h·R·|φ| —
   *     a de fora ganha o que a de dentro perde — e o fundo é o anel).
   * Perfil não retangular (I, U, L, tubo, madeira roliça) em curva: recusa
   * com motivo (a peça calandrada é outro assunto). A viga curva não para na
   * face do pilar (sem recuo) e não entra na união de geometria. */
  function vigaCurva(BA, p1, p2, o) {
    var s = BA.secao(o.perfil); if (!s.ok || s.forma !== "ret") return null;
    if (motivoArco(P(p1), P(p2), P(o.arco.m), s.larg)) return null;
    var o2 = {}; Object.keys(o).forEach(function (k) { if (k !== "arco") o2[k] = o[k]; });
    var c = BA.vigaPerfil(p1, p2, o2); if (!c) return null;
    var i = BD().arco(P(p1), P(p2), P(o.arco.m));
    caixaPelaCorda(c, P(p1), P(p2));
    c.arco = { m: O6(i.meio) };
    return BA.recalcPeca(c);
  }
  function motivoViga(perfil, secao) { return secao && secao.ok && secao.forma === "ret" ? null : "Viga curva só de seção retangular (perfil " + ((perfil && perfil.forma) || "?") + " em curva não é calculado)."; }
  function recalcViga(c, s, mat) {
    var e = eixoArco(c), topoV = c.topoViga != null ? num(c.topoViga, 2.8) : num(c.cy, 0) + num(c.altura, 0) / 2;
    c.altura = r6(s.alt); c.espessura = r6(s.larg); c.cy = r4(topoV - s.alt / 2);
    if (!e.ok || s.forma !== "ret") { c.avisos = [e.ok ? motivoViga(c.perfil, s) : e.motivo]; return c; }
    var L = e.L, forma = (mat && mat.forma ? (2 * s.alt + s.larg) : s.perimetro) * L;
    c.volume = r6(s.area * L); c.comprimentoViga = r4(L); c.area = r6(forma); c.areaForma = c.area;
    c.massa = mat && mat.rho ? r4(s.area * L * mat.rho) : null;
    anotar(c, "_exato", { volume: s.area * L, comprimentoViga: L, area: forma, perimetroSecao: s.perimetro, massa: mat && mat.rho ? s.area * L * mat.rho : null });
    delete c.avisos; delete c.recuoIni; delete c.recuoFim;
    return c;
  }
  /* o anel da viga curva na planta (o contorno exato) e as cotas de fundo e topo */
  function vigaPlanta(c) {
    var e = eixoArco(c); if (!e.ok) return null;
    var b = num(c.espessura, 0), sg = e.s > 0 ? 1 : -1, ri = e.r - b / 2, ro = e.r + b / 2, t0 = e.a0, t1 = e.a0 + e.s;
    var segs = [segArco(polar(e.c, ro, t0), polar(e.c, ro, t1), polar(e.c, ro, t0 + e.s / 2)), segReta(polar(e.c, ro, t1), polar(e.c, ri, t1)),
                segArco(polar(e.c, ri, t1), polar(e.c, ri, t0), polar(e.c, ri, t0 + e.s / 2)), segReta(polar(e.c, ri, t0), polar(e.c, ro, t0))];
    void sg;
    var topoV = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
    return { segs: segs, pts: tesselarSegs(segs, TOL_CORDA), y0: topoV - num(c.altura, 0), y1: topoV };
  }

  /* ================================================== GUARDA-CORPO CURVO
   * O caminho [{x, y, z, m?}]: o ponto com m: { x, z } começa um trecho em
   * ARCO (na planta) até o próximo ponto; a altura (y) varia linear ao longo
   * do trecho. O mesmo contrato do BimArq.guarda, com:
   *   comprimento = o do caminho de verdade: √(arco² + Δy²) por trecho (a
   *     hélice de inclinação constante), não a soma das cordas;
   *   montantes = espaçados IGUAL ao longo do arco (vão ≤ espaçamento), o do
   *     canto não se repete;
   *   corrimão e "deslocamento a partir do caminho" (P9) = curvas
   *     PARALELAS exatas (o arco desloca concêntrico; os cantos pela
   *     interseção — BimDesenho.deslocar), deslocamento positivo para a
   *     DIREITA de quem anda;
   *   o desenho (corrimão em barras) vai pelas cordas de 2 mm. */
  function guarda(BA, lista, o) {
    o = o || {};
    var alt = num(o.altura, 1.10), esp = num(o.espac, 1.20), sm = num(o.secMontante, 0.04), sc = num(o.secCorrimao, 0.05), B = BD();
    if (!(alt >= 0.5 && alt <= 2) || !(esp >= 0.2 && esp <= 3)) return null;
    var pts = [];
    arr(lista).forEach(function (p) {
      if (!p || !fin(Number(p.x)) || !fin(Number(p.y)) || !fin(Number(p.z))) return;
      var q = { x: r6(Number(p.x)), y: r6(Number(p.y)), z: r6(Number(p.z)) }, u = pts[pts.length - 1];
      if (p.m && fin(Number(p.m.x)) && fin(Number(p.m.z))) q.m = { x: r6(Number(p.m.x)), z: r6(Number(p.m.z)) };
      if (u && Math.abs(u.x - q.x) < 0.02 && Math.abs(u.z - q.z) < 0.02 && Math.abs(u.y - q.y) < 0.02) return;
      pts.push(q);
    });
    if (pts.length < 2) return null;
    delete pts[pts.length - 1].m;
    var segs = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = [pts[i].x, pts[i].z], b = [pts[i + 1].x, pts[i + 1].z];
      segs.push(pts[i].m ? segArco(a, b, P(pts[i].m)) : segReta(a, b));
    }
    function paralela(d) { if (!(Math.abs(d) > 1e-12)) return segs; var r = B.deslocar(segs, -d, false); return r.ok ? r.segmentos : null; }
    var dc = num(o.deslocCaminho, 0), base = paralela(dc);
    if (!base) return null;
    /* um ponto do trecho k no parâmetro f (0..1), com a altura linear */
    function noTrecho(sg, k, f, dy) {
      var y = pts[k].y + (pts[k + 1].y - pts[k].y) * f + (dy || 0);
      if (sg.tipo === "arco") { var I = B.arco(sg.a, sg.b, sg.m); if (I.ok) { var q = polar(I.c, I.r, I.a0 + I.s * f); return { x: r6(q[0]), y: r6(y), z: r6(q[1]) }; } }
      var A = P(sg.a), Bq = P(sg.b);
      return { x: r6(A[0] + (Bq[0] - A[0]) * f), y: r6(y), z: r6(A[1] + (Bq[1] - A[1]) * f) };
    }
    function compTrecho(sg, k) { var Lh = B.comprimento(sg), dy = pts[k + 1].y - pts[k].y; return Math.sqrt(Lh * Lh + dy * dy); }
    /* as barras do desenho: as cordas de 2 mm do trecho, na altura h acima do caminho */
    function barras(lst, h) {
      var out = [];
      lst.forEach(function (sg, k) {
        var n = 1; if (sg.tipo === "arco") { var I = B.arco(sg.a, sg.b, sg.m); if (I.ok) n = B.nCordas(I.r, I.s, TOL_CORDA, 2); }
        for (var j = 0; j < n; j++) out.push({ a: noTrecho(sg, k, j / n, h), b: noTrecho(sg, k, (j + 1) / n, h) });
      });
      return out;
    }
    var mont = [], comp = 0, bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
    function caixa(q, y) { if (q.x < bb.x0) bb.x0 = q.x; if (q.x > bb.x1) bb.x1 = q.x; if (q.z < bb.z0) bb.z0 = q.z; if (q.z > bb.z1) bb.z1 = q.z; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y; }
    base.forEach(function (sg, k) {
      var L = compTrecho(sg, k), nd = Math.max(1, Math.ceil(L / esp - 1e-9));
      comp += L;
      for (var j = (k === 0 ? 0 : 1); j <= nd; j++) mont.push(noTrecho(sg, k, j / nd));
    });
    var cor = barras(base, alt);
    cor.forEach(function (s2) { caixa(s2.a, s2.a.y - alt); caixa(s2.a, s2.a.y); caixa(s2.b, s2.b.y - alt); caixa(s2.b, s2.b.y); });
    var par = { altura: alt, espac: esp, secMontante: sm, secCorrimao: sc };
    if (Math.abs(dc) > 1e-12) par.deslocCaminho = r6(dc);
    var c = {
      tipo: "guarda", ifc: "IFCRAILING", b2: 1,
      cx: r6((bb.x0 + bb.x1) / 2), cz: r6((bb.z0 + bb.z1) / 2), cy: r6((bb.y0 + bb.y1) / 2),
      comprimento: r6(Math.max(sm, bb.x1 - bb.x0)), espessura: r6(Math.max(sm, bb.z1 - bb.z0)), altura: r6(Math.max(0.01, bb.y1 - bb.y0)), rotY: 0,
      guarda: { par: par, pts: pts, montantes: mont, corrimao: cor, arco: true },
      area: r4(comp * alt), volume: 0,
      medidas: { comprimento: r4(comp), un: 1, area: r4(comp * alt), montantes: mont.length, comprimentoMontantes: r4(mont.length * alt) }
    };
    var X = { area: comp * alt, medidas: { comprimento: comp, area: comp * alt, comprimentoMontantes: mont.length * alt } };
    /* P9 — corrimãos 1 e 2 (altura e deslocamento lateral), paralelos exatos */
    var lista2 = [], tot = 0;
    ["c1Altura", "c1Desloc", "c2Altura", "c2Desloc"].forEach(function (k) { var v = Number(o[k]); if (o[k] != null && o[k] !== "" && isFinite(v) && Math.abs(v) <= 3) par[k] = r6(v); });
    [1, 2].forEach(function (j) {
      var h = num(par["c" + j + "Altura"], 0); if (!(h >= 0.3 && h <= 2)) return;
      var r2 = B.deslocar(base, -num(par["c" + j + "Desloc"], 0), false); if (!r2.ok) return;
      r2.segmentos.forEach(function (sg, k) { tot += compTrecho(sg, k); });
      barras(r2.segmentos, h).forEach(function (s2) { lista2.push({ n: j, a: s2.a, b: s2.b }); });
    });
    if (lista2.length) { c.guarda.corrimaos = lista2; c.medidas.comprimentoCorrimao = r4(tot); X.medidas.comprimentoCorrimao = tot; }
    anotar(c, "_exato", X);
    return c;
  }

  /* ================================================== LINHAS, COTAS, PLANTA */
  /* as linhas da parede curva para "Selecionar linhas" (js/bimdesenho.js): as faces e o eixo, em arco */
  function linhasParede(c) {
    var W = modelo(c), out = []; if (!W.ok || !W.arco) return out;
    var h = W.t / 2, inv = !!c.inverterFaces;
    [["eixo", 0], [inv ? "dentro" : "fora", -h], [inv ? "fora" : "dentro", h]].forEach(function (f) {
      out.push({ tipo: "arco", a: O(W.pt(-W.L / 2, f[1])), b: O(W.pt(W.L / 2, f[1])), m: O(W.pt(0, f[1])), fonte: { tipo: "parede", id: c.id, face: f[0] } });
    });
    return out;
  }
  /* a referência de cota (js/bimanot.js) num pedaço da parede curva: o círculo (centro, raio, ângulos) */
  function refArco(c, r) {
    var W = modelo(c); if (!W.ok || !W.arco) return null;
    var w = r === "face+" ? W.t / 2 : (r === "face-" ? -W.t / 2 : (r === "eixo" || r === "contorno" ? 0 : null));
    if (w == null) return null;
    var ra = W.rho(w), ta = W.tm - W.s / 2, tb = W.tm + W.s / 2, a0 = W.s > 0 ? ta : tb, a1 = W.s > 0 ? tb : ta;
    return { ok: true, p: W.pt(0, w), d: null, c: W.C, r: ra, a0: a0, a1: a1 };
  }
  /* o CORTE na planta 2D com os arcos de verdade: os contornos das fatias
     levados para a tela por `tela([x, z]) → [X, Y]` (a planta do
     js/desenho2d.js: X para a direita, Y para baixo). Os pontos são as
     cordas de 2 mm (quem recorta ou mede o contorno vê a curva certa) e
     `arcos[k] = { r, grande, horario, n }` diz que as n arestas a partir do
     ponto k são UM arco — o desenho2d escreve o comando A do SVG. A escala
     tem de ser 1:1 em metros (só gira/espelha). */
  function cortePlanta(c, tela, vaos, yCorte) {
    var r = pecas(c, vaos || []), out = [];
    r.pecas.forEach(function (pc, k) {
      if (fin(yCorte)) { if (!(pc.y0 <= yCorte + 1e-9 && Math.max.apply(null, pc.ytopo) > yCorte)) return; }   /* só a faixa que o plano corta */
      else if (k > 0 && r.pecas[k - 1].segs === pc.segs) return;   /* a mesma fatia em duas faixas (vão) */
      var pts = [], arcos = [];
      pc.segs.forEach(function (sg) {
        var a = tela(P(sg.a)), b = tela(P(sg.b));
        if (!pts.length) pts.push(a);
        if (sg.tipo === "arco") {
          var mm = tela(P(sg.m)), i = BD().arco(a, b, mm);
          if (i.ok) {
            var n = BD().nCordas(i.r, i.s, TOL_CORDA, 2);
            arcos[pts.length - 1] = { r: i.r, grande: Math.abs(i.s) > Math.PI, horario: i.s > 0, n: n };
            for (var j = 1; j < n; j++) pts.push(polar(i.c, i.r, i.a0 + i.s * j / n));
            pts.push(b); return;
          }
        }
        pts.push(b);
      });
      if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop();
      for (var z = 0; z < pts.length; z++) if (!arcos[z]) arcos[z] = null;
      out.push({ pts: pts, fechado: true, arcos: arcos, id: c.id });
    });
    return out;
  }

  var BimCurva = {
    TOL_CORDA: TOL_CORDA,
    eixoArco: eixoArco, motivoArco: motivoArco, modelo: modelo, parede: parede, validar: validar, ehCurva: ehCurva, temCorteCurvo: temCorteCurvo,
    deslocarPorLinha: deslocarPorLinha, transladar: transladar, brutos: brutos, comprimentoLocalizacao: comprimentoLocalizacao,
    juntas: juntas, topo: topo, pecas: pecas, momentos: momentos,
    vaosNaParede: vaosNaParede, posicaoHospedada: posicaoHospedada, tNaParede: tNaParede,
    contornosAmbiente: contornosAmbiente, medirCiclo: medirCiclo, juntarLadosArco: juntarLadosArco,
    temArco: temArco, segsContorno: segsContorno, pontosContorno: pontosContorno, lajeContorno: lajeContorno, recalcLaje: recalcLaje,
    contornoValido: contornoValido, chaveCorda: chaveCorda, chavesContorno: chavesContorno, corrigirArcos: corrigirArcos, guarda: guarda,
    vigaCurva: vigaCurva, recalcViga: recalcViga, vigaPlanta: vigaPlanta, motivoViga: motivoViga,
    linhasParede: linhasParede, refArco: refArco, cortePlanta: cortePlanta, uCorte: uCorte
  };
  global.BimCurva = BimCurva;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCurva;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

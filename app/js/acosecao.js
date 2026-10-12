/* =====================================================================
 * acosecao.js — PROPRIEDADES DE SEÇÃO PARA DIMENSIONAMENTO de perfis de
 * aço (motor PURO, ES5, sem DOM, Node-testável).
 *
 * O catálogo (js/perfisaco.js) guarda o que o fabricante publica. O
 * dimensionamento precisa de mais: J e Cw (flambagem lateral com torção e
 * flexo-torção), o centro de torção (x0, y0), o raio de giração polar r0,
 * os eixos principais (cantoneira e Z), as esbeltezes das chapas (b/t, h/tw)
 * e os módulos plásticos. Este módulo calcula tudo pela GEOMETRIA e usa o
 * valor do catálogo quando ele existe (o do fabricante manda).
 *
 *   perfilI(d, bf, tw, tf, r)       I/H duplamente simétrico; r = raio da
 *                                   concordância alma-mesa (0 = soldado)
 *   tuboRet(h, b, t, ro)            tubo retangular/quadrado (ro = raio externo)
 *   tuboCirc(D, t)                  tubo circular
 *   barraRedonda(d)                 barra maciça (tirante, corrente, chumbador)
 *   formadoFrio(tipo, dims)         perfis formados a frio da NBR 6355:
 *                                   "U", "Ue", "Z90", "Z45", "Cr" (cartola),
 *                                   "L" — dims {bw, bf, D, t, ri}
 *   paredeFina(pontos, t)           qualquer seção ABERTA de parede fina
 *                                   (linha média + espessura): A, Ix, Iy,
 *                                   Ixy, eixos principais, J, Cw, centro de
 *                                   torção, βx/βy — o método linear dos
 *                                   perfis formados a frio, com os cantos
 *                                   arredondados discretizados em arcos
 *   dePerfil(perfilCatalogo)        a seção completa de um perfil do
 *                                   js/perfisaco.js (mm) — o catálogo vale,
 *                                   a geometria completa o que falta
 *
 * FÓRMULAS E DE ONDE VIERAM
 *   · I laminado: área, Ix, Iy e Z com as 4 concordâncias (área (1 − π/4)r²,
 *     centróide a 0,2234 r do canto) — a mesma do js/bimestrut.js;
 *     J pela fórmula de El Darwish e Johnston (AISC Design Guide 9, que é a
 *     usada na base AISC); Cw = Iy·h0²/4, h0 = d − tf (seção duplamente
 *     simétrica). CONFERIDO contra a base AISC v15 que já está no
 *     js/perfisaco.js (tools/test-aco-secao.js).
 *   · I soldado (r = 0): placas planas; J = (2·bf·tf³ + h0·tw³)/3.
 *   · Parede fina: integrais exatas sobre segmentos retos da linha média
 *     (a coordenada setorial ω é linear em cada segmento); centro de torção
 *     pela condição ∫ωS·x dA = ∫ωS·y dA = 0; Cw = ∫ωn² dA com ω normalizada
 *     (∫ωn dA = 0). CONFERIDO contra o programa de elementos finitos de
 *     seção "sectionproperties" (Python) e contra a fórmula fechada do
 *     centro de torção do U simples, e = 3b²/(h + 6b).
 *   · Tubo retangular: cantos arredondados exatos; J pela fórmula de Bredt
 *     com a área e o perímetro da linha média.
 *
 * UNIDADES: mm (A mm², I e J mm⁴, W e Z mm³, Cw mm⁶). Quem usa converte.
 * Teste: node tools/test-aco-secao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PI = Math.PI;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function sq(v) { return v * v; }

  /* ================================================== PAREDE FINA (aberta)
   * pontos: [[x, y], ...] da LINHA MÉDIA, em ordem, de uma ponta livre à
   * outra (um ramo só: U, Ue, Z, cartola, L). t: espessura (mm).
   * Devolve as propriedades em torno do CENTRÓIDE, nos eixos x, y do desenho
   * e nos eixos principais (1 = maior inércia). */
  function paredeFina(pontos, t, opt) {
    opt = opt || {};
    var P = (pontos || []).filter(function (p) { return p && fin(p[0]) && fin(p[1]); });
    if (P.length < 2 || !(t > 0)) return null;
    var seg = [];
    for (var i = 0; i + 1 < P.length; i++) {
      var a = P[i], b = P[i + 1], L = Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1]));
      if (L > 1e-9) seg.push({ a: a, b: b, L: L, c: (b[0] - a[0]) / L, s: (b[1] - a[1]) / L });
    }
    if (!seg.length) return null;
    var A = 0, Sx = 0, Sy = 0;
    seg.forEach(function (g) { var dA = t * g.L; A += dA; Sx += dA * (g.a[0] + g.b[0]) / 2; Sy += dA * (g.a[1] + g.b[1]) / 2; });
    var xc = Sx / A, yc = Sy / A;
    var Ix = 0, Iy = 0, Ixy = 0, extra = opt.semEspessura ? 0 : 1;
    seg.forEach(function (g) {
      var xa = g.a[0] - xc, ya = g.a[1] - yc, xb = g.b[0] - xc, yb = g.b[1] - yc, k = t * g.L;
      Ix += k * (ya * ya + ya * yb + yb * yb) / 3 + extra * g.c * g.c * g.L * t * t * t / 12;
      Iy += k * (xa * xa + xa * xb + xb * xb) / 3 + extra * g.s * g.s * g.L * t * t * t / 12;
      Ixy += k * (2 * xa * ya + 2 * xb * yb + xa * yb + xb * ya) / 6 - extra * g.c * g.s * g.L * t * t * t / 12;
    });
    /* eixos principais: ângulo do eixo 1 (maior inércia) a partir de x */
    var th = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
    var Im = (Ix + Iy) / 2, R = Math.sqrt(sq((Ix - Iy) / 2) + Ixy * Ixy);
    var I1 = Im + R, I2 = Im - R;
    /* conferir qual dos dois o ângulo th dá (I(th) = Im + (Ix−Iy)/2·cos2th − Ixy·sin2th) */
    var Ith = Im + (Ix - Iy) / 2 * Math.cos(2 * th) - Ixy * Math.sin(2 * th);
    if (Ith < Im) th += PI / 2;
    /* coordenada setorial com polo no centróide (anti-horário positivo) */
    var w = [0];
    for (var j = 0; j < seg.length; j++) {
      var g2 = seg[j], xa2 = g2.a[0] - xc, ya2 = g2.a[1] - yc, xb2 = g2.b[0] - xc, yb2 = g2.b[1] - yc;
      w.push(w[j] + (xa2 * yb2 - xb2 * ya2));
    }
    var Sw = 0, Iwx = 0, Iwy = 0;
    seg.forEach(function (g, k) {
      var xa = g.a[0] - xc, ya = g.a[1] - yc, xb = g.b[0] - xc, yb = g.b[1] - yc, wa = w[k], wb = w[k + 1], q = t * g.L;
      Sw += q * (wa + wb) / 2;
      Iwx += q * (2 * wa * ya + 2 * wb * yb + wa * yb + wb * ya) / 6;
      Iwy += q * (2 * wa * xa + 2 * wb * xb + wa * xb + wb * xa) / 6;
    });
    /* centro de torção (em relação ao centróide): ∫ωS·x dA = ∫ωS·y dA = 0 */
    var D = Ix * Iy - Ixy * Ixy;
    var xs = (Iy * Iwx - Ixy * Iwy) / D, ys = (Ixy * Iwx - Ix * Iwy) / D;
    /* ω em relação ao centro de torção, normalizada */
    var wS = [], Swn = 0;
    for (var m = 0; m < P.length; m++) { /* nós da linha média (os do segmento, na ordem) */ }
    var nos = [seg[0].a].concat(seg.map(function (g) { return g.b; }));
    nos.forEach(function (p, k) { wS.push(w[k] - xs * (p[1] - yc) + ys * (p[0] - xc)); });
    seg.forEach(function (g, k) { Swn += t * g.L * (wS[k] + wS[k + 1]) / 2; });
    var C = -Swn / A, Cw = 0;
    seg.forEach(function (g, k) { var wa = wS[k] + C, wb = wS[k + 1] + C; Cw += t * g.L * (wa * wa + wa * wb + wb * wb) / 3; });
    var J = 0; seg.forEach(function (g) { J += g.L * t * t * t / 3; });
    /* fibras extremas (contorno = linha média ± t/2) */
    var xmin = 1e18, xmax = -1e18, ymin = 1e18, ymax = -1e18;
    seg.forEach(function (g) {
      [g.a, g.b].forEach(function (p) {
        var nx = -g.s * t / 2, ny = g.c * t / 2;
        [[p[0] + nx, p[1] + ny], [p[0] - nx, p[1] - ny]].forEach(function (q) {
          if (q[0] < xmin) xmin = q[0]; if (q[0] > xmax) xmax = q[0];
          if (q[1] < ymin) ymin = q[1]; if (q[1] > ymax) ymax = q[1];
        });
      });
    });
    /* βx, βy (monossimetria): (1/I)∫y(x²+y²)dA − 2y0 e (1/I)∫x(x²+y²)dA − 2x0 — Gauss de 2 pontos é exato para cúbicas */
    var Kx = 0, Ky = 0, gp = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)];
    seg.forEach(function (g) {
      gp.forEach(function (u) {
        var x = g.a[0] + (g.b[0] - g.a[0]) * u - xc, y = g.a[1] + (g.b[1] - g.a[1]) * u - yc, dA = t * g.L / 2;
        Kx += y * (x * x + y * y) * dA; Ky += x * (x * x + y * y) * dA;
      });
    });
    var rx = Math.sqrt(Ix / A), ry = Math.sqrt(Iy / A);
    return {
      A: A, xc: xc, yc: yc, Ix: Ix, Iy: Iy, Ixy: Ixy,
      I1: I1, I2: I2, angulo: th, r1: Math.sqrt(I1 / A), r2: Math.sqrt(I2 / A),
      rx: rx, ry: ry,
      Wx: Ix / Math.max(ymax - yc, yc - ymin), Wy: Iy / Math.max(xmax - xc, xc - xmin),
      Wxs: Ix / (ymax - yc), Wxi: Ix / (yc - ymin), Wyd: Iy / (xmax - xc), Wye: Iy / (xc - xmin),
      J: J, Cw: Cw, x0: xs, y0: ys,
      r0: Math.sqrt(rx * rx + ry * ry + xs * xs + ys * ys),
      betaX: Kx / Ix - 2 * ys, betaY: Ky / Iy - 2 * xs,
      caixa: { xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax },
      linhaMedia: nos, t: t
    };
  }

  /* arco da linha média (canto dobrado): centro (cx, cy), raio rm, de a0 a a1 (rad), n segmentos */
  function arco(cx, cy, rm, a0, a1, n) {
    var o = []; n = n || 6;
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; o.push([cx + rm * Math.cos(a), cy + rm * Math.sin(a)]); }
    return o;
  }
  function juntar(lista) {
    var o = [];
    lista.forEach(function (p) { var u = o[o.length - 1]; if (!u || Math.abs(u[0] - p[0]) > 1e-9 || Math.abs(u[1] - p[1]) > 1e-9) o.push(p); });
    return o;
  }

  /* ================================================== FORMADOS A FRIO
   * Dimensões EXTERNAS, como na designação da NBR 6355 ("Ue 150x60x20x2,00"):
   *   bw = altura da alma, bf = largura da mesa, D = altura do enrijecedor
   *   de borda, t = espessura; ri = raio interno de dobramento (padrão = t).
   * Desenho: alma vertical em x = 0 (linha média), mesas para +x (U, Ue),
   * cima/baixo em y. Z: mesa de cima para +x, a de baixo para −x. */
  function formadoFrio(tipo, d) {
    d = d || {};
    var t = num(d.t, 0), bw = num(d.bw, 0), bf = num(d.bf, 0), D = num(d.D, 0), ri = num(d.ri, t);
    if (!(t > 0 && bw > 2 * t && bf > t)) return null;
    var rm = ri + t / 2, H = (bw - t) / 2, B = bf - t, Dl = D - t / 2, n = 6, pts;
    var Q = PI / 2;
    tipo = String(tipo || "").replace(/\s+/g, "");
    if (tipo === "U") {
      pts = juntar([[B, H]].concat(arco(rm, H - rm, rm, Q, PI, n)).concat(arco(rm, -H + rm, rm, PI, 1.5 * PI, n)).concat([[B, -H]]));
    } else if (tipo === "Ue") {
      if (!(D > t)) return null;
      pts = juntar([[B, H - Dl]].concat(arco(B - rm, H - rm, rm, 0, Q, n)).concat(arco(rm, H - rm, rm, Q, PI, n))
        .concat(arco(rm, -H + rm, rm, PI, 1.5 * PI, n)).concat(arco(B - rm, -H + rm, rm, 1.5 * PI, 2 * PI, n)).concat([[B, -H + Dl]]));
    } else if (tipo === "Z90" || tipo === "Z") {
      /* Z enrijecido a 90° (D > 0) ou Z simples (D = 0) */
      var top = [], bot = [];
      if (D > t) top = [[B, H - Dl]].concat(arco(B - rm, H - rm, rm, 0, Q, n)); else top = [[B, H]];
      if (D > t) bot = arco(-B + rm, -H + rm, rm, 1.5 * PI, PI, n).concat([[-B, -H + Dl]]); else bot = [[-B, -H]];
      pts = juntar(top.concat(arco(rm, H - rm, rm, Q, PI, n)).concat(arco(-rm, -H + rm, rm, 0, -Q, n)).concat(bot));
    } else if (tipo === "Z45") {
      /* Z com enrijecedor de borda a 45° (para dentro) */
      if (!(D > t)) return null;
      var c45 = Math.cos(PI / 4), dl = D - t / 2;
      pts = juntar([[B - dl * c45, H - dl * c45]].concat([[B, H]]).concat(arco(rm, H - rm, rm, Q, PI, n)).concat(arco(-rm, -H + rm, rm, 0, -Q, n)).concat([[-B, -H], [-B + dl * c45, -H + dl * c45]]));
    } else if (tipo === "Cr") {
      /* cartola: bw = altura, bf = largura da mesa superior (externa), D = aba inferior (para fora) */
      if (!(D > t)) return null;
      var Bh = (bf - t) / 2, Hh = bw - t, Da = D - t / 2;
      pts = juntar([[-Bh - Da, 0]].concat(arco(-Bh - rm, rm, rm, -Q, 0, n)).concat(arco(-Bh + rm, Hh - rm, rm, PI, Q, n))
        .concat(arco(Bh - rm, Hh - rm, rm, Q, 0, n)).concat(arco(Bh + rm, rm, rm, PI, 1.5 * PI, n)).concat([[Bh + Da, 0]]));
    } else if (tipo === "L") {
      /* cantoneira dobrada: bw = aba vertical, bf = aba horizontal */
      pts = juntar([[0, bw - t / 2]].concat(arco(rm, rm, rm, PI, 1.5 * PI, n)).concat([[bf - t / 2, 0]]));
    } else return null;
    var p = paredeFina(pts, t);
    if (!p) return null;
    p.tipo = tipo; p.bw = bw; p.bf = bf; p.D = D; p.ri = ri;
    /* larguras planas (para a largura efetiva da NBR 14762): parte reta entre cantos */
    p.planas = {
      alma: bw - 2 * (ri + t),
      mesa: tipo === "Cr" ? bf - 2 * (ri + t) : (D > t ? bf - 2 * (ri + t) : bf - (ri + t)),
      enrijecedor: D > t ? D - (ri + t) : 0
    };
    p.massa = p.A * 7850 / 1e6;
    return p;
  }

  /* ================================================== PERFIL I / H
   * d, bf, tw, tf, r em mm (r = 0: soldado). Duplamente simétrico. */
  var KF = 1 - PI / 4;               /* área da concordância / r² */
  var YF = (10 - 3 * PI) / (12 - 3 * PI);  /* centróide da concordância a YF·r do canto (≈ 0,2234) */
  function perfilI(d, bf, tw, tf, r) {
    d = num(d, 0); bf = num(bf, 0); tw = num(tw, 0); tf = num(tf, 0); r = num(r, 0);
    if (!(d > 2 * tf && bf > tw && tw > 0 && tf > 0)) return null;
    var hw = d - 2 * tf, Af = KF * r * r, yf = YF * r;
    var A = 2 * bf * tf + hw * tw + 4 * Af;
    /* inércia da concordância em torno do próprio centróide (eixo paralelo à aba): (1/3 − π/16)r⁴ − Af·(r − YF r)²… pela integral exata */
    var Ifo = (1 / 3 - PI / 16) * Math.pow(r, 4) - Af * sq(r - yf);   /* em torno do eixo pelo centróide, paralelo ao lado reto */
    var Ix = (bf * Math.pow(d, 3) - (bf - tw) * Math.pow(hw, 3)) / 12 + 4 * (Ifo + Af * sq(hw / 2 - yf));
    var Iy = 2 * tf * Math.pow(bf, 3) / 12 + hw * Math.pow(tw, 3) / 12 + 4 * (Ifo + Af * sq(tw / 2 + yf));
    var Zx = bf * tf * (d - tf) + tw * hw * hw / 4 + 4 * Af * (hw / 2 - yf);
    var Zy = tf * bf * bf / 2 + hw * tw * tw / 4 + 4 * Af * (tw / 2 + yf);
    /* J — El Darwish e Johnston (AISC Design Guide 9) */
    var J1 = bf * Math.pow(tf, 3) * (1 / 3 - 0.21 * (tf / bf) * (1 - Math.pow(tf, 4) / (12 * Math.pow(bf, 4))));
    var J2 = (d - 2 * tf) * Math.pow(tw, 3) / 3, J;
    if (r > 0) {
      var t1 = Math.min(tw, tf), t2 = Math.max(tw, tf);
      var alfa = (t1 / t2) * (0.15 + 0.10 * r / tf);
      var Dd = (sq(tf + r) + tw * (r + tw / 4)) / (2 * r + tf);
      /* × 0,95: a fórmula com o raio publicado SUPERESTIMA o J dos perfis leves (até +8,6 % contra a base AISC v15, W250X17.9)
         e nunca o subestima mais que 0,7 %; com o fator, o erro fica entre −5,6 % e +3,2 % nos 283 W — a favor da segurança na FLT.
         Quando o catálogo traz o J (AISC) ou o J por elementos finitos (Gerdau, tools/), vale o do catálogo. */
      J = 0.95 * (2 * J1 + J2 + 2 * alfa * Math.pow(Dd, 4));
    } else {
      J = (2 * bf * Math.pow(tf, 3) + (d - tf) * Math.pow(tw, 3)) / 3;   /* placas planas (h0 = d − tf) */
    }
    var h0 = d - tf, Cw = Iy * h0 * h0 / 4;
    var rx = Math.sqrt(Ix / A), ry = Math.sqrt(Iy / A);
    return {
      forma: "I", d: d, bf: bf, tw: tw, tf: tf, r: r, A: A, Ix: Ix, Iy: Iy, Wx: 2 * Ix / d, Wy: 2 * Iy / bf, Zx: Zx, Zy: Zy,
      rx: rx, ry: ry, J: J, Cw: Cw, x0: 0, y0: 0, r0: Math.sqrt(rx * rx + ry * ry), h0: h0,
      h: d - 2 * tf - 2 * r,                 /* altura plana da alma (entre concordâncias) */
      hw: hw, Aw: d * tw,                    /* área da alma para o cortante (NBR 8800: d·tw) */
      massa: A * 7850 / 1e6, soldado: !(r > 0)
    };
  }

  /* ================================================== TUBOS e BARRA */
  function tuboRet(h, b, t, ro) {
    h = num(h, 0); b = num(b, 0); t = num(t, 0); ro = num(ro, 2 * t);
    if (!(h > 2 * t && b > 2 * t && t > 0)) return null;
    ro = Math.max(0, Math.min(ro, Math.min(h, b) / 2)); var ri = Math.max(0, ro - t);
    /* retângulo cheio menos cantos: área e inércia de um "retângulo de cantos arredondados" (raio R) */
    function rr(H, B, R) {
      var Ac = (4 - PI) * R * R;                       /* o que os 4 cantos tiram */
      var A = H * B - Ac;
      /* cada canto removido: quadrado R×R menos quarto de círculo; centróide e inércia pela diferença */
      var Aq = R * R, Ac1 = PI * R * R / 4, Ar = Aq - Ac1;
      var yq = R / 2, yc1 = 4 * R / (3 * PI);          /* do canto interno do quadrado */
      var yr = Ar > 0 ? (Aq * yq - Ac1 * yc1) / Ar : 0; /* centróide do resto, medido do canto interno (o do centro do arco) */
      var Iq = R * R * R * R / 3, Ic1 = PI * Math.pow(R, 4) / 16;   /* em torno do eixo pelo centro do arco */
      var Ir0 = Iq - Ic1;                                /* resto, em torno do eixo pelo centro do arco */
      var dist = H / 2 - R;                              /* do centróide da seção ao centro do arco */
      var Ix = B * H * H * H / 12 - 4 * (Ir0 + Ar * (dist * dist + 2 * dist * yr));
      var distb = B / 2 - R;
      var Iy = H * B * B * B / 12 - 4 * (Ir0 + Ar * (distb * distb + 2 * distb * yr));
      return { A: A, Ix: Ix, Iy: Iy };
    }
    var e = rr(h, b, ro), i = rr(h - 2 * t, b - 2 * t, ri);
    var A = e.A - i.A, Ix = e.Ix - i.Ix, Iy = e.Iy - i.Iy;
    var hm = h - t, bm = b - t, rm = Math.max(0, ro - t / 2);
    var Am = hm * bm - (4 - PI) * rm * rm, pm = 2 * (hm + bm) - (8 - 2 * PI) * rm;
    var J = 4 * Am * Am * t / pm;
    var Zx = b * h * h / 4 - (b - 2 * t) * sq(h - 2 * t) / 4, Zy = h * b * b / 4 - (h - 2 * t) * sq(b - 2 * t) / 4;   /* sem o efeito dos cantos (a favor da segurança: < 1 %) */
    return { forma: "tubo-ret", h: h, b: b, t: t, ro: ro, A: A, Ix: Ix, Iy: Iy, Wx: 2 * Ix / h, Wy: 2 * Iy / b, Zx: Zx, Zy: Zy,
             rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), J: J, Cw: 0, x0: 0, y0: 0, r0: Math.sqrt((Ix + Iy) / A),
             hPlana: h - 2 * ro, bPlana: b - 2 * ro, Aw: 2 * (h - 2 * t) * t, massa: A * 7850 / 1e6 };
  }
  function tuboCirc(D, t) {
    D = num(D, 0); t = num(t, 0); if (!(D > 2 * t && t > 0)) return null;
    var di = D - 2 * t, A = PI * (D * D - di * di) / 4, I = PI * (Math.pow(D, 4) - Math.pow(di, 4)) / 64;
    return { forma: "tubo-circ", D: D, t: t, A: A, Ix: I, Iy: I, Wx: 2 * I / D, Wy: 2 * I / D, Zx: (D * D * D - di * di * di) / 6, Zy: (D * D * D - di * di * di) / 6,
             rx: Math.sqrt(I / A), ry: Math.sqrt(I / A), J: 2 * I, Cw: 0, x0: 0, y0: 0, r0: Math.sqrt(2 * I / A), Aw: A / 2, massa: A * 7850 / 1e6 };
  }
  function barraRedonda(d) {
    d = num(d, 0); if (!(d > 0)) return null;
    var A = PI * d * d / 4, I = PI * Math.pow(d, 4) / 64;
    return { forma: "circ", d: d, A: A, Ix: I, Iy: I, Wx: 2 * I / d, Wy: 2 * I / d, Zx: d * d * d / 6, Zy: d * d * d / 6,
             rx: d / 4, ry: d / 4, J: 2 * I, Cw: 0, x0: 0, y0: 0, r0: d / Math.sqrt(8), massa: A * 7850 / 1e6,
             Abe: 0.75 * A };     /* área efetiva à tração da parte rosqueada (NBR 8800, 6.3.2.2: Abe = 0,75·Ab) */
  }

  /* cantoneira laminada de abas iguais ou desiguais, sem o raio (a favor da segurança na área, < 2 %);
     o catálogo, quando existe, substitui A, I e r */
  function cantoneira(a, b, t) {
    a = num(a, 0); b = num(b, a); t = num(t, 0);
    if (!(a > t && b > t && t > 0)) return null;
    var p = paredeFina([[t / 2, a], [t / 2, t / 2], [b, t / 2]], t);
    if (!p) return null;
    p.forma = "L"; p.a = a; p.b = b;
    p.rz = p.r2;            /* raio de giração mínimo (eixo principal de menor inércia) */
    p.massa = p.A * 7850 / 1e6;
    return p;
  }

  /* U laminado (abas de face paralela aproximada; o catálogo manda em A e I).
     Centro de torção (parede fina): e0 = 3·b²·tf / (6·b·tf + h0·tw) a partir da linha média da alma. */
  function perfilU(d, bf, tw, tf) {
    d = num(d, 0); bf = num(bf, 0); tw = num(tw, 0); tf = num(tf, 0);
    if (!(d > 2 * tf && bf > tw)) return null;
    var h0 = d - tf, b = bf - tw / 2;
    var p = paredeFina([[bf, h0 / 2], [tw / 2, h0 / 2], [tw / 2, -h0 / 2], [bf, -h0 / 2]], 1);   /* geometria com espessuras diferentes: abaixo */
    /* parede fina com espessuras diferentes (alma tw, mesas tf) — integrais à mão */
    var Aw = h0 * tw, Af = b * tf, A = Aw + 2 * Af;
    var xg = (2 * Af * (tw / 2 + b / 2) + Aw * (tw / 2)) / A;
    var Ix = tw * Math.pow(h0, 3) / 12 + 2 * Af * sq(h0 / 2) + 2 * b * Math.pow(tf, 3) / 12;
    var Iy = h0 * Math.pow(tw, 3) / 12 + Aw * sq(xg - tw / 2) + 2 * (tf * Math.pow(b, 3) / 12 + Af * sq(tw / 2 + b / 2 - xg));
    var e0 = 3 * b * b * tf / (6 * b * tf + h0 * tw);
    var Cw = tf * Math.pow(b, 3) * h0 * h0 / 12 * (3 * b * tf + 2 * h0 * tw) / (6 * b * tf + h0 * tw);
    var J = (2 * b * Math.pow(tf, 3) + h0 * Math.pow(tw, 3)) / 3;
    var x0 = -(e0 + (xg - tw / 2));   /* centro de torção do lado de fora da alma, medido do centróide */
    var rx = Math.sqrt(Ix / A), ry = Math.sqrt(Iy / A);
    p = { forma: "U", d: d, bf: bf, tw: tw, tf: tf, A: A, Ix: Ix, Iy: Iy, xg: xg, Wx: 2 * Ix / d, Wy: Iy / Math.max(xg, bf - xg),
          rx: rx, ry: ry, J: J, Cw: Cw, x0: x0, y0: 0, r0: Math.sqrt(rx * rx + ry * ry + x0 * x0), e0: e0, Aw: d * tw, massa: A * 7850 / 1e6 };
    return p;
  }

  /* ================================================== DO CATÁLOGO
   * cat: a linha do js/perfisaco.js (mm) com a forma da série. O valor do
   * catálogo manda; a geometria completa o que falta. Devolve também
   * `origem` dizendo de onde veio cada número (para o memorial). */
  function dePerfil(cat, forma) {
    if (!cat) return null;
    forma = forma || cat.forma;
    var g = null, origem = {};
    if (forma === "I") g = perfilI(cat.d, cat.bf, cat.tw, cat.tf, num(cat.r, 0));
    else if (forma === "U") g = perfilU(cat.d, cat.bf, cat.tw, cat.tf);
    else if (forma === "L") g = cantoneira(num(cat.a, cat.d), num(cat.b, cat.bf), cat.t);
    else if (forma === "tubo-ret") g = tuboRet(cat.h, cat.b, num(cat.t, cat.tn), num(cat.ro, 2 * num(cat.t, cat.tn)));
    else if (forma === "tubo-circ") g = tuboCirc(cat.D, num(cat.t, cat.tn));
    else if (forma === "circ") g = barraRedonda(cat.d);
    else if (/^(U|Ue|Z90|Z45|Z|Cr|L)$/.test(cat.tipoFrio || "")) g = formadoFrio(cat.tipoFrio, cat);
    if (!g) return null;
    var o = {}; Object.keys(g).forEach(function (k) { o[k] = g[k]; origem[k] = "geometria"; });
    ["A", "Ix", "Iy", "Wx", "Wy", "Zx", "Zy", "J", "Cw", "rx", "ry", "rz", "x0"].forEach(function (k) {
      if (fin(cat[k]) && cat[k] > 0) { o[k] = cat[k]; origem[k] = "catálogo"; }
    });
    if (fin(cat.massa) && cat.massa > 0) { o.massa = cat.massa; origem.massa = "catálogo"; }
    if (!(fin(cat.rx) && cat.rx > 0) && o.A > 0) o.rx = Math.sqrt(o.Ix / o.A);
    if (!(fin(cat.ry) && cat.ry > 0) && o.A > 0) o.ry = Math.sqrt(o.Iy / o.A);
    if (forma === "I" && !(fin(cat.Cw) && cat.Cw > 0)) { o.Cw = o.Iy * sq(o.d - o.tf) / 4; origem.Cw = "geometria (Iy·h0²/4, Iy do catálogo)"; }
    o.r0 = Math.sqrt(o.rx * o.rx + o.ry * o.ry + sq(num(o.x0, 0)) + sq(num(o.y0, 0)));
    o.origem = origem; o.forma = forma; o.nome = cat.nome || cat.designacao || "";
    return o;
  }

  var AcoSecao = { paredeFina: paredeFina, formadoFrio: formadoFrio, perfilI: perfilI, perfilU: perfilU, cantoneira: cantoneira,
                   tuboRet: tuboRet, tuboCirc: tuboCirc, barraRedonda: barraRedonda, dePerfil: dePerfil };
  global.AcoSecao = AcoSecao;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoSecao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

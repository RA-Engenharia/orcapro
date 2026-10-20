/* =====================================================================
 * js/biminstsombra.js — HidSombra: a PLANTA (e o corte) no nível ALTO como a VISTA ORTOGRÁFICA DA PRÓPRIA CENA 3D.
 *
 * Pedido do Rogério (18/10/2026, alvo = a planta Fina da referência, imagem 15): "a representação das conexões, na planta
 * e no 3D, tem que ficar igualzinha à peça" — o tubo sombreado com o contorno fino nas geratrizes, o joelho com o corpo
 * curvo contínuo, a bolsa mais larga com o friso (duas linhas paralelas atravessando o tubo), a junção em Y com o ramal a
 * 45°, o tê reto com o ramal a 90°, a conexão mais escura que o tubo. Em vez de DESENHAR cada peça à mão em 2D (o que
 * dava a "planta escrota" da imagem 16), a planta Alto passa a ser a PROJEÇÃO das malhas do 3D (js/biminstgeo.js):
 *
 *   1) RASTER sombreado por elemento (tubo, conexão, peça, registro): rasterização por software (z-buffer, normal
 *      interpolada, luz de cima-esquerda), supersample 2×, cortada pela faixa da vista; contorno escuro fino onde a
 *      cobertura acaba (silhueta), onde a profundidade salta (a bolsa sobre o tubo) e onde a normal dobra (o friso, o
 *      degrau da bolsa). Cada elemento na moldura do eixo dele (tubo inclinado não vira um quadrado enorme).
 *   2) ARESTAS EM VETOR para a prancha/PDF/DXF: silhueta (a face vira de frente para de costas) e dobra (> 30°) da malha,
 *      com a linha escondida removida — pelo z-buffer do próprio elemento e pelos elementos que ficam por cima.
 *   3) Cor: NEUTRA por padrão (tubo branco, conexão cinza — como a referência); "sistema" pinta o tubo na cor do
 *      sistema (modo de vista). O que é escuro no material (anel de borracha) continua escuro.
 *
 * Sem DOM e sem THREE: roda no Node (testes) e no navegador (js/bim.js vista2d chama com as malhas do modelo; o PNG
 * sai por canvas em pngDe). Unidades: metros; tela = x à direita, y para baixo (o mesmo telaX/telaY do vista2d).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* cor-base NEUTRA por papel (0–1): a referência pinta o tubo quase branco e a conexão em cinza médio */
  var NEUTRO = { tubo: [0.95, 0.95, 0.95], conexao: [0.58, 0.58, 0.58], peca: [0.78, 0.78, 0.78], acessorio: [0.58, 0.58, 0.58] };
  var CONTORNO = [0.16, 0.16, 0.16];
  var SS = 2;                   /* supersample por eixo */
  var ANG_DOBRA = 30;           /* graus: aresta de dobra da malha (friso, degrau da bolsa) */
  var ANG_DOBRA_PX = 38;        /* graus: dobra no raster (entre pixels vizinhos) */
  /* ⚠ MEMÓRIA (19/10/2026, causa do "Out of Memory" do Rogério). Cada elemento rasteriza com Z/normais/cores em
     Float32 do tamanho do quadro: a 24 milhões de pixels eram ~700 MB por elemento, e o CACHE guardava até 600
     resultados COM o z-buffer (_Z) e os triângulos (_T) — e a chave leva a posição da câmera, então cada zoom/pan
     enchia mais. A página chegava a 4 GB em ~2 min na planta Alto (perfil do navegador no uso real: 1.489 de 2.208
     amostras em renderElemento). Agora: quadro de no máximo TETO_PX (pico ~170 MB) e o cache com teto em BYTES. */
  var TETO_PX = 6e6;                       /* pixels por elemento, já com o supersample */
  var TETO_CACHE_BYTES = 192 * 1048576;    /* o que o cache de elementos pode reter */

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrmz(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

  /* a base de cor do elemento: neutra (por papel; o material escuro — anel, borracha — fica escuro) ou a do sistema */
  function corBase(papel, corMaterial, modo, corSistema) {
    var n = NEUTRO[papel] || NEUTRO.peca;
    /* a cor do sistema CLAREADA (o canal × 1,55, como a faixa clara do tubo sombreado da apresentação): o sombreado
       escurece as bordas; sem clarear, o meio do tubo ficava na cor escura do contorno */
    /* no modo "sistema" o tubo é a cor CHAPADA do sistema com sombreado SUAVE (a referência pinta o tubo de verde quase
       uniforme, mais escuro só na borda) — o sombreado forte escurecia metade da largura */
    if (modo === "sistema" && papel === "tubo" && corSistema) {
      /* o tom do sistema levado ao brilho da referência (o canal mais forte a 0,80: o verde escuro do contorno vira o verde
         vivo do preenchimento, o azul da água o azul claro) */
      var mx = Math.max(corSistema[0], corSistema[1], corSistema[2], 0.01), cs = corSistema.slice(0, 3).map(function (v) { return Math.min(1, v * 0.80 / mx); }); cs.suave = true; return cs;
    }
    /* só o QUASE PRETO do material (anel de borracha) fica escuro; a cor do sistema no 3D não conta */
    if (corMaterial && lum(corMaterial) < 0.15) { var l = Math.max(0.12, lum(corMaterial)); return [l, l, l]; }
    return n.slice();
  }

  /* ------------------------------------------------------------- recorte pela faixa da vista (lo ≤ f(p) ≤ hi) */
  function recortarTri(P, N, f, lo, hi) {
    var poly = [0, 1, 2].map(function (i) { return { p: P[i], n: N[i], f: f(P[i]) }; });
    function clip(pl, dentro, cruza) {
      var out = [];
      for (var i = 0; i < pl.length; i++) {
        var a = pl[i], b = pl[(i + 1) % pl.length], ia = dentro(a.f), ib = dentro(b.f);
        if (ia) out.push(a);
        if (ia !== ib) {
          var t = (cruza - a.f) / (b.f - a.f);
          out.push({ p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
                     n: [a.n[0] + (b.n[0] - a.n[0]) * t, a.n[1] + (b.n[1] - a.n[1]) * t, a.n[2] + (b.n[2] - a.n[2]) * t], f: cruza });
        }
      }
      return out;
    }
    if (lo != null) poly = clip(poly, function (v) { return v >= lo; }, lo);
    if (poly.length >= 3 && hi != null) poly = clip(poly, function (v) { return v <= hi; }, hi);
    var tris = [];
    for (var k = 1; k + 1 < poly.length; k++) tris.push([poly[0], poly[k], poly[k + 1]]);
    return tris;
  }

  /* ------------------------------------------------------------- um elemento: raster + arestas */
  /* el = { id, papel, malhas: [{ pos, nrm, idx, base:[r,g,b] }], eixo2d: [dx, dy] (opcional) }
     B = { O, r, up, dir } (mundo); o = { ppm, faixa: { f, lo, hi }, luz } */
  function triangulosDe(el, B, o) {
    var f = o.faixa && o.faixa.f, lo = o.faixa ? o.faixa.lo : null, hi = o.faixa ? o.faixa.hi : null, out = [];
    el.malhas.forEach(function (ml, im) {
      var pos = ml.pos, nrm = ml.nrm, idx = ml.idx;
      for (var t = 0; t + 2 < idx.length; t += 3) {
        var P = [], N = [];
        for (var j = 0; j < 3; j++) { var v = idx[t + j]; P.push([pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]]); N.push(nrm ? [nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]] : null); }
        if (!N[0]) { var gn = nrmz(cross(sub(P[1], P[0]), sub(P[2], P[0]))); N = [gn, gn, gn]; }
        if (f) {
          var fa = f(P[0]), fb = f(P[1]), fc = f(P[2]);
          if ((lo != null && fa < lo && fb < lo && fc < lo) || (hi != null && fa > hi && fb > hi && fc > hi)) continue;
          if ((lo == null || (fa >= lo && fb >= lo && fc >= lo)) && (hi == null || (fa <= hi && fb <= hi && fc <= hi))) { out.push({ P: P, N: N, m: im }); continue; }
          recortarTri(P, N, f, lo, hi).forEach(function (q) { out.push({ P: [q[0].p, q[1].p, q[2].p], N: [q[0].n, q[1].n, q[2].n], m: im }); });
        } else out.push({ P: P, N: N, m: im });
      }
    });
    return out;
  }

  function renderElemento(el, B, o) {
    var tris = triangulosDe(el, B, o); if (!tris.length) return null;
    /* o TUBO é um cilindro: 600 px/m bastam (DN 100 = 60 px) e o traço vem do vetor; a conexão na resolução pedida */
    var ppmE = el.papel === "tubo" ? Math.min(o.ppm, o.ppmTubo || 600) : o.ppm;
    var ppm = ppmE * SS, V = [-B.dir[0], -B.dir[1], -B.dir[2]];
    /* a moldura do elemento: o eixo dele na tela (tubo inclinado) ou a da tela */
    var ex = el.eixo2d && Math.hypot(el.eixo2d[0], el.eixo2d[1]) > 1e-9 ? el.eixo2d : [1, 0], la = Math.hypot(ex[0], ex[1]), ca = ex[0] / la, sa = ex[1] / la;
    function tela(p) { var w = sub(p, B.O), X = dot(w, B.r), Y = -dot(w, B.up); return [X * ca + Y * sa, -X * sa + Y * ca, dot(w, B.dir)]; }
    var T = tris.map(function (q) { return { S: q.P.map(tela), N: q.N, m: q.m, P: q.P }; });
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    T.forEach(function (q) { q.S.forEach(function (s) { if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0]; if (s[1] < y0) y0 = s[1]; if (s[1] > y1) y1 = s[1]; }); });
    var marg = 2 / ppmE; x0 -= marg; y0 -= marg; x1 += marg; y1 += marg;
    var W = Math.max(2, Math.ceil((x1 - x0) * ppmE)) * SS, H = Math.max(2, Math.ceil((y1 - y0) * ppmE)) * SS;
    if (W * H > TETO_PX) { var red = Math.sqrt(TETO_PX / (W * H)); W = Math.max(2, Math.floor(W * red)); H = Math.max(2, Math.floor(H * red)); ppm = Math.min(W / (x1 - x0), H / (y1 - y0)); }
    var Z = new Float32Array(W * H).fill(Infinity), NB = new Float32Array(W * H * 3), CB = new Float32Array(W * H * 3), SU = new Uint8Array(W * H);
    T.forEach(function (q) {
      var base = el.malhas[q.m].base || NEUTRO.peca;
      var px = q.S.map(function (s) { return [(s[0] - x0) * ppm, (s[1] - y0) * ppm, s[2]]; });
      var a = px[0], b = px[1], c = px[2], area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-12) return;
      var bx0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), bx1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      var by0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), by1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (var y = by0; y <= by1; y++) {
        var cy = y + 0.5;
        for (var x = bx0; x <= bx1; x++) {
          var cx = x + 0.5;
          var w0 = ((b[0] - cx) * (c[1] - cy) - (b[1] - cy) * (c[0] - cx)) / area, w1 = ((c[0] - cx) * (a[1] - cy) - (c[1] - cy) * (a[0] - cx)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          var d = w0 * a[2] + w1 * b[2] + w2 * c[2], k = y * W + x;
          if (d >= Z[k]) continue;
          Z[k] = d;
          var n = [w0 * q.N[0][0] + w1 * q.N[1][0] + w2 * q.N[2][0], w0 * q.N[0][1] + w1 * q.N[1][1] + w2 * q.N[2][1], w0 * q.N[0][2] + w1 * q.N[1][2] + w2 * q.N[2][2]];
          n = nrmz(n); if (dot(n, V) < 0) n = [-n[0], -n[1], -n[2]];
          NB[3 * k] = n[0]; NB[3 * k + 1] = n[1]; NB[3 * k + 2] = n[2];
          CB[3 * k] = base[0]; CB[3 * k + 1] = base[1]; CB[3 * k + 2] = base[2]; SU[k] = base.suave ? 1 : 0;
        }
      }
    });
    /* SOMBREAMENTO: luz de cima-esquerda da tela, quase do observador (o cilindro fica claro no meio e escurece nas bordas) */
    var L = nrmz([V[0] + 0.42 * B.up[0] - 0.30 * B.r[0], V[1] + 0.42 * B.up[1] - 0.30 * B.r[1], V[2] + 0.42 * B.up[2] - 0.30 * B.r[2]]);
    var Hh = nrmz([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
    var RGB = new Float32Array(W * H * 3), A = new Uint8Array(W * H);
    var dTol = Math.max(0.0015, 1.5 / ppm);
    for (var k = 0; k < W * H; k++) {
      if (Z[k] === Infinity) continue;
      A[k] = 1;
      var n0 = [NB[3 * k], NB[3 * k + 1], NB[3 * k + 2]], df = Math.max(0, dot(n0, L)), sp = Math.pow(Math.max(0, dot(n0, Hh)), 28);
      var fat = SU[k] ? 0.80 + 0.22 * df : 0.34 + 0.72 * df;
      for (var ch = 0; ch < 3; ch++) RGB[3 * k + ch] = Math.min(1, CB[3 * k + ch] * fat + (SU[k] ? 0.03 : 0.10) * sp);
    }
    /* CONTORNO no raster: silhueta (vizinho vazio), salto de profundidade (a bolsa sobre o tubo) e dobra da normal */
    var cosD = Math.cos(ANG_DOBRA_PX * Math.PI / 180), borda = new Uint8Array(W * H);
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      var kk = yy * W + xx; if (!A[kk]) continue;
      var nb = [[xx + 1, yy], [xx - 1, yy], [xx, yy + 1], [xx, yy - 1]];
      for (var q2 = 0; q2 < 4; q2++) {
        var X2 = nb[q2][0], Y2 = nb[q2][1];
        if (X2 < 0 || Y2 < 0 || X2 >= W || Y2 >= H) { borda[kk] = 1; break; }
        var k2 = Y2 * W + X2;
        if (!A[k2]) { borda[kk] = 1; break; }
        if (Z[k2] < Z[kk] - dTol) { borda[kk] = 1; break; }   /* o vizinho está bem mais perto: este pixel é a borda de baixo */
        if (NB[3 * kk] * NB[3 * k2] + NB[3 * kk + 1] * NB[3 * k2 + 1] + NB[3 * kk + 2] * NB[3 * k2 + 2] < cosD && Z[k2] <= Z[kk]) { borda[kk] = 1; break; }
      }
    }
    for (k = 0; k < W * H; k++) if (borda[k]) for (ch = 0; ch < 3; ch++) RGB[3 * k + ch] = RGB[3 * k + ch] * 0.15 + CONTORNO[ch] * 0.85;
    /* REDUÇÃO do supersample (média 2×2, alfa = cobertura) */
    var w = W / SS | 0, h = H / SS | 0, rgba = new Uint8ClampedArray(w * h * 4);
    for (var yo = 0; yo < h; yo++) for (var xo = 0; xo < w; xo++) {
      var sr = 0, sg = 0, sb = 0, sa2 = 0;
      for (var dy = 0; dy < SS; dy++) for (var dx = 0; dx < SS; dx++) { var ks = (yo * SS + dy) * W + xo * SS + dx; if (A[ks]) { sr += RGB[3 * ks]; sg += RGB[3 * ks + 1]; sb += RGB[3 * ks + 2]; sa2++; } }
      var ko = (yo * w + xo) * 4;
      if (sa2) { rgba[ko] = sr / sa2 * 255; rgba[ko + 1] = sg / sa2 * 255; rgba[ko + 2] = sb / sa2 * 255; rgba[ko + 3] = sa2 / (SS * SS) * 255; }
    }
    return { id: el.id, papel: el.papel, x: x0, y: y0, w: w * SS / ppm, h: h * SS / ppm, ang: Math.atan2(sa, ca) * 180 / Math.PI, W: w, H: h, rgba: rgba,
             _Z: Z, _A: A, _W: W, _H: H, _ppm: ppm, _x0: x0, _y0: y0, _ca: ca, _sa: sa, _tela: tela, _T: T, _min: Math.min.apply(null, T.map(function (q) { return Math.min(q.S[0][2], q.S[1][2], q.S[2][2]); })) };
  }

  /* ------------------------------------------------------------- arestas de feição (silhueta + dobra), linha escondida */
  function arestasDe(R, B, outros, o) {
    var V = [-B.dir[0], -B.dir[1], -B.dir[2]], mapa = {}, Q = 1e5, cosD = Math.cos(ANG_DOBRA * Math.PI / 180);
    function kq(p) { return Math.round(p[0] * Q) + "," + Math.round(p[1] * Q) + "," + Math.round(p[2] * Q); }
    R._T.forEach(function (q) {
      var gn = nrmz(cross(sub(q.P[1], q.P[0]), sub(q.P[2], q.P[0]))), fr = dot(gn, V);
      for (var i = 0; i < 3; i++) {
        var a = q.P[i], b = q.P[(i + 1) % 3], ka = kq(a), kb = kq(b); if (ka === kb) continue;
        var key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
        (mapa[key] = mapa[key] || { a: a, b: b, f: [] }).f.push({ n: gn, fr: fr });
      }
    });
    var segs = [], tolZ = Math.max(0.0025, 3 / R._ppm);
    /* a profundidade no pixel do ponto (o z-buffer do elemento): na silhueta a superfície é rasante — o pixel guarda um
       ponto alguns mm mais perto, então a silhueta do próprio elemento tem tolerância maior (8 mm); a dobra, a normal */
    function zEm(Rx, lx, ly) {
      var X = Math.floor((lx - Rx._x0) * Rx._ppm), Y = Math.floor((ly - Rx._y0) * Rx._ppm);
      if (X < 0 || Y < 0 || X >= Rx._W || Y >= Rx._H) return Infinity;
      var k = Y * Rx._W + X; return Rx._A[k] ? Rx._Z[k] : Infinity;
    }
    function visivel(p, sil) {
      var s = R._tela(p), zs = zEm(R, s[0], s[1]);
      if (zs < s[2] - (sil ? Math.max(tolZ, 0.008) : tolZ)) return false;
      for (var j = 0; j < outros.length; j++) {
        var Ro = outros[j], so = Ro._tela(p);
        if (so[0] < Ro._x0 || so[1] < Ro._y0 || so[0] > Ro._x0 + Ro._W / Ro._ppm || so[1] > Ro._y0 + Ro._H / Ro._ppm) continue;
        if (zEm(Ro, so[0], so[1]) < so[2] - tolZ) return false;
      }
      return true;
    }
    function telaG(p) { var w = sub(p, B.O); return [dot(w, B.r), -dot(w, B.up)]; }
    Object.keys(mapa).forEach(function (key) {
      var e = mapa[key], f = e.f, feicao = false, sil = false, EPS = 1e-4;
      if (f.length === 1) { feicao = true; sil = true; }
      else if (f.length >= 2) {
        /* silhueta: uma face de frente e a outra de costas OU de perfil (no cilindro de lados múltiplos de 4 a face do
           equador fica exatamente de perfil) */
        var fa = f[0].fr > EPS ? 1 : (f[0].fr < -EPS ? -1 : 0), fb = f[1].fr > EPS ? 1 : (f[1].fr < -EPS ? -1 : 0);
        if (fa !== fb && (fa === 1 || fb === 1)) { feicao = true; sil = true; }
        else if (dot(f[0].n, f[1].n) < cosD && (fa === 1 || fb === 1)) feicao = true;   /* dobra visível */
      }
      if (!feicao) return;
      var A2 = telaG(e.a), B2 = telaG(e.b), L = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]); if (L < 1e-5) return;
      /* amostras a cada ~3 mm e a TRANSIÇÃO visível/escondido refinada por bisseção (a ponta da linha cai na borda certa) */
      var n = Math.max(2, Math.min(400, Math.ceil(L / 0.003))), ini = null, ult = null, tAnt = 0, vAnt = null;
      function pT(t) { return [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t, e.a[2] + (e.b[2] - e.a[2]) * t]; }
      function borda(t0, t1, v0) { for (var it = 0; it < 10; it++) { var tm = (t0 + t1) / 2; if (visivel(pT(tm), sil) === v0) t0 = tm; else t1 = tm; } return v0 ? t0 : t1; }
      for (var i = 0; i <= n; i++) {
        var t = i / n, vis = visivel(pT(t), sil);
        if (vAnt !== null && vis !== vAnt) {
          var tb = borda(tAnt, t, vAnt);
          if (vis) ini = telaG(pT(tb)); else { ult = telaG(pT(tb)); if (ini && (Math.abs(ult[0] - ini[0]) + Math.abs(ult[1] - ini[1]) > 1e-6)) segs.push({ s: [ini[0], ini[1], ult[0], ult[1]], sil: sil }); ini = null; }
        } else if (vAnt === null && vis) ini = telaG(pT(0));
        if (i === n && vis && ini) { var fim = telaG(pT(1)); if (Math.abs(fim[0] - ini[0]) + Math.abs(fim[1] - ini[1]) > 1e-6) segs.push({ s: [ini[0], ini[1], fim[0], fim[1]], sil: sil }); }
        vAnt = vis; tAnt = t;
      }
    });
    return segs;
  }

  var CACHE = new Map(); CACHE.MAX = 600; CACHE.acertos = 0; CACHE.bytes = 0; CACHE.TETO = TETO_CACHE_BYTES;
  function bytesDe(r) {
    var b = 0;
    try { if (r.rgba) b += r.rgba.byteLength; if (r._Z) b += r._Z.byteLength; if (r._A) b += r._A.byteLength; if (r._T) b += r._T.length * 9 * 8 * 3; } catch (e) {}
    return b;
  }
  function guardar(k, r) {
    r._bytes = bytesDe(r);
    if (r._bytes > CACHE.TETO) return;   /* sozinho já passa do teto: não guarda */
    CACHE.set(k, r); CACHE.bytes += r._bytes;
    while ((CACHE.size > CACHE.MAX || CACHE.bytes > CACHE.TETO) && CACHE.size) { var k0 = CACHE.keys().next().value, r0 = CACHE.get(k0); CACHE["delete"](k0); CACHE.bytes -= (r0 && r0._bytes) || 0; }
  }
  /* ------------------------------------------------------------- a vista inteira */
  /* elementos em qualquer ordem: o pintor desenha do mais fundo para o mais perto (a bolsa cobre a ponta do tubo, a
     conexão cobre o tubo, o tubo de cima cobre o de baixo); as arestas de cada um levam em conta os que vêm depois */
  function renderizar(elementos, B, o) {
    o = o || {}; o.ppm = o.ppm || 1500;
    var R = [], base = [B.O, B.r, B.up, B.dir].map(function (v) { return v.map(function (x) { return Math.round(x * 1e6); }).join(","); }).join("|") + "|" + o.ppm +
      "|" + (o.faixa ? Math.round(o.faixa.lo * 1e4) + "," + Math.round(o.faixa.hi * 1e4) : "");
    /* CACHE por elemento (a chave vem de quem chama: a geometria + o lugar + a cor): a vista refeita sem mudar o elemento
       não rasteriza de novo — só as arestas (que dependem dos vizinhos) são refeitas */
    elementos.forEach(function (el) {
      var k = el.chave ? el.chave + "|" + base : null, r = k ? CACHE.get(k) : null;
      if (r) { CACHE["delete"](k); CACHE.set(k, r); CACHE.acertos++; }
      else { try { r = renderElemento(el, B, o); } catch (e) { r = null; } if (r && k) guardar(k, r); }
      if (r) R.push(r);
    });
    R.sort(function (a, b) { return b._min - a._min; });
    var out = { imagens: [], arestas: [] };
    R.forEach(function (r, i) {
      var depois = R.slice(i + 1);
      if (o.arestas !== false) arestasDe(r, B, depois, o).forEach(function (s) { out.arestas.push({ id: r.id, papel: r.papel, seg: s.s, sil: s.sil }); });
    });
    R.forEach(function (r) { out.imagens.push({ id: r.id, papel: r.papel, x: r.x, y: r.y, w: r.w, h: r.h, ang: r.ang, W: r.W, H: r.H, rgba: r.rgba }); });
    return out;
  }

  /* o PNG da imagem (navegador): canvas → data URL; sem DOM devolve null (quem chama pode usar o rgba) */
  function pngDe(im) {
    try {
      if (typeof document === "undefined") return null;
      var cv = document.createElement("canvas"); cv.width = im.W; cv.height = im.H;
      var cx = cv.getContext("2d"), id = cx.createImageData(im.W, im.H); id.data.set(im.rgba); cx.putImageData(id, 0, 0);
      return cv.toDataURL("image/png");
    } catch (e) { return null; }
  }

  var API = { ligada: true, cache: CACHE, TETO_PX: TETO_PX, TETO_CACHE_BYTES: TETO_CACHE_BYTES, renderizar: renderizar, renderElemento: renderElemento, corBase: corBase, pngDe: pngDe, recortarTri: recortarTri, NEUTRO: NEUTRO, SS: SS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.HidSombra = API;
})(typeof window !== "undefined" ? window : globalThis);

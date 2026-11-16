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
  var TETO_CACHE_BYTES = 128 * 1048576;    /* o que vistas VELHAS podem reter (abaixo do teto da cena) */

  /* ⚠ BUFFERS DE TRABALHO REAPROVEITADOS (14/11/2026). Cada peça alocava ~43 bytes por pixel (z, normal, cor, alfa,
     borda, RGB) e jogava fora: a 6 milhões de pixels eram ~260 MB de lixo POR PEÇA, e o laço por pixel ainda criava
     listas novas (a normal, os vizinhos) — milhões de objetos por peça. Nos diag/ do Rogério (12–14/11/2026) a página
     subia de ~0,8 GB a 2–4,2 GB ao desenhar a planta com 75–145 peças, e o vigia recarregava ("o sistema saiu"); no Mac
     do cliente, travava. Agora os buffers de TRABALHO (normal, nº do material, RGB, borda) nascem UMA vez por
     `renderizar` e são soltos no fim (pool_soltar); por peça só nasce o que ela GUARDA (z-buffer e alfa, que as arestas
     e o cache usam). A cor por pixel virou o NÚMERO do material (2 bytes em vez de 13: a cor é a mesma, lida na hora).
     A saída é IDÊNTICA pixel a pixel: tools/test-hid-sombra-identico.js compara a impressão digital com a de antes. */
  var POOL = { n: 0, NB: null, MI: null, RGB: null, borda: null };
  function pool(n) {
    if (POOL.n < n) { POOL.n = n; POOL.NB = new Float32Array(n * 3); POOL.MI = new Uint16Array(n); POOL.RGB = new Float32Array(n * 3); POOL.borda = new Uint8Array(n); }
    return POOL;
  }
  function poolSoltar() { POOL.n = 0; POOL.NB = POOL.MI = POOL.RGB = POOL.borda = null; }
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
    var Z = new Float32Array(W * H).fill(Infinity), PL = pool(W * H), NB = PL.NB, MI = PL.MI;
    /* as cores-base por número de material (o MI de cada pixel aponta para cá) */
    var BASES = el.malhas.map(function (m) { return m.base || NEUTRO.peca; });
    var V0 = V[0], V1 = V[1], V2 = V[2];
    /* ⚠ LIXO (15/11/2026): laço for em vez de forEach — no callback os números do laço por pixel saíam encaixotados
       (~20 MB de lixo por peça no perfil de alocação); as contas são as mesmas */
    for (var iqr = 0; iqr < T.length; iqr++) {
      var q = T[iqr], mi = q.m;
      var a0 = (q.S[0][0] - x0) * ppm, a1 = (q.S[0][1] - y0) * ppm, a2 = q.S[0][2];
      var b0 = (q.S[1][0] - x0) * ppm, b1 = (q.S[1][1] - y0) * ppm, b2 = q.S[1][2];
      var c0 = (q.S[2][0] - x0) * ppm, c1 = (q.S[2][1] - y0) * ppm, c2 = q.S[2][2];
      var area = (b0 - a0) * (c1 - a1) - (b1 - a1) * (c0 - a0);
      if (Math.abs(area) < 1e-12) continue;
      var N0 = q.N[0], N1 = q.N[1], N2 = q.N[2];
      var bx0 = Math.max(0, Math.floor(Math.min(a0, b0, c0))), bx1 = Math.min(W - 1, Math.ceil(Math.max(a0, b0, c0)));
      var by0 = Math.max(0, Math.floor(Math.min(a1, b1, c1))), by1 = Math.min(H - 1, Math.ceil(Math.max(a1, b1, c1)));
      for (var y = by0; y <= by1; y++) {
        var cy = y + 0.5;
        for (var x = bx0; x <= bx1; x++) {
          var cx = x + 0.5;
          var w0 = ((b0 - cx) * (c1 - cy) - (b1 - cy) * (c0 - cx)) / area, w1 = ((c0 - cx) * (a1 - cy) - (c1 - cy) * (a0 - cx)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          var d = w0 * a2 + w1 * b2 + w2 * c2, k = y * W + x;
          if (d >= Z[k]) continue;
          Z[k] = d;
          /* ⚠ as MESMAS contas, na MESMA ordem, de nrmz/dot (saída idêntica): sem lista nova por pixel */
          var nx = w0 * N0[0] + w1 * N1[0] + w2 * N2[0], ny = w0 * N0[1] + w1 * N1[1] + w2 * N2[1], nz = w0 * N0[2] + w1 * N1[2] + w2 * N2[2];
          var ln = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx = nx / ln; ny = ny / ln; nz = nz / ln;
          if (nx * V0 + ny * V1 + nz * V2 < 0) { nx = -nx; ny = -ny; nz = -nz; }
          NB[3 * k] = nx; NB[3 * k + 1] = ny; NB[3 * k + 2] = nz;
          MI[k] = mi;
        }
      }
    }
    /* SOMBREAMENTO: luz de cima-esquerda da tela, quase do observador (o cilindro fica claro no meio e escurece nas bordas) */
    var L = nrmz([V[0] + 0.42 * B.up[0] - 0.30 * B.r[0], V[1] + 0.42 * B.up[1] - 0.30 * B.r[1], V[2] + 0.42 * B.up[2] - 0.30 * B.r[2]]);
    var Hh = nrmz([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
    var RGB = PL.RGB, A = new Uint8Array(W * H);
    var dTol = Math.max(0.0015, 1.5 / ppm);
    var L0 = L[0], L1 = L[1], L2 = L[2], H0 = Hh[0], H1 = Hh[1], H2 = Hh[2];
    for (var k = 0; k < W * H; k++) {
      if (Z[k] === Infinity) continue;
      A[k] = 1;
      var p0 = NB[3 * k], p1 = NB[3 * k + 1], p2 = NB[3 * k + 2], bs = BASES[MI[k]], su = !!bs.suave;
      var df = Math.max(0, p0 * L0 + p1 * L1 + p2 * L2), sp = Math.pow(Math.max(0, p0 * H0 + p1 * H1 + p2 * H2), 28);
      var fat = su ? 0.80 + 0.22 * df : 0.34 + 0.72 * df;
      for (var ch = 0; ch < 3; ch++) RGB[3 * k + ch] = Math.min(1, Math.fround(bs[ch]) * fat + (su ? 0.03 : 0.10) * sp);
    }
    /* CONTORNO no raster: silhueta (vizinho vazio), salto de profundidade (a bolsa sobre o tubo) e dobra da normal */
    var cosD = Math.cos(ANG_DOBRA_PX * Math.PI / 180), borda = PL.borda;
    borda.fill(0, 0, W * H);
    /* vizinhos na ordem de sempre: direita, esquerda, abaixo, acima */
    var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      var kk = yy * W + xx; if (!A[kk]) continue;
      for (var q2 = 0; q2 < 4; q2++) {
        var X2 = xx + DX[q2], Y2 = yy + DY[q2];
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
    /* ⚠ MEMÓRIA (15/11/2026): o resultado guardava os triângulos inteiros (_T: ~10 listas por triângulo, ~700 bytes; a
       conexão tem ~5 mil triângulos = ~3,5 MB por peça) e o _tela, cuja closure prendia o contexto do renderElemento
       (o NB/MI do POOL também). Agora só os vértices em lista compacta (9 números por triângulo) — é o que as arestas
       usam — e a menor profundidade (a mesma conta de antes). */
    var TP = new Float64Array(T.length * 9), zMin = Math.min.apply(null, T.map(function (q) { return Math.min(q.S[0][2], q.S[1][2], q.S[2][2]); }));
    for (var it = 0; it < T.length; it++) for (var iv = 0; iv < 3; iv++) { var Pv = T[it].P[iv]; TP[it * 9 + iv * 3] = Pv[0]; TP[it * 9 + iv * 3 + 1] = Pv[1]; TP[it * 9 + iv * 3 + 2] = Pv[2]; }
    SERIAL++;
    return { _n: SERIAL, id: el.id, papel: el.papel, x: x0, y: y0, w: w * SS / ppm, h: h * SS / ppm, ang: Math.atan2(sa, ca) * 180 / Math.PI, W: w, H: h, rgba: rgba,
             _B: B, _Z: Z, _W: W, _H: H, _ppm: ppm, _x0: x0, _y0: y0, _ca: ca, _sa: sa, _TP: TP, _min: zMin };
  }

  /* ------------------------------------------------------------- arestas de feição (silhueta + dobra), linha escondida */
  /* ⚠ LIXO ALOCADO (15/11/2026). Roteiro do defeito: no projeto hidro de 1.039 peças / 314 trechos o heap profiler de
     alocação do navegador mediu ~30 GB alocados POR MINUTO de edição na planta Alto — o GC não acompanhava, o heap usado
     chegava a 2–2,9 GB e a página travava. Quase tudo daqui: cada ponto amostrado de cada aresta (até 400 por aresta,
     mais 10 passos de bisseção em cada troca visível/escondido) criava uma lista nova no pT, outra no R._tela(p) e mais
     uma por elemento de `outros` (TODOS os elementos de depois, mesmo longe); o mapa das arestas (chaves em texto) era
     refeito a cada vista e percorrido por Object.keys().forEach; e o renderizar copiava R.slice(i + 1) por elemento.
     Agora: o ponto é escalar (telaEm escreve no vetor TS do módulo), as feições da malha ficam guardadas no próprio
     resultado do elemento (R._fe, refeitas só se a direção da vista mudar), e cada aresta só testa os elementos cujo
     retângulo na tela cruza o dela. ⚠ SAÍDA IDÊNTICA: as contas são as MESMAS, na MESMA ordem, de sub/dot/_tela/pT
     (ponto flutuante não é associativo — trocar a ordem muda o último bit e a ponta da linha anda);
     tools/test-hid-sombra-identico.js compara a impressão digital. A régua do lixo: tools/bench-sombra-alocacao.js. */
  var TS = [0, 0, 0];
  /* = Rx._tela(p) (a moldura do elemento, com a vista em que ele foi rasterizado), sem lista nova: o resultado vai em TS */
  function telaEm(Rx, px, py, pz) {
    var Bx = Rx._B, O = Bx.O, r = Bx.r, up = Bx.up, d = Bx.dir;
    var w0 = px - O[0], w1 = py - O[1], w2 = pz - O[2];
    var X = w0 * r[0] + w1 * r[1] + w2 * r[2], Y = -(w0 * up[0] + w1 * up[1] + w2 * up[2]);
    TS[0] = X * Rx._ca + Y * Rx._sa; TS[1] = -X * Rx._sa + Y * Rx._ca; TS[2] = w0 * d[0] + w1 * d[1] + w2 * d[2];
  }
  /* o retângulo do quadro do elemento na tela SEM a rotação do eixo dele (para saber quem pode cobrir quem). A folga de
     1 mm cobre a vista refeita do cache (a chave arredonda a câmera a 1e-6) — folga só faz testar a mais, nunca a menos */
  var FOLGA_G = 1e-3;
  function caixaG(Rx) {
    if (Rx._gx0 != null) return;
    var u0 = Rx._x0, v0 = Rx._y0, u1 = Rx._x0 + Rx._W / Rx._ppm, v1 = Rx._y0 + Rx._H / Rx._ppm, ca = Rx._ca, sa = Rx._sa;
    var gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (var c = 0; c < 4; c++) {
      var u = (c & 1) ? u1 : u0, v = (c & 2) ? v1 : v0, gx = u * ca - v * sa, gy = u * sa + v * ca;
      if (gx < gx0) gx0 = gx; if (gx > gx1) gx1 = gx; if (gy < gy0) gy0 = gy; if (gy > gy1) gy1 = gy;
    }
    Rx._gx0 = gx0 - FOLGA_G; Rx._gx1 = gx1 + FOLGA_G; Rx._gy0 = gy0 - FOLGA_G; Rx._gy1 = gy1 + FOLGA_G;
  }
  /* as arestas de feição da malha (silhueta e dobra visível), na ordem de sempre — dependem só dos triângulos e da
     direção da vista: guardadas no resultado do elemento (que o CACHE reaproveita entre uma edição e outra) em lista
     COMPACTA (FE: 6 números por aresta, FS: 1 = silhueta). ⚠ As mesmas contas de nrmz(cross(sub, sub)) e dot, na mesma
     ordem, em escalar; a ordem das arestas = a de inserção do mapa (a do Object.keys de antes). */
  function feicoesDe(R, B) {
    var V0 = -B.dir[0], V1 = -B.dir[1], V2 = -B.dir[2];
    if (R._FE && R._feV[0] === V0 && R._feV[1] === V1 && R._feV[2] === V2) return R;
    var TP = R._TP, nT = TP.length / 9, Q = 1e5, cosD = Math.cos(ANG_DOBRA * Math.PI / 180);
    var GN = new Float64Array(nT * 3), FR = new Float64Array(nT), lista = [];
    /* ⚠ a identidade do vértice e da aresta é a de antes (o vértice arredondado a 1e-5 m; a aresta = o par sem ordem),
       mas por NÚMERO: o texto "x,y,z|x,y,z" por aresta custava ~30 ms e milhares de textos na peça editada */
    var VX = new Map(), nV = 0, ARE = new Map(), VID = new Int32Array(nT * 3);
    for (var iv0 = 0; iv0 < nT * 3; iv0++) {
      var rx = Math.round(TP[iv0 * 3] * Q), ry = Math.round(TP[iv0 * 3 + 1] * Q), rz = Math.round(TP[iv0 * 3 + 2] * Q);
      var my = VX.get(rx); if (!my) { my = new Map(); VX.set(rx, my); }
      var mz = my.get(ry); if (!mz) { mz = new Map(); my.set(ry, mz); }
      var id = mz.get(rz); if (id === undefined) { id = nV++; mz.set(rz, id); }
      VID[iv0] = id;
    }
    for (var iq = 0; iq < nT; iq++) {
      var o9 = iq * 9;
      var ux = TP[o9 + 3] - TP[o9], uy = TP[o9 + 4] - TP[o9 + 1], uz = TP[o9 + 5] - TP[o9 + 2];
      var vx = TP[o9 + 6] - TP[o9], vy = TP[o9 + 7] - TP[o9 + 1], vz = TP[o9 + 8] - TP[o9 + 2];
      var c0 = uy * vz - uz * vy, c1 = uz * vx - ux * vz, c2 = ux * vy - uy * vx, l = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2) || 1;
      var g0 = c0 / l, g1 = c1 / l, g2 = c2 / l;
      GN[iq * 3] = g0; GN[iq * 3 + 1] = g1; GN[iq * 3 + 2] = g2; FR[iq] = g0 * V0 + g1 * V1 + g2 * V2;
      for (var i = 0; i < 3; i++) {
        var ia = iq * 3 + i, ib = iq * 3 + (i + 1) % 3, va = VID[ia], vb = VID[ib]; if (va === vb) continue;
        var key = va < vb ? va * nT * 3 + vb : vb * nT * 3 + va, e = ARE.get(key);
        if (!e) { e = { oa: ia * 3, ob: ib * 3, n: 0, f0: 0, f1: 0 }; ARE.set(key, e); lista.push(e); }
        if (e.n === 0) e.f0 = iq; else if (e.n === 1) e.f1 = iq;
        e.n++;
      }
    }
    var FE = [], FS = [], EPS = 1e-4;
    for (var k = 0; k < lista.length; k++) {
      var ed = lista[k], feicao = false, sil = false;
      if (ed.n === 1) { feicao = true; sil = true; }
      else if (ed.n >= 2) {
        /* silhueta: uma face de frente e a outra de costas OU de perfil (no cilindro de lados múltiplos de 4 a face do
           equador fica exatamente de perfil) */
        var r0 = FR[ed.f0], r1 = FR[ed.f1], fa = r0 > EPS ? 1 : (r0 < -EPS ? -1 : 0), fb = r1 > EPS ? 1 : (r1 < -EPS ? -1 : 0);
        var n0 = ed.f0 * 3, n1 = ed.f1 * 3;
        if (fa !== fb && (fa === 1 || fb === 1)) { feicao = true; sil = true; }
        else if (GN[n0] * GN[n1] + GN[n0 + 1] * GN[n1 + 1] + GN[n0 + 2] * GN[n1 + 2] < cosD && (fa === 1 || fb === 1)) feicao = true;   /* dobra visível */
      }
      if (feicao) { FE.push(TP[ed.oa], TP[ed.oa + 1], TP[ed.oa + 2], TP[ed.ob], TP[ed.ob + 1], TP[ed.ob + 2]); FS.push(sil ? 1 : 0); }
    }
    R._FE = new Float64Array(FE); R._FS = new Uint8Array(FS); R._feV = [V0, V1, V2];
    somarBytes(R, R._FE.byteLength + R._FS.byteLength);   /* o teto do cache conta as feições também */
    return R;
  }
  var CE = [];   /* os elementos que podem cobrir a aresta da vez (reaproveitada: não nasce lista por aresta) */
  function arestasDe(R, B, outros, o) {
    var FR0 = feicoesDe(R, B), FE = FR0._FE, FS = FR0._FS, segs = [], tolZ = Math.max(0.0025, 3 / R._ppm), tolS = Math.max(tolZ, 0.008);
    var BO = B.O, Br = B.r, Bu = B.up;
    /* a profundidade no pixel do ponto (o z-buffer do elemento): na silhueta a superfície é rasante — o pixel guarda um
       ponto alguns mm mais perto, então a silhueta do próprio elemento tem tolerância maior (8 mm); a dobra, a normal */
    function zEm(Rx, lx, ly) {
      var X = Math.floor((lx - Rx._x0) * Rx._ppm), Y = Math.floor((ly - Rx._y0) * Rx._ppm);
      if (X < 0 || Y < 0 || X >= Rx._W || Y >= Rx._H) return Infinity;
      return Rx._Z[Y * Rx._W + X];   /* o pixel vazio já é Infinity no z-buffer (o alfa A[k] = 1 só onde Z < Infinity): sem guardar o A */
    }
    var a0, a1, a2, b0, b1, b2, sil, nc;
    /* o ponto t da aresta da vez: as contas do pT de antes (a + (b − a)·t), em escalar */
    function visivel(t) {
      var px = a0 + (b0 - a0) * t, py = a1 + (b1 - a1) * t, pz = a2 + (b2 - a2) * t;
      telaEm(R, px, py, pz);
      if (zEm(R, TS[0], TS[1]) < TS[2] - (sil ? tolS : tolZ)) return false;
      for (var j = 0; j < nc; j++) {
        var Ro = CE[j]; telaEm(Ro, px, py, pz);
        var s0 = TS[0], s1 = TS[1];
        if (s0 < Ro._x0 || s1 < Ro._y0 || s0 > Ro._x0 + Ro._W / Ro._ppm || s1 > Ro._y0 + Ro._H / Ro._ppm) continue;
        if (zEm(Ro, s0, s1) < TS[2] - tolZ) return false;
      }
      return true;
    }
    /* o ponto t na tela global (as contas do telaG(pT(t)) de antes) — só nas pontas dos segmentos, que são a saída */
    function ptG(t) {
      var px = a0 + (b0 - a0) * t, py = a1 + (b1 - a1) * t, pz = a2 + (b2 - a2) * t;
      var w0 = px - BO[0], w1 = py - BO[1], w2 = pz - BO[2];
      return [w0 * Br[0] + w1 * Br[1] + w2 * Br[2], -(w0 * Bu[0] + w1 * Bu[1] + w2 * Bu[2])];
    }
    function borda(t0, t1, v0) { for (var it = 0; it < 10; it++) { var tm = (t0 + t1) / 2; if (visivel(tm) === v0) t0 = tm; else t1 = tm; } return v0 ? t0 : t1; }
    for (var ie = 0; ie < FS.length; ie++) {
      var o6 = ie * 6;
      a0 = FE[o6]; a1 = FE[o6 + 1]; a2 = FE[o6 + 2]; b0 = FE[o6 + 3]; b1 = FE[o6 + 4]; b2 = FE[o6 + 5]; sil = FS[ie] === 1;
      /* o comprimento na tela com as pontas da malha (telaG(e.a), telaG(e.b) de antes: o n de amostras sai igual) */
      var wa0 = a0 - BO[0], wa1 = a1 - BO[1], wa2 = a2 - BO[2], wb0 = b0 - BO[0], wb1 = b1 - BO[1], wb2 = b2 - BO[2];
      var gax = wa0 * Br[0] + wa1 * Br[1] + wa2 * Br[2], gay = -(wa0 * Bu[0] + wa1 * Bu[1] + wa2 * Bu[2]);
      var gbx = wb0 * Br[0] + wb1 * Br[1] + wb2 * Br[2], gby = -(wb0 * Bu[0] + wb1 * Bu[1] + wb2 * Bu[2]);
      var L = Math.hypot(gbx - gax, gby - gay); if (L < 1e-5) continue;
      var A2 = ptG(0), B2 = ptG(1);
      /* só quem tem o retângulo cruzando o da aresta pode cobrir algum ponto dela */
      var ex0 = Math.min(gax, gbx), ex1 = Math.max(gax, gbx), ey0 = Math.min(gay, gby), ey1 = Math.max(gay, gby);
      nc = 0;
      for (var jo = 0; jo < outros.length; jo++) { var Rc = outros[jo]; if (Rc._gx0 <= ex1 && Rc._gx1 >= ex0 && Rc._gy0 <= ey1 && Rc._gy1 >= ey0) CE[nc++] = Rc; }
      /* amostras a cada ~3 mm e a TRANSIÇÃO visível/escondido refinada por bisseção (a ponta da linha cai na borda certa) */
      var n = Math.max(2, Math.min(400, Math.ceil(L / 0.003))), ini = null, ult = null, tAnt = 0, vAnt = null;
      for (var i = 0; i <= n; i++) {
        var t = i / n, vis = visivel(t);
        if (vAnt !== null && vis !== vAnt) {
          var tb = borda(tAnt, t, vAnt);
          if (vis) ini = ptG(tb); else { ult = ptG(tb); if (ini && (Math.abs(ult[0] - ini[0]) + Math.abs(ult[1] - ini[1]) > 1e-6)) segs.push({ s: [ini[0], ini[1], ult[0], ult[1]], sil: sil }); ini = null; }
        } else if (vAnt === null && vis) ini = A2;
        if (i === n && vis && ini) { var fim = B2; if (Math.abs(fim[0] - ini[0]) + Math.abs(fim[1] - ini[1]) > 1e-6) segs.push({ s: [ini[0], ini[1], fim[0], fim[1]], sil: sil }); }
        vAnt = vis; tAnt = t;
      }
    }
    CE.length = 0;   /* não prende elemento entre uma vista e outra */
    return segs;
  }

  /* ⚠ PLANTA POR PEÇA (15/11/2026). Antes a cada edição as arestas de TODAS as peças eram refeitas contra todas (e com
     o teto de 192 MB o cache de um projeto de ~1.000 peças não cabia: a cada vista ele expulsava as próprias peças da
     vista e rasterizava tudo de novo). Agora:
       · o resultado de cada peça leva um número de série (_n): a MESMA peça (mesma chave = geometria + lugar + cor)
         volta do cache com o mesmo número; peça mudada é resultado novo, número novo;
       · as ARESTAS de uma peça dependem só dela e das peças desenhadas DEPOIS (mais perto) cujo retângulo na tela cruza
         o dela — são as únicas que podem cobrir um ponto dela (visivel). A assinatura delas = o número da peça + os
         números dessas vizinhas, em ordem, + a vista exata. Peça que muda invalida as próprias arestas e as de quem está
         ATRÁS dela no retângulo (as que ela cobre ou deixa de cobrir); peça que entra ou sai do retângulo muda a lista.
         Fora disso a conta seria a mesma — a saída é IDÊNTICA à do cálculo completo
         (tools/test-hid-sombra-incremental.js, com controle negativo);
       · as peças da VISTA ATUAL não são expulsas pelo teto de 192 MB (só as de vistas/edições velhas), até TETO_CENA:
         acima disso volta a valer o teto para todas (o projeto enorme fica mais lento, mas não estoura a memória). */
  /* Teto DURO do retido (pedido da coordenadora 16/11): 6% do limite do heap do JS, entre 128 e 256 MB; sem
     performance.memory (Firefox/Node) = 256 MB. Antes eram 768 MB fixos: num projeto de ~1.000 peças o cache ficava em
     ~690 MB e o vigia de memória voltava a agir. Acima do teto o PESADO é esvaziado e refeito quando falta (mesma saída). */
  function tetoCena() {
    var lim = 0; try { lim = (typeof performance !== 'undefined' && performance.memory && performance.memory.jsHeapSizeLimit) || 0; } catch (e) { lim = 0; }
    var MB = 1048576; if (!lim) return 256 * MB;
    return Math.max(128 * MB, Math.min(256 * MB, Math.floor(lim * 0.06)));
  }
  var TETO_CENA_BYTES = tetoCena();
  var SERIAL = 0;
  var CACHE = new Map(); CACHE.MAX = 600; CACHE.acertos = 0; CACHE.bytes = 0; CACHE.TETO = TETO_CACHE_BYTES; CACHE.TETO_CENA = TETO_CENA_BYTES; CACHE.gen = 0; CACHE.arestasReuso = 0;
  function bytesDe(r) {
    var b = 0;
    try { if (r.rgba) b += r.rgba.byteLength; if (r._Z) b += r._Z.byteLength; if (r._TP) b += r._TP.byteLength; if (r._FE) b += r._FE.byteLength + r._FS.byteLength; } catch (e) {}
    return b;
  }
  function guardar(k, r) {
    r._bytes = bytesDe(r);
    if (r._bytes > CACHE.TETO) return;   /* sozinho já passa do teto: não guarda */
    CACHE.set(k, r); CACHE.bytes += r._bytes; r._emCache = true; r._k = k; r._gen = CACHE.gen;
    /* ⚠ no meio da vista só o teto DURO: as peças desta vista ainda não tocadas estão com a marca da vista anterior e
       seriam expulsas como velhas (era o que fazia o cache "esquecer" a planta inteira a cada edição) */
    if (CACHE.bytes > CACHE.TETO_CENA) aparar(true);
  }
  /* o PESADO de um resultado (z-buffer, vértices, feições) — refeito de novo pelo renderElemento quando faltar (a mesma
     conta, o mesmo resultado); o LEVE (imagem, arestas, retângulo) fica */
  function pesoPesado(r) { return (r._Z ? r._Z.byteLength : 0) + (r._TP ? r._TP.byteLength : 0); }   /* as feições (pequenas) ficam: refazê-las custava mais que guardá-las */
  function esvaziar(r) { var nb = pesoPesado(r); if (!nb) return 0; r._Z = null; r._TP = null; r._leve = true; r._bytes -= nb; CACHE.bytes -= nb; return nb; }
  /* a ordem de expulsão:
       1) o que não é desta vista (edição/câmera velha), do mais antigo ao mais novo, até o TETO (192 MB) e o MAX;
       2) passou do TETO_CENA: esvazia o PESADO das peças desta vista menos usado como oclusão (_uso) — 10% de folga;
       3) ainda passou: expulsa do mais antigo, mesmo desta vista. `duro` = no meio da vista (só 2 e 3). */
  function aparar(duro) {
    var k0, r0;
    if (!duro) {
      var it = CACHE.keys();
      while ((CACHE.size > CACHE.MAX || CACHE.bytes > CACHE.TETO) && CACHE.size) {
        k0 = it.next().value; if (k0 === undefined) break;
        r0 = CACHE.get(k0); if (r0 && r0._gen === CACHE.gen) break;   /* daqui em diante, tudo é desta vista */
        CACHE["delete"](k0); CACHE.bytes -= (r0 && r0._bytes) || 0; if (r0) r0._emCache = false;
      }
    }
    if (CACHE.bytes > CACHE.TETO_CENA) {
      var pes = []; CACHE.forEach(function (r) { if (!r._leve) pes.push(r); });
      pes.sort(function (a, b) { return (a._uso || 0) - (b._uso || 0); });
      for (var i = 0; i < pes.length && CACHE.bytes > CACHE.TETO_CENA * 0.9; i++) esvaziar(pes[i]);
    }
    while (CACHE.bytes > CACHE.TETO_CENA && CACHE.size) { k0 = CACHE.keys().next().value; r0 = CACHE.get(k0); CACHE["delete"](k0); CACHE.bytes -= (r0 && r0._bytes) || 0; if (r0) r0._emCache = false; }
  }
  function somarBytes(r, nb) { if (r._emCache && CACHE.get(r._k) === r) { r._bytes += nb; CACHE.bytes += nb; } }
  var USO = 0;
  /* o resultado esvaziado volta a ter o z-buffer e os vértices (renderElemento com a vista em que ele nasceu) */
  function encher(r, o) {
    r._uso = ++USO;
    if (!r._leve) return true;
    var el = r._el, rr = null; if (!el) return false;
    try { rr = renderElemento(el, r._B, o); } catch (e) { rr = null; }
    if (!rr || rr._W !== r._W || rr._H !== r._H) return false;
    r._Z = rr._Z; r._TP = rr._TP; r._leve = false; CACHE.reenchidos = (CACHE.reenchidos || 0) + 1;
    somarBytes(r, rr._Z.byteLength + rr._TP.byteLength);
    return true;
  }
  /* ------------------------------------------------------------- a vista inteira */
  /* elementos em qualquer ordem: o pintor desenha do mais fundo para o mais perto (a bolsa cobre a ponta do tubo, a
     conexão cobre o tubo, o tubo de cima cobre o de baixo); as arestas de cada um levam em conta os que vêm depois */
  function renderizar(elementos, B, o) {
    o = o || {}; o.ppm = o.ppm || 1500;
    var R = [], base = [B.O, B.r, B.up, B.dir].map(function (v) { return v.map(function (x) { return Math.round(x * 1e6); }).join(","); }).join("|") + "|" + o.ppm +
      "|" + (o.faixa ? Math.round(o.faixa.lo * 1e4) + "," + Math.round(o.faixa.hi * 1e4) : "");
    /* CACHE por elemento (a chave vem de quem chama: a geometria + o lugar + a cor): a vista refeita sem mudar o elemento
       não rasteriza de novo — e as arestas também saem do cache quando nem ela nem quem a cobre mudou */
    CACHE.gen++;
    var out = { imagens: [], arestas: [] };
    try {
      elementos.forEach(function (el) {
        var k = el.chave ? el.chave + "|" + base : null, r = k ? CACHE.get(k) : null;
        if (r) { CACHE["delete"](k); CACHE.set(k, r); CACHE.acertos++; r._gen = CACHE.gen; }
        else { try { r = renderElemento(el, B, o); } catch (e) { r = null; } if (r && k) guardar(k, r); }
        if (r) { r._el = el; R.push(r); }   /* _el só durante a chamada (para encher o esvaziado) */
      });
      R.sort(function (a, b) { return b._min - a._min; });
      /* ⚠ LIXO (15/11/2026): era R.slice(i + 1) por elemento (N²/2 cópias de lista) e TODOS os de depois testados em cada
         ponto amostrado. Agora só os de depois cujo retângulo na tela cruza o deste (os outros não cobrem nenhum ponto dele:
         o teste de dentro do quadro em visivel já os pulava) — o resultado é o mesmo */
      if (o.arestas !== false) {
        for (var i = 0; i < R.length; i++) caixaG(R[i]);
        /* a vista EXATA (a chave do cache arredonda a câmera; as arestas usam a vista desta chamada) */
        var vB = [B.O, B.r, B.up, B.dir].join("|");
        for (i = 0; i < R.length; i++) {
          /* a assinatura das arestas: os números das vizinhas que podem cobri-la, comparados com os da última vez sem
             montar texto (o número da própria peça é o do resultado: peça mudada = resultado novo, sem arestas) */
          var r = R[i], cand = [], ant = r._segCand, igual = !!(r._segs && ant && r._segB === vB), nc2 = 0;
          for (var j = i + 1; j < R.length; j++) {
            var Rj = R[j];
            if (Rj._gx0 <= r._gx1 && Rj._gx1 >= r._gx0 && Rj._gy0 <= r._gy1 && Rj._gy1 >= r._gy0) {
              cand.push(Rj);
              if (igual && (nc2 >= ant.length || ant[nc2] !== Rj._n)) igual = false;
              nc2++;
            }
          }
          if (igual && nc2 !== ant.length) igual = false;
          if (igual) CACHE.arestasReuso++;
          else {
            /* precisa do z-buffer dela e de quem pode cobri-la (o esvaziado é refeito: a mesma conta) */
            var cheio = encher(r, o);
            for (var c = 0; c < cand.length; c++) if (!encher(cand[c], o)) cheio = false;
            if (!cheio) throw new Error("HidSombra: resultado esvaziado sem como refazer");
            var sg = arestasDe(r, B, cand, o), so = [];
            for (var m = 0; m < sg.length; m++) so.push({ id: r.id, papel: r.papel, seg: sg[m].s, sil: sg[m].sil });
            if (r._segs) somarBytes(r, -r._segs.length * 96);
            r._segs = so; r._segB = vB; r._segCand = cand.map(function (q) { return q._n; }); somarBytes(r, so.length * 96);
          }
          /* ⚠ os MESMOS objetos de aresta da última vez (quem chama só lê: js/bim.js copia o seg com slice) */
          var sv = r._segs; for (var m2 = 0; m2 < sv.length; m2++) out.arestas.push(sv[m2]);
        }
      }
    } finally {
      poolSoltar();   /* ⚠ os buffers de trabalho não ficam presos entre uma planta e outra */
      for (var z = 0; z < R.length; z++) R[z]._el = null;   /* não prende as malhas de quem chamou */
    }
    R.forEach(function (r) { out.imagens.push({ id: r.id, papel: r.papel, x: r.x, y: r.y, w: r.w, h: r.h, ang: r.ang, W: r.W, H: r.H, rgba: r.rgba }); });
    aparar(false);   /* a vista acabou: o que não é desta vista sai até o teto; o pesado, até o TETO_CENA */
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

  var API = { ligada: true, cache: CACHE, TETO_PX: TETO_PX, TETO_CACHE_BYTES: TETO_CACHE_BYTES, TETO_CENA_BYTES: TETO_CENA_BYTES, renderizar: renderizar, renderElemento: renderElemento, corBase: corBase, pngDe: pngDe, recortarTri: recortarTri, NEUTRO: NEUTRO, SS: SS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.HidSombra = API;
})(typeof window !== "undefined" ? window : globalThis);

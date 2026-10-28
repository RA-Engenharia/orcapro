/* =====================================================================
 * hidlouca.js — GEOMETRIA REAL das louças, metais e equipamentos do hidrossanitário e da
 * climatização (motor puro, Node-testável). QUALIDADE VISUAL 3, 17/10/2026: o Rogério reprovou o 3D
 * ("a bacia e o lavatório viraram caixas brancas") e pediu famílias no nível de um projeto feito em
 * software BIM comercial.
 *
 * O QUE É: um gerador de MALHA por tipo de aparelho, a partir das COTAS do tipo (as que o catálogo dá,
 * as de instalação e as de reserva "a conferir"). Nenhum arquivo .rfa/.ifc/malha de fabricante entra
 * aqui (docs/hidro/PESQUISA-OBJETOS-BIM.md: nenhum fabricante autoriza embutir o objeto dele; o
 * BIMobject proíbe, 4.7(g)). A forma é NOSSA: proporções de desenho sobre as cotas do catálogo.
 *
 * COMO ENTRA NA FAMÍLIA: um sólido { forma: "gerada", gerador: "<nome>", p: { <chave>: "<fórmula>" } }
 * do js/familia.js. Na avaliação, as fórmulas viram números e HidLouca.gerar() devolve as PARTES (uma
 * por peça: louça, assento, tampa, torneira, sifão…), cada uma uma malha FECHADA, indexada (normais
 * suaves no 3D) e com o material dela. O familia.js junta as partes por material (uma chamada de desenho
 * por material) e guarda os NÍVEIS DE DETALHE (lod) que o 3D troca pela distância da câmera.
 *
 * FERRAMENTAS (formas compostas):
 *   loft      — liga anéis (seções) de mesma contagem de pontos: seção que muda de forma ao longo da
 *               peça (bacia: pé estreito → corpo → borda oval → cuba por dentro);
 *   torno     — revolução de um perfil em volta de um eixo qualquer (canopla, volante, reservatório);
 *   tubo      — varredura de um círculo por um caminho, com as curvas arredondadas (bica, braço,
 *               engate flexível, sifão sanfonado);
 *   caixaR    — caixa com cantos e arestas arredondados (caixa acoplada, gabinete, painel);
 *   chaikin   — arredondamento de contorno por subdivisão (o filete do perfil da evaporadora).
 * ORÇAMENTO DE TRIÂNGULOS por gerador (ORCAMENTO) e três NÍVEIS: 0 (perto), 1 (médio), 2 (longe).
 *
 * ⚠ REGRAS (cada uma existe por um defeito que ela impede):
 *  1. A envolvente da LOUÇA/CORPO bate com as cotas da família (tools/test-hid-louca.js). Metais, sifão
 *     e engates são ACESSÓRIOS (parte.acessorio = true): saem da conta da envolvente, mas o ponto de
 *     saída deles vai até o conector da família quando a família tem o conector ali.
 *  2. Toda parte é malha FECHADA de volume positivo, sem NaN, normais para fora (o volume com sinal
 *     decide e vira a parte que sair do avesso).
 *  3. Nenhum número de NORMA aqui: todo número é desenho (proporção, raio de arredondamento,
 *     segmentos) — bloco hid:geometria (tools/test-hid-sem-numero-magico.js).
 *  4. Nenhuma marca no nome das partes.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — daqui até o marcador de fim, todo número é DESENHO (proporção sobre a cota do
     catálogo, raio de arredondamento, segmentos de malha), nunca valor de norma */

  var TAU = Math.PI * 2;
  var LOUCA = "Louça branca", CROMO = "Metal cromado", INOX = "Inox", BRANCO = "Branco", PRETO = "Preto",
      PLAST = "Plástico", PVC = "PVC", ESCURO = "Cinza escuro", CLARO = "Cinza claro", LATAO = "Latão",
      FERRO = "Ferro fundido", AZUL = "Azul", POLI = "Polietileno azul", BORRACHA = "Preto";
  var NIVEIS = [
    { N: 32, n: 14, arco: 4, k: 4, kv: 3 },
    { N: 20, n: 10, arco: 3, k: 2, kv: 2 },
    { N: 12, n: 6, arco: 2, k: 1, kv: 1 }
  ];

  function sgn(x) { return x < 0 ? -1 : 1; }
  function cl(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function esc(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function pe(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vx(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function cmp(a) { return Math.sqrt(pe(a, a)); }
  function nrm(a) { var c = cmp(a); return c > 1e-12 ? esc(a, 1 / c) : [0, 0, 0]; }

  /* ------------------------------------------------------------------ MALHA */
  function Malha() { return { v: [], f: [] }; }
  function anelAdd(m, pts) { var i0 = m.v.length / 3; for (var i = 0; i < pts.length; i++) m.v.push(pts[i][0], pts[i][1], pts[i][2]); return i0; }
  function liga(m, a, b, n) { for (var j = 0; j < n; j++) { var j2 = (j + 1) % n; m.f.push(a + j, b + j, b + j2, a + j, b + j2, a + j2); } }
  function centro(pts) { var c = [0, 0, 0]; pts.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return esc(c, 1 / pts.length); }
  function tampa(m, pts, inicio) {
    var n = pts.length, a = anelAdd(m, pts), c = centro(pts), ic = m.v.length / 3;
    m.v.push(c[0], c[1], c[2]);
    for (var j = 0; j < n; j++) { var j2 = (j + 1) % n; if (inicio) m.f.push(ic, a + j, a + j2); else m.f.push(ic, a + j2, a + j); }
  }
  function volumeFaces(m, f0) {
    var v = m.v, f = m.f, vol = 0;
    for (var q = f0; q + 2 < f.length; q += 3) {
      var i0 = f[q] * 3, i1 = f[q + 1] * 3, i2 = f[q + 2] * 3;
      vol += v[i0] * (v[i1 + 1] * v[i2 + 2] - v[i1 + 2] * v[i2 + 1]) - v[i0 + 1] * (v[i1] * v[i2 + 2] - v[i1 + 2] * v[i2]) + v[i0 + 2] * (v[i1] * v[i2 + 1] - v[i1 + 1] * v[i2]);
    }
    return vol / 6;
  }
  /* componente do avesso (volume com sinal negativo) → inverte a ordem dos vértices das faces dele */
  function orientar(m, f0) {
    if (volumeFaces(m, f0) >= 0) return;
    for (var k = f0; k + 2 < m.f.length; k += 3) { var t = m.f[k + 1]; m.f[k + 1] = m.f[k + 2]; m.f[k + 2] = t; }
  }
  function pts0(a) { return a.p || a; }
  /* LOFT: liga os anéis na ordem; `quebra` num anel = aresta viva ali (o anel é repetido e a luz não
     amacia a dobra); o.fechado = o último liga no primeiro (anel/toro, sem tampas); senão tampa as pontas */
  function loft(m, aneis, o) {
    o = o || {};
    var f0 = m.f.length, n = pts0(aneis[0]).length, ini = null, prev = null, k;
    for (k = 0; k < aneis.length; k++) {
      var A = aneis[k], P = pts0(A), i = anelAdd(m, P);
      if (prev != null) liga(m, prev, i, n); else ini = i;
      if (A.quebra && k > 0 && k < aneis.length - 1) i = anelAdd(m, P);
      prev = i;
    }
    if (o.fechado) liga(m, prev, ini, n);
    else {
      if (o.ini !== false) tampa(m, pts0(aneis[0]), true);
      if (o.fim !== false) tampa(m, pts0(aneis[aneis.length - 1]), false);
    }
    orientar(m, f0);
    return m;
  }
  function Q(p, q) { var o = { p: p }; if (q) o.quebra = true; return o; }

  /* ------------------------------------------------------------ ANÉIS (SEÇÕES) */
  /* superelipse no plano XZ, na altura y. o = { cx, cz, ax, azF (frente, +z), azB (fundo), p, pB, af }
     p = 2 é elipse; p maior, mais quadrada. af afina a frente (bacia em forma de ovo), afB afina o fundo. */
  function anelSup(y, o, n) {
    var pts = [], j, azB = o.azB != null ? o.azB : o.azF;
    for (j = 0; j < n; j++) {
      var t = TAU * j / n, c = Math.cos(t), s = Math.sin(t), fr = s >= 0;
      var p = fr ? o.p : (o.pB || o.p), e = 2 / p, zn = sgn(s) * Math.pow(Math.abs(s), e);
      var x = o.ax * sgn(c) * Math.pow(Math.abs(c), e) * (1 - (o.af || 0) * (zn + 1) / 2) * (1 - (o.afB || 0) * (1 - zn) / 2);
      pts.push([(o.cx || 0) + x, y, (o.cz || 0) + (fr ? o.azF : azB) * zn]);
    }
    return pts;
  }
  /* retângulo de cantos redondos (arcos de verdade) no plano XZ: 4·(k+1) pontos, mesmo sentido do anelSup */
  function anelRR(y, cx, cz, hx, hz, r, k) {
    r = cl(r, 0.0004, Math.min(hx, hz));
    var pts = [], cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]], c, i;
    for (c = 0; c < 4; c++) {
      var a0 = c * Math.PI / 2, ccx = cs[c][0] * (hx - r), ccz = cs[c][1] * (hz - r);
      for (i = 0; i <= k; i++) { var a = a0 + (Math.PI / 2) * i / k; pts.push([cx + ccx + r * Math.cos(a), y, cz + ccz + r * Math.sin(a)]); }
    }
    return pts;
  }
  /* troca de eixos de um anel feito no plano XZ: "z" → o anel fica no plano XY (loft ao longo de Z);
     "x" → plano YZ (loft ao longo de X) */
  function trocar(pts, eixo) {
    return pts.map(function (p) { return eixo === "z" ? [p[0], p[2], p[1]] : [p[1], p[2], p[0]]; });
  }

  /* --------------------------------------------------------- CAIXA ARREDONDADA */
  /* o = { x0, x1, y0, y1, z0, z1, r (arredondamento das arestas de cima/baixo), rad (canto em planta) } */
  function caixaR(m, o, q) {
    var cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, hx = (o.x1 - o.x0) / 2, hz = (o.z1 - o.z0) / 2;
    var r = cl(o.r, 0, Math.min(hx, hz, (o.y1 - o.y0) / 2) * 0.9), rad = o.rad != null ? o.rad : r * 2, kv = r > 0 ? q.kv : 0, an = [], i, a, ins;
    for (i = 0; i <= kv; i++) { a = kv ? (Math.PI / 2) * i / kv : Math.PI / 2; ins = r * (1 - Math.sin(a)); an.push(anelRR(o.y0 + r * (1 - Math.cos(a)), cx, cz, hx - ins, hz - ins, rad - ins, q.k)); }
    for (i = kv; i >= 0; i--) { a = kv ? (Math.PI / 2) * i / kv : Math.PI / 2; ins = r * (1 - Math.sin(a)); an.push(anelRR(o.y1 - r * (1 - Math.cos(a)), cx, cz, hx - ins, hz - ins, rad - ins, q.k)); }
    return loft(m, an);
  }
  /* caixa arredondada deitada: o mesmo, com o "alto" ao longo de Z (painel na parede) */
  function caixaRz(m, o, q) {
    var t = Malha(); caixaR(t, { x0: o.x0, x1: o.x1, y0: o.z0, y1: o.z1, z0: o.y0, z1: o.y1, r: o.r, rad: o.rad }, q);
    var i0 = m.v.length / 3, k;
    for (k = 0; k < t.v.length; k += 3) m.v.push(t.v[k], t.v[k + 2], t.v[k + 1]);
    var f0 = m.f.length;
    for (k = 0; k < t.f.length; k++) m.f.push(t.f[k] + i0);
    orientar(m, f0);
    return m;
  }

  /* ------------------------------------------------------------------ TORNO */
  function baseDe(ax) {
    var a = nrm(ax);
    if (Math.abs(a[1]) > 0.999) return [[1, 0, 0], [0, 0, 1]];
    if (Math.abs(a[0]) > 0.999) return [[0, 1, 0], [0, 0, 1]];
    if (Math.abs(a[2]) > 0.999) return [[1, 0, 0], [0, 1, 0]];
    var u = nrm(vx([0, 1, 0], a)); return [u, vx(a, u)];
  }
  /* perfil [[raio, posição ao longo do eixo]…] girado em volta do eixo `o.eixo` (vetor) passando por o.c;
     o.ex/o.ez estiram a seção (oval); raio 0 na ponta fecha no eixo */
  function torno(m, perfil, n, o) {
    o = o || {};
    var c = o.c || [0, 0, 0], ax = nrm(o.eixo || [0, 1, 0]), b = baseDe(ax), u = b[0], w = b[1], ex = o.ex || 1, ez = o.ez || 1, an = [];
    perfil.forEach(function (q) {
      var pts = [], j;
      for (j = 0; j < n; j++) {
        var t = TAU * j / n, ru = q[0] * Math.cos(t) * ex, rw = q[0] * Math.sin(t) * ez;
        pts.push([c[0] + ax[0] * q[1] + u[0] * ru + w[0] * rw, c[1] + ax[1] * q[1] + u[1] * ru + w[1] * rw, c[2] + ax[2] * q[1] + u[2] * ru + w[2] * rw]);
      }
      an.push(q[2] ? Q(pts, true) : pts);
    });
    return loft(m, an, { ini: perfil[0][0] > 1e-9, fim: perfil[perfil.length - 1][0] > 1e-9, fechado: o.fechado });
  }

  /* ------------------------------------------------------------------- TUBO */
  /* arredonda os cantos do caminho (Bézier quadrática com o canto como controle) */
  function suavizar(cam, rc, arco) {
    if (cam.length < 3 || !(rc > 0)) return cam.slice();
    var out = [cam[0]], i, t;
    for (i = 1; i < cam.length - 1; i++) {
      var A = cam[i - 1], P = cam[i], B = cam[i + 1], dA = sub(A, P), dB = sub(B, P), lA = cmp(dA), lB = cmp(dB);
      var d = Math.min(rc, lA / 2, lB / 2);
      if (!(d > 1e-6)) { out.push(P); continue; }
      var a = soma(P, esc(dA, d / lA)), b = soma(P, esc(dB, d / lB));
      for (t = 0; t <= arco; t++) {
        var s = t / arco, s1 = 1 - s;
        out.push([s1 * s1 * a[0] + 2 * s1 * s * P[0] + s * s * b[0], s1 * s1 * a[1] + 2 * s1 * s * P[1] + s * s * b[1], s1 * s1 * a[2] + 2 * s1 * s * P[2] + s * s * b[2]]);
      }
    }
    out.push(cam[cam.length - 1]);
    return out.filter(function (p, k) { return !k || cmp(sub(p, out[k - 1])) > 1e-7; });
  }
  function densificar(pts, passo) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var d = sub(pts[i], pts[i - 1]), L = cmp(d), n = Math.max(1, Math.ceil(L / passo));
      for (var k = 1; k <= n; k++) out.push(soma(pts[i - 1], esc(d, k / n)));
    }
    return out;
  }
  /* o = { rc (raio das curvas), arco, raio: fn(i, total) opcional, ini, fim } */
  function tubo(m, cam, r, n, o) {
    o = o || {};
    var pts = suavizar(cam, o.rc != null ? o.rc : r * 2.5, o.arco || 4);
    if (o.passo) pts = densificar(pts, o.passo);
    if (pts.length < 2) return m;
    var T = [], i;
    for (i = 0; i < pts.length; i++) T.push(nrm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])));
    var up = Math.abs(T[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], N = nrm(sub(up, esc(T[0], pe(up, T[0])))), an = [];
    for (i = 0; i < pts.length; i++) {
      if (i) { N = nrm(sub(N, esc(T[i], pe(N, T[i])))); if (cmp(N) < 0.5) N = nrm(vx(T[i], [0, 0, 1])); }
      var B = vx(T[i], N), ri = o.raio ? o.raio(i, pts.length) : r, ring = [], j;
      for (j = 0; j < n; j++) { var t = TAU * j / n, cs = Math.cos(t) * ri, sn = Math.sin(t) * ri; ring.push([pts[i][0] + N[0] * cs + B[0] * sn, pts[i][1] + N[1] * cs + B[1] * sn, pts[i][2] + N[2] * cs + B[2] * sn]); }
      an.push(ring);
    }
    return loft(m, an, { ini: o.ini !== false, fim: o.fim !== false });
  }

  /* ---------------------------------------------------------------- CHAIKIN */
  function chaikin(pts, it) {
    var p = pts;
    for (var k = 0; k < it; k++) {
      var o = [];
      for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      p = o;
    }
    return p;
  }
  /* reamostra um contorno fechado em n pontos igualmente espaçados (anéis do loft com a mesma contagem) */
  function reamostrar(pts, n) {
    var L = [0], i, tot;
    for (i = 1; i <= pts.length; i++) { var a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))); }
    tot = L[pts.length]; var out = [], s = 0;
    for (i = 0; i < n; i++) {
      var d = tot * i / n; while (s < pts.length - 1 && L[s + 1] < d) s++;
      var A = pts[s], B = pts[(s + 1) % pts.length], f = (d - L[s]) / Math.max(1e-12, L[s + 1] - L[s]);
      out.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]);
    }
    return out;
  }

  /* gira os vértices [v0, fim) em volta do eixo X que passa por (y, z) */
  function girarX(m, v0, py, pz, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    for (var k = v0 * 3; k < m.v.length; k += 3) { var y = m.v[k + 1] - py, z = m.v[k + 2] - pz; m.v[k + 1] = py + y * c - z * s; m.v[k + 2] = pz + y * s + z * c; }
  }

  /* ======================================================== PEÇAS REPETIDAS */
  /* canopla (espelho redondo na parede): eixo para fora da parede */
  function canopla(m, c, eixo, r, esp, n) {
    return torno(m, [[r * 0.6, 0], [r, esp * 0.15], [r * 0.98, esp * 0.55], [r * 0.82, esp * 0.92], [r * 0.45, esp], [r * 0.3, esp]], n, { c: c, eixo: eixo });
  }
  /* volante de registro (manopla redonda com saia) */
  function volante(m, c, eixo, r, h, n) {
    return torno(m, [[r * 0.55, 0], [r * 0.9, h * 0.15], [r, h * 0.45], [r * 0.96, h * 0.8], [r * 0.7, h], [r * 0.2, h * 1.04], [0, h * 1.05]], n, { c: c, eixo: eixo });
  }
  /* engate flexível trançado (cromado) entre dois pontos, com porcas nas pontas */
  function engate(m, cam, q, r) {
    r = r || 0.0055;
    tubo(m, cam, r, Math.max(6, q.n - 4), { rc: 0.03, arco: q.arco });
    var a = cam[0], b = cam[cam.length - 1], da = nrm(sub(cam[1], a)), db = nrm(sub(cam[cam.length - 2], b));
    torno(m, [[r * 1.9, 0], [r * 1.9, 0.016]], 6, { c: a, eixo: da });
    torno(m, [[r * 1.9, 0], [r * 1.9, 0.016]], 6, { c: b, eixo: db });
    return m;
  }
  /* registro de ângulo na parede (canopla + corpo + manopla), saída para cima */
  function registroAngulo(m, c, q) {
    canopla(m, c, [0, 0, 1], 0.024, 0.008, q.n);
    torno(m, [[0.009, 0], [0.009, 0.03], [0.007, 0.034]], q.n, { c: c, eixo: [0, 0, 1] });
    torno(m, [[0.012, 0], [0.012, 0.018], [0.009, 0.022], [0, 0.023]], q.n, { c: [c[0], c[1], c[2] + 0.022], eixo: [-1, 0, 0] });
    return m;
  }
  /* torneira / misturador de mesa (bica curva); c = base no tampo; alcance = distância da bica */
  function torneiraMesa(m, c, alt, alcance, q, alavanca) {
    var x = c[0], y = c[1], z = c[2], rb = 0.024, rc = 0.017;
    torno(m, [[rb, 0], [rb, 0.006], [rb * 0.92, 0.012], [rc * 1.05, 0.02], [rc, alt * 0.45], [rc * 0.95, alt * 0.8], [rc * 0.7, alt * 0.9], [0, alt * 0.92]], q.n, { c: [x, y, z] });
    tubo(m, [[x, y + alt * 0.7, z], [x, y + alt * 1.02, z + alcance * 0.08], [x, y + alt * 1.02, z + alcance * 0.92], [x, y + alt * 0.8, z + alcance]], 0.0105, Math.max(8, q.n - 2), { rc: Math.min(alcance * 0.42, alt * 0.3), arco: q.arco + 3, fim: true });
    torno(m, [[0.0125, 0], [0.0125, 0.02], [0.009, 0.022]], q.n, { c: [x, y + alt * 0.8 + 0.001, z + alcance], eixo: [0, -1, 0] });
    if (alavanca) {
      torno(m, [[0.014, 0], [0.014, 0.012], [0.01, 0.02], [0, 0.021]], q.n, { c: [x, y + alt * 0.62, z - rc * 0.6], eixo: [0, 1, 0] });
      tubo(m, [[x, y + alt * 0.62 + 0.016, z - rc * 0.6], [x, y + alt * 0.62 + 0.03, z - rc * 0.6 - 0.05]], 0.0055, 8, { rc: 0 });
    }
    return m;
  }
  /* torneira de parede: canopla, corpo saindo da parede, bica e volante; c = ponto de água na parede */
  function torneiraParede(m, c, saida, queda, q) {
    var x = c[0], y = c[1], z = c[2];
    canopla(m, [x, y, z], [0, 0, 1], 0.026, 0.009, q.n);
    torno(m, [[0.016, 0], [0.016, saida * 0.7], [0.014, saida * 0.75], [0.014, saida]], q.n, { c: [x, y, z], eixo: [0, 0, 1] });
    volante(m, [x, y + 0.012, z + saida * 0.55], [0, 1, 0], 0.02, 0.03, q.n);
    tubo(m, [[x, y, z + saida * 0.6], [x, y, z + saida], [x, y - queda, z + saida + 0.03]], 0.009, Math.max(8, q.n - 2), { rc: 0.02, arco: q.arco });
    return m;
  }
  /* válvula de escoamento (ralo da cuba): disco cromado, com o rabicho para baixo até yFim */
  function valvulaEscoamento(m, c, r, yFim, q) {
    torno(m, [[r * 0.3, 0.004], [r, 0.002], [r * 1.05, 0], [r * 0.98, -0.004], [r * 0.6, -0.006]], q.n, { c: c });
    if (yFim < c[1] - 0.01) torno(m, [[0.016, 0], [0.016, c[1] - yFim]], q.n, { c: c, eixo: [0, -1, 0] });
    return m;
  }
  /* sifão de copo cromado: entrada de cima em (x, yEntrada, z), saída horizontal até o ponto `saida` */
  function sifaoCopo(m, ent, saida, q, semCanopla) {
    var x = ent[0], z = ent[2], ys = saida[1], h = 0.13, y0 = ys - 0.075;
    torno(m, [[0.02, 0], [0.033, 0.006], [0.034, 0.03], [0.034, h * 0.85], [0.03, h * 0.92], [0.018, h], [0.016, h]], q.n, { c: [x, y0, z] });
    if (ent[1] > y0 + h + 0.002) torno(m, [[0.0155, 0], [0.0155, ent[1] - (y0 + h)]], q.n, { c: [x, y0 + h, z] });
    tubo(m, [[x, ys, z], [saida[0], ys, saida[2]]], 0.016, q.n, { rc: 0 });
    if (!semCanopla) canopla(m, [saida[0], ys, saida[2]], nrm(sub([x, ys, z], [saida[0], ys, saida[2]])), 0.03, 0.01, q.n);
    return m;
  }
  /* sifão sanfonado (flexível branco), de `ent` descendo em U e voltando para `saida` */
  function sifaoSanfonado(m, ent, saida, q) {
    var x = ent[0], yb = Math.min(ent[1], saida[1]) - 0.11, meio = [x, yb, ent[2] + (saida[2] - ent[2]) * 0.25];
    var cam = [ent, [x, ent[1] - 0.05, ent[2]], meio, [saida[0], yb + 0.02, (meio[2] + saida[2]) / 2], [saida[0], saida[1], saida[2] + (ent[2] > saida[2] ? 0.06 : -0.06)], saida];
    var nn = Math.max(6, q.n - 4);
    tubo(m, cam, 0.02, nn, { rc: 0.05, arco: q.arco + 1, passo: q.N > 20 ? 0.012 : 0.03, raio: function (i) { return q.N > 20 ? (i % 2 ? 0.0205 : 0.0185) : 0.02; } });
    return m;
  }

  /* ================================================================ GERADORES
   * P = parâmetros numéricos (m); q = nível de detalhe. Cada um devolve [parte…]. */
  function parte(id, nome, mat, acessorio) { return { id: id, nome: nome, material: mat, acessorio: !!acessorio, m: Malha() }; }

  /* ======================================================================================
   * LOUÇAS — silhueta tirada do DESENHO TÉCNICO COTADO do produto de referência (ficha pública do
   * fabricante, só as medidas; nada de geometria de família BIM). As seções abaixo são FRAÇÕES das cotas
   * de letra do tipo (A, B, C…), medidas nas vistas frontal, lateral e superior do desenho de referência:
   *   bacia com caixa acoplada .... Celite Azálea 91353 + caixa 13570 (catálogo geral Celite, pág. 32)
   *   bacia convencional ......... Celite Azálea 91303 (pág. 32)
   *   lavatório com coluna ....... Celite Azálea 91006 + coluna 91201 (pág. 32)
   *   lavatório com coluna suspensa Celite Aloha 56005 + 56202 (pág. 22)
   *   cuba de apoio .............. Celite Aloha 56086 (pág. 22)
   *   tanque ..................... Celite G Builders 51264 + coluna 51203 (pág. 50)
   *   mictório ................... Celite 08280 (pág. 52)
   * Cada tipo do catálogo usa as PRÓPRIAS cotas; o desenho de referência dá só as proporções do perfil.
   * ====================================================================================== */
  /* seção em planta: h = altura (m), hw = meia largura, dF/dB = distância da parede à frente/ao fundo (m);
     o = { pF, pB, af (afina a frente), afB (afina o fundo), zW (plano da parede) } */
  function sec(h, hw, dF, dB, o, N) {
    var a = anelSup(h, { cx: 0, cz: o.zW + (dF + dB) / 2, ax: hw, azF: (dF - dB) / 2, azB: (dF - dB) / 2, p: o.pF, pB: o.pB, af: o.af || 0, afB: o.afB || 0 }, N);
    if (o.af || o.afB) { var mx = 0; a.forEach(function (p) { mx = Math.max(mx, Math.abs(p[0])); }); if (mx > 1e-9) a.forEach(function (p) { p[0] *= hw / mx; }); }
    return a;
  }
  /* interpola dois anéis de mesma contagem (t = 0 → A, 1 → B) e soma dy na altura */
  function mistura(A, B, t, dy) { return A.map(function (p, i) { var q = B[i]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t + (dy || 0), p[2] + (q[2] - p[2]) * t]; }); }
  function reduz(A, k) { var c = centro(A); return A.map(function (p) { return [c[0] + (p[0] - c[0]) * k, p[1], c[2] + (p[2] - c[2]) * k]; }); }

  /* ---------- assento + tampa (seguem o contorno da borda O e a abertura I do desenho) ---------- */
  function assentoTampa(partes, O, I, aberta, q, eixoDobr) {
    var as = parte("assento", "Assento", BRANCO, true), tp = parte("tampa", "Tampa", BRANCO, true), hS = 0.014, hT = 0.016;   /* vendidos à parte: fora da envolvente da louça */
    var perf = [[0.03, 0], [0, hS * 0.6], [0.05, hS], [0.95, hS], [1, hS * 0.6], [0.97, 0]];
    loft(as.m, perf.map(function (p) { return mistura(O, I, p[0], 0.002 + p[1]); }), { fechado: true });
    var y1 = 0.002 + hS + 0.001, Ip = reduz(O, 0.12), v0 = tp.m.v.length / 3;
    loft(tp.m, [[0.012, 0], [0, 0.008], [0.05, hT * 0.85], [0.4, hT * 0.98], [1, hT]].map(function (p) { return mistura(O, Ip, p[0], y1 + p[1]); }));
    if (aberta) girarX(tp.m, v0, eixoDobr[0] + y1 + 0.01, eixoDobr[1], -1.62);
    var dob = parte("dobradicas", "Dobradiças", BRANCO, true);
    [-1, 1].forEach(function (s) { torno(dob.m, [[0.009, 0], [0.009, 0.026]], q.n, { c: [s * 0.075 - 0.013, eixoDobr[0] + y1 + 0.006, eixoDobr[1]], eixo: [1, 0, 0] }); });
    partes.push(as, tp, dob);
  }

  /* ---------- bacia com caixa acoplada (Azálea 91353) e convencional (Azálea 91303) ----------
     origem = eixo do esgoto no piso; parede em z = −Esgoto_parede. */
  function geoBacia(P, q, comCaixa) {
    var L = P.L, A = P.C, Hb = P.Hb, zW = -P.Ep, N = q.N, partes = [], lo = parte("louca", "Bacia", LOUCA), an = [], o;
    function S(h, hw, dF, dB, oo) { return sec(Hb * h, L * hw, dF, dB, oo, N); }
    var O, I, rimTopo;
    if (comCaixa) {
      /* Azálea 91353: E = A + 15 mm (a caixa fica a 15 mm da parede); perfil lateral e frontal medidos no desenho */
      var E = A + 0.015, oP = { zW: zW, pF: 3, pB: 3 }, oB = { zW: zW, pF: 2.6, pB: 3.2 }, oR = { zW: zW, pF: 2.9, pB: 4, af: 0.16 };
      an.push(Q(S(0, 0.325, E * 0.817, E * 0.19, oP), true));
      an.push(Q(S(0.07, 0.325, E * 0.817, E * 0.19, oP), true));
      /* pé estreito (coluna da frente, 0,23·E de fundo) e a barriga subindo para trás: o vão entre a coluna e a
         saia traseira deixa o SIFÃO aparente na vista lateral, como no desenho */
      an.push(S(0.072, 0.29, E * 0.7875, E * 0.56, oP));
      an.push(S(0.42, 0.25, E * 0.7875, E * 0.57, oP));
      an.push(S(0.52, 0.262, E * 0.84, E * 0.5, oB));
      an.push(S(0.59, 0.275, E * 0.903, E * 0.4, oB));
      an.push(S(0.7, 0.385, E * 0.945, E * 0.24, oB));
      an.push(S(0.765, 0.44, E * 0.966, E * 0.11, oR));
      O = S(0.87, 0.5, E, 0.02, oR); an.push(O);
      an.push(S(0.985, 0.5, E, 0.02, oR));
      an.push(S(0.997, 0.497, E - 0.003, 0.023, oR));
      rimTopo = S(1, 0.49, E - 0.009, 0.03, oR); an.push(rimTopo);
      I = S(1, 0.34, E * 0.905, E * 0.47, { zW: zW, pF: 2.3, pB: 2.6, af: 0.28 });
    } else {
      /* Azálea 91303: fundo da louça a 95 mm da parede (D − A = 580 − 485, proporção 0,2·A), fundo reto */
      var g = A * 0.196, oV = { zW: zW + g, pF: 2.8, pB: 8, afB: 0.25 }, oT = { zW: zW + g, pF: 2.3, pB: 3, afB: 0.44 };
      an.push(Q(S(0, 0.273, A * 0.763, 0, oV), true));
      an.push(Q(S(0.06, 0.27, A * 0.763, 0, oV), true));
      an.push(S(0.062, 0.25, A * 0.763, A * 0.42, { zW: zW + g, pF: 2.8, pB: 3 }));
      an.push(S(0.5, 0.222, A * 0.763, A * 0.45, { zW: zW + g, pF: 2.8, pB: 3 }));
      an.push(S(0.56, 0.26, A * 0.78, A * 0.2, oT));
      an.push(S(0.6, 0.3, A * 0.8, 0, oT));
      an.push(S(0.75, 0.43, A * 0.92, 0, oT));
      O = S(0.86, 0.5, A * 0.99, 0, oT); an.push(O);
      an.push(S(0.985, 0.5, A, 0, oT));
      an.push(S(0.997, 0.497, A - 0.003, 0.003, oT));
      rimTopo = S(1, 0.49, A - 0.009, 0.009, oT); an.push(rimTopo);
      I = S(1, 0.387, A * 0.89, A * 0.22, { zW: zW + g, pF: 2.1, pB: 2.1 });
    }
    /* borda por dentro e a cuba até o espelho d'água */
    an.push(mistura(I, rimTopo, -0.06, 0));
    an.push(mistura(reduz(I, 0.98), I, 0, -0.012));
    var Ic = centro(I), fundo = reduz(I, 0.32).map(function (p) { return [p[0], p[1], p[2] - (Ic[2] - zW) * 0.08]; });
    an.push(mistura(reduz(I, 0.86), I, 0, -Hb * 0.16));
    an.push(mistura(reduz(I, 0.6), I, 0, -Hb * 0.33).map(function (p) { return [p[0], p[1], p[2] - 0.02]; }));
    an.push(mistura(fundo, fundo, 0, -Hb * 0.42));
    loft(lo.m, an);
    /* SIFÃO aparente (o S da louça entre o pé e a saia de trás) até a saída de esgoto no piso, e a saia traseira */
    var zb0 = comCaixa ? zW : zW + A * 0.196, Lb = comCaixa ? A + 0.015 : A, rS = L * 0.11, hS = Hb;
    var ofS = { zW: zb0, pF: 3, pB: 3 };
    loft(lo.m, [Q(S(0, 0.24, comCaixa ? Lb * 0.3 : Lb * 0.14, comCaixa ? Lb * 0.19 : 0, ofS), true), S(0.62, 0.23, comCaixa ? Lb * 0.27 : Lb * 0.14, comCaixa ? Lb * 0.17 : 0, ofS)]);
    var cS = comCaixa ? [[0.6, 0.45], [0.47, 0.67], [0.35, 0.6], [0.33, 0.32]] : [[0.55, 0.35], [0.42, 0.62], [0.22, 0.56], [0.18, 0.3]];   /* (d/comprimento, h/Hb) do S medido em cada desenho */
    tubo(lo.m, cS.map(function (c) { return [0, hS * c[1], zb0 + Lb * c[0]]; }).concat([[0, hS * 0.1, zW + P.Ep], [0, 0.004, zW + P.Ep]]), rS, Math.max(8, q.n - 2), { rc: rS * 1.6, arco: Math.max(2, q.arco - 1) });
    /* espelho d'água (sifão cheio) */
    var ag = parte("agua", "Espelho d'água", "Água", true), yA = Hb * 0.62, Ia = mistura(reduz(I, 0.52), I, 0, -Hb * 0.38).map(function (p) { return [p[0], p[1], p[2] - 0.022]; });
    loft(ag.m, [mistura(Ia, Ia, 0, yA - Ia[0][1] - 0.004), mistura(Ia, Ia, 0, yA - Ia[0][1])]);
    partes.push(ag);
    /* capas dos parafusos de fixação no pé */
    [-1, 1].forEach(function (s) { torno(lo.m, [[0.011, 0], [0.011, 0.004], [0.008, 0.011], [0, 0.013]], Math.max(6, q.n - 6), { c: [s * L * 0.26, Hb * 0.04, comCaixa ? zW + (A + 0.015) * 0.3 : zW + A * 0.4], eixo: [s, 0.4, 0] }); });
    partes.push(lo);
    /* assento: contorno = borda O recuada 3 mm; na caixa acoplada ele começa na frente da caixa */
    var Os = comCaixa ? sec(Hb, L * 0.49, A + 0.012, P.Pc + 0.04, { zW: zW, pF: 2.9, pB: 3.2, af: 0.16 }, N) : reduz(rimTopo, 0.995);
    Os = Os.map(function (p) { return [p[0], Hb, p[2]]; });
    var Is = I.map(function (p) { return [p[0], Hb, p[2]]; }), zD = comCaixa ? zW + P.Pc + 0.05 : zW + A * 0.2 + 0.03;
    assentoTampa(partes, Os, Is, P.aberta > 0.5, q, [Hb, zD]);
    if (comCaixa) {
      /* caixa 13570: corpo afunila para baixo (frontal: base = 0,9 do topo), tampa com 54 mm e beiral de 27 mm na frente */
      var cx = parte("caixa", "Caixa acoplada", LOUCA), Ht = P.Ht, Pc = P.Pc, hT = Math.min(0.054, (Ht - Hb) * 0.15), z0 = zW + 0.015;
      var kk = q.k + 1;
      loft(cx.m, [Q(anelRR(Hb + 0.004, 0, z0 + Pc / 2, L * 0.44, Pc / 2 - 0.004, 0.028, kk), true), anelRR(Hb + 0.012, 0, z0 + Pc / 2, L * 0.445, Pc / 2, 0.03, kk),
        anelRR(Ht - hT - 0.01, 0, z0 + Pc / 2, L * 0.49, Pc / 2, 0.035, kk), Q(anelRR(Ht - hT, 0, z0 + Pc / 2, L * 0.488, Pc / 2 - 0.002, 0.034, kk), true)]);
      caixaR(cx.m, { x0: -L * 0.52, x1: L * 0.52, y0: Ht - hT, y1: Ht, z0: z0 - 0.003, z1: z0 + Pc + 0.027, r: Math.min(0.016, hT * 0.4), rad: 0.04 }, { k: Math.max(1, q.k - 1), kv: Math.max(1, q.kv - 1) });
      partes.push(cx);
      var bt = parte("botao", "Acionamento duplo", CROMO), zb = z0 + (Pc + 0.027) / 2;
      torno(bt.m, [[0.021, 0], [0.021, 0.003], [0.019, 0.005], [0, 0.005]], q.n + 4, { c: [0, Ht - 0.001, zb] });
      caixaR(bt.m, { x0: -0.017, x1: -0.0015, y0: Ht + 0.003, y1: Ht + 0.0065, z0: zb - 0.014, z1: zb + 0.014, r: 0.0012, rad: 0.009 }, { k: 2, kv: 1 });
      caixaR(bt.m, { x0: 0.0015, x1: 0.017, y0: Ht + 0.003, y1: Ht + 0.0065, z0: zb - 0.014, z1: zb + 0.014, r: 0.0012, rad: 0.009 }, { k: 2, kv: 1 });
      partes.push(bt);
    }
    if (P.metais > 0.5) {
      var mt = parte("ligacao", comCaixa ? "Registro e engate flexível" : "Tubo de ligação", CROMO, true), ax = P.Al, ay = P.Aa;
      if (comCaixa) {
        registroAngulo(mt.m, [ax, ay, zW], q);
        var xe = cl(ax, -L * 0.4, L * 0.4);
        engate(mt.m, [[ax, ay + 0.012, zW + 0.022], [ax, ay + 0.05, zW + 0.012], [xe, Hb - 0.05, zW + 0.01], [xe, Hb + 0.012, zW + 0.03]], q);
      } else {
        /* tubo de ligação da válvula: sai da parede no ponto de água e entra no fundo da bacia (bolsa de borracha) */
        canopla(mt.m, [ax, ay, zW], [0, 0, 1], 0.03, 0.008, q.n);
        var zEnt = zW + A * 0.196 + 0.01;
        tubo(mt.m, [[ax, ay, zW], [ax, ay, zW + 0.03], [0, ay, zEnt - 0.012]], 0.0185, q.n, { rc: 0.02, arco: q.arco });
        var bo = parte("bolsa", "Bolsa de ligação", BORRACHA, true);
        torno(bo.m, [[0.026, 0], [0.026, 0.016], [0.02, 0.02]], q.n, { c: [0, ay, zEnt - 0.026], eixo: [0, 0, 1] });
        partes.push(bo);
      }
      partes.push(mt);
    }
    return partes;
  }

  /* ---------- lavatório: bacia (Azálea 91006 / Aloha 56005) ----------
     Desenho Azálea: A = 430 profundidade, B = 530 largura, C = 210 altura da bacia, D = 820 topo.
     Planta em "D": fundo reto na parede, frente redonda; aba de 45 mm nas laterais, 30 mm na frente;
     deck da torneira no fundo (a abertura começa a 0,23·A da parede); válvula a 0,37·A da parede. */
  function baciaLav(m, W, A, Hb, Hc, zW, q) {
    var N = q.N, oD = { zW: zW, pF: 2.3, pB: 8 }, an = [];
    function S(y, hw, dF, dB, oo) { return sec(y, hw, dF, dB, oo || oD, N); }
    /* barriga: de y = Hb − 0,3·C (fim da aba, contorno cheio) até Hb − C (topo da coluna), quarto de elipse */
    [1, 0.92, 0.8, 0.62, 0.4, 0.2, 0].forEach(function (u) {
      var k = Math.sqrt(1 - u * u), y = Hb - Hc * 0.3 - Hc * 0.7 * u;
      an.push(S(y, W * (0.19 + 0.31 * k), A * (0.66 + 0.34 * k), A * 0.22 * (1 - k), { zW: zW, pF: 2.3 + 0.1 * u, pB: 4 + 4 * k }));
    });
    an.push(S(Hb - 0.006, W * 0.5, A, 0));
    var topo = S(Hb, W * 0.5 - 0.007, A - 0.007, 0.003); an.push(topo);
    var I = S(Hb, W * 0.415, A * 0.93, A * 0.23, { zW: zW, pF: 2.2, pB: 2.6 });
    an.push(mistura(I, topo, -0.05, 0));
    an.push(mistura(reduz(I, 0.985), I, 0, -0.01));
    var Ic = centro(I), dv = (zW + A * 0.37) - Ic[2];
    function D(k, dy, t) { return mistura(reduz(I, k), I, 0, dy).map(function (p) { return [p[0], p[1], p[2] + dv * t]; }); }
    an.push(D(0.9, -Hc * 0.35, 0.3));
    an.push(D(0.62, -Hc * 0.68, 0.7));
    an.push(D(0.2, -Hc + 0.022, 1));
    loft(m, an);
    return { yFundo: Hb - Hc + 0.022, zValv: zW + A * 0.37, y0: Hb - Hc };
  }
  /* coluna Azálea 91201: estreita no meio, alarga no pé e no topo; fundo a 0,245·A da parede */
  function colunaLav(m, A, zW, yTopo, Rc, suspensa, q) {
    var N = q.N, o = { zW: zW, pF: 2.4, pB: 6 };
    function C(h, kw, dF) { return sec(h, Rc * kw, dF, A * 0.245, o, N); }
    if (suspensa) {
      var y0 = yTopo - 0.3;
      loft(m, [C(y0, 0.75, A * 0.5), C(y0 + 0.01, 0.95, A * 0.55), C(y0 + 0.04, 1.05, A * 0.58), C(yTopo - 0.12, 1.2, A * 0.6), C(yTopo, 1.45, A * 0.65)]);
      return;
    }
    loft(m, [Q(C(0, 1.52, A * 0.59), true), C(0.02, 1.52, A * 0.59), C(0.06, 1.25, A * 0.57), C(yTopo * 0.35, 0.975, A * 0.56), C(yTopo * 0.8, 1.15, A * 0.6), C(yTopo, 1.45, A * 0.65)]);
  }
  function geoLavatorio(P, q) {
    var W = P.W, A = P.P, Hb = P.Hb, Hc = P.Hc, zW = -A / 2, partes = [], lo = parte("louca", "Lavatório", LOUCA);
    var b = baciaLav(lo.m, W, A, Hb, Hc, zW, q);
    partes.push(lo);
    var col = parte("coluna", P.suspenso > 0.5 ? "Coluna suspensa" : "Coluna", LOUCA);
    colunaLav(col.m, A, zW, b.y0 + 0.012, P.Rc, P.suspenso > 0.5, q);
    partes.push(col);
    if (P.metais > 0.5) {
      var mt = parte("metais", "Misturador, válvula, sifão e engates", CROMO, true), zT = zW + A * 0.13;
      torneiraMesa(mt.m, [0, Hb, zT], 0.15, Math.max(0.09, b.zValv - zT + 0.03), q, true);
      valvulaEscoamento(mt.m, [0, b.yFundo + 0.004, b.zValv], 0.021, b.y0 - 0.02, q);
      sifaoCopo(mt.m, [0, b.y0 - 0.02, b.zValv], [0, P.Ea, zW], q);
      [-1, 1].forEach(function (s) {
        var px = s * P.Af / 2;
        registroAngulo(mt.m, [px, P.Aa, zW], q);
        engate(mt.m, [[px, P.Aa + 0.012, zW + 0.022], [px, P.Aa + 0.06, zW + 0.03], [s * 0.012, Hb - Hc * 0.6, zT], [s * 0.012, Hb - 0.02, zT]], q);
      });
      partes.push(mt);
    }
    return partes;
  }

  /* ---------- cuba (origem = superfície do tampo) ----------
     de apoio — Aloha 56086: oval A = 510 × B = 390, C = 125; parede quase reta (o pé recua 4,5 %), borda
     arredondada, deck da torneira no fundo (furo a E = 80 mm da borda), abertura deslocada para a frente. */
  function geoCuba(P, q) {
    var W = P.W, Pp = P.P, Hc = P.Hc, Ea = Math.max(P.Ea, 0.1), partes = [], lo = parte("louca", "Cuba", LOUCA), mod = Math.round(P.modelo || 0), N = q.N;
    var pp = P.ret > 0.5 ? 4.5 : 2.15, zB = -Pp / 2, yb, yTopo, zv = 0, yF;
    function R(y, hw, dF, dB, p2) { return sec(y, hw, dF, dB, { zW: zB, pF: p2 || pp, pB: p2 || pp }, N); }
    if (mod === 1) {
      /* de embutir/sobrepor: aba fina sobre o tampo e a bacia abaixo dele (desenho sem cota de perfil: proporção) */
      yTopo = 0.008;
      var Ia = R(yTopo, W / 2 - 0.03, Pp - 0.03, 0.03);
      loft(lo.m, [Q(R(0, W / 2, Pp, 0), true), R(0.005, W / 2 - 0.002, Pp - 0.002, 0.002), R(yTopo, W / 2 - 0.008, Pp - 0.008, 0.008), Ia,
        mistura(reduz(Ia, 0.98), Ia, 0, -0.012), mistura(reduz(Ia, 0.93), Ia, 0, -Hc * 0.45), mistura(reduz(Ia, 0.7), Ia, 0, -Hc * 0.85), mistura(reduz(Ia, 0.3), Ia, 0, -Hc + 0.008)]);
      yF = -Hc + 0.012; yb = -Hc;
    } else {
      var dy = mod === 2 ? -Hc * 0.55 : 0;
      yTopo = Hc + dy; yb = dy;
      var Iv = R(yTopo, W * 0.355, Pp - 0.037, 0.11, 2.1);
      var topo = R(yTopo, W / 2 - 0.008, Pp - 0.008, 0.008);
      loft(lo.m, [Q(R(yb, W * 0.455, Pp * 0.955, Pp * 0.045), true), R(yb + 0.004, W * 0.465, Pp * 0.965, Pp * 0.035), R(yb + 0.018, W * 0.478, Pp * 0.978, Pp * 0.022), R(yb + Hc * 0.5, W * 0.493, Pp * 0.993, Pp * 0.007),
        R(yTopo - 0.012, W / 2, Pp, 0), R(yTopo - 0.003, W / 2 - 0.002, Pp - 0.002, 0.002), topo,
        mistura(Iv, topo, -0.08, 0), mistura(reduz(Iv, 0.98), Iv, 0, -0.01), mistura(reduz(Iv, 0.9), Iv, 0, -(Hc - 0.02) * 0.5), mistura(reduz(Iv, 0.55), Iv, 0, -(Hc - 0.02) * 0.92), mistura(reduz(Iv, 0.22), Iv, 0, -(Hc - 0.018))]);
      zv = centro(Iv)[2]; yF = yb + 0.018;
    }
    partes.push(lo);
    if (P.metais > 0.5) {
      var mt = parte("metais", "Torneira, válvula e sifão", CROMO, true);
      var zT = mod === 1 ? zB - 0.05 : zB + Math.min(0.08, Pp * 0.2), yT = mod === 1 ? 0 : yTopo, alt = mod === 1 ? 0.18 : Math.max(0.16, Hc * 1.2);
      torneiraMesa(mt.m, [0, yT, zT], alt, Math.max(0.1, zv - zT + 0.02), q, true);
      valvulaEscoamento(mt.m, [0, yF + 0.003, zv], 0.021, yb - 0.03, q);
      /* sifão de copo: a saída termina no CONECTOR de esgoto — N23 EMBUTIDO (26/10/2026): com a parede atrás (Distancia_parede além do
         fundo da cuba) a saída do sifão vai até a PAREDE, com a canopla (o tubo de saída do sifão entra no ponto de esgoto da parede);
         sem parede (ilha), no eixo (0, −Esgoto_abaixo_tampo, 0), como antes */
      var yE = -Ea, zc = zv + 0.05, naParede = num(P.Dp, 0) > Pp / 2, zS = naParede ? -num(P.Dp, 0) : 0;
      if (yb - 0.03 > yE + 0.07) {
        tubo(mt.m, [[0, yb - 0.03, zv], [0, yE + 0.075, zv], [0, yE + 0.06, zc]], 0.0155, q.n, { rc: 0.02, arco: q.arco });
        sifaoCopo(mt.m, [0, yE + 0.06, zc], [0, yE, zS], q, !naParede);
      } else tubo(mt.m, [[0, yb - 0.03, zv], [0, yE, zv], [0, yE, zS]], 0.0155, q.n, { rc: 0.02, arco: q.arco });
      partes.push(mt);
    }
    return partes;
  }

  /* ---------- tanque — Celite G Builders 51264 (+ coluna 51203) ----------
     A = 520 profundidade, B = 590 largura, C = 340 altura da cuba, D = 845 topo. Frontal: a cuba afina para
     baixo (fundo = 0,88 do topo), aba de 50 mm no topo; abas internas: laterais 6 %, frente 6 %, fundo 8 %;
     rampa de esfregar na frente (de 0,94·A no topo a 0,57·A no fundo); coluna afunila para o piso (0,46·B → 0,22·B). */
  function geoTanque(P, q) {
    var W = P.W, A = P.P, H = P.H, zW = -A / 2, partes = [], lo = parte("louca", "Tanque", LOUCA), N = q.N, kk = q.k + 1;
    var C = Math.min(0.34, H * 0.4), y0 = H - C;
    function RR(y, hw, dF, dB, r) { return anelRR(y, 0, zW + (dF + dB) / 2, hw, (dF - dB) / 2, r, kk); }
    var ex = [Q(RR(y0, W * 0.44, A * 0.985, 0, 0.03), true), RR(y0 + 0.006, W * 0.445, A * 0.99, 0, 0.03), RR(H - 0.05, W * 0.493, A, 0, 0.035),
      RR(H - 0.048, W * 0.5, A + 0.003, 0, 0.035), RR(H - 0.004, W * 0.5, A + 0.003, 0, 0.035)];
    var topo = RR(H, W * 0.5 - 0.004, A - 0.001, 0.003, 0.033);
    var iw = W * 0.5 - W * 0.061, iF = A * 0.937, iB = A * 0.083;
    var In = [RR(H, iw + 0.004, iF + 0.004, iB - 0.004, 0.035), RR(H - 0.012, iw, iF, iB, 0.032)];
    [[0.25, 0.9], [0.5, 0.78], [0.75, 0.66], [0.97, 0.58]].forEach(function (s) { var yy = H - 0.012 - (C - 0.05) * s[0]; In.push(RR(yy, iw * (1 - 0.1 * s[0]), A * s[1], iB, 0.03)); });
    In.push(RR(y0 + 0.035, iw * 0.88, A * 0.57, iB + 0.005, 0.025));
    loft(lo.m, ex.concat([topo], In));
    partes.push(lo);
    /* rampa de esfregar: frisos horizontais sobre a rampa da frente */
    var es = parte("esfregador", "Esfregador", LOUCA), nf = q.N > 20 ? 11 : 5;
    for (var i = 0; i < nf; i++) {
      var s = 0.12 + 0.8 * i / (nf - 1), yy = H - 0.012 - (C - 0.05) * s, dF = A * (0.937 - (0.937 - 0.57) * Math.pow(s, 0.85)) - 0.004;
      tubo(es.m, [[-iw * 0.86, yy, zW + dF], [iw * 0.86, yy, zW + dF]], 0.0055, Math.max(6, q.n - 6), { rc: 0 });
    }
    partes.push(es);
    /* espelho traseiro (apoio da torneira), 40 mm da parede */
    caixaR(lo.m, { x0: -W * 0.2, x1: W * 0.2, y0: H - 0.14, y1: H, z0: zW + 0.002, z1: zW + 0.06, r: 0.012, rad: 0.02 }, q);
    var col = parte("coluna", "Coluna", LOUCA);
    function CL(h, hw, dF) { return sec(h, hw, dF, 0.012, { zW: zW, pF: 3, pB: 8 }, N); }
    loft(col.m, [Q(CL(0, W * 0.11, A * 0.35), true), CL(0.012, W * 0.112, A * 0.355), CL(y0 * 0.5, W * 0.17, A * 0.41), CL(y0 + 0.005, W * 0.23, A * 0.475)]);
    partes.push(col);
    if (P.metais > 0.5) {
      var mt = parte("metais", "Torneira e válvula", CROMO, true);
      torneiraMesa(mt.m, [0, H, zW + 0.035], 0.1, 0.14, q, false);
      volante(mt.m, [0, H + 0.08, zW + 0.03], [0, 1, 0], 0.02, 0.03, q.n);
      var zr = zW + 0.115;
      valvulaEscoamento(mt.m, [0, y0 + 0.037, zr], 0.022, y0 - 0.03, q);
      tubo(mt.m, [[0, y0 - 0.03, zr], [0, 0.06, zr], [0, 0.025, zW + 0.03], [0, 0.025, zW]], 0.02, q.n, { rc: 0.04, arco: q.arco });
      partes.push(mt);
    }
    return partes;
  }

  /* ---------- mictório — Celite 08280 ----------
     Largura 345, profundidade 315, altura 565 (D = 940 do topo ao piso). Frontal: topo estreito (0,41·L), o mais
     largo a 0,49·H, lábio a 0,41·H, sifão em "V" até 75 mm no pé. Lateral: capuz fino no alto, lábio na frente a
     0,41·H (= A), sifão atrás (0,59·A no pé). A concha abre num plano inclinado do alto (0,2·A) ao lábio (A). */
  function geoMictorio(P, q) {
    var W = P.W, A = P.P, H = P.H, zW = -A / 2, N = q.N, partes = [], lo = parte("louca", "Mictório", LOUCA);
    /* anel no plano XY (x, y) na profundidade d (+z inclinação), "ovo" de topo estreito e pé estreito */
    function E(d, cy, ax, up, dn, afT, afB, incl) {
      var a = anelSup(0, { cx: 0, cz: cy, ax: ax, azF: up, azB: dn, p: 2.2, pB: 2.4, af: afT, afB: afB }, N), mx = 0;
      a.forEach(function (p) { mx = Math.max(mx, Math.abs(p[0])); }); if (mx > 1e-9) a.forEach(function (p) { p[0] *= ax / mx; });
      return a.map(function (p) { return [p[0], p[2], zW + d + (incl || 0) * (p[2] - cy)]; });
    }
    var sl = -(0.8 * A) / (0.48 * H), cyR = 0.66 * H;
    var an = [Q(E(0.0, 0.5 * H, W / 2, 0.5 * H, 0.5 * H, 0.8, 0.78), true), E(0.01, 0.5 * H, W / 2, 0.5 * H, 0.5 * H, 0.8, 0.78),
      E(0.3 * A, 0.53 * H, W / 2 * 0.99, 0.47 * H, 0.4 * H, 0.78, 0.6), E(0.6 * A, cyR, W / 2 * 0.96, 0.31 * H, 0.27 * H, 0.7, 0.25, sl * 0.55),
      E(0.62 * A, cyR, W / 2 * 0.9, 0.26 * H, 0.245 * H, 0.68, 0.15, sl), E(0.6 * A, cyR, W / 2 * 0.74, 0.215 * H, 0.2 * H, 0.66, 0.12, sl),
      E(0.45 * A, cyR + 0.01, W / 2 * 0.66, 0.19 * H, 0.17 * H, 0.6, 0.1, sl * 0.8), E(0.22 * A, cyR + 0.02, W / 2 * 0.5, 0.16 * H, 0.12 * H, 0.4, 0.1, sl * 0.4),
      E(0.08 * A, cyR + 0.02, W / 2 * 0.3, 0.1 * H, 0.08 * H, 0.3, 0.1)];
    loft(lo.m, an);
    /* corpo do sifão (abaixo do lábio, encostado na parede) */
    var o = { zW: zW, pF: 2.1, pB: 8 };
    loft(lo.m, [Q(sec(0, W * 0.11, A * 0.59, 0.005, o, N), true), sec(0.004, W * 0.115, A * 0.595, 0.005, o, N), sec(0.15 * H, W * 0.22, A * 0.6, 0.005, o, N), sec(0.32 * H, W * 0.34, A * 0.66, 0.005, o, N), sec(0.42 * H, W * 0.36, A * 0.6, 0.005, o, N)]);
    partes.push(lo);
    if (P.metais > 0.5) {
      var mt = parte("metais", "Válvula de mictório e saída", CROMO, true);
      /* o ponto de água (Ya) e a saída de esgoto (Ye) vêm da ficha (Agua_altura/Esgoto_altura da família), sobre a base da louça */
      var Ya = P.Ya > 0 ? P.Ya : H, Ye = P.Ye > 0 ? P.Ye : 0.02;
      canopla(mt.m, [0, Ya, zW], [0, 0, 1], 0.025, 0.008, q.n);
      tubo(mt.m, [[0, Ya, zW], [0, Ya, zW + 0.06], [0, Ya - 0.05, zW + 0.06]], 0.009, q.n, { rc: 0.02, arco: q.arco });
      torno(mt.m, [[0.02, 0], [0.02, 0.06], [0.016, 0.07], [0, 0.072]], q.n, { c: [0, Ya + 0.005, zW + 0.06] });
      torno(mt.m, [[0.011, 0], [0.016, 0.004], [0, 0.008]], q.n, { c: [0, Ya + 0.077, zW + 0.06], eixo: [0, 1, 0] });
      tubo(mt.m, [[0, Ye + 0.02, zW + 0.05], [0, Ye, zW + 0.03], [0, Ye, zW]], 0.02, q.n, { rc: 0.015, arco: q.arco });
      partes.push(mt);
    }
    return partes;
  }

  /* ---------- pia de cozinha (bancada inox com cuba prensada) ---------- */
  function geoPia(P, q) {
    var L = P.L, Pp = P.P, Hc = P.Hc, partes = [], ix = parte("bancada", "Bancada e cuba", INOX), k = q.k + 1;
    var wc = Math.min(0.5, L * 0.42) / 2, pc = Math.min(Pp - 0.12, 0.42) / 2, rc = 0.05, ab = 0.035, e = 0.0012;
    function R(y, hx, hz, r) { return anelRR(y, 0, 0, hx, hz, r, k); }
    var hx = L / 2, hz = Pp / 2;
    loft(ix.m, [
      Q(R(0, hx, hz, 0.012), true), R(0, wc + 0.008, pc + 0.008, rc + 0.008), R(-0.008, wc, pc, rc), R(-Hc * 0.5, wc - 0.004, pc - 0.004, rc), R(-Hc + 0.025, wc - 0.008, pc - 0.008, rc),
      R(-Hc + 0.004, wc - 0.03, pc - 0.03, rc - 0.02), R(-Hc, wc - 0.05, pc - 0.05, rc - 0.03),
      R(-Hc - e, wc - 0.05, pc - 0.05, rc - 0.03), R(-Hc + 0.004 - e, wc - 0.03 + e, pc - 0.03 + e, rc - 0.02), R(-Hc + 0.025, wc - 0.008 + e, pc - 0.008 + e, rc), R(-0.008 - e, wc + e, pc + e, rc),
      Q(R(-0.012, wc + 0.012, pc + 0.012, rc + 0.012), true), Q(R(-0.012, hx - 0.006, hz - 0.006, 0.01), true), R(-ab, hx - 0.006, hz - 0.006, 0.01), Q(R(-ab, hx, hz, 0.012), true)
    ], { fechado: true });
    partes.push(ix);
    /* frisos do escorredor (dos dois lados da cuba) */
    var fr = parte("frisos", "Frisos do escorredor", INOX), x0 = wc + 0.04, x1 = hx - 0.05;
    if (x1 - x0 > 0.08) [-1, 1].forEach(function (s) {
      for (var i = 0; i < 7; i++) { var z = -pc * 0.75 + i * pc * 0.25; caixaR(fr.m, { x0: s > 0 ? x0 : -x1, x1: s > 0 ? x1 : -x0, y0: -0.002, y1: 0.0015, z0: z - 0.004, z1: z + 0.004, r: 0.0012, rad: 0.004 }, q); }
    });
    partes.push(fr);
    if (P.metais > 0.5) {
      var mt = parte("metais", "Torneira de bica móvel e válvula", CROMO, true), zT = -hz + 0.045, alt = 0.282;   /* Docol Uno 00524906 (pág. 95): 282 de altura, arejador a 190, alcance 153, base Ø 52 */
      var x = 0, y = 0;
      torno(mt.m, [[0.026, 0], [0.026, 0.008], [0.02, 0.016], [0.019, 0.111], [0.017, 0.125], [0, 0.13]], q.n, { c: [x, y, zT] });
      tubo(mt.m, [[x, 0.12, zT], [x, alt, zT], [x, alt, zT + 0.153], [x, 0.19 + 0.022, zT + 0.153]], 0.011, Math.max(8, q.n - 2), { rc: 0.06, arco: q.arco + 2 });
      torno(mt.m, [[0.013, 0], [0.013, 0.022], [0.01, 0.025]], q.n, { c: [x, 0.19 + 0.025, zT + 0.153], eixo: [0, -1, 0] });
      tubo(mt.m, [[x + 0.018, 0.1, zT], [x + 0.066, 0.111, zT]], 0.006, 8, { rc: 0 });
      valvulaEscoamento(mt.m, [0, -Hc + 0.002, 0], 0.045, -Hc - 0.03, q);
      partes.push(mt);
      var sf = parte("sifao", "Sifão sanfonado", BRANCO, true);
      sifaoSanfonado(sf.m, [0, -Hc - 0.03, 0], [0, -Hc - 0.06, -hz + 0.02], q);
      partes.push(sf);
    }
    return partes;
  }

  /* ---------- chuveiro / ducha (braço de parede; elétrico opcional) ---------- */
  function geoChuveiro(P, q) {
    var L = P.L, H = P.H, Pp = P.P, partes = [], mt = parte("metais", "Braço e ducha", CROMO);
    canopla(mt.m, [0, 0, 0], [0, 0, 1], 0.03, 0.01, q.n);
    /* braço de parede: sai do ponto de água subindo em ângulo e termina na vertical sobre o crivo */
    var zc = Pp - L / 2, yc = H - 0.035;
    if (P.eletrico > 0.5) {
      /* elétrico: o cano entra QUASE NA HORIZONTAL no flanco do corpo, a 0,32 da altura a partir do topo (desenho Maxi Ducha) */
      var Re = 0.0655, he = 0.156, ytop = 0.05, zce = Pp - Re;
      tubo(mt.m, [[0, 0, 0.005], [0, 0, 0.05], [0, ytop - he * 0.32, zce - Re * 0.55]], 0.0105, q.n, { rc: 0.03, arco: q.arco });
      var el = parte("chuveiro", "Chuveiro elétrico", BRANCO);
      torno(el.m, [[0, 0], [Re * 0.5, 0.003], [Re * 0.65, 0.015], [Re * 0.68, 0.04], [Re * 0.68, he * 0.55], [Re * 0.76, he * 0.66], [Re * 0.93, he * 0.76], [Re, he * 0.82], [Re, he * 0.9], [Re * 0.88, he * 0.96], [Re * 0.6, he], [0, he]], q.N, { c: [0, ytop, zce], eixo: [0, -1, 0] });
      torno(el.m, [[0.012, 0], [0.012, 0.03], [0.015, 0.032], [0.015, 0.045]], q.n, { c: [0, ytop - he * 0.32, zce - Re * 0.6], eixo: [0, 0, -1] });
      var cr = parte("crivo", "Espalhador e seletor", PLAST);
      torno(cr.m, [[Re * 0.86, 0], [Re * 0.86, 0.004], [0, 0.007]], q.N, { c: [0, ytop - he, zce], eixo: [0, -1, 0] });
      caixaR(cr.m, { x0: -0.022, x1: 0.022, y0: ytop - 0.03, y1: ytop - 0.018, z0: zce + Re * 0.6, z1: zce + Re * 0.72, r: 0.003, rad: 0.004 }, { k: 2, kv: 1 });
      partes.push(el, cr);
      partes.unshift(mt);
      return partes;
    }
    if (P.est > 0.5) {
      /* DOCOL CLÁSSICO (catálogo geral pág. 186): flange Ø52 na parede (rosca G 1/2"), braço que sai HORIZONTAL e CURVA para baixo, crivo chato
         Ø95,8. Cotas: 223,7 mm do fundo da parede à borda do crivo (P), 113,7 mm do eixo do braço à face do crivo (H), Ø95,8 (L). A inclinação do
         crivo (~20° no desenho) não é modelada. O desenho vale para todo chuveiro de parede sem desenho cotado próprio (nota na família). */
      var Rc = L / 2, zcc = Pp - Rc, yb = -(H - 0.068);
      canopla(mt.m, [0, 0, 0], [0, 0, 1], 0.026, 0.014, q.n);
      tubo(mt.m, [[0, 0, 0.01], [0, 0, 0.04], [0, 0, zcc], [0, yb, zcc]], 0.0105, q.n, { rc: Math.min(0.07, zcc * 0.45), arco: q.arco + 2 });
      torno(mt.m, [[0.013, 0], [0.017, 0.008], [0.014, 0.018]], q.n, { c: [0, yb + 0.002, zcc], eixo: [0, -1, 0] });
      torno(mt.m, [[0.02, 0.014], [Rc * 0.5, 0.020], [Rc * 0.95, 0.028], [Rc, 0.034], [Rc * 0.96, 0.038]], q.N, { c: [0, yb, zcc], eixo: [0, -1, 0] });
      var cr3 = parte("crivo", "Face do crivo", PRETO);
      torno(cr3.m, [[Rc * 0.9, 0], [Rc * 0.9, 0.002], [0, 0.004]], q.N, { c: [0, yb - 0.038, zcc], eixo: [0, -1, 0] });
      partes.push(cr3); partes.unshift(mt);
      return partes;
    }
    tubo(mt.m, [[0, 0, 0.005], [0, 0, 0.04], [0, yc * 0.85, zc * 0.75], [0, yc, zc], [0, yc - 0.03, zc]], 0.0105, q.n, { rc: 0.045, arco: q.arco + 1 });
    {
      var R2 = L / 2;
      torno(mt.m, [[0.011, 0], [0.016, 0.012], [R2 * 0.7, 0.024], [R2, 0.032], [R2 * 0.99, 0.04], [R2 * 0.94, 0.044]], q.N, { c: [0, yc - 0.03, zc], eixo: [0, -1, 0] });
      var cr2 = parte("crivo", "Face do crivo", PRETO);
      torno(cr2.m, [[R2 * 0.92, 0], [R2 * 0.92, 0.002], [0, 0.004]], q.N, { c: [0, yc - 0.03 - 0.044, zc], eixo: [0, -1, 0] });
      partes.push(cr2);
    }
    partes.unshift(mt);
    return partes;
  }

  /* ---------- ducha higiênica (registro na parede, flexível e gatilho no suporte) ---------- */
  function geoDucha(P, q) {
    var W = P.W, H = P.H, Pp = P.P, mt = parte("metais", "Registro, suporte e gatilho", CROMO), fl = parte("flexivel", "Flexível", CROMO);
    var yr = H * 0.78, ys = H * 0.42;
    canopla(mt.m, [0, yr, 0], [0, 0, 1], W / 2 * 0.95, 0.01, q.n);
    torno(mt.m, [[0.012, 0], [0.012, 0.03], [0.011, 0.035]], q.n, { c: [0, yr, 0], eixo: [0, 0, 1] });
    volante(mt.m, [0, yr, 0.03], [0, 0, 1], 0.019, 0.026, q.n);
    torno(mt.m, [[0.009, 0], [0.009, 0.025]], q.n, { c: [0, yr - 0.008, 0.012], eixo: [0, -1, 0] });
    caixaRz(mt.m, { x0: -0.018, x1: 0.018, y0: ys - 0.02, y1: ys + 0.02, z0: 0, z1: 0.012, r: 0.004, rad: 0.012 }, q);
    caixaR(mt.m, { x0: -0.015, x1: 0.015, y0: ys - 0.012, y1: ys + 0.004, z0: 0.012, z1: Pp * 0.5, r: 0.003, rad: 0.008 }, q);
    /* gatilho (ducha) apoiado no suporte, bico para baixo */
    var gz = Pp * 0.62;
    torno(mt.m, [[0, 0], [0.013, 0.004], [0.016, 0.03], [0.014, 0.08], [0.012, 0.1], [0.015, 0.12], [0.012, 0.13], [0, 0.132]], q.n, { c: [0, ys - 0.07, gz], eixo: [0, 1, 0] });
    tubo(fl.m, [[0, yr - 0.033, 0.012], [0, yr - 0.08, 0.02], [0.03, 0.02, 0.03], [-0.01, 0.0, gz * 0.7], [0, ys - 0.07, gz]], 0.0055, Math.max(6, q.n - 4), { rc: 0.05, arco: q.arco + 1 });
    return [mt, fl];
  }

  /* ---------- torneira (parede ou mesa; origem = ponto de água) ---------- */
  /* torneira de mesa 1/4 de volta (Docol Trio 00500906, catálogo geral pág. 44): base Ø 47,3, corpo até 0,72·H, cruzeta
     no topo (H = 83), bica saindo do corpo a 0,62·H e descendo 8° até a saída a 0,52·H, alcance 115 do eixo */
  function torneiraTrio(m, c, H, alcance, q) {
    var x = c[0], y = c[1], z = c[2];
    torno(m, [[0.0236, 0], [0.0236, 0.004], [0.022, 0.008], [0.019, H * 0.18], [0.017, H * 0.6], [0.0165, H * 0.72], [0.012, H * 0.74], [0.009, H * 0.8]], q.n + 2, { c: [x, y, z] });
    caixaR(m, { x0: x - 0.026, x1: x + 0.026, y0: y + H * 0.8, y1: y + H, z0: z - 0.007, z1: z + 0.007, r: 0.003, rad: 0.004 }, { k: 2, kv: 1 });
    caixaR(m, { x0: x - 0.007, x1: x + 0.007, y0: y + H * 0.8, y1: y + H, z0: z - 0.026, z1: z + 0.026, r: 0.003, rad: 0.004 }, { k: 2, kv: 1 });
    var y1 = y + H * 0.62, y2 = y + H * 0.52;
    loft(m, [0, 0.35, 0.7, 1].map(function (t) {
      var zz = z + 0.012 + (alcance - 0.012) * t, yy = y1 + (y2 - y1) * t, w = 0.013 - 0.004 * t, h = 0.011 - 0.004 * t;
      return anelRR(0, 0, 0, w, h, 0.004, 2).map(function (p2) { return [x + p2[0], yy + p2[2], zz]; });
    }));
  }
  function geoTorneira(P, q) {
    var W = P.W, H = P.H, Pp = P.P, mt = parte("metais", "Torneira", CROMO);
    if (Math.round(P.modelo) === 1) torneiraTrio(mt.m, [0, 0, 0], H, Math.max(0.05, Pp - 0.039), q);
    else torneiraParede(mt.m, [0, 0, 0], Math.max(0.04, Pp - 0.04), H * 0.66, q);
    return [mt];
  }
  /* ---------- misturador (dois registros: parede ou mesa) ---------- */
  function geoMisturador(P, q) {
    var W = P.W, H = P.H, Pp = P.P, mt = parte("metais", "Misturador", CROMO), d = 0.04;
    if (Math.round(P.modelo) === 1) {
      caixaR(mt.m, { x0: -W / 2, x1: W / 2, y0: 0, y1: 0.012, z0: -0.025, z1: 0.025, r: 0.004, rad: 0.024 }, q);
      [-1, 1].forEach(function (s) { volante(mt.m, [s * d * 1.4, 0.012, 0], [0, 1, 0], 0.02, 0.05, q.n); });
      torneiraMesa(mt.m, [0, 0.012, 0], H * 0.85, Math.max(0.08, Pp - 0.04), q, false);
    } else {
      [-1, 1].forEach(function (s) {
        canopla(mt.m, [s * d, 0, 0], [0, 0, 1], 0.03, 0.009, q.n);
        torno(mt.m, [[0.014, 0], [0.014, Pp * 0.35]], q.n, { c: [s * d, 0, 0], eixo: [0, 0, 1] });
        volante(mt.m, [s * d, 0, Pp * 0.35], [0, 0, 1], 0.024, 0.032, q.n);
      });
      tubo(mt.m, [[-d, H * 0.25, 0.02], [d, H * 0.25, 0.02]], 0.011, q.n, { rc: 0 });
      tubo(mt.m, [[-d, 0, 0.02], [-d, H * 0.25, 0.02]], 0.01, q.n, { rc: 0 });
      tubo(mt.m, [[d, 0, 0.02], [d, H * 0.25, 0.02]], 0.01, q.n, { rc: 0 });
      tubo(mt.m, [[0, H * 0.25, 0.02], [0, H - 0.042, 0.02], [0, H - 0.042, Pp - 0.01], [0, H - 0.08, Pp - 0.01]], 0.0105, q.n, { rc: 0.03, arco: q.arco });
    }
    return [mt];
  }
  /* ---------- registro (corpo em linha ao longo de X; castelo para fora da parede ou para cima) ---------- */
  function geoRegistro(P, q) {
    var C = P.C, H = P.H, Pp = P.P, tipo = Math.round(P.tipo || 0), parede = P.parede > 0.5, partes = [];
    var ax = parede ? [0, 0, 1] : [0, 1, 0], corpo = parte("corpo", "Corpo do registro", LATAO), rb = Math.min(Pp * 0.32, 0.022);
    torno(corpo.m, [[rb * 0.85, 0], [rb, 0.004], [rb, C * 0.22], [rb * 0.92, C * 0.26], [rb * 1.15, C * 0.4], [rb * 1.15, C * 0.6], [rb * 0.92, C * 0.74], [rb, C * 0.78], [rb, C - 0.004], [rb * 0.85, C]], q.n, { c: [-C / 2, 0, 0], eixo: [1, 0, 0] });
    var lc = H - Pp / 2 - 0.035;
    torno(corpo.m, [[rb * 0.8, 0], [rb * 0.8, lc * 0.55], [rb * 0.6, lc * 0.6], [rb * 0.45, lc]], q.n, { c: [0, 0, 0], eixo: ax });
    partes.push(corpo);
    var ac = parte("acabamento", tipo === 2 ? "Alavanca" : "Canopla e volante", tipo === 2 ? "Vermelho" : CROMO, true);
    function em(t) { return parede ? [0, 0, t] : [0, t, 0]; }
    if (tipo === 2) {
      torno(ac.m, [[0.005, 0], [0.005, lc]], q.n, { c: [0, 0, 0], eixo: ax });
      var t0 = em(lc);
      if (parede) caixaRz(ac.m, { x0: -C * 0.45, x1: C * 0.45, y0: -0.007, y1: 0.007, z0: t0[2], z1: t0[2] + 0.009, r: 0.002, rad: 0.005 }, q);
      else caixaR(ac.m, { x0: -C * 0.45, x1: C * 0.45, y0: t0[1], y1: t0[1] + 0.009, z0: -0.007, z1: 0.007, r: 0.002, rad: 0.005 }, q);
    } else {
      /* acabamento DocolBase (Docol, catálogo geral pág. 44): canopla cônica Ø 58 com 40 de altura e volante Ø 57;
         projeção total de 64,9 da face da parede (a parede fica a Altura − 64,9 mm do eixo do tubo) */
      var zw = Math.max(0.02, H - 0.0649), rc0 = Pp / 2;
      torno(ac.m, [[rc0 * 0.9, 0], [rc0, 0.003], [rc0 * 0.97, 0.008], [rc0 * 0.62, 0.04], [rc0 * 0.55, 0.042]], q.N, { c: em(zw), eixo: ax });
      torno(ac.m, [[0.007, 0], [0.007, zw + 0.044]], q.n, { c: [0, 0, 0], eixo: ax });
      var rvol = rc0 * 0.98;
      torno(ac.m, [[rvol * 0.5, 0], [rvol * 0.92, 0.004], [rvol, 0.01], [rvol, 0.016], [rvol * 0.9, 0.021], [rvol * 0.35, 0.0245], [0, 0.025]], q.N, { c: em(zw + 0.04), eixo: ax });
    }
    partes.push(ac);
    return partes;
  }
  /* ---------- válvula de descarga: corpo no interior da parede, acabamento e botão ---------- */
  function geoValvula(P, q) {
    var W = P.W, H = P.H, Pp = P.P, partes = [], cp = parte("corpo", "Corpo (dentro da parede)", LATAO), ac = parte("acabamento", "Acabamento e botão", CROMO);
    /* o corpo desce 0,4 H abaixo da entrada: a SAÍDA para a bacia (conector "descarga", js/hidfamilias.js — D-02, 19/10/2026) fica
       na base do volume, com a mesma altura total H */
    torno(cp.m, [[0.028, -H * 0.4], [0.028, H * 0.5], [0.02, H * 0.6]], q.n, { c: [0, 0, -Pp * 0.55], eixo: [0, 1, 0] });
    torno(cp.m, [[0.012, 0], [0.012, Pp * 0.55]], q.n, { c: [0, 0.02, -Pp * 0.55], eixo: [0, 0, 1] });
    var yc = H * 0.2;
    caixaRz(ac.m, { x0: -W / 2, x1: W / 2, y0: yc - H * 0.3, y1: yc + H * 0.3, z0: 0, z1: 0.008, r: 0.003, rad: W * 0.22 }, q);
    torno(ac.m, [[W * 0.24, 0], [W * 0.24, 0.006], [W * 0.22, 0.012], [W * 0.15, 0.016], [0, 0.017]], q.N, { c: [0, yc, 0.008], eixo: [0, 0, 1] });
    partes.push(cp, ac);
    return partes;
  }
  function geoCaixaEmbutida(P, q) {
    var W = P.W, H = P.H, E = P.E, cx = parte("caixa", "Caixa embutida", PLAST), pl = parte("placa", "Placa de acionamento", CROMO);
    caixaR(cx.m, { x0: -W / 2, x1: W / 2, y0: 0, y1: H, z0: -E * 0.92, z1: -0.005, r: 0.006, rad: 0.02 }, q);
    var yp = H * 0.69;
    caixaRz(pl.m, { x0: -W * 0.36, x1: W * 0.36, y0: yp - H * 0.14, y1: yp + H * 0.14, z0: -0.006, z1: E * 0.08, r: 0.003, rad: 0.012 }, q);
    var bt = parte("botoes", "Botões (descarga menor e maior)", BRANCO);
    caixaRz(bt.m, { x0: -W * 0.3, x1: -0.004, y0: yp - H * 0.1, y1: yp + H * 0.1, z0: E * 0.06, z1: E * 0.1, r: 0.002, rad: 0.008 }, q);
    caixaRz(bt.m, { x0: 0.004, x1: W * 0.3, y0: yp - H * 0.1, y1: yp + H * 0.1, z0: E * 0.06, z1: E * 0.1, r: 0.002, rad: 0.008 }, q);
    return [cx, pl, bt];
  }

  /* ---------- grelha (quadrada ou redonda) com fendas escuras ---------- */
  function grelha(partes, lado, redonda, y, q) {
    var pg = parte("porta-grelha", "Porta-grelha", BRANCO), gr = parte("grelha", "Grelha", INOX), fe = parte("fendas", "Fendas da grelha", PRETO), h = lado / 2;
    if (redonda) {
      torno(pg.m, [[h * 0.86, -0.004], [h, -0.004], [h, y + 0.002], [h * 0.97, y + 0.004], [h * 0.86, y + 0.004]], q.N, { c: [0, 0, 0], fechado: false });
      torno(gr.m, [[h * 0.86, 0], [h * 0.86, y + 0.003], [0, y + 0.0035]], q.N, { c: [0, 0, 0] });
      [0.25, 0.45, 0.65].forEach(function (r) { torno(fe.m, [[h * r, y + 0.0032], [h * (r + 0.08), y + 0.0032], [h * (r + 0.08), y + 0.0042], [h * r, y + 0.0042]], q.N, { fechado: true }); });
    } else {
      caixaR(pg.m, { x0: -h, x1: h, y0: -0.004, y1: y + 0.004, z0: -h, z1: h, r: 0.002, rad: 0.006 }, q);
      caixaR(gr.m, { x0: -h * 0.86, x1: h * 0.86, y0: y + 0.002, y1: y + 0.0045, z0: -h * 0.86, z1: h * 0.86, r: 0.0008, rad: 0.004 }, q);
      var n = 6, i, j, p = h * 1.6 / n;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
        if ((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) continue;
        var x = -h * 0.8 + p * (i + 0.5), z = -h * 0.8 + p * (j + 0.5);
        caixaR(fe.m, { x0: x - p * 0.3, x1: x + p * 0.3, y0: y + 0.0042, y1: y + 0.0052, z0: z - p * 0.3, z1: z + p * 0.3, r: 0, rad: p * 0.12 }, { k: 1, kv: 0 });
      }
    }
    partes.push(pg, gr, fe);
  }
  function geoCaixaSifonada(P, q) {
    var W = P.W, Pp = P.P, H = P.H, lado = Math.min(W, Pp), partes = [], co = parte("corpo", "Corpo", PVC, false);
    torno(co.m, [[lado * 0.42, -H], [lado * 0.46, -H + 0.01], [lado * 0.47, -0.02], [lado * 0.49, -0.006], [lado * 0.49, -0.004]], q.N, { c: [0, 0, 0] });
    /* entrada lateral e saída embaixo (até os conectores) */
    torno(co.m, [[0.021, 0], [0.021, lado * 0.06]], q.n, { c: [-lado / 2 + lado * 0.06, -0.026, 0], eixo: [-1, 0, 0] });
    torno(co.m, [[0.027, 0], [0.027, lado * 0.14]], q.n, { c: [lado * 0.36, -H + 0.027, 0], eixo: [1, 0, 0] });
    partes.push(co);
    grelha(partes, lado, false, 0, q);
    return partes;
  }
  function geoRalo(P, q) {
    var D = P.D, H = P.H, partes = [], co = parte("corpo", "Corpo", PVC);
    torno(co.m, [[D * 0.18, -H], [D * 0.2, -H + 0.004], [D * 0.36, -H * 0.55], [D * 0.44, -0.012], [D * 0.47, -0.004]], q.N, { c: [0, 0, 0] });
    partes.push(co);
    grelha(partes, D, !(P.quadrado > 0.5), 0, q);
    return partes;
  }
  function geoCaixaCil(P, q) {
    var D = P.D, H = P.H, R = D / 2, partes = [], co = parte("corpo", "Corpo", PVC), tp = parte("tampa", "Tampa", CLARO), N = q.N;
    var pf = [[R * 0.97, -H], [R, -H + 0.01]];
    for (var i = 1; i <= 4; i++) { var y = -H + (H - 0.03) * i / 5; pf.push([R, y - 0.012], [R * 1.0, y - 0.006], [R * 0.985, y]); }
    pf.push([R * 0.985, -0.03], [R, -0.02]);
    torno(co.m, pf, N, { c: [0, 0, 0] });
    torno(tp.m, [[R * 0.99, -0.02], [R * 0.99, -0.004], [R * 0.95, 0], [0, 0.002]], N, { c: [0, 0, 0] });
    caixaR(tp.m, { x0: -R * 0.3, x1: R * 0.3, y0: 0, y1: 0.012, z0: -0.008, z1: 0.008, r: 0.004, rad: 0.006 }, q);
    [0.45, 0.75].forEach(function (k) { torno(tp.m, [[R * k, 0], [R * (k + 0.03), 0], [R * (k + 0.03), 0.003], [R * k, 0.003]], N, { c: [0, 0.0005, 0], fechado: true }); });
    partes.push(co, tp);
    return partes;
  }

  /* ---------- REGISTROS E VÁLVULAS NO TUBO (27/10/2026): a peça avulsa (família ra-registro-*) desenha o MESMO que o tubo ----------
     Quem desenha o registro/válvula no tubo é o HidGeo.registro (js/biminstgeo.js, perfis medidos nas famílias do fabricante: Deca para gaveta e pressão,
     PVC soldável da Tigre/Amanco para a esfera, js/biminst.js ACESSORIOS para as variantes). Este gerador é só a PONTE: chama o HidGeo.registro na origem,
     eixo do tubo em X e haste para +Y, e devolve as partes no formato do HidLouca — assim o ícone, a peça avulsa e o tubo ficam iguais.
     P: C (face a face, m), DN (mm), ac (0 gaveta, 1 esfera, 2 pressão, 3 retenção), vi (índice da variante em REG_VAR[ac]). */
  var REG_AC = ["registro_gaveta", "registro_esfera", "registro_pressao", "valvula_retencao"];
  var REG_VAR = [[["bruto", "latao"], ["acabamento", "latao"]],
    [["soldavel", "pvc_soldavel"], ["roscavel", "pvc_roscavel"], ["borboleta", "pvc_roscavel"]],
    [["soldavel", "pvc_soldavel"], ["roscavel", "pvc_roscavel"], ["bruto", "latao"], ["acabamento", "latao"]],
    [["bronze", "bronze"], ["pe_crivo", "bronze"], ["pvc", "pvc_soldavel"]]];
  var REG_MAT = { latao: LATAO, corpo: PVC, cromado: "Metal cromado", volante: "Vermelho" };
  function geoRegistroTubo(P, q) {
    var nivel = q && q.N <= 12 ? 2 : (q && q.N <= 20 ? 1 : 0);   /* NIVEIS: N 32 / 20 / 12 */
    var G = global.HidGeo || (typeof require === "function" ? (function () { try { return require("./biminstgeo.js"); } catch (e) { return null; } })() : null);
    G = (global.HidGeo || G);
    if (!G || !G.registro) throw new Error("HidGeo.registro indisponível (js/biminstgeo.js)");
    var ac = Math.round(P.ac), vi = Math.round(P.vi), V = (REG_VAR[ac] || [])[vi];
    if (!V) throw new Error("variante " + vi + " inexistente em " + REG_AC[ac]);
    var r = G.registro({ centro: [0, 0, 0], dir: [1, 0, 0], comprimento: P.C, dn: P.DN, material: "pvc_soldavel", variante: V[0], acessorio: REG_AC[ac], varMaterial: V[1] }, { lod: nivel ? "longe" : "perto", frente: [0, 1, 0] });
    var ps = r.partes || [];
    if (nivel === 2 && ps.length > 1) {   /* nível 2 (longe): só a maior parte — a silhueta do corpo */
      ps = [ps.reduce(function (a, b) { return b.malha.idx.length > a.malha.idx.length ? b : a; })];
    }
    return ps.map(function (q, i) {
      var pt = parte(q.papel + (i ? "-" + i : ""), q.papel, REG_MAT[q.papel] || PVC, false);
      pt.m.v = q.malha.pos.slice(); pt.m.f = q.malha.idx.slice();
      return pt;
    });
  }

  /* ---------- CAIXAS ENTERRADAS DE PVC DN300 — Amanco Wavin, ficha técnica FTC000003 (rev. ago/2024), págs. 7 a 10 ----------
     (27/10/2026, "famílias iguais ao catálogo"): a de gordura, a de inspeção e a de areia eram o MESMO cilindro com outra altura. Cada uma agora
     tem a forma do produto, com as letras do desenho da ficha (medidas aproximadas, mm):
       GORDURA   (pág. 7)  A Ø do corpo 308 · B altura do corpo 461 · C largura com os bocais 422 · E altura total 508 (= B + G) · F lado da tampa 321 ·
                           G espessura da tampa 47 · bocais: D1 DN100 (saída), D2 DN75 e D3 DN50/40 (entradas);
       INSPEÇÃO  (pág. 8)  A Ø do tambor 332 · B altura 201 · C1 424 (largura nos bocais, eixo X) · C2 386 (eixo Z) · E altura total 248 (= B + G) · F 321 · G 47 ·
                           4 bocais DN100 (D1, D2);
       AREIA     (NBR 10844, caixa de areia = bolsão de sedimentos abaixo da geratriz do tubo): o MESMO tambor da inspeção sobre um PROLONGADOR DN300 × 200
                           (pág. 10, cód. 70900: comprimento 200, Ø externo 307) — o bolsão de areia de ≥ 0,15 m (NBR 10844).
     Origem: o piso acabado, no eixo; a face de cima da tampa em y = 0. A altura do bocal NÃO vem em cota da ficha (só no desenho): a posição é lida
     do desenho, em fração do corpo — está na lista "a conferir" da família. P: D (Ø corpo), H (altura corpo), Ft/Gt (tampa), Cx/Cz (largura nos bocais),
     Pr (prolongador, 0 = sem), Dn (DN dos bocais, mm), n3 (1 = o terceiro bocal DN50/40 da gordura). */
  function bocalX(m, x0, x1, y, z, r, N) { tubo(m, [[x0, y, z], [x1, y, z]], r, Math.max(8, N), { rc: 0 }); }
  function bocalZ(m, x, y, z0, z1, r, N) { tubo(m, [[x, y, z0], [x, y, z1]], r, Math.max(8, N), { rc: 0 }); }
  function tampaQuadrada(tp, Ft, Gt, q, grelha) {
    caixaR(tp.m, { x0: -Ft / 2, x1: Ft / 2, y0: -Gt, y1: -0.006, z0: -Ft / 2, z1: Ft / 2, r: 0.006, rad: 0.014 }, q);
    caixaR(tp.m, { x0: -Ft * 0.44, x1: Ft * 0.44, y0: -0.007, y1: 0, z0: -Ft * 0.44, z1: Ft * 0.44, r: 0.002, rad: 0.01 }, q);
    if (grelha) for (var i = 1; i <= 5; i++) { var z = -Ft * 0.44 + Ft * 0.88 * i / 6; caixaR(tp.m, { x0: -Ft * 0.4, x1: Ft * 0.4, y0: 0, y1: 0.004, z0: z - 0.004, z1: z + 0.004, r: 0.001, rad: 0.002 }, q); }
  }
  function tamborCaixa(co, R, yTop, yBase, N, nervuras) {
    var pf = [[R * 0.97, yBase], [R, yBase + 0.01]], i;
    for (i = 1; i <= nervuras; i++) { var y = yBase + (yTop - yBase - 0.03) * i / (nervuras + 1); pf.push([R, y - 0.01], [R * 1.012, y - 0.005], [R, y]); }
    pf.push([R, yTop - 0.02], [R * 1.05, yTop - 0.014], [R * 1.05, yTop]);
    torno(co.m, pf, N, { c: [0, 0, 0] });
  }
  function geoCaixaGordura(P, q) {
    var R = P.D / 2, B = P.H, Gt = P.Gt, N = q.N, partes = [], co = parte("corpo", "Corpo", PVC), tp = parte("tampa", "Tampa", CLARO), bo = parte("bocais", "Bocais", PVC);
    var yTop = -Gt, yBase = -Gt - B, rB = (P.Dn + 14) / 2000;   // bolsa = DN + 14 mm (bolsa de esgoto série normal)
    tamborCaixa(co, R, yTop, yBase, N, 4);
    tampaQuadrada(tp, P.Ft, Gt, q, true);
    var L = Math.max(0.03, (P.Cx - P.D) / 2), yE = yTop - B * 0.12, ySd = yTop - B * 0.42;
    bocalX(bo.m, R * 0.96, R + L, ySd, 0, rB, N);                                                          // D1 DN100 — saída (+X)
    bocalX(bo.m, -R - L, -R * 0.96, yE, -R * 0.2, (75 + 14) / 2000, N);                                    // D2 DN75 — entrada (−X)
    if (P.n3 > 0.5) bocalX(bo.m, -R - L, -R * 0.96, yE, R * 0.28, (50 + 14) / 2000, N);                    // D3 DN50/40 — entrada (−X)
    partes.push(co, tp, bo);
    return partes;
  }
  function geoCaixaInspecao(P, q) {
    var R = P.D / 2, B = P.H, Gt = P.Gt, N = q.N, partes = [], co = parte("corpo", "Tambor", PVC), tp = parte("tampa", "Tampa", CLARO), bo = parte("bocais", "Bocais", PVC);
    var yTop = -Gt, yBase = -Gt - B, rB = (P.Dn + 14) / 2000;
    tamborCaixa(co, R, yTop, yBase, N, 1);
    if (P.Pr > 0) {   // prolongador DN300: Ø externo 307, na vertical sob o tambor (pág. 10)
      var Rp = 0.307 / 2, pf = [[Rp * 0.98, yBase - P.Pr], [Rp, yBase - P.Pr + 0.008], [Rp, yBase + 0.01], [R * 0.97, yBase + 0.01]];
      torno(co.m, pf, N, { c: [0, 0, 0] });
    }
    tampaQuadrada(tp, P.Ft, Gt, q, true);
    var y = yTop - B * 0.5, Lx = Math.max(0.02, (P.Cx - P.D) / 2), Lz = Math.max(0.02, (P.Cz - P.D) / 2);
    bocalX(bo.m, R * 0.96, R + Lx, y, 0, rB, N);        // +X
    bocalX(bo.m, -R - Lx, -R * 0.96, y, 0, rB, N);      // −X
    bocalZ(bo.m, 0, y, R * 0.96, R + Lz, rB, N);        // +Z
    bocalZ(bo.m, 0, y, -R - Lz, -R * 0.96, rB, N);      // −Z
    partes.push(co, tp, bo);
    return partes;
  }

  /* ---------- reservatório de polietileno — Fortlev caixa d'água 1000 L (Manual Técnico 2020, pág. 3) ----------
     Cotas da ficha: A altura com tampa, B sem tampa, C Ø com tampa, D Ø sem tampa, E Ø da base (1000 L: 0,97 /
     0,76 / 1,52 / 1,51 / 1,16 m). Perfil medido no desenho: faixa de base até 0,24·B com degrau, corpo cônico
     com degrau a 0,5·B, colarinho de 0,11·B no alto, aba da tampa de 42 mm em C e tampa cônica com 8 nervuras e
     tampão central. Sem as cotas B/D/E no tipo, valem as proporções do 1000 L (a conferir). */
  function geoReservatorio(P, q) {
    var C = P.D, A = P.H, B = P.Hc > 0 ? P.Hc : A * 0.784, D = P.Dc > 0 ? P.Dc : C * 0.993, E = P.Db > 0 ? P.Db : C * 0.763;
    var R = D / 2, Rb = E / 2, tipo = Math.round(P.tipo || 0), N = q.N + 8, partes = [], co = parte("corpo", "Reservatório", POLI), tp = parte("tampa", "Tampa", POLI);
    function lr(h0, r0, h1, r1, h) { return r0 + (r1 - r0) * (h - h0) / (h1 - h0); }
    var r27 = Rb * 1.07, r50 = R * 0.914, pf;
    if (tipo === 1 || tipo === 2) {
      /* cisterna e tanque: corpo reto corrugado e tampa de inspeção (sem desenho cotado lido: proporção, a conferir) */
      B = P.Hc > 0 ? P.Hc : A * 0.93; R = C / 2;
      var Rt = P.Dt > 0 ? P.Dt / 2 : R * 0.33;
      pf = [[R * 0.92, 0], [R * 0.96, 0.012]];
      for (var i = 1; i <= 5; i++) { var y = B * 0.9 * i / 6; pf.push([R * 0.96, y - 0.025], [R, y - 0.008], [R, y + 0.008], [R * 0.96, y + 0.025]); }
      pf.push([R * 0.96, B * 0.9], [R * 0.86, B * 0.97], [Rt * 0.97, B]);
      torno(co.m, pf, N, { c: [0, 0, 0] });
      torno(tp.m, [[Rt * 0.98, B - 0.01], [Rt * 1.03, B + 0.004], [Rt * 1.03, A - 0.012], [Rt * 0.97, A], [0, A]], N, { c: [0, 0, 0] });
    } else {
      pf = [[Rb, 0], [Rb + 0.005, 0.006], [Rb * 1.035, B * 0.235], [Rb * 1.06, B * 0.24, 1], [Rb * 1.06, B * 0.265], [r27, B * 0.27],
        [lr(B * 0.27, r27, B * 0.5, r50, B * 0.495), B * 0.495], [R * 0.935, B * 0.505, 1], [R * 0.971, B * 0.885],
        [R * 0.985, B * 0.89], [R, B * 0.905], [R, B - 0.004], [R * 0.95, B], [0, B]];
      torno(co.m, pf, N, { c: [0, 0, 0] });
      var hs = B + Math.min(0.042, (A - B) * 0.2), Rc = C / 2;
      torno(tp.m, [[Rc - 0.004, B - 0.006], [Rc, B - 0.002], [Rc, hs - 0.003], [Rc - 0.004, hs], [R * 0.95, hs + 0.004], [R * 0.6, hs + (A - hs) * 0.42], [R * 0.12, A - (A - B) * 0.12], [R * 0.09, A - (A - B) * 0.12], [R * 0.085, A - 0.004], [R * 0.08, A], [0, A]], N, { c: [0, 0, 0] });
      /* nervuras radiais da tampa */
      for (var j = 0; j < 8; j++) {
        var a = TAU * (j + 0.5) / 8, c = Math.cos(a), s = Math.sin(a), r0 = R * 0.14, r1 = R * 0.88;
        var h0 = A - (A - B) * 0.14, h1 = hs + (A - hs) * 0.08;
        tubo(tp.m, [[c * r0, h0, s * r0], [c * r1, h1, s * r1]], 0.012, 6, { rc: 0 });
      }

    }
    partes.unshift(co, tp);
    /* conexões: adaptador com flange na saída (embaixo, lado +X) e na entrada (em cima, lado −X) */
    /* N23 (26/10/2026, referências Fortlev/Tigre do Rogério: "o nosso está saindo com 50 ou 60 mm"): o adaptador era desenhado com
       Ø 52 mm fixo em qualquer caixa. Agora o corpo e a flange seguem o DN que o Traçar automaticamente (js/hidbarrilete.js) grava na
       instância (Ad_*; 0 = o DN 25 da entrada/saída padrão, e extravasor/limpeza/2ª saída não desenhados). A flange fica encostada na
       parede da caixa e o corpo sai até a face externa (onde o tubo começa). */
    var cn = parte("conexoes", "Adaptadores com flange", PVC, true);
    var cil = tipo === 1 || tipo === 2, rS = cil ? R * 0.96 : Rb * 1.03, rE = cil ? R * 0.96 : R * 0.97, Rext = C / 2 + 0.004;
    function adapt(dn, ang, y, r0, r1) {
      var rb = dn / 2000 + 0.0035, rfl = rb + 0.008, c = Math.cos(ang), s = -Math.sin(ang);   // hid:ok parede do adaptador e aba da flange (desenho)
      torno(cn.m, [[rfl, 0], [rfl, 0.008], [rb, 0.01], [rb, Math.max(0.03, r1 - r0)]], q.n, { c: [c * (r0 - 0.004), y, s * (r0 - 0.004)], eixo: [c, 0, s] });
    }
    var dS = P.aS > 0 ? P.aS : 25, dE = P.aE > 0 ? P.aE : 25;   // hid:ok DN 25 (3/4") = o padrão da entrada e da saída sem o Traçar
    adapt(dS, 0, 0.03, rS, R + 0.03);   // hid:ok 0,03 = a cota do conector "saida" (js/hidfamilias.js)
    adapt(dE, Math.PI, B * 0.86, rE, rE + 0.06);
    if (P.a2 > 0) adapt(P.a2, P.g2 || 0, 0.03, rS, R + 0.03);   // hid:ok a 2ª saída na cota da 1ª
    if (P.aX > 0 && P.yX > 0) adapt(P.aX, P.gX || 0, P.yX, R * 0.96, Rext);
    if (P.aL > 0 && P.yL > 0) adapt(P.aL, P.gL || 0, P.yL, cil ? R * 0.96 : Rb, Rext);
    partes.push(cn);
    return partes;
  }

  /* ---------- motobomba centrífuga monobloco — Dancor CAM-W4C ½ cv (catálogo Dancor, pág. 1) ----------
     A 211 (carcaça + motor), B 55 (bocal de sucção à frente da carcaça), C 76 (eixo), D 170 (topo do recalque),
     E 137 (largura da carcaça), F 156 (pé), G 173,5 (topo da caixa de ligação), J 40 (recalque atrás da face).
     O EIXO segue a fórmula do conector de sucção (0,03 + Largura/2), que é da frente de traçado: com a Largura
     da ficha (156) ele fica 32 mm acima do C da ficha — anotado no doc. */
  function geoBomba(P, q) {
    var C = P.C, W = P.W, H = P.H, x0 = -C / 2, yc = 0.03 + W / 2, partes = [], N = q.N, k = C / 0.266;
    var ba = parte("base", "Pé", AZUL), vo = parte("voluta", "Carcaça em voluta e bocais", FERRO), mo = parte("motor", "Motor", AZUL), vt = parte("ventilador", "Tampa traseira", PRETO);
    var xf = x0 + 0.055 * k, ec = 0.06 * k, xm0 = xf + ec, xm1 = C / 2, rv = W * 0.44, rm = Math.min(W * 0.4, yc - 0.006), xp = (xm0 + xm1) / 2;
    /* pé central em chapa (base F × 100, alma até o motor) */
    caixaR(ba.m, { x0: xp - 0.05 * k, x1: xp + 0.05 * k, y0: 0, y1: 0.008, z0: -W / 2, z1: W / 2, r: 0.002, rad: 0.01 }, q);
    loft(ba.m, [anelRR(0.008, xp, 0, 0.04 * k, W * 0.36, 0.008, 2), anelRR(yc - rm * 0.8, xp, 0, 0.03 * k, W * 0.2, 0.008, 2)]);
    /* carcaça: disco com a voluta em caracol, 4 parafusos e o bocal de sucção no eixo */
    torno(vo.m, [[rv * 0.4, 0], [rv * 0.92, 0.004], [rv, 0.012], [rv, ec - 0.012], [rv * 0.92, ec - 0.004], [rv * 0.5, ec]], N, { c: [xf, yc, 0], eixo: [1, 0, 0] });
    var esp = [], ns = q.N > 20 ? 18 : 9, kk;
    for (kk = 0; kk <= ns; kk++) { var f = kk / ns, ph = Math.PI * 0.5 + f * Math.PI * 1.55, r = rv * (0.72 + 0.2 * f); esp.push([xf + ec * 0.45, yc + r * Math.cos(ph), r * Math.sin(ph)]); }
    var ult = esp[esp.length - 1];
    esp.push([xf + ec * 0.45, ult[1] + 0.012, ult[2] * 0.4], [xf + ec * 0.45, H - 0.05, 0]);
    tubo(vo.m, esp, rv * 0.2, Math.max(8, q.n - 2), { rc: 0, arco: q.arco, raio: function (i, n) { return rv * (0.1 + 0.14 * Math.min(1, i / (n * 0.8))); } });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (sg) { torno(vo.m, [[0.007, 0], [0.007, 0.008], [0, 0.009]], 6, { c: [xf, yc + sg[0] * rv * 0.72, sg[1] * rv * 0.72], eixo: [-1, 0, 0] }); });
    /* recalque: pescoço cônico até o topo (conector) e bocal de sucção na frente, no eixo (conector) */
    torno(vo.m, [[0.016, 0], [0.017, 0.02], [0.022, 0.034], [0.022, 0.05]], q.n + 4, { c: [xf + ec * 0.45, H - 0.05, 0], eixo: [0, 1, 0] });
    torno(vo.m, [[0.019, 0], [0.019, xf - x0 - 0.012], [0.023, xf - x0 - 0.01], [0.023, xf - x0]], q.n + 4, { c: [xf, yc, 0], eixo: [-1, 0, 0] });
    /* motor: cilindro liso com aberturas de ventilação, 4 tirantes e a caixa de ligação em cima */
    torno(mo.m, [[rm * 0.9, 0], [rm, 0.006], [rm, xm1 - xm0 - 0.03], [rm * 0.96, xm1 - xm0 - 0.012]], N, { c: [xm0, yc, 0], eixo: [1, 0, 0] });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (sg) { tubo(mo.m, [[xm0, yc + sg[0] * rm * 0.78, sg[1] * rm * 0.78], [xm1 - 0.004, yc + sg[0] * rm * 0.78, sg[1] * rm * 0.78]], 0.0035, 6, { rc: 0 }); });
    caixaR(mo.m, { x0: xm0 + (xm1 - xm0) * 0.2, x1: xm0 + (xm1 - xm0) * 0.72, y0: yc + rm * 0.7, y1: yc + rm + 0.03 * k, z0: -rm * 0.45, z1: rm * 0.45, r: 0.006, rad: 0.01 }, q);
    torno(vt.m, [[rm * 0.96, 0], [rm * 0.96, 0.014], [rm * 0.7, 0.02], [0, 0.021]], N, { c: [xm1 - 0.02, yc, 0], eixo: [1, 0, 0] });
    [0.25, 0.75].forEach(function (t) { caixaR(vt.m, { x0: xm0 + (xm1 - xm0) * t - 0.02, x1: xm0 + (xm1 - xm0) * t + 0.02, y0: yc - rm * 0.5, y1: yc - rm * 0.3, z0: rm * 0.96, z1: rm * 1.01, r: 0.002, rad: 0.004 }, { k: 1, kv: 1 }); });
    partes.push(ba, vo, mo, vt);
    return partes;
  }

  /* ---------- aquecedor a gás de passagem (origem = centro da face de baixo, na parede) ---------- */
  function geoAquecedor(P, q) {
    var W = P.W, H = P.H, Pp = P.P, partes = [], ga = parte("gabinete", "Gabinete", BRANCO), pa = parte("painel", "Painel e visor", PRETO), cn = parte("ligacoes", "Ligações e chaminé", LATAO, true);
    caixaR(ga.m, { x0: -W / 2, x1: W / 2, y0: 0, y1: H, z0: 0.004, z1: Pp, r: 0.012, rad: 0.03 }, q);
    caixaRz(pa.m, { x0: -W * 0.3, x1: W * 0.3, y0: H * 0.18, y1: H * 0.4, z0: Pp - 0.004, z1: Pp + 0.003, r: 0.002, rad: 0.012 }, q);
    torno(pa.m, [[0.016, 0], [0.016, 0.01], [0.012, 0.014]], q.n, { c: [W * 0.18, H * 0.29, Pp], eixo: [0, 0, 1] });
    torno(pa.m, [[0.016, 0], [0.016, 0.01], [0.012, 0.014]], q.n, { c: [-W * 0.18, H * 0.29, Pp], eixo: [0, 0, 1] });
    /* FRENTE H6: o aquecedor ELÉTRICO de passagem usa o mesmo corpo (P.ch = 0: sem a ligação de gás do meio nem a chaminé) */
    var semGas = P.ch != null && P.ch < 0.5;
    (semGas ? [W * 0.25, -W * 0.25] : [W * 0.25, 0, -W * 0.25]).forEach(function (x) { torno(cn.m, [[0.012, 0], [0.012, 0.05], [0.015, 0.052], [0.015, 0.062]], q.n, { c: [x, 0, Pp * 0.45], eixo: [0, -1, 0] }); });
    if (!semGas) torno(cn.m, [[0.034, 0], [0.034, 0.1]], q.n + 4, { c: [0, H, Pp * 0.5], eixo: [0, 1, 0] });
    partes.push(ga, pa, cn);
    return partes;
  }
  /* ---------- FRENTE H6: aquecedor de ACUMULAÇÃO (boiler) — cilindro do catálogo (Diâmetro × Altura; horizontal: × Comprimento).
     Origem = centro da face de baixo, rente à parede (o corpo sai D da parede, Z local). P.hz = 1 horizontal; P.gas = 1 a gás (chaminé
     e defletor no topo); P.vs = 1 válvula de segurança na entrada de água fria (o manual manda: entre o registro e o aquecedor), com
     altura P.vh abaixo do corpo; P.xa = posição X da entrada de água fria. Tampos abaulados e cintas: proporção de desenho. */
  /* ---------- N23 (23/10/2026): BASE DE APOIO da caixa d'água elevada — a forma (o js/hidbaseapoio.js dimensiona e escolhe as seções).
     4 pilares nos cantos; 2 vigas principais ao longo de X sobre os pilares; barrotes ao longo de Z sobre as vigas; tablado no topo;
     travessas a meia altura nas 4 faces e as diagonais em X (o contraventamento que o cálculo considera: pilar travado, K = 1).
     Origem = centro da base, no apoio; topo do tablado = H. P.met = 1: metálica (tubo quadrado, chapa xadrez); 0: madeira serrada. */
  function geoBaseCaixa(P, q) {
    var L = P.L, H = P.H, sp = P.sp, bv = P.bv, hv = P.hv, bb = P.bb, hb = P.hb, et = P.et, nb = Math.max(2, Math.round(P.nb || 0)), met = P.met > 0.5;
    var rr = met ? 0.002 : 0.0005, rad = met ? 0.004 : 0.0008;   /* quina: tubo dobrado x madeira serrada (desenho) */
    var es = parte("estrutura", met ? "Estrutura metálica (pilares, vigas, barrotes, travessas e diagonais)" : "Estrutura de madeira (pilares, vigas, barrotes, travessas e diagonais)", met ? "metal preto" : "madeira escura");
    var tb = parte("tablado", met ? "Chapa xadrez do tablado" : "Tablado de tábuas", met ? ESCURO : "madeira deck"), partes = [es, tb];
    var hP = Math.max(sp, H - et - hb - hv), a = L / 2 - sp / 2;   /* topo do pilar = fundo da viga */
    function bx(m, x0, x1, y0, y1, z0, z1) { caixaR(m, { x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1, r: rr, rad: rad }, q); }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { bx(es.m, s[0] * a - sp / 2, s[0] * a + sp / 2, 0, hP, s[1] * a - sp / 2, s[1] * a + sp / 2); });
    [-1, 1].forEach(function (s) { bx(es.m, -L / 2, L / 2, hP, hP + hv, s * a - bv / 2, s * a + bv / 2); });
    for (var i = 0; i < nb; i++) { var x = -L / 2 + bb / 2 + (L - bb) * i / (nb - 1); bx(es.m, x - bb / 2, x + bb / 2, hP + hv, hP + hv + hb, -L / 2, L / 2); }
    bx(tb.m, -L / 2, L / 2, H - et, H, -L / 2, L / 2);
    /* travessas a meia altura (entre as faces internas dos pilares) e diagonais do pé de um pilar ao alto do outro, nas 4 faces */
    var yt = hP / 2, ht = Math.min(sp, hv) * 0.8, bt = sp * 0.6, td = sp * 0.5, y0 = Math.min(0.05, hP * 0.1), y1 = hP - Math.min(0.05, hP * 0.1);
    function diag(x0, z0, ya, x1, z1, yb) { loft(es.m, [anelRR(ya, x0, z0, td / 2, td / 2, rad, q.k), anelRR(yb, x1, z1, td / 2, td / 2, rad, q.k)]); }
    var e = a - sp / 2 - td / 2;
    [-1, 1].forEach(function (s) {
      bx(es.m, -a + sp / 2, a - sp / 2, yt - ht / 2, yt + ht / 2, s * a - bt / 2, s * a + bt / 2);
      bx(es.m, s * a - bt / 2, s * a + bt / 2, yt - ht / 2, yt + ht / 2, -a + sp / 2, a - sp / 2);
      if (hP > 4 * td) { diag(-e, s * a, y0, e, s * a, y1); diag(e, s * a, y0, -e, s * a, y1); diag(s * a, -e, y0, s * a, e, y1); diag(s * a, e, y0, s * a, -e, y1); }
    });
    return partes;
  }
  function geoBoiler(P, q) {
    var D = P.D, R = D / 2, H = P.H, Lh = P.Lh > 0 ? P.Lh : D, hz = P.hz > 0.5, partes = [], N = q.N + 8;
    var co = parte("corpo", hz ? "Corpo do boiler (horizontal)" : "Corpo do boiler", BRANCO), ci = parte("cintas", "Cintas e tampos", CLARO), cn = parte("ligacoes", "Ligações", LATAO, true);
    var zc = R + 0.004, k = Math.min(R * 0.18, 0.06);
    if (!hz) {
      torno(co.m, [[0, 0], [R * 0.7, 0.004], [R * 0.96, k * 0.55], [R, k], [R, H - k], [R * 0.96, H - k * 0.55], [R * 0.7, H - 0.004], [0, H]], N, { c: [0, 0, zc] });
      [k, H - k].forEach(function (y) { torno(ci.m, [[R * 1.005, y - 0.012], [R * 1.012, y - 0.008], [R * 1.012, y + 0.008], [R * 1.005, y + 0.012]], N, { c: [0, 0, zc], fechado: true }); });
      if (P.gas > 0.5) {
        var cm = parte("chamine", "Defletor e saída da chaminé", ESCURO);
        torno(cm.m, [[R * 0.28, 0], [R * 0.32, 0.03], [R * 0.32, 0.08], [R * 0.2, 0.1], [R * 0.17, 0.1], [R * 0.17, 0.22]], q.n + 6, { c: [0, H, zc], eixo: [0, 1, 0] });
        partes.push(cm);
      }
    } else {
      torno(co.m, [[0, -Lh / 2], [R * 0.7, -Lh / 2 + 0.004], [R * 0.96, -Lh / 2 + k * 0.55], [R, -Lh / 2 + k], [R, Lh / 2 - k], [R * 0.96, Lh / 2 - k * 0.55], [R * 0.7, Lh / 2 - 0.004], [0, Lh / 2]], N, { c: [0, R, zc], eixo: [1, 0, 0] });
      [-Lh / 2 + k, Lh / 2 - k].forEach(function (x) { torno(ci.m, [[R * 1.005, x - 0.012], [R * 1.012, x - 0.008], [R * 1.012, x + 0.008], [R * 1.005, x + 0.012]], N, { c: [0, R, zc], eixo: [1, 0, 0], fechado: true }); });
      /* suportes de parede */
      [-Lh / 2 + Lh * 0.2, Lh / 2 - Lh * 0.2].forEach(function (x) { caixaR(ci.m, { x0: x - 0.02, x1: x + 0.02, y0: R * 0.2, y1: R * 1.8, z0: 0, z1: zc * 0.35, r: 0.003, rad: 0.006 }, q); });
    }
    /* as duas ligações de água (embaixo; a gás: em cima) */
    var xa = P.xa, yL = P.gas > 0.5 && !hz ? H : 0, sg = P.gas > 0.5 && !hz ? 1 : -1;
    [xa, -xa].forEach(function (x) { torno(cn.m, [[0.013, 0], [0.013, 0.03], [0.017, 0.032], [0.017, 0.045]], q.n, { c: [x, yL, zc], eixo: [0, sg, 0] }); });
    if (P.vs > 0.5 && P.vh > 0) {
      /* válvula de segurança (latão) e a saída de alívio voltada para a frente */
      var vs = parte("valvula-seguranca", "Válvula de segurança (entrada de água fria)", LATAO, true), vh = P.vh;
      torno(vs.m, [[0.016, 0], [0.016, vh * 0.3], [0.024, vh * 0.35], [0.024, vh * 0.75], [0.016, vh * 0.8], [0.016, vh]], q.n, { c: [xa, -vh, zc], eixo: [0, 1, 0] });
      torno(vs.m, [[0.01, 0], [0.01, 0.04]], q.n, { c: [xa, -vh * 0.55, zc], eixo: [0, 0, 1] });
      partes.push(vs);
    }
    partes.unshift(co, ci); partes.push(cn);
    return partes;
  }

  /* ================================================================ CLIMATIZAÇÃO */
  function geoHiwall(P, q) {
    var L = P.L, H = P.H, Pp = P.P, partes = [], co = parte("corpo", "Corpo", BRANCO), N = q.N + 8;
    var y0 = -H / 2, z0 = -Pp / 2, base = [[z0, y0 + 0.03], [z0, H / 2 - 0.02], [z0 + 0.02, H / 2], [Pp / 2 - 0.06, H / 2], [Pp / 2 - 0.012, H / 2 - 0.03], [Pp / 2, H * 0.1],
      [Pp / 2 - 0.006, y0 + H * 0.3], [Pp / 2 - 0.035, y0 + 0.03], [Pp / 2 - 0.09, y0], [z0 + 0.03, y0 + 0.004]];
    var perf = reamostrar(chaikin(base, 3), N);
    function anel(x, k) { return perf.map(function (p) { return [x, p[1] * k, p[0] * k + (1 - k) * 0.0]; }); }
    loft(co.m, [anel(-L / 2, 0.9), anel(-L / 2 + 0.004, 0.97), anel(-L / 2 + 0.015, 1), anel(L / 2 - 0.015, 1), anel(L / 2 - 0.004, 0.97), anel(L / 2, 0.9)]);
    partes.push(co);
    /* saída de ar (fenda escura) e a aleta direcional */
    var sa = parte("saida", "Saída de ar", PRETO), al = parte("aleta", "Aleta", BRANCO);
    caixaR(sa.m, { x0: -L * 0.44, x1: L * 0.44, y0: y0 + 0.002, y1: y0 + 0.012, z0: Pp / 2 - 0.1, z1: Pp / 2 - 0.035, r: 0.003, rad: 0.01 }, q);
    var pa = reamostrar(chaikin([[Pp / 2 - 0.095, y0 + 0.004], [Pp / 2 - 0.04, y0 - 0.006], [Pp / 2 - 0.035, y0 - 0.002], [Pp / 2 - 0.09, y0 + 0.008]], 2), 16);
    loft(al.m, [-L * 0.43, -L * 0.428, L * 0.428, L * 0.43].map(function (x, i) { var k = i === 0 || i === 3 ? 0.98 : 1; return pa.map(function (p) { return [x, p[1], p[0] * k]; }); }));
    partes.push(sa, al);
    var vi = parte("visor", "Visor", PRETO);
    caixaRz(vi.m, { x0: L * 0.3, x1: L * 0.38, y0: -H * 0.02, y1: H * 0.04, z0: Pp / 2 - 0.006, z1: Pp / 2 + 0.002, r: 0.002, rad: 0.006 }, q);
    partes.push(vi);
    return partes;
  }
  function geoCondensadora(P, q) {
    var L = P.L, H = P.H, Pp = P.P, partes = [], ga = parte("gabinete", "Gabinete", BRANCO), N = q.N;
    caixaR(ga.m, { x0: -L / 2, x1: L / 2 - 0.004, y0: -H / 2 + 0.03, y1: H / 2, z0: -Pp / 2 + 0.006, z1: Pp / 2 - 0.004, r: 0.008, rad: 0.018 }, q);
    partes.push(ga);
    var xf = -L * 0.12, R = Math.min(L * 0.36, H * 0.42), zf = Pp / 2 - 0.004;
    var ab = parte("abertura", "Abertura e hélice", PRETO), gr = parte("grade", "Grade do ventilador", ESCURO);
    torno(ab.m, [[R, 0], [R, 0.004], [0, 0.004]], N, { c: [xf, 0, zf - 0.003], eixo: [0, 0, 1] });
    torno(ab.m, [[R * 0.16, 0], [R * 0.16, 0.03], [0, 0.04]], q.n, { c: [xf, 0, zf - 0.05], eixo: [0, 0, 1] });
    for (var b = 0; b < 3; b++) {
      var a = TAU * b / 3, c = Math.cos(a), s = Math.sin(a), c2 = Math.cos(a + 0.9), s2 = Math.sin(a + 0.9);
      loft(ab.m, [[[xf + c * R * 0.15, s * R * 0.15, zf - 0.04], [xf + c2 * R * 0.15, s2 * R * 0.15, zf - 0.03], [xf + c2 * R * 0.15, s2 * R * 0.15, zf - 0.026], [xf + c * R * 0.15, s * R * 0.15, zf - 0.036]],
        [[xf + c * R * 0.88, s * R * 0.88, zf - 0.042], [xf + c2 * R * 0.88, s2 * R * 0.88, zf - 0.022], [xf + c2 * R * 0.88, s2 * R * 0.88, zf - 0.018], [xf + c * R * 0.88, s * R * 0.88, zf - 0.038]]]);
    }
    var nan = q.N > 20 ? 6 : 3;
    for (var i = 1; i <= nan; i++) { var rr = R * (0.18 + 0.82 * i / nan); torno(gr.m, [[rr - 0.004, 0], [rr, 0], [rr, 0.008], [rr - 0.004, 0.008]], N, { c: [xf, 0, zf], eixo: [0, 0, 1], fechado: true }); }
    for (var k = 0; k < 4; k++) { var ak = TAU * k / 4 + 0.4; tubo(gr.m, [[xf + Math.cos(ak) * R * 0.15, Math.sin(ak) * R * 0.15, zf + 0.005], [xf + Math.cos(ak) * R, Math.sin(ak) * R, zf + 0.005]], 0.003, 5, { rc: 0 }); }
    partes.push(ab, gr);
    /* tampa das válvulas (lado direito) e as válvulas de serviço nos conectores */
    var tv = parte("tampa-valvulas", "Tampa das válvulas", CLARO), vs = parte("valvulas", "Válvulas de serviço", LATAO, true);
    caixaR(tv.m, { x0: L / 2 - 0.006, x1: L / 2, y0: -H / 2 + 0.05, y1: -H / 2 + H * 0.55, z0: -Pp * 0.2, z1: Pp * 0.3, r: 0.002, rad: 0.01 }, q);
    [0, P.Af || 0.04].forEach(function (d, i) { torno(vs.m, [[0.011, 0], [0.011, 0.03], [0.014, 0.032], [0.014, 0.045]], q.n, { c: [L / 2 - 0.045, -H / 2 + H / 4 + d, 0], eixo: [1, 0, 0] }); });
    /* grade traseira (serpentina) e pés */
    var pe0 = parte("pes", "Pés", ESCURO);
    [-1, 1].forEach(function (s) { caixaR(pe0.m, { x0: s * L * 0.35 - 0.04, x1: s * L * 0.35 + 0.04, y0: -H / 2, y1: -H / 2 + 0.032, z0: -Pp / 2, z1: Pp / 2, r: 0.004, rad: 0.008 }, q); });
    var se = parte("serpentina", "Serpentina (traseira)", CLARO);
    var nl = q.N > 20 ? 14 : 6;
    for (var j = 0; j < nl; j++) { var y = -H / 2 + 0.06 + (H - 0.1) * j / (nl - 1); caixaR(se.m, { x0: -L / 2 + 0.03, x1: L / 2 - 0.08, y0: y, y1: y + 0.006, z0: -Pp / 2, z1: -Pp / 2 + 0.008, r: 0.001, rad: 0.002 }, { k: 1, kv: 0 }); }
    partes.push(tv, vs, pe0, se);
    return partes;
  }
  function geoCassete(P, q) {
    var L = P.L, H = P.H, Pp = P.P, partes = [], y0 = -H / 2, co = parte("corpo", "Corpo (acima do forro)", CLARO), pn = parte("painel", "Painel", BRANCO);
    caixaR(co.m, { x0: -L * 0.43, x1: L * 0.43, y0: y0 + 0.03, y1: H / 2, z0: -Pp * 0.43, z1: Pp * 0.43, r: 0.006, rad: 0.02 }, q);
    caixaR(pn.m, { x0: -L / 2, x1: L / 2, y0: y0, y1: y0 + 0.034, z0: -Pp / 2, z1: Pp / 2, r: 0.012, rad: 0.03 }, q);
    partes.push(co, pn);
    var fe = parte("saidas", "Saídas de ar", PRETO), al = parte("aletas", "Aletas", BRANCO), gr = parte("grade", "Grade de retorno", CLARO), li = parte("linhas", "Grade (frestas)", ESCURO);
    var a = L / 2 - 0.07, b = Pp / 2 - 0.07, w = 0.05, cmpr = 0.62, umaVia = L > Pp * 1.6;
    var saidas = umaVia ? [[0, Pp / 2 - 0.09, L * 0.8, 0.07]] : [[0, b, cmpr * L, w], [0, -b, cmpr * L, w], [a, 0, w, cmpr * Pp], [-a, 0, w, cmpr * Pp]];
    saidas.forEach(function (s) {
      caixaR(fe.m, { x0: s[0] - s[2] / 2, x1: s[0] + s[2] / 2, y0: y0 - 0.001, y1: y0 + 0.004, z0: s[1] - s[3] / 2, z1: s[1] + s[3] / 2, r: 0, rad: 0.01 }, { k: 2, kv: 0 });
      caixaR(al.m, { x0: s[0] - s[2] * 0.47, x1: s[0] + s[2] * 0.47, y0: y0 - 0.006, y1: y0 - 0.002, z0: s[1] - s[3] * 0.47, z1: s[1] + s[3] * 0.47, r: 0.001, rad: 0.008 }, { k: 2, kv: 1 });
    });
    var g = Math.min(L, Pp) * 0.26, gx = umaVia ? L * 0.4 : g, gz = umaVia ? Pp * 0.22 : g, gc = umaVia ? -Pp * 0.12 : 0;
    caixaR(gr.m, { x0: -gx, x1: gx, y0: y0 - 0.004, y1: y0 + 0.002, z0: gc - gz, z1: gc + gz, r: 0.002, rad: 0.012 }, q);
    var nl = q.N > 20 ? 12 : 5;
    for (var i = 0; i < nl; i++) { var z = gc - gz * 0.9 + gz * 1.8 * i / (nl - 1); caixaR(li.m, { x0: -gx * 0.9, x1: gx * 0.9, y0: y0 - 0.0052, y1: y0 - 0.0038, z0: z - 0.002, z1: z + 0.002, r: 0, rad: 0.001 }, { k: 1, kv: 0 }); }
    partes.push(fe, al, gr, li);
    return partes;
  }
  function geoPisoteto(P, q) {
    var L = P.L, H = P.H, Pp = P.P, co = parte("corpo", "Corpo", BRANCO), sa = parte("saida", "Saída de ar", PRETO), al = parte("aleta", "Aleta", BRANCO);
    caixaR(co.m, { x0: -L / 2, x1: L / 2, y0: -H / 2, y1: H / 2, z0: -Pp / 2, z1: Pp / 2, r: 0.03, rad: 0.04 }, q);
    caixaRz(sa.m, { x0: -L * 0.42, x1: L * 0.42, y0: -H * 0.4, y1: -H * 0.05, z0: Pp / 2 - 0.004, z1: Pp / 2 + 0.002, r: 0.002, rad: 0.012 }, q);
    caixaRz(al.m, { x0: -L * 0.41, x1: L * 0.41, y0: -H * 0.3, y1: -H * 0.16, z0: Pp / 2, z1: Pp / 2 + 0.008, r: 0.002, rad: 0.006 }, q);
    return [co, sa, al];
  }

  var GERADORES = {
    bacia_caixa: function (P, q) { return geoBacia(P, q, true); },
    bacia_valvula: function (P, q) { return geoBacia(P, q, false); },
    lavatorio: geoLavatorio, cuba: geoCuba, pia: geoPia, tanque: geoTanque, mictorio: geoMictorio,
    chuveiro: geoChuveiro, ducha_higienica: geoDucha, torneira: geoTorneira, misturador: geoMisturador, registro: geoRegistro,
    valvula_descarga: geoValvula, caixa_descarga_embutida: geoCaixaEmbutida, caixa_sifonada: geoCaixaSifonada, ralo: geoRalo, caixa_cil: geoCaixaCil,
    caixa_gordura: geoCaixaGordura, caixa_inspecao: geoCaixaInspecao, registro_tubo: geoRegistroTubo,
    reservatorio: geoReservatorio, bomba: geoBomba, aquecedor: geoAquecedor, boiler: geoBoiler, base_caixa: geoBaseCaixa,
    hiwall: geoHiwall, condensadora: geoCondensadora, cassete: geoCassete, pisoteto: geoPisoteto
  };
  /* ORÇAMENTO de triângulos do nível 0 (perto), por gerador — tools/test-hid-louca.js mede e reprova acima */
  var ORCAMENTO = {
    bacia_caixa: 4000, bacia_valvula: 3300, lavatorio: 4300, cuba: 2600, pia: 7000, tanque: 3300, mictorio: 1800,
    chuveiro: 1600, ducha_higienica: 1900, torneira: 1000, misturador: 1600, registro: 1250, valvula_descarga: 800, caixa_descarga_embutida: 1400,
    caixa_sifonada: 2300, ralo: 2200, caixa_cil: 2300, caixa_gordura: 3900, caixa_inspecao: 4000, registro_tubo: 4000, reservatorio: 3200, bomba: 6000, aquecedor: 1350, boiler: 2600, base_caixa: 9000,
    hiwall: 1400, condensadora: 4200, cassete: 2150, pisoteto: 1100
  };
  /* chaves de cota de tamanho (têm de ser > 0); OPCIONAIS: 0 = "use a proporção do desenho de referência" */
  var POSITIVAS = ["L", "C", "Hb", "Ht", "Pc", "W", "P", "Hc", "H", "D", "E", "Rc", "Ft", "Gt", "Cx", "Cz", "Dn", "DN"];
  var OPCIONAIS = { reservatorio: ["Hc"] };

  /* ------------------------------------------------------------- SAÍDA */
  function limpar(m) {
    var v = m.v, f = [], vol, k;
    for (k = 0; k < v.length; k++) v[k] = Math.round(v[k] * 1e6) / 1e6;
    for (k = 0; k + 2 < m.f.length; k += 3) {
      var i0 = m.f[k] * 3, i1 = m.f[k + 1] * 3, i2 = m.f[k + 2] * 3;
      var ux = v[i1] - v[i0], uy = v[i1 + 1] - v[i0 + 1], uz = v[i1 + 2] - v[i0 + 2], wx = v[i2] - v[i0], wy = v[i2 + 1] - v[i0 + 1], wz = v[i2 + 2] - v[i0 + 2];
      var cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * cx + cy * cy + cz * cz > 1e-22) f.push(m.f[k], m.f[k + 1], m.f[k + 2]);
    }
    m.f = f;
    vol = volumeFaces(m, 0);
    return vol;
  }
  /* gera as partes do aparelho. P = {chave: número}; o.nivel 0|1|2. → { ok, erros, partes:[{id,nome,material,acessorio,v,f,volume}] } */
  function gerar(nome, P, o) {
    var g = GERADORES[nome];
    if (!g) return { ok: false, erros: ["gerador de forma \"" + nome + "\" não existe"], partes: [] };
    var nv = NIVEIS[Math.max(0, Math.min(NIVEIS.length - 1, (o && o.nivel) || 0))], erros = [];
    Object.keys(P || {}).forEach(function (k) { if (typeof P[k] !== "number" || !isFinite(P[k])) erros.push("parâmetro " + k + " não é número"); });
    /* cota de tamanho tem de ser > 0 (a forma sairia do avesso ou sumiria calada) */
    Object.keys(P || {}).forEach(function (k) { if (POSITIVAS.indexOf(k) >= 0 && (OPCIONAIS[nome] || []).indexOf(k) < 0 && !(P[k] > 0)) erros.push("cota " + k + " ≤ 0 (" + P[k] + ")"); });
    if (erros.length) return { ok: false, erros: erros, partes: [] };
    var partes;
    try { partes = g(P, nv); } catch (e) { return { ok: false, erros: ["gerador \"" + nome + "\": " + e.message], partes: [] }; }
    var out = [];
    partes.forEach(function (p) {
      if (!p.m.f.length) return;
      var vol = limpar(p.m), bad = p.m.v.some(function (x) { return !isFinite(x); });
      if (bad) { erros.push("parte " + p.id + ": vértice não finito (cota fora do esperado?)"); return; }
      out.push({ id: p.id, nome: p.nome, material: p.material, acessorio: p.acessorio, v: p.m.v, f: p.m.f, volume: vol });
    });
    return { ok: !erros.length, erros: erros, partes: out };
  }
  function existe(nome) { return !!GERADORES[nome]; }
  function nomes() { return Object.keys(GERADORES); }

  /* hid:geometria-fim */
  var HidLouca = { gerar: gerar, existe: existe, nomes: nomes, ORCAMENTO: ORCAMENTO, NIVEIS: NIVEIS.length,
    /* ferramentas expostas para teste e para outras famílias */
    _f: { loft: loft, torno: torno, tubo: tubo, caixaR: caixaR, chaikin: chaikin, anelSup: anelSup, anelRR: anelRR, Malha: Malha, volume: function (m) { return volumeFaces(m, 0); } } };
  global.HidLouca = HidLouca;
  if (typeof module !== "undefined" && module.exports) module.exports = HidLouca;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

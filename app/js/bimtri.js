/* =====================================================================
 * bimtri.js — Interseção triângulo-a-triângulo 3D (motor PURO, Node-testável).
 * Refina o clash de envelope (AABB) do BIMClash: um par candidato só vira
 * conflito CONFIRMADO se algum triângulo real de A intersecta algum de B.
 *
 * Algoritmo: Möller, "A Fast Triangle-Triangle Intersection Test" (1997):
 *  1) rejeição rápida pelos planos (todos os vértices de T1 do mesmo lado
 *     do plano de T2 → sem interseção; idem invertido);
 *  2) caso geral: intervalos das duas arestas cruzantes projetados na linha
 *     de interseção dos planos — intervalos se sobrepõem → intersecta;
 *  3) caso coplanar: teste 2D no plano dominante (aresta×aresta + contenção).
 *
 * Convenção de tolerância: TOQUE não é penetração — distâncias |d| < EPS ao
 * plano contam como "no plano" e a sobreposição de intervalos exige folga
 * > EPS. Em modelos reais (metros) contato exato de faces não vira conflito.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EPS = 1e-9;

  function sub(r, a, b) { r[0] = a[0] - b[0]; r[1] = a[1] - b[1]; r[2] = a[2] - b[2]; return r; }
  function cross(r, a, b) { r[0] = a[1] * b[2] - a[2] * b[1]; r[1] = a[2] * b[0] - a[0] * b[2]; r[2] = a[0] * b[1] - a[1] * b[0]; return r; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // intervalos na linha de interseção dos planos (caso geral).
  // p* = projeções dos vértices na linha; d* = distâncias assinadas ao plano do OUTRO triângulo.
  // Devolve [t0,t1] ordenado, ou null se coplanar (todos d ~ 0).
  function intervalos(p0, p1, p2, d0, d1, d2) {
    var t0, t1;
    if (d0 * d1 > 0) { t0 = p2 + (p0 - p2) * d2 / (d2 - d0); t1 = p2 + (p1 - p2) * d2 / (d2 - d1); }
    else if (d0 * d2 > 0) { t0 = p1 + (p0 - p1) * d1 / (d1 - d0); t1 = p1 + (p2 - p1) * d1 / (d1 - d2); }
    else if (d1 * d2 > 0 || d0 !== 0) { t0 = p0 + (p1 - p0) * d0 / (d0 - d1); t1 = p0 + (p2 - p0) * d0 / (d0 - d2); }
    else if (d1 !== 0) { t0 = p1 + (p0 - p1) * d1 / (d1 - d0); t1 = p1 + (p2 - p1) * d1 / (d1 - d2); }
    else if (d2 !== 0) { t0 = p2 + (p0 - p2) * d2 / (d2 - d0); t1 = p2 + (p1 - p2) * d2 / (d2 - d1); }
    else return null; // coplanar
    return t0 <= t1 ? [t0, t1] : [t1, t0];
  }

  // ---------- caso coplanar: geometria 2D no plano dominante da normal ----------
  function seg2d(a, b, c, d) {
    // segmentos AB × CD (2D) — interseção PRÓPRIA ou colinear com sobreposição real
    var d1 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
    var d2 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
    var d3 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    var d4 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
    // colineares: checa sobreposição 1D com folga
    if (Math.abs(d1) <= EPS && Math.abs(d2) <= EPS && Math.abs(d3) <= EPS && Math.abs(d4) <= EPS) {
      var eixo = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
      var a0 = Math.min(a[eixo], b[eixo]), a1 = Math.max(a[eixo], b[eixo]);
      var c0 = Math.min(c[eixo], d[eixo]), c1 = Math.max(c[eixo], d[eixo]);
      return Math.min(a1, c1) - Math.max(a0, c0) > EPS;
    }
    return false;
  }
  function dentro2d(p, t0, t1, t2) {
    // p dentro do triângulo (2D, sinal consistente; borda NÃO conta — toque não é penetração)
    var s0 = (t1[0] - t0[0]) * (p[1] - t0[1]) - (t1[1] - t0[1]) * (p[0] - t0[0]);
    var s1 = (t2[0] - t1[0]) * (p[1] - t1[1]) - (t2[1] - t1[1]) * (p[0] - t1[0]);
    var s2 = (t0[0] - t2[0]) * (p[1] - t2[1]) - (t0[1] - t2[1]) * (p[0] - t2[0]);
    return (s0 > EPS && s1 > EPS && s2 > EPS) || (s0 < -EPS && s1 < -EPS && s2 < -EPS);
  }
  function coplanar(N, V0, V1, V2, U0, U1, U2) {
    // projeta no plano dominante da normal (descarta o eixo de maior |N|)
    var ax = Math.abs(N[0]), ay = Math.abs(N[1]), az = Math.abs(N[2]);
    var i0, i1;
    if (ax >= ay && ax >= az) { i0 = 1; i1 = 2; } else if (ay >= az) { i0 = 0; i1 = 2; } else { i0 = 0; i1 = 1; }
    var v = [[V0[i0], V0[i1]], [V1[i0], V1[i1]], [V2[i0], V2[i1]]];
    var u = [[U0[i0], U0[i1]], [U1[i0], U1[i1]], [U2[i0], U2[i1]]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      if (seg2d(v[i], v[(i + 1) % 3], u[j], u[(j + 1) % 3])) return true;
    }
    // um contém o outro (sem arestas se cruzando)
    if (dentro2d(v[0], u[0], u[1], u[2])) return true;
    if (dentro2d(u[0], v[0], v[1], v[2])) return true;
    return false;
  }

  // scratches (o motor é single-thread; evita alocar por chamada)
  var _e1 = [0, 0, 0], _e2 = [0, 0, 0], _n1 = [0, 0, 0], _n2 = [0, 0, 0], _dd = [0, 0, 0];

  var DEG2 = 1e-20; // |normal|² abaixo disto = triângulo degenerado (vértice duplicado/colinear) — sem interior, não penetra

  function triTri(V0, V1, V2, U0, U1, U2) {
    // plano de U: N2·x + d2 = 0
    sub(_e1, U1, U0); sub(_e2, U2, U0); cross(_n2, _e1, _e2);
    if (dot(_n2, _n2) < DEG2) return false; // U degenerado: dv=0,0,0 cairia no coplanar com N nula -> falso positivo
    var d2c = -dot(_n2, U0);
    var dv0 = dot(_n2, V0) + d2c, dv1 = dot(_n2, V1) + d2c, dv2 = dot(_n2, V2) + d2c;
    // toque no plano não conta (EPS relativo à escala da normal — coords em metros)
    var e2t = EPS * Math.max(1, Math.sqrt(dot(_n2, _n2)));
    if (Math.abs(dv0) < e2t) dv0 = 0; if (Math.abs(dv1) < e2t) dv1 = 0; if (Math.abs(dv2) < e2t) dv2 = 0;
    if (dv0 === 0 && dv1 === 0 && dv2 === 0) { // V inteiro no plano de U -> coplanares
      return coplanar(_n2, V0, V1, V2, U0, U1, U2);
    }
    // PENETRAÇÃO exige que V CRUZE o plano de U (vértices estritamente dos DOIS lados).
    // Só tocar/encostar (zeros + um lado) é CONTATO — face de alvenaria encostada em viga
    // não é conflito. É a diferença deliberada p/ o Möller clássico (interseção de conjunto).
    if (!((dv0 < 0 || dv1 < 0 || dv2 < 0) && (dv0 > 0 || dv1 > 0 || dv2 > 0))) return false;
    // plano de V
    sub(_e1, V1, V0); sub(_e2, V2, V0); cross(_n1, _e1, _e2);
    if (dot(_n1, _n1) < DEG2) return false; // V degenerado (simetria do guard acima)
    var d1c = -dot(_n1, V0);
    var du0 = dot(_n1, U0) + d1c, du1 = dot(_n1, U1) + d1c, du2 = dot(_n1, U2) + d1c;
    var e1t = EPS * Math.max(1, Math.sqrt(dot(_n1, _n1)));
    if (Math.abs(du0) < e1t) du0 = 0; if (Math.abs(du1) < e1t) du1 = 0; if (Math.abs(du2) < e1t) du2 = 0;
    if (du0 === 0 && du1 === 0 && du2 === 0) return coplanar(_n1, V0, V1, V2, U0, U1, U2);
    if (!((du0 < 0 || du1 < 0 || du2 < 0) && (du0 > 0 || du1 > 0 || du2 > 0))) return false;
    // direção da linha de interseção dos planos
    cross(_dd, _n1, _n2);
    // eixo dominante de D p/ projetar (evita computar a linha de verdade)
    var bx = Math.abs(_dd[0]), by = Math.abs(_dd[1]), bz = Math.abs(_dd[2]);
    var ix = 0; if (by > bx) { ix = 1; bx = by; } if (bz > bx) ix = 2;
    var iv = intervalos(V0[ix], V1[ix], V2[ix], dv0, dv1, dv2);
    var iu = intervalos(U0[ix], U1[ix], U2[ix], du0, du1, du2);
    if (iv === null || iu === null) return false; // não ocorre (ambos cruzam estritamente), por segurança
    return Math.min(iv[1], iu[1]) - Math.max(iv[0], iu[0]) > EPS; // sobreposição REAL (toque pontual fora)
  }

  // AABB de um triângulo (pra pré-filtro barato dentro do lote)
  function triBox(t, o) {
    var x0 = Math.min(t[o], t[o + 3], t[o + 6]), x1 = Math.max(t[o], t[o + 3], t[o + 6]);
    var y0 = Math.min(t[o + 1], t[o + 4], t[o + 7]), y1 = Math.max(t[o + 1], t[o + 4], t[o + 7]);
    var z0 = Math.min(t[o + 2], t[o + 5], t[o + 8]), z1 = Math.max(t[o + 2], t[o + 5], t[o + 8]);
    return [x0, y0, z0, x1, y1, z1];
  }

  // ---------- ponto-dentro-do-sólido (paridade de raio) ----------
  // Conta cruzamentos de um raio axial a partir de p com os triângulos (Möller–Trumbore).
  // Ímpar = dentro. Exige malha razoavelmente fechada (sólidos IFC tesselados costumam ser);
  // por robustez a raio raspando aresta/vértice, dentroVoto dispara nos 3 eixos e vota maioria.
  function cruzamentosEixo(px, py, pz, tris, eixo) {
    // Möller–Trumbore com dir=(1,0,0) no espaço PERMUTADO (i0 vira o eixo do raio):
    //   pvec = dir×e2 = (0, -e2z, e2y) → det = dot(e1,pvec) = e1z*e2y − e1y*e2z
    //   u = dot(tvec,pvec)/det = (tvz*e2y − tvy*e2z)/det
    //   qvec = tvec×e1 → v = dot(dir,qvec)/det = (tvy*e1z − tvz*e1y)/det
    //   tHit = dot(e2,qvec)/det
    var i0 = eixo, i1 = (eixo + 1) % 3, i2 = (eixo + 2) % 3;
    var o = [px, py, pz], ox = o[i0], oy = o[i1], oz = o[i2];
    var n = Math.floor(tris.length / 9), cont = 0;
    for (var t = 0; t < n; t++) {
      var b = t * 9;
      var ax = tris[b + i0], ay = tris[b + i1], az = tris[b + i2];
      var e1x = tris[b + 3 + i0] - ax, e1y = tris[b + 3 + i1] - ay, e1z = tris[b + 3 + i2] - az;
      var e2x = tris[b + 6 + i0] - ax, e2y = tris[b + 6 + i1] - ay, e2z = tris[b + 6 + i2] - az;
      var det = e1z * e2y - e1y * e2z;
      if (det > -1e-12 && det < 1e-12) continue; // raio paralelo ao plano do tri
      var inv = 1 / det;
      var tvx = ox - ax, tvy = oy - ay, tvz = oz - az;
      var u = (tvz * e2y - tvy * e2z) * inv;
      if (u < 0 || u > 1) continue;
      var v = (tvy * e1z - tvz * e1y) * inv;
      if (v < 0 || u + v > 1) continue;
      var tHit = (e2x * (tvy * e1z - tvz * e1y) + e2y * (tvz * e1x - tvx * e1z) + e2z * (tvx * e1y - tvy * e1x)) * inv;
      if (tHit > 1e-9) cont++;
    }
    return cont;
  }
  function dentroVoto(p, tris) {
    // jitter irracional perpendicular ao raio: sem ele, ponto alinhado com a DIAGONAL da face
    // triangulada conta o hit 2x (paridade errada) — caso clássico de cubo + ponto central
    var J1 = 1.2345678e-7, J2 = 2.3456789e-7, votos = 0;
    for (var eixo = 0; eixo < 3; eixo++) {
      var q = [p[0], p[1], p[2]];
      q[(eixo + 1) % 3] += J1; q[(eixo + 2) % 3] += J2;
      if (cruzamentosEixo(q[0], q[1], q[2], tris, eixo) % 2 === 1) votos++;
    }
    return votos >= 2;
  }

  var BIMTri = {
    EPS: EPS,
    triTri: triTri,
    dentroVoto: dentroVoto, // p [x,y,z] dentro do sólido (tris N*9)? — paridade de raio, voto 3 eixos
    // trisA/trisB: Float32Array|Array com N*9 floats (x,y,z × 3 vértices por triângulo).
    // Devolve { confirmado, testes } — para no PRIMEIRO par que intersecta.
    // maxTestes: teto honesto de pares tri×tri (não confirmável ≠ sem conflito).
    algumIntersecta: function (trisA, trisB, maxTestes) {
      var nA = Math.floor(trisA.length / 9), nB = Math.floor(trisB.length / 9);
      var cap = (maxTestes != null ? maxTestes : 2000000), testes = 0; // != null: cap 0 é válido (não cai no default)
      // o cap de TESTES só conta quem passa o pré-filtro AABB; o laço nA×nB em si também precisa
      // de teto (2 elementos densos e coplanares na zona = bilhões de comparações de caixa)
      var iterTotal = 0, CAP_ITER = 4000000;
      // pré-computa AABBs dos triângulos de B (o lado tipicamente menor vem filtrado do viewer)
      var boxB = new Array(nB);
      for (var j = 0; j < nB; j++) boxB[j] = triBox(trisB, j * 9);
      var A0 = [0, 0, 0], A1 = [0, 0, 0], A2 = [0, 0, 0], B0 = [0, 0, 0], B1 = [0, 0, 0], B2 = [0, 0, 0];
      for (var i = 0; i < nA; i++) {
        var oa = i * 9, ba = triBox(trisA, oa);
        A0[0] = trisA[oa]; A0[1] = trisA[oa + 1]; A0[2] = trisA[oa + 2];
        A1[0] = trisA[oa + 3]; A1[1] = trisA[oa + 4]; A1[2] = trisA[oa + 5];
        A2[0] = trisA[oa + 6]; A2[1] = trisA[oa + 7]; A2[2] = trisA[oa + 8];
        for (var k = 0; k < nB; k++) {
          if (++iterTotal > CAP_ITER) return { confirmado: false, testes: testes, estourou: true };
          var bb = boxB[k];
          if (ba[3] < bb[0] || bb[3] < ba[0] || ba[4] < bb[1] || bb[4] < ba[1] || ba[5] < bb[2] || bb[5] < ba[2]) continue;
          if (++testes > cap) return { confirmado: false, testes: testes - 1, estourou: true };
          var ob = k * 9;
          B0[0] = trisB[ob]; B0[1] = trisB[ob + 1]; B0[2] = trisB[ob + 2];
          B1[0] = trisB[ob + 3]; B1[1] = trisB[ob + 4]; B1[2] = trisB[ob + 5];
          B2[0] = trisB[ob + 6]; B2[1] = trisB[ob + 7]; B2[2] = trisB[ob + 8];
          if (triTri(A0, A1, A2, B0, B1, B2)) return { confirmado: true, testes: testes };
        }
      }
      return { confirmado: false, testes: testes };
    }
  };

  global.BIMTri = BIMTri;
  if (typeof module !== "undefined" && module.exports) module.exports = BIMTri;
})(typeof window !== "undefined" ? window : globalThis);

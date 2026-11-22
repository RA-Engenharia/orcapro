/* =====================================================================
 * madt3tumembros.js — ETAPA 1b da T3TU: MEMBROS (barras) do telhado de 4 águas em planta ORTOGONAL em L, T e U, no MESMO formato do `lGeometria` do madt3l.js
 * ({ id, g, p0, p1, nos, ... }, ponto = [X, Z da planta, altura]), para o cálculo 3D de barras (etapa 2) reaproveitar as saídas. Motor PURO, ES5, Node-testável.
 * NÃO está ligado ao fluxo de cálculo. O madt3l.js continua sendo o motor do L; aqui o L entra só como CONTROLE (os membros saem iguais; tools/test-mad-eng-tu.js).
 *
 * PLANTA CANÔNICA (quadro local; `canonizar` acha o quadro a partir do contorno, girando/espelhando): barra A = [0, a] × [0, b] ao longo de X (a LARGA) e até 2 PERNAS
 *   perna j = [x0_j, x0_j + w_j] × [b, c_j] ao longo de Z (w_j ≤ b). Perna ENCOSTADA numa ponta da barra (x0 = 0 ou x0 + w = a): a água da ponta da barra é COMUM à perna (como o L:
 *   caibro de meio CB + tirante MI + cumeeira da perna estendida sobre essa água). Perna solta (T): rincão nos DOIS lados, cumeeira da perna nasce no vértice V = (xc, b − w/2).
 *   L = 1 perna encostada · T = 1 perna solta · U = 2 pernas encostadas (os braços).
 * REGRAS (as do L, generalizadas): mesma inclinação e mesmo beiral; tesouras principais da barra só onde há parede nos DOIS lados (fora da boca das pernas, com assento >= 0,30 m do
 *   canto côncavo), tesouras de cada perna de z = b + assento até a ponta da cumeeira da perna; meias-tesouras nas cabeceiras LIVRES (pontas da barra sem perna e ponta das pernas);
 *   terças em k·dz de todas as águas, de espigão/rincão a espigão/rincão (as pontas saem da própria geometria das águas, `madt3tu.js`); frechal por lado do contorno; linhas
 *   longitudinais do banzo inferior (LB), contraventamento em X (DX, DV, DP). Onde o L tinha nome próprio por água (F, Q, L, W, I, N) aqui a água leva o id "A#" da geometria.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var TU = req("MadT3TU", "madt3tu.js"), TL = req("MadT3L", "madt3l.js"), U = TL._util, D = U.D, rd = U.rd, linspace = U.linspace, ext = U.ext, norm = U.norm, mescla = U.mescla, subdiv = U.subdiv, hyp = U.hyp, br = U.br;
  var EPS = 1e-6;

  var PAD = ext({}, TL.PADRAO); delete PAD.a; delete PAD.b; delete PAD.c; delete PAD.bb; PAD.nome = "Telhado de 4 águas em L/T/U";

  /* ----------------------------------------------------------------- parâmetros */
  function tuParametros(pp) {
    var q = mescla(PAD, pp || {}), be = q.beiral, a, b, legs;
    if (be && typeof be === "object") { var v = [be.frente, be.fundo, be.esq, be.dir].filter(function (x) { return x != null; }); if (!v.length) be = 0.8; else { if (v.some(function (x) { return Math.abs(x - v[0]) > 1e-9; })) throw new Error("madt3tu: o espigão e o rincão a 45° exigem o MESMO beiral em todos os lados (informado: " + v.join("; ") + ")"); be = v[0]; } }
    q.assento = Math.max(0.30, Number(q.assento) || 0); q.beiral = Number(be); a = q.a = Number(pp.a); b = q.b = Number(pp.b);
    legs = (pp.legs || []).map(function (L) { return { x0: Number(L.x0), w: Number(L.w), c: Number(L.c) }; }).sort(function (u, w) { return u.x0 - w.x0; });
    if (!(q.beiral >= 0 && q.beiral <= 2.5)) throw new Error("madt3tu: beiral fora de 0 a 2,5 m");
    if (!(q.incl > 0.05)) throw new Error("madt3tu: inclinação mínima de 5 % (telha)");
    if (!legs.length || legs.length > 2) throw new Error("madt3tu: a planta precisa de 1 ou 2 pernas (L, T ou U)");
    if (!(b >= 3)) throw new Error("madt3tu: vão mínimo de 3 m na barra");
    if (a < b + 0.5 - 1e-9) throw new Error("madt3tu: comprimento da barra a = " + br(a) + " m curto: exige a >= b + 0,5 m");
    legs.forEach(function (L, j) {
      L.flushL = L.x0 < 1e-6; L.flushR = Math.abs(L.x0 + L.w - a) < 1e-6; L.xl = L.x0; L.xr = L.x0 + L.w; L.xc = L.x0 + L.w / 2; L.zE = L.c - L.w / 2; L.zm = b + q.assento; L.igual = Math.abs(b - L.w) < 1e-6; L.j = j; L.sf = j === 0 ? "b" : "c"; L.asa = j === 0 ? "B" : "C";
      if (!(L.w >= 3)) throw new Error("madt3tu: vão mínimo de 3 m em cada perna");
      if (L.w > b + 1e-9) throw new Error("madt3tu: a barra (ao longo de X) é a LARGA: perna de " + br(L.w) + " m > barra de " + br(b) + " m; gire a planta");
      if (b - L.w > 1e-6 && b - L.w < 0.5) throw new Error("madt3tu: b − w = " + br(b - L.w) + " m (entre 0 e 0,5 m): use larguras IGUAIS ou afaste-as de pelo menos 0,5 m");
      if (L.c < b + q.assento + L.w / 2 - 1e-9) throw new Error("madt3tu: comprimento da perna c = " + br(L.c) + " m curto: exige c >= b + assento + w/2 = " + br(b + q.assento + L.w / 2) + " m");
      if (L.c - L.w / 2 - L.zm > 1e-6 && L.c - L.w / 2 - L.zm < 0.5) throw new Error("madt3tu: comprimento da perna c = " + br(L.c) + " m curto: a tesoura da boca e a da ponta ficariam a menos de 0,5 m (exige c >= " + br(b + q.assento + L.w / 2 + 0.5) + " m ou c = " + br(b + q.assento + L.w / 2) + " m)");
      if (L.xl < -1e-9 || L.xr > a + 1e-9) throw new Error("madt3tu: perna fora da barra");
      if (j > 0 && L.xl < legs[j - 1].xr + 1e-9) throw new Error("madt3tu: pernas sobrepostas");
    });
    if (legs.length === 2 && !(legs[0].flushL && legs[1].flushR)) throw new Error("madt3tu: duas pernas só são calculadas como U (uma em cada ponta da barra)");
    if (legs.length === 2) { var fenda = legs[1].xl - legs[0].xr; if (fenda < 2 * q.beiral + 0.5 - 1e-9) throw new Error("madt3tu: fenda do U de " + br(fenda) + " m entre os braços é estreita: com beiral de " + br(q.beiral) + " m exige fenda >= 2 x beiral + 0,5 = " + br(2 * q.beiral + 0.5) + " m (os beirais dos dois braços se encontram)"); }
    if (q.tesoura.tipo !== "pratt" && q.tesoura.tipo !== "howe") throw new Error("madt3tu: tesoura.tipo deve ser \"pratt\" ou \"howe\"");
    q.legs = legs; q._tu = true; q.planta = legs.length === 2 ? "U" : (legs[0].flushL || legs[0].flushR ? "L" : "T"); return q;
  }
  /** contorno [[x,z]...] a partir dos parâmetros canônicos */
  function contornoDe(p) {
    var a = p.a, b = p.b, perfil = [], x = 0, legs = p.legs;
    legs.forEach(function (L) { if (L.x0 > x + EPS) perfil.push([x, L.x0, b]); perfil.push([L.x0, L.x0 + L.w, L.c]); x = L.x0 + L.w; });
    if (x < a - EPS) perfil.push([x, a, b]);
    var P = [[0, 0], [a, 0]], k;
    for (k = perfil.length - 1; k >= 0; k--) { P.push([perfil[k][1], perfil[k][2]]); P.push([perfil[k][0], perfil[k][2]]); }
    var o = []; P.forEach(function (q) { var n = o.length; if (n && Math.abs(o[n - 1][0] - q[0]) < EPS && Math.abs(o[n - 1][1] - q[1]) < EPS) return; o.push(q); });
    var ok = true; while (ok) { ok = false; for (k = 0; k < o.length; k++) { var A = o[(k + o.length - 1) % o.length], B = o[k], C = o[(k + 1) % o.length]; if ((Math.abs(A[0] - B[0]) < EPS && Math.abs(B[0] - C[0]) < EPS) || (Math.abs(A[1] - B[1]) < EPS && Math.abs(B[1] - C[1]) < EPS)) { o.splice(k, 1); ok = true; break; } } }
    return o;
  }
  /** acha o quadro canônico (girando/espelhando) de um contorno ortogonal em L, T ou U. Devolve { ok, a, b, legs, quadro:{O,u,v} } ou { ok:false, motivo }. quadro: mundo = O + x·u + z·v */
  function canonizar(contorno) {
    var P0 = (contorno || []).map(function (q) { return [Number(q[0]), Number(q[1])]; }), n = P0.length, t, motivo = "o contorno não é uma barra com 1 ou 2 pernas (L, T ou U)";
    if (n < 6) return { ok: false, motivo: "contorno com menos de 6 vértices" };
    for (t = 0; t < 8; t++) {
      var rot = t % 4, esp = t >= 4, us = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot], vs = [[0, 1], [-1, 0], [0, -1], [1, 0]][rot];
      if (esp) vs = [-vs[0], -vs[1]];
      var Q = P0.map(function (q) { return [q[0] * us[0] + q[1] * us[1], q[0] * vs[0] + q[1] * vs[1]]; });
      var xm = Math.min.apply(null, Q.map(function (q) { return q[0]; })), zm = Math.min.apply(null, Q.map(function (q) { return q[1]; })); Q = Q.map(function (q) { return [q[0] - xm, q[1] - zm]; });
      var xs = Q.map(function (q) { return q[0]; }).sort(function (u, w) { return u - w; }).filter(function (v, k, A) { return !k || v - A[k - 1] > EPS; }), cols = [], ok = true;
      xs.forEach(function (x, k) {
        if (k + 1 >= xs.length) return; var xm2 = (x + xs[k + 1]) / 2, zl = [];
        Q.forEach(function (A, q) { var B = Q[(q + 1) % Q.length]; if (Math.abs(A[1] - B[1]) < EPS && Math.min(A[0], B[0]) < xm2 && Math.max(A[0], B[0]) > xm2) zl.push(A[1]); });
        zl.sort(function (u, w) { return u - w; }); if (zl.length !== 2 || Math.abs(zl[0]) > EPS) ok = false; else cols.push([x, xs[k + 1], zl[1]]);
      });
      if (!ok || !cols.length) continue;
      var a = xs[xs.length - 1], b = Math.min.apply(null, cols.map(function (c) { return c[2]; })), legs = [];
      cols.forEach(function (c) { if (c[2] > b + EPS) { var l = legs[legs.length - 1]; if (l && Math.abs(l.x0 + l.w - c[0]) < EPS && Math.abs(l.c - c[2]) < EPS) l.w += c[1] - c[0]; else legs.push({ x0: c[0], w: c[1] - c[0], c: c[2] }); } });
      if (!legs.length || legs.length > 2) continue;
      var rec = contornoDe({ a: a, b: b, legs: legs }); if (rec.length !== Q.length) continue;
      var casa = rec.every(function (r) { return Q.some(function (q) { return Math.abs(q[0] - r[0]) < 1e-4 && Math.abs(q[1] - r[1]) < 1e-4; }); }); if (!casa) continue;
      if (legs.some(function (L) { return L.w > b + 1e-6; })) { motivo = "a barra (ao longo de X) precisa ser a LARGA (perna mais larga que a barra)"; continue; }
      if (legs.length === 2 && !(legs[0].x0 < EPS && Math.abs(legs[1].x0 + legs[1].w - a) < EPS)) { motivo = "duas pernas só como U (uma em cada ponta da barra)"; continue; }
      /* mundo = O + x·u + z·v, com (x, z) = ((q·us) − xm, (q·vs) − zm)  ⇒  q = us·(x + xm) + vs·(z + zm) (us e vs são ortonormais) */
      return { ok: true, a: a, b: b, legs: legs, quadro: { O: [us[0] * xm + vs[0] * zm, us[1] * xm + vs[1] * zm], u: us, v: vs } };
    }
    return { ok: false, motivo: motivo };
  }

  /* ----------------------------------------------------------------- utilitários geométricos das águas */
  function dd(f, x, z) { return f[0] * x + f[1] * z + f[2]; }
  function recorta(poly, f) { var out = [], n = poly.length, k; for (k = 0; k < n; k++) { var p = poly[k], q = poly[(k + 1) % n], fp = dd(f, p[0], p[1]), fq = dd(f, q[0], q[1]), ip = fp <= 1e-12, iq = fq <= 1e-12; if (ip) out.push(p); if (ip !== iq) { var t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; }
  function areaP(P) { var s = 0, k; for (k = 0; k < P.length; k++) { var A = P[k], B = P[(k + 1) % P.length]; s += A[0] * B[1] - B[0] * A[1]; } return Math.abs(s / 2); }
  function areaFaixa(agua, f, lo, hi) {      /* área projetada da água entre os níveis lo <= d <= hi (d medido do beiral) */
    var s = 0; agua.pecas.forEach(function (pc) { var q = recorta(pc, [f[0], f[1], f[2] - hi]); if (q.length >= 3) q = recorta(q, [-f[0], -f[1], -f[2] + lo]); if (q.length >= 3) s += areaP(q); }); return s;
  }
  /* trechos da água sobre a linha d = dm (nível do plano) — fundidos; cada um { a:[x,z], b:[x,z] } em ordem crescente */
  function trechos(agua, f, dm) {
    var dirX = f[0] === 0, out = [];       /* plano com normal em z (f[1] != 0): a linha corre em X */
    agua.pecas.forEach(function (poly) {
      var pts = [], n = poly.length, k;
      for (k = 0; k < n; k++) {
        var A = poly[k], B = poly[(k + 1) % n], fa = dd(f, A[0], A[1]) - dm, fb = dd(f, B[0], B[1]) - dm;
        if (Math.abs(fa) < 1e-7) pts.push(A);
        if ((fa < -1e-7 && fb > 1e-7) || (fa > 1e-7 && fb < -1e-7)) { var t = fa / (fa - fb); pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      if (pts.length < 2) return;
      var ix = dirX ? 0 : 1; pts.sort(function (u, w) { return u[ix] - w[ix]; });
      var lo = pts[0], hi = pts[pts.length - 1]; if (hi[ix] - lo[ix] > 1e-6) out.push({ a: lo, b: hi, ix: ix });
    });
    out.sort(function (u, w) { return u.a[u.ix] - w.a[w.ix]; });
    var res = [];
    out.forEach(function (sg) { var l = res[res.length - 1]; if (l && sg.a[sg.ix] <= l.b[l.ix] + 1e-6) { if (sg.b[sg.ix] > l.b[l.ix]) l.b = sg.b; } else res.push({ a: sg.a, b: sg.b, ix: sg.ix }); });
    return res;
  }

  /* ----------------------------------------------------------------- MEMBROS */
  function geometriaMembros(pp) {
    var p = pp && pp._tu ? pp : tuParametros(pp), a = p.a, b = p.b, legs = p.legs, Hp = p.peDireito + p.baseZ, i = p.incl, sc = Math.sqrt(1 + i * i), e = p.beiral, cob = p.cobertura, tipE = e * sc, howe = p.tesoura.tipo === "howe", M = [], j, k;
    var poly = contornoDe(p), G = TU.geometria(poly, { incl: i, beiral: e, peDireito: p.peDireito, baseZ: p.baseZ }), P3 = function (x, z, y) { return [x, z, y]; };
    var nH = Math.max(2, Math.ceil((b / 2) * sc / cob.sTercaMax - 1e-9)), dz = (b / 2) / nH, lp = dz * sc, yD = function (d) { return Hp + i * d; };
    var dlA = [0]; for (k = 1; k <= nH; k++) dlA.push(k * dz);
    legs.forEach(function (L) {
      var kB = Math.ceil(L.w / 2 / dz - 1e-9) - 1; if (kB > 1 && L.w / 2 - kB * dz < 0.3 * dz) kB--; if (kB < 0) kB = 0; L.kB = kB;      /* braço estreito (w/2 <= dz): nenhuma terça intermediária; antes forçava kB=1 e a terça caía ALÉM da cumeeira (dl não monotônico) -> nós de DX/DV soltos = mecanismo. O L não passa por aqui */
      L.dl = [0]; for (k = 1; k <= kB; k++) L.dl.push(k * dz); L.dl.push(L.w / 2); L.nHB = L.dl.length - 1;
      L.zs = L.zE - L.zm < 1e-6 ? [L.zE] : linspace(L.zm, L.zE, Math.max(1, Math.ceil((L.zE - L.zm) / p.tesoura.sTes - 1e-9)) + 1);
      L.hB = yD(L.w / 2); L.V = P3(L.xc, b - L.w / 2, L.hB);
    });
    /* tesouras da barra: intervalos permitidos (parede dos dois lados + assento do canto côncavo) */
    var ivs = [[b / 2, a - b / 2]];
    legs.forEach(function (L) {
      if (L.flushL) ivs[0][0] = Math.max(ivs[0][0], L.xr + p.assento);
      else if (L.flushR) ivs[ivs.length - 1][1] = Math.min(ivs[ivs.length - 1][1], L.xl - p.assento);
    });
    legs.forEach(function (L) {
      if (L.flushL || L.flushR) return; var z0 = L.xl - p.assento, z1 = L.xr + p.assento, nv = [];
      ivs.forEach(function (iv) { if (z1 <= iv[0] || z0 >= iv[1]) { nv.push(iv); return; } if (iv[0] < z0 - 1e-9) nv.push([iv[0], z0]); if (iv[1] > z1 + 1e-9) nv.push([z1, iv[1]]); }); ivs = nv;
    });
    ivs = ivs.filter(function (iv) { return iv[1] >= iv[0] - 1e-9; });
    if (!ivs.length) throw new Error("madt3tu: a barra não tem posição para tesoura (pernas muito largas/próximas das pontas): aumente a barra");
    var grupos = ivs.map(function (iv) { return iv[1] - iv[0] < 1e-6 ? [iv[1]] : linspace(iv[0], iv[1], Math.max(1, Math.ceil((iv[1] - iv[0]) / p.tesoura.sTes - 1e-9)) + 1); });
    var xs = []; grupos.forEach(function (g) { xs = xs.concat(g); });
    var temFlushL = legs.some(function (L) { return L.flushL; }), temFlushR = legs.some(function (L) { return L.flushR; });
    var hA = yD(b / 2), ATOPw = P3(b / 2, b / 2, hA), ATOPe = P3(a - b / 2, b / 2, hA);
    var yTs = function (s, span) { return s < 0 ? Hp + i * s : (s > span ? Hp + i * (span - s) : Hp + i * Math.min(s, span - s)); };
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); if (o.nos) o.nos = o.nos.map(function (P) { return P.map(function (v) { return rd(v, 4); }); }); M.push(o); return o; }
    var planosTesoura = [];   /* planos das tesouras/meias: { o: "x"|"z", t, lat: [lo, hi] } (para os nós das terças) */

    /* ---------------- pilares: perímetro ---------------- */
    var n = G.contorno.length, EDGES = [];
    for (k = 0; k < n; k++) {
      var A = G.contorno[k], B = G.contorno[(k + 1) % n], hor = Math.abs(A[1] - B[1]) < EPS, nx = hor ? 0 : 0, face;
      var dx = B[0] - A[0], dzz = B[1] - A[1], ox = dzz, oz = -dx;         /* normal externa (contorno anti-horário) */
      face = hor ? (oz > 0 ? "direita" : "esquerda") : (ox > 0 ? "fundo" : "frente");
      var lo = hor ? Math.min(A[0], B[0]) : Math.min(A[1], B[1]), hi = hor ? Math.max(A[0], B[0]) : Math.max(A[1], B[1]), brk = [lo, hi], cz = A[1], cx = A[0];
      if (hor) {
        if (Math.abs(cz) < EPS || Math.abs(cz - b) < EPS) xs.forEach(function (x) { brk.push(x); });
        legs.forEach(function (L) { if (Math.abs(cz - L.c) < EPS) brk.push(L.xc); });
      } else {
        if (Math.abs(cx) < EPS || Math.abs(cx - a) < EPS) brk.push(b / 2);
        legs.forEach(function (L) { if (Math.abs(cx - L.xl) < EPS || Math.abs(cx - L.xr) < EPS) L.zs.forEach(function (z) { brk.push(z); }); });
      }
      var ordem = [], S;
      brk = brk.filter(function (v) { return v >= lo - 1e-9 && v <= hi + 1e-9; }).sort(function (u, w) { return u - w; }).filter(function (v, q, AA) { return !q || v - AA[q - 1] > 1e-6; });
      S = subdiv(brk, p.vMaxPilar);
      EDGES.push({ id: "E" + (k + 1), p0: hor ? [lo, cz] : [cx, lo], p1: hor ? [hi, cz] : [cx, hi], t: hor ? "x" : "z", face: face, S: S, k: k });
    }
    var pil = {}, ordemP = [];
    EDGES.forEach(function (E) {
      E.S.forEach(function (s, q) {
        var pt = E.t === "x" ? [s, E.p0[1]] : [E.p0[0], s], key = Math.round(pt[0] * 1e4) + "," + Math.round(pt[1] * 1e4), tr = ((q > 0 ? s - E.S[q - 1] : 0) + (q < E.S.length - 1 ? E.S[q + 1] - s : 0)) / 2;
        if (!pil[key]) { pil[key] = { pt: pt, partes: [], vertice: (q === 0 || q === E.S.length - 1), emX: false }; ordemP.push(key); }
        pil[key].partes.push([E.face, s, tr]); if (E.t === "x" || q === 0 || q === E.S.length - 1) pil[key].emX = true;
      });
    });
    var nP = 0, nO = 0;
    ordemP.forEach(function (key) { var o = pil[key], g = o.emX ? "P" : "PO"; add({ id: g + (g === "P" ? ++nP : ++nO), g: g, p0: P3(o.pt[0], o.pt[1], p.baseZ), p1: P3(o.pt[0], o.pt[1], Hp), partes: o.partes, pinJ: true }); });

    /* ---------------- tesouras principais ---------------- */
    function tesoura(asa, sf, pos, kk, span, dl, plano, Pt, ovS0, ovS1, ids) {
      var nHt = dl.length - 1, mid = span / 2, nosBI = [];
      for (j = 1; j < nHt; j++) nosBI.push(Pt(dl[j], Hp)); nosBI.push(Pt(mid, Hp)); for (j = nHt - 1; j >= 1; j--) nosBI.push(Pt(span - dl[j], Hp));
      add({ id: "BI" + sf + kk, g: "BI", tes: kk, asa: asa, plano: plano, p0: Pt(0, Hp), p1: Pt(span, Hp), nos: nosBI, pinI: true, pinJ: true });
      [[ids[0], -1, ovS0], [ids[1], 1, ovS1]].forEach(function (S) {
        var ag = S[0], sg = S[1], ov = S[2], sOf = function (jj) { return sg < 0 ? dl[jj] : span - dl[jj]; }, zt = ov ? (sg < 0 ? -tipE / sc : span + tipE / sc) : (sg < 0 ? 0 : span), nos = (ov && tipE > 0) ? [Pt(sg < 0 ? 0 : span, Hp)] : [];
        for (j = 1; j < nHt; j++) nos.push(Pt(sOf(j), yD(dl[j])));
        add({ id: "BS" + ag + sf + kk, g: "BS", tes: kk, asa: asa, plano: plano, agua: ag, p0: Pt(zt, ov ? yTs(zt, span) : Hp), p1: Pt(mid, yTs(mid, span)), nos: nos });
        for (j = 1; j <= nHt; j++) {
          if (j < nHt || sg < 0) add({ id: "PD" + ag + j + "_" + sf + kk, g: "PD", tes: kk, asa: asa, plano: plano, p0: Pt(sOf(j), Hp), p1: Pt(sOf(j), yD(dl[j])), pinI: true, pinJ: true });
          if (j >= 2) add({ id: "DG" + ag + j + "_" + sf + kk, g: "DG", tes: kk, asa: asa, plano: plano, agua: ag, p0: howe ? Pt(sOf(j - 1), yD(dl[j - 1])) : Pt(sOf(j - 1), Hp), p1: howe ? Pt(sOf(j), Hp) : Pt(sOf(j), yD(dl[j])), pinI: true, pinJ: true });
        }
      });
    }
    var nosN = function (x) { return legs.every(function (L) { return x >= L.xr + e - 1e-9 || x <= L.xl - e + 1e-9; }); };
    xs.forEach(function (x, kx) { tesoura("A", "", x, kx, b, dlA, "z", function (s, y) { return P3(x, s, y); }, true, nosN(x), ["F", "B"]); planosTesoura.push({ o: "x", t: x, lat: [-e - 1e-9, b + e + 1e-9] }); });
    legs.forEach(function (L) {
      L.zs.forEach(function (z, kz) { var ok2 = z >= b + e - 1e-9; tesoura(L.asa, L.sf, z, kz, L.w, L.dl, "x", function (s, y) { return P3(L.xl + s, z, y); }, L.flushL || ok2, L.flushR || ok2, ["W" + (L.j ? "2" : ""), "I" + (L.j ? "2" : "")]); planosTesoura.push({ o: "z", t: z, lat: [L.xl - e - 1e-9, L.xr + e + 1e-9] }); });
    });
    /* ---------------- meias-tesouras nas cabeceiras livres ---------------- */
    function meia(tag, agua, Pm, dl, plano) {
      var nHt = dl.length - 1, mid = dl[nHt], nosS = e > 0 ? [Pm(0, Hp)] : [];
      for (j = 1; j < nHt; j++) nosS.push(Pm(dl[j], yD(dl[j])));
      add({ id: "MS" + tag, g: "MS", plano: plano, agua: agua, pinJ: true, p0: Pm(-e, yD(-e)), p1: Pm(mid, yD(mid)), nos: nosS });
      var nosI = []; for (j = 1; j < nHt; j++) nosI.push(Pm(dl[j], Hp));
      add({ id: "MI" + tag, g: "MI", plano: plano, agua: agua, p0: Pm(0, Hp), p1: Pm(mid, Hp), nos: nosI, pinI: true, pinJ: true });
      for (j = 1; j < nHt; j++) add({ id: "MP" + tag + j, g: "MP", plano: plano, agua: agua, p0: Pm(dl[j], Hp), p1: Pm(dl[j], yD(dl[j])), pinI: true, pinJ: true });
      for (j = 2; j <= nHt; j++) add({ id: "MG" + tag + j, g: "MG", plano: plano, agua: agua, p0: howe ? Pm(dl[j - 1], yD(dl[j - 1])) : Pm(dl[j - 1], Hp), p1: howe ? Pm(dl[j], Hp) : Pm(dl[j], yD(dl[j])), pinI: true, pinJ: true });
    }
    if (!temFlushR) { meia("E", "E", function (u, y) { return P3(a - u, b / 2, y); }, dlA, "x"); planosTesoura.push({ o: "z", t: b / 2, lat: [a - b / 2 - 1e-9, a + e + 1e-9] }); }
    if (!temFlushL) { meia("W", "W", function (u, y) { return P3(u, b / 2, y); }, dlA, "x"); planosTesoura.push({ o: "z", t: b / 2, lat: [-e - 1e-9, b / 2 + 1e-9] }); }
    legs.forEach(function (L) { meia("N" + (L.j ? "2" : ""), "N", function (u, y) { return P3(L.xc, L.c - u, y); }, L.dl, "z"); planosTesoura.push({ o: "x", t: L.xc, lat: [L.c - L.w / 2 - 1e-9, L.c + e + 1e-9] }); });
    /* ---------------- caibro de meio (CB) + tirante (MI) nas pontas da barra encostadas a uma perna ---------------- */
    legs.forEach(function (L) {
      if (!L.flushL && !L.flushR) return;
      var west = L.flushL, sg = west ? 1 : -1, X = function (d) { return west ? d : a - d; }, top = west ? ATOPw : ATOPe, tag = west ? "W" : "E", grp = west ? grupos[0] : grupos[grupos.length - 1], xt = west ? grp[0] : grp[grp.length - 1];
      var cbNos = e > 0 ? [P3(X(0), b / 2, Hp)] : [], dW = []; for (k = 1; k < nH; k++) dW.push(k * dz);
      var dCB = dW.concat([L.w / 2]).filter(function (d, q, AA) { return AA.indexOf(d) === q; }).sort(function (u, w) { return u - w; }); dCB.forEach(function (d) { if (d > 1e-6 && d < b / 2 - 1e-6) cbNos.push(P3(X(d), b / 2, yD(d))); });
      add({ id: "CB" + tag, g: "CB", agua: tag, pinJ: true, p0: P3(X(-e), b / 2, yD(-e)), p1: top, nos: cbNos, pe: P3(X(0), b / 2, Hp) });
      var nosT = [], sLB = []; for (j = 1; j < 2 * L.nHB; j++) if (j !== L.nHB) sLB.push(j <= L.nHB ? L.dl[j] : L.w - L.dl[2 * L.nHB - j]);
      sLB.forEach(function (s) { var xx = L.xl + s; if (west ? xx < xt - 1e-6 : xx > xt + 1e-6) nosT.push(P3(xx, b / 2, Hp)); });
      add({ id: "MI" + tag, g: "MI", plano: "x", agua: tag, p0: P3(west ? 0 : a, b / 2, Hp), p1: P3(xt, b / 2, Hp), nos: nosT, pinI: true, pinJ: true });
      planosTesoura.push({ o: "z", t: b / 2, lat: west ? [-e - 1e-9, b / 2 + 1e-9] : [a - b / 2 - 1e-9, a + e + 1e-9] });
    });

    /* ---------------- espigões e rincões (das linhas da geometria das águas) ---------------- */
    var vertParede = G.contorno;
    function vertMaisPerto(pt) { var best = null, bd = 1e9; vertParede.forEach(function (v) { var d = Math.sqrt(Math.pow(v[0] - pt[0], 2) + Math.pow(v[1] - pt[1], 2)); if (d < bd) { bd = d; best = v; } }); return [best, bd]; }
    function viga(l, id, g) {
      var p0 = l.p0.slice(), p1 = l.p1.slice(); if (p1[2] < p0[2] - 1e-6) { var t = p0; p0 = p1; p1 = t; }
      var baixo = Math.abs(p0[2] - (Hp - i * e)) < 1e-6, vm = vertMaisPerto(p0), canto = null, tip = null, sx = 1, sz = 1;
      if (baixo && vm[1] < e * Math.SQRT2 + 1e-4) { canto = vm[0].slice(); tip = e > 0 ? P3(canto[0], canto[1], Hp) : null; }
      if (canto) { var ddx = g === "RC" ? p0[0] - canto[0] : canto[0] - p0[0], ddz = g === "RC" ? p0[1] - canto[1] : canto[1] - p0[1]; sx = ddx >= 0 ? 1 : -1; sz = ddz >= 0 ? 1 : -1; if (e === 0) { sx = p1[0] >= p0[0] ? (g === "RC" ? -1 : 1) : (g === "RC" ? 1 : -1); sz = p1[1] >= p0[1] ? (g === "RC" ? -1 : 1) : (g === "RC" ? 1 : -1); } }
      else { sx = p1[0] >= p0[0] ? 1 : -1; sz = p1[1] >= p0[1] ? 1 : -1; }
      var nos = tip ? [tip] : [];
      var o = { id: id, g: g, p0: p0, p1: p1, nos: nos, canto: canto, sx: sx, sz: sz, pinJ: true, tip: tip };
      if (g === "E" && !canto) o.interior = true; if (g === "RC") o.concavo = true; return add(o);
    }
    G.espigoes.forEach(function (l, q) { viga(l, "E" + (q + 1), "E"); });
    G.rincoes.forEach(function (l, q) { viga(l, "RC" + (q + 1), "RC"); });

    /* ---------------- águas: terças, frechal, cumeeiras ---------------- */
    var aguas = G.aguas, slDe = function (f) { return f[0] > 0 ? "W" : f[0] < 0 ? "E" : f[1] > 0 ? "F" : "B"; };
    var cumVis = G.cumeeiras.map(function (l) { return { a: [l.p0[0], l.p0[1]], b: [l.p1[0], l.p1[1]], planos: l.planos }; });
    aguas.forEach(function (w) {
      var f = G.planos[w.plano].f; w.f = f; w.sl = slDe(f); w.topo = 0;
      w.pecas.forEach(function (pc) { pc.forEach(function (q) { var d = dd(f, q[0], q[1]); if (d > w.topo) w.topo = d; }); }); w.topo -= e;
      w.ridges = [];     /* níveis (d do muro) das cumeeiras que tocam esta água */
      cumVis.forEach(function (c) {
        if (c.planos.indexOf(w.plano) < 0) return; var toca = false;
        w.pecas.forEach(function (pc) { var m = pc.length, q; for (q = 0; q < m; q++) { var ov = Math.sqrt(Math.pow(pc[(q + 1) % m][0] - pc[q][0], 2) + Math.pow(pc[(q + 1) % m][1] - pc[q][1], 2)); if (ov > 1e-6 && sobreSeg(pc[q], pc[(q + 1) % m], c.a, c.b) > 1e-6) toca = true; } });
        if (toca) { var lv = rd(dd(f, (c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2) - e, 5); if (w.ridges.indexOf(lv) < 0) w.ridges.push(lv); }
      });
    });
    function sobreSeg(a0, a1, b0, b1) { var dx = a1[0] - a0[0], dzz = a1[1] - a0[1], L = Math.sqrt(dx * dx + dzz * dzz); if (L < EPS) return 0; var ux = dx / L, uz = dzz / L; function pe2(P) { return Math.abs((P[0] - a0[0]) * uz - (P[1] - a0[1]) * ux); } if (pe2(b0) > 1e-6 || pe2(b1) > 1e-6) return 0; var t0 = (b0[0] - a0[0]) * ux + (b0[1] - a0[1]) * uz, t1 = (b1[0] - a0[0]) * ux + (b1[1] - a0[1]) * uz; return Math.max(0, Math.min(L, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1))); }
    var cmSeg = [], nFR = 0, nCM = 0;      /* cumeeiras = visíveis + trechos da linha do nível sobre a água comum */
    cumVis.forEach(function (c) { cmSeg.push({ a: c.a, b: c.b, planos: c.planos, faces: [] }); });
    aguas.forEach(function (w) {
      var f = w.f, topoRidge = w.ridges.some(function (r) { return Math.abs(r - w.topo) < 1e-6; });
      var dsL = (e > 0 ? [{ d: -e, nome: "tip" }] : []).concat([{ d: 0, nome: "fr" }]);
      for (k = 1; ; k++) {
        var d = k * dz; if (d >= w.topo - 1e-6) break;
        var okl = true; w.ridges.concat([w.topo]).forEach(function (r) { if (Math.abs(r - d) < 1e-6) okl = false; if (r - d > 1e-9 && r - d < 0.3 * dz - 1e-9 && k > 1) okl = false; });
        if (okl) dsL.push({ d: d, nome: "t" });
      }
      w.ridges.forEach(function (r) { if (r < w.topo - 1e-6) dsL.push({ d: r, nome: "cm" }); });
      dsL.sort(function (u, v) { return u.d - v.d; });
      var lastReal = dsL[dsL.length - 1].d, topLast = topoRidge ? lastReal + (w.topo - lastReal) / 2 : w.topo;
      if (Math.abs(lastReal - w.topo) < 1e-9) topLast = w.topo;
      dsL.forEach(function (fE, q) {
        var lo = q === 0 ? fE.d : (dsL[q - 1].d + fE.d) / 2, hi = q === dsL.length - 1 ? topLast : (fE.d + dsL[q + 1].d) / 2, arP = areaFaixa(w, f, lo + e, hi + e), ar = arP * sc, arIn = areaFaixa(w, f, e, hi + e) * sc;
        var segs = trechos(w, f, fE.d + e), y = fE.nome === "fr" ? Hp : yD(fE.d); if (fE.nome === "fr") w.frSegs = segs;
        if (fE.nome === "cm") { segs.forEach(function (sg) { cmSeg.push({ a: sg.a, b: sg.b, planos: [w.plano], faces: [], interno: true, w: w, ar: ar, nivel: fE.d }); }); return; }
        var Ltot = 0; segs.forEach(function (sg) { Ltot += Math.sqrt(Math.pow(sg.b[0] - sg.a[0], 2) + Math.pow(sg.b[1] - sg.a[1], 2)); }); if (!(Ltot > 0)) return;
        var ws = ar / Ltot, wsIn = fE.nome === "tip" ? 0 : (fE.nome === "fr" ? arIn / Ltot : ws);
        segs.forEach(function (sg, sq) {
          var A0 = P3(sg.a[0], sg.a[1], y), B0 = P3(sg.b[0], sg.b[1], y), m;
          if (fE.nome === "fr") m = add({ id: "FR" + (++nFR), g: "FR", pinI: true, pinJ: true, p0: A0, p1: B0, nos: [] });      /* como no L: o frechal NÃO leva aguaId (a pressão do telhado nele usa a regra "água indefinida": barra onde z <= b, envoltória com as pernas) */
          else {
            var sup = [], vert = f[0] !== 0, t0 = vert ? A0[1] : A0[0], t1 = vert ? B0[1] : B0[0];
            planosTesoura.forEach(function (pt) { if ((pt.o === "z") !== vert) return; var cst = vert ? A0[0] : A0[1]; if (cst < pt.lat[0] || cst > pt.lat[1]) return; if (pt.t > Math.min(t0, t1) + 1e-6 && pt.t < Math.max(t0, t1) - 1e-6) sup.push(vert ? P3(A0[0], pt.t, y) : P3(pt.t, A0[1], y)); });
            m = add({ id: "T" + w.id + "_" + (fE.nome === "tip" ? 0 : Math.round(fE.d / dz)) + (segs.length > 1 ? "_" + (sq + 1) : ""), g: "T", agua: w.sl, aguaId: w.id, p0: A0, p1: B0, nos: sup, artic: true, ends: true });
          }
          m.faces = [{ sl: w.sl, ws: ws, wsIn: wsIn }]; m.ws = ws; m.wp = ws / sc; m.d = fE.d; m.linha = fE.d;
        });
      });
      if (topoRidge) { var lr = dsL[dsL.length - 1].d, loR = lr + (w.topo - lr) / 2; w.faixaCumeeira = { ar: areaFaixa(w, f, loR + e, w.topo + e) * sc, lo: loR, hi: w.topo }; }
      w.dsL = dsL;
    });
    /* a que asas pertence cada água: as asas cuja PLANTA (barra [0,a]×[0,b]; perna [xl,xr]×[b,c]) contém trecho do frechal da água; água em 2 asas = comum (ponta da barra encostada a uma perna) */
    function sobreRet(sg, R0) { var x0 = Math.max(Math.min(sg.a[0], sg.b[0]), R0[0]), x1 = Math.min(Math.max(sg.a[0], sg.b[0]), R0[1]), z0 = Math.max(Math.min(sg.a[1], sg.b[1]), R0[2]), z1 = Math.min(Math.max(sg.a[1], sg.b[1]), R0[3]); return Math.max(0, x1 - x0) + Math.max(0, z1 - z0) > 1e-6 && (x1 - x0 >= -1e-9) && (z1 - z0 >= -1e-9) ? Math.max(0, x1 - x0) + Math.max(0, z1 - z0) : 0; }
    var plantas = [{ asa: "A", r: [0, a, 0, b] }].concat(legs.map(function (L) { return { asa: L.asa, r: [L.xl, L.xr, b, L.c] }; }));
    aguas.forEach(function (w) {
      w.asas = []; plantas.forEach(function (pl) { if ((w.frSegs || []).some(function (sg) { return sobreRet(sg, pl.r) > 1e-6; })) w.asas.push(pl.asa); }); if (!w.asas.length) w.asas = ["A"];
      w.cabeceira = (w.sl === "W" || w.sl === "E") && w.asas.indexOf("A") >= 0 && (w.frSegs || []).some(function (sg) { return Math.abs(sg.a[0] - sg.b[0]) < 1e-6 && (Math.abs(sg.a[0]) < 1e-6 || Math.abs(sg.a[0] - a) < 1e-6); });
    });
    /* funde os trechos de cumeeira colineares (visível + sobre a água comum) em membros CM */
    var CMs = [];
    cmSeg.forEach(function (sg) {
      var ix = Math.abs(sg.b[0] - sg.a[0]) > Math.abs(sg.b[1] - sg.a[1]) ? 0 : 1, oi = 1 - ix, s0 = Math.min(sg.a[ix], sg.b[ix]), s1 = Math.max(sg.a[ix], sg.b[ix]), cst = sg.a[oi], achou = null;
      CMs.forEach(function (c) { if (c.ix === ix && Math.abs(c.cst - cst) < 1e-4 && s0 <= c.s1 + 1e-6 && s1 >= c.s0 - 1e-6) achou = c; });
      if (achou) { achou.s0 = Math.min(achou.s0, s0); achou.s1 = Math.max(achou.s1, s1); achou.planos = achou.planos.concat(sg.planos); achou.itens.push(sg); }
      else CMs.push({ ix: ix, cst: cst, s0: s0, s1: s1, planos: sg.planos.slice(), itens: [sg] });
    });
    CMs.sort(function (u, v) { return u.ix - v.ix || u.cst - v.cst || u.s0 - v.s0; });
    CMs.forEach(function (c) {
      var pt = function (s) { return c.ix === 0 ? [s, c.cst] : [c.cst, s]; }, A0 = pt(c.s0), B0 = pt(c.s1), Lm = c.s1 - c.s0, nivel = rd(dd(G.planos[c.planos[0]].f, A0[0], A0[1]) - e, 5), y = yD(nivel), faces = [], ws = 0;
      aguas.forEach(function (w) {
        var toca = w.ridges.some(function (r) { return Math.abs(r - nivel) < 1e-4; }) && c.planos.indexOf(w.plano) >= 0 && w.pecas.some(function (pc) { var m = pc.length, q; for (q = 0; q < m; q++) if (sobreSeg(pc[q], pc[(q + 1) % m], A0, B0) > 1e-6) return true; return false; });
        if (!toca) return; var ar;
        if (Math.abs(w.topo - nivel) < 1e-6 && w.faixaCumeeira) ar = w.faixaCumeeira.ar;
        else { var q2 = w.dsL.filter(function (x) { return Math.abs(x.d - nivel) < 1e-6 && x.nome === "cm"; })[0], iq = w.dsL.indexOf(q2), lo = (w.dsL[iq - 1].d + nivel) / 2, hi = iq === w.dsL.length - 1 ? w.topo : (nivel + w.dsL[iq + 1].d) / 2; ar = areaFaixa(w, w.f, lo + e, hi + e) * sc; }
        faces.push({ sl: w.sl, ws: ar / Lm, wsIn: ar / Lm, aguaId: w.id }); ws += ar / Lm;
      });
      var nos = []; planosTesoura.forEach(function (ptn) { if ((ptn.o === "x") !== (c.ix === 0)) return; if (ptn.t >= c.s0 - 1e-6 && ptn.t <= c.s1 + 1e-6 && c.cst >= ptn.lat[0] - 1e-6 && c.cst <= ptn.lat[1] + 1e-6) nos.push(c.ix === 0 ? P3(ptn.t, c.cst, y) : P3(c.cst, ptn.t, y)); });
      add({ id: "CM" + (++nCM), g: "CM", agua: "R", p0: P3(A0[0], A0[1], y), p1: P3(B0[0], B0[1], y), nos: nos, faces: faces, artic: true, ends: true, ws: ws, wp: ws / sc, d: nivel, linha: nivel });
    });
    var nosCM = {}; M.forEach(function (m) { if (m.g === "CM") nosCM[m.id] = m; });

    /* ---------------- linhas longitudinais do banzo inferior (LB; articuladas) ---------------- */
    var xsMin = xs[0], xsMax = xs[xs.length - 1];
    for (j = 1; j < 2 * nH; j++) {
      var zj = j * dz, x0lb = temFlushL ? xsMin : 0, x1lb = temFlushR ? xsMax : a;
      if (j === nH) { if (xs.length >= 2) add({ id: "LB" + j, g: "LB", uni: true, asa: "A", p0: P3(xsMin, zj, Hp), p1: P3(xsMax, zj, Hp), nos: xs.slice(1, xs.length - 1).map(function (x) { return P3(x, zj, Hp); }), linha: zj }); }
      else add({ id: "LB" + j, g: "LB", uni: true, asa: "A", p0: P3(x0lb, zj, Hp), p1: P3(x1lb, zj, Hp), nos: xs.filter(function (x) { return x > x0lb + 1e-6 && x < x1lb + 1e-6 || (x1lb === xsMax && x === xsMax); }).map(function (x) { return P3(x, zj, Hp); }), linha: zj });
    }
    legs.forEach(function (L) {
      var flush = L.flushL || L.flushR, sj;
      for (j = 1; j < 2 * L.nHB; j++) {
        sj = j <= L.nHB ? L.dl[j] : L.w - L.dl[2 * L.nHB - j]; var xx = L.xl + sj;
        if (j === L.nHB) { if (L.zs.length >= 2) add({ id: "LB" + L.sf + j, g: "LB", uni: true, asa: L.asa, p0: P3(xx, L.zs[0], Hp), p1: P3(xx, L.zs[L.zs.length - 1], Hp), nos: L.zs.slice(1, L.zs.length - 1).map(function (z) { return P3(xx, z, Hp); }), linha: sj }); }
        else add({ id: "LB" + L.sf + j, g: "LB", uni: true, asa: L.asa, p0: P3(xx, flush ? 0 : L.zs[0], Hp), p1: P3(xx, L.c, Hp), nos: L.zs.map(function (z) { return P3(xx, z, Hp); }).concat(flush ? [P3(xx, b / 2, Hp)] : []), linha: sj });
      }
    });
    /* ---------------- contraventamento: diagonais em X (só tração) ---------------- */
    var fx = 0, fv = 0, MTp = D().MT.T2;
    function baiasDe(lista) { var o = []; lista.forEach(function (g) { for (k = 0; k < g.length - 1; k++) o.push([g[k], g[k + 1]]); }); return o; }
    function sel(baias) { return baias.length < 2 ? baias : MTp.baiasContraventadas(baias).map(function (ix) { return baias[ix]; }); }
    var selBar = []; grupos.forEach(function (g) { selBar = selBar.concat(sel(baiasDe([g]))); });      /* cada GRUPO de tesouras (fora da boca de uma perna solta) é contraventado por si: o X de um grupo não trava o outro */
    /* vãos travadas pelo X da boca da perna solta (T), calculadas antes do X de água */
    var bocaVao = {};
    legs.forEach(function (L) {
      if (L.flushL || L.flushR) return;
      grupos.forEach(function (g) { if (g.length < 2) return; var lado = g[g.length - 1] <= L.xl + 1e-6 ? "esq" : (g[0] >= L.xr - 1e-6 ? "dir" : null); if (!lado) return; bocaVao[(lado === "esq" ? g[g.length - 2] : g[0]) + "|" + (lado === "esq" ? g[g.length - 1] : g[1])] = 1; });
    });
    selBar.forEach(function (bay) {
      [["F", 0, 1], ["B", b, -1]].forEach(function (S) {
        var zl = [S[1]], jj; for (jj = 1; jj <= nH; jj++) zl.push(S[1] + S[2] * dlA[jj]);
        zl.slice(0, zl.length - 1).forEach(function (za, q) { var zb = zl[q + 1]; if (q === 0 && (bocaVao[bay[0] + "|" + bay[1]] || bocaVao[bay[1] + "|" + bay[0]])) return;      /* vão da BOCA: o painel de beiral do X de água (z = 0 até a 1ª linha) cruzaria o X da boca no mesmo nó do beiral (interpenetração); a boca já trava esse painel no plano do banzo inferior e o X de água segue nos demais */ [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (d2) { add({ id: "DX" + (++fx), g: "DX", agua: S[0], asa: "A", p0: P3(d2[0], za, yTs(za, b)), p1: P3(d2[1], zb, yTs(zb, b)), tracao: true, mad: true }); }); });
      });
      for (k = 1; k < 2 * nH; k++) { var zk = k * dz; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (d2) { add({ id: "DV" + (++fv), g: "DV", asa: "A", p0: P3(d2[0], zk, Hp), p1: P3(d2[1], zk, yTs(zk, b)), tracao: true, mad: true }); }); }
    });
    /* TRAVAMENTO NA BOCA DA PERNA SOLTA (T): o grupo de tesouras junto à abertura não tem tirante/meia-tesoura do lado da boca; as pontas internas dos grupos levam X no plano do banzo inferior (tração) até a tesoura vizinha do grupo, painel a painel entre as linhas do banzo (família do contraventamento DX, dimensionada pelo laço). O L não tem perna solta: não muda. */
    legs.forEach(function (L) {
      if (L.flushL || L.flushR) return;
      grupos.forEach(function (g) {
        if (g.length < 2) return; var lado = g[g.length - 1] <= L.xl + 1e-6 ? "esq" : (g[0] >= L.xr - 1e-6 ? "dir" : null); if (!lado) return;
        var xin = lado === "esq" ? g[g.length - 1] : g[0], xnb = lado === "esq" ? g[g.length - 2] : g[1], zl = [0], q3; for (q3 = 1; q3 < 2 * nH; q3++) zl.push(q3 * dz); zl.push(b);
        zl.slice(0, zl.length - 1).forEach(function (za, q2) { var zb = zl[q2 + 1]; [[xin, xnb], [xnb, xin]].forEach(function (d2) { add({ id: "DX" + (++fx), g: "DX", asa: "A", boca: true, p0: P3(d2[0], za, Hp), p1: P3(d2[1], zb, Hp), tracao: true, mad: true }); }); });
      });
    });
    legs.forEach(function (L) {
      sel(baiasDe([L.zs])).forEach(function (bay) {
        /* painel cujo X fica quase paralelo à terça (ângulo < 10° com ela: vão de terça muito mais longo que o painel) não leva X próprio — o X encostaria na terça (interpenetração); o último painel de cada água é então JUNTADO com o do outro lado, terça a terça através da cumeeira */
        var Lb = Math.abs(bay[1] - bay[0]), angP = function (xa, xb) { return Math.atan2(Math.sqrt(Math.pow(xb - xa, 2) + Math.pow(yTs(xb, L.w) - yTs(xa, L.w), 2)), Lb) * 180 / Math.PI; },
          xlW = [0], xlI = [L.w], jj2; for (jj2 = 1; jj2 <= L.nHB; jj2++) { xlW.push(L.dl[jj2]); xlI.push(L.w - L.dl[jj2]); }
        var curto = angP(xlW[L.nHB - 1], xlW[L.nHB]) < 10;
        [["W" + (L.j ? "2" : ""), xlW], ["I" + (L.j ? "2" : ""), xlI]].forEach(function (S) {
          var xl = S[1];
          xl.slice(0, xl.length - 1).forEach(function (xa, q) { var xb = xl[q + 1]; if (curto && q === xl.length - 2) return; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (d2) { add({ id: "DX" + (++fx), g: "DX", agua: S[0], asa: L.asa, p0: P3(L.xl + xa, d2[0], yTs(xa, L.w)), p1: P3(L.xl + xb, d2[1], yTs(xb, L.w)), tracao: true, mad: true }); }); });
        });
        if (curto) { var xj0 = xlW[L.nHB - 1], xj1 = xlI[L.nHB - 1]; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (d2) { add({ id: "DX" + (++fx), g: "DX", agua: "W" + (L.j ? "2" : ""), asa: L.asa, p0: P3(L.xl + xj0, d2[0], yTs(xj0, L.w)), p1: P3(L.xl + xj1, d2[1], yTs(xj1, L.w)), tracao: true, mad: true }); }); }
        for (k = 1; k < 2 * L.nHB; k++) { var sk = k <= L.nHB ? L.dl[k] : L.w - L.dl[2 * L.nHB - k]; [[bay[0], bay[1]], [bay[1], bay[0]]].forEach(function (d2) { add({ id: "DV" + (++fv), g: "DV", asa: L.asa, p0: P3(L.xl + sk, d2[0], Hp), p1: P3(L.xl + sk, d2[1], yTs(sk, L.w)), tracao: true, mad: true }); }); }
      });
    });
    var dpCurto = [];
    if (!p.vedacaoRigida) {
      var fxp = 0;
      EDGES.forEach(function (E) {
        var pares = TL.paineisDP(E.S); if (pares.curto) dpCurto.push(E.id);
        pares.forEach(function (pr) { [[pr[0], pr[1]], [pr[1], pr[0]]].forEach(function (e2) { fxp++; var A2 = E.t === "x" ? P3(e2[0], E.p0[1], p.baseZ) : P3(E.p0[0], e2[0], p.baseZ), B2 = E.t === "x" ? P3(e2[1], E.p0[1], Hp) : P3(E.p0[0], e2[1], Hp); add({ id: "DP" + fxp, g: "DP", p0: A2, p1: B2, tracao: true, mad: true }); }); });
      });
    }
    /* ---------------- nós implícitos (como no L) ---------------- */
    var pontas = []; M.forEach(function (m) { if (m.tracao) return; pontas.push(m.p0); pontas.push(m.p1); (m.nos || []).forEach(function (P) { pontas.push(P); }); });
    M.forEach(function (m) {
      if (!/^(FR|E|RC|CM|CB|MI|MS|T|LB)$/.test(m.g)) return;
      var d3 = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L2 = d3[0] * d3[0] + d3[1] * d3[1] + d3[2] * d3[2], vistos = {};
      (m.nos || []).concat([m.p0, m.p1]).forEach(function (P) { vistos[P.map(function (v) { return Math.round(v * 1e3); }).join(",")] = 1; });
      pontas.forEach(function (P) {
        var t = ((P[0] - m.p0[0]) * d3[0] + (P[1] - m.p0[1]) * d3[1] + (P[2] - m.p0[2]) * d3[2]) / L2; if (t < 1e-6 || t > 1 - 1e-6) return;
        var q = [m.p0[0] + d3[0] * t, m.p0[1] + d3[1] * t, m.p0[2] + d3[2] * t]; if (norm(q, P) > 2e-3) return; var key = P.map(function (v) { return Math.round(v * 1e3); }).join(","); if (vistos[key]) return; vistos[key] = 1; (m.nos = m.nos || []).push(P.slice());
      });
    });
    var info = { tipologia: "T3TU", planta: p.planta, tesouraTipo: howe ? "howe" : "pratt", xs: xs, grupos: grupos, nH: nH, dz: dz, lp: lp, sc: sc, Hp: Hp, a: a, b: b, incl: i, beiral: e, hA: hA, La: a - b, pir: false,
      pernas: legs.map(function (L) { return { j: L.j, asa: L.asa, xl: L.xl, xr: L.xr, xc: L.xc, w: L.w, c: L.c, zs: L.zs, dl: L.dl, nHB: L.nHB, kB: L.kB, hB: L.hB, V: L.V, zE: L.zE, flushL: L.flushL, flushR: L.flushR, igual: L.igual }; }),
      dlA: dlA, yT: function (z) { return yTs(z, b); }, yTs: yTs, cmax: Math.max.apply(null, legs.map(function (L) { return L.c; })), zsTotal: legs.reduce(function (s0, L) { return s0 + L.zs.length; }, 0),
      reflexos: (function () { var o = [], nn = G.contorno.length, q2; for (q2 = 0; q2 < nn; q2++) { var A0 = G.contorno[(q2 + nn - 1) % nn], B0 = G.contorno[q2], C0 = G.contorno[(q2 + 1) % nn]; if ((B0[0] - A0[0]) * (C0[1] - B0[1]) - (B0[1] - A0[1]) * (C0[0] - B0[0]) < 0) o.push([B0[0], B0[1]]); } return o; })(),
      assento: p.assento, dpCurto: dpCurto, edges: EDGES.map(function (E) { return { id: E.id, p0: E.p0, p1: E.p1, S: E.S, t: E.t }; }),
      areaTotal: G.areaInc, areaEsperada: G.areaIncEsperada, areaPlantaL: G.areaPlanta, aguas: aguas.map(function (w) { return { id: w.id, plano: w.plano, sl: w.sl, topo: w.topo, ridges: w.ridges, areaProj: w.areaProj, areaInc: w.areaInc, asas: w.asas, compartilhada: w.asas.length > 1, cabeceira: w.cabeceira }; }), avisos: G.avisos };
    return { p: p, membros: M, info: info, roof: G };
  }

  var MadT3TUMembros = { parametros: tuParametros, canonizar: canonizar, contornoDe: contornoDe, geometriaMembros: geometriaMembros, PADRAO: PAD };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3TUMembros;
  else global.MadT3TUMembros = MadT3TUMembros;
})(typeof window !== "undefined" ? window : this);

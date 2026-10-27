/* =====================================================================
 * arqcortes.js — CORTES E FACHADAS DAS PRANCHAS DE ARQUITETURA (motor PURO, ES5, sem DOM).
 *
 *   ArqCortes.escolherCortes(dados, depois)   → [{ letra: "A", eixo: "x", coord, u0, u1 }…]   a linha de cada corte (AA na horizontal, BB na vertical)
 *   ArqCortes.cortes(c)                       ARQ-07: os cortes AA e BB (níveis, pé-direito, cotas verticais, platibanda, telhado)
 *   ArqCortes.fachadas(c)                     ARQ-08: frontal, posterior e as duas laterais, com o muro
 *   ArqCortes.escolherEscala(...)             a maior escala (≤ 1:50, depois 1:75, 1:100…) em que o conjunto cabe na área
 *
 * CORTE: a linha do corte (horizontal em planta = AA, olhando para cima da planta; vertical = BB, olhando para a direita)
 *   corta as paredes, as lajes de piso, o telhado (pelas águas calculadas) e o forro; o que é a construir sai em vermelho
 *   com hachura e o existente em cinza, como na planta de demolir/construir (convenção de reforma). Os vãos que a linha
 *   atravessa abrem a parede entre o peitoril e a verga. Linhas VISTAS além do plano de corte ficam FORA desta versão.
 * FACHADA: vista de frente da edificação pelos quatro lados (frente = o lado da divisa mais ao sul, ou `idx.ladoFrente`),
 *   paredes, vãos, telhado e muros em ordem de profundidade; cotas de altura e níveis.
 * c = o mesmo contexto de js/arqplantas.js.
 * Teste: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function G() { return dep("ArqGeo", "./arqgeo.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  var VIVO = { existente: 1, novo: 1 };

  /* ------------------------------------------------------------ onde passam os cortes */
  function escolherCortes(dados, depois, forcar) {
    var g = G(), cx = dados.caixa, A = (depois || dados).ambientes || [], V = dados.vaos || [], cand;
    function pontua(eixo, coord) {
      var s = 0;
      A.forEach(function (a) { var b = a.bbox; if (!b) return; if (eixo === "x" ? (coord > b[1] + 0.2 && coord < b[3] - 0.2) : (coord > b[0] + 0.2 && coord < b[2] - 0.2)) s += 1; });
      V.forEach(function (v) { if (!VIVO[v.status]) return; if (Math.abs((eixo === "x" ? v.z : v.x) - coord) < v.largura / 2 - 0.05) s += 0.5; });
      /* o número da cota total e o texto do rótulo moram no centro: a linha foge deles */
      A.forEach(function (a) { var b = a.bbox; if (!b) return; var cc = eixo === "x" ? a.cz : a.cx; if (Math.abs(cc - coord) < 0.7) s -= 0.6; });
      if (Math.abs(coord - (eixo === "x" ? (cx[1] + cx[3]) / 2 : (cx[0] + cx[2]) / 2)) < 0.8) s -= 0.7;
      /* a linha passa por cima de mobiliário e louça? evita */
      (dados.moveis || []).forEach(function (m) { var b = g.bbox(m.pts); if (b && (eixo === "x" ? (coord > b[1] && coord < b[3]) : (coord > b[0] && coord < b[2]))) s -= 0.4; });
      return s;
    }
    function candidatos(eixo, lo, hi) {
      var passo = 0.05, c0 = lo + 0.3, c1 = hi - 0.3, cm = (lo + hi) / 2, L = [];
      for (var v = c0; v <= c1 + 1e-9; v += passo) L.push({ v: Math.round(v * 100) / 100, s: pontua(eixo, v) - Math.abs(v - cm) * 0.08 });
      if (!L.length) L.push({ v: cm, s: 0 });
      L.sort(function (a, b) { return b.s - a.s; });
      return L.slice(0, 80).map(function (q) { return q.v; });
    }
    var cA = candidatos("x", cx[1], cx[3]), cB = candidatos("z", cx[0], cx[2]);
    /* o projetista escolhe a linha do corte (opcoes.cortes = { A: z do corte AA, B: x do corte BB }): o exemplo passa os cortes pela escada e pela caixa d'água */
    /* a linha pedida primeiro; se a planta não deixa (texto no caminho), a mais próxima, até 25 cm para cada lado */
    function vizinhos(v) { var L = [Math.round(v * 100) / 100]; for (var k = 1; k <= 5; k++) L.push(Math.round((v + 0.05 * k) * 100) / 100, Math.round((v - 0.05 * k) * 100) / 100); return L; }
    if (forcar && forcar.A != null && isFinite(+forcar.A)) cA = vizinhos(+forcar.A).concat(cA);
    if (forcar && forcar.B != null && isFinite(+forcar.B)) cB = vizinhos(+forcar.B).concat(cB);
    return [
      { letra: "A", eixo: "x", coord: cA[0], cands: cA, u0: cx[0], u1: cx[2] },
      { letra: "B", eixo: "z", coord: cB[0], cands: cB, u0: cx[1], u1: cx[3] }
    ];
  }

  /* ------------------------------------------------------------ CORTE: o que a linha atravessa */
  function interv(ct, poly) {
    var g = G(), a, b, uA = ct.u0 - 1, uB = ct.u1 + 1;
    if (ct.eixo === "x") { a = [uA, ct.coord]; b = [uB, ct.coord]; } else { a = [ct.coord, uA]; b = [ct.coord, uB]; }
    return g.recortarSeg(a, b, poly).map(function (t) { return [uA + t[0] * (uB - uA), uA + t[1] * (uB - uA)]; }).filter(function (v) { return v[1] - v[0] > 0.004; });
  }
  function caixaVao(v, w) {
    var th = num(v.rotY, w.rotY), cs = Math.cos(th), sn = Math.sin(th), h = v.largura / 2, e2 = w.espessura / 2;
    function Q(a, b) { return [v.x + cs * a + sn * b, v.z - sn * a + cs * b]; }
    return [Q(-h, -e2), Q(h, -e2), Q(h, e2), Q(-h, e2)];
  }
  function modeloCorte(c, ct) {
    var d = c.dados, out = { paredes: [], lajes: [], telhado: [], forros: [], ambientes: [], niveis: {}, yMax: 0, yMin: 0 };
    var parPorId = {}; d.paredes.forEach(function (w) { parPorId[w.id] = w; });
    d.paredes.filter(function (w) { return VIVO[w.status]; }).forEach(function (w) {
      interv(ct, w.pts).forEach(function (iv) {
        var p = { u0: iv[0], u1: iv[1], yb: w.base, yt: w.topo, status: w.status, id: w.id, muro: w.muro, aberturas: [] };
        d.vaos.filter(function (v) { return VIVO[v.status] && v.parede === w.id; }).forEach(function (v) {
          interv(ct, caixaVao(v, w)).forEach(function (jv) {
            var u0 = Math.max(jv[0], iv[0]), u1 = Math.min(jv[1], iv[1]); if (u1 - u0 < 0.02) return;
            p.aberturas.push({ u0: u0, u1: u1, y0: w.base + v.peitoril, y1: w.base + v.peitoril + v.altura, tipo: v.tipo, cod: v.cod });
          });
        });
        out.paredes.push(p); out.yMax = Math.max(out.yMax, w.topo); out.yMin = Math.min(out.yMin, w.base);
      });
    });
    d.lajes.filter(function (l) { return VIVO[l.status]; }).forEach(function (l) {
      interv(ct, l.pts).forEach(function (iv) { out.lajes.push({ u0: iv[0], u1: iv[1], y0: l.topo - l.espessura, y1: l.topo, status: l.status, piso: l.piso }); out.yMin = Math.min(out.yMin, l.topo - l.espessura); });
    });
    arr(d.telhados).filter(function (t) { return VIVO[t.status]; }).forEach(function (t) {
      var esp = num(t.orig && t.orig.espessura, 0.08);
      arr(t.aguas).forEach(function (ag) {
        var pl = ag.plano || {};
        arr(ag.pecas).forEach(function (pc) {
          var poli = arr(pc.pts).map(function (q) { return [q.x, q.z]; }); if (poli.length < 3) return;
          interv(ct, poli).forEach(function (iv) {
            function Y(u) { var x = ct.eixo === "x" ? u : ct.coord, z = ct.eixo === "x" ? ct.coord : u; return num(pl.a, 0) + num(pl.bx, 0) * x + num(pl.bz, 0) * z; }
            var ya = Y(iv[0]), yb = Y(iv[1]), cosT = 1 / Math.sqrt(1 + Math.pow(num(pl.s, 0), 2));
            out.telhado.push({ u0: iv[0], u1: iv[1], ya: ya, yb: yb, esp: esp / cosT, status: t.status });
            out.yMax = Math.max(out.yMax, ya, yb); out.yMin = Math.min(out.yMin, Math.min(ya, yb) - esp);
          });
        });
      });
    });
    arr((c.depois || d).forros).filter(function (f) { return VIVO[f.status]; }).forEach(function (f) { interv(ct, f.pts).forEach(function (iv) { out.forros.push({ u0: iv[0], u1: iv[1], y: f.cota, tipo: f.tipo }); }); });
    /* FUNDAÇÃO (bloco, estaca, baldrame), vigas e pilares de concreto, madeira do telhado e da base da caixa, calha embutida, peças de aço (escada, gaiola,
       patamar, alçapão, abrigo), a caixa d'água e o deck: o que o plano de corte atravessa, cada um no seu material (25/10/2026, projeto exemplo) */
    out.pecas = [];
    function alarga(y0, y1) { out.yMin = Math.min(out.yMin, y0); out.yMax = Math.max(out.yMax, y1); }
    function cortar(pts, y0, y1, cls, status) { interv(ct, pts).forEach(function (iv) { out.pecas.push({ u0: iv[0], u1: iv[1], y0: y0, y1: y1, cls: cls, status: status || "novo" }); alarga(y0, y1); }); }
    function quadEm(x, z, h) { return [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]]; }
    arr(d.fundacoes).forEach(function (f) {
      cortar(f.pts, f.base, f.topo, "conc", f.status);
      arr(f.estacas).forEach(function (e) { if (f.ponta != null && f.dEstaca > 0) cortar(quadEm(e.x, e.z, f.dEstaca / 2), f.ponta, f.base, "conc", f.status); });
    });
    arr(d.vigas).forEach(function (v) { if (VIVO[v.status]) cortar(v.pts, v.base, v.topo, v.madeira ? "madeira" : "conc", v.status); });
    arr(d.pilares).forEach(function (p) { if (VIVO[p.status]) cortar(p.pts, p.base, p.topo, "conc", p.status); });
    arr(d.calhas).forEach(function (k) { cortar(k.pts, k.base, k.topo, "aco", k.status); });
    arr(d.moveis).forEach(function (m) {
      if (!VIVO[m.status] || !(m.h1 > m.h0)) return;
      if (m.famId === "hid-caixa-dagua") cortar(m.pts, m.h0, m.h1, "agua", m.status);
      else if (m.famId === "ra-pais-deck") cortar(m.pts, m.h0, m.h1, "madeira", m.status);
    });
    arr(d.metais).forEach(function (m) {
      if (!VIVO[m.status]) return;
      if (m.chapa) { cortar(m.pts, m.base, m.topo, "aco", m.status); return; }
      var ez = ct.eixo === "x", a = m.a, b = m.b, hb = m.sb / 2, ha = m.sa / 2;
      function nn(p) { return ez ? p[2] - ct.coord : p[0] - ct.coord; }
      function uu(p) { return ez ? p[0] : p[2]; }
      var na = nn(a), nb = nn(b), ua = uu(a), ub = uu(b), dy = b[1] - a[1], du = ub - ua;
      if (Math.abs(na) <= hb + 1e-6 && Math.abs(nb) <= hb + 1e-6) {
        /* a barra está NO plano do corte (a viga do pórtico, o montante): corta no comprimento todo */
        var steep = Math.abs(dy) > Math.abs(du), P;
        if (steep) P = [[Math.min(ua, ub) - hb, Math.min(a[1], b[1])], [Math.max(ua, ub) + hb, Math.min(a[1], b[1])], [Math.max(ua, ub) + hb, Math.max(a[1], b[1])], [Math.min(ua, ub) - hb, Math.max(a[1], b[1])]];
        else P = [[ua, a[1] - ha], [ub, b[1] - ha], [ub, b[1] + ha], [ua, a[1] + ha]];
        out.pecas.push({ poli: P, cls: "aco", status: m.status }); alarga(Math.min(a[1], b[1]) - ha, Math.max(a[1], b[1]) + ha);
      } else if (na * nb < 0 || Math.abs(na) <= hb || Math.abs(nb) <= hb) {
        /* a barra atravessa o plano (o degrau, o arco da gaiola, a terça): o corte dela é a seção do perfil */
        var t = Math.abs(na - nb) < 1e-9 ? 0 : na / (na - nb); t = Math.max(0, Math.min(1, t));
        var cu = ua + (ub - ua) * t, cy = a[1] + dy * t, hh = Math.max(hb, 0.006);
        out.pecas.push({ u0: cu - hh, u1: cu + hh, y0: cy - hh, y1: cy + hh, cls: "aco", status: m.status }); alarga(cy - hh, cy + hh);
      }
    });
    arr((c.depois || d).ambientes).forEach(function (a) {
      interv(ct, a.pts).forEach(function (iv) { out.ambientes.push({ u0: iv[0], u1: iv[1], nome: a.nome, base: a.base, pe: a.pe }); });
    });
    return out;
  }

  /* ------------------------------------------------------------ desenho de UM corte numa janela (x, y) do papel */
  function desenharCorte(c, ct, mc, X, Yb, k) {
    var D = c.D, d = DS(), g = G(), C = d.conv();
    function U(u) { return X + (u - ct.u0) * k; }
    function Y(y) { return Yb - (y - mc.yMin) * k; }
    function R(u0, y0, u1, y1) { return [[U(u0), Y(y1)], [U(u1), Y(y1)], [U(u1), Y(y0)], [U(u0), Y(y0)]]; }
    var cam = { novo: "ARQ-PAREDE-NOVO", existente: "ARQ-PAREDE-EXISTENTE" }, fill = { novo: C.novo.fill, existente: C.existente.fill };
    /* terreno: linha do piso térreo e hachura abaixo */
    var uL = ct.u0 - 0.9, uR = ct.u1 + 0.9;
    D.linha(U(uL), Y(0), U(uR), Y(0), "ARQ-TERRENO");
    for (var xx = U(uL); xx < U(uR); xx += 2.2) D.linha(xx, Y(0), xx - 1.6, Y(0) + 1.6, "ARQ-HACHURA");
    /* lajes, depois paredes (poché com a convenção) */
    function poche(P, st) {
      d.fundoPol(D, P, fill[st] || "#bdbdbd");
      D._cam = cam[st]; D.traco(P, true); D._cam = null;
      D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, cam[st] || "ARQ-PAREDE", 1) + "/>");
      if (st === "novo") g.hachuraLinhas(P, 1.6, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA-NOVO"); });
    }
    mc.lajes.forEach(function (l) { poche(R(l.u0, l.y0, l.u1, l.y1), l.status); });
    mc.paredes.forEach(function (p) {
      poche(R(p.u0, p.yb, p.u1, p.yt), p.status);
      p.aberturas.forEach(function (a) {
        var P = R(a.u0, a.y0, a.u1, a.y1);
        d.fundoPol(D, P, "#fff");
        D.linha(P[0][0], P[0][1], P[1][0], P[1][1], "ARQ-VAO"); D.linha(P[3][0], P[3][1], P[2][0], P[2][1], "ARQ-VAO");
        if (a.tipo === "janela") { var ym = (Y(a.y0) + Y(a.y1)) / 2; D.linha(P[0][0], ym, P[1][0], ym, "ARQ-ARCO"); }
      });
    });
    /* fundação, concreto, madeira, aço, caixa d'água: cada material com o seu preenchimento (concreto novo com a hachura da convenção) */
    var FILL = { madeira: "#e4cfae", aco: "#9fb0c0", agua: "#cfe3f3" };
    arr(mc.pecas).forEach(function (p) {
      var P = p.poli ? p.poli.map(function (q) { return [U(q[0]), Y(q[1])]; }) : R(p.u0, p.y0, p.u1, p.y1);
      if (p.cls === "conc") { poche(P, p.status === "existente" ? "existente" : "novo"); return; }
      d.fundoPol(D, P, FILL[p.cls] || "#bdbdbd");
      D._cam = "ARQ-VAO"; D.traco(P, true); D._cam = null;
      D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, "ARQ-VAO", 1) + "/>");
    });
    /* telhado: a face de cima grossa e a de baixo fina */
    mc.telhado.forEach(function (t) {
      var P = [[U(t.u0), Y(t.ya)], [U(t.u1), Y(t.yb)], [U(t.u1), Y(t.yb - t.esp)], [U(t.u0), Y(t.ya - t.esp)]];
      d.fundoPol(D, P, "#d8c2a6");
      D.linha(P[0][0], P[0][1], P[1][0], P[1][1], "ARQ-TELHADO"); D.linha(P[3][0], P[3][1], P[2][0], P[2][1], "ARQ-FINA");
      D.linha(P[0][0], P[0][1], P[3][0], P[3][1], "ARQ-FINA"); D.linha(P[1][0], P[1][1], P[2][0], P[2][1], "ARQ-FINA");
    });
    /* forro */
    mc.forros.forEach(function (f) { D.linha(U(f.u0), Y(f.y), U(f.u1), Y(f.y), "ARQ-FORRO-DET"); D.linha(U(f.u0), Y(f.y) - 0.5, U(f.u1), Y(f.y) - 0.5, "ARQ-FORRO-DET"); });
    return { U: U, Y: Y };
  }
  function cotasCorte(c, ct, mc, F, k) {
    var D = c.D, d = DS(), ys = [0], X0 = F.U(ct.u0) - 16;
    mc.forros.forEach(function (f) { ys.push(f.y); });
    mc.paredes.forEach(function (p) { if (!p.muro) ys.push(p.yt); });
    mc.telhado.forEach(function (t) { ys.push(Math.max(t.ya, t.yb)); });
    var vs = ys.sort(function (a, b) { return a - b; }).filter(function (y, i, A) { return i === 0 || y - A[i - 1] > 0.02; });
    if (vs.length >= 2) {
      var P = vs.map(function (y) { return [X0, F.Y(y)]; }), vals = []; for (var i = 0; i + 1 < vs.length; i++) vals.push(d.cotaTxt(vs[i + 1] - vs[i]));
      D.cadeia(P, 0, vals, { offs: [4.5], desde: P.map(function () { return false; }), semExt: true });
      /* a altura total */
      D.cota(X0 - d.S.entreCadeias(D.escCota), F.Y(vs[0]), X0 - d.S.entreCadeias(D.escCota), F.Y(vs[vs.length - 1]), 0, d.cotaTxt(vs[vs.length - 1] - vs[0]), { desde: [false, false], semExt: true });
    }
    /* cadeia horizontal em baixo: as faces das paredes e das aberturas ao longo da linha do corte */
    var us = [ct.u0]; mc.paredes.forEach(function (p) { us.push(p.u0, p.u1); }); us.push(ct.u1);
    us = us.sort(function (a, b) { return a - b; }).filter(function (u, i, A) { return i === 0 || u - A[i - 1] > 0.02; });
    if (us.length >= 2) {
      var yL = F.Y(mc.yMin) + 11, Q = us.map(function (u) { return [F.U(u), yL]; }), vv = []; for (var j = 0; j + 1 < us.length; j++) vv.push(d.cotaTxt(us[j + 1] - us[j]));
      D.cadeia(Q, 0, vv, { offs: [-4.5], desde: Q.map(function () { return false; }), semExt: true });
    }
  }
  /* os símbolos de nível numa coluna à direita; o que fica a menos de 5,6 mm de outro vai para a coluna ao lado (nada se perde nem se sobrepõe) */
  function colocarNiveis(D, xr, lista, F) {
    var cols = [[]], d = DS();
    lista.sort(function (a, b) { return b.y - a.y; });
    lista.forEach(function (n) {
      var yy = F.Y(n.y), k = 0;
      while (k < 4) { cols[k] = cols[k] || []; if (!cols[k].some(function (v) { return Math.abs(v - yy) < 5.6; })) break; k++; }
      cols[k] = cols[k] || []; cols[k].push(yy); D.nivel(xr + k * 40, yy, n.t, 1);
    });
    void d;
  }
  /* telhado de UMA água não tem cumeeira: o ponto mais alto é a borda alta da água (o revisor, 25/10/2026: "cumeeira" num telhado inclinado para um lado só) */
  function cumeeiraReal(c) { return arr((c.dados || {}).telhados).some(function (t) { return num(t.cumeeira, 0) > 0.05; }); }
  function niveisCorte(c, ct, mc, F) {
    var D = c.D, d = DS(), xr = F.U(ct.u1) + 16, lista = [{ y: 0, t: "±0,00" }];
    var topo = Math.max.apply(null, [0].concat(mc.paredes.filter(function (p) { return !p.muro; }).map(function (p) { return p.yt; })));
    var cum = Math.max.apply(null, [-9].concat(mc.telhado.map(function (t) { return Math.max(t.ya, t.yb); })));
    var fv = {}; mc.forros.forEach(function (f) { if (!fv[f.y]) { fv[f.y] = 1; lista.push({ y: f.y, t: d.nivelTxt(f.y) + " forro" }); } });
    if (topo > 0.1) lista.push({ y: topo, t: d.nivelTxt(topo) + " topo da parede" });
    if (cum > -9) lista.push({ y: cum, t: d.nivelTxt(cum) + (cumeeiraReal(c) ? " cumeeira" : " ponto mais alto do telhado") });
    colocarNiveis(D, xr, lista, F);
  }
  function rotulosCorte(c, ct, mc, F, k) {
    var D = c.D, d = DS(), sem = [];
    mc.ambientes.forEach(function (a) {
      var yb = a.base + 0.15, yt = a.base + Math.max(a.pe, 2.2), P0 = [F.U(a.u0) + 1.2, F.Y(yt)], P1 = [F.U(a.u1) - 1.2, F.Y(yb)];
      if (P1[0] - P0[0] < 6) return;
      var cen = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2];
      var jogos = [[{ t: txt(a.nome).toUpperCase(), h: d.K.hLetra.rotulo }, { t: "PD = " + d.br(a.pe, 2) + " m" }], [{ t: txt(a.nome).toUpperCase(), h: 2.4 }]];
      if (!d.rotuloBloco(D, cen, null, [P0[0], P0[1], P1[0], P1[1]], { jogos: jogos })) sem.push(a.nome);
    });
    return sem;
  }

  /* a maior escala em que o conjunto de caixas (mm por m) cabe: tenta de 1:50 para menos */
  function escolherEscala(larguras, alturas, area, escalas, extra) {
    extra = extra || {};
    for (var i = 0; i < escalas.length; i++) {
      var k = 1000 / escalas[i], lado = 0, empilhado = 0, maxH = 0, maxW = 0;
      for (var j = 0; j < larguras.length; j++) { lado += larguras[j] * k + (extra.fx || 0); empilhado += alturas[j] * k + (extra.fy || 0); maxH = Math.max(maxH, alturas[j] * k + (extra.fy || 0)); maxW = Math.max(maxW, larguras[j] * k + (extra.fx || 0)); }
      if (lado <= area.w && maxH <= area.h) return { escala: escalas[i], k: k, modo: "lado" };
      if (empilhado <= area.h && maxW <= area.w) return { escala: escalas[i], k: k, modo: "pilha" };
    }
    var u = escalas[escalas.length - 1]; return { escala: u, k: 1000 / u, modo: "pilha", estourou: true };
  }

  function cortes(c) {
    var D = c.D, d = DS(), A = c.A, cts = c.cortes, mcs = cts.map(function (ct) { return modeloCorte(c, ct); });
    var ws = cts.map(function (ct) { return ct.u1 - ct.u0 + 1.8; }), hs = mcs.map(function (m) { return (m.yMax - m.yMin) + 0.1; });
    var ex = { fx: 24 + 36 + 40, fy: 14 + 6 + 20 };
    var el = escolherEscala(ws, hs, { x: A.x, y: A.y, w: A.w - 4, h: A.h - 4 }, [50, 75, 100, 125, 150, 200], ex), k = el.k, sem = [], x = A.x + 4, y = A.y + 2;
    mcs.forEach(function (mc, i) {
      var ct = cts[i], wm = ws[i] * k + ex.fx, hm = hs[i] * k + ex.fy;
      /* c.bloco (js/arqdiagrama.js): cada corte é um BLOCO que o motor de diagramação põe onde couber */
      (c.bloco || function (nome, fn) { return fn(); })("corte-" + ct.letra + ct.letra, function () {
        d.escalaCota(D, el.escala); d.titulo(D, x, y, "CORTE " + ct.letra + ct.letra, "ESC 1:" + el.escala, i + 1);
        var X = x + 24 + 0.9 * k, Yb = y + 14 + 6 + (mc.yMax - mc.yMin) * k;   /* Yb = o papel da cota mc.yMin */
        var Fi = desenharCorte(c, ct, mc, X, Yb, k);
        cotasCorte(c, ct, mc, Fi, k); niveisCorte(c, ct, mc, Fi);
        sem = sem.concat(rotulosCorte(c, ct, mc, Fi, k));
      }, "CORTE " + ct.letra + ct.letra);
      if (el.modo === "lado") x += wm; else y += hm;
    });
    if (el.estourou) c.avisos.push("ARQ-07: os cortes não cabem em 1:" + el.escala + " nesta folha: aumente o formato.");
    if (sem.length) c.avisos.push("ARQ-07: sem lugar livre para o rótulo de " + sem.join(", ") + ".");
    return { escala: "1:" + el.escala, modelos: mcs };
  }

  /* ================================================================ FACHADAS */
  function vetoresVista(idx) {
    var f = [0, 1];   /* de quem olha: frente = sul da planta */
    if (idx && idx.ladoFrente != null && idx.recuos && idx.recuos[idx.ladoFrente]) {
      var r = idx.recuos[idx.ladoFrente], ex = r.para[0] - r.de[0], ez = r.para[1] - r.de[1], L = hip(ex, ez) || 1, nx = ez / L, nz = -ex / L, cen = idx.terreno && idx.terreno.contorno ? G().centroide(idx.terreno.contorno) : [0, 0];
      var mx = (r.de[0] + r.para[0]) / 2, mz = (r.de[1] + r.para[1]) / 2;
      if ((mx + nx - cen[0]) * nx + (mz + nz - cen[1]) * nz < 0) { nx = -nx; nz = -nz; }
      f = [Math.abs(nx) > 0.9 ? Math.round(nx) : (Math.abs(nz) > 0.9 ? 0 : nx), Math.abs(nz) > 0.9 ? Math.round(nz) : (Math.abs(nx) > 0.9 ? 0 : nz)];
    }
    var rt = [f[1], -f[0]];   /* (vz, -vx): a direita de quem olha de frente para a edificação */
    return [
      { nome: "FACHADA FRONTAL", v: f }, { nome: "FACHADA LATERAL DIREITA", v: rt }, { nome: "FACHADA POSTERIOR", v: [-f[0], -f[1]] }, { nome: "FACHADA LATERAL ESQUERDA", v: [-rt[0], -rt[1]] }
    ];
  }
  function modeloFachada(c, vv) {
    var d = c.dados, g = G(), v = vv.v, r = [v[1], -v[0]], items = [], uMin = Infinity, uMax = -Infinity, yMax = 0, yMin = 0;
    function proj(p) { return p[0] * r[0] + p[1] * r[1]; }
    function prof(p) { return p[0] * v[0] + p[1] * v[1]; }
    var pars = d.paredes.filter(function (w) { return VIVO[w.status]; });
    pars.forEach(function (w) {
      var us = w.pts.map(proj), u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), cen = g.centroide(w.pts);
      items.push({ tipo: w.muro ? "muro" : "parede", u0: u0, u1: u1, yb: w.base, yt: w.topo, prof: prof(cen), status: w.status, id: w.id, w: w });
      uMin = Math.min(uMin, u0); uMax = Math.max(uMax, u1); yMax = Math.max(yMax, w.topo); yMin = Math.min(yMin, w.base);
    });
    arr(d.telhados).filter(function (t) { return VIVO[t.status]; }).forEach(function (t) {
      arr(t.aguas).forEach(function (ag) {
        arr(ag.pecas).forEach(function (pc) {
          var P3 = arr(pc.pts); if (P3.length < 3) return;
          var us = P3.map(function (q) { return proj([q.x, q.z]); }), cx = 0, cz = 0; P3.forEach(function (q) { cx += q.x / P3.length; cz += q.z / P3.length; });
          items.push({ tipo: "agua", poli: P3.map(function (q) { return [proj([q.x, q.z]), q.y]; }), prof: prof([cx, cz]), status: t.status });
          us.forEach(function (u) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); }); P3.forEach(function (q) { yMax = Math.max(yMax, q.y); yMin = Math.min(yMin, q.y); });
        });
      });
    });
    /* o que fica FORA da casa (25/10/2026, projeto exemplo): o abrigo e a escada de marinheiro de aço, o deck, os tubos aparentes — na MESMA ordem de
       profundidade das paredes e do telhado (antes o telhado era desenhado por último e aparecia por cima da platibanda) */
    function ext(u0, u1, y0, y1) { uMin = Math.min(uMin, u0); uMax = Math.max(uMax, u1); yMax = Math.max(yMax, y1); yMin = Math.min(yMin, y0); }
    arr(d.metais).filter(function (m) { return VIVO[m.status]; }).forEach(function (m) {
      if (m.chapa) {
        var us = m.pts.map(proj), cc = g.centroide(m.pts); items.push({ tipo: "bloco", cls: "aco", u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), yb: m.base, yt: m.topo, prof: prof(cc), status: m.status });
        ext(Math.min.apply(null, us), Math.max.apply(null, us), m.base, m.topo); return;
      }
      var pa = [m.a[0], m.a[2]], pb = [m.b[0], m.b[2]], ua = proj(pa), ub = proj(pb);
      items.push({ tipo: "barra", cls: "aco", ua: ua, ya: m.a[1], ub: ub, yb: m.b[1], sa: m.sa, sb: m.sb, prof: (prof(pa) + prof(pb)) / 2, status: m.status });
      ext(Math.min(ua, ub) - m.sb / 2, Math.max(ua, ub) + m.sb / 2, Math.min(m.a[1], m.b[1]) - m.sa / 2, Math.max(m.a[1], m.b[1]) + m.sa / 2);
    });
    arr(d.moveis).filter(function (m) { return VIVO[m.status] && m.h1 > m.h0 && m.famId === "ra-pais-deck"; }).forEach(function (m) {
      var us = m.pts.map(proj); items.push({ tipo: "bloco", cls: "madeira", u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), yb: m.h0, yt: m.h1, prof: prof(g.centroide(m.pts)), status: m.status });
      ext(Math.min.apply(null, us), Math.max.apply(null, us), m.h0, m.h1);
    });
    arr(d.tubosAparentes).forEach(function (t) {
      var pa = [t.a[0], t.a[2]], pb = [t.b[0], t.b[2]], ua = proj(pa), ub = proj(pb);
      items.push({ tipo: "tubo", ua: ua, ya: t.a[1], ub: ub, yb: t.b[1], dn: t.dn / 1000, prof: (prof(pa) + prof(pb)) / 2 + 0.02, status: "novo" });
      ext(Math.min(ua, ub) - t.dn / 2000, Math.max(ua, ub) + t.dn / 2000, Math.min(t.a[1], t.b[1]), Math.max(t.a[1], t.b[1]));
    });
    var ordem = items.slice().sort(function (a, b) { return a.prof - b.prof; });
    var vaos = d.vaos.filter(function (q) { return VIVO[q.status]; });
    return { items: ordem, vaos: vaos, uMin: uMin, uMax: uMax, yMax: yMax, yMin: yMin, r: r, v: v, proj: proj, prof: prof };
  }
  function desenharFachada(c, vv, mf, X, Yb, k) {
    var D = c.D, d = DS(), g = G();
    function U(u) { return X + (u - mf.uMin) * k; }
    function Y(y) { return Yb - (y - mf.yMin) * k; }
    D.linha(U(mf.uMin - 0.9), Y(0), U(mf.uMax + 0.9), Y(0), "ARQ-TERRENO");
    for (var xx = U(mf.uMin - 0.9); xx < U(mf.uMax + 0.9); xx += 2.2) D.linha(xx, Y(0), xx - 1.6, Y(0) + 1.6, "ARQ-HACHURA");
    var nPar = 0;
    function desenhaParede(it) {
      var P = [[U(it.u0), Y(it.yt)], [U(it.u1), Y(it.yt)], [U(it.u1), Y(it.yb)], [U(it.u0), Y(it.yb)]];
      d.fundoPol(D, P, it.tipo === "muro" ? "#ececec" : (it.status === "novo" ? "#fbefef" : "#f1f1f1"));
      D._cam = it.tipo === "muro" ? "ARQ-MURO" : "ARQ-PAREDE-" + (it.status === "novo" ? "NOVO" : "EXISTENTE"); D.traco(P, true); D._cam = null;
      D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, it.tipo === "muro" ? "ARQ-MURO" : "ARQ-VAO", 1) + "/>");
      nPar++;
      /* vãos desta parede: só nas paredes de frente (a espessura de fora não tem janela) */
      if (it.tipo === "parede" && (it.u1 - it.u0) > 0.35) {
        mf.vaos.filter(function (q) { return q.parede === it.id; }).forEach(function (q) {
          var h = q.largura / 2, u = mf.proj([q.x, q.z]), y0 = it.yb + q.peitoril, y1 = y0 + q.altura, Q = [[U(u - h), Y(y1)], [U(u + h), Y(y1)], [U(u + h), Y(y0)], [U(u - h), Y(y0)]];
          d.fundoPol(D, Q, q.tipo === "janela" ? "#dcecf5" : "#e8d9c4");
          D._cam = "ARQ-VAO"; D.traco(Q, true); D._cam = null; D.add('<polygon points="' + d.pts(Q) + '" fill="none"' + d.atr(D, "ARQ-VAO", 1) + "/>");
          if (q.tipo === "janela") { D.linha(U(u), Y(y1), U(u), Y(y0), "ARQ-ARCO"); D.linha(U(u - h), (Y(y0) + Y(y1)) / 2, U(u + h), (Y(y0) + Y(y1)) / 2, "ARQ-ARCO"); }
        });
      }
    }
    function desenhaAgua(it) {
      var P = it.poli.map(function (q) { return [U(q[0]), Y(q[1])]; });
      if (g.areaPol(P) < 0.2) { D.linha(P[0][0], P[0][1], P[P.length - 1][0], P[P.length - 1][1], "ARQ-TELHADO"); return; }
      d.fundoPol(D, P, "#d8c2a6"); D._cam = "ARQ-TELHADO"; D.traco(P, true); D._cam = null; D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, "ARQ-TELHADO", 1) + "/>");
      /* o caimento: linhas de telha a cada 4 mm de papel */
      g.hachuraLinhas(P, 4, 0).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA"); });
    }
    var FILL = { madeira: "#e4cfae", aco: "#9fb0c0" };
    function poligono(P, fill) { d.fundoPol(D, P, fill); D._cam = "ARQ-VAO"; D.traco(P, true); D._cam = null; D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, "ARQ-VAO", 1) + "/>"); }
    /* a barra em elevação: o paralelogramo da barra, com a espessura do perfil (na vertical se a barra é deitada, na horizontal se é em pé), no mínimo 0,35 mm no papel */
    function espessura(m) { return Math.max(m, 0.35 / k); }
    function desenhaBarra(it, fill, a, b) {
      var du = it.ub - it.ua, dy = it.yb - it.ya, steep = Math.abs(dy) > Math.abs(du), P;
      if (steep) { var h = espessura(b) / 2; P = [[U(it.ua - h), Y(it.ya)], [U(it.ua + h), Y(it.ya)], [U(it.ub + h), Y(it.yb)], [U(it.ub - h), Y(it.yb)]]; }
      else { var v = espessura(a) / 2; P = [[U(it.ua), Y(it.ya + v)], [U(it.ub), Y(it.yb + v)], [U(it.ub), Y(it.yb - v)], [U(it.ua), Y(it.ya - v)]]; }
      poligono(P, fill);
    }
    mf.items.forEach(function (it) {
      if (it.tipo === "agua") desenhaAgua(it);
      else if (it.tipo === "barra") desenhaBarra(it, FILL.aco, it.sa, it.sb);
      else if (it.tipo === "tubo") desenhaBarra(it, "#6f8fb5", it.dn, it.dn);
      else if (it.tipo === "bloco") poligono([[U(it.u0), Y(it.yt)], [U(it.u1), Y(it.yt)], [U(it.u1), Y(it.yb)], [U(it.u0), Y(it.yb)]], FILL[it.cls] || "#ccc");
      else desenhaParede(it);
    });
    void nPar;
    return { U: U, Y: Y };
  }
  function cotasFachada(c, vv, mf, F, k) {
    var D = c.D, d = DS(), X0 = F.U(mf.uMin) - 14, ys = [0], topoPar = 0, cum = 0;
    mf.items.forEach(function (it) { if (it.tipo === "parede") topoPar = Math.max(topoPar, it.yt); if (it.tipo === "agua") it.poli.forEach(function (q) { cum = Math.max(cum, q[1]); }); });
    if (topoPar > 0.05) ys.push(topoPar); if (cum > topoPar + 0.05) ys.push(cum);
    var vs = ys.sort(function (a, b) { return a - b; });
    if (vs.length >= 2) {
      var P = vs.map(function (y) { return [X0, F.Y(y)]; }), vals = []; for (var i = 0; i + 1 < vs.length; i++) vals.push(d.cotaTxt(vs[i + 1] - vs[i]));
      D.cadeia(P, 0, vals, { offs: [4.5], desde: P.map(function () { return false; }), semExt: true });
    }
    var xr = F.U(mf.uMax) + 14, niv = [{ y: 0, t: "±0,00" }]; if (topoPar > 0.05) niv.push({ y: topoPar, t: d.nivelTxt(topoPar) }); if (cum > topoPar + 0.05) niv.push({ y: cum, t: d.nivelTxt(cum) + (cumeeiraReal(c) ? " cumeeira" : " ponto mais alto do telhado") });
    colocarNiveis(D, xr, niv, F);
    /* cota geral embaixo */
    var yL = F.Y(0) + 9; D.cota(F.U(mf.uMin), yL, F.U(mf.uMax), yL, 0, d.cotaTxt(mf.uMax - mf.uMin), { desde: [false, false], semExt: true });
  }
  function fachadas(c) {
    var D = c.D, d = DS(), A = c.A, vvs = vetoresVista(c.idx), mfs = vvs.map(function (vv) { return modeloFachada(c, vv); });
    var ws = mfs.map(function (m) { return m.uMax - m.uMin + 1.8; }), hs = mfs.map(function (m) { return m.yMax - m.yMin + 0.3; });
    var cel = { w: A.w / 2 - 4, h: A.h / 2 - 2 }, ex = { fx: 14 + 30, fy: 14 + 18 };
    var esc = [50, 75, 100, 125, 150, 200], k = 0.005, ch = null;
    for (var i = 0; i < esc.length && !ch; i++) {
      var kk = 1000 / esc[i], ok = true;
      for (var j = 0; j < mfs.length; j++) if (ws[j] * kk + ex.fx > cel.w || hs[j] * kk + ex.fy > cel.h) ok = false;
      if (ok) { ch = esc[i]; k = kk; }
    }
    if (!ch) { ch = 200; k = 5; c.avisos.push("ARQ-08: as fachadas não cabem em 1:200 nesta folha: aumente o formato."); }
    mfs.forEach(function (mf, i) {
      var col = i % 2, lin = Math.floor(i / 2), cx0 = A.x + 4 + col * (A.w / 2), cy0 = A.y + 2 + lin * (A.h / 2);
      (c.bloco || function (nome, fn) { return fn(); })("fachada-" + (i + 1), function () {
        d.escalaCota(D, ch); d.titulo(D, cx0, cy0, vvs[i].nome, "ESC 1:" + ch, i + 1);
        var X = cx0 + 14 + 0.9 * k, Yb = cy0 + 14 + (mf.yMax - mf.yMin) * k + 4;
        var F = desenharFachada(c, vvs[i], mf, X, Yb, k);
        cotasFachada(c, vvs[i], mf, F, k);
      }, vvs[i].nome);
    });
    return { escala: "1:" + ch };
  }

  var ArqCortes = { escolherCortes: escolherCortes, cortes: cortes, fachadas: fachadas, escolherEscala: escolherEscala, modeloCorte: modeloCorte, vetoresVista: vetoresVista };
  global.ArqCortes = ArqCortes;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqCortes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

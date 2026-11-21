/* =====================================================================
 * metalchapano.js — NÓS COM CHAPA (gusset) das treliças em CANTONEIRA (21/11/2026)
 *
 * Sistema da treliça "cantoneira" (js/metalporticos.js, tesoura-leve): alma e banzos em dupla cantoneira costas com costas
 * (2L, a folga = espessura da chapa de nó), a chapa entre as abas, soldas de filete longitudinais (calcanhar e ponta de cada
 * aba). O travejamento da coluna em cantoneira SIMPLES soldada na aba do U (5.3.4.4 na barra, js/acodim8800.js).
 *
 * MetalChapaNo.verificar(r) — r = resultado do AcoDimLivre.calcular (r.modelo.membros, r.modelo.noInfo, r.analise):
 *   esforço de cada barra = envoltória das combinações ÚLTIMAS (maior tração Nt e maior compressão Nc, nas pontas).
 *   Por barra 2L que termina num nó (a chapa é dimensionada aqui com os esforços do cálculo):
 *     solda   NBR 8800:2008 6.2.5: Fw,Rd = 0,60·fw·Aw/γw2, Aw = 0,707·dw·Lw, fw = 485 MPa (E70XX), γw2 = 1,35; 4 filetes
 *             (2 por cantoneira); metal-base: 0,60·fy·t·Lw/γa1 na aba e na chapa (6.2.5.1); dw pela Tabela 10 e ≤ t da aba;
 *             Lw ≥ máx(4·dw, 40 mm) (6.2.6.2) — o motor ESCOLHE Lw (múltiplo de 10 mm) e reprova acima de LW_MAX;
 *     barra   ruptura da seção líquida com Ct = 1 − ec/Lw (5.2.5, ec = xc da cantoneira), 0,60 ≤ Ct ≤ 0,90;
 *     chapa   Whitmore: bw = a + 2·Lw·tan 30°; escoamento bw·tg·fy/γa1 (tração); compressão da faixa de Whitmore
 *             (Thornton: K = 0,65, comprimento livre c0/sen θ, curva da NBR 8800 5.3.3 com Q = 1);
 *             colapso por rasgamento (bloco de cisalhamento, 6.5.6): Fr = (0,6·fu·Anv + fu·Ant)/γa2 ≤ (0,6·fy·Agv + fu·Ant)/γa2,
 *             Agv = Anv = 2·Lw·tg, Ant = a·tg.
 *   Chapa → peça principal (o banzo que passa no nó ou o U da coluna): soma das componentes |N|·cos θ e |N|·sen θ das barras
 *     (a favor: combinações diferentes juntas); solda de 2 filetes no comprimento Lg da chapa; seção da chapa ao longo de Lg
 *     (cisalhamento 0,6·fy·tg·Lg/γa1 e tração/compressão tg·Lg·fy/γa1, interação quadrática).
 *   L simples na aba do U (travejamento): 2 filetes no cruzamento da aba (Lw ≤ bf/sen θ − 10 mm), metal-base da aba do U e da
 *     cantoneira, Ct = 1 − xc/Lw.
 *   Chapas espaçadoras da 2L (5.3.4.2): ℓ ≤ ½·λ·rz1 — número por barra; peso das chapas de nó e espaçadoras (premissas
 *     de forma: chapa retangular Lg × hg; espaçadora a × 60 mm × e).
 *   → { nos, n, reprovados, pior, resumo, pesoChapas, pesoEspacadores, premissas }
 * ===================================================================== */
(function (global) {
  "use strict";
  var FW = 485, GW2 = 1.35, GA1 = 1.10, GA2 = 1.35, CH = { fy: 250, fu: 400, id: "ASTM A36 (chapa)" }, C0 = 20, LW_MAX = 300, LG_MAX = 800, TAN30 = Math.tan(Math.PI / 6);
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var x = +v; return isFinite(x) ? x : d; }
  function br(v, c) { return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /* NBR 8800:2008 Tabela 10 — dimensão mínima do filete pela parte MENOS espessa */
  function dwMin(t) { return t <= 6.35 ? 3 : t <= 12.5 ? 5 : t <= 19 ? 6 : 8; }
  function chiC(l0) { return l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0); }

  /* envoltória das combinações ÚLTIMAS: maior tração e maior compressão (kN) do membro */
  function envN(r, m) {
    var C = (r.analise && r.analise.combinacoes) || {}, Nt = 0, Nc = 0, viu = false;
    Object.keys(C).forEach(function (k) {
      if (/^caso_/.test(k) || /ELS|serv|freq|qp|rara/i.test(k)) return;
      var cb = C[k]; if (!cb || !cb.barras) return;
      arr(m.segs).forEach(function (s) { var b = cb.barras[s]; if (!b || b.inativa) return; arr(b.estacoes).forEach(function (e) { var N = num(e.N, 0); viu = true; if (N > Nt) Nt = N; if (-N > Nc) Nc = -N; }); });
    });
    if (!viu) { var p = r.membros && r.membros[m.id] && r.membros[m.id].pior, N0 = num(p && p.N, 0); if (N0 > 0) Nt = N0; else Nc = -N0; }
    return { Nt: Nt, Nc: Nc, N: Math.max(Nt, Nc) };
  }

  function ligaBarra(L, N, Nt, Nc, th, aco) {
    /* L = { a, t, xc, A, e (folga = tg) }; N, Nt, Nc em kN; th = ângulo com a peça principal (rad) */
    var tg = L.e, dw = Math.max(dwMin(Math.min(L.t, tg)), Math.min(Math.floor(L.t), 6)); if (dw > L.t) dw = Math.max(3, Math.floor(L.t));
    var Rw = 0.6 * FW * 0.707 * dw / GW2, Rmb = 0.6 * aco.fy * L.t / GA1, Rch = 0.6 * CH.fy * tg / GA1;   /* N/mm por linha de solda */
    var porMm = Math.min(4 * Rw, 4 * Rmb, 2 * Rch), Lw = Math.max(40, 4 * dw, Math.ceil(N * 1000 / porMm / 10) * 10), ok = true, gov = "";
    function Ct(lw) { return Math.max(0.6, Math.min(0.9, 1 - L.xc / lw)); }
    var NtRup = function (lw) { return Ct(lw) * L.A * aco.fu / GA2 / 1000; };
    while (Nt > 0 && NtRup(Lw) < Nt && Lw < LW_MAX) Lw += 10;
    var vs = [];
    function v(nome, item, R, S, formula) { var rz = R > 0 ? S / R : (S > 0 ? Infinity : 0); vs.push({ nome: nome, item: item, resistencia: Math.round(R * 10) / 10, solicitante: Math.round(S * 10) / 10, razao: rz, formula: formula }); }
    v("Solda de filete (4 × " + dw + " mm × " + Lw + " mm)", "NBR 8800 6.2.5", porMm * Lw / 1000, N, "mín(4·0,6·fw·0,707·dw; 4·0,6·fy·t/γa1; 2·0,6·fy,ch·tg/γa1)·Lw");
    if (Nt > 0) v("Ruptura da seção líquida (Ct = " + br(Ct(Lw), 2) + ")", "NBR 8800 5.2.5", NtRup(Lw), Nt, "Ct·Ag·fu/γa2, Ct = 1 − xc/Lw");
    var bw = L.a + 2 * Lw * TAN30;
    if (Nt > 0) v("Chapa — escoamento na seção de Whitmore (bw = " + br(bw, 0) + " mm)", "Whitmore / NBR 8800 5.2.2", bw * tg * CH.fy / GA1 / 1000, Nt, "bw·tg·fy/γa1");
    if (Nc > 0) {
      var Lc = C0 / Math.max(0.2, Math.sin(th)), lam = 0.65 * Lc * Math.sqrt(12) / tg, Ne = Math.PI * Math.PI * 200000 / (lam * lam), l0 = Math.sqrt(CH.fy / Ne), chi = chiC(l0);
      v("Chapa — compressão na faixa de Whitmore (K·L/r = " + br(lam, 1) + ")", "Thornton / NBR 8800 5.3", chi * bw * tg * CH.fy / GA1 / 1000, Nc, "χ·bw·tg·fy/γa1, K = 0,65, L = c0/sen θ");
    }
    var Agv = 2 * Lw * tg, Ant = L.a * tg, Fr = Math.min(0.6 * CH.fu * Agv, 0.6 * CH.fy * Agv) + CH.fu * Ant;
    v("Chapa — colapso por rasgamento (bloco de cisalhamento)", "NBR 8800 6.5.6", Fr / GA2 / 1000, N, "(0,6·fu·Anv + fu·Ant)/γa2 ≤ (0,6·fy·Agv + fu·Ant)/γa2");
    if (Lw > LW_MAX) { ok = false; gov = "comprimento de solda " + Lw + " mm > " + LW_MAX + " mm (chapa inviável)"; }
    var pior = vs.reduce(function (a, b) { return !a || b.razao > a.razao ? b : a; }, null);
    return { dw: dw, Lw: Lw, bw: bw, tg: tg, verificacoes: vs, razao: ok ? pior.razao : Infinity, governante: ok ? pior.nome : gov };
  }

  function verificar(r) {
    var out = { nos: [], n: 0, reprovados: 0, pior: null, resumo: "", pesoChapas: 0, pesoEspacadores: 0, nEspacadores: 0,
                premissas: "chapa de nó ASTM A36 com a espessura da folga da 2L; eletrodo E70XX (fw 485 MPa); folga livre c0 = " + C0 + " mm entre a ponta da barra e a peça principal; Lw ≤ " + LW_MAX + " mm; chapa ao longo da peça principal ≤ " + LG_MAX + " mm" };
    if (!r || !r.modelo) return out;
    var M = arr(r.modelo.membros), NI = r.modelo.noInfo || {};
    function P(id) { var I = NI[id]; return I && I.P; }
    function dL(m) { var s = m.secao && m.secao.mm; return s && (s.forma === "2L" || s.forma === "L") ? s : null; }
    function interno(c, no) { var i = arr(c.nos).indexOf(no); return i > 0 && i < arr(c.nos).length - 1; }
    var porNo = {};
    M.forEach(function (b) {
      var s = dL(b); if (!s || !(b.calc && (b.calc.chapaNo || b.calc.soldaAba))) return;
      var ns = arr(b.nos); if (ns.length < 2) return;
      [ns[0], ns[ns.length - 1]].forEach(function (no, k) {
        (porNo[no] = porNo[no] || { no: no, barras: [] }).barras.push({ m: b, s: s, outra: k === 0 ? ns[ns.length - 1] : ns[0] });
      });
    });
    Object.keys(porNo).forEach(function (no) {
      var G = porNo[no], p0 = P(no); if (!p0) return;
      var ids = G.barras.map(function (q) { return q.m.id; });
      /* a peça principal fica NO PLANO das barras (terça, escora e corrente passam pelo nó fora do plano e não recebem a chapa) */
      function dirDe(c) { var cn = arr(c.nos), i = cn.indexOf(no), pv = P(cn[i + 1] != null ? cn[i + 1] : cn[i - 1]); return pv ? norm(sub(pv, p0)) : null; }
      function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
      var dirs = G.barras.map(function (q) { var pq = P(q.outra); return pq ? norm(sub(pq, p0)) : null; }).filter(Boolean), nPl = null;
      for (var i1 = 0; i1 < dirs.length && !nPl; i1++) for (var i2 = i1 + 1; i2 < dirs.length && !nPl; i2++) { var cz = cross(dirs[i1], dirs[i2]); if (Math.sqrt(dot(cz, cz)) > 0.2) nPl = norm(cz); }
      var cand = M.filter(function (c) {
        if (ids.indexOf(c.id) >= 0 || arr(c.nos).indexOf(no) < 0 || (c.calc && (c.calc.escora || c.calc.tercaDe))) return false;
        var dc = dirDe(c); if (!dc) return false;
        if (nPl) return Math.abs(dot(dc, nPl)) < 0.3;
        return Math.abs(dc[2]) < 0.3;   /* uma barra só: o plano do pórtico (z = eixo longitudinal do prédio) */
      });
      var princ = cand.filter(function (c) { return interno(c, no); })[0] || cand.filter(function (c) { var f = c.secao && c.secao.mm && c.secao.mm.forma; return f === "frio" || f === "U" || f === "2L"; })[0] || null;
      /* sem principal que passa: a 2L de banzo que também termina aqui faz o papel (cumeeira, joelho) */
      var chapaBarras = G.barras.filter(function (q) { return q.s.forma === "2L"; }), simples = G.barras.filter(function (q) { return q.s.forma === "L"; });
      var ec = null;
      if (princ) { var cn = arr(princ.nos), i = cn.indexOf(no), pv = P(cn[i + 1] != null ? cn[i + 1] : cn[i - 1]); if (pv) ec = norm(sub(pv, p0)); }
      if (!ec && chapaBarras.length) { var pb = P(chapaBarras[0].outra); ec = pb ? norm(sub(pb, p0)) : [1, 0, 0]; }
      var o = { no: no, principal: princ ? princ.id : null, principalPerfil: princ ? princ.secao.nome : null, barras: [], razao: 0, ok: true, governante: "" };
      var Sx = 0, Sy = 0, foot = 0, hg = 0, tg = 0;
      chapaBarras.forEach(function (q) {
        var pq = P(q.outra), eb = pq ? norm(sub(pq, p0)) : ec, cs = Math.min(1, Math.abs(dot(eb, ec))), th = Math.acos(cs), E = envN(r, q.m);
        var ehBanzo = /banzo/i.test(String(q.m.nome || "") + " " + String(q.m.papelLivre || "")) && cs > 0.95;
        var L = { a: q.s.a, t: q.s.t, xc: q.s.xc, A: q.s.A / 2, e: q.s.e }, Lb = ligaBarra({ a: L.a, t: L.t, xc: L.xc, A: q.s.A, e: L.e }, E.N, E.Nt, E.Nc, Math.max(th, 0.3), q.m.aco || { fy: 250, fu: 400 });
        tg = Math.max(tg, q.s.e);
        if (!ehBanzo || !princ) { Sx += E.N * cs; Sy += E.N * Math.sin(th); foot += Lb.Lw * cs + q.s.a / Math.max(0.3, Math.sin(th)) + C0; hg = Math.max(hg, Lb.Lw * Math.sin(th) + C0); }
        o.barras.push({ id: q.m.id, perfil: q.m.secao.nome, N: Math.round(E.N * 10) / 10, Nt: Math.round(E.Nt * 10) / 10, Nc: Math.round(E.Nc * 10) / 10, theta: Math.round(th * 1800 / Math.PI) / 10, dw: Lb.dw, Lw: Lb.Lw, razao: Lb.razao, governante: Lb.governante, verificacoes: Lb.verificacoes });
        if (Lb.razao > o.razao) { o.razao = Lb.razao; o.governante = q.m.id + ": " + Lb.governante; }
      });
      /* chapa → peça principal */
      if (princ && chapaBarras.length && (Sx > 0 || Sy > 0)) {
        var sp = princ.secao.mm || {}, tp = num(sp.t, num(sp.tf, num(sp.tw, 3))), dwp = Math.max(dwMin(Math.min(tp, tg)), Math.min(Math.floor(Math.min(tp, tg)), 6)); if (dwp > tp) dwp = Math.max(3, Math.floor(tp));
        /* o comprimento da chapa ao longo da peça principal é DIMENSIONADO: o maior entre a pegada das barras e o que a solda e a
           seção da chapa pedem (múltiplo de 10 mm); acima de LG_MAX a chapa reprova */
        var R = Math.sqrt(Sx * Sx + Sy * Sy), wMm = Math.min(2 * 0.6 * FW * 0.707 * dwp / GW2, 2 * 0.6 * num(princ.aco && princ.aco.fy, 250) * tp / GA1), gMm = Math.min(0.6 * CH.fy * tg / GA1, CH.fy * tg / GA1);
        var Lg = Math.max(100, Math.ceil(foot / 10) * 10, Math.ceil(R * 1000 / wMm / 10) * 10, Math.ceil(Math.sqrt(Sx * Sx / Math.pow(0.6 * CH.fy * tg / GA1, 2) + Sy * Sy / Math.pow(CH.fy * tg / GA1, 2)) * 1000 / 10) * 10);
        if (Lg > LG_MAX) Lg = LG_MAX;
        var Rw = 2 * 0.6 * FW * 0.707 * dwp / GW2 * Lg / 1000, Rmb = 2 * 0.6 * num(princ.aco && princ.aco.fy, 250) * tp / GA1 * Lg / 1000;
        var Vg = 0.6 * CH.fy * tg * Lg / GA1 / 1000, Ng = CH.fy * tg * Lg / GA1 / 1000, ri = Math.sqrt(Math.pow(Sx / Vg, 2) + Math.pow(Sy / Ng, 2));
        var vp = [{ nome: "Solda chapa → " + princ.secao.nome + " (2 × " + dwp + " mm × " + Lg + " mm)", item: "NBR 8800 6.2.5", resistencia: Math.round(Math.min(Rw, Rmb) * 10) / 10, solicitante: Math.round(R * 10) / 10, razao: R / Math.min(Rw, Rmb) },
                  { nome: "Chapa — seção ao longo da peça principal (cisalhamento + normal)", item: "NBR 8800 5.4.3 / 5.2.2", resistencia: null, solicitante: null, razao: ri }];
        o.chapa = { tg: tg, Lg: Lg, hg: Math.round(hg + num(sp.a, num(sp.bw, num(sp.d, 100))) ), dwPrincipal: dwp, Sx: Math.round(Sx * 10) / 10, Sy: Math.round(Sy * 10) / 10, verificacoes: vp };
        vp.forEach(function (q) { if (q.razao > o.razao) { o.razao = q.razao; o.governante = q.nome; } });
      } else if (chapaBarras.length) o.chapa = { tg: tg, Lg: Math.max(100, Math.ceil(foot / 10) * 10), hg: Math.round(hg + 50), verificacoes: [] };
      if (o.chapa) out.pesoChapas += 7850e-9 * o.chapa.tg * o.chapa.Lg * o.chapa.hg;
      /* L simples na aba do U */
      simples.forEach(function (q) {
        var sp = princ && princ.secao.mm, E = envN(r, q.m), pq = P(q.outra), eb = pq ? norm(sub(pq, p0)) : ec, th = ec ? Math.acos(Math.min(1, Math.abs(dot(eb, ec)))) : Math.PI / 2;
        if (!sp) { o.barras.push({ id: q.m.id, perfil: q.m.secao.nome, N: E.N, razao: Infinity, governante: "sem peça onde soldar (nó sem U/banzo)" }); o.razao = Infinity; o.governante = q.m.id + ": sem peça principal"; return; }
        var bf = num(sp.bf, 0), tf = num(sp.t, num(sp.tf, 3)), tL = q.s.t, dw = Math.max(dwMin(Math.min(tL, tf)), 3); if (dw > Math.min(tL, tf)) dw = Math.max(3, Math.floor(Math.min(tL, tf)));
        var Lav = Math.max(0, bf / Math.max(0.3, Math.sin(th)) - 10), porMm = Math.min(2 * 0.6 * FW * 0.707 * dw / GW2, 2 * 0.6 * num(q.m.aco && q.m.aco.fy, 250) * tL / GA1, 2 * 0.6 * num(princ.aco && princ.aco.fy, 250) * tf / GA1);
        var Lw = Math.min(Lav, Math.max(40, 4 * dw, Math.ceil(E.N * 1000 / porMm / 10) * 10)), Ct = Math.max(0.6, Math.min(0.9, 1 - num(q.s.xc, 0) / Math.max(Lw, 1)));
        var vs = [{ nome: "Solda L → aba do " + princ.secao.nome + " (2 × " + dw + " mm × " + Math.round(Lw) + " mm, cabe " + Math.round(Lav) + ")", item: "NBR 8800 6.2.5", resistencia: Math.round(porMm * Lw / 100) / 10, solicitante: Math.round(E.N * 10) / 10, razao: Lw > 0 ? E.N * 1000 / (porMm * Lw) : Infinity }];
        if (E.Nt > 0) vs.push({ nome: "Ruptura da seção líquida (Ct = " + br(Ct, 2) + ")", item: "NBR 8800 5.2.5", resistencia: Math.round(Ct * q.s.A * num(q.m.aco && q.m.aco.fu, 400) / GA2 / 100) / 10, solicitante: Math.round(E.Nt * 10) / 10, razao: E.Nt * 1000 / (Ct * q.s.A * num(q.m.aco && q.m.aco.fu, 400) / GA2) });
        var pr = vs.reduce(function (a, b) { return b.razao > a.razao ? b : a; });
        o.barras.push({ id: q.m.id, perfil: q.m.secao.nome, N: Math.round(E.N * 10) / 10, theta: Math.round(th * 1800 / Math.PI) / 10, dw: dw, Lw: Math.round(Lw), razao: pr.razao, governante: pr.nome, verificacoes: vs });
        if (pr.razao > o.razao) { o.razao = pr.razao; o.governante = q.m.id + ": " + pr.nome; }
      });
      o.ok = o.razao <= 1 + 1e-9; o.tipo = chapaBarras.length ? "chapa de nó" : "L soldada no U";
      out.nos.push(o); out.n++; if (!o.ok) out.reprovados++;
      if (!out.pior || o.razao > out.pior.razao) out.pior = o;
    });
    /* chapas espaçadoras das barras 2L (5.3.4.2) */
    M.forEach(function (m) {
      var s = m.secao && m.secao.mm; if (!s || s.forma !== "2L" || !(s.rz1 > 0)) return;
      var fl = m.flambagem || {}, Lx = num(fl.Lx, m.L) * 1000, Ly = num(fl.Ly, m.L) * 1000, lam = Math.max(Lx / s.rx, Ly / s.ry), lmax = Math.max(0.5 * lam, 1) * s.rz1;
      var n = Math.max(1, Math.ceil(m.L * 1000 / lmax - 1e-9) - 1);
      out.nEspacadores += n; out.pesoEspacadores += n * 7850e-9 * s.e * s.a * 60;
    });
    out.pesoChapas = Math.round(out.pesoChapas * 10) / 10; out.pesoEspacadores = Math.round(out.pesoEspacadores * 10) / 10;
    out.resumo = out.n + " nó(s) com chapa/solda verificados (NBR 8800:2008 6.2.5, 5.2.5, 6.5.6; Whitmore/Thornton): " + out.reprovados + " reprovado(s)" +
      (out.pior ? "; pior razão " + br(out.pior.razao, 3) + " (nó " + out.pior.no + ", " + out.pior.governante + ")" : "") +
      "; chapas de nó ≈ " + br(out.pesoChapas, 0) + " kg, " + out.nEspacadores + " espaçadoras ≈ " + br(out.pesoEspacadores, 0) + " kg";
    return out;
  }

  var MetalChapaNo = { verificar: verificar, ligaBarra: ligaBarra, dwMin: dwMin, FW: FW, GW2: GW2, CH: CH, C0: C0, LW_MAX: LW_MAX };
  global.MetalChapaNo = MetalChapaNo;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalChapaNo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

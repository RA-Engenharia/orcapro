/* =====================================================================
 * madt3calc.js — T3 (telhado de 4 águas): MODELO 3D, CARGAS, VENTO, ANÁLISE (2ª ordem), DIMENSIONAMENTO (NBR 7190-1:2022), LIGAÇÕES. Motor PURO, ES5, Node-testável.
 * Segue o caminho da T2 (maddimensionar2.t2*) sem alterá-la: o que a T2 já tem de rotina (K_br,1 do contraventamento, deslizamento dos pinos das diagonais, F1d = Nd/150,
 * crescimento da seção no passo do fabricante, base pela ligação) é reproduzido aqui para as barras da T3. Fontes e decisões: docs/madeira/T3-REFERENCIA.md.
 * Convenção do solver: x = X (cumeeira), y = vertical, z = Z da planta (através). Cargas: G1 (peso próprio), G2 (telha + ripas), Q (sobrecarga de cobertura, por m² de PLANTA),
 * vento (acovento, Tabela 5 duas águas SOBRE as 4 águas, normal a cada uma — premissa declarada), vento nas paredes sobre os pilares, abertura dominante como EXCEPCIONAL.
 * NÃO modelado (declarado): torção por excentricidade do vento (6.6), vento oblíquo, caibros/ripas secundários, rincão (planta em L).
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T3 = req("MadT3", "madt3.js"), U = T3._util, D = U.D, ext = U.ext, hyp = U.hyp, r2 = U.r2, br = U.br, copia = U.copia, norm = U.norm;
  function opc(nome, arq) { try { return req(nome, arq); } catch (e) { return null; } }

  var T3_LIM = { P: { bMax: 0.40, hMax: 0.40 }, PO: { bMax: 0.40, hMax: 0.40 }, FR: { hMax: 0.48, bMax: 0.30 }, BS: { hMax: 0.36, bMax: 0.20 }, BI: { hMax: 0.36, bMax: 0.20 }, PD: { hMax: 0.24, bMax: 0.16 }, DG: { hMax: 0.24, bMax: 0.16 },
    MS: { hMax: 0.36, bMax: 0.20 }, MI: { hMax: 0.36, bMax: 0.20 }, MP: { hMax: 0.24, bMax: 0.16 }, MG: { hMax: 0.24, bMax: 0.16 }, E: { hMax: 0.48, bMax: 0.24 }, T: { hMax: 0.36, bMax: 0.20 }, CM: { hMax: 0.80, bMax: 0.24 },
    LB: { hMax: 0.24, bMax: 0.16 }, DX: { hMax: 0.24, bMax: 0.16 }, DP: { hMax: 0.24, bMax: 0.16 } };
  var DIR_NORMAL = function (sl, sn, cs) { return sl === "F" ? [0, cs, -sn] : sl === "B" ? [0, cs, sn] : sl === "W" ? [-sn, cs, 0] : [sn, cs, 0]; };

  function modulos(c) { return { E: c.Ec0m * 1e3, G: c.Gm * 1e3 }; }
  function ret(b, h) { var a = Math.max(b, h), c = Math.min(b, h), J = a * c * c * c * (1 / 3 - 0.21 * (c / a) * (1 - Math.pow(c / a, 4) / 12)); return { A: b * h, Iz: b * h * h * h / 12, Iy: h * b * b * b / 12, J: J }; }
  function perfilFn(q) { var Dm = D(), cache = {}; return function (car) { return cache[car] || (cache[car] = Dm.MM.perfil2022({ carregamento: car, umidade: q.umidade, produto: "serrada", betaC: /^mlc:/i.test(q.classe) ? 0.1 : undefined, limVao: q.limVao, limBalanco: q.limBalanco, fluencia: q.fluencia, phiConservador: !!q.phiConservador })); }; }
  function durClasse(comb) { var f = comb.fatores, temW = Object.keys(f).some(function (k) { return (k[0] === "W" || k === "DCPI") && f[k] > 0; }), temQ = (f.Q || 0) > 0; return temW ? "curta" : temQ ? "longa" : "permanente"; }
  function modeloSemFalha(avisos) { var ruins = (avisos || []).filter(function (a) { return /nó inexistente|comprimento nulo|seção sem área/.test(a); }); if (ruins.length) throw new Error("modelo de cálculo inconsistente (barra/apoio ignorado pela análise): " + ruins.slice(0, 4).join("; ")); }
  function keyDe(proj) { return JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; }); }

  function t3Padrao(proj) {
    var Dm = D(), q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 2; q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150; q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.cargas = ext({ outros: 0 }, q.cargas || {}); q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {}); q.limites = ext({}, T3_LIM, q.limites || {});
    var cl = Dm.MM.classe2022(q.classe); if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta);
    q.params = T3.parametros(q.params); return q;
  }
  function t3Vento(q, G, avisos) {
    var Dm = D(), p = G.p, I = G.info, th = Math.atan(p.incl) * 180 / Math.PI, der = { a: p.a, b: p.b, h: I.Hp - p.baseZ, hCumeeira: I.yD(p.b / 2) - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" };
    var geo = ext({ nervuras: "retangulares" }, (q.vento && q.vento.geometria) || {}, der), ent = ext({}, q.vento, { geometria: geo }), key = JSON.stringify(ent);
    if (q._vento && q._ventoKey === key) return q._vento;
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: true, vedacao: "misto" }; }); avisos.push("T3: faces do vento não informadas — adotadas as 4 fechadas (vedação mista, permeável)."); }
    var r = Dm.VE.calcular(ent, { todasDirecoes: true, obliquos: true });
    if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros));
    avisos.push("T3: PREMISSA DE VENTO — a NBR 6123:2023 NÃO traz coeficientes para telhado de 4 águas (só uma e duas águas, Tabelas 5 e 6). Adotado o campo de pressões da Tabela 5 (duas águas, mesma planta, inclinação e altura; cumeeira ao longo de a) projetado sobre as 4 águas, aplicado normal a cada uma, com o beiral a barlavento (+0,8·q por baixo). " + r.casos.length + " casos (4 direções × cpi); vento OBLÍQUO não montado. A confirmar pelo RT (ou por ensaio em túnel de vento) antes de emitir para execução.");
    q._vento = r; q._ventoKey = key; return r;
  }
  function pressaoParede(caso, face, s) { var L = caso.pressao.paredes[face] || [], i; for (i = 0; i < L.length; i++) if (s >= L[i].s0 - 1e-6 && s <= L[i].s1 + 1e-6) return L[i].p; return 0; }

  /* ---------- deslizamento dos pinos das diagonais de madeira (A1/r13 da T2, 7.1.12) ---------- */
  function slipFator(q, m, s, E, L) { var sl = q._slip && q._slip[m.g === "DV" ? "DX" : m.g]; if (!sl || !(sl.k > 0)) return 1; return 1 / (1 + E * s.b * s.h / (L * sl.k)); }
  function slipDiag(q, sec, ELUrig, perfil, barras) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), pc = perfil("curta"), cL = ML.cfg({ kmod: pc.kmod, kmod1: pc.kmod1, kmod2: pc.kmod2, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }), out = {};
    function menorL(gr) { var m = Infinity; (barras || []).forEach(function (bb) { var me = bb.mem; if (me && gr.indexOf(bb.grupo) >= 0 && me.p0 && me.p1) m = Math.min(m, norm(me.p0, me.p1)); }); return isFinite(m) ? m : 0; }
    ["DX", "DP"].forEach(function (g) {
      if (!sec[g]) return; var F = Math.max(ELUrig[g] || 0, 0.05), Ld = menorL(g === "DX" ? ["DX", "DV"] : ["DP"]), Lmax = Ld > 0 ? Math.min(0.4 * Ld, ML.PINOS_LMAX_PONTA) : 0,
        pn = ML.pinosAxiais(cL, "diagonal " + g, F, 0.001, sec[g].b, sec[g].h, 0.008, { nMin: sec[g].nMin || 0, Lmax: Lmax }), nF = pn && pn.n ? pn.n : 2, d = pn && pn.d ? pn.d : 0.012, n = Math.max(nF, sec[g].nMin || 0), Ku = ML.kuPino(d, cl.rhok, true, 2);
      out[g] = { n: n, nForca: nF, d: d, Ku: Ku, k: n * Ku / 2, F: F, nKu: n * Ku, Lmax: Lmax, Ldiag: Ld, cabe: !(pn && pn.cabe === false), arranjo: pn && pn.ok ? { nc: pn.nc, nr: pn.nr, a1: pn.a1, a3: pn.a3, comprimento: pn.comprimento } : null };
    });
    return out;
  }

  /** MODELO (b): estribo da terça no espigão. Mesmo caminho do slipDiag (pinosAxiais + Ku = 2/3·Kser, NBR 7190-1, 7.1.12), mas a mola é de UMA ponta (k = n·Ku): a terça tem o estribo em cada extremidade, não as duas em série como a diagonal */
  function slipTerca(q, sec, F, S, perfil) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), pc = perfil("curta"), cL = ML.cfg({ kmod: pc.kmod, kmod1: pc.kmod1, kmod2: pc.kmod2, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" });
    var pn = ML.pinosAxiais(cL, "terça × espigão (estribo)", Math.max(F, 0.05), Math.max(S, 0.05), sec.T.b, sec.T.h, 0.008, {}), n = pn && pn.n ? pn.n : 2, d = pn && pn.d ? pn.d : 0.012, Ku = ML.kuPino(d, cl.rhok, true, 2);
    return { n: n, d: d, Ku: Ku, k: n * Ku, F: F, S: S, cabe: !(pn && pn.ok === false), formula: "k_estribo = n·Ku (uma ponta); Ku = 2/3·Kser, Kser = ρm^1,5·d/23 × 2 (madeira–aço) × 2 planos (chapa interna)" };
  }

  /** torção nas pontas do frechal no canto: o empuxo horizontal do espigão atua na sela (topo do frechal), δ = h_FR/2 acima do eixo; a componente ⊥ ao eixo de cada frechal (H/√2, espigão a 45° em planta) gira a ponta: T = (H/√2)·δ;
   *  τT = T/(α·a·c²), α = 1/(3 + 1,8·c/a) (maddim7190, 7190-1), somada ao cortante de ponta (a favor) e comparada com fv,d. Entra no laço de crescimento do FR (t3Pior). */
  function torcaoFR(sec, E, cinta, fvd, beta) {
    var f = sec.FR, dlt = f.h / 2, a = Math.max(f.b, f.h), c = Math.min(f.b, f.h), al = 1 / (3 + 1.8 * c / a), Hh = Math.max(E.heel.HEq || 0, E.heel.H || 0), T = Hh * dlt / (2 * Math.cos(beta == null ? Math.PI / 4 : beta)), tT = T / (al * a * c * c) / 1e3, Sq = (cinta.fim && cinta.fim.SEq) || 0, tV = 1.5 * Sq / (f.b * f.h) / 1e3, eta = (tV + tT) / fvd;
    return { delta: dlt, H: Hh, T: T, alfa: al, a: a, c: c, tau_T: tT, tau_V: tV, fvd: fvd, eta: eta, ok: eta <= 1 + 1e-9 };
  }

  /** VIGA BI-APOIADA canto–ápice do espigão carregada SÓ com as forças VERTICAIS reais que as terças (barras que não são o espigão) aplicam nos nós do espigão, tiradas da análise 3D (revisão do RT: o empuxo/arco do modelo não pode reduzir o
   *  momento de projeto abaixo do da viga). Apoios: nó do canto (t = 0) e nó do ápice (t = T); os nós além do canto (balanço do beiral) carregam e entram na reação. t = distância em planta ao longo da diagonal.
   *  Devolve { M (kN·m, no plano vertical do espigão), Rc, Ra (reações verticais), T, cargas }. comb = r.combinacoes[id] da análise de M. */
  function vigaEspigao(M, comb, mem, p) {
    var adj = M._adj; if (!adj) { adj = M._adj = {}; M.barras.forEach(function (b) { (adj[b.i] = adj[b.i] || []).push([b, "i"]); (adj[b.j] = adj[b.j] || []).push([b, "j"]); }); }
    var nd = {}; M.nos.forEach(function (n) { nd[n.id] = n; });
    var xc = mem.canto[0] - p.origem.x, zc = mem.canto[1] - p.origem.y, xa = mem.p1[0] - p.origem.x, za = mem.p1[1] - p.origem.y, T = Math.sqrt(Math.pow(xa - xc, 2) + Math.pow(za - zc, 2)), ux = (xa - xc) / T, uz = (za - zc) / T, ids = {}, cargas = [], k;
    M.barras.forEach(function (b) { if (b.m === mem.id) { ids[b.i] = 1; ids[b.j] = 1; } });
    Object.keys(ids).forEach(function (id) {
      var n = nd[id], t = (n.x - xc) * ux + (n.z - zc) * uz, Fy = 0; if (Math.abs(t) < 1e-3 || Math.abs(t - T) < 1e-3) return;      /* apoios */
      (adj[id] || []).forEach(function (w) { var b = w[0]; if (b.m === mem.id || !comb.barras[b.id]) return; var es = comb.barras[b.id].estacoes, e = w[1] === "i" ? es[0] : es[es.length - 1], ex = b.ax, ey = b.vy; Fy += (w[1] === "i" ? 1 : -1) * (e.N * ex[1] + e.Vy * ey[1] + e.Vz * (ex[2] * ey[0] - ex[0] * ey[2])); });
      if (Math.abs(Fy) > 1e-12) cargas.push({ t: t, P: -Fy });
    });
    var Ra = 0, Pt = 0; cargas.forEach(function (c) { Ra += c.P * c.t / T; Pt += c.P; });
    var Rc = Pt - Ra, mx = 0, x; for (x = 0; x <= T + 1e-9; x += T / 400) { var m = Rc * x; cargas.forEach(function (c) { if (c.t < x) m -= c.P * (x - c.t); }); mx = Math.max(mx, Math.abs(m)); }
    return { M: mx, Rc: Rc, Ra: Ra, T: T, cargas: cargas };
  }

  /* ---------- MODELO 3D ---------- */
  function t3Montar(q, G, sec, comFV, variante) {
    var Dm = D(), MM = Dm.MM, p = G.p, mat = MM.classe2022(q.classe), mod = modulos(mat), X0 = p.origem.x, Y0 = p.origem.y, nos = [], barras = [], idn = {}, apoios = [], th = Math.atan(p.incl), krAll = q._krEf != null ? q._krEf : 1e9;
    function no(P3) { var key = P3.map(function (v) { return Math.round(v * 1e4); }).join(","); if (!idn[key]) { idn[key] = { id: "n" + nos.length, x: P3[0] - X0, y: P3[2], z: P3[1] - Y0 }; nos.push(idn[key]); } return idn[key].id; }
    function krDe(g) { return (krAll !== null && typeof krAll === "object") ? (krAll[g] != null ? krAll[g] : 1e9) : krAll; }
    G.membros.forEach(function (m) {
      if (m.g === "DV" && !comFV) return;
      var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = norm(m.p0, m.p1), pts = [m.p0].concat(m.nos || []).concat([m.p1]), tt = [], ps = [];
      pts.forEach(function (P) { var t = ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / (L * L); tt.push({ t: t, P: P }); });
      tt.sort(function (u, v) { return u.t - v.t; }); tt.forEach(function (o, k) { if (!k || (o.t - tt[k - 1].t) * L > 1e-3) ps.push(o); });
      var sg = [], k, curto = m.tracao || m.uni || m.g === "PD" || m.g === "DG" || m.g === "MP" || m.g === "MG";
      for (k = 0; k + 1 < ps.length; k++) { var A = ps[k].P, B = ps[k + 1].P, mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; if (curto) sg.push([A, B]); else { sg.push([A, mid]); sg.push([mid, B]); } }
      var u = T3.upDe(m), vy = [u[0], u[2], u[1]], s = sec[m.g === "DV" ? "DX" : m.g], nIv = ps.length - 1;
      sg.forEach(function (S, n) {
        var A = S[0], B = S[1], Lb = norm(A, B), bar = { id: m.id + "#" + n, m: m.id, grupo: m.g, agua: m.agua, i: no(A), j: no(B), E: mod.E, G: mod.G, vy: vy, nElem: (m.tracao || m.uni) ? 1 : 2, pesoEsp: q.pesoMLC, L: Lb, mem: m, ax: [d[0] / L, d[2] / L, d[1] / L] };
        var primeiro = n === 0, ultimo = n === sg.length - 1, lib = {};
        if (m.tracao) { bar.secao = { A: s.b * s.h * slipFator(q, m, s, mod.E, L), Iz: 1e-12, Iy: 1e-12, J: 1e-12 }; bar.tracao = true; bar.pesoEsp = 0; lib = { i: { ry: true, rz: true }, j: { ry: true, rz: true } }; }
        else { bar.b = s.b; bar.h = s.h; bar.secao = ret(s.b, s.h);
          /* MODELO (b) da revisão (T3-REFERENCIA §4c): o estribo da terça no espigão DESLIZA (pinos, Ku = 2/3·Kser, 7.1.12) — a barra da ponta fica em série com a mola do estribo, mesma lógica de slipFator das diagonais DX/DP */
          if (variante === "b" && q._slipT && m.g === "T" && (primeiro || ultimo)) { var kT = q._slipT.k / ((primeiro && ultimo) ? 2 : 1), fT = 1 / (1 + mod.E * s.b * s.h / (Lb * kT)); bar.secao.A *= fT; bar.slipT = fT; bar.pesoEsp = q.pesoMLC / fT; } if (q.diagnostico && q.diagnostico.tercaSemAxial && m.g === "T") bar.secao.A *= 1e-4; if (q.diagnostico && q.diagnostico.semCinta && (m.g === "FR" || m.g === "T")) bar.secao.A *= 1e-4;      /* DIAGNÓSTICO (só teste): terças sem rigidez axial = espigão como viga bi-apoiada, para a conta à mão */ if ((m.pinI || m.ends) && primeiro) lib.i = { ry: true, rz: true }; if ((m.pinJ || m.ends) && ultimo) lib.j = { ry: true, rz: true }; }
        if (m.uni) lib = { i: { ry: true, rz: true }, j: { ry: true, rz: true } };
        if (m.artic) { var iv = curto ? n : n >> 1; if (!curto) { if (!(n & 1) && iv >= 1) lib.i = ext(lib.i || {}, { ry: true }); if ((n & 1) && iv <= nIv - 2) lib.j = ext(lib.j || {}, { ry: true }); } }
        if (lib.i || lib.j) bar.libera = lib;
        barras.push(bar);
      });
      if (m.g === "P" || m.g === "PO") { var Bn = no(m.p0); apoios.push({ no: Bn, ux: true, uy: true, uz: true, ry: true, rx: krDe(m.g), rz: krDe(m.g), grupo: m.g, mem: m.id }); }
    });
    return { nos: nos, barras: barras, apoios: apoios, G: G, th: th, cs: Math.cos(th), sn: Math.sin(th) };
  }

  /* ---------- CASOS DE CARGA ---------- */
  function t3Casos(q, M, VT, QCOB, g2s) {
    var Dm = D(), VE = Dm.VE, D2 = Dm.D2, G = M.G, p = G.p, I = G.info, a = p.a, b = p.b, PAREDE = { x0: 0, x1: a, y0: 0, y1: b }, cs = M.cs, sn = M.sn, C = [], DG = q.diagnostico || {};
    var rb = M.barras.filter(function (x) { return x.mem.faces; }), pil = M.barras.filter(function (x) { return x.grupo === "P" || x.grupo === "PO"; }), g2 = [], qq = [];
    rb.forEach(function (x) { var ws = 0; x.mem.faces.forEach(function (f) { ws += f.ws; }); g2.push({ tipo: "barra", barra: x.id, q: [0, -g2s * ws, 0] }); qq.push({ tipo: "barra", barra: x.id, q: [0, -QCOB.q * ws / I.sc, 0] }); });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "telha + ripas", cargas: g2 });
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de cobertura", cargas: qq });
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    function teto(cv, ov) {        /* ov = { sl, cpe }: água cujo cpe é SUBSTITUÍDO dentro da planta (caso extra da cabeceira a barlavento, T3-REFERENCIA §3) */
      var cg = [];
      rb.forEach(function (x) {
        var A = nodo[x.i], B = nodo[x.j], m = x.mem, s, NS = 3;
        for (s = 0; s < NS; s++) {
          var t0 = s / NS, t1 = (s + 1) / NS, tm = (t0 + t1) / 2, X = A.x + (B.x - A.x) * tm + p.origem.x, Y = A.z + (B.z - A.z) * tm + p.origem.y, fx = [0, 0, 0];
          m.faces.forEach(function (F) {
            var wp = F.ws / I.sc, pp = 0, sh = m.g === "CM" ? (F.sl === "F" ? -0.01 : 0.01) : 0, ofs = (F.sl === "F" || F.sl === "B") ? [[0, -wp / 2 + 0.01], [0, 0], [0, wp / 2 - 0.01]] : [[-wp / 2 + 0.01, 0], [0, 0], [wp / 2 - 0.01, 0]];
            ofs.forEach(function (o) { var Xo = X + o[0], Yo = Y + o[1] + sh; pp += (ov && F.sl === ov.sl && Xo >= 0 && Xo <= a && Yo >= 0 && Yo <= b) ? (ov.cpe - cv.cpi) * cv.q : D2._pressaoTeto(PAREDE, cv, Xo, Yo); }); pp /= 3;
            var nrm = DIR_NORMAL(F.sl, sn, cs); fx[0] += -pp * nrm[0] * F.ws; fx[1] += -pp * nrm[1] * F.ws; fx[2] += -pp * nrm[2] * F.ws;
          });
          cg.push({ tipo: "barra", barra: x.id, q: fx, a: t0, b: t1 });
        }
      });
      return cg;
    }
    function paredes(cv) {
      var cg = [];
      pil.forEach(function (x) { x.mem.partes.forEach(function (pt) { var pr = pressaoParede(cv, pt[0], pt[1]) * pt[2], v = pt[0] === "esquerda" ? [0, 0, pr] : pt[0] === "direita" ? [0, 0, -pr] : pt[0] === "frente" ? [pr, 0, 0] : [-pr, 0, 0]; cg.push({ tipo: "barra", barra: x.id, q: v }); }); });
      return cg;
    }
    VT.casos.forEach(function (cv, n) {
      var eh0 = (/cpi0/.test(cv.id) || (!!cv.obliquo && !DG.semObliquoExc));
      C.push({ id: "W" + n, tipo: "W", direcao: cv.direcao, nome: cv.nome || cv.id, cargas: teto(cv).concat(paredes(cv)), q: cv.q, cpi0: eh0 });
    });
    /* ADICIONADO à envolvente (não substitui): vento paralelo à cumeeira (0° e 180°) com cpe = +0,2 na água de cabeceira a barlavento (a 4 águas a cabeceira barlavento pode ficar sob PRESSÃO; a Tabela 5 de 2 águas só dá sucção ali). Só com cpi < 0 (cpi = −0,3: pressão líquida (0,2 + 0,3)·q, o mais adverso para a gravidade). PREMISSA DECLARADA, a confirmar pelo RT. */
    VT.casos.forEach(function (cv, n) { if ((cv.direcao === 0 || cv.direcao === 180) && cv.cpi < 0) C.push({ id: "W" + n + "g", tipo: "W", direcao: cv.direcao, nome: (cv.nome || cv.id) + " + cpe +0,2 na água de cabeceira a barlavento", cargas: teto(cv, { sl: cv.direcao === 0 ? "W" : "E", cpe: 0.2 }).concat(paredes(cv)), q: cv.q, cpi0: false, extra: true }); });
    var dominante = function (dcp, sg) {
      var qd = sg * dcp.p, cd = [];
      rb.forEach(function (x) {
        var m = x.mem, A = nodo[x.i], B = nodo[x.j]; if (m.d != null && m.d < -1e-6) return;            /* linha do beiral (fora da planta): sem pressão interna */
        var xm = (A.x + B.x) / 2 + p.origem.x, zm = (A.z + B.z) / 2 + p.origem.y; if (xm < -0.01 || xm > a + 0.01 || zm < -0.01 || zm > b + 0.01) return;
        m.faces.forEach(function (F) { var nrm = DIR_NORMAL(F.sl, sn, cs); cd.push({ tipo: "barra", barra: x.id, q: [qd * nrm[0] * F.wsIn, qd * nrm[1] * F.wsIn, qd * nrm[2] * F.wsIn] }); });
      });
      pil.forEach(function (x) { x.mem.partes.forEach(function (pt) { var v = pt[0] === "esquerda" ? [0, 0, -qd * pt[2]] : pt[0] === "direita" ? [0, 0, qd * pt[2]] : pt[0] === "frente" ? [-qd * pt[2], 0, 0] : [qd * pt[2], 0, 0]; cd.push({ tipo: "barra", barra: x.id, q: v }); }); });
      return cd;
    };
    var dcp = VE.casoAberturaDominante(VT.q); C.push({ id: "DCPI", tipo: "E", nome: dcp.nome, cargas: dominante(dcp, 1) });
    var dcs = DG.semDominanteSuccao ? null : VE.casoAberturaDominanteSuccao(VT, VT.q); if (dcs) C.push({ id: "DCPIS", tipo: "E", nome: dcs.nome, cargas: dominante(dcs, -1), dcpi: dcs.cpi });
    return C;
  }
  function diagNo(M, motivo) {
    var m = /nó (\S+),/.exec(String(motivo || "")); if (!m) return ""; var n = M.nos.filter(function (x) { return x.id === m[1]; })[0]; if (!n) return "";
    return " [nó " + n.id + " em X=" + n.x.toFixed(2) + " Y=" + n.z.toFixed(2) + " Z=" + n.y.toFixed(2) + "; barras: " + M.barras.filter(function (b) { return b.i === n.id || b.j === n.id; }).map(function (b) { return b.id; }).join(", ") + "]";
  }

  /* ---------- contraventamento: K_br,1 (6.6.2) ---------- */
  function familias(M, G) {
    var p = G.p, I = G.info, X0 = p.origem.x, Y0 = p.origem.y, mapa = {}, out = { BS: [], BI: [], linhas: [] };
    M.nos.forEach(function (n) { mapa[Math.round(n.x * 1e4) + "," + Math.round(n.y * 1e4) + "," + Math.round(n.z * 1e4)] = n.id; });
    function id(X, Zp, Hv) { return mapa[Math.round((X - X0) * 1e4) + "," + Math.round(Hv * 1e4) + "," + Math.round((Zp - Y0) * 1e4)]; }
    for (var k = 1; k < 2 * I.nH; k++) { var z = k * I.dz, L1 = { g: "BS", k: k, nos: [] }, L2 = { g: "BI", k: k, nos: [] }; I.xs.forEach(function (x) { var a1 = id(x, z, I.yT(z)), b1 = id(x, z, I.Hp); if (a1) { out.BS.push(a1); L1.nos.push(a1); } if (b1) { out.BI.push(b1); L2.nos.push(b1); } }); out.linhas.push(L1, L2); }
    return out;
  }
  function kbrMin(Eef, I2, L1, m) { return 2 * (1 + Math.cos(Math.PI / m)) * Math.PI * Math.PI * Eef * 1e3 * I2 / Math.pow(L1, 3); }
  function kMedido(M, fam) {
    var AN = D().AN, casos = [], comb = [];
    fam.linhas.forEach(function (L, k) { casos.push({ id: "K" + k, cargas: L.nos.map(function (n) { return { tipo: "no", no: n, F: [1, 0, 0, 0, 0, 0] }; }) }); var f = {}; f["K" + k] = 1; comb.push({ id: "K" + k, fatores: f }); });
    var r = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: casos }, { combinacoes: comb, estacoes: 3, comPCG: false });
    if (!r.ok) throw new Error("análise (rigidez do contraventamento): " + (r.motivo || JSON.stringify(r.avisos)));
    var o = { BS: 1e12, BI: 1e12, linhas: [] };
    fam.linhas.forEach(function (L, k) { var d = r.combinacoes["K" + k].desloc, u = 0; L.nos.forEach(function (n) { u = Math.max(u, Math.abs((d[n] || [0])[0])); }); var K = u > 1e-12 ? 1 / u : 1e12; o[L.g] = Math.min(o[L.g], K); o.linhas.push({ g: L.g, k: L.k, K: K }); });
    return o;
  }
  function maxGap(m) {
    var pts = [m.p0].concat(m.nos || []).concat([m.p1]), d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = norm(m.p0, m.p1), ts = pts.map(function (P) { return ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / L; }).sort(function (u, v) { return u - v; }), g = 0, k;
    for (k = 1; k < ts.length; k++) g = Math.max(g, ts[k] - ts[k - 1]); return g;
  }

  /* ---------- RODAR ---------- */
  function t3Rodar(proj, sec) {
    var Dm = D(), AN = Dm.AN, CA = Dm.CA, MM = Dm.MM, MD = Dm.MD, ML = Dm.ML, VE = Dm.VE, key = keyDe(proj), q = proj._pad3;
    if (!q || proj._pad3Key !== key) { q = proj._pad3 = t3Padrao(proj); proj._pad3Key = key; }
    q._krEf = proj._krBase != null ? proj._krBase : q.krBase;
    sec = copia(sec); if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!q.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    var G = T3.geometria(q.params), p = G.p, I = G.info, M = t3Montar(q, G, sec), perfil = perfilFn(q), CL = q.classe, mod0 = modulos(MM.classe2022(q.classe)), avisos = [];
    var QCOB = CA.sobrecargaCobertura(p.incl * 100, { empocamentoVerificado: !!q.empocamentoVerificado }), g2s = p.telha.peso + q.cargas.outros;
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo); (QCOB.avisos || []).forEach(function (t) { avisos.push(t); });
    var VT = t3Vento(q, G, avisos), CS = t3Casos(q, M, VT, QCOB, g2s), porB = {}; M.barras.forEach(function (b) { porB[b.id] = b; });
    var cargasTot = {}; CS.forEach(function (c) { var t = [0, 0, 0]; c.cargas.forEach(function (k) { var b = k.tipo === "barra" ? porB[k.barra] : null; if (!b || !k.q) return; var fr = (k.b == null ? 1 : k.b) - (k.a == null ? 0 : k.a); for (var z = 0; z < 3; z++) t[z] += k.q[z] * b.L * fr; }); cargasTot[c.id] = t; });
    var normais = CS.filter(function (c) { return c.tipo !== "E"; });
    var combs = CA.combinacoes(normais.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    CS.filter(function (c) { return c.tipo === "W" && c.cpi0; }).forEach(function (c) { CS.filter(function (d) { return d.tipo === "E"; }).forEach(function (dc) { var f = { G1: 1, G2: 1 }; f[c.id] = 1; f[dc.id] = 1; elu.push({ id: "EXC_" + c.id + "_" + dc.id, nome: "excepcional: " + c.nome + " + " + dc.nome, tipo: "ELU", fatores: f, segundaOrdem: true }); }); });
    var modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) };
    var r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + diagNo(M, r.motivo));
    q._slip = null; q._slipT = null; var slipInfo = null;
    if (!q._semSlip && (sec.DX || sec.DP)) {
      var fRig = { DX: 0, DP: 0 }, KREF0 = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREF0 / perfil(durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "DX" && b0.grupo !== "DP") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fRig[b0.grupo] = Math.max(fRig[b0.grupo], Math.max(0, e0.N) * FK0); }); }); });
      slipInfo = slipDiag(q, sec, fRig, perfil, M.barras); q._slip = slipInfo;
      M = t3Montar(q, G, sec); modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: modelo.casos };
      r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    }
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + diagNo(M, r.motivo));
    /* MODELO (b) (revisão do espigão como arco com tirante): estribo da terça no espigão com deslizamento (slipTerca). Dimensiona-se pela ENVOLVENTE dos dois modelos: (a) terça com rigidez axial cheia e (b) estribo deslizante. O (b) dá MENOS momento no espigão que o (a) (a terça com estribo frouxo puxa menos o espigão; pirâmide, G2: (a) 1,47 e (b) 1,39 kN·m — T3-REFERENCIA §4c); a envolvente fica com o (a) no momento e protege as ligações. Além disso, o momento de projeto do espigão não é menor que o da viga bi-apoiada canto–ápice com as forças VERTICAIS reais das terças (vigaEspigao). */
    var slipTinfo = null, Mb = null, rb = null, modeloB = null;
    (function () {
      var fT = 0, vT = 0, KREFT = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREFT / perfil(durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "T") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fT = Math.max(fT, Math.abs(e0.N) * FK0); vT = Math.max(vT, hyp(e0.Vy, e0.Vz) * FK0); }); }); });
      slipTinfo = slipTerca(q, sec, fT, vT, perfil); q._slipT = slipTinfo;
      Mb = t3Montar(q, G, sec, false, "b"); modeloB = { nos: Mb.nos, barras: Mb.barras, apoios: Mb.apoios, casos: modelo.casos };
      rb = AN.analisar(modeloB, { combinacoes: elu, estacoes: 3, comPCG: true });
      if (!rb.ok) throw new Error("análise (modelo b, estribo da terça com deslizamento): " + (rb.motivo || JSON.stringify(rb.avisos)) + diagNo(Mb, rb.motivo));
    })();
    /* K_br,1 (6.6.2): medido × exigido */
    var Mf = t3Montar(q, G, sec, true), fam = familias(Mf, G), Kb = kMedido(Mf, fam), EefRef = MD.perfilEResist(CL, perfil("curta")).f.Eef;
    var CTV = { E0ef: EefRef, BS: { m: I.nH, L1: I.lp, Kbr: Kb.BS }, BI: { m: 2 * I.nH, L1: I.dz, Kbr: Kb.BI }, nos: { BS: fam.BS.length, BI: fam.BI.length } };
    ["BS", "BI"].forEach(function (g) { var c = CTV[g], sg = sec[g]; c.I2 = sg.h * Math.pow(sg.b, 3) / 12; c.Kmin = kbrMin(EefRef, c.I2, c.L1, c.m); c.ok = c.Kbr >= c.Kmin; c.L0z = c.L1; c.razao = c.Kmin / c.Kbr; });
    CTV.razao = Math.max(CTV.BS.razao, CTV.BI.razao); CTV.ok = CTV.BS.ok && CTV.BI.ok; CTV.slip = slipInfo; CTV.semSlip = !slipInfo;
    if (!CTV.ok) avisos.push("C3: a rigidez K_br,1 do contraventamento (NBR 7190-1:2022, 6.6.2) NÃO atende: banzo superior " + Math.round(CTV.BS.Kbr) + " × " + Math.round(CTV.BS.Kmin) + " kN/m, banzo inferior " + Math.round(CTV.BI.Kbr) + " × " + Math.round(CTV.BI.Kmin) + " kN/m — o comprimento de flambagem fora do plano NÃO está provado; aumentar as diagonais/pinos.");
    modeloSemFalha(r.avisos);
    var KREF = perfil("curta").kmod, FK = 1, res = { grupos: {}, esbeltez: {}, reacoes: {}, esf: {}, combinacoes: elu.length, kmodRef: KREF, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, avisos: avisos, tracoes: { parede: 0, vert: 0, fita: 0 }, cinta: { N: 0, NEq: 0, fim: { N: 0, NEq: 0, S: 0, SEq: 0 } }, porModelo: { a: {}, b: {} }, pontaMI: { N: 0, NEq: 0, S: 0, SEq: 0, PD: 0, PDEq: 0, R: 0, REq: 0 }, espigao: { heel: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 }, apice: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 } }, meia: { N: 0, V: 0, NEq: 0, VEq: 0 } };
    var tag = "a";
    function regEsb(gp, v) { if (!v || !v.esbelto) return; var lam = v.lambda, lx = Array.isArray(lam) ? lam[0] : lam, ly = Array.isArray(lam) ? lam[1] : lam, mx = Math.max(lx || 0, ly || 0), a1 = res.esbeltez[gp]; if (!a1 || mx > a1.lambdaMax) res.esbeltez[gp] = { esbelto: true, eixo: (ly || 0) >= (lx || 0) ? "b" : "h", lambdaMax: mx }; }
    function regG(gp, eta, onde, comb, gov) { if (!res.grupos[gp] || eta > res.grupos[gp].eta) res.grupos[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; var pm = res.porModelo[tag]; if (pm && (!pm[gp] || eta > pm[gp].eta)) pm[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; }
    var Lcol = {}, topoTravado = !!(CTV.ok && sec.DP);
    res.creditoTopo = { aplicado: topoTravado, motivo: topoTravado ? "K_br,1 do contraventamento da cobertura e das paredes VERIFICADO (banzo superior " + Math.round(CTV.BS.Kbr) + " × " + Math.round(CTV.BS.Kmin) + " kN/m; banzo inferior " + Math.round(CTV.BI.Kbr) + " × " + Math.round(CTV.BI.Kmin) + " kN/m): topo do pilar travado lateralmente, L0 pelo modelo engastado-apoiado" : "K_br,1 NÃO atende ou paredes sem diagonais (vedação rígida informada): SEM crédito de topo travado — pilar em balanço com mola de base" };
    avisos.push("T3: " + res.creditoTopo.motivo + ".");
    function betas(b) {
      var P = sec[b.grupo], Cb = (q._krEf !== null && typeof q._krEf === "object") ? (q._krEf[b.grupo] != null ? q._krEf[b.grupo] : 1e9) : (q._krEf != null ? q._krEf : 1e9), EIh = mod0.E * P.b * Math.pow(P.h, 3) / 12, EIb = mod0.E * P.h * Math.pow(P.b, 3) / 12, kk = b.grupo + "|" + b.mem.id;
      if (!Lcol[kk]) { var Lb = Math.abs(b.mem.p1[2] - b.mem.p0[2]), KtMin = (Math.PI / 3) * Math.tan(Math.PI / 3) / Lb, fb = topoTravado ? function (C, EI) { return MD.betaEngastadoApoiado({ C: C, EI: EI, L: Lb }).beta; } : function (C, EI) { return MD.betaFlambagemMola({ C: C, EI: EI, L: Lb }).beta; };
        Lcol[kk] = [fb(Math.max(Cb, KtMin * EIh), EIh), fb(Math.max(Cb, KtMin * EIb), EIb), Lb]; }
      return Lcol[kk];
    }
    var nd0 = {}, nBanzo = {}, f90Perp = { BS: 0, BI: 0 }; M.nos.forEach(function (n) { nd0[n.id] = n; });
    var gb = { BS: "BS", MS: "BS", BI: "BI", MI: "BI" };
    M.barras.forEach(function (b) { if (!gb[b.grupo]) return; var A = nd0[b.i], B = nd0[b.j], Lx = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2) + Math.pow(B.z - A.z, 2)) || 1; [b.i, b.j].forEach(function (n) { if (!nBanzo[n]) nBanzo[n] = { g: gb[b.grupo], t: [(B.x - A.x) / Lx, (B.y - A.y) / Lx, (B.z - A.z) / Lx] }; }); });
    var nEluDiag = {}, ESF_G = { BS: 1, BI: 1, PD: 1, DG: 1, MS: 1, MI: 1, MP: 1, MG: 1, T: 1, CM: 1, E: 1, DX: 1, DP: 1, LB: 1, FR: 1 }, travB = p.cobertura.travBaixo, mgap = {};
    G.membros.forEach(function (m) { mgap[m.id] = maxGap(m); });
    var Lhip = {}; G.membros.forEach(function (m) { if (m.g === "E") { var c = m.canto, ap = m.p1; Lhip[m.id] = Math.sqrt(Math.pow(ap[0] - c[0], 2) + Math.pow(ap[1] - c[1], 2) + Math.pow(ap[2] - I.Hp, 2)); } });
    function vetorExtremo(b, e, rc) { var ex = b.ax, ey = b.vy, ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]], F = [0, 1, 2].map(function (k) { return e.N * ex[k] + e.Vy * ey[k] + e.Vz * ez[k]; }); return { N: Math.abs(e.N), S: hyp(e.Vy, e.Vz), H: hyp(F[0], F[2]), V: Math.abs(F[1]) }; }
    [{ M: M, r: r, tag: "a" }, { M: Mb, r: rb, tag: "b" }].forEach(function (pass) {      /* ENVOLVENTE dos dois modelos: os acumuladores abaixo guardam sempre o máximo */
    var Mx = pass.M, rx = pass.r; tag = pass.tag;
    elu.forEach(function (cb) {
      var rc = rx.combinacoes[cb.id]; if (!rc) return; var car = durClasse(cb), pf = perfil(car), fnd = {}, cmb = { mi: 0, miS: 0, pd: 0 }; FK = KREF / pf.kmod;
      var kEsp = {};      /* viga bi-apoiada canto–ápice com as verticais reais das terças: o Mz de projeto do espigão é o MAIOR entre o do modelo (a ou b) e o da viga */
      G.membros.forEach(function (m) { if (m.g !== "E") return; var vg = vigaEspigao(Mx, rc, m, p), mz = 0; Mx.barras.forEach(function (bb) { if (bb.m === m.id && rc.barras[bb.id]) rc.barras[bb.id].estacoes.forEach(function (e) { mz = Math.max(mz, Math.abs(e.Mz)); }); });
        kEsp[m.id] = { k: mz > 1e-9 && vg.M > mz ? vg.M / mz : 1, M: vg.M, Mmod: mz, Ra: vg.Ra, Rc: vg.Rc }; var ev = res.espigaoViga || (res.espigaoViga = { M: 0, Mmodelo: 0, k: 1, Ra: 0, Rc: 0, comb: null }); if (vg.M > ev.M) { ev.M = vg.M; ev.Mmodelo = mz; ev.comb = cb.id; } ev.k = Math.max(ev.k, kEsp[m.id].k); ev.Ra = Math.max(ev.Ra, vg.Ra); ev.Rc = Math.max(ev.Rc, vg.Rc); });
      Mx.barras.forEach(function (b) {
        var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
        if (ESF_G[g]) { var ac = res.esf[g] || (res.esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); es.forEach(function (e) { var nt = Math.max(0, e.N), nc = Math.max(0, -e.N), vv = hyp(e.Vy, e.Vz); ac.Nt = Math.max(ac.Nt, nt); ac.Nc = Math.max(ac.Nc, nc); ac.V = Math.max(ac.V, vv); ac.NtEq = Math.max(ac.NtEq, nt * FK); ac.NcEq = Math.max(ac.NcEq, nc * FK); ac.VEq = Math.max(ac.VEq, vv * FK); }); }
        if (g === "PD" || g === "DG" || g === "MP" || g === "MG") [[b.i, es[0].N, b.j], [b.j, es[es.length - 1].N, b.i]].forEach(function (q9) { if (!nBanzo[q9[0]]) return; var a9 = nd0[q9[0]], o9 = nd0[q9[2]], L9 = Math.sqrt(Math.pow(o9.x - a9.x, 2) + Math.pow(o9.y - a9.y, 2) + Math.pow(o9.z - a9.z, 2)) || 1, f9 = fnd[q9[0]] || (fnd[q9[0]] = [0, 0, 0]); f9[0] += q9[1] * (o9.x - a9.x) / L9; f9[1] += q9[1] * (o9.y - a9.y) / L9; f9[2] += q9[1] * (o9.z - a9.z) / L9; });
        if (g === "DX" || g === "DP") es.forEach(function (e0) { nEluDiag[b.id] = Math.max(nEluDiag[b.id] || 0, Math.max(0, e0.N)); });
        if (g === "E") {      /* esforços nas pontas do espigão: heel = ponta do canto (1ª estação do trecho sobre o canto), apice = última estação */
          var ultimo = /#(\d+)$/.exec(b.id), mem = b.mem; if (b.j && b.i) { /* ponta do apice: barra cujo j é o nó do apice */ }
          var apN = null; M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - mem.p1[0]) < 1e-3 && Math.abs(n.z + p.origem.y - mem.p1[1]) < 1e-3 && Math.abs(n.y - mem.p1[2]) < 1e-3) apN = n.id; });
          var cN = null; if (mem.tip) M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - mem.canto[0]) < 1e-3 && Math.abs(n.z + p.origem.y - mem.canto[1]) < 1e-3 && Math.abs(n.y - I.Hp) < 1e-3) cN = n.id; }); else cN = null;
          if (b.j === apN) { var vE = vetorExtremo(b, es[es.length - 1], rc), ap = res.espigao.apice; ap.N = Math.max(ap.N, vE.N); ap.S = Math.max(ap.S, vE.S); ap.SEq = Math.max(ap.SEq, vE.S * FK); ap.H = Math.max(ap.H, vE.H); ap.V = Math.max(ap.V, vE.V); ap.NEq = Math.max(ap.NEq, vE.N * FK); ap.HEq = Math.max(ap.HEq, vE.H * FK); ap.VEq = Math.max(ap.VEq, vE.V * FK); }
          if (cN && b.i === cN) { var vH = vetorExtremo(b, es[0], rc), hp = res.espigao.heel; hp.N = Math.max(hp.N, vH.N); hp.S = Math.max(hp.S, vH.S); hp.SEq = Math.max(hp.SEq, vH.S * FK); hp.H = Math.max(hp.H, vH.H); hp.V = Math.max(hp.V, vH.V); hp.NEq = Math.max(hp.NEq, vH.N * FK); hp.HEq = Math.max(hp.HEq, vH.H * FK); hp.VEq = Math.max(hp.VEq, vH.V * FK); }
          var kv = kEsp[b.mem.id], cosH = 1 / Math.sqrt(1 + I.incl * I.incl / 2);      /* reações verticais da viga canto–ápice também valem para as ligações (cortante ⊥ ao eixo = R·cos α) */
          if (kv && b.j === apN) { var apv = res.espigao.apice; apv.S = Math.max(apv.S, kv.Ra * cosH); apv.SEq = Math.max(apv.SEq, kv.Ra * cosH * FK); apv.V = Math.max(apv.V, kv.Ra); apv.VEq = Math.max(apv.VEq, kv.Ra * FK); }
          if (kv && cN && b.i === cN) { var hpv = res.espigao.heel; hpv.S = Math.max(hpv.S, kv.Rc * cosH); hpv.SEq = Math.max(hpv.SEq, kv.Rc * cosH * FK); hpv.V = Math.max(hpv.V, kv.Rc); hpv.VEq = Math.max(hpv.VEq, kv.Rc * FK); }
        }
        if (g === "MS") { var vM = vetorExtremo(b, es[es.length - 1], rc); if (/#\d+$/.test(b.id) && b.mem.p1 && nd0[b.j] && Math.abs(nd0[b.j].y - b.mem.p1[2]) < 1e-3 && Math.abs(nd0[b.j].x + p.origem.x - b.mem.p1[0]) < 1e-3) { res.meia.N = Math.max(res.meia.N, vM.N); res.meia.V = Math.max(res.meia.V, hyp(vM.H, vM.V)); res.meia.NEq = Math.max(res.meia.NEq, vM.N * FK); res.meia.VEq = Math.max(res.meia.VEq, hyp(vM.H, vM.V) * FK); } }
        if (g === "FR") es.forEach(function (e) { if (e.N > res.cinta.N) { res.cinta.N = e.N; res.cinta.NEq = e.N * FK; } });
        if (g === "FR") [[b.i, es[0], b.mem.p0], [b.j, es[es.length - 1], b.mem.p1]].forEach(function (w) {      /* força de EXTREMIDADE do frechal NO CANTO (ponta do membro): é o que a cinta transmite */
          var nn = nd0[w[0]]; if (!nn || Math.abs(nn.x + p.origem.x - w[2][0]) > 1e-3 || Math.abs(nn.z + p.origem.y - w[2][1]) > 1e-3 || Math.abs(nn.y - w[2][2]) > 1e-3) return;
          var vF = vetorExtremo(b, w[1], rc), Nt = Math.max(0, w[1].N), cf = res.cinta.fim; cf.N = Math.max(cf.N, Nt); cf.NEq = Math.max(cf.NEq, Nt * FK); cf.S = Math.max(cf.S, vF.S); cf.SEq = Math.max(cf.SEq, vF.S * FK); });
        if (g === "MI") { var nMI = nd0[b.j]; if (nMI && b.mem.p1 && Math.abs(nMI.x + p.origem.x - b.mem.p1[0]) < 1e-3 && Math.abs(nMI.z + p.origem.y - b.mem.p1[1]) < 1e-3 && Math.abs(nMI.y - b.mem.p1[2]) < 1e-3) { var eMI = es[es.length - 1], vMI = vetorExtremo(b, eMI, rc); cmb.mi = Math.max(cmb.mi, Math.abs(eMI.N)); cmb.miS = Math.max(cmb.miS, vMI.S); } }
        if (g === "PD" && b.mem.tes != null && (b.mem.tes === 0 || b.mem.tes === I.xs.length - 1) && Math.abs(b.mem.p0[1] - p.b / 2) < 1e-3) cmb.pd = Math.max(cmb.pd, Math.abs(es[0].N));      /* montante central da tesoura de extremidade (mesmo nó do BI) */
        if (g === "LB") { es.forEach(function (e) { var sL = sec.LB, vL = MD.barra2022(MD.deAnalise(e, { b: sL.b, h: sL.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); regG("LB", vL.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, vL.governa); regEsb("LB", vL); }); return; }
        if (g === "DV") return;
        es.forEach(function (e) {
          var v = null, s = sec[g];
          if (g === "P" || g === "PO") { var bt = betas(b); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: bt[0] * bt[2], L0z: bt[1] * bt[2], L1: 0.01, classe: CL, perfil: pf })); }
          else if (g === "T" || g === "CM" || g === "FR") { var vao = mgap[b.mem.id]; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: vao, L0z: vao, L1: MD.L1PorBorda(e.Mz, { cima: 0.5, baixo: travB || Math.min(vao, 2) }), classe: CL, perfil: pf })); }
          else if (g === "E") { var Lh = Lhip[b.mem.id], Ln = I.dz * Math.sqrt(2) * Math.sqrt(1 + I.incl * I.incl / 2), kk = kEsp[b.mem.id] ? kEsp[b.mem.id].k : 1; if (kk > 1) e = ext({}, e, { Mz: e.Mz * kk }); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lh, L0z: Lh, L1: MD.L1PorBorda(e.Mz, { cima: Ln, baixo: Lh }), classe: CL, perfil: pf })); }
          else if (g === "BS") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.lp, L0z: CTV.BS.L0z, L1: CTV.BS.L0z, classe: CL, perfil: pf })); }
          else if (g === "BI") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.dz, L0z: CTV.BI.L0z, L1: CTV.BI.L0z, classe: CL, perfil: pf })); }
          else if (g === "MS") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.lp, L0z: I.lp, L1: I.lp, classe: CL, perfil: pf })); }
          else if (g === "MI") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.dz, L0z: p.b / 2, L1: p.b / 2, classe: CL, perfil: pf })); }
          else if (g === "PD" || g === "DG" || g === "MP" || g === "MG" || g === "DX" || g === "DP") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); }
          if (v) { regG(g, v.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, v.governa); regEsb(g, v);
            if (g === "E" && v.lambda) { var cE = res.compressaoE || null, lmE = Math.max(v.lambda[0] || 0, v.lambda[1] || 0); if (!cE || lmE > cE.lambdaMax) res.compressaoE = { barra: b.id, L0y: Lhip[b.mem.id], L0z: Lhip[b.mem.id], lambda: v.lambda.slice(), lambdaMax: lmE, limite: 140, eta: v.eta }; }
            if ((g === "DG" || g === "MG") && v.lambda) { var cpr = res["compressao" + g] || null, lm = Math.max(v.lambda[0] || 0, v.lambda[1] || 0); if (!cpr || lm > cpr.lambdaMax) res["compressao" + g] = { barra: b.id, L0y: b.L, L0z: b.L, lambda: v.lambda.slice(), lambdaMax: lm, limite: 40 * Math.sqrt(12), eta: v.eta }; } }
        });
      });
      Object.keys(fnd).forEach(function (n9) { var nb = nBanzo[n9], f9 = fnd[n9], d9 = f9[0] * nb.t[0] + f9[1] * nb.t[1] + f9[2] * nb.t[2], pr = Math.sqrt(Math.pow(f9[0] - d9 * nb.t[0], 2) + Math.pow(f9[1] - d9 * nb.t[1], 2) + Math.pow(f9[2] - d9 * nb.t[2], 2)) * FK; if (pr > f90Perp[nb.g]) f90Perp[nb.g] = pr; });
      if (cmb.mi > 0) { var pmi = res.pontaMI, Rr = hyp(cmb.mi, cmb.pd); pmi.N = Math.max(pmi.N, cmb.mi); pmi.NEq = Math.max(pmi.NEq, cmb.mi * FK); pmi.S = Math.max(pmi.S, cmb.miS); pmi.SEq = Math.max(pmi.SEq, cmb.miS * FK); pmi.PD = Math.max(pmi.PD, cmb.pd); pmi.PDEq = Math.max(pmi.PDEq, cmb.pd * FK); pmi.R = Math.max(pmi.R, Rr); pmi.REq = Math.max(pmi.REq, Rr * FK); }
      Mx.apoios.forEach(function (ap) {
        var R = rc.reacoes[ap.no]; if (!R) return;
        var o = res.reacoes[ap.no] || (res.reacoes[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, NminEq: 1e9, HmaxEq: 0, grupo: ap.grupo, mem: ap.mem });
        o.Nmax = Math.max(o.Nmax, R[1]); o.Nmin = Math.min(o.Nmin, R[1]); o.Hmax = Math.max(o.Hmax, hyp(R[0], R[2])); o.Mmax = Math.max(o.Mmax, hyp(R[3], R[5])); o.NminEq = Math.min(o.NminEq, R[1] * (R[1] < 0 ? FK : 1)); o.HmaxEq = Math.max(o.HmaxEq, hyp(R[0], R[2]) * FK);
      });
    });
    });
    tag = "env";      /* o que vem depois (F1d, apoio) não é de um modelo só */
    res.torcaoFR = torcaoFR(sec, res.espigao, res.cinta, MD.perfilEResist(CL, perfil("curta")).f.fvd); res.detalheSela = (q.params && q.params.detalheSela) === "torcao" ? "torcao" : "chapa";
    if (res.detalheSela === "torcao" && !res.torcaoFR.ok) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, torcao: true };      /* alternativa: a torção cresce o b primeiro (τT ∝ 1/b², o h se cancela) */
    /* compressão ⊥ às fibras no apoio do frechal sob o banzo inferior / pilar (6.3.3) */
    (function () {
      var cl = MM.classe2022(CL), kmL = perfil("longa").kmod, Rp = 0; function fc90(aCm) { var an = ML.alfaN(aCm); return Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an); }
      Object.keys(res.reacoes).forEach(function (k) { Rp = Math.max(Rp, res.reacoes[k].Nmax); });
      res.apoioEta = { FR: Math.max(Rp > 0 ? 1.03 * Rp / (sec.BI.b * sec.FR.b) / 1000 / fc90(sec.BI.b * 100) : 0, Rp > 0 ? 1.03 * Rp / (sec.FR.b * sec.P.b) / 1000 / fc90(sec.P.b * 100) : 0) };
      if (res.apoioEta.FR > 1 + 1e-9) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, apoio: true };
    })();
    /* F1d = Nd/150 (6.6.4, Figura 6): caso próprio em todos os nós homólogos do banzo comprimido */
    (function () {
      var pfF = perfil("curta"), F1 = { BS: (res.esf.BS ? res.esf.BS.Nc : 0) / 150, BI: (res.esf.BI ? res.esf.BI.Nc : 0) / 150 }, cgF = [], nT = I.xs.length;
      fam.BS.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: [F1.BS, 0, 0, 0, 0, 0] }); }); fam.BI.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: [F1.BI, 0, 0, 0, 0, 0] }); });
      var rF = AN.analisar({ nos: Mf.nos, barras: Mf.barras, apoios: Mf.apoios, casos: [{ id: "F1D", cargas: cgF }] }, { combinacoes: [{ id: "F1D", fatores: { F1D: 1 } }], estacoes: 3, comPCG: false });
      if (!rF.ok) throw new Error("análise (F1d do contraventamento): " + (rF.motivo || JSON.stringify(rF.avisos))); modeloSemFalha(rF.avisos);
      var mxF = { T: 0, LBc: 0, LBt: 0 }, cF = rF.combinacoes.F1D;
      Mf.barras.forEach(function (b) {
        var es = cF.barras[b.id] && cF.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
        if (g === "DX" || g === "DV" || g === "DP") es.forEach(function (e) { var kk = g === "DX" ? "DXn" : (g === "DP" ? "DPn" : "DVn"), gs = g === "DP" ? "DP" : "DX", sD = sec[gs], eT = ext({}, e, { N: Math.abs(e.N) + (nEluDiag[b.id] || 0) }); mxF[kk] = Math.max(mxF[kk] || 0, eT.N); var v = MD.barra2022(MD.deAnalise(eT, { b: sD.b, h: sD.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG(gs, v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb(gs, v); });
        else if (g === "T" || g === "CM") es.forEach(function (e) { mxF.T = Math.max(mxF.T, Math.abs(e.N)); });
        else if (g === "LB") es.forEach(function (e) { var s = sec.LB; mxF.LBc = Math.max(mxF.LBc, Math.max(0, -e.N)); mxF.LBt = Math.max(mxF.LBt, Math.max(0, e.N)); var v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG("LB", v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb("LB", v); });
      });
      if (sec.LB && (mxF.LBc > 0 || mxF.LBt > 0 || res.esf.LB)) { var aL = res.esf.LB || (res.esf.LB = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); aL.Nt = Math.max(aL.Nt, mxF.LBt); aL.Nc = Math.max(aL.Nc, mxF.LBc); aL.NtEq = Math.max(aL.NtEq, mxF.LBt); aL.NcEq = Math.max(aL.NcEq, mxF.LBc); }
      if (sec.DX) { var aD = res.esf.DX || (res.esf.DX = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nD = Math.max(mxF.DXn || 0, mxF.DVn || 0); aD.Nt = Math.max(aD.Nt, nD); aD.Nc = Math.max(aD.Nc, nD); aD.NtEq = Math.max(aD.NtEq, nD); aD.NcEq = Math.max(aD.NcEq, nD); }
      if (sec.DP) { var aP = res.esf.DP || (res.esf.DP = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nP = mxF.DPn || 0; aP.Nt = Math.max(aP.Nt, nP); aP.Nc = Math.max(aP.Nc, nP); aP.NtEq = Math.max(aP.NtEq, nP); aP.NcEq = Math.max(aP.NcEq, nP); }
      if (res.esf.T) { var sT = sec.T, vT = MD.barra2022(MD.deAnalise({ N: -(res.esf.T.Nc + mxF.T), My: 0, Mz: 0, Vy: 0, Vz: 0, T: 0 }, { b: sT.b, h: sT.h, L0y: 2, L0z: 2, L1: 0.01, classe: CL, perfil: pfF })); regG("T", vT.eta, "T (axial + F1d)", "F1d", vT.governa); }
      res.f90Perp = f90Perp; CTV.F1d = F1; CTV.nTes = nT; CTV.Fd = { BS: 2 / 3 * nT * F1.BS, BI: 2 / 3 * nT * F1.BI }; CTV.maxN = mxF; CTV.sec = { BS: sec.BS, BI: sec.BI, LB: sec.LB }; res.contrav = CTV;
    })();
    /* ELS: flecha final (φ, ψ2) por vão entre apoios; balanço (ponta do espigão) com L/limBalanco */
    var PHI = perfil("permanente").phi, psi2 = CA.PSI["Q-cobertura"].psi2, psi1W = CA.PSI.W.psi1;
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var re = null, fm = {}, flech = {}, topo = 0;
    [M, Mb].forEach(function (MX) {      /* ELS pela envolvente dos dois modelos (o modelo b é mais flexível no espigão) */
    re = AN.analisar({ nos: MX.nos, barras: MX.barras, apoios: MX.apoios, casos: modelo.casos }, { combinacoes: els, estacoes: 3, comPCG: true }); modeloSemFalha(re.avisos);
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    var Dd = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; };
    function dfin(id) { var g = Dd("g", id), qd = Dd("q", id); return [0, 1, 2].map(function (k) { return g[k] * (1 + PHI) + qd[k] * (1 + psi2 * PHI); }); }
    function reg(chave, grp, valor, lim, extra) { var e = valor / lim; if (!fm[chave] || e > fm[chave].eta) fm[chave] = ext({ mm: Math.round(valor * 1e5) / 100, limite_mm: Math.round(lim * 1e5) / 100, eta: e, grupo: grp }, extra || {}); flech[grp] = Math.max(flech[grp] || 0, e); }
    var porMem = {}; MX.barras.forEach(function (b) { (porMem[b.m] = porMem[b.m] || []).push(b); });
    function nosDe(bs) { var ids = [], vistos = {}; bs.forEach(function (b) { [b.i, b.j].forEach(function (n) { if (!vistos[n]) { vistos[n] = 1; ids.push(n); } }); }); return ids; }
    G.membros.forEach(function (m) {
      if (m.tracao || ["P", "PO", "PD", "DG", "MP", "MG", "DX", "DV", "DP", "LB"].indexOf(m.g) >= 0) return;
      var bs = porMem[m.id] || []; if (!bs.length) return; var ids = nosDe(bs), L = norm(m.p0, m.p1), t = function (n) { var N = nodo[n], P = [N.x + p.origem.x, N.z + p.origem.y, N.y]; return ((P[0] - m.p0[0]) * (m.p1[0] - m.p0[0]) + (P[1] - m.p0[1]) * (m.p1[1] - m.p0[1]) + (P[2] - m.p0[2]) * (m.p1[2] - m.p0[2])) / (L * L); };
      var sup = m.g === "E" ? [m.tip ? [m.canto[0], m.canto[1], I.Hp] : m.p0, m.p1] : [m.p0].concat(m.nos || []).concat([m.p1]);
      if (m.g === "BS" || m.g === "MS") sup = (m.nos || []).concat([m.p1]).filter(function (P) { return P[2] >= I.Hp - 1e-6; }); else if (m.g === "E") { /* canto → ponta */ }
      var tS = sup.map(function (P) { return ((P[0] - m.p0[0]) * (m.p1[0] - m.p0[0]) + (P[1] - m.p0[1]) * (m.p1[1] - m.p0[1]) + (P[2] - m.p0[2]) * (m.p1[2] - m.p0[2])) / (L * L); }).sort(function (u, v) { return u - v; });
      if (m.g === "T" || m.g === "CM" || m.g === "FR" || m.g === "BI" || m.g === "MI") tS = [0].concat(tS.filter(function (x) { return x > 1e-6 && x < 1 - 1e-6; })).concat([1]);
      var byT = ids.map(function (n) { return { n: n, t: t(n) }; }).sort(function (u, v) { return u.t - v.t; }), k2;
      function ach(tt) { var bst = null; byT.forEach(function (o) { if (Math.abs(o.t - tt) < 1e-4) bst = o; }); return bst; }
      for (k2 = 0; k2 + 1 < tS.length; k2++) {
        var A0 = ach(tS[k2]), B0 = ach(tS[k2 + 1]); if (!A0 || !B0) continue; var dA = dfin(A0.n), dB = dfin(B0.n), vao = (tS[k2 + 1] - tS[k2]) * L;
        byT.forEach(function (o) { if (o.t <= tS[k2] + 1e-4 || o.t >= tS[k2 + 1] - 1e-4) return; var f = (o.t - tS[k2]) / (tS[k2 + 1] - tS[k2]), dn = dfin(o.n), dd = [0, 1, 2].map(function (k3) { return dn[k3] - (dA[k3] + (dB[k3] - dA[k3]) * f); }); reg("vao" + m.g, m.g, Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]), vao / q.limVao, { onde: m.id }); });
      }
      if (m.g === "E" && m.tip) { var tI = tS[0], bal = ach(0), cn = ach(tI); if (bal && cn) { var d1 = dfin(bal.n), d2 = dfin(cn.n); reg("balancoE", "E", Math.sqrt(Math.pow(d1[0] - d2[0], 2) + Math.pow(d1[1] - d2[1], 2) + Math.pow(d1[2] - d2[2], 2)), tI * L / q.limBalanco); } }
    });
    MX.barras.forEach(function (b) { if (b.grupo !== "P" && b.grupo !== "PO") return; var top = b.j, H = Math.abs(b.mem.p1[2] - b.mem.p0[2]); CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) { var d = Dd("w" + c.id, top); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (H / 300)); }); });
    });
    flech.P = Math.max(flech.P || 0, topo); fm.topoPilarVentoFreq_H300 = { eta: topo, grupo: "P" };
    res.flechasMm = fm; res.flechas = flech; res.phi = PHI; res.QCOB = QCOB; res.G2 = g2s; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk, cpiMax: Math.max.apply(null, VT.casos.map(function (c) { return c.cpi; })) }; res.casosVento = VT.casos.map(function (c) { return c.id; });
    res.secoes = copia(sec); res.modelo = M; res.slipT = slipTinfo; Object.defineProperty(res, "modeloB", { value: Mb, enumerable: false }); res.geometria = { info: { nH: I.nH, dz: I.dz, lp: I.lp, xs: I.xs }, tipologia: "T3" };
    res.excepcionais = elu.filter(function (c) { return /^EXC_/.test(c.id); }).map(function (c) { return c.id; });
    Object.defineProperty(res, "_casos", { value: CS, enumerable: false }); Object.defineProperty(res, "_analise", { value: r, enumerable: false }); Object.defineProperty(res, "_elu", { value: elu, enumerable: false });
    res.cargasTotais = cargasTot; res.tipologia = "T3"; res.ventoGeometria = VT.geometria; res.avisosAnalise = r.avisos;
    res.avisos.push("T3: não modelados (declarado): torção por excentricidade do vento (6.6), vento oblíquo, caibros/ripas secundários, rincão (planta em L); travamento inferior das terças adotado " + (travB ? travB + " m" : "= vão (a favor)") + "; espigão com L0 fora do plano = comprimento total do canto à cumeeira (sem crédito das terças).");
    res.avisos.push("T3: espigão, ligação espigão × cumeeira e tesoura de extremidade dimensionados pela ENVOLVENTE de 2 modelos — (a) terça com rigidez axial cheia (espigão como arco com tirante) e (b) estribo da terça no espigão com deslizamento dos pinos (" + slipTinfo.n + " pinos Ø" + Math.round(slipTinfo.d * 1000) + " por ponta, Ku = " + Math.round(slipTinfo.Ku) + " kN/m por pino, NBR 7190-1:2022, 7.1.12): η do espigão (a) " + (res.porModelo.a.E ? res.porModelo.a.E.eta.toFixed(3) : "-") + " × (b) " + (res.porModelo.b.E ? res.porModelo.b.E.eta.toFixed(3) : "-") + ".");
    res.avisos.push("T3: momento de projeto do espigão = MAIOR entre a envolvente dos modelos (a)/(b) e a viga bi-apoiada canto–ápice com as forças VERTICAIS reais das terças (Mz da viga " + (res.espigaoViga ? res.espigaoViga.M.toFixed(2) : "-") + " kN·m na combinação " + (res.espigaoViga ? res.espigaoViga.comb : "-") + "; do modelo " + (res.espigaoViga ? res.espigaoViga.Mmodelo.toFixed(2) : "-") + " kN·m). EXIGÊNCIA DE PROJETO: terças contínuas sobre a tesoura/meia-tesoura, ou emenda rígida; emenda articulada sobre a tesoura não é permitida sem novo cálculo. A telha apoia nas terças; caibros sobre o espigão não estão no modelo.");
    res.avisos.push("T3: vento — ADICIONADOS à envolvente (sem substituir) os casos de vento paralelo à cumeeira com cpe = +0,2 na água de cabeceira a barlavento (" + CS.filter(function (c) { return c.extra; }).map(function (c) { return c.id; }).join(", ") + "); premissa a confirmar pelo RT.");
    return res;
  }

  function t3Pior(r, sec) {
    var z = {}; Object.keys(r.grupos).forEach(function (g) { z[g] = Math.max(r.grupos[g].eta, (r.flechas && r.flechas[g]) || 0); });
    Object.keys(r.flechas || {}).forEach(function (g) { if (z[g] == null) z[g] = r.flechas[g]; });
    Object.keys(r.apoioEta || {}).forEach(function (g) { z[g] = Math.max(z[g] || 0, r.apoioEta[g]); });
    if (r.torcaoFR && sec.FR && r.detalheSela === "torcao") z.FR = Math.max(z.FR || 0, r.torcaoFR.eta);      /* torção da ponta do frechal no canto (cresce o FR) */
    if (r.contrav && r.contrav.slip) ["DX", "DP"].forEach(function (g) { if (sec[g] && r.contrav.slip[g] && r.contrav.slip[g].cabe === false) z[g] = Math.max(z[g] || 0, 1.01); });
    if (r.contrav) { if (sec.DP) z.DP = Math.max(z.DP || 0, r.contrav.razao); if (sec.DX) z.DX = Math.max(z.DX || 0, r.contrav.razao); }
    return z;
  }
  function t3Crescer(q, sec, g, r) {
    var L = q.limites[g] || { hMax: 0.5, bMax: 0.25 }, s = sec[g], pa = q.passo.altura, pl = q.passo.largura;
    if (g === "P" || g === "PO") { if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); s.h = s.b; return true; } return false; }
    if ((g === "DX" || g === "DP") && r && r.contrav && r.contrav.slip && r.contrav.slip[g] && r.contrav.razao > 1 + 1e-9 && r.contrav.slip[g].cabe !== false && (s.nMin || 0) < 16) { s.nMin = Math.max(s.nMin || 0, r.contrav.slip[g].n) + 2; return true; }
    var eb = r && r.esbeltez && r.esbeltez[g];
    if (!(eb && eb.eixo === "b") && s.h + pa <= L.hMax + 1e-9) { s.h = r2(s.h + pa); return true; }
    if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; }
    return false;
  }
  function t3Dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var sec = copia(partida), hist = [], it, r, pior, falha, mexeu, q;
    if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!proj.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    for (it = 0; it < (opcoes.maxIter || 30); it++) {
      try { r = t3Rodar(proj, sec); } catch (ex) {
        if (!/instável|mecanismo/.test(String(ex.message)) || it >= 12) throw ex;
        var gr = false; Object.keys(sec).forEach(function (k) { if (t3Crescer(proj._pad3 || t3Padrao(proj), sec, k)) gr = true; }); if (!gr) throw ex; hist.push({ it: it, sec: copia(sec), instavel: String(ex.message).slice(0, 120) }); continue;
      }
      q = proj._pad3; pior = t3Pior(r, sec); hist.push({ it: it, sec: copia(sec), pior: pior }); if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1 && sec[k]; });
      if (!falha.length) return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior };
      mexeu = false; falha.sort(function (u, v) { return pior[v] - pior[u]; }).forEach(function (k) { if (t3Crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }

  /* base engastada dos pilares (rigidez Kθ pela ligação), como a t2Base */
  function t3Base(proj, r, sec) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(proj._pad3.classe), env = {}, out = { porGrupo: {} }, gov = null, Lp = Math.abs(proj._pad3.params.peDireito);
    Object.keys(r.reacoes).forEach(function (k) { var o = r.reacoes[k], e = env[o.grupo] || (env[o.grupo] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, grupo: o.grupo }); e.Nmax = Math.max(e.Nmax, o.Nmax); e.Nmin = Math.min(e.Nmin, o.Nmin); e.Hmax = Math.max(e.Hmax, o.Hmax); e.Mmax = Math.max(e.Mmax, o.Mmax); });
    Object.keys(env).forEach(function (g) {
      var o = env[g], P = sec[g], entrada = { secoes: { T: { b: 0.1, h: 0.2 }, V: { b: 0.2 }, VG: { b: 0.1, h: 0.2 }, P: { forma: "quadrado", b: P.b, h: P.h } }, reacoes: { B0: { Nmax: o.Nmax, Nmin: o.Nmin, Hmax: o.Hmax, Mmax: o.Mmax } },
        lig: { tercaV: { Tmax: 0.1, Cmax: 0.1, Hmax: 0.1 }, pilarTopo: { Tmax: 0.1, Cmax: 0, Hmax: 0.1 }, escora: { Nmax: 0.1 }, bloqueador: { Nmax: 0.1 }, verga: { Vmax: 0.1, Vy: 0.1, Vz: 0.1, Nmax: 0.1 }, pendural: 0.1 }, fitaNmax: 0.1, hV: 0.3, cfg: { kmod: r.kmodRef, rhok: cl.rhok, k90Tipo: "conifera" } };
      entrada.KthetaMin = (Math.PI / 3) * Math.tan(Math.PI / 3) * (cl.Ec0m * 1e3 * P.b * Math.pow(P.h, 3) / 12) / Lp;
      var L = ML.pacoteT1(entrada); out.porGrupo[g] = { LG: L, Ktheta: L.rigidezBase ? L.rigidezBase.Ktheta : null, pilar: o }; if (!gov || o.Mmax > env[gov].Mmax) gov = g;
    });
    var LG = out.porGrupo[gov].LG;
    Object.keys(out.porGrupo).forEach(function (g) { if (g === gov) return; var x = out.porGrupo[g].LG; (x.verificacoes || []).forEach(function (v) { if (/^base/.test(v.nome)) LG.verificacoes.push({ nome: v.nome + "[" + g + "]", eta: v.eta, ok: v.ok }); }); if (x.ok === false) LG.ok = false; });
    return { LG: LG, Ktheta: out.porGrupo[gov].Ktheta, pilar: env[gov], grupoGov: gov, porGrupo: out.porGrupo };
  }

  var MadT3Calc = { slipTerca: slipTerca, slipDiag: slipDiag, slipFator: slipFator, pressaoParede: pressaoParede, vigaEspigao: vigaEspigao, torcaoFR: torcaoFR, T3_LIM: T3_LIM, padrao: t3Padrao, montar: t3Montar, casos: t3Casos, rodar: t3Rodar, dimensionar: t3Dimensionar, pior: t3Pior, crescer: t3Crescer, base: t3Base, vento: t3Vento, familias: familias, kMedido: kMedido, maxGap: maxGap, perfilFn: perfilFn, modulos: modulos, ret: ret, durClasse: durClasse, modeloSemFalha: modeloSemFalha, diagNo: diagNo };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3Calc;
  else global.MadT3Calc = MadT3Calc;
})(typeof window !== "undefined" ? window : this);

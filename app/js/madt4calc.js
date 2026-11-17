/* =====================================================================
 * madt4calc.js — T4 (telhado sextavado/oitavado): MODELO 3D, CARGAS, VENTO, ANÁLISE (2ª ordem), DIMENSIONAMENTO (NBR 7190-1:2022). Motor PURO, ES5, Node-testável.
 * Reaproveita do T3 (madt3calc.js) o que é comum e genérico: montagem das barras (montar), deslizamento dos pinos (slipDiag/slipTerca), viga canto–ápice (vigaEspigao),
 * crescimento de seção (crescer), pior (pior), base dos pilares (base) e os utilitários; acrescenta o que é do polígono: faixas por água, vento em n águas, cubo do ápice (envolvente
 * de 3 modelos: estribo rígido / estribo com deslizamento / SEM o pilar central), travamento do topo MEDIDO, torção do frechal com cos β. Fontes e decisões: docs/madeira/T4-REFERENCIA.md.
 * Convenção do solver: x = X, y = vertical, z = Z da planta. NÃO modelado (declarado): torção por excentricidade do vento, vento em outros azimutes, caibros secundários e ripas.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T4 = req("MadT4", "madt4.js"), C3 = req("MadT3Calc", "madt3calc.js"), U = T4._util, D = U.D, ext = U.ext, hyp = U.hyp, r2 = U.r2, br = U.br, copia = U.copia, norm = U.norm;
  var T4_LIM = ext({}, C3.T3_LIM, { PC: { bMax: 0.40, hMax: 0.40 }, CB: { hMax: 0.48, bMax: 0.24 } });
  function keyDe(proj) { return JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; }); }

  function t4Padrao(proj) {
    var Dm = D(), q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 2; q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150; q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.cargas = ext({ outros: 0 }, q.cargas || {}); q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {}); q.limites = ext({}, T4_LIM, q.limites || {});
    var cl = Dm.MM.classe2022(q.classe); if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta);
    q.params = T4.parametros(q.params); return q;
  }

  /** VENTO: a NBR 6123:2023 não traz coeficientes de telhado POLIGONAL (só uma e duas águas, Tabelas 5 e 6). PREMISSA CONSERVADORA declarada: o campo de pressões da Tabela 5 (duas águas) do QUADRADO circunscrito
   *  (lado 2R, mesma altura e inclinação) sobre as n águas, normal a cada uma, com o beiral a barlavento (+0,8·q por baixo); azimutes: os eixos do quadrado (0° e 90°; 180° e 270° são espelhos do polígono) e,
   *  no octógono, também o giro de 22,5° (vento sobre o canto). */
  function t4Vento(q, G, avisos) {
    var Dm = D(), p = G.p, I = G.info, th = Math.atan(p.incl) * 180 / Math.PI, der = { a: p.n === 6 ? 2 * p.R : 2 * I.apotema, b: 2 * I.apotema, h: I.Hp - p.baseZ, hCumeeira: I.Hap - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" };
    var aberto = p.fechamento === "aberto"; if (aberto) der.aberta = true;
    var geo = ext({ nervuras: "retangulares" }, (q.vento && q.vento.geometria) || {}, der), ent = ext({}, q.vento, { geometria: geo }); if (aberto) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: false }; }); }
    var key = JSON.stringify(ent);
    if (q._vento && q._ventoKey === key) return q._vento;
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: true, vedacao: "misto" }; }); avisos.push("T4: faces do vento não informadas — adotadas as 4 fechadas (vedação mista, permeável)."); }
    var r = Dm.VE.calcular(ent, { todasDirecoes: true, obliquos: true });
    if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros));
    if (aberto) avisos.push("T4: PREMISSA DE VENTO (faces ABERTAS) — cobertura ISOLADA: NBR 6123:2023, item 8.2 — " + ((r.avisos || []).some(function (t) { return /fora de 8\.2\.3/.test(t); }) ? "fora das condições da 8.2.3 (0,07 ≤ tg θ ≤ 0,6 e h ≥ 0,5·l2) a norma manda calcular como edificação fechada de mesma cobertura, cpi = +0,8 e −0,3 (8.2.4)" : "Tabela 18 (cobertura isolada a duas águas planas simétricas)") + ", do retângulo circunscrito (a = " + br(der.a) + " m × b = " + br(der.b) + " m, mesma altura e inclinação), coeficientes líquidos (as duas faces) projetados sobre as " + p.n + " águas, normal a cada uma; sem paredes e sem abertura dominante; a Tabela 18 é de duas águas planas, o polígono NÃO está nela — adaptação declarada, a confirmar pelo RT (ou túnel de vento). Avisos do cálculo de vento: " + (r.avisos || []).slice(0, 3).join(" | "));
    else avisos.push("T4: PREMISSA DE VENTO — a NBR 6123:2023 NÃO traz coeficientes para telhado poligonal (só uma e duas águas, Tabelas 5 e 6). Adotado, de forma CONSERVADORA, o campo de pressões da Tabela 5 (duas águas) do RETÂNGULO CIRCUNSCRITO ao polígono (a = " + br(der.a) + " m na direção da cumeeira equivalente × b = " + br(der.b) + " m, mesma altura de beiral e inclinação) projetado sobre as " + p.n + " águas, normal a cada uma, com o beiral a barlavento (+0,8·q por baixo); azimutes 0° e 90° do quadrado" + (p.n === 8 ? " e o giro de 22,5° (vento sobre o canto; os pontos que saem do retângulo recebem o tratamento de beiral, a favor)" : " (no hexágono o eixo X passa pelos cantos e o Z pelas faces: vento sobre o canto e sobre a face)") + "; cpi = −0,3 e 0. A confirmar pelo RT (ou por ensaio em túnel de vento) antes de emitir para execução.");
    r.rect = { a: der.a, b: der.b }; q._vento = r; q._ventoKey = key; return r;
  }
  function variantesVento(n) { var v = [{ phi: 0, dirs: [0, 90] }]; if (n === 8) v.push({ phi: Math.PI / 8, dirs: [0, 90] }); return v; }

  /** MODELO (a, b, c): a = estribo da terça rígido, com o pilar central (se houver); b = estribo com deslizamento; c = SEM o pilar central (o cubo não é apoiado: espigões em arco com o anel como tirante). Devolve o modelo do C3.montar + apoio do PC */
  function t4Montar(q, G, sec, variante) {
    var Gx = variante === "c" ? { p: G.p, info: G.info, membros: G.membros.filter(function (m) { return m.g !== "PC"; }) } : G, M = C3.montar(q, Gx, sec, false, variante === "b" ? "b" : "a"), p = G.p, X0 = p.origem.x, Y0 = p.origem.y;
    Gx.membros.forEach(function (m) { if (m.g !== "PC") return; var no = M.nos.filter(function (n) { return Math.abs(n.x - (m.p0[0] - X0)) < 1e-6 && Math.abs(n.y - m.p0[2]) < 1e-6 && Math.abs(n.z - (m.p0[1] - Y0)) < 1e-6; })[0]; if (no) M.apoios.push({ no: no.id, ux: true, uy: true, uz: true, ry: true, rx: true, rz: true, grupo: "PC", mem: m.id }); });
    if (variante === "d" && q._slipC) {      /* MODELO (d): a CINTA (ponta do frechal no canto) desliza — pinos em série, Ku = 2/3·Kser (7.1.12), mola de UMA ponta k = n·Ku */
      var Ef = C3.modulos(D().MM.classe2022(q.classe)).E, mx = {};
      M.barras.forEach(function (b) { if (b.grupo === "FR") { var n = +/#(\d+)$/.exec(b.id)[1]; mx[b.m] = Math.max(mx[b.m] || 0, n); } });
      M.barras.forEach(function (b) { if (b.grupo !== "FR") return; var n = +/#(\d+)$/.exec(b.id)[1], ext2 = (n === 0 ? 1 : 0) + (n === mx[b.m] ? 1 : 0); if (!ext2) return; var f = 1 / (1 + Ef * sec.FR.b * sec.FR.h / (b.L * q._slipC.k / ext2)); b.secao.A *= f; b.slipC = f; b.pesoEsp = q.pesoMLC / f; });
    }
    if (q.diagnostico && q.diagnostico.semCintaFR) M.barras.forEach(function (b) { if (b.grupo === "FR") b.secao.A *= 1e-4; });      /* DIAGNÓSTICO (só teste/projetar): FR sem rigidez axial = SEM cinta */
    M.G = G; return M;
  }
  /** estribo da CINTA com deslizamento: o mesmo caminho do slipTerca (pinosAxiais + Ku = 2/3·Kser, 7.1.12), grupo na seção do frechal */
  function slipCinta(q, sec, F, S, perfil) {
    var Dm = D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), pc = perfil("curta"), cL = ML.cfg({ kmod: pc.kmod, kmod1: pc.kmod1, kmod2: pc.kmod2, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" });
    var pn = ML.pinosAxiais(cL, "cinta × frechal", Math.max(F, 0.05), Math.max(S, 0.05), sec.FR.b, sec.FR.h, 0.008, {}), n = pn && pn.n ? pn.n : 2, d = pn && pn.d ? pn.d : 0.012, Ku = ML.kuPino(d, cl.rhok, true, 2);
    return { n: n, d: d, Ku: Ku, k: n * Ku, F: F, S: S, formula: "k_cinta = n·Ku (uma ponta); Ku = 2/3·Kser, Kser = ρm^1,5·d/23 × 2 × 2 planos" };
  }
  /** VIGA RÍGIDA canto–ápice com w·Lc (apoios rígidos, balanço do beiral): cargas nodais P = (g2·ws + peso da terça)·Lc das duas terças + peso do espigão; ELU 1,35·G + 1,5·Q. Piso do momento de projeto do espigão (revisão do RT) */
  function vigaRigida(q, G, sec, g2s, QCOB) {
    var I = G.info, cb = Math.cos(I.beta), T = I.R, gT = sec.T.b * sec.T.h * q.pesoMLC, qE = sec.E.b * sec.E.h * q.pesoMLC * Math.sqrt(1 + Math.pow(I.incl * cb, 2)), t0 = -I.beiral / cb, lin = [];
    G.membros.forEach(function (m) { if (m.g === "T" && m.agua === 0) lin.push({ d: m.d, ws: m.ws, Lc: norm(m.p0, m.p1) }); });
    function viga(fg, fq) {
      var cg = [], Pt = 0, Ra = 0, k, N = 2000, dt = (T - t0) / N, x, mx = 0;
      lin.forEach(function (l) { cg.push({ t: l.d / cb, P: (fg * (g2s * l.ws + gT) + fq * QCOB.q * l.ws / I.sc) * l.Lc }); });
      for (k = 0; k < N; k++) cg.push({ t: t0 + (k + 0.5) * dt, P: fg * qE * dt });
      cg.forEach(function (c) { Pt += c.P; Ra += c.P * c.t / T; });
      var Rc = Pt - Ra; function M(x2) { var m = x2 >= 0 ? Rc * x2 : 0; cg.forEach(function (c) { if (c.t < x2) m -= c.P * (x2 - c.t); }); return m; }
      for (x = t0; x <= T + 1e-9; x += 0.005) mx = Math.max(mx, Math.abs(M(x)));
      return { M: mx, Ra: Ra, Rc: Rc };
    }
    var ch = viga(1, 1), el = viga(1.35, 1.5); return { M_car: ch.M, Ra_car: ch.Ra, Rc_car: ch.Rc, M_elu: el.M, Ra_elu: el.Ra, Rc_elu: el.Rc };
  }

  /** CASOS DE CARGA: G1, G2 (telha por faixa), Q, vento por azimute, abertura dominante */
  function t4Casos(q, M, VT, QCOB, g2s) {
    var Dm = D(), VE = Dm.VE, D2 = Dm.D2, G = M.G, p = G.p, I = G.info, cs = M.cs, sn = M.sn, C = [], DG = q.diagnostico || {}, R = p.R, cx = I.cx, cz = I.cz, RC = VT.rect || { a: 2 * R, b: 2 * R }, PAR = { x0: 0, x1: RC.a, y0: 0, y1: RC.b };
    var rb = M.barras.filter(function (x) { return x.mem.faces; }), pil = M.barras.filter(function (x) { return x.grupo === "P"; }), g2 = [], qq = [];
    function uPane(k) { var a = I.angLado(k); return [Math.cos(a), Math.sin(a)]; }
    rb.forEach(function (x) { var ws = 0; x.mem.faces.forEach(function (f) { ws += f.ws; }); g2.push({ tipo: "barra", barra: x.id, q: [0, -g2s * ws, 0] }); qq.push({ tipo: "barra", barra: x.id, q: [0, -QCOB.q * ws / I.sc, 0] }); });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "telha + ripas", cargas: g2 });
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de cobertura", cargas: qq });
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    function rot(dx, dy, phi) { return [dx * Math.cos(phi) + dy * Math.sin(phi), -dx * Math.sin(phi) + dy * Math.cos(phi)]; }
    function teto(cv, phi) {
      var cg = [];
      rb.forEach(function (x) {
        var A = nodo[x.i], B = nodo[x.j], m = x.mem, s, NS = 3;
        for (s = 0; s < NS; s++) {
          var t0 = s / NS, t1 = (s + 1) / NS, tm = (t0 + t1) / 2, X = A.x + (B.x - A.x) * tm + p.origem.x, Y = A.z + (B.z - A.z) * tm + p.origem.y, fx = [0, 0, 0];
          m.faces.forEach(function (F) {
            var wp = F.ws / I.sc, pp = 0, u = uPane(F.pane);
            [-wp / 2 + 0.01, 0, wp / 2 - 0.01].forEach(function (o) { var r = rot(X + u[0] * o - cx, Y + u[1] * o - cz, phi); pp += D2._pressaoTeto(PAR, cv, r[0] + RC.a / 2, r[1] + RC.b / 2); }); pp /= 3;
            var nrm = [sn * u[0], cs, sn * u[1]]; fx[0] += -pp * nrm[0] * F.ws; fx[1] += -pp * nrm[1] * F.ws; fx[2] += -pp * nrm[2] * F.ws;
          });
          cg.push({ tipo: "barra", barra: x.id, q: fx, a: t0, b: t1 });
        }
      });
      return cg;
    }
    function pressParede(cv, u, X, Y, phi) {      /* pressão na parede de normal externa u: mistura das faces do quadrado pelo quadrado dos cossenos (premissa declarada) */
      var ur = rot(u[0], u[1], phi), rp = rot(X - cx, Y - cz, phi), Xq = rp[0] + RC.a / 2, Zq = rp[1] + RC.b / 2, fX = ur[0] < 0 ? "frente" : "fundo", fZ = ur[1] < 0 ? "esquerda" : "direita";
      return ur[0] * ur[0] * C3.pressaoParede(cv, fX, Zq) + ur[1] * ur[1] * C3.pressaoParede(cv, fZ, Xq);
    }
    function paredes(cv, phi) {
      var cg = []; pil.forEach(function (x) { var A = nodo[x.i]; x.mem.partes.forEach(function (pt) { var pr = pressParede(cv, pt.u, A.x + p.origem.x, A.z + p.origem.y, phi) * pt.trib; cg.push({ tipo: "barra", barra: x.id, q: [-pr * pt.u[0], 0, -pr * pt.u[1]] }); }); });
      return cg;
    }
    var n = 0, azim = variantesVento(p.n);
    azim.forEach(function (av) { VT.casos.forEach(function (cv) {
      if (av.dirs.indexOf(cv.direcao) < 0) return;
      var eh0 = /cpi0/.test(cv.id);
      C.push({ id: "W" + (n++), tipo: "W", direcao: cv.direcao, azimute: Math.round(av.phi * 180 / Math.PI), nome: (cv.nome || cv.id) + (av.phi ? " (giro de " + Math.round(av.phi * 180 / Math.PI * 10) / 10 + "°)" : ""), cargas: teto(cv, av.phi).concat(paredes(cv, av.phi)), q: cv.q, cpi0: eh0 });
    }); });
    var dominante = function (dcp, sg) {
      var qd = sg * dcp.p, cd = [];
      rb.forEach(function (x) { var m = x.mem; if (m.d != null && m.d < -1e-6) return; m.faces.forEach(function (F) { var u = uPane(F.pane); cd.push({ tipo: "barra", barra: x.id, q: [qd * sn * u[0] * F.wsIn, qd * cs * F.wsIn, qd * sn * u[1] * F.wsIn] }); }); });
      pil.forEach(function (x) { x.mem.partes.forEach(function (pt) { cd.push({ tipo: "barra", barra: x.id, q: [qd * pt.trib * pt.u[0], 0, qd * pt.trib * pt.u[1]] }); }); });
      return cd;
    };
    if (p.fechamento === "aberto") return C;      /* cobertura isolada: sem abertura dominante */
    var dcp = VE.casoAberturaDominante(VT.q); C.push({ id: "DCPI", tipo: "E", nome: dcp.nome, cargas: dominante(dcp, 1) });
    var dcs = DG.semDominanteSuccao ? null : VE.casoAberturaDominanteSuccao(VT, VT.q); if (dcs) C.push({ id: "DCPIS", tipo: "E", nome: dcs.nome, cargas: dominante(dcs, -1), dcpi: dcs.cpi });
    return C;
  }

  /** torção nas pontas do frechal no canto: o empuxo H do espigão, a δ = h_FR/2 acima do eixo, tem componente ⊥ a cada frechal H·cos β (o espigão bissecta o ângulo interno do canto; no quadrado, β = 45° dá H/√2 da T3) */
  /** torção (detalhe ALTERNATIVO: sela só sobre o frechal): T = H·δ/(2·cos β) — mais preciso que o H·cos β·δ anterior (cada frechal leva metade do empuxo transversal H/(2·cos β) do espigão que bissecta o canto); τT = T/(α·a·c²) com a = h, c = b e δ = h/2: o h SE CANCELA (τT = H/(4·cos β·α·b²)), logo só o b resolve */
  function torcaoFR4(sec, E, cinta, fvd, beta) {
    var f = sec.FR, dlt = f.h / 2, a = Math.max(f.b, f.h), c = Math.min(f.b, f.h), al = 1 / (3 + 1.8 * c / a), Hh = Math.max(E.heel.HEq || 0, E.heel.H || 0), T = Hh * dlt / (2 * Math.cos(beta)), tT = T / (al * a * c * c) / 1e3, Sq = (cinta.fim && cinta.fim.SEq) || 0, tV = 1.5 * Sq / (f.b * f.h) / 1e3, eta = (tV + tT) / fvd;
    return { delta: dlt, H: Hh, T: T, alfa: al, a: a, c: c, tau_T: tT, tau_V: tV, fvd: fvd, eta: eta, ok: eta <= 1 + 1e-9, fator: 1 / (2 * Math.cos(beta)) };
  }

  /** travamento do TOPO dos pilares, MEDIDO no modelo: 1 kN em cada topo de pilar no sentido +X e +Z; K = 1/(deslocamento máximo). Exigido (a favor): K ≥ 2·N_cr/L, N_cr = π²·EI/L² do pilar (Winter, travamento ideal). Só com as diagonais das paredes (DP) */
  function kTopo(q, M, sec) {
    var AN = D().AN, MM = D().MM, cl = MM.classe2022(q.classe), E = cl.Ec0m * 1e3, P = sec.P, L = Math.abs(M.G.p.peDireito), EI = E * Math.min(P.b * Math.pow(P.h, 3), P.h * Math.pow(P.b, 3)) / 12, Ncr = Math.PI * Math.PI * EI / (L * L), Kmin = 2 * Ncr / L, tops = {};
    M.barras.forEach(function (b) { if (b.grupo === "P") tops[b.j] = 1; });
    var ids = Object.keys(tops), out = { K: 1e12, Kmin: Kmin, Ncr: Ncr, nPilares: ids.length };
    [[1, 0, 0], [0, 0, 1]].forEach(function (dv) {
      var cg = ids.map(function (n) { return { tipo: "no", no: n, F: [dv[0], dv[1], dv[2], 0, 0, 0] }; }), r = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: [{ id: "K", cargas: cg }] }, { combinacoes: [{ id: "K", fatores: { K: 1 } }], estacoes: 3, comPCG: false });
      if (!r.ok) throw new Error("análise (travamento do topo): " + (r.motivo || JSON.stringify(r.avisos)));
      var u = 0; ids.forEach(function (n) { var d = r.combinacoes.K.desloc[n] || [0, 0, 0]; u = Math.max(u, Math.abs(d[0] * dv[0] + d[2] * dv[2])); }); out.K = Math.min(out.K, u > 1e-12 ? 1 / u : 1e12);
    });
    out.ok = out.K >= Kmin; return out;
  }

  function vetorExtremo(b, e) { var ex = b.ax, ey = b.vy, ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]], F = [0, 1, 2].map(function (k) { return e.N * ex[k] + e.Vy * ey[k] + e.Vz * ez[k]; }); return { N: Math.abs(e.N), S: hyp(e.Vy, e.Vz), H: hyp(F[0], F[2]), V: Math.abs(F[1]) }; }
  function acum(o, v, FK) { o.N = Math.max(o.N, v.N); o.S = Math.max(o.S, v.S); o.H = Math.max(o.H, v.H); o.V = Math.max(o.V, v.V); o.NEq = Math.max(o.NEq, v.N * FK); o.SEq = Math.max(o.SEq, v.S * FK); o.HEq = Math.max(o.HEq, v.H * FK); o.VEq = Math.max(o.VEq, v.V * FK); }
  function zero() { return { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 }; }

  /* ---------------------------------------------------------------- RODAR */
  function t4Rodar(proj, sec) {
    var Dm = D(), AN = Dm.AN, CA = Dm.CA, MM = Dm.MM, MD = Dm.MD, key = keyDe(proj), q = proj._pad4;
    if (!q || proj._pad4Key !== key) { q = proj._pad4 = t4Padrao(proj); proj._pad4Key = key; }
    q._krEf = proj._krBase != null ? proj._krBase : q.krBase;
    sec = copia(sec); if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!q.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    if (q.params.pilarCentral && !sec.PC) sec.PC = { b: 0.28, h: 0.28 }; if (q.params.caibro && !sec.CB) sec.CB = { b: 0.10, h: 0.24 };
    var G = T4.geometria(q.params), p = G.p, I = G.info, perfil = C3.perfilFn(q), CL = q.classe, mod0 = C3.modulos(MM.classe2022(q.classe)), avisos = [], temPC = !!p.pilarCentral;
    var QCOB = CA.sobrecargaCobertura(p.incl * 100, { empocamentoVerificado: !!q.empocamentoVerificado }), g2s = p.telha.peso + q.cargas.outros;
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo); (QCOB.avisos || []).forEach(function (t) { avisos.push(t); });
    var M = t4Montar(q, G, sec, "a"), VT = t4Vento(q, G, avisos), CS = t4Casos(q, M, VT, QCOB, g2s), porB = {}; M.barras.forEach(function (b) { porB[b.id] = b; });
    var cargasTot = {}; CS.forEach(function (c) { var t = [0, 0, 0]; c.cargas.forEach(function (k) { var b = k.tipo === "barra" ? porB[k.barra] : null; if (!b || !k.q) return; var fr = (k.b == null ? 1 : k.b) - (k.a == null ? 0 : k.a); for (var z = 0; z < 3; z++) t[z] += k.q[z] * b.L * fr; }); cargasTot[c.id] = t; });
    var normais = CS.filter(function (c) { return c.tipo !== "E"; });
    var combs = CA.combinacoes(normais.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    CS.filter(function (c) { return c.tipo === "W" && c.cpi0; }).forEach(function (c) { CS.filter(function (d) { return d.tipo === "E"; }).forEach(function (dc) { var f = { G1: 1, G2: 1 }; f[c.id] = 1; f[dc.id] = 1; elu.push({ id: "EXC_" + c.id + "_" + dc.id, nome: "excepcional: " + c.nome + " + " + dc.nome, tipo: "ELU", fatores: f, segundaOrdem: true }); }); });
    function analisa(Mx) { var rx = AN.analisar({ nos: Mx.nos, barras: Mx.barras, apoios: Mx.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) }, { combinacoes: elu, estacoes: 3, comPCG: true }); if (!rx.ok) throw new Error("análise: " + (rx.motivo || JSON.stringify(rx.avisos)) + C3.diagNo(Mx, rx.motivo)); return rx; }
    var r = analisa(M);
    q._slip = null; q._slipT = null; var slipInfo = null;
    if (!q._semSlip && (sec.DX || sec.DP)) {
      var fRig = { DX: 0, DP: 0 }, KREF0 = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREF0 / perfil(C3.durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "DX" && b0.grupo !== "DP") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fRig[b0.grupo] = Math.max(fRig[b0.grupo], Math.max(0, e0.N) * FK0); }); }); });
      slipInfo = C3.slipDiag(q, sec, fRig, perfil, M.barras); q._slip = slipInfo; M = t4Montar(q, G, sec, "a"); r = analisa(M);
    }
    var slipTinfo = null, Mb, rb, Mc = null, rc3 = null, Md, rd, slipCinfo = null;
    (function () {
      var fT = 0, vT = 0, KREFT = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREFT / perfil(C3.durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "T") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fT = Math.max(fT, Math.abs(e0.N) * FK0); vT = Math.max(vT, hyp(e0.Vy, e0.Vz) * FK0); }); }); });
      slipTinfo = C3.slipTerca(q, sec, fT, vT, perfil); q._slipT = slipTinfo; Mb = t4Montar(q, G, sec, "b"); rb = analisa(Mb);
      if (temPC) { Mc = t4Montar(q, G, sec, "c"); rc3 = analisa(Mc); }
      var fC = 0, vC = 0; elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREFT / perfil(C3.durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "FR") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fC = Math.max(fC, Math.max(0, e0.N) * FK0); vC = Math.max(vC, hyp(e0.Vy, e0.Vz) * FK0); }); }); });
      slipCinfo = slipCinta(q, sec, fC, vC, perfil); q._slipC = slipCinfo; Md = t4Montar(q, G, sec, "d"); rd = analisa(Md);
    })();
    C3.modeloSemFalha(r.avisos);
    /* travamento do topo dos pilares: medido (só com as diagonais das paredes) */
    var KT = sec.DP ? kTopo(q, M, sec) : { K: 0, Kmin: 1, ok: false, nPilares: 0 }, topoTravado = !!(KT.ok && sec.DP);
    var res = { grupos: {}, esbeltez: {}, reacoes: {}, esf: {}, combinacoes: elu.length, kmodRef: perfil("curta").kmod, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, avisos: avisos, cinta: { N: 0, NEq: 0, fim: { N: 0, NEq: 0, S: 0, SEq: 0 } }, porModelo: { a: {}, b: {}, c: {}, d: {} }, cubo: { Hres: 0, Vres: 0 },
      espigao: { heel: zero(), apice: zero() }, caibro: { pe: zero(), apice: zero() }, pilarCentral: { N: 0, Nt: 0, NEq: 0, S: 0, SEq: 0 }, topo: KT };
    res.creditoTopo = { aplicado: topoTravado, K: KT.K, Kmin: KT.Kmin, motivo: topoTravado ? "rigidez lateral do topo dos pilares MEDIDA no modelo = " + Math.round(KT.K) + " kN/m ≥ 2·Ncr/L = " + Math.round(KT.Kmin) + " kN/m (diagonais das paredes + anel + espigões): topo travado, L0 pelo modelo engastado-apoiado" : "travamento do topo NÃO provado (rigidez medida " + Math.round(KT.K) + " kN/m < exigida " + Math.round(KT.Kmin) + " kN/m, ou paredes sem diagonais): SEM crédito de topo — pilar em balanço com mola de base" };
    avisos.push("T4: " + res.creditoTopo.motivo + ".");
    var tag = "a";
    function regEsb(gp, v) { if (!v || !v.esbelto) return; var lam = v.lambda, lx = Array.isArray(lam) ? lam[0] : lam, ly = Array.isArray(lam) ? lam[1] : lam, mx = Math.max(lx || 0, ly || 0), a1 = res.esbeltez[gp]; if (!a1 || mx > a1.lambdaMax) res.esbeltez[gp] = { esbelto: true, eixo: (ly || 0) >= (lx || 0) ? "b" : "h", lambdaMax: mx }; }
    function regG(gp, eta, onde, comb, gov) { if (!res.grupos[gp] || eta > res.grupos[gp].eta) res.grupos[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; var pm = res.porModelo[tag]; if (pm && (!pm[gp] || eta > pm[gp].eta)) pm[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; }
    var Lcol = {}, KT0 = {};
    function betas(b) {
      var P = sec[b.grupo], Cb = (q._krEf !== null && typeof q._krEf === "object") ? (q._krEf[b.grupo] != null ? q._krEf[b.grupo] : 1e9) : (q._krEf != null ? q._krEf : 1e9), EIh = mod0.E * P.b * Math.pow(P.h, 3) / 12, EIb = mod0.E * P.h * Math.pow(P.b, 3) / 12, kk = b.grupo;
      if (!Lcol[kk]) { var Lb = Math.abs(b.mem.p1[2] - b.mem.p0[2]), KtMin = (Math.PI / 3) * Math.tan(Math.PI / 3) / Lb, fb = topoTravado ? function (C, EI) { return MD.betaEngastadoApoiado({ C: C, EI: EI, L: Lb }).beta; } : function (C, EI) { return MD.betaFlambagemMola({ C: C, EI: EI, L: Lb }).beta; };
        Lcol[kk] = [fb(Math.max(Cb, KtMin * EIh), EIh), fb(Math.max(Cb, KtMin * EIb), EIb), Lb]; }
      return Lcol[kk];
    }
    var nd0 = {}; M.nos.forEach(function (n) { nd0[n.id] = n; });
    var ESF_G = { PC: 1, T: 1, CB: 1, E: 1, DX: 1, DP: 1, FR: 1 }, travB = p.cobertura.travBaixo, mgap = {}, Lhip = {}, Lcb = {}, Lpc = 0;
    G.membros.forEach(function (m) { mgap[m.id] = C3.maxGap(m); if (m.g === "E") Lhip[m.id] = Math.sqrt(Math.pow(m.p1[0] - m.canto[0], 2) + Math.pow(m.p1[1] - m.canto[1], 2) + Math.pow(m.p1[2] - I.Hp, 2)); if (m.g === "CB") Lcb[m.id] = norm(m.pe, m.p1); if (m.g === "PC") Lpc = norm(m.p0, m.p1); });
    function noEm(Mx, P) { var X0 = p.origem.x, Y0 = p.origem.y, id = null; Mx.nos.forEach(function (n) { if (Math.abs(n.x + X0 - P[0]) < 1e-3 && Math.abs(n.z + Y0 - P[1]) < 1e-3 && Math.abs(n.y - P[2]) < 1e-3) id = n.id; }); return id; }
    var apN = noEm(M, [I.cx, I.cz, I.Hap]);
    var passes = [{ M: M, r: r, tag: "a" }, { M: Mb, r: rb, tag: "b" }, { M: Md, r: rd, tag: "d" }]; if (temPC) passes.push({ M: Mc, r: rc3, tag: "c" });
    var rig = vigaRigida(q, G, sec, g2s, QCOB);
    passes.forEach(function (pass) {      /* ENVOLVENTE dos modelos: os acumuladores guardam sempre o máximo */
      var Mx = pass.M, rx = pass.r; tag = pass.tag; var apx = noEm(Mx, [I.cx, I.cz, I.Hap]);
      elu.forEach(function (cb) {
        var rc = rx.combinacoes[cb.id]; if (!rc) return; var car = C3.durClasse(cb), pf = perfil(car), FK = res.kmodRef / pf.kmod, kEsp = {};
        var Fs = [0, 0, 0]; Mx.barras.forEach(function (b) { if ((b.grupo !== "E" && b.grupo !== "CB") || !rc.barras[b.id]) return; var es = rc.barras[b.id].estacoes, w = b.j === apx ? [es[es.length - 1], -1] : (b.i === apx ? [es[0], 1] : null); if (!w) return; var e = w[0], ex = b.ax, ey = b.vy, ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]; for (var q3 = 0; q3 < 3; q3++) Fs[q3] += w[1] * (e.N * ex[q3] + e.Vy * ey[q3] + e.Vz * ez[q3]); });      /* RESULTANTE vetorial das barras do cubo POR COMBINAÇÃO (não o máximo por barra) */
        res.cubo.Hres = Math.max(res.cubo.Hres, hyp(Fs[0], Fs[2])); res.cubo.Vres = Math.max(res.cubo.Vres, Math.abs(Fs[1]));
        G.membros.forEach(function (m) { if (m.g !== "E") return; var vg = C3.vigaEspigao(Mx, rc, m, p), mz = 0, vgM = vg.M; vg = { M: Math.max(vg.M, rig.M_elu), Ra: Math.max(vg.Ra, rig.Ra_elu), Rc: Math.max(vg.Rc, rig.Rc_elu) }; Mx.barras.forEach(function (bb) { if (bb.m === m.id && rc.barras[bb.id]) rc.barras[bb.id].estacoes.forEach(function (e) { mz = Math.max(mz, Math.abs(e.Mz)); }); });
          kEsp[m.id] = { k: mz > 1e-9 && vg.M > mz ? vg.M / mz : 1, M: vg.M, Mmod: mz, Ra: vg.Ra, Rc: vg.Rc }; var ev = res.espigaoViga || (res.espigaoViga = { M: 0, Mmodelo: 0, Mviga_modelo: 0, rigida: rig, k: 1, Ra: 0, Rc: 0, comb: null }); ev.Mviga_modelo = Math.max(ev.Mviga_modelo, vgM); if (vg.M > ev.M) { ev.M = vg.M; ev.Mmodelo = mz; ev.comb = cb.id; } ev.k = Math.max(ev.k, kEsp[m.id].k); ev.Ra = Math.max(ev.Ra, vg.Ra); ev.Rc = Math.max(ev.Rc, vg.Rc); });
        Mx.barras.forEach(function (b) {
          var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
          if (ESF_G[g]) { var ac = res.esf[g] || (res.esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); es.forEach(function (e) { var nt = Math.max(0, e.N), nc = Math.max(0, -e.N), vv = hyp(e.Vy, e.Vz); ac.Nt = Math.max(ac.Nt, nt); ac.Nc = Math.max(ac.Nc, nc); ac.V = Math.max(ac.V, vv); ac.NtEq = Math.max(ac.NtEq, nt * FK); ac.NcEq = Math.max(ac.NcEq, nc * FK); ac.VEq = Math.max(ac.VEq, vv * FK); }); }
          if (g === "E") {
            var cN = b.mem.tip ? noEm(Mx, [b.mem.canto[0], b.mem.canto[1], I.Hp]) : null, kv = kEsp[b.mem.id], cosH = 1 / Math.sqrt(1 + I.incl * I.incl * Math.pow(Math.cos(I.beta), 2));
            if (b.j === apx) { acum(res.espigao.apice, vetorExtremo(b, es[es.length - 1]), FK); }
            if (cN && b.i === cN) { acum(res.espigao.heel, vetorExtremo(b, es[0]), FK); }
            if (kv && b.j === apx) { var apv = res.espigao.apice; apv.S = Math.max(apv.S, kv.Ra * cosH); apv.SEq = Math.max(apv.SEq, kv.Ra * cosH * FK); apv.V = Math.max(apv.V, kv.Ra); apv.VEq = Math.max(apv.VEq, kv.Ra * FK); }
            if (kv && cN && b.i === cN) { var hpv = res.espigao.heel; hpv.S = Math.max(hpv.S, kv.Rc * cosH); hpv.SEq = Math.max(hpv.SEq, kv.Rc * cosH * FK); hpv.V = Math.max(hpv.V, kv.Rc); hpv.VEq = Math.max(hpv.VEq, kv.Rc * FK); }
          }
          if (g === "CB") { var fN = noEm(Mx, b.mem.pe); if (b.j === apx) acum(res.caibro.apice, vetorExtremo(b, es[es.length - 1]), FK); if (b.i === fN) acum(res.caibro.pe, vetorExtremo(b, es[0]), FK); if (b.j === fN) acum(res.caibro.pe, vetorExtremo(b, es[es.length - 1]), FK); }
          if (g === "PC") es.forEach(function (e) { var pc = res.pilarCentral; pc.N = Math.max(pc.N, Math.max(0, -e.N)); pc.Nt = Math.max(pc.Nt || 0, Math.max(0, e.N)); pc.NtEq = Math.max(pc.NtEq || 0, Math.max(0, e.N) * FK); pc.NEq = Math.max(pc.NEq, Math.max(0, -e.N) * FK); pc.S = Math.max(pc.S, hyp(e.Vy, e.Vz)); pc.SEq = Math.max(pc.SEq, hyp(e.Vy, e.Vz) * FK); });
          if (g === "FR") es.forEach(function (e) { if (e.N > res.cinta.N) { res.cinta.N = e.N; res.cinta.NEq = e.N * FK; } });
          if (g === "FR") [[b.i, es[0], b.mem.p0], [b.j, es[es.length - 1], b.mem.p1]].forEach(function (w) {
            var nn = nd0[w[0]]; if (!nn || Math.abs(nn.x + p.origem.x - w[2][0]) > 1e-3 || Math.abs(nn.z + p.origem.y - w[2][1]) > 1e-3 || Math.abs(nn.y - w[2][2]) > 1e-3) return;
            var vF = vetorExtremo(b, w[1]), Nt = Math.max(0, w[1].N), cf = res.cinta.fim; cf.N = Math.max(cf.N, Nt); cf.NEq = Math.max(cf.NEq, Nt * FK); cf.S = Math.max(cf.S, vF.S); cf.SEq = Math.max(cf.SEq, vF.S * FK); });
          es.forEach(function (e) {
            var v = null, s = sec[g];
            if (g === "P") { var bt = betas(b); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: bt[0] * bt[2], L0z: bt[1] * bt[2], L1: 0.01, classe: CL, perfil: pf })); }
            else if (g === "T" || g === "FR") { var vao = mgap[b.mem.id]; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: vao, L0z: vao, L1: MD.L1PorBorda(e.Mz, { cima: 0.5, baixo: travB || Math.min(vao, 2) }), classe: CL, perfil: pf })); }
            else if (g === "E") { var Lh = Lhip[b.mem.id], Ln = mgap[b.mem.id], kk = kEsp[b.mem.id] ? kEsp[b.mem.id].k : 1, e2 = kk > 1 ? ext({}, e, { Mz: e.Mz * kk }) : e; v = MD.barra2022(MD.deAnalise(e2, { b: s.b, h: s.h, L0y: Lh, L0z: Lh, L1: MD.L1PorBorda(e2.Mz, { cima: Ln, baixo: Lh }), classe: CL, perfil: pf })); }
            else if (g === "CB") { var Lc = Lcb[b.mem.id]; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lc, L0z: Lc, L1: MD.L1PorBorda(e.Mz, { cima: mgap[b.mem.id], baixo: Lc }), classe: CL, perfil: pf })); }
            else if (g === "PC") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lpc, L0z: Lpc, L1: 0.01, classe: CL, perfil: pf })); }
            else if (g === "DX" || g === "DP") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); }
            if (v) { regG(g, v.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, v.governa); regEsb(g, v);
              if (g === "E" && v.lambda) { var cE = res.compressaoE || null, lmE = Math.max(v.lambda[0] || 0, v.lambda[1] || 0); if (!cE || lmE > cE.lambdaMax) res.compressaoE = { barra: b.id, L0y: Lhip[b.mem.id], L0z: Lhip[b.mem.id], lambda: v.lambda.slice(), lambdaMax: lmE, limite: 140, eta: v.eta }; } }
          });
        });
        Mx.apoios.forEach(function (ap) {
          var R = rc.reacoes[ap.no]; if (!R) return;
          var o = res.reacoes[ap.no] || (res.reacoes[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, NminEq: 1e9, HmaxEq: 0, grupo: ap.grupo, mem: ap.mem });
          o.Nmax = Math.max(o.Nmax, R[1]); o.Nmin = Math.min(o.Nmin, R[1]); o.Hmax = Math.max(o.Hmax, hyp(R[0], R[2])); o.Mmax = Math.max(o.Mmax, hyp(R[3], R[5])); o.NminEq = Math.min(o.NminEq, R[1] * (R[1] < 0 ? FK : 1)); o.HmaxEq = Math.max(o.HmaxEq, hyp(R[0], R[2]) * FK);
        });
      });
    });
    tag = "env";
    res.torcaoFR = torcaoFR4(sec, res.espigao, res.cinta, MD.perfilEResist(CL, perfil("curta")).f.fvd, I.beta); res.detalheSela = p.detalheSela;
    if (p.detalheSela === "torcao" && !res.torcaoFR.ok) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, torcao: true };
    (function () {      /* compressão ⊥ às fibras sob o frechal no pilar (6.3.3) e sob o pé do caibro */
      var cl = MM.classe2022(CL), kmL = perfil("longa").kmod, Rp = 0, ML = Dm.ML; function fc90(aCm) { var an = ML.alfaN(aCm); return Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an); }
      Object.keys(res.reacoes).forEach(function (k) { if (res.reacoes[k].grupo === "P") Rp = Math.max(Rp, res.reacoes[k].Nmax); });
      res.apoioEta = { FR: Rp > 0 ? 1.03 * Rp / (sec.FR.b * sec.P.b) / 1000 / fc90(sec.P.b * 100) : 0 };
      if (res.apoioEta.FR > 1 + 1e-9) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, apoio: true };
    })();
    /* ELS: flecha final (φ, ψ2) por vão entre apoios; balanço (ponta do espigão) com L/limBalanco; envolvente dos modelos */
    var PHI = perfil("permanente").phi, psi2 = CA.PSI["Q-cobertura"].psi2, psi1W = CA.PSI.W.psi1;
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var fm = {}, flech = {}, topo = 0;
    passes.forEach(function (pass) {
      var MX = pass.M, re = AN.analisar({ nos: MX.nos, barras: MX.barras, apoios: MX.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) }, { combinacoes: els, estacoes: 3, comPCG: true }); C3.modeloSemFalha(re.avisos);
      var nodo = {}; MX.nos.forEach(function (n) { nodo[n.id] = n; });
      var Dd = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; };
      function dfin(id) { var g = Dd("g", id), qd = Dd("q", id); return [0, 1, 2].map(function (k) { return g[k] * (1 + PHI) + qd[k] * (1 + psi2 * PHI); }); }
      function reg(chave, grp, valor, lim, extra) { var e = valor / lim; if (!fm[chave] || e > fm[chave].eta) fm[chave] = ext({ mm: Math.round(valor * 1e5) / 100, limite_mm: Math.round(lim * 1e5) / 100, eta: e, grupo: grp }, extra || {}); flech[grp] = Math.max(flech[grp] || 0, e); }
      var porMem = {}; MX.barras.forEach(function (b) { (porMem[b.m] = porMem[b.m] || []).push(b); });
      function nosDe(bs) { var ids = [], vistos = {}; bs.forEach(function (b) { [b.i, b.j].forEach(function (n) { if (!vistos[n]) { vistos[n] = 1; ids.push(n); } }); }); return ids; }
      G.membros.forEach(function (m) {
        if (["T", "FR", "E", "CB"].indexOf(m.g) < 0) return; var bs = porMem[m.id] || []; if (!bs.length) return; var ids = nosDe(bs), L = norm(m.p0, m.p1);
        var tOf = function (P) { return ((P[0] - m.p0[0]) * (m.p1[0] - m.p0[0]) + (P[1] - m.p0[1]) * (m.p1[1] - m.p0[1]) + (P[2] - m.p0[2]) * (m.p1[2] - m.p0[2])) / (L * L); };
        var t = function (n) { var N = nodo[n]; return tOf([N.x + p.origem.x, N.z + p.origem.y, N.y]); };
        var sup = m.g === "E" ? [m.tip ? [m.canto[0], m.canto[1], I.Hp] : m.p0, m.p1] : (m.g === "CB" ? [m.pe, m.p1] : [m.p0].concat(m.nos || []).concat([m.p1]));
        var tS = sup.map(tOf).sort(function (u, v) { return u - v; }); if (m.g === "T" || m.g === "FR") tS = [0].concat(tS.filter(function (x) { return x > 1e-6 && x < 1 - 1e-6; })).concat([1]);
        var byT = ids.map(function (n) { return { n: n, t: t(n) }; }).sort(function (u, v) { return u.t - v.t; }), k2; function ach(tt) { var bst = null; byT.forEach(function (o) { if (Math.abs(o.t - tt) < 1e-4) bst = o; }); return bst; }
        for (k2 = 0; k2 + 1 < tS.length; k2++) {
          var A0 = ach(tS[k2]), B0 = ach(tS[k2 + 1]); if (!A0 || !B0) continue; var dA = dfin(A0.n), dB = dfin(B0.n), vao = (tS[k2 + 1] - tS[k2]) * L;
          byT.forEach(function (o) { if (o.t <= tS[k2] + 1e-4 || o.t >= tS[k2 + 1] - 1e-4) return; var f = (o.t - tS[k2]) / (tS[k2 + 1] - tS[k2]), dn = dfin(o.n), dd = [0, 1, 2].map(function (k3) { return dn[k3] - (dA[k3] + (dB[k3] - dA[k3]) * f); }); reg("vao" + m.g, m.g, Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]), vao / q.limVao, { onde: m.id }); });
        }
        if ((m.g === "E" && m.tip) || m.g === "CB") { var tI = tS[0], bal = ach(0), cn = ach(tI); if (bal && cn) { var d1 = dfin(bal.n), d2 = dfin(cn.n); reg("balanco" + m.g, m.g, Math.sqrt(Math.pow(d1[0] - d2[0], 2) + Math.pow(d1[1] - d2[1], 2) + Math.pow(d1[2] - d2[2], 2)), tI * L / q.limBalanco); } }
      });
      MX.barras.forEach(function (b) { if (b.grupo !== "P") return; var top = b.j, H = Math.abs(b.mem.p1[2] - b.mem.p0[2]); CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) { var d = Dd("w" + c.id, top); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (H / 300)); }); });
    });
    flech.P = Math.max(flech.P || 0, topo); fm.topoPilarVentoFreq_H300 = { eta: topo, grupo: "P" };
    res.flechasMm = fm; res.flechas = flech; res.phi = PHI; res.QCOB = QCOB; res.G2 = g2s; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk, cpiMax: Math.max.apply(null, VT.casos.map(function (c) { return c.cpi; })) }; res.casosVento = CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { return c.id; });
    res.secoes = copia(sec); res.modelo = M; res.slipT = slipTinfo; res.slipC = slipCinfo; res.slip = slipInfo; Object.defineProperty(res, "modeloB", { value: Mb, enumerable: false }); if (Mc) Object.defineProperty(res, "modeloC", { value: Mc, enumerable: false });
    res.geometria = { info: { n: I.n, nH: I.nH, dz: I.dz, lp: I.lp }, tipologia: "T4" };
    res.excepcionais = elu.filter(function (c) { return /^EXC_/.test(c.id); }).map(function (c) { return c.id; });
    Object.defineProperty(res, "_casos", { value: CS, enumerable: false }); Object.defineProperty(res, "_analise", { value: r, enumerable: false }); Object.defineProperty(res, "_elu", { value: elu, enumerable: false });
    res.cargasTotais = cargasTot; res.tipologia = "T4"; res.ventoGeometria = VT.geometria; res.avisosAnalise = r.avisos; res.modelos = temPC ? "a (estribo rígido, com pilar central), b (estribo da terça com deslizamento), d (cinta com deslizamento), c (SEM o pilar central)" : "a (estribo rígido), b (estribo da terça com deslizamento), d (cinta com deslizamento)";
    res.avisos.push("T4: não modelados (declarado): torção por excentricidade do vento (6.6), vento em outros azimutes além dos listados, caibros secundários e ripas; travamento inferior das terças adotado " + (travB ? travB + " m" : "= vão (a favor)") + "; espigão com L0 fora do plano = comprimento total do canto ao cubo (sem crédito das terças). K_br,1 (6.6.2) NÃO se aplica: a T4 não tem banzo de tesoura; o espigão é calculado sem travamento lateral.");
    res.avisos.push("T4: espigão, cubo do ápice e ligações dimensionados pela ENVOLVENTE de " + (temPC ? "4" : "3") + " modelos — " + res.modelos + " (NBR 7190-1:2022, 7.1.12; Ku = 2/3·Kser): η do espigão " + ["a", "b", "d", "c"].filter(function (t) { return res.porModelo[t].E; }).map(function (t) { return "(" + t + ") " + res.porModelo[t].E.eta.toFixed(3); }).join(" × ") + ".");
    res.avisos.push("T4: momento de projeto do espigão = MAIOR entre a envolvente dos modelos, a viga bi-apoiada canto–ápice com as forças VERTICAIS reais das terças e a viga RÍGIDA com w·Lc (ELU " + rig.M_elu.toFixed(2) + " kN·m; Mz da viga " + (res.espigaoViga ? res.espigaoViga.M.toFixed(2) : "-") + " kN·m na combinação " + (res.espigaoViga ? res.espigaoViga.comb : "-") + "; do modelo " + (res.espigaoViga ? res.espigaoViga.Mmodelo.toFixed(2) : "-") + " kN·m). EXIGÊNCIA DE PROJETO: terças contínuas sobre o caibro, ou emenda rígida; emenda articulada sobre o caibro não é permitida sem novo cálculo.");
    return res;
  }

  /* ---------------------------------------------------------------- DIMENSIONAR (laço de crescimento) e BASE */
  function t4Dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var sec = copia(partida), hist = [], it, r, pior, falha, mexeu, q;
    if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!proj.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    for (it = 0; it < (opcoes.maxIter || 30); it++) {
      try { r = t4Rodar(proj, sec); } catch (ex) {
        if (!/instável|mecanismo/.test(String(ex.message)) || it >= 12) throw ex;
        var gr = false; Object.keys(sec).forEach(function (k) { if (C3.crescer(proj._pad4 || t4Padrao(proj), sec, k)) gr = true; }); if (!gr) throw ex; hist.push({ it: it, sec: copia(sec), instavel: String(ex.message).slice(0, 120) }); continue;
      }
      q = proj._pad4; pior = C3.pior(r, sec); hist.push({ it: it, sec: copia(sec), pior: pior }); if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1 && sec[k]; });
      if (!falha.length) return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior };
      mexeu = false; falha.sort(function (u, v) { return pior[v] - pior[u]; }).forEach(function (k) { if (C3.crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }
  function t4Base(proj, r, sec) {      /* a base engastada dos pilares (rigidez Kθ pela ligação) é a do T3 (t3Base lê proj._pad3.classe e .params.peDireito) */
    var sv = proj._pad3; proj._pad3 = proj._pad4; try { return C3.base(proj, r, sec); } finally { proj._pad3 = sv; }
  }

  var MadT4Calc = { vigaRigida: vigaRigida, slipCinta: slipCinta, padrao: t4Padrao, montar: t4Montar, casos: t4Casos, vento: t4Vento, rodar: t4Rodar, dimensionar: t4Dimensionar, base: t4Base, kTopo: kTopo, torcaoFR: torcaoFR4, variantesVento: variantesVento, vetorExtremo: vetorExtremo, T4_LIM: T4_LIM };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT4Calc;
  else global.MadT4Calc = MadT4Calc;
})(typeof window !== "undefined" ? window : this);

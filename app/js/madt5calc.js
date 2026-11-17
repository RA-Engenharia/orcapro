/* =====================================================================
 * madt5calc.js — T5 (pergolado): MODELO 3D, CARGAS, VENTO, ANÁLISE (2ª ordem), DIMENSIONAMENTO (NBR 7190-1:2022), RIPADO e REAÇÕES. Motor PURO, ES5, Node-testável.
 * Segue o caminho da T3 (madt3calc.js) sem alterá-la. Fontes e decisões: docs/madeira/T5-REFERENCIA.md.
 * Solver: x = X (caibros, inclinação), y = vertical, z = Z (vigas principais). Cargas: G1 peso próprio, G2 cobertura + ripado + plantas, Q manutenção (NBR 6120, 6.4),
 * vento: COM cobertura = cobertura ISOLADA da NBR 6123 (8.2: Tabela 17 uma água; 8.2.4 se há obstrução/parede ou h < 0,5·l2; 8.2.5 atrito), SEM cobertura = arrasto nas peças
 * (7.2 e 7.5: Cx adotado, ver T5-REFERENCIA §4). Estabilidade: mãos-francesas + base rotulada. Momento de viga/caibro = MAIOR entre o do pórtico e o da viga bi-apoiada com as cargas reais.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T5 = req("MadT5", "madt5.js"), U = T5._util, ext = U.ext, hyp = U.hyp, r2 = U.r2, br = U.br, copia = U.copia, norm = U.norm;
  function D() { return { AN: req("AcoAnalise", "acoanalise.js"), VE: req("AcoVento", "acovento.js"), CA: req("AcoCargas", "acocargas.js"), MM: req("MadMateriais", "madmateriais.js"), MD: req("MadDim", "maddim7190.js"), ML: req("MadLig", "madligacoes.js") }; }

  var T5_LIM = { P: { bMax: 0.30, hMax: 0.30 }, VP: { hMax: 0.50, bMax: 0.20 }, VS: { hMax: 0.30, bMax: 0.14 }, MF: { hMax: 0.16, bMax: 0.14 }, RP: { hMax: 0.08, bMax: 0.06 } };
  var CX_BARRA = 2.4;       /* Cx/Cy ADOTADO = maior valor da Tabela 26 da NBR 6123:2023 (barras prismáticas de faces planas, comprimento infinito), a favor */
  var CONC = 1.0;           /* kN concentrado em elemento isolado de cobertura (NBR 6120:2019, 6.4) */

  var K28 = [[2, 0.62], [5, 0.66], [10, 0.69], [20, 0.81], [40, 0.87], [50, 0.90], [100, 0.95], [1e9, 1.0]];      /* NBR 6123:2023, Tabela 28: K para barras de faces planas, ℓ/c */
  function kBarra(l, c) { var r = l / c, i; if (r <= K28[0][0]) return K28[0][1]; for (i = 1; i < K28.length; i++) if (r <= K28[i][0]) return K28[i - 1][1] + (K28[i][1] - K28[i - 1][1]) * (Math.min(r, 1e4) - K28[i - 1][0]) / (K28[i][0] - K28[i - 1][0]); return 1; }
  var ETA14 = [[0.5, 0.2], [1, 0.3], [2, 0.4], [3, 0.5], [4, 0.6], [5, 0.7], [6, 0.8], [7, 1.0]];     /* NBR 6123:2023, Figura 14, patamar φ ≥ 0,6 (barras maciças): leitura à mão da figura (malha de 0,1; e/hb ≥ 7 = 1,0), fixture tools/fixtures/mad-eng-t5/fig14_leitura.json */
  function eta14(eh) { var i; if (eh <= ETA14[0][0]) return ETA14[0][1]; for (i = 1; i < ETA14.length; i++) if (eh <= ETA14[i][0]) return ETA14[i - 1][1] + (ETA14[i][1] - ETA14[i - 1][1]) * (eh - ETA14[i - 1][0]) / (ETA14[i][0] - ETA14[i - 1][0]); return ETA14[ETA14.length - 1][1]; }
  function modulos(c) { return { E: c.Ec0m * 1e3, G: c.Gm * 1e3 }; }
  function ret(b, h) { var a = Math.max(b, h), c = Math.min(b, h), J = a * c * c * c * (1 / 3 - 0.21 * (c / a) * (1 - Math.pow(c / a, 4) / 12)); return { A: b * h, Iz: b * h * h * h / 12, Iy: h * b * b * b / 12, J: J }; }
  function perfilFn(q) { var Dm = D(), cache = {}; return function (car) { return cache[car] || (cache[car] = Dm.MM.perfil2022({ carregamento: car, umidade: q.umidade, produto: "serrada", betaC: /^mlc:/i.test(q.classe) ? 0.1 : undefined, limVao: q.limVao, limBalanco: q.limBalanco, fluencia: q.fluencia, phiConservador: !!q.phiConservador })); }; }
  function durClasse(comb) { var f = comb.fatores, temW = Object.keys(f).some(function (k) { return k[0] === "W" && f[k] > 0; }), temQ = (f.Q || 0) > 0; return temW ? "curta" : temQ ? "longa" : "permanente"; }
  function modeloSemFalha(avisos) { var ruins = (avisos || []).filter(function (a) { return /nó inexistente|comprimento nulo|seção sem área/.test(a); }); if (ruins.length) throw new Error("modelo de cálculo inconsistente (barra/apoio ignorado pela análise): " + ruins.slice(0, 4).join("; ")); }
  function keyDe(proj) { return JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; }); }

  function t5Padrao(proj) {
    var Dm = D(), q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 3; q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150; q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {}); q.limites = ext({}, T5_LIM, q.limites || {});
    var cl = Dm.MM.classe2022(q.classe); if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta);
    q.params = T5.parametros(q.params); return q;
  }

  /* ---------- vento ---------- */
  function ventoGeo(q, G) {
    var p = G.p, I = G.info, th = Math.atan(p.incl) * 180 / Math.PI;
    return ext({ nervuras: "lisa" }, (q.vento && q.vento.geometria) || {}, { a: I.zN - I.z0, b: I.xb - I.xa, h: I.yX(I.xb) - p.baseZ, hCumeeira: I.yX(I.xa) - p.baseZ, inclinacaoGraus: th, cobertura: "uma-agua", aberta: true, ladoAlto: "esquerda", obstrucoes: !!I.obstrucao });
  }
  function t5Vento(q, G, avisos) {
    var Dm = D(), geo = ventoGeo(q, G), ent = ext({}, q.vento, { geometria: geo }), key = JSON.stringify(ent);
    var emCache = !!(q._vento && q._ventoKey === key), r;
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: false }; }); }
    if (emCache) r = q._vento; else { r = Dm.VE.calcular(ent, { todasDirecoes: true }); if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros)); }
    if (G.p.comCob) {
      avisos.push("T5: vento (norma) — cobertura ISOLADA, NBR 6123:2023, 7.2.1 (Tabela 24, uma água plana; 0 ≤ tg θ ≤ 0,7 e h ≥ 0,5·ℓ2; na edição de 1988 é 8.2/Tabela 17, que o motor transcreve) " + (G.info.obstrucao ? "+ 7.2.1, último parágrafo (obstrução sob/junto à cobertura: edificação fechada de mesma cobertura com cpi = +0,8 e −0,3) " : "") + "+ 7.2.2 (atrito no vento paralelo à geratriz: o texto impresso da 2023 traz «Ft = 0,5 q a b», ERRO TIPOGRÁFICO; adotado Ft = 0,05·q·a·b, da edição de 1988, 8.2.5, coerente com o 6.1.5 da 2023 (Ct de 0,01 a 0,04 por face) — PENDÊNCIA: conferir errata da ABNT). " + r.casos.length + " casos; vento oblíquo não montado.");
      if (!G.info.encostado && !G.p.obstrucao) avisos.push("T5: PENDÊNCIA — obstrução lateral sob/junto à cobertura NÃO informada (NBR 6123:2023, 7.2.1): informe se há fechamento/obstrução (vidro, parede, cortina); sem a informação o vento da cobertura isolada vale só para pergolado totalmente aberto.");
    } else avisos.push("T5: PREMISSA DE VENTO — SEM cobertura, vento nas PEÇAS: arrasto F = Cx·q·K·l·c (NBR 6123:2023, 8.1: Tabela 26 (Cx = " + CX_BARRA + " ADOTADO, maior valor da tabela), Tabela 28 (K por ℓ/c)); peças em série como reticulados múltiplos, 8.4: Fan = Ca1·[1 + (n − 1)·η]·q·Ae, η da Figura 14 (leitura gráfica, conferida em tools/fixtures/mad-eng-t5/fig14_leitura.json) nas 4 direções ortogonais.");
    q._vento = r; q._ventoKey = key; return r;
  }

  /* ---------- modelo 3D ---------- */
  function t5Montar(q, G, sec) {
    var Dm = D(), MM = Dm.MM, p = G.p, mat = MM.classe2022(q.classe), mod = modulos(mat), X0 = p.origem.x, Y0 = p.origem.y, nos = [], barras = [], idn = {}, apoios = [], I = G.info;
    function no(P3) { var key = P3.map(function (v) { return Math.round(v * 1e4); }).join(","); if (!idn[key]) { idn[key] = { id: "n" + nos.length, x: P3[0] - X0, y: P3[2], z: P3[1] - Y0 }; nos.push(idn[key]); } return idn[key].id; }
    G.membros.forEach(function (m) {
      var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = norm(m.p0, m.p1), pts = [m.p0].concat(m.nos || []).concat([m.p1]), tt = [], ps = [], s = sec[m.g];
      pts.forEach(function (P) { var t = ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / (L * L); tt.push({ t: t, P: P }); });
      tt.sort(function (u, v) { return u.t - v.t; }); tt.forEach(function (o, k) { if (!k || (o.t - tt[k - 1].t) * L > 1e-3) ps.push(o); });
      var u = T5.upDe(m), vy = [u[0], u[2], u[1]], mf = m.g === "MF", k;
      for (k = 0; k + 1 < ps.length; k++) {
        var A = ps[k].P, B = ps[k + 1].P, Lb = norm(A, B), bar = { id: m.id + "#" + k, m: m.id, grupo: m.g, i: no(A), j: no(B), E: mod.E, G: mod.G, vy: vy, nElem: mf ? 1 : 2, pesoEsp: q.pesoMLC, L: Lb, mem: m, ax: [d[0] / L, d[2] / L, d[1] / L], b: s.b, h: s.h, secao: ret(s.b, s.h) }, lib = {};
        if (mf) lib = { i: { rx: true, ry: true, rz: true }, j: { rx: true, ry: true, rz: true } };
        else if (m.g === "VP") bar.secao.J = bar.secao.J * 1e-3;      /* o caibro APOIA centrado sobre a viga (parafusos a 45°): rigidez de torção da VP reduzida a 0,1 % — o momento do caibro não vira torque na VP (artefato do nó rígido que mandava a seção da VP); a rigidez não vai a zero para não soltar o grau de liberdade */
        else if (m.g === "P" && k === ps.length - 2) lib.j = { ry: true, rz: true };       /* cabeça do pilar rotulada (chapa + pinos não transmitem momento) */
        if (lib.i || lib.j) bar.libera = lib;
        barras.push(bar);
      }
      if (m.g === "P") apoios.push({ no: no(m.p0), ux: true, uy: true, uz: true, ry: true, grupo: "P", mem: m.id });          /* base ROTULADA: sem mola de rotação (decisão §3) */
      if (m.g === "VS" && m.parede) apoios.push({ no: no(m.parede === "p0" ? m.p0 : m.p1), ux: true, uy: true, uz: true, grupo: "PAREDE", mem: m.id });
    });
    return { nos: nos, barras: barras, apoios: apoios, secoes: sec, G: G, th: Math.atan(p.incl), cs: 1 / I.sc, sn: p.incl / I.sc };
  }

  /* ---------- casos de carga ---------- */
  function trib(zC, k) { return ((k > 0 ? zC[k] - zC[k - 1] : 0) + (k < zC.length - 1 ? zC[k + 1] - zC[k] : 0)) / 2; }
  function pressaoItem(it, xr, zr) {      /* pressão (kN/m², + = para baixo) de um item de cobertura do motor de vento na posição (xr, zr) da cobertura */
    if (it.variacao === "linear em x") return it.p0 + (it.p1 - it.p0) * (xr - it.x0) / Math.max(1e-9, it.x1 - it.x0);
    if (xr >= it.x0 - 1e-6 && xr <= it.x1 + 1e-6 && (it.z0 == null || (zr >= it.z0 - 1e-6 && zr <= it.z1 + 1e-6))) return it.p;
    return null;
  }
  function t5Casos(q, M, VT, QCOB, avisos) {
    var G = M.G, p = G.p, I = G.info, sc = I.sc, C = [], nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    var vs = M.barras.filter(function (b) { return b.grupo === "VS"; }), cs = M.cs, sn = M.sn, nrm = [sn, cs, 0];
    var RIP = I.ripa ? (D().ML ? 1 : 1) : 0, pRip = I.ripa ? q.pesoMLC * I.ripa.b * I.ripa.h / I.ripa.s : 0;      /* kN/m² em planta */
    var gPlan = pRip + (p.plantas || 0), tw = function (b) { return trib(I.zC, b.mem.kc); };
    var g2 = [], qq = [];
    vs.forEach(function (b) { var w = tw(b); g2.push({ tipo: "barra", barra: b.id, q: [0, -(p.cobPeso + gPlan * cs) * w, 0] }); qq.push({ tipo: "barra", barra: b.id, q: [0, -QCOB.q * cs * w, 0] }); });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "cobertura + ripado + plantas", cargas: g2 });
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de manutenção (NBR 6120, 6.4)", cargas: qq });
    var qV = VT.q, wd = { 0: [0, 0, 1], 90: [1, 0, 0], 180: [0, 0, -1], 270: [-1, 0, 0] };
    function arrasto(dir, qd, modo) {   /* modo: undefined = tudo (sem cobertura); "cob" = com cobertura: pilares + face da viga principal + pontas dos caibros */    /* arrasto horizontal nas peças: F = Cx·q·K·c por metro, na direção do vento (NBR 6123:2023, 8.1: Tabela 26 (Cx), Tabela 28 (K)); reticulados em série: 8.4, Fan = Ca1·[1 + (n − 1)·η]·q·Ae (η da Figura 14) */
      var w = wd[dir], cg = [], porMem = {};
      M.barras.forEach(function (b) { (porMem[b.m] = porMem[b.m] || []).push(b); });
      var fam = {}; G.membros.forEach(function (m) { var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], Lm = norm(m.p0, m.p1), cosA = Math.abs((d[0] * w[0] + d[1] * w[2] * 0 + d[2] * 0 + d[1] * w[2] + 0) / Lm); cosA = Math.abs(d[0] * w[0] + d[1] * w[2]) / Lm; if (Math.sqrt(Math.max(0, 1 - cosA * cosA)) < 1e-6) return; if (m.g === "MF" || (modo === "cob" && m.g !== "P" && m.g !== "VP")) return;
        var s = (m.p0[0] + m.p1[0]) / 2 * w[0] + (m.p0[1] + m.p1[1]) / 2 * w[2]; (fam[m.g] = fam[m.g] || []).push({ m: m, s: s }); });
      var mult = {};
      Object.keys(fam).forEach(function (g) { var lv = []; fam[g].forEach(function (o) { var k = Math.round(o.s * 100) / 100; if (lv.indexOf(k) < 0) lv.push(k); }); lv.sort(function (a, b) { return a - b; });
        fam[g].forEach(function (o) { var i = lv.indexOf(Math.round(o.s * 100) / 100), sec = q.secoesAtuais[g] || {}, hb = (g === "VP" || g === "VS") ? sec.h : Math.max(sec.b || 0.1, sec.h || 0.1); mult[o.m.id] = i === 0 ? 1 : eta14((lv[i] - lv[i - 1]) / hb); }); });
      M.barras.forEach(function (b) {
        if (!mult[b.m]) return; var mem = b.mem, ax = b.ax, cosA = Math.abs(ax[0] * w[0] + ax[1] * w[1] + ax[2] * w[2]), perp = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        var c = b.grupo === "VP" || b.grupo === "VS" ? b.h : Math.max(b.b, b.h), f = CX_BARRA * qd * kBarra(norm(mem.p0, mem.p1), c) * c * perp * mult[b.m];
        cg.push({ tipo: "barra", barra: b.id, q: [f * w[0], 0, f * w[2]] });
      });
      if (!modo && I.ripa && (dir === 90 || dir === 270)) { var rr = I.ripa, fT = CX_BARRA * qd * kBarra(rr.L, rr.h) * rr.h * rr.L * (1 + (rr.n - 1) * eta14(rr.s / rr.h)); vs.forEach(function (b) { var f = fT * (tw(b) / rr.L) / (I.xb - I.xa); cg.push({ tipo: "barra", barra: b.id, q: [f * w[0], 0, 0] }); }); }
      if (modo === "cob") {      /* pontas dos caibros (face b × h, vento em X) e face de borda do caibro/ponta da VP (vento em Z) */
        var sgn = w[0] + w[2], tipo = sgn > 0 ? "p0" : "p1";
        if (w[0] !== 0) vs.forEach(function (b) { var mem = b.mem, prim = b.i === (M.nos.filter(function (n) { return Math.abs(n.x + p.origem.x - (tipo === "p0" ? mem.p0[0] : mem.p1[0])) < 1e-3 && Math.abs(n.z + p.origem.y - mem.z) < 1e-3; })[0] || {}).id; if (mem.parede === tipo) return; var nid = M.nos.filter(function (n) { return Math.abs(n.x + p.origem.x - (tipo === "p0" ? mem.p0[0] : mem.p1[0])) < 1e-3 && Math.abs(n.z + p.origem.y - mem.z) < 1e-3; })[0]; if (!nid || (b.i !== nid.id && b.j !== nid.id)) return; cg.push({ tipo: "no", no: nid.id, F: [CX_BARRA * qd * b.b * b.h * w[0], 0, 0, 0, 0, 0] }); });
        else { var edge = (sgn > 0 ? vs[0] : vs[vs.length - 1]).mem.kc; vs.forEach(function (b) { if (b.mem.kc !== edge) return; var f = CX_BARRA * qd * kBarra(norm(b.mem.p0, b.mem.p1), b.h) * b.h; cg.push({ tipo: "barra", barra: b.id, q: [0, 0, f * w[2]] }); }); }
      }
      return cg;
    }
    q.secoesAtuais = M.secoes;
    if (p.comCob) {
      VT.casos.forEach(function (cv, n) {
        var cg = [], dir = cv.direcao;
        if (cv.atrito) { var s = cv.atrito.sentido === "+z" ? 1 : -1; vs.forEach(function (b) { cg.push({ tipo: "barra", barra: b.id, q: [0, 0, s * cv.atrito.porArea * cs * tw(b)] }); }); }
        else {
          var itens = (cv.pressao && cv.pressao.cobertura) || [];
          vs.forEach(function (b) {
            var A = nodo[b.i], B = nodo[b.j], z = (A.z + B.z) / 2 + p.origem.y - I.z0, pa = null, pb = null;
            itens.forEach(function (it) { var a1 = pressaoItem(it, A.x + p.origem.x - I.xa, z), b1 = pressaoItem(it, B.x + p.origem.x - I.xa, z); if (a1 != null && pa == null) pa = a1; if (b1 != null && pb == null) pb = b1; });
            if (pa == null) pa = pb || 0; if (pb == null) pb = pa; if (!pa && !pb) return;
            var w = tw(b), qa = [-pa * w * nrm[0], -pa * w * nrm[1], 0], qb = [-pb * w * nrm[0], -pb * w * nrm[1], 0];
            cg.push({ tipo: "barra", barra: b.id, q: qa, q2: qb });
          });
        }
        if (wd[dir]) { var qd0 = (VT.porDirecao && VT.porDirecao[dir] && VT.porDirecao[dir].q) || qV; arrasto(dir, qd0, "cob").forEach(function (k) { cg.push(k); }); }
        C.push({ id: "W" + n, tipo: "W", direcao: dir, nome: cv.nome || cv.id, cargas: cg, q: cv.q });
      });
    } else {
      [0, 90, 180, 270].forEach(function (d, n) { var qd = (VT.porDirecao && VT.porDirecao[d] && VT.porDirecao[d].q) || qV; C.push({ id: "W" + n, tipo: "W", direcao: d, nome: "Vento " + d + "° — arrasto nas peças (q = " + br(qd, 3) + " kN/m²)", cargas: arrasto(d, qd), q: qd }); });
    }
    return C;
  }

  /* ---------- 1D: viga bi-apoiada com as cargas reais (limite inferior do momento de projeto) ---------- */
  /** carga TRANSVERSAL por metro da barra numa combinação (soma dos casos × fator, incl. o peso próprio), componente ⊥ ao eixo; máximo ao longo da barra (a favor) */
  function wReal(b, fat, CS) {
    var qa = [0, 0, 0], qb = [0, 0, 0], ax = b.ax, k;
    CS.forEach(function (c) { var f = fat[c.id]; if (!f) return;
      c.cargas.forEach(function (ca) {
        if (ca.tipo === "pesoProprio") { var w = -b.pesoEsp * b.b * b.h * f; qa[1] += w; qb[1] += w; }
        else if (ca.tipo === "barra" && ca.barra === b.id) { var k2 = ca.q2 || ca.q; for (k = 0; k < 3; k++) { qa[k] += f * ca.q[k]; qb[k] += f * k2[k]; } }
      }); });
    function perp(v) { var d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2], pv = [v[0] - d * ax[0], v[1] - d * ax[1], v[2] - d * ax[2]]; return Math.sqrt(pv[0] * pv[0] + pv[1] * pv[1] + pv[2] * pv[2]); }
    return Math.max(perp(qa), perp(qb));
  }

  /* ---------- RODAR ---------- */
  function t5Rodar(proj, sec) {
    var Dm = D(), AN = Dm.AN, CA = Dm.CA, MM = Dm.MM, MD = Dm.MD, key = keyDe(proj), q = proj._pad5;
    if (!q || proj._pad5Key !== key) { q = proj._pad5 = t5Padrao(proj); proj._pad5Key = key; }
    sec = copia(sec); if (q.params.ripado.ativo && !sec.RP) sec.RP = { b: q.params.ripado.b, h: q.params.ripado.h };
    var G = T5.geometria(q.params), p = G.p, I = G.info, M = t5Montar(q, G, sec), perfil = perfilFn(q), CL = q.classe, avisos = [];
    var QCOB = p.comCob ? CA.sobrecargaCobertura(p.incl * 100, { empocamentoVerificado: !!q.empocamentoVerificado }) : { ok: true, q: 0.25, texto: "sem cobertura: adotada a menor sobrecarga de manutenção da 6.4 (0,25 kN/m², em projeção) e 1 kN concentrado em cada caibro e ripa — ADOÇÃO (o pergolado não tem categoria própria na Tabela 10 da NBR 6120)", referencia: "NBR 6120:2019, 6.4 (adoção)", avisos: [] };
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo); (QCOB.avisos || []).forEach(function (t) { avisos.push(t); });
    var VT = t5Vento(q, G, avisos), CS = t5Casos(q, M, VT, QCOB, avisos), porB = {}; M.barras.forEach(function (b) { porB[b.id] = b; });
    var cargasTot = {}; CS.forEach(function (c) { var t = [0, 0, 0]; c.cargas.forEach(function (k) { var b = k.tipo === "barra" ? porB[k.barra] : null; if (!b || !k.q) return; var k2 = k.q2 || k.q; for (var z = 0; z < 3; z++) t[z] += (k.q[z] + k2[z]) / 2 * b.L; }); cargasTot[c.id] = t; });
    var combs = CA.combinacoes(CS.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    var modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) };
    var r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos))); modeloSemFalha(r.avisos);
    var KREF = perfil("curta").kmod, nd0 = {}; M.nos.forEach(function (n) { nd0[n.id] = n; });
    var res = { grupos: {}, esf: {}, reacoes: {}, avisos: avisos, kmodRef: KREF, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, combinacoes: elu.length, vsMom: {}, apoioEta: {}, esbeltez: {}, nosForca: { cabeca: { N: 0, S: 0, NEq: 0, SEq: 0, Nt: 0, NtEq: 0 }, pilarMF: { Nax: 0, Ntr: 0, NaxEq: 0, NtrEq: 0 }, mf: { N: 0, NEq: 0 }, mfViga: { ax: 0, tr: 0, axEq: 0, trEq: 0 }, caibro: { up: 0, upEq: 0, down: 0, downEq: 0, H: 0, HEq: 0, V: 0, VEq: 0 }, parede: { Rx: 0, Ry: 0, RyUp: 0, Rz: 0, RxEq: 0, RyEq: 0, RyUpEq: 0, RzEq: 0 }, base: { Nt: 0, NtEq: 0, Nc: 0, H: 0, HEq: 0 } } };
    function reg(g, eta, onde, comb, extra) { var o = res.grupos[g]; if (!o || eta > o.eta) res.grupos[g] = ext({ eta: eta, governa: onde, comb: comb }, extra || {}); }
    /* vãos entre apoios de cada membro (L0 e L1) */
    function gapDe(m, ptsApoio) { var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = norm(m.p0, m.p1), ts = ptsApoio.map(function (P) { return ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / L; }).sort(function (u, v) { return u - v; }), g = 0, k; for (k = 1; k < ts.length; k++) g = Math.max(g, ts[k] - ts[k - 1]); return Math.max(g, 0.2); }
    var apoioPts = {};
    G.membros.forEach(function (m) {
      if (m.g === "VP") apoioPts[m.id] = [m.p0, m.p1].concat(I.zP.map(function (z) { return [m.linha, z, m.p0[2]]; }));
      if (m.g === "VS") { var ps = []; G.membros.forEach(function (o) { if (o.g === "VP") ps.push([o.linha, m.z, o.p0[2]]); }); if (m.parede) ps.push(m.parede === "p0" ? m.p0 : m.p1); apoioPts[m.id] = [m.p0, m.p1].concat(ps); }
    });
    var gapM = {}; G.membros.forEach(function (m) { if (apoioPts[m.id]) gapM[m.id] = gapDe(m, apoioPts[m.id]); });
    var sRip = p.ripado.ativo ? p.ripado.s : 0.6, travCima = (p.diafragma && (p.comCob || p.ripado.ativo)) ? Math.max(0.3, Math.min(sRip, 0.6)) : null, travVP = Math.max(p.sCaibro, 0.3);      /* o travamento do eixo fraco do caibro pela ripa/cobertura SÓ vale com DIAFRAGMA declarado (cobertura rígida fixada como diafragma); sem ele L0z = vão (decisão: aumentar b, não contraventar) */
    var Hp = {}; G.membros.forEach(function (m) { if (m.g === "P") Hp[m.id] = Math.abs(m.p1[2] - m.p0[2]); });
    var apIdx = {}; M.apoios.forEach(function (a) { apIdx[a.no] = a; });
    function vetorExt(b, e) { var ex = b.ax, ey = b.vy, ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]; return [0, 1, 2].map(function (k) { return e.N * ex[k] + e.Vy * ey[k] + e.Vz * ez[k]; }); }
    var forcaMom = {};
    elu.forEach(function (cb) {
      var rc = r.combinacoes[cb.id]; if (!rc) return; var car = durClasse(cb), pf = perfil(car), FK = KREF / pf.kmod, fat = cb.fatores, mfRes = {};
      M.barras.forEach(function (b) {
        var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return; var g = b.grupo, mem = b.mem, v;
        es.forEach(function (e) {
          if (g === "P") v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: Hp[mem.id], L0z: Hp[mem.id], L1: 0.01, classe: CL, perfil: pf }));
          else if (g === "MF") v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: norm(mem.p0, mem.p1), L0z: norm(mem.p0, mem.p1), L1: 0.01, classe: CL, perfil: pf }));
          else { var vao = gapM[mem.id], L0zb = g === "VP" ? (p.diafragma ? Math.min(vao, travVP) : vao) : (travCima ? Math.min(vao, travCima) : vao); v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: vao, L0z: L0zb, L1: MD.L1PorBorda(e.Mz, { cima: g === "VP" ? travVP : (travCima || vao), baixo: vao }), classe: CL, perfil: pf })); }
          if (g === "VS" && e.N < 0) res.nosForca.caibroNc = Math.max(res.nosForca.caibroNc || 0, -e.N * FK); if (g === "VP") res.vpV = Math.max(res.vpV || 0, hyp(e.Vy, e.Vz) * FK);
          reg(g, v.eta, b.id + "@" + e.x.toFixed(2) + " " + (v.governa || ""), cb.id + " " + car, {});
          if (v.lambda && (g === "P" || g === "MF")) { var lm = Math.max(v.lambda[0] || 0, v.lambda[1] || 0), cE = res.esbeltez[g]; if (!cE || lm > cE.lambdaMax) res.esbeltez[g] = { barra: b.id, L0y: g === "P" ? Hp[mem.id] : norm(mem.p0, mem.p1), L0z: g === "P" ? Hp[mem.id] : norm(mem.p0, mem.p1), lambda: v.lambda.slice(), lambdaMax: lm, limite: 140, eta: v.eta, eixo: (v.lambda[1] || 0) > (v.lambda[0] || 0) ? "b" : "h" }; }
          /* momento de projeto ≥ viga bi-apoiada (vão entre apoios) com as cargas reais da combinação */
          if (g === "VS" || g === "VP") {
            var cg = wReal(b, fat, CS);
            var Lg = gapM[mem.id], Mbi = cg * Lg * Lg / 8, Vbi = cg * Lg / 2, rec = res.vsMom[g] || (res.vsMom[g] = { Mbi: 0, Msolver: 0, w: 0, L: 0, Mproj: 0 });
            if (Math.abs(e.Mz) > rec.Msolver) rec.Msolver = Math.abs(e.Mz);
            if (Mbi > rec.Mbi) { rec.Mbi = Mbi; rec.w = cg; rec.L = Lg; rec.comb = cb.id; }
            if (Mbi > Math.abs(e.Mz) + 1e-9 && e.x > 0.05 * b.L && e.x < 0.95 * b.L) { var vb = MD.barra2022({ N: 0, My: Mbi, Mz: 0, Vy: Vbi, Vz: 0, T: 0, b: b.b, h: b.h, L0y: Lg, L0z: Lg, L1: MD.L1PorBorda(e.Mz, { cima: g === "VP" ? travVP : (travCima || Lg), baixo: Lg }), classe: CL, perfil: pf }); reg(g, vb.eta, b.id + " (viga bi-apoiada, M = w·L²/8 = " + br(Mbi, 2) + " kN·m)", cb.id + " " + car, {}); }
          }
        });
        /* esforços para as ligações */
        var Ne = function (e) { return e.N; };
        if (g === "MF") { es.forEach(function (e) { var n = Math.abs(e.N); if (n > res.nosForca.mf.N) { res.nosForca.mf.N = n; } res.nosForca.mf.NEq = Math.max(res.nosForca.mf.NEq, n * FK); });
          var eI = es[0], fvec = [0, 1, 2].map(function (k) { return eI.N * b.ax[k]; }); var kPil = mem.pilarEm.join(","); mfRes[kPil] = mfRes[kPil] || [0, 0, 0]; mfRes[kPil] = [mfRes[kPil][0] + fvec[0], mfRes[kPil][1] + fvec[1], mfRes[kPil][2] + fvec[2]];
          var eJ = es[es.length - 1], fJ = [0, 1, 2].map(function (k) { return eJ.N * b.ax[k]; }), hx = mem.hospede === "VP" ? [0, 0, 1] : [1, 0, 0], ax = Math.abs(fJ[0] * hx[0] + fJ[1] * hx[1] + fJ[2] * hx[2]), trv = Math.sqrt(Math.max(0, fJ[0] * fJ[0] + fJ[1] * fJ[1] + fJ[2] * fJ[2] - ax * ax)), mv = res.nosForca.mfViga; mv.ax = Math.max(mv.ax, ax); mv.tr = Math.max(mv.tr, trv); mv.axEq = Math.max(mv.axEq, ax * FK); mv.trEq = Math.max(mv.trEq, trv * FK); }
        if (g === "P") { var eh = es[es.length - 1], cab = res.nosForca.cabeca, Nt = Math.max(0, eh.N), Sh = hyp(eh.Vy, eh.Vz); cab.Nt = Math.max(cab.Nt, Nt); cab.NtEq = Math.max(cab.NtEq, Nt * FK); cab.S = Math.max(cab.S, Sh); cab.SEq = Math.max(cab.SEq, Sh * FK); }
        if (g === "VS") {      /* reação do caibro em cada nó de apoio sobre a VP (salto do cortante): + = o caibro empurra a VP para baixo */
          var rcN = rc.barras;
        }
      });
      Object.keys(mfRes).forEach(function (k) { var f = mfRes[k], ax = Math.abs(f[1]), tr = Math.sqrt(f[0] * f[0] + f[2] * f[2]), pm = res.nosForca.pilarMF; pm.Nax = Math.max(pm.Nax, ax); pm.Ntr = Math.max(pm.Ntr, tr); pm.NaxEq = Math.max(pm.NaxEq, ax * FK); pm.NtrEq = Math.max(pm.NtrEq, tr * FK); });
      /* caibro × VP: salto do cortante e do axial nos nós de apoio (R > 0 = o caibro empurra a VP para BAIXO: V positivo no extremo esquerdo é reação para CIMA no apoio; sinal CONFERIDO contra w·(V/2 + b) no teste [3]) */
      var porMemVS = {}; M.barras.forEach(function (b) { if (b.grupo === "VS") (porMemVS[b.m] = porMemVS[b.m] || []).push(b); });
      Object.keys(porMemVS).forEach(function (id) {
        var bs = porMemVS[id], byNode = {}; bs.forEach(function (b) { var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return; (byNode[b.j] = byNode[b.j] || {}).esq = es[es.length - 1]; (byNode[b.i] = byNode[b.i] || {}).dir = es[0]; });
        Object.keys(byNode).forEach(function (nid) {
          var nn = byNode[nid], n = nd0[nid]; if (!nn.esq || !nn.dir) return;
          var apoio = G.membros.some(function (m) { return m.g === "VP" && Math.abs(m.linha - (n.x + p.origem.x)) < 1e-3; }); if (!apoio) return;
          var R = nn.esq.Vy - nn.dir.Vy, Hh = Math.abs(nn.dir.N - nn.esq.N), Vz = Math.abs(nn.dir.Vz - nn.esq.Vz), c = res.nosForca.caibro;
          if (R > 0) { c.down = Math.max(c.down, R); c.downEq = Math.max(c.downEq, R * FK); } else { c.up = Math.max(c.up, -R); c.upEq = Math.max(c.upEq, -R * FK); }
          c.H = Math.max(c.H, Hh); c.HEq = Math.max(c.HEq, Hh * FK); var kPil = G.membros.some(function (mm) { return mm.id === id && mm.pilarAqui; }); if (kPil) c.HpilEq = Math.max(c.HpilEq || 0, Hh * FK); else c.HordEq = Math.max(c.HordEq || 0, Hh * FK); c.V = Math.max(c.V, Vz); c.VEq = Math.max(c.VEq, Vz * FK);
        });
      });
      M.apoios.forEach(function (ap) {
        var R = rc.reacoes[ap.no]; if (!R) return;
        if (ap.grupo === "P") { var ob = res.reacoes[ap.no] || (res.reacoes[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, NminEq: 1e9, HmaxEq: 0, grupo: "P", mem: ap.mem }); ob.Nmax = Math.max(ob.Nmax, R[1]); ob.Nmin = Math.min(ob.Nmin, R[1]); ob.Hmax = Math.max(ob.Hmax, hyp(R[0], R[2])); ob.NminEq = Math.min(ob.NminEq, R[1] * (R[1] < 0 ? FK : 1)); ob.HmaxEq = Math.max(ob.HmaxEq, hyp(R[0], R[2]) * FK);
          var bs = res.nosForca.base; bs.Nt = Math.max(bs.Nt, -R[1]); bs.NtEq = Math.max(bs.NtEq, Math.max(0, -R[1]) * FK); bs.Nc = Math.max(bs.Nc, R[1]); bs.H = Math.max(bs.H, hyp(R[0], R[2])); bs.HEq = Math.max(bs.HEq, hyp(R[0], R[2]) * FK); }
        else { var pa = res.nosForca.parede; pa.Rx = Math.max(pa.Rx, Math.abs(R[0])); pa.Ry = Math.max(pa.Ry, R[1]); pa.RyUp = Math.max(pa.RyUp, -R[1]); pa.Rz = Math.max(pa.Rz, Math.abs(R[2])); pa.RxEq = Math.max(pa.RxEq, Math.abs(R[0]) * FK); pa.RyEq = Math.max(pa.RyEq, R[1] * FK); pa.RyUpEq = Math.max(pa.RyUpEq, -R[1] * FK); pa.RzEq = Math.max(pa.RzEq, Math.abs(R[2]) * FK); }
      });
    });
    Object.keys(res.vsMom).forEach(function (g) { var rr = res.vsMom[g]; rr.Mproj = Math.max(rr.Msolver, rr.Mbi); });
    /* apoio ⊥ às fibras: VP sobre o pilar (6.3.3) e caibro sobre a VP */
    var cl = MM.classe2022(CL), perf = perfil("longa"), ML = Dm.ML;
    function fc90(aCm, kmod) { var an = ML.alfaN(aCm); return Math.min(cl.fc90k * kmod / 1.4 * an, 0.25 * cl.fc0k * kmod / 1.4 * an); }
    var kL = perf.kmod, sP = sec.P, sVP = sec.VP, sVS = sec.VS;
    var Npil = 0; Object.keys(res.reacoes).forEach(function (k) { Npil = Math.max(Npil, res.reacoes[k].Nmax); });
    res.apoioEta.VP = (Npil / (Math.min(sVP.b, sP.b) * sP.h)) / 1e3 / fc90(sP.h * 100, kL);
    res.apoioEta.VS = (res.nosForca.caibro.downEq / (Math.min(sVS.b, sVP.b) * sVP.b)) / 1e3 / fc90(sVP.b * 100, kL);
    /* força de TRAVAMENTO (EN 1995-1-1, 9.2.5.3: Fd = Nd/50 por ponto de travamento; fonte secundária) na ligação ripa × caibro — só quando o diafragma é declarado e o travamento é usado */
    var Fb = (res.nosForca.caibroNc || 0) / 50, pfT = perfil("curta"), dS = 5, fhS = 0.082 * (1 - 0.01 * dS) * cl.rhok, MyS = 0.3 * 600 * Math.pow(dS, 2.6), RkS = 1.15 * Math.sqrt(2 * MyS * fhS * dS) / 1000, nPS = 2, RdS = RkS * pfT.kmod / 1.4 * nPS;
    res.travamento = { usado: !!travCima, Nc: res.nosForca.caibroNc || 0, Fb: Fb, Rd_lateral: RdS, parafuso: "5 mm, " + nPS + " por ponto (EN 1995-1-1, 8.2.2, modo f, β = 1, fu = 600 MPa; fonte secundária)", eta: travCima ? Fb / RdS : 0 };
    if (travCima) res.apoioEta.VS = Math.max(res.apoioEta.VS, res.travamento.eta);
    /* TORQUE na viga principal: a força horizontal (em X) que o caibro leva à VP atua no topo da VP, a e = hVP/2 do eixo. Caibros ORDINÁRIOS: t = H·e/s por metro, T no apoio = t·L/2 (torção impedida nos pilares); caibro sobre o PILAR (leva a força do pórtico pela mão-francesa): T = H·e local, junto ao pilar */
    var Hh = (res.nosForca.caibro.HordEq || 0) + Fb, eArm = sVP.h / 2, tDist = Hh * eArm / p.sCaibro, LvpG = 0, Hpil = res.nosForca.caibro.HpilEq || 0; G.membros.forEach(function (m) { if (m.g === "VP") LvpG = Math.max(LvpG, gapM[m.id]); });
    var TVP = tDist * LvpG / 2 + Hpil * eArm, vTV = MD.barra2022({ N: 0, My: 0, Mz: 0, Vy: res.vpV || 0, Vz: 0, T: TVP, b: sVP.b, h: sVP.h, L0y: LvpG, L0z: LvpG, L1: 0.01, classe: CL, perfil: pfT });
    res.vpTorcao = { Hpil: Hpil, T_ordinarios: tDist * LvpG / 2, T_pilar: Hpil * eArm, H: Hh, e: eArm, s: p.sCaibro, L: LvpG, t: tDist, T: TVP, V: res.vpV || 0, eta: vTV.eta }; reg("VP", vTV.eta, "VP: torque T = H·e·L/(2·s) + cortante", "torque", {});
    res.apoio90 = { VP: { sigma_MPa: Npil / (Math.min(sVP.b, sP.b) * sP.h) / 1e3, fc90d_MPa: fc90(sP.h * 100, kL), eta: res.apoioEta.VP }, VS: { sigma_MPa: res.nosForca.caibro.downEq / (Math.min(sVS.b, sVP.b) * sVP.b) / 1e3, fc90d_MPa: fc90(sVP.b * 100, kL), eta: res.apoioEta.VS } };
    /* concentrada de 1 kN no meio do vão do caibro (6.4: elemento isolado, isolada das demais variáveis) — viga bi-apoiada entre os alinhamentos */
    (function () {
      var L = I.vao, bb = sec.VS, pfc = perfil("longa"), g1 = q.pesoMLC * bb.b * bb.h, gPl = (I.ripa ? q.pesoMLC * I.ripa.b * I.ripa.h / I.ripa.s : 0) + (p.plantas || 0), twm = trib(I.zC, Math.floor(I.zC.length / 2));
      var wG = g1 + (p.cobPeso + gPl * I.sc * 0 + gPl / I.sc * 0 + gPl) * twm, Md = 1.4 * wG * L * L / 8 + 1.5 * CONC * L / 4, Vd = 1.4 * wG * L / 2 + 1.5 * CONC / 2;
      var v = MD.barra2022({ N: 0, My: Md, Mz: 0, Vy: Vd, Vz: 0, T: 0, b: bb.b, h: bb.h, L0y: L, L0z: L, L1: travCima || L, classe: CL, perfil: pfc });
      res.concentrada = { L: L, wG: wG, Md: Md, Vd: Vd, eta: v.eta, comb: "1,4·G + 1,5·1 kN no meio do vão (kmod longa; elemento isolado, isolada das demais variáveis — 6.4)", governa: v.governa }; reg("VS", v.eta, "caibro: 1 kN concentrado (6.4)", "concentrada", {});
    })();
    var g1t = 0; M.barras.forEach(function (bb) { g1t += q.pesoMLC * bb.b * bb.h * bb.L; }); cargasTot.G1 = [0, -g1t, 0]; res.G1_kN = g1t;
    res.QCOB = QCOB; res.cargasTotais = cargasTot; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk, pVed: (VT.zonas && VT.zonas.locais && VT.zonas.locais.vedacao && VT.zonas.locais.vedacao.p) || 2.0 * VT.q }; res.casosVento = VT.casos.map(function (c) { return c.id; });
    res.secoes = copia(sec); res.modelo = M; res.tipologia = "T5"; res.avisosAnalise = r.avisos;
    Object.defineProperty(res, "_casos", { value: CS, enumerable: false }); Object.defineProperty(res, "_analise", { value: r, enumerable: false }); Object.defineProperty(res, "_elu", { value: elu, enumerable: false });
    /* ---- ELS ---- */
    var PHI = perfil("permanente").phi, psi1W = CA.PSI.W.psi1;
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var re = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: modelo.casos }, { combinacoes: els, estacoes: 3, comPCG: true }); modeloSemFalha(re.avisos);
    var Dd = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; }, psi2 = CA.PSI["Q-cobertura"].psi2;
    function dfin(id, iw) { var g = Dd("g", id), qd = Dd("q", id), w = iw ? Dd("w" + iw, id) : [0, 0, 0]; return [0, 1, 2].map(function (k) { return g[k] * (1 + PHI) + qd[k] * (1 + psi2 * PHI) + (iw ? psi1W * w[k] : 0); }); }
    var fm = {}, flech = {}, topo = 0;
    function regF(chave, grp, valor, lim, extra) { var e = valor / lim; if (!fm[chave] || e > fm[chave].eta) fm[chave] = ext({ mm: Math.round(valor * 1e5) / 100, limite_mm: Math.round(lim * 1e5) / 100, eta: e, grupo: grp }, extra || {}); flech[grp] = Math.max(flech[grp] || 0, e); }
    var nodoId = function (P) { var k = P.map(function (v) { return Math.round(v * 1e4); }).join(","); var n = null; M.nos.forEach(function (x) { if (Math.round((x.x + p.origem.x) * 1e4) === Math.round(P[0] * 1e4) && Math.round((x.z + p.origem.y) * 1e4) === Math.round(P[1] * 1e4) && Math.round(x.y * 1e4) === Math.round(P[2] * 1e4)) n = x.id; }); return n; };
    function relSag(idMeio, idA, idB, ta) { var dm = dfin(idMeio), da = dfin(idA), db = dfin(idB), t = ta; return Math.abs(dm[1] - (da[1] + (db[1] - da[1]) * t)); }
    var wIds = CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { return c.id; });
    function sagMax(idMeio, idA, idB, ta) { var m = relSag(idMeio, idA, idB, ta); wIds.forEach(function (w) { var dm = dfin(idMeio, w), da = dfin(idA, w), db = dfin(idB, w); m = Math.max(m, Math.abs(dm[1] - (da[1] + (db[1] - da[1]) * ta))); }); return m; }
    G.membros.forEach(function (m) {
      if (m.g === "VS") {
        var xa0 = m.p0[0], xb0 = m.p1[0], xs = [0, I.vao]; if (m.parede === "p0") xs = [xa0, I.vao]; if (m.parede === "p1") xs = [0, xb0];
        var A = nodoId([xs[0], m.z, I.yX(xs[0])]), B = nodoId([xs[1], m.z, I.yX(xs[1])]), Mi = nodoId([(xs[0] + xs[1]) / 2, m.z, I.yX((xs[0] + xs[1]) / 2)]);
        if (A && B && Mi) regF("vao" + m.id, "VS", sagMax(Mi, A, B, 0.5), I.vao / q.limVao);
        [[xa0, xs[0], xs[1]], [xb0, xs[1], xs[0]]].forEach(function (c) { var tip = c[0], ap = c[1], ou = c[2], bal = Math.abs(tip - ap); if (bal < 0.05) return; var Tn = nodoId([tip, m.z, I.yX(tip)]), An = nodoId([ap, m.z, I.yX(ap)]), On = nodoId([ou, m.z, I.yX(ou)]); if (!Tn || !An || !On) return; var tt = (tip - ap) / (ou - ap); regF("balanco" + m.id + (tip === xa0 ? "a" : "b"), "VS", sagMax(Tn, An, On, tt), bal / q.limBalanco); });
      }
      if (m.g === "VP") {
        var zs = I.zP; for (var k = 0; k + 1 < zs.length; k++) { var zm = (zs[k] + zs[k + 1]) / 2, best = null; M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - m.linha) < 1e-3 && Math.abs(n.y - m.p0[2]) < 1e-3 && (!best || Math.abs(n.z + p.origem.y - zm) < Math.abs(best.z + p.origem.y - zm))) best = n; });
          var A2 = nodoId([m.linha, zs[k], m.p0[2]]), B2 = nodoId([m.linha, zs[k + 1], m.p0[2]]); if (best && A2 && B2) regF("vao" + m.id + "_" + k, "VP", sagMax(best.id, A2, B2, (best.z + p.origem.y - zs[k]) / (zs[k + 1] - zs[k])), (zs[k + 1] - zs[k]) / q.limVao); }
        [[m.p0[1], zs[0], zs[1]], [m.p1[1], zs[zs.length - 1], zs[zs.length - 2]]].forEach(function (c) { var bal = Math.abs(c[0] - c[1]); if (bal < 0.05 || zs.length < 2) return; var Tn = nodoId([m.linha, c[0], m.p0[2]]), An = nodoId([m.linha, c[1], m.p0[2]]), On = nodoId([m.linha, c[2], m.p0[2]]); if (Tn && An && On) regF("balancoVP" + m.id + c[0].toFixed(1), "VP", sagMax(Tn, An, On, (c[0] - c[1]) / (c[2] - c[1])), bal / q.limBalanco); });
      }
    });
    M.barras.forEach(function (b) { if (b.grupo !== "P") return; var topId = b.j, Hh = Hp[b.mem.id]; CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) { var d = Dd("w" + c.id, topId); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (Hh / 300)); }); });
    flech.P = Math.max(flech.P || 0, topo); fm.topoPilarVentoFreq_H300 = { eta: topo, grupo: "P" };
    res.flechasMm = fm; res.flechas = flech; res.phi = PHI;
    res.avisos.push("T5: o caibro APOIA centrado sobre a viga principal: a rigidez de torção da VP é reduzida a 0,1 % no pórtico (a rotação do caibro não vira torque na VP).");
    res.avisos.push("T5: não modelados (declarado): vento oblíquo, torção por excentricidade do vento (6.6), fixação da cobertura nas ripas/caibros (do fabricante da placa), calha e drenagem; eixos da VP e do caibro no mesmo nível (a excentricidade h/2 entre eles é desprezada no pórtico — o caibro apoia sobre a VP e a ligação é verificada à parte).");
    if (!q.empocamentoVerificado && p.comCob && p.incl < 0.05) res.avisos.push("T5: inclinação abaixo de 5 %: verificar o empoçamento progressivo (NBR 6120:2019, Anexo D).");
    return res;
  }

  /* ---------- ripado (fora do pórtico): viga contínua sobre os caibros, com as cargas reais ---------- */
  function t5Ripado(q, sec, res) {
    var Dm = D(), AN = Dm.AN, MD = Dm.MD, MM = Dm.MM, p = q.params, G = T5.geometria(p), I = G.info; if (!I.ripa) return null;
    var perfil = perfilFn(q), zC = I.zC, s = sec.RP || { b: I.ripa.b, h: I.ripa.h }, mod = modulos(MM.classe2022(q.classe)), CA = Dm.CA, cos = 1 / I.sc;
    var QCOB = res ? res.QCOB : CA.sobrecargaCobertura(Math.max(1, p.incl * 100), {});
    var pesoR = q.pesoMLC * s.b * s.h, qpl = (QCOB && QCOB.q || 0.25) * I.ripa.s * cos, gc = (p.cobPeso + (p.plantas || 0) * cos) * I.ripa.s;
    var VT = res && res.vento ? res.vento.q : 0.5, wv = CX_BARRA * VT * kBarra(I.ripa.L, s.h) * s.h * (1 + (I.ripa.n - 1) * eta14(I.ripa.s / s.h)) / I.ripa.n;
    var nos = zC.map(function (z, i) { return { id: "r" + i, x: z, y: 0, z: 0 }; }), barras = [], apoios = [], i2;
    for (i2 = 0; i2 + 1 < zC.length; i2++) barras.push({ id: "b" + i2, i: "r" + i2, j: "r" + (i2 + 1), E: mod.E, G: mod.G, vy: [0, 1, 0], nElem: 2, pesoEsp: q.pesoMLC, secao: ret(s.b, s.h), b: s.b, h: s.h, L: zC[i2 + 1] - zC[i2] });
    zC.forEach(function (z, i) { apoios.push({ no: "r" + i, ux: i === 0, uy: true, uz: true, rx: i === 0 }); });
    var cargas = function (qy) { return barras.map(function (b) { return { tipo: "barra", barra: b.id, q: [0, qy, 0] }; }); };
    var casos = [{ id: "G", cargas: [{ tipo: "pesoProprio" }].concat(cargas(-gc)) }, { id: "Q", cargas: cargas(-qpl) }, { id: "C", cargas: [{ tipo: "no", no: "r" + Math.floor(zC.length / 2), F: [0, -CONC, 0, 0, 0, 0] }] }];
    var an = AN.analisar({ nos: nos, barras: barras, apoios: apoios, casos: casos }, { combinacoes: [{ id: "u1", fatores: { G: 1.4, Q: 1.5 } }, { id: "u2", fatores: { G: 1.4, C: 1.5 } }, { id: "g", fatores: { G: 1 } }, { id: "gq", fatores: { G: 1, Q: 1 } }], estacoes: 5, comPCG: false });
    if (!an.ok) throw new Error("análise do ripado: " + (an.motivo || ""));
    var pf = perfil("longa"), eta = 0, gov = "", Mmax = 0, Vmax = 0;
    ["u1", "u2"].forEach(function (cid) { barras.forEach(function (b) { an.combinacoes[cid].barras[b.id].estacoes.forEach(function (e) { var v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: b.L, classe: q.classe, perfil: pf })); Mmax = Math.max(Mmax, Math.abs(e.Mz)); Vmax = Math.max(Vmax, hyp(e.Vy, e.Vz)); if (v.eta > eta) { eta = v.eta; gov = v.governa; } }); }); });
    var Lmax = 0; barras.forEach(function (b) { Lmax = Math.max(Lmax, b.L); });
    var wU = 1.4 * (pesoR + gc) + 1.5 * qpl, Mbi = wU * Lmax * Lmax / 8, vb = MD.barra2022({ N: 0, My: Mbi, Mz: 0, Vy: wU * Lmax / 2, Vz: 0, T: 0, b: s.b, h: s.h, L0y: Lmax, L0z: Lmax, L1: Lmax, classe: q.classe, perfil: pf });
    var flecha = 0, nm = Math.floor(zC.length / 2), d1 = an.combinacoes.g.desloc["r" + nm][1], d2 = an.combinacoes.gq.desloc["r" + nm][1], PHI = perfil("permanente").phi;
    var maxF = 0; barras.forEach(function (b) { var mid = null; /* flecha no meio de cada vão: nó intermediário não existe; usa a fórmula do vão com a rigidez real */ var wq = (pesoR + gc + qpl * 0.6) , dEl = 5 * wq * Math.pow(b.L, 4) / (384 * mod.E * s.b * Math.pow(s.h, 3) / 12) * (1 + PHI); maxF = Math.max(maxF, dEl / (b.L / q.limVao)); });
    /* vento que LEVANTA (0,9·G + 1,4·W para cima) e flexão nas duas direções; arrancamento dos parafusos ripa × caibro (EN 1995-1-1, 8.7.2, eq. 8.38 — fonte secundária) */
    var clr = MM.classe2022(q.classe), pfc = perfil("curta"), pVed = (res && res.vento && res.vento.pVed) || 2.0 * VT, dP = 0.005, lefP = 0.035, nPar = 2;
    var faxk = 0.52 * Math.pow(dP * 1000, -0.5) * Math.pow(lefP * 1000, -0.1) * Math.pow(clr.rhok, 0.8), RkP = faxk * dP * 1000 * lefP * 1000 / 1000, RdP = RkP * pfc.kmod / 1.4;
    function uplevanta(larg, comGc) {
      var wup = pVed * larg, wnet = 1.4 * wup - 0.9 * (pesoR + (comGc ? gc : 0)), Mup = Math.max(0, wnet) * Lmax * Lmax / 8, wh = 1.4 * wv, Mh = wh * Lmax * Lmax / 8;
      var vU = MD.barra2022({ N: 0, My: Mup, Mz: Mh, Vy: Math.max(0, wnet) * Lmax / 2, Vz: wh * Lmax / 2, T: 0, b: s.b, h: s.h, L0y: Lmax, L0z: Lmax, L1: Lmax, classe: q.classe, perfil: pfc }), Fp = 1.1 * Math.max(0, wnet) * Lmax / nPar;
      return { wup: wup, wnet: wnet, Mup: Mup, Mh: Mh, eta: vU.eta, governa: vU.governa, F_parafuso: Fp, eta_parafuso: Fp / RdP };
    }
    var upC = uplevanta(s.b, false), upR = I.ripa ? uplevanta(I.ripa.s, true) : upC, presaRipas = p.comCob && p.coberturaPresaEm === "ripas", upUso = presaRipas ? upR : upC;
    var etaUp = Math.max(upUso.eta, upUso.eta_parafuso);
    var etaTotal = Math.max(eta, vb.eta, etaUp);
    return { eta: etaTotal, etaLevanta: etaUp, levanta: { usado: presaRipas ? "ripas" : "caibros", comCoberturaNosCaibros: upC, comCoberturaNasRipas: upR, parafuso: { d_mm: 5, lef_mm: 35, n: nPar, Rk: RkP, Rd: RdP, fonte: "EN 1995-1-1, 8.7.2 (eq. 8.38): fax,k = 0,52·d^−0,5·lef^−0,1·ρk^0,8; fonte secundária" }, pVed: pVed }, etaPortico: eta, etaBiapoiada: vb.eta, Mbi: Mbi, Mmax: Mmax, L: Lmax, vaos: barras.length, wU: wU, flechaEta: maxF, governa: gov, concentrada: CONC, ventoHoriz: { Cx: CX_BARRA, q: VT, F_kNm: wv }, passos: ["Ripa " + Math.round(s.b * 100) + "×" + Math.round(s.h * 100) + " cm contínua sobre " + zC.length + " caibros (vão máx. " + br(Lmax) + " m), s = " + br(I.ripa.s * 100, 0) + " cm; ELU 1,4·G + 1,5·(Q em planta × s) e 1,4·G + 1,5·1 kN; M da viga bi-apoiada w·L²/8 = " + br(Mbi, 3) + " kN·m ≤ M de projeto."] };
  }

  /* ---------- crescimento ---------- */
  function t5Pior(r, sec) {
    var z = {}; Object.keys(r.grupos).forEach(function (g) { z[g] = Math.max(r.grupos[g].eta, (r.flechas && r.flechas[g]) || 0); });
    Object.keys(r.flechas || {}).forEach(function (g) { if (z[g] == null) z[g] = r.flechas[g]; });
    Object.keys(r.apoioEta || {}).forEach(function (g) { z[g] = Math.max(z[g] || 0, r.apoioEta[g]); });
    if (r.ripado) z.RP = r.ripado.eta;
    return z;
  }
  function t5Crescer(q, sec, g, r) {
    var L = q.limites[g] || { hMax: 0.5, bMax: 0.25 }, s = sec[g], pa = q.passo.altura, pl = q.passo.largura; if (!s) return false;
    if (g === "P") { if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); s.h = s.b; return true; } return false; }
    if ((g === "VP" || g === "VS") && r && r.apoioEta && r.apoioEta[g] > 1 + 1e-9 && (!r.grupos[g] || r.grupos[g].eta <= 1 + 1e-9) && s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; }      /* apoio ⊥ às fibras: a largura da viga manda */
    if (g === "VP" && r && r.apoioEta && r.apoioEta.VP > 1 + 1e-9 && sec.P && sec.P.b + pl <= (q.limites.P || L).bMax + 1e-9) { sec.P.b = r2(sec.P.b + pl); sec.P.h = sec.P.b; return true; }
    if (g === "MF") { var eb = r && r.esbeltez && r.esbeltez.MF; if (eb && eb.eixo === "b" && s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; } if (s.h + pa <= L.hMax + 1e-9) { s.h = r2(s.h + pa); return true; } if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; } return false; }
    if (g === "RP") { if (s.h + 0.01 <= L.hMax + 1e-9) { s.h = r2(s.h + 0.01); return true; } if (s.b + 0.01 <= L.bMax + 1e-9) { s.b = r2(s.b + 0.01); return true; } return false; }
    if (s.h + pa <= L.hMax + 1e-9) { s.h = r2(s.h + pa); return true; }
    if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; }
    return false;
  }
  /** ENXUGAR: depois que o laço fecha, tenta uma seção MENOR em cada peça (VS, VP, P), um passo por vez, e fica com ela se tudo continuar passando e a peça ficar com η ≤ alvo (padrão 0,95). A seção menor vence. */
  function t5Enxugar(proj, sec, r, pior, opcoes) {
    var q = proj._pad5, alvo = (opcoes && opcoes.etaAlvo) || q.etaAlvo || 0.95, MIN = { VS: { b: 0.06, h: 0.10 }, VP: { b: 0.06, h: 0.14 }, P: { b: 0.12, h: 0.12 } }, passos = [], mexeu = true, voltas = 0;
    while (mexeu && voltas++ < 12) {
      mexeu = false;
      ["VS", "VP", "P"].forEach(function (g) {
        (g === "P" ? ["b"] : ["h", "b"]).forEach(function (dim) {
          var t = copia(sec), passo = dim === "h" ? q.passo.altura : q.passo.largura; if (t[g][dim] - passo < MIN[g][dim] - 1e-9) return; t[g][dim] = r2(t[g][dim] - passo); if (g === "P") t.P.h = t.P.b;
          var r2x, rp, pz, ok = true; try { r2x = t5Rodar(proj, t); rp = t5Ripado(proj._pad5, r2x.secoes, r2x); if (rp) r2x.ripado = rp; pz = t5Pior(r2x, t); } catch (ex) { return; }
          Object.keys(pz).forEach(function (k) { if (t[k] && pz[k] > (k === g ? alvo : 1) + 1e-9) ok = false; }); if (!ok) return;
          passos.push({ grupo: g, dimensao: dim, de: sec[g][dim], para: t[g][dim], eta: pz[g] }); sec = t; r = r2x; pior = pz; mexeu = true;
        });
      });
    }
    proj._pad5 = proj._pad5; r = t5Rodar(proj, sec); var rp0 = t5Ripado(proj._pad5, r.secoes, r); if (rp0) r.ripado = rp0; pior = t5Pior(r, sec);
    return { sec: sec, r: r, pior: pior, passos: passos };
  }
  function t5Dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var sec = copia(partida), hist = [], it, r, pior, falha, mexeu, q;
    for (it = 0; it < (opcoes.maxIter || 30); it++) {
      try { r = t5Rodar(proj, sec); } catch (ex) {
        if (!/instável|mecanismo/.test(String(ex.message)) || it >= 10) throw ex;
        var gr = false; Object.keys(sec).forEach(function (k) { if (t5Crescer(proj._pad5 || t5Padrao(proj), sec, k)) gr = true; }); if (!gr) throw ex; hist.push({ it: it, sec: copia(sec), instavel: String(ex.message).slice(0, 120) }); continue;
      }
      q = proj._pad5; var rp = t5Ripado(q, r.secoes, r); if (rp) { r.ripado = rp; }
      pior = t5Pior(r, sec); hist.push({ it: it, sec: copia(sec), pior: pior }); if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1 + 1e-9 && sec[k]; });
      if (!falha.length) { if (!opcoes.semEnxugar) { var en = t5Enxugar(proj, sec, r, pior, opcoes); sec = en.sec; r = en.r; pior = en.pior; hist.push({ it: it + 1, sec: copia(sec), pior: pior, enxugou: en.passos }); } return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior, enxugou: en ? en.passos : [] }; }
      mexeu = false; falha.sort(function (u, v) { return pior[v] - pior[u]; }).forEach(function (k) { if (t5Crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }

  var MadT5Calc = { enxugar: t5Enxugar, eta14: eta14, kBarra: kBarra, LIMITES: T5_LIM, CX_BARRA: CX_BARRA, CONC: CONC, padrao: t5Padrao, vento: t5Vento, montar: t5Montar, casos: t5Casos, rodar: t5Rodar, ripado: t5Ripado, pior: t5Pior, crescer: t5Crescer, dimensionar: t5Dimensionar, perfilFn: perfilFn, durClasse: durClasse, modulos: modulos, ret: ret };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT5Calc;
  else global.MadT5Calc = MadT5Calc;
})(typeof window !== "undefined" ? window : this);

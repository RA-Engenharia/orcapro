/* =====================================================================
 * madencaixetip.js — REGRAS DE ENCAIXE POR TIPOLOGIA (T3 4 águas primeiro; T2 e as outras usam o mesmo molde) sobre o motor js/madencaixe.js.
 * Entrada: os membros do modelo de cálculo (eixos concorrentes nos nós) + as seções. Saída: as PEÇAS FÍSICAS (sólidos cortados), a conferência e as listas.
 * Decisões e conta à mão: docs/madeira/ENCAIXES-REFERENCIA.md. Motor PURO, ES5, Node-testável.
 * ===================================================================== */
(function (global) {
  "use strict";
  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var ME = req("MadEncaixe", "madencaixe.js"), V = ME.v;
  var dot = V.dot, sub = V.sub, add = V.add, mul = V.mul, un = V.un, cruz = V.cruz, rd = V.rd;
  var FOLGA = ME.FOLGA;

  function secDe(sec, g) { return sec[g === "DV" ? "DX" : g] || null; }
  function copiaP(P) { return [P[0], P[1], P[2]]; }

  /* ================================================================ T3 — 4 ÁGUAS
   * ARRANJO DE CARPINTEIRO (17/11/2026, ver ENCAIXES-REFERENCIA.md §3):
   *  · tesoura (BS, BI, PD, DG; MS, MI, MP, MG) nos eixos do modelo de cálculo;
   *  · terça EMBUTIDA no plano do banzo (eixo no eixo), BIAPOIADA entre as tesouras: interrompida em cada tesoura, estribo na face lateral do banzo e emenda passante em fenda
   *    que transmite só a força AXIAL (tirante do arco do espigão); espigão com a face de baixo no nível de apoio da tesoura (evE), cumeeira entre os banzos (evCM);
   *  · frechal FR e pilares P/PO ficam EMBAIXO da tesoura (a tesoura assenta no frechal, o frechal no pilar): descem dFR; o eixo da reação não muda;
   *  · linhas LB apoiadas no frechal; diagonais em X de contraventamento em camadas (contato no cruzamento). */
  var RANK_T3 = { P: 100, PO: 100, FR: 95, CM: 92, BS: 90, MS: 90, E: 80, BI: 71, MI: 70, T: 60, PD: 50, MP: 50, DG: 40, MG: 40, LB: 30, DV: 22, DX: 20, DP: 20 };
  var SELA_ALT_MIN = 0.02;

  function normalAgua(ag, i) {
    var sc = Math.sqrt(1 + i * i);
    return ag === "F" ? [0, -i / sc, 1 / sc] : ag === "B" ? [0, i / sc, 1 / sc] : ag === "W" ? [-i / sc, 0, 1 / sc] : ag === "E" ? [i / sc, 0, 1 / sc] : [0, 0, 1];
  }
  /** monta as peças físicas da T3. G = MadT3.geometria(...) (membros com p0/p1 e eixo0/eixo1 opcionais); sec = seções por grupo. */
  function montarT3(G, sec, opts) {
    opts = opts || {}; var I = G.info, i = I.incl, sc = Math.sqrt(1 + i * i), cosT = 1 / sc, Hp = I.Hp, howe = I.tesouraTipo === "howe";
    var hBS = sec.BS.h, hT = sec.T.h, hE = sec.E ? sec.E.h : 0.30, hFR = sec.FR.h, hBI = sec.BI.h, hLB = sec.LB ? sec.LB.h : 0.10, hCM = sec.CM ? sec.CM.h : 0.24;
    /* ARRANJO DE CARPINTEIRO (decisão de 17/11/2026, ENCAIXES-REFERENCIA §3): a terça é EMBUTIDA no plano do banzo (eixo no eixo, evT = 0), interrompida em cada tesoura e encostada
       nas faces laterais do banzo; a emenda passante (chapa em fenda) leva a continuidade que o cálculo exige. Espigão com a face de baixo no nível de apoio da tesoura sobre o frechal;
       cumeeira com o topo no topo dos banzos. Só ficam deslocados: espigão (evE), cumeeira (evCM), frechal (dFR) e linha LB (dLB). */
    var evT = 0;
    var topoN = hBS / 2 + hT;
    var phi = Math.atan(i / Math.SQRT2), cphi = Math.cos(phi);
    var evE = (hE - hBS) / 2;                                            /* espigão: a face de baixo no nível de apoio da tesoura (≈ (h_E − h_BS)/2) */
    var evCM = hBS / (2 * cosT) - hCM / 2, seatCM = hBS / cosT;          /* cumeeira ENTRE os banzos, topo no topo dos banzos: o banzo encosta na face lateral em toda a altura */
    var dFR = (hFR + hBI) / 2;                                           /* frechal desce: a tesoura assenta nele */
    var dLB = (hBI - hLB) / 2;
    var pecas = [], info = { evT: evT, evE: evE, evCM: evCM, dFR: dFR, dLB: dLB, assentoCM: seatCM, topoN: topoN }, M = G.membros;
    function eixo(m) { return [copiaP(m.eixo0 || m.p0), copiaP(m.eixo1 || m.p1)]; }
    function nova(m, p0, p1, up, extra) {
      var s = secDe(sec, m.g); if (!s) return null;
      var def = { id: m.id, g: m.g, p0: p0, p1: p1, up: up, rank: RANK_T3[m.g] || 10, agua: m.agua, tes: m.tes, noCalc0: eixo(m)[0], noCalc1: eixo(m)[1], nosCalc: (m.nos || []).map(copiaP), excent: 0 };
      if (s.forma === "circular") def.d = s.d; else { def.b = s.b; def.h = s.h; }
      Object.keys(extra || {}).forEach(function (k) { def[k] = extra[k]; });
      var P = ME.criarPeca(def); pecas.push(P); return P;
    }
    var xsSet = I.xs;
    M.forEach(function (m) {
      var e = eixo(m), a0 = e[0], a1 = e[1], up = require_upDe(m), P;
      if (!secDe(sec, m.g)) return;
      if (m.g === "P" || m.g === "PO") {
        var topo = Hp - dFR - hFR / 2;                                   /* topo do pilar = fundo do frechal */
        nova(m, a0, [a1[0], a1[1], topo], [1, 0, 0], { excent: 0, noCalc1: a1 });
      } else if (m.g === "FR") {
        var d0 = copiaP(a0), d1 = copiaP(a1); d0[2] -= dFR; d1[2] -= dFR;
        nova(m, d0, d1, [0, 0, 1], { excent: dFR, nosCalc: (m.nos || []).map(function (q) { return copiaP(q); }), apoio: true });
      } else if (m.g === "T") {
        var n = normalAgua(m.agua, i);
        nova(m, a0, a1, n, { excent: 0, nosCalc: (m.nos || []).map(copiaP), segmentar: true, noCalcOrig: [a0, a1] });
      } else if (m.g === "E") {
        nova(m, [a0[0], a0[1], a0[2] + evE], [a1[0], a1[1], a1[2] + evE], up, { excent: evE * cphi, canto: m.canto, sx: m.sx, sz: m.sz });
      } else if (m.g === "CM") {
        nova(m, [a0[0], a0[1], a0[2] + evCM], [a1[0], a1[1], a1[2] + evCM], [0, 0, 1], { excent: evCM });
      } else if (m.g === "LB") {
        nova(m, [a0[0], a0[1], a0[2] - dLB], [a1[0], a1[1], a1[2] - dLB], [0, 0, 1], { excent: dLB, segmentar: true });
      } else if (m.g === "DP") {
        var q0 = copiaP(a0), q1 = copiaP(a1); if (Math.abs(q0[2] - Hp) < 1e-6) q0[2] -= dFR; if (Math.abs(q1[2] - Hp) < 1e-6) q1[2] -= dFR;
        nova(m, q0, q1, up, { excent: 0 });
      } else if (m.g === "DV") {                                                                 /* diagonal vertical: o pé APOIA sobre a linha LB (sobe h/2 no nó de baixo) em vez de entalhar a linha ou a diagonal */
        var q0 = copiaP(a0), q1 = copiaP(a1), hD = (secDe(sec, "DV") || {}).h || 0.12; var dTopo = Math.min((hT / 2 + hD / 2) / cosT, hBS / (2 * cosT) + hD / 2 - 0.02);   /* ao menos 2 cm da face do topo da diagonal sobrepõem a altura do banzo (contato na lateral) */      /* o topo desce para baixo da terça (a terça passa no plano vertical da diagonal) */
        var zk = (Math.abs(q0[2] - Hp) < 1e-6 ? q0 : q1)[1], temTerca = M.some(function (t) { return t.g === "T" && Math.abs(t.p0[1] - zk) < 1e-3 && Math.abs(t.p1[1] - zk) < 1e-3; });
        [q0, q1].forEach(function (q) { if (Math.abs(q[2] - Hp) < 1e-6) q[2] += hD / 2; else if (temTerca) q[2] -= dTopo; });
        nova(m, q0, q1, up, {});
      } else nova(m, a0, a1, up, {});
    });
    /* terças sem banzo no nó (o apoio por contato nas faces do banzo exige a tesoura): lista para a conferência */
    info.semBanzo = [];
    pecas.forEach(function (P) { if (P.g !== "T") return; (P.nosCalc || []).forEach(function (Q) { var ok = pecas.some(function (O) { if ((O.g !== "BS" && O.g !== "MS") || !O.noCalc1) return false; var dd = sub(O.noCalc1, O.noCalc0), L2 = dot(dd, dd) || 1, t = Math.max(0, Math.min(1, dot(sub(Q, O.noCalc0), dd) / L2)); return V.dist(Q, add(O.noCalc0, mul(dd, t))) < 0.002; }); if (!ok) info.semBanzo.push({ peca: P.id, no: Q }); }); });
    /* contraventamento em X: camadas */
    cruzamentosX(pecas, sec, info);
    segmentarLB(pecas, info);                                            /* LB e terças viram trechos entre as faces dos banzos/tirantes */
    /* excentricidade DECLARADA = distância dos nós de cálculo ao eixo físico, só nos grupos que a decisão desloca (os demais têm de concorrer no nó) */
    var AJ = { FR: 1, T: 1, E: 1, CM: 1, LB: 1, DP: 1, DX: 1, DV: 1 };
    pecas.forEach(function (P) {
      if (!AJ[P.g]) return; var pts = [P.noCalc0, P.noCalc1].concat(P.nosCalc || []), mx = 0;
      pts.forEach(function (Q) { if (!Q) return; var t = dot(sub(Q, P.p0), P.ex), foot = add(P.p0, mul(P.ex, t)); mx = Math.max(mx, V.dist(Q, foot)); });
      P.excent = mx;
    });
    return { pecas: pecas, info: info, cfg: cfgT3(I, howe, evE, info) };
  }
  function require_upDe(m) { var T3 = req("MadT3", "madt3.js"); return T3.upDe(m); }

  /** diagonais em X (DX, DV, DP): cada par que se cruza vai em CAMADAS — a seção das duas gira para a normal do plano do X e a 2ª desloca-se pela altura da 1ª
   *  (as duas se tocam face a face no cruzamento; excentricidade declarada = h). */
  function cruzamentosX(pecas, sec, info) {
    var diag = pecas.filter(function (P) { return P.g === "DX" || P.g === "DV" || P.g === "DP"; }), usado = {};
    function pontoCruz(A, B) {
      var d1 = sub(A.p1, A.p0), d2 = sub(B.p1, B.p0), r = sub(A.p0, B.p0), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
      var s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0.5, t = Math.max(0, Math.min(1, (b * s + f) / e));
      return { s: s, t: t, d: V.dist(add(A.p0, mul(d1, s)), add(B.p0, mul(d2, t))) };
    }
    diag.forEach(function (A) {
      diag.forEach(function (B) {
        if (A === B || usado[A.id] || usado[B.id] || A.g !== B.g) return; var pc = pontoCruz(A, B);
        if (pc.d < 0.02 && pc.s > 0.2 && pc.s < 0.8 && pc.t > 0.2 && pc.t < 0.8) {
          var nn = un(cruz(sub(A.p1, A.p0), sub(B.p1, B.p0)));
          if (nn[2] < 0 || (Math.abs(nn[2]) < 1e-6 && (nn[1] < 0 || (Math.abs(nn[1]) < 1e-6 && nn[0] < 0)))) nn = mul(nn, -1);
          [A, B].forEach(function (Q) { Q.up = nn; var q = ME.quadro(Q.p0, Q.p1, nn); Q.ex = q.ex; Q.ey = q.ey; Q.ez = q.ez; ME.invalidar(Q); });
          var hh = B.h || B.d, sim = A.g !== "DX", dB = mul(nn, sim ? hh / 2 : -hh), dA = sim ? mul(nn, -hh / 2) : [0, 0, 0];   /* paredes e planos verticais: ±h/2 (cabe na espessura do frechal/pilar); águas: uma no plano, outra embaixo (as terças vêm por cima) */
          B.p0 = add(B.p0, dB); B.p1 = add(B.p1, dB); B.excent = V.len(dB); ME.invalidar(B);
          A.p0 = add(A.p0, dA); A.p1 = add(A.p1, dA); A.excent = V.len(dA); ME.invalidar(A);
          if (A.g === "DP" && Math.abs(nn[0]) > Math.abs(nn[1])) { A.rank += 1; B.rank += 1; }      /* paredes que se encontram no pilar de canto: a do plano X corta a do plano Z (corte de ponta, não empate) */
          usado[A.id] = usado[B.id] = true; info.xCamadas = (info.xCamadas || 0) + 1;
        }
      });
    });
  }
  /** a linha longitudinal LB atravessa as tesouras: vira trechos entre as faces das BI (cada ponta encosta na lateral da BI) */
  function segmentarLB(pecas, info) {
    var novas = [], fora = [];
    pecas.forEach(function (P) {
      if (!P.segmentar) return;
      var cortes = [0], nos = (P.nosCalc || []).map(function (q) { return V.dot(sub(q, P.p0), P.ex); }).filter(function (s) { return s > 0.05 && s < P.L - 0.05; }).sort(function (a, b) { return a - b; });
      cortes = cortes.concat(nos).concat([P.L]); if (cortes.length <= 2) return;
      fora.push(P);
      for (var k = 0; k + 1 < cortes.length; k++) {
        var q0 = add(P.p0, mul(P.ex, cortes[k])), q1 = add(P.p0, mul(P.ex, cortes[k + 1])), def = {};
        Object.keys(P).forEach(function (kk) { def[kk] = P[kk]; });
        def.id = P.id + String.fromCharCode(97 + k); def.p0 = q0; def.p1 = q1; def.noCalc0 = cortes[k] === 0 ? P.noCalc0 : add(P.noCalc0, mul(un(sub(P.noCalc1, P.noCalc0)), cortes[k])); def.noCalc1 = null; def.nosCalc = []; def.segmentar = false;
        delete def.ex; delete def.ey; delete def.ez; delete def.L; delete def.poli; delete def.area; delete def.fins; delete def.rebaixos; delete def._S; delete def._box; delete def._mesh;
        var N = ME.criarPeca(def); N.noCalc1 = cortes[k + 1] === P.L ? P.noCalc1 : add(P.noCalc0, mul(un(sub(P.noCalc1, P.noCalc0)), cortes[k + 1])); novas.push(N);
      }
    });
    fora.forEach(function (P) { pecas.splice(pecas.indexOf(P), 1); });
    novas.forEach(function (N) { pecas.push(N); });
  }

  function cfgT3(I, howe, evE, info) {
    var G_T2 = I.tesouraTipo && !I.pir && I.nBI != null ? { x0: -I.eE, x1: I.a + I.eD } : null;       /* T2: terça, cumeeira e frechal vão até o beiral das empenas */
    function g(P) { return P.g; }
    var fink = I.tesouraTipo === "fink", dg = { DG: 1, MG: 1 }, bancos = { BS: 1, BI: 1, PD: 1, MS: 1, MI: 1, MP: 1, MG: 1, DG: 1 };
    return {
      rank: function (P) { return P.rank; },
      hospeda: function (H, G) {
        if (H.g === "CM" && (G.g === "BS" || G.g === "MS")) return true;     /* a cumeeira assenta no assento dos banzos: o banzo é cortado pelo fundo da cumeeira */
        if (G.g === "CM" && (H.g === "BS" || H.g === "MS")) return false;
        return undefined;
      },
      folga: function (A, B) {
        var a = A.g, b = B.g;
        if (howe && ((dg[a] && bancos[b]) || (dg[b] && bancos[a]))) return FOLGA;          /* diagonal comprimida: carga só por chapa + pinos */
        var alma = { PD: 1, DG: 1 }, corpo = { BS: 1, BI: 1, PD: 1, DG: 1 };
        if (fink && ((alma[a] && corpo[b]) || (alma[b] && corpo[a]))) return FOLGA;         /* Fink: cada ponta de alma a 10 mm dos banzos e das outras almas (FINK-REFERENCIA) */
        if (a === "E" && (b === "CM" || b === "BS" || b === "MS" || b === "E" || b === "PD")) return FOLGA;
        if (b === "E" && (a === "CM" || a === "BS" || a === "MS" || a === "E" || a === "PD")) return FOLGA;
        return 0;
      },
      ignora: function (A, B) { return false; },
      parcial: function (P) { return P.g === "DX" || P.g === "DV" || P.g === "DP"; },
      apoios: function (pecas) { return apoiosT3(pecas, info); },
      livre: function (P, e) {
        if ((P.g === "P" || P.g === "PO") && e === 0) return "base engastada na fundação (placa + chumbadores)";
        if (P.g === "E" && e === 0) return "ponta do beiral (balanço livre, corte de prumo)";
        if (P.g === "BS" && ((P.agua === "F" && e === 0) || (P.agua === "B" && e === 0))) return "ponta do beiral (balanço livre)";
        if (P.g === "MS" && e === 0) return "ponta do beiral (balanço livre)";
        if (G_T2 && (P.g === "T" || P.g === "CM" || P.g === "FR")) { var X = e === 0 ? P.p0[0] : P.p1[0]; if (X <= G_T2.x0 + 1e-3 || X >= G_T2.x1 - 1e-3) return "beiral de empena (balanço livre, testeira)"; }
        return null;
      }
    };
  }

  /** apoios sem corte: tesoura (BI/MI) sobre o frechal, frechal sobre o pilar, linha LB sobre o frechal, espigão sobre a sela */
  function apoiosT3(pecas, info) {
    var out = [];
    pecas.forEach(function (P) {                                                  /* toda ponta de terça termina na face do banzo, da meia-tesoura, da cumeeira ou do espigão */
      if (P.g !== "T") return;
      [0, 1].forEach(function (e) {
        var ok = P.fins[e].planos.some(function (pl) { return pl.contra && pecas.some(function (O) { return O.id === pl.contra && /^(BS|MS|CM|E)$/.test(O.g); }); });
        var tocaOutra = pecas.some(function (O) { return O !== P && O.g === "T" && V.dist(e ? P.p1 : P.p0, O.p0) < 0.005 || O !== P && O.g === "T" && V.dist(e ? P.p1 : P.p0, O.p1) < 0.005; });
        if (!ok && tocaOutra) out.push({ a: P, b: null, motivo: "terça " + P.id + ": a ponta " + (e ? "B" : "A") + " não encosta em banzo, cumeeira nem espigão" });
      });
    });
    function perto(Q, P) { var d = sub(P.noCalc1 || P.noCalc0, P.noCalc0), L2 = dot(d, d) || 1, t = Math.max(0, Math.min(1, dot(sub(Q, P.noCalc0), d) / L2)); return V.dist(Q, add(P.noCalc0, mul(d, t))) < 0.002; }
    pecas.forEach(function (P) {
      if (P.g === "BI" || P.g === "MI") [P.noCalc0, P.noCalc1].forEach(function (Q) { pecas.forEach(function (O) { if (O.g === "FR" && perto(Q, O)) out.push({ a: P, b: O, motivo: "tesoura sobre o frechal" }); }); });
      if (P.g === "P" || P.g === "PO") pecas.forEach(function (O) { if (O.g === "FR" && perto(P.noCalc1, O)) out.push({ a: O, b: P, motivo: "frechal sobre o pilar" }); });
      if (P.g === "LB") [P.noCalc0, P.noCalc1].forEach(function (Q) { if (!Q) return; pecas.forEach(function (O) { if (O.g === "FR" && perto(Q, O)) out.push({ a: P, b: O, motivo: "linha sobre o frechal" }); }); });
    });
    return out;
  }
  /** corta as pontas livres do beiral no prumo (plano vertical): cada peça de beiral termina num plano vertical perpendicular ao seu plano de simetria */
  function pontasBeiral(pecas) {
    pecas.forEach(function (P) {
      var liv = (P.g === "E" || P.g === "BS" || P.g === "MS") && true; if (!liv) return;
      var e = 0, ex = P.ex, hz = un([ex[0], ex[1], 0]); if (V.len([ex[0], ex[1], 0]) < 1e-6) return;
      var n = mul(hz, -1), d = dot(n, P.p0);                                  /* plano vertical em p0, normal horizontal para fora */
      if (P.g === "BS" && P.agua === "B" && V.dot(P.ex, [0, 1, 0]) > 0) return;
      P.fins[0].planos.push({ n: n, d: d, tipo: "prumo", contra: null }); ME.invalidar(P);
    });
  }

  /** fluxo completo: monta, corta, resolve e confere */
  function resolverT3(G, sec, opts) {
    var M = montarT3(G, sec, opts), pecas = M.pecas;
    pontasBeiral(pecas.filter(function (P) { return (P.g === "BS" && P.agua === "F") || (P.g === "BS" && P.agua === "B") || P.g === "E" || P.g === "MS"; }));
    pecas.forEach(function (P) { ME.solidoDe(P); });
    var rel = ME.resolver(pecas, M.cfg), conf = ME.conferir(pecas, M.cfg, rel);
    return { pecas: pecas, info: M.info, cfg: M.cfg, resolvedor: rel, conferencia: conf };
  }

  /* ================================================================ T1 / T7 / qualquer "fonte" com p0, p1, secao e up por peça */
  /** postos por prefixo do id (T1: pilar P, viga V, terça T, escora ES, travessa TR, pendural PD, verga VG; T7: pilarete, viga, barrote, longarina) */
  function rankFonte(id, g) {
    var k = String(g || id);
    if (/^(P\d|DS-P|DI-P|PIL|FX)/.test(id) || /^P/.test(k)) return 100;
    if (/^(V\d|VG|DS-V|DI-V|VIG)/.test(id)) return 90;
    if (/^(ES|RP)/.test(id)) return 70;
    if (/^(T\d|BL|TR)/.test(id)) return 60;
    if (/-B\d|BAR/.test(id)) return 50;
    return 40;
  }
  function pecasDeFonte(fonte, rankFn) {
    var out = [];
    (fonte || []).forEach(function (f) {
      if (!f.secao || !f.p0 || !f.p1 || V.dist(f.p0, f.p1) < 1e-4 || /^(LIG|FX)/.test(f.id)) return;
      var qtd = f.qtd || 1, def = { id: f.id, g: f.marca || f.id.replace(/[0-9_-].*$/, ""), p0: f.p0.slice(), p1: f.p1.slice(), up: f.up, rank: (rankFn || rankFonte)(f.id, f.marca), noCalc0: f.p0.slice(), noCalc1: f.p1.slice(), excent: 0 };
      if (f.secao.tipo === "circ") def.d = f.secao.d; else if (f.secao.tipo === "ret") { def.b = f.secao.b; def.h = f.secao.h; } else if (f.secao.tipo === "perfil" && f.secao.perfil && f.secao.perfil.length >= 3) { def.b = f.secao.b; def.h = f.secao.h; def.perfil = f.secao.perfil; } else return;
      var P = ME.criarPeca(def);
      if (def.perfil) {      /* viga de altura variável: o perfil (y, z) da viga em prisma de largura b em X (envoltória convexa do perfil) */
        var hull = convexo(def.perfil), x = f.p0[0], pol = hull.map(function (q) { return [q[1], q[0]]; });
        P.fixo = ME.prismaPoli([x - f.secao.b / 2, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], hull.map(function (q) { return [q[1], q[0]]; }).map(function (q) { return [q[0], q[1]]; }), 0, f.secao.b);
        P.fixo = ME.prismaPoli([x - f.secao.b / 2, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], hull, 0, f.secao.b);
      }
      out.push(P);
    });
    return out;
  }
  function convexo(pts) {
    var P = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), H = [], k;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    for (k = 0; k < P.length; k++) { while (H.length >= 2 && cr(H[H.length - 2], H[H.length - 1], P[k]) <= 0) H.pop(); H.push(P[k]); }
    var t = H.length + 1; for (k = P.length - 2; k >= 0; k--) { while (H.length >= t && cr(H[H.length - 2], H[H.length - 1], P[k]) <= 0) H.pop(); H.push(P[k]); }
    H.pop(); return H;
  }
  function resolverFonte(fonte, cfgExtra) {
    var pecas = pecasDeFonte(fonte, cfgExtra && cfgExtra.rankFn), cfg = { rank: function (P) { return P.rank; }, folga: function () { return 0; }, livre: function (P, e) { return (cfgExtra && cfgExtra.livre) ? cfgExtra.livre(P, e) : null; }, apoios: (cfgExtra && cfgExtra.apoios) || null };
    pecas.forEach(function (P) { ME.solidoDe(P); });
    var rel = ME.resolver(pecas, cfg), conf = ME.conferir(pecas, cfg, rel);
    return { pecas: pecas, cfg: cfg, resolvedor: rel, conferencia: conf };
  }

  /* ================================================================ FIXADORES: chapa interna + pinos (nós de tesoura), parafusos WT (terça) — como PEÇAS do modelo */
  var LIG_POR_PAR = { PD: "noPendural", MP: "noMP", DG: "noDiagonal", MG: "noMG", E: "espigaoCumeeira", MI: "pontaMI" };
  var COM_CHAPA = { T: 1, PD: 1, MP: 1, DG: 1, MG: 1, BS: 1, MS: 1, BI: 1, MI: 1, E: 1, DX: 1, DV: 1, DP: 1 };
  function numPinos(P, ligs) {
    var k = LIG_POR_PAR[P.g], l = k && ligs && ligs[k], pn = l && l.pinos;
    if (P.g === "DX" || P.g === "DV" || P.g === "DP") return { n: 2, d: 0.012, nc: 1 };
    if (P.g === "T") return { n: 4, d: 0.012, nc: 2 };            /* estribo/cantoneira na face lateral do banzo ou do espigão */
    if (pn && pn.n) return { n: Math.min(pn.n, 12), d: pn.d || 0.012, nc: pn.nc || (pn.n > 3 ? 2 : 1) };
    return { n: 4, d: 0.012, nc: 2 };
  }
  /** pinos e chapa de uma ponta cortada: posições no quadro da peça (s a partir da face da ponta, y na altura) e sólidos */
  function fixarPonta(P, e, pl, ligs) {
    var NP = numPinos(P, ligs), d = NP.d, nc = NP.nc > 1 && P.h > 0.12 ? 2 : 1, nr = Math.ceil(NP.n / nc), a1 = Math.max(7 * d, 0.06), lo = Math.max(5 * d, 0.05), pos = [], k, c;
    var den = V.dot(pl.n, P.ex), sFace = Math.abs(den) > 1e-6 ? (pl.d - V.dot(pl.n, P.p0)) / den : (e === 0 ? 0 : P.L), dir = e === 0 ? 1 : -1;
    var sFaceUso = e === 0 ? sFace : sFace;
    for (k = 0; k < nr; k++) for (c = 0; c < nc; c++) { if (pos.length >= NP.n) break; var y = nc === 1 ? 0 : (c === 0 ? -1 : 1) * Math.min(P.h / 4, 0.045); pos.push({ s: lo + k * a1, y: y, d: d }); }
    var Lp = lo + (nr - 1) * a1 + lo, ymax = pos.reduce(function (m, q) { return Math.max(m, Math.abs(q.y)); }, 0), hp = Math.min(P.h - 0.04, Math.max(0.08, 2 * ymax + 6 * d)), tp = 0.008;
    var base = V.add(P.p0, V.mul(P.ex, sFaceUso)), sol = [];
    pos.forEach(function (q) {
      var cpos = V.add(V.add(base, V.mul(P.ex, dir * q.s)), V.mul(P.ey, q.y)); q.mundo = cpos; sol.push(ME.cilindro(cpos, P.ez, d, (P.b || P.d || 0.1) + 0.02, 10));
    });
    var c0 = V.add(base, V.mul(P.ex, dir * 0.02)), pts0 = dir > 0 ? c0 : V.sub(c0, V.mul(P.ex, Lp));
    var plate = ME.prismaPoli(pts0, P.ex, P.ey, P.ez, [[-hp / 2, -tp / 2], [hp / 2, -tp / 2], [hp / 2, tp / 2], [-hp / 2, tp / 2]], 0, Lp);
    return { n: pos.length, d: d, nc: nc, pos: pos, plate: plate, pinosSol: sol, Lp: Lp, hp: hp, tp: tp, sFace: sFace, dir: dir };
  }
  function fixadoresT3(R, ligs) {
    var out = [], seq = 0;
    R.pecas.forEach(function (P) {
      if (P.aco) return;
      if (COM_CHAPA[P.g]) [0, 1].forEach(function (e) {
        var pl = P.fins[e].planos.filter(function (q) { return q.contra; })[0]; if (!pl) return;
        var F = fixarPonta(P, e, pl, ligs); P.fixa = (P.fixa || []).concat([{ ponta: e, contra: pl.contra, n: F.n, d: F.d, pos: F.pos.map(function (q) { return { s: q.s, y: q.y, d: q.d }; }), chapa: { Lp: F.Lp, hp: F.hp, tp: F.tp } }]);
        out.push({ id: "LIG-" + P.id + (e ? "b" : "a"), peca: P.id, ponta: e, contra: pl.contra, F: F });
      });
    });
    /* EMENDA PASSANTE da terça no banzo: chapa 8 mm em fenda que atravessa o banzo e liga os dois trechos da terça (eixo no eixo); 4 pinos Ø12 de cada lado. Verificada em MadT3Lig (ligação emendaTerca). */
    var nosT = {};
    R.pecas.forEach(function (P) {
      if (P.g !== "T") return;
      [[P.noCalc0, 1], [P.noCalc1, 0]].forEach(function (x) { var Q = x[0]; if (!Q) return; var k = Math.round(Q[0] * 1000) + "," + Math.round(Q[1] * 1000) + "," + Math.round(Q[2] * 1000); (nosT[k] = nosT[k] || []).push({ P: P, Q: Q }); });
    });
    Object.keys(nosT).forEach(function (k) {
      var g = nosT[k]; if (g.length < 2) return; var P = g[0].P, Q = g[0].Q, L = 0.56, hp = Math.max(0.08, P.h - 0.06), tp = 0.008, ex = P.ex, sol = [], j, sg;
      var plate = ME.prismaPoli(V.sub(Q, V.mul(ex, L / 2)), ex, P.ey, P.ez, [[-hp / 2, -tp / 2], [hp / 2, -tp / 2], [hp / 2, tp / 2], [-hp / 2, tp / 2]], 0, L);
      [-1, 1].forEach(function (sd) { for (j = 0; j < 4; j++) { var c = V.add(V.add(Q, V.mul(ex, sd * (0.09 + 0.045 * j))), V.mul(P.ey, (j % 2 ? 1 : -1) * 0.03)); sol.push(ME.cilindro(c, P.ez, 0.012, (P.b || 0.1) + 0.02, 10)); } });
      out.push({ id: "EMENDA-" + P.id.replace(/[a-z]$/, "") + "-" + (++seq), peca: P.id, ponta: null, contra: g[1].P.id, F: { n: 8, d: 0.012, pos: [], pinosSol: sol, plate: plate, Lp: L, hp: hp, tp: tp }, emenda: true });
    });
    return out;
  }
  /** chapa + pinos (ou os parafusos) de um nó como UMA peça de aço: a malha leva tudo; a receita do BIM leva o primeiro sólido (chapa ou parafuso) */
  function pecaDeFixador(f) {
    var sol = [].concat(f.F.plate ? [f.F.plate] : [], f.F.pinosSol), v = [], fa = [], b0, i, j;
    sol.forEach(function (S) { var m = ME.malhaDeSolido(S), c, q; b0 = v.length / 3; for (i = 0; i < m.v.length; i += 3) { c = [m.v[i], m.v[i + 1], m.v[i + 2]]; q = [c[0], c[2], -c[1]]; v.push(rd(q[0], 5), rd(q[1], 5), rd(q[2], 5)); } for (j = 0; j < m.f.length; j++) fa.push(m.f[j] + b0); });
    var vol = sol.reduce(function (s0, S) { return s0 + ME.volume(S); }, 0), S0 = sol[0], p0 = ME.vertices(S0)[0], p1 = ME.vertices(sol[sol.length - 1])[0];
    return { id: f.id, g: "LIG", marca: "LIG", grupo: "T3 — Ligações (chapa, pinos, parafusos)", descricao: f.emenda ? "Emenda passante da terça no banzo: chapa 8 mm em fenda + 8 pinos Ø12" : f.parafuso ? "Parafusos WT-T 8,2×300 da terça no banzo (2)" : "Chapa interna t = 8 mm e " + f.F.n + " pinos inox Ø" + Math.round(f.F.d * 1000) + " no nó " + f.peca + " × " + f.contra,
      material: "Aço inox AISI 316 (A4) — chapa e pinos", especificacao: f.parafuso ? "2 × WT-T 8,2×300" : "chapa 8 mm + " + f.F.n + " pinos Ø" + Math.round(f.F.d * 1000), secao: { tipo: "ret", b: 0.01, h: 0.01 }, p0: p0, p1: p1, up: [0, 0, 1], qtd: 1, comprimento_m: 0, volume_m3: vol, unidade: "peça",
      materialBim: "aço inox", malha: { v: v, f: fa }, receita: receitaPrisma(S0), fixador: true };
  }
  /** receita de extrusão simples de um prisma (chapa ou cilindro): contorno de uma face de ponta e altura */
  function receitaPrisma(S) {
    ME.prep(S); var best = S.f[0], k; for (k = 1; k < S.f.length; k++) if (S.f[k].a > best.a * 1.0000001 || (Math.abs(S.f[k].a - best.a) < 1e-12 && S.f[k].p.length > best.p.length)) best = S.f[k];
    var tops = S.f.filter(function (F) { return V.dot(F.n, best.n) < -0.999999; })[0], H = tops ? Math.abs(tops.d + best.d) : 0.01;
    var o = best.p[0], u = V.un(V.sub(best.p[1], best.p[0])), v = V.cruz(best.n, u), cn = function (q) { return [q[0], q[2], -q[1]]; };
    var uc = cn(u), vc = cn(v), oc = cn(o);
    return { forma: "extrusao", contorno: best.p.map(function (q) { var dq = V.sub(q, o); return [rd(V.dot(dq, u), 5), rd(V.dot(dq, v), 5)]; }), altura: rd(H, 5), plano: { o: [rd(oc[0], 5), rd(oc[1], 5), rd(oc[2], 5)], u: uc, v: vc } };
  }

  /* ================================================================ SAÍDAS (IFC, SketchUp, BIM, pranchas): uma peça por membro, com o SÓLIDO cortado */
  var MAT_MLC = "Madeira MLC GL24h (EN 14080)", MAT_ACO = "Aço ASTM A36 galvanizado a fogo (selas)";
  var NOMES_T3 = { P: "Pilar do perímetro", PO: "Pilar de cabeceira", FR: "Frechal", BS: "Banzo superior da tesoura", BI: "Banzo inferior da tesoura", PD: "Montante da tesoura", DG: "Diagonal da tesoura", MS: "Banzo superior da meia-tesoura", MI: "Banzo inferior da meia-tesoura", MP: "Montante da meia-tesoura", MG: "Diagonal da meia-tesoura", E: "Espigão", T: "Terça", CM: "Cumeeira", LB: "Linha longitudinal do banzo inferior", DX: "Diagonal de contraventamento das águas", DV: "Diagonal de contraventamento vertical", DP: "Diagonal de contraventamento da parede", SELA: "Sela de aço do espigão" };
  /** resolve (e guarda em res._enc) a T3 de um resultado do motor */
  function resolvidoT3(res) {
    if (res._enc) return res._enc;
    var G = { membros: res.t3.membros, info: res.t3.info }, sec = res.secoes;
    res._enc = resolverT3(G, sec, {}); return res._enc;
  }
  function pecaDeSaida(P, grupoPre) {
    var aco = !!P.aco, fe = ME.fichaPeca(P), med = fe.medidas || {};
    var o = { id: P.id, g: P.g, marca: P.g, grupo: grupoPre + " — " + (NOMES_T3[P.g] || P.g), descricao: NOMES_T3[P.g] || P.g, material: aco ? MAT_ACO : MAT_MLC,
      especificacao: (aco ? "bloco de aço sob o espigão, " : "MLC GL24h ") + rd(P.b * 100, 1) + "×" + rd(P.h * 100, 1) + " cm; corte " + fe.pontas[0].corte + " / " + fe.pontas[1].corte,
      secao: { tipo: "ret", b: P.b, h: P.h }, p0: P.p0, p1: P.p1, up: P.ey, qtd: 1, comprimento_m: med.bruto, volume_m3: ME.volumePeca(P), unidade: "peça", tes: P.tes, agua: P.agua,
      materialBim: aco ? "aço" : "madeira", malha: ME.malhaPeca(P), receita: ME.receitaPeca(P, P.g === "E" || P.g === "DV" || P.g === "DX"), ficha: fe, excent_m: P.excent || 0 };
    return o;
  }
  /** SEÇÃO LÍQUIDA no ponto de cada rebaixo: h_liq = h − profundidade (rebaixo que atravessa a largura) e η_liq = η_grupo·(h/h_liq)² (flexão e axial, conservador). Reprovou → o detalhe tem de mudar para apoio por chapa/estribo (sem rebaixo). */
  function verificarRebaixos(R, res) {
    var out = [], g = (res && res.grupos) || {}, cr = res && res.contrav && res.contrav.razao;
    R.pecas.forEach(function (P) {
      P.rebaixos.forEach(function (N) {
        var vs = ME.vertices(N), y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        vs.forEach(function (q) { var d = V.sub(q, P.p0), y = V.dot(d, P.ey), z = V.dot(d, P.ez); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
        var prof = y1 - y0, larg = z1 - z0, hb = P.h, bb = P.b || P.d, atravessa = larg >= 0.9 * bb, hliq = atravessa ? hb - prof : hb * Math.sqrt(Math.max(0.05, 1 - (prof * larg) / (hb * bb)));
        var gk = P.g === "DV" ? "DX" : P.g, eta0 = g[gk] && g[gk].eta != null ? g[gk].eta : (/^D[XVP]$/.test(P.g) && cr != null ? cr : 0.5), etaL = eta0 * Math.pow(hb / Math.max(hliq, 1e-3), 2);
        out.push({ peca: P.id, hospedeira: null, profundidade_cm: prof * 100, largura_cm: larg * 100, h_cm: hb * 100, perda_pct: (1 - hliq / hb) * 100, eta_grupo: eta0, eta_liquida: etaL, ok: etaL <= 1 + 1e-9 });
      });
    });
    /* A3 — a FENDA da chapa passante (emenda da terça) atravessa o banzo/meia-tesoura em cada nó de terça: b_liq = b − (t_chapa + 2 mm); η_liq = η·(b/b_liq) (axial e flexão em torno do eixo forte crescem com 1/b), somado ao rebaixo do apoio quando houver */
    var lg = res && res.ligacoesT3 && res.ligacoesT3.ligacoes, tCh = (lg && lg.emendaTerca && lg.emendaTerca.chapa && lg.emendaTerca.chapa.t_mm) || 8, fenda = (tCh + 2) / 1000;
    R.pecas.forEach(function (P) {
      if (P.g !== "BS" && P.g !== "MS") return;
      var eta0 = g[P.g] && g[P.g].eta != null ? g[P.g].eta : 0.5, rb = out.filter(function (x) { return x.peca === P.id; })[0], fRb = rb ? Math.pow(rb.h_cm / (rb.h_cm - rb.profundidade_cm), 2) : 1, fFd = P.b / (P.b - fenda), etaL = eta0 * fRb * fFd;
      out.push({ peca: P.id, tipo: "fenda da emenda da terça", fenda_mm: fenda * 1000, perda_b_pct: (1 - 1 / fFd) * 100, eta_grupo: eta0, eta_liquida: etaL, ok: etaL <= 1 + 1e-9, profundidade_cm: 0, largura_cm: fenda * 100, h_cm: P.h * 100, perda_pct: (1 - 1 / fFd) * 100 });
    });
    return out;
  }
  /** só as peças dos MEMBROS do modelo de cálculo (uma por membro), com o sólido cortado */
  function pecasT3(res) {
    if (!res || !res.t3) return [];
    return resolvidoT3(res).pecas.filter(function (P) { return !P.aco; }).map(function (P) { return pecaDeSaida(P, "T3"); });
  }
  /** o MODELO COMPLETO para IFC, SketchUp e BIM: membros + selas de aço + chapas, pinos e parafusos */
  function pecasModeloT3(res) {
    if (!res || !res.t3) return [];
    var R = resolvidoT3(res), ligs = res.ligacoesT3 && res.ligacoesT3.ligacoes, out = R.pecas.map(function (P) { return pecaDeSaida(P, "T3"); });
    if (!R.fix) R.fix = fixadoresT3(R, ligs);
    R.fix.forEach(function (f) { out.push(pecaDeFixador(f)); });
    return out;
  }

  var MadEncaixeTip = { verificarRebaixos: verificarRebaixos, pecasModeloT3: pecasModeloT3, fixadoresT3: fixadoresT3, pecaDeFixador: pecaDeFixador, resolverFonte: resolverFonte, pecasDeFonte: pecasDeFonte, pecasT3: pecasT3, resolvidoT3: resolvidoT3, NOMES_T3: NOMES_T3, MAT_MLC: MAT_MLC, montarT3: montarT3, resolverT3: resolverT3, RANK_T3: RANK_T3 };
  if (typeof module !== "undefined" && module.exports) module.exports = MadEncaixeTip; else global.MadEncaixeTip = MadEncaixeTip;
})(typeof window !== "undefined" ? window : this);

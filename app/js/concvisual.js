/* =====================================================================
 * concvisual.js — SIMULAÇÃO VISUAL do cálculo do concreto no 3D do BIM (fase C7, 16/11/2026). Motor PURO (ES5, sem DOM, Node-testável) + fiação fina.
 * docs/concreto/PLANO-CALCULO-CONCRETO.md, linha C7. Molde de estudo: js/metalcalcvista.js (deformada ampliada com fator automático, rampa de cor, rótulos seletivos).
 *
 *   ConcVisual.deformada(res, combId, { fator })        → barras com a posição original e a DEFORMADA ampliada, maior deslocamento, flecha vertical das vigas
 *   ConcVisual.diagramas(res, combId, "N"|"V"|"M", { escala }) → o diagrama de cada barra (desenhado do lado tracionado no M), máximos rotulados
 *   ConcVisual.utilizacao(res)                          → o aproveitamento de cada peça e a classe de cor (verde < 0,7 · amarelo 0,7–1 · vermelho > 1 ou reprovada)
 *   ConcVisual.flecha(res)                              → a flecha de cada laje (a do conclaje: imediata + diferida) e a razão ℓ/flecha, em classe de cor
 *   res = o resultado de ConcCalcular.rodar/iniciar (o `motor` NÃO enumerável traz o ConcAnalise: nós, barras, esforços e deslocamentos por combinação).
 *
 * O QUE VEM DE ONDE (nada é inventado):
 *  · deslocamentos nodais (3 translações + 3 rotações) e as estações de cada barra: `an.resultados[comb]` do AcoAnalise (o solver reaproveitado);
 *  · deformada ao longo da barra = HERMITE CÚBICO com os deslocamentos e as ROTAÇÕES dos nós (eixos locais da barra) + a solução particular da carga no vão, que o solver já
 *    traz nas estações (`ul`): o resíduo (estação − Hermite) é interpolado por Hermite com tangente nula nas pontas (a solução particular do bi-engastado nasce e morre com tangente 0).
 *    Sem a parcela da carga a flecha de uma viga biapoiada sob carga uniforme sai 20 % menor (qL⁴/96EI no lugar de 5qL⁴/384EI) — por isso o resíduo entra (testado);
 *  · a laje NÃO tem modelo de placa no motor: o conclaje devolve a flecha MÁXIMA (imediata `ai`, total `at`, limite e razão). A laje aparece inteira numa só cor, pela razão, com o
 *    valor rotulado; não se desenha campo de deslocamento nem isolinha que o motor não calculou;
 *  · o aproveitamento e a reprovação usam o MESMO predicado do memorial (`ConcMemorial.reprovada`): nada é "verde" por omissão.
 * ⚠ É cálculo de apoio: o engenheiro responsável confere e assina (ART). A deformada é ampliada (o fator vai escrito na tela).
 * Teste: node tools/test-conc-c7.js · e2e: node tools/e2e-conc-c7.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* sem o módulo */ } } return null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* as mesmas cores do Calcular (verde e vermelho de js/conccalcular.js) + amarelo e cinza; positivo/negativo dos diagramas */
  var COR = { verde: "#2e9e4f", amarelo: "#e6b800", vermelho: "#d23c3c", cinza: "#8a8f98", pos: "#1f5fa8", neg: "#d23c3c", fantasma: "#9aa3ad" };
  var LIM = { verde: 0.7, amarelo: 1 };                 /* regra do pedido (C7): verde < 0,7 · amarelo 0,7–1 · vermelho > 1 */
  var ALVO_DEFORMADA = 0.05;                            /* o maior deslocamento aparece com ~5 % do maior vão */
  var ALVO_DIAGRAMA = 0.12;                             /* o maior valor do diagrama ocupa ~12 % do maior vão */
  var LIM_BIAXIAL = 0.3;                                /* o outro plano de flexão acima de 30 % do principal: avisa */
  var NOME_ESF = { N: "Esforço normal N", V: "Cortante V", M: "Momento fletor M" };
  var UNID_ESF = { N: "kN", V: "kN", M: "kN·m" };

  /* ------------------------------------------------------------ vetores */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = len(a); return l > 0 ? mul(a, 1 / l) : a; }
  function paraLocal(lam, v) { return [dot(lam[0], v), dot(lam[1], v), dot(lam[2], v)]; }
  function paraGlobal(lam, v) { return [lam[0][0] * v[0] + lam[1][0] * v[1] + lam[2][0] * v[2], lam[0][1] * v[0] + lam[1][1] * v[1] + lam[2][1] * v[2], lam[0][2] * v[0] + lam[1][2] * v[1] + lam[2][2] * v[2]]; }

  /* ------------------------------------------------------------ o que o resultado do Calcular entrega */
  function preparar(res) {
    var an = res && res.motor && res.motor.an;
    if (!an || an.ok === false || !an.modelo || !an.resultados) return null;
    var m = an.modelo, nos = {}, barras = [], maiorVao = 0;
    arr(m.nos).forEach(function (n) { nos[n.id] = [n.x, n.y, n.z]; });
    arr(m.barras).forEach(function (b) {
      var P = nos[b.ni], Q = nos[b.nj]; if (!P || !Q) return;
      var d = sub(Q, P), L = len(d); if (!(L > 1e-9)) return;
      /* os mesmos eixos locais do AcoAnalise.preparar (vy da barra; sem vy válido: ele decide) */
      var ex = mul(d, 1 / L), vy = b.vy ? b.vy.slice() : null;
      if (!vy || len(cross(ex, unit(vy))) < 1e-3) vy = Math.abs(ex[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      var ey = unit(sub(vy, mul(ex, dot(vy, ex)))), ez = cross(ex, ey), pd = b.pecaDim || {}, pk = String(b.peca || b.id);
      var pp = (m.pecas && m.pecas.vigas && m.pecas.vigas[pk]) || (m.pecas && m.pecas.pilares && m.pecas.pilares[pk]) || {};
      barras.push({ id: String(b.id), peca: pk, tipo: b.tipo, marca: pd.marca || pp.marca || "", ni: b.ni, nj: b.nj, P: P, Q: Q, L: L, lam: [ex, ey, ez], b: num(pd.b, 0.15), h: num(pd.h, 0.3), bar: b });
    });
    var vig = m.pecas && m.pecas.vigas ? m.pecas.vigas : {};
    Object.keys(vig).forEach(function (k) { maiorVao = Math.max(maiorVao, num(vig[k].L, 0)); });
    if (!(maiorVao > 0)) barras.forEach(function (B) { maiorVao = Math.max(maiorVao, B.L); });
    return { an: an, m: m, nos: nos, barras: barras, maiorVao: maiorVao };
  }

  var ROT_COMB = { "ELU": "ELU", "ELS-QP": "ELS quase permanente", "ELS-F": "ELS frequente" };
  function combinacoes(res) {
    var P = preparar(res); if (!P) return [];
    return arr(P.an.combinacoes).filter(function (c) { return P.an.resultados[c.id]; }).map(function (c) {
      return { id: c.id, tipo: c.tipo, nome: c.nome, rotulo: (ROT_COMB[c.tipo] || c.tipo) + " — " + c.id + (c.nome ? " (" + c.nome + ")" : "") };
    });
  }
  /* a combinação de partida de cada simulação: deformada = ELS quase permanente (a da flecha de longa duração, a mais próxima da verificação do memorial); diagramas = a ELU que mais carrega o esforço escolhido */
  function combPadraoDeformada(res) {
    var L = combinacoes(res), f = L.filter(function (c) { return c.tipo === "ELS-F"; })[0], q = L.filter(function (c) { return c.tipo === "ELS-QP"; })[0];
    return (q || f || L[0] || {}).id || null;
  }
  function combPadraoDiagrama(res, esf) {
    var L = combinacoes(res).filter(function (c) { return c.tipo === "ELU"; }), melhor = null, mv = -1;
    L.forEach(function (c) { var d = diagramas(res, c.id, esf || "M", { semRotulos: true }); if (d.ok && d.maxAbs > mv + 1e-12) { mv = d.maxAbs; melhor = c.id; } });
    return melhor || (L[0] && L[0].id) || (combinacoes(res)[0] || {}).id || null;
  }

  /* ------------------------------------------------------------ DEFORMADA: Hermite cúbico com as rotações dos nós + a parcela da carga no vão */
  /* deslocamento LOCAL [ux, uy, uz] a x (m) da ponta i: da, db = [ux, uy, uz] locais dos nós; ta, tb = rotações [rx, ry, rz] locais (rz = dUy/dx, ry = −dUz/dx: o mesmo
   * arranjo do AcoAnalise). Axial linear; flexão pelas 4 funções de forma de Hermite. */
  function hermite(L, da, ta, db, tb, x) {
    var e1 = x / L, e2 = e1 * e1, e3 = e2 * e1;
    var H1 = 1 - 3 * e2 + 2 * e3, H2 = L * (e1 - 2 * e2 + e3), H3 = 3 * e2 - 2 * e3, H4 = L * (-e2 + e3);
    return [da[0] * (1 - e1) + db[0] * e1, H1 * da[1] + H2 * ta[2] + H3 * db[1] + H4 * tb[2], H1 * da[2] - H2 * ta[1] + H3 * db[2] - H4 * tb[1]];
  }
  /* solução particular do bi-engastado sob carga transversal UNIFORME (q local, kN/m; EI em kN·m²): w = q·x²(L−x)²/(24·EI). Vale quando não há estações do solver
   * (o caminho normal usa as estações, que já levam a carga real, trapezoidal ou parcial). */
  function particularUniforme(L, EIy, EIz, qy, qz, x) {
    var f = x * x * (L - x) * (L - x) / 24;
    return [0, EIz > 0 ? qy * f / EIz : 0, EIy > 0 ? qz * f / EIy : 0];
  }
  /* a curva LOCAL da barra em n pontos: [{ x, ul:[ux,uy,uz] }]. nodal = deslocamentos por nó ([ux,uy,uz,rx,ry,rz] globais); est = estações do solver (podem faltar). */
  function curvaLocal(B, nodal, est, n, opc) {
    var a = nodal && nodal[B.ni], b = nodal && nodal[B.nj]; if (!a || !b) return null;
    var lam = B.lam, L = B.L, da = paraLocal(lam, a.slice(0, 3)), db = paraLocal(lam, b.slice(0, 3)), ta = paraLocal(lam, a.slice(3, 6)), tb = paraLocal(lam, b.slice(3, 6));
    est = arr(est).slice().sort(function (p, q) { return p.x - q.x; });
    /* barra com rótula (libera): a rotação do NÓ não é a da ponta do elemento, o Hermite dos nós não vale — fica só a curva das estações do solver (que já trazem o deslocamento exato) */
    if (B.bar && B.bar.libera && est.length >= 3) return est.map(function (s) { return { x: s.x, ul: s.ul.slice() }; });
    var xs = [], rs = [];
    if (est.length >= 3) est.forEach(function (s) {
      if (xs.length && s.x - xs[xs.length - 1] < 1e-9) return;
      var h = hermite(L, da, ta, db, tb, s.x); xs.push(s.x); rs.push([s.ul[0] - h[0], s.ul[1] - h[1], s.ul[2] - h[2]]);
    });
    /* tangentes do resíduo (diferença central; 0 nas pontas: a solução particular do bi-engastado) e interpolação de Hermite entre estações */
    var ms = xs.map(function (x, k) {
      if (k === 0 || k === xs.length - 1) return [0, 0, 0];
      var d = xs[k + 1] - xs[k - 1]; return [0, 1, 2].map(function (c) { return (rs[k + 1][c] - rs[k - 1][c]) / d; });
    });
    function resid(x) {
      if (!xs.length) return [0, 0, 0];
      var k = 0; while (k < xs.length - 2 && x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], t = h > 0 ? (x - xs[k]) / h : 0, t2 = t * t, t3 = t2 * t, o = [0, 0, 0];
      for (var c = 0; c < 3; c++) o[c] = (2 * t3 - 3 * t2 + 1) * rs[k][c] + (t3 - 2 * t2 + t) * h * ms[k][c] + (-2 * t3 + 3 * t2) * rs[k + 1][c] + (t3 - t2) * h * ms[k + 1][c];
      return o;
    }
    var q = opc && opc.q ? opc.q : null, sec = B.bar && B.bar.sec ? B.bar.sec : {}, E = B.bar && B.bar.E ? B.bar.E : null, out = [];
    for (var i = 0; i < n; i++) {
      var x = L * i / (n - 1), h2 = hermite(L, da, ta, db, tb, x), r = resid(x), ul = [h2[0] + r[0], h2[1] + r[1], h2[2] + r[2]];
      if (!xs.length && q && E) { var pu = particularUniforme(L, E * num(sec.Iy, 0), E * num(sec.Iz, 0), q[0], q[1], x); ul = [ul[0] + pu[0], ul[1] + pu[1], ul[2] + pu[2]]; }
      out.push({ x: x, ul: ul });
    }
    return out;
  }
  function curvaBarra(B, nodal, est, n) {
    var cl = curvaLocal(B, nodal, est, n); if (!cl) return null;
    return cl.map(function (p) { return { x: p.x, p0: add(B.P, mul(B.lam[0], p.x)), u: paraGlobal(B.lam, p.ul) }; });
  }
  function arredondar125(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    /* 1 algarismo significativo (2 abaixo de 2): o fator escrito na tela é redondo e o maior deslocamento continua perto dos 5 % */
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / e, n = f < 2 ? Math.round(f * 5) / 5 : Math.round(f);
    return n * e;
  }
  function pontosPorBarra(B, rb) { var ne = rb && rb.estacoes ? rb.estacoes.length : 0; return ne >= 3 ? Math.max(9, Math.min(41, 2 * ne - 1)) : 17; }

  /* FLECHA DA VIGA POR PEÇA (tramo): as barras da mesma peça (a viga partida em nós intermediários e os trechos rígidos das pontas) formam UMA cadeia; a corda vai entre os dois apoios REAIS
   * (as pontas da cadeia) e a flecha é o maior afastamento vertical da curva a essa corda, ℓ = o vão entre os apoios. Uma barra isolada tem a corda dela. É a flecha ELÁSTICA IMEDIATA, seção bruta,
   * 1ª ordem — NÃO é a de verificação do memorial (Branson + fluência, 17.3.2): essa vem do `dv` (els.flecha) e vai ao lado. */
  function cadeiaDe(barras) {
    if (barras.length === 1) return [{ B: barras[0], rev: false }];
    var grau = {}, usadas = {}, pontas = [], cadeia = [], nulo = false;
    barras.forEach(function (B) { grau[B.ni] = (grau[B.ni] || 0) + 1; grau[B.nj] = (grau[B.nj] || 0) + 1; });
    Object.keys(grau).forEach(function (k) { if (grau[k] === 1) pontas.push(k); else if (grau[k] > 2) nulo = true; });
    if (nulo || pontas.length !== 2) return null;
    pontas.sort(); var cur = pontas[0];
    for (var i = 0; i < barras.length; i++) {
      var B = barras.filter(function (x) { return !usadas[x.id] && (String(x.ni) === String(cur) || String(x.nj) === String(cur)); })[0]; if (!B) return null;
      usadas[B.id] = 1; var rev = String(B.nj) === String(cur); cadeia.push({ B: B, rev: rev }); cur = rev ? B.ni : B.nj;
    }
    return cadeia;
  }
  function verificacaoDe(res, peca) {
    var dv = res && res.motor && res.motor.dv, v = null;
    arr(dv && dv.vigas).forEach(function (x) { if (String(x.id) === String(peca) || arr(x.tramos).some(function (t) { return String(t.id) === String(peca); })) v = x; });
    if (!v) return null;
    var melhor = null;
    arr(v.tramos).forEach(function (t) { var f = t.els && t.els.flecha; if (f && f.ok !== false && f.at > 0 && (!melhor || f.at > melhor.f.at)) melhor = { t: t, f: f }; });
    if (!melhor) return null;
    var vaoCm = num(melhor.t.entrada && melhor.t.entrada.L, 0), f = melhor.f;
    return { totalMm: f.at * 10, limiteMm: f.limite * 10, tipoLimite: f.tipoLimite || "", vaoCm: vaoCm, ellSobreFlecha: vaoCm > 0 ? vaoCm / f.at : null, ellSobreLimite: vaoCm > 0 ? vaoCm / f.limite : null, razao: f.razao };
  }
  function flechasPorPeca(P, curvas, res) {
    var grupos = {}, ordem = [], out = [];
    P.barras.forEach(function (B) { if ((B.tipo === "viga" || B.tipo === "rigido") && curvas[B.id]) { if (!grupos[B.peca]) { grupos[B.peca] = []; ordem.push(B.peca); } grupos[B.peca].push(B); } });
    ordem.forEach(function (peca) {
      var bs = grupos[peca]; if (!bs.some(function (B) { return B.tipo === "viga"; })) return;
      var cadeia = cadeiaDe(bs), listas;
      if (cadeia) listas = [cadeia]; else listas = bs.filter(function (B) { return B.tipo === "viga"; }).map(function (B) { return [{ B: B, rev: false }]; });
      listas.forEach(function (ch) {
        var pts = [];
        ch.forEach(function (c) { var cv = curvas[c.B.id].slice(); if (c.rev) cv.reverse(); cv.forEach(function (p, k) { if (pts.length && k === 0) return; pts.push(p); }); });
        if (pts.length < 2) return;
        var d = [0]; for (var i = 1; i < pts.length; i++) d.push(d[i - 1] + len(sub(pts[i].p0, pts[i - 1].p0)));
        var ell = len(sub(pts[pts.length - 1].p0, pts[0].p0)), u0 = pts[0].u[1], u1 = pts[pts.length - 1].u[1], pior = 0, kp = 0;
        pts.forEach(function (p, k) { var sx = d[d.length - 1] > 0 ? d[k] / d[d.length - 1] : 0, f = p.u[1] - (u0 + (u1 - u0) * sx); if (Math.abs(f) > Math.abs(pior)) { pior = f; kp = k; } });
        var vb = ch.filter(function (c) { return c.B.tipo === "viga"; })[0].B;
        out.push({ peca: peca, barra: vb.id, marca: vb.marca, flecha: pior, razao: Math.abs(pior) > 1e-12 ? ell / Math.abs(pior) : Infinity, L: ell, p0: pts[kp].p0, nBarras: ch.length, verif: verificacaoDe(res, peca) });
      });
    });
    out.sort(function (a, b) { return Math.abs(b.flecha) - Math.abs(a.flecha); });
    return out;
  }
  /* o rótulo da flecha da viga: o que ela É (elástica imediata, seção bruta, 1ª ordem) e, ao lado, a de verificação do memorial */
  function rotuloFlecha(f) {
    var l1 = (f.marca || "viga") + " · flecha elástica imediata, seção bruta, 1ª ordem: " + br(Math.abs(f.flecha) * 1000, 2) + " mm" + (isFinite(f.razao) ? " = ℓ/" + Math.round(f.razao) : ""),
        v = f.verif, l2 = v ? "verificação (memorial): " + br(v.totalMm, 2) + " mm" + (v.ellSobreFlecha ? " = ℓ/" + Math.round(v.ellSobreFlecha) : "") + " · limite " + (v.ellSobreLimite ? "ℓ/" + Math.round(v.ellSobreLimite) + " " : "") + "(" + br(v.limiteMm, 1) + " mm)" : "verificação (memorial): sem o valor desta viga",
        l3 = "não é a flecha de verificação — ver memorial";
    return { linha1: l1, linha2: l2, linha3: l3, texto: l1 + "\n" + l2 + "\n" + l3 };
  }
  /* o aviso permanente da simulação: os esforços e deslocamentos são do pórtico de 1ª ordem com a rigidez bruta; o dimensionamento dos pilares do memorial usa γz e a 2ª ordem local */
  function gammaZMax(res) {
    var g = 0; arr(res && res.gammaZ).concat(arr(res && res.motor && res.motor.an && res.motor.an.gammaZ)).forEach(function (x) { if (x && isFinite(x.gammaZ) && x.gammaZ > g) g = x.gammaZ; });
    return g || null;
  }
  var AVISO_ORDEM = "Esforços de 1ª ordem, rigidez bruta; pilares dimensionados com γz e 2ª ordem local (ver memorial)";
  function avisoOrdem(res) {
    var g = gammaZMax(res);
    return AVISO_ORDEM + (g && g > 1.1 ? ". γz = " + br(g, 3) + " (> 1,1: estrutura de nós móveis; os esforços do desenho NÃO levam o 0,95·γz)" : "") + ".";
  }

  function deformada(res, combId, opc) {
    opc = opc || {};
    var P = preparar(res); if (!P) return { ok: false, motivo: "Sem o resultado da análise (rode o Calcular estrutura)." };
    var cb = P.an.resultados[combId]; if (!cb) return { ok: false, motivo: "Combinação " + combId + " sem resultado." };
    var out = [], umax = 0, onde = null, curvas = {};
    P.barras.forEach(function (B) {
      var rb = cb.esforcos && cb.esforcos[B.id], cv = curvaBarra(B, cb.deslocamentos, rb && rb.estacoes, pontosPorBarra(B, rb));
      if (!cv) return;
      var mod = cv.map(function (p) { return len(p.u); });
      mod.forEach(function (v, k) { if (v > umax) { umax = v; onde = { barra: B.id, tipo: B.tipo, marca: B.marca, p0: cv[k].p0, u: cv[k].u }; } });
      curvas[B.id] = cv;
      out.push({ id: B.id, tipo: B.tipo, marca: B.marca, pontos: cv, mod: mod });
    });
    var fatorAuto = umax > 0 ? arredondar125(ALVO_DEFORMADA * P.maiorVao / umax) : 1, fator = num(opc.fator, 0) > 0 ? +opc.fator : fatorAuto;
    out.forEach(function (o) {
      o.orig = o.pontos.map(function (p) { return p.p0; });
      o.def = o.pontos.map(function (p) { return add(p.p0, mul(p.u, fator)); });
    });
    var flechas = flechasPorPeca(P, curvas, res);
    return { ok: true, comb: combId, nomeComb: (arr(P.an.combinacoes).filter(function (c) { return c.id === combId; })[0] || {}).nome || "", fator: fator, fatorAuto: fatorAuto, umax: umax, onde: onde, maiorVao: P.maiorVao, barras: out,
             flechas: flechas, razaoAlvo: umax > 0 ? umax * fator / P.maiorVao : 0 };
  }

  /* ------------------------------------------------------------ DIAGRAMAS N, V, M */
  /* Em cada barra o diagrama é o do PLANO PRINCIPAL: o plano (y ou z local) em que o momento é maior. N vai pelo eixo y. O momento é desenhado do lado TRACIONADO da barra
   * (convenção do detalhamento): Mz > 0 é positivo/sagrando (testado: carga uniforme na viga biapoiada dá +qL²/8) e a tração fica do lado −ey; no plano z a tração de My > 0 fica
   * do lado +ez. Cortante e normal são desenhados do lado do eixo local, com o sinal do valor. */
  function planoDe(est) {
    var mz = 0, my = 0; arr(est).forEach(function (s) { mz = Math.max(mz, Math.abs(s.Mz)); my = Math.max(my, Math.abs(s.My)); });
    return my > mz * (1 + 1e-9) ? "z" : "y";
  }
  function valorDe(s, esf, plano) {
    if (esf === "N") return s.N;
    if (esf === "V") return plano === "z" ? s.Vz : s.Vy;
    return plano === "z" ? s.My : s.Mz;
  }
  function diagramas(res, combId, esf, opc) {
    opc = opc || {}; esf = esf === "N" || esf === "V" ? esf : "M";
    var P = preparar(res); if (!P) return { ok: false, motivo: "Sem o resultado da análise (rode o Calcular estrutura)." };
    var cb = P.an.resultados[combId]; if (!cb) return { ok: false, motivo: "Combinação " + combId + " sem resultado." };
    var out = [], maxAbs = 0, maxGlobal = null;
    P.barras.forEach(function (B) {
      var rb = cb.esforcos && cb.esforcos[B.id], est = rb ? arr(rb.estacoes) : []; if (est.length < 2) return;
      var plano = esf === "N" ? "y" : planoDe(est), eixo = plano === "z" ? B.lam[2] : B.lam[1];
      /* FLEXÃO NOS DOIS PLANOS: o diagrama é do plano principal; se o outro plano chega a mais de 30 % dele, a barra é marcada (e o rótulo avisa que o outro plano NÃO está desenhado) */
      var mzM = 0, myM = 0; est.forEach(function (s) { mzM = Math.max(mzM, Math.abs(s.Mz)); myM = Math.max(myM, Math.abs(s.My)); });
      var prin = plano === "z" ? myM : mzM, secM = plano === "z" ? mzM : myM, biax = esf !== "N" && prin > 1e-9 && secM > LIM_BIAXIAL * prin ? { ratio: secM / prin, valorSec: secM, planoSec: plano === "z" ? "y" : "z" } : null;
      var sinal = esf === "M" ? (plano === "z" ? 1 : -1) : 1, val = est.map(function (s) { return valorDe(s, esf, plano); });
      var vmax = -Infinity, vmin = Infinity, kmax = 0, kmin = 0;
      val.forEach(function (v, k) { if (v > vmax) { vmax = v; kmax = k; } if (v < vmin) { vmin = v; kmin = k; } });
      var ab = Math.max(Math.abs(vmax), Math.abs(vmin)); if (ab > maxAbs) { maxAbs = ab; maxGlobal = { barra: B.id, marca: B.marca, v: Math.abs(vmax) >= Math.abs(vmin) ? vmax : vmin }; }
      out.push({ id: B.id, tipo: B.tipo, marca: B.marca, plano: plano, eixo: eixo, sinal: sinal, est: est, val: val, max: vmax, min: vmin, kmax: kmax, kmin: kmin, biaxial: biax, B: B });
    });
    if (!out.length) return { ok: false, motivo: "Nenhuma barra com esforços nesta combinação." };
    var escAuto = maxAbs > 0 ? ALVO_DIAGRAMA * P.maiorVao / maxAbs : 1, mult = num(opc.escala, 0) > 0 ? +opc.escala : 1, esc = escAuto * mult;
    out.forEach(function (o) {
      o.pts0 = o.est.map(function (s) { return add(o.B.P, mul(o.B.lam[0], s.x)); });
      o.pts = o.est.map(function (s, k) { return add(o.pts0[k], mul(o.eixo, o.sinal * o.val[k] * esc)); });
      delete o.B;
    });
    /* rótulos: o máximo global (sempre) + os extremos de cada barra acima de 35 % do máximo, até 14 no total (o resto fica no cartão) */
    var rot = [];
    if (!opc.semRotulos) {
      var cand = [];
      out.forEach(function (o) {
        var forte = o.biaxial ? (Math.abs(o.max) >= Math.abs(o.min) ? 0 : 1) : -1;
        [[o.max, o.kmax], [o.min, o.kmin]].forEach(function (c, i) {
          if (i === 1 && Math.abs(c[0] - o.max) < 1e-12) return;
          var global_ = maxGlobal && o.id === maxGlobal.barra && Math.abs(Math.abs(c[0]) - maxAbs) < 1e-12;
          /* a barra de flexão biaxial sempre leva o rótulo do seu extremo maior (mesmo abaixo de 35 % do máximo da obra) */
          if ((Math.abs(c[0]) >= 0.35 * maxAbs || forte === i) && Math.abs(c[0]) > 1e-9) cand.push({ v: c[0], pos: o.pts[c[1]], barra: o.id, marca: o.marca, biax: forte === i ? o.biaxial : null, chave: Math.abs(c[0]) + (global_ ? 1e12 : 0) + (forte === i ? 1e6 : 0) });
        });
      });
      cand.sort(function (a, b) { return b.chave - a.chave; });
      cand.slice(0, 14).forEach(function (c) {
        var suf = c.biax ? " · flexão nos 2 planos (plano " + c.biax.planoSec + ": " + br(c.biax.valorSec, 1) + " kN·m = " + Math.round(c.biax.ratio * 100) + " % do principal, não desenhado)" : "";
        rot.push({ pos: c.pos, valor: c.v, texto: br(c.v, Math.abs(c.v) < 10 ? 2 : 1) + " " + UNID_ESF[esf] + suf, cor: c.v >= 0 ? COR.pos : COR.neg, barra: c.barra, marca: c.marca, biaxial: !!c.biax });
      });
    }
    return { ok: true, comb: combId, esforco: esf, nome: NOME_ESF[esf], unidade: UNID_ESF[esf], escala: esc, escalaAuto: escAuto, mult: mult, maxAbs: maxAbs, maxGlobal: maxGlobal, maiorVao: P.maiorVao, barras: out, rotulos: rot,
             biaxiais: out.filter(function (o) { return o.biaxial; }).map(function (o) { return { id: o.id, marca: o.marca, plano: o.plano, ratio: o.biaxial.ratio, valorSec: o.biaxial.valorSec }; }) };
  }

  /* ------------------------------------------------------------ UTILIZAÇÃO (mapa de cores) */
  function classeDe(util, reprovada) {
    if (reprovada) return "vermelho";
    if (util == null || !isFinite(util)) return "cinza";
    if (util < LIM.verde) return "verde";
    if (util <= LIM.amarelo) return "amarelo";
    return "vermelho";
  }
  function predicado() { var M = dep("ConcMemorial", "./concmemorial.js"); return M && M.reprovada ? M.reprovada : null; }
  function utilizacao(res) {
    var P = preparar(res); if (!P) return { ok: false, motivo: "Sem o resultado da análise (rode o Calcular estrutura)." };
    var rep = predicado(); if (!rep) return { ok: false, motivo: "O predicado de reprovação do memorial (ConcMemorial) não carregou." };
    var mo = res.motor, vigaPor = {}, pilPor = {}, lajaPor = {}, itens = [], porPeca = {}, estadoPor = {};
    arr(res.pecas).forEach(function (p) { estadoPor[p.tipo + "|" + p.id] = p.estado; });
    arr(mo.dv && mo.dv.vigas).forEach(function (v) { vigaPor[String(v.id)] = v; arr(v.tramos).forEach(function (t) { vigaPor[String(t.id)] = v; }); });
    arr(mo.dp && mo.dp.pilares).forEach(function (q) { pilPor[String(q.id)] = q; });
    arr(mo.lajes).forEach(function (l) { if (l && l.res) lajaPor[String(l.res.id)] = l; });
    P.barras.forEach(function (B) {
      var r = B.tipo === "viga" ? vigaPor[B.peca] || vigaPor[B.id] : (B.tipo === "pilar" ? pilPor[B.peca] || pilPor[B.id] : null);
      var chave = B.tipo + "|" + B.peca, it = porPeca[chave];
      if (!it) {
        /* ⚠ o estado "sem-calculo" do Calcular (viga incompleta: ancoragem não conferida) com resultado no `dv` é REPROVADA pelo predicado do memorial: vermelho, nunca verde/cinza por omissão */
        var util = r && r.aproveitamento != null ? r.aproveitamento : null, reprov = r ? rep(r, B.tipo) : true;
        it = { id: B.peca, tipo: B.tipo, marca: (r && r.marca) || B.marca, aproveitamento: util, reprovada: reprov, semCalculo: !r, estadoCalculo: estadoPor[B.tipo + "|" + B.peca] || null, barras: [], secao: Math.round(B.b * 100) + "×" + Math.round(B.h * 100) + " cm" };
        it.classe = r ? classeDe(util, reprov) : "cinza"; it.cor = COR[it.classe];
        porPeca[chave] = it; itens.push(it);
      }
      it.barras.push({ id: B.id, P: B.P, Q: B.Q, L: B.L, lam: B.lam, b: B.b, h: B.h });
    });
    arr(P.m.lajes).forEach(function (l) {
      var lj = lajaPor[String(l.id)], r = lj && lj.res, semCalc = !r;
      var reprov = semCalc ? rep(null, "laje-sem-calculo") : rep(r, "laje"), util = r && r.aproveitamento != null ? r.aproveitamento : null;
      var it = { id: String(l.id), tipo: "laje", marca: l.marca || (r && r.marca) || "", aproveitamento: util, reprovada: reprov, semCalculo: semCalc, estadoCalculo: estadoPor["laje|" + l.id] || null, poli: arr(l.poli), topo: num(l.topo, 0), h: num(l.h, 0.1) };
      it.classe = semCalc ? "cinza" : classeDe(util, reprov); it.cor = COR[it.classe]; itens.push(it);
    });
    var cont = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 };
    itens.forEach(function (i) { cont[i.classe]++; });
    return { ok: true, itens: itens, contagem: cont };
  }

  /* ------------------------------------------------------------ FLECHA DAS LAJES */
  function centroide(poli) { var x = 0, z = 0; poli.forEach(function (p) { x += p.x; z += p.z; }); return { x: x / Math.max(1, poli.length), z: z / Math.max(1, poli.length) }; }
  var MAX_ROTULOS_LAJE = 20;                          /* uma laje por rótulo, as 20 piores: pavimento grande não vira uma nuvem de sprites */
  function flecha(res) {
    var P = preparar(res); if (!P) return { ok: false, motivo: "Sem o resultado da análise (rode o Calcular estrutura)." };
    var lajaPor = {}, itens = [];
    arr(res.motor.lajes).forEach(function (l) { if (l && l.res) lajaPor[String(l.res.id)] = l.res; });
    arr(P.m.lajes).forEach(function (l) {
      var r = lajaPor[String(l.id)], f = r && r.flecha, c = centroide(arr(l.poli)), it = { id: String(l.id), marca: l.marca || "", poli: arr(l.poli), topo: num(l.topo, 0), centro: { x: c.x, y: num(l.topo, 0), z: c.z } };
      if (!f || f.ok === false || !(f.at > 0)) { it.semCalculo = true; it.classe = "cinza"; it.cor = COR.cinza; it.motivo = r ? "o conclaje não fechou a flecha desta laje" : "laje sem cálculo no motor (treliçada, não retangular…)"; itens.push(it); return; }
      var lx = num(r.entrada && r.entrada.lx, 0), balanco = !!(r.entrada && r.entrada.balanco);
      it.flechaTotalMm = f.at * 10; it.flechaImediataMm = num(f.ai, 0) * 10; it.limiteMm = f.limite * 10; it.razao = f.razao; it.tipoLimite = f.tipoLimite || ""; it.balanco = balanco;
      /* laje em BALANÇO: o limite do conclaje vale para 2·Lc (o dobro do comprimento do balanço); o vão `lx` não é o ℓ do limite. Mostra só flecha × limite em mm — nunca um ℓ/N com o ℓ errado */
      it.vao = lx; it.ellSobreFlecha = !balanco && lx > 0 ? lx * 100 / f.at : null; it.ellSobreLimite = !balanco && lx > 0 ? lx * 100 / f.limite : null;
      it.classe = classeDe(f.razao, false); it.cor = COR[it.classe];
      it.texto = br(it.flechaTotalMm, 1) + " mm" + (balanco ? " · limite " + br(it.limiteMm, 1) + " mm (balanço)" : (it.ellSobreFlecha ? " · ℓ/" + Math.round(it.ellSobreFlecha) : ""));
      itens.push(it);
    });
    var pior = itens.filter(function (i) { return !i.semCalculo; }).sort(function (a, b) { return b.razao - a.razao; }).slice(0, MAX_ROTULOS_LAJE);
    itens.forEach(function (i) { i.rotular = pior.indexOf(i) >= 0 || i.semCalculo === true && itens.length <= MAX_ROTULOS_LAJE; });
    var cont = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 };
    itens.forEach(function (i) { cont[i.classe]++; });
    return { ok: true, itens: itens, contagem: cont, rotulados: itens.filter(function (i) { return i.rotular; }).length };
  }

  /* a TRAVA: a simulação só vale para o modelo que foi calculado. Sem a assinatura do cálculo (ou sem como conferir a de agora) RECUSA — nunca "presume que bate" */
  function conferirAssinatura(res, atual) {
    if (!res || !res.assinaturaModelo) return { ok: false, motivo: "O cálculo não traz a assinatura do modelo: rode o Calcular estrutura de novo antes de simular.", precisaCalcular: true };
    if (!atual) return { ok: false, motivo: "Não consegui conferir se o modelo mudou depois do Calcular: rode o Calcular estrutura de novo.", precisaCalcular: true };
    if (atual !== res.assinaturaModelo) return { ok: false, motivo: "O modelo mudou depois do último Calcular: recalcule antes de simular (a simulação seria de um cálculo antigo).", precisaCalcular: true, mudou: true };
    return { ok: true };
  }

  /* ===================================================================== FIAÇÃO (o 3D do BIM) — daqui para baixo precisa de DOM e do THREE do BIM */
  var EST = { modo: null, comb: { def: null, diag: null }, esf: "M", escala: { def: null, diag: 1 }, grupo: null, cena: null, painel: null, vigia: null, res: null, ultimo: null, opsSig: null };

  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) { /* sem barra de status */ } }
  function cena3d() { try { return global.BIM && global.BIM.cenaApresentacao ? global.BIM.cenaApresentacao() : null; } catch (e) { return null; } }
  function ultimoCalculo() { try { return global.ConcUI && global.ConcUI.ultimoCalculo ? global.ConcUI.ultimoCalculo() : null; } catch (e) { return null; } }
  function estadoAtual() { var E = global.BimEdit, B = global.BIM; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  /* a assinatura do modelo de AGORA, a mesma que o Calcular guardou (ConcCalcular.assinaturaDe) */
  function assinaturaAgora() { var K = global.ConcCalcular, st = estadoAtual(); try { return K && K.assinaturaDe && st ? K.assinaturaDe(st) : null; } catch (e) { return null; } }
  /* o vigia não refaz o modelo a cada ciclo (seria pesado): a impressão digital barata das operações do editor diz QUANDO vale conferir a assinatura de verdade */
  function opsSig() {
    var B = global.BIM; if (!B || !B.editarOps) return "-";
    try { var o = B.editarOps(), t = JSON.stringify(o), h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return o.length + ":" + t.length + ":" + (h >>> 0).toString(36); } catch (e) { return "?"; }
  }
  function hex(c) { return parseInt(String(c).replace("#", ""), 16); }
  function rgb(c) { var n = hex(c); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  /* acumuladores de malha: uma geometria só por tipo de coisa (pouca chamada de desenho) */
  function Acum() { return { pos: [], col: [], idx: [] }; }
  /* a simulação é uma CAMADA POR CIMA do modelo: a curva deformada e o diagrama ficam dentro/atrás das peças sólidas e o teste de profundidade os esconderia (print 16/11/2026) */
  function porCima(m, ordem) { m.renderOrder = ordem || 990; m.material.depthTest = false; m.material.depthWrite = false; return m; }
  function geom(T, A) {
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(A.pos, 3)); g.setAttribute("color", new T.Float32BufferAttribute(A.col, 3)); g.setIndex(A.idx);
    return g;
  }
  /* tubo de seção hexagonal ao longo de uma polilinha, cor por ponto */
  function tubo(A, pts, raio, cores) {
    var seg = 6, n = pts.length; if (n < 2) return;
    var base = A.pos.length / 3;
    for (var i = 0; i < n; i++) {
      var t = unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])), ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = unit(cross(t, ref)), v = cross(t, u);
      for (var k = 0; k < seg; k++) {
        var a = 2 * Math.PI * k / seg, o = add(mul(u, Math.cos(a) * raio), mul(v, Math.sin(a) * raio)), p = add(pts[i], o), c = cores[i];
        A.pos.push(p[0], p[1], p[2]); A.col.push(c[0], c[1], c[2]);
      }
    }
    for (var s = 0; s < n - 1; s++) for (var j = 0; j < seg; j++) {
      var a0 = base + s * seg + j, b0 = base + s * seg + (j + 1) % seg, c0 = base + (s + 1) * seg + j, d0 = base + (s + 1) * seg + (j + 1) % seg;
      A.idx.push(a0, c0, b0, b0, c0, d0);
    }
  }
  /* fita (faixa) entre duas polilinhas de mesmo tamanho; cor por quadrilátero */
  function fita(A, p1, p2, corPorSeg) {
    for (var i = 0; i < p1.length - 1; i++) {
      var base = A.pos.length / 3, c = corPorSeg[i];
      [p1[i], p1[i + 1], p2[i], p2[i + 1]].forEach(function (p) { A.pos.push(p[0], p[1], p[2]); A.col.push(c[0], c[1], c[2]); });
      A.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  /* caixa da seção da barra, 24 vértices (6 faces) com cor POR VÉRTICE e um escurecimento por face (sem luz, o sólido ainda se lê); tudo na mesma malha */
  var FACES = [[[1, 0, 0], 0.92], [[-1, 0, 0], 0.92], [[0, 1, 0], 1.0], [[0, -1, 0], 0.78], [[0, 0, 1], 0.86], [[0, 0, -1], 0.86]];
  function caixa(A, b, cor, folga) {
    var ex = b.lam[0], ey = b.lam[1], ez = b.lam[2], c0 = mul(add(b.P, b.Q), 0.5), he = [b.L / 2, b.h / 2 + folga, b.b / 2 + folga], eixos = [ex, ey, ez], col = rgb(cor);
    FACES.forEach(function (f) {
      var ax = f[0][0] ? 0 : (f[0][1] ? 1 : 2), sg = f[0][ax] || 0, o1 = (ax + 1) % 3, o2 = (ax + 2) % 3, base = A.pos.length / 3, centro = add(c0, mul(eixos[ax], sg * he[ax]));
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        var p = add(add(centro, mul(eixos[o1], q[0] * he[o1])), mul(eixos[o2], q[1] * he[o2]));
        A.pos.push(p[0], p[1], p[2]); A.col.push(col[0] * f[1], col[1] * f[1], col[2] * f[1]);
      });
      A.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  function poligono(T, A, it, cor, folga) {
    var pts = arr(it.poli).map(function (p) { return new T.Vector2(p.x, p.z); }); if (pts.length < 3) return;
    var tri = T.ShapeUtils.triangulateShape(pts, []), base = A.pos.length / 3, c = rgb(cor);
    pts.forEach(function (p) { A.pos.push(p.x, it.topo + folga, p.y); A.col.push(c[0], c[1], c[2]); });
    tri.forEach(function (f) { A.idx.push(base + f[0], base + f[1], base + f[2]); });
  }
  function rampaCor(t) {                      /* 0 = azul · 0,5 = amarelo · 1 = vermelho (o mapa de calor dos deslocamentos) */
    t = Math.max(0, Math.min(1, t));
    var a = t < 0.5 ? [0.12, 0.37, 0.66] : [0.9, 0.72, 0.0], b = t < 0.5 ? [0.9, 0.72, 0.0] : [0.82, 0.24, 0.24], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  /* rótulo em sprite; "\n" separa linhas (a flecha da viga leva 3) */
  function sprite(T, texto, cor) {
    if (typeof document === "undefined") return null;
    var linhas = String(texto).split("\n"), fonte = linhas.length > 1 ? 30 : 38, LH = Math.round(fonte * 1.3), cv = document.createElement("canvas"), c = cv.getContext("2d");
    c.font = "bold " + fonte + "px system-ui,sans-serif";
    var W = Math.min(1500, Math.max.apply(null, linhas.map(function (l) { return c.measureText(l).width; })) + 40), H = LH * linhas.length + 26;
    cv.width = W; cv.height = H; c = cv.getContext("2d"); c.font = "bold " + fonte + "px system-ui,sans-serif";
    c.fillStyle = "rgba(255,255,255,.94)"; c.strokeStyle = cor || "#16202a"; c.lineWidth = 3; c.beginPath(); c.rect(3, 3, W - 6, H - 6); c.fill(); c.stroke();
    c.fillStyle = "#16202a"; c.textAlign = "center"; c.textBaseline = "middle";
    linhas.forEach(function (l, i) { c.fillText(l, W / 2, 13 + LH * (i + 0.5) + 1); });
    var tex = new T.CanvasTexture(cv), mat = new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }), s = new T.Sprite(mat);
    s.scale.set(W / 155, H / 155, 1); s.renderOrder = 999; s.userData.rotuloConc = true;
    return s;
  }
  function addRotulo(T, g, pos, texto, cor) { var s = sprite(T, texto, cor); if (!s) return; s.position.set(pos[0], pos[1] + 0.25, pos[2]); g.add(s); }
  function liberar(obj) {
    obj.traverse(function (o) {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      var m = o.material; if (m) { (Array.isArray(m) ? m : [m]).forEach(function (x) { if (x.map && x.map.dispose) x.map.dispose(); if (x.dispose) x.dispose(); }); }
    });
  }

  function grupoDeformada(T, d) {
    var g = new T.Group(); g.name = "concvisual-deformada";
    var Ad = Acum(), fant = [];
    d.barras.forEach(function (o) {
      var umax = d.umax > 0 ? d.umax : 1;
      tubo(Ad, o.def, 0.045, o.mod.map(function (m) { return rampaCor(m / umax); }));
      for (var i = 0; i < o.orig.length - 1; i++) fant.push(o.orig[i][0], o.orig[i][1], o.orig[i][2], o.orig[i + 1][0], o.orig[i + 1][1], o.orig[i + 1][2]);
    });
    g.add(porCima(new T.Mesh(geom(T, Ad), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide })), 991));
    var lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(fant, 3));
    g.add(porCima(new T.LineSegments(lg, new T.LineBasicMaterial({ color: hex(COR.fantasma), transparent: true, opacity: 0.8 })), 990));
    if (d.onde) addRotulo(T, g, add(d.onde.p0, mul(d.onde.u, d.fator)), "máx. " + br(d.umax * 1000, 2) + " mm (real)", COR.vermelho);
    if (d.flechas[0] && Math.abs(d.flechas[0].flecha) > 1e-9) addRotulo(T, g, add(d.flechas[0].p0, [0, -0.5, 0]), rotuloFlecha(d.flechas[0]).texto, COR.pos);
    return g;
  }
  function grupoDiagramas(T, d) {
    var g = new T.Group(); g.name = "concvisual-diagramas";
    var Af = Acum(), Ao = Acum(), Ae = [];
    d.barras.forEach(function (o) {
      var cp = rgb(COR.pos), cn = rgb(COR.neg), corPt = o.val.map(function (v) { return v >= 0 ? cp : cn; });
      var corSeg = []; for (var i = 0; i < o.val.length - 1; i++) corSeg.push((o.val[i] + o.val[i + 1]) >= 0 ? cp : cn);
      fita(Af, o.pts0, o.pts, corSeg); tubo(Ao, o.pts, 0.02, corPt);
      for (var k = 0; k < o.pts0.length - 1; k++) Ae.push(o.pts0[k][0], o.pts0[k][1], o.pts0[k][2], o.pts0[k + 1][0], o.pts0[k + 1][1], o.pts0[k + 1][2]);
    });
    g.add(porCima(new T.Mesh(geom(T, Af), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: T.DoubleSide })), 990));
    g.add(porCima(new T.Mesh(geom(T, Ao), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide })), 991));
    var lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(Ae, 3));
    g.add(porCima(new T.LineSegments(lg, new T.LineBasicMaterial({ color: hex(COR.fantasma) })), 990));
    d.rotulos.forEach(function (r) { addRotulo(T, g, r.pos, r.texto, r.cor); });
    return g;
  }
  /* UTILIZAÇÃO: UMA malha para o modelo inteiro (cor por vértice) — dezenas de Mesh por peça pesavam em modelo grande */
  function grupoUtilizacao(T, u) {
    var g = new T.Group(), A = Acum(); g.name = "concvisual-utilizacao";
    u.itens.forEach(function (it) {
      if (it.tipo === "laje") { poligono(T, A, it, it.cor, 0.01); return; }
      it.barras.forEach(function (b) { caixa(A, b, it.cor, 0.012); });
    });
    g.add(new T.Mesh(geom(T, A), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: T.DoubleSide })));
    return g;
  }
  /* FLECHA DAS LAJES: uma malha com as lajes (cor por vértice) + no máximo 20 rótulos (as piores) */
  function grupoFlecha(T, f) {
    var g = new T.Group(), A = Acum(); g.name = "concvisual-flecha";
    f.itens.forEach(function (it) { poligono(T, A, it, it.cor, 0.01); });
    g.add(new T.Mesh(geom(T, A), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: T.DoubleSide })));
    f.itens.forEach(function (it) { if (it.rotular) addRotulo(T, g, [it.centro.x, it.centro.y + 0.05, it.centro.z], (it.marca ? it.marca + " · " : "") + (it.semCalculo ? "sem cálculo" : it.texto), it.cor); });
    return g;
  }
  function construir(T, modo, dados) { return modo === "deformada" ? grupoDeformada(T, dados) : (modo === "diagramas" ? grupoDiagramas(T, dados) : (modo === "utilizacao" ? grupoUtilizacao(T, dados) : grupoFlecha(T, dados))); }

  /* ---- o painel (comando, combinação, escala, legenda) */
  var CSS_PAINEL = "position:fixed;left:12px;bottom:12px;z-index:9000;width:318px;max-height:70vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#16202a);border:1px solid rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.28);font:12.5px/1.4 system-ui,sans-serif";
  function selo(cor, t) { return '<div><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + cor + ';margin-right:6px;vertical-align:-2px"></span>' + t + "</div>"; }
  function removerPainel() { var p = EST.painel; if (p && p.parentNode) p.parentNode.removeChild(p); EST.painel = null; }
  function painel() {
    if (typeof document === "undefined") return null;
    if (EST.painel && EST.painel.parentNode) return EST.painel;
    var p = document.createElement("div"); p.setAttribute("data-conc-visual", ""); p.setAttribute("style", CSS_PAINEL);
    p.addEventListener("change", function (e) { var t = e.target; if (!t || !t.getAttribute) return; if (t.hasAttribute("data-cv-comb")) { EST.comb[EST.modo === "deformada" ? "def" : "diag"] = t.value; redesenhar(); } else if (t.hasAttribute("data-cv-esf")) { EST.esf = t.value; EST.comb.diag = null; redesenhar(); } else if (t.hasAttribute("data-cv-escala")) { var v = parseFloat(String(t.value).replace(",", ".")); EST.escala[EST.modo === "deformada" ? "def" : "diag"] = v > 0 ? v : (EST.modo === "deformada" ? null : 1); redesenhar(); } });
    p.addEventListener("click", function (e) { var t = e.target; if (!t || !t.hasAttribute) return; if (t.hasAttribute("data-cv-limpar")) limpar(); else if (t.hasAttribute("data-cv-auto")) { EST.escala[EST.modo === "deformada" ? "def" : "diag"] = EST.modo === "deformada" ? null : 1; redesenhar(); } else if (t.hasAttribute("data-cv-calcular")) { if (global.ConcUI && global.ConcUI.calcular) global.ConcUI.calcular(); } });
    document.body.appendChild(p); EST.painel = p; return p;
  }
  function pintarPainel(titulo, corpo, msg) {
    var p = painel(); if (!p) return;
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b>' + esc(titulo) + '</b><button type="button" class="btn sm" data-cv-limpar>Limpar</button></div>' +
      (msg ? '<p style="margin:0 0 6px">' + msg + "</p>" : "") + (corpo || "") +
      '<p style="margin:6px 0 0;font-size:11px;opacity:.8">Cálculo de apoio — o engenheiro responsável confere e assina (ART). Simulação visual do C1–C4; não substitui o memorial.</p>';
  }
  function selectComb(res, atual, filtro) {
    var L = combinacoes(res).filter(filtro || function () { return true; });
    return '<label style="display:block;margin:4px 0">Combinação <select data-cv-comb style="width:100%">' + L.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === atual ? " selected" : "") + ">" + esc(c.rotulo) + "</option>"; }).join("") + "</select></label>";
  }
  function campoEscala(valor, rotulo) {
    return '<label style="display:block;margin:4px 0">' + rotulo + ' <input type="number" step="any" min="0" data-cv-escala value="' + esc(valor) + '" style="width:90px"> <button type="button" class="btn ghost sm" data-cv-auto>Automático</button></label>';
  }
  function rotuloComb(res, id) { var c = combinacoes(res).filter(function (x) { return x.id === id; })[0]; return c ? c.rotulo : String(id); }
  function aviso(res) { return '<p style="margin:6px 0;padding:5px 7px;border-left:3px solid #a35a00;background:rgba(163,90,0,.1);font-size:11.5px" data-cv-aviso-ordem>' + esc(avisoOrdem(res)) + "</p>"; }

  function validar() {
    var res = ultimoCalculo();
    if (!res || !res.motor || !res.motor.an) return { ok: false, motivo: "Rode o Calcular estrutura antes: a simulação usa o último cálculo (pórtico, vigas, lajes e pilares).", precisaCalcular: true };
    var c = conferirAssinatura(res, assinaturaAgora());
    return c.ok ? { ok: true, res: res } : c;
  }
  function tirarGrupo() {
    if (EST.grupo) { try { if (EST.grupo.parent) EST.grupo.parent.remove(EST.grupo); liberar(EST.grupo); } catch (e) { /* já saiu */ } EST.grupo = null; }
  }
  function pararVigia() { if (EST.vigia) { clearInterval(EST.vigia); EST.vigia = null; } }
  function avisarMudou(motivo) {
    var m = motivo || "O modelo mudou depois do último Calcular: a simulação foi retirada da cena (seria de um cálculo antigo). Rode o Calcular estrutura e simule de novo.";
    pintarPainel("Simulação retirada", '<p style="margin:6px 0"><button type="button" class="btn primary sm" data-cv-calcular>Calcular estrutura agora</button></p>', esc(m));
    status("Simulação: " + m);
  }
  function vigiar() {
    if (EST.vigia || typeof setInterval !== "function") return;
    EST.opsSig = opsSig();
    /* a cada ciclo (0,8 s): (1) sai da cena sozinha quando o 3D do BIM é fechado, escondido ou refeito; (2) confere a assinatura do modelo — quando as operações do editor mudam, compara com a do Calcular
       e, se mudou, RETIRA a simulação e avisa (ela mostraria um cálculo que não é mais o do modelo) */
    EST.vigia = setInterval(function () {
      var c = cena3d(), h = c && c.host, escondido = false;
      try { escondido = !!h && (!h.isConnected || !(h.offsetWidth || h.offsetHeight || (h.getClientRects && h.getClientRects().length))); } catch (e) { escondido = false; }
      if (!EST.grupo || !c || c.scene !== EST.cena || escondido) { limpar(true); return; }
      var sig = opsSig();
      if (sig !== EST.opsSig) {
        EST.opsSig = sig;
        var ok = conferirAssinatura(EST.res, assinaturaAgora());
        if (!ok.ok) { limpar(true); avisarMudou(ok.mudou ? null : ok.motivo); }
      }
    }, 800);
  }

  function redesenhar() { return EST.modo ? ativar(EST.modo, { manter: true }) : null; }

  function ativar(modo, opc) {
    var v = validar();
    if (!v.ok) {
      tirarGrupo(); pararVigia(); EST.modo = modo;
      pintarPainel("Simulação do cálculo", '<p style="margin:6px 0"><button type="button" class="btn primary sm" data-cv-calcular>Calcular estrutura agora</button></p>', esc(v.motivo));
      status("Simulação: " + v.motivo);
      return { ok: false, motivo: v.motivo };
    }
    var c = cena3d(); if (!c || !c.THREE || !c.scene) { status("O editor 3D não está aberto."); return { ok: false, motivo: "O editor 3D não está aberto." }; }
    var res = v.res, T = c.THREE, r = null, g = null, titulo = "", corpo = "", msg = "";
    EST.res = res; EST.modo = modo;
    if (modo === "deformada") {
      var cid = EST.comb.def || combPadraoDeformada(res), d = deformada(res, cid, { fator: EST.escala.def });
      if (!d.ok) { pintarPainel("Deformada", "", esc(d.motivo)); return d; }
      EST.comb.def = cid; g = grupoDeformada(T, d); r = d; titulo = "Deformada";
      corpo = selectComb(res, cid) + campoEscala(+d.fator.toPrecision(4), "Escala ×") +
        '<div style="margin-top:4px">' + selo(COR.pos, "azul = pouco deslocamento") + selo("#e6b800", "amarelo = médio") + selo(COR.vermelho, "vermelho = o máximo") + selo(COR.fantasma, "cinza = posição original") + "</div>" + aviso(res);
      var f0 = d.flechas[0], rf = f0 && Math.abs(f0.flecha) > 1e-9 ? rotuloFlecha(f0) : null;
      msg = "Combinação: <b>" + esc(rotuloComb(res, cid)) + "</b>. Deslocamentos ampliados <b>" + br(d.fator, d.fator < 10 ? 1 : 0) + " vezes</b> (automático: " + br(d.fatorAuto, d.fatorAuto < 10 ? 1 : 0) + "×; o maior deslocamento aparece com ~5 % do maior vão). Máximo real: <b>" + br(d.umax * 1000, 2) + " mm</b>." +
        (rf ? "<br>" + esc(rf.linha1) + ".<br><b>" + esc(rf.linha2) + "</b><br><i>" + esc(rf.linha3) + "</i>" : "");
    } else if (modo === "diagramas") {
      var cidD = EST.comb.diag || combPadraoDiagrama(res, EST.esf), dd = diagramas(res, cidD, EST.esf, { escala: EST.escala.diag });
      if (!dd.ok) { pintarPainel("Diagramas", "", esc(dd.motivo)); return dd; }
      EST.comb.diag = cidD; g = grupoDiagramas(T, dd); r = dd; titulo = "Diagramas — " + dd.nome;
      corpo = selectComb(res, cidD) + '<label style="display:block;margin:4px 0">Esforço <select data-cv-esf style="width:100%">' + ["N", "V", "M"].map(function (k) { return '<option value="' + k + '"' + (k === EST.esf ? " selected" : "") + ">" + esc(NOME_ESF[k]) + "</option>"; }).join("") + "</select></label>" +
        campoEscala(+dd.mult.toPrecision(3), "Escala (× o automático)") + '<div style="margin-top:4px">' + selo(COR.pos, "positivo") + selo(COR.neg, "negativo") + "</div>" + aviso(res);
      msg = "Combinação: <b>" + esc(rotuloComb(res, cidD)) + "</b>. Máximo: <b>" + br(dd.maxAbs, 2) + " " + dd.unidade + "</b> (" + esc((dd.maxGlobal && dd.maxGlobal.marca) || "") + "). " + (EST.esf === "M" ? "O momento é desenhado do lado tracionado. " : "") + "Plano principal de cada barra." +
        (dd.biaxiais.length ? " <b>" + dd.biaxiais.length + " barra(s) com flexão nos dois planos</b> (o outro plano passa de 30 % do principal e NÃO está desenhado): " + esc(dd.biaxiais.slice(0, 6).map(function (b) { return (b.marca || b.id) + " " + Math.round(b.ratio * 100) + " %"; }).join(", ")) + (dd.biaxiais.length > 6 ? "…" : "") + "." : "");
    } else if (modo === "utilizacao") {
      var u = utilizacao(res);
      if (!u.ok) { pintarPainel("Utilização", "", esc(u.motivo)); return u; }
      g = grupoUtilizacao(T, u); r = u; titulo = "Utilização das peças";
      corpo = '<div style="margin-top:4px">' + selo(COR.verde, "verde: menos de 0,7 (" + u.contagem.verde + ")") + selo(COR.amarelo, "amarelo: de 0,7 a 1 (" + u.contagem.amarelo + ")") + selo(COR.vermelho, "vermelho: acima de 1 ou reprovada/incompleta (" + u.contagem.vermelho + ")") +
        selo(COR.cinza, "cinza: sem cálculo no motor (" + u.contagem.cinza + ")") + "</div>";
      msg = "Aproveitamento = o do motor de cada peça (o maior dos estados-limite verificados). A reprovação usa o mesmo critério do memorial: viga com a ancoragem não conferida (incompleta) fica vermelha.";
    } else if (modo === "flecha") {
      var f = flecha(res);
      if (!f.ok) { pintarPainel("Flecha das lajes", "", esc(f.motivo)); return f; }
      g = grupoFlecha(T, f); r = f; titulo = "Flecha das lajes";
      corpo = '<div style="margin-top:4px">' + selo(COR.verde, "verde: flecha < 0,7 do limite (" + f.contagem.verde + ")") + selo(COR.amarelo, "amarelo: 0,7 a 1 do limite (" + f.contagem.amarelo + ")") + selo(COR.vermelho, "vermelho: acima do limite (" + f.contagem.vermelho + ")") + selo(COR.cinza, "cinza: sem cálculo (" + f.contagem.cinza + ")") + "</div>" +
        '<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:11.5px"><tr><th align="left">Laje</th><th align="right">Total</th><th align="right">ℓ/flecha</th><th align="right">Limite</th></tr>' +
        f.itens.map(function (i) { return "<tr><td>" + esc(i.marca) + "</td>" + (i.semCalculo ? '<td colspan="3">sem cálculo</td>' : '<td align="right">' + br(i.flechaTotalMm, 1) + " mm</td>" + (i.balanco ? '<td align="right">—</td><td align="right">' + br(i.limiteMm, 1) + " mm</td>" : '<td align="right">ℓ/' + Math.round(i.ellSobreFlecha) + '</td><td align="right">ℓ/' + Math.round(i.ellSobreLimite) + "</td>")) + "</tr>"; }).join("") + "</table>";
      msg = "Flecha total (imediata + diferida, NBR 6118 17.3.2) do conclaje; o motor não tem modelo de placa, então a laje inteira leva a cor pela razão flecha ÷ limite, com o valor rotulado (as " + MAX_ROTULOS_LAJE + " piores, se houver mais)." + (f.itens.some(function (i) { return i.balanco; }) ? " Laje em balanço: só flecha × limite em mm (o limite vale para 2·Lc)." : "");
    } else return { ok: false, motivo: "Modo desconhecido: " + modo };
    tirarGrupo();
    g.userData.concVisual = true; c.scene.add(g); EST.grupo = g; EST.cena = c.scene; EST.ultimo = r;
    pintarPainel(titulo, corpo, msg); vigiar();
    status("Simulação: " + titulo + " no 3D (Limpar volta à cena normal).");
    return { ok: true, modo: modo, dados: r };
  }

  function limpar(silencioso) {
    pararVigia(); tirarGrupo(); removerPainel(); EST.modo = null; EST.ultimo = null; EST.cena = null;
    if (!silencioso) status("Simulação limpa: a cena voltou ao normal.");
    return true;
  }
  function estado() { return { modo: EST.modo, ativo: !!EST.grupo, filhos: EST.grupo ? EST.grupo.children.length : 0, comb: EST.comb, esf: EST.esf, escala: EST.escala }; }
  function definir(o) {
    o = o || {};
    if (o.comb != null) EST.comb[EST.modo === "deformada" ? "def" : "diag"] = o.comb;
    if (o.esforco) { EST.esf = o.esforco; EST.comb.diag = o.comb || null; }
    if (o.escala !== undefined) EST.escala[EST.modo === "deformada" ? "def" : "diag"] = o.escala;
    return EST.modo ? redesenhar() : null;
  }

  /* os botões na fita da Estrutura (junto da Vista de Estrutura): chamado por ConcUI.registrar */
  function registrar(reg) {
    var R = global.BimRibbon; if (!R || !reg) return false;
    R.acrescentar("estrutura", "Estrutura", "Simulação do cálculo", [
      { id: "conc-sim-def", rotulo: "Deformada", icone: "ciclo", grande: true, dica: "Mostra no 3D a estrutura deformada (vigas e pilares), ampliada por um fator que você ajusta (automático: o maior deslocamento aparece com ~5 % do maior vão), na combinação que escolher (parte da ELS quase permanente; também ELS frequente e cada ELU). A posição original fica em cinza. A flecha rotulada é a elástica imediata, seção bruta, 1ª ordem — NÃO é a de verificação; ao lado vai a do memorial. " + AVISO_ORDEM + ". Precisa do Calcular." },
      { id: "conc-sim-diag", rotulo: "Diagramas", icone: "regua", grande: true, dica: "Diagramas de esforço normal, cortante e momento fletor sobre cada barra no 3D, com a cor pelo sinal e os valores máximos rotulados; você escolhe o esforço e a combinação. O momento é desenhado do lado tracionado; o pilar com flexão nos dois planos é avisado. " + AVISO_ORDEM + ". Precisa do Calcular." },
      { id: "conc-sim-util", rotulo: "Utilização", icone: "camadas", grande: true, dica: "Mapa de cores do aproveitamento de cada peça: verde abaixo de 0,7, amarelo de 0,7 a 1, vermelho acima de 1 ou reprovada/incompleta (o mesmo critério do memorial), com legenda. Precisa do Calcular." },
      { id: "conc-sim-laje", rotulo: "Flecha das\nlajes", icone: "grade", grande: true, dica: "Cada laje na cor da razão flecha ÷ limite (flecha total, imediata + diferida, calculada no conclaje), com o valor e a razão ℓ/flecha rotulados (laje em balanço: flecha × limite em mm). O motor não tem modelo de placa: não há campo de deslocamento, só a flecha máxima por laje. Precisa do Calcular." },
      { id: "conc-sim-limpar", rotulo: "Limpar\nsimulação", icone: "lixeira", grande: true, dica: "Tira da cena tudo o que a simulação desenhou e volta à vista normal." }
    ]);
    reg["conc-sim-def"] = function () { ativar("deformada"); return true; };
    reg["conc-sim-diag"] = function () { ativar("diagramas"); return true; };
    reg["conc-sim-util"] = function () { ativar("utilizacao"); return true; };
    reg["conc-sim-laje"] = function () { ativar("flecha"); return true; };
    reg["conc-sim-limpar"] = function () { limpar(); return true; };
    return true;
  }

  var ConcVisual = {
    COR: COR, LIM: LIM, NOME_ESF: NOME_ESF, UNID_ESF: UNID_ESF,
    preparar: preparar, combinacoes: combinacoes, combPadraoDeformada: combPadraoDeformada, combPadraoDiagrama: combPadraoDiagrama,
    hermite: hermite, particularUniforme: particularUniforme, curvaLocal: curvaLocal, curvaBarra: curvaBarra, arredondar125: arredondar125,
    deformada: deformada, diagramas: diagramas, utilizacao: utilizacao, flecha: flecha, classeDe: classeDe, rotuloFlecha: rotuloFlecha, avisoOrdem: avisoOrdem, gammaZMax: gammaZMax, AVISO_ORDEM: AVISO_ORDEM,
    conferirAssinatura: conferirAssinatura, construir: construir, cadeiaDe: cadeiaDe, LIM_BIAXIAL: LIM_BIAXIAL,
    ativar: ativar, limpar: limpar, estado: estado, definir: definir, registrar: registrar
  };
  global.ConcVisual = ConcVisual;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcVisual;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

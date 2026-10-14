/* =====================================================================
 * metalescadalinha.js — ESCADA PUXADA POR LINHA, com a ALTURA A VENCER, a
 * ABERTURA no piso de chegada e a FIXAÇÃO configurada nas pontas (motor
 * PURO, ES5, sem DOM, Node-testável). 14/10/2026 — frente S6.
 *
 * Pedido do Rogério (14/10/2026): "a escada: criar puxando a LINHA do ponto
 * onde ela começa até o outro. Quero vencer 4 m de altura: enquanto eu não
 * puxar a linha até vencer isso, ela mostra que NÃO CHEGOU, porque tem que
 * obedecer piso e espelho. Talvez puxar da parte de CIMA e ir descendo. Ou,
 * se eu puxar de BAIXO e houver um elemento em cima (laje ou piso
 * industrial), ele faz o CORTE nesse piso onde vai ser a entrada. Ela já vem
 * CONFIGURADA com os parafusos, as conexões, o chumbamento no chão, a base:
 * SOLDADA, ANCORADA, PARAFUSADA ou APOIADA; se for apoiada, cria os PÉS DE
 * APOIO na ponta de acordo com o que passa nos cálculos."
 *
 *   ajustar(o)        a escada que cabe no COMPRIMENTO da linha para a altura
 *                     H pela norma (NR-12 por padrão): o comprimento MÍNIMO
 *                     (degrau mais íngreme que a norma aceita), o MÁXIMO
 *                     confortável (Blondel no teto da faixa), "faltam X m"
 *                     enquanto não alcança; ao alcançar, o piso do degrau
 *                     estica para encher a linha (múltiplo de 5 mm), com os
 *                     patamares de descanso que a norma pede (NR-12: a cada
 *                     3,00 m de altura). A conta do degrau é a do
 *                     js/acoacessos.js (REGRA_DEG) e a dos lances/patamares é
 *                     a do gerador (js/metalprontas.js) — a prévia e a peça
 *                     criada são a mesma escada.
 *   linha(o)          dois pontos em planta + o sentido ("desce": o 1º clique
 *                     é o TOPO; "sobe": o 1º é o PÉ) → o par da escada pronta.
 *   elementos(caixas) lajes do modelador, pisos de aço (chapas horizontais das
 *                     peças prontas) e vigas de aço do modelo, em planta.
 *   alturas(o)        a cota do pé e do topo: digitada, ou lida do modelo (o
 *                     elemento em cima/embaixo; senão o nível da obra).
 *   abertura(o)       o FURO no piso/laje de chegada: a projeção da escada do
 *                     topo até onde a altura livre (2,30 m, ISO 14122-3 —
 *                     conferir) passa por baixo da laje, mais a folga; furo
 *                     inteiro dentro da laje ou RECORTE da borda (contorno
 *                     novo); o guarda-corpo nos lados que não são a entrada.
 *   reacoes(o)        as reações de cada longarina nas pontas (NBR 6120:2019,
 *                     Tabela 10 — escadas; γ da NBR 8800, Tabela 1).
 *   fixacao(it)       DIMENSIONA a fixação de uma ponta: ANCORADA (placa de
 *                     base + chumbadores no concreto — js/acoligcalc.js
 *                     placaBase e, com o concreto conhecido, js/acoligfundacao
 *                     .js), PARAFUSADA (chapa + parafusos na viga/piso de aço),
 *                     SOLDADA (filete no aço onde toca), APOIADA (apoio
 *                     simples; no topo, PÉS DE APOIO — pilaretes escolhidos
 *                     pela compressão, com placa de base ancorada e X entre
 *                     eles). Cada uma com os passos do memorial.
 *   fixacaoAuto(o)    a fixação padrão pelo que está embaixo/em cima: concreto
 *                     → ancorada; aço → parafusada; nada no topo → apoiada.
 *
 * ⚠ PREMISSAS (no memorial): reações pela ENVOLTÓRIA das duas hipóteses de
 *   apoio da longarina (pé fixo ou topo fixo, a outra ponta móvel na
 *   perpendicular) — numa ponta APOIADA (móvel na vertical) V = W/2 e H = 0,
 *   e a força horizontal vai toda para a outra ponta, que tem de ser fixa;
 *   força do guarda-corpo (NBR 6120, Tabela 12) somada à horizontal sem ψ0
 *   (a favor). Chumbador em concreto sem espessura conhecida = verificação
 *   crítica NÃO feita (INCOMPLETO) — nunca "aprovado".
 * Teste: node tools/test-metal-escada-linha.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AC() { return dep("AcoAcessos", "./acoacessos.js"); }
  function LC() { return dep("AcoLigCalc", "./acoligcalc.js"); }
  function LF() { return dep("AcoLigFundacao", "./acoligfundacao.js"); }
  function D88() { return dep("AcoDim8800", "./acodim8800.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function br(v, c) { if (!fin(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace("-", "−").replace(".", ","); }
  function cm(v) { return br(v * 100, 1) + " cm"; }
  function m2(v) { return br(v, 2) + " m"; }
  var GRAU = Math.PI / 180;
  var NORMA_PADRAO = "nr12";

  /* ================================================================ 1. O DEGRAU NO COMPRIMENTO DA LINHA */
  /* o limite de altura por lance e o patamar: os MESMOS do gerador (js/metalprontas.js, forma "patamares") */
  function hMaxDe(norma, lanceMax) { return num(lanceMax, 0) > 0 ? num(lanceMax, 0) : (norma === "nbr9050" ? 3.20 : (norma === "emergencia" ? 3.70 : 3.00)); }
  function lpDe(norma, W, patamarComp) { return num(patamarComp, 0) > 0 ? num(patamarComp, 0) : Math.max(num(W, 0.8), norma === "nbr9050" ? 1.20 : (norma === "emergencia" ? 1.10 : 0.80)); }
  function nLancesDe(n, e, H, hMax) { var nL = Math.max(1, Math.ceil(H / hMax - 1e-9)); while (nL < n && Math.ceil(n / nL) * e > hMax + 1e-9) nL++; return nL; }
  /* os candidatos (n espelhos) da norma para a altura H: a faixa do piso p [lo, hi] (múltiplos de 5 mm, para dentro),
     o TETO confortável (Blondel no máximo da faixa da norma) e os lances com patamar */
  function candidatos(H, norma, W, op) {
    op = op || {};
    var A = AC(); if (!A || !A.REGRA_DEG) return [];
    var R = A.REGRA_DEG[norma] || A.REGRA_DEG.nr12, hMax = hMaxDe(norma, op.lanceMax), Lp = lpDe(norma, W, op.patamarComp), out = [];
    var nMin = Math.max(2, Math.ceil(H / R.eMax - 1e-9)), nMax = Math.max(nMin, Math.floor(H / R.eMin + 1e-9));
    for (var n = nMin; n <= nMax; n++) {
      var e = H / n; if (e > R.eMax + 1e-9 || e < R.eMin - 1e-9) continue;
      var lo = R.pMin, hi = R.pMax;
      if (R.angMax) lo = Math.max(lo, e / Math.tan(R.angMax * GRAU));
      if (R.anguloMin) hi = Math.min(hi, e / Math.tan(R.anguloMin * GRAU));
      if (R.blondelObrig) { lo = Math.max(lo, R.fMin - 2 * e); hi = Math.min(hi, R.fMax - 2 * e); }
      lo = Math.ceil(lo * 200 - 1e-6) / 200; hi = Math.floor(hi * 200 + 1e-6) / 200;
      if (lo > hi + 1e-9) continue;
      var teto = Math.floor(Math.min(hi, R.fMax - 2 * e) * 200 + 1e-6) / 200; if (teto < lo - 1e-9) teto = lo;   /* sem Blondel alcançável: não estica */
      var nL = nLancesDe(n, e, H, hMax), nBase = Math.floor(n / nL);
      if (nBase < 2) continue;
      out.push({ n: n, e: e, lo: lo, hi: hi, teto: teto, nL: nL, Lp: Lp, nBase: nBase, resto: n % nL, R: R,
        proj: function (p) { return (this.n - this.nL) * p + (this.nL - 1) * this.Lp; } });
    }
    return out;
  }
  function pena(c, p) { var R = c.R, f = p + 2 * c.e, blOk = f >= R.fMin - 1e-9 && f <= R.fMax + 1e-9; return (blOk ? 0 : 10) + (R.ePref && c.e > R.ePref + 1e-9 ? 5 : 0) + Math.abs(f - R.alvo) + c.n * 1e-4; }
  /* o = { H, norma, L (comprimento da linha em planta, m), largura, lanceMax, patamarComp } */
  function ajustar(o) {
    o = o || {};
    var H = num(o.H, 0), norma = o.norma || NORMA_PADRAO, W = num(o.largura, 0.8), L = Math.max(0, num(o.L, 0));
    if (!(H > 0.1)) return { ok: false, motivo: "Informe a altura a vencer (m) ou desenhe o piso/laje de chegada." };
    if (H > 12) return { ok: false, motivo: "Altura a vencer acima de 12 m: divida em escadas com plataformas." };
    var cs = candidatos(H, norma, W, o);
    if (!cs.length) { var dg = AC() ? AC().degraus(H, norma) : null; return { ok: false, motivo: dg && !dg.ok ? dg.motivo : "Não há degrau igual pela norma para " + br(H, 2) + " m — ajuste a altura." }; }
    var Lmin = Infinity, cMin = null, Lmax = 0, cMax = null;
    cs.forEach(function (c) { var a = c.proj(c.lo), b = c.proj(c.teto); if (a < Lmin - 1e-9 || (Math.abs(a - Lmin) < 1e-9 && pena(c, c.lo) < pena(cMin, cMin.lo))) { Lmin = a; cMin = c; } if (b > Lmax) { Lmax = b; cMax = c; } });
    var esc = null, pEsc = null, alc = L >= Lmin - 0.005;
    if (!alc) { esc = cMin; pEsc = cMin.lo; }
    else {
      var melhor = null;
      cs.forEach(function (c) {
        if (c.proj(c.lo) > L + 0.005) return;
        var pf = c.n > c.nL ? Math.floor((L - (c.nL - 1) * c.Lp) / (c.n - c.nL) * 200 + 1e-6) / 200 : c.teto;
        var p = Math.max(c.lo, Math.min(c.teto, pf)), sobra = L - c.proj(p), pn = pena(c, p) + 3 * Math.max(0, sobra);
        if (!melhor || pn < melhor.pn - 1e-9) melhor = { c: c, p: p, pn: pn };
      });
      esc = melhor ? melhor.c : cMin; pEsc = melhor ? melhor.p : cMin.lo;
    }
    var proj = esc.proj(pEsc), lances = [];
    for (var i = 0; i < esc.nL; i++) lances.push(esc.nBase + (i < esc.resto ? 1 : 0));
    var f = pEsc + 2 * esc.e, ang = Math.atan(esc.e / pEsc) / GRAU, falta = alc ? 0 : Lmin - L, longa = alc && L > Lmax + 0.005;
    var hLance = Math.max.apply(null, lances) * esc.e;
    var txt = alc
      ? "Escada " + (esc.nL > 1 ? "com " + (esc.nL - 1) + " patamar(es) de descanso" : "reta") + ": " + esc.n + " espelhos de " + cm(esc.e) + ", piso " + cm(pEsc) + " (2e + p = " + cm(f) + "), " + br(ang, 1) + "°; ocupa " + m2(proj) + " da linha" + (longa ? " — o máximo confortável pela norma é " + m2(Lmax) + ": o resto da linha fica livre" : (L - proj > 0.01 ? " (sobram " + cm(L - proj) + ")" : ""))
      : "NÃO CHEGOU a " + m2(H) + ": faltam " + m2(falta) + " de linha (mínimo " + m2(Lmin) + " pela norma: espelho até " + cm(esc.R.eMax) + ", piso ≥ " + cm(cMin.lo) + (esc.nL > 1 ? ", " + (esc.nL - 1) + " patamar(es) de " + m2(esc.Lp) : "") + ")";
    return { ok: true, alcancou: alc, H: r4(H), norma: norma, L: r4(L), Lmin: r4(Lmin), Lmax: r4(Lmax), falta: r4(falta), sobra: r4(Math.max(0, L - proj)), longa: longa,
      n: esc.n, e: esc.e, p: pEsc, blondel: r4(f), angulo: r4(ang), nLances: esc.nL, lances: lances, Lp: esc.Lp, projecao: r4(proj), hLanceMax: r4(hLance), patamares: esc.nL - 1,
      ref: esc.R.ref, conferir: !!esc.R.conferir, cor: alc ? "ok" : "falta", texto: txt };
  }

  /* a projeção em planta da escada pronta (reta / com patamares) pelo par — onde fica o topo */
  function projecaoDe(par) {
    var A = AC(), H = num(par && par.desnivel, 3), norma = (par && par.norma) || NORMA_PADRAO; if (!A) return null;
    var dg = A.degraus(H, norma, num(par.nDegrau, 0) > 0 ? { n: par.nDegrau, p: par.pDegrau } : {}); if (!dg.ok) return null;
    var nL = par.forma === "patamares" ? nLancesDe(dg.n, dg.e, H, hMaxDe(norma, par.lanceMax)) : 1, Lp = lpDe(norma, num(par.largura, 0.8), par.patamarComp);
    return { proj: (dg.n - nL) * dg.p + (nL - 1) * Lp, n: dg.n, e: dg.e, p: dg.p, nL: nL };
  }
  function topoDe(par) {
    var pj = projecaoDe(par); if (!pj) return null;
    var th = num(par.giro, 0) * GRAU, c = [Math.cos(th), -Math.sin(th)];
    return { pe: [num(par.x0, 0), num(par.y0, 0), num(par.z0, 0)], topo: [num(par.x0, 0) + c[0] * pj.proj, num(par.y0, 0) + num(par.desnivel, 0), num(par.z0, 0) + c[1] * pj.proj], dir: c, proj: pj.proj };
  }

  /* ================================================================ 2. A LINHA → O PAR DA ESCADA PRONTA
   * convenção do editor: X local → (cos θ, 0, −sen θ); a escada sobe ao longo de +u, origem no pé (meio da largura) */
  function giroDe(cx, cz) { var g = Math.atan2(-cz, cx) / GRAU; return r4(((g % 360) + 360) % 360); }
  /* o = { P1: [x,y,z], P2: [x,y,z], sentido: "desce"|"sobe", yPe, yTopo (cotas), norma, largura, lanceMax, patamarComp, par (base) } */
  function linha(o) {
    o = o || {};
    var P1 = o.P1, P2 = o.P2; if (!P1 || !P2) return { ok: false, motivo: "Faltam os dois pontos da linha." };
    var dx = P2[0] - P1[0], dz = P2[2] - P1[2], L = Math.sqrt(dx * dx + dz * dz);
    var yPe = num(o.yPe, NaN), yTopo = num(o.yTopo, NaN), H = yTopo - yPe;
    var aj = ajustar({ H: H, norma: o.norma, L: L, largura: o.largura, lanceMax: o.lanceMax, patamarComp: o.patamarComp });
    if (!aj.ok) return { ok: false, motivo: aj.motivo, L: L };
    if (!(L > 0.05)) return { ok: true, alcancou: false, ajuste: aj, L: L, texto: aj.texto };
    var ux = dx / L, uz = dz / L, desce = o.sentido === "desce", c = desce ? [-ux, -uz] : [ux, uz];
    var pe = desce ? [P1[0] + ux * aj.projecao, yPe, P1[2] + uz * aj.projecao] : [P1[0], yPe, P1[2]];
    var topo = [pe[0] + c[0] * aj.projecao, yTopo, pe[2] + c[1] * aj.projecao];
    var par = clone(o.par || {});
    par.norma = aj.norma; par.forma = "patamares"; par.desnivel = aj.H; if (o.largura) par.largura = num(o.largura, par.largura);
    par.nDegrau = aj.n; par.pDegrau = aj.p; par.x0 = r4(pe[0]); par.y0 = r4(pe[1]); par.z0 = r4(pe[2]); par.giro = giroDe(c[0], c[1]);
    if (o.lanceMax) par.lanceMax = o.lanceMax; if (o.patamarComp) par.patamarComp = o.patamarComp;
    return { ok: true, alcancou: aj.alcancou, ajuste: aj, L: r4(L), pe: pe, topo: topo, sobe: c, giro: par.giro, par: par, texto: aj.texto };
  }

  /* ================================================================ 3. O QUE HÁ NO MODELO (em planta)
   * lajes do modelador (concreto), pisos de aço (chapas horizontais de peças prontas: piso, plataforma, mezanino,
   * patamar) e vigas de aço horizontais — { id, tipo, material, topo, esp, poly [[x,z]], prontaId, caixa } */
  function areaPol(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function dentro(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  function distSeg(p, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0; return Math.sqrt(Math.pow(p[0] - a[0] - t * dx, 2) + Math.pow(p[1] - a[1] - t * dz, 2)); }
  function distBorda(P, p) { var d = Infinity; for (var i = 0; i < P.length; i++) d = Math.min(d, distSeg(p, P[i], P[(i + 1) % P.length])); return d; }
  function perto(P, x, z, tol) { return dentro(P, x, z) || distBorda(P, [x, z]) <= num(tol, 0); }
  /* a planta (mundo) de uma peça pronta de piso: o retângulo Lx × Lz girado ou o contorno livre (piso industrial) */
  function plantaPronta(tipo, par) {
    var x0 = num(par.x0, 0), z0 = num(par.z0, 0), th = num(par.giro, 0) * GRAU, c = Math.cos(th), s = Math.sin(th), loc = [];
    if (tipo === "piso" && String(par.contorno || "").trim()) String(par.contorno).split(";").forEach(function (t) { var v = String(t).trim().split(/\s+/); if (v.length >= 2) { var a = num(v[0], NaN), b = num(v[1], NaN); if (fin(a) && fin(b)) loc.push([a, b]); } });
    if (loc.length < 3) { var Lx = num(par.Lx, 0), Lz = num(par.Lz, 0); if (!(Lx > 0 && Lz > 0)) return null; loc = [[0, 0], [Lx, 0], [Lx, Lz], [0, Lz]]; }
    return loc.map(function (q) { return [r4(x0 + q[0] * c + q[1] * s), r4(z0 - q[0] * s + q[1] * c)]; });
  }
  function elementos(caixas) {
    var out = [], B = BM(), porPronta = {}, MPr = dep("MetalProntas", "./metalprontas.js"), infoPr = {};
    /* as peças prontas de PISO (piso industrial, plataforma, mezanino): UM elemento pela planta inteira (não cada painel) */
    if (MPr && MPr.prontas) { try { MPr.prontas(caixas).forEach(function (pr) { if (pr.info && pr.info.par && (pr.tipo === "piso" || pr.tipo === "plataforma" || pr.tipo === "mezanino")) { var pp = MPr.parParaRefazer ? MPr.parParaRefazer(pr) : pr.info.par; var pl = plantaPronta(pr.tipo, pp); if (pl) infoPr[pr.id] = { tipo: pr.tipo, poly: pl, aberturas: arr(pp.aberturas).length }; } }); } catch (eP) {} }
    arr(caixas).forEach(function (c) {
      if (!c) return;
      if (c.tipo === "laje" && arr(c.contorno).length >= 3) {
        var esp = num(c.altura, 0.12), topo = num(c.cy, 0) + esp / 2;
        out.push({ id: String(c.id), tipo: "laje", material: "concreto", topo: r4(topo), esp: r4(esp), poly: c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), furos: arr(c.furos).map(function (f) { return arr(f && f.pts).map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }); }), fck: num(c.fck, null), caixa: c });
        return;
      }
      if (c.tipo !== "metal" || !c.metal || !B) return;
      var m = c.metal;
      if (m.kind === "chapa") {
        var ss = []; try { ss = B.solidos(c); } catch (e) { ss = []; }
        if (!ss.length) return;
        var s = ss[0], n = s.W, pts = [], ys = [];
        if (!n || Math.abs(n[1]) < 0.98) return;   /* só chapa HORIZONTAL (piso) */
        s.poli.forEach(function (q) { [s.z0, s.z1].forEach(function (z) { var P = s.ponto(q[0], q[1], z); ys.push(P[1]); }); var P0 = s.ponto(q[0], q[1], s.z0); pts.push([P0[0], P0[2]]); });
        var A = Math.abs(areaPol(pts)); if (A < 0.04) return;
        if (/Chapa de (apoio|base)|Placa|Rodapé|Degrau/i.test(m.papel || "")) return;
        var el = { id: String(c.id), tipo: "piso", material: "aco", topo: r4(Math.max.apply(null, ys)), esp: r4(Math.max.apply(null, ys) - Math.min.apply(null, ys)), poly: pts, prontaId: c.pronta ? String(c.pronta) : null, papel: m.papel || "", caixa: c };
        if (el.prontaId && infoPr[el.prontaId]) { var g = porPronta[el.prontaId]; if (!g) { g = porPronta[el.prontaId] = { id: el.prontaId, tipo: "piso", material: "aco", topo: el.topo, esp: el.esp, poly: infoPr[el.prontaId].poly, prontaId: el.prontaId, tipoPronta: infoPr[el.prontaId].tipo, papel: el.papel, caixa: c, paineis: 0 }; out.push(g); } g.topo = Math.max(g.topo, el.topo); g.paineis++; return; }
        out.push(el);
        return;
      }
      if (m.kind === "perfil") {
        var mb = null; try { mb = B.membro(c); } catch (e2) { mb = null; }
        if (!mb || Math.abs(mb.X[1]) > 0.05 || !(mb.L > 0.3)) return;   /* viga horizontal */
        var ys2 = [], pp = [];
        try { B.solidos(c).forEach(function (sd) { sd.poli.forEach(function (q) { [sd.z0, sd.z1].forEach(function (z) { var P = sd.ponto(q[0], q[1], z); ys2.push(P[1]); pp.push([P[0], P[2]]); }); }); }); } catch (e3) {}
        if (!ys2.length) return;
        var a = mb.P0, b = [a[0] + mb.X[0] * mb.L, a[1], a[2] + mb.X[2] * mb.L], larg = num(mb.s && mb.s.larg, 0.1), w = [-mb.X[2] * larg / 2, mb.X[0] * larg / 2];
        out.push({ id: String(c.id), tipo: "viga", material: "aco", topo: r4(Math.max.apply(null, ys2)), esp: r4(Math.max.apply(null, ys2) - Math.min.apply(null, ys2)), poly: [[a[0] + w[0], a[2] + w[1]], [b[0] + w[0], b[2] + w[1]], [b[0] - w[0], b[2] - w[1]], [a[0] - w[0], a[2] - w[1]]], prontaId: c.pronta ? String(c.pronta) : null, perfil: m.perfil && m.perfil.cat, caixa: c, seg: [[a[0], a[2]], [b[0], b[2]]] });
      }
    });
    return out;
  }
  /* o elemento no ponto (x, z) com o topo perto de y (tol vertical), o mais alto abaixo de y+tolV */
  function elementoEm(els, x, z, y, op) {
    op = op || {};
    var tolH = num(op.tolH, 0.05), tolV = num(op.tolV, 0.06), best = null;
    arr(els).forEach(function (el) {
      if (op.tipos && op.tipos.indexOf(el.tipo) < 0) return;
      if (!perto(el.poly, x, z, tolH)) return;
      if (el.furos && el.furos.some(function (F) { return F.length >= 3 && dentro(F, x, z); })) return;
      if (Math.abs(el.topo - y) > tolV) return;
      /* REVISÃO S6 (Rogério, 14/10): o PISO ACABADO manda — onde há piso/laje no ponto, a viga embaixo da grade (topo 3 cm
         abaixo) não é a chegada; o nível é o topo da grade/chapa */
      var sup = function (e) { return e.tipo === "viga" ? 0 : 1; };
      if (!best || sup(el) > sup(best) || (sup(el) === sup(best) && Math.abs(el.topo - y) < Math.abs(best.topo - y))) best = el;
    });
    return best;
  }
  /* REVISÃO S6 (Rogério, 14/10): a PEÇA ESTRUTURAL MAIS PRÓXIMA do ponto de ligação (viga de aço, piso de aço, laje),
     com o topo no nível (tolV) e até tolH em planta — a mais perto em planta; no empate, a viga (é nela que se liga) */
  function maisProxima(els, x, z, y, op) {
    op = op || {};
    var tolH = num(op.tolH, 0.50), tolV = num(op.tolV, 0.10), best = null, dBest = Infinity;
    arr(els).forEach(function (el) {
      if (Math.abs(el.topo - y) > tolV) return;
      if (el.furos && el.furos.some(function (F) { return F.length >= 3 && dentro(F, x, z); })) return;
      var d = dentro(el.poly, x, z) ? 0 : distBorda(el.poly, [x, z]); if (d > tolH) return;
      if (d < dBest - 0.02 || (Math.abs(d - dBest) <= 0.02 && el.tipo === "viga" && best && best.tipo !== "viga")) { best = el; dBest = d; }
    });
    return best ? { el: best, dist: r4(dBest) } : null;
  }
  /* onde a reta A + t·u cruza a borda do polígono (t em m, com sinal) */
  function cruzaBorda(P, A, u) {
    var ts = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], den = u[0] * ez - u[1] * ex; if (Math.abs(den) < 1e-9) continue;
      var t = ((a[0] - A[0]) * ez - (a[1] - A[1]) * ex) / den, s2 = ((a[0] - A[0]) * u[1] - (a[1] - A[1]) * u[0]) / den;
      if (s2 >= -1e-6 && s2 <= 1 + 1e-6) ts.push(t);
    }
    return ts.sort(function (p1, p2) { return p1 - p2; });
  }
  /* o elemento mais BAIXO acima de y0 + 0,3 m que o caminho atravessa (amostras na linha) */
  function elementoAcima(els, pts, y0, op) {
    op = op || {};
    var best = null, yMax = num(op.yMax, y0 + 12);
    arr(els).forEach(function (el) {
      if (el.tipo === "viga" && !op.vigas) return;
      if (!(el.topo > y0 + 0.3 && el.topo <= yMax)) return;
      var toca = arr(pts).some(function (p) { return dentro(el.poly, p[0], p[2]); });
      if (toca && (!best || el.topo < best.topo)) best = el;
    });
    return best;
  }
  /* o mais ALTO abaixo de y0 − 0,3 m sob o ponto */
  function elementoAbaixo(els, x, z, y0) {
    var best = null;
    arr(els).forEach(function (el) { if (!(el.topo < y0 - 0.3)) return; if (!perto(el.poly, x, z, 0.02)) return; if (!best || el.topo > best.topo) best = el; });
    return best;
  }
  function amostras(A, B, n) { var o = []; for (var i = 0; i <= n; i++) o.push([A[0] + (B[0] - A[0]) * i / n, A[1], A[2] + (B[2] - A[2]) * i / n]); return o; }
  /* ALTURAS: o = { P1, P2, sentido, H (digitada; 0 = ler), base (cota do plano de trabalho), niveis: [elevações], els }
     → { ok, yPe, yTopo, H, chegada (elemento do topo), apoioPe (elemento do pé), fonte } */
  function alturas(o) {
    o = o || {};
    var els = arr(o.els), H = num(o.H, 0), y = num(o.base, 0), P1 = o.P1, P2 = o.P2 || o.P1, desce = o.sentido === "desce";
    var niveis = arr(o.niveis).map(function (v) { return num(v, NaN); }).filter(fin).sort(function (a, b) { return a - b; });
    var acimaNivel = function (y0) { var r = null; niveis.forEach(function (v) { if (v > y0 + 0.3 && r == null) r = v; }); return r; };
    var abaixoNivel = function (y0) { var r = null; niveis.forEach(function (v) { if (v < y0 - 0.3) r = v; }); return r; };
    var yPe, yTopo, fonte, chegada = null, apoio = null;
    if (desce) {
      var noTopo = elementoEm(els, P1[0], P1[2], y, { tolH: 0.30, tolV: 0.06 });
      /* o clique pegou a viga (ou a face dela) logo abaixo da grade: o piso que cobre o ponto, até 0,60 m acima do clique */
      if (!noTopo || noTopo.tipo === "viga") { var pz = null; els.forEach(function (el) { if (el.tipo === "viga" || !(el.topo >= y - 0.06 && el.topo <= y + 0.60) || !perto(el.poly, P1[0], P1[2], 0.30)) return; if (!pz || el.topo < pz.topo) pz = el; }); if (pz) noTopo = pz; }
      if (noTopo) { yTopo = noTopo.topo; chegada = noTopo; }
      if (H > 0.1) {
        if (yTopo == null) { var acimaP1 = elementoAcima(els, [P1], y); if (acimaP1 && Math.abs(acimaP1.topo - y - H) < 0.06) { chegada = acimaP1; yTopo = acimaP1.topo; } else yTopo = y + H; }
        yPe = yTopo - H; fonte = "altura digitada (" + m2(H) + ")";
      } else {
        if (yTopo == null) { var ac = elementoAcima(els, [P1], y); if (ac) { chegada = ac; yTopo = ac.topo; } }
        if (yTopo == null) { var nv = acimaNivel(y); if (nv != null) yTopo = nv; }
        if (yTopo == null) return { ok: false, motivo: "De cima: não achei o piso/laje no 1º clique — informe a altura a vencer ou clique na borda do piso de cima." };
        var ab = elementoAbaixo(els, P2[0], P2[2], yTopo);
        yPe = ab ? ab.topo : (yTopo - y > 0.3 ? y : (abaixoNivel(yTopo) != null ? abaixoNivel(yTopo) : 0));
        if (ab) apoio = ab;
        fonte = (chegada ? "topo lido do " + (chegada.tipo === "laje" ? "laje " : "piso ") + chegada.id : "topo pelo nível da obra") + (ab ? "; pé no " + ab.tipo + " " + ab.id : "");
      }
      if (!apoio) apoio = elementoEm(els, P2[0], P2[2], yPe, { tolH: 0.02, tolV: 0.06 });
    } else {
      yPe = y; apoio = elementoEm(els, P1[0], P1[2], y, { tolH: 0.02, tolV: 0.06 });
      if (apoio && apoio.tipo !== "viga") yPe = apoio.topo;   /* o pé no PISO ACABADO (topo da grade/chapa/laje) */
      if (H > 0.1) { yTopo = y + H; fonte = "altura digitada (" + m2(H) + ")"; var ch = elementoAcima(els, amostras(P1, P2, 12), y); if (ch && Math.abs(ch.topo - yTopo) < 0.06) chegada = ch; }
      else {
        var ch2 = elementoAcima(els, amostras(P1, P2, 12), y);
        if (ch2) { chegada = ch2; yTopo = ch2.topo; fonte = "chegada lida do " + (ch2.tipo === "laje" ? "laje " : "piso ") + ch2.id; }
        else { var nv2 = acimaNivel(y); if (nv2 != null) { yTopo = nv2; fonte = "chegada pelo nível da obra (" + m2(nv2) + ")"; } }
        if (yTopo == null) return { ok: false, motivo: "De baixo: puxe a linha até o piso/laje de chegada, ou informe a altura a vencer." };
      }
    }
    return { ok: true, yPe: r4(yPe), yTopo: r4(yTopo), H: r4(yTopo - yPe), chegada: chegada, apoioPe: apoio, fonte: fonte };
  }

  /* ================================================================ 4. A ABERTURA NO PISO/LAJE DE CHEGADA
   * o = { geo: linha(...), el (elemento de chegada), largura, bLong (largura da mesa da longarina), folga, hLivre }
   * → { ok, precisa, poly [[x,z]] (o furo), modo: "furo"|"recorte"|null, contornoNovo, guarda: [[x,z]…] (3 lados), lado aberto } */
  function aMundo(geo, u, w) { var c = geo.sobe, pe = geo.pe; return [pe[0] + c[0] * u - c[1] * w, pe[2] + c[1] * u + c[0] * w]; }
  function hLivreDe() { var A = AC(), r = A && A.REQ ? A.REQ.filter(function (q) { return q.id === "iso-altura-livre-escada"; })[0] : null; return { h: r ? num(r.min, 2.30) : 2.30, ref: r ? A.ref(r.norma, r.item) : "ISO 14122-3 (altura livre)", conferir: !r || !!r.conferir }; }
  function cruzaSeg(a, b, c, d) {
    var r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
    var t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u > -1e-9 && u < 1 + 1e-9 ? { t: t, u: u, p: [a[0] + t * r[0], a[1] + t * r[1]] } : null;
  }
  /* P (polígono simples) menos o retângulo R (convexo) que cruza UMA vez a borda → o contorno com o recorte */
  function recortarContorno(P, R) {
    var n = P.length, cr = [];
    for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; for (var j = 0; j < R.length; j++) { var x = cruzaSeg(a, b, R[j], R[(j + 1) % R.length]); if (x) cr.push({ i: i, t: x.t, j: j, u: x.u, p: x.p }); } }
    if (cr.length !== 2) return null;
    cr.sort(function (x, y) { return x.i - y.i || x.t - y.t; });
    var ini = cr[0], fim = cr[1], aDentro = dentro(R, (P[ini.i][0] + ini.p[0]) / 2, (P[ini.i][1] + ini.p[1]) / 2);
    /* E = entra em R, S = sai de R (seguindo P) */
    var E = aDentro ? fim : ini, S = aDentro ? ini : fim, out = [], k;
    /* de S até E pela borda de P (fora de R) */
    out.push(S.p); k = (S.i + 1) % n; var guard = 0;
    while (guard++ < n + 2) { out.push(P[k]); if (k === E.i) break; k = (k + 1) % n; }
    out.push(E.p);
    /* de E até S pela borda de R, pelo lado DENTRO de P */
    var m = R.length, arco = function (dir) { var o = [], j = dir > 0 ? (E.j + 1) % m : E.j, g = 0; while (g++ < m + 1) { if (j === (dir > 0 ? (S.j + 1) % m : S.j)) break; o.push(R[j]); j = (j + dir + m) % m; } return o; };
    var a1 = arco(1), a2 = arco(-1), ok1 = a1.every(function (q) { return dentro(P, q[0], q[1]); }), arc = ok1 && a1.length ? a1 : a2;
    if (E.j === S.j && !a1.length) arc = [];
    out = out.concat(arc);
    var limpo = []; out.forEach(function (q) { var u = limpo[limpo.length - 1]; if (!u || Math.hypot(q[0] - u[0], q[1] - u[1]) > 1e-6) limpo.push([r4(q[0]), r4(q[1])]); });
    if (limpo.length > 2 && Math.hypot(limpo[0][0] - limpo[limpo.length - 1][0], limpo[0][1] - limpo[limpo.length - 1][1]) < 1e-6) limpo.pop();
    return limpo.length >= 4 ? limpo : null;
  }
  /* Sutherland–Hodgman: o polígono P recortado pelo polígono CONVEXO R (anti-horário) — a área da abertura dentro do piso */
  function clipConvexo(P, R) {
    var out = P.slice();
    for (var i = 0; i < R.length && out.length; i++) {
      var a = R[i], b = R[(i + 1) % R.length], inp = out; out = [];
      var lado = function (q) { return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]); };
      for (var j = 0; j < inp.length; j++) {
        var p1 = inp[j], p2 = inp[(j + 1) % inp.length], d1 = lado(p1), d2 = lado(p2);
        if (d1 >= 0) out.push(p1);
        if ((d1 >= 0) !== (d2 >= 0)) { var t = d1 / (d1 - d2); out.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]); }
      }
    }
    return out;
  }
  /* REVISÃO S6 (C4): a posição u* (do pé) a partir da qual a altura livre sob a laje fica MENOR que hL, pelo PERFIL REAL da
     escada — a linha dos bocéis de cada lance e o piso de cada patamar (o patamar quebra a reta: a conta pela inclinação só
     subestimava a abertura) */
  function uAlturaLivre(aj, H, esp, hL) {
    var thr = H - esp - hL, u = 0, y = 0, uS = 0, e = aj.e, pp = aj.p, ls = arr(aj.lances), Lp = num(aj.Lp, 0.8);
    if (thr < 0) return 0;
    for (var i = 0; i < ls.length; i++) {
      var nR = ls[i], uT = (nR - 1) * pp, y0 = y + e, y1 = y + nR * e;
      if (y0 > thr) return u;
      if (y1 > thr) return u + (thr - y0) * pp / e;
      u += uT; y += nR * e; uS = u;
      if (i < ls.length - 1) { if (y > thr) return u; u += Lp; uS = u; }
    }
    return uS;
  }
  function abertura(o) {
    o = o || {};
    var geo = o.geo, el = o.el; if (!geo || !geo.ok || !geo.pe || !el) return { ok: true, precisa: false, motivo: "sem piso/laje de chegada" };
    var aj = geo.ajuste, W = num(o.largura, 0.8), bL = num(o.bLong, 0.06), folga = num(o.folga, 0.10), hl = hLivreDe(), hL = num(o.hLivre, hl.h);
    var tg = aj.e / aj.p, esp = num(el.esp, 0.15), proj = aj.projecao;
    var uS = uAlturaLivre(aj, aj.H, esp, hL), comp = Math.min(proj, proj - uS + folga), u0 = proj - comp, wm = W / 2 + bL + folga; void tg;
    var R = [aMundo(geo, u0, -wm), aMundo(geo, proj, -wm), aMundo(geo, proj, wm), aMundo(geo, u0, wm)];
    if (areaPol(R) < 0) R.reverse();
    var P = el.poly.slice(); if (areaPol(P) < 0) P.reverse();
    var Ai = Math.abs(areaPol(clipConvexo(P, R)));
    if (Ai < 0.02 * Math.abs(areaPol(R)) + 1e-6) return { ok: true, precisa: false, motivo: "a escada chega pela borda do " + (el.tipo === "laje" ? "laje" : "piso") + " — não precisa de abertura" };
    var cantosDentro = R.filter(function (q) { return dentro(P, q[0], q[1]) && distBorda(P, q) > 1e-4; }).length;
    var res = { ok: true, precisa: true, el: el.id, tipo: el.tipo, poly: R.map(function (q) { return [r4(q[0]), r4(q[1])]; }), comprimento: r4(comp), largura: r4(2 * wm), area: r4(comp * 2 * wm), hLivre: hL, hLivreRef: hl.ref, conferir: hl.conferir,
      texto: "Abertura de " + m2(comp) + " × " + m2(2 * wm) + " no " + (el.tipo === "laje" ? "laje" : "piso") + " " + el.id + ": a escada + " + cm(folga) + " de folga de cada lado; comprimento até a altura livre de " + m2(hL) + " passar sob a " + (el.tipo === "laje" ? "laje" : "chapa") + " pelo perfil real da escada (lances e patamares) (" + hl.ref + (hl.conferir ? " — conferir" : "") + ")", uAlturaLivre: r4(uS) };
    if (cantosDentro === 4) { res.modo = "furo"; }
    else { var C = recortarContorno(P, R); if (!C) return { ok: false, precisa: true, motivo: "A abertura cruza a borda do " + (el.tipo === "laje" ? "laje" : "piso") + " mais de uma vez: recorte o contorno à mão.", poly: res.poly }; res.modo = "recorte"; res.contornoNovo = C; }
    /* GUARDA-CORPO em volta da abertura: os três lados que NÃO são a entrada (a entrada é o lado do topo da escada) */
    var lado = function (a, b) { var A = aMundo(geo, a[0], a[1]), B = aMundo(geo, b[0], b[1]); return [A, B]; };
    /* REVISÃO S6 (Rogério, 14/10): no RECORTE (o vão cruza a borda) os lados do vão ficam metade fora do piso — o guarda-corpo
       vai no trecho de DENTRO de cada lado (antes o lado inteiro saía, porque o meio dele caía fora do piso) */
    var dentroDe = function (s) {
      var A = s[0], B = s[1], dx = B[0] - A[0], dz = B[1] - A[1], Ls = Math.sqrt(dx * dx + dz * dz); if (Ls < 1e-6) return [];
      var u = [dx / Ls, dz / Ls], cs = [0].concat(cruzaBorda(P, A, u).filter(function (t) { return t > 1e-6 && t < Ls - 1e-6; })).concat([Ls]), o = [];
      for (var k = 0; k + 1 < cs.length; k++) { var tm = (cs[k] + cs[k + 1]) / 2, mx = A[0] + u[0] * tm, mz = A[1] + u[1] * tm; if ((dentro(P, mx, mz) || distBorda(P, [mx, mz]) < 0.02) && cs[k + 1] - cs[k] > 0.10) o.push([[A[0] + u[0] * cs[k], A[1] + u[1] * cs[k]], [A[0] + u[0] * cs[k + 1], A[1] + u[1] * cs[k + 1]]]); }
      return o;
    };
    var gs = []; [lado([proj, -wm], [u0, -wm]), lado([u0, -wm], [u0, wm]), lado([u0, wm], [proj, wm])].forEach(function (s) { gs = gs.concat(dentroDe(s)); });
    res.guarda = gs.map(function (s) { return [[r4(s[0][0]), r4(s[0][1])], [r4(s[1][0]), r4(s[1][1])]]; });
    return res;
  }

  /* ================================================================ 5. REAÇÕES E FIXAÇÃO
   * esp = { e, p, Lh (projeção do lance de cada ponta), largura, gPiso (kN/m²), perfil (longarina), q (kN/m²),
   *         usoGuarda, fixPe, fixTopo } → por longarina, em kN (cálculo, ELU) */
  var GAMA = { g: 1.25, q: 1.50 };
  /* REVISÃO S6 (M1): a força do guarda-corpo pelo COMPRIMENTO REAL do guarda-corpo (Lh/cos α), o BINÁRIO dela a 1,10 m
     (mais compressão numa longarina e TRAÇÃO na outra, contra só o permanente com γ = 1,0) e, com a outra ponta apoiada,
     o giro em planta resistido pelas duas placas da ponta fixa */
  function reacoes(o) {
    o = o || {};
    var A = AC(), s = Cat() && Cat().completo ? Cat().completo(o.perfil) : null, al = Math.atan(num(o.e, 0.2) / num(o.p, 0.25)), ca = Math.cos(al), sa = Math.sin(al);
    var W = num(o.largura, 0.8), Lh = num(o.Lh, 3), gPiso = num(o.gPiso, 0.6), q = num(o.q, 2.5), gProp = s ? s.massa * 9.81 / 1000 : 0.2, gGc = 0.25, bf = s && s.bf ? s.bf / 1000 : 0.06;
    var wG = gPiso * W / 2 + gProp / ca + gGc, wQ = q * W / 2, wd = GAMA.g * wG + GAMA.q * wQ, Wd = wd * Lh, Wk = (wG + wQ) * Lh, Vg = wG * Lh * ca * ca / 2;   /* o MENOR permanente vertical das hipóteses (ponta móvel na perpendicular: cos²α/2) */
    var fg = A && A.forcaGuarda ? A.forcaGuarda(o.usoGuarda || "industrial") : { f: 2.0, altura: 1.1, ref: "NBR 6120:2019, Tabela 12" };
    var Lg = Lh / ca, hG = (fg.altura || 1.1), bW = W + bf, Ht = GAMA.q * fg.f * Lg / 2, dV = Ht * hG / bW;
    var apPe = o.fixPe === "apoiada", apTopo = o.fixTopo === "apoiada";
    function ponta(apoiada, outraApoiada) {
      if (apoiada) return { V: Wd / 2 + dV, Nt: Math.max(0, dV - Vg), dV: dV, Vg: Vg, H: 0, Vt: 0, hip: "apoio simples (móvel): V = wd·Lh/2 + o binário do guarda-corpo; sem horizontal — a horizontal vai para a outra ponta" };
      var V = Wd * (1 - ca * ca / 2), Hl = outraApoiada ? 0 : Wd * sa * ca / 2, Ht2 = outraApoiada ? 2 * Ht : Ht;
      if (outraApoiada) Hl += 2 * Ht * (Lh / 2) / bW;   /* o giro em planta da escada que só se segura nesta ponta */
      return { V: V + dV, Nt: Math.max(0, dV - Vg), dV: dV, Vg: Vg, H: Math.sqrt(Hl * Hl + Ht2 * Ht2), Hl: Hl, Vt: Ht2, hip: outraApoiada ? "ponta FIXA com a outra apoiada: V pela envoltória + o binário; a força do guarda-corpo das duas pontas e o giro em planta aqui" : "envoltória das duas hipóteses (pé fixo ou topo fixo, a outra móvel na perpendicular) + o binário do guarda-corpo" };
    }
    return { ok: true, alfa: al / GRAU, wG: wG, wQ: wQ, wd: wd, Wd: Wd, Wk: Wk, Lh: Lh, Lg: Lg, guarda: fg, Ht: Ht, dV: dV, Vg: Vg, pe: ponta(apPe, apTopo), topo: ponta(apTopo, apPe), mecanismo: apPe && apTopo,
      passos: [
        { rotulo: "Cargas por metro horizontal, por longarina", formula: "g = gpiso·W/2 + pp/cos α + guarda-corpo (0,25 kN/m); q·W/2 (" + (A ? A.ref("nbr6120", "Tabela 10") : "NBR 6120:2019, Tabela 10") + ")", valor: "g = " + br(wG, 3) + " kN/m; q = " + br(wQ, 3) + " kN/m; wd = 1,25·g + 1,50·q = " + br(wd, 3) + " kN/m" },
        { rotulo: "Carga do lance", formula: "Wd = wd·Lh", valor: br(Wd, 2) + " kN (Lh = " + m2(Lh) + ", α = " + br(al / GRAU, 1) + "°)" },
        { rotulo: "Força do guarda-corpo (" + fg.ref + ")", formula: "1,5·f·(Lh/cos α)/2 por ponta (transversal, sem ψ0 — a favor); binário a " + br(hG, 2) + " m: ΔV = H·h/(W + bf)", valor: br(Ht, 2) + " kN; ΔV = ±" + br(dV, 2) + " kN (tração líquida " + br(Math.max(0, dV - Vg), 2) + " kN contra o menor permanente " + br(Vg, 2) + " kN = g·Lh·cos²α/2, γ = 1,0)" }] };
  }
  /* pilaretes (PÉS DE APOIO) candidatos: o mais leve que passa na compressão */
  var PES = ["HSS50.8X50.8X4.8", "HSS63.5X63.5X4.8", "HSS76.2X76.2X6.4", "HSS101.6X101.6X6.4", "HSS127X127X6.4", "HSS152.4X152.4X6.4"];
  function pilarete(N, h, aco, minIdx) {
    var D = D88(), C = Cat(), M = Mat(), a = M ? M.aco(aco || "ASTM A36") : null; a = a || { fy: 250, fu: 400 };
    if (!D || !C) return { ok: false, motivo: "js/acodim8800.js não carregou" };
    for (var i = Math.max(0, Math.round(num(minIdx, 0))); i < PES.length; i++) {
      var s = C.completo(PES[i]); if (!s || !(s.A > 0)) continue;
      var est = []; for (var k = 0; k <= 4; k++) est.push({ x: h * k / 4, N: -N, Vy: 0, Mz: 0, comb: "ELU" });
      var r = null; try { r = D.verificarBarra({ secao: s, aco: a, L: h, estacoes: est, flambagem: { Lx: h, Ly: h, Lz: h }, travamentos: { mais: [], menos: [] }, papel: "pilar" }); } catch (e) { r = null; }
      if (!r || !arr(r.verificacoes).length) continue;
      var rz = r.verificacoes.reduce(function (mx, v) { return Math.max(mx, razaoDe(v)); }, 0);
      /* ESBELTEZ bloqueante (NBR 8800:2008, 5.3.4.1: KL/r ≤ 200 — a mesma regra da Estrutura desenhada) */
      var I = Math.min(num(s.Ix, Infinity), num(s.Iy, Infinity)), rg = isFinite(I) && s.A > 0 ? Math.sqrt(I / s.A) : null, lam = rg ? h * 1000 / rg : null;
      if (lam != null && lam > 200 + 1e-9) continue;
      var ve = r.verificacoes.slice(); if (lam != null) ve.push({ nome: "Esbeltez KL/r", item: "NBR 8800:2008, 5.3.4.1 (KL/r ≤ 200; na 2024, 5.3.7 — o OrçaPRO adota como exigência)", passos: [{ rotulo: "KL/r", formula: "K = 1; r = √(I/A)", valor: br(lam, 0) + " ≤ 200" }], resistencia: 200, solicitante: lam, unidade: "", razao: lam / 200 });
      if (rz <= 1 + 1e-9) return { ok: true, perfil: PES[i], s: s, razao: rz, lambda: lam, verificacoes: ve };
    }
    return { ok: false, motivo: "nenhum pilarete de " + PES[0] + " a " + PES[PES.length - 1] + " passa com N = " + br(N, 1) + " kN em " + m2(h) };
  }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos, resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0), ok: !(res > 0 ? sol / res > 1 + 1e-9 : sol > 0) }; }
  function passo(r, f, v) { return { rotulo: r, formula: f || "", valor: v }; }
  /* REVISÃO S6 (C1): razão NÃO FINITA (placa fora do concreto, chumbador além da borda: o js/acoligfundacao.js devolve ∞)
     é FALHA — convertida ANTES do clone (o JSON troca Infinity por null) e nunca lida como 0 */
  function razaoDe(v) { var r = v ? v.razao : null; if (typeof r === "number" && isFinite(r)) return r; return v && v.info ? 0 : 9.99; }
  function marcar(v, nome) { var rz = razaoDe(v), o = clone(v); o.razao = rz; if (!(typeof v.razao === "number" && isFinite(v.razao)) && !v.info) { o.naoFinita = true; o.nome = nome + " (razão não finita — fora do concreto/da borda: FALHA)"; } else o.nome = nome; o.ok = !!v.info || rz <= 1 + 1e-9; return o; }
  var ROT = { soldada: "SOLDADA", parafusada: "PARAFUSADA", ancorada: "ANCORADA", apoiada: "APOIADA", pes: "BASE DO PÉ DE APOIO" };
  /* a fixação padrão: concreto → ancorada; aço (viga/piso) → parafusada; nada no topo → apoiada (pés de apoio) */
  function fixacaoAuto(o) {
    o = o || {};
    var de = function (el, topo) { if (!el) return topo ? "apoiada" : "ancorada"; return el.material === "aco" ? "parafusada" : "ancorada"; };
    return { pe: de(o.apoioPe, false), topo: de(o.chegada, true), motivoPe: o.apoioPe ? (o.apoioPe.material === "aco" ? "aço embaixo (" + o.apoioPe.tipo + " " + o.apoioPe.id + ") → parafusada" : "concreto embaixo (" + o.apoioPe.tipo + " " + o.apoioPe.id + ") → ancorada") : "sem elemento desenhado embaixo: piso de concreto → ancorada",
      motivoTopo: o.chegada ? (o.chegada.material === "aco" ? "aço em cima (" + o.chegada.tipo + " " + o.chegada.id + ") → parafusada" : "concreto em cima (" + o.chegada.tipo + " " + o.chegada.id + ") → ancorada") : "nada em cima para fixar → apoiada (pés de apoio no topo)" };
  }
  /* REVISÃO S6 (C2/C3): o CONCRETO em volta da placa, no ponto da PRÓPRIA placa — o contorno da laje desenhada com os FUROS
     (o furo perto da placa vira borda: o contorno é recortado pelo lado do furo que fica do lado da placa), ou a distância até a
     borda informada (quadrado em volta da placa, a favor), ou NADA → a borda não é verificada (crítico). Devolve
     { mundo: [[x,z]…], local: [[u,w]…] mm (js/acoligfundacao.js), texto } */
  /* a CHAPA DE EXTENSÃO do topo (soldada no topo da longarina, em balanço até a chapa de fixação): flexão na seção da chapa */
  function verifExtensao(nome, ex, V, t0, aco, bMax) {
    var M = Mat(), ga1 = M && M.GAMA ? M.GAMA.a1 : 1.10, b0 = num(ex.b, 100), b = b0, br0 = num(ex.braco, 0.1), Md = V * br0, t = t0, MRd = 0;
    var passa = function (bb, tt) { var m = bb * tt * tt / 4 * aco.fy / ga1 / 1e6, v = 0.6 * aco.fy * bb * tt / ga1 / 1000; return m >= Md && Math.sqrt(Math.pow(Md / m, 2) + Math.pow(V / v, 2)) <= 1; };
    /* REVISÃO S6 rodada 3 (A1): a extensão tem a MESMA espessura da placa (a junta de topo fica entre chapas iguais — a seção
       da junta é a da extensão); falta resistência → mais LARGA (até a largura da placa); só depois mais grossa, e aí a junta
       de topo (calculada com a chapa mais fina) acusa */
    var bs = [], bb; for (bb = b0; bb <= Math.max(b0, num(bMax, b0)) + 1e-9; bb += 25) bs.push(bb);
    if (!bs.some(function (x) { b = x; t = t0; return passa(x, t0); })) { b = b0; [12.5, 16, 19, 22.4, 25, 31.5].some(function (tt) { if (tt < t0 - 1e-9) return false; t = tt; return passa(b0, tt); }); }
    MRd = b * t * t / 4 * aco.fy / ga1 / 1e6;
    ex.t = t; ex.b = b;
    return verif(nome + " — chapa de extensão à flexão (" + br(b, 0) + " × " + br(t, 1) + " mm, balanço " + cm(br0) + ")", "NBR 8800:2024 (expressão da 2008), 5.4 (seção retangular cheia: Z = b·t²/4)", [passo("Momento", "M = V·braço", br(Md, 3) + " kN·m"), passo("Resistência", "Z·fy/γa1", br(MRd, 3) + " kN·m")], MRd, Md, "kN·m");
  }
  /* REVISÃO S6 rodada 3 (A1): a LIGAÇÃO REAL do topo — a longarina inclinada só encosta no canto da chapa horizontal (folga
     de até ~0,15·tg α): uma CHAPA VERTICAL de ligação (150 × 150 × 9,5 mm, no plano da alma) soldada na alma da longarina
     (filete na linha da mesa inclinada + na linha do corte de prumo) e embaixo da chapa horizontal (filete dos dois lados).
     Grupo de solda pelo método da linha (elástico): cisalhamento direto + o momento da excentricidade */
  var GUS = { L: 150, h: 150, t: 9.5 };
  function grupoSolda(linhas, Fx, Fy, M) {
    var Lt = 0, cx = 0, cy = 0; linhas.forEach(function (l) { var L = Math.hypot(l[2] - l[0], l[3] - l[1]); Lt += L; cx += L * (l[0] + l[2]) / 2; cy += L * (l[1] + l[3]) / 2; }); cx /= Lt; cy /= Lt;
    var J = 0; linhas.forEach(function (l) { var L = Math.hypot(l[2] - l[0], l[3] - l[1]), mx = (l[0] + l[2]) / 2 - cx, my = (l[1] + l[3]) / 2 - cy; J += L * L * L / 12 + L * (mx * mx + my * my); });
    var pior = 0; linhas.forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { var dx = q[0] - cx, dy = q[1] - cy, fx = Fx / Lt - M * dy / J, fy = Fy / Lt + M * dx / J; pior = Math.max(pior, Math.sqrt(fx * fx + fy * fy)); }); });
    return { Lt: Lt, f: pior };   /* kN/mm */
  }
  function ligacaoTopo(nome, V, H, lg, al, aco, fw, Lsob) {
    var C = LC(), vs = [], tg = Math.tan(al), a0 = Math.max(C.pernaMinima(Math.max(GUS.t, num(lg.tw, 5))), 5), cap, a, g, Hl = H;
    /* coordenadas (mm) no plano da alma: u ao longo da escada (0 = corte de prumo), y para cima (0 = topo da longarina no corte) */
    /* REVISÃO S6 r4: a chapa fica ENCOSTADA na face da alma (lado de dentro do U, sem mesa); os cordões: na linha do topo da
       longarina (canto da chapa com a face de cima da mesa) e na borda de BAIXO da chapa, sobre a alma (no corte de prumo as
       duas bordas ficam rentes — ali não há filete) */
    var hB = Math.min(GUS.h, lg.d / Math.cos(al) - 10), Lm = Math.min(GUS.L, GUS.h / Math.max(tg, 0.2)), linhas = [[-Lm, -Lm * tg, 0, 0], [-Lm, -hB, 0, -hB]];
    var M = V * (GUS.L / 2) + Hl * 0;   /* a reação chega na borda de cima da chapa, no meio dela: braço GUS.L/2 até o corte (kN·mm) */
    /* o filete corre na BORDA da chapa de 9,5 mm (perna máxima ao longo da borda t − 1,5 mm — NBR 8800, soldas de filete, tamanho máximo) e o metal-base da ALMA da
       longarina limita por mm (escoamento por cisalhamento 0,60·fy·tw/γa1) */
    var MM = Mat(), ga1 = MM && MM.GAMA ? MM.GAMA.a1 : 1.10, aMax = Math.max(a0, Math.floor(GUS.t - 1.5)), capAlma = 0.6 * aco.fy * num(lg.tw, 5) / ga1 / 1000;
    var capDe = function (aa) { return Math.min(C.soldaFilete(aa, 1, fw, aco.fy), capAlma); };
    g = grupoSolda(linhas, Hl, V, M);
    for (a = a0; a < aMax; a++) { if (capDe(a) >= g.f) break; }
    cap = capDe(a);
    vs.push(verif(nome + " — solda da chapa de ligação na alma da longarina (filete " + a + " mm, " + br(g.Lt, 0) + " mm de cordão)", "NBR 8800:2024 (expressão da 2008), 6.2.5 e Tabela 10 — grupo de solda pelo método da linha (cisalhamento direto + momento)", [passo("Cordões", "na linha do topo da longarina (" + br(Lm / Math.cos(al), 0) + " mm) + na borda de baixo da chapa, sobre a alma (" + br(Lm, 0) + " mm)", br(g.Lt, 0) + " mm"), passo("Força no ponto mais solicitado", "√((H/L − M·y/J)² + (V/L + M·x/J)²), M = V·" + br(GUS.L / 2, 0) + " mm", br(g.f * 1000, 0) + " N/mm"), passo("Resistência por mm", "mín(0,60·0,707·a·fw/γw2; 0,60·a·fy/γa1; alma 0,60·fy·tw/γa1), a ≤ " + aMax + " mm na borda da chapa", br(cap * 1000, 0) + " N/mm")], cap * 1000, g.f * 1000, "N/mm"));
    var Lb = Math.max(20, Math.min(GUS.L, num(Lsob, GUS.L))), Lc = 2 * Lb, a2 = a0, cap2 = C.soldaFilete(a2, Lc, fw, aco.fy), R = Math.sqrt(V * V + Hl * Hl);
    while (cap2 < R && a2 < aMax) { a2++; cap2 = C.soldaFilete(a2, Lc, fw, aco.fy); }
    vs.push(verif(nome + " — solda da chapa de ligação embaixo da chapa horizontal (filete " + a2 + " mm dos dois lados)", "NBR 8800:2024 (expressão da 2008), 6.2.5", [passo("Cordão", "2 × " + br(Lb, 0) + " mm (o trecho da chapa de ligação embaixo da chapa horizontal)", br(Lc, 0) + " mm"), passo("Resultante", "√(V² + H²)", br(R, 2) + " kN")], cap2, R));
    return { verificacoes: vs, gusset: { L: GUS.L, h: GUS.h, t: GUS.t, a: a, a2: a2, Lsob: Lb } };
  }
  /* a junta de TOPO extensão × placa (mesmo plano, penetração total: resistência do metal-base — NBR 8800, Tabela 8) */
  function juntaTopo(nome, b, t, V, M, aco) {
    var MM = Mat(), ga1 = MM && MM.GAMA ? MM.GAMA.a1 : 1.10, fy = aco.fy, MRd = b * t * t / 4 * fy / ga1 / 1e6, VRd = 0.6 * fy * b * t / ga1 / 1000;
    var r = Math.sqrt(Math.pow(M / MRd, 2) + Math.pow(V / VRd, 2));
    return verif(nome + " — junta de topo chapa de extensão × placa (penetração total, " + br(b, 0) + " × " + br(t, 1) + " mm)", "NBR 8800:2024 (expressão da 2008), 6.2.5 e Tabela 8 (penetração total: a resistência do metal-base — seção retangular cheia)", [passo("Momento e cortante na junta", "M = V·braço", "M = " + br(M, 3) + " kN·m; V = " + br(V, 2) + " kN"), passo("Resistências", "MRd = b·t²·fy/(4·γa1); VRd = 0,6·fy·b·t/γa1", br(MRd, 3) + " kN·m; " + br(VRd, 1) + " kN"), passo("Interação", "√((M/MRd)² + (V/VRd)²)", br(r, 3))], 1, r, "");
  }
  function suporteConcreto(cc, P, eixo, dim) {
    cc = cc || {}; var Lfd = LF(); if (!Lfd || !P) return {};
    var ex = num(eixo && eixo[0], 1), ez = num(eixo && eixo[1], 0), le = Math.sqrt(ex * ex + ez * ez) || 1; ex /= le; ez /= le;
    var poly = null, texto = "";
    if (arr(cc.poly).length >= 3) {
      poly = cc.poly.map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }); if (areaPol(poly) < 0) poly.reverse();
      arr(cc.furos).forEach(function (F) {
        F = arr(F).map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }); if (F.length < 3) return; if (areaPol(F) < 0) F.reverse();
        /* a aresta do furo que separa a placa do furo, com a maior folga — o semiplano do lado da placa não tem furo */
        var best = null;
        for (var i = 0; i < F.length; i++) { var a = F[i], b = F[(i + 1) % F.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz); if (L < 1e-6) continue; var dist = ((P[0] - a[0]) * dz - (P[2] - a[1]) * dx) / L; if (dist > 0 && (!best || dist > best.d)) best = { a: a, b: b, d: dist, n: [dz / L, -dx / L], t: [dx / L, dz / L] }; }
        if (!best || best.d > 20) return;
        var A0 = [best.a[0] - best.t[0] * 100, best.a[1] - best.t[1] * 100], B0 = [best.a[0] + best.t[0] * 100, best.a[1] + best.t[1] * 100];
        var HP = [A0, B0, [B0[0] + best.n[0] * 100, B0[1] + best.n[1] * 100], [A0[0] + best.n[0] * 100, A0[1] + best.n[1] * 100]]; if (areaPol(HP) < 0) HP.reverse();
        var cl = clipConvexo(poly, HP); if (cl.length >= 3) { poly = cl; texto = "o furo da laje a " + br(best.d, 2) + " m do ponto da placa entra como borda"; }
      });
    } else if (num(cc.borda, 0) > 0) {
      var d = num(cc.borda, 0); poly = [[P[0] - d, P[2] - d], [P[0] + d, P[2] - d], [P[0] + d, P[2] + d], [P[0] - d, P[2] + d]];
      texto = "borda do concreto a " + br(d, 2) + " m da placa em todas as direções (valor informado, a favor)";
    }
    /* REVISÃO S6 (C2): no TOPO o concreto ACABA na borda de chegada (a escada não atravessa a laje): o contorno é recortado
       pelo semiplano depois da borda de chegada — vale mesmo que o furo não tenha chegado no contorno */
    if (poly && cc.chegada && cc.chegada.P && cc.chegada.n) {
      var Pc = cc.chegada.P, nC = cc.chegada.n, tC = [-nC[1], nC[0]], A1 = [Pc[0] - tC[0] * 100, Pc[2] - tC[1] * 100], B1 = [Pc[0] + tC[0] * 100, Pc[2] + tC[1] * 100];
      var HP2 = [A1, B1, [B1[0] + nC[0] * 100, B1[1] + nC[1] * 100], [A1[0] + nC[0] * 100, A1[1] + nC[1] * 100]]; if (areaPol(HP2) < 0) HP2.reverse();
      var cl2 = clipConvexo(poly, HP2); if (cl2.length >= 3) poly = cl2; else poly = null;
    }
    if (!poly) return {};
    var loc = Lfd.suporteLocal({ poligonoTopo: poly }, P, [ex, ez]);
    return { mundo: poly, local: loc, texto: texto };
  }
  /* DIMENSIONA uma ponta. it = { ponta: "pe"|"topo", modo, R (de reacoes().pe/.topo), longarina: {d, bf, tw, tf} mm, alfa (°),
       concreto: { fck, esp (m), poly (planta [[x,z]]), id, rotulo, informado }, suporteT (mm, aço), hPe (m, altura dos pés de apoio), aco } */
  function fixacao(it) {
    it = it || {};
    var out = { verificacoes: [], naoVerificados: [], avisos: [], desenho: null, resumo: "" }, modo = it.modo, R = it.R || { V: 0, H: 0 }, nome = it.rotulo || ((it.ponta === "topo" ? "Topo" : "Pé") + " da escada — " + (ROT[modo] || modo));
    var C = LC(), M = Mat(), lg = it.longarina || { d: 203, bf: 57, tw: 5.6, tf: 9.9 }, al = num(it.alfa, 40) * GRAU, V = num(R.V, 0), H = num(R.H, 0);
    var aco = M ? M.aco("ASTM A36") : null; aco = aco || { fy: 250, fu: 400 };
    var el = M && M.ELETRODOS ? M.ELETRODOS.filter(function (x) { return x.id === "E70XX"; })[0] : null, fw = el ? el.fw : 485;
    out.verificacoes.push({ nome: nome + " — esforços por longarina (ELU)", item: "NBR 6120:2019, Tabela 10 (escadas) e Tabela 12 (guarda-corpo); NBR 8800:2024, Tabela 1 (γ — expressão da 2008)", passos: [passo("Hipótese", "", R.hip || "—"), passo("Esforços", "V (vertical, compressão no apoio); H (horizontal: longitudinal + guarda-corpo)", "V = " + br(V, 2) + " kN; H = " + br(H, 2) + " kN")], razao: 0, ok: true, info: true });
    if (!C) { out.naoVerificados.push("não verificado: " + nome + " — js/acoligcalc.js não carregou (CRÍTICO)"); return out; }
    /* a pegada do pé (corte horizontal da longarina inclinada): d/sen α × bf; no topo (corte de prumo): d × bf */
    var dPeg = it.ponta === "topo" ? lg.d : lg.d / Math.max(0.2, Math.sin(al)), bPeg = lg.bf;
    function soldaLongarina(Rr) {
      var Lw = 2 * dPeg + 2 * bPeg, tMin = Math.min(num(lg.tw, 5), 12.5), a = Math.max(C.pernaMinima(Math.max(tMin, 9.5)), 4), cap = 0;
      for (; a <= 8; a++) { cap = C.soldaFilete(a, Lw, fw, aco.fy); if (cap >= Rr) break; }
      a = Math.min(a, 8); cap = C.soldaFilete(a, Lw, fw, aco.fy);
      return { a: a, Lw: Lw, v: verif(nome + " — solda da longarina na chapa (filete " + a + " mm no contorno)", "NBR 8800:2024 (expressão da 2008), 6.2.5 e Tabela 10 (perna mínima)", [passo("Cordão", "contorno da pegada: 2·(d' + bf)", br(Lw, 0) + " mm (d' = " + br(dPeg, 0) + " mm)"), passo("Resistência", "mín(0,60·0,707·a·L·fw/γw2; 0,60·a·L·fy/γa1)", br(cap, 1) + " kN"), passo("Solicitação", "√(V² + H²)", br(Rr, 2) + " kN")], cap, Rr) };
    }
    var Rres = Math.sqrt(V * V + H * H);
    if (modo === "soldada") {
      var sw = soldaLongarina(Rres);
      out.verificacoes.push(sw.v);
      out.naoVerificados.push("não verificado: o elemento de aço onde a escada é soldada (alma/mesa da viga ou chapa do piso — forças localizadas)");
      out.desenho = { modo: modo, chapa: null, solda: sw.a, Lw: sw.Lw };
      out.resumo = "soldada: filete " + sw.a + " mm no contorno da longarina (E70XX)";
      return out;
    }
    if (modo === "parafusada") {
      var ga2 = M && M.GAMA ? M.GAMA.a2 : 1.35, melhor = null, tSup = num(it.suporteT, 0) > 0 ? num(it.suporteT, 0) : null;
      [["M12", 12], ["M16", 16], ["M20", 20]].some(function (pf) {
        return [2, 4].some(function (nb) {
          return [9.5, 12.5, 16].some(function (t) {
            var d = pf[1], Fv = C.parafusoCisal(d, 825, true), e1 = Math.max(1.75 * d, 30), lf = e1 - C.furoPadrao(d) / 2;
            var Fc = C.pressaoContato(d, t, aco.fu, lf), Fc2 = tSup ? C.pressaoContato(d, tSup, aco.fu, lf) : Infinity, FvSd = H / nb, braco = num(it.braco, 0), alav = (dPeg + 2 * e1) / 1000;
            /* topo: a reação chega pela chapa de extensão, fora do centro da chapa — o momento V·braço traciona a fileira de longe */
            var Nt0 = num(R.Nt, 0) + (it.ponta !== "topo" && braco > 0 && alav > 0 ? 2 * V * braco / alav : 0), FtSd = Nt0 / nb, FtRd = C.parafusoTracao(d, 825);
            var vs = [verif(nome + " — parafusos ao cisalhamento (" + nb + " × " + pf[0] + " 8.8)", "NBR 8800:2024, 6.3.3.2 (Fv,Rd = 0,45·Ab·fub/γa2, rosca no plano)", [passo("Fv,Rd", "0,45·Ab·825/" + br(ga2, 2), br(Fv, 1) + " kN"), passo("Fv,Sd por parafuso", "H/n", br(FvSd, 2) + " kN")], Fv, FvSd),
              verif(nome + " — pressão de contato na chapa (t = " + br(t, 1) + " mm)", "NBR 8800:2024, 6.3.3.3 (1,2·lf·t·fu ≤ 2,4·d·t·fu)/γa2", [passo("lf", "e1 − furo/2", br(lf, 1) + " mm"), passo("Fc,Rd", "", br(Fc, 1) + " kN")], Fc, FvSd)];
            if (tSup) vs.push(verif(nome + " — pressão de contato no apoio de aço (t = " + br(tSup, 1) + " mm)", "NBR 8800:2024, 6.3.3.3", [passo("Fc,Rd", "", br(Fc2, 1) + " kN")], Fc2, FvSd));
            /* REVISÃO S6 (M1): a tração do binário do guarda-corpo nos parafusos (interação 6.3.3.4) */
            if (Nt0 > 0) vs.push(verif(nome + " — parafusos: tração do binário + cisalhamento", "NBR 8800:2008, 6.3.3.1 e 6.3.3.4", [passo("Ft,Sd por parafuso", "Nt/n", br(FtSd, 2) + " kN (Ft,Rd = " + br(FtRd, 1) + " kN)"), passo("(Ft,Sd/Ft,Rd)² + (Fv,Sd/Fv,Rd)²", "", br(Math.pow(FtSd / FtRd, 2) + Math.pow(FvSd / Fv, 2), 3))], 1, Math.pow(FtSd / FtRd, 2) + Math.pow(FvSd / Fv, 2), ""));
            if (vs.every(function (v) { return v.ok; })) { melhor = { pf: pf, nb: nb, t: t, vs: vs, e1: e1 }; return true; }
            return false;
          });
        });
      });
      if (!melhor) { out.verificacoes.push(verif(nome + " — parafusos", "NBR 8800:2024, 6.3", [passo("Nenhum arranjo até 4 × M20 com chapa de 16 mm passa", "", "H = " + br(H, 2) + " kN")], 1, 2, "")); return out; }
      out.verificacoes = out.verificacoes.concat(melhor.vs);
      var sw2 = soldaLongarina(Rres), ltP = null;
      var B2 = Math.ceil((bPeg + 2 * Math.max(melhor.e1, 35) + (melhor.nb > 2 ? 0 : 0)) / 10) * 10, L2 = Math.ceil((dPeg + 2 * 2 * melhor.e1) / 10) * 10;
      /* REVISÃO S6 r3 (A1): no topo a longarina inclinada não encosta na chapa horizontal — a chapa de ligação; a chapa fica
         centrada na viga (no fim da longarina): só a METADE dela (B2/2) fica em cima da chapa de ligação para o cordão de baixo */
      if (it.ponta === "topo") { ltP = ligacaoTopo(nome, V, H, lg, al, aco, fw, B2 / 2); out.verificacoes = out.verificacoes.concat(ltP.verificacoes); }
      else out.verificacoes.push(sw2.v);
      if (it.extensao) out.verificacoes.push(verifExtensao(nome, it.extensao, V, melhor.t, aco));
      if (it.semViga) out.naoVerificados.push("não verificado: " + nome + " — a chapa aparafusada fica sobre GRADE/chapa de piso sem viga embaixo (o parafuso não pega em grade): ponha a chegada sobre uma viga do piso (CRÍTICO)");
      if (!tSup) out.naoVerificados.push("não verificado: pressão de contato no apoio de aço (espessura da mesa/chapa embaixo não identificada)");
      out.naoVerificados.push("não verificado: o elemento de aço onde a chapa aparafusa (flexão local da mesa / da chapa do piso)");
      out.desenho = { modo: modo, chapa: { B: B2, L: L2, t: melhor.t }, parafusos: { n: melhor.nb, id: melhor.pf[0], d: melhor.pf[1], e1: melhor.e1, classe: "8.8" }, solda: sw2.a };
      /* no TOPO a chapa fica centrada na linha da viga de borda, com os parafusos AO LONGO da viga (todos sobre a mesa) */
      if (it.ponta === "topo") { out.desenho.chapa = { L: B2, B: L2, t: melhor.t }; out.desenho.parafusos.aoLongoW = true; out.desenho.gusset = ltP ? ltP.gusset : null; out.naoVerificados.push("não verificado: flexão local da mesa da viga sob a chapa (a excentricidade de " + cm(num(it.braco, 0)) + " entre a longarina e a linha dos parafusos é resistida pelo contato da chapa)"); }
      out.resumo = "parafusada: chapa " + br(L2, 0) + " × " + br(B2, 0) + " × " + br(melhor.t, 1) + " mm com " + melhor.nb + " parafusos " + melhor.pf[0] + " 8.8; " + (ltP ? "longarina ligada na chapa pela chapa de ligação " + GUS.L + " × " + GUS.h + " × " + br(GUS.t, 1) + " mm (filetes " + ltP.gusset.a + " e " + ltP.gusset.a2 + " mm)" : "longarina soldada na chapa (filete " + sw2.a + " mm)");
      return out;
    }
    if (modo === "ancorada" || modo === "pes") {
      var Npe = V, Hpe = H, Nt = num(R.Nt, 0), Mpe = num(it.M, 0), pil = { d: Math.round(dPeg), bf: Math.round(bPeg), tw: num(lg.tw, 5), tf: num(lg.tf, 8) };
      if (modo === "pes") pil = { d: it.pes.s.b, bf: it.pes.s.b, tw: it.pes.s.t, tf: it.pes.s.t };
      if (it.pilar) pil = it.pilar;
      var cc = it.concreto || {}, fck = num(cc.fck, 0) > 0 ? num(cc.fck, 25) : 25;
      /* REVISÃO S6 (M1): a compressão E a tração do binário do guarda-corpo; no topo, o momento da excentricidade da chapa */
      var esf = [{ comb: "ELU — compressão", N: -Npe, Vx: Hpe, Vz: 0, M: Mpe }]; if (Nt > 0) esf.push({ comb: "ELU — levantamento (binário do guarda-corpo, permanente γ = 1,0)", N: Nt, Vx: Hpe, Vz: 0, M: Mpe });
      var pb = C.placaBase({ tipo: Mpe > 0 ? "engastada" : "rotulada", pilar: pil, aco: aco, chumbador: { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 }, concreto: { fck: fck, A2_A1: 1 }, eletrodo: { fw: fw }, esforcos: esf });
      out.verificacoes = out.verificacoes.concat(arr(pb.verificacoes).map(function (v) { return marcar(v, nome + " — " + v.nome); }));
      if (num(cc.fck, 0) <= 0) out.avisos.push(nome + ": fck do concreto não informado — 25 MPa adotado (NBR 6118:2014, Tabela 7.1, C25 na classe II); confirme");
      var Lfd = LF(), sup = suporteConcreto(cc, it.P, it.eixo, pb.dimensoes);
      if (Lfd && num(cc.esp, 0) > 0) {
        var info = { id: cc.id || "piso", rotulo: cc.rotulo || "Piso de concreto", tipo: cc.tipo || "laje", cotaTopo: num(cc.topo, 0), altura: num(cc.esp, 0), poligonoTopo: sup.mundo || [[-5, -5], [5, -5], [5, 5], [-5, 5]], fck: fck, fckInformado: num(cc.fck, 0) > 0, cobrimento: Lfd.COBRIMENTO };
        var rf = null; try { rf = Lfd.verificar(pb, info, { suporte: sup.local || [[-5000, -5000], [5000, -5000], [5000, 5000], [-5000, 5000]], esforcos: esf }); } catch (eF) { rf = null; }
        if (rf) {
          /* REVISÃO S6 (C2): sem o contorno do concreto (nem a distância à borda) só valem as verificações do MIOLO — a borda fica CRÍTICA */
          var novos = arr(rf.verificacoes).slice(arr(pb.verificacoes).length).filter(function (v) { return sup.local || !/dentro do topo|Cobrimento lateral|borda/i.test(v.nome); }).map(function (v) { return marcar(v, nome + " — " + v.nome); });
          out.verificacoes = out.verificacoes.concat(novos); out.avisos = out.avisos.concat(arr(rf.avisosFundacao));
          if (novos.some(function (v) { return !v.ok && /cabe|altura/i.test(v.nome); })) out.avisos.push(nome + ": o chumbador com gancho não cabe no concreto de " + cm(num(cc.esp, 0)) + " — use chumbador químico ou de expansão (dimensionar pelo catálogo do fabricante) ou um bloco/pedestal");
          if (!sup.local) out.naoVerificados.push("não verificado: " + nome + " — chumbadores junto da BORDA do concreto (placa dentro do concreto, cobrimento lateral, ruptura da borda): desenhe a laje ou informe a distância até a borda (CRÍTICO)");
          else if (sup.texto) out.avisos.push(nome + ": " + sup.texto);
        } else out.naoVerificados.push("não verificado: ancoragem no concreto do " + (cc.rotulo || "piso") + " (CRÍTICO)");
      } else out.naoVerificados.push("não verificado: ancoragem dos chumbadores no concreto (cone, gancho, borda) — informe a espessura do piso/laje de concreto no " + (it.ponta === "topo" ? "topo" : "pé") + " ou desenhe a laje (CRÍTICO)");
      if (it.extensao) {
        /* a "solda do pilar na placa" do js/acoligcalc.js não existe aqui (o "pilar" é fictício): sai, e entram a ligação real */
        out.verificacoes = out.verificacoes.filter(function (v) { return !/Solda (do pilar|das mesas|da alma)/.test(v.nome); });
        out.verificacoes.push(verifExtensao(nome, it.extensao, V, pb.dimensoes.t, aco, pb.dimensoes.B));
        out.verificacoes.push(juntaTopo(nome, it.extensao.b, Math.min(num(it.extensao.t, pb.dimensoes.t), pb.dimensoes.t), V, V * num(it.extensao.braco, 0.1), aco));
        if (it.patamarTopo) { var swP = soldaLongarina(Math.sqrt(V * V + H * H)); swP.v.nome = nome + " — solda da viga do patamar na chapa de extensão (filete " + swP.a + " mm no contorno)"; out.verificacoes.push(swP.v); }   /* viga horizontal: sem a chapa de ligação da longarina inclinada */
        else { var lt = ligacaoTopo(nome, V, H, lg, al, aco, fw); out.verificacoes = out.verificacoes.concat(lt.verificacoes); out.gusset = lt.gusset; }
      }
      out.desenho = { modo: modo, chapa: { B: pb.dimensoes.B, L: pb.dimensoes.L, t: pb.dimensoes.t }, chumbadores: pb.dimensoes.chumbadores, solda: pb.dimensoes.solda, graute: it.ponta === "topo" || it.patamarTopo ? 0 : 0.025, gusset: out.gusset || null };
      var rs = String(pb.resumo || "");
      /* REVISÃO S6 r3 (A1): o resumo diz a ligação que existe (o "pilar" do js/acoligcalc.js é a longarina ou o pé de apoio) */
      if (it.extensao) rs = rs.replace(/;\s*solda de filete [^;]*em volta do pilar/, "; chapa de extensão " + br(it.extensao.b, 0) + " × " + br(Math.min(num(it.extensao.t, pb.dimensoes.t), pb.dimensoes.t), 1) + " mm em junta de topo (penetração total) + chapa de ligação " + GUS.L + " × " + GUS.h + " × " + br(GUS.t, 1) + " mm na alma da longarina" + (out.gusset ? " (filetes " + out.gusset.a + " e " + out.gusset.a2 + " mm)" : "")).replace(/;\s*graute sem retração[^;]*/, "");
      else rs = rs.replace(/em volta do pilar/, modo === "pes" ? "em volta do pé de apoio" : "em volta da longarina");
      out.resumo = (modo === "pes" ? "base do pé de apoio: " : "ancorada: ") + rs;
      out.placa = { ok: pb.ok, razao: pb.razao };
      return out;
    }
    if (modo === "apoiada") {
      if (it.ponta === "topo") {
        /* PÉS DE APOIO no topo: um pilarete por longarina, do piso até a ponta da longarina, X entre eles acima de 1 m */
        var hP = Math.max(0.3, num(it.hPe, 1)), Np = V * 1.0 + 0.3, pr = pilarete(Np, hP, "ASTM A36");
        out.verificacoes.push({ nome: nome + " — pés de apoio", item: "", passos: [passo("Esforço no pé de apoio", "N = V da ponta + peso do pé (0,3 kN, a favor)", br(Np, 2) + " kN"), passo("Altura", "do piso à ponta da longarina; Kx = Ky = 1 (topo travado pela escada fixa no pé e pelo X entre os pés)", m2(hP))], razao: 0, ok: true, info: true });
        if (!pr.ok) { out.verificacoes.push(verif(nome + " — pé de apoio à compressão", "NBR 8800:2024 (expressão da 2008), 5.3", [passo("Sem pilarete que passe", "", pr.motivo)], 1, 2, "")); return out; }
        out.verificacoes = out.verificacoes.concat(pr.verificacoes.map(function (v) { return marcar(v, nome + " — pé de apoio " + pr.perfil + " — " + v.nome); }));
        var base = fixacao({ ponta: "topo", modo: "pes", pes: pr, R: { V: Np, H: 0, Nt: num(R.Nt, 0), hip: "base do pé de apoio: compressão e o levantamento do binário do guarda-corpo" }, concreto: it.concreto, P: it.Pbase, eixo: it.eixo, longarina: lg, alfa: it.alfa });
        out.verificacoes = out.verificacoes.concat(base.verificacoes.filter(function (v) { return !v.info; }));
        out.naoVerificados = out.naoVerificados.concat(base.naoVerificados); out.avisos = out.avisos.concat(base.avisos);
        out.avisos.push(nome + ": os pés de apoio só travam com a escada FIXA no pé (soldada, parafusada ou ancorada)" + (hP > 1 ? " e com o X entre eles" : ""));
        out.desenho = { modo: modo, pes: { perfil: pr.perfil, h: hP, b: pr.s.b, x: hP > 1.0 }, base: base.desenho, chapaTopo: { B: Math.ceil((pr.s.b + 40) / 10) * 10, t: 9.5 } };
        out.resumo = "apoiada em 2 pés de apoio " + pr.perfil + " de " + m2(hP) + (hP > 1 ? " com X entre eles" : "") + "; " + base.resumo;
        return out;
      }
      /* pé APOIADO: chapa de apoio sobre o piso, sem chumbador (a horizontal vai para o topo) — pressão e flexão da chapa */
      var cc2 = it.concreto || {}, fck2 = num(cc2.fck, 0) > 0 ? num(cc2.fck, 25) : 25, sig = C.concreto(fck2, 1), Bc = Math.ceil((bPeg + 100) / 10) * 10, Lc = Math.ceil((dPeg + 100) / 10) * 10, tc = null, ga1 = M && M.GAMA ? M.GAMA.a1 : 1.10;
      var sigSd = V * 1000 / (Bc * Lc), l = Math.max((Lc - 0.95 * dPeg) / 2, (Bc - 0.8 * bPeg) / 2), mSd = sigSd * l * l / 2;
      [9.5, 12.5, 16, 19].some(function (t) { if (t * t * aco.fy / 4 / ga1 >= mSd) { tc = t; return true; } return false; }); tc = tc || 19;
      out.verificacoes.push(verif(nome + " — pressão no piso sob a chapa de apoio", "NBR 8800:2024, 6.6 (σc,Rd = 0,85·fck/γc, A2/A1 = 1)", [passo("Chapa", "", br(Lc, 0) + " × " + br(Bc, 0) + " mm"), passo("σ", "V/(B·L)", br(sigSd, 2) + " MPa ≤ " + br(sig, 2) + " MPa")], sig, sigSd, "MPa"));
      out.verificacoes.push(verif(nome + " — chapa de apoio à flexão (t = " + br(tc, 1) + " mm)", "AISC Design Guide 1 (2ª ed.) — t²·fy/4 por mm, γa1", [passo("Balanço", "l", br(l, 0) + " mm"), passo("m", "σ·l²/2", br(mSd / 1000, 3) + " kN·m/m")], tc * tc * aco.fy / 4 / ga1 / 1000, mSd / 1000, "kN·m/m"));
      /* REVISÃO S6 (M1): a ponta APOIADA não pode levantar com o binário do guarda-corpo (só o permanente segura, γ = 1,0) */
      out.verificacoes.push(verif(nome + " — levantamento (binário do guarda-corpo × permanente)", "NBR 6120:2019, Tabela 12; NBR 8800:2024, Tabela 1 (permanente favorável γ = 1,0)", [passo("Tração do binário", "ΔV = H·h/(W + bf)", br(num(R.dV, 0), 2) + " kN"), passo("Permanente que segura", "Vg = g·Lh/2", br(num(R.Vg, 0), 2) + " kN")], num(R.Vg, 0), num(R.dV, 0), "kN"));
      out.avisos.push(nome + ": apoiada sem chumbador — a escada tem de ser FIXA no topo (a força horizontal vai toda para lá); o piso embaixo precisa resistir à pressão de contato");
      out.desenho = { modo: modo, chapa: { B: Bc, L: Lc, t: tc } };
      out.resumo = "apoiada: chapa de apoio " + br(Lc, 0) + " × " + br(Bc, 0) + " × " + br(tc, 1) + " mm (sem chumbador)";
      return out;
    }
    out.naoVerificados.push("não verificado: " + nome + " — fixação desconhecida (" + modo + ") (CRÍTICO)");
    return out;
  }

  /* ================================================================ 5b. A BASE DO MONTANTE DO GUARDA-CORPO (fixação "chapa chumbada")
   * sp = { perfil (montante), uso (NBR 6120, Tabela 12), espac (m), concreto: { esp, fck } } — a força horizontal f·s a 1,1 m
   * engasta o montante na placa: AcoLigCalc.placaBase ENGASTADA (M = 1,5·f·s·h, V = 1,5·f·s), e o concreto pelo
   * js/acoligfundacao.js quando a espessura é dada. A distância até a BORDA da laje (o guarda-corpo fica na borda) não é
   * conhecida aqui: o arrancamento na borda fica como verificação CRÍTICA não feita — nunca "aprovado" calado. */
  function baseMontante(sp) {
    sp = sp || {};
    var out = { verificacoes: [], naoVerificados: [], avisos: [], desenho: null, resumo: "" }, C = LC(), A = AC(), Cat0 = Cat(), M = Mat();
    var s = Cat0 && Cat0.completo ? Cat0.completo(sp.perfil) : null;
    if (!C || !s) { out.naoVerificados.push("não verificado: base do montante — perfil ou js/acoligcalc.js ausente (CRÍTICO)"); return out; }
    var fg = A && A.forcaGuarda ? A.forcaGuarda(sp.uso || "industrial") : { f: 2.0, altura: 1.1, ref: "NBR 6120:2019, Tabela 12" }, esp = num(sp.espac, 1), h = fg.altura || 1.1;
    var Fd = 1.5 * fg.f * esp, Md = Fd * h, D = s.D || s.b || s.d || 60, t = s.t || s.tw || 4;
    var aco = (M ? M.aco("ASTM A36") : null) || { fy: 250, fu: 400 }, cc = sp.concreto || {}, fck = num(cc.fck, 0) > 0 ? num(cc.fck, 25) : 25;
    var pb = C.placaBase({ tipo: "engastada", pilar: { d: D, bf: D, tw: t, tf: t }, aco: aco, chumbador: { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 }, concreto: { fck: fck, A2_A1: 1 }, esforcos: [{ comb: "ELU", N: 0, Vx: Fd, Vz: 0, M: Md }] });
    out.verificacoes.push({ nome: "Base do montante — esforços", item: fg.ref + "; γq = 1,50", passos: [passo("Força no topo", "F = 1,5·f·s", br(Fd, 2) + " kN (f = " + br(fg.f, 2) + " kN/m, s = " + m2(esp) + ")"), passo("Momento na base", "M = F·" + br(h, 2) + " m", br(Md, 3) + " kN·m")], razao: 0, ok: true, info: true });
    out.verificacoes = out.verificacoes.concat(arr(pb.verificacoes).map(function (v) { return marcar(v, "Base do montante — " + v.nome); }));
    if (num(cc.esp, 0) > 0 && LF()) {
      var Lfd = LF(), info = { id: "laje", rotulo: "Laje", tipo: "laje", cotaTopo: 0, altura: num(cc.esp, 0), poligonoTopo: [[-5, -5], [5, -5], [5, 5], [-5, 5]], fck: fck, fckInformado: num(cc.fck, 0) > 0, cobrimento: Lfd.COBRIMENTO };
      var rf = null; try { rf = Lfd.verificar(pb, info, { suporte: [[-5000, -5000], [5000, -5000], [5000, 5000], [-5000, 5000]], esforcos: [{ comb: "ELU", N: 0, Vx: Fd, Vz: 0, M: Md }] }); } catch (e) { rf = null; }
      if (rf) out.verificacoes = out.verificacoes.concat(arr(rf.verificacoes).slice(arr(pb.verificacoes).length).filter(function (v) { return /cabe|cone|gancho/i.test(v.nome); }).map(function (v) { return marcar(v, "Base do montante — " + v.nome + " (laje de " + cm(num(cc.esp, 0)) + ", longe da borda)"); }));
    }
    out.naoVerificados.push("não verificado: chumbadores do montante junto da BORDA da laje (ruptura da borda e cone recortado — a distância à borda não é conhecida; detalhar com a laje) (CRÍTICO)");
    out.desenho = { modo: "ancorada", chapa: { B: pb.dimensoes.B, L: pb.dimensoes.L, t: pb.dimensoes.t }, chumbadores: pb.dimensoes.chumbadores, solda: pb.dimensoes.solda, graute: 0 };
    out.resumo = "placa " + br(pb.dimensoes.L, 0) + " × " + br(pb.dimensoes.B, 0) + " × " + br(pb.dimensoes.t, 1) + " mm engastada, " + pb.dimensoes.chumbadores.n + " chumbadores " + pb.dimensoes.chumbadores.id;
    return out;
  }

  /* ================================================================ 6. O DESENHO DA FIXAÇÃO (dentro do gerador da escada)
   * chamado pelo js/metalprontas.js (escada reta/com patamares, longarina em perfil) com o construtor K:
   * o = { p (par), lances: [{ F, uA, uTop, nR, yC, pecas }], patamares: [{ F, cantos: [[u, w]], yB }], e, pp, W, bL, dL, al, gPiso, qPiso, gid }
   * → { itens (para o dimensionar do js/acoacessos.js), avisos, resumo } */
  /* a chapa horizontal de fixação (topo em yTop, espessura para baixo, no referencial F) com os furos e os
     chumbadores/parafusos do dimensionamento (dz = fixacao().desenho) — escada, pés de apoio, pilaretes do piso */
  function mm(v) { return v / 1000; }
  function furosChapa(dz, Lm, Bm) {
    var f = [];
    if (dz.chumbadores) { var ec = mm(num(dz.chumbadores.borda, 40)), nl = Math.max(2, num(dz.chumbadores.porLado, 2)); [ec, Lm - ec].forEach(function (u) { for (var k = 0; k < nl; k++) f.push({ u: u, v: ec + k * (Bm - 2 * ec) / (nl - 1), db: dz.chumbadores.d, tipo: "alargado" }); }); }
    else if (dz.parafusos && dz.parafusos.aoLongoW) { var e1w = mm(dz.parafusos.e1); if (dz.parafusos.n === 2) [e1w, Bm - e1w].forEach(function (v) { f.push({ u: Lm / 2, v: v, db: dz.parafusos.d, tipo: "padrao" }); }); else [e1w, Lm - e1w].forEach(function (u) { [e1w, Bm - e1w].forEach(function (v) { f.push({ u: u, v: v, db: dz.parafusos.d, tipo: "padrao" }); }); }); }
    else if (dz.parafusos) { var e1 = mm(dz.parafusos.e1); if (dz.parafusos.n === 2) [e1, Lm - e1].forEach(function (u) { f.push({ u: u, v: Bm / 2, db: dz.parafusos.d, tipo: "padrao" }); }); else [e1, Lm - e1].forEach(function (u) { [e1, Bm - e1].forEach(function (v) { f.push({ u: u, v: v, db: dz.parafusos.d, tipo: "padrao" }); }); }); }
    return f;
  }
  function chapaFixacao(K, F, uC, wC, yTop, dz, lig, nomeC, tSup, papel) {
    var B = BM(); if (!B || !dz || !dz.chapa) return null;
    var Lm = mm(dz.chapa.L), Bm = mm(dz.chapa.B), t = mm(dz.chapa.t), fs = furosChapa(dz, Lm, Bm), KK = K.F; K.F = F;
    var c = K.chapa({ origem: [uC - Lm / 2, yTop, wC - Bm / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: t, ret: { L: Lm, B: Bm }, furos: fs.map(function (f) { return { u: f.u, v: f.v, db: f.db, tipo: f.tipo }; }), papel: papel || (dz.chumbadores ? "Placa de base" : "Chapa de fixação"), aco: "ASTM A36", lig: lig, nome: nomeC }, "fixacao");
    fs.forEach(function (f, j) {
      var Pw = F.W([uC - Lm / 2 + f.u, yTop, wC - Bm / 2 + f.v]), q;
      if (dz.chumbadores) q = B.parafuso({ id: dz.chumbadores.id, aperto: t + num(dz.graute, 0.025), chumbador: { ancoragem: mm(num(dz.chumbadores.ancoragem, 300)) }, origem: Pw, eixo: [0, -1, 0], lig: lig, classe: "F1554-36" });
      else q = B.parafuso({ id: dz.parafusos.id, aperto: t + num(tSup, 0.0095), origem: Pw, eixo: [0, -1, 0], lig: lig, classe: dz.parafusos.classe || "8.8" });
      if (q && !q.erro) { q.metal.papel = dz.chumbadores ? "Chumbador" : "Parafuso da fixação"; K.nova(q, nomeC + " — " + (dz.chumbadores ? "chumbador " : "parafuso ") + (j + 1), "fixacao"); }
    });
    K.F = KK;
    return c;
  }
  var BR_X = "BR 5/8\" (D 15,88 mm) Gerdau";
  function concretoDe(p, ponta) {
    var ci = p[ponta === "topo" ? "concTopo" : "concPe"] || {}, esp = num(p[ponta === "topo" ? "concTopoEsp" : "concPeEsp"], 0), fck = num(p[ponta === "topo" ? "concTopoFck" : "concPeFck"], 0);
    var borda = num(p[ponta === "topo" ? "concTopoBorda" : "concPeBorda"], 0);
    return { esp: esp > 0 ? esp : num(ci.esp, 0), fck: fck > 0 ? fck : num(ci.fck, 0), poly: arr(ci.poly), furos: arr(ci.furos), borda: borda, id: ci.id || null, rotulo: ci.rotulo || (ponta === "topo" ? "Laje de chegada" : "Piso de concreto"), tipo: ci.tipo || "laje", topo: num(ci.topo, 0) };
  }
  function desenhar(K, Hh, o) {
    var p = o.p, B = BM(), out = { itens: [], avisos: [], resumo: [], criticos: [], naoVerificados: [] }; if (!B) return out;
    var Ls = arr(o.lances); if (!Ls.length) return out;
    var pl = Hh.perfilDe(p.longarina), lg = pl ? { d: pl.d * 1000, bf: pl.bf * 1000, tw: num(pl.tw, 0.005) * 1000, tf: num(pl.tf, 0.008) * 1000 } : { d: 200, bf: 57, tw: 5.6, tf: 9.9 };
    var al = o.al, ca = Math.cos(al), e = o.e, pp = o.pp, dL = o.dL, gid = o.gid;
    var modoPe = p.fixPe || "", modoTopo = p.fixTopo || "";
    /* REVISÃO S6 (Rogério, 14/10): com o PATAMAR DE TOPO da escada por linha a longarina chega no patamar (soldada na viga
       dele) e quem liga na peça da chegada é a borda do patamar (uT1) — mais abaixo, depois dos pilaretes */
    var patTopo = arr(o.patamares).filter(function (q) { return q.topo; })[0] || null;
    if (patTopo && p.patamarTopoFix) modoTopo = "soldada";
    function R(ponta, lance) { return reacoes({ e: e, p: pp, Lh: Math.max(pp, (lance.nR - 1) * pp), largura: o.W, gPiso: o.gPiso, perfil: p.longarina, q: o.qPiso, usoGuarda: p.usoGuarda, fixPe: modoPe, fixTopo: modoTopo })[ponta]; }
    function mm(v) { return v / 1000; }
    /* a placa sob a LONGARINA não é placa de base de pilar (o leitor do cálculo trata "Placa de base" como base de pilar) */
    function chapaFix(F, uC, wC, yTop, dz, lig, nomeC, papel) { return chapaFixacao(K, F, uC, wC, yTop, dz, lig, nomeC, o.tSup, papel || (dz && dz.chumbadores ? "Placa de fixação da escada (chumbada)" : "Chapa de fixação da escada")); }
    function soldar(pc, a, Lw, onde) { arr(pc).forEach(function (c) { if (c && c.metal) c.metal.solda = { tipo: "filete", perna: a, lados: "contorno", comprimento: r4(mm(Lw)), campo: true, em: onde }; }); }
    var la0 = Ls[0], laN = Ls[Ls.length - 1], wL = o.W / 2 + o.bL / 2, lados = [1, -1];
    var nomeLado = function (s2) { return s2 > 0 ? "esquerda" : "direita"; };
    /* ---- PÉ (1º lance) — REVISÃO S6 (C3): UM item por PLACA, no ponto da própria placa (sob cada longarina) */
    if (modoPe) {
      var Rp = R("pe", la0), cp = concretoDe(p, "pe"), eixoU = la0.F.D([1, 0, 0]), resPe = [];
      lados.forEach(function (s2, iS) {
        var itPe = { tipo: "fixacao", ponta: "pe", lado: nomeLado(s2), rotulo: "Pé da escada (longarina " + nomeLado(s2) + ") — " + (ROT[modoPe] || modoPe), modo: modoPe, R: Rp, longarina: lg, alfa: al / GRAU, concreto: cp, P: la0.F.W([la0.uA, 0, s2 * wL]), eixo: [eixoU[0], eixoU[2]], suporteT: num(p.supPeT, 0) };
        var fp = fixacao(itPe); out.itens.push(itPe); resPe.push(fp);
        if (modoPe === "soldada") soldar([la0.pecas[iS]], fp.desenho ? fp.desenho.solda : 5, fp.desenho ? fp.desenho.Lw : 0, "pé (no aço embaixo)");
        else if (fp.desenho) { chapaFix(la0.F, la0.uA, s2 * wL, 0, fp.desenho, "esc-pe-" + gid + (s2 > 0 ? "e" : "d"), "Fixação do pé — longarina " + nomeLado(s2)); if (modoPe !== "apoiada" && fp.desenho.solda) soldar([la0.pecas[iS]], fp.desenho.solda, 0, "pé (na placa)"); }
      });
      out.resumo.push("pé " + resPe[0].resumo);
    }
    /* ---- TOPO (último lance) — REVISÃO S6 (C3 + A1): a chapa de fixação INTEIRA sobre o apoio, recuada da borda; uma CHAPA DE
       EXTENSÃO soldada no topo da longarina leva a reação até ela (a excentricidade vira momento na placa); um item por placa */
    if (modoTopo) {
      var Rt = R("topo", laN), ct = concretoDe(p, "topo"), yT = laN.nR * e, eixoT = laN.F.D([1, 0, 0]), recuo = modoTopo === "ancorada" ? 0.05 : 0.03, u0 = laN.uTop + recuo, uLg = laN.uTop - 0.075, resT = [];
      var bExt = Math.ceil((lg.bf + 40) / 10) * 10;
      if (modoTopo === "apoiada") {
        var hPe = laN.yC + (e + e / pp * (laN.uTop - 0.08) - dL / (2 * ca)), dzT = null;
        lados.forEach(function (s2) {
          var uPg = laN.uTop - 0.0254 - 0.03;
          var itT = { tipo: "fixacao", ponta: "topo", lado: nomeLado(s2), rotulo: "Topo da escada (longarina " + nomeLado(s2) + ") — APOIADA", modo: "apoiada", R: Rt, longarina: lg, alfa: al / GRAU, concreto: concretoDe(p, "pe"), P: laN.F.W([uPg, -laN.yC, s2 * wL]), Pbase: laN.F.W([uPg, -laN.yC, s2 * wL]), eixo: [eixoT[0], eixoT[2]], hPe: r4(hPe) };
          var ft = fixacao(itT); out.itens.push(itT); resT.push(ft); if (!dzT) dzT = ft.desenho;
        });
        out.resumo.push("topo " + resT[0].resumo);
        if (dzT && dzT.pes) {
          /* o pé de apoio sobe até o EIXO da longarina (no cálculo, a ponta dele é um nó da longarina) */
          var pe = dzT.pes, bP = mm(pe.b), uP = laN.uTop - bP / 2 - 0.03, yB = e + e / pp * uP - dL / (2 * ca), KK = K.F; K.F = laN.F;
          lados.forEach(function (s2) {
            K.barra([uP, -laN.yC, s2 * wL], [uP, yB, s2 * wL], { ferr: "pilar", cat: pe.perfil, papel: "Pé de apoio da escada", ifc: "IFCCOLUMN", aco: "ASTM A36", nome: "Pé de apoio " + (s2 > 0 ? "esquerdo" : "direito") }, "pesApoio");
            K.chapa({ origem: [uP - mm(dzT.chapaTopo.B) / 2, yB - dL / (2 * ca), s2 * wL - mm(dzT.chapaTopo.B) / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: 0.0095, ret: { L: mm(dzT.chapaTopo.B), B: mm(dzT.chapaTopo.B) }, papel: "Chapa de topo do pé de apoio", aco: "ASTM A36", lig: "esc-pt-" + gid + (s2 > 0 ? "e" : "d"), nome: "Chapa de topo do pé de apoio " + (s2 > 0 ? "esquerdo" : "direito") }, "fixacao");
            if (dzT.base) chapaFix(laN.F, uP, s2 * wL, -laN.yC, dzT.base, "esc-pb-" + gid + (s2 > 0 ? "e" : "d"), "Base do pé de apoio " + (s2 > 0 ? "esquerdo" : "direito"), "Placa de base");
          });
          if (pe.x) [[1, -1], [-1, 1]].forEach(function (sg, j) { K.barra([uP, -laN.yC, sg[0] * wL], [uP, yB, sg[1] * wL], { ferr: "diagonal", cat: BR_X, papel: "Contraventamento dos pés de apoio", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "X dos pés de apoio " + (j + 1) }, "pesApoio"); });
          K.F = KK;
        }
      } else if (modoTopo === "soldada") {
        lados.forEach(function (s2, iS) {
          var itS = { tipo: "fixacao", ponta: "topo", lado: nomeLado(s2), rotulo: "Topo da escada (longarina " + nomeLado(s2) + ") — SOLDADA", modo: "soldada", R: Rt, longarina: lg, alfa: al / GRAU, P: laN.F.W([laN.uTop, yT, s2 * wL]), eixo: [eixoT[0], eixoT[2]] };
          var fs = fixacao(itS); out.itens.push(itS); resT.push(fs);
          soldar([laN.pecas[iS]], fs.desenho ? fs.desenho.solda : 5, fs.desenho ? fs.desenho.Lw : 0, "topo (no aço em cima)");
        });
        out.resumo.push("topo " + resT[0].resumo);
      } else {
        lados.forEach(function (s2) {
          /* 1ª passada: o tamanho da placa; 2ª: o momento da excentricidade com a placa real */
          var ctB = clone(ct); ctB.chegada = { P: laN.F.W([laN.uTop, yT, 0]), n: [eixoT[0], eixoT[2]] };   /* a borda de chegada: concreto só depois dela */
          var mk = function (Lm) { var uc = modoTopo === "parafusada" ? laN.uTop : u0 + Lm / 2, braco = uc - uLg; return { tipo: "fixacao", ponta: "topo", lado: nomeLado(s2), rotulo: "Topo da escada (longarina " + nomeLado(s2) + ") — " + (ROT[modoTopo] || modoTopo), modo: modoTopo, R: Rt, longarina: lg, alfa: al / GRAU, concreto: ctB, P: laN.F.W([uc, yT, s2 * wL]), eixo: [eixoT[0], eixoT[2]], suporteT: num(p.supTopoT, 0), M: modoTopo === "ancorada" ? r4(num(Rt.V, 0) * braco) : 0, braco: r4(braco), pilar: { d: 80, bf: bExt, tw: 9.5, tf: 9.5 }, extensao: { b: bExt, braco: r4(u0 - uLg) }, semViga: !!p.supTopoSemViga }; };
          var it1 = mk(0.38), f1 = fixacao(it1), L1 = f1.desenho && f1.desenho.chapa ? mm(f1.desenho.chapa.L) : 0.38, it2 = mk(L1);
          if (modoTopo === "parafusada") it2.extensao = null;   /* parafusada: a chapa já fica sobre a ponta da longarina */
          var f2 = fixacao(it2);
          out.itens.push(it2); resT.push(f2);
          if (f2.desenho && f2.desenho.chapa) {
            var Lm2 = mm(f2.desenho.chapa.L), tM = mm(f2.desenho.chapa.t), ucD = modoTopo === "parafusada" ? laN.uTop : u0 + Lm2 / 2;
            chapaFix(laN.F, ucD, s2 * wL, yT + tM, f2.desenho, "esc-tp-" + gid + (s2 > 0 ? "e" : "d"), "Fixação do topo — longarina " + nomeLado(s2));
            if (f2.desenho.gusset) { var KKg = K.F, tG = mm(f2.desenho.gusset.t), zAlma = o.W / 2; K.F = laN.F; K.chapa({ origem: [laN.uTop - mm(f2.desenho.gusset.L), yT - mm(f2.desenho.gusset.h), s2 > 0 ? zAlma - tG : -zAlma], ex: [1, 0, 0], ey: [0, 1, 0], t: mm(f2.desenho.gusset.t), ret: { L: mm(f2.desenho.gusset.L), B: mm(f2.desenho.gusset.h) }, papel: "Chapa de ligação da longarina (topo)", aco: "ASTM A36", lig: "esc-tp-" + gid + (s2 > 0 ? "e" : "d"), nome: "Chapa de ligação do topo — longarina " + nomeLado(s2) }, "fixacao"); K.F = KKg; }
            if (modoTopo === "ancorada") {
              var tE = mm(num(it2.extensao && it2.extensao.t, f2.desenho.chapa.t)), KK2 = K.F; K.F = laN.F;
              var bE = mm(num(it2.extensao && it2.extensao.b, bExt));
              K.chapa({ origem: [laN.uTop - 0.15, yT + tE, s2 * wL - bE / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: tE, ret: { L: r4(u0 - (laN.uTop - 0.15)), B: bE }, papel: "Chapa de extensão da longarina (topo)", aco: "ASTM A36", lig: "esc-tp-" + gid + (s2 > 0 ? "e" : "d"), nome: "Chapa de extensão do topo — longarina " + nomeLado(s2) }, "fixacao");
              K.F = KK2;
            }
          }
        });
        out.resumo.push("topo " + resT[0].resumo);
      }
    }
    /* ---- PILARETES DOS PATAMARES — REVISÃO S6 (M3): X nas faces e bases SEMPRE (o pilarete só é verificado travado se o X
       está desenhado), a força pela ENVOLTÓRIA da longarina (não a de ponta apoiada) e uma base por canto */
    var pr = Hh.perfilDe(p.pilarete), modoPil = modoPe === "soldada" || modoPe === "parafusada" ? modoPe : "pes";
    var Renv = reacoes({ e: e, p: pp, Lh: Math.max(pp, (la0.nR - 1) * pp), largura: o.W, gPiso: o.gPiso, perfil: p.longarina, q: o.qPiso, usoGuarda: p.usoGuarda }).pe;
    arr(o.patamares).forEach(function (pt, ip) {
      var Lp = num(pt.Lp, 0.8), wdA = 1.25 * o.gPiso + 1.5 * o.qPiso, N = wdA * Lp * o.W / 4 + num(Renv.V, 0), comX = pt.cantos.length === 4 && pt.yB > 0.15;
      /* o patamar de topo ligado na chegada: 2 pilaretes no lado da escada com X entre eles (o outro sentido trava pela ligação
         do patamar na peça da chegada); a força leva a metade do patamar + a longarina que chega */
      if (pt.topo && pt.cantos.length === 2 && pt.yB > 0.15) {
        comX = true; N = wdA * Lp * o.W / 4 + num(Renv.V, 0);
        var KKy = K.F, ca2 = pt.cantos; K.F = pt.F;
        K.barra([ca2[0][0], 0, ca2[0][1]], [ca2[1][0], pt.yB, ca2[1][1]], { ferr: "diagonal", cat: BR_X, papel: "Contraventamento do patamar", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "X do patamar de topo 1" }, "contravento");
        K.barra([ca2[1][0], 0, ca2[1][1]], [ca2[0][0], pt.yB, ca2[0][1]], { ferr: "diagonal", cat: BR_X, papel: "Contraventamento do patamar", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "X do patamar de topo 2" }, "contravento");
        K.F = KKy;
      } else if (comX) {
        var cs = pt.cantos.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), anel = [cs[0], cs[1], cs[3], cs[2]], KKx = K.F; K.F = pt.F;
        anel.forEach(function (a, ia) { var b = anel[(ia + 1) % 4]; K.barra([a[0], 0, a[1]], [b[0], pt.yB, b[1]], { ferr: "diagonal", cat: BR_X, papel: "Contraventamento do patamar", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "X do patamar " + (ip + 1) + "-" + (2 * ia + 1) }, "contravento"); K.barra([b[0], 0, b[1]], [a[0], pt.yB, a[1]], { ferr: "diagonal", cat: BR_X, papel: "Contraventamento do patamar", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "X do patamar " + (ip + 1) + "-" + (2 * ia + 2) }, "contravento"); });
        K.F = KKx;
      }
      out.itens.push({ tipo: "pilarete", perfil: p.pilarete, aco: p.aco, h: r4(pt.yB), N: r4(N), nome: "Pilarete do patamar " + (ip + 1) });
      if (!comX && pt.yB > 0.15) out.criticos.push("não verificado: travamento dos pilaretes do patamar " + (ip + 1) + " (sem X) — verificados com K = 1 (CRÍTICO)");
      var sP = pr ? { b: (pr.b || pr.bf || 0.076) * 1000, t: num(pr.t || pr.tw, 0.006) * 1000 } : { b: 76, t: 6 };
      pt.cantos.forEach(function (q, j) {
        var it = { tipo: "fixacao", ponta: "pe", modo: modoPil, pes: { s: { b: sP.b, t: sP.t } }, R: { V: N, H: 0.1 * N, hip: "base do pilarete do patamar: compressão + 10 % de horizontal (imperfeição, a favor)" }, longarina: { d: sP.b, bf: sP.b, tw: sP.t, tf: sP.t }, alfa: 90, concreto: concretoDe(p, "pe"), P: pt.F.W([q[0], 0, q[1]]), eixo: [1, 0] };
        it.rotulo = "Base do pilarete do patamar " + (ip + 1) + "-" + (j + 1) + " — " + (ROT[it.modo] || it.modo); it.nome = it.rotulo;
        var fr = fixacao(it); out.itens.push(it);
        if (fr.desenho && fr.desenho.chapa) chapaFix(pt.F, q[0], q[1], 0, fr.desenho, "esc-pp-" + gid + "-" + ip + "-" + j, "Base do pilarete do patamar " + (ip + 1) + "-" + (j + 1), fr.desenho.chumbadores ? "Placa de base" : null);
      });
    });
    /* ---- A BORDA DO PATAMAR DE TOPO NA PEÇA DA CHEGADA (a mais próxima: viga de borda do piso → parafusada; laje → ancorada) */
    if (patTopo && (p.patamarTopoFix === "parafusada" || p.patamarTopoFix === "ancorada")) {
      /* REVISÃO S6 (revisor, 14/10): por canto, a ÁREA DE INFLUÊNCIA de um quarto do patamar (4 cantos: 2 no lado da escada, 2 na
         borda); a horizontal = a da escada + a do GUARDA-CORPO do próprio patamar (1,5·f·Lpt/2 por canto, f da norma do uso) e o
         momento dele a h (1,10 m) vira binário entre as duas bordas: ΔV = Hg·h/W (tração e compressão) */
      var wdT = 1.25 * o.gPiso + 1.5 * o.qPiso, Lpt = num(patTopo.Lp, 0.8), RtP = R("topo", laN), mdT = p.patamarTopoFix, resB = [];
      var AA = AC(), fgP = AA && AA.forcaGuarda ? AA.forcaGuarda(p.usoGuarda || "industrial") : { f: 2.0, altura: 1.1, ref: "NBR 6120:2019, Tabela 12" };
      var Hesc = Math.abs(num(RtP.H, 0)), Hg = p.guarda !== "nenhum" ? 1.5 * num(fgP.f, 2.0) * Lpt / 2 : 0, hG = num(fgP.altura, 1.1), dVg = Hg * hG / o.W, Vgk = (o.gPiso * Lpt * o.W) / 4;
      var Vb = wdT * Lpt * o.W / 4 + dVg, Hb = Hesc + Hg, NtB = Math.max(0, dVg - Vgk);
      var eixoB = patTopo.F.D([1, 0, 0]), ctB = concretoDe(p, "topo"), pqT = Hh.perfilDe(p.patamarPerfil), lgP = pqT ? { d: pqT.d * 1000, bf: (pqT.bf || pqT.b || 0.075) * 1000, tw: num(pqT.tw || pqT.t, 0.006) * 1000, tf: num(pqT.tf || pqT.t, 0.008) * 1000 } : { d: 150, bf: 75, tw: 6, tf: 8 };
      /* ANCORADA: a placa INTEIRA dentro do concreto, recuada 5 cm da borda (o concreto só existe depois da borda de chegada) e
         a viga do patamar chega nela por uma chapa de extensão — a placa engastada com a excentricidade; desenho e cálculo no
         MESMO ponto (2 passadas: o tamanho da placa, depois o ponto dela) */
      var bExtP = Math.ceil((lgP.bf + 40) / 10) * 10, recB = 0.05;
      var mkB = function (s2, Lm) {
        var anc = mdT === "ancorada", ucB = anc ? patTopo.u1 + recB + Lm / 2 : patTopo.u1, bra = ucB - patTopo.u1, cB = JSON.parse(JSON.stringify(ctB));
        if (anc) cB.chegada = { P: patTopo.F.W([patTopo.u1, patTopo.yT, 0]), n: [eixoB[0], eixoB[2]] };
        return { tipo: "fixacao", ponta: "pe", patamarTopo: true, lado: nomeLado(s2), rotulo: "Patamar de topo na chegada (" + nomeLado(s2) + ") — " + (ROT[mdT] || mdT), modo: mdT,
          R: { V: r4(Vb), H: r4(Hb), Nt: r4(NtB), hip: "um quarto do patamar (" + br(Lpt, 2) + " × " + br(o.W, 2) + " m) por canto — a área de influência de cada um dos 4 cantos; H = a da escada (" + br(Hesc, 2) + " kN) + a do guarda-corpo do patamar 1,5·" + br(num(fgP.f, 2), 2) + "·" + br(Lpt, 2) + "/2 = " + br(Hg, 2) + " kN (" + fgP.ref + "); o momento dele a " + br(hG, 2) + " m vira ΔV = ±" + br(dVg, 2) + " kN entre as bordas" },
          longarina: lgP, alfa: 90, concreto: cB, P: patTopo.F.W([ucB, patTopo.yT, s2 * o.W / 2]), eixo: [eixoB[0], eixoB[2]], suporteT: num(p.supTopoT, 0), semViga: !!p.supTopoSemViga,
          M: anc ? r4(Vb * bra) : 0, braco: r4(bra), pilar: anc ? { d: 80, bf: bExtP, tw: 9.5, tf: 9.5 } : null, extensao: anc ? { b: bExtP, braco: r4(bra) } : null };
      };
      lados.forEach(function (s2) {
        var it1 = mkB(s2, 0.30), f1 = fixacao(it1), L1 = f1.desenho && f1.desenho.chapa ? mm(f1.desenho.chapa.L) : 0.30;
        var itB = mkB(s2, L1); if (!itB.pilar) delete itB.pilar; if (!itB.extensao) delete itB.extensao;
        var fb = fixacao(itB); out.itens.push(itB); resB.push(fb);
        if (fb.desenho && fb.desenho.chapa) {
          var LmB = mm(fb.desenho.chapa.L), ucD = mdT === "ancorada" ? patTopo.u1 + recB + LmB / 2 : patTopo.u1;
          chapaFix(patTopo.F, ucD, s2 * o.W / 2, patTopo.yT, fb.desenho, "esc-tp-pt" + gid + (s2 > 0 ? "e" : "d"), "Patamar de topo na chegada — " + nomeLado(s2));
          if (mdT === "ancorada") { var tEb = mm(num(itB.extensao && itB.extensao.t, fb.desenho.chapa.t)), bEb = mm(num(itB.extensao && itB.extensao.b, bExtP)), KKb = K.F; K.F = patTopo.F;
            K.chapa({ origem: [patTopo.u1 - 0.10, patTopo.yT + tEb, s2 * o.W / 2 - bEb / 2], ex: [1, 0, 0], ey: [0, 0, 1], t: tEb, ret: { L: r4(ucD - (patTopo.u1 - 0.10)), B: bEb }, papel: "Chapa de extensão do patamar de topo", aco: "ASTM A36", lig: "esc-tp-pt" + gid + (s2 > 0 ? "e" : "d"), nome: "Chapa de extensão do patamar de topo — " + nomeLado(s2) }, "fixacao"); K.F = KKb; }
        }
      });
      out.resumo.push("patamar de topo " + br(Lpt, 2) + " m ligado na chegada: " + (resB[0] ? resB[0].resumo : mdT));
    }
    if ((o.patamares && o.patamares.length) || modoTopo === "apoiada") out.naoVerificados.push("não verificado: as barras redondas do X (patamar/pés de apoio) — a tração delas sai na Estrutura desenhada");
    return out;
  }

  var MetalEscadaLinha = {
    NORMA_PADRAO: NORMA_PADRAO, PES: PES, ROT: ROT, desenhar: desenhar, concretoDe: concretoDe, chapaFixacao: chapaFixacao, BR_X: BR_X,
    hMaxDe: hMaxDe, lpDe: lpDe, candidatos: candidatos, ajustar: ajustar, linha: linha, giroDe: giroDe, projecaoDe: projecaoDe, topoDe: topoDe,
    elementos: elementos, elementoEm: elementoEm, maisProxima: maisProxima, cruzaBorda: cruzaBorda, elementoAcima: elementoAcima, elementoAbaixo: elementoAbaixo, alturas: alturas,
    abertura: abertura, uAlturaLivre: uAlturaLivre, ligacaoTopo: ligacaoTopo, juntaTopo: juntaTopo, recortarContorno: recortarContorno, baseMontante: baseMontante, clipConvexo: clipConvexo, plantaPronta: plantaPronta, hLivreDe: hLivreDe, reacoes: reacoes, pilarete: pilarete, fixacao: fixacao, fixacaoAuto: fixacaoAuto,
    _int: { dentro: dentro, areaPol: areaPol, distBorda: distBorda, aMundo: aMundo }
  };
  global.MetalEscadaLinha = MetalEscadaLinha;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalEscadaLinha;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

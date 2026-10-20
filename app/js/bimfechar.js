/* =====================================================================
 * bimfechar.js — PAREDES SEMPRE UNIDAS NOS CANTOS (motor PURO, ES5,
 * Node-testável: node tools/test-c487-uniao.js). 20/10/2026.
 *
 * Pedido do Rogério: "as paredes têm de ficar unidas no projeto; só quando
 * EU quiser a opção de ficar desunida."
 *
 * O DEFEITO (1.2.163, medido): a frente de um volume (3 paredes empilhadas na
 * mesma linha: mureta, viga, parede alta) foi girada/arrastada. A frente ficou
 * em diagonal e as laterais não acompanharam (uma parou ~4 cm antes do canto,
 * a outra passou ~9 cm): canto aberto, linhas cruzando, nada uniu.
 *   · o motor dos vínculos (js/bimvinculos.js) só tratava o MOVER; o GIRAR
 *     não levava as laterais, e a alça levava só a peça arrastada (as outras
 *     duas da pilha ficavam). Corrigido lá (pilhaDe + girar).
 *   · faltava o que NÃO depende do gesto: o encaixe ao soltar e o conserto.
 *
 * O QUE ESTÁ AQUI
 *   1) encaixar(estado, id, ponta, p, o) — AO SOLTAR a ponta de uma parede:
 *      se ela ficou a até `tol` (= max(meia espessura da outra + 1 cm, o raio
 *      do snap da tela)) de outra ponta ou da face/eixo de outra parede, vai
 *      para o ENCONTRO DOS EIXOS (L) ou para a FACE (T). Sem "quase encostada".
 *   2) propor(estado, o) — "Fechar cantos abertos": acha as pontas a até
 *      `dist` (0,30 m) do canto ideal que ainda não estão nele e devolve a
 *      lista (antes/depois) para mostrar; aplicar(estado, itens) → UM lote
 *      de `esticar` (um Ctrl+Z desfaz tudo).
 *
 * O QUE NUNCA É TOCADO (desunir é por comando explícito e é RESPEITADO)
 *   · parede com "Unir nos cantos" = Não (c.unir === false);
 *   · par com "Desunir geometria" (BimArq.geoUniao(...).unida === false);
 *   · ponta com o vínculo desligado (vinculoSolto);
 *   · parede fixada, curva, ou com linha de localização fora do eixo (a ponta
 *     dela se encontra pela SEÇÃO, não pelo eixo — não adivinhamos);
 *   · paredes que não se sobrepõem na altura (5 cm, como o BimArq.juntas).
 *
 * GEOMETRIA (a mesma do BimArq.juntas/js/bimuniao.js)
 *   L ... as duas pontas vão para o encontro dos EIXOS (X). O topo/meia-
 *         esquadria é do BimArq (derivado a cada replay, conforme o modo gravado).
 *   T ... a ponta que CHEGA vai até a FACE da que recebe (eixo ± meia espessura
 *         ÷ sen θ, medido ao longo do eixo da que chega).
 *   Abaixo de ~10° (sen < 0,17) não é canto: nada se faz.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SEN_MIN = 0.17;        /* ~10°: o mesmo limite do BimUniao.encontroL */
  var TOL_UNIAO = 0.01;      /* 1 cm além da meia espessura */
  var DIST_PADRAO = 0.30;    /* "Fechar cantos abertos": alcance */
  var JA_FECHADO = 0.0015;   /* a ponta já está no lugar (1,5 mm) */
  var RAIO_PX = 15;          /* o raio de snap da tela, em pixels */

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Arq() { return dep("BimArq", "./bimarq.js"); }
  function Prec() { return dep("BimPrecisao", "./bimprecisao.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function outra(k) { return k === "a" ? "b" : "a"; }
  function d2(p, q) { return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1])); }
  function br(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }

  /* a parede no plano: eixo a→b ([x, z]), espessura, faixa de altura. null se não serve */
  function quadro(c) {
    if (!c || c.tipo !== "parede" || c.id == null || c.arco) return null;
    var L = num(c.comprimento, 0), t = num(c.espessura, 0), th = num(c.rotY, 0), co = Math.cos(th), si = Math.sin(th);
    if (!(L > 0.01) || !(t > 0)) return null;
    var cx = num(c.cx, 0), cz = num(c.cz, 0), H = num(c.altura, 0);
    var a = [cx - co * L / 2, cz + si * L / 2], b = [cx + co * L / 2, cz - si * L / 2];
    return { id: String(c.id), el: c, a: a, b: b, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], L: L, t: t,
             y0: num(c.cy, 0) - H / 2, y1: num(c.cy, 0) + H / 2 };
  }
  function saida(A, k) { return k === "b" ? A.u : [-A.u[0], -A.u[1]]; }
  /* quem entra na conta: parede que une, sem linha de localização fora do eixo */
  function une(A) { return !!A && A.el.unir !== false && !A.el.linhaLoc; }
  function desunidas(A, B) {
    var BA = Arq(); if (!BA || !BA.geoUniao) return false;
    try { return BA.geoUniao(A.el, B.el).unida === false; } catch (e) { return false; }
  }
  function sobrepoeY(A, B) { return Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.05; }
  function soltoNaPonta(A, k) { return !!(A.el.vinculoSolto && A.el.vinculoSolto[k]); }

  /* o canto ideal da ponta kA de A em relação a B, com a ponta de A em E.
     → { p, tipo: "L"|"T", com, corr } ou null.
     dist = o alcance (m) da ponta de A até o canto ideal ao longo da própria A */
  function candidato(A, kA, E, B, dist) {
    var d = saida(A, kA), cr = d[0] * B.u[1] - d[1] * B.u[0], s = Math.abs(cr);
    if (!(s >= SEN_MIN)) return null;
    /* E + λ·d = Eb + μ·dB (λ medido a partir de E) */
    var rx = B.a[0] - E[0], ry = B.a[1] - E[1];
    var lam = (rx * B.u[1] - ry * B.u[0]) / cr, mu = (rx * d[1] - ry * d[0]) / cr;   /* mu: ao longo de B a partir de B.a */
    var X = [E[0] + lam * d[0], E[1] + lam * d[1]];
    var folgaA = A.t / 2 / s + TOL_UNIAO;           /* quanto de B pode "entrar" além da ponta e ainda ser canto */
    var muA = mu, muB = mu - B.L;                   /* X em relação às pontas de B: muA ≤ 0 = antes de B.a; muB ≥ 0 = depois de B.b */
    var melhor = null;
    function tenta(c) { if (!melhor || c.corr < melhor.corr - 1e-9) melhor = c; }
    /* L: X perto de UMA ponta de B (dentro da folga ou até `dist` fora); o T (menor correção) ganha se a ponta já está na face */
    var alem = Math.max(dist, folgaA);   /* a outra parede que PASSA do canto (até `alem`) também é canto: ela é que volta */
    var pertoA = muA >= -dist && muA <= alem, pertoB = muB <= dist && muB >= -alem;
    if ((pertoA || pertoB) && Math.abs(lam) <= dist) tenta({ p: X, tipo: "L", com: B.id, corr: Math.abs(lam) });
    /* T: X dentro do vão de B, longe das pontas dela */
    if (muA > folgaA && muB < -folgaA) {
      var lf = lam - B.t / 2 / s;                   /* a face de B do lado de A */
      if (Math.abs(lf) <= dist) tenta({ p: [E[0] + lf * d[0], E[1] + lf * d[1]], tipo: "T", com: B.id, corr: Math.abs(lf) });
    }
    return melhor;
  }

  function quadros(estado) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) { var q = quadro(c); if (q) out.push(q); });
    return out;
  }

  /* o melhor canto para a ponta kA de A em E (todas as outras paredes) */
  function melhorCanto(A, kA, E, W, dist, tolPor) {
    var m = null;
    W.forEach(function (B) {
      if (B === A || !une(B) || !sobrepoeY(A, B) || desunidas(A, B)) return;
      var alcance = typeof tolPor === "function" ? tolPor(B) : dist;
      var c = candidato(A, kA, E, B, alcance);
      if (c && (!m || c.corr < m.corr - 1e-9)) m = c;
    });
    return m;
  }

  /* ================================================================ 1) AO SOLTAR
   * a ponta `ponta` ("a"|"b") da parede `id` foi solta em p = {x, z}. → { x, z, tipo, com } (o ponto
   * encaixado) ou null (nada perto, ou a parede não se une). o.raio = o raio do snap da tela, em metros
   * (padrão ~15 px não é conhecido aqui: a tela passa). O alcance, por parede B, é
   * max(meia espessura de B + 1 cm, o.raio). */
  function encaixar(estado, id, ponta, p, o) {
    o = o || {};
    if (!p || !isFinite(p.x) || !isFinite(p.z) || (ponta !== "a" && ponta !== "b")) return null;
    var W = quadros(estado), A = null;
    W.forEach(function (q) { if (q.id === String(id)) A = q; });
    if (!A || !une(A) || A.el.fixo || soltoNaPonta(A, ponta)) return null;
    var raio = num(o.raio, 0.15);
    /* a ponta arrastada para p: a linha de A é a que passa pela outra ponta e por p (a direção nova) */
    var O = A[outra(ponta)], dx = p.x - O[0], dz = p.z - O[1], Ln = Math.sqrt(dx * dx + dz * dz);
    if (!(Ln > 0.01)) return null;
    var An = { id: A.id, el: A.el, a: ponta === "b" ? O : [p.x, p.z], b: ponta === "b" ? [p.x, p.z] : O, t: A.t, y0: A.y0, y1: A.y1, L: Ln };
    An.u = [(An.b[0] - An.a[0]) / Ln, (An.b[1] - An.a[1]) / Ln];
    var m = melhorCanto(An, ponta, [p.x, p.z], W, 0, function (B) { return Math.max(B.t / 2 + TOL_UNIAO, raio); });
    if (!m) return null;
    return { x: r4(m.p[0]), z: r4(m.p[1]), tipo: m.tipo, com: m.com, dist: d2([p.x, p.z], m.p) };
  }

  /* ================================================================ 2) CONSERTO
   * o.ids = só as paredes da seleção (as pontas DELAS; as outras servem de alvo); sem ids = o modelo todo.
   * o.dist = alcance (padrão 0,30 m). → { itens: [{ id, ponta, de:[x,z], para:[x,z], tipo, com, dist }], pulados: [{ id, motivo }] } */
  function propor(estado, o) {
    o = o || {};
    var dist = o.dist > 0 ? o.dist : DIST_PADRAO, W = quadros(estado), sel = null, itens = [], pulados = [];
    if (arr(o.ids).length) { sel = {}; o.ids.forEach(function (x) { sel[String(x)] = 1; }); }
    W.forEach(function (A) {
      if (sel && !sel[A.id]) return;
      if (A.el.unir === false) { pulados.push({ id: A.id, motivo: "Unir nos cantos = Não" }); return; }
      if (A.el.linhaLoc) { pulados.push({ id: A.id, motivo: "linha de localização fora do eixo" }); return; }
      ["a", "b"].forEach(function (k) {
        if (soltoNaPonta(A, k)) { pulados.push({ id: A.id, ponta: k, motivo: "ponta desunida de propósito" }); return; }
        var E = A[k], m = melhorCanto(A, k, E, W, dist);
        if (!m || m.corr < JA_FECHADO) return;
        if (A.el.fixo) { pulados.push({ id: A.id, ponta: k, motivo: "parede fixada" }); return; }
        itens.push({ id: A.id, ponta: k, de: [r4(E[0]), r4(E[1])], para: [r4(m.p[0]), r4(m.p[1])], tipo: m.tipo, com: m.com, dist: r4(m.corr) });
      });
    });
    return { itens: itens, pulados: pulados, dist: dist };
  }
  /* a lista para mostrar antes de aplicar (texto) */
  function descrever(estado, prop) {
    var nome = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) nome[String(c.id)] = (c.marca ? c.marca : (c.nome ? c.nome : "parede " + c.id)); });
    return arr(prop && prop.itens).map(function (it) {
      return (nome[it.id] || it.id) + " (ponta " + it.ponta.toUpperCase() + ") " + (it.tipo === "T" ? "até a face de " : "até o canto com ") + (nome[it.com] || it.com) + ": " + br(it.dist) + " m";
    });
  }
  /* UM lote de esticar (um Ctrl+Z desfaz tudo). A pilha (mureta/viga/alta na mesma linha) já entra pela própria lista,
     cada peça tem as suas pontas. → { op } | { erro } */
  function aplicar(estado, itens, o) {
    o = o || {};
    var P = Prec(), ops = [];
    arr(itens).forEach(function (it) {
      var c = arr(estado && estado.caixas).filter(function (x) { return String(x.id) === String(it.id); })[0];
      if (!c || c.fixo) return;
      if (P && P.esticarCaixa && !P.esticarCaixa(c, it.ponta, { x: it.para[0], z: it.para[1] })) return;
      ops.push({ op: "esticar", id: c.id, ponta: it.ponta, x: it.para[0], z: it.para[1] });
    });
    if (!ops.length) return { erro: "Nenhum canto aberto para fechar." };
    var id = typeof o.novoId === "function" ? o.novoId("l") : "l" + Date.now().toString(36);
    return { op: { op: "lote", id: id, origem: "modificar", pedido: "Fechar cantos abertos", ops: ops }, n: ops.length };
  }

  /* o raio do snap da tela (15 px) em metros, dado quantos metros valem `px` pixels */
  function raioEmMetros(mPorPx) { return Math.max(0.01, Math.min(1, num(mPorPx, 0) * RAIO_PX)); }

  var BimFechar = {
    DIST_PADRAO: DIST_PADRAO, RAIO_PX: RAIO_PX, JA_FECHADO: JA_FECHADO,
    quadro: quadro, candidato: candidato, encaixar: encaixar, propor: propor, descrever: descrever, aplicar: aplicar, raioEmMetros: raioEmMetros
  };
  global.BimFechar = BimFechar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFechar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

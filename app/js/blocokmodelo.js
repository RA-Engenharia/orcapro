/* =====================================================================
 * blocokmodelo.js — do MODELADOR para a obra do Blocok (motor PURO, ES5,
 * Node-testável). Recebe as paredes já em planta (eixo p1→p2, espessura,
 * altura, base, vãos) e devolve a `obra` que o js/blocokcalc.js calcula:
 * encontros (canto em L, T, ponta livre), quem atravessa em cada fiada,
 * fachada × interna, e as dimensões da edificação para o vento.
 *
 *   BlocokModelo.obra(paredes, opcoes) → { obra, avisos }
 *     paredes = [{ id, nome, p1:[x,z], p2:[x,z], t (m), H (m), y0 (m), esp (cm),
 *                  vaos:[{ id, tipo:'porta'|'janela', x0, x1, y0, y1 }]  (x a partir de p1) }]
 *     opcoes  = { laje:{tipo,g,q,vao}, cobertura:{...}, vento:{...}, solo:{...}, apoiaLaje:{id:bool} }
 *
 * POR QUE A GEOMETRIA E NÃO O REGISTRO DE UNIÃO DO MODELADOR: o registro
 * (c.uniao, js/bimarq.js) diz COMO a malha foi recortada, não qual PONTA faz
 * o L — e a regra da paginação precisa da ponta (a parede atravessa o canto
 * numa fiada e morre na face da outra na seguinte). Pela geometria das
 * pontas a resposta é direta e não depende do modo de junta escolhido.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.BlocokModelo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function len(a) { return Math.sqrt(dot(a, a)); }

  function eixo(p) {
    var d = sub(p.p2, p.p1), L = len(d) || 1e-9;
    return { L: L, u: [d[0] / L, d[1] / L] };
  }
  /* projeta o ponto E no eixo da parede B: along (0..L) e perp */
  function projetar(E, B) {
    var e = eixo(B), r = sub(E, B.p1);
    return { along: dot(r, e.u), perp: Math.abs(-r[0] * e.u[1] + r[1] * e.u[0]), L: e.L, u: e.u };
  }

  function obra(paredes, op) {
    op = op || {};
    var avisos = [], tol = num(op.tolerancia, 0.05);
    var P = (paredes || []).filter(function (p) { return p && p.p1 && p.p2 && len(sub(p.p2, p.p1)) > 0.1; });
    /* PONTAS NO CRUZAMENTO DOS EIXOS — o IFC (e a parede desenhada pela face)
       mede de face a face; o motor do Blocok pagina de EIXO a EIXO e soma
       ±espOutro/2 nos cantos. Sem levar cada ponta ao cruzamento dos eixos, a
       fiada que atravessa o canto passaria meia espessura além da parede real.
       Os vãos andam junto (x é medido a partir de p1). */
    P = P.map(function (p) { var q = {}; for (var k in p) q[k] = p[k]; q.p1 = p.p1.slice(); q.p2 = p.p2.slice(); q.vaos = (p.vaos || []).map(function (v) { var o = {}; for (var kk in v) o[kk] = v[kk]; return o; }); return q; });
    function cruzamento(A, B) {
      var a = eixo(A), b = eixo(B), den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
      if (Math.abs(den) < 1e-6) return null;
      var r = sub(B.p1, A.p1), tA = (r[0] * b.u[1] - r[1] * b.u[0]) / den;
      return [A.p1[0] + a.u[0] * tA, A.p1[1] + a.u[1] * tA];
    }
    P.forEach(function (A) {
      ["p1", "p2"].forEach(function (k) {
        var E = A[k], melhor = null, dMin = Infinity;
        P.forEach(function (B) {
          if (B === A) return;
          var pr = projetar(E, B), raio = Math.max(num(A.t), num(B.t)) / 2 + tol * 2;
          if (pr.perp > raio * 1.5 || pr.along < -raio || pr.along > pr.L + raio) return;
          if (Math.abs(dot(eixo(A).u, pr.u)) > 0.9) return;
          var X = cruzamento(A, B); if (!X) return;
          var d = len(sub(X, E)); if (d < dMin && d <= Math.max(num(A.t), num(B.t)) + tol) { dMin = d; melhor = X; }
        });
        if (melhor && dMin > 1e-4) {
          var u0 = eixo(A).u, desl = dot(sub(melhor, E), u0);
          A[k] = melhor;
          if (k === "p1") A.vaos.forEach(function (v) { v.x0 = num(v.x0) - desl; v.x1 = num(v.x1) - desl; });
        }
      });
    });
    var ext = { ini: {}, fim: {} }, tees = {};
    P.forEach(function (A) { tees[A.id] = []; });
    // pares de canto (L) já resolvidos: a 1ª da dupla atravessa nas fiadas pares
    P.forEach(function (A) {
      [["ini", A.p1], ["fim", A.p2]].forEach(function (k) {
        var lado = k[0], E = k[1], achou = null;
        P.forEach(function (B) {
          if (B === A || achou) return;
          var pr = projetar(E, B), raio = Math.max(num(A.t), num(B.t)) / 2 + tol;
          if (pr.perp > raio) return;
          var paralelo = Math.abs(dot(eixo(A).u, pr.u)) > 0.9;
          if (paralelo) return;                                    // continuação em linha: não é encontro
          if (pr.along < raio || pr.along > pr.L - raio) {
            // ponta com ponta → canto em L
            var ladoB = pr.along < pr.L / 2 ? "ini" : "fim";
            var primeiro = String(A.id) < String(B.id);
            achou = { tipo: "canto", espOutro: num(B.t), passaPar: primeiro ? 0 : 1, com: B.id, ladoB: ladoB };
          } else if (pr.along > raio && pr.along < pr.L - raio) {
            achou = { tipo: "T", espOutro: num(B.t), com: B.id };
            tees[B.id].push(r3(pr.along));
          }
        });
        ext[lado][A.id] = achou || { tipo: "livre" };
      });
    });
    // caixa da edificação (para o vento e para dizer quem é fachada)
    var xs = [], zs = [];
    P.forEach(function (p) { xs.push(p.p1[0], p.p2[0]); zs.push(p.p1[1], p.p2[1]); });
    var bb = xs.length ? { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) } : { x0: 0, x1: 0, z0: 0, z1: 0 };
    function fachada(p) {
      var t = num(p.t) / 2 + tol;
      var naX = function (x) { return Math.abs(p.p1[0] - x) <= t && Math.abs(p.p2[0] - x) <= t; };
      var naZ = function (z) { return Math.abs(p.p1[1] - z) <= t && Math.abs(p.p2[1] - z) <= t; };
      return naX(bb.x0) || naX(bb.x1) || naZ(bb.z0) || naZ(bb.z1);
    }
    var temLaje = op.laje && op.laje.tipo && op.laje.tipo !== "nenhuma";
    var H = 0;
    var obraP = P.map(function (p) {
      var e = eixo(p), externa = fachada(p);
      H = Math.max(H, num(p.H));
      var apoia = op.apoiaLaje && op.apoiaLaje[p.id] != null ? !!op.apoiaLaje[p.id] : (temLaje && externa);
      var apoiaCob = op.apoiaCobertura && op.apoiaCobertura[p.id] != null ? !!op.apoiaCobertura[p.id] : (!temLaje && externa);
      var vaos = (p.vaos || []).map(function (v) {
        return { id: v.id, tipo: v.tipo === "porta" ? "porta" : "janela", x: r3(num(v.x0)), y: r3(num(v.y0)), w: r3(num(v.x1) - num(v.x0)), h: r3(num(v.y1) - num(v.y0)) };
      });
      return {
        id: String(p.id), nome: p.nome || "", comprimento: r3(e.L), altura: r3(num(p.H)), espessura: num(p.esp, 15),
        externa: externa, face: externa ? "maior" : "interna", apoiaLaje: !!apoia, apoiaCobertura: !!apoiaCob,
        ini: ext.ini[p.id], fim: ext.fim[p.id], tees: tees[p.id].sort(function (a, b) { return a - b; }), vaos: vaos,
        /* parede que não recebe laje nem telhado, debaixo de laje, sobe depois da estrutura e é
           ENCUNHADA (SiNAT 019: ≥ 30 mm) — não leva cinta; sem laje, a cinta trava o topo */
        topo: p.topo ? (p.topo === "encunhamento" ? "encunhamento" : "cinta") : ((temLaje && !apoia && !apoiaCob) ? "encunhamento" : "cinta"), base: r3(num(p.y0)),
        planta: { p1: p.p1.slice(), p2: p.p2.slice() }
      };
    });
    // canto com as duas paredes atravessando na mesma fiada é erro de leitura: corrige a paridade
    obraP.forEach(function (w) {
      ["ini", "fim"].forEach(function (k) {
        var e = w[k]; if (e.tipo !== "canto") return;
        var o = obraP.filter(function (z) { return z.id === String(e.com); })[0]; if (!o) return;
        var eo = o[e.ladoB]; if (eo && eo.tipo === "canto" && eo.passaPar === e.passaPar) { eo.passaPar = 1 - e.passaPar; avisos.push("Canto " + w.id + "/" + o.id + ": paridade da amarração ajustada."); }
      });
    });
    // dono do pilar de canto: só uma das duas paredes soma o concreto
    obraP.forEach(function (w) {
      ["ini", "fim"].forEach(function (k) { var e = w[k]; if (e.tipo === "canto") e.dono = String(w.id) < String(e.com); });
    });
    var comp = r3(bb.x1 - bb.x0), larg = r3(bb.z1 - bb.z0);
    var ob = {
      nome: op.nome || "", cliente: op.cliente || "", local: op.local || "",
      edificacao: { comprimento: Math.max(comp, larg), largura: Math.min(comp, larg), altura: r3(H || 2.75), inclinacaoGraus: num(op.inclinacaoGraus, 17), areaPlanta: r3(comp * larg), lat: op.lat, lon: op.lon, local: op.local || "" },
      parametros: { vento: op.vento || {}, laje: op.laje || { tipo: "nenhuma" }, cobertura: op.cobertura || {}, solo: op.solo || {}, painel: op.painel || {} },
      paredes: obraP
    };
    if (!P.length) avisos.push("Nenhuma parede Blocok no modelo (escolha um tipo \"Blocok\" nas paredes).");
    return { obra: ob, avisos: avisos };
  }

  return { obra: obra, _projetar: projetar };
});

/* =====================================================================
 * bimprecisao.js — DESENHO DE PRECISÃO do modelador BIM (fase B3 do
 * PLANO-BIM-MODELADOR.md, 08/10/2026). Motor PURO, Node-testável.
 *
 * Pedido do Rogério: "modelador completo para obra pequena e média". Sem
 * precisão nenhuma ferramenta de modelar serve para obra: parede que não
 * fecha no canto, laje 3 cm fora do eixo, porta "mais ou menos" no meio do
 * vão — tudo isso vira orçamento errado. Este arquivo é a régua:
 *
 *   SNAPS ........ ponto final, meio, interseção, centro, perpendicular,
 *                  extensão alinhada, próximo (na aresta) e grade — com
 *                  PRIORIDADE explícita quando dois concorrem (ver `escolher`);
 *   DIGITAR ...... comprimento e ângulo durante o traço, ortogonal com Shift;
 *   COTAS ........ temporárias (distância aos vizinhos, editável: mudar a cota
 *                  move o objeto) e permanentes (op "cota", vão ao 3D e à planta);
 *   ALÇAS ........ esticar pontas de parede/viga e cantos de laje;
 *   TRANSFORMAR .. mover, copiar, espelhar, girar e matriz (linear e polar)
 *                  como OPS serializáveis — o replay do BimEdit reproduz e o
 *                  desfazer/refazer de sempre (Ctrl+Z/Ctrl+Y) volta.
 *   MODIFICAR (P4) alinhar, deslocamento, aparar/estender para canto e
 *                  vários, dividir elemento, fixar/desafixar, criar similar,
 *                  corresponder propriedades de tipo e escala (bloco "P4 —
 *                  MODIFICAR"; teste: node tools/test-p4-modificar.js).
 *
 * Tudo acontece no PLANO DA PLANTA (x, z do mundo, three.js Y-up), com a
 * mesma convenção de ângulo do BimEdit: ângulo = atan2(−dz, dx), o mesmo do
 * rotY das caixas. Assim o "30°" que o usuário digita é o 30° que a parede
 * recebe, sem conversão escondida no meio.
 *
 * O IFC importado NUNCA entra aqui: este motor só lê e escreve o estado da
 * edição (caixas, famílias, coberturas, cotas, anotações).
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function P(x, z) { return { x: x, z: z }; }
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* ângulo normalizado em (−π, π] — rotY gravado sempre no mesmo intervalo,
     senão duas paredes iguais saem com 3,14 e −3,14 e o teste de igualdade mente */
  function normAng(a) { var t = a % (2 * Math.PI); if (t <= -Math.PI) t += 2 * Math.PI; if (t > Math.PI) t -= 2 * Math.PI; return t; }
  function eixoU(r) { return { x: Math.cos(r), z: -Math.sin(r) }; }   /* eixo X local da caixa no plano */
  function eixoN(r) { return { x: Math.sin(r), z: Math.cos(r) }; }    /* eixo Z local (espessura) */
  function soma(c, v, k) { return P(c.x + v.x * k, c.z + v.z * k); }
  function dot(a, b) { return a.x * b.x + a.z * b.z; }

  /* --------------------------------------------------------- geometria 2D */
  /* projeção do ponto na reta AB: { t (0 = A, 1 = B), p, d (distância à reta) } */
  function projReta(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-12) return { t: 0, p: P(a.x, a.z), d: dist(p, a) };
    var t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2, q = P(a.x + dx * t, a.z + dz * t);
    return { t: t, p: q, d: dist(p, q) };
  }
  function distPontoSeg(p, a, b) {
    var pr = projReta(p, a, b);
    if (pr.t < 0) return dist(p, a);
    if (pr.t > 1) return dist(p, b);
    return pr.d;
  }
  /* cruzamento de dois SEGMENTOS (pontas incluídas). Paralelos → null. */
  function intersecaoSegs(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1z = a2.z - a1.z, d2x = b2.x - b1.x, d2z = b2.z - b1.z;
    var den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-10) return null;
    var rx = b1.x - a1.x, rz = b1.z - a1.z;
    var t = (rx * d2z - rz * d2x) / den, u = (rx * d1z - rz * d1x) / den;
    var e = 1e-9;
    if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
    return P(a1.x + d1x * t, a1.z + d1z * t);
  }
  /* cruzamento de duas RETAS (ponto + direção). Paralelas → null. */
  function intersecaoRetas(p1, d1, p2, d2) {
    var den = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(den) < 1e-10) return null;
    var rx = p2.x - p1.x, rz = p2.z - p1.z, t = (rx * d2.z - rz * d2.x) / den;
    return P(p1.x + d1.x * t, p1.z + d1.z * t);
  }
  /* raio (origem o, direção unitária d) contra segmento: distância ou −1 */
  function raioSeg(o, d, a, b) {
    var ex = b.x - a.x, ez = b.z - a.z, den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-10) return -1;
    var rx = a.x - o.x, rz = a.z - o.z;
    var t = (rx * ez - rz * ex) / den, u = (rx * d.z - rz * d.x) / den;
    if (u < -1e-9 || u > 1 + 1e-9 || t < 1e-6) return -1;
    return t;
  }

  /* ------------------------------------------------------- pegada (planta) */
  /* retângulo de centro c, eixos u/n e meias-medidas hL (ao longo de u) e hE */
  function retangulo(c, u, n, hL, hE) {
    return [soma(soma(c, u, -hL), n, -hE), soma(soma(c, u, hL), n, -hE), soma(soma(c, u, hL), n, hE), soma(soma(c, u, -hL), n, hE)];
  }
  function bordas(cantos, id, k, segs, pontos) {
    for (var i = 0; i < cantos.length; i++) {
      var a = cantos[i], b = cantos[(i + 1) % cantos.length];
      if (dist(a, b) < 1e-6) continue;
      segs.push({ a: a, b: b, id: id, k: k });
      pontos.push({ p: a, tipo: "fim", id: id });
      pontos.push({ p: P((a.x + b.x) / 2, (a.z + b.z) / 2), tipo: "meio", id: id });
    }
  }
  function ehCaixa(el) { return el && fin(el.cx) && fin(el.cz) && fin(el.comprimento) && fin(el.espessura); }
  /* O CONTORNO EM PLANTA de qualquer coisa do editor. Os objetos da B2
     (outra sessão) entram pelos ramos genéricos: caixa (cx, cz, comprimento,
     espessura, rotY), contorno/pontos (polígono) ou ponto (x, z). Assim o
     snap pega o que vier sem este arquivo precisar conhecer cada tipo. */
  function pegada(el, avaliar, comEixos) {
    if (!el || el.id == null) return null;
    var segs = [], pontos = [], cantos = [], id = el.id, rot = 0, c;
    if (el.planos && el.planos.length) {                               /* cobertura: os planos, com beiral */
      el.planos.forEach(function (p) {
        var u = eixoU(num(p.rotY, 0)), n = eixoN(num(p.rotY, 0));
        var q = retangulo(P(p.cx, p.cz), u, n, num(p.comprimento, 0) / 2, num(p.largura, 0) * Math.abs(Math.cos(num(p.rotX, 0))) / 2);
        bordas(q, id, "face", segs, pontos); cantos = cantos.concat(q);
      });
      rot = num(el.planos[0].rotY, 0);
      c = fin(el.x0) && fin(el.x1) ? P((el.x0 + el.x1) / 2, (el.z0 + el.z1) / 2) : media(cantos);
      pontos.push({ p: c, tipo: "centro", id: id });
      return { id: id, tipo: "cobertura", centro: c, rotY: rot, cantos: cantos, segs: segs, pontos: pontos };
    }
    if (ehCaixa(el)) {
      rot = num(el.rotY, 0); c = P(el.cx, el.cz);
      var u2 = eixoU(rot), n2 = eixoN(rot), hL = el.comprimento / 2, hE = el.espessura / 2;
      cantos = retangulo(c, u2, n2, hL, hE);
      bordas(cantos, id, "face", segs, pontos);
      if (el.tipo === "parede" || el.tipo === "viga") {
        /* a LINHA DE CENTRO da parede: pontas e meio são o que o cursor agarra primeiro */
        var e0 = soma(c, u2, -hL), e1 = soma(c, u2, hL);
        segs.push({ a: e0, b: e1, id: id, k: "eixo" });
        pontos.push({ p: e0, tipo: "fim", id: id, eixo: true }, { p: e1, tipo: "fim", id: id, eixo: true }, { p: c, tipo: "meio", id: id, eixo: true });
      } else pontos.push({ p: c, tipo: "centro", id: id });
      return { id: id, tipo: el.tipo || "caixa", centro: c, rotY: rot, cantos: cantos, segs: segs, pontos: pontos, hospedada: false };
    }
    if (comEixos && fin(el.x0) && fin(el.z0) && fin(el.x1) && fin(el.z1) && el.tipo == null && el.nome != null) {   /* P4: eixo da grade — só para Alinhar/Aparar (a linha de referência); o snap do desenho fica como na B3 */
      var g0 = P(el.x0, el.z0), g1 = P(el.x1, el.z1);
      if (dist(g0, g1) < 1e-6) return null;
      segs.push({ a: g0, b: g1, id: id, k: "eixo-grade" });
      pontos.push({ p: g0, tipo: "fim", id: id }, { p: g1, tipo: "fim", id: id }, { p: P((g0.x + g1.x) / 2, (g0.z + g1.z) / 2), tipo: "meio", id: id });
      return { id: id, tipo: "eixo", centro: P((g0.x + g1.x) / 2, (g0.z + g1.z) / 2), rotY: Math.atan2(-(g1.z - g0.z), g1.x - g0.x), cantos: [g0, g1], segs: segs, pontos: pontos };
    }
    if (fin(el.x) && fin(el.z) && el.famId) {                         /* família colocada */
      rot = num(el.rotY, 0); c = P(el.x, el.z);
      var av = typeof avaliar === "function" ? avaliar(el.famId, el.tipoId, el.inst) : null, b = av && av.caixa;
      if (b && fin(b.x0) && fin(b.x1) && fin(b.z0) && fin(b.z1)) {
        var u3 = eixoU(rot), n3 = eixoN(rot);
        /* local (x, z) da família → mundo: x·u + z·n (é o Euler(0, rotY) do famMalhas) */
        cantos = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(function (q) { return P(c.x + q[0] * u3.x + q[1] * n3.x, c.z + q[0] * u3.z + q[1] * n3.z); });
        bordas(cantos, id, "face", segs, pontos);
      } else cantos = [c];
      pontos.push({ p: c, tipo: "centro", id: id });
      return { id: id, tipo: "familia", centro: c, rotY: rot, cantos: cantos, segs: segs, pontos: pontos, hospedada: !!el.host };
    }
    var poli = el.contorno || el.pontos;
    if (Array.isArray(poli) && poli.length >= 2) {
      cantos = poli.map(function (q) { return Array.isArray(q) ? P(num(q[0], 0), num(q[1], 0)) : P(num(q.x, 0), num(q.z, 0)); });
      /* polígono fechado (laje por contorno) ou linha aberta (tubo, guarda-corpo) */
      if (el.fechado !== false && cantos.length >= 3) bordas(cantos, id, "face", segs, pontos);
      else {
        for (var i = 0; i + 1 < cantos.length; i++) {
          var a0 = cantos[i], a1 = cantos[i + 1]; if (dist(a0, a1) < 1e-6) continue;
          segs.push({ a: a0, b: a1, id: id, k: "face" });
          pontos.push({ p: P((a0.x + a1.x) / 2, (a0.z + a1.z) / 2), tipo: "meio", id: id });
        }
        cantos.forEach(function (q) { pontos.push({ p: q, tipo: "fim", id: id }); });
      }
      c = media(cantos); pontos.push({ p: c, tipo: "centro", id: id });
      return { id: id, tipo: el.tipo || "poligono", centro: c, rotY: num(el.rotY, 0), cantos: cantos, segs: segs, pontos: pontos };
    }
    if (fin(el.x) && fin(el.z)) { c = P(el.x, el.z); return { id: id, tipo: el.tipo || "ponto", centro: c, rotY: 0, cantos: [c], segs: [], pontos: [{ p: c, tipo: "centro", id: id }] }; }
    return null;
  }
  function media(pts) { var x = 0, z = 0; pts.forEach(function (p) { x += p.x; z += p.z; }); return pts.length ? P(x / pts.length, z / pts.length) : P(0, 0); }

  /* chaves do estado que NÃO são objetos com geometria (ou que já têm ramo próprio) */
  var CHAVES_FORA = { removidosIfc: 1, removidosIfcInfo: 1, invalidas: 1, orfas: 1, cotas: 1, anotacoes: 1 };
  /* toda a geometria de snap do estado da edição: { els, segs, pontos } */
  function geometria(estado, o) {
    o = o || {};
    var fora = {}, els = [], segs = [], pontos = [];
    (o.excluir || []).forEach(function (id) { fora[id] = 1; });
    Object.keys(estado || {}).forEach(function (k) {
      if (CHAVES_FORA[k] || !Array.isArray(estado[k])) return;
      estado[k].forEach(function (el) {
        if (!el || typeof el !== "object" || fora[el.id]) return;
        if (el.host && fora[el.host.id]) return;      /* a porta anda com a parede: não agarra nela mesma */
        var pg = pegada(el, o.avaliar, !!o.eixos); if (!pg) return;
        els.push(pg); segs = segs.concat(pg.segs); pontos = pontos.concat(pg.pontos);
      });
    });
    return { els: els, segs: segs, pontos: pontos };
  }

  /* ---------------------------------------------------------------- SNAP */
  var TIPOS = ["fim", "intersecao", "meio", "centro", "perpendicular", "extensao", "proximo", "grade"];
  /* ⚠ A PRIORIDADE QUANDO DOIS CONCORREM (é o que o pedido nomeia):
   *  1) CLASSE primeiro: ponto notável (fim, interseção, meio, centro) vence
   *     construção (perpendicular, cruzamento de duas extensões), que vence a
   *     extensão simples, que vence "próximo" (cair na aresta), que vence a
   *     grade. Um ponto de verdade a 20 cm nunca perde para uma linha de
   *     construção a 5 cm — é a regra do CAD, e é o que evita a parede que
   *     "quase" fecha no canto.
   *  2) Dentro da classe, o MAIS PERTO do cursor ganha — mas dois candidatos
   *     a menos de EMPATE × tolerância um do outro (em distância) são um
   *     empate, e aí vale a ordem de TIPOS: ponto final > interseção > meio >
   *     centro. Sem a janela de empate, um meio a 5,0 cm roubaria o canto a
   *     5,1 cm, e o usuário via o marcador pular entre os dois.
   * A trena do visualizador tem outra régua (pesos em pixel, js/bim.js
   * SNAP_PESO): ela mede malha de IFC; esta mede o que foi modelado aqui. */
  var CLASSE = { fim: 0, intersecao: 0, meio: 0, centro: 0, perpendicular: 1, extensao2: 1, extensao: 2, proximo: 3, grade: 4 };
  var ORDEM = { fim: 0, intersecao: 1, meio: 2, centro: 3, perpendicular: 4, extensao2: 5, extensao: 6, proximo: 7, grade: 8 };
  var EMPATE = 0.3;
  function escolher(cands, tol) {
    if (!cands || !cands.length) return null;
    var melhorClasse = Infinity;
    cands.forEach(function (c) { var k = CLASSE[c.sub || c.tipo]; if (k < melhorClasse) melhorClasse = k; });
    var daClasse = cands.filter(function (c) { return CLASSE[c.sub || c.tipo] === melhorClasse; });
    var dMin = Infinity; daClasse.forEach(function (c) { if (c.d < dMin) dMin = c.d; });
    var janela = EMPATE * num(tol, 0.25);
    var eleg = daClasse.filter(function (c) { return c.d <= dMin + janela + 1e-12; });
    /* no mesmo tipo, a LINHA DE CENTRO da parede/viga vence o canto da face (7,5 cm ao lado):
       quem continua uma parede quer o eixo dela */
    eleg.sort(function (a, b) { return (ORDEM[a.sub || a.tipo] - ORDEM[b.sub || b.tipo]) || ((b.eixo ? 1 : 0) - (a.eixo ? 1 : 0)) || (a.d - b.d); });
    return eleg[0];
  }
  var PADRAO = { fim: true, intersecao: true, meio: true, centro: true, perpendicular: true, extensao: true, proximo: true, grade: true };
  /* cur = {x, z} do cursor no plano; geo = geometria(); o = { tol (m), tipos,
     ref (1º ponto do traço: perpendicular e alinhamento), grade (passo m),
     origemGrade, alcance (m, das linhas de extensão), on }.
     Devolve { p, tipo, d, guias:[{a,b}], seg } ou null. */
  function snap(cur, geo, o) {
    o = o || {};
    if (o.on === false || !cur || !fin(cur.x) || !fin(cur.z)) return null;
    var tol = num(o.tol, 0.25), ti = o.tipos || PADRAO, cands = [], alcance = num(o.alcance, 30);
    geo = geo || { segs: [], pontos: [] };
    function add(p, tipo, ex) {
      var d = dist(p, cur); if (d > tol) return;
      var c = { p: P(r4(p.x), r4(p.z)), tipo: tipo, d: d };
      if (ex) Object.keys(ex).forEach(function (k) { c[k] = ex[k]; });
      cands.push(c);
    }
    geo.pontos.forEach(function (pt) { if (ti[pt.tipo]) add(pt.p, pt.tipo, pt.eixo ? { id: pt.id, eixo: true } : { id: pt.id }); });
    var perto = geo.segs.filter(function (s) { return distPontoSeg(cur, s.a, s.b) <= tol; });
    if (ti.intersecao) {
      for (var i = 0; i < perto.length; i++) for (var j = i + 1; j < perto.length; j++) {
        if (perto[i].id === perto[j].id) continue;   /* cruzamento dentro da MESMA peça é canto dela: já é "fim" */
        var x = intersecaoSegs(perto[i].a, perto[i].b, perto[j].a, perto[j].b);
        if (x) add(x, "intersecao", { segs: [perto[i], perto[j]] });
      }
    }
    if (ti.perpendicular && o.ref && fin(o.ref.x)) {
      geo.segs.forEach(function (s) {
        var pr = projReta(o.ref, s.a, s.b);
        if (pr.t < -1e-9 || pr.t > 1 + 1e-9 || pr.d < 1e-4) return;
        add(pr.p, "perpendicular", { seg: s, guias: [{ a: P(o.ref.x, o.ref.z), b: pr.p }] });
      });
    }
    if (ti.extensao) {
      /* linhas de construção: o prolongamento de cada aresta ALÉM das pontas e
         as linhas X/Z que passam pelas pontas (e pelo 1º ponto do traço) —
         o "alinhar com aquela parede" */
      var linhas = [];
      geo.segs.forEach(function (s) {
        var pr = projReta(cur, s.a, s.b); if (pr.d > tol || (pr.t >= 0 && pr.t <= 1)) return;
        var ponta = pr.t < 0 ? s.a : s.b; if (dist(ponta, pr.p) > alcance) return;
        var L = dist(s.a, s.b); if (L < 0.05) return;
        linhas.push({ o: ponta, d: P((s.b.x - s.a.x) / L, (s.b.z - s.a.z) / L), foot: pr.p, dd: pr.d });
      });
      var refs = geo.pontos.filter(function (pt) { return pt.tipo === "fim"; }).map(function (pt) { return pt.p; });
      if (o.ref && fin(o.ref.x)) refs.push(P(o.ref.x, o.ref.z));
      /* ⚠ a linha X/Z de uma ponta pode ser a PRÓPRIA aresta (a face de uma
         parede reta corre em X): com o cursor em cima dela isso é "próximo",
         não alinhamento — senão a extensão roubava todo clique na aresta. */
      function sobreAresta(foot, d) {
        return perto.some(function (s) { var L = dist(s.a, s.b); if (L < 1e-9) return false; var cr = Math.abs(((s.b.x - s.a.x) * d.z - (s.b.z - s.a.z) * d.x) / L); return cr < 1e-6 && distPontoSeg(foot, s.a, s.b) < 1e-6; });
      }
      refs.forEach(function (q) {
        if (dist(q, cur) > alcance || dist(q, cur) <= tol) return;
        if (Math.abs(cur.z - q.z) <= tol && !sobreAresta(P(cur.x, q.z), P(1, 0))) linhas.push({ o: q, d: P(1, 0), foot: P(cur.x, q.z), dd: Math.abs(cur.z - q.z) });
        if (Math.abs(cur.x - q.x) <= tol && !sobreAresta(P(q.x, cur.z), P(0, 1))) linhas.push({ o: q, d: P(0, 1), foot: P(q.x, cur.z), dd: Math.abs(cur.x - q.x) });
      });
      linhas.forEach(function (l) { add(l.foot, "extensao", { guias: [{ a: l.o, b: l.foot }] }); });
      /* duas linhas de construção que se cruzam perto do cursor: o cruzamento vale mais */
      for (var a = 0; a < linhas.length; a++) for (var b = a + 1; b < linhas.length && b < 40; b++) {
        var xi = intersecaoRetas(linhas[a].o, linhas[a].d, linhas[b].o, linhas[b].d); if (!xi) continue;
        add(xi, "extensao", { sub: "extensao2", guias: [{ a: linhas[a].o, b: xi }, { a: linhas[b].o, b: xi }] });
      }
    }
    if (ti.proximo) perto.forEach(function (s) { var pr = projReta(cur, s.a, s.b); var t = Math.max(0, Math.min(1, pr.t)); add(P(s.a.x + (s.b.x - s.a.x) * t, s.a.z + (s.b.z - s.a.z) * t), "proximo", { seg: s }); });
    var best = escolher(cands, tol);
    if (best) return best;
    var g = num(o.grade, 0);
    if (ti.grade && g > 0) {
      var og = o.origemGrade || P(0, 0);
      var gp = P(og.x + Math.round((cur.x - og.x) / g) * g, og.z + Math.round((cur.z - og.z) / g) * g);
      return { p: P(r4(gp.x), r4(gp.z)), tipo: "grade", d: dist(gp, cur) };
    }
    return null;
  }

  /* ------------------------------------------------ digitar e ortogonal */
  /* "2,5" · "2.5" · "250 cm" · "2500mm" · "2,5 m" → metros (null se não for número) */
  function lerNumero(s) {
    var t = String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
    var m = /^(-?\d+(?:[.,]\d+)?)(mm|cm|m)?$/.exec(t); if (!m) return null;
    var v = parseFloat(m[1].replace(",", ".")); if (!isFinite(v)) return null;
    return m[2] === "cm" ? v / 100 : m[2] === "mm" ? v / 1000 : v;
  }
  function lerAngulo(s) {
    var t = String(s == null ? "" : s).trim().replace(/[°º\s]/g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    var v = parseFloat(t); return isFinite(v) ? v : null;
  }
  /* "4x3" · "4 × 3" · "4;3" (retângulo de laje/cobertura) */
  function lerRetangulo(s) {
    var p = String(s == null ? "" : s).toLowerCase().split(/[x×;*]/);
    if (p.length !== 2) return null;
    var a = lerNumero(p[0]), b = lerNumero(p[1]);
    return a > 0 && b > 0 ? { a: a, b: b } : null;
  }
  function distAng(p1, p) {
    var dx = p.x - p1.x, dz = p.z - p1.z, g = Math.atan2(-dz, dx) * 180 / Math.PI;
    if (g < 0) g += 360;
    return { dist: Math.sqrt(dx * dx + dz * dz), graus: Math.abs(g - 360) < 1e-9 ? 0 : g };
  }
  function pontoPor(p1, d, graus) { var a = graus * Math.PI / 180; return P(p1.x + d * Math.cos(a), p1.z - d * Math.sin(a)); }
  /* Shift: o eixo DOMINANTE (X ou Z), como no CAD */
  function orto(p1, p) { return Math.abs(p.x - p1.x) >= Math.abs(p.z - p1.z) ? P(p.x, p1.z) : P(p1.x, p.z); }
  function fmtM(v, casas) { return (Math.round(v * 100) / 100).toFixed(casas == null ? 2 : casas).replace(".", ","); }

  /* ------------------------------------------------------- TRANSFORMAR */
  /* T = { tipo:'mover', dx, dz } | { tipo:'girar', cx, cz, graus } |
         { tipo:'espelhar', ax, az, bx, bz }. Ângulo na convenção do rotY. */
  function validaT(T) {
    if (!T || typeof T !== "object") return false;
    if (T.tipo === "mover") return fin(T.dx) && fin(T.dz);
    if (T.tipo === "girar") return fin(T.cx) && fin(T.cz) && fin(T.graus);
    if (T.tipo === "espelhar") return fin(T.ax) && fin(T.az) && fin(T.bx) && fin(T.bz) && (Math.abs(T.bx - T.ax) + Math.abs(T.bz - T.az)) > 1e-6;
    return false;
  }
  function phiEspelho(T) { return Math.atan2(-(T.bz - T.az), T.bx - T.ax); }
  function ponto(p, T) {
    if (T.tipo === "mover") return P(p.x + T.dx, p.z + T.dz);
    if (T.tipo === "girar") {
      /* (u, w) = (x, −z) relativos ao centro: aí o giro é o de sempre, no sentido do rotY */
      var th = T.graus * Math.PI / 180, u = p.x - T.cx, w = -(p.z - T.cz), c = Math.cos(th), s = Math.sin(th);
      return P(T.cx + (u * c - w * s), T.cz - (u * s + w * c));
    }
    var ph = phiEspelho(T), dx = Math.cos(ph), dw = Math.sin(ph), u2 = p.x - T.ax, w2 = -(p.z - T.az), k = 2 * (u2 * dx + w2 * dw);
    return P(T.ax + (k * dx - u2), T.az - (k * dw - w2));
  }
  function angulo(r, T) {
    if (T.tipo === "girar") return normAng(r + T.graus * Math.PI / 180);
    if (T.tipo === "espelhar") return normAng(2 * phiEspelho(T) - r);
    return r;
  }
  /* quanto um eixo do mundo gira com T (para a caixa envolvente da cobertura) */
  function giroDe(T) { return T.tipo === "girar" ? T.graus * Math.PI / 180 : T.tipo === "espelhar" ? 2 * phiEspelho(T) : 0; }
  function rp(p) { return P(r4(p.x), r4(p.z)); }
  /* um elemento transformado (CÓPIA; o original não muda). k = 'caixa' |
     'cobertura' | 'familia' | 'cota' | 'anotacao' */
  function transformarEl(k, el, T) {
    var o = clone(el), q;
    if (k === "caixa") {
      q = rp(ponto(P(el.cx, el.cz), T)); o.cx = q.x; o.cz = q.z; o.rotY = r4(angulo(num(el.rotY, 0), T));
      if (el.arco && el.arco.m) { var qm = ponto(P(el.arco.m.x, el.arco.m.z), T); o.arco = { m: { x: Math.round(qm.x * 1e6) / 1e6, z: Math.round(qm.z * 1e6) / 1e6 } }; }   /* CURVA: o meio do arco vai junto */
    }
    else if (k === "cobertura") {
      o.planos = (el.planos || []).map(function (p) {
        var pp = clone(p), c = rp(ponto(P(p.cx, p.cz), T));
        pp.cx = c.x; pp.cz = c.z; pp.rotY = r4(angulo(num(p.rotY, 0), T));
        /* espelho vira a água: a caixa inclinada refletida é a mesma caixa com o caimento trocado */
        if (T.tipo === "espelhar") pp.rotX = r4(-num(p.rotX, 0));
        return pp;
      });
      var mid = rp(ponto(P((el.x0 + el.x1) / 2, (el.z0 + el.z1) / 2), T)), g = giroDe(T), cg = Math.abs(Math.cos(g)), sg = Math.abs(Math.sin(g));
      var hx = (el.x1 - el.x0) / 2, hz = (el.z1 - el.z0) / 2, nhx = cg * hx + sg * hz, nhz = sg * hx + cg * hz;
      o.x0 = r4(mid.x - nhx); o.x1 = r4(mid.x + nhx); o.z0 = r4(mid.z - nhz); o.z1 = r4(mid.z + nhz);
      if (sg > 0.7071 && (el.eixo === "x" || el.eixo === "z")) o.eixo = el.eixo === "x" ? "z" : "x";
    } else if (k === "familia") { q = rp(ponto(P(el.x, el.z), T)); o.x = q.x; o.z = q.z; o.rotY = r4(angulo(num(el.rotY, 0), T)); }
    else if (k === "cota") {
      var a = rp(ponto(P(el.a.x, el.a.z), T)), b = rp(ponto(P(el.b.x, el.b.z), T));
      o.a.x = a.x; o.a.z = a.z; o.b.x = b.x; o.b.z = b.z;
      if (T.tipo === "espelhar") o.off = r4(-num(el.off, 0));   /* o lado da linha de cota também reflete */
    } else if (k === "anotacao") { q = rp(ponto(P(el.x, el.z), T)); o.x = q.x; o.z = q.z; }
    return o;
  }

  /* ------------------------------------------------- ALÇAS e ESTICAR */
  function alcas(el) {
    if (!ehCaixa(el)) return [];
    var r = num(el.rotY, 0), u = eixoU(r), n = eixoN(r), c = P(el.cx, el.cz);
    if (el.tipo === "parede" || el.tipo === "viga") return [{ k: "a", p: rp(soma(c, u, -el.comprimento / 2)) }, { k: "b", p: rp(soma(c, u, el.comprimento / 2)) }];
    if (el.tipo === "laje") return retangulo(c, u, n, el.comprimento / 2, el.espessura / 2).map(function (p, i) { return { k: i, p: rp(p) }; });
    return [];
  }
  /* a caixa com uma ponta (parede/viga: 'a'|'b') ou canto (laje: 0..3) levada a p.
     Tudo o que não é geometria (serviços do orçamento, tipo, rótulos) fica. */
  function esticarCaixa(el, ponta, p, BE) {
    if (!ehCaixa(el) || !p || !fin(p.x) || !fin(p.z)) return null;
    var r = num(el.rotY, 0), u = eixoU(r), n = eixoN(r), c = P(el.cx, el.cz), novo = null;
    if (el.tipo === "parede" || el.tipo === "viga") {
      if (ponta !== "a" && ponta !== "b") return null;
      var e0 = soma(c, u, -el.comprimento / 2), e1 = soma(c, u, el.comprimento / 2);
      if (ponta === "a") e0 = p; else e1 = p;
      novo = el.tipo === "parede" ? BE.parede(e0, e1, el.espessura, el.altura, el.cy - el.altura / 2)
                                  : BE.viga(e0, e1, el.espessura, el.altura, el.cy + el.altura / 2);
    } else if (el.tipo === "laje") {
      var k = Number(ponta); if (!(k >= 0 && k <= 3) || k !== Math.floor(k)) return null;
      var cs = retangulo(c, u, n, el.comprimento / 2, el.espessura / 2), op = cs[(k + 2) % 4];
      /* no sistema LOCAL da laje (que pode estar girada): oposto fixo, canto no ponto */
      var lp = { u: dot(P(p.x - c.x, p.z - c.z), u), n: dot(P(p.x - c.x, p.z - c.z), n) }, lo = { u: dot(P(op.x - c.x, op.z - c.z), u), n: dot(P(op.x - c.x, op.z - c.z), n) };
      var L = Math.abs(lp.u - lo.u), E = Math.abs(lp.n - lo.n);
      if (!(L > 0.05) || !(E > 0.05)) return null;
      var cm = soma(soma(c, u, (lp.u + lo.u) / 2), n, (lp.n + lo.n) / 2);
      novo = { cx: r4(cm.x), cz: r4(cm.z), cy: el.cy, comprimento: r4(L), espessura: r4(E), altura: el.altura, rotY: el.rotY, area: r4(L * E), volume: r4(L * E * el.altura) };
    }
    if (!novo) return null;
    var o = clone(el);
    ["cx", "cy", "cz", "comprimento", "altura", "espessura", "rotY", "area", "volume", "comprimentoViga"].forEach(function (f) { if (novo[f] != null) o[f] = novo[f]; });
    return o;
  }

  /* --------------------------------------------- COTAS TEMPORÁRIAS */
  /* o centro que a op "mover" do BimEdit usa para cada tipo */
  function centroDe(el) {
    if (!el) return null;
    if (el.planos) return P((el.x0 + el.x1) / 2, (el.z0 + el.z1) / 2);
    if (ehCaixa(el)) return P(el.cx, el.cz);
    if (fin(el.x) && fin(el.z)) return P(el.x, el.z);
    return null;
  }
  function acharNoEstado(estado, id) {
    var ks = ["caixas", "familias", "coberturas"];
    for (var i = 0; i < ks.length; i++) { var l = (estado && estado[ks[i]]) || []; for (var j = 0; j < l.length; j++) if (l[j] && l[j].id === id) return l[j]; }
    return null;
  }
  /* distâncias LIVRES (face a face) até o vizinho mais perto em cada lado do
     eixo da peça — o que o pedreiro mede na obra. Parede e viga ganham ainda
     o próprio comprimento (editável = esticar a ponta 'b'). Porta e janela
     (hospedadas) medem só AO LONGO da parede: até as pontas dela. */
  function cotasTemporarias(estado, id, o) {
    o = o || {};
    var el = acharNoEstado(estado, id); if (!el) return [];
    var geo = geometria(estado, { avaliar: o.avaliar }), pg = null, alc = num(o.alcance, 50);
    geo.els.forEach(function (g) { if (g.id === id) pg = g; });
    if (!pg) return [];
    var u = eixoU(pg.rotY), n = eixoN(pg.rotY), c = pg.centro, out = [];
    var ext = { up: 0, un: 0, np: 0, nn: 0 };
    pg.cantos.forEach(function (q) { var v = P(q.x - c.x, q.z - c.z), a = dot(v, u), b = dot(v, n); if (a > ext.up) ext.up = a; if (-a > ext.un) ext.un = -a; if (b > ext.np) ext.np = b; if (-b > ext.nn) ext.nn = -b; });
    var dirs = [{ k: "u+", d: u, e: ext.up }, { k: "u-", d: P(-u.x, -u.z), e: ext.un }, { k: "n+", d: n, e: ext.np }, { k: "n-", d: P(-n.x, -n.z), e: ext.nn }];
    if (pg.hospedada) dirs = dirs.slice(0, 2);
    var alvos = geo.segs.filter(function (s) { return s.id !== id && s.k !== "eixo" && !(el.host == null && s.id != null && acharHospedada(estado, s.id, id)); });
    dirs.forEach(function (dd) {
      var o2 = soma(c, dd.d, dd.e), melhor = -1, viz = null;
      alvos.forEach(function (s) { var t = raioSeg(o2, dd.d, s.a, s.b); if (t > 0 && t <= alc && (melhor < 0 || t < melhor)) { melhor = t; viz = s.id; } });
      if (melhor > 0) out.push({ k: dd.k, dir: rp(dd.d), de: rp(o2), ate: rp(soma(o2, dd.d, melhor)), valor: r4(melhor), vizinho: viz });
    });
    if (el.tipo === "parede" || el.tipo === "viga") {
      var al = alcas(el);
      out.push({ k: "comprimento", dir: rp(u), de: al[0].p, ate: al[1].p, valor: r4(el.comprimento), vizinho: null });
    }
    return out;
  }
  /* família hospedada NESTA parede (a porta dentro dela não é vizinha dela) */
  function acharHospedada(estado, famId, paredeId) {
    var l = (estado && estado.familias) || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === famId) return !!(l[i].host && l[i].host.id === paredeId);
    return false;
  }
  /* a op que leva a cota temporária ao valor novo: mover (vizinho) ou esticar (comprimento) */
  function opDaCota(estado, id, cota, novo) {
    var el = acharNoEstado(estado, id); if (!el || !cota || !(novo >= 0) || !fin(novo) || el.fixo) return null;   /* P4: fixada não anda */
    if (cota.k === "comprimento") {
      if (!(novo > 0.05)) return null;
      var al = alcas(el); if (al.length < 2) return null;
      var p = soma(al[0].p, cota.dir, novo);
      return { op: "esticar", id: id, ponta: "b", x: r4(p.x), z: r4(p.z) };
    }
    var c = centroDe(el); if (!c) return null;
    var q = soma(c, cota.dir, cota.valor - novo);   /* andar Δ na direção do vizinho encurta a folga em Δ */
    return { op: "mover", id: id, cx: r4(q.x), cz: r4(q.z) };
  }

  /* ----------------------------------------------- CONSTRUTORES DE OP */
  /* que tipo de elemento é (no ESTADO avaliado) e o prefixo do id novo */
  function tipoNoEstado(estado, id) {
    function tem(l) { return ((estado && estado[l]) || []).some(function (x) { return x && x.id === id; }); }
    if (tem("caixas")) return "caixa"; if (tem("coberturas")) return "cobertura"; if (tem("familias")) return "familia";
    if (tem("cotas")) return "cota"; if (tem("anotacoes")) return "anotacao"; return null;
  }
  var PREFIXO = { caixa: "e", cobertura: "e", cota: "e", familia: "f", anotacao: "a" };
  /* ids da seleção que existem, na ordem; numa CÓPIA, as portas e janelas das
     paredes copiadas vão junto, logo depois das paredes */
  function idsValidos(estado, ids, comHospedadas) {
    var out = [], visto = {};
    (ids || []).forEach(function (id) { if (!visto[id] && tipoNoEstado(estado, id)) { visto[id] = 1; out.push(id); } });
    if (comHospedadas) ((estado && estado.familias) || []).forEach(function (f) { if (f.host && visto[f.host.id] && !visto[f.id]) { visto[f.id] = 1; out.push(f.id); } });
    return out;
  }
  function mapaNovos(estado, ids, novoId) {
    var m = {}; ids.forEach(function (id) { m[id] = novoId(PREFIXO[tipoNoEstado(estado, id)] || "e"); }); return m;
  }
  /* mover / copiar / girar / espelhar → { op } ou { erro } */
  function opTransformar(estado, ids, T, copia, novoId) {
    if (!validaT(T)) return { erro: "Transformação inválida." };
    var lista = idsValidos(estado, ids, !!copia);
    if (!lista.length) return { erro: "Selecione um elemento criado no OrçaPRO." };
    /* P4: peça fixada não anda (a cópia pode) */
    if (!copia && lista.some(function (id) { var e = acharNoEstado(estado, id); return !!(e && e.fixo); })) return { erro: "Elemento fixado: use Desafixar antes (a peça fixada não anda nem sai)." };
    var op = { op: "transformar", ids: lista, T: clone(T), copia: !!copia };
    if (copia) { if (typeof novoId !== "function") return { erro: "Sem gerador de id." }; op.novos = mapaNovos(estado, lista, novoId); }
    return { op: op };
  }
  /* matriz: linear { tipo:'linear', n, dx, dz } (passo entre itens) ou polar
     { tipo:'polar', n, cx, cz, graus } (graus = ângulo TOTAL; 360 = volta inteira:
     os n itens dividem a volta; menos que 360: o 1º e o último ficam nas pontas) */
  function passosMatriz(o) {
    var n = Math.floor(num(o.n, 0)), Ts = [];
    if (o.tipo === "linear") for (var k = 1; k < n; k++) Ts.push({ tipo: "mover", dx: r4(o.dx * k), dz: r4(o.dz * k) });
    else if (o.tipo === "polar") {
      var tot = num(o.graus, 360), passo = Math.abs(Math.abs(tot) - 360) < 1e-6 ? tot / n : tot / (n - 1);
      for (var k2 = 1; k2 < n; k2++) Ts.push({ tipo: "girar", cx: o.cx, cz: o.cz, graus: r4(passo * k2) });
    }
    return Ts;
  }
  function validaMatriz(o) {
    var n = num(o && o.n, 0);
    if (!o || n !== Math.floor(n) || n < 2 || n > 200) return false;
    if (o.tipo === "linear") return fin(o.dx) && fin(o.dz) && (Math.abs(o.dx) + Math.abs(o.dz)) > 1e-4;
    if (o.tipo === "polar") return fin(o.cx) && fin(o.cz) && fin(o.graus) && Math.abs(o.graus) > 1e-4;
    return false;
  }
  function opMatriz(estado, ids, cfg, novoId) {
    var o = { tipo: cfg && cfg.tipo, n: num(cfg && cfg.n, 0), dx: num(cfg && cfg.dx, 0), dz: num(cfg && cfg.dz, 0), cx: num(cfg && cfg.cx, 0), cz: num(cfg && cfg.cz, 0), graus: num(cfg && cfg.graus, 360) };
    if (!validaMatriz(o)) return { erro: "Matriz precisa de 2 a 200 itens e de um passo (linear) ou centro e ângulo (polar)." };
    var lista = idsValidos(estado, ids, true);
    if (!lista.length) return { erro: "Selecione um elemento criado no OrçaPRO." };
    var op = { op: "matriz", ids: lista, tipo: o.tipo, n: o.n, novos: [] };
    if (o.tipo === "linear") { op.dx = r4(o.dx); op.dz = r4(o.dz); } else { op.cx = r4(o.cx); op.cz = r4(o.cz); op.graus = r4(o.graus); }
    for (var k = 1; k < o.n; k++) op.novos.push(mapaNovos(estado, lista, novoId));
    return { op: op };
  }
  function opCota(a, b, off, id) {
    if (!a || !b || !fin(a.x) || !fin(a.z) || !fin(b.x) || !fin(b.z)) return { erro: "Pontos inválidos." };
    if (dist(a, b) < 0.001) return { erro: "Os dois pontos da cota são o mesmo." };
    return { op: { op: "cota", id: id, a: { x: r4(a.x), y: r4(num(a.y, 0)), z: r4(a.z) }, b: { x: r4(b.x), y: r4(num(b.y, num(a.y, 0))), z: r4(b.z) }, off: r4(num(off, 0.5)) } };
  }
  /* deslocamento com sinal da linha de cota: o lado do cursor em relação a AB */
  function offsetCota(a, b, cur) {
    var L = dist(a, b); if (L < 1e-9) return 0;
    var nx = (b.z - a.z) / L, nz = -(b.x - a.x) / L;    /* normal à esquerda de A→B na planta */
    return r4((cur.x - a.x) * nx + (cur.z - a.z) * nz);
  }
  /* desenho de uma cota permanente: { l1, l2 (linha de cota), e1, e2 (chamadas), meio, valor, nx, nz } */
  function desenhoCota(c) {
    var L = dist(c.a, c.b); if (L < 1e-9) return null;
    var nx = (c.b.z - c.a.z) / L, nz = -(c.b.x - c.a.x) / L, off = num(c.off, 0);
    var l1 = P(c.a.x + nx * off, c.a.z + nz * off), l2 = P(c.b.x + nx * off, c.b.z + nz * off);
    return { l1: l1, l2: l2, e1: [P(c.a.x, c.a.z), l1], e2: [P(c.b.x, c.b.z), l2], meio: P((l1.x + l2.x) / 2, (l1.z + l2.z) / 2), valor: r4(L), nx: nx, nz: nz };
  }

  /* ===================================================== P4 — MODIFICAR
   * Plano do BIM, fase P4, frente C (09/10/2026): os comandos
   * da aba Modificar que faltavam. Cada um vira OP (desfaz/refaz de
   * sempre); onde a op que já existe resolve, ela é reaproveitada:
   *   Alinhar ........................ transformar (mover) ou esticar (ponta)
   *   Deslocamento (offset) .......... transformar (mover, com ou sem cópia)
   *   Aparar/estender para canto ..... lote de dois esticar
   *   Aparar/estender um/vários ...... esticar até a linha de referência
   *   Dividir elemento ............... op dividir (nova)
   *   Fixar / Desafixar .............. op fixar (nova) — fixada não anda,
   *                                    não estica e não sai (BimEdit, "P4")
   *   Criar similar .................. criar (ou familia) com o tipo e os
   *                                    parâmetros da peça de origem
   *   Corresponder propriedades de tipo  ajustar / ajustarTipo / instancia
   *   Escala ......................... op escala (nova; parede e viga)
   * A linha de uma parede é a LINHA DE LOCALIZAÇÃO dela (P4-A, js/bimarq.js):
   * aparar e estender levam a linha de localização até o canto. */
  function linearEl(el) { return ehCaixa(el) && (el.tipo === "parede" || el.tipo === "viga"); }
  function ARQm() { return global.BimArq || (typeof require === "function" ? (function () { try { return require("./bimarq.js"); } catch (e) { return null; } })() : null); }
  /* deslocamento (w) da linha de localização da parede em relação ao eixo da caixa */
  function wLoc(el) { var A = ARQm(); return el && el.tipo === "parede" && el.linhaLoc && A && A.wLinhaLoc ? A.wLinhaLoc(el, el.linhaLoc) : 0; }
  /* a linha da peça linear: ponto na linha de localização, direção e o centro da caixa */
  function linhaDe(el) { var u = eixoU(num(el.rotY, 0)), n = eixoN(num(el.rotY, 0)), w = wLoc(el); return { p: soma(P(el.cx, el.cz), n, w), u: u, n: n, w: w, c: P(el.cx, el.cz) }; }
  function unit(a, b) { var L = dist(a, b); return L > 1e-12 ? P((b.x - a.x) / L, (b.z - a.z) / L) : null; }
  function achar2(estado, id) { var e = acharNoEstado(estado, id); if (e) return e; var l = (estado && estado.eixos) || []; for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i]; return null; }
  function fixado(estado, id) { var e = achar2(estado, id); return !!(e && e.fixo); }
  var MSG_FIXO = "Elemento fixado: use Desafixar antes (a peça fixada não anda nem sai).";
  /* a ponta da peça linear levada ao ponto X da LINHA DE LOCALIZAÇÃO, do lado
     contrário ao clique (o lado clicado é o que FICA) → esticar */
  function esticarAte(el, X, clique) {
    var L = linhaDe(el), uX = dot(P(X.x - L.c.x, X.z - L.c.z), L.u), uC = clique ? dot(P(clique.x - L.c.x, clique.z - L.c.z), L.u) : null;
    /* sem clique: a ponta mais perto do ponto */
    var ponta = uC == null ? (uX >= 0 ? "b" : "a") : (uC > uX ? "a" : "b");
    var Xc = soma(X, L.n, -L.w);   /* o ponto no eixo da caixa (é ele que a op esticar move) */
    var al = alcas(el), fica = ponta === "a" ? al[1].p : al[0].p;
    if (dist(Xc, fica) < 0.05) return null;
    return { op: "esticar", id: el.id, ponta: ponta, x: r4(Xc.x), z: r4(Xc.z) };
  }
  /* o segmento de snap mais perto de p (face, eixo de parede/viga, eixo da grade, borda) */
  function segmentoPerto(estado, p, tol, o) {
    o = o || {};
    var geo = geometria(estado, { avaliar: o.avaliar, excluir: o.excluir, eixos: true }), best = null, bd = num(tol, 0.3);
    geo.segs.forEach(function (s) { if (o.id != null && s.id !== o.id) return; var d = distPontoSeg(p, s.a, s.b); if (d <= bd + 1e-12) { bd = d; best = s; } });
    return best ? { a: P(best.a.x, best.a.z), b: P(best.b.x, best.b.z), id: best.id, k: best.k, d: bd } : null;
  }
  /* ALINHAR: a linha `alvo` (de uma peça) passa a coincidir com a linha `ref`
     (paralelas). Na ponta de parede/viga (a face da ponta), estica a ponta. */
  function opAlinhar(estado, ref, alvo) {
    if (!ref || !alvo || !ref.a || !ref.b || !alvo.a || !alvo.b) return { erro: "Alinhar: clique a linha de referência e depois a linha da peça." };
    var el = achar2(estado, alvo.id);
    if (!el || el.id == null || !tipoNoEstado(estado, alvo.id)) return { erro: "Alinhar: a segunda linha tem de ser de uma peça criada no OrçaPRO." };
    if (ref.id != null && ref.id === alvo.id) return { erro: "Alinhar: a referência e a peça são a mesma." };
    if (el.fixo) return { erro: MSG_FIXO };
    var dr = unit(ref.a, ref.b), da = unit(alvo.a, alvo.b);
    if (!dr || !da) return { erro: "Linha de comprimento zero." };
    if (Math.abs(dr.x * da.z - dr.z * da.x) > 1e-3) return { erro: "Alinhar: as duas linhas têm de ser paralelas." };
    var nr = P(-dr.z, dr.x), d = dot(P(ref.a.x - alvo.a.x, ref.a.z - alvo.a.z), nr);
    if (Math.abs(d) < 1e-5) return { erro: "Já está alinhado." };
    var v = P(nr.x * d, nr.z * d);
    if (linearEl(el) && Math.abs(dot(da, eixoU(num(el.rotY, 0)))) < 1e-3) {
      /* a face da PONTA: a ponta anda até a referência (estica ou encurta) */
      var al = alcas(el), mid = P((alvo.a.x + alvo.b.x) / 2, (alvo.a.z + alvo.b.z) / 2), k = dist(mid, al[0].p) <= dist(mid, al[1].p) ? 0 : 1, q = soma(al[k].p, v, 1);
      return { op: { op: "esticar", id: el.id, ponta: k === 0 ? "a" : "b", x: r4(q.x), z: r4(q.z) } };
    }
    return opTransformar(estado, [el.id], { tipo: "mover", dx: r4(v.x), dz: r4(v.z) }, false);
  }
  /* DESLOCAMENTO (offset): a parede/viga paralela a `distancia`, do lado do
     ponto `lado`; copia = a peça nova ("Copiar" vem marcado por padrão) */
  function opDeslocamento(estado, id, distancia, lado, copia, novoId) {
    var el = acharNoEstado(estado, id);
    if (!linearEl(el)) return { erro: "Deslocamento: clique numa parede ou viga criada no OrçaPRO." };
    if (!(distancia > 0.0005) || !fin(distancia)) return { erro: "Digite a distância do deslocamento (ex.: 0,15)." };
    if (!copia && el.fixo) return { erro: MSG_FIXO };
    var n = eixoN(num(el.rotY, 0)), c = P(el.cx, el.cz), s = (lado && fin(lado.x) && dot(P(lado.x - c.x, lado.z - c.z), n) < 0) ? -1 : 1;
    var op = { op: "transformar", ids: [id], T: { tipo: "mover", dx: r4(n.x * distancia * s), dz: r4(n.z * distancia * s) }, copia: !!copia };
    if (copia) { if (typeof novoId !== "function") return { erro: "Sem gerador de id." }; op.novos = {}; op.novos[id] = novoId("e"); }
    return { op: op };
  }
  /* APARAR/ESTENDER PARA CANTO: duas peças lineares até o encontro das linhas
     de localização; o lado CLICADO de cada uma é o que fica */
  function opAparoCanto(estado, a, b, novoId) {
    var A = acharNoEstado(estado, a && a.id), B = acharNoEstado(estado, b && b.id);
    if (!linearEl(A) || !linearEl(B)) return { erro: "Aparar para canto: clique em duas paredes (ou vigas) criadas no OrçaPRO." };
    if (A.id === B.id) return { erro: "Aparar para canto: clique em duas peças diferentes." };
    if (A.fixo || B.fixo) return { erro: MSG_FIXO };
    var LA = linhaDe(A), LB = linhaDe(B), X = intersecaoRetas(LA.p, LA.u, LB.p, LB.u);
    if (!X) return { erro: "Aparar para canto: as duas são paralelas — não há canto." };
    var oa = esticarAte(A, X, a.p), ob = esticarAte(B, X, b.p), ops = [oa, ob].filter(Boolean);
    if (!ops.length) return { erro: "As duas já chegam ao canto." };
    if (ops.length === 1) return { op: ops[0] };
    return { op: { op: "lote", id: typeof novoId === "function" ? novoId("l") : "l" + Date.now().toString(36), origem: "modificar", pedido: "Aparar/estender para canto", ops: ops } };
  }
  /* APARAR/ESTENDER (um elemento, ou vários um a um): a peça até a linha `ref` */
  function opAparoAte(estado, ref, alvo) {
    var el = acharNoEstado(estado, alvo && alvo.id);
    if (!linearEl(el)) return { erro: "Aparar/estender: clique numa parede ou viga criada no OrçaPRO." };
    if (ref && ref.id != null && ref.id === el.id) return { erro: "A peça é a própria referência." };
    if (el.fixo) return { erro: MSG_FIXO };
    var dr = ref && unit(ref.a, ref.b); if (!dr) return { erro: "Clique primeiro a linha de referência." };
    var L = linhaDe(el), X = intersecaoRetas(L.p, L.u, ref.a, dr);
    if (!X) return { erro: "A peça é paralela à referência." };
    var o = esticarAte(el, X, alvo.p);
    return o ? { op: o } : { erro: "A peça já chega à referência." };
  }
  function opAparoVarios(estado, ref, alvos, novoId) {
    var ops = [], erros = [];
    (alvos || []).forEach(function (al) { var r = opAparoAte(estado, ref, al); if (r.op) ops.push(r.op); else erros.push(r.erro); });
    if (!ops.length) return { erro: erros[0] || "Nada para aparar." };
    return ops.length === 1 ? { op: ops[0] } : { op: { op: "lote", id: typeof novoId === "function" ? novoId("l") : "l" + Date.now().toString(36), origem: "modificar", pedido: "Aparar/estender vários elementos", ops: ops } };
  }
  /* DIVIDIR ELEMENTO no ponto p (projetado no eixo) */
  function opDividir(estado, id, p, novoId) {
    var el = acharNoEstado(estado, id);
    if (!linearEl(el)) return { erro: "Dividir: clique numa parede ou viga criada no OrçaPRO." };
    if (el.fixo) return { erro: MSG_FIXO };
    if (!p || !fin(p.x) || !fin(p.z)) return { erro: "Ponto inválido." };
    var u = eixoU(num(el.rotY, 0)), t = dot(P(p.x - el.cx, p.z - el.cz), u);
    if (!(Math.abs(t) < el.comprimento / 2 - 0.01)) return { erro: "Dividir: clique DENTRO da peça, longe das pontas." };
    var X = soma(P(el.cx, el.cz), u, t);
    return { op: { op: "dividir", id: id, novo: typeof novoId === "function" ? novoId("e") : null, x: r4(X.x), z: r4(X.z) } };
  }
  function opFixar(estado, ids, fixo) {
    var l = (ids || []).filter(function (id) { return !!achar2(estado, id); });
    if (!l.length) return { erro: (fixo ? "Fixar" : "Desafixar") + ": selecione um elemento criado no OrçaPRO (ou um eixo)." };
    var muda = l.filter(function (id) { return fixado(estado, id) !== !!fixo; });
    if (!muda.length) return { erro: fixo ? "Já está fixado." : "Não está fixado." };
    return { op: { op: "fixar", ids: muda, fixo: !!fixo } };
  }
  /* CRIAR SIMILAR: quantos pontos a peça pede e a op que cria a nova */
  var SEM_SIMILAR = ["id", "marca", "comentarios", "fixo", "geoUnioes", "uniaoGeo", "cortesFace", "avisosUniao", "pinturas", "divFaces", "pinturasCalc", "uniao", "topo", "juntas",
                     "faces", "medidasCamadas", "recuoIni", "recuoFim", "alturaEfetiva", "avisoNivel", "v1Migrado", "unioes", "comprimentoLiq"];
  function pontosSimilar(el) {
    if (!el) return 0;
    if (el.famId) return el.host ? 0 : 1;
    if (!ehCaixa(el)) return 0;
    if (el.tipo === "parede" || el.tipo === "viga") return 2;
    if (el.tipo === "pilar") return 1;
    if (el.tipo === "laje" && !el.contorno) return 2;
    return 0;
  }
  function opSimilar(estado, fonteId, pts, novoId) {
    var el = acharNoEstado(estado, fonteId), np = pontosSimilar(el);
    if (!el) return { erro: "Criar similar: clique numa peça criada no OrçaPRO." };
    if (!np) return { erro: el.famId ? "Porta e janela: use Porta/Janela (o vão é aberto na parede)." : (el.contorno ? "Laje por contorno: use a ferramenta Laje (o contorno é desenhado)." : "Esta peça não tem Criar similar.") };
    if (!pts || pts.length < np || pts.slice(0, np).some(function (q) { return !q || !fin(q.x) || !fin(q.z); })) return { erro: "Criar similar: faltam " + np + " ponto(s)." };
    if (typeof novoId !== "function") return { erro: "Sem gerador de id." };
    if (el.famId) return { op: { op: "familia", id: novoId("f"), famId: el.famId, tipoId: el.tipoId, x: r4(pts[0].x), y: num(el.y, 0), z: r4(pts[0].z), rotY: num(el.rotY, 0), inst: clone(el.inst || {}) } };
    var base = null;
    if (el.tipo === "parede") base = BE && BE.parede(pts[0], pts[1], el.espessura, el.altura, el.cy - el.altura / 2);
    else if (el.tipo === "viga") base = BE && BE.viga(pts[0], pts[1], el.espessura, el.altura, el.topoViga != null ? el.topoViga : el.cy + el.altura / 2);
    else if (el.tipo === "laje") base = BE && BE.laje(pts[0], pts[1], el.altura, el.cy + el.altura / 2);
    else if (el.tipo === "pilar") base = { cx: r4(pts[0].x), cz: r4(pts[0].z) };
    if (!base) return { erro: "Criar similar: os pontos não formam a peça (comprimento zero?)." };
    var nv = clone(el);
    SEM_SIMILAR.forEach(function (k) { delete nv[k]; });
    ["cx", "cy", "cz", "comprimento", "espessura", "rotY", "area", "volume", "comprimentoViga"].forEach(function (k) { if (base[k] != null) nv[k] = base[k]; });
    if (el.tipo === "viga" && el.perfil) { nv.espessura = el.espessura; nv.altura = el.altura; }
    /* a parede nova é desenhada pela MESMA linha de localização da de origem */
    if (el.tipo === "parede" && el.linhaLoc) { var n = eixoN(num(nv.rotY, 0)), w = wLoc(nv); nv.cx = r4(nv.cx - w * n.x); nv.cz = r4(nv.cz - w * n.z); }
    return { op: { op: "criar", id: novoId("e"), caixa: nv } };
  }
  /* CORRESPONDER PROPRIEDADES DE TIPO: o alvo passa a ser do tipo da origem */
  function opCorresponderTipo(estado, fonteId, alvoId, novoId) {
    var S = acharNoEstado(estado, fonteId), A = acharNoEstado(estado, alvoId);
    if (!S || !A) return { erro: "Corresponder tipo: clique na peça de origem e depois na que muda." };
    if (S === A) return { erro: "A origem e o alvo são a mesma peça." };
    var ops = [];
    if (S.famId || A.famId) {
      if (!S.famId || !A.famId) return { erro: "Corresponder tipo: as duas peças têm de ser da mesma categoria." };
      if (S.famId !== A.famId) return { erro: "Corresponder tipo: as duas têm de ser da mesma família (para trocar a família, use a biblioteca)." };
      if (String(S.tipoId) === String(A.tipoId)) return { erro: "Já são do mesmo tipo." };
      ops.push({ op: "instancia", id: A.id, tipoId: String(S.tipoId) });
    } else {
      if (S.tipo !== A.tipo) return { erro: "Corresponder tipo: as duas peças têm de ser da mesma categoria (" + S.tipo + " × " + A.tipo + ")." };
      var campos = {};
      if (S.tipo === "parede") {
        campos.tipoParede = S.tipoParede ? clone(S.tipoParede) : { id: "auto", rotulo: "Parede " + Math.round(S.espessura * 1000) / 10 + " cm", espessura: S.espessura, camadas: [] };
        var vr = S.virar || {}; if (S.virar || A.virar) campos.virar = { ext: vr.ext || null, ins: vr.ins || null };
      } else if (S.tipo === "laje") campos.tipoLaje = { id: (S.tipoLaje && S.tipoLaje.id) || "auto", rotulo: (S.tipoLaje && S.tipoLaje.rotulo) || "", espessura: S.altura };
      else if (S.tipo === "pilar" || S.tipo === "viga") { if (!S.perfil) return { erro: "A peça de origem não tem perfil (seção) para copiar." }; campos.perfil = clone(S.perfil); if (S.material) campos.material = S.material; }
      else return { erro: "Esta categoria não tem tipo para corresponder." };
      ops.push({ op: "ajustar", id: A.id, campos: campos });
      if (S.tipoNomeado != null) ops.push({ op: "ajustarTipo", categoria: S.tipo, tipoId: String(S.tipoNomeado), ids: [String(A.id)] });
    }
    if (ops.length === 1) return { op: ops[0] };
    return { op: { op: "lote", id: typeof novoId === "function" ? novoId("l") : "l" + Date.now().toString(36), origem: "modificar", pedido: "Corresponder propriedades de tipo", ops: ops } };
  }
  function opEscala(estado, ids, base, fator) {
    var l = (ids || []).filter(function (id) { return linearEl(acharNoEstado(estado, id)); });
    if (!l.length) return { erro: "Escala: selecione parede ou viga (a escala vale para paredes e linhas)." };
    if (l.some(function (id) { return fixado(estado, id); })) return { erro: MSG_FIXO };
    if (!fin(fator) || fator < 0.01 || fator > 100 || Math.abs(fator - 1) < 1e-9) return { erro: "Fator de escala entre 0,01 e 100 (e diferente de 1)." };
    if (!base || !fin(base.x) || !fin(base.z)) return { erro: "Clique o ponto base da escala." };
    return { op: { op: "escala", ids: l, cx: r4(base.x), cz: r4(base.z), fator: fator } };
  }
  /* o CANTO (L, T ou X) de duas paredes mais perto do clique: { a, b, tipo, ponto, modo, alternada } */
  function cantoPerto(estado, p, tol) {
    var cx = (estado && estado.caixas) || [], porId = {}, best = null, bd = num(tol, 1);
    cx.forEach(function (c) { if (c && c.id != null) porId[c.id] = c; });
    cx.forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      (c.juntas || []).forEach(function (j) {
        var o = porId[j.com]; if (!o || j.tipo === "I") return;
        var X = intersecaoRetas(P(c.cx, c.cz), eixoU(num(c.rotY, 0)), P(o.cx, o.cz), eixoU(num(o.rotY, 0))); if (!X) return;
        var d = dist(X, p); if (d < bd) { bd = d; best = { a: c.id, b: o.id, tipo: j.tipo, ponto: P(r4(X.x), r4(X.z)), modo: j.modo || null, alternada: !!j.alternada, passa: j.passa != null ? (j.passa ? c.id : o.id) : null }; }
      });
    });
    return best;
  }

  /* ---------------------------------------- EXTENSÃO DO BimEdit (replay) */
  /* As ops novas entram no MESMO replay do BimEdit pelo gancho `estender`
     (js/bimedit.js): nada de estado paralelo — desfazer é tirar a última op,
     como em todas as outras. */
  var BE = null;
  function achar(ctx, id) {
    if (ctx.caixas[id]) return { k: "caixa", el: ctx.caixas[id] };
    if (ctx.cobs[id]) return { k: "cobertura", el: ctx.cobs[id] };
    if (ctx.fams[id]) return { k: "familia", el: ctx.fams[id] };
    if (ctx.ext.cotas && ctx.ext.cotas[id]) return { k: "cota", el: ctx.ext.cotas[id] };
    if (ctx.anot[id]) return { k: "anotacao", el: ctx.anot[id] };
    return null;
  }
  function cotasCtx(ctx) { if (!ctx.ext.cotas) { ctx.ext.cotas = {}; ctx.ext.ordemCotas = []; } return ctx.ext.cotas; }
  function inserir(ctx, k, id, el) {
    el.id = id;
    var mapa = { caixa: [ctx.caixas, ctx.ordem], cobertura: [ctx.cobs, ctx.ordemC], familia: [ctx.fams, ctx.ordemF], anotacao: [ctx.anot, ctx.ordemA] }[k];
    if (k === "cota") { cotasCtx(ctx); mapa = [ctx.ext.cotas, ctx.ext.ordemCotas]; }
    if (!mapa) return false;
    mapa[0][id] = el; if (mapa[1].indexOf(id) < 0) mapa[1].push(id);
    return true;
  }
  /* aplica UMA transformação a uma lista de ids; novos = { src: id novo } numa cópia */
  function aplicarT(ctx, ids, T, copia, novos) {
    var feitos = 0, dentro = {};
    ids.forEach(function (id) { dentro[id] = 1; });
    /* duas passadas: primeiro o que não é hospedado (as paredes nascem), depois portas e janelas */
    [false, true].forEach(function (hosp) {
      ids.forEach(function (src) {
        var a = achar(ctx, src); if (!a) return;
        var ehH = a.k === "familia" && !!a.el.host;
        if (ehH !== hosp) return;
        if (!ehH) {
          /* P4: peça FIXADA não anda; a cópia dela nasce solta */
          if (!copia && a.el.fixo) return;
          var t2 = transformarEl(a.k, a.el, T);
          /* P4: a cópia não leva a união com as peças de fora da cópia (nem o canto alternado) */
          if (copia) { delete t2.fixo; delete t2.geoUnioes; delete t2.unioes; }
          if (copia) { if (novos && novos[src] != null && !achar(ctx, novos[src])) { inserir(ctx, a.k, novos[src], t2); feitos++; } }
          else { t2.id = src; ({ caixa: ctx.caixas, cobertura: ctx.cobs, familia: ctx.fams, cota: cotasCtx(ctx), anotacao: ctx.anot })[a.k][src] = t2; feitos++; }
          return;
        }
        /* HOSPEDADA: a posição é sempre relativa à parede (t ao longo do eixo) */
        var host = ctx.caixas[a.el.host.id];
        if (copia) {
          if (!novos || novos[src] == null || achar(ctx, novos[src])) return;
          var f2 = clone(a.el), hn = novos[a.el.host.id];
          if (hn != null && ctx.caixas[hn]) f2.host = { id: hn, t: a.el.host.t };
          else if (T.tipo === "mover" && host && BE) f2.host = { id: host.id, t: BE.tNaParede(host, ponto(BE.posicaoHospedada(host, a.el.host.t), T)) };
          else return;   /* porta sozinha girada ou espelhada sairia da parede: não se copia */
          inserir(ctx, "familia", novos[src], f2); feitos++;
        } else {
          if (dentro[a.el.host.id]) { feitos++; return; }   /* anda junto com a parede */
          if (a.el.fixo) return;   /* P4: fixada */
          if (T.tipo === "mover" && host && BE) { a.el.host.t = BE.tNaParede(host, ponto(BE.posicaoHospedada(host, a.el.host.t), T)); feitos++; }
        }
      });
    });
    return feitos;
  }
  function aplicarOp(o, ctx) {
    if (o.op === "transformar") { if (!validaT(o.T) || !Array.isArray(o.ids)) return false; return aplicarT(ctx, o.ids, o.T, !!o.copia, o.novos) > 0; }
    if (o.op === "matriz") {
      if (!validaMatriz(o) || !Array.isArray(o.ids) || !Array.isArray(o.novos)) return false;
      var Ts = passosMatriz(o), f = 0;
      Ts.forEach(function (T, i) { f += aplicarT(ctx, o.ids, T, true, o.novos[i]); });
      return f > 0;
    }
    if (o.op === "esticar") {
      var c = ctx.caixas[o.id]; if (!c || !BE || c.fixo) return false;   /* P4: fixada não estica */
      var n2 = esticarCaixa(c, o.ponta, P(o.x, o.z), BE); if (!n2) return false;
      /* porta e janela ficam onde estavam NO MUNDO (o centro da parede andou) */
      if (c.tipo === "parede") ctx.ordemF.forEach(function (fid) {
        var f = ctx.fams[fid]; if (!f || !f.host || f.host.id !== o.id) return;
        f.host.t = BE.tNaParede(n2, BE.posicaoHospedada(c, f.host.t));
      });
      n2.id = o.id; ctx.caixas[o.id] = n2;
      return true;
    }
    /* P4 — FIXAR / DESAFIXAR (caixa, família, cobertura, eixo da grade) */
    if (o.op === "fixar") {
      var nf = 0;
      (o.ids || []).forEach(function (id) {
        var e = ctx.caixas[id] || ctx.fams[id] || ctx.cobs[id] || (ctx.eixos && ctx.eixos[id]); if (!e) return;
        if (o.fixo) e.fixo = true; else delete e.fixo; nf++;
      });
      return nf > 0;
    }
    /* P4 — DIVIDIR ELEMENTO: a parede (ou viga) vira duas no ponto; portas e
       janelas vão para o pedaço em que estão; o pedaço novo entra no FIM da
       lista (é uma peça nova) */
    if (o.op === "dividir") {
      var cd = ctx.caixas[o.id]; if (!cd || !BE || cd.fixo || !linearEl(cd) || ctx.caixas[o.novo]) return false;
      var ud = eixoU(num(cd.rotY, 0)), td = dot(P(o.x - cd.cx, o.z - cd.cz), ud);
      if (!(Math.abs(td) < cd.comprimento / 2 - 0.009)) return false;
      var Xd = soma(P(cd.cx, cd.cz), ud, td), d1 = esticarCaixa(cd, "b", Xd, BE), d2 = esticarCaixa(cd, "a", Xd, BE);
      if (!d1 || !d2) return false;
      if (cd.tipo === "parede") ctx.ordemF.forEach(function (fid) {
        var f = ctx.fams[fid]; if (!f || !f.host || f.host.id !== o.id) return;
        var pos = BE.posicaoHospedada(cd, f.host.t);
        if (f.host.t > td) f.host = { id: o.novo, t: BE.tNaParede(d2, pos) }; else f.host.t = BE.tNaParede(d1, pos);
      });
      ["marca", "fixo", "geoUnioes", "unioes", "pinturas", "divFaces"].forEach(function (k) { delete d2[k]; });
      d1.id = o.id; ctx.caixas[o.id] = d1;
      inserir(ctx, "caixa", o.novo, d2);
      return true;
    }
    /* P4 — ESCALA (parede e viga: paredes e linhas): as pontas
       vão para C + fator·(P − C); espessura e altura ficam; porta e janela
       ficam no mesmo lugar RELATIVO da parede */
    if (o.op === "escala") {
      var ne = 0;
      (o.ids || []).forEach(function (id) {
        var ce = ctx.caixas[id]; if (!ce || ce.fixo || !linearEl(ce) || !BE) return;
        var al = alcas(ce), C = P(o.cx, o.cz);
        function esc(p) { return P(C.x + (p.x - C.x) * o.fator, C.z + (p.z - C.z) * o.fator); }
        var t1 = esticarCaixa(ce, "a", esc(al[0].p), BE), t2 = t1 && esticarCaixa(t1, "b", esc(al[1].p), BE);
        if (!t2) return;
        if (ce.tipo === "parede") ctx.ordemF.forEach(function (fid) {
          var f = ctx.fams[fid]; if (!f || !f.host || f.host.id !== id) return;
          f.host.t = BE.tNaParede(t2, esc(BE.posicaoHospedada(ce, f.host.t)));
        });
        t2.id = id; ctx.caixas[id] = t2; ne++;
      });
      return ne > 0;
    }
    if (o.op === "cota") {
      if (o.id == null || !o.a || !o.b) return false;
      inserir(ctx, "cota", o.id, { a: clone(o.a), b: clone(o.b), off: num(o.off, 0.5), valor: r4(dist(o.a, o.b)) });
      return true;
    }
    if (o.op === "apagar" && ctx.ext.cotas && ctx.ext.cotas[o.id]) {
      delete ctx.ext.cotas[o.id]; ctx.ext.ordemCotas.splice(ctx.ext.ordemCotas.indexOf(o.id), 1);
      return true;
    }
    return false;
  }
  function fimOp(ctx, out) {
    var cs = ctx.ext.cotas || {};
    out.cotas = (ctx.ext.ordemCotas || []).map(function (id) { var c = cs[id]; c.valor = r4(dist(c.a, c.b)); return c; });
  }
  function ptOk(p) { return !!p && fin(p.x) && fin(p.z) && (p.y == null || fin(p.y)); }
  /* sanear: true/false para as ops desta fase, undefined para as dos outros */
  function validaOp(o) {
    if (o.op === "transformar") return Array.isArray(o.ids) && o.ids.length > 0 && validaT(o.T) && (!o.copia || (!!o.novos && typeof o.novos === "object"));
    if (o.op === "matriz") return Array.isArray(o.ids) && o.ids.length > 0 && validaMatriz(o) && Array.isArray(o.novos) && o.novos.length === o.n - 1 && o.novos.every(function (m) { return m && typeof m === "object"; });
    if (o.op === "esticar") return o.id != null && fin(o.x) && fin(o.z) && (o.ponta === "a" || o.ponta === "b" || (typeof o.ponta === "number" && o.ponta >= 0 && o.ponta <= 3));
    if (o.op === "cota") return o.id != null && ptOk(o.a) && ptOk(o.b) && dist(o.a, o.b) >= 0.001 && (o.off == null || fin(o.off));
    /* P4 */
    if (o.op === "fixar") return Array.isArray(o.ids) && o.ids.length > 0 && o.ids.every(function (x) { return x != null && typeof x !== "object"; }) && typeof o.fixo === "boolean";
    if (o.op === "dividir") return o.id != null && o.novo != null && String(o.id) !== String(o.novo) && fin(o.x) && fin(o.z);
    if (o.op === "escala") return Array.isArray(o.ids) && o.ids.length > 0 && o.ids.every(function (x) { return x != null && typeof x !== "object"; }) && fin(o.cx) && fin(o.cz) && fin(o.fator) && o.fator >= 0.01 && o.fator <= 100 && Math.abs(o.fator - 1) > 1e-9;
    return undefined;
  }
  function registrar(BimEdit) {
    if (!BimEdit || typeof BimEdit.estender !== "function") return false;
    BE = BimEdit;
    BimEdit.estender({ nome: "precisao", aplicar: aplicarOp, fim: fimOp, valida: validaOp });
    return true;
  }

  /* ------------------------------------------------- tela (só dados) */
  /* marcador de cada snap: quadrado = ponto final, triângulo =
     meio, X = interseção, círculo = centro, ⊥ = perpendicular, x pequeno =
     extensão, ampulheta = próximo, grade = grade. SVG 16×16 em currentColor:
     a cor vem do CSS (css/bimprecisao.css), não daqui. */
  var GLIFO = {
    fim: '<rect x="2.5" y="2.5" width="11" height="11"/>',
    meio: '<path d="M8 2.5 L14 13.5 L2 13.5 Z"/>',
    intersecao: '<path d="M2.5 2.5 L13.5 13.5 M13.5 2.5 L2.5 13.5"/>',
    centro: '<circle cx="8" cy="8" r="5.5"/>',
    perpendicular: '<path d="M2.5 13.5 L13.5 13.5 M8 13.5 L8 2.5"/>',
    extensao: '<path d="M5 5 L11 11 M11 5 L5 11"/>',
    proximo: '<path d="M3 3 L13 3 L3 13 L13 13 Z"/>',
    grade: '<path d="M2.5 5.5 L13.5 5.5 M2.5 10.5 L13.5 10.5 M5.5 2.5 L5.5 13.5 M10.5 2.5 L10.5 13.5"/>'
  };
  var ROTULO = { fim: "ponto final", intersecao: "interseção", meio: "ponto médio", centro: "centro", perpendicular: "perpendicular", extensao: "extensão", proximo: "próximo", grade: "grade" };
  function glifoSvg(tipo) {
    var g = GLIFO[tipo]; if (!g) return "";
    return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' + g + "</svg>";
  }
  /* os comandos da fita (só com a prévia do modelador): id → ferramenta do editor */
  var FITA = {
    modificar: [
      { id: "mover-preciso", sub: "mover", rotulo: "Mover", icone: "avancar", dica: "Move o que está selecionado de um ponto base a um ponto final, com snap — dá para digitar a distância e o ângulo (atalho MV)." },
      { id: "copiar", sub: "copiar", rotulo: "Copiar", icone: "copiar", dica: "Copia o que está selecionado de um ponto base a um ponto final; portas e janelas da parede vão junto (atalho CO)." },
      { id: "espelhar", sub: "espelhar", rotulo: "Espelhar", icone: "corte", dica: "Espelha a seleção por um eixo de dois cliques, mantendo ou não o original (atalho MM)." },
      { id: "girar", sub: "girar", rotulo: "Girar", icone: "ciclo", dica: "Gira a seleção em torno de um centro: clique o centro e digite o ângulo, ou clique a referência e o final (atalho RO)." },
      { id: "matriz", sub: "matriz", rotulo: "Matriz", icone: "grade", dica: "Repete a seleção em linha (passo entre itens) ou em volta de um centro (polar) — n itens (atalho AR)." },
      { id: "snaps-editor", sub: null, rotulo: "Snaps", icone: "ima", dica: "Ponto final, meio, interseção, perpendicular, extensão, centro, próximo e grade — liga e desliga cada um e o passo da grade (F3 liga e desliga todos)." },
      /* P4 — o resto da aba Modificar (js/bimprecisao.js, frente C) */
      { id: "alinhar", sub: "alinhar", rotulo: "Alinhar", icone: "alvo", dica: "Clique a linha de REFERÊNCIA (face, eixo da parede, eixo da grade) e depois a linha da peça que vai encostar nela — a peça anda; na face da ponta, a parede estica (atalho AL)." },
      { id: "deslocamento", sub: "deslocar", rotulo: "Deslocamento", icone: "camadas", dica: "Paralela a uma distância (offset): digite a distância na barra de opções e clique na parede/viga do lado para onde ela vai. Com \"Copiar\" nasce outra peça (atalho OF)." },
      { id: "aparar-canto", sub: "aparar", rotulo: "Aparar para\ncanto", icone: "quadrado", dica: "Aparar/estender para canto: clique as duas paredes (ou vigas) do lado que FICA — as duas vão até o encontro das linhas de localização e o canto fecha (atalho TR)." },
      { id: "aparar-varios", sub: "aparar-varios", rotulo: "Aparar/estender\nvários", icone: "lista", dica: "Clique a linha de referência e depois cada parede/viga que vai até ela (o lado clicado fica). Esc termina." },
      { id: "dividir-elemento", sub: "dividir", rotulo: "Dividir\nelemento", icone: "corte", dica: "Clique na parede ou viga onde ela se divide em duas; porta e janela ficam no pedaço em que estão (atalho SL)." },
      { id: "fixar", sub: "fixar", rotulo: "Fixar", icone: "cadeado", dica: "Fixa a peça selecionada (ou a que você clicar): ela não anda, não estica e não sai até Desafixar (atalho PN)." },
      { id: "desafixar", sub: "desafixar", rotulo: "Desafixar", icone: "destravado", dica: "Solta a peça fixada (atalho UP)." },
      { id: "criar-similar", sub: "similar", rotulo: "Criar\nsimilar", icone: "editar", dica: "Clique numa peça e desenhe outra igual (mesmo tipo e parâmetros): parede e viga com dois cliques, pilar e família com um (atalho CS)." },
      /* EMBREVE (09/10/2026): "Corresponder tipo" saiu daqui — o comando é o "Igualar
         tipo" (Arquitetura › Tipo, id `combinar`, js/bimembreveui.js), que arma a MESMA
         ferramenta "corresp-tipo". Dois botões fazendo a mesma coisa é o que a fita barra.
         O atalho MA continua (ATALHOS). */
      { id: "escala", sub: "escala", rotulo: "Escala", icone: "expandir", dica: "Paredes e vigas: digite o fator na barra de opções, selecione e clique o ponto base — as pontas vão para base + fator × distância (atalho RE)." }
    ],
    /* P4 — unir geometria e juntas de parede (js/bimarq.js, frentes A e B) */
    geometria: [
      { id: "juntas-parede", sub: "juntas", rotulo: "Juntas de\nparede", icone: "parede", dica: "Escolha Topo, Meia-esquadria ou Esquadrar na barra de opções e clique perto do canto de duas paredes." },
      { id: "alternar-uniao", sub: "alternar-uniao", rotulo: "Alternar ordem\nde união", icone: "ciclo", dica: "Clique perto do canto de duas paredes: troca a que passa e a que para (o volume de cada uma muda). Em peças unidas (pilar, viga, laje), clique as duas: troca quem corta quem." },
      { id: "unir-geometria", sub: "unir-geo", rotulo: "Unir\ngeometria", icone: "mais", dica: "Clique duas peças (parede, pilar, viga, laje): a de maior prioridade corta a outra — pilar > viga > laje > parede — e o volume comum não conta duas vezes no orçamento." },
      { id: "desunir-geometria", sub: "desunir-geo", rotulo: "Desunir\ngeometria", icone: "fechar", dica: "Clique as duas peças unidas: cada uma volta inteira (na parede × parede, o canto deixa de ser feito)." }
    ],
    /* P4 — pintar e dividir face (js/bimpintar.js, frente D) */
    pintar: [
      { id: "pintar-face", sub: "pintar", rotulo: "Pintar", icone: "pincel", dica: "Escolha o material (e a composição, se quiser) na barra de opções e clique na FACE da parede ou laje — a área da face (ou da faixa dela) entra no orçamento (atalho PT)." },
      { id: "dividir-face", sub: "dividir-face", rotulo: "Dividir\nface", icone: "azulejo", dica: "Barrado: digite a altura na barra de opções e clique na face da parede — ela vira duas faixas, e cada uma se pinta com o seu material." },
      { id: "remover-pintura", sub: "remover-pintura", rotulo: "Remover\npintura", icone: "lixeira", dica: "Clique na face (ou faixa) pintada: ela volta ao material da parede." }
    ],
    cotar: [
      { id: "cota-alinhada", sub: "cota", rotulo: "Cota\nalinhada", icone: "regua", dica: "Cota permanente entre dois pontos, com snap: clique o 1º, o 2º e onde passa a linha. Fica gravada e aparece no 3D e na planta (atalho DI)." }
    ]
  };
  /* atalhos de duas letras (convenção de mercado: WA parede, DI cota, MV mover…) */
  var ATALHOS = { MV: "mover", CO: "copiar", MM: "espelhar", RO: "girar", AR: "matriz", DI: "cota", WA: "parede",
                  /* P4: os do resto da aba Modificar */
                  AL: "alinhar", OF: "deslocar", TR: "aparar", SL: "dividir", PN: "fixar", UP: "desafixar", CS: "similar", MA: "corresp-tipo", RE: "escala", PT: "pintar" };

  var BimPrecisao = {
    TIPOS: TIPOS, CLASSE: CLASSE, ORDEM: ORDEM, EMPATE: EMPATE, ROTULO: ROTULO, GLIFO: GLIFO, FITA: FITA, ATALHOS: ATALHOS,
    projReta: projReta, distPontoSeg: distPontoSeg, intersecaoSegs: intersecaoSegs, intersecaoRetas: intersecaoRetas, raioSeg: raioSeg,
    pegada: pegada, geometria: geometria, escolher: escolher, snap: snap,
    lerNumero: lerNumero, lerAngulo: lerAngulo, lerRetangulo: lerRetangulo, distAng: distAng, pontoPor: pontoPor, orto: orto, fmtM: fmtM,
    validaT: validaT, ponto: ponto, angulo: angulo, transformarEl: transformarEl,
    alcas: alcas, esticarCaixa: function (el, ponta, p) { return esticarCaixa(el, ponta, p, BE); },
    centroDe: centroDe, cotasTemporarias: cotasTemporarias, opDaCota: opDaCota,
    opTransformar: opTransformar, opMatriz: opMatriz, passosMatriz: passosMatriz, opCota: opCota, offsetCota: offsetCota, desenhoCota: desenhoCota,
    tipoNoEstado: tipoNoEstado, aplicarOp: aplicarOp, validaOp: validaOp, registrar: registrar, glifoSvg: glifoSvg,
    /* P4 — Modificar */
    segmentoPerto: segmentoPerto, cantoPerto: cantoPerto, linhaDe: linhaDe, fixado: fixado, pontosSimilar: pontosSimilar, MSG_FIXO: MSG_FIXO,
    opAlinhar: opAlinhar, opDeslocamento: opDeslocamento, opAparoCanto: opAparoCanto, opAparoAte: opAparoAte, opAparoVarios: opAparoVarios,
    opDividir: opDividir, opFixar: opFixar, opSimilar: opSimilar, opCorresponderTipo: opCorresponderTipo, opEscala: opEscala
  };
  if (global.BimEdit) registrar(global.BimEdit);
  global.BimPrecisao = BimPrecisao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPrecisao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

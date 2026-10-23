/* =====================================================================
 * esqabertura.js — A ÁREA QUE ABRE de uma esquadria, pela GEOMETRIA da família (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Decisão do dono (21/10/2026): o Código de Obras mede a ILUMINAÇÃO pela área do VÃO ("área das aberturas") e a VENTILAÇÃO pela
 * área que ABRE da esquadria. Esta função devolve a segunda, SEM fator inventado por tipo: lê o que a família já declara
 * (js/familia.js › avaliar → solidos + partesMoveis) e calcula:
 *
 *   CORRER (translação): a folha que anda desliza sobre a outra. Abertura livre = largura interna do marco (Largura − 2·Marco)
 *     menos a união das folhas (com a folha móvel já deslocada do curso), vezes a altura da folha. Janela 1,20 × 1,00 de 2
 *     folhas dá ≈ 0,48 m² (40 % do vão), não 50 %: o marco e a sobreposição das folhas comem área.
 *   BASCULANTE / MAXIM-AR (rotação em eixo horizontal): cada folha de largura w e altura h gira θ (ângulo máximo declarado).
 *     A passagem do ar é o MENOR de duas áreas — a fresta no plano do marco, w·h·(1 − |cos θ|), e a "cortina" que o contorno
 *     da folha desenha ao abrir, w·Σ 2·r·sen(θ/2) (r = distância de cada borda horizontal ao eixo). O eixo no meio da folha
 *     (basculante) e no topo (maxim-ar) saem das fórmulas da própria família (parâmetro Maxim_ar).
 *   GIRO (rotação em eixo vertical, janela/porta de folha): o mesmo cálculo com o eixo vertical (a folha aberta 90° libera o vão da folha).
 *   Sem parte móvel declarada: 0 e `incerto: true` (pode ser fixa OU importada sem o movimento). Tipo de movimento que não sei medir
 *   (enrolar, gaveta…): 0 e `incerto: true` — conservador na conta, mas o auditor AVISA em vez de reprovar (revisão 21/10/2026).
 *
 *   EsqAbertura.areaQueAbre(av) → { area, vao, fracao, metodo, detalhe, fixa, incerto }   (av = Familia.avaliar(...))
 *   EsqAbertura.areaVao(av)     → largura × altura da abertura declarada pela família
 * Teste: node tools/test-esquadrias-lc524.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var RAD = Math.PI / 180;

  function areaVao(av) {
    var ab = av && av.abertura ? av.abertura : null;
    return ab ? Math.max(0, num(ab.largura, 0)) * Math.max(0, num(ab.altura, 0)) : 0;
  }
  function solidoPorId(av, id) { var s = arr(av && av.solidos); for (var i = 0; i < s.length; i++) if (String(s[i].id) === String(id)) return s[i]; return null; }

  /* união de intervalos [a, b] recortados em [lo, hi]: comprimento coberto */
  function cobertura(ints, lo, hi) {
    var L = ints.map(function (q) { return [Math.max(lo, q[0]), Math.min(hi, q[1])]; }).filter(function (q) { return q[1] > q[0]; }).sort(function (p, q) { return p[0] - q[0]; });
    var tot = 0, cur = null;
    L.forEach(function (q) { if (!cur) cur = [q[0], q[1]]; else if (q[0] <= cur[1]) cur[1] = Math.max(cur[1], q[1]); else { tot += cur[1] - cur[0]; cur = [q[0], q[1]]; } });
    if (cur) tot += cur[1] - cur[0];
    return tot;
  }

  /* folhas que correm: a móvel (declarada na parte) + as de mesma altura/espessura/base (a fixa) */
  function correr(av, partes) {
    var moveis = [], desloc = {};
    partes.forEach(function (p) {
      var v = arr(p.vetor), dx = num(v[0], 0);
      arr(p.solidos).forEach(function (id) { var s = solidoPorId(av, id); if (s) { moveis.push(s); desloc[String(s.id)] = dx; } });
    });
    if (!moveis.length) return null;
    var ref = moveis[0], folhas = arr(av.solidos).filter(function (s) {
      return Math.abs(num(s.dy, 0) - num(ref.dy, 0)) < 1e-6 && Math.abs(num(s.dz, 0) - num(ref.dz, 0)) < 1e-6 && Math.abs(num(s.y, 0) - num(ref.y, 0)) < 1e-6;
    });
    var v = av.valores || {}, larg = num(v.Largura, num(av.abertura && av.abertura.largura, 0)), marco = num(v.Marco, 0), livre = Math.max(0, larg - 2 * marco);
    var ints = folhas.map(function (s) { var d = desloc[String(s.id)] || 0, c = num(s.x, 0) + d; return [c - num(s.dx, 0) / 2, c + num(s.dx, 0) / 2]; });
    var coberto = cobertura(ints, -livre / 2, livre / 2), abertoL = Math.max(0, livre - coberto), alt = num(ref.dy, 0);
    return { area: abertoL * alt, metodo: "correr", detalhe: "janela/porta de correr: abertura livre " + f2(abertoL) + " m (folha móvel desloca " + f2(Math.abs(num(arr(partes[0].vetor)[0], 0))) + " m sobre a outra) × altura da folha " + f2(alt) + " m" };
  }

  /* rotação: eixo horizontal (basculante / maxim-ar) ou vertical (giro) */
  function girar(av, p) {
    var th = Math.abs(num(p.anguloMax, num(p.angulo, 0))) * RAD, dir = arr(p.eixoDir), pt = arr(p.eixoPonto), area = 0, nSol = 0;
    if (!(th > 0)) return { area: 0, metodo: "giro", detalhe: "ângulo de abertura nulo" };
    var horizontal = Math.abs(num(dir[0], 0)) > 0.9, vertical = Math.abs(num(dir[1], 0)) > 0.9;
    if (!horizontal && !vertical) return null;
    arr(p.solidos).forEach(function (id) {
      var s = solidoPorId(av, id); if (!s) return;
      nSol++;
      var w, h, e0, e1, ax;
      if (horizontal) { w = num(s.dx, 0); h = num(s.dy, 0); e0 = num(s.y, 0); e1 = e0 + h; ax = num(pt[1], 0); }
      else { h = num(s.dy, 0); w = num(s.dx, 0); e0 = num(s.x, 0) - w / 2; e1 = e0 + w; ax = num(pt[0], 0); }
      var ext = horizontal ? h : w, fixa = horizontal ? w : h;
      var fresta = Math.min(ext, ext * (1 - Math.abs(Math.cos(th))));
      var cortina = (2 * Math.abs(e0 - ax) + 2 * Math.abs(e1 - ax)) * Math.sin(th / 2);
      area += fixa * Math.max(0, Math.min(fresta, cortina));
    });
    return { area: area, metodo: horizontal ? "basculante/maxim-ar" : "giro", detalhe: (horizontal ? "folha(s) de eixo horizontal" : "folha de eixo vertical") + " aberta(s) " + Math.round(th / RAD) + "°: menor entre a fresta no plano do marco e a cortina do contorno" };
  }

  function areaQueAbre(av) {
    var vao = areaVao(av), partes = arr(av && av.partesMoveis), r;
    if (!av || av.ok === false) return { area: 0, vao: vao, fracao: 0, metodo: "sem avaliação", detalhe: "família não avaliada: ventilação não contada", fixa: false, incerto: true };
    /* REVISÃO (21/10/2026): família SEM parte móvel declarada não prova que a esquadria é fixa — a importada (.rfa, geometria de malha) e a
       cópia de obra antiga não declaram partes. Conta 0 mas marca INCERTO: o auditor avisa (não reprova) e o lançador não completa às cegas. */
    if (!partes.length) return { area: 0, vao: vao, fracao: 0, metodo: "fixa", detalhe: "a família não declara parte móvel (fixa, importada ou sem movimento cadastrado): ventilação não contada — conferir", fixa: true, incerto: true };
    var tr = partes.filter(function (p) { return p.movimento === "translacao" && p.tipo === "correr"; }), rot = partes.filter(function (p) { return p.movimento === "rotacao"; });
    var area = 0, det = [], metodo = [], incerto = false, tratadas = 0;
    if (tr.length) { r = correr(av, tr); if (r) { area += r.area; det.push(r.detalhe); metodo.push(r.metodo); tratadas += tr.length; } }
    rot.forEach(function (p) { var q = girar(av, p); if (q) { area += q.area; if (det.indexOf(q.detalhe) < 0) det.push(q.detalhe); if (metodo.indexOf(q.metodo) < 0) metodo.push(q.metodo); tratadas++; } });
    if (tratadas < partes.length) incerto = true;
    if (!tratadas) return { area: 0, vao: vao, fracao: 0, metodo: "desconhecido", detalhe: "tipo de movimento sem cálculo de abertura: ventilação não contada", fixa: false, incerto: true };
    if (vao > 0) area = Math.min(area, vao);
    return { area: r4(area), vao: r4(vao), fracao: vao > 0 ? r4(area / vao) : 0, metodo: metodo.join(" + "), detalhe: det.join("; ") + (incerto ? "; há parte móvel sem cálculo (não contada)" : ""), fixa: false, incerto: incerto };
  }

  var EsqAbertura = { areaQueAbre: areaQueAbre, areaVao: areaVao };
  global.EsqAbertura = EsqAbertura;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqAbertura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

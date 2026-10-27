/* =====================================================================
 * bimeixo.js — ARRASTE ORTOGONAL NO 3D (pedido do Rogério, 27/10/2026):
 *   "ao clicar e arrastar uma peça no 3D, o movimento fica SEMPRE travado num eixo: lado (X), frente/trás (Z) ou sobe/desce (Y)".
 *
 * COMO ERA: o arraste no 3D soltava o ponto no PLANO horizontal da peça (qualquer direção, em diagonal; nunca na vertical).
 * COMO FICA: nos primeiros ~8 px do mouse escolhe-se o eixo do MUNDO (X, Y ou Z) cuja direção NA TELA mais se alinha com o
 * movimento do mouse; o eixo fica travado até soltar. A distância andada é a projeção do movimento do mouse na direção do eixo
 * na tela (px -> metros pela escala do eixo naquele ponto). SHIFT (apertar) TROCA de eixo (X -> Z -> Y -> X): foi o mais
 * simples; o plano livre deixou de existir no 3D (o Shift já era "solta o encaixe" e passou a trocar o eixo). Mostra uma
 * linha-guia colorida (X vermelho, Y verde, Z azul: a convenção dos três eixos do 3D) e a distância.
 *
 * Este arquivo é o miolo PURO (Node-testável: tools/test-bimeixo.js) + a linha-guia (DOM, só no navegador). Quem arrasta
 * (js/biminstarr.js: tubo/conexão; js/bimprecisaoui.js: parede, pilar, viga, móvel, família...) só pergunta o eixo e a
 * distância; porta e janela continuam correndo SÓ na parede (js/bimvaoarr.js) e o telhado tem o dele.
 * ===================================================================== */
(function (global) {
  "use strict";
  var LIMIAR_PX = 8;
  var COR = { x: "#e03c31", y: "#2ea043", z: "#1f6feb" };
  var NOME = { x: "X (lado)", y: "Y (sobe/desce)", z: "Z (frente/trás)" };
  var ORDEM = ["x", "z", "y"];
  var UNIT = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function dot2(a, b) { return a.x * b.x + a.y * b.y; }
  function len2(a) { return Math.sqrt(dot2(a, a)); }

  /* vet = { x:{x,y}, y:{x,y}, z:{x,y} }: onde 1 m de cada eixo do mundo cai NA TELA (px). mov = deslocamento do mouse (px) */
  function escolher(mov, vet) {
    if (!mov || !vet || len2(mov) < LIMIAR_PX) return null;
    var cand = [], m = len2(mov), ms = -1;
    ["x", "z", "y"].forEach(function (k) {
      var v = vet[k]; if (!v || !fin(v.x) || !fin(v.y)) return;
      var L = len2(v); if (L < 1e-6) return;   /* eixo apontado para a câmera: sem direção na tela */
      var c = Math.abs(dot2(mov, v)) / (m * L);
      cand.push({ k: k, c: c, L: L }); if (c > ms) ms = c;
    });
    /* empate (Y e Z caem ambos na vertical da tela, comum com a câmera baixa): vale o eixo de MAIOR comprimento na tela,
       o que está melhor condicionado (câmera de cima: Z; câmera na altura da peça: Y) */
    var melhor = null, mL = -1;
    cand.forEach(function (q) { if (q.c >= ms - 0.05 && q.L > mL) { mL = q.L; melhor = q.k; } });
    return melhor;
  }
  /* metros ao longo do eixo (com sinal) */
  function distancia(mov, v) {
    if (!mov || !v) return 0; var d = dot2(v, v); if (!(d > 1e-12)) return 0;
    return dot2(mov, v) / d;
  }
  function proximo(eixo) { var i = ORDEM.indexOf(eixo); return ORDEM[(i + 1) % ORDEM.length]; }
  /* o vetor-tela de cada eixo no ponto P do mundo, a partir de telaDe(x, y, z) -> { x, y } (ou null) */
  function vetores(telaDe, P) {
    var o = telaDe(P.x, P.y, P.z); if (!o) return null;
    /* passo curto (5 cm) e depois a escala por metro: a perspectiva de perto não é linear em 1 m (com 1 m o arraste de 20 cm saía com 8% de erro) */
    var H = 0.05;
    function d(ax) { var q = telaDe(P.x + ax.x * H, P.y + ax.y * H, P.z + ax.z * H); return q ? { x: (q.x - o.x) / H, y: (q.y - o.y) / H } : null; }
    return { x: d(UNIT.x), y: d(UNIT.y), z: d(UNIT.z) };
  }
  /* trava um deslocamento 3D no eixo: o componente dele, o resto zerado */
  function travar(d, eixo) {
    var u = UNIT[eixo]; if (!u || !d) return { x: 0, y: 0, z: 0 };
    var t = d.x * u.x + d.y * u.y + d.z * u.z;
    return { x: u.x * t, y: u.y * t, z: u.z * t };
  }

  /* ---------------- a linha-guia (navegador) */
  var gEl = null;
  function esconderGuia() { if (gEl) gEl.style.display = "none"; }
  function mostrarGuia(eixo, de, ate, metros) {
    var B = global.BIM, doc = global.document; if (!doc || !B || !B.telaDe || !COR[eixo]) return;
    var p1 = B.telaDe(de.x, de.y, de.z), p2 = B.telaDe(ate.x, ate.y, ate.z); if (!p1 || !p2) return;
    if (!gEl) {
      gEl = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); gEl.setAttribute("data-bim", "eixo-guia");
      gEl.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:62;overflow:visible";
      gEl.innerHTML = '<line stroke-width="3" stroke-linecap="round"></line><circle r="4"></circle><text font-size="12" font-weight="700" font-family="sans-serif"></text>';
      doc.body.appendChild(gEl);
    }
    var ln = gEl.childNodes[0], c = gEl.childNodes[1], tx = gEl.childNodes[2];
    ln.setAttribute("x1", p1.x); ln.setAttribute("y1", p1.y); ln.setAttribute("x2", p2.x); ln.setAttribute("y2", p2.y); ln.setAttribute("stroke", COR[eixo]);
    c.setAttribute("cx", p1.x); c.setAttribute("cy", p1.y); c.setAttribute("fill", COR[eixo]);
    tx.setAttribute("x", p2.x + 8); tx.setAttribute("y", p2.y - 8); tx.setAttribute("fill", COR[eixo]);
    tx.textContent = eixo.toUpperCase() + " " + (Math.round(Math.abs(metros) * 1000) / 10) + " cm";
    gEl.setAttribute("data-eixo", eixo); gEl.setAttribute("data-m", String(Math.round(metros * 10000) / 10000));
    gEl.style.display = "block";
  }

  global.BimEixo = { LIMIAR_PX: LIMIAR_PX, COR: COR, NOME: NOME, ORDEM: ORDEM, UNIT: UNIT, escolher: escolher, distancia: distancia, proximo: proximo, vetores: vetores, travar: travar, mostrarGuia: mostrarGuia, esconderGuia: esconderGuia };
  if (typeof module !== "undefined" && module.exports) module.exports = global.BimEixo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

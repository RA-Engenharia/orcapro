/* =====================================================================
 * biminstgeoreal.js — PEÇA DE LOJA: utilitários comuns do realismo das conexões (06/11/2026).
 *
 * Pedido do Rogério (06/11/2026): "todas as conexões, o mais real possível … pode colocar o logo e a marcação do
 * fabricante, como o nome TIGRE no tubo". Aqui fica o que serve a qualquer família (esgoto, água fria…):
 *   · faixa(...)       — a CASCA FINA da marcação: um arco de superfície em volta do eixo, 0,08 mm acima da peça, com
 *                        coordenadas de textura (u ao longo do eixo, v em volta). Leve: 2 × nA × nS triângulos.
 *   · textoMarca(...)  — o texto gravado na peça (fabricante · linha · DN · norma), como na foto do catálogo.
 *   · canvasMarca(...) — (navegador) a textura da marcação: letras em RELEVO da mesma cor da peça (sombra e luz de
 *                        1 px), fundo transparente; cache por texto e cor.
 * A geometria (js/biminstgeo.js) devolve a faixa como parte { papel: "marca", texto, malha } — só no nível Alto.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  /* a faixa: centro do eixo C (m), direção d, referência angular ref (o meio da faixa aponta para ela), raio r (m),
     de s0 a s1 (m, ao longo de d), abertura ang (rad); nA divisões em volta, nS ao longo (1 basta numa superfície reta).
     raioEm(s) opcional: o raio em cada s (superfície que afina). Devolve { pos, nrm, idx, uv, cascas } */
  function faixa(C, d, ref, r, s0, s1, ang, nA, nS, raioEm, girar) {
    d = nrm(d); var e1 = nrm([ref[0] - d[0] * dot(ref, d), ref[1] - d[1] * dot(ref, d), ref[2] - d[2] * dot(ref, d)]);
    if (Math.abs(dot(e1, e1) - 1) > 1e-6) { var t = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; e1 = nrm(cross(t, d)); }
    var e2 = cross(d, e1), pos = [], nr = [], uv = [], idx = [];
    nA = Math.max(2, nA | 0); nS = Math.max(1, nS | 0);
    for (var j = 0; j <= nS; j++) {
      var s = s0 + (s1 - s0) * j / nS, rr = raioEm ? raioEm(s) : r;
      for (var i = 0; i <= nA; i++) {
        var a = -ang / 2 + ang * i / nA, ca = Math.cos(a), sa = Math.sin(a), n = [e1[0] * ca + e2[0] * sa, e1[1] * ca + e2[1] * sa, e1[2] * ca + e2[2] * sa];
        pos.push(C[0] + d[0] * s + n[0] * rr, C[1] + d[1] * s + n[1] * rr, C[2] + d[2] * s + n[2] * rr);
        nr.push(n[0], n[1], n[2]);
        if (girar) uv.push(i / nA, j / nS); else uv.push(j / nS, 1 - i / nA);   /* (u ao longo de d) × (v) = normal para fora: o texto não sai espelhado */   /* girar: o texto corre EM VOLTA da peça (trecho liso curto) */
      }
    }
    for (var j2 = 0; j2 < nS; j2++) for (var i2 = 0; i2 < nA; i2++) {
      var A = j2 * (nA + 1) + i2, B = A + 1, D = A + nA + 1, E = D + 1;
      idx.push(A, B, D, B, E, D);   /* normal para FORA (d × t aponta para dentro) */
    }
    return { pos: pos, nrm: nr, idx: idx, uv: uv, cascas: [] };
  }
  /* o texto da marcação: fabricante · linha · DN · norma (o que vem gravado na peça da foto do catálogo) */
  var LINHA = { pvc_esgoto: "ESGOTO", pvc_serie_r: "ESGOTO SÉRIE R", pvc_soldavel: "ÁGUA FRIA" };
  var NORMA = { pvc_esgoto: "NBR 5688", pvc_serie_r: "NBR 5688", pvc_soldavel: "NBR 5648" };
  function textoMarca(fabricante, material, dn, curto) {
    /* na CONEXÃO (curto) a gravação é a do molde: fabricante · DN · norma; no tubo, a impressão inteira com a linha */
    return [String(fabricante || "").toUpperCase(), curto ? "" : (LINHA[material] || ""), "DN " + dn, NORMA[material] || ""].filter(Boolean).join("  ·  ");
  }
  /* (navegador) a textura: letras em relevo — a sombra 1 px abaixo/direita e a luz 1 px acima/esquerda, na cor da
     peça um tom abaixo; proporção da faixa (largura/altura) = aspecto. Cache por texto|cor|aspecto */
  var CANV = {};
  function canvasMarca(texto, corBase, aspecto, impressa) {
    if (typeof document === "undefined") return null;
    var k = texto + "|" + corBase + "|" + Math.round(aspecto * 10) + (impressa ? "|i" : "");
    if (CANV[k]) return CANV[k];
    var H = 64, W = Math.max(128, Math.min(2048, Math.round(H * aspecto / 4) * 4)), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d"); g.clearRect(0, 0, W, H);
    var fs = Math.round(H * 0.62); g.font = "700 " + fs + "px Arial, Helvetica, sans-serif"; g.textBaseline = "middle"; g.textAlign = "center";
    var larg = g.measureText(texto).width; if (larg > W * 0.94) { fs = Math.floor(fs * W * 0.94 / larg); g.font = "700 " + fs + "px Arial, Helvetica, sans-serif"; }
    var c = hex(corBase || "#E9E9E5"), esc = function (f) { return "rgba(" + Math.round(c[0] * f) + "," + Math.round(c[1] * f) + "," + Math.round(c[2] * f) + ",1)"; };
    if (impressa) { g.fillStyle = "rgba(38,40,44,0.92)"; g.fillText(texto, W / 2, H / 2); CANV[k] = cv; return cv; }   /* TUBO: a tinta escura da impressão */
    g.fillStyle = "rgba(255,255,255,0.7)"; g.fillText(texto, W / 2 - 1.5, H / 2 - 1.5);   /* a luz na borda de cima */
    g.fillStyle = esc(0.42); g.fillText(texto, W / 2 + 1.5, H / 2 + 1.5);                /* a sombra embaixo */
    g.fillStyle = esc(0.66); g.fillText(texto, W / 2, H / 2);                              /* o relevo, um tom abaixo da peça */
    CANV[k] = cv; return cv;
  }
  function hex(h) { var s = String(h).replace("#", ""); if (s.length === 3) s = s.split("").map(function (x) { return x + x; }).join(""); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; }
  var HidGeoReal = { faixa: faixa, textoMarca: textoMarca, canvasMarca: canvasMarca, LINHA: LINHA, NORMA: NORMA };
  global.HidGeoReal = HidGeoReal;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGeoReal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

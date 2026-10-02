/* =====================================================================
 * bimabertura.js — O CRISTAL ORÇAPRO DO BIM: estados, abertura "caixa de presente", giro do cubo e bússola.
 * Motor PURO (ES5, Node-testável). Quem desenha é o bim/cristal.js + o js/bim.js; aqui só se decide o quê e quando.
 * Especificação: ESPEC-BIM-CUBO-LOGO.md (pedido do Rogério, 02/10/2026).
 *
 * ⚠ O CRISTAL NUNCA ENTRA NO MODELO: cena separada (overlay). Nada daqui toca peça, exportação ou RA.
 * ⚠ "REDUZIR MOVIMENTO" (preferência do sistema — e o Chrome sem tela das e2e) → sem animação: os estados
 *   vão direto ao fim (`quadro` devolve o último quadro), a estrela fica acesa sem piscar.
 * ⚠ ÂNGULOS DA CÂMERA: azimute 0° = olhando para o NORTE (−Z da cena = +Y do IFC enquanto o modelo não tiver
 *   norte verdadeiro), crescendo no sentido horário visto de cima (90° = olhando para o leste, +X).
 * ===================================================================== */
(function (global) {
  "use strict";

  var DUR = 2200, DUR_CURTA = 800;
  var ESTADOS = { centro: 1, carregando: 1, abrindo: 1, cubo: 1 };
  /* máquina de estados: evento → próximo estado (o que não está aqui não muda nada) */
  var TRANS = {
    centro: { carregar: "carregando", pronto: "abrindo" },
    carregando: { pronto: "abrindo", falhou: "centro" },
    abrindo: { fim: "cubo", pular: "cubo" },
    cubo: { fecharTudo: "centro", carregar: "cubo" }
  };
  function proximo(estado, evento) {
    var t = TRANS[estado] || {};
    return t[evento] || estado;
  }

  function lim(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fatia(t, a, b) { return lim((t - a) / (b - a), 0, 1); }
  /* curvas de suavização */
  function suave(x) { return x * x * (3 - 2 * x); }                                   // ease-in-out
  function sai(x) { return 1 - Math.pow(1 - x, 3); }                                   // ease-out cúbico
  function passaDoPonto(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); } // ease-out-back

  /* o quadro da abertura no instante t (ms). Tudo de 0 a 1 (ou graus), para o desenho só aplicar.
     0–250 respira · 250–900 tampa abre e laterais caem, luz e zoom · 900–1700 o modelo sai e cresce ·
     1700–2200 o cristal se refaz pequeno e voa para o canto (vira o cubo) */
  function quadro(t, opts) {
    opts = opts || {};
    if (opts.semMovimento) t = DUR;
    var r = fatia(t, 0, 250), ab = fatia(t, 250, 900), mo = fatia(t, 900, 1700), cu = fatia(t, 1700, DUR);
    return {
      t: lim(t, 0, DUR), fim: t >= DUR,
      respira: Math.sin(r * Math.PI) * 0.08,                          // aperta e solta (escala +8 %)
      luz: lim(r + ab * 1.5 - mo, 0, 1.6),                             // luz interna sobe e cai
      tampaGraus: suave(ab) * 115,                                     // a tampa gira na dobradiça
      ladosGraus: suave(fatia(t, 380, 900)) * 100,                     // as 4 laterais caem para fora
      explosao: ab > 0 && mo < 1 ? Math.sin(fatia(t, 300, 1300) * Math.PI) : 0, // feixe/partículas
      zoom: suave(ab) * (1 - suave(cu)),                               // a câmera entra e volta
      modeloEscala: t < 900 ? 0.05 : 0.05 + 0.95 * passaDoPonto(mo),   // o modelo sai de dentro e cresce
      modeloVisivel: t >= 900,
      cristalOpac: 1 - suave(fatia(t, 1200, 1700)) + suave(cu),        // some enquanto o modelo cresce e volta pequeno
      paraOCanto: sai(cu)                                               // 0 = centro, 1 = canto (já é o cubo)
    };
  }
  /* 2º modelo com o primeiro na tela: o cubo pisca e o modelo novo cresce no lugar (0,8 s) */
  function quadroCurto(t, opts) {
    opts = opts || {};
    if (opts.semMovimento) t = DUR_CURTA;
    var a = fatia(t, 0, 250), b = fatia(t, 150, DUR_CURTA);
    return { t: lim(t, 0, DUR_CURTA), fim: t >= DUR_CURTA, pisca: Math.sin(a * Math.PI), feixe: Math.sin(fatia(t, 100, 500) * Math.PI), modeloEscala: 0.2 + 0.8 * passaDoPonto(b) };
  }

  /* as barras do logo como barra de progresso do carregamento: enchem uma depois da outra */
  function barras(progresso) {
    var p = lim(+progresso || 0, 0, 1) * 3;
    return [lim(p, 0, 1), lim(p - 1, 0, 1), lim(p - 2, 0, 1)];
  }
  /* a estrela pisca: período 1,6 s; "forte" ao abrir o BIM (3 s), "suave" no cubo do canto, "acesa" sem movimento */
  function estrela(tSeg, modo) {
    if (modo === "acesa") return { escala: 1, brilho: 1.2 };
    var f = (Math.sin((tSeg / 1.6) * Math.PI * 2 - Math.PI / 2) + 1) / 2;   // 0..1
    if (modo === "suave") return { escala: 1 + 0.06 * f, brilho: 0.8 + 0.5 * f };
    return { escala: 1 + 0.25 * f, brilho: 0.6 + 1.4 * f };
  }

  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  /* giro do cubo pelo passo escolhido: ◀▶ no azimute, ▲▼ na elevação (travada em ±89° — nunca vira de cabeça) */
  function girar(az, el, direcao, passo) {
    passo = +passo || 90;
    if (direcao === "esquerda") az -= passo;
    else if (direcao === "direita") az += passo;
    else if (direcao === "cima") el += passo;
    else if (direcao === "baixo") el -= passo;
    return { az: norm360(az), el: lim(el, -89, 89) };
  }
  /* direção de olhar da câmera (cena Y-up: x leste, z sul) → azimute/elevação */
  function anguloDaCamera(dx, dy, dz) {
    var h = Math.sqrt(dx * dx + dz * dz);
    return { az: norm360(Math.atan2(dx, -dz) * 180 / Math.PI), el: Math.atan2(-dy, h) * 180 / Math.PI };
  }
  /* azimute/elevação → posição da câmera olhando o alvo a uma distância */
  function posicaoDaCamera(alvo, dist, az, el) {
    var a = az * Math.PI / 180, e = el * Math.PI / 180;
    var dx = Math.sin(a) * Math.cos(e), dy = -Math.sin(e), dz = -Math.cos(a) * Math.cos(e);
    return { x: alvo.x - dx * dist, y: alvo.y - dy * dist, z: alvo.z - dz * dist };
  }
  /* bússola: 8 setores de 45° centrados em N, NE, L, SE, S, SO, O, NO */
  var ROSA = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  function letra(az) { return ROSA[Math.floor(norm360(az + 22.5) / 45) % 8]; }

  var BimAbertura = { DUR: DUR, DUR_CURTA: DUR_CURTA, ESTADOS: ESTADOS, ROSA: ROSA, proximo: proximo, quadro: quadro, quadroCurto: quadroCurto,
    barras: barras, estrela: estrela, girar: girar, anguloDaCamera: anguloDaCamera, posicaoDaCamera: posicaoDaCamera, letra: letra,
    suave: suave, passaDoPonto: passaDoPonto };
  global.BimAbertura = BimAbertura;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAbertura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

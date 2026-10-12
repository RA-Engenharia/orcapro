/* =====================================================================
 * metaldicas.js — METÁLICA: biblioteca de ILUSTRAÇÕES das dicas dos
 * comandos (motor de dados PURO, ES5, sem DOM, Node-testável).
 *
 * O QUE É: para cada comando/conceito da Metálica (ex.: "Clipe de terça")
 * há um cartão com título, "o que é", "onde se usa", uma dica prática e um
 * desenho técnico simples (SVG em texto) mostrando o elemento em destaque.
 * A tela apenas pega o texto do SVG e põe no cartão; aqui não há DOM.
 *
 * O QUE NÃO É: não dimensiona nada e não traz coeficiente, tabela nem
 * resistência de norma. Os desenhos são ESQUEMAS DIDÁTICOS, sem escala:
 * as proporções e as zonas (ex.: A1..H da NBR 6123) servem para reconhecer
 * a peça e o lugar dela — os valores vêm do projeto e da norma vigente.
 *
 * PADRÃO DO DESENHO (igual para todos)
 *   viewBox 0 0 320 200, fundo transparente, sem fonte externa, sem imagem,
 *   sem script. Traço principal #1d2733 1.6 · aço #c5d0dc / #4f6275 ·
 *   ELEMENTO DA DICA #e9a23b / #a86a10 · parafuso #3a4652 · concreto
 *   #d6d1c7 com pontos · cotas e auxiliares #8a94a3 tracejado · texto 11.
 *
 * API
 *   MetalDicas.ITENS  { id: { titulo, oQueE, ondeUsa, dica, svg } }
 *   MetalDicas.obter(id)  → o item ou null
 *   MetalDicas.ids()      → lista de ids (ordem de cadastro)
 * ===================================================================== */
(function (global) {
  "use strict";

  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", DST = "#e9a23b", DSTL = "#a86a10",
      PAR = "#3a4652", CONC = "#d6d1c7", AUX = "#8a94a3", GRT = "#ece8de";

  /* ---------- pequenas peças de desenho (devolvem texto SVG) ---------- */
  function ln(x1, y1, x2, y2, c, w, d) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (c || INK) +
      '" stroke-width="' + (w || 1.6) + '"' + (d ? ' stroke-dasharray="' + d + '"' : "") + "/>";
  }
  function ax(x1, y1, x2, y2) { return ln(x1, y1, x2, y2, AUX, 0.8, "3 3"); }
  function tx(x, y, s, a) {
    return '<text x="' + x + '" y="' + y + '" font-size="11" font-family="sans-serif" fill="' + INK +
      '" text-anchor="' + (a || "start") + '">' + s + "</text>";
  }
  function fillOf(k) {
    if (k === "h") return 'fill="' + DST + '" stroke="' + DSTL + '" stroke-width="1.2"';
    if (k === "c") return 'fill="' + CONC + '" stroke="' + INK + '" stroke-width="1"';
    if (k === "p") return 'fill="' + PAR + '" stroke="' + PAR + '" stroke-width="1"';
    if (k === "g") return 'fill="' + GRT + '" stroke="' + AUX + '" stroke-width="0.8"';
    if (k === "n") return 'fill="none" stroke="' + INK + '" stroke-width="1.6"';
    if (k === "d") return 'fill="none" stroke="' + AUX + '" stroke-width="0.8" stroke-dasharray="3 3"';
    return 'fill="' + ACO + '" stroke="' + ACOL + '" stroke-width="1.2"';
  }
  function rc(x, y, w, h, k) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" ' + fillOf(k) + "/>";
  }
  function pg(pts, k) {
    var s = [], i;
    for (i = 0; i < pts.length; i++) s.push(pts[i][0] + "," + pts[i][1]);
    return '<polygon points="' + s.join(" ") + '" ' + fillOf(k) + ' stroke-linejoin="miter"/>';
  }
  function ci(cx, cy, r, k) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" ' + fillOf(k || "p") + "/>";
  }
  /* perfil/barra esbelta desenhada como linha dupla (contorno + miolo) */
  function mem(x1, y1, x2, y2, k, t) {
    t = t || 6;
    var hi = (k === "h");
    return ln(x1, y1, x2, y2, hi ? DSTL : ACOL, t + 2.4) + ln(x1, y1, x2, y2, hi ? DST : ACO, t);
  }
  function pl(pts, k, t) {
    t = t || 5;
    var s = [], i, hi = (k === "h");
    for (i = 0; i < pts.length; i++) s.push(pts[i][0] + "," + pts[i][1]);
    s = s.join(" ");
    return '<polyline points="' + s + '" fill="none" stroke="' + (hi ? DSTL : ACOL) + '" stroke-width="' + (t + 2.4) +
      '" stroke-linejoin="miter"/><polyline points="' + s + '" fill="none" stroke="' + (hi ? DST : ACO) +
      '" stroke-width="' + t + '" stroke-linejoin="miter"/>';
  }
  function dh(x1, x2, y, s) {
    return ax(x1, y, x2, y) + ln(x1, y - 3, x1, y + 3, AUX, 0.8) + ln(x2, y - 3, x2, y + 3, AUX, 0.8) +
      (s ? tx((x1 + x2) / 2, y - 4, s, "middle") : "");
  }
  function dv(x, y1, y2, s) {
    return ax(x, y1, x, y2) + ln(x - 3, y1, x + 3, y1, AUX, 0.8) + ln(x - 3, y2, x + 3, y2, AUX, 0.8) +
      (s ? tx(x + 5, (y1 + y2) / 2 + 4, s, "start") : "");
  }
  function arr(x1, y1, x2, y2, c) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = 8, W = 3.4, bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
    var p1 = [bx - W * Math.sin(a), by + W * Math.cos(a)], p2 = [bx + W * Math.sin(a), by - W * Math.cos(a)];
    function r(v) { return Math.round(v * 10) / 10; }
    return ln(x1, y1, bx, by, c || INK, 1.6) + '<polygon points="' + x2 + "," + y2 + " " + r(p1[0]) + "," + r(p1[1]) + " " +
      r(p2[0]) + "," + r(p2[1]) + '" fill="' + (c || INK) + '"/>';
  }
  /* solda: triângulo preto pequeno (sx, sy = lado para onde abre) */
  function wd(x, y, sx, sy) {
    return '<polygon points="' + x + "," + y + " " + (x + 6 * sx) + "," + y + " " + x + "," + (y + 6 * sy) + '" fill="#000000"/>';
  }
  function dots(x, y, w, h) {
    var d = [], i, j, k = 0;
    for (j = 12; j < h; j += 22) {
      for (i = 12 + ((k++ % 2) ? 11 : 0); i < w - 4; i += 22) d.push("M" + (x + i) + " " + (y + j) + "h0.1");
    }
    return '<path d="' + d.join("") + '" stroke="#8f8a7e" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
  }
  function conc(x, y, w, h) { return rc(x, y, w, h, "c") + dots(x, y, w, h); }
  function ground(x1, x2, y) {
    var d = [], x;
    for (x = x1 + 6; x <= x2; x += 10) d.push("M" + x + " " + y + "l-6 6");
    return ln(x1, y, x2, y, INK, 1.6) + '<path d="' + d.join("") + '" stroke="' + AUX + '" stroke-width="0.8" fill="none"/>';
  }
  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">' + inner + "</svg>";
  }

  /* pórtico em elevação: vão 60..260, beiral y=88, cumeeira (160,52), base y=168 */
  function frame(hp, hv) {
    return mem(60, 88, 160, 52, hv ? "h" : "a", 7) + mem(160, 52, 260, 88, hv ? "h" : "a", 7) +
      mem(60, 168, 60, 88, hp ? "h" : "a", 7) + mem(260, 168, 260, 88, hp ? "h" : "a", 7) +
      ground(30, 290, 170);
  }
  function roofY(x) { return 88 - 0.36 * (Math.min(x, 320 - x) - 60); }

  /* ---------- as cenas ---------- */
  var CENA = {};

  CENA["portico-alma-cheia"] = function () {
    return frame(true, true) + tx(10, 132, "Pilar") + tx(100, 60, "Viga", "middle") + tx(160, 44, "Cumeeira", "middle") +
      tx(4, 82, "Joelho") + tx(60, 192, "Base", "middle") + dh(60, 260, 22, "vão") + dv(272, 88, 168, "altura");
  };

  CENA["portico-trelicado"] = function () {
    var s = "", i, xt = [60, 110, 160, 210, 260], xb = [85, 135, 185, 235];
    s += mem(60, 168, 60, 88, "a", 7) + mem(260, 168, 260, 88, "a", 7) + ground(30, 290, 170);
    s += mem(60, 88, 160, 52, "h", 4) + mem(160, 52, 260, 88, "h", 4) + mem(60, 100, 260, 100, "h", 4);
    for (i = 0; i < 4; i++) {
      s += mem(xt[i], roofY(xt[i]), xb[i], 100, "h", 2.4) + mem(xb[i], 100, xt[i + 1], roofY(xt[i + 1]), "h", 2.4);
    }
    return s + tx(160, 42, "Banzo superior", "middle") + tx(160, 122, "Banzo inferior", "middle") +
      tx(98, 150, "Diagonais") + tx(10, 132, "Pilar") + dh(60, 260, 20, "vão");
  };

  CENA["pilar"] = function () {
    return frame(true, false) + tx(10, 132, "Pilar") + tx(268, 132, "Pilar") + tx(160, 44, "Viga", "middle") +
      tx(60, 192, "Placa de base", "middle") + dv(36, 88, 168, "H");
  };

  CENA["viga-cobertura"] = function () {
    return frame(false, true) + tx(80, 62, "Viga", "middle") + tx(240, 62, "Viga", "middle") +
      tx(160, 40, "Cumeeira", "middle") + tx(10, 132, "Pilar") + dh(60, 160, 22, "meia água");
  };

  CENA["misula"] = function () {
    return frame(false, false) + pg([[63, 90], [63, 122], [122, 69]], "h") + pg([[257, 90], [257, 122], [198, 69]], "h") +
      tx(70, 142, "Mísula") + tx(10, 62, "Viga") + tx(10, 76, "mais alta") + tx(10, 90, "no apoio") + tx(160, 40, "Cumeeira", "middle");
  };

  CENA["joelho"] = function () {
    return rc(60, 70, 40, 120, "a") + rc(108, 70, 190, 60, "a") + rc(100, 66, 8, 68, "h") +
      rc(92, 76, 22, 4, "p") + rc(92, 86, 22, 4, "p") + rc(92, 114, 22, 4, "p") + rc(92, 124, 22, 4, "p") +
      wd(108, 70, 1, -1) + wd(108, 130, 1, 1) + ground(30, 130, 190) +
      tx(10, 50, "Pilar") + tx(200, 56, "Viga") + tx(132, 156, "Chapa de extremidade") + ax(150, 144, 106, 130) +
      tx(180, 172, "Parafusos") + ax(205, 166, 112, 122) + tx(70, 36, "Joelho (canto)");
  };

  CENA["cumeeira"] = function () {
    return mem(30, 162, 157, 102, "a", 24) + mem(290, 162, 163, 102, "a", 24) + rc(155, 84, 10, 56, "h") +
      ci(160, 94, 3) + ci(160, 112, 3) + ci(160, 130, 3) + tx(160, 66, "Chapa de topo", "middle") + ax(160, 70, 160, 82) +
      tx(40, 120, "Viga") + tx(250, 120, "Viga") + tx(160, 162, "Cumeeira", "middle");
  };

  CENA["terca"] = function () {
    var g = rc(120, 100, 80, 7, "a") + rc(157, 107, 6, 48, "a") + rc(120, 155, 80, 7, "a") +
      pl([[170, 94], [170, 100], [140, 100], [140, 70], [170, 70], [170, 76]], "h", 3.4) +
      ln(110, 62, 120, 62) + ln(120, 62, 124, 56) + ln(124, 56, 134, 56) + ln(134, 56, 138, 62) + ln(138, 62, 160, 62) +
      ln(160, 62, 164, 56) + ln(164, 56, 174, 56) + ln(174, 56, 178, 62) + ln(178, 62, 210, 62) + ln(152, 62, 152, 70, PAR, 1.6);
    return '<g transform="rotate(-12 160 100)">' + g + "</g>" + tx(222, 60, "Telha") + tx(60, 74, "Terça (Ue)") +
      tx(160, 184, "Viga do pórtico", "middle") + tx(60, 150, "Mesa superior") + ax(130, 144, 130, 128);
  };

  CENA["clip-terca"] = function () {
    return rc(100, 130, 120, 7, "a") + rc(157, 137, 6, 43, "a") + rc(100, 180, 120, 7, "a") +
      pg([[150, 70], [157, 70], [157, 123], [190, 123], [190, 130], [150, 130]], "h") +
      pl([[190, 78], [190, 72], [161, 72], [161, 122], [190, 122], [190, 116]], "a", 3.4) +
      rc(143, 92, 4, 8, "p") + rc(147, 94, 20, 4, "p") + rc(167, 92, 4, 8, "p") +
      wd(190, 130, 1, -1) + wd(150, 130, -1, -1) +
      tx(10, 66, "Clipe (cantoneira)") + tx(196, 62, "Terça Ue") + tx(176, 106, "Parafuso na alma") +
      tx(200, 150, "Solda na mesa") + tx(10, 160, "Viga") + ax(90, 156, 100, 150);
  };

  CENA["corrente-terca"] = function () {
    var s = "", i, y, ys = [40, 70, 100, 130, 160];
    s += mem(50, 20, 50, 176, "a", 6) + mem(150, 20, 150, 176, "a", 6) + mem(250, 20, 250, 176, "a", 6);
    for (i = 0; i < ys.length; i++) s += mem(50, ys[i], 250, ys[i], "a", 4);
    for (i = 0; i < ys.length - 1; i++) {
      s += mem(100, ys[i], 100, ys[i + 1], "h", 2.4) + mem(200, ys[i], 200, ys[i + 1], "h", 2.4);
    }
    return s + tx(100, 14, "Corrente", "middle") + tx(200, 14, "Corrente", "middle") + tx(262, 44, "cumeeira") +
      tx(262, 164, "beiral") + tx(262, 104, "Terça") + tx(50, 198, "Viga", "middle") + dh(50, 150, 184, "vão da terça");
  };

  CENA["contraventamento-cobertura"] = function () {
    var s = "", i, ys = [40, 70, 100, 130, 160], xs = [50, 130, 210, 290];
    for (i = 0; i < xs.length; i++) s += mem(xs[i], 28, xs[i], 172, "a", 6);
    for (i = 0; i < ys.length; i++) s += mem(50, ys[i], 290, ys[i], "a", 3);
    s += mem(50, 40, 130, 160, "h", 3) + mem(130, 40, 50, 160, "h", 3);
    return s + tx(90, 18, "Contraventamento em X", "middle") + tx(90, 192, "vão extremo", "middle") +
      tx(170, 33, "Terça", "middle") + tx(210, 192, "Viga", "middle");
  };

  CENA["contraventamento-parede"] = function () {
    return mem(70, 40, 250, 40, "a", 7) + mem(70, 168, 70, 40, "a", 8) + mem(250, 168, 250, 40, "a", 8) +
      mem(70, 40, 250, 168, "h", 3) + mem(250, 40, 70, 168, "h", 3) + ground(40, 280, 170) +
      tx(160, 24, "Contraventamento vertical (X)", "middle") + tx(14, 108, "Pilar") + tx(264, 108, "Pilar") +
      tx(160, 192, "Placas de base", "middle");
  };

  CENA["tirante"] = function () {
    var s = "", fs = [0.25, 0.5, 0.75], i, x, y;
    s += mem(40, 150, 160, 70, "a", 3) + mem(280, 150, 160, 70, "a", 3);
    for (i = 0; i < fs.length; i++) {
      x = 40 + 120 * fs[i]; y = 150 - 80 * fs[i];
      s += rc(x - 5, y - 11, 10, 8, "a") + rc(320 - x - 5, y - 11, 10, 8, "a");
    }
    s += rc(154, 56, 12, 9, "a");
    s += mem(70, 129, 100, 109, "h", 2.4) + mem(100, 109, 130, 89, "h", 2.4) + mem(130, 89, 160, 69, "h", 2.4) +
      mem(250, 129, 220, 109, "h", 2.4) + mem(220, 109, 190, 89, "h", 2.4) + mem(190, 89, 160, 69, "h", 2.4);
    return s + tx(160, 44, "Cumeeira", "middle") + tx(50, 112, "Tirante") + tx(14, 176, "Beiral") + tx(250, 176, "Beiral") +
      tx(100, 70, "Terça") + ax(104, 74, 100, 94);
  };

  CENA["mao-francesa"] = function () {
    return rc(130, 120, 60, 6, "a") + rc(157, 126, 6, 34, "a") + rc(130, 160, 60, 6, "a") +
      mem(20, 114, 300, 114, "a", 10) + mem(190, 163, 244, 119, "h", 5) + ci(190, 163, 2.6) + ci(244, 119, 2.6) +
      tx(10, 150, "Viga:") + tx(10, 164, "mesa inferior") + tx(10, 178, "comprimida") +
      tx(214, 96, "Terça") + tx(212, 156, "Mão-francesa") + tx(60, 86, "Vista ao longo da viga");
  };

  CENA["viga-beiral"] = function () {
    return mem(50, 168, 50, 62, "a", 7) + mem(150, 168, 150, 62, "a", 7) + mem(250, 168, 250, 62, "a", 7) +
      mem(50, 62, 250, 62, "h", 8) + rc(95, 48, 14, 10, "a") + rc(190, 48, 14, 10, "a") + ln(30, 46, 270, 46) +
      rc(54, 72, 192, 94, "d") + ground(30, 280, 170) + tx(150, 30, "Telhado", "middle") + tx(100, 86, "Viga de beiral", "middle") +
      tx(4, 120, "Pilar") + tx(250, 192, "Fechamento lateral", "end");
  };

  CENA["travessa-fechamento"] = function () {
    var s = "", i, ys = [50, 80, 110, 140];
    s += mem(60, 168, 60, 36, "a", 8) + mem(240, 168, 240, 36, "a", 8) + ground(30, 270, 170);
    for (i = 0; i < ys.length; i++) s += mem(60, ys[i], 240, ys[i], "h", 5);
    s += rc(150, 42, 90, 124, "d");
    for (i = 0; i < 6; i++) s += ln(158 + i * 14, 42, 158 + i * 14, 166, ACOL, 1);
    return s + tx(100, 30, "Travessa (longarina)", "middle") + tx(195, 186, "Telha de fechamento", "middle") + tx(6, 108, "Pilar");
  };

  CENA["coluna-tapamento"] = function () {
    var s = "", xs = [100, 160, 220], i;
    s += mem(40, 168, 40, 100, "a", 7) + mem(280, 168, 280, 100, "a", 7) + mem(40, 100, 160, 50, "a", 6) + mem(160, 50, 280, 100, "a", 6);
    for (i = 0; i < xs.length; i++) s += mem(xs[i], 168, xs[i], roofY2(xs[i]) + 3, "h", 6);
    s += mem(40, 134, 280, 134, "a", 2.4) + ground(20, 300, 170);
    return s + tx(160, 38, "Oitão", "middle") + tx(100, 190, "Colunas de tapamento", "start") + tx(4, 92, "Pilar do pórtico") +
      tx(220, 128, "Travessa");
  };
  function roofY2(x) { return 100 - (50 / 120) * (Math.min(x, 320 - x) - 40); }

  /* placas de base */
  CENA["placa-base-rotulada"] = function () {
    return conc(40, 142, 240, 48) + rc(100, 136, 120, 6, "g") + rc(100, 128, 120, 8, "h") + rc(142, 30, 36, 98, "a") +
      ln(160, 24, 160, 128, AUX, 0.8, "6 3") + wd(142, 128, -1, -1) + wd(178, 128, 1, -1) +
      rc(133, 118, 4, 62, "p") + rc(183, 118, 4, 62, "p") + rc(128, 110, 14, 8, "p") + rc(178, 110, 14, 8, "p") +
      tx(228, 122, "Placa de base") + tx(228, 168, "Concreto") + tx(228, 138, "Graute") + tx(10, 50, "Pilar") +
      tx(10, 90, "2 chumbadores") + tx(10, 104, "perto do eixo") + tx(190, 60, "rótula: sem momento", "start");
  };

  CENA["placa-base-engastada"] = function () {
    return conc(30, 148, 260, 42) + rc(70, 142, 180, 6, "g") + rc(70, 132, 180, 10, "h") + rc(142, 30, 36, 102, "a") +
      pg([[142, 132], [142, 92], [110, 132]], "h") + pg([[178, 132], [178, 92], [210, 132]], "h") +
      rc(83, 120, 5, 62, "p") + rc(232, 120, 5, 62, "p") + rc(78, 112, 15, 8, "p") + rc(227, 112, 15, 8, "p") +
      dh(85, 235, 172, "braço grande") + tx(216, 86, "Enrijecedor") + ax(214, 90, 200, 112) +
      tx(10, 30, "Placa maior,") + tx(10, 44, "4 a 8 chumbadores") + tx(100, 188, "Concreto");
  };

  CENA["chumbador"] = function () {
    var haste = '<path d="M160 36V160Q160 180 180 180H196" fill="none" stroke="' + DSTL + '" stroke-width="8"/>' +
      '<path d="M160 36V160Q160 180 180 180H196" fill="none" stroke="' + DST + '" stroke-width="5.6"/>';
    return conc(80, 100, 160, 90) + rc(120, 94, 80, 6, "g") + rc(120, 86, 80, 8, "a") + haste +
      rc(146, 80, 28, 5, "a") + rc(150, 71, 20, 9, "p") + ln(154, 44, 166, 44, INK, 0.8) + ln(154, 52, 166, 52, INK, 0.8) + ln(154, 60, 166, 60, INK, 0.8) +
      tx(180, 78, "Porca e arruela") + tx(206, 92, "Placa de base") + tx(246, 108, "Graute") + tx(6, 60, "Barra roscada") + tx(6, 74, "(rosca no topo)") +
      tx(246, 184, "Gancho") + tx(246, 146, "Concreto");
  };

  CENA["chapa-extremidade"] = function () {
    var s = rc(40, 30, 100, 140, "h") + rc(52, 52, 76, 6, "d") + rc(87, 58, 6, 84, "d") + rc(52, 142, 76, 6, "d");
    var by = [44, 62, 138, 156], i;
    for (i = 0; i < by.length; i++) s += ci(62, by[i], 4) + ci(118, by[i], 4);
    s += rc(205, 30, 12, 140, "a") + rc(217, 38, 8, 124, "h") + rc(225, 62, 70, 4, "a") + rc(225, 134, 70, 4, "a") + rc(225, 66, 70, 68, "d");
    for (i = 0; i < by.length; i++) s += rc(200, by[i] - 2, 30, 4, "p");
    return s + tx(90, 186, "Vista frontal", "middle") + tx(240, 186, "Vista lateral", "middle") + tx(40, 24, "Chapa de extremidade") +
      tx(232, 24, "Parafusos") + tx(250, 100, "Viga");
  };

  CENA["cantoneira-dupla"] = function () {
    return rc(60, 20, 10, 160, "a") + rc(70, 96, 230, 8, "a") + pg([[70, 70], [78, 70], [78, 88], [170, 88], [170, 96], [70, 96]], "h") +
      pg([[70, 130], [78, 130], [78, 112], [170, 112], [170, 104], [70, 104]], "h") +
      rc(56, 78, 26, 4, "p") + rc(56, 118, 26, 4, "p") +
      rc(108, 84, 4, 32, "p") + rc(104, 80, 12, 4, "p") + rc(104, 116, 12, 4, "p") +
      rc(148, 84, 4, 32, "p") + rc(144, 80, 12, 4, "p") + rc(144, 116, 12, 4, "p") +
      tx(10, 14, "Pilar (mesa)") + tx(184, 80, "Cantoneira dupla") + tx(220, 130, "Alma da viga") + tx(120, 156, "Parafusos na alma");
  };

  CENA["emenda-cobrejunta"] = function () {
    var s = rc(30, 60, 125, 60, "a") + rc(165, 60, 125, 60, "a") + ln(30, 66, 155, 66, ACOL, 1) + ln(30, 114, 155, 114, ACOL, 1) +
      ln(165, 66, 290, 66, ACOL, 1) + ln(165, 114, 290, 114, ACOL, 1) +
      rc(120, 53, 90, 6, "h") + rc(120, 121, 90, 6, "h") + rc(125, 68, 80, 44, "h");
    var xs = [132, 152, 178, 198], i;
    for (i = 0; i < xs.length; i++) s += ci(xs[i], 56, 2.5) + ci(xs[i], 124, 2.5) + ci(xs[i], 82, 3) + ci(xs[i], 98, 3);
    return s + tx(160, 40, "Cobrejuntas das mesas", "middle") + tx(160, 150, "Cobrejunta da alma", "middle") + ax(160, 138, 160, 110) +
      dh(155, 165, 176, "folga") + tx(30, 190, "Viga A") + tx(260, 190, "Viga B");
  };

  CENA["gusset"] = function () {
    return pg([[110, 140], [110, 108], [160, 82], [210, 108], [210, 140]], "h") + mem(20, 130, 300, 130, "a", 8) +
      mem(40, 36, 160, 120, "a", 7) + mem(280, 36, 160, 120, "a", 7) + mem(160, 36, 160, 120, "a", 6) +
      ci(135, 125, 3) + ci(185, 125, 3) + ci(135, 108, 3) + ci(185, 108, 3) + ci(160, 100, 3) + ci(160, 134, 3) +
      tx(160, 166, "Chapa de nó (gusset)", "middle") + ax(160, 150, 160, 140) + tx(20, 112, "Banzo") + tx(46, 30, "Diagonal") +
      tx(166, 30, "Montante");
  };

  CENA["enrijecedor"] = function () {
    return rc(30, 78, 260, 52, "a") + rc(30, 70, 260, 8, "a") + rc(30, 130, 260, 8, "a") + rc(150, 78, 6, 52, "h") +
      rc(60, 78, 6, 52, "h") + wd(150, 78, -1, 1) + wd(156, 130, 1, -1) + wd(60, 130, -1, -1) +
      arr(153, 30, 153, 68) + arr(63, 176, 63, 142) + tx(170, 40, "Carga concentrada") +
      tx(72, 170, "Reação do apoio") + tx(170, 112, "Enrijecedor") + tx(230, 160, "Alma") + tx(230, 62, "Mesa");
  };

  /* soldas */
  CENA["solda-filete"] = function () {
    return rc(60, 120, 160, 10, "a") + rc(135, 50, 10, 70, "a") + pg([[145, 120], [165, 120], [145, 100]], "h") + pg([[135, 120], [115, 120], [135, 100]], "h") +
      dh(145, 165, 142, "a") + dv(180, 100, 120, "a") + ax(165, 120, 165, 146) + ax(145, 100, 184, 100) +
      arr(215, 60, 162, 106, INK) + ln(215, 60, 295, 60) + wd(240, 60, 1, 1) +
      tx(228, 80, "a", "middle") + tx(250, 52, "AWS: filete") + tx(60, 160, "Perna a") + tx(60, 174, "(lado do triângulo)") + tx(20, 90, "Solda de filete");
  };

  CENA["solda-penetracao"] = function () {
    return pg([[40, 100], [148, 100], [159, 128], [40, 128]], "a") + pg([[172, 100], [280, 100], [280, 128], [161, 128]], "a") +
      pg([[148, 100], [160, 96], [172, 100], [161, 128], [159, 128]], "h") +
      arr(215, 60, 170, 96, INK) + ln(215, 60, 295, 60) + '<polyline points="240,60 247,74 254,60" fill="none" stroke="#000000" stroke-width="1.6"/>' +
      tx(250, 52, "AWS: V", "middle") + tx(160, 150, "Raiz", "middle") + ax(160, 140, 160, 130) + tx(160, 84, "Reforço", "middle") +
      tx(40, 160, "Chanfro em V:") + tx(40, 174, "penetra a espessura toda") + tx(60, 90, "Chapa");
  };

  CENA["parafuso"] = function () {
    return rc(70, 57, 180, 16, "a") + rc(70, 73, 180, 16, "a") + rc(154, 52, 12, 78, "h") + rc(130, 36, 60, 16, "h") +
      rc(125, 52, 70, 5, "a") + rc(125, 89, 70, 5, "a") + rc(130, 94, 60, 16, "h") +
      ln(138, 102, 182, 102, DSTL, 0.8) + dv(270, 57, 89, "aperto") + dv(262, 110, 130, "3 fios") +
      tx(205, 46, "Cabeça") + tx(200, 99, "Arruela") + tx(200, 114, "Porca") +
      tx(20, 40, "Parafuso") + tx(20, 54, "sextavado") + tx(20, 160, "Projeção da ponta:") + tx(20, 174, "pelo menos a porca cheia");
  };

  /* telhas */
  CENA["telha-trapezoidal"] = function () {
    var pts = [], x0, k = [15, 115, 215];
    for (x0 = 0; x0 < 3; x0++) {
      pts.push([k[x0], 130], [k[x0] + 35, 130], [k[x0] + 45, 90], [k[x0] + 75, 90], [k[x0] + 85, 130]);
    }
    pts.push([315, 130]);
    return pl(pts, "h", 2.4) + ax(90, 90, 108, 90) + dv(106, 90, 130, "h = 40") + dh(15, 315, 168, "largura útil (módulo)") +
      tx(160, 56, "Telha trapezoidal TP-40 (seção)", "middle") + tx(60, 84, "Onda") + tx(18, 150, "Vale");
  };

  CENA["telha-sanduiche"] = function () {
    var top = [], x0, k = [30, 130, 230], i, s;
    for (x0 = 0; x0 < 3; x0++) top.push([k[x0], 80], [k[x0] + 25, 80], [k[x0] + 35, 62], [k[x0] + 65, 62], [k[x0] + 75, 80]);
    top.push([305, 80]);
    s = pg(top.concat([[305, 132], [30, 132]]), "g");
    s += pl(top, "h", 2.4) + pl([[30, 132], [305, 132]], "h", 2.4);
    return s + tx(30, 40, "Face externa (aço)") + tx(30, 168, "Face interna (aço)") + tx(160, 108, "Núcleo isolante", "middle") +
      dv(312, 80, 132, "") + tx(30, 184, "Peça única: isola e veda");
  };

  /* fechamentos */
  CENA["fechamento-alvenaria"] = function () {
    var s = "", i, y;
    s += mem(40, 168, 40, 30, "a", 8) + mem(280, 168, 280, 30, "a", 8) + ground(20, 300, 170);
    s += rc(44, 70, 232, 98, "h");
    for (i = 1; i < 5; i++) { y = 70 + i * 19.6; s += ln(44, Math.round(y), 276, Math.round(y), DSTL, 0.8); }
    for (i = 0; i < 5; i++) s += ln(100 + (i % 2) * 30, 70 + i * 19.6, 100 + (i % 2) * 30, 70 + (i + 1) * 19.6, DSTL, 0.8) + ln(190 + (i % 2) * 30, 70 + i * 19.6, 190 + (i % 2) * 30, 70 + (i + 1) * 19.6, DSTL, 0.8);
    s += rc(44, 58, 232, 12, "c");
    return s + tx(160, 130, "Alvenaria", "middle") + tx(160, 50, "Cinta de amarração", "middle") + tx(2, 104, "Pilar") + tx(160, 192, "Ligação com o pilar por tela ou barras", "middle");
  };

  CENA["fechamento-misto"] = function () {
    var s = "", i;
    s += mem(40, 168, 40, 30, "a", 8) + mem(280, 168, 280, 30, "a", 8) + ground(20, 300, 170);
    s += rc(44, 120, 232, 48, "h");
    for (i = 1; i < 3; i++) s += ln(44, 120 + i * 16, 276, 120 + i * 16, DSTL, 0.8);
    s += rc(44, 112, 232, 8, "c") + rc(44, 40, 232, 72, "a");
    for (i = 1; i < 15; i++) s += ln(44 + i * 15.5, 40, 44 + i * 15.5, 112, ACOL, 1);
    return s + dv(26, 120, 168, "h") + tx(160, 150, "Alvenaria", "middle") + tx(160, 80, "Telha de aço", "middle") +
      tx(160, 192, "Alvenaria até h; telha acima, presa nas travessas", "middle");
  };

  CENA["pre-moldado"] = function () {
    var s = "", i;
    s += mem(40, 168, 40, 20, "a", 8) + mem(160, 168, 160, 20, "a", 8) + mem(280, 168, 280, 20, "a", 8) + ground(20, 300, 170);
    for (i = 0; i < 5; i++) s += rc(46, 166 - (i + 1) * 28, 108, 26, "h");
    for (i = 0; i < 3; i++) s += rc(166, 166 - (i + 1) * 28, 108, 26, "h");
    s += rc(166, 40, 108, 26, "d") + arr(220, 8, 220, 36) + ci(48, 140, 2.4) + ci(152, 140, 2.4) + ci(48, 84, 2.4) + ci(152, 84, 2.4);
    return s + tx(100, 14, "Painéis pré-moldados", "middle") + tx(232, 20, "içamento") + tx(6, 100, "Pilar") + tx(160, 190, "Painéis encaixados entre os pilares", "middle");
  };

  /* vento */
  function galpaoPlanta() {
    return rc(90, 70, 160, 60, "a") + rc(95, 75, 150, 50, "d") + dh(90, 250, 62, "a (comprimento)") + dv(272, 70, 130, "b");
  }
  CENA["vento-0"] = function () {
    return galpaoPlanta() + arr(10, 86, 84, 86, INK) + arr(10, 100, 84, 100, INK) + arr(10, 114, 84, 114, INK) +
      tx(10, 40, "Vento 0°") + tx(10, 150, "(incide na face") + tx(10, 164, "de largura b)") + tx(120, 190, "Planta do galpão");
  };
  CENA["vento-90"] = function () {
    return galpaoPlanta() + arr(130, 196, 130, 136, INK) + arr(170, 196, 170, 136, INK) + arr(210, 196, 210, 136, INK) +
      tx(10, 40, "Vento 90°") + tx(10, 100, "(incide no") + tx(10, 114, "lado a)");
  };

  CENA["coef-pressao"] = function () {
    return rc(60, 40, 150, 50, "d") +
      rc(52, 40, 8, 50, "h") + rc(210, 40, 8, 50, "h") +
      rc(60, 32, 45, 8, "h") + rc(105, 32, 105, 8, "h") + rc(60, 90, 45, 8, "h") + rc(105, 90, 105, 8, "h") +
      tx(82, 29, "A1", "middle") + tx(158, 29, "A2", "middle") + tx(82, 110, "B1", "middle") + tx(158, 110, "B2", "middle") +
      tx(36, 69, "C", "middle") + tx(228, 69, "D", "middle") + arr(2, 52, 46, 52) + tx(250, 46, "Paredes") + tx(250, 60, "(planta)") +
      rc(60, 122, 150, 60, "a") + ln(135, 122, 135, 182, ACOL, 1) + ln(60, 152, 210, 152, ACOL, 1) +
      tx(97, 141, "E", "middle") + tx(97, 171, "F", "middle") + tx(172, 141, "G", "middle") + tx(172, 171, "H", "middle") +
      tx(222, 140, "Telhado") + tx(222, 154, "(planta)") + tx(222, 176, "Esquema");
  };

  CENA["abertura-dominante"] = function () {
    var s = "";
    s += mem(70, 90, 160, 60, "a", 4) + mem(160, 60, 250, 90, "a", 4) + mem(250, 170, 250, 90, "a", 5) +
      mem(70, 90, 70, 108, "a", 5) + mem(70, 150, 70, 170, "a", 5) + ground(40, 280, 170) +
      ln(70, 150, 40, 150, DSTL, 4) + ln(70, 150, 40, 150, DST, 2.4);
    s += arr(8, 128, 64, 128) + arr(8, 140, 64, 140) + arr(120, 112, 100, 84, INK) + arr(200, 112, 220, 84, INK) + arr(190, 135, 232, 135, INK) + arr(130, 135, 88, 135, INK);
    return s + tx(8, 118, "Vento") + tx(8, 186, "Portão aberto") + tx(160, 40, "Pressão interna", "middle") + tx(160, 52, "sobe com a abertura", "middle") +
      tx(130, 190, "Abertura dominante") ;
  };

  CENA["deformada"] = function () {
    var G = "#3f9e5a", Y = "#f0c419", R = "#d9473d";
    function dl(x1, y1, x2, y2, c) { return ln(x1, y1, x2, y2, c, 3.2, "6 3"); }
    return mem(60, 168, 60, 88, "a", 3) + mem(60, 88, 160, 52, "a", 3) + mem(160, 52, 260, 88, "a", 3) + mem(260, 168, 260, 88, "a", 3) + ground(30, 290, 170) +
      dl(60, 168, 65, 128, G) + dl(65, 128, 71, 92, Y) + dl(71, 92, 124, 76, Y) + dl(124, 76, 176, 62, R) + dl(176, 62, 226, 77, Y) +
      dl(226, 77, 273, 92, G) + dl(273, 92, 266, 128, G) + dl(266, 128, 260, 168, G) +
      rc(20, 14, 10, 8, "n").replace(/fill="none"/, 'fill="' + G + '"') + tx(34, 22, "pequeno") +
      rc(88, 14, 10, 8, "n").replace(/fill="none"/, 'fill="' + Y + '"') + tx(102, 22, "médio") +
      rc(150, 14, 10, 8, "n").replace(/fill="none"/, 'fill="' + R + '"') + tx(164, 22, "máximo") +
      tx(60, 192, "Deformada ampliada (tracejada)", "start");
  };

  CENA["flambagem-lateral"] = function () {
    return mem(50, 100, 270, 100, "a", 4) + ln(50, 70, 50, 130, INK, 1.6) + ln(270, 70, 270, 130, INK, 1.6) +
      '<path d="M50 100Q160 44 270 100" fill="none" stroke="' + DSTL + '" stroke-width="5"/><path d="M50 100Q160 44 270 100" fill="none" stroke="' + DST + '" stroke-width="3"/>' +
      arr(160, 100, 160, 60, AUX) + tx(160, 38, "Mesa comprimida sai de lado", "middle") + tx(50, 148, "Travamento", "middle") + tx(270, 148, "Travamento", "middle") +
      dh(50, 270, 124, "") + tx(160, 140, "comprimento destravado", "middle") +
      ln(130, 190, 190, 190, ACOL, 4) + ln(160, 190, 166, 168, ACOL, 3) + ln(150, 166, 182, 170, DST, 4) + tx(196, 176, "seção desloca e gira") + tx(10, 14, "Vista em planta (de cima)");
  };

  /* seções transversais */
  function secI(bf, d, tw, tf, x, y, extra) {
    var xm = x + bf / 2, a = xm - tw / 2, b = xm + tw / 2;
    return pg([[x, y], [x + bf, y], [x + bf, y + tf], [b, y + tf], [b, y + d - tf], [x + bf, y + d - tf], [x + bf, y + d], [x, y + d], [x, y + d - tf], [a, y + d - tf], [a, y + tf], [x, y + tf]], "h");
  }
  CENA["secao-w"] = function () {
    return secI(120, 130, 12, 14, 100, 35) + dh(100, 220, 24, "bf") + dv(240, 35, 165, "d") + dv(78, 35, 49, "tf") +
      ax(154, 165, 154, 182) + ax(166, 165, 166, 182) + dh(154, 166, 182) + tx(160, 196, "tw", "middle") + tx(20, 100, "Perfil I laminado");
  };
  CENA["secao-soldado"] = function () {
    return secI(100, 140, 8, 16, 110, 30) + wd(118, 46, -1, 1) + wd(118, 154, -1, -1) + wd(202, 46, 1, 1) + wd(202, 154, 1, -1) +
      dh(110, 210, 22, "bf") + dv(230, 30, 170, "d") + dv(88, 30, 46, "tf") + ax(156, 170, 156, 184) + ax(164, 170, 164, 184) + tx(160, 197, "tw", "middle") +
      tx(10, 100, "Perfil soldado") + tx(10, 114, "(chapas + solda)");
  };
  CENA["secao-ue"] = function () {
    return pl([[190, 58], [190, 40], [110, 40], [110, 160], [190, 160], [190, 142]], "h", 6) +
      dv(80, 40, 160, "bw") + dh(110, 190, 182, "bf") + dv(214, 40, 58, "D") + tx(140, 104, "t = espessura") + tx(222, 150, "Ue enrijecido");
  };
  CENA["secao-z"] = function () {
    return pl([[215, 58], [215, 40], [160, 40], [160, 160], [105, 160], [105, 142]], "h", 6) +
      dv(134, 40, 160, "bw") + dh(160, 215, 30, "bf") + dv(236, 40, 58, "D") + dh(105, 160, 182, "bf") + tx(176, 104, "t = espessura") + tx(240, 150, "Z enrijecido");
  };
  CENA["secao-u"] = function () {
    return pg([[100, 40], [200, 40], [200, 52], [114, 52], [114, 148], [200, 148], [200, 160], [100, 160]], "h") +
      dv(80, 40, 160, "d") + dh(100, 200, 30, "bf") + ax(100, 160, 100, 180) + ax(114, 160, 114, 180) + tx(107, 195, "tw", "middle") +
      dv(222, 40, 52, "tf") + tx(222, 110, "U");
  };
  CENA["secao-cantoneira"] = function () {
    return pg([[90, 40], [104, 40], [104, 146], [210, 146], [210, 160], [90, 160]], "h") +
      dv(70, 40, 160, "b") + dh(90, 210, 182, "b") + dh(90, 104, 30, "t") + tx(230, 100, "Cantoneira L") + tx(230, 114, "(abas iguais)");
  };
  CENA["secao-tubo-retangular"] = function () {
    return '<path d="M90 50h140v100h-140z M98 58h124v84h-124z" fill-rule="evenodd" fill="' + DST + '" stroke="' + DSTL + '" stroke-width="1.2"/>' +
      dv(252, 50, 150, "h") + dh(90, 230, 40, "b") + dh(90, 98, 172) + tx(94, 190, "t", "middle") + tx(40, 100, "Tubo") + tx(30, 114, "retangular");
  };
  CENA["secao-tubo-circular"] = function () {
    return '<path d="M100 100a60 60 0 1 0 120 0a60 60 0 1 0 -120 0z M108 100a52 52 0 1 0 104 0a52 52 0 1 0 -104 0z" fill-rule="evenodd" fill="' + DST + '" stroke="' + DSTL + '" stroke-width="1.2"/>' +
      ax(100, 160, 100, 180) + ax(220, 160, 220, 180) + dh(100, 220, 180, "D") + dv(176, 40, 48, "t") + tx(230, 100, "Tubo circular") ;
  };

  /* ---------- textos ---------- */
  var DEF = [
    ["portico-alma-cheia", "Pórtico de alma cheia",
      "Conjunto de pilares e vigas em perfis de alma cheia, ligados por joelhos rígidos, que resiste sozinho às cargas no plano transversal do galpão.",
      "Galpões industriais e comerciais, em geral com vãos médios e grandes.",
      "Confira a rigidez dos joelhos e das bases: ela define se o pórtico é rotulado ou engastado nos cálculos."],
    ["portico-trelicado", "Pórtico treliçado",
      "Pórtico cuja viga (e às vezes o pilar) é uma treliça de banzos e diagonais. Troca peso de aço por mais mão de obra de fabricação.",
      "Vãos grandes, onde o perfil de alma cheia ficaria muito alto e pesado.",
      "Modele os nós da treliça com o eixo das barras concorrendo no mesmo ponto, para evitar momentos que o cálculo não previu."],
    ["pilar", "Pilar",
      "Elemento vertical que leva as cargas da cobertura e do vento até a fundação.",
      "Nas laterais do pórtico e nos oitões, apoiado em placa de base sobre o bloco ou a sapata.",
      "Defina o comprimento de flambagem nos dois planos: o plano do pórtico e o plano das travessas e contraventos."],
    ["viga-cobertura", "Viga de cobertura",
      "Viga inclinada do pórtico que recebe as terças e transmite a carga ao pilar pelo joelho.",
      "Entre o beiral e a cumeeira, em cada pórtico transversal.",
      "Trave a mesa inferior, que fica comprimida sob vento de sucção, com mão-francesa ou travamento equivalente."],
    ["misula", "Mísula",
      "Aumento da altura da viga junto ao pilar, onde o momento fletor é maior. Dá resistência sem usar um perfil alto em todo o vão.",
      "No joelho de pórticos de alma cheia, nos dois lados.",
      "Faça o comprimento da mísula acompanhar o diagrama de momentos e verifique a mesa inferior comprimida na região."],
    ["joelho", "Joelho (ligação viga-pilar)",
      "Ligação de canto entre viga e pilar, feita com chapa de extremidade soldada na viga e parafusada na mesa do pilar.",
      "No encontro entre o pilar e a viga de cobertura, no beiral do pórtico.",
      "Verifique a alma do pilar na região do joelho; se faltar resistência, entram enrijecedores ou chapa de reforço."],
    ["cumeeira", "Cumeeira",
      "Ponto mais alto da cobertura, onde as duas vigas se encontram, normalmente por chapas de topo parafusadas.",
      "No meio do vão do pórtico de duas águas.",
      "Posicione as terças de cumeeira dos dois lados e preveja o travamento da chapa de topo contra o giro."],
    ["terca", "Terça",
      "Perfil de aço leve (em geral Ue) apoiado sobre a viga, que recebe a telha e passa a carga para o pórtico.",
      "Em toda a água do telhado, perpendicular às vigas do pórtico.",
      "O espaçamento entre terças é limitado pela telha e pelo vento: confirme os dois antes de fixar o vão."],
    ["clip-terca", "Clipe de terça",
      "Cantoneira soldada na mesa da viga que serve de apoio e de ligação da terça, que é aparafusada na alma do clipe.",
      "No apoio da terça sobre a mesa superior da viga do pórtico.",
      "Solde o clipe em oficina e deixe só o parafuso para a obra; folga de furo ajuda a compensar o prumo da terça."],
    ["corrente-terca", "Corrente de terça",
      "Barra redonda entre terças, no meio do vão, que trava o movimento delas no plano do telhado e reduz o vão de flexão fraca.",
      "Em todas as terças de vão grande, nas linhas de terça paralelas à cumeeira.",
      "Ancore as correntes em um ponto fixo (tirante ou cumeeira), senão elas só transferem esforço de terça em terça."],
    ["contraventamento-cobertura", "Contraventamento da cobertura",
      "Barras em X no plano do telhado, entre dois pórticos, que formam uma treliça horizontal e levam o vento das empenas às fundações.",
      "No vão extremo do galpão e em vãos intermediários a cada trecho de projeto.",
      "Faça o X usar as terças como banzos; confira se elas aguentam o esforço axial além da flexão."],
    ["contraventamento-parede", "Contraventamento de parede",
      "Barras em X no plano vertical, entre dois pilares, que impedem o tombamento do galpão no sentido longitudinal.",
      "Nas paredes laterais, no vão onde há o contraventamento da cobertura.",
      "Alinhe o X da parede com o da cobertura para o caminho da carga fechar até a fundação."],
    ["tirante", "Tirante",
      "Barra que prende as terças no sentido da inclinação do telhado e segura a componente da carga que escorrega para o beiral.",
      "Nas águas do telhado, junto às correntes, ancorado na cumeeira.",
      "Dimensione o tirante da cumeeira para a soma dos esforços de todas as correntes de uma água."],
    ["mao-francesa", "Mão-francesa",
      "Escora curta que liga a mesa inferior da viga à terça e trava essa mesa contra a flambagem lateral.",
      "Em vigas de pórtico, nos pontos onde a mesa inferior fica comprimida.",
      "Coloque as mãos-francesas nos trechos de momento negativo, onde a mesa inferior trabalha comprimida."],
    ["viga-beiral", "Viga de beiral",
      "Viga horizontal no topo da parede lateral que apoia a terça de beiral e fecha o contorno do galpão.",
      "No alinhamento do beiral, entre pilares, no lado da calha.",
      "Considere a carga da calha e do fechamento além da terça de beiral."],
    ["travessa-fechamento", "Travessa de fechamento",
      "Perfil horizontal preso aos pilares que recebe a telha de fechamento da parede e leva o vento ao pilar.",
      "Nas paredes laterais e de oitão, de baixo até o beiral.",
      "Verifique o espaçamento pelo vento na parede e pela telha; use correntes quando o vão for grande."],
    ["coluna-tapamento", "Coluna de tapamento",
      "Pilar secundário da empena que reduz o vão das travessas e leva o vento do tapamento até a fundação e até a viga.",
      "No oitão, entre o pórtico de extremidade e a cobertura.",
      "Faça a ligação superior permitir deslocamento vertical da viga, para ela não receber a carga da cobertura."],
    ["placa-base-rotulada", "Placa de base rotulada",
      "Placa soldada ao pilar com poucos chumbadores perto do eixo e sem enrijecedores. Transmite força vertical e horizontal, mas não momento.",
      "Pórticos calculados com bases rotuladas e pilares secundários.",
      "Mantenha os chumbadores perto do eixo: afastados demais, eles passam a transmitir momento sem ter sido previsto."],
    ["placa-base-engastada", "Placa de base engastada",
      "Placa maior, com 4 a 8 chumbadores afastados e enrijecedores, que resiste a momento fletor além da força vertical e horizontal.",
      "Pórticos em que a base é calculada como engaste, ou pilares muito esbeltos.",
      "Os chumbadores tracionados definem o braço de alavanca: afaste-os o necessário e confira a flexão da placa."],
    ["chumbador", "Chumbador",
      "Barra roscada ancorada no concreto (com gancho ou placa de ancoragem) que prende a placa de base à fundação.",
      "Sob todo pilar e contraventamento de base.",
      "Deixe graute sob a placa e porca com arruela; confira a ancoragem e o cobrimento do bloco ou da sapata."],
    ["chapa-extremidade", "Chapa de extremidade",
      "Chapa soldada na ponta da viga com furos para parafusos, que liga a peça ao pilar ou a outra viga sem cobrejunta.",
      "No joelho, na cumeeira e em emendas de viga.",
      "Chapa mais espessa que a mesa da viga evita alavanca e o descolamento entre chapa e pilar."],
    ["cantoneira-dupla", "Cantoneira dupla",
      "Par de cantoneiras presas dos dois lados da alma da viga, que liga a alma ao pilar ou à viga principal. A ligação é flexível, só de cortante.",
      "Em vigas secundárias, longarinas e travessas.",
      "Os parafusos da alma são carregados ao cisalhamento duplo; fure com tolerância para a montagem."],
    ["emenda-cobrejunta", "Emenda com cobrejuntas",
      "Ligação de dois trechos de perfil feita com chapas sobrepostas (cobrejuntas) nas mesas e na alma.",
      "Em vigas e pilares longos que não cabem no transporte, ou em mudança de seção.",
      "Posicione a emenda onde o momento é baixo e deixe folga entre as pontas para absorver a tolerância."],
    ["gusset", "Chapa de nó (gusset)",
      "Chapa que reúne em um ponto as barras de uma treliça ou contraventamento e transmite esforço entre elas.",
      "Nos nós de treliça e nas pontas dos X dos contraventamentos.",
      "Faça os eixos das barras se cruzarem no mesmo ponto e confira o bloco de cisalhamento e a flambagem da chapa."],
    ["enrijecedor", "Enrijecedor",
      "Chapa soldada na alma da viga, perpendicular à mesa, que reforça a alma contra esmagamento e flambagem sob carga concentrada.",
      "Sob cargas pontuais, nos apoios e nos joelhos.",
      "Alinhe os enrijecedores com as mesas da outra peça, para a força ter caminho direto."],
    ["solda-filete", "Solda de filete",
      "Solda de seção triangular que une duas peças em ângulo. A perna \"a\" define a espessura e a resistência.",
      "Em quase toda ligação soldada: clipes, enrijecedores, chapas de base.",
      "Respeite a perna mínima da norma pela espessura da chapa mais grossa e evite pernas maiores que o necessário."],
    ["solda-penetracao", "Solda de penetração",
      "Solda em chanfro que atravessa a espessura das chapas e as une com a seção cheia da menor delas.",
      "Em emendas de topo de mesas e almas e em ligações que transmitem toda a carga da peça.",
      "Prefira penetração parcial quando a carga permitir: reduz o custo de chanfro e de ensaio."],
    ["parafuso", "Parafuso",
      "Elemento de ligação com cabeça, arruela e porca. O aperto da chapa define o comprimento do corpo; a ponta deve passar da porca.",
      "Em todas as ligações aparafusadas de montagem.",
      "Some chapas e arruelas para obter o aperto e escolha o comprimento comercial que deixe pelo menos a ponta fora da porca."],
    ["telha-trapezoidal", "Telha trapezoidal",
      "Chapa de aço dobrada em ondas trapezoidais. O perfil TP-40 tem onda de 40 mm, e a largura útil é a que cobre a cobertura depois da sobreposição.",
      "Cobertura e fechamento de galpões.",
      "O vão máximo da telha vem do fabricante, para a espessura usada; ele define o espaçamento das terças."],
    ["telha-sanduiche", "Telha sanduíche",
      "Duas chapas de aço com núcleo isolante entre elas, formando uma peça única.",
      "Cobertura e fechamento onde há exigência térmica ou acústica.",
      "Peso e vão da telha dependem do fabricante e do núcleo; confirme antes de fixar o espaçamento das terças."],
    ["fechamento-alvenaria", "Fechamento em alvenaria",
      "Parede de blocos entre os pilares metálicos, ligada a eles por tela ou barras e travada no topo por cinta.",
      "Fechamento em que a vedação precisa ser resistente ao impacto, ao fogo ou ao som.",
      "Deixe junta de dilatação entre a alvenaria e o pilar ou use ligação que acompanhe o deslocamento da estrutura."],
    ["fechamento-misto", "Fechamento misto",
      "Alvenaria até uma altura h e telha de aço acima, presa nas travessas. Une a robustez embaixo e a leveza em cima.",
      "Galpões com parede baixa de alvenaria, para proteger contra impacto e água.",
      "Escolha h para que a cinta de coroamento fique no nível de uma travessa."],
    ["pre-moldado", "Painel pré-moldado",
      "Painel de concreto fabricado fora da obra e encaixado nos pilares, que serve de fechamento.",
      "Galpões com prazo curto e parede resistente.",
      "Combine o peso dos painéis com o guindaste e a fundação, e detalhe as chapas de ligação aos pilares."],
    ["vento-0", "Vento a 0°",
      "Direção do vento que incide na face de largura b do galpão, ao longo do comprimento a. É uma das duas direções-base da NBR 6123.",
      "Na combinação de ações, para os coeficientes de pressão das paredes e do telhado.",
      "Calcule sempre as duas direções e, em cada uma, as pressões interna e externa em conjunto; confira a figura da norma."],
    ["vento-90", "Vento a 90°",
      "Direção do vento que incide na lateral de comprimento a, perpendicular à direção de 0°.",
      "Na combinação de ações, junto com a direção de 0°.",
      "No sentido de 90° a cobertura sofre o maior arrasto em muitos galpões: não repita só os coeficientes de 0°."],
    ["coef-pressao", "Coeficientes de pressão",
      "A NBR 6123 divide paredes (A1, A2, B1, B2, C, D) e telhado (E, F, G, H) em zonas, cada uma com seu coeficiente de pressão externa.",
      "No cálculo do vento sobre cada região da edificação.",
      "O desenho é um esquema: use sempre a tabela e a figura da norma para os valores e a posição das zonas."],
    ["abertura-dominante", "Abertura dominante",
      "Abertura (portão aberto, por exemplo) em uma face, bem maior que as demais, que muda a pressão interna do galpão.",
      "No cálculo do vento quando existe portão ou janela que pode ficar aberta na tempestade.",
      "A pressão interna soma com a externa no telhado: examine o caso com portão aberto na direção desfavorável."],
    ["deformada", "Deformada",
      "Forma que a estrutura assume sob carga, ampliada no desenho. As cores mostram onde o deslocamento é pequeno, médio ou máximo.",
      "Na conferência de deslocamentos de serviço e para achar travamentos que faltam.",
      "Compare o deslocamento máximo com o limite da norma para o tipo de elemento; vale também para o vento."],
    ["flambagem-lateral", "Flambagem lateral",
      "Instabilidade da viga em que a mesa comprimida sai de lado e a seção gira entre dois pontos travados.",
      "Em vigas de pórtico e terças com mesa comprimida livre.",
      "O comprimento destravado é o que decide. Mais travamento (terça, mão-francesa) reduz o problema."],
    ["secao-w", "Seção I laminada",
      "Perfil laminado em I, com mesas de largura bf e espessura tf, alma de espessura tw e altura total d.",
      "Vigas e pilares de pórticos e estruturas em geral.",
      "Use as propriedades do catálogo do fabricante: pequenas diferenças de seção mudam o resultado."],
    ["secao-soldado", "Seção I soldada",
      "Perfil formado por chapas soldadas, com a altura e a largura escolhidas pelo projetista. Cada solda alma-mesa aparece como um cordão.",
      "Vigas e pilares de pórticos e estruturas em geral, com altura que o laminado não oferece.",
      "A solda alma-mesa precisa transmitir o cisalhamento; dimensione a perna além do mínimo da norma."],
    ["secao-ue", "Seção Ue enrijecida",
      "Perfil formado a frio com alma de altura bw, mesas de largura bf, enrijecedores de borda D e espessura t.",
      "Terças, travessas e longarinas.",
      "A flexão ao redor do eixo fraco é crítica: use correntes e confira a flambagem distorcional."],
    ["secao-z", "Seção Z enrijecida",
      "Perfil formado a frio em forma de Z, com alma bw, mesas bf, enrijecedores D e espessura t. Permite trespasse nos apoios.",
      "Terças e travessas contínuas, com trespasse sobre as vigas.",
      "O trespasse dá continuidade e reduz a flecha; o eixo principal é inclinado, então confira a flexão oblíqua."],
    ["secao-u", "Seção U",
      "Perfil em U (laminado ou dobrado), com alma de altura d e espessura tw e mesas de largura bf e espessura tf.",
      "Tirantes, reforços, guias e barras secundárias.",
      "O centro de torção fica fora da alma: carga sem alinhar com ele provoca torção."],
    ["secao-cantoneira", "Seção cantoneira",
      "Perfil em L com duas abas de largura b e espessura t.",
      "Contraventamentos, banzos de treliça e ligações.",
      "Ligada por uma só aba, a cantoneira trabalha excêntrica: considere o coeficiente de redução da área líquida."],
    ["secao-tubo-retangular", "Seção tubular retangular",
      "Tubo de seção retangular, de altura h, largura b e espessura t. Boa rigidez à torção e à flambagem.",
      "Pilares, banzos de treliça e contraventamentos.",
      "A ligação é de execução mais cara: considere o custo de corte e de solda no fechamento do tubo."],
    ["secao-tubo-circular", "Seção tubular circular",
      "Tubo de seção circular, de diâmetro externo D e espessura t. Boa resposta nos dois eixos.",
      "Pilares, treliças espaciais e contraventamentos.",
      "O corte das pontas em boca-de-lobo pesa na fabricação; fale com a oficina antes de fixar a ligação."]
  ];

  var ITENS = {}, ORDEM = [], i;
  for (i = 0; i < DEF.length; i++) {
    var d = DEF[i];
    ORDEM.push(d[0]);
    ITENS[d[0]] = {
      titulo: d[1],
      oQueE: d[2],
      ondeUsa: d[3],
      dica: d[4],
      svg: svg(CENA[d[0]]())
    };
  }

  var MetalDicas = {
    ITENS: ITENS,
    obter: function (id) { return Object.prototype.hasOwnProperty.call(ITENS, id) ? ITENS[id] : null; },
    ids: function () { return ORDEM.slice(); }
  };
  global.MetalDicas = MetalDicas;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalDicas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

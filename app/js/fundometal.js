/* =====================================================================
 * fundometal.js — FUNDO DECORATIVO DE ESTRUTURA METÁLICA (21/11/2026).
 * Atrás do cartão de progresso ("Calculando a estrutura") o fundo ficava
 * branco e vazio: aqui entra uma composição de desenhos em traço de aço —
 * pórtico treliçado, tesoura, perfis I / U / cantoneira em corte, escada
 * metálica, guarda-corpo e galpão em perspectiva isométrica —, SEMPRE
 * diferente (5 a 8 elementos em posições, escalas e ângulos sorteados) e com
 * uma deriva lenta.
 *
 *   FundoMetal.montar(hospedeiro, { n, semente, semMovimento }) → { elemento, remover(), composicao }
 *       cria uma camada absoluta (pointer-events:none, atrás do conteúdo do hospedeiro);
 *   FundoMetal.compor({ n, semente }) → [{ tipo, x, y, escala, rot, op, dx, dy, dr, dur, atraso }] (puro, sem DOM);
 *   FundoMetal.svg(tipo) → o desenho (string SVG); FundoMetal.TIPOS → os 8 desenhos.
 *
 * Custo: nada de requestAnimationFrame — a deriva é @keyframes CSS só com
 * transform (vai para a GPU), 5–8 elementos; prefers-reduced-motion: sem
 * animação. Cor: o token --aco do app (claro e escuro), opacidade 0,12–0,18.
 * Teste: node tools/test-fundometal.js
 * ===================================================================== */
(function (global) {
  "use strict";
  var W = 200, H = 140;   /* caixa de cada desenho */
  function p(d) { return '<path d="' + d + '"/>'; }
  function ln(x1, y1, x2, y2) { return "M" + x1 + " " + y1 + "L" + x2 + " " + y2; }

  /* ---- os 8 desenhos (traço puro, sem preenchimento; viewBox 0 0 200 140) ---- */
  var DESENHOS = {
    /* pórtico treliçado: duas colunas de treliça e a tesoura de banzos paralelos */
    porticoTrelicado: function () {
      var d = "", i, x;
      function yT(x) { return x <= 100 ? 46 - (x - 18) * 28 / 82 : 18 + (x - 100) * 28 / 82; }
      function yB(x) { return yT(x) + 12; }
      [[18, 36], [164, 182]].forEach(function (c) {
        d += ln(c[0], 130, c[0], 46) + ln(c[1], 130, c[1], yB(c[1] === 36 ? 36 : 164));
        for (i = 0; i < 6; i++) { var y0 = 130 - i * 14, y1 = y0 - 14; d += ln(c[0], y0, c[1], y1) + ln(c[1], y0, c[0], y1) + ln(c[0], y1, c[1], y1); }
      });
      d += "M18 46L100 18L182 46" + "M36 " + yB(36) + "L100 " + yB(100) + "L164 " + yB(164);
      for (i = 0; i <= 8; i++) { x = 36 + i * 16; d += ln(x, yT(x), x, yB(x)); if (i < 8) d += ln(x, yB(x), x + 16, yT(x + 16)); }
      d += ln(8, 130, 46, 130) + ln(154, 130, 192, 130);
      return p(d);
    },
    /* tesoura (Howe): banzo inferior, banzo superior em duas águas, montantes e diagonais */
    tesoura: function () {
      var d = ln(10, 110, 190, 110) + "M10 110L100 36L190 110", i;
      function yT(x) { return 110 - (x <= 100 ? (x - 10) : (190 - x)) * 74 / 90; }
      var xs = [10, 32.5, 55, 77.5, 100];
      for (i = 1; i < xs.length; i++) d += ln(xs[i], 110, xs[i], yT(xs[i])) + ln(xs[i - 1], 110, xs[i], yT(xs[i]));
      for (i = 0; i < xs.length - 1; i++) { var xm = 200 - xs[i]; d += ln(xm, 110, xm, yT(xm)) + ln(xm, 110, 200 - xs[i + 1], yT(200 - xs[i + 1])); }
      d += ln(4, 118, 26, 118) + ln(174, 118, 196, 118);   /* apoios */
      return p(d);
    },
    /* perfil I (viga) em corte: mesas, alma e a cota */
    perfilI: function () {
      return p("M52 22H148V40H112V100H148V118H52V100H88V40H52Z") + p(ln(160, 22, 160, 118) + ln(154, 22, 166, 22) + ln(154, 118, 166, 118)) + p(ln(52, 128, 148, 128) + ln(52, 123, 52, 133) + ln(148, 123, 148, 133));
    },
    /* perfil U (formado a frio, com enrijecedor) em corte */
    perfilU: function () {
      return p("M140 30H66V110H140") + p("M140 30V42M140 110V98") + p(ln(66, 30, 66, 110) + ln(52, 30, 52, 110) + ln(46, 30, 58, 30) + ln(46, 110, 58, 110)) + p(ln(66, 122, 140, 122) + ln(66, 117, 66, 127) + ln(140, 117, 140, 127));
    },
    /* cantoneira (L) em corte, com as duas abas e o furo */
    cantoneira: function () {
      return p("M56 24H76V96H148V116H56Z") + '<circle cx="66" cy="100" r="4"/>' + p(ln(56, 130, 148, 130) + ln(56, 125, 56, 135) + ln(148, 125, 148, 135)) + p(ln(40, 24, 40, 116) + ln(35, 24, 45, 24) + ln(35, 116, 45, 116));
    },
    /* escada metálica: dois montantes inclinados e os degraus */
    escada: function () {
      var d = ln(30, 130, 120, 20) + ln(54, 130, 144, 20) + ln(10, 130, 74, 130), i;
      for (i = 0; i <= 8; i++) { var y = 130 - 110 * i / 8, x1 = 30 + 90 * i / 8; d += ln(x1, y, x1 + 24, y); }
      d += ln(120, 20, 150, 20) + ln(144, 20, 144, 36);
      return p(d);
    },
    /* guarda-corpo: montantes, corrimão, travessa intermediária, rodapé e chapas de base */
    guardaCorpo: function () {
      var d = ln(10, 40, 190, 40) + ln(10, 76, 190, 76) + ln(10, 104, 190, 104) + ln(4, 120, 196, 120), i;
      for (i = 0; i < 6; i++) { var x = 20 + i * 32; d += ln(x, 112, x, 36) + ln(x - 6, 112, x + 6, 112); }
      return p(d);
    },
    /* galpão em perspectiva isométrica: caixa, telhado de duas águas, pórticos e terças */
    galpaoIso: function () {
      var d = ln(30, 92, 100, 128) + ln(100, 128, 170, 92) + ln(100, 128, 100, 92) + ln(170, 92, 170, 56) + ln(30, 92, 30, 56), i;
      d += ln(30, 56, 100, 92) + ln(100, 92, 170, 56) + ln(170, 56, 100, 20) + ln(100, 20, 30, 56);   /* beirais */
      d += ln(30, 56, 65, 60) + ln(65, 60, 100, 92) + ln(65, 60, 135, 24) + ln(135, 24, 170, 56) + ln(135, 24, 100, 20);   /* oitão, cumeeira, água da frente */
      [0.33, 0.66].forEach(function (f) { d += ln(100 - 35 * f, 92 - 32 * f, 170 - 35 * f, 56 - 32 * f); });   /* terças */
      for (i = 1; i <= 5; i++) { var u = i / 6, bx = 100 + 70 * u; d += ln(bx, 92 - 36 * u, bx - 35, 60 - 36 * u) + ln(bx, 128 - 36 * u, bx, 92 - 36 * u); }   /* pórticos */
      return p(d);
    }
  };
  var TIPOS = Object.keys(DESENHOS);
  function svg(tipo) {
    var f = DESENHOS[tipo]; if (!f) return "";
    var corpo = f().replace(/d="([^"]*)"/g, function (m, d) { return 'd="' + d.replace(/\s+/g, " ").trim() + '"'; });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-fm="' + tipo + '">' + corpo + "</svg>";
  }

  /* ---- sorteio (puro): xorshift32 com semente; sem semente usa Math.random ---- */
  function gerador(sem) {
    if (sem == null) return Math.random;
    var s = ((((sem >>> 0) * 40503 + 12345) >>> 0) ^ 0x9e3779b9) >>> 0 || 1;
    var g = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (var i = 0; i < 12; i++) g();   /* esquenta: sementes pequenas começam parecidas */
    return g;
  }
  function embaralhar(a, r) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /* 5 a 8 elementos: o campo vira uma grade 4 × 3 e cada elemento cai numa célula diferente, com folga aleatória */
  function compor(op) {
    op = op || {};
    var r = gerador(op.semente), n = Math.max(5, Math.min(8, Math.round(op.n != null ? op.n : 5 + Math.floor(r() * 4))));
    var tipos = embaralhar(TIPOS.slice(), r), celulas = [], i, j;
    for (i = 0; i < 4; i++) for (j = 0; j < 3; j++) celulas.push([i, j]);
    embaralhar(celulas, r);
    var out = [];
    for (i = 0; i < n; i++) {
      var c = celulas[i], escala = 0.7 + r() * 0.9;   /* 0,7 a 1,6 */
      out.push({
        tipo: tipos[i % tipos.length],
        x: Math.round(((c[0] + 0.15 + r() * 0.7) / 4) * 1000) / 10,   /* % da largura (centro) */
        y: Math.round(((c[1] + 0.15 + r() * 0.7) / 3) * 1000) / 10,   /* % da altura (centro) */
        escala: Math.round(escala * 100) / 100,
        rot: Math.round((r() * 50 - 25) * 10) / 10,
        op: Math.round((0.12 + r() * 0.06) * 1000) / 1000,   /* 0,12 a 0,18 */
        dx: Math.round((r() * 50 - 25)), dy: Math.round((r() * 40 - 20)), dr: Math.round((r() * 10 - 5) * 10) / 10,
        dur: Math.round(50 + r() * 60),   /* 50 a 110 s: bem lento */
        atraso: -Math.round(r() * 60)
      });
    }
    return out;
  }

  var CSS = ".fm-hosp{position:relative;isolation:isolate}.fm-hosp>*:not(.fm-fundo){position:relative;z-index:1}" +
    ".fm-fundo{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:0;color:var(--aco,#0d6ebd)}" +
    ".fm-el{position:absolute;display:block;pointer-events:none;will-change:transform;animation:fm-deriva var(--dur,70s) ease-in-out var(--atraso,0s) infinite alternate}" +
    ".fm-el svg{display:block;width:100%;height:auto;overflow:visible}" +
    "@keyframes fm-deriva{from{transform:translate(-50%,-50%) rotate(var(--rot,0deg)) translate(0,0)}to{transform:translate(-50%,-50%) rotate(calc(var(--rot,0deg) + var(--dr,3deg))) translate(var(--dx,12px),var(--dy,8px))}}" +
    "@media (prefers-reduced-motion:reduce){.fm-el{animation:none;transform:translate(-50%,-50%) rotate(var(--rot,0deg))}}" +
    ".fm-fundo.fm-parado .fm-el{animation:none;transform:translate(-50%,-50%) rotate(var(--rot,0deg))}";
  function garantirCss(doc) { try { if (!doc || doc.getElementById("fm-css")) return; var s = doc.createElement("style"); s.id = "fm-css"; s.textContent = CSS; doc.head.appendChild(s); } catch (e) {} }

  function montar(host, op) {
    op = op || {};
    var doc = typeof document !== "undefined" ? document : null;
    if (typeof host === "string" && doc) host = doc.querySelector(host);
    if (!host || !doc) return { elemento: null, composicao: [], remover: function () {}, parar: function () {} };
    garantirCss(doc);
    var comp = compor({ n: op.n, semente: op.semente }), cam = doc.createElement("div");
    cam.className = "fm-fundo" + (op.semMovimento ? " fm-parado" : ""); cam.setAttribute("aria-hidden", "true"); cam.setAttribute("data-fundo-metal", String(comp.length));
    var base = 170;   /* px de largura do desenho na escala 1 */
    cam.innerHTML = comp.map(function (e) {
      return '<span class="fm-el" style="left:' + e.x + "%;top:" + e.y + "%;width:" + Math.round(base * e.escala) + "px;opacity:" + e.op + ";--rot:" + e.rot + "deg;--dr:" + e.dr + "deg;--dx:" + e.dx + "px;--dy:" + e.dy + "px;--dur:" + e.dur + "s;--atraso:" + e.atraso + 's">' + svg(e.tipo) + "</span>";
    }).join("");
    if (host.classList) host.classList.add("fm-hosp");
    host.insertBefore(cam, host.firstChild);
    return {
      elemento: cam, composicao: comp,
      parar: function () { try { cam.classList.add("fm-parado"); } catch (e) {} },
      remover: function () { try { if (cam.parentNode) cam.parentNode.removeChild(cam); if (host.classList) host.classList.remove("fm-hosp"); } catch (e) {} }
    };
  }

  var FundoMetal = { montar: montar, compor: compor, svg: svg, TIPOS: TIPOS, CSS: CSS };
  global.FundoMetal = FundoMetal;
  if (typeof module !== "undefined" && module.exports) module.exports = FundoMetal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

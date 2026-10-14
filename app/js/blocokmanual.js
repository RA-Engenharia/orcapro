/* =====================================================================
 * blocokmanual.js — MANUAL DE MONTAGEM da edificação em Blocok (livro
 * enxuto A3 paisagem), gerado a partir do resultado do BlocokCalc.calcular.
 * Motor PURO, ES5, sem DOM e sem biblioteca externa (Node e navegador).
 *
 *   BlocokManual.gerar(resultado, opcoes) → { ok, html, paginas, avisos }
 *
 * MOLDE APROVADO pelo Rogério (livro enxuto do Quiosque, js/madmanual.js):
 * capa, sumário, como ler, UMA ETAPA POR PÁGINA, 3 a 5 frases por etapa,
 * ilustração grande e limpa, tabela resumida no fim. O livro "poluído" foi
 * reprovado — não acrescentar texto, tabela ou nota além do que está aqui.
 *
 * AS 10 ETAPAS (ordem da obra): 1 fundação e esperas · 2 marcação · 3
 * primeira fiada · 4 fiadas seguintes com amarração · 5 cantos e encontros
 * em T · 6 vergas e contravergas · 7 pilaretes e cinta · 8 instalações · 9
 * tratamento de juntas (sequência do vídeo oficial de 11/06/2026, a mesma
 * de BlocokExec.montagem) · 10 acabamento.
 *
 * ILUSTRAÇÕES: elevação SVG da parede de MAIOR número de peças do
 * resultado, peças numeradas (a numeração da prancha), a MESMA escala e o
 * mesmo recorte em todas as páginas; peças e faixas da etapa em cor, o já
 * montado em cinza, o que ainda não foi montado tracejado. A etapa 8 usa o
 * corte da peça com o tubo máximo de cada espessura (CATALOGO.tuboMax).
 *
 * NADA INVENTADO: quantidades vêm de resultado.paredes[i].pag.quant e de
 * resultado.consolidado; o que não está nos dados aparece como "[a definir]"
 * (vermelho); consumo de argamassa, de tratamento de junta e fiadas por dia
 * são do fabricante ainda não publicado e saem marcados "estimado".
 * opcoes: obra { nome, cliente, local } · documento { numero, revisao, data }
 *         · responsavel { nome, abrev, conselho, crea, empresa }.
 * Teste: node tools/test-blocokmanual.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./blocokexec.js"));
  else root.BlocokManual = factory(root.BlocokExec);
})(typeof self !== "undefined" ? self : this, function (BlocokExec) {
  "use strict";

  var NB = String.fromCharCode(160);
  var PH = '<span class="ph">[a definir]</span>';
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) {
    if (!fin(v)) return null;
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? "−" : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  function N(v, c, u) { var s = br(v, c); return s == null ? PH : s + (u ? NB + u : ""); }
  function T(v) {
    if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return PH;
    var s = String(v);
    return /^\[.*\]$/.test(s) ? '<span class="ph">' + esc(s) + "</span>" : esc(s);
  }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }
  var CAT = BlocokExec.CATALOGO, DIR = BlocokExec.DIRETRIZ;

  /* ----------------------------------------------------------------- CSS */
  var A = "#00406A", MARROM = "#6F5F48", VERDE = "#3F7818", AREIA = "#A89868", LARANJA = "#c8761a";
  var CSS = [
    "@page { size: 420mm 297mm; margin: 0 }",
    "* { box-sizing: border-box }",
    "body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1d2a33; -webkit-print-color-adjust: exact; print-color-adjust: exact }",
    ".pg { width: 420mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; background: #fff }",
    ".mold { position: absolute; left: 12mm; top: 8mm; width: 396mm; height: 281mm; border: .35mm solid " + A + "; pointer-events: none }",
    ".rod { position: absolute; left: 12mm; top: 269mm; width: 396mm; height: 20mm; border-top: .35mm solid " + A + "; display: flex; align-items: stretch }",
    ".rod > div { border-right: .2mm solid #b8c4cc; padding: 1.6mm 3mm; display: flex; flex-direction: column; justify-content: center }",
    ".rod .lg { width: 46mm; font-size: 7.5pt; font-weight: 700; color: " + A + "; line-height: 1.15 }",
    ".rod .tt { flex: 1 } .rod .obra { font-size: 7.2pt; letter-spacing: .35mm; color: " + MARROM + "; text-transform: uppercase }",
    ".rod .tit { font-size: 12pt; font-weight: 700; color: " + A + "; margin-top: .6mm }",
    ".rod .sec { width: 54mm; font-size: 7.5pt; color: #3d4b55 } .rod .sec b { color: " + VERDE + " }",
    ".rod .doc { width: 78mm; font-size: 7.2pt; color: #3d4b55; line-height: 1.35 }",
    ".rod .np { width: 26mm; border-right: 0; align-items: center; background: " + A + "; color: #fff } .rod .np b { font-size: 20pt; line-height: 1 } .rod .np small { font-size: 7pt; opacity: .85 }",
    ".cont { position: absolute; left: 20mm; top: 13mm; width: 380mm; height: 252mm }",
    "h1 { font-size: 21pt; color: " + A + "; margin: 0 0 2mm 0; font-weight: 700; line-height: 1.1 }",
    "h1 small { display: block; font-size: 8.5pt; color: " + MARROM + "; letter-spacing: .6mm; text-transform: uppercase; font-weight: 600; margin-bottom: 1mm }",
    "h2 { font-size: 10.5pt; color: " + A + "; margin: 2.6mm 0 1.2mm 0; border-bottom: .3mm solid " + AREIA + "; padding-bottom: .5mm }",
    "p, li { font-size: 10.4pt; line-height: 1.42; margin: 0 0 1.6mm 0 } ul, ol { margin: 0 0 1.4mm 0; padding-left: 5mm }",
    "table { border-collapse: collapse; width: 100% }",
    "th { background: " + A + "; color: #fff; font-size: 8.2pt; font-weight: 600; padding: 1mm 1.5mm; text-align: left; border: .2mm solid " + A + " }",
    "td { font-size: 8.8pt; padding: .8mm 1.5mm; border: .2mm solid #c9d2d8; vertical-align: top } tr:nth-child(even) td { background: #f3f6f8 }",
    "td.n, th.n { text-align: right; white-space: nowrap } .tot td { font-weight: 700; background: #e7edf1 !important }",
    ".box { border: .3mm solid " + AREIA + "; background: #faf7f0; padding: 1.8mm 3mm; margin: 2mm 0; font-size: 9.2pt; line-height: 1.4 }",
    ".aten { border-left: 1.2mm solid " + LARANJA + "; background: #fdf3e6; padding: 1.6mm 3mm; margin: 2mm 0; font-size: 9.2pt; line-height: 1.4 } .aten b { color: #8a4b0f }",
    ".ph { color: #b3261e; font-weight: 600 } .est { color: #8a5a00; font-size: 8pt; font-style: italic }",
    ".etapa-cab { position: absolute; left: 20mm; top: 12mm; width: 380mm; height: 20mm; display: flex; align-items: center; gap: 5mm }",
    ".etapa-cab .num { width: 20mm; height: 20mm; border-radius: 50%; background: " + A + "; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none }",
    ".etapa-cab .num small { font-size: 6.5pt; letter-spacing: .4mm; line-height: 1 } .etapa-cab .num b { font-size: 19pt; line-height: 1.05 }",
    ".etapa-cab h1 { margin: 0; font-size: 21pt } .etapa-cab .sub { font-size: 10pt; color: #3d4b55; margin-top: .8mm }",
    ".ilus { position: absolute; left: 20mm; top: 35mm; width: 380mm; height: 128mm; border: .25mm solid #d5dde3; border-radius: 1.5mm; background: #fff; padding: 1mm }",
    ".ilus svg { width: 100%; height: 100%; display: block }",
    ".txt { position: absolute; left: 20mm; top: 167mm; width: 232mm; height: 84mm } .txt p { font-size: 12pt; line-height: 1.45; margin-bottom: 2.4mm } .txt li { font-size: 11pt }",
    ".qt { position: absolute; left: 258mm; top: 167mm; width: 142mm; height: 84mm }",
    ".legenda-fixa { position: absolute; left: 20mm; top: 253mm; width: 380mm; height: 14mm; border-top: .25mm solid " + AREIA + "; padding-top: 1.3mm; display: flex; flex-wrap: wrap; align-content: flex-start; gap: .7mm 4mm }",
    ".legenda-fixa div { display: flex; align-items: center; gap: 1.4mm; font-size: 7.4pt; color: #3d4b55; white-space: nowrap }",
    ".legenda-fixa i, .legenda i { display: inline-block; width: 6mm; height: 3.4mm; border: .2mm solid #666; flex: none }",
    ".legenda { display: flex; flex-wrap: wrap; gap: 2mm 5mm } .legenda div { display: flex; align-items: center; gap: 2mm; font-size: 9.4pt; width: 47% } .legenda i { width: 9mm; height: 5.4mm }",
    ".capa .faixa { position: absolute; left: 0; top: 0; width: 118mm; height: 297mm; background: linear-gradient(180deg, " + A + " 0%, #0b3150 100%) }",
    ".capa .faixa .l1 { position: absolute; left: 18mm; top: 20mm; width: 82mm; background: #fff; border-radius: 3mm; padding: 6mm; text-align: center; color: " + A + "; font-weight: 700; font-size: 13pt; line-height: 1.3 }",
    ".capa .faixa .rod2 { position: absolute; left: 18mm; bottom: 18mm; width: 86mm; color: #dfe9ef; font-size: 8.4pt; line-height: 1.5 }",
    ".capa .lin { position: absolute; left: 118mm; top: 0; width: 3mm; height: 297mm; background: " + AREIA + " } .capa .lin2 { position: absolute; left: 122.5mm; top: 0; width: 1mm; height: 297mm; background: " + VERDE + " }",
    ".capa .tx { position: absolute; left: 140mm; top: 22mm; width: 262mm } .capa .sup { font-size: 10.5pt; letter-spacing: 1.2mm; color: " + MARROM + "; text-transform: uppercase; font-weight: 600 }",
    ".capa .t1 { font-size: 36pt; font-weight: 800; color: " + A + "; line-height: 1.04; margin: 4mm 0 3mm 0 } .capa .t2 { font-size: 13.5pt; color: #3d4b55; line-height: 1.3 }",
    ".capa .hero { position: absolute; left: 134mm; top: 92mm; width: 270mm; height: 130mm }",
    ".capa .t3 { position: absolute; left: 140mm; top: 228mm; width: 262mm; font-size: 9pt; color: #3d4b55; line-height: 1.5; border-top: .4mm solid " + AREIA + "; padding-top: 3mm }",
    ".capa .rv { position: absolute; left: 140mm; bottom: 12mm; display: flex; gap: 4mm } .capa .rv div { border: .35mm solid " + A + "; padding: 1.8mm 4mm; font-size: 8.3pt; color: " + A + " } .capa .rv b { display: block; font-size: 12.5pt }",
    ".sum .s { font-size: 12pt; color: " + A + "; font-weight: 700; margin: 4mm 0 1.5mm 0 }",
    ".sum .i { display: flex; align-items: center; font-size: 11.5pt; line-height: 1.7 } .sum .i span { flex: 1; border-bottom: .2mm dotted #9aa; margin: 0 2mm 1.4mm 0 } .sum .i b { color: " + A + "; min-width: 9mm; text-align: right }",
    ".chip { display: inline-block; background: " + A + "; color: #fff; font-weight: 700; font-size: 8pt; padding: .4mm 1.6mm; border-radius: 1mm; margin: 0 1mm .5mm 0 }",
    "svg text { font-family: 'Segoe UI', Arial, sans-serif }",
    ".pc { stroke-width: .8 } .pc.fut { fill: #fff; stroke: #c3ccd2; stroke-dasharray: 4 3 } .pc.feito { fill: #dde1e4; stroke: #aeb7bd } .pc.alvo { fill: #bcd9ee; stroke: " + A + "; stroke-width: 1.2 }",
    ".pc.alvoB { fill: #ecdcb8; stroke: " + MARROM + "; stroke-width: 1.2 } .pc.alvoL { fill: #f8dcb6; stroke: " + LARANJA + "; stroke-width: 1.6 } .pc.junta { fill: #eef1f3; stroke: " + LARANJA + "; stroke-width: 2.4 } .pc.pronta { fill: #eef3f7; stroke: #b9c6cf }",
    ".nr { text-anchor: middle; dominant-baseline: central; font-weight: 700 } .nr.alvo { fill: " + A + " } .nr.feito { fill: #8b969d } .nr.fut { fill: #b9c2c8 }",
    ".vao { fill: #fff; stroke: #55616a; stroke-width: 1.2 } .vaoT { font-size: 10px; fill: #55616a; font-weight: 700 }",
    ".rf-pil { fill: rgba(63,120,24,.38); stroke: " + VERDE + "; stroke-width: 1.4 } .rf-verga { fill: rgba(200,118,26,.42); stroke: " + LARANJA + "; stroke-width: 1.4 } .rf-cinta { fill: rgba(111,95,72,.45); stroke: " + MARROM + "; stroke-width: 1.4 }",
    ".rf-off { fill: none; stroke: #aeb7bd; stroke-width: .8; stroke-dasharray: 3 2 }",
    ".fund { fill: #d9dde0; stroke: #8b969d; stroke-width: 1 } .fund.alvo { fill: #bcd9ee; stroke: " + A + "; stroke-width: 1.6 }",
    ".aco { stroke: #1d2a33; stroke-width: 1.1; fill: none } .espera { stroke: " + VERDE + "; stroke-width: 3; fill: none }",
    ".marca { stroke: " + A + "; stroke-width: 1.6 } .marcaP { stroke: " + VERDE + "; stroke-width: 2 } .eixo { stroke: " + A + "; stroke-width: 1; stroke-dasharray: 10 3 2 3 }",
    ".esc { stroke: #55616a; stroke-width: 1.4; stroke-dasharray: 3 2 } .grampo { stroke: " + LARANJA + "; stroke-width: 2.4 }",
    ".tl { font-size: 11px; fill: #3d4b55 } .tl.b { font-weight: 700; fill: " + A + " } .tl.s { font-size: 9px } .tl.v { fill: " + VERDE + "; font-weight: 700 }",
    ".sec-face { fill: #cdb98d; stroke: #6F5F48; stroke-width: .6 } .sec-eps { fill: #f4f4f4; stroke: #8b969d; stroke-width: .6 } .sec-tubo { fill: #fff; stroke: " + A + "; stroke-width: 1.2 }"
  ].join("\n");

  /* ----------------------------------------------------------- geometria */
  var PADX = 0.55, PADT = 0.5, FUNDH = 0.25, PADB = 0.12;
  function escolher(paredes) {
    var melhor = null;
    paredes.forEach(function (w) { var n = arr(obj(w.pag).pecas).length; if (!melhor || n > arr(obj(melhor.pag).pecas).length) melhor = w; });
    return melhor;
  }
  function limites(pg) {
    var x0 = Infinity, x1 = -Infinity;
    arr(pg.pecas).forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); });
    var rf = obj(pg.reforcos);
    [].concat(arr(rf.pilaretes), arr(rf.vergas), arr(rf.contravergas), arr(rf.cintas)).forEach(function (f) { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x + f.w); });
    if (!isFinite(x0)) { x0 = 0; x1 = pg.comprimento || 1; }
    return { x0: Math.min(x0, 0), x1: Math.max(x1, pg.comprimento || 0) };
  }
  function mkCam(pg) {
    var L = limites(pg), H = pg.altura || 2.75;
    var c = { x0: L.x0, x1: L.x1, H: H };
    c.W = (L.x1 - L.x0 + 2 * PADX) * 100; c.Hh = (H + PADT + FUNDH + PADB) * 100;
    c.sx = function (x) { return (x - c.x0 + PADX) * 100; };
    c.sy = function (y) { return (H - y + PADT) * 100; };
    return c;
  }
  function retR(cam, x, y, w, h, cls, extra) {
    return '<rect class="' + cls + '" x="' + f1(cam.sx(x)) + '" y="' + f1(cam.sy(y + h)) + '" width="' + f1(w * 100) + '" height="' + f1(h * 100) + '"' + (extra || "") + "/>";
  }
  function pecaPath(cam, pc, cls) {
    var x = cam.sx(pc.x), y = cam.sy(pc.y + pc.h), w = pc.w * 100, h = pc.h * 100;
    var d = "M" + f1(x) + " " + f1(y) + "h" + f1(w) + "v" + f1(h) + "h" + f1(-w) + "z";
    arr(pc.furos).forEach(function (f) { d += "M" + f1(cam.sx(f.x)) + " " + f1(cam.sy(f.y + f.h)) + "h" + f1(f.w * 100) + "v" + f1(f.h * 100) + "h" + f1(-f.w * 100) + "z"; });
    return '<path class="pc ' + cls + '" fill-rule="evenodd" d="' + d + '"/>';
  }
  function pontoNumero(pc) {
    var cands = [[0.5, 0.5], [0.5, 0.78], [0.5, 0.22], [0.78, 0.5], [0.22, 0.5], [0.78, 0.78], [0.22, 0.22]];
    for (var i = 0; i < cands.length; i++) {
      var px = pc.x + pc.w * cands[i][0], py = pc.y + pc.h * cands[i][1], dentro = false;
      arr(pc.furos).forEach(function (f) { if (px > f.x - 0.03 && px < f.x + f.w + 0.03 && py > f.y - 0.05 && py < f.y + f.h + 0.05) dentro = true; });
      if (!dentro) return [px, py];
    }
    return [pc.x + pc.w / 2, pc.y + pc.h / 2];
  }

  /* estado de cada peça por etapa */
  function estadoPeca(et, pc, pg, pontas) {
    var nf = arr(pg.fiadas).length;
    switch (et) {
      case 1: case 2: return "fut";
      case 3: return pc.fiada === 1 ? "alvo" : "fut";
      case 4: return pc.fiada === 1 ? "feito" : (pc.tipo === "recorte-L" ? "alvoL" : "alvo");
      case 5: return pontas[pc.cod] ? (pc.fiada % 2 ? "alvo" : "alvoB") : "feito";
      case 9: return "junta";
      case 10: return "pronta";
      default: return nf ? "feito" : "feito";
    }
  }

  function elevacao(cam, pg, et, o) {
    o = o || {};
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(cam.W) + " " + f1(cam.Hh) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc("Elevação da parede " + (pg.id || "")) + '">';
    var rf = obj(pg.reforcos), pecas = arr(pg.pecas), fiadas = arr(pg.fiadas);
    // pontas de cada fiada (cantos / encontros)
    var pontas = {};
    fiadas.forEach(function (fi) {
      var l = pecas.filter(function (p) { return p.fiada === fi.n; }).sort(function (a, b) { return a.x - b.x; });
      if (l.length) { pontas[l[0].cod] = true; pontas[l[l.length - 1].cod] = true; }
    });
    // fundação
    s += retR(cam, cam.x0 - 0.25, -FUNDH, cam.x1 - cam.x0 + 0.5, FUNDH, "fund" + (et === 1 ? " alvo" : ""));
    s += '<text class="tl s" x="' + f1(cam.sx(cam.x0 - 0.2)) + '" y="' + f1(cam.sy(-FUNDH * 0.45)) + '">fundação</text>';
    // peças
    pecas.forEach(function (pc) {
      var cls = o.estado ? o.estado(pc) : estadoPeca(et, pc, pg, pontas);
      s += pecaPath(cam, pc, cls);
    });
    // reforços (antes dos números, depois das peças)
    var pils = arr(rf.pilaretes), vgs = arr(rf.vergas), cvs = arr(rf.contravergas), cts = arr(rf.cintas);
    function faixa(f, cls) { return retR(cam, f.x, f.y, f.w, f.h, cls); }
    if (et === 6) { vgs.concat(cvs).forEach(function (f) { s += faixa(f, "rf-verga"); }); pils.concat(cts).forEach(function (f) { s += faixa(f, "rf-off"); }); }
    if (et === 7) { pils.forEach(function (f) { s += faixa(f, "rf-pil"); }); cts.forEach(function (f) { s += faixa(f, "rf-cinta"); }); vgs.concat(cvs).forEach(function (f) { s += faixa(f, "rf-off"); }); }
    if (et === 10 || et === 9) { /* sem reforço em destaque */ }
    // números
    if (et !== 10) pecas.forEach(function (pc) {
      var cls = o.estado ? o.estado(pc) : estadoPeca(et, pc, pg, pontas);
      var k = cls === "alvo" || cls === "alvoB" || cls === "alvoL" ? "alvo" : (cls === "fut" ? "fut" : "feito");
      var pt = pontoNumero(pc), fs = pc.w < 0.3 ? 8 : 11;
      s += '<text class="nr ' + k + '" font-size="' + fs + '" x="' + f1(cam.sx(pt[0])) + '" y="' + f1(cam.sy(pt[1])) + '">' + esc(pc.n) + "</text>";
    });
    // vãos
    arr(pg.vaos).forEach(function (v) {
      s += retR(cam, v.x, v.y, v.w, v.h, "vao");
      s += '<text class="vaoT" text-anchor="middle" x="' + f1(cam.sx(v.x + v.w / 2)) + '" y="' + f1(cam.sy(v.y + v.h / 2)) + '" dominant-baseline="central">' + esc(v.id) + "</text>";
    });
    // fiadas à esquerda
    fiadas.forEach(function (fi) { s += '<text class="tl s" text-anchor="end" x="' + f1(cam.sx(cam.x0 - 0.06)) + '" y="' + f1(cam.sy(fi.y + fi.h / 2)) + '" dominant-baseline="central">' + fi.n + "ª</text>"; });
    // detalhes por etapa
    if (et === 1) {
      pils.filter(function (p) { return p.dono !== false; }).forEach(function (p) {
        var cx = p.x + p.w / 2, ep = obj(pg.cfg).pilarete ? obj(pg.cfg).pilarete.esperaFundacao : 0.5;
        [-0.05, 0.05].forEach(function (dx) { s += '<line class="espera" x1="' + f1(cam.sx(cx + dx)) + '" y1="' + f1(cam.sy(-FUNDH * 0.8)) + '" x2="' + f1(cam.sx(cx + dx)) + '" y2="' + f1(cam.sy(ep)) + '"/>'; });
        s += '<text class="tl v" text-anchor="middle" x="' + f1(cam.sx(cx)) + '" y="' + f1(cam.sy(ep) - 5) + '">' + esc(p.id) + "</text>";
      });
    }
    if (et === 2) {
      s += '<line class="eixo" x1="' + f1(cam.sx(cam.x0 - 0.2)) + '" y1="' + f1(cam.sy(0)) + '" x2="' + f1(cam.sx(cam.x1 + 0.2)) + '" y2="' + f1(cam.sy(0)) + '"/>';
      arr(pg.vaos).forEach(function (v) {
        [v.x, v.x + v.w].forEach(function (x) { s += '<line class="marca" x1="' + f1(cam.sx(x)) + '" y1="' + f1(cam.sy(0)) + '" x2="' + f1(cam.sx(x)) + '" y2="' + f1(cam.sy(0.14)) + '"/>'; });
        s += '<text class="tl b" text-anchor="middle" x="' + f1(cam.sx(v.x + v.w / 2)) + '" y="' + f1(cam.sy(0.07)) + '" dominant-baseline="central">' + esc(v.id) + "</text>";
      });
      pils.filter(function (p) { return p.dono !== false; }).forEach(function (p) {
        var cx = p.x + p.w / 2;
        s += '<line class="marcaP" x1="' + f1(cam.sx(cx)) + '" y1="' + f1(cam.sy(0)) + '" x2="' + f1(cam.sx(cx)) + '" y2="' + f1(cam.sy(0.45)) + '"/><text class="tl v" text-anchor="middle" x="' + f1(cam.sx(cx)) + '" y="' + f1(cam.sy(0.45) - 4) + '">' + esc(p.id) + "</text>";
      });
    }
    if (et === 5) {
      arr(rf.ligacoes).forEach(function (l) {
        var xe = l.lado === "ini" ? 0 : pg.comprimento, d = l.lado === "ini" ? 1 : -1, anc = l.ancoragem || DIR.ancoragemLigacao;
        fiadas.forEach(function (fi) { s += '<line class="grampo" x1="' + f1(cam.sx(xe)) + '" y1="' + f1(cam.sy(fi.y + fi.h / 2)) + '" x2="' + f1(cam.sx(xe + d * anc)) + '" y2="' + f1(cam.sy(fi.y + fi.h / 2)) + '"/>'; });
      });
    }
    if (et === 6) {
      vgs.forEach(function (v) {
        var vo = arr(pg.vaos).filter(function (x) { return x.id === v.vao; })[0];
        if (!vo) return;
        [0.15, 0.5, 0.85].forEach(function (k) { var x = vo.x + vo.w * k; s += '<line class="esc" x1="' + f1(cam.sx(x)) + '" y1="' + f1(cam.sy(vo.y)) + '" x2="' + f1(cam.sx(x)) + '" y2="' + f1(cam.sy(v.y)) + '"/>'; });
      });
    }
    if (et === 7) {
      pils.forEach(function (p) { var cx = p.x + p.w / 2; [-0.05, 0.05].forEach(function (dx) { s += '<line class="aco" x1="' + f1(cam.sx(cx + dx)) + '" y1="' + f1(cam.sy(p.y + 0.03)) + '" x2="' + f1(cam.sx(cx + dx)) + '" y2="' + f1(cam.sy(p.y + p.h - 0.03)) + '"/>'; }); });
      cts.forEach(function (c) { [0.04, c.h - 0.04].forEach(function (dy) { s += '<line class="aco" x1="' + f1(cam.sx(c.x + 0.03)) + '" y1="' + f1(cam.sy(c.y + dy)) + '" x2="' + f1(cam.sx(c.x + c.w - 0.03)) + '" y2="' + f1(cam.sy(c.y + dy)) + '"/>'; }); });
    }
    s += '<text class="tl b" x="' + f1(cam.sx(cam.x0 - 0.2)) + '" y="14">' + esc("Parede " + (pg.id || "") + (pg.nome ? " — " + pg.nome : "") + " · elevação, sem escala numérica") + "</text>";
    return s + "</svg>";
  }

  /* corte das peças com o tubo máximo (etapa 8) — escala fixa: 1 cm = 10 unidades */
  function cortes(espAtual) {
    var ks = Object.keys(CAT).sort(function (a, b) { return a - b; }), K = 10, x = 60, s = "", alt = 150;
    ks.forEach(function (k) {
      var c = CAT[k], e = c.esp * 100 * K, face = 1.5 * K, nuc = e - 2 * face;
      var g = '<g transform="translate(' + x + ',60)">';
      g += '<rect class="sec-face" x="0" y="0" width="' + f1(face) + '" height="' + alt + '"/><rect class="sec-eps" x="' + f1(face) + '" y="0" width="' + f1(nuc) + '" height="' + alt + '"/><rect class="sec-face" x="' + f1(face + nuc) + '" y="0" width="' + f1(face) + '" height="' + alt + '"/>';
      var d = Math.min(c.tuboMax / 10 * K, nuc - 2);
      g += '<circle class="sec-tubo" cx="' + f1(e / 2) + '" cy="' + f1(alt / 2) + '" r="' + f1(d / 2) + '"/>';
      g += '<text class="tl b" text-anchor="middle" x="' + f1(e / 2) + '" y="' + (alt + 30) + '" font-size="17">' + (espAtual === +k ? "● " : "") + "peça de " + k + " cm</text>";
      g += '<text class="tl" text-anchor="middle" x="' + f1(e / 2) + '" y="' + (alt + 52) + '" font-size="15">tubo máx. ' + c.tuboMax + " mm</text>";
      g += '<text class="tl s" text-anchor="middle" x="' + f1(e / 2) + '" y="' + (alt + 72) + '" font-size="13">núcleo de EPS ' + br(c.nucleo * 100, 0) + " cm</text></g>";
      s += g; x += Math.max(e, 190) + 90;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (x - 30) + ' 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Corte das peças com o tubo máximo por espessura">' + '<text class="tl b" x="60" y="30" font-size="16">Corte horizontal da parede, na mesma escala: faces de 1,5 cm, núcleo de EPS e o maior tubo que passa em cada espessura</text>' + s + "</svg>";
  }

  /* ------------------------------------------------------------------ dados */
  function somaAco(q, re) {
    var m = 0, k = 0, n = 0;
    arr(q.aco).forEach(function (a) { if (re.test(a.elemento)) { m += a.metros; k += a.kg; n += a.barras; } });
    return { m: m, kg: k, barras: n };
  }
  function pecasDe(pg, filtro) {
    var n = 0, peso = 0, tipos = { inteira: 0, meia: 0, recorte: 0, "recorte-L": 0 };
    arr(pg.pecas).forEach(function (p) { if (filtro(p)) { n++; peso += p.peso; tipos[p.tipo] = (tipos[p.tipo] || 0) + 1; } });
    return { n: n, peso: peso, tipos: tipos };
  }
  function concretoVergas(pg) {
    var cw = obj(pg.catalogo).concreto || 0, rf = obj(pg.reforcos), R = BlocokExec._ret;
    var fx = [].concat(arr(rf.vergas), arr(rf.contravergas)).map(function (f) { return { x: f.x, y: f.y, w: f.w, h: f.h }; });
    var vaos = arr(pg.vaos).map(function (v) { return { x: v.x, y: v.y, w: v.w, h: v.h }; });
    return R.areaUniao(R.subtrairTodos(fx, vaos)) * cw;
  }

  /* ------------------------------------------------------------------ gerar */
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    if (!r || !arr(r.paredes).length || !r.paredes.some(function (w) { return w && w.pag && arr(w.pag.pecas).length; })) {
      return { ok: false, html: "", paginas: [], avisos: ["Manual não gerado: o resultado do cálculo (BlocokCalc.calcular) não tem paredes paginadas."] };
    }
    var paredes = r.paredes.filter(function (w) { return w && w.pag && w.pag.ok; });
    var W = escolher(paredes), pg = W.pag, cam = mkCam(pg), q = obj(pg.quant), cons = obj(r.consolidado), TOT = obj(cons.totais);
    var obraO = obj(opcoes.obra), docO = obj(opcoes.documento), rtO = obj(opcoes.responsavel);
    var mont = BlocokExec.montagem(pg), dias = mont.diasAssentamento, por = mont.fiadasPorDia;
    var esp = pg.espessura, catE = CAT[esp] || {}, rf = obj(pg.reforcos), cfg = obj(pg.cfg);
    var fiadas = arr(pg.fiadas);
    var donos = arr(rf.pilaretes).filter(function (p) { return p.dono !== false; });
    var rt = (rtO.nome || rtO.crea) ? ((rtO.abrev ? rtO.abrev + " " : "") + (rtO.nome || "")).trim() + (rtO.crea ? " — " + (rtO.conselho || "CREA") + " " + rtO.crea : "") : null;
    var tituloObra = (obraO.nome || "[OBRA]") + " · Alvenaria Blocok · Manual de montagem";

    var paginas = [];
    function pag(secao, titulo, tipo, extra) { var p = { n: paginas.length + 1, secao: secao, titulo: titulo, tipo: tipo }; for (var k in extra) p[k] = extra[k]; paginas.push(p); return p; }
    pag("Abertura", "Capa", "capa"); pag("Abertura", "Sumário", "sumario"); pag("Abertura", "Como ler este manual", "como_ler");

    /* ---------- dados por etapa */
    var f1p = pecasDe(pg, function (p) { return p.fiada === 1; }), fRest = pecasDe(pg, function (p) { return p.fiada > 1; });
    var aPil = somaAco(q, /^(pilarete|estribos) /), aVg = somaAco(q, /^(verga|viga|contraverga) /), aCin = somaAco(q, /^cinta/);
    var cVg = concretoVergas(pg), cTotal = q.concretoM3;
    var cPil = Math.max(0, cTotal - cVg);
    var vgs = arr(W.vergas), pilsC = arr(W.pilaretes), cintaC = W.cinta;
    function armPil() { var p = pilsC[0]; return p && p.armadura ? p.armadura : null; }
    function estr(c) { return c && c.cisalhamento && c.cisalhamento.ok ? "φ" + br(c.cisalhamento.phi, 1) + " c/ " + br(c.cisalhamento.s * 100, 0) + NB + "cm" : null; }
    function linhas(rows) { return "<table><tr><th>Item</th><th class='n'>Quantidade</th></tr>" + rows.map(function (l) { return "<tr><td>" + l[0] + "</td><td class='n'>" + l[1] + "</td></tr>"; }).join("") + "</table>"; }
    var estim = ' <span class="est">(estimado)</span>';
    var dlbl = { 1: "ini", 2: "fim" };

    var ET = [
      { n: 1, titulo: "Fundação e esperas", sub: "A base nivelada e as barras dos pilaretes no lugar",
        frases: ["A parede parte de uma fundação nivelada e esquadrejada; nada na parede corrige a base depois.",
          "As esperas de aço dos pilaretes saem da fundação com " + N(obj(cfg.pilarete).esperaFundacao, 2, "m") + " acima do piso e têm de estar nos eixos marcados antes da primeira fiada.",
          "Tipo de fundação recomendado pelo cálculo: <b>" + T(obj(r.fundacao).recomendacao) + "</b>; o projeto de fundação é específico e prevalece."],
        aten: "Tolerância de nível e de esquadro da base: " + PH + " (a definir pelo projeto de fundação).",
        qt: linhas([["Pilaretes com espera (parede de referência)", N(donos.length, 0)], ["Barras de espera φ" + br(obj(obj(cfg.aco).pilarete).bitola, 0) + " (" + br(obj(obj(cfg.aco).pilarete).barras, 0) + " por pilarete)", N(donos.length * (obj(obj(cfg.aco).pilarete).barras || 0), 0)],
          ["Comprimento de espera acima do piso", N(obj(cfg.pilarete).esperaFundacao, 2, "m")], ["Carga linear máx. na fundação", N(obj(r.fundacao).qMax, 2, "kN/m")], ["Pilaretes na obra (todas as paredes)", N(arr(paredes).reduce(function (s, w) { return s + arr(obj(obj(w.pag).reforcos).pilaretes).filter(function (p) { return p.dono !== false; }).length; }, 0), 0)]]) },
      { n: 2, titulo: "Marcação", sub: "Eixo, vãos e pilaretes marcados sobre a fundação",
        frases: ["Marcar na fundação o eixo da parede, as bordas de cada vão e os eixos dos pilaretes, como na prancha.",
          "Conferir o comprimento e a diagonal do conjunto antes de assentar; a modulação é de " + N(0.9, 2, "m") + " mais junta de " + N((cfg.junta || 0.015) * 1000, 0, "mm") + ".",
          "Vão ou peitoril que não fecha com a altura da fiada deixa uma tira fina de peça, que quebra no corte: o ajuste é no projeto, não na obra."],
        aten: null,
        qt: linhas([["Comprimento da parede", N(pg.comprimento, 2, "m")], ["Altura da parede", N(pg.altura, 2, "m")], ["Vãos a marcar", N(arr(pg.vaos).length, 0)], ["Pilaretes a marcar", N(donos.length, 0)], ["Fiadas", N(fiadas.length, 0)]]) },
      { n: 3, titulo: "Primeira fiada", sub: "A fiada que dá o nível de toda a parede",
        frases: ["Espalhar a argamassa de nivelamento (cerca de " + N((obj(cfg.argamassa).nivelamento || 0.02) * 100, 0, "cm") + ") e assentar a primeira fiada com linha, nível e prumo.",
          "Peças inteiras nos trechos cegos; os recortes e as peças em L estão numerados na prancha e saem prontos do corte.",
          "Junta de " + N((cfg.junta || 0.015) * 1000, 0, "mm") + " cheia nos dois sentidos. A franquia acompanha esta fiada."],
        aten: null,
        qt: linhas([["Peças da 1ª fiada", N(f1p.n, 0)], ["Inteiras / recortes", N(f1p.tipos.inteira, 0) + " / " + N((f1p.tipos.recorte || 0) + (f1p.tipos["recorte-L"] || 0), 0)], ["Peso das peças", N(f1p.peso, 0, "kg")], ["Argamassa de assentamento da parede" + estim, N(q.argamassaM3, 3, "m³")]]) },
      { n: 4, titulo: "Fiadas seguintes e amarração", sub: "Meia peça, junta desencontrada, peça em L no canto do vão",
        frases: ["A segunda fiada começa em meia peça ou recorte, e assim a junta vertical nunca fica alinhada com a da fiada de baixo; transpasse mínimo de " + N(DIR.transpasseMin * 100, 0, "%") + " da peça.",
          "Assentar na ordem da numeração e retirar a argamassa que vaza da junta ainda fresca, até 1 cm de profundidade, para o tratamento posterior.",
          "No canto de cada vão entra peça em L (em laranja), de modo que nenhuma junta chegue ao canto da porta ou da janela.",
          "Ritmo de referência: " + N(por, 0) + " fiadas por dia" + estim + "; esta parede leva " + N(dias, 0) + " " + (dias === 1 ? "dia" : "dias") + " de assentamento" + estim + "."],
        aten: "Peça de uma fiada nunca fica sobre a junta vertical da fiada de baixo.",
        qt: linhas([["Peças das fiadas 2 a " + fiadas.length, N(fRest.n, 0)], ["Em L (cantos de vão)", N(fRest.tipos["recorte-L"], 0)], ["Peso das peças", N(fRest.peso, 0, "kg")], ["Menor transpasse obtido", N(obj(pg.validacao).menorTranspasse, 3, "m") + " (mín. " + br(obj(pg.validacao).transpasseMin, 3) + NB + "m)"], ["Dias de assentamento" + estim, N(dias, 0)]]) },
      { n: 5, titulo: "Cantos e encontros em T", sub: "Amarração alternada nos cantos; grampo no T",
        frases: ["Nos cantos as duas paredes se entrelaçam: numa fiada passa uma, na seguinte passa a outra (as pontas em azul e em marrom alternam por fiada).",
          "O encontro em T segue a mesma ideia; onde não dá para entrelaçar, usar grampo de ligação a cada fiada, ancorado " + N(DIR.ancoragemLigacao * 100, 0, "cm") + " no mínimo.",
          "Os pilaretes de canto e de encontro ficam nessas pontas; o espaçamento entre elementos estruturais não passa de " + N(DIR.espacamentoEstruturaMax, 1, "m") + "."],
        aten: null,
        qt: linhas([["Extremidade inicial / final", esc((obj(pg.ini).tipo || "—") + " / " + (obj(pg.fim).tipo || "—"))], ["Grampos de ligação (parede de referência)", N(q.grampos, 0)], ["Grampos de ligação (obra)", N(TOT.grampos, 0)], ["Ancoragem do grampo", N(DIR.ancoragemLigacao * 100, 0, "cm") + " (mín.)"]]) },
      { n: 6, titulo: "Vergas e contravergas", sub: "Escorar, retirar o EPS da faixa, armar e concretar",
        frases: ["Escorar o fundo de cada verga antes de concretar.",
          "Retirar o EPS na faixa marcada na prancha, posicionar a armadura do quadro ao lado e concretar; as faces da peça servem de fôrma.",
          "A verga avança de cada lado do vão o maior valor entre " + N(obj(cfg.verga).apoioMin * 100, 0, "cm") + " e " + N(obj(cfg.verga).apoioFrac * 100, 0, "%") + " do vão; a contraverga, entre " + N(obj(cfg.contraverga).apoioMin * 100, 0, "cm") + " e " + N(obj(cfg.contraverga).apoioFrac * 100, 0, "%") + ". Vão acima de " + N(obj(cfg.verga).vaoMaxVerga, 2, "m") + " é viga, com armadura própria."],
        aten: "Só retirar o escoramento depois da cura do concreto, conforme o projeto.",
        qt: linhas([["Vergas / contravergas", N(arr(rf.vergas).length, 0) + " / " + N(arr(rf.contravergas).length, 0)], ["Escoras (uma por verga)", N(q.escoramentoVergas, 0)],
          ["Armadura (calculada) da verga", vgs.length && vgs[0].armadura ? esc(vgs[0].armadura) + (estr(vgs[0]) ? "; estribos " + estr(vgs[0]) : "") : PH], ["Aço de vergas e contravergas", N(aVg.kg, 1, "kg")], ["Concreto C" + br(obj(r.parametros).fck, 0) + " (aprox.)", N(cVg, 3, "m³")]]) },
      { n: 7, titulo: "Pilaretes e cinta", sub: "Com a parede no topo: armar e concretar em camadas",
        frases: ["Com a parede montada até o topo, conferir o prumo e retirar o EPS das faixas dos pilaretes e da cinta de respaldo.",
          "Armar os pilaretes sobre as esperas da fundação e a cinta com a armadura do quadro; concretar em camadas, adensando.",
          "Pilarete de peça de 20 cm recebe a laje e leva 4 barras; nas peças de 13 e 15 cm o pilarete só trava a parede ao vento."],
        aten: null,
        qt: linhas([["Pilaretes (parede de referência)", N(donos.length, 0)], ["Armadura do pilarete", armPil() ? esc(armPil()) + (pilsC[0].estrutural ? "; estribos φ" + br(obj(r.parametros).estribo, 1) : (estr(pilsC[0]) ? "; estribos " + estr(pilsC[0]) : "")) : PH],
          ["Armadura da cinta", cintaC && cintaC.armadura ? esc(cintaC.armadura) + (estr(cintaC) ? "; estribos " + estr(cintaC) : "") : PH], ["Aço de pilaretes e estribos / cinta", N(aPil.kg, 1, "kg") + " / " + N(aCin.kg, 1, "kg")], ["Concreto de pilaretes e cinta (por diferença)", N(cPil, 3, "m³")], ["Concreto total da parede", N(cTotal, 3, "m³")]]) },
      { n: 8, titulo: "Instalações", sub: "O tubo passa pelo núcleo de EPS, entre as faixas de concreto",
        frases: ["O núcleo de EPS comporta tubos até o diâmetro máximo de cada espessura, como no corte ao lado.",
          "Não furar nem rasgar as faixas de concreto armado (pilaretes, vergas e cinta): a tubulação passa pelo EPS, entre elas.",
          "O método de abertura do rasgo e o material de fechamento: " + PH + " (a definir pelo fabricante). Passar as instalações antes do tratamento das juntas."],
        aten: null, ilus: cortes(esp),
        qt: linhas(Object.keys(CAT).sort(function (a, b) { return a - b; }).map(function (k) { return ["Peça de " + k + " cm" + (+k === esp ? " (esta parede)" : ""), "tubo até " + CAT[k].tuboMax + NB + "mm"]; })) },
      { n: 9, titulo: "Tratamento de juntas", sub: "Sequência do vídeo oficial Blocok Original (11/06/2026)",
        lista: ["Só depois de concretar a laje e retirar as escoras.", "Raspar a junta até 0 a 1 cm de profundidade (feito no assentamento, com a argamassa fresca).", "Quebrar a quina de 90° das bordas com ponteira triangular.",
          "Desbastar 2,5 a 3 cm de cada lado da junta, com maquita e disco flap, para abrir os poros do microconcreto.", "Limpar o pó com trincha seca.", "Selar a junta e 2,5 cm de cada lado com selador diluído 1:1 (no vídeo, “Prepara Certo”).",
          "Aplicar argamassa AC-III aditivada com espátula, em três movimentos, no interior da junta e 2,5 a 3 cm de cada lado.", "Assentar a tela de fibra de vidro centralizada na junta, sem dobras; na vertical, deixar sobra para sobrepor à horizontal.",
          "Segunda demão de AC-III escondendo a tela; retirar o excesso."],
        aten: "Fase seguinte só depois de seco: massa e pintura.",
        qt: (function () { var t = obj(q.tratamento); return linhas([["Juntas por face (parede de referência)", N(t.juntaPorFaceM, 1, "m")], ["Tela de fibra de vidro" + estim, N(t.telaM, 1, "m")], ["Argamassa AC-III" + estim, N(t.acIIIkg, 1, "kg")], ["Selador" + estim, N(t.seladorL, 2, "L")], ["Faces tratadas", N(t.faces, 0)]]); })() },
      { n: 10, titulo: "Acabamento", sub: "Massa e pintura sobre o painel; sem chapisco nem reboco",
        frases: ["Com as juntas tratadas e secas, aplicar massa acrílica ou massa corrida e a pintura.",
          "O painel dispensa chapisco e reboco; a superfície recebe o acabamento direto.",
          "Revestimento cerâmico ou pastilha pode ser colado direto na placa; argamassa colante: " + PH + " (a definir pelo fabricante)."],
        aten: null,
        qt: linhas([["Área líquida da parede (sem vãos)", N(q.areaLiquida, 2, "m²")], ["Área líquida da obra", N(TOT.areaLiquida, 2, "m²")], ["Consumo de massa e tinta", PH]]) }
    ];

    ET.forEach(function (e) { e.pagina = pag("Etapas de montagem", "Etapa " + e.n + " — " + e.titulo, "etapa", { etapa: e.n }); });
    pag("Fecho", "Tabela resumida da obra", "tabela");
    var NPAG = paginas.length;

    /* ---------- moldura */
    function legendaHtml(cls) {
      var it = [["#bcd9ee", A, "Peças da etapa"], ["#ecdcb8", MARROM, "Pontas das fiadas pares"], ["#f8dcb6", LARANJA, "Peça em L (canto de vão)"], ["#dde1e4", "#aeb7bd", "Já montado"], ["#fff", "#c3ccd2", "Ainda não montado (tracejado)"],
        ["rgba(63,120,24,.45)", VERDE, "Pilarete (concreto)"], ["rgba(200,118,26,.5)", LARANJA, "Verga / contraverga"], ["rgba(111,95,72,.5)", MARROM, "Cinta de respaldo"], ["#fff", "#55616a", "Vão (porta / janela)"]];
      return '<div class="' + cls + '">' + it.map(function (x) { return '<div><i style="background:' + x[0] + ";border-color:" + x[1] + '"></i>' + x[2] + "</div>"; }).join("") + "</div>";
    }
    function moldura(p, corpo, comLeg) {
      var rod = '<div class="rod"><div class="lg">RA ENGENHARIA<br>ESPECIAL</div><div class="tt"><div class="obra">' + esc(tituloObra) + '</div><div class="tit">' + esc(p.titulo) + "</div></div>" +
        '<div class="sec"><b>' + esc(p.secao) + "</b><br>Mesma vista em todas as páginas</div>" +
        '<div class="doc">' + esc(docO.numero || "") + (docO.revisao ? " · Revisão " + esc(docO.revisao) : "") + (docO.data ? " · " + esc(docO.data) : "") + "<br>RT " + (rt ? esc(rt) : '<span class="ph">[RESPONSÁVEL TÉCNICO — CREA]</span>') + "</div>" +
        '<div class="np"><b>' + p.n + "</b><small>de " + NPAG + "</small></div></div>";
      return '<div class="pg" id="p' + p.n + '" data-tipo="' + p.tipo + '">' + corpo + (comLeg ? legendaHtml("legenda-fixa") : "") + '<div class="mold"></div>' + rod + "</div>";
    }

    /* ---------- abertura */
    function capa(p) {
      var obraTxt = [obraO.nome, obraO.local].filter(Boolean).map(function (x) { return T(x); }).join(" — ") || PH;
      var c = '<div class="capa"><div class="faixa"><div class="l1">' + (rtO.empresa ? esc(rtO.empresa) : "RA ENGENHARIA ESPECIAL") + '<br><span style="font-size:9pt;font-weight:400">[LOGO]</span></div><div class="rod2">Manual de montagem para a equipe de obra<br>Alvenaria de painéis Blocok</div></div>' +
        '<div class="lin"></div><div class="lin2"></div>' +
        '<div class="tx"><div class="sup">Manual de montagem</div><div class="t1">Alvenaria Blocok<br>' + T(obraO.nome) + '</div><div class="t2">' + ET.length + " etapas, da fundação ao acabamento, para a equipe que assenta os painéis" + "</div>" + (r.ok === false ? '<div style="margin-top:4mm;font-size:10pt;font-weight:600;color:#a3352b;border:.5mm solid #a3352b;padding:2mm 3mm">Atenção: o cálculo desta revisão tem itens não atendidos (ver o memorial). Manual não liberado para a obra.</div>' : "") + "</div>" +
        '<div class="hero">' + elevacao(cam, pg, 99, { estado: function (pc) { return pc.tipo === "recorte-L" ? "alvoL" : "alvo"; } }) + "</div>" +
        '<div class="t3"><b>Obra:</b> ' + obraTxt + (obraO.cliente ? " · <b>Cliente:</b> " + T(obraO.cliente) : "") + "<br><b>Responsável técnico:</b> " + (rt ? esc(rt) : '<span class="ph">[RESPONSÁVEL TÉCNICO — CREA]</span>') +
        "<br><b>Esta edificação:</b> " + N(paredes.length, 0) + " paredes, " + N(TOT.pecas, 0) + " peças, " + N(TOT.areaLiquida, 1, "m²") + " de parede.</div>" +
        '<div class="rv"><div>Documento<b>' + (docO.numero ? esc(docO.numero) : PH) + '</b></div><div>Revisão<b>' + (docO.revisao ? esc(docO.revisao) : PH) + '</b></div><div>Data<b>' + (docO.data ? esc(docO.data) : (r.data ? esc(String(r.data).split("-").reverse().join("/")) : PH)) + '</b></div><div>Formato<b>A3 · ' + NPAG + " páginas</b></div></div></div>";
      return '<div class="pg capa" id="p' + p.n + '" data-tipo="capa">' + c + "</div>";
    }
    function sumario(p) {
      var h = '<div class="cont"><h1><small>Sumário</small>As etapas, na ordem da obra</h1><div class="sum" style="width:260mm">', ult = null;
      paginas.forEach(function (q2) { if (q2.n <= 2) return; if (q2.secao !== ult) { ult = q2.secao; h += '<div class="s">' + esc(ult) + "</div>"; } h += '<div class="i">' + esc(q2.titulo) + "<span></span><b>" + q2.n + "</b></div>"; });
      h += '</div><div style="position:absolute;left:280mm;top:34mm;width:100mm"><div class="box"><b>Documentos que este manual acompanha (e não substitui):</b><br>· Pranchas do projeto executivo: paginação peça a peça de cada parede, vergas, pilaretes, armaduras;<br>· Memorial de cálculo da edificação em Blocok;<br>· Projeto da fundação.</div>' +
        '<div class="box"><b>Fora deste manual:</b> projeto de fundação, esquadrias, laje e cobertura, instalações hidráulicas e elétricas.</div></div></div>';
      return moldura(p, h, false);
    }
    function comoLer(p) {
      var ordem = ET.map(function (e) { return "<li>" + esc(e.titulo) + " <em style='color:" + MARROM + ";font-style:normal'>(p. " + e.pagina.n + ")</em></li>"; }).join("");
      var c = '<div class="cont"><h1><small>Como ler este manual</small>Cores, números e convenções</h1><div style="display:flex;gap:12mm">' +
        '<div style="width:170mm"><h2>Cores (as mesmas em todas as páginas)</h2>' + legendaHtml("legenda") +
        "<h2>Em cada etapa</h2><p>A ilustração mostra sempre a <b>mesma parede, do mesmo ponto de vista</b>: as peças e faixas da etapa em cor, o que já foi montado em cinza e o que ainda falta em traço pontilhado. Abaixo, o que fazer e, ao lado, as quantidades da etapa.</p></div>" +
        '<div style="width:110mm"><h2>Parede de referência e números das peças</h2><p>As ilustrações usam a parede <b>' + esc(pg.id) + (pg.nome ? " — " + esc(pg.nome) : "") + "</b>, a de maior número de peças (" + N(arr(pg.pecas).length, 0) + "); as outras seguem o mesmo procedimento. O número dentro de cada peça é o da prancha: assentar na ordem da numeração. Peças cortadas (recortes e peças em L) chegam prontas e numeradas.</p>" +
        "<h2>Prazos e consumos</h2><p>Consumo de argamassa, consumo do tratamento de juntas e fiadas por dia ainda não foram publicados pelo fabricante: os valores marcados <i>estimado</i> são parâmetros editáveis. A <b>" + N(dias, 0) + " " + (dias === 1 ? "dia" : "dias") + " de assentamento</b> desta parede são " + N(fiadas.length, 0) + " fiadas a " + N(por, 0) + " por dia" + estim + ".</p></div>" +
        '<div style="width:80mm"><h2>Ordem das etapas</h2><ol style="font-size:9.8pt">' + ordem + "</ol></div></div></div>";
      return moldura(p, c, false);
    }
    function etapaPg(e) {
      var corpo = '<div class="etapa-cab"><div class="num"><small>ETAPA</small><b>' + e.n + "</b></div><div><h1>" + esc(e.titulo) + '</h1><div class="sub">' + esc(e.sub) + "</div></div></div>" +
        '<div class="ilus">' + (e.ilus || elevacao(cam, pg, e.n)) + "</div>" +
        '<div class="txt">' + (e.lista ? '<ol style="columns:2;column-gap:10mm;font-size:10pt">' + e.lista.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>" : e.frases.map(function (x) { return "<p>" + x + "</p>"; }).join("")) +
        (e.aten ? '<div class="aten"><b>Atenção.</b> ' + e.aten + "</div>" : "") + "</div>" +
        '<div class="qt"><h2 style="margin-top:0">Quantidades da etapa</h2>' + e.qt + "</div>";
      return moldura(e.pagina, corpo, e.n !== 8);
    }
    function tabelaFinal(p) {
      var rows = paredes.map(function (w) {
        var qq = obj(obj(w.pag).quant), d = BlocokExec.montagem(w.pag).diasAssentamento;
        return "<tr><td>" + esc(w.id) + (w.nome ? " — " + esc(w.nome) : "") + "</td><td class='n'>" + N(w.espessura, 0) + "</td><td class='n'>" + N(qq.pecas, 0) + "</td><td class='n'>" + N(qq.placasCompra, 0) + "</td><td class='n'>" + N(qq.pesoPecasKg, 0) + "</td><td class='n'>" + N(qq.concretoM3, 2) + "</td><td class='n'>" + N(qq.acoKg, 1) + "</td><td class='n'>" + N(qq.grampos, 0) + "</td><td class='n'>" + N(d, 0) + "</td></tr>";
      }).join("");
      var tot = "<tr class='tot'><td>Total da obra</td><td></td><td class='n'>" + N(TOT.pecas, 0) + "</td><td class='n'>" + N(TOT.placasCompra, 0) + "</td><td class='n'>" + N(TOT.pesoPecasKg, 0) + "</td><td class='n'>" + N(TOT.concretoM3, 2) + "</td><td class='n'>" + N(TOT.acoKg, 1) + "</td><td class='n'>" + N(TOT.grampos, 0) + "</td><td class='n'></td></tr>";
      var ac = arr(cons.aco).map(function (a) { return ["φ" + br(a.bitola, a.bitola % 1 ? 1 : 0) + " mm", N(a.metros, 1, "m"), N(a.kg, 1, "kg")]; });
      var c = '<div class="cont"><h1><small>Fecho</small>Tabela resumida da obra</h1><div style="display:flex;gap:10mm"><div style="width:250mm"><h2>Peças, concreto e aço por parede</h2>' +
        "<table><tr><th>Parede</th><th class='n'>Esp. (cm)</th><th class='n'>Peças</th><th class='n'>Placas p/ compra</th><th class='n'>Peso das peças (kg)</th><th class='n'>Concreto (m³)</th><th class='n'>Aço (kg)</th><th class='n'>Grampos</th><th class='n'>Dias assent.<span class='est'> (est.)</span></th></tr>" + rows + tot + "</table>" +
        '<div class="box">Quantidades do cálculo e da paginação, sem perdas além do plano de corte. O aço é a armadura construtiva do motor executivo; a calculada (memorial) prevalece onde for maior. Dias de assentamento: ' + N(por, 0) + " fiadas por dia" + estim + ", por parede, uma equipe.</div></div>" +
        '<div style="width:118mm"><h2>Peças por espessura</h2><table><tr><th>Esp. (cm)</th><th class="n">Peças</th><th class="n">Placas p/ compra</th><th class="n">Área (m²)</th></tr>' +
        arr(cons.porEspessura).map(function (e) { return "<tr><td>" + N(e.espessura, 0) + "</td><td class='n'>" + N(e.pecas, 0) + "</td><td class='n'>" + N(e.placasCompra, 0) + "</td><td class='n'>" + N(e.area, 1) + "</td></tr>"; }).join("") + "</table>" +
        "<h2>Aço por bitola</h2><table><tr><th>Bitola</th><th class='n'>Comprimento</th><th class='n'>Massa</th></tr>" + ac.map(function (a) { return "<tr><td>" + a[0] + "</td><td class='n'>" + a[1] + "</td><td class='n'>" + a[2] + "</td></tr>"; }).join("") + "</table>" +
        "<h2>Tratamento de juntas" + estim + "</h2><table><tr><td>Tela de fibra de vidro</td><td class='n'>" + N(TOT.telaM, 1, "m") + "</td></tr><tr><td>Argamassa AC-III</td><td class='n'>" + N(TOT.acIIIkg, 1, "kg") + "</td></tr><tr><td>Selador</td><td class='n'>" + N(TOT.seladorL, 1, "L") + "</td></tr></table></div></div></div>";
      return moldura(p, c, false);
    }

    var html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" + esc("Manual de montagem — Alvenaria Blocok — " + (obraO.nome || "obra")) + "</title><style>" + CSS + "</style></head><body>";
    paginas.forEach(function (p) {
      if (p.tipo === "capa") html += capa(p);
      else if (p.tipo === "sumario") html += sumario(p);
      else if (p.tipo === "como_ler") html += comoLer(p);
      else if (p.tipo === "etapa") html += etapaPg(ET[p.etapa - 1]);
      else html += tabelaFinal(p);
    });
    html += "</body></html>";

    // varredura de valores indefinidos no texto
    var txt = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    var ach = txt.match(/\b(undefined|nan|null|infinity)\b/gi);
    if (ach) {
      avisos.push("O manual continha " + ach.length + " valor(es) indefinido(s), trocado(s) por “[valor indefinido]”.");
      html = html.replace(/(>[^<]*?)\b(undefined|NaN|null|Infinity)\b/gi, function (m0, a) { return a + '<span class="ph">[valor indefinido]</span>'; });
    }
    if (r.ok === false) avisos.push("O cálculo desta revisão tem itens não atendidos (ver o memorial): manual não liberado para a obra.");
    if (arr(r.pendencias).length) avisos.push(arr(r.pendencias).length + " pendência(s) do cálculo em aberto (ver o memorial).");
    return { ok: true, html: html, paginas: paginas, avisos: avisos, parede: pg.id };
  }

  return { gerar: gerar };
});

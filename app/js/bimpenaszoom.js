/* =====================================================================
 * OrçaPRO — BimPenasZoom: a espessura da linha da vista 2D AO VIVO segue o zoom
 * (15/11/2026). ES5 puro; o motor (funções puras) roda em Node:
 * node tools/test-bim-penas-zoom.js
 *
 * O PROBLEMA: a vista usa vector-effect="non-scaling-stroke" — a linha tem
 * os mesmos pixels em qualquer zoom. Afastando, paredes viram faixas pretas,
 * hachura vira mancha e os textos se amontoam.
 *
 * COMO NO REVIT / NO PAPEL: a pena é mm de PAPEL na escala da vista. Quantos
 * pixels vale 1 mm de papel agora?
 *     pxPorMm = (px de tela por metro do modelo) × escala / 1000
 * (1:50 com 50 px/m na tela = 2,5 px por mm). A linha de tela é a que o
 * desenho já traz (pena em px a 1 mm = 96/25,4 px, o "tamanho real" do papel)
 * multiplicada por pxPorMm / (96/25,4): perto engrossa, longe afina, com
 * PISO de 0,5 px (nunca some) e TETO (não vira barra).
 *   - data-mm (estilos de objeto P6: data/penas-ra.json, a MESMA tabela da
 *     folha, do PDF e do DXF) manda quando existe; senão vale o px do SVG
 *     (PENAS de js/desenho2d.js).
 *   - HACHURA: o passo do padrão já é em unidades do modelo; o que muda é a
 *     leitura — passo em px < 5 esmaece a linha; < 2,5 vira um tom de
 *     preenchimento leve (nunca mancha).
 *   - TEXTO: o tamanho já é de papel (escala com o zoom); abaixo de um
 *     tamanho mínimo em px é ocultado, por prioridade: nome do ambiente
 *     (some por último) > cotas > textos menores (somem primeiro).
 * Só ESTILO muda no zoom (atributo style): a geometria não é refeita.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PX_MM_REAL = 96 / 25.4;   /* 1 mm de papel a 100% */
  var PISO_PX = 0.5;
  var TETO_FATOR = 2.5;         /* a linha nunca passa de 2,5× a de papel a 100% … */
  var TETO_PX = 7;              /* … nem de 7 px */

  /* px de tela por mm de papel */
  function pxPorMmPapel(pxPorMetro, escala) {
    var s = +pxPorMetro, e = +escala;
    if (!(s > 0) || !(e > 0)) return PX_MM_REAL;
    return s * e / 1000;
  }

  /* largura final em px. base = px que a linha teria a 100% (papel real);
     mm (opcional) = a pena em mm de papel (vence a base) */
  function larguraPx(base, mm, pxMm) {
    var b = mm > 0 ? mm * PX_MM_REAL : +base;
    if (!(b > 0)) b = PISO_PX;
    b = Math.max(PISO_PX, b);
    var k = (pxMm > 0 ? pxMm : PX_MM_REAL) / PX_MM_REAL;
    var v = b * k;
    var teto = Math.max(PISO_PX, Math.min(TETO_PX, b * TETO_FATOR));
    return Math.round(Math.max(PISO_PX, Math.min(teto, v)) * 1000) / 1000;
  }

  /* hachura: passoPx = espaçamento do padrão na tela.
     → { linha: opacidade da linha 0..1, tom: opacidade do preenchimento de tom 0..0,22 } */
  var HACH_CHEIA = 5, HACH_TOM = 2.5;
  function hachura(passoPx) {
    var p = +passoPx;
    if (!(p > 0)) return { linha: 1, tom: 0 };
    if (p >= HACH_CHEIA) return { linha: 1, tom: 0 };
    if (p <= HACH_TOM) return { linha: 0, tom: 0.22 };
    var t = (p - HACH_TOM) / (HACH_CHEIA - HACH_TOM);   /* 0..1 */
    return { linha: Math.round((0.15 + 0.85 * t) * 100) / 100, tom: Math.round(0.22 * (1 - t) * 100) / 100 };
  }

  /* texto: prioridade pela classe; alturaPx = altura da fonte na tela.
     nome do ambiente < cota < resto: o mínimo em px sobe na mesma ordem. */
  var MIN_NOME = 5, MIN_COTA = 6.5, MIN_RESTO = 8, FADE = 1.5;
  function classeTexto(cls) {
    var c = " " + String(cls || "") + " ";
    if (/ d2-amb-nome /.test(c)) return "nome";
    if (/ d2-cota-tx /.test(c)) return "cota";
    if (/ d2-(tit-tx|tit-esc|leg-tit|leg-tx|amb-leg-tit|amb-leg-tx) /.test(c)) return "titulo";
    return "resto";
  }
  function texto(alturaPx, cls) {
    var h = +alturaPx, tp = classeTexto(cls);
    var min = tp === "nome" ? MIN_NOME : tp === "cota" ? MIN_COTA : tp === "titulo" ? MIN_NOME : MIN_RESTO;
    if (!(h > 0)) return { visivel: false, opacidade: 0, tipo: tp };
    if (h >= min + FADE) return { visivel: true, opacidade: 1, tipo: tp };
    if (h < min) return { visivel: false, opacidade: 0, tipo: tp };
    return { visivel: true, opacidade: Math.round((0.35 + 0.65 * (h - min) / FADE) * 100) / 100, tipo: tp };
  }

  var Motor = { PX_MM_REAL: PX_MM_REAL, PISO_PX: PISO_PX, TETO_PX: TETO_PX, pxPorMmPapel: pxPorMmPapel, larguraPx: larguraPx,
    hachura: hachura, texto: texto, classeTexto: classeTexto, HACH_CHEIA: HACH_CHEIA, HACH_TOM: HACH_TOM };

  /* ---------------------------------------------------------------
   * DOM: aplica ao SVG vivo (não existe em Node)
   * --------------------------------------------------------------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  /* camadas de interação (alças, seleção, elástico): ficam na espessura de tela */
  var PULAR = /(^|\s)d2-(pick|alca|sel-l|marca-sel|elastico|snap)[a-z0-9-]*(\s|$)/;

  function escalaDaVista(svg, escalaDada) {
    if (escalaDada > 0) return +escalaDada;
    /* título "ESC 1:50" no próprio SVG */
    var t = svg.querySelector(".d2-tit-esc");
    var m = t && /1\s*:\s*(\d+)/.exec(t.textContent || "");
    return m ? +m[1] : 0;
  }

  function aplicar(svg, opc) {
    if (!svg || !svg.getScreenCTM) return false;
    opc = opc || {};
    var ctm = svg.getScreenCTM(); if (!ctm || !(ctm.a > 0)) return false;
    var scr = ctm.a;   /* px por unidade do desenho (metro) */
    var esc = escalaDaVista(svg, opc.escala); if (!(esc > 0)) return false;
    var pxMm = pxPorMmPapel(scr, esc);
    if (svg._pzUlt && Math.abs(svg._pzUlt - scr) / scr < 0.004 && !opc.forcar) return false;   /* arrastar não muda a escala */
    svg._pzUlt = scr;

    /* 1) LINHAS */
    var els = svg.querySelectorAll('[vector-effect="non-scaling-stroke"]'), i, el, b, mm, base;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      if (PULAR.test(el.getAttribute("class") || "")) continue;
      b = el.getAttribute("data-pz0");
      if (b === null) { b = el.getAttribute("stroke-width"); if (b === null) continue; el.setAttribute("data-pz0", b); }
      base = parseFloat(b); mm = parseFloat(el.getAttribute("data-mm"));
      el.style.strokeWidth = larguraPx(base, mm > 0 ? mm : 0, pxMm) + "px";
    }

    /* 2) HACHURA: passo (largura do padrão) em px */
    var pats = svg.querySelectorAll("pattern"), p, pw, ef, ls, j, rect;
    for (i = 0; i < pats.length; i++) {
      p = pats[i]; pw = parseFloat(p.getAttribute("width")); if (!(pw > 0)) continue;
      ef = hachura(pw * scr);
      rect = p.querySelector("rect[data-pz-tom]");
      if (!rect) {
        rect = svg.ownerDocument.createElementNS(SVGNS, "rect");
        rect.setAttribute("data-pz-tom", "1"); rect.setAttribute("width", p.getAttribute("width")); rect.setAttribute("height", p.getAttribute("height") || p.getAttribute("width"));
        rect.setAttribute("fill", "#1a1a1a"); rect.setAttribute("fill-opacity", "0"); rect.setAttribute("stroke", "none");
        p.insertBefore(rect, p.firstChild);
      }
      rect.setAttribute("fill-opacity", String(ef.tom));
      ls = p.querySelectorAll("line, path");
      for (j = 0; j < ls.length; j++) ls[j].style.strokeOpacity = ef.linha;
    }

    /* 3) TEXTOS: altura de tela = font-size × escala do transform × px/m */
    var tx = svg.querySelectorAll("text"), t, h0, r, tr, mt;
    for (i = 0; i < tx.length; i++) {
      t = tx[i];
      h0 = t.getAttribute("data-pz-h");
      if (h0 === null) {
        tr = t.getAttribute("transform") || ""; mt = /scale\(\s*([0-9.eE+-]+)/.exec(tr);
        h0 = mt ? 100 * parseFloat(mt[1]) : parseFloat(t.getAttribute("font-size")) || 0;
        t.setAttribute("data-pz-h", String(h0));
      }
      h0 = parseFloat(h0); if (!(h0 > 0)) continue;
      r = texto(h0 * scr, t.getAttribute("class"));
      t.style.display = r.visivel ? "" : "none";
      t.style.opacity = r.visivel && r.opacidade < 1 ? String(r.opacidade) : "";
    }
    return true;
  }

  var PenasZoom = { motor: Motor, aplicar: aplicar };
  PenasZoom.pxPorMmPapel = pxPorMmPapel; PenasZoom.larguraPx = larguraPx; PenasZoom.hachura = hachura; PenasZoom.texto = texto;
  global.BimPenasZoom = PenasZoom;
  if (typeof module !== "undefined" && module.exports) module.exports = PenasZoom;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

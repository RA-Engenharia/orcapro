/* =====================================================================
 * blocokpranchas.js — PRANCHAS EXECUTIVAS do sistema Blocok (motor puro, sem tela)
 *
 * BlocokPranchas.gerar(resultado, opcoes) → { ok, folhas:[{id, numero, rotulo, titulo, formato,
 *   escala, svg, ...}], avisos, dados }
 *   resultado = BlocokCalc.calcular(obra) (paredes[].pag = BlocokExec.paginar).
 *
 * Folhas (A1 horizontal, carimbo RA INTOCADO de js/prancha.js):
 *   LOCAÇÃO   planta esquemática dos reforços + QUADRO DE PILARETES E VERGAS
 *   PAGINAÇÃO uma ou mais paredes por folha (1:20 ou 1:25): elevação com cada peça no tamanho real,
 *             faixas de EPS retirado, vãos, cotas, tabela de peças e totais
 *   DETALHES  corte da peça, canto L, T com grampo, verga, pilarete, cinta, tratamento de junta,
 *             encunhamento/ligação
 *   AÇO       tabela de aço no padrão TQS (linha por elemento) + resumo por bitola
 *
 * O desenho é montado UMA vez em primitivas (mm de papel, y para baixo) e sai em SVG aqui e em DXF
 * (js/blocokdxf.js) — o mesmo desenho nos dois. Regra da casa: NENHUM texto sobre cota ou sobre
 * outro texto (memória "pranchas sem sobreposição"): cada folha leva as caixas de texto e os
 * segmentos de cota, e BlocokPranchas.sobreposicoes(folha) confere.
 *
 * ⚠ ES5 puro (UMD), Node-testável, sem DOM. Teste: node tools/test-blocokpranchas.js
 * ⚠ NÃO inventa dado: o que o motor não traz (bitola/Ø do grampo, material do encunhamento,
 *   cobrimento exato) sai como placeholder [a definir] e vai para a lista de pendências.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./prancha.js"), require("./blocokexec.js"));
  else root.BlocokPranchas = factory(root.Prancha, root.BlocokExec);
})(typeof self !== "undefined" ? self : this, function (Prancha, BlocokExec) {
  "use strict";

  /* ================================================================ PADRÃO
   * Fonte: Padrão RA de Detalhamento v2.4 (padrao_detalhamento_ra.json — penas, layers, textos, cotas,
   * notação TQS, tabelas, carimbo). Para ALVENARIA/PAGINAÇÃO o JSON não tem seção: o que está marcado
   * "CRIADO" abaixo foi criado aqui, coerente com o JSON (09/10/2026: "tipo sem padrão → criar sem
   * perguntar"), e precisa ir para o JSON como seção "alvenaria_blocok". */
  var PADRAO = {
    versao: "blocok-pranchas 1.0 (14/10/2026)",
    base: "Padrão RA de Detalhamento v2.4 (visual TQS, carimbo RA intocado)",
    fonte: "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif",     /* JSON textos.fonte_ttf */
    formato: "A1",                                                /* JSON prancha.formato_padrao */
    /* penas por layer (mm) e cor ACI — valores do JSON (layers + cor_pena_ctb). lt = tipo de linha. */
    layers: {
      "EST-FORMA-VISTA":  { aci: 92,  pena: 0.25, lt: null,          uso: "contorno da peça (concreto/face em vista) — JSON" },
      "EST-FORMA-CORTE":  { aci: 200, pena: 0.50, lt: null,          uso: "concreto cortado: faixas de reforço, seções dos detalhes — JSON" },
      "EST-HACHURA":      { aci: 9,   pena: 0.09, lt: null,          uso: "hachura ANSI31 — JSON" },
      "EST-OCULTA":       { aci: 42,  pena: 0.18, lt: "TRACEJADO",   uso: "vãos (arestas ocultas/projeções) — JSON" },
      "EST-COTA":         { aci: 1,   pena: 0.13, lt: null,          uso: "cotas e linhas de chamada — JSON" },
      "EST-EIXO":         { aci: 1,   pena: 0.13, lt: "TRACO-PONTO", uso: "eixos — JSON" },
      "EST-TEXTO":        { aci: 7,   pena: 0.25, lt: null,          uso: "textos e notas — JSON" },
      "EST-TITULO":       { aci: 150, pena: 0.35, lt: null,          uso: "títulos dos desenhos — JSON" },
      "EST-TABELA":       { aci: 7,   pena: 0.25, lt: null,          uso: "tabelas — JSON" },
      "EST-ARM-TEXTO":    { aci: 42,  pena: 0.18, lt: null,          uso: "notação das barras (letra monolinha) — JSON" },
      "EST-ARM-LONG":     { aci: 30,  pena: 0.60, lt: null,          uso: "barra longitudinal/grampo (a mais grossa do desenho) — JSON" },
      "EST-ARM-ESTRIBO":  { aci: 150, pena: 0.35, lt: null,          uso: "estribos — JSON" },
      "EST-ARM-SECAO":    { aci: 200, pena: 0.50, lt: null,          uso: "barra em seção (ponto cheio) — JSON" },
      "EST-ARM-CHAMADA":  { aci: 1,   pena: 0.13, lt: null,          uso: "chamadas das posições — JSON" },
      "EST-CONTEXTO":     { aci: 8,   pena: 0.13, lt: null,          uso: "contexto (EPS, laje) — JSON" },
      "EST-LINHA-FINA":   { aci: 42,  pena: 0.18, lt: null,          uso: "linhas finas secundárias — JSON" },
      "BLK-NUM":          { aci: 42,  pena: 0.18, lt: null,          uso: "CRIADO: código/dimensões da peça (mesma pena de EST-ARM-TEXTO)" },
      "BLK-EPS":          { aci: 8,   pena: 0.13, lt: null,          uso: "CRIADO: núcleo de EPS nos detalhes (cinza de contexto, pena 0,13)" },
      "BLK-TRATAMENTO":   { aci: 150, pena: 0.35, lt: null,          uso: "CRIADO: camadas do tratamento de junta (mesma pena de estribo)" }
    },
    /* alturas de texto (CORPO da fonte, mm de papel) — JSON textos.alturas_plotadas_mm */
    textos: {
      titulo: 4.2,           /* titulo_desenho */
      escala: 3.0,           /* escala_sob_titulo */
      nota: 2.5, cota: 2.5, tabela: 2.5, notacao: 2.5,
      cabecalho: 3.1,        /* tabela_cabecalho */
      quadro: 7.5,           /* titulo_quadro ("NOTAS", "LEGENDA") */
      trecho: 2.1,           /* notacao_estribo_trecho — usado nas dimensões da peça */
      letraCorte: 3.4,
      minimo: 1.8            /* CRIADO: piso para texto dentro de peça estreita */
    },
    /* cotas — JSON cotas: unidade cm, ponto cheio nos terminais, texto acima da linha, girado 90° na vertical */
    cotas: { pontoRaio: 0.55, extensaoAlem: 1.5, afastamento: 1, textoFolga: 0.8 },
    hachuras: { espaco: 2.0, fino: 1.0 },          /* ANSI31 — JSON hachuras (espaçamento em mm de papel: CRIADO) */
    escalas: {
      paginacao: [20, 25],                          /* CRIADO: elevação da parede — 1:20, senão 1:25 */
      paginacaoReserva: [30, 40, 50],               /* CRIADO: só se a parede não couber em 1:25 (avisa) */
      planta: [50, 75, 100, 125, 150, 200],         /* JSON escalas.planta_locacao = 1:50 (maior número só se não couber) */
      detalhe: "1:2 (corte da peça, junta), 1:5 (verga, cinta, pilarete, encunhamento), 1:10 (canto, T)"
    },
    tabelas: {
      aco: ["AÇO", "POS", "BIT (mm)", "QUANT", "COMPR UNIT (cm)", "COMPR TOTAL (cm)", "PESO (kg)"],   /* JSON tabelas.por_elemento + coluna de peso pedida */
      resumo: ["AÇO", "BIT (mm)", "COMPR (m)", "PESO (kg)"],                                           /* JSON tabelas.resumo (sem +10%) */
      acoCodigo: "50A = CA-50; 60B = CA-60 (JSON tabelas.aco_codigo). Bitola 5,0 = 60B (NBR 7480: φ5 só existe em CA-60); demais = 50A (CRIADO, ver pendência)"
    },
    tiposPeca: {   /* CRIADO: legenda de tipo (sem hachura, para não passar linha sob o número da peça) */
      inteira: { cod: "", nome: "inteira" }, meia: { cod: "M", nome: "meia" },
      recorte: { cod: "R", nome: "recorte" }, "recorte-L": { cod: "L", nome: "recorte em L" }
    },
    folha: {
      margens: "20/10/10/10 mm (carimbo RA, js/prancha.js)",
      organizacao: "CRIADO: paredes empilhadas na área de desenho (título, elevação, cotas, tabela de peças, totais); " +
        "coluna da direita: LEGENDA, NOTAS e NORMAS acima do carimbo; planta de locação no topo da folha de locação, quadro abaixo; " +
        "detalhes em grade 2 × 4; tabela de aço em blocos de colunas lado a lado (estilo TQS), resumo por bitola no fim.",
      respiro: 10
    }
  };

  /* ================================================================ UTIL */
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, d) {
    var s = num(v).toFixed(d == null ? 2 : d), p = s.split("."), i = p[0], neg = i.charAt(0) === "-";
    if (neg) i = i.slice(1);
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + i + (p[1] ? "," + p[1] : "");
  }
  function cmTxt(m) { var v = Math.round(num(m) * 1000) / 10; return String(v).replace(".", ","); }       /* m → cm com até 1 casa */
  function mTxt(m) { return br(m, 2); }
  function larg(s, h) { return txt(s).length * 0.86 * h; }                                              /* largura estimada (conservadora) */
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nat(a, b) { return String(a).localeCompare(String(b), "pt", { numeric: true }); }
  function layer(n) { return PADRAO.layers[n] || PADRAO.layers["EST-TEXTO"]; }

  /* ================================================================ DESENHO (primitivas) */
  function Desenho() { this.e = []; this.cx = []; this.cs = []; this.keep = []; this.n = 0; }
  var DP = Desenho.prototype;
  DP.add = function (o) { this.e.push(o); return o; };
  DP.linha = function (x1, y1, x2, y2, cam, lt) {
    if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) return;
    this.add({ t: "L", c: cam, p: [r2(x1), r2(y1), r2(x2), r2(y2)], lt: lt || null });
  };
  DP.poli = function (pts, cam, fechado, lt) { this.add({ t: "P", c: cam, pts: pts.map(function (p) { return [r2(p[0]), r2(p[1])]; }), f: !!fechado, lt: lt || null }); };
  DP.ret = function (x, y, w, h, cam, lt) { this.poli([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], cam, true, lt); };
  DP.circ = function (x, y, r, cam, cheio) { this.add({ t: "C", c: cam, x: r2(x), y: r2(y), r: r2(r * 100) / 100, cheio: !!cheio }); };
  DP.hach = function (pts, cam, esp) { this.add({ t: "H", c: cam || "EST-HACHURA", pts: pts.map(function (p) { return [r2(p[0]), r2(p[1])]; }), esp: esp || PADRAO.hachuras.espaco }); };
  DP.hachRet = function (x, y, w, h, esp) { if (w > 0.2 && h > 0.2) this.hach([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "EST-HACHURA", esp); };
  function caixaTexto(x, y, s, h, al, ang) {
    var w = larg(s, h);
    if (!ang) { var x0 = al === "C" ? x - w / 2 : (al === "D" ? x - w : x); return { x0: x0, x1: x0 + w, y0: y - 0.8 * h, y1: y + 0.25 * h }; }
    var y0 = al === "C" ? y - w / 2 : (al === "D" ? y : y - w);
    return { x0: x - 0.8 * h, x1: x + 0.25 * h, y0: y0, y1: y0 + w };
  }
  /* texto: al E/C/D; ang 0 ou 90 (90 = lê de baixo para cima, como a cota vertical do padrão); o.g = grupo (cota/chamada própria) */
  DP.texto = function (x, y, s, h, cam, o) {
    o = o || {}; s = txt(s); if (!s.trim()) return null;
    var al = o.al || "E", ang = o.ang ? 90 : 0, cx = caixaTexto(x, y, s, h, al, ang);
    this.add({ t: "T", c: cam || "EST-TEXTO", x: r2(x), y: r2(y), s: s, h: h, al: al, ang: ang, w: larg(s, h) });
    cx.s = s; cx.g = o.g || null; this.cx.push(cx);
    return cx;
  };
  DP.seg = function (x1, y1, x2, y2, g) { this.cs.push({ x1: x1, y1: y1, x2: x2, y2: y2, g: g || null }); };
  DP.novoGrupo = function (p) { return (p || "g") + (++this.n); };
  /* terminal ponto cheio (JSON cotas.terminal) */
  DP.ponto = function (x, y) { this.circ(x, y, PADRAO.cotas.pontoRaio, "EST-COTA", true); };
  /* cota horizontal: xa..xb medidos em yRef; linha de cota em y; texto acima. Devolve o grupo. */
  DP.cotaH = function (xa, xb, y, yRef, texto, g, o) {
    o = o || {}; var C = PADRAO.cotas, h = PADRAO.textos.cota; g = g || this.novoGrupo("c");
    var dir = y >= yRef ? 1 : -1;
    if (!o.semExt) {
      this.linha(xa, yRef + dir * C.afastamento, xa, y + dir * C.extensaoAlem, "EST-COTA"); this.seg(xa, yRef + dir * C.afastamento, xa, y + dir * C.extensaoAlem, g);
      this.linha(xb, yRef + dir * C.afastamento, xb, y + dir * C.extensaoAlem, "EST-COTA"); this.seg(xb, yRef + dir * C.afastamento, xb, y + dir * C.extensaoAlem, g);
    }
    this.linha(xa, y, xb, y, "EST-COTA"); this.seg(xa, y, xb, y, g);
    this.ponto(xa, y); this.ponto(xb, y);
    if (texto) {
      var ty = y - C.textoFolga, wTxt = larg(texto, h);
      if (wTxt <= Math.abs(xb - xa) - 1) this.texto((xa + xb) / 2, ty, texto, h, "EST-COTA", { al: "C", g: g });
      else this.texto((xa + xb) / 2 + h * 0.3, y - C.textoFolga - 0.1, texto, h, "EST-COTA", { al: "E", ang: 90, g: g });
    }
    return g;
  };
  /* cota vertical (xa fixo): ya..yb medidos em xRef; linha em x; texto à esquerda da linha, girado 90° */
  DP.cotaV = function (ya, yb, x, xRef, texto, g, o) {
    o = o || {}; var C = PADRAO.cotas, h = PADRAO.textos.cota; g = g || this.novoGrupo("c");
    var dir = x >= xRef ? 1 : -1;
    if (!o.semExt) {
      this.linha(xRef + dir * C.afastamento, ya, x + dir * C.extensaoAlem, ya, "EST-COTA"); this.seg(xRef + dir * C.afastamento, ya, x + dir * C.extensaoAlem, ya, g);
      this.linha(xRef + dir * C.afastamento, yb, x + dir * C.extensaoAlem, yb, "EST-COTA"); this.seg(xRef + dir * C.afastamento, yb, x + dir * C.extensaoAlem, yb, g);
    }
    this.linha(x, ya, x, yb, "EST-COTA"); this.seg(x, ya, x, yb, g);
    this.ponto(x, ya); this.ponto(x, yb);
    if (texto) this.texto(x - C.textoFolga, (ya + yb) / 2, texto, h, "EST-COTA", { al: "C", ang: 90, g: g });
    return g;
  };
  /* chamada com texto: tenta posições ao redor do ponto até achar lugar sem texto/cota/área reservada; devolve a caixa */
  DP.rotulo = function (ax, ay, s, h, cam, o) {
    o = o || {}; s = txt(s); var self = this, dists = o.dists || [5, 8, 12, 17, 23, 30, 40, 52, 66, 85, 110, 140, 170], angs = (o.angs || []).concat([0, 180, -90, 90, -45, -135, 45, 135, -20, 200, -70, 70, -110, 110]), lim = this.limite;
    var g = this.novoGrupo("r"), folga = 0.8;
    function livre(b, lx1, ly1, lx2, ly2) {
      var bi = { x0: b.x0 - folga, x1: b.x1 + folga, y0: b.y0 - folga, y1: b.y1 + folga }, i;
      for (i = 0; i < self.cx.length; i++) if (boxBox(bi, self.cx[i], 0)) return false;
      for (i = 0; i < self.cs.length; i++) if (segBox(self.cs[i], bi, 0)) return false;
      for (i = 0; i < self.keep.length; i++) if (boxBox(b, self.keep[i], 0)) return false;
      for (i = 0; i < self.cx.length; i++) if (segBox({ x1: lx1, y1: ly1, x2: lx2, y2: ly2 }, self.cx[i], 0.1)) return false;
      return true;
    }
    for (var di = 0; di < dists.length; di++) for (var ai = 0; ai < angs.length; ai++) {
      var a = angs[ai] * Math.PI / 180, d = dists[di], tx = ax + d * Math.cos(a), ty = ay + d * Math.sin(a), al = "C", yb;
      var w = larg(s, h);
      /* âncora do texto: lado direito → começa à direita; esquerdo → termina à esquerda; cima/baixo → centrado */
      if (Math.cos(a) > 0.5) { al = "E"; } else if (Math.cos(a) < -0.5) { al = "D"; }
      yb = ty + 0.35 * h;
      var b = caixaTexto(tx, yb, s, h, al, 0);
      /* ponto da caixa mais próximo da âncora */
      if (lim && (b.x0 < lim.x0 + 1 || b.x1 > lim.x1 - 1 || b.y0 < lim.y0 + 1 || b.y1 > lim.y1 - 1)) continue;
      var px = Math.max(b.x0, Math.min(b.x1, ax)), py = Math.max(b.y0, Math.min(b.y1, ay));
      if (px === ax && py === ay) continue;
      if (!livre(b, ax, ay, px, py)) continue;
      this.texto(tx, yb, s, h, cam || "EST-TEXTO", { al: al, g: g });
      this.linha(ax, ay, px, py, "EST-ARM-CHAMADA"); this.seg(ax, ay, px, py, g); this.circ(ax, ay, 0.5, "EST-ARM-CHAMADA", true);
      return b;
    }
    this.avisos = this.avisos || []; this.avisos.push("rótulo sem lugar livre: " + s);
    return null;
  };
  function boxBox(a, b, t) { t = t || 0; return a.x0 < b.x1 - t && a.x1 > b.x0 + t && a.y0 < b.y1 - t && a.y1 > b.y0 + t; }
  /* segmento × caixa (Liang–Barsky), com a caixa encolhida de t */
  function segBox(s, b, t) {
    t = t || 0; var x0 = b.x0 + t, x1 = b.x1 - t, y0 = b.y0 + t, y1 = b.y1 - t; if (x1 <= x0 || y1 <= y0) return false;
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1, p = [-dx, dx, -dy, dy], q = [s.x1 - x0, x1 - s.x1, s.y1 - y0, y1 - s.y1], u0 = 0, u1 = 1;
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return false; }
      else { var u = q[i] / p[i]; if (p[i] < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; } }
    }
    return u1 - u0 > 1e-9;
  }
  /* sobreposições de uma folha: texto × texto e texto × cota/chamada (de outro grupo) */
  function sobreposicoes(f) {
    var cx = f.caixasTexto || [], cs = f.segmentosCota || [], out = [], i, j;
    for (i = 0; i < cx.length; i++) for (j = i + 1; j < cx.length; j++) if (boxBox(cx[i], cx[j], 0.1)) out.push({ tipo: "texto-texto", a: cx[i].s, b: cx[j].s, x: r2(cx[i].x0), y: r2(cx[i].y0) });
    for (i = 0; i < cx.length; i++) for (j = 0; j < cs.length; j++) if ((!cx[i].g || cx[i].g !== cs[j].g) && segBox(cs[j], cx[i], 0.1)) out.push({ tipo: "texto-cota", a: cx[i].s, b: cs[j].g || "cota", x: r2(cx[i].x0), y: r2(cx[i].y0) });
    return out;
  }

  /* ---- SVG ---- */
  var DASH = { TRACEJADO: "3 1.5", "TRACO-PONTO": "9.6 1.6 0.2 1.6" };
  DP.svg = function () {
    var out = [], pats = {}, defs = [];
    function cor(c) { var a = layer(c).aci; return a === 8 ? "#777" : (a === 9 ? "#888" : "#111"); }
    function traco(c, lt) { var L = layer(c), d = lt || L.lt; return 'stroke="' + cor(c) + '" stroke-width="' + L.pena + '" fill="none"' + (d && DASH[d] ? ' stroke-dasharray="' + DASH[d] + '"' : ""); }
    this.e.forEach(function (o) {
      if (o.t === "L") out.push('<line x1="' + o.p[0] + '" y1="' + o.p[1] + '" x2="' + o.p[2] + '" y2="' + o.p[3] + '" ' + traco(o.c, o.lt) + "/>");
      else if (o.t === "P") out.push('<polyline points="' + o.pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + (o.f ? " " + o.pts[0][0] + "," + o.pts[0][1] : "") + '" ' + traco(o.c, o.lt) + "/>");
      else if (o.t === "C") out.push('<circle cx="' + o.x + '" cy="' + o.y + '" r="' + o.r + '" ' + (o.cheio ? 'fill="' + cor(o.c) + '" stroke="none"' : traco(o.c)) + "/>");
      else if (o.t === "H") {
        var id = "h" + String(o.esp).replace(".", "_");
        if (!pats[id]) { pats[id] = 1; defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + o.esp + '" height="' + o.esp + '" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="' + o.esp + '" stroke="#555" stroke-width="' + layer("EST-HACHURA").pena + '"/></pattern>'); }
        out.push('<polygon points="' + o.pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '" fill="url(#' + id + ')" stroke="none"/>');
      } else if (o.t === "T") {
        out.push('<text x="' + o.x + '" y="' + o.y + '" font-size="' + o.h + '" fill="' + (layer(o.c).aci === 8 ? "#555" : "#111") + '"' + (o.al === "C" ? ' text-anchor="middle"' : (o.al === "D" ? ' text-anchor="end"' : "")) +
          (o.ang ? ' transform="rotate(-90 ' + o.x + " " + o.y + ')"' : "") + ">" + esc(o.s) + "</text>");
      }
    });
    return (defs.length ? "<defs>" + defs.join("") + "</defs>" : "") + out.join("");
  };

  /* ================================================================ TABELAS */
  /* cab: ["A","B",["COMPR","UNIT"]] (array = cabeçalho em linhas); linhas: arrays, {titulo:"..."} ou {total:[...]};
     o.al: alinhamento por coluna (E/C/D). Estilo TQS: sem grade, só linhas de topo, de cabeçalho e de base. */
  function tabela(D, x, y, cab, linhas, o) {
    o = o || {}; var T = PADRAO.textos, h = o.h || T.tabela, hc = o.hc || T.cabecalho, hl = o.hl || h * 1.7, pad = 1.6, nc = cab.length, cw = [], j;
    function linhasCab(c) { return Array.isArray(c) ? c : [c]; }
    for (j = 0; j < nc; j++) {
      var w = 0; linhasCab(cab[j]).forEach(function (s) { w = Math.max(w, larg(s, hc)); });
      linhas.forEach(function (l) { var c = Array.isArray(l) ? l[j] : (l.total ? l.total[j] : null); if (c != null) w = Math.max(w, larg(c, h)); });
      cw.push(w + 2 * pad);
    }
    if (o.larguras) o.larguras.forEach(function (v, i) { if (v) cw[i] = Math.max(cw[i], v); });
    var W = cw.reduce(function (a, b) { return a + b; }, 0);
    linhas.forEach(function (l) { if (l && l.titulo) { var need = larg(l.titulo, h * 1.1) + 2 * pad; if (need > W) { cw[nc - 1] += need - W; W = need; } } });
    var nHc = cab.reduce(function (m, c) { return Math.max(m, linhasCab(c).length); }, 1), hCab = nHc * hc * 1.3 + 2.4;
    var cx = [x]; for (j = 0; j < nc; j++) cx.push(cx[j] + cw[j]);
    var al = o.al || [], cam = o.camada || "EST-TABELA";
    D.linha(x, y, x + W, y, cam);
    for (j = 0; j < nc; j++) {
      var ls = linhasCab(cab[j]), a = al[j] || "E";
      ls.forEach(function (s, k) {
        var by = y + 1.2 + (nHc - ls.length) * hc * 1.3 + (k + 1) * hc * 1.3 - 0.3 * hc;
        if (a === "D") D.texto(cx[j + 1] - pad, by, s, hc, "EST-TEXTO", { al: "D" });
        else if (a === "C") D.texto((cx[j] + cx[j + 1]) / 2, by, s, hc, "EST-TEXTO", { al: "C" });
        else D.texto(cx[j] + pad, by, s, hc, "EST-TEXTO", { al: "E" });
      });
    }
    var yy = y + hCab; D.linha(x, yy, x + W, yy, cam);
    linhas.forEach(function (l) {
      var by = yy + hl / 2 + 0.35 * h;
      if (l && l.titulo) { D.texto(x + pad, yy + hl / 2 + 0.35 * h * 1.1, l.titulo, h * 1.1, "EST-TITULO", { al: "E" }); yy += hl; return; }
      var cel = Array.isArray(l) ? l : l.total;
      if (!Array.isArray(l)) D.linha(x, yy, x + W, yy, cam);
      for (j = 0; j < nc; j++) {
        var c = cel[j]; if (c == null || c === "") continue; var a = al[j] || "E";
        if (a === "D") D.texto(cx[j + 1] - pad, by, c, h, "EST-TEXTO", { al: "D" });
        else if (a === "C") D.texto((cx[j] + cx[j + 1]) / 2, by, c, h, "EST-TEXTO", { al: "C" });
        else D.texto(cx[j] + pad, by, c, h, "EST-TEXTO", { al: "E" });
      }
      yy += hl;
    });
    D.linha(x, yy, x + W, yy, cam);
    return { x: x, y: y, w: W, h: yy - y, cw: cw };
  }

  /* ================================================================ DADOS DA OBRA */
  function parseArm(s) {   /* "4 φ10 (3,14 cm²)" / "2 φ10 (1,57 cm²) por face" → {n, bit, porFace} */
    /* cinta: "inferior 3 φ8 (…) · superior nos apoios 2 φ8 (…) · lateral 2 φ8 (…) por face" → vale o 1º trecho (armadura inferior) */
    var s0 = txt(s).split("·")[0], m = /(\d+)\s*[φØø]\s*([\d.,]+)/.exec(s0); if (!m) return null;
    var por = /\)\s*por face/i.test(s0), n = +m[1] * (por ? 2 : 1);
    return { n: n, bit: +m[2].replace(",", "."), porFace: por, txt: s0.replace(/\s*\(.*?\)/, "") };
  }
  function grau(bit) { return Math.abs(bit - 5) < 1e-9 ? "60B" : "50A"; }
  function nomeTipoPeca(t) { return (PADRAO.tiposPeca[t] || { nome: t }).nome; }
  function codTipo(t) { return (PADRAO.tiposPeca[t] || { cod: "" }).cod; }
  /* quantitativo de aço da parede: entradas {elemento, barras, bitola, comprimento, kg} */
  function acoDe(w) { return arr(w.pag && w.pag.quant && w.pag.quant.aco); }
  /* o quantitativo traz o elemento por nome ("pilarete PL1", "estribos PL1", "verga V-PT1", "porta-estribo V-PT1",
     "cinta CR", "estribos cinta"...): agrupa pelo id do reforço da parede (papel: main / porta / estribo) */
  function chaveQuant(w, nome) {
    var mc = /^cinta\s+(.+?)\s+[—-]\s+(inferior|superior|lateral)/.exec(txt(nome));   /* "cinta CR — inferior" / "— superior (negativo)" / "— lateral (vento)" */
    if (mc) return { id: mc[1], papel: mc[2] === "inferior" ? "main" : (mc[2] === "superior" ? "sup" : "lat") };
    var m = /^(pilarete|verga|viga|contraverga|cinta de respaldo|cinta|estribos|porta-estribo)\s+(.+)$/.exec(txt(nome));
    if (!m) return null;
    var papel = m[1] === "estribos" ? "estribo" : (m[1] === "porta-estribo" ? "porta" : "main"), id = m[2], R = (w.pag && w.pag.reforcos) || {};
    if (id === "cinta" || id === "cinta de respaldo") id = (arr(R.cintas)[0] || { id: id }).id;
    return { id: id, papel: papel };
  }
  function entradasDe(w, id) {   /* entradas do quantitativo de um reforço, em ordem, já com a posição Nn */
    var out = { all: [], main: null, estribo: null, porta: null, sup: null, lat: null };
    acoDe(w).forEach(function (a) {
      var k = chaveQuant(w, a.elemento); if (!k || k.id !== id) return;
      var e = { e: a, papel: k.papel, pos: out.all.length + 1 }; out.all.push(e);
      if (!out[k.papel]) out[k.papel] = e;
    });
    return out;
  }
  function deConjunto(w, tipo, id) {
    if (tipo === "pilarete") return arr(w.pilaretes).filter(function (x) { return x.id === id; })[0] || null;
    if (tipo === "verga") return arr(w.vergas).filter(function (x) { return x.id === id; })[0] || null;
    if (tipo === "contraverga") return arr(w.contravergas).filter(function (x) { return x.id === id; })[0] || null;
    return w.cinta || null;
  }
  /* reforços de uma parede, com os dois lados (cálculo e quantitativo) */
  function reforcosDe(w) {
    var R = w.pag.reforcos, out = [];
    function add(tipo, lista) {
      arr(lista).forEach(function (r) {
        if (tipo === "pilarete" && r.dono === false) return;
        var calc = deConjunto(w, tipo, r.id), en = entradasDe(w, r.id), q = en.main ? en.main.e : null, est = en.estribo ? en.estribo.e : null, porta = en.porta ? en.porta.e : null;
        var ac = calc ? parseArm(calc.armadura) : null, status = "sem cálculo";
        if (ac && q) status = (ac.n === q.barras && Math.abs(ac.bit - q.bitola) < 1e-9) ? "confere" : "difere";
        if (status === "confere" && tipo === "cinta" && calc.arranjoNeg) {   /* a armadura superior (negativo) também tem que bater */
          var qs = en.sup ? en.sup.e : null;
          if (!qs || qs.barras !== calc.arranjoNeg.n || Math.abs(qs.bitola - calc.arranjoNeg.phi) > 1e-9) status = "difere";
        }
        if (!ac && !q && tipo === "verga" && calc && calc.naCinta) status = "na cinta";
        out.push({ tipo: tipo, r: r, calc: calc, arm: ac, q: q, est: est, porta: porta, en: en, status: status });
      });
    }
    add("pilarete", R.pilaretes); add("verga", R.vergas); add("contraverga", R.contravergas); add("cinta", R.cintas);
    return out;
  }
  function nomeReforco(tipo) { return { pilarete: "pilarete", verga: "verga", contraverga: "contraverga", cinta: "cinta" }[tipo]; }
  function aviso(av, s) { if (av.indexOf(s) < 0) av.push(s); }

  /* ================================================================ NOTAS DA COLUNA */
  function quebrar(s, h, wmax) {
    var pal = txt(s).split(/\s+/), ls = [], cur = "";
    pal.forEach(function (p) { var t = cur ? cur + " " + p : p; if (larg(t, h) > wmax && cur) { ls.push(cur); cur = p; } else cur = t; });
    if (cur) ls.push(cur); return ls;
  }
  /* blocos = [{titulo, itens:[texto], numerar, exemplos:fn(D,x,y)→altura}] ; devolve true se coube */
  function colunaNotas(D, geo, blocos, avisos, rotuloFolha) {
    var col = geo.coluna, car = geo.carimbo, T = PADRAO.textos, x0 = col.x + 5, wmax = col.w - 10, yMax = car.y - 4, y = col.y + 5, coube = true;
    var tentativas = [T.nota, T.nota * 0.88, T.nota * 0.78];
    function medir(h) {
      var hq = Math.min(T.quadro, h * 2.6), tot = 0;
      blocos.forEach(function (b) {
        tot += hq * 1.35; (b.itens || []).forEach(function (it, i) { var pre = b.numerar ? (i + 1) + "- " : "- "; tot += quebrar(it, h, wmax - larg(pre, h)).length * h * 1.4 + 0.8; });
        if (b.exemplos) tot += b.exemplos(null, 0, 0, h); tot += 3;
      });
      return tot;
    }
    var h = tentativas[tentativas.length - 1];
    for (var i = 0; i < tentativas.length; i++) if (medir(tentativas[i]) <= yMax - y) { h = tentativas[i]; break; }
    if (medir(h) > yMax - y) { coube = false; aviso(avisos, "Coluna de notas não cabe na folha " + (rotuloFolha || "") + " com a letra mínima: conferir."); }
    var hq = Math.min(T.quadro, h * 2.6);
    blocos.forEach(function (b) {
      D.texto(x0, y + hq * 0.78, b.titulo, hq, "EST-TITULO", { al: "E" }); y += hq * 1.35;
      (b.itens || []).forEach(function (it, i) {
        var pre = b.numerar ? (i + 1) + "- " : "- ", rec = larg(pre, h);
        D.texto(x0, y + h * 0.78, pre, h, "EST-TEXTO", { al: "E" });
        quebrar(it, h, wmax - rec).forEach(function (s) { D.texto(x0 + rec, y + h * 0.78, s, h, "EST-TEXTO", { al: "E" }); y += h * 1.4; });
        y += 0.8;
      });
      if (b.exemplos) y += b.exemplos(D, x0, y, h);
      y += 3;
    });
    return coube;
  }

  /* ================================================================ ELEVAÇÃO DA PAREDE (folha de paginação) */
  function subRect(a, b) {   /* a − b (retângulos x,y,w,h em metros) */
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 - x0 <= 1e-9 || y1 - y0 <= 1e-9) return [a];
    var out = [];
    if (x0 - a.x > 1e-9) out.push({ x: a.x, y: a.y, w: x0 - a.x, h: a.h });
    if (a.x + a.w - x1 > 1e-9) out.push({ x: x1, y: a.y, w: a.x + a.w - x1, h: a.h });
    if (y0 - a.y > 1e-9) out.push({ x: x0, y: a.y, w: x1 - x0, h: y0 - a.y });
    if (a.y + a.h - y1 > 1e-9) out.push({ x: x0, y: y1, w: x1 - x0, h: a.y + a.h - y1 });
    return out;
  }
  function livresDaPeca(p, bloq) {
    var lista = [{ x: p.x, y: p.y, w: p.w, h: p.h }];
    arr(p.furos).concat(bloq).forEach(function (b) {
      var nova = []; lista.forEach(function (f) { nova = nova.concat(subRect(f, b)); }); lista = nova;
    });
    return lista;
  }
  /* contorno da peça: retângulo ou "L" (furo em um canto) */
  function contornoPeca(p) {
    var fs = arr(p.furos).map(function (f) {
      var x0 = Math.max(p.x, f.x), y0 = Math.max(p.y, f.y), x1 = Math.min(p.x + p.w, f.x + f.w), y1 = Math.min(p.y + p.h, f.y + f.h);
      return (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }).filter(Boolean), e = 1e-6, X0 = p.x, X1 = p.x + p.w, Y0 = p.y, Y1 = p.y + p.h;
    if (fs.length === 1) {
      var f = fs[0], l = Math.abs(f.x - X0) < e, r = Math.abs(f.x + f.w - X1) < e, b = Math.abs(f.y - Y0) < e, t = Math.abs(f.y + f.h - Y1) < e;
      if ((l || r) && (b || t) && !(l && r) && !(b && t)) {
        if (l && b) return { poly: [[f.x + f.w, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, f.y + f.h], [f.x + f.w, f.y + f.h]], extras: [] };
        if (r && b) return { poly: [[X0, Y0], [f.x, Y0], [f.x, f.y + f.h], [X1, f.y + f.h], [X1, Y1], [X0, Y1]], extras: [] };
        if (l && t) return { poly: [[X0, Y0], [X1, Y0], [X1, Y1], [f.x + f.w, Y1], [f.x + f.w, f.y], [X0, f.y]], extras: [] };
        if (r && t) return { poly: [[X0, Y0], [X1, Y0], [X1, f.y], [f.x, f.y], [f.x, Y1], [X0, Y1]], extras: [] };
      }
    }
    return { poly: [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], extras: fs };
  }
  var NOME_VAO = { porta: "porta", janela: "janela" };

  /* mede o bloco de uma parede numa escala; devolve as dimensões em mm */
  function medirParede(w, esc, areaW) {
    var T = PADRAO.textos, s = 1000 / esc, pag = w.pag, xs = [], i;
    pag.pecas.forEach(function (p) { xs.push(p.x, p.x + p.w); });
    var R = pag.reforcos; [].concat(R.pilaretes, R.vergas, R.contravergas, R.cintas).forEach(function (r) { xs.push(r.x, r.x + r.w); });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var LM = 34, RM = 12, Wmm = (xmax - xmin) * s, Hmm = pag.altura * s;
    /* tabela de peças */
    var linhas = pag.pecas.map(function (p) {
      var dims = cmTxt(p.w) + " × " + cmTxt(p.h) + (p.tipo === "recorte-L" ? " (L)" : "");
      return [p.cod, String(p.fiada), dims, nomeTipoPeca(p.tipo), br(p.peso, 1), arr(p.reforcos).join(", ") || "-"];
    });
    var cab = ["CÓDIGO", "FIADA", "DIMENSÕES (cm)", "TIPO", "PESO (kg)", "REFORÇO"];
    var tmp = new Desenho(), t0 = tabela(tmp, 0, 0, cab, linhas, { al: ["E", "C", "E", "E", "D", "E"] });
    var wBloco = t0.w, gap = 8, nB = Math.max(1, Math.min(6, Math.floor((areaW + gap) / (wBloco + gap)))), rows = Math.ceil(linhas.length / nB);
    var tmp2 = new Desenho(), t1 = tabela(tmp2, 0, 0, cab, linhas.slice(0, rows), { al: ["E", "C", "E", "E", "D", "E"], larguras: t0.cw });
    var hTab = t1.h, hTot = 14;
    var hTotal = 27 + Hmm + 32 + hTab + 6 + hTot + 8;
    return { s: s, esc: esc, xmin: xmin, xmax: xmax, LM: LM, RM: RM, Wmm: Wmm, Hmm: Hmm, wTotal: LM + Wmm + RM, linhas: linhas, cab: cab, larguras: t0.cw, wBloco: wBloco, nB: nB, rows: rows, hTab: hTab, hTotal: hTotal, gap: gap };
  }

  function desenharParede(D, w, m, ox, oy, avisos) {
    var T = PADRAO.textos, pag = w.pag, s = m.s, xw0 = ox + m.LM, R = pag.reforcos;
    var yTop = oy + 27, yBase = yTop + m.Hmm;
    function X(v) { return xw0 + (v - m.xmin) * s; }
    function Y(v) { return yBase - v * s; }
    /* título */
    D.texto(ox, oy + T.titulo, "PAREDE " + pag.id + (w.nome ? " - " + w.nome : ""), T.titulo, "EST-TITULO", { al: "E" });
    D.texto(ox, oy + T.titulo + 4.2, "ESCALA 1:" + m.esc + "  |  e = " + cmTxt(pag.espessura / 100 * 1) + " cm  |  " + mTxt(pag.comprimento) + " x " + mTxt(pag.altura) + " m  |  extremidades: início " + txt(pag.ini && pag.ini.tipo) + " / fim " + txt(pag.fim && pag.fim.tipo), T.escala, "EST-TEXTO", { al: "E" });
    /* faixas de reforço (retângulos em m) */
    var bandas = [];
    [["pilarete", R.pilaretes], ["verga", R.vergas], ["contraverga", R.contravergas], ["cinta", R.cintas]].forEach(function (par) {
      arr(par[1]).forEach(function (r) { bandas.push({ tipo: par[0], id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, horiz: r.w > r.h }); });
    });
    /* peças */
    var semLugar = [];
    pag.pecas.forEach(function (p) {
      var c = contornoPeca(p), pts = c.poly.map(function (q) { return [X(q[0]), Y(q[1])]; });
      D.poli(pts, "EST-FORMA-VISTA", true);
      c.extras.forEach(function (f) { D.ret(X(f.x), Y(f.y + f.h), f.w * s, f.h * s, "EST-OCULTA"); });
    });
    /* vãos */
    arr(pag.vaos).forEach(function (v) {
      var x = X(v.x), y = Y(v.y + v.h), W = v.w * s, H = v.h * s;
      D.ret(x, y, W, H, "EST-OCULTA");
      var ls = [{ s: v.id, h: T.nota }, { s: cmTxt(v.w) + " x " + cmTxt(v.h), h: T.trecho }];
      if (v.y > 0.01) ls.push({ s: "peitoril " + cmTxt(v.y), h: T.trecho });
      colocarLinhas(D, { x: x, y: y, w: W, h: H }, ls, "BLK-NUM", { avisos: avisos, ctx: "vão " + v.id });
    });
    /* rótulos das peças (no maior retângulo livre da peça, fora das faixas de reforço) */
    var bloq = bandas.map(function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; });
    pag.pecas.forEach(function (p) {
      var frees = livresDaPeca(p, bloq).map(function (f) { return { x: X(f.x), y: Y(f.y + f.h), w: f.w * s, h: f.h * s }; });
      frees.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
      var tp = codTipo(p.tipo), l2 = p.tipo === "inteira" ? "" : cmTxt(p.w) + "x" + cmTxt(p.h) + (tp ? " " + tp : "");
      var ls = [{ s: p.cod, h: T.notacao }]; if (l2) ls.push({ s: l2, h: T.trecho });
      var feito = false;
      for (var i = 0; i < frees.length && !feito; i++) feito = colocarLinhas(D, frees[i], ls, "BLK-NUM", { silencioso: true });
      if (!feito) for (i = 0; i < frees.length && !feito; i++) feito = colocarLinhas(D, frees[i], ls.slice(0, 1), "BLK-NUM", { silencioso: true });
      if (!feito) semLugar.push(p);
    });
    /* faixas de EPS retirado: contorno + hachura; a hachura abre uma janela para o rótulo da faixa e para o número das
       peças que ficam inteiramente atrás de uma faixa vertical (só a face aparece) */
    var restam = semLugar.slice(); semLugar = [];
    bandas.forEach(function (b) {
      var x = X(b.x), y = Y(b.y + b.h), W = b.w * s, H = b.h * s, h = T.nota, lw = larg(b.id, h) + 3, gaps = [];
      D.ret(x, y, W, H, "EST-FORMA-CORTE");
      if (!b.horiz) {
        restam = restam.filter(function (p) {
          var cxp = p.x + p.w / 2;
          if (!(cxp >= b.x - 1e-6 && cxp <= b.x + b.w + 1e-6)) return true;
          var wt = larg(p.cod, T.notacao) + 3, cyp = Y(p.y + p.h / 2);
          if (wt > p.h * s - 1 || T.notacao * 1.2 > W) return true;
          D.texto(x + W / 2 + 0.35 * T.notacao, cyp, p.cod, T.notacao, "BLK-NUM", { al: "C", ang: 90 });
          gaps.push([cyp - wt / 2, cyp + wt / 2]);
          return false;
        });
      }
      /* posição do rótulo da faixa: a primeira que não encosta em outra faixa nem em outro texto */
      var comp = b.horiz ? W : H, ok = false, pos = 0, tries = [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.22, 0.78, 0.05, 0.95], k;
      for (k = 0; k < tries.length && !ok; k++) {
        pos = tries[k];
        var ctr = b.horiz ? { x0: x + comp * pos - lw / 2, x1: x + comp * pos + lw / 2, y0: y, y1: y + H } : { x0: x, x1: x + W, y0: y + comp * pos - lw / 2, y1: y + comp * pos + lw / 2 };
        if (comp * pos - lw / 2 < 0.5 || comp * pos + lw / 2 > comp - 0.5) continue;
        ok = true;
        bandas.forEach(function (o) {
          if (o === b) return;
          var ob = { x0: X(o.x), x1: X(o.x) + o.w * s, y0: Y(o.y + o.h), y1: Y(o.y + o.h) + o.h * s };
          if (boxBox(ctr, ob, 0.2)) ok = false;
        });
        D.cx.forEach(function (cxb) { if (boxBox(ctr, cxb, 0.2)) ok = false; });
      }
      if (!ok) { pos = 0.5; aviso(avisos, "Parede " + pag.id + ": faixa " + b.id + " sem lugar livre para o rótulo."); }
      var lo = comp * pos - lw / 2, hi = comp * pos + lw / 2;
      if (b.horiz) { gaps.push([x + lo, x + hi]); D.texto(x + comp * pos, y + H / 2 + 0.35 * h, b.id, h, "EST-ARM-TEXTO", { al: "C" }); }
      else { gaps.push([y + lo, y + hi]); D.texto(x + W / 2 + 0.35 * h, y + comp * pos, b.id, h, "EST-ARM-TEXTO", { al: "C", ang: 90 }); }
      /* hachura nos trechos fora das janelas */
      gaps.sort(function (p, q) { return p[0] - q[0]; });
      var c0 = b.horiz ? x : y, c1 = b.horiz ? x + W : y + H, cur = c0;
      gaps.forEach(function (g) {
        if (g[0] > cur) { if (b.horiz) D.hachRet(cur, y, g[0] - cur, H); else D.hachRet(x, cur, W, g[0] - cur); }
        cur = Math.max(cur, g[1]);
      });
      if (c1 > cur) { if (b.horiz) D.hachRet(cur, y, c1 - cur, H); else D.hachRet(x, cur, W, c1 - cur); }
    });
    semLugar = restam;
    /* fiadas: tag na direita */
    pag.fiadas.forEach(function (f) { D.texto(X(m.xmax) + 3, Y(f.y + f.h / 2) + 0.35 * T.nota, "F" + f.n, T.nota, "EST-TEXTO", { al: "E" }); });
    /* base */
    D.linha(X(m.xmin) - 3, yBase, X(m.xmax) + 3, yBase, "EST-FORMA-CORTE");
    /* cotas verticais à esquerda: alturas acumuladas das fiadas e altura total */
    var xl = X(m.xmin), xc1 = xl - 12, xc2 = xl - 25, g1 = D.novoGrupo("c"), niv = [0].concat(pag.fiadas.map(function (f) { return f.y + f.h; }));
    D.linha(xc1, Y(niv[niv.length - 1]), xc1, Y(0), "EST-COTA"); D.seg(xc1, Y(niv[niv.length - 1]), xc1, Y(0), g1);
    niv.forEach(function (v) {
      D.linha(xl - 1, Y(v), xc1 - 1.5, Y(v), "EST-COTA"); D.seg(xl - 1, Y(v), xc1 - 1.5, Y(v), g1); D.ponto(xc1, Y(v));
      if (v > 0) { var tt = cmTxt(v), g = D.novoGrupo("ta"); D.texto(xc1 - 0.8, Y(v) + 1.2 + larg(tt, T.cota), tt, T.cota, "EST-COTA", { al: "E", ang: 90, g: g }); }
    });
    D.cotaV(Y(pag.altura), yBase, xc2, xl, cmTxt(pag.altura), null);
    /* cotas horizontais embaixo: vãos a partir do eixo inicial; total */
    var pts = [0], i0;
    arr(pag.vaos).slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (v) { pts.push(v.x, v.x + v.w); });
    pts.push(pag.comprimento); pts = pts.filter(function (v, i) { return i === 0 || v - pts[i - 1] > 1e-6; });
    var yc1 = yBase + 9, yc2 = yBase + 20;
    for (i0 = 0; i0 + 1 < pts.length; i0++) D.cotaH(X(pts[i0]), X(pts[i0 + 1]), yc1, yBase, cmTxt(pts[i0 + 1] - pts[i0]), null, i0 === 0 ? {} : { semExt: false });
    D.cotaH(X(0), X(pag.comprimento), yc2, yBase, cmTxt(pag.comprimento) + " (eixo a eixo)", null);
    /* cotas horizontais em cima: eixos dos pilaretes */
    var cs = arr(R.pilaretes).map(function (p) { return p.x + p.w / 2; }).sort(function (a, b) { return a - b; }), ycT = yTop - 9;
    for (i0 = 0; i0 + 1 < cs.length; i0++) D.cotaH(X(cs[i0]), X(cs[i0 + 1]), ycT, yTop, cmTxt(cs[i0 + 1] - cs[i0]), null);
    if (cs.length) D.texto(ox, ycT - 4.5, "eixos dos pilaretes (cm)", T.escala * 0.8, "EST-TEXTO", { al: "E" });
    /* tabela de peças em blocos de colunas */
    var yt = yBase + 32, xt = ox, k;
    for (k = 0; k < m.nB; k++) {
      var parte = m.linhas.slice(k * m.rows, (k + 1) * m.rows); if (!parte.length) break;
      var tb = tabela(D, xt, yt, m.cab, parte, { al: ["E", "C", "E", "E", "D", "E"], larguras: m.larguras });
      xt += tb.w + m.gap;
    }
    /* totais */
    var q = pag.quant, yq = yt + m.hTab + 6;
    tabela(D, ox, yq, ["PEÇAS", ["PLACAS A", "COMPRAR"], "ÁREA (m²)", "PESO DAS PEÇAS (kg)", "CONCRETO (m³)", "AÇO (kg)"],
      [[String(q.pecas), String(q.placasCompra), br(q.areaPecas, 2), br(q.pesoPecasKg, 1), br(q.concretoM3, 3), br(q.acoKg, 1)]], { al: ["C", "C", "C", "C", "C", "C"], larguras: [22, 22, 24, 40, 30, 22] });
    D.texto(ox, yq - 2, "TOTAIS DA PAREDE " + pag.id, T.cabecalho, "EST-TITULO", { al: "E" });
    /* peças atrás de faixa de reforço (só a face aparece): número fora da parede, com chamada */
    if (semLugar.length) {
      var kp = { x0: X(m.xmin) - 1, x1: X(m.xmax) + 1, y0: yTop - 1, y1: yBase + 1 };
      D.keep.push(kp);
      semLugar.forEach(function (p) {
        var cxp = X(p.x + p.w / 2), cyp = Y(p.y + p.h / 2), ok = D.rotulo(cxp, cyp, p.cod, T.notacao, "BLK-NUM", { angs: p.fiada <= 1 ? [90, 60, 120] : [-90, -60, -120] });
        if (!ok) aviso(avisos, "Parede " + pag.id + ": peça " + p.cod + " sem lugar livre para o número.");
      });
      D.keep.pop();
    }
  }
  /* coloca linhas de texto centradas num retângulo (mm); horizontal ou girada; reduz o corpo se preciso */
  function colocarLinhas(D, r, ls, cam, o) {
    o = o || {};
    var fat = [1, 0.85, 0.72, 0.6], f, i;
    for (f = 0; f < fat.length; f++) {
      var hs = ls.map(function (l) { return Math.max(PADRAO.textos.minimo, l.h * fat[f]); });
      if (f > 0 && hs[0] < PADRAO.textos.minimo - 1e-9) break;
      var Wt = 0, Ht = 0; ls.forEach(function (l, k) { Wt = Math.max(Wt, larg(l.s, hs[k])); Ht += hs[k] * 1.3; });
      /* horizontal */
      if (Wt <= r.w - 1.2 && Ht <= r.h - 1.2) {
        var y = r.y + (r.h - Ht) / 2;
        ls.forEach(function (l, k) { D.texto(r.x + r.w / 2, y + hs[k] * 0.95, l.s, hs[k], cam, { al: "C" }); y += hs[k] * 1.3; });
        return true;
      }
      /* girada */
      if (Ht <= r.w - 1.2 && Wt <= r.h - 1.2) {
        var x = r.x + (r.w - Ht) / 2;
        ls.forEach(function (l, k) { D.texto(x + hs[k] * 0.95, r.y + r.h / 2, l.s, hs[k], cam, { al: "C", ang: 90 }); x += hs[k] * 1.3; });
        return true;
      }
    }
    if (!o.silencioso && o.avisos) aviso(o.avisos, "Sem lugar livre para o texto de " + (o.ctx || "elemento") + ".");
    return false;
  }

  /* ================================================================ FOLHAS DE PAGINAÇÃO */
  function folhasPaginacao(r, geo, avisos) {
    var a = geo.area, out = [], atual = null, Y0 = a.y + 2, gapB = 10;
    function fecha() { if (atual && atual.blocos.length) out.push(atual); atual = null; }
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.pecas || !w.pag.pecas.length) { aviso(avisos, "Parede " + (w.id || "?") + " sem peças paginadas: sem folha de paginação."); return; }
      var m = null, escs = PADRAO.escalas.paginacao.concat(PADRAO.escalas.paginacaoReserva), i;
      for (i = 0; i < escs.length; i++) { var t = medirParede(w, escs[i], a.w); if (t.wTotal <= a.w) { m = t; break; } }
      if (!m) { m = medirParede(w, escs[escs.length - 1], a.w); aviso(avisos, "Parede " + w.pag.id + " não cabe nem em 1:" + escs[escs.length - 1] + " em " + geo.papel.w + " mm: use folha maior."); }
      if (m.esc > PADRAO.escalas.paginacao[PADRAO.escalas.paginacao.length - 1]) aviso(avisos, "Parede " + w.pag.id + ": escala 1:" + m.esc + " (fora do 1:20/1:25 do padrão) porque o comprimento não cabe na folha.");
      if (!atual || (atual.y + m.hTotal > a.y + a.h)) { fecha(); atual = { blocos: [], y: Y0 }; if (m.hTotal > a.h) aviso(avisos, "Parede " + w.pag.id + ": a elevação com a tabela de peças passa da altura da folha."); }
      atual.blocos.push({ w: w, m: m, y: atual.y }); atual.y += m.hTotal + gapB;
    });
    fecha();
    return out;
  }

  /* ================================================================ PLANTA DE LOCAÇÃO + QUADRO */
  function quadroReforcos(r) {
    var linhas = [];
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.reforcos) return;
      reforcosDe(w).forEach(function (x) {
        var rr = x.r, calc = x.calc, secao = calc && calc.b != null && calc.h != null ? cmTxt(calc.b) + " x " + cmTxt(calc.h) : (x.tipo === "cinta" && calc ? "- x " + cmTxt(calc.h) : cmTxt(rr.w) + " x " + cmTxt(rr.h));
        var pos = x.tipo === "pilarete" ? br(rr.x + rr.w / 2, 2) : (br(rr.x, 2) + " a " + br(rr.x + rr.w, 2));
        var qtxt = x.q ? x.q.barras + " Ø " + x.q.bitola + " C=" + Math.round(x.q.comprimento * 100) : "-";
        if (x.tipo === "cinta") qtxt = [x.en.main, x.en.sup, x.en.lat].filter(Boolean).map(function (en) { return en.e.barras + " Ø " + en.e.bitola + " C=" + Math.round(en.e.comprimento * 100); }).join(" + ") || "-";
        var ctxt = calc && calc.armadura ? calc.armadura.replace(/\s*\([^)]*\)/g, "").replace(/φ/g, "Ø ").replace(/inferior/, "inf.").replace(/superior nos apoios/, "sup.").replace(/lateral/, "lat.") : (calc && calc.naCinta ? "na cinta" : "-");
        var est = "-";
        if (x.est) est = x.est.barras + " Ø " + x.est.bitola + " C=" + Math.round(x.est.comprimento * 100);
        else if (calc && calc.cisalhamento && (x.tipo === "verga" || x.tipo === "cinta")) est = "Ø " + calc.cisalhamento.phi + " C/" + cmTxt(calc.cisalhamento.s) + " (calc.; fora do quantitativo)";
        linhas.push([w.pag.id, rr.id, nomeReforco(x.tipo), pos, secao, ctxt, qtxt, est, x.status]);
      });
    });
    return linhas;
  }
  var QR_CAB = ["PAREDE", "ELEMENTO", "TIPO", ["POSIÇÃO", "(m)"], ["SEÇÃO", "(cm)"], ["ARMADURA", "CALCULADA"], ["ARMADURA NO", "QUANTITATIVO"], "ESTRIBO", "SITUAÇÃO"];
  var QR_AL = ["E", "E", "E", "E", "E", "E", "E", "E", "E"];

  function desenharLocacao(D, r, geo, op, avisos, rotuloFolha) {
    var a = geo.area, T = PADRAO.textos, pl = op.planta && arr(op.planta.paredes).length ? op.planta : null, ws = r.paredes.filter(function (w) { return w.pag && w.pag.comprimento > 0; });
    var yTab, escTxt;
    D.texto(a.x, a.y + 2 + T.titulo, pl ? "PLANTA DE LOCAÇÃO DOS REFORÇOS (PILARETES, VERGAS E CINTAS)" : "PLANTA ESQUEMÁTICA DOS REFORÇOS - PAREDES EM LISTA (SEM COORDENADAS)", T.titulo, "EST-TITULO", { al: "E" });
    var yIni = a.y + 2 + T.titulo + 4; D.limite = { x0: a.x, x1: a.x + a.w, y0: a.y, y1: a.y + a.h };
    function pilaretesDe(w) { return arr(w.pag.reforcos.pilaretes).filter(function (p) { return p.dono !== false; }); }
    function desenhoParede(w, p0, ux, uy, sc, rot) {
      var pag = w.pag, e = pag.espessura / 100 * 1, L = pag.comprimento, nx = -uy, ny = ux;
      function P(sv, tv) { return [p0[0] + (sv * ux + tv * nx) * sc, p0[1] + (sv * uy + tv * ny) * sc]; }
      var vs = arr(pag.vaos).slice().sort(function (a1, b1) { return a1.x - b1.x; }), cur = 0, tmp;
      function macico(s0, s1) { if (s1 - s0 > 1e-6) D.poli([P(s0, -e / 2), P(s1, -e / 2), P(s1, e / 2), P(s0, e / 2)], "EST-FORMA-CORTE", true); }
      vs.forEach(function (v) { macico(cur, Math.max(cur, v.x)); cur = v.x + v.w; });
      macico(cur, L);
      vs.forEach(function (v) { var a1 = P(v.x, -e / 2), b1 = P(v.x + v.w, -e / 2), a2 = P(v.x, e / 2), b2 = P(v.x + v.w, e / 2); D.linha(a1[0], a1[1], b1[0], b1[1], "EST-OCULTA"); D.linha(a2[0], a2[1], b2[0], b2[1], "EST-OCULTA"); });
      pilaretesDe(w).forEach(function (pl0) {
        var q = [P(pl0.x, -e / 2), P(pl0.x + pl0.w, -e / 2), P(pl0.x + pl0.w, e / 2), P(pl0.x, e / 2)];
        D.hach(q, "EST-HACHURA", 0.8); D.poli(q, "EST-FORMA-CORTE", true);
      });
      return P;
    }
    /* área da planta */
    var hPlanta = a.h * 0.5, wPlanta = a.w - 20;
    if (pl) {
      var pts = [], mapa = {};
      arr(pl.paredes).forEach(function (q) { mapa[q.id] = q; pts.push([q.x1, q.y1], [q.x2, q.y2]); });
      var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
      var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Y0 = Math.min.apply(null, ys), Y1 = Math.max.apply(null, ys), esc0 = null;
      for (var i = 0; i < PADRAO.escalas.planta.length; i++) { var e0 = PADRAO.escalas.planta[i]; if ((X1 - X0) * 1000 / e0 + 70 <= wPlanta && (Y1 - Y0) * 1000 / e0 + 40 <= hPlanta) { esc0 = e0; break; } }
      if (!esc0) { esc0 = PADRAO.escalas.planta[PADRAO.escalas.planta.length - 1]; aviso(avisos, "Planta de locação não cabe na folha em 1:" + esc0 + "."); }
      if (esc0 > 50) aviso(avisos, "Planta de locação em 1:" + esc0 + " (padrão 1:50 não coube na folha).");
      var sc = 1000 / esc0, ox = a.x + 35 - (X0 - 0) * 0 + ((wPlanta - 70) - (X1 - X0) * sc) / 2 + 0, oy = yIni + 16 + (Y1 - Y0) * sc;
      escTxt = "1:" + esc0;
      var coord = function (xm, ym) { return [ox + (xm - X0) * sc, oy - (ym - Y0) * sc]; };
      ws.forEach(function (w) {
        var q = mapa[w.pag.id]; if (!q) { aviso(avisos, "opcoes.planta sem a parede " + w.pag.id + ": ficou fora da planta."); return; }
        var A = coord(q.x1, q.y1), B = coord(q.x2, q.y2), dl = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1])), ux = (B[0] - A[0]) / dl, uy = (B[1] - A[1]) / dl;
        var P = desenhoParede(w, A, ux, uy, sc / 1, 0);
        void P;
      });
      /* rótulos depois de todas as paredes (para escolher lugar livre). Cada ponto de chamada vira área proibida para os
         rótulos dos vizinhos: sem isto o rótulo de um pilarete cobria a âncora do seguinte e este ficava sem lugar. */
      ws.forEach(function (w) {
        var q0 = mapa[w.pag.id]; if (!q0) return;
        var A0 = coord(q0.x1, q0.y1), B0 = coord(q0.x2, q0.y2), dl0 = Math.sqrt((B0[0] - A0[0]) * (B0[0] - A0[0]) + (B0[1] - A0[1]) * (B0[1] - A0[1]));
        pilaretesDe(w).forEach(function (p) { var s0 = (p.x + p.w / 2) * sc / dl0, cx0 = A0[0] + (B0[0] - A0[0]) * s0, cy0 = A0[1] + (B0[1] - A0[1]) * s0; D.keep.push({ x0: cx0 - 1.2, x1: cx0 + 1.2, y0: cy0 - 1.2, y1: cy0 + 1.2 }); });
      });
      ws.forEach(function (w) {
        var q = mapa[w.pag.id]; if (!q) return;
        var A = coord(q.x1, q.y1), B = coord(q.x2, q.y2), dl = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1])), ux = (B[0] - A[0]) / dl, uy = (B[1] - A[1]) / dl;
        function Pt(sv) { return [A[0] + sv * ux * sc, A[1] + sv * uy * sc]; }
        pilaretesDe(w).forEach(function (p) { var c = Pt(p.x + p.w / 2); D.rotulo(c[0], c[1], w.pag.id + "-" + p.id, T.nota, "EST-ARM-TEXTO", { dists: [6, 9, 13, 18, 24, 32, 42, 56] }); });
        var mm = Pt(w.pag.comprimento / 2); D.rotulo(mm[0], mm[1], w.pag.id + " (" + mTxt(w.pag.comprimento) + " m)", T.cabecalho, "EST-TITULO", { dists: [10, 16, 24, 34] });
      });
      yTab = oy + 24;
    } else {
      /* lista: cada parede é uma barra horizontal em escala; rótulos dos pilaretes escalonados */
      var Lmax = Math.max.apply(null, ws.map(function (w) { return w.pag.comprimento; })), esc1 = null;
      for (var j = 0; j < PADRAO.escalas.planta.length; j++) { var e1 = PADRAO.escalas.planta[j]; if (Lmax * 1000 / e1 + 80 <= wPlanta) { esc1 = e1; break; } }
      if (!esc1) esc1 = PADRAO.escalas.planta[PADRAO.escalas.planta.length - 1];
      var sc1 = 1000 / esc1, linhaH = 34, xb = a.x + 40, yy = yIni + 18; escTxt = "1:" + esc1;
      if (esc1 > 50) aviso(avisos, "Planta esquemática em 1:" + esc1 + " (padrão 1:50 não coube).");
      /* se não couber na altura, usa menos altura por parede */
      var maxLin = Math.floor(hPlanta / 24); if (ws.length > maxLin) linhaH = Math.max(24, hPlanta / ws.length);
      ws.forEach(function (w, ix) {
        var yw = yy + ix * linhaH, P = desenhoParede(w, [xb, yw], 1, 0, sc1, 0);
        D.texto(xb - 3, yw + 0.35 * T.cabecalho, w.pag.id, T.cabecalho, "EST-TITULO", { al: "D" });
        D.cotaH(xb, xb + w.pag.comprimento * sc1, yw + 10, yw + w.pag.espessura / 200 * sc1, mTxt(w.pag.comprimento), null);
        void P;
      });
      ws.forEach(function (w, ix) {
        var yw = yy + ix * linhaH;
        pilaretesDe(w).forEach(function (p) { D.rotulo(xb + (p.x + p.w / 2) * sc1, yw - w.pag.espessura / 200 * sc1, p.id, T.nota, "EST-ARM-TEXTO", { dists: [5, 8, 11, 14, 17, 20], angs: [-90, -60, -120, -45, -135, -30, -150] }); });
      });
      yTab = yy + ws.length * linhaH + 12;
    }
    D.texto(a.x + wPlanta - 2, a.y + 2 + T.titulo, "ESCALA " + escTxt, T.escala, "EST-TEXTO", { al: "D" });
    /* quadro de pilaretes e vergas */
    var lin = quadroReforcos(r), yq = yTab + 8;
    D.texto(a.x, yq + T.cabecalho, "QUADRO DE PILARETES, VERGAS, CONTRAVERGAS E CINTAS", T.titulo, "EST-TITULO", { al: "E" });
    yq += T.titulo + 4;
    var tmp = new Desenho(), t0 = tabela(tmp, 0, 0, QR_CAB, lin.slice(0, 1), { al: QR_AL });
    void t0;
    var nB = 2, rows = Math.ceil(lin.length / nB), xt = a.x, k;
    for (k = 0; k < nB; k++) {
      var parte = lin.slice(k * rows, (k + 1) * rows); if (!parte.length) break;
      var tb = tabela(D, xt, yq, QR_CAB, parte, { al: QR_AL });
      if (yq + tb.h > a.y + a.h) aviso(avisos, "Folha " + rotuloFolha + ": o quadro de reforços passa do pé da folha.");
      xt += tb.w + 10;
    }
    if (xt > a.x + a.w + 1) aviso(avisos, "Folha " + rotuloFolha + ": o quadro de reforços passa da largura da área de desenho.");
    return { escala: escTxt };
  }

  /* ================================================================ DETALHES */
  function distintas(r) {
    var m = {}; r.paredes.forEach(function (w) { if (w.pag && w.pag.catalogo) m[w.pag.espessura] = w.pag; });
    return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return m[k]; });
  }
  function tituloDet(D, x, y, n, titulo, escala) {
    var T = PADRAO.textos;
    D.texto(x, y + T.titulo, "DETALHE " + n + " - " + titulo, T.titulo, "EST-TITULO", { al: "E" });
    D.texto(x, y + T.titulo + 4, "ESCALA " + escala, T.escala, "EST-TEXTO", { al: "E" });
  }
  /* faixa de seção vertical (camada) com hachura de concreto */
  function faceSecao(D, x, y, w, h, hach) { D.ret(x, y, w, h, "EST-FORMA-CORTE"); if (hach !== false) D.hachRet(x, y, w, h, 1.2); }
  /* EPS: retângulo cinza com diagonais (símbolo de isolante) */
  function epsSecao(D, x, y, w, h) {
    D.ret(x, y, w, h, "BLK-EPS");
    var n = Math.max(2, Math.floor(h / 6)), i;
    for (i = 0; i < n; i++) { var y0 = y + i * h / n, y1 = y + (i + 1) * h / n; D.poli([[x, y0], [x + w, (y0 + y1) / 2], [x, y1]], "BLK-EPS", false); }
  }
  function barraSecao(D, x, y, bit, k) { D.circ(x, y, Math.max(0.7, bit / 2 / 10 * k * 0.1 * 10), "EST-ARM-SECAO", true); }

  function detCortePeca(D, c, pags, av) {
    var T = PADRAO.textos, k = 500, cf = pags[0].cfg, fs = cf.face, y0 = c.y + 32, H = 0.18, x = c.x + 20, lista = [pags[0]];
    if (pags.length > 1) lista.push(pags[pags.length - 1]);
    tituloDet(D, c.x, c.y, 1, "CORTE DA PEÇA (FACE / EPS / FACE)", "1:2");
    lista.forEach(function (pg, i) {
      var e = pg.espessura / 100, nuc = e - 2 * fs, W = e * k, hh = H * k;
      D.keep.push({ x0: x - 1, x1: x + W + 1, y0: y0 - 1, y1: y0 + hh + 1 });
      faceSecao(D, x, y0, fs * k, hh); epsSecao(D, x + fs * k, y0, nuc * k, hh); faceSecao(D, x + (fs + nuc) * k, y0, fs * k, hh);
      /* quebra no topo e na base */
      D.cotaH(x, x + fs * k, y0 - 8, y0, cmTxt(fs), null, {}); D.cotaH(x + fs * k, x + (fs + nuc) * k, y0 - 8, y0, cmTxt(nuc), null, { semExt: true }); D.cotaH(x + (fs + nuc) * k, x + W, y0 - 8, y0, cmTxt(fs), null, { semExt: true });
      D.cotaH(x, x + W, y0 - 17, y0 - 8, cmTxt(e) + " (peça " + pg.espessura + ")", null, { semExt: true });
      D.rotulo(x + (fs + nuc / 2) * k, y0 + hh * 0.7, "núcleo EPS", T.nota, "EST-TEXTO", { angs: [0, 180] });
      x += W + 70;
      void i;
    });
    D.rotulo(c.x + 20 + fs * k / 2, y0 + H * k * 0.3, "face de microconcreto", T.nota, "EST-TEXTO", { angs: [-90, 90, -135, 135] });
    D.texto(c.x, y0 + H * k + 8, "Peça 90 x 90 cm; face de " + cmTxt(fs) + " cm em cada lado (cfg.face); demais espessuras: núcleo = e - " + cmTxt(2 * fs) + " cm.", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }

  function detCanto(D, c, pags, av) {
    var T = PADRAO.textos, k = 100, pg = pags[pags.length - 1], e = pg.espessura / 100, fs = pg.cfg.face, j = pg.cfg.junta, Lb = 0.60, xo = c.x + 20, yo = c.y + 24;
    tituloDet(D, c.x, c.y, 2, "AMARRAÇÃO EM CANTO L (VISTA SUPERIOR, FIADAS ALTERNADAS)", "1:10");
    function parede(x0, y0, w0, h0) {      /* retângulo em m → face/EPS/face (linhas) */
      var X = x0 * k, Y = y0 * k, W = w0 * k, H = h0 * k;
      D.ret(X, Y, W, H, "EST-FORMA-VISTA");
      if (w0 >= h0) { D.linha(X, Y + fs * k, X + W, Y + fs * k, "BLK-EPS"); D.linha(X, Y + H - fs * k, X + W, Y + H - fs * k, "BLK-EPS"); }
      else { D.linha(X + fs * k, Y, X + fs * k, Y + H, "BLK-EPS"); D.linha(X + W - fs * k, Y, X + W - fs * k, Y + H, "BLK-EPS"); }
    }
    var xs = [xo, xo + 120], k2;
    for (k2 = 0; k2 < 2; k2++) {
      var bx = xs[k2] / k, by = yo / k;
      if (k2 === 0) { parede(bx, by, Lb, e); parede(bx, by + e + j, e, Lb); }          /* fiada ímpar: A (horizontal) passa */
      else { parede(bx, by, e, Lb); parede(bx + e + j, by, Lb - e - j, e); }           /* fiada par: B (vertical) passa */
      D.keep.push({ x0: xs[k2] - 1, x1: xs[k2] + Lb * k + 1, y0: yo - 1, y1: yo + (k2 === 0 ? e + j + Lb : Lb) * k + 1 });
      D.texto(xs[k2], yo - 6, k2 === 0 ? "FIADA ÍMPAR" : "FIADA PAR", T.letraCorte, "EST-TITULO", { al: "E" });
    }
    D.cotaV(yo, yo + e * k, xo - 10, xo, cmTxt(e), null);
    D.rotulo(xo + 120 + (e + j / 2) * k, yo + (e / 2) * k, "junta " + cmTxt(j), T.nota, "EST-TEXTO", { angs: [-30, 30, 0] });
    D.texto(c.x, yo + (Lb + e) * k + 12, "Em cada fiada uma parede passa e a outra encosta (junta " + cmTxt(j) + " cm); na fiada seguinte inverte. Transpasse mínimo " + Math.round(pg.cfg.transpasseMin * 100) + " % da peça.", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }

  function detT(D, c, pags, av) {
    var T = PADRAO.textos, k = 100, pg = pags[0], eA = pg.espessura / 100, eB = pags[pags.length - 1].espessura / 100, fs = pg.cfg.face, j = pg.cfg.junta, an = BlocokExec.DIRETRIZ.ancoragemLigacao;
    var xo = c.x + 20, yo = c.y + 26, LA = 1.0, LB = 0.65;
    tituloDet(D, c.x, c.y, 3, "ENCONTRO EM T COM GRAMPO (VISTA SUPERIOR)", "1:10");
    D.ret(xo, yo, LA * k, eA * k, "EST-FORMA-VISTA"); D.linha(xo, yo + fs * k, xo + LA * k, yo + fs * k, "BLK-EPS"); D.linha(xo, yo + eA * k - fs * k, xo + LA * k, yo + eA * k - fs * k, "BLK-EPS");
    var bx = xo + (LA - eB) / 2 * k, by = yo + (eA + j) * k;
    D.ret(bx, by, eB * k, LB * k, "EST-FORMA-VISTA"); D.linha(bx + fs * k, by, bx + fs * k, by + LB * k, "BLK-EPS"); D.linha(bx + eB * k - fs * k, by, bx + eB * k - fs * k, by + LB * k, "BLK-EPS");
    D.keep.push({ x0: xo - 1, x1: xo + LA * k + 1, y0: yo - 1, y1: by + LB * k + 1 });
    /* grampo em L: perna de 15 cm na parede A (para um lado) e perna de 15 cm descendo na B */
    var cx = bx + eB * k / 2, ya = yo + eA * k / 2, yb = Math.min(by + LB * k - 2, ya + (eA / 2 + j + an) * k);
    D.poli([[cx - an * k, ya], [cx, ya], [cx, yb]], "EST-ARM-LONG", false);
    D.cotaH(cx - an * k, cx, yo - 8, yo, "≥ " + cmTxt(an), null);
    D.cotaV(by, yb, bx + eB * k + 14, bx + eB * k, "≥ " + cmTxt(an), null);
    D.rotulo(cx - an * k / 2, ya, "grampo Ø [a definir]", T.nota, "EST-ARM-TEXTO", { angs: [180, 0, -90] });
    D.texto(c.x, by + LB * k + 12, "Grampo em cada fiada (BlocokExec: ligações = grampos por fiada); bitola e comprimento: [a definir pelo projetista].", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }

  /* notação TQS "{q} N{pos} Ø {bit} C={comp}" (estribo: "C/{esp}" antes do C=) */
  function notacao(en, esp) {
    if (!en) return null; var a = en.e;
    return a.barras + " N" + en.pos + " Ø " + a.bitola + (esp ? " C/" + cmTxt(esp) : "") + " C=" + Math.round(a.comprimento * 100);
  }
  function espEstribo(x, pg) {
    if (x.tipo === "pilarete") return pg.cfg.aco && pg.cfg.aco.pilarete ? pg.cfg.aco.pilarete.estriboEsp : 0;
    return x.calc && x.calc.cisalhamento ? x.calc.cisalhamento.s : 0;
  }
  /* seção de uma verga/cinta: faces + EPS + bloco de concreto armado com barras e estribo (posição das barras ESQUEMÁTICA) */
  function secaoViga(D, x0, y0, pg, x, hv) {
    var T = PADRAO.textos, k = 200, e = pg.espessura / 100, fs = pg.cfg.face, cw = pg.catalogo.concreto, HJ = 0.36, W = e * k, Hs = HJ * k;
    var h = hv, yb = y0 + (HJ - h) / 2 * k, xb = x0 + (e - cw) / 2 * k, ac = x.arm;
    faceSecao(D, x0, y0, fs * k, Hs); faceSecao(D, x0 + W - fs * k, y0, fs * k, Hs);
    epsSecao(D, x0 + fs * k, y0, (e - 2 * fs) * k, Math.max(0, yb - y0)); epsSecao(D, x0 + fs * k, yb + h * k, (e - 2 * fs) * k, Math.max(0, y0 + Hs - yb - h * k));
    D.ret(xb, yb, cw * k, h * k, "EST-FORMA-CORTE"); D.hachRet(xb, yb, cw * k, h * k, 1.2);
    D.keep.push({ x0: x0 - 1, x1: x0 + W + 1, y0: y0 - 1, y1: y0 + Hs + 1 });
    var ins = 0.03, ex = xb + ins * k, ey = yb + ins * k, ew = (cw - 2 * ins) * k, eh = (h - 2 * ins) * k;
    D.ret(ex, ey, ew, eh, "EST-ARM-ESTRIBO");
    var n = ac ? ac.n : 2, bit = ac ? ac.bit : 8, rr = Math.max(0.8, bit / 1000 * k / 2), i, pos = [];
    var cinta = x.tipo === "cinta" && x.calc, an = cinta ? x.calc.arranjoNeg : null, al = cinta && x.calc.ventoHorizontal ? x.calc.ventoHorizontal.arranjo : null;
    var posSup = [], posLat = [], rrS = an ? Math.max(0.8, an.phi / 1000 * k / 2) : rr, rrL = al ? Math.max(0.8, al.phi / 1000 * k / 2) : rr;
    var linhas = !cinta && n > 3 && eh > 2 * (rr * 2 + 2) ? 2 : 1, nSup = linhas === 2 ? Math.floor(n / 2) : 0, nInf = n - nSup;
    function fila(nn, yy, vet, r1) { if (nn === 1) { vet.push([ex + ew / 2, yy]); return; } for (i = 0; i < nn; i++) vet.push([ex + r1 + 1 + i * (ew - 2 * (r1 + 1)) / (nn - 1), yy]); }
    fila(nInf, ey + eh - rr - 1, pos, rr); if (nSup) fila(nSup, ey + rr + 1, pos, rr);
    /* cinta: inferior (vão) embaixo, superior (negativo, nos apoios) em cima e lateral (vento) nas duas faces do estribo */
    if (an) fila(an.n, ey + rrS + 1, posSup, rrS);
    if (al) for (i = 0; i < al.n; i++) { var yl = ey + eh * (i + 1) / (al.n + 1); posLat.push([ex + rrL + 1, yl], [ex + ew - rrL - 1, yl]); }
    pos.forEach(function (p) { D.circ(p[0], p[1], rr, "EST-ARM-SECAO", true); });
    posSup.forEach(function (p) { D.circ(p[0], p[1], rrS, "EST-ARM-SECAO", true); });
    posLat.forEach(function (p) { D.circ(p[0], p[1], rrL, "EST-ARM-SECAO", true); });
    D.cotaH(xb, xb + cw * k, y0 - 8, y0, cmTxt(cw), null, {});
    D.cotaV(yb, yb + h * k, x0 + W + 12, x0 + W, cmTxt(h), null);
    D.cotaH(x0, x0 + W, y0 + Hs + 9, y0 + Hs, cmTxt(e), null);
    var nt = notacao(x.en.main) || ((ac ? ac.n : "?") + " N1 Ø " + (ac ? ac.bit : "?") + " C=[a definir]");
    D.rotulo(pos[0] ? pos[0][0] : ex, pos[0] ? pos[0][1] : ey, nt, T.notacao, "EST-ARM-TEXTO", { angs: [180, 135, -135] });
    var ns = cinta ? notacao(x.en.sup) : null, nl = cinta ? notacao(x.en.lat) : null;
    if (ns && posSup[0]) D.rotulo(posSup[0][0], posSup[0][1], ns, T.notacao, "EST-ARM-TEXTO", { angs: [180, 135, -135, 90] });
    if (nl && posLat[0]) D.rotulo(posLat[0][0], posLat[0][1], nl + " (por face)", T.notacao, "EST-ARM-TEXTO", { angs: [180, 160, 200] });
    var ne = notacao(x.en.estribo, espEstribo(x, pg)), np = notacao(x.en.porta);
    if (ne) D.rotulo(ex + ew, ey + eh * 0.5, ne, T.notacao, "EST-ARM-TEXTO", { angs: [0, 30, -30] });
    if (np) D.rotulo(ex + ew / 2, ey + 1, np, T.notacao, "EST-ARM-TEXTO", { angs: [-90, -45, -135] });
    return { w: W, h: Hs };
  }
  function achar(r, tipo) {
    var alvo = null;
    r.paredes.forEach(function (w) { if (!alvo && w.pag && w.pag.reforcos) reforcosDe(w).forEach(function (x) { if (!alvo && x.tipo === tipo && x.calc && x.arm) alvo = { w: w, x: x }; }); });
    return alvo;
  }
  function detVerga(D, c, r, av) {
    var T = PADRAO.textos, alvo = achar(r, "verga");
    tituloDet(D, c.x, c.y, 4, "VERGA EMBUTIDA (CORTE TRANSVERSAL)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem verga calculada nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    var sec = secaoViga(D, c.x + 90, c.y + 30, alvo.w.pag, alvo.x, alvo.x.calc.h || alvo.x.r.h);
    D.texto(c.x, c.y + 30 + sec.h + 18, "Exemplo: " + alvo.x.r.id + " (parede " + alvo.w.pag.id + "): " + alvo.x.calc.armadura + ". Posição das barras esquemática; cobrimento: NBR 6118 Tab. 7.2 (CAA " + txt(r.parametros && r.parametros.caa) + ").", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }
  function detCinta(D, c, r, av) {
    var T = PADRAO.textos, alvo = achar(r, "cinta");
    tituloDet(D, c.x, c.y, 6, "CINTA DE RESPALDO (CORTE TRANSVERSAL)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem cinta calculada nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    var sec = secaoViga(D, c.x + 90, c.y + 30, alvo.w.pag, alvo.x, alvo.x.calc.h || alvo.x.r.h);
    D.texto(c.x, c.y + 30 + sec.h + 18, "Exemplo: " + alvo.x.r.id + " (parede " + alvo.w.pag.id + "): " + alvo.x.calc.armadura + ". Inferior = vão (momento positivo); superior = apoios (momento negativo); lateral = flexão horizontal do vento, quando a cinta não tem diafragma no topo. Posição das barras esquemática.", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }
  function detPilarete(D, c, r, av) {
    var T = PADRAO.textos, k = 200, alvo = achar(r, "pilarete");
    tituloDet(D, c.x, c.y, 5, "PILARETE (SEÇÃO EM PLANTA)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem pilarete calculado nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    var pg = alvo.w.pag, e = pg.espessura / 100, fs = pg.cfg.face, cw = pg.catalogo.concreto, b = alvo.x.calc.b || pg.cfg.pilarete.largura, Wp = 0.50, x0 = c.x + 60, y0 = c.y + 32, ac = alvo.x.arm;
    var xb = x0 + (Wp - b) / 2 * k, yb = y0 + (e - cw) / 2 * k;
    faceSecao(D, x0, y0, Wp * k, fs * k); faceSecao(D, x0, y0 + (e - fs) * k, Wp * k, fs * k);
    epsSecao(D, x0, y0 + fs * k, xb - x0, (e - 2 * fs) * k); epsSecao(D, xb + b * k, y0 + fs * k, x0 + Wp * k - xb - b * k, (e - 2 * fs) * k);
    D.ret(xb, yb, b * k, cw * k, "EST-FORMA-CORTE"); D.hachRet(xb, yb, b * k, cw * k, 1.2);
    D.keep.push({ x0: x0 - 1, x1: x0 + Wp * k + 1, y0: y0 - 1, y1: y0 + e * k + 1 });
    var ins = 0.03, ex = xb + ins * k, ey = yb + ins * k, ew = (b - 2 * ins) * k, eh = (cw - 2 * ins) * k, rr = Math.max(0.9, ac.bit / 1000 * k / 2);
    D.ret(ex, ey, ew, eh, "EST-ARM-ESTRIBO");
    var pos = [[ex + rr + 1, ey + rr + 1], [ex + ew - rr - 1, ey + rr + 1], [ex + rr + 1, ey + eh - rr - 1], [ex + ew - rr - 1, ey + eh - rr - 1]];
    pos.forEach(function (p) { D.circ(p[0], p[1], rr, "EST-ARM-SECAO", true); });
    D.cotaH(xb, xb + b * k, y0 - 8, y0, cmTxt(b), null, {});
    D.cotaV(yb, yb + cw * k, x0 + Wp * k + 12, x0 + Wp * k, cmTxt(cw), null);
    D.cotaV(y0, y0 + e * k, x0 - 12, x0, cmTxt(e), null);
    var q = alvo.x.q, nt1 = notacao(alvo.x.en.main) || (ac.n + " N1 Ø " + ac.bit + " C=[a definir]"), ne = notacao(alvo.x.en.estribo, espEstribo(alvo.x, pg));
    D.rotulo(pos[3][0], pos[3][1], nt1, T.notacao, "EST-ARM-TEXTO", { angs: [30, 0, -30, 60] });
    if (ne) D.rotulo(ex + ew, ey + eh * 0.5, ne, T.notacao, "EST-ARM-TEXTO", { angs: [-30, -60, 0, 20] });
    D.texto(c.x, y0 + e * k + 18, "Exemplo: " + alvo.x.r.id + " (parede " + pg.id + "): " + alvo.x.calc.armadura + (alvo.x.status === "difere" ? "; o quantitativo traz " + (q ? q.barras + " Ø " + q.bitola : "-") + " (ver quadro de reforços)." : "."), T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }
  function detJunta(D, c, pags, av) {
    var T = PADRAO.textos, k = 500, pg = pags[0], j = pg.cfg.junta, fs = pg.cfg.face, tela = (pg.cfg.tratamento && pg.cfg.tratamento.telaLarguraM) || 0.10;
    tituloDet(D, c.x, c.y, 7, "TRATAMENTO DE JUNTA (CAMADAS)", "1:5 (espessuras das camadas fora de escala)");
    var x0 = c.x + 20, y0 = c.y + 30, Wp = 0.14, hh = 0.14 * k, xj = x0 + Wp * k;
    /* duas peças separadas pela junta; vista em corte horizontal pela face externa (seção vertical da junta) */
    faceSecao(D, x0, y0, Wp * k, hh, true); faceSecao(D, xj + j * k, y0, Wp * k, hh, true);
    D.ret(xj, y0, j * k, hh, "EST-FORMA-VISTA");
    D.keep.push({ x0: x0 - 1, x1: xj + j * k + Wp * k + 1, y0: y0 - 1, y1: y0 + hh + 1 });
    /* camadas por cima: selador (linha fina), tela (faixa) e AC-III (faixa maior) — esquemáticas, acima da face (y0 - d) */
    var xm = xj + j * k / 2, wt = tela * k, wA = wt + 0.06 * k;
    D.ret(xm - wA / 2, y0 - 5, wA, 2.2, "BLK-TRATAMENTO");                   /* AC-III */
    D.ret(xm - wt / 2, y0 - 2.8, wt, 1.2, "BLK-TRATAMENTO"); D.hachRet(xm - wt / 2, y0 - 2.8, wt, 1.2, 0.8);   /* tela */
    D.linha(x0, y0 - 0.6, xj + j * k + Wp * k, y0 - 0.6, "BLK-TRATAMENTO");   /* selador */
    D.keep.push({ x0: xm - wA / 2 - 1, x1: xm + wA / 2 + 1, y0: y0 - 6, y1: y0 });
    D.cotaH(xj, xj + j * k, y0 + hh + 9, y0 + hh, cmTxt(j), null);
    D.cotaH(xm - wt / 2, xm + wt / 2, y0 - 16, y0 - 5, cmTxt(tela), null);
    var ax = xm + wA / 2 + 4;
    D.rotulo(xm + wA / 4, y0 - 3.9, "1) selador; 2) AC-III; 3) tela de fibra de vidro; 4) AC-III", T.nota, "EST-TEXTO", { angs: [0] });
    D.rotulo(xm, y0 + hh * 0.6, "argamassa de assentamento na junta", T.nota, "EST-TEXTO", { angs: [0, 180, -45] });
    D.texto(c.x, y0 + hh + 20, "Sequência do vídeo oficial (11/06/2026): selador, AC-III, tela de fibra de vidro, AC-III; tela com " + cmTxt(tela) + " cm de largura (cfg.tratamento). Espessuras das camadas: [a definir].", T.nota, "EST-TEXTO", { al: "E" });
    void ax; void fs; void av;
  }
  function detEncunha(D, c, pags, av) {
    var T = PADRAO.textos, k = 200, pg = pags[pags.length - 1], D0 = BlocokExec.DIRETRIZ, enc = D0.encunhamentoMin, an = D0.ancoragemLigacao, e = pg.espessura / 100;
    tituloDet(D, c.x, c.y, 8, "ENCUNHAMENTO E LIGAÇÃO À ESTRUTURA", "1:5");
    var x0 = c.x + 40, yLaje = c.y + 30, Wp = e * k, hLaje = 0.14 * k, hPeca = 0.30 * k, yEnc = yLaje + hLaje;
    /* laje/viga (concreto cortado), vão de encunhamento, peça abaixo */
    D.ret(x0 - 25, yLaje, Wp + 50, hLaje, "EST-FORMA-CORTE"); D.hachRet(x0 - 25, yLaje, Wp + 50, hLaje, 1.6);
    D.ret(x0, yEnc + enc * k, Wp, hPeca, "EST-FORMA-VISTA"); D.linha(x0 + 1.5 * 0.5 * k / 100 * 0, yEnc + enc * k, x0, yEnc + enc * k, "EST-FORMA-VISTA");
    D.keep.push({ x0: x0 - 26, x1: x0 + Wp + 26, y0: yLaje - 1, y1: yEnc + enc * k + hPeca + 1 });
    D.cotaV(yEnc, yEnc + enc * k, x0 + Wp + 12, x0 + Wp, "≥ " + cmTxt(enc), null);
    /* ferro de ligação: L com 15 cm na estrutura e 15 cm na peça */
    var xf = x0 + Wp / 2;
    D.poli([[xf, yLaje + 3], [xf, yEnc + enc * k + an * k], [xf + 0, yEnc + enc * k + an * k]], "EST-ARM-LONG", false);
    D.cotaV(yEnc + enc * k, yEnc + enc * k + an * k, x0 - 12, x0, "≥ " + cmTxt(an), null);
    D.cotaV(yLaje + 3, yEnc, x0 - 24, x0, "≥ " + cmTxt(an - enc > 0 ? an : an), null, { semExt: true });
    D.rotulo(xf, yEnc + enc * k / 2, "encunhamento: material [a definir]", T.nota, "EST-TEXTO", { angs: [0, 180] });
    D.rotulo(x0 + Wp / 2, yLaje + hLaje / 2, "laje / viga / cinta", T.nota, "EST-TEXTO", { angs: [90, 0, 180] });
    D.texto(c.x, yEnc + enc * k + hPeca + 14, "Encunhamento mínimo " + cmTxt(enc) + " cm e ligação à estrutura a cada fiada com ancoragem mínima de " + cmTxt(an) + " cm (SiNAT 019). Ferro e material: [a definir].", T.nota, "EST-TEXTO", { al: "E" });
    void av;
  }
  function desenharDetalhes(D, r, geo, avisos) {
    var a = geo.area, pags = distintas(r), gx = 10, W = (a.w - gx) / 2, Hc = (a.h - 6) / 4, cel = [];
    var fns = [
      function (c) { detCortePeca(D, c, pags, avisos); }, function (c) { detCanto(D, c, pags, avisos); },
      function (c) { detT(D, c, pags, avisos); }, function (c) { detVerga(D, c, r, avisos); },
      function (c) { detPilarete(D, c, r, avisos); }, function (c) { detCinta(D, c, r, avisos); },
      function (c) { detJunta(D, c, pags, avisos); }, function (c) { detEncunha(D, c, pags, avisos); }
    ];
    fns.forEach(function (fn, i) {
      var col = i % 2, lin = Math.floor(i / 2), c = { x: a.x + col * (W + gx), y: a.y + 2 + lin * Hc, w: W, h: Hc - 4 };
      D.limite = { x0: c.x - 2, x1: c.x + c.w + 2, y0: c.y, y1: c.y + c.h + 4 };
      try { fn(c); } catch (e) { aviso(avisos, "Detalhe " + (i + 1) + ": " + (e && e.message ? e.message : e)); }
      cel.push(c);
    });
    return { escala: "INDICADA" };
  }

  /* ================================================================ TABELA DE AÇO (padrão TQS) */
  function montarAco(r) {
    var linhas = [], resumo = {}, tot = { "50A": 0, "60B": 0 }, concreto = 0;
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.quant) return;
      concreto += w.pag.quant.concretoM3;
      var porElem = {}, ordem = [], rotuloEl = {};
      reforcosDe(w).forEach(function (x) { rotuloEl[x.r.id] = x.r.id + " (" + nomeReforco(x.tipo) + ")"; });
      acoDe(w).forEach(function (a) {
        var k = chaveQuant(w, a.elemento), ch = k ? k.id : a.elemento;
        if (!porElem[ch]) { porElem[ch] = []; ordem.push(ch); }
        porElem[ch].push(a);
      });
      ordem.forEach(function (ch) {
        var itens = porElem[ch];
        linhas.push({ titulo: w.pag.id + " - " + (rotuloEl[ch] || ch) });
        itens.forEach(function (a, i) {
          var g = grau(a.bitola), unit = Math.round(a.comprimento * 100), kg = a.kg;
          linhas.push({ aco: g, pos: "N" + (i + 1), bit: a.bitola, quant: a.barras, unit: unit, total: Math.round(a.metros * 100), kg: kg, parede: w.pag.id, elemento: ch, nome: a.elemento });
          var kk = g + "|" + a.bitola; resumo[kk] = resumo[kk] || { aco: g, bit: a.bitola, m: 0, kg: 0 };
          resumo[kk].m += a.metros; resumo[kk].kg += kg; tot[g] += kg;
        });
      });
    });
    return { linhas: linhas, resumo: Object.keys(resumo).map(function (k) { return resumo[k]; }).sort(function (x, y) { return x.aco === y.aco ? x.bit - y.bit : (x.aco < y.aco ? -1 : 1); }), pesoTotal: tot, concretoM3: concreto };
  }
  function linhaAco(l) {
    if (l.titulo) return { titulo: l.titulo };
    return [l.aco, l.pos, String(l.bit).replace(".", ","), String(l.quant), String(l.unit), String(l.total), br(l.kg, 2)];
  }
  var CAB_ACO = ["AÇO", "POS", "BIT (mm)", "QUANT", ["COMPR", "UNIT (cm)"], ["COMPR", "TOTAL (cm)"], "PESO (kg)"], AL_ACO = ["C", "C", "D", "D", "D", "D", "D"];
  /* distribui as linhas da tabela em blocos de colunas lado a lado (estilo TQS) e em folhas, se preciso */
  function planoAco(dados, geo) {
    var a = geo.area, T = PADRAO.textos, hl = T.tabela * 1.7, linhas = dados.linhas.map(linhaAco), gap = 8;
    var tmp = new Desenho(), t0 = tabela(tmp, 0, 0, CAB_ACO, linhas, { al: AL_ACO });
    var nB = Math.max(1, Math.floor((a.w + gap) / (t0.w + gap))), hCab = T.cabecalho * 1.3 * 2 + 2.4;
    var maxRows = Math.max(8, Math.floor((a.h - 14 - hCab - 80) / hl)), nFolhas = Math.max(1, Math.ceil(linhas.length / (nB * maxRows)));
    var R = Math.ceil(linhas.length / (nB * nFolhas)), blocos, tent;
    for (tent = 0; tent < 40; tent++, R++) {   /* aumenta o alvo até caber em nB x nFolhas blocos (título de elemento nunca fica órfão no pé) */
      blocos = []; var cur = [];
      linhas.forEach(function (l) {
        var titulo = l.titulo !== undefined;
        if (cur.length && ((titulo && cur.length >= R - 2) || cur.length >= R + 6)) { blocos.push(cur); cur = []; }
        cur.push(l);
      });
      if (cur.length) blocos.push(cur);
      if (blocos.length <= nB * nFolhas) break;
    }
    var folhas = [], i; for (i = 0; i < blocos.length; i += nB) folhas.push(blocos.slice(i, i + nB));
    return { folhas: folhas, larguras: t0.cw, nB: nB };
  }
  function desenharAco(D, r, geo, avisos, dadosAco, parte, plano) {
    var a = geo.area, T = PADRAO.textos, y0 = a.y + 2 + T.titulo + 6, blocos = plano.folhas[parte.n - 1] || [];
    D.texto(a.x, a.y + 2 + T.titulo, "TABELA DE AÇO" + (parte.total > 1 ? " - " + parte.n + "/" + parte.total : ""), T.titulo, "EST-TITULO", { al: "E" });
    var xt = a.x, tws = [];
    blocos.forEach(function (bl) {
      var tb = tabela(D, xt, y0, CAB_ACO, bl, { al: AL_ACO, larguras: plano.larguras });
      tws.push(tb); xt += tb.w + 8;
    });
    if (xt - 8 > a.x + a.w + 1) aviso(avisos, "Tabela de aço passa da largura da folha (" + blocos.length + " blocos).");
    var hTab = tws.reduce(function (m, t0) { return Math.max(m, t0.h); }, 0), yr = y0 + hTab + 14;
    if (parte.n < parte.total) { D.texto(a.x, yr, "continua na folha seguinte", T.nota, "EST-TEXTO", { al: "E" }); return { escala: "INDICADA" }; }
    D.texto(a.x, yr + T.cabecalho, "RESUMO AÇO CA 50-60", T.titulo, "EST-TITULO", { al: "E" });
    var rl = dadosAco.resumo.map(function (s) { return [s.aco, String(s.bit).replace(".", ","), br(s.m, 1), br(s.kg, 1)]; });
    var tr = tabela(D, a.x, yr + T.cabecalho + 3, PADRAO.tabelas.resumo, rl, { al: ["C", "D", "D", "D"] });
    var yy = yr + T.cabecalho + 3 + tr.h + 8;
    D.texto(a.x, yy, "Peso Total 50A = " + br(dadosAco.pesoTotal["50A"], 1) + " kg", T.tabela * 1.2, "EST-TEXTO", { al: "E" });
    D.texto(a.x, yy + 6, "Peso Total 60B = " + br(dadosAco.pesoTotal["60B"], 1) + " kg", T.tabela * 1.2, "EST-TEXTO", { al: "E" });
    D.texto(a.x, yy + 12, "Volume de Concreto = " + br(dadosAco.concretoM3, 3) + " m3", T.tabela * 1.2, "EST-TEXTO", { al: "E" });
    D.texto(a.x, yy + 19, "Sem acréscimo de perda (a perda de aço fica no orçamento, não no desenho). Aço: 50A = CA-50, 60B = CA-60 (Ø 5,0 = 60B).", T.nota * 0.9, "EST-TEXTO", { al: "E" });
    return { escala: "INDICADA" };
  }

  /* ================================================================ GERAR */
  function carimboSvg(P, pr, folha, geo, empObj, logo, rotuloFolha) {
    var L = P.carimboRA(pr, folha, null, empObj || null, geo, { logos: logo ? 1 : 0 }), cam = P.CAMADAS_CARIMBO_RA, A = P.ALT_MAIUSCULA, k = geo.carimbo, s = [];
    var COR_DESTAQUE = "#00406A", COR_CAMADA = { "RA-CARIMBO-ROTULO": "#444", "RA-CARIMBO-DESTAQUE": COR_DESTAQUE };
    function pena(c0) { return r2((cam[c0] || [0, 0.18])[1]); }
    s.push('<g transform="translate(' + r2(k.x) + " " + r2(k.y) + ')" font-family="Arial,Helvetica,sans-serif" data-carimbo="RA" style="white-space:pre">');
    s.push('<rect x="0" y="0" width="' + r2(L.w) + '" height="' + r2(L.h) + '" fill="#fff"/>');
    if (logo) L.logos.forEach(function (b) { s.push('<image href="' + esc(logo) + '" x="' + r2(b.x) + '" y="' + r2(b.y) + '" width="' + r2(b.w) + '" height="' + r2(b.h) + '" preserveAspectRatio="xMidYMid meet"/>'); });
    L.retangulos.forEach(function (q) { s.push('<rect x="' + r2(q.x) + '" y="' + r2(q.y) + '" width="' + r2(q.w) + '" height="' + r2(q.h) + '" fill="none" stroke="#111" stroke-width="' + pena(q.camada) + '"/>'); });
    L.linhas.forEach(function (l) { s.push('<line x1="' + r2(l.x1) + '" y1="' + r2(l.y1) + '" x2="' + r2(l.x2) + '" y2="' + r2(l.y2) + '" stroke="' + (l.camada === "RA-CARIMBO-DESTAQUE" ? COR_DESTAQUE : "#111") + '" stroke-width="' + pena(l.camada) + '"/>'); });
    L.textos.forEach(function (t) {
      var ts = t.campo === "folha" && rotuloFolha ? rotuloFolha : t.s;
      s.push('<text x="' + r2(t.x) + '" y="' + r2(t.y) + '" font-size="' + r2(t.h / A) + '" text-anchor="' + (t.al === "C" ? "middle" : "start") + '" fill="' + (COR_CAMADA[t.camada] || "#111") + '"' +
        (t.negrito ? ' font-weight="bold"' : "") + (t.campo ? ' data-cr="' + t.campo + '"' : "") + ">" + esc(ts) + "</text>");
    });
    s.push("</g>");
    return s.join("");
  }

  function blocosColuna(r, op, tipo, avisos) {
    var cf = (r.paredes[0] && r.paredes[0].pag && r.paredes[0].pag.cfg) || {}, pa = r.parametros || {}, bl = [], F = BlocokExec.FONTES || {}, D0 = BlocokExec.DIRETRIZ || {};
    var leg = [];
    if (tipo === "pag") {
      leg.push({ titulo: "LEGENDA", itens: [
        "Número da peça: parede-ordem (ex.: P1-23). Abaixo dele, em peça cortada: largura x altura em cm e o tipo: M meia, R recorte, L recorte em L (sem indicação = inteira 90 x 90).",
        "Faixa hachurada com identificação: EPS retirado e concreto armado (PL pilarete, V verga, CV contraverga, CR cinta de respaldo).",
        "Retângulo tracejado: vão (PT porta, JN janela). F1, F2...: número da fiada.",
        "Cotas em cm; origem no eixo inicial da parede (x = 0)."
      ] });
    }
    bl = bl.concat(leg);
    bl.push({ titulo: "NOTAS", numerar: true, itens: [
      "Painel Blocok 90 x 90 cm: núcleo de EPS e duas faces de microconcreto de " + cmTxt(cf.face || 0.015) + " cm; junta de " + cmTxt(cf.junta || 0.015) + " cm nos dois sentidos; assentamento em amarração (transpasse mínimo " + Math.round((cf.transpasseMin || 0.33) * 100) + " % da peça).",
      "Concreto dos reforços fck " + txt(pa.fck) + " MPa; aço CA-50 e CA-60; CAA " + txt(pa.caa) + ". Cobrimento: NBR 6118 Tab. 7.2.",
      "Espaçamento máximo entre elementos estruturais " + br(D0.espacamentoEstruturaMax || 4, 1) + " m; encunhamento mínimo " + cmTxt(D0.encunhamentoMin || 0.03) + " cm; ligação à estrutura com ancoragem mínima de " + cmTxt(D0.ancoragemLigacao || 0.15) + " cm.",
      "Pesos das peças: " + txt(F.peso) + ".",
      "Armadura do quantitativo = armadura calculada (NBR 6118) de pilaretes, vergas e cinta (inferior, superior nos apoios e lateral); contraverga e porta-estribo seguem construtivos. Divergência com o quadro de reforços é sinalizada na coluna SITUAÇÃO."
    ] });
    var nm = r.normas || {}, ns = Object.keys(nm).map(function (k) { return nm[k]; });
    if (ns.length) bl.push({ titulo: "NORMAS UTILIZADAS", numerar: true, itens: ns });
    void op; void avisos; return bl;
  }
  /* exemplos desenhados da LEGENDA de paginação (hachura, vão, faixa) */
  function exemplosLegenda(D, x, y, h) {
    if (!D) return 14;
    var T = PADRAO.textos;
    D.ret(x, y + 2, 18, 6, "EST-FORMA-CORTE"); D.hachRet(x, y + 2, 18, 6, PADRAO.hachuras.espaco);
    D.texto(x + 22, y + 6.6, "faixa de reforço", h, "EST-TEXTO", { al: "E" });
    D.ret(x + 80, y + 2, 18, 6, "EST-OCULTA"); D.texto(x + 102, y + 6.6, "vão", h, "EST-TEXTO", { al: "E" });
    void T; return 12;
  }

  function gerar(r, op) {
    op = op || {};
    var avisos = [];
    if (!r || !r.paredes || !r.paredes.length) return { ok: false, folhas: [], avisos: ["Resultado do Blocok vazio: calcule a obra antes de gerar as pranchas."] };
    if (!Prancha || !Prancha.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var formato = Prancha.FORMATOS[op.formato] ? op.formato : PADRAO.formato, geo = Prancha.geometria(formato, "paisagem", "RA");
    if (formato !== "A1" && formato !== "A0") aviso(avisos, "Formato " + formato + ": as pranchas do Blocok foram conferidas em A1; em folha menor os quadros podem não caber.");
    var codigo = txt(op.codigo).trim() || "BLK", rev = (txt(op.revisao).trim() || "R00").toUpperCase(), data = txt(op.data).trim() || hoje();
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var aco = montarAco(r);
    /* lista de folhas (cada uma com a função que desenha) */
    var defs = [];
    defs.push({ id: "locacao", titulo: "LOCAÇÃO DOS REFORÇOS E QUADRO DE PILARETES E VERGAS", tipo: "loc", fn: function (D, rot) { return desenharLocacao(D, r, geo, op, avisos, rot); } });
    var pg = folhasPaginacao(r, geo, avisos);
    pg.forEach(function (f, i) {
      var ids = f.blocos.map(function (b) { return b.w.pag.id; }).join(" E ");
      var escs = f.blocos.map(function (b) { return b.m.esc; }), igual = escs.every(function (e0) { return e0 === escs[0]; });
      defs.push({ id: "paginacao-" + (i + 1), titulo: "PAGINAÇÃO - " + ids, tipo: "pag", escala: igual ? "1:" + escs[0] : "INDICADA",
        fn: function (D, rot) { f.blocos.forEach(function (b) { desenharParede(D, b.w, b.m, geo.area.x, b.y, avisos); }); return { escala: igual ? "1:" + escs[0] : "INDICADA" }; } });
    });
    defs.push({ id: "detalhes", titulo: "DETALHES TÍPICOS", tipo: "det", fn: function (D) { return desenharDetalhes(D, r, geo, avisos); } });
    /* a tabela de aço pode ocupar mais de uma folha */
    var planoA = planoAco(aco, geo), nAco = Math.max(1, planoA.folhas.length);
    for (var ia = 0; ia < nAco; ia++) {
      (function (n) { defs.push({ id: "aco-" + n, titulo: "TABELA DE AÇO" + (nAco > 1 ? " - " + n + "/" + nAco : ""), tipo: "aco", fn: function (D) { return desenharAco(D, r, geo, avisos, aco, { n: n, total: nAco }, planoA); } }); })(ia + 1);
    }
    var nTot = defs.length;
    var pr = Prancha.normalizar({ id: "blokpranchas", nome: "Blocok - projeto executivo de alvenaria", formato: formato, orientacao: "paisagem", origem: "blocok",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional),
        obra: txt(op.obra), proprietario: txt(op.proprietario), contratante: txt(op.contratante), local: txt(op.local), codigo: codigo, data: data,
        revisoes: [[revNum, txt(op.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: defs.map(function (d, i) { return { id: d.id, n: i + 1, conteudo: d.titulo, escala: d.escala || "indicada", numero: codigo + " " + rev }; }) });
    var folhas = [], W = geo.papel.w, H = geo.papel.h, M = geo.moldura;
    defs.forEach(function (def, i) {
      var D = new Desenho(), res = {}, rotulo = dois(i + 1);
      try { res = def.fn(D, rotulo + "/" + dois(nTot)) || {}; } catch (e) { aviso(avisos, "Folha " + rotulo + " (" + def.titulo + "): " + (e && e.message ? e.message : e) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); }
      if (D.avisos) D.avisos.forEach(function (s) { aviso(avisos, "Folha " + rotulo + ": " + s); });
      colunaNotas(D, geo, blocosColuna(r, op, def.tipo, avisos).map(function (b, ix) { if (def.tipo === "pag" && ix === 0) b.exemplos = exemplosLegenda; return b; }), avisos, rotulo);
      var fl = pr.folhas[i], escala = res.escala || def.escala || "INDICADA";
      fl.escala = escala.toLowerCase() === "indicada" ? "indicada" : escala;
      var numero = codigo + "-" + rotulo, rotuloFolha = rotulo + "/" + dois(nTot);
      var frame = '<rect x="' + M.x + '" y="' + M.y + '" width="' + M.w + '" height="' + M.h + '" fill="none" stroke="#111" stroke-width="0.7"/>' +
        '<line x1="' + geo.coluna.x + '" y1="' + geo.coluna.y + '" x2="' + geo.coluna.x + '" y2="' + geo.carimbo.y + '" stroke="#111" stroke-width="0.5"/>';
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" font-family="' + PADRAO.fonte + '" data-folha="' + def.id + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + def.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' +
        '<g data-corpo="1">' + D.svg() + "</g>" + frame + carimboSvg(Prancha, pr, fl, geo, empObj, op.logo || null, rotuloFolha) + "</svg>";
      var f = { id: def.id, rotulo: rotulo, numero: numero, titulo: def.titulo, formato: formato, escala: escala, svg: svg,
        entidades: D.e, caixasTexto: D.cx, segmentosCota: D.cs, _pr: pr, _folhaPr: fl, _geo: geo };
      f.sobreposicoes = sobreposicoes(f);
      if (f.sobreposicoes.length) aviso(avisos, "Folha " + numero + ": " + f.sobreposicoes.length + " sobreposição(ões) de texto (ex.: '" + f.sobreposicoes[0].a + "' x '" + f.sobreposicoes[0].b + "').");
      if (/NaN|undefined/.test(svg)) aviso(avisos, "Folha " + numero + ": há valor inválido (NaN/undefined) no desenho.");
      folhas.push(f);
    });
    /* pendências e divergências que o desenho revela (não decide: só informa) */
    var dif = 0, sem = 0;
    r.paredes.forEach(function (w) { if (w.pag && w.pag.reforcos) reforcosDe(w).forEach(function (x) { if (x.status === "difere") dif++; if (x.status === "sem cálculo") sem++; }); });
    if (dif) aviso(avisos, "Armadura calculada (NBR 6118) DIFERE do quantitativo do motor executivo em " + dif + " elemento(s): a tabela de aço usa o quantitativo (confere com BlocokExec.consolidar); o quadro de reforços mostra as duas. Conferir antes de emitir.");
    if (sem) aviso(avisos, sem + " elemento(s) de reforço sem cálculo (ex.: contravergas): armadura só construtiva.");
    aviso(avisos, "Pendências do desenho: bitola/comprimento do grampo, material do encunhamento, espessura das camadas do tratamento, cobrimento exato e disposição das barras — marcados [a definir] nos detalhes.");
    return { ok: true, folhas: folhas, avisos: avisos, dados: { aco: aco, padrao: PADRAO } };
  }

  return { PADRAO: PADRAO, gerar: gerar, sobreposicoes: sobreposicoes, Desenho: Desenho, montarAco: montarAco, quadroReforcos: quadroReforcos, parseArm: parseArm, grau: grau };
});



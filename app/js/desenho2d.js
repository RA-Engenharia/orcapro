/* =====================================================================
 * desenho2d.js — PLANTA E CORTE COMO DESENHO TÉCNICO (07/10/2026)
 *
 * Pedido do Rogério: a planta baixa como desenho técnico — corte em linha,
 * alta qualidade, opção de linha mais fina ou mais grossa, cortes A,
 * B, C, D na lateral, cota com estilo de cota, opção de tirar a cota.
 *
 * Este arquivo é o MOTOR PURO (Node-testável, sem DOM e sem three.js):
 *   entra  → os DADOS do desenho, já em coordenadas de TELA em metros
 *            (X para a direita, Y para BAIXO), vindos de BIM.vista2d:
 *            { tipo:'planta'|'corte', cortes:[{pts:[[x,y]..], fechado}],
 *              linhas:[[x1,y1,x2,y2]..], niveis:[{nome, y, cota}],
 *              marcas:[{id, letra, a:[x,y], b:[x,y], olhar:[dx,dy]}] }
 *   sai    → as COTAS (lista de objetos) e o SVG pronto.
 *
 * PENAS: espessura de tela em pixels (vector-effect: non-scaling-stroke) —
 * a linha fica nítida e com a mesma espessura em qualquer zoom.
 * Três jogos: fina / média / grossa. O que é CORTADO sai na pena
 * grossa do jogo; o que é VISTO além do corte, na fina.
 * ANOTAÇÃO (cota, marca de corte, nível, título) tem tamanho de PAPEL: mm na
 * escala da vista (1:50 → 1 mm de papel = 0,05 m) — trocar a
 * escala da vista aumenta ou diminui a anotação, não o desenho.
 * Teste: node tools/test-desenho2d.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PENAS = {
    fina:   { rotulo: "Fina",   corte: 1.6, vista: 0.55, cota: 0.6, marca: 0.9 },
    media:  { rotulo: "Média",  corte: 2.4, vista: 0.9,  cota: 0.8, marca: 1.2 },
    grossa: { rotulo: "Grossa", corte: 3.4, vista: 1.3,  cota: 1.1, marca: 1.6 }
  };
  var PREENCHIMENTOS = {
    hachura: "Hachura 45°", solido: "Sólido escuro", cinza: "Cinza claro", vazio: "Sem preenchimento"
  };
  var MARCAS_COTA = { obliquo: "Traço oblíquo", seta: "Seta", ponto: "Ponto" };
  var UNIDADES = { m: "metros (3,45)", cm: "centímetros (345)", mm: "milímetros (3450)" };
  var ESCALAS = [20, 25, 50, 75, 100, 125, 200];
  /* P2-D (js/bimambienteui.js): "Esquema de cores" da vista */
  var ESQUEMAS = { nenhum: "Nenhum", nome: "Por nome", departamento: "Por departamento" };

  function estiloPadrao() {
    return { escala: 50, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo",
             textoCota: 2.5, unidade: "m", casas: 2, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true,
             /* P2-D: ambientes na planta — identificador (nome; número · área) e esquema de cores */
             identAmbiente: true, esquemaCores: "nenhum" };
  }
  function normEstilo(e) {
    var p = estiloPadrao(), o = {};
    Object.keys(p).forEach(function (k) { o[k] = (e && e[k] != null) ? e[k] : p[k]; });
    if (!PENAS[o.pena]) o.pena = "media";
    if (!PREENCHIMENTOS[o.preenchimento]) o.preenchimento = "hachura";
    if (!MARCAS_COTA[o.marcaCota]) o.marcaCota = "obliquo";
    if (!UNIDADES[o.unidade]) o.unidade = "m";
    o.escala = Math.max(1, +o.escala || 50);
    o.textoCota = Math.max(1, Math.min(6, +o.textoCota || 2.5));
    o.casas = Math.max(0, Math.min(3, Math.round(+o.casas)));
    if (isNaN(o.casas)) o.casas = 2;
    o.cotas = !!o.cotas; o.cotaParcial = !!o.cotaParcial; o.niveis = !!o.niveis; o.marcasCorte = !!o.marcasCorte; o.titulo = !!o.titulo;
    o.identAmbiente = o.identAmbiente !== false && o.identAmbiente !== "false";
    if (!ESQUEMAS[o.esquemaCores]) o.esquemaCores = "nenhum";
    return o;
  }

  /* ----------------------------------------------------------- números */
  function fmtNum(v, casas) {
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas);
    var neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    var p = s.split("."), int = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + int + (p[1] ? "," + p[1] : "");
  }
  /* medida em metros → texto na unidade da cota */
  function fmtMedida(m, est) {
    var e = normEstilo(est);
    if (e.unidade === "cm") return fmtNum(m * 100, e.casas > 1 ? 0 : e.casas);
    if (e.unidade === "mm") return fmtNum(m * 1000, 0);
    return fmtNum(m, e.casas);
  }
  function fmtCota(y) { return (y > 0.0005 ? "+" : y < -0.0005 ? "" : "±") + fmtNum(Math.abs(y) < 0.0005 ? 0 : y, 2); }

  /* agrupa valores a menos de `tol` (média do grupo), ordenado */
  function agrupar(vals, tol) {
    var v = vals.slice().sort(function (a, b) { return a - b; }), out = [], grupo = [];
    v.forEach(function (x) {
      if (grupo.length && x - grupo[grupo.length - 1] > tol) { out.push(media(grupo)); grupo = []; }
      grupo.push(x);
    });
    if (grupo.length) out.push(media(grupo));
    return out;
  }
  function media(a) { var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }

  /* caixa de tudo o que foi desenhado */
  function caixa(d) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function p(x, y) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    (d.cortes || []).forEach(function (c) { (c.pts || []).forEach(function (q) { p(q[0], q[1]); }); });
    (d.linhas || []).forEach(function (l) { p(l[0], l[1]); p(l[2], l[3]); });
    /* PORTA (js/simboloporta.js): a folha aberta e o arco do giro também ocupam o papel */
    (d.portas || []).forEach(function (sp) { pontosPorta(sp).forEach(function (q) { p(q[0], q[1]); }); });
    if (b.x0 === Infinity) return null;
    return b;
  }

  /* ------------------------------------------------------------- cotas
   * As faces do que foi CORTADO viram cota em cadeia (cotar paredes) e a soma vira a cota total, na linha de fora. Na planta: em cima
   * (posições X das faces verticais) e à esquerda (posições Y das faces
   * horizontais). No corte: embaixo (largura) e à direita (alturas das faces
   * horizontais cortadas + níveis).
   * Cada cota = { eixo:'h'|'v', a, b (posições no eixo), base (onde a peça
   * está, do lado da cota), linha (onde a linha de cota passa), valor }. */
  /* `lado` (opcional) limita às peças cortadas que encostam naquele lado da
     caixa — 'cima'|'baixo'|'esq'|'dir' — até `faixa` metros para dentro: é a
     parede de FORA, a que a cota em cadeia de fachada mede (vão, pano, vão…). */
  function facesCortadas(d, eixo, lado, faixa) {
    var pos = [], cx = lado ? (caixa({ cortes: d.cortes }) || caixa(d)) : null, fx = faixa || 0.8;
    (d.cortes || []).forEach(function (c) {
      if (cx) {
        var by0 = Infinity, by1 = -Infinity, bx0 = Infinity, bx1 = -Infinity;
        (c.pts || []).forEach(function (q) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < by0) by0 = q[1]; if (q[1] > by1) by1 = q[1]; });
        if (lado === "cima" && by0 > cx.y0 + fx) return;
        if (lado === "baixo" && by1 < cx.y1 - fx) return;
        if (lado === "esq" && bx0 > cx.x0 + fx) return;
        if (lado === "dir" && bx1 < cx.x1 - fx) return;
      }
      var pts = c.pts || [], n = pts.length, lim = c.fechado ? n : n - 1;
      for (var i = 0; i < lim; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        var dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), L = Math.sqrt(dx * dx + dy * dy);
        if (L < 0.05) continue;
        if (eixo === "x" && dx < 0.012) pos.push((a[0] + b[0]) / 2);   /* face vertical → posição X */
        if (eixo === "y" && dy < 0.012) pos.push((a[1] + b[1]) / 2);   /* face horizontal → posição Y */
      }
    });
    return agrupar(pos, 0.015);
  }
  function cotasDe(d, est) {
    var e = normEstilo(est), cx = caixa(d), out = [];
    if (!cx || !e.cotas) return out;
    var k = e.escala / 1000, passo = 7 * k, folga = 9 * k;   /* 7 mm do desenho à 1ª linha; 7 mm entre linhas */
    function cadeia(eixo, posicoes, base, sentido, fila, min, max) {
      var linha = base + sentido * (folga + passo * fila);
      if (posicoes.length >= 3 && e.cotaParcial && posicoes.length <= 80) {
        for (var i = 0; i + 1 < posicoes.length; i++) {
          var a = posicoes[i], b = posicoes[i + 1];
          if (b - a < 0.04) continue;
          out.push({ eixo: eixo, a: a, b: b, base: base, linha: linha, valor: b - a, parcial: true });
        }
        linha = base + sentido * (folga + passo * (fila + 1));
      }
      if (max - min > 0.02) out.push({ eixo: eixo, a: min, b: max, base: base, linha: linha, valor: max - min, parcial: false });
    }
    if (d.tipo === "corte") {
      var xs = [cx.x0, cx.x1];
      cadeia("h", agrupar(xs, 0.015), cx.y1, +1, 0, cx.x0, cx.x1);
      /* alturas: faces horizontais cortadas da faixa da direita (laje, piso, verga…) + os níveis */
      var ys = facesCortadas(d, "y", "dir", 1.5);
      (d.niveis || []).forEach(function (n) { if (n.y >= cx.y0 - 0.01 && n.y <= cx.y1 + 0.01) ys.push(n.y); });
      ys = agrupar(ys.concat([cx.y0, cx.y1]), 0.03);
      cadeia("v", ys, cx.x1, +1, 0, cx.y0, cx.y1);
    } else {
      /* fachada de cima e lateral esquerda: a parede de fora, vão a vão */
      /* mede o que foi CORTADO (as paredes), com a linha de cota por fora de tudo */
      var cc = caixa({ cortes: d.cortes }) || cx;
      var px = agrupar(facesCortadas(d, "x", "cima", 0.8).concat([cc.x0, cc.x1]), 0.015);
      cadeia("h", px, cx.y0, -1, 0, cc.x0, cc.x1);
      var py = agrupar(facesCortadas(d, "y", "esq", 0.8).concat([cc.y0, cc.y1]), 0.015);
      cadeia("v", py, cx.x0, -1, 0, cc.y0, cc.y1);
    }
    return out;
  }

  /* ---------------------------------------------------------------- SVG */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function n4(v) { return Math.round(v * 10000) / 10000; }
  function caminho(pts, fecha, arcos) {
    if (!pts || pts.length < 2) return "";
    var s = "M" + n4(pts[0][0]) + " " + n4(pts[0][1]);
    if (!arcos) { for (var i = 1; i < pts.length; i++) s += "L" + n4(pts[i][0]) + " " + n4(pts[i][1]); return s + (fecha ? "Z" : ""); }
    /* CURVA: arcos[k] = { r, grande, horario, n } — as n arestas a partir do ponto k são UM arco
       (js/bimcurva.js cortePlanta): sai o comando A do SVG até o ponto k + n; quem não lê `arcos`
       (recorte, cotas) vê as cordas de 2 mm nos pontos */
    var N = pts.length, lim = fecha ? N : N - 1, k = 0;
    while (k < lim) {
      var a = arcos[k], m = a && a.n > 0 ? a.n : 1, t = (k + m) % N, q = pts[t];
      if (a && a.r > 0) s += "A" + n4(a.r) + " " + n4(a.r) + " 0 " + (a.grande ? 1 : 0) + " " + (a.horario ? 1 : 0) + " " + n4(q[0]) + " " + n4(q[1]);
      else if (!(fecha && t === 0)) s += "L" + n4(q[0]) + " " + n4(q[1]);
      k += m;
    }
    return s + (fecha ? "Z" : "");
  }
  var NS = 'vector-effect="non-scaling-stroke"';
  /* TEXTO: o desenho está em METROS, e a letra de uma cota mede 0,1 m. Com
     font-size < 1 o navegador arredonda o espaço entre letras e a cota sai
     "1 5 , 2 5". Por isso a letra é desenhada em corpo 100 e ENCOLHIDA por
     transform (scale) — mesmo tamanho final, espaçamento certo. */
  function txt(x, y, h, conteudo, cls, ancora, rot) {
    var s = h / 100;
    return '<text x="0" y="0" font-size="100"' + (ancora ? ' text-anchor="' + ancora + '"' : "") +
      ' transform="translate(' + n4(x) + " " + n4(y) + ")" + (rot ? " rotate(" + rot + ")" : "") + " scale(" + (Math.round(s * 1e7) / 1e7) + ')" class="' + cls + '">' + conteudo + "</text>";
  }

  function svgCota(c, e, pena) {
    var k = e.escala / 1000, h = e.textoCota * k, ext = 2 * k, gap = 1.5 * k, tk = 1.6 * k;
    var s = "", t = esc(fmtMedida(c.valor, e)), mid = (c.a + c.b) / 2, sent = c.linha >= c.base ? 1 : -1;
    function ln(x1, y1, x2, y2, w) { return '<line x1="' + n4(x1) + '" y1="' + n4(y1) + '" x2="' + n4(x2) + '" y2="' + n4(y2) + '" stroke-width="' + w + '" ' + NS + "/>"; }
    function marca(x, y, ang) {
      if (e.marcaCota === "ponto") return '<circle cx="' + n4(x) + '" cy="' + n4(y) + '" r="' + n4(0.7 * k) + '" class="d2-cota-pt"/>';
      if (e.marcaCota === "seta") {
        var L = 2.6 * k, W = 0.9 * k, ca = Math.cos(ang), sa = Math.sin(ang);
        var p1 = [x - ca * L - sa * W, y - sa * L + ca * W], p2 = [x - ca * L + sa * W, y - sa * L - ca * W];
        return '<path d="M' + n4(x) + " " + n4(y) + "L" + n4(p1[0]) + " " + n4(p1[1]) + "L" + n4(p2[0]) + " " + n4(p2[1]) + 'Z" class="d2-cota-pt"/>';
      }
      return ln(x - tk * 0.7071, y + tk * 0.7071, x + tk * 0.7071, y - tk * 0.7071, pena.marca);
    }
    if (c.eixo === "h") {
      var y = c.linha;
      s += ln(c.a, c.base + sent * gap, c.a, y + sent * ext, pena.cota) + ln(c.b, c.base + sent * gap, c.b, y + sent * ext, pena.cota);
      s += ln(c.a - (e.marcaCota === "obliquo" ? ext : 0), y, c.b + (e.marcaCota === "obliquo" ? ext : 0), y, pena.cota);
      s += marca(c.a, y, Math.PI) + marca(c.b, y, 0);
      s += txt(mid, y - 0.8 * k, h, t, "d2-cota-tx", "middle");
    } else {
      var x = c.linha;
      s += ln(c.base + sent * gap, c.a, x + sent * ext, c.a, pena.cota) + ln(c.base + sent * gap, c.b, x + sent * ext, c.b, pena.cota);
      s += ln(x, c.a - (e.marcaCota === "obliquo" ? ext : 0), x, c.b + (e.marcaCota === "obliquo" ? ext : 0), pena.cota);
      s += marca(x, c.a, -Math.PI / 2) + marca(x, c.b, Math.PI / 2);
      s += txt(x - 0.8 * k, mid, h, t, "d2-cota-tx", "middle", -90);
    }
    return '<g class="d2-cota' + (c.parcial ? " d2-parcial" : "") + '">' + s + "</g>";
  }

  /* COTA ALINHADA do modelador (B3): a cota permanente do editor, em qualquer
     direção. c = { a:[x,y], b:[x,y], off (m, lado esquerdo de A→B na planta), valor }.
     O mesmo traço da cota da planta: chamadas, linha, marca e texto. */
  function svgCotaAlinhada(c, e, pena) {
    var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.sqrt(dx * dx + dy * dy); if (!(L > 1e-6)) return "";
    var k = e.escala / 1000, h = e.textoCota * k, ux = dx / L, uy = dy / L, nx = dy / L, ny = -dx / L, off = +c.off || 0, sg = off >= 0 ? 1 : -1, tk = 1.6 * k, gap = 1.5 * k, ext = 2 * k;
    var l1 = [c.a[0] + nx * off, c.a[1] + ny * off], l2 = [c.b[0] + nx * off, c.b[1] + ny * off];
    function ln(x1, y1, x2, y2, w) { return '<line x1="' + n4(x1) + '" y1="' + n4(y1) + '" x2="' + n4(x2) + '" y2="' + n4(y2) + '" stroke-width="' + w + '" ' + NS + "/>"; }
    var s = ln(c.a[0] + nx * gap * sg, c.a[1] + ny * gap * sg, l1[0] + nx * ext * sg, l1[1] + ny * ext * sg, pena.cota) +
            ln(c.b[0] + nx * gap * sg, c.b[1] + ny * gap * sg, l2[0] + nx * ext * sg, l2[1] + ny * ext * sg, pena.cota) +
            ln(l1[0] - ux * ext, l1[1] - uy * ext, l2[0] + ux * ext, l2[1] + uy * ext, pena.cota);
    [l1, l2].forEach(function (q) { s += ln(q[0] - (ux + nx) * tk * 0.5, q[1] - (uy + ny) * tk * 0.5, q[0] + (ux + nx) * tk * 0.5, q[1] + (uy + ny) * tk * 0.5, pena.marca); });
    var ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;   /* texto nunca de cabeça para baixo */
    var mx = (l1[0] + l2[0]) / 2 + nx * 0.8 * k * sg, my = (l1[1] + l2[1]) / 2 + ny * 0.8 * k * sg;
    s += txt(mx, my, h, esc(fmtMedida(c.valor != null ? c.valor : L, e)), "d2-cota-tx", "middle", n4(ang));
    return '<g class="d2-cota d2-cota-modelo">' + s + "</g>";
  }

  /* marca de corte na planta: traço-ponto além das pontas + cabeça (círculo
     com a letra) e seta para o lado que se olha, nas duas pontas */
  function svgMarcaCorte(m, e, pena) {
    var k = e.escala / 1000, R = 4 * k, a = m.a, b = m.b;
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
    var ox = (m.olhar && m.olhar[0]) || -uy, oy = (m.olhar && m.olhar[1]) || ux;
    var s = '<line x1="' + n4(a[0]) + '" y1="' + n4(a[1]) + '" x2="' + n4(b[0]) + '" y2="' + n4(b[1]) + '" stroke-width="' + pena.marca + '" ' + NS + ' stroke-dasharray="' + n4(8 * k) + " " + n4(1.5 * k) + " " + n4(1 * k) + " " + n4(1.5 * k) + '" class="d2-eixo"/>';
    [a, b].forEach(function (p, i) {
      var cx = p[0] - (i ? -1 : 1) * ux * R * 1.2, cy = p[1] - (i ? -1 : 1) * uy * R * 1.2;
      var tip = [cx + ox * R * 1.9, cy + oy * R * 1.9], l1 = [cx + ux * R * 0.9, cy + uy * R * 0.9], l2 = [cx - ux * R * 0.9, cy - uy * R * 0.9];
      s += '<path d="M' + n4(l1[0]) + " " + n4(l1[1]) + "L" + n4(tip[0]) + " " + n4(tip[1]) + "L" + n4(l2[0]) + " " + n4(l2[1]) + 'Z" class="d2-marca-seta"/>';
      s += '<circle cx="' + n4(cx) + '" cy="' + n4(cy) + '" r="' + n4(R) + '" stroke-width="' + pena.marca + '" ' + NS + ' class="d2-marca-circ"/>';
      s += txt(cx, cy + 1.1 * k, 3.2 * k, esc(m.letra), "d2-marca-tx", "middle");
    });
    return '<g class="d2-marca" data-d2-corte="' + esc(m.id) + '">' + s + "</g>";
  }

  /* EIXO da grade (B2, js/bimarq.js): traço-ponto de ponta a ponta e a bolinha
     com o nome além de cada ponta. Planta: { nome, a:[x,y], b:[x,y] }; corte:
     { nome, x } (linha vertical na altura do desenho, bolinha em cima). */
  function svgEixo(ex, cx, e, pena) {
    var k = e.escala / 1000, R = 4 * k, s = "", a = ex.a, b = ex.b, cent = [];
    if (!a) { a = [ex.x, cx.y1 + 4 * k]; b = [ex.x, cx.y0 - 4 * k]; }
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
    s += '<line x1="' + n4(a[0]) + '" y1="' + n4(a[1]) + '" x2="' + n4(b[0]) + '" y2="' + n4(b[1]) + '" stroke-width="' + pena.marca + '" ' + NS + ' stroke-dasharray="' + n4(8 * k) + " " + n4(1.5 * k) + " " + n4(1 * k) + " " + n4(1.5 * k) + '" class="d2-eixo"/>';
    if (ex.a) cent = [[a[0] - ux * R, a[1] - uy * R], [b[0] + ux * R, b[1] + uy * R]]; else cent = [[b[0], b[1] - R]];
    cent.forEach(function (c) {
      s += '<circle cx="' + n4(c[0]) + '" cy="' + n4(c[1]) + '" r="' + n4(R) + '" stroke-width="' + pena.marca + '" ' + NS + ' class="d2-marca-circ"/>';
      s += txt(c[0], c[1] + 1.1 * k, 3.2 * k, esc(ex.nome), "d2-marca-tx", "middle");
    });
    return '<g class="d2-eixo-g" data-d2-eixo="' + esc(ex.id || ex.nome) + '">' + s + "</g>";
  }

  function svgNivel(nv, cx, e, pena) {
    var k = e.escala / 1000, x = cx.x1 + 22 * k, s = "";
    s += '<line x1="' + n4(cx.x0 - 3 * k) + '" y1="' + n4(nv.y) + '" x2="' + n4(x + 12 * k) + '" y2="' + n4(nv.y) + '" stroke-width="' + pena.cota + '" ' + NS + ' stroke-dasharray="' + n4(4 * k) + " " + n4(1.5 * k) + '" class="d2-nivel-l"/>';
    var t = 1.8 * k;
    s += '<path d="M' + n4(x) + " " + n4(nv.y) + "L" + n4(x - t) + " " + n4(nv.y - t * 1.4) + "L" + n4(x + t) + " " + n4(nv.y - t * 1.4) + 'Z" class="d2-nivel-tri"/>';
    s += txt(x + 2.6 * k, nv.y - 1.6 * k, 2.5 * k, esc(nv.nome) + " " + esc(fmtCota(nv.cota != null ? nv.cota : -nv.y)), "d2-nivel-tx");
    return '<g class="d2-nivel">' + s + "</g>";
  }

  /* desenho → SVG. `extra.titulo` = nome da vista. Devolve { svg, caixa, cotas } */
  function svg(d, est, extra) {
    var e = normEstilo(est), pena = PENAS[e.pena], k = e.escala / 1000;
    var cx = caixa(d) || { x0: 0, y0: 0, x1: 1, y1: 1 };
    var cotas = cotasDe(d, e);
    var m = 32 * k;   /* margem de papel para cotas, níveis e marcas */
    var vb = { x: cx.x0 - m, y: cx.y0 - m, w: (cx.x1 - cx.x0) + 2 * m + (d.tipo === "corte" && e.niveis ? 75 * k : 0), h: (cx.y1 - cx.y0) + 2 * m + (e.titulo ? 10 * k : 0) };
    /* vínculo CAD (DWG/DXF): fica FORA da caixa das cotas (cota mede o modelo),
       mas o papel cresce para ele caber inteiro */
    var cad = d.cad || [], cadPath = "", cadTx = "";
    if (cad.length) {
      var q = { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h };
      cad.forEach(function (v) {
        var s = v.seg || [];
        for (var i = 0; i + 3 < s.length; i += 4) {
          cadPath += "M" + n4(s[i]) + " " + n4(s[i + 1]) + "L" + n4(s[i + 2]) + " " + n4(s[i + 3]);
          if (s[i] < q.x0) q.x0 = s[i]; if (s[i] > q.x1) q.x1 = s[i]; if (s[i + 2] < q.x0) q.x0 = s[i + 2]; if (s[i + 2] > q.x1) q.x1 = s[i + 2];
          if (s[i + 1] < q.y0) q.y0 = s[i + 1]; if (s[i + 1] > q.y1) q.y1 = s[i + 1]; if (s[i + 3] < q.y0) q.y0 = s[i + 3]; if (s[i + 3] > q.y1) q.y1 = s[i + 3];
        }
        (v.tx || []).forEach(function (t) { cadTx += txt(t[0], t[1], 2.2 * k, esc(t[2]), "d2-cad-tx"); });
      });
      vb = { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 };
    }
    /* eixos (B2): o papel cresce para as bolinhas caberem */
    var eixos = d.eixos || [];
    if (eixos.length) {
      var qe = { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h }, Re = 9 * k;
      eixos.forEach(function (ex) {
        (ex.a ? [ex.a, ex.b] : [[ex.x, cx.y0 - 4 * k - 2 * Re]]).forEach(function (pp) {
          if (pp[0] - Re < qe.x0) qe.x0 = pp[0] - Re; if (pp[0] + Re > qe.x1) qe.x1 = pp[0] + Re;
          if (pp[1] - Re < qe.y0) qe.y0 = pp[1] - Re; if (pp[1] + Re > qe.y1) qe.y1 = pp[1] + Re;
        });
      });
      vb = { x: qe.x0, y: qe.y0, w: qe.x1 - qe.x0, h: qe.y1 - qe.y0 };
    }
    /* P2-D: a LEGENDA do esquema de cores fica à direita do desenho: o papel cresce */
    var amb = (d.tipo === "planta" && d.ambientes) ? d.ambientes : null, leg = amb && amb.legenda && (amb.legenda.itens || []).length ? amb.legenda : null, legX = 0;
    if (leg) {
      legX = cx.x1 + 14 * k;
      var nc = Math.max(String(leg.titulo || "").length, leg.itens.reduce(function (mx, it) { return Math.max(mx, String(it.rotulo || "").length + 6); }, 0));
      var lw = 2.6 * k * 0.62 * nc + 4 * k, lh = 9 * k + leg.itens.length * 6 * k;
      var qx = { x0: vb.x, y0: vb.y, x1: Math.max(vb.x + vb.w, legX + lw), y1: Math.max(vb.y + vb.h, cx.y0 + lh) };
      vb = { x: qx.x0, y: qx.y0, w: qx.x1 - qx.x0, h: qx.y1 - qx.y0 };
    }
    /* P7 (js/bimanot.js): a ANOTAÇÃO da vista (cotas por referência, texto, nuvem, linhas e regiões) — o papel cresce para ela */
    var A7 = d.anotP7 && global.BimAnotP7 ? global.BimAnotP7 : null, qa7 = A7 ? A7.caixa(d.anotP7, e) : null;
    if (qa7) { var x7 = Math.min(vb.x, qa7.x0), y7 = Math.min(vb.y, qa7.y0); vb = { x: x7, y: y7, w: Math.max(vb.x + vb.w, qa7.x1) - x7, h: Math.max(vb.y + vb.h, qa7.y1) - y7 }; }
    if (d.marcasP6 && d.marcasP6.length) vb = p6Caixa(d.marcasP6, vb, k);   /* P6: o papel cresce para as marcas de elevação */
    var p = [];
    /* P6 — GANCHO: com `extra.p6` (js/bimmodelovista.js) o corpo do desenho sai pelos
       ESTILOS DE OBJETO RA (pena em mm por categoria, padrão de linha, preenchimento por
       material, meio-tom); sem ele, o desenho de sempre */
    var p6 = extra && extra.p6 ? p6Corpo(d, e, extra.p6) : null;
    p.push('<svg xmlns="http://www.w3.org/2000/svg" class="d2-svg" data-d2-tipo="' + esc(d.tipo) + '" viewBox="' + n4(vb.x) + " " + n4(vb.y) + " " + n4(vb.w) + " " + n4(vb.h) + '" preserveAspectRatio="xMidYMid meet"' + (p6 ? ' data-d2-p6="1"' : "") + ">");
    p.push("<defs>" +
      '<pattern id="d2-hach" patternUnits="userSpaceOnUse" width="' + n4(1.6 * k) + '" height="' + n4(1.6 * k) + '" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="' + n4(1.6 * k) + '" stroke="#1a1a1a" stroke-width="' + n4(0.18 * k) + '"/></pattern>' + (p6 ? p6.defs : "") + "</defs>");
    p.push('<rect x="' + n4(vb.x) + '" y="' + n4(vb.y) + '" width="' + n4(vb.w) + '" height="' + n4(vb.h) + '" class="d2-papel"/>');
    /* 0) vínculo CAD — por baixo de tudo, em meio-tom */
    if (cadPath) p.push('<g class="d2-cad"><path d="' + cadPath + '" class="d2-cad-l" stroke-width="' + n4(pena.vista * 0.8) + '" ' + NS + "/>" + cadTx + "</g>");
    /* 0b) P2-D: a COR de cada ambiente (esquema de cores) — por baixo das linhas */
    if (amb) p.push(svgAmbCores(amb));
    if (p6) p.push(p6.corpo); else {   /* P6: 1) e 2) pelos estilos de objeto RA */
    /* 1) o que se VÊ além do corte — pena fina, por baixo */
    var lin = "";
    (d.linhas || []).forEach(function (l) { lin += "M" + n4(l[0]) + " " + n4(l[1]) + "L" + n4(l[2]) + " " + n4(l[3]); });
    if (lin) p.push('<path d="' + lin + '" class="d2-vista" stroke-width="' + pena.vista + '" ' + NS + "/>");
    /* 2) o que é CORTADO — preenchimento + contorno na pena grossa */
    var fill = e.preenchimento === "hachura" ? "url(#d2-hach)" : e.preenchimento === "solido" ? "#3a3a3a" : e.preenchimento === "cinza" ? "#cfd3d8" : "none";
    var fechados = "", abertos = "", fase = {};
    (d.cortes || []).forEach(function (c) {
      if (c.fase) { var q = fase[c.fase] || (fase[c.fase] = { f: "", a: "" }); if (c.fechado) q.f += caminho(c.pts, true); else q.a += caminho(c.pts, false); return; }   /* P10 */
      if (c.fechado) fechados += caminho(c.pts, true, c.arcos); else abertos += caminho(c.pts, false, c.arcos);   /* CURVA: c.arcos */
    });
    if (fechados) p.push('<path d="' + fechados + '" fill="' + fill + '" fill-rule="evenodd" class="d2-corte" stroke-width="' + pena.corte + '" ' + NS + "/>");
    if (abertos) p.push('<path d="' + abertos + '" fill="none" class="d2-corte" stroke-width="' + pena.corte + '" ' + NS + "/>");
    }
    /* 2a) P10 (js/bimfases.js): GRÁFICOS DE FASE — o existente em meio-tom (cinza, preenchimento claro),
       o demolido TRACEJADO e sem preenchimento, o temporário em traço-ponto */
    p.push(svgFases(fase, d.linhasFase, pena));
    /* 2a') PORTA (js/simboloporta.js): a folha aberta a 90° (pena média) e o arco do giro (pena fina) */
    if (d.portas && d.portas.length) p.push(svgPortas(d.portas, e, pena, extra && extra.p6 ? extra.p6 : null));
    /* 2b) INSTALAÇÕES (B5, js/biminst.js planta): o eixo de cada trecho na cor do
       sistema (acima do corte, tracejado), prumadas, conexões e peças, e o
       rótulo (sistema, DN, inclinação). Pena da vista; a cor é o que separa. */
    if (d.inst) p.push(svgInst(d.inst, k, pena));
    if (A7) p.push(A7.svg(d.anotP7, e, pena, "fundo"));   /* P7: região preenchida e mascaramento, por cima do modelo */
    /* 3) anotação */
    if (d.tipo === "corte" && e.niveis) (d.niveis || []).forEach(function (nv) { p.push(svgNivel(nv, cx, e, pena)); });
    if (d.tipo === "planta" && e.marcasCorte) (d.marcas || []).forEach(function (mc) { p.push(svgMarcaCorte(mc, e, pena)); });
    if (d.marcasP6 && d.marcasP6.length) p.push(p6Marcas(d.marcasP6, e, pena));   /* P6: elevação, chamada de detalhe, recorte */
    eixos.forEach(function (ex) { p.push(svgEixo(ex, cx, e, pena)); });
    cotas.forEach(function (c) { p.push(svgCota(c, e, pena)); });
    if (d.tipo === "planta" && e.cotas) (d.cotasModelo || []).forEach(function (c) { p.push(svgCotaAlinhada(c, e, pena)); });
    /* P2-D: identificador de ambiente (nome; número · área) e a legenda do esquema de cores */
    if (amb) p.push(svgAmbTags(amb, e, pena));
    if (leg) p.push(svgAmbLegenda(leg, legX, cx.y0, k, pena));
    if (A7) p.push(A7.svg(d.anotP7, e, pena, "frente"));   /* P7: cotas, textos, símbolos, nuvens, linhas, componentes, legenda */
    /* P5 (js/bimanot.js): identificadores e o que as próximas partes da anotação puserem (d.anotacao) */
    if (d.tipo === "planta" && d.anotacao) {
      var AN5 = global.BimAnot || (typeof require === "function" ? (function () { try { return require("./bimanot.js"); } catch (eR) { return null; } })() : null);
      if (AN5 && AN5.svgPlanta) p.push(AN5.svgPlanta(d.anotacao, e, pena));
    }
    if (e.titulo && extra && extra.titulo) {
      var ty = cx.y1 + m * 0.62 + (e.titulo ? 6 * k : 0);
      p.push('<g class="d2-titulo">' + txt(cx.x0, ty, 3.4 * k, esc(String(extra.titulo).toUpperCase()), "d2-tit-tx") +
        '<line x1="' + n4(cx.x0) + '" y1="' + n4(ty + 1.2 * k) + '" x2="' + n4(cx.x0 + Math.max(40 * k, (cx.x1 - cx.x0) * 0.4)) + '" y2="' + n4(ty + 1.2 * k) + '" stroke-width="' + pena.corte + '" ' + NS + ' class="d2-tit-l"/>' +
        txt(cx.x0, ty + 4.6 * k, 2.4 * k, "ESC 1:" + e.escala, "d2-tit-esc") + "</g>");
    }
    p.push("</svg>");
    return { svg: p.join(""), caixa: cx, vb: vb, cotas: cotas, estilo: e };
  }

  /* ---------------------------------------------------- FASES (P10)
   * cortes: { status: { f: caminhos fechados, a: abertos } }; linhas: { status: [[x1,y1,x2,y2]…] } */
  var FASE_SVG = {
    existente: { cor: "#8a8a8a", fill: "#e4e4e4", tr: "" },
    demolido: { cor: "#3a3a3a", fill: "none", tr: ' stroke-dasharray="6 4"' },
    temporario: { cor: "#3a3a3a", fill: "none", tr: ' stroke-dasharray="9 3 2 3"' }
  };
  function svgFases(cortesF, linhasF, pena) {
    var s = "";
    Object.keys(linhasF || {}).forEach(function (k) {
      var g = FASE_SVG[k] || FASE_SVG.existente, l = "";
      (linhasF[k] || []).forEach(function (q) { l += "M" + n4(q[0]) + " " + n4(q[1]) + "L" + n4(q[2]) + " " + n4(q[3]); });
      if (l) s += '<path d="' + l + '" fill="none" class="d2-fase d2-fase-' + k + '" stroke="' + g.cor + '"' + g.tr + ' stroke-width="' + pena.vista + '" ' + NS + "/>";
    });
    Object.keys(cortesF || {}).forEach(function (k) {
      var g = FASE_SVG[k] || FASE_SVG.existente, q = cortesF[k];
      if (q.f) s += '<path d="' + q.f + '" fill="' + g.fill + '" fill-rule="evenodd" class="d2-fase d2-fase-' + k + '" stroke="' + g.cor + '"' + g.tr + ' stroke-width="' + pena.corte + '" ' + NS + "/>";
      if (q.a) s += '<path d="' + q.a + '" fill="none" class="d2-fase d2-fase-' + k + '" stroke="' + g.cor + '"' + g.tr + ' stroke-width="' + pena.corte + '" ' + NS + "/>";
    });
    return s;
  }

  /* ---------------------------------------------------- PORTAS
   * d.portas = [{ folhas:[[[x,y]×4]], arcos:[{ c, r, de, ate }], linhas:[[x1,y1,x2,y2]], k? }]
   * (BIM.vista2d, gerado pelo js/simboloporta.js). FOLHA na pena de marca
   * (média), ARCO e seta na pena de vista (fina, projeção) — NBR 8403. O
   * arco sai como o comando A do SVG; o sentido (sweep) vem do produto
   * vetorial (de − c) × (ate − c), então o desenho espelhado continua certo.
   * Com os estilos de objeto (P6): a pena de projeção da categoria no arco e
   * uma acima na folha. As classes levam d2-vista: o DXF (js/bimdxf.js) pula
   * este grupo e desenha a porta pelos DADOS (ARC de verdade). */
  function pontosPorta(sp) {
    var o = [];
    if (!sp) return o;
    (sp.folhas || []).forEach(function (f) { (f || []).forEach(function (q) { o.push(q); }); });
    (sp.arcos || []).forEach(function (a) {
      if (!a || !a.c || !a.de || !a.ate) return;
      o.push(a.de, a.ate);
      var mx = (a.de[0] + a.ate[0]) / 2 - a.c[0], my = (a.de[1] + a.ate[1]) / 2 - a.c[1], L = Math.sqrt(mx * mx + my * my) || 1;
      o.push([a.c[0] + mx / L * a.r, a.c[1] + my / L * a.r]);
    });
    (sp.linhas || []).forEach(function (l) { o.push([l[0], l[1]], [l[2], l[3]]); });
    return o;
  }
  function arcoPorta(a) {
    if (!a || !(a.r > 0) || !a.c || !a.de || !a.ate) return "";
    var cr = (a.de[0] - a.c[0]) * (a.ate[1] - a.c[1]) - (a.de[1] - a.c[1]) * (a.ate[0] - a.c[0]);
    return "M" + n4(a.de[0]) + " " + n4(a.de[1]) + "A" + n4(a.r) + " " + n4(a.r) + " 0 0 " + (cr > 0 ? 1 : 0) + " " + n4(a.ate[0]) + " " + n4(a.ate[1]);
  }
  function svgPortas(lista, e, pena, p6) {
    var gr = {}, s = "";
    lista.forEach(function (sp) {
      if (!sp) return;
      var key = p6 ? (sp.k || "_") : "_", q = gr[key] || (gr[key] = { f: "", g: "" });
      (sp.folhas || []).forEach(function (f) { q.f += caminho(f, true); });
      (sp.arcos || []).forEach(function (a) { q.g += arcoPorta(a); });
      (sp.linhas || []).forEach(function (l) { q.g += "M" + n4(l[0]) + " " + n4(l[1]) + "L" + n4(l[2]) + " " + n4(l[3]); });
    });
    Object.keys(gr).sort().forEach(function (key) {
      var q = gr[key], wf = pena.marca, wg = pena.vista, aF = "", aG = "";
      if (p6) {
        var est = p6.estilos || {}, st = est[key] || est._ || { proj: 2, cor: "#000000" };
        if (st.visivel === false) return;
        var pj = Math.max(1, Math.min(16, Math.round(+st.proj) || 2)), mmG = p6PenaMm(p6.penas, pj, e.escala), mmF = p6PenaMm(p6.penas, Math.min(16, pj + 1), e.escala);
        wg = p6Px(mmG, p6.penas); wf = p6Px(mmF, p6.penas);
        aG = ' data-cat="' + esc(key) + '" data-mm="' + mmG + '" style="stroke:' + p6Cor(st) + '"';
        aF = ' data-cat="' + esc(key) + '" data-mm="' + mmF + '" style="stroke:' + p6Cor(st) + '"';
      }
      if (q.f) s += '<path d="' + q.f + '" fill="none" class="d2-vista d2-porta-folha"' + aF + ' stroke-width="' + wf + '" ' + NS + "/>";
      if (q.g) s += '<path d="' + q.g + '" fill="none" class="d2-vista d2-porta-giro"' + aG + ' stroke-width="' + wg + '" ' + NS + "/>";
    });
    return s ? '<g class="d2-porta">' + s + "</g>" : "";
  }

  /* ---------------------------------------------------- AMBIENTES (P2-D)
   * d.ambientes = { itens: [{ id, pts:[[x,y]], furos:[[[x,y]]], cor, token,
   *   linha1, linha2, aviso, x, y, sel }], legenda: { titulo, itens:[{rotulo, cor, token}] } }
   * (montado por js/bimambienteui.js). A cor vai em hex e, por cima, o token
   * do tema (--d2-amb-N): no papel escuro do tema escuro vale o tom escuro. */
  function fillCor(it) {
    var h = corOk(it.cor);
    return 'fill="' + h + '"' + (/^--[\w-]+$/.test(String(it.token || "")) ? ' style="fill:var(' + it.token + "," + h + ')"' : "");
  }
  function caminhoAmb(it) { var dd = caminho(it.pts, true); (it.furos || []).forEach(function (f) { dd += caminho(f, true); }); return dd; }
  function svgAmbCores(amb) {
    var s = "";
    (amb.itens || []).forEach(function (it) {
      if (!it.cor || !it.pts || it.pts.length < 3) return;
      s += '<path d="' + caminhoAmb(it) + '" ' + fillCor(it) + ' fill-rule="evenodd" class="d2-amb-cor" data-d2-amb-cor="' + esc(it.id) + '"/>';
    });
    return s ? '<g class="d2-amb-cores">' + s + "</g>" : "";
  }
  /* o identificador de ambiente: o NOME em cima e "número · área" embaixo, no
     ponto do ambiente; ambiente não delimitado/redundante leva o aviso no
     lugar da área. O retângulo transparente é o alvo do clique (seleciona). */
  function svgAmbTags(amb, e, pena) {
    var k = e.escala / 1000, s = "", sp = "";
    /* as linhas de separação de ambiente: finas */
    (amb.separadores || []).forEach(function (l) { sp += "M" + n4(l[0]) + " " + n4(l[1]) + "L" + n4(l[2]) + " " + n4(l[3]); });
    if (sp) s += '<path d="' + sp + '" class="d2-amb-sep" fill="none" stroke-width="' + pena.vista + '" ' + NS + "/>";
    (amb.itens || []).forEach(function (it) {
      if (it.sel && it.pts && it.pts.length >= 3)
        s += '<path d="' + caminhoAmb(it) + '" fill="none" class="d2-amb-sel-l" stroke-width="' + n4(pena.marca * 1.6) + '" ' + NS + ' stroke-dasharray="' + n4(3 * k) + " " + n4(1.5 * k) + '"/>';
      if (!e.identAmbiente || !isFinite(it.x) || !isFinite(it.y)) return;
      var h1 = 3 * k, h2 = 2.5 * k, l1 = String(it.linha1 || ""), l2 = String(it.linha2 || "");
      var w = Math.max(l1.length * h1 * 0.6, l2.length * h2 * 0.58, 8 * k);
      s += '<g class="d2-amb-tag' + (it.sel ? " d2-amb-sel" : "") + (it.aviso ? " d2-amb-aviso" : "") + '" data-d2-amb="' + esc(it.id) + '">' +
        '<rect x="' + n4(it.x - w / 2 - k) + '" y="' + n4(it.y - h1 - 1.2 * k) + '" width="' + n4(w + 2 * k) + '" height="' + n4(h1 + h2 + 3.4 * k) + '" class="d2-amb-alvo"/>' +
        txt(it.x, it.y - 0.4 * k, h1, esc(l1), "d2-amb-tx d2-amb-nome", "middle") +
        txt(it.x, it.y + h2 + 0.6 * k, h2, esc(l2), "d2-amb-tx d2-amb-num" + (it.aviso ? " d2-amb-av" : ""), "middle") + "</g>";
    });
    return s ? '<g class="d2-ambientes">' + s + "</g>" : "";
  }
  function svgAmbLegenda(leg, x, y, k, pena) {
    var s = txt(x, y + 3 * k, 2.8 * k, esc(String(leg.titulo || "").toUpperCase()), "d2-amb-leg-tit");
    leg.itens.forEach(function (it, i) {
      var yy = y + 7 * k + i * 6 * k;
      s += '<rect x="' + n4(x) + '" y="' + n4(yy) + '" width="' + n4(8 * k) + '" height="' + n4(4.2 * k) + '" ' + fillCor(it) + ' stroke-width="' + pena.cota + '" ' + NS + ' class="d2-amb-leg-cor"/>';
      s += txt(x + 10 * k, yy + 3.3 * k, 2.4 * k, esc(it.rotulo), "d2-amb-leg-tx");
    });
    return '<g class="d2-amb-legenda">' + s + "</g>";
  }

  function corOk(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || "")) ? c : "#333333"; }
  function svgInst(ins, k, pena) {
    var s = '<g class="d2-inst">';
    (ins.linhas || []).forEach(function (l) {
      var q = l.seg || [];
      s += '<line x1="' + n4(q[0]) + '" y1="' + n4(q[1]) + '" x2="' + n4(q[2]) + '" y2="' + n4(q[3]) + '" stroke="' + corOk(l.cor) + '" stroke-width="' + n4(pena.corte * 0.8) + '" ' + NS +
        (l.tracejado ? ' stroke-dasharray="' + n4(3 * k) + " " + n4(1.5 * k) + '"' : "") + ' data-d2-inst="' + esc(l.id) + '"/>';
    });
    (ins.simbolos || []).forEach(function (m) {
      var cor = corOk(m.cor), r = Math.max(+m.r || 0, 0.6 * k);
      if (m.tipo === "caixa") s += '<rect x="' + n4(m.x - r) + '" y="' + n4(m.y - r) + '" width="' + n4(2 * r) + '" height="' + n4(2 * r) + '" fill="none" stroke="' + cor + '" stroke-width="' + pena.vista + '" ' + NS + ' data-d2-inst="' + esc(m.id) + '"/>';
      else s += '<circle cx="' + n4(m.x) + '" cy="' + n4(m.y) + '" r="' + n4(r) + '" fill="' + (m.tipo === "conexao" ? cor : "none") + '" stroke="' + cor + '" stroke-width="' + pena.vista + '" ' + NS + ' data-d2-inst="' + esc(m.id) + '"/>';
    });
    (ins.textos || []).forEach(function (t) {
      var h = 1.8 * k, sc = h / 100;
      s += '<text x="0" y="0" font-size="100" text-anchor="middle" fill="' + corOk(t.cor) + '" class="d2-inst-tx" transform="translate(' + n4(t.x) + " " + n4(t.y - 0.6 * k) + ") rotate(" + n4(+t.rot || 0) + ") scale(" + n4(sc) + ')">' + esc(t.t) + "</text>";
    });
    return s + "</g>";
  }

  /* escala que cabe numa folha A1 (≈ 800 × 560 mm úteis), nunca maior que 1:50 */
  function escalaQueCabe(larguraM, alturaM) {
    var precisa = Math.max(larguraM * 1000 / 800, alturaM * 1000 / 560);
    for (var i = 0; i < ESCALAS.length; i++) if (ESCALAS[i] >= 50 && ESCALAS[i] >= precisa) return ESCALAS[i];
    return ESCALAS[ESCALAS.length - 1];
  }

  /* letra do próximo corte: A, B, … Z, AA, AB … (pula as já usadas) */
  function proximaLetra(usadas) {
    var u = {}; (usadas || []).forEach(function (x) { u[String(x).toUpperCase()] = 1; });
    for (var i = 0; i < 702; i++) {
      var s = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
      if (!u[s]) return s;
    }
    return "?";
  }

  /* =====================================================================
   * P6 — ESTILOS DE OBJETO, PENAS E PADRÕES RA (Frente A do plano do
   * BIM, seção 3.3). Só DESENHA: quem decide a categoria de
   * cada contorno/aresta, o V/G e o meio-tom é o js/bimmodelovista.js, que
   * entrega `extra.p6` = { escala, nivelDetalhe, penas (data/penas-ra.json),
   * padroes (padroesLinha), preenchimentos, estilos: { chave: { proj, corte
   * (índice da pena 1–16), cor, padrao, preench, meioTom, visivel } } } e o
   * desenho com `cortes[i].k` e `linhasK[i]` (a chave de estilo).
   * PENA: mm de PAPEL pela tabela da escala; na tela, px = mm × 96/25,4
   * (vector-effect: a linha não engorda com o zoom) e o mm vai em `data-mm`
   * para o PDF/DXF. PADRÃO de linha e PREENCHIMENTO em mm de papel → metros
   * do desenho (× escala/1000): trocar a escala muda o traço, como no papel.
   * ===================================================================== */
  var P6_PX_MM = 96 / 25.4;
  function p6ColunaEscala(penas, escala) {
    var ks = (penas && penas.escalas) || [], best = null, bd = Infinity;
    ks.forEach(function (s) { var dd = Math.abs(Math.log(s) - Math.log(escala)); if (dd < bd - 1e-12) { bd = dd; best = s; } });
    return best;
  }
  function p6PenaMm(penas, n, escala) {
    var col = p6ColunaEscala(penas, escala), t = penas && penas.tabela && penas.tabela[String(col)];
    n = Math.max(1, Math.min(16, Math.round(+n) || 1));
    return t && t[n - 1] != null ? t[n - 1] : 0.25;
  }
  function p6Px(mm, penas) {
    var px = mm * ((penas && penas.pxPorMm) || P6_PX_MM), min = (penas && penas.pxMinimo) || 0.5;
    return Math.round(Math.max(min, px) * 1000) / 1000;
  }
  function p6Traco(padroes, id, escala) {
    var pd = padroes && padroes[id]; if (!pd || !pd.mm || !pd.mm.length) return "";
    var k = escala / 1000;
    return pd.mm.map(function (v) { return n4(Math.max(0.0001, Math.abs(+v) * k)); }).join(" ");
  }
  var P6_TINTA = "var(--d2-tinta,#111111)", P6_MEIO = "var(--d2-meiotom,#9aa0a6)";
  function p6Cor(s) { return s.meioTom ? P6_MEIO : (s.cor && String(s.cor).toLowerCase() !== "#000000" ? corOk(s.cor) : P6_TINTA); }
  function p6Padrao(id, pr, k, mt, corMat) {
    if (!pr || pr.tipo !== "padrao" || !(pr.w > 0) || !(pr.h > 0)) return "";
    var cor = mt ? P6_MEIO : (corMat ? corOk(corMat) : P6_TINTA), okD = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/;   /* MATERIAIS: a cor do padrão do material do projeto */
    var tr = okD.test(pr.traco || "") ? pr.traco : "", ch = okD.test(pr.cheio || "") ? pr.cheio : "";
    return '<pattern id="d2p6-' + esc(id) + (mt ? "-mt" : "") + (corMat && !mt ? "-c" + esc(String(corMat).replace("#", "")) : "") + '" patternUnits="userSpaceOnUse" width="' + n4(pr.w * k) + '" height="' + n4(pr.h * k) + '"' +
      (pr.rot ? ' patternTransform="rotate(' + (+pr.rot || 0) + ')"' : "") + '><g transform="scale(' + (Math.round(k * 1e7) / 1e7) + ')">' +
      (tr ? '<path d="' + tr + '" fill="none" stroke-width="' + (+pr.espessura || 0.09) + '" style="stroke:' + cor + '"/>' : "") +
      (ch ? '<path d="' + ch + '" style="fill:' + cor + '"/>' : "") + "</g></pattern>";
  }
  /* o corpo do desenho (o que se VÊ e o que é CORTADO) agrupado por chave de estilo */
  function p6Corpo(d, e, p6) {
    var k = e.escala / 1000, est = p6.estilos || {}, penas = p6.penas, gL = {}, gF = {}, gA = {}, usados = {}, defs = "";
    function st(key) { return est[key] || est._ || { proj: 2, corte: 3, cor: "#000000", padrao: "continua", preench: "vazio" }; }
    (d.linhas || []).forEach(function (l, i) {
      var key = (d.linhasK && d.linhasK[i]) || "_";
      gL[key] = (gL[key] || "") + "M" + n4(l[0]) + " " + n4(l[1]) + "L" + n4(l[2]) + " " + n4(l[3]);
    });
    (d.cortes || []).forEach(function (c) {
      var key = c.k || "_";
      if (c.fechado) gF[key] = (gF[key] || "") + caminho(c.pts, true, c.arcos); else gA[key] = (gA[key] || "") + caminho(c.pts, false, c.arcos);   /* CURVA: c.arcos */
    });
    var corpo = "";
    Object.keys(gL).sort().forEach(function (key) {
      var s = st(key); if (s.visivel === false || !gL[key]) return;
      var mm = p6PenaMm(penas, s.proj, e.escala), tr = p6Traco(p6.padroes, s.padrao, e.escala);
      corpo += '<path d="' + gL[key] + '" class="d2-vista d2-p6-l" data-cat="' + esc(key) + '" data-mm="' + mm + '" stroke-width="' + p6Px(mm, penas) + '" ' + NS +
        (tr ? ' stroke-dasharray="' + tr + '"' : "") + ' style="stroke:' + p6Cor(s) + '"/>';
    });
    var chC = {}; Object.keys(gF).concat(Object.keys(gA)).forEach(function (x) { chC[x] = 1; });
    Object.keys(chC).sort().forEach(function (key) {
      var s = st(key); if (s.visivel === false) return;
      var mm = p6PenaMm(penas, s.corte, e.escala), w = p6Px(mm, penas), cor = p6Cor(s);
      var pr = (p6.preenchimentos || {})[s.preench], fill = "none";
      if (p6.nivelDetalhe !== "baixo" && pr) {
        if (pr.tipo === "solido") fill = s.meioTom ? "#cfd3d8" : corOk(s.corPreench || pr.cor);   /* MATERIAIS: corPreench = a cor do padrão do material do projeto */
        else if (pr.tipo === "padrao") {
          var pid = String(s.preench) + (s.meioTom ? "-mt" : (s.corPreench ? "-c" + String(s.corPreench).replace("#", "") : ""));
          if (!usados[pid]) { usados[pid] = 1; defs += p6Padrao(s.preench, pr, k, !!s.meioTom, s.corPreench); }
          fill = "url(#d2p6-" + esc(pid) + ")";
        }
      }
      if (gF[key]) corpo += '<path d="' + gF[key] + '" fill="' + fill + '" fill-rule="evenodd" class="d2-corte d2-p6-c" data-cat="' + esc(key) + '" data-mm="' + mm + '" stroke-width="' + w + '" ' + NS + ' style="stroke:' + cor + '"/>';
      if (gA[key]) corpo += '<path d="' + gA[key] + '" fill="none" class="d2-corte d2-p6-c" data-cat="' + esc(key) + '" data-mm="' + mm + '" stroke-width="' + w + '" ' + NS + ' style="stroke:' + cor + '"/>';
    });
    return { defs: defs, corpo: '<g class="d2-p6">' + corpo + "</g>" };
  }
  /* marcas das vistas P6 na vista-mãe: ELEVAÇÃO (círculo + seta para onde se olha),
     CHAMADA DE DETALHE (retângulo de cantos redondos + bolha com o número), CORTE
     (a marca de sempre) e a REGIÃO DE RECORTE visível. Clicar abre a vista. */
  function p6MarcaElev(m, k, pena) {
    var R = 4 * k, cx = +m.x, cy = +m.y, dx = +(m.dir && m.dir[0]) || 0, dy = +(m.dir && m.dir[1]) || 1, L = Math.sqrt(dx * dx + dy * dy) || 1; dx /= L; dy /= L;
    var px = -dy, py = dx, tip = [cx + dx * R * 1.75, cy + dy * R * 1.75], b1 = [cx + px * R * 0.98 + dx * R * 0.2, cy + py * R * 0.98 + dy * R * 0.2], b2 = [cx - px * R * 0.98 + dx * R * 0.2, cy - py * R * 0.98 + dy * R * 0.2];
    return '<g class="d2-p6-elev" data-d2-vista="' + esc(m.id) + '">' +
      '<path d="M' + n4(b1[0]) + " " + n4(b1[1]) + "L" + n4(tip[0]) + " " + n4(tip[1]) + "L" + n4(b2[0]) + " " + n4(b2[1]) + 'Z" class="d2-marca-seta"/>' +
      '<circle cx="' + n4(cx) + '" cy="' + n4(cy) + '" r="' + n4(R) + '" stroke-width="' + pena.marca + '" ' + NS + ' class="d2-marca-circ"/>' +
      txt(cx, cy + 1.1 * k, 3 * k, esc(m.rotulo || ""), "d2-marca-tx", "middle") + "</g>";
  }
  function p6MarcaChamada(m, k, pena) {
    var x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1), r = Math.min(2.5 * k, (x1 - x0) / 4, (y1 - y0) / 4), R = 3.5 * k;
    var bx = x1 + 7 * k, by = y0 - 7 * k;
    return '<g class="d2-p6-chamada" data-d2-vista="' + esc(m.id) + '">' +
      '<rect x="' + n4(x0) + '" y="' + n4(y0) + '" width="' + n4(x1 - x0) + '" height="' + n4(y1 - y0) + '" rx="' + n4(r) + '" ry="' + n4(r) + '" fill="none" stroke-width="' + pena.marca + '" ' + NS + ' class="d2-p6-chamada-l"/>' +
      '<line x1="' + n4(x1) + '" y1="' + n4(y0) + '" x2="' + n4(bx - R * 0.7071) + '" y2="' + n4(by + R * 0.7071) + '" stroke-width="' + pena.cota + '" ' + NS + ' class="d2-p6-chamada-l"/>' +
      '<circle cx="' + n4(bx) + '" cy="' + n4(by) + '" r="' + n4(R) + '" stroke-width="' + pena.marca + '" ' + NS + ' class="d2-marca-circ"/>' +
      txt(bx, by + 1.0 * k, 2.8 * k, esc(m.rotulo || ""), "d2-marca-tx", "middle") + "</g>";
  }
  function p6Marcas(lista, e, pena) {
    var k = e.escala / 1000, s = "";
    (lista || []).forEach(function (m) {
      if (!m) return;
      if (m.tipo === "elevacao") s += p6MarcaElev(m, k, pena);
      else if (m.tipo === "chamada") s += p6MarcaChamada(m, k, pena);
      else if (m.tipo === "corte" && m.a && m.b) s += svgMarcaCorte(m, e, pena).replace('data-d2-corte="', 'data-d2-vista="');
      else if (m.tipo === "recorte") s += '<rect x="' + n4(Math.min(m.x0, m.x1)) + '" y="' + n4(Math.min(m.y0, m.y1)) + '" width="' + n4(Math.abs(m.x1 - m.x0)) + '" height="' + n4(Math.abs(m.y1 - m.y0)) +
        '" fill="none" stroke-width="' + pena.cota + '" ' + NS + ' stroke-dasharray="' + n4(4 * k) + " " + n4(1.5 * k) + '" class="d2-p6-recorte"/>';
    });
    return '<g class="d2-p6-marcas">' + s + "</g>";
  }
  function p6Caixa(lista, vb, k) {
    var q = { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h }, M = 9 * k;
    function pt(x, y, m) { if (!isFinite(x) || !isFinite(y)) return; if (x - m < q.x0) q.x0 = x - m; if (x + m > q.x1) q.x1 = x + m; if (y - m < q.y0) q.y0 = y - m; if (y + m > q.y1) q.y1 = y + m; }
    (lista || []).forEach(function (m) {
      if (!m) return;
      if (m.tipo === "elevacao") pt(+m.x, +m.y, M);
      else if (m.tipo === "chamada") { pt(Math.max(m.x0, m.x1) + 7 * k, Math.min(m.y0, m.y1) - 7 * k, 5 * k); pt(m.x0, m.y0, 0); pt(m.x1, m.y1, 0); }
      else if (m.tipo === "corte" && m.a && m.b) { pt(m.a[0], m.a[1], M); pt(m.b[0], m.b[1], M); }
      else if (m.tipo === "recorte") { pt(m.x0, m.y0, k); pt(m.x1, m.y1, k); }
    });
    return { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 };
  }

  var Desenho2D = {
    PENAS: PENAS, PREENCHIMENTOS: PREENCHIMENTOS, MARCAS_COTA: MARCAS_COTA, UNIDADES: UNIDADES, ESCALAS: ESCALAS, ESQUEMAS: ESQUEMAS,
    estiloPadrao: estiloPadrao, normEstilo: normEstilo,
    fmtNum: fmtNum, fmtMedida: fmtMedida, fmtCota: fmtCota, agrupar: agrupar,
    caixa: caixa, cotas: cotasDe, svg: svg, pontosPorta: pontosPorta, arcoPorta: arcoPorta, proximaLetra: proximaLetra, escalaQueCabe: escalaQueCabe, cotaAlinhada: svgCotaAlinhada,
    /* P6 */
    P6: { colunaEscala: p6ColunaEscala, penaMm: p6PenaMm, px: p6Px, traco: p6Traco, corpo: p6Corpo, marcas: p6Marcas, caixa: p6Caixa, padrao: p6Padrao }
  };
  global.Desenho2D = Desenho2D;
  if (typeof module !== "undefined" && module.exports) module.exports = Desenho2D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

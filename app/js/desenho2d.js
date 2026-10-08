/* =====================================================================
 * desenho2d.js — PLANTA E CORTE COMO DESENHO TÉCNICO (07/10/2026)
 *
 * Pedido do Rogério: "a planta baixa tem que vir igual ao Revit: corte em
 * linha, alta qualidade, opção de linha mais fina ou mais grossa, cortes A,
 * B, C, D na lateral, cota com estilo de cota, opção de tirar a cota".
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
 * a linha fica nítida e com a mesma espessura em qualquer zoom, como na tela
 * do Revit. Três jogos: fina / média / grossa. O que é CORTADO sai na pena
 * grossa do jogo; o que é VISTO além do corte, na fina.
 * ANOTAÇÃO (cota, marca de corte, nível, título) tem tamanho de PAPEL: mm na
 * escala da vista (1:50 → 1 mm de papel = 0,05 m), igual ao Revit — trocar a
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
  var MARCAS_COTA = { obliquo: "Traço oblíquo (Revit)", seta: "Seta", ponto: "Ponto" };
  var UNIDADES = { m: "metros (3,45)", cm: "centímetros (345)", mm: "milímetros (3450)" };
  var ESCALAS = [20, 25, 50, 75, 100, 125, 200];

  function estiloPadrao() {
    return { escala: 50, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo",
             textoCota: 2.5, unidade: "m", casas: 2, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true };
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
    if (b.x0 === Infinity) return null;
    return b;
  }

  /* ------------------------------------------------------------- cotas
   * As faces do que foi CORTADO viram cota em cadeia (como "cotar paredes" do
   * Revit) e a soma vira a cota total, na linha de fora. Na planta: em cima
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
  function caminho(pts, fecha) {
    if (!pts || pts.length < 2) return "";
    var s = "M" + n4(pts[0][0]) + " " + n4(pts[0][1]);
    for (var i = 1; i < pts.length; i++) s += "L" + n4(pts[i][0]) + " " + n4(pts[i][1]);
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
    var p = [];
    p.push('<svg xmlns="http://www.w3.org/2000/svg" class="d2-svg" data-d2-tipo="' + esc(d.tipo) + '" viewBox="' + n4(vb.x) + " " + n4(vb.y) + " " + n4(vb.w) + " " + n4(vb.h) + '" preserveAspectRatio="xMidYMid meet">');
    p.push("<defs>" +
      '<pattern id="d2-hach" patternUnits="userSpaceOnUse" width="' + n4(1.6 * k) + '" height="' + n4(1.6 * k) + '" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="' + n4(1.6 * k) + '" stroke="#1a1a1a" stroke-width="' + n4(0.18 * k) + '"/></pattern></defs>');
    p.push('<rect x="' + n4(vb.x) + '" y="' + n4(vb.y) + '" width="' + n4(vb.w) + '" height="' + n4(vb.h) + '" class="d2-papel"/>');
    /* 0) vínculo CAD — por baixo de tudo, em meio-tom (como o "Meio-tom" do Revit) */
    if (cadPath) p.push('<g class="d2-cad"><path d="' + cadPath + '" class="d2-cad-l" stroke-width="' + n4(pena.vista * 0.8) + '" ' + NS + "/>" + cadTx + "</g>");
    /* 1) o que se VÊ além do corte — pena fina, por baixo */
    var lin = "";
    (d.linhas || []).forEach(function (l) { lin += "M" + n4(l[0]) + " " + n4(l[1]) + "L" + n4(l[2]) + " " + n4(l[3]); });
    if (lin) p.push('<path d="' + lin + '" class="d2-vista" stroke-width="' + pena.vista + '" ' + NS + "/>");
    /* 2) o que é CORTADO — preenchimento + contorno na pena grossa */
    var fill = e.preenchimento === "hachura" ? "url(#d2-hach)" : e.preenchimento === "solido" ? "#3a3a3a" : e.preenchimento === "cinza" ? "#cfd3d8" : "none";
    var fechados = "", abertos = "";
    (d.cortes || []).forEach(function (c) { if (c.fechado) fechados += caminho(c.pts, true); else abertos += caminho(c.pts, false); });
    if (fechados) p.push('<path d="' + fechados + '" fill="' + fill + '" fill-rule="evenodd" class="d2-corte" stroke-width="' + pena.corte + '" ' + NS + "/>");
    if (abertos) p.push('<path d="' + abertos + '" fill="none" class="d2-corte" stroke-width="' + pena.corte + '" ' + NS + "/>");
    /* 3) anotação */
    if (d.tipo === "corte" && e.niveis) (d.niveis || []).forEach(function (nv) { p.push(svgNivel(nv, cx, e, pena)); });
    if (d.tipo === "planta" && e.marcasCorte) (d.marcas || []).forEach(function (mc) { p.push(svgMarcaCorte(mc, e, pena)); });
    cotas.forEach(function (c) { p.push(svgCota(c, e, pena)); });
    if (e.titulo && extra && extra.titulo) {
      var ty = cx.y1 + m * 0.62 + (e.titulo ? 6 * k : 0);
      p.push('<g class="d2-titulo">' + txt(cx.x0, ty, 3.4 * k, esc(String(extra.titulo).toUpperCase()), "d2-tit-tx") +
        '<line x1="' + n4(cx.x0) + '" y1="' + n4(ty + 1.2 * k) + '" x2="' + n4(cx.x0 + Math.max(40 * k, (cx.x1 - cx.x0) * 0.4)) + '" y2="' + n4(ty + 1.2 * k) + '" stroke-width="' + pena.corte + '" ' + NS + ' class="d2-tit-l"/>' +
        txt(cx.x0, ty + 4.6 * k, 2.4 * k, "ESC 1:" + e.escala, "d2-tit-esc") + "</g>");
    }
    p.push("</svg>");
    return { svg: p.join(""), caixa: cx, vb: vb, cotas: cotas, estilo: e };
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

  var Desenho2D = {
    PENAS: PENAS, PREENCHIMENTOS: PREENCHIMENTOS, MARCAS_COTA: MARCAS_COTA, UNIDADES: UNIDADES, ESCALAS: ESCALAS,
    estiloPadrao: estiloPadrao, normEstilo: normEstilo,
    fmtNum: fmtNum, fmtMedida: fmtMedida, fmtCota: fmtCota, agrupar: agrupar,
    caixa: caixa, cotas: cotasDe, svg: svg, proximaLetra: proximaLetra, escalaQueCabe: escalaQueCabe
  };
  global.Desenho2D = Desenho2D;
  if (typeof module !== "undefined" && module.exports) module.exports = Desenho2D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

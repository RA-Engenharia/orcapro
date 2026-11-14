/* =====================================================================
 * painelui.js — AS PEÇAS VISUAIS DO PAINEL DE GESTÃO (v2, 13/11/2026)
 *
 * Constrói o HTML de cada bloco do Painel a partir do MODELO do motor (js/painel.js) e de um
 * `ctx` que a fiação (Gestao._pnHtml) monta. PURO: não lê DOM, Store nem relógio — recebe
 * tudo pronto, devolve string. Por isso roda em Node (tools/test-painel-v2.js) e a fiação em
 * gestao.js fica fina (filtros, ações, fotos, gaveta da fila).
 *
 * POR QUE EXISTE (o painel da 1.2.287, medido nos prints da conta real):
 *  · fluxo de caixa: a linha do saldo passava POR CIMA do rótulo "436 mil"; barras finas e
 *    coladas, o "pago" quase invisível;
 *  · previsão de 30 dias: eixo "1,00" e tudo R$ 0,00 enquanto R$ 81,3 mil vencidos ficavam
 *    fora do gráfico; o mesmo número (a pagar) repetido em 5 blocos;
 *  · a obra com físico 100% saía "914 pontos atrás"; lucratividade de 95% sem custo lançado;
 *  · as obras apareciam duas vezes (cartões e lista) e a fila ocupava 1/4 da largura.
 * Aqui cada número mora em UM bloco, o gráfico não pinta texto debaixo de linha (anticolisão
 * medida em tools/test-painel-v2.js) e o que não tem dado diz o que lançar.
 *
 * Regras de desenho: só tokens do app.css (--graf-*, --cat-*, --verde, --graf-alerta…); cor
 * nunca é a ÚNICA pista (seta, sinal e palavra acompanham); alvo de clique ≥ 40 px; texto de
 * SVG é 12 px reais (o desenho nasce na largura do cartão: viewBox = largura medida).
 * ⚠ Sem backdrop-filter, sem degradê decorativo, sem sombra em cartão (sombra só em quem flutua).
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function PD() { return global.PainelDados; }
  function moeda(v) { return PD().moeda(v); }
  /* o eixo e o rótulo de ponta não repetem "R$": o título do gráfico já diz que é dinheiro */
  function curto(v) { return moeda(v).replace(/^(−?)R\$ /, "$1"); }
  function N(n, um, varios) { return n + " " + (n === 1 ? um : varios); }
  function fixo(n, d) { return Number(n).toFixed(d === undefined ? 1 : d); }
  function fmtNumBR(n, d) { return fixo(n, d).replace(".", ","); }
  function ehNum(v) { return typeof v === "number" && isFinite(v); }

  /* ESCALA "bonita": passo 1, 2, 2,5, 5 × 10^n. Devolve {min,max,marcas}. Valor igual vira intervalo de 1. */
  function escala(min, max, alvo) {
    if (!(max > min)) { max = min + 1; }
    var bruto = (max - min) / Math.max(1, alvo || 4);
    var exp = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10)), f = bruto / exp;
    var passo = (f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 2.5 ? 2.5 : (f <= 5 ? 5 : 10)))) * exp;
    var mn = Math.floor(min / passo + 1e-9) * passo, mx = Math.ceil(max / passo - 1e-9) * passo, marcas = [], v;
    for (v = mn; v <= mx + passo * 1e-6; v += passo) marcas.push(Math.round(v / passo * 1e6) / 1e6 * passo);
    return { min: mn, max: mx, passo: passo, marcas: marcas };
  }

  /* ---------- anticolisão de texto no gráfico ----------
     Um rótulo é um retângulo; ele só entra se NÃO cruzar outro rótulo já posto, uma barra ou
     um segmento de linha (a linha é amostrada de 2 em 2 px). Ordem de prioridade = ordem de chamada. */
  function larguraTxt(s) { return String(s).length * 6.7 + 6; }
  function retRotulo(x, y, txt, ancora) {
    var w = larguraTxt(txt), x0 = ancora === "end" ? x - w : (ancora === "start" ? x : x - w / 2);
    return { x0: x0, x1: x0 + w, y0: y - 12, y1: y + 4 };
  }
  function cruzaRet(a, b) { return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1); }
  function cruzaLinha(r, pts, folga) {
    var i, k, n, x, y, t, d = folga || 1.5;
    for (i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      if (a === null || b === null) continue;
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
      n = Math.max(1, Math.ceil(len / 2));
      for (k = 0; k <= n; k++) {
        t = k / n; x = a[0] + dx * t; y = a[1] + dy * t;
        if (x >= r.x0 - d && x <= r.x1 + d && y >= r.y0 - d && y <= r.y1 + d) return true;
      }
    }
    if (pts.length === 1 && pts[0]) { var p = pts[0]; return p[0] >= r.x0 - d && p[0] <= r.x1 + d && p[1] >= r.y0 - d && p[1] <= r.y1 + d; }
    return false;
  }
  /* tenta cada candidato [x, y, ancora]; devolve o primeiro que cabe (e o registra), ou null */
  function colocar(txt, candidatos, ocupados, obstaculos, limites) {
    var i;
    for (i = 0; i < candidatos.length; i++) {
      var c = candidatos[i], r = retRotulo(c[0], c[1], txt, c[2]);
      if (limites && (r.x0 < limites.x0 || r.x1 > limites.x1 || r.y0 < limites.y0 || r.y1 > limites.y1)) continue;
      var bate = ocupados.some(function (o) { return cruzaRet(r, o); });
      if (!bate) bate = obstaculos.some(function (ob) { return ob.rect ? cruzaRet(r, ob.rect) : cruzaLinha(r, ob.pts); });
      if (bate) continue;
      ocupados.push(r);
      return { x: c[0], y: c[1], ancora: c[2], rect: r };
    }
    return null;
  }

  /* ---------- sparkline de KPI: linha fina, só com dado real; buraco (null) quebra o traço ---------- */
  function spark(serie, rotulo) {
    if (!serie || serie.length < 2) return "";
    var vals = serie.filter(function (v) { return ehNum(v); });
    if (vals.length < 2) return "";
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), W = 100, H = 30, n = serie.length;
    var y = function (v) { return mx === mn ? H / 2 : (H - 4) - (v - mn) / (mx - mn) * (H - 8) + 2; };
    var x = function (i) { return i / (n - 1) * W; };
    var segs = [], seg = [], ultimo = null;
    serie.forEach(function (v, i) {
      if (!ehNum(v)) { if (seg.length) segs.push(seg); seg = []; return; }
      seg.push(fixo(x(i), 1) + "," + fixo(y(v), 1)); ultimo = i;
    });
    if (seg.length) segs.push(seg);
    var linhas = segs.map(function (s) { return s.length > 1 ? '<polyline class="pv-spark-l" vector-effect="non-scaling-stroke" points="' + s.join(" ") + '"/>' : ""; }).join("");
    var fim = ultimo === null ? "" : '<i class="pv-spark-ponto" style="left:' + fixo(x(ultimo) / W * 100, 1) + "%;top:" + fixo(y(serie[ultimo]) / H * 100, 1) + '%"></i>';
    return '<span class="pv-spark" role="img" aria-label="' + esc("Tendência: " + (rotulo || "")) + '" title="' + esc(rotulo || "") + '"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' + linhas + "</svg>" + fim + "</span>";
  }

  /* seta + variação: cor E forma E palavra dizem se é bom ou ruim */
  var SETA = {
    alta: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M5 1.5 9 7.5H1z" fill="currentColor"/></svg>',
    baixa: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M5 8.5 1 2.5h8z" fill="currentColor"/></svg>',
    igual: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1.5 5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };
  function delta(d) {
    if (!d) return "";
    if (d.dir === "novo") return '<span class="pv-delta pv-d-neu" title="Sem valor no período de comparação">novo</span>';
    if (d.dir === "sem" || d.pct === null || d.pct === undefined) return "";
    var dir = d.dir === "alta" ? "alta" : (d.dir === "baixa" ? "baixa" : "igual");
    var tom = dir === "igual" ? "neu" : (dir === d.bom ? "bom" : "ruim");
    var txt = PD().pctTxt(d.pct, d.pp);
    return '<span class="pv-delta pv-d-' + tom + '" title="' + esc((d.pp ? "Variação em pontos percentuais " : "Variação ") + (d.rotulo || "")) + '">' + SETA[dir] + "<b>" + esc(txt) + "</b>" + (d.rotulo ? '<span class="pv-d-rot">' + esc(d.rotulo) + "</span>" : "") + "</span>";
  }

  function pilStatus(status) {
    var r = { andamento: "Em andamento", planejamento: "Planejamento", pausada: "Pausada", concluida: "Concluída" };
    var cls = { andamento: "pv-pil-and", concluida: "pv-pil-conc", pausada: "pv-pil-paus", planejamento: "pv-pil-plan" };
    return '<span class="pv-pil ' + (cls[status] || "") + '">' + esc(r[status] || status || "") + "</span>";
  }

  function vazio(titulo, texto, acaoHtml) {
    return '<div class="pv-vazio"><b>' + esc(titulo) + "</b>" + (texto ? "<p>" + esc(texto) + "</p>" : "") + (acaoHtml || "") + "</div>";
  }

  /* ---------- o gráfico de barras agrupadas + linha com eixo próprio ----------
     o = { largura, altura, colunas:[{rot, a, b, linha, comp, tip:{t,l,r}, tipoCol:"vencido"|""}],
           corA, corB, corL, destino, rotuloEixoL, rotuloEixoR, resumo }
     ⚠ DOIS EIXOS DE PROPÓSITO (pedido do dono): barras no eixo da ESQUERDA (zero embaixo), saldo
       no da DIREITA, na cor da linha. Os dois estão escritos no desenho: ninguém precisa adivinhar. */
  var _gid = 0;
  function graficoBL(o) {
    var hid = "pv-hach-" + (++_gid);
    var cols = o.colunas || [], n = cols.length;
    if (!n) return "";
    var W = Math.max(300, Math.round(o.largura || 560)), H = o.altura || 290;
    var compacto = W < 460;
    var maxB = 0, vL = [0], i;
    var maxSemVenc = 0;
    cols.forEach(function (c) {
      maxB = Math.max(maxB, c.a || 0, c.b || 0);
      if (c.tipoCol !== "vencido") maxSemVenc = Math.max(maxSemVenc, c.a || 0, c.b || 0);
      if (ehNum(c.linha)) vL.push(c.linha); if (ehNum(c.comp)) vL.push(c.comp);
    });
    /* ⚠ a coluna "Vencido" (às vezes de seis dígitos, de boletim parado há meses) não pode achatar as 13 semanas que
       importam: a escala das barras segue as SEMANAS, e a barra do vencido que passa do teto é cortada com uma quebra
       visível — o valor verdadeiro vai no rótulo e na dica. */
    var eL = escala(0, (maxSemVenc > 0 ? maxSemVenc : maxB) > 0 ? (maxSemVenc > 0 ? maxSemVenc : maxB) : 1, 4);
    var minL = Math.min.apply(null, vL), maxL = Math.max.apply(null, vL);
    var eR = escala(minL, maxL, 4);
    var labL = eL.marcas.map(function (v) { return curto(v); }), labR = eR.marcas.map(function (v) { return curto(v); });
    var padL = Math.round(Math.max.apply(null, labL.map(function (s) { return s.length; })) * 6.4 + 14);
    var padR = Math.round(Math.max.apply(null, labR.map(function (s) { return s.length; })) * 6.4 + 16);
    var padT = 26, padB = 34, iw = W - padL - padR, ih = H - padT - padB, base = padT + ih;
    var yL = function (v) { return padT + (1 - (v - eL.min) / (eL.max - eL.min)) * ih; };
    var yR = function (v) { return padT + (1 - (v - eR.min) / (eR.max - eR.min)) * ih; };
    var slot = iw / n, gap = 3, bw = Math.max(4, Math.min(28, (slot - 8 - gap) / 2));
    var xc = function (k) { return padL + slot * (k + 0.5); };
    var svg = '<svg class="pv-graf" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" role="img" aria-label="' + esc(o.resumo || "") + '">';
    /* grade e eixo da esquerda */
    eL.marcas.forEach(function (v, k) {
      svg += '<line class="pv-grade" x1="' + padL + '" y1="' + fixo(yL(v), 1) + '" x2="' + (W - padR) + '" y2="' + fixo(yL(v), 1) + '"/>'
        + '<text class="pv-eixo" x="' + (padL - 8) + '" y="' + fixo(yL(v) + 4, 1) + '" text-anchor="end">' + esc(labL[k]) + "</text>";
    });
    /* eixo da direita: só marca e número, na cor do saldo; o zero do saldo vira linha tracejada */
    var haLinha = vL.length > 1;
    if (haLinha) {
      eR.marcas.forEach(function (v, k) {
        svg += '<line class="pv-marca-r" x1="' + (W - padR) + '" y1="' + fixo(yR(v), 1) + '" x2="' + (W - padR + 4) + '" y2="' + fixo(yR(v), 1) + '"/>'
          + '<text class="pv-eixo pv-eixo-r" x="' + (W - padR + 8) + '" y="' + fixo(yR(v) + 4, 1) + '" text-anchor="start">' + esc(labR[k]) + "</text>";
      });
      if (eR.min < 0 && eR.max > 0) svg += '<line class="pv-zero-r" x1="' + padL + '" y1="' + fixo(yR(0), 1) + '" x2="' + (W - padR) + '" y2="' + fixo(yR(0), 1) + '"/>';
    }
    /* barras */
    var barras = [], ocupados = [], obst = [];
    cols.forEach(function (c, k) {
      var cx = xc(k), xa = cx - gap / 2 - bw, xb = cx + gap / 2;
      [["a", c.a, xa, "a"], ["b", c.b, xb, "b"]].forEach(function (s) {
        var v = s[1] || 0;
        if (!(v > 0)) return;
        var topo = yL(v), cortada = topo < padT, h = Math.max(2, base - Math.max(topo, padT));
        barras.push({ serie: s[0], v: v, x: s[2], y: base - h, h: h, col: k, cortada: cortada });
        var hach = c.tipoCol === "vencido" && s[0] === "b";
        /* topo arredondado e BASE RETA no eixo zero: com `rx` nos quatro cantos a barra descolava da linha de base */
        var rb = Math.min(4, bw / 2, h), xb0 = s[2], xb1 = s[2] + bw, yb = base - h;
        svg += '<path class="pv-barra pv-barra-' + s[0] + (hach ? " pv-barra-venc" : "") + '" data-gt-serie="' + s[0] + '" d="M' + fixo(xb0, 1) + "," + fixo(base, 1) + " V" + fixo(yb + rb, 1) + " Q" + fixo(xb0, 1) + "," + fixo(yb, 1) + " " + fixo(xb0 + rb, 1) + "," + fixo(yb, 1) + " H" + fixo(xb1 - rb, 1) + " Q" + fixo(xb1, 1) + "," + fixo(yb, 1) + " " + fixo(xb1, 1) + "," + fixo(yb + rb, 1) + " V" + fixo(base, 1) + 'Z"' + (hach ? ' style="fill:url(#' + hid + ')"' : ' style="fill:url(#' + hid + "g" + s[0] + ')"') + "/>";
        obst.push({ rect: { x0: s[2], x1: s[2] + bw, y0: base - h, y1: base } });
        if (cortada) svg += '<path class="pv-quebra" d="M' + fixo(s[2] - 1, 1) + "," + fixo(padT + 9, 1) + " l" + fixo(bw + 2, 1) + ',-5 M' + fixo(s[2] - 1, 1) + "," + fixo(padT + 14, 1) + " l" + fixo(bw + 2, 1) + ',-5"/>';
      });
    });
    /* linha de comparação (tracejada, recuada) e linha principal */
    var ptsC = cols.map(function (c, k) { return ehNum(c.comp) ? [xc(k), yR(c.comp)] : null; });
    var ptsL = cols.map(function (c, k) { return ehNum(c.linha) ? [xc(k), yR(c.linha)] : null; });
    var densL = ptsL.filter(Boolean).length > 2 ? suave(ptsL.filter(Boolean)) : ptsL.filter(Boolean), densC = ptsC.filter(Boolean).length > 2 ? suave(ptsC.filter(Boolean)) : ptsC.filter(Boolean);
    if (ptsC.some(function (p) { return p; })) svg += '<polyline class="pv-linha-comp" data-gt-serie="p" points="' + ptsTxt(densC) + '"/>';
    if (haLinha) {
      svg += '<polyline class="pv-linha" pathLength="1" data-gt-serie="c" points="' + ptsTxt(densL) + '"/>';
      /* marcador SÓ no último ponto: ponto em tudo é ênfase em nada (os outros acendem no hover, pela coluna de leitura) */
      var kUlt = -1; ptsL.forEach(function (p, k) { if (p) kUlt = k; });
      if (kUlt >= 0) svg += '<circle class="pv-ponto g-fim" data-gt-serie="c" cx="' + fixo(ptsL[kUlt][0], 1) + '" cy="' + fixo(ptsL[kUlt][1], 1) + '" r="4.5"/>';
    }
    /* rótulos: primeiro os da linha (início, fim, mínimo, máximo), depois as barras maiores.
       A linha é obstáculo para TODOS, inclusive para o rótulo do próprio ponto (cai abaixo ou à direita). */
    var lim = { x0: padL - 2, x1: W - 2, y0: 2, y1: H - 2 };
    var linhaObst = densL.length ? [{ pts: densL }] : [];
    if (densC.length) linhaObst.push({ pts: densC });   /* a linha de comparação também é obstáculo */
    var rotulos = "";
    if (haLinha) {
      var idx = [], vals = ptsL.map(function (p, k) { return p ? k : -1; }).filter(function (k) { return k >= 0; });
      if (vals.length) {
        var kMin = vals[0], kMax = vals[0];
        vals.forEach(function (k) { if (cols[k].linha < cols[kMin].linha) kMin = k; if (cols[k].linha > cols[kMax].linha) kMax = k; });
        [vals[vals.length - 1], kMax, kMin, vals[0]].forEach(function (k) { if (idx.indexOf(k) < 0) idx.push(k); });
      }
      idx.forEach(function (k) {
        var p = ptsL[k], txt = curto(cols[k].linha);
        var pos = colocar(txt, [[p[0], p[1] - 10, "middle"], [p[0], p[1] + 18, "middle"], [p[0] - 8, p[1] - 10, "end"], [p[0] + 8, p[1] - 10, "start"], [p[0] - 8, p[1] + 18, "end"]], ocupados, obst.concat(linhaObst), lim);
        if (pos) rotulos += '<text class="pv-rot pv-rot-c" x="' + fixo(pos.x, 1) + '" y="' + fixo(pos.y, 1) + '" text-anchor="' + pos.ancora + '">' + esc(txt) + "</text>";
      });
    }
    barras.slice().sort(function (p, q) { return q.v - p.v; }).forEach(function (b) {
      var txt = curto(b.v), cx = b.x + bw / 2;
      var pos = colocar(txt, [[cx, b.y - 5, "middle"], [cx - 6, b.y - 5, "end"], [cx + 6, b.y - 5, "start"]].concat(b.cortada ? [[b.x + bw + 5, b.y + 14, "start"]] : []), ocupados, obst.filter(function (ob) { return !(ob.rect && ob.rect.x0 === b.x && ob.rect.y0 === b.y); }).concat(linhaObst), lim);
      if (pos) rotulos += '<text class="pv-rot pv-rot-' + b.serie + '" data-gt-serie="' + b.serie + '" x="' + fixo(pos.x, 1) + '" y="' + fixo(pos.y, 1) + '" text-anchor="' + pos.ancora + '">' + esc(txt) + "</text>";
    });
    svg += rotulos;
    /* eixo x: um rótulo por coluna, ou de dois em dois quando o espaço não dá */
    var passo = slot < 50 ? 2 : 1;
    cols.forEach(function (c, k) {
      var ult = k === n - 1;
      /* de dois em dois, sem forçar o último: dois rótulos colados ("29/01" e "05/02") se liam como um só.
         Com a coluna "Vencido" (rótulo largo) na frente, o primeiro rótulo de data só vem depois de uma coluna livre. */
      var temVenc = cols[0].tipoCol === "vencido", mostra = c.tipoCol === "vencido" || (passo === 1 ? true : (temVenc ? (k >= 3 && (k - 1) % passo === 0) : k % passo === 0));
      if (!mostra) return;
      svg += '<text class="pv-mes' + (c.tipoCol === "vencido" ? " pv-mes-venc" : "") + (c.atual ? " pv-mes-atual" : "") + '" x="' + fixo(xc(k), 1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(c.rot) + "</text>";
    });
    /* colunas de leitura: dica, teclado, toque e clique */
    cols.forEach(function (c, k) {
      var x0 = padL + slot * k, ptL = ptsL[k];
      svg += '<g class="g-col" tabindex="0" role="img" aria-label="' + esc(c.aria || c.rot) + '"' + (o.destino ? ' data-gacao="graf-ir" data-destino="' + esc(o.destino) + '"' : "") + (o.gt ? o.gt(c.tip) : "") + ">"
        + '<rect class="g-hit" x="' + fixo(x0, 1) + '" y="' + padT + '" width="' + fixo(slot, 1) + '" height="' + ih + '"/>'
        + '<line class="g-guia" x1="' + fixo(xc(k), 1) + '" y1="' + padT + '" x2="' + fixo(xc(k), 1) + '" y2="' + base + '"/>'
        + (ptL ? '<circle class="g-pt" cx="' + fixo(ptL[0], 1) + '" cy="' + fixo(ptL[1], 1) + '" r="5" fill="' + (o.corL || "var(--graf-c)") + '"/>' : "") + "</g>";
    });
    svg += '<defs>' + gradDef(hid + "ga", "var(--graf-a)", 1, 0.72) + gradDef(hid + "gb", "var(--graf-b)", 1, 0.72) + '<pattern id="' + hid + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--graf-b)" opacity=".28"/><rect width="3" height="6" fill="var(--graf-b)"/></pattern></defs>';
    return svg + "</svg>";
  }

  /* ---------- curva suave (monotone cubic, Fritsch–Carlson): NUNCA passa do valor dos pontos (rótulo não estoura o eixo) ----------
     devolve pontos densos [x,y]; o desenho vira polyline de pontos (os traços ficam redondos) e a anticolisão mede a CURVA de verdade. */
  function suave(p, passo) {
    var n = p.length, i, k;
    if (n < 3) return p.slice();
    var dx = [], dy = [], m = [], t = [];
    for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; dy[i] = p[i + 1][1] - p[i][1]; m[i] = dx[i] ? dy[i] / dx[i] : 0; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    var out = [];
    for (i = 0; i < n - 1; i++) {
      var steps = Math.max(2, Math.ceil(dx[i] / (passo || 5)));
      for (var s = 0; s < steps; s++) {
        var u = s / steps, u2 = u * u, u3 = u2 * u;
        out.push([p[i][0] + u * dx[i], (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * dx[i] * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * dx[i] * t[i + 1]]);
      }
    }
    out.push(p[n - 1]);
    return out;
  }
  function ptsTxt(pts) { return pts.map(function (q) { return fixo(q[0], 1) + "," + fixo(q[1], 1); }).join(" "); }
  /* degradê de preenchimento: topo na cor da série, pé transparente (área) ou um pouco mais escuro (barra) */
  function gradDef(id, cor, topo, pe) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + cor + '" stop-opacity="' + topo + '"/><stop offset="1" style="stop-color:' + cor + '" stop-opacity="' + pe + '"/></linearGradient>';
  }

  /* ---------- gráfico de ÁREA suave, uma ou duas séries (recebido e pago, lucratividade…) ----------
     o = { largura, altura, rotulosX:[...], series:[{id:"a", cor, valores:[...], area:true}], tips:[{t,l,r}], fmt:function(v), min, meta:{v,txt},
           destino, resumo, gt, id }
     ⚠ O eixo ganha 10% de FOLGA acima do maior valor (o rótulo do ponto mais alto cabia cortado), e o desenho usa a largura inteira. */
  function graficoArea(o) {
    var rot = o.rotulosX || [], n = rot.length, ser = o.series || [];
    if (!n || !ser.length) return "";
    var fmt = o.fmt || curto, W = Math.max(300, Math.round(o.largura || 560)), H = o.altura || 270, hid = "pv-ga-" + (++_gid);
    var vmin = ehNum(o.min) ? o.min : 0, vmax = 0;
    ser.forEach(function (s) { s.valores.forEach(function (v) { if (ehNum(v)) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); } }); });
    if (o.meta && ehNum(o.meta.v)) vmax = Math.max(vmax, o.meta.v);
    var topo = vmax + Math.max(Math.abs(vmax), 1) * 0.1;
    var e = escala(vmin, topo > vmin ? topo : vmin + 1, o.ticks || 4);
    var labs = e.marcas.map(function (v) { return fmt(v); });
    var padL = Math.round(Math.max.apply(null, labs.map(function (s) { return String(s).length; })) * 6.4 + 14), padR = 16, padT = 14, padB = 30;
    var iw = W - padL - padR, ih = H - padT - padB, base = padT + ih;
    var y = function (v) { return padT + (1 - (v - e.min) / (e.max - e.min)) * ih; };
    var slot = iw / n, xc = function (i) { return padL + slot * (i + 0.5); };
    var svg = '<svg class="pv-graf pv-graf-area" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" role="img" aria-label="' + esc(o.resumo || "") + '"><defs>';
    ser.forEach(function (s, k) { s.gid = hid + "-" + k; svg += gradDef(s.gid, s.cor, s.area === false ? 0 : (k === 0 ? 0.55 : 0.28), 0.02); });
    svg += "</defs>";
    var eixoTxt = "";
    e.marcas.forEach(function (v, k) { svg += '<line class="pv-grade" x1="' + padL + '" y1="' + fixo(y(v), 1) + '" x2="' + (W - padR) + '" y2="' + fixo(y(v), 1) + '"/>'; eixoTxt += '<text class="pv-eixo" x="' + (padL - 8) + '" y="' + fixo(y(v) + 4, 1) + '" text-anchor="end">' + esc(labs[k]) + "</text>"; });
    if (e.min < 0 && e.max > 0) svg += '<line class="g-zero pv-zero" x1="' + padL + '" y1="' + fixo(y(0), 1) + '" x2="' + (W - padR) + '" y2="' + fixo(y(0), 1) + '"/>';
    if (o.meta && ehNum(o.meta.v)) svg += '<rect class="pv-meta-faixa" x="' + padL + '" y="' + fixo(y(e.max), 1) + '" width="' + iw + '" height="' + fixo(Math.max(0, y(o.meta.v) - y(e.max)), 1) + '"/><line class="pv-meta-linha" x1="' + padL + '" y1="' + fixo(y(o.meta.v), 1) + '" x2="' + (W - padR) + '" y2="' + fixo(y(o.meta.v), 1) + '"/><text class="pv-meta-txt" x="' + (W - padR - 4) + '" y="' + fixo(y(o.meta.v) - 5, 1) + '" text-anchor="end">' + esc(o.meta.txt || "") + "</text>";
    var obst = [], ocupados = [], ptsPorSerie = [];
    ser.forEach(function (s, k) {
      /* trechos contínuos (valor nulo quebra); cada trecho vira curva suave + área */
      var trecho = [], trechos = [];
      s.valores.forEach(function (v, i) { if (!ehNum(v)) { if (trecho.length) trechos.push(trecho); trecho = []; } else trecho.push([xc(i), y(v), i]); });
      if (trecho.length) trechos.push(trecho);
      s.pts = [];
      trechos.forEach(function (tr) {
        s.pts = s.pts.concat(tr);
        var dens = suave(tr.map(function (q) { return [q[0], q[1]]; }));
        if (dens.length > 1 && s.area !== false) svg += '<path class="pv-area" data-gt-serie="' + s.id + '" style="fill:url(#' + s.gid + ')" d="M' + fixo(dens[0][0], 1) + "," + fixo(base, 1) + " L" + dens.map(function (q) { return fixo(q[0], 1) + "," + fixo(q[1], 1); }).join(" L") + " L" + fixo(dens[dens.length - 1][0], 1) + "," + fixo(base, 1) + ' Z"/>';
        if (dens.length > 1) { svg += '<polyline class="pv-linha pv-linha-ser" data-gt-serie="' + s.id + '" style="stroke:' + s.cor + '" points="' + ptsTxt(dens) + '"/>'; obst.push({ pts: dens }); }
      });
    });
    /* marcadores (todos os pontos: aqui são poucos e cada um leva o rótulo) e rótulos de valor, com anticolisão */
    var lim = { x0: padL - 2, x1: W - 2, y0: 2, y1: base - 1 }, rotulos = "";
    ser.forEach(function (s) {
      s.pts.forEach(function (q) { svg += '<circle class="pv-marc" data-gt-serie="' + s.id + '" style="stroke:' + s.cor + '" cx="' + fixo(q[0], 1) + '" cy="' + fixo(q[1], 1) + '" r="3.6"/>'; });
    });
    ser.forEach(function (s, k) {
      s.pts.slice().sort(function (a, b) { return a[1] - b[1]; }).forEach(function (q) {
        var v = s.valores[q[2]], txt = fmt(v);
        var pos = colocar(txt, k === 0 ? [[q[0], q[1] - 10, "middle"], [q[0], q[1] + 19, "middle"]] : [[q[0], q[1] + 19, "middle"], [q[0], q[1] - 10, "middle"]], ocupados, obst, lim);
        if (pos) rotulos += '<text class="pv-rot pv-rot-ser" data-gt-serie="' + s.id + '" x="' + fixo(pos.x, 1) + '" y="' + fixo(pos.y, 1) + '" text-anchor="' + pos.ancora + '">' + esc(txt) + "</text>";
      });
    });
    svg += eixoTxt + rotulos;
    var passo = slot < 44 ? 2 : 1;
    rot.forEach(function (r, i) { if (passo === 2 && i % 2 !== 0 && i !== n - 1) return; svg += '<text class="pv-mes' + (i === n - 1 ? " pv-mes-atual" : "") + '" x="' + fixo(xc(i), 1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(r) + "</text>"; });
    rot.forEach(function (r, i) {
      var tip = (o.tips || [])[i] || { t: r, l: [], r: "" };
      svg += '<g class="g-col" tabindex="0" role="img" aria-label="' + esc(tip.aria || r) + '"' + (o.destino ? ' data-gacao="graf-ir" data-destino="' + esc(o.destino) + '"' : "") + (o.gt ? o.gt(tip) : "") + '><rect class="g-hit" x="' + fixo(padL + slot * i, 1) + '" y="' + padT + '" width="' + fixo(slot, 1) + '" height="' + ih + '"/><line class="g-guia" x1="' + fixo(xc(i), 1) + '" y1="' + padT + '" x2="' + fixo(xc(i), 1) + '" y2="' + base + '"/></g>';
    });
    return svg + "</svg>";
  }

  /* ---------- RANKING (Top 10): barras horizontais com degradê, número da posição e VALOR NA PONTA da barra ---------- */
  function topLista(itens, o) {
    o = o || {};
    if (!itens.length) return "";
    var max = Math.max.apply(null, itens.map(function (i) { return i.valor; })) || 1;
    return '<ol class="pv-t10 pv-t10-' + (o.tom || "azul") + '">' + itens.map(function (it, i) {
      var pct = Math.max(2, Math.round(it.valor / max * 100)), w = Math.round(pct * 0.7);
      var acao = it.id ? ' data-gacao="graf-ir" data-destino="painel-obra" data-id="' + esc(it.id) + '"' : "";
      var gt = o.gt ? o.gt(it.rotulo, [[o.rotuloValor || "Valor", o.fmtExato ? o.fmtExato(it.valor) : moeda(it.valor), it.cor || "var(--cat-obra)"]], it.id ? "Clique: ver só esta obra no Painel" : "") : "";
      return '<li><button type="button" class="pv-t10-i"' + acao + gt + (it.id ? "" : " disabled") + '><span class="pv-t10-n" aria-hidden="true">' + (i + 1) + '</span><span class="pv-t10-r" title="' + esc(it.rotulo) + '">' + esc(it.rotulo) + '</span><span class="pv-t10-b"><i style="width:' + w + '%"></i><b class="pv-tn">' + esc(moeda(it.valor)) + "</b></span></button></li>";
    }).join("") + "</ol>";
  }

  /* legenda: botões que ligam e desligam a série (GrafTip) */
  function legenda(itens) {
    return '<div class="pv-leg">' + itens.map(function (it) {
      return '<button type="button" class="g-leg pv-leg-b" data-gt-serie-bt="' + it.serie + '" aria-pressed="true" title="Mostrar ou esconder: ' + esc(it.rotulo) + '"><i class="pv-leg-cor pv-leg-' + it.forma + '" style="' + (it.forma === "linha" || it.forma === "tracejada" ? "color:" : "background:") + it.cor + '"></i>'
        + esc(it.rotulo) + (it.valor ? " <b>" + esc(it.valor) + "</b>" : "") + "</button>";
    }).join("") + "</div>";
  }

  function mesCurto(ch) { return String(ch || "").slice(5, 7) + "/" + String(ch || "").slice(2, 4); }
  function diaCurto(iso) { var s = String(iso || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) : s; }
  function varTxt(v) {
    if (!v) return "";
    if (v.dir === "novo") return "novo";
    if (v.dir === "sem") return "—";
    if (v.dir === "igual") return "igual";
    return (v.pct > 0 ? "+" : "−") + Math.abs(v.pct) + "%";
  }
  var DESTINO_VIEW = { financeiro: "financeiro", obras: "obras", comercial: "orcamentos", medicoes: "medicoes" };

  /* ---------- B. RESUMO DO DIA: frases do MOTOR (PainelDados.resumo), sem IA ---------- */
  /* ---------- C. OS 6 INDICADORES ---------- */
  /* ---------- D. FAIXA "PRECISA DE VOCÊ" (horizontal) ---------- */
  /* até 4 cartões, os de maior R$ em jogo primeiro; sem dinheiro, por gravidade */
  function escolherFila(decisoes, max) {
    var lista = (decisoes || []).map(function (x, i) { return { x: x, i: i }; });
    lista.sort(function (a, b) {
      var va = a.x.unidade === "R$" ? a.x.valor : -1, vb = b.x.unidade === "R$" ? b.x.valor : -1;
      if (va !== vb) return vb - va;
      if (b.x.gravidade !== a.x.gravidade) return b.x.gravidade - a.x.gravidade;
      return a.i - b.i;
    });
    return lista.slice(0, max || 4).map(function (o) { return o.x; });
  }
  function quantoDe(x, c) {
    if (x.unidade === "R$") return c.podeFin === false ? "" : moeda(x.valor);
    if (x.unidade === "dias") return N(x.valor, "dia", "dias");
    if (x.unidade === "un") return String(x.valor);
    return "";
  }
  /* o corpo da gaveta: a fila COMPLETA, em grupos, com Resolver e Adiar (igual à de sempre) */
  function filaCompleta(m, c) {
    var itensDe = function (x) {
      if (!x.itens || !x.itens.length) return "";
      var btn = function (it) {
        if (x.itensAcao === "aprovar-medicao") return (c.podeAprovar && c.podeMod("medicoes")) ? '<button type="button" class="pn-btn pn-btn-mini pn-btn-p" data-gacao="aprovar-medicao" data-id="' + esc(it.id) + '">Aprovar</button>' : "";
        if (x.itensAcao === "pagar-medicao") return (c.podeFin && c.podeMod("medicoes")) ? '<button type="button" class="pn-btn pn-btn-mini pn-btn-p" data-gacao="pagar-medicao" data-id="' + esc(it.id) + '">Registrar pagamento</button>' : "";
        if (x.itensAcao === "abrir-lancamento") return c.podeFin ? '<button type="button" class="pn-btn pn-btn-mini" data-gopen="financeiro:' + esc(it.id) + '">Abrir</button>' : "";
        return "";
      };
      var lis = x.itens.map(function (it) {
        var b = btn(it); if (!b) return "";
        return '<li><span class="pn-it-t">' + esc(it.rotulo) + (it.sub ? "<small>, " + esc(it.sub) + "</small>" : "") + "</span>"
          + (it.valor !== null && it.valor !== undefined && c.podeFin ? '<span class="pn-it-v pv-tn">' + esc(moeda(it.valor)) + "</span>" : "") + b + "</li>";
      }).join("");
      if (!lis) return "";
      return '<ul class="pn-itens">' + lis + (x.n > x.itens.length ? '<li class="pn-it-mais">e mais ' + (x.n - x.itens.length) + " na lista completa</li>" : "") + "</ul>";
    };
    var linhaDec = function (x) {
      var t = c.decisao(x), quanto = quantoDe(x, c) || '<span class="pn-tag">' + esc(x.tag || "") + "</span>";
      var grav = x.gravidade >= 3 ? "pn-critico" : (x.gravidade === 2 ? "pn-atencao" : "pn-info");
      return '<li class="pn-decisao ' + grav + (x.adiadoAte ? " pn-adiada" : "") + '"><span class="pn-quanto"><i></i>' + quanto + '</span><span class="pn-oque">' + t.titulo + "</span>"
        + '<span class="pn-onde">' + t.detalhe + (t.acaoTexto ? '<span class="pn-porque-a">' + t.acaoTexto + "</span>" : "") + (x.adiadoAte ? '<span class="pn-porque-t">Adiado até ' + diaCurto(x.adiadoAte) + ".</span>" : "") + "</span>"
        + '<span class="pn-acao">' + c.botao(x, t.botao) + (x.adiadoAte
          ? '<button class="pn-btn pn-btn-mini" data-gacao="painel-desadiar" data-id="' + esc(x.chave) + '" title="Trazer de volta para a fila agora">Trazer de volta</button>'
          : '<button class="pn-btn pn-btn-mini" data-gacao="painel-adiar" data-id="' + esc(x.chave) + '" title="Sai da fila por ' + PD().DIAS_ADIAR + ' dias e volta sozinho">Adiar ' + PD().DIAS_ADIAR + "d</button>") + "</span>" + (x.adiadoAte ? "" : itensDe(x)) + "</li>";
    };
    var html = '<div class="pn-fila-modal" data-modal-largo>';
    if (!m.decisoes.length) html += '<p class="pv-vazio-p">Nenhuma decisão esperando.</p>';
    m.grupos.forEach(function (g) {
      html += '<details class="pn-grupo"' + (g.aberto ? " open" : "") + '><summary><span class="pn-grupo-nome">' + esc(g.nome) + '</span><span class="pn-grupo-n">' + esc(N(g.itens.length, "ponto", "pontos")) + (g.emJogo > 0 && c.podeFin ? ", " + esc(moeda(g.emJogo)) : "") + "</span></summary><ol>" + g.itens.map(linhaDec).join("") + "</ol></details>";
    });
    if (m.decisoesAdiadas.length) html += '<details class="pn-grupo pn-grupo-adiados"><summary><span class="pn-grupo-nome">Adiados</span><span class="pn-grupo-n">' + esc(N(m.decisoesAdiadas.length, "ponto volta", "pontos voltam")) + " sozinho quando vencer</span></summary><ol>" + m.decisoesAdiadas.map(linhaDec).join("") + "</ol></details>";
    return html + "</div>";
  }

  /* ---------- E1. FLUXO DE CAIXA: barras agrupadas + saldo com eixo próprio ---------- */
  /* ---------- E2. PREVISÃO DE 13 SEMANAS ---------- */
  function blPrevisao(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var p = m.previsao13, sub = "o que está em aberto, com data de vencimento. É previsão, não caixa. Boletim aprovado entra " + N(c.metas.prazoReceber, "dia", "dias") + " depois da medição.";
    var frase = "Nada com vencimento nas próximas 13 semanas. Lance as contas a pagar e as receitas previstas com a data de vencimento no Financeiro para ver o caixa projetado.";
    var vencBox = "";
    if (p.temVencido) {
      var v = p.vencido;
      vencBox = '<div class="pv-venc"><div><span class="pv-venc-r">Já venceu e segue em aberto</span><b class="pv-venc-v">' + esc(moeda(v.saidas)) + "</b><span class=\"pv-venc-s\">" + esc(N(v.nS, "conta a pagar", "contas a pagar"))
        + (v.nE ? "; mais " + esc(moeda(v.entradas)) + " a receber em atraso, que não entram na posição" : "") + "</span></div></div>";
    }
    if (p.vazioTotal) return '<section class="pv-card pv-previsao" aria-labelledby="pv-prev-t">' + cab("Previsão de 13 semanas", sub, "", "pv-prev-t") + vazio("Nada em aberto com data", frase, '<button type="button" class="pn-btn pn-btn-p" data-view="financeiro">Abrir o Financeiro</button>') + "</section>";
    if (p.vazia) return '<section class="pv-card pv-previsao" aria-labelledby="pv-prev-t">' + cab("Previsão de 13 semanas", sub, "", "pv-prev-t") + vencBox + '<p class="pv-frase">' + esc(frase) + '</p><button type="button" class="pn-btn pn-btn-p" data-view="financeiro">Abrir o Financeiro</button></section>';
    var cols = [], v0 = p.vencido;
    if (p.temVencido) {
      cols.push({ rot: "Vencido", tipoCol: "vencido", a: v0.entradas, b: v0.saidas, linha: p.saldoInicial, tip: { t: "Vencido e em aberto", l: [["Receita atrasada", c.fmtMoeda(v0.entradas), "var(--graf-a)"], ["Contas a pagar vencidas", c.fmtMoeda(v0.saidas), "var(--graf-b)"], ["Posição de partida", c.fmtMoeda(p.saldoInicial), "var(--graf-c)"]], r: "Receita atrasada não entra na posição. Clique: abrir o Financeiro" },
        aria: "Vencido: contas a pagar " + moeda(v0.saidas) + ", receita atrasada " + moeda(v0.entradas) });
    }
    p.semanas.forEach(function (w) {
      cols.push({ rot: diaCurto(w.ini), a: w.entradas, b: w.saidas, linha: w.posicao, atual: w.i === 0,
        tip: { t: "Semana de " + diaCurto(w.ini) + " a " + diaCurto(w.fim), l: [["Entradas previstas", c.fmtMoeda(w.entradas), "var(--graf-a)"], ["Saídas previstas", c.fmtMoeda(w.saidas), "var(--graf-b)"], ["Posição ao fim da semana", c.fmtMoeda(w.posicao), "var(--graf-c)"]], r: "Clique: abrir o Financeiro e programar o que vence" },
        aria: "Semana de " + diaCurto(w.ini) + ": entradas " + moeda(w.entradas) + ", saídas " + moeda(w.saidas) + ", posição " + moeda(w.posicao) });
    });
    var resumo = "Previsão de caixa de 13 semanas: entradas previstas " + moeda(p.entradas) + ", saídas previstas " + moeda(p.saidas) + ", posição ao fim " + moeda(p.posicaoFinal) + ". É previsão do que está em aberto com data, não caixa.";
    var svg = graficoBL({ largura: LG(c, 6), colunas: cols, destino: "financeiro", resumo: resumo, altura: 150, gt: function (tip) { return c.gt(tip.t, tip.l, tip.r); } });
    var leg = legenda([{ serie: "a", rotulo: "Entradas previstas", forma: "barra", cor: "var(--graf-a)", valor: moeda(p.entradas) }, { serie: "b", rotulo: "Saídas previstas", forma: "barra", cor: "var(--graf-b)", valor: moeda(p.saidas) }, { serie: "c", rotulo: "Posição de caixa", forma: "linha", cor: "var(--graf-c)", valor: moeda(p.posicaoFinal) }]);
    var notas = [];
    if (p.minimo && p.minimo.valor < p.saldoHoje) notas.push("Ponto mais baixo: " + esc(moeda(p.minimo.valor)) + " na semana " + (p.minimo.semana + 1) + ".");
    if (p.semData.nE + p.semData.nS) notas.push(esc(N(p.semData.nE + p.semData.nS, "lançamento sem data fica", "lançamentos sem data ficam")) + " de fora: " + esc(moeda(p.semData.entradas)) + " a entrar, " + esc(moeda(p.semData.saidas)) + " a sair.");
    if (p.depois.nE + p.depois.nS) notas.push("Depois de 13 semanas: " + esc(moeda(p.depois.entradas)) + " a entrar, " + esc(moeda(p.depois.saidas)) + " a sair.");
    return '<section class="pv-card pv-previsao" aria-labelledby="pv-prev-t">' + cab("Previsão de 13 semanas", sub + " " + notas.join(" "), "", "pv-prev-t") + '<div class="gt-graf pv-graf-box" data-gt-grafico>' + svg + leg + "</div></section>";
  }

  /* ---------- F. COMPOSIÇÃO: rosca de categorias + barras por obra ---------- */
  /* ---------- G. CARTEIRA DE OBRAS (tabela-portfólio, com galeria alternativa) ---------- */
  var ROT_STATUS = { andamento: "Em andamento", planejamento: "Planejamento", pausada: "Pausadas", concluida: "Concluídas", todas: "Todas" };
  function duplaBarra(l) {
    var pz = l.prazo || {}, av = l.avanco, p = pz.temDatas ? Math.min(100, pz.prazoPct || 0) : null, f = av === null || av === undefined ? null : Math.min(100, Math.max(0, av));
    if (l.status === "concluida" || pz.entregue) return '<span class="pv-dupla pv-dupla-ok"><span class="pv-dupla-b"><span class="pv-dupla-t"><i class="pv-fis" style="width:100%"></i></span></span><span class="pv-dupla-l">entregue</span></span>';
    var tit = l.nome + ": " + (f === null ? "sem medição" : "físico " + av + "%") + (p === null ? ", sem datas" : ", calendário consumido " + (pz.prazoTexto || p + "%"));
    return '<span class="pv-dupla" role="img" aria-label="' + esc(tit) + '" title="' + esc(tit) + '">'
      + '<span class="pv-dupla-b"><span class="pv-dupla-t pv-dupla-fis"><i class="pv-fis" style="width:' + (f === null ? 0 : f) + '%"></i></span>'
      + '<span class="pv-dupla-t pv-dupla-pra">' + (p === null ? "" : '<i class="pv-pra" style="width:' + p + '%"></i>') + "</span>"
      + (p === null ? "" : '<b class="pv-hoje" style="left:' + p + '%" title="Hoje: ' + esc(pz.prazoTexto || p + "%") + ' do calendário"></b>') + "</span>"
      + '<span class="pv-dupla-l"><span>físico <b>' + (f === null ? "—" : av + "%") + "</b></span><span>prazo <b>" + (p === null ? "—" : esc(pz.prazoTexto || p + "%")) + "</b></span></span></span>";
  }
  function orcCelula(l) {
    var o = l.orcado;
    if (!o || !(o.previsto > 0)) return '<span class="pv-fraco" title="Sem orçamento vinculado a esta obra: vincule em Obras para comparar o gasto com o orçado">sem orçamento</span>';
    var pct = o.consumidoPct === null ? 0 : o.consumidoPct, w = Math.min(100, Math.max(0, pct));
    if (o.gasto < 0) return '<span class="pv-orc" title="' + esc("O custo lançado da obra é um crédito (estorno sem a despesa de origem): não há percentual do orçado para mostrar") + '"><b class="pv-tn">crédito</b><small class="pv-orc-s">estorno sem origem</small></span>';
    var adiantado = l.avanco !== null && l.avanco !== undefined && o.consumidoPct !== null && o.consumidoPct - l.avanco >= PD().DEFASAGEM_PONTOS;
    var tit = "Gasto " + (o.gasto ? Number(o.gasto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00") + " de " + Number(o.previsto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + " orçados" + (l.avanco !== null && l.avanco !== undefined ? ". Medido " + l.avanco + "% do escopo" : "");
    return '<span class="pv-orc' + (o.estourou ? " pv-orc-estouro" : (adiantado ? " pv-orc-atencao" : "")) + '" title="' + esc(tit) + '"><span class="pv-orc-t"><i style="width:' + w + '%"></i></span><b class="pv-tn">' + pct + "%</b>"
      + (o.estourou ? '<small class="pv-orc-s">acima do orçado</small>' : (adiantado ? '<small class="pv-orc-s">gasto à frente da obra</small>' : "")) + "</span>";
  }
  function margemCelula(l, c) {
    if (l.margem === null || l.margem === undefined) return '<span class="pv-fraco" title="' + (l.recebido > 0 ? "Sem custo pago lançado: a margem ainda não existe" : "Sem receita") + '">—</span>';
    var inc = l.custoIncompleto && l.custoIncompleto.sim;
    var tit = inc ? "O custo pago é " + Math.round(l.custoIncompleto.razao * 100) + "% do recebido: a margem ainda não é confiável" : "Resultado sobre o recebido, acumulado da obra";
    return '<span class="pv-margem ' + (inc ? "pv-fraco" : (l.margem >= c.metas.margem ? "pv-ok" : "pv-ruim")) + '" title="' + esc(tit) + '">' + fmtNumBR(l.margem, 1) + "%" + (inc ? '<i class="pv-selo-mini" aria-label="custo incompleto" title="' + esc(tit) + '">!</i>' : "") + "</span>";
  }
  function linhaTab(l, c, fin) {
    var mot = (l.atencao && l.atencao.motivos || []).filter(function (x) { return x.cod === "vencidas" || x.cod === "estouro" || x.cod === "sem-diario"; })[0];
    var d = l.desvio || { tom: "neutro", texto: "" }, mk = l.marco || { tom: "neutro", texto: "" };
    var nome = '<th scope="row" class="pv-ob-nome"><button type="button" class="pv-ob-link" data-gopen="obras:' + esc(l.id) + '" title="' + esc(l.nome) + '">' + esc(l.nome) + "</button>" + pilStatus(l.status) + (mot ? '<small class="pv-ob-mot">' + esc(mot.texto) + "</small>" : "") + "</th>";
    var td = function (rot, cls, html) { return '<td class="' + cls + '" data-rotulo="' + esc(rot) + '">' + html + "</td>"; };
    return '<tr class="pv-ob pv-ob-s-' + esc(l.status) + '">' + nome
      + td("Físico e prazo", "pv-c-dupla", duplaBarra(l))
      + td("Desvio", "pv-c-desv", '<span class="pv-desv pv-desv-' + esc(d.tom) + '">' + esc(d.texto) + "</span>")
      + (fin ? td("Contratado", "pv-num", l.base > 0 ? '<span title="' + esc(c.fmtMoeda(l.base) + (l.semContrato ? " (valor cadastrado na obra, sem contrato)" : "")) + '">' + esc(moeda(l.base)) + (l.semContrato ? '<small class="pv-sc">sem contrato</small>' : "") + "</span>" : '<span class="pv-fraco">—</span>')
        + td("Recebido", "pv-num", l.recebido > 0 ? '<span title="' + esc(c.fmtMoeda(l.recebido)) + '">' + esc(moeda(l.recebido)) + "</span>" : '<span class="pv-fraco">nenhum</span>')
        + td("Custo pago", "pv-num", l.custoPago > 0 ? '<span title="' + esc(c.fmtMoeda(l.custoPago)) + '">' + esc(moeda(l.custoPago)) + "</span>" : '<span class="pv-fraco">nenhum</span>')
        + td("Margem", "pv-num", margemCelula(l, c))
        + td("Orçado e realizado", "pv-c-orc", orcCelula(l)) : "")
      + td("Próximo marco", "pv-c-marco", '<span class="pv-marco pv-marco-' + esc(mk.tom) + '">' + esc(mk.texto) + "</span>") + "</tr>";
  }
  function cardGaleria(l, c, fin) {
    var d = l.desvio || {}, mk = l.marco || {}, ini = c.iniciais(l.nome);
    var ft = c.fotoDe ? c.fotoDe(l) : null, credito = "";
    if (ft && ft.ref) { c.obrasFotos.push({ id: l.id, ref: ft.ref }); if (ft.origem === "diario" && ft.data) credito = "Foto do diário de " + diaCurto(ft.data); }
    var fatos = [];
    if (fin && l.recebido > 0) fatos.push("<div><dt>Recebido</dt><dd>" + esc(moeda(l.recebido)) + "</dd></div>");
    if (fin && l.margem !== null && l.margem !== undefined) fatos.push("<div><dt>Margem</dt><dd>" + margemCelula(l, c) + "</dd></div>");
    if (mk.texto) fatos.push("<div><dt>Marco</dt><dd class=\"pv-marco-" + esc(mk.tom) + '">' + esc(mk.texto) + "</dd></div>");
    return '<li class="pv-gc" data-gopen="obras:' + esc(l.id) + '"><span class="pv-gc-foto" data-pn-foto="' + esc(l.id) + '" data-credito="' + esc(credito) + '"><span class="pv-gc-ph" aria-hidden="true">' + (ini ? "<i>" + esc(ini) + "</i>" : "") + "</span></span>"
      + '<div class="pv-gc-c"><div class="pv-gc-topo">' + pilStatus(l.status) + (d.texto ? '<span class="pv-desv pv-desv-' + esc(d.tom) + '">' + esc(d.texto) + "</span>" : "") + "</div>"
      + '<button type="button" class="pv-gc-nome" data-gopen="obras:' + esc(l.id) + '" title="' + esc(l.nome) + '">' + esc(l.nome) + "</button>" + duplaBarra(l)
      + (fatos.length ? '<dl class="pv-gc-fatos">' + fatos.join("") + "</dl>" : "") + "</div></li>";
  }
  /* o miolo da carteira (troca com a aba, a busca, a ordem e a vista sem refazer a tela inteira) */
  function obrasCorpo(m, c) {
    var est = c.obrasEstado || {}, v = PD().carteiraObras(m.obras.todas || [], { aba: est.aba, busca: est.busca, ordem: est.ordem, dir: est.dir });
    var fin = !!c.podeFin, html, vista = est.vista === "galeria" ? "galeria" : "tabela";
    /* v2.1: carteira COMPACTA no painel (8 linhas); "Ver todas" abre o resto sem sair da tela */
    var limite = est.todas ? 9999 : 6, escondidas = 0;
    if (vista === "tabela" && v.itens.length > limite) { escondidas = v.itens.length - limite; v.itens = v.itens.slice(0, limite); }
    if (!v.itens.length && !v.semMovimento.length) {
      var porque = v.busca ? 'Nenhuma obra com "' + esc(est.busca) + '" no nome.' : "Nenhuma obra " + ({ andamento: "em andamento", planejamento: "em planejamento", pausada: "pausada", concluida: "concluída", todas: "" }[v.aba] || "") + ".";
      html = '<div class="pv-vazio pv-vazio-linha"><b>' + porque + "</b><p>" + (v.busca ? "Confira a grafia ou limpe a busca." : (v.aba !== "todas" && v.cont.todas ? "Há " + N(v.cont.todas, "obra cadastrada", "obras cadastradas") + ". Veja todas." : "")) + "</p>"
        + (v.busca ? '<button type="button" class="pn-btn" data-gacao="painel-obras-limpar">Limpar busca</button>' : (v.aba !== "todas" && v.cont.todas ? '<button type="button" class="pn-btn pn-btn-p" data-gacao="painel-obras-aba" data-value="todas">Ver todas as obras</button>' : "")) + "</div>";
    } else if (vista === "galeria") {
      html = '<ul class="pv-galeria">' + v.itens.concat(v.semMovimento).map(function (l) { return cardGaleria(l, c, fin); }).join("") + "</ul>";
    } else {
      var cols = [{ k: "nome", r: "Obra" }, { k: null, r: "Físico e prazo" }, { k: "desvio", r: "Desvio" }]
        .concat(fin ? [{ k: "contratado", r: "Contratado", n: 1 }, { k: "recebido", r: "Recebido", n: 1 }, { k: "custo", r: "Custo pago", n: 1 }, { k: "margem", r: "Margem", n: 1 }, { k: "orcado", r: "Orçado e realizado" }] : [])
        .concat([{ k: "marco", r: "Próximo marco" }]);
      var th = cols.map(function (col) {
        if (!col.k) return '<th scope="col" class="pv-th-s">' + esc(col.r) + "</th>";
        var ativa = v.ordem === col.k, sort = ativa ? (v.dir === "asc" ? "ascending" : "descending") : "none";
        return '<th scope="col" class="' + (col.n ? "pv-num" : "") + '" aria-sort="' + sort + '"><button type="button" class="pv-th' + (ativa ? " on" : "") + '" data-gacao="painel-obras-ordem" data-value="' + col.k + '" title="Ordenar por ' + esc(col.r.toLowerCase()) + '">' + esc(col.r)
          + '<svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="M4 1 7 4.6H1z" fill="currentColor" opacity="' + (ativa && v.dir === "asc" ? 1 : 0.35) + '"/><path d="M4 11 1 7.4h6z" fill="currentColor" opacity="' + (ativa && v.dir === "desc" ? 1 : 0.35) + '"/></svg></button></th>';
      }).join("");
      var corpo = v.itens.map(function (l) { return linhaTab(l, c, fin); }).join("");
      var soma = { b: 0, r: 0, c: 0 };
      v.itens.forEach(function (l) { soma.b += l.base || 0; soma.r += l.recebido || 0; soma.c += l.custoPago || 0; });
      var pe = fin && v.itens.length > 1 ? '<tfoot><tr><th scope="row" colspan="3">Total de ' + N(v.itens.length, "obra", "obras") + '</th><td class="pv-num" data-rotulo="Contratado">' + esc(moeda(soma.b)) + '</td><td class="pv-num" data-rotulo="Recebido">' + esc(moeda(soma.r)) + '</td><td class="pv-num" data-rotulo="Custo pago">' + esc(moeda(soma.c)) + '</td><td colspan="3"></td></tr></tfoot>' : "";
      html = '<div class="pv-tabela-wrap"><table class="pv-tab pv-tab-obras"><caption class="pv-sr">Carteira de obras: físico, prazo, desvio' + (fin ? ", valores e orçado" : "") + ' e próximo marco</caption><thead><tr>' + th + "</tr></thead><tbody>" + corpo + "</tbody>" + pe + "</table></div>";
      if (escondidas) html += '<div class="pv-vertodas"><button type="button" class="pn-ctl" data-gacao="painel-obras-mais">Ver todas as ' + (v.itens.length + escondidas) + " obras</button></div>";
      if (v.semMovimento.length) {
        html += '<details class="pv-semmov"><summary>Mais ' + N(v.semMovimento.length, "obra", "obras") + " sem movimento</summary><ul>"
          + v.semMovimento.map(function (l) { return '<li><button type="button" class="pv-ob-link" data-gopen="obras:' + esc(l.id) + '">' + esc(l.nome) + "</button>" + pilStatus(l.status) + "</li>"; }).join("") + "</ul></details>";
      }
    }
    var ct = v.busca ? N(v.total, "obra encontrada", "obras encontradas") : N(v.total, "obra", "obras");
    return { html: html, ct: ct, aba: v.aba, cont: v.cont, ordem: v.ordem, dir: v.dir, vista: vista };
  }
  function blObras(m, c) {
    var fin = !!c.podeFin;
    if (!m.obras.total) {
      return '<section class="pv-card pv-obras" aria-labelledby="pv-ob-t">' + cab("Carteira de obras", "", "", "pv-ob-t")
        + vazio("Nenhuma obra cadastrada", "Cadastre a primeira obra, ou gere uma a partir de um orçamento aprovado. Com a obra criada, o avanço, o prazo e o caixa dela aparecem aqui.", '<button type="button" class="pn-btn pn-btn-p" data-view="obras">Cadastrar obra</button>') + "</section>";
    }
    var corpo = obrasCorpo(m, c), est = c.obrasEstado || {};
    var tab = function (id) {
      var n = id === "todas" ? corpo.cont.todas : corpo.cont[id], on = corpo.aba === id;
      if (!n && !on && id !== "andamento" && id !== "todas") return "";
      return '<button type="button" role="tab" class="pn-seg-b' + (on ? " on" : "") + '" aria-selected="' + (on ? "true" : "false") + '" data-gacao="painel-obras-aba" data-value="' + id + '">' + esc(ROT_STATUS[id]) + ' <span class="pn-seg-n">' + n + "</span></button>";
    };
    var vistaBt = function (id, rot) { var on = corpo.vista === id; return '<button type="button" class="pn-seg-b' + (on ? " on" : "") + '" aria-pressed="' + (on ? "true" : "false") + '" data-gacao="painel-obras-vista" data-value="' + id + '">' + rot + "</button>"; };
    var dir = '<div class="pn-seg" role="group" aria-label="Como mostrar as obras">' + vistaBt("tabela", "Tabela") + vistaBt("galeria", "Galeria") + "</div>";
    var sub = (fin ? "Valores acumulados desde o início, em regime de caixa. " : "") + "Barra de cima: o físico medido; a de baixo, o calendário consumido; a marca é hoje.";
    var nota = "";
    var sem = c.fin && c.fin.obrasSemOrcamento ? c.fin.obrasSemOrcamento : 0;
    if (fin && sem) nota = '<p class="pv-nota">' + esc(N(sem, "obra sem orçamento vinculado fica", "obras sem orçamento vinculado ficam")) + " sem a coluna de orçado. Vincule o orçamento em Obras para comparar o gasto com o previsto.</p>";
    return '<section class="pv-card pv-obras" aria-labelledby="pv-ob-t">' + cab("Carteira de obras", sub + (nota ? " " + semHtml(nota) : ""), '<span class="pv-ct" data-pn-ct aria-live="polite">' + esc(corpo.ct) + '</span><label class="pn-busca"><span class="pn-busca-r">Buscar obra</span><input type="search" data-pn-busca placeholder="Buscar obra" autocomplete="off" value="' + esc(est.busca || "") + '"></label>' + dir, "pv-ob-t")

      + '<div class="pv-obras-corpo" data-pn-corpo>' + corpo.html + "</div></section>";
  }

  /* ---------- peças comuns da v2.1 ---------- */
  var CTX = null;   /* o ctx do bloco que está sendo desenhado (cab precisa da dica flutuante; o desenho é síncrono) */
  function semHtml(s) { return String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim(); }
  /* o texto explicativo NÃO fica no meio da tela: vai para o ícone "i" (dica flutuante, também no foco e no toque) */
  function info(titulo, txt, extra) {
    var t = semHtml(txt);
    if (!t || !CTX || !CTX.gt) return "";
    return '<button type="button" class="pv-info" aria-label="Sobre ' + esc(titulo) + '"' + CTX.gt(titulo, extra || [], t) + ">i</button>";
  }
  function cab(titulo, sub, direita, id) {
    return '<div class="pv-cab"><div class="pv-cab-t"><h2' + (id ? ' id="' + id + '"' : "") + ">" + esc(titulo) + "</h2>" + info(titulo, sub) + "</div>" + (direita ? '<div class="pv-cab-d">' + direita + "</div>" : "") + "</div>";
  }
  function LG(c, cols) { return c.largura ? c.largura(cols) : (c.larguraGraf || 560); }
  var ICONES = {
    caixaHoje: '<path d="M3 7.5h15a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5zm0 0V6a2 2 0 0 1 2-2h11"/><circle cx="16.2" cy="13.8" r="1.3"/>',
    projetado: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/>',
    aReceber: '<path d="M4 4v16h16"/><path d="M19 5l-9 9"/><path d="M10 8.5V14h5.5"/>',
    aPagar: '<path d="M5 19L19 5"/><path d="M9.5 5H19v9.5"/><path d="M4 20h16"/>',
    margem: '<circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/><path d="M18 5.5L6 18.5"/>',
    saldoFaturar: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 17.5h4"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/>'
  };
  function icone(id) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[id] || "") + "</svg>"; }

  /* ---------- B. RESUMO DO DIA: frases do MOTOR (PainelDados.resumo), sem IA — faixa compacta ---------- */
  function blResumo(m, c) {
    var lis = (m.resumo || []).map(function (f) {
      var alvo = DESTINO_VIEW[f.destino], txt = esc(f.texto);
      var corpo = alvo ? '<button type="button" class="pv-fr-t" data-view="' + alvo + '">' + txt + "</button>" : '<span class="pv-fr-t">' + txt + "</span>";
      return '<li class="pv-fr pv-fr-' + esc(f.tom) + '"><i aria-hidden="true"></i>' + corpo + "</li>";
    }).join("");
    var ia = "";
    if (c.iaOferta) {
      ia = '<div class="pv-ia"><button type="button" class="pn-ctl pv-ia-bt" data-gacao="painel-analisar-ia" title="Manda só números somados (nada de nome de cliente, obra ou fornecedor) e traz uma leitura em texto. Se falhar, vale o resumo ao lado.">Analisar com IA</button>'
        + '<div class="pv-ia-saida" data-pv-ia aria-live="polite"' + (c.iaTexto ? "" : " hidden") + ">" + (c.iaTexto ? "<p>" + esc(c.iaTexto) + "</p><small>Leitura da IA sobre números somados. Confira nos blocos abaixo.</small>" : "") + "</div></div>";
    }
    return '<section class="pv-resumo" aria-labelledby="pv-res-t"><p class="pv-saud" id="pv-res-t">' + (c.saudacao || "Resumo do dia") + '</p><ul class="pv-frases">' + lis + "</ul>" + ia + "</section>";
  }

  /* ---------- C. OS 6 INDICADORES: cartão colorido, ícone em círculo, rótulo em maiúsculas, valor grande ---------- */
  function kpiHtml(k, m, c) {
    var margem = k.id === "margem", valorTxt = margem ? (k.valor === null ? "—" : fmtNumBR(k.valor, 1) + "%") : moeda(k.valor);
    var inc = margem && k.custoIncompleto && k.custoIncompleto.sim, fraco = margem && (k.valor === null || inc);
    var cls = "pv-kpi pv-k-" + k.id + (k.tom === "neg" ? " pv-kpi-neg" : "") + (fraco ? " pv-kpi-fraco" : "");
    var linhasGt = margem ? [["Margem de caixa", k.valor === null ? "sem dado" : fmtNumBR(k.valor, 1) + "%"], ["Meta", fmtNumBR(k.meta, 0) + "%"]] : [["Valor exato", c.fmtMoeda(k.valor)]];
    if (k.vencido) linhasGt.push(["Vencido", c.fmtMoeda(k.vencido.valor)]);
    var destino = k.ir === "medicoes" ? ' data-view="medicoes"' : ' data-gacao="graf-ir" data-destino="financeiro"', selo = "";
    if (inc) {
      var por = k.custoIncompleto.motivo === "sem-custo" ? "Nenhum custo pago lançado no período." : "O custo pago é " + Math.round(k.custoIncompleto.razao * 100) + "% do recebido. Abaixo de 15% a margem ainda não é confiável.";
      selo = '<span class="pv-selo pv-selo-aviso" title="' + esc(por) + '">custo incompleto</span>';
      linhasGt.push(["Atenção", por]);
    }
    var sub = "";
    if (k.vencido) sub = '<span class="pv-kpi-venc"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 1.2 11 10.5H1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 4.6v2.8M6 8.8v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><b>' + esc(moeda(k.vencido.valor)) + "</b> " + esc(N(k.vencido.n, "vencida", "vencidas")) + "</span>";
    else if (k.sub) sub = '<span class="pv-kpi-sub">' + esc(k.sub) + "</span>";
    return '<li class="pv-kpi-li"><button type="button" class="' + cls + '"' + destino + c.gt(k.rotulo, linhasGt, k.ajuda || "") + ">"
      + '<span class="pv-k-ic" aria-hidden="true">' + icone(k.id) + "</span>"
      + '<span class="pv-k-corpo"><span class="pv-kpi-r">' + esc(k.rotulo) + selo + '</span><span class="pv-kpi-v">' + esc(valorTxt) + "</span>"
      + (k.delta ? '<span class="pv-kpi-d">' + delta(k.delta) + "</span>" : "") + sub + "</span>" + spark(k.spark, k.sparkRotulo) + "</button></li>";
  }
  function blKpis(m, c) {
    if (!c.podeFin) return "";
    if (!c.temFin) return '<section class="pv-card pv-card-vazio"><h2 class="pv-sr">Indicadores principais</h2>' + vazio("Sem lançamentos no Financeiro ainda", "Registre uma receita ou uma despesa e o caixa, a previsão e a margem aparecem aqui.", '<button type="button" class="pn-btn pn-btn-p" data-view="financeiro">Abrir o Financeiro</button>') + "</section>";
    var cmp = m.comparacao;
    var nota = (cmp ? (cmp.existe ? "As variações são em relação " + cmp.rotuloPrep + " (" + diaCurto(cmp.ini) + " a " + diaCurto(cmp.fim) + "). " : "Não há lançamento pago " + cmp.rotuloPrep + " (" + diaCurto(cmp.ini) + " a " + diaCurto(cmp.fim) + "): sem variação para mostrar. ") : "Em “desde sempre” não há período para comparar. ")
      + "Setas sem variação: o sistema só guarda o que está em aberto agora, sem histórico.";
    return '<section class="pv-kpis-sec" aria-labelledby="pv-kpis-t"><h2 class="pv-sr" id="pv-kpis-t">Indicadores principais</h2><ul class="pv-kpis">' + m.kpis.map(function (k) { return kpiHtml(k, m, c); }).join("") + "</ul>"
      + '<span class="pv-kpis-info">' + info("Variações dos indicadores", nota) + "</span></section>";
  }

  /* ---------- D. FAIXA "PRECISA DE VOCÊ" (horizontal, compacta) ---------- */
  function blFila(m, c) {
    var dec = m.decisoes || [], n = dec.length;
    var cab_ = '<div class="pv-fila-cab"><h2 id="pv-fila-t">Precisa de você hoje</h2><p class="pv-sub">' + (n ? esc(N(n, "ponto", "pontos")) + (m.emJogo > 0 && c.podeFin ? ", " + esc(moeda(m.emJogo)) + " em jogo" : "") + (m.avisosDoSino ? ", inclui " + esc(N(m.avisosDoSino, "aviso do sino", "avisos do sino")) : "") : "nada pendente") + "</p>"
      + (n ? '<button type="button" class="pn-ctl pv-fila-todos" data-gacao="painel-fila-abrir">Ver ' + (n > 4 ? "os " + n : "todos") + "</button>" : "") + "</div>";
    if (!n) return '<section class="pv-fila pv-fila-vazia pn-hoje" aria-labelledby="pv-fila-t">' + cab_ + '<p class="pv-fila-ok">Nenhuma decisão esperando.</p></section>';
    var cards = escolherFila(dec, 4).map(function (x) {
      var t = c.decisao(x), quanto = quantoDe(x, c) || '<span class="pv-fq-tag">' + esc(x.tag || "") + "</span>";
      var grav = x.gravidade >= 3 ? "pv-g3" : (x.gravidade === 2 ? "pv-g2" : "pv-g1"), rotGrav = x.gravidade >= 3 ? "urgente" : (x.gravidade === 2 ? "atenção" : "informação");
      return '<li class="pv-fcard ' + grav + '"><span class="pv-fq"><i aria-hidden="true"></i><b>' + quanto + '</b><small class="pv-sr">' + rotGrav + "</small></span>"
        + '<span class="pv-ft" title="' + esc(String(t.titulo).replace(/<[^>]*>/g, "")) + '">' + t.titulo + "</span>"
        + '<span class="pv-fa">' + c.botao(x, t.botao) + "</span></li>";
    }).join("");
    return '<section class="pv-fila pn-hoje" aria-labelledby="pv-fila-t">' + cab_ + '<ol class="pv-fila-lista">' + cards + "</ol></section>";
  }

  /* ---------- BLOCO: RECEBIDO E PAGO POR MÊS (área suave com degradê; o "faturamento" mensal) ---------- */
  function blFaturamento(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var meses = m.caixa.porMes || [], cx = m.caixa, cmp = cx.cmp, n = meses.length;
    var inf = c.periodoRotulo + ", mês a mês. A área azul é o que foi recebido; a laranja, o que foi pago. Cada ponto traz o valor; passe o mouse ou toque na coluna para ver o mês inteiro. Variações em relação " + (cmp ? cmp.rotuloPrep : "ao período anterior") + ".";
    if (!n) return '<section class="pv-card pv-faturamento">' + cab("Recebido e pago por mês", inf) + vazio("Sem lançamentos pagos no período", "Quando houver receita ou despesa paga neste período, as áreas aparecem aqui.") + "</section>";
    var d = cmp && cmp.existe ? cmp.delta : {};
    var st = function (rot, valor, dl, bom, cor) { return '<li><span class="pv-st-r"><i style="background:' + cor + '"></i>' + rot + '</span><b class="pv-st-v">' + esc(moeda(valor)) + "</b>" + (dl ? delta({ pct: dl.pct, dir: dl.dir, bom: bom, rotulo: dl.pct === null || dl.pct === undefined ? "" : "vs. " + cmp.rotuloCurto }) : "") + "</li>"; };
    var totais = '<ul class="pv-stats">' + st("Recebido", cx.recebido, d.recebido, "alta", "var(--graf-a)") + st("Pago", cx.pago, d.pago, "baixa", "var(--graf-b)") + st("Resultado", cx.resultado, d.resultado, "alta", "var(--graf-c)") + "</ul>";
    var tips = meses.map(function (x) { var rot = mesCurto(x.mes); return { t: rot, l: [["Recebido", c.fmtMoeda(x.recebido), "var(--graf-a)"], ["Pago", c.fmtMoeda(x.pago), "var(--graf-b)"], ["Resultado do mês", c.fmtMoeda(x.recebido - x.pago)], ["Saldo acumulado", c.fmtMoeda(x.saldo), "var(--graf-c)"]], r: "Clique: abrir o Financeiro", aria: rot + ": recebido " + moeda(x.recebido) + ", pago " + moeda(x.pago) }; });
    var svg = graficoArea({ largura: LG(c, 8), altura: 140, rotulosX: meses.map(function (x) { return mesCurto(x.mes); }), series: [{ id: "a", cor: "var(--graf-a)", valores: meses.map(function (x) { return x.recebido; }) }, { id: "b", cor: "var(--graf-b)", valores: meses.map(function (x) { return x.pago; }) }], tips: tips, destino: "financeiro",
      resumo: "Recebido e pago por mês: recebido " + moeda(cx.recebido) + ", pago " + moeda(cx.pago) + ".", gt: function (tip) { return c.gt(tip.t, tip.l, tip.r); } });
    var leg = legenda([{ serie: "a", rotulo: "Recebido", forma: "barra", cor: "var(--graf-a)" }, { serie: "b", rotulo: "Pago", forma: "barra", cor: "var(--graf-b)" }]);
    return '<section class="pv-card pv-faturamento" aria-labelledby="pv-fat-t">' + cab("Recebido e pago por mês", inf, totais, "pv-fat-t") + '<div class="gt-graf pv-graf-box" data-gt-grafico>' + svg + leg + "</div></section>";
  }

  /* ---------- BLOCO: FLUXO DE CAIXA (barras com degradê + saldo em curva, eixo próprio) ---------- */
  function blFluxo(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var meses = m.caixa.porMes || [], cx = m.caixa, comp = cx.porMesComp, cmp = cx.cmp, n = meses.length;
    var inf = c.periodoRotulo + ", por mês. Barras no eixo da esquerda: recebido e pago. Linha no eixo da direita: saldo acumulado" + (comp ? ". Tracejado: o saldo " + (cmp ? cmp.rotuloPrep : "do período de comparação") : "") + ".";
    if (!n) return '<section class="pv-card pv-fluxo">' + cab("Fluxo de caixa e saldo", inf) + vazio("Sem lançamentos pagos no período", "Quando houver receita ou despesa paga neste período, as barras e o saldo aparecem aqui.") + "</section>";
    var cols = meses.map(function (x, i) {
      var rot = mesCurto(x.mes), cp = comp && comp[i] ? comp[i] : null, linhas = [["Recebido", c.fmtMoeda(x.recebido), "var(--graf-a)"], ["Pago", c.fmtMoeda(x.pago), "var(--graf-b)"], ["Resultado do mês", c.fmtMoeda(x.recebido - x.pago)], ["Saldo acumulado", c.fmtMoeda(x.saldo), "var(--graf-c)"]];
      if (cp) linhas.push(["Saldo na comparação (" + mesCurto(cp.mes) + ")", c.fmtMoeda(cp.saldo), "var(--texto-fraco)"]);
      return { rot: rot, a: x.recebido, b: x.pago, linha: x.saldo, comp: cp ? cp.saldo : null, atual: i === n - 1, tip: { t: rot, l: linhas, r: "Clique: abrir o Financeiro" }, aria: rot + ": recebido " + moeda(x.recebido) + ", pago " + moeda(x.pago) + ", saldo " + moeda(x.saldo) };
    });
    var ult = meses[n - 1];
    var svg = graficoBL({ largura: LG(c, 4), altura: 152, colunas: cols, destino: "financeiro", resumo: "Fluxo de caixa por mês, " + n + (n === 1 ? " mês" : " meses") + ": recebido " + moeda(cx.recebido) + ", pago " + moeda(cx.pago) + ", saldo acumulado ao final " + moeda(ult.saldo) + ".", gt: function (tip) { return c.gt(tip.t, tip.l, tip.r); } });
    var leg = legenda([{ serie: "a", rotulo: "Recebido", forma: "barra", cor: "var(--graf-a)" }, { serie: "b", rotulo: "Pago", forma: "barra", cor: "var(--graf-b)" }, { serie: "c", rotulo: "Saldo", forma: "linha", cor: "var(--graf-c)", valor: moeda(ult.saldo) }].concat(comp ? [{ serie: "p", rotulo: "Comparação", forma: "tracejada", cor: "var(--texto-fraco)" }] : []));
    var aviso = cx.custoIncompleto && cx.custoIncompleto.sim ? " Atenção: o pago cobre só " + Math.round((cx.custoIncompleto.razao || 0) * 100) + "% do recebido, então o saldo parece mais folgado do que o custo real da obra permite." : "";
    return '<section class="pv-card pv-fluxo" aria-labelledby="pv-fluxo-t">' + cab("Fluxo de caixa e saldo", inf + aviso, "", "pv-fluxo-t") + '<div class="gt-graf pv-graf-box" data-gt-grafico>' + svg + leg + "</div></section>";
  }

  /* ---------- BLOCOS: TOP 10 (obras por faturamento ou custo; fornecedores e maiores contas) ---------- */
  function seg2(acao, grupo, atual, opcoes) {
    return '<div class="pn-seg pv-seg2" role="group" aria-label="Escolher o ranking">' + opcoes.map(function (o) { var on = atual === o[0]; return '<button type="button" class="pn-seg-b' + (on ? " on" : "") + '" aria-pressed="' + (on ? "true" : "false") + '" data-gacao="' + acao + '" data-grupo="' + grupo + '" data-value="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>";
  }
  function blTopObras(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var modo = (c.top && c.top.obras) === "custo" ? "custo" : "faturamento";
    var itens = modo === "custo" ? m.porObra.map(function (o) { return { id: o.id, rotulo: o.nome, valor: o.valor, cor: "var(--graf-b)" }; }) : (m.topFaturamento || []).map(function (o) { return { id: o.id, rotulo: o.nome, valor: o.valor, cor: "var(--graf-a)" }; });
    var inf = modo === "custo" ? "As obras que mais gastaram, em dinheiro pago " + c.periodoRotulo + ". Clique numa obra para ver só ela no painel." : "As obras que mais receberam, acumulado desde o início (regime de caixa). Clique numa obra para ver só ela no painel.";
    var corpo = itens.length ? topLista(itens, { tom: modo === "custo" ? "laranja" : "verde", gt: c.gt, rotuloValor: modo === "custo" ? "Pago no período" : "Recebido (acumulado)", fmtExato: c.fmtMoeda }) : vazio(modo === "custo" ? "Sem despesa paga com obra" : "Nenhuma obra recebeu ainda", "Escolha a obra ao lançar a receita ou a despesa e o ranking aparece aqui.");
    return '<section class="pv-card pv-topobras" aria-labelledby="pv-tob-t">' + cab("Top 10 obras", inf, seg2("painel-top", "obras", modo, [["faturamento", "Faturamento"], ["custo", "Custo"]]), "pv-tob-t") + corpo + "</section>";
  }
  function blTopDespesas(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var modo = (c.top && c.top.desp) === "abertas" ? "abertas" : "pagas", f = m.topFornecedores || { pagas: [], abertas: [] };
    var itens = (modo === "abertas" ? f.abertas : f.pagas).map(function (x) { return { rotulo: x.rotulo, valor: x.valor, cor: modo === "abertas" ? "var(--graf-d)" : "var(--cat-material)" }; });
    var inf = modo === "abertas" ? "Os fornecedores (ou descrições) com mais contas ainda em aberto, somando tudo que falta pagar." : "Os fornecedores (ou descrições) que mais receberam em dinheiro pago " + c.periodoRotulo + ". O nome é o do fornecedor do lançamento; sem ele, a descrição.";
    var corpo = itens.length ? topLista(itens, { tom: modo === "abertas" ? "roxo" : "laranja", gt: c.gt, rotuloValor: modo === "abertas" ? "Em aberto" : "Pago no período", fmtExato: c.fmtMoeda }) : vazio(modo === "abertas" ? "Nada em aberto" : "Sem despesa paga no período", "Lance as despesas com o fornecedor e o ranking aparece aqui.");
    return '<section class="pv-card pv-topdesp" aria-labelledby="pv-tdp-t">' + cab("Top 10 fornecedores e contas", inf, seg2("painel-top", "desp", modo, [["pagas", "Pagos"], ["abertas", "A pagar"]]), "pv-tdp-t") + corpo + "</section>";
  }

  /* ---------- F. DESPESAS POR CATEGORIA: rosca com rótulo % no anel, legenda com R$ e % ---------- */
  function donut(itens, total, centro, c) {
    var R = 48, SW = 20, CC = 2 * Math.PI * R, off = 0, svg = "", rotAnel = "", tot = total > 0 ? total : 1;
    itens.forEach(function (it, ix) {
      var len = it.valor / tot * CC, folga = itens.length > 1 ? 2.5 : 0, dash = Math.max(0.6, len - folga), pct = Math.round(it.valor / tot * 100);
      svg += '<circle class="pv-fatia" cx="70" cy="70" r="' + R + '" fill="none" stroke="' + it.cor + '" stroke-width="' + SW + '" stroke-dasharray="' + fixo(dash, 2) + " " + fixo(CC, 2) + '" stroke-dashoffset="' + fixo(-off, 2) + '" transform="rotate(-90 70 70)" data-gt-serie="k' + ix + '" data-gt-k="' + ix + '" tabindex="0" role="img" aria-label="' + esc(it.rotulo + ": " + moeda(it.valor) + ", " + pct + "%") + '" data-gacao="graf-ir" data-destino="financeiro"'
        + c.gt(it.rotulo, [["Pago no período", c.fmtMoeda(it.valor), it.cor], ["Parte do total", pct + "%"]], "Clique: abrir o Financeiro") + "/>";
      if (pct >= 7) { var ang = (off + len / 2) / CC * 2 * Math.PI - Math.PI / 2; rotAnel += '<text class="pv-d-pct" data-gt-serie="k' + ix + '" x="' + fixo(70 + R * Math.cos(ang), 1) + '" y="' + fixo(70 + R * Math.sin(ang) + 3.5, 1) + '" text-anchor="middle">' + pct + "%</text>"; }
      off += len;
    });
    var leg = itens.map(function (it, ix) {
      var pct = Math.round(it.valor / tot * 100);
      return '<li data-gt-k="' + ix + '"><button type="button" class="pv-dl-b" data-gt-serie-bt="k' + ix + '" aria-pressed="true" title="Mostrar ou esconder: ' + esc(it.rotulo) + '"><i style="background:' + it.cor + '"></i><span class="pv-dl-n">' + esc(it.rotulo) + '</span><b class="pv-tn">' + esc(moeda(it.valor)) + '</b><em class="pv-tn">' + (pct === 0 && it.valor > 0 ? "<1" : pct) + "%</em></button></li>";
    }).join("");
    return '<div class="pv-donut" data-gt-grafico><svg viewBox="0 0 140 140" role="img" aria-label="' + esc(centro.rotulo + " " + centro.valor + ": " + itens.map(function (it) { return it.rotulo + " " + Math.round(it.valor / tot * 100) + "%"; }).join(", ")) + '"><circle cx="70" cy="70" r="' + R + '" fill="none" class="pv-trilho-d" stroke-width="' + SW + '"/>' + svg + rotAnel
      + (function () { var pt = String(centro.valor).split("\u00a0"), l1 = pt.length >= 3 ? pt[0] + " " + pt[1] : centro.valor, l2 = (pt.length >= 3 ? pt[2] + " " : "") + centro.rotulo; return '<text class="pv-d-val" x="70" y="68" text-anchor="middle">' + esc(l1) + '</text><text class="pv-d-rot" x="70" y="83" text-anchor="middle">' + esc(l2) + "</text>"; })() + '</svg><ul class="pv-dl">' + leg + "</ul></div>";
  }
  function blComposicao(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var cx = m.caixa, cats = m.categorias.map(function (x) { return { rotulo: c.catRotulo(x.cat), valor: x.valor, cor: c.catCor(x.cat) }; });
    if (cats.length > 6) { var resto = cats.slice(5).reduce(function (s, x) { return s + x.valor; }, 0); cats = cats.slice(0, 5).concat([{ rotulo: "Outras categorias", valor: resto, cor: "var(--cat-outros)" }]); }
    return '<section class="pv-card pv-composicao" aria-labelledby="pv-cat-t">' + cab("Despesas por categoria", "Dinheiro pago " + c.periodoRotulo + ", dividido pela categoria do lançamento. Clique numa fatia para abrir o Financeiro; clique na legenda para esconder uma categoria.", "", "pv-cat-t")
      + (cats.length ? donut(cats, cx.pago, { rotulo: "pago", valor: moeda(cx.pago) }, c) : vazio("Sem despesa paga no período", "Lance as despesas pagas no Financeiro, com a categoria, e a divisão aparece aqui.")) + "</section>";
  }

  /* ---------- I. LUCRATIVIDADE POR MÊS: área suave, só meses com dado, meta como faixa, selo de custo incompleto ----------
     ⚠ o eixo tem 10% de folga acima do maior valor e a área usa a largura INTEIRA do cartão (o dono viu 95% e 96% cortados no topo e
       um vazio sobrando à direita: o desenho antigo travava o máximo em 100% e deixava a margem direita do viewBox sem uso). */
  function blLucro(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var meta = c.metas.margem, todos = m.caixa.porMes || [], dados = todos.filter(function (x) { return x.comDado; }), vazios = todos.length - dados.length;
    var notas = [];
    if (dados.some(function (x) { return x.incompleto; })) notas.push("Marcador tracejado com asterisco: custo pago abaixo de 15% do recebido, o número ainda não é margem de verdade e não entra na curva.");
    if (dados.some(function (x) { return x.lucratividade === null; })) notas.push("Mês só com receita ou só com despesa não tem lucratividade para calcular e fica sem ponto.");
    if (vazios > 0) notas.push(N(vazios, "mês sem nenhum lançamento ficou", "meses sem nenhum lançamento ficaram") + " fora do gráfico.");
    var inf = "Resultado sobre o recebido, mês a mês, contra a meta de margem (a faixa verde é a zona acima da meta). " + notas.join(" ");
    if (!dados.length) return '<section class="pv-card pv-lucro" aria-labelledby="pv-luc-t">' + cab("Lucratividade por mês", inf, "", "pv-luc-t") + vazio("Nenhum mês com lançamento no período", "Quando houver receita e despesa pagas no mesmo mês, a lucratividade dele aparece aqui.") + "</section>";
    var boas = dados.map(function (x) { return (x.lucratividade !== null && !x.incompleto) ? x.lucratividade : null; });
    var fracas = dados.map(function (x) { return (x.lucratividade !== null && x.incompleto) ? x.lucratividade : null; });
    var tips = dados.map(function (x) {
      var rot = mesCurto(x.mes), v = x.lucratividade, linhas = [["Recebido", c.fmtMoeda(x.recebido), "var(--graf-a)"], ["Pago", c.fmtMoeda(x.pago), "var(--graf-b)"]];
      if (v === null) linhas.push(["Lucratividade", x.recebido > 0 ? "sem custo lançado" : "sem receita"]); else { linhas.push(["Lucratividade", fmtNumBR(v, 0) + "%"], ["Meta de margem", meta + "%"]); if (x.incompleto) linhas.push(["Atenção", "custo pago abaixo de 15% do recebido: o número não é margem de verdade"]); }
      return { t: rot, l: linhas, r: "", aria: rot + ": " + (v === null ? "sem custo lançado" : "lucratividade " + v + "%") };
    });
    var pct = function (v) { return fmtNumBR(v, 0) + "%"; };
    var svg = graficoArea({ largura: LG(c, 6), altura: 152, rotulosX: dados.map(function (x) { return mesCurto(x.mes); }), min: Math.min(0, Math.min.apply(null, dados.map(function (x) { return x.lucratividade === null ? 0 : x.lucratividade; }))),
      series: [{ id: "a", cor: "var(--verde)", valores: boas, fmt: pct }, { id: "c", cor: "var(--texto-fraco)", valores: fracas, area: false, fmt: function (v) { return pct(v) + "*"; } }],
      ticks: 5, fmt: function (v) { return Math.round(v) + "%"; }, meta: { v: meta, txt: "meta " + meta + "%" }, tips: tips,
      resumo: "Lucratividade por mês: " + dados.map(function (x) { return mesCurto(x.mes) + " " + (x.lucratividade === null ? "sem custo lançado" : x.lucratividade + "%" + (x.incompleto ? " (custo incompleto)" : "")); }).join(", ") + ". Meta " + meta + "%.", gt: function (tip) { return c.gt(tip.t, tip.l, tip.r); } });
    return '<section class="pv-card pv-lucro" aria-labelledby="pv-luc-t">' + cab("Lucratividade por mês", inf, "", "pv-luc-t") + '<div class="gt-graf pv-graf-box" data-gt-grafico>' + svg + "</div></section>";
  }

  /* ---------- CABEÇALHO E SEGMENTADORES (filtros em chips) ---------- */
  function chip(acao, valor, rot, on, extra) { return '<button type="button" class="pv-chipseg' + (on ? " on" : "") + '" data-gacao="' + acao + '" data-value="' + esc(valor) + '" aria-pressed="' + (on ? "true" : "false") + '"' + (extra || "") + ">" + esc(rot) + "</button>"; }
  function segmentadores(m, c) {
    var s = c.seg || {};
    var html = '<section class="pv-seg" aria-label="Filtros do painel">';
    html += '<div class="pv-seg-g"><span class="pv-seg-t">Período</span><div class="pv-seg-c">' + ["mes", "6m", "ano", "tudo"].map(function (p) { return chip("dash-periodo", p, { mes: "Este mês", "6m": "6 meses", ano: "Este ano", tudo: "Tudo" }[p], s.per === p); }).join("") + "</div></div>";
    if (c.podeFin) html += '<div class="pv-seg-g"><span class="pv-seg-t">Comparar com</span><div class="pv-seg-c">' + chip("dash-cmp", "anterior", "Período anterior", s.cmp === "anterior", s.cmpOff ? " disabled" : "") + chip("dash-cmp", "ano", "Ano passado", s.cmp === "ano", s.cmpOff ? " disabled" : "") + "</div></div>";
    html += '<div class="pv-seg-g pv-seg-obra"><span class="pv-seg-t">Obra</span><div class="pv-seg-c">' + (s.obraHtml || "") + "</div></div>";
    html += '<div class="pv-seg-g"><span class="pv-seg-t">Status das obras</span><div class="pv-seg-c">' + ["todas", "andamento", "planejamento", "pausada", "concluida"].map(function (st) { return chip("painel-status", st, ROT_STATUS[st], (s.status || "todas") === st); }).join("") + "</div></div>";
    return html + "</section>";
  }
  function topo(m, c) {
    var t = c.topo || {}, ic = '<span class="mod-ic" aria-hidden="true">' + (c.icone ? c.icone("dashboard") : "") + "</span>";
    var modelo = '<div class="pn-seg pv-modelo" role="group" aria-label="Modelo do painel">' + [["a", "Modelo A"], ["b", "Modelo B"]].map(function (o) { var on = t.modelo === o[0]; return '<button type="button" class="pn-seg-b' + (on ? " on" : "") + '" aria-pressed="' + (on ? "true" : "false") + '" data-gacao="painel-modelo" data-value="' + o[0] + '" title="' + (o[0] === "a" ? "Executivo BI, claro" : "Central escura") + '">' + o[1] + "</button>"; }).join("") + "</div>";
    var auto = '<label class="pn-filtro pv-auto">Auto <select data-gacao="painel-auto" title="Atualiza sozinho a cada N minutos, enquanto o painel está aberto">' + [[0, "desligada"], [1, "1 min"], [5, "5 min"], [10, "10 min"], [30, "30 min"]].map(function (o) { return '<option value="' + o[0] + '"' + (t.auto === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
    var mais = (typeof global.Modulo !== "undefined" && global.Modulo.mais) ? global.Modulo.mais([t.metasHtml || "", t.criarDemoHtml || ""].filter(Boolean)) : "";
    return '<header class="mod-cab pv-topo"><div class="mod-tit">' + ic + '<div><h1>Painel de Gestão</h1><p class="mod-sub">' + (t.subHtml || "") + "</p></div></div>"
      + '<div class="pv-acoes">' + modelo
      + '<div class="pv-atualiza"><button type="button" class="pv-bt pv-bt-prim" data-gacao="painel-atualizar" title="Recalcula tudo agora">Atualizar</button><span class="pv-atualiz" data-pv-atualiz aria-live="polite">Atualizado às ' + esc(t.hora || "") + "</span>" + auto + "</div>"
      + '<div class="pv-vistas"><button type="button" class="pn-ctl pv-bt" data-gacao="painel-expandir" aria-pressed="' + (t.tv ? "true" : "false") + '" title="Tela cheia, sem o menu lateral (modo TV). Esc sai.">Expandir</button><button type="button" class="pn-ctl pv-bt" data-gacao="painel-reduzir" aria-pressed="' + (t.compacto ? "true" : "false") + '" title="' + (t.tv ? "Sai da tela cheia" : "Modo compacto: menos espaço entre os cartões") + '">Reduzir</button></div>'
      + '<div class="pv-vistas"><button class="btn" data-gacao="painel-imprimir" title="Abre o painel numa janela de impressão; salve como PDF">Relatório</button><button class="btn" data-gacao="painel-organizar" title="Escolher quais blocos aparecem e em que ordem">Organizar</button>' + mais + "</div></div></header>";
  }

  /* ---------- H. COMERCIAL ---------- */
  function blComercial(m, c) {
    if (!c.podeMod("orcamentos")) return "";
    var co = m.comercial;
    if (!co || !co.temDado) return '<section class="pv-card pv-comercial" aria-labelledby="pv-com-t">' + cab("Comercial", "orçamentos e propostas", "", "pv-com-t")
      + vazio("Nenhum orçamento ainda", "Crie o primeiro orçamento: o funil, o valor médio e a conversão em venda passam a aparecer aqui.", '<button type="button" class="pn-btn pn-btn-p" data-acao="novo">Novo orçamento</button>') + "</section>";
    var maxV = Math.max.apply(null, co.faixas.map(function (f) { return f.valor; })) || 1;
    var visiveis = co.faixas.filter(function (f) { return f.n > 0; }), ocultas = co.faixas.length - visiveis.length;
    var funil = '<ol class="pv-funil">' + visiveis.map(function (f) {
      var w = f.n ? Math.max(3, Math.round(f.valor / maxV * 100)) : 0;
      return '<li class="pv-fu pv-fu-' + f.id + (f.n ? "" : " pv-fu-zero") + '"><span class="pv-fu-n">' + esc(f.rotulo) + '</span><span class="pv-fu-b"><i style="width:' + w + '%"></i></span><b class="pv-tn">' + f.n + '</b><span class="pv-fu-v pv-tn">' + (f.n ? esc(moeda(f.valor)) : "—") + "</span></li>";
    }).join("") + "</ol>" + "";
    var conv = co.conversao === null ? '<span class="pv-fraco">sem proposta enviada</span>' : fmtNumBR(co.conversao, 0) + "%";
    var stats = '<dl class="pv-cstats">'
      + '<div><dt>Carteira</dt><dd class="pv-tn" title="Soma do preço de venda de todos os orçamentos: o mesmo número da tela Orçamentos">' + esc(moeda(co.carteira)) + "</dd><small>" + esc(N(co.total, "orçamento", "orçamentos")) + "</small></div>"
      + '<div><dt>Valor médio</dt><dd class="pv-tn">' + esc(moeda(co.medio)) + "</dd><small>por orçamento</small></div>"
      + '<div><dt>Conversão</dt><dd class="pv-tn" title="Propostas aceitas dividido pelas enviadas ao cliente">' + conv + "</dd><small>" + (co.enviadas ? esc(co.aceitas + " de " + N(co.enviadas, "enviada", "enviadas")) : "aceitas de enviadas") + "</small></div>"
      + '<div><dt>Em aberto</dt><dd class="pv-tn">' + esc(moeda(co.emAberto.valor)) + "</dd><small>" + esc(N(co.emAberto.n, "orçamento", "orçamentos")) + "</small></div></dl>";
    var top = co.top.length ? '<div class="pv-top"><h3>Maiores em aberto</h3><ol>' + co.top.slice(0, 5).map(function (o) {
      return '<li><button type="button" class="pv-top-i" data-abrir="' + esc(o.id) + '" title="Abrir o orçamento"><span class="pv-top-n">' + esc(o.nome || "Sem nome") + (o.cliente ? "<small>" + esc(o.cliente) + "</small>" : "") + '</span><span class="pv-top-s">' + esc(o.rotuloFaixa) + '</span><b class="pv-tn">' + esc(moeda(o.valor)) + "</b></button></li>";
    }).join("") + "</ol></div>" : "";
    var alertaTxt = co.semResposta.length ? esc(N(co.semResposta.length, "proposta enviada espera", "propostas enviadas esperam")) + " resposta há mais de " + co.limiteSemResposta + " dias (" + esc(moeda(co.semResposta.reduce(function (s, x) { return s + x.valor; }, 0))) + "). Um telefonema resolve mais que uma proposta nova." : "";
    return '<section class="pv-card pv-comercial" aria-labelledby="pv-com-t">' + cab("Comercial", "Todos os orçamentos da empresa, em qualquer obra. Carteira = soma do preço de venda; conversão = aceitas ÷ enviadas ao cliente. " + alertaTxt, '<button type="button" class="pn-ctl" data-view="orcamentos">Abrir Orçamentos</button>', "pv-com-t")
      + '<div class="pv-com-grade"><div class="pv-com-esq">' + stats + funil + "</div>" + top + "</div></section>";
  }

  /* ---------- I. LUCRATIVIDADE POR MÊS: só meses com dado, meta como faixa, selo de custo incompleto ---------- */
  /* ---------- J. METAS: medidor só para meta definida; sem meta vira chip ---------- */
  function gauge(rotulo, valorTxt, atingido, metaTxt, titulo, fraco, c) {
    var W = 180, H = 104, cx = 90, cy = 90, r = 70, L = Math.PI * r;
    var vazio_ = atingido === null || atingido === undefined;
    var frac = vazio_ ? 0 : Math.max(0, Math.min(1.5, atingido)) / 1.5;
    var cls = vazio_ ? "pv-g-vazio" : (atingido >= 1 ? "pv-g-ok" : (atingido >= 0.7 ? "pv-g-aten" : "pv-g-ruim"));
    var arco = "M" + (cx - r) + "," + cy + " A" + r + "," + r + " 0 0,1 " + (cx + r) + "," + cy;
    var am = Math.PI * (1 - 1 / 1.5), mx = cx + r * Math.cos(Math.PI - am), my = cy - r * Math.sin(Math.PI - am), mx2 = cx + (r + 11) * Math.cos(Math.PI - am), my2 = cy - (r + 11) * Math.sin(Math.PI - am);
    return '<div class="pv-gauge ' + cls + (fraco ? " pv-g-fraco" : "") + '" data-gacao="graf-ir" data-destino="metas" tabindex="0" role="button"' + c.gt(rotulo, [["Atingido", valorTxt], ["Meta", metaTxt]], (titulo ? titulo + ". " : "") + "Clique: ajustar as metas") + '><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(rotulo + ": " + valorTxt + ", meta " + metaTxt) + '">'
      + '<path class="pv-g-trilho" d="' + arco + '"/><path class="pv-g-fill" d="' + arco + '" stroke-dasharray="' + fixo(L * frac, 1) + " " + fixo(L + 2, 1) + '"/><line class="pv-g-meta" x1="' + fixo(mx, 1) + '" y1="' + fixo(my, 1) + '" x2="' + fixo(mx2, 1) + '" y2="' + fixo(my2, 1) + '"/>'
      + '<text class="pv-g-val" x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle">' + esc(valorTxt) + "</text></svg>"
      + '<div class="pv-g-rot">' + esc(rotulo) + "<span>meta " + esc(metaTxt) + "</span></div></div>";
  }
  function blMetas(m, c) {
    if (!c.podeFin || !c.temFin) return "";
    var cx = m.caixa, ms = m.metas, itens = [], chips = [], inc = cx.custoIncompleto && cx.custoIncompleto.sim;
    itens.push(gauge("Margem de caixa", cx.margem === null ? "—" : fmtNumBR(cx.margem, 1) + "%", cx.margem === null ? null : ms.margem.atingido, fmtNumBR(c.metas.margem, 0) + "%", inc ? "Custo incompleto: o número ainda não é margem de verdade" : "Resultado de caixa dividido pelo recebido no período", inc || cx.margem === null, c));
    if (ms.recebimento) itens.push(gauge("Recebimento", moeda(ms.recebimento.valor), ms.recebimento.atingido, moeda(ms.recebimento.meta), c.fmtMoeda(ms.recebimento.metaMes) + " por mês, " + N(ms.recebimento.meses, "mês", "meses"), false, c));
    else chips.push('<button type="button" class="pv-chip-meta" data-gacao="dash-metas">Definir meta de recebimento</button>');
    if (ms.ppc.valor !== null) itens.push(gauge("PPC da semana", ms.ppc.valor + "%", ms.ppc.atingido, fmtNumBR(c.metas.ppc, 0) + "%", "Tarefas feitas sobre as comprometidas na semana do Last Planner", false, c));
    return '<section class="pv-card pv-metas" aria-labelledby="pv-met-t">' + cab("Metas", "O arco vai até 150% da meta; a marca é a meta. Meta indefinida vira o botão “Definir meta”.", '<button type="button" class="pn-ctl" data-gacao="dash-metas">Ajustar metas</button>', "pv-met-t")
      + '<div class="pv-gauges">' + itens.join("") + "</div>" + (chips.length ? '<div class="pv-chips-meta">' + chips.join("") + "</div>" : "") + "</section>";
  }

  /* ---------- L. AGENDA: só os dias com evento; vazio vira uma linha ---------- */
  function blAgenda(m, c) {
    var a = m.agenda, nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    var rotTipo = { vencimento: "Pagar", entrega: "Entrega da obra", medicao: "Medição", recebimento: "Receber", compra: "Compra", tarefa: "Tarefa" };
    var visivel = function (ev) {
      if (ev.tipo === "vencimento" || ev.tipo === "recebimento") return !!c.podeFin;
      if (ev.tipo === "medicao") return c.podeMod("medicoes");
      if (ev.tipo === "compra") return c.podeMod("compras");
      if (ev.tipo === "tarefa") return c.podeMod("tarefas");
      return true;
    };
    var total = 0;
    var dias = (a.dias || []).map(function (d) { var evs = d.eventos.filter(visivel); total += evs.length; return { d: d, evs: evs }; }).filter(function (x) { return x.evs.length; });
    var linhas = dias.map(function (x) {
      var dt = new Date(x.d.data + "T00:00:00"), rot = (x.d.hoje ? "Hoje" : nomes[dt.getDay()]) + " " + x.d.data.slice(8, 10);
      var chips = x.evs.slice(0, 4).map(function (ev) {
        var alvo = ev.view ? ' data-view="' + esc(ev.view) + '"' : "";
        var tit = ev.titulo + (ev.obraNome && ev.obraNome !== ev.titulo ? ", " + ev.obraNome : "") + (ev.detalhe ? ", " + ev.detalhe : "");
        return '<button type="button" class="pv-ev pv-ev-' + esc(ev.tipo) + '"' + alvo + ' title="' + esc(rotTipo[ev.tipo] + ": " + tit) + '"><i aria-hidden="true"></i><span class="pv-ev-t"><b>' + esc(rotTipo[ev.tipo] || "") + "</b> " + esc(ev.titulo) + "</span>"
          + (ev.valor && c.podeFin ? '<span class="pv-ev-v pv-tn">' + esc(moeda(ev.valor)) + "</span>" : "") + "</button>";
      }).join("") + (x.evs.length > 4 ? '<span class="pv-ev-mais">+' + (x.evs.length - 4) + " mais</span>" : "");
      return '<li class="pv-dia' + (x.d.hoje ? " pv-dia-hoje" : "") + '"><span class="pv-dia-r">' + esc(rot) + '</span><div class="pv-dia-e">' + chips + "</div></li>";
    });
    var atras = [];
    if (c.podeFin && a.atrasados && a.atrasados.contas.n) atras.push('<button type="button" class="pv-chip pv-chip-alerta" data-view="financeiro"><b>' + esc(moeda(a.atrasados.contas.valor)) + "</b> em " + esc(N(a.atrasados.contas.n, "conta já vencida", "contas já vencidas")) + "</button>");
    if (c.podeMod("tarefas") && a.atrasados && a.atrasados.tarefas) atras.push('<button type="button" class="pv-chip pv-chip-alerta" data-view="tarefas"><b>' + esc(N(a.atrasados.tarefas, "tarefa atrasada", "tarefas atrasadas")) + "</b></button>");
    if (c.podeMod("medicoes") && a.medicoesAAprovar) atras.push('<button type="button" class="pv-chip pv-chip-aviso" data-view="medicoes"><b>' + esc(N(a.medicoesAAprovar, "medição", "medições")) + "</b> a aprovar</button>");
    return '<section class="pv-card pv-agenda" aria-labelledby="pv-ag-t">' + cab("Próximos 7 dias", total ? esc(N(total, "compromisso", "compromissos")) + " com data" : "", "", "pv-ag-t")
      + (atras.length ? '<div class="pv-chips"><span class="pv-chips-r">Já passou ou espera por você</span>' + atras.join("") + "</div>" : "")
      + (linhas.length ? '<ol class="pv-semana">' + linhas.join("") + "</ol>" : '<p class="pv-vazio-linha-t">Nada marcado nos próximos 7 dias.</p>') + "</section>";
  }

  /* ---------- K. OPERAÇÃO: contadores numa linha; Last Planner e metragem expandem ---------- */
  function blOperacao(m, c) {
    var op = m.operacao, itens = [], detalhes = [], podeMod = c.podeMod;
    var cont = function (rot, val, sub, subCls, attrs) { return '<li><button type="button" class="pv-op" ' + attrs + '><span class="pv-op-r">' + rot + '</span><b class="pv-op-v pv-tn">' + val + "</b>" + (sub ? '<span class="pv-op-s' + (subCls ? " " + subCls : "") + '">' + sub + "</span>" : "") + "</button></li>"; };
    if (podeMod("medicoes")) itens.push(cont("Medições a aprovar", op.medicoesAAprovar, op.aprovadasSemPgto.n ? esc(N(op.aprovadasSemPgto.n, "aprovada aguarda", "aprovadas aguardam")) + " pagamento" : "", "", 'data-view="medicoes"'));
    if (op.pendentes && op.pendentes.total) {
      var partes = [];
      if (op.pendentes.medicoes) partes.push(N(op.pendentes.medicoes, "medição", "medições"));
      if (op.pendentes.compras) partes.push(N(op.pendentes.compras, "pedido", "pedidos"));
      if (op.pendentes.requisicoes) partes.push(N(op.pendentes.requisicoes, "requisição", "requisições"));
      if (op.pendentes.producao) partes.push(op.pendentes.producao + " de produção");
      var viewPend = op.pendentes.medicoes ? "medicoes" : (op.pendentes.compras ? "compras" : (op.pendentes.requisicoes ? "requisicoes" : "producao"));
      itens.push(cont("Pendentes de aprovação", op.pendentes.total, esc(partes.join(", ") + (m.filtrado ? ", de todas as obras" : "")), "pv-op-aviso", 'data-view="' + viewPend + '"'));
    }
    if (podeMod("compras")) itens.push(cont("Compras em aberto", op.comprasAbertas, "requisições e pedidos", "", 'data-view="compras"'));
    if (op.lp) {
      itens.push(cont("Last Planner, semana", (op.lp.ppc === null ? "—" : Math.round(op.lp.ppc * 100) + "%") + " <small>PPC</small>", esc(op.lp.impedida ? N(op.lp.impedida, "impedimento", "impedimentos") + ", " + op.lp.execucao + " em execução" : op.lp.execucao + " em execução, " + N(op.lp.liberada, "liberada", "liberadas")), op.lp.impedida ? "pv-op-alerta" : "", 'data-view="lastplanner"'));
      detalhes.push('<details class="pv-detalhe"><summary>Last Planner da semana</summary><div class="pv-detalhe-c"><dl class="pv-fatos">'
        + "<div><dt>PPC</dt><dd class=\"pv-tn" + (op.lp.ppc === null ? " pv-fraco" : (op.lp.ppc * 100 >= c.metas.ppc ? " pv-ok" : " pv-ruim")) + '">' + (op.lp.ppc === null ? "—" : Math.round(op.lp.ppc * 100) + "%") + "</dd></div>"
        + '<div><dt>Feitas e comprometidas</dt><dd class="pv-tn">' + op.lp.feitas + " de " + op.lp.comprometidas + "</dd></div><div><dt>Em execução</dt><dd class=\"pv-tn\">" + op.lp.execucao + "</dd></div><div><dt>Liberadas</dt><dd class=\"pv-tn\">" + op.lp.liberada + "</dd></div>"
        + '<div><dt>Impedimentos</dt><dd class="pv-tn' + (op.lp.impedida ? " pv-alerta" : " pv-ok") + '">' + op.lp.impedida + '</dd></div></dl><button type="button" class="pn-btn" data-view="lastplanner">Abrir o quadro</button></div></details>');
    }
    if (op.tarefas && (op.tarefas.afazer || op.tarefas.atrasadas)) itens.push(cont("Tarefas", op.tarefas.afazer + " <small>a fazer</small>", op.tarefas.atrasadas ? esc(N(op.tarefas.atrasadas, "atrasada", "atrasadas")) : "", op.tarefas.atrasadas ? "pv-op-alerta" : "", 'data-view="tarefas"'));
    if (podeMod("rdo")) itens.push(cont("Diários (RDO)", op.rdos, "", "", 'data-view="rdo"'));
    if (op.m2) {
      itens.push(cont("Executado nos diários", esc(fmtNumBR(op.m2.executado, 0)) + " <small>m²</small>", esc(fmtNumBR(op.m2.atribuido, 0)) + " m² com dono e aprovados", "", 'data-view="producao"'));
      if (op.m2.porServico && op.m2.porServico.length) detalhes.push('<details class="pv-detalhe"><summary>Metragem por serviço</summary><div class="pv-detalhe-c">' + (c.barH ? c.barH(op.m2.porServico) : "") + (op.m2.aviso ? '<p class="pv-nota">' + esc(op.m2.aviso) + "</p>" : "") + "</div></details>");
    }
    if (op.retencao > 0 && c.podeFin) itens.push(cont("Retenção presa", esc(moeda(op.retencao)), "em contratos vivos", "", 'data-gacao="abrir-retencao"'));
    if (!itens.length) return "";
    return '<section class="pv-card pv-operacao" aria-labelledby="pv-op-t">' + cab("Operação", "Contadores de " + (c.escopoRotulo || "todas as obras") + ". Last Planner e metragem expandem abaixo.", "", "pv-op-t") + '<ul class="pv-ops" aria-label="Contadores de operação">' + itens.join("") + "</ul>" + (detalhes.length ? '<div class="pv-detalhes">' + detalhes.join("") + "</div>" : "") + "</section>";
  }

  /* blocos meia-largura vizinhos formam par; o que sobra sem par ocupa a linha inteira.
     `lista` = [{id, larg, html}] já sem os escondidos e sem os que vieram vazios. */
  function agrupar(lista) {
    var out = [], i = 0;
    while (i < lista.length) {
      var b = lista[i];
      if (b.larg === "meia" && lista[i + 1] && lista[i + 1].larg === "meia") { out.push({ tipo: "par", itens: [b, lista[i + 1]] }); i += 2; }
      else { out.push({ tipo: "cheia", itens: [b] }); i++; }
    }
    return out;
  }

  /* ---------- ABAS: um cartão para vários gráficos (ver PainelDados.ABAS_BLOCOS) ----------
     Todas as abas já nascem no HTML (as dicas, o foco e os testes enxergam o gráfico de cada uma); só a ativa aparece.
     A troca é feita por `painel-aba` sem redesenhar o painel. ⚠ `role="group"` + aria-pressed, como os outros segmentadores:
     setas não são obrigatórias, Tab anda entre as abas. */
  function abas(g, membros, ativo) {
    if (!membros || !membros.length) return "";
    var ids = membros.map(function (x) { return x.id; });
    if (ids.indexOf(ativo) < 0) ativo = ids[0];
    var bt = membros.map(function (x) {
      var on = x.id === ativo;
      return '<button type="button" class="pn-seg-b' + (on ? " on" : "") + '" aria-pressed="' + (on ? "true" : "false") + '" data-gacao="painel-aba" data-grupo="' + esc(g.id) + '" data-value="' + esc(x.id) + '">' + esc((g.rotulos && g.rotulos[x.id]) || x.id) + "</button>";
    }).join("");
    var ps = membros.map(function (x) { return '<div class="pv-aba-p" data-bloco="' + esc(x.id) + '"' + (x.id === ativo ? "" : " hidden") + ">" + x.html + "</div>"; }).join("");
    return '<div class="pv-abas-cartao" data-abas="' + esc(g.id) + '"><div class="pn-seg pv-abas" role="group" aria-label="' + esc(g.nome) + ': escolher o gráfico">' + bt + "</div>" + ps + "</div>";
  }

  var PainelUI = {
    abas: abas,
    escala: escala, colocar: colocar, retRotulo: retRotulo, cruzaLinha: cruzaLinha, graficoBL: graficoBL, spark: spark, delta: delta, agrupar: agrupar, escolherFila: escolherFila,
    obrasCorpo: function (m, c) { CTX = c; return obrasCorpo(m, c); }, filaCompleta: filaCompleta, duplaBarra: duplaBarra,
    topo: topo, segmentadores: segmentadores, graficoArea: graficoArea, suave: suave, topLista: topLista, icone: icone,
    blocos: (function () { var b = { resumo: blResumo, kpis: blKpis, faturamento: blFaturamento, composicao: blComposicao, fluxo: blFluxo, topobras: blTopObras, topdespesas: blTopDespesas, obras: blObras, comercial: blComercial, lucro: blLucro, previsao: blPrevisao, metas: blMetas, agenda: blAgenda, operacao: blOperacao }, o = {};
      Object.keys(b).forEach(function (k) { o[k] = function (m, c) { CTX = c; return b[k](m, c); }; });
      return o; })(),
    fila: function (m, c) { CTX = c; return blFila(m, c); }
  };
  global.PainelUI = PainelUI;
  if (typeof module !== "undefined" && module.exports) module.exports = PainelUI;
})(typeof window !== "undefined" ? window : this);

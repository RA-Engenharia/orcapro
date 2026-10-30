/* =====================================================================
 * arqdiagrama.js — MOTOR DE DIAGRAMAÇÃO DAS PRANCHAS DE ARQUITETURA (puro, ES5, sem DOM, Node-testável).
 *
 * O PROBLEMA: o gerador (js/arqpranchas.js) desenhava UMA folha por conteúdo — planta existente numa folha, demolir noutra, cortes
 *   noutra… — e a planta ocupava 1/4 da área útil de uma A1; as folhas INT (A3) saíam com uma vista só e metade em branco.
 *
 * O MOTOR: cada desenho vira um BLOCO RÍGIDO (planta, corte, fachada, vista, quadro, lista…) já na escala dele; o motor distribui
 *   os blocos nas folhas para ter o MENOS de folhas e o MENOS de branco, dentro do formato.
 *
 *   ArqDiagrama.capturar(D, fn)                       roda fn() desenhando em D (js/acopranchas.js Desenho) e devolve o que ela desenhou como bloco
 *   ArqDiagrama.deslocarBloco(b, dx, dy)              o mesmo bloco, deslocado (as coordenadas do SVG são REESCRITAS: nada de transform, o DXF lê igual)
 *   ArqDiagrama.empacotar(blocos, area, opcoes)       Maximal Rectangles (melhor encaixe pelo lado curto) com várias ordenações; respeita blocos FIXADOS
 *   ArqDiagrama.escolherFormato(candidatos, meta)     AUTO: o menos de folhas entre os formatos que chegam a 55 % de ocupação
 *   ArqDiagrama.compor(Dnovo, folha, blocos, area)    junta os blocos colocados num Desenho novo (traços, caixas de texto e SVG, para a conferência de sobreposição)
 *   ArqDiagrama.conferir(folha, area, gap)            blocos sobrepostos, blocos cortados (fora da área), espaço mínimo entre blocos
 *   ArqDiagrama.ajustar(blocos, area, res, mudancas)  o usuário move um bloco de folha/posição; ele fica FIXADO e o resto é re-empacotado
 *   ArqDiagrama.layoutDe(res) / fixosDe(layout)       o arranjo que se grava (por obra) e volta como blocos fixados
 *
 * REGRAS: espaço mínimo de 15 mm entre blocos; margem de 2 mm até a borda da área útil (que já exclui moldura, coluna de notas e carimbo RA);
 *   o BLOCO é a caixa da tinta (linhas, preenchimentos e textos) com o título do desenho; nada é cortado nem redimensionado aqui.
 * Teste: tools/test-arqdiagrama.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n3(v) { return String(Math.round(v * 1000) / 1000); }
  var GAP = 15, MARGEM = 2, META = 0.55;
  var EPS = 1e-6;

  /* ------------------------------------------------------------ CAIXA DA TINTA */
  function numeros(s) { var r = [], re = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, m; while ((m = re.exec(s))) r.push(parseFloat(m[0])); return r; }
  function atributo(s, nome) { var m = new RegExp("\\s" + nome + '="([^"]*)"').exec(s); return m ? m[1] : null; }
  /* a caixa [x0, y0, x1, y1] de um trecho de SVG (linha, polígono, retângulo, círculo, imagem) — o texto vem das caixas `tb` do Desenho */
  function caixaDaParte(p) {
    var tag = /^<(\w+)/.exec(p); if (!tag) return null;
    tag = tag[1];
    var sw = num(atributo(p, "stroke-width"), 0) / 2;
    if (tag === "line") { var x1 = num(atributo(p, "x1"), 0), y1 = num(atributo(p, "y1"), 0), x2 = num(atributo(p, "x2"), 0), y2 = num(atributo(p, "y2"), 0); return [Math.min(x1, x2) - sw, Math.min(y1, y2) - sw, Math.max(x1, x2) + sw, Math.max(y1, y2) + sw]; }
    if (tag === "polygon" || tag === "polyline") {
      var v = numeros(atributo(p, "points") || ""); if (v.length < 4) return null;
      var a = [Infinity, Infinity, -Infinity, -Infinity];
      for (var i = 0; i + 1 < v.length; i += 2) { a[0] = Math.min(a[0], v[i]); a[2] = Math.max(a[2], v[i]); a[1] = Math.min(a[1], v[i + 1]); a[3] = Math.max(a[3], v[i + 1]); }
      return [a[0] - sw, a[1] - sw, a[2] + sw, a[3] + sw];
    }
    if (tag === "rect" || tag === "image") { var x = num(atributo(p, "x"), 0), y = num(atributo(p, "y"), 0), w = num(atributo(p, "width"), 0), h = num(atributo(p, "height"), 0); return [x - sw, y - sw, x + w + sw, y + h + sw]; }
    if (tag === "circle") { var cx = num(atributo(p, "cx"), 0), cy = num(atributo(p, "cy"), 0), r = num(atributo(p, "r"), 0); return [cx - r - sw, cy - r - sw, cx + r + sw, cy + r + sw]; }
    return null;
  }
  function uniao(a, b) { if (!b) return a; if (!a) return b.slice(); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
  function caixaDoBloco(b) {
    var box = null;
    arr(b.s).forEach(function (p) { box = uniao(box, caixaDaParte(p)); });
    arr(b.tb).forEach(function (t) { box = uniao(box, t); });
    arr(b.sg).forEach(function (s) { box = uniao(box, [Math.min(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[0], s[2]), Math.max(s[1], s[3])]); });
    return box;
  }

  /* ------------------------------------------------------------ CAPTURAR UM DESENHO COMO BLOCO */
  function marca(D) { return { s: D.s.length, sg: D.sg.length, tb: D.tb.length, cx: D.caixas ? D.caixas.length : 0, mk: arr(D.mascaras).length }; }
  function recorte(D, m0, m1) {
    var b = { s: D.s.slice(m0.s, m1.s), sg: D.sg.slice(m0.sg, m1.sg), sgc: arr(D.sgc).slice(m0.sg, m1.sg), tb: D.tb.slice(m0.tb, m1.tb), caixas: D.caixas ? D.caixas.slice(m0.cx, m1.cx) : null, mascaras: arr(D.mascaras).slice(m0.mk || 0, m1.mk || 0) };   /* R02: as máscaras brancas viajam com o bloco */
    b.box = caixaDoBloco(b);
    return b;
  }
  /* roda fn e devolve o bloco do que ela desenhou (res = o que fn devolveu); sem tinta → box null */
  function capturar(D, fn) {
    var m0 = marca(D), res = fn(), m1 = marca(D), b = recorte(D, m0, m1);
    b.res = res; b.faixa = [m0, m1];
    return b;
  }
  /* o que ficou de fora dos blocos já capturados (faixas), como um bloco só: a tinta solta de uma folha (ex.: o aviso "erro ao desenhar") */
  function resto(D, faixas) {
    var ord = faixas.slice().sort(function (a, b) { return a[0].s - b[0].s; }), b = { s: [], sg: [], sgc: [], tb: [], caixas: D.caixas ? [] : null, mascaras: [] }, i0 = { s: 0, sg: 0, tb: 0, cx: 0, mk: 0 };
    function junta(m0, m1) { var r = recorte(D, m0, m1); b.s = b.s.concat(r.s); b.sg = b.sg.concat(r.sg); b.sgc = b.sgc.concat(r.sgc); b.tb = b.tb.concat(r.tb); if (r.caixas) b.caixas = b.caixas.concat(r.caixas); b.mascaras = b.mascaras.concat(arr(r.mascaras)); }
    var cur = i0;
    ord.forEach(function (f) { junta(cur, f[0]); cur = f[1]; });
    junta(cur, marca(D));
    b.box = caixaDoBloco(b);
    return b;
  }

  /* ------------------------------------------------------------ DESLOCAR (reescreve as coordenadas) */
  function somaAttr(s, nomes, d) {
    var re = new RegExp("(\\s)(" + nomes + ')="(-?[0-9.]+(?:e[-+]?[0-9]+)?)"', "gi");
    return s.replace(re, function (_, sp, nome, v) { return sp + nome + '="' + n3(parseFloat(v) + d) + '"'; });
  }
  function deslocarParte(p, dx, dy) {
    var s = p;
    s = somaAttr(s, "x|x1|x2|cx", dx); s = somaAttr(s, "y|y1|y2|cy", dy);
    s = s.replace(/(\spoints=")([^"]*)(")/, function (_, a, pts, c) {
      return a + pts.trim().split(/\s+/).map(function (q) { var v = q.split(","); return n3(parseFloat(v[0]) + dx) + "," + n3(parseFloat(v[1]) + dy); }).join(" ") + c;
    });
    s = s.replace(/rotate\(([-0-9.e+]+) ([-0-9.e+]+) ([-0-9.e+]+)\)/, function (_, a, x, y) { return "rotate(" + a + " " + n3(parseFloat(x) + dx) + " " + n3(parseFloat(y) + dy) + ")"; });
    return s;
  }
  function deslocarBloco(b, dx, dy) {
    var o = {};
    Object.keys(b).forEach(function (k) { o[k] = b[k]; });
    o.s = arr(b.s).map(function (p) { return deslocarParte(p, dx, dy); });
    o.sg = arr(b.sg).map(function (g) { return [g[0] + dx, g[1] + dy, g[2] + dx, g[3] + dy]; });
    o.tb = arr(b.tb).map(function (t) { return [t[0] + dx, t[1] + dy, t[2] + dx, t[3] + dy]; });
    o.caixas = b.caixas ? b.caixas.map(function (c) { return { s: c.s, p: c.p.map(function (q) { return [q[0] + dx, q[1] + dy]; }) }; }) : null;
    o.mascaras = arr(b.mascaras).map(function (t) { return [t[0] + dx, t[1] + dy, t[2] + dx, t[3] + dy]; });
    o.box = b.box ? [b.box[0] + dx, b.box[1] + dy, b.box[2] + dx, b.box[3] + dy] : null;
    return o;
  }

  /* ------------------------------------------------------------ O EMPACOTADOR (Maximal Rectangles) */
  function Folha(W, H) { this.W = W; this.H = H; this.livres = [{ x: 0, y: 0, w: W, h: H }]; this.itens = []; }
  Folha.prototype.melhor = function (w, h, modo) {
    var best = null;
    for (var i = 0; i < this.livres.length; i++) {
      var f = this.livres[i];
      if (f.w + EPS < w || f.h + EPS < h) continue;
      var s1, s2;
      if (modo === "bl") { s1 = f.y + h; s2 = f.x; } else { var lw = f.w - w, lh = f.h - h; s1 = Math.min(lw, lh); s2 = Math.max(lw, lh); }
      if (!best || s1 < best.s1 - EPS || (Math.abs(s1 - best.s1) <= EPS && (s2 < best.s2 - EPS || (Math.abs(s2 - best.s2) <= EPS && (f.y < best.y - EPS || (Math.abs(f.y - best.y) <= EPS && f.x < best.x))))))
        best = { x: f.x, y: f.y, s1: s1, s2: s2 };
    }
    return best;
  };
  Folha.prototype.ocupar = function (x, y, w, h) {
    var novos = [];
    this.livres.forEach(function (f) {
      if (x >= f.x + f.w - EPS || x + w <= f.x + EPS || y >= f.y + f.h - EPS || y + h <= f.y + EPS) { novos.push(f); return; }
      if (x > f.x + EPS) novos.push({ x: f.x, y: f.y, w: x - f.x, h: f.h });
      if (x + w < f.x + f.w - EPS) novos.push({ x: x + w, y: f.y, w: f.x + f.w - x - w, h: f.h });
      if (y > f.y + EPS) novos.push({ x: f.x, y: f.y, w: f.w, h: y - f.y });
      if (y + h < f.y + f.h - EPS) novos.push({ x: f.x, y: y + h, w: f.w, h: f.y + f.h - y - h });
    });
    function contem(b, a) { return a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS; }
    this.livres = novos.filter(function (a, i) {
      for (var j = 0; j < novos.length; j++) {
        if (i === j) continue;
        if (contem(novos[j], a) && (!contem(a, novos[j]) || j < i)) return false;
      }
      return true;
    });
  };
  Folha.prototype.livreEm = function (x, y, w, h) {
    for (var i = 0; i < this.livres.length; i++) { var f = this.livres[i]; if (x >= f.x - EPS && y >= f.y - EPS && x + w <= f.x + f.w + EPS && y + h <= f.y + f.h + EPS) return true; }
    return false;
  };

  var ORDENS = {
    area: function (a, b) { return b.w * b.h - a.w * a.h || a.ordem - b.ordem; },
    altura: function (a, b) { return b.h - a.h || b.w - a.w || a.ordem - b.ordem; },
    largura: function (a, b) { return b.w - a.w || b.h - a.h || a.ordem - b.ordem; },
    serie: function (a, b) { return a.ordem - b.ordem; },
    lado: function (a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h) || a.ordem - b.ordem; }
  };

  /* uma rodada: ordem (nome) e modo ("bssf" | "bl"); `agrupar`: os blocos do mesmo grupo vão juntos, o grupo maior primeiro */
  function rodada(itens, W, H, gap, margem, ordem, modo, agrupar) {
    var CW = W - 2 * margem + gap, CH = H - 2 * margem + gap, folhas = [], naoCabe = [], avisos = [];
    function nova() { var f = new Folha(CW, CH); folhas.push(f); return f; }
    var fixos = itens.filter(function (it) { return it.fixo; }), livres = itens.filter(function (it) { return !it.fixo; });
    fixos.sort(function (a, b) { return a.fixo.folha - b.fixo.folha; });
    var soltos = [];
    fixos.forEach(function (it) {
      var k = Math.max(1, Math.round(it.fixo.folha)), x = it.fixo.x - margem, y = it.fixo.y - margem, w = it.w + gap, h = it.h + gap;
      if (x < -EPS || y < -EPS || x + w > CW + EPS || y + h > CH + EPS || k > 60) { avisos.push("bloco " + it.id + ": a posição fixada saiu da área: voltou ao automático"); soltos.push(it); return; }
      while (folhas.length < k) nova();
      var f = folhas[k - 1];
      if (!f.livreEm(x, y, w, h)) { avisos.push("bloco " + it.id + ": a posição fixada bate em outro bloco: voltou ao automático"); soltos.push(it); return; }
      f.ocupar(x, y, w, h); f.itens.push({ it: it, x: x + margem, y: y + margem, fixo: true });
    });
    livres = livres.concat(soltos);
    var lista;
    if (agrupar) {
      var gr = {}, ordemG = [];
      livres.forEach(function (it) { var g = it.grupo || it.id; if (!gr[g]) { gr[g] = []; ordemG.push(g); } gr[g].push(it); });
      var cmp = ORDENS[ordem] || ORDENS.area;
      ordemG.forEach(function (g) { gr[g].sort(cmp); });
      ordemG.sort(function (a, b) { return cmp(gr[a][0], gr[b][0]); });
      lista = []; ordemG.forEach(function (g) { lista = lista.concat(gr[g]); });
    } else lista = livres.slice().sort(ORDENS[ordem] || ORDENS.area);
    lista.forEach(function (it) {
      var w = it.w + gap, h = it.h + gap, melhor = null, fi = -1;
      for (var i = 0; i < folhas.length; i++) {
        var p = folhas[i].melhor(w, h, modo); if (!p) continue;
        var mesmo = it.grupo && folhas[i].itens.some(function (q) { return q.it.grupo === it.grupo; }) ? 0 : 1;
        var chave = [mesmo, p.s1, p.s2];
        if (!melhor || chave[0] < melhor.chave[0] || (chave[0] === melhor.chave[0] && (chave[1] < melhor.chave[1] - EPS || (Math.abs(chave[1] - melhor.chave[1]) <= EPS && chave[2] < melhor.chave[2])))) { melhor = { p: p, chave: chave }; fi = i; }
      }
      if (!melhor) {
        var f = nova(), p2 = f.melhor(w, h, modo);
        if (!p2) {   /* não cabe nem sozinho na folha: fica sozinho, na origem, e o chamador é avisado (nunca em silêncio) */
          naoCabe.push(it.id); f.itens.push({ it: it, x: margem, y: margem, fixo: false, naoCabe: true }); f.livres = []; return;
        }
        melhor = { p: p2 }; fi = folhas.length - 1;
      }
      folhas[fi].ocupar(melhor.p.x, melhor.p.y, w, h);
      folhas[fi].itens.push({ it: it, x: melhor.p.x + margem, y: melhor.p.y + margem, fixo: false });
    });
    return { folhas: folhas, naoCabe: naoCabe, avisos: avisos };
  }
  function afinidade(folhas) {
    var s = 0;
    folhas.forEach(function (f) { var n = {}; f.itens.forEach(function (q) { var g = q.it.grupo; if (g) n[g] = (n[g] || 0) + 1; }); Object.keys(n).forEach(function (g) { s += n[g] * (n[g] - 1) / 2; }); });
    return s;
  }
  function pontuacao(r, area) {
    var A = area.w * area.h, ocup = r.folhas.map(function (f) { var u = 0; f.itens.forEach(function (q) { u += q.it.w * q.it.h; }); return u / A; });
    var sq = ocup.reduce(function (s, o) { return s + o * o; }, 0);
    return { n: r.folhas.length - r.folhas.filter(function (f) { return !f.itens.length; }).length, naoCabe: r.naoCabe.length, sq: sq, af: afinidade(r.folhas) };
  }

  /* blocos: [{ id, w, h, grupo, ordem, fixo? {folha, x, y} }]; area: { w, h } em mm.
     Devolve { folhas: [{ itens: [{ id, x, y, w, h, fixo }], ocupacao }], naoCabe, avisos, ocupacaoMedia } com as folhas numeradas pela ordem de série (as de bloco fixado ficam no número que o usuário deu). */
  function empacotar(blocos, area, opcoes) {
    var o = opcoes || {}, gap = o.gap != null ? o.gap : GAP, margem = o.margem != null ? o.margem : MARGEM, W = area.w, H = area.h;
    var itens = arr(blocos).map(function (b, i) { return { id: b.id, w: b.w, h: b.h, grupo: b.grupo || null, ordem: b.ordem != null ? b.ordem : i, fixo: b.fixo && isFinite(b.fixo.folha) ? { folha: b.fixo.folha, x: num(b.fixo.x, 0), y: num(b.fixo.y, 0) } : null }; });
    if (!itens.length) return { folhas: [], naoCabe: [], avisos: [], ocupacaoMedia: 0 };
    var melhor = null, melhorP = null;
    var cfg = [["area", "bssf", false], ["area", "bssf", true], ["altura", "bssf", false], ["largura", "bssf", false], ["lado", "bssf", false], ["area", "bl", false], ["altura", "bl", false], ["largura", "bl", true], ["serie", "bssf", false], ["serie", "bl", false], ["lado", "bl", true]];
    cfg.forEach(function (c) {
      var r = rodada(itens, W, H, gap, margem, c[0], c[1], c[2]), p = pontuacao(r, area);
      if (!melhor || p.naoCabe < melhorP.naoCabe || (p.naoCabe === melhorP.naoCabe && (p.n < melhorP.n || (p.n === melhorP.n && (p.af > melhorP.af || (p.af === melhorP.af && p.sq > melhorP.sq)))))) { melhor = r; melhorP = p; }
    });
    return finalizar(melhor, area, itens);
  }
  /* as folhas na ordem de série; a folha que tem bloco fixado ocupa o número fixado */
  function finalizar(r, area, itens) {
    var A = area.w * area.h, folhas = r.folhas.filter(function (f) { return f.itens.length; }).map(function (f) {
      var min = Infinity, pin = null, u = 0;
      f.itens.forEach(function (q) { min = Math.min(min, q.it.ordem); if (q.fixo && (pin == null || q.it.fixo.folha < pin)) pin = q.it.fixo.folha; u += q.it.w * q.it.h; });
      return { f: f, min: min, pin: pin, ocup: u / A };
    });
    var N = folhas.length, ocupado = {}, saida = new Array(N);
    folhas.filter(function (x) { return x.pin != null; }).sort(function (a, b) { return a.pin - b.pin; }).forEach(function (x) {
      var k = Math.min(N, Math.max(1, Math.round(x.pin))) - 1; while (ocupado[k] && k < N - 1) k++; while (ocupado[k] && k > 0) k--;
      ocupado[k] = 1; saida[k] = x;
    });
    folhas.filter(function (x) { return x.pin == null; }).sort(function (a, b) { return a.min - b.min; }).forEach(function (x) { for (var k = 0; k < N; k++) if (!saida[k]) { saida[k] = x; break; } });
    var res = { folhas: [], naoCabe: r.naoCabe.slice(), avisos: r.avisos.slice(), area: { w: area.w, h: area.h } };
    saida.forEach(function (x) {
      res.folhas.push({ itens: x.f.itens.map(function (q) { return { id: q.it.id, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, w: q.it.w, h: q.it.h, fixo: !!q.fixo, naoCabe: !!q.naoCabe }; }), ocupacao: x.ocup });
    });
    res.ocupacaoMedia = res.folhas.length ? res.folhas.reduce(function (s, f) { return s + f.ocupacao; }, 0) / res.folhas.length : 0;
    void itens;
    return res;
  }

  /* ------------------------------------------------------------ O FORMATO (AUTO) */
  /* candidatos: [{ formato, res, ok }] — ok=false (escala fora do padrão, bloco que não cabe) tira o formato da disputa se houver outro.
     VÁLIDO = toda folha, fora a última, chegou à meta de 55 % (uma folha só: 40 %); entre os válidos, o de MENOR PAPEL TOTAL (folhas × área do formato); empate: menos folhas.
     Se nenhum chegar lá, o de maior ocupação média (empate: menos folhas). Isto evita a A0 com uma folha 30 % cheia e a A3 com 30 folhas. */
  function avaliar(c, meta) {
    var f = c.res.folhas, med = c.res.ocupacaoMedia, ult = f.length - 1, minOutras = Infinity, m = meta || META;
    f.forEach(function (x, i) { if (i < ult) minOutras = Math.min(minOutras, x.ocupacao); });
    var ok = c.ok !== false && !arr(c.res.naoCabe).length;
    /* a meta é POR FOLHA (a última pode ficar menor); formato de uma folha só precisa de 40 % (senão a A0 quase vazia sempre ganharia) */
    return { formato: c.formato, folhas: f.length, ocupacaoMedia: med, minimaForaUltima: minOutras === Infinity ? null : minOutras, ok: ok,
      valido: ok && (f.length === 1 ? f[0].ocupacao >= 0.40 - 1e-9 : minOutras >= m - 1e-9) };
  }
  var PAPEL_M2 = { A0: 1.189 * 0.841, A1: 0.841 * 0.594, A2: 0.594 * 0.420, A3: 0.420 * 0.297 };
  function escolherFormato(candidatos, meta) {
    var av = arr(candidatos).map(function (c) { var a = avaliar(c, meta); a.papel = Math.round(a.folhas * (PAPEL_M2[c.formato] || 0) * 100) / 100; return a; }), pool = av.filter(function (a) { return a.ok; });
    if (!pool.length) pool = av.slice();
    var validos = pool.filter(function (a) { return a.valido; }), esc = null;
    if (validos.length) {
      validos.sort(function (a, b) { return a.papel - b.papel || a.folhas - b.folhas; });
      esc = validos[0];
    } else {
      pool.sort(function (a, b) { return b.ocupacaoMedia - a.ocupacaoMedia || a.papel - b.papel; });
      esc = pool[0];
    }
    return { formato: esc ? esc.formato : null, escolhido: esc, candidatos: av, motivo: esc ? (esc.valido ? "menor papel total (" + (Math.round(esc.papel * 100) / 100) + " m², " + esc.folhas + " folha(s)) entre os formatos com toda folha, fora a última, a " + Math.round((meta || META) * 100) + " % ou mais" : "nenhum formato chega a " + Math.round((meta || META) * 100) + " % por folha: o de maior ocupação média") : "sem formato" };
  }

  /* ------------------------------------------------------------ COMPOR A FOLHA */
  /* blocos: mapa id → bloco (com box); folha: res.folhas[i]; area: { x, y, w, h } (a área útil da folha de papel).
     Devolve { D, colocados: [{ id, x, y, w, h (em mm de papel), fixo }] } com o Desenho D preenchido */
  /* o número do título de cada desenho ("01 PLANTA BAIXA") é o da ordem de leitura DENTRO da folha onde o bloco caiu: o texto marcado
     data-titulo-numero (js/arqestilo.js) é reescrito; "01" e "02" têm a mesma largura, a caixa do texto não muda */
  function renumerar(b, k) {
    var out = {}; Object.keys(b).forEach(function (q) { out[q] = b[q]; });
    var nn = ("0" + k).slice(-2);
    out.s = arr(b.s).map(function (p) { return /data-titulo-numero="1"/.test(p) ? p.replace(/(>)(\d+)(<\/text>)$/, "$1" + nn + "$3") : p; });
    return out;
  }
  function compor(D, folha, blocos, area, opcoes) {
    var col = [], o = opcoes || {};
    var ordemLeitura = folha.itens.slice().sort(function (a, b) { return Math.abs(a.y - b.y) < 20 ? a.x - b.x : a.y - b.y; }), pos = {};
    ordemLeitura.forEach(function (q, i) { pos[q.id] = i + 1; });
    folha.itens.forEach(function (q) {
      var b0 = blocos[q.id]; if (!b0 || !b0.box) return;
      var b = o.numerar === false ? b0 : renumerar(b0, pos[q.id]);
      var X = area.x + q.x, Y = area.y + q.y, dx = X - b.box[0], dy = Y - b.box[1], s = deslocarBloco(b, dx, dy);
      D.s.push('<g data-bloco="' + q.id.replace(/"/g, "'") + '" data-x="' + n3(X) + '" data-y="' + n3(Y) + '" data-w="' + n3(q.w) + '" data-h="' + n3(q.h) + '">');
      s.s.forEach(function (p) { D.s.push(p); });
      D.s.push("</g>");
      s.sg.forEach(function (g, i) { D.sg.push(g); D.sgc[D.sg.length - 1] = s.sgc[i]; });
      s.tb.forEach(function (t) { D.tb.push(t); });
      if (D.caixas && s.caixas) s.caixas.forEach(function (c) { D.caixas.push(c); });
      arr(s.mascaras).forEach(function (m) { (D.mascaras = D.mascaras || []).push(m); });
      col.push({ id: q.id, x: X, y: Y, w: q.w, h: q.h, fixo: !!q.fixo, tinta: s.box });
    });
    return { D: D, colocados: col };
  }

  /* ------------------------------------------------------------ CONFERIR */
  function inter(a, b, g) { return a.x < b.x + b.w + g - EPS && a.x + a.w > b.x - g + EPS && a.y < b.y + b.h + g - EPS && a.y + a.h > b.y - g + EPS; }
  /* colocados: da compor(); area em mm de papel. Sobrepostos = menos que o espaço mínimo; cortados = a tinta sai da área útil. */
  function conferir(colocados, area, gap) {
    var g = gap != null ? gap : GAP, out = { sobrepostos: [], pertoDemais: [], cortados: [] }, L = arr(colocados);
    for (var i = 0; i < L.length; i++) {
      var a = L[i], t = a.tinta;
      if (t && (t[0] < area.x - 0.01 || t[1] < area.y - 0.01 || t[2] > area.x + area.w + 0.01 || t[3] > area.y + area.h + 0.01)) out.cortados.push(a.id);
      for (var j = i + 1; j < L.length; j++) {
        var b = L[j];
        if (inter(a, b, 0)) out.sobrepostos.push(a.id + " × " + b.id);
        else if (inter(a, b, g - 0.01)) out.pertoDemais.push(a.id + " × " + b.id);
      }
    }
    out.total = out.sobrepostos.length + out.pertoDemais.length + out.cortados.length;
    return out;
  }

  /* ------------------------------------------------------------ O ARRANJO QUE SE GRAVA E O AJUSTE DO USUÁRIO */
  function layoutDe(res, extra) {
    var o = { versao: 1, folhas: res.folhas.map(function (f, i) { return { n: i + 1, itens: f.itens.map(function (q) { return { id: q.id, x: q.x, y: q.y, fixo: !!q.fixo }; }) }; }) };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  /* só os blocos FIXADOS voltam como { id: { folha, x, y } } (os automáticos são refeitos a cada geração) */
  function fixosDe(layout) {
    var m = {};
    arr(layout && layout.folhas).forEach(function (f) { arr(f.itens).forEach(function (q) { if (q.fixo) m[q.id] = { folha: f.n, x: q.x, y: q.y }; }); });
    return m;
  }
  function aplicarFixos(blocos, fixos) {
    return arr(blocos).map(function (b) { var o = {}; Object.keys(b).forEach(function (k) { o[k] = b[k]; }); if (fixos && fixos[b.id]) o.fixo = fixos[b.id]; return o; });
  }
  /* mudancas: [{ id, folha, x, y }] (fixa o bloco ali) ou [{ id, soltar: true }]. O resto é re-empacotado em volta. */
  function ajustar(blocos, area, res, mudancas, opcoes) {
    var fixos = fixosDe(layoutDe(res));
    arr(mudancas).forEach(function (m) { if (m.soltar) delete fixos[m.id]; else fixos[m.id] = { folha: m.folha, x: m.x, y: m.y }; });
    return empacotar(aplicarFixos(blocos, fixos), area, opcoes);
  }
  /* "Reorganizar": solta tudo e refaz */
  function reorganizar(blocos, area, opcoes) { return empacotar(aplicarFixos(blocos.map(function (b) { var o = {}; Object.keys(b).forEach(function (k) { o[k] = b[k]; }); delete o.fixo; return o; }), {}), area, opcoes); }

  var ArqDiagrama = { VERSAO: 1, GAP: GAP, MARGEM: MARGEM, META: META, capturar: capturar, resto: resto, marca: marca, recorte: recorte, caixaDoBloco: caixaDoBloco, caixaDaParte: caixaDaParte, deslocarBloco: deslocarBloco, deslocarParte: deslocarParte,
    empacotar: empacotar, escolherFormato: escolherFormato, avaliar: avaliar, compor: compor, conferir: conferir, layoutDe: layoutDe, fixosDe: fixosDe, aplicarFixos: aplicarFixos, ajustar: ajustar, reorganizar: reorganizar };
  global.ArqDiagrama = ArqDiagrama;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqDiagrama;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

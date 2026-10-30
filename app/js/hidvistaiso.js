/* =====================================================================
 * hidvistaiso.js — HIDRO-3D: a VISTA "Isométrico do ambiente" SALVA NO SISTEMA (como a vista do Revit) — motor PURO (ES5, Node-testável).
 *
 * O conceito (pedido do Rogério, 29/10/2026): a PRANCHA NÃO DESENHA o isométrico — ela coloca a VISTA do sistema (viewport). A vista é um registro do
 * modelo (`bim_vistas`, campo `hidIso`), que o usuário abre, ajusta e reaproveita:
 *   - ambiente × grupo de sistema, caixa de corte do ambiente, quadrante da câmera (SE/SO/NE/NO), isométrico 30°;
 *   - VISIBILIDADE GRÁFICA salva na vista: arquitetura transparente clara com aresta fina, louças só em contorno cinza, instalações do grupo em
 *     destaque (opacas, cor do padrão RA por sistema), outros sistemas ocultos;
 *   - ANOTAÇÕES (balões de código, rótulos de DN, chamadas de peça especial, cotas de altura) LIGADAS À PEÇA: a chave de cada marcação é o id da peça/trecho
 *     do modelo — se a peça se move, a marcação segue; se a peça some, a marcação fica ÓRFÃ (listada, não apagada em silêncio);
 *   - posição de cada marcação: AUTOMÁTICA (colunas alinhadas fora do desenho, sem cruzar chamadas, sem pousar em tubo) ou MANUAL (o usuário arrasta; a
 *     posição vai para `anot.manual[chave]` como DESLOCAMENTO em relação à peça, em mm; o auto-posicionamento seguinte NÃO desfaz o que ele moveu).
 *
 * Este arquivo só COMPÕE as anotações (geometria em mm de papel) e as desenha no `Desenho` da folha. O desenho do isométrico em si é o render do
 * modelo 3D (js/hidrender3d.js); a folha/tela que mostram a vista chamam as MESMAS funções (js/hidpranchas.js folhaPerspectiva, js/hidcaderno.js).
 *
 *   HidVistaIso.nova(o)                       → o bloco `hidIso` de uma vista nova
 *   HidVistaIso.registro(o)                   → o registro `bim_vistas` (id estável por obra × ambiente × grupo × tipo)
 *   HidVistaIso.compor(D, vista, dados)       → { itens, orfaos, avisos, cruzamentos, omitidos }   (desenha em D)
 *   HidVistaIso.mover(vista, chave, ...)      → grava a posição manual (deslocamento em mm @ vista.k); soltar(vista, chave) volta ao automático
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — módulo de DESENHO (mm de papel, px, proporção de vista, cores): nenhum valor de norma aqui (valor de norma vem só da biblioteca de normas, fora deste módulo) */
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* medidas em mm de PAPEL (a vista é desenhada na escala da folha; o tamanho das marcações não muda com o zoom) */
  var K = {
    raio: 3.5,            /* balão pequeno: círculo de ~7 mm (como a folha da Tânia) */
    hBalao: 2.3,          /* texto do balão (código) em ~2,3 mm; a quantidade (x5) sai FORA do círculo */
    hChamada: 2.2,        /* chamada de peça especial (itálico) */
    hRotulo: 2.0,         /* "ES ø40", "+0,51" */
    folga: 0.6,           /* folga mínima entre marcações */
    passo: 2.2,           /* vão entre itens da mesma coluna */
    colFolga: 3,          /* da coluna ao desenho */
    colW: 30,             /* largura reservada de cada lado para as colunas */
    caminhos: [1, 0],     /* ordem dos lados de preferência */
    distancias: [0.8, 2.4, 4.4, 7, 10, 14, 19, 25],
    longe: 2.2,           /* acima disso o texto solto ganha chamada até a peça */
    quadrantes: ["SE", "SO", "NE", "NO"],
    tinta: "#222222", fio: 0.2, fioChamada: 0.15, caixaCor: "#7a7a7a"
  };
  var VIS_PADRAO = {
    arquitetura: { estilo: "transparente", opacidade: 0.2, aresta: "#8c8c8c", piso: 0.30 },
    louca: { estilo: "contorno", cor: "#9a9a9a" },
    instalacao: { destaque: true, cor: "sistema", opaca: true },
    outrosSistemas: "oculto"
  };

  function nova(o) {
    o = o || {};
    var a = o.ambiente || {}, cx = o.caixa || a;
    return {
      versao: 1, tipo: o.tipo === "planta" ? "planta" : "iso",
      ambiente: { id: txt(a.id), nome: txt(a.nomeBase || a.nome) },
      grupo: txt(o.grupo || "esgoto"), quadrante: K.quadrantes.indexOf(o.quadrante) >= 0 ? o.quadrante : "SE",
      caixa: { x0: num(cx.x0, 0), x1: num(cx.x1, 0), z0: num(cx.z0, 0), z1: num(cx.z1, 0) },
      visibilidade: clone(VIS_PADRAO),
      k: o.k != null ? num(o.k, null) : null,        /* mm de papel por metro projetado, fixado ao salvar (os deslocamentos manuais valem nele) */
      anot: { manual: {} },
      criadoEm: txt(o.criadoEm)
    };
  }
  function idDa(obraId, hi) { return "hidiso:" + txt(obraId || "geral") + ":" + txt(hi.ambiente.id) + ":" + txt(hi.grupo) + ":" + hi.tipo; }
  function nomeDa(hi) {
    var G = { agua: "água", esgoto: "esgoto e ventilação", pluvial: "pluvial", gas: "gás" };
    return (hi.tipo === "planta" ? "Planta do ambiente" : "Isométrico do ambiente") + " — " + txt(hi.ambiente.nome) + " (" + (G[hi.grupo] || hi.grupo) + ")";
  }
  /* o registro de `bim_vistas` (idempotente: o id é fixo por obra × ambiente × grupo × tipo) */
  function registro(o) {
    var hi = o.hidIso; return { id: idDa(o.obraId, hi), obraId: txt(o.obraId), nome: nomeDa(hi), criadoEm: txt(o.criadoEm || hi.criadoEm), completa: false, hidIso: hi,
      camera: o.camera || { pos: [10, 10, 10], alvo: [0, 0, 0], up: [0, 1, 0], fov: 50 } };
  }

  /* ------------------------------------------------------------ geometria */
  function dentroPoly(b, q, g) { return !(b[2] + g <= q[0] || q[2] + g <= b[0] || b[3] + g <= q[1] || q[3] + g <= b[1]); }
  function segCaixa(s, b, g) {   /* o segmento s atravessa/toca a caixa b (inflada em g) */
    var x0 = b[0] - g, y0 = b[1] - g, x1 = b[2] + g, y1 = b[3] + g;
    if (Math.max(s[0], s[2]) < x0 || Math.min(s[0], s[2]) > x1 || Math.max(s[1], s[3]) < y0 || Math.min(s[1], s[3]) > y1) return false;
    function dentro(x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
    if (dentro(s[0], s[1]) || dentro(s[2], s[3])) return true;
    var lados = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
    for (var i = 0; i < 4; i++) if (cruza(s, lados[i])) return true;
    return false;
  }
  function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
  function cruza(s, t) {   /* cruzamento PRÓPRIO dos dois segmentos (pontas compartilhadas não contam) */
    var d1 = orient(t[0], t[1], t[2], t[3], s[0], s[1]), d2 = orient(t[0], t[1], t[2], t[3], s[2], s[3]), d3 = orient(s[0], s[1], s[2], s[3], t[0], t[1]), d4 = orient(s[0], s[1], s[2], s[3], t[2], t[3]);
    return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
  }
  /* o ponto da borda da caixa/círculo na direção (tx,ty) a partir do centro */
  function bordaDe(it, tx, ty) {
    var dx = tx - it.x, dy = ty - it.y, L = Math.sqrt(dx * dx + dy * dy); if (L < 1e-9) return [it.x, it.y];
    if (it.r) return [it.x + dx / L * it.r, it.y + dy / L * it.r];
    var sx = Math.abs(dx) > 1e-9 ? (it.w / 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 1e-9 ? (it.h / 2) / Math.abs(dy) : Infinity, t = Math.min(sx, sy);
    return [it.x + dx * t, it.y + dy * t];
  }
  function caixaDe(it) { var w = it.wBox || it.w; return [it.x - w / 2, it.y - it.h / 2, it.x + w / 2, it.y + it.h / 2]; }

  /* ------------------------------------------------------------ a composição */
  /* dados = { pend: [{tipo: codigo|destaque|dn|aparelho|registro|nivel, s, anchors:[[x,y]], ids, trecho}], obst: [[x0,y0,x1,y1]], seg: [[x1,y1,x2,y2]],
   *           area: {x,y,w,h}, bbox: {x0,y0,x1,y1} (o desenho), larg: fn(texto, h) → mm, escala: k_folha / vista.k } */
  function compor(D, vista, dados) {
    var hi = vista && vista.hidIso ? vista.hidIso : vista, man = (hi && hi.anot && hi.anot.manual) || {}, esc0 = num(dados.escala, 1) || 1;
    var larg = dados.larg || function (s, h) { return txt(s).length * h * 0.6; };
    var R0 = dados.compacto ? 3.0 : K.raio, HB = dados.compacto ? 2.0 : K.hBalao, PASSO = dados.compacto ? 1.2 : K.passo;   /* folha apertada (planta): balão de 6 mm */
    var A = dados.area, B = dados.bbox, fixos = arr(dados.obst), paredes = arr(dados.obstParede), seg = arr(dados.seg), its = [], usadas = {}, avisos = [], omitidos = [];
    function chaveDe(p, i) {
      var base = p.tipo === "codigo" ? "c:" + txt(arr(p.ids)[0] || p.trecho) : p.tipo === "destaque" ? "d:" + txt(p.trecho) : p.tipo === "nivel" ? "p:piso" : (p.tipo === "dn" ? "n:" : p.tipo === "registro" ? "r:" : "a:") + txt(p.trecho);
      var k = base, q = 2; while (usadas[k]) k = base + "#" + (q++); usadas[k] = 1; return k;
    }
    arr(dados.pend).forEach(function (p, i) {
      var an = arr(p.anchors).length ? p.anchors : [[0, 0]], it = { tipo: p.tipo, s: txt(p.s), key: chaveDe(p, i), coluna: (p.tipo === "codigo" || p.tipo === "destaque") && !p.perto, an: an, ids: arr(p.ids) };
      it.A = p.tipo === "dn" ? an[Math.floor(an.length / 2)] : an[0];
      if (p.tipo === "codigo") {
        it.cod = txt(p.cod || it.s); it.qtd = num(p.n, 1) > 1 ? "x" + num(p.n, 1) : ""; it.s = it.cod;
        it.r = Math.max(R0, larg(it.cod, HB) / 2 + 0.7); it.w = it.h = 2 * it.r; it.fs = HB; it.wq = it.qtd ? larg(it.qtd, K.hRotulo) : 0; it.wBox = it.qtd ? 2 * (it.r + 0.7 + it.wq) : it.w;   /* a caixa de colisão inclui o "x5" */
      }
      else if (p.tipo === "destaque") {
        /* a chamada quebra em linhas para caber na coluna lateral (sem sair da área) */
        var maxW = K.colW - K.colFolga - 4, pal = it.s.split(/\s+/), lin = [], at = "";
        pal.forEach(function (w0) { var t0 = at ? at + " " + w0 : w0; if (at && larg(t0, K.hChamada) > maxW) { lin.push(at); at = w0; } else at = t0; });
        if (at) lin.push(at); it.linhas = lin;
        var wm = 0; lin.forEach(function (l0) { wm = Math.max(wm, larg(l0, K.hChamada)); });
        it.fs = K.hChamada; it.w = wm + 2.6; it.h = lin.length * K.hChamada * 1.3 + 1.2;
      }
      else { it.fs = K.hRotulo; it.w = larg(it.s, K.hRotulo); it.h = K.hRotulo * 1.05; }
      its.push(it);
    });
    /* 1) manuais: posição = peça + deslocamento salvo (o balão SEGUE a peça) */
    var colocados = [];
    its.forEach(function (it) {
      var m = man[it.key]; if (!m) return;
      if (m.ai != null && it.an[m.ai]) it.A = it.an[m.ai];   /* R05: rótulo de várias âncoras (DN) volta para a âncora em que foi arrastado */
      it.manual = true; it.x = it.A[0] + num(m.dx, 0) * esc0; it.y = it.A[1] + num(m.dy, 0) * esc0; it.fixo = true; colocados.push(it);
    });
    /* 2) colunas (balões e chamadas): lados do desenho, alinhadas, na ordem da peça (não cruzam) */
    var colIts = its.filter(function (it) { return it.coluna && !it.manual; }), cx = (B.x0 + B.x1) / 2;
    var capH = A.h - 4;   /* a coluna cabe pela altura REAL dos itens (balão cresce com o texto; chamada tem várias linhas) */
    function cabe(Lx) { var t = 0; Lx.forEach(function (q) { t += q.h + PASSO; }); return t - PASSO <= capH + 1e-6; }
    var cap = 99;
    var lados = { E: [], D: [] };
    colIts.sort(function (p, q) { return p.A[1] - q.A[1] || p.A[0] - q.A[0]; }).forEach(function (it) { it.lado = it.A[0] < cx ? "E" : "D"; lados[it.lado].push(it); });
    ["E", "D"].forEach(function (l) {
      var o = l === "E" ? "D" : "E";
      while (!cabe(lados[l])) {   /* transborda para o outro lado: sai o que está mais perto do centro */
        lados[l].sort(function (p, q) { return Math.abs(q.A[0] - cx) - Math.abs(p.A[0] - cx); });
        var mv = lados[l].pop(); if (!cabe(lados[o].concat([mv]))) { lados[l].push(mv); break; } mv.lado = o; lados[o].push(mv); lados[o].sort(function (p, q) { return p.A[1] - q.A[1]; });
        lados[l].sort(function (p, q) { return p.A[1] - q.A[1]; });
      }
    });
    var ySup = A.y + 2, yInf = A.y + A.h - 2;
    function empacotar(Lx) {   /* it.ty = alvo do lugar; it.y = alvo empurrado para não sobrepor */
      Lx.forEach(function (it) { it.y = Math.min(Math.max(it.ty, ySup + it.h / 2), yInf - it.h / 2); });
      for (var i = 1; i < Lx.length; i++) { var mn = Lx[i - 1].y + Lx[i - 1].h / 2 + Lx[i].h / 2 + PASSO; if (Lx[i].y < mn) Lx[i].y = mn; }
      if (Lx.length && Lx[Lx.length - 1].y + Lx[Lx.length - 1].h / 2 > yInf) {
        Lx[Lx.length - 1].y = yInf - Lx[Lx.length - 1].h / 2;
        for (var j = Lx.length - 2; j >= 0; j--) { var mx = Lx[j + 1].y - Lx[j + 1].h / 2 - Lx[j].h / 2 - PASSO; if (Lx[j].y > mx) Lx[j].y = mx; }
      }
    }
    /* a chamada que a marcação vai ter no desenho (coluna/manual sempre; texto solto só quando longe da peça) */
    function chamadaDe(q) { if (q.x == null || !q.A) return null; var lg = q.coluna || q.manual || Math.hypot(q.x - q.A[0], q.y - q.A[1]) > Math.max(q.wBox || q.w, q.h) / 2 + K.longe; return lg ? seg0(q) : null; }
    function seg0(it) { var bd = bordaDe(it, it.A[0], it.A[1]); return [bd[0], bd[1], it.A[0], it.A[1]]; }
    function totalCruz(Lx) { var t = 0; for (var i = 0; i < Lx.length; i++) { var si = seg0(Lx[i]); for (var j = i + 1; j < Lx.length; j++) if (cruza(si, seg0(Lx[j]))) t++; } return t; }
    function desloc(Lx) { var t = 0; Lx.forEach(function (it) { t += Math.abs(it.y - it.A[1]); }); return t; }
    /* posiciona UMA coluna: x alinhado, y = o da peça empurrado, depois trocas de lugar enquanto cai o número de cruzamentos; devolve a lista na ordem final */
    function posicionarLado(l, L0) {
      var L = L0.slice(); if (!L.length) return L;
      var rMax = 0; L.forEach(function (it) { if (it.r && it.r > rMax) rMax = it.r; });
      var xe = l === "E" ? Math.min(B.x0 - K.colFolga, A.x + A.w) : Math.max(B.x1 + K.colFolga, A.x);
      L.forEach(function (it) {   /* o x: círculos no mesmo eixo (alinhados); caixas encostadas na mesma borda */
        it.lado = l; if (it.r) it.x = l === "E" ? xe - rMax : xe + rMax; else it.x = l === "E" ? xe - it.w / 2 : xe + it.w / 2;
      });
      L.sort(function (p, q) { return p.A[1] - q.A[1] || p.A[0] - q.A[0]; });
      L.forEach(function (it) { it.ty = it.A[1]; });
      var alvos = L.map(function (it) { return it.ty; }).sort(function (p, q) { return p - q; });
      function aplicar(Lx) { Lx.forEach(function (it, ix) { it.ty = alvos[ix]; }); empacotar(Lx); }
      aplicar(L);
      for (var pass = 0; pass < 8; pass++) {
        var base = totalCruz(L); if (base === 0) break;
        var melhor = null, melhorC = base, melhorD = desloc(L);
        for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
          var T = L.slice(), tmp = T[i]; T[i] = T[j]; T[j] = tmp; aplicar(T);
          var c2 = totalCruz(T), d2 = desloc(T);
          if (c2 < melhorC || (c2 === melhorC && c2 < base && d2 < melhorD)) { melhorC = c2; melhorD = d2; melhor = T; }
        }
        if (!melhor) { aplicar(L); break; }
        L = melhor; aplicar(L);
      }
      return L;
    }
    lados.E = posicionarLado("E", lados.E); lados.D = posicionarLado("D", lados.D);
    /* uma marcação que cruza outra pode mudar de LADO: aceita a troca se o total de cruzamentos cair (e a coluna do outro lado ainda couber) */
    for (var rodada = 0; rodada < 2; rodada++) {
      var melhorou = false;
      colIts.slice().forEach(function (it) {
        if (it.manual) return;
        var de = it.lado, para = de === "E" ? "D" : "E", antes = totalCruz(lados.E.concat(lados.D));   /* R05: conta também o cruzamento ENTRE as colunas dos dois lados */
        if (!antes || !cabe(lados[para].concat([it])) || lados[de].indexOf(it) < 0) return;
        var Ld = lados[de].filter(function (q) { return q !== it; }), Lp = lados[para].concat([it]);
        var salvo = { E: lados.E, D: lados.D }, posAnt = colIts.map(function (q) { return [q.x, q.y, q.lado]; });
        var nd = posicionarLado(de, Ld), np = posicionarLado(para, Lp), novoE = de === "E" ? nd : np, novoD = de === "E" ? np : nd;
        var depois = totalCruz(novoE.concat(novoD));
        if (depois < antes) { lados.E = novoE; lados.D = novoD; melhorou = true; }
        else { lados.E = salvo.E; lados.D = salvo.D; colIts.forEach(function (q, ix) { q.x = posAnt[ix][0]; q.y = posAnt[ix][1]; q.lado = posAnt[ix][2]; }); posicionarLado("E", lados.E); posicionarLado("D", lados.D); }
      });
      if (!melhorou) break;
    }
    ["E", "D"].forEach(function (l) {
      lados[l].forEach(function (it) {
        if (l === "E" && it.x - it.w / 2 < A.x) avisos.push("Marcação " + it.s + ": passa da borda esquerda da área.");
        if (l === "D" && it.x + it.w / 2 > A.x + A.w) avisos.push("Marcação " + it.s + ": passa da borda direita da área.");
        colocados.push(it);
      });
    });
    /* 3) textos pequenos junto da peça: o primeiro lugar livre (fora de tubo, conexão e outras marcações), perto → longe */
    var ORD = { aparelho: 0, registro: 1, nivel: 2, dn: 3 };
    var DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
    function livre(it, cx0, cy0) {
      var ww = it.wBox || it.w, b = [cx0 - ww / 2, cy0 - it.h / 2, cx0 + ww / 2, cy0 + it.h / 2], g = 0.35;
      if (b[0] < A.x || b[1] < A.y || b[2] > A.x + A.w || b[3] > A.y + A.h) return false;
      var i;
      for (i = 0; i < fixos.length; i++) if (dentroPoly(b, fixos[i], 0.2)) return false;
      if (it.tipo !== "codigo") for (i = 0; i < paredes.length; i++) if (dentroPoly(b, paredes[i], 0.2)) return false;   /* balão branco pode pousar na parede; texto solto não */
      for (i = 0; i < seg.length; i++) if (segCaixa(seg[i], b, g + num(seg[i][4], 0))) return false;   /* seg[4] = meia largura do tubo (mm de papel) */
      for (i = 0; i < colocados.length; i++) { var q = caixaDe(colocados[i]); if (dentroPoly(b, q, K.folga)) return false; }
      /* R05: texto longe da peça leva chamada — ela não pode cruzar a chamada de um balão já colocado (a conferência final conta todas) */
      var it2 = { x: cx0, y: cy0, w: ww, h: it.h, r: 0 }, s0 = null;
      if (Math.hypot(cx0 - it.A0[0], cy0 - it.A0[1]) > Math.max(ww, it.h) / 2 + K.longe) { var p0 = bordaDe(it2, it.A0[0], it.A0[1]); s0 = [p0[0], p0[1], it.A0[0], it.A0[1]]; }
      for (i = 0; i < colocados.length; i++) {
        var sc = chamadaDe(colocados[i]); if (!sc) continue;
        if (s0 && cruza(s0, sc)) return false;            /* a chamada nova não cruza chamada já desenhada */
        if (segCaixa(sc, b, 0.2)) return false;           /* nem o texto pousa sobre uma chamada */
      }
      return true;
    }
    its.filter(function (it) { return !it.coluna && !it.manual; }).sort(function (p, q) { return ORD[p.tipo] - ORD[q.tipo]; }).forEach(function (it) {
      var ach = false;
      for (var gi = 0; gi < K.distancias.length && !ach; gi++) {
        for (var ai = 0; ai < it.an.length && !ach; ai++) {
          var an = it.an[(ai + Math.floor(it.an.length / 2)) % it.an.length];
          for (var di = 0; di < DIRS.length && !ach; di++) {
            var d = DIRS[di], g = K.distancias[gi], px = an[0] + d[0] * (it.w / 2 + g) * (d[1] !== 0 && d[0] !== 0 ? 0.75 : 1), py = an[1] + d[1] * (it.h / 2 + g);
            it.A0 = an; if (livre(it, px, py)) { it.x = px; it.y = py; it.A = an; it.ai = it.an.indexOf(an); it.dist = g; ach = true; }
          }
        }
      }
      if (ach) colocados.push(it); else { it.omitido = true; omitidos.push(it.s); }
    });
    if (omitidos.length) avisos.push(omitidos.length + " rótulo(s) sem lugar livre ficaram de fora do desenho (constam nas tabelas): " + omitidos.slice(0, 5).join("; ") + ".");
    /* 4) desenho: chamadas primeiro (por baixo), depois os balões e textos */
    var finais = its.filter(function (it) { return !it.omitido && it.x != null; }), linhas = [];
    finais.forEach(function (it) {
      var longe = Math.hypot(it.x - it.A[0], it.y - it.A[1]) > (it.coluna || it.manual ? 0 : Math.max(it.w, it.h) / 2 + K.longe);
      if (!(it.coluna || it.manual || longe)) return;
      if (Math.hypot(it.x - it.A[0], it.y - it.A[1]) <= (it.r || Math.max(it.w, it.h) / 2) + 0.4) return;   /* a peça já está debaixo dele */
      var p0 = bordaDe(it, it.A[0], it.A[1]); linhas.push({ it: it, seg: [p0[0], p0[1], it.A[0], it.A[1]] });
      D.linha(p0[0], p0[1], it.A[0], it.A[1], "HID-CHAMADA", ' data-vi-chamada="' + esc(it.key) + '"');
      D.ponto(it.A[0], it.A[1], 0.4, K.tinta);
    });
    finais.forEach(function (it) {
      var dk = ' data-vi="' + esc(it.key) + '"';
      if (it.tipo === "codigo") {
        D.add('<circle cx="' + n(it.x) + '" cy="' + n(it.y) + '" r="' + n(it.r) + '" fill="#ffffff" stroke="' + K.tinta + '" stroke-width="' + n(K.fio) + '"' + dk + '/>');
        D.texto(it.x, it.y, it.s, it.fs, { al: "C", meio: true, attr: dk });
        if (it.qtd) { var dir = it.lado === "E" ? -1 : 1; D.texto(it.x + dir * (it.r + 0.7 + it.wq / 2), it.y, it.qtd, K.hRotulo, { al: "C", meio: true, attr: dk }); }
      } else if (it.tipo === "destaque") {
        D.add('<rect x="' + n(it.x - it.w / 2) + '" y="' + n(it.y - it.h / 2) + '" width="' + n(it.w) + '" height="' + n(it.h) + '" fill="#ffffff" stroke="' + K.caixaCor + '" stroke-width="' + n(K.fioChamada) + '"' + dk + '/>');
        var nl = it.linhas.length, y0 = it.y - (nl - 1) * it.fs * 1.3 / 2;
        it.linhas.forEach(function (l0, ix) { D.texto(it.x, y0 + ix * it.fs * 1.3, l0, it.fs, { al: "C", meio: true, attr: dk + ' font-style="italic"' }); });
      } else D.texto(it.x, it.y, it.s, it.fs, { al: "C", meio: true, attr: dk });
    });
    /* 5) conferência: chamadas que se cruzam, órfãs (marcação manual de peça que não existe mais) */
    var cruzamentos = 0, cruzPares = [], i2, j2;
    for (i2 = 0; i2 < linhas.length; i2++) for (j2 = i2 + 1; j2 < linhas.length; j2++) if (cruza(linhas[i2].seg, linhas[j2].seg)) { cruzamentos++; cruzPares.push([linhas[i2].it.s, linhas[j2].it.s]); }
    var orfaos = []; Object.keys(man).forEach(function (kk) { if (!its.some(function (it) { return it.key === kk; })) orfaos.push({ key: kk, s: txt(man[kk].s), dx: man[kk].dx, dy: man[kk].dy }); });
    if (orfaos.length) avisos.push(orfaos.length + " marcação(ões) ligada(s) a peça que não existe mais no modelo (órfã): " + orfaos.slice(0, 5).map(function (q) { return q.s || q.key; }).join("; ") + ".");
    return { itens: finais.map(function (it) { return { key: it.key, tipo: it.tipo, s: it.s, x: it.x, y: it.y, w: it.w, h: it.h, r: it.r || 0, ax: it.A[0], ay: it.A[1], ai: it.ai != null ? it.ai : null, manual: !!it.manual, ids: it.ids }; }),
      orfaos: orfaos, avisos: avisos, cruzamentos: cruzamentos, cruzPares: cruzPares, omitidos: omitidos, bbox: B };
  }

  /* ------------------------------------------------------------ edição da posição (arrastar) */
  /* o centro novo (x, y em mm de PAPEL) vira DESLOCAMENTO da peça (ax, ay), em mm da escala da vista (k) */
  function mover(vista, chave, x, y, ax, ay, escala, s, ai) {
    var hi = vista.hidIso || vista; hi.anot = hi.anot || { manual: {} }; hi.anot.manual = hi.anot.manual || {};
    var e = num(escala, 1) || 1;
    hi.anot.manual[chave] = { dx: Math.round((x - ax) / e * 100) / 100, dy: Math.round((y - ay) / e * 100) / 100, s: txt(s) };
    if (typeof ai === "number" && ai >= 0) hi.anot.manual[chave].ai = ai;
    return hi.anot.manual[chave];
  }
  function soltar(vista, chave) { var hi = vista.hidIso || vista; if (chave == null) { hi.anot.manual = {}; return true; } if (hi.anot && hi.anot.manual && hi.anot.manual[chave]) { delete hi.anot.manual[chave]; return true; } return false; }

  var HidVistaIso = { VERSAO: 1, K: K, VIS_PADRAO: VIS_PADRAO, nova: nova, registro: registro, idDa: idDa, nomeDa: nomeDa, compor: compor, mover: mover, soltar: soltar, _int: { cruza: cruza, segCaixa: segCaixa, bordaDe: bordaDe } };
  global.HidVistaIso = HidVistaIso;
  if (typeof module !== "undefined" && module.exports) module.exports = HidVistaIso;
  /* hid:geometria-fim */
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

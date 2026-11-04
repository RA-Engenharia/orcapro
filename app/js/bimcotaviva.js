/* =====================================================================
 * bimcotaviva.js — as COTAS VIVAS do 3D (03/11/2026). Motor puro: sem THREE, sem DOM, sem relógio.
 *
 *   escolher(alvos, cam, opts) → [{alvo, eixo, aresta, chave, a, b, ea, eb, pa, pb, medida, txt, ang, xy, caixaTexto}]
 *     alvo  = {id, caixa:{c,u,v,w,meia} (OBB), desl:[x,y,z], prioridade, dims?:[L,h,b] (texto no lugar da medida)}
 *     cam   = {pos:[x,y,z], vp:[16] (projeção × vista, ordem de coluna — a do THREE), w, h (px), orto?, dir?}
 *     opts  = {minM:0.05, minPx:36, folgaPx:16, fontePx:13, maxPorAlvo:3, anterior:{chave:aresta}}
 *   Em px: a/b = a linha de cota (afastada para fora do alvo), ea/eb = a aresta medida; xy = centro do texto,
 *   ang = graus em (−90, +90] no sentido anti-horário da tela (o `rotation` do sprite), caixaTexto = [x0,y0,x1,y1].
 *
 *   · Só aresta de SILHUETA (exatamente uma das duas faces vizinhas virada para a câmera): a cota nunca fica no meio
 *     do desenho da peça nem atrás dela.
 *   · Pontua por comprimento projetado + proximidade da borda do alvo; HISTERESE (opts.anterior): mantém a aresta de
 *     antes salvo se outra for 25% melhor — sem isto a cota PULA de aresta a cada grau de órbita.
 *   · Texto centrado acima da linha, ângulo em (−90, +90]: NUNCA de cabeça para baixo nem espelhado.
 *   · Rejeita o que sai da tela, cruza o plano da câmera ou mede menos de minPx. Colisão gulosa por prioridade contra as
 *     caixas de texto já postas; antes de desistir tenta outra aresta, outro afastamento, outro ponto da linha e o outro
 *     lado da linha.
 *   · GARANTIA: cada alvo visível leva ≥ 1 cota se existir QUALQUER lugar livre para ela; o conjunto nunca volta vazio
 *     havendo alvo visível (último recurso: cota sobre a própria aresta — qualquer aresta visível do eixo, com a aresta inteira na tela —, texto preso dentro da tela).
 *
 *   fmtM(v): o padrão do caderno — "2.89", ".14" (duas casas, ponto, sem zero à esquerda).
 *   numeroPecas(txt, ctx): o número em GEOMETRIA para a RA nativa (sem textura): traços grossos de uma fonte de traço
 *     própria, fundo claro atrás, em 4 quadros de uma face em cruz em volta do eixo vertical — lê direito de qualquer
 *     lado e nunca espelhado. Devolve [{cor, pos, nor, idx, umaFace:true}] (um por cor).
 *
 * Teste: node tools/test-bimcotaviva.js (600 câmeras na esfera, com controle negativo).
 * ===================================================================== */
(function (global) {
  "use strict";

  var MIN_M = 0.05, MIN_PX = 36, FOLGA_PX = 16, FONTE_PX = 13, MAX_POR_ALVO = 3, HISTERESE = 1.25, EPS = 1e-9;

  function arr(a) { return Object.prototype.toString.call(a) === "[object Array]"; }
  function ehNum(x) { return typeof x === "number" && isFinite(x); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function fmtM(v) {
    var s = (+v).toFixed(2), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    if (s.slice(0, 2) === "0.") s = s.slice(1);
    return (neg ? "-" : "") + s;
  }

  /* ---------------------------------------------------------------- projeção */
  /* mundo → px. `atras` = no/atrás do plano da câmera (w de clip ≤ 0) ou fora do volume de profundidade */
  function projetar(vp, W, H, p) {
    var x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12],
        y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13],
        z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14],
        w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (!(w > 1e-9)) return { atras: true, x: 0, y: 0 };
    var nz = z / w;
    if (nz < -1 || nz > 1) return { atras: true, x: 0, y: 0 };
    return { atras: false, x: (x / w * 0.5 + 0.5) * W, y: (1 - (y / w * 0.5 + 0.5)) * H };
  }

  /* ---------------------------------------------------------------- candidatas de um alvo */
  function eixosDe(o) { return [o.u, o.v, o.w]; }
  function pontoEm(o, d, sj, sk, si, i, j, k) {
    var ax = eixosDe(o), m = o.meia, p = [o.c[0] + d[0], o.c[1] + d[1], o.c[2] + d[2]], q;
    for (q = 0; q < 3; q++) p[q] += sj * m[j] * ax[j][q] + sk * m[k] * ax[k][q] + si * m[i] * ax[i][q];
    return p;
  }
  function faceVisivel(o, d, eixo, sinal, cam) {
    var ax = eixosDe(o)[eixo], n = [ax[0] * sinal, ax[1] * sinal, ax[2] * sinal];
    var cf = [o.c[0] + d[0] + n[0] * o.meia[eixo], o.c[1] + d[1] + n[1] * o.meia[eixo], o.c[2] + d[2] + n[2] * o.meia[eixo]];
    var para = (cam.orto && arr(cam.dir)) ? [-cam.dir[0], -cam.dir[1], -cam.dir[2]] : sub(cam.pos, cf);
    return dot(n, para) > EPS;
  }

  function candidatasDoAlvo(al, cam, minM, minPx) {
    var o = al.caixa, d = arr(al.desl) ? al.desl : [0, 0, 0], W = cam.w, H = cam.h;
    var cen = projetar(cam.vp, W, H, [o.c[0] + d[0], o.c[1] + d[1], o.c[2] + d[2]]);
    /* caixa de tela do alvo, para a "proximidade da borda" */
    var bb = null, i;
    var cs = [], tudo = true;
    for (var sa = -1; sa <= 1; sa += 2) for (var sb = -1; sb <= 1; sb += 2) for (var sc = -1; sc <= 1; sc += 2) {
      var P = pontoEm(o, d, sa, sb, sc, 2, 0, 1), pp = projetar(cam.vp, W, H, P);
      if (pp.atras) tudo = false; else cs.push(pp);
    }
    if (tudo && cs.length) {
      bb = [Infinity, Infinity, -Infinity, -Infinity];
      cs.forEach(function (p) { bb[0] = Math.min(bb[0], p.x); bb[1] = Math.min(bb[1], p.y); bb[2] = Math.max(bb[2], p.x); bb[3] = Math.max(bb[3], p.y); });
    }
    var eixos = [], todasEixos = [], nSilTotal = 0;
    for (i = 0; i < 3; i++) {
      var medida = 2 * o.meia[i];
      if (!(medida >= minM)) continue;
      var j = (i + 1) % 3, k2 = (i + 2) % 3, cands = [], sil = [], todas = [], nSil = 0;
      for (var e = 0; e < 4; e++) {
        var sj = (e & 1) ? 1 : -1, sk = (e & 2) ? 1 : -1;
        var A = pontoEm(o, d, sj, sk, -1, i, j, k2), B = pontoEm(o, d, sj, sk, 1, i, j, k2);
        var vj = faceVisivel(o, d, j, sj, cam), vk = faceVisivel(o, d, k2, sk, cam);
        if (vj !== vk) nSil++;
        var pa = projetar(cam.vp, W, H, A), pb = projetar(cam.vp, W, H, B);
        if (pa.atras || pb.atras) continue;          /* cruza o plano da câmera */
        var len = Math.sqrt((pb.x - pa.x) * (pb.x - pa.x) + (pb.y - pa.y) * (pb.y - pa.y));
        if (len < minPx) continue;
        var mid = [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2], prox = 0;
        if (bb) {
          var dist = Math.max(0, Math.min(mid[0] - bb[0], bb[2] - mid[0], mid[1] - bb[1], bb[3] - mid[1]));
          prox = 1 - Math.min(1, dist / (0.5 * Math.min(bb[2] - bb[0], bb[3] - bb[1]) + 1));
        }
        var c = { eixo: i, aresta: e, A: A, B: B, pa: pa, pb: pb, len: len, score: len * (1 + 0.25 * prox), medida: medida, silhueta: vj !== vk };
        todas.push(c); if (c.silhueta) sil.push(c);
      }
      todasEixos.push({ eixo: i, medida: medida, sil: sil, todas: todas });
      nSilTotal += nSil;
    }
    /* ⚠ a volta para "qualquer aresta" só vale quando o ALVO inteiro não tem silhueta alguma (câmera dentro da caixa).
       Um eixo sem silhueta é normal — olhando de frente para uma face, as arestas que apontam para a câmera não
       delimitam o desenho — e silhueta curta demais (cortada pelo minPx) também não é motivo: uma aresta de trás no
       lugar dela cota o que a pessoa não vê */
    /* ⚠ `extras` = o ÚLTIMO RECURSO (03/11/2026, revisão): o eixo cuja silhueta inteira foi rejeitada (curta demais, cruzando a
       câmera) voltava sem nenhuma candidata e o alvo ficava sem cota mesmo com outra aresta do mesmo eixo à vista. Só a 3ª passada
       e o fim da escolha olham aqui — a regra da silhueta continua valendo para tudo o que vem antes. */
    var extras = [];
    todasEixos.forEach(function (te) {
      var cands = nSilTotal ? te.sil : te.todas;
      cands.sort(function (a, b) { return (b.score - a.score) || (a.aresta - b.aresta); });
      if (cands.length) eixos.push({ eixo: te.eixo, medida: te.medida, cands: cands });
      var qq = te.todas.slice().sort(function (a, b) { return (b.score - a.score) || (a.aresta - b.aresta); });
      if (qq.length) extras.push({ eixo: te.eixo, medida: te.medida, cands: qq });
    });
    eixos.sort(function (a, b) { return (b.medida - a.medida) || (a.eixo - b.eixo); });
    extras.sort(function (a, b) { return (b.medida - a.medida) || (a.eixo - b.eixo); });
    return { eixos: eixos, extras: extras, centro: cen };
  }

  /* ---------------------------------------------------------------- colocação */
  function normalizaAng(a) { while (a <= -90) a += 180; while (a > 90) a -= 180; return a; }
  function cruza(a, b, pad) { return a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad; }
  function dentro(c, W, H, m) { return c[0] >= m && c[1] >= m && c[2] <= W - m && c[3] <= H - m; }

  /* modo 0 = normal; 1 = linha sobre a aresta e texto preso na tela (respeita as caixas); 2 = o mesmo ignorando as caixas */
  function colocar(al, ex, c, centro, cam, ocupadas, op, modo) {
    var forcar = modo > 0;
    var W = cam.w, H = cam.h, pa = c.pa, pb = c.pb;
    var dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / L, ny = dx / L;                       /* normal da linha em px */
    var mx = (pa.x + pb.x) / 2 - centro.x, my = (pa.y + pb.y) / 2 - centro.y;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }   /* para FORA do alvo */
    var txt = (arr(al.dims) && ehNum(al.dims[c.eixo]) ? fmtM(al.dims[c.eixo]) : fmtM(c.medida));
    var wT = txt.length * op.fontePx * 0.6 + 8, hT = op.fontePx * 1.25 + 4;
    var mults = forcar ? [0] : [1, 1.9, 2.8], fracs = [0.5, 0.25, 0.75], lados = [1, -1];
    for (var im = 0; im < mults.length; im++) {
      var off = op.folgaPx * mults[im];
      var ax = pa.x + nx * off, ay = pa.y + ny * off, bx = pb.x + nx * off, by = pb.y + ny * off;
      var ang = normalizaAng(Math.atan2(-(by - ay), bx - ax) * 180 / Math.PI), r = ang * Math.PI / 180;
      var sn = Math.sin(r), cs = Math.cos(r);
      var hx = Math.abs(cs) * wT / 2 + Math.abs(sn) * hT / 2, hy = Math.abs(sn) * wT / 2 + Math.abs(cs) * hT / 2;
      for (var iL = 0; iL < lados.length; iL++) for (var iF = 0; iF < fracs.length; iF++) {
        var fr = fracs[iF], px = ax + (bx - ax) * fr, py = ay + (by - ay) * fr;
        var up = lados[iL] * (hT / 2 + 3);
        var tx = px + (-sn) * up, ty = py + (-cs) * up;
        if (forcar) { tx = Math.max(hx + 1, Math.min(W - hx - 1, tx)); ty = Math.max(hy + 1, Math.min(H - hy - 1, ty)); }
        var cx = [tx - hx, ty - hy, tx + hx, ty + hy];
        if (!dentro(cx, W, H, 1)) continue;
        /* ⚠ a aresta cotada tem de estar na tela TAMBÉM nos modos de último recurso (03/11/2026, revisão): com o texto preso na
           tela e a linha por cima da aresta, o número de um módulo cortado pela borda aparecia longe do que ele mede */
        if (ax < 0 || bx < 0 || ax > W || bx > W || ay < 0 || by < 0 || ay > H || by > H) continue;
        var colide = false;
        for (var q = 0; q < ocupadas.length; q++) if (cruza(cx, ocupadas[q], 2)) { colide = true; break; }
        if (colide && modo !== 2) continue;
        return { alvo: al.id, eixo: c.eixo, aresta: c.aresta, chave: al.id + ":" + c.eixo, a: [ax, ay], b: [bx, by],
          ea: [pa.x, pa.y], eb: [pb.x, pb.y], pa: c.A, pb: c.B, medida: c.medida, txt: txt, ang: ang, xy: [tx, ty], caixaTexto: cx,
          comp: c.len };
      }
    }
    return null;
  }

  /* a ordem das candidatas de um eixo com a histerese */
  function ordemComHisterese(cands, ant) {
    if (ant == null || !cands.length) return cands;
    var prev = null, i;
    for (i = 0; i < cands.length; i++) if (cands[i].aresta === ant) prev = cands[i];
    if (!prev || prev === cands[0]) return cands;
    if (cands[0].score <= prev.score * HISTERESE) return [prev].concat(cands.filter(function (x) { return x !== prev; }));
    return cands;
  }

  function escolher(alvos, cam, opts) {
    opts = opts || {};
    var op = { minM: ehNum(opts.minM) ? opts.minM : MIN_M, minPx: ehNum(opts.minPx) ? opts.minPx : MIN_PX,
      folgaPx: ehNum(opts.folgaPx) ? opts.folgaPx : FOLGA_PX, fontePx: ehNum(opts.fontePx) ? opts.fontePx : FONTE_PX,
      maxPorAlvo: ehNum(opts.maxPorAlvo) ? opts.maxPorAlvo : MAX_POR_ALVO };
    var anterior = opts.anterior || {};
    if (!cam || !arr(cam.vp) || cam.vp.length !== 16 || !(cam.w > 0) || !(cam.h > 0) || !arr(cam.pos)) return [];
    var lista = (arr(alvos) ? alvos : []).filter(function (a) { return a && a.caixa && a.caixa.meia && a.id != null; });
    lista.sort(function (a, b) { return ((b.prioridade || 0) - (a.prioridade || 0)) || (String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0)); });
    var infos = lista.map(function (al) { var inf = candidatasDoAlvo(al, cam, op.minM, op.minPx); inf.alvo = al; inf.feitos = {}; inf.n = 0; return inf; });
    var ocupadas = [], res = [];

    function tentarEixo(inf, ex) {
      var cands = ordemComHisterese(ex.cands, anterior[inf.alvo.id + ":" + ex.eixo]);
      for (var i = 0; i < cands.length; i++) {
        var r = colocar(inf.alvo, ex, cands[i], inf.centro, cam, ocupadas, op, 0);
        if (r) { res.push(r); ocupadas.push(r.caixaTexto); inf.feitos[ex.eixo] = true; inf.n++; return true; }
      }
      return false;
    }
    /* 1ª passada: o eixo mais longo de cada alvo, por prioridade (todo alvo ganha a sua cota principal antes de
       qualquer cota secundária ocupar espaço) */
    infos.forEach(function (inf) { for (var i = 0; i < inf.eixos.length; i++) if (tentarEixo(inf, inf.eixos[i])) break; });
    /* 2ª: os outros eixos */
    infos.forEach(function (inf) {
      for (var i = 0; i < inf.eixos.length && inf.n < op.maxPorAlvo; i++) if (!inf.feitos[inf.eixos[i].eixo]) tentarEixo(inf, inf.eixos[i]);
    });
    /* 3ª: o alvo que ficou sem nenhuma: a linha sobre a própria aresta e o texto preso dentro da tela (modo 1: ainda
       respeita as caixas de texto já postas) */
    infos.forEach(function (inf) {
      if (inf.n) return;
      /* 1º as candidatas de silhueta; só então QUALQUER aresta visível do eixo */
      [inf.eixos, inf.extras].forEach(function (grupo) {
        for (var i = 0; i < grupo.length && !inf.n; i++) {
          var cands = grupo[i].cands;
          for (var j = 0; j < cands.length && !inf.n; j++) {
            var r = colocar(inf.alvo, grupo[i], cands[j], inf.centro, cam, ocupadas, op, 1);
            if (r) { res.push(r); ocupadas.push(r.caixaTexto); inf.feitos[grupo[i].eixo] = true; inf.n++; }
          }
        }
      });
    });
    /* último recurso: o conjunto não volta vazio havendo alvo VISÍVEL (uma aresta com o meio dentro da tela); aqui a
       folga de colisão é ignorada, só para a primeira */
    if (!res.length) {
      for (var a = 0; a < infos.length && !res.length; a++) {
        var inf2 = infos[a];
        [inf2.eixos, inf2.extras].forEach(function (grupo) {
          for (var b = 0; b < grupo.length && !res.length; b++) {
            var c2 = grupo[b].cands[0], mx = (c2.pa.x + c2.pb.x) / 2, my = (c2.pa.y + c2.pb.y) / 2;
            if (!(mx >= 0 && mx <= cam.w && my >= 0 && my <= cam.h)) continue;
            var r2 = colocar(inf2.alvo, grupo[b], c2, inf2.centro, cam, [], op, 2);
            if (r2) res.push(r2);
          }
        });
      }
    }
    return res;
  }
  /* a memória da histerese para a próxima chamada */
  function memoria(res) { var m = {}; (res || []).forEach(function (r) { m[r.chave] = r.aresta; }); return m; }

  /* ---------------------------------------------------------------- o número em geometria (RA nativa) */
  /* a fonte de traço própria: cada glifo numa célula de 1 × 2, polilinhas de cantos chanfrados (nada de sete segmentos) */
  var GLIFOS = {
    "0": [[[0.15, 0], [0.85, 0], [1, 0.15], [1, 1.85], [0.85, 2], [0.15, 2], [0, 1.85], [0, 0.15], [0.15, 0]]],
    "1": [[[0.15, 1.6], [0.55, 2], [0.55, 0]], [[0.15, 0], [0.95, 0]]],
    "2": [[[0, 1.7], [0.2, 2], [0.8, 2], [1, 1.7], [1, 1.3], [0, 0], [1, 0]]],
    "3": [[[0, 1.85], [0.15, 2], [0.85, 2], [1, 1.85], [1, 1.15], [0.85, 1], [0.35, 1]], [[0.85, 1], [1, 0.85], [1, 0.15], [0.85, 0], [0.15, 0], [0, 0.15]]],
    "4": [[[0.8, 0], [0.8, 2], [0, 0.6], [1, 0.6]]],
    "5": [[[1, 2], [0.1, 2], [0, 1.1], [0.7, 1.2], [1, 0.9], [1, 0.2], [0.8, 0], [0.15, 0], [0, 0.2]]],
    "6": [[[0.9, 2], [0.3, 2], [0, 1.6], [0, 0.2], [0.2, 0], [0.8, 0], [1, 0.2], [1, 0.8], [0.8, 1], [0, 1]]],
    "7": [[[0, 2], [1, 2], [0.35, 0]]],
    "8": [[[0.2, 1], [0, 1.15], [0, 1.85], [0.15, 2], [0.85, 2], [1, 1.85], [1, 1.15], [0.8, 1], [0.2, 1], [0, 0.85], [0, 0.15], [0.15, 0], [0.85, 0], [1, 0.15], [1, 0.85], [0.8, 1]]],
    "9": [[[0.1, 0], [0.7, 0], [1, 0.4], [1, 1.8], [0.8, 2], [0.2, 2], [0, 1.8], [0, 1.2], [0.2, 1], [1, 1]]],
    ".": [[[0.4, 0.1], [0.6, 0.1]]],
    "-": [[[0.1, 1], [0.9, 1]]],
    " ": []
  };
  var AVANCO = 1.5, LARG_TRACO = 0.3, ALT_GLIFO = 2;

  function numeroPecas(txt, ctx) {
    ctx = ctx || {};
    var texto = String(txt == null ? "" : txt), c0 = arr(ctx.centro) ? ctx.centro : [0, 0, 0];
    var H = ehNum(ctx.altura) && ctx.altura > 0 ? ctx.altura : 0.1, s = H / ALT_GLIFO;
    var corTraco = arr(ctx.cor) ? ctx.cor : [0.08, 0.08, 0.1], corFundo = arr(ctx.fundo) ? ctx.fundo : [0.97, 0.96, 0.88];
    var chars = texto.split("").filter(function (ch) { return GLIFOS[ch] != null; });
    if (!chars.length) return [];
    var larg = (chars.length * AVANCO - (AVANCO - 1)) * s, pad = 0.35 * s * 2;
    /* geometria 2D no quadro (X para a direita do leitor, Y para cima), centrada */
    var tracos = [], x0 = -larg / 2, hw = LARG_TRACO * s / 2;
    chars.forEach(function (ch, ic) {
      var gx = x0 + ic * AVANCO * s;
      GLIFOS[ch].forEach(function (pl) {
        var pts = pl.map(function (p) { return [gx + p[0] * s, -H / 2 + p[1] * s]; });
        pts.forEach(function (p) { tracos.push([[p[0] - hw, p[1] - hw], [p[0] + hw, p[1] - hw], [p[0] + hw, p[1] + hw], [p[0] - hw, p[1] + hw]]); });
        for (var i = 0; i + 1 < pts.length; i++) {
          var P = pts[i], Q = pts[i + 1], dx = Q[0] - P[0], dy = Q[1] - P[1], l = Math.sqrt(dx * dx + dy * dy); if (l < 1e-12) continue;
          var nx = -dy / l * hw, ny = dx / l * hw;
          tracos.push([[P[0] + nx, P[1] + ny], [Q[0] + nx, Q[1] + ny], [Q[0] - nx, Q[1] - ny], [P[0] - nx, P[1] - ny]]);
        }
      });
    });
    var fundo = [[-larg / 2 - pad, -H / 2 - pad], [larg / 2 + pad, -H / 2 - pad], [larg / 2 + pad, H / 2 + pad], [-larg / 2 - pad, H / 2 + pad]];
    var G = { fundo: { cor: corFundo, pos: [], nor: [], idx: [] }, traco: { cor: corTraco, pos: [], nor: [], idx: [] } };
    var eps = H * 0.012;
    function quad(g, q2d, f, recuo) {
      /* o quadrilátero 2D → 3D no quadro f; o sentido sai anti-horário visto de FORA (a frente) */
      var area = 0, i;
      for (i = 0; i < 4; i++) { var a = q2d[i], b = q2d[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
      var q = area < 0 ? [q2d[0], q2d[3], q2d[2], q2d[1]] : q2d, base = g.pos.length / 3;
      for (i = 0; i < 4; i++) {
        g.pos.push(c0[0] + f.r[0] * q[i][0] + f.n[0] * recuo, c0[1] + q[i][1] + f.n[1] * recuo, c0[2] + f.r[2] * q[i][0] + f.n[2] * recuo);
        g.nor.push(f.n[0], f.n[1], f.n[2]);
      }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (var qd = 0; qd < 4; qd++) {
      var fi = qd * Math.PI / 2, n = [Math.round(Math.cos(fi)), 0, Math.round(Math.sin(fi))];
      var f = { n: n, r: [n[2], 0, -n[0]] };   /* r = (−n) × Y: a direita de quem olha de fora */
      quad(G.fundo, fundo, f, 0);
      tracos.forEach(function (t) { quad(G.traco, t, f, eps); });
    }
    return [G.fundo, G.traco].map(function (g, i) {
      return { cor: [g.cor[0], g.cor[1], g.cor[2], 1], pos: new Float32Array(g.pos), nor: new Float32Array(g.nor), idx: new Uint32Array(g.idx), umaFace: true, papel: i ? "traco" : "fundo" };
    });
  }

  var CotaViva = { escolher: escolher, memoria: memoria, fmtM: fmtM, numeroPecas: numeroPecas, projetar: projetar, normalizaAng: normalizaAng,
    MIN_M: MIN_M, MIN_PX: MIN_PX, FOLGA_PX: FOLGA_PX, HISTERESE: HISTERESE };
  global.BimCotaViva = CotaViva;
  if (typeof module !== "undefined" && module.exports) module.exports = CotaViva;
})(typeof window !== "undefined" ? window : this);

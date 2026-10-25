/* =====================================================================
 * bimvistaplano.js — O PLANO DE CADA VISTA (23/10/2026). Motor PURO,
 * Node-testável.
 *
 * Pedido do Rogério: "a parte de modelar em qualquer vista precisa ficar
 * pronta". Planta, corte, elevação e 3D têm de ser quatro janelas para o MESMO
 * modelo: o clique de parede, porta, viga, pilar ou componente entrega ao editor
 * um ponto do mundo, venha de onde vier. Este arquivo é a conta que liga o
 * ponto do DESENHO ao ponto do MUNDO (e a volta), sem tela nenhuma:
 *
 *   PLANTA ... o desenho É o plano horizontal do nível: (x, y do desenho) = (x, z)
 *              do mundo, na cota do nível;
 *   CORTE e ELEVAÇÃO ... o plano vertical da linha A→B da vista: o X do desenho
 *              anda ao longo do plano (vetor `r`, a direita de quem olha), o Y do
 *              desenho é −y do mundo (o MESMO que BIM.vista2d desenha), e a
 *              PROFUNDIDADE anda na direção em que a vista olha (`n`). O ponto
 *              clicado cai no plano da vista (profundidade 0); a porta e a janela
 *              acham a parede pelo RAIO que sai do clique e olha para dentro;
 *   3D ....... o plano de trabalho / nível ativo do editor (nada aqui: o raio da
 *              câmera é do visualizador).
 *
 * Também mora aqui a MATRIZ comando × vista (`ferramentaNaVista`): o que cada
 * ferramenta de construir faz em cada vista. O que não faz sentido numa vista
 * (a laje no corte, a escada na elevação) devolve o PORQUÊ e a vista certa —
 * nunca falha calado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function dist2(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }

  /* ----------------------------------------------------------- O QUADRO */
  /* `def` é a definição da vista do js/bim2dui.js: { tipo: "planta", nivel: { y } } ou
     { tipo: "corte", p6?: "corte"|"elevacao", corte: { ax, az, bx, bz, inv, prof } }.
     → o quadro da vista, ou null se a definição não serve (corte de dois pontos iguais). */
  function quadro(def) {
    if (!def || typeof def !== "object") return null;
    if (def.tipo === "planta") return { tipo: "planta", vista: def.p6 || "planta", y: fin(def.nivel && def.nivel.y) ? def.nivel.y : 0 };
    if (def.tipo === "3d") return { tipo: "3d", vista: "3d", y: num(def.y, 0) };
    var c = def.corte || def.linha;
    if (!c || !fin(+c.ax) || !fin(+c.az) || !fin(+c.bx) || !fin(+c.bz)) return null;
    var dx = +c.bx - +c.ax, dz = +c.bz - +c.az, L = Math.sqrt(dx * dx + dz * dz);
    if (!(L > 0.05)) return null;
    /* a MESMA conta do BIM.vista2d: n = (dz, −dx)/L olhando para dentro (inv vira), r = n × cima = (−nz, nx) */
    var nx = dz / L, nz = -dx / L; if (c.inv) { nx = -nx; nz = -nz; }
    return { tipo: "corte", vista: def.p6 === "elevacao" ? "elevacao" : "corte",
             A: [+c.ax, +c.az], n: [nx, nz], r: [-nz, nx], L: L, prof: (c.prof != null && +c.prof > 0) ? +c.prof : null };
  }
  /* o ponto do DESENHO (a, b) → mundo {x, y, z}. Corte/elevação: `o.prof` = a profundidade (padrão 0: o plano da vista);
     planta: `o.y` troca a cota (padrão: a do nível) */
  function paraMundo(q, a, b, o) {
    if (!q || !fin(a) || !fin(b)) return null;
    o = o || {};
    if (q.tipo === "planta" || q.tipo === "3d") return { x: a, y: o.y != null ? o.y : q.y, z: b };
    var d = num(o.prof, 0);
    return { x: r4(q.A[0] + q.r[0] * a + q.n[0] * d), y: r4(-b), z: r4(q.A[1] + q.r[1] * a + q.n[1] * d) };
  }
  /* o ponto do mundo → desenho [a, b] (a volta de paraMundo) */
  function daVista(q, p) {
    if (!q || !p) return null;
    if (q.tipo === "planta" || q.tipo === "3d") return [p.x, p.z];
    return [(p.x - q.A[0]) * q.r[0] + (p.z - q.A[1]) * q.r[1], -p.y];
  }
  /* quanto o ponto está À FRENTE do plano, na direção em que a vista olha (negativo = do lado de quem olha) */
  function profundidade(q, p) {
    if (!q || q.tipo !== "corte") return 0;
    return (p.x - q.A[0]) * q.n[0] + (p.z - q.A[1]) * q.n[1];
  }
  /* o RAIO que sai do ponto clicado e olha para dentro da vista */
  function raio(q, a, b) {
    var o = paraMundo(q, a, b);
    if (!o) return null;
    if (q.tipo === "corte") return { o: o, d: { x: q.n[0], y: 0, z: q.n[1] } };
    return { o: o, d: { x: 0, y: -1, z: 0 } };
  }

  /* ---------------------------------------------------------- NÍVEIS */
  /* `niveis` = [{ id, nome, y }]. O nível de um clique na cota y: o mais alto que não passa de y (+ tolerância);
     abaixo de todos, o mais baixo (e `abaixo: true`) */
  function nivelNaCota(niveis, y, tol) {
    var L = (niveis || []).filter(function (n) { return n && fin(+n.y); }).map(function (n) { return { id: n.id, nome: n.nome, y: +n.y }; });
    if (!L.length || !fin(y)) return null;
    L.sort(function (a, b) { return a.y - b.y; });
    var t = tol != null ? tol : 0.05, ok = null;
    L.forEach(function (n) { if (n.y <= y + t) ok = n; });
    if (ok) return { nivel: ok, abaixo: false };
    return { nivel: L[0], abaixo: true };
  }

  /* ------------------------------------------------------ A CAIXA NA VISTA */
  function ehCaixa(c) { return c && fin(c.cx) && fin(c.cy) && fin(c.cz) && fin(c.comprimento) && fin(c.altura) && fin(c.espessura); }
  /* os 8 cantos da caixa do editor, no mundo (eixo X local = (cos r, −sin r), Z local = (sin r, cos r)) */
  function cantos8(c) {
    var r = num(c.rotY, 0), co = Math.cos(r), si = Math.sin(r), hx = c.comprimento / 2, hy = c.altura / 2, hz = c.espessura / 2, out = [];
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { [-1, 1].forEach(function (sz) {
      var lx = sx * hx, lz = sz * hz;
      out.push({ x: c.cx + lx * co + lz * si, y: c.cy + sy * hy, z: c.cz - lx * si + lz * co });
    }); }); });
    return out;
  }
  /* o fecho convexo (cadeia monótona) de pontos [a, b], sentido anti-horário na tela */
  function fecho(pts) {
    var P = pts.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }), n = P.length;
    if (n < 3) return P;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], i;
    for (i = 0; i < n; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], P[i]) <= 1e-12) lo.pop(); lo.push(P[i]); }
    var up = [];
    for (i = n - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], P[i]) <= 1e-12) up.pop(); up.push(P[i]); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  /* a laje por contorno: o prisma do contorno × a espessura, no lugar da caixa envolvente */
  function pontos3d(c) {
    if (Array.isArray(c.contorno) && c.contorno.length >= 3 && fin(c.cy) && fin(c.altura)) {
      var out = [];
      c.contorno.forEach(function (q) {
        var x = Array.isArray(q) ? +q[0] : +q.x, z = Array.isArray(q) ? +q[1] : +q.z;
        out.push({ x: x, y: c.cy - c.altura / 2, z: z }, { x: x, y: c.cy + c.altura / 2, z: z });
      });
      return out;
    }
    return cantos8(c);
  }
  /* a silhueta da caixa na vista (desenho): polígono convexo [[a, b], …] e a faixa de profundidade [min, max] */
  function projetarCaixa(c, q) {
    if (!ehCaixa(c) && !(Array.isArray(c && c.contorno))) return null;
    var P = pontos3d(c), pts = [], dmin = Infinity, dmax = -Infinity;
    P.forEach(function (p) { var v = daVista(q, p); if (v) pts.push(v); var d = profundidade(q, p); if (d < dmin) dmin = d; if (d > dmax) dmax = d; });
    if (pts.length < 3) return null;
    var h = fecho(pts); if (h.length < 3) return null;
    return { poli: h.map(function (v) { return [r4(v[0]), r4(v[1])]; }), dmin: dmin, dmax: dmax };
  }
  /* a peça aparece nesta vista? (na planta sempre; no corte, dentro da profundidade) */
  function naVista(pr, q, tolFrente) {
    if (!pr) return false;
    if (q.tipo !== "corte") return true;
    var t = tolFrente != null ? tolFrente : 0.02;
    if (pr.dmax < -t) return false;
    if (q.prof != null && pr.dmin > q.prof + t) return false;
    return true;
  }

  /* ----------------------------------------------- A GEOMETRIA DE SNAP */
  /* o mesmo formato do BimPrecisao.geometria — { els, segs, pontos, circs } —, só que no DESENHO da vista (x = a, z = b):
     assim o MESMO motor de snap serve a planta, o corte e a elevação. Cada peça vira a silhueta: pontas, meios, centro,
     o eixo da viga (horizontal) e o do pilar (vertical). Os níveis entram como linhas de referência. */
  function geometria(q, estado, o) {
    o = o || {};
    var segs = [], pontos = [], els = [], fora = {};
    (o.excluir || []).forEach(function (id) { fora[id] = 1; });
    if (!q || q.tipo !== "corte") return { els: els, segs: segs, pontos: pontos, circs: [] };
    function P(a, b) { return { x: a, z: b }; }
    ((estado && estado.caixas) || []).forEach(function (c) {
      if (!c || fora[c.id]) return;
      var pr = projetarCaixa(c, q); if (!pr || !naVista(pr, q)) return;
      var poli = pr.poli.map(function (v) { return P(v[0], v[1]); }), ap = [];
      for (var i = 0; i < poli.length; i++) {
        var a = poli[i], b = poli[(i + 1) % poli.length];
        if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) < 1e-6) continue;
        segs.push({ a: a, b: b, id: c.id, k: "face" });
        pontos.push({ p: a, tipo: "fim", id: c.id }, { p: P((a.x + b.x) / 2, (a.z + b.z) / 2), tipo: "meio", id: c.id });
        ap.push(a);
      }
      var cx = 0, cz = 0; poli.forEach(function (v) { cx += v.x; cz += v.z; }); cx /= poli.length; cz /= poli.length;
      /* o EIXO: a viga e a barra deitada têm a linha de centro horizontal; o pilar, a vertical (a que se alinha com outro pilar) */
      if (c.tipo === "viga" || c.tipo === "pilar") {
        var xs = poli.map(function (v) { return v.x; }), zs = poli.map(function (v) { return v.z; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs), e0, e1;
        if (c.tipo === "viga") { e0 = P(x0, (z0 + z1) / 2); e1 = P(x1, (z0 + z1) / 2); } else { e0 = P((x0 + x1) / 2, z0); e1 = P((x0 + x1) / 2, z1); }
        if (Math.abs(e0.x - e1.x) + Math.abs(e0.z - e1.z) > 1e-6) {
          segs.push({ a: e0, b: e1, id: c.id, k: "eixo" });
          pontos.push({ p: e0, tipo: "fim", id: c.id, eixo: true }, { p: e1, tipo: "fim", id: c.id, eixo: true }, { p: P((e0.x + e1.x) / 2, (e0.z + e1.z) / 2), tipo: "meio", id: c.id, eixo: true });
        }
      }
      pontos.push({ p: P(cx, cz), tipo: "centro", id: c.id });
      els.push({ id: c.id, tipo: c.tipo || "caixa", centro: P(cx, cz), rotY: 0, cantos: ap, segs: [], pontos: [], circs: [] });
    });
    /* NÍVEIS: a linha horizontal de cada nível por toda a largura da vista (o piso, o topo da parede acima) */
    var xr = o.xr && fin(o.xr[0]) && fin(o.xr[1]) ? o.xr : [0, q.L];
    (o.niveis || []).forEach(function (n, i) {
      if (!n || !fin(+n.y)) return;
      segs.push({ a: P(xr[0], -n.y), b: P(xr[1], -n.y), id: "nivel:" + (n.id != null ? n.id : i), k: "nivel" });
    });
    /* EIXOS DA GRADE que cruzam a linha da vista: a vertical, onde o eixo atravessa o plano */
    if (o.eixos && estado && estado.eixos) {
      var yr = o.yr && fin(o.yr[0]) && fin(o.yr[1]) ? o.yr : [-3, 12];
      estado.eixos.forEach(function (x) {
        if (!x || !fin(x.x0) || !fin(x.z0) || !fin(x.x1) || !fin(x.z1)) return;
        var dx = x.x1 - x.x0, dz = x.z1 - x.z0;
        /* o eixo cruza o plano quando a profundidade dos dois lados troca de sinal */
        var d0 = profundidade(q, { x: x.x0, z: x.z0 }), d1 = profundidade(q, { x: x.x1, z: x.z1 });
        if (Math.abs(d1 - d0) < 1e-9 || d0 * d1 > 0) return;
        var t = d0 / (d0 - d1), X = daVista(q, { x: x.x0 + dx * t, y: 0, z: x.z0 + dz * t })[0];
        segs.push({ a: P(X, -yr[1]), b: P(X, -yr[0]), id: "eixo:" + x.id, k: "eixo-grade" });
      });
    }
    return { els: els, segs: segs, pontos: pontos, circs: [] };
  }

  /* ---------------------------------------- A PROFUNDIDADE DA PEÇA */
  /* O ponto clicado que agarrou numa peça (o canto do pilar visto ao fundo) nasce na profundidade DELA, não no plano da vista:
     assim a viga desenhada entre dois pilares vistos cai entre os pilares. Vale para o pilar (o centro) e para a parede ou viga
     CORRIDA ao longo do plano; a que corre na profundidade (o olhar ao longo dela) não tem uma profundidade só → null. */
  function profundidadeDaPeca(q, c) {
    if (!q || q.tipo !== "corte" || !ehCaixa(c)) return null;
    var d = profundidade(q, { x: c.cx, z: c.cz });
    if (c.tipo === "pilar") return r4(d);
    if (c.tipo === "parede" || c.tipo === "viga") {
      var rr = num(c.rotY, 0), ux = Math.cos(rr), uz = -Math.sin(rr);
      return Math.abs(ux * q.n[0] + uz * q.n[1]) < 0.1 ? r4(d) : null;
    }
    return null;
  }

  /* ------------------------------------------------ A PAREDE NO RAIO */
  /* Qual parede o clique (a, b) atinge, olhando para dentro da vista? → { parede, t, ponto: {x, y, z}, prof, cortada } ou null.
     `t` é a distância ao longo do eixo da parede a partir do centro (o mesmo `t` de BimEdit.tNaParede). A parede CORTADA pelo
     plano da vista (o raio nasce dentro dela) vale no próprio plano; a parede vista ao fundo vale na face que se enxerga.
     Parede de topo para a vista (o eixo dela quase paralelo ao olhar) que o plano não corta não serve: o clique cairia na ponta. */
  function paredeNoRaio(q, estado, a, b, o) {
    o = o || {};
    if (!q || q.tipo !== "corte") return null;
    var R = raio(q, a, b); if (!R) return null;
    var melhor = null;
    ((estado && estado.caixas) || []).forEach(function (c) {
      if (!c || c.tipo !== "parede" || !ehCaixa(c) || c.arco) return;
      if (o.excluir && o.excluir.indexOf(c.id) >= 0) return;
      var y = R.o.y; if (y < c.cy - c.altura / 2 - 1e-6 || y > c.cy + c.altura / 2 + 1e-6) return;
      var rr = num(c.rotY, 0), co = Math.cos(rr), si = Math.sin(rr);
      /* o raio no sistema local da parede: lx ao longo do eixo, lz na espessura */
      var ox = R.o.x - c.cx, oz = R.o.z - c.cz;
      var lo = [ox * co - oz * si, ox * si + oz * co], ld = [R.d.x * co - R.d.z * si, R.d.x * si + R.d.z * co];
      var hx = c.comprimento / 2, hz = c.espessura / 2, tE = -Infinity, tS = Infinity, ok = true;
      [[lo[0], ld[0], hx], [lo[1], ld[1], hz]].forEach(function (s) {
        if (!ok) return;
        if (Math.abs(s[1]) < 1e-12) { if (Math.abs(s[0]) > s[2]) ok = false; return; }
        var t1 = (-s[2] - s[0]) / s[1], t2 = (s[2] - s[0]) / s[1];
        if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tE) tE = t1; if (t2 < tS) tS = t2;
      });
      if (!ok || tE > tS || tS < -1e-9) return;
      if (q.prof != null && tE > q.prof + 1e-9) return;
      var cortada = tE <= 1e-9;
      var emTopo = Math.abs(ld[0]) > 0.7071;   /* o olhar corre ao longo da parede */
      if (emTopo && !cortada) return;
      var td = cortada ? 0 : tE, lx = lo[0] + ld[0] * td;
      var item = { parede: c, id: c.id, t: r4(Math.max(-hx, Math.min(hx, lx))), prof: td, cortada: cortada,
                   ponto: { x: r4(R.o.x + R.d.x * td), y: r4(R.o.y), z: r4(R.o.z + R.d.z * td) } };
      if (!melhor || td < melhor.prof - 1e-9) melhor = item;
    });
    return melhor;
  }

  /* ------------------------------------------------ COMANDO × VISTA */
  /* `modo`: "direto" = a ferramenta funciona nesta vista, com o plano dela; "recusa" = não faz sentido aqui (o porquê e a
     vista certa vão junto). O resto da tabela (3D) é só informação: o 3D usa o plano de trabalho / nível ativo. */
  var NOME = { parede: "Parede", laje: "Laje (piso)", furo: "Furo na laje", forro: "Forro", pilar: "Pilar", viga: "Viga", eixo: "Eixo da grade", escada: "Escada", rampa: "Rampa",
               trelica: "Treliça", guarda: "Guarda-corpo", familia: "Porta, janela e componente", inst: "Tubo e eletroduto", cobertura: "Cobertura", telhado: "Telhado", fundacao: "Fundação" };
  var RECUSA = {
    laje: "A laje (piso) é uma superfície horizontal: o contorno dela se desenha de cima, na planta do nível. Num corte ou numa elevação só se vê a espessura dela.",
    furo: "O furo na laje é um contorno horizontal: desenhe na planta do nível.",
    forro: "O forro é um contorno horizontal (ou automático, clicando dentro da sala): desenhe na planta do nível ou na planta de forro.",
    escada: "A escada nasce do meio do 1º degrau e da direção da subida — dois pontos horizontais: desenhe na planta do nível.",
    rampa: "A rampa nasce do pé e da direção da subida — pontos horizontais: desenhe na planta do nível.",
    guarda: "O guarda-corpo segue um caminho horizontal (ou a lateral de uma escada): desenhe na planta do nível.",
    cobertura: "A cobertura por retângulo parte de dois cantos horizontais: desenhe na planta, ou use o telhado \"Por corte\" aqui na vista.",
    eixo: "O eixo da grade é uma linha horizontal de referência: desenhe na planta.",
    fundacao: "A fundação se posiciona pelos eixos e pelo pilar, de cima: desenhe na planta de fundação."
  };
  var DIRETO_CORTE = { parede: 1, pilar: 1, viga: 1, trelica: 1, familia: 1, inst: 1, telhado: 1 };
  /* sub = o id da ferramenta do editor (BIM.planta2d().traco().sub); vista = "planta" | "forro" | "estrutural" | "corte" | "elevacao" | "3d" */
  function ferramentaNaVista(sub, vista) {
    var v = String(vista || "planta");
    if (v === "planta" || v === "forro" || v === "estrutural" || v === "3d") return { modo: "direto", plano: v === "3d" ? "plano de trabalho / nível ativo" : "plano do nível" };
    if (DIRETO_CORTE[sub]) return { modo: "direto", plano: "plano da vista" + (v === "elevacao" ? " (elevação)" : " (corte)") };
    if (RECUSA[sub]) return { modo: "recusa", motivo: RECUSA[sub], oferecer: "planta" };
    return { modo: "direto", plano: "plano da vista" };
  }

  var BimVistaPlano = {
    quadro: quadro, paraMundo: paraMundo, daVista: daVista, profundidade: profundidade, raio: raio, nivelNaCota: nivelNaCota,
    profundidadeDaPeca: profundidadeDaPeca, cantos8: cantos8, fecho: fecho, projetarCaixa: projetarCaixa, naVista: naVista, geometria: geometria, paredeNoRaio: paredeNoRaio,
    ferramentaNaVista: ferramentaNaVista, NOME: NOME, RECUSA: RECUSA, DIRETO_CORTE: DIRETO_CORTE, dist2: dist2
  };
  global.BimVistaPlano = BimVistaPlano;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVistaPlano;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

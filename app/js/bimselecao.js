/* =====================================================================
 * bimselecao.js — SELECIONAR é o padrão do botão esquerdo (planta e 3D);
 * mover a vista é o botão do MEIO (09/10/2026).
 *
 * Pedido do Rogério: "quando estiver fazendo a modelagem, tem a opção de
 * SELECIONAR qualquer coisa, pela planta, pelo 3D. Hoje ele está mostrando
 * uma MÃOZINHA que você tem que ficar puxando para um lado e para o outro.
 * Essa mãozinha tinha que ser um comando onde eu apertasse Ctrl e o botão
 * Scroll do mouse, aí eu puxasse. Tem que ficar como PADRÃO o SELECIONAR:
 * eu clico na parede, quero alterar a parede, quero puxar a parede."
 *
 * POR QUE ERA A MÃO
 *   · planta (js/bim2dui.js): o pointerdown sem ferramenta caía no arrasto
 *     da vista com o botão esquerdo OU o do meio, e o CSS dava `cursor: grab`
 *     à vista inteira — não havia seleção nenhuma na planta;
 *   · 3D (js/bim.js): o OrbitControls nasce com LEFT = girar, e a seleção
 *     sem editor era só por DUPLO clique (o clique simples só selecionava no
 *     modo visitante e no toque).
 *
 * O MAPA (mouse e teclado; o toque fica como estava)
 *   esquerdo, clique numa peça ........ seleciona (realce + Propriedades)
 *   Ctrl + clique ...................... soma/tira da seleção
 *   esquerdo, clique no vazio .......... limpa a seleção (Esc também)
 *   esquerdo, arrastar no vazio ........ janela: da esquerda para a direita
 *                                        pega só o que está INTEIRO dentro
 *                                        (linha contínua); da direita para a
 *                                        esquerda pega o que TOCA (tracejada)
 *   esquerdo, arrastar a peça .......... move (snap + ortogonal da barra de
 *                                        opções, a config de "Mover")
 *   esquerdo, arrastar a alça .......... estica/encurta a ponta da parede
 *   Delete ............................. apaga a seleção
 *   botão do MEIO (ou Ctrl + meio) ..... move a vista (a mão aparece só aí)
 *   Shift + meio (3D) .................. gira a vista (orbitar)
 *   roda ............................... zoom no cursor
 *   botão Mão (rodapé da vista) ........ o esquerdo volta a mover a vista
 *   toque: um dedo move/gira e dois dão zoom, como antes; tocar seleciona.
 *   Tudo o que muda o modelo vira op do editor (Ctrl+Z desfaz).
 *
 * QUEM FAZ O QUÊ
 *   este arquivo, PURO (Node-testável, tools/test-bimselecao.js): a regra de
 *   botão → ação, a janela (dentro × cruzando), combinar seleções, o ponto
 *   do arrasto (snap + ortogonal) e o casco convexo (janela no 3D);
 *   este arquivo, TELA: a seleção, a janela, o arrasto e as alças NA PLANTA
 *   (o js/bim2dui.js só repassa os eventos);
 *   js/bim.js: o 3D (botões da órbita, clique, janela, arrasto, roda no
 *   cursor) e a seleção ÚNICA de toda a tela (BIM.selecionar / selecao);
 *   js/bimprecisaoui.js: mover/esticar como op (a mesma conta do Mover e das
 *   alças que já existiam).
 * ===================================================================== */
(function (global) {
  "use strict";

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function P(x, z) { return { x: x, z: z }; }
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  /* códigos do OrbitControls (THREE.MOUSE): girar, zoom por arrasto, mover; -1 = nada */
  var GIRAR = 0, ZOOM = 1, MOVER = 2, NADA = -1;
  var LIMIAR = 4;   /* px: abaixo disto é clique, acima é arrasto */

  /* =================================================================
   * PURO
   * ================================================================= */
  /* botão → ação. ctx = { botao: 0|1|2, toque, mao, ferramenta, visitante, vista: "2d"|"3d",
     alvo: "alca"|"peca"|"vazio", editavel, modelador, ctrl, shift } */
  function acao(ctx) {
    ctx = ctx || {};
    var tresD = ctx.vista === "3d";
    if (ctx.botao === 1) return tresD && ctx.shift ? "orbitar" : "pan";
    if (ctx.botao === 2) return tresD ? "pan" : null;
    if (ctx.botao !== 0) return null;
    if (ctx.toque) return tresD ? "orbitar" : "pan";   /* o dedo navega como antes; o TOQUE simples seleciona (no soltar) */
    if (tresD && ctx.visitante) return "orbitar";     /* o visitante só olha o modelo: o esquerdo gira, como sempre foi */
    if (ctx.mao) return "pan";
    if (ctx.ferramenta) return "ferramenta";
    if (ctx.alvo === "alca") return "alca";
    if (ctx.alvo === "peca") {
      if (ctx.ctrl) return "alternar";
      return ctx.editavel && ctx.modelador ? "peca-mover" : "peca";
    }
    return ctx.modelador ? "janela" : "vazio";
  }
  /* os botões da órbita no 3D, decididos a cada pointerdown (a captura roda antes do OrbitControls).
     ⚠ O OrbitControls INVERTE com Ctrl/Shift: MOVER + Shift gira, GIRAR + Ctrl move. Por isso o
     Ctrl + meio (o que o Rogério descreveu) é "GIRAR" aqui — que com o Ctrl apertado vira mover. */
  function botoesOrbita(ctx) {
    ctx = ctx || {};
    if (ctx.visitante) return { LEFT: GIRAR, MIDDLE: ZOOM, RIGHT: MOVER };   /* o de sempre */
    var ctrl = !!(ctx.ctrl || ctx.meta);
    return { LEFT: ctx.mao ? MOVER : NADA, MIDDLE: (ctrl && !ctx.shift) ? GIRAR : MOVER, RIGHT: MOVER };
  }
  function arrastou(a, b, lim) { if (!a || !b) return false; var dx = b.x - a.x, dy = b.y - a.y; return dx * dx + dy * dy > (lim == null ? LIMIAR : lim) * (lim == null ? LIMIAR : lim); }
  /* da esquerda para a direita (na TELA) = "dentro"; da direita para a esquerda = "cruzando" */
  function modoJanela(xIni, xFim) { return xFim >= xIni ? "dentro" : "cruzando"; }
  function janela(a, b, modo) {
    return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), modo: modo || modoJanela(a[0], b[0]) };
  }
  function dentroRet(p, r) { return p[0] >= r.x0 - 1e-9 && p[0] <= r.x1 + 1e-9 && p[1] >= r.y0 - 1e-9 && p[1] <= r.y1 + 1e-9; }
  /* o segmento toca o retângulo? (Liang–Barsky) */
  function segToca(s, r) {
    var x0 = s[0], y0 = s[1], dx = s[2] - s[0], dy = s[3] - s[1], t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [x0 - r.x0, r.x1 - x0, y0 - r.y0, r.y1 - y0];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) { if (q[i] < -1e-9) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 <= t1 + 1e-12;
  }
  function pontoEmPol(p, pol) {
    var d = false;
    for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var a = pol[i], b = pol[j];
      if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0])) d = !d;
    }
    return d;
  }
  /* as peças que a janela pega. pecas = [{ id, pts: [[x,y]…], segs: [[x1,y1,x2,y2]…], polis: [[[x,y]…]] }]
     dentro: TODOS os pontos dentro; cruzando: um ponto dentro, uma linha que cruza a borda, ou a
     janela inteira dentro de um contorno fechado da peça (a janela pequena no meio da laje toca a laje) */
  function pegaJanela(r, pecas) {
    var out = [];
    (pecas || []).forEach(function (pc) {
      var pts = pc.pts || [], segs = pc.segs || [];
      if (!pts.length && !segs.length) return;
      var todos = pts.concat(segs.reduce(function (a, s) { a.push([s[0], s[1]], [s[2], s[3]]); return a; }, []));
      var pega;
      if (r.modo === "cruzando") {
        pega = todos.some(function (p) { return dentroRet(p, r); }) || segs.some(function (s) { return segToca(s, r); }) ||
               (pc.polis || []).some(function (pol) { return pol.length >= 3 && pontoEmPol([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2], pol); });
      } else pega = todos.every(function (p) { return dentroRet(p, r); });
      if (pega && out.indexOf(pc.id) < 0) out.push(pc.id);
    });
    return out;
  }
  /* combinar a seleção: "trocar" (só os novos), "somar" (Ctrl + janela) e "alternar" (Ctrl + clique) */
  function combinar(atual, ids, modo) {
    var a = [], vistos = {};
    (atual || []).forEach(function (x) { if (x != null && !vistos[x]) { vistos[x] = 1; a.push(x); } });
    var n = []; (ids || []).forEach(function (x) { if (x != null && n.indexOf(x) < 0) n.push(x); });
    if (modo === "somar") { n.forEach(function (x) { if (!vistos[x]) { vistos[x] = 1; a.push(x); } }); return a; }
    if (modo === "alternar") {
      n.forEach(function (x) { var i = a.indexOf(x); if (i >= 0) a.splice(i, 1); else a.push(x); });
      return a;
    }
    return n;
  }
  /* casco convexo (cadeia monótona) — a pegada da peça projetada na tela, para a janela no 3D */
  function casco(pts) {
    var p = (pts || []).filter(function (q) { return q && fin(q[0]) && fin(q[1]); }).map(function (q) { return [q[0], q[1]]; });
    p.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    function cruz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [];
    for (var i = 0; i < p.length; i++) { while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (var k = p.length - 1; k >= 0; k--) { while (hi.length >= 2 && cruz(hi[hi.length - 2], hi[hi.length - 1], p[k]) <= 0) hi.pop(); hi.push(p[k]); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }
  function pecaDoCasco(id, pts) {
    var h = casco(pts), segs = [];
    for (var i = 0; i < h.length; i++) { var a = h[i], b = h[(i + 1) % h.length]; if (h.length > 1) segs.push([a[0], a[1], b[0], b[1]]); }
    return { id: id, pts: h, segs: segs, polis: h.length >= 3 ? [h] : [] };
  }
  /* O PONTO DO ARRASTO (mover a peça, esticar a ponta): o snap do que NÃO está sendo arrastado e,
     se o snap não for um ponto notável, o ortogonal/incrementos da barra de opções a partir da base.
     dep = { R: BimPrecisao, Bo: BimBarraOpcoes } (injetado no teste). Devolve { p, sn, travado }. */
  function pontoArrasto(base, cur, geo, tol, cfg, shift, dep) {
    dep = dep || {};
    var R = dep.R || global.BimPrecisao, Bo = dep.Bo || global.BimBarraOpcoes;
    if (!cur || !fin(cur.x) || !fin(cur.z)) return { p: cur, sn: null, travado: false };
    cfg = cfg || (Bo && Bo.padrao ? Bo.padrao() : { orto: true, inc: [45, 90, 180], snap: true, grade: true, passo: 0.1 });
    var sn = null;
    if (R && cfg.snap && geo) {
      var T = {}; (R.TIPOS || []).forEach(function (t) { T[t] = !cfg.tipos || cfg.tipos[t] !== false; }); T.grade = !!cfg.grade && T.grade !== false;
      /* sem `ref`: a extensão a partir da base é o próprio ortogonal (abaixo), e ela tirava o passo da grade (0,97 m) */
      sn = R.snap(cur, geo, { tol: tol, tipos: T, grade: cfg.grade ? cfg.passo : 0 });
    }
    var q = sn ? P(sn.p.x, sn.p.z) : P(cur.x, cur.z), forte = !!(sn && R && R.CLASSE && R.CLASSE[sn.sub || sn.tipo] <= 1), travado = false;
    if (base && Bo && Bo.ajustarPontoCom && !forte) {
      var daGrade = !sn || sn.tipo === "grade";
      var aj = Bo.ajustarPontoCom(base, daGrade ? P(cur.x, cur.z) : q, cfg, !!shift);
      if (aj.travado) {
        if (daGrade && cfg.snap && cfg.grade && Bo.arredondar) aj = Bo.arredondar(base, aj, cfg.passo);
        q = P(aj.p.x, aj.p.z); travado = true;
        sn = (daGrade && sn) ? { p: q, tipo: "grade" } : (sn && dist(q, sn.p) <= 1e-6 ? sn : null);
      } else if (daGrade && !sn && cfg.snap && cfg.grade && cfg.passo > 0 && base) {
        /* ângulo livre e nada perto: o deslocamento anda no passo da grade */
        q = P(base.x + Math.round((cur.x - base.x) / cfg.passo) * cfg.passo, base.z + Math.round((cur.z - base.z) / cfg.passo) * cfg.passo);
      }
    }
    return { p: P(r4(q.x), r4(q.z)), sn: sn, travado: travado };
  }
  /* a peça sob o ponto num desenho 2D (cortes com `u` e arestas com linhasUd): o menor contorno
     fechado que contém o ponto ganha; senão, a linha mais perto dentro da tolerância */
  function pecaNoDesenho(dados, p, tol) {
    if (!dados || !p) return null;
    var best = null, bestA = Infinity;
    function area(pts) { var s = 0; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(s / 2); }
    function dSeg(q, a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
      var x = a[0] + dx * t - q[0], y = a[1] + dy * t - q[1]; return Math.sqrt(x * x + y * y);
    }
    (dados.cortes || []).forEach(function (c) {
      if (!c || !c.u || !c.pts || c.pts.length < 3 || c.fechado === false) return;
      if (pontoEmPol(p, c.pts)) { var a = area(c.pts); if (a < bestA) { bestA = a; best = c.u; } }
    });
    if (best) return best;
    var dm = tol > 0 ? tol : 0.1;
    (dados.cortes || []).forEach(function (c) {
      if (!c || !c.u || !c.pts) return;
      var n = c.pts.length;
      for (var i = 0; i + 1 < n + (c.fechado !== false && n > 2 ? 1 : 0); i++) { var d = dSeg(p, c.pts[i], c.pts[(i + 1) % n]); if (d < dm) { dm = d; best = c.u; } }
    });
    var L = dados.linhas || [], U = dados.linhasUd || [];
    for (var k = 0; k < L.length && k < U.length; k++) {
      var l = L[k], ud = U[k]; if (!l || !ud || !ud.u) continue;
      var d2 = dSeg(p, [l[0], l[1]], [l[2], l[3]]); if (d2 < dm) { dm = d2; best = ud.u; }
    }
    return best;
  }
  /* as peças de um desenho 2D para a janela, agrupadas por uid */
  function pecasDoDesenho(dados, filtro) {
    var m = {}, ordem = [];
    function peca(u) { if (!m[u]) { m[u] = { id: u, pts: [], segs: [], polis: [] }; ordem.push(u); } return m[u]; }
    ((dados && dados.cortes) || []).forEach(function (c) {
      if (!c || !c.u || !c.pts || !c.pts.length || (filtro && !filtro(c.u))) return;
      var pc = peca(c.u), n = c.pts.length, fecha = c.fechado !== false && n > 2;
      c.pts.forEach(function (q) { pc.pts.push([q[0], q[1]]); });
      for (var i = 0; i + 1 < n + (fecha ? 1 : 0); i++) { var a = c.pts[i], b = c.pts[(i + 1) % n]; pc.segs.push([a[0], a[1], b[0], b[1]]); }
      if (fecha) pc.polis.push(c.pts);
    });
    var L = (dados && dados.linhas) || [], U = (dados && dados.linhasUd) || [];
    for (var k = 0; k < L.length && k < U.length; k++) {
      var ud = U[k]; if (!ud || !ud.u || (filtro && !filtro(ud.u))) continue;
      peca(ud.u).segs.push([L[k][0], L[k][1], L[k][2], L[k][3]]);
    }
    return ordem.map(function (u) { return m[u]; });
  }

  /* =================================================================
   * A TELA (planta e as outras vistas 2D)
   * ================================================================= */
  var NS = "http://www.w3.org/2000/svg";
  function B() { return global.BIM || null; }
  function D2() { return global.Bim2D || null; }
  function Pr() { return global.BimPrecisao || null; }
  function Bo() { return global.BimBarraOpcoes || null; }
  function modelador() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  /* ⚠ a Mão NÃO é lembrada entre sessões: o padrão é SELECIONAR — abrir o BIM com o esquerdo
     movendo a vista, sem lembrar de ter ligado a Mão ontem, é justamente o que o pedido tirou */
  var st = { mao: false, d: null, hover: null, tHover: 0 };

  var BimSelecao = {
    /* puro (testes) */
    acao: acao, botoesOrbita: botoesOrbita, arrastou: arrastou, modoJanela: modoJanela, janela: janela, pegaJanela: pegaJanela,
    combinar: combinar, casco: casco, pecaDoCasco: pecaDoCasco, pontoArrasto: pontoArrasto, pecaNoDesenho: pecaNoDesenho, pecasDoDesenho: pecasDoDesenho,
    segToca: segToca, LIMIAR: LIMIAR,

    /* ------------------------------------------------ a MÃO (ferramenta explícita) */
    mao: function (on) {
      if (on != null) {
        st.mao = !!on;
        this._pintarMao(); this.mudou();
        status(st.mao ? "Mão ligada: o botão esquerdo move a vista. Clique em Mão de novo para voltar a selecionar."
                      : "Selecionar: clique na peça; arraste no vazio para a janela. Botão do meio move a vista.");
      }
      return st.mao;
    },
    _pintarMao: function () {
      try {
        if (global.document && global.document.documentElement) {
          if (st.mao) global.document.documentElement.setAttribute("data-bim-mao", "1"); else global.document.documentElement.removeAttribute("data-bim-mao");
          var b = global.document.querySelectorAll('[data-rv-vb="mao"]');
          for (var i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", st.mao ? "true" : "false");
        }
      } catch (e) {}
    },
    /* este pointerdown da vista 2D é para mover a vista? meio sempre; esquerdo com a Mão ou com o dedo */
    panPlanta: function (ev) { return !!ev && (ev.button === 1 || (ev.button === 0 && (ev.pointerType === "touch" || st.mao))); },

    /* ------------------------------------------------ o que está selecionado (a fonte é o BIM) */
    uids: function () { var b = B(); try { var s = b && b.selecao ? b.selecao() : null; return (s && s.uids) || []; } catch (e) { return []; } },
    selecionar: function (uids, modo) { var b = B(); if (!b || !b.selecionar) return []; return b.selecionar(uids || [], modo || "trocar") || []; },
    /* alguma ferramenta da vista 2D armada (traçar corte, anotação, ambiente, modelar na planta, P6) */
    ferramenta2d: function () {
      try {
        var P2 = D2(); if (P2 && P2._pick) return true;
        if (global.BimAnot2DUI && global.BimAnot2DUI._f) return true;
        if (global.BimAmbienteUI && global.BimAmbienteUI.ferramenta && global.BimAmbienteUI.ferramenta()) return true;
        if (global.BimPlantaModelar && global.BimPlantaModelar.ativo && global.BimPlantaModelar.ativo() && global.BimPlantaModelar.ferramenta()) return true;
        var M6 = global.BimModeloVista; if (M6 && M6._pick) return true;
        var A5 = global.BimAnot; if (A5 && A5._ferr) return true;
      } catch (e) {}
      return false;
    },
    _cache: function (id) { var P2 = D2(); return P2 && P2._cache ? P2._cache[id] : null; },
    _escala: function (id) { var c = this._cache(id), m = c && c.svg && c.svg.getScreenCTM ? c.svg.getScreenCTM() : null; return m && m.a > 0 ? m.a : 100; },
    /* a planta (não forro, não corte): a coordenada do desenho é a do mundo (x, z) — dá para mover e esticar */
    _ehPlanta: function (id) {
      var P2 = D2(), d = P2 && P2.def ? P2.def(id) : null;
      return !!(d && d.tipo === "planta" && d.p6 !== "forro" && d.p6base !== "forro");
    },
    pecaEm: function (id, p) { var c = this._cache(id); return c && c.dados && p ? pecaNoDesenho(c.dados, p, 6 / this._escala(id)) : null; },
    _estado: function () { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } },
    _precisao: function () { var b = B(); try { return b && b.precisao ? b.precisao() : null; } catch (e) { return null; } },
    _avaliar: function () { var b = B(); return b && b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null; },
    _cfgMover: function () { var o = Bo(); return o && o.cfg ? o.cfg("mover") : null; },

    /* ------------------------------------------------ eventos da vista 2D (o js/bim2dui.js repassa) */
    down2d: function (id, ev, p) {
      if (!ev || ev.button !== 0 || ev.pointerType === "touch" || st.mao || !p) return false;
      var c = this._cache(id); if (!c || !c.dados || !c.el) return false;
      var alcaEl = ev.target && ev.target.closest ? ev.target.closest("[data-sl-alca]") : null;
      var u = alcaEl ? null : this.pecaEm(id, p), mod = modelador(), planta = this._ehPlanta(id);
      var editavel = !!(u && /^edit:/.test(u) && planta && mod && this._precisao());
      var a = acao({ botao: 0, vista: "2d", alvo: alcaEl ? "alca" : (u ? "peca" : "vazio"), editavel: editavel, modelador: mod, ctrl: !!(ev.ctrlKey || ev.metaKey), shift: !!ev.shiftKey });
      st.d = { id: id, x: ev.clientX, y: ev.clientY, p0: p, u: u, acao: a, ctrl: !!(ev.ctrlKey || ev.metaKey), planta: planta, modo: null,
               alca: alcaEl ? { k: alcaEl.getAttribute("data-sl-alca"), id: alcaEl.getAttribute("data-sl-id") } : null };
      if (st.d.alca && /^[0-9]+$/.test(st.d.alca.k)) st.d.alca.k = +st.d.alca.k;
      try { c.el.setPointerCapture(ev.pointerId); } catch (e) {}
      /* sem preventDefault: o clique na vista tira o foco do campo que estava sendo digitado (o Delete
         seguinte apaga a peça, não o texto do campo) */
      return true;
    },
    move2d: function (id, ev, p) {
      var d = st.d;
      if (!d || d.id !== id) { this._hover(id, ev, p); return false; }
      if (!d.modo) {
        if (!arrastou({ x: d.x, y: d.y }, { x: ev.clientX, y: ev.clientY })) return true;
        this._comecar(d);
      }
      if (!p) return true;
      if (d.modo === "janela") d.j = janela([d.p0[0], d.p0[1]], [p[0], p[1]], modoJanela(d.x, ev.clientX));
      else if (d.modo === "mover" || d.modo === "alca") {
        var r = pontoArrasto(d.base, P(p[0], p[1]), d.geo, 12 / this._escala(id), this._cfgMover(), !!ev.shiftKey);
        d.dest = r.p; d.sn = r.sn;
        var dd = dist(d.base, d.dest);
        status((d.modo === "mover" ? "Movendo: " : "Esticando: ") + fmt(dd) + " m" + (r.sn && r.sn.tipo ? " · snap " + r.sn.tipo : "") + " (Esc cancela; Shift solta o ângulo).");
      }
      this.desenhar(id);
      return true;
    },
    _comecar: function (d) {
      var a = d.acao, prc = this._precisao();
      d.modo = "nada";
      if (a === "janela") { d.modo = "janela"; return; }
      if (a === "alca" && d.alca && d.planta && prc) {
        var est = this._estado(), R = Pr(), el = est && (est.caixas || []).filter(function (x) { return x.id === d.alca.id; })[0];
        var al = el && R ? R.alcas(el).filter(function (q) { return q.k === d.alca.k; })[0] : null;
        if (!al) return;
        d.modo = "alca"; d.base = P(al.p.x, al.p.z); d.dest = d.base;
        d.geo = R.geometria(est, { excluir: [d.alca.id], avaliar: this._avaliar() });
        return;
      }
      if (a === "peca-mover" && prc) {
        var ed = d.u.slice(5);
        if (this.uids().indexOf(d.u) < 0) this.selecionar([d.u], "trocar");
        var sel = (prc.selecao ? prc.selecao() : []), est2 = this._estado(), R2 = Pr();
        if (!sel.length || !R2) return;
        var fixa = sel.filter(function (x) { return R2.fixado(est2, x); });
        if (fixa.length) { status("Elemento fixado: use Desafixar antes (a peça fixada não anda)."); return; }
        if (sel.indexOf(ed) < 0) return;
        var geoT = R2.geometria(est2, { avaliar: this._avaliar() }), s = {}; sel.forEach(function (x) { s[x] = 1; });
        d.geoSel = { els: geoT.els.filter(function (g) { return s[g.id]; }), segs: geoT.segs.filter(function (g) { return s[g.id]; }), pontos: geoT.pontos.filter(function (g) { return s[g.id]; }) };
        /* a base agarra na própria peça (ponta, meio): o destino que agarra no vizinho encosta certinho */
        var cur = P(d.p0[0], d.p0[1]), sn0 = R2.snap(cur, d.geoSel, { tol: 12 / this._escala(d.id), tipos: { fim: true, meio: true, centro: true, intersecao: true } });
        d.base = sn0 ? P(sn0.p.x, sn0.p.z) : cur; d.dest = d.base;
        d.geo = R2.geometria(est2, { excluir: sel, avaliar: this._avaliar() });
        d.modo = "mover";
      }
    },
    up2d: function (id, ev, p, cancelou) {
      var d = st.d; if (!d || d.id !== id) return false;
      st.d = null;
      var c = this._cache(id); try { if (c && c.el && ev) c.el.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (cancelou) { this.desenhar(id); return true; }
      var prc = this._precisao();
      if (!d.modo) {   /* CLIQUE */
        if (d.acao === "alca") { this.desenhar(id); return true; }
        if (d.u) this.selecionar([d.u], d.ctrl ? "alternar" : "trocar");
        else if (!d.ctrl) this.selecionar([], "trocar");
        this.desenhar(id);
        return true;
      }
      if (d.modo === "janela" && d.j) {
        var ids = pegaJanela(d.j, pecasDoDesenho(c && c.dados, function (u) { return /^edit:/.test(u); }));
        this.selecionar(ids, d.ctrl ? "somar" : "trocar");
        status(ids.length ? ids.length + " peça(s) selecionada(s) pela janela (" + (d.j.modo === "dentro" ? "só o que está inteiro dentro" : "o que a janela toca") + ")." : "A janela não pegou nenhuma peça.");
      } else if (d.modo === "mover" && prc && d.dest && d.base) {
        var dx = r4(d.dest.x - d.base.x), dz = r4(d.dest.z - d.base.z);
        if (Math.abs(dx) + Math.abs(dz) > 1e-4 && prc.mover) prc.mover(dx, dz);
      } else if (d.modo === "alca" && prc && d.dest && d.base && dist(d.dest, d.base) > 1e-4 && prc.esticar) {
        prc.esticar(d.alca.id, d.alca.k, d.dest);
      }
      this.desenhar(id);
      return true;
    },
    /* o toque simples (o dedo continua movendo a vista; tocar e soltar no lugar seleciona) */
    clique2d: function (id, ev, p) {
      if (!p) return false;
      var u = this.pecaEm(id, p);
      this.selecionar(u ? [u] : [], "trocar");
      this.desenhar(id);
      return true;
    },
    cancelar: function () { var d = st.d; if (!d) return false; st.d = null; this.desenhar(d.id); status("Cancelado."); return true; },
    arrastando: function () { return !!(st.d && st.d.modo); },
    _hover: function (id, ev, p) {
      if (st.mao || !p || (ev && ev.buttons)) return;
      var agora = Date.now(); if (agora - st.tHover < 40) return; st.tHover = agora;
      var u = this.ferramenta2d() ? null : this.pecaEm(id, p);
      if (u === st.hover && st.hoverId === id) return;
      st.hover = u; st.hoverId = id;
      this.desenhar(id);
    },

    /* ------------------------------------------------ o desenho por cima (seleção, alças, janela, fantasma) */
    mudou: function () { var P2 = D2(), self = this; if (!P2 || !P2._cache) return; Object.keys(P2._cache).forEach(function (k) { self.desenhar(k); }); },
    aposDesenhar: function (id) { this.desenhar(id); },
    desenhar: function (id) {
      var c = this._cache(id); if (!c || !c.svg || !global.document) return;
      var g = c.svg.querySelector("g.sl-cam");
      if (!g) { g = global.document.createElementNS(NS, "g"); g.setAttribute("class", "sl-cam"); }
      if (g.parentNode !== c.svg || c.svg.lastChild !== g) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      if (c.el) { if (st.mao) c.el.setAttribute("data-d2-mao", "1"); else c.el.removeAttribute("data-d2-mao"); }
      var dados = c.dados; if (!dados) return;
      var u1 = 1 / this._escala(id), sel = this.uids(), sm = {}, d = st.d && st.d.id === id ? st.d : null;
      sel.forEach(function (u) { sm[u] = 1; });
      function el(tag, at, pai) { var e = global.document.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); (pai || g).appendChild(e); return e; }
      function contorno(u, cls) {
        (dados.cortes || []).forEach(function (cc) {
          if (!cc || cc.u !== u || !cc.pts || cc.pts.length < 2) return;
          var s = ""; cc.pts.forEach(function (q, i) { s += (i ? "L" : "M") + q[0] + " " + q[1]; }); if (cc.fechado !== false && cc.pts.length > 2) s += "Z";
          el("path", { d: s, "class": cls, "vector-effect": "non-scaling-stroke" });
        });
        var L = dados.linhas || [], U = dados.linhasUd || [];
        for (var k = 0; k < L.length && k < U.length; k++) if (U[k] && U[k].u === u) el("line", { x1: L[k][0], y1: L[k][1], x2: L[k][2], y2: L[k][3], "class": cls, "vector-effect": "non-scaling-stroke" });
      }
      if (st.hover && st.hoverId === id && !sm[st.hover] && !d) contorno(st.hover, "sl-hover");
      sel.forEach(function (u) { contorno(u, "sl-sel"); });
      /* alças: uma peça do editor selecionada, na planta, com o modelador */
      var prc = this._precisao(), R = Pr(), planta = this._ehPlanta(id);
      var eds = sel.filter(function (u) { return /^edit:/.test(u); });
      if (planta && modelador() && prc && R && eds.length === 1 && sel.length === 1 && !(d && d.modo === "mover")) {
        var est = this._estado(), eid = eds[0].slice(5), cx = est && (est.caixas || []).filter(function (x) { return x.id === eid; })[0];
        (cx ? R.alcas(cx) : []).forEach(function (a) {
          var p = (d && d.modo === "alca" && d.alca && String(d.alca.k) === String(a.k) && d.dest) ? d.dest : a.p;
          el("circle", { cx: p.x, cy: p.z, r: 5 * u1, "class": "sl-alca", "data-sl-alca": String(a.k), "data-sl-id": eid, "vector-effect": "non-scaling-stroke" });
        });
        if (d && d.modo === "alca" && d.base && d.dest) el("line", { x1: d.base.x, y1: d.base.z, x2: d.dest.x, y2: d.dest.z, "class": "sl-fantasma", "vector-effect": "non-scaling-stroke" });
      }
      if (d && d.modo === "mover" && d.geoSel && d.dest) {
        var dx = d.dest.x - d.base.x, dz = d.dest.z - d.base.z;
        d.geoSel.segs.forEach(function (s) { if (s.k === "eixo") return; el("line", { x1: s.a.x + dx, y1: s.a.z + dz, x2: s.b.x + dx, y2: s.b.z + dz, "class": "sl-fantasma", "vector-effect": "non-scaling-stroke" }); });
        el("line", { x1: d.base.x, y1: d.base.z, x2: d.dest.x, y2: d.dest.z, "class": "sl-guia", "vector-effect": "non-scaling-stroke" });
      }
      if (d && d.modo === "janela" && d.j) {
        el("rect", { x: d.j.x0, y: d.j.y0, width: Math.max(d.j.x1 - d.j.x0, 1e-6), height: Math.max(d.j.y1 - d.j.y0, 1e-6),
                     "class": "sl-janela sl-janela-" + d.j.modo, "data-sl-janela": d.j.modo, "vector-effect": "non-scaling-stroke" });
      }
    },
    /* estado para o e2e e o suporte (só leitura) */
    estado: function () { var d = st.d; return { mao: st.mao, arrasto: d ? { id: d.id, modo: d.modo, acao: d.acao, u: d.u, dest: d.dest || null, base: d.base || null, janela: d.j || null } : null, hover: st.hover }; }
  };

  global.BimSelecao = BimSelecao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimSelecao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

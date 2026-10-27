/* =====================================================================
 * bimsetas.js — AS SETAS DO TECLADO MOVEM A SELEÇÃO (pedido do Rogério, 27/10/2026):
 *   "Selecionar QUALQUER coisa e, apertando as SETAS do teclado, ela se movimentar de acordo com a tecla."
 *   "Para ajuste fino, aperto Ctrl e ele movimenta bem um pouquinho; e vou dar zoom até chegar perto."
 *
 * Mesma ideia do Delete (#85) e do Ctrl + arrastar (#86): vale para qualquer peça e usa a MESMA op de mover que o arraste usa
 * (parede, pilar, viga, família/móvel, cota, anotação: a op `transformar` do desenho de precisão, com os vínculos; porta e
 * janela: BimVaoArr.posicionar, só ao longo da parede; tubo/conexão: BimInstArr, a mesma do arraste; subir/descer: a op
 * `elevar`).
 *
 * O PASSO SEGUE O ZOOM (tudo num lugar só, CFG, para virar opção depois):
 *   seta ........... ~5 px da tela, arredondado para a série 1 mm · 5 mm · 1 cm · 5 cm · 10 cm · 50 cm
 *   Ctrl + seta .... ~1 px da tela, na mesma série (mínimo 1 mm; nunca maior que a seta sozinha)
 *   Shift + seta ... 10 vezes o passo da seta sozinha
 *   Mais zoom = passo menor. No 3D vale a escala da tela na distância da peça selecionada.
 *
 * DIREÇÃO:
 *   planta / vista 2D ... ← → = X do papel, ↑ ↓ = Y do papel (lidos da matriz do desenho: vale com a vista girada)
 *   corte / fachada ..... ← → ao longo do plano do corte, ↑ ↓ vertical (op elevar)
 *   3D .................. no plano horizontal, pelo eixo do modelo mais próximo da direção da câmera: ↑ = para longe da
 *                         câmera, ← → idem (nunca em diagonal). PageUp / PageDown sobem e descem (em qualquer vista).
 *
 * REGRAS: porta/janela só anda ao longo da parede e nunca sai dela (validar do BimVaoArr); seleção múltipla anda junta; peça
 * fixada (pin) não anda e o status diz por quê; toques seguidos na mesma direção em até 600 ms viram UM passo de Ctrl+Z
 * (desfaz o toque anterior e grava a soma); campo de texto, caixa de Propriedades, diálogo e menu ficam com a seta; ferramenta
 * armada que usa seta tem prioridade; sem seleção a seta segue o que fazia (nada é consumido).
 *
 * Puro quanto possível: `executar(ev, amb)` recebe o ambiente por parâmetro (tools/test-setas-mover.js). O ambiente do
 * navegador (ambienteReal) liga nas APIs de sempre: BIM, BimPrecisao, BimVaoArr, BimInstArr, Bim2D.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---- os números do passo, num lugar só (virar opção do usuário depois) ---- */
  var CFG = {
    SERIE: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],   /* m: 1 mm · 5 mm · 1 cm · 5 cm · 10 cm · 50 cm */
    pxBase: 5,        /* seta: ~5 px da tela */
    pxFino: 1,        /* Ctrl + seta: ~1 px da tela */
    fatorShift: 10,   /* Shift + seta: 10 x o passo da seta */
    minM: 0.001,      /* o menor passo: 1 mm */
    janelaMs: 600     /* toques seguidos na mesma direção dentro disto viram um passo de Ctrl+Z */
  };
  var TECLAS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1 };

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* o valor "redondo" da série mais perto (na escala logarítmica: 3 mm cai em 5 mm, 2 mm cai em 1 mm) */
  function redondo(m) {
    var s = CFG.SERIE, melhor = s[0], dm = Infinity;
    if (!(m > 0)) return s[0];
    for (var i = 0; i < s.length; i++) { var d = Math.abs(Math.log(s[i] / m)); if (d < dm) { dm = d; melhor = s[i]; } }
    return melhor;
  }
  /* m por pixel da tela → { base, fino, grande } em metros */
  function passos(mPorPx) {
    var mp = fin(mPorPx) && mPorPx > 0 ? mPorPx : 0.01;
    var base = redondo(mp * CFG.pxBase), fino = Math.min(base, Math.max(CFG.minM, redondo(mp * CFG.pxFino)));
    return { base: base, fino: fino, grande: r6(base * CFG.fatorShift) };
  }
  function num2(v) { var t = String(Math.round(v * 100) / 100); return t.replace(".", ","); }
  function fmtPasso(m) {
    if (m < 0.01 - 1e-9) return num2(m * 1000) + " mm";
    if (m < 1 - 1e-9) return num2(m * 100) + " cm";
    return num2(m) + " m";
  }
  function textoPassos(p) { return "Seta: " + fmtPasso(p.base) + " (Ctrl: " + fmtPasso(p.fino) + " · Shift: " + fmtPasso(p.grande) + ")"; }

  /* ---- direção ---- */
  function eixoMaisProximo(v) {
    if (!v || !fin(v.x) || !fin(v.z) || (Math.abs(v.x) < 1e-9 && Math.abs(v.z) < 1e-9)) return null;
    return Math.abs(v.x) >= Math.abs(v.z) ? { x: v.x < 0 ? -1 : 1, z: 0 } : { x: 0, z: v.z < 0 ? -1 : 1 };
  }
  var TELA = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };   /* x e y da TELA (y cresce para baixo) */
  /* ctx.vista: "3d" | "planta" | "corte". Devolve { x, y, z } com 0/±1 (unitário) ou { erro } */
  function direcao(ctx, tecla) {
    if (tecla === "PageUp") return { x: 0, y: 1, z: 0 };
    if (tecla === "PageDown") return { x: 0, y: -1, z: 0 };
    var s = TELA[tecla]; if (!s) return { erro: "Tecla sem direção." };
    if (ctx.vista === "3d") {
      var f = eixoMaisProximo(ctx.forward); if (!f) return { erro: "Não achei a direção da câmera." };
      var r = { x: -f.z, z: f.x };   /* a direita da câmera (y para cima): f = (0,-1) → (1,0) */
      var k = tecla === "ArrowUp" ? [1, 0] : tecla === "ArrowDown" ? [-1, 0] : tecla === "ArrowRight" ? [0, 1] : [0, -1];   /* [frente, direita] */
      return { x: f.x * k[0] + r.x * k[1], y: 0, z: f.z * k[0] + r.z * k[1] };
    }
    if (ctx.vista === "corte") {
      if (s[0] === 0) return { x: 0, y: s[1] < 0 ? 1 : -1, z: 0 };   /* ↑ sobe (a tela cresce para baixo) */
      var al = ctx.along && fin(ctx.along.x) && fin(ctx.along.z) ? eixoUnit(ctx.along) : null;
      if (!al) return { erro: "Nesta vista as setas ← → não têm o plano do corte: use ↑ ↓ ou a planta." };
      var sg = ctx.ctm && fin(ctx.ctm.a) && ctx.ctm.a < 0 ? -1 : 1;
      return { x: al.x * s[0] * sg, y: 0, z: al.z * s[0] * sg };
    }
    /* planta: tela → papel pela matriz do desenho (plano = M^-1 · tela) */
    var m = ctx.ctm || { a: 1, b: 0, c: 0, d: 1 }, det = m.a * m.d - m.b * m.c;
    if (!fin(det) || Math.abs(det) < 1e-12) return { erro: "Vista sem escala." };
    var px = (m.d * s[0] - m.c * s[1]) / det, pz = (-m.b * s[0] + m.a * s[1]) / det, q = eixoMaisProximo({ x: px, z: pz });
    return q ? { x: q.x, y: 0, z: q.z } : { erro: "Vista sem escala." };
  }
  function eixoUnit(v) { var L = Math.sqrt(v.x * v.x + v.z * v.z); return L > 1e-12 ? { x: v.x / L, z: v.z / L } : null; }

  /* ---- Ctrl+Z agrupado: o toque anterior na mesma direção, a tempo, é desfeito e a SOMA é gravada ---- */
  var ult = null;
  function reiniciar() { ult = null; }

  function chaveDe(tecla, uids, ev, ctx) {
    return [ctx.vista, tecla, ev.ctrlKey || ev.metaKey ? "c" : "", ev.shiftKey ? "s" : "", uids.slice().sort().join(",")].join("|");
  }

  function moverGrupos(G, d, amb) {
    var falhas = [], nada = false, movidos = 0, ids;
    var h = Math.abs(d.x) + Math.abs(d.z) > 1e-9, v = Math.abs(d.y) > 1e-9;
    if (G.editor.length) {
      ids = G.editor.concat(G.vao);
      if (h) { var r = amb.moverEditor(d.x, d.z); if (r && r.ok) movidos += ids.length; else falhas.push((r && r.erro) || "O editor recusou o mover."); }
      if (v && (!h || movidos)) { var e = amb.elevar(ids, d.y); if (e && e.ok) { if (!h) movidos += ids.length; } else falhas.push((e && e.erro) || "O editor recusou o subir/descer."); }
    } else if (G.vao.length) {
      if (h) G.vao.forEach(function (u) { var r2 = amb.moverVao(u, d.x, d.z); if (r2 && r2.ok && !r2.nada) movidos++; else if (r2 && r2.ok) nada = true; else falhas.push((r2 && r2.erro) || "A abertura não pôde andar."); });
      if (v) { var e2 = amb.elevar(G.vao, d.y); if (e2 && e2.ok) movidos += G.vao.length; else falhas.push((e2 && e2.erro) || "A abertura não pôde subir/descer."); }
    }
    if (G.inst.length) {
      var r3 = amb.moverInst(G.inst, d);
      if (r3 && r3.ok) movidos += G.inst.length; else falhas.push((r3 && r3.erro) || "O tubo não pôde andar.");
    }
    return { movidos: movidos, falhas: falhas, nada: nada };
  }

  /* A tecla. ev = { key, ctrlKey, shiftKey, altKey, metaKey }; devolve true se a tecla foi tratada (o ouvinte para o evento) */
  function executar(ev, amb) {
    var tecla = ev && ev.key; if (!TECLAS[tecla] || ev.altKey) return false;
    var uids = arr(amb.uids()); if (!uids.length) { reiniciar(); return false; }   /* sem seleção: a seta segue o que fazia */
    var ctx = amb.contexto(); if (!ctx || ctx.ocupado) return false;
    var G = { editor: [], vao: [], inst: [], outro: [] };
    uids.forEach(function (u) { var t = amb.tipo(u); (G[t] || G.outro).push(u); });
    var P = passos(ctx.mPorPx), pt = textoPassos(P);
    if (!G.editor.length && !G.vao.length && !G.inst.length) { amb.status(pt + " — esta peça não se move pelas setas (a peça do IFC importado não tem op de mover)."); return true; }
    var fix = uids.filter(function (u) { return amb.fixo(u); });
    if (fix.length) { reiniciar(); amb.status(pt + " — " + fix.length + " peça(s) fixada(s) não andam: use Desafixar antes."); return true; }
    var dir = direcao(ctx, tecla);
    if (dir.erro) { amb.status(pt + " — " + dir.erro); return true; }
    var passo = ev.ctrlKey || ev.metaKey ? P.fino : ev.shiftKey ? P.grande : P.base;
    var d = { x: r6(dir.x * passo), y: r6(dir.y * passo), z: r6(dir.z * passo) };
    var agora = amb.agora(), chave = chaveDe(tecla, uids, ev, ctx), h0 = amb.histTam();
    var agrupa = !!(ult && ult.chave === chave && agora - ult.t <= CFG.janelaMs && ult.h1 === h0 && h0 > ult.h0);
    var soma = agrupa ? { x: r6(ult.soma.x + d.x), y: r6(ult.soma.y + d.y), z: r6(ult.soma.z + d.z) } : d, hBase = agrupa ? ult.h0 : h0;
    if (agrupa) { while (amb.histTam() > hBase) { if (!amb.desfazer()) break; } }
    var res = moverGrupos(G, soma, amb);
    if (!res.movidos && agrupa && res.falhas.length) {   /* a soma não coube (limite da parede...): volta o que estava e fica */
      moverGrupos(G, ult.soma, amb);
      ult.t = agora; ult.h1 = amb.histTam();
      amb.status(pt + " — " + res.falhas[0]);
      return true;
    }
    if (!res.movidos) { reiniciar(); amb.status(pt + " — " + (res.falhas[0] || (res.nada ? "A porta/janela anda só ao longo da parede: use a seta na direção dela." : "Nada andou."))); return true; }
    ult = { chave: chave, t: agora, soma: soma, h0: hBase, h1: amb.histTam() };
    var tot = Math.sqrt(soma.x * soma.x + soma.y * soma.y + soma.z * soma.z);
    amb.status(pt + " — movido " + fmtPasso(tot < 0.01 ? Math.max(tot, CFG.minM) : tot) + (G.outro.length ? " (" + G.outro.length + " peça(s) da seleção não andam pelas setas)" : "") + (res.falhas.length ? " · " + res.falhas[0] : "") + " (Ctrl+Z desfaz).");
    return true;
  }

  /* ---------------------------------------------------------------- o ambiente do navegador */
  function B() { return global.BIM || null; }
  function estadoEd() { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; }
  function tela() { var d = global.document; return d && d.querySelector ? d.querySelector('.bim-tela[data-ativa="1"]') : null; }
  function vista2d() {
    var t = tela(), id = t ? t.getAttribute("data-vista") : null, D = global.Bim2D;
    return id && D && D.ehVista2d && D.ehVista2d(id) ? id : null;
  }
  var ambienteReal = {
    uids: function () { var b = B(), s = b && b.selecao ? b.selecao() : null; return (s && s.uids) || []; },
    agora: function () { return Date.now(); },
    histTam: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.ops : 0; },
    desfazer: function () { var b = B(); return !!(b && b.desfazer && b.desfazer()); },
    status: function (m) {
      try { if (global.BimShell && global.BimShell.status) { global.BimShell.status(m); return; } } catch (e) {}
      try { var b = B(); if (b && b.dica) b.dica(m); } catch (e2) {}
    },
    contexto: function () {
      var b = B(), c3 = b && b.setasCtx ? b.setasCtx() : null; if (!c3) return null;
      var SL = global.BimSelecao;
      var id = vista2d(), ctx = { ocupado: !!c3.ocupado, vista: "3d", mPorPx: c3.mPorPx, forward: c3.forward };
      if (id) {
        var D = global.Bim2D, c = D && D._cache ? D._cache[id] : null, sv = c && (c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null));
        var m = sv && sv.getScreenCTM ? sv.getScreenCTM() : null, def = D.def ? D.def(id) : null;
        if (!m || !(Math.abs(m.a) > 0)) return null;
        ctx.ctm = { a: m.a, b: m.b, c: m.c, d: m.d }; ctx.mPorPx = 1 / Math.abs(m.a);
        ctx.vista = def && def.tipo === "planta" ? "planta" : "corte";
        if (ctx.vista === "corte") {
          var ln = def && (def.corte || def.linha || (def.p6 && def.p6.linha)) || null;
          if (ln) {
            var A = ln.a || { x: ln.ax, z: ln.az }, Bp = ln.b || { x: ln.bx, z: ln.bz };
            if (A && Bp && fin(A.x) && fin(A.z) && fin(Bp.x) && fin(Bp.z)) ctx.along = { x: Bp.x - A.x, z: Bp.z - A.z };
          }
        }
        try { if (SL && SL.ferramenta2d && SL.ferramenta2d()) ctx.ocupado = true; } catch (eF) {}
      }
      return ctx;
    },
    tipo: function (u) {
      var b = B(); if (!/^edit:/.test(u)) return "outro";
      var V = global.BimVaoArr, I = global.BimInstArr, Pr = global.BimPrecisao, st = estadoEd();
      if (V && V.pode && V.pode(u)) return "vao";
      if (I && I.pode && I.pode(u)) return "inst";
      if (Pr && Pr.tipoNoEstado && st && Pr.tipoNoEstado(st, u.slice(5))) return "editor";
      return "outro";
    },
    fixo: function (u) {
      var Pr = global.BimPrecisao, st = estadoEd(); if (!/^edit:/.test(u) || !Pr || !Pr.fixado || !st) return false;
      return !!Pr.fixado(st, u.slice(5));
    },
    moverEditor: function (dx, dz) { var b = B(), p = b && b.precisao ? b.precisao() : null; if (!p || !p.mover) return { ok: false, erro: "Sem editor." }; return p.mover(dx, dz, null); },
    moverVao: function (u, dx, dz) { var V = global.BimVaoArr; return V && V.moverDelta ? V.moverDelta(u, dx, dz) : { ok: false, erro: "Sem o mover de abertura." }; },
    moverInst: function (uids, d) { var I = global.BimInstArr; return I && I.moverDelta ? I.moverDelta(uids, d) : { ok: false, erro: "Sem o mover de tubo." }; },
    elevar: function (ids, dy) {
      var b = B(); if (!b || !b.editarLote) return { ok: false, erro: "Sem editor." };
      var lim = ids.map(function (u) { return String(u).replace(/^edit:/, ""); });
      var ok = b.editarLote({ op: "lote", id: "seta" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), origem: "setas", pedido: "Subir/descer com as setas", ops: [{ op: "elevar", ids: lim, dy: r6(dy) }] });
      return ok ? { ok: true } : { ok: false, erro: "O editor recusou o subir/descer." };
    }
  };

  /* o ouvinte: quando o foco é de um campo, de um diálogo ou de um menu, a seta é dele */
  var DONOS = '[role="menu"],[role="listbox"],[role="tablist"],[role="slider"],[role="dialog"],[role="combobox"],dialog,[aria-modal="true"],.modal,.rv-doca-menu';
  function focoEhDeOutro(t) {
    if (!t) return false;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return true;
    try { if (t.closest && t.closest(DONOS)) return true; } catch (e) {}
    try { var s = global.BimSelInst; if (s && s.menuAberto && s.menuAberto()) return true; } catch (e2) {}
    return false;
  }
  function aoTeclar(e) {
    if (!TECLAS[e.key] || e.defaultPrevented || e.isComposing || e.altKey) return;
    if (focoEhDeOutro(e.target)) return;
    var t = tela(); if (t && !(t.getClientRects && t.getClientRects().length)) return;
    var usou = false;
    try { usou = executar(e, ambienteReal); } catch (err) { usou = false; try { if (global.console) console.warn("[bimsetas]", err); } catch (x) {} }
    if (usou) { e.preventDefault(); e.stopPropagation(); }
  }
  if (global.addEventListener && global.document) global.addEventListener("keydown", aoTeclar, true);

  var BimSetas = { CFG: CFG, redondo: redondo, passos: passos, fmtPasso: fmtPasso, textoPassos: textoPassos, direcao: direcao, eixoMaisProximo: eixoMaisProximo, executar: executar, reiniciar: reiniciar, ambienteReal: ambienteReal, _aoTeclar: aoTeclar };
  global.BimSetas = BimSetas;
  if (typeof module !== "undefined" && module.exports) module.exports = BimSetas;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

/* =====================================================================
 * bimmarcacorte.js — A MARCA DE CORTE como objeto na planta (18/10/2026)
 *
 * Pedido do Rogério: "um clique na linha de corte já abre a vista: isso não
 * pode acontecer". Agora, em qualquer vista 2D onde a marca aparece:
 *   · UM clique SELECIONA a marca (corte A, B…, corte das vistas novas,
 *     elevação e chamada de detalhe) — não abre nada;
 *   · DUPLO clique abre a vista; botão direito › "Ir para a vista";
 *   · selecionada: arrastar a linha MOVE (paralela); as alças das PONTAS
 *     alongam/encurtam; a alça da PROFUNDIDADE muda o fim da vista
 *     (arrastar para trás de tudo = "sem limite"); o ícone ⇅ INVERTE o
 *     olhar; a alça ↻ GIRA (de 15 em 15°, Shift solta) e Espaço gira 90°;
 *     o ângulo, o comprimento e a profundidade também se digitam em
 *     Propriedades. A chamada de detalhe move e estica pelos cantos.
 *   · mover/girar/inverter refaz a vista do corte na hora em que solta.
 *   · corte com degrau (segmentar): ainda NÃO — sem botão (regra de 09/10:
 *     nenhum botão sem função); está na lista "Em desenvolvimento" da tela
 *     de Atalhos (js/bimfita.js EM_DESENVOLVIMENTO).
 *
 * ⚠ SÓ COM A PRÉVIA `?previa=hidro` (P8 da junção, 18/10/2026): sem ela os
 *   ouvintes daqui não fazem nada e a marca é a do master 0a2e06d2 (um
 *   clique na marca abre a vista — js/bim2dui.js). Prova:
 *   tools/e2e-hid-previa.js [4].
 *
 * Espaço: gira o que estiver SELECIONADO — se é a marca, gira a marca e o
 * evento para aqui; com uma peça selecionada (sem marca), segue para quem
 * coloca/gira peças.
 *
 * Quem guarda: os cortes A, B… em js/bim2dui.js (estado().cortes); a
 * elevação, o corte e a chamada das vistas novas em js/bimmodelovista.js
 * (estado().vistas[id].linha / .ret). Aqui só a interação e o desenho das
 * alças (grupo `g.mc-sel`, por cima do SVG; refeito pelo gancho
 * Bim2D.redesenhar → BimMarcaCorte.aposDesenhar).
 * Prova: tools/e2e-bim-marca-corte.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function D() { return global.Bim2D || null; }
  function M6() { var M = global.BimModeloVista; return M && M.estado ? M : null; }
  function doc() { return global.document || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function num(v, pad) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : pad; }
  function fmt(v, c) { return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  var NS = "http://www.w3.org/2000/svg";
  var GRAU = Math.PI / 180;

  var MC = {
    ligado: true,      /* ⚠ só o e2e desliga (controle negativo: sem isto, um clique abre a vista) */
    /* ligado E com a prévia hidro (P8): sem a prévia, o clique na marca é o do master */
    _on: function () {
      if (!this.ligado) return false;
      try { return !!(global.BimPrevia && global.BimPrevia.hidro && global.BimPrevia.hidro()); } catch (e) { return false; }
    },
    _sel: null,        /* { k: "corte"|"p6", id, vista } */
    _arr: null,        /* arrasto em andamento */

    /* ---------------------------------------------------- o objeto da marca */
    obj: function (sel) {
      sel = sel || this._sel; if (!sel) return null;
      var Bd = D(); if (!Bd) return null;
      if (sel.k === "corte") {
        var c = Bd.estado().cortes.filter(function (x) { return x.id === sel.id; })[0];
        if (!c) return null;
        return { tipo: "linha", L: c, nome: "Corte " + c.letra, vistaId: Bd.idCorte(c.id), salvar: function () { Bd._gravar(); }, raw: c };
      }
      var M = M6(), v = M ? M.estado().vistas[sel.id] : null;
      if (!v) return null;
      if (v.tipo === "chamada" && v.ret) return { tipo: "ret", R: v.ret, nome: v.nome || "Detalhe", vistaId: sel.id, salvar: function () { M.gravar(); }, raw: v };
      if (v.linha) return { tipo: "linha", L: v.linha, ponto: v.ponto || null, nome: v.nome || "Vista", vistaId: sel.id, salvar: function () { M.gravar(); }, raw: v, elevacao: v.tipo === "elevacao" };
      return null;
    },
    _olhar: function (L) { var dx = L.bx - L.ax, dz = L.bz - L.az, n = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / n, nz = -dx / n; return L.inv ? [-nx, -nz] : [nx, nz]; },
    _centro: function (o) { return o.ponto ? [o.ponto.x, o.ponto.z] : [(o.L.ax + o.L.bx) / 2, (o.L.az + o.L.bz) / 2]; },
    angulo: function (o) { o = o || this.obj(); if (!o || o.tipo !== "linha") return null; var a = Math.atan2(o.L.bz - o.L.az, o.L.bx - o.L.ax) / GRAU; return ((a % 360) + 360) % 360; },
    comprimento: function (o) { o = o || this.obj(); if (!o || o.tipo !== "linha") return null; return Math.sqrt((o.L.bx - o.L.ax) * (o.L.bx - o.L.ax) + (o.L.bz - o.L.az) * (o.L.bz - o.L.az)); },

    /* ------------------------------------------------------- as mudanças */
    /* gira em volta do centro (o ponto da elevação, ou o meio da linha) até o ângulo `graus` */
    girarPara: function (graus, o) {
      o = o || this.obj(); if (!o || o.tipo !== "linha") return false;
      var c = this._centro(o), L = o.L, ma = [(L.ax + L.bx) / 2, (L.az + L.bz) / 2], h = this.comprimento(o) / 2, t = graus * GRAU, u = [Math.cos(t), Math.sin(t)];
      /* o meio da linha gira em volta do centro também (na elevação o símbolo fica fora da linha) */
      var a0 = Math.atan2(L.bz - L.az, L.bx - L.ax), da = t - a0, mx = ma[0] - c[0], mz = ma[1] - c[1];
      var m2 = [c[0] + mx * Math.cos(da) - mz * Math.sin(da), c[1] + mx * Math.sin(da) + mz * Math.cos(da)];
      L.ax = m2[0] - u[0] * h; L.az = m2[1] - u[1] * h; L.bx = m2[0] + u[0] * h; L.bz = m2[1] + u[1] * h;
      return true;
    },
    girar90: function () {
      var o = this.obj(); if (!o || o.tipo !== "linha") return false;
      this.girarPara(this.angulo(o) + 90, o);
      this.aplicar(o, "Marca girada 90° (" + fmt(this.angulo(o), 0) + "°); a vista foi refeita.");
      return true;
    },
    inverter: function () {
      var o = this.obj(); if (!o || o.tipo !== "linha") return false;
      o.L.inv = !o.L.inv;
      this.aplicar(o, "Olhar invertido; a vista foi refeita.");
      return true;
    },
    /* grava, redesenha as vistas (a do corte é EXTRAÍDA de novo, sem perder o zoom) e volta as alças */
    aplicar: function (o, msg) {
      var Bd = D(); o = o || this.obj(); if (!o || !Bd) return false;
      try { o.salvar(); } catch (e) {}
      Object.keys(Bd._cache).forEach(function (k) {
        var dd = Bd.def(k); if (!dd || dd.tipo === "desenho") return;
        if (k === o.vistaId) Bd.atualizar(k); else Bd.redesenhar(k, false);
      });
      try { Bd._avisarMudou(); } catch (e2) {}
      this._pintarProps();
      if (msg) status(msg);
      return true;
    },

    /* ------------------------------------------------- seleção e desenho */
    selecionar: function (k, id, vista) {
      this._sel = k ? { k: k, id: id, vista: vista } : null;
      var Bd = D(); if (!Bd) return;
      Object.keys(Bd._cache).forEach(function (v) { MC.aposDesenhar(v); });
      if (this._sel) {
        var o = this.obj();
        status((o ? o.nome : "Marca") + " selecionada: arraste para mover, alças nas pontas, ⇅ inverte, ↻ ou Espaço gira; duplo clique abre a vista.");
        this._pintarProps();
      } else {
        try { var S = global.BimShell; if (S && S._estado && S._estado.props && S._estado.props.daMarca) S.pintarProps(null); } catch (e) {}
      }
    },
    aposDesenhar: function (vistaId) {
      var Bd = D(), c = Bd && Bd._cache[vistaId]; if (!c || !c.svg) return;
      var g = c.svg.querySelector("g.mc-sel");
      if (g) g.parentNode.removeChild(g);
      var s = this._sel; if (!s || s.vista !== vistaId) return;
      var o = this.obj(); if (!o) { this._sel = null; return; }
      var d = doc(), M = c.svg.getScreenCTM(), k = M ? 1 / Math.max(1e-9, Math.sqrt(M.a * M.a + M.b * M.b)) : 0.01;
      g = d.createElementNS(NS, "g"); g.setAttribute("class", "mc-sel"); c.svg.appendChild(g);
      var el = function (tag, at, txt) { var e = d.createElementNS(NS, tag); for (var n in at) if (at.hasOwnProperty(n)) e.setAttribute(n, at[n]); if (txt) e.textContent = txt; g.appendChild(e); return e; };
      var AZ = "#1a6cb5";
      if (o.tipo === "ret") {
        var R = o.R, x0 = Math.min(R.x0, R.x1), y0 = Math.min(R.y0, R.y1), x1 = Math.max(R.x0, R.x1), y1 = Math.max(R.y0, R.y1);
        el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: "rgba(26,108,181,0.06)", stroke: AZ, "stroke-width": 2 * k, "data-mc-alca": "mover", style: "cursor:move" });
        [[x0, y0, "c00"], [x1, y0, "c10"], [x0, y1, "c01"], [x1, y1, "c11"]].forEach(function (q) {
          el("rect", { x: q[0] - 4 * k, y: q[1] - 4 * k, width: 8 * k, height: 8 * k, fill: "#fff", stroke: AZ, "stroke-width": 1.5 * k, "data-mc-alca": q[2], style: "cursor:nwse-resize" });
        });
        return;
      }
      var L = o.L, a = [L.ax, L.az], b = [L.bx, L.bz], Lc = this.comprimento(o) || 1, u = [(b[0] - a[0]) / Lc, (b[1] - a[1]) / Lc], n = this._olhar(L);
      var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], D0 = L.prof > 0 ? L.prof : Math.min(Math.max(Lc, 2), 8);
      /* faixa da profundidade (o que a vista enxerga) */
      var p1 = [a[0] + n[0] * D0, a[1] + n[1] * D0], p2 = [b[0] + n[0] * D0, b[1] + n[1] * D0];
      el("path", { d: "M" + a[0] + " " + a[1] + "L" + b[0] + " " + b[1] + "L" + p2[0] + " " + p2[1] + "L" + p1[0] + " " + p1[1] + "Z", fill: "rgba(26,108,181,0.07)", stroke: AZ, "stroke-width": 1 * k, "stroke-dasharray": (5 * k) + " " + (3 * k), "pointer-events": "none" });
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "rgba(26,108,181,0.35)", "stroke-width": 10 * k, "stroke-linecap": "round", "data-mc-alca": "mover", style: "cursor:move" });
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: AZ, "stroke-width": 2 * k, "pointer-events": "none" });
      [[a, "a"], [b, "b"]].forEach(function (q) { el("circle", { cx: q[0][0], cy: q[0][1], r: 5 * k, fill: "#fff", stroke: AZ, "stroke-width": 2 * k, "data-mc-alca": q[1], style: "cursor:ew-resize" }); });
      var pp = [m[0] + n[0] * D0, m[1] + n[1] * D0];
      el("rect", { x: pp[0] - 5 * k, y: pp[1] - 5 * k, width: 10 * k, height: 10 * k, fill: "#fff", stroke: AZ, "stroke-width": 2 * k, "data-mc-alca": "prof", style: "cursor:ns-resize" });
      el("text", { x: pp[0] + 8 * k, y: pp[1] + 4 * k, "font-size": 11 * k, fill: AZ, "pointer-events": "none" }, L.prof > 0 ? "prof. " + fmt(L.prof, 2) + " m" : "prof. sem limite");
      /* a ↻ fica perto do meio, do lado de trás (além da ponta ela sai da tela quando a marca é comprida) */
      var dg = Math.min(Lc / 2, 70 * k), gz = [m[0] + u[0] * dg - n[0] * 18 * k, m[1] + u[1] * dg - n[1] * 18 * k];
      el("circle", { cx: gz[0], cy: gz[1], r: 8 * k, fill: "#fff", stroke: AZ, "stroke-width": 1.5 * k, "data-mc-alca": "girar", style: "cursor:grab" });
      el("text", { x: gz[0], y: gz[1] + 4 * k, "font-size": 12 * k, "text-anchor": "middle", fill: AZ, "pointer-events": "none" }, "↻");
      var iv = [m[0] - n[0] * 18 * k, m[1] - n[1] * 18 * k];
      el("circle", { cx: iv[0], cy: iv[1], r: 8 * k, fill: "#fff", stroke: AZ, "stroke-width": 1.5 * k, "data-mc-alca": "inverter", style: "cursor:pointer" });
      el("text", { x: iv[0], y: iv[1] + 4 * k, "font-size": 12 * k, "text-anchor": "middle", fill: AZ, "pointer-events": "none" }, "⇅");
    },
    _pintarProps: function () {
      var S = global.BimShell, o = this.obj(), self = this; if (!S || !S.pintarProps || !o) return;
      var Bd = D(), sec = [];
      if (o.tipo === "linha") sec.push({ nome: "Marca", params: [
        { id: "mc:ang", rotulo: "Ângulo", unidade: "°", tipo: "numero", passo: 1, valor: Math.round(this.angulo(o) * 10) / 10 },
        { id: "mc:L", rotulo: "Comprimento", unidade: "m", tipo: "numero", passo: 0.1, valor: Math.round(this.comprimento(o) * 1000) / 1000 },
        { id: "mc:prof", rotulo: "Profundidade (0 = sem limite)", unidade: "m", tipo: "numero", passo: 0.5, valor: o.L.prof || 0 },
        { id: "mc:inv", rotulo: "Olhar para o outro lado", tipo: "sim-nao", valor: !!o.L.inv }
      ] });
      sec.push({ nome: "Vista", params: [
        { id: "mc:ir", rotulo: "Vista", tipo: "botao", rotuloBotao: "Ir para a vista", fn: function () { self.irParaVista(); } }
      ] });
      S.pintarProps({ daMarca: true, semEditarTipo: true, titulo: o.nome, icone: "corte", secoes: sec,
        onMudar: function (pid, valor) {
          var oo = self.obj(); if (!oo || oo.tipo !== "linha") return null;
          if (pid === "mc:ang") self.girarPara(num(valor, self.angulo(oo)), oo);
          else if (pid === "mc:L") { var h = Math.max(0.3, num(valor, self.comprimento(oo))) / 2, mm = [(oo.L.ax + oo.L.bx) / 2, (oo.L.az + oo.L.bz) / 2], t = self.angulo(oo) * GRAU; oo.L.ax = mm[0] - Math.cos(t) * h; oo.L.az = mm[1] - Math.sin(t) * h; oo.L.bx = mm[0] + Math.cos(t) * h; oo.L.bz = mm[1] + Math.sin(t) * h; }
          else if (pid === "mc:prof") oo.L.prof = Math.max(0, num(valor, 0));
          else if (pid === "mc:inv") oo.L.inv = !!valor && valor !== "false";
          else return null;
          self.aplicar(oo, "Marca alterada; a vista foi refeita.");
          return null;
        } });
    },
    /* JUNÇÃO 18/10/2026: ao abrir a vista, a marca (que é da planta) deixa de estar selecionada — senão o Propriedades da
       vista aberta continuava mostrando a marca (sem a Espessura das linhas da vista; e2e-bim-desenho2d [d]) */
    irParaVista: function () { var o = this.obj(), Bd = D(); if (!o || !Bd) return false; var vid = o.vistaId; this.selecionar(null); Bd.abrir(vid); return true; },

    /* ----------------------------------------------------------- eventos */
    _vistaDe: function (el) {
      var Bd = D(); if (!Bd || !el) return null;
      var ks = Object.keys(Bd._cache);
      for (var i = 0; i < ks.length; i++) { var c = Bd._cache[ks[i]]; if (c && c.el && c.el.contains(el)) return ks[i]; }
      return null;
    },
    _marca: function (t) {
      if (!t || !t.closest) return null;
      var m = t.closest("[data-d2-corte],[data-d2-vista]"); if (!m || !m.closest(".d2-vista-tela")) return null;
      return m.hasAttribute("data-d2-corte") ? { k: "corte", id: m.getAttribute("data-d2-corte") } : { k: "p6", id: m.getAttribute("data-d2-vista") };
    },
    /* uma ferramenta armada na vista 2D fica com o clique (traçar corte, cota, parede, chamada, medir…) */
    _ocupado: function () {
      try {
        var Bd = D(); if (Bd && Bd._pick) return true;
        if (global.BimAnot2DUI && global.BimAnot2DUI._f) return true;
        if (global.BimPlantaModelar && global.BimPlantaModelar.ocupado && global.BimPlantaModelar.ocupado()) return true;
        if (global.BimModeloVista && global.BimModeloVista._pick) return true;
        if (global.BimFita && global.BimFita._m2) return true;
      } catch (e) {}
      return false;
    },
    _pt: function (vista, ev) { var Bd = D(); return Bd ? Bd._ptSvg(vista, ev) : null; },
    _parar: function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); },
    _down: function (ev) {
      if (!this._on() || ev.button !== 0) return;
      var t = ev.target, alca = t && t.closest ? t.closest("[data-mc-alca]") : null;
      if (alca && this._sel) {
        this._parar(ev);
        var tipo = alca.getAttribute("data-mc-alca");
        if (tipo === "inverter") { this.inverter(); return; }
        this._iniciar(tipo, ev);
        return;
      }
      var mk = this._marca(t);
      if (mk && !this._ocupado()) {
        var vista = this._vistaDe(t); if (!vista) return;
        this._parar(ev);
        if (!this._sel || this._sel.id !== mk.id || this._sel.vista !== vista) this.selecionar(mk.k, mk.id, vista);
        this._iniciar("mover", ev);
        return;
      }
      /* clique em outro lugar de uma vista 2D: a marca sai da seleção (o clique segue para quem for) */
      if (this._sel && t && t.closest && t.closest(".d2-vista-tela")) this.selecionar(null);
    },
    _iniciar: function (tipo, ev) {
      var o = this.obj(); if (!o) return;
      var p = this._pt(this._sel.vista, ev); if (!p) return;
      this._arr = { tipo: tipo, p0: p, x0: ev.clientX, y0: ev.clientY, moveu: false, L0: o.L ? JSON.parse(JSON.stringify(o.L)) : null, R0: o.R ? JSON.parse(JSON.stringify(o.R)) : null, ponto0: o.ponto ? { x: o.ponto.x, z: o.ponto.z } : null };
    },
    _move: function (ev) {
      var A = this._arr; if (!A || !this._sel) return;
      if (!A.moveu && Math.abs(ev.clientX - A.x0) + Math.abs(ev.clientY - A.y0) < 3) return;
      A.moveu = true; this._parar(ev);
      var o = this.obj(), p = this._pt(this._sel.vista, ev); if (!o || !p) return;
      var dx = p[0] - A.p0[0], dz = p[1] - A.p0[1], L0 = A.L0, R0 = A.R0;
      if (o.tipo === "ret") {
        var R = o.R;
        if (A.tipo === "mover") { R.x0 = R0.x0 + dx; R.x1 = R0.x1 + dx; R.y0 = R0.y0 + dz; R.y1 = R0.y1 + dz; }
        else if (/^c[01][01]$/.test(A.tipo)) {
          var xs = [Math.min(R0.x0, R0.x1), Math.max(R0.x0, R0.x1)], ys = [Math.min(R0.y0, R0.y1), Math.max(R0.y0, R0.y1)], ix = +A.tipo[1], iy = +A.tipo[2];
          xs[ix] = p[0]; ys[iy] = p[1]; R.x0 = Math.min(xs[0], xs[1]); R.x1 = Math.max(xs[0], xs[1]); R.y0 = Math.min(ys[0], ys[1]); R.y1 = Math.max(ys[0], ys[1]);
        }
      } else {
        var L = o.L, Lc = Math.sqrt((L0.bx - L0.ax) * (L0.bx - L0.ax) + (L0.bz - L0.az) * (L0.bz - L0.az)) || 1, u = [(L0.bx - L0.ax) / Lc, (L0.bz - L0.az) / Lc];
        if (A.tipo === "mover") {
          L.ax = L0.ax + dx; L.az = L0.az + dz; L.bx = L0.bx + dx; L.bz = L0.bz + dz;
          if (o.ponto && A.ponto0) { o.ponto.x = A.ponto0.x + dx; o.ponto.z = A.ponto0.z + dz; }
        } else if (A.tipo === "a" || A.tipo === "b") {
          /* ao longo da própria linha: alonga/encurta sem girar (mínimo 0,30 m) */
          var fixo = A.tipo === "a" ? [L0.bx, L0.bz] : [L0.ax, L0.az], sinal = A.tipo === "a" ? -1 : 1;
          var s = Math.max(0.3, ((p[0] - fixo[0]) * u[0] + (p[1] - fixo[1]) * u[1]) * sinal);
          if (A.tipo === "a") { L.ax = fixo[0] - u[0] * s; L.az = fixo[1] - u[1] * s; } else { L.bx = fixo[0] + u[0] * s; L.bz = fixo[1] + u[1] * s; }
        } else if (A.tipo === "prof") {
          var n = this._olhar(L0), mm = [(L0.ax + L0.bx) / 2, (L0.az + L0.bz) / 2], dd = (p[0] - mm[0]) * n[0] + (p[1] - mm[1]) * n[1];
          L.prof = dd < 0.3 ? 0.3 : Math.round(dd * 100) / 100;
        } else if (A.tipo === "girar") {
          var c = o.ponto && A.ponto0 ? [A.ponto0.x, A.ponto0.z] : [(L0.ax + L0.bx) / 2, (L0.az + L0.bz) / 2];
          var ang = Math.atan2(p[1] - c[1], p[0] - c[0]) / GRAU;
          if (!ev.shiftKey) ang = Math.round(ang / 15) * 15;
          L.ax = L0.ax; L.az = L0.az; L.bx = L0.bx; L.bz = L0.bz;
          this.girarPara(ang, o);
        }
      }
      /* só a vista onde se arrasta é redesenhada durante o arrasto; a do corte, ao soltar */
      var self = this, vista = this._sel.vista;
      if (!this._raf) this._raf = (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { self._raf = null; var Bd = D(); if (Bd) Bd.redesenhar(vista, false); });
    },
    _up: function (ev) {
      var A = this._arr; if (!A) return;
      this._arr = null; this._parar(ev);
      if (!A.moveu) return;
      var o = this.obj(); if (!o) return;
      var msg = { mover: "Marca movida", a: "Marca alongada/encurtada", b: "Marca alongada/encurtada", prof: "Profundidade da vista alterada", girar: "Marca girada (" + fmt(this.angulo(o) || 0, 0) + "°)" }[A.tipo] || "Marca alterada";
      this.aplicar(o, msg + "; a vista foi refeita.");
    },
    _dbl: function (ev) {
      if (!this._on()) return;
      /* o duplo clique no realce/alças da marca já selecionada também abre */
      if (this._sel && ev.target && ev.target.closest && ev.target.closest(".mc-sel")) { this._parar(ev); this.irParaVista(); return; }
      var mk = this._marca(ev.target); if (!mk || this._ocupado()) return;
      var vista = this._vistaDe(ev.target); if (!vista) return;
      this._parar(ev);
      this.selecionar(mk.k, mk.id, vista);
      this.irParaVista();
    },
    _ctx: function (ev) {
      if (!this._on()) return;
      var mk = this._marca(ev.target); if (!mk) return;
      var vista = this._vistaDe(ev.target); if (!vista) return;
      this._parar(ev);
      this.selecionar(mk.k, mk.id, vista);
      var self = this, o = this.obj(), F = global.BimFita;
      var itens = [{ tit: o ? o.nome : "Marca" }, { id: "mc-ir", rot: "Ir para a vista", fn: function () { self.irParaVista(); } }];
      if (o && o.tipo === "linha") itens.push({ id: "mc-inv", rot: "Inverter o olhar", fn: function () { self.inverter(); } }, { id: "mc-girar", rot: "Girar 90°", dir: "Espaço", fn: function () { self.girar90(); } });
      var x = ev.clientX, y = ev.clientY;
      if (F && F._abrirMenu) F._abrirMenu({ getBoundingClientRect: function () { return { left: x, top: y, bottom: y, right: x }; }, contains: function () { return false; } }, itens, "marca");
    },
    _tecla: function (ev) {
      if (!this._sel || !this._on()) return;
      var t = ev.target || {};
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
      if (ev.key === " " || ev.code === "Space") { if (this.obj() && this.obj().tipo === "linha") { this._parar(ev); this.girar90(); } return; }
      if (ev.key === "Escape") this.selecionar(null);
    },
    instalar: function () {
      var d = doc(); if (!d || this._instalado) return;
      this._instalado = true;
      var self = this;
      d.addEventListener("pointerdown", function (ev) { self._down(ev); }, true);
      d.addEventListener("pointermove", function (ev) { self._move(ev); }, true);
      d.addEventListener("pointerup", function (ev) { self._up(ev); }, true);
      d.addEventListener("dblclick", function (ev) { self._dbl(ev); }, true);
      d.addEventListener("contextmenu", function (ev) { self._ctx(ev); }, true);
      d.addEventListener("keydown", function (ev) { self._tecla(ev); }, true);
    }
  };

  if (typeof document !== "undefined") MC.instalar();
  global.BimMarcaCorte = MC;
  if (typeof module !== "undefined" && module.exports) module.exports = MC;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

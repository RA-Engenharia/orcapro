/* =====================================================================
 * bim2dui.js — as VISTAS 2D do BIM: plantas por nível e cortes A, B, C…
 * (07/10/2026, pedido do Rogério: "planta baixa igual ao Revit, em linha,
 * com linha fina ou grossa; cortes A, B, C, D na lateral; cota com estilo,
 * com opção de tirar").
 *
 * Quem faz o quê:
 *   BIM.vista2d (js/bim.js) ... extrai o desenho do modelo (corte exato +
 *                               arestas visíveis), em vetor;
 *   Desenho2D (js/desenho2d.js) penas, cotas, marcas e o SVG (motor puro);
 *   este arquivo .............. a TELA: abre a vista numa aba, zoom/arrasto,
 *                               traçar corte com dois cliques na planta, as
 *                               Propriedades da vista e o que fica gravado.
 * O que fica gravado é POR OBRA (ou por modelo, sem obra), na chave
 * `orcapro:bim:desenho2d:<obra>`: os cortes (pontos, lado, profundidade) e o
 * estilo de cada vista. Só parâmetros — o desenho é refeito do modelo.
 * ===================================================================== */
(function (global) {
  "use strict";

  function D2() { return global.Desenho2D; }
  function B() { return global.BIM; }
  function toast(t, tipo) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, pad) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : pad; }

  var Bim2D = {
    _cfg: { obraKey: "geral", niveis: null },
    _cache: {},          /* id → { dados, tela, vb, el } */
    _pick: null,         /* traçando corte: { id (planta), pts:[] } */

    /* ---------------------------------------------------------- estado */
    configurar: function (cfg) {
      cfg = cfg || {};
      var mudou = cfg.obraKey && cfg.obraKey !== this._cfg.obraKey;
      if (cfg.obraKey) this._cfg.obraKey = String(cfg.obraKey);
      if (typeof cfg.niveis === "function") this._cfg.niveis = cfg.niveis;
      if (typeof cfg.abrir === "function") this._cfg.abrir = cfg.abrir;
      if (typeof cfg.aoMudar === "function") this._cfg.aoMudar = cfg.aoMudar;
      if (typeof cfg.fechar === "function") this._cfg.fechar = cfg.fechar;
      if (typeof cfg.vincular === "function") this._cfg.vincular = cfg.vincular;
      if (mudou) { this._cache = {}; this._est = null; this._cadMem = {}; }
    },
    _chave: function () { return "orcapro:bim:desenho2d:" + this._cfg.obraKey; },
    estado: function () {
      if (this._est) return this._est;
      var e = null;
      try { e = JSON.parse(localStorage.getItem(this._chave()) || "null"); } catch (x) { e = null; }
      if (!e || typeof e !== "object") e = {};
      if (!Array.isArray(e.cortes)) e.cortes = [];
      if (!e.estilos || typeof e.estilos !== "object") e.estilos = {};
      if (!e.plantas || typeof e.plantas !== "object") e.plantas = {};
      this._est = e;
      return e;
    },
    _gravar: function () { try { localStorage.setItem(this._chave(), JSON.stringify(this.estado())); } catch (x) { toast("Não consegui guardar as vistas 2D neste aparelho (armazenamento cheio).", "erro"); } },
    _avisarMudou: function () { try { if (this._cfg.aoMudar) this._cfg.aoMudar(); } catch (e) {} },

    /* níveis das plantas: [{ id, nome, y }] (y = cota de MUNDO do piso) */
    niveis: function () {
      var L = [];
      try { if (this._cfg.niveis) L = this._cfg.niveis() || []; } catch (e) { L = []; }
      if (!L.length) {
        var p = B() && B().pavimentos2d ? B().pavimentos2d() : { pav: [] };
        L = (p.pav || []).map(function (x, i) { return { id: "pav" + i, nome: x.nome, y: x.y }; });
        if (!L.length && p.caixa) L = [{ id: "modelo", nome: "Térreo", y: p.caixa.min[1] }];
      }
      return L;
    },
    cortes: function () { return this.estado().cortes.slice(); },
    idPlanta: function (nivelId) { return "d2p-" + String(nivelId).replace(/[^\w-]/g, "_"); },
    idCorte: function (cid) { return "d2c-" + cid; },
    ehVista2d: function (id) { return /^d2[pc]-/.test(String(id || "")); },
    def: function (id) {
      var self = this;
      if (/^d2p-/.test(id)) {
        var nv = null; this.niveis().forEach(function (n) { if (self.idPlanta(n.id) === id) nv = n; });
        if (!nv) return null;
        var pp = this.estado().plantas[nv.id] || {};
        return { id: id, tipo: "planta", nome: "Planta baixa — " + nv.nome, nivel: nv, altura: num(pp.altura, 1.2), abaixo: num(pp.abaixo, 0.05) };
      }
      if (/^d2c-/.test(id)) {
        var c = null; this.estado().cortes.forEach(function (x) { if (self.idCorte(x.id) === id) c = x; });
        if (!c) return null;
        return { id: id, tipo: "corte", nome: "Corte " + c.letra, corte: c };
      }
      return null;
    },
    estilo: function (id) {
      var e = this.estado().estilos[id];
      if (!e) {
        /* o template (.optpl) traz o estilo padrão de planta e de corte */
        var pd = (this.estado().padrao || {})[/^d2p-/.test(id) ? "planta" : "corte"];
        e = pd ? D2().normEstilo(clone(pd)) : D2().estiloPadrao();
        var c = this._cache[id];
        if (c && c.dados) { var cx = D2().caixa(c.dados); if (cx) e.escala = D2().escalaQueCabe(cx.x1 - cx.x0, cx.y1 - cx.y0); }
        this.estado().estilos[id] = e;
      }
      return D2().normEstilo(e);
    },

    /* ----------------------------------------------------------- dados */
    _extrair: function (d) {
      var b = B(); if (!b || !b.vista2d) return { ok: false, erro: "O visualizador 3D ainda não abriu." };
      if (d.tipo === "planta") return b.vista2d({ tipo: "planta", yCorte: d.nivel.y + d.altura, yFundo: d.nivel.y - d.abaixo });
      var c = d.corte;
      return b.vista2d({ tipo: "corte", ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, inv: !!c.inv, prof: c.prof > 0 ? c.prof : null });
    },
    /* o que o desenho leva além do modelo: marcas de corte (planta) e níveis (corte) */
    _anotar: function (d, dados) {
      var self = this, out = { tipo: dados.tipo, cortes: dados.cortes, linhas: dados.linhas };
      if (d.tipo === "planta") {
        out.cad = this._cadDesenho(d.nivel.id);
        out.marcas = this.estado().cortes.map(function (c) {
          var dx = c.bx - c.ax, dz = c.bz - c.az, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / L, nz = -dx / L;
          if (c.inv) { nx = -nx; nz = -nz; }
          return { id: c.id, letra: c.letra, a: [c.ax, c.az], b: [c.bx, c.bz], olhar: [nx, nz] };
        });
      } else {
        out.niveis = this.niveis().map(function (n) { return { nome: n.nome, y: -n.y, cota: n.y }; });
      }
      return out;
    },

    /* ------------------------------------------------------------ tela */
    montar: function (tela, id) {
      var d = this.def(id); if (!tela || !d) return false;
      var c = this._cache[id] || (this._cache[id] = {});
      c.tela = tela;
      var v = tela.querySelector(".d2-vista-tela");
      if (!v) { v = document.createElement("div"); v.className = "d2-vista-tela"; tela.appendChild(v); }
      c.el = v;
      this._ligarInteracao(v, id);
      return this.redesenhar(id, !c.dados);
    },
    desmontar: function (id) { delete this._cache[id]; if (this._pick && this._pick.id === id) this._pick = null; },
    /* refaz o SVG (e, com `recalcular`, extrai de novo do modelo) */
    redesenhar: function (id, recalcular) {
      var d = this.def(id), c = this._cache[id]; if (!d || !c || !c.el) return false;
      if (recalcular || !c.dados) {
        var r = this._extrair(d);
        if (!r || !r.ok) { c.el.innerHTML = '<div class="d2-vazio">' + ((r && r.erro) || "Não consegui gerar o desenho.") + "</div>"; c.dados = null; return false; }
        c.dados = r; c.info = r.info;
      }
      var res = D2().svg(this._anotar(d, c.dados), this.estilo(id), { titulo: d.nome });
      var vbAnt = c.vb;
      c.el.innerHTML = res.svg;
      c.svg = c.el.querySelector("svg");
      c.vbTotal = res.vb;
      if (vbAnt && !recalcular) this._aplicarVb(id, vbAnt); else this._aplicarVb(id, res.vb);
      if (this._pick && this._pick.id === id) c.el.setAttribute("data-d2-pick", "1");
      return true;
    },
    _aplicarVb: function (id, vb) {
      var c = this._cache[id]; if (!c || !c.svg) return;
      c.vb = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
      c.svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    },
    ajustar: function (id) { var c = this._cache[id]; if (c && c.vbTotal) this._aplicarVb(id, c.vbTotal); },
    _ptSvg: function (id, ev) {
      var c = this._cache[id]; if (!c || !c.svg || !c.svg.getScreenCTM) return null;
      var m = c.svg.getScreenCTM(); if (!m) return null;
      var p = c.svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      var q = p.matrixTransform(m.inverse());
      return [q.x, q.y];
    },
    _ligarInteracao: function (v, id) {
      if (v._d2Ligado) return; v._d2Ligado = true;
      var self = this, arr = null;
      v.addEventListener("wheel", function (ev) {
        var c = self._cache[id]; if (!c || !c.vb) return;
        ev.preventDefault();
        var p = self._ptSvg(id, ev); if (!p) return;
        var f = ev.deltaY > 0 ? 1.18 : 1 / 1.18, vb = c.vb;
        self._aplicarVb(id, { x: p[0] - (p[0] - vb.x) * f, y: p[1] - (p[1] - vb.y) * f, w: vb.w * f, h: vb.h * f });
      }, { passive: false });
      v.addEventListener("pointerdown", function (ev) {
        var c = self._cache[id]; if (!c || !c.vb) return;
        if (self._pick && self._pick.id === id && ev.button === 0) { self._clicarPick(id, ev); return; }
        var marca = ev.target && ev.target.closest ? ev.target.closest("[data-d2-corte]") : null;
        if (marca && ev.button === 0) { self.abrir(self.idCorte(marca.getAttribute("data-d2-corte"))); return; }
        if (ev.button !== 0 && ev.button !== 1) return;
        var m = c.svg.getScreenCTM(); if (!m) return;
        arr = { x: ev.clientX, y: ev.clientY, vb: clone(c.vb), s: 1 / m.a };
        try { v.setPointerCapture(ev.pointerId); } catch (e) {}
        v.setAttribute("data-d2-arrasta", "1");
      });
      v.addEventListener("pointermove", function (ev) {
        if (self._pick && self._pick.id === id && self._pick.pts.length === 1) self._mostrarPick(id, ev);
        if (!arr) return;
        var dx = (ev.clientX - arr.x) * arr.s, dy = (ev.clientY - arr.y) * arr.s;
        self._aplicarVb(id, { x: arr.vb.x - dx, y: arr.vb.y - dy, w: arr.vb.w, h: arr.vb.h });
      });
      function solta() { arr = null; v.removeAttribute("data-d2-arrasta"); }
      v.addEventListener("pointerup", solta); v.addEventListener("pointercancel", solta);
      v.addEventListener("dblclick", function () { self.ajustar(id); });
    },

    /* --------------------------------------------- traçar corte na planta */
    tracarCorte: function (idPlanta) {
      var c = this._cache[idPlanta]; if (!c || !c.el) return false;
      this._pick = { id: idPlanta, pts: [] };
      c.el.setAttribute("data-d2-pick", "1");
      var letra = D2().proximaLetra(this.estado().cortes.map(function (x) { return x.letra; }));
      status("Corte " + letra + ": clique o 1º ponto na planta (Esc cancela; Shift solta o ângulo).");
      var self = this;
      if (!this._escPick) {
        this._escPick = function (ev) { if (ev.key === "Escape" && self._pick) { self.cancelarTraco(); ev.stopPropagation(); } };
        document.addEventListener("keydown", this._escPick, true);
      }
      return true;
    },
    cancelarTraco: function (calado) {
      if (!this._pick) return;
      var c = this._cache[this._pick.id]; if (c && c.el) { c.el.removeAttribute("data-d2-pick"); var g = c.el.querySelector(".d2-pick"); if (g) g.parentNode.removeChild(g); }
      this._pick = null; if (!calado) status("Corte cancelado.");
    },
    _travar: function (a, p, livre) {
      if (livre) return p;
      var dx = p[0] - a[0], dy = p[1] - a[1];
      return Math.abs(dx) >= Math.abs(dy) ? [p[0], a[1]] : [a[0], p[1]];   /* ortogonal, como a maioria dos cortes */
    },
    _mostrarPick: function (id, ev) {
      var c = this._cache[id], p = this._ptSvg(id, ev); if (!c || !p || !c.svg) return;
      var a = this._pick.pts[0], q = this._travar(a, p, ev.shiftKey);
      var g = c.svg.querySelector(".d2-pick");
      if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "line"); g.setAttribute("class", "d2-pick"); g.setAttribute("vector-effect", "non-scaling-stroke"); c.svg.appendChild(g); }
      g.setAttribute("x1", a[0]); g.setAttribute("y1", a[1]); g.setAttribute("x2", q[0]); g.setAttribute("y2", q[1]);
    },
    _clicarPick: function (id, ev) {
      var p = this._ptSvg(id, ev); if (!p) return;
      var pk = this._pick;
      if (!pk.pts.length) { pk.pts.push(p); status("Agora o 2º ponto (Shift solta o ângulo)."); return; }
      var a = pk.pts[0], b = this._travar(a, p, ev.shiftKey);
      this.cancelarTraco(true);
      if (Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) < 0.3) { toast("Corte curto demais: clique dois pontos mais afastados.", "aviso"); return; }
      this.criarCorte(a[0], a[1], b[0], b[1]);
    },
    /* cria o corte (pontos em X/Z do mundo) e abre a vista dele */
    criarCorte: function (ax, az, bx, bz, opts) {
      var e = this.estado();
      var letra = D2().proximaLetra(e.cortes.map(function (x) { return x.letra; }));
      var c = { id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), letra: letra, ax: ax, az: az, bx: bx, bz: bz, inv: !!(opts && opts.inv), prof: 0 };
      e.cortes.push(c); this._gravar();
      /* as plantas abertas ganham a marca do corte novo */
      var self = this; Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
      this._avisarMudou();
      this.abrir(this.idCorte(c.id));
      toast("Corte " + letra + " criado. Ele está em Navegador de projeto › Cortes.", "ok");
      status("Corte " + letra + " criado e aberto. A marca dele está na planta; os parâmetros, em Propriedades.");
      return c;
    },
    /* corte pelo meio do modelo: 'longitudinal' (ao longo do lado maior) ou 'transversal' */
    corteRapido: function (modo) {
      var p = B() && B().pavimentos2d ? B().pavimentos2d() : null;
      if (!p || !p.caixa) { toast("Abra um modelo primeiro.", "aviso"); return null; }
      var mn = p.caixa.min, mx = p.caixa.max, lx = mx[0] - mn[0], lz = mx[2] - mn[2], cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, m = 1;
      var aoLongoX = (modo === "longitudinal") === (lx >= lz);
      return aoLongoX ? this.criarCorte(mn[0] - m, cz, mx[0] + m, cz) : this.criarCorte(cx, mx[2] + m, cx, mn[2] - m);
    },
    excluirCorte: function (cid) {
      var e = this.estado(), n0 = e.cortes.length, self = this;
      e.cortes = e.cortes.filter(function (x) { return x.id !== cid; });
      if (e.cortes.length === n0) return false;
      delete e.estilos[this.idCorte(cid)];
      this._gravar();
      Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
      this._avisarMudou();
      return true;
    },
    abrir: function (id) { if (this._cfg.abrir) this._cfg.abrir(id, (this.def(id) || {}).nome || id); },

    /* ------------------------------------------ vínculo CAD (DWG/DXF) na planta
     * Como o "Vincular CAD" do Revit: o desenho fica por baixo da planta, em
     * cinza, com deslocamento e rotação próprios. O que fica gravado:
     *   estado.cad[nivelId] = [{ id, nome, w, h, dx, dy, rot, vis, n, nt, cortado }]
     *   e as LINHAS numa chave separada (orcapro:bim:cad:<obra>:<id>) — um DWG
     *   de prefeitura tem dezenas de milhares de linhas, e misturar com o estado
     *   das vistas faria o estado inteiro falhar ao gravar.
     * Coordenadas: o DXF chega em METROS (js/dxf.js), com Y para cima; a linha
     * vai guardada relativa ao canto do desenho. Na tela (planta: X = x, Y = z):
     *   X = dx + (u·cos − v·sen) · Y = dy − (u·sen + v·cos)  */
    MAX_CAD_SEG: 20000,
    _cadMem: {},
    _cadChave: function (lid) { return "orcapro:bim:cad:" + this._cfg.obraKey + ":" + lid; },
    cadLista: function (nivelId) { var c = this.estado().cad || {}; return (c[nivelId] || []).slice(); },
    _cadDados: function (lid) {
      if (this._cadMem[lid]) return this._cadMem[lid];
      var x = null; try { x = JSON.parse(localStorage.getItem(this._cadChave(lid)) || "null"); } catch (e) { x = null; }
      if (x && Array.isArray(x.s)) this._cadMem[lid] = x;
      return x;
    },
    vincularCad: function (id, nome, dxf) {
      var d = this.def(id); if (!d || d.tipo !== "planta") return { ok: false, erro: "O vínculo CAD vai numa planta baixa: abra uma planta primeiro." };
      var segs = (dxf && dxf.segmentos) || [], ex = dxf && dxf.extents;
      if (!segs.length || !ex) return { ok: false, erro: "O desenho não tem linhas." };
      var cortado = segs.length > this.MAX_CAD_SEG; if (cortado) segs = segs.slice(0, this.MAX_CAD_SEG);
      function r3(v) { return Math.round(v * 1000) / 1000; }
      var s = []; segs.forEach(function (g) { s.push(r3(g.x1 - ex.x0), r3(g.y1 - ex.y0), r3(g.x2 - ex.x0), r3(g.y2 - ex.y0)); });
      var t = (dxf.textos || []).slice(0, 3000).filter(function (x) { return isFinite(x.x) && isFinite(x.y) && x.txt; })
        .map(function (x) { return [r3(x.x - ex.x0), r3(x.y - ex.y0), String(x.txt).slice(0, 120)]; });
      var w = ex.x1 - ex.x0, h = ex.y1 - ex.y0, dx = 0, dy = h;
      /* começa com o centro do desenho no centro do modelo: depois ajusta em Propriedades */
      var p = B() && B().pavimentos2d ? B().pavimentos2d() : null;
      if (p && p.caixa) { dx = (p.caixa.min[0] + p.caixa.max[0]) / 2 - w / 2; dy = (p.caixa.min[2] + p.caixa.max[2]) / 2 + h / 2; }
      var lid = "cad" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      var dados = { s: s, t: t };
      this._cadMem[lid] = dados;
      var gravou = true;
      try { localStorage.setItem(this._cadChave(lid), JSON.stringify(dados)); } catch (e) { gravou = false; }
      var e = this.estado(); if (!e.cad || typeof e.cad !== "object") e.cad = {};
      var L = e.cad[d.nivel.id] || (e.cad[d.nivel.id] = []);
      L.push({ id: lid, nome: String(nome || "Desenho CAD").slice(0, 80), w: r3(w), h: r3(h), dx: r3(dx), dy: r3(dy), rot: 0, vis: true, n: s.length / 4, nt: t.length, cortado: cortado, temp: !gravou });
      this._gravar(); this._avisarMudou();
      if (!gravou) toast("O desenho é grande para guardar neste aparelho: ele fica só até fechar o OrçaPRO.", "aviso");
      return { ok: true, id: lid, segmentos: s.length / 4, textos: t.length, cortado: cortado, gravou: gravou };
    },
    _cadAchar: function (lid) {
      var c = this.estado().cad || {}, r = null;
      Object.keys(c).forEach(function (k) { (c[k] || []).forEach(function (x) { if (x.id === lid) r = x; }); });
      return r;
    },
    excluirCad: function (lid) {
      var c = this.estado().cad || {}, achou = false;
      Object.keys(c).forEach(function (k) { var n0 = (c[k] || []).length; c[k] = (c[k] || []).filter(function (x) { return x.id !== lid; }); if (c[k].length !== n0) achou = true; });
      if (!achou) return false;
      delete this._cadMem[lid];
      try { localStorage.removeItem(this._cadChave(lid)); } catch (e) {}
      this._gravar(); this._avisarMudou();
      return true;
    },
    /* vínculos visíveis do nível → [{ seg:[x1,y1,x2,y2,…], tx:[[X,Y,txt]] }] em coordenadas da planta */
    _cadDesenho: function (nivelId) {
      var self = this, out = [];
      this.cadLista(nivelId).forEach(function (v) {
        if (!v.vis) return;
        var dd = self._cadDados(v.id); if (!dd) return;
        var a = (+v.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), dx = +v.dx || 0, dy = +v.dy || 0;
        var seg = new Array(dd.s.length);
        for (var i = 0; i + 3 < dd.s.length; i += 4) {
          var u1 = dd.s[i], v1 = dd.s[i + 1], u2 = dd.s[i + 2], v2 = dd.s[i + 3];
          seg[i] = dx + u1 * co - v1 * si; seg[i + 1] = dy - (u1 * si + v1 * co);
          seg[i + 2] = dx + u2 * co - v2 * si; seg[i + 3] = dy - (u2 * si + v2 * co);
        }
        out.push({ id: v.id, seg: seg, tx: (dd.t || []).map(function (t) { return [dx + t[0] * co - t[1] * si, dy - (t[0] * si + t[1] * co), t[2]]; }) });
      });
      return out;
    },

    /* -------------------------------------------- Propriedades da vista */
    props: function (id) {
      var self = this, d = this.def(id); if (!d) return null;
      var e = this.estilo(id), D = D2(), c = this._cache[id] || {};
      function op(obj) { return Object.keys(obj).map(function (k) { return { id: k, rotulo: typeof obj[k] === "string" ? obj[k] : obj[k].rotulo }; }); }
      var secoes = [
        { nome: "Gráficos", params: [
          { id: "escala", rotulo: "Escala", tipo: "lista", valor: String(e.escala), opcoes: D.ESCALAS.map(function (s) { return { id: String(s), rotulo: "1:" + s }; }) },
          { id: "pena", rotulo: "Espessura das linhas", tipo: "lista", valor: e.pena, opcoes: op(D.PENAS) },
          { id: "preenchimento", rotulo: "Preenchimento do corte", tipo: "lista", valor: e.preenchimento, opcoes: op(D.PREENCHIMENTOS) },
          { id: "titulo", rotulo: "Título da vista", tipo: "sim-nao", valor: e.titulo },
          /* padrão de detalhamento da empresa (js/padraodet.js): cota, unidade, texto e escala de uma vez */
          { id: "padraodet", rotulo: "Padrão da empresa", tipo: "botao", rotuloBotao: "Aplicar Padrão de detalhamento", fn: function () { self.aplicarPadraoDet(id); } }
        ].concat(d.tipo === "planta" ? [{ id: "marcasCorte", rotulo: "Marcas de corte", tipo: "sim-nao", valor: e.marcasCorte }]
                                     : [{ id: "niveis", rotulo: "Níveis", tipo: "sim-nao", valor: e.niveis }]) },
        { nome: "Cotas", params: [
          { id: "cotas", rotulo: "Mostrar cotas", tipo: "sim-nao", valor: e.cotas },
          { id: "cotaParcial", rotulo: "Cota em cadeia", tipo: "sim-nao", valor: e.cotaParcial },
          { id: "marcaCota", rotulo: "Marca da cota", tipo: "lista", valor: e.marcaCota, opcoes: op(D.MARCAS_COTA) },
          { id: "textoCota", rotulo: "Altura do texto", unidade: "mm", tipo: "numero", passo: 0.5, valor: e.textoCota },
          { id: "unidade", rotulo: "Unidade", tipo: "lista", valor: e.unidade, opcoes: op(D.UNIDADES) },
          { id: "casas", rotulo: "Casas decimais", tipo: "lista", valor: String(e.casas), opcoes: [{ id: "0", rotulo: "0" }, { id: "1", rotulo: "1" }, { id: "2", rotulo: "2" }, { id: "3", rotulo: "3" }] }
        ] }
      ];
      if (d.tipo === "planta") {
        secoes.push({ nome: "Extensões (faixa de vista)", params: [
          { id: "altura", rotulo: "Altura do corte", unidade: "m", tipo: "numero", passo: 0.05, valor: d.altura },
          { id: "abaixo", rotulo: "Ver abaixo do piso", unidade: "m", tipo: "numero", passo: 0.05, valor: d.abaixo }
        ] });
      } else {
        secoes.push({ nome: "Extensões", params: [
          { id: "prof", rotulo: "Profundidade de vista (0 = tudo)", unidade: "m", tipo: "numero", passo: 0.5, valor: d.corte.prof || 0 },
          { id: "inv", rotulo: "Olhar para o outro lado", tipo: "sim-nao", valor: !!d.corte.inv }
        ] });
      }
      if (d.tipo === "planta") {
        var vc = [];
        this.cadLista(d.nivel.id).forEach(function (v) {
          var p = "cad-" + v.id + "-";
          vc.push({ id: p + "nome", rotulo: "Desenho", leitura: true, valor: v.nome + " · " + v.n + " linhas" + (v.cortado ? " (limitado)" : "") + (v.temp ? " · não gravado" : "") });
          vc.push({ id: p + "vis", rotulo: "Mostrar", tipo: "sim-nao", valor: !!v.vis });
          vc.push({ id: p + "dx", rotulo: "Deslocamento X", unidade: "m", tipo: "numero", passo: 0.05, valor: v.dx });
          vc.push({ id: p + "dy", rotulo: "Deslocamento Y", unidade: "m", tipo: "numero", passo: 0.05, valor: v.dy });
          vc.push({ id: p + "rot", rotulo: "Rotação", unidade: "°", tipo: "numero", passo: 1, valor: v.rot || 0 });
          vc.push({ id: p + "excluir", rotulo: "Vínculo", tipo: "botao", rotuloBotao: "Remover vínculo", fn: function () { self.excluirCad(v.id); self.redesenhar(id, false); status("Vínculo CAD removido."); } });
        });
        if (this._cfg.vincular) vc.push({ id: "cad-novo", rotulo: "DWG / DXF", tipo: "botao", rotuloBotao: "Vincular desenho CAD…", fn: function () { self._cfg.vincular(id); } });
        if (vc.length) secoes.push({ nome: "Vínculos CAD", params: vc });
      }
      var ident = [
        { id: "nome", rotulo: "Nome da vista", leitura: true, valor: d.nome },
        { id: "ajustar", rotulo: "Enquadrar", tipo: "botao", rotuloBotao: "Ajustar à tela", fn: function () { self.ajustar(id); } },
        { id: "atualizar", rotulo: "Modelo mudou?", tipo: "botao", rotuloBotao: "Atualizar desenho", fn: function () { self.redesenhar(id, true); status("Desenho refeito a partir do modelo."); } }
      ];
      if (d.tipo === "planta") ident.push({ id: "novo-corte", rotulo: "Corte", tipo: "botao", rotuloBotao: "Traçar corte nesta planta", fn: function () { self.tracarCorte(id); } });
      else ident.push({ id: "excluir", rotulo: "Corte", tipo: "botao", rotuloBotao: "Excluir este corte", fn: function () { self._pedirExclusao(d.corte); } });
      if (c.info) ident.push({ id: "info", rotulo: "Desenho", leitura: true, valor: (c.dados ? c.dados.cortes.length : 0) + " contornos · " + (c.dados ? c.dados.linhas.length : 0) + " linhas · " + c.info.ms + " ms" });
      secoes.push({ nome: "Identidade", params: ident });
      return {
        daVista: true, semEditarTipo: true, titulo: d.nome, icone: d.tipo === "planta" ? "planta" : "corte", secoes: secoes,
        onMudar: function (pid, valor) { self._mudar(id, pid, valor); return self.props(id); }
      };
    },
    _mudar: function (id, pid, valor) {
      var d = this.def(id); if (!d) return;
      var e = this.estado();
      var mc = /^cad-(\w+)-(vis|dx|dy|rot)$/.exec(pid);
      if (mc) {
        var v = this._cadAchar(mc[1]); if (!v) return;
        v[mc[2]] = mc[2] === "vis" ? !!valor : num(valor, v[mc[2]] || 0);
        this._gravar(); this.redesenhar(id, false); return;
      }
      if (pid === "altura" || pid === "abaixo") {
        var pp = e.plantas[d.nivel.id] || (e.plantas[d.nivel.id] = {});
        pp[pid] = Math.max(pid === "altura" ? 0.1 : 0, num(valor, pid === "altura" ? 1.2 : 0.05));
        this._gravar(); this.redesenhar(id, true); return;
      }
      if (pid === "prof" || pid === "inv") {
        d.corte[pid] = pid === "inv" ? !!valor : Math.max(0, num(valor, 0));
        this._gravar(); this.redesenhar(id, true);
        var self = this; Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
        return;
      }
      var est = e.estilos[id] || (e.estilos[id] = this.estilo(id));
      est[pid] = (pid === "escala" || pid === "casas" || pid === "textoCota") ? num(valor, est[pid]) : valor;
      e.estilos[id] = D2().normEstilo(est);
      this._gravar(); this.redesenhar(id, false);
    },
    /* aplica o padrão de detalhamento da empresa a ESTA vista (o resto do estilo — pena, preenchimento — fica) */
    aplicarPadraoDet: function (id) {
      var P = global.PadraoDet; if (!P || !this.def(id)) return false;
      var empresa = (global.Auth && global.Auth.empresaId) ? global.Auth.empresaId() : null;
      var pd = P.estilo2D(P.ler(empresa)), e = this.estado();
      var est = e.estilos[id] || (e.estilos[id] = this.estilo(id));
      ["escala", "marcaCota", "textoCota", "unidade", "casas"].forEach(function (k) { est[k] = pd[k]; });
      e.estilos[id] = D2().normEstilo(est);
      this._gravar(); this.redesenhar(id, false);
      status("Padrão de detalhamento aplicado: cota em " + pd.unidade + ", texto " + pd.textoCota + " mm, 1:" + pd.escala + ".");
      return true;
    },
    _pedirExclusao: function (c) {
      var self = this;
      if (global.UI && UI.modal) {
        UI.modal("Excluir o Corte " + c.letra + "?", "<p>A vista do corte e a marca dele na planta saem. O modelo não muda.</p>", [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Excluir corte", classe: "danger", onClick: function () { UI.fecharModal(); if (self._cfg.fechar) self._cfg.fechar(self.idCorte(c.id)); self.excluirCorte(c.id); toast("Corte " + c.letra + " excluído.", "ok"); } }
        ]);
      }
    }
  };

  global.Bim2D = Bim2D;
  if (typeof module !== "undefined" && module.exports) module.exports = Bim2D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

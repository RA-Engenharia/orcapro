/* =====================================================================
 * bimvistamodelar.js — MODELAR NO CORTE E NA ELEVAÇÃO (23/10/2026).
 *
 * Pedido do Rogério: "a parte de modelar em qualquer vista precisa ficar pronta".
 * Na PLANTA a ferramenta armada já recebia o clique (js/bimplantamodelar.js); no
 * corte e na elevação o clique caía no vazio. Aqui a vista vira o plano de
 * trabalho (js/bimvistaplano.js faz a conta; esta é a TELA):
 *
 *   PAREDE ... dois cliques no plano da vista: ela corre ao longo do plano e nasce
 *              no NÍVEL da cota clicada (o mais alto que não passa dela);
 *   VIGA ..... dois cliques: ela corre ao longo do plano e o TOPO fica na cota
 *              clicada (pilares vistos agarram: ponta, meio, eixo, prolongamento);
 *   PILAR .... um clique: nasce no nível da cota clicada, no X do plano;
 *   PORTA e JANELA ... o clique vira um RAIO que olha para dentro da vista e acha
 *              a parede (a cortada vale no plano; a vista ao fundo, na face): a
 *              família se hospeda nela, com o vão aberto;
 *   COMPONENTE ... um clique, no X do plano, no nível da cota;
 *   TUBO e ELETRODUTO ... já se desenham no corte (js/biminstui.js cliqueCorte);
 *   TELHADO ... o perfil "Por corte" (js/bimp3ui.js BimTelhadoCorte).
 *
 * O que não faz sentido numa vista (laje, forro, escada, guarda-corpo…) NÃO falha
 * calado: a barra de estado diz por quê, e uma caixa oferece abrir a planta do
 * nível certo (BimVistaPlano.ferramentaNaVista).
 *
 * O MESMO motor de snap (BimPrecisao) serve aqui: a geometria é a SILHUETA das
 * peças na vista (BimVistaPlano.geometria) mais o desenho (cortes e linhas, que
 * trazem o IFC importado). Tab percorre os candidatos que concorrem no cursor.
 * Tudo entra no editor pela MESMA porta da planta (BIM.planta2d().clique): as
 * mesmas ops, o mesmo Ctrl+Z, o mesmo orçamento.
 * ===================================================================== */
(function (global) {
  "use strict";

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function fmt(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function VP() { return global.BimVistaPlano || null; }
  function PM() { return global.BimPlantaModelar || null; }
  function Pr() { return global.BimPrecisao || null; }
  function BB() { return global.BimBarraOpcoes || null; }
  function B() { return global.BIM || null; }
  function D2() { return global.Bim2D || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var NS = "http://www.w3.org/2000/svg";

  /* as ferramentas que esta tela trata (as outras seguem o caminho de sempre: cota, anotar, tubo, telhado…) */
  var HORIZ = { parede: 1, viga: 1, trelica: 1 };                       /* dois pontos ao longo do plano, na mesma altura */
  var UM_CLIQUE = { pilar: 1, familia: 1 };
  var RECUSAS = { laje: 1, furo: 1, forro: 1, escada: 1, rampa: 1, guarda: 1, cobertura: 1, eixo: 1, fundacao: 1 };

  var st = { id: null, sub: null, p1: null, b1: null, prof: 0, cur: null, ciclo: {}, avisou: {}, ultEv: null, tMov: 0, geo: null, gk: null, nivelMsg: null };

  var BimVistaModelar = {
    HORIZ: HORIZ, UM_CLIQUE: UM_CLIQUE, RECUSAS: RECUSAS,

    /* ------------------------------------------------ o quadro da vista */
    _q: function (id) {
      var P2 = D2(), V = VP(); if (!P2 || !V) return null;
      var d = P2.def ? P2.def(id) : null;
      return d && d.tipo === "corte" ? V.quadro(d) : null;
    },
    trata: function (sub) { return !!(HORIZ[sub] || UM_CLIQUE[sub] || RECUSAS[sub]); },
    /* o duplo clique do corte/elevação é ponto (e não "enquadrar") quando a ferramenta armada é tratada aqui */
    ocupado: function (id, sub) {
      var q = this._q(id); if (!q || !this.trata(sub)) return false;
      return VP().ferramentaNaVista(sub, q.vista).modo === "direto";
    },

    /* ------------------------------------------------ níveis */
    _niveis: function () {
      var U = global.BimArqUI, L = [];
      try { if (U && U.ativo && U.ativo() && U.niveis) L = (U.niveis() || []).map(function (n) { return { id: n.id, nome: n.nome, y: +n.elevacao }; }); } catch (e) { L = []; }
      if (!L.length) { var P2 = D2(); try { L = (P2 && P2.niveis ? P2.niveis() : []).map(function (n) { return { id: n.id, nome: n.nome, y: +n.y }; }); } catch (e2) { L = []; } }
      return L;
    },
    /* o nível em que a peça nasce, pela cota clicada: troca o nível atual do modelador (como a planta faz) */
    _usarNivel: function (y) {
      var V = VP(), U = global.BimArqUI, r = V.nivelNaCota(this._niveis(), y); if (!r) return null;
      try {
        if (U && U.ativo && U.ativo() && U.cfg && String((U.cfg() || {}).nivelId) !== String(r.nivel.id)) {
          U.cfg().nivelId = r.nivel.id; U.enviar();
          if (PM() && BB() && BB().pintar) BB().pintar();
        }
      } catch (e) {}
      return r;
    },

    /* ------------------------------------------------ geometria de snap da vista */
    _geo: function (id, q) {
      var b = B(), est = null; try { est = b && b.editarEstado ? b.editarEstado().estado : null; } catch (e) { est = null; }
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null, dados = c ? c.dados : null, nv = this._niveis();
      var chave = JSON.stringify(nv) + "|" + (c && c.vbTotal ? [c.vbTotal.x, c.vbTotal.w].join(",") : "");
      if (st.geo && st.gk && st.gk[0] === est && st.gk[1] === dados && st.gk[2] === chave && st.geo.id === id) return st.geo;
      var vb = c && c.vbTotal ? c.vbTotal : { x: 0, y: -4, w: q.L, h: 5 };
      var comEixos = !!(BB() && BB().snapLigado && BB().snapLigado("eixos"));
      var g = VP().geometria(q, est || {}, { niveis: nv.map(function (n) { return { id: n.id, y: n.y }; }), xr: [vb.x, vb.x + vb.w], yr: [-(vb.y + vb.h), -vb.y], eixos: comEixos });
      var segs = g.segs.slice(), pontos = g.pontos.slice();
      if (PM() && PM()._juntarDesenho) PM()._juntarDesenho(dados, segs, pontos);   /* o desenho (corte e linhas): o IFC importado também agarra */
      st.geo = { id: id, els: g.els, segs: segs, pontos: pontos, circs: [] }; st.gk = [est, dados, chave];
      return st.geo;
    },

    /* ------------------------------------------------ o ponto (snap + travas) */
    _ponto: function (id, ev, p, sub, q) {
      var R = Pr(), Bo = BB(), cfg = Bo ? Bo.cfg(sub) : null, tol = PM()._tol(id, 12);
      var horiz = !!(HORIZ[sub] && st.p1);
      var cur = { x: p[0], z: horiz ? st.p1.b : p[1] };   /* o 2º ponto corre na altura do 1º: o snap procura nessa horizontal */
      var base = st.p1 ? { x: st.p1.a, z: st.p1.b } : null, lista = [], cic = null, sn = null;
      if (R && cfg && cfg.snap) {
        var T = {}; (R.TIPOS || []).forEach(function (t) { T[t] = !cfg.tipos || cfg.tipos[t] !== false; }); T.grade = !!cfg.grade && T.grade;
        lista = R.snapTodos(cur, this._geo(id, q), { tol: tol, tipos: T, ref: base, grade: cfg.grade ? cfg.passo : 0 });
        cic = R.escolherCiclo(st.ciclo, lista, ev && fin(ev.clientX) ? { x: ev.clientX, y: ev.clientY } : null, false);
        sn = cic.sn;
      }
      return this._montar(cur, sn, tol, horiz, lista, cic, q);
    },
    _montar: function (cur, sn, tol, horiz, lista, cic, q) {
      var a = sn ? sn.p.x : cur.x, b = sn ? sn.p.z : cur.z;
      if (horiz) b = st.p1.b;
      /* a profundidade da peça em que o ponto agarrou (o canto do pilar visto ao fundo): a peça nova nasce nela */
      var prof = null;
      if (sn && sn.id != null && q) {
        try { var est = B().editarEstado().estado, cx = ((est && est.caixas) || []).filter(function (c) { return c.id === sn.id; })[0]; if (cx) prof = VP().profundidadeDaPeca(q, cx); } catch (e) { prof = null; }
      }
      return { a: r6(a), b: r6(b), y: r6(-b), raw: cur, sn: sn, tol: tol, lista: lista || [], tabIdx: cic ? cic.idx : 0, tabN: cic ? cic.n : 0,
               dist: st.p1 ? Math.abs(a - st.p1.a) : 0, prof: prof };
    },

    /* ------------------------------------------------ recusa: por quê + a vista certa */
    _recusar: function (id, q, sub, f, p) {
      var V = VP(), nv = V.nivelNaCota(this._niveis(), p ? -p[1] : 0), nome = nv ? nv.nivel.nome : null;
      var rotulo = (V.NOME && V.NOME[sub]) || sub;
      status(rotulo + " não se desenha nesta vista. " + f.motivo + (nome ? " Abra a planta do " + nome + "." : " Abra a planta do nível."));
      var chave = sub + "@" + id;
      if (st.avisou[chave]) return;
      st.avisou[chave] = true;
      var P2 = D2(), UIm = global.UI;
      if (!UIm || !UIm.modal || !P2) return;
      var idPl = nv && P2.idPlanta ? P2.idPlanta(nv.nivel.id) : null;
      try {
        UIm.modal(rotulo + " — desenhe na planta",
          '<p style="margin:0 0 8px" data-vm="motivo">' + String(f.motivo).replace(/</g, "&lt;") + '</p>' +
          '<p class="muted" style="margin:0">' + (nome ? 'A planta certa para o ponto que você clicou é a do <b>' + String(nome).replace(/</g, "&lt;") + '</b>. A ferramenta continua armada: é só clicar lá.' : 'Abra a planta do nível em que a peça nasce. A ferramenta continua armada.') + '</p>',
          [{ texto: "Agora não", classe: "ghost", onClick: function () { UIm.fecharModal(); } },
           { texto: nome ? "Abrir a planta do " + nome : "Abrir a planta", classe: "primary", onClick: function () {
             UIm.fecharModal();
             try {
               if (!idPl && P2.niveis) { var l0 = P2.niveis()[0]; idPl = l0 ? P2.idPlanta(l0.id) : null; }
               if (idPl) P2.abrir(idPl);
             } catch (e) {}
           } }]);
      } catch (e2) {}
    },

    /* ------------------------------------------------ o clique */
    clique: function (id, ev, p, sub) {
      var V = VP(), R = Pr();
      if (!V || !R || !p || !this.trata(sub)) return false;
      var q = this._q(id); if (!q || q.tipo !== "corte") return false;
      var f = V.ferramentaNaVista(sub, q.vista);
      st.id = id;
      if (f.modo === "recusa") { this._recusar(id, q, sub, f, p); return true; }
      var a = PM().api(); if (!a) return false;
      if (st.sub !== sub) { st.sub = sub; st.p1 = null; st.b1 = null; st.ciclo = {}; }
      var t0 = a.traco();
      if (!t0.p1 && !(t0.pts && t0.pts.length)) { st.p1 = null; }
      var r = this._ponto(id, ev, p, sub, q);
      var opts = { shift: !!(ev && ev.shiftKey), ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)) };
      var okClique = false;

      if (sub === "familia" && PM()._familiaHospedada()) {
        /* PORTA e JANELA: o raio do clique acha a parede; o vão abre nela, na posição do clique */
        var b0 = B(), est = null; try { est = b0.editarEstado().estado; } catch (e0) { est = null; }
        var h = V.paredeNoRaio(q, est || {}, p[0], p[1]);
        if (!h) { status("Porta e janela vão numa parede: clique numa parede criada aqui, cortada pelo plano da vista ou vista de frente (a parede do IFC importado não é alterada)."); return true; }
        okClique = a.clique({ x: h.ponto.x, z: h.ponto.z }, { alvoId: h.id, shift: opts.shift, ctrl: opts.ctrl });
        st.ciclo = {}; this._depois(id, q);
        return !!okClique;
      }

      var primeiro = !t0.p1 && !(t0.pts && t0.pts.length);
      var cota = r.y;                                    /* a cota (m) do ponto clicado */
      if (primeiro || UM_CLIQUE[sub]) {
        var niv = this._usarNivel(cota);
        if (niv && niv.nivel && st.nivelMsg !== niv.nivel.id + "|" + sub) {
          st.nivelMsg = niv.nivel.id + "|" + sub;
          status("Nível atual: " + niv.nivel.nome + " (+" + fmt(niv.nivel.y) + " m) — pela cota clicada" + (niv.abaixo ? ", que está abaixo de todos os níveis" : "") + ".");
        }
      }
      /* a profundidade: a da peça em que o 1º ponto agarrou; os pontos seguintes ficam paralelos ao plano, nela */
      var prof = (primeiro || UM_CLIQUE[sub]) ? (r.prof != null ? r.prof : 0) : (st.prof || 0);
      if (primeiro) st.prof = prof;
      var m = V.paraMundo(q, r.a, r.b, { prof: prof });
      if (HORIZ[sub] && primeiro) st.b1 = r.b;
      var o = { shift: opts.shift, ctrl: opts.ctrl };
      if (sub === "viga" && !primeiro && st.b1 != null) o.topo = r6(-st.b1);   /* o topo é a cota do 1º clique */
      okClique = a.clique({ x: m.x, z: m.z }, o);
      /* o ponto de partida continua na tela (parede encadeada): o X dele é o do último ponto do editor */
      var t1 = a.traco();
      if (t1.p1 && HORIZ[sub]) { var dv = V.daVista(q, { x: t1.p1.x, y: 0, z: t1.p1.z }); st.p1 = { a: dv[0], b: st.b1 != null ? st.b1 : r.b }; }
      else { st.p1 = null; if (!t1.p1) st.b1 = null; }
      st.ciclo = {};
      this._depois(id, q);
      return !!okClique;
    },
    /* depois de criar: a vista se refaz pelo modelo (o corte lê a cena) e o elástico volta por cima */
    _depois: function (id, q) {
      var P2 = D2();
      try { if (P2 && P2.atualizar) P2.atualizar(id); } catch (e) {}
      st.geo = null;
      var c = P2 && P2._cache ? P2._cache[id] : null;
      if (c && c.el) c.el.setAttribute("data-pm-ferr", st.sub || "");
      this._desenhar(id, q);
    },

    /* ------------------------------------------------ movimento do mouse */
    mover: function (id, ev, p, sub) {
      var V = VP(); if (!V || !this.trata(sub) || !p) return false;
      var q = this._q(id); if (!q || q.tipo !== "corte") return false;
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.el) return false;
      c.el.setAttribute("data-pm-ferr", sub);
      st.ultEv = { x: ev.clientX, y: ev.clientY, shift: !!ev.shiftKey };
      var agora = Date.now(); if (agora - st.tMov < 25) return true; st.tMov = agora;
      st.id = id;
      if (st.sub !== sub) { st.sub = sub; st.p1 = null; st.b1 = null; st.ciclo = {}; }
      if (V.ferramentaNaVista(sub, q.vista).modo === "recusa") { PM()._limparCamada(id); return true; }
      if (st.p1) { var t = PM().api() ? PM().api().traco() : null; if (!t || !t.p1) { st.p1 = null; st.b1 = null; } }
      st.cur = this._ponto(id, ev, p, sub, q);
      this._desenhar(id, q);
      return true;
    },
    /* TAB na vista: avança o ciclo dos candidatos que concorrem no cursor (true = consumiu) */
    tab: function () {
      if (!this.naFrente()) return false;
      var id = st.id, R = Pr(), P2 = D2(), c = id && P2 && P2._cache ? P2._cache[id] : null, e = st.ultEv, r = st.cur, sub = PM() ? PM().ferramenta() : null;
      if (!c || !c.el || !R || !r || !r.lista || r.lista.length < 2 || !e || !sub) return false;
      try { var alvo = document.elementFromPoint(e.x, e.y); if (!alvo || !c.el.contains(alvo)) return false; } catch (eT) { return false; }
      var cic = R.escolherCiclo(st.ciclo, r.lista, { x: e.x, y: e.y }, true);
      st.cur = this._montar(r.raw, cic.sn, r.tol, !!(HORIZ[sub] && st.p1), r.lista, cic, this._q(id));
      this._desenhar(id, this._q(id));
      return true;
    },
    aposTab: function (id, sub) {
      var q = this._q(id), r = st.cur; if (!q || !r || !r.sn) return;
      st.cur = this._montar(r.raw, r.sn, r.tol, !!(HORIZ[sub] && st.p1), r.lista, { idx: r.tabIdx, n: r.tabN }, q);
      this._desenhar(id, q);
    },
    /* a vista na frente é um corte/elevação? (o Esc e o Tab daqui só valem lá: no 3D e na planta o editor cuida sozinho) */
    naFrente: function () {
      var va = null; try { va = PM() && PM()._vistaAtiva ? PM()._vistaAtiva() : null; } catch (e) { va = null; }
      return !!(va && this._q(va));
    },
    /* Esc: encerra o traço em andamento (true = consumiu) */
    esc: function () {
      if (!this.naFrente()) return false;
      var a = PM() && PM().api ? PM().api() : null; if (!a) return false;
      var t = a.traco();
      if (!(t.p1 || (t.pts && t.pts.length) || st.p1)) return false;
      a.cancelar(); st.p1 = null; st.b1 = null; st.ciclo = {};
      if (st.id) this._desenhar(st.id, this._q(st.id));
      status("Traço encerrado — clique o início do próximo, ou Esc para sair da ferramenta.");
      return true;
    },

    /* ------------------------------------------------ o desenho da prévia (SVG) */
    _desenhar: function (id, q) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null, pm = PM(); if (!c || !c.svg || !pm) return;
      var sub = pm.ferramenta(); if (!sub || !q) { pm._limparCamada(id); return; }
      var NS_ = NS, g = c.svg.querySelector("g.pm-cam");
      if (!g) { g = document.createElementNS(NS_, "g"); g.setAttribute("class", "pm-cam"); g.setAttribute("pointer-events", "none"); }
      if (g.parentNode !== c.svg || c.svg.lastChild !== g) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      var r = st.cur, u = 1 / pm._escala(id);
      function el(tag, at) { var e = document.createElementNS(NS_, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); e.setAttribute("vector-effect", "non-scaling-stroke"); g.appendChild(e); return e; }
      var a = pm.api(), t = a ? a.traco() : null;
      if (HORIZ[sub] && st.p1 && r) {
        var x0 = st.p1.a, x1 = r.a, bB = st.p1.b;
        if (sub === "parede" && Math.abs(x1 - x0) > 1e-6) {
          var alt = t && t.alt > 0 ? t.alt : 2.8, base = t && fin(t.base) ? t.base : -bB;
          el("rect", { x: r6(Math.min(x0, x1)), y: r6(-(base + alt)), width: r6(Math.abs(x1 - x0)), height: r6(alt), "class": "pm-faixa" });
        }
        el("line", { x1: r6(x0), y1: r6(bB), x2: r6(x1), y2: r6(bB), "class": "pm-elastico" });
        el("circle", { cx: r6(x0), cy: r6(bB), r: r6(3 * u), "class": "pm-vert" });
      }
      /* porta/janela: a parede sob o cursor e o vão que vai abrir */
      if (sub === "familia" && r && pm._familiaHospedada()) this._desenharVao(id, q, el, r);
      if (r && r.sn && r.sn.tipo) {
        (r.sn.guias || []).forEach(function (gu) { el("path", { d: "M" + r6(gu.a.x) + " " + r6(gu.a.z) + "L" + r6(gu.b.x) + " " + r6(gu.b.z), "class": "pm-guia" }); });
        pm._marcador(el, r.sn.tipo, { x: r.a, z: r.b }, 6 * u, g);
      }
      if (r) {
        el("line", { x1: r6(r.a - 9 * u), y1: r6(r.b), x2: r6(r.a + 9 * u), y2: r6(r.b), "class": "pm-mira" });
        el("line", { x1: r6(r.a), y1: r6(r.b - 9 * u), x2: r6(r.a), y2: r6(r.b + 9 * u), "class": "pm-mira" });
      }
      this._rotulo(id, r, sub);
      pm._rotuloSnap(id, r ? { sn: r.sn, tabIdx: r.tabIdx, tabN: r.tabN } : null, st.ultEv);
    },
    _desenharVao: function (id, q, el, r) {
      var V = VP(), b = B(), est = null; try { est = b.editarEstado().estado; } catch (e) { return; }
      var h = V.paredeNoRaio(q, est || {}, r.raw.x, r.raw.z); if (!h) return;
      var pr = V.projetarCaixa(h.parede, q);
      if (pr) el("path", { d: "M" + pr.poli.map(function (v) { return r6(v[0]) + " " + r6(v[1]); }).join("L") + "Z", "class": "pm-hospede" });
      var a = PM().api(), t = a ? a.traco() : null, fs = t && t.famSel, av = null;
      try { av = fs ? b.familiaAvaliar(fs.famId, fs.tipoId, fs.inst || {}) : null; } catch (e2) { av = null; }
      var ab = av && av.abertura ? av.abertura : null, lv = ab && ab.largura > 0 ? ab.largura : 0.8, hv = ab && ab.altura > 0 ? ab.altura : 2.1, peit = ab && fin(ab.peitoril) ? ab.peitoril : 0;
      /* o centro do vão: o do clique, preso ao que cabe na silhueta da parede */
      var xs = pr ? pr.poli.map(function (v) { return v[0]; }) : [r.raw.x - lv / 2, r.raw.x + lv / 2], xa = Math.min.apply(null, xs), xb = Math.max.apply(null, xs);
      var cx = Math.max(xa + lv / 2, Math.min(xb - lv / 2, r.raw.x)), yb = h.parede.cy - h.parede.altura / 2 + peit;
      el("rect", { x: r6(cx - lv / 2), y: r6(-(yb + hv)), width: r6(lv), height: r6(hv), "class": "pm-vao" });
    },
    _rotulo: function (id, r, sub) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.tela) return;
      var el = c.tela.querySelector(".pm-rot");
      if (!el) { el = document.createElement("div"); el.className = "pm-rot"; el.setAttribute("aria-live", "off"); c.tela.appendChild(el); }
      if (!r || !st.p1 || !(r.dist > 1e-6)) { el.style.display = "none"; return; }
      el.textContent = fmt(r.dist) + " m" + (sub === "viga" ? " · topo a " + fmt(-st.p1.b) + " m" : "");
      var rc = c.tela.getBoundingClientRect(), e = st.ultEv;
      el.style.display = "";
      if (e) { el.style.left = (e.x - rc.left + 16) + "px"; el.style.top = (e.y - rc.top + 14) + "px"; }
    },
    /* para o e2e e o suporte */
    estado: function () {
      return { id: st.id, sub: st.sub, p1: st.p1 ? { a: st.p1.a, b: st.p1.b } : null, cursor: st.cur ? { a: st.cur.a, b: st.cur.b, y: st.cur.y, snap: st.cur.sn ? st.cur.sn.tipo : null, tabN: st.cur.tabN, tabIdx: st.cur.tabIdx } : null };
    }
  };

  global.BimVistaModelar = BimVistaModelar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVistaModelar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

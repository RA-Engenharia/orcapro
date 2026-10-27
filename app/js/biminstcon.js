/* =====================================================================
 * biminstcon.js — OS CONECTORES À VISTA (modelagem pelos conectores, 17/10/2026).
 *
 * Pedido do Rogério: "no software de referência você clica numa conexão e ela já dá a opção de sair dela com o tubo";
 * "na planta, ao clicar numa caixinha sifonada, ele mostra onde são as saídas e as entradas, e dali eu começo o tubo".
 *
 * SELECIONAR uma peça de instalação (louça/equipamento, caixa sifonada/ralo, tubo, conexão) mostra os PONTOS DE
 * LIGAÇÃO dela na vista ativa (3D, planta ou corte — é o mesmo dado):
 *   · livre  → "+" com a seta na direção de saída do tubo; ligado → um ponto discreto;
 *   · entrada × saída pelo fluxo (E/S): no esgoto a louça SAI, a caixa tem entradas e uma saída, o tubo entra na
 *     ponta de montante (p1) e sai na de jusante (p2); na água a louça/equipamento recebe (E).
 * CLICAR no "+" arma a ferramenta Tubo a partir dele, com sistema e DN do ponto, a inclinação do DN e o sentido do
 * escoamento (de uma ENTRADA desenha-se para montante). O 2º clique noutro ponto de ligação liga A → B sozinho
 * (js/biminstui.js tentarLigacao → js/hidligar.js).
 *
 * PURO (Node, tools/test-hid-conectores.js): BimInstCon.pontos(estado, avaliarFam, uid). TELA: o realce (DOM por cima
 * da vista ativa, reposicionado a cada quadro enquanto há seleção) e o clique no "+".
 * ===================================================================== */
(function (global) {
  "use strict";
  function BI() { return global.BimInst || (typeof require === "function" ? (function () { try { return require("./biminst.js"); } catch (e) { return null; } })() : null); }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function dist(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
  function un(v) { var L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; }
  var TOL = 0.03;   /* o mesmo do ponto de aparelho do biminst (TOL_CONECTOR) */

  /* ================================================================ PURO */
  function pontos(estado, avaliarFam, uid) {
    var I = BI(); if (!I || !estado) return [];
    var id = String(uid || "").replace(/^edit:/, ""), R = I.rede(estado, avaliarFam), out = [];
    var trechos = (estado.instalacoes || {}).trechos || [], pecas = (estado.instalacoes || {}).pecas || [];
    var livresCon = {}; R.conectoresLivres.forEach(function (k) { livresCon[k.id] = 1; });
    /* D5 (27/10/2026): a porta OPCIONAL sem tubo não está em conectoresLivres (não é desconexão), mas continua livre para o "+" começar o tubo */
    var ligadosCon = {}; R.ligacoes.forEach(function (l) { ligadosCon[l.alvo] = 1; });
    /* 1) família (louça, equipamento): os conectores dela */
    var fam = arr(estado.familias).filter(function (f) { return String(f.id) === id; })[0];
    if (fam) {
      I.conectoresDoEstado(estado, avaliarFam).filter(function (k) { return String(k.famInst) === id; }).forEach(function (k) {
        var nome = String(k.id).split(":").pop(), grav = I.SISTEMAS[k.sistema] && I.SISTEMAS[k.sistema].gravidade;
        /* D5b (27/10/2026): o fluxo vem do PAPEL que a família declara (entrada | succao | saida | recalque | respiro); o nome do conector só vale para família sem papel */
        var fluxo = k.papel ? (/^(entrada|succao)$/.test(k.papel) ? "entrada" : "saida") : (/entrada|alim|succao/.test(nome) ? "entrada" : (/saida|recalque/.test(nome) ? "saida" : (grav ? "saida" : "entrada")));
        var dir = k.parede ? { x: -k.parede.x, y: 0, z: -k.parede.z } : (grav && k.y <= fam.y + 0.02 ? { x: 0, y: -1, z: 0 } : { x: 0, y: 0, z: 1 });
        out.push({ tipo: "conector", x: k.x, y: k.y, z: k.z, dir: dir, sistema: k.sistema, dn: k.dn, fluxo: fluxo, livre: !!livresCon[k.id] || (!!k.opcional && !ligadosCon[k.id]), nome: k.nome, famInst: k.famInst, parede: k.parede || null });
      });
      return out;
    }
    /* 2) peça (caixa sifonada, ralo): entradas laterais e a saída — a saída para o lado do tubo que já sai, ou +X */
    var pc = pecas.filter(function (k) { return k.id === id; })[0];
    if (pc && pc.hub) {
      var P = I.PECAS[pc.peca] || {}, r = pc.hub.r || P.r || 0.05, h = P.h || 0.12, lig = [];
      trechos.forEach(function (t) {
        [["p1", "p2"], ["p2", "p1"]].forEach(function (e) {
          var a = t[e[0]], b = t[e[1]], dx = a.x - pc.x, dz = a.z - pc.z;
          if (!(Math.sqrt(dx * dx + dz * dz) <= r + 0.01 && a.y <= pc.hub.yTop + 0.01 && a.y >= pc.hub.yBot - 0.01)) return;
          var hx = b.x - a.x, hz = b.z - a.z;
          /* desce/sobe DENTRO da caixa (vertical): a direção é a do trecho que segue da outra ponta */
          if (Math.sqrt(hx * hx + hz * hz) < 0.01) trechos.forEach(function (t2) { if (t2 === t || Math.sqrt(hx * hx + hz * hz) >= 0.01) return; [["p1", "p2"], ["p2", "p1"]].forEach(function (e2) { if (dist(t2[e2[0]], b) <= 0.02) { hx = t2[e2[1]].x - b.x; hz = t2[e2[1]].z - b.z; } }); });
          if (Math.sqrt(hx * hx + hz * hz) >= 0.01) lig.push({ dir: un({ x: hx, y: 0, z: hz }), sai: e[0] === "p1" });
        });
      });
      var saiu = lig.filter(function (l) { return l.sai; })[0], dS = saiu ? saiu.dir : { x: 1, y: 0, z: 0 };
      var dirs = [dS, { x: -dS.z, y: 0, z: dS.x }, { x: -dS.x, y: 0, z: -dS.z }, { x: dS.z, y: 0, z: -dS.x }];
      var yE = r4(pc.y - Math.min(0.06, h * 0.35)), yS = r4(pc.y - Math.max(0.06, h - 0.05));   /* entradas logo abaixo da grelha; a saída embaixo (a conferir no catálogo) */
      dirs.forEach(function (d, i) {
        var ocupado = lig.some(function (l) { return l.dir.x * d.x + l.dir.z * d.z > 0.7; });
        out.push({ tipo: "peca", id: pc.id, x: r4(pc.x + d.x * r), y: i === 0 ? yS : yE, z: r4(pc.z + d.z * r), dir: d, sistema: pc.sistema, dn: 0, fluxo: i === 0 ? "saida" : "entrada", livre: !ocupado, nome: (i === 0 ? "Saída" : "Entrada") + " da " + (P.nome || "peça").toLowerCase() });
      });
      return out;
    }
    /* 3) tubo: as duas pontas (a livre com "+"), entrada na de montante e saída na de jusante */
    var t = trechos.filter(function (x) { return x.id === id; })[0];
    if (t) {
      var livres = R.pontasLivres.filter(function (q) { return q.trecho === t.id; }), grav = I.SISTEMAS[t.sistema] && I.SISTEMAS[t.sistema].gravidade;
      [["p1", "p2"], ["p2", "p1"]].forEach(function (e) {
        var a = t[e[0]], b = t[e[1]], liv = livres.some(function (q) { return dist(q, a) <= 0.02; });
        out.push({ tipo: "ponta", trecho: t.id, x: a.x, y: a.y, z: a.z, dir: un({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), sistema: t.sistema, dn: t.dn, fluxo: grav ? (e[0] === "p1" ? "entrada" : "saida") : "", livre: liv, nome: "Ponta " + (e[0] === "p1" ? "inicial" : "final") + " de " + t.id });
      });
      return out;
    }
    /* 4) conexão: o nó (ligado) */
    var cx = R.conexoes.filter(function (c) { return c.id === id; })[0];
    if (cx) out.push({ tipo: "no", x: cx.x, y: cx.y, z: cx.z, dir: { x: 0, y: 1, z: 0 }, sistema: cx.sistema, dn: cx.dn, fluxo: "", livre: false, nome: cx.nome });
    return out;
  }

  /* da vista ativa: planta (x, z) ou corte (U ao longo do corte, −y) — o mesmo do BIM.vista2d */
  function noDesenho(def, p) {
    if (!def) return null;
    if (def.tipo === "planta") return def.p6 === "forro" || def.p6base === "forro" ? { x: -p.x, y: p.z } : { x: p.x, y: p.z };
    if (def.corte) def = def.corte;   /* o def do Bim2D traz o corte dentro */
    var ax = +def.ax, az = +def.az, dx = (+def.bx) - ax, dz = (+def.bz) - az, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.05)) return null;
    var nx = dz / L, nz = -dx / L; if (def.inv) { nx = -nx; nz = -nz; }
    return { x: (p.x - ax) * (-nz) + (p.z - az) * nx, y: -p.y };
  }
  /* o inverso no corte: o ponto do desenho → o mundo, no plano do corte */
  function doDesenho(def, q) {
    if (!def || def.tipo === "planta") return null;
    if (def.corte) def = def.corte;
    var ax = +def.ax, az = +def.az, dx = (+def.bx) - ax, dz = (+def.bz) - az, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.05)) return null;
    var nx = dz / L, nz = -dx / L; if (def.inv) { nx = -nx; nz = -nz; }
    return { x: r4(ax + q.x * (-nz)), y: r4(-q.y), z: r4(az + q.x * nx) };
  }

  /* ================================================================ MODELAR NO CORTE PARTINDO DA PEÇA (18/10/2026)
   * Pedido do Rogério: "num corte, passo o mouse em cima de um tubo, conexão ou qualquer coisa e ele já tem que começar
   * a criar dali"; "por causa do plano de referência, que está mais para frente, eu modelo e não vejo a peça; quando vou
   * ver, ela não está conectada". O clique no corte virava um ponto NO PLANO DO CORTE (profundidade 0) e o alvo era
   * procurado pela distância EM PLANTA — o tubo visível 1,35 m atrás não era achado e o novo nascia na frente dele.
   * Agora a peça é procurada NA PROJEÇÃO DO CORTE (a distância no desenho), dentro da faixa de vista, e a PROFUNDIDADE
   * do plano de trabalho passa a ser a do eixo dela. */
  /* o quadro do corte: a origem (ax, az), a normal de vista (o lado que se vê) e a profundidade (null = tudo) */
  function quadro(def) {
    if (!def || def.tipo === "planta") return null;
    var d = def.corte || def, ax = +d.ax, az = +d.az, dx = (+d.bx) - ax, dz = (+d.bz) - az, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.05)) return null;
    var nx = dz / L, nz = -dx / L; if (d.inv) { nx = -nx; nz = -nz; }
    return { ax: ax, az: az, nx: nx, nz: nz, prof: +d.prof > 0 ? +d.prof : null };
  }
  /* a profundidade de um ponto do mundo atrás do plano do corte (a mesma conta do BIM.vista2d: visível de 0 a prof) */
  function profundidade(def, p) { var Q = quadro(def); return Q && p ? r4((p.x - Q.ax) * Q.nx + (p.z - Q.az) * Q.nz) : null; }
  /* o ponto do desenho → o mundo, no plano paralelo ao corte a `t` m de profundidade */
  function noPlano(def, q, t) { var w = doDesenho(def, q), Q = quadro(def); if (!w || !Q) return null; t = +t || 0; return { x: r4(w.x + Q.nx * t), y: w.y, z: r4(w.z + Q.nz * t) }; }
  /* um tubo de raio r no plano t fica INTEIRO dentro da faixa de vista? (no plano do corte ele é cortado ao meio) */
  function naFaixa(def, t, r) { var Q = quadro(def); if (!Q) return true; r = +r || 0; return t >= r - 1e-6 && (Q.prof == null || t <= Q.prof - r + 1e-6); }
  /* a peça de instalação sob o ponto q do desenho (corte/elevação): ponto de louça, ponta, meio (ou tubo vertical na
     altura do cursor), caixa — a mais perto NO DESENHO, só o que a vista mostra; empate: a da frente. opts.sistema
     filtra (ligar só no mesmo sistema), opts.tol em metros do desenho. → { alvo, P, t, rotulo, d } | null */
  function pickCorte(estado, avaliarFam, def, q, opts) {
    opts = opts || {};
    var I = BI(), Q = quadro(def); if (!I || !Q || !q) return null;
    var tol = num(opts.tol, 0.1), sis = opts.sistema || null, ins = (estado && estado.instalacoes) || { trechos: [], pecas: [] }, melhor = null;
    function prof(P) { return (P.x - Q.ax) * Q.nx + (P.z - Q.az) * Q.nz; }
    function visivel(t) { return t >= -0.02 && (Q.prof == null || t <= Q.prof + 0.02); }
    function d2(P) { var a = noDesenho(def, P); return a ? Math.sqrt((a.x - q.x) * (a.x - q.x) + (a.y - q.y) * (a.y - q.y)) : Infinity; }
    function ver(alvo, P, d, prio, rot, folga) {
      var t = prof(P); if (!visivel(t) || d > tol + (folga || 0)) return;
      var nota = d + prio * 0.2 * tol;
      if (!melhor || nota < melhor.nota - 1e-9 || (Math.abs(nota - melhor.nota) <= 1e-9 && t < melhor.t)) melhor = { alvo: alvo, P: { x: r4(P.x), y: r4(P.y), z: r4(P.z) }, t: r4(t), rotulo: rot, d: d, nota: nota };
    }
    I.conectoresDoEstado(estado, avaliarFam).forEach(function (k) {
      if (sis && k.sistema !== sis) return;
      ver({ tipo: "aparelho", x: k.x, y: k.y, z: k.z, dn: k.dn, nome: k.nome, famInst: k.famInst, parede: k.parede || null }, k, d2(k), 0, "ponto " + (k.nome || "do aparelho"));
    });
    arr(ins.trechos).forEach(function (t) {
      if (sis && t.sistema !== sis) return;
      [t.p1, t.p2].forEach(function (p) { ver({ tipo: "ponta", x: p.x, y: p.y, z: p.z, dn: t.dn, trecho: t.id }, p, d2(p), 1, "ponta do tubo " + t.id); });
      var a = noDesenho(def, t.p1), b = noDesenho(def, t.p2); if (!a || !b) return;
      var ux = b.x - a.x, uy = b.y - a.y, L2 = ux * ux + uy * uy; if (!(L2 > 0.03 * 0.03)) return;   /* de frente para a vista: só as pontas */
      var s = ((q.x - a.x) * ux + (q.y - a.y) * uy) / L2; if (s <= 0.02 || s >= 0.98) return;
      var P = { x: t.p1.x + (t.p2.x - t.p1.x) * s, y: t.p1.y + (t.p2.y - t.p1.y) * s, z: t.p1.z + (t.p2.z - t.p1.z) * s };
      var vert = Math.abs(t.p1.x - t.p2.x) < 1e-6 && Math.abs(t.p1.z - t.p2.z) < 1e-6;
      ver(vert ? { tipo: "vertical", x: t.p1.x, y: r4(P.y), z: t.p1.z, dn: t.dn, trecho: t.id } : { tipo: "meio", x: r4(P.x), y: r4(P.y), z: r4(P.z), dn: t.dn, trecho: t.id }, P, d2(P), 3, "eixo do tubo " + t.id);
    });
    arr(ins.pecas).forEach(function (k) {
      if (sis && k.sistema !== sis) return;
      ver({ tipo: "peca", x: k.x, y: k.y, z: k.z, peca: k.peca, id: k.id, hub: k.hub || null }, k, d2(k), 2, (I.PECAS && I.PECAS[k.peca] ? I.PECAS[k.peca].nome.toLowerCase() : "peça") + " " + k.id, k.hub ? k.hub.r || 0 : 0);
    });
    if (melhor) delete melhor.nota;
    return melhor;
  }
  /* a peça mais perto do ponto do desenho, a qualquer distância (o "usar o plano da peça mais próxima") */
  function maisPerto(estado, avaliarFam, def, q, sistema) { return pickCorte(estado, avaliarFam, def, q, { sistema: sistema, tol: 1e9 }); }

  var BimInstCon = {
    VERSAO: 1, pontos: pontos, noDesenho: noDesenho, doDesenho: doDesenho,
    quadro: quadro, profundidade: profundidade, noPlano: noPlano, naFaixa: naFaixa, pickCorte: pickCorte, maisPerto: maisPerto,
    _uid: null, _marcas: [], _laco: null, _el: null,

    /* o gancho do js/bim.js (selAplicar): a seleção mudou */
    aoSelecionar: function (uids) {
      var u = arr(uids).length === 1 ? uids[0] : null, U0 = global.BimInstUI;
      if (U0 && U0._previaHidro && !U0._previaHidro()) u = null;   /* P8 (junção 18/10/2026): os conectores à vista só com a prévia hidro */
      this._uid = u && /^edit:/.test(u) ? u : null;
      this.atualizar();
    },
    atualizar: function () {
      var b = B(), e = b && b.editarEstado ? b.editarEstado() : null;
      this._marcas = this._uid && e && e.estado ? pontos(e.estado, function (f, t, i) { return b.familiaAvaliar(f, t, i); }, this._uid) : [];
      /* ARRASTAR O TUBO (js/biminstarr.js): a ALÇA no meio do tubo selecionado */
      var idT = this._uid ? this._uid.slice(5) : null, tS = idT && e && e.estado && e.estado.instalacoes ? (e.estado.instalacoes.trechos || []).filter(function (t) { return t.id === idT; })[0] : null;
      if (tS && global.BimInstArr) this._marcas.push({ alca: "mover", x: (tS.p1.x + tS.p2.x) / 2, y: (tS.p1.y + tS.p2.y) / 2, z: (tS.p1.z + tS.p2.z) / 2, sistema: tS.sistema, nome: "Arrastar o tubo (a rede acompanha)", livre: false });
      this.desenhar();
      var self = this;
      if (this._marcas.length && !this._laco && typeof requestAnimationFrame === "function") {
        var passo = function () { if (!self._marcas.length) { self._laco = null; return; } self.posicionar(); self._laco = requestAnimationFrame(passo); };
        this._laco = requestAnimationFrame(passo);
      }
    },
    /* a projeção da vista ativa: 3D (BIM.telaDe) ou 2D (o SVG da planta/corte) */
    _projetor: function () {
      if (typeof document === "undefined") return null;
      var tela = document.querySelector('.bim-tela[data-ativa="1"]'), vis = tela ? tela.getAttribute("data-vista") : "3d", b = B(), D = global.Bim2D;
      if (vis && vis !== "3d" && D && D._cache && D._cache[vis]) {
        var c = D._cache[vis], sv = c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null), def = D.def ? D.def(vis) : null;
        if (!sv || !sv.getScreenCTM || !def) return null;
        var ctm = sv.getScreenCTM(); if (!ctm) return null;
        return function (p) { var d = noDesenho(def, p); if (!d) return null; var pt = sv.createSVGPoint(); pt.x = d.x; pt.y = d.y; var q = pt.matrixTransform(ctm); return { x: q.x, y: q.y }; };
      }
      return b && b.telaDe ? function (p) { var q = b.telaDe(p.x, p.y, p.z); return q && !q.atras ? q : null; } : null;
    },
    desenhar: function () {
      if (typeof document === "undefined") return;
      if (!this._el) { this._el = document.createElement("div"); this._el.className = "bim-inst-con"; this._el.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:40;pointer-events:none"; document.body.appendChild(this._el); }
      var self = this, I = BI();
      this._el.innerHTML = ""; this._sigPos = null;
      this._marcas.forEach(function (m, i) {
        var cor = I && I.SISTEMAS[m.sistema] ? I.SISTEMAS[m.sistema].cor : "#2d6a9c", bt = document.createElement(m.livre || m.alca ? "button" : "span");
        if (m.alca) {
          bt.type = "button"; bt.setAttribute("data-inst-con", String(i)); bt.setAttribute("data-inst-mover", "1"); bt.title = m.nome;
          bt.style.cssText = "position:absolute;pointer-events:auto;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:4px;border:2px solid " + cor + ";background:#fff;color:" + cor + ";font:700 13px/14px sans-serif;padding:0;cursor:move;box-shadow:0 1px 3px rgba(0,0,0,.35)";
          bt.textContent = "✥";
          bt.onpointerdown = function (ev) { if (ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation(); if (global.BimInstArr) global.BimInstArr.iniciarAlca(self._uid, ev, { x: m.x, y: m.y, z: m.z }); };
          self._el.appendChild(bt); return;
        }
        bt.setAttribute("data-inst-con", String(i)); bt.setAttribute("data-livre", m.livre ? "1" : "0"); bt.setAttribute("data-fluxo", m.fluxo || "");
        bt.title = m.nome + (m.livre ? " — clique para sair dele com o tubo (" + (m.fluxo === "entrada" ? "entrada" : (m.fluxo === "saida" ? "saída" : "ponto")) + ")" : " — ligado");
        if (m.livre) {
          bt.type = "button";
          bt.style.cssText = "position:absolute;pointer-events:auto;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid " + cor + ";background:#fff;color:" + cor + ";font:700 15px/16px sans-serif;padding:0;cursor:crosshair;box-shadow:0 1px 3px rgba(0,0,0,.35)";
          bt.innerHTML = '+<span data-seta style="position:absolute;left:50%;top:50%;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ' + cor + ';transform-origin:50% 0"></span>' +
            (m.fluxo ? '<span style="position:absolute;right:-12px;top:-10px;font:700 9px sans-serif;color:' + cor + ';background:#fff;border-radius:3px;padding:0 2px">' + (m.fluxo === "entrada" ? "E" : "S") + "</span>" : "");
          bt.onmousedown = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
          bt.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); self.iniciar(i); };
        } else bt.style.cssText = "position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:" + cor + ";opacity:.75";
        self._el.appendChild(bt);
      });
      this.posicionar();
    },
    /* FLUIDEZ (17/10/2026): roda A CADA QUADRO com uma peça selecionada. Antes lia a posição da tela (getBoundingClientRect
       / getScreenCTM) e escrevia o estilo marca a marca — cada leitura forçava o navegador a recalcular a página inteira
       (o 3D caía para ~30 quadros por segundo com um tubo selecionado). Agora: todas as leituras, depois todas as
       escritas, e nenhuma escrita quando nada mudou (câmera parada). */
    posicionar: function () {
      if (!this._el) return;
      var pr = this._projetor(), self = this, els = [].slice.call(this._el.children), pos = [], sig = "";
      els.forEach(function (el) {
        var m = self._marcas[+el.getAttribute("data-inst-con")], q = m && pr ? pr(m) : null, ang = null;
        if (q && m.dir && el.querySelector && el.querySelector("[data-seta]")) {
          var q2 = pr({ x: m.x + m.dir.x * 0.2, y: m.y + m.dir.y * 0.2, z: m.z + m.dir.z * 0.2 });
          ang = q2 ? Math.atan2(q2.y - q.y, q2.x - q.x) * 180 / Math.PI + 90 : 0;
        }
        pos.push({ q: q, ang: ang });
        sig += q ? (Math.round(q.x * 2) + "," + Math.round(q.y * 2) + "," + (ang == null ? "" : Math.round(ang)) + ";") : "-;";
      });
      if (sig === this._sigPos && els.length === this._nPos) return;
      this._sigPos = sig; this._nPos = els.length;
      els.forEach(function (el, i) {
        var q = pos[i].q;
        if (!q) { el.style.display = "none"; return; }
        el.style.display = ""; el.style.left = q.x + "px"; el.style.top = q.y + "px";
        if (pos[i].ang != null) { var seta = el.querySelector("[data-seta]"); if (seta) seta.style.transform = "translate(-50%,-50%) rotate(" + pos[i].ang + "deg) translateY(-16px)"; }
      });
    },
    /* o "+": arma o Tubo com o sistema e o DN do ponto e começa nele (de uma ENTRADA, desenha-se para montante) */
    iniciar: function (i) {
      var m = this._marcas[i], U = global.BimInstUI, I = BI(); if (!m || !U || !I) return false;
      U.armar("tubo", { sistema: m.sistema });
      var c = U.cfg, M = I.MATERIAIS[c.material];
      if (m.dn > 0 && M && arr(M.dns).indexOf(m.dn) >= 0) U.mudarCfg("i:dn", m.dn);
      var ctx = U._ctx(); if (!ctx) return false;
      U.clique(ctx, { x: m.x, y: m.y, z: m.z }, { _doConector: true });
      if (m.fluxo === "entrada" && I.SISTEMAS[m.sistema] && I.SISTEMAS[m.sistema].gravidade && m.tipo !== "conector") U._sobe = true;   /* da ENTRADA da caixa/ponta de montante: desenha para montante */
      this._marcas = []; this.desenhar();
      return true;
    }
  };
  global.BimInstCon = BimInstCon;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstCon;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

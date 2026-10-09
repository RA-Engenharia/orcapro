/* =====================================================================
 * bimplano.js — PLANO DE TRABALHO do modelador BIM (motor puro, ES5).
 *
 * Pedido do Rogério (09/10/2026): os comandos que estavam "em breve" na
 * fita têm de ficar prontos. Este é o "Plano de trabalho" (Arquitetura ›
 * Referência): o plano onde o próximo elemento é desenhado.
 *
 * COMO SE DEFINE (definir(def)):
 *   {tipo:"nivel", nivel:{id, nome, elevacao}, desloc}   horizontal na elevação
 *                                                        do nível + deslocamento
 *   {tipo:"face", ponto:[x,y,z], normal:[x,y,z], rotulo?, elementoId?}
 *                                                        a face plana clicada
 *                                                        (laje, parede, volume)
 *   {tipo:"linha", a:[x,z], b:[x,z], y?, rotulo?}        plano VERTICAL pela
 *                                                        linha (eixo da grade
 *                                                        ou linha de referência)
 *   {tipo:"elemento", caixa}                             "pegar plano de
 *                                                        trabalho" de uma peça:
 *                                                        laje/pilar/viga = topo;
 *                                                        parede = plano vertical
 *                                                        pelo eixo; volume por
 *                                                        extrusão = o plano dele
 *   null / {tipo:null}                                   volta ao padrão (o
 *                                                        nível ativo do editor)
 *
 * O QUE O RESTO DO BIM CONSOME (a outra frente — barra de opções e
 * modelagem na planta — usa as mesmas três):
 *   ativo()            o plano definido ou null (null = o padrão de sempre)
 *   definir(def)       → { ok, plano } | { ok:false, erro }
 *   pontoNoPlano(raio) raio {origem:[x,y,z], direcao:[x,y,z]} → [x,y,z] | null
 * e ainda: alturaBase() (y do plano horizontal — vira a base do editor),
 * planoVolume() ({o,u,v} no formato do js/bimvolume.js), paraPlano/doPlano,
 * deslocDoNivel(nivel), rotulo() (barra de status), grade(on) (mostrar a
 * grade) e ouvir(fn) (avisa quem desenha a grade e a barra de status).
 *
 * REGRAS DA CASA
 *   · Coordenadas da CENA (three.js Y para cima, metros) — as mesmas do
 *     editor (js/bim.js editPontoPlano).
 *   · Face quase horizontal (|ny| > 0,98) vira plano horizontal exato; quase
 *     vertical (|ny| < 0,02) vira vertical exato. Face INCLINADA é recusada
 *     com o motivo: as ferramentas do editor desenham na horizontal ou na
 *     vertical, e um plano que elas não sabem usar seria um plano que mente.
 *   · O plano é do aparelho e da sessão (memória): não vai para a lista de
 *     operações do modelo nem para a nuvem.
 *
 * Teste: node tools/test-bimplano.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL_H = 0.98, TOL_V = 0.02;

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function v3(p) { return Array.isArray(p) && p.length >= 3 && fin(+p[0]) && fin(+p[1]) && fin(+p[2]) ? [+p[0], +p[1], +p[2]] : null; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function fmt(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2).replace(".", ","); }
  function txt(v) { return v == null ? "" : String(v); }

  /* o plano HORIZONTAL na altura y: o mesmo referencial do js/bimvolume.js
     (planoHorizontal): u = +X, v = −Z, normal = +Y — o contorno de sempre
     ([x, −z]) continua valendo */
  function horizontal(y) { return { o: [0, r6(y), 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] }; }
  /* o plano VERTICAL pela reta a→b (no chão), na base y: u = a→b, v = +Y */
  function vertical(a, b, y) {
    var u = norm([b[0] - a[0], 0, b[1] - a[1]]); if (!u) return null;
    var o = [r6(a[0]), r6(num(y, 0)), r6(a[1])], v = [0, 1, 0];
    return { o: o, u: [r6(u[0]), 0, r6(u[2])], v: v, n: cross([r6(u[0]), 0, r6(u[2])], v) };
  }

  var st = { plano: null, grade: true, ouvintes: [] };

  function avisar() {
    var p = BimPlano.ativo();
    st.ouvintes.slice().forEach(function (fn) { try { fn(p); } catch (e) {} });
  }

  /* o plano de uma face: ponto + normal (o que o clique no 3D dá) */
  function deFace(ponto, normal) {
    var p = v3(ponto), n = v3(normal);
    if (!p || !n) return { erro: "Clique numa face plana de uma peça (laje, parede, volume)." };
    n = norm(n); if (!n) return { erro: "A face clicada não tem direção definida." };
    if (Math.abs(n[1]) >= TOL_H) return { pl: horizontal(p[1]), horiz: true };
    if (Math.abs(n[1]) <= TOL_V) {
      /* vertical: u na horizontal, ao longo da face (n × Y), v = +Y */
      var u = norm(cross([0, 1, 0], [n[0], 0, n[2]]));
      if (!u) return { erro: "A face clicada não tem direção definida." };
      return { pl: { o: [r6(p[0]), r6(p[1]), r6(p[2])], u: [r6(u[0]), 0, r6(u[2])], v: [0, 1, 0], n: cross([r6(u[0]), 0, r6(u[2])], [0, 1, 0]) }, horiz: false };
    }
    return { erro: "Face inclinada: o plano de trabalho é horizontal ou vertical. Escolha uma face horizontal (topo da laje) ou vertical (face da parede)." };
  }

  /* o plano de uma peça do editor ("pegar plano de trabalho") */
  function deElemento(c) {
    if (!c || typeof c !== "object") return { erro: "Clique numa peça criada no OrçaPRO." };
    if (c.tipo === "parede") {
      var L = num(c.comprimento, 0), co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0));
      if (!(L > 0)) return { erro: "Parede sem comprimento." };
      var cx = num(c.cx, 0), cz = num(c.cz, 0), y0 = num(c.cy, 0) - num(c.altura, 0) / 2;
      /* o mesmo referencial do js/bimarq.js (frameDe/aMundo): u ao longo do eixo */
      var a = [cx - L / 2 * co, cz + L / 2 * si], b = [cx + L / 2 * co, cz - L / 2 * si];
      var pl = vertical(a, b, y0); if (!pl) return { erro: "Parede sem comprimento." };
      return { pl: pl, horiz: false, rotulo: "eixo da parede " + txt(c.id) };
    }
    if (c.tipo === "laje" || c.tipo === "pilar" || c.tipo === "viga") {
      var topo = num(c.cy, 0) + num(c.altura, 0) / 2;
      return { pl: horizontal(topo), horiz: true, rotulo: "topo " + ({ laje: "da laje", pilar: "do pilar", viga: "da viga" })[c.tipo] + " " + txt(c.id) };
    }
    /* volume por extrusão: o plano em que o contorno foi desenhado */
    var rec = c.receita || (c.volume && c.volume.receita);
    if (rec && rec.forma === "extrusao" && rec.plano) {
      var o = v3(rec.plano.o), u = v3(rec.plano.u), v = v3(rec.plano.v);
      if (o && u && v) {
        var n = norm(cross(u, v));
        if (n) { var r = deFace(o, n); if (r.pl) { r.rotulo = "plano do volume " + txt(c.id); return r; } return r; }
      }
    }
    return { erro: "Esta peça não tem plano de trabalho: use uma laje, parede, pilar, viga ou volume por extrusão." };
  }

  var BimPlano = {
    VERSAO: 1,
    horizontal: horizontal, vertical: vertical, deFace: deFace, deElemento: deElemento,

    /* o plano definido, ou null (= o padrão: o nível ativo do editor) */
    ativo: function () {
      var p = st.plano; if (!p) return null;
      return JSON.parse(JSON.stringify(p));
    },
    horizontalAtivo: function () { return !!(st.plano && st.plano.horizontal); },

    definir: function (def) {
      if (def == null || def.tipo == null) { st.plano = null; avisar(); return { ok: true, plano: null }; }
      var r = null, rot = "", meta = {};
      if (def.tipo === "nivel") {
        var nv = def.nivel || {}, el = num(nv.elevacao, NaN), d = num(def.desloc, 0);
        if (!fin(el)) return { ok: false, erro: "Escolha um nível com elevação." };
        if (Math.abs(d) > 200) return { ok: false, erro: "Deslocamento fora da faixa (até 200 m)." };
        r = { pl: horizontal(el + d), horiz: true };
        rot = "nível " + (txt(nv.nome) || "sem nome") + (Math.abs(d) > 1e-9 ? (d > 0 ? " + " : " − ") + fmt(Math.abs(d)) + " m" : "");
        meta = { nivelId: nv.id != null ? String(nv.id) : null, desloc: r6(d), elevacaoNivel: r6(el) };
      } else if (def.tipo === "face") {
        r = deFace(def.ponto, def.normal);
        if (r.pl) rot = txt(def.rotulo) || (r.horiz ? "face horizontal" : "face vertical");
        if (def.elementoId != null) meta.elementoId = String(def.elementoId);
      } else if (def.tipo === "linha") {
        var a = Array.isArray(def.a) && fin(+def.a[0]) && fin(+def.a[1]) ? [+def.a[0], +def.a[1]] : null;
        var b = Array.isArray(def.b) && fin(+def.b[0]) && fin(+def.b[1]) ? [+def.b[0], +def.b[1]] : null;
        if (!a || !b) return { ok: false, erro: "A linha precisa de dois pontos." };
        if (Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)) < 0.05) return { ok: false, erro: "Os dois pontos da linha estão perto demais (mínimo 5 cm)." };
        var pv = vertical(a, b, num(def.y, 0));
        r = { pl: pv, horiz: false };
        rot = txt(def.rotulo) || "linha de referência";
      } else if (def.tipo === "elemento") {
        r = deElemento(def.caixa);
        if (r.pl) rot = r.rotulo;
        if (def.caixa && def.caixa.id != null) meta.elementoId = String(def.caixa.id);
      } else return { ok: false, erro: "Tipo de plano desconhecido: " + txt(def.tipo) + "." };
      if (!r || !r.pl) return { ok: false, erro: (r && r.erro) || "Não consegui definir o plano." };
      var p = { tipo: def.tipo, horizontal: !!r.horiz, o: r.pl.o, u: r.pl.u, v: r.pl.v, n: r.pl.n, rotulo: rot };
      Object.keys(meta).forEach(function (k) { p[k] = meta[k]; });
      st.plano = p;
      avisar();
      return { ok: true, plano: BimPlano.ativo() };
    },
    limpar: function () { return this.definir(null); },

    /* a base do editor (y) quando o plano é horizontal; null nos outros casos */
    alturaBase: function () { return st.plano && st.plano.horizontal ? st.plano.o[1] : null; },
    /* quanto o plano horizontal está acima do nível dado (restrição da base
       das peças presas a nível: "Deslocamento da base") */
    deslocDoNivel: function (nivel) {
      var y = this.alturaBase(); if (y == null || !nivel || !fin(+nivel.elevacao)) return 0;
      return r6(y - +nivel.elevacao);
    },

    /* o ponto do raio no plano ativo: { origem:[x,y,z], direcao:[x,y,z] } → [x,y,z]
       null se não há plano, se o raio corre paralelo ao plano ou se o plano
       ficou atrás de quem olha */
    pontoNoPlano: function (raio, plano) {
      var p = plano || st.plano; if (!p || !raio) return null;
      var o = v3(raio.origem), d = v3(raio.direcao); if (!o || !d) return null;
      var den = dot(p.n, d); if (Math.abs(den) < 1e-9) return null;
      var t = dot(p.n, sub(p.o, o)) / den; if (t < 0) return null;
      var q = add(o, mul(d, t));
      return [r6(q[0]), r6(q[1]), r6(q[2])];
    },
    /* o plano no formato do js/bimvolume.js ({o, u, v}); null sem plano */
    planoVolume: function () { var p = st.plano; return p ? { o: p.o.slice(), u: p.u.slice(), v: p.v.slice() } : null; },
    paraPlano: function (q, plano) { var p = plano || st.plano; if (!p) return null; var d = sub(q, p.o); return [r6(dot(d, p.u)), r6(dot(d, p.v))]; },
    doPlano: function (ab, plano) { var p = plano || st.plano; if (!p) return null; var q = add(p.o, add(mul(p.u, ab[0]), mul(p.v, ab[1]))); return [r6(q[0]), r6(q[1]), r6(q[2])]; },

    /* o que a barra de status mostra */
    rotulo: function () {
      var p = st.plano;
      if (!p) return "Plano: nível ativo";
      return "Plano: " + p.rotulo + (p.horizontal ? " (y = " + fmt(p.o[1]) + " m)" : " (vertical)");
    },
    /* mostrar/ocultar a grade do plano no 3D */
    grade: function (on) {
      if (on != null && !!on !== st.grade) { st.grade = !!on; avisar(); }
      return st.grade;
    },
    /* quem desenha (a grade no 3D, a barra de status, a barra de opções) */
    ouvir: function (fn) {
      if (typeof fn !== "function") return function () {};
      st.ouvintes.push(fn);
      return function () { st.ouvintes = st.ouvintes.filter(function (x) { return x !== fn; }); };
    },
    /* só para o teste: zera o estado do módulo */
    _zerar: function () { st.plano = null; st.grade = true; st.ouvintes = []; }
  };

  global.BimPlano = BimPlano;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPlano;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

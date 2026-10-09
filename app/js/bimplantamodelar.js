/* =====================================================================
 * bimplantamodelar.js — MODELAR NA PLANTA BAIXA (prévia do modelador,
 * 09/10/2026).
 *
 * Pedido do Rogério: "a maioria dos projetistas modelam na planta baixa, na
 * vista de piso, olhando de cima e com a vista travada para não ficar mexendo
 * com a modelagem 3D. Depois que a modelagem está pronta, aqui e acolá usa
 * comandos no 3D. Mas parede, janela, cota, tudo é pela planta. Hoje, quando
 * eu coloco na planta baixa, não pega as ferramentas. Precisa pegar."
 *
 * COMO FUNCIONA
 *   A planta é o desenho vetorial (SVG) da aba de vista (js/bim2dui.js): a
 *   coordenada do desenho É a do mundo (x do desenho = x, y do desenho = z).
 *   Com uma ferramenta do editor armada (parede, porta/janela, laje, forro,
 *   pilar, viga, escada, rampa, guarda-corpo, eixo…), o clique na planta:
 *     1) acha o ponto com os SNAPS do js/bimprecisao.js (ponto final, meio,
 *        interseção, perpendicular, extensão, grade) sobre o que foi
 *        modelado E sobre as linhas do próprio desenho (o IFC importado);
 *     2) aplica o ORTOGONAL e os INCREMENTOS DE ÂNGULO da barra de opções
 *        (js/bimbarraopcoes.js) — o snap de ponto ganha da trava;
 *     3) entrega o ponto ao editor de sempre (BIM.planta2d().clique → a mesma
 *        editClique do 3D, as mesmas ops, o mesmo Ctrl+Z).
 *   O que nasce aparece na hora no 3D; a planta se refaz pelo modelo (o
 *   gancho P2-D já re-extrai as plantas abertas a cada op).
 *   Cota, texto e linhas continuam sendo da P7 (js/bimanot2dui.js), e
 *   Ambiente/Separador da P2-D (js/bimambienteui.js) — elas já moram na planta.
 *
 * AS FORMAS (grupo "Desenhar" da barra)
 *   O CONTRATO com a outra frente é o js/bimdesenho.js:
 *     BimDesenho.ferramentas(alvo) → [{id, rotulo, icone, dica, pontos: n | "livre"}]
 *     BimDesenho.gerar(id, pontos, opcoes) / .previa(id, parciais, cursor, opcoes)
 *       → {segmentos: [{tipo:"reta", a, b} | {tipo:"arco", a, b, m}], fechado}
 *   Aqui se coletam os cliques (com snaps e ângulo), desenha-se a prévia (na
 *   planta e no 3D) e, no fim, as peças nascem dos segmentos numa op só
 *   (lote): um Ctrl+Z desfaz a forma inteira. Enquanto o js/bimdesenho.js não
 *   chega, vale o DUBLÊ abaixo (só "linha" e "retângulo"), atrás do mesmo
 *   contrato — ⚠ O REAL ENTRA EM `desenho()`.
 * ===================================================================== */
(function (global) {
  "use strict";

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function P(x, z) { return { x: x, z: z }; }
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function fmt(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  var TAU = Math.PI * 2;

  /* =================================================================
   * PURO — geometria das formas (Node-testável)
   * ================================================================= */
  /* círculo pelos três pontos (null se alinhados) */
  function circulo3(a, m, b) {
    var ax = a.x, az = a.z, bx = m.x, bz = m.z, cx = b.x, cz = b.z;
    var d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
    if (Math.abs(d) < 1e-12) return null;
    var a2 = ax * ax + az * az, b2 = bx * bx + bz * bz, c2 = cx * cx + cz * cz;
    var ux = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d, uz = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { c: P(ux, uz), r: dist(P(ux, uz), a) };
  }
  function normT(t) { while (t < 0) t += TAU; while (t >= TAU) t -= TAU; return t; }
  /* o arco a → m → b em pontos (passo em graus); pontas exatas */
  function amostrarArco(a, m, b, passoGraus) {
    var C = circulo3(a, m, b); if (!C) return [P(a.x, a.z), P(b.x, b.z)];
    var t0 = Math.atan2(a.z - C.c.z, a.x - C.c.x), tm = Math.atan2(m.z - C.c.z, m.x - C.c.x), t1 = Math.atan2(b.z - C.c.z, b.x - C.c.x);
    var d1 = normT(t1 - t0), dm = normT(tm - t0), varre = dm <= d1 ? d1 : d1 - TAU;
    if (Math.abs(d1) < 1e-12) varre = dm > 0 ? TAU : -TAU;   /* círculo fechado (a = b) */
    var n = Math.max(2, Math.ceil(Math.abs(varre) / ((passoGraus > 0 ? passoGraus : 10) * Math.PI / 180))), out = [];
    for (var i = 0; i <= n; i++) { var t = t0 + varre * i / n; out.push(P(C.c.x + C.r * Math.cos(t), C.c.z + C.r * Math.sin(t))); }
    out[0] = P(a.x, a.z); out[n] = P(b.x, b.z);
    return out;
  }
  /* segmentos → polilinha (arcos em pontos); sem o ponto repetido da emenda */
  function amostrar(segs, passoGraus) {
    var out = [];
    function por(p) { if (!out.length || dist(out[out.length - 1], p) > 1e-6) out.push(P(p.x, p.z)); }
    (segs || []).forEach(function (s) {
      if (!s || !s.a || !s.b) return;
      if (s.tipo === "arco" && s.m) amostrarArco(s.a, s.m, s.b, passoGraus).forEach(por);
      else { por(s.a); por(s.b); }
    });
    return out;
  }
  /* arcos viram cordas (viga e eixo são retos) */
  function emRetas(segs, passoGraus) {
    var out = [];
    (segs || []).forEach(function (s) {
      if (!s || !s.a || !s.b) return;
      if (s.tipo === "arco" && s.m) { var q = amostrarArco(s.a, s.m, s.b, passoGraus); for (var i = 1; i < q.length; i++) out.push({ tipo: "reta", a: q[i - 1], b: q[i] }); }
      else out.push({ tipo: "reta", a: P(s.a.x, s.a.z), b: P(s.b.x, s.b.z) });
    });
    return out;
  }
  function retasDe(pts, fechado) {
    var out = [];
    for (var i = 0; i + 1 < pts.length; i++) if (dist(pts[i], pts[i + 1]) > 1e-6) out.push({ tipo: "reta", a: pts[i], b: pts[i + 1] });
    if (fechado && pts.length >= 3 && dist(pts[pts.length - 1], pts[0]) > 1e-6) out.push({ tipo: "reta", a: pts[pts.length - 1], b: pts[0] });
    return out;
  }
  /* DESLOCAMENTO da polilinha: cada lado anda `d` para a ESQUERDA de quem desenha (olhando a
     planta), e os cantos se encontram na meia-esquadria (o canto fecha, sem fresta nem sobra) */
  function deslocar(pts, fechado, d) {
    var n = pts.length; if (n < 2 || !fin(d) || Math.abs(d) < 1e-12) return pts.map(function (p) { return P(p.x, p.z); });
    var L = [];   /* linhas deslocadas: ponto + direção */
    var m = fechado ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var a = pts[i], b = pts[(i + 1) % n], len = dist(a, b); if (len < 1e-9) { L.push(null); continue; }
      var ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = uz, nz = -ux;   /* esquerda na tela (y da planta = z) */
      L.push({ o: P(a.x + nx * d, a.z + nz * d), u: P(ux, uz), f: P(b.x + nx * d, b.z + nz * d) });
    }
    function cruza(l1, l2) {
      if (!l1 || !l2) return null;
      var den = l1.u.x * l2.u.z - l1.u.z * l2.u.x; if (Math.abs(den) < 1e-9) return null;
      var rx = l2.o.x - l1.o.x, rz = l2.o.z - l1.o.z, t = (rx * l2.u.z - rz * l2.u.x) / den;
      return P(l1.o.x + l1.u.x * t, l1.o.z + l1.u.z * t);
    }
    var out = [];
    for (var k = 0; k < n; k++) {
      var ant = fechado ? L[(k - 1 + m) % m] : (k > 0 ? L[k - 1] : null), pro = (fechado || k < m) ? L[k % m] : null;
      var q = (ant && pro) ? cruza(ant, pro) : null;
      if (!q) q = pro ? P(pro.o.x, pro.o.z) : (ant ? P(ant.f.x, ant.f.z) : P(pts[k].x, pts[k].z));
      out.push(P(r6(q.x), r6(q.z)));
    }
    return out;
  }
  /* CONCORDÂNCIA (raio) nos cantos da polilinha: o canto vira um arco tangente aos dois lados.
     Canto que não cabe o raio (lado curto demais) fica vivo — e é contado em `semRaio`. */
  function concordar(pts, fechado, raio) {
    var n = pts.length, segs = [], semRaio = 0;
    if (n < 2 || !(raio > 0)) return { segmentos: retasDe(pts, fechado), semRaio: 0 };
    var cantos = [];   /* por vértice: { t1, t2, m } ou null */
    for (var i = 0; i < n; i++) {
      var temAnt = fechado || i > 0, temPro = fechado || i < n - 1;
      if (!temAnt || !temPro) { cantos.push(null); continue; }
      var c = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      var la = dist(a, c), lb = dist(b, c); if (la < 1e-9 || lb < 1e-9) { cantos.push(null); continue; }
      var u1 = P((a.x - c.x) / la, (a.z - c.z) / la), u2 = P((b.x - c.x) / lb, (b.z - c.z) / lb);
      var cosF = Math.max(-1, Math.min(1, u1.x * u2.x + u1.z * u2.z)), phi = Math.acos(cosF);
      if (phi < 1e-3 || Math.PI - phi < 1e-3) { cantos.push(null); continue; }   /* reto (sem canto) ou volta */
      var t = raio / Math.tan(phi / 2);
      /* cabe? cada lado é dividido entre os dois cantos dele: no máximo metade */
      if (t > la / 2 + 1e-9 || t > lb / 2 + 1e-9) { cantos.push(null); semRaio++; continue; }
      var bx = u1.x + u2.x, bz = u1.z + u2.z, bl = Math.sqrt(bx * bx + bz * bz); bx /= bl; bz /= bl;
      var h = raio / Math.sin(phi / 2), C = P(c.x + bx * h, c.z + bz * h);
      cantos.push({ t1: P(r6(c.x + u1.x * t), r6(c.z + u1.z * t)), t2: P(r6(c.x + u2.x * t), r6(c.z + u2.z * t)), m: P(r6(C.x - bx * raio), r6(C.z - bz * raio)) });
    }
    var m = fechado ? n : n - 1;
    for (var k = 0; k < m; k++) {
      var i0 = k, i1 = (k + 1) % n;
      var ini = cantos[i0] ? cantos[i0].t2 : pts[i0], fim = cantos[i1] ? cantos[i1].t1 : pts[i1];
      if (dist(ini, fim) > 1e-6) segs.push({ tipo: "reta", a: P(ini.x, ini.z), b: P(fim.x, fim.z) });
      if (cantos[i1] && (fechado || i1 < n - 1)) segs.push({ tipo: "arco", a: cantos[i1].t1, b: cantos[i1].t2, m: cantos[i1].m });
    }
    return { segmentos: segs, semRaio: semRaio };
  }
  /* a polilinha de uma lista de segmentos RETOS encadeados (null se tem arco ou se não emenda) */
  function polilinha(segs) {
    var pts = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i]; if (s.tipo === "arco") return null;
      if (!pts.length) pts.push(P(s.a.x, s.a.z));
      else if (dist(pts[pts.length - 1], s.a) > 1e-6) return null;
      pts.push(P(s.b.x, s.b.z));
    }
    return pts;
  }
  function pontoEmPoligono(p, pol) {
    var dentro = false;
    for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var a = pol[i], b = pol[j];
      if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / ((b.z - a.z) || 1e-12) + a.x)) dentro = !dentro;
    }
    return dentro;
  }
  function areaPol(pol) { var s = 0; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) s += (pol[j].x + pol[i].x) * (pol[j].z - pol[i].z); return Math.abs(s / 2); }
  function distSeg(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)) : 0;
    return dist(p, P(a.x + dx * t, a.z + dz * t));
  }
  /* tira os pontos do meio de trechos retos (a triangulação do corte deixa vértice no meio da face) */
  function simplificar(pts) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      var cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x), l = dist(a, c);
      if (l > 1e-9 && Math.abs(cr) / l < 2e-4) continue;
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* =================================================================
   * DUBLÊ do js/bimdesenho.js — o MESMO contrato, só "linha" e "retângulo".
   * ⚠ Some sozinho quando o real carrega (ver desenho()).
   * ================================================================= */
  var DUBLE = {
    dubl: true,
    ferramentas: function (alvo) {
      var L = [{ id: "linha", rotulo: "Linha", icone: "linha", dica: "Clique ponto a ponto.", pontos: "livre" }];
      if (alvo !== "eixo" && alvo !== "guarda") L.push({ id: "retangulo", rotulo: "Retângulo", icone: "retangulo", dica: "Dois cantos opostos.", pontos: 2 });
      return L;
    },
    gerar: function (id, pts, o) {
      pts = (pts || []).filter(function (p) { return p && fin(p.x) && fin(p.z); });
      if (id === "retangulo") {
        if (pts.length < 2) return { segmentos: [], fechado: true };
        var a = pts[0], c = pts[1];
        if (Math.abs(c.x - a.x) < 1e-6 || Math.abs(c.z - a.z) < 1e-6) return { segmentos: [], fechado: true };
        return { segmentos: retasDe([P(a.x, a.z), P(c.x, a.z), P(c.x, c.z), P(a.x, c.z)], true), fechado: true };
      }
      return { segmentos: retasDe(pts, false), fechado: false };
    },
    previa: function (id, pts, cur, o) { return this.gerar(id, (pts || []).concat(cur ? [cur] : []), o); }
  };

  /* =================================================================
   * A TELA
   * ================================================================= */
  function previaModelador() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function B() { return global.BIM || null; }
  function BB() { return global.BimBarraOpcoes || null; }
  function Pr() { return global.BimPrecisao || null; }
  function D2() { return global.Bim2D || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var NS = "http://www.w3.org/2000/svg";
  /* ferramentas que aceitam forma (as lineares e as de contorno) */
  var FORMA_SUBS = { parede: 1, viga: 1, laje: 1, furo: 1, forro: 1, guarda: 1, eixo: 1 };
  var CONTORNO = { laje: 1, furo: 1, forro: 1 };
  /* o parâmetro de instância que vira a folha (porta de giro da biblioteca RA) */
  var VIRAR_PARAM = ["Abre_para_fora", "Virar", "Inverter", "Espelhar"];

  var st = { id: null, cur: null, forma: null, geo: null, gk1: null, gk2: null, dig: null, tMov: 0, ultEv: null, texto: "" };

  var BimPlantaModelar = {
    /* puro (testes) */
    circulo3: circulo3, amostrarArco: amostrarArco, amostrar: amostrar, emRetas: emRetas, retasDe: retasDe, deslocar: deslocar, concordar: concordar,
    polilinha: polilinha, pontoEmPoligono: pontoEmPoligono, simplificar: simplificar, DUBLE: DUBLE,

    /* ⚠ CONTRATO: o js/bimdesenho.js real entra AQUI; sem ele, o dublê */
    desenho: function () { var D = global.BimDesenho; return (D && typeof D.ferramentas === "function" && typeof D.gerar === "function") ? D : DUBLE; },
    alvoForma: function (sub) { return sub; },
    /* as ferramentas que desenham por forma (as lineares e as de contorno); o forro automático é um clique */
    aceitaForma: function (sub) {
      if (!FORMA_SUBS[sub]) return false;
      if (sub === "forro") { try { if (global.BimForroUI && global.BimForroUI.cfg().modo !== "contorno") return false; } catch (e) {} }
      return true;
    },
    ativo: function () { return previaModelador() && !!this.api(); },
    api: function () { var b = B(); try { return b && b.planta2d ? b.planta2d() : null; } catch (e) { return null; } },
    /* a ferramenta do editor armada — Ambiente/Separador são da P2-D, que já trabalha na planta */
    ferramenta: function () {
      var a = this.api(); if (!a) return null;
      var t = a.traco(); if (!t.on || !t.sub) return null;
      try { if (global.BimAmbienteUI && global.BimAmbienteUI.ferramenta && global.BimAmbienteUI.ferramenta()) return null; } catch (e) {}
      return t.sub;
    },
    _def: function (id) { var P2 = D2(); var d = P2 && P2.def ? P2.def(id) : null; return d && d.tipo === "planta" && d.nivel ? d : null; },
    _vistaAtiva: function () { try { return global.Gestao && global.Gestao._bimVxEst ? global.Gestao._bimVxEst().ativa : null; } catch (e) { return null; } },
    /* a planta está na frente com uma ferramenta armada (o duplo clique é ponto, não "enquadrar") */
    ocupado: function () { var a = this._vistaAtiva(); return !!(this.ativo() && a && this._def(a) && this.ferramenta()); },
    _escala: function (id) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null;
      var m = c && c.svg && c.svg.getScreenCTM ? c.svg.getScreenCTM() : null;
      return m && m.a > 0 ? m.a : 100;   /* px por metro */
    },
    _tol: function (id, px) { return Math.max(0.005, (px || 12) / this._escala(id)); },

    /* ------------------------------------------------ geometria de snap */
    _geo: function (id) {
      var b = B(), est = null; try { est = b && b.editarEstado ? b.editarEstado().estado : null; } catch (e) { est = null; }
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null, dados = c ? c.dados : null;
      if (st.geo && st.gk1 === est && st.gk2 === dados && st.geo.id === id) return st.geo;
      var R = Pr(), g = R ? R.geometria(est || {}, { avaliar: b && b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null }) : { els: [], segs: [], pontos: [] };
      var segs = g.segs.slice(), pontos = g.pontos.slice(), n = 0, MAX = 4000;
      function seg(a, q) {
        if (n >= MAX || dist(a, q) < 1e-4) return;
        n++; var id2 = "d" + n;
        segs.push({ a: a, b: q, id: id2, k: "desenho" });
        pontos.push({ p: a, tipo: "fim", id: id2 }, { p: q, tipo: "fim", id: id2 }, { p: P((a.x + q.x) / 2, (a.z + q.z) / 2), tipo: "meio", id: id2 });
      }
      /* as linhas do DESENHO (corte e vista): o IFC importado também agarra — a parede nova nasce sobre a planta do projeto */
      if (dados) {
        (dados.cortes || []).forEach(function (pl) {
          if (!Array.isArray(pl)) return;
          var q = simplificar(pl.filter(function (x) { return x && fin(x[0]) && fin(x[1]); }).map(function (x) { return P(x[0], x[1]); }));
          for (var i = 0; i + 1 < q.length; i++) seg(q[i], q[i + 1]);
        });
        (dados.linhas || []).forEach(function (l) { if (l && fin(l[0]) && fin(l[1]) && fin(l[2]) && fin(l[3])) seg(P(l[0], l[1]), P(l[2], l[3])); });
      }
      st.geo = { id: id, els: g.els, segs: segs, pontos: pontos }; st.gk1 = est; st.gk2 = dados;
      return st.geo;
    },
    /* a peça do editor sob o ponto (pegada); porta/janela só aceita parede */
    _alvo: function (id, sub, raw) {
      var g = this._geo(id), tol = this._tol(id, 8), soParede = sub === "familia" && this._familiaHospedada(), best = null, bestA = Infinity;
      g.els.forEach(function (el) {
        if (soParede && el.tipo !== "parede") return;
        if (el.cantos && el.cantos.length >= 3 && pontoEmPoligono(raw, el.cantos)) { var a = areaPol(el.cantos); if (a < bestA) { bestA = a; best = el.id; } }
      });
      if (best != null) return best;
      var dm = tol;
      g.els.forEach(function (el) {
        if (soParede && el.tipo !== "parede") return;
        (el.segs || []).forEach(function (s) { var d = distSeg(raw, s.a, s.b); if (d < dm) { dm = d; best = el.id; } });
      });
      return best;
    },
    _familiaHospedada: function () {
      var a = this.api(), t = a ? a.traco() : null, fs = t && t.famSel, b = B();
      if (!fs || !b) return false;
      try {
        var lst = global.FamiliaUI && global.FamiliaUI.biblioteca ? global.FamiliaUI.biblioteca() : [];
        var f = lst.filter(function (x) { return x.id === fs.famId; })[0];
        if (f) return f.hospedagem === "parede";
        var av = b.familiaAvaliar(fs.famId, fs.tipoId, fs.inst || {}); return !!(av && av.abertura);
      } catch (e) { return false; }
    },

    /* --------------------------------------------- o ponto (snap + ângulo) */
    _base: function (sub) {
      var F = st.forma;
      if (F && F.sub === sub && F.pts.length) { var u = F.pts[F.pts.length - 1]; return { snap: u, ang: F.f.pontos === "livre" ? u : null }; }
      var b = B(), pz = b && b.precisao ? b.precisao() : null;
      if (pz && pz.ferramenta && pz.ferramenta()) { var q = pz.basePlanta ? pz.basePlanta() : null; return { snap: q, ang: q }; }
      var a = this.api(), t = a ? a.traco() : null;
      /* laje/furo por retângulo: o 2º ponto é o canto oposto — a diagonal não trava em ângulo */
      var diagonal = (sub === "laje" || sub === "furo") && t && t.lajeModo === "retangulo" && t.pts.length === 1;
      if (t && t.p1) return { snap: t.p1, ang: BB() && BB().ehTraco(sub) && !diagonal ? t.p1 : null };
      return { snap: null, ang: null };
    },
    _ponto: function (id, ev, p, sub) {
      var cur = P(p[0], p[1]), R = Pr(), Bo = BB(), cfg = Bo ? Bo.cfg(sub) : null, base = this._base(sub), tol = this._tol(id, 12);
      var sn = null;
      if (R && cfg && cfg.snap) {
        var T = {}; (R.TIPOS || []).forEach(function (t) { T[t] = !cfg.tipos || cfg.tipos[t] !== false; }); T.grade = !!cfg.grade && T.grade;
        sn = R.snap(cur, this._geo(id), { tol: tol, tipos: T, ref: base.snap, grade: cfg.grade ? cfg.passo : 0 });
      }
      var q = sn ? P(sn.p.x, sn.p.z) : cur, forte = !!(sn && R && R.CLASSE[sn.sub || sn.tipo] <= 1), aj = null;
      if (base.ang && Bo && !forte) {
        /* o ponto da GRADE não entra na trava: projetar o nó da grade na direção travada dá um
           comprimento quebrado (2,97 m). Trava o CURSOR e o comprimento anda no passo da grade.
           Extensão/próximo são alinhamento de verdade: esses entram como estão. */
        var daGrade = !sn || sn.tipo === "grade";
        aj = Bo.ajustarPontoCom(base.ang, daGrade ? cur : q, cfg, !!(ev && ev.shiftKey));
        if (aj.travado) {
          if (daGrade && cfg.snap && cfg.grade) aj = Bo.arredondar(base.ang, aj, cfg.passo);
          q = aj.p;
          sn = (daGrade && sn) ? { p: q, tipo: "grade" } : (sn && dist(q, sn.p) <= 1e-6 ? sn : null);
        }
      }
      var ref = base.ang || base.snap;
      return { p: q, raw: cur, sn: sn, tol: tol, base: ref, graus: ref && dist(ref, q) > 1e-9 && Bo ? Bo.grausDe(ref, q) : null, dist: ref ? dist(ref, q) : 0, travado: !!(aj && aj.travado) };
    },
    /* a planta clicada é o nível em que a peça nasce */
    _nivelDaPlanta: function (d) {
      var U = global.BimArqUI; if (!U || !U.ativo || !U.ativo() || !d || !d.nivel) return;
      try {
        var L = U.niveis() || [], real = L.some(function (n) { return String(n.id) === String(d.nivel.id); });
        if (real && String((U.cfg() || {}).nivelId) !== String(d.nivel.id)) {
          U.cfg().nivelId = d.nivel.id; U.enviar();
          if (BB() && BB().pintar) BB().pintar();
          status("Nível atual: " + d.nivel.nome + " (a planta aberta).");
        }
      } catch (e) {}
    },

    /* ------------------------------------------------ o forma de desenho */
    modoForma: function (sub) {
      var Bo = BB(); if (!this.aceitaForma(sub) || !Bo) return null;
      var f = Bo.formaAtual(sub); if (!f) return null;
      if (f.id === "linha") {
        /* linha: o traço de sempre (cada clique, uma peça; Ctrl+Z desfaz uma). Parede com
           deslocamento ou raio coleta a polilinha toda e cria no Enter, com os cantos certos */
        var c = Bo.cfg(sub);
        if (sub === "parede" && (Math.abs(c.desloc) > 1e-9 || c.raio > 1e-9)) return { id: "linha", rotulo: f.rotulo, pontos: "livre", composta: true };
        return null;
      }
      return f;
    },
    _opcoesForma: function (sub) { var c = BB() ? BB().cfg(sub) : {}; return { alvo: sub, lados: c.lados, raio: c.raio, desloc: c.desloc }; },
    /* um ponto da forma (planta ou 3D) */
    _formaPonto: function (sub, f, p, raw, id) {
      var F = st.forma;
      if (!F || F.sub !== sub || F.f.id !== f.id) { this._formaLimpar(); F = st.forma = { sub: sub, f: f, pts: [], picks: [] }; }
      if (f.id === "selecionarLinhas") {
        var g = id ? this._geo(id) : null, best = null, dm = id ? this._tol(id, 10) : 0.2;
        (g ? g.segs : []).forEach(function (s) { var d = distSeg(raw, s.a, s.b); if (d < dm) { dm = d; best = s; } });
        if (!best) { status("Selecionar linhas: clique perto de uma linha (parede, eixo ou linha do desenho). Enter cria."); return; }
        F.picks.push({ tipo: "reta", a: P(best.a.x, best.a.z), b: P(best.b.x, best.b.z) });
        status(F.picks.length + " linha(s) — clique outra ou Enter para criar.");
        return;
      }
      var tolF = id ? this._tol(id, 10) : 0.15;
      if (f.pontos === "livre" && F.pts.length >= 3 && dist(p, F.pts[0]) <= tolF) { this._formaConcluir(true); return; }
      F.pts.push(P(p.x, p.z));
      if (typeof f.pontos === "number" && F.pts.length >= f.pontos) { this._formaConcluir(false); return; }
      status(this._formaDica(F));
    },
    _formaDica: function (F) {
      if (!F) return "";
      if (F.f.pontos === "livre") return F.f.rotulo + ": " + F.pts.length + " ponto(s) — Enter termina; clique no 1º ponto fecha; Esc cancela.";
      return F.f.rotulo + ": ponto " + (F.pts.length + 1) + " de " + F.f.pontos + (F.f.dica ? " (" + F.f.dica + ")" : "") + ". Esc cancela.";
    },
    _formaLimpar: function () {
      st.forma = null;
      var a = this.api(); if (a && a.previa3d) a.previa3d(null);
      if (st.id) this._desenhar(st.id);
    },
    /* Enter / último ponto / clique no 1º ponto: gera os segmentos e cria as peças */
    _formaConcluir: function (fechar) {
      var F = st.forma; if (!F) return false;
      var D = this.desenho(), o = this._opcoesForma(F.sub), g = null;
      if (F.f.id === "selecionarLinhas") g = { segmentos: F.picks.slice(), fechado: false };
      else if (F.f.composta) g = { segmentos: retasDe(F.pts, fechar), fechado: !!fechar };
      else { try { g = D.gerar(F.f.id, F.pts.slice(), o); } catch (e) { g = null; } }
      this._formaLimpar();
      if (!g || !g.segmentos || !g.segmentos.length) { status("A forma não gerou nenhum trecho: confira os pontos."); return false; }
      if (fechar && !g.fechado && g.segmentos.length >= 2) {
        var s0 = g.segmentos[0], sN = g.segmentos[g.segmentos.length - 1];
        if (dist(sN.b, s0.a) > 1e-6) g.segmentos.push({ tipo: "reta", a: P(sN.b.x, sN.b.z), b: P(s0.a.x, s0.a.z) });
        g.fechado = true;
      }
      return this._criar(F.sub, g);
    },
    _criar: function (sub, g) {
      var a = this.api(); if (!a) return false;
      var segs = g.segmentos.filter(function (s) { return s && s.a && s.b && fin(s.a.x) && fin(s.a.z) && fin(s.b.x) && fin(s.b.z); }), fechado = !!g.fechado, nota = "";
      if (CONTORNO[sub] || sub === "guarda") {
        var pts = amostrar(segs, 10);
        if (fechado && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
        var ok = a.contorno(pts);
        this._status(); return ok;
      }
      if (sub === "parede") {
        var c = BB() ? BB().cfg("parede") : { desloc: 0, raio: 0 }, pl = polilinha(segs);
        if (pl && fechado && pl.length > 2 && dist(pl[0], pl[pl.length - 1]) < 1e-6) pl.pop();
        if (Math.abs(c.desloc) > 1e-9) {
          if (pl) { pl = deslocar(pl, fechado, c.desloc); segs = retasDe(pl, fechado); }
          else nota = " (o deslocamento vale para traço reto; com arco a parede fica na linha clicada)";
        }
        if (c.raio > 1e-9 && pl) { var cc = concordar(pl, fechado, c.raio); segs = cc.segmentos; if (cc.semRaio) nota += " — " + cc.semRaio + " canto(s) sem espaço para o raio de " + fmt(c.raio) + " m ficaram vivos"; }
      } else segs = emRetas(segs, 10);   /* viga e eixo: retos */
      var r = a.criarSegmentos(sub, segs);
      if (r && r.ok) status((BB() ? BB().rotulo(sub) : sub) + ": " + r.n + " peça(s) criada(s) de uma vez (Ctrl+Z desfaz a forma inteira)" + nota + ".");
      else status("Nada foi criado: os trechos ficaram curtos demais.");
      return !!(r && r.ok);
    },

    /* ------------------------------------------------ cliques e movimento na planta */
    clique2d: function (id, ev, p) {
      if (!this.ativo() || !p || (ev && ev.button !== 0)) return false;
      var sub = this.ferramenta(); if (!sub) return false;
      var d = this._def(id); if (!d) return false;   /* corte/elevação: a modelagem é na planta */
      /* as setas da porta: virar a folha da peça já colocada */
      var seta = ev && ev.target && ev.target.closest ? ev.target.closest("[data-pm-virar]") : null;
      if (seta) { this._virarColocada(seta.getAttribute("data-pm-virar")); return true; }
      this._nivelDaPlanta(d);
      st.id = id;
      var r = this._ponto(id, ev, p, sub);
      this._fecharDig();
      this._aplicarPonto(id, sub, r.p, r.raw, { shift: !!(ev && ev.shiftKey), ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)) }, r.tol);
      st.cur = this._ponto(id, ev, p, sub); this._desenhar(id);
      return true;
    },
    _aplicarPonto: function (id, sub, q, raw, mods, tol) {
      var a = this.api(); if (!a) return;
      var f = this.modoForma(sub);
      if (f) { this._formaPonto(sub, f, q, raw, id); this._desenhar(id); return; }
      var b = B(), pz = b && b.precisao ? b.precisao() : null;
      if (pz && pz.ferramenta && pz.ferramenta() && pz.cliquePlanta) { pz.cliquePlanta(q, this._alvo(id, sub, raw), mods); this._status(); return; }
      var t = a.traco();
      /* clique no 1º ponto fecha o contorno (laje, forro, furo) — com a escala DA PLANTA */
      if (CONTORNO[sub] && t.pts.length >= 3 && dist(q, t.pts[0]) <= (tol || 0.1)) { a.fechar(); this._status(); return; }
      a.clique(q, { alvoId: this._alvo(id, sub, raw), shift: mods.shift, ctrl: mods.ctrl });
      this._status();
    },
    _status: function () {
      var a = this.api(); if (!a) return;
      var h = String(a.traco().dica || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (h) status(h);
    },
    mover2d: function (id, ev, p) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.el) return;
      var sub = this.ativo() ? this.ferramenta() : null;
      if (!sub || !this._def(id)) { if (c.el.hasAttribute("data-pm-ferr")) { c.el.removeAttribute("data-pm-ferr"); this._limparCamada(id); } return; }
      c.el.setAttribute("data-pm-ferr", sub);
      if (!p) return;
      st.ultEv = { x: ev.clientX, y: ev.clientY, shift: !!ev.shiftKey };
      var agora = Date.now(); if (agora - st.tMov < 25) return; st.tMov = agora;
      st.id = id; st.cur = this._ponto(id, ev, p, sub);
      this._desenhar(id);
    },
    /* ⚠ depois do quadro: o Bim2D.atualizar devolve o zoom (viewBox) DEPOIS de redesenhar, e a escala
       medida antes punha as setas da porta longe da parede — elas pulavam no primeiro movimento */
    aposDesenhar: function (id) { var self = this; if (st.id === id && this.ferramenta()) setTimeout(function () { if (st.id === id && self.ferramenta()) self._desenhar(id); }, 0); },
    _limparCamada: function (id) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c) return;
      var g = c.svg ? c.svg.querySelector("g.pm-cam") : null; if (g) g.parentNode.removeChild(g);
      var rt = c.tela ? c.tela.querySelector(".pm-rot") : null; if (rt) rt.style.display = "none";
    },

    /* ------------------------------------------------ o desenho da prévia (SVG) */
    _desenhar: function (id) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.svg) return;
      var sub = this.ferramenta(); if (!sub) { this._limparCamada(id); return; }
      var g = c.svg.querySelector("g.pm-cam");
      if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "pm-cam"); g.setAttribute("pointer-events", "none"); }
      if (g.parentNode !== c.svg || c.svg.lastChild !== g) c.svg.appendChild(g);
      while (g.firstChild) g.removeChild(g.firstChild);
      var a = this.api(), t = a ? a.traco() : null, r = st.cur, u = 1 / this._escala(id);
      function el(tag, at) { var e = document.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); e.setAttribute("vector-effect", "non-scaling-stroke"); g.appendChild(e); return e; }
      function caminho(pts, cls, fechar) { if (!pts || pts.length < 2) return null; var dd = ""; pts.forEach(function (q, i) { dd += (i ? "L" : "M") + r6(q.x) + " " + r6(q.z); }); if (fechar) dd += "Z"; return el("path", { d: dd, "class": cls }); }
      var F = st.forma;
      if (F && F.sub === sub) {
        var segsF = [];
        if (F.f.id === "selecionarLinhas") segsF = F.picks.slice();
        else {
          var gp = null;
          try { gp = F.f.composta ? { segmentos: retasDe(F.pts.concat(r ? [r.p] : []), false) } : this.desenho().previa(F.f.id, F.pts.slice(), r ? r.p : null, this._opcoesForma(sub)); } catch (e) { gp = null; }
          segsF = gp && gp.segmentos ? gp.segmentos : [];
        }
        caminho(amostrar(segsF, 6), "pm-forma");
        F.pts.forEach(function (q) { el("circle", { cx: r6(q.x), cy: r6(q.z), r: r6(3 * u), "class": "pm-vert" }); });
      } else if (t && t.p1 && r && BB() && BB().ehTraco(sub) && !CONTORNO[sub] && sub !== "guarda") {
        if (sub === "parede" && dist(t.p1, r.p) > 1e-6) {
          var dx = r.p.x - t.p1.x, dz = r.p.z - t.p1.z, L = Math.sqrt(dx * dx + dz * dz), h = (t.esp || 0.15) / 2, nx = dz / L * h, nz = -dx / L * h;
          /* a faixa é o CORPO da parede: com a linha de localização fora do eixo, ele anda para o lado
             (a mesma conta do BimArq.marcarParede: centro − w·(sen r, cos r)) */
          var w = t.b2 ? this._wLinhaLoc(t.esp) : 0, ro = Math.atan2(-dz, dx), ox = -w * Math.sin(ro), oz = -w * Math.cos(ro);
          caminho([P(t.p1.x + nx + ox, t.p1.z + nz + oz), P(r.p.x + nx + ox, r.p.z + nz + oz), P(r.p.x - nx + ox, r.p.z - nz + oz), P(t.p1.x - nx + ox, t.p1.z - nz + oz)], "pm-faixa", true);
        }
        caminho([t.p1, r.p], "pm-elastico");
      }
      if (t && t.pts && t.pts.length && (CONTORNO[sub] || sub === "guarda")) {
        caminho(t.pts.concat(r ? [r.p] : []), "pm-elastico");
        if (CONTORNO[sub] && r && t.pts.length >= 2) caminho([r.p, t.pts[0]], "pm-fecho");
        t.pts.forEach(function (q) { el("circle", { cx: r6(q.x), cy: r6(q.z), r: r6(3 * u), "class": "pm-vert" }); });
      }
      /* porta/janela: a parede sob o cursor e o vão que vai abrir */
      if (sub === "familia" && r && this._familiaHospedada()) this._desenharVao(id, caminho, r, t);
      if (sub === "familia") this._desenharSetas(id, g, u);
      /* o snap: marcador + guias */
      if (r && r.sn && r.sn.tipo) {
        (r.sn.guias || []).forEach(function (gu) { caminho([gu.a, gu.b], "pm-guia"); });
        this._marcador(el, r.sn.tipo, r.p, 6 * u);
      }
      if (r) { el("line", { x1: r6(r.p.x - 9 * u), y1: r6(r.p.z), x2: r6(r.p.x + 9 * u), y2: r6(r.p.z), "class": "pm-mira" }); el("line", { x1: r6(r.p.x), y1: r6(r.p.z - 9 * u), x2: r6(r.p.x), y2: r6(r.p.z + 9 * u), "class": "pm-mira" }); }
      this._rotulo(id, r);
    },
    /* o deslocamento (w) da linha de localização escolhida na barra, para a prévia da parede */
    _wLinhaLoc: function (esp) {
      var A = global.BimArq, U = global.BimArqUI, Bo = BB(); if (!A || !A.linhaLocDe || !A.wLinhaLoc || !Bo) return 0;
      var ll = A.linhaLocDe(Bo.cfg("parede").linhaLoc); if (!ll) return 0;
      var tp = null; try { tp = U && U.tipoParede ? U.tipoParede() : null; } catch (e) { tp = null; }
      var w = A.wLinhaLoc({ espessura: tp && tp.espessura > 0 ? tp.espessura : esp, tipoParede: tp }, ll);
      return fin(w) ? w : 0;
    },
    _marcador: function (el, tipo, p, s) {
      var x = r6(p.x), z = r6(p.z), k = "pm-snap pm-snap-" + tipo;
      if (tipo === "fim") el("rect", { x: r6(p.x - s), y: r6(p.z - s), width: r6(2 * s), height: r6(2 * s), "class": k });
      else if (tipo === "meio") el("path", { d: "M" + r6(p.x - s) + " " + r6(p.z + s) + "L" + r6(p.x + s) + " " + r6(p.z + s) + "L" + x + " " + r6(p.z - s) + "Z", "class": k });
      else if (tipo === "centro") el("circle", { cx: x, cy: z, r: r6(s), "class": k });
      else if (tipo === "perpendicular") el("path", { d: "M" + r6(p.x - s) + " " + r6(p.z - s) + "L" + r6(p.x - s) + " " + r6(p.z + s) + "L" + r6(p.x + s) + " " + r6(p.z + s) + "M" + r6(p.x - s) + " " + z + "L" + x + " " + z + "L" + x + " " + r6(p.z + s), "class": k });
      else el("path", { d: "M" + r6(p.x - s) + " " + r6(p.z - s) + "L" + r6(p.x + s) + " " + r6(p.z + s) + "M" + r6(p.x - s) + " " + r6(p.z + s) + "L" + r6(p.x + s) + " " + r6(p.z - s), "class": k });
    },
    _paredeDe: function (id) {
      var b = B(), est = null; try { est = b.editarEstado().estado; } catch (e) { return null; }
      return ((est && est.caixas) || []).filter(function (c) { return c.id === id && c.tipo === "parede"; })[0] || null;
    },
    _desenharVao: function (id, caminho, r, t) {
      var wid = this._alvo(id, "familia", r.raw), w = wid ? this._paredeDe(wid) : null, b = B(); if (!w || !b) return;
      var co = Math.cos(w.rotY), si = Math.sin(w.rotY), hL = w.comprimento / 2, hE = w.espessura / 2;
      function mundo(lx, lz) { return P(w.cx + lx * co + lz * si, w.cz - lx * si + lz * co); }
      caminho([mundo(-hL, -hE), mundo(hL, -hE), mundo(hL, hE), mundo(-hL, hE)], "pm-hospede", true);
      var fs = t && t.famSel, av = null; try { av = fs ? b.familiaAvaliar(fs.famId, fs.tipoId, fs.inst || {}) : null; } catch (e) { av = null; }
      var lv = av && av.abertura && av.abertura.largura > 0 ? av.abertura.largura : 0.8;
      var tt = (r.raw.x - w.cx) * co - (r.raw.z - w.cz) * si, meia = hL - lv / 2; if (meia <= 0) return;
      tt = Math.max(-meia, Math.min(meia, tt));
      caminho([mundo(tt - lv / 2, -hE), mundo(tt + lv / 2, -hE), mundo(tt + lv / 2, hE), mundo(tt - lv / 2, hE)], "pm-vao", true);
      /* o lado da folha: um traço para o lado em que ela abre */
      var vp = this.familiaVira(), lado = vp && vp.valor ? 1 : -1, c0 = mundo(tt, lado * (hE + 0.25));
      caminho([mundo(tt, lado * hE), c0], "pm-folha");
    },
    /* as SETAS de virar das portas já colocadas (com a ferramenta de porta armada) */
    _desenharSetas: function (id, g, u) {
      var b = B(), est = null; try { est = b.editarEstado().estado; } catch (e) { return; }
      var self = this;
      ((est && est.familias) || []).forEach(function (f) {
        if (!f.host) return;
        var pv = self._paramVirar(f.famId, f.tipoId, f.inst); if (!pv) return;
        var w = self._paredeDe(f.host.id); if (!w) return;
        var co = Math.cos(w.rotY), si = Math.sin(w.rotY), d = w.espessura / 2 + 14 * u, nx = si, nz = co;
        var x = f.x + nx * d, z = f.z + nz * d, s = 6 * u;
        var gr = document.createElementNS(NS, "g"); gr.setAttribute("class", "pm-seta"); gr.setAttribute("data-pm-virar", f.id); gr.setAttribute("pointer-events", "all");
        var tt = document.createElementNS(NS, "title"); tt.textContent = "Virar o lado da folha"; gr.appendChild(tt);
        var bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", r6(x)); bg.setAttribute("cy", r6(z)); bg.setAttribute("r", r6(9 * u)); bg.setAttribute("class", "pm-seta-fundo"); gr.appendChild(bg);
        var pa = document.createElementNS(NS, "path"); pa.setAttribute("vector-effect", "non-scaling-stroke");
        pa.setAttribute("d", "M" + r6(x - nx * s) + " " + r6(z - nz * s) + "L" + r6(x + nx * s) + " " + r6(z + nz * s) +
          "M" + r6(x + nx * s - co * s * 0.6 - nx * s * 0.5) + " " + r6(z + nz * s + si * s * 0.6 - nz * s * 0.5) + "L" + r6(x + nx * s) + " " + r6(z + nz * s) + "L" + r6(x + nx * s + co * s * 0.6 - nx * s * 0.5) + " " + r6(z + nz * s - si * s * 0.6 - nz * s * 0.5) +
          "M" + r6(x - nx * s - co * s * 0.6 + nx * s * 0.5) + " " + r6(z - nz * s + si * s * 0.6 + nz * s * 0.5) + "L" + r6(x - nx * s) + " " + r6(z - nz * s) + "L" + r6(x - nx * s + co * s * 0.6 + nx * s * 0.5) + " " + r6(z - nz * s - si * s * 0.6 + nz * s * 0.5));
        gr.appendChild(pa); g.appendChild(gr);
      });
      g.setAttribute("pointer-events", "none");
    },
    _paramVirar: function (famId, tipoId, inst) {
      var b = B(), av = null; try { av = b ? b.familiaAvaliar(famId, tipoId, inst || {}) : null; } catch (e) { av = null; }
      if (!av || !av.valores) return null;
      for (var i = 0; i < VIRAR_PARAM.length; i++) if (Object.prototype.hasOwnProperty.call(av.valores, VIRAR_PARAM[i])) return { nome: VIRAR_PARAM[i], valor: !!(inst && inst[VIRAR_PARAM[i]] != null ? inst[VIRAR_PARAM[i]] : av.valores[VIRAR_PARAM[i]]) };
      return null;
    },
    _virarColocada: function (fid) {
      var b = B(), est = null; try { est = b.editarEstado().estado; } catch (e) { return false; }
      var f = ((est && est.familias) || []).filter(function (x) { return x.id === fid; })[0]; if (!f) return false;
      var pv = this._paramVirar(f.famId, f.tipoId, f.inst); if (!pv) return false;
      var o = {}; o[pv.nome] = !pv.valor;
      var ok = b.instanciaAlterar && b.instanciaAlterar(fid, { inst: o });
      status(ok ? "Folha virada (" + (o[pv.nome] ? "abre para fora" : "abre para dentro") + "). Ctrl+Z desfaz." : "Não consegui virar a folha.");
      return !!ok;
    },
    /* o lado da folha da PRÓXIMA porta (barra de opções e barra de espaço) */
    familiaVira: function () {
      var a = this.api(), t = a ? a.traco() : null, fs = t && t.famSel; if (!fs) return null;
      return this._paramVirar(fs.famId, fs.tipoId, fs.inst);
    },
    familiaVirar: function (v) {
      var a = this.api(), pv = this.familiaVira(); if (!a || !pv) return null;
      var o = {}; o[pv.nome] = v == null ? !pv.valor : !!v;
      a.famInst(o);
      if (BB()) BB().mudar("familia", "virar", o[pv.nome]);
      if (st.id) this._desenhar(st.id);
      return o[pv.nome];
    },
    textoAnotar: function (tx) {
      st.texto = String(tx || "");
      /* o pino "Anotar" lê o texto do campo do painel antigo (escondido): a barra escreve nele */
      var a = this.api(); if (a && a.anotarTexto) a.anotarTexto(st.texto);
    },

    /* ------------------------------------------------ rótulo e digitar (DOM sobre a planta) */
    _rotulo: function (id, r) {
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.tela) return;
      var el = c.tela.querySelector(".pm-rot");
      if (!el) { el = document.createElement("div"); el.className = "pm-rot"; el.setAttribute("aria-live", "off"); c.tela.appendChild(el); }
      if (!r || !r.base || !(r.dist > 1e-6) || st.dig) { el.style.display = "none"; return; }
      el.textContent = fmt(r.dist) + " m · " + (BB() ? BB().fmtAng(r.graus) : fmt(r.graus, 1) + "°") + (r.travado ? "" : " (livre)");
      var rc = c.tela.getBoundingClientRect(), e = st.ultEv;
      el.style.display = "";
      if (e) { el.style.left = (e.x - rc.left + 16) + "px"; el.style.top = (e.y - rc.top + 14) + "px"; }
    },
    _abrirDig: function (ch) {
      var id = st.id, P2 = D2(), c = id && P2 && P2._cache ? P2._cache[id] : null; if (!c || !c.tela) return false;
      var sub = this.ferramenta(), base = sub ? this._base(sub) : null; if (!base || !(base.ang || base.snap)) return false;
      var box = c.tela.querySelector(".pm-dig");
      if (!box) {
        box = document.createElement("div"); box.className = "pm-dig"; box.setAttribute("data-pm", "digita");
        box.innerHTML = '<label>Comprimento <input data-pm="comp" inputmode="decimal" autocomplete="off" aria-label="Comprimento em metros"></label>' +
          '<label>Ângulo <input data-pm="ang" inputmode="decimal" autocomplete="off" aria-label="Ângulo em graus"></label>';
        c.tela.appendChild(box);
        var self = this;
        box.addEventListener("keydown", function (e) {
          e.stopPropagation();
          if (e.key === "Tab") { e.preventDefault(); var a = box.querySelector('[data-pm="comp"]'), b2 = box.querySelector('[data-pm="ang"]'); (document.activeElement === a ? b2 : a).focus(); return; }
          if (e.key === "Enter") { e.preventDefault(); self._confirmarDig(); return; }
          if (e.key === "Escape") { e.preventDefault(); self._fecharDig(); }
        });
      }
      var rc = c.tela.getBoundingClientRect(), e2 = st.ultEv;
      if (e2) { box.style.left = (e2.x - rc.left + 16) + "px"; box.style.top = (e2.y - rc.top + 14) + "px"; }
      box.style.display = "flex";
      var inp = box.querySelector('[data-pm="comp"]'); inp.value = ch || ""; box.querySelector('[data-pm="ang"]').value = "";
      st.dig = { id: id }; inp.focus();
      var rt = c.tela.querySelector(".pm-rot"); if (rt) rt.style.display = "none";
      return true;
    },
    _fecharDig: function () {
      if (!st.dig) return;
      var P2 = D2(), c = P2 && P2._cache ? P2._cache[st.dig.id] : null;
      var box = c && c.tela ? c.tela.querySelector(".pm-dig") : null;
      if (box) { box.style.display = "none"; if (box.contains(document.activeElement)) document.activeElement.blur(); }
      st.dig = null;
    },
    /* Enter na caixa: o ponto sai do comprimento e do ângulo digitados (vazio = o do cursor) */
    _confirmarDig: function () {
      var id = st.dig && st.dig.id, P2 = D2(), c = id && P2 ? P2._cache[id] : null; if (!c) return false;
      var box = c.tela.querySelector(".pm-dig"), R = Pr(), sub = this.ferramenta(); if (!box || !R || !sub) return false;
      var base = this._base(sub), b0 = base.ang || base.snap; if (!b0) { this._fecharDig(); return false; }
      var tc = box.querySelector('[data-pm="comp"]').value, ta = box.querySelector('[data-pm="ang"]').value;
      var cur = st.cur, d = tc.trim() ? R.lerNumero(tc) : (cur ? cur.dist : null), g = ta.trim() ? R.lerAngulo(ta) : (cur && cur.graus != null ? cur.graus : 0);
      if (d == null || !(d > 0.005)) { status("Comprimento inválido — use metros (2,50) ou 250 cm."); return false; }
      if (ta.trim() && g == null) { status("Ângulo inválido — use graus (30 ou −45)."); return false; }
      var q = R.pontoPor(b0, d, g);
      this._fecharDig();
      this._aplicarPonto(id, sub, P(r6(q.x), r6(q.z)), q, {}, 0);
      st.cur = null; this._desenhar(id);
      return true;
    },

    /* ------------------------------------------------ teclado */
    /* ⚠ stopImmediatePropagation, não só stopPropagation: o desenho de precisão (js/bimprecisaoui.js)
       também ouve o teclado no DOCUMENTO, na captura — stopPropagation não para ouvintes do mesmo nó,
       e o Esc que aqui só encerra o traço lá desarmava a ferramenta (achado pela e2e-bim-planta) */
    _tecla: function (ev) {
      var self = BimPlantaModelar;
      if (!self.ativo()) return;
      var alvo = ev.target || {}, campo = /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || "") || alvo.isContentEditable;
      if (campo) return;
      var sub = self.ferramenta(), F = st.forma;
      if (!sub) { if (F) self._formaLimpar(); return; }
      var naPlanta = !!self._def(self._vistaAtiva());
      if (ev.key === "Escape") {
        /* 1º Esc encerra o que está em andamento; o 2º sai da ferramenta (segue para a casca) */
        if (F && (F.pts.length || F.picks.length)) { self._formaLimpar(); status("Forma cancelada — clique o 1º ponto de novo, ou Esc para sair."); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
        if (naPlanta) {
          var t = self.api().traco();
          if (t.p1 || t.pts.length || t.vol.length) { self.api().cancelar(); st.cur = null; if (st.id) self._desenhar(st.id); status("Traço encerrado — clique o início do próximo, ou Esc para sair da ferramenta."); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
        }
        return;
      }
      if (ev.key === "Enter" && F && F.sub === sub && (F.pts.length >= 2 || F.picks.length)) { self._formaConcluir(false); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      if (!naPlanta) return;
      if (ev.key === " " && sub === "familia" && self.familiaVira()) { var v = self.familiaVirar(); status("A folha abre para " + (v ? "fora" : "dentro") + " (espaço vira de novo)."); if (BB()) BB().pintar(); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[0-9.,-]$/.test(ev.key)) {
        var b0 = self._base(sub);
        if ((b0.ang || b0.snap) && self._abrirDig(ev.key)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
      }
    },

    /* ------------------------------------------------ 3D: a forma também vale lá */
    cliqueForma: function (sub, p, e) {
      if (!this.ativo() || (e && e._planta)) return false;
      var f = this.modoForma(sub); if (!f) return false;
      var F = st.forma, q = P(p.x, p.z);
      if (F && F.sub === sub && F.pts.length && f.pontos === "livre" && BB()) { var aj = BB().ajustarPonto(sub, F.pts[F.pts.length - 1], q, !!(e && e.shiftKey)); q = aj.p; }
      this._formaPonto(sub, f, q, q, null);
      this.moverForma3d();
      return true;
    },
    moverForma3d: function () {
      var F = st.forma, a = this.api(); if (!F || !a || !a.previa3d) return;
      var b = B(), pz = b && b.precisao ? b.precisao() : null, ul = null;
      try { ul = pz && pz.estado ? pz.estado().ultimo : null; } catch (e) { ul = null; }
      var cur = ul && ul.p ? P(ul.p.x, ul.p.z) : null, gp = null;
      if (cur && F.pts.length && F.f.pontos === "livre" && BB()) cur = BB().ajustarPonto(F.sub, F.pts[F.pts.length - 1], cur, false).p;
      try { gp = F.f.composta ? { segmentos: retasDe(F.pts.concat(cur ? [cur] : []), false) } : this.desenho().previa(F.f.id, F.pts.slice(), cur, this._opcoesForma(F.sub)); } catch (e2) { gp = null; }
      a.previa3d(gp && gp.segmentos ? [amostrar(gp.segmentos, 6)] : null);
    },

    /* ------------------------------------------------ eventos da barra e da ferramenta */
    aoSub: function (sub) {
      if (st.forma && st.forma.sub !== sub) this._formaLimpar();
      this._fecharDig();
      if (sub === "familia" && BB()) { var c = BB().cfg("familia"), pv = this.familiaVira(); if (pv && pv.valor !== !!c.virar) { var a = this.api(), o = {}; o[pv.nome] = !!c.virar; if (a) a.famInst(o); } }
      var P2 = D2(); if (P2 && P2._cache) Object.keys(P2._cache).forEach(function (k) { var cc = P2._cache[k]; if (!sub && cc && cc.el) { cc.el.removeAttribute("data-pm-ferr"); BimPlantaModelar._limparCamada(k); } });
    },
    aoMudarBarra: function (sub, campo) {
      if (campo === "forma" || campo === "desloc" || campo === "raio" || campo === "lados") { if (st.forma) this._formaLimpar(); }
      if (st.id) this._desenhar(st.id);
    },
    /* para o e2e e o suporte */
    estado: function () {
      var F = st.forma;
      return { ativo: this.ativo(), ferramenta: this.ferramenta(), ocupado: this.ocupado(), forma: F ? { sub: F.sub, id: F.f.id, pts: F.pts.length, picks: F.picks.length } : null,
               cursor: st.cur ? { p: st.cur.p, snap: st.cur.sn ? st.cur.sn.tipo : null, graus: st.cur.graus, dist: st.cur.dist, travado: st.cur.travado } : null,
               digitando: !!st.dig, dubl: !!this.desenho().dubl };
    }
  };

  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("keydown", BimPlantaModelar._tecla, true);

  global.BimPlantaModelar = BimPlantaModelar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPlantaModelar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

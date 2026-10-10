/* =====================================================================
 * metalpeca.js — METÁLICA & MECÂNICA: as PEÇAS (motor PURO, ES5, sem
 * DOM, sem three.js, Node-testável).
 *
 * Modelagem, detalhamento e fabricação — NÃO é cálculo estrutural: nada
 * aqui verifica resistência. O que sai é geometria exata para o 3D, para a
 * lista e para a máquina (furação, corte, contorno).
 *
 * A PEÇA METÁLICA é uma caixa do editor (op `criar`) com tipo "metal" e os
 * dados em `caixa.metal` (nada no topo da caixa além do envelope, para o
 * `mover`/`transladar` de sempre não mexer onde não deve):
 *   kind "chapa"     contorno poligonal (u, v) + espessura t, furos
 *                    (redondo ou oblongo), recortes internos e chanfros —
 *                    chapa de ligação, placa de base, gusset, cobrejunta,
 *                    enrijecedor, flange;
 *   kind "perfil"    perfil de catálogo (js/perfisaco.js) ou paramétrico
 *                    (js/bimarq.js secao) cortado no comprimento L, com
 *                    corte INCLINADO nas pontas (ângulo na alma e na aba) e
 *                    furos por face (o/u/v/h, como na máquina);
 *   kind "parafuso"  parafuso + porca + arruela(s) (ou CHUMBADOR com
 *                    ancoragem), comprimento pelo aperto (js/metalnorma.js);
 *   kind "mecanica"  peça mecânica de revolução (eixo maciço, bucha) — a
 *                    flange e o suporte são chapas (vão para o corte).
 *
 * REFERENCIAL: `metal.o` é a origem RELATIVA ao centro da caixa (cx, cy,
 * cz) e `ex`/`ey` os eixos locais; o mundo é centro + Ry(rotY)·local. Assim
 * o `mover` (que só troca cx/cz) e o girar (rotY) valem sem código novo.
 *   chapa:    u ao longo de ex, v ao longo de ey, espessura ao longo de
 *             ez = ex × ey (de 0 a t);
 *   perfil:   ex = eixo da barra (de 0 a L), ey = "altura" da seção (o b
 *             do contorno do BimArq.secao), a largura (o a) em ex × ey;
 *   parafuso: ex = eixo, do lado da cabeça para o da porca; a origem é a
 *             face de apoio da cabeça (início do aperto).
 *
 * FUROS NOS MEMBROS (pilar/viga do modelador ou perfil daqui): op
 * `metalFuros` {id, lig, furos:[{face, x, y, db, d, l, tipo, ang}]} — x ao
 * longo do eixo a partir da REFERÊNCIA da barra (o eixo de -L/2 da viga, a
 * base do pilar), y na face (convenção da máquina: alma = a partir da face
 * de baixo; mesa = a partir da borda). A referência não muda quando o recuo
 * no pilar muda — o furo fica onde está; o x da máquina sai na exportação.
 * `metalApagarLig` {lig} tira a ligação inteira (peças e furos).
 *
 * Unidades: metros no modelo; db/d/l dos furos em MILÍMETROS (como na
 * norma e na fábrica). Massa específica 7 850 kg/m³ (js/metalnorma.js).
 * Teste: node tools/test-metal-pecas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Arq() { return dep("BimArq", "./bimarq.js"); }
  function Norma() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function Estrut() { return dep("BimEstrut", "./bimestrut.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var RHO = 7850;

  /* ---------------------------------------------------------- vetores */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [1, 0, 0]; }
  function V(o) { return Array.isArray(o) ? [num(o[0], 0), num(o[1], 0), num(o[2], 0)] : (o ? [num(o.x, 0), num(o.y, 0), num(o.z, 0)] : [0, 0, 0]); }
  function O3(v) { return { x: r6(v[0]), y: r6(v[1]), z: r6(v[2]) }; }
  /* giro em volta de +Y (convenção do editor: X local → (cos θ, 0, −sen θ)) */
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  /* ex e ey ortonormais (ey sem a componente de ex) */
  function base(ex, ey) {
    var X = unit(V(ex)), Y0 = V(ey), Y = sub(Y0, mul(X, dot(Y0, X)));
    if (len(Y) < 1e-9) Y = Math.abs(X[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    Y = unit(sub(Y, mul(X, dot(Y, X))));
    return { X: X, Y: Y, Z: cross(X, Y) };
  }

  /* --------------------------------------------------------- polígonos 2D */
  function area2(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perim2(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); } return s; }
  function circ(cx, cy, r, n) { var o = []; n = n || 24; for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }
  /* oblongo (estádio): centro, largura w (= diâmetro), comprimento l (de ponta a ponta), ângulo (graus, do eixo u) */
  function oblongo(cx, cy, w, l, angGraus, n) {
    var r = w / 2, h = Math.max(0, (l - w) / 2), a = num(angGraus, 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), o = [];
    n = n || 12;
    for (var i = 0; i <= n; i++) { var t = -Math.PI / 2 + Math.PI * i / n; o.push([h + r * Math.cos(t), r * Math.sin(t)]); }
    for (var j = 0; j <= n; j++) { var t2 = Math.PI / 2 + Math.PI * j / n; o.push([-h + r * Math.cos(t2), r * Math.sin(t2)]); }
    return o.map(function (q) { return [cx + q[0] * ca - q[1] * sa, cy + q[0] * sa + q[1] * ca]; });
  }
  /* área e perímetro EXATOS do furo (mm → m²/m) */
  function furoMedidas(f) {
    var w = num(f.d, 0) / 1000, l = Math.max(w, num(f.l, f.d) / 1000), r = w / 2;
    return { area: Math.PI * r * r + w * (l - w), perim: Math.PI * w + 2 * (l - w) };
  }
  function furoPoli(f, n) {
    var w = num(f.d, 0) / 1000, l = Math.max(w, num(f.l, f.d) / 1000);
    return l > w + 1e-9 ? oblongo(num(f.u, 0), num(f.v, 0), w, l, f.ang, n) : circ(num(f.u, 0), num(f.v, 0), w / 2, n || 24);
  }
  /* chanfro no canto i: corta c ao longo das duas arestas (c em m) */
  function chanfrar(pts, i, c) {
    var n = pts.length, P = pts[i], A = pts[(i - 1 + n) % n], B = pts[(i + 1) % n];
    var la = Math.sqrt(Math.pow(A[0] - P[0], 2) + Math.pow(A[1] - P[1], 2)), lb = Math.sqrt(Math.pow(B[0] - P[0], 2) + Math.pow(B[1] - P[1], 2));
    if (!(c > 0) || c >= la - 1e-6 || c >= lb - 1e-6) return pts;
    var p1 = [P[0] + (A[0] - P[0]) * c / la, P[1] + (A[1] - P[1]) * c / la], p2 = [P[0] + (B[0] - P[0]) * c / lb, P[1] + (B[1] - P[1]) * c / lb];
    return pts.slice(0, i).concat([p1, p2]).concat(pts.slice(i + 1));
  }
  function ptsUV(l) { return arr(l).map(function (q) { return Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q.u, 0), num(q.v, 0)]; }); }
  function uvObj(p) { return { u: r6(p[0]), v: r6(p[1]) }; }

  /* ================================================================ CHAPA
   * o = { origem:[x,y,z] (mundo), ex, ey, t (m), contorno: [[u,v]…] (m) ou
   *       ret: {L, B} (retângulo de 0,0 a L,B), chanfros:[{i, c}],
   *       furos:[{u, v, db (mm), tipo, ang}], recortes:[[[u,v]…]],
   *       aco, papel, lig, soldadaEm, solda, ifc }
   * Devolve a CAIXA (op `criar`) ou { erro }. */
  function chapa(o) {
    o = o || {};
    var t = num(o.t, 0); if (!(t > 0.0005 && t < 0.3)) return { erro: "Espessura da chapa entre 0,5 mm e 300 mm." };
    var C = o.ret ? [[0, 0], [num(o.ret.L, 0), 0], [num(o.ret.L, 0), num(o.ret.B, 0)], [0, num(o.ret.B, 0)]] : ptsUV(o.contorno);
    if (C.length < 3 || Math.abs(area2(C)) < 1e-8) return { erro: "Contorno da chapa com menos de 3 pontos ou sem área." };
    if (area2(C) < 0) C = C.reverse();
    /* chanfros do maior índice para o menor (cada um acrescenta um vértice) */
    arr(o.chanfros).slice().sort(function (a, b) { return num(b.i, 0) - num(a.i, 0); }).forEach(function (ch) { var i = Math.round(num(ch.i, -1)); if (i >= 0 && i < C.length) C = chanfrar(C, i, num(ch.c, 0)); });
    var N = Norma(), furos = [];
    arr(o.furos).forEach(function (f) {
      var db = num(f.db, 0), fx = N && db > 0 ? N.furo(db, f.tipo || "padrao") : null;
      var d = num(f.d, fx ? fx.d : db), l = num(f.l, fx ? fx.l : d);
      if (!(d > 0)) return;
      var h = { u: r6(num(f.u, 0)), v: r6(num(f.v, 0)), db: db, d: d, l: l, tipo: f.tipo || "padrao" };
      if (f.ang != null) h.ang = num(f.ang, 0);
      if (f.id) h.id = String(f.id);
      furos.push(h);
    });
    var m = { v: 1, kind: "chapa", papel: String(o.papel || "Chapa"), t: r6(t), aco: String(o.aco || "ASTM A36"),
              contorno: C.map(uvObj), furos: furos, recortes: arr(o.recortes).map(function (r) { var p = ptsUV(r && r.pts ? r.pts : r); return { pts: p.map(uvObj) }; }).filter(function (r) { return r.pts.length >= 3; }),
              ex: null, ey: null, o: null };
    if (o.borda) m.borda = o.borda === "serra" ? "serra" : "laminada";
    return montar(m, o, o.ifc || "IFCPLATE");
  }

  /* =============================================================== PERFIL
   * o = { origem (início do eixo, no centro da seção), ex (eixo), ey
   *       ("altura" da seção), perfil (do BimArq, em m) ou cat (nome do
   *       catálogo), L (m), cortes: {almaIni, almaFim, abaIni, abaFim}
   *       (graus; positivo = a ponta avança com +b na alma e com +a na
   *       aba), furos:[{face, x, y, db, tipo, ang}], papel, ifc, aco } */
  /* a seção do BimArq; a BARRA REDONDA fina (tirante, Ø < 2 cm, que o
     BimArq recusa para pilar de concreto) sai aqui, com a mesma forma */
  function secaoDe(p) {
    if (p && p.forma === "circ" && num(p.d, 0) > 0.003 && num(p.d, 0) < 0.02) {
      var d = num(p.d, 0); return { ok: true, forma: "circ", contorno: circ(0, 0, d / 2, 24), furos: [], area: Math.PI * d * d / 4, perimetro: Math.PI * d, larg: d, alt: d, rotulo: "Ø " + Math.round(d * 10000) / 10 + " mm" };
    }
    var A9 = Arq(); return A9 ? A9.secao(p) : null;
  }
  function perfilDe(o) {
    if (o && o.perfil && o.perfil.forma) return clone(o.perfil);
    var A = Aco(); if (A && o && o.cat) return A.paraPerfil(o.cat);
    return null;
  }
  function perfil(o) {
    o = o || {};
    var p = perfilDe(o), A9 = Arq(); if (!p) return { erro: "Perfil não encontrado no catálogo: " + (o.cat || "?") + "." };
    var s = secaoDe(p); if (!s || !s.ok) return { erro: s ? s.motivo : "O motor de seções (js/bimarq.js) não carregou." };
    var L = num(o.L, 0); if (!(L > 0.01 && L < 60)) return { erro: "Comprimento da barra entre 1 cm e 60 m." };
    var ct = o.cortes || {}, cortes = {};
    ["almaIni", "almaFim", "abaIni", "abaFim"].forEach(function (k) { var g = num(ct[k], 0); if (Math.abs(g) > 1e-9) cortes[k] = Math.max(-75, Math.min(75, g)); });
    var m = { v: 1, kind: "perfil", papel: String(o.papel || "Perfil"), perfil: p, L: r6(L), cortes: cortes, aco: String(o.aco || (p.forma === "I" || p.forma === "U" ? "ASTM A572 Gr.50" : "ASTM A36")),
              furos: arr(o.furos).map(normFuroFace).filter(Boolean), ex: null, ey: null, o: null };
    /* xRef: a REFERÊNCIA dos furos fica xRef antes do início do sólido — esticar/encurtar a ponta inicial não move os furos */
    if (Math.abs(num(o.xRef, 0)) > 1e-9) m.xRef = r6(num(o.xRef, 0));
    return montar(m, o, o.ifc || "IFCMEMBER");
  }
  function normFuroFace(f) {
    if (!f || !/^[ouvh]$/.test(String(f.face))) return null;
    var N = Norma(), db = num(f.db, 0), fx = N && db > 0 ? N.furo(db, f.tipo || "padrao") : null;
    var d = num(f.d, fx ? fx.d : db); if (!(d > 0)) return null;
    var h = { face: String(f.face), x: r6(num(f.x, 0)), y: r6(num(f.y, 0)), db: db, d: d, l: num(f.l, fx ? fx.l : d), tipo: f.tipo || "padrao" };
    if (f.ang != null) h.ang = num(f.ang, 0);
    if (f.lig != null) h.lig = String(f.lig);
    if (f.id != null) h.id = String(f.id);
    return h;
  }

  /* ============================================================= PARAFUSO
   * o = { origem (face de apoio da cabeça), eixo (para o lado da porca),
   *       aperto (m, o pacote de chapas), id ("M20", "3/4\""), classe
   *       ("A325", "8.8"…), arrCabeca (0|1), arrPorca (0|1),
   *       chumbador: { ancoragem (m) } — sem cabeça: porca e arruela em
   *       cima, a barra desce `ancoragem` no concreto }
   * O comprimento sai do js/metalnorma.js (aperto + arruelas + porca + 3
   * fios, arredondado ao passo comercial — valor de partida). */
  function parafuso(o) {
    o = o || {};
    var N = Norma(); if (!N) return { erro: "As regras de parafuso (js/metalnorma.js) não carregaram." };
    var p = N.parafuso(o.id || "M20"); if (!p) return { erro: "Parafuso desconhecido: " + o.id + "." };
    var ap = num(o.aperto, 0); if (!(ap > 0.001 && ap < 1.5)) return { erro: "Aperto do parafuso entre 1 mm e 1,5 m." };
    var ch = o.chumbador && typeof o.chumbador === "object" ? { ancoragem: Math.max(0, num(o.chumbador.ancoragem, 0.4)) } : null;
    var arrC = ch ? 0 : (o.arrCabeca === 1 || o.arrCabeca === true ? 1 : 0), arrP = o.arrPorca === 0 || o.arrPorca === false ? 0 : 1;
    var Lc = N.comprimento({ id: p.id, aperto: ap * 1000 + arrC * p.arr.h, arruelas: arrP, ancoragem: ch ? ch.ancoragem * 1000 : 0 });
    var classe = N.CLASSES[o.classe] ? o.classe : (ch ? "F1554-36" : (p.sistema === "POL" ? "A325" : "8.8"));
    var m = { v: 1, kind: "parafuso", papel: ch ? "Chumbador" : "Parafuso", id: p.id, db: p.d, sistema: p.sistema, classe: classe, aperto: r6(ap),
              arrCabeca: arrC, arrPorca: arrP, Lmm: Lc.L, ex: null, ey: null, o: null };
    if (ch) m.chumbador = ch;
    var eixo = unit(V(o.eixo || [0, -1, 0])), ey = Math.abs(eixo[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    return montar(m, { origem: o.origem, ex: eixo, ey: ey, lig: o.lig, soldadaEm: null }, "IFCMECHANICALFASTENER");
  }

  /* ============================================================ MECÂNICA
   * Peças de revolução em volta de ex: "eixo" (maciço: D, L) e "bucha"
   * (tubo: D, d, L). A FLANGE e o SUPORTE são chapas (ver flange/suporte). */
  function mecanica(o) {
    o = o || {};
    var tipo = o.tipoMec === "bucha" ? "bucha" : "eixo", D = num(o.D, 0), d = num(o.d, 0), L = num(o.L, 0);
    if (!(D > 0.002 && D < 2)) return { erro: "Diâmetro externo entre 2 mm e 2 m." };
    if (!(L > 0.002 && L < 20)) return { erro: "Comprimento entre 2 mm e 20 m." };
    if (tipo === "bucha" && !(d > 0 && d < D - 0.001)) return { erro: "Bucha: o furo tem de ser menor que o diâmetro externo." };
    var m = { v: 1, kind: "mecanica", tipoMec: tipo, papel: tipo === "bucha" ? "Bucha" : "Eixo", D: r6(D), d: tipo === "bucha" ? r6(d) : 0, L: r6(L), aco: String(o.aco || "SAE 1045"), ex: null, ey: null, o: null };
    return montar(m, o, "IFCMECHANICALFASTENER" === o.ifc ? o.ifc : "IFCBUILDINGELEMENTPROXY");
  }
  /* FLANGE: disco de diâmetro D, espessura t, furo central d, n furos de Ø dbFuro (parafuso, mm) no círculo Dc */
  function flange(o) {
    o = o || {};
    var D = num(o.D, 0), d = num(o.d, 0), Dc = num(o.Dc, 0), n = Math.round(num(o.n, 4));
    if (!(D > 0.01)) return { erro: "Diâmetro da flange maior que 1 cm." };
    if (!(d >= 0 && d < D - 0.005)) return { erro: "O furo central tem de ser menor que a flange." };
    if (n > 0 && !(Dc > d && Dc < D)) return { erro: "O círculo de furação tem de ficar entre o furo central e a borda." };
    var furos = [];
    for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n + Math.PI / Math.max(1, n); furos.push({ u: Dc / 2 * Math.cos(a), v: Dc / 2 * Math.sin(a), db: num(o.db, 16) }); }
    var rec = d > 0 ? [circ(0, 0, d / 2, 48)] : [];
    return chapa({ origem: o.origem, ex: o.ex, ey: o.ey, t: o.t, contorno: circ(0, 0, D / 2, 72), furos: furos, recortes: rec, aco: o.aco, papel: "Flange", lig: o.lig, soldadaEm: o.soldadaEm });
  }
  /* SUPORTE em L (cantoneira de chapa soldada): base (L × B) + aba vertical
     (L × H), os dois de espessura t, furos na base (nb) e na aba (na). Duas
     chapas: a aba é soldada na base (um conjunto). Devolve [base, aba]. */
  function suporte(o) {
    o = o || {};
    var L = num(o.L, 0.15), B = num(o.B, 0.1), H = num(o.H, 0.1), t = num(o.t, 0.0095), db = num(o.db, 12), O = V(o.origem);
    var bs = base(o.ex || [1, 0, 0], o.ey || [0, 0, 1]);
    var fb = [{ u: L * 0.25, v: B * 0.6, db: db }, { u: L * 0.75, v: B * 0.6, db: db }], fa = [{ u: L * 0.5, v: H * 0.6, db: db }];
    var cb = chapa({ origem: O, ex: bs.X, ey: bs.Y, t: t, ret: { L: L, B: B }, furos: fb, papel: "Suporte (base)", aco: o.aco, lig: o.lig });
    if (cb.erro) return cb;
    /* a aba: no fim v = 0 da base, subindo pela normal da base */
    var ca = chapa({ origem: add(O, mul(bs.Z, 0)), ex: bs.X, ey: bs.Z, t: t, ret: { L: L, B: H }, furos: fa, papel: "Suporte (aba)", aco: o.aco, lig: o.lig, soldadaEm: "@base" });
    if (ca.erro) return ca;
    ca.metal.solda = { tipo: "filete", perna: Math.max(5, Math.round(t * 1000 * 0.7)), lados: "ambos", campo: false };
    return [cb, ca];
  }

  /* ======================================================== MONTAR A CAIXA
   * os eixos, a origem relativa e o envelope (cx..espessura) a partir dos sólidos */
  function montar(m, o, ifc) {
    var bs = base(o.ex || [1, 0, 0], o.ey || [0, 1, 0]), Ow = V(o.origem);
    m.ex = O3(bs.X); m.ey = O3(bs.Y); m.o = O3(Ow);
    if (o.lig != null) m.lig = String(o.lig);
    if (o.soldadaEm != null) m.soldadaEm = String(o.soldadaEm);
    if (o.solda) m.solda = clone(o.solda);
    if (o.nome) m.nome = String(o.nome).slice(0, 80);
    var c = { tipo: "metal", ifc: ifc, b2: 1, metal: m, cx: 0, cy: 0, cz: 0, comprimento: 0.01, altura: 0.01, espessura: 0.01, rotY: 0 };
    /* envelope: os vértices dos sólidos no mundo (com origem absoluta por enquanto) */
    var pts = [];
    solidos(c).forEach(function (s) { s.poli.forEach(function (q) { pts.push(s.ponto(q[0], q[1], s.z0)); pts.push(s.ponto(q[0], q[1], s.z1)); }); });
    if (!pts.length) return { erro: "A peça ficou sem geometria." };
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } });
    var C = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    c.cx = r6(C[0]); c.cy = r6(C[1]); c.cz = r6(C[2]);
    c.comprimento = r6(Math.max(0.001, mx[0] - mn[0])); c.altura = r6(Math.max(0.001, mx[1] - mn[1])); c.espessura = r6(Math.max(0.001, mx[2] - mn[2]));
    m.o = O3(sub(Ow, C));
    recalc(c);
    return c;
  }

  /* o referencial da peça NO MUNDO (centro + Ry(rotY)·local) */
  function quadro(c) {
    var m = c.metal || {}, th = num(c.rotY, 0), Cc = [num(c.cx, 0), num(c.cy, 0), num(c.cz, 0)];
    var X = rotY(V(m.ex || [1, 0, 0]), th), Y = rotY(V(m.ey || [0, 1, 0]), th), bs = base(X, Y);
    return { O: add(Cc, rotY(V(m.o), th)), X: bs.X, Y: bs.Y, Z: bs.Z };
  }

  /* ============================================================== SÓLIDOS
   * [{ poli:[[a,b]], furos:[[[a,b]]], z0, z1, ponto(a,b,z) → [x,y,z] (mundo),
   *    O, U, Vv, W (eixos do sólido: mundo = O + U·a + Vv·b + W·z),
   *    cisalha: {ini:[ka,kb], fim:[ka,kb]} (só no perfil cortado) }]
   * O 3D (js/bim.js) extruda cada um com o mapa `ponto`; o IFC (js/ifcsaida.js)
   * usa O/U/Vv/W (e Brep quando há cisalha). */
  function solido(poli, furos, z0, z1, O, U, Vv, W, cis) {
    var s = { poli: poli, furos: furos || [], z0: z0, z1: z1, O: O, U: U, Vv: Vv, W: W, cisalha: cis || null };
    s.ponto = function (a, b, z) {
      var zz = z;
      if (cis) { var k = Math.abs(z - z1) < 1e-12 ? cis.fim : cis.ini; zz = z + k[0] * a + k[1] * b; }
      return add(add(add(O, mul(U, a)), mul(Vv, b)), mul(W, zz));
    };
    return s;
  }
  function solidos(c) {
    var m = c && c.metal; if (!m) return [];
    var q = quadro(c), out = [];
    if (m.kind === "chapa") {
      var C = ptsUV(m.contorno), F = arr(m.furos).map(function (f) { return furoPoli(f); }).concat(arr(m.recortes).map(function (r) { var p = ptsUV(r.pts); return area2(p) > 0 ? p.reverse() : p; }));
      F = F.map(function (f) { return area2(f) > 0 ? f.slice().reverse() : f; });
      out.push(solido(C, F, 0, num(m.t, 0.01), q.O, q.X, q.Y, q.Z));
    } else if (m.kind === "perfil") {
      var s = secaoDe(m.perfil); if (!s || !s.ok) return [];
      /* contorno da seção: a = x do BimArq (largura), b = y (altura); a largura vai em Z = X × Y */
      var ct = m.cortes || {}, tg = function (g) { return Math.tan(num(g, 0) * Math.PI / 180); };
      var cis = (ct.almaIni || ct.almaFim || ct.abaIni || ct.abaFim) ? { ini: [tg(ct.abaIni), tg(ct.almaIni)], fim: [tg(ct.abaFim), tg(ct.almaFim)] } : null;
      out.push(solido(s.contorno, s.furos, 0, num(m.L, 0), q.O, q.Z, q.Y, q.X, cis));
    } else if (m.kind === "parafuso") {
      var N = Norma(), p = N ? N.parafuso(m.id) : null; if (!p) return [];
      var mm = function (v) { return v / 1000; }, X = q.X, Y = q.Y, Z = q.Z, O = q.O, ap = num(m.aperto, 0);
      var hexa = function (sAF) { var r = mm(sAF) / Math.sqrt(3); return circ(0, 0, r, 6); };
      var hC = m.arrCabeca ? mm(p.arr.h) : 0, hP = m.arrPorca ? mm(p.arr.h) : 0, L = mm(num(m.Lmm, 0));
      if (m.chumbador) {
        /* porca e arruela EM CIMA (lado −eixo), a barra atravessa o aperto e desce a ancoragem */
        out.push(solido(hexa(p.s), [circ(0, 0, mm(p.d) / 2, 16).reverse()], -hP - mm(p.m), -hP, O, Y, Z, X));
        if (hP) out.push(solido(circ(0, 0, mm(p.arr.d2) / 2, 24), [circ(0, 0, mm(p.arr.d1) / 2, 16).reverse()], -hP, 0, O, Y, Z, X));
        out.push(solido(circ(0, 0, mm(p.d) / 2, 16), [], -hP - mm(p.m) - mm(3 * p.passo), -hP - mm(p.m) - mm(3 * p.passo) + L, O, Y, Z, X));
      } else {
        out.push(solido(hexa(p.s), [], -hC - mm(p.k), -hC, O, Y, Z, X));
        if (hC) out.push(solido(circ(0, 0, mm(p.arr.d2) / 2, 24), [circ(0, 0, mm(p.arr.d1) / 2, 16).reverse()], -hC, 0, O, Y, Z, X));
        out.push(solido(circ(0, 0, mm(p.d) / 2, 16), [], -hC, -hC + L, O, Y, Z, X));
        if (hP) out.push(solido(circ(0, 0, mm(p.arr.d2) / 2, 24), [circ(0, 0, mm(p.arr.d1) / 2, 16).reverse()], ap, ap + hP, O, Y, Z, X));
        out.push(solido(hexa(p.s), [circ(0, 0, mm(p.d) / 2, 16).reverse()], ap + hP, ap + hP + mm(p.m), O, Y, Z, X));
      }
    } else if (m.kind === "mecanica") {
      var fu = m.tipoMec === "bucha" ? [circ(0, 0, num(m.d, 0) / 2, 32).reverse()] : [];
      out.push(solido(circ(0, 0, num(m.D, 0) / 2, 48), fu, 0, num(m.L, 0), q.O, q.Y, q.Z, q.X));
    }
    return out;
  }

  /* ============================================================== MEDIDAS
   * volume líquido (furos descontados), área de PINTURA, comprimento,
   * massa (aço 7 850 kg/m³). Vão em c.medidas (o BimEdit.medidasDe lê) e
   * em c.massa (o js/bimpeso.js lê a massa do quantitativo — e o içamento
   * parte dela). */
  function recalc(c) {
    var m = c.metal; if (!m) return c;
    var vol = 0, area = 0, comp = 0, massa = 0, estimado = false;
    if (m.kind === "chapa") {
      var C = ptsUV(m.contorno), A = Math.abs(area2(C)), P = perim2(C);
      arr(m.furos).forEach(function (f) { var fm = furoMedidas(f); A -= fm.area; P += fm.perim; });
      arr(m.recortes).forEach(function (r) { var p = ptsUV(r.pts); A -= Math.abs(area2(p)); P += perim2(p); });
      vol = A * m.t; area = 2 * A + P * m.t; comp = 0;
      var xs = C.map(function (q) { return q[0]; }), ys = C.map(function (q) { return q[1]; });
      m.dim = { L: r6(Math.max.apply(null, xs) - Math.min.apply(null, xs)), B: r6(Math.max.apply(null, ys) - Math.min.apply(null, ys)), areaLiq: r6(A) };
    } else if (m.kind === "perfil") {
      var s = secaoDe(m.perfil);
      if (s && s.ok) {
        var cen = centroide(s.contorno), ct = m.cortes || {}, tg = function (g) { return Math.tan(num(g, 0) * Math.PI / 180); };
        vol = s.area * m.L + s.area * ((tg(ct.abaFim) - tg(ct.abaIni)) * cen[0] + (tg(ct.almaFim) - tg(ct.almaIni)) * cen[1]);
        arr(m.furos).forEach(function (f) { vol -= furoMedidas(f).area * espessuraFace(m.perfil, f.face); });
        var cat = m.perfil.cat && Aco() ? Aco().obter(m.perfil.cat) : null;
        area = (cat && cat.per > 0 ? cat.per : s.perimetro) * m.L;
        comp = m.L;
        m.secaoArea = r6(s.area); m.perfilRotulo = s.rotulo;
      }
    } else if (m.kind === "parafuso") {
      var N = Norma(), p = N ? N.parafuso(m.id) : null;
      if (p) {
        var mm = function (v) { return v / 1000; }, hx = function (sAF) { return Math.sqrt(3) / 2 * mm(sAF) * mm(sAF); };
        var arA = Math.PI / 4 * (mm(p.arr.d2) * mm(p.arr.d2) - mm(p.arr.d1) * mm(p.arr.d1)), haste = Math.PI / 4 * mm(p.d) * mm(p.d);
        vol = haste * mm(m.Lmm) + (m.chumbador ? 0 : hx(p.s) * mm(p.k)) + (hx(p.s) - haste) * mm(p.m) + (num(m.arrCabeca, 0) + num(m.arrPorca, 0)) * arA * mm(p.arr.h);
        comp = mm(m.Lmm); estimado = true;
      }
    } else if (m.kind === "mecanica") {
      var Ae = Math.PI / 4 * (m.D * m.D - num(m.d, 0) * num(m.d, 0));
      vol = Ae * m.L; area = Math.PI * m.D * m.L + 2 * Ae + (m.d ? Math.PI * m.d * m.L : 0); comp = m.L;
    }
    massa = vol * RHO;
    c.volume = r6(vol); c.massa = r4(massa); c.area = r6(area);
    c.medidas = { un: 1, volume: r6(vol), area: r6(area), comprimento: r6(comp), massa: r4(massa) };
    if (estimado) c.medidas.massaEstimada = 1;
    return c;
  }
  function centroide(p) {
    var A = 0, cx = 0, cy = 0;
    for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length], k = a[0] * b[1] - b[0] * a[1]; A += k; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k; }
    return Math.abs(A) > 1e-15 ? [cx / (3 * A), cy / (3 * A)] : [0, 0];
  }

  /* ============================================== MEMBRO (adaptador único)
   * pilar/viga do modelador (BimArq, com perfil) ou perfil daqui → o mesmo
   * referencial: P0 = início do SÓLIDO, Pref = início da REFERÊNCIA (de
   * onde os furos medem x), X = eixo, B = altura da seção (b), A = X × B
   * (largura, a), L = comprimento do sólido, xOff = P0 − Pref ao longo de X. */
  function membro(c) {
    if (!c) return null;
    var A9 = Arq(), s, P0, X, B, A, L, Pref, cortes = {};
    if (c.tipo === "metal" && c.metal && c.metal.kind === "perfil") {
      var q = quadro(c); s = secaoDe(c.metal.perfil); if (!s || !s.ok) return null;
      var xr = num(c.metal.xRef, 0);
      return { id: c.id, origem: "metal", perfil: c.metal.perfil, s: s, P0: q.O, Pref: sub(q.O, mul(q.X, xr)), X: q.X, B: q.Y, A: q.Z, L: num(c.metal.L, 0), xOff: xr, cortes: clone(c.metal.cortes || {}), aco: c.metal.aco, caixa: c };
    }
    if ((c.tipo === "viga" || c.tipo === "pilar") && c.perfil && A9) {
      s = A9.secao(c.perfil); if (!s.ok) return null;
      var E9 = Estrut();
      if (c.tipo === "viga") {
        var g = E9 ? E9.geomViga(c, s) : null;
        if (!g) {
          var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), Lh = num(c.comprimento, 0), topo = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
          g = { C: [num(c.cx, 0), topo - s.alt / 2, num(c.cz, 0)], T: [co, 0, -si], N: [0, 1, 0], W: [si, 0, co], s0: -Lh / 2 + num(c.recuoIni, 0), s1: Lh / 2 - num(c.recuoFim, 0), Lax: Lh };
        }
        X = g.T; B = g.N; A = cross(X, B); P0 = add(g.C, mul(X, g.s0)); Pref = add(g.C, mul(X, -g.Lax / 2)); L = g.s1 - g.s0;
      } else {
        var gp = E9 && E9.inclinado(c) ? E9.geomPilar(c, s) : null, H = num(c.altura, 0), bse = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - H / 2;
        if (gp) { X = gp.T; A = gp.U; B = gp.V; P0 = gp.B; L = gp.Lax; }
        else { var c2 = Math.cos(num(c.rotY, 0)), s2 = Math.sin(num(c.rotY, 0)); X = [0, 1, 0]; A = [c2, 0, -s2]; B = [s2, 0, c2]; P0 = [num(c.cx, 0), bse, num(c.cz, 0)]; L = H; }
        Pref = P0;
        /* A = X × B tem de valer (o mesmo sentido do metal): pilar → A = up × B */
        var Ac = cross(X, B); if (dot(Ac, A) < 0) B = mul(B, -1);
        A = cross(X, B);
      }
      return { id: c.id, origem: "arq", perfil: c.perfil, s: s, P0: P0, Pref: Pref, X: X, B: B, A: A, L: L, xOff: dot(sub(P0, Pref), X), cortes: cortes, aco: c.aco || "ASTM A572 Gr.50", caixa: c };
    }
    return null;
  }
  function membroPonto(mb, x, a, b) { return add(add(add(mb.Pref, mul(mb.X, x)), mul(mb.A, a)), mul(mb.B, b)); }

  /* AS FACES do perfil (para furo, máquina e desenho): normal no referencial
     (eixo "a" ou "b"), a faixa do plano (meio da espessura), a espessura, de
     onde o y da face mede e a faixa útil. Unidades: m. */
  function espessuraFace(p, face) {
    if (!p) return 0;
    if (p.forma === "I" || p.forma === "U") return face === "v" || face === "h" ? num(p.tw, 0) : num(p.tf, 0);
    if (p.forma === "L" || p.forma === "tubo-ret" || p.forma === "tubo-circ") return num(p.t, 0);
    if (p.forma === "ret") return num(p.b, 0);
    if (p.forma === "circ") return num(p.d, 0);
    return 0;
  }
  function faces(p) {
    var f = p && p.forma, g = function (k) { return num(p[k], 0); }, F = [];
    if (f === "I" || f === "U") {
      var d = g("d"), bf = g("bf"), tw = g("tw"), tf = g("tf"), aw = f === "I" ? 0 : -bf / 2 + tw / 2;
      F.push({ face: "v", n: "a", meio: aw, t: tw, y0: -d / 2, eixoY: "b", larg: d });
      F.push({ face: "o", n: "b", meio: d / 2 - tf / 2, t: tf, y0: -bf / 2, eixoY: "a", larg: bf });
      F.push({ face: "u", n: "b", meio: -d / 2 + tf / 2, t: tf, y0: -bf / 2, eixoY: "a", larg: bf });
    } else if (f === "L") {
      var a2 = g("a"), b2 = g("b"), t = g("t");
      F.push({ face: "v", n: "a", meio: -b2 / 2 + t / 2, t: t, y0: -a2 / 2, eixoY: "b", larg: a2 });
      F.push({ face: "u", n: "b", meio: -a2 / 2 + t / 2, t: t, y0: -b2 / 2, eixoY: "a", larg: b2 });
    } else if (f === "tubo-ret") {
      var bt = g("b"), ht = g("h"), tt = g("t");
      F.push({ face: "v", n: "a", meio: -bt / 2 + tt / 2, t: tt, y0: -ht / 2, eixoY: "b", larg: ht });
      F.push({ face: "h", n: "a", meio: bt / 2 - tt / 2, t: tt, y0: -ht / 2, eixoY: "b", larg: ht });
      F.push({ face: "o", n: "b", meio: ht / 2 - tt / 2, t: tt, y0: -bt / 2, eixoY: "a", larg: bt });
      F.push({ face: "u", n: "b", meio: -ht / 2 + tt / 2, t: tt, y0: -bt / 2, eixoY: "a", larg: bt });
    } else if (f === "ret") {
      F.push({ face: "v", n: "a", meio: 0, t: g("b"), y0: -g("h") / 2, eixoY: "b", larg: g("h") });
    } else if (f === "circ" || f === "tubo-circ") {
      var D = f === "circ" ? g("d") : g("D");
      F.push({ face: "v", n: "a", meio: 0, t: D, y0: -D / 2, eixoY: "b", larg: D });
    }
    return F;
  }
  /* o centro do furo da face (x da referência, y da face) → ponto no mundo e o eixo do furo */
  function furoMundo(mb, f) {
    var fc = faces(mb.perfil).filter(function (q) { return q.face === f.face; })[0]; if (!fc) return null;
    var yy = fc.y0 + num(f.y, 0), a = fc.n === "a" ? fc.meio : yy, b = fc.n === "b" ? fc.meio : yy;
    return { P: membroPonto(mb, num(f.x, 0), a, b), eixo: fc.n === "a" ? mb.A : mb.B, t: fc.t };
  }
  /* o parafuso (reta P + s·D, s ∈ [s0, s1]) atravessa quais faces deste membro?
     Devolve [{face, x (da referência), y, s (onde cruza), t}] — x e y em m */
  function furosDoEixo(mb, P, D, s0, s1, tol) {
    tol = tol == null ? 0.002 : tol;
    var out = [], d = sub(P, mb.Pref), lx = dot(d, mb.X), la = dot(d, mb.A), lb = dot(d, mb.B), dx = dot(D, mb.X), da = dot(D, mb.A), dB = dot(D, mb.B);
    faces(mb.perfil).forEach(function (fc) {
      var comp = fc.n === "a" ? da : dB; if (Math.abs(comp) < 0.95) return;
      var s = ((fc.n === "a" ? fc.meio - la : fc.meio - lb)) / comp;
      if (s < s0 - fc.t / 2 - tol || s > s1 + fc.t / 2 + tol) return;
      var x = lx + dx * s, a = la + da * s, b = lb + dB * s, y = (fc.eixoY === "a" ? a : b) - fc.y0;
      var xs = x - mb.xOff;
      if (xs < -tol || xs > mb.L + tol || y < -tol || y > fc.larg + tol) return;
      out.push({ face: fc.face, x: r6(x), y: r6(y), s: s, t: fc.t });
    });
    return out;
  }

  /* =================================================== EXTENSÃO DO REPLAY
   * metalFuros {op, id, lig, furos:[…]} e metalApagarLig {op, lig} */
  function furoOpOk(f) { return !!f && typeof f === "object" && /^[ouvh]$/.test(String(f.face)) && fin(f.x) && fin(f.y) && fin(f.db) && f.db > 0 && (f.d == null || (fin(f.d) && f.d > 0)); }
  var extensao = {
    nome: "metal",
    valida: function (o) {
      if (!o) return undefined;
      if (o.op === "metalFuros") return o.id != null && typeof o.lig === "string" && o.lig.length > 0 && Array.isArray(o.furos) && o.furos.every(furoOpOk);
      if (o.op === "metalApagarLig") return typeof o.lig === "string" && o.lig.length > 0;
      return undefined;
    },
    aplicar: function (o, ctx) {
      if (!o || !ctx) return false;
      if (o.op === "metalFuros") {
        var c = ctx.caixas[o.id]; if (!c) return false;
        c.metalFuros = arr(c.metalFuros).filter(function (f) { return f.lig !== o.lig; }).concat(o.furos.map(function (f) { var h = normFuroFace(f); if (h) h.lig = o.lig; return h; }).filter(Boolean));
        if (!c.metalFuros.length) delete c.metalFuros;
        return true;
      }
      if (o.op === "metalApagarLig") {
        Object.keys(ctx.caixas).forEach(function (id) {
          var c2 = ctx.caixas[id];
          if (c2 && c2.metal && c2.metal.lig === o.lig) { delete ctx.caixas[id]; var ix = ctx.ordem.indexOf(id); if (ix < 0) ix = ctx.ordem.indexOf(Number(id)); if (ix >= 0) ctx.ordem.splice(ix, 1); return; }
          if (c2 && c2.metalFuros) { c2.metalFuros = c2.metalFuros.filter(function (f) { return f.lig !== o.lig; }); if (!c2.metalFuros.length) delete c2.metalFuros; }
        });
        return true;
      }
      return false;
    }
  };
  /* os furos de UM membro: os da própria peça (perfil daqui) + os das ligações */
  function furosDe(c) { return arr(c && c.metal && c.metal.furos).concat(arr(c && c.metalFuros)); }

  /* nome para a árvore do modelo e a lista */
  function nome(c) {
    var m = c && c.metal; if (!m) return "Peça metálica";
    if (m.nome) return m.nome;
    if (m.kind === "chapa") return m.papel + " #" + Math.round(m.t * 10000) / 10 + " mm";
    if (m.kind === "perfil") return m.papel + " " + (m.perfilRotulo || (m.perfil && (m.perfil.cat || m.perfil.forma)) || "");
    if (m.kind === "parafuso") return m.papel + " " + m.id + " × " + m.Lmm + " mm (" + ((Norma() && Norma().CLASSES[m.classe] || {}).nome || m.classe) + ")";
    return m.papel + " Ø" + Math.round(m.D * 10000) / 10 + " mm";
  }

  var BimMetal = {
    RHO: RHO,
    chapa: chapa, perfil: perfil, parafuso: parafuso, mecanica: mecanica, flange: flange, suporte: suporte,
    quadro: quadro, solidos: solidos, recalc: recalc, membro: membro, membroPonto: membroPonto, faces: faces, espessuraFace: espessuraFace,
    furoMundo: furoMundo, furosDoEixo: furosDoEixo, furosDe: furosDe, normFuroFace: normFuroFace, furoPoli: furoPoli, furoMedidas: furoMedidas,
    nome: nome, extensao: extensao,
    /* utilitários para os outros módulos metálicos */
    vet: { add: add, sub: sub, mul: mul, dot: dot, cross: cross, len: len, unit: unit, V: V, O3: O3, base: base, rotY: rotY },
    pol: { area: area2, perim: perim2, circ: circ, oblongo: oblongo, chanfrar: chanfrar, centroide: centroide, uv: ptsUV }
  };
  /* o replay passa a conhecer as ops metalFuros / metalApagarLig */
  var BE = dep("BimEdit", "./bimedit.js"); if (BE && BE.estender) BE.estender(extensao);
  global.BimMetal = BimMetal;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

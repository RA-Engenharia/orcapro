/* =====================================================================
 * metaltanque.js — TANQUES METÁLICOS NO MODELO 3D (motor PURO, ES5, sem
 * DOM, Node-testável). Frente T da Metálica industrial, 14/10/2026.
 *
 * Quem calcula é o js/acotanque.js (espessuras, teto, anéis, acessórios);
 * aqui o resultado vira PEÇAS do editor (op `criar` num LOTE — um Ctrl+Z
 * desfaz o tanque inteiro), com o peso de cada peça no quantitativo do BIM
 * (c.massa, js/metalpeca.js):
 *   costado      um anel por chapa comercial: perfil "tubo-circ" (Ø pela
 *                linha média, espessura do anel) — peso exato do anel;
 *   fundo        chapa circular (+ anel anular, chapa em coroa);
 *   teto         cônico: setores triangulares planos; domo: faixas de
 *                trapézios planos + calota; suportado: + caibros W e a
 *                coluna central; aberto: nada (anel de topo);
 *   cantoneira   de topo: aba vertical (anel) + aba horizontal (coroa);
 *   anéis        de contraventamento: coroas horizontais na cota do cálculo;
 *   acessórios   escada helicoidal (degraus, patamares, longarinas,
 *                guarda-corpo) ou de marinheiro (montantes, degraus Ø 25,
 *                gaiola com arcos e barras), plataforma de topo com
 *                guarda-corpo, bocais com flange, bocas de visita,
 *                indicador de nível, chumbadores com chapa de apoio;
 *   horizontal   costado em anéis deitados, tampos, duas selas;
 *   elevado      a cuba sobre a grelha + a torre (pilares, travessas e
 *                diagonais em X) — as barras da torre NÃO levam `lig`:
 *                saem prontas para o Cálculo › Estrutura desenhada.
 *
 * IDENTIDADE: toda peça leva `caixa.tanque = gid`; a 1ª leva
 * `caixa.tanqueInfo = { id, par, em, ref }` — "Editar tanque" lê o par e
 * refaz NO LUGAR (apagar + criar num lote). As peças da cuba levam
 * `metal.lig = "tq-<gid>"`: o leitor do cálculo da estrutura desenhada as
 * trata como conjunto (não vira barra).
 * Referencial: origem no CENTRO DA BASE do tanque (x0, y0, z0), giro em
 * volta de +Y (graus, convenção do editor). Metros.
 *   MetalTanque.gerar(par, novoId) → { ok, op, pecas, finais, resultado, linhas, resumo, avisos, massa, contagem }
 *   MetalTanque.identidade(r, gid, info, alvo) · tanques(caixas) · parParaRefazer(t)
 *   MetalTanque.esquema(resultado) (SVG da prévia) · desenho(id) / dica(id) (dicas ilustradas)
 *   MetalTanque.contorno(par) → linhas leves para o cursor (arame)
 * Teste: node tools/test-aco-tanque.js (motor) e tools/e2e-metal-tanque.js (tela)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function T() { return dep("AcoTanque", "./acotanque.js"); }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [1, 0, 0]; }
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  function circ(r, n, a0) { var o = []; for (var i = 0; i < n; i++) { var a = (a0 || 0) + 2 * Math.PI * i / n; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
  /* ponto local no ângulo a (graus, no plano XZ: 0° = +X, 90° = −Z — a planta com Z para baixo vira o sentido anti-horário) */
  function polar(r, aG, y) { var a = aG * Math.PI / 180; return [r * Math.cos(a), y, -r * Math.sin(a)]; }
  function radial(aG) { var a = aG * Math.PI / 180; return [Math.cos(a), 0, -Math.sin(a)]; }
  function tang(aG) { var a = aG * Math.PI / 180; return [-Math.sin(a), 0, -Math.cos(a)]; }
  var UP = [0, 1, 0], GRAU = Math.PI / 180;

  /* ============================================================ CONSTRUTOR */
  function construtor(novoId, O, giroG, gid) {
    var th = num(giroG, 0) * GRAU, K = { ops: [], pecas: [], cont: {}, avisos: [], lig: "tq-" + gid };
    K.W = function (l) { return add(O, rotY(l, th)); };
    K.D = function (d) { return rotY(d, th); };
    K.nova = function (cx, rot, conta) {
      if (!cx || cx.erro) { K.avisos.push((rot || "peça") + ": " + (cx ? cx.erro : "falhou")); return null; }
      cx.id = String(novoId()); K.pecas.push(cx); K.ops.push({ op: "criar", id: cx.id, caixa: cx });
      if (conta) K.cont[conta] = (K.cont[conta] || 0) + 1;
      return cx;
    };
    /* anel vertical (costado, aba da cantoneira, bocal) — perfil tubo circular */
    K.tubo = function (P0, eixo, ref, Dext, t, L, o, conta) {
      return K.nova(M().perfil({ origem: K.W(P0), ex: K.D(eixo), ey: K.D(ref), perfil: { forma: "tubo-circ", D: r4(Dext), t: Math.max(0.0015, t) }, L: L, papel: o.papel, ifc: o.ifc || "IFCPLATE", aco: o.aco || "ASTM A36", lig: o.semLig ? null : K.lig, nome: o.nome }), o.nome, conta);
    };
    /* chapa horizontal em disco ou coroa (fundo, anel anular, anel de vento, aba da cantoneira) — a espessura desce da cota y */
    K.coroa = function (y, Rout, Rin, t, o, conta, n) {
      var c = circ(Rout, n || 72), rec = Rin > 0 ? [circ(Rin, n || 72).reverse()] : [];
      return K.nova(M().chapa({ origem: K.W([0, y, 0]), ex: K.D([1, 0, 0]), ey: K.D([0, 0, 1]), t: t, contorno: c, recortes: rec, papel: o.papel, aco: o.aco || "ASTM A36", lig: K.lig, nome: o.nome }), o.nome, conta);
    };
    /* chapa plana pelos pontos LOCAIS (coplanares); a espessura vai para o lado de `fora` */
    K.plana = function (pts, t, fora, o, conta) {
      var P1 = pts[0], ex = unit(sub(pts[1], P1)), nrm = null;
      for (var i = 2; i < pts.length && !nrm; i++) { var c = cross(sub(pts[1], P1), sub(pts[i], P1)); if (len(c) > 1e-9) nrm = unit(c); }
      if (!nrm) return null;
      if (fora && dot(nrm, fora) < 0) nrm = mul(nrm, -1);
      var ey = cross(nrm, ex), uv = pts.map(function (P) { var d = sub(P, P1); return [dot(d, ex), dot(d, ey)]; });
      return K.nova(M().chapa({ origem: K.W(P1), ex: K.D(ex), ey: K.D(ey), t: t, contorno: uv, papel: o.papel, aco: o.aco || "ASTM A36", lig: o.semLig ? null : K.lig, nome: o.nome, furos: o.furos }), o.nome, conta);
    };
    /* barra de catálogo ou paramétrica entre dois pontos LOCAIS (eixo no centro da seção) */
    K.barraEixo = function (A, B, perfil, ref, o, conta) {
      var X = unit(sub(B, A)), Y = sub(ref, mul(X, dot(ref, X))); if (len(Y) < 1e-6) Y = Math.abs(X[1]) < 0.9 ? UP : [1, 0, 0]; Y = unit(Y);
      return K.nova(M().perfil({ origem: K.W(A), ex: K.D(X), ey: K.D(Y), perfil: perfil.forma ? perfil : null, cat: perfil.forma ? null : perfil, L: len(sub(B, A)), papel: o.papel, ifc: o.ifc || "IFCMEMBER", aco: o.aco || "ASTM A36", lig: o.semLig ? null : K.lig, nome: o.nome }), o.nome, conta);
    };
    /* barra pela LINHA (torre: o cálculo da estrutura desenhada lê a linha) */
    K.barraLinha = function (A, B, q, conta) {
      var Mc = MC(); if (!Mc) return null;
      var c = Mc.barra(K.W(A), K.W(B), q); return K.nova(c, q.nome || q.papel, conta);
    };
    return K;
  }
  function cat(nome) { var A = Aco(); if (!A) return null; var C = MC(); var n = C && C.perfilCat ? (C.perfilCat(nome) || nome) : nome; return A.paraPerfil(n) ? n : null; }

  /* ============================================================ GUARDA-CORPO (montantes + travessas) por um caminho local */
  function guardaCorpo(K, pts, o) {
    var G = (T().acessosRef() || {}).guardaCorpo || { altura: 1.1, intermediario: 0.7, rodape: 0.2 }, mont = { forma: "tubo-circ", D: 0.0483, t: 0.0037 }, n0 = K.pecas.length, posts = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], L = len(sub(b, a)); if (!(L > 0.05)) continue;
      var nS = Math.max(1, Math.ceil(L / (o.espac || 1.5) - 1e-9));
      for (var k = 0; k <= nS; k++) { if (k === 0 && i > 0) continue; posts.push(add(a, mul(sub(b, a), k / nS))); }
    }
    posts.forEach(function (P, k) { K.barraEixo(P, add(P, [0, G.altura, 0]), mont, [1, 0, 0], { papel: "Montante do guarda-corpo", nome: (o.nome || "Guarda-corpo") + " — montante " + (k + 1) }, "guarda"); });
    [G.altura, G.intermediario].forEach(function (h, j) {
      for (var i2 = 0; i2 + 1 < pts.length; i2++) { var A = add(pts[i2], [0, h, 0]), B = add(pts[i2 + 1], [0, h, 0]); if (len(sub(B, A)) > 0.05) K.barraEixo(A, B, mont, UP, { papel: j ? "Travessa intermediária" : "Travessa superior do guarda-corpo", ifc: "IFCRAILING", nome: (o.nome || "Guarda-corpo") + (j ? " — intermediária" : " — superior") + " " + (i2 + 1) }, "guarda"); }
    });
    if (o.rodape !== false) for (var i3 = 0; i3 + 1 < pts.length; i3++) {
      var A3 = pts[i3], B3 = pts[i3 + 1]; if (len(sub(B3, A3)) < 0.05) continue;
      K.plana([A3, B3, add(B3, [0, G.rodape, 0]), add(A3, [0, G.rodape, 0])], 0.003, o.fora ? o.fora(i3) : null, { papel: "Rodapé", nome: (o.nome || "Guarda-corpo") + " — rodapé " + (i3 + 1) }, "guarda");
    }
    for (var q = n0; q < K.pecas.length; q++) K.pecas[q].metal.acessorio = "guarda-corpo";
    return K.pecas.length - n0;
  }

  /* ============================================================ CUBA VERTICAL (vertical e elevado) */
  function cubaVertical(K, p, r, y0) {
    var D = p.D, R = D / 2, an = r.costado.aneis, tt = r.teto, fd = r.fundo, aco = p.aco;
    /* fundo */
    K.coroa(y0, fd.Dext / 2, fd.anular ? R - fd.anular.interna + 0.05 : 0, fd.t / 1000, { papel: "Fundo do tanque", aco: aco, nome: "Fundo #" + br(fd.t, 1) + " mm" }, "fundo");
    if (fd.anular) K.coroa(y0 + 0.0005, R + fd.projecao + an[0].t / 2000, R - fd.anular.interna, fd.anular.t / 1000, { papel: "Anel anular do fundo", aco: aco, nome: "Anel anular #" + br(fd.anular.t, 1) + " mm" }, "fundo");
    /* costado: um anel por chapa */
    an.forEach(function (a) { var t = a.t / 1000; K.tubo([0, y0 + a.z0, 0], UP, [1, 0, 0], D + t, t, a.largura, { papel: "Costado — anel " + a.i, aco: aco, nome: "Costado anel " + a.i + " #" + br(a.t, 1) + " mm" }, "costado"); });
    var tS = an[an.length - 1].t / 1000, Rext = R + tS / 2, yTop = y0 + p.H;
    /* cantoneira de topo: aba vertical por fora + aba horizontal para fora */
    var cp = Aco() ? Aco().obter(tt.cantoneira.cat) : null, ca = cp ? cp.b / 1000 : 0.05, tc = cp ? cp.t / 1000 : 0.005;
    if (p.teto !== "aberto") {
      K.tubo([0, yTop - ca, 0], UP, [1, 0, 0], 2 * (Rext + tc), tc, ca, { papel: "Cantoneira de topo (aba vertical)", nome: "Cantoneira de topo " + tt.cantoneira.nome }, "cantoneira");
      K.coroa(yTop, Rext + ca, Rext + tc, tc, { papel: "Cantoneira de topo (aba horizontal)", nome: "Cantoneira de topo " + tt.cantoneira.nome }, "cantoneira");
    }
    /* anéis de contraventamento */
    arr(r.contraventamento && r.contraventamento.aneis).forEach(function (g, i) { K.coroa(y0 + g.cota, Rext + g.secao.b / 1000, Rext, g.secao.t / 1000, { papel: "Anel de contraventamento", nome: "Anel de contraventamento " + (g.tipo === "topo" ? "de topo" : (i + 1)) + " — " + g.secao.nome }, "aneis"); });
    /* teto */
    var tr = tt.t / 1000, nS = D > 10 ? 36 : 24;
    if (p.teto === "conico-autoportante" || p.teto === "conico-suportado") {
      var ap = [0, yTop + tt.flecha, 0];
      for (var s = 0; s < nS; s++) { var a0 = 360 * s / nS, a1 = 360 * (s + 1) / nS; K.plana([polar(Rext, a0, yTop), polar(Rext, a1, yTop), ap], tr, UP, { papel: "Teto (chapa)", nome: "Teto — setor " + (s + 1) + " #" + br(tt.t, 1) + " mm" }, "teto"); }
    } else if (p.teto === "domo") {
      var Rd = tt.Rd, fx = 4, phiMax = Math.asin(Math.min(1, Rext / Rd)), yc = yTop + tt.flecha - Rd;
      for (var b = 0; b < fx; b++) {
        var p1 = phiMax * (fx - b) / fx, p2 = phiMax * (fx - b - 1) / fx, r1 = Rd * Math.sin(p1), r2_ = Rd * Math.sin(p2), y1 = yc + Rd * Math.cos(p1), y2 = yc + Rd * Math.cos(p2);
        for (var s2 = 0; s2 < nS; s2++) {
          var b0 = 360 * s2 / nS, b1 = 360 * (s2 + 1) / nS;
          var pts = r2_ > 1e-4 ? [polar(r1, b0, y1), polar(r1, b1, y1), polar(r2_, b1, y2), polar(r2_, b0, y2)] : [polar(r1, b0, y1), polar(r1, b1, y1), [0, y2, 0]];
          K.plana(pts, tr, UP, { papel: "Teto em domo (chapa)", nome: "Domo — faixa " + (b + 1) + " setor " + (s2 + 1) }, "teto");
        }
      }
    }
    /* teto suportado: caibros + coluna central */
    if (p.teto === "conico-suportado" && tt.caibros && tt.caibros.perfil) {
      var cq = Aco().obter(tt.caibros.perfil), d = cq.d / 1000, th = Math.atan2(tt.flecha, R), r0 = 0.35, nC = tt.caibros.n;
      var hcol = (tt.coluna && tt.coluna.perfil) ? Aco().obter(tt.coluna.perfil) : null;
      for (var c = 0; c < nC; c++) {
        var ac = 360 * c / nC, yA = yTop + (Rext - r0) * Math.tan(th) - tr - d / 2 / Math.cos(th), yB = yTop - tr - d / 2 / Math.cos(th) + 0.03 * Math.tan(th);
        K.barraEixo(polar(r0, ac, yA), polar(Rext - 0.03, ac, yB), tt.caibros.perfil, UP, { papel: "Caibro do teto", ifc: "IFCBEAM", aco: tt.caibros.aco, nome: "Caibro " + (c + 1) + " " + tt.caibros.perfil }, "caibros");
      }
      if (hcol) {
        var yCol = yTop + (Rext - r0) * Math.tan(th) - tr - d / Math.cos(th) - 0.02;
        K.barraEixo([0, y0, 0], [0, yCol, 0], tt.coluna.perfil, [1, 0, 0], { papel: "Coluna central do teto", ifc: "IFCCOLUMN", nome: "Coluna central " + tt.coluna.perfil }, "coluna");
        K.coroa(yCol + 0.025, r0 + 0.1, 0, 0.025, { papel: "Capitel da coluna", nome: "Capitel da coluna central" }, "coluna", 36);
        K.coroa(y0 + 0.02, 0.3, 0, 0.0125, { papel: "Base da coluna", nome: "Base da coluna central" }, "coluna", 36);
      }
    }
    return { Rext: Rext, yTop: yTop, tS: tS };
  }

  /* ============================================================ ACESSÓRIOS DA CUBA VERTICAL */
  function escadaHelicoidal(K, p, r, y0, Rext, ang0) {
    var es = r.acessorios.itens.filter(function (x) { return /helicoidal/.test(x.nome); })[0]; if (!es) return 0;
    var larg = es.largura, e = es.espelho, gd = es.piso, nD = es.degraus, Hs = p.H, ri = Rext + 0.05, rm = ri + larg / 2, ro = ri + larg, G = (T().acessosRef() || {}).escada || { patamarCada: 3 };
    var ang = ang0, y = y0, k = 0, nPat = 0, ultimoPat = y0, linhaE = [], linhaD = [];
    var Ucat = cat("C200X17.1") || cat("C150X12.2");
    function passoAng(sArc) { return sArc / rm * 180 / Math.PI; }
    linhaE.push(polar(ri, ang, y0)); linhaD.push(polar(ro, ang, y0));
    while (k < nD && y < y0 + Hs - 1e-6) {
      var yN = Math.min(y + e, y0 + Hs), a1 = ang + passoAng(gd);
      /* degrau: chapa xadrez no setor [ang, a1] */
      K.plana([polar(ri, ang, yN), polar(ro, ang, yN), polar(ro, a1, yN), polar(ri, a1, yN)], 0.00635, UP, { papel: "Degrau em chapa xadrez", nome: "Escada helicoidal — degrau " + (k + 1) }, "degraus");
      y = yN; ang = a1; k++;
      linhaE.push(polar(ri, ang, y)); linhaD.push(polar(ro, ang, y));
      if (y - ultimoPat >= G.patamarCada - 1e-6 && y < y0 + Hs - 0.3) {
        var a2 = ang + passoAng(0.8);
        K.plana([polar(ri, ang, y), polar(ro, ang, y), polar(ro, a2, y), polar(ri, a2, y)], 0.00635, UP, { papel: "Patamar de descanso", nome: "Escada helicoidal — patamar " + (nPat + 1) }, "patamares");
        ang = a2; ultimoPat = y; nPat++;
        linhaE.push(polar(ri, ang, y)); linhaD.push(polar(ro, ang, y));
      }
    }
    /* longarinas (U) em cordas a cada 3 pontos; guarda-corpo do lado de fora */
    function longarina(lin, nome) {
      for (var i = 0; i + 1 < lin.length; i += 3) {
        var j = Math.min(i + 3, lin.length - 1), A = add(lin[i], [0, -0.1, 0]), B = add(lin[j], [0, -0.1, 0]);
        if (Ucat) K.barraEixo(A, B, Ucat, UP, { papel: "Longarina da escada", nome: nome + " " + (Math.floor(i / 3) + 1) }, "longarinas");
      }
    }
    longarina(linhaE, "Longarina interna"); longarina(linhaD, "Longarina externa");
    var gc = []; for (var g = 0; g < linhaD.length; g += 3) gc.push(linhaD[g]); if (gc[gc.length - 1] !== linhaD[linhaD.length - 1]) gc.push(linhaD[linhaD.length - 1]);
    guardaCorpo(K, gc, { nome: "Guarda-corpo da escada", espac: 2.0, rodape: false });
    return { angFim: ang, degraus: k, patamares: nPat };
  }
  function marinheiro(K, p, r, y0, Rext, aG, Htot, rotulo) {
    var es = r.acessorios.itens.filter(function (x) { return /marinheiro/.test(x.nome); })[0]; if (!es) return 0;
    var Mn = (T().acessosRef() || {}).marinheiro || {}, d0 = Rext + (es.afastamento || 0.2), w = es.largura || 0.45, rad = radial(aG), tg = tang(aG), Htop = Htot + (es.prolongamento || 1.1);
    var bar = { forma: "ret", b: 0.0127, h: 0.0635 }, rung = { forma: "circ", d: 0.025 };
    [-1, 1].forEach(function (s) { var P = add(mul(rad, d0), mul(tg, s * w / 2)); K.barraEixo([P[0], y0, P[2]], [P[0], y0 + Htop, P[2]], bar, tg, { papel: "Montante da escada de marinheiro", nome: (rotulo || "Escada de marinheiro") + " — montante " + (s < 0 ? "esq." : "dir.") }, "marinheiro"); });
    var nd = Math.floor(Htot / 0.30);
    for (var k = 1; k <= nd; k++) { var yk = y0 + k * 0.30, A = add(mul(rad, d0), mul(tg, -w / 2)), B = add(mul(rad, d0), mul(tg, w / 2)); K.barraEixo([A[0], yk, A[2]], [B[0], yk, B[2]], rung, UP, { papel: "Degrau da escada de marinheiro", nome: (rotulo || "Escada de marinheiro") + " — degrau " + k }, "marinheiro"); }
    if (es.gaiola) {
      var rc = (es.diamGaiola || 0.7) / 2, C = mul(rad, d0 + rc), yG0 = y0 + (Mn.gaiolaDesde || 2.0), passoArco = es.arcos || 1.2, nA = Math.max(2, Math.ceil((y0 + Htop - yG0) / passoArco - 1e-9) + 1);
      /* arcos: coroa plana aberta do lado da escada (± 75° a partir do lado de dentro) */
      var abre = 75, pts = function (yy) { var o = [], i, a; for (i = 0; i <= 20; i++) { a = (aG + 180 + abre) + (360 - 2 * abre) * i / 20; o.push(add(C, polar(rc + 0.05, a, 0))); } for (i = 20; i >= 0; i--) { a = (aG + 180 + abre) + (360 - 2 * abre) * i / 20; o.push(add(C, polar(rc, a, 0))); } return o.map(function (q) { return [q[0], yy, q[2]]; }); };
      for (var j = 0; j < nA; j++) { var yy = Math.min(yG0 + j * passoArco, y0 + Htop); K.plana(pts(yy), 0.0064, UP, { papel: "Arco da gaiola", nome: (rotulo || "Escada de marinheiro") + " — arco " + (j + 1) }, "gaiola"); }
      var nB = 6; for (var b = 0; b < nB; b++) { var ab = (aG + 180 + abre + 8) + (360 - 2 * abre - 16) * b / (nB - 1), Pb = add(C, polar(rc + 0.025, ab, 0)); K.barraEixo([Pb[0], yG0, Pb[2]], [Pb[0], y0 + Htop, Pb[2]], { forma: "ret", b: 0.0127, h: 0.050 }, tang(ab), { papel: "Barra vertical da gaiola", nome: (rotulo || "Escada de marinheiro") + " — barra da gaiola " + (b + 1) }, "gaiola"); }
    }
    /* plataformas de descanso (lances de até 6 m) */
    for (var L = 1; L < (es.lances || 1); L++) { var yL = y0 + Htot * L / es.lances, P0 = mul(rad, d0 - 0.1); K.plana([add([P0[0], yL, P0[2]], mul(tg, -0.45)), add([P0[0], yL, P0[2]], mul(tg, 0.45)), add(add([P0[0], yL, P0[2]], mul(tg, 0.45)), mul(rad, 0.8)), add(add([P0[0], yL, P0[2]], mul(tg, -0.45)), mul(rad, 0.8))], 0.025, UP, { papel: "Plataforma de descanso (grade)", nome: (rotulo || "Escada de marinheiro") + " — plataforma de descanso " + L }, "plataformas"); }
    return nd;
  }
  /* PASSARELA EM VOLTA (manutenção): setores de grade planos em coroa, consoles radiais e guarda-corpo por fora,
     aberto onde chega a escada (aG) */
  function passarelaAnel(K, p, r, Rext, y, aG) {
    var it = r.acessorios.itens.filter(function (x) { return /Passarela em volta/.test(x.nome); })[0]; if (!it) return 0;
    var w = it.largura, ri = Rext + 0.05, ro = ri + w, n = Math.max(16, Math.ceil(2 * Math.PI * ro / 1.5)), Lc = cat("L76X76X6.4"), gap = 0.9 / ro * 180 / Math.PI;
    for (var i = 0; i < n; i++) {
      var a0 = 360 * i / n, a1 = 360 * (i + 1) / n;
      K.plana([polar(ri, a0, y), polar(ro, a0, y), polar(ro, a1, y), polar(ri, a1, y)], 0.025, UP, { papel: "Passarela em volta (grade)", nome: "Passarela em volta — setor " + (i + 1) }, "passarela");
      if (Lc) K.barraEixo(polar(ri, a0, y - 0.06), polar(ro - 0.05, a0, y - 0.06), Lc, UP, { papel: "Console da passarela", nome: "Console da passarela " + (i + 1) }, "passarela");
    }
    var pts = [], m = Math.max(12, n);
    for (var j = 0; j <= m; j++) { var a = aG + gap / 2 + (360 - gap) * j / m; pts.push(polar(ro - 0.03, a, y)); }
    guardaCorpo(K, pts, { nome: "Guarda-corpo da passarela", espac: 1.5 });
    return n;
  }
  function plataformaTopo(K, p, Rext, yTop, aG) {
    var rad = radial(aG), tg = tang(aG), L = 1.5, B = 0.9, ri = Rext + 0.05;
    var c = [add(mul(rad, ri), mul(tg, -L / 2)), add(mul(rad, ri), mul(tg, L / 2)), add(mul(rad, ri + B), mul(tg, L / 2)), add(mul(rad, ri + B), mul(tg, -L / 2))].map(function (q) { return [q[0], yTop, q[2]]; });
    K.plana(c, 0.025, UP, { papel: "Plataforma de topo (grade)", nome: "Plataforma de topo" }, "plataforma");
    /* consoles sob a plataforma */
    var Lc = cat("L76X76X6.4");
    if (Lc) [-1, 1].forEach(function (s) { var A = add(mul(rad, ri), mul(tg, s * (L / 2 - 0.05))), Bq = add(mul(rad, ri + B - 0.05), mul(tg, s * (L / 2 - 0.05))); K.barraEixo([A[0], yTop - 0.06, A[2]], [Bq[0], yTop - 0.06, Bq[2]], Lc, UP, { papel: "Console da plataforma", nome: "Console da plataforma " + (s < 0 ? "1" : "2") }, "plataforma"); });
    /* guarda-corpo nos três lados livres (fica aberto onde chega a escada) */
    guardaCorpo(K, [c[1], c[2], c[3], c[0]], { nome: "Guarda-corpo da plataforma", espac: 1.2 });
  }
  function guardaTeto(K, p, r, Rext, yTop, aG) {
    var it = r.acessorios.itens.filter(function (x) { return /Guarda-corpo no teto/.test(x.nome); })[0]; if (!it) return;
    var arco = it.arco, rr = Rext - 0.15, da = arco / rr * 180 / Math.PI, n = Math.max(2, Math.ceil(arco / 1.5)), pts = [];
    var th = r.teto.flecha > 0 ? Math.atan2(r.teto.flecha, p.D / 2) : 0;
    for (var i = 0; i <= n; i++) { var a = aG - da / 2 + da * i / n; pts.push(polar(rr, a, yTop + (Rext - rr) * Math.tan(th))); }
    guardaCorpo(K, pts, { nome: "Guarda-corpo do teto", espac: 1.5, rodape: false });
  }
  function bocais(K, p, r, y0, Rext, yTop) {
    var lst = arr(r.acessorios.bocais), nB = 0;
    lst.forEach(function (b) {
      var dn = num(b.dn, 100) / 1000, De = dn + 0.012, flD = dn + 0.15;
      if (b.onde === "teto" && p.teto !== "aberto") {
        var rr = Math.max(0.2, (b.raio || 0.25) * p.D / 2), th = Math.atan2(r.teto.flecha || 0, p.D / 2), yb = yTop + (p.D / 2 - rr) * Math.tan(th), P = polar(rr, b.ang || 0, yb);
        K.tubo(P, UP, [1, 0, 0], De, 0.006, 0.25, { papel: "Bocal " + b.nome, nome: "Bocal " + b.nome + " DN " + b.dn }, "bocais");
        var fl = M().flange({ origem: K.W(add(P, [0, 0.25 + 0.02, 0])), ex: K.D([1, 0, 0]), ey: K.D([0, 0, 1]), D: flD, d: dn, Dc: dn + 0.075, n: 4, db: 16, t: 0.02, lig: K.lig }); if (fl && !fl.erro) { fl.metal.papel = "Flange do bocal"; K.nova(fl, "flange", "bocais"); }
        nB++; return;
      }
      if (b.onde === "costado" || !b.onde) {
        var a = b.ang || 0, rd = radial(a), y = y0 + Math.max(0.1, num(b.cota, 0.3)), P0 = add(mul(rd, Rext - 0.02), [0, y, 0]);
        K.tubo(P0, rd, UP, De, 0.006, 0.25, { papel: "Bocal " + b.nome, nome: "Bocal " + b.nome + " DN " + b.dn }, "bocais");
        var f2 = M().flange({ origem: K.W(add(P0, mul(rd, 0.25))), ex: K.D(UP), ey: K.D(tang(a)), D: flD, d: dn, Dc: dn + 0.075, n: 4, db: 16, t: 0.02, lig: K.lig }); if (f2 && !f2.erro) { f2.metal.papel = "Flange do bocal"; K.nova(f2, "flange", "bocais"); }
        nB++;
      }
    });
    return nB;
  }
  /* chapas de reforço das aberturas do costado (js/acotanque.js, API 650 5.7.2): disco com furo, tangente por fora do costado */
  function reforcos(K, p, r, y0, Rext) {
    var n = 0;
    arr(r.aberturas && r.aberturas.lista).forEach(function (a) {
      if (a.onde !== "costado" || !a.reforco) return;
      var tp = a.reforco.t / 1000, rd = radial(a.ang), P = add(mul(rd, Rext + tp), [0, y0 + a.cota, 0]);
      var c = M().chapa({ origem: K.W(P), ex: K.D(UP), ey: K.D(tang(a.ang)), t: tp, contorno: circ(a.reforco.Do / 2000, 48), recortes: [circ(a.furo / 2000, 48).reverse()], papel: "Chapa de reforço", aco: p.aco, lig: K.lig, nome: "Chapa de reforço — " + a.nome + " Ø " + Math.round(a.reforco.Do) + " × " + a.reforco.t + " mm" });
      if (K.nova(c, "reforço", "reforcos")) n++;
    });
    return n;
  }
  function bocaVisita(K, P0, eixo, ref, nome, conta) {
    K.tubo(P0, eixo, ref, 0.61, 0.008, 0.3, { papel: "Pescoço da boca de visita", nome: nome + " — pescoço DN 600" }, conta);
    var Pe = add(P0, mul(eixo, 0.3)), ey = cross(eixo, ref);
    var f = M().flange({ origem: K.W(Pe), ex: K.D(ref), ey: K.D(ey), D: 0.8, d: 0.6, Dc: 0.72, n: 20, db: 20, t: 0.02, lig: K.lig }); if (f && !f.erro) { f.metal.papel = "Flange da boca de visita"; K.nova(f, "flange", conta); }
    var tp = M().flange({ origem: K.W(add(Pe, mul(eixo, 0.022))), ex: K.D(ref), ey: K.D(ey), D: 0.8, d: 0, Dc: 0.72, n: 20, db: 20, t: 0.02, lig: K.lig }); if (tp && !tp.erro) { tp.metal.papel = "Tampa cega da boca de visita"; K.nova(tp, "tampa", conta); }
  }
  function indicadorNivel(K, p, y0, Rext, aG, H) {
    var rd = radial(aG), P = add(mul(rd, Rext + 0.25), [0, y0 + 0.3, 0]);
    K.tubo(P, UP, [1, 0, 0], 0.0603, 0.0039, Math.max(0.5, H - 0.6), { papel: "Indicador de nível (tubo-guia)", nome: "Indicador de nível — tubo-guia DN 50" }, "nivel");
    [0.3, H - 0.3].forEach(function (yy, i) { K.tubo(add(mul(rd, Rext - 0.02), [0, y0 + yy, 0]), rd, UP, 0.0603, 0.0039, 0.27, { papel: "Indicador de nível (tomada)", nome: "Indicador de nível — tomada " + (i + 1) }, "nivel"); });
  }
  function chumbadores(K, p, r, y0) {
    var c = r.estabilidade && r.estabilidade.chumbadores; if (!c) return 0;
    var id = c.d <= 26 ? "1\"" : "1.1/4\"", tp = 0.025;
    for (var i = 0; i < c.n; i++) {
      var a = 360 * (i + 0.5) / c.n, P = polar(c.dc / 2, a, y0 + 0.3), rd = radial(a), tg = tang(a);
      var q = add(add(P, mul(rd, -0.1)), mul(tg, -0.1));
      K.plana([q, add(q, mul(rd, 0.2)), add(add(q, mul(rd, 0.2)), mul(tg, 0.2)), add(q, mul(tg, 0.2))], tp, UP, { papel: "Cadeira de ancoragem (chapa de topo)", nome: "Cadeira de ancoragem " + (i + 1), furos: [{ u: 0.1, v: 0.1, db: 25 }] }, "ancoragem");
      var pz = M().parafuso({ origem: K.W(add(P, [0, tp, 0])), eixo: [0, -1, 0], aperto: tp + 0.3, id: id, chumbador: { ancoragem: 0.6 }, lig: K.lig }); if (pz && !pz.erro) { pz.metal.nome = "Chumbador " + (i + 1) + " " + c.nome; K.nova(pz, "chumbador", "ancoragem"); }
    }
    return c.n;
  }

  /* ============================================================ GERADORES POR TIPO */
  function gerarVertical(K, p, r, y0) {
    var cb = cubaVertical(K, p, r, y0), esc = r.acessorios.escada, a0 = 200, ac = p.acessorios || {}, angTopo = a0;
    if (esc === "helicoidal") { var eh = escadaHelicoidal(K, p, r, y0, cb.Rext, a0); angTopo = eh.angFim + 360 * 0.02; }
    else if (esc === "marinheiro") { marinheiro(K, p, r, y0, cb.Rext, a0, p.H, "Escada de marinheiro"); angTopo = a0; }
    if (ac.passarelaAnel) passarelaAnel(K, p, r, cb.Rext, num(ac.cotaPassarela, 0) > 0 ? num(ac.cotaPassarela, 0) : cb.yTop, angTopo);
    else if (ac.plataforma !== false && esc !== "nenhuma") plataformaTopo(K, p, cb.Rext, cb.yTop, angTopo + (esc === "helicoidal" ? 5 : 0));
    if (ac.guardaCorpoTeto !== false && p.teto !== "aberto") guardaTeto(K, p, r, cb.Rext, cb.yTop, angTopo);
    bocais(K, p, r, y0, cb.Rext, cb.yTop);
    var bv = arr(r.aberturas && r.aberturas.lista).filter(function (a) { return a.id === "visita-costado"; })[0], aV = bv ? bv.ang : 330, zV = bv ? bv.cota : 0.75;
    if (ac.bocaVisitaCostado && p.tipo === "vertical") bocaVisita(K, [Math.cos(aV * GRAU) * (cb.Rext - 0.02), y0 + zV, -Math.sin(aV * GRAU) * (cb.Rext - 0.02)], radial(aV), UP, "Boca de visita do costado", "visitas");
    reforcos(K, p, r, y0, cb.Rext);
    if (ac.bocaVisitaTeto && p.teto !== "aberto") { var th = Math.atan2(r.teto.flecha || 0, p.D / 2), rr = Math.min(p.D / 2 - 0.8, Math.max(0.6, p.D * 0.3)), yb = cb.yTop + (p.D / 2 - rr) * Math.tan(th); bocaVisita(K, polar(rr, angTopo, yb), UP, [1, 0, 0], "Boca de visita do teto", "visitas"); }
    if (ac.indicadorNivel) indicadorNivel(K, p, y0, cb.Rext, 260, p.H);
    if (p.tipo === "vertical") chumbadores(K, p, r, y0);
    return cb;
  }
  function gerarElevado(K, p, r) {
    var tw = r.torre, Ht = p.alturaTorre, nP = tw.pilares, Rt = tw.raioTopo, Rb = tw.raioBase, hp = tw.hPainel, vq = tw.viga ? Aco().obter(tw.viga) : null, dv = vq ? vq.d / 1000 : 0.3;
    var a0 = 45, topo = [], basePts = [];
    for (var i = 0; i < nP; i++) { var a = a0 + 360 * i / nP; topo.push(polar(Rt, a, Ht - dv)); basePts.push(polar(Rb, a, 0)); }
    function noPilar(i, y) { var t = y / (Ht - dv); return add(basePts[i], mul(sub(topo[i], basePts[i]), t)); }
    var pil = tw.pilar ? (cat(tw.pilar) || tw.pilar) : null, dg = tw.diagonal ? (cat(tw.diagonal) || tw.diagonal) : null, trv = cat(tw.travessa || "L76X76X6.4") || dg;
    for (var j = 0; j < nP; j++) if (pil) K.barraLinha(basePts[j], topo[j], { ferr: "pilar", cat: pil, papel: "Pilar da torre", ifc: "IFCCOLUMN", aco: "ASTM A36", nome: "Pilar da torre " + (j + 1) }, "pilares");
    for (var k = 0; k < tw.paineis; k++) {
      var ya = k * hp, yb = Math.min((k + 1) * hp, Ht - dv);
      for (var f = 0; f < nP; f++) {
        var g = (f + 1) % nP, A1 = noPilar(f, ya), B1 = noPilar(g, ya), A2 = noPilar(f, yb), B2 = noPilar(g, yb);
        if (dg) { K.barraLinha(A1, B2, { ferr: "diagonal", cat: dg, papel: "Diagonal da torre", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Diagonal — painel " + (k + 1) + " face " + (f + 1) + " a" }, "diagonais"); K.barraLinha(B1, A2, { ferr: "diagonal", cat: dg, papel: "Diagonal da torre", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Diagonal — painel " + (k + 1) + " face " + (f + 1) + " b" }, "diagonais"); }
        if (trv && k + 1 < tw.paineis) K.barraLinha(A2, B2, { ferr: "viga", cat: trv, papel: "Travessa da torre", ifc: "IFCMEMBER", aco: "ASTM A36", nome: "Travessa — nível " + (k + 1) + " face " + (f + 1) }, "travessas");
      }
    }
    /* grelha do topo: vigas entre os pilares + as diagonais do polígono (4 pilares: um X) */
    if (tw.viga) {
      for (var v = 0; v < nP; v++) K.barraLinha(add(topo[v], [0, dv / 2, 0]), add(topo[(v + 1) % nP], [0, dv / 2, 0]), { ferr: "viga", cat: tw.viga, just: "topo", papel: "Viga da grelha", ifc: "IFCBEAM", aco: "ASTM A36", nome: "Viga da grelha " + (v + 1) }, "grelha");
      /* vigas internas da grelha (js/acotanque.js grelhaFundo): paralelas, a cada s, de um lado ao oposto do quadrado */
      var gr = tw.grelha;
      if (gr && gr.nb && gr.vigaInterna) { var qI = Aco().obter(gr.vigaInterna), dI = qI ? qI.d / 1000 : 0.3, Rq = p.D / 2; for (var kI = 1; kI <= gr.nb; kI++) { var xI = -Rq + kI * gr.s; K.barraLinha([xI, Ht - dI / 2, -Rq], [xI, Ht - dI / 2, Rq], { ferr: "viga", cat: gr.vigaInterna, just: "topo", papel: "Viga interna da grelha", ifc: "IFCBEAM", aco: "ASTM A36", nome: "Viga interna da grelha " + kI }, "grelha"); } }
    }
    var cb = cubaVertical(K, p, r, Ht);
    var ac = p.acessorios || {};
    marinheiro(K, p, r, 0, Math.max(cb.Rext, Rb) + 0.05, a0 + 180 / nP, Ht + p.H, "Escada de marinheiro da torre");
    if (ac.passarelaAnel) passarelaAnel(K, p, r, cb.Rext, num(ac.cotaPassarela, 0) > 0 ? Ht + num(ac.cotaPassarela, 0) : cb.yTop, a0 + 180 / nP);
    else if (ac.plataforma !== false) plataformaTopo(K, p, cb.Rext, cb.yTop, a0 + 180 / nP);
    if (ac.guardaCorpoTeto !== false && p.teto !== "aberto") guardaTeto(K, p, r, cb.Rext, cb.yTop, a0 + 180 / nP);
    bocais(K, p, r, Ht, cb.Rext, cb.yTop);
    reforcos(K, p, r, Ht, cb.Rext);
    if (ac.bocaVisitaTeto && p.teto !== "aberto") { var th = Math.atan2(r.teto.flecha || 0, p.D / 2), rr = Math.max(0.6, p.D * 0.3); bocaVisita(K, polar(Math.min(rr, p.D / 2 - 0.7), a0 + 180 / nP + 20, cb.yTop + (p.D / 2 - Math.min(rr, p.D / 2 - 0.7)) * Math.tan(th)), UP, [1, 0, 0], "Boca de visita do teto", "visitas"); }
    if (ac.indicadorNivel) indicadorNivel(K, p, Ht, cb.Rext, a0 + 180 / nP + 90, p.H);
    /* placas de base e chumbadores DIMENSIONADOS (AcoLigCalc.placaBase, pelo js/acotanque.js) */
    var pbd = tw.ligacoes && tw.ligacoes.placaBase && tw.ligacoes.placaBase.dimensoes ? tw.ligacoes.placaBase.dimensoes : null;
    var Bp = pbd ? pbd.B / 1000 : 0.4, Lpb = pbd ? pbd.L / 1000 : 0.4, tpb = pbd ? pbd.t / 1000 : 0.025, ch = pbd && pbd.chumbadores ? pbd.chumbadores : null, bd = ch ? ch.borda / 1000 : 0.05;
    var idCh = ch && /^(1\/2|5\/8|3\/4|7\/8|1|1\.1\/8|1\.1\/4)"$/.test(ch.id) ? ch.id : "3/4\"";
    for (var b = 0; b < nP; b++) {
      var Pb = basePts[b], fur = [[bd, bd], [Bp - bd, bd], [Bp - bd, Lpb - bd], [bd, Lpb - bd]];
      K.nova(M().chapa({ origem: K.W([Pb[0] - Bp / 2, tpb, Pb[2] - Lpb / 2]), ex: K.D([1, 0, 0]), ey: K.D([0, 0, 1]), t: tpb, ret: { L: Bp, B: Lpb }, papel: "Placa de base", aco: "ASTM A36", lig: K.lig, nome: "Placa de base " + (b + 1) + (pbd ? " " + pbd.B + " × " + pbd.L + " × " + pbd.t + " mm" : ""),
        furos: fur.map(function (f) { return { u: f[0], v: f[1], db: ch ? ch.d : 19 }; }) }), "placa de base", "bases");
      fur.forEach(function (f, j) { var pz = M().parafuso({ origem: K.W([Pb[0] - Bp / 2 + f[0], tpb, Pb[2] - Lpb / 2 + f[1]]), eixo: [0, -1, 0], aperto: tpb + 0.025, id: idCh, chumbador: { ancoragem: ch ? ch.ancoragem / 1000 : 0.3 }, lig: K.lig }); if (pz && !pz.erro) { pz.metal.nome = "Chumbador " + (b + 1) + "." + (j + 1); K.nova(pz, "chumbador", "bases"); } });
    }
    return cb;
  }
  function gerarHorizontal(K, p, r) {
    var D = p.D, R = D / 2, L = p.L, hs = p.alturaSela, yc = hs + R, t = r.costado.aneis[0].t / 1000, W = p.larguraChapa, nA = Math.max(1, Math.ceil(L / W - 1e-9)), x0 = -L / 2;
    for (var i = 0; i < nA; i++) { var Li = Math.min(W, L - i * W); K.tubo([x0 + i * W, yc, 0], [1, 0, 0], UP, D + t, t, Li, { papel: "Costado — anel " + (i + 1), aco: p.aco, nome: "Costado anel " + (i + 1) + " #" + br(r.costado.aneis[0].t, 1) + " mm" }, "costado"); }
    var tt = r.costado.tampo / 1000;
    [x0, -x0 + tt].forEach(function (x, k) { var c = circ(R + t / 2, 72).map(function (q) { return [q[0], q[1]]; }); K.nova(M().chapa({ origem: K.W([x, yc, 0]), ex: K.D([0, 1, 0]), ey: K.D([0, 0, 1]), t: tt, contorno: c, papel: "Tampo plano", aco: p.aco, lig: K.lig, nome: "Tampo " + (k + 1) + " #" + br(r.costado.tampo, 1) + " mm" }), "tampo", "tampos"); });
    /* selas: alma vertical com o topo em arco + chapa de base */
    var A = r.selas.A, ang = r.selas.angulo * GRAU, b = r.selas.b, wS = 2 * (R + t) * Math.sin(ang / 2) + 0.1;
    [x0 + A, -x0 - A].forEach(function (xs, k) {
      var nArc = 16;
      /* o arco veio de +z para −z; fecha pelo canto de −z */
      var poly = [[xs, 0.016, wS / 2], [xs, 0.016, -wS / 2]];
      var arco = []; for (var j2 = 0; j2 <= nArc; j2++) { var a2 = -ang / 2 + ang * j2 / nArc; arco.push([xs, yc - (R + t) * Math.cos(a2), -(R + t) * Math.sin(a2)]); }
      poly = poly.concat(arco.filter(function (q) { return q[1] > 0.05; }));
      K.plana(poly, 0.0125, [1, 0, 0], { papel: "Alma da sela", nome: "Sela " + (k + 1) + " — alma" }, "selas");
      K.plana([[xs - b / 2, 0.016, -wS / 2], [xs + b / 2, 0.016, -wS / 2], [xs + b / 2, 0.016, wS / 2], [xs - b / 2, 0.016, wS / 2]], 0.016, [0, -1, 0], { papel: "Base da sela", nome: "Sela " + (k + 1) + " — base", furos: [{ u: b / 2, v: 0.1, db: 20 }, { u: b / 2, v: wS - 0.1, db: 20 }] }, "selas");
    });
    /* escada de marinheiro no tampo 1 + plataforma em cima */
    var ac = p.acessorios || {}, yTop = hs + D;
    var esc = r.acessorios.itens.filter(function (x) { return /marinheiro/.test(x.nome); })[0];
    if (esc) {
      var xm = x0 - 0.2, w = 0.45, bar = { forma: "ret", b: 0.0127, h: 0.0635 };
      [-1, 1].forEach(function (s) { K.barraEixo([xm, 0, s * w / 2], [xm, yTop + 1.1, s * w / 2], bar, [0, 0, 1], { papel: "Montante da escada de marinheiro", nome: "Escada de marinheiro — montante " + (s < 0 ? "esq." : "dir.") }, "marinheiro"); });
      for (var k2 = 1; k2 <= Math.floor(yTop / 0.3); k2++) K.barraEixo([xm, k2 * 0.3, -w / 2], [xm, k2 * 0.3, w / 2], { forma: "circ", d: 0.025 }, UP, { papel: "Degrau da escada de marinheiro", nome: "Escada de marinheiro — degrau " + k2 }, "marinheiro");
    }
    if (ac.plataforma !== false) {
      var Lp = Math.min(2.0, L * 0.5), c4 = [[x0 + 0.1, yTop + 0.05, -0.45], [x0 + 0.1 + Lp, yTop + 0.05, -0.45], [x0 + 0.1 + Lp, yTop + 0.05, 0.45], [x0 + 0.1, yTop + 0.05, 0.45]];
      K.plana(c4, 0.025, UP, { papel: "Plataforma de topo (grade)", nome: "Plataforma de topo" }, "plataforma");
      guardaCorpo(K, [c4[0], c4[1], c4[2], c4[3]], { nome: "Guarda-corpo da plataforma", espac: 1.2 });
    }
    /* bocais em cima (entrada, respiro) e embaixo (saída, dreno) */
    var bl = arr(r.acessorios.bocais), xs2 = [];
    bl.forEach(function (bc, i) { xs2.push(x0 + L * (0.35 + 0.12 * i)); });
    bl.forEach(function (bc, i) {
      var dn = num(bc.dn, 50) / 1000, emb = /saida|dreno/.test(bc.id), x = Math.min(-x0 - 0.3, xs2[i]);
      var P = emb ? [x, yc - R + 0.02, 0] : [x, yc + R - 0.02, 0], eixo = emb ? [0, -1, 0] : UP;
      K.tubo(P, eixo, [1, 0, 0], dn + 0.012, 0.006, emb ? Math.min(0.25, hs - 0.1) : 0.25, { papel: "Bocal " + bc.nome, nome: "Bocal " + bc.nome + " DN " + bc.dn }, "bocais");
    });
    if (ac.bocaVisitaTeto) bocaVisita(K, [x0 + L * 0.75, yc + R - 0.02, 0], UP, [1, 0, 0], "Boca de visita", "visitas");
    return { yTop: yTop };
  }

  /* ============================================================ GERAR */
  function gerar(par, novoId) {
    var A = T(); if (!A || !M() || !Aco()) return { ok: false, motivo: "Os motores do tanque (js/acotanque.js, js/metalpeca.js, js/perfisaco.js) não carregaram." };
    if (typeof novoId !== "function") return { ok: false, motivo: "Sem gerador de id." };
    var r = A.calcular(par); if (!r.ok) return { ok: false, motivo: r.motivo };
    return gerarResultado(r, novoId);
  }
  /* as peças a partir de um resultado JÁ calculado (o js/acotanque.js usa isto para tirar o peso real das peças — sem recalcular) */
  function gerarResultado(r, novoId) {
    var A = T(); if (!A || !M() || !Aco() || !r || !r.ok) return { ok: false, motivo: "Sem resultado de cálculo ou sem os motores." };
    var p = r.par, gid = "g" + String(novoId()), K = construtor(novoId, [num(p.x0, 0), num(p.y0, 0), num(p.z0, 0)], p.giro, gid);
    if (p.tipo === "horizontal") gerarHorizontal(K, p, r);
    else if (p.tipo === "elevado") { if (!MC()) return { ok: false, motivo: "O criador de barras (js/metalcriar.js) não carregou." }; gerarElevado(K, p, r); }
    else gerarVertical(K, p, r, 0);
    if (!K.pecas.length) return { ok: false, motivo: "Nenhuma peça foi criada." + (K.avisos.length ? " " + K.avisos.join("; ") : "") };
    var massa = 0, finais = {}; K.pecas.forEach(function (c) { massa += num(c.massa, 0); finais[c.id] = c; });
    return { ok: true, tipo: p.tipo, op: { op: "lote", id: String(novoId()), origem: "metal-tanque", pedido: A.TIPOS[p.tipo].rotulo, ops: K.ops }, pecas: K.pecas, finais: finais, contagem: K.cont, avisos: K.avisos,
             resultado: r, par: p, massa: r2(massa), linhas: contorno(p, r), resumo: r.resumo + " — " + K.pecas.length + " peças no modelo (" + br(massa, 0) + " kg)." };
  }

  /* MASSA POR PARTE das peças desenhadas (a mesma geometria do 3D → a mesma massa do quantitativo do BIM) */
  var PARTES = [["costado", /^Costado/], ["fundo", /^Fundo do tanque|^Anel anular/], ["teto", /^Teto/], ["estruturaTeto", /^Caibro do teto|^Coluna central|^Capitel|^Base da coluna/],
    ["cantoneira", /^Cantoneira de topo/], ["aneisVento", /^Anel de contraventamento/], ["reforcos", /^Chapa de reforço/],
    ["torre", /^Pilar da torre|^Diagonal da torre|^Travessa da torre|^Viga da grelha|^Viga interna da grelha|^Placa de base/], ["tampos", /^Tampo plano/], ["selas", /sela/i],
    ["chumbadores", /^Cadeira de ancoragem|^Chumbador/]];
  function massasPorParte(pecas) {
    var o = { acessorios: 0 }, tot = 0;
    arr(pecas).forEach(function (c) {
      var pap = c && c.metal ? String(c.metal.papel || "") : "", ms = num(c && c.massa, 0), k = "acessorios";
      for (var i = 0; i < PARTES.length; i++) if (PARTES[i][1].test(pap)) { k = PARTES[i][0]; break; }
      o[k] = (o[k] || 0) + ms; tot += ms;
    });
    Object.keys(o).forEach(function (k) { o[k] = r1(o[k]); });
    o.total = r1(tot);
    return o;
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ============================================================ IDENTIDADE */
  function identidade(g, gid, info, alvo) {
    if (!g || !g.ok) return g;
    var primeira = null;
    g.op.ops.forEach(function (o) { if (o.op === "criar" && o.caixa) { o.caixa.tanque = gid; if (!primeira && o.caixa.metal && o.caixa.metal.kind !== "parafuso") primeira = o; } });
    var inf = clone(info || {}); inf.id = gid;
    if (primeira) { inf.ref = { id: primeira.id, cx: primeira.caixa.cx, cy: primeira.caixa.cy, cz: primeira.caixa.cz }; primeira.caixa.tanqueInfo = inf; }
    if (alvo && arr(alvo.pecas).length) { g.op.ops = alvo.pecas.map(function (id) { return { op: "apagar", id: id }; }).concat(g.op.ops); g.op.pedido = "Atualizar tanque (" + alvo.pecas.length + " peças refeitas)"; }
    g.tanqueId = gid; g.atualizou = !!alvo;
    return g;
  }
  function tanques(caixas) {
    var por = {}, ordem = [];
    arr(caixas).forEach(function (c) {
      if (!c || !c.tanque) return; var g = String(c.tanque);
      if (!por[g]) { por[g] = { id: g, pecas: [], info: null }; ordem.push(g); }
      por[g].pecas.push(String(c.id)); if (c.tanqueInfo) { por[g].info = c.tanqueInfo; por[g].refAgora = { cx: c.cx, cy: c.cy, cz: c.cz }; }
    });
    return ordem.map(function (g) { var o = por[g]; o.n = o.pecas.length; return o; });
  }
  function parParaRefazer(t) {
    if (!t || !t.info || !t.info.par) return null;
    var p = clone(t.info.par), rf = t.info.ref, ag = t.refAgora;
    if (rf && ag) { p.x0 = r4(num(p.x0, 0) + num(ag.cx, 0) - num(rf.cx, 0)); p.y0 = r4(num(p.y0, 0) + num(ag.cy, 0) - num(rf.cy, 0)); p.z0 = r4(num(p.z0, 0) + num(ag.cz, 0) - num(rf.cz, 0)); }
    return p;
  }

  /* ============================================================ CONTORNO (arame leve para o cursor) */
  function contorno(par, r) {
    var p = r ? r.par : (T() ? T().normalizar(par) : par), out = [], O = [num(p.x0, 0), num(p.y0, 0), num(p.z0, 0)], th = num(p.giro, 0) * GRAU, W = function (l) { return add(O, rotY(l, th)); };
    function circulo(R, y, n) { for (var i = 0; i < n; i++) { var a = 360 * i / n, b = 360 * (i + 1) / n; out.push({ a: W(polar(R, a, y)), b: W(polar(R, b, y)), p: "costado" }); } }
    if (p.tipo === "horizontal") {
      var R = p.D / 2, yc = p.alturaSela + R, x0 = -p.L / 2;
      [x0, -x0].forEach(function (x) { for (var i = 0; i < 24; i++) { var a = 2 * Math.PI * i / 24, b = 2 * Math.PI * (i + 1) / 24; out.push({ a: W([x, yc + R * Math.cos(a), R * Math.sin(a)]), b: W([x, yc + R * Math.cos(b), R * Math.sin(b)]), p: "costado" }); } });
      [0, 90, 180, 270].forEach(function (aG) { var a = aG * GRAU; out.push({ a: W([x0, yc + R * Math.cos(a), R * Math.sin(a)]), b: W([-x0, yc + R * Math.cos(a), R * Math.sin(a)]), p: "costado" }); });
      return out;
    }
    var y0 = p.tipo === "elevado" ? num(p.alturaTorre, 0) : 0, Rr = p.D / 2, fl = r && r.teto ? (r.teto.flecha || 0) : 0;
    circulo(Rr, y0, 36); circulo(Rr, y0 + p.H, 36);
    [0, 90, 180, 270].forEach(function (aG) { out.push({ a: W(polar(Rr, aG, y0)), b: W(polar(Rr, aG, y0 + p.H)), p: "costado" }); if (fl > 0) out.push({ a: W(polar(Rr, aG, y0 + p.H)), b: W([0, y0 + p.H + fl, 0]), p: "teto" }); });
    if (p.tipo === "elevado") [45, 135, 225, 315].forEach(function (aG) { out.push({ a: W(polar(Rr * 0.85, aG, 0)), b: W(polar(Rr * 0.85, aG, y0)), p: "torre" }); });
    return out;
  }

  /* ============================================================ ESQUEMA (prévia do diálogo: elevação com os anéis + planta)
   * classes da tela (tokens do css/app.css): mtq-esq-* */
  function esquema(r) {
    if (!r || !r.ok) return "";
    var p = r.par, s = '<svg viewBox="0 0 340 200" class="mtq-esq" role="img" aria-label="Prévia do tanque">';
    function txt(x, y, t, a, cl) { return '<text x="' + r2(x) + '" y="' + r2(y) + '" class="' + (cl || "mtq-esq-rot") + '" text-anchor="' + (a || "middle") + '">' + t + "</text>"; }
    if (p.tipo === "horizontal") {
      var k = Math.min(200 / p.L, 110 / (p.D + p.alturaSela)), w = p.L * k, h = p.D * k, x0 = 20 + (210 - w) / 2, yb = 180, yc = yb - p.alturaSela * k - h / 2;
      s += '<rect x="' + r2(x0) + '" y="' + r2(yc - h / 2) + '" width="' + r2(w) + '" height="' + r2(h) + '" rx="' + r2(h * 0.08) + '" class="mtq-esq-anel"/>';
      [r.selas.A, p.L - r.selas.A].forEach(function (a) { s += '<rect x="' + r2(x0 + a * k - 6) + '" y="' + r2(yc + h / 2 - 4) + '" width="12" height="' + r2(yb - yc - h / 2 + 4) + '" class="mtq-esq-sela"/>'; });
      s += '<line x1="10" y1="' + yb + '" x2="230" y2="' + yb + '" class="mtq-esq-chao"/>';
      s += txt(x0 + w / 2, yc + 4, "#" + br(r.costado.aneis[0].t, 1) + " mm");
      s += txt(x0 + w / 2, yc - h / 2 - 6, "Ø " + br(p.D, 2) + " × " + br(p.L, 2) + " m");
      var cxp = 290, cyp = 100, rp = 34; s += '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + rp + '" class="mtq-esq-anel"/>' + txt(cxp, cyp + rp + 16, "seção") + txt(cxp, cyp + 4, br(r.quantitativo.volumeUtil, 1) + " m³");
      return s + "</svg>";
    }
    var yBase = p.tipo === "elevado" ? p.alturaTorre : 0, Htot = yBase + p.H + (r.teto.flecha || 0), kk = Math.min(150 / Htot, 170 / p.D), Wd = p.D * kk, xL = 20 + (200 - Wd) / 2, yb2 = 185, ytop = yb2 - (yBase + p.H) * kk;
    if (p.tipo === "elevado") { var rb = (r.torre ? r.torre.raioBase : p.D / 2) * kk, rt = (r.torre ? r.torre.raioTopo : p.D / 2) * kk, cx2 = xL + Wd / 2, yt2 = yb2 - yBase * kk; s += '<line x1="' + r2(cx2 - rb) + '" y1="' + yb2 + '" x2="' + r2(cx2 - rt) + '" y2="' + r2(yt2) + '" class="mtq-esq-torre"/><line x1="' + r2(cx2 + rb) + '" y1="' + yb2 + '" x2="' + r2(cx2 + rt) + '" y2="' + r2(yt2) + '" class="mtq-esq-torre"/>'; var np = r.torre ? r.torre.paineis : 3; for (var q = 0; q < np; q++) { var ya = yb2 - q * (yBase * kk) / np, yb3 = yb2 - (q + 1) * (yBase * kk) / np, wa = rb + (rt - rb) * q / np, wb = rb + (rt - rb) * (q + 1) / np; s += '<line x1="' + r2(cx2 - wa) + '" y1="' + r2(ya) + '" x2="' + r2(cx2 + wb) + '" y2="' + r2(yb3) + '" class="mtq-esq-torre"/><line x1="' + r2(cx2 + wa) + '" y1="' + r2(ya) + '" x2="' + r2(cx2 - wb) + '" y2="' + r2(yb3) + '" class="mtq-esq-torre"/>'; } }
    var ys = yb2 - yBase * kk, tmax = 0; r.costado.aneis.forEach(function (a) { tmax = Math.max(tmax, a.t); });
    r.costado.aneis.forEach(function (a) { var y1 = ys - (a.z0 + a.largura) * kk, hh = a.largura * kk, op = 0.25 + 0.65 * a.t / tmax; s += '<rect x="' + r2(xL) + '" y="' + r2(y1) + '" width="' + r2(Wd) + '" height="' + r2(hh) + '" class="mtq-esq-anel" fill-opacity="' + r2(op) + '"/>'; if (hh > 9) s += txt(xL + Wd / 2, y1 + hh / 2 + 3.5, "#" + br(a.t, 1), "middle", "mtq-esq-t"); });
    var fl = (r.teto.flecha || 0) * kk;
    if (p.teto === "domo") s += '<path d="M' + r2(xL) + "," + r2(ys - p.H * kk) + " Q" + r2(xL + Wd / 2) + "," + r2(ys - p.H * kk - 2 * fl) + " " + r2(xL + Wd) + "," + r2(ys - p.H * kk) + '" class="mtq-esq-teto"/>';
    else if (fl > 0) s += '<polyline points="' + r2(xL) + "," + r2(ys - p.H * kk) + " " + r2(xL + Wd / 2) + "," + r2(ys - p.H * kk - fl) + " " + r2(xL + Wd) + "," + r2(ys - p.H * kk) + '" class="mtq-esq-teto"/>';
    arr(r.contraventamento && r.contraventamento.aneis).forEach(function (g) { var yg = ys - g.cota * kk; s += '<line x1="' + r2(xL - 6) + '" y1="' + r2(yg) + '" x2="' + r2(xL + Wd + 6) + '" y2="' + r2(yg) + '" class="mtq-esq-vento"/>'; });
    var yl = ys - r.geometria.nivel * kk; s += '<line x1="' + r2(xL + 2) + '" y1="' + r2(yl) + '" x2="' + r2(xL + Wd - 2) + '" y2="' + r2(yl) + '" class="mtq-esq-nivel"/>';
    s += '<line x1="10" y1="' + yb2 + '" x2="230" y2="' + yb2 + '" class="mtq-esq-chao"/>';
    s += txt(xL + Wd / 2, Math.max(10, ys - p.H * kk - fl - 5), "Ø " + br(p.D, 2) + " × " + br(p.H, 2) + " m");
    /* planta */
    var cx = 290, cy = 92, rr = 36; s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" class="mtq-esq-anel" fill-opacity="0.25"/>';
    if (r.estabilidade && r.estabilidade.chumbadores) { var nc = r.estabilidade.chumbadores.n; for (var i = 0; i < nc; i++) { var a = 2 * Math.PI * (i + 0.5) / nc; s += '<circle cx="' + r2(cx + (rr + 4) * Math.cos(a)) + '" cy="' + r2(cy - (rr + 4) * Math.sin(a)) + '" r="1.6" class="mtq-esq-chumb"/>'; } }
    s += txt(cx, cy + 4, br(r.quantitativo.volumeUtil, 0) + " m³") + txt(cx, cy + rr + 18, "planta");
    return s + "</svg>";
  }

  /* ============================================================ DICAS ILUSTRADAS (padrão do js/metaldicas.js: 320 × 200, traço #1d2733, aço #c5d0dc/#4f6275, destaque #e9a23b) */
  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", DST = "#e9a23b", DSTL = "#a86a10";
  function tx(x, y, s, a) { return '<text x="' + x + '" y="' + y + '" font-size="11" font-family="sans-serif" fill="' + INK + '" text-anchor="' + (a || "middle") + '">' + s + "</text>"; }
  function svg(c) { return '<svg viewBox="0 0 320 200" width="320" height="200" role="img">' + c + "</svg>"; }
  function tanqueSvg(x, y, w, h, cone) {
    var s = "", n = 4; for (var i = 0; i < n; i++) s += '<rect x="' + x + '" y="' + (y + h * i / n) + '" width="' + w + '" height="' + (h / n) + '" fill="' + ACO + '" fill-opacity="' + (0.5 + 0.12 * i) + '" stroke="' + ACOL + '" stroke-width="1.5"/>';
    if (cone) s += '<polygon points="' + x + "," + y + " " + (x + w / 2) + "," + (y - cone) + " " + (x + w) + "," + y + '" fill="' + ACO + '" stroke="' + ACOL + '" stroke-width="1.5"/>';
    return s;
  }
  function desenho(id) {
    var s = "";
    if (id === "novo") { s += tanqueSvg(100, 60, 120, 110, 22) + '<line x1="40" y1="170" x2="280" y2="170" stroke="' + INK + '" stroke-width="2"/>'; s += '<path d="M220,170 A30,30 0 0 0 220,60" fill="none" stroke="' + DST + '" stroke-width="3" stroke-dasharray="5 3"/>' + tx(160, 190, "volume → D e H econômicos, anéis por norma") + tx(255, 120, "escada", "start"); }
    else if (id === "modelos") { s += tanqueSvg(30, 90, 60, 70, 12) + tanqueSvg(115, 60, 90, 100, 16) + '<rect x="225" y="105" width="80" height="40" rx="18" fill="' + ACO + '" stroke="' + ACOL + '" stroke-width="1.5"/><rect x="240" y="145" width="8" height="15" fill="' + DST + '"/><rect x="282" y="145" width="8" height="15" fill="' + DST + '"/>' + tx(160, 190, "água · diesel · óleo · elevado"); }
    else if (id === "editar") { s += tanqueSvg(110, 60, 100, 110, 20) + '<rect x="104" y="54" width="112" height="122" fill="none" stroke="' + DST + '" stroke-width="2.5" stroke-dasharray="6 4"/>' + tx(160, 190, "selecione uma peça do tanque"); }
    else { s += tanqueSvg(40, 70, 90, 100, 16); s += '<rect x="160" y="40" width="130" height="130" rx="6" fill="#fff" stroke="' + ACOL + '"/>'; for (var i = 0; i < 6; i++) s += '<line x1="172" y1="' + (62 + i * 18) + '" x2="' + (270 - (i % 3) * 20) + '" y2="' + (62 + i * 18) + '" stroke="' + (i === 0 ? DSTL : AUXC) + '" stroke-width="' + (i === 0 ? 3 : 2) + '"/>'; s += tx(225, 190, "memorial passo a passo"); }
    return svg(s);
  }
  var AUXC = "#8a94a3";
  var DICAS = {
    novo: { titulo: "Novo tanque", oQueE: "Tanque metálico calculado: vertical de fundo plano, horizontal sobre selas ou elevado em torre — costado por anéis, fundo, teto, vento, ancoragem e acessórios.", ondeUsa: "Reservatório de água, tanque de diesel e óleo, produto industrial.", dica: "Digite o volume e clique em Dimensionar: o sistema escolhe D e H de menor peso e explica. Depois posicione com um clique." },
    modelos: { titulo: "Modelos de tanque", oQueE: "Tanques típicos já dimensionados (água 5 a 1.000 m³, diesel horizontal, óleo, elevado) e os seus modelos salvos.", ondeUsa: "Começar rápido e ajustar.", dica: "Salve o tanque do diálogo como seu modelo: ele aparece aqui da próxima vez." },
    editar: { titulo: "Editar tanque", oQueE: "Abre o tanque selecionado com os dados dele e refaz no lugar (um Ctrl+Z volta).", ondeUsa: "Mudar altura, teto, produto ou acessórios depois de posicionado.", dica: "Selecione qualquer peça do tanque (anel, teto, escada) antes." },
    calcular: { titulo: "Calcular e memorial", oQueE: "As verificações passo a passo (API 650, NBR 6123, NR-12), as decisões do sistema, as cargas na fundação, o quantitativo e o memorial para imprimir.", ondeUsa: "Entregar o cálculo do tanque.", dica: "Com um tanque selecionado, mostra o dele; sem seleção, o último calculado." }
  };
  function dica(id) { var d = DICAS[id]; if (!d) return null; var o = clone(d); o.svg = desenho(id); return o; }

  /* ============================================================ FOLHA DO TANQUE no Padrão RA (A3 paisagem, carimbo RA)
   * pelo js/metalfabdes.js (montar: moldura, carimbo, penas do Padrão RA) e o js/acopranchas.js (Desenho):
   * COSTADO PLANIFICADO (chapas, juntas defasadas, aberturas e chapas de reforço), ELEVAÇÃO e PLANTA; na coluna: anéis,
   * aberturas, lista de materiais, soldas e notas. → { ok, folhas: [{ svg, numero, titulo }], avisos } — o PDF sai do
   * BimMetalFabDes.pdf(folhas). */
  var PI = Math.PI, ESC = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
  function escala(dims, espacos) { for (var i = 0; i < ESC.length; i++) { var ok = true; for (var k = 0; k < dims.length; k++) if (dims[k] / ESC[i] > espacos[k]) ok = false; if (ok) return ESC[i]; } return ESC[ESC.length - 1]; }
  function Col(D, geo, AP) { this.D = D; this.AP = AP; this.x = geo.coluna.x + 3; this.w = geo.coluna.w - 6; this.y = geo.coluna.y + 4; this.yMax = geo.carimbo.y - 3; }
  Col.prototype.titulo = function (t) { var T = this.D.E.T; if (this.y + T.tabelaCab * 2 > this.yMax) return false; this.D.texto(this.x, this.y + T.tabelaCab * 0.76, t, T.tabelaCab, { peso: 0.12 }); this.y += T.tabelaCab * 1.5 + 1; return true; };
  Col.prototype.tabela = function (cols, linhas, maxL) {
    var D = this.D, T = D.E.T, hl = Math.max(4.4, T.tabela * 1.85), cab = T.tabelaCab * 1.3 + 2.4, cabem = Math.floor((this.yMax - this.y - cab - 4) / hl); if (cabem < 1) return null;
    var mx = Math.min(cabem, maxL || 999), ls = linhas.length > mx ? linhas.slice(0, Math.max(0, mx - 1)).concat([{ titulo: "... mais " + (linhas.length - mx + 1) + " linha(s) - ver o memorial" }]) : linhas;
    var tw = 0; cols.forEach(function (c) { tw += c.w; }); var k = this.w / tw;
    var r = D.tabela(this.x, this.y, cols.map(function (c) { return { t: c.t, w: c.w * k, al: c.al }; }), ls); this.y += r.h + 4; return r;
  };
  Col.prototype.notas = function (itens) {
    var D = this.D, T = D.E.T, self = this; if (!this.titulo("NOTAS")) return;
    itens.forEach(function (it, i) {
      var o = typeof it === "object" ? it : { t: it }, pre = (i + 1) + "- ", rec = self.AP.largTexto(pre, T.nota), ls = self.AP.quebrar(o.t, T.nota, self.w - rec);
      if (self.y + ls.length * T.nota * 1.42 > self.yMax) return;
      D.texto(self.x, self.y + T.nota * 0.76, pre, T.nota, { cor: o.cor });
      ls.forEach(function (s) { D.texto(self.x + rec, self.y + T.nota * 0.76, s, T.nota, { cor: o.cor }); self.y += T.nota * 1.42; });
      self.y += 0.6;
    });
  };
  function marcas(r) { var k = 0, v = 0, o = {}; arr(r.aberturas && r.aberturas.lista).forEach(function (a) { o[a.id] = /visita/.test(a.id) ? "BV" + (++v) : "N" + (++k); }); return o; }
  function folha(r, op) {
    op = op || {};
    var FD = dep("BimMetalFabDes", "./metalfabdes.js"), AP = dep("AcoPranchas", "./acopranchas.js");
    if (!r || !r.ok || !r.par) return { ok: false, motivo: "A folha sai de um cálculo de tanque que fechou.", folhas: [] };
    if (!FD || !FD.montar || !AP) return { ok: false, motivo: "Os motores de desenho (js/metalfabdes.js, js/acopranchas.js) não carregaram.", folhas: [] };
    var p = r.par, q = r.quantitativo || {}, mk = marcas(r), ab = arr(r.aberturas && r.aberturas.lista);
    var titulo = (p.tipo === "horizontal" ? "TANQUE HORIZONTAL" : (p.tipo === "elevado" ? "RESERVATÓRIO ELEVADO" : "TANQUE")) + " Ø " + br(p.D * 1000, 0) + (p.tipo === "horizontal" ? " × " + br(p.L * 1000, 0) : " × " + br(p.H * 1000, 0)) + " mm";
    var def = { id: "tanque", titulo: titulo, desenhar: function (D, geo) {
      var T = D.E.T, ar = geo.area, esc0 = null, x0, y0, blocoY = ar.y + ar.h * 0.62;
      if (p.tipo !== "horizontal") {
        var Dm = p.D * 1000, Hm = p.H * 1000, Wd = PI * Dm, pl = q.planoChapas, an = r.costado.aneis;
        /* 1) costado planificado */
        var e1 = escala([Wd, Hm], [ar.w - 30, ar.h * 0.42]); esc0 = e1;
        var th = AP.tituloVista(D, ar.x + 2, ar.y + 2, "COSTADO PLANIFICADO (VISTO DE FORA) - CHAPAS, JUNTAS E ABERTURAS", "ESCALA 1:" + e1);
        x0 = ar.x + 18; y0 = ar.y + 2 + th + 4;
        var Y = function (z) { return y0 + (Hm - z) / e1; }, X = function (aG) { return x0 + (((aG % 360) + 360) % 360) / 360 * Wd / e1; };
        an.forEach(function (a, i) {
          var z0 = a.z0 * 1000, z1 = (a.z0 + a.largura) * 1000;
          D.ret(x0, Y(z1), Wd / e1, (z1 - z0) / e1, "MET-PERFIL");
          if (pl && pl.aneis[i]) pl.aneis[i].juntas.forEach(function (j) { D.linha(X(j), Y(z1), X(j), Y(z0), "MET-PERFIL"); });
          D.texto(x0 - 2, (Y(z0) + Y(z1)) / 2, "A" + a.i + " #" + br(a.t, 1).replace(",0", ""), T.minimo, { al: "D", meio: true });
          D.cota(x0 + Wd / e1, Y(z0), x0 + Wd / e1, Y(z1), 4, String(Math.round(z1 - z0)));
        });
        ab.filter(function (a) { return a.onde === "costado"; }).forEach(function (a) {
          var cx = X(a.ang), cy = Y(a.cota * 1000);
          if (a.reforco) D.circ(cx, cy, Math.max(0.5, a.reforco.Do / 2 / e1), "MET-FINA");
          D.circ(cx, cy, Math.max(0.4, (a.OD || a.furo) / 2 / e1), "MET-PRINCIPAL");
          D.texto(cx, cy - Math.max(1.6, (a.reforco ? a.reforco.Do : a.furo) / 2 / e1) - 1, mk[a.id], T.minimo, { al: "C" });
        });
        D.cota(x0, Y(0), x0 + Wd / e1, Y(0), -5, String(Math.round(Wd)));
        [0, 90, 180, 270].forEach(function (aG) { D.texto(X(aG), Y(0) + 9.5, aG + "°", T.minimo, { al: "C" }); });
        /* 2) elevação */
        var flM = (r.teto && r.teto.flecha ? r.teto.flecha : 0) * 1000, base = p.tipo === "elevado" ? p.alturaTorre * 1000 : 0, Htot = base + Hm + flM;
        var yTopo = Y(0) + 16, hDisp = (ar.y + ar.h - yTopo - 4) * 0.58, e2 = escala([Dm, Htot], [ar.w * 0.45 - 30, hDisp - 14]); blocoY = yTopo + hDisp + 6;
        var th2 = AP.tituloVista(D, ar.x + 2, yTopo, "ELEVAÇÃO", "ESCALA 1:" + e2), xe = ar.x + 20, ye = yTopo + th2 + 4 + flM / e2, Ye = function (z) { return ye + (base + Hm - z) / e2; };
        an.forEach(function (a) { D.ret(xe, Ye(base + (a.z0 + a.largura) * 1000), Dm / e2, a.largura * 1000 / e2, "MET-PERFIL"); });
        if (p.teto === "domo" || /conico/.test(p.teto)) { var cx2 = xe + Dm / e2 / 2, yb = Ye(base + Hm); if (p.teto === "domo") { var pts = []; for (var k = 0; k <= 16; k++) { var u = -1 + 2 * k / 16; pts.push([cx2 + u * Dm / e2 / 2, yb - flM / e2 * (1 - u * u)]); } D.poli(pts, "MET-PERFIL"); } else D.poli([[xe, yb], [cx2, yb - flM / e2], [xe + Dm / e2, yb]], "MET-PERFIL"); }
        arr(r.contraventamento && r.contraventamento.aneis).forEach(function (g2) { var yg = Ye(base + g2.cota * 1000); D.linha(xe - g2.secao.b / e2, yg, xe + Dm / e2 + g2.secao.b / e2, yg, "MET-PRINCIPAL"); });
        if (p.tipo === "elevado" && r.torre) { var rb = r.torre.raioBase * 1000 / e2, rt = r.torre.raioTopo * 1000 / e2, cx3 = xe + Dm / e2 / 2; D.linha(cx3 - rb, Ye(0), cx3 - rt, Ye(base), "MET-PERFIL"); D.linha(cx3 + rb, Ye(0), cx3 + rt, Ye(base), "MET-PERFIL"); for (var pn = 0; pn < r.torre.paineis; pn++) { var za = base * pn / r.torre.paineis, zb = base * (pn + 1) / r.torre.paineis, wa = rb + (rt - rb) * pn / r.torre.paineis, wb = rb + (rt - rb) * (pn + 1) / r.torre.paineis; D.linha(cx3 - wa, Ye(za), cx3 + wb, Ye(zb), "MET-SECUNDARIO"); D.linha(cx3 + wa, Ye(za), cx3 - wb, Ye(zb), "MET-SECUNDARIO"); } D.cota(xe - 8, Ye(0), xe - 8, Ye(base), 0, String(Math.round(base))); }
        D.linha(xe - 10, Ye(0), xe + Dm / e2 + 10, Ye(0), "MET-FINA");
        D.cota(xe, Ye(0) + 0.1, xe + Dm / e2, Ye(0) + 0.1, -5, String(Math.round(Dm)));
        D.cota(xe + Dm / e2, Ye(base), xe + Dm / e2, Ye(base + Hm), 6, String(Math.round(Hm)));
        var yl = Ye(base + r.geometria.nivel * 1000); D.linha(xe + 1, yl, xe + Dm / e2 - 1, yl, "MET-OCULTA"); D.texto(xe + Dm / e2 / 2, yl - 1, "NÍVEL DE PROJETO " + br(r.geometria.nivel, 2) + " m", T.minimo, { al: "C" });
        /* 3) planta */
        var xp0 = ar.x + ar.w * 0.5, e3 = escala([Dm * 1.25, Dm * 1.25], [ar.w * 0.5 - 12, hDisp - 14]);
        var th3 = AP.tituloVista(D, xp0, yTopo, "PLANTA", "ESCALA 1:" + e3), cxp = xp0 + ar.w * 0.25, cyp = yTopo + th3 + 6 + Dm * 0.62 / e3, Rp = Dm / 2 / e3;
        D.circ(cxp, cyp, Rp, "MET-PERFIL"); D.circ(cxp, cyp, Rp + (r.fundo ? r.fundo.projecao * 1000 / e3 : 0.5), "MET-FINA");
        D.linha(cxp - Rp - 4, cyp, cxp + Rp + 4, cyp, "MET-EIXO"); D.linha(cxp, cyp - Rp - 4, cxp, cyp + Rp + 4, "MET-EIXO");
        D.texto(cxp + Rp + 5, cyp, "0°", T.minimo, { al: "E", meio: true }); D.texto(cxp, cyp - Rp - 5, "90°", T.minimo, { al: "C" });
        var kTeto = 0;
        ab.forEach(function (a) {
          var aG = a.onde === "teto" ? 45 + 90 * (kTeto++) : a.ang, rr = a.onde === "teto" ? Rp * 0.45 : Rp, c = Math.cos(aG * PI / 180), s = Math.sin(aG * PI / 180), px = cxp + rr * c, py = cyp - rr * s;
          D.circ(px, py, Math.max(0.6, (a.OD || a.furo) / 2 / e3), "MET-PRINCIPAL");
          D.texto(cxp + (rr + 5) * c, cyp - (rr + 5) * s, mk[a.id], T.minimo, { al: "C", meio: true });
        });
        if (r.estabilidade && r.estabilidade.chumbadores) { var ch = r.estabilidade.chumbadores; for (var ic = 0; ic < ch.n; ic++) { var aa = 2 * PI * (ic + 0.5) / ch.n; D.circ(cxp + ch.dc * 500 / e3 * Math.cos(aa), cyp - ch.dc * 500 / e3 * Math.sin(aa), 0.5, "MET-PRINCIPAL"); } }
      } else {
        var Lm = p.L * 1000, Dh = p.D * 1000, hs = p.alturaSela * 1000, e4 = escala([Lm, Dh + hs], [ar.w * 0.6, ar.h * 0.6]); esc0 = e4;
        var th4 = AP.tituloVista(D, ar.x + 2, ar.y + 2, "ELEVAÇÃO LATERAL", "ESCALA 1:" + e4), xh = ar.x + 20, yh = ar.y + 2 + th4 + 6, yc = yh + Dh / 2 / e4;
        D.ret(xh, yh, Lm / e4, Dh / e4, "MET-PERFIL");
        [r.selas.A * 1000, Lm - r.selas.A * 1000].forEach(function (xs) { D.ret(xh + xs / e4 - r.selas.b * 500 / e4, yh + Dh / e4, r.selas.b * 1000 / e4, hs / e4, "MET-PRINCIPAL"); });
        D.linha(xh - 10, yh + (Dh + hs) / e4, xh + Lm / e4 + 10, yh + (Dh + hs) / e4, "MET-FINA");
        D.cota(xh, yh + (Dh + hs) / e4, xh + Lm / e4, yh + (Dh + hs) / e4, -6, String(Math.round(Lm)));
        D.cota(xh + Lm / e4, yh, xh + Lm / e4, yh + Dh / e4, 6, String(Math.round(Dh)));
        D.cota(xh, yh + Dh / e4 + 0.1, xh + r.selas.A * 1000 / e4, yh + Dh / e4 + 0.1, -12, String(Math.round(r.selas.A * 1000)));
        D.texto(xh + Lm / e4 / 2, yc, "COSTADO #" + br(r.costado.aneis[0].t, 1) + " - TAMPOS #" + br(r.costado.tampo, 1), T.minimo, { al: "C", meio: true });
      }
      /* embaixo, no corpo da folha: lista de materiais (esquerda), soldas e notas (direita) */
      var geoE = { coluna: { x: ar.x + 2, y: blocoY, w: ar.w * 0.5 - 6 }, carimbo: { y: ar.y + ar.h - 2 } }, geoD = { coluna: { x: ar.x + ar.w * 0.5 + 2, y: blocoY, w: ar.w * 0.5 - 6 }, carimbo: { y: ar.y + ar.h - 2 } };
      var cE = new Col(D, geoE, AP), cD = new Col(D, geoD, AP);
      cE.titulo("LISTA DE MATERIAIS");
      cE.tabela([{ t: "ITEM", w: 46, al: "E" }, { t: ["ESP.", "(mm)"], w: 12 }, { t: "QTD", w: 10 }, { t: ["MASSA", "(kg)"], w: 16 }], arr(q.chapas).map(function (c) { return [txtS(c.item).replace(/ — /g, " - "), br(c.t, 1), String(c.qtd), br(c.massa, 0)]; }).concat([{ total: ["TOTAL DO TANQUE (AÇO)", "", "", br(q.pesos ? q.pesos.total : 0, 0)] }]), 14);
      if (q.mapaSoldas) { cD.titulo("SOLDAS"); cD.tabela([{ t: "TIPO DE JUNTA", w: 52, al: "E" }, { t: ["COMPR.", "(m)"], w: 16 }], q.mapaSoldas.tipos.map(function (x) { return [x.tipo, br(x.m, 1)]; }).concat([{ total: ["TOTAL", br(q.mapaSoldas.total, 1)] }]), 9); }
      /* coluna: anéis e aberturas */
      var col = new Col(D, geo, AP);
      if (p.tipo !== "horizontal") {
        col.titulo("ANÉIS DO COSTADO");
        col.tabela([{ t: "ANEL", w: 12 }, { t: ["ESP.", "(mm)"], w: 14 }, { t: ["ALT.", "(mm)"], w: 16 }, { t: "CHAPAS", w: 16 }, { t: ["COMPR.", "(mm)"], w: 18 }, { t: ["MASSA", "(kg)"], w: 18 }],
          r.costado.aneis.map(function (a, i) { var pa = q.planoChapas ? q.planoChapas.aneis[i] : null; return [String(a.i), br(a.t, 1), String(Math.round(a.largura * 1000)), pa ? String(pa.n) : "-", pa ? String(Math.round(pa.comprimento * 1000)) : "-", br(a.massa, 0)]; }), 10);
      }
      if (ab.length) { col.titulo("ABERTURAS"); col.tabela([{ t: "MARCA", w: 14 }, { t: "DN", w: 12 }, { t: ["COTA", "(mm)"], w: 16 }, { t: "ÂNG.", w: 12 }, { t: ["REFORÇO", "(mm)"], w: 30 }], ab.map(function (a) { return [mk[a.id], String(a.dn), a.onde === "teto" ? "TETO" : String(Math.round(a.cota * 1000)), a.onde === "teto" ? "-" : String(Math.round(a.ang)) + "°", a.reforco ? "Ø" + Math.round(a.reforco.Do) + " #" + br(a.reforco.t, 1) : "-"]; }), 12); }
      if (r.torre && r.torre.ligacoes) { var lg = r.torre.ligacoes; col.titulo("TORRE"); col.tabela([{ t: "ITEM", w: 26, al: "E" }, { t: "ESPECIFICAÇÃO", w: 60, al: "E" }], [["Pilares", r.torre.pilares + " × " + r.torre.pilar], ["Diagonais", txtS(r.torre.diagonal)], ["Placa de base", lg.placaBase && lg.placaBase.dimensoes ? lg.placaBase.dimensoes.B + "×" + lg.placaBase.dimensoes.L + "×" + lg.placaBase.dimensoes.t + " mm, " + lg.placaBase.dimensoes.chumbadores.n + " chumb. " + lg.placaBase.dimensoes.chumbadores.id : "-"], ["Lig. diagonal", lg.diagonal ? lg.diagonal.parafusos + " × A325 " + lg.diagonal.d + ", gusset #" + br(lg.diagonal.gusset.t, 1) : "-"]], 6); }
      col.notas([r.resumo, "Cálculo: API 650 (costado, fundo, teto, aberturas 5.7), NBR 6123 (vento), NR-12 (acessos) - ver o memorial de cálculo.",
        "Juntas verticais do costado de topo com penetração total, defasadas no mínimo 5·t entre anéis (API 650, 5.1.5.2).", "Cotas em mm. Ângulos no sentido anti-horário a partir de 0° (planta).",
        { t: arr(r.naoVerificado).length + " item(ns) não verificado(s) neste cálculo - ver o memorial [PENDENTE].", cor: AP.VERMELHO }]);
      return { escala: esc0 ? "1:" + esc0 : "INDICADA" };
    } };
    var res = FD.montar([def], { codigo: op.codigo || "TQ-01", obra: op.obra || "", revisao: op.revisao || "R00", empresa: op.empresa, responsavel: op.responsavel, registro: op.registro, descricaoRevisao: "EMISSÃO INICIAL - TANQUE", logo: op.logo });
    return res;
  }
  function txtS(v) { return v == null ? "" : String(v); }

  function pdfFolha(res, titulo) { var FD = dep("BimMetalFabDes", "./metalfabdes.js"); return FD && FD.pdf && res && res.ok ? FD.pdf(res.folhas, titulo || "Tanque") : null; }
  var MetalTanque = { folha: folha, pdfFolha: pdfFolha, gerar: gerar, gerarResultado: gerarResultado, massasPorParte: massasPorParte, identidade: identidade, tanques: tanques, parParaRefazer: parParaRefazer, contorno: contorno, esquema: esquema, desenho: desenho, dica: dica, DICAS: DICAS };
  global.MetalTanque = MetalTanque;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalTanque;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

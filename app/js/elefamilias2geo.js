/* =====================================================================
 * elefamilias2geo.js — GEOMETRIA das luminárias e dos eletrodomésticos/equipamentos com ponto elétrico (Elétrica v2, lote L2b, 07/11/2026)
 *
 * Pedido do Rogério: "igual ao produto de loja" — volumetria, borda arredondada, difusor, aletas, canopla, alça, porta, visor, display, pés; caixa genérica
 * é reprovada. Aqui ficam só as FORMAS (motor puro, ES5, sem DOM), na cena do js/mobgeo.js; os NÚMEROS (cota, fonte, nível) vêm do catálogo L1
 * (js/elecatalogodados.js) por js/elefamilias2.js, em METROS. Cada função desenha na origem LOCAL da peça. Nenhum NaN: toda cota passa por num()/cl().
 *
 * ORIGENS (as mesmas do js/familiasluz.js e do js/familiasmobcoz.js, para a peça trocar de lugar sem o resto notar):
 *   · luminária de teto: planta no centro, Y = a altura de montagem A (a face de BAIXO do forro/laje); o corpo desce a partir de A.
 *   · luminária/aparelho de PAREDE: Z = 0 na face da parede, a frente em +Z, X no centro; Y = o CENTRO da peça (A).
 *   · eletrodoméstico de piso/bancada: Z = 0 no FUNDO (encosta na parede), a frente em +Z, X no centro, Y = a base (o piso ou o tampo, y0).
 * O QUE É INTERPRETAÇÃO (o catálogo L1 não publica): a espessura da chapa, o desenho do painel de comando, as alças, as aletas e o suporte do refletor,
 * os pés. Cada uma está dita no comentário da forma; a cota que o catálogo traz (largura, altura, profundidade, diâmetro) não é mexida aqui.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var RAD = Math.PI / 180;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function cl(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* nomes de material = chaves do FAM_PBR do js/bim.js (todas já existem) */
  var M = { BR: "plástico branco", DIF: "acrilico branco", TRANSP: "acrílico transparente", PRETO: "metal preto", CROMO: "metal cromado", INOX: "inox", FUME: "vidro fume",
    VIDRO: "vidro", TELA: "tela preta", BORR: "borracha preta", MBR: "metal branco", GALV: "aço galvanizado estampado", CINZA: "plástico cinza din", VERDE: "indicador dps verde",
    AMAR: "botão de teste amarelo", VERM: "manípulo vermelho", LACAG: "laca grafite", LACA: "laca branca" };

  /* ------------------------------------------------------------ PEQUENAS FERRAMENTAS */
  /* caixa arredondada CENTRADA nos três eixos */
  function rb(c, mat, cx, cy, cz, dx, dy, dz, r, k, o) {
    var rr = cl(r, 0.0004, Math.min(dx, dy, dz) / 2.2);
    c.caixaR(mat, cx, cy - dy / 2, cz, Math.max(1e-3, dx), Math.max(1e-3, dy), Math.max(1e-3, dz), rr, o ? { k: k || 2, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ } : { k: k || 2 });
  }
  /* caixa viva centrada */
  function bx(c, mat, cx, cy, cz, dx, dy, dz) { c.caixa(mat, cx, cy - dy / 2, cz, dx, dy, dz); }
  /* disco/cilindro com o eixo em z, centrado (a face de trás em cz − h/2) */
  function dz(c, mat, cx, cy, cz, r, h, seg) { c.cilH(mat, cx, cy, cz, r, h, "z", { seg: seg || 20 }); }
  /* pé de aparelho */
  function pe(c, x, z, y0, r, h) { c.cil(M.BORR, x, y0, z, r, h, { seg: 10 }); }
  /* botão redondo de painel: corpo + tampa de cromo */
  function botao(c, x, y, z, r) { dz(c, M.PRETO, x, y, z + 0.0015, r, 0.003, 14); dz(c, M.CROMO, x, y, z + 0.0033, r * 0.72, 0.0012, 14); }
  /* manopla de forno/fogão: corpo escuro, anel de cromo e marca */
  function manopla(c, x, y, z, r) {
    dz(c, M.PRETO, x, y, z + 0.011, r, 0.022, 18); dz(c, M.CROMO, x, y, z + 0.0225, r * 0.86, 0.003, 18); bx(c, M.CROMO, x, y + r * 0.45, z + 0.0255, 0.0035, r * 0.55, 0.0012);
  }
  /* alça-barra horizontal com dois apoios, no plano z */
  function alcaH(c, mat, cx, cy, zface, comp, r, saliencia) {
    c.cilH(mat, cx, cy, zface + saliencia, r, comp, "x", { seg: 12 });
    [-1, 1].forEach(function (s) { c.cilH(mat, cx + s * (comp / 2 - 0.02), cy, zface + saliencia / 2, r * 0.6, saliencia, "z", { seg: 8 }); });
  }
  function alcaV(c, mat, cx, cy, zface, comp, r, saliencia) {
    c.cil(mat, cx, cy - comp / 2, zface + saliencia, r, comp, { seg: 12 });
    [-1, 1].forEach(function (s) { c.cilH(mat, cx, cy + s * (comp / 2 - 0.02), zface + saliencia / 2, r * 0.6, saliencia, "z", { seg: 8 }); });
  }
  /* visor/mostrador: fundo escuro e janela acesa (verde) */
  function display(c, x, y, z, w, h) { bx(c, M.TELA, x, y, z + 0.0005, w, h, 0.001); bx(c, M.VERDE, x, y, z + 0.0013, w * 0.78, h * 0.5, 0.0006); }
  function corCorpo(acab) { return acab === "branco" ? M.BR : (acab === "preto" ? M.PRETO : M.INOX); }

  /* ============================================================ 1. PLAFON DE SOBREPOR (redondo | quadrado)
   * p: { redondo, D (diâmetro ou lado externo), H (altura do corpo), A, Ld (face que acende) }. Corpo com a borda arredondada, junta escura e difusor
   * levemente abaulado (leitoso). A espessura da borda e o abaulado são modelagem. */
  function plafon(c, p) {
    var A = num(p.A, 2.6), Ht = cl(num(p.H, 0.04), 0.01, 0.2), D = cl(num(p.D, 0.225), 0.06, 1.2), Ld = cl(num(p.Ld, D - 0.03), 0.03, D - 0.004), r = D / 2;
    var H = Ht - (p.redondo ? 0.0042 : 0.0047);   /* o difusor abaulado desce 4 mm: corpo + difusor = a altura do catálogo */
    if (p.redondo) {
      c.torno(M.BR, 0, 0, 0, [[0, A - H], [r - 0.01, A - H], [r - 0.002, A - H + 0.004], [r, A - H + 0.012], [r, A - 0.004], [r - 0.004, A]], { seg: 48 });
      c.cil(M.BORR, 0, A - H - 0.0006, 0, Ld / 2 + 0.0016, 0.0012, { seg: 48 });
      c.torno(M.DIF, 0, 0, 0, [[0, A - H - 0.0042], [Ld * 0.2, A - H - 0.0041], [Ld * 0.38, A - H - 0.0035], [Ld / 2 - 0.003, A - H - 0.0018], [Ld / 2, A - H - 0.0004]], { seg: 48 });
    } else {
      rb(c, M.BR, 0, A - H / 2, 0, D, H, D, Math.min(0.016, H * 0.45), 3);
      rb(c, M.BORR, 0, A - H - 0.0004, 0, Ld + 0.0032, 0.0012, Ld + 0.0032, 0.004, 2);
      rb(c, M.DIF, 0, A - H - 0.0024, 0, Ld, 0.0046, Ld, 0.003, 2);
    }
  }

  /* ============================================================ 2. PAINEL LED DE EMBUTIR (quadrado | redondo), BORDA FINA
   * p: { redondo, D (lado/diâmetro da moldura), H (espessura do painel), furo (recorte no forro), A, borda }. Só a moldura (≈ 4 mm) fica abaixo do forro;
   * acima dele, o corpo que entra no recorte e a caixa do driver (modelagem). */
  function painel(c, p) {
    var A = num(p.A, 2.6), D = cl(num(p.D, 0.3), 0.06, 1.2), H = cl(num(p.H, 0.01), 0.006, 0.12), b = cl(num(p.borda, 0.008), 0.003, D / 4), fu = cl(num(p.furo, D - 0.015), 0.04, D), e = 0.004;
    if (p.redondo) {
      c.torno(M.BR, 0, 0, 0, [[0, A - e], [D / 2 - 0.0025, A - e], [D / 2, A - e + 0.0015], [D / 2, A]], { seg: 48 });
      c.torno(M.DIF, 0, 0, 0, [[0, A - e - 0.0012], [D / 2 - b - 0.002, A - e - 0.0012], [D / 2 - b, A - e]], { seg: 48 });
      c.cil(M.MBR, 0, A, 0, fu / 2 - 0.002, H - e, { seg: 40 });
    } else {
      rb(c, M.BR, 0, A - e / 2, 0, D, e, D, 0.0015, 2);
      rb(c, M.DIF, 0, A - e - 0.0006, 0, D - 2 * b, 0.0016, D - 2 * b, 0.001, 1);
      bx(c, M.MBR, 0, A + (H - e) / 2, 0, fu - 0.004, H - e, fu - 0.004);
    }
    bx(c, M.MBR, D * 0.22, A + H - e + 0.012, D * 0.18, 0.15, 0.024, 0.045);   /* caixa do driver sobre o painel (acima do forro): modelagem */
    bx(c, M.CINZA, D * 0.22 - 0.075, A + H - e + 0.012, D * 0.18, 0.006, 0.01, 0.03);
  }

  /* ============================================================ 3. CALHA TUBULAR LED 1,20 m (1 ou 2 tubos), de sobrepor
   * p: { L, W (largura da calha), H, A, tubos }. Calha em U (fundo, abas, tampas de ponta) com o(s) tubo(s) T8 e os soquetes das pontas. Chapa e soquete: modelagem. */
  function tubular(c, p) {
    var A = num(p.A, 2.6), L = cl(num(p.L, 1.2), 0.3, 3), W = cl(num(p.W, 0.06), 0.03, 0.4), H = cl(num(p.H, 0.04), 0.02, 0.15), n = Math.round(cl(num(p.tubos, 1), 1, 2)), t = 0.0015;
    bx(c, M.BR, 0, A - 0.001, 0, L, 0.002, W);
    [-1, 1].forEach(function (s) {
      bx(c, M.BR, 0, A - H / 2, s * (W / 2 - t / 2), L, H, t);                               /* aba lateral */
      bx(c, M.BR, 0, A - H + t / 2, s * (W / 2 - 0.007), L, t, 0.014);                       /* dobra para dentro (refletor) */
      bx(c, M.BR, s * (L / 2 - 0.0015), A - H / 2, 0, 0.003, H, W);                         /* tampa de ponta */
    });
    var zs = n === 1 ? [0] : [-W * 0.3, W * 0.3];
    zs.forEach(function (z) {
      c.cilH(M.DIF, 0, A - 0.021, z, 0.0135, L - 0.07, "x", { seg: 18 });
      [-1, 1].forEach(function (s) {
        bx(c, M.CINZA, s * (L / 2 - 0.025), A - 0.019, z, 0.02, 0.026, 0.034);                /* soquete bipino */
        c.cilH(M.CROMO, s * (L / 2 - 0.0345), A - 0.021, z, 0.0125, 0.003, "x", { seg: 12 });  /* a tampa metálica da ponta do tubo */
      });
    });
    bx(c, M.CINZA, L * 0.18, A - 0.005, 0, 0.09, 0.008, Math.min(W - 0.01, 0.04));            /* driver preso ao fundo: modelagem */
  }

  /* ============================================================ 4. LUMINÁRIA DE EMERGÊNCIA 30 LEDs (sobrepor de parede)
   * p: { L, W, D, A (altura do centro) }. Corpo com os cantos arredondados, lente transparente sobre a placa com 2 fileiras de 15 LEDs, LED verde de carga
   * e botão de teste (modelagem do painel). */
  function emergencia(c, p) {
    var A = num(p.A, 2.2), L = cl(num(p.L, 0.3), 0.1, 1), W = cl(num(p.W, 0.1), 0.04, 0.4), D = cl(num(p.D, 0.05), 0.02, 0.2);
    rb(c, M.BR, 0, A, (D - 0.0012) / 2, L, W, D - 0.0012, 0.01, 3);
    rb(c, M.TELA, 0, A, D - 0.0022, L - 0.034, W - 0.034, 0.0024, 0.004, 1);                  /* a placa dos LEDs, em moldura branca */
    var n = 15, x0 = -(L - 0.074) / 2, dx = (L - 0.074) / (n - 1), i, j;
    for (j = -1; j <= 1; j += 2) for (i = 0; i < n; i++) { dz(c, M.DIF, x0 + i * dx, A + j * W * 0.17, D - 0.0006, 0.0042, 0.0012, 10); }
    dz(c, M.VERDE, L / 2 - 0.016, A - W / 2 + 0.011, D + 0.0004, 0.0032, 0.0012, 10);
    dz(c, M.AMAR, L / 2 - 0.03, A - W / 2 + 0.011, D + 0.0004, 0.0032, 0.0012, 10);
  }

  /* ============================================================ 5. REFLETOR LED (50 | 100 W): aletas atrás e SUPORTE EM U
   * p: { W, H, Dp, A, tilt }. O corpo gira em torno do eixo X pelo ponto de pivô (cota do centro); inclinação para baixo = tilt. Aletas do dissipador, vidro
   * frontal sobre a placa de LED, o U de aço com os parafusos de regulagem. Número de aletas, espessuras e o desenho do U: modelagem. */
  function refletor(c, p) {
    var A = num(p.A, 2.4), W = cl(num(p.W, 0.215), 0.08, 0.6), H = cl(num(p.H, 0.19), 0.06, 0.6), Dp = cl(num(p.Dp, 0.04), 0.02, 0.2), th = cl(num(p.tilt, 20), 0, 80);
    var Zp = H / 2 + 0.035, cs = Math.cos(th * RAD), sn = Math.sin(th * RAD);
    /* ponto local do corpo (y, z) → mundo (y, z) */
    function T(y, z) { return [A + cs * y - sn * z, Zp + sn * y + cs * z]; }
    /* caixa arredondada do corpo, centrada no ponto local (lx, ly, lz), girada junto */
    function cb(mat, lx, ly, lz, dx, dy, dzz, r, k) {
      var q = T(ly, lz), base = [q[0] - cs * dy / 2, q[1] - sn * dy / 2];
      c.caixaR(mat, lx, base[0], base[1], dx, dy, dzz, cl(r, 0.0004, Math.min(dx, dy, dzz) / 2.2), { k: k || 2, rotX: th });
    }
    cb(M.PRETO, 0, 0, 0, W, H, Dp, 0.012);                                                  /* carcaça */
    cb(M.DIF, 0, 0, Dp / 2 + 0.0004, W - 0.036, H - 0.036, 0.002, 0.004);                    /* a placa de LED acesa */
    cb(M.VIDRO, 0, 0, Dp / 2 + 0.0022, W - 0.014, H - 0.014, 0.0022, 0.004);                 /* o vidro frontal */
    var nf = Math.max(5, Math.round((W - 0.05) / 0.021)), i;
    for (i = 0; i < nf; i++) {
      var lx = -((W - 0.05) / 2) + i * ((W - 0.05) / (nf - 1));
      cb(M.PRETO, lx, 0, -Dp / 2 - 0.0085, 0.0034, H - 0.05, 0.017, 0.0008, 1);                /* aleta do dissipador */
    }
    cb(M.PRETO, 0, 0, -Dp / 2 - 0.0015, W - 0.03, H - 0.03, 0.003, 0.001);                  /* base das aletas */
    /* o suporte em U (aço): chapa na parede + dois braços ao lado do corpo, com o parafuso de regulagem em cada pivô */
    bx(c, M.GALV, 0, A, 0.002, W + 0.05, 0.05, 0.004);
    [-1, 1].forEach(function (s) {
      var xs = s * (W / 2 + 0.0075);
      bx(c, M.GALV, xs, A, Zp / 2, 0.004, 0.04, Zp);
      c.cilH(M.CROMO, s * (W / 2 + 0.0165), A, Zp, 0.0085, 0.014, "x", { seg: 12 });
      c.cilH(M.CROMO, s * (W / 2 + 0.0245), A, Zp, 0.0036, 0.004, "x", { seg: 6 });
    });
    bx(c, M.GALV, 0, A, Zp * 0.45, W + 0.019, 0.004, 0.02);                                 /* a travessa do U (a base do "U" visto de cima) */
  }

  /* ============================================================ 6. BALIZADOR LED (parede | piso)
   * p: { L, H, P, A, piso }. Parede: corpo em alumínio escuro, viseira, duas fendas de luz (leitoso) na frente. Piso: moldura rente ao piso com as fendas
   * (Y = 0 é a face do piso) e a caixa embutida abaixo. As fendas e a viseira: modelagem. */
  function balizador(c, p) {
    var A = num(p.A, 0.4), L = cl(num(p.L, 0.14), 0.04, 0.6), H = cl(num(p.H, 0.07), 0.03, 0.4), P = cl(num(p.P, 0.07), 0.03, 0.4), i;
    if (p.piso) {
      rb(c, M.PRETO, 0, 0.0015, 0, L, 0.003, P, 0.003, 1);                                  /* moldura rente ao piso */
      for (i = -1; i <= 1; i++) bx(c, M.DIF, 0, 0.0034, i * P * 0.24, L - 0.04, 0.0008, 0.012);
      bx(c, M.PRETO, 0, -0.025, 0, L - 0.012, 0.05, P - 0.012);                             /* a caixa embutida */
      return;
    }
    L -= 0.006; H -= 0.004; P -= 0.012;                                                       /* viseira e parafusos avançam: o conjunto fecha na cota do catálogo */
    rb(c, M.PRETO, 0, A, P / 2, L, H, P, 0.008, 2);
    for (i = -1; i <= 1; i += 2) { bx(c, M.DIF, 0, A + i * H * 0.2, P + 0.0006, L - 0.036, H * 0.17, 0.0016); bx(c, M.PRETO, 0, A + i * H * 0.2 - H * 0.115, P + 0.002, L - 0.03, 0.003, 0.004); }
    bx(c, M.PRETO, 0, A + H / 2 + 0.002, P * 0.725 + 0.006, L + 0.006, 0.004, P * 0.55 + 0.012);   /* viseira */
    [-1, 1].forEach(function (s) { c.cilH(M.CROMO, s * (L / 2 - 0.012), A, P + 0.0012, 0.0036, 0.0025, "z", { seg: 6 }); });
  }

  /* ============================================================ 7. ARANDELA EXTERNA "TARTARUGA"
   * p: { W, H, P, A }. Cúpula oval (meio elipsoide), base oval e grade de aletas horizontais na frente. As aletas e a base: modelagem. */
  function tartaruga(c, p) {
    var A = num(p.A, 2.0), W = cl(num(p.W, 0.2), 0.06, 0.6), H = cl(num(p.H, 0.12), 0.04, 0.5), P = cl(num(p.P, 0.09), 0.03, 0.3), e = 0.012, h = P - e - 0.0045, k;
    c.torno(M.BR, 0, A, 0, [[0, 0], [1, 0], [1, e], [0, e]], { ex: W / 2, ez: H / 2, rotX: 90, seg: 40 });
    var pf = [];
    for (k = 0; k <= 6; k++) { var f = (k / 6) * 90 * RAD; pf.push([Math.cos(f), e + h * Math.sin(f)]); }
    /* o perfil vai da base (raio 1) até o topo (raio 0), de baixo para cima como o torno pede */
    c.torno(M.BR, 0, A, 0, pf, { ex: W / 2, ez: H / 2, rotX: 90, seg: 40 });
    for (k = -2; k <= 2; k++) {
      var dy = k * H * 0.165, s0 = Math.sqrt(Math.max(0.0001, 1 - Math.pow(dy / (H / 2), 2))), ra = (W / 2) * s0 + 0.0035, rbb = h * s0 + 0.0035, ct = [], j2;
      for (j2 = 0; j2 <= 14; j2++) { var ang = Math.PI * j2 / 14; ct.push([Math.cos(ang) * ra, e + Math.sin(ang) * rbb]); }
      c.prisma(M.PRETO, 0, A + dy - 0.0035, 0, ct, 0.007, {});
    }
    [-1, 1].forEach(function (s) { c.cilH(M.CROMO, s * (W / 2 - 0.012), A, e + 0.0015, 0.0045, 0.003, "z", { seg: 8 }); });
  }

  /* ============================================================ 8. BOCAL E27 COM LÂMPADA BULBO 9 W (ponto simples de obra)
   * p: { A, dBulbo, Htot, dRosca }. Rosácea no forro, bocal de plástico com a rosca coberta, lâmpada A60 leitosa. A rosca fica DENTRO do bocal (assim o
   * ponto de luz do render cai no vidro, não no metal). Rosácea e bocal: modelagem. */
  function bocal(c, p) {
    var A = num(p.A, 2.6), db = cl(num(p.dBulbo, 0.06), 0.03, 0.15), Ht = cl(num(p.Htot, 0.108), 0.06, 0.3), dr = cl(num(p.dRosca, 0.027), 0.012, 0.05);
    var Yg = A - 0.045, Hg = Ht - 0.03, R = db / 2, rn = (dr / 2 - 0.0005) / R, pf = [], k, u, r;
    c.cil(M.BR, 0, A - 0.012, 0, 0.0325, 0.012, { seg: 28 });
    c.torno(M.BR, 0, 0, 0, [[0.0215, A - 0.045], [0.0235, A - 0.043], [0.0235, A - 0.016], [0.0205, A - 0.012]], { seg: 24 });
    c.cil(M.CROMO, 0, A - 0.0475, 0, dr / 2 + 0.0015, 0.0025, { seg: 20 });
    /* o vidro A60 leitoso, do bico (embaixo) ao pescoço (em cima): elipse até o diâmetro máximo (62 % da altura) e curva suave até o pescoço */
    var hs = Math.min(R, Hg * 0.7);
    for (k = 0; k <= 14; k++) {
      var h1 = hs * k / 14; r = Math.sqrt(Math.max(0, 1 - Math.pow((hs - h1) / hs, 2)));
      pf.push([r * R, Yg - Hg + h1]);
    }
    for (k = 1; k <= 10; k++) {
      var t = k / 10; r = rn + (1 - rn) * Math.cos(t * Math.PI / 2);
      pf.push([r * R, Yg - Hg + hs + t * (Hg - hs)]);
    }
    c.torno(M.DIF, 0, 0, 0, pf, { seg: 28 });
  }

  /* ============================================================ 9. SPOT DE TRILHO + TRILHO ELETRIFICADO
   * p: { L (trilho), D (diâmetro do spot), Hh (altura do spot), A, incl, n (spots) }. Trilho de alumínio com a fenda escura, tampa de ponta e a alimentação
   * (canopla) na ponta de x = −L/2; o(s) spot(s) com adaptador, haste, garfo e cabeça que inclina. Perfil do trilho e garfo: modelagem. */
  function spotTrilho(c, p) {
    var A = num(p.A, 2.6), L = cl(num(p.L, 1), 0.2, 4), D = cl(num(p.D, 0.07), 0.025, 0.2), Hh = cl(num(p.Hh, 0.13), 0.06, 0.4), th = cl(num(p.incl, 30), 0, 80), n = Math.round(cl(num(p.n, 1), 1, 6)), i;
    bx(c, M.MBR, 0, A - 0.0125, 0, L, 0.025, 0.03);
    bx(c, M.BORR, 0, A - 0.0245, 0, L - 0.004, 0.002, 0.009);
    [-1, 1].forEach(function (s) { bx(c, M.MBR, s * (L / 2 + 0.0015), A - 0.0125, 0, 0.003, 0.025, 0.03); });
    rb(c, M.MBR, -L / 2 + 0.03, A - 0.017, 0, 0.06, 0.034, 0.045, 0.004, 1);                  /* a alimentação (canopla) na ponta */
    var bodyL = Hh - 0.062;
    for (i = 0; i < n; i++) {
      var x = n === 1 ? 0 : -L / 2 + 0.2 + i * ((L - 0.4) / (n - 1)), py = A - 0.025 - 0.05;
      bx(c, M.MBR, x, A - 0.035, 0, 0.036, 0.02, 0.026);                                     /* adaptador */
      c.cil(M.MBR, x, py, 0, 0.007, 0.03, { seg: 10 });                                       /* haste */
      c.cilH(M.PRETO, x, py, 0, 0.012, 0.062, "x", { seg: 10 });                              /* pivô */
      var d = [0, -Math.cos(th * RAD), Math.sin(th * RAD)];
      c.cil(M.MBR, x, py, 0, D / 2, bodyL, { rotX: 180 - th, seg: 24 });                     /* cabeça */
      c.cil(M.PRETO, x + 0, py + d[1] * (bodyL * 0.12), d[2] * (bodyL * 0.12), D / 2 + 0.002, 0.004, { rotX: 180 - th, seg: 24 });
      c.cil(M.DIF, x, py + d[1] * (bodyL + 0.0005), d[2] * (bodyL + 0.0005), D / 2 - 0.006, 0.0014, { rotX: 180 - th, seg: 24 });
      c.cil(M.PRETO, x, py + d[1] * (bodyL - 0.0035), d[2] * (bodyL - 0.0035), D / 2 + 0.0008, 0.0035, { rotX: 180 - th, seg: 24 });
    }
  }

  /* ============================================================ MICRO-ONDAS DE BANCADA (20 | 30 L)
   * p: { W, H, D, y0 (a bancada), acab }. Corpo arredondado, porta de vidro escuro à esquerda com a alça vertical, painel com visor, teclas e seletor à direita, pés. */
  function microondas(c, p) {
    var W = cl(num(p.W, 0.44), 0.2, 0.9), H = cl(num(p.H, 0.26), 0.15, 0.6), D = cl(num(p.D, 0.34), 0.2, 0.8) - 0.031, y0 = num(p.y0, 0.9), mat = corpo(p.acab), i;   /* a porta e a alça avançam 31 mm: o conjunto fecha na profundidade do catálogo */
    var b = y0 + 0.012, hb = H - 0.012;
    [-1, 1].forEach(function (sx) { [0.04, D - 0.04].forEach(function (z) { pe(c, sx * (W / 2 - 0.035), z, y0, 0.011, 0.012); }); });
    rb(c, mat, 0, b + hb / 2, D / 2, W, hb, D, 0.014, 2);
    var Wd = W * 0.72, xd = -W / 2 + 0.012 + Wd / 2, hd = hb - 0.034, yc = b + hb / 2, Wp = W - Wd - 0.04, xp = W / 2 - 0.012 - Wp / 2;
    rb(c, M.PRETO, xd, yc, D + 0.002, Wd, hd, 0.01, 0.006, 1);                                /* a porta (moldura escura) */
    rb(c, M.TELA, xd, yc, D + 0.0078, Wd - 0.044, hd - 0.044, 0.004, 0.004, 1);               /* o vidro escuro */
    for (i = 0; i < 6; i++) bx(c, M.PRETO, xd, yc - (hd - 0.07) / 2 + i * (hd - 0.07) / 5, D + 0.0102, Wd - 0.05, 0.0012, 0.0005);   /* a grade da janela */
    alcaV(c, M.CROMO, xd + Wd / 2 - 0.016, yc, D + 0.007, hd * 0.62, 0.0065, 0.017);
    rb(c, M.PRETO, xp, yc, D + 0.0014, Wp, hd, 0.004, 0.004, 1);                              /* o painel */
    display(c, xp, yc + hd * 0.34, D + 0.0034, Wp * 0.76, 0.024);
    for (i = 0; i < 6; i++) botao(c, xp - Wp * 0.2 + (i % 2) * Wp * 0.4, yc + hd * 0.12 - Math.floor(i / 2) * 0.03, D + 0.0034, 0.0066);
    manopla(c, xp, yc - hd * 0.32, D + 0.0034, Wp * 0.3);
    for (i = 0; i < 4; i++) bx(c, M.PRETO, W / 2 - 0.0005, b + hb - 0.03 - i * 0.012, D * 0.35, 0.001, 0.0045, D * 0.5);   /* grade de ventilação lateral */
  }
  function corpo(a) { return corCorpo(a); }

  /* ============================================================ FORNO ELÉTRICO DE EMBUTIR 50 L
   * p: { W, H, D, y0, Wn (largura do nicho) }. Faixa de comando com 4 manoplas e visor, porta de inox com vidro e alça-barra, ventilação, carcaça no nicho. */
  function forno(c, p) {
    var W = cl(num(p.W, 0.595), 0.3, 1), H = cl(num(p.H, 0.595), 0.3, 1), D = cl(num(p.D, 0.55), 0.3, 0.9) - 0.048, y0 = num(p.y0, 0.9), Wn = cl(num(p.Wn, 0.56), 0.28, W), i;
    var band = 0.095;
    rb(c, M.PRETO, 0, y0 + H / 2, D / 2 - 0.01, Wn, H - 0.012, D - 0.02, 0.006, 1);          /* a carcaça (entra no nicho) */
    rb(c, M.INOX, 0, y0 + H / 2, D - 0.01, W, H, 0.02, 0.006, 2);                             /* a testa */
    bx(c, M.TELA, 0, y0 + H - band / 2, D + 0.0006, W - 0.04, band - 0.014, 0.0012);          /* a faixa de comando */
    [-0.215, -0.135, 0.135, 0.215].forEach(function (x) { manopla(c, x, y0 + H - band / 2, D, 0.0165); });
    display(c, 0, y0 + H - band / 2, D + 0.0006, 0.12, 0.034);
    var hd = H - band - 0.014, yc = y0 + hd / 2 + 0.007;
    rb(c, M.INOX, 0, yc, D + 0.006, W - 0.016, hd, 0.014, 0.008, 2);                          /* a porta */
    rb(c, M.TELA, 0, yc - 0.01, D + 0.0135, W - 0.1, hd - 0.1, 0.004, 0.006, 1);              /* o vidro escuro */
    for (i = 0; i < 3; i++) bx(c, M.PRETO, 0, y0 + H - band - 0.012 - i * 0.008, D + 0.0004, W * 0.5, 0.0035, 0.001);   /* a ventilação sob a faixa */
    alcaH(c, M.CROMO, 0, yc + hd / 2 - 0.036, D + 0.013, W - 0.15, 0.0085, 0.026);
  }

  /* ============================================================ COOKTOP DE INDUÇÃO 4 BOCAS (de embutir, avulso)
   * p: { W, H, D, yt (o tampo), L }. Vidro preto com cantos arredondados 6 mm acima do tampo, 4 zonas de dois anéis impressos, filete de inox na frente, faixa de comando
   * por toque; o corpo desce abaixo do tampo. Z = 0 no fundo da peça. Os desenhos das zonas e do comando: modelagem. */
  function cooktop(c, p) {
    var W = cl(num(p.W, 0.59), 0.3, 1), H = cl(num(p.H, 0.055), 0.03, 0.2), D = cl(num(p.D, 0.52), 0.3, 0.9), yt = num(p.yt, 0.9), i, zy = yt + 0.006;
    rb(c, M.TELA, 0, yt + 0.003, D / 2, W, 0.006, D, 0.006, 2);
    bx(c, M.PRETO, 0, yt - (H - 0.0075) / 2, D / 2, W - 0.05, H - 0.0075, D - 0.05);
    bx(c, M.INOX, 0, yt + 0.003, D - 0.0006, W - 0.012, 0.0062, 0.0012);
    var zonas = [[-0.145, D * 0.3, 0.085], [0.145, D * 0.3, 0.095], [-0.145, D * 0.67, 0.095], [0.145, D * 0.67, 0.085]];
    zonas.forEach(function (z) {
      var R = z[2];
      c.cil(M.MBR, z[0], zy, z[1], R, 0.0004, { seg: 36 }); c.cil(M.TELA, z[0], zy + 0.0004, z[1], R - 0.0022, 0.0004, { seg: 36 });
      c.cil(M.MBR, z[0], zy + 0.0006, z[1], R * 0.62, 0.0004, { seg: 32 }); c.cil(M.TELA, z[0], zy + 0.001, z[1], R * 0.62 - 0.002, 0.0004, { seg: 32 });
      c.cil(M.MBR, z[0], zy + 0.0012, z[1], 0.0045, 0.0004, { seg: 12 });
    });
    bx(c, M.MBR, 0, zy + 0.0004, D - 0.034, W * 0.36, 0.0004, 0.0024);                       /* a barra do controle deslizante */
    for (i = -3; i <= 3; i++) { if (i === 0) continue; bx(c, M.MBR, i * W * 0.062, zy + 0.0004, D - 0.034, 0.011, 0.0004, 0.011); }
    c.cil(M.MBR, 0, zy, D - 0.034, 0.0075, 0.0005, { seg: 14 }); c.cil(M.TELA, 0, zy + 0.0004, D - 0.034, 0.0055, 0.0004, { seg: 14 });
    bx(c, M.VERDE, -W * 0.1, zy + 0.0005, D - 0.034, 0.02, 0.0004, 0.008);                  /* o visor */
  }

  /* ============================================================ COIFA (parede | depurador), 60 | 90 cm
   * p: { forma, W, H, D, yb (a borda de baixo), Wch (largura da chaminé) }. Parede: capelo em trapézio (perfil em Z extrudado em X), chaminé, filtro, lâmpadas e
   * botões. Depurador: corpo baixo, painel retrátil, filtro e duto de saída. Perfil e chaminé: modelagem. */
  function coifa(c, p) {
    var W = cl(num(p.W, 0.6), 0.3, 1.2), H = cl(num(p.H, 0.6), 0.1, 1.2), D = cl(num(p.D, 0.5), 0.2, 0.9), yb = num(p.yb, 1.6), i, y = yb + 0.0045;   /* filtro e lâmpadas descem 4,5 mm abaixo do capelo */
    if (p.forma === "depurador") {
      var Db = D - 0.12, Hb = H - 0.07;                                                        /* o painel retrátil avança 12 cm; a saída de ar sobe 7 cm */
      rb(c, M.INOX, 0, y + Hb / 2, Db / 2, W, Hb, Db, 0.012, 2);
      rb(c, M.INOX, 0, y + Hb * 0.28, Db - 0.02 + 0.07, W - 0.012, 0.012, 0.14, 0.004, 1);    /* o painel que desliza para a frente */
      bx(c, M.GALV, 0, y - 0.0015, Db / 2 + 0.03, W - 0.06, 0.003, Db - 0.1);                  /* o filtro metálico */
      for (i = -3; i <= 3; i++) bx(c, M.PRETO, i * (W - 0.1) / 7, y - 0.0032, Db / 2 + 0.03, 0.0035, 0.001, Db - 0.1);
      [-1, 1].forEach(function (s) { c.cil(M.DIF, s * W * 0.32, y - 0.0045, Db - 0.04, 0.018, 0.0016, { seg: 14 }); });
      for (i = -1; i <= 1; i++) botao(c, i * 0.04, y + Hb * 0.28, D, 0.0045);
      c.cil(M.MBR, 0, y + Hb, Db * 0.35, 0.075, 0.07 - 0.0045, { seg: 22 });                   /* a saída de ar (150 mm) */
      return;
    }
    var hc = cl(num(p.hc, 0.22), 0.1, H - 0.1), Dch = cl(num(p.Dch, 0.3), 0.15, D), Wch = cl(num(p.Wch, 0.3), 0.15, W), Ht = H - 0.0045, a = D - Dch, Lg = Math.sqrt(a * a + hc * hc);
    c.prisma(M.INOX, W / 2, y, 0, [[0, 0], [0, D], [hc, Dch], [hc, 0]], W, { rotZ: 90 });
    var ho = (Ht - hc) * 0.56;
    rb(c, M.INOX, 0, y + hc + ho / 2, Dch / 2, Wch, ho, Dch, 0.005, 1);                          /* a chaminé de baixo... */
    rb(c, M.INOX, 0, y + hc + ho + (Ht - hc - ho) / 2, (Dch - 0.03) / 2, Wch - 0.03, Ht - hc - ho, Dch - 0.03, 0.004, 1);   /* ...e a de cima, telescópica */
    bx(c, M.PRETO, 0, y + hc + ho, Dch / 2 - 0.0, Wch - 0.026, 0.003, Dch - 0.026);             /* a junta da chaminé */
    bx(c, M.GALV, 0, y - 0.0015, D / 2, W - 0.06, 0.003, D - 0.07);
    for (i = -4; i <= 4; i++) bx(c, M.PRETO, i * (W - 0.1) / 9, y - 0.0032, D / 2, 0.0035, 0.001, D - 0.07);
    [-1, 1].forEach(function (s) { c.cil(M.DIF, s * W * 0.3, y - 0.0045, D * 0.5, 0.017, 0.0016, { seg: 14 }); });
    /* a faixa de comando na rampa do capelo: caixa girada para ficar sobre ela (a rampa sobe e recua; a normal para fora aponta para cima e para a frente) */
    var th = Math.atan2(-a, hc) / RAD, thn = Math.atan2(hc, a) / RAD, ny = a / Lg, nz = hc / Lg, cw = Math.min(0.28, W * 0.7);
    function naRampa(u, fora) { return [y + u + ny * fora, D - a * u / hc + nz * fora]; }
    var q0 = naRampa(0.045, 0.0004), q1 = naRampa(0.0555, 0), q2 = naRampa(0.0805, 0.0004);
    c.caixa(M.PRETO, 0, q0[0], q0[1], cw, 0.075, 0.0025, { rotX: th });
    for (i = -1; i <= 1; i++) c.cil(M.CROMO, i * cw * 0.2, q1[0], q1[1], 0.0075, 0.0062, { rotX: thn, seg: 12 });
    c.caixa(M.VERDE, cw * 0.3, q2[0], q2[1], 0.034, 0.012, 0.0035, { rotX: th });
  }

  /* ============================================================ LAVA-LOUÇAS (8 | 14 serviços)
   * p: { W, H, D, y0, acab }. Corpo, faixa de comando (visor + teclas), porta com alça-barra, junta, rodapé recuado (14) ou pés (8, de bancada). */
  function lavaLoucas(c, p) {
    var W = cl(num(p.W, 0.6), 0.3, 1), H = cl(num(p.H, 0.85), 0.3, 1.2), D = cl(num(p.D, 0.6), 0.3, 0.9) - 0.045, y0 = num(p.y0, 0), mat = corpo(p.acab), i;   /* a porta e a alça avançam 45 mm */
    var plinto = H > 0.6 ? 0.08 : 0.012, ct = 0.075, yt = y0 + H;
    if (plinto < 0.03) [-1, 1].forEach(function (sx) { [0.05, D - 0.05].forEach(function (z) { pe(c, sx * (W / 2 - 0.04), z, y0, 0.012, 0.012); }); });
    else bx(c, M.PRETO, 0, y0 + plinto / 2, D / 2 - 0.02, W - 0.03, plinto, D - 0.07);
    rb(c, mat, 0, y0 + plinto + (H - plinto) / 2, D / 2 - 0.01, W, H - plinto, D - 0.02, 0.01, 2);
    rb(c, M.PRETO, 0, yt - ct / 2 - 0.004, D + 0.0014, W - 0.012, ct, 0.006, 0.005, 1);
    display(c, -W * 0.18, yt - ct / 2 - 0.004, D + 0.0044, 0.09, 0.026);
    for (i = 0; i < 6; i++) botao(c, W * 0.02 + i * 0.05, yt - ct / 2 - 0.004, D + 0.0044, 0.0068);
    var hd = H - plinto - ct - 0.012;
    rb(c, mat, 0, y0 + plinto + hd / 2, D + 0.002, W - 0.004, hd, 0.018, 0.008, 2);
    bx(c, M.BORR, 0, yt - ct - 0.0075, D + 0.0012, W - 0.002, 0.003, 0.014);                   /* a junta entre a porta e o painel */
    alcaH(c, M.CROMO, 0, y0 + plinto + hd - 0.04, D + 0.011, W * 0.58, 0.0085, 0.024);
  }

  /* ============================================================ SECADORA | LAVA E SECA (frente)
   * p: { W, H, D, y0, lavaseca }. Corpo branco, faixa de comando (visor, seletor, teclas; a lava e seca leva a gaveta de sabão), escotilha redonda de vidro com anel de
   * cromo, grade de ventilação e pés. A escotilha e a faixa: modelagem. */
  function secadora(c, p) {
    var W = cl(num(p.W, 0.6), 0.3, 1), H = cl(num(p.H, 0.85), 0.3, 1.2), D = cl(num(p.D, 0.65), 0.3, 0.9) - 0.053, y0 = num(p.y0, 0), ls = !!p.lavaseca, i;   /* o vidro da escotilha avança 53 mm */
    var pes = 0.02, cb = 0.11, yt = y0 + H;
    [-1, 1].forEach(function (sx) { [0.05, D - 0.05].forEach(function (z) { pe(c, sx * (W / 2 - 0.04), z, y0, 0.014, pes); }); });
    rb(c, M.BR, 0, y0 + pes + (H - pes) / 2, D / 2, W, H - pes, D, 0.012, 2);
    rb(c, M.PRETO, 0, yt - cb / 2 - 0.006, D + 0.0014, W - 0.02, cb - 0.01, 0.004, 0.006, 1);
    display(c, W * 0.12, yt - cb / 2 - 0.006, D + 0.0034, 0.1, 0.03);
    manopla(c, -W * 0.06, yt - cb / 2 - 0.006, D + 0.002, 0.026);
    for (i = 0; i < 3; i++) botao(c, W * 0.32 + (i % 3) * 0.03 - 0.03, yt - cb / 2 - 0.006, D + 0.0034, 0.0075);
    if (ls) { bx(c, M.CINZA, -W * 0.35, yt - cb / 2 - 0.006, D + 0.0035, 0.1, 0.05, 0.003); bx(c, M.PRETO, -W * 0.35, yt - cb / 2 - 0.006, D + 0.0052, 0.085, 0.0035, 0.001); }
    var R = ls ? 0.215 : 0.2, yc = y0 + pes + (H - pes - cb) * 0.46;
    dz(c, M.PRETO, 0, yc, D + 0.003, R + 0.026, 0.006, 40);                                       /* o aro da porta */
    dz(c, M.CROMO, 0, yc, D + 0.008, R, 0.008, 40);
    dz(c, M.TELA, 0, yc, D + 0.0125, R - 0.032, 0.004, 36);
    c.elipsoide(M.FUME, 0, yc, D + 0.013, R - 0.036, 0.04, R - 0.036, { seg: 28, meia: true, rotX: 90 });
    for (i = 0; i < 5; i++) bx(c, M.PRETO, 0, y0 + pes + 0.03 + i * 0.01, D + 0.0005, W * 0.5, 0.0035, 0.001);   /* a ventilação do pé */
  }

  /* ============================================================ FREEZER (horizontal | vertical)
   * p: { W, H, D, y0, vertical }. Horizontal: caixa com a tampa articulada (alça na frente, dobradiças atrás), seletor de temperatura e LED. Vertical: porta
   * única com a alça vertical, seletor no topo, grade inferior. Pés/rodízios. O desenho do painel e dos pés: modelagem. */
  function freezer(c, p) {
    var W = cl(num(p.W, 1), 0.3, 1.8) - (p.vertical ? 0 : 0.012), H = cl(num(p.H, 0.85), 0.3, 2), D = cl(num(p.D, 0.65), 0.3, 1) - (p.vertical ? 0.043 : 0.0425), y0 = num(p.y0, 0), pes = 0.04, i;   /* a tampa (+6 mm por lado) e as alças avançam: o conjunto fecha na cota do catálogo */
    [-1, 1].forEach(function (sx) { [0.07, D - 0.07].forEach(function (z) { pe(c, sx * (W / 2 - 0.06), z, y0, 0.02, pes); }); });
    if (p.vertical) {
      rb(c, M.BR, 0, y0 + pes + (H - pes) / 2, D / 2, W, H - pes, D, 0.014, 2);
      rb(c, M.BR, 0, y0 + pes + (H - pes - 0.1) / 2 + 0.002, D + 0.004, W - 0.012, H - pes - 0.1, 0.012, 0.008, 2);
      bx(c, M.BORR, 0, y0 + H - 0.13, D + 0.0006, W - 0.006, 0.003, 0.002);
      alcaV(c, M.CROMO, W / 2 - 0.045, y0 + H * 0.6, D + 0.01, H * 0.5, 0.009, 0.024);
      manopla(c, -W / 2 + 0.07, y0 + H - 0.06, D, 0.018); dz(c, M.VERM, W / 2 - 0.07, y0 + H - 0.06, D + 0.0025, 0.005, 0.003, 10);
      for (i = 0; i < 5; i++) bx(c, M.PRETO, 0, y0 + pes + 0.02 + i * 0.01, D + 0.0008, W * 0.7, 0.0035, 0.001);
      return;
    }
    rb(c, M.BR, 0, y0 + pes + (H - pes - 0.06) / 2, D / 2, W, H - pes - 0.06, D, 0.014, 2);        /* a caixa */
    rb(c, M.BR, 0, y0 + H - 0.03, D / 2 + 0.006, W + 0.012, 0.062, D + 0.012, 0.016, 2);                  /* a tampa */
    bx(c, M.BORR, 0, y0 + H - 0.062, D / 2, W + 0.002, 0.003, D + 0.002);                           /* a vedação */
    alcaH(c, M.CROMO, 0, y0 + H - 0.04, D + 0.012, W * 0.3, 0.0105, 0.02);
    [-1, 1].forEach(function (s) { c.cilH(M.CROMO, s * W * 0.32, y0 + H - 0.058, 0.011, 0.011, 0.07, "x", { seg: 10 }); });   /* as dobradiças */
    manopla(c, -W * 0.38, y0 + pes + 0.07, D, 0.02); dz(c, M.VERM, -W * 0.28, y0 + pes + 0.07, D + 0.0025, 0.005, 0.003, 10);
    for (i = 0; i < 4; i++) bx(c, M.PRETO, W * 0.2, y0 + pes + 0.04 + i * 0.01, D + 0.0008, W * 0.34, 0.0035, 0.001);
  }

  /* ============================================================ TORNEIRA ELÉTRICA (de parede)
   * p: { W, H, P, A (centro) }. Flange na parede, corpo do aquecedor (branco), bico de cromo com arejador, seletor de temperatura e LED de funcionamento.
   * Z = 0 na parede. As formas do corpo e do bico: modelagem. */
  function torneiraEletrica(c, p) {
    var A = num(p.A, 1.1), W = cl(num(p.W, 0.11), 0.05, 0.3), H = cl(num(p.H, 0.25), 0.1, 0.6), P = cl(num(p.P, 0.2), 0.08, 0.5);
    var yTop = A + H / 2, yBot = A - H / 2, hb = H * 0.34, yb = yTop - 0.024 - hb / 2 + 0.004, rb2 = 0.0085, zc = (P - 0.016) * 0.58, zb = 0.016 + zc / 2, yh = yb - hb * 0.18, zn = P - rb2 - 0.002;
    dz(c, M.BR, 0, yb, 0.008, W * 0.4, 0.016, 28);                                            /* a flange na parede */
    rb(c, M.BR, 0, yb, zb, W, hb, zc, 0.034, 3);                                              /* o corpo do aquecedor, em cápsula */
    bx(c, M.CINZA, 0, yb, 0.016 + zc + 0.0006, W * 0.46, hb * 0.5, 0.0012);                    /* a plaquinha frontal */
    c.cil(M.CINZA, 0, yb + hb / 2 - 0.004, zb, W * 0.22, 0.024, { seg: 24 });                  /* o seletor de temperatura */
    c.cil(M.PRETO, 0, yTop - 0.0008, zb, W * 0.16, 0.0008, { seg: 20 });
    bx(c, M.PRETO, 0, yTop + 0.0002, zb + W * 0.07, 0.003, 0.0012, W * 0.14);
    dz(c, M.VERM, W * 0.28, yb + 0.006, 0.016 + zc + 0.0016, 0.0042, 0.0016, 10);              /* o LED de funcionamento */
    c.cilH(M.CROMO, 0, yh, (0.016 + zn) / 2, rb2, zn - 0.016, "z", { seg: 14 });               /* o bico: sai do corpo... */
    c.elipsoide(M.CROMO, 0, yh, zn, rb2, rb2, rb2, { seg: 12 });                                /* ...faz o cotovelo... */
    c.cil(M.CROMO, 0, yBot + 0.018, zn, rb2, yh - (yBot + 0.018), { seg: 14 });                /* ...e desce */
    c.cil(M.CINZA, 0, yBot, zn, rb2 + 0.003, 0.018, { seg: 16 });                              /* o arejador */
    c.cil(M.TELA, 0, yBot - 0.0004, zn, rb2, 0.0008, { seg: 14 });
  }

  /* ============================================================ TV DE PAREDE (50")
   * p: { W, H, D, A (centro) }. Suporte na parede, corpo fino com a costela atrás, moldura fina e a tela de vidro; LED na base. Z = 0 na parede. */
  function tv(c, p) {
    var A = num(p.A, 1.3), W = cl(num(p.W, 1.12), 0.4, 2.5), H = cl(num(p.H, 0.65), 0.25, 1.5), D = cl(num(p.D, 0.06), 0.03, 0.2) - 0.0026;   /* o vidro e o LED avançam 2,6 mm */
    var zf = D - 0.032;
    bx(c, M.PRETO, 0, A, 0.0065, W * 0.3, H * 0.34, 0.013);
    bx(c, M.PRETO, 0, A, 0.02, W * 0.12, H * 0.06, 0.012);
    bx(c, M.PRETO, 0, A + H * 0.06, zf - 0.006, W * 0.5, H * 0.52, 0.02);
    rb(c, M.PRETO, 0, A, D - 0.016, W, H, 0.032, 0.006, 2);
    [-1, 1].forEach(function (sx) { bx(c, M.CROMO, sx * (W / 2 - 0.0006), A, D - 0.016, 0.0012, H - 0.02, 0.0322); });    /* o filete de alumínio da lateral */
    [-1, 1].forEach(function (sy) { bx(c, M.CROMO, 0, A + sy * (H / 2 - 0.0006), D - 0.016, W - 0.02, 0.0012, 0.0322); });
    rb(c, M.TELA, 0, A + 0.012, D + 0.0005, W - 0.03, H - 0.054, 0.001, 0.002, 1);              /* o painel (vidro escuro) */
    rb(c, M.FUME, 0, A + 0.012, D + 0.0012, W - 0.03, H - 0.054, 0.0008, 0.002, 1);              /* o vidro frontal, de azulado fumê: separa a tela da moldura */
    bx(c, M.GALV, 0, A - H / 2 + 0.0145, D + 0.0003, W * 0.34, 0.012, 0.0008);                   /* a barra de som sob a tela (grade) */
    for (var gi = -6; gi <= 6; gi++) bx(c, M.PRETO, gi * W * 0.026, A - H / 2 + 0.0145, D + 0.0009, 0.0035, 0.008, 0.0004);
    dz(c, M.DIF, W * 0.4, A - H / 2 + 0.0145, D + 0.0011, 0.0022, 0.0008, 8);                    /* o LED de espera */
  }

  /* ============================================================ MOTOR DE PORTÃO DESLIZANTE (1/2 CV)
   * p: { W, H, D, yb }. Chapa de base com chumbadores, carcaça com tampa, cremalheira que atravessa o motor, fechadura de destravamento e LED. Z = 0 no fundo. */
  function motorPortao(c, p) {
    var W = cl(num(p.W, 0.25), 0.1, 0.6), H = cl(num(p.H, 0.27), 0.1, 0.6), D = cl(num(p.D, 0.18), 0.08, 0.5), yb = num(p.yb, 0), i;
    bx(c, M.GALV, 0, yb + 0.005, D / 2, W, 0.01, D);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.cil(M.CROMO, s[0] * (W / 2 - 0.014), yb + 0.01, D / 2 + s[1] * (D / 2 - 0.014), 0.0075, 0.012, { seg: 6 }); });
    rb(c, M.MBR, 0, yb + 0.022 + (H - 0.022) * 0.36, D / 2, W - 0.04, (H - 0.022) * 0.72, D - 0.04, 0.018, 2);
    rb(c, M.LACAG, 0, yb + 0.022 + (H - 0.022) * 0.86, D / 2, W - 0.04, (H - 0.022) * 0.3, D - 0.04, 0.026, 3);
    bx(c, M.PRETO, 0, yb + 0.022 + (H - 0.022) * 0.71, D / 2, W - 0.036, 0.003, D - 0.036);                 /* a junta entre a base e a tampa */
    for (i = -2; i <= 2; i++) bx(c, M.PRETO, W * 0.08 * i, yb + 0.022 + (H - 0.022) * 0.3, D - 0.0405, 0.012, 0.05, 0.001);   /* as venezianas de ventilação */
    var Lr = W + 0.2, nd = Math.floor(Lr / 0.025);
    bx(c, M.GALV, 0, yb + 0.07, D * 0.55, Lr, 0.012, 0.024);                                  /* a cremalheira passa pelo motor (a do portão: 10 cm de cada lado) */
    for (i = 0; i < nd; i++) bx(c, M.GALV, -Lr / 2 + 0.0125 + i * 0.025, yb + 0.0775, D * 0.55, 0.011, 0.005, 0.024);   /* os dentes */
    c.cil(M.CROMO, W * 0.22, yb + 0.12, D - 0.02 + 0.001, 0.012, 0.004, { rotX: 90, seg: 12 });             /* a fechadura de destravamento */
    dz(c, M.VERDE, -W * 0.28, yb + 0.15, D - 0.02 + 0.001, 0.0038, 0.002, 8);
  }

  var EleFamilias2Geo = { M: M, plafon: plafon, painel: painel, tubular: tubular, emergencia: emergencia, refletor: refletor, balizador: balizador, tartaruga: tartaruga, bocal: bocal,
    spotTrilho: spotTrilho, microondas: microondas, forno: forno, cooktop: cooktop, coifa: coifa, lavaLoucas: lavaLoucas, secadora: secadora, freezer: freezer,
    torneiraEletrica: torneiraEletrica, tv: tv, motorPortao: motorPortao };
  global.EleFamilias2Geo = EleFamilias2Geo;
  if (typeof module !== "undefined" && module.exports) module.exports = EleFamilias2Geo;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

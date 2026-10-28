/* =====================================================================
 * familiasandaime.js — AS 15 FAMÍLIAS `ra-andaime-*` (E7, 27/10/2026)
 *
 * Pedido do Rogério: "todas as famílias paramétricas com bastante qualidade, simulando igualzinho a peça e o
 * material". Cada peça do andaime tubo-roll (tubo, 3 braçadeiras, luva, 2 bases, rodízio, pranchão, rodapé, calço,
 * escada de mão, escada marinheiro, olhal, tela) é uma família do js/familia.js com `geometria: "andaime"`: parâmetros
 * (comprimento, ângulo da giratória, altura de rosca…), tipos, quantitativo e a malha, nos 3 níveis de detalhe.
 *
 * DE ONDE VÊM AS MEDIDAS (⚠ regra da casa "famílias igual ao real"): TODA cota linear sai de js/familiasandaimedados.js,
 * que é GERADO de docs/andaime/familias-cotas.json (cada cota com fonte e página; a estimada fica com grau "e" e está na
 * lista "conferir com a peça real"). Aqui não há milímetro escrito à mão que não seja decisão de FORMA documentada (ângulo
 * de abraço da calha, número de segmentos). Nunca se usou malha ou objeto BIM de fabricante: só as medidas.
 *
 * NÍVEL DE DETALHE (parâmetro de instância `Nivel_detalhe`: alto | medio | baixo — o nível da vista, js/biminstnivel.js):
 *   alto  = a forma inteira (calha dobrada + parafuso em U + porcas sextavadas chanfradas; haste com filete; cinta do pranchão)
 *   medio = a abraçadeira vira anel + bloco; a base, placa + cilindro; madeira em caixa
 *   baixo = o EIXO (linha fina) dos tubos e o PONTO no nó — o que o desenho técnico das pranchas usa
 * A peça é a MESMA nos três (mesmo id, mesma massa, mesmo quantitativo): só a malha muda.
 *
 * ORIGEM E EIXOS (unidades: metro; Y para cima; só giro Y pela instância, como toda família):
 *   tubo/luva/escadas: `Eixo` (x | y | z) diz para onde o tubo aponta; origem no começo do tubo, no eixo.
 *   abraçadeira fixa/giratória: origem no meio da distância entre os eixos dos dois tubos, no ponto onde se cruzam; o tubo 1
 *     (o montante) segue Y; o tubo 2 sai pelo plano XY (fixa: segue X; giratória: `Angulo` a partir de Y); o eixo do pino é Z.
 *     `Montagem` = "horizontal" gira o conjunto 90° em X (os dois tubos horizontais, pino vertical).
 *   base: origem no centro da face de baixo da placa. Rodízio: no piso, sob o eixo do giro.
 *   madeira: origem no piso (face de baixo), no centro, comprimento em X.
 *   escadas: origem no meio da largura, no pé; o plano da escada é XY, o gancho/arco vai para −Z/+Z.
 *   olhal: origem na face da parede; a haste sai em +Z.
 *
 * ⚠ MATERIAL POR PEÇA e COR com fonte: cor das fotos de produto dos catálogos (docs/andaime/FAMILIAS-COTAS.md, campo
 *   `acabamento`); o que não foi medido em foto está dito. A tabela PBR abaixo é a MESMA que entra em FAM_PBR (js/bim.js) —
 *   tools/test-familiasandaime.js confere que as duas são iguais.
 * ⚠ SEM CUBO DE FALLBACK: se um gerador falhar a família devolve erro dito, nunca uma caixa no lugar.
 * ES5, IIFE, sem DOM. Teste: node tools/test-familiasandaime.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var Dados = dep("FamiliasAndaimeDados", "familiasandaimedados.js");
  var RAD = Math.PI / 180, TAU = Math.PI * 2, MM = 0.001;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ MATERIAIS (nomes que o 3D conhece: FAM_PBR do js/bim.js)
     cor: sRGB 0xRRGGBB · rug: rugosidade · met: metalicidade · cc/ccr: verniz · op: opacidade.
     FONTE DA COR (cada uma dita; hex lido/estimado da foto de produto, não medido com colorímetro):
       aço galvanizado         #AAB0B4 = APAR.aco_galvanizado do js/biminstgeo.js (cinza prata fosco da foto do tubo, catálogo S01 p5)
       aço zincado bicromatizado #C9A227 = porca/arruela dourado-amarelada da foto S01 p12 (passivação amarela, cor iridescente "pode variar")
       aço grafite             #5A5D61 = cinza-grafite metálico da calha (revisão 27/10: #1E1E1E e #3B3D40 saíam quase pretos na luz do app); a foto S01 p12-13 mostra o corpo oxidado escuro
       aço preto oxidado       #1E1E1E = a opção "oxidado" (corpo preto fosco da foto), parâmetro Material_corpo
       madeira pinus           #D9964A = pranchão laranja-mel da foto S01 p7 (o pinus claro #E3C28A seria outra cor: vale a foto)
       madeira eucalipto       #B07A4A = estimada (marrom-avermelhada, mais escura que o pinus; sem foto de fabricante)
       borracha                #1A1A1A = banda preta (ESPEC 7.1); a laranja da foto S01 p15 é poliuretano (opção)
       tela pe                 #5B8C3A verde / #F08A24 laranja (tipo tapume) = cores listadas pelo fabricante da tela (S17), hex estimado */
  var PBR = {
    "aço galvanizado": { cor: 0xaab0b4, rug: 0.45, met: 0.85 },
    "aço zincado bicromatizado": { cor: 0xc9a227, rug: 0.38, met: 0.85, cc: 0.3, ccr: 0.2 },
    "aço preto oxidado": { cor: 0x1e1e1e, rug: 0.55, met: 0.6 },   /* opção "oxidado" (a cor da 1ª versão) */
    "aço grafite": { cor: 0x5a5d61, rug: 0.5, met: 0.6 },
    "madeira pinus": { cor: 0xd9964a, rug: 0.7, met: 0 },
    "madeira eucalipto": { cor: 0xb07a4a, rug: 0.7, met: 0 },
    "borracha": { cor: 0x1a1a1a, rug: 0.9, met: 0 },
    "tela pe": { cor: 0x5b8c3a, rug: 0.8, met: 0, op: 0.55 },
    "tela pe laranja": { cor: 0xf08a24, rug: 0.8, met: 0, op: 0.55 }
  };
  var MAT = { GALV: "aço galvanizado", BICROM: "aço zincado bicromatizado", PRETO: "aço preto oxidado", GRAFITE: "aço grafite", PINUS: "madeira pinus", EUC: "madeira eucalipto", BORRACHA: "borracha", TELA: "tela pe", TELA_LARANJA: "tela pe laranja" };

  /* ------------------------------------------------ COTAS (todas dos dados gerados do JSON) */
  function cota(fam, nome) {
    var p = Dados && Dados.pecas && Dados.pecas[fam], c = p && p.cotas && p.cotas[nome];
    if (!c) throw new Error("a cota \"" + nome + "\" de " + fam + " não existe em js/familiasandaimedados.js — rode node tools/gerar-familiasandaime-dados.js");
    return c.v;
  }
  function mm(fam, nome) { return cota(fam, nome) * MM; }

  /* ------------------------------------------------ MATRIZES 3 × 3 (linha por linha) */
  var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rotM(eixo, g) {
    var c = Math.cos(g * RAD), s = Math.sin(g * RAD);
    if (eixo === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
    if (eixo === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }
  function mulM(a, b) {
    var o = [], i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) o.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
    return o;
  }
  function aplM(R, p) { return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]; }
  /* a matriz que leva X, Y, Z da peça para os vetores dados (colunas) */
  function colsM(X, Y, Z) { return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }

  /* ------------------------------------------------ O KIT: pilha de transformações + emissão na cena do js/mobgeo.js
     ⚠ Por que não usar `c.grupo/c.prisma` do Mob: ele só gira em Y. A abraçadeira precisa de um tubo vertical e outro
     horizontal na MESMA peça (rotações em X e Z). O kit aplica a transformação nos vértices e entrega a malha pronta a
     `c._add` (que fecha o sentido das faces pelo volume e guarda caixa, volume e triângulos por material). */
  function Kit(c) { this.c = c; this.R = I3; this.t = [0, 0, 0]; }
  /* com(t, rots, fn): move para t e gira pelas rotações [eixo, graus] (a 1ª é aplicada primeiro) ou pela matriz R (rots = array de 9) */
  Kit.prototype.com = function (t, rots, fn) {
    var L = I3, i, R0 = this.R, t0 = this.t;
    if (rots && rots.length === 9 && typeof rots[0] === "number") L = rots;
    else (rots || []).forEach(function (r) { L = mulM(rotM(r[0], r[1]), L); });
    var d = aplM(R0, t || [0, 0, 0]);
    this.t = [t0[0] + d[0], t0[1] + d[1], t0[2] + d[2]]; this.R = mulM(R0, L);
    try { fn(this); } finally { this.R = R0; this.t = t0; }
    return this;
  };
  Kit.prototype.add = function (mat, m, opc) {
    if (!m || !m.v.length || !m.f.length) return this;
    var R = this.R, t = this.t, w = new Array(m.v.length), i;
    for (i = 0; i + 2 < m.v.length; i += 3) {
      var x = m.v[i], y = m.v[i + 1], z = m.v[i + 2];
      w[i] = R[0] * x + R[1] * y + R[2] * z + t[0]; w[i + 1] = R[3] * x + R[4] * y + R[5] * z + t[1]; w[i + 2] = R[6] * x + R[7] * y + R[8] * z + t[2];
    }
    this.c._add(mat, w, m.f, opc || {});
    return this;
  };

  /* ------------------------------------------------ PRIMITIVAS (listas puras {v, f}; eixo da peça = Y)
     Lado liso (calha, cilindro, haste) com vértices compartilhados para a luz suavizar; aresta viva com vértice próprio. */
  function tri(v, f, i0, i1, i2, w) {
    var a = i0 * 3, b = i1 * 3, c = i2 * 3;
    var ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * w[0] + ny * w[1] + nz * w[2] >= 0) f.push(i0, i1, i2); else f.push(i0, i2, i1);
  }
  function caixa(x0, y0, z0, dx, dy, dz) {   /* canto mínimo + dimensões; 6 faces com vértice próprio (aresta viva) */
    var v = [], f = [], X = [x0, x0 + dx], Y = [y0, y0 + dy], Z = [z0, z0 + dz];
    function face(p, w) { var i = v.length / 3; p.forEach(function (q) { v.push(q[0], q[1], q[2]); }); tri(v, f, i, i + 1, i + 2, w); tri(v, f, i, i + 2, i + 3, w); }
    face([[X[0], Y[0], Z[0]], [X[1], Y[0], Z[0]], [X[1], Y[1], Z[0]], [X[0], Y[1], Z[0]]], [0, 0, -1]);
    face([[X[0], Y[0], Z[1]], [X[1], Y[0], Z[1]], [X[1], Y[1], Z[1]], [X[0], Y[1], Z[1]]], [0, 0, 1]);
    face([[X[0], Y[0], Z[0]], [X[0], Y[0], Z[1]], [X[0], Y[1], Z[1]], [X[0], Y[1], Z[0]]], [-1, 0, 0]);
    face([[X[1], Y[0], Z[0]], [X[1], Y[0], Z[1]], [X[1], Y[1], Z[1]], [X[1], Y[1], Z[0]]], [1, 0, 0]);
    face([[X[0], Y[0], Z[0]], [X[1], Y[0], Z[0]], [X[1], Y[0], Z[1]], [X[0], Y[0], Z[1]]], [0, -1, 0]);
    face([[X[0], Y[1], Z[0]], [X[1], Y[1], Z[0]], [X[1], Y[1], Z[1]], [X[0], Y[1], Z[1]]], [0, 1, 0]);
    return { v: v, f: f };
  }
  function cilindro(r, h, seg, r2, y0) {   /* eixo Y de y0 a y0+h; r2 = cone; lado liso, tampas com vértice próprio */
    seg = Math.max(6, seg | 0); y0 = y0 || 0; if (r2 == null) r2 = r;
    var v = [], f = [], j, a;
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * r, y0, Math.sin(a) * r); }
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * r2, y0 + h, Math.sin(a) * r2); }
    for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg; f.push(j, seg + j, seg + j2, j, seg + j2, j2); }
    var cb = v.length / 3; v.push(0, y0, 0); for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * r, y0, Math.sin(a) * r); }
    for (j = 0; j < seg; j++) f.push(cb, cb + 1 + j, cb + 1 + (j + 1) % seg);
    if (r2 > 0) {
      var ct = v.length / 3; v.push(0, y0 + h, 0); for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * r2, y0 + h, Math.sin(a) * r2); }
      for (j = 0; j < seg; j++) f.push(ct, ct + 1 + (j + 1) % seg, ct + 1 + j);
    }
    return { v: v, f: f };
  }
  function tuboOco(ro, ri, h, seg, y0) {   /* tubo VAZADO: boca visível nas duas pontas (anel de ri a ro) */
    seg = Math.max(6, seg | 0); y0 = y0 || 0;
    var v = [], f = [], j, a;
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * ro, y0, Math.sin(a) * ro); }          /* 0: fora embaixo */
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * ro, y0 + h, Math.sin(a) * ro); }      /* seg: fora em cima */
    for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg; f.push(j, seg + j, seg + j2, j, seg + j2, j2); }
    var b = v.length / 3;
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * ri, y0, Math.sin(a) * ri); }          /* dentro embaixo */
    for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * ri, y0 + h, Math.sin(a) * ri); }      /* dentro em cima */
    for (j = 0; j < seg; j++) { var k2 = (j + 1) % seg; f.push(b + j, b + seg + k2, b + seg + j, b + j, b + k2, b + seg + k2); }   /* normal para dentro */
    [[y0, -1], [y0 + h, 1]].forEach(function (cp) {   /* coroa da boca, vértice próprio (aresta viva) */
      var c0 = v.length / 3;
      for (j = 0; j < seg; j++) { a = TAU * j / seg; v.push(Math.cos(a) * ro, cp[0], Math.sin(a) * ro, Math.cos(a) * ri, cp[0], Math.sin(a) * ri); }
      for (j = 0; j < seg; j++) { var m2 = (j + 1) % seg; tri(v, f, c0 + j * 2, c0 + j * 2 + 1, c0 + m2 * 2 + 1, [0, cp[1], 0]); tri(v, f, c0 + j * 2, c0 + m2 * 2 + 1, c0 + m2 * 2, [0, cp[1], 0]); }
    });
    return { v: v, f: f };
  }
  /* setor anular: calha/anel dobrado de rin a rout, de a0 a a1 (graus; φ=0 em +Z, cresce para +X), altura h em Y (centrado se centro) */
  function setor(rin, rout, a0, a1, h, n, centro) {
    n = Math.max(2, n | 0); var y0 = centro ? -h / 2 : 0, v = [], f = [], i, ang = [];
    for (i = 0; i <= n; i++) ang.push((a0 + (a1 - a0) * i / n) * RAD);
    function pt(r, y, a) { return [Math.sin(a) * r, y, Math.cos(a) * r]; }
    var base = 0;
    [[rout, 1], [rin, -1]].forEach(function (rs) {   /* superfícies lisas (fora e dentro): vértices compartilhados */
      var b = v.length / 3;
      for (i = 0; i <= n; i++) { var p0 = pt(rs[0], y0, ang[i]), p1 = pt(rs[0], y0 + h, ang[i]); v.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]); }
      for (i = 0; i < n; i++) {
        var q = b + i * 2, mid = (ang[i] + ang[i + 1]) / 2, w = [Math.sin(mid) * rs[1], 0, Math.cos(mid) * rs[1]];
        tri(v, f, q, q + 1, q + 3, w); tri(v, f, q, q + 3, q + 2, w);
      }
      base = b;
    });
    [[y0, -1], [y0 + h, 1]].forEach(function (ys) {   /* faces de cima e de baixo (planas) */
      var b = v.length / 3;
      for (i = 0; i <= n; i++) { var po = pt(rout, ys[0], ang[i]), pi2 = pt(rin, ys[0], ang[i]); v.push(po[0], po[1], po[2], pi2[0], pi2[1], pi2[2]); }
      for (i = 0; i < n; i++) { tri(v, f, b + i * 2, b + i * 2 + 1, b + i * 2 + 3, [0, ys[1], 0]); tri(v, f, b + i * 2, b + i * 2 + 3, b + i * 2 + 2, [0, ys[1], 0]); }
    });
    [0, n].forEach(function (ie) {   /* as duas pontas */
      var b = v.length / 3, po = pt(rout, y0, ang[ie]), po2 = pt(rout, y0 + h, ang[ie]), pi2 = pt(rin, y0, ang[ie]), pi3 = pt(rin, y0 + h, ang[ie]);
      v.push(po[0], po[1], po[2], po2[0], po2[1], po2[2], pi3[0], pi3[1], pi3[2], pi2[0], pi2[1], pi2[2]);
      var tg = ie === 0 ? -1 : 1, w = [Math.cos(ang[ie]) * tg, 0, -Math.sin(ang[ie]) * tg];
      tri(v, f, b, b + 1, b + 2, w); tri(v, f, b, b + 2, b + 3, w);
    });
    return { v: v, f: f };
  }
  /* prisma de contorno CONVEXO [[x,z]…] de y0 a y0+h (lados e tampas com vértice próprio) */
  function prismaConvexo(c, h, y0) {
    y0 = y0 || 0; var v = [], f = [], n = c.length, i, cx = 0, cz = 0;
    c.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    [[y0, -1], [y0 + h, 1]].forEach(function (ys) {
      var b = v.length / 3; for (i = 0; i < n; i++) v.push(c[i][0], ys[0], c[i][1]);
      for (i = 1; i + 1 < n; i++) tri(v, f, b, b + i, b + i + 1, [0, ys[1], 0]);
    });
    for (i = 0; i < n; i++) {
      var a = c[i], bq = c[(i + 1) % n], k = v.length / 3, mx = (a[0] + bq[0]) / 2 - cx, mz = (a[1] + bq[1]) / 2 - cz;
      v.push(a[0], y0, a[1], bq[0], y0, bq[1], bq[0], y0 + h, bq[1], a[0], y0 + h, a[1]);
      tri(v, f, k, k + 1, k + 2, [mx, 0, mz]); tri(v, f, k, k + 2, k + 3, [mx, 0, mz]);
    }
    return { v: v, f: f };
  }
  function retArredondado(larg, prof, r, n) {   /* contorno convexo (x, z) com cantos arredondados, em volta de (0,0) */
    var out = [], a = larg / 2, b = prof / 2, cs = [[a - r, b - r, 0], [-a + r, b - r, 90], [-a + r, -b + r, 180], [a - r, -b + r, 270]], k, j;
    for (k = 0; k < 4; k++) for (j = 0; j <= n; j++) { var t = (cs[k][2] + 90 * j / n) * RAD; out.push([cs[k][0] + Math.cos(t) * r, cs[k][1] + Math.sin(t) * r]); }
    return out;
  }
  /* porca sextavada (chave AF, altura h; eixo Y, y de 0 a h) com chanfro de 30° nas duas faces — a coroa redonda de arruela */
  function porca(AF, h, chanfro) {
    var Rc = AF / Math.sqrt(3), Rf = AF / 2, cz = chanfro == null ? h * 0.18 : chanfro, v = [], f = [], i;
    /* pontos do contorno do sextavado em ordem: canto0, meio da face0-1, canto1, meio… (o meio da face fica em 60i+60 graus) */
    var cont = [];
    for (i = 0; i < 6; i++) {
      var ca = (60 * i + 30) * RAD, cb = (60 * (i + 1) + 30) * RAD;
      cont.push([Math.cos(ca) * Rc, Math.sin(ca) * Rc]);
      cont.push([Math.cos((ca + cb) / 2) * Rf, Math.sin((ca + cb) / 2) * Rf]);
    }
    var N = cont.length;   /* 12 */
    function ring(y, esc, circ) { var b = v.length / 3; for (i = 0; i < N; i++) { var q = cont[i]; if (circ) { var rr = Rf * 0.96, nn = Math.sqrt(q[0] * q[0] + q[1] * q[1]); v.push(q[0] / nn * rr, y, q[1] / nn * rr); } else v.push(q[0] * esc, y, q[1] * esc); } return b; }
    var yb = ring(0, 1, true), yc = ring(cz, 1, false), yd = ring(h - cz, 1, false), yt = ring(h, 1, true);
    function banda(a, b, w) {   /* faixa entre dois anéis, uma face por segmento (vértice próprio = aresta viva) */
      for (i = 0; i < N; i++) {
        var j = (i + 1) % N, k = v.length / 3;
        [a, b].forEach(function (rg) { var pa = (rg + i) * 3, pb = (rg + j) * 3; v.push(v[pa], v[pa + 1], v[pa + 2], v[pb], v[pb + 1], v[pb + 2]); });
        var ang = (i * 30 + 45) * RAD;   /* meio do segmento */
        var nm = w === "lado" ? [Math.cos(ang), 0, Math.sin(ang)] : [Math.cos(ang), w === "baixo" ? -0.7 : 0.7, Math.sin(ang)];
        tri(v, f, k, k + 1, k + 3, nm); tri(v, f, k, k + 3, k + 2, nm);
      }
    }
    banda(yb, yc, "baixo"); banda(yc, yd, "lado"); banda(yd, yt, "cima");
    [[yb, -1], [yt, 1]].forEach(function (cp) {   /* tampas redondas */
      var b = v.length / 3; v.push(0, cp[0] === yb ? 0 : h, 0);
      for (i = 0; i < N; i++) { var p = (cp[0] + i) * 3; v.push(v[p], v[p + 1], v[p + 2]); }
      for (i = 0; i < N; i++) tri(v, f, b, b + 1 + i, b + 1 + (i + 1) % N, [0, cp[1], 0]);
    });
    return { v: v, f: f };
  }
  /* varredura: círculo de raio r (seg lados) ao longo de uma poligonal 3D (parafuso em U, gancho, olhal) com quadro sem torção */
  function varrer(path, r, seg, tampas) {
    seg = Math.max(4, seg | 0); var n = path.length, v = [], f = [], i, j;
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function nrm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function crs(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    var T = [];
    for (i = 0; i < n; i++) {
      var d0 = i > 0 ? nrm(sub(path[i], path[i - 1])) : null, d1 = i < n - 1 ? nrm(sub(path[i + 1], path[i])) : null;
      T.push(nrm(d0 && d1 ? [d0[0] + d1[0], d0[1] + d1[1], d0[2] + d1[2]] : (d0 || d1)));
    }
    var N0 = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; N0 = nrm(crs(T[0], crs(N0, T[0])));
    var Ns = [N0];
    for (i = 1; i < n; i++) { var Np = Ns[i - 1], k = dot(Np, T[i]); Ns.push(nrm([Np[0] - k * T[i][0], Np[1] - k * T[i][1], Np[2] - k * T[i][2]])); }
    for (i = 0; i < n; i++) {
      var Bn = crs(T[i], Ns[i]);
      for (j = 0; j < seg; j++) { var a = TAU * j / seg, cs = Math.cos(a) * r, sn = Math.sin(a) * r; v.push(path[i][0] + Ns[i][0] * cs + Bn[0] * sn, path[i][1] + Ns[i][1] * cs + Bn[1] * sn, path[i][2] + Ns[i][2] * cs + Bn[2] * sn); }
    }
    for (i = 0; i + 1 < n; i++) for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg, a0 = i * seg + j, a1 = i * seg + j2, b0 = (i + 1) * seg + j, b1 = (i + 1) * seg + j2; f.push(a0, b0, b1, a0, b1, a1); }
    if (tampas !== false) [[0, -1], [n - 1, 1]].forEach(function (cp) {
      var c0 = v.length / 3, p = path[cp[0]]; v.push(p[0], p[1], p[2]);
      for (j = 0; j < seg; j++) { var q = (cp[0] * seg + j) * 3; v.push(v[q], v[q + 1], v[q + 2]); }
      for (j = 0; j < seg; j++) tri(v, f, c0, c0 + 1 + j, c0 + 1 + (j + 1) % seg, [T[cp[0]][0] * cp[1], T[cp[0]][1] * cp[1], T[cp[0]][2] * cp[1]]);
    });
    return { v: v, f: f };
  }
  function densificar(path, passo) {   /* um ponto a cada `passo` m nos trechos retos (o resto da poligonal já é fina) */
    var out = [path[0]], i, j;
    for (i = 1; i < path.length; i++) {
      var a = path[i - 1], b = path[i], d = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2)), n = Math.ceil(d / passo);
      for (j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n, a[2] + (b[2] - a[2]) * j / n]);
    }
    return out;
  }
  function toroY(R, r, segR, segr) {   /* anel em volta de Y (no plano XZ), centro na origem */
    var path = [], i; for (i = 0; i <= segR; i++) { var a = TAU * i / segR; path.push([Math.cos(a) * R, 0, Math.sin(a) * R]); }
    var m = varrer(path, r, segr, false), seg = Math.max(4, segr | 0), j;
    /* fecha o laço: o último anel coincide com o primeiro — junta os vértices por faces extras */
    for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg, a0 = (segR - 1) * seg + j, a1 = (segR - 1) * seg + j2; m.f.push(a0, j, j2, a0, j2, a1); }
    return m;
  }
  function torno(perfil, seg) {   /* sólido de revolução em Y; perfil [[raio, y]…] de baixo para cima; as pontas fecham */
    seg = Math.max(6, seg | 0); var v = [], f = [], n = perfil.length, i, j;
    for (i = 0; i < n; i++) for (j = 0; j < seg; j++) { var a = TAU * j / seg; v.push(Math.cos(a) * perfil[i][0], perfil[i][1], Math.sin(a) * perfil[i][0]); }
    for (i = 0; i + 1 < n; i++) for (j = 0; j < seg; j++) { var j2 = (j + 1) % seg, a0 = i * seg + j, a1 = i * seg + j2, b0 = (i + 1) * seg + j, b1 = (i + 1) * seg + j2; f.push(a0, b0, b1, a0, b1, a1); }
    [[0, -1], [n - 1, 1]].forEach(function (cp) {
      if (!(perfil[cp[0]][0] > 1e-9)) return;
      var c0 = v.length / 3; v.push(0, perfil[cp[0]][1], 0);
      for (j = 0; j < seg; j++) { var q = (cp[0] * seg + j) * 3; v.push(v[q], v[q + 1], v[q + 2]); }
      for (j = 0; j < seg; j++) tri(v, f, c0, c0 + 1 + j, c0 + 1 + (j + 1) % seg, [0, cp[1], 0]);
    });
    return { v: v, f: f };
  }
  function linhaFina(a, b, r) {   /* o "eixo" do nível Baixo: prisma de 4 lados, fechado */
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    return varrer([a, b], r, 4, true);
  }
  function octaedro(r) {   /* o "ponto no nó" do nível Baixo */
    var v = [r, 0, 0, -r, 0, 0, 0, r, 0, 0, -r, 0, 0, 0, r, 0, 0, -r], f = [];
    [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]].forEach(function (t) {
      var k = v.length / 3; t.forEach(function (i) { v.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); });
      var c = [(v[k * 3] + v[k * 3 + 3] + v[k * 3 + 6]) / 3, (v[k * 3 + 1] + v[k * 3 + 4] + v[k * 3 + 7]) / 3, (v[k * 3 + 2] + v[k * 3 + 5] + v[k * 3 + 8]) / 3];
      tri(v, f, k, k + 1, k + 2, c);
    });
    return { v: v, f: f };
  }

  /* ------------------------------------------------ NÍVEL */
  function nivelDe(v) { var n = String((v && v.Nivel_detalhe) || "alto").toLowerCase().replace("é", "e"); return n === "baixo" ? "baixo" : (n === "medio" ? "medio" : "alto"); }
  function segs(nivel, alto, medio) { return nivel === "alto" ? alto : medio; }
  var LIN_R = 0.0025;   /* meia espessura da linha do nível Baixo (5 mm no mundo: legível a 1:50 e barato — 8 triângulos) */

  /* ------------------------------------------------ GERADORES POR FAMÍLIA
     Cada um recebe (k, v): o kit e os valores dos parâmetros (já em metros/graus/texto). */
  var GER = {}, SIMB = {}, MASSA = {};

  /* o EIXO do tubo (x | y | z) como rotação do tubo desenhado em Y */
  function rotEixo(eixo) { return eixo === "x" ? [["z", -90]] : (eixo === "z" ? [["x", 90]] : []); }
  function dirEixo(eixo, L) { return eixo === "x" ? [L, 0, 0] : (eixo === "z" ? [0, 0, L] : [0, L, 0]); }

  /* ---- 1. TUBO 48,3 × 3,0 vazado ---- */
  var FT = "ra-andaime-tubo";
  GER[FT] = function (k, v) {
    var Ro = mm(FT, "diametroExterno") / 2, Ri = mm(FT, "diametroInterno") / 2, L = Math.max(0.05, v.Comprimento), nv = nivelDe(v);
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([0, 0, 0], dirEixo(v.Eixo, L), LIN_R)); return; }
    k.com([0, 0, 0], rotEixo(v.Eixo), function () { k.add(v.Material, tuboOco(Ro, Ri, L, segs(nv, 36, 16), 0)); });
  };
  SIMB[FT] = function (v) {
    var Ro = mm(FT, "diametroExterno") / 2, Ri = mm(FT, "diametroInterno") / 2, L = v.Comprimento, o = [];
    if (v.Eixo === "y") { circ(o, 0, 0, Ro, 24); circ(o, 0, 0, Ri, 20); return { linhas: o }; }
    var a = v.Eixo === "x" ? [[0, -Ro, L, -Ro], [0, Ro, L, Ro], [0, -Ro, 0, Ro], [L, -Ro, L, Ro]] : [[-Ro, 0, -Ro, L], [Ro, 0, Ro, L], [-Ro, 0, Ro, 0], [-Ro, L, Ro, L]];
    return { linhas: o.concat.apply(o, a) };
  };

  /* símbolos de planta: segmentos [x1, z1, x2, z2, …] LOCAIS (o js/familiasmob.js linhasPlanta entrega `linhas` como estão) */
  function circ(o, x, z, r, n) { for (var i = 0; i < n; i++) { var a = TAU * i / n, b = TAU * (i + 1) / n; o.push(x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(b) * r, z + Math.sin(b) * r); } }
  function ret(o, x0, z0, x1, z1) { o.push(x0, z0, x1, z0, x1, z0, x1, z1, x1, z1, x0, z1, x0, z1, x0, z0); }
  function hachura(o, x0, z0, x1, z1, passo) {   /* hachura a 45° dentro do retângulo (madeira em corte/planta: nada embolado) */
    var w = x1 - x0, h = z1 - z0, c;
    for (c = passo; c < w + h; c += passo) {
      var xa = Math.max(0, c - h), xb = Math.min(w, c);
      if (xb - xa > 1e-4) o.push(x0 + xa, z0 + (c - xa), x0 + xb, z0 + (c - xb));
    }
  }

  /* ---- a calha + parafuso em U de UM tubo (as 3 abraçadeiras reaproveitam) ----
     Quadro local do tubo: eixo do tubo = Y, a calha fica do lado +Z (o lado da outra peça), o U do lado −Z, as pernas do U
     sobem em +Z atravessando as orelhas da calha, a porca fecha por fora. */
  function grampoTubo(k, F, nv, o) {
    /* REVISÃO R1 (27/10/2026, fotos da apostila págs. 11, 28, 58, 62): a calha é uma FITA DE AÇO MOLA CURVADA em 180° (raio interno = o do tubo + folga) que termina em
       duas ABAS dobradas para fora (planas, ⟂ ao eixo do parafuso), cada uma com furo/rasgo. O parafuso-gancho (barra Ø14) abraça o lado LIVRE do tubo: uma perna RETA
       e ROSCADA atravessa o furo de uma aba e sai acima da arruela + porca; a curva contorna o tubo colada nele; a outra ponta é um GANCHO preso no rasgo da outra aba.
       ⚠ A perna roscada sai ~15 mm acima da porca na peça real; aqui é limitada pela distância entre os eixos (54 mm na fixa): a perna do tubo 1 não pode entrar no tubo 2
       (aviso de colisão: o teste mede a folga). */
    var R0 = o.rin, t = o.chapa, Ro = R0 + t, w = o.larg, hU = o.hastU, Rb = o.uInt / 2 + hU / 2;   /* Rb: raio da linha de centro da barra colada no lado livre do tubo */
    var bx = 0.02415 + 0.025;   /* a ABA vai no máximo 25 mm além da face do tubo (revisão 27/10; foto da apostila pág. 62), com cantos de 3 mm */
    var Ru = (R0 + bx) / 2;      /* ⚠ onde a perna reta passa na aba: no meio dela (a perna sai da curva e abre até aqui); a arruela cabe na aba (raio limitado abaixo) */
    var rW = Math.min(o.arruelaD / 2, bx - Ru - 0.0005);
    var az = 0.0025, hN = o.porcaAltura, AF = o.porcaChave, corpo = o.matCorpo, par = o.matParaf;
    var zF = t;                                   /* topo da aba (a aba vai de 0 a t em Z) */
    var zNut0 = zF + az, zNut1 = zNut0 + hN;
    var folgaOutro = o.dEixos - 0.02415 - 0.0004;  /* até onde a perna pode subir sem tocar o outro tubo */
    var sobra = Math.max(0.004, Math.min(0.015, folgaOutro - zNut1));
    var zEnd = zNut1 + sobra;
    if (nv === "alto") {
      k.add(corpo, setor(R0, Ro, -90, 90, w, 20, true));                                   /* a calha: fita curvada em 180° */
      [-1, 1].forEach(function (s) { k.com([s * (R0 + bx) / 2, 0, 0], [["x", 90]], function () { k.add(corpo, prismaConvexo(retArredondado(bx - R0, w, 0.003, 4), t, 0)); }); });   /* as duas abas, dobradas para fora, com cantos de 3 mm e furo/rasgo (a perna passa por ele) */
      /* a perna ROSCADA (lado +X) e o gancho (lado −X) */
      var path = [[Ru, 0, zNut1 + 0.001], [Ru, 0, -0.004]], i, nA = 24, a1 = -50 * RAD, ex = Math.cos(a1) * Rb, ez = Math.sin(a1) * Rb, c1 = [Ru, -0.004 - 0.016], c2 = [ex + 0.016 * 0.766, ez + 0.016 * 0.643];
      function bez(t) { var u = 1 - t; return [u * u * u * Ru + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex, u * u * u * -0.004 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ez]; }
      for (i = 1; i <= 14; i++) { var q = bez(i / 14); path.push([q[0], 0, q[1]]); }                                   /* sai da perna e encosta no tubo */
      for (i = 1; i < nA; i++) { var th = -50 * RAD - 80 * RAD * i / nA; path.push([Math.cos(th) * Rb, 0, Math.sin(th) * Rb]); }   /* a curva, colada no lado livre do tubo */
      for (i = 14; i >= 0; i--) { var q2 = bez(i / 14); path.push([-q2[0], 0, q2[1]]); }                                /* e volta para a outra perna */
      path.push([-Ru, 0, 0], [-Ru, 0, zF + 0.006]);
      var rc = 0.009, zc = zF + 0.006;   /* o gancho: sobe um pouco acima da aba e se curva para fora sobre o rasgo */
      for (i = 1; i <= 8; i++) { var ag = Math.PI * 0.85 * i / 8; path.push([-Ru - rc + Math.cos(ag) * rc, 0, zc + Math.sin(ag) * rc]); }
      k.add(par, varrer(densificar(path, 0.003), hU / 2, 24, true));   /* seção de 24 lados e um ponto a cada 3 mm: curva lisa, sem facetas */
      k.com([Ru, 0, zF], [["x", 90]], function () { k.add(par, cilindro(rW, az, 20)); });          /* arruela (Ø28 da cota, limitada à largura da aba) */
      k.com([Ru, 0, zNut0], [["y", 30], ["x", 90]], function () { k.add(par, porca(AF, hN)); });
      /* a ponta ROSCADA acima da porca: dente de serra no passo de 2 mm (M14) */
      var rr = hU / 2, p2 = 0.002, perf = [[rr * 0.88, 0]], y = 0, nd = Math.max(1, Math.floor((zEnd - zNut1) / p2));
      for (i = 0; i < nd; i++) { perf.push([rr, y + p2 * 0.25], [rr * 0.88, y + p2 * 0.5]); y += p2 * 0.5; perf.push([rr, y + p2 * 0.25], [rr * 0.88, y + p2 * 0.5]); y += p2 * 0.5; }
      perf.push([rr * 0.88, y]);
      k.com([Ru, 0, zNut1], [["x", 90]], function () { k.add(par, torno(perf, 10)); });
    } else {   /* médio: anel + bloco */
      k.add(corpo, setor(R0, Ro, -90, 90, w, 8, true));
      k.add(par, setor(R0, R0 + hU, 90, 270, hU, 8, true));
      [-1, 1].forEach(function (s) { k.add(corpo, caixa(s > 0 ? R0 : -bx, -w / 2, 0, bx - R0, w, t)); });
      k.add(par, caixa(Ru - AF / 2, -AF / 2, zF, AF, AF, zEnd - zF));
      k.add(par, caixa(-Ru - hU / 2, -hU / 2, zF, hU, hU, 0.012));
    }
  }
  /* o corpo central ÚNICO da fixa: pequena placa (solda/rebite) entre as costas das duas calhas */
  /* quadro dos dois tubos de uma abraçadeira: tubo 1 (montante) segue Y em z = −d/2; tubo 2 em z = +d/2 */
  function tubo2Quadro(ang) { var a = ang * RAD; return colsM([-Math.cos(a), Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, -1]); }

  function abracadeira(k, F, v, giratoria) {
    var nv = nivelDe(v), d = mm(F, giratoria ? "distanciaEixosTubos_forjada" : "distanciaEixosTubos"), w = mm(F, giratoria ? "larguraAoLongoDoTubo_forjada" : "larguraCalhaAoLongoDoTubo_forjada");
    var o = { rin: mm(F, "raioInternoCalhaParaModelar"), chapa: mm(F, "espessuraChapaCorpo"), larg: w, hastU: mm(F, "hasteUDiametro"), uInt: mm(F, "uLarguraInterna"),
              porcaChave: mm(F, "porcaChave"), porcaAltura: mm(F, "porcaAltura"), arruelaD: mm(F, "arruelaDiametroExterno"), matCorpo: v.Material_corpo, matParaf: v.Material_parafuso, dEixos: d };
    var ang = giratoria ? clamp(v.Angulo, 0, 360) : 90;
    k.com([0, 0, 0], v.Montagem === "horizontal" ? [["x", 90]] : [], function () {
      if (nv === "baixo") {
        k.add(MAT.BICROM, octaedro(0.012));
        return;
      }
      k.com([0, 0, -d / 2], [], function () { grampoTubo(k, F, nv, o); });
      k.com([0, 0, d / 2], tubo2Quadro(ang), function () { grampoTubo(k, F, nv, o); });
      if (!giratoria) k.add(o.matCorpo, caixa(-0.023, -0.023, -0.0015, 0.046, 0.046, 0.003));   /* o corpo central único: a pequena placa (solda/rebite) entre as costas das duas calhas, a 90° */
      if (giratoria) {   /* as duas chapas de ligação (discos) que giram no pino central: saem das costas das duas calhas */
        var Ro = o.rin + o.chapa, zc = d / 2 - Ro, rd = mm(F, "pinoCentralDiametro") * 1.75;   /* disco do pivô Ø56: aparece além da calha de 38 mm */
        k.com([0, 0, -zc], [["x", 90]], function () { k.add(o.matCorpo, cilindro(rd, zc, segs(nv, 28, 14))); });
        k.com([0, 0, 0], [["x", 90]], function () { k.add(o.matCorpo, cilindro(rd, zc, segs(nv, 28, 14))); });
        if (nv === "alto") k.com([0, 0, -zc - 0.0004], [["x", 90]], function () { k.add(o.matParaf, cilindro(mm(F, "pinoCentralDiametro") / 2, 2 * zc + 0.0008, 16)); });
      }
    });
  }
  var FF = "ra-andaime-abracadeira-fixa", FG = "ra-andaime-abracadeira-giratoria";
  GER[FF] = function (k, v) { abracadeira(k, FF, v, false); };
  GER[FG] = function (k, v) { abracadeira(k, FG, v, true); };
  function simboloAbrac(F, v, giratoria) {
    var Ro = mm(F, "raioInternoCalhaParaModelar") + mm(F, "espessuraChapaCorpo"), w = mm(F, giratoria ? "larguraAoLongoDoTubo_forjada" : "larguraCalhaAoLongoDoTubo_forjada"), o = [];
    circ(o, 0, 0, Ro, 20); ret(o, -Ro - 0.012, -w / 2, Ro + 0.012, w / 2);
    return { linhas: o };
  }
  SIMB[FF] = function (v) { return simboloAbrac(FF, v, false); };
  SIMB[FG] = function (v) { return simboloAbrac(FG, v, true); };

  /* ---- 4. ABRAÇADEIRA DE RODAPÉ (presilha da tábua) ---- */
  var FR = "ra-andaime-abracadeira-rodape";
  GER[FR] = function (k, v) {
    var nv = nivelDe(v), R0 = mm(FR, "raioInternoCalhaParaModelar"), t = mm(FR, "espessuraChapa"), Ro = R0 + t, h = mm(FR, "abaVerticalAltura"), aba = mm(FR, "abaLargura");
    var hasteR = mm(FR, "porcaChave") * 0.5 * 14 / 22, AF = mm(FR, "porcaChave"), corpo = v.Material_corpo, par = v.Material_parafuso;
    if (nv === "baixo") { k.add(MAT.BICROM, octaedro(0.012)); return; }
    var Ag = 135, ex = Ro * Math.sin(Ag * RAD) - t / 2 + 0.0004, zo = -0.045, zE = Ro * Math.cos(Ag * RAD), hN = mm(FF, "porcaAltura") /* a rodapé não tem a cota: é o mesmo M14 (ISO 4032) da fixa */, zb = zo + 0.0125;
    k.add(corpo, setor(R0, Ro, -Ag, Ag, h, segs(nv, 18, 8), true));                       /* C de ~270°: abraça o tubo */
    [-1, 1].forEach(function (s) { k.add(corpo, caixa(s * ex - t / 2, -h / 2, zo, t, h, zE - zo)); });   /* as duas orelhas da boca do C */
    k.add(corpo, caixa(Ro - t / 2, -h / 2, -t / 2, aba, h, t));                          /* a aba plana vertical que segura a tábua */
    k.add(corpo, caixa(Ro + aba - t, -h / 2, -t / 2 - 0.02, t, h, 0.02));                 /* o lábio dobrado na ponta */
    var xe = ex + t / 2;
    k.com([-xe - hN, 0, zb], [["z", -90]], function () {   /* parafuso M14 pelas orelhas: cabeça sextavada à esquerda, porca à direita */
      if (nv === "alto") k.add(par, cilindro(hasteR, 2 * (xe + hN) + 0.004, 10, hasteR, 0));
      k.add(par, porca(AF, hN));
    });
    k.com([xe, 0, zb], [["z", -90]], function () { k.add(par, porca(AF, hN)); });
  };
  SIMB[FR] = function (v) {
    var Ro = mm(FR, "raioInternoCalhaParaModelar") + mm(FR, "espessuraChapa"), aba = mm(FR, "abaLargura"), h = mm(FR, "abaVerticalAltura"), o = [];
    circ(o, 0, 0, Ro, 20); ret(o, Ro, -0.002, Ro + aba, 0.002);
    return { linhas: o };
  };

  /* ---- 5. LUVA de emenda externa ---- */
  var FL = "ra-andaime-luva";
  GER[FL] = function (k, v) {
    /* R1 (27/10/2026): a luva é UMA meia-cana curvada (180°, embaixo) + a TAMPA curvada (180°, em cima), as duas com abas dobradas para fora nos dois lados; 2 parafusos M14
       (um sobre cada tubo) fecham as abas do lado +X; o lado −X é a dobradiça (abas coladas). Nada de bloco. */
    var nv = nivelDe(v), R0 = mm(FL, "raioInternoParaModelar"), t = mm(FL, "espessuraChapa"), Ro = R0 + t, Lt = mm(FL, "comprimentoTotal"), dist = mm(FL, "distanciaEntreParafusos");
    var AF = mm(FL, "porcaChave"), hN = 0.011, corpo = v.Material_corpo, par = v.Material_parafuso, aba = 0.026, xs = R0 + 0.013;
    if (nv === "baixo") { k.add(MAT.BICROM, octaedro(0.012)); return; }
    k.com([0, 0, 0], rotEixo(v.Eixo), function () {
      var n = segs(nv, 22, 10);
      k.com([0, -Lt / 2, 0], [], function () {
        k.add(corpo, setor(R0, Ro, 90, 270, Lt, n));    /* meia-cana (embaixo, z' < 0) */
        k.add(corpo, setor(R0, Ro, -90, 90, Lt, n));    /* tampa (em cima, z' > 0) */
        [-1, 1].forEach(function (s) {
          var x0 = s > 0 ? R0 : -R0 - aba;
          k.add(corpo, caixa(x0, 0, -t, aba, Lt, t)); k.add(corpo, caixa(x0, 0, 0, aba, Lt, t));   /* as abas: a de baixo (da meia-cana) e a de cima (da tampa) */
        });
      });
      [-1, 1].forEach(function (s) {
        var yb = s * dist / 2;
        if (nv === "alto") {
          k.com([xs, yb, t], [["x", -90]], function () { k.add(par, porca(AF, hN)); });                     /* cabeça sextavada sobre a aba da tampa */
          k.com([xs, yb, -t], [["x", 90]], function () { k.add(par, porca(AF, hN)); });                      /* porca sob a aba da meia-cana */
          k.com([xs, yb, -t - hN - 0.003], [["x", 90]], function () { k.add(par, cilindro(0.007, 2 * t + 2 * hN + 0.006, 10, 0.007, 0)); });
        } else { k.add(par, caixa(xs - AF / 2, yb - AF / 2, t, AF, AF, hN)); k.add(par, caixa(xs - AF / 2, yb - AF / 2, -t - hN, AF, AF, hN)); }
      });
    });
  };
  SIMB[FL] = function (v) {
    var Ro = mm(FL, "raioInternoParaModelar") + mm(FL, "espessuraChapa"), Lt = mm(FL, "comprimentoTotal"), o = [];
    if (v.Eixo === "y") { circ(o, 0, 0, Ro, 20); return { linhas: o }; }
    if (v.Eixo === "x") ret(o, -Lt / 2, -Ro, Lt / 2, Ro); else ret(o, -Ro, -Lt / 2, Ro, Lt / 2);
    return { linhas: o };
  };

  /* ---- 6. BASE REGULÁVEL e 7. BASE FIXA ---- */
  var FB = "ra-andaime-base-regulavel", FX = "ra-andaime-base-fixa";
  function placaBase(k, F, nv, mat) {
    var A = mm(F, "placaLargura"), B = mm(F, "placaComprimento"), e = mm(F, "placaEspessura");
    k.add(mat, caixa(-A / 2, 0, -B / 2, A, e, B));
    return e;
  }
  GER[FB] = function (k, v) {
    var nv = nivelDe(v), mat = v.Material, rH = mm(FB, "hasteDiametroRosca") / 2, e = mm(FB, "placaEspessura"), curso = mm(FB, "cursoRosca");
    var Htot = Math.max(e + 0.05, v.Altura_total), hRosca = clamp(v.Altura_rosca, 0, Math.max(0, Htot - e - 0.05));
    var hub = mm(FB, "porcaBorboletaCuboDiametro") / 2, hubH = mm(FB, "porcaBorboletaAltura"), env = mm(FB, "porcaBorboletaEnvergadura") / 2, asaE = mm(FB, "porcaBorboletaAsaEspessura");
    var yN = e + hRosca;
    if (nv === "baixo") { k.add(mat, linhaFina([0, 0, 0], [0, Htot, 0], LIN_R)); k.add(mat, octaedro(0.012)); return; }
    placaBase(k, FB, nv, mat);
    k.add(mat, cilindro(rH * 1.3, 0.008, segs(nv, 20, 10), rH * 1.02, e));                        /* cordão de solda em volta da haste */
    var roscaFim = Math.min(e + curso, yN + hubH + 0.03);
    if (nv === "alto") {
      /* haste com FILETE visível: dente de serra por anel (passo 1/6" = 4,23 mm) — só até acima da porca; o resto é a parte lisa */
      var passo = 0.0254 / 6, perf = [[rH * 0.9, e]], y = e, nDentes = Math.max(1, Math.floor((roscaFim - e) / passo));
      for (var i = 0; i < nDentes; i++) { perf.push([rH, y + passo * 0.25], [rH * 0.9, y + passo * 0.5]); y += passo * 0.5; perf.push([rH, y + passo * 0.25], [rH * 0.9, y + passo * 0.5]); y += passo * 0.5; }
      perf.push([rH * 0.9, y]); k.add(mat, torno(perf, 16));
      if (Htot > y) k.add(mat, cilindro(rH, Htot - y, 20, rH, y));
    } else k.add(mat, cilindro(rH, Htot - e, 14, rH, e));
    /* porca borboleta: cubo + 2 asas planas, ligeiramente caídas (altura da asa decresce para a ponta) */
    k.add(mat, cilindro(hub, hubH, segs(nv, 24, 12), hub, yN));
    [0, 180].forEach(function (g) {
      /* perfil da asa (raio, altura): raiz alta, ponta caída; extrudado na espessura da asa e posto de pé */
      var pol = [[hub * 0.8, 0], [env, hubH * 0.15], [env, hubH * 0.65], [hub * 0.8, hubH]];
      k.com([0, yN, 0], [["x", -90], ["y", g]], function () { k.add(mat, prismaConvexo(pol, asaE, -asaE / 2)); });
    });
  };
  SIMB[FB] = function (v) {
    var A = mm(FB, "placaLargura") / 2, B = mm(FB, "placaComprimento") / 2, r = mm(FB, "hasteDiametroRosca") / 2, o = [];
    ret(o, -A, -B, A, B); circ(o, 0, 0, r, 16); o.push(-A, -B, A, B, -A, B, A, -B);
    return { linhas: o };
  };
  GER[FX] = function (k, v) {
    var nv = nivelDe(v), mat = v.Material, e = mm(FX, "placaEspessura"), Htot = mm(FX, "alturaTotal"), ro = mm(FX, "pinoDiametro") / 2, pa = mm(FX, "pinoParede");
    if (nv === "baixo") { k.add(mat, linhaFina([0, 0, 0], [0, Htot, 0], LIN_R)); k.add(mat, octaedro(0.012)); return; }
    placaBase(k, FX, nv, mat);
    k.add(mat, cilindro(ro * 1.18, 0.007, segs(nv, 24, 12), ro * 1.02, e));                       /* solda de filete em volta do pino */
    if (nv === "alto") k.add(mat, tuboOco(ro, ro - pa, Htot - e, 28, e)); else k.add(mat, cilindro(ro, Htot - e, 14, ro, e));
  };
  SIMB[FX] = function (v) {
    var A = mm(FX, "placaLargura") / 2, B = mm(FX, "placaComprimento") / 2, r = mm(FX, "pinoDiametro") / 2, o = [];
    ret(o, -A, -B, A, B); circ(o, 0, 0, r, 16); circ(o, 0, 0, r - mm(FX, "pinoParede"), 14);
    return { linhas: o };
  };

  /* ---- 8. RODÍZIO com trava ---- */
  var FD = "ra-andaime-rodizio";
  GER[FD] = function (k, v) {
    var nv = nivelDe(v), Rr = mm(FD, "rodaDiametro") / 2, Wr = mm(FD, "rodaLargura"), H = mm(FD, "alturaTotalSimples"), tg = mm(FD, "garfoEspessuraChapa");
    var plat = mm(FD, "platinaDiametro") / 2, ped = mm(FD, "pedalTravaComprimento"), tubR = mm(FD, "tuboEncaixeDiametro") / 2, tubH = mm(FD, "tuboEncaixeAltura");
    var aço = v.Material, yR = Rr;
    if (nv === "baixo") { k.add(aço, linhaFina([0, 0, 0], [0, H, 0], LIN_R)); k.add(aço, octaedro(0.012)); return; }
    /* a roda: banda de borracha (perfil arredondado) sobre o aro de aço, eixo em X */
    k.com([0, yR, 0], [["z", 90]], function () {
      var rm = Rr * 0.67, w2 = Wr / 2, rd = 0.006;
      k.add(v.Material_banda, torno([[rm, -w2], [Rr - rd, -w2], [Rr - rd * 0.3, -w2 + rd * 0.3], [Rr, -w2 + rd], [Rr, w2 - rd], [Rr - rd * 0.3, w2 - rd * 0.3], [Rr - rd, w2], [rm, w2]], segs(nv, 40, 20)));
      k.add(aço, cilindro(rm * 0.98, Wr * 0.92, segs(nv, 28, 14), rm * 0.98, -Wr * 0.46));
      if (nv === "alto") k.add(aço, cilindro(0.016, Wr + 2 * tg + 0.01, 14, 0.016, -(Wr + 2 * tg + 0.01) / 2));   /* eixo e cubo */
    });
    var xg = Wr / 2 + 0.002 + tg / 2, yTop = Rr * 2 + 0.005;
    [-1, 1].forEach(function (s) { k.add(aço, caixa(s * xg - tg / 2, 0.035, -0.032, tg, yTop - 0.035, 0.064)); });   /* as duas chapas do garfo */
    k.add(aço, caixa(-xg - tg / 2, yTop, -0.04, 2 * xg + tg, tg, 0.08));                        /* chapa de cima do garfo */
    k.add(MAT.BICROM, cilindro(plat, tg, segs(nv, 32, 16), plat, yTop + tg));                   /* platina do giro */
    k.add(aço, cilindro(plat * 0.8, 0.008, segs(nv, 32, 16), plat * 0.8, yTop + 2 * tg));       /* pista do rolamento */
    var yb = yTop + 2 * tg + 0.008;
    k.add(aço, cilindro(0.03, (H - tubH) - yb, 18, 0.03, yb));                                   /* corpo do giro */
    if (nv === "alto") k.add(aço, tuboOco(tubR, tubR - 0.003, tubH, 28, H - tubH)); else k.add(aço, cilindro(tubR, tubH, 14, tubR, H - tubH));
    /* a trava de pé: alavanca de chapa na lateral do garfo, com a sapata no fim */
    k.add(aço, caixa(xg + tg / 2, 0.11, -0.01, 0.004, 0.02, ped));
    k.add(v.Material_banda, caixa(xg + tg / 2 - 0.004, 0.105, ped - 0.03, 0.02, 0.012, 0.03));
  };
  SIMB[FD] = function (v) {
    var Rr = mm(FD, "rodaDiametro") / 2, Wr = mm(FD, "rodaLargura"), pl = mm(FD, "platinaDiametro") / 2, o = [];
    circ(o, 0, 0, pl, 24); ret(o, -Wr / 2, -Rr, Wr / 2, Rr);
    return { linhas: o };
  };

  /* ---- 9–11. MADEIRA: pranchão, rodapé, calço ---- */
  var FP = "ra-andaime-pranchao", FRd = "ra-andaime-rodape", FC = "ra-andaime-calco";
  /* peça de madeira com comprimento em X, origem no centro do piso (face de baixo) */
  function tabua(k, mat, L, larg, esp, raio, nvq) {
    var c = raio > 0 ? retArredondado(esp, larg, raio, 3) : [[-esp / 2, -larg / 2], [esp / 2, -larg / 2], [esp / 2, larg / 2], [-esp / 2, larg / 2]];
    /* contorno (x = espessura, z = largura) extrudado em Y por L e deitado: Y→X; a espessura (x) vira Y (com sinal trocado) */
    k.com([-L / 2, esp / 2, 0], [["z", -90]], function () { k.add(mat, prismaConvexo(c, L, 0)); });
  }
  GER[FP] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.2, v.Comprimento), larg = mm(FP, "largura"), esp = v.Espessura, mat = v.Material;
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([-L / 2, esp, 0], [L / 2, esp, 0], LIN_R)); return; }
    tabua(k, mat, L, larg, esp, nv === "alto" ? mm(FP, "raioQuina") : 0);
    if (v.Cinta && nv === "alto") {   /* cinta de aço nas duas cabeças (grampo): a faixa metálica que evita rachar — sem os dentes cravados */
      var cl = mm(FP, "cintaLargura"), ce = 0.0015;
      [-1, 1].forEach(function (s) {
        var xe = s * L / 2;
        k.add(MAT.GALV, caixa(s > 0 ? xe : xe - ce, -ce, -larg / 2 - ce, ce, esp + 2 * ce, larg + 2 * ce));
        k.add(MAT.GALV, caixa(s > 0 ? xe - cl : xe, esp, -larg / 2 - ce, cl, ce, larg + 2 * ce));
        k.add(MAT.GALV, caixa(s > 0 ? xe - cl : xe, -ce, -larg / 2 - ce, cl, ce, larg + 2 * ce));
      });
    }
  };
  SIMB[FP] = function (v) { var L = v.Comprimento, w = mm(FP, "largura"), o = []; ret(o, -L / 2, -w / 2, L / 2, w / 2); hachura(o, -L / 2, -w / 2, L / 2, w / 2, 0.05); return { linhas: o }; };
  GER[FRd] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.2, v.Comprimento), h = mm(FRd, "altura"), e = v.Espessura;
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([-L / 2, h, 0], [L / 2, h, 0], LIN_R)); return; }
    k.add(v.Material, caixa(-L / 2, 0, -e / 2, L, h, e));
  };
  SIMB[FRd] = function (v) { var L = v.Comprimento, e = v.Espessura, o = []; ret(o, -L / 2, -e / 2, L / 2, e / 2); hachura(o, -L / 2, -e / 2, L / 2, e / 2, 0.06); return { linhas: o }; };
  GER[FC] = function (k, v) {
    var nv = nivelDe(v), L = v.Comprimento, larg = mm(FC, "largura"), esp = mm(FC, "espessura");
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([-L / 2, esp, 0], [L / 2, esp, 0], LIN_R)); return; }
    k.add(v.Material, caixa(-L / 2, 0, -larg / 2, L, esp, larg));
  };
  SIMB[FC] = function (v) { var L = v.Comprimento, w = mm(FC, "largura"), o = []; ret(o, -L / 2, -w / 2, L / 2, w / 2); o.push(-L / 2, -w / 2, L / 2, w / 2, -L / 2, w / 2, L / 2, -w / 2); return { linhas: o }; };

  /* ---- 12. ESCADA DE MÃO e 13. ESCADA MARINHEIRO ---- */
  var FE = "ra-andaime-escada", FM = "ra-andaime-marinheiro";
  function corpoEscada(k, F, v, H, nv) {
    /* o marinheiro é "a escada de mão com arcos" (FAMILIAS-COTAS.md): banzo e degrau têm as cotas da escada; largura e espaçamento são as dele */
    var larg = mm(F, "largura"), rb = mm(FE, "banzoTuboDiametro") / 2, pb = mm(FE, "banzoParede"), rd = mm(FE, "degrauDiametro") / 2, esp = mm(F, "degrauEspacamento"), mat = v.Material, xb = larg / 2;
    if (nv === "baixo") { [-1, 1].forEach(function (s) { k.add(mat, linhaFina([s * xb, 0, 0], [s * xb, H, 0], LIN_R)); }); return; }
    [-1, 1].forEach(function (s) {
      k.com([s * xb, 0, 0], [], function () { if (nv === "alto") k.add(mat, tuboOco(rb, rb - pb, H, 20, 0)); else k.add(mat, cilindro(rb, H, 10, rb, 0)); });
    });
    var nD = Math.max(1, Math.floor((H - 0.1) / esp));
    for (var i = 0; i < nD; i++) {
      var y = 0.15 + i * esp;
      k.com([-xb, y, 0], [["z", -90]], function () { k.add(mat, cilindro(rd, larg, segs(nv, 14, 8), rd, 0)); });
    }
    if (nv === "alto") [-1, 1].forEach(function (s) {   /* dois ganchos em J no topo, para pendurar no tubo do piso */
      var rg = 0.025, rh = 0.0085, path = [[s * xb, H - 0.04, 0], [s * xb, H + 0.05, 0]], j;
      for (j = 1; j <= 10; j++) { var th = Math.PI * j / 10; path.push([s * xb, H + 0.05 + Math.sin(th) * rg, -rg + Math.cos(th) * rg]); }
      path.push([s * xb, H - 0.01, -2 * rg]);
      k.add(mat, varrer(path, rh, 8, true));
    });
  }
  GER[FE] = function (k, v) { corpoEscada(k, FE, v, Math.max(0.5, v.Altura), nivelDe(v)); };
  SIMB[FE] = function (v) { var l = mm(FE, "largura"), rb = mm(FE, "banzoTuboDiametro") / 2, o = []; circ(o, -l / 2, 0, rb, 12); circ(o, l / 2, 0, rb, 12); return { linhas: o }; };
  GER[FM] = function (k, v) {
    var nv = nivelDe(v), H = Math.max(1, v.Altura), larg = mm(FM, "largura"), Dm = mm(FM, "arcoDiametro"), fx = mm(FM, "arcoFaixaLargura"), fe = mm(FM, "arcoFaixaEspessura"), ev = mm(FM, "arcoEspacamentoVertical");
    var mat = v.Material, Rm = Dm / 2, zc = Math.sqrt(Rm * Rm - (larg / 2) * (larg / 2)), gap = Math.asin(larg / 2 / Rm) / RAD;
    corpoEscada(k, FM, v, H, nv);
    if (nv === "baixo") return;
    for (var y = ev / 2; y <= H - 0.25; y += ev) {   /* os arcos de proteção: tira chata dobrada em círculo, aberta do lado da escada */
      k.com([0, y, zc], [], function () {
        /* R1/marinheiro: o arco é ABERTO do lado da escada (270° de tira chata; a abertura de 90° volta-se para o andaime) e as DUAS PONTAS descem em U até os banzos, onde a luva prende */
        k.add(mat, setor(Rm - fe, Rm, -135, 135, fx, segs(nv, 36, 16), true));
        [-1, 1].forEach(function (s) {
          var ax = s * Rm * Math.sin(135 * RAD), az = Rm * Math.cos(135 * RAD), bxx = s * larg / 2, bz = -zc, dx = bxx - ax, dz = bz - az, len = Math.sqrt(dx * dx + dz * dz);
          k.com([ax, 0, az], [["y", Math.atan2(dx, dz) / RAD]], function () { k.add(mat, caixa(-fe / 2, -fx / 2, 0, fe, fx, len)); });
        });
        if (nv === "alto") [-1, 1].forEach(function (s) {   /* a luva que prende o arco ao banzo */
          k.com([s * larg / 2, 0, -zc], [], function () { k.add(mat, tuboOco(mm(FM, "arcoLuvaEncaixe") / 2, mm(FM, "arcoLuvaEncaixe") / 2 - 0.003, 0.05, 16, -0.025)); });
        });
      });
    }
  };
  SIMB[FM] = function (v) {
    var l = mm(FM, "largura"), rb = mm(FE, "banzoTuboDiametro") / 2, Dm = mm(FM, "arcoDiametro"), Rm = Dm / 2, zc = Math.sqrt(Rm * Rm - (l / 2) * (l / 2)), gap = Math.asin(l / 2 / Rm), o = [], i, n = 28;
    circ(o, -l / 2, 0, rb, 12); circ(o, l / 2, 0, rb, 12);
    for (i = 0; i < n; i++) { var a = (-(Math.PI - gap)) + 2 * (Math.PI - gap) * i / n, b = (-(Math.PI - gap)) + 2 * (Math.PI - gap) * (i + 1) / n; o.push(Math.sin(a) * Rm, zc + Math.cos(a) * Rm, Math.sin(b) * Rm, zc + Math.cos(b) * Rm); }
    return { linhas: o };
  };

  /* ---- 14. OLHAL (parabolt com olhal) ---- */
  var FO = "ra-andaime-olhal";
  GER[FO] = function (k, v) {
    var nv = nivelDe(v), mat = v.Material, rb = mm(FO, "buchaDiametro") / 2, rh = 0.006, db = mm(FO, "olhalDiametroBarra") / 2, Ri = mm(FO, "olhalDiametroInterno") / 2, Rm = Ri + db;
    var total = mm(FO, "hastesComprimentoTotal"), livre = mm(FO, "hasteRoscadaLivre"), zO = livre;
    if (nv === "baixo") { k.add(mat, linhaFina([0, 0, -(total - livre)], [0, 0, livre + 2 * Rm], LIN_R)); k.add(mat, octaedro(0.012)); return; }
    k.com([0, 0, -(total - livre)], [["x", 90]], function () { k.add(mat, cilindro(rb, total - livre, segs(nv, 18, 10), rb, 0)); });   /* a bucha de expansão, dentro da parede */
    k.com([0, 0, 0], [["x", 90]], function () { k.add(mat, cilindro(rh, livre, 12, rh, 0)); });                                             /* a haste M12 */
    k.com([0, 0, 0.0], [["x", 90]], function () { k.add(mat, cilindro(0.012, 0.0025, 12, 0.012, 0)); });                                    /* arruela */
    k.com([0, 0, 0.0025], [["y", 30], ["x", 90]], function () { k.add(mat, porca(0.019, 0.01)); });
    k.com([0, 0, zO + Rm], [["z", 90]], function () { k.add(mat, toroY(Rm, db, segs(nv, 28, 12), segs(nv, 10, 6))); });                    /* o olhal: anel fechado no plano vertical */
  };
  SIMB[FO] = function (v) { var o = []; circ(o, 0, 0, mm(FO, "buchaDiametro") / 2, 10); o.push(-0.02, 0, 0.02, 0, 0, -0.02, 0, 0.02); return { linhas: o }; };

  /* ---- 15. TELA de proteção ---- */
  var FTl = "ra-andaime-tela";
  GER[FTl] = function (k, v) {
    var nv = nivelDe(v), W = Math.max(0.3, v.Largura), H = Math.max(0.3, v.Altura), mat = v.Material, malha = clamp(v.Malha, 0.005, mm(FTl, "malhaMaximaNorma")),
        fio = mm(FTl, "fioDiametro"), ban = 0.03, ce = 0.0008;
    if (nv === "baixo") { k.add(mat, linhaFina([0, H / 2, 0], [W, H / 2, 0], LIN_R)); return; }
    /* a bainha reforçada das 4 bordas (fita onde passam as ilhoses e o arame de fixação) */
    k.add(mat, caixa(0, 0, -ce / 2, W, ban, ce)); k.add(mat, caixa(0, H - ban, -ce / 2, W, ban, ce));
    k.add(mat, caixa(0, ban, -ce / 2, ban, H - 2 * ban, ce)); k.add(mat, caixa(W - ban, ban, -ce / 2, ban, H - 2 * ban, ce));
    var Wi = W - 2 * ban, Hi = H - 2 * ban;
    if (nv === "medio" || malha < 0.01) { k.add(mat, caixa(ban, ban, -ce / 4, Wi, Hi, ce / 2)); }
    else {   /* a malha de verdade: fitas de fio (largura = fio) cruzadas a cada `malha` — 25 mm no máximo (NBR 6494 3.2.4.1) */
      var nx = Math.max(1, Math.round(Wi / malha)), ny = Math.max(1, Math.round(Hi / malha)), i;
      for (i = 0; i <= nx; i++) k.add(mat, caixa(ban + Wi * i / nx - fio / 2, ban, -ce / 4, fio, Hi, ce / 2));
      for (i = 0; i <= ny; i++) k.add(mat, caixa(ban, ban + Hi * i / ny - fio / 2, ce / 4, Wi, fio, ce / 2));
    }
    if (nv === "alto") {   /* ilhoses de metal a cada ~0,5 m na bainha de cima e de baixo */
      var ni = Math.max(2, Math.round(W / 0.5) + 1), i2;
      for (i2 = 0; i2 < ni; i2++) { var xi = 0.04 + (W - 0.08) * i2 / (ni - 1); [ban / 2, H - ban / 2].forEach(function (yi) { k.com([xi, yi, 0], [["x", 90]], function () { k.add(MAT.GALV, tuboOco(0.006, 0.0035, 0.0016, 12, -0.0008)); }); }); }
    }
  };
  SIMB[FTl] = function (v) { var W = v.Largura, o = [], x; for (x = 0; x < W; x += 0.08) o.push(x, 0, Math.min(W, x + 0.05), 0); return { linhas: o }; };

  /* ------------------------------------------------ DEFINIÇÃO DAS FAMÍLIAS (parâmetros, tipos, quantitativo) */
  var LISTA = [];
  function P(nome, tipoDado, valor, grupo, descricao, escopo) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo || "Dimensões" };
    if (descricao) o.descricao = descricao;   /* null/"" = sem texto */
    return o;
  }
  function T(id, nome, valores, fonte) { var t = { id: id, nome: nome, valores: valores || {} }; if (fonte) t.fonte = fonte; return t; }
  var PNIVEL = P("Nivel_detalhe", "texto", "alto", "Construção", "alto | medio | baixo — o nível de detalhe da vista (Baixo = eixo e ponto no nó; Médio = anel + bloco; Alto = a forma inteira). A peça é a mesma nos três.", "instancia");
  var PMASSA = P("Massa_kg", "numero", 0, "Identidade", "Massa da peça em kg para o peso do modelo; 0 = a do catálogo da família (a locação do andaime passa a do catálogo do js/andaime.js)", "instancia");
  var FORA = " Peça de locação do andaime: fora do orçamento do aço (código de orçamento em branco; a lista de locação é a do js/andaime.js).";
  var ESTIMADAS = " Cotas estimadas ficam marcadas em docs/andaime/FAMILIAS-COTAS.md (\"conferir com a peça real\").";
  function def(o) {
    var fam = {
      id: o.id, previa: "modelador", nome: o.nome, categoria: "andaime", hospedagem: "livre", geometria: "andaime", andaime: o.id, disciplina: "andaime",
      descricao: o.descricao + (o.origem ? " Origem: " + o.origem : "") + FORA + ESTIMADAS,
      parametros: o.parametros.concat([PNIVEL, PMASSA]), tipos: o.tipos,
      quantitativo: { unidade: o.unidade || "un", quantidade: o.quantidade || "1", codigo: "", fonte: "", descricao: (o.quantDesc || o.nome) + " (locação do andaime)" }
    };
    LISTA.push(fam); if (o.massa) MASSA[o.id] = o.massa;
    return fam;
  }
  function pMat(nome, padrao, desc) { return P(nome, "material", padrao, "Materiais", desc, "instancia"); }
  var PEIXO = P("Eixo", "texto", "y", "Construção", "Para onde o tubo aponta: x, y (vertical) ou z", "instancia");
  var LISTA_TUBO = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
  function tiposComp(lista, rotulo, fonte) { return lista.map(function (c) { return T("c" + String(c).replace(".", "_"), rotulo + " " + String(c).replace(".", ",") + " m", { Comprimento: c }, fonte); }); }

  def({ id: FT, nome: "Tubo de andaime Ø48,3 × 3,0", descricao: "Tubo galvanizado Ø48,3 × 3,0 vazado (boca visível nas pontas, corte reto), comprimento = parâmetro (módulos de 0,25 a 0,50 m, até 6 m).",
    origem: "no começo do tubo, no eixo.", parametros: [P("Comprimento", "comprimento", 2.0, "Dimensões", "0,25 a 6,00 m (catálogo)", "instancia"), PEIXO, pMat("Material", MAT.GALV, "Aço galvanizado a fogo (camada mín. 55 µm)")],
    tipos: tiposComp(LISTA_TUBO, "Tubo"), massa: function (v) { return cota(FT, "pesoPorMetro") * v.Comprimento; }, unidade: "m", quantidade: "Comprimento", quantDesc: "Tubo de andaime Ø48,3 × 3,0" });
  def({ id: FF, nome: "Abraçadeira fixa (90°)", descricao: "Abraçadeira fixa de duas calhas de fita de aço dobrada (uma por tubo), a 90°, com parafuso em U de barra redonda Ø14 e porca sextavada (chave 22 → M14, derivada) por calha.",
    origem: "no ponto onde os eixos dos dois tubos se cruzam (a meia distância entre eles).", parametros: [P("Montagem", "texto", "vertical", "Construção", "vertical = tubo 1 em Y (montante); horizontal = os dois tubos horizontais, pino vertical", "instancia"), pMat("Material_corpo", MAT.GRAFITE, "Corpo: aço preto oxidado (foto do catálogo) ou aço galvanizado"), pMat("Material_parafuso", MAT.BICROM, "U e porcas: zincado bicromatizado (amarelo-dourado); a foto do catálogo mostra o U zincado claro — opção \"aço galvanizado\"")],
    tipos: [T("padrao", "Fixa 90° (calha 37 mm)", {}, "docs/andaime/familias-cotas.json")], massa: function () { return cota(FF, "pesoBrastub"); }, quantDesc: "Abraçadeira fixa" });
  def({ id: FG, nome: "Abraçadeira giratória", descricao: "Duas calhas ligadas por um pino central que giram uma sobre a outra em qualquer ângulo (0 a 360°), cada uma com seu parafuso em U e porca.",
    origem: "no pino central (a meia distância entre os eixos dos tubos).", parametros: [P("Angulo", "angulo", 90, "Dimensões", "Ângulo do tubo 2 a partir do tubo 1 (Y), no plano XY: 90° = perpendicular; 45° = diagonal", "instancia"), P("Montagem", "texto", "vertical", "Construção", "vertical | horizontal", "instancia"), pMat("Material_corpo", MAT.GRAFITE, "Corpo: aço preto oxidado ou galvanizado"), pMat("Material_parafuso", MAT.BICROM, "U e porcas: zincado bicromatizado")],
    tipos: [T("a90", "Giratória 90°", {}, "docs/andaime/familias-cotas.json"), T("a60", "Giratória 60°", { Angulo: 60 }), T("a45", "Giratória 45°", { Angulo: 45 }), T("a30", "Giratória 30°", { Angulo: 30 })], massa: function () { return cota(FG, "pesoBrastub"); }, quantDesc: "Abraçadeira giratória" });
  def({ id: FR, nome: "Abraçadeira de rodapé", descricao: "Presilha de chapa dobrada: C de ~270° em volta do tubo, fechado por um parafuso M14 com porca, com a aba plana vertical que segura a tábua do rodapé. SEM ficha de fabricante: forma por analogia, conferir com a peça real.",
    origem: "no eixo do tubo, na meia altura da aba; a aba sai em +X.", parametros: [pMat("Material_corpo", MAT.GALV, "Chapa galvanizada clara (foto do catálogo)"), pMat("Material_parafuso", MAT.BICROM, "Parafuso zincado")],
    tipos: [T("padrao", "Presilha de rodapé", {})], massa: function () { return cota(FR, "peso"); }, quantDesc: "Abraçadeira de rodapé" });
  def({ id: FL, nome: "Luva de emenda", descricao: "Luva de emenda externa: duas meias-canas de ~72 mm sobre cada tubo (junta de 4 mm no meio), com o rabo plano lateral e dois parafusos M14.",
    origem: "no meio da junta, no eixo.", parametros: [PEIXO, pMat("Material_corpo", MAT.GRAFITE, "Aço preto oxidado (foto do catálogo)"), pMat("Material_parafuso", MAT.BICROM, "Parafusos e porcas")],
    tipos: [T("padrao", "Luva 148 mm", {})], massa: function () { return cota(FL, "pesoBrastub"); }, quantDesc: "Luva de emenda" });
  def({ id: FB, nome: "Base regulável (sapata ajustável)", descricao: "Placa 120 × 120 × 8, haste roscada Ø1½\" com filete e porca borboleta de duas asas; a altura da porca (altura de rosca) é parâmetro.",
    origem: "no centro da face de baixo da placa.", parametros: [P("Altura_rosca", "comprimento", 0.10, "Dimensões", "Altura da face de baixo da porca borboleta acima da placa (0 a 0,40 m)", "instancia"), P("Altura_total", "comprimento", 0.50, "Dimensões", "Altura total da base (catálogo: 0,50 m, curso de 0,33 m)", "instancia"), pMat("Material", MAT.GALV, "Aço galvanizado")],
    tipos: [T("padrao", "Regulável 0,50 m", {}, "docs/andaime/familias-cotas.json")], massa: function () { return cota(FB, "pesoBrastub"); }, quantDesc: "Base regulável" });
  def({ id: FX, nome: "Base fixa (placa com pino)", descricao: "Placa 120 × 120 × 8 com tubo curto vazado soldado no centro (entra no montante). Sem rosca.",
    origem: "no centro da face de baixo da placa.", parametros: [pMat("Material", MAT.GALV, "Aço galvanizado")], tipos: [T("padrao", "Fixa 0,10 m", {})], massa: function () { return cota(FX, "pesoBrastub"); }, quantDesc: "Base fixa" });
  def({ id: FD, nome: "Rodízio Ø150 com trava", descricao: "Roda Ø150 × 50,8 com banda de borracha, garfo giratório com platina e rolamento, tubo de encaixe Ø38,1 e trava de pé.",
    origem: "no piso, sob o eixo do giro; a roda rola em Z.", parametros: [pMat("Material", MAT.GALV, "Aço galvanizado"), pMat("Material_banda", MAT.BORRACHA, "Banda: borracha preta (padrão); a foto do catálogo mostra poliuretano laranja")],
    tipos: [T("padrao", "Rodízio simples 0,345 m", {})], massa: function () { return cota(FD, "peso"); }, quantDesc: "Rodízio com trava" });
  def({ id: FP, nome: "Pranchão de madeira", descricao: "Tábua 0,30 × 0,038 × C (NR-34/apostila; o catálogo de um fabricante nacional vende 0,30 × 0,030), quinas levemente arredondadas, cinta de aço nas duas cabeças.",
    origem: "no piso (face de baixo), no centro; comprimento em X.", parametros: [P("Comprimento", "comprimento", 2.0, "Dimensões", "1,00 a 3,00 m em módulos de 0,25 m", "instancia"), P("Espessura", "comprimento", 0.038, "Dimensões", "0,038 (NR-34); a opção de catálogo nacional é 0,030", "instancia"), P("Cinta", "simnao", true, "Construção", "Cinta de aço nas duas cabeças", "instancia"), pMat("Material", MAT.PINUS, "Madeira serrada (laranja-mel da foto do catálogo)")],
    tipos: [T("c1", "Pranchão 1,00 m", { Comprimento: 1 }), T("c15", "Pranchão 1,50 m", { Comprimento: 1.5 }), T("c2", "Pranchão 2,00 m", { Comprimento: 2 }), T("c25", "Pranchão 2,50 m", { Comprimento: 2.5 }), T("c3", "Pranchão 3,00 m", { Comprimento: 3 })],
    massa: function (v) { return cota(FP, "peso") * v.Comprimento; }, quantDesc: "Pranchão de madeira" });
  def({ id: FRd, nome: "Rodapé de madeira", descricao: "Tábua de pé 0,20 (altura) × 0,025 × C, mínimo de 0,15 m pela norma; o mercado usa também 0,020.",
    origem: "no piso, no centro; comprimento em X.", parametros: [P("Comprimento", "comprimento", 2.0, "Dimensões", null, "instancia"), P("Espessura", "comprimento", 0.025, "Dimensões", "0,025 padrão; opção de mercado 0,020", "instancia"), pMat("Material", MAT.PINUS, "Madeira serrada")],
    tipos: [T("c2", "Rodapé 2,00 m", {}), T("c1", "Rodapé 1,00 m", { Comprimento: 1 }), T("c3", "Rodapé 3,00 m", { Comprimento: 3 })], massa: function (v) { return 790 * v.Comprimento * mm(FRd, "altura") * v.Espessura; }, quantDesc: "Rodapé de madeira" });
  def({ id: FC, nome: "Calço de madeira", descricao: "Bloco 0,30 × 0,038 × 0,50 deitado no chão, sob a placa de base (a placa fica centrada).",
    origem: "no piso, no centro; comprimento em X.", parametros: [P("Comprimento", "comprimento", 0.5, "Dimensões", null, "instancia"), pMat("Material", MAT.EUC, "Madeira de eucalipto (cor estimada)")], tipos: [T("padrao", "Calço 0,50 m", {})],
    massa: function (v) { return 9.0 * v.Comprimento; }, quantDesc: "Calço de madeira" });
  def({ id: FE, nome: "Escada de mão do andaime", descricao: "Dois banzos tubulares Ø31,75 × 1,5 a 0,40 m, degraus Ø25 a cada 0,275 m e dois ganchos em J no topo.",
    origem: "no meio da largura, no pé; o plano da escada é XY; os ganchos vão para −Z.", parametros: [P("Altura", "comprimento", 2.0, "Dimensões", null, "instancia"), pMat("Material", MAT.GALV, "Aço galvanizado (ou alumínio)")],
    tipos: [T("h2", "Escada 2,00 m", {}), T("h3", "Escada 3,00 m", { Altura: 3 }), T("h4", "Escada 4,00 m", { Altura: 4 })], massa: function (v) { return cota(FE, "pesoEscada2m") * v.Altura / 2; }, quantDesc: "Escada de mão" });
  def({ id: FM, nome: "Escada marinheiro com arcos", descricao: "Banzos e degraus como a escada de mão, mais os arcos de proteção (tira chata Ø0,725 aberta do lado da escada) a cada ~1 m.",
    origem: "no meio da largura, no pé; os arcos saem para +Z.", parametros: [P("Altura", "comprimento", 2.0, "Dimensões", "Módulo de 2,00 m", "instancia"), pMat("Material", MAT.GALV, "Aço galvanizado")],
    tipos: [T("m2", "Marinheiro módulo 2,00 m", {}), T("m4", "Marinheiro 4,00 m", { Altura: 4 })], massa: function (v) { return cota(FM, "pesoEscada2m") * v.Altura / 2 + cota(FM, "arcoPesoAberto") * Math.max(0, Math.floor((v.Altura - 0.25 - 0.5) / 1.0) + 1); }, quantDesc: "Escada marinheiro" });
  def({ id: FO, nome: "Olhal parabolt (ancoragem)", descricao: "Chumbador parabolt: bucha de expansão Ø12,7, haste M12 com porca e arruela e o olhal fechado Ø23 de barra Ø8. SEM peso de fonte (massa 0).",
    origem: "na face da parede; a haste sai em +Z.", parametros: [pMat("Material", MAT.BICROM, "Aço zincado (prata) ou bicromatizado (dourado)")], tipos: [T("padrao", "Parabolt M12 1/2\"", {})], massa: null, quantDesc: "Olhal de ancoragem" });
  def({ id: FTl, nome: "Tela de proteção (painel)", descricao: "Painel plano de tela de polietileno com malha ≤ 25 mm (NBR 6494 3.2.4.1), bainha reforçada nas 4 bordas e ilhoses; semitransparente.",
    origem: "no canto de baixo à esquerda, no plano XY.", parametros: [P("Largura", "comprimento", 2.0, "Dimensões", "O vão do andaime", "instancia"), P("Altura", "comprimento", 1.2, "Dimensões", "1,20 m (estimada) ou até o piso seguinte", "instancia"), P("Malha", "comprimento", 0.025, "Dimensões", "Máx. 0,025 m (NBR 6494 3.2.4.1); abaixo de 0,010 vira plano", "instancia"), pMat("Material", MAT.TELA, "Polietileno verde (opção \"tela pe laranja\")")],
    tipos: [T("v2", "Painel 2,00 × 1,20", {}), T("v25", "Painel 2,50 × 1,20", { Largura: 2.5 }), T("v3", "Painel 3,00 × 1,20", { Largura: 3 })], unidade: "m2", quantidade: "Largura*Altura",
    massa: function (v) { return cota(FTl, "gramatura") / 1000 * v.Largura * v.Altura; }, quantDesc: "Tela de proteção" });

  /* ------------------------------------------------ AVALIAÇÃO (gancho `completar` do js/familia.js) */
  var DEFAULT_TEXT = { Eixo: "y", Montagem: "vertical" };
  function completar(fam, tipo, inst, saida) {
    var id = fam.andaime || fam.id, g = GER[id];
    /* M2: o js/familia.js despacha toda `geometria: "andaime"` para cá; as ra-andaime-m-* (multidirecional) são do js/familiasandaimem.js */
    if (!g && String(id).indexOf("ra-andaime-m-") === 0) { var M2 = global.FamiliasAndaimeM || dep("FamiliasAndaimeM", "familiasandaimem.js"); if (M2 && M2.completar) return M2.completar(fam, tipo, inst, saida); }
    if (!g || !Mob) { saida.ok = false; saida.erros = (saida.erros || []).concat(["o gerador de andaime \"" + id + "\" não carregou"]); return saida; }
    var v = {}, vals = saida.valores || {};
    Object.keys(vals).forEach(function (n) { v[n] = vals[n]; });
    if (v.Eixo != null) v.Eixo = v.Eixo === "x" || v.Eixo === "z" ? v.Eixo : "y";
    if (v.Montagem != null) v.Montagem = v.Montagem === "horizontal" ? "horizontal" : "vertical";
    var c = Mob.cena(), k = new Kit(c);
    try { g(k, v); } catch (e) { saida.ok = false; saida.erros = (saida.erros || []).concat(["andaime \"" + fam.nome + "\": " + e.message]); return saida; }
    saida.solidos = c.solidos(id.replace(/^ra-/, "") + ":");
    saida.caixa = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: c.env.z0, x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    saida.mob = { triangulos: c.triangulos(), pecas: saida.solidos.length };
    saida.nivelDetalhe = nivelDe(v);
    saida.partesMoveis = []; saida.errosPartes = [];
    var ms = MASSA[id];
    saida.massa = num(v.Massa_kg, 0) > 0 ? v.Massa_kg : (ms ? Math.round(ms(v) * 1000) / 1000 : 0);
    if (SIMB[id]) { try { saida.simboloPlanta = SIMB[id](v); } catch (eS) { /* sem símbolo: a planta usa a malha */ } }
    return saida;
  }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function registrarNoRA() {
    var RA = global.FamiliasRA || dep("FamiliasRA", "familiasra.js");
    if (RA && RA.registrar) RA.registrar(clonar(LISTA));
  }

  /* ------------------------------------------------ MINIATURA (ícone da relação de materiais e do memorial; só no navegador) */
  var _mini = {};
  function corDe(m) { var p = PBR[String(m).toLowerCase()]; if (!p) return "#9a9a9a"; return "#" + ("000000" + p.cor.toString(16)).slice(-6); }
  function miniatura(famId, tipoId, tam) {
    var F = global.Familia, f = null, i;
    for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
    if (!f || !F || !Mob || !global.document) return "";
    var tp = tipoId || (f.tipos[0] || {}).id, kk = famId + "|" + tp + "|" + (tam || 96);
    if (_mini[kk] != null) return _mini[kk];
    var av = F.avaliar(f, tp, {});
    _mini[kk] = av && av.ok ? Mob.miniatura(av.solidos, tam || 96, corDe) : "";
    return _mini[kk];
  }

  registrarNoRA();
  /* M2 (27/10/2026): as primitivas e o kit de transformações ficam à disposição de js/familiasandaimem.js (o multidirecional) — uma só implementação de tubo oco,
     setor, porca, varredura… para as duas linhas de famílias. Nenhuma cota passa por aqui: cada família lê as dela do seu próprio módulo de dados. */
  var PRIM = { Kit: Kit, tri: tri, rotM: rotM, mulM: mulM, aplM: aplM, colsM: colsM, caixa: caixa, cilindro: cilindro, tuboOco: tuboOco, setor: setor, prismaConvexo: prismaConvexo, retArredondado: retArredondado, porca: porca, varrer: varrer,
    densificar: densificar, toroY: toroY, torno: torno, linhaFina: linhaFina, octaedro: octaedro, nivelDe: nivelDe, segs: segs, circ: circ, ret: ret, hachura: hachura, LIN_R: LIN_R, PBR: PBR, MAT: MAT };
  var FamiliasAndaime = {
    _prim: PRIM,
    IDS: LISTA.map(function (f) { return f.id; }), PBR: PBR, MAT: MAT, lista: function () { return clonar(LISTA); },
    completar: completar, miniatura: miniatura, cota: cota, _dados: function () { return Dados; },
    /* o ponto de entrada para quem não passa pelo js/familia.js (js/andaime.js, o teste e as pranchas): avalia a família com os parâmetros dados */
    avaliar: function (famId, valores, tipoId) {
      var F = global.Familia || dep("Familia", "familia.js"), f = null, i;
      for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
      if (!f || !F) return null;
      return F.avaliar(f, tipoId || (f.tipos[0] || {}).id, valores || {});
    }
  };
  global.FamiliasAndaime = FamiliasAndaime;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasAndaime;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

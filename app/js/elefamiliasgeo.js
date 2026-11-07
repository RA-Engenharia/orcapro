/* =====================================================================
 * elefamiliasgeo.js — GEOMETRIA das famílias elétricas v2 (lote L2a, 06/11/2026)
 *
 * Pedido do Rogério: família "igualzinha ao produto real" — volumetria de produto de loja, não bloco. Aqui ficam só as FORMAS
 * (o motor puro, ES5, sem DOM): caixas de embutir (PVC e metálica), placas, tampa da octogonal, dispositivos DIN
 * (disjuntor, DR, DPS, pente, trilho, barramento de neutro/terra) e o quadro montado. Os NÚMEROS (cotas, fonte, nível) não estão
 * aqui: vêm de js/elecatalogodados.js e chegam como parâmetros de cada função, em METROS. js/elefamilias.js define as famílias
 * (parâmetros, tipos do catálogo, conectores) e chama estas formas.
 *
 * FERRAMENTAS: a cena do js/mobgeo.js (Mob.cena()): caixa, caixaR, cil, cilH, torno, prisma, bandeja. Cada função desenha NA CENA
 * recebida, na origem LOCAL da peça (a família move a peça para a Altura_montagem). Nenhum NaN: toda cota passa por num().
 *
 * ORIGENS (iguais às de js/familiasra.js, para a peça trocar de lugar sem o resto notar):
 *   · caixa de embutir e placa: Z = 0 na face da parede; o corpo da caixa fica ATRÁS (Z < 0) e a boca abre para +Z; Y no centro.
 *   · caixa octogonal e tampa: Y = a face de baixo da laje/forro (a boca abre para baixo); o corpo sobe para dentro da laje.
 *   · dispositivo DIN: Z = 0 no plano de fixação (o fundo do dispositivo, sobre o trilho), a frente em +Z; X e Y no centro.
 *   · quadro: Z = 0 no fundo (a parede), a frente em +Z; Y no centro (o mesmo do ra-quadro-distribuicao).
 *
 * O QUE É INTERPRETAÇÃO (a ficha não diz): a posição dos recortes (knockouts), o ressalto das orelhas, as nervuras, o desenho do
 * manípulo e dos bornes, a cor do botão de teste do DR (amarelo, usual). Cada uma está dita no comentário de onde é usada;
 * a cota que o catálogo traz não é mexida aqui.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var MM = 0.001;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* nomes de material = chaves do FAM_PBR do js/bim.js (bloco ELÉTRICA V2) */
  var MAT = {
    PVC_AM: "pvc amarelo caixa", PVC_LJ: "pvc laranja reforçado", PVC: "pvc", GALV: "aço galvanizado estampado", BRANCO: "plástico branco", ACRIL: "acrílico translúcido",
    CINZA_DIN: "plástico cinza din", MANIP: "manípulo preto", MANIP_VM: "manípulo vermelho", COBRE: "cobre", LATAO: "latão borne",
    AZUL: "isolação azul", VERDE: "isolação verde-amarela", PRETA: "isolação preta", VERMELHA: "isolação vermelha", BRANCA: "isolação branca", CINZA: "isolação cinza",
    FUME: "policarbonato fumê", ESCURO: "borracha preta", METAL: "metal cromado", BOTAO: "botão de teste amarelo", DPS_OK: "indicador dps verde", QUADRO_METAL: "metal branco", DOBRADICA: "aço galvanizado"
  };

  /* ------------------------------------------------------------ PEQUENAS FERRAMENTAS */
  /* caixa CENTRADA nos três eixos (a caixa do Mob tem a base em y) */
  function box(c, mat, cx, cy, cz, dx, dy, dz) { c.caixa(mat, cx, cy - dy / 2, cz, dx, dy, dz); }
  /* disco chato centrado, com o eixo em x, y ou z */
  function disco(c, mat, x, y, z, r, esp, eixo, seg) {
    if (eixo === "y") c.cil(mat, x, y - esp / 2, z, r, esp, { seg: seg || 16 });
    else c.cilH(mat, x, y, z, r, esp, eixo, { seg: seg || 16 });
  }
  /* TAMPÃO PRÉ-CORTADO (knockout) na face de uma caixa: um anel escuro (a ranhura do tampão) e o disco do material por cima, 0,5 mm
     saliente. (x,y,z) = centro na superfície; eixo = normal da face; s = +1/−1 o lado para fora. */
  function ko(c, mat, x, y, z, r, eixo, s) {
    var o = { x: x, y: y, z: z }, o2 = { x: x, y: y, z: z };
    o[eixo] += s * 0.00025; o2[eixo] += s * 0.0005;
    disco(c, MAT.ESCURO, o.x, o.y, o.z, r + 0.0009, 0.0005, eixo, 18);
    disco(c, mat, o2.x, o2.y, o2.z, r, 0.001, eixo, 18);
  }

  /* ------------------------------------------------------------ TEXTO EM PIXEL (marcas gravadas: C16, C1, DR, DPS, T) */
  var FONTE = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"], "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"], "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
    "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"], "G": ["011", "100", "101", "101", "011"], "P": ["110", "101", "110", "100", "100"],
    "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"], "I": ["111", "010", "010", "010", "111"],
    "Q": ["111", "101", "101", "111", "001"], "-": ["000", "000", "111", "000", "000"]
  };
  /* largura do texto (m) para a altura h */
  function larguraTexto(str, h) { var n = String(str || "").length; return n ? (n * 4 - 1) * (h / 5) : 0; }
  /* texto(c, mat, str, xc, yc, z, h, dz): glifos 3×5 em caixas, na face de normal +Z em z, centrado em (xc, yc), h = altura total */
  function texto(c, mat, str, xc, yc, z, h, dz) {
    str = String(str == null ? "" : str).toUpperCase();
    if (!str) return;
    var px = h / 5, w = larguraTexto(str, h), x0 = xc - w / 2, y0 = yc + h / 2, i, r, k;
    for (i = 0; i < str.length; i++) {
      var g = FONTE[str.charAt(i)]; if (!g) continue;
      for (r = 0; r < 5; r++) {
        k = 0;
        while (k < 3) {
          if (g[r].charAt(k) === "1") {
            var k2 = k; while (k2 + 1 < 3 && g[r].charAt(k2 + 1) === "1") k2++;
            var n = k2 - k + 1;
            box(c, mat, x0 + (i * 4 + k + n / 2) * px, y0 - (r + 0.5) * px, z + num(dz, 0.0003) / 2, n * px, px, num(dz, 0.0003));
            k = k2 + 1;
          } else k++;
        }
      }
    }
  }

  /* ============================================================ CAIXA RETANGULAR (4x2 / 4x4), PVC ou metálica
   * p: { W, H (corpo, sem as orelhas), D, t (parede), yc, orelha (quanto a orelha passa do corpo, 0 = sem), furoV, furoH (distância
   *      entre os furos das orelhas; 0 = não tem), metal, dn (DN do eletroduto: o tampão tem DN + 2 mm), kind "4x2" | "4x4", mat, matInt }
   * O CORPO É OCO: casca de parede t com a cavidade aberta para +Z (Mob.bandeja) — de frente se vê o fundo e os tampões de dentro.
   * INTERPRETAÇÃO (a ficha Tigre só dá A, B, C, F e F1): o corpo é o retângulo nominal 4″×2″ / 4″×4″ e a orelha é a aba da boca que
   * passa dele; o furo da orelha é o furo do parafuso da espelho, num pino (boss) dentro do corpo, na distância F do catálogo. */
  function caixaRet(c, p) {
    var W = p.W, H = p.H, D = p.D, t = p.t, yc = p.yc, metal = !!p.metal, mat = p.mat, matI = p.matInt || p.mat;
    var rc = metal ? 0.0015 : 0.003;
    var ext = Mob.contornoRR(W, H, rc, 3), inte = Mob.contornoRR(W - 2 * t, H - 2 * t, Math.max(0.0003, rc - t * 0.5), 3);
    c.bandeja(mat, matI, 0, yc, -D, ext, inte, D, t, { rotX: 90 });
    var furos = [], fv = num(p.furoV, 0), fh = num(p.furoH, 0), sx, sy;
    if (fv > 0) { if (fh > 0) { for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) furos.push([sx * fh / 2, sy * fv / 2]); } else { furos.push([0, fv / 2]); furos.push([0, -fv / 2]); } }
    /* orelhas: a aba da boca que passa do corpo (só a PVC; a metálica tem a aba para dentro) */
    if (num(p.orelha, 0) > 0.0003) {
      var e = p.orelha, xs = fh > 0 ? [-fh / 2, fh / 2] : [0];
      for (sy = -1; sy <= 1; sy += 2) xs.forEach(function (x) { box(c, mat, x, yc + sy * (H / 2 + e / 2 - 0.0004), -0.0015, 0.014, e + 0.0008, 0.003); });
    }
    /* o furo do parafuso: pino cilíndrico dentro do corpo, ligado à parede por uma nervura, com o furo escuro na ponta */
    furos.forEach(function (f) {
      var sgn = f[1] >= 0 ? 1 : -1, yi = H / 2 - t;
      if (metal) {
        /* aba dobrada para dentro, com o furo roscado */
        var yIn = Math.abs(f[1]) - 0.0055, h2 = yi - yIn;
        if (h2 > 0.0005) box(c, mat, f[0], yc + sgn * (yIn + h2 / 2), -0.006, 0.013, h2, 0.0012);
        disco(c, MAT.ESCURO, f[0], yc + f[1], -0.0053, 0.0017, 0.0006, "z", 12);
      } else {
        c.cilH(mat, f[0], yc + f[1], -0.009, 0.0036, 0.018, "z", { seg: 14 });
        var ya = Math.abs(f[1]) + 0.0036, hr = yi - ya;
        if (hr > 0.0004) box(c, mat, f[0], yc + sgn * (ya + hr / 2), -0.009, 0.006, hr, 0.018);
        disco(c, MAT.ESCURO, f[0], yc + f[1], -0.0004, 0.0017, 0.0009, "z", 12);
      }
    });
    /* nervuras no fundo (PVC): duas barras horizontais por fora, como na caixa Tigre */
    if (!metal) { box(c, mat, 0, yc + H * 0.28, -D - 0.0008, W - 2 * t - 0.004, 0.0016, 0.0016); box(c, mat, 0, yc - H * 0.28, -D - 0.0008, W - 2 * t - 0.004, 0.0016, 0.0016); }
    /* tampões: fundo, laterais, topo e base. Diâmetro = DN + 2 mm (modelagem: o catálogo dá só o tamanho máximo da entrada) */
    var r = (num(p.dn, 25) + 2) / 2 * MM, zf = -D, zi = -D + t, zm = -D / 2;
    /* fundo: 4×2 = um tampão do DN no centro e dois de 1/2″ (DN 20) acima e abaixo, como na ficha; 4×4 = cinco (quatro nos cantos e o do centro) */
    var r20 = Math.min(r, 0.011);
    var fundo = p.kind === "4x4" ? [[0, 0, r], [-0.027, 0.022, r20], [0.027, 0.022, r20], [-0.027, -0.022, r20], [0.027, -0.022, r20]] : [[0, 0, r], [0, 0.0257, r20], [0, -0.0257, r20]];
    fundo.forEach(function (q) { ko(c, mat, q[0], yc + q[1], zf, q[2], "z", -1); ko(c, mat, q[0], yc + q[1], zi, q[2], "z", 1); });
    var lat = p.kind === "4x4" ? [-0.025, 0.025] : [-0.0255, 0.0255];
    [-1, 1].forEach(function (s) { lat.forEach(function (yy) { ko(c, mat, s * W / 2, yc + yy, zm, r, "x", s); ko(c, mat, s * (W / 2 - t), yc + yy, zm, r, "x", -s); }); });
    var topo = p.kind === "4x4" ? [-0.025, 0.025] : [0];
    [-1, 1].forEach(function (s) { topo.forEach(function (xx) { ko(c, mat, xx, yc + s * H / 2, zm, Math.min(r, W / 2 - 0.004), "y", s); ko(c, mat, xx, yc + s * (H / 2 - t), zm, Math.min(r, W / 2 - 0.004), "y", -s); }); });
  }

  /* ============================================================ CAIXA OCTOGONAL (fundo móvel, laje)
   * p: { Dc (corpo), Dt (de ponta a ponta das orelhas; = Dc se não tem), D, t, yc (face de baixo da laje), recuo (do fundo móvel, m),
   *      metal, dn, mat }. PVC: corpo redondo (como no desenho da ficha Tigre); metálica: oito faces. A boca abre para BAIXO. */
  function caixaOct(c, p) {
    var Dc = p.Dc, D = p.D, t = p.t, yc = p.yc, mat = p.mat, ro = Dc / 2, ri = ro - t, metal = !!p.metal, recuo = Math.max(0, Math.min(num(p.recuo, 0), D - 2 * t - 0.01));
    var yFundo = yc + D - recuo - t;   /* face de baixo do fundo móvel */
    if (!metal) {
      c.torno(mat, 0, 0, 0, [[ri, yc], [ro, yc], [ro, yc + D], [ri, yc + D], [ri, yc]], { seg: 36, aberto: true });
      c.cil(mat, 0, yFundo, 0, ri - 0.0003, t, { seg: 36 });
    } else {
      var a = ri, lado = 2 * (a + t) * Math.tan(Math.PI / 8) + 0.0006, k;
      for (k = 0; k < 8; k++) c.grupo(0, 0, 0, k * 45, function (g) { g.caixa(mat, 0, yc, a + t / 2, lado, D, t); });
      c.cil(mat, 0, yFundo, 0, (a - 0.0002) / Math.cos(Math.PI / 8), t, { seg: 8, rotY: -22.5 });
    }
    /* orelhas ao longo de X: aba na boca, com o furo do parafuso escuro */
    var Dt = num(p.Dt, Dc), ext = (Dt - Dc) / 2;
    if (!metal && ext > 0.0004) {
      [-1, 1].forEach(function (s) {
        var larg = ext + 0.002, cx = s * (ro - 0.002 + larg / 2);   /* a ponta da orelha fica em Dt/2: o diâmetro de ponta a ponta é o da ficha */
        box(c, mat, cx, yc + 0.0015, 0, larg, 0.003, 0.012);
        disco(c, MAT.ESCURO, s * (Dt / 2 - 0.0045), yc - 0.0001, 0, 0.0021, 0.0006, "y", 14);
      });
    }
    if (metal) {
      [-1, 1].forEach(function (s) {
        box(c, mat, s * (a - 0.006), yc + D - 0.012, 0, 0.012, 0.0012, 0.012);
        disco(c, MAT.ESCURO, s * (a - 0.006), yc + D - 0.0114, 0, 0.0021, 0.0006, "y", 12);
      });
    }
    /* tampões do fundo móvel: quatro, em losango, nas duas faces; mais seis na lateral (±Z e as diagonais; as orelhas ficam em ±X) */
    var r = (num(p.dn, 25) + 2) / 2 * MM, kk;
    [[0.02, 0], [-0.02, 0], [0, 0.02], [0, -0.02]].forEach(function (q) {
      ko(c, mat, q[0], yFundo, q[1], r, "y", -1);
      ko(c, mat, q[0], yFundo + t, q[1], r, "y", 1);
    });
    var rad = metal ? a + t : ro;
    [0, 180, 45, 135, 225, 315].forEach(function (ang) {
      c.grupo(0, 0, 0, ang, function (g) { ko(g, mat, 0, yc + D * 0.55, rad, Math.min(r, 0.011), "z", 1); });
    });
    void kk;
  }

  /* ============================================================ PLACA (espelho) 4x2 / 4x4
   * p: { w, h (a placa na posição de uso), e (espessura), yc, postos: [[x, y]…] (centros), jan: [w, h] (a janela do módulo), cega: bool,
   *      cheio: "vazio" | "cego" }  — Z = 0 na parede, a placa sai para +Z.
   * Bordas arredondadas em dois degraus (chanfro): a placa de baixo com o contorno cheio e a de cima 0,8 mm menor por lado. Cada posto
   * é uma janela escura (o REBAIXO do módulo) — o módulo cego entra por cima quando pedido. */
  function placa(c, p) {
    var w = p.w, h = p.h, e = p.e, yc = p.yc, raio = Math.min(0.008, Math.min(w, h) / 4);
    var e1 = e * 0.6, e2 = e - e1, mat = MAT.BRANCO;
    c.prisma(mat, 0, yc, 0, Mob.contornoRR(w, h, raio, 4), e1, { rotX: 90 });
    c.prisma(mat, 0, yc, e1, Mob.contornoRR(w - 0.0016, h - 0.0016, Math.max(0.0005, raio - 0.0008), 4), e2, { rotX: 90 });
    var jw = num(p.jan && p.jan[0], 0.0265), jh = num(p.jan && p.jan[1], 0.0515);
    arr(p.postos).forEach(function (q) {
      box(c, MAT.ESCURO, q[0], yc + q[1], e + 0.0001, jw, jh, 0.0004);                 /* o rebaixo: janela escura */
      if (p.cheio === "cego") { box(c, mat, q[0], yc + q[1], e + 0.001, jw - 0.0016, jh - 0.0016, 0.0022); }
    });
  }

  /* ============================================================ TAMPA DA OCTOGONAL (de laje, cega ou com o furo do plafon)
   * p: { d (diâmetro), e, yc (face de baixo da laje), furo (diâmetro do furo central, 0 = cega) } — fica logo abaixo da face da laje. */
  function tampaOct(c, p) {
    var R = p.d / 2, e = p.e, y0 = p.yc - e, rh = num(p.furo, 0) / 2, mat = p.mat || MAT.PVC_AM, ch = Math.min(0.0012, e * 0.5);
    if (rh > 0.0005) c.torno(mat, 0, y0, 0, [[rh, e], [rh, 0], [R - ch, 0], [R, ch], [R, e], [rh, e]], { seg: 40, aberto: true });
    else c.torno(mat, 0, y0, 0, [[0, 0], [R - ch, 0], [R, ch], [R, e], [0, e]], { seg: 40 });
    /* os dois parafusos nas orelhas (a tampa cobre a orelha: o parafuso aparece) */
    [-1, 1].forEach(function (s) { disco(c, MAT.METAL, s * (R - 0.0075), y0 - 0.0003, 0, 0.0028, 0.0006, "y", 12); disco(c, MAT.ESCURO, s * (R - 0.0075), y0 - 0.0007, 0, 0.0009, 0.0004, "y", 8); });
  }

  /* ============================================================ DISPOSITIVO DIN (disjuntor, DR, DPS)
   * o: { W (largura = polos × 17,7), Ht (altura total), Dc (corpo atrás da face), Dt (profundidade total), Hf (altura da face), gh (rasgo do
   *      trilho, 35,5), gd (profundidade do rasgo), polos, tipo "disj"|"dr"|"dps", rotulo, mp (cor do manípulo: "preto"|"vermelho") }
   * Corpo em duas partes (como o Steck): a de TRÁS (altura total, com o rasgo do trilho de 35 mm no fundo) e a da FRENTE (só a face, 44,8 mm,
   * que passa pela janela do espelho). O manípulo, a janela de identificação e os bornes de parafuso (em cima e embaixo, com a boca do fio) saem
   * do desenho do catálogo; a cor do botão de teste do DR (amarelo) é usual — a ficha não diz. */
  function dispDin(c, o) {
    var W = o.W, Ht = o.Ht, Dc = o.Dc, Dt = o.Dt, Hf = o.Hf, gh = num(o.gh, 0.0355), gd = num(o.gd, 0.0055), n = Math.max(1, o.polos || 1), P = 0.0177;
    var cor = MAT.CINZA_DIN, preto = o.mp === "vermelho" ? MAT.MANIP_VM : MAT.MANIP;
    var zf = o.tipo === "dps" ? Dt - 0.0024 : Dt - 0.0055;   /* a face da frente; o manípulo (DPS: a nervura) passa dela e fecha a profundidade total */
    /* parte de trás, com o rasgo do trilho */
    var hs = Ht / 2 - gh / 2;
    box(c, cor, 0, gh / 2 + hs / 2, Dc / 2, W, hs, Dc);
    box(c, cor, 0, -(gh / 2 + hs / 2), Dc / 2, W, hs, Dc);
    box(c, cor, 0, 0, (gd + Dc) / 2, W, gh, Dc - gd);
    /* parte da frente (face), com cantos suaves */
    c.caixaR(cor, 0, -Hf / 2, (Dc + zf) / 2, W - 0.0004, Hf, zf - Dc, 0.0016, { k: 2 });
    /* bornes: parafuso na face do corpo (acima e abaixo da face) e a boca do fio na ponta */
    var yb = (Hf / 2 + Ht / 2) / 2, i;
    for (i = 0; i < n; i++) {
      var xi = (i - (n - 1) / 2) * P;
      [-1, 1].forEach(function (s) {
        disco(c, MAT.LATAO, xi, s * yb, Dc + 0.0003, 0.0027, 0.0008, "z", 14);
        box(c, MAT.ESCURO, xi, s * yb, Dc + 0.0008, 0.0038, 0.0006, 0.0004);
        box(c, MAT.ESCURO, xi, s * (Ht / 2 - 0.00025), Dc - 0.0085, 0.0085, 0.0005, 0.0075);   /* a boca do fio, rente à ponta do corpo */
      });
    }
    var yl = Hf / 4 - 0.0008;   /* manípulo no terço de cima da face */
    if (o.tipo === "disj") {
      for (i = 0; i < n; i++) {
        var xl = (i - (n - 1) / 2) * P;
        box(c, MAT.ESCURO, xl, yl, zf + 0.0001, 0.0105, 0.0185, 0.0004);                     /* o rasgo do manípulo */
        box(c, preto, xl, yl + 0.0012, zf + 0.00275, 0.0078, 0.0138, 0.0055);                 /* o manípulo */
      }
      if (n > 1) box(c, preto, 0, yl + 0.0012 + 0.0069 - 0.0016, zf + 0.00275, (n - 1) * P + 0.0078, 0.0032, 0.0055);   /* a ponte que liga os manípulos */
      var jw = Math.min(W - 0.004, 0.0145);
      box(c, MAT.ACRIL, 0, -Hf / 4 - 0.0006, zf + 0.0002, jw, 0.0078, 0.0005);                 /* a janela de identificação */
      texto(c, MAT.ESCURO, o.rotulo, 0, -Hf / 4 - 0.0006, zf + 0.0004, 0.0032, 0.0003);
    } else if (o.tipo === "dr") {
      box(c, MAT.ESCURO, -W / 2 + 0.0105, yl, zf + 0.0001, 0.0105, 0.0185, 0.0004);
      box(c, preto, -W / 2 + 0.0105, yl + 0.0012, zf + 0.00275, 0.0078, 0.0138, 0.0055);
      if (n > 2) box(c, preto, -W / 2 + 0.0105 + 0.0177, yl + 0.0012, zf + 0.00275, 0.0078, 0.0138, 0.0055);   /* 4P: o segundo manípulo na outra metade */
      var xt = W / 2 - 0.0095;
      box(c, MAT.BOTAO, xt, yl + 0.0012, zf + 0.0014, 0.0085, 0.0085, 0.0028);                 /* botão de teste (cor usual) */
      texto(c, MAT.ESCURO, "T", xt, yl + 0.0012, zf + 0.0028, 0.0045, 0.0003);
      var jw2 = Math.min(W - 0.006, 0.020);
      box(c, MAT.ACRIL, 0, -Hf / 4 - 0.0006, zf + 0.0002, jw2, 0.0078, 0.0005);
      texto(c, MAT.ESCURO, o.rotulo, 0, -Hf / 4 - 0.0006, zf + 0.0004, 0.0032, 0.0003);
    } else {   /* DPS: o cartucho com a janela de indicação (verde = em ordem) e a nervura de puxar */
      box(c, MAT.ESCURO, 0, yl + 0.0016, zf + 0.0001, 0.0105, 0.0072, 0.0004);
      box(c, MAT.DPS_OK, 0, yl + 0.0016, zf + 0.0003, 0.0082, 0.0050, 0.0004);
      box(c, MAT.CINZA_DIN, 0, -Hf / 4 + 0.0022, zf + 0.0012, W - 0.006, 0.0016, 0.0024);
      box(c, MAT.CINZA_DIN, 0, -Hf / 4 - 0.0014, zf + 0.0012, W - 0.006, 0.0016, 0.0024);
      texto(c, MAT.ESCURO, o.rotulo, 0, -Hf / 4 + 0.0004, zf + 0.0004, 0.0032, 0.0003);
    }
  }

  /* BARRAMENTO PENTE (fase): barra de cobre com a capa isolante e os dentes que entram nos bornes de cima. o: { L, polos, passo, esp, cor } */
  function pente(c, o) {
    var L = o.L, n = Math.max(1, o.polos), P = o.passo, esp = Math.max(0.0008, o.esp), i;
    box(c, MAT.COBRE, 0, 0, 0.004, L, 0.006, esp * 2);                                        /* a barra de cobre */
    box(c, o.cor || MAT.VERMELHA, 0, 0.0035, 0.004, L, 0.0085, 0.011);                       /* a capa isolante, por cima */
    for (i = 0; i < n; i++) box(c, MAT.COBRE, (i - (n - 1) / 2) * P, -0.0085, 0.004, 0.0035, 0.0145, esp * 2);   /* o dente que entra no borne */
    box(c, MAT.ESCURO, 0, 0.0035, 0.0097, L - 0.004, 0.0004, 0.0006);                        /* a ranhura de corte na capa */
  }

  /* TRILHO DIN 35 × 7,5 (perfil chapéu), ao longo de X, com as fendas oblongas. o: { L, esp, w (35), h (7,5) } — Z = 0 na face de baixo, para +Z. */
  function trilho(c, o) {
    var L = o.L, e = Math.max(0.0006, o.esp), w = o.w, h = o.h, mat = MAT.GALV, hw = 0.0125, i;
    box(c, mat, 0, -(hw + (w / 2 - hw) / 2), e / 2, L, w / 2 - hw, e);                        /* aba de baixo (−Y) */
    box(c, mat, 0, (hw + (w / 2 - hw) / 2), e / 2, L, w / 2 - hw, e);                         /* aba de cima (+Y) */
    box(c, mat, 0, -hw, h / 2, L, e, h); box(c, mat, 0, hw, h / 2, L, e, h);                 /* as duas paredes do chapéu */
    box(c, mat, 0, 0, h - e / 2, L, hw * 2 + e, e);                                           /* o topo do chapéu */
    var passo = 0.025, nf = Math.floor((L - 0.02) / passo);
    for (i = 0; i <= nf; i++) box(c, MAT.ESCURO, -L / 2 + 0.01 + i * passo, 0, h + 0.0001, 0.0052, 0.0075, 0.0003);   /* fendas de fixação */
  }

  /* BARRAMENTO DE NEUTRO OU TERRA: base isolante (azul = neutro, verde = terra), barra de latão e os bornes de parafuso. o: { L, cor }
     X ao longo do comprimento, bornes para +Z; Y no centro; Z = 0 no fundo. */
  function barraNT(c, o) {
    var L = o.L, base = o.cor === "azul" ? MAT.AZUL : MAT.VERDE, i, n = Math.max(2, Math.floor((L - 0.008) / 0.0095));
    box(c, base, 0, 0, 0.004, L, 0.014, 0.008);                                               /* a base isolante */
    box(c, MAT.LATAO, 0, 0, 0.0105, L - 0.004, 0.0096, 0.0055);                               /* a barra de latão (seção do catálogo: 9,6 × ...) */
    for (i = 0; i < n; i++) {
      var x = -((n - 1) * 0.0095) / 2 + i * 0.0095;
      disco(c, MAT.METAL, x, 0, 0.0136, 0.0027, 0.0012, "z", 12);                             /* a cabeça do parafuso do borne */
      box(c, MAT.ESCURO, x, 0, 0.0143, 0.0036, 0.0006, 0.0003);
    }
    box(c, base, -L / 2 + 0.002, 0, 0.0095, 0.004, 0.014, 0.011); box(c, base, L / 2 - 0.002, 0, 0.0095, 0.004, 0.014, 0.011);   /* os batentes das pontas */
  }

  /* ============================================================ QUADRO DE DISTRIBUIÇÃO MONTADO
   * p: { L, A (externos, com a aba), D, aba (0 = sobrepor), t, yc, metal, rows, capRow, itens (de EleFamilias.montarQuadro), portaAberta,
   *      barraN, barraT (comprimentos das barras do catálogo, m) }
   * Peças: corpo oco, aba de embutir (moldura), trilho DIN por fileira, espelho com a janela de cada fileira, os dispositivos na ordem de
   * `itens`, a etiqueta Cn de cada um, as barras de neutro (azul) e de terra (verde) e a porta (fechada ou aberta). */
  var P17 = 0.0177, ZD = 0.005;   /* passo do módulo; Z do fundo dos dispositivos (o trilho de 7,5 mm cabe no rasgo de 5,5 mm do dispositivo) */
  function quadro(c, p) {
    var L = p.L, A = p.A, D = p.D, aba = num(p.aba, 0), t = p.t, yc = p.yc, metal = !!p.metal;
    var bw = L - 2 * aba, bh = A - 2 * aba, zPorta = D - 0.003;
    var mat = metal ? MAT.QUADRO_METAL : MAT.BRANCO;
    var ext = Mob.contornoRR(bw, bh, 0.003, 3), inte = Mob.contornoRR(bw - 2 * t, bh - 2 * t, 0.0005, 3);
    c.bandeja(mat, mat, 0, yc, 0, ext, inte, zPorta, t, { rotX: 90 });
    if (aba > 0.001) {   /* a aba de embutir: moldura de 4 faixas na boca */
      var ez = 0.003;
      box(c, mat, 0, yc + bh / 2 + aba / 2, D - ez / 2 - 0.0, L, aba, ez); box(c, mat, 0, yc - bh / 2 - aba / 2, D - ez / 2, L, aba, ez);
      box(c, mat, -(bw / 2 + aba / 2), yc, D - ez / 2, aba, bh, ez); box(c, mat, bw / 2 + aba / 2, yc, D - ez / 2, aba, bh, ez);
    }
    var rows = Math.max(1, p.rows), capRow = Math.max(1, p.capRow), hi = bh - 2 * t, bandH = hi / rows;
    var Hs = Math.min(0.095, bandH - 0.012), sw = capRow * P17 + 0.028, winW = capRow * P17, zEsp = ZD + 0.050, k;
    sw = Math.min(sw, bw - 2 * t - 0.012);
    var yk = [];
    for (k = 0; k < rows; k++) yk.push(yc + hi / 2 - k * bandH - 0.005 - Hs / 2);
    for (k = 0; k < rows; k++) {
      var y0 = yk[k];
      c.grupo(0, y0, 0, 0, function (g) {
        trilho(g, { L: sw - 0.004, esp: 0.001, w: 0.035, h: 0.0075 });
        /* o espelho: a tampa interna com a janela de 45 mm da fileira (peças de cima, de baixo e as duas laterais) */
        var hw2 = (Hs - 0.045) / 2;
        box(g, MAT.BRANCO, 0, 0.0225 + hw2 / 2, zEsp + 0.00125, sw, hw2, 0.0025);
        box(g, MAT.BRANCO, 0, -0.0225 - hw2 / 2, zEsp + 0.00125, sw, hw2, 0.0025);
        var lat = (sw - winW) / 2;
        box(g, MAT.BRANCO, -(winW / 2 + lat / 2), 0, zEsp + 0.00125, lat, 0.045, 0.0025);
        box(g, MAT.BRANCO, winW / 2 + lat / 2, 0, zEsp + 0.00125, lat, 0.045, 0.0025);
      });
    }
    /* os dispositivos (e as tampas cegas da reserva) */
    arr(p.itens).forEach(function (it) {
      var y0 = yk[it.fileira]; if (y0 == null) return;
      var xc = -winW / 2 + (it.coluna + it.modulos / 2) * P17, zDev = ZD;
      c.grupo(xc, y0, zDev, 0, function (g) {
        var d = it.dim;
        if (it.tipo === "reserva") {
          var zf = 0.073 - 0.0055;
          g.caixaR(MAT.CINZA_DIN, 0, -0.0224, (0.039 + zf) / 2, P17 - 0.0006, 0.0448, zf - 0.039, 0.0014, { k: 2 });   /* tampa cega de módulo, rente à frente dos outros */
          return;
        }
        dispDin(g, { W: it.modulos * P17, Ht: d.Ht, Dc: d.Dc, Dt: d.Dt, Hf: d.Hf, gh: 0.0355, gd: 0.0055, polos: it.polos, tipo: it.tipo === "dps" ? "dps" : (it.tipo === "dr" ? "dr" : "disj"), rotulo: it.rotulo, mp: p.manipulo });
      });
      /* a etiqueta: placa branca na faixa de baixo do espelho, com o nome do circuito (Cn), DR, DPS ou geral */
      if (it.etiqueta) {
        var wl = Math.min(it.modulos * P17 - 0.002, 0.0172 + (it.modulos - 1) * 0.004), yl = y0 - 0.0225 - 0.0085;
        box(c, MAT.BRANCA, xc, yl, zEsp + 0.0025 + 0.0002, Math.max(wl, larguraTexto(it.etiqueta, 0.0042) + 0.002), 0.0062, 0.0004);
        texto(c, MAT.ESCURO, it.etiqueta, xc, yl, zEsp + 0.0025 + 0.0004, 0.0042, 0.0003);
      }
    });
    /* as barras de neutro (azul, à esquerda) e de terra (verde, à direita) sob a última fileira */
    var yBar = yk[rows - 1] - Hs / 2 - 0.016, bx = Math.min(bw / 2 - 0.02 - Math.max(num(p.barraN, 0.077), num(p.barraT, 0.077)) / 2, bw * 0.24);
    c.grupo(-bx, yBar, t, 0, function (g) { barraNT(g, { L: num(p.barraN, 0.077), cor: "azul" }); });
    c.grupo(bx, yBar, t, 0, function (g) { barraNT(g, { L: num(p.barraT, 0.077), cor: "verde" }); });
    /* a porta: moldura + vidro fumê (PVC) ou chapa (metal); fecho do lado direito e duas dobradiças à esquerda. Aberta: gira 105° na dobradiça. */
    var env0 = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: c.env.z0, x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    var pw = bw - 0.001, ph = bh - 0.001, pe = 0.003, aberta = !!p.portaAberta, hx = -pw / 2;
    c.grupo(hx, yc, zPorta, aberta ? -105 : 0, function (g) {
      var fr = 0.016;
      if (metal) {
        box(g, mat, pw / 2, 0, pe / 2, pw, ph, pe);
        box(g, mat, pw / 2, 0, pe + 0.0006, pw - 0.012, ph - 0.012, 0.0012);                  /* o friso da chapa */
      } else {
        box(g, mat, pw / 2, ph / 2 - fr / 2, pe / 2, pw, fr, pe); box(g, mat, pw / 2, -ph / 2 + fr / 2, pe / 2, pw, fr, pe);
        box(g, mat, fr / 2, 0, pe / 2, fr, ph - 2 * fr, pe); box(g, mat, pw - fr / 2, 0, pe / 2, fr, ph - 2 * fr, pe);
        box(g, MAT.FUME, pw / 2, 0, pe / 2, pw - 2 * fr, ph - 2 * fr, 0.0016);                /* o policarbonato fumê */
      }
      g.cilH(MAT.METAL, pw - 0.018, 0, pe + 0.0035, 0.0065, 0.007, "z", { seg: 16 });         /* o fecho */
      box(g, MAT.ESCURO, pw - 0.018, 0, pe + 0.0072, 0.009, 0.0016, 0.0006);
      [0.35, -0.35].forEach(function (f) { g.cil(MAT.DOBRADICA, 0.003, ph * f - 0.015, pe / 2, 0.0035, 0.03, { seg: 10 }); });   /* o pino da dobradiça (eixo vertical) */
    });
    /* a caixa envolvente é a do quadro FECHADO (o eletroduto procura as faces dela; a porta aberta é só posição de visualização) */
    if (env0) {
      c.env = env0;
      env0.x0 = Math.min(env0.x0, -pw / 2); env0.x1 = Math.max(env0.x1, pw / 2); env0.y0 = Math.min(env0.y0, yc - ph / 2); env0.y1 = Math.max(env0.y1, yc + ph / 2); env0.z1 = Math.max(env0.z1, D);   /* a porta FECHADA entra na caixa */
    }
  }

  var EleFamiliasGeo = {
    MAT: MAT, caixaRet: caixaRet, caixaOct: caixaOct, placa: placa, tampaOct: tampaOct, dispDin: dispDin, pente: pente, trilho: trilho, barraNT: barraNT,
    quadro: quadro, texto: texto, larguraTexto: larguraTexto, FONTE: FONTE, P17: P17, ZD: ZD
  };
  global.EleFamiliasGeo = EleFamiliasGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = EleFamiliasGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

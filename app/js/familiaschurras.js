/* =====================================================================
 * familiaschurras.js — CHURRASQUEIRAS DE ALVENARIA APARENTE PARA ÁREA GOURMET (R02, 21/10/2026)
 *
 * Duas famílias paramétricas (geometria "mob", como js/familiasmob.js e js/familiasmobcoz.js), pedidas pelo engenheiro como
 * OPÇÕES DE PROJETO da mesma parede (BimOpcoes: conjunto "Churrasqueira", opção A e opção B):
 *   · ra-lazer-churrasqueira-tijolinho-a  — opção A, SIMPLES: bancada de granito preto com cuba e armário de madeira embaixo, forno de
 *     tijolinho aparente com a boca em ARCO ao lado, torre da churrasqueira de tijolinho com a chaminé até o teto.
 *   · ra-lazer-churrasqueira-tijolinho-b  — opção B, MODELADA: marcenaria planejada (armário inferior de madeira, nicho de micro-ondas,
 *     armário superior com porta de vidro), bloco de tijolinho escuro com churrasqueira de inox (grelhas e espetos, gaveta e grade de
 *     ventilação), forno com porta de vidro e nicho de lenha em arco, bancada de granito escuro e coifa preta suspensa.
 *
 * ORIGEM (como as demais encostadas): no piso, no meio da largura total, com o FUNDO em Z = 0 (encostar na parede) e a frente em +Z.
 * Da esquerda para a direita (visto de frente, X crescente): A = bancada, forno, torre; B = marcenaria, churrasqueira, forno, armário.
 * Altura_total (parâmetro de instância) = do piso ao TETO (a chaminé/duto sobe até ela): o gerador da obra a põe na cota do teto.
 *
 * ⚠ Medidas: de PROPORÇÃO de projeto, tiradas das duas imagens de referência do engenheiro (ref_churrasqueira_A_simples / _B_modelada);
 *   não são de catálogo de fabricante. Dizem "medida usual — conferir" na descrição. Sem código SINAPI: orçar à parte.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var FM = dep("FamiliasMob", "familiasmob.js");
  if (!FM || !FM.def) return;
  var MAT = FM.MAT, P = FM.P, T = FM.T, def = FM.def, H = FM.H;
  var TIJ_A = "tijolinho aparente", TIJ_B = "tijolinho escuro", USUAL = "Medida de projeto tirada da imagem de referência — conferir no executivo.";
  function mn(a, b) { return a < b ? a : b; }
  function mx(a, b) { return a > b ? a : b; }

  /* arco de tijolinho (vouçoirs): centro (cx, cy) na face z, raio interno R, espessura t, profundidade pr; de 0 a 180 graus */
  function arco(c, mat, cx, cy, z, R, t, pr, n) {
    n = mx(5, n || 9);
    var larg = Math.PI * (R + t / 2) / n * 1.02;
    for (var i = 0; i < n; i++) {
      var th = (i + 0.5) * 180 / n, rad = th * Math.PI / 180;
      c.caixa(mat, cx + R * Math.cos(rad), cy + R * Math.sin(rad), z, larg, t, pr, { rotZ: th - 90 });
    }
  }
  /* parede de tijolinho: caixa com juntas em relevo leve (faixas horizontais finas) — só o desenho da fiada, sem pesar a cena */
  function tijolo(c, mat, x, y, z, w, h, d, fiadas) {
    c.caixa(mat, x, y, z, w, h, d);
    var n = mn(fiadas || 0, 24);
    for (var i = 1; i <= n; i++) c.caixa(MAT.GRAFITE, x, y + h * i / (n + 1), z + d / 2 + 0.0015, w * 0.999, 0.004, 0.003);
  }
  /* bancada de granito (tampo com leve beiral) */
  function tampo(c, mat, x, y, z, w, pr) { c.caixaR(mat, x, y, z + pr / 2, w, 0.04, pr, 0.004, { k: 1 }); }
  /* armário inferior de madeira com portas e puxadores (frente em +Z) */
  function armarioInf(c, madeira, x, w, alt, pr, portas) {
    var base = 0.08;
    c.caixa(MAT.GRAFITE, x, 0, pr / 2 - 0.03, w - 0.02, base, pr - 0.08);                       // rodapé recuado
    c.caixa(madeira, x, base, pr / 2, w, alt - base, pr);
    var n = mx(1, portas), pw = (w - 0.02) / n;
    for (var i = 0; i < n; i++) {
      var px = x - (w - 0.02) / 2 + pw * (i + 0.5);
      H.porta(c, madeira, px, base + 0.015, pr, pw - 0.006, alt - base - 0.03, 0.02, "friso");
      c.caixa(MAT.PRETO, px + (i % 2 ? -1 : 1) * (pw / 2 - 0.05), alt - 0.2, pr + 0.022, 0.012, 0.16, 0.012);
    }
  }
  function cuba(c, x, y, z, w, pr) {
    c.caixa(MAT.INOX, x, y + 0.002, z, w, 0.012, pr);
    c.caixa(MAT.GRAFITE, x, y + 0.012, z, w - 0.06, 0.004, pr - 0.06);
    c.cil(MAT.INOX, x + w / 2 + 0.07, y, z - pr / 2 + 0.05, 0.018, 0.26, { seg: 10 });
    c.cilH(MAT.INOX, x + w / 2 + 0.07, y + 0.26, z - pr / 2 + 0.12, 0.011, 0.14, "z", { seg: 8 });
  }
  /* churrasqueira de inox na boca (A: só a grelha; B: caixa de inox, grelhas e espetos) */
  function grelha(c, x, y, z, w, pr, espetos) {
    c.caixa(MAT.INOX, x, y, z, w, 0.03, pr);                                                      // braseiro
    var n = mx(3, Math.round(w / 0.06));
    for (var i = 0; i < n; i++) c.cilH(MAT.INOX, x - w / 2 + 0.03 + i * (w - 0.06) / (n - 1), y + 0.16, z, 0.004, pr - 0.04, "z", { seg: 6 });
    c.cilH(MAT.INOX, x, y + 0.16, z - pr / 2 + 0.03, 0.005, w - 0.04, "x", { seg: 6 });
    if (espetos) for (var k = 0; k < 3; k++) {
      var ex = x - w / 2 + 0.09 + k * (w - 0.18) / 2;
      c.cilH(MAT.INOX, ex, y + 0.26, z + 0.04, 0.0045, pr + 0.16, "z", { seg: 6 });
      c.cilH("madeira clara", ex, y + 0.26, z + pr / 2 + 0.16, 0.011, 0.07, "z", { seg: 8 });
    }
  }

  /* TERMINAL (chapéu) da chaminé de tijolinho: 4 pés curtos e laje de pedra em cima; o topo da peça fica em yTop */
function chapeuTijolo(c, mat, x, z, lado, yTop) {
  var pe = 0.10, esp = 0.05, o = lado / 2 - 0.05;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { c.caixa(mat, x + q[0] * o, yTop - esp - pe, z + q[1] * o, 0.09, pe, 0.09); });
  c.caixa(MAT.PEDRA, x, yTop - esp, z, lado + 0.14, esp, lado + 0.14);
}
/* TERMINAL do duto metálico (coifa): quatro pés finos e tampa piramidal preta */
function chapeuDuto(c, x, z, lado, yTop) {
  var pe = 0.10, o = lado / 2 - 0.02;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { c.caixa(MAT.PRETO, x + q[0] * o, yTop - 0.10 - pe, z + q[1] * o, 0.03, pe, 0.03); });
  c.tronco(MAT.PRETO, x, yTop - 0.10, z, lado + 0.14, lado + 0.14, 0.05, 0.05, 0.10);
}
/* RUFO de arremate na telha: colar de chapa (aba) em volta da chaminé na cota da telha; faixa baixa + faixa alta (saia) */
function rufoTelha(c, x, z, w, d, yTelha) {
  c.caixa(MAT.INOX, x, yTelha - 0.03, z, w + 0.20, 0.012, d + 0.20);                          // aba sobre a telha
  c.caixa(MAT.INOX, x, yTelha - 0.03, z + (d + 0.05) / 2, w + 0.05, 0.16, 0.012);             // saia (4 lados)
  c.caixa(MAT.INOX, x, yTelha - 0.03, z - (d + 0.05) / 2, w + 0.05, 0.16, 0.012);
  c.caixa(MAT.INOX, x + (w + 0.05) / 2, yTelha - 0.03, z, 0.012, 0.16, d + 0.05);
  c.caixa(MAT.INOX, x - (w + 0.05) / 2, yTelha - 0.03, z, 0.012, 0.16, d + 0.05);
}

/* ------------------------------------------------------------------ OPÇÃO A — simples */
  def({
    id: "ra-lazer-churrasqueira-tijolinho-a", categoria: "lazer", nome: "Churrasqueira de tijolinho — opção A (simples)",
    descricao: "Churrasqueira de tijolinho aparente com a chaminé até o teto, forno de tijolinho ao lado (boca em arco) e bancada de granito preto com cuba e armário inferior de madeira. " + USUAL,
    parametros: [P("Largura_bancada", "comprimento", 1.80, "Dimensões", "Largura da bancada com cuba. " + USUAL), P("Largura_forno", "comprimento", 0.75, "Dimensões", "Largura do bloco do forno. " + USUAL),
      P("Largura_torre", "comprimento", 0.90, "Dimensões", "Largura da torre da churrasqueira. " + USUAL), P("Profundidade", "comprimento", 0.65, "Dimensões", "Profundidade do bloco de tijolinho. " + USUAL),
      P("Profundidade_bancada", "comprimento", 0.60, "Dimensões", "Profundidade da bancada. " + USUAL), P("Altura_bancada", "comprimento", 0.90, "Dimensões"),
      P("Altura_forno", "comprimento", 1.15, "Dimensões", "Altura do bloco do forno. " + USUAL), P("Boca_largura", "comprimento", 0.60, "Dimensões", "Largura da boca da churrasqueira"),
      P("Boca_altura", "comprimento", 0.45, "Dimensões", "Altura da boca da churrasqueira"), P("Altura_boca", "comprimento", 0.62, "Dimensões", "Cota da base da boca"),
      P("Altura_total", "comprimento", 4.60, "Dimensões", "Do piso ao TOPO do chapéu: a chaminé atravessa a cobertura e sai 0,60 m acima do ponto mais alto da telha/platibanda num raio de 3 m (regra usual — CONFERIR; o gerador da obra a calcula por modelo)", "instancia"),
      P("Cota_telha", "comprimento", 3.70, "Dimensões", "Cota da telha onde a chaminé a atravessa: aí entra o rufo de arremate (o gerador da obra a calcula por modelo)", "instancia"),
      P("Cuba", "simnao", true, "Opções", "Cuba de inox na bancada"),
      P("Tijolo", "material", TIJ_A, "Materiais"), P("Madeira", "material", "madeira nogueira", "Materiais"), P("Granito", "material", "granito preto", "Materiais")],
    tipos: [T("a", "Opção A — bancada 1,80 + forno + torre", {}), T("a-curta", "Opção A curta — bancada 1,40", { Largura_bancada: 1.40 })],
    gerar: function (c, v) {
      var Lb = v.Largura_bancada, Lf = v.Largura_forno, Lt = v.Largura_torre, D = v.Profundidade, Db = mn(v.Profundidade_bancada, D), hb = v.Altura_bancada, Ht = mx(v.Altura_total, 2.4), tij = v.Tijolo;
      var W = Lb + Lf + Lt, x0 = -W / 2, xb = x0 + Lb / 2, xf = x0 + Lb + Lf / 2, xt = x0 + Lb + Lf + Lt / 2;
      /* bancada: armário de madeira, tampo de granito, cuba, azulejo branco atrás */
      armarioInf(c, v.Madeira, xb, Lb, hb - 0.04, Db, mx(2, Math.round(Lb / 0.6)));
      tampo(c, v.Granito, xb, hb - 0.04, 0, Lb + 0.02, Db + 0.03);
      c.caixa(MAT.LOUCA, xb, hb, 0.008, Lb, 0.62, 0.016);                                         // azulejo branco (parede de fundo)
      if (v.Cuba) cuba(c, xb - Lb * 0.18, hb, Db / 2, mn(0.55, Lb * 0.4), mn(0.42, Db - 0.12));
      /* forno de tijolinho: bloco, boca em arco, fundo escuro, base de lenha e capa */
      var hf = mx(v.Altura_forno, 0.9);
      tijolo(c, tij, xf, 0, D / 2, Lf, hf, D, 12);
      var R = mn(0.19, Lf * 0.3), yb = 0.34;
      c.caixa(MAT.PRETO, xf, yb, D + 0.002, R * 2, R + 0.2, 0.012);                              // fundo da boca
      arco(c, tij, xf, yb + 0.2, D, R, 0.07, 0.07, 9);
      c.caixa(MAT.PEDRA, xf, hf, D / 2, Lf + 0.04, 0.04, D + 0.04);                              // capa de pedra
      /* torre da churrasqueira: bloco, boca com grelha, tampa, chaminé de tijolinho até o teto */
      var hboca = v.Altura_boca, bl = mn(v.Boca_largura, Lt - 0.24), ba = v.Boca_altura, hl = hboca + ba + 0.12;
      tijolo(c, tij, xt, 0, D / 2, Lt, hl, D, 18);
      c.caixa(MAT.PRETO, xt, hboca, D + 0.002, bl, ba, 0.012);                                    // boca (fundo escuro)
      grelha(c, xt, hboca + 0.02, (D + 0.12) / 2 - 0.02, bl - 0.04, D - 0.12, false);
      c.caixa(MAT.GRAFITE, xt, hboca + ba, D + 0.004, bl + 0.04, 0.04, 0.012);                    // lintel de ferro
      var hch = mx(0.1, Ht - hl - 0.5 - 0.12), zch = D / 2 - (D - 0.5) / 2;
      c.tronco(tij, xt, hl, D / 2, Lt, D, 0.50, 0.50, 0.5);                                       // capa afunilada
      tijolo(c, tij, xt, hl + 0.5, zch, 0.50, hch, 0.50, mn(30, Math.round(hch / 0.1)));          // chaminé (atravessa a cobertura)
      chapeuTijolo(c, tij, xt, zch, 0.50, Ht);                                                    // terminal (chapéu)
      if (v.Cota_telha > hl + 0.5 && v.Cota_telha < Ht - 0.2) rufoTelha(c, xt, zch, 0.50, 0.50, v.Cota_telha);   // rufo na telha
      c.caixa(MAT.PEDRA, xt, 0, D / 2, Lt + 0.04, 0.05, D + 0.04);                                // soleira
    }
  });

  /* ------------------------------------------------------------------ OPÇÃO B — modelada */
  def({
    id: "ra-lazer-churrasqueira-tijolinho-b", categoria: "lazer", nome: "Churrasqueira de tijolinho — opção B (modelada)",
    descricao: "Bloco de tijolinho escuro com churrasqueira de inox (grelhas e espetos), forno com porta de vidro e nicho de lenha, bancada de granito escuro, coifa preta suspensa e marcenaria planejada (armário inferior de madeira, nicho de micro-ondas, armário superior com porta de vidro). " + USUAL,
    parametros: [P("Largura_marcenaria", "comprimento", 0.95, "Dimensões", "Largura da marcenaria (armário + nicho de micro-ondas). " + USUAL), P("Largura_churrasqueira", "comprimento", 0.95, "Dimensões", "Largura do bloco da churrasqueira. " + USUAL),
      P("Largura_forno", "comprimento", 1.05, "Dimensões", "Largura do bloco do forno com o nicho de lenha. " + USUAL), P("Largura_armario", "comprimento", 0.60, "Dimensões", "Largura do armário da ponta. " + USUAL),
      P("Profundidade", "comprimento", 0.65, "Dimensões", "Profundidade dos blocos de tijolinho. " + USUAL), P("Profundidade_bancada", "comprimento", 0.60, "Dimensões"),
      P("Altura_bancada", "comprimento", 0.90, "Dimensões"), P("Boca_largura", "comprimento", 0.68, "Dimensões", "Largura da boca da churrasqueira de inox"),
      P("Boca_altura", "comprimento", 0.50, "Dimensões", "Altura da boca da churrasqueira de inox"), P("Altura_boca", "comprimento", 0.95, "Dimensões", "Cota da base da boca"),
      P("Altura_total", "comprimento", 4.60, "Dimensões", "Do piso ao TOPO dos chapéus: a chaminé do bloco e o duto da coifa atravessam a cobertura e saem 0,60 m acima do ponto mais alto da telha/platibanda num raio de 3 m (regra usual — CONFERIR; o gerador da obra a calcula por modelo)", "instancia"),
      P("Cota_telha", "comprimento", 3.70, "Dimensões", "Cota da telha onde chaminé e duto a atravessam: aí entra o rufo de arremate (o gerador da obra a calcula por modelo)", "instancia"),
      P("Cota_coifa", "comprimento", 1.62, "Dimensões", "Cota da boca da coifa preta"),
      P("Tijolo", "material", TIJ_B, "Materiais"), P("Madeira", "material", "madeira nogueira", "Materiais"), P("Granito", "material", "granito preto", "Materiais")],
    tipos: [T("b", "Opção B — marcenaria + churrasqueira + forno + armário", {}), T("b-sem-armario", "Opção B sem o armário da ponta", { Largura_armario: 0.30 })],
    gerar: function (c, v) {
      var Lm = v.Largura_marcenaria, Lc = v.Largura_churrasqueira, Lf = v.Largura_forno, La = v.Largura_armario, D = v.Profundidade, Db = mn(v.Profundidade_bancada, D), hb = v.Altura_bancada, Ht = mx(v.Altura_total, 2.6), tij = v.Tijolo, mad = v.Madeira;
      var W = Lm + Lc + Lf + La, x0 = -W / 2, xm = x0 + Lm / 2, xc = x0 + Lm + Lc / 2, xf = x0 + Lm + Lc + Lf / 2, xa = x0 + Lm + Lc + Lf + La / 2;
      /* bancada de granito escuro contínua (menos sobre a coluna da churrasqueira, que é bloco inteiro) */
      tampo(c, v.Granito, xm, hb - 0.04, 0, Lm + 0.02, Db + 0.03);
      tampo(c, v.Granito, xf, hb - 0.04, 0, Lf + 0.02, D + 0.03);
      tampo(c, v.Granito, xa, hb - 0.04, 0, La + 0.02, Db + 0.03);
      /* marcenaria: armário inferior, azulejo, nicho de micro-ondas, armário superior com porta de vidro */
      armarioInf(c, mad, xm, Lm, hb - 0.04, Db, 2);
      c.caixa(MAT.LOUCA, xm, hb, 0.008, Lm, 1.55, 0.016);
      var nw = mn(0.66, Lm - 0.14), nh = 0.46, ny = hb + 0.62, ndp = 0.40;
      c.caixa(mad, xm, ny - 0.02, ndp / 2, nw + 0.04, 0.02, ndp); c.caixa(mad, xm, ny + nh, ndp / 2, nw + 0.04, 0.02, ndp);   // nicho: fundo e topo
      [-1, 1].forEach(function (s) { c.caixa(mad, xm + s * (nw / 2 + 0.01), ny, ndp / 2, 0.02, nh, ndp); });
      c.caixa(MAT.INOX, xm, ny + 0.02, ndp / 2 - 0.02, nw - 0.1, nh - 0.05, ndp - 0.1);           // micro-ondas
      c.caixa(MAT.PRETO, xm - 0.06, ny + 0.05, ndp / 2 + (ndp - 0.1) / 2 - 0.02 + 0.012, nw - 0.3, nh - 0.11, 0.008);   // porta de vidro escuro
      c.caixa(MAT.INOX, xm + (nw - 0.1) / 2 - 0.06, ny + 0.06, ndp / 2 + (ndp - 0.1) / 2 - 0.02 + 0.012, 0.09, nh - 0.13, 0.008);   // painel de comandos
      var uy = ny + nh + 0.1, uh = mn(0.7, Ht - uy - 0.1), uw = Lm - 0.04;
      if (uh > 0.25) {
        c.caixa(mad, xm, uy, 0.17, uw, uh, 0.34);
        c.caixa("vidro", xm, uy + 0.04, 0.345, uw - 0.1, uh - 0.08, 0.01);                          // porta de vidro
        H.cava(c, xm + uw / 2 - 0.06, uy + uh / 2, 0.355, 0.16, MAT.PRETO);
        [[-1, 0], [1, 0]].forEach(function (s) { c.caixa(mad, xm + s[0] * (uw / 2 - 0.04), uy + 0.02, 0.346, 0.03, uh - 0.04, 0.012); });
      }
      /* coluna da churrasqueira: tijolinho escuro até o teto (duto), boca com churrasqueira de inox, gaveta e grade de ventilação */
      var hbloco = mn(Ht - 0.6, 2.25);
      tijolo(c, tij, xc, 0, D / 2, Lc, hbloco, D, 22);
      var zch = D / 2 - (D - 0.5) / 2, hch = mx(0.1, Ht - hbloco - 0.12);                           // chaminé do bloco (atravessa a cobertura)
      c.tronco(tij, xc, hbloco, D / 2, Lc, D, 0.50, 0.50, 0.30);
      tijolo(c, tij, xc, hbloco + 0.30, zch, 0.50, mx(0.05, hch - 0.30), 0.50, mn(30, Math.round(hch / 0.1)));
      chapeuTijolo(c, tij, xc, zch, 0.50, Ht);
      if (v.Cota_telha > hbloco + 0.3 && v.Cota_telha < Ht - 0.2) rufoTelha(c, xc, zch, 0.50, 0.50, v.Cota_telha);
      var bl = mn(v.Boca_largura, Lc - 0.2), ba = v.Boca_altura, yb = v.Altura_boca;
      c.caixa(MAT.PRETO, xc, yb, D + 0.002, bl + 0.06, ba, 0.012);                                  // boca
      c.caixa(MAT.INOX, xc, yb - 0.04, D + 0.004, bl + 0.1, 0.04, 0.012);                          // soleira de inox
      grelha(c, xc, yb + 0.02, (D + 0.1) / 2 - 0.02, bl - 0.04, D - 0.1, true);
      c.caixa(MAT.INOX, xc - 0.12, yb - 0.30, D + 0.003, mn(0.30, Lc - 0.2), 0.14, 0.012);          // gaveta de inox
      c.caixa(MAT.PRETO, xc + 0.12 - 0.12, yb - 0.255, D + 0.012, 0.12, 0.012, 0.012);
      var gy = 0.10, gh = mn(0.42, yb - 0.45), gw = mn(0.42, Lc - 0.2);
      if (gh > 0.12) {
        c.caixa(MAT.PRETO, xc, gy, D + 0.003, gw, gh, 0.012);                                       // grade de ventilação preta
        for (var i = 0; i < 7; i++) c.caixa(MAT.GRAFITE, xc, gy + 0.03 + i * (gh - 0.06) / 6, D + 0.012, gw - 0.04, 0.012, 0.012);
      }
      /* forno: bloco de tijolinho escuro, porta de vidro com moldura preta, nicho de lenha em arco com toras */
      var hf = hb - 0.04;
      tijolo(c, tij, xf, 0, D / 2, Lf, hf, D, 12);
      var fw = mn(0.46, Lf - 0.3), fy = 0.50, fh = 0.34;
      c.caixa(MAT.PRETO, xf, fy - 0.03, D + 0.003, fw + 0.1, fh + 0.06, 0.02);                      // moldura de ferro
      c.caixa("vidro fume", xf, fy, D + 0.016, fw, fh, 0.008);
      c.caixa(MAT.INOX, xf + fw / 2 - 0.03, fy + 0.02, D + 0.026, 0.012, fh - 0.04, 0.012);
      var R = mn(0.20, Lf * 0.22), ly = 0.04;
      c.caixa(MAT.PRETO, xf, ly, D + 0.002, R * 2, R + 0.08, 0.012);                                 // nicho de lenha
      arco(c, tij, xf, ly + 0.08, D, R, 0.06, 0.07, 9);
      for (var j = 0; j < 7; j++) c.cilH("madeira escura", xf - R + 0.05 + (j % 4) * ((R * 2 - 0.1) / 3), ly + 0.03 + Math.floor(j / 4) * 0.07, D - 0.18, 0.035, 0.30, "z", { seg: 8 });
      /* armário da ponta (madeira) */
      armarioInf(c, mad, xa, La, hb - 0.04, Db, mx(1, Math.round(La / 0.5)));
      /* coifa preta suspensa sobre o forno e o armário, com o duto até o teto */
      var cy0 = v.Cota_coifa, cw = mn(0.95, Lf + 0.05), cx = xf + 0.0;
      if (Ht - cy0 > 0.5) {
        c.tronco(MAT.PRETO, cx, cy0, D * 0.55, cw, D * 0.85, 0.36, 0.36, 0.55);
        c.caixa(MAT.PRETO, cx, cy0 + 0.55, D * 0.55, 0.36, mx(0.05, Ht - cy0 - 0.55 - 0.10), 0.36);
        chapeuDuto(c, cx, D * 0.55, 0.36, Ht);
        if (v.Cota_telha > cy0 + 0.6 && v.Cota_telha < Ht - 0.2) rufoTelha(c, cx, D * 0.55, 0.36, 0.36, v.Cota_telha);
        c.caixa(MAT.GRAFITE, cx, cy0, D * 0.55 + D * 0.85 / 2 - 0.004, cw, 0.03, 0.012);          // aba frontal da coifa
      }
      c.caixa(MAT.PEDRA, xc, 0, D / 2, Lc + 0.04, 0.04, D + 0.04);                                   // soleira
    }
  });

  FM.registrar();
  if (typeof module !== "undefined" && module.exports) module.exports = FM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

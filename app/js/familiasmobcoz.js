/* =====================================================================
 * familiasmobcoz.js — COZINHA, BANHO E LAZER da biblioteca RA de mobiliário (19/10/2026)
 *
 * Mesma mecânica do js/familiasmob.js (família com geometria "mob"; gerador em js/mobgeo.js).
 * Aqui entram: marcenaria de cozinha por comprimento (inferior, superior, torre quente, nicho de
 * geladeira), ilha, geladeira, máquina de lavar, bancada de banheiro, banheira de hidromassagem,
 * box de vidro, churrasqueiras, mesa gourmet, espreguiçadeira e guarda-sol.
 *
 * FONTES DAS MEDIDAS DE CATÁLOGO (consultadas em 19/10/2026, anúncios/fichas públicas; o fabricante
 * manda — conferir o modelo comprado). O que não tem fonte aqui é "medida usual de mercado".
 *   · Banheiras: Astra Capri Luxo 150×80×43 e 170×80×43 cm (1 jato + 2 minijatos), Astra Confortare Luxo
 *     180×90×55 cm (3 jatos), Astra Prima Maggiore 180×120×44 cm (6 jatos), Ouro Fino Cristal Duo 170×110×40 cm
 *     (6 jatos) — fichas no www.madeiramadeira.com.br (busca "banheira hidromassagem").
 *   · Geladeira: Brastemp BRE57AK 443 L frost free inverse — 72,5 L × 184 A × 70,1 P cm (fichas do
 *     www.buscape.com.br e www.zoom.com.br); BRE57FK 447 L — 70 × 184,5 × 75,5 cm.
 *   · Lava e seca: Brastemp BNO11AS/AB 11 kg — 60 L × 85 A × 64 P cm (www.brastemp.com.br); LG CV3011BC4A — 60 × 85 × 56 cm.
 *   · Churrasqueira pré-moldada: Begnami "lisas" (portal AECweb, produto 47694) altura 2,20 m, profundidade 50 cm,
 *     boca de 51 cm de altura, larguras externas 55/65/76/85 cm; Refracon "natural" (AECweb 47705). Coifa de
 *     100 × 60 × 70 cm (Largrill, AECweb 18073).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js"), FM = dep("FamiliasMob", "familiasmob.js");
  if (!Mob || !FM) return;
  var H = FM.H, MAT = FM.MAT, P = FM.P, T = FM.T, def = FM.def, USUAL = H.USUAL, clamp = H.clamp;

  var FONTE_BANHEIRA = "Fichas de anúncio em www.madeiramadeira.com.br (Astra Capri Luxo 150×80×43 e 170×80×43; Confortare Luxo 180×90×55; Prima Maggiore 180×120×44) e Ouro Fino Cristal Duo 170×110×40 — consultadas em 19/10/2026; a altura é a externa. Conferir o modelo comprado.";
  var FONTE_GELADEIRA = "Brastemp BRE57AK 443 L: 72,5 × 184 × 70,1 cm (largura × altura × profundidade), fichas em www.buscape.com.br e www.zoom.com.br, 19/10/2026; BRE57FK 447 L: 70 × 184,5 × 75,5 cm. Conferir o manual do modelo comprado.";
  var FONTE_LAVA = "Brastemp BNO11AS/BNO11AB (lava e seca 11 kg): 60 × 85 × 64 cm, www.brastemp.com.br, 19/10/2026; LG CV3011BC4A: 60 × 85 × 56 cm. Conferir o manual do modelo comprado.";
  var FONTE_CHURRAS = "Begnami churrasqueiras lisas (AECweb, produto 47694): altura 2,20 m, profundidade 50 cm, boca de 51 cm, larguras 55/65/76/85 cm; coifa Largrill 100 × 60 × 70 cm (AECweb 18073); consulta de 19/10/2026. Conferir o catálogo do fabricante.";

  /* ---------------------------------------------------------------- PEÇAS DA COZINHA */
  /* tampo (pedra) com aberturas: furos = [{x, larg, prof, z}] — peças em volta, sem boolean */
  function tampoFuros(c, mat, L, D, e, y, zc, furos) {
    var fs = (furos || []).slice().sort(function (a, b) { return a.x - b.x; }), cur = -L / 2, z0 = zc - D / 2, z1 = zc + D / 2;
    fs.forEach(function (f) {
      var xa = f.x - f.larg / 2, xb = f.x + f.larg / 2;
      if (xa - cur > 1e-4) c.caixa(mat, (cur + xa) / 2, y, zc, xa - cur, e, D);
      var zf0 = f.z - f.prof / 2, zf1 = f.z + f.prof / 2;
      if (zf0 - z0 > 1e-4) c.caixa(mat, f.x, y, (z0 + zf0) / 2, f.larg, e, zf0 - z0);
      if (z1 - zf1 > 1e-4) c.caixa(mat, f.x, y, (zf1 + z1) / 2, f.larg, e, z1 - zf1);
      cur = xb;
    });
    if (L / 2 - cur > 1e-4) c.caixa(mat, (cur + L / 2) / 2, y, zc, L / 2 - cur, e, D);
  }
  /* cuba inox embutida (borda rente ao tampo) + torneira gourmet */
  function cuba(c, x, z, yTopo, lar, pro) {
    var prof = 0.20, ext = Mob.contornoRR(lar, pro, 0.03, 4), int = Mob.contornoRR(lar - 0.03, pro - 0.03, 0.02, 4);
    c.bandeja(MAT.INOX, MAT.INOX, x, yTopo - prof, z, ext, int, prof, 0.01);
    var zt = z - pro / 2 - 0.05;
    c.cil(MAT.CROMO, x, yTopo, zt, 0.022, 0.03, { seg: 12 });
    c.cil(MAT.CROMO, x, yTopo + 0.03, zt, 0.014, 0.30, { seg: 10 });
    c.torno(MAT.CROMO, x, yTopo + 0.31, zt, [[0.014, 0], [0.016, 0.012], [0.014, 0.025]], { seg: 10 });
    c.cilH(MAT.CROMO, x, yTopo + 0.325, zt + 0.095, 0.012, 0.19, "z", { seg: 10 });
    c.cil(MAT.CROMO, x, yTopo + 0.25, zt + 0.19, 0.014, 0.08, { seg: 10 });
    c.cil(MAT.CROMO, x + 0.045, yTopo + 0.03, zt, 0.008, 0.07, { seg: 8, rotZ: -30 });
  }
  /* cooktop de vidro com 4 bocas e comandos frontais */
  function cooktop(c, x, z, yTopo, lar, pro, bocas) {
    c.caixaR(MAT.TELA, x, yTopo - 0.002, z, lar, 0.006, pro, 0.003, { k: 1 });
    var pos = bocas === 5 ? [[-0.2, -0.13, 0.085], [0.2, -0.13, 0.07], [-0.2, 0.13, 0.07], [0.2, 0.13, 0.085], [0, 0, 0.055]] : [[-0.14, -0.1, 0.085], [0.14, -0.1, 0.07], [-0.14, 0.12, 0.07], [0.14, 0.12, 0.085]];
    pos.forEach(function (p) {
      c.torno(MAT.GRAFITE, x + p[0] * (lar / 0.58), yTopo + 0.003, z + p[1] * (pro / 0.5), [[p[2], 0], [p[2], 0.003], [p[2] - 0.006, 0.003], [p[2] - 0.006, 0]], { seg: 24, aberto: false });
      c.torno(MAT.PRETO, x + p[0] * (lar / 0.58), yTopo + 0.003, z + p[1] * (pro / 0.5), [[p[2] * 0.45, 0], [p[2] * 0.45, 0.006], [0, 0.006]], { seg: 16 });
    });
    for (var i = 0; i < 4; i++) c.cil(MAT.PRETO, x - 0.18 + i * 0.12, yTopo - 0.002, z + pro / 2 - 0.01, 0.014, 0.006, { seg: 10 });
  }
  /* corpo de armário inferior: rodapé recuado, carcaça, frentes de portas e gavetas */
  function corpoInferior(c, L, D, Ht, e, mat, padrao, z0, miolo) {
    var rod = 0.10, hc = Ht - e - rod, nm = Math.max(1, Math.round(L / 0.6)), wm = L / nm;
    c.caixa(MAT.PRETO, 0, 0, z0 + D / 2 - 0.03, L - 0.04, rod, D - 0.08);
    c.caixa(miolo || mat, 0, rod, z0 + D / 2 - 0.01, L, hc, D - 0.02);
    for (var i = 0; i < nm; i++) {
      var x = -L / 2 + wm * (i + 0.5), gav = padrao === "gavetas" || (padrao === "misto" && i % 3 === 1), zf = z0 + D - 0.02;
      if (gav) {
        var hs = [0.19, 0.27, hc - 0.19 - 0.27 - 0.03], y = rod + 0.01;
        hs.forEach(function (h) { H.porta(c, mat, x, y, zf, wm - 0.008, h, 0.019, "liso"); H.cava(c, x, y + h - 0.035, zf + 0.019, wm * 0.6); y += h + 0.008; });
      } else if (wm > 0.75) {
        [-1, 1].forEach(function (s) { H.porta(c, mat, x + s * (wm - 0.008) / 4, rod + 0.01, zf, (wm - 0.012) / 2, hc - 0.02, 0.019, "liso"); H.cava(c, x + s * 0.02, rod + hc - 0.05, zf + 0.019, 0.01); });
      } else { H.porta(c, mat, x, rod + 0.01, zf, wm - 0.008, hc - 0.02, 0.019, "liso"); H.cava(c, x + (i % 2 ? 1 : -1) * (wm / 2 - 0.05), rod + hc - 0.05, zf + 0.019, 0.01); }
    }
  }
  var P_COZ = function (L) {
    return [P("Comprimento", "comprimento", L, "Dimensões", "Comprimento da bancada (marcenaria sob medida, módulos de ~0,60 m). " + USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões", USUAL), P("Altura", "comprimento", 0.90, "Dimensões", "Do piso ao topo do tampo. " + USUAL),
      P("Espessura_tampo", "comprimento", 0.03, "Dimensões"), P("Padrao", "texto", "misto", "Construção", "portas, gavetas ou misto (um gaveteiro a cada 3 módulos)"),
      P("Com_cuba", "simnao", true, "Construção"), P("Com_cooktop", "simnao", false, "Construção"), P("Corpo", "material", "laca grafite", "Materiais", "Frentes dos armários"), P("Tampo", "material", "quartzo branco", "Materiais", "quartzo branco, granito preto ou marmore branco")];
  };
  def({
    id: "ra-coz-inferior", categoria: "cozinha", nome: "Armário inferior de cozinha (por comprimento)", descricao: "Bancada de cozinha de marcenaria: rodapé recuado, módulos com portas e gaveteiros, tampo de pedra com cuba de inox e torneira e cooktop embutidos (opcionais). O comprimento é o parâmetro; o número de módulos sai dele.",
    parametros: P_COZ(2.40), unidade: "m", quantidade: "Comprimento", quantDesc: "Armário inferior de cozinha em marcenaria",
    tipos: [T("i120", "1,20 m", { Comprimento: 1.20 }), T("i180", "1,80 m com cuba", { Comprimento: 1.80 }), T("i240", "2,40 m com cuba", {}), T("i300", "3,00 m com cuba e cooktop", { Comprimento: 3.00, Com_cooktop: true }), T("i360", "3,60 m com cuba e cooktop", { Comprimento: 3.60, Com_cooktop: true })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura, e = v.Espessura_tampo, furos = [], over = 0.02;
      corpoInferior(c, L, D - over, Ht, e, v.Corpo, v.Padrao, 0);
      var xc = v.Com_cooktop ? -L / 2 + Math.min(0.55, L * 0.3) : 0, xk = L / 2 - Math.min(0.55, L * 0.25);
      var nc = v.Com_cuba && L >= 1.0, nk = v.Com_cooktop && L >= 1.8;
      if (nc) { var xcu = nk ? -L / 2 + Math.min(0.6, L * 0.28) : -L / 2 + Math.max(0.45, L * 0.3); furos.push({ x: xcu, larg: 0.54, prof: 0.42, z: D / 2 + 0.01 }); }
      if (nk) furos.push({ x: xk, larg: 0.56, prof: 0.49, z: D / 2 });
      tampoFuros(c, v.Tampo, L, D, e, Ht - e, D / 2, furos);
      c.caixa(v.Tampo, 0, Ht - e - 0.05, 0.005, L, 0.15 + 0.05, 0.01);                                  // espelho/rodabancada
      if (nc) cuba(c, furos[0].x, furos[0].z, Ht, 0.50, 0.40);
      if (nk) cooktop(c, xk, D / 2, Ht, 0.55, 0.47, 4);
    }
  });
  def({
    id: "ra-coz-superior", categoria: "cozinha", nome: "Armário superior de cozinha (por comprimento)", descricao: "Armário aéreo de cozinha com portas de giro e cava, fundo e prateleira. Cota de base e altura são parâmetros (a base usual fica 0,50 a 0,60 m acima do tampo).",
    parametros: [P("Comprimento", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.35, "Dimensões", USUAL), P("Altura", "comprimento", 0.70, "Dimensões"), P("Cota_base", "comprimento", 1.45, "Restrições", "Do piso à base do armário", "instancia"), P("Corpo", "material", "laca grafite", "Materiais")],
    unidade: "m", quantidade: "Comprimento", quantDesc: "Armário superior de cozinha em marcenaria",
    tipos: [T("s120", "1,20 m", { Comprimento: 1.20 }), T("s180", "1,80 m", { Comprimento: 1.80 }), T("s240", "2,40 m", {}), T("s300", "3,00 m", { Comprimento: 3.00 })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura, y0 = v.Cota_base, nm = Math.max(1, Math.round(L / 0.6)), wm = L / nm;
      c.caixa(v.Corpo, 0, y0, D / 2 - 0.01, L, Ht, D - 0.02);
      for (var i = 0; i < nm; i++) {
        var x = -L / 2 + wm * (i + 0.5);
        H.porta(c, v.Corpo, x, y0 + 0.004, D - 0.02, wm - 0.006, Ht - 0.008, 0.019, "liso"); H.cava(c, x + (i % 2 ? 1 : -1) * (wm / 2 - 0.02), y0 + 0.03, D, 0.012);
      }
    }
  });
  def({
    id: "ra-coz-torre-quente", categoria: "cozinha", nome: "Torre quente (forno e micro-ondas)", descricao: "Coluna de marcenaria com gaveteiro, forno elétrico de embutir 60 cm, micro-ondas de embutir e bagageiro. Forno e micro-ondas são nichos com vidro preto e puxador.",
    parametros: [P("Largura", "comprimento", 0.62, "Dimensões", "Vão de 60 cm do forno de embutir + paredes. " + USUAL), P("Profundidade", "comprimento", 0.62, "Dimensões"), P("Altura", "comprimento", 2.40, "Dimensões"), P("Cota_forno", "comprimento", 0.80, "Construção", "Do piso à base do forno"), P("Com_micro", "simnao", true, "Construção"), P("Corpo", "material", "laca grafite", "Materiais")],
    tipos: [T("tq", "Forno 60 cm + micro-ondas", {}), T("tqf", "Só forno 60 cm", { Com_micro: false })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, yf = v.Cota_forno, rod = 0.10, zf = D - 0.02;
      c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.03, W - 0.04, rod, D - 0.08); c.caixa(v.Corpo, 0, rod, D / 2 - 0.01, W, Ht - rod, D - 0.02);
      var h = yf - rod - 0.012; H.porta(c, v.Corpo, 0, rod + 0.006, zf, W - 0.012, h * 0.45, 0.019, "liso"); H.porta(c, v.Corpo, 0, rod + 0.006 + h * 0.45 + 0.008, zf, W - 0.012, h * 0.55 - 0.014, 0.019, "liso");
      // forno
      c.caixaR(MAT.INOX, 0, yf, zf - 0.02, 0.595, 0.595, 0.04, 0.008, { k: 1 }); c.caixa(MAT.TELA, 0, yf + 0.06, zf + 0.0005, 0.55, 0.45, 0.004); c.cilH(MAT.INOX, 0, yf + 0.52, zf + 0.04, 0.009, 0.45, "x", { seg: 8 }); c.caixa(MAT.PRETO, 0, yf + 0.555, zf + 0.0005, 0.3, 0.025, 0.004);
      var yt = yf + 0.595 + 0.012;
      if (v.Com_micro) { c.caixaR(MAT.INOX, 0, yt, zf - 0.02, 0.595, 0.38, 0.04, 0.008, { k: 1 }); c.caixa(MAT.TELA, -0.06, yt + 0.035, zf + 0.0005, 0.37, 0.31, 0.004); c.caixa(MAT.PRETO, 0.21, yt + 0.1, zf + 0.0005, 0.08, 0.17, 0.004); c.cilH(MAT.INOX, 0.255, yt + 0.19, zf + 0.04, 0.007, 0.2, "y", { seg: 8, rotX: 0 }); yt += 0.38 + 0.012; }
      var hb = Ht - yt - 0.01; if (hb > 0.2) { H.porta(c, v.Corpo, 0, yt, zf, W - 0.012, hb, 0.019, "liso"); H.cava(c, 0, yt + 0.03, zf + 0.019, 0.15); }
    }
  });
  def({
    id: "ra-coz-nicho-geladeira", categoria: "cozinha", nome: "Nicho de geladeira com bagageiro", descricao: "Nicho de marcenaria para geladeira: painéis laterais, travessa e bagageiro com portas. A geladeira é uma família à parte (a abertura livre já considera folga de ventilação).",
    parametros: [P("Vao_largura", "comprimento", 0.78, "Dimensões", "Largura livre do nicho: geladeira de ~0,72 m + 3 cm de folga por lado. " + USUAL), P("Vao_altura", "comprimento", 1.90, "Dimensões", "Altura livre"), P("Altura", "comprimento", 2.40, "Dimensões", "Altura total"), P("Profundidade", "comprimento", 0.75, "Dimensões"), P("Esp", "comprimento", 0.03, "Dimensões", "Espessura dos painéis laterais"), P("Corpo", "material", "laca grafite", "Materiais")],
    tipos: [T("n78", "Vão 0,78 (geladeira inverse)", {}), T("n94", "Vão 0,94 (side by side)", { Vao_largura: 0.94 }), T("n72", "Vão 0,72 (geladeira compacta)", { Vao_largura: 0.72 })],
    gerar: function (c, v) {
      var W = v.Vao_largura, Ht = v.Altura, hv = v.Vao_altura, D = v.Profundidade, e = v.Esp, mat = v.Corpo;
      [-1, 1].forEach(function (s) { c.caixa(mat, s * (W / 2 + e / 2), 0, D / 2, e, Ht, D); });
      c.caixa(mat, 0, hv, D / 2, W, Ht - hv, D - 0.03); c.caixa(mat, 0, 0, 0.005, W, hv, 0.01);
      var nb = 2, wb = (W + 2 * e) / nb, hb = Ht - hv - 0.02;
      for (var i = 0; i < nb; i++) { var x = -(W + 2 * e) / 2 + wb * (i + 0.5); H.porta(c, mat, x, hv + 0.01, D - 0.015, wb - 0.006, hb, 0.019, "liso"); H.cava(c, x + (i ? -1 : 1) * 0.04, hv + 0.04, D + 0.004, 0.012); }
    }
  });
  /* ---- ilha ---- */
  def({
    id: "ra-coz-ilha", centro: true, categoria: "cozinha", nome: "Ilha de cozinha com cuba, cooktop e banquetas", descricao: "Ilha de marcenaria com tampo de pedra, balanço para banquetas, painéis laterais, cuba de inox e cooktop embutidos (opcionais) e as banquetas na borda do balanço. A face de trabalho fica em −Z; o balanço, em +Z.",
    parametros: [P("Comprimento", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 1.10, "Dimensões", "Corpo + balanço. " + USUAL), P("Balanco", "comprimento", 0.35, "Dimensões", "Balanço do tampo para as banquetas (apoio mínimo de ~0,30 m para os joelhos)"), P("Altura", "comprimento", 0.90, "Dimensões"), P("Espessura_tampo", "comprimento", 0.04, "Dimensões"),
      P("Com_cuba", "simnao", true, "Construção"), P("Com_cooktop", "simnao", true, "Construção"), P("Banquetas", "inteiro", 3, "Construção"), P("Altura_banqueta", "comprimento", 0.65, "Dimensões"),
      P("Corpo", "material", "madeira freijo", "Materiais"), P("Tampo", "material", "quartzo branco", "Materiais"), P("Tecido", "material", "couro caramelo", "Materiais", "Assento das banquetas")],
    tipos: [T("i200", "2,00 m, 2 banquetas", { Comprimento: 2.00, Banquetas: 2 }), T("i240", "2,40 m, 3 banquetas", {}), T("i300", "3,00 m, 4 banquetas", { Comprimento: 3.00, Banquetas: 4 }), T("i240n", "2,40 m, sem cooktop", { Com_cooktop: false })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, B = v.Balanco, Ht = v.Altura, e = v.Espessura_tampo, Dc = D - B, z0 = -D / 2, furos = [];
      var zc = z0 + Dc / 2 + 0.0;
      corpoInferior(c, L - 0.06, Dc - 0.02, Ht, e, v.Corpo, "misto", z0 + 0.01, MAT.GRAFITE);
      [-1, 1].forEach(function (s) { c.caixa(v.Corpo, s * (L / 2 - 0.015), 0.1, z0 + D / 2, 0.03, Ht - e - 0.1, D); });   // painéis laterais de ponta a ponta
      c.caixa(v.Corpo, 0, 0.1, z0 + Dc, L - 0.06, Ht - e - 0.1, 0.02);                                                   // fundo recuado sob o balanço
      var nk = v.Com_cooktop && L >= 1.8, nc = v.Com_cuba && L >= 1.4;
      if (nc) furos.push({ x: nk ? -L / 4 : -L / 6, larg: 0.54, prof: 0.42, z: z0 + Dc / 2 });
      if (nk) furos.push({ x: L / 4, larg: 0.56, prof: 0.49, z: z0 + Dc / 2 });
      tampoFuros(c, v.Tampo, L, D, e, Ht - e, z0 + D / 2, furos);
      if (nc) cuba(c, furos[0].x, furos[0].z, Ht, 0.50, 0.40);
      if (nk) cooktop(c, L / 4, z0 + Dc / 2, Ht, 0.55, 0.47, 4);
      var nb = Math.round(v.Banquetas), pas = 0.62;
      for (var i = 0; i < nb; i++) { var xb = (i - (nb - 1) / 2) * pas; c.grupo(xb, 0, D / 2 + 0.12, 0, function (k) { H.banqueta(k, v.Altura_banqueta, 0.36, v.Tecido, MAT.PRETO); }); }
    }
  });
  /* ---- geladeira ---- */
  def({
    id: "ra-coz-geladeira", categoria: "cozinha", nome: "Geladeira", descricao: "Geladeira de cozinha com portas, puxadores e rodapé: freezer embaixo (duplex invertida), duas portas lado a lado (side by side) ou french door. Os tipos 'inverse' trazem medidas de ficha de catálogo (ver fonte).",
    parametros: [P("Largura", "comprimento", 0.725, "Dimensões", "Medida de ficha de catálogo (ver fonte do tipo)"), P("Altura", "comprimento", 1.84, "Dimensões"), P("Profundidade", "comprimento", 0.701, "Dimensões", "Sem a folga de ventilação (~5 cm atrás e 3 cm nas laterais)"),
      P("Modelo", "texto", "inverse", "Construção", "inverse, duplex, sidebyside ou frenchdoor"), P("Acabamento", "material", "inox", "Materiais")],
    tipos: [T("inv", "Frost free inverse 443 L (BRE57AK) — 72,5 × 184 × 70,1", {}, FONTE_GELADEIRA), T("inv2", "Frost free inverse 447 L (BRE57FK) — 70 × 184,5 × 75,5", { Largura: 0.70, Altura: 1.845, Profundidade: 0.755 }, FONTE_GELADEIRA),
      T("sbs", "Side by side ~0,91 × 1,79 × 0,74 (medida usual; não verificada em ficha)", { Modelo: "sidebyside", Largura: 0.91, Altura: 1.79, Profundidade: 0.74 }), T("frn", "French door ~0,91 × 1,79 × 0,74 (medida usual; não verificada em ficha)", { Modelo: "frenchdoor", Largura: 0.91, Altura: 1.79, Profundidade: 0.74 }), T("dup", "Duplex ~0,70 × 1,75 × 0,70 (medida usual; não verificada em ficha)", { Modelo: "duplex", Largura: 0.70, Altura: 1.75, Profundidade: 0.70 })],
    gerar: function (c, v) {
      var W = v.Largura, Ht = v.Altura, D = v.Profundidade, m = String(v.Modelo).toLowerCase(), ac = v.Acabamento, pe = 0.04, zf = D - 0.03;
      c.caixa(MAT.PRETO, 0, 0, D / 2, W - 0.06, pe, D - 0.1);
      c.caixaR(MAT.GRAFITE, 0, pe, D / 2 - 0.01, W, Ht - pe, D - 0.02, 0.01);
      if (m === "sidebyside" || m === "frenchdoor") {
        var wL = m === "sidebyside" ? W * 0.45 : W * 0.5, hTop = m === "sidebyside" ? Ht - pe - 0.02 : (Ht - pe) * 0.66, yTop = m === "sidebyside" ? pe + 0.01 : Ht - hTop - 0.01;
        [-1, 1].forEach(function (s) { var x = s * (wL / 2 + 0.004), w = m === "sidebyside" ? (s < 0 ? wL : W - wL - 0.012) : wL - 0.008; var xx = m === "sidebyside" ? (s < 0 ? -W / 2 + wL / 2 + 0.005 : W / 2 - (W - wL - 0.012) / 2 - 0.005) : x; c.caixaR(ac, xx, yTop, zf, w, hTop, 0.03, 0.01); c.cil(MAT.PRETO, xx + s * (w / 2 - 0.035) * (m === "sidebyside" ? -1 : 1), yTop + hTop * 0.35, zf + 0.04, 0.012, hTop * 0.38, { seg: 8 }); });
        if (m === "frenchdoor") { c.caixaR(ac, 0, pe + 0.01, zf, W - 0.012, Ht - pe - hTop - 0.03, 0.03, 0.01); c.caixa(MAT.PRETO, 0, pe + 0.01 + (Ht - pe - hTop - 0.03) * 0.8, zf + 0.03, W * 0.6, 0.02, 0.012); }
      } else {
        var inv = m === "inverse", hF = (Ht - pe) * (inv ? 0.30 : 0.28), hR = Ht - pe - hF - 0.03;
        var yR = inv ? pe + 0.01 + hF + 0.008 : pe + 0.01, yF = inv ? pe + 0.01 : pe + 0.01 + hR + 0.008;
        // inverse: refrigerador em cima / freezer embaixo (gaveta); duplex: freezer em cima
        c.caixaR(ac, 0, yR, zf, W - 0.012, hR, 0.03, 0.01); c.caixaR(ac, 0, yF, zf, W - 0.012, hF - 0.008, 0.03, 0.01);
        c.cil(MAT.PRETO, -W / 2 + 0.06, yR + hR * 0.35, zf + 0.04, 0.012, hR * 0.45, { seg: 8 }); c.cilH(MAT.PRETO, 0, yF + hF - 0.05, zf + 0.04, 0.011, W * 0.75, "x", { seg: 8 });
        c.caixa(MAT.PRETO, W / 2 - 0.09, yR + hR - 0.04, zf + 0.0305, 0.09, 0.03, 0.002);
      }
    }
  });
  /* ---- máquina de lavar ---- */
  def({
    id: "ra-coz-lavadora", categoria: "cozinha", nome: "Máquina de lavar roupas", descricao: "Lavadora frontal (porta circular com vidro e painel) ou de carga superior (tampa e painel de comandos). Os tipos frontais trazem medidas de ficha de catálogo.",
    parametros: [P("Modelo", "texto", "frontal", "Construção", "frontal ou superior"), P("Largura", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.85, "Dimensões"), P("Profundidade", "comprimento", 0.64, "Dimensões"), P("Corpo", "material", "laca branca", "Materiais")],
    tipos: [T("f11", "Lava e seca frontal 11 kg — 60 × 85 × 64", {}, FONTE_LAVA), T("f11lg", "Lava e seca frontal 11 kg — 60 × 85 × 56", { Profundidade: 0.56 }, FONTE_LAVA), T("sup", "Carga superior 13 kg (~0,66 × 1,06 × 0,69; medida usual, não verificada em ficha)", { Modelo: "superior", Largura: 0.66, Altura: 1.06, Profundidade: 0.69 })],
    gerar: function (c, v) {
      var W = v.Largura, Ht = v.Altura, D = v.Profundidade, fr = String(v.Modelo).toLowerCase() !== "superior";
      c.caixaR(v.Corpo, 0, 0.015, D / 2, W, Ht - 0.015, D, 0.012);
      [-1, 1].forEach(function (s) { c.cil(MAT.PRETO, s * (W / 2 - 0.04), 0, D - 0.05, 0.025, 0.015, { seg: 8 }); c.cil(MAT.PRETO, s * (W / 2 - 0.04), 0, 0.05, 0.025, 0.015, { seg: 8 }); });
      if (fr) {
        var yc = Ht * 0.44, r = Math.min(0.24, W * 0.4);
        c.torno(MAT.CROMO, 0, yc, D, [[r + 0.035, -0.012], [r + 0.035, 0.0], [r + 0.012, 0.03], [r, 0.03]], { seg: 32, rotX: 90 });
        c.torno(MAT.FUME, 0, yc, D + 0.005, [[r, 0.0], [r * 0.93, 0.03], [r * 0.7, 0.045], [0, 0.05]], { seg: 32, rotX: 90 });
        c.caixa(MAT.GRAFITE, 0, Ht - 0.115, D + 0.001, W - 0.04, 0.09, 0.004);
        c.cil(MAT.CROMO, W / 2 - 0.08, Ht - 0.07, D + 0.003, 0.025, 0.014, { seg: 16, rotX: 90 });
        c.caixa(MAT.TELA, -0.05, Ht - 0.088, D + 0.0035, 0.2, 0.045, 0.002);
      } else {
        c.caixaR(MAT.GRAFITE, 0, Ht - 0.02, D / 2, W - 0.02, 0.02, D - 0.02, 0.008, { k: 1 });
        c.caixaR(MAT.FUME, 0, Ht, D * 0.45, W * 0.62, 0.012, D * 0.55, 0.01, { k: 1 });
        c.caixaR(MAT.GRAFITE, 0, Ht - 0.06, 0.04, W - 0.02, 0.14, 0.08, 0.012, { k: 1 }); c.caixa(MAT.TELA, 0, Ht - 0.03, 0.082, W * 0.6, 0.05, 0.003);
      }
    }
  });

  /* ================================================================ BANHO */
  def({
    id: "ra-banho-bancada", categoria: "banho", nome: "Bancada de banheiro com cuba de apoio, gabinete e espelho", descricao: "Gabinete suspenso com gavetas e portas, tampo de pedra, cuba de apoio oval, torneira alta de mesa e espelho com moldura de luz embutida. Comprimento é o parâmetro.",
    parametros: [P("Comprimento", "comprimento", 1.20, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.50, "Dimensões", USUAL), P("Altura_tampo", "comprimento", 0.85, "Dimensões", "Do piso ao topo do tampo"), P("Altura_pe", "comprimento", 0.25, "Dimensões", "Vão do gabinete suspenso"), P("Espessura_tampo", "comprimento", 0.03, "Dimensões"),
      P("Cubas", "inteiro", 1, "Construção", "1 ou 2 cubas de apoio"), P("Com_espelho", "simnao", true, "Construção"), P("Altura_espelho", "comprimento", 0.90, "Dimensões"), P("Base_espelho", "comprimento", 1.20, "Restrições", "Do piso à base do espelho", "instancia"),
      P("Corpo", "material", "madeira nogueira", "Materiais"), P("Tampo", "material", "marmore branco", "Materiais"), P("Cuba", "material", "louça branca", "Materiais")],
    tipos: [T("b80", "0,80 m, 1 cuba", { Comprimento: 0.80 }), T("b120", "1,20 m, 1 cuba", {}), T("b160", "1,60 m, 2 cubas", { Comprimento: 1.60, Cubas: 2 }), T("b200", "2,00 m, 2 cubas", { Comprimento: 2.00, Cubas: 2 })],
    unidade: "m", quantidade: "Comprimento", quantDesc: "Bancada de banheiro com gabinete",
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura_tampo, y0 = v.Altura_pe, e = v.Espessura_tampo, nc = Math.max(1, Math.round(v.Cubas)), hc = Ht - e - y0;
      c.caixa(MAT.PRETO, 0, y0 - 0.008, D / 2 - 0.02, L - 0.04, 0.008, D - 0.08);
      c.caixa(v.Corpo, 0, y0, D / 2 - 0.01, L - 0.01, hc, D - 0.02);
      var nm = Math.max(2, Math.round(L / 0.45)), wm = (L - 0.01) / nm;
      for (var i = 0; i < nm; i++) { var x = -(L - 0.01) / 2 + wm * (i + 0.5); if (i % 2 === 0 && nm > 2) { [0, 1].forEach(function (g) { var hh = (hc - 0.02) / 2 - 0.004; H.porta(c, v.Corpo, x, y0 + 0.008 + g * (hh + 0.008), D - 0.02, wm - 0.008, hh, 0.019, "liso"); H.cava(c, x, y0 + 0.008 + g * (hh + 0.008) + hh - 0.03, D, wm * 0.5); }); } else { H.porta(c, v.Corpo, x, y0 + 0.008, D - 0.02, wm - 0.008, hc - 0.016, 0.019, "liso"); H.cava(c, x, y0 + hc - 0.04, D, 0.01); } }
      c.caixaR(v.Tampo, 0, Ht - e, D / 2, L, e, D, 0.004, { k: 1 }); c.caixa(v.Tampo, 0, Ht, 0.01, L, 0.1, 0.02);
      for (var k = 0; k < nc; k++) {
        var xk = nc === 1 ? 0 : (k - 0.5) * (L / 2);
        c.torno(v.Cuba, xk, Ht, D * 0.55, [[0.10, 0], [0.18, 0.025], [0.205, 0.08], [0.2, 0.12], [0.185, 0.12], [0.18, 0.09], [0.1, 0.03]], { seg: 28, ex: 1.15, ez: 0.95 });
        c.cil(MAT.CROMO, xk, Ht, 0.14, 0.02, 0.03, { seg: 10 }); c.cil(MAT.CROMO, xk, Ht + 0.03, 0.14, 0.012, 0.22, { seg: 10 }); c.cilH(MAT.CROMO, xk, Ht + 0.245, 0.14 + 0.07, 0.011, 0.14, "z", { seg: 10 });
      }
      if (v.Com_espelho) {
        var ha = v.Altura_espelho, yb = v.Base_espelho, we = L - 0.1;
        c.caixa(MAT.ESPELHO, 0, yb, 0.03, we, ha, 0.008); c.caixa(MAT.ACRILICO, 0, yb - 0.012, 0.04, we, 0.012, 0.03); c.caixa(MAT.PRETO, 0, yb + ha, 0.03, we + 0.03, 0.012, 0.02);
        c.caixa(MAT.PRETO, -we / 2 - 0.015, yb - 0.012, 0.03, 0.015, ha + 0.024, 0.02); c.caixa(MAT.PRETO, we / 2 + 0.015, yb - 0.012, 0.03, 0.015, ha + 0.024, 0.02);
      }
    }
  });
  /* ---- banheira de hidromassagem ---- */
  def({
    id: "ra-banho-hidromassagem", centro: true, categoria: "banho", nome: "Banheira de hidromassagem", descricao: "Banheira de acrílico retangular com aro, cuba rebaixada, jatos aparentes (principais e minijatos), ralo, ladrão e misturador de deck. Medidas dos tipos são de fichas de catálogo (ver fonte); o aro da cuba e a profundidade interna não são cotas de ficha (padrão da RA, a conferir). Os pontos de água e esgoto (hidráulica) entram na fase do hidrossanitário.",
    parametros: [P("Comprimento", "comprimento", 1.70, "Dimensões", "Comprimento externo (ficha de catálogo, ver fonte do tipo)"), P("Largura", "comprimento", 0.80, "Dimensões", "Largura externa"), P("Altura", "comprimento", 0.43, "Dimensões", "Altura externa, do piso à borda"), P("Aro", "comprimento", 0.08, "Dimensões", "Largura da borda — padrão RA, a conferir no modelo"), P("Profundidade_cuba", "comprimento", 0.33, "Dimensões", "Da borda ao fundo interno — padrão RA, a conferir no modelo"),
      P("Jatos", "inteiro", 1, "Hidromassagem", "Jatos principais"), P("Minijatos", "inteiro", 2, "Hidromassagem"), P("Com_misturador", "simnao", true, "Construção"), P("Material", "material", "acrilico branco", "Materiais")],
    tipos: [T("c150", "Retangular 1,50 × 0,80 × 0,43 — 1 jato + 2 minijatos (Capri Luxo)", { Comprimento: 1.50 }, FONTE_BANHEIRA), T("c170", "Retangular 1,70 × 0,80 × 0,43 — 1 jato + 2 minijatos (Capri Luxo)", {}, FONTE_BANHEIRA),
      T("c180", "Retangular 1,80 × 0,90 × 0,55 — 3 jatos (Confortare Luxo)", { Comprimento: 1.80, Largura: 0.90, Altura: 0.55, Jatos: 3, Minijatos: 0, Profundidade_cuba: 0.43 }, FONTE_BANHEIRA),
      T("c180d", "Retangular 1,80 × 1,20 × 0,44 — 6 jatos (Prima Maggiore)", { Comprimento: 1.80, Largura: 1.20, Altura: 0.44, Jatos: 6, Minijatos: 0, Profundidade_cuba: 0.34 }, FONTE_BANHEIRA),
      T("c170d", "Retangular 1,70 × 1,10 × 0,40 — 6 jatos (Cristal Duo)", { Comprimento: 1.70, Largura: 1.10, Altura: 0.40, Jatos: 6, Minijatos: 0, Profundidade_cuba: 0.31 }, FONTE_BANHEIRA)],
    gerar: function (c, v) {
      var L = v.Comprimento, W = v.Largura, Ht = v.Altura, ar = v.Aro, pc = v.Profundidade_cuba, fd = Ht - pc, mat = v.Material;
      var ext = Mob.contornoRR(L, W, 0.14, 5), int = Mob.contornoRR(L - 2 * ar, W - 2 * ar, 0.18, 5);
      c.bandeja(mat, mat, 0, 0, 0, ext, int, Ht, Math.max(0.03, fd));
      // jatos nas paredes internas (aparentes, cromados): longitudinal, no lado de trás e nas laterais
      var nJ = Math.round(v.Jatos), nM = Math.round(v.Minijatos), yj = Math.max(fd + 0.14, Ht - 0.2), zi = W / 2 - ar - 0.002, xi = L / 2 - ar - 0.002;
      function jato(x, y, z, rot, r) { c.torno(MAT.CROMO, x, y, z, [[r, 0], [r, 0.006], [r * 0.55, 0.008], [r * 0.3, 0.003], [0, 0.003]], { seg: 18, rotX: rot[0], rotZ: rot[1], rotY: rot[2] || 0 }); }
      for (var i = 0; i < nJ; i++) { var xj = nJ === 1 ? -L * 0.12 : -L / 2 + ar + 0.35 + (L - 2 * ar - 0.7) * i / (nJ - 1); jato(xj, yj, -zi, [90, 0], 0.04); if (nJ > 3 || W > 1.0) jato(xj, yj, zi, [-90, 0], 0.04); }
      for (var m = 0; m < nM; m++) jato(-xi, yj + 0.02, (m - (nM - 1) / 2) * 0.16, [0, 90], 0.025);
      // ralo, ladrão, apoio de cabeça em relevo
      c.torno(MAT.CROMO, xi - 0.12, Math.max(0.03, fd), 0, [[0.035, 0], [0.04, 0.004], [0.035, 0.008]], { seg: 20 });
      c.torno(MAT.CROMO, -xi + 0.05, Ht - 0.12, -zi, [[0.03, 0], [0.034, 0.004], [0.03, 0.008]], { seg: 16, rotX: 90 });
      if (v.Com_misturador) {
        var xm = L / 2 - ar / 2 - 0.01;
        c.cil(MAT.CROMO, xm, Ht, -W / 2 + ar / 2 + 0.02, 0.025, 0.04, { seg: 12 }); c.cil(MAT.CROMO, xm, Ht + 0.04, -W / 2 + ar / 2 + 0.02, 0.013, 0.2, { seg: 10 });
        c.cilH(MAT.CROMO, xm - 0.07, Ht + 0.225, -W / 2 + ar / 2 + 0.02, 0.011, 0.16, "x", { seg: 10 });
        c.cil(MAT.CROMO, xm + 0.045, Ht + 0.04, -W / 2 + ar / 2 + 0.02, 0.01, 0.06, { seg: 8 });
      }
    }
  });
  /* ---- box ---- */
  def({
    id: "ra-banho-box", categoria: "banho", nome: "Box de vidro (frontal ou de canto)", descricao: "Box de vidro temperado com perfis metálicos, porta de correr ou de abrir e puxador. 'frontal' fecha o vão entre duas paredes; 'canto' faz o L em volta do ralo. A peça é encostada: o fundo do box é a parede em Z = 0 e, no canto, a parede lateral em X = −Largura/2.",
    parametros: [P("Modelo", "texto", "frontal", "Construção", "frontal ou canto", "instancia"), P("Largura", "comprimento", 1.00, "Dimensões", "Frontal: vão entre paredes. Canto: lado do box. " + USUAL), P("Profundidade", "comprimento", 0.90, "Dimensões", "Distância da parede de fundo ao vidro da frente (largura do chuveiro)"), P("Altura", "comprimento", 1.90, "Dimensões", USUAL),
      P("Porta", "texto", "correr", "Construção", "correr ou abrir"), P("Esp_vidro", "comprimento", 0.008, "Dimensões", "Vidro temperado de 8 mm — usual"), P("Vidro", "material", "vidro", "Materiais", "vidro (incolor) ou vidro fume"), P("Perfil", "material", "metal preto", "Materiais")],
    tipos: [T("f100", "Frontal 1,00 m, correr", {}), T("f120", "Frontal 1,20 m, correr", { Largura: 1.20 }), T("f80a", "Frontal 0,80 m, abrir", { Largura: 0.80, Porta: "abrir" }), T("c90", "De canto 0,90 × 0,90, correr", { Modelo: "canto", Largura: 0.90, Profundidade: 0.90 }), T("c120", "De canto 1,20 × 0,90, abrir", { Modelo: "canto", Largura: 1.20, Profundidade: 0.90, Porta: "abrir" })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = v.Esp_vidro, canto = String(v.Modelo).toLowerCase() === "canto", correr = String(v.Porta).toLowerCase() === "correr", p = 0.02;
      var zf = D;
      function painel(x, z, larg, alt, y, eixo) {   // vidro em pé, de largura `larg` no sentido do eixo
        if (eixo === "x") c.caixa(v.Vidro, x, y, z, larg, alt, e); else c.caixa(v.Vidro, x, y, z, e, alt, larg);
      }
      var yb = 0.01;
      // perfil do piso e trilho superior
      if (canto) {
        c.caixa(v.Perfil, 0, 0, zf, W, 0.02, p); c.caixa(v.Perfil, -W / 2 + 0.0, 0, D / 2, p, 0.02, D); c.caixa(v.Perfil, W / 2, 0, D / 2, p, 0.02, D);
        c.caixa(v.Perfil, 0, Ht, zf, W, p, p);
        painel(W / 2, D / 2, D, Ht - yb, yb, "z");          // lateral fixa
        if (correr) { painel(-W / 4, zf, W / 2, Ht - yb, yb, "x"); painel(W / 4 - 0.01, zf + 0.02, W / 2, Ht - yb, yb, "x"); c.cilH(MAT.INOX, -0.05, Ht * 0.52, zf + 0.04, 0.008, 0.3, "y", { seg: 8, rotX: 0 }); }
        else { painel(-W * 0.18, zf, W * 0.64, Ht - yb, yb, "x"); painel(W * 0.34, zf, W * 0.32, Ht - yb, yb, "x"); c.cil(MAT.INOX, W * 0.08, Ht * 0.45, zf + 0.03, 0.009, 0.4, { seg: 8 }); [0.2, 0.55, 0.9].forEach(function (f) { c.cil(v.Perfil, -W * 0.5 + 0.02, Ht * f, zf + 0.005, 0.014, 0.05, { seg: 8, rotX: 90, centro: true }); }); }
      } else {
        c.caixa(v.Perfil, 0, 0, zf, W, 0.02, p); c.caixa(v.Perfil, -W / 2 + p / 2, 0, D / 2, p, 0.02, D); c.caixa(v.Perfil, W / 2 - p / 2, 0, D / 2, p, 0.02, D);
        c.caixa(v.Perfil, 0, Ht, zf, W, p, p);
        if (correr) { painel(-W / 4, zf, W / 2, Ht - yb, yb, "x"); painel(W / 4 - 0.01, zf + 0.02, W / 2 + 0.02, Ht - yb, yb, "x"); c.cil(MAT.INOX, W / 4 - 0.12, Ht * 0.5, zf + 0.045, 0.008, 0.45, { seg: 8 }); }
        else { painel(-W / 2 + (W * 0.65) / 2 + 0.02, zf, W * 0.65, Ht - yb, yb, "x"); painel(W / 2 - (W * 0.25) / 2 - 0.02, zf, W * 0.25, Ht - yb, yb, "x"); c.cilH(MAT.INOX, 0.0, Ht * 0.5, zf + 0.04, 0.008, 0.3, "y", { seg: 8 }); }
      }
    }
  });

  /* ================================================================ LAZER / ÁREA GOURMET */
  function chamine(c, mat, xc, y0, zc, w0, d0, w1, d1, h, hDuto, wDuto) {
    c.tronco(mat, xc, y0, zc, w0, d0, wDuto, wDuto, h);
    c.caixa(mat, xc, y0 + h, zc, wDuto, hDuto, wDuto);
  }
  def({
    id: "ra-lazer-churrasqueira-premoldada", categoria: "lazer", nome: "Churrasqueira pré-moldada com coifa", descricao: "Churrasqueira pré-moldada de concreto revestido: base, boca com grelha e braseiro, bancada de apoio ao lado (opcional), coifa de 3 águas e chaminé até a altura total. Largura e boca por tipo: ver fonte do catálogo.",
    parametros: [P("Largura", "comprimento", 0.85, "Dimensões", "Largura externa (catálogo, ver fonte do tipo)"), P("Profundidade", "comprimento", 0.50, "Dimensões", "Profundidade externa (catálogo)"), P("Altura_total", "comprimento", 2.20, "Dimensões", "Do piso ao topo da chaminé (catálogo)"), P("Altura_boca", "comprimento", 0.51, "Dimensões", "Altura da boca (catálogo)"), P("Cota_braseiro", "comprimento", 0.70, "Dimensões", "Do piso ao fundo do braseiro — padrão RA, a conferir"), P("Duto_lado", "comprimento", 0.30, "Dimensões", "Lado da chaminé — padrão RA, a conferir"),
      P("Revestimento", "material", "pedra cinza", "Materiais"), P("Refratario", "material", "tijolo refratario", "Materiais")],
    tipos: [T("p55", "Largura 55 cm", { Largura: 0.55 }, FONTE_CHURRAS), T("p65", "Largura 65 cm", { Largura: 0.65 }, FONTE_CHURRAS), T("p76", "Largura 76 cm", { Largura: 0.76 }, FONTE_CHURRAS), T("p85", "Largura 85 cm", {}, FONTE_CHURRAS)],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura_total, hb = v.Altura_boca, yb = v.Cota_braseiro, dl = v.Duto_lado, rv = v.Revestimento, rf = v.Refratario, pil = 0.10;
      c.caixa(rv, 0, 0, D / 2, W, yb, D);                                                       // base
      c.caixa(rf, 0, yb, D / 2 - 0.02, W - 2 * pil, 0.05, D - 0.1);                             // braseiro
      [-1, 1].forEach(function (s) { c.caixa(rv, s * (W / 2 - pil / 2), yb, D / 2, pil, hb + 0.2, D); });   // pilares da boca
      c.caixa(rv, 0, yb + hb, D / 2, W, 0.2, D); c.caixa(rf, 0, yb + 0.05, 0.03, W - 2 * pil, hb - 0.05, 0.05);                             // lintel + fundo refratário
      for (var i = 0; i < 9; i++) c.cilH(MAT.PRETO, -((W - 2 * pil) / 2 - 0.03) + i * (W - 2 * pil - 0.06) / 8, yb + 0.16, D / 2, 0.005, D - 0.14, "z", { seg: 6 });
      c.cilH(MAT.PRETO, 0, yb + 0.16, D - 0.09, 0.006, W - 2 * pil, "x", { seg: 6 });
      var yc = yb + hb + 0.2;
      chamine(c, rv, 0, yc, D / 2, W, D, dl, dl, Math.min(0.4, Ht - yc - 0.2), Math.max(0.1, Ht - yc - Math.min(0.4, Ht - yc - 0.2)), dl);
    }
  });
  def({
    id: "ra-lazer-churrasqueira-alvenaria", categoria: "lazer", nome: "Churrasqueira de alvenaria revestida com bancada e coifa", descricao: "Bloco de churrasqueira em alvenaria revestida de pedra, boca larga com grelha, braseiro, bancadas de apoio nas duas laterais com tampo de pedra e nicho de lenha, coifa de inox e chaminé.",
    parametros: [P("Largura", "comprimento", 2.20, "Dimensões", "Largura total do bloco com as bancadas. " + USUAL), P("Profundidade", "comprimento", 0.70, "Dimensões", USUAL), P("Boca", "comprimento", 0.90, "Dimensões", "Largura da boca"), P("Altura_boca", "comprimento", 0.55, "Dimensões"), P("Altura_bancada", "comprimento", 0.90, "Dimensões"), P("Altura_total", "comprimento", 3.00, "Dimensões", "Até o topo da chaminé (passar a cobertura)"),
      P("Revestimento", "material", "pedra cinza", "Materiais"), P("Tampo", "material", "granito preto", "Materiais"), P("Refratario", "material", "tijolo refratario", "Materiais"), P("Coifa", "material", "inox", "Materiais")],
    tipos: [T("a220", "Bloco 2,20 m, boca 0,90", {}), T("a280", "Bloco 2,80 m, boca 1,10", { Largura: 2.80, Boca: 1.10 }), T("a180", "Bloco 1,80 m, boca 0,70", { Largura: 1.80, Boca: 0.70 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, B = v.Boca, hb = v.Altura_boca, hbk = v.Altura_bancada, Ht = v.Altura_total, rv = v.Revestimento, rf = v.Refratario, yb = 0.80;
      c.caixa(rv, 0, 0, D / 2, B + 0.2, yb, D);                                                  // base central
      c.caixa(rf, 0, yb, D / 2 - 0.05, B, 0.05, D - 0.15);
      c.caixa(rf, 0, yb, 0.05, B, hb + 0.2, 0.08);                                               // fundo refratário
      [-1, 1].forEach(function (s) { c.caixa(rf, s * (B / 2 - 0.04), yb, D / 2 - 0.05, 0.08, hb, D - 0.15); });   // laterais refratárias
      c.caixa(rv, 0, yb + hb, D / 2, B + 0.2, 0.25, D);                                           // lintel
      var nG = Math.round(B / 0.08); for (var i = 0; i <= nG; i++) c.cilH(MAT.PRETO, -B / 2 + 0.04 + i * (B - 0.08) / nG, yb + 0.2, D / 2 - 0.05, 0.005, D - 0.2, "z", { seg: 6 });
      var lw = (W - (B + 0.2)) / 2;
      [-1, 1].forEach(function (s) {
        var xc = s * (B / 2 + 0.1 + lw / 2);
        c.caixa(rv, xc, 0, D / 2, lw, hbk - 0.03, D); c.caixaR(v.Tampo, xc, hbk - 0.03, D / 2, lw + (s > 0 ? 0 : 0), 0.03, D + 0.04, 0.004, { k: 1 });
        c.caixa(MAT.GRAFITE, xc, 0.1, D - 0.0, lw * 0.7, hbk - 0.35, 0.02);                                          // nicho/porta
      });
      var yc = yb + hb + 0.25, hh = 0.55;
      chamine(c, v.Coifa, 0, yc, D / 2, B + 0.2, D, 0.4, 0.4, hh, Math.max(0.2, Ht - yc - hh), 0.4);
    }
  });
  def({
    id: "ra-lazer-mesa-gourmet", centro: true, categoria: "lazer", nome: "Mesa gourmet com bancos", descricao: "Mesa de madeira maciça com pés em X de metal e dois bancos corridos nas laterais (opcionais).",
    parametros: [P("Comprimento", "comprimento", 2.20, "Dimensões", USUAL), P("Largura", "comprimento", 0.85, "Dimensões", USUAL), P("Altura", "comprimento", 0.75, "Dimensões"), P("Bancos", "simnao", true, "Construção"), P("Altura_banco", "comprimento", 0.45, "Dimensões"), P("Tampo", "material", "madeira deck", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais")],
    tipos: [T("m180", "1,80 × 0,85 (6 lugares com bancos)", { Comprimento: 1.80 }), T("m220", "2,20 × 0,85 (8 lugares com bancos)", {}), T("m260", "2,60 × 0,90 (10 lugares com bancos)", { Comprimento: 2.60, Largura: 0.90 })],
    gerar: function (c, v) {
      var L = v.Comprimento, W = v.Largura, Ht = v.Altura, hb = v.Altura_banco;
      c.caixaR(v.Tampo, 0, Ht - 0.05, 0, L, 0.05, W, 0.006, { k: 1 });
      for (var i = 0; i < 7; i++) c.caixa(MAT.PRETO, 0, Ht - 0.052, -W / 2 + 0.05 + i * (W - 0.1) / 6, L - 0.04, 0.003, 0.004);
      [-1, 1].forEach(function (s) {
        var xx = s * (L / 2 - 0.3);
        [-1, 1].forEach(function (r) { c.caixa(v.Estrutura, xx, 0, 0, 0.05, Ht - 0.05, 0.05, { rotZ: r * 14 }); });
        c.caixa(v.Estrutura, xx, Ht - 0.07, 0, 0.05, 0.03, W - 0.1);
        c.caixa(v.Estrutura, xx, 0, 0, 0.06, 0.02, W - 0.15);
      });
      if (v.Bancos) [-1, 1].forEach(function (sz) {
        var zb = sz * (W / 2 + 0.22);
        c.caixaR(v.Tampo, 0, hb - 0.045, zb, L - 0.1, 0.045, 0.34, 0.005, { k: 1 });
        [-1, 1].forEach(function (s) { c.caixa(v.Estrutura, s * (L / 2 - 0.35), 0, zb, 0.04, hb - 0.045, 0.3); });
      });
    }
  });
  def({
    id: "ra-lazer-espreguicadeira", centro: true, categoria: "lazer", nome: "Espreguiçadeira", descricao: "Espreguiçadeira com estrutura de alumínio, colchonete em três módulos (encosto reclinável, assento e apoio dos pés) e rodinhas. O ângulo do encosto é parâmetro.",
    parametros: [P("Comprimento", "comprimento", 1.95, "Dimensões", USUAL), P("Largura", "comprimento", 0.62, "Dimensões"), P("Altura_assento", "comprimento", 0.32, "Dimensões"), P("Angulo_encosto", "angulo", 30, "Construção", "Inclinação do encosto sobre o plano do assento, em graus", "instancia"), P("Estrutura", "material", "metal preto", "Materiais"), P("Colchonete", "material", "tecido bege", "Materiais")],
    tipos: [T("e195", "1,95 × 0,62", {}), T("e200l", "2,00 × 0,70 (larga)", { Comprimento: 2.00, Largura: 0.70 }), T("e195p", "Encosto reto 60°", { Angulo_encosto: 60 })],
    gerar: function (c, v) {
      var L = v.Comprimento, W = v.Largura, hs = v.Altura_assento, a = v.Angulo_encosto, es = v.Estrutura, tec = v.Colchonete, Le = L * 0.38, Lp = L * 0.27, La = L - Le - Lp, z0 = -L / 2;
      // estrutura: dois longarinas e pés
      [-1, 1].forEach(function (s) {
        c.caixa(es, s * (W / 2 - 0.02), hs - 0.05, z0 + Le + La / 2, 0.035, 0.035, La + 0.1);
        c.caixa(es, s * (W / 2 - 0.02), hs - 0.05, z0 + Le + La + Lp / 2 + 0.02, 0.035, 0.035, Lp, { rotX: -12 });
        c.caixa(es, s * (W / 2 - 0.02), hs - 0.05, z0 + Le / 2, 0.035, 0.035, Le + 0.04, { rotX: -a });
        c.cil(es, s * (W / 2 - 0.02), 0, z0 + Le + 0.05, 0.02, hs - 0.04, { seg: 8 }); c.cil(es, s * (W / 2 - 0.02), 0, z0 + Le + La - 0.05, 0.02, hs - 0.04, { seg: 8 });
        c.cil(MAT.BORRACHA, s * (W / 2 - 0.02), 0, z0 + Le + La - 0.05, 0.04, 0.04, { seg: 12, rotZ: 90, centro: true });
      });
      c.caixaR(tec, 0, hs - 0.015, z0 + Le + La / 2, W - 0.02, 0.07, La, 0.03);
      c.caixaR(tec, 0, hs - 0.015, z0 + Le + La + Lp / 2 + 0.02, W - 0.02, 0.07, Lp, 0.03, { rotX: -12 });
      c.caixaR(tec, 0, hs - 0.015, z0 + Le / 2, W - 0.02, 0.07, Le, 0.03, { rotX: -a });
    }
  });
  def({
    id: "ra-lazer-guarda-sol", centro: true, categoria: "lazer", nome: "Guarda-sol com base", descricao: "Guarda-sol octogonal de mastro central com varetas e base de concreto.",
    parametros: [P("Diametro", "comprimento", 2.70, "Dimensões", USUAL), P("Altura", "comprimento", 2.50, "Dimensões", "Do piso ao topo"), P("Cota_beiral", "comprimento", 2.05, "Dimensões", "Do piso à borda da cobertura (passagem livre)"), P("Lona", "material", "tecido bege", "Materiais"), P("Mastro", "material", "madeira escura", "Materiais")],
    tipos: [T("g27", "Ø 2,70 m", {}), T("g30", "Ø 3,00 m", { Diametro: 3.00, Altura: 2.60 }), T("g20", "Ø 2,00 m", { Diametro: 2.00, Altura: 2.30, Cota_beiral: 1.95 })],
    gerar: function (c, v) {
      var R = v.Diametro / 2, Ht = v.Altura, yb = v.Cota_beiral;
      c.cil(MAT.CONCRETO, 0, 0, 0, 0.26, 0.07, { seg: 20 }); c.cil(MAT.CONCRETO, 0, 0.07, 0, 0.11, 0.04, { r2: 0.05, seg: 14 });
      c.cil(v.Mastro, 0, 0.1, 0, 0.026, Ht - 0.1, { seg: 12 });
      c.torno(v.Lona, 0, 0, 0, [[R, yb], [R * 0.74, yb + (Ht - yb) * 0.55], [R * 0.25, Ht - 0.06], [0.04, Ht - 0.02], [0, Ht + 0.02]], { seg: 8, aberto: true });
      c.torno(v.Lona, 0, 0, 0, [[R - 0.01, yb - 0.002], [R * 0.74, yb + (Ht - yb) * 0.55 - 0.012], [R * 0.25, Ht - 0.07], [0.03, Ht - 0.04]], { seg: 8, aberto: true, rotY: 0 });
      c.cil(MAT.PRETO, 0, Ht + 0.02, 0, 0.012, 0.05, { seg: 8 });
    }
  });

  FM.registrar();
  if (typeof module !== "undefined" && module.exports) module.exports = FM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

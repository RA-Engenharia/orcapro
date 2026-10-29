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
  var FONTE_GEL_CAT = "Fichas de fabricante consultadas em 20/10/2026 (docs/arquitetura/interiores/dados/catalogo-mobiliario.json): ";
  var FONTE_GEL591 = FONTE_GEL_CAT + "Brastemp BRE85MK inverse 591 L, 83,6 × 186,8 × 79,1 cm — https://www.brastemp.com.br/geladeira-brastemp-frost-free-inverse-inox-bre85mk/p";
  var FONTE_GEL500 = FONTE_GEL_CAT + "Brastemp B-Smart BRE66AK inverse 500 L, 70,5 × 194,3 × 74 cm — https://www.brastemp.com.br/geladeira-inteligente-b--smart-brastemp-frost-free-inverse-500-litros-cor-inox-bre66ak/p";
  var FONTE_SBS431 = FONTE_GEL_CAT + "Electrolux ES40S side by side 431 L, 83,6 × 178 × 62,3 cm (sem embalagem) — https://loja.electrolux.com.br/geladeira-electrolux-frost-free-inverter-431l-autosense-bivolt-side-by-side-cor-inox-look--es40s-/p";
  var FONTE_SBS526 = FONTE_GEL_CAT + "Electrolux ES5GB side by side 526 L, 91,1 × 178 × 66,6 cm — https://loja.electrolux.com.br/geladeira-electrolux-frost-free-inverter-526l-efficient-com-autosense-side-by-side-vidro-preto-es5gb/p";
  var FONTE_SBS635 = FONTE_GEL_CAT + "LG GC-L257SLP1 side by side 635 L, 91,3 × 179 × 73,5 cm — https://www.lg.com/br/geladeiras/geladeiras-side-by-side/gc-l257slp1/";
  var FONTE_LAVA_SAM = FONTE_GEL_CAT + "Samsung WD11T lava e seca 11 kg, 60 × 85 × 65 cm — https://www.samsung.com/br/washers-and-dryers/washer-dryer-combo/wd5100t-front-loading-ai-control-air-wash-drum-clean-11kg-gray-wd11t504dbxfaz";
  var FONTE_LAVA_SAM2 = FONTE_GEL_CAT + "Samsung WW11T4040 lavadora frontal 11 kg, 60 × 85 × 55 cm — https://www.samsung.com/br/washers-and-dryers/washing-machines/ww4000t-front-loading-hygiene-steam-digital-inverter-technology-drum-clean-11kg-gray-ww11t4040cx-az";
  var FONTE_LAVA_ELX = FONTE_GEL_CAT + "Electrolux LSP11 lava e seca 11 kg, 60 × 85 × 65,9 cm (sem embalagem) — https://loja.electrolux.com.br/lava-e-seca-electrolux-11kg-branca-inverter--lsp11----cesto-dobravel-para-roupas-electrolux/p";
  var FONTE_ESP_VOR = "Voratto Frésia (espreguiçadeira de piscina, alumínio e fibra sintética): 60 × 180 × 70 cm, altura do assento 28 cm — https://www.madeiramadeira.com.br/espreguicadeira-fresia-de-piscina-em-aluminio-fibra-sintetica-e-braco-jequitiba (consultada em 20/10/2026; fonte secundária: anúncio de loja).";
  var FONTE_ESP_TID = "Tidelli 6708 Padang: 71 × 204 × 114 cm (com encosto levantado); Tidelli 3708 Caraíva: 79 × 200,5 × 60 cm — catálogo de produtos da pesquisa (docs/arquitetura/interiores/dados/catalogo-alto-padrao.json), consultada em 20/10/2026; fonte secundária: loja.";
  var FONTE_VARANDA = "Relevance CJMB40 (mesa quadrada de varanda, alumínio): 67 × 67 × 75 cm; Artesane Búzios (alumínio fundido): 100 × 100 × 71 cm — anúncios em www.madeiramadeira.com.br, catálogo de produtos da pesquisa (docs/arquitetura/interiores/dados/catalogo-mobiliario.json), consultada em 20/10/2026; fonte secundária: loja.";
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
  /* lar × pro = o RECORTE do tampo: o corpo da cuba enche o recorte e a borda (aba de 1,5 cm, inox) apoia sobre o tampo, como a cuba
     de embutir de verdade. Até 28/10/2026 a cuba saía 0,50 × 0,40 num recorte de 0,54 × 0,42 — fresta de 2 cm à vista em volta. */
  function cuba(c, x, z, yTopo, lar, pro) {
    var prof = 0.20, aba = 0.015, ext = Mob.contornoRR(lar, pro, 0.03, 4), int = Mob.contornoRR(lar - 0.03, pro - 0.03, 0.02, 4);
    c.bandeja(MAT.INOX, MAT.INOX, x, yTopo - prof, z, ext, int, prof, 0.01);
    [-1, 1].forEach(function (s) {
      c.caixa(MAT.INOX, x, yTopo, z + s * (pro / 2 + aba / 2 - 0.015), lar + 2 * aba, 0.002, aba + 0.015);
      c.caixa(MAT.INOX, x + s * (lar / 2 + aba / 2 - 0.015), yTopo, z, aba + 0.015, 0.002, pro);
    });
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
      c.torno(MAT.GRAFITE, x + p[0] * (lar / 0.58), yTopo + 0.003, z + p[1] * (pro / 0.5), [[p[2], 0], [p[2], 0.003], [p[2] - 0.006, 0.003], [p[2] - 0.006, 0]], { seg: 14, aberto: false });
      c.torno(MAT.PRETO, x + p[0] * (lar / 0.58), yTopo + 0.003, z + p[1] * (pro / 0.5), [[p[2] * 0.45, 0], [p[2] * 0.45, 0.006], [0, 0.006]], { seg: 10 });
    });
    for (var i = 0; i < 4; i++) c.cil(MAT.PRETO, x - 0.18 + i * 0.12, yTopo - 0.002, z + pro / 2 - 0.01, 0.014, 0.006, { seg: 10 });
  }
  /* ---- peças de produto (lote 3b, 28/10/2026): alça de barra, painel de comandos ---- */
  /* alça de barra vertical: barra + dois suportes (afast = folga até a face); a barra é centrada em yc */
  function alcaV(c, mat, x, yc, z, comp, afast) {
    afast = afast || 0.03;
    c.caixa(mat, x, yc - comp / 2, z + afast, 0.014, comp, 0.014);
    [-1, 1].forEach(function (s) { c.caixa(mat, x, yc + s * (comp / 2 - 0.025) - 0.005, z + afast / 2, 0.01, 0.01, afast); });
  }
  /* alça de barra horizontal */
  function alcaH(c, mat, x, y, z, comp, afast) {
    afast = afast || 0.03;
    c.caixa(mat, x, y - 0.007, z + afast, comp, 0.014, 0.014);
    [-1, 1].forEach(function (s) { c.caixa(mat, x + s * (comp / 2 - 0.025), y - 0.005, z + afast / 2, 0.01, 0.01, afast); });
  }
  /* painel de comandos: moldura preta, visor e três botões */
  function painelCmd(c, x, y, z, w, h) {
    c.caixa(MAT.PRETO, x, y, z, w, h, 0.004);
    c.caixa(MAT.TELA, x, y + h * 0.5, z + 0.003, w * 0.72, h * 0.3, 0.002);
    for (var j = 0; j < 3; j++) c.cil(MAT.CROMO, x - w * 0.24 + j * w * 0.24, y + h * 0.14, z + 0.004, 0.0055, 0.003, { seg: 8, rotX: 90 });
  }
  /* banqueta de ilha: assento estofado com base, quatro pés cônicos e apoio de pés em aro (leve: ~250 triângulos) */
  function banquetaLeve(c, hs, d, tec, es) {
    var r = d / 2;
    c.cil(tec, 0, hs - 0.06, 0, r, 0.06, { seg: 18 }); c.cil(es, 0, hs - 0.075, 0, r * 0.82, 0.015, { seg: 12 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { c.tronco(es, q[0] * r * 0.6, 0, q[1] * r * 0.6, 0.032, 0.032, 0.022, 0.022, hs - 0.075, { rotX: q[1] * -5, rotZ: q[0] * 5 }); });
    c.torno(es, 0, 0.24, 0, [[r * 0.78, 0], [r * 0.78, 0.014], [r * 0.78 - 0.014, 0.014], [r * 0.78 - 0.014, 0]], { seg: 10 });
  }
  /* corpo de armário inferior: rodapé recuado, carcaça, frentes de portas (com friso) e gavetas, todas com puxador de barra */
  function corpoInferior(c, L, D, Ht, e, mat, padrao, z0, miolo, estiloFixo) {
    var rod = 0.10, hc = Ht - e - rod, nm = Math.max(1, Math.round(L / 0.6)), wm = L / nm, est = estiloFixo || (nm <= 5 ? "friso" : "liso");
    c.caixa(MAT.PRETO, 0, 0, z0 + D / 2 - 0.04, L - 0.04, rod, D - 0.10);
    c.caixa(miolo || mat, 0, rod, z0 + D / 2 - 0.01, L, hc, D - 0.02);
    for (var i = 0; i < nm; i++) {
      var x = -L / 2 + wm * (i + 0.5), gav = padrao === "gavetas" || (padrao === "misto" && i % 3 === 1), zf = z0 + D - 0.02;
      if (gav) {
        var hs = [0.19, 0.27, hc - 0.19 - 0.27 - 0.03], y = rod + 0.01;
        hs.forEach(function (h, ig) {
          var yg = y;
          H.gaveta(c, "m" + (i + 1) + "gaveta" + (ig + 1), (D - 0.10) * 0.7, function () { H.porta(c, mat, x, yg, zf, wm - 0.008, h, 0.019, ig === 2 ? est : "liso"); alcaH(c, MAT.INOX, x, yg + h - 0.04, zf + 0.019, Math.min(0.30, wm * 0.5), 0.028); H.gavetaCaixa(c, MAT.CLARA, x, yg, zf, wm - 0.008, h, D - 0.10); });
          y += h + 0.008;
        });
      } else if (wm > 0.75) {
        [-1, 1].forEach(function (s) {
          var xd = x + s * (wm - 0.008) / 4, wd = (wm - 0.012) / 2;
          H.giro(c, "m" + (i + 1) + "porta" + (s < 0 ? "e" : "d"), xd + s * wd / 2, rod + hc / 2, zf + 0.0095, s, function () { H.porta(c, mat, xd, rod + 0.01, zf, wd, hc - 0.02, 0.019, est); alcaV(c, MAT.INOX, xd - s * (wd / 2 - 0.05), rod + hc - 0.14, zf + 0.019, 0.16, 0.028); });
        });
      } else {
        var ladoI = i % 2 ? -1 : 1, wdI = wm - 0.008;
        H.giro(c, "m" + (i + 1) + "porta", x + ladoI * wdI / 2, rod + hc / 2, zf + 0.0095, ladoI, function () { H.porta(c, mat, x, rod + 0.01, zf, wdI, hc - 0.02, 0.019, est); alcaV(c, MAT.INOX, x - ladoI * (wdI / 2 - 0.05), rod + hc - 0.14, zf + 0.019, 0.16, 0.028); });
      }
    }
  }
  var P_COZ = function (L) {
    return [P("Comprimento", "comprimento", L, "Dimensões", "Comprimento da bancada (marcenaria sob medida, módulos de ~0,60 m). " + USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões", USUAL), P("Altura", "comprimento", 0.90, "Dimensões", "Do piso ao topo do tampo. " + USUAL),
      P("Espessura_tampo", "comprimento", 0.03, "Dimensões"), P("Padrao", "texto", "misto", "Construção", "portas, gavetas ou misto (um gaveteiro a cada 3 módulos)"),
      P("Com_cuba", "simnao", true, "Construção"), P("Com_cooktop", "simnao", false, "Construção"), P("Corpo", "material", "laca grafite", "Materiais", "Frentes dos armários"), P("Tampo", "material", "quartzo branco", "Materiais", "quartzo branco, granito preto ou marmore branco")];
  };
  def({
    id: "ra-coz-inferior", moveis: true, categoria: "cozinha", nome: "Armário inferior de cozinha (por comprimento)", descricao: "Bancada de cozinha de marcenaria: rodapé recuado, módulos com portas e gaveteiros, tampo de pedra com cuba de inox e torneira e cooktop embutidos (opcionais). O comprimento é o parâmetro; o número de módulos sai dele.",
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
      if (nc) cuba(c, furos[0].x, furos[0].z, Ht, furos[0].larg, furos[0].prof);
      if (nk) cooktop(c, xk, D / 2, Ht, 0.55, 0.47, 4);
    }
  });
  def({
    id: "ra-coz-superior", moveis: true, categoria: "cozinha", nome: "Armário superior de cozinha (por comprimento)", descricao: "Armário aéreo de cozinha com portas de giro e cava, fundo e prateleira. Cota de base e altura são parâmetros (a base usual fica 0,50 a 0,60 m acima do tampo).",
    parametros: [P("Comprimento", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.35, "Dimensões", USUAL), P("Altura", "comprimento", 0.70, "Dimensões"), P("Cota_base", "comprimento", 1.45, "Restrições", "Do piso à base do armário", "instancia"), P("Corpo", "material", "laca grafite", "Materiais")],
    unidade: "m", quantidade: "Comprimento", quantDesc: "Armário superior de cozinha em marcenaria",
    tipos: [T("s120", "1,20 m", { Comprimento: 1.20 }), T("s180", "1,80 m", { Comprimento: 1.80 }), T("s240", "2,40 m", {}), T("s300", "3,00 m", { Comprimento: 3.00 })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura, y0 = v.Cota_base, nm = Math.max(1, Math.round(L / 0.6)), wm = L / nm;
      c.caixa(v.Corpo, 0, y0, D / 2 - 0.01, L, Ht, D - 0.02);
      for (var i = 0; i < nm; i++) {
        var x = -L / 2 + wm * (i + 0.5);
        var ladoS = i % 2 ? -1 : 1, wdS = wm - 0.006;   // a dobradiça fica do lado oposto à cava
        H.giro(c, "porta" + (i + 1), x + ladoS * wdS / 2, y0 + Ht / 2, D - 0.02 + 0.0095, ladoS, function () { H.porta(c, v.Corpo, x, y0 + 0.004, D - 0.02, wdS, Ht - 0.008, 0.019, "friso"); alcaV(c, MAT.INOX, x - ladoS * (wdS / 2 - 0.04), y0 + 0.14, D - 0.001, 0.12, 0.025);
 });
      }
    }
  });
  def({
    id: "ra-coz-torre-quente", moveis: true, categoria: "cozinha", nome: "Torre quente (forno e micro-ondas)", descricao: "Coluna de marcenaria com gaveteiro, forno elétrico de embutir 60 cm, micro-ondas de embutir e bagageiro. Forno e micro-ondas são nichos com vidro preto e puxador.",
    parametros: [P("Largura", "comprimento", 0.62, "Dimensões", "Vão de 60 cm do forno de embutir + paredes. " + USUAL), P("Profundidade", "comprimento", 0.62, "Dimensões"), P("Altura", "comprimento", 2.40, "Dimensões"), P("Cota_forno", "comprimento", 0.80, "Construção", "Do piso à base do forno"), P("Com_micro", "simnao", true, "Construção"), P("Corpo", "material", "laca grafite", "Materiais")],
    tipos: [T("tq", "Forno 60 cm + micro-ondas", {}), T("tqf", "Só forno 60 cm", { Com_micro: false })],
        gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, yf = v.Cota_forno, rod = 0.10, zf = D - 0.02, k;
      c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.04, W - 0.04, rod, D - 0.10); c.caixa(v.Corpo, 0, rod, D / 2 - 0.01, W, Ht - rod, D - 0.02);
      var h = yf - rod - 0.012, pG = (D - 0.10);
      H.gaveta(c, "gaveta1", pG * 0.7, function () { H.porta(c, v.Corpo, 0, rod + 0.006, zf, W - 0.012, h * 0.45, 0.019, "liso"); alcaH(c, MAT.INOX, 0, rod + 0.006 + h * 0.45 - 0.04, zf + 0.019, 0.30, 0.028); H.gavetaCaixa(c, MAT.CLARA, 0, rod + 0.006, zf, W - 0.012, h * 0.45, pG); });
      H.gaveta(c, "gaveta2", pG * 0.7, function () { H.porta(c, v.Corpo, 0, rod + 0.006 + h * 0.45 + 0.008, zf, W - 0.012, h * 0.55 - 0.014, 0.019, "liso"); alcaH(c, MAT.INOX, 0, rod + 0.006 + h - 0.052, zf + 0.019, 0.30, 0.028); H.gavetaCaixa(c, MAT.CLARA, 0, rod + 0.006 + h * 0.45 + 0.008, zf, W - 0.012, h * 0.55 - 0.014, pG); });
      /* camadas da frente (vidro, painel, botões) a ≥ 2 mm uma da outra: com 0,5–1 mm e faces no mesmo plano o vidro e a tela
         brigavam no Twinmotion/Unreal e o forno e o micro-ondas PISCAVAM (Rogério, 29/10/2026) */
      /* forno de embutir 60 cm (nicho 56 × 60 × 57): moldura de inox, painel de comandos no topo, vidro preto, alça de barra, frestas de ventilação */
      c.caixaR(MAT.INOX, 0, yf, zf - 0.02, 0.595, 0.595, 0.04, 0.008, { k: 1 });
      c.caixa(MAT.PRETO, 0, yf + 0.495, zf + 0.0005, 0.56, 0.088, 0.004); c.caixa(MAT.TELA, 0, yf + 0.535, zf + 0.006, 0.16, 0.034, 0.002);
      for (k = 0; k < 4; k++) c.cil(MAT.CROMO, -0.2 + k * 0.133 + (k > 1 ? 0.0 : 0), yf + 0.512, zf + 0.006, 0.014, 0.012, { seg: 12, rotX: 90 });
      c.caixa(MAT.TELA, 0, yf + 0.06, zf + 0.0005, 0.55, 0.42, 0.004); c.caixa(MAT.GRAFITE, 0, yf + 0.06, zf + 0.004, 0.5, 0.36, 0.002);
      alcaH(c, MAT.INOX, 0, yf + 0.455, zf + 0.0005, 0.45, 0.034);
      for (k = 0; k < 5; k++) c.caixa(MAT.PRETO, 0, yf + 0.012 + k * 0.009, zf + 0.0005, 0.4, 0.003, 0.003);
      var yt = yf + 0.595 + 0.012;
      if (v.Com_micro) {
        /* micro-ondas de embutir: porta de vidro à esquerda, painel com visor e botões à direita, alça vertical */
        c.caixaR(MAT.INOX, 0, yt, zf - 0.02, 0.595, 0.38, 0.04, 0.008, { k: 1 });
        c.caixa(MAT.TELA, -0.075, yt + 0.035, zf + 0.0005, 0.4, 0.31, 0.004); c.caixa(MAT.GRAFITE, -0.075, yt + 0.035, zf + 0.004, 0.36, 0.27, 0.002);
        c.caixa(MAT.PRETO, 0.2, yt + 0.035, zf + 0.0005, 0.14, 0.31, 0.004); c.caixa(MAT.TELA, 0.2, yt + 0.27, zf + 0.006, 0.1, 0.04, 0.002);
        for (k = 0; k < 3; k++) c.caixa(MAT.CROMO, 0.2, yt + 0.2 - k * 0.055, zf + 0.006, 0.08, 0.03, 0.003);
        alcaV(c, MAT.INOX, 0.115, yt + 0.19, zf + 0.0005, 0.22, 0.03);
        yt += 0.38 + 0.012;
      }
      var hb = Ht - yt - 0.01;
      if (hb > 0.2) { H.giro(c, "bagageiro", -(W - 0.012) / 2, yt + hb / 2, zf + 0.0095, -1, function () { H.porta(c, v.Corpo, 0, yt, zf, W - 0.012, hb, 0.019, "friso"); alcaV(c, MAT.INOX, (W - 0.012) / 2 - 0.05, yt + 0.16, zf + 0.019, 0.16, 0.028); }); }
    }
  });
  def({
    id: "ra-coz-nicho-geladeira", moveis: true, categoria: "cozinha", nome: "Nicho de geladeira com bagageiro", descricao: "Nicho de marcenaria para geladeira: painéis laterais, travessa e bagageiro com portas. A geladeira é uma família à parte (a abertura livre já considera folga de ventilação).",
    parametros: [P("Vao_largura", "comprimento", 0.78, "Dimensões", "Largura livre do nicho: geladeira de ~0,72 m + 3 cm de folga por lado. " + USUAL), P("Vao_altura", "comprimento", 1.90, "Dimensões", "Altura livre"), P("Altura", "comprimento", 2.40, "Dimensões", "Altura total"), P("Profundidade", "comprimento", 0.75, "Dimensões"), P("Esp", "comprimento", 0.03, "Dimensões", "Espessura dos painéis laterais"), P("Corpo", "material", "laca grafite", "Materiais")],
    tipos: [T("n78", "Vão 0,78 (geladeira inverse)", {}), T("n94", "Vão 0,94 (side by side)", { Vao_largura: 0.94 }), T("n72", "Vão 0,72 (geladeira compacta)", { Vao_largura: 0.72 })],
    gerar: function (c, v) {
      var W = v.Vao_largura, Ht = v.Altura, hv = v.Vao_altura, D = v.Profundidade, e = v.Esp, mat = v.Corpo;
      [-1, 1].forEach(function (s) { c.caixa(mat, s * (W / 2 + e / 2), 0, D / 2, e, Ht, D); });
      c.caixa(mat, 0, hv, D / 2, W, Ht - hv, D - 0.03); c.caixa(mat, 0, 0, 0.005, W, hv, 0.01);
      var nb = 2, wb = (W + 2 * e) / nb, hb = Ht - hv - 0.02;
      for (var i = 0; i < nb; i++) {
        var x = -(W + 2 * e) / 2 + wb * (i + 0.5), wdN = wb - 0.006, ladoN = i ? 1 : -1;   // dobradiça na borda de fora, cava junto ao centro
        H.giro(c, "bagageiro" + (i + 1), x + ladoN * wdN / 2, hv + 0.01 + hb / 2, D - 0.015 + 0.0095, ladoN, function () { H.porta(c, mat, x, hv + 0.01, D - 0.015, wdN, hb, 0.019, "friso"); alcaV(c, MAT.INOX, x - ladoN * (wdN / 2 - 0.04), hv + 0.15, D + 0.004, 0.12, 0.025);
 });
      }
    }
  });
  /* ---- ilha ---- */
  def({
    id: "ra-coz-ilha", moveis: true, centro: true, categoria: "cozinha", nome: "Ilha de cozinha com cuba, cooktop e banquetas", descricao: "Ilha de marcenaria com tampo de pedra, balanço para banquetas, painéis laterais, cuba de inox e cooktop embutidos (opcionais) e as banquetas na borda do balanço. A face de trabalho fica em −Z; o balanço, em +Z.",
    parametros: [P("Comprimento", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 1.10, "Dimensões", "Corpo + balanço. " + USUAL), P("Balanco", "comprimento", 0.35, "Dimensões", "Balanço do tampo para as banquetas (apoio mínimo de ~0,30 m para os joelhos)"), P("Altura", "comprimento", 0.90, "Dimensões"), P("Espessura_tampo", "comprimento", 0.04, "Dimensões"),
      P("Com_cuba", "simnao", true, "Construção"), P("Com_cooktop", "simnao", true, "Construção"), P("Banquetas", "inteiro", 3, "Construção"), P("Altura_banqueta", "comprimento", 0.65, "Dimensões"),
      P("Corpo", "material", "madeira freijo", "Materiais"), P("Tampo", "material", "quartzo branco", "Materiais"), P("Tecido", "material", "couro caramelo", "Materiais", "Assento das banquetas")],
    tipos: [T("i200", "2,00 m, 2 banquetas", { Comprimento: 2.00, Banquetas: 2 }), T("i240", "2,40 m, 3 banquetas", {}), T("i300", "3,00 m, 4 banquetas", { Comprimento: 3.00, Banquetas: 4 }), T("i240n", "2,40 m, sem cooktop", { Com_cooktop: false })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, B = v.Balanco, Ht = v.Altura, e = v.Espessura_tampo, Dc = D - B, z0 = -D / 2, furos = [];
      var zc = z0 + Dc / 2 + 0.0;
      corpoInferior(c, L - 0.06, Dc - 0.02, Ht, e, v.Corpo, "misto", z0 + 0.01, MAT.GRAFITE, "liso");
      [-1, 1].forEach(function (s) { c.caixa(v.Corpo, s * (L / 2 - 0.015), 0.1, z0 + D / 2, 0.03, Ht - e - 0.1, D); });   // painéis laterais de ponta a ponta
      c.caixa(v.Corpo, 0, 0.1, z0 + Dc, L - 0.06, Ht - e - 0.1, 0.02);                                                   // fundo recuado sob o balanço
      var nk = v.Com_cooktop && L >= 1.8, nc = v.Com_cuba && L >= 1.4;
      if (nc) furos.push({ x: nk ? -L / 4 : -L / 6, larg: 0.54, prof: 0.42, z: z0 + Dc / 2 });
      if (nk) furos.push({ x: L / 4, larg: 0.56, prof: 0.49, z: z0 + Dc / 2 });
      tampoFuros(c, v.Tampo, L, D, e, Ht - e, z0 + D / 2, furos);
      if (nc) cuba(c, furos[0].x, furos[0].z, Ht, furos[0].larg, furos[0].prof);
      if (nk) cooktop(c, L / 4, z0 + Dc / 2, Ht, 0.55, 0.47, 4);
      var nb = Math.round(v.Banquetas), pas = 0.62;
      for (var i = 0; i < nb; i++) { var xb = (i - (nb - 1) / 2) * pas; c.grupo(xb, 0, D / 2 + 0.12, 0, function (k) { banquetaLeve(k, v.Altura_banqueta, 0.36, v.Tecido, MAT.PRETO); }); }
    }
  });
  /* ---- geladeira ---- */
  def({
    id: "ra-coz-geladeira", moveis: true, categoria: "cozinha", nome: "Geladeira", descricao: "Geladeira de cozinha com portas, puxadores e rodapé: freezer embaixo (duplex invertida), duas portas lado a lado (side by side) ou french door. Os tipos 'inverse' trazem medidas de ficha de catálogo (ver fonte).",
    parametros: [P("Largura", "comprimento", 0.725, "Dimensões", "Medida de ficha de catálogo (ver fonte do tipo)"), P("Altura", "comprimento", 1.84, "Dimensões"), P("Profundidade", "comprimento", 0.701, "Dimensões", "Sem a folga de ventilação (~5 cm atrás e 3 cm nas laterais)"),
      P("Modelo", "texto", "inverse", "Construção", "inverse, duplex, sidebyside ou frenchdoor"), P("Acabamento", "material", "inox", "Materiais")],
    tipos: [T("inv", "Frost free inverse 443 L (BRE57AK) — 72,5 × 184 × 70,1", {}, FONTE_GELADEIRA), T("inv2", "Frost free inverse 447 L (BRE57FK) — 70 × 184,5 × 75,5", { Largura: 0.70, Altura: 1.845, Profundidade: 0.755 }, FONTE_GELADEIRA),
      T("inv591", "Frost free inverse 591 L — 83,6 × 186,8 × 79,1", { Largura: 0.836, Altura: 1.868, Profundidade: 0.791 }, FONTE_GEL591), T("inv500", "Frost free inverse 500 L — 70,5 × 194,3 × 74", { Largura: 0.705, Altura: 1.943, Profundidade: 0.74 }, FONTE_GEL500),
      T("sbs431", "Side by side 431 L — 83,6 × 178 × 62,3", { Modelo: "sidebyside", Largura: 0.836, Altura: 1.78, Profundidade: 0.623 }, FONTE_SBS431), T("sbs526", "Side by side 526 L — 91,1 × 178 × 66,6", { Modelo: "sidebyside", Largura: 0.911, Altura: 1.78, Profundidade: 0.666 }, FONTE_SBS526), T("sbs635", "Side by side 635 L — 91,3 × 179 × 73,5", { Modelo: "sidebyside", Largura: 0.913, Altura: 1.79, Profundidade: 0.735 }, FONTE_SBS635),
      T("sbs", "Side by side ~0,91 × 1,79 × 0,74 (medida usual; não verificada em ficha)", { Modelo: "sidebyside", Largura: 0.91, Altura: 1.79, Profundidade: 0.74 }), T("frn", "French door ~0,91 × 1,79 × 0,74 (medida usual; não verificada em ficha)", { Modelo: "frenchdoor", Largura: 0.91, Altura: 1.79, Profundidade: 0.74 }), T("dup", "Duplex ~0,70 × 1,75 × 0,70 (medida usual; não verificada em ficha)", { Modelo: "duplex", Largura: 0.70, Altura: 1.75, Profundidade: 0.70 })],
        gerar: function (c, v) {
      var W = v.Largura, Ht = v.Altura, D = v.Profundidade, m = String(v.Modelo).toLowerCase(), ac = v.Acabamento, pe = 0.04, zf = D - 0.03, i;
      /* rodapé recuado com grelha de ventilação, corpo da cor do acabamento (laterais iguais à porta) */
      c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.02, W - 0.08, pe, D - 0.12);
      for (i = 0; i < 3; i++) c.caixa(MAT.PRETO, 0, 0.008 + i * 0.01, D - 0.058, W * 0.6, 0.005, 0.006);
      c.caixaR(MAT.GRAFITE, 0, pe, D / 2 - 0.01, W, Ht - pe, D - 0.02, 0.014);
      c.caixa(MAT.PRETO, 0, Ht - 0.03, D - 0.045, W - 0.04, 0.004, 0.03);   // fresta de ventilação superior
      if (m === "sidebyside" || m === "frenchdoor") {
        var sbs = m === "sidebyside", wL = sbs ? W * 0.45 : W * 0.5, hTop = sbs ? Ht - pe - 0.02 : (Ht - pe) * 0.66, yTop = sbs ? pe + 0.01 : Ht - hTop - 0.01;
        [-1, 1].forEach(function (s) {
          var w = sbs ? (s < 0 ? wL : W - wL - 0.012) : wL - 0.008, xx = sbs ? (s < 0 ? -W / 2 + wL / 2 + 0.005 : W / 2 - (W - wL - 0.012) / 2 - 0.005) : s * (wL / 2 + 0.004);
          /* a porta gira pela borda de FORA; a alça fica na borda de dentro (junto ao meio) */
          H.giro(c, "porta" + (s < 0 ? "e" : "d"), xx + s * w / 2, yTop + hTop / 2, zf + 0.015, s, function () {
            c.caixaR(ac, xx, yTop, zf, w, hTop, 0.03, 0.01);
            alcaV(c, MAT.INOX, xx - s * (w / 2 - 0.04), yTop + hTop * (sbs ? 0.5 : 0.35), zf + 0.03, hTop * (sbs ? 0.42 : 0.3), 0.03);
            if (sbs && s < 0) { c.caixa(MAT.PRETO, xx, yTop + hTop * 0.55, zf + 0.0305, w * 0.62, hTop * 0.2, 0.004); c.caixa(MAT.TELA, xx, yTop + hTop * 0.62, zf + 0.0335, w * 0.46, hTop * 0.035, 0.002); c.caixa(MAT.CROMO, xx, yTop + hTop * 0.57, zf + 0.0335, w * 0.2, hTop * 0.03, 0.004); }
          }, 110);
        });
        c.caixa(MAT.PRETO, 0, yTop, zf + 0.0005, 0.008, hTop, 0.02);   // junta entre as portas
        if (!sbs) { H.gaveta(c, "freezer", (D - 0.12) * 0.6, function () { var hf = Ht - pe - hTop - 0.03; c.caixaR(ac, 0, pe + 0.01, zf, W - 0.012, hf, 0.03, 0.01); alcaH(c, MAT.INOX, 0, pe + 0.01 + hf * 0.8, zf + 0.03, W * 0.55, 0.03); H.gavetaCaixa(c, MAT.LACA, 0, pe + 0.01, zf, W - 0.012, hf, D - 0.12); }); }
      } else {
        var inv = m === "inverse", hF = (Ht - pe) * (inv ? 0.30 : 0.28), hR = Ht - pe - hF - 0.03;
        var yR = inv ? pe + 0.01 + hF + 0.008 : pe + 0.01, yF = inv ? pe + 0.01 : pe + 0.01 + hR + 0.008;
        /* refrigerador: porta de giro com dobradiça à direita, alça à esquerda, painel de comandos no topo */
        H.giro(c, "porta", W / 2 - 0.006, yR + hR / 2, zf + 0.015, 1, function () {
          c.caixaR(ac, 0, yR, zf, W - 0.012, hR, 0.03, 0.01);
          alcaV(c, MAT.INOX, -W / 2 + 0.055, yR + hR * 0.62, zf + 0.03, hR * 0.5, 0.03);
          painelCmd(c, W / 2 - 0.1, yR + hR - 0.075, zf + 0.0305, 0.11, 0.05);
        }, 110);
        c.caixa(MAT.PRETO, 0, yF + hF - 0.004, zf + 0.0005, W - 0.01, 0.008, 0.02);   // junta entre porta e freezer
        var frente = function () { c.caixaR(ac, 0, yF, zf, W - 0.012, hF - 0.008, 0.03, 0.01); alcaH(c, MAT.INOX, 0, yF + hF - 0.065, zf + 0.03, W * 0.7, 0.028); };
        if (inv) H.gaveta(c, "freezer", (D - 0.12) * 0.6, function () { frente(); H.gavetaCaixa(c, MAT.LACA, 0, yF, zf, W - 0.012, hF - 0.008, D - 0.12); });
        else H.giro(c, "freezer", W / 2 - 0.006, yF + hF / 2, zf + 0.015, 1, frente, 110);
      }
    }
  });
  /* ---- máquina de lavar ---- */
  def({
    id: "ra-coz-lavadora", moveis: true, categoria: "cozinha", nome: "Máquina de lavar roupas", descricao: "Lavadora frontal (porta circular com vidro e painel) ou de carga superior (tampa e painel de comandos). Os tipos frontais trazem medidas de ficha de catálogo.",
    parametros: [P("Modelo", "texto", "frontal", "Construção", "frontal ou superior"), P("Largura", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.85, "Dimensões"), P("Profundidade", "comprimento", 0.64, "Dimensões"), P("Corpo", "material", "laca branca", "Materiais")],
    tipos: [T("f11", "Lava e seca frontal 11 kg — 60 × 85 × 64", {}, FONTE_LAVA), T("f11lg", "Lava e seca frontal 11 kg — 60 × 85 × 56", { Profundidade: 0.56 }, FONTE_LAVA), T("f11sam", "Lava e seca frontal 11 kg — 60 × 85 × 65", { Profundidade: 0.65 }, FONTE_LAVA_SAM), T("f11so", "Lavadora frontal 11 kg — 60 × 85 × 55", { Profundidade: 0.55 }, FONTE_LAVA_SAM2), T("f11elx", "Lava e seca frontal 11 kg — 60 × 85 × 65,9", { Profundidade: 0.659 }, FONTE_LAVA_ELX),
      T("sup", "Carga superior 13 kg (~0,66 × 1,06 × 0,69; medida usual, não verificada em ficha)", { Modelo: "superior", Largura: 0.66, Altura: 1.06, Profundidade: 0.69 })],
        gerar: function (c, v) {
      var W = v.Largura, Ht = v.Altura, D = v.Profundidade, fr = String(v.Modelo).toLowerCase() !== "superior";
      c.caixaR(v.Corpo, 0, 0.015, D / 2, W, Ht - 0.015, D, 0.012);
      [-1, 1].forEach(function (s) { c.cil(MAT.PRETO, s * (W / 2 - 0.04), 0, D - 0.05, 0.025, 0.015, { seg: 8 }); c.cil(MAT.PRETO, s * (W / 2 - 0.04), 0, 0.05, 0.025, 0.015, { seg: 8 }); });
      if (fr) {
        var yc = Ht * 0.43, r = Math.min(0.24, W * 0.4);
        /* anel de borracha e aro de cromo em volta da abertura (fixos); a porta redonda gira pela borda da esquerda, abre 110° para a frente */
        c.torno(MAT.BORRACHA, 0, yc, D + 0.001, [[r + 0.045, 0], [r + 0.045, 0.01], [r + 0.012, 0.016], [r + 0.012, 0]], { seg: 32, rotX: 90 });
        H.giro(c, "porta", -(r + 0.035), yc, D, -1, function () {
          c.torno(MAT.CROMO, 0, yc, D + 0.01, [[r + 0.035, -0.012], [r + 0.035, 0.0], [r + 0.012, 0.03], [r, 0.03]], { seg: 32, rotX: 90 });
          c.torno(MAT.FUME, 0, yc, D + 0.015, [[r, 0.0], [r * 0.93, 0.03], [r * 0.7, 0.045], [0, 0.05]], { seg: 32, rotX: 90 });
        }, 110);
        /* painel: gaveta de sabão à esquerda, visor, botões e seletor giratório */
        c.caixa(MAT.GRAFITE, 0, Ht - 0.125, D + 0.001, W - 0.04, 0.10, 0.004);
        c.caixa(MAT.INOX, -W / 2 + 0.12, Ht - 0.125, D + 0.004, 0.15, 0.07, 0.004); c.caixa(MAT.PRETO, -W / 2 + 0.12, Ht - 0.145, D + 0.0065, 0.07, 0.008, 0.002);
        c.caixa(MAT.TELA, 0.02, Ht - 0.1, D + 0.004, 0.12, 0.04, 0.002);
        for (var q = 0; q < 3; q++) c.cil(MAT.CROMO, -0.01 + q * 0.04, Ht - 0.15, D + 0.0035, 0.009, 0.004, { seg: 10, rotX: 90 });
        c.cil(MAT.CROMO, W / 2 - 0.085, Ht - 0.125, D + 0.003, 0.027, 0.016, { seg: 20, rotX: 90 }); c.caixa(MAT.PRETO, W / 2 - 0.085, Ht - 0.1, D + 0.0195, 0.004, 0.018, 0.001);
        c.caixa(MAT.PRETO, 0, 0.03, D + 0.001, W * 0.55, 0.03, 0.003);   // tampa do filtro
      } else {
        c.caixaR(MAT.GRAFITE, 0, Ht - 0.02, D / 2, W - 0.02, 0.02, D - 0.02, 0.008, { k: 1 });
        /* a tampa levanta pela borda de trás (eixo em X); sentido −1 = a frente sobe */
        c.parte("tampa", { tipo: "basculante", eixo: [0, Ht + 0.006, D * 0.45 - D * 0.275], angulo: 100, sentido: -1 }, function () { c.caixaR(MAT.FUME, 0, Ht, D * 0.45, W * 0.62, 0.012, D * 0.55, 0.01, { k: 1 }); c.caixaR(MAT.GRAFITE, 0, Ht, D * 0.45 - D * 0.275 + 0.01, W * 0.62 + 0.04, 0.016, 0.03, 0.006, { k: 1 }); });
        c.caixaR(MAT.GRAFITE, 0, Ht - 0.06, 0.04, W - 0.02, 0.14, 0.08, 0.012, { k: 1 }); c.caixa(MAT.TELA, 0, Ht - 0.03, 0.082, W * 0.6, 0.05, 0.003);
        painelCmd(c, W / 2 - 0.14, Ht - 0.1, 0.0825, 0.16, 0.06);
        c.cil(MAT.CROMO, -W / 2 + 0.09, Ht - 0.075, 0.082, 0.03, 0.016, { seg: 20, rotX: 90 });
      }
    }
  });

  /* ================================================================ BANHO */
  def({
    id: "ra-banho-bancada", moveis: true, categoria: "banho", nome: "Bancada de banheiro com cuba de apoio, gabinete e espelho", descricao: "Gabinete suspenso com gavetas e portas, tampo de pedra, cuba de apoio oval, torneira alta de mesa e espelho com moldura de luz embutida. Comprimento é o parâmetro.",
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
      for (var i = 0; i < nm; i++) {
        var x = -(L - 0.01) / 2 + wm * (i + 0.5);
        if (i % 2 === 0 && nm > 2) {
          [0, 1].forEach(function (g) {
            var hh = (hc - 0.02) / 2 - 0.004, yg = y0 + 0.008 + g * (hh + 0.008);
            H.gaveta(c, "m" + (i + 1) + "gaveta" + (g + 1), (D - 0.10) * 0.7, function () { H.porta(c, v.Corpo, x, yg, D - 0.02, wm - 0.008, hh, 0.019, "liso"); alcaH(c, MAT.INOX, x, yg + hh - 0.045, D - 0.001, Math.min(0.2, wm * 0.5), 0.022); H.gavetaCaixa(c, MAT.CLARA, x, yg, D - 0.02, wm - 0.008, hh, D - 0.10); });
          });
        } else {
          var ladoB = nm > 2 ? (Math.floor(i / 2) % 2 ? -1 : 1) : (i === 0 ? -1 : 1), wdB = wm - 0.008;
          H.giro(c, "m" + (i + 1) + "porta", x + ladoB * wdB / 2, y0 + hc / 2, D - 0.02 + 0.0095, ladoB, function () { H.porta(c, v.Corpo, x, y0 + 0.008, D - 0.02, wdB, hc - 0.016, 0.019, "friso"); alcaV(c, MAT.INOX, x - ladoB * (wdB / 2 - 0.04), y0 + hc - 0.14, D - 0.001, 0.12, 0.022); });
        }
      }
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
  var famBanheiraHidro = def({
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
      /* encosto moldado inclinado (lado oposto ao ralo) com apoio de cabeça, alças laterais cromadas e botões de comando no aro */
      var gE = 25, hE = (Ht - 0.035 - Math.max(0.03, fd)) / Math.cos(gE * Math.PI / 180);
      c.caixaR(mat, -L / 2 + ar + 0.30, Math.max(0.03, fd), 0, 0.07, hE, W - 2 * ar - 0.10, 0.02, { rotZ: gE });
      c.caixaR(MAT.LACA, -L / 2 + ar + 0.17, Ht - 0.14, 0, 0.09, 0.10, 0.34, 0.03, { rotZ: gE });
      [-1, 1].forEach(function (s2) { c.caixa(MAT.CROMO, 0, Ht + 0.004, s2 * (W / 2 - ar / 2 - 0.0), 0.34, 0.012, 0.012); c.caixa(MAT.CROMO, -0.17, Ht, s2 * (W / 2 - ar / 2), 0.014, 0.012, 0.03); c.caixa(MAT.CROMO, 0.17, Ht, s2 * (W / 2 - ar / 2), 0.014, 0.012, 0.03); });
      for (var bt = 0; bt < 3; bt++) c.cil(MAT.CROMO, L / 2 - ar / 2 - 0.01 - 0.08 - bt * 0.05, Ht, W / 2 - ar / 2, 0.014, 0.008, { seg: 10 });
      if (v.Com_misturador) {
        var xm = L / 2 - ar / 2 - 0.01;
        c.cil(MAT.CROMO, xm, Ht, -W / 2 + ar / 2 + 0.02, 0.025, 0.04, { seg: 12 }); c.cil(MAT.CROMO, xm, Ht + 0.04, -W / 2 + ar / 2 + 0.02, 0.013, 0.2, { seg: 10 });
        c.cilH(MAT.CROMO, xm - 0.07, Ht + 0.225, -W / 2 + ar / 2 + 0.02, 0.011, 0.16, "x", { seg: 10 });
        c.cil(MAT.CROMO, xm + 0.045, Ht + 0.04, -W / 2 + ar / 2 + 0.02, 0.01, 0.06, { seg: 8 });
      }
    }
  });
  /* F3 (27/10/2026): CONECTORES da hidromassagem — o Traçar liga AF, AQ, esgoto e o ponto de força sem o usuário pôr nada à mão.
     Posições LOCAIS (origem no centro, no piso): o misturador é o de borda do desenho (xm, zm) e a válvula/ladrão é o ralo do desenho
     (xi - 0,12; z = 0). ⚠ NENHUMA COTA É DE FICHA: o acervo não tem o manual da banheira — a altura dos pontos de água é a "BH" da Tigre
     (30 cm do piso, hidkitdados.js) e o afastamento de 20 cm entre a fria e a quente é o do misturador de mesa (Deca, p.116, 200 mm); a
     saída do sifão é DN 40 (cuba/ralo, mesma linha do lavatório). CONFERIR COM O MANUAL DA BANHEIRA ESCOLHIDA antes de executar.
     Os pontos ficam fora da face de trás (não são de parede): a banheira em plataforma recebe os tubos por baixo, pelo piso.
     Bomba: a da própria banheira (integrada, potência da ficha do fabricante — pendência no memorial); o ponto elétrico é o eletroduto de
     entrada da bomba (sistema "eletrica", como as famílias elétricas); o motor da hidromassagem já está em js/eleregras.js (forcaDireta). */
  famBanheiraHidro.conectores = [
    { id: "af", nome: "Água fria (misturador de borda)", sistema: "agua_fria", dn: 20, x: "Comprimento/2 - Aro/2 - 0.01", y: "0.30", z: "-Largura/2 + Aro/2 + 0.02", papel: "entrada", porta: "af", dir: { x: 0, y: -1, z: 0 }, origemPos: "catalogo", aConferir: "altura BH da Tigre (30 cm) e posição do misturador de borda: conferir com o manual da banheira" },
    { id: "aq", nome: "Água quente (misturador de borda)", sistema: "agua_quente", dn: 20, x: "Comprimento/2 - Aro/2 - 0.21", y: "0.30", z: "-Largura/2 + Aro/2 + 0.02", papel: "entrada", porta: "aq", dir: { x: 0, y: -1, z: 0 }, origemPos: "catalogo", aConferir: "afastamento de 20 cm entre fria e quente (misturador de mesa, Deca p.116): conferir com o manual da banheira" },
    { id: "esgoto", nome: "Esgoto (válvula e ladrão, sifão)", sistema: "esgoto", dn: 40, x: "Comprimento/2 - Aro - 0.122", y: "0.05", z: "0", papel: "saida", dir: { x: 0, y: -1, z: 0 }, origemPos: "catalogo", aConferir: "saída do sifão sob a cuba (DN 40): conferir com o manual da banheira" },
    { id: "el", nome: "Eletroduto (bomba dos jatos)", sistema: "eletrica", dn: 25, x: "-Comprimento/2 + Aro + 0.10", y: "0.15", z: "0", papel: "entrada", dir: { x: 0, y: -1, z: 0 }, origemPos: "catalogo", aConferir: "ponto de força dedicado da bomba: conferir potência e tensão na ficha do fabricante e o circuito no projeto elétrico (o eletroduto sobe pelo piso até a caixa da bomba)" }
  ];
  /* ---- box ---- */
  def({
    id: "ra-banho-box", moveis: true, categoria: "banho", nome: "Box de vidro (frontal ou de canto)", descricao: "Box de vidro temperado com perfis metálicos, porta de correr ou de abrir e puxador. 'frontal' fecha o vão entre duas paredes; 'canto' faz o L em volta do ralo. A peça é encostada: o fundo do box é a parede em Z = 0 e, no canto, a parede lateral em X = −Largura/2.",
    parametros: [P("Modelo", "texto", "frontal", "Construção", "frontal ou canto", "instancia"), P("Largura", "comprimento", 1.00, "Dimensões", "Frontal: vão entre paredes. Canto: lado do box. " + USUAL), P("Profundidade", "comprimento", 0.90, "Dimensões", "Distância da parede de fundo ao vidro da frente (largura do chuveiro)"), P("Altura", "comprimento", 1.90, "Dimensões", USUAL),
      P("Porta", "texto", "correr", "Construção", "correr ou abrir"), P("Esp_vidro", "comprimento", 0.008, "Dimensões", "Vidro temperado de 8 mm — usual"), P("Vidro", "material", "vidro", "Materiais", "vidro (incolor) ou vidro fume"), P("Perfil", "material", "metal preto", "Materiais")],
    servicos: [{ id: "vidro_frente", descricao: "Vidro temperado da frente do box (largura × altura)", unidade: "m2", quantidade: "Largura * Altura", codigo: "" },
      { id: "vidro_lateral", descricao: "Vidro temperado da lateral do box de canto (profundidade × altura)", unidade: "m2", quantidade: "Profundidade * Altura", codigo: "" }],
    tipos: [T("f100", "Frontal 1,00 m, correr", {}), T("f120", "Frontal 1,20 m, correr", { Largura: 1.20 }), T("f80a", "Frontal 0,80 m, abrir", { Largura: 0.80, Porta: "abrir" }), T("c90", "De canto 0,90 × 0,90, correr", { Modelo: "canto", Largura: 0.90, Profundidade: 0.90 }), T("c120", "De canto 1,20 × 0,90, abrir", { Modelo: "canto", Largura: 1.20, Profundidade: 0.90, Porta: "abrir" })],
        gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = v.Esp_vidro, canto = String(v.Modelo).toLowerCase() === "canto", correr = String(v.Porta).toLowerCase() === "correr", per = v.Perfil, zf = D, yb = 0.012, q = 0.022;
      function painel(x, z, larg, alt, y, eixo) {   /* vidro em pé, de largura `larg` no sentido do eixo */
        if (eixo === "x") c.caixa(v.Vidro, x, y, z, larg, alt, e); else c.caixa(v.Vidro, x, y, z, e, alt, larg);
      }
      /* folha com moldura de perfil de alumínio (quadro de 4 lados) e puxador de barra opcional */
      function folha(x, z, larg, alt, y) {
        painel(x, z, larg, alt, y, "x");
        c.caixa(per, x, y, z, larg, q, e + 0.014); c.caixa(per, x, y + alt - q, z, larg, q, e + 0.014);
        c.caixa(per, x - larg / 2 + 0.01, y, z, 0.02, alt, e + 0.014); c.caixa(per, x + larg / 2 - 0.01, y, z, 0.02, alt, e + 0.014);
      }
      /* montante de parede (perfil U) e trilho/guia do piso */
      function montante(x, z) { c.caixa(per, x, 0, z, 0.02, Ht, 0.024); }
      function barraPux(x, z, lado) { c.caixa(MAT.INOX, x, Ht * 0.52 - 0.22, z + lado * (e / 2 + 0.03), 0.014, 0.44, 0.014); [-1, 1].forEach(function (s) { c.caixa(MAT.INOX, x, Ht * 0.52 + s * 0.17 - 0.005, z + lado * (e / 2 + 0.015), 0.01, 0.01, 0.03); }); }
      function garra(x, z, y) { c.caixa(MAT.CROMO, x, y, z, 0.035, 0.05, e + 0.02); }
      c.caixa(per, 0, 0, zf, W, 0.028, 0.034);                                   // guia do piso (perfil U) na frente
      c.caixa(per, -W / 2 + 0.01, 0, D / 2, 0.02, 0.02, D);                      // guia do piso junto à parede da esquerda
      c.caixa(per, W / 2 - 0.01, 0, D / 2, canto ? 0.034 : 0.02, canto ? 0.028 : 0.02, D);   // guia da direita (no canto, a da lateral fixa)
      montante(-W / 2 + 0.01, zf);
      if (canto) { montante(W / 2 - 0.01, zf); montante(W / 2 - 0.01, 0.012); c.caixa(per, W / 2 - 0.01, Ht, D / 2, 0.02, 0.022, D); }
      else montante(W / 2 - 0.01, zf);
      if (correr) {
        c.caixa(per, 0, Ht - 0.01, zf + 0.01, W, 0.04, 0.05);                      // trilho duplo no alto
        folha(-W / 4, zf, W / 2, Ht - yb, yb); garra(-W / 4, zf, 0.3); garra(-W / 4, zf, Ht - 0.35);
        H.correr(c, "porta", -(W / 2 - 0.01), function () {
          folha(W / 4 - 0.01, zf + 0.026, W / 2 + 0.02, Ht - yb, yb); barraPux(W / 4 - 0.01 - (W / 4 + 0.01) + 0.07, zf + 0.026, 1);
          [-1, 1].forEach(function (s) { c.caixa(MAT.CROMO, W / 4 - 0.01 + s * (W / 4 - 0.04), Ht - 0.05, zf + 0.026, 0.03, 0.025, 0.03); });   // roldanas
        });
      } else {
        c.caixa(per, 0, Ht - 0.01, zf, W, 0.02, 0.03);
        var wf = W * 0.28, wp = W - wf - 0.02;
        folha(W / 2 - wf / 2 - 0.01, zf, wf, Ht - yb, yb);
        H.giro(c, "porta", -W / 2 + 0.02, Ht / 2, zf, -1, function () {
          folha(-W / 2 + 0.02 + wp / 2, zf, wp, Ht - yb, yb);
          barraPux(-W / 2 + 0.02 + wp - 0.07, zf, 1);
          [0.2, 0.55, 0.9].forEach(function (f) { c.caixa(MAT.CROMO, -W / 2 + 0.02, Ht * f - 0.03, zf, 0.034, 0.06, e + 0.02); });   // dobradiças
        }, 95);
      }
      if (canto) {
        painel(W / 2, D / 2, D - 0.04, Ht - yb, yb, "z");                          // lateral fixa (vidro em Z) com moldura
        c.caixa(per, W / 2, yb, D / 2, e + 0.014, q, D - 0.04); c.caixa(per, W / 2, Ht - q, D / 2, e + 0.014, q, D - 0.04);
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
      /* porta do cinzeiro com alça, puxadores da grelha, moldura da boca e chapéu da chaminé */
      c.caixa(MAT.GRAFITE, 0, 0.05, D - 0.008, W * 0.5, yb - 0.1, 0.008); c.caixa(MAT.INOX, 0, yb - 0.1, D - 0.001, W * 0.3, 0.012, 0.003);
      [-1, 1].forEach(function (s2) { c.cilH(MAT.PRETO, s2 * (W / 2 - pil - 0.06), yb + 0.16, D - 0.05, 0.006, 0.08, "z", { seg: 5 }); });
      c.caixa(rf, 0, yb + hb - 0.02, D - 0.025, W - 2 * pil + 0.04, 0.04, 0.03); [-1, 1].forEach(function (s2) { c.caixa(rf, s2 * (W / 2 - pil), yb, D - 0.025, 0.03, hb - 0.02, 0.03); });
      c.caixa(rv, 0, Ht - 0.05, D / 2, dl + 0.08, 0.05, dl + 0.08);
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
    tipos: [T("m180", "1,80 × 0,85 (6 lugares com bancos)", { Comprimento: 1.80 }), T("m220", "2,20 × 0,85 (8 lugares com bancos)", {}), T("m260", "2,60 × 0,90 (10 lugares com bancos)", { Comprimento: 2.60, Largura: 0.90 }), T("q67", "Quadrada 0,67 × 0,67 × 0,75 (sem bancos)", { Comprimento: 0.67, Largura: 0.67, Altura: 0.75, Bancos: false }, FONTE_VARANDA), T("q100", "Quadrada 1,00 × 1,00 × 0,71 (sem bancos)", { Comprimento: 1.00, Largura: 1.00, Altura: 0.71, Bancos: false }, FONTE_VARANDA)],
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
    tipos: [T("e195", "1,95 × 0,62", {}), T("e200l", "2,00 × 0,70 (larga)", { Comprimento: 2.00, Largura: 0.70 }), T("e195p", "Encosto reto 60°", { Angulo_encosto: 60 }), T("e180f", "1,80 × 0,60 — assento a 0,28 m", { Comprimento: 1.80, Largura: 0.60, Altura_assento: 0.28, Angulo_encosto: 45 }, FONTE_ESP_VOR), T("e204", "2,04 × 0,71", { Comprimento: 2.04, Largura: 0.71, Angulo_encosto: 45 }, FONTE_ESP_TID), T("e200c", "2,005 × 0,79", { Comprimento: 2.005, Largura: 0.79, Angulo_encosto: 45 }, FONTE_ESP_TID)],
        gerar: function (c, v) {
      /* UMA PEÇA SÓ (28/10/2026): duas longarinas de alumínio contínuas (encosto → articulação → assento → apoio dos pés), o encosto sobe a
         `Angulo_encosto` graus sobre a horizontal e se apoia numa escora presa ao assento; os pés do lado da cabeceira têm rodas.
         Eixos: comprimento em Z (cabeceira em −Z, pés em +Z), altura em Y, origem no centro. */
      var L = v.Comprimento, W = v.Largura, hs = v.Altura_assento, a = v.Angulo_encosto, es = v.Estrutura, tec = v.Colchonete, RAD = Math.PI / 180;
      var Le = L * 0.30, Lp = L * 0.22, gP = 12, sa = Math.sin(a * RAD), ca = Math.cos(a * RAD), run = Le * ca, runP = Lp * Math.cos(gP * RAD);
      var zH = -L / 2 + run, zF = zH + (L - run - runP), yR = hs - 0.045, t = 0.032, xs = W / 2 - 0.025;   /* articulação, fim do assento, cota da longarina */
      /* barra de (y1,z1) a (y2,z2), seção dx × dy: o comprimento vai em Z e o giro em X leva a barra até o ponto final */
      function barra(mat, x, y1, z1, y2, z2, dx, dy, extra) {
        if (z2 < z1) { var ty = y1, tz = z1; y1 = y2; z1 = z2; y2 = ty; z2 = tz; }
        var dz = z2 - z1, dyy = y2 - y1, Lb = Math.sqrt(dz * dz + dyy * dyy) + (extra || 0), g = Math.atan2(-dyy, dz) / RAD;
        c.caixaR(mat, x, (y1 + y2) / 2, (z1 + z2) / 2, dx, dy, Lb, Math.min(dx, dy) * 0.3, { k: 1, rotX: g });
      }
      var yTopo = yR + Le * sa, zCab = -L / 2, zPe = zF + runP, yPe = yR - Lp * Math.sin(gP * RAD);
      [-1, 1].forEach(function (s) {
        var x = s * xs;
        barra(es, x, yTopo, zCab, yR, zH, t, t, 0.02);                    // longarina do encosto (sobe até a cabeceira)
        barra(es, x, yR, zH, yR, zF, t, t, 0.02);                          // longarina do assento
        barra(es, x, yR, zF, yPe, zPe, t, t, 0.02);                        // longarina do apoio dos pés (desce 12°)
        barra(es, x, yR - 0.012, zH + 0.30, yR + Le * sa * 0.62, zH - run * 0.62, 0.022, 0.022);   // escora do encosto presa ao assento
        /* pés: do lado da cabeceira com rodas, do lado dos pés com ponteiras de borracha; as pernas sobem até a longarina */
        c.cil(es, x, 0.09, zH + 0.12, 0.016, yR - 0.09 + 0.01, { seg: 8 });
        c.cil(es, x, 0.04, zPe - 0.06, 0.016, yPe - 0.04 + 0.01, { seg: 8 }); c.cil(MAT.BORRACHA, x, 0, zPe - 0.06, 0.022, 0.04, { seg: 10 });
        c.caixa(es, x, 0.07, zH + 0.12, t * 0.8, 0.04, 0.09);              // cavalete do eixo
        c.cil(MAT.BORRACHA, x + s * 0.024, 0.0, zH + 0.12, 0.045, 0.03, { seg: 14, rotZ: 90, centro: true });   // roda (centro no eixo)
      });
      c.caixa(es, 0, yR - 0.016, zH + 0.12, W - 0.04, 0.03, 0.03);        // travessa do eixo das rodas
      [[zH, yR], [zF, yR], [zCab + 0.02, yTopo], [zPe - 0.02, yPe]].forEach(function (p) { c.caixa(es, 0, p[1] - 0.016, p[0], W - 0.04, 0.026, 0.026); });   // travessas
      c.caixa(es, 0, yR - 0.016, (zH + zF) / 2, W - 0.04, 0.026, 0.026);
      /* colchonete: três módulos ligados na articulação (cada um um pouco maior que a longarina), costuras e travesseiro */
      function mod(y1, z1, y2, z2, ext) {
        if (z2 < z1) { var ty = y1, tz = z1; y1 = y2; z1 = z2; y2 = ty; z2 = tz; }
        var dz = z2 - z1, dyy = y2 - y1, Lb = Math.sqrt(dz * dz + dyy * dyy), g = Math.atan2(-dyy, dz) / RAD, nz = -dyy / Lb, ny = dz / Lb;
        c.caixaR(tec, 0, (y1 + y2) / 2 + ny * 0.016, (z1 + z2) / 2 + nz * 0.016, W - 0.03, 0.06, Lb + (ext || 0), 0.03, { rotX: g });
      }
      mod(yTopo, zCab + 0.03, yR, zH, 0.02); mod(yR, zH, yR, zF, 0.02); mod(yR, zF, yPe, zPe, 0.02);
      [0.3, 0.6].forEach(function (f) { c.caixa(MAT.PRETO, 0, yR + 0.052, zH + (zF - zH) * f, W - 0.06, 0.002, 0.004); });
      c.caixaR(tec, 0, yTopo + 0.03, zCab + 0.14, W * 0.62, 0.07, 0.2, 0.03, { rotX: a });   // travesseiro da cabeceira
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
      for (var iv = 0; iv < 8; iv++) c.grupo(0, 0, 0, iv * 45, function (k) { k.caixa(v.Mastro, 0, yb - 0.035, R * 0.985, 0.016, 0.04, 0.016); });   // ponteiras das varetas no beiral
      c.cil(MAT.CROMO, 0.04, 1.2, 0, 0.012, 0.02, { seg: 8, rotZ: 90 });   // manivela
      c.cil(MAT.PRETO, 0, 0.07, 0, 0.032, 0.02, { seg: 10 });   // colar da base
    }
  });

  FM.registrar();
  if (typeof module !== "undefined" && module.exports) module.exports = FM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

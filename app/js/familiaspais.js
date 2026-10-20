/* =====================================================================
 * familiaspais.js — PAISAGISMO da biblioteca RA (19/10/2026)
 *
 * Espécies e elementos de jardim residencial tropical (Uberlândia/MG, cerrado), em famílias de
 * geometria "mob" (js/familia.js ← js/familiasmob.js ← js/mobgeo.js): palmeiras, árvores de porte
 * residencial, arbustos, forrações (piso), vaso, pedras e seixos, deck e pergolado de madeira.
 *
 * COMO DESENHA. Folha de palmeira, folha de agapanto e moreia são LÂMINAS finas e fechadas que se
 * erguem e caem (Mob.lamina); copa de árvore é um conjunto de elipsoides sorteado por semente
 * (a mesma semente dá a mesma árvore, para o desenho não mudar a cada abertura). Poucos
 * polígonos por peça: a árvore tem ~1 mil triângulos; a grama, ~0,5 por tufo.
 *
 * SÍMBOLO DE COPA NA PLANTA. Cada espécie com copa devolve `simboloPlanta` (círculos de projeção da
 * copa e do tronco) — o desenho técnico (js/bim.js vista2d) usa o símbolo no lugar do emaranhado de
 * arestas da malha.
 *
 * ⚠ PORTES SÃO "USUAIS DE PAISAGISMO RESIDENCIAL" — não vêm de uma tabela de viveiro. Cada parâmetro de
 *   porte diz isso; o paisagista confere a muda que for comprar. Nenhum preço, nenhum código SINAPI.
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
  var P = FM.P, T = FM.T, def = FM.def, MAT = FM.MAT, clamp = FM.H.clamp;
  var PORTE = "Porte usual de paisagismo residencial — conferir a muda comprada.";

  /* materiais de planta (nomes que o 3D conhece) */
  var M = { TRONCO: "tronco palmeira", CASCA: "casca de arvore", F1: "folha verde escura", F2: "folha verde", F3: "folha verde clara", VAR: "folha variegada",
    AMARELA: "flor amarela", ROSA: "flor rosa", LILAS: "flor lilas", AZUL: "flor azul", BRANCA: "flor branca", GRAMA1: "grama esmeralda", GRAMA2: "grama amendoim", SEIXO: "seixo", PEDRA: "pedra cinza", TERRA: "terra", VASO: "ceramica terracota" };
  Object.keys(M).forEach(function (k) { MAT[k] = M[k]; });
  var DESC_ORIGEM = " Origem: no piso, no centro da base (o tronco ou a touceira).";

  function pdef(o) {
    o.centro = true; o.categoria = "paisagismo"; o.semOrigem = false;
    var f = def(o); f.descricao = f.descricao.replace(/ Origem: no piso, no centro da peça\./, DESC_ORIGEM);
    return f;
  }
  /* folha de palmeira / lâmina em volta do eixo vertical */
  function leque(c, mat, x, y, z, n, compr, larg, inclMin, inclMax, curvaMin, curvaMax, rnd, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var yaw = 360 * i / n + rnd.entre(-12, 12), incl = rnd.entre(inclMin, inclMax), cv = rnd.entre(curvaMin, curvaMax), cp = compr * rnd.entre(0.82, 1.08);
      c.lamina(mat, x, y, z, cp, larg, { rotY: yaw, inclina: incl, curva: cv, seg: opt.seg || 7, perfil: opt.perfil, esp: opt.esp || 0.004 });
    }
  }
  var SERRA = [0.35, 0.8, 0.5, 0.9, 0.55, 0.85, 0.5, 0.75, 0.4, 0.55, 0.25, 0.1];   /* folíolos: largura que oscila */
  /* copa: blobs de elipsoide sorteados dentro de um elipsoide maior */
  function copa(c, mats, cx, cy, cz, rx, ry, rz, n, rnd, seg) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, b = Math.acos(1 - 2 * rnd()), r = Math.pow(rnd(), 0.5), px = Math.sin(b) * Math.cos(a) * r * rx * 0.72, py = Math.cos(b) * r * ry * 0.72, pz = Math.sin(b) * Math.sin(a) * r * rz * 0.72;
      var s = rnd.entre(0.26, 0.42), mat = mats[Math.floor(rnd() * mats.length) % mats.length];
      c.elipsoide(mat, cx + px, cy + py, cz + pz, rx * s, ry * s * 0.8, rz * s, { seg: seg || 12, aneis: 6 });
    }
  }
  function flores(c, mat, cx, cy, cz, rx, ry, rz, n, rnd, raio) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 0.9), r = 0.82 + rnd() * 0.2;
      c.elipsoide(mat, cx + Math.sin(b) * Math.cos(a) * rx * r, cy + Math.cos(b) * ry * r * 0.9, cz + Math.sin(b) * Math.sin(a) * rz * r, raio, raio * 0.8, raio, { seg: 6, aneis: 3 });
    }
  }
  function hastes(c, mat, n, raio, alt, abre, rnd, topos) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * 360, d = rnd.entre(0.2, 1) * abre, h = alt * rnd.entre(0.78, 1.0), inc = Math.atan2(d, h) * 180 / Math.PI * 0.55;
      var bx = Math.cos(a * Math.PI / 180) * d * 0.25, bz = Math.sin(a * Math.PI / 180) * d * 0.25;
      c.cil(mat, bx, 0, bz, raio, h, { r2: raio * 0.8, seg: 7, rotZ: -Math.cos(a * Math.PI / 180) * inc, rotX: Math.sin(a * Math.PI / 180) * inc });
      topos.push([bx + Math.cos(a * Math.PI / 180) * h * Math.sin(inc * Math.PI / 180), h * Math.cos(inc * Math.PI / 180), bz + Math.sin(a * Math.PI / 180) * h * Math.sin(inc * Math.PI / 180)]);
    }
  }

  /* ================================================================ PALMEIRAS */
  pdef({
    id: "ra-pais-palmeira-rafia", nome: "Palmeira-ráfia (Rhapis excelsa)", descricao: "Touceira de hastes finas e fibrosas, cada uma com um leque de folhas largas e recortadas. Vaso de jardim ou canteiro; tolera meia-sombra.",
    parametros: [P("Altura", "comprimento", 2.20, "Porte", "Altura da touceira. " + PORTE), P("Hastes", "inteiro", 8, "Porte", "Número de hastes"), P("Diametro_copa", "comprimento", 1.40, "Porte"), P("Semente", "inteiro", 11, "Construção", "Muda o sorteio de posições; a mesma semente dá a mesma planta", "instancia")],
    tipos: [T("r15", "Muda 1,50 m", { Altura: 1.50, Hastes: 5, Diametro_copa: 1.00 }), T("r22", "Touceira 2,20 m", {}), T("r30", "Touceira 3,00 m", { Altura: 3.00, Hastes: 11, Diametro_copa: 1.80 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), tops = [], n = Math.max(2, Math.round(v.Hastes)), ab = v.Diametro_copa / 2;
      hastes(c, MAT.TRONCO, n, 0.014, v.Altura * 0.82, ab, rnd, tops);
      tops.forEach(function (t) { leque(c, MAT.F1, t[0], t[1], t[2], 7, v.Altura * 0.24, 0.07, 18, 55, 18, 45, rnd, { seg: 5 }); c.elipsoide(MAT.F1, t[0], t[1] + 0.02, t[2], 0.05, 0.035, 0.05, { seg: 6, aneis: 3 }); });
      c.torno(MAT.TERRA, 0, 0, 0, [[ab * 0.75, 0], [ab * 0.75, 0.03], [ab * 0.6, 0.04], [0, 0.04]], { seg: 20 });
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro_copa / 2, estilo: "palmeira" }], tronco: [] }; }
  });
  pdef({
    id: "ra-pais-areca", nome: "Areca-bambu (Dypsis lutescens)", descricao: "Touceira alta de hastes anelares amareladas com folhas pinadas arqueadas. Pleno sol ou meia-sombra; comum em divisa e canteiro.",
    parametros: [P("Altura", "comprimento", 3.50, "Porte", PORTE), P("Hastes", "inteiro", 11, "Porte"), P("Diametro_copa", "comprimento", 2.40, "Porte"), P("Semente", "inteiro", 5, "Construção", "", "instancia")],
    tipos: [T("a20", "Muda 2,00 m", { Altura: 2.00, Hastes: 7, Diametro_copa: 1.60 }), T("a35", "Touceira 3,50 m", {}), T("a50", "Touceira 5,00 m", { Altura: 5.00, Hastes: 15, Diametro_copa: 3.20 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), n = Math.max(3, Math.round(v.Hastes)), H = v.Altura, ab = v.Diametro_copa / 2;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * 360 + rnd.entre(-15, 15), h = H * rnd.entre(0.55, 1.0), d = ab * 0.25 * rnd.entre(0.3, 1), inc = rnd.entre(2, 9), ar = a * Math.PI / 180;
        c.cil(MAT.F3, Math.cos(ar) * d * 0.4, 0, Math.sin(ar) * d * 0.4, 0.022, h, { r2: 0.016, seg: 7, rotZ: -Math.cos(ar) * inc, rotX: Math.sin(ar) * inc });
        var tx = Math.cos(ar) * d * 0.4 + Math.cos(ar) * h * Math.sin(inc * Math.PI / 180), tz = Math.sin(ar) * d * 0.4 + Math.sin(ar) * h * Math.sin(inc * Math.PI / 180);
        leque(c, MAT.F2, tx, h * Math.cos(inc * Math.PI / 180) - 0.05, tz, 5, H * 0.38, 0.22, 25, 55, 55, 85, rnd, { perfil: SERRA, seg: 8, esp: 0.004 });
      }
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro_copa / 2, estilo: "palmeira" }], tronco: [] }; }
  });
  pdef({
    id: "ra-pais-fenix", nome: "Palmeira-fênix (Phoenix roebelenii)", descricao: "Palmeira-anã de estipe único com bases de folha em losango e copa esférica de folhas pinadas arqueadas. Pleno sol; ideal para entrada e canteiro.",
    parametros: [P("Altura", "comprimento", 2.60, "Porte", "Altura total até o ápice da copa. " + PORTE), P("Diametro_copa", "comprimento", 2.20, "Porte"), P("Folhas", "inteiro", 26, "Porte"), P("Semente", "inteiro", 3, "Construção", "", "instancia")],
    tipos: [T("f18", "Muda 1,80 m", { Altura: 1.80, Diametro_copa: 1.60, Folhas: 18 }), T("f26", "Adulta 2,60 m", {}), T("f35", "Adulta 3,50 m", { Altura: 3.50, Diametro_copa: 2.80, Folhas: 34 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), H = v.Altura, ht = H * 0.62, R = v.Diametro_copa / 2, perf = [[0.11, 0]], y = 0;
      while (y < ht) { y += 0.07; perf.push([0.088 + (rnd() < 0.5 ? 0.012 : 0.0), y]); }
      perf.push([0.13, ht + 0.02]); perf.push([0.04, ht + 0.1]);
      c.torno(MAT.TRONCO, 0, 0, 0, perf, { seg: 12 });
      leque(c, MAT.F1, 0, ht + 0.02, 0, Math.max(8, Math.round(v.Folhas)), R * 1.05, 0.30, 12, 62, 38, 85, rnd, { perfil: SERRA, seg: 9, esp: 0.004 });
      leque(c, MAT.F2, 0, ht + 0.08, 0, 6, R * 0.8, 0.22, 68, 82, 10, 35, rnd, { perfil: SERRA, seg: 7 });
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro_copa / 2, estilo: "palmeira" }], tronco: [{ x: 0, z: 0, r: 0.1 }] }; }
  });

  /* ================================================================ ÁRVORES PEQUENAS */
  function arvore(c, v, matFolha, matFlor, nFloresBase) {
    var rnd = Mob.sorteio(v.Semente), H = v.Altura, R = v.Diametro_copa / 2, ht = v.Altura_tronco, dt = v.Diametro_tronco / 2;
    c.torno(MAT.CASCA, 0, 0, 0, [[dt * 1.35, 0], [dt * 1.1, 0.12], [dt, ht * 0.6], [dt * 0.8, ht]], { seg: 10 });
    var nb = Math.max(2, Math.round(v.Galhos));
    for (var i = 0; i < nb; i++) {
      var a = (i / nb) * Math.PI * 2 + rnd.entre(-0.3, 0.3), inc = rnd.entre(18, 34), lb = (H - ht) * 0.7;
      c.cil(MAT.CASCA, Math.cos(a) * dt * 0.3, ht - 0.05, Math.sin(a) * dt * 0.3, dt * 0.55, lb, { r2: dt * 0.22, seg: 6, rotZ: -Math.cos(a) * inc, rotX: Math.sin(a) * inc });
    }
    var cy = ht + (H - ht) * 0.55;
    copa(c, matFolha, 0, cy, 0, R, (H - ht) * 0.5, R, Math.round(v.Densidade * 1.6), rnd, 12);
    if (v.Florada) flores(c, matFlor, 0, cy, 0, R * 0.95, (H - ht) * 0.46, R * 0.95, nFloresBase, rnd, 0.05);
  }
  var PAR_ARV = function (H, D, ht) {
    return [P("Altura", "comprimento", H, "Porte", PORTE), P("Diametro_copa", "comprimento", D, "Porte"), P("Altura_tronco", "comprimento", ht, "Porte", "Do solo à primeira bifurcação"), P("Diametro_tronco", "comprimento", 0.12, "Porte"),
      P("Galhos", "inteiro", 3, "Porte"), P("Densidade", "inteiro", 14, "Construção", "Massas de folhagem (mais = copa mais cheia e mais pesada)"), P("Florada", "simnao", true, "Construção", "Mostra a florada da estação"), P("Semente", "inteiro", 7, "Construção", "", "instancia")];
  };
  pdef({
    id: "ra-pais-reseda", nome: "Resedá (Lagerstroemia indica)", descricao: "Árvore pequena de copa arredondada e tronco liso, com florada rosa-lilás no verão. Boa para calçada e jardim residencial.",
    parametros: PAR_ARV(4.50, 3.20, 1.40),
    tipos: [T("r30", "Muda 3,00 m", { Altura: 3.00, Diametro_copa: 2.00, Altura_tronco: 1.10, Densidade: 10 }), T("r45", "Adulta 4,50 m", {}), T("r60", "Adulta 6,00 m", { Altura: 6.00, Diametro_copa: 4.20, Altura_tronco: 1.80, Diametro_tronco: 0.18, Densidade: 18 })],
    gerar: function (c, v) { arvore(c, v, [MAT.F2, MAT.F1, MAT.F2, MAT.F3], MAT.LILAS, 34); },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro_copa / 2 }], tronco: [{ x: 0, z: 0, r: v.Diametro_tronco / 2 }] }; }
  });
  pdef({
    id: "ra-pais-ipe-jardim", nome: "Ipê-de-jardim (Tecoma stans)", descricao: "Árvore pequena de várias hastes e folhagem verde-clara com cachos de flores amarelas. Pleno sol; muito usada em jardim residencial.",
    parametros: PAR_ARV(4.00, 2.80, 1.00),
    tipos: [T("i25", "Muda 2,50 m", { Altura: 2.50, Diametro_copa: 1.60, Altura_tronco: 0.70, Densidade: 9 }), T("i40", "Adulta 4,00 m", {}), T("i50", "Adulta 5,00 m", { Altura: 5.00, Diametro_copa: 3.60, Altura_tronco: 1.30, Densidade: 16 })],
    gerar: function (c, v) { arvore(c, v, [MAT.F3, MAT.F2, MAT.F3], MAT.AMARELA, 40); },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro_copa / 2 }], tronco: [{ x: 0, z: 0, r: v.Diametro_tronco / 2 }] }; }
  });

  /* ================================================================ ARBUSTOS */
  pdef({
    id: "ra-pais-moreia", nome: "Moreia (Dietes bicolor)", descricao: "Touceira de folhas em lâmina eretas, verde-acinzentadas, com flores amarelo-claras. Pleno sol; rústica, comum em canteiros de entrada.",
    parametros: [P("Altura", "comprimento", 0.80, "Porte", PORTE), P("Diametro", "comprimento", 0.70, "Porte"), P("Folhas", "inteiro", 22, "Porte"), P("Florada", "simnao", true, "Construção"), P("Semente", "inteiro", 2, "Construção", "", "instancia")],
    tipos: [T("m60", "Touceira 0,60 m", { Altura: 0.60, Diametro: 0.50, Folhas: 16 }), T("m80", "Touceira 0,80 m", {}), T("m100", "Touceira 1,00 m", { Altura: 1.00, Diametro: 0.90, Folhas: 30 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), n = Math.max(5, Math.round(v.Folhas)), H = v.Altura, R = v.Diametro / 2;
      for (var i = 0; i < n; i++) {
        var yaw = 360 * i / n + rnd.entre(-18, 18), d = rnd.entre(0.02, R * 0.35);
        c.lamina(MAT.F2, Math.cos(yaw * Math.PI / 180) * d, 0, Math.sin(yaw * Math.PI / 180) * d, H * rnd.entre(0.8, 1.15), 0.028, { rotY: yaw, inclina: rnd.entre(68, 84), curva: rnd.entre(20, 52), seg: 5, esp: 0.003, perfil: [0.9, 1, 0.9, 0.7, 0.45, 0.2] });
      }
      if (v.Florada) for (var j = 0; j < 4; j++) { var a = rnd() * 6.28, d2 = rnd() * R * 0.5; c.cil(MAT.F2, Math.cos(a) * d2, 0, Math.sin(a) * d2, 0.004, H * 1.1, { seg: 5 }); c.elipsoide(MAT.AMARELA, Math.cos(a) * d2, H * 1.1, Math.sin(a) * d2, 0.035, 0.012, 0.035, { seg: 7, aneis: 3 }); }
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro / 2, estilo: "arbusto" }], tronco: [] }; }
  });
  pdef({
    id: "ra-pais-agapanto", nome: "Agapanto (Agapanthus africanus)", descricao: "Touceira de folhas em fita arqueadas e hastes florais altas com umbelas azul-violeta. Meia-sombra ou sol; clássico de borda de canteiro.",
    parametros: [P("Altura", "comprimento", 0.50, "Porte", "Altura das folhas. " + PORTE), P("Altura_flor", "comprimento", 0.90, "Porte", "Altura das hastes florais"), P("Diametro", "comprimento", 0.60, "Porte"), P("Folhas", "inteiro", 16, "Porte"), P("Hastes_florais", "inteiro", 5, "Porte"), P("Semente", "inteiro", 4, "Construção", "", "instancia")],
    tipos: [T("g1", "Touceira média", {}), T("g2", "Touceira pequena", { Altura: 0.35, Altura_flor: 0.65, Diametro: 0.40, Folhas: 10, Hastes_florais: 3 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), n = Math.round(v.Folhas), R = v.Diametro / 2;
      for (var i = 0; i < n; i++) c.lamina(MAT.F1, 0, 0, 0, v.Altura * rnd.entre(1.0, 1.5), 0.035, { rotY: 360 * i / n + rnd.entre(-14, 14), inclina: rnd.entre(48, 72), curva: rnd.entre(55, 90), seg: 6, esp: 0.003, perfil: [0.8, 1, 1, 0.9, 0.7, 0.3] });
      for (var j = 0; j < Math.round(v.Hastes_florais); j++) {
        var a = rnd() * 6.28, d = rnd.entre(0, R * 0.55), hx = Math.cos(a) * d, hz = Math.sin(a) * d, hh = v.Altura_flor * rnd.entre(0.85, 1.0);
        c.cil(MAT.F2, hx, 0, hz, 0.005, hh, { r2: 0.0035, seg: 5 });
        c.elipsoide(MAT.AZUL, hx, hh + 0.04, hz, 0.075, 0.06, 0.075, { seg: 9, aneis: 5 });
      }
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro / 2, estilo: "arbusto" }], tronco: [] }; }
  });
  pdef({
    id: "ra-pais-clusia", nome: "Clúsia (Clusia fluminensis) — cerca viva", descricao: "Cerca viva densa de folhas grossas e verde-escuras, em trecho por comprimento. Usada para fechar divisa e dar privacidade; poda a 1,50 a 2,50 m.",
    parametros: [P("Comprimento", "comprimento", 2.00, "Porte", "Comprimento do trecho de cerca viva"), P("Altura", "comprimento", 2.00, "Porte", PORTE), P("Largura", "comprimento", 0.80, "Porte", "Espessura da cerca"), P("Semente", "inteiro", 9, "Construção", "", "instancia")],
    tipos: [T("c15", "Cerca 1,50 m de altura", { Altura: 1.50, Largura: 0.70 }), T("c20", "Cerca 2,00 m de altura", {}), T("c25", "Cerca 2,50 m de altura", { Altura: 2.50, Largura: 0.90 })],
    unidade: "m", quantidade: "Comprimento", quantDesc: "Cerca viva de clúsia",
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), L = v.Comprimento, H = v.Altura, W = v.Largura;
      c.caixaR(MAT.F1, 0, 0.25, 0, L, H - 0.3, W * 0.7, Math.min(0.18, W / 4), { k: 1 });
      var n = Math.max(10, Math.round(L / 0.09 * (H / 0.9)));
      for (var i = 0; i < n; i++) {   /* massas de folhagem na superfície da cerca (frente, trás e topo), para ela não parecer um bloco liso */
        var face = rnd(), x = rnd.entre(-L / 2, L / 2), r = rnd.entre(0.1, 0.17), y, z;
        if (face < 0.4) { y = rnd.entre(0.35, H - 0.1); z = W * 0.4; } else if (face < 0.8) { y = rnd.entre(0.35, H - 0.1); z = -W * 0.4; } else { y = H - 0.08; z = rnd.entre(-W * 0.35, W * 0.35); }
        c.elipsoide(i % 3 === 0 ? MAT.F2 : MAT.F1, x, y, z, r, r * 0.8, r, { seg: 8, aneis: 4 });
      }
      c.caixa(MAT.TERRA, 0, 0, 0, L + 0.1, 0.04, W + 0.1);
    },
    simbolo: function (v) { return { faixa: { x: 0, z: 0, larg: v.Comprimento, prof: v.Largura * 0.9, trama: "cruzada", passo: 0.2 } }; }
  });

  /* ================================================================ FORRAÇÕES (PISO) */
  function forracao(c, v, matBase, matTufo, folhaPlana) {
    var rnd = Mob.sorteio(v.Semente), W = v.Largura, D = v.Profundidade, e = v.Espessura;
    c.caixaR(MAT.TERRA, 0, 0, 0, W, 0.02, D, 0.004, { k: 1 });
    c.caixaR(matBase, 0, 0.02, 0, W - 0.004, e, D - 0.004, Math.min(0.012, e), { k: 1 });
    var area = W * D, n = clamp(Math.round(area * (folhaPlana ? 12 : 14)), 12, 160);
    for (var i = 0; i < n; i++) {
      var x = rnd.entre(-W / 2 + 0.05, W / 2 - 0.05), z = rnd.entre(-D / 2 + 0.05, D / 2 - 0.05);
      if (folhaPlana) c.elipsoide(i % 6 === 0 ? MAT.F3 : matTufo, x, 0.02 + e + 0.006, z, 0.05, 0.008, 0.045, { seg: 6, aneis: 3, rotY: rnd() * 180 });
      else c.cil(matTufo, x, 0.02 + e - 0.004, z, 0.03, 0.07, { r2: 0.002, seg: 4, semTampa: true, rotX: rnd.entre(-12, 12), rotZ: rnd.entre(-12, 12) });
    }
    return rnd;
  }
  var PAR_FORR = function () { return [P("Largura", "comprimento", 2.00, "Dimensões", "Largura do canteiro/gramado"), P("Profundidade", "comprimento", 3.00, "Dimensões"), P("Espessura", "comprimento", 0.04, "Dimensões", "Altura da folhagem sobre o solo"), P("Semente", "inteiro", 1, "Construção", "", "instancia")]; };
  pdef({
    id: "ra-pais-grama-esmeralda", nome: "Grama esmeralda (Zoysia japonica) — piso", descricao: "Gramado em placas (piso verde-médio fino): retângulo por largura × profundidade, com tufos sobre o solo. Quantitativo em m².",
    parametros: PAR_FORR(), unidade: "m2", quantidade: "Largura * Profundidade", quantDesc: "Grama esmeralda em placas",
    tipos: [T("g23", "2 × 3 m", {}), T("g44", "4 × 4 m", { Largura: 4, Profundidade: 4 }), T("g1", "1 × 1 m", { Largura: 1, Profundidade: 1 })],
    gerar: function (c, v) { forracao(c, v, MAT.GRAMA1, MAT.GRAMA1, false); },
    simbolo: function (v) { return { faixa: { x: 0, z: 0, larg: v.Largura, prof: v.Profundidade, trama: true } }; }
  });
  pdef({
    id: "ra-pais-grama-amendoim", nome: "Grama-amendoim (Arachis repens) — forração", descricao: "Forração rasteira de folhas arredondadas com florzinha amarela, para canteiro de sol ou meia-sombra. Quantitativo em m².",
    parametros: PAR_FORR().concat([P("Florada", "simnao", true, "Construção")]), unidade: "m2", quantidade: "Largura * Profundidade", quantDesc: "Forração de grama-amendoim",
    tipos: [T("a23", "2 × 3 m", {}), T("a11", "1 × 1 m", { Largura: 1, Profundidade: 1 }), T("a05", "0,5 × 3 m (borda)", { Largura: 0.5, Profundidade: 3 })],
    gerar: function (c, v) { var rnd = forracao(c, v, MAT.GRAMA2, MAT.F2, true); if (v.Florada) for (var i = 0; i < Math.max(4, Math.round(v.Largura * v.Profundidade * 5)); i++) c.elipsoide(MAT.AMARELA, rnd.entre(-v.Largura / 2 + 0.05, v.Largura / 2 - 0.05), 0.02 + v.Espessura + 0.01, rnd.entre(-v.Profundidade / 2 + 0.05, v.Profundidade / 2 - 0.05), 0.012, 0.008, 0.012, { seg: 5, aneis: 3 }); },
    simbolo: function (v) { return { faixa: { x: 0, z: 0, larg: v.Largura, prof: v.Profundidade, trama: "cruzada" } }; }
  });

  /* ================================================================ VASO, PEDRA, SEIXO */
  pdef({
    id: "ra-pais-vaso", nome: "Vaso cerâmico com planta", descricao: "Vaso de cerâmica de boca larga com terra e planta: folhagem larga ('folhagem') ou folhas eretas em espada ('espada'). Para varanda, entrada e área gourmet.",
    parametros: [P("Diametro", "comprimento", 0.40, "Dimensões", "Diâmetro da boca. " + PORTE), P("Altura_vaso", "comprimento", 0.42, "Dimensões"), P("Planta", "texto", "folhagem", "Construção", "folhagem ou espada"), P("Altura_planta", "comprimento", 0.70, "Dimensões", "Acima da boca do vaso"), P("Material", "material", "ceramica terracota", "Materiais", "ceramica terracota, louça branca ou cimento queimado"), P("Semente", "inteiro", 6, "Construção", "", "instancia")],
    tipos: [T("v40", "Vaso Ø 40, folhagem", {}), T("v30", "Vaso Ø 30, espada", { Diametro: 0.30, Altura_vaso: 0.32, Planta: "espada", Altura_planta: 0.65 }), T("v60", "Vaso Ø 60, folhagem", { Diametro: 0.60, Altura_vaso: 0.60, Altura_planta: 1.10 }), T("v40b", "Vaso Ø 40 branco, espada", { Planta: "espada", Material: "louça branca", Altura_planta: 0.80 })],
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), r = v.Diametro / 2, h = v.Altura_vaso, esp = String(v.Planta).toLowerCase() === "espada";
      c.torno(v.Material, 0, 0, 0, [[r * 0.55, 0], [r * 0.7, 0.01], [r * 0.9, h * 0.5], [r, h * 0.92], [r * 1.04, h], [r * 0.96, h], [r * 0.92, h * 0.9]], { seg: 28 });
      c.torno(MAT.TERRA, 0, h * 0.86, 0, [[r * 0.92, 0], [r * 0.9, h * 0.1], [0, h * 0.1]], { seg: 24 });
      var n = esp ? 14 : 12;
      for (var i = 0; i < n; i++) {
        var yaw = 360 * i / n + rnd.entre(-14, 14);
        if (esp) c.lamina(MAT.VAR, 0, h * 0.94, 0, v.Altura_planta * rnd.entre(0.7, 1.05), 0.07, { rotY: yaw, inclina: rnd.entre(74, 86), curva: rnd.entre(2, 12), seg: 5, perfil: [0.7, 1, 1, 0.9, 0.6, 0.15], esp: 0.006 });
        else c.lamina(MAT.F2, 0, h * 0.94, 0, v.Altura_planta * rnd.entre(0.6, 0.95), 0.16, { rotY: yaw, inclina: rnd.entre(40, 66), curva: rnd.entre(35, 70), seg: 5, esp: 0.004 });
      }
    },
    simbolo: function (v) { return { copa: [{ x: 0, z: 0, r: v.Diametro / 2 }], tronco: [] }; }
  });
  pdef({
    id: "ra-pais-pedras", nome: "Pedras e seixos", descricao: "Leito de seixos rolados (modo 'seixo') ou pedras grandes isoladas (modo 'pedra') sobre a área indicada. Posições sorteadas pela semente, sem sobreposição vertical.",
    parametros: [P("Modo", "texto", "seixo", "Construção", "seixo ou pedra"), P("Largura", "comprimento", 1.50, "Dimensões"), P("Profundidade", "comprimento", 1.00, "Dimensões"), P("Quantidade_pedras", "inteiro", 3, "Construção", "Só no modo pedra"), P("Pedra", "material", "pedra cinza", "Materiais", "pedra cinza ou seixo"), P("Semente", "inteiro", 8, "Construção", "", "instancia")],
    tipos: [T("s", "Leito de seixos 1,50 × 1,00", {}), T("s2", "Leito de seixos 3,00 × 0,60 (faixa)", { Largura: 3.00, Profundidade: 0.60 }), T("p3", "3 pedras grandes", { Modo: "pedra", Largura: 1.60, Profundidade: 1.20 })],
    unidade: "m2", quantidade: "Largura * Profundidade", quantDesc: "Leito de pedras ou seixos",
    gerar: function (c, v) {
      var rnd = Mob.sorteio(v.Semente), W = v.Largura, D = v.Profundidade, pedra = String(v.Modo).toLowerCase() === "pedra", i;
      if (pedra) { var n = Math.max(1, Math.round(v.Quantidade_pedras)); for (i = 0; i < n; i++) { var r = rnd.entre(0.18, 0.34); c.pedra(v.Pedra, rnd.entre(-W / 2 + r, W / 2 - r), r * 0.45, rnd.entre(-D / 2 + r, D / 2 - r), r, r * 0.7, r * rnd.entre(0.75, 1.0), { semente: 3 + i, seg: 10, aneis: 5, rotY: rnd() * 180 }); } }
      else {
        c.caixaR(MAT.TERRA, 0, 0, 0, W, 0.025, D, 0.005, { k: 1 });
        var nn = clamp(Math.round(W * D * 70), 30, 150);
        for (i = 0; i < nn; i++) { var rs = rnd.entre(0.025, 0.05); c.pedra(i % 5 === 0 ? MAT.PEDRA : MAT.SEIXO, rnd.entre(-W / 2 + rs, W / 2 - rs), 0.02 + rs * 0.35, rnd.entre(-D / 2 + rs, D / 2 - rs), rs, rs * 0.55, rs * rnd.entre(0.7, 1), { semente: 11 + i, seg: 6, aneis: 3, rotY: rnd() * 180 }); }
      }
    },
    simbolo: function (v) { return String(v.Modo).toLowerCase() === "pedra" ? null : { faixa: { x: 0, z: 0, larg: v.Largura, prof: v.Profundidade, pontos: true } }; }
  });

  /* ================================================================ DECK E PERGOLADO */
  pdef({
    id: "ra-pais-deck", nome: "Deck de madeira (piso)", descricao: "Deck de tábuas com junta, sobre barrotes de apoio. Tábua de 14 cm × 2,1 cm e junta de 7 mm são o padrão da RA, a conferir com a madeireira. Quantitativo em m² de deck.",
    parametros: [P("Largura", "comprimento", 3.00, "Dimensões", "Ao longo de X"), P("Profundidade", "comprimento", 4.00, "Dimensões", "Ao longo de Z"), P("Altura", "comprimento", 0.15, "Dimensões", "Do piso/solo ao topo do deck", "instancia"), P("Largura_tabua", "comprimento", 0.14, "Dimensões", "Padrão RA, a conferir"), P("Espessura_tabua", "comprimento", 0.021, "Dimensões", "Padrão RA, a conferir"), P("Junta", "comprimento", 0.007, "Dimensões", "Padrão RA, a conferir"),
      P("Sentido", "texto", "z", "Construção", "Sentido das tábuas: x ou z"), P("Madeira", "material", "madeira deck", "Materiais")],
    tipos: [T("d34", "3 × 4 m", {}), T("d22", "2 × 2 m", { Largura: 2, Profundidade: 2 }), T("d46", "4 × 6 m", { Largura: 4, Profundidade: 6 })],
    unidade: "m2", quantidade: "Largura * Profundidade", quantDesc: "Deck de madeira",
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Hd = v.Altura, e = v.Espessura_tabua, lt = v.Largura_tabua, j = v.Junta, ex = String(v.Sentido).toLowerCase() === "x";
      var vao = ex ? D : W, ll = ex ? W : D, n = Math.max(1, Math.min(160, Math.floor((vao + j) / (lt + j))));
      var yb = Hd - e, bar = 0.05, nb = Math.max(2, Math.ceil(ll / 0.5) + 1);
      for (var i = 0; i < nb; i++) {   /* barrotes de apoio, em cruz com as tábuas */
        var t = -ll / 2 + bar / 2 + (ll - bar) * i / (nb - 1);
        if (ex) c.caixa(v.Madeira, t, Math.max(0, yb - bar), 0, bar, bar, D - 0.04); else c.caixa(v.Madeira, 0, Math.max(0, yb - bar), t, W - 0.04, bar, bar);
      }
      var tot = n * lt + (n - 1) * j;
      for (var k = 0; k < n; k++) {
        var p = -tot / 2 + lt / 2 + k * (lt + j);
        if (ex) c.caixa(v.Madeira, 0, yb, p, W, e, lt); else c.caixa(v.Madeira, p, yb, 0, lt, e, D);
      }
    }
  });
  pdef({
    id: "ra-pais-pergolado", nome: "Pergolado de madeira (vigas e ripas)", descricao: "Pergolado de pilares, duas vigas principais e ripas transversais. Seções e espaçamento são padrão da RA (a verificar no cálculo estrutural da madeira); para lista de corte use a carpintaria do módulo de marcenaria.",
    parametros: [P("Largura", "comprimento", 4.00, "Dimensões", "Ao longo de X"), P("Profundidade", "comprimento", 3.00, "Dimensões", "Ao longo de Z"), P("Altura", "comprimento", 2.60, "Dimensões", "Do piso ao topo das ripas"), P("Pilares", "inteiro", 4, "Construção", "4 ou 6"), P("Pilar_lado", "comprimento", 0.15, "Dimensões", "Padrão RA, a conferir"),
      P("Viga_b", "comprimento", 0.06, "Dimensões", "Padrão RA, a conferir"), P("Viga_h", "comprimento", 0.20, "Dimensões", "Padrão RA, a conferir"), P("Ripa_b", "comprimento", 0.05, "Dimensões", "Padrão RA, a conferir"), P("Ripa_h", "comprimento", 0.10, "Dimensões", "Padrão RA, a conferir"), P("Espacamento_ripas", "comprimento", 0.30, "Dimensões", "Entre eixos das ripas"),
      P("Balanco", "comprimento", 0.30, "Dimensões", "Balanço das vigas e ripas além dos pilares"), P("Madeira", "material", "madeira escura", "Materiais")],
    tipos: [T("g43", "4 × 3 m, 4 pilares", {}), T("g63", "6 × 3 m, 6 pilares", { Largura: 6, Pilares: 6 }), T("g33", "3 × 3 m, 4 pilares", { Largura: 3 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, pl = v.Pilar_lado, vb = v.Viga_b, vh = v.Viga_h, rb = v.Ripa_b, rh = v.Ripa_h, bal = v.Balanco, mat = v.Madeira;
      var xs = Math.round(v.Pilares) >= 6 ? [-W / 2, 0, W / 2] : [-W / 2, W / 2], yViga = Ht - rh - vh;
      xs.forEach(function (x) { [-D / 2, D / 2].forEach(function (z) { c.caixa(mat, x, 0, z, pl, yViga, pl); }); });
      [-D / 2, D / 2].forEach(function (z) { c.caixa(mat, 0, yViga, z, W + 2 * bal, vh, vb); });
      var nr = Math.max(2, Math.floor((W + 2 * bal) / v.Espacamento_ripas) + 1);
      for (var i = 0; i < nr; i++) c.caixa(mat, -W / 2 - bal + rb / 2 + (W + 2 * bal - rb) * i / (nr - 1), Ht - rh, 0, rb, rh, D + 2 * bal);
    }
  });

  FM.registrar();
  if (typeof module !== "undefined" && module.exports) module.exports = FM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

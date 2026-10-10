/* =====================================================================
 * metalnorma.js — METÁLICA & MECÂNICA: furos, parafusos, distâncias e
 * soldas (motor PURO, ES5, sem DOM, Node-testável).
 *
 * O QUE ESTE MÓDULO É (e o que NÃO é): regras de DETALHAMENTO para modelar,
 * detalhar e fabricar. Não dimensiona nada — não há resistência de parafuso,
 * de solda nem de chapa aqui. Quem dimensiona é o projeto estrutural; o que
 * sai daqui confere a GEOMETRIA (furo, distância entre furos e às bordas,
 * comprimento do parafuso pelo aperto) e avisa quando ela foge da norma.
 *
 * FONTES E O QUE FOI CONFERIDO (09/10/2026)
 *   ABNT NBR 8800:2008 — Projeto de estruturas de aço e de estruturas mistas
 *   de aço e concreto de edifícios. ⚠ A biblioteca de normas da RA não tem
 *   o texto da NBR 8800; os itens abaixo foram conferidos em duas fontes
 *   secundárias que transcrevem a norma (notas de aula de Ligações
 *   Parafusadas do IME, "lig_paraf_15", e o TCC IFMG "Comparativo de uma
 *   ligação fin plate entre a ABNT NBR 8800 e o Eurocode 3", 2023):
 *     · 6.3.6 / Tabela 12 — furo-padrão = db + 1,5 mm          (CONFERIDO)
 *     · 6.3.9  — espaçamento mínimo entre centros: 2,7 db,
 *                de preferência 3 db                            (CONFERIDO)
 *     · 6.3.10 — espaçamento máximo: 24 t e 300 mm (pintado ou não
 *                sujeito à corrosão); 14 t e 180 mm (aço resistente à
 *                corrosão atmosférica, não pintado)             (CONFERIDO)
 *     · 6.3.11 / Tabela 14 — distância mínima do centro do furo-padrão
 *                à borda (borda cortada com serra ou tesoura × borda
 *                laminada ou cortada a maçarico)                (VALORES DE
 *                PARTIDA — as duas fontes trazem a tabela como imagem;
 *                conferir na norma impressa; editável)
 *     · 6.3.12 — distância máxima do centro do parafuso à borda:
 *                12 t e 150 mm                                  (CONFERIDO)
 *     · Tabela 12 — furo alargado, pouco alongado e muito alongado
 *                (VALORES DE PARTIDA, editáveis — conferir)
 *     · Tabela 10 — tamanho mínimo da perna da solda de filete pela parte
 *                mais fina (VALORES DE PARTIDA, editáveis — conferir)
 *   ⚠ Existe a ABNT NBR 8800:2024 (edição nova). As regras daqui são as da
 *     2008; conferir se a obra adota a 2024 antes de emitir para a fábrica.
 *
 *   PARAFUSOS — dimensões de catálogo (conferir no fornecedor; editáveis):
 *     métrico: ISO 4014 (cabeça sextavada), ISO 4032 (porca), ISO 7089
 *     (arruela lisa), rosca métrica grossa ISO 261;
 *     polegada: ASTM A325 / ASTM F3125 grau A325 com cabeça sextavada
 *     pesada (ASME B18.2.6), porca ASTM A563 DH (sextavada pesada),
 *     arruela ASTM F436; rosca UNC (ASME B1.1).
 *   Massa específica do aço: 7 850 kg/m³ (a mesma do BimArq — NBR 8800,
 *   propriedades do aço estrutural).
 *
 * Unidades: aqui tudo em MILÍMETROS (é a unidade da fábrica); o modelo
 * guarda metros e converte na borda.
 * Teste: node tools/test-metal-norma.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var POL = 25.4;

  var FONTE_8800 = "ABNT NBR 8800:2008";
  var CONF_8800 = "conferido em duas transcrições da norma (IME — Ligações parafusadas; TCC IFMG 2023)";
  var PARTIDA = "valor de partida, editável — conferir na norma impressa";

  /* ------------------------------------------------------------ PARAFUSOS
   * d: diâmetro nominal (mm); passo (mm); s: abertura da chave da cabeça e
   * da porca; k: altura da cabeça; m: altura da porca; arruela d1/d2/h.
   * Valores de catálogo — `fonte` diz de onde; todos editáveis na tela. */
  var FONTE_ISO = "ISO 4014 (cabeça), ISO 4032 (porca), ISO 7089 (arruela), ISO 261 (passo) — valor de catálogo, conferir no fornecedor";
  var FONTE_POL = "ASME B18.2.6 (cabeça sextavada pesada), ASTM A563 DH (porca), ASTM F436 (arruela), ASME B1.1 UNC (passo) — valor de catálogo, conferir no fornecedor";
  function pol(f) { return Math.round(f * POL * 100) / 100; }
  var PARAFUSOS = [
    { id: "M12", sistema: "ISO", d: 12, passo: 1.75, s: 18, k: 7.5, m: 10.8, arr: { d1: 13, d2: 24, h: 2.5 } },
    { id: "M16", sistema: "ISO", d: 16, passo: 2, s: 24, k: 10, m: 14.8, arr: { d1: 17, d2: 30, h: 3 } },
    { id: "M20", sistema: "ISO", d: 20, passo: 2.5, s: 30, k: 12.5, m: 18, arr: { d1: 21, d2: 37, h: 3 } },
    { id: "M22", sistema: "ISO", d: 22, passo: 2.5, s: 34, k: 14, m: 19.4, arr: { d1: 23, d2: 39, h: 3 } },
    { id: "M24", sistema: "ISO", d: 24, passo: 3, s: 36, k: 15, m: 21.5, arr: { d1: 25, d2: 44, h: 4 } },
    { id: "M27", sistema: "ISO", d: 27, passo: 3, s: 41, k: 17, m: 23.8, arr: { d1: 28, d2: 50, h: 4 } },
    { id: "M30", sistema: "ISO", d: 30, passo: 3.5, s: 46, k: 18.7, m: 25.6, arr: { d1: 31, d2: 56, h: 4 } },
    { id: "M36", sistema: "ISO", d: 36, passo: 4, s: 55, k: 22.5, m: 31, arr: { d1: 37, d2: 66, h: 5 } },
    { id: "1/2\"", sistema: "POL", d: pol(0.5), passo: pol(1 / 13), s: pol(7 / 8), k: pol(5 / 16), m: pol(31 / 64), arr: { d1: pol(17 / 32), d2: pol(17 / 16), h: 4 } },
    { id: "5/8\"", sistema: "POL", d: pol(0.625), passo: pol(1 / 11), s: pol(17 / 16), k: pol(25 / 64), m: pol(39 / 64), arr: { d1: pol(11 / 16), d2: pol(21 / 16), h: 4 } },
    { id: "3/4\"", sistema: "POL", d: pol(0.75), passo: pol(1 / 10), s: pol(5 / 4), k: pol(15 / 32), m: pol(47 / 64), arr: { d1: pol(13 / 16), d2: pol(47 / 32), h: 4 } },
    { id: "7/8\"", sistema: "POL", d: pol(0.875), passo: pol(1 / 9), s: pol(23 / 16), k: pol(35 / 64), m: pol(55 / 64), arr: { d1: pol(15 / 16), d2: pol(7 / 4), h: 4 } },
    { id: "1\"", sistema: "POL", d: pol(1), passo: pol(1 / 8), s: pol(13 / 8), k: pol(39 / 64), m: pol(63 / 64), arr: { d1: pol(9 / 8), d2: pol(2), h: 4 } },
    { id: "1.1/8\"", sistema: "POL", d: pol(1.125), passo: pol(1 / 7), s: pol(29 / 16), k: pol(11 / 16), m: pol(71 / 64), arr: { d1: pol(5 / 4), d2: pol(9 / 4), h: 4 } },
    { id: "1.1/4\"", sistema: "POL", d: pol(1.25), passo: pol(1 / 7), s: pol(2), k: pol(25 / 32), m: pol(39 / 32), arr: { d1: pol(11 / 8), d2: pol(5 / 2), h: 4 } }
  ];
  PARAFUSOS.forEach(function (p) { p.fonte = p.sistema === "ISO" ? FONTE_ISO : FONTE_POL; });

  /* CLASSES (rótulo e norma para a lista e o IFC — sem resistência: não é cálculo) */
  var CLASSES = {
    "A325": { nome: "ASTM A325", norma: "ASTM F3125 grau A325 (antiga ASTM A325)", tipo: "estrutural" },
    "A490": { nome: "ASTM A490", norma: "ASTM F3125 grau A490 (antiga ASTM A490)", tipo: "estrutural" },
    "A307": { nome: "ASTM A307", norma: "ASTM A307 grau A (parafuso comum)", tipo: "comum" },
    "8.8": { nome: "ISO 8.8", norma: "ISO 898-1 classe 8.8", tipo: "estrutural" },
    "10.9": { nome: "ISO 10.9", norma: "ISO 898-1 classe 10.9", tipo: "estrutural" },
    "F1554-36": { nome: "ASTM F1554 grau 36", norma: "ASTM F1554 grau 36 (chumbador)", tipo: "chumbador" }
  };

  function parafuso(id) {
    var k = String(id == null ? "" : id).replace(/\s+/g, "").replace(/,/g, ".").toUpperCase();
    for (var i = 0; i < PARAFUSOS.length; i++) if (PARAFUSOS[i].id.toUpperCase() === k) return PARAFUSOS[i];
    var n = Number(k.replace(/^M/, ""));
    if (isFinite(n)) for (var j = 0; j < PARAFUSOS.length; j++) if (Math.abs(PARAFUSOS[j].d - n) < 0.05) return PARAFUSOS[j];
    return null;
  }

  /* ------------------------------------------------- FUROS (NBR 8800, Tabela 12)
   * tipo: "padrao" (CONFERIDO: db + 1,5) | "alargado" | "pouco" (pouco
   * alongado) | "muito" (muito alongado) — os três últimos são PARTIDA.
   * Devolve { d (largura = diâmetro do furo), l (comprimento; = d no
   * redondo), tipo, fonte, conferido }. */
  var TAB12 = {   /* PARTIDA — conferir Tabela 12 */
    alargado: function (db) { return db <= 24 ? db + 5 : (db <= 27 ? db + 6 : db + 8); },
    pouco: function (db) { return db <= 24 ? db + 6 : (db <= 27 ? db + 8 : db + 9.5); },
    muito: function (db) { return 2.5 * db; }
  };
  var AJUSTES = { tabela14: null, folgaFuro: null };   /* a tela pode trocar os valores de partida */
  function furo(db, tipo) {
    db = num(db, NaN); if (!(db > 0)) return null;
    var padrao = db + (AJUSTES.folgaFuro != null ? AJUSTES.folgaFuro : 1.5);
    if (!tipo || tipo === "padrao") return { d: r1(padrao), l: r1(padrao), tipo: "padrao", fonte: FONTE_8800 + ", 6.3.6 / Tabela 12 — furo-padrão db + 1,5 mm (" + CONF_8800 + ")", conferido: true };
    if (tipo === "alargado") { var a = TAB12.alargado(db); return { d: r1(a), l: r1(a), tipo: tipo, fonte: FONTE_8800 + ", Tabela 12 — furo alargado (" + PARTIDA + ")", conferido: false }; }
    if (tipo === "pouco" || tipo === "muito") return { d: r1(padrao), l: r1(TAB12[tipo](db)), tipo: tipo, fonte: FONTE_8800 + ", Tabela 12 — furo " + (tipo === "pouco" ? "pouco" : "muito") + " alongado (" + PARTIDA + ")", conferido: false };
    return null;
  }

  /* ------------------------------------ DISTÂNCIA MÍNIMA À BORDA (Tabela 14)
   * [db, borda cortada com serra ou tesoura, borda laminada ou cortada a
   * maçarico] em mm. ⚠ PARTIDA (ver o cabeçalho). Diâmetro fora da tabela:
   * a linha do diâmetro tabelado imediatamente acima; acima de todos,
   * 1,75 db e 1,25 db (a última linha da tabela). */
  var TAB14 = [
    [pol(0.5), 22, 19], [16, 29, 22], [pol(0.625), 29, 22], [pol(0.75), 32, 26], [20, 35, 27], [22, 38, 29], [pol(0.875), 38, 29],
    [24, 42, 31], [pol(1), 44, 32], [27, 48, 34], [pol(1.125), 51, 38], [30, 53, 38], [pol(1.25), 57, 41], [36, 64, 46]
  ];
  function tab14() { return AJUSTES.tabela14 || TAB14; }
  /* borda: "laminada" (laminada ou cortada a maçarico/plasma/laser — o padrão da chapa cortada por CNC térmico) | "serra" (serra ou tesoura) */
  function bordaMin(db, borda) {
    db = num(db, NaN); if (!(db > 0)) return null;
    var serra = borda === "serra", t = tab14().slice().sort(function (a, b) { return a[0] - b[0]; }), e = null, linha = null;
    for (var i = 0; i < t.length; i++) if (t[i][0] >= db - 0.05) { linha = t[i]; break; }
    if (linha) e = serra ? linha[1] : linha[2];
    else e = Math.ceil((serra ? 1.75 : 1.25) * db);
    return { e: e, borda: serra ? "serra" : "laminada", fonte: FONTE_8800 + ", 6.3.11 / Tabela 14 (" + PARTIDA + ")", conferido: false };
  }
  function bordaMax(t) { t = num(t, 0); return { e: Math.min(12 * t, 150), fonte: FONTE_8800 + ", 6.3.12 — 12 t e 150 mm (" + CONF_8800 + ")", conferido: true }; }
  function espMin(db) { db = num(db, 0); return { min: r1(2.7 * db), pref: r1(3 * db), fonte: FONTE_8800 + ", 6.3.9 — 2,7 db (de preferência 3 db) (" + CONF_8800 + ")", conferido: true }; }
  function espMax(t, intemperismo) {
    t = num(t, 0);
    return intemperismo ? { e: Math.min(14 * t, 180), fonte: FONTE_8800 + ", 6.3.10 b) — 14 t e 180 mm (aço resistente à corrosão, não pintado) (" + CONF_8800 + ")", conferido: true }
                        : { e: Math.min(24 * t, 300), fonte: FONTE_8800 + ", 6.3.10 a) — 24 t e 300 mm (" + CONF_8800 + ")", conferido: true };
  }

  /* ------------------------------------------------ SOLDA (atributo, sem cálculo)
   * Tabela 10 da NBR 8800 — perna mínima do filete pela parte MAIS FINA
   * (PARTIDA). [t até (mm), perna mínima (mm)]. */
  var TAB10 = [[6.35, 3], [12.5, 5], [19, 6], [Infinity, 8]];
  function soldaMin(tMaisFina) {
    var t = num(tMaisFina, 0), p = TAB10[TAB10.length - 1][1];
    for (var i = 0; i < TAB10.length; i++) if (t <= TAB10[i][0]) { p = TAB10[i][1]; break; }
    return { perna: p, fonte: FONTE_8800 + ", Tabela 10 — tamanho mínimo da perna do filete (" + PARTIDA + ")", conferido: false };
  }
  /* o símbolo (texto curto): "◣ 6 (2 lados, oficina)" */
  function soldaRotulo(s) {
    s = s || {};
    var tipo = s.tipo === "topo" ? "Topo" : "Filete", lados = s.lados === "um" ? "1 lado" : (s.lados === "contorno" ? "contorno" : "2 lados");
    return tipo + " " + num(s.perna, 0) + " mm (" + lados + (s.campo ? ", campo" : ", oficina") + ")";
  }

  /* -------------------------------------- COMPRIMENTO DO PARAFUSO PELO APERTO
   * L ≥ aperto + arruelas × h + altura da porca + projeção; projeção =
   * `fios` passos de rosca além da porca (PARTIDA: 3 fios). Arredonda para
   * o passo comercial: 5 mm (métrico) ou 1/4" (polegada) — PARTIDA.
   * Chumbador: + comprimento de ancoragem no concreto (dado de projeto). */
  function comprimento(o) {
    o = o || {};
    var p = parafuso(o.id || o.d), ap = num(o.aperto, NaN);
    if (!p || !(ap > 0)) return null;
    var na = Math.max(0, Math.round(num(o.arruelas, 1))), fios = Math.max(1, num(o.fios, 3));
    var ancor = Math.max(0, num(o.ancoragem, 0));
    var lmin = ap + na * p.arr.h + p.m + fios * p.passo + ancor;
    var passoCom = p.sistema === "POL" ? POL / 4 : 5;
    var L = Math.ceil((lmin - 1e-6) / passoCom) * passoCom;
    return { L: Math.round(L * 10) / 10, Lmin: Math.round(lmin * 10) / 10, passoComercial: passoCom, fios: fios, arruelas: na,
             fonte: "aperto + " + na + " arruela(s) + porca + " + fios + " fios de projeção, arredondado para " + (p.sistema === "POL" ? "1/4\"" : "5 mm") + " (" + PARTIDA + ")" };
  }

  /* -------------------------------------------- CONFERÊNCIA DE UMA CHAPA/FACE
   * c = { furos: [{x, y, db, d (furo, opcional), id}] (mm, no plano da
   *       chapa), contorno: [[x, y]…] (mm; opcional — sem ele não confere
   *       borda), t (mm), borda ("laminada"|"serra"), intemperismo (bool),
   *       nome (rótulo nos avisos), ignorarMaxEsp (bool: furos de grupos
   *       diferentes, ex.: placa de base com 4 cantos) }
   * Devolve { ok, avisos:[{tipo, texto, item, furo, valor, limite}], medidas }.
   * ⚠ Aviso, não bloqueio: quem decide é o projetista. */
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx - p[0], qy = a[1] + t * dy - p[1]; return Math.sqrt(qx * qx + qy * qy);
  }
  function dentro(p, pts) {
    var d = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  function conferir(c) {
    c = c || {};
    var furos = arr(c.furos), C = arr(c.contorno), t = num(c.t, 0), av = [], nome = c.nome ? c.nome + ": " : "", med = { bordaMin: null, espMin: null };
    function aviso(tipo, texto, item, f, valor, limite) { av.push({ tipo: tipo, texto: nome + texto, item: item, furo: f != null ? f : null, valor: valor, limite: limite }); }
    furos.forEach(function (f, i) {
      var db = num(f.db, 0), rot = "furo " + (f.id || i + 1) + " (Ø" + db + ")";
      if (C.length >= 3) {
        var e = Infinity;
        for (var k = 0; k < C.length; k++) e = Math.min(e, distSeg([f.x, f.y], C[k], C[(k + 1) % C.length]));
        if (!dentro([f.x, f.y], C)) { aviso("fora", rot + " está FORA da chapa", FONTE_8800, i, 0, 0); return; }
        var bm = bordaMin(db, c.borda), bx = bordaMax(t);
        med.bordaMin = med.bordaMin == null ? e : Math.min(med.bordaMin, e);
        if (e < bm.e - 0.05) aviso("bordaMin", rot + ": " + r1(e) + " mm até a borda — mínimo " + bm.e + " mm (borda " + (bm.borda === "serra" ? "cortada com serra ou tesoura" : "laminada ou cortada a maçarico") + ")", "6.3.11 / Tabela 14", i, r1(e), bm.e);
        if (t > 0 && !c.ignorarMaxBorda && e > bx.e + 0.05) aviso("bordaMax", rot + ": " + r1(e) + " mm até a borda — máximo " + r1(bx.e) + " mm (12 t, até 150 mm)", "6.3.12", i, r1(e), r1(bx.e));
      }
    });
    for (var i = 0; i < furos.length; i++) {
      var viz = Infinity;
      for (var j = 0; j < furos.length; j++) {
        if (i === j) continue;
        var a = furos[i], b = furos[j], d = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
        viz = Math.min(viz, d);
        if (j > i) {
          var dbm = Math.max(num(a.db, 0), num(b.db, 0)), em = espMin(dbm);
          med.espMin = med.espMin == null ? d : Math.min(med.espMin, d);
          if (d < em.min - 0.05) aviso("espMin", "furos " + (a.id || i + 1) + " e " + (b.id || j + 1) + ": " + r1(d) + " mm entre centros — mínimo 2,7 db = " + em.min + " mm", "6.3.9", i, r1(d), em.min);
          else if (d < em.pref - 0.05) aviso("espPref", "furos " + (a.id || i + 1) + " e " + (b.id || j + 1) + ": " + r1(d) + " mm entre centros — a norma recomenda 3 db = " + em.pref + " mm", "6.3.9", i, r1(d), em.pref);
        }
      }
      if (furos.length > 1 && t > 0 && !c.ignorarMaxEsp && isFinite(viz)) {
        var ex = espMax(t, c.intemperismo);
        if (viz > ex.e + 0.05) aviso("espMax", "furo " + (furos[i].id || i + 1) + ": " + r1(viz) + " mm até o furo vizinho — máximo " + r1(ex.e) + " mm", "6.3.10", i, r1(viz), r1(ex.e));
      }
    }
    return { ok: !av.some(function (x) { return x.tipo !== "espPref"; }), avisos: av, medidas: med };
  }

  /* espaçamento e borda de PARTIDA para uma ligação nova (o que as macros usam) */
  function partida(db, borda) {
    var b = bordaMin(db, borda), e = espMin(db);
    return { borda: Math.ceil(b.e / 5) * 5, passo: Math.ceil(e.pref / 5) * 5 };
  }

  var BimMetalNorma = {
    FONTE_8800: FONTE_8800, PARTIDA: PARTIDA, PARAFUSOS: PARAFUSOS, CLASSES: CLASSES, TAB14: TAB14, TAB10: TAB10, RHO_ACO: 7850,
    AJUSTES: AJUSTES,
    parafuso: parafuso, furo: furo, bordaMin: bordaMin, bordaMax: bordaMax, espMin: espMin, espMax: espMax,
    soldaMin: soldaMin, soldaRotulo: soldaRotulo, comprimento: comprimento, conferir: conferir, partida: partida,
    /* o que vai para a tela "De onde vem cada número" */
    fontes: function () {
      return [
        { regra: "Furo-padrão = db + 1,5 mm", item: "NBR 8800:2008, 6.3.6 / Tabela 12", situacao: "conferido" },
        { regra: "Furo alargado e alongados", item: "NBR 8800:2008, Tabela 12", situacao: "valor de partida, editável" },
        { regra: "Espaçamento mínimo 2,7 db (preferível 3 db)", item: "NBR 8800:2008, 6.3.9", situacao: "conferido" },
        { regra: "Espaçamento máximo 24 t / 300 mm (14 t / 180 mm sem pintura)", item: "NBR 8800:2008, 6.3.10", situacao: "conferido" },
        { regra: "Distância mínima à borda", item: "NBR 8800:2008, 6.3.11 / Tabela 14", situacao: "valor de partida, editável" },
        { regra: "Distância máxima à borda 12 t / 150 mm", item: "NBR 8800:2008, 6.3.12", situacao: "conferido" },
        { regra: "Perna mínima do filete", item: "NBR 8800:2008, Tabela 10", situacao: "valor de partida, editável" },
        { regra: "Cabeça, porca e arruela do parafuso", item: "ISO 4014/4032/7089; ASME B18.2.6, ASTM A563, ASTM F436", situacao: "catálogo, conferir no fornecedor" },
        { regra: "Projeção do parafuso além da porca (3 fios)", item: "prática de montagem", situacao: "valor de partida, editável" }
      ];
    }
  };
  global.BimMetalNorma = BimMetalNorma;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalNorma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

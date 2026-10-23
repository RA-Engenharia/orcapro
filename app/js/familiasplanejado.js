/* =====================================================================
 * familiasplanejado.js — ARMÁRIO PLANEJADO INTELIGENTE (20/10/2026)
 *
 * Pedido do Rogério: o armário planejado "inteligente" — a pessoa diz a LARGURA TOTAL da parede e a
 * família gera os MÓDULOS sozinha (base, aéreo, torre, guarda-roupa, painel), com portas e gavetas que
 * abrem no clique, o espaço dos eletros por parâmetro (geladeira, forno, micro, coifa, lava-louças) e o
 * preço pela composição própria RA por m² de frente (PROP-MOB-9001 a 9009; nicho 9010 por unidade).
 *
 * DE ONDE VÊM OS NÚMEROS (docs/arquitetura/interiores/dados/armarios-planejados.json, pesquisa de 20/10/2026):
 *   · larguras de catálogo 40–120 cm e profundidade de base 52 cm, torre 52, aéreo 37 (Kappesberg Vibra/Maxxi);
 *     pé 13 cm; base a 150 cm do piso até o aéreo; torre 200–240; guarda-roupa 223–234 e 55–66 de fundo;
 *     maior módulo 100 cm (tabela de carga Italínea); MDF 18 mm corpo, fundo 6 mm.
 *   · nichos dos eletros: geladeira duplex 80 cm de nicho, lava-louças 60 cm 62 cm de nicho (Brastemp), forno 60
 *     (nicho 56), coifa 90 cm (fichas Brastemp/Electrolux da pesquisa).
 *   · o ALGORITMO "largura total → módulos" (planejarFila) é PROPOSTA da pesquisa, SEM FONTE — folga de
 *     tamponamento 20 a 60 mm por lado que encosta em parede, módulo sob medida de 300 a 1000 mm. Os valores
 *     sem fonte ficam ditos na descrição do parâmetro.
 *   · a altura da base sem tampo (85,5 cm = 88 com tampo − 2,5 do tampo) usa a espessura do tampo SEM FONTE.
 * O tampo de pedra NÃO está no armário (a composição 9001/9002 é sem tampo): a bancada é item próprio.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js"), FM = dep("FamiliasMob", "familiasmob.js"), D = dep("MobCatalogoDados", "mobcatalogodados.js"), FC = dep("FamiliasCat", "familiascat.js");
  if (typeof require === "function" && FM && !FM.gerador("ra-coz-geladeira")) { try { require("./familiasmobcoz.js"); } catch (e0) { /* sem a cozinha: o vão da geladeira fica vazio */ } }
  if (!Mob || !FM || !D) return;
  var H = FM.H, MAT = FM.MAT, P = FM.P, T = FM.T, def = FM.def;
  function cl(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ planejarFila (pesquisa: algoritmo_parametrico.pseudo_js_es5 — PROPOSTA, sem fonte)
   * largura do vão (mm) → módulos de catálogo (mochila: menor sobra; empate, menos módulos), a sobra vira tamponamento nos lados com
   * parede; sobra grande demais = módulos sob medida iguais (≤ maxMm). Testado no Node pela pesquisa: 3400 com 700 reservado → 1000+1000+600. */
  function planejarFila(larguraVaoMm, opts) {
    opts = opts || {};
    var larguras = opts.larguras || [400, 500, 600, 800, 1000], minMm = opts.minMm || 300, maxMm = opts.maxMm || 1000, tampMin = opts.tampMin == null ? 20 : opts.tampMin, tampMax = opts.tampMax || 60;
    var paredeEsq = opts.paredeEsq !== false, paredeDir = opts.paredeDir !== false, reservados = opts.reservados || [], esp = opts.espLateralMm || 18, avisos = [], i, j;
    var fixo = 0; for (i = 0; i < reservados.length; i++) fixo += reservados[i];
    var tampEsq = paredeEsq ? tampMin : 0, tampDir = paredeDir ? tampMin : 0, livre = Math.round(larguraVaoMm - fixo - tampEsq - tampDir);
    if (livre < 0) return { ok: false, modulos: [], reservados: reservados, tampEsq: tampEsq, tampDir: tampDir, sobraMm: livre, avisos: ["largura do vão menor que os módulos reservados"] };
    var best = [], cnt = [], prev = [];
    for (i = 0; i <= livre; i++) { best[i] = false; cnt[i] = 0; prev[i] = -1; }
    best[0] = true;
    for (i = 1; i <= livre; i++) for (j = 0; j < larguras.length; j++) { var w = larguras[j]; if (i >= w && best[i - w] && (!best[i] || cnt[i - w] + 1 < cnt[i])) { best[i] = true; cnt[i] = cnt[i - w] + 1; prev[i] = w; } }
    var alvo = livre; while (alvo > 0 && !best[alvo]) alvo--;
    var modulosA = [], k = alvo; while (k > 0) { modulosA.push(prev[k]); k -= prev[k]; }
    modulosA.sort(function (a, b) { return b - a; });
    var sobraA = livre - alvo, n = Math.ceil(livre / maxMm), modulosB = [], sobraB = 0;
    if (n > 0 && livre / n >= minMm) { var base = Math.floor(livre / n); for (i = 0; i < n; i++) modulosB.push(base); modulosB[n - 1] += livre - base * n; }
    else if (livre >= minMm) modulosB.push(livre); else sobraB = livre;
    var modo, modulos, sobra, capTamp = (paredeEsq ? tampMax - tampMin : 0) + (paredeDir ? tampMax - tampMin : 0);
    if (sobraA <= capTamp) {
      modo = "catalogo"; modulos = modulosA; sobra = sobraA;
      if (sobra > 0) { if (paredeEsq && paredeDir) { tampEsq += Math.floor(sobra / 2); tampDir += sobra - Math.floor(sobra / 2); } else if (paredeEsq) tampEsq += sobra; else if (paredeDir) tampDir += sobra; sobra = 0; }
    } else { modo = "sob-medida"; modulos = modulosB; sobra = sobraB; avisos.push("o catálogo deixaria sobra de " + sobraA + " mm: módulos sob medida"); }
    if (!modulos.length) avisos.push("nenhum módulo cabe no vão");
    if (tampEsq > tampMax || tampDir > tampMax) avisos.push("tamponamento acima do máximo (" + tampMax + " mm)");
    return { ok: modulos.length > 0, modo: modo, modulos: modulos, reservados: reservados, tampEsq: tampEsq, tampDir: tampDir, sobraMm: sobra, larguraInternaMm: modulos.map(function (m) { return m - 2 * esp; }), avisos: avisos };
  }

  /* os eletros: largura do vão reservado (m) — nichos lidos nas fichas da pesquisa */
  var ELETRO = { geladeira: 0.80, lava_loucas: 0.62, forno_base: 0.60, coifa: 0.90 };
  var NOME_ELETRO = { geladeira: "geladeira", lava_loucas: "lava-louças", forno_base: "forno sob o cooktop", coifa: "coifa" };
  /* tamponamento mínimo de cada lado com parede (planejarFila: tampMin 20 mm) — o mesmo número da fórmula Vao_disponivel */
  var TAMP_MIN = 0.02;
  var ULTIMO = null;
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  /* ⚠ DEFEITO DO A1 (corrigido em 21/10/2026, frente "mobiliar ambiente"): os vãos de eletro marcados somavam MAIS que a largura
     total (base de 1,00 m com geladeira + lava-louças + forno = 2,02 m de vão) e o gerador desenhava a fila inteira mesmo assim —
     tamponamento + vãos passavam 1,06 m além da parede (a caixa da família ia de −0,50 a +1,56), atravessando a parede do lado e
     o ambiente vizinho. Agora os vãos entram na ORDEM (geladeira, lava-louças, forno, coifa) enquanto cabem; o que não cabe sai
     com aviso, e a fórmula do Reserva_eletros faz a MESMA conta (o orçamento cobra a frente que o desenho constrói). */
  function planoDe(v) {
    var cands = [], reservas = [], avisos = [], lt = v.Largura_total, tm = String(v.Tipo_modulo).toLowerCase();
    if (v.Nicho_geladeira && (tm === "torre" || tm === "base")) cands.push({ id: "geladeira", w: ELETRO.geladeira });
    if (v.Nicho_lava_loucas && tm === "base") cands.push({ id: "lava_loucas", w: ELETRO.lava_loucas });
    if (v.Nicho_forno_base && tm === "base") cands.push({ id: "forno_base", w: ELETRO.forno_base });
    if (v.Vao_coifa && tm === "aereo") cands.push({ id: "coifa", w: ELETRO.coifa });
    var disp = lt - (v.Parede_esquerda !== false ? TAMP_MIN : 0) - (v.Parede_direita !== false ? TAMP_MIN : 0), usado = 0;
    cands.forEach(function (r) {
      if (usado + r.w <= disp + 1e-9) { reservas.push(r); usado += r.w; }
      else avisos.push("o vão de " + NOME_ELETRO[r.id] + " (" + f2(r.w) + " m) não cabe na largura total de " + f2(lt) + " m — retirado (o desenho e o orçamento seguem a parede)");
    });
    var lgs = String(v.Larguras_catalogo || "400,500,600,800,1000").split(/[;, ]+/).map(function (s) { return Math.round(+s); }).filter(function (x) { return x >= 150 && x <= 1200; });
    var pl = planejarFila(Math.round(lt * 1000), { larguras: lgs.length ? lgs : null, paredeEsq: v.Parede_esquerda !== false, paredeDir: v.Parede_direita !== false, reservados: reservas.map(function (r) { return Math.round(r.w * 1000); }) });
    /* largura menor que os dois tamponamentos: o tamponamento encolhe (nunca passa da largura total) */
    var lim = Math.max(0, Math.round(lt * 1000));
    if (pl.tampEsq + pl.tampDir > lim) { var k = lim / Math.max(1, pl.tampEsq + pl.tampDir); pl.tampEsq = Math.floor(pl.tampEsq * k); pl.tampDir = Math.floor(pl.tampDir * k); }
    pl.reservas = reservas; pl.vaosRetirados = cands.filter(function (c) { return reservas.indexOf(c) < 0; }).map(function (c) { return c.id; });
    pl.avisos = avisos.concat(pl.avisos || []);
    return pl;
  }

  function corpoModulo(c, mat, x, y0, w, h, Pz, esp) {   /* caixa do módulo: laterais, base, tampo e fundo de 6 mm (a frente é das portas) */
    c.caixa(mat, x - w / 2 + esp / 2, y0, Pz / 2, esp, h, Pz); c.caixa(mat, x + w / 2 - esp / 2, y0, Pz / 2, esp, h, Pz);
    c.caixa(mat, x, y0, Pz / 2, w - 2 * esp, esp, Pz); c.caixa(mat, x, y0 + h - esp, Pz / 2, w - 2 * esp, esp, Pz);
    c.caixa(mat, x, y0 + esp, 0.003, w - 2 * esp, h - 2 * esp, 0.006);
  }
  function porta(c, id, mat, pux, x, y0, zf, w, h, lado) {
    H.giro(c, id, x + lado * w / 2, y0 + h / 2, zf + 0.009, lado, function () {
      H.porta(c, mat, x, y0, zf, w, h, 0.018, "liso");
      H.puxador(c, x - lado * (w / 2 - 0.04), y0 + (h > 1 ? h * 0.45 : h * 0.5), zf + 0.018, Math.min(0.32, h * 0.35), true, pux);
    });
  }
  function gaveta(c, id, mat, pux, x, y0, zf, w, h, prof) {
    H.gaveta(c, id, prof * 0.7, function () { H.porta(c, mat, x, y0, zf, w, h, 0.018, "liso"); H.puxador(c, x, y0 + h * 0.65, zf + 0.018, Math.min(0.3, w * 0.5), false, pux); H.gavetaCaixa(c, MAT.CLARA, x, y0, zf, w, h, prof); });
  }

  function gerar(c, v) {
    var tm = String(v.Tipo_modulo).toLowerCase(), Lt = v.Largura_total, Pz = v.Profundidade, A = v.Altura, corpo = v.Corpo, fr = v.Frente, pux = v.Puxador, esp = 0.018, rod = v.Rodape;
    if (tm === "painel") {   /* painel de parede (TV/cabeceira): chapa com frisos verticais a cada ~30 cm */
      c.caixa(fr, 0, 0, 0.009, Lt, A, 0.018);
      var nf = Math.max(1, Math.round(Lt / 0.3)); for (var f = 1; f < nf; f++) c.caixa(MAT.PRETO, -Lt / 2 + f * Lt / nf, 0, 0.0185, 0.004, A, 0.002);
      ULTIMO = { modulos: [], tampEsq: 0, tampDir: 0, reservas: [] };
      return;
    }
    var pl = planoDe(v); ULTIMO = pl;
    if (pl.vaosRetirados.length) c.avisos = (c.avisos || []).concat(pl.avisos.slice(0, pl.vaosRetirados.length));   /* vai para saida.avisos (js/familiasmob.js completar) */
    /* ⚠ REVISÃO (21/10/2026): a SOBRA sem módulo (o que fica livre abaixo do módulo mínimo de 300 mm, ex.: 0,30 m com dois
       tamponamentos; 1,10 m com o vão da geladeira) não é desenhada — e a fórmula (Largura_total − Reserva_eletros) × Altura a
       cobrava como frente de armário. O orçamento cobra a frente que o desenho constrói: módulos + tamponamentos. Sem sobra
       a conta é a mesma da fórmula (os módulos e os tamponamentos fecham a largura menos os vãos). */
    var frenteMm = pl.tampEsq + pl.tampDir; pl.modulos.forEach(function (m) { frenteMm += m; });
    c.quantidade = Math.max(0, frenteMm / 1000) * A;
    if (pl.sobraMm > 0) c.avisos = (c.avisos || []).concat(["sobra de " + Math.round(pl.sobraMm) + " mm sem módulo (menor que o módulo mínimo de 300 mm) — não desenhada e fora do orçamento; feche com tamponamento/peça sob medida ou ajuste a largura total"]);
    var y0 = tm === "aereo" ? v.Altura_instalacao : 0, hCorpo = tm === "aereo" ? A : A - rod, yC = tm === "aereo" ? y0 : rod;
    var seq = [], x = -Lt / 2;
    seq.push({ t: "tamp", w: pl.tampEsq / 1000 });
    var ladoEletro = String(v.Eletro_lado).toLowerCase() === "esquerda" ? "esq" : "dir";
    if (ladoEletro === "esq") pl.reservas.forEach(function (r) { seq.push({ t: "eletro", id: r.id, w: r.w }); });
    pl.modulos.forEach(function (m) { seq.push({ t: "mod", w: m / 1000 }); });
    if (ladoEletro === "dir") pl.reservas.forEach(function (r) { seq.push({ t: "eletro", id: r.id, w: r.w }); });
    seq.push({ t: "tamp", w: pl.tampDir / 1000 });
    var nP = 0, nG = 0, iMod = 0, zf = Pz, iGav = -1, iFor = -1;
    pl.modulos.forEach(function (m, i) { if (iGav < 0 && m <= 610) iGav = i; if (iFor < 0 && m >= 580 && m <= 810) iFor = i; });   /* o gaveteiro vai no módulo estreito; o forno no de 60 */
    seq.forEach(function (s) {
      var xc = x + s.w / 2;
      if (s.t === "tamp" && s.w > 0.001) c.caixa(fr, xc, yC, Pz / 2, s.w, hCorpo, Pz);
      else if (s.t === "eletro") {
        if (s.id === "geladeira" && FM.gerador("ra-coz-geladeira")) {
          var hb = Math.max(0.3, A - 1.9);   /* bagageiro sobre a geladeira até a altura da fila */
          if (tm === "torre") { corpoModulo(c, corpo, xc, A - hb, s.w, hb, Pz, esp); c.parte("bagageiro" + (++nP), { tipo: "basculante", eixo: [xc, A, zf + 0.009], angulo: 80, sentido: -1 }, function () { H.porta(c, fr, xc, A - hb + 0.003, zf, s.w - 0.004, hb - 0.006, 0.018, "liso"); H.puxador(c, xc, A - hb + 0.05, zf + 0.018, 0.3, false, pux); }); }
          c.grupo(xc, 0, 0.02, 0, function (k) { FM.gerador("ra-coz-geladeira")(k, { Largura: 0.70, Altura: Math.min(1.84, A - (tm === "torre" ? hb : 0) - 0.04), Profundidade: Math.min(0.70, Pz + 0.1), Modelo: "duplex", Acabamento: "inox" }); });
        } else if (s.id === "lava_loucas" && FC && FC.geradores.lavaLoucas) {
          c.grupo(xc, 0, 0, 0, function (k) { FC.geradores.lavaLoucas(k, { Largura: 0.598, Profundidade: Pz, Altura: A - 0.005, Acabamento: "inox" }); });
        } else if (s.id === "forno_base" && FC && FC.geradores.forno) {
          corpoModulo(c, corpo, xc, rod, s.w, hCorpo, Pz, esp);
          c.grupo(xc, rod + 0.1, 0, 0, function (k) { FC.geradores.forno(k, { Largura: 0.596, Profundidade: Pz - 0.01, Altura: 0.596, Acabamento: "inox", Modelo: "" }); });
        } else if (s.id === "coifa" && FC && FC.geradores.coifa) {
          c.grupo(xc, y0 - 0.1, 0, 0, function (k) { FC.geradores.coifa(k, { Largura: 0.898, Profundidade: 0.49, Altura: Math.min(0.65, A + 0.1), Acabamento: "inox", Modelo: "" }); });
        }
      } else if (s.t === "mod") {
        var w = s.w, wp, im = iMod++;
        corpoModulo(c, corpo, xc, yC, w, hCorpo, Pz - 0.02, esp);
        if (tm === "base") {
          if (v.Gaveteiro && im === iGav) { var hg = (hCorpo - 0.012) / 3; for (var g = 0; g < 3; g++) gaveta(c, "gaveta" + (++nG), fr, pux, xc, yC + 0.004 + g * hg, zf - 0.02, w - 0.004, hg - 0.004, Pz - 0.08); }
          else if (w >= 0.7) { wp = w / 2; porta(c, "porta" + (++nP), fr, pux, xc - wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hCorpo - 0.008, -1); porta(c, "porta" + (++nP), fr, pux, xc + wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hCorpo - 0.008, 1); }
          else porta(c, "porta" + (++nP), fr, pux, xc, yC + 0.004, zf - 0.02, w - 0.004, hCorpo - 0.008, iMod % 2 ? -1 : 1);
        } else if (tm === "aereo") {
          if (w >= 0.7) { wp = w / 2; porta(c, "porta" + (++nP), fr, pux, xc - wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hCorpo - 0.008, -1); porta(c, "porta" + (++nP), fr, pux, xc + wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hCorpo - 0.008, 1); }
          else porta(c, "porta" + (++nP), fr, pux, xc, yC + 0.004, zf - 0.02, w - 0.004, hCorpo - 0.008, iMod % 2 ? -1 : 1);
        } else {   /* torre e guarda-roupa: portas altas, bagageiro em cima; a torre com forno+micro abre os nichos no 1º módulo de 60 */
          var hBag = A > 2.1 ? 0.4 : 0, hAlta = hCorpo - hBag;
          if (tm === "torre" && im === iFor && v.Nicho_forno) {
            var yF = rod + 0.72, hN = 0.6;   /* forno a 0,85 m do piso (mais 13 de pé), micro logo acima */
            porta(c, "porta" + (++nP), fr, pux, xc, yC + 0.004, zf - 0.02, w - 0.004, yF - yC - 0.01, -1);
            if (FC && FC.geradores.forno) c.grupo(xc, yF, 0, 0, function (k) { FC.geradores.forno(k, { Largura: Math.min(0.596, w - 0.04), Profundidade: Pz - 0.04, Altura: 0.596, Acabamento: "inox", Modelo: "" }); });
            var yM = yF + hN;
            if (v.Nicho_micro && FC && FC.geradores.forno) c.grupo(xc, yM + 0.01, 0, 0, function (k) { FC.geradores.forno(k, { Largura: Math.min(0.594, w - 0.04), Profundidade: Math.min(0.44, Pz - 0.04), Altura: 0.373, Acabamento: "inox", Modelo: "micro" }); });
            var yS = yM + (v.Nicho_micro ? 0.4 : 0);
            if (yS < A - hBag - 0.15) porta(c, "porta" + (++nP), fr, pux, xc, yS, zf - 0.02, w - 0.004, A - hBag - yS - 0.004, -1);
          } else if (w >= 0.7) { wp = w / 2; porta(c, "porta" + (++nP), fr, pux, xc - wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hAlta - 0.008, -1); porta(c, "porta" + (++nP), fr, pux, xc + wp / 2, yC + 0.004, zf - 0.02, wp - 0.004, hAlta - 0.008, 1); }
          else porta(c, "porta" + (++nP), fr, pux, xc, yC + 0.004, zf - 0.02, w - 0.004, hAlta - 0.008, iMod % 2 ? -1 : 1);
          if (tm === "guarda-roupa") c.cilH(MAT.INOX, xc, yC + Math.min(1.75, hAlta - 0.25), Pz / 2, 0.012, w - 0.05, "x", { seg: 8 });
          if (hBag > 0) { var xb = xc, wb = w; c.parte("bagageiro" + (++nP), { tipo: "basculante", eixo: [xb, A, zf - 0.011], angulo: 80, sentido: -1 }, function () { H.porta(c, fr, xb, A - hBag + 0.004, zf - 0.02, wb - 0.004, hBag - 0.008, 0.018, "liso"); H.puxador(c, xb, A - hBag + 0.05, zf - 0.002, Math.min(0.3, wb * 0.5), false, pux); }); }
        }
        if (tm !== "aereo") c.caixa(MAT.PRETO, xc, 0, Pz / 2 - 0.03, w - 0.01, rod, Pz - 0.1);
      }
      x += s.w;
    });
  }

  /* ------------------------------------------------ TIPOS: um por composição própria (caixa branca; frente branca ou amadeirada/cor) */
  var SOB = {}; (D.sobMedida || []).forEach(function (s) { SOB[s.pc] = s; });
  function precoDe(cod) { var s = SOB[cod] || {}; return { Preco_unitario: s.pr || 0, Fonte_preco: s.pf || "", Data_preco: s.pd || "", Composicao_id: cod }; }
  var DEF = {
    base: { P: 0.52, A: 0.855, fonte: "Profundidade 52 cm (Kappesberg); altura 88 cm com tampo (Kappesberg) − 2,5 cm de tampo (sem fonte) = 85,5 sem tampo; pé 13 cm" },
    aereo: { P: 0.37, A: 0.70, fonte: "Profundidade 37 cm e altura na faixa 30–90 cm (Kappesberg); 70 adotado; instalado a 1,50 m do piso" },
    torre: { P: 0.52, A: 2.20, fonte: "Profundidade 52 cm e altura 200–240 cm (Kappesberg); 2,20 adotado" },
    "guarda-roupa": { P: 0.60, A: 2.30, fonte: "Profundidade 55–66 cm e altura 223–234 cm (fichas de roupeiro da pesquisa); 60 × 230 adotados" },
    painel: { P: 0.018, A: 2.40, fonte: "MDF 18 mm; altura até o forro adotada 2,40 (ajustar ao pé-direito)" }
  };
  function tipo(id, nome, tm, cod, frente) {
    var d = DEF[tm], vals = { Tipo_modulo: tm, Profundidade: d.P, Altura: d.A, Frente: frente,
      /* revisão A1: QUAIS vãos este tipo reserva (o mesmo critério do planoDe) — o desconto do m² de frente segue o desenho */
      Vao_geladeira_tipo: (tm === "torre" || tm === "base") ? 1 : 0, Vao_base_tipo: tm === "base" ? 1 : 0, Vao_coifa_tipo: tm === "aereo" ? 1 : 0 };
    var pr = precoDe(cod); Object.keys(pr).forEach(function (k) { vals[k] = pr[k]; });
    var t = T(id, nome, vals, d.fonte); t.codigo = cod; return t;
  }
  var fam = def({
    id: "ra-plan-armario", nome: "Armário planejado inteligente (largura total → módulos)", categoria: "mobiliario", moveis: true, semOrigem: true,
    descricao: "Fila de armário planejado em MDF 18 mm: a LARGURA TOTAL da parede gera os módulos de catálogo (40–100 cm) e o tamponamento; base, aéreo, torre, guarda-roupa ou painel; vão de geladeira, lava-louças, forno e coifa por parâmetro; portas e gavetas abrem no clique. Preço pela composição própria RA por m² de frente (sem tampo: a bancada é item próprio). Origem: no piso, no meio da largura total, fundo em Z = 0.",
    parametros: [
      P("Tipo_modulo", "texto", "base", "Construção", "base, aereo, torre, guarda-roupa ou painel"),
      P("Largura_total", "comprimento", 2.40, "Dimensões", "Largura da parede/vão a ocupar — gera os módulos", "instancia"),
      P("Profundidade", "comprimento", 0.52, "Dimensões"), P("Altura", "comprimento", 0.855, "Dimensões", "Altura da fila (base sem tampo; aéreo é a altura do móvel)"),
      P("Altura_instalacao", "comprimento", 1.50, "Dimensões", "Aéreo: do piso à base do móvel (150 cm, pesquisa)", "instancia"),
      P("Rodape", "comprimento", 0.13, "Dimensões", "Pé/rodapé recuado (13 cm, Kappesberg)"),
      P("Larguras_catalogo", "texto", "400,500,600,800,1000", "Construção", "Larguras de módulo (mm) que a fila pode usar — Kappesberg 40–120; máx. 100 (Italínea)"),
      P("Parede_esquerda", "simnao", true, "Construção", "A fila encosta em parede à esquerda (tamponamento 20–60 mm, proposta sem fonte)", "instancia"),
      P("Parede_direita", "simnao", true, "Construção", "Idem à direita", "instancia"),
      P("Gaveteiro", "simnao", true, "Construção", "Base: o 1º módulo de até 60 cm vira gaveteiro de 3 gavetas", "instancia"),
      P("Nicho_geladeira", "simnao", false, "Eletros", "Vão da geladeira (nicho 80 cm, Brastemp duplex) na fila de torre/base", "instancia"),
      P("Nicho_lava_loucas", "simnao", false, "Eletros", "Vão da lava-louças de 60 (nicho 62 cm, Brastemp BLB14) na base", "instancia"),
      P("Nicho_forno_base", "simnao", false, "Eletros", "Forno de embutir sob o cooktop (módulo de 60) na base", "instancia"),
      P("Nicho_forno", "simnao", false, "Eletros", "Torre: forno de embutir no 1º módulo (nicho 56 × 58 × 56, Brastemp BO260)", "instancia"),
      P("Nicho_micro", "simnao", false, "Eletros", "Torre: micro-ondas acima do forno (nicho 57 × 37 × 45,5, Electrolux ME3BC)", "instancia"),
      P("Vao_coifa", "simnao", false, "Eletros", "Aéreo: vão da coifa de 90 cm", "instancia"),
      P("Eletro_lado", "texto", "direita", "Eletros", "direita ou esquerda: onde ficam os vãos dos eletros na fila", "instancia"),
      P("Reserva_eletros", "comprimento", 0, "Eletros", "Largura dos vãos de eletro (fora da frente do armário no orçamento)", "instancia"),
      P("Vao_geladeira_tipo", "numero", 0, "Eletros", "1 = este tipo (torre/base) reserva o vão da geladeira"), P("Vao_base_tipo", "numero", 0, "Eletros", "1 = este tipo (base) reserva lava-louças e forno sob o cooktop"),
      P("Vao_coifa_tipo", "numero", 0, "Eletros", "1 = este tipo (aéreo) reserva o vão da coifa"),
      P("Corpo", "material", "mdf branco", "Materiais", "Caixa (MDF 18 mm)", "instancia"), P("Frente", "material", "mdf branco", "Materiais", "Portas e gavetas (acabamento MDF do catálogo)", "instancia"),
      P("Puxador", "material", "metal preto", "Materiais", "", "instancia"),
      P("Preco_unitario", "numero", 0, "Catálogo e preço", "R$ por m² de frente, sem BDI — composição própria RA (fornecimento e instalação)"),
      P("Fonte_preco", "texto", "", "Catálogo e preço"), P("Data_preco", "texto", "", "Catálogo e preço"), P("Composicao_id", "texto", "", "Catálogo e preço")
    ],
    tipos: [
      tipo("base-branco", "Base de cozinha/banho — frente branca (PROP-MOB-9001)", "base", "PROP-MOB-9001", "mdf branco"),
      tipo("base-cor", "Base de cozinha/banho — frente amadeirada/cor (PROP-MOB-9002)", "base", "PROP-MOB-9002", "mdf freijo"),
      tipo("aereo-branco", "Aéreo — frente branca (PROP-MOB-9003)", "aereo", "PROP-MOB-9003", "mdf branco"),
      tipo("aereo-cor", "Aéreo — frente amadeirada/cor (PROP-MOB-9004)", "aereo", "PROP-MOB-9004", "mdf freijo"),
      tipo("roupeiro-branco", "Guarda-roupa — portas brancas (PROP-MOB-9005)", "guarda-roupa", "PROP-MOB-9005", "mdf branco"),
      tipo("roupeiro-cor", "Guarda-roupa — portas amadeiradas/cor (PROP-MOB-9006)", "guarda-roupa", "PROP-MOB-9006", "mdf carvalho"),
      tipo("torre-branco", "Torre / paneleiro / despensa — frente branca (PROP-MOB-9007)", "torre", "PROP-MOB-9007", "mdf branco"),
      tipo("torre-cor", "Torre / paneleiro / despensa — frente amadeirada/cor (PROP-MOB-9008)", "torre", "PROP-MOB-9008", "mdf nogueira"),
      tipo("painel", "Painel de parede MDF 18 (TV/cabeceira lisa) (PROP-MOB-9009)", "painel", "PROP-MOB-9009", "mdf freijo")
    ],
    gerar: gerar
  });
  /* a reserva dos eletros sai por fórmula (o orçamento cobra só a frente do armário) */
  /* A1 (21/10/2026): os vãos entram em ORDEM enquanto cabem em Vao_disponivel (largura total − 20 mm de tamponamento em cada lado
     com parede) — a mesma conta do planoDe; o vão que não cabe não é desenhado e não desconta a frente */
  var G_EL = "Eletros", CALC = "cálculo (não editar): o vão que o desenho constrói — o que não cabe na largura total sai";
  fam.parametros.push(
    { nome: "Vao_disponivel", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: G_EL, descricao: CALC, formula: "Largura_total - se(Parede_esquerda; 0,02; 0) - se(Parede_direita; 0,02; 0)" },
    { nome: "Vao_geladeira_usado", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: G_EL, descricao: CALC, formula: "se(se(Nicho_geladeira; 0,8; 0) * Vao_geladeira_tipo <= Vao_disponivel; se(Nicho_geladeira; 0,8; 0) * Vao_geladeira_tipo; 0)" },
    { nome: "Vao_lava_usado", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: G_EL, descricao: CALC, formula: "se(Vao_geladeira_usado + se(Nicho_lava_loucas; 0,62; 0) * Vao_base_tipo <= Vao_disponivel; se(Nicho_lava_loucas; 0,62; 0) * Vao_base_tipo; 0)" },
    { nome: "Vao_forno_usado", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: G_EL, descricao: CALC, formula: "se(Vao_geladeira_usado + Vao_lava_usado + se(Nicho_forno_base; 0,6; 0) * Vao_base_tipo <= Vao_disponivel; se(Nicho_forno_base; 0,6; 0) * Vao_base_tipo; 0)" },
    { nome: "Vao_coifa_usado", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: G_EL, descricao: CALC, formula: "se(Vao_geladeira_usado + Vao_lava_usado + Vao_forno_usado + se(Vao_coifa; 0,9; 0) * Vao_coifa_tipo <= Vao_disponivel; se(Vao_coifa; 0,9; 0) * Vao_coifa_tipo; 0)" });
  fam.parametros.forEach(function (q) { if (q.nome === "Reserva_eletros") { q.formula = "Vao_geladeira_usado + Vao_lava_usado + Vao_forno_usado + Vao_coifa_usado";
    /* ⚠ REVISÃO A1 (20/10/2026): a fórmula antiga descontava TODO vão marcado de QUALQUER tipo — o aéreo com "geladeira" marcada
       perdia 0,80 m de frente que o desenho constrói (aéreo sobre a geladeira), a torre perdia lava-louças e forno da base e o
       painel perdia tudo: orçamento ABAIXO do que se fabrica. Agora desconta só o vão que o tipo reserva (planoDe). */ } });
  fam.quantitativo = { unidade: "m2", quantidade: "max(0; Largura_total - Reserva_eletros) * Altura", codigo: "", fonte: "docs/arquitetura/interiores/precos/composicoes-proprias-mobiliario.json",
    descricao: "Armário planejado — m² de frente (composição própria RA do tipo; já inclui fornecimento e instalação)" };
  fam.catalogo = { categoria: "planejado", gerador: "planejado", pecas: fam.tipos.length };

  var famN = def({
    id: "ra-plan-nicho", nome: "Nicho de parede planejado (MDF)", categoria: "mobiliario", semOrigem: true,
    descricao: "Nicho de parede em MDF 18 mm amadeirado/cor, 60 × 30 × 25 cm, sem fundo (composição própria RA PROP-MOB-9010, por unidade). Origem: meio da largura, fundo na parede.",
    parametros: [P("Largura", "comprimento", 0.60, "Dimensões", "60 cm (composição 9010)"), P("Altura", "comprimento", 0.30, "Dimensões"), P("Profundidade", "comprimento", 0.25, "Dimensões"),
      P("Altura_instalacao", "comprimento", 1.40, "Dimensões", "Do piso à base do nicho", "instancia"), P("Acabamento", "material", "mdf carvalho", "Materiais", "", "instancia"),
      P("Preco_unitario", "numero", precoDe("PROP-MOB-9010").Preco_unitario, "Catálogo e preço", "R$ por unidade, sem BDI — composição própria RA"),
      P("Fonte_preco", "texto", precoDe("PROP-MOB-9010").Fonte_preco, "Catálogo e preço"), P("Data_preco", "texto", precoDe("PROP-MOB-9010").Data_preco, "Catálogo e preço"), P("Composicao_id", "texto", "PROP-MOB-9010", "Catálogo e preço")],
    tipos: [(function () { var t = T("n60", "Nicho 60 × 30 × 25 (PROP-MOB-9010)", {}); t.codigo = "PROP-MOB-9010"; return t; })()],
    gerar: function (c, v) {
      var L = v.Largura, A = v.Altura, Pz = v.Profundidade, y0 = v.Altura_instalacao, e = 0.018, m = v.Acabamento;
      c.caixa(m, 0, y0, Pz / 2, L, e, Pz); c.caixa(m, 0, y0 + A - e, Pz / 2, L, e, Pz); c.caixa(m, -L / 2 + e / 2, y0 + e, Pz / 2, e, A - 2 * e, Pz); c.caixa(m, L / 2 - e / 2, y0 + e, Pz / 2, e, A - 2 * e, Pz);
    }
  });
  famN.quantitativo = { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Nicho de parede planejado (composição própria RA; fornecimento e instalação)" };
  FM.registrar();

  var FamiliasPlanejado = { planejarFila: planejarFila, planoDe: planoDe, ultimoPlano: function () { return ULTIMO; }, ELETRO: ELETRO, familia: function () { return fam; } };
  global.FamiliasPlanejado = FamiliasPlanejado;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasPlanejado;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

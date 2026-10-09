/* =====================================================================
 * bimestrut.js — P9 do plano do BIM: ESTRUTURA COM
 * CATÁLOGO, VIGAS E PILARES, TRELIÇA E RAMPA.
 * Motor PURO (ES5, sem DOM, sem three.js), Node-testável. Tudo atrás da
 * prévia `?previa=modelador`: sem a op/os campos da P9 nada daqui roda e a
 * peça antiga sai byte a byte igual.
 *
 * O QUE ESTÁ AQUI
 *   A · PROPRIEDADES DE SEÇÃO (área, Ix, Iy, Wx, Wy, Zx, Zy, J, peso
 *       nominal). Perfil de catálogo (js/perfisaco.js — AISC v15.0 e
 *       Gerdau): o número da TABELA, com a fonte; o que a tabela não traz
 *       (o Gerdau não publica Zx, Zy nem J) e as seções paramétricas
 *       (retangular, circular, I, U, L, tubos) saem CALCULADAS da geometria
 *       pela RA, marcadas "calculado" — nunca se apresenta conta como se
 *       fosse catálogo.
 *   B · VIGA: "Justificação y" (Origem, Esquerda, Centro,
 *       Direita), "Justificação z" (Topo, Centro, Origem, Inferior),
 *       "Valor do deslocamento y/z", "Deslocamento do nível inicial/final"
 *       (viga INCLINADA), "Extensão inicial/final". PILAR INCLINADO
 *       ("Estilo de coluna"), "Marca da localização da coluna" pelos eixos
 *       ("B-2"), "Move com eixos", TRELIÇA simples de madeira (banzos,
 *       montantes e diagonais — cada barra é uma viga/pilar de verdade, com
 *       volume e orçamento).
 *   C · RAMPA pela NBR 9050 (inclinação × desnível máximo do segmento,
 *       patamares entre segmentos, largura e patamar mínimos como aviso),
 *       reta ou em U, com guarda-corpo de corrimão duplo (0,92 e 0,70 m).
 *       A escada (regra de cálculo, em U, começar/terminar com espelho,
 *       revestimento) e os corrimãos 1 e 2 do guarda-corpo ficam no
 *       js/bimarq.js, junto do resto da escada e do guarda-corpo.
 *
 * REGRAS DA CASA
 *   · Desenho = orçamento: o volume é o da geometria que o 3D mostra.
 *   · Op sem lista dentro de lista (a nuvem recusa): os campos da P9 são
 *     escalares na caixa (viga/pilar) ou no par da rampa.
 *   · Nada de número de norma de memória como se fosse da norma: o que não
 *     foi conferido no texto oficial sai com "conferir NBR 9050".
 *
 * Convenções = as do js/bimarq.js (caixa {cx, cy, cz, comprimento, altura,
 * espessura, rotY}; w < 0 = ESQUERDA de quem anda de p1 para p2).
 * Testes: node tools/test-p9-estrutura.js · node tools/test-p9-escada-rampa.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function cm(v) { return String(Math.round(v * 1000) / 10).replace(".", ","); }
  function exato(c, o) { try { Object.defineProperty(c, "_exato", { value: o, enumerable: false, configurable: true, writable: true }); } catch (e) {} return c; }
  function Arq() { return dep("BimArq", "./bimarq.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  /* vetores 3D [x, y, z] (cena: y para cima) */
  function v3(x, y, z) { return [x, y, z]; }
  function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function esc(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? esc(a, 1 / l) : [0, 1, 0]; }

  /* =============================================== A — PROPRIEDADES DE SEÇÃO
   * Em SI (m², m⁴, m³). Fórmulas de resistência dos materiais para a seção
   * de paredes retas; no I e no U, com os raios de concordância (W250X73 ×
   * AISC: Ix +0,7 %, Zx 0,0 %; o J sai 7 % abaixo — o raio pesa na torção e
   * a fórmula de parede fina não o leva). A ÁREA é a da geometria com os
   * raios (BimArq.secao), a mesma do volume. Zy do U e Zx/Zy da cantoneira:
   * a linha neutra plástica não é a do centroide — fica vazio, não chutado.
   * Tubo retangular sem o raio dos cantos: +5 % no HSS (só vale para a seção
   * digitada; o perfil de catálogo usa o número do catálogo). */
  var K_TORCAO = 1 / 3;
  function geomProps(perfil) {
    var A9 = Arq(); if (!A9) return null;
    var s = A9.secao(perfil); if (!s.ok) return null;
    var p = perfil, g = function (k) { return num(p[k], NaN); }, f = p.forma, o = { A: s.area };
    if (f === "ret") {
      var b = g("b"), h = g("h"), a1 = Math.max(b, h), b1 = Math.min(b, h);
      o.Ix = b * h * h * h / 12; o.Iy = h * b * b * b / 12; o.Wx = b * h * h / 6; o.Wy = h * b * b / 6; o.Zx = b * h * h / 4; o.Zy = h * b * b / 4;
      o.J = a1 * b1 * b1 * b1 * (1 / 3 - 0.21 * (b1 / a1) * (1 - Math.pow(b1, 4) / (12 * Math.pow(a1, 4))));   /* Roark, retângulo maciço */
    } else if (f === "circ") {
      var d = g("d"); o.Ix = o.Iy = Math.PI * Math.pow(d, 4) / 64; o.Wx = o.Wy = Math.PI * d * d * d / 32; o.Zx = o.Zy = d * d * d / 6; o.J = Math.PI * Math.pow(d, 4) / 32;
    } else if (f === "I" || f === "U") {
      var D = g("d"), bf = g("bf"), tw = g("tw"), tf = g("tf"), hw = D - 2 * tf;
      /* os raios de concordância (r): cada "sapata" tem área k·r² com o
         centroide a 0,2234·r do canto — com eles o Zx do W250X73 dá o do AISC
         (990 cm³) e o Ix da tabela Gerdau fecha (tools/gerar-perfisaco.js) */
      var rr = Math.max(0, num(p.r, 0)), kf = 1 - Math.PI / 4, nf = f === "I" ? 4 : 2, Af9 = kf * rr * rr, yc = D / 2 - tf - 0.2234 * rr;
      o.Ix = (bf * D * D * D - (bf - tw) * hw * hw * hw) / 12 + nf * Af9 * yc * yc; o.Wx = 2 * o.Ix / D;
      o.Zx = bf * tf * (D - tf) + tw * hw * hw / 4 + nf * Af9 * yc;
      o.J = K_TORCAO * (2 * bf * tf * tf * tf + (D - tf) * tw * tw * tw);
      if (f === "I") {
        var xc9 = tw / 2 + 0.2234 * rr;
        o.Iy = (2 * tf * bf * bf * bf + hw * tw * tw * tw) / 12 + 4 * Af9 * xc9 * xc9; o.Wy = 2 * o.Iy / bf; o.Zy = tf * bf * bf / 2 + hw * tw * tw / 4 + 4 * Af9 * xc9;
      }
      else {
        var Af = bf * tf, Aw = hw * tw, A0 = 2 * Af + Aw, xb = (2 * Af * bf / 2 + Aw * tw / 2) / A0;
        o.Iy = 2 * (tf * bf * bf * bf / 12 + Af * (bf / 2 - xb) * (bf / 2 - xb)) + (hw * tw * tw * tw / 12 + Aw * (tw / 2 - xb) * (tw / 2 - xb));
        o.Wy = o.Iy / (bf - xb); o.Zy = null; o.xc = xb;
        /* ⚠ o U laminado (AISC C) tem a mesa INCLINADA (tf é a média): pelo eixo fraco a conta de
           mesa reta erra 23 % no C150X12.2 — fica vazio, não chutado (o catálogo traz o dele) */
        o.Iy = null; o.Wy = null;
      }
    } else if (f === "L") {
      var a = g("a"), bL = g("b"), t = g("t"), A1 = bL * t, A2 = t * (a - t), AL = A1 + A2;
      var xL = (A1 * bL / 2 + A2 * t / 2) / AL, yL = (A1 * t / 2 + A2 * (t + (a - t) / 2)) / AL;
      o.Ix = bL * t * t * t / 12 + A1 * (t / 2 - yL) * (t / 2 - yL) + t * Math.pow(a - t, 3) / 12 + A2 * Math.pow(t + (a - t) / 2 - yL, 2);
      o.Iy = t * bL * bL * bL / 12 + A1 * (bL / 2 - xL) * (bL / 2 - xL) + (a - t) * t * t * t / 12 + A2 * (t / 2 - xL) * (t / 2 - xL);
      o.Wx = o.Ix / (a - yL); o.Wy = o.Iy / (bL - xL); o.Zx = null; o.Zy = null; o.J = K_TORCAO * (a + bL - t) * t * t * t; o.xc = xL; o.yc = yL;
    } else if (f === "tubo-ret") {
      var bt = g("b"), ht = g("h"), tt = g("t"), bi = bt - 2 * tt, hi = ht - 2 * tt;
      o.Ix = (bt * ht * ht * ht - bi * hi * hi * hi) / 12; o.Iy = (ht * bt * bt * bt - hi * bi * bi * bi) / 12; o.Wx = 2 * o.Ix / ht; o.Wy = 2 * o.Iy / bt;
      o.Zx = (bt * ht * ht - bi * hi * hi) / 4; o.Zy = (ht * bt * bt - hi * bi * bi) / 4;
      o.J = 2 * tt * Math.pow(bt - tt, 2) * Math.pow(ht - tt, 2) / ((bt - tt) + (ht - tt));   /* Bredt, parede fina */
    } else if (f === "tubo-circ") {
      var Dc = g("D"), di = Dc - 2 * g("t");
      o.Ix = o.Iy = Math.PI * (Math.pow(Dc, 4) - Math.pow(di, 4)) / 64; o.Wx = o.Wy = 2 * o.Ix / Dc; o.Zx = o.Zy = (Dc * Dc * Dc - di * di * di) / 6; o.J = 2 * o.Ix;
    }
    return o;
  }
  /* o que se mostra, nas unidades usuais de seção (cm², cm⁴, cm³, kg/m) e de onde
     veio cada número: { ok, A, Ix, Iy, Wx, Wy, Zx, Zy, J, peso, origem:{k:
     "catalogo"|"calculado"}, fonte, fabricante, nome } */
  var CONV = { A: 1e4, Ix: 1e8, Iy: 1e8, Wx: 1e6, Wy: 1e6, Zx: 1e6, Zy: 1e6, J: 1e8 };   /* SI → cm */
  var DO_CATALOGO = { A: 1 / 100, Ix: 1e-4, Iy: 1e-4, Wx: 1e-3, Wy: 1e-3, Zx: 1e-3, Zy: 1e-3, J: 1e-4 };   /* mm → cm */
  var cacheProps = {};
  function propsSecao(perfil, material) {
    if (!perfil || !perfil.forma) return { ok: false, motivo: "sem perfil" };
    var chave = JSON.stringify([perfil, material || ""]);
    if (cacheProps[chave]) return clone(cacheProps[chave]);
    var gp = geomProps(perfil), PA = Aco(), cat = perfil.cat && PA ? PA.obter(perfil.cat) : null;
    if (!gp && !cat) return { ok: false, motivo: "seção inválida" };
    var out = { ok: true, origem: {}, nome: cat ? cat.nome : null, fabricante: cat ? (cat.fabricante || "AISC") : null, fonte: cat ? cat.fonte : "Calculado pela RA da geometria da seção (seção de paredes retas; no I, com os raios de concordância)" };
    Object.keys(CONV).forEach(function (k) {
      if (cat && fin(cat[k])) { out[k] = r4(cat[k] * DO_CATALOGO[k]); out.origem[k] = "catalogo"; return; }
      if (gp && fin(gp[k])) { out[k] = r4(gp[k] * CONV[k]); out.origem[k] = "calculado"; return; }
      out[k] = null;
    });
    var A9 = Arq(), M = A9 && A9.MATERIAIS && A9.MATERIAIS[material], rho = M && M.rho ? M.rho : null;
    if (cat && fin(cat.massa)) { out.peso = cat.massa; out.origem.peso = "catalogo"; }
    else if (rho && gp) { out.peso = r4(gp.A * rho); out.origem.peso = "calculado"; }
    else out.peso = null;
    if (cat && Object.keys(out.origem).some(function (k) { return out.origem[k] === "calculado"; }))
      out.fonte += " · " + Object.keys(out.origem).filter(function (k) { return out.origem[k] === "calculado"; }).join(", ") + " calculados pela RA da geometria (a tabela não traz)";
    cacheProps[chave] = clone(out);
    return out;
  }

  /* ================================================== B — VIGA */
  var JUST_Y = [["origem", "Origem"], ["esquerda", "Esquerda"], ["centro", "Centro"], ["direita", "Direita"]];
  var JUST_Z = [["topo", "Topo"], ["centro", "Centro"], ["origem", "Origem"], ["inferior", "Inferior"]];
  var CAMPOS_VIGA = ["justY", "justZ", "despY", "despZ", "dIni", "dFim", "extIni", "extFim"];
  var CAMPOS_PILAR = ["estilo", "topoDx", "topoDz", "moveComEixos"];
  /* o rótulo é o do inventário PT-BR (SLANTED_COLUMN_TYPE_PARAM, coleta de
     09/10/2026: "Inclinado - Conduzido por ponto final"); o 3º item é o rótulo antigo da
     RA, aceito na entrada para não recusar o que a paleta já gravou */
  var ESTILOS_PILAR = [["vertical", "Vertical"], ["inclinado", "Inclinado - Conduzido por ponto final"]];
  var APELIDOS = { "inclinado - pontos finais controlados": "inclinado" };
  function idDe(lista, v, padrao) {
    var s = String(v == null ? "" : v).toLowerCase();
    for (var i = 0; i < lista.length; i++) if (lista[i][0] === s || lista[i][1].toLowerCase() === s) return lista[i][0];
    if (lista === ESTILOS_PILAR && APELIDOS[s]) return APELIDOS[s];
    return padrao;
  }
  function rotuloDe(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === id) return lista[i][1]; return lista[0][1]; }
  function temViga(c) { return !!c && CAMPOS_VIGA.some(function (k) { return c[k] != null; }); }
  function inclinado(c) { return !!c && c.estilo === "inclinado" && (Math.abs(num(c.topoDx, 0)) > 1e-6 || Math.abs(num(c.topoDz, 0)) > 1e-6); }

  /* a geometria da viga: centro C (no meio do eixo de REFERÊNCIA deslocado
     pela justificação), eixo T (com a inclinação), lateral W (horizontal,
     +w), normal N (o "para cima" da seção, perpendicular a T) e o trecho
     sólido [s0, s1] ao longo de T (recuos nos pilares + extensões).
     Sem campo P9: T horizontal, a seção com o TOPO no topoViga (o de sempre). */
  function geomViga(c, s) {
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), Lh = num(c.comprimento, 0);
    var topo = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
    var y0 = topo + num(c.dIni, 0), y1 = topo + num(c.dFim, 0), dY = y1 - y0, Lax = Math.sqrt(Lh * Lh + dY * dY), ct = Lax > 0 ? Lh / Lax : 1, st = Lax > 0 ? dY / Lax : 0;
    var T = [co * ct, st, -si * ct], W = [si, 0, co], N = [-co * st, ct, si * st];
    var jy = idDe(JUST_Y, c.justY, "origem"), jz = idDe(JUST_Z, c.justZ, "topo"), larg = s ? s.larg : num(c.espessura, 0), alt = s ? s.alt : num(c.altura, 0);
    /* y: Esquerda = a face ESQUERDA na linha (a peça vai para a direita, +w);
       deslocamento y positivo = para a esquerda (o y local da peça) — CONFERIDO
       na coleta de 09/10/2026 (referência medida, viga-justificada:
       caixa Y 9,885…10,05 = a do OrçaPRO; test-p9-estrutura [coleta]) */
    var a0 = (jy === "esquerda" ? larg / 2 : (jy === "direita" ? -larg / 2 : 0)) - num(c.despY, 0);
    var b0 = (jz === "topo" ? -alt / 2 : (jz === "inferior" ? alt / 2 : 0)) + num(c.despZ, 0);
    var C = soma(soma([num(c.cx, 0), (y0 + y1) / 2, num(c.cz, 0)], esc(W, a0)), esc(N, b0));
    var s0 = -Lax / 2 + num(c.recuoIni, 0) / ct - num(c.extIni, 0), s1 = Lax / 2 - num(c.recuoFim, 0) / ct + num(c.extFim, 0);
    return { C: C, T: T, W: W, N: N, s0: s0, s1: s1, Lax: Lax, Lc: Math.max(0.01, s1 - s0), y0: y0, y1: y1, a0: a0, b0: b0, cos: ct, jy: jy, jz: jz };
  }
  /* chamado no fim do BimArq.recalcPeca (viga e pilar): só mexe na peça com
     campo da P9; refaz cy, volume, comprimento de corte, área e o exato */
  function posPeca(c, s, mat) {
    if (!c || !s || !s.ok) return c;
    if (c.tipo === "viga" && temViga(c)) {
      var gv = geomViga(c, s), Lc = gv.Lc, perF = (mat && mat.forma && s.forma === "ret") ? (2 * s.alt + s.larg) : s.perimetro;
      c.cy = r4(gv.C[1]);
      c.volume = r6(s.area * Lc); c.comprimentoViga = r4(Lc); c.area = r6(perF * Lc); c.areaForma = c.area;
      exato(c, { volume: s.area * Lc, comprimentoViga: Lc, area: perF * Lc, perimetroSecao: s.perimetro, massa: mat && mat.rho ? s.area * Lc * mat.rho : null });
    } else if (c.tipo === "pilar" && inclinado(c)) {
      var gp = geomPilar(c, s), L = gp.Lax;
      c.volume = r6(s.area * L); c.comprimentoPilar = r4(L); c.areaForma = r6(s.perimetro * L);
      exato(c, { area: s.area, volume: s.area * L, comprimentoPilar: L, perimetroSecao: s.perimetro, areaForma: s.perimetro * L, massa: mat && mat.rho ? s.area * L * mat.rho : null });
    }
    return c;
  }
  /* o mapa (a, b, s) → mundo do 3D: { z0, z1, mapa } (null = a viga é a de sempre) */
  function malhaViga(c, s) {
    if (!temViga(c)) return null;
    var g = geomViga(c, s);
    return { z0: g.s0, z1: g.s1, mapa: function (a, b, u) { return soma(soma(soma(g.C, esc(g.T, u)), esc(g.W, a)), esc(g.N, b)); } };
  }

  /* PILAR INCLINADO ("Inclinado - Conduzido por ponto final", o rótulo do inventário): a base no
     ponto clicado, o topo deslocado de (topoDx, topoDz) na planta. A seção é
     PERPENDICULAR ao eixo e as pontas também (corte perpendicular) — o
     volume é área × comprimento do eixo (o mesmo de um corte horizontal:
     prisma oblíquo entre planos paralelos). CONFERIDO na referência medida em
     09/10/2026: o "Conduzido por ponto final" também corta as pontas
     perpendiculares ao eixo (a caixa desce 0,127·sen θ abaixo da base) —
     volume, comprimento e caixa batem (test-p9-estrutura [coleta]). */
  function geomPilar(c, s) {
    var H = num(c.altura, 0), base = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - H / 2;
    var B = [num(c.cx, 0), base, num(c.cz, 0)], dx = inclinado(c) ? num(c.topoDx, 0) : 0, dz = inclinado(c) ? num(c.topoDz, 0) : 0;
    var V = [dx, H, dz], Lax = Math.sqrt(dot(V, V)), T = unit(V);
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), U0 = [co, 0, -si];
    var U = unit(soma(U0, esc(T, -dot(U0, T)))), Vv = cruz(U, T);
    return { B: B, T: T, U: U, V: Vv, Lax: Lax };
  }
  function malhaPilar(c, s) {
    if (!inclinado(c)) return null;
    var g = geomPilar(c, s);
    return { z0: 0, z1: g.Lax, mapa: function (a, b, u) { return soma(soma(soma(g.B, esc(g.T, u)), esc(g.U, a)), esc(g.V, b)); } };
  }

  /* MARCA DA LOCALIZAÇÃO DA COLUNA (o "B-2"): o eixo mais perto e o
     mais perto que o cruza (não paralelo); a letra antes do número. Fora do
     cruzamento (> 0,5 mm), o afastamento em mm entre parênteses — formato
     e sinal CONFERIDOS na referência medida de 09/10/2026: 30 cm a leste do eixo 2
     (que corre para o norte) = "B-2(300)" (test-p9-estrutura [coleta]). */
  function marcaLocalizacao(c, eixos) {
    var P = [num(c.cx, 0), num(c.cz, 0)], L = [];
    arr(eixos).forEach(function (e) {
      var dx = num(e.x1, 0) - num(e.x0, 0), dz = num(e.z1, 0) - num(e.z0, 0), len = Math.sqrt(dx * dx + dz * dz); if (!(len > 1e-6)) return;
      var ux = dx / len, uz = dz / len, d = (P[0] - num(e.x0, 0)) * (-uz) + (P[1] - num(e.z0, 0)) * ux;   /* distância com sinal (esquerda +) */
      L.push({ e: e, u: [ux, uz], d: d });
    });
    if (L.length < 2) return "";
    L.sort(function (a, b) { return Math.abs(a.d) - Math.abs(b.d); });
    var g1 = L[0], g2 = null;
    for (var i = 1; i < L.length; i++) if (Math.abs(g1.u[0] * L[i].u[1] - g1.u[1] * L[i].u[0]) > 0.2) { g2 = L[i]; break; }
    if (!g2) return "";
    var par = [g1, g2].sort(function (a, b) { var na = /^\d/.test(String(a.e.nome)), nb = /^\d/.test(String(b.e.nome)); return na === nb ? 0 : (na ? 1 : -1); });
    return par.map(function (g) { var mm = Math.round(g.d * 1000); return String(g.e.nome) + (Math.abs(g.d) > 0.0005 ? "(" + mm + ")" : ""); }).join("-");
  }
  /* MOVE COM EIXOS: o eixo andou (dx, dz) — os pilares que estavam SOBRE ele
     (a menos de 1 mm da linha) andam junto, só a componente perpendicular ao
     eixo (andar ao longo dele não muda nada). "Move com eixos" = Não fica. */
  function eixoMoveu(e0, ddx, ddz, caixas, ordem) {
    var dx = num(e0.x1, 0) - num(e0.x0, 0), dz = num(e0.z1, 0) - num(e0.z0, 0), len = Math.sqrt(dx * dx + dz * dz), n = 0;
    if (!(len > 1e-6) || !(Math.abs(ddx) + Math.abs(ddz) > 1e-9)) return 0;
    var nx = -dz / len, nz = dx / len, k = ddx * nx + ddz * nz, mx = k * nx, mz = k * nz, A9 = Arq();
    if (Math.abs(k) < 1e-9) return 0;
    arr(ordem).forEach(function (id) {
      var c = caixas[id]; if (!c || c.tipo !== "pilar" || c.moveComEixos === false) return;
      var d = (num(c.cx, 0) - num(e0.x0, 0)) * nx + (num(c.cz, 0) - num(e0.z0, 0)) * nz;
      if (Math.abs(d) > 0.001) return;
      c.cx = r4(num(c.cx, 0) + mx); c.cz = r4(num(c.cz, 0) + mz);
      if (c.b2 && A9 && A9.transladar) A9.transladar(c, mx, mz);
      n++;
    });
    return n;
  }

  /* TRELIÇA SIMPLES (madeira): banzo inferior, banzo superior (paralelo ou
     em duas águas — "tesoura"), montantes e diagonais. Barras de eixo a eixo
     (os nós contam em cada barra: madeira se compra por metro de peça). Cada
     barra vira peça do modelador: banzos e diagonais = VIGA com
     "Justificação z: Centro" e o desnível pelos deslocamentos do nível
     inicial/final; montantes = PILAR. o = { tipo: 'tesoura'|'paralela',
     altura (m, no meio), paineis (par, ≥ 2), base (cota do eixo do banzo
     inferior), banzo: {b, h}, alma: {b, h} }. */
  function trelica(p1, p2, o) {
    o = o || {};
    var a = [num(p1 && (p1.x != null ? p1.x : p1[0]), NaN), num(p1 && (p1.z != null ? p1.z : p1[1]), NaN)], b = [num(p2 && (p2.x != null ? p2.x : p2[0]), NaN), num(p2 && (p2.z != null ? p2.z : p2[1]), NaN)];
    if (!fin(a[0]) || !fin(a[1]) || !fin(b[0]) || !fin(b[1])) return { ok: false, motivo: "Pontos inválidos." };
    var L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), H = num(o.altura, L / 6), np = Math.round(num(o.paineis, 6)), y0 = num(o.base, 0);
    var tipo = o.tipo === "paralela" ? "paralela" : "tesoura";
    if (!(L >= 1 && L <= 40)) return { ok: false, motivo: "Vão da treliça entre 1 e 40 m." };
    if (!(H >= 0.2 && H <= 10)) return { ok: false, motivo: "Altura da treliça entre 0,20 e 10 m." };
    if (!(np >= 2 && np <= 40) || np % 2) return { ok: false, motivo: "Número de painéis par, entre 2 e 40." };
    var d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    function P(x, y) { return { x: r6(a[0] + d[0] * x), y: r6(y0 + y), z: r6(a[1] + d[1] * x) }; }
    function yt(x) { return tipo === "paralela" ? H : H * (1 - Math.abs(2 * x / L - 1)); }
    var bars = [], dx = L / np;
    function barra(papel, A, B) { bars.push({ papel: papel, a: A, b: B }); }
    for (var i = 0; i < np; i++) barra("Banzo inferior", P(i * dx, 0), P((i + 1) * dx, 0));
    if (tipo === "paralela") { for (var j = 0; j < np; j++) barra("Banzo superior", P(j * dx, H), P((j + 1) * dx, H)); }
    else { barra("Banzo superior", P(0, 0), P(L / 2, H)); barra("Banzo superior", P(L / 2, H), P(L, 0)); }
    for (var k = (tipo === "paralela" ? 0 : 1); k <= (tipo === "paralela" ? np : np - 1); k++) { var x = k * dx; if (yt(x) >= 0.15) barra("Montante", P(x, 0), P(x, yt(x))); }
    /* diagonais "Howe": descem para o meio do vão (Pratt na paralela: sobem para o meio) */
    for (var m = 0; m < np; m++) {
      var xa = m * dx, xb = (m + 1) * dx, esqd = (m + 0.5) < np / 2;
      if (tipo === "tesoura" && (m === 0 || m === np - 1)) continue;   /* o 1º painel da tesoura é triângulo: não leva diagonal */
      if (tipo === "tesoura") { if (esqd) barra("Diagonal", P(xa, yt(xa)), P(xb, 0)); else barra("Diagonal", P(xa, 0), P(xb, yt(xb))); }
      else { if (esqd) barra("Diagonal", P(xa, H), P(xb, 0)); else barra("Diagonal", P(xa, 0), P(xb, H)); }
    }
    var comp = 0, por = {};
    bars.forEach(function (q) { var l = Math.sqrt(Math.pow(q.b.x - q.a.x, 2) + Math.pow(q.b.y - q.a.y, 2) + Math.pow(q.b.z - q.a.z, 2)); q.comprimento = r6(l); comp += l; por[q.papel] = r4((por[q.papel] || 0) + l); });
    return { ok: true, tipo: tipo, vao: r4(L), altura: r4(H), paineis: np, barras: bars, comprimento: r4(comp), porPapel: por };
  }
  /* a treliça num LOTE (um Ctrl+Z desfaz tudo): as barras como peças */
  function opsTrelica(p1, p2, o, novoId) {
    var A9 = Arq(), t = trelica(p1, p2, o); if (!t.ok || !A9 || typeof novoId !== "function") return t.ok ? { ok: false, motivo: "Motor do modelador não carregado." } : t;
    o = o || {};
    var bz = o.banzo || { b: 0.06, h: 0.16 }, al = o.alma || bz, idT = String(o.id || novoId()), ops = [], falhas = 0, d3 = [(t.barras[0].b.x - t.barras[0].a.x), (t.barras[0].b.z - t.barras[0].a.z)];
    t.barras.forEach(function (q) {
      var sec = q.papel === "Banzo inferior" || q.papel === "Banzo superior" ? bz : al, perfil = { forma: "ret", b: num(sec.b, 0.06), h: num(sec.h, 0.16) }, c;
      if (q.papel === "Montante") {
        c = A9.pilarPerfil([q.a.x, q.a.z], { perfil: perfil, material: "madeira", base: q.a.y, altura: q.b.y - q.a.y, rotY: Math.atan2(-d3[1], d3[0]), nivelId: o.nivelId != null ? o.nivelId : null });
      } else {
        c = A9.vigaPerfil([q.a.x, q.a.z], [q.b.x, q.b.z], { perfil: perfil, material: "madeira", topo: q.a.y, nivelId: o.nivelId != null ? o.nivelId : null });
        if (c) { c.justZ = "centro"; if (Math.abs(q.b.y - q.a.y) > 1e-6) c.dFim = r6(q.b.y - q.a.y); A9.recalcPeca(c); }
      }
      if (!c) { falhas++; return; }
      c.trelica = { id: idT, papel: q.papel };
      ops.push({ op: "criar", id: String(novoId()), caixa: A9.paraOp(c) });
    });
    if (!ops.length) return { ok: false, motivo: "Nenhuma barra válida." };
    return { ok: true, trelica: t, falhas: falhas, op: { op: "lote", id: String(novoId()), origem: "trelica", ops: ops } };
  }

  /* a op ajustar {campos: {estrut: {...}}} — viga e pilar, campo a campo */
  function ajustar(c, campos) {
    if (!c || !campos || typeof campos !== "object") return false;
    var mudou = false, L = c.tipo === "viga" ? CAMPOS_VIGA : (c.tipo === "pilar" ? CAMPOS_PILAR : []);
    Object.keys(campos).forEach(function (k) {
      if (L.indexOf(k) < 0) return;
      var v = campos[k];
      if (v === null || v === "") { delete c[k]; mudou = true; return; }
      if (k === "justY") { c.justY = idDe(JUST_Y, v, "origem"); if (c.justY === "origem") delete c.justY; mudou = true; return; }
      if (k === "justZ") { c.justZ = idDe(JUST_Z, v, "topo"); if (c.justZ === "topo") delete c.justZ; mudou = true; return; }
      if (k === "estilo") { c.estilo = idDe(ESTILOS_PILAR, v, "vertical"); if (c.estilo === "vertical") delete c.estilo; mudou = true; return; }
      if (k === "moveComEixos") { if (v === false || v === "Não" || v === "nao") c.moveComEixos = false; else delete c.moveComEixos; mudou = true; return; }
      var n = Number(v); if (!isFinite(n) || Math.abs(n) > 30) return;
      c[k] = r6(n); mudou = true;
    });
    return mudou;
  }

  /* ======================================================== C — RAMPA (NBR 9050)
   * Tabela de dimensionamento de rampas da ABNT NBR 9050 (edição 2020 +
   * Emenda 1:2021 em vigor — biblioteca de normas da RA, vigencia.json,
   * conferido 03/10/2026). ⚠ O TEXTO da 9050 NÃO está na biblioteca (só a
   * vigência): os limites abaixo são os que a RA usa e confere em projeto;
   * cada um leva "conferir NBR 9050:2020" no aviso até a conferência na
   * norma (portal do convênio Confea/ABNT). Não mexer nos números sem a norma
   * aberta.
   *   inclinação i ≤ 5,00 % (1:20) ......... desnível máximo do segmento 1,50 m
   *   5,00 % < i ≤ 6,25 % (1:16) ............ 1,00 m
   *   6,25 % < i ≤ 8,33 % (1:12) ............ 0,80 m
   *   acima de 8,33 %: não se admite rampa (reforma: conferir a exceção da norma)
   *   largura livre: mínima admissível 1,20 m, recomendável 1,50 m
   *   patamar (início, fim e entre segmentos): mínimo 1,20 m, recomendável 1,50 m
   *   percurso: patamar a cada 50 m (conferir a condição exata na norma)
   *   corrimão em duas alturas, 0,92 m e 0,70 m do piso */
  var NBR9050 = {
    fonte: "ABNT NBR 9050:2020 (em vigor, com a Emenda 1:2021) — limites a CONFERIR no texto da norma (não está na biblioteca de normas da RA)",
    faixas: [{ iMax: 5.0, hMax: 1.50, rotulo: "até 5 % (1:20)" }, { iMax: 6.25, hMax: 1.00, rotulo: "de 5 % a 6,25 % (1:16)" }, { iMax: 8.33, hMax: 0.80, rotulo: "de 6,25 % a 8,33 % (1:12)" }],
    larguraMin: 1.20, larguraRecomendada: 1.50, patamarMin: 1.20, patamarRecomendado: 1.50, percursoMax: 50, corrimaos: [0.92, 0.70]
  };
  function rampaCalc(H, o) {
    o = o || {};
    H = num(H, 0);
    var i = num(o.inclinacao, 8.33), W = num(o.largura, 1.20), Pt = num(o.patamar, 1.50), avisos = [], conferir = [];
    if (!(H >= 0.05 && H <= 6)) return { ok: false, motivo: "Desnível da rampa entre 0,05 e 6 m." };
    if (!(i >= 0.5)) return { ok: false, motivo: "Inclinação mínima de 0,5 %." };
    var fx = null; for (var k = 0; k < NBR9050.faixas.length; k++) if (i <= NBR9050.faixas[k].iMax + 1e-9) { fx = NBR9050.faixas[k]; break; }
    if (!fx) return { ok: false, motivo: "Inclinação de " + String(i).replace(".", ",") + " % passa de 8,33 % (1:12): a NBR 9050 não admite rampa nova acima disso (reforma: conferir a exceção na norma)." };
    var s = i / 100, nseg = Math.max(1, Math.ceil(H / fx.hMax - 1e-9)), h = H / nseg, Ls = h / s;
    /* patamar a cada 50 m de percurso: segmento mais comprido que isso é partido */
    while (Ls > NBR9050.percursoMax + 1e-9 && nseg < 200) { nseg++; h = H / nseg; Ls = h / s; }
    if (W < NBR9050.larguraMin - 1e-9) avisos.push("Largura de " + cm(W) + " cm abaixo da mínima admissível de " + cm(NBR9050.larguraMin) + " cm (NBR 9050 — conferir).");
    else if (W < NBR9050.larguraRecomendada - 1e-9) avisos.push("Largura de " + cm(W) + " cm: a recomendável é " + cm(NBR9050.larguraRecomendada) + " cm (NBR 9050 — conferir).");
    if (nseg > 1 && Pt < NBR9050.patamarMin - 1e-9) avisos.push("Patamar de " + cm(Pt) + " cm abaixo do mínimo de " + cm(NBR9050.patamarMin) + " cm (NBR 9050 — conferir).");
    conferir.push("Limites da NBR 9050:2020 a conferir no texto da norma (inclinação × desnível do segmento " + fx.rotulo + ": até " + cm(fx.hMax) + " cm por segmento; patamar a cada 50 m).");
    return { ok: true, inclinacao: r4(i), faixa: fx.rotulo, hMax: fx.hMax, segmentos: nseg, h: r6(h), comprimentoSegmento: r6(Ls), largura: W, patamar: Pt, avisos: avisos, conferir: conferir, fonte: NBR9050.fonte };
  }
  /* o perfil (lateral) de um segmento: laje inclinada de espessura t (na
     perpendicular) — cunha no pé (a espessura nasce do zero, como a rampa
     "Espessura"), polígono simples */
  function perfilSeg(L, h, t) {
    var s = h / L, g = t * Math.sqrt(1 + s * s), u0 = g / s, pts, fundo;
    if (h - g > 1e-6 && u0 < L - 1e-6) { pts = [[0, 0], [L, h], [L, h - g], [u0, 0]]; fundo = Math.sqrt((L - u0) * (L - u0) + (h - g) * (h - g)); }
    else { pts = [[0, 0], [L, h], [L, 0]]; fundo = L; }
    return { pts: pts, fundo: fundo };
  }
  function areaPoli(p) { var a = 0; for (var i = 0; i < p.length; i++) { var u = p[i], w = p[(i + 1) % p.length]; a += u[0] * w[1] - w[0] * u[1]; } return Math.abs(a) / 2; }
  /* par = { x, z (meio do pé da rampa), ang (direção da subida), base,
     desnivel, largura, inclinacao (%), espessura, patamar (m), forma:
     'reta'|'U', giro, vao (U), guarda: 'dois'|'um'|'nenhum' } */
  function rampa(par) {
    par = clone(par || {});
    if (!fin(Number(par.x)) || !fin(Number(par.z)) || !fin(Number(par.ang))) return null;
    var W = num(par.largura, 1.20), t = num(par.espessura, 0.12), base = num(par.base, 0), H = num(par.desnivel, 0);
    if (!(W >= 0.8 && W <= 6) || !(t >= 0.06 && t <= 0.4)) return null;
    var calc = rampaCalc(H, { inclinacao: par.inclinacao, largura: W, patamar: par.patamar });
    if (!calc.ok) return null;
    var forma = par.forma === "U" ? "U" : "reta", g = par.giro === "esquerda" ? -1 : 1, vao = forma === "U" ? Math.max(0, Math.min(3, num(par.vao, 0))) : 0;
    var n = calc.segmentos, h = calc.h, Ls = calc.comprimentoSegmento, Pt = calc.patamar;
    var d = [Math.cos(Number(par.ang)), Math.sin(Number(par.ang))], r = [-d[1], d[0]];
    var lances = [], patamares = [], vol = 0, aPiso = 0, aProj = 0, fundo = 0, lat = 0, perc = 0, caminhos = {};
    var bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
    function cx(x, y, z) { if (x < bb.x0) bb.x0 = x; if (x > bb.x1) bb.x1 = x; if (z < bb.z0) bb.z0 = z; if (z > bb.z1) bb.z1 = z; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y; }
    var S = [Number(par.x), Number(par.z)], dir = d.slice(), m = 0.05, hs = W / 2 - m;
    function pt(o, du, w, D) { var R = [-D[1], D[0]]; return [o[0] + du * D[0] + w * R[0], o[1] + du * D[1] + w * R[1]]; }
    function P3(q, y) { return { x: r6(q[0]), y: r6(y), z: r6(q[1]) }; }
    for (var k = 0; k < n; k++) {
      var y0 = base + k * h, pf = perfilSeg(Ls, h, t), A = areaPoli(pf.pts), R = [-dir[1], dir[0]];
      lances.push({ perfil: pf.pts.map(function (q) { return { u: r6(q[0]), y: r6(q[1]) }; }), largura: W, x: r6(S[0]), z: r6(S[1]), ang: r6(Math.atan2(dir[1], dir[0])), y: r6(y0), seg: k + 1, area: r6(A) });
      vol += A * W; lat += 2 * A; fundo += W * pf.fundo; aPiso += Math.sqrt(Ls * Ls + h * h) * W; aProj += Ls * W; perc += Ls;
      pf.pts.forEach(function (q) { [-W / 2, W / 2].forEach(function (w) { cx(S[0] + q[0] * dir[0] + w * R[0], y0 + q[1], S[1] + q[0] * dir[1] + w * R[1]); }); });
      /* guarda-corpo: as duas laterais de cada segmento (a 5 cm da borda) */
      var E = pt(S, Ls, 0, dir);
      caminhos["s" + (k + 1) + "d"] = [P3(pt(S, 0, hs, dir), y0), P3(pt(S, Ls, hs, dir), y0 + h)];
      caminhos["s" + (k + 1) + "e"] = [P3(pt(S, 0, -hs, dir), y0), P3(pt(S, Ls, -hs, dir), y0 + h)];
      if (k === n - 1) break;
      /* PATAMAR entre segmentos: na reta, Pt de comprimento; na U, Pt de
         profundidade e a largura dos dois segmentos + o vão */
      var yP = y0 + h, cant;
      if (forma === "reta") {
        cant = [pt(E, 0, -W / 2, dir), pt(E, Pt, -W / 2, dir), pt(E, Pt, W / 2, dir), pt(E, 0, W / 2, dir)];
        perc += Pt;
        /* na reta o guarda-corpo segue pelo patamar */
        caminhos["s" + (k + 1) + "d"].push(P3(pt(E, Pt, hs, dir), yP));
        caminhos["s" + (k + 1) + "e"].push(P3(pt(E, Pt, -hs, dir), yP));
        S = pt(E, Pt, 0, dir);
      } else {
        var wa = -g * W / 2, wb = g * (W + vao + W / 2);
        cant = [pt(E, 0, Math.min(wa, wb), dir), pt(E, Pt, Math.min(wa, wb), dir), pt(E, Pt, Math.max(wa, wb), dir), pt(E, 0, Math.max(wa, wb), dir)];
        perc += Pt + W + vao;
        S = pt(E, 0, g * (W + vao), dir); dir = [-dir[0], -dir[1]];
      }
      var aP = areaPoli(cant);
      patamares.push({ pts: cant.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }), y0: r6(yP - t), y1: r6(yP) });
      vol += aP * t; aPiso += aP; aProj += aP; fundo += aP;
      cant.forEach(function (q) { cx(q[0], yP - t, q[1]); cx(q[0], yP, q[1]); });
    }
    /* na reta, cada lado é UM guarda-corpo contínuo (segmento + patamar + segmento…) */
    if (forma === "reta" && n > 1) {
      var junta = function (suf) { var o = []; for (var j = 1; j <= n; j++) caminhos["s" + j + suf].forEach(function (q) { var u = o[o.length - 1]; if (!u || Math.abs(u.x - q.x) + Math.abs(u.y - q.y) + Math.abs(u.z - q.z) > 1e-6) o.push(q); }); return o; };
      caminhos = { direita: junta("d"), esquerda: junta("e") };
    } else if (forma === "reta") caminhos = { direita: caminhos.s1d, esquerda: caminhos.s1e };
    var c = {
      tipo: "rampa", ifc: "IFCRAMP", b2: 1,
      cx: r6((bb.x0 + bb.x1) / 2), cz: r6((bb.z0 + bb.z1) / 2), cy: r6((bb.y0 + bb.y1) / 2),
      comprimento: r6(Math.max(0.01, bb.x1 - bb.x0)), espessura: r6(Math.max(0.01, bb.z1 - bb.z0)), altura: r6(Math.max(0.01, bb.y1 - bb.y0)), rotY: 0,
      rampa: { par: { x: Number(par.x), z: Number(par.z), ang: Number(par.ang), base: base, desnivel: H, largura: W, inclinacao: calc.inclinacao, espessura: t, patamar: Pt, forma: forma, giro: g < 0 ? "esquerda" : "direita", guarda: par.guarda === "um" || par.guarda === "nenhum" ? par.guarda : "dois" },
               calc: calc, lances: lances, patamares: patamares, caminhos: caminhos },
      area: r4(aPiso), volume: r6(vol),
      medidas: { volume: r6(vol), area: r4(aPiso), areaProjecao: r4(aProj), areaForma: r4(fundo + lat), comprimento: r4(perc), un: 1, segmentos: n }
    };
    if (forma === "U") c.rampa.par.vao = r6(vao);
    exato(c, { area: aPiso, volume: vol, medidas: { volume: vol, area: aPiso, areaProjecao: aProj, areaForma: fundo + lat, comprimento: perc } });
    if (par.nivelId != null) c.nivelId = String(par.nivelId);
    return c;
  }
  function recalcRampa(c) {
    var n = rampa(c && c.rampa && c.rampa.par);
    if (!n) { c.avisos = ["rampa com parâmetros inválidos"]; return c; }
    Object.keys(n).forEach(function (k) { c[k] = n[k]; });
    exato(c, n._exato || null);
    return c;
  }
  /* a rampa e os guarda-corpos dela (corrimão duplo da NBR 9050) num LOTE */
  function opsRampa(rp, novoId, o) {
    var A9 = Arq(); if (!rp || !A9 || typeof novoId !== "function") return null;
    o = o || {};
    var idR = String(novoId()), ops = [{ op: "criar", id: idR, caixa: paraOp(rp) }], modo = o.guarda || rp.rampa.par.guarda || "dois";
    if (modo !== "nenhum") {
      var todos = Object.keys(rp.rampa.caminhos), lados = modo === "um" ? todos.filter(function (k) { return k === "direita" || /^s\d+d$/.test(k); }) : todos;   /* "um" = o lado direito de quem sobe */
      lados.forEach(function (lado) {
        var gc = A9.guarda(rp.rampa.caminhos[lado], { altura: o.altura || 1.10, espac: o.espac || 1.20, c1Altura: NBR9050.corrimaos[0], c2Altura: NBR9050.corrimaos[1] });
        if (!gc) return;
        gc.guarda.host = { id: idR, lado: lado, ordem: todos.indexOf(lado) };
        if (rp.nivelId != null) gc.nivelId = rp.nivelId;
        ops.push({ op: "criar", id: String(novoId()), caixa: A9.paraOp(gc) });
      });
    }
    return { op: "lote", id: String(novoId()), origem: "rampa", ops: ops };
  }
  function paraOp(c) {
    var o = clone(c);
    if (o.rampa) o.rampa = { par: o.rampa.par };
    delete o.marcaLocal;
    return o;
  }
  var CAMPOS_RAMPA = ["desnivel", "largura", "inclinacao", "espessura", "patamar", "forma", "giro", "vao", "guarda", "base"];
  function ajustarRampa(c, campos) {
    if (!c || c.tipo !== "rampa" || !c.rampa || !campos) return false;
    var mudou = false;
    Object.keys(campos).forEach(function (k) {
      if (CAMPOS_RAMPA.indexOf(k) < 0) return;
      var v = campos[k];
      if (k === "forma") v = /u/i.test(String(v)) ? "U" : "reta";   /* a paleta grava o rótulo ("Em U") */
      c.rampa.par[k] = v; mudou = true;
    });
    return mudou;
  }

  /* =================================================== ganchos do js/bimarq.js */
  /* depois do replay (BimArq.derivar): a marca da localização de cada pilar */
  function fimDerivar(estado) {
    var ex = arr(estado && estado.eixos);
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "pilar") return;
      if (ex.length >= 2) { var mk = marcaLocalizacao(c, ex); if (mk) c.marcaLocal = mk; else delete c.marcaLocal; }
      else delete c.marcaLocal;
    });
    return estado;
  }

  var BimEstrut = {
    JUST_Y: JUST_Y, JUST_Z: JUST_Z, ESTILOS_PILAR: ESTILOS_PILAR, CAMPOS_VIGA: CAMPOS_VIGA, CAMPOS_PILAR: CAMPOS_PILAR, CAMPOS_RAMPA: CAMPOS_RAMPA, NBR9050: NBR9050,
    idDe: idDe, rotuloDe: rotuloDe, temViga: temViga, inclinado: inclinado,
    geomProps: geomProps, propsSecao: propsSecao,
    geomViga: geomViga, geomPilar: geomPilar, posPeca: posPeca, malhaViga: malhaViga, malhaPilar: malhaPilar,
    marcaLocalizacao: marcaLocalizacao, eixoMoveu: eixoMoveu, trelica: trelica, opsTrelica: opsTrelica, ajustar: ajustar,
    rampaCalc: rampaCalc, rampa: rampa, recalcRampa: recalcRampa, opsRampa: opsRampa, paraOp: paraOp, ajustarRampa: ajustarRampa,
    fimDerivar: fimDerivar
  };

  global.BimEstrut = BimEstrut;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEstrut;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

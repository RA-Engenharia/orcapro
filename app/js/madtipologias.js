/* =====================================================================
 * madtipologias.js — GERADOR PARAMÉTRICO de tipologias de estrutura de madeira (motor PURO, ES5, sem DOM, Node-testável).
 * Entra: parâmetros em METROS (coordenadas locais — origem no pilar 1; qualquer referencial serve, desde que único).
 * Sai: a GEOMETRIA (funções de cota/altura usadas pelo modelo de cálculo, em maddimensionar2.js) e a "FONTE": a lista de peças no MESMO
 * formato do fonte_casamar.py da obra Casa Mar (R02):
 *   { id, grupo, descricao, material, especificacao, secao: {tipo: "ret"|"circ"|"perfil", b, h, d, perfil, area_media} | null,
 *     p0, p1 (eixo, m), up (vetor da altura h da seção), qtd, comprimento_m, volume_m3, unidade }
 * Itens sem geometria (telha, lambri, parafusos, chapas): secao/p0/p1 = null + quantidade.
 *
 * T1 — cobertura de UMA ÁGUA, pilares nos cantos, 2 vigas V (altura variável opcional), terças contínuas, bloqueadores, escoras, fita em X,
 *      vergas do topo do vidro (com travessa + pendural) e beirais. A Casa Mar é um CASO de parâmetros (ver tools/test-mad-eng-casamar.js).
 * T7 — DECK ELEVADO: vigas nas bordas, barrotes, pilaretes (com mão-francesa se h > 0,40 m), apoio direto em bloco se h < 0,15 m,
 *      escada e guarda-corpo (quantidades).
 * As outras tipologias (T2–T6, T8, T9) são da entrega E4.
 *
 * Teste: node tools/test-mad-eng-tipologias.js e tools/test-mad-eng-casamar.js (regressão)
 * ===================================================================== */
(function (global) {
  "use strict";

  var MLC = "MLC GL24h (EN 14080) — pinus/eucalipto, cola PUR/MUF classe de serviço 3";
  var MLC_TRAT = "MLC GL24h tratada em autoclave (CCA/CCB, categoria de uso 4 — NBR 16143)";
  var ROLICO_MAR = "Eucalipto roliço autoclavado CCA, categoria de uso 5 (água salgada — NBR 16143)";
  var CUMARU = "Cumaru (Dipteryx odorata) seco em estufa, 1ª qualidade";
  var INOX = "aço inox AISI 316 (A4)";
  var GALV = "aço ASTM A36 galvanizado a fogo (NBR 6323)";
  var MATERIAIS = { MLC: MLC, MLC_TRAT: MLC_TRAT, ROLICO_MAR: ROLICO_MAR, CUMARU: CUMARU, INOX: INOX, GALV: GALV };

  function z(n, w) { var t = String(n); while (t.length < w) t = "0" + t; return t; }
  function rd(x, n) { return Number(x.toFixed(n)); }               // arredondamento como o round() do Python (decimal correto do double)
  function norm(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
  function arange(a, b, s) { var n = Math.ceil((b - a) / s), o = [], i; for (i = 0; i < n; i++) o.push(a + i * s); return o; }
  function linspace(a, b, n) { var o = [], i; if (n === 1) return [a]; for (i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; }
  function interp(x, xs, ys) { if (x <= xs[0]) return ys[0]; if (x >= xs[xs.length - 1]) return ys[ys.length - 1]; for (var i = 0; i + 1 < xs.length; i++) if (x <= xs[i + 1]) return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[ys.length - 1]; }

  /* acumulador de peças (mesma regra do add() do fonte_casamar.py) */
  function Lista() {
    var pecas = [];
    return {
      pecas: pecas,
      add: function (k) {
        if (k.qtd == null) k.qtd = 1; if (!k.unidade) k.unidade = "peça";
        if (k.p0 && k.p1) {
          var L = norm(k.p0, k.p1); k.comprimento_m = rd(L, 3);
          var s = k.secao, A = s.tipo === "ret" ? s.b * s.h : s.tipo === "circ" ? Math.PI * s.d * s.d / 4 : (s.area_media || 0);
          k.volume_m3 = rd(A * L * k.qtd, 4);
        }
        k.p0 = k.p0 ? k.p0.map(function (v) { return rd(v, 4); }) : null; k.p1 = k.p1 ? k.p1.map(function (v) { return rd(v, 4); }) : null;
        if (k.secao === undefined) k.secao = null;
        pecas.push(k); return k;
      }
    };
  }

  /** A10: a classe CALCULADA vai para a lista de peças (os textos-base dizem GL24h; troca pelo nome da classe usada, ex. "mlc:GL28h" → GL28h) */
  function comClasse(lista, classe) {
    var nome = String(classe || "mlc:GL24h").split(":")[1] || "GL24h";
    return function (k) { ["material", "especificacao", "descricao"].forEach(function (c) { if (typeof k[c] === "string") k[c] = k[c].replace(/GL24h/g, nome); }); return lista.add(k); };
  }
  function cm(x) { return rd(x * 100, 0); }
  /* ====================================================================== T1 */
  var T1_PADRAO = {
    cobertura: { incl: 0.048, lambri: 0.025, sTercaMax: 0.95, escOff: 0.55, nEsc: 2, hMinV: 0.30, hPonta: 0.30, vAlturaVariavel: true },
    fita: { b: 0.06, e: 0.002, aproveitamento: 0.75 },
    travessa: { b: 0.08, h: 0.20 }, pendural: { b: 0.06, h: 0.12 }, bloqueador: { b: 0.06 },
    escora: { modelo: { b: 0.06, h: 0.12 }, fonte: { b: 0.08, h: 0.14 } },
    origem: { x: 0, y: 0 }, faixaSuperior: 0.74,                // faixa entre o topo do vidro e o lambri (m) — A11: parâmetro, não mais embutido (0,74 = Casa Mar)
    testeiraH: 0.25,                                              // M1: altura da testeira do perímetro (m) — sobe o ponto mais alto do telhado usado na altura de referência do vento
    kFlambagem: null  // M7: null = calculado pela mola real da base (maddim7190.betaFlambagemMola); número = imposto pelo usuário (R01 usava 2,4)
  };
  function mescla(base, o) { var r = {}, k; for (k in base) r[k] = (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) ? mescla(base[k], (o || {})[k]) : ((o || {})[k] != null ? o[k] : base[k]); for (k in (o || {})) if (!(k in r)) r[k] = o[k]; return r; }

  /**
   * Parâmetros de T1 (m):
   *  pilares {x:[x1,x2], y:[y1,y2]} (eixos dos 4 pilares), teto {x0,x1,y0,y1} (limites da cobertura com beirais),
   *  parede {x0,x1,y0,y1} (planta do vidro/fechamento), baseZ, vidroTopo (cotas), zTelhaRef + yRef (cota da face de cima da telha em y = yRef),
   *  cobertura {incl, lambri, sTercaMax, escOff, nEsc, hMinV, hPonta}, origem {x,y} (deslocamento do solver), hParedeTopo (faixa de fachada que
   *  descarrega no topo = ½ altura do vidro + faixa superior), fita, travessa, pendural, escora, bloqueador, telha {...}, nome.
   * Retorna os mesmos parâmetros completados.
   */
  function t1Parametros(p) {
    var q = mescla(T1_PADRAO, p);
    ["pilares", "teto", "parede", "baseZ", "vidroTopo", "zTelhaRef", "yRef"].forEach(function (k) { if (q[k] == null) throw new Error("madtipologias T1: parâmetro obrigatório ausente: " + k); });
    var PX = q.pilares.x, PY = q.pilares.y, T = q.teto;
    /* A2: beiral ≥ 0 (o teto cobre os pilares); com beiral < escOff não há nó/escora do lado de fora */
    if (T.x0 > PX[0] + 1e-9 || T.x1 < PX[1] - 1e-9 || T.y0 > PY[0] + 1e-9 || T.y1 < PY[1] - 1e-9) throw new Error("madtipologias T1: beiral negativo — o teto (x0,x1,y0,y1) precisa cobrir os 4 pilares");
    if (q.vidroTopo <= q.baseZ) throw new Error("madtipologias T1: vidroTopo abaixo da base do pilar");
    /* A11: faixa de fachada que descarrega no topo = ½ altura do vão de vidro + faixa acima do vidro (derivada quando não informada) */
    if (q.hParedeTopo == null) q.hParedeTopo = (q.vidroTopo - q.baseZ) / 2 + q.faixaSuperior;
    return q;
  }

  /** Geometria de T1 para as seções `sec` {T:{b,h}, V:{b}, VG:{b,h}, P:{forma,...}}: alturas e cotas (funções) usadas pelo modelo e pela fonte */
  function t1Geometria(p, sec) {
    var c = p.cobertura, PX = p.pilares.x, PY = p.pilares.y, TETO = p.teto, PAREDE = p.parede, hT = sec.T.h;
    /* R21 (fix): a altura da V na ponta do balanço pode CRESCER no laço (sec.hPonta, em passos de 40 mm) até hPontaMax (altura máxima atrás da testeira/faixa da arquitetura); sem sec.hPonta vale c.hPonta (igual ao de antes) */
    var hPonta = sec.hPonta != null ? sec.hPonta : c.hPonta, hPontaMax = Math.max(c.hPontaMax != null ? c.hPontaMax : c.hPonta, hPonta);
    var zTelha = function (y) { return p.zTelhaRef + c.incl * (p.yRef - y); };
    var vBaseFundo = Math.min(zTelha(PY[0]), zTelha(PY[1])) - c.lambri - hT - c.hMinV;     // lado BAIXO do caimento (vale p/ incl < 0)
    var DZ = Math.max(0, p.vidroTopo - vBaseFundo);                                          // A3: quanto a TELHA precisa subir; a V senta no vidro, o pilar termina no vidro
    var zt = function (y) { return zTelha(y) + DZ; };
    var nT = Math.ceil((TETO.y1 - TETO.y0) / c.sTercaMax), sT = (TETO.y1 - TETO.y0) / nT, yT = [], k;
    for (k = 0; k <= nT; k++) yT.push(TETO.y0 + k * sT);
    var tAxis = function (y) { return zt(y) - c.lambri - hT / 2; };
    var vTop = function (y) { return zt(y) - c.lambri - hT; };
    var vBot = function (y) {
      var b0 = p.vidroTopo;
      if (y < PAREDE.y0) { var tip = Math.max(b0, vTop(TETO.y0) - hPonta); return b0 + (tip - b0) * (PAREDE.y0 - y) / (PAREDE.y0 - TETO.y0); }
      if (y > PAREDE.y1) { var tip2 = Math.max(b0, vTop(TETO.y1) - hPonta); return b0 + (tip2 - b0) * (y - PAREDE.y1) / (TETO.y1 - PAREDE.y1); }
      return b0;
    };
    var hVy = function (y) { return vTop(y) - vBot(y); }, vAxis = function (y) { return (vTop(y) + vBot(y)) / 2; };
    var L = PX[1] - PX[0];
    var bal0 = TETO.x0 < PX[0] - 1e-6, bal1 = TETO.x1 > PX[1] + 1e-6, temE0a = PX[0] - c.escOff >= TETO.x0 + 1e-6, temE1b = PX[1] + c.escOff <= TETO.x1 - 1e-6, XT = [];
    if (bal0) XT.push(["bal0", TETO.x0]);                    // A2: sem beiral não há nó de balanço; com beiral < escOff não há nó de escora do lado de fora
    if (temE0a) XT.push(["e0a", PX[0] - c.escOff]);
    XT.push(["v0", PX[0]], ["e0b", PX[0] + c.escOff], ["t1", PX[0] + L / 3], ["m", PX[0] + L / 2], ["t2", PX[0] + 2 * L / 3], ["e1a", PX[1] - c.escOff], ["v1", PX[1]]);
    if (temE1b) XT.push(["e1b", PX[1] + c.escOff]);
    if (bal1) XT.push(["bal1", TETO.x1]);
    var vaoK = yT.map(function (y, i) { return i; }).filter(function (i) { return yT[i] > PY[0] && yT[i] < PY[1]; }).filter(function (i, j) { return j % c.nEsc === 0; });
    /* N1: a travessa (e o pendural) só existem se há DUAS terças vizinhas com o pilar entre elas, a mais de 5 cm de cada uma; sem beiral em Y a linha do pilar cai em cima da
       terça de borda (travessa de comprimento nulo / nó inexistente) → sem travessa e sem pendural: a verga é travada só nas pontas (L0z = vão) */
    var travessa = PY.map(function (y) {
      var k1 = 0, dmin = 1e9; yT.forEach(function (yy, j) { if (yy <= y + 1e-9) k1 = j; dmin = Math.min(dmin, Math.abs(yy - y)); });
      return { k1: k1, k2: k1 + 1, ok: k1 + 1 < yT.length && dmin >= 0.05 };
    });
    [TETO.y0, PY[0], PY[1], TETO.y1].forEach(function (yy) { if (hVy(yy) < 0.05) throw new Error("madtipologias T1: a viga V fica com " + (hVy(yy) * 100).toFixed(1) + " cm em y = " + yy.toFixed(2) + " (telhado baixo demais para o beiral/vidro) — subir zTelhaRef ou reduzir o beiral"); });
    return { hPonta: hPonta, hPontaMax: hPontaMax, p: p, PX: PX, PY: PY, TETO: TETO, PAREDE: PAREDE, DZ: DZ, nT: nT, bal0: bal0, bal1: bal1, temE0a: temE0a, temE1b: temE1b, sT: sT, yT: yT, zTelha: zTelha, zt: zt, tAxis: tAxis, vTop: vTop, vBot: vBot, hVy: hVy, vAxis: vAxis,
      XT: XT, vaoK: vaoK, travessa: travessa, L: L, vao: L, baseZ: p.baseZ, vidroTopo: p.vidroTopo, topoPilar: p.vidroTopo, lambri: c.lambri };
  }

  /**
   * FONTE de T1. sec = seções finais; ext = { LG: pacote de ligações (madligacoes.pacoteT1), titulo, opcao }.
   * Volumes em m³ por peça (qtd incluída). Não decide engenharia: só traduz as seções calculadas em peças.
   */
  function t1Fonte(p, sec, ext) {
    ext = ext || {};
    var g = t1Geometria(p, sec), LG = ext.LG || null, lista = Lista(), add = comClasse(lista, ext.classe);
    var kF = ext.kFlambagem != null ? ext.kFlambagem : (p.kFlambagem != null ? p.kFlambagem : 2.4);          // M7: β calculado (rodar → r.kFlambagem) ou o imposto/2,4 antigo
    var PX = g.PX, PY = g.PY, TETO = g.TETO, PAREDE = g.PAREDE, yT = g.yT, tz = yT.map(g.tAxis), T = sec.T, V = sec.V, P = sec.P, VG = sec.VG;
    var BASE_Z = p.baseZ, VIDRO_TOPO = p.vidroTopo, bot0 = VIDRO_TOPO;               // A3: a V senta no vidro; quem sobe é a telha (DZ)
    var esp = function (k, def) { return LG && LG[k] && LG[k].especificacao ? LG[k].especificacao : def; };
    var k, i;
    /* terças */
    yT.forEach(function (y, kk) {
      add({ id: "T" + z(kk + 1, 2), grupo: "Cobertura — terças", descricao: "Terça contínua sobre as vigas V, balanços laterais", material: MLC,
        especificacao: "MLC GL24h " + rd(T.b * 100, 0) + "×" + rd(T.h * 100, 0) + " cm, aplainada 4 faces, aparente (acabamento verniz/stain)",
        secao: { tipo: "ret", b: T.b, h: T.h }, p0: [TETO.x0, y, tz[kk]], p1: [TETO.x1, y, tz[kk]], up: [0, 0, 1] });
    });
    /* vigas V de altura variável */
    var ys_bot = [TETO.y0, PAREDE.y0, PAREDE.y1, TETO.y1], top = function (y) { return g.vTop(y); };
    var bots = [Math.max(bot0, top(TETO.y0) - g.hPonta), bot0, bot0, Math.max(bot0, top(TETO.y1) - g.hPonta)];
    var perfil = [[TETO.y0, top(TETO.y0)], [TETO.y1, top(TETO.y1)]].concat(ys_bot.map(function (y, j) { return [y, bots[j]]; }).reverse());
    var area = 0;
    for (i = 0; i < perfil.length; i++) { var a1 = perfil[i][0], b1 = perfil[i][1], a2 = perfil[(i + 1) % perfil.length][0], b2 = perfil[(i + 1) % perfil.length][1]; area += a1 * b2 - a2 * b1; }
    area = Math.abs(area) / 2; var Lv = TETO.y1 - TETO.y0;
    var hmax = Math.max.apply(null, ys_bot.map(function (y, j) { return top(y) - bots[j]; }));
    PX.forEach(function (x, iv) {
      var pc = add({ id: "V" + (iv + 1), grupo: "Cobertura — vigas principais", descricao: "Viga principal de altura variável (face de baixo reta sobre o vidro, face de cima no caimento)", material: MLC,
        especificacao: "MLC GL24h largura " + rd(V.b * 100, 0) + " cm, altura variável " + cm(p.cobertura.hMinV) + " a " + rd(hmax * 100, 0) + " cm (bloco bruto " + rd(V.b * 100, 0) + "×" + rd(Math.ceil(hmax * 25) / 25 * 100, 0) + " cm, recortado na fábrica), aparente",
        secao: { tipo: "perfil", b: V.b, h: hmax, perfil: perfil, area_media: V.b * area / Lv }, p0: [x, TETO.y0, 0], p1: [x, TETO.y1, 0], up: [0, 0, 1] });
      pc.eixo = [[x, TETO.y0, g.vAxis(TETO.y0)], [x, TETO.y1, g.vAxis(TETO.y1)]];
    });
    /* pilares */
    PX.forEach(function (x, iv) {
      PY.forEach(function (y, ip) {
        var n = "P" + (iv * 2 + ip + 1), pc;
        if (P.forma === "quadrado") {
          pc = add({ id: n, grupo: "Casa — pilares", descricao: "Pilar da casa, base engastada, topo rotulado na V", material: MLC, especificacao: "MLC GL24h " + rd(P.b * 100, 0) + "×" + rd(P.h * 100, 0) + " cm, aplainado, aparente",
            secao: { tipo: "ret", b: P.b, h: P.h }, p0: [x, y, BASE_Z], p1: [x, y, bot0], up: [0, 1, 0] }); pc.apoio_externo = true; pc.L0 = kF * (bot0 - BASE_Z);
        } else if (P.forma === "circular") {
          pc = add({ id: n, grupo: "Casa — pilares", descricao: "Pilar circular da casa, base engastada, topo rotulado na V", material: "MLC GL24h torneada (ou eucalipto roliço autoclavado selecionado, mesmo diâmetro)",
            especificacao: "Ø " + rd(P.d * 100, 0) + " cm, torneado, aparente", secao: { tipo: "circ", d: P.d }, p0: [x, y, BASE_Z], p1: [x, y, bot0], up: [0, 1, 0] }); pc.apoio_externo = true; pc.L0 = kF * (bot0 - BASE_Z);
        } else {
          var topoB = Math.min(top(y), bot0 + 0.62);
          [[-1, "a"], [1, "b"]].forEach(function (sl) {
            var xc = x + sl[0] * (V.b / 2 + P.b / 2);
            var q = add({ id: n + sl[1], grupo: "Casa — pilares", descricao: "Peça do pilar duplo (a viga V passa entre as duas)", material: MLC,
              especificacao: "MLC GL24h " + rd(P.b * 100, 0) + "×" + rd(P.h * 100, 0) + " cm, aplainado, aparente; espaçadores a cada 0,80 m",
              secao: { tipo: "ret", b: P.b, h: P.h }, p0: [xc, y, BASE_Z], p1: [xc, y, topoB], up: [0, 1, 0] }); q.apoio_externo = true; q.L0 = kF * (bot0 - BASE_Z);
          });
          var nesp = Math.max(1, Math.floor((bot0 - BASE_Z) / 0.80));
          add({ id: n + "-esp", grupo: "Casa — pilares", descricao: "Espaçador entre as peças do pilar duplo (abaixo da V)", material: MLC,
            especificacao: "MLC GL24h " + rd(V.b * 100, 0) + "×" + rd(P.h * 100, 0) + "×30 cm, colado e parafusado", secao: { tipo: "ret", b: 0.30, h: P.h },
            p0: [x - V.b / 2, y, BASE_Z + 0.9], p1: [x + V.b / 2, y, BASE_Z + 0.9], up: [0, 1, 0], qtd: nesp });
        }
      });
    });
    /* bloqueadores e escoras */
    var L = g.L, bl = p.bloqueador, es = p.escora.fonte;
    for (k = 0; k < yT.length - 1; k++) {
      [1, 2].forEach(function (cc) {
        var x = PX[0] + cc * L / 3, zc = (tz[k] + tz[k + 1]) / 2 - 0.02;
        add({ id: "BL" + z(k + 1, 2) + "-" + cc, grupo: "Cobertura — travamentos", descricao: "Bloqueador entre terças (trava a borda de baixo na sucção do vento)", material: MLC,
          especificacao: esp("bloqueador", "MLC 6×(h terça − 8 cm)").replace("(h terça − 8 cm)", rd((T.h - 0.08) * 100, 0) + " cm"), secao: { tipo: "ret", b: bl.b, h: T.h - 0.08 },
          p0: [x, yT[k] + T.b / 2, zc], p1: [x, yT[k + 1] - T.b / 2, zc], up: [0, 0, 1] });
      });
    }
    var vaoK = g.vaoK;
    PX.forEach(function (x, iv) {
      vaoK.forEach(function (kk) {
        [-1, 1].forEach(function (s) {
          var xe = x + s * p.cobertura.escOff;
          if (xe < TETO.x0 - 1e-6 || xe > TETO.x1 + 1e-6) return;           // A2: sem beiral do lado de fora, não há onde escorar
          var z0 = tz[kk] - T.h / 2, zb = VIDRO_TOPO + 0.05;
          add({ id: "ES" + (iv + 1) + "-" + z(kk + 1, 2) + "ab"[s > 0 ? 1 : 0], grupo: "Cobertura — travamentos", descricao: "Escora (mão-francesa) da terça à borda de baixo da V", material: MLC,
            especificacao: esp("escora", "MLC 8×14"), secao: { tipo: "ret", b: es.b, h: es.h }, p0: [x + s * p.cobertura.escOff, yT[kk], z0], p1: [x + s * V.b / 2, yT[kk], zb], up: [0, 1, 0] });
        });
      });
    });
    /* fita em X */
    var parFita = LG && LG.fita ? LG.fita.parafusosPorPonta : 8;
    for (k = 0; k < yT.length - 1; k++) {
      for (var cc = 0; cc < 3; cc++) {
        var xa = PX[0] + cc * L / 3, xb = PX[0] + (cc + 1) * L / 3, za = tz[k] + T.h / 2, zb2 = tz[k + 1] + T.h / 2;
        [[[xa, yT[k], za], [xb, yT[k + 1], zb2], "a"], [[xa, yT[k + 1], zb2], [xb, yT[k], za], "b"]].forEach(function (d) {
          add({ id: "FX" + z(k + 1, 2) + (cc + 1) + d[2], grupo: "Cobertura — contraventamento", descricao: "Fita metálica perfurada em X sobre as terças (sob o lambri)",
            material: GALV + " (ou inox)", especificacao: "fita perfurada 60×2,0 mm, " + parFita + " parafusos 5×50 por ponta + tensor", secao: { tipo: "ret", b: p.fita.b, h: p.fita.e }, p0: d[0], p1: d[1], up: [0, 0, 1], unidade: "m" });
        });
      }
    }
    /* vergas + travessa + pendural */
    PY.forEach(function (y, ip) {
      var nome = ip === 0 ? "frente" : "fundos", zc = VIDRO_TOPO + VG.b / 2;
      var vg = add({ id: "VG" + (ip + 1), grupo: "Casa — vergas do vidro", descricao: "Verga do topo do vidro (" + nome + "), deitada, entre os pilares — leva o vento da fachada aos pilares", material: MLC,
        especificacao: "MLC GL24h " + rd(VG.b * 100, 0) + "×" + rd(VG.h * 100, 0) + " cm deitada (altura " + rd(VG.h * 100, 0) + " cm na horizontal); " + esp("verga", "ligação na face lateral da V"),
        secao: { tipo: "ret", b: VG.b, h: VG.h }, p0: [PX[0], y, zc], p1: [PX[1], y, zc], up: [0, 1, 0] });
      vg.vitrine_topo = true;
      if (!g.travessa[ip].ok) return;                                  // N1: sem travessa/pendural (sem beiral em Y) — a verga vai só com as pontas
      var k1 = g.travessa[ip].k1; var k2 = g.travessa[ip].k2, xm = (PX[0] + PX[1]) / 2;
      var ztr = (tz[k1] + tz[k2]) / 2 - T.h / 2 + 0.10;
      add({ id: "TR" + (ip + 1), grupo: "Casa — vergas do vidro", descricao: "Travessa entre as terças vizinhas (apoio do pendural)", material: MLC, especificacao: "MLC GL24h " + cm(p.travessa.b) + "×" + cm(p.travessa.h) + " cm, estribo inox em cada terça",
        secao: { tipo: "ret", b: p.travessa.b, h: p.travessa.h }, p0: [xm, yT[k1] + T.b / 2, ztr], p1: [xm, yT[k2] - T.b / 2, ztr], up: [0, 0, 1] });
      add({ id: "PD" + (ip + 1), grupo: "Casa — vergas do vidro", descricao: "Pendural da travessa ao meio da verga", material: MLC, especificacao: "MLC GL24h " + cm(p.pendural.b) + "×" + cm(p.pendural.h) + " cm, 2 parafusos Ø12 inox por ponta",
        secao: { tipo: "ret", b: p.pendural.b, h: p.pendural.h }, p0: [xm, y, zc + VG.b / 2], p1: [xm, y, ztr - 0.10], up: [0, 1, 0] });
    });
    var perim = 2 * ((PAREDE.x1 - PAREDE.x0) + (PAREDE.y1 - PAREDE.y0));
    add({ id: "FXS", grupo: "Casa — faixa superior", descricao: "Fechamento da faixa superior (" + String(p.faixaSuperior).replace(".", ",") + " m entre o topo do vidro e o lambri), preto", material: MLC_TRAT,
      especificacao: "painel de madeira tratada (réguas 20×100 macho-fêmea) sobre subestrutura 4×6 a 0,60 m, pintura preta; leva vento — fixado na verga/V e nas terças", secao: null, qtd: rd(perim * p.faixaSuperior, 2), unidade: "m²" });
    var per = 2 * ((TETO.x1 - TETO.x0) + (TETO.y1 - TETO.y0));
    add({ id: "TE", grupo: "Cobertura — acabamentos", descricao: "Testeira no perímetro do beiral", material: MLC_TRAT, especificacao: "tábua 32×250 mm tratada, pintada (cor da arquitetura: preto)", secao: null, qtd: rd(per, 2), unidade: "m" });
    var A_teto = (TETO.x1 - TETO.x0) * (TETO.y1 - TETO.y0);
    add({ id: "LB", grupo: "Cobertura — forro", descricao: "Lambri macho-fêmea sobre as terças (forro aparente por dentro e no beiral)", material: "Pinus tratado (ou cumaru) 25 mm",
      especificacao: "lambri 25×100 mm macho-fêmea, pregado/parafusado nas terças, verniz marítimo", secao: null, qtd: rd(A_teto * 1.08, 2), unidade: "m²" });
    add({ id: "TL", grupo: "Cobertura — telha", descricao: "Telha termoacústica PIR uma água, peça inteira na água (" + rd(TETO.y1 - TETO.y0, 1) + " m)", material: "telha sanduíche PIR 30 mm, aço galvalume/pré-pintado 0,50 mm (externa) / 0,43 (interna)",
      especificacao: "inclinação " + rd(p.cobertura.incl * 100, 1) + "% (conferir mínimo do fabricante); fixação com parafuso autobrocante para madeira com vedação EPDM, inox no litoral", secao: null, qtd: rd(A_teto, 2), unidade: "m²" });
    add({ id: "RU", grupo: "Cobertura — telha", descricao: "Rufos laterais, rufo frontal (cumeeira) e calha posterior + 2 condutores", material: "aço galvalume pré-pintado 0,50 mm",
      especificacao: "rufos " + rd(2 * (TETO.y1 - TETO.y0) + (TETO.x1 - TETO.x0), 1) + " m; calha " + rd(TETO.x1 - TETO.x0, 1) + " m; condutores 2 × 4 m", secao: null, qtd: 1, unidade: "cj" });
    /* ferragens */
    var nap = yT.length * 2, nRef = LG && LG.reforcoV ? LG.reforcoV.parafusos : 6;
    add({ id: "WT-TV", grupo: "Ligações — parafusos", descricao: "Terça → viga V (cruzados)", material: "SFS WT-T-8,2 × 300 (ETA-12/0063), revestimento p/ classe de serviço 3", especificacao: (LG && LG.tercaV ? LG.tercaV.porApoio : 4) + " por apoio", secao: null, qtd: nap * (LG && LG.tercaV ? LG.tercaV.porApoio : 4) });
    add({ id: "WT-RV", grupo: "Ligações — parafusos", descricao: "Reforço à tração normal na V sobre o pilar", material: "SFS WT-T-8,2 × 300", especificacao: nRef + " por pilar", secao: null, qtd: 4 * nRef });
    if (LG && LG.verga && LG.verga.parafusosReforcoVerga) add({ id: "WT-RVG", grupo: "Ligações — parafusos", descricao: "Reforço contra o fendilhamento da V na ligação da verga (N2)", material: "SFS WT-T-8,2 × 300", especificacao: LG.verga.parafusosReforcoVerga + " por verga, ⊥ à fibra da V", secao: null, qtd: 2 * LG.verga.parafusosReforcoVerga });
    var nEsc = lista.pecas.filter(function (q) { return q.id.indexOf("ES") === 0; }).length, nBl = lista.pecas.filter(function (q) { return q.id.indexOf("BL") === 0; }).length;
    var pbq = LG && LG.bloqueador ? LG.bloqueador.parafusosPorPonta : 2, npe = LG && LG.escora ? LG.escora.parafusosPorPonta : 2;
    add({ id: "WT-190", grupo: "Ligações — parafusos", descricao: "Escoras, bloqueadores e pendurais", material: "SFS WT-T-8,2 × 190 (ETA-12/0063)", especificacao: "bloqueadores " + nBl + "×2×" + pbq, secao: null, qtd: nBl * 2 * pbq });
    add({ id: "ESC-LIG", grupo: "Ligações — escoras", descricao: "Ligação das escoras (chapas inox laterais + parafusos Ø16)", material: INOX,
      especificacao: nEsc + " escoras × 2 pontas: 2 chapas 4 mm + " + npe + " parafusos Ø16 passantes por ponta", secao: null, qtd: nEsc * 2, unidade: "cj" });
    add({ id: "LIG-VG", grupo: "Ligações — vergas", descricao: "Ligação da verga na face lateral da V", material: INOX, especificacao: esp("verga", "ligação da verga na V"), secao: null, qtd: 4, unidade: "cj" });
    if (LG) {
      var b = LG.base, pb = LG.placaBase;
      if (P.forma !== "duplo") {
        add({ id: "LIG-BASE", grupo: "Ligações — base engastada", descricao: b.descricao, material: INOX + " (pinos e chumbadores) / " + GALV + " (chapas)",
          especificacao: "por pilar: placa " + pb.dimensoes_mm[0] + "×" + pb.dimensoes_mm[1] + "×" + pb.espessura_mm + " mm + 2 chapas 16 mm em cruz soldadas (" + (pb.solda.tipo === "penetracao-total" ? "penetração total" : "filete " + pb.solda.mw_mm + " mm, fw ≥ " + pb.solda.fw + " MPa") + ") × " + b.comprimento.toFixed(2) + " m (largura " + b.chapa.largura_mm + " mm); " + 2 * b.n + " pinos Ø" + Math.round((b.d || 0.016) * 1000) + " inox; " + pb.chumbadores.total + " chumbadores M20 inox A4-70 (embutimento pela fundação)", secao: null, qtd: 4, unidade: "cj" });
        add({ id: "LIG-TOPO", grupo: "Ligações — topo do pilar", descricao: LG.topo.descricao, material: GALV + " / pinos inox",
          especificacao: "por pilar: chapa em T 16 mm com forquilha; " + LG.topo.n + " pinos Ø16 no pilar + " + LG.topoV.n + " pinos Ø16 na V", secao: null, qtd: 4, unidade: "cj" });
      } else {
        add({ id: "LIG-BASE", grupo: "Ligações — base engastada", descricao: b.descricao, material: GALV + " / parafusos e chumbadores inox",
          especificacao: "por pilar (2 peças): placa " + pb.dimensoes_mm[0] + "×" + pb.dimensoes_mm[1] + "×" + pb.espessura_mm + " mm + 4 chapas 12 mm (2 por peça), solda " + (pb.solda.tipo === "penetracao-total" ? "de penetração total" : "em filete " + pb.solda.mw_mm + " mm (fw ≥ " + pb.solda.fw + " MPa)") + " × " + b.comprimento.toFixed(2) + " m; " + 2 * b.n + " parafusos passantes Ø16 inox ajustados; " + pb.chumbadores.total + " chumbadores M20 inox A4-70", secao: null, qtd: 4, unidade: "cj" });
        add({ id: "LIG-TOPO", grupo: "Ligações — topo do pilar", descricao: LG.topo.descricao, material: "parafusos inox",
          especificacao: "por pilar: " + LG.topo.n + " parafusos passantes Ø16 × " + rd((2 * P.b + V.b) * 1000 + 40, 0) + " mm", secao: null, qtd: 4, unidade: "cj" });
      }
    }
    return { pecas: lista.pecas, geometria: g };
  }

  /* ====================================================================== T7 — DECK ELEVADO */
  function dentro(rects, x, y, menos) {
    var i;
    for (i = 0; i < menos.length; i++) if (menos[i][0] <= x && x <= menos[i][1] && menos[i][2] <= y && y <= menos[i][3]) return false;
    for (i = 0; i < rects.length; i++) if (rects[i][0] - 1e-6 <= x && x <= rects[i][1] + 1e-6 && rects[i][2] - 1e-6 <= y && y <= rects[i][3] + 1e-6) return true;
    return false;
  }
  /**
   * Parâmetros de um deck "máscara" (superior): { id:"DS", rects:[[x0,x1,y0,y1]…], recortes:[[…]], cota (face de cima das tábuas), tabua, terreno: function(x,y) → cota,
   *   barrote {b,h,passo}, viga {b,h,espacamento}, pilarete {forma:"ret"|"circ", b, d}, blocoSobre (0,20 m acima do terreno), hMinPilarete (0,15), hMaoFrancesa (0,40),
   *   bordaViga (0,06 — viga a 6 cm da borda), baseTipo ("oculta"|"garfo"), recortesVigas: paredes da casa [[…]] (padrão = recortes), passoVarredura (0,05) }
   * Deck "retangulo" (inferior): { id:"DI", modo:"retangulo", x0,x1,y0,y1, cota, tabua, vigas:{ys:[…], b, h}, barrote{b,h,passo,inicio}, pilares:[[x,y]…], pilar:{d, zBase, material} }
   */
  function t7DeckMascara(d, add, Dres) {
    var rects = d.rects, menos = d.recortes || [], tab = d.tabua, hb = d.barrote.h, hv = d.viga.h, passo = d.passoVarredura || 0.05;
    var x0 = Math.min.apply(null, rects.map(function (r) { return r[0]; })), x1 = Math.max.apply(null, rects.map(function (r) { return r[1]; }));
    var y0 = Math.min.apply(null, rects.map(function (r) { return r[2]; })), y1 = Math.max.apply(null, rects.map(function (r) { return r[3]; }));
    var zb = d.cota - tab - hb / 2, zv = d.cota - tab - hb - hv / 2, zfundo = d.cota - tab - hb - hv, n = 0, i, j, ys, xs, ok;
    var pre = d.id;
    arange(y0 + 0.25, y1, d.barrote.passo).forEach(function (y) {
      xs = arange(x0, x1 + passo, passo); ok = xs.map(function (x) { return dentro(rects, x, y, menos); }); i = 0;
      while (i < xs.length) {
        if (ok[i]) {
          j = i; while (j + 1 < xs.length && ok[j + 1]) j++;
          if (xs[j] - xs[i] > 0.3) { n++; add({ id: pre + "-B" + z(n, 3), grupo: Dres.nome + " — barrotes", descricao: "Barrote do deck (sob as tábuas)", material: MLC_TRAT,
            especificacao: "MLC GL24h tratada " + rd(d.barrote.b * 100, 0) + "×" + rd(hb * 100, 0) + " cm", secao: { tipo: "ret", b: d.barrote.b, h: hb }, p0: [xs[i], y, zb], p1: [xs[j], y, zb], up: [0, 0, 1] }); }
          i = j + 1;
        } else i++;
      }
    });
    var nv = 0, npil = 0, pil = [], apoiosDiretos = [], vigasPecas = [];
    var bordasSet = {}; rects.forEach(function (r) { bordasSet[rd(r[0] + 0.06, 2)] = 1; bordasSet[rd(r[1] - 0.06, 2)] = 1; });
    (d.linhasExtras || []).forEach(function (v) { bordasSet[rd(v, 2)] = 1; });
    var bordas = Object.keys(bordasSet).map(Number).sort(function (a, b) { return a - b; }), linhas = [];
    for (i = 0; i + 1 < bordas.length; i++) { var nn = Math.max(1, Math.ceil((bordas[i + 1] - bordas[i]) / d.viga.espacamento)); linhas = linhas.concat(linspace(bordas[i], bordas[i + 1], nn + 1)); }
    var uniq = {}; linhas.forEach(function (v) { uniq[rd(v, 3)] = 1; });
    linhas = Object.keys(uniq).map(Number).sort(function (a, b) { return a - b; });
    linhas = linhas.filter(function (v, k) { return k === 0 || v - linhas[k - 1] > 0.30; });
    linhas.forEach(function (x) {
      ys = arange(y0, y1 + passo, passo); ok = ys.map(function (y) { return dentro(rects, x, y, menos); }); i = 0;
      while (i < ys.length) {
        if (ok[i]) {
          j = i; while (j + 1 < ys.length && ok[j + 1]) j++;
          if (ys[j] - ys[i] > 0.5) {
            nv++; var vp = add({ id: pre + "-V" + z(nv, 2), grupo: Dres.nome + " — vigas", descricao: "Viga do deck", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(d.viga.b * 100, 0) + "×" + rd(hv * 100, 0) + " cm",
              secao: { tipo: "ret", b: d.viga.b, h: hv }, p0: [x, ys[i], zv], p1: [x, ys[j], zv], up: [0, 0, 1] });
            var npts = Math.max(2, Math.ceil((ys[j] - ys[i]) / 2.5) + 1), mine = [];
            linspace(ys[i] + 0.15, ys[j] - 0.15, npts).forEach(function (t) { var pt = [x, t]; pil.push(pt); mine.push(pt); });
            vp.apoios_pontos = mine; vigasPecas.push(vp);
          }
          i = j + 1;
        } else i++;
      }
    });
    pil.forEach(function (pt) {
      var zt = d.terreno(pt[0], pt[1]) + (d.blocoSobre == null ? 0.20 : d.blocoSobre), h = zfundo - zt;
      if (h < (d.hMinPilarete == null ? 0.15 : d.hMinPilarete)) { apoiosDiretos.push([rd(pt[0], 2), rd(pt[1], 2), rd(h, 2)]); pt.push("direto"); return; }
      npil++; var pr = d.pilarete, circ = pr.forma === "circ", sec = circ ? { tipo: "circ", d: pr.d } : { tipo: "ret", b: pr.b, h: pr.b };
      if (h > (d.hMaoFrancesa == null ? 0.40 : d.hMaoFrancesa)) add({ id: pre + "-MF" + z(npil, 2), grupo: Dres.nome + " — contraventamento", descricao: "Mãos-francesas do pilarete (2, nas duas direções)", material: MLC_TRAT,
        especificacao: "MLC GL24h tratada 6×12 cm, 0,9 m, 2 parafusos Ø12 inox por ponta", secao: null, qtd: 2 });
      var pp = add({ id: pre + "-P" + z(npil, 2), grupo: Dres.nome + " — pilaretes", descricao: "Pilarete do deck (sobre bloco da fundação)", material: MLC_TRAT,
        especificacao: (circ ? "MLC/eucalipto roliço tratado Ø" + rd(pr.d * 100, 0) + " cm" : "MLC GL24h tratada " + rd(pr.b * 100, 0) + "×" + rd(pr.b * 100, 0) + " cm") + (d.baseTipo === "garfo" ? " + base em garfo galvanizado aparente" : " + base metálica oculta"),
        secao: sec, p0: [pt[0], pt[1], zt], p1: [pt[0], pt[1], zfundo], up: [1, 0, 0] });
      pp.apoio_externo = true; pp.pilarete = true; pp.h_livre = h; pp.engastado = !!d.pilarEngastado; pp.L0 = (pp.engastado ? 0.7 : 1.0) * h;
    });
    /* viga sem pilarete nos pontos "diretos" apoia no bloco (apoio externo declarado) */
    vigasPecas.forEach(function (vp) { vp.apoios_externos = vp.apoios_pontos.filter(function (pt) { return pt[2] === "direto"; }).map(function (pt) { return [pt[0], pt[1]]; }); delete vp.apoios_pontos; });
    var area = rects.reduce(function (s, r) { return s + (r[1] - r[0]) * (r[3] - r[2]); }, 0) - (d.areaRecortes || 0);
    if (apoiosDiretos.length) {
      var enterrados = apoiosDiretos.filter(function (a) { return a[2] < -0.05; }).length;
      add({ id: pre + "-APOIO", grupo: Dres.nome + " — apoios", descricao: "Apoio direto da viga em bloco/mureta da fundação (outra empresa) — " + enterrados + " pontos com o terreno do modelo ACIMA da viga: confirmar terreno/aterro",
        material: INOX, especificacao: "chapa inox em U 6 mm + 2 chumbadores M12 + calço de neoprene", secao: null, qtd: apoiosDiretos.length, unidade: "un" });
    }
    add({ id: pre + "-TAB", grupo: Dres.nome + " — tábuas", descricao: "Tábuas do deck", material: CUMARU, especificacao: "deck 21×145 mm, juntas 5 mm, fixação oculta inox", secao: null, qtd: rd(area * 1.10, 2), unidade: "m²" });
    return { area: area, apoiosDiretos: apoiosDiretos };
  }

  function t7DeckRetangulo(d, add, Dres) {
    var zv = d.cota - d.tabua - d.barrote.h - d.vigas.h / 2, zb = d.cota - d.tabua - d.barrote.h / 2, pre = d.id, n = 0, zfundo = d.cota - d.tabua - d.barrote.h - d.vigas.h;
    d.vigas.ys.forEach(function (y, i) {
      var q = add({ id: pre + "-V" + (i + 1), grupo: Dres.nome + " — vigas", descricao: "Viga principal do deck (sobre os pilares)", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(d.vigas.b * 100, 0) + "×" + rd(d.vigas.h * 100, 0) + " cm",
        secao: { tipo: "ret", b: d.vigas.b, h: d.vigas.h }, p0: [d.x0, y, zv], p1: [d.x1, y, zv], up: [0, 0, 1] });
      q.apoios_externos = [];
    });
    arange(d.x0 + d.barrote.inicio, d.x1, d.barrote.passo).forEach(function (x) {
      n++; add({ id: pre + "-B" + z(n, 2), grupo: Dres.nome + " — barrotes", descricao: "Barrote do deck", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(d.barrote.b * 100, 0) + "×" + rd(d.barrote.h * 100, 0) + " cm",
        secao: { tipo: "ret", b: d.barrote.b, h: d.barrote.h }, p0: [x, d.y0, zb], p1: [x, d.y1, zb], up: [0, 0, 1] });
    });
    d.pilares.forEach(function (pt, i) {
      var q = add({ id: pre + "-P" + (i + 1), grupo: Dres.nome + " — pilares", descricao: d.pilar.descricao || "Pilar do deck (fundação de outra empresa)", material: d.pilar.material || ROLICO_MAR,
        especificacao: d.pilar.especificacao || ("Ø" + rd(d.pilar.d * 100, 0) + " cm"), secao: { tipo: "circ", d: d.pilar.d }, p0: [pt[0], pt[1], d.pilar.zBase], p1: [pt[0], pt[1], zfundo], up: [1, 0, 0] });
      q.apoio_externo = true; q.pilarete = true; q.h_livre = zfundo - d.pilar.zBase; q.engastado = !!d.pilar.engastado; q.L0 = (q.engastado ? 0.7 : 1.0) * q.h_livre;
    });
    var area = (d.x1 - d.x0) * (d.y1 - d.y0);
    add({ id: pre + "-TAB", grupo: Dres.nome + " — tábuas", descricao: "Tábuas do deck", material: CUMARU, especificacao: "deck 21×145 mm, fixação oculta inox", secao: null, qtd: rd(area * 1.10, 2), unidade: "m²" });
    return { area: area, apoiosDiretos: [] };
  }

  /**
   * T7: { decks: [deckMascara | deckRetangulo, …], escada: { longarinas: {xs, y0, y1, z0, z1, b, h}, degraus: n }, guardaCorpo: [{onde, L}] }
   * Cada deck carrega `nome` (grupo da fonte). Retorna { pecas, areas }.
   */
  function t7Fonte(p) {
    var lista = Lista(), add = comClasse(lista, p.classe), areas = {}, apoios = {};
    p.decks.forEach(function (d) {
      var res = d.modo === "retangulo" ? t7DeckRetangulo(d, add, { nome: d.nome }) : t7DeckMascara(d, add, { nome: d.nome });
      areas[d.id] = res.area; apoios[d.id] = res.apoiosDiretos;
    });
    if (p.escada) {
      var e = p.escada.longarinas;
      e.xs.forEach(function (x, i) {
        add({ id: "ESC-L" + (i + 1), grupo: "Escada", descricao: "Longarina da escada", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(e.b * 100, 0) + "×" + rd(e.h * 100, 0) + " cm",
          secao: { tipo: "ret", b: e.b, h: e.h }, p0: [x, e.y0, e.z0], p1: [x, e.y1, e.z1], up: [0, 0, 1] });
      });
      add({ id: "ESC-D", grupo: "Escada", descricao: "Degraus", material: CUMARU, especificacao: "degrau, 40 mm, antiderrapante (frisos)", secao: null, qtd: p.escada.degraus });
    }
    (p.guardaCorpo || []).forEach(function (g, i) {
      add({ id: "GC" + (i + 1), grupo: "Guarda-corpo", descricao: "Guarda-corpo de madeira — " + g.onde, material: CUMARU,
        especificacao: "h 1,10 m (NBR 14718, carga horizontal 1,0 kN/m a conferir): montantes 9×9 cm a cada 1,20 m em suporte de chapa inox 6 mm em U parafusado à viga de borda (2 Ø12 passantes) + bloqueio entre barrotes; corrimão 4×14 cm; réguas verticais 4×4 cm vão ≤ 11 cm",
        secao: null, qtd: rd(g.L, 2), unidade: "m" });
    });
    return { pecas: lista.pecas, areas: areas, apoiosDiretos: apoios };
  }

  /** soma de volumes por material (m³) de uma lista de peças */
  function volumePorMaterial(pecas) {
    var v = {}; pecas.forEach(function (q) { if (q.volume_m3) v[q.material] = (v[q.material] || 0) + q.volume_m3; });
    Object.keys(v).forEach(function (k) { v[k] = rd(v[k], 3); }); return v;
  }

  var MadTipologias = {
    MATERIAIS: MATERIAIS,
    T1: { padrao: T1_PADRAO, parametros: t1Parametros, geometria: t1Geometria, fonte: t1Fonte },
    T7: { fonte: t7Fonte },
    volumePorMaterial: volumePorMaterial, arange: arange, linspace: linspace, rd: rd
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MadTipologias;
  else global.MadTipologias = MadTipologias;
})(typeof window !== "undefined" ? window : this);

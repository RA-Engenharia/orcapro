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
  /** M4 (NBR 7190-1:2022, 6.6.4): índices dos vãos (baias [x0,x1]) que levam treliça vertical/X das águas — o primeiro, o último e, entre eles, o mais afastado que respeite "pelo menos um de cada três vãos" (índices a ≤ 3 de distância) e "travamento a cada 20 m ou menos" (folga entre o fim de um vão contraventado e o início do seguinte ≤ 20 m). */
  function baiasContraventadas(baias, limM) {
    var lim = limM == null ? 20 : limM, ix = [0], cur = 0, last = baias.length - 1, nx, j;
    while (cur < last) { nx = cur + 1; for (j = Math.min(last, cur + 3); j > cur; j--) { if (baias[j][0] - baias[cur][1] <= lim + 1e-9) { nx = j; break; } } ix.push(nx); cur = nx; }
    return ix;
  }
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
          var s = k.secao;
          if (s) { var A = s.tipo === "ret" ? s.b * s.h : s.tipo === "circ" ? Math.PI * s.d * s.d / 4 : (s.area_media || 0); k.volume_m3 = rd(A * L * k.qtd, 4); }      /* sem seção (mureta da fundação, item de interface): sem volume de madeira */
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
    var nv = 0, nm = 0, npil = 0, pil = [], apoiosDiretos = [], vigasPecas = [];
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
          /* R35 (r13, M8): a mureta vale SÓ no TRECHO perto do terreno (face inferior da viga a menos de 15 cm), não na viga inteira: o trecho contínuo é cortado no ponto de folga >= 15 cm. Trecho de viga entre duas muretas com <= 0,5 m vira mureta (não há viga curta). */
          var folgaTerr = d.muretaFolga == null ? 0.15 : d.muretaFolga, kk, nearP = [], near = [], ra, rb, dbg = 0, nSeg = j - i;
          for (kk = i; kk <= j; kk++) nearP.push(!!d.muretaSeAbaixoDoTerreno && zfundo - d.terreno(x, ys[kk]) < folgaTerr - 1e-9);
          for (kk = 0; kk < nSeg; kk++) near.push(nearP[kk] || nearP[kk + 1]);      /* trecho (entre dois pontos da grade) é mureta se QUALQUER ponta fica perto do terreno */
          for (dbg = 0; dbg < 4; dbg++) { var mudou = false; ra = 0; while (ra < nSeg) { rb = ra; while (rb + 1 < nSeg && near[rb + 1] === near[ra]) rb++; if (!near[ra] && ys[i + rb + 1] - ys[i + ra] <= 0.5 && near.some(function (v) { return v; })) { for (kk = ra; kk <= rb; kk++) near[kk] = true; mudou = true; } ra = rb + 1; } if (!mudou) break; }
          ra = 0;
          while (ra < nSeg) {
            rb = ra; while (rb + 1 < nSeg && near[rb + 1] === near[ra]) rb++;
            var perto = near[ra], ia = i + ra, ib = i + rb + 1;
            if (perto && ys[ib] - ys[ia] > 0.05) {
              /* R35 (Casa Mar): a face inferior da viga fica a menos de 15 cm do terreno (ou abaixo dele) neste trecho: o deck apoia DIRETO numa MURETA da fundação (outra empresa: interface, com a reação informada); sem viga enterrada.
                 Nosso: chapa de apoio inox e neoprene sob o barrote (item MC). O id DS-MU<n> entra como linha de apoio dos barrotes no maddeck. A ALTURA da mureta (do terreno ao topo) é informada à fundação. */
              nm++; var zTopo = zv + hv / 2, tMin = 1e9, tMax = -1e9; for (kk = ia; kk <= ib; kk++) { var tz = d.terreno(x, ys[kk]); tMin = Math.min(tMin, tz); tMax = Math.max(tMax, tz); }
              add({ id: pre + "-MU" + z(nm, 2), grupo: Dres.nome + " — muretas (fundação, outra empresa)", descricao: "Mureta de fundação sob o deck (interface com a fundação; reação informada)", material: "Concreto armado (fundação — outra empresa)",
                especificacao: "mureta de fundação, topo na cota " + rd(zTopo, 3) + " m, altura " + rd(Math.max(0, zTopo - tMax), 2) + " a " + rd(Math.max(0, zTopo - tMin), 2) + " m acima do terreno do modelo, largura mínima 20 cm (a confirmar pela fundação); o deck apoia direto, sem viga", secao: { tipo: "ret", b: 0.20, h: 0.20 }, p0: [x, ys[ia], zTopo - 0.10], p1: [x, ys[ib], zTopo - 0.10], up: [0, 0, 1], qtd: 1, mureta: true, interface: true, nivel: 1, apoio_externo: true, apoios_externos: [[x, ys[ia]], [x, ys[ib]]], alturaMax_m: rd(Math.max(0, zTopo - tMin), 2), alturaMin_m: rd(Math.max(0, zTopo - tMax), 2) });
              add({ id: pre + "-MC" + z(nm, 2), grupo: Dres.nome + " — muretas (fundação, outra empresa)", descricao: "Chapa de apoio inox 316 + neoprene sob os barrotes na mureta", material: "Inox 316 + neoprene",
                especificacao: "chapa inox 316 t = 5 mm × 100 mm e manta de neoprene 100 × 10 mm ao longo da mureta (" + rd(ys[ib] - ys[ia], 2) + " m)", secao: null, qtd: rd(ys[ib] - ys[ia], 2), unidade: "m" });
            } else if (ys[ib] - ys[ia] > 0.5) {
              nv++; var vp = add({ id: pre + "-V" + z(nv, 2), grupo: Dres.nome + " — vigas", descricao: "Viga do deck", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(d.viga.b * 100, 0) + "×" + rd(hv * 100, 0) + " cm",
                secao: { tipo: "ret", b: d.viga.b, h: hv }, p0: [x, ys[ia], zv], p1: [x, ys[ib], zv], up: [0, 0, 1] });
              var npts = Math.max(2, Math.ceil((ys[ib] - ys[ia]) / 2.5) + 1), mine = [];
              linspace(ys[ia] + 0.15, ys[ib] - 0.15, npts).forEach(function (t) { var pt = [x, t]; pil.push(pt); mine.push(pt); });
              vp.apoios_pontos = mine; vigasPecas.push(vp);
            }
            ra = rb + 1;
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
      /* R34 (Casa Mar): mãos-francesas no TOPO do pilar, pilar–viga, nas DUAS direções: travam o topo (id DI-MF<n> casa com DI-P<n> no maddeck) */
      if (d.pilar.maosFrancesasTopo) add({ id: pre + "-MF" + (i + 1), grupo: Dres.nome + " — contraventamento", descricao: "Mãos-francesas do topo do pilar (2, pilar–viga, nas duas direções)", material: MLC_TRAT,
        especificacao: "MLC GL24h tratada 6×12 cm, 0,9 m, " + (d.pilar.mfParafusos || 2) + " parafusos Ø12 inox por ponta", secao: null, qtd: 2 });
    });
    /* E4 r11 (R34): pilar ALTO (> 3 m) = CONTRAVENTAMENTO EM X entre pilares nas duas direções (um X por quadro pilar–pilar, da base à viga): diagonais de MLC (padrão) ou tirantes inox com esticador (só tração).
       d.pilar.contraventamento = { tipo: "madeira" | "tirante", zNo0, zNo1 (afastamento do nó da base e do topo, m) }; d.pilar.cv = { b, h } (madeira) | { d } (tirante). Ids DI-CV<n> (DI-CVT<n> no tirante). */
    var cvC = d.pilar.contraventamento, cvPecas = [];
    if (cvC && d.pilares.length > 1) {
      var zN0 = d.pilar.zBase + (cvC.zNo0 != null ? cvC.zNo0 : 0.40), zN1 = zfundo - (cvC.zNo1 != null ? cvC.zNo1 : 0.40), tirante = cvC.tipo === "tirante", cvS = d.pilar.cv || (tirante ? { d: 0.016 } : { b: 0.12, h: 0.20 }), quadros = [], nCV = 0;
      function agrupa(chave, ordem) { var g = {}; d.pilares.forEach(function (pt) { var k = rd(pt[chave], 2); (g[k] = g[k] || []).push(pt); }); Object.keys(g).sort(function (a, b) { return a - b; }).forEach(function (k) { var L = g[k].sort(function (a, b) { return a[ordem] - b[ordem]; }); for (var q = 0; q + 1 < L.length; q++) quadros.push({ dir: chave === 1 ? "X" : "Y", A: L[q], B: L[q + 1] }); }); }
      agrupa(1, 0); agrupa(0, 1);      /* quadros ao longo de X (mesmo y) e ao longo de Y (mesmo x) */
      quadros.forEach(function (qd) {
        [[qd.A, qd.B], [qd.B, qd.A]].forEach(function (par) {
          nCV++; var a = par[0], b = par[1], p0 = [a[0], a[1], zN0], p1 = [b[0], b[1], zN1], ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], Ln = norm(p0, p1), nh = [-ax[1], ax[0], 0], nl = Math.sqrt(nh[0] * nh[0] + nh[1] * nh[1]) || 1;
          nh = [nh[0] / nl, nh[1] / nl, 0]; var upv = [nh[1] * ax[2] - nh[2] * ax[1], nh[2] * ax[0] - nh[0] * ax[2], nh[0] * ax[1] - nh[1] * ax[0]]; if (upv[2] < 0) upv = [-upv[0], -upv[1], -upv[2]]; var un = Math.sqrt(upv[0] * upv[0] + upv[1] * upv[1] + upv[2] * upv[2]) || 1; upv = upv.map(function (v) { return rd(v / un, 4); });
          cvPecas.push(add(tirante
            ? { id: pre + "-CVT" + z(nCV, 2), grupo: Dres.nome + " — contraventamento", descricao: "Tirante do contraventamento em X (quadro " + qd.dir + ", só tração)", material: INOX, especificacao: "tirante inox A4-70 Ø" + rd(cvS.d * 1000, 0) + " mm com esticador (terminal de aperto) e olhal nas duas pontas, " + rd(Ln, 2) + " m", secao: null, p0: p0, p1: p1, qtd: rd(Ln, 2), unidade: "m", contraventamento: true, quadro: qd.dir, d_tirante: cvS.d }
            : { id: pre + "-CV" + z(nCV, 2), grupo: Dres.nome + " — contraventamento", descricao: "Diagonal do contraventamento em X (quadro " + qd.dir + ", pilar–pilar)", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(cvS.b * 100, 0) + "×" + rd(cvS.h * 100, 0) + " cm, " + rd(Ln, 2) + " m, chapa interna de aço inox t = 8 mm + pinos inox nas duas pontas", secao: { tipo: "ret", b: cvS.b, h: cvS.h }, p0: p0, p1: p1, up: upv, contraventamento: true, quadro: qd.dir }));
        });
      });
    }
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
      /* E4 (e): escada de CONCRETO na arquitetura (Casa Mar R05.1) — sem longarinas de madeira (longarinas: null); os degraus de cumaru seguem como item */
      if (e) e.xs.forEach(function (x, i) {
        var lg = add({ id: "ESC-L" + (i + 1), grupo: "Escada", descricao: "Longarina da escada", material: MLC_TRAT, especificacao: "MLC GL24h tratada " + rd(e.b * 100, 0) + "×" + rd(e.h * 100, 0) + " cm",
          secao: { tipo: "ret", b: e.b, h: e.h }, p0: [x, e.y0, e.z0], p1: [x, e.y1, e.z1], up: [0, 0, 1] });
        if (p.escada.apoioBase !== false) lg.apoio_externo = true;          /* E4 r6: a base da longarina apoia no piso/bloco (declarado); apoioBase:false = sem apoio → o auditor acusa */
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

  /* ====================================================================== T2 — casa/pavilhão de DUAS ÁGUAS (E4)
   * Coordenadas da fonte: X ao longo da cumeeira (a), Y através (b), Z vertical. Água "F" = frente (Y baixo), "B" = fundo (Y alto).
   * sistema "tesoura": tesouras tipo PRATT (banzos superior/inferior, montantes comprimidos e diagonais tracionadas sob gravidade) a cada sTes, terças sobre os nós do banzo superior, cumeeira = terça de topo.
   * sistema "cumeeira": viga de cumeeira MLC sobre pilares de oitão (e intermediários) + caibros principais da cumeeira ao frechal. O EMPUXO horizontal dos caibros é resolvido por UMA das duas saídas:
   *   assento DESLIZANTE (cumeeira portante: sem empuxo) ou assento FIXO + TIRANTE de aço (o motor liga o tirante sozinho se faltar e avisa). O auditor acusa se faltar as duas.
   * Os membros saem como LISTA (geometria única para o solver e para a fonte): { id, g (grupo), p0, p1, nos[] (pontos intermediários), agua, ws/wp (largura de influência), pinI/pinJ, tracao }. */
  var T2_PADRAO = {
    a: 12, b: 8, peDireito: 3.0, baseZ: 0, incl: 0.30, beiral: { frente: 0.8, fundo: 0.8, esq: 0.8, dir: 0.8 },
    sistema: "tesoura", vMaxPilar: 4.0, telha: { peso: 0.55, descricao: "telha cerâmica com ripas" },
    cobertura: { sTercaMax: 1.4, caibros: false, sCaibro: 0.5, caibro: { b: 0.05, h: 0.10 } },
    tesoura: { sTes: 4.0 }, cumeeira: { sCaibro: 1.0, pilaresIntermediarios: null, assento: "deslizante", tirante: false },
    contraventamento: { aguas: "extremos", tipo: "madeira", fita: { b: 0.06, e: 0.002, aproveitamento: 0.75 } }, vedacaoRigida: false,
    vergas: null, origem: { x: 0, y: 0 }, nome: "Casa de duas águas"
  };
  function t2Parametros(p) {
    var q = mescla(T2_PADRAO, p || {});
    if (q.sistema !== "tesoura" && q.sistema !== "cumeeira") throw new Error("madtipologias T2: sistema deve ser \"tesoura\" ou \"cumeeira\"");
    if (!(q.incl > 0.05)) throw new Error("madtipologias T2: inclinação mínima de 5 % (telha)");
    if (q.a < q.b - 1e-9) throw new Error("madtipologias T2: a cumeeira corre pela maior dimensão (a ≥ b, NBR 6123 Tabela 5): gire a planta 90°");
    if (q.cumeeira.assento !== "deslizante" && q.cumeeira.assento !== "fixo") throw new Error("madtipologias T2: assento do caibro \"deslizante\" ou \"fixo\"");
    q._t2 = true; return q;
  }
  function t2Geometria(pp) {
    var p = pp && pp._t2 ? pp : t2Parametros(pp), a = p.a, b = p.b, Hp = p.peDireito + p.baseZ, i = p.incl, sc = Math.sqrt(1 + i * i), B = p.beiral, cob = p.cobertura, M = [], k, j;
    var nCol = Math.max(1, Math.ceil(a / Math.min(p.vMaxPilar, p.sistema === "tesoura" ? p.tesoura.sTes : p.vMaxPilar) - 1e-9)), xs = linspace(0, a, nCol + 1);
    var nH = Math.max(1, Math.ceil((b / 2) * sc / cob.sTercaMax - 1e-9)), dz = (b / 2) / nH, lp = dz * sc, zH = function (jj) { return jj * dz; };
    var yT = function (z) { return z < 0 ? Hp + i * z : (z > b ? Hp + i * (b - z) : Hp + i * Math.min(z, b - z)); };
    var m = nH; while (m > 1 && (nH % m !== 0 || m * dz > p.vMaxPilar + 1e-9)) m--;
    var zsOit = []; for (j = 0; j <= 2 * nH; j += m) zsOit.push(j * dz);
    var eE = B.esq, eD = B.dir, n = 0, nc = 0, tipF = B.frente * sc, tipB = B.fundo * sc;
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); M.push(o); return o; }
    var P3 = function (x, z, y) { return [x, z, y]; }, cumeeira = p.sistema === "cumeeira";
    /* pilares do perímetro: faces Y=0 e Y=b (esquerda/direita da NBR 6123 na convenção do motor) e oitões X=0 e X=a (frente/fundo) */
    xs.forEach(function (x, kx) { [0, b].forEach(function (z) { add({ id: "P" + (++n), g: "P", p0: P3(x, z, p.baseZ), p1: P3(x, z, Hp), face: z === 0 ? "esquerda" : "direita", s: x, trib: (kx === 0 || kx === nCol) ? a / nCol / 2 : a / nCol, pinJ: true }); }); });
    [0, a].forEach(function (x) {
      zsOit.forEach(function (z, kz) {
        if (kz === 0 || kz === zsOit.length - 1) return;
        var central = cumeeira && Math.abs(z - b / 2) < 1e-6;
        add({ id: (central ? "PC" : "PO") + (++nc), g: central ? "PC" : "PO", p0: P3(x, z, p.baseZ), p1: P3(x, z, cumeeira ? yT(z) : Hp), face: x === 0 ? "frente" : "fundo", s: z, trib: (zsOit[kz + 1] - zsOit[kz - 1]) / 2, pinJ: true, nos: cumeeira ? [P3(x, z, Hp)] : [] });          /* nó na cota do beiral: ancora a fita da parede do oitão */
      });
    });
    var xfr;
    if (!cumeeira) {
      xs.forEach(function (x, kx) {
        add({ id: "BI" + kx, g: "BI", tes: kx, p0: P3(x, 0, Hp), p1: P3(x, b, Hp), nos: linspace(0, b, 2 * nH + 1).slice(1, 2 * nH).map(function (z) { return P3(x, z, Hp); }), pinI: true, pinJ: true });
        [["F", -1, B.frente, tipF], ["B", 1, B.fundo, tipB]].forEach(function (S) {
          var ag = S[0], sg = S[1], z0 = sg < 0 ? 0 : b, tip = S[2], nos = tip > 0 ? [P3(x, z0, Hp)] : [], zt = sg < 0 ? -tip : b + tip;
          for (j = 1; j < nH; j++) nos.push(P3(x, sg < 0 ? zH(j) : b - zH(j), yT(zH(j))));
          add({ id: "BS" + ag + kx, g: "BS", agua: ag, tes: kx, p0: P3(x, zt, yT(zt)), p1: P3(x, b / 2, yT(b / 2)), nos: nos, heelPin: true });
          for (j = 1; j <= nH; j++) {
            var zj = sg < 0 ? zH(j) : b - zH(j);
            if (j < nH || ag === "F") add({ id: "PD" + ag + j + "_" + kx, g: "PD", tes: kx, p0: P3(x, zj, Hp), p1: P3(x, zj, yT(zj)), pinI: true, pinJ: true });
            if (j >= 2) add({ id: "DG" + ag + j + "_" + kx, g: "DG", tes: kx, agua: ag, p0: P3(x, sg < 0 ? zH(j - 1) : b - zH(j - 1), Hp), p1: P3(x, zj, yT(zj)), pinI: true, pinJ: true });
          }
        });
      });
      /* terças nos nós do banzo superior (ponta do beiral, 1..nH-1 de cada lado) + cumeeira no topo; a linha do beiral/heel é o frechal */
      var linhas = [];
      if (B.frente > 0) linhas.push(["TF0", -B.frente, "F", tipF / 2, "T"]);
      for (j = 1; j < nH; j++) linhas.push(["TF" + j, zH(j), "F", lp, "T"]);
      linhas.push(["CM", b / 2, "R", lp, "CM"]);
      for (j = nH - 1; j >= 1; j--) linhas.push(["TB" + (nH - j), b - zH(j), "B", lp, "T"]);
      if (B.fundo > 0) linhas.push(["TB" + nH, b + B.fundo, "B", tipB / 2, "T"]);
      linhas.forEach(function (L) {
        var zz = L[1];
        add({ id: L[0], g: L[4], agua: L[2], p0: P3(-eE, zz, yT(zz)), p1: P3(a + eD, zz, yT(zz)), nos: xs.map(function (x) { return P3(x, zz, yT(zz)); }), ws: L[3], wp: L[3] / sc, linha: zz, artic: true });      /* artic: terça parafusada ao banzo (TS-6) = articulada na flexão horizontal (ry) em cada tesoura (E4 T2fix C3) */
      });
      /* E4 T2fix C2 (NBR 7190-1:2022, 6.6.4, Figura 5): linhas LONGITUDINAIS ligando continuamente, de uma extremidade a outra, os nós do BANZO INFERIOR das tesouras (os do superior são as terças). Peças de madeira articuladas
         nos nós (esforço axial: recebem a F1d = Nd/150 e a levam ao contraventamento vertical). O comprimento de flambagem do BI fora do plano passa a ser o espaçamento REAL entre estas linhas (dz), se a rigidez K_br,1 (6.6.2) for atendida. */
      for (j = 1; j < 2 * nH; j++) add({ id: "LB" + j, g: "LB", uni: true, p0: P3(0, zH(j), Hp), p1: P3(a, zH(j), Hp), nos: xs.slice(1, xs.length - 1).map(function (x) { return P3(x, zH(j), Hp); }), linha: zH(j) });
      xfr = xs;
    } else {
      var c = p.cumeeira, nInt = c.pilaresIntermediarios == null ? Math.max(0, Math.ceil(a / p.vMaxPilar - 1e-9) - 1) : c.pilaresIntermediarios, sC = c.sCaibro, xr = [-eE];
      /* caibros: pontos de quebra = ponta do beiral, oitões e pilares intermediários; cada intervalo é dividido em partes IGUAIS ≤ sCaibro (caibro sempre sobre o pilar, sem caibros colados) */
      var brk = [-eE, 0].concat(linspace(0, a, nInt + 2).slice(1, nInt + 1)).concat([a, a + eD]).filter(function (x, k, v) { return k === 0 || x > v[k - 1] + 1e-9; });
      for (k = 1; k < brk.length; k++) { var np = Math.max(1, Math.ceil((brk[k] - brk[k - 1]) / sC - 1e-9)); for (j = 1; j <= np; j++) xr.push(brk[k - 1] + (brk[k] - brk[k - 1]) * j / np); }
      linspace(0, a, nInt + 2).slice(1, nInt + 1).forEach(function (x) { add({ id: "PC" + (++nc), g: "PC", p0: P3(x, b / 2, p.baseZ), p1: P3(x, b / 2, yT(b / 2)), face: null, s: 0, trib: 0, pinJ: true }); });
      add({ id: "CM", g: "CM", agua: "R", p0: P3(-eE, b / 2, yT(b / 2)), p1: P3(a + eD, b / 2, yT(b / 2)), nos: xr.map(function (x) { return P3(x, b / 2, yT(b / 2)); }), ws: lp, wp: lp / sc });
      xr.forEach(function (x, kx) {
        var w = kx === 0 ? (xr[1] - xr[0]) / 2 : (kx === xr.length - 1 ? (xr[kx] - xr[kx - 1]) / 2 : (xr[kx + 1] - xr[kx - 1]) / 2);
        [["F", -1, B.frente], ["B", 1, B.fundo]].forEach(function (S) {
          var ag = S[0], sg = S[1], z0 = sg < 0 ? 0 : b, zt = sg < 0 ? -S[2] : b + S[2], nos = S[2] > 0 ? [P3(x, z0, Hp)] : [];
          for (j = 1; j < nH; j++) nos.push(P3(x, sg < 0 ? zH(j) : b - zH(j), yT(zH(j))));
          add({ id: "CB" + ag + kx, g: "CB", agua: ag, rf: kx, p0: P3(x, zt, yT(zt)), p1: P3(x, b / 2, yT(b / 2)), nos: nos, pinJ: true, wp: w, ws: w, assento: c.assento, oitao: Math.abs(x) < 1e-6 || Math.abs(x - a) < 1e-6 });
        });
        if (c.tirante || c.assento === "fixo") add({ id: "TI" + kx, g: "TI", rf: kx, p0: P3(x, 0, Hp), p1: P3(x, b, Hp), tracao: true });
      });
      xfr = xr;
      /* ripas da telha (3 × 5 cm) fixas aos caibros nos nós intermediários: travam o caibro para fora do plano (L0z) — entram no MODELO (RP), não na lista de madeira estrutural */
      [["F", -1], ["B", 1]].forEach(function (S) { for (j = 1; j < nH; j++) { var zr = S[1] < 0 ? zH(j) : p.b - zH(j); add({ id: "RP" + S[0] + j, g: "RP", p0: P3(-eE, zr, yT(zr)), p1: P3(a + eD, zr, yT(zr)), nos: xr.map(function (x) { return P3(x, zr, yT(zr)); }), pinI: true, pinJ: true }); } });
    }
    [0, b].forEach(function (z, iz) {
      var tr = (iz === 0 ? B.frente : B.fundo) * sc / 2 + lp / 2;
      add({ id: "FR" + (iz + 1), g: "FR", agua: iz === 0 ? "F" : "B", p0: P3(-eE, z, Hp), p1: P3(a + eD, z, Hp), nos: xfr.map(function (x) { return P3(x, z, Hp); }), ws: tr, wp: tr / sc, linha: z, beiral: true });
    });
    /* contraventamento: fita em X no plano das águas (vãos extremos ou todos) e, sem vedação rígida, nos planos das paredes (vãos extremos) */
    var fx = 0, ct = p.contraventamento, mad = ct.tipo !== "fita", baias = [], xb = cumeeira ? xr.filter(function (x) { return x >= -1e-9 && x <= a + 1e-9; }) : xs;
    var passo = cumeeira ? Math.max(1, Math.round(Math.min(p.vMaxPilar, a) / sC)) : 1;
    for (k = 0; k < xb.length - 1; k += passo) baias.push([xb[k], xb[Math.min(k + passo, xb.length - 1)]]);
    /* M4 (r14, NBR 7190-1:2022, 6.6.4, Figura 5): treliça vertical (e X das águas) em pelo menos UM de cada TRÊS vãos e travamento a cada 20 m ou menos — antes ia só nos vãos extremos (com 5 vãos, 20 m, os vãos 2 a 4 ficavam sem). Sai o primeiro e o último vão e, entre eles, o mais afastado que ainda respeite os dois limites. Cumeeira portante mantém os vãos extremos (sem treliça vertical). */
    var selB = ct.aguas === "todos" || baias.length < 2 ? baias : (cumeeira ? [baias[0], baias[baias.length - 1]] : baiasContraventadas(baias).map(function (ix) { return baias[ix]; }));
    /* E4 T2fix C3 (6.6.2/6.6.4): a fita agora é PAINEL A PAINEL (nó em cada terça/caibro: banzo → terça → cumeeira), nas águas dos vãos extremos; antes ia do beiral à cumeeira sem nó nas terças. */
    selB.forEach(function (bb) {
      [["F", 0], ["B", b]].forEach(function (S) {
        var zl = [S[1]], jj; for (jj = 1; jj <= nH; jj++) zl.push(S[1] === 0 ? zH(jj) : b - zH(jj));
        zl.slice(0, zl.length - 1).forEach(function (za, q) { var zb = zl[q + 1]; [[bb[0], bb[1]], [bb[1], bb[0]]].forEach(function (d) { add(mad ? { id: "DX" + (++fx), g: "DX", agua: S[0], p0: P3(d[0], za, yT(za)), p1: P3(d[1], zb, yT(zb)), tracao: true, mad: true } : { id: "FX" + (++fx), g: "FX", agua: S[0], p0: P3(d[0], za, yT(za)), p1: P3(d[1], zb, yT(zb)), tracao: true }); }); });
      });
    });
    /* E4 T2fix C2 (6.6.4, Figura 5): treliças VERTICAIS entre tesouras: duas diagonais em X (fita só de tração) no plano de cada linha do banzo inferior, nos vãos extremos (pelo menos um de cada três vãos) */
    var fv = 0;
    if (!cumeeira) selB.forEach(function (bb) { for (k = 1; k < 2 * nH; k++) { var zk = zH(k); [[bb[0], bb[1]], [bb[1], bb[0]]].forEach(function (d) { add(mad ? { id: "DV" + (++fv), g: "DV", p0: P3(d[0], zk, Hp), p1: P3(d[1], zk, yT(zk)), tracao: true, mad: true } : { id: "FV" + (++fv), g: "FV", p0: P3(d[0], zk, Hp), p1: P3(d[1], zk, yT(zk)), tracao: true }); }); } });
    if (!p.vedacaoRigida) {
      /* paredes: MÍNIMO de 2 painéis contraventados por fachada (primeiro e último vão; fachada de um vão só = o vão único, e o auditor avisa). Padrão: DIAGONAIS DE MADEIRA em X (DP, só tração, E4 r10);
         tipo "fita": fita metálica FP (modelo antigo). Com vedacaoRigida (alvenaria/OSB estrutural informada pelo usuário) nada entra: a vedação tem de ser projetada para a força informada. */
      var fxp = 0, bb2 = [[0, xs[1]], [xs[xs.length - 2], a]], zO = zsOit.length > 2 ? [[zsOit[0], zsOit[1]], [zsOit[zsOit.length - 2], zsOit[zsOit.length - 1]]] : [[zsOit[0], zsOit[1]]];
      var diagP = function (e, plano, c) { fxp++; var A = plano === "x" ? P3(e[0], c, p.baseZ) : P3(c, e[0], p.baseZ), B = plano === "x" ? P3(e[1], c, Hp) : P3(c, e[1], Hp); return mad ? { id: "DP" + fxp, g: "DP", p0: A, p1: B, tracao: true, mad: true } : { id: "FP" + fxp, g: "FP", p0: A, p1: B, tracao: true }; };
      [0, b].forEach(function (z) { bb2.forEach(function (d) { [[d[0], d[1]], [d[1], d[0]]].forEach(function (e) { add(diagP(e, "x", z)); }); }); });
      [0, a].forEach(function (x) { zO.forEach(function (d) { [[d[0], d[1]], [d[1], d[0]]].forEach(function (e) { add(diagP(e, "z", x)); }); }); });
    }
    return { p: p, membros: M, info: { xs: xs, nCol: nCol, nH: nH, dz: dz, lp: lp, sc: sc, Hp: Hp, zsOit: zsOit, yT: yT, eE: eE, eD: eD, tipF: tipF, tipB: tipB, a: a, b: b, incl: i, xfr: xfr } };
  }

  /** FONTE de T2: agrupa os membros iguais em marcas com quantidade. sec = { P, PO, PC, FR, BS, BI, PD, DG, T, CM, CB, TI:{d} }; ext = { classe } */
  function t2Fonte(p, sec, ext) {
    ext = ext || {}; var G = t2Geometria(p), lista = Lista(), add = comClasse(lista, ext.classe), M = G.membros, I = G.info, marcas = {}, ordem = [], cont = {};
    var NOMES = { P: ["Casa — pilares", "Pilar do perímetro"], PO: ["Casa — pilares de oitão", "Pilar de oitão"], PC: ["Casa — pilares de oitão", "Pilar de cumeeira (oitão/central)"], FR: ["Casa — frechal", "Frechal (viga de respaldo)"],
      LB: ["Contraventamento — linhas do banzo inferior", "Linha longitudinal do banzo inferior (6.6.4)"], DX: ["Contraventamento — águas (madeira)", "Diagonal de madeira em X no plano das águas (6.6.2 e 6.6.4)"], DP: ["Contraventamento — paredes (madeira)", "Diagonal de madeira em X nos painéis das paredes (pilar → frechal)"], DV: ["Contraventamento — vertical (madeira)", "Diagonal de madeira em X nos planos verticais entre tesouras (6.6.4, Figura 5)"], BS: ["Tesouras", "Banzo superior da tesoura"], BI: ["Tesouras", "Banzo inferior (tirante) da tesoura"], PD: ["Tesouras", "Montante da tesoura (comprimido sob gravidade)"], DG: ["Tesouras", "Diagonal da tesoura"],
      T: ["Cobertura — terças", "Terça"], CM: ["Cobertura — cumeeira", "Viga de cumeeira"], CB: ["Cobertura — caibros principais", "Caibro principal (cumeeira ao frechal)"] };
    M.forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g === "DV" ? "DX" : m.g] || {}, L = norm(m.p0, m.p1), linear = m.g === "T" || m.g === "CM" || m.g === "FR" || m.g === "LB", key = [m.g, rd(L, 3), linear ? m.id : "", JSON.stringify(s)].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var r = marcas[key], m = r.m, nm = NOMES[m.g], s = r.sec, linear = m.g === "T" || m.g === "CM" || m.g === "FR" || m.g === "LB", forma = s.forma === "circular" ? { tipo: "circ", d: s.d } : { tipo: "ret", b: s.b, h: s.h };
      cont[m.g] = (cont[m.g] || 0) + 1;
      var dy = m.p1[1] - m.p0[1], dz = m.p1[2] - m.p0[2], Lyz = Math.sqrt(dy * dy + dz * dz), L = norm(m.p0, m.p1), up = m.g === "DX" ? [0, (m.agua === "F" ? -1 : 1) * G.p.incl / Math.sqrt(1 + G.p.incl * G.p.incl), 1 / Math.sqrt(1 + G.p.incl * G.p.incl)] : (m.g === "DV" ? [0, 1, 0] : Lyz < 1e-6 ? [0, 0, 1] : (Lyz < 0.3 * L ? [0, 0, 1] : (Math.abs(dz) > 0.9 * L && /^(P|PO|PC)$/.test(m.g) ? [1, 0, 0] : [0, -dz / Lyz * (dy >= 0 ? 1 : -1), Math.abs(dy) / Lyz])));
      add({ id: linear ? m.id : m.g + cont[m.g], marca: m.g, grupo: nm[0], descricao: nm[1], material: MLC, especificacao: "MLC GL24h " + (s.forma === "circular" ? "Ø" + cm(s.d) : cm(s.b) + "×" + cm(s.h)) + " cm", secao: forma, p0: m.p0, p1: m.p1, up: up, qtd: r.qtd });
    });
    [["FX", "Fita metálica perfurada em X no plano das águas + tensor", "Contraventamento — águas"], ["FV", "Fita metálica perfurada em X nos planos verticais entre tesouras (NBR 7190-1, 6.6.4) + tensor", "Contraventamento — vertical"], ["FP", "Fita metálica perfurada em X nos planos das paredes + tensor", "Contraventamento — paredes"]].forEach(function (cf) {
      var fx = M.filter(function (m) { return m.g === cf[0]; }), mF = 0; fx.forEach(function (m) { mF += norm(m.p0, m.p1); });
      if (fx.length) add({ id: cf[0], grupo: cf[2], descricao: cf[1], material: GALV, especificacao: "fita/chapa " + cm((sec.FT && sec.FT.b) || 0.06) + "0 × " + String(((sec.FT && sec.FT.e) || 0.002) * 1000).replace(".", ",") + " mm galvanizada a fogo (dimensionada pela rigidez K_br,1, NBR 7190-1, 6.6.2)", secao: null, qtd: rd(mF, 2), unidade: "m", fita: { b: (sec.FT && sec.FT.b) || 0.06, e: (sec.FT && sec.FT.e) || 0.002 } });
    });
    var ti = M.filter(function (m) { return m.g === "TI"; });
    if (ti.length) add({ id: "TI", grupo: "Cobertura — tirantes", descricao: "Tirante de aço (barra roscada) no nível do frechal — resolve o empuxo dos caibros", material: INOX, especificacao: "barra roscada Ø" + ((sec.TI && sec.TI.d) || 16) + " mm, comprimento " + rd(p.b, 2) + " m, com luvas e porcas", secao: null, qtd: ti.length });
    var cb = M.filter(function (m) { return m.g === "CB"; });
    if (cb.length && G.p.cumeeira.assento === "deslizante") add({ id: "AD", grupo: "Ligações — assento deslizante", descricao: "Assento deslizante do caibro no frechal (chapa de apoio com folga horizontal + cinta de tração para vento)", material: GALV, especificacao: "chapa de apoio + cinta, 1 por apoio", secao: null, qtd: cb.length });
    var nTes = M.filter(function (m) { return m.g === "BI"; }).length;
    if (nTes) add({ id: "LIG-TES", grupo: "Ligações — tesouras", descricao: "Nós da tesoura: chapa interna de aço + pinos Ø16 (grupos dimensionados pela NBR 7190-1)", material: INOX, especificacao: "chapa t = 8 mm + pinos Ø16 inox, por nó", secao: null, qtd: nTes * (2 * I.nH * 2 + 2) });
    var nDX = M.filter(function (m) { return m.g === "DX" || m.g === "DV" || m.g === "DP"; }).length;
    if (nDX) add({ id: "LIG-DX", grupo: "Ligações — contraventamento", descricao: "Pontas das diagonais de madeira do contraventamento: chapa interna de aço + pinos inox (NBR 7190-1:2022, cap. 7)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por ponta de diagonal", secao: null, qtd: nDX * 2 });
    var pcs = M.filter(function (m) { return m.g === "PC"; }).length;
    if (pcs) add({ id: "LIG-CUM", grupo: "Ligações — cumeeira", descricao: "Ligação cumeeira–pilar: chapa em T + pinos (cumeeira apoiada no topo do pilar de oitão/central)", material: INOX, especificacao: "chapa em T t = 12 mm + pinos Ø16 inox", secao: null, qtd: pcs });
    return { pecas: lista.pecas, membros: M, info: I };
  }

  /** soma de volumes por material (m³) de uma lista de peças */
  function volumePorMaterial(pecas) {
    var v = {}; pecas.forEach(function (q) { if (q.volume_m3) v[q.material] = (v[q.material] || 0) + q.volume_m3; });
    Object.keys(v).forEach(function (k) { v[k] = rd(v[k], 3); }); return v;
  }

  var MadTipologias = {
    MATERIAIS: MATERIAIS,
    T1: { padrao: T1_PADRAO, parametros: t1Parametros, geometria: t1Geometria, fonte: t1Fonte },
    T2: { padrao: T2_PADRAO, parametros: t2Parametros, geometria: t2Geometria, fonte: t2Fonte, baiasContraventadas: baiasContraventadas },
    T7: { fonte: t7Fonte },
    volumePorMaterial: volumePorMaterial, arange: arange, linspace: linspace, rd: rd
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MadTipologias;
  else global.MadTipologias = MadTipologias;
})(typeof window !== "undefined" ? window : this);

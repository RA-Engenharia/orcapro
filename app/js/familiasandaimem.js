/* =====================================================================
 * familiasandaimem.js — AS 13 FAMÍLIAS `ra-andaime-m-*` DO ANDAIME MULTIDIRECIONAL (M2, 27/10/2026)
 *
 * Pedido do Rogério: "todas as famílias paramétricas com bastante qualidade, simulando igualzinho a peça e o material". Cada peça do
 * multidirecional (poste com roseta e espigão, travessa com cabeça e cunha, diagonal articulada, piso perfurado com garras e trava,
 * alçapão com escada, rodapé, peça base, base regulável, gancho de ancoragem com olhal e chumbador, pino trava, nó do estribo, pinça e chaveta,
 * travessa em U) é uma família do js/familia.js com `geometria: "andaime"` — o mesmo contrato do js/familiasandaime.js (o tubo-roll):
 * categoria "andaime" (o js/andaime3d.js agrupa em InstancedMesh por tipo de peça), níveis Alto / Médio / Baixo pelo `Nivel_detalhe`,
 * símbolo de planta, massa do catálogo, quantitativo sem código de orçamento, e SEM CUBO DE FALLBACK (falhou → erro dito).
 *
 * DE ONDE VÊM AS MEDIDAS (⚠ regra da casa "famílias igual ao real"): TODA cota linear sai de js/familiasandaimemdados.js, GERADO de
 * docs/andaime-multi/familias-m-cotas.json (cada cota com fonte, página e grau; a estimada fica com grau "e"). Aqui não há milímetro escrito à
 * mão que não seja DECISÃO DE FORMA (nº de segmentos, ângulo, proporção) dita no comentário ao lado. Só medidas — nunca malha de fabricante.
 *
 * ORIGEM E EIXOS (metro; Y para cima; a instância só gira em Y):
 *   poste: origem na PONTA DE BAIXO, no eixo; as rosetas ficam em r0 + 0,50·k (r0 = 400 mm do JSON); o furo pequeno de 0° aponta para +X.
 *   travessa: origem no EIXO DO POSTE A, no plano da roseta; o comprimento (nominal) vai até o eixo do poste B em +X.
 *   diagonal: origem no eixo do poste de baixo, no plano da roseta; +X até o poste de cima; `Lado` ±1 = para que lado de Z ela corre.
 *   piso / alçapão: origem no eixo do poste A, no meio da largura (Z), Y = 0 no TOPO do tampo (= o yPiso do motor); +X até o poste B.
 *   rodapé: origem no eixo do poste A, no pé da chapa (Y = 0 = yPiso); o perfil sai para +Z.
 *   peça base e base regulável: origem na face de baixo. Gancho: origem no eixo do poste, no plano da roseta; o tubo sai para +X.
 *   pino trava: origem no furo do espigão; a perna reta atravessa em X. Nó do estribo / pinça-chaveta: ver o gerador.
 *
 * ⚠ D1 (docs/andaime-multi/DUVIDAS-M2.md): O MOTOR (AndaimeMulti, offPiso = 0) põe o TOPO DO PISO no nível da roseta. Como o piso assenta
 *   por cima do tubo da travessa, o EIXO DO TUBO da travessa fica (raio do tubo + espessura da chapa do piso) ABAIXO do plano da roseta:
 *   a cabeça da travessa tem a fenda do disco perto do topo dela. A cota da cabeça (72 mm, tubo na meia altura) não muda; o que muda é
 *   onde, dentro dela, está a fenda — o JSON não diz, e é o que fecha o encaixe com o motor sem peça cruzando peça.
 *
 * ⚠ MATERIAL POR PEÇA e COR com fonte (hex lido/estimado de FOTO de catálogo, não medido): galvanizado = APAR.aco_galvanizado #AAB0B4 (igual ao
 *   tubo-roll); piso e rodapé: o JSON registra que a foto de M02 p.6 é cinza escuro (#666/#575757) apesar do texto "galvanizado a fogo" —
 *   usamos o galvanizado (decisão da ESPEC M2) e a cor da foto fica registrada aqui; trava do piso: vermelho da foto; base e pino: zincado
 *   bicromatizado (dourado) como no tubo-roll. A tabela PBR abaixo é a MESMA do FAM_PBR do js/bim.js (tools/test-familiasandaimem.js confere).
 *   A FURAÇÃO do piso não é geometria (milhares de furos): é textura de recorte (alphaMap) gerada com o passo e o diâmetro do JSON.
 * ES5, IIFE, sem DOM no motor das famílias (a textura é função à parte, só no navegador). Teste: node tools/test-familiasandaimem.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var Dados = dep("FamiliasAndaimeMDados", "familiasandaimemdados.js");
  var FAn = dep("FamiliasAndaime", "familiasandaime.js");
  var PR = FAn && FAn._prim ? FAn._prim : {};
  var Kit = PR.Kit, caixa = PR.caixa, cilindro = PR.cilindro, tuboOco = PR.tuboOco, setor = PR.setor, prismaConvexo = PR.prismaConvexo, porca = PR.porca, varrer = PR.varrer,
      densificar = PR.densificar, torno = PR.torno, linhaFina = PR.linhaFina, octaedro = PR.octaedro, nivelDe = PR.nivelDe, segs = PR.segs, circ = PR.circ, ret = PR.ret, tri = PR.tri;
  var RAD = Math.PI / 180, TAU = Math.PI * 2, MM = 0.001, LIN_R = PR.LIN_R || 0.0025;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ MATERIAIS (nomes que o 3D conhece: FAM_PBR do js/bim.js)
     FONTE DA COR (cada uma dita; hex lido da foto de produto, não medido com colorímetro):
       aço galvanizado           #AAB0B4 = APAR.aco_galvanizado do js/biminstgeo.js (cinza prata fosco; M02 p.20 fig.13 #97938E, miniatura p.6 #BBBBBB)
       aço galvanizado perfurado  = o mesmo galvanizado com o recorte da furação do piso (alphaMap; passo do JSON)
       aço zincado bicromatizado #C9A227 = dourado da passivação amarela (M01 p.3 "sapatas bicromatizadas"; convenção do tubo-roll)
       equipamento vermelho      #C0393B = trinco vermelho do piso (S21 A.S.60: "Sicherungsriegel"; já existia no FAM_PBR)
       alumínio do alçapão       #AEAEAE = tampa e escada do alçapão (JSON: hexFoto #AEAEAE de M02 p.6, "cinza claro")
       borracha                  #1A1A1A = capa de plástico preta nas pontas do rodapé (JSON: "cor preta ou do sistema") */
  var PBR = {
    "aço galvanizado": { cor: 0xaab0b4, rug: 0.45, met: 0.85 },
    "aço galvanizado perfurado": { cor: 0xaab0b4, rug: 0.45, met: 0.85 },
    "aço zincado bicromatizado": { cor: 0xc9a227, rug: 0.38, met: 0.85, cc: 0.3, ccr: 0.2 },
    "equipamento vermelho": { cor: 0xc0393b, rug: 0.4, met: 0 },
    "alumínio do alçapão": { cor: 0xaeaeae, rug: 0.4, met: 0.85 },
    "borracha": { cor: 0x1a1a1a, rug: 0.9, met: 0 }
  };
  var MAT = { GALV: "aço galvanizado", PERF: "aço galvanizado perfurado", BICROM: "aço zincado bicromatizado", VERM: "equipamento vermelho", ALU: "alumínio do alçapão", BORRACHA: "borracha" };

  /* ------------------------------------------------ IDS */
  var G = "ra-andaime-m-";
  var FPO = G + "poste", FTR = G + "travessa", FTU = G + "travessa-u", FDI = G + "diagonal", FPI = G + "piso", FAL = G + "alcapao", FRO = G + "rodape", FPB = G + "peca-base",
      FBR = G + "base-regulavel", FGA = G + "gancho-ancoragem", FPT = G + "pino-trava", FEN = G + "estribo-no", FPC = G + "pinca-chaveta";

  /* ------------------------------------------------ COTAS (todas dos dados gerados do JSON) */
  function cota(fam, nome) {
    var p = Dados && Dados.pecas && Dados.pecas[fam], c = p && p.cotas && p.cotas[nome];
    if (!c) throw new Error("a cota \"" + nome + "\" de " + fam + " não existe em js/familiasandaimemdados.js — rode node tools/gerar-familiasandaimem-dados.js");
    return c.v;
  }
  function mm(fam, nome) { return cota(fam, nome) * MM; }
  /* "800; 1140; 1640" / "3,5; 4,5" / "1350 (1000x1000)" → [800, 1140, …] */
  function lista(fam, nome) {
    return String(cota(fam, nome)).split(";").map(function (x) { return parseFloat(String(x).replace(",", ".")); }).filter(function (x) { return isFinite(x); });
  }
  function rTubo() { return mm(FPO, "diametroExterno") / 2; }
  /* D1: o eixo do tubo da travessa fica (raio do tubo + espessura da chapa do piso) ABAIXO do plano da roseta (ver o cabeçalho) */
  function yEixo() { return -(rTubo() + mm(FPI, "espessuraDaChapa")); }
  /* raio do centro dos furos da roseta = meio da faixa [raio interno, raio externo] do furo grande (o furo pequeno tem a mesma faixa: 18 = 48 − 30) */
  function rFuros() { return (mm(FPO, "roseta_furoGrandeRaioInterno") + mm(FPO, "roseta_furoGrandeRaioExterno")) / 2; }

  /* ------------------------------------------------ PEQUENOS AUXILIARES DE FORMA */
  function octagono(x0, x1, z0, z1, c) {   /* contorno (x, z) com os 4 cantos chanfrados de c */
    return [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
  }
  function recortaX(poly, xc, manterMenor) {   /* recorta um polígono CONVEXO por x = xc (fica o lado menor ou o maior) */
    var out = [], n = poly.length, i;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], da = manterMenor ? xc - a[0] : a[0] - xc, db = manterMenor ? xc - b[0] : b[0] - xc;
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function tuboX(k, mat, ro, ri, x0, x1, y, seg) {   /* tubo oco com o eixo em +X, de x0 a x1, no eixo (y, z = 0) */
    if (x1 - x0 <= 1e-6) return;
    k.com([x0, y, 0], [["z", -90]], function () { k.add(mat, tuboOco(ro, ri, x1 - x0, seg, 0)); });
  }
  /* fita de chapa: poligonal (z, y) com espessura e, extrudada em X de x0 a x1 — cada trecho é uma caixa FECHADA (o sentido das faces vem do volume) */
  function fita(k, mat, pts, e, x0, x1) {
    var i;
    for (i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dz * dz + dy * dy);
      if (l < 1e-7) continue;
      var ang = Math.atan2(-dy, dz) / RAD;   /* gira em X para o eixo Z da caixa apontar na direção do trecho */
      k.com([0, a[1], a[0]], [["x", ang]], function () { k.add(mat, caixa(x0, -e / 2, -e / 2, x1 - x0, e, l + e)); });   /* +e: os trechos se sobrepõem na quina, sem fresta */
    }
  }

  /* furo no tubo: lado de fora e de dentro, vazado em 0° e 180° (eixo X) por um círculo de raio fr à altura fy. Nada de operação booleana:
     as células da grade cujo centro cai dentro do círculo não são geradas. seg = 24 (15°) e a faixa do furo em passos de fr/1,2 (decisão de forma). */
  function tuboFuro(ro, ri, y0, h, seg, fy, fr) {
    var v = [], f = [], s = fr / 1.2, lo = Math.max(y0, fy - fr - s), hi = Math.min(y0 + h, fy + fr + s), rows = [y0], y, i, j;
    for (y = lo; y < hi - 1e-9; y += s) if (y > y0 + 1e-9) rows.push(y);
    if (hi < y0 + h - 1e-9) rows.push(hi);
    rows.push(y0 + h);
    rows = rows.filter(function (q, ix) { return ix === 0 || q > rows[ix - 1] + 1e-9; });
    [[ro, 1], [ri, -1]].forEach(function (rs) {
      var r = rs[0], sg = rs[1], ix = {};
      function vi(ii, jj) {   /* vértice da grade compartilhado (a luz suaviza o tubo; só o furo tem aresta) */
        var kk = ii * seg + (jj % seg);
        if (ix[kk] == null) { ix[kk] = v.length / 3; var a = TAU * (jj % seg) / seg; v.push(Math.cos(a) * r, rows[ii], Math.sin(a) * r); }
        return ix[kk];
      }
      for (i = 0; i + 1 < rows.length; i++) {
        var ya = rows[i], yb = rows[i + 1], yc = (ya + yb) / 2;
        for (j = 0; j < seg; j++) {
          var a0 = TAU * j / seg, a1 = TAU * (j + 1) / seg, am = (a0 + a1) / 2, da = Math.min(Math.abs(am), Math.abs(am - Math.PI), Math.abs(am - TAU));
          if (Math.sqrt(r * da * r * da + (yc - fy) * (yc - fy)) < fr) continue;
          var w = [Math.cos(am) * sg, 0, Math.sin(am) * sg], q0 = vi(i, j), q1 = vi(i, j + 1), q2 = vi(i + 1, j + 1), q3 = vi(i + 1, j);
          tri(v, f, q0, q1, q2, w); tri(v, f, q0, q2, q3, w);
        }
      }
    });
    [[y0, -1], [y0 + h, 1]].forEach(function (cp) {   /* a coroa da boca, nas duas pontas */
      for (j = 0; j < seg; j++) {
        var a0 = TAU * j / seg, a1 = TAU * (j + 1) / seg, b = v.length / 3;
        v.push(Math.cos(a0) * ro, cp[0], Math.sin(a0) * ro, Math.cos(a1) * ro, cp[0], Math.sin(a1) * ro, Math.cos(a1) * ri, cp[0], Math.sin(a1) * ri, Math.cos(a0) * ri, cp[0], Math.sin(a0) * ri);
        tri(v, f, b, b + 1, b + 2, [0, cp[1], 0]); tri(v, f, b, b + 2, b + 3, [0, cp[1], 0]);
      }
    });
    return { v: v, f: f };
  }

  /* o DISCO DA ROSETA: coroa de rIn a rOut, espessura t, com 4 furos pequenos (0/90/180/270°) e 4 grandes (45/135/225/315°) na faixa [r1, r2]. Furo
     pequeno = largura tangencial do JSON; furo grande = corda do JSON; os dois são setores anelares (a forma do JSON: "setor anelar de cantos arredondados").
     Sólido FECHADO: topo, fundo, aro de fora, aro de dentro e as paredes de cada furo. Passos máximos de 15° (decisão de forma). */
  var _disco = null;
  function discoRoseta() {
    if (_disco) return _disco;
    var rIn = mm(FPO, "roseta_furoCentral") / 2, rOut = mm(FPO, "roseta_diametroExterno") / 2, t = mm(FPO, "roseta_espessura"), h = t / 2;
    var r1 = mm(FPO, "roseta_furoGrandeRaioInterno"), r2 = mm(FPO, "roseta_furoGrandeRaioExterno"), rm = rFuros();
    var aS = Math.asin(mm(FPO, "roseta_furoPequenoLarguraTangencial") / 2 / rm) / RAD, aG = Math.asin(mm(FPO, "roseta_furoGrandeCorda") / 2 / rm) / RAD, PASSO = 15;
    var bp = [aS], tp = [], i;
    function seg(a0, a1, tipo) { var n = Math.max(1, Math.ceil((a1 - a0) / PASSO - 1e-9)), j; for (j = 0; j < n; j++) { tp.push(tipo); bp.push(a0 + (a1 - a0) * (j + 1) / n); } }
    for (i = 0; i < 8; i++) {   /* furo i: centro 45·i, meia-abertura aS (pequeno, i par) ou aG (grande, i ímpar) */
      var ai = i % 2 === 0 ? aS : aG, ci = 45 * i, ni = (i + 1) % 8, an = ni % 2 === 0 ? aS : aG, cn = i === 7 ? 360 : 45 * ni;
      seg(ci + ai, cn - an, "s"); seg(cn - an, cn + an, "h");
    }
    var v = [], f = [], N = tp.length;
    function P(r, a, y) { return [Math.cos(a * RAD) * r, y, Math.sin(a * RAD) * r]; }
    function quad(p, w) { var b = v.length / 3; p.forEach(function (q) { v.push(q[0], q[1], q[2]); }); tri(v, f, b, b + 1, b + 2, w); tri(v, f, b, b + 2, b + 3, w); }
    for (i = 0; i < N; i++) {
      var a0 = bp[i], a1 = bp[i + 1], am = (a0 + a1) / 2 * RAD, sol = tp[i] === "s", rad = [Math.cos(am), 0, Math.sin(am)], rin = [-rad[0], 0, -rad[2]];
      [[h, 1], [-h, -1]].forEach(function (yy) {
        var w = [0, yy[1], 0];
        quad([P(rIn, a0, yy[0]), P(r1, a0, yy[0]), P(r1, a1, yy[0]), P(rIn, a1, yy[0])], w);
        quad([P(r2, a0, yy[0]), P(rOut, a0, yy[0]), P(rOut, a1, yy[0]), P(r2, a1, yy[0])], w);
        if (sol) quad([P(r1, a0, yy[0]), P(r2, a0, yy[0]), P(r2, a1, yy[0]), P(r1, a1, yy[0])], w);
      });
      quad([P(rOut, a0, -h), P(rOut, a1, -h), P(rOut, a1, h), P(rOut, a0, h)], rad);
      quad([P(rIn, a0, -h), P(rIn, a1, -h), P(rIn, a1, h), P(rIn, a0, h)], rin);
      if (!sol) {
        quad([P(r1, a0, -h), P(r1, a1, -h), P(r1, a1, h), P(r1, a0, h)], rad);   /* a parede de dentro do furo (raio r1) olha para fora */
        quad([P(r2, a0, -h), P(r2, a1, -h), P(r2, a1, h), P(r2, a0, h)], rin);   /* a de fora (raio r2) olha para dentro */
        if (i === 0 || tp[i - 1] !== "h") quad([P(r1, a0, -h), P(r2, a0, -h), P(r2, a0, h), P(r1, a0, h)], [-Math.sin(a0 * RAD), 0, Math.cos(a0 * RAD)]);
        if (i === N - 1 || tp[i + 1] !== "h") quad([P(r1, a1, -h), P(r2, a1, -h), P(r2, a1, h), P(r1, a1, h)], [Math.sin(a1 * RAD), 0, -Math.cos(a1 * RAD)]);
      }
    }
    _disco = { v: v, f: f };
    return _disco;
  }

  /* a roseta COMPLETA (disco + cordão de solda em cima e embaixo), centrada em y = 0 do kit corrente */
  function roseta(k, nv, mat) {
    var rOut = mm(FPO, "roseta_diametroExterno") / 2, t = mm(FPO, "roseta_espessura"), ro = rTubo(), fil = mm(FPO, "roseta_filete");
    if (nv === "alto") {
      k.add(mat, discoRoseta());
      k.add(mat, cilindro(ro, fil, 8, ro + fil, -t / 2 - fil));    /* filete de solda abaixo do disco (cateto do JSON) */
      k.add(mat, cilindro(ro + fil, fil, 8, ro, t / 2));           /* e acima */
    } else k.add(mat, cilindro(rOut, t, 14, rOut, -t / 2));
  }

  /* ---- o laço do estribo (faixa de aço dobrada em retângulo fechado, saindo do poste) e o nó de 4 laços a 90° ----
     Laço = tubo retangular (largura × altura do JSON, parede = espessura da faixa) de comprimento = projeção além do tubo; aberto na frente (a pinça entra);
     o rasgo da chaveta (largura × altura do JSON) vazado na placa de cima, perto da boca. Centro do laço em yc. Eixo radial = +X. */
  function laco(k, mat, yc, nv) {
    var F = FEN, rE = mm(F, "posteDiametro") / 2, pr = mm(F, "lacoProjecaoAlemDoTubo"), w = mm(F, "lacoLargura"), h = mm(F, "lacoAlturaAoLongoDoPoste"), e = mm(F, "lacoEspessuraDaFaixa");
    var rl = mm(F, "lacoRasgoLargura"), ra = mm(F, "lacoRasgoAltura"), xs = rE + pr - rl * 1.5;   /* o rasgo a 1,5 larguras da boca (decisão de forma) */
    k.add(mat, caixa(rE - 0.001, yc - h / 2, -w / 2, pr + 0.001, e, w));                                   /* placa de baixo */
    k.add(mat, caixa(rE - 0.001, yc - h / 2 + e, -w / 2, pr + 0.001, h - 2 * e, e));                      /* lado −Z */
    k.add(mat, caixa(rE - 0.001, yc - h / 2 + e, w / 2 - e, pr + 0.001, h - 2 * e, e));                   /* lado +Z */
    var yt = yc + h / 2 - e;
    if (nv === "alto") {                                                                                   /* placa de cima com o rasgo vazado */
      k.add(mat, caixa(rE - 0.001, yt, -w / 2, xs - (rE - 0.001), e, w));
      k.add(mat, caixa(xs + ra, yt, -w / 2, rE + pr - xs - ra, e, w));
      k.add(mat, caixa(xs, yt, -w / 2, ra, e, (w - rl) / 2));
      k.add(mat, caixa(xs, yt, rl / 2, ra, e, (w - rl) / 2));
    } else k.add(mat, caixa(rE - 0.001, yt, -w / 2, pr + 0.001, e, w));
  }
  function noEstribo(k, mat, yc, nv) {
    [0, 90, 180, 270].forEach(function (g) { k.com([0, 0, 0], [["y", g]], function () { laco(k, mat, yc, nv); }); });
  }

  /* ---- a CABEÇA da travessa / diagonal: bloco oitavado (48 × 72 × 50) com a fenda do disco aberta para o poste (−X) ----
     x0 = onde a cabeça começa; zc = eixo da cabeça em Z; o chanfro dos cantos = 1/6 da largura (decisão de forma: "oitavada na vista de topo");
     a fenda é centrada no plano da roseta (y = 0) e o bloco desce a partir dela (D1). */
  function cabeca(k, nv, mat, x0, zc) {
    var F = FTR, comp = mm(F, "cabecaComprimento"), larg = mm(F, "cabecaLargura"), alt = mm(F, "cabecaAltura"), sh = mm(F, "cabecaFendaParaRosetaAltura"), sp = mm(F, "cabecaFendaProfundidade");
    var yc = yEixo(), yb = yc - alt / 2, yt = yc + alt / 2, poly = octagono(x0, x0 + comp, zc - larg / 2, zc + larg / 2, larg / 6);
    if (nv === "alto") {
      var xs = x0 + sp, pj = recortaX(poly, xs, true);
      k.add(mat, prismaConvexo(pj, -sh / 2 - yb, yb));                 /* mandíbula de baixo */
      k.add(mat, prismaConvexo(pj, yt - sh / 2, sh / 2));              /* mandíbula de cima */
      k.add(mat, prismaConvexo(recortaX(poly, xs, false), alt, yb));   /* o fundo da fenda, onde o tubo entra */
    } else k.add(mat, prismaConvexo(poly, alt, yb));
    return { yt: yt, yb: yb };
  }
  /* a CUNHA: lâmina afilada (27 no topo, 10 na ponta, 6 de espessura, 140 de comprimento) em pé na janela da cabeça, a meio caminho entre a face
     da cabeça e o fundo da fenda; 20 % do que sobra da cunha sobre a altura da cabeça fica ACIMA dele (decisão de forma: a cunha batida até ressaltar) */
  function cunha(k, mat, xc, zc, cab) {
    var F = FTR, len = mm(F, "cunhaComprimento"), wt = mm(F, "cunhaLarguraNoTopo"), wp = mm(F, "cunhaLarguraNaPonta"), e = mm(F, "cunhaEspessura"), ch = wt / 9;
    var top = cab.yt + 0.2 * (len - (cab.yt - cab.yb)), uT = -top, uP = len - top;
    var c = [[uT, -(wt / 2 - ch)], [uT, wt / 2 - ch], [uT + ch, wt / 2], [uP, wp / 2], [uP, -wp / 2], [uT + ch, -wt / 2]];
    k.com([xc - e / 2, 0, zc], [["z", -90]], function () { k.add(mat, prismaConvexo(c, e, 0)); });
  }

  /* ---- gancho de chapa em volta de um tubo (garra do piso e do rodapé): arco de chapa colado ao tubo + aba de ligação ----
     O arco gira em torno do eixo Z (no plano X–Y); `a0..a1` em graus a partir de baixo (180° = topo), cresce para +X. Largura em Z = larg. */
  function arcoTubo(k, mat, xc, yc, rt, e, larg, zc, a0, a1) {
    k.com([xc, yc, zc], [["x", 90]], function () { k.add(mat, setor(rt + 0.0003, rt + 0.0003 + e, a0, a1, larg, Math.max(6, Math.ceil((a1 - a0) / 12)), true)); });
  }

  /* ------------------------------------------------ GERADORES POR FAMÍLIA
     Cada um recebe (k, v): o kit de transformações e os valores dos parâmetros (já em metros/graus/texto). */
  var GER = {}, SIMB = {}, MASSA = {};

  /* massa do catálogo do locador (M02) pela lista de comprimentos (mm) e de pesos (kg) do JSON; fora da lista, proporcional ao comprimento da mais próxima */
  function pesoLista(F, nC, nP, comp) {
    var cs = lista(F, nC), ps = lista(F, nP), i, b = 0;
    for (i = 0; i < cs.length; i++) if (Math.abs(cs[i] - comp) < 1) return ps[i];
    for (i = 1; i < cs.length; i++) if (Math.abs(cs[i] - comp) < Math.abs(cs[b] - comp)) b = i;
    return ps[b] * comp / cs[b];
  }
  function semPeso(v) { return v.Linha === "estribo"; }   /* o estribo (M01) não traz pesos: a massa fica 0 = «sem peso de fonte» */

  /* ---- 1. POSTE: tubo Ø48,3 com rosetas a cada 500 mm, espigão com furo do pino em cima e soquete embaixo ---- */
  function nosPoste(L, est) {   /* alturas do plano da roseta (ou do laço), a partir da ponta de baixo */
    var passo = mm(FPO, "passoRosetas"), r0 = est ? mm(FEN, "espacamentoVerticalDosNos") : mm(FPO, "distanciaPrimeiraRosetaAtePontaInferior");
    var cauda = est ? 0 : mm(FPO, "distanciaUltimaRosetaAteOmbroDoEspigao"), out = [], y;
    for (y = r0; y <= L - cauda + 1e-6; y += passo) out.push(y);
    return out;
  }
  GER[FPO] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.5, v.Comprimento), est = v.Linha === "estribo", F = FPO, ro = est ? mm(FEN, "posteDiametro") / 2 : rTubo(), ri = ro - mm(F, "parede");
    var rEs = mm(F, "espigaoDiametroExterno") / 2, pEs = mm(F, "espigaoParede"), lEs = mm(F, "espigaoComprimentoLivre"), soq = mm(F, "soqueteInferiorComprimento"), rSoq = mm(F, "soqueteInternoDiametro") / 2;
    var fy = mm(F, "espigaoFuroPosicao"), fr = mm(F, "espigaoFuroPinoDiametro") / 2, nos = nosPoste(L, est), yE = yEixo(), seg = segs(nv, 24, 12);
    if (nv === "baixo") {
      k.add(MAT.GALV, linhaFina([0, 0, 0], [0, L + lEs, 0], LIN_R));
      nos.forEach(function (y) { k.com([0, y, 0], [], function () { k.add(MAT.GALV, octaedro(0.012)); }); });
      return;
    }
    if (nv === "alto") {
      k.add(MAT.GALV, tuboOco(ro, ri, L - soq, seg, soq));
      if (est) { k.add(MAT.GALV, tuboOco(ro, rSoq, soq, seg, 0)); k.add(MAT.GALV, tuboOco(rEs, rEs - pEs, lEs, seg, L)); }
      else { k.add(MAT.GALV, tuboFuro(ro, rSoq, 0, soq, 24, fy, fr)); k.add(MAT.GALV, tuboFuro(rEs, rEs - pEs, L, lEs, 24, L + fy, fr)); }
    } else { k.add(MAT.GALV, cilindro(ro, L, seg, ro, 0)); k.add(MAT.GALV, cilindro(rEs, lEs, seg, rEs, L)); }
    nos.forEach(function (y) {
      if (est) k.com([0, y + yE, 0], [], function () { noEstribo(k, MAT.GALV, 0, nv); });
      else k.com([0, y, 0], [], function () { roseta(k, nv, MAT.GALV); });
    });
  };
  SIMB[FPO] = function (v) { var o = []; circ(o, 0, 0, rTubo(), 24); circ(o, 0, 0, mm(FPO, "roseta_diametroExterno") / 2, 32); return { linhas: o }; };
  MASSA[FPO] = function (v) { return semPeso(v) ? 0 : pesoLista(FPO, "comprimentosCatalogoPEMAX", "pesosCatalogoPEMAX", v.Comprimento * 1000); };

  /* ---- 2. TRAVESSA: tubo + cabeça (48 × 72 × 50) com a fenda do disco + cunha em pé; no estribo, pinça + chaveta ---- */
  /* a ponta da travessa do estribo no poste A: a pinça entra no laço (27 mm de vão livre; a pinça de 30 do JSON é estimada ±5 e fica limitada ao vão),
     a caixa em U fica fora dele, e a chaveta desce pelo rasgo da placa de cima do laço com o contrapeso embaixo. Devolve o x onde o tubo começa. */
  function fimPinca(k, nv, mat) {
    var FE = FEN, F = FPC, rE = mm(FE, "posteDiametro") / 2, pr = mm(FE, "lacoProjecaoAlemDoTubo"), h = mm(FE, "lacoAlturaAoLongoDoPoste"), e = mm(FE, "lacoEspessuraDaFaixa"), w = mm(FE, "lacoLargura");
    var pl = Math.min(mm(F, "pincaLargura"), w - 2 * e - 0.001), pd = mm(F, "pincaProfundidade"), xr = rE + pr, yc = yEixo(), hi = h - 2 * e;
    k.add(mat, caixa(xr - pd, yc - hi / 2, -pl / 2, pd, hi, pl));                                  /* a pinça, dentro do laço */
    k.add(mat, caixa(xr, yc - h / 2, -(pl / 2 + e), pd, h, pl + 2 * e));                            /* a caixa em U, fora do laço */
    if (nv === "alto") {
      var cl = mm(F, "chavetaComprimento"), cw = mm(F, "chavetaLargura"), ce = mm(F, "chavetaEspessura"), rl = mm(FE, "lacoRasgoLargura"), ra = mm(FE, "lacoRasgoAltura");
      var xc = rE + pr - rl * 1.5 + ra / 2, topo = yc + h / 2 + 0.2 * cl, fundo = topo - cl;   /* 20 % da chaveta fica acima do laço (decisão de forma) */
      k.add(mat, caixa(xc - ce / 2, fundo, -cw / 2, ce, cl, cw));                                  /* a chaveta: lâmina chata */
      k.add(mat, caixa(xc - ce * 1.25, fundo, -cw * 0.75, ce * 2.5, cw * 1.2, cw * 1.5));          /* o contrapeso na base, abaixo do pino */
      k.com([xr + pd / 2, yc + h / 2 - 2 * e, -(pl / 2 + e) - 0.001], [["x", 90]], function () { k.add(mat, cilindro(ce, pl + 2 * e + 0.002, 12, ce, 0)); });   /* o pino de giro, Ø = 2 × espessura da chaveta */
    }
    return xr + pd;
  }
  GER[FTR] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.2, v.Comprimento), est = v.Linha === "estribo", F = FTR, ro = mm(F, "tuboDiametroExterno") / 2, ri = ro - mm(F, "tuboParede"), yE = yEixo(), rP = rTubo();
    if (nv === "baixo") {
      k.add(MAT.GALV, linhaFina([0, yE, 0], [L, yE, 0], LIN_R));
      [0, L].forEach(function (x) { k.com([x, 0, 0], [], function () { k.add(MAT.GALV, octaedro(0.012)); }); });
      return;
    }
    var seg = segs(nv, 20, 12), xa;
    if (est) {
      xa = fimPinca(k, nv, MAT.GALV);
      k.com([L, 0, 0], [["y", 180]], function () { fimPinca(k, nv, MAT.GALV); });
    } else {
      var comp = mm(F, "cabecaComprimento");
      xa = rP + comp;
      var cab = cabeca(k, nv, MAT.GALV, rP, 0); cunha(k, MAT.GALV, rFuros(), 0, cab);
      k.com([L, 0, 0], [["y", 180]], function () { var c2 = cabeca(k, nv, MAT.GALV, rP, 0); cunha(k, MAT.GALV, rFuros(), 0, c2); });
    }
    if (nv === "alto") tuboX(k, MAT.GALV, ro, ri, xa, L - xa, yE, seg); else k.com([xa, yE, 0], [["z", -90]], function () { k.add(MAT.GALV, cilindro(ro, Math.max(0.01, L - 2 * xa), seg, ro, 0)); });
  };
  SIMB[FTR] = function (v) { var o = [], ro = mm(FTR, "tuboDiametroExterno") / 2; ret(o, 0, -ro, v.Comprimento, ro); return { linhas: o }; };
  MASSA[FTR] = function (v) { return semPeso(v) ? 0 : pesoLista(FTR, "comprimentosNominaisPEMAX", "pesosCatalogoPEMAX", v.Comprimento * 1000); };

  /* ---- 2b. TRAVESSA EM U (só a linha de sistema de referência (fonte S01); o multidirecional do locador não tem — fica como referência, ver o JSON) ---- */
  GER[FTU] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.3, v.Comprimento), F = FTU, w = mm(F, "perfilLargura"), h = mm(F, "perfilAltura"), e = mm(F, "perfilParede"), rP = rTubo(), comp = mm(FTR, "cabecaComprimento"), yE = yEixo();
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([0, yE, 0], [L, yE, 0], LIN_R)); return; }
    var lip = e * 3, y0 = yE - h / 2, xa = rP + comp;   /* a aba retornada tem 3 espessuras (decisão de forma) */
    var pts = [[-w / 2 + lip, y0 + h - e / 2], [-w / 2 + e / 2, y0 + h - e / 2], [-w / 2 + e / 2, y0 + e / 2], [w / 2 - e / 2, y0 + e / 2], [w / 2 - e / 2, y0 + h - e / 2], [w / 2 - lip, y0 + h - e / 2]];
    fita(k, MAT.GALV, pts, e, xa, L - xa);
    var cab = cabeca(k, nv, MAT.GALV, rP, 0); cunha(k, MAT.GALV, rFuros(), 0, cab);
    k.com([L, 0, 0], [["y", 180]], function () { var c2 = cabeca(k, nv, MAT.GALV, rP, 0); cunha(k, MAT.GALV, rFuros(), 0, c2); });
  };
  SIMB[FTU] = function (v) { var o = [], w = mm(FTU, "perfilLargura") / 2; ret(o, 0, -w, v.Comprimento, w); return { linhas: o }; };
  MASSA[FTU] = function () { return 0; };

  /* ---- 3. DIAGONAL: tubo achatado nas pontas + cabeça articulada (pino a 77,5 mm do eixo do poste) + cunha ----
     D2: a diagonal corre num plano afastado do eixo dos postes de (raio do tubo + metade da largura da cabeça): a cabeça não pode estar
     dentro do poste nem da cabeça da travessa (que ocupa ±24 em torno do eixo). `Lado` escolhe o lado. O comprimento geométrico segue a
     fórmula do desenho de referência (JSON, fonte S21) (vão − 2 × 77,5, altura); o `Comprimento` da peça de catálogo só entra na massa. */
  /* os dois pinos de articulação e o comprimento entre eles: a fórmula do JSON (vão − 2 × 77,5, altura) — pino no plano da cabeça (yEixo) */
  function geomDiag(vao, H) {
    var xp = mm(FDI, "articulacaoPonto_ex"), yp = yEixo(), ax = xp, ay = yp, bx = vao - xp, by = H + yp, dx = bx - ax, dy = by - ay;
    return { ax: ax, ay: ay, bx: bx, by: by, Ld: Math.sqrt(dx * dx + dy * dy), phi: Math.atan2(dy, dx) / RAD };
  }
  GER[FDI] = function (k, v) {
    var nv = nivelDe(v), F = FDI, vao = Math.max(0.3, v.Vao), H = Math.max(0.3, v.Altura), lado = v.Lado < 0 ? -1 : 1, xp = mm(F, "articulacaoPonto_ex"), ro = mm(F, "tuboDiametroExterno") / 2, ri = ro - mm(F, "tuboParede");
    var rp = mm(F, "pinoArticulacaoDiametro") / 2, ach = mm(F, "extremidadeAchatadaComprimento"), lg = mm(FTR, "cabecaLargura"), zO = lado * (rTubo() + lg / 2), yp = yEixo();
    var gd = geomDiag(vao, H), ax = gd.ax, ay = gd.ay, bx = gd.bx, by = gd.by, Ld = gd.Ld, phi = gd.phi;
    if (nv === "baixo") {
      k.add(MAT.GALV, linhaFina([ax, ay, zO], [bx, by, zO], LIN_R));
      [[0, 0], [vao, H]].forEach(function (p) { k.com([p[0], p[1], 0], [], function () { k.add(MAT.GALV, octaedro(0.012)); }); });
      return;
    }
    var cab0 = null;
    cab0 = cabeca(k, nv, MAT.GALV, xp - mm(FTR, "cabecaComprimento"), zO); cunha(k, MAT.GALV, rFuros(), zO, cab0);
    k.com([vao, H, 0], [["y", 180]], function () { var c2 = cabeca(k, nv, MAT.GALV, xp - mm(FTR, "cabecaComprimento"), -zO); cunha(k, MAT.GALV, rFuros(), -zO, c2); });
    if (nv === "alto") [[ax, ay], [bx, by]].forEach(function (p) { k.com([p[0], p[1], zO - (lg / 2 + 0.002)], [["x", 90]], function () { k.add(MAT.GALV, cilindro(rp, lg + 0.004, 14, rp, 0)); }); });   /* o pino de articulação atravessa a cabeça */
    k.com([ax, ay, zO], [["z", phi]], function () {
      var pa = ach - 2 * rp, e2 = 2 * mm(F, "tuboParede");   /* a ponta achatada: espessura = 2 paredes, largura = o diâmetro; o pino fica a 2 raios da ponta */
      if (nv === "alto") {
        tuboX(k, MAT.GALV, ro, ri, pa, Ld - pa, 0, 20);
        k.add(MAT.GALV, caixa(-2 * rp, -e2 / 2, -ro, ach, e2, 2 * ro));
        k.add(MAT.GALV, caixa(Ld - pa, -e2 / 2, -ro, ach, e2, 2 * ro));
      } else k.com([-2 * rp, 0, 0], [["z", -90]], function () { k.add(MAT.GALV, cilindro(ro, Ld + 4 * rp, 12, ro, 0)); });
    });
  };
  SIMB[FDI] = function (v) { var lado = v.Lado < 0 ? -1 : 1, zO = lado * (rTubo() + mm(FTR, "cabecaLargura") / 2); return { linhas: [0, zO, v.Vao, zO] }; };
  MASSA[FDI] = function (v) { return semPeso(v) ? 0 : pesoLista(FDI, "comprimentosCatalogoPEMAX", "pesosCatalogoPEMAX", v.Comprimento * 1000); };

  /* ---- 4. PISO (e 5. ALÇAPÃO): chapa dobrada em caixa aberta para baixo, tampo perfurado (textura), garras de 35 mm e trinco vermelho ----
     Largura = parâmetro (0,32 / 0,30 / 0,20). A chapa é `comprimentoDoPisoMenosNominal` mais curta que o nominal (42 mm: 21 de cada lado do eixo do poste);
     a garra avança `garraRecuoNaLateral` além da ponta da chapa e abraça o tubo da travessa por cima (arco), o trinco vermelho fecha por baixo. */
  function corpoPiso(k, nv, L, W, ab) {
    var F = FPI, e = mm(F, "espessuraDaChapa"), hp = mm(F, "alturaDoPerfil"), x0 = mm(F, "comprimentoDoPisoMenosNominal") / 2, x1 = L - x0, rt = rTubo(), yE = yEixo();
    var gl = mm(F, "garraLarguraNaPlanta"), tl = mm(F, "travaComprimento"), tw = mm(F, "travaLargura");
    if (nv === "baixo") { k.add(MAT.GALV, caixa(x0, -2 * e, -W / 2, x1 - x0, 2 * e, W)); return; }
    var topo = nv === "alto" ? MAT.PERF : MAT.GALV, rb = 4 * e, fl = hp / 5;   /* bordo enrolado de 4 espessuras e aba retornada de 1/5 da altura (decisão de forma) */
    if (!ab) k.add(topo, caixa(x0, -e, -W / 2, x1 - x0, e, W));
    else {
      var m = ab.m, zA = -W / 2 + m, zB = W / 2 - m;
      k.add(topo, caixa(x0, -e, -W / 2, x1 - x0, e, m)); k.add(topo, caixa(x0, -e, zB, x1 - x0, e, m));
      k.add(topo, caixa(x0, -e, zA, ab.x0 - x0, e, zB - zA)); k.add(topo, caixa(ab.x1, -e, zA, x1 - ab.x1, e, zB - zA));
    }
    [-1, 1].forEach(function (s) {   /* as duas paredes de 76: bordo enrolado no alto, aba retornada embaixo */
      var zw = s * (W / 2 - e / 2), cz = s * (W / 2 - e / 2 - rb), cy = -e - rb, pts = [[zw - s * fl, -hp + e / 2], [zw, -hp + e / 2], [zw, cy]], j;   /* a linha de centro do bordo desce meia espessura: o topo do bordo não passa do tampo (Y = 0) */
      for (j = 1; j <= 2; j++) { var t = (j / 2) * 90 * RAD; pts.push([cz + s * rb * Math.cos(t), cy + rb * Math.sin(t)]); }
      pts.push([cz - s * 2 * e, -e]);
      fita(k, MAT.GALV, pts, e, x0, x1);
    });
    if (nv !== "alto") return;
    var tg = e, rr = rt + 0.0003 + tg / 2, a0 = 180 - Math.asin(Math.min(0.99, x0 / rr)) / RAD, a1 = 345;   /* o arco começa onde a chapa termina (x0) e dá ~225° em volta do tubo (decisão de forma) */
    var ya = yE - Math.cos(a0 * RAD) * rr;
    [-1, 1].forEach(function (s) {
      var zc = s * (W / 2 - gl / 2);
      [0, 1].forEach(function (fim) {
        k.com([fim ? L : 0, 0, 0], fim ? [["y", 180]] : [], function () {
          arcoTubo(k, MAT.GALV, 0, yE, rt, tg, gl, s * (fim ? -1 : 1) * (W / 2 - gl / 2), a0, a1);
          k.add(MAT.GALV, caixa(x0 - tg, ya, s * (fim ? -1 : 1) * (W / 2 - gl / 2) - gl / 2, tg, -e - ya, gl));                       /* a alça que liga a chapa ao arco */
          k.add(MAT.VERM, caixa(-tl / 2, yE - rt - tg - 0.0035, s * (fim ? -1 : 1) * (W / 2 - gl / 2) - tw / 2, tl, 0.003, tw));        /* o trinco vermelho, 40 × 10, fechando por baixo do tubo */
        });
      });
    });
  }
  GER[FPI] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.3, v.Comprimento), W = clamp(v.Largura, 0.1, 0.8);
    corpoPiso(k, nv, L, W, null);
  };
  function simboloPiso(L, W, ab) {
    var o = [], x0 = mm(FPI, "comprimentoDoPisoMenosNominal") / 2, x1 = L - x0; ret(o, x0, -W / 2, x1, W / 2);
    if (ab) ret(o, ab.x0, -W / 2 + ab.m, ab.x1, W / 2 - ab.m); else o.push(x0, -W / 2, x1, W / 2, x0, W / 2, x1, -W / 2);
    return { linhas: o };
  }
  SIMB[FPI] = function (v) { return simboloPiso(v.Comprimento, clamp(v.Largura, 0.1, 0.8), null); };
  MASSA[FPI] = function (v) { return semPeso(v) ? 0 : pesoLista(FPI, "comprimentosCatalogoPEMAX", "pesosCatalogoPEMAX", v.Comprimento * 1000); };

  function aberturaAlcapao(L, W) {
    var F = FAL, m = mm(F, "margemLateral"), x0 = mm(FPI, "comprimentoDoPisoMenosNominal") / 2 + m, xo0 = x0, xo1 = xo0 + mm(F, "aberturaDaTampaComprimento");
    return { x0: xo0, x1: Math.min(xo1, L - x0 - m), m: m };
  }
  GER[FAL] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(1.2, v.Comprimento), W = clamp(v.Largura, 0.3, 1.0), F = FAL, e = mm(FPI, "espessuraDaChapa"), ab = aberturaAlcapao(L, W), fim = v.Escotilha === "fim";
    k.com([fim ? L : 0, 0, 0], fim ? [["y", 180]] : [], function () {
      corpoPiso(k, nv, L, W, ab);
      if (nv === "baixo") return;
      var zA = -W / 2 + ab.m, zB = W / 2 - ab.m, te = 1.5 * e;
      k.add(MAT.ALU, caixa(ab.x0, -te - 0.0005, zA, ab.x1 - ab.x0, te, zB - zA));                                   /* a tampa de alumínio, ao nível do piso */
      if (nv === "alto") k.com([ab.x0, -te / 2 - 0.0005, zA], [["x", 90]], function () { k.add(MAT.ALU, cilindro(te, zB - zA, 12, te, 0)); });   /* a dobradiça na ponta de cima */
      /* a escada: pendurada na borda da abertura, inclinada até o piso de baixo (o desnível vem do motor); o comprimento é o do JSON */
      var Le = mm(F, "escada_comprimento"), D = clamp(v.Desnivel, 0.5, Le - 0.05), run = Math.sqrt(Le * Le - D * D), psi = Math.atan2(D, run) / RAD;
      var wl = mm(F, "escada_largura"), hw = mm(F, "escada_longarinaEspessura"), hd = mm(F, "escada_longarinaLargura"), rg = mm(F, "escada_degrauLado"), pd = mm(F, "escada_passoDosDegraus"), nd = cota(F, "escada_numeroDeDegraus");
      var s0 = (Le - (nd - 1) * pd) / 2, i;
      k.com([ab.x0, -e, 0], [["z", -psi]], function () {
        [-1, 1].forEach(function (s) { k.add(MAT.ALU, caixa(0, -hd, s > 0 ? wl / 2 - hw : -wl / 2, Le, hd, hw)); });   /* as duas longarinas 40 × 20 */
        for (i = 0; i < nd; i++) k.add(MAT.ALU, caixa(s0 + i * pd - rg / 2, -hd / 2 - rg / 2, -wl / 2 + hw, rg, rg, wl - 2 * hw));   /* os degraus 20 × 20 a cada 280 */
      });
      if (nv === "alto") [-1, 1].forEach(function (s) {   /* o gancho em J no topo de cada longarina */
        var zh = s * (wl / 2 - hw / 2);
        k.add(MAT.ALU, caixa(ab.x0, -e - 0.045, zh - hw / 2, 0.006, 0.045 + e + 0.004, hw));
        k.add(MAT.ALU, caixa(ab.x0 - 0.030, 0, zh - hw / 2, 0.036, 0.004, hw));
      });
    });
  };
  SIMB[FAL] = function (v) { var L = v.Comprimento, ab = aberturaAlcapao(L, v.Largura), fim = v.Escotilha === "fim", o = simboloPiso(L, v.Largura, fim ? { x0: L - ab.x1, x1: L - ab.x0, m: ab.m } : ab); return o; };
  MASSA[FAL] = function (v) { return semPeso(v) ? 0 : cota(FAL, "PEMAX_peso"); };

  /* ---- 6. RODAPÉ: chapa perfilada de 0,8 mm com duas reentrâncias trapezoidais, capas pretas nas pontas e garra de 35 × 60 que abraça o tubo ---- */
  GER[FRO] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.3, v.Comprimento), H = clamp(v.Altura, 0.1, 0.4), F = FRO, e = mm(F, "espessuraDaChapa"), d = mm(F, "perfilProfundidade"), rP = rTubo(), x0 = rP, x1 = L - rP, yE = yEixo();
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([x0, H, 0], [x1, H, 0], LIN_R)); return; }
    var zb = -d / 2, zf = d / 2, m = H / 6, b = m / 2, c1 = H / 4, c2 = 3 * H / 4, lip = d / 4;   /* mouth da reentrância = H/6 e fundo = metade (decisão de forma: o «M» achatado) */
    var pts = [[zb + lip, e / 2], [zb, e / 2], [zb, c1 - m / 2], [zf, c1 - b / 2], [zf, c1 + b / 2], [zb, c1 + m / 2], [zb, c2 - m / 2], [zf, c2 - b / 2], [zf, c2 + b / 2], [zb, c2 + m / 2], [zb, H - e / 2], [zb + lip, H - e / 2]];
    if (nv === "medio") pts = [[zb, e / 2], [zb, H - e / 2]];
    fita(k, MAT.GALV, pts, e, x0, x1);
    if (nv !== "alto") return;
    var ga = mm(F, "encaixeGarraLargura"), gb = mm(F, "encaixeGarraAltura"), cap = 4 * e;   /* a capa de plástico cobre só o pé da chapa, na altura da garra (60 mm), com 4 espessuras de chapa (decisão de forma) */
    k.add(MAT.BORRACHA, caixa(x0, 0, zb, cap, gb, d)); k.add(MAT.BORRACHA, caixa(x1 - cap, 0, zb, cap, gb, d));
    var tg = 2 * e, rr = rP + 0.0003 + tg / 2, a1 = 270 + gb / rr / RAD;   /* o arco dá 60 mm de comprimento desenvolvido, do topo do tubo para o lado +Z */
    [0, 1].forEach(function (fim) {
      k.com([fim ? x1 - ga / 2 : x0 + ga / 2, yE, 0], [["z", -90]], function () { k.add(MAT.GALV, setor(rP + 0.0003, rP + 0.0003 + tg, 270, a1, ga, 10, true)); });
    });
  };
  SIMB[FRO] = function (v) { var o = [], rP = rTubo(), d = mm(FRO, "perfilProfundidade") / 2; ret(o, rP, -d, v.Comprimento - rP, d); return { linhas: o }; };
  MASSA[FRO] = function (v) { return semPeso(v) ? 0 : pesoLista(FRO, "comprimentosCatalogoPEMAX", "pesosCatalogoPEMAX", v.Comprimento * 1000); };

  /* ---- 7. PEÇA BASE: tubo curto com a 1ª roseta a 65 mm da base e a luva Ø57 em cima que recebe o poste ---- */
  GER[FPB] = function (k, v) {
    var nv = nivelDe(v), F = FPB, est = v.Linha === "estribo", H = mm(F, "alturaTotal"), yR = mm(F, "posicaoDaRosetaAPartirDaBase"), ro = rTubo(), ri = ro - mm(FPO, "parede");   /* parede do tubo interno: a do poste (o JSON dá 2,8–2,9 só em texto) */
    var rl = mm(F, "luvaDiametro") / 2, pl = mm(F, "luvaParede"), ll = mm(F, "luvaComprimento"), hT = mm(F, "tuboAteOTopoDoTuboInterno"), yE = yEixo(), seg = segs(nv, 24, 12);
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([0, 0, 0], [0, H, 0], LIN_R)); k.com([0, yR, 0], [], function () { k.add(MAT.GALV, octaedro(0.012)); }); return; }
    if (nv === "alto") {
      k.add(MAT.GALV, tuboOco(ro, ri, hT, seg, 0));
      k.add(MAT.GALV, tuboOco(rl, rl - pl, ll, seg, H - ll));
      k.add(MAT.GALV, tuboOco(rl, ro - 0.0003, 0.003, seg, H - ll));   /* o anel que solda a luva ao tubo interno */
    } else { k.add(MAT.GALV, cilindro(ro, hT, seg, ro, 0)); k.add(MAT.GALV, cilindro(rl, ll, seg, rl, H - ll)); }
    if (est) k.com([0, yR + yE, 0], [], function () { noEstribo(k, MAT.GALV, 0, nv); });
    else k.com([0, yR, 0], [], function () { roseta(k, nv, MAT.GALV); });
  };
  SIMB[FPB] = function (v) { var o = []; circ(o, 0, 0, rTubo(), 24); circ(o, 0, 0, mm(FPB, "roseta_diametro") / 2, 32); return { linhas: o }; };
  MASSA[FPB] = function (v) { return semPeso(v) ? 0 : cota(FPB, "pesoPEMAX"); };

  /* ---- 8. BASE REGULÁVEL: placa 150 × 150 × 8 de cantos chanfrados e 4 furos oblongos; haste tubular Ø38 com rosca de passo 8,1; porca borboleta ---- */
  function recortaSemi(poly, nx, nz, d) {   /* mantém nx·x + nz·z ≤ d (polígono convexo) */
    var out = [], n = poly.length, i;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], da = d - (nx * a[0] + nz * a[1]), db = d - (nx * b[0] + nz * b[1]);
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  /* a placa em células: a grade passa pelas bordas dos 4 furos oblongos (largura do JSON, comprimento = 2 larguras: decisão de forma), as células dentro de furo
     não existem e as dos cantos são recortadas pelo chanfro (1/6 do lado: decisão de forma). Sólidos fechados, sem operação booleana. */
  function placaBase(k, mat, nv, F) {
    var A = mm(F, "placaLado"), e = mm(F, "placaEspessura"), sw = mm(F, "placaFuroLargura"), a = mm(F, "placaFuroEntreCentros") / 2, sl = 2 * sw, h = A / 2, c = A / 6, i, j;
    if (nv !== "alto") { k.add(mat, prismaConvexo(octagono(-h, h, -h, h, c), e, 0)); return; }
    var br = [-h, -a - sw / 2, -a + sw / 2, -sl / 2, sl / 2, a - sw / 2, a + sw / 2, h];
    var furos = [[-a, 0, sw, sl], [a, 0, sw, sl], [0, -a, sl, sw], [0, a, sl, sw]];
    function dentro(x, z) { return furos.some(function (q) { return Math.abs(x - q[0]) < q[2] / 2 && Math.abs(z - q[1]) < q[3] / 2; }); }
    for (i = 0; i + 1 < br.length; i++) for (j = 0; j + 1 < br.length; j++) {
      if (dentro((br[i] + br[i + 1]) / 2, (br[j] + br[j + 1]) / 2)) continue;
      var p = [[br[i], br[j]], [br[i + 1], br[j]], [br[i + 1], br[j + 1]], [br[i], br[j + 1]]];
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { p = recortaSemi(p, s[0], s[1], A - c); });
      if (p.length >= 3) k.add(mat, prismaConvexo(p, e, 0));
    }
  }
  GER[FBR] = function (k, v) {
    var nv = nivelDe(v), F = FBR, e = mm(F, "placaEspessura"), rH = mm(F, "hasteDiametroDaRosca") / 2, tH = mm(F, "hasteParede"), passo = mm(F, "roscaPasso"), liso = mm(F, "hasteTrechoLisoDeCima"), hN = mm(F, "porcaBorboletaAltura"), env = mm(F, "porcaBorboletaDiametro") / 2;
    var Htot = clamp(v.Altura_total, e + 0.1, mm(F, "PEMAX_comprimento")), yN = clamp(v.Altura_rosca, e, Htot - hN), mat = MAT.BICROM, art = !!v.Articulada;
    if (nv === "baixo") { k.add(mat, linhaFina([0, 0, 0], [0, Htot, 0], LIN_R)); k.add(mat, octaedro(0.012)); return; }
    placaBase(k, mat, nv, F);
    var yB = e;
    if (art) {   /* a base articulada: rótula sob a haste (esfera de 1,25 × o raio da haste: decisão de forma) */
      var rb = rH * 1.25, perf = [], i;
      for (i = 0; i <= 10; i++) { var t = Math.PI * i / 10; perf.push([Math.sin(t) * rb, e + rb * 0.8 - Math.cos(t) * rb]); }
      k.add(mat, torno(perf, segs(nv, 20, 10))); yB = e + rb * 0.8 + rb;
    } else k.add(mat, cilindro(rH + 0.004, 0.006, 16, rH, e));   /* cordão de solda da haste na placa */
    var yT = Htot - liso;   /* até aqui a haste é rosqueada; os 150 mm de cima são lisos */
    if (nv === "alto") {
      var rv = rH - 0.0015, prof = [[rv, yB]], y = yB, n = Math.max(1, Math.floor((yT - yB) / passo));   /* filete: 1,5 mm de profundidade, 2 pontos por passo (decisão de forma) */
      for (i = 0; i < n; i++) { prof.push([rH, y + passo * 0.5], [rv, y + passo]); y += passo; }
      k.add(mat, torno(prof, 16));
      k.add(mat, tuboOco(rH, rH - tH, Htot - y, 20, y));
    } else k.add(mat, cilindro(rH, Htot - yB, 14, rH, yB));
    var hub = rH * 1.9, asaE = hN / 3;   /* cubo = 1,9 × o raio da haste; asa = 1/3 da altura (decisão de forma) */
    k.add(mat, cilindro(hub, hN, segs(nv, 24, 12), hub, yN));
    [0, 180].forEach(function (g) {
      var pol = [[hub * 0.8, 0], [env, hN * 0.15], [env, hN * 0.65], [hub * 0.8, hN]];   /* asa plana, ligeiramente caída para a ponta */
      k.com([0, yN, 0], [["x", -90], ["y", g]], function () { k.add(mat, prismaConvexo(pol, asaE, -asaE / 2)); });
    });
  };
  SIMB[FBR] = function (v) { var A = mm(FBR, "placaLado") / 2, o = []; ret(o, -A, -A, A, A); circ(o, 0, 0, mm(FBR, "hasteDiametroDaRosca") / 2, 16); return { linhas: o }; };
  MASSA[FBR] = function (v) { var p = lista(FBR, "PEMAX_pesos"); return semPeso(v) ? 0 : (v.Articulada ? p[1] : p[0]); };

  /* ---- 9. GANCHO DE ANCORAGEM: tubo ao lado do poste, barra Ø18 dobrada em L que atravessa o olhal, parafuso olhal e chumbador na parede ----
     A origem é o eixo do poste no plano da roseta; a parede está em x = Afastamento. O tubo corre ao lado do poste (a distância entre eixos da abraçadeira fixa do
     tubo-roll), acaba antes do olhal, a barra dobra 90° em planta e atravessa o anel; o anel fica a 25 mm da parede (decisão de forma). */
  GER[FGA] = function (k, v) {
    var nv = nivelDe(v), F = FGA, aff = Math.max(0.06, v.Afastamento), ro = mm(F, "tuboDiametro") / 2, rb = mm(F, "ganchoBarraDiametro") / 2, enl = mm(F, "ganchoBracoDeEnlace"), mat = MAT.GALV;
    var rIn = mm(F, "olhalAbertura") / 2, rbo = mm(F, "olhalBarraDiametro") / 2, Rm = rIn + rbo, rSt = mm(F, "olhalRoscaDiametro") / 2, rc = mm(F, "chumbadorDiametroNominal") / 2, lc = mm(F, "chumbadorComprimento");
    var zT = FAn.cota("ra-andaime-abracadeira-fixa", "distanciaEixosTubos") * MM, xr = aff - 0.025 - 2 * Rm, zr = zT + enl / 2, Rb = 3 * rb, x0 = xr - Rb - Math.max(0.15, v.Comprimento);
    if (nv === "baixo") { k.add(mat, linhaFina([x0, 0, zT], [xr, 0, zT], LIN_R)); k.add(mat, linhaFina([xr, 0, zT], [xr, 0, zT + enl], LIN_R)); k.add(mat, linhaFina([xr, 0, zr], [aff + lc, 0, zr], LIN_R)); return; }
    var xe = xr - Rb;   /* o tubo acaba onde a barra começa a dobrar e tem o Comprimento do catálogo: passa do poste para dentro do andaime (a abraçadeira o prende no meio) */
    k.com([0, 0, zT], [], function () { tuboX(k, mat, ro, ro - mm(FPO, "parede"), xe - Math.max(0.15, v.Comprimento), xe, 0, segs(nv, 24, 12)); });
    var path = [[xe, 0, zT], [xr - Rb, 0, zT]], i;
    for (i = 1; i <= 8; i++) { var t = Math.PI / 2 * i / 8; path.push([xr - Rb + Math.sin(t) * Rb, 0, zT + Rb - Math.cos(t) * Rb]); }
    path.push([xr, 0, zT + enl]);
    k.add(mat, varrer(densificar(path, 0.004), rb, segs(nv, 16, 8), true));                                                           /* a barra Ø18: reta, dobra e atravessa o anel */
    k.com([xr, 0, zr], [["x", 90]], function () { k.add(mat, PR.toroY(Rm, rbo, segs(nv, 28, 14), segs(nv, 10, 6))); });                 /* o anel do olhal, no plano X–Y */
    k.com([xr + Rm, 0, zr], [["z", -90]], function () { k.add(mat, cilindro(rSt, aff - (xr + Rm), 12, rSt, 0)); });                    /* a haste roscada até a parede */
    k.com([aff, 0, zr], [["z", -90]], function () { k.add(mat, cilindro(rc, lc, 14, rc, 0)); });                                      /* o chumbador, dentro da parede */
  };
  SIMB[FGA] = function (v) { var o = [], aff = Math.max(0.06, v.Afastamento), zT = FAn.cota("ra-andaime-abracadeira-fixa", "distanciaEixosTubos") * MM, ro = mm(FGA, "tuboDiametro") / 2; ret(o, 0, zT - ro, aff, zT + ro); circ(o, aff, zT, 0.012, 12); return { linhas: o }; };
  MASSA[FGA] = function (v) { return semPeso(v) ? 0 : cota(FGA, "pesoDoGancho"); };

  /* ---- 10. PINO TRAVA: grampo de arame Ø9 dobrado em J (60 × 94, 250 mm desenvolvidos) ---- */
  GER[FPT] = function (k, v) {
    var nv = nivelDe(v), F = FPT, d = mm(F, "arameDiametro"), l1 = mm(F, "layherComprimento"), hh = mm(F, "layherAltura"), dev = mm(F, "PEMAX_comprimentoDesenvolvido"), Rb = (hh - d) / 2, l2 = dev - l1 - Math.PI * Rb;
    if (nv === "baixo") { k.add(MAT.BICROM, linhaFina([l1 / 2, 0, 0], [-l1 / 2, 0, 0], LIN_R)); return; }
    var path = [[l1 / 2, 0, 0], [-l1 / 2, 0, 0]], i;
    for (i = 1; i <= 8; i++) { var t = Math.PI * i / 8; path.push([-l1 / 2 - Math.sin(t) * Rb, Rb - Math.cos(t) * Rb, 0]); }
    path.push([-l1 / 2 + l2, 2 * Rb, 0]);
    k.add(MAT.BICROM, varrer(densificar(path, 0.01), d / 2, segs(nv, 6, 6), true));
  };
  SIMB[FPT] = function (v) { var l1 = mm(FPT, "layherComprimento"); return { linhas: [-l1 / 2, 0, l1 / 2, 0] }; };
  MASSA[FPT] = function (v) { return semPeso(v) ? 0 : cota(FPT, "PEMAX_peso"); };

  /* ---- 11. NÓ DO ESTRIBO (4 laços a 90° soldados no poste) e 12. PINÇA + CHAVETA da travessa do estribo — peças avulsas ---- */
  GER[FEN] = function (k, v) {
    var nv = nivelDe(v), L = Math.max(0.2, v.Comprimento), ro = mm(FEN, "posteDiametro") / 2, ri = ro - mm(FEN, "posteParede"), yE = yEixo();
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([0, 0, 0], [0, L, 0], LIN_R)); k.com([0, L / 2, 0], [], function () { k.add(MAT.GALV, octaedro(0.012)); }); return; }
    if (nv === "alto") k.add(MAT.GALV, tuboOco(ro, ri, L, segs(nv, 24, 12), 0)); else k.add(MAT.GALV, cilindro(ro, L, 12, ro, 0));
    k.com([0, L / 2 + yE, 0], [], function () { noEstribo(k, MAT.GALV, 0, nv); });
  };
  SIMB[FEN] = function (v) { var o = [], rE = mm(FEN, "posteDiametro") / 2, pr = mm(FEN, "lacoProjecaoAlemDoTubo"), w = mm(FEN, "lacoLargura") / 2; circ(o, 0, 0, rE, 20); ret(o, rE, -w, rE + pr, w); ret(o, -rE - pr, -w, -rE, w); ret(o, -w, rE, w, rE + pr); ret(o, -w, -rE - pr, w, -rE); return { linhas: o }; };
  MASSA[FEN] = function () { return 0; };
  GER[FPC] = function (k, v) {
    var nv = nivelDe(v), yE = yEixo(), ro = mm(FPC, "travessaTubo") / 2, ri = ro - mm(FTR, "tuboParede");
    if (nv === "baixo") { k.add(MAT.GALV, linhaFina([0, yE, 0], [0.3, yE, 0], LIN_R)); return; }
    var xa = fimPinca(k, nv, MAT.GALV), xb = xa + 0.15;   /* um trecho de 150 mm de tubo mostra de onde ele sai (decisão de forma) */
    if (nv === "alto") tuboX(k, MAT.GALV, ro, ri, xa, xb, yE, 20); else k.com([xa, yE, 0], [["z", -90]], function () { k.add(MAT.GALV, cilindro(ro, xb - xa, 12, ro, 0)); });
  };
  SIMB[FPC] = function (v) { var o = []; ret(o, 0, -0.015, 0.2, 0.015); return { linhas: o }; };
  MASSA[FPC] = function () { return 0; };

  /* ------------------------------------------------ DEFINIÇÃO DAS FAMÍLIAS (parâmetros, tipos, quantitativo) */
  var LISTA = [];
  function P(nome, tipoDado, valor, grupo, descricao, escopo) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo || "Dimensões" };
    if (descricao) o.descricao = descricao;
    return o;
  }
  function T(id, nome, valores, fonte) { var t = { id: id, nome: nome, valores: valores || {} }; if (fonte) t.fonte = fonte; return t; }
  var PNIVEL = P("Nivel_detalhe", "texto", "alto", "Construção", "alto | medio | baixo — o nível de detalhe da vista (Baixo = eixo e ponto no nó; Médio = formas simples; Alto = a forma inteira). A peça é a mesma nos três.", "instancia");
  var PMASSA = P("Massa_kg", "numero", 0, "Identidade", "Massa da peça em kg para o peso do modelo; 0 = a do catálogo do locador (M02) (a locação do andaime usa a do catálogo do js/andaimemulti.js)", "instancia");
  var PLINHA = P("Linha", "texto", "roseta", "Construção", "roseta | estribo: a linha do sistema. No estribo o catálogo não tem peso (massa 0 = sem peso de fonte).", "instancia");
  var FORA = " Peça de locação do andaime: fora do orçamento do aço (código de orçamento em branco; a lista de locação é a do js/andaimemulti.js).";
  var ESTIMADAS = " Cotas estimadas ficam marcadas em docs/andaime-multi/FAMILIAS-M-COTAS.md (\"conferir com a peça real\").";
  function def(o) {
    var fam = {
      id: o.id, previa: "modelador", nome: o.nome, categoria: "andaime", hospedagem: "livre", geometria: "andaime", andaime: o.id, disciplina: "andaime",
      descricao: o.descricao + (o.origem ? " Origem: " + o.origem : "") + FORA + ESTIMADAS,
      parametros: o.parametros.concat([PLINHA, PNIVEL, PMASSA]), tipos: o.tipos,
      quantitativo: { unidade: o.unidade || "un", quantidade: o.quantidade || "1", codigo: "", fonte: "", descricao: (o.quantDesc || o.nome) + " (locação do andaime multidirecional)" }
    };
    LISTA.push(fam); if (o.massa) MASSA[o.id] = o.massa;
    return fam;
  }
  function tipos(F, nome, rotulo, prefixo, param, extra) {
    return lista(F, nome).map(function (c) {
      var m = Math.round(c) / 1000, o = {}; o[param] = m; if (extra) Object.keys(extra).forEach(function (q) { o[q] = extra[q]; });
      return T(prefixo + String(m).replace(".", "_"), rotulo + " " + String(m).replace(".", ",") + " m", o, "docs/andaime-multi/familias-m-cotas.json");
    });
  }
  var FONTE = "docs/andaime-multi/familias-m-cotas.json";
  try {
    def({ id: FPO, nome: "Poste do multidirecional (roseta)", descricao: "Tubo Ø48,3 × 3,0 com rosetas Ø124 × 9 a cada 500 mm (4 furos pequenos a 0/90/180/270° e 4 grandes a 45°), espigão Ø38 com furo do pino em cima e soquete embaixo. Linha estribo: 4 laços a 90° no lugar da roseta.",
      origem: "na ponta de baixo, no eixo; a 1ª roseta a 400 mm.", parametros: [P("Comprimento", "comprimento", 2.0, "Dimensões", "0,5 a 3,0 m (catálogo)", "instancia")],
      tipos: tipos(FPO, "comprimentosCatalogoPEMAX", "Poste", "c", "Comprimento"), massa: MASSA[FPO], quantDesc: "Poste do multidirecional" });
    def({ id: FTR, nome: "Travessa do multidirecional (cabeça e cunha)", descricao: "Tubo Ø48,3 com uma cabeça de encaixe (48 × 72 × 50, fenda de 9,3 que abraça o disco) e uma cunha de 140 mm em cada ponta; comprimento nominal = eixo a eixo dos postes. Linha estribo: pinça + chaveta.",
      origem: "no eixo do poste A, no plano da roseta; +X até o poste B.", parametros: [P("Comprimento", "comprimento", 2.14, "Dimensões", "Nominal = distância entre eixos dos postes", "instancia")],
      tipos: tipos(FTR, "comprimentosNominaisPEMAX", "Travessa", "n", "Comprimento"), massa: MASSA[FTR], quantDesc: "Travessa do multidirecional" });
    def({ id: FTU, nome: "Travessa em U (referência)", descricao: "Perfil em U 49 × 53 × 2,5 com abas retornadas e as mesmas cabeças da travessa tubular. Só existe na linha de referência (fonte S01): a do locador (M02) não tem — fica como referência, não é usada pelo gerador.",
      origem: "como a travessa.", parametros: [P("Comprimento", "comprimento", 2.14, "Dimensões", "Nominal = distância entre eixos dos postes", "instancia")],
      tipos: [T("padrao", "Travessa em U 2,14 m", {}, FONTE)], massa: MASSA[FTU], quantDesc: "Travessa em U" });
    var vaos = lista(FTR, "comprimentosNominaisPEMAX"), dcs = lista(FDI, "comprimentosCatalogoPEMAX");
    def({ id: FDI, nome: "Diagonal do multidirecional (cabeças articuladas)", descricao: "Tubo Ø48,3 achatado nas pontas, cabeça articulada por pino a 77,5 mm do eixo do poste e cunha de 140 mm; corre num plano afastado do eixo dos postes (Lado ±1). Comprimento geométrico = raiz((vão − 155)² + altura²).",
      origem: "no eixo do poste de baixo, no plano da roseta; +X até o poste de cima.", parametros: [P("Comprimento", "comprimento", 2.14, "Dimensões", "A peça do catálogo (só massa)", "instancia"), P("Vao", "comprimento", 0.8, "Dimensões", "Distância entre os eixos dos postes", "instancia"), P("Altura", "comprimento", 2.0, "Dimensões", "Diferença de nível entre as rosetas (levante)", "instancia"), P("Lado", "numero", 1, "Construção", "+1 ou −1: para que lado de Z a diagonal corre", "instancia")],
      tipos: vaos.map(function (vo, i) { var c = Math.round(dcs[i]) / 1000, m = Math.round(vo) / 1000; return T("d" + String(c).replace(".", "_"), "Diagonal " + String(c).replace(".", ",") + " m (vão " + String(m).replace(".", ",") + " × 2,00)", { Comprimento: c, Vao: m, Altura: 2.0 }, FONTE); }),
      massa: MASSA[FDI], quantDesc: "Diagonal do multidirecional" });
    def({ id: FPI, nome: "Piso metálico perfurado do multidirecional", descricao: "Chapa de aço dobrada em caixa (tampo de 0,32 perfurado antiderrapante, paredes de 76, aba retornada), garras de 35 mm nas pontas e trinco vermelho. A furação é textura, não geometria.",
      origem: "no eixo do poste A, no meio da largura; o topo do tampo em Y = 0.", parametros: [P("Comprimento", "comprimento", 2.14, "Dimensões", "Nominal = distância entre eixos dos postes", "instancia"), P("Largura", "comprimento", 0.32, "Dimensões", "0,32 (padrão) / 0,30 / 0,20", "instancia")],
      tipos: tipos(FPI, "comprimentosCatalogoPEMAX", "Piso", "p", "Comprimento", { Largura: mm(FPI, "largura") }), massa: MASSA[FPI], quantDesc: "Piso metálico" });
    def({ id: FAL, nome: "Piso com alçapão e escada", descricao: "Piso de aço com abertura de 710 mm coberta por tampa articulada de alumínio e escada inclinada incorporada (7 degraus de 20 × 20 a cada 280, largura 300). `Escotilha` inicio/fim alterna o lado por nível.",
      origem: "como o piso.", parametros: [P("Comprimento", "comprimento", 2.48, "Dimensões", "Nominal = distância entre eixos dos postes", "instancia"), P("Largura", "comprimento", mm(FAL, "larguraTotalLayher"), "Dimensões", "A largura útil do módulo", "instancia"), P("Escotilha", "texto", "inicio", "Construção", "inicio | fim: em que ponta fica a abertura", "instancia"), P("Desnivel", "comprimento", 2.0, "Dimensões", "Altura até o piso de baixo (inclinação da escada)", "instancia")],
      tipos: [T("padrao", "Alçapão 2,48 m", {}, FONTE)], massa: MASSA[FAL], quantDesc: "Piso com alçapão e escada" });
    def({ id: FRO, nome: "Rodapé metálico de encaixe", descricao: "Chapa perfilada de 0,8 mm com duas reentrâncias trapezoidais, capas pretas nas pontas e garra de 35 × 60 que abraça o tubo (sem abraçadeira).",
      origem: "no eixo do poste A, no pé da chapa (Y = 0); o perfil sai para +Z.", parametros: [P("Comprimento", "comprimento", 2.14, "Dimensões", "Nominal = distância entre eixos dos postes", "instancia"), P("Altura", "comprimento", mm(FRO, "alturaPEMAX"), "Dimensões", "0,20 (catálogo do locador) ou 0,15 (mínimo da NR-18)", "instancia")],
      tipos: tipos(FRO, "comprimentosCatalogoPEMAX", "Rodapé", "r", "Comprimento"), massa: MASSA[FRO], quantDesc: "Rodapé metálico" });
    def({ id: FPB, nome: "Peça base (tubo de início)", descricao: "Tubo curto de 235 mm com a 1ª roseta a 65 mm da base e luva Ø57 de 80 mm em cima que recebe o poste. Linha estribo: laços no lugar da roseta.",
      origem: "na face de baixo, no eixo.", parametros: [], tipos: [T("padrao", "Peça base 0,235 m", {}, FONTE)], massa: MASSA[FPB], quantDesc: "Peça base" });
    def({ id: FBR, nome: "Base regulável do multidirecional", descricao: "Placa 150 × 150 × 8 de cantos chanfrados e 4 furos oblongos, haste tubular Ø38 de rosca 8,1 (150 mm lisos em cima) e porca borboleta de duas asas; versão articulada com rótula.",
      origem: "no centro da face de baixo da placa.", parametros: [P("Altura_rosca", "comprimento", 0.10, "Dimensões", "Altura da face de baixo da porca borboleta acima da placa", "instancia"), P("Altura_total", "comprimento", mm(FBR, "PEMAX_comprimento"), "Dimensões", "Altura da haste (catálogo: 0,50 m)", "instancia"), P("Articulada", "simnao", false, "Construção", "Base articulada (piso inclinado): rótula sob a haste", "instancia")],
      tipos: [T("padrao", "Regulável 0,50 m", {}, FONTE)], massa: MASSA[FBR], quantDesc: "Base regulável" });
    def({ id: FGA, nome: "Gancho de ancoragem com olhal e chumbador", descricao: "Tubo Ø48,3 de 0,25 ou 0,50 m preso ao poste, com braço de barra Ø18 dobrado a 90° que atravessa o parafuso olhal; chumbador mecânico Ø15,9 × 70 na parede (a abraçadeira fixa é outra peça).",
      origem: "no eixo do poste, no plano da roseta; o tubo sai para +X, ao lado do poste; a parede está em x = Afastamento.", parametros: [P("Comprimento", "comprimento", 0.25, "Dimensões", "0,25 ou 0,50 m (catálogo)", "instancia"), P("Afastamento", "comprimento", 0.15, "Dimensões", "Distância do eixo do poste à parede", "instancia")],
      tipos: [T("c025", "Gancho 0,25 m", { Comprimento: 0.25 }, FONTE), T("c050", "Gancho 0,50 m", { Comprimento: 0.5, Afastamento: 0.4 }, FONTE)], massa: MASSA[FGA], quantDesc: "Gancho de ancoragem" });
    def({ id: FPT, nome: "Pino trava do espigão", descricao: "Grampo de arame Ø9 dobrado em J (60 × 94 mm montado, ~250 mm desenvolvidos) que atravessa os furos Ø13 do espigão e do soquete; um em toda união de postes.",
      origem: "no furo do espigão; a perna reta atravessa em X.", parametros: [], tipos: [T("padrao", "Pino trava", {}, FONTE)], massa: MASSA[FPT], quantDesc: "Pino trava" });
    def({ id: FEN, nome: "Nó do estribo (4 laços)", descricao: "Trecho de poste Ø48,2 com 4 laços retangulares de faixa de aço de 2,5 mm (32 × 41, saindo 38 do tubo) a 90°, cada um com o rasgo da chaveta.",
      origem: "na ponta de baixo do trecho, no eixo; o nó no meio.", parametros: [P("Comprimento", "comprimento", 0.3, "Dimensões", "Comprimento do trecho de poste mostrado", "instancia")],
      tipos: [T("padrao", "Nó do estribo", {}, FONTE)], massa: MASSA[FEN], quantDesc: "Nó do estribo" });
    def({ id: FPC, nome: "Pinça e chaveta do estribo", descricao: "Ponta da travessa do estribo: caixa em U com pinça de 30 que entra no laço e chaveta cônica (120 × 11 × 4) com contrapeso na base.",
      origem: "no eixo do poste; a pinça entra no laço em +X.", parametros: [], tipos: [T("padrao", "Pinça e chaveta", {}, FONTE)], massa: MASSA[FPC], quantDesc: "Pinça e chaveta" });
  } catch (eDef) { LISTA.length = 0; }

  /* ------------------------------------------------ AVALIAÇÃO (gancho `completar` do js/familia.js) */
  function completar(fam, tipo, inst, saida) {
    var id = fam.andaime || fam.id, g = GER[id];
    if (!g || !Mob || !Kit || !Dados) { saida.ok = false; saida.erros = (saida.erros || []).concat(["o gerador de andaime \"" + id + "\" não carregou"]); return saida; }
    var v = {}, vals = saida.valores || {};
    Object.keys(vals).forEach(function (n) { v[n] = vals[n]; });
    v.Linha = v.Linha === "estribo" ? "estribo" : "roseta";
    v.Escotilha = v.Escotilha === "fim" ? "fim" : "inicio";
    var c = Mob.cena(), k = new Kit(c);
    try { g(k, v); } catch (e) { saida.ok = false; saida.erros = (saida.erros || []).concat(["andaime \"" + fam.nome + "\": " + e.message]); return saida; }
    saida.solidos = c.solidos(id.replace(/^ra-/, "") + ":");
    saida.caixa = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: c.env.z0, x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    saida.mob = { triangulos: c.triangulos(), pecas: saida.solidos.length };
    saida.nivelDetalhe = nivelDe(v);
    saida.partesMoveis = []; saida.errosPartes = [];
    var ms = MASSA[id];
    saida.massa = num(v.Massa_kg, 0) > 0 ? v.Massa_kg : (ms ? Math.round(ms(v) * 1000) / 1000 : 0);
    if (SIMB[id]) { try { saida.simboloPlanta = SIMB[id](v); } catch (eS) { /* sem símbolo: a planta usa a malha */ } }
    return saida;
  }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function registrarNoRA() {
    var RA = global.FamiliasRA || dep("FamiliasRA", "familiasra.js");
    if (RA && RA.registrar && LISTA.length) RA.registrar(clonar(LISTA));
  }

  /* ------------------------------------------------ A FURAÇÃO DO PISO: textura de recorte (só no navegador) + UV plano
     Passo e diâmetro do JSON: grade escalonada — fileiras alternadas (a segunda deslocada meio passo na largura). O recorte (alphaMap + alphaTest)
     vara a chapa de verdade: dá para ver o chão através do tampo, sem um único triângulo a mais. A repetição: 1 passo em Z e 2 passos em X. */
  function perfuracao() { return { passoX: mm(FPI, "perfuracaoPassoNoComprimento"), passoZ: mm(FPI, "perfuracaoPassoNaLargura"), diametro: mm(FPI, "perfuracaoDiametroDoFuro") }; }
  function uvPerfurado(pos) {   /* u = z / passoZ ; v = x / (2 · passoX) — a malha local do piso, antes da matriz da instância */
    var p = perfuracao(), uv = [], i;
    for (i = 0; i + 2 < pos.length; i += 3) uv.push(pos[i + 2] / p.passoZ, pos[i] / (2 * p.passoX));
    return uv;
  }
  function texturaPerfurada(THREE) {
    var doc = global.document; if (!doc || !THREE) return null;
    var p = perfuracao(), S = 10, w = Math.round(p.passoZ * 1000 * S), h = Math.round(2 * p.passoX * 1000 * S), cv = doc.createElement("canvas"), cx;
    cv.width = w; cv.height = h; cx = cv.getContext("2d"); if (!cx) return null;
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#000";
    var r = p.diametro / 2 * 1000 * S;
    [[w / 2, h / 4], [0, 3 * h / 4], [w, 3 * h / 4]].forEach(function (c) { cx.beginPath(); cx.arc(c[0], c[1], r, 0, TAU); cx.fill(); });
    var t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  function materialPerfurado(THREE, mat) { var t = texturaPerfurada(THREE); if (t && mat) { mat.alphaMap = t; mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; mat.needsUpdate = true; } return mat; }

  /* ------------------------------------------------ MINIATURA (ícone; só no navegador) */
  var _mini = {};
  function corDe(m) { var p = PBR[String(m).toLowerCase()]; if (!p) return "#9a9a9a"; return "#" + ("000000" + p.cor.toString(16)).slice(-6); }
  function miniatura(famId, tipoId, tam) {
    var F = global.Familia, f = null, i;
    for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
    if (!f || !F || !Mob || !global.document) return "";
    var tp = tipoId || (f.tipos[0] || {}).id, kk = famId + "|" + tp + "|" + (tam || 96);
    if (_mini[kk] != null) return _mini[kk];
    var av = F.avaliar(f, tp, {});
    _mini[kk] = av && av.ok ? Mob.miniatura(av.solidos, tam || 96, corDe) : "";
    return _mini[kk];
  }

  registrarNoRA();
  var FamiliasAndaimeM = {
    IDS: LISTA.map(function (f) { return f.id; }), PBR: PBR, MAT: MAT, lista: function () { return clonar(LISTA); },
    completar: completar, miniatura: miniatura, cota: cota, _dados: function () { return Dados; },
    /* o motor (js/andaimemulti.js) usa estas três para posicionar: a origem do poste fica a (passo − r0) acima da ponta da barra do motor */
    r0: function (linha) { return linha === "estribo" ? mm(FEN, "espacamentoVerticalDosNos") : mm(FPO, "distanciaPrimeiraRosetaAtePontaInferior"); },
    yEixo: yEixo, nosPoste: nosPoste, geomDiag: geomDiag, perfuracao: perfuracao, uvPerfurado: uvPerfurado, texturaPerfurada: texturaPerfurada, materialPerfurado: materialPerfurado, MATERIAL_PERFURADO: MAT.PERF,
    avaliar: function (famId, valores, tipoId) {
      var F = global.Familia || dep("Familia", "familia.js"), f = null, i;
      for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
      if (!f || !F) return null;
      return F.avaliar(f, tipoId || (f.tipos[0] || {}).id, valores || {});
    }
  };
  global.FamiliasAndaimeM = FamiliasAndaimeM;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasAndaimeM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

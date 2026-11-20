/* =====================================================================
 * woodframedetalhes.js — DETALHES TÍPICOS DO WOOD FRAME (fase 2A, 20/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 * Folhas de detalhe das pranchas de Wood Frame (js/woodframepranchas.js), no padrão RA (v2.0, visual do TQS, carimbo intocado). Cada detalhe é desenhado a partir
 * do TIPO DE PAREDE REAL do modelo (camadas e espessuras do tipo, parâmetros do quadro: montante, espaçamento, OSB, canto), nunca de um desenho solto:
 *   · os detalhes em PLANTA (canto L, encontro T, junta de OSB, esquadria) cortam o quadro REAL gerado pelo próprio motor (WoodFrameQuadro.planta) em duas paredes
 *     sintéticas com o mesmo tipo e a mesma união (BimArq.juntas) que o modelador usa;
 *   · os detalhes em CORTE (base e topo com verga) usam as camadas do tipo (WoodFrameQuadro.posCamadas) e a verga da tabela do motor (vergaDe).
 *   WoodFrameDetalhes.defs(estado, paineis, opcoes) → { defs: [[chave, fn(ctx), título], …], avisos, info }
 *   info.rastro = [{ detalhe, camada, e_mm, pap_mm, esc }] — a espessura de CADA camada desenhada (o teste confere pap_mm = e_mm × escala)
 * ESCALA 1:2 em todos os detalhes (a profundidade do quadro é de 89 mm: em 1:5 a camada de 10 mm viraria um traço de 2 mm). Cotas dos detalhes em MILÍMETROS.
 * ESQUEMA (nada inventado): posição do rufo, afastamentos, perfil da esquadria, hold-down, chumbador e a ligação com o telhado/forro são desenhados como ESQUEMA e
 * dizem na própria folha que modelo, diâmetro e capacidade ficam para o cálculo e para o fornecedor. A folga da junta de OSB (3 mm) é o critério usual da indústria
 * (a confirmar no projeto) e a legenda diz isso.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  var W = dep("WoodFrameQuadro", "./woodframequadro.js");
  function EPm() { return dep("MadEngPranchas", "./madengpranchas.js"); }
  function QQ() { var e = EPm(); return e && e._p; }
  function II() { var q = QQ(); return q && q.I; }
  function WP() { return dep("WoodFramePranchas", "./woodframepranchas.js"); }
  function BA() { return dep("BimArq", "./bimarq.js"); }

  var ESC = 2;                 /* detalhes em 1:2 */
  var S = 1000 / ESC;          /* mm de papel por metro */
  var HACH = { osb: [1.0, "MAD-HACHURA"], la: [3.4, "MAD-HACHURA"], cimenticia: [2.0, "MAD-HACHURA"], vapor: [0, null], gesso: [0, null], ripa: [0, null], solido: [0, null], imper: [0, null], membrana: [0, null] };

  /* ================================================================== paredes sintéticas (mesmo tipo, mesma união do modelador) */
  function caixa(id, cx, cz, rotY, L, H, tipo) {
    return { id: id, tipo: "parede", b2: 1, cx: cx, cy: H / 2, cz: cz, rotY: rotY, comprimento: L, altura: H, espessura: tipo.espessura, tipoParede: tipo,
      uniao: { ini: null, fim: null, cruz: [], abut: [], juntas: [] }, nivelBase: "wfd" };
  }
  function unir(lista) {
    var B = BA(); if (!B || !B.juntas) throw new Error("BimArq (js/bimarq.js) não carregou: sem a união dos cantos.");
    var J = B.juntas(lista); lista.forEach(function (c) { c.uniao = J[c.id] || c.uniao; c.juntas = c.uniao.juntas; }); return lista;
  }
  var _seq = 0;
  function sintese(modo, tA, tB, H) {
    var k = ++_seq, pi2 = Math.PI / 2, A, B2, lista, vaos = {};
    if (modo === "L") { A = caixa("wfd" + k + "A", 0, 0, 0, 1.2, H, tA); B2 = caixa("wfd" + k + "B", 0.6, 0.6, -pi2, 1.2, H, tB || tA); lista = unir([A, B2]); }
    else if (modo === "T") { A = caixa("wfd" + k + "A", 0, 0, 0, 1.6, H, tA); B2 = caixa("wfd" + k + "B", 0, 0.6, -pi2, 1.2, H, tB || tA); lista = unir([A, B2]); }
    else if (modo === "reta") { A = caixa("wfd" + k + "A", 0, 0, 0, 3.6, H, tA); lista = [A]; }
    else { A = caixa("wfd" + k + "A", 0, 0, 0, 2.4, H, tA); lista = [A]; vaos[A.id] = [{ id: "janela", x0: -0.5, x1: 0.5, y0: 0.9, y1: 2.1 }]; }
    return { A: A, B: B2 || null, vaos: vaos };
  }

  /* ================================================================== desenho de itens de planta (camadas, montantes) com recorte */
  /* o rótulo da camada diz a espessura DESENHADA (a do tipo): o texto gravado no tipo pode estar velho (OSB trocado de 11,1 para 9,5 mm) */
  function rotuloCamada(id, rotulo, e) {
    var I = II();
    if (/^osb/.test(String(id)) && e != null) return "OSB " + I.br(Math.round(e * 10000) / 10, 1) + " mm";
    return rotulo || id;
  }
  function rectDe(pts) { var xs = pts.map(function (p) { return p[0]; }), zs = pts.map(function (p) { return p[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) }; }
  function recorta(r, j) {
    var e = 1e-6, x0 = Math.max(r.x0, j.x0), x1 = Math.min(r.x1, j.x1), z0 = Math.max(r.z0, j.z0), z1 = Math.min(r.z1, j.z1);
    if (x1 - x0 < 1e-5 || z1 - z0 < 1e-5) return null;
    return { x0: x0, x1: x1, z0: z0, z1: z1, cL: r.x0 < j.x0 - e, cR: r.x1 > j.x1 + e, cT: r.z0 < j.z0 - e, cB: r.z1 > j.z1 + e };
  }
  function contorno(D, x0, y0, x1, y1, cam, cL, cT, cR, cB) {
    if (!cT) D.linha(x0, y0, x1, y0, cam); if (!cB) D.linha(x0, y1, x1, y1, cam);
    if (!cL) D.linha(x0, y0, x0, y1, cam); if (!cR) D.linha(x1, y0, x1, y1, cam);
  }
  /* itens = WoodFrameQuadro.planta(...).itens; f = { s, ox, oz, jan, gapOsb:{x,g}, det, rastro, nome } → { camadas: [{id, rotulo, hach, e, ...paper}], studs: [{x0,y0,x1,y1}] } */
  function desenharItens(D, itens, f) {
    var out = { camadas: [], studs: [], linhas: [] };
    function PX(x) { return f.ox + x * f.s; } function PZ(z) { return f.oz + z * f.s; }
    arr(itens).forEach(function (it) {
      if (it.k !== "montante") return;
      var rc = recorta(rectDe(it.pts), f.jan); if (!rc) return;
      out.studs.push({ x0: PX(rc.x0), y0: PZ(rc.z0), x1: PX(rc.x1), y1: PZ(rc.z1), tipo: it.tipo, inteiro: !(rc.cL || rc.cR || rc.cT || rc.cB) });
    });
    var furos = out.studs.map(function (q) { return [q.x0, q.y0, q.x1, q.y1]; });
    arr(itens).forEach(function (it) {
      if (it.k === "linha") {
        var a = it.a, b = it.b, xa = Math.max(Math.min(a[0], b[0]), f.jan.x0), xb = Math.min(Math.max(a[0], b[0]), f.jan.x1), za = Math.max(Math.min(a[1], b[1]), f.jan.z0), zb = Math.min(Math.max(a[1], b[1]), f.jan.z1);
        if (xb - xa >= 0 && zb - za >= 0 && (xb - xa > 1e-5 || zb - za > 1e-5)) { D.linha(PX(xa), PZ(za), PX(xb), PZ(zb), "MAD-PRINCIPAL"); out.linhas.push({ id: it.camada, x: PX(xa), y: PZ(za), x1: PX(xb), y1: PZ(zb) }); }
        return;
      }
      if (it.k !== "camada") return;
      var rc = recorta(rectDe(it.pts), f.jan); if (!rc) return;
      var partes = [rc];
      if (f.gapOsb && /^osb/.test(it.camada)) {
        var g0 = f.gapOsb.x - f.gapOsb.g / 2, g1 = f.gapOsb.x + f.gapOsb.g / 2;
        if (rc.x0 < g0 && rc.x1 > g1) partes = [{ x0: rc.x0, x1: g0, z0: rc.z0, z1: rc.z1, cL: rc.cL, cR: false, cT: rc.cT, cB: rc.cB }, { x0: g1, x1: rc.x1, z0: rc.z0, z1: rc.z1, cL: false, cR: rc.cR, cT: rc.cT, cB: rc.cB }];
      }
      var hc = HACH[it.hach] || HACH.solido;
      partes.forEach(function (p) {
        var x0 = PX(p.x0), y0 = PZ(p.z0), x1 = PX(p.x1), y1 = PZ(p.z1);
        if (hc[0] > 0 && x1 - x0 > 0.4 && y1 - y0 > 0.4) D.hachura(x0, y0, x1 - x0, y1 - y0, hc[0], hc[1], furos);
        contorno(D, x0, y0, x1, y1, it.hach === "la" ? "MAD-FINA" : "MAD-PECA", p.cL, p.cT, p.cR, p.cB);
      });
      out.camadas.push({ id: it.camada, rotulo: it.rotulo, hach: it.hach, e: it.e, x0: PX(rc.x0), x1: PX(rc.x1), y0: PZ(rc.z0), y1: PZ(rc.z1), cL: rc.cL, cR: rc.cR, cT: rc.cT, cB: rc.cB });
      if (f.rastro && it.e != null && (!f.vertical)) f.rastro(it, (rc.z1 - rc.z0) * f.s, (rc.x1 - rc.x0) * f.s);
    });
    out.studs.forEach(function (q) {
      var w = q.x1 - q.x0, h = q.y1 - q.y0;
      if (q.inteiro && w > 2.2 && h > 2.2) D.secaoMadeira(q.x0, q.y0, w, h, { cam: "MAD-CORTE" });
      else contorno(D, q.x0, q.y0, q.x1, q.y1, "MAD-CORTE", false, false, false, false);
    });
    return out;
  }
  /* coluna de legendas das camadas (a de cima para baixo), com linha de chamada até a camada */
  function legendarCamadas(D, camadas, xTexto, alDireita, xAncora, linhas, camDoTipo) {
    var T = D.E.T, h = T.nota, vistos = {}, itens = [];
    arr(linhas).forEach(function (l) {
      if (Math.abs(l.y1 - l.y) > 0.01 || vistos[l.id]) return; vistos[l.id] = 1;
      var k = arr(camDoTipo).filter(function (z) { return z.id === l.id; })[0] || {};
      itens.push({ y: l.y, x: Math.max(l.x, xAncora) + 2.0, t: rotuloCamada(l.id, k.rotulo, k.e) });
    });
    camadas.forEach(function (k) {
      if (vistos[k.id]) return; vistos[k.id] = 1;
      var ya = (k.y0 + k.y1) / 2; itens.push({ y: ya, x: xAncora != null ? xAncora : (alDireita ? k.x1 - 1.0 : k.x0 + 1.0), t: rotuloCamada(k.id, k.rotulo, k.e) });
    });
    itens.sort(function (a, b) { return a.y - b.y; });
    var yy = null;
    itens.forEach(function (it) { var yt = yy == null ? it.y : Math.max(it.y, yy + h * 1.9); it.yt = yt; yy = yt; });
    itens.forEach(function (it) {
      D.texto(xTexto, it.yt, it.t, h, { al: alDireita ? "D" : "E", meio: true });
      var xs = alDireita ? xTexto + 1.0 : xTexto - 1.0;
      D.linha(xs, it.yt, it.x, it.y, "MAD-FINA"); D.ponto(it.x, it.y, 0.4);
    });
  }
  /* linhas de ruptura onde o desenho foi cortado pela janela (a parede continua) */
  function rupturas(D, R) {
    var P = WP(); if (!P || !R.camadas.length) return;
    function ext(fl) { var a = R.camadas.filter(function (k) { return k[fl]; }); if (!a.length) return null; return { x0: Math.min.apply(null, a.map(function (k) { return k.x0; })), x1: Math.max.apply(null, a.map(function (k) { return k.x1; })), y0: Math.min.apply(null, a.map(function (k) { return k.y0; })), y1: Math.max.apply(null, a.map(function (k) { return k.y1; })) }; }
    var e;
    if ((e = ext("cL"))) P._i.tracoRuptura(D, e.x0, e.y0, e.y1, true);
    if ((e = ext("cR"))) P._i.tracoRuptura(D, e.x1, e.y0, e.y1, true);
    if ((e = ext("cB"))) P._i.tracoRuptura(D, e.y1, e.x0, e.x1, false);
    if ((e = ext("cT"))) P._i.tracoRuptura(D, e.y0, e.x0, e.x1, false);
  }
  /* rótulo livre com chamada (usa o localizador do WoodFramePranchas) */
  function rotulo(D, ax, ay, t, area, raio) { var P = WP(); return P ? P._i.rotular(D, ax, ay, t, area, raio || 60) : false; }

  /* ================================================================== D1..D4: detalhes em PLANTA */
  function janela(modo, A, t) { return null; }
  function detPlanta(modo, cel, tA, tB, info, ids) {
    return function (c) {
      var D = c.D, T = D.E.T, I = II(), x = cel.x, y = cel.y, w = cel.w, h = cel.h;
      var Hh = 2.7, sy = sintese(modo, tA, modo === "T" ? tB : tA, Hh), hcut = modo === "esquadria" ? 1.5 : 1.0, tt = tA.espessura, jan, titulo, numD, lateral = 64, extras = [];
      var wf = tA.wf || {}, b = num2(wf.montante, 0, 38) / 1000, dP = num2(wf.montante, 1, 89) / 1000;
      if (modo === "L") { jan = { x0: 0.60 + tt / 2 - 0.40, x1: 0.60 + tt / 2 + 0.03, z0: -tt / 2 - 0.03, z1: 0.30 }; titulo = "CANTO EM L (PLANTA, CORTE A 1,00 m)"; numD = ids[0]; }
      else if (modo === "T") { jan = { x0: -0.22, x1: 0.22, z0: -tt / 2 - 0.03, z1: 0.30 }; titulo = "ENCONTRO EM T (PLANTA, CORTE A 1,00 m)"; numD = ids[1]; }
      else if (modo === "reta") { jan = { x0: -0.80, x1: -0.40, z0: -tt / 2 - 0.03, z1: tt / 2 + 0.05 }; titulo = "JUNTA DO OSB SOBRE O MONTANTE (PLANTA)"; numD = ids[2]; }
      else { jan = { x0: -0.74, x1: -0.30, z0: -tt / 2 - 0.03, z1: tt / 2 + 0.05 }; titulo = "ESQUADRIA COM FITA E SELANTE (PLANTA, CORTE A 1,50 m)"; numD = ids[3]; }
      var th = I.tituloVista(D, x + 1, y + 1, titulo, "ESC. 1:" + ESC + "  -  TIPO: " + String(tA.rotulo || tA.id).toUpperCase(), numD);
      var f = { s: S, ox: x + lateral - jan.x0 * S, oz: y + th + 8 - jan.z0 * S, jan: jan, det: num, vertical: false,
        rastro: function (it, papEsp, papLarg) { info.rastro.push({ detalhe: numD, camada: it.camada, e_mm: Math.round(it.e * 1e4) / 10, pap_mm: Math.round(papEsp * 1000) / 1000, pap_larg_mm: Math.round(papLarg * 1000) / 1000, esc: ESC, modo: modo }); } };
      var pa = W.planta(sy.A, arr(sy.vaos[sy.A.id]).length ? sy.vaos[sy.A.id] : [], hcut), itens = pa ? pa.itens.slice() : [];
      var Rq = W.paraParede(sy.A, arr(sy.vaos[sy.A.id])), osbStud = null;
      if (modo === "reta") {
        /* o montante mais perto da junta de 1,20 m (o motor põe a junta no centro de um montante) */
        var xj = -1.8 + 1.2, melhor = 1e9;
        itens.forEach(function (it) { if (it.k === "montante" && /^montante$/.test(it.tipo)) { var r = rectDe(it.pts), cx = (r.x0 + r.x1) / 2; if (Math.abs(cx - xj) < melhor) { melhor = Math.abs(cx - xj); osbStud = cx; } } });
        if (osbStud != null) f.gapOsb = { x: osbStud, g: 0.003 };
        f.jan = jan = { x0: (osbStud == null ? xj : osbStud) - 0.20, x1: (osbStud == null ? xj : osbStud) + 0.20, z0: jan.z0, z1: jan.z1 };
        f.ox = x + lateral - jan.x0 * S;
      }
      var R = desenharItens(D, itens, f), Rb = null;
      if (sy.B) { var pb = W.planta(sy.B, [], hcut), fB = {}; Object.keys(f).forEach(function (k) { fB[k] = f[k]; }); fB.rastro = null; if (pb) Rb = desenharItens(D, pb.itens, fB); }
      var camA = R.camadas.filter(function (k) { return true; });
      /* legenda das camadas de A, à esquerda */
      var xFig0 = f.ox + jan.x0 * S;
      legendarCamadas(D, camA, xFig0 - 8, true, xFig0 + 2.4, R.linhas, tA.camadas);
      rupturas(D, R); if (Rb) rupturas(D, Rb);
      if (modo === "esquadria") esquadriaPlano(D, f, R, jan, tA, sy, T, x, y, w, h);
      /* cotas: espessura total, quadro e pacote externo (mm) */
      var cams = R.camadas, vistos = {}, niv = [];
      var wp = W.posCamadas(tA.camadas, tt);
      var xd = f.ox + jan.x1 * S + 7;
      var z0p = f.oz + (-tt / 2) * S, z1p = f.oz + (tt / 2) * S, nuc = null; wp.forEach(function (k) { if (k.face === "nucleo") nuc = k; });
      if (modo !== "T" || true) {
        var pts = [[xd, z0p]]; if (nuc) { pts.push([xd, f.oz + nuc.w0 * S]); pts.push([xd, f.oz + nuc.w1 * S]); } pts.push([xd, z1p]);
        var vals = []; for (var q = 0; q + 1 < pts.length; q++) vals.push(fmtMM((pts[q + 1][1] - pts[q][1]) / S));
        if (pts.length > 2) D.cadeia(pts, 6, vals);
        D.cadeia([[xd, z0p], [xd, z1p]], pts.length > 2 ? 17 : 6, [fmtMM(tt)]);
      }
      /* observações próprias de cada detalhe */
      var notas = [];
      if (modo === "L") {
        notas = ["Canto em L: " + (wf.canto === "bloco" ? "2 montantes 38×" + (dP * 1000) + " com bloco espaçador entre eles" : "3 montantes 38×" + (dP * 1000) + " lado a lado") + " na parede que passa; a que encosta leva 1 montante de ponta.", "Arranjo simplificado (canto californiano/em C: fase 2)."];
        legendaStud(D, R, "montante-canto", "montantes de canto", x, y, w, h);
        if (Rb) legendaStud(D, Rb, "montante-extremo", "montante de ponta", x, y, w, h);
      } else if (modo === "T") {
        notas = ["Encontro em T: 2 montantes ladeando a parede que chega, com blocos de pregação a cada " + (num2([wf.espBlocoEncontro], 0, 600)) + " mm (ver a elevação).", "A parede que chega para na face da que passa."];
        legendaStud(D, R, "montante-encontro", "montantes de encontro", x, y, w, h);
        if (Rb) legendaStud(D, Rb, "montante-extremo", "montante de ponta", x, y, w, h);
      } else if (modo === "reta") {
        notas = ["Junta vertical do OSB sempre sobre o EIXO de um montante (módulo " + (num2(wf.osbModulo, 0, 1200)) + " mm a partir da ponta de origem).", "Folga de 3 mm entre as chapas: critério usual, a confirmar no projeto.", "Fixação do OSB: borda a " + (num2([wf.espOsbBorda], 0, 150)) + " mm, campo a " + (num2([wf.espOsbCampo], 0, 300)) + " mm (parâmetros do tipo)."];
        if (osbStud != null) {
          var xs = f.ox + osbStud * S, zo = nuc ? f.oz + (wp.filter(function (k) { return /^osb/.test(k.id); })[0] || { w0: -tt / 2 }).w0 * S : y + 30;
          D.linha(xs, f.oz + (-tt / 2) * S - 9, xs, f.oz + (tt / 2) * S + 4, "MAD-EIXO");
          D.texto(xs, f.oz + (-tt / 2) * S - 10.6, "EIXO DO MONTANTE = JUNTA", T.nota, { al: "C" });
          var osbk = wp.filter(function (k) { return /^osb/.test(k.id); })[0];
          if (osbk) { var zz = f.oz + (osbk.w0 + osbk.w1) / 2 * S; [-1, 1].forEach(function (sg) { var xp = xs + sg * 9.5 * S / 1000; D.linha(xp, zz - 1.6, xp, f.oz + (osbk.w1 + 0.012) * S, "MAD-FERRAGEM"); D.linha(xp - 0.9, zz - 1.6, xp + 0.9, zz - 1.6, "MAD-FERRAGEM"); }); }
        }
      }
      var yn = y + h - 4 - notas.length * 4.6;
      notas.forEach(function (t, k) { var ls = I.quebrar(t, T.nota, w - 6); ls.forEach(function (s2, j) { D.texto(x + 3, yn + (k * 1.0 + j) * 4.4 + 4.6 * 0, s2, T.nota); }); yn += (I.quebrar(t, T.nota, w - 6).length - 1) * 4.4; });
      return {};
    };
  }
  function num2(v, i, d) { var a = Array.isArray(v) ? v : [v]; var n = Number(a[i]); return isFinite(n) && n > 0 ? n : d; }
  function fmtMM(m) { var v = Math.round(m * 10000) / 10; return String(Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : (Math.round(v * 10) / 10)).replace(".", ","); }
  /* legenda de um tipo de montante: chamada para o primeiro montante daquele tipo no corte (o motor guarda o tipo em cada item) */
  function legendaStud(D, R, tipo, texto, x, y, w, h) {
    var q = R.studs.filter(function (s) { return s.tipo === tipo; })[0]; if (!q) return false;
    var area = [x + 4, y + 22, x + w - 4, y + h - 20];
    return rotulo(D, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, texto, area, 70);
  }
  /* esquadria em planta: janela (esquema), espuma, fita e selante — sobre o corte real da parede com o vão */
  function esquadriaPlano(D, f, R, jan, tA, sy, T, x, y, w, h) {
    var wp = W.posCamadas(tA.camadas, tA.espessura), nuc = null, osb = null, mem = null;
    wp.forEach(function (k) { if (k.face === "nucleo") nuc = k; if (/^osb/.test(k.id)) osb = k; if (/^membrana/.test(k.id)) mem = k; });
    var x0 = -0.5, b = num2((tA.wf || {}).montante, 0, 38) / 1000, XP = function (m) { return f.ox + m * S; }, ZP = function (m) { return f.oz + m * S; };
    /* esquadria: perfil esquemático encostado no OSB (lado de fora do quadro), com folga de espuma para o jack */
    var folga = 0.012, perfL = 0.030, perfP = (nuc ? (nuc.w1 - nuc.w0) : 0.089) * 0.55;
    var fx0 = x0 + folga, fx1 = fx0 + perfL, fz1 = osb ? osb.w0 + 0.0 : -0.0301, fz0 = fz1 - 0, fzTop = (nuc ? nuc.w0 : -0.03) + 0.004;
    var zi0 = (nuc ? nuc.w0 : -0.03) + 0.004, zi1 = zi0 + perfP;
    D.ret(XP(fx0), ZP(zi0), perfL * S, perfP * S, "MAD-FERRAGEM"); D.hachura(XP(fx0), ZP(zi0), perfL * S, perfP * S, 1.1, "MAD-FERRAGEM");
    /* espuma entre o jack e a esquadria (pontilhado) */
    var ex0 = XP(x0), ex1 = XP(fx0);
    D.hachura(ex0, ZP(zi0), ex1 - ex0, perfP * S, 0.9, "MAD-HACHURA");
    /* fita de vedação: do plano da membrana, sobre a face externa do OSB, dobra no vão e segue pelo jack até a esquadria */
    var zOut = (mem ? mem.w1 : -0.0412), xFita = x0 - 0.045;
    var pf = [[XP(xFita), ZP(zOut) - 0.4], [XP(x0), ZP(zOut) - 0.4], [XP(x0) + 0.0, ZP(zi0)], [XP(fx0) + 0.6, ZP(zi0)]];
    D.poli(pf, "MAD-PRINCIPAL", false);
    /* selante: cordão na junta esquadria × OSB, pelo lado de fora */
    var xs = XP(fx0), zs = ZP(zi0) - 0.6; D.circ(xs, zs, 1.1, "MAD-PRINCIPAL"); D.ponto(xs, zs, 0.6);
    var area = [XP(jan.x0) + 2, y + 28, XP(jan.x1) - 2, y + h - 12];
    rotulo(D, XP(fx0) + perfL * S / 2, ZP(zi0) + perfP * S / 2, "esquadria (esquema: perfil e folga do fabricante)", [XP(x0) + 4, ZP(zi1) + 2, XP(jan.x1) - 2, y + h - 12], 58);
    rotulo(D, (ex0 + ex1) / 2, ZP(zi0) + perfP * S * 0.5, "espuma expansiva", [XP(x0) + 4, ZP(zi1) + 2, XP(jan.x1) - 2, y + h - 12], 52);
    rotulo(D, xs, zs, "selante", [XP(x0) + 2, y + 24, XP(jan.x1) - 2, ZP(zi0) - 2], 40);
    rotulo(D, XP(xFita + 0.02), ZP(zOut) - 0.4, "fita de vedação sobre o OSB e o jack", [XP(jan.x0) + 2, y + 18, XP(jan.x1) + 30, ZP(zOut) - 6], 46);
    /* ombreiras */
    var ks = R.studs.filter(function (s) { return /ombreira/.test(s.tipo); });
    ks.forEach(function (s, i) { rotulo(D, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, /-rei$/.test(s.tipo) ? "ombreira rei (king)" : "ombreira jack (trimmer)", [XP(jan.x0) + 1, ZP(zi1) + 3, XP(jan.x1) - 1, y + h - 12], 50); });
  }

  /* ================================================================== D5/D6: BASE E TOPO COM VERGA (CORTES) */
  function corteLayers(D, T, tA, cel, info, det, o) {
    /* desenha as camadas do tipo como faixas verticais (x = espessura), do y0m ao y1m (m acima do topo da fundação), e devolve as posições */
    var wp = W.posCamadas(tA.camadas, tA.espessura), XO = o.xo, out = { wp: wp, X: function (wv) { return XO + (wv - wp[0].w0) * S; }, nuc: null };
    wp.forEach(function (k) { if (k.face === "nucleo") out.nuc = k; });
    return out;
  }
  function yp(o, ym) { return o.yF - ym * S; }

  function detBase(cel, tA, info, id) {
    return function (c) {
      var D = c.D, T = D.E.T, I = II(), x = cel.x, y = cel.y, w = cel.w, h = cel.h, wf = tA.wf || {}, b = num2(wf.montante, 0, 38) / 1000;
      var th = I.tituloVista(D, x + 1, y + 1, "BASE: GUIA SOBRE A FUNDAÇÃO, CHUMBADOR E RUFO (CORTE)", "ESC. 1:" + ESC + "  -  TIPO: " + String(tA.rotulo || tA.id).toUpperCase(), id);
      var Hm = 0.34, wp = W.posCamadas(tA.camadas, tA.espessura), nuc = null; wp.forEach(function (k) { if (k.face === "nucleo") nuc = k; });
      var yF = y + th + 42 + Hm * S, xo = x + 10 + 0.03 * S, o = { yF: yF }; function X(wv) { return xo + (wv - wp[0].w0) * S; } function Y(ym) { return yF - ym * S; }
      var wmin = wp[0].w0, wmax = wp[wp.length - 1].w1, gB = 0.038;
      /* fundação */
      var fx0 = X(wmin - 0.03), fx1 = X(wmax + 0.03), fb = 0.16;
      D.hachura(fx0, Y(0), fx1 - fx0, fb * S, 2.4, "MAD-HACHURA");
      D.linha(fx0, Y(0), fx1, Y(0), "MAD-CORTE"); D.linha(fx0, Y(0), fx0, Y(-fb), "MAD-CORTE"); D.linha(fx1, Y(0), fx1, Y(-fb), "MAD-CORTE");
      WP()._i.tracoRuptura(D, Y(-fb), fx0, fx1, false);
      /* camadas (faixas verticais) */
      var base = { "cimenticia": 0.05, "ripa": 0.05, "solido": 0.0, "membrana": 0.0, "vapor": 0.012, "gesso": 0.012, "osb": 0.0, "imper": 0.012, "la": 0.038 };
      var xCam = {};
      wp.forEach(function (k) {
        if (k.face === "nucleo") return;
        var yb = base[k.hach] != null ? base[k.hach] : 0, x0 = X(k.w0), x1 = X(k.w1), hc = HACH[k.hach] || HACH.solido;
        xCam[k.id] = { x0: x0, x1: x1, y0: Y(Hm), y1: Y(yb), k: k };
        if (k.e < 0.001 || k.hach === "membrana" || k.hach === "vapor") { D.linha((x0 + x1) / 2, Y(yb), (x0 + x1) / 2, Y(Hm), "MAD-PRINCIPAL"); info.rastro.push({ detalhe: id, camada: k.id, e_mm: Math.round(k.e * 1e4) / 10, pap_mm: Math.round((x1 - x0) * 1000) / 1000, esc: ESC, modo: "base", linha: true }); return; }
        if (hc[0] > 0) D.hachura(x0, Y(Hm), x1 - x0, (Hm - yb) * S, hc[0], hc[1]);
        contorno(D, x0, Y(Hm), x1, Y(yb), "MAD-PECA", false, true, false, false);
        info.rastro.push({ detalhe: id, camada: k.id, e_mm: Math.round(k.e * 1e4) / 10, pap_mm: Math.round((x1 - x0) * 1000) / 1000, esc: ESC, modo: "base" });
      });
      var cx0 = X(nuc.w0), cx1 = X(nuc.w1), cxm = (cx0 + cx1) / 2;
      /* núcleo entre montantes: lã (hachura); montante ao fundo tracejado */
      D.hachura(cx0, Y(Hm), cx1 - cx0, (Hm - gB) * S, HACH.la[0], "MAD-HACHURA");
      D.linha(cx0, Y(Hm), cx0, Y(gB), "MAD-FINA"); D.linha(cx1, Y(Hm), cx1, Y(gB), "MAD-FINA");
      /* guia inferior (topo de madeira cortado) sobre a membrana de base */
      D.secaoMadeira(cx0, Y(gB), cx1 - cx0, gB * S, { cam: "MAD-CORTE" });
      D.cheio([[cx0 - 1.2, Y(0)], [cx1 + 1.2, Y(0)], [cx1 + 1.2, Y(0) - 0.9], [cx0 - 1.2, Y(0) - 0.9]]);
      /* chumbador: haste da fundação até acima da guia, com arruela e porca */
      D.linha(cxm, Y(gB) - 7.5, cxm, Y(-0.13), "MAD-FERRAGEM");
      D.ret(cxm - 5, Y(gB) - 1.4, 10, 1.4, "MAD-FERRAGEM"); D.ret(cxm - 3.4, Y(gB) - 5.2, 6.8, 3.8, "MAD-FERRAGEM");
      /* rufo de base: chapa que sai de trás da membrana, passa sobre o topo da fundação e pinga para fora (ESQUEMA) */
      var xm = xCam.membrana_hidrofuga ? xCam.membrana_hidrofuga.x0 : X(wmin + 0.03), xRuf = fx0 - 2.2;
      var rufo = [[xm - 0.8, Y(0.14)], [xm - 0.8, Y(0.022)], [xRuf, Y(0.012)], [xRuf, Y(-0.03)]];
      D.poli(rufo, "MAD-PRINCIPAL", false); D.poli([[xm - 1.6, Y(0.14)], [xm - 1.6, Y(0.0235)], [xRuf - 0.8, Y(0.0135)], [xRuf - 0.8, Y(-0.03)]], "MAD-PRINCIPAL", false);
      /* nível e cotas */
      var pts = [[X(wmin), Y(Hm) - 8], [X(nuc.w0), Y(Hm) - 8], [X(nuc.w1), Y(Hm) - 8], [X(wmax), Y(Hm) - 8]], vals = [];
      for (var q = 0; q + 1 < pts.length; q++) vals.push(fmtMM((pts[q + 1][0] - pts[q][0]) / S));
      D.cadeia(pts, 4, vals); D.cadeia([pts[0], pts[3]], 15, [fmtMM(tA.espessura)]);
      D.cadeia([[fx1 + 8, Y(gB)], [fx1 + 8, Y(0)]], -8, [String(Math.round(gB * 1000))]);
      /* legendas à direita */
      var xT = x + 128, its = [];
      function L(ax, ay, t) { its.push({ x: ax, y: ay, t: t }); }
      its.push({ x: X(wmax) - 0.4, y: Y(0.30), t: "gesso acartonado interno" });
      var nomes = {}; wp.forEach(function (k) { nomes[k.id] = k.rotulo || k.id; });
      its = [];
      wp.forEach(function (k) { if (k.face === "nucleo") return; var cx = xCam[k.id]; var ay = Y(0.34 - 0.02 * its.length); its.push({ x: (cx.x0 + cx.x1) / 2, y: Y(0.30 - 0.04 * its.length), t: rotuloCamada(k.id, k.rotulo, k.e) }); });
      its.push({ x: cx1 - 3, y: Y(0.25), t: "lã no núcleo; montante 38×" + Math.round(num2(wf.montante, 1, 89)) + " ao fundo (tracejado)" });
      its.push({ x: cxm + 6, y: Y(gB / 2), t: "guia inferior 38×" + Math.round(num2(wf.montante, 1, 89)) + " sobre a fundação" });
      its.push({ x: cxm - 6, y: Y(0), t: "membrana de base (barreira de umidade) sob a guia" });
      its.push({ x: fx1 - 1, y: Y(0) - 0.0, t: "nível +0,00 = topo da fundação e base da guia" });
      its.push({ x: cxm, y: Y(-0.08), t: "chumbador na fundação (a cada 1,20 m; Ø e classe pelo cálculo)" });
      its.push({ x: xRuf - 0.4, y: Y(0.0), t: "rufo de base com pingadeira (esquema)" });
      its.sort(function (p, q2) { return p.y - q2.y; });
      var yy = null, hT = T.nota;
      its.forEach(function (it) {
        var ls = I.quebrar(it.t, hT, 76), alt = ls.length * hT * 1.3; var yt = yy == null ? it.y - 4 : Math.max(it.y - 4, yy + 2); it.yt = yt; yy = yt + alt;
        ls.forEach(function (s2, j) { D.texto(xT, yt + hT * 0.8 + j * hT * 1.3, s2, hT); });
        var ya = yt + hT * 0.6; D.linha(xT - 1.0, ya, it.x, it.y, "MAD-FINA"); D.ponto(it.x, it.y, 0.4);
      });
      D.texto(x + 3, y + h - 12, "Posição do rufo, afastamentos e perfil: esquema (definir no projeto).", T.nota * 0.92);
      D.texto(x + 3, y + h - 7.6, "Chumbador: diâmetro, classe e passo pelo cálculo (quantitativo: a cada 1,20 m e junto às portas).", T.nota * 0.92);
      return {};
    };
  }

  /* pé do montante de ponta: hold-down (elevação) */
  function detHD(cel, tA, info, id) {
    return function (c) {
      var D = c.D, T = D.E.T, I = II(), x = cel.x, y = cel.y, w = cel.w, h = cel.h, wf = tA.wf || {}, b = num2(wf.montante, 0, 38) / 1000, gB = b;
      var th = I.tituloVista(D, x + 1, y + 1, "PÉ DO MONTANTE DE PONTA: HOLD-DOWN (ELEVAÇÃO)", "ESC. 1:" + ESC + "  -  ESQUEMA: MODELO E CAPACIDADE PELO CÁLCULO", id);
      var Hm = 0.34, yF = y + th + 42 + Hm * S, xo = x + 26;
      function Y(ym) { return yF - ym * S; }
      var larg = 0.10;                              /* um trecho do vão entre montantes (esquema) */
      var xg0 = xo - 4, xg1 = xo + (b + larg) * S + 4;
      D.hachura(xg0 - 6, Y(0), xg1 - xg0 + 12, 0.16 * S, 2.4, "MAD-HACHURA"); D.linha(xg0 - 6, Y(0), xg1 + 6, Y(0), "MAD-CORTE");
      D.linha(xg0 - 6, Y(0), xg0 - 6, Y(-0.16), "MAD-CORTE"); D.linha(xg1 + 6, Y(0), xg1 + 6, Y(-0.16), "MAD-CORTE");
      WP()._i.tracoRuptura(D, Y(-0.16), xg0 - 6, xg1 + 6, false);
      D.cheio([[xg0, Y(0)], [xg1, Y(0)], [xg1, Y(0) - 0.9], [xg0, Y(0) - 0.9]]);
      D.ret(xg0, Y(gB) , xg1 - xg0, gB * S - 0.9, "MAD-PECA");
      D.ret(xo, Y(Hm), b * S, (Hm - gB) * S, "MAD-PECA");
      WP()._i.tracoRuptura(D, Y(Hm), xo, xo + b * S, false);
      var xb = xo + b * S;
      /* hold-down: chapa na face do montante e haste (tirante) até a fundação */
      var hx0 = xo - 5.2, hw = 5.2, hy0 = Y(0.30), hy1 = Y(gB);
      D.ret(hx0, hy0, hw, hy1 - hy0, "MAD-FERRAGEM"); D.hachura(hx0, hy0, hw, hy1 - hy0, 1.2, "MAD-FERRAGEM");
      D.ret(hx0 - 4, hy1 - 1.8, hw + 4, 1.8, "MAD-FERRAGEM");
      var xr = hx0 + hw / 2 - 2; D.linha(xr, hy1, xr, Y(-0.13), "MAD-FERRAGEM");
      [0.22, 0.12].forEach(function (yy2) { D.linha(xo, Y(yy2), xo + b * S, Y(yy2), "MAD-FINA"); });
      /* eixo do montante e cotas */
      D.linha(xo + b * S / 2, Y(Hm) - 4, xo + b * S / 2, Y(0) + 2, "MAD-EIXO");
      D.cadeia([[xo, Y(0.0)], [xo + b * S, Y(0.0)]], -(0.16 * S + 8), [fmtMM(b)], { semExt: false });
      D.cadeia([[xg1 + 12, Y(gB)], [xg1 + 12, Y(0)]], -9, [fmtMM(gB)]);
      var its = [{ x: xo + b * S / 2, y: Y(0.34), t: "montante de ponta 38×" + Math.round(num2(wf.montante, 1, 89)) }, { x: hx0 + hw / 2, y: Y(0.20), t: "hold-down na face do montante (esquema; modelo e capacidade pelo cálculo)" },
        { x: xr, y: Y(-0.08), t: "tirante ancorado na fundação (Ø e comprimento pelo cálculo)" }, { x: (xg0 + xg1) / 2, y: Y(gB / 2), t: "guia inferior sobre a fundação" }];
      its.sort(function (p, q2) { return p.y - q2.y; });
      var xT = x + 118, yy = null, hT = T.nota;
      its.forEach(function (it) { var ls = I.quebrar(it.t, hT, 86), yt = yy == null ? it.y - 4 : Math.max(it.y - 4, yy + 2); yy = yt + ls.length * hT * 1.3; ls.forEach(function (s2, j) { D.texto(xT, yt + hT * 0.8 + j * hT * 1.3, s2, hT); }); D.linha(xT - 1.0, yt + hT * 0.6, it.x, it.y, "MAD-FINA"); D.ponto(it.x, it.y, 0.4); });
      D.texto(x + 3, y + h - 12, "Hold-down nas pontas livres e nos cantos (canto compartilhado conta 0,5 por parede);", T.nota * 0.92);
      D.texto(x + 3, y + h - 7.6, "pé de T não leva (a parede de apoio ancora). Cotas em mm.", T.nota * 0.92);
      return {};
    };
  }

  /* topo: verga, guia superior dupla e ligação com o telhado ou o forro */
  function detTopo(cel, tA, info, id, vao, Hpar, vaoEx) {
    return function (c) {
      var D = c.D, T = D.E.T, I = II(), x = cel.x, y = cel.y, w = cel.w, h = cel.h, wf = tA.wf || {}, b = num2(wf.montante, 0, 38) / 1000, dP = num2(wf.montante, 1, 89) / 1000, gB = b;
      var th = I.tituloVista(D, x + 1, y + 1, "TOPO COM VERGA E LIGAÇÃO AO TELHADO (CORTE)", "ESC. 1:" + ESC + "  -  TIPO: " + String(tA.rotulo || tA.id).toUpperCase(), id);
      var wp = W.posCamadas(tA.camadas, tA.espessura), nuc = null; wp.forEach(function (k) { if (k.face === "nucleo") nuc = k; });
      var vl = vao.x1 - vao.x0, vg = W.vergaDe(vl), vh = vg.secao[1] / 1000, yTopoM = Hpar - 2 * gB, ycrip = Math.max(0.12, yTopoM - (vao.y1 + vh));
      var verga0 = 0.0, yv1 = vh, yc1 = yv1 + Math.min(ycrip, 0.40), yg1 = yc1 + 2 * gB, yTop = yg1 + 0.13;
      var yB = y + th + 44 + (yTop + 0.09) * S, xo = x + 30;      /* yB = nível da face inferior da verga */
      function X(wv) { return xo + (wv - wp[0].w0) * S; } function Y(ym) { return yB - ym * S; }
      var wmin = wp[0].w0, wmax = wp[wp.length - 1].w1, cx0 = X(nuc.w0), cx1 = X(nuc.w1);
      /* camadas externas e internas: contínuas do vão (abaixo) ao topo da guia dupla */
      var yIni = -0.09, yFim = yg1, xCam = {};
      wp.forEach(function (k) {
        if (k.face === "nucleo") return;
        var x0 = X(k.w0), x1 = X(k.w1), hc = HACH[k.hach] || HACH.solido, ytop = (/^osb/.test(k.id) || /gesso/.test(k.id)) ? yFim : yFim - 0.02;
        xCam[k.id] = { x0: x0, x1: x1, k: k };
        if (k.e < 0.001 || k.hach === "membrana" || k.hach === "vapor") { D.linha((x0 + x1) / 2, Y(yIni), (x0 + x1) / 2, Y(ytop), "MAD-PRINCIPAL"); info.rastro.push({ detalhe: id, camada: k.id, e_mm: Math.round(k.e * 1e4) / 10, pap_mm: Math.round((x1 - x0) * 1000) / 1000, esc: ESC, modo: "topo", linha: true }); return; }
        if (hc[0] > 0) D.hachura(x0, Y(ytop), x1 - x0, (ytop - yIni) * S, hc[0], hc[1]);
        contorno(D, x0, Y(ytop), x1, Y(yIni), "MAD-PECA", false, false, false, true);
        D.linha(x0, Y(ytop), x1, Y(ytop), "MAD-PECA");
        info.rastro.push({ detalhe: id, camada: k.id, e_mm: Math.round(k.e * 1e4) / 10, pap_mm: Math.round((x1 - x0) * 1000) / 1000, esc: ESC, modo: "topo" });
      });
      /* verga dupla (cortes de topo), espaçador, cripple (corte longitudinal) e guia superior dupla */
      var xa0 = X(nuc.w0), xa1 = X(nuc.w0 + b), xb0 = X(nuc.w1 - b), xb1 = X(nuc.w1);
      D.secaoMadeira(xa0, Y(yv1), xa1 - xa0, vh * S, { cam: "MAD-CORTE" }); D.secaoMadeira(xb0, Y(yv1), xb1 - xb0, vh * S, { cam: "MAD-CORTE" });
      if (xb0 - xa1 > 0.2) { D.ret(xa1, Y(yv1), xb0 - xa1, vh * S, "MAD-FINA"); D.hachura(xa1, Y(yv1), xb0 - xa1, vh * S, 1.0, "MAD-HACHURA"); }
      D.fibraMadeira(cx0, Y(yc1), cx1 - cx0, (yc1 - yv1) * S, { vertical: true, cam: "MAD-CORTE" });
      D.secaoMadeira(cx0, Y(yc1 + gB), cx1 - cx0, gB * S, { cam: "MAD-CORTE" }); D.secaoMadeira(cx0, Y(yg1), cx1 - cx0, gB * S, { cam: "MAD-CORTE" });
      /* vão abaixo da verga: esquadria (esquema), espuma, fita e selante */
      var ey1 = -0.014, ey0 = -0.056;
      D.ret(cx0 + 2, Y(ey1), cx1 - cx0 - 4, (ey1 - ey0) * S, "MAD-FERRAGEM"); D.hachura(cx0 + 2, Y(ey1), cx1 - cx0 - 4, (ey1 - ey0) * S, 1.1, "MAD-FERRAGEM");
      D.hachura(cx0 + 2, Y(0), cx1 - cx0 - 4, -ey1 * S, 0.9, "MAD-HACHURA");
      var zo = xCam.membrana_hidrofuga ? xCam.membrana_hidrofuga.x1 : cx0;
      D.poli([[zo, Y(0.05)], [zo, Y(0)], [cx0 + 6, Y(0)], [cx0 + 6, Y(ey1)]], "MAD-PRINCIPAL", false);
      D.circ(cx0 + 1.2, Y(ey0) - 0.5, 1.1, "MAD-PRINCIPAL"); D.ponto(cx0 + 1.2, Y(ey0) - 0.5, 0.6);
      /* ligação com o telhado ou o forro: peça de apoio sobre a guia dupla + cantoneira (esquema) */
      var rx0 = cx0 - 1, rx1 = cx1 + 1, ry0 = Y(yg1), ry1 = Y(yg1 + 0.10);
      D.secaoMadeira(rx0, ry1, rx1 - rx0, ry0 - ry1, { cam: "MAD-CORTE" });
      D.poli([[cx1 + 1.5, ry1 + 1], [cx1 + 1.5, ry0 + 8], [cx1 + 7, ry0 + 8]], "MAD-FERRAGEM", false); D.poli([[cx1 + 3.2, ry1 + 1], [cx1 + 3.2, ry0 + 9.6], [cx1 + 7, ry0 + 9.6]], "MAD-FERRAGEM", false);
      /* cotas */
      D.cadeia([[xo - 3 + (wmin - wmin) * S, Y(0)], [xo - 3, Y(yv1)]], 9, [fmtMM(vh)]);
      D.cadeia([[xo - 3, Y(yv1)], [xo - 3, Y(yg1)]], 9, [fmtMM(yg1 - yv1)]);
      D.cadeia([[xo - 3, Y(0)], [xo - 3, Y(yg1)]], 21, [fmtMM(yg1)]);
      var pts = [[X(wmin), Y(yg1 + 0.10) - 7], [X(nuc.w0), Y(yg1 + 0.10) - 7], [X(nuc.w1), Y(yg1 + 0.10) - 7], [X(wmax), Y(yg1 + 0.10) - 7]], vals = [];
      for (var q = 0; q + 1 < pts.length; q++) vals.push(fmtMM((pts[q + 1][0] - pts[q][0]) / S));
      D.cadeia(pts, 4, vals);
      /* legendas */
      var xT = x + 118, its = [
        { x: (xa0 + xa1) / 2, y: Y(vh / 2), t: "verga dupla 2 × " + vg.secao[0] + "×" + vg.secao[1] + " (compra " + vg.compra.replace("x", "×") + "), vão livre " + fmtMM(vl) + " mm" },
        { x: (xa1 + xb0) / 2, y: Y(vh * 0.8), t: "espaçador (OSB/compensado) fecha os " + Math.round(dP * 1000) + " mm" },
        { x: (cx0 + cx1) / 2, y: Y((yv1 + yc1) / 2), t: "cripple sobre a verga" },
        { x: (cx0 + cx1) / 2, y: Y(yc1 + gB * 1.5), t: "guia superior dupla (2 × 38)" },
        { x: (rx0 + rx1) / 2, y: ry1 + (ry0 - ry1) / 2, t: "estrutura do telhado ou do forro (seção pelo projeto do telhado)" },
        { x: cx1 + 6, y: ry0 + 9, t: "cantoneira ou fita de ligação (modelo pelo cálculo)" },
        { x: (cx0 + cx1) / 2, y: Y(ey0 + 0.02), t: "esquadria (esquema), espuma, fita e selante no cabeçote" } ];
      wp.forEach(function (k) { if (k.face === "nucleo") return; if (/^(gesso|osb|cimenticia)/.test(k.id)) its.push({ x: (xCam[k.id].x0 + xCam[k.id].x1) / 2, y: Y(yFim - 0.04 - 0.0 * its.length) - 0, t: rotuloCamada(k.id, k.rotulo, k.e) }); });
      its.sort(function (p, q2) { return p.y - q2.y; });
      var yy = null, hT = T.nota;
      its.forEach(function (it) { var ls = I.quebrar(it.t, hT, 86), yt = yy == null ? it.y - 4 : Math.max(it.y - 4, yy + 2); yy = yt + ls.length * hT * 1.3; ls.forEach(function (s2, j) { D.texto(xT, yt + hT * 0.8 + j * hT * 1.3, s2, hT); }); D.linha(xT - 1.0, yt + hT * 0.6, it.x, it.y, "MAD-FINA"); D.ponto(it.x, it.y, 0.4); });
      if (vaoEx) D.texto(x + 3, y + h - 18, "VÃO DE EXEMPLO (0,90 × 2,10 m) - O TIPO NÃO TEM VÃO NO MODELO", T.nota * 1.1, { cor: "#c00000", peso: 0.07 });
      D.texto(x + 3, y + h - 12, "Verga: pré-dimensionamento (tabela RA, a confirmar no cálculo: NBR 7190-1:2022 e SINAT 005).", T.nota * 0.92);
      D.texto(x + 3, y + h - 7.6, "Ligação ao telhado/forro: esquema; seção da peça e fixador pelo projeto do telhado. Cotas em mm.", T.nota * 0.92);
      return {};
    };
  }

  /* ================================================================== DEFINIÇÃO DAS FOLHAS */
  function ehExterno(t) { return arr(t.camadas).some(function (k) { return /^osb/.test(k.id); }); }
  function defs(estado, paineis, opcoes) {
    var avisos = [], tipos = [], vistos = {}, out = [], info = { rastro: [], tipos: [], detalhes: [] };
    arr(paineis).forEach(function (P) { var t = P.c && P.c.tipoParede; if (t && t.id && !vistos[t.id]) { vistos[t.id] = 1; tipos.push({ t: t, P: P }); } });
    var exts = tipos.filter(function (k) { return ehExterno(k.t); }), ints = tipos.filter(function (k) { return !ehExterno(k.t); });
    if (!exts.length) exts = tipos.slice(0, 1);
    if (exts.length > 3) { avisos.push("Detalhes típicos: " + exts.length + " tipos externos; só os 3 primeiros têm folha de detalhe."); exts = exts.slice(0, 3); }
    exts.forEach(function (ek, idx) {
      var tA = ek.t, tB = (ints[0] && ints[0].t) || tA, sufixo = exts.length > 1 ? " - " + String(tA.rotulo || tA.id).toUpperCase() : "";
      var vao = null, Hpar = 2.7, vaoEx = false;
      arr(paineis).forEach(function (P) { if (!vao && P.c.tipoParede && P.c.tipoParede.id === tA.id && P.res.vaos.length) { vao = P.res.vaos[0]; Hpar = P.res.H; } });
      if (!vao) { vao = { x0: 0, x1: 0.9, y0: 0, y1: 2.1 }; vaoEx = true; info.vaoExemplo = true; avisos.push("Detalhe de topo: o modelo não tem vão nessa parede; usado um vão de exemplo de 0,90 m (porta de 2,10 m)."); }
      info.tipos.push({ id: tA.id, camadas: arr(tA.camadas).map(function (k) { return { id: k.id, e_mm: Math.round(num(k.e, 0) * 1e4) / 10 }; }), vao: { largura: vao.x1 - vao.x0, topo: vao.y1 }, H: Hpar });
      var base = idx * 6, ids = ["D" + (base + 1), "D" + (base + 2), "D" + (base + 3), "D" + (base + 4), "D" + (base + 5), "D" + (base + 6), "D" + (base + 7)];
      function celula(c, col, cols, lin, lins) {
        var a = c.geo.area, ww = (a.w - 2) / cols - 1, fr = lins === 2 ? [0.62, 0.38] : [1], hAll = a.h - 2, hh = hAll * fr[lin] - 1, y0 = a.y + 1; if (lin) y0 += hAll * fr[0];
        return { x: a.x + 1 + col * (ww + 1), y: y0, w: ww, h: hh };
      }
      out.push(["detalhes-planta-" + (idx + 1), function (c) {
        var cels = [celula(c, 0, 2, 0, 2), celula(c, 1, 2, 0, 2), celula(c, 0, 2, 1, 2), celula(c, 1, 2, 1, 2)], D = c.D;
        [["L", 0], ["T", 1], ["reta", 2], ["esquadria", 3]].forEach(function (m, k) {
          var cel = cels[k]; D.ret(cel.x, cel.y, cel.w, cel.h, "MAD-FINA");
          detPlanta(m[0], cel, tA, tB, info, ids)(c);
          info.detalhes.push({ id: ids[k], modo: m[0], tipo: tA.id });
        });
        return { escala: "1:" + ESC };
      }, "DETALHES TÍPICOS 1/2" + sufixo + " - CANTO L, ENCONTRO T, JUNTA DO OSB E ESQUADRIA (PLANTA)"]);
      out.push(["detalhes-corte-" + (idx + 1), function (c) {
        var cels = [celula(c, 0, 3, 0, 1), celula(c, 1, 3, 0, 1), celula(c, 2, 3, 0, 1)], D = c.D;
        cels.forEach(function (cel) { D.ret(cel.x, cel.y, cel.w, cel.h, "MAD-FINA"); });
        detBase(cels[0], tA, info, ids[4])(c); detHD(cels[1], tA, info, ids[5])(c); detTopo(cels[2], tA, info, ids[6], vao, Hpar, vaoEx)(c);
        info.detalhes.push({ id: ids[4], modo: "base", tipo: tA.id }, { id: ids[5], modo: "hold-down", tipo: tA.id }, { id: ids[6], modo: "topo", tipo: tA.id });
        return { escala: "1:" + ESC };
      }, "DETALHES TÍPICOS 2/2" + sufixo + " - BASE (CHUMBADOR, HOLD-DOWN, MEMBRANA E RUFO) E TOPO (VERGA E LIGAÇÃO COM O TELHADO OU O FORRO)"]);
    });
    return { defs: out, avisos: avisos, info: info };
  }

  var WoodFrameDetalhes = { defs: defs, ESC: ESC, _i: { sintese: sintese, desenharItens: desenharItens } };
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameDetalhes; else global.WoodFrameDetalhes = WoodFrameDetalhes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

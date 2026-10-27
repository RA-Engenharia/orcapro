/* =====================================================================
 * arqintextras.js — CADERNO DE INTERIORES, FASE 2b (motor PURO, ES5, sem DOM, Node-testável): os cortes 1:20 da marcenaria, o elétrico, o
 * luminotécnico (com o detalhe 1:10 da sanca), as pedras e as imagens ilustrativas. Chamado por js/arqinteriores.js (montar); o estilo vem de
 * js/arqestilo.js (chave `arquitetura_interiores` do Padrão RA) e o carimbo é o RA, que não passa por aqui.
 *
 *   ArqIntExtras.empacotarCortes(A, cortes, avisos, nome)   agrupa os cortes por folha (até 3 lado a lado em 1:20)
 *   ArqIntExtras.desenharCortes(c, grupo, an, I)            MÓVEIS - CORTES: seção da peça (caixa, prateleiras, gavetas, tampo, rodapé) e a parede ao fundo
 *   ArqIntExtras.eletricoPlanta(c, an, numPR, I)            ELÉTRICO - PLANTA: pontos do modelo, legenda por ALTURA, OBS. padrão, cotas de eixo a eixo
 *   ArqIntExtras.luminotecnico(c, an, I)                    LUMINOTÉCNICO - PLANTA: luminárias, fitas e interruptores em #D61B0A (0,25), legenda por tipo, circuito, cotas
 *                                                            de eixo a eixo e, se o forro tem sanca, o DETALHE 1:10
 *   ArqIntExtras.pedras(c, def)                             folha geral: bancadas de pedra do modelo, cotadas, com o material da família
 *   ArqIntExtras.imagens(c, def, amb, renders)              "00 IMAGENS ILUSTRATIVAS": o espaço reservado (ou o render salvo do ambiente)
 * DE ONDE SAEM OS DADOS (nada é inventado; o que falta sai "informe" em VERMELHO):
 *   · pontos elétricos: ArqModelo.eletricos = as famílias ra-tomada / ra-interruptor (Altura_montagem = do piso ao centro da caixa) e as caixas 4x2/4x4
 *     das instalações (js/biminst.js, sistema "eletrica") que não coincidem com um dispositivo;
 *   · luminárias: ArqModelo.luminarias = as famílias de categoria "luminaria" (ra-luminaria, ra-ilum-*: plafon, spot, pendente, fita, arandela…), com
 *     Comando, Circuito e Circuito_quadro da instância (js/eletilum.js grava Comando e Circuito_quadro); interruptores com Comandos;
 *   · sanca: estado.sancas (js/bimforrodrywall.js): recuo e profundidade;
 *   · pedras: o parâmetro de material do tampo (Tampo / Material_tampo) da família, ou o material do sólido de pedra.
 * Teste: tools/test-arqinteriores.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function ARQI() { return dep("ArqInteriores", "./arqinteriores.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function dois(k) { return ("0" + k).slice(-2); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  var VERMELHO = "#c00000";
  var KC = 50;                        /* 1:20 = 50 mm por metro */

  /* ------------------------------------------------------------ CORTES 1:20 */
  function chaveNum(m, rx) { var r = null; Object.keys(m.valores || {}).forEach(function (k) { if (r == null && rx.test(k) && typeof m.valores[k] === "number" && m.valores[k] > 0) r = { k: k, v: m.valores[k] }; }); return r; }
  /* a nota do corte: a do móvel (material por parâmetro) + a espessura da chapa e do tampo, se a família traz; senão "informe" em vermelho */
  function linhasNotaCorte(m, I) {
    var S = ES(), ls = ARQI().linhasNota(m).filter(function (l) { return !/informe/.test(l.t) || l.cor !== VERMELHO || /material/.test(l.t); });
    var chapa = chaveNum(m, /^(espessura_chapa|chapa|espessura_corpo|espessura_mdf)$/i), tampo = chaveNum(m, /^(espessura_tampo)$/i) || ((m.valores && typeof m.valores.Tampo === "number" && m.valores.Tampo > 0 && m.valores.Tampo < 0.2) ? { k: "Tampo", v: m.valores.Tampo } : null);
    var falta = ls.filter(function (l) { return l.cor === VERMELHO && /fabricante|ferragem/.test(l.t); });
    ls = ls.filter(function (l) { return !(l.cor === VERMELHO && /fabricante|ferragem/.test(l.t)); });
    if (tampo) ls.push({ t: "tampo esp.: " + S.numeroCota(tampo.v) });
    if (chapa) ls.push({ t: "chapa esp.: " + S.numeroCota(chapa.v) }); else ls.push({ t: "chapa esp.: informe", cor: VERMELHO });
    return ls.concat(falta);
  }
  function piecasDoCorte(ct) {
    var out = [];
    arr(ct.its || [ct.it]).forEach(function (it) { it.pecas.forEach(function (q) { if (q.u0 <= ct.u + 1e-6 && q.u1 >= ct.u - 1e-6 && q.s0 != null && q.y1 - q.y0 > 0.004) { q.item = it; out.push(q); } }); });
    return out;
  }
  function medirCorte(ct, I) {
    var S = ES(), pcs = piecasDoCorte(ct), Dp = 0, h = S.TEXTOS.nota_de_material;
    pcs.forEach(function (q) { Dp = Math.max(Dp, q.s1); });
    Dp = Math.max(Dp, 0.1);
    var notas = arr(ct.its || [ct.it]).map(function (it) { var ls0 = I.quebrarNota(linhasNotaCorte(it.m, I), h), w0 = 0; ls0.forEach(function (l) { w0 = Math.max(w0, S.largTexto(l.t, h)); }); return { it: it, ls: ls0, w: w0 }; }), w = 0, ls = notas[0].ls;
    notas.forEach(function (n) { w = Math.max(w, n.w); });
    var entre = S.entreCadeias(20) + 3, tF = (ct.v.tFundo || 0) * KC, cotaW = S.afastamento1() + entre + 6;
    var wN = w + 3;
    return { Dp: Dp, ls: ls, notas: notas, wN: wN, tF: tF, cotaW: cotaW, entre: entre, pcs: pcs, w: wN + cotaW + Dp * KC + tF + 6, h: 14 + ct.v.H * KC + 2 + S.afastamento1() + 4.5 + entre + 5 };
  }
  function empacotarCortes(A, cortes, avisos, nome) {
    var grupos = [], atual = null;
    cortes.forEach(function (ct) {
      ct._med = medirCorte(ct, ARQI()._int);
      if (ct._med.w > A.w - 2 || ct._med.h > A.h) avisos.push(nome + ": o corte " + ct.letra + " não cabe em 1:20 na folha A3: conferir o pé-direito e a profundidade");
      if (atual && atual.length < 3 && atual.reduce(function (s, x) { return s + x._med.w; }, 0) + ct._med.w + 6 * atual.length <= A.w) atual.push(ct); else { atual = [ct]; grupos.push(atual); }
    });
    return grupos;
  }
  function desenharCortes(c, grupo, an, I) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), A = c.A, avisos = [], x = A.x + 4, y = A.y + 2;
    d.escalaCota(D, 20);
    grupo.forEach(function (ct, ci) {
      var med = ct._med, v = ct.v, H = v.H, k = KC;
      var Xw = x + med.wN + med.cotaW + med.Dp * k, Ypiso = y + 14 + H * k, Ytop = Ypiso - H * k;
      function XS(s) { return Xw - s * k; }
      function YP(yy) { return Ypiso - yy * k; }
      S.titulo(D, x, y, dois(ci + 1), "CORTE " + ct.letra, "1:20");
      if (med.tF > 0) {
        var P = [[Xw, Ytop], [Xw + med.tF, Ytop], [Xw + med.tF, Ypiso], [Xw, Ypiso]];
        d.fundoPol(D, P, "#bdbdbd"); G.hachuraLinhas(P, 1.6, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA"); });
        D.poli(P, "ARQ-PAREDE", true);
      }
      var xa = XS(med.Dp) - 6, xb = Xw + med.tF;
      D.linha(xa, Ypiso, xb, Ypiso, "ARQ-PAREDE"); D.linha(xa, Ytop, xb, Ytop, "ARQ-PAREDE");
      if (!med.tF) D.linha(Xw, Ytop, Xw, Ypiso, "ARQ-PAREDE");
      /* as peças cortadas pelo plano: seção cinza, 0,09 (tampo: 0,30) */
      var ys = [0, H], ss = [0, med.Dp];
      med.pcs.slice().sort(function (a, b) { return b.s1 - a.s1; }).forEach(function (q) {
        var y0 = Math.max(0, q.y0), y1 = Math.min(H, q.y1), s0 = Math.max(0, q.s0), s1 = q.s1;
        if (y1 <= y0 || s1 <= s0) return;
        var R = [[XS(s1), YP(y1)], [XS(s0), YP(y1)], [XS(s0), YP(y0)], [XS(s1), YP(y0)]];
        d.fundoPol(D, R, "#d9d9d9"); D.poli(R, q.tampo ? "ARQ-BATENTE" : "ARQ-FINA", true);
        ys.push(y0, y1); ss.push(s0, s1);
      });
      /* cotas verticais (todas as alturas internas) e a total */
      function prune(vs, min, fim) { var o = []; vs.slice().sort(function (a, b) { return a - b; }).forEach(function (q) { if (!o.length || q - o[o.length - 1] >= min) o.push(q); else if (q === fim) { o.pop(); o.push(q); } }); return o; }
      var ny = prune(ys, 3.4 / k, H), a1 = S.afastamento1(), off1 = a1;
      if (ny.length >= 2) {
        var Pv = ny.map(function (q) { return [XS(med.Dp), YP(q)]; }), vv = []; for (var i = 0; i + 1 < ny.length; i++) vv.push(d.cotaTxt(ny[i + 1] - ny[i]));
        D.cadeia(Pv, off1, vv, { offs: [off1 + 3, off1 + 6] });
        if (ny.length > 2) D.cadeia([[XS(med.Dp), YP(0)], [XS(med.Dp), YP(H)]], off1 + med.entre, [d.cotaTxt(H)], { semExt: true, offs: [off1 + med.entre + 3] });
      }
      /* cotas horizontais: a profundidade e as espessuras (da frente para a parede) */
      var ns = prune(ss, 2.0 / k, med.Dp).reverse(), Ph = ns.map(function (q) { return [XS(q), Ypiso]; }), vh = []; for (var j = 0; j + 1 < ns.length; j++) vh.push(d.cotaTxt(ns[j] - ns[j + 1]));
      if (ns.length >= 2) {
        var ofh = -(a1 + 4.5);   /* mais longe do piso: o texto de um trecho estreito sobe acima da linha e não pode tocar o piso */
        if (ns.length > 2) D.cadeia([[XS(med.Dp), Ypiso], [XS(0), Ypiso]], ofh - med.entre, [d.cotaTxt(med.Dp)], { semExt: true, offs: [ofh - med.entre - 3] });
        D.cadeia(Ph, ofh, vh, { offs: [ofh + 2, ofh + 3.5] });
      }
      /* a nota de material, à esquerda, apontando para o corpo da peça (a peça mais alta da frente) */
      var usados = [], bl = ES().NOTA_MATERIAL;
      med.notas.slice().sort(function (a, b) { return Math.max.apply(null, b.it.pecas.map(function (q) { return q.y1; })) - Math.max.apply(null, a.it.pecas.map(function (q) { return q.y1; })); }).forEach(function (n) {
        var seus = med.pcs.filter(function (q) { return q.item === n.it; });
        var frente = seus.filter(function (q) { return q.s1 >= n.it.prof - 0.03; }).sort(function (a, b) { return (b.y1 - b.y0) - (a.y1 - a.y0); })[0] || seus.sort(function (a, b) { return (b.y1 - b.y0) - (a.y1 - a.y0); })[0];
        if (!frente) { avisos.push("o corte " + ct.letra + " não achou a peça " + n.it.m.nome + " no plano de corte"); return; }
        var lo = YP(Math.min(H, frente.y1)) + 1, hi = YP(Math.max(0, frente.y0)) - 1, cima = bl.baseline_acima_da_linha_mm + (n.ls.length - 1) * bl.entrelinha_mm + 2.4, py = (lo + hi) / 2;
        usados.forEach(function (u) { if (py - cima < u.py + 0.5 && py + 0.6 > u.py - u.cima) py = u.py + 0.5 + cima + 1.2; });
        usados.push({ py: py, cima: cima });
        S.notaMaterial(D, XS(frente.s1) + 0.8, py, x, n.ls);
      });
      x += med.w + 6;
    });
    return { escala: "1:20", avisos: avisos };
  }

  /* ------------------------------------------------------------ LEGENDA POR SÍMBOLO (o quadro do padrão, com o símbolo no lugar da amostra) */
  function legenda(D, x, y, titulo, linhas, wMin) {
    var S = ES(), Lg = S.LEGENDAS.demolir_construir, hT = Lg.linha_titulo, hL = Lg.linha, hl = S.TEXTOS.legenda, ts = S.espacado(titulo), w = Math.max(wMin || Lg.largura, S.largTexto(ts, S.TEXTOS.legenda_titulo) + 8);
    linhas.forEach(function (l) { w = Math.max(w, Lg.texto_x + S.largTexto(S.maiusc(l.t), hl) + 4); });
    var H = hT + linhas.length * hL;
    D.ret(x, y, w, H, "ARQ-QUADRO");
    D.texto(x + w / 2, y + hT / 2, ts, S.TEXTOS.legenda_titulo, { al: "C", meio: true });
    D.linha(x, y + hT, x + w, y + hT, "ARQ-QUADRO-DIV");
    linhas.forEach(function (l, i) {
      var y0 = y + hT + i * hL;
      if (i) D.linha(x, y0, x + w, y0, "ARQ-QUADRO-DIV");
      if (l.simbolo) l.simbolo(D, x + Lg.amostra_da_borda + Lg.amostra_w / 2, y0 + hL / 2);
      D.texto(x + Lg.texto_x, y0 + hL / 2, S.maiusc(l.t), hl, { meio: true, cor: l.cor });
    });
    return { w: w, h: H };
  }
  function obsPadrao(D, x, y, w) {
    var S = ES(), h = S.TEXTOS.obs, yy = y;
    S.OBS_PADRAO.forEach(function (o) { S.quebrar(S.maiusc(o), h, w).forEach(function (s) { D.texto(x, yy + h * 0.76, s, h); yy += h * 1.45; }); yy += 0.8; });
    return yy - y;
  }
  function alturaObs(w) { var S = ES(), h = S.TEXTOS.obs, t = 0; S.OBS_PADRAO.forEach(function (o) { t += S.quebrar(S.maiusc(o), h, w).length * h * 1.45 + 0.8; }); return t; }

  /* a posição do ponto no desenho: sobre a face de dentro da parede a que ele está encostado (o símbolo não some no poché) */
  function posNaFace(v, p, k, M) {
    var ed = v.ed, sd = 1.9 / k;
    return M.P(ed.A[0] + ed.r[0] * (p.u + ed.uMin) + ed.nIn[0] * sd, ed.A[1] + ed.r[1] * (p.u + ed.uMin) + ed.nIn[1] * sd);
  }
  function moveisContexto(D, d, M, an, amb) { an.moveis.forEach(function (m) { D.poli(d.polyPapel(M, m.pts), "ARQ-CONTEXTO", true); }); }
  var NOME_TIPO = { tomada: "TOMADA", interruptor: "INTERRUPTOR", caixa: "CAIXA", dispositivo: "PONTO" };

  /* ------------------------------------------------------------ ELÉTRICO - PLANTA */
  function eletricoPlanta(c, an, numPR, I) {
    var D = c.D, d = DS(), S = ES(), avisos = [], Lg = S.LEGENDAS.demolir_construir, amb = an.amb;
    var nLin = an.alturasEle.length + (an.semAltura ? 1 : 0), hLeg = Lg.linha_titulo + Math.max(1, nLin) * Lg.linha;
    var ctx = I.baseDaPlanta(c, an, { numero: "01", nome: "ELÉTRICO - PLANTA BAIXA", topo: 14, esq: 14, baixo: hLeg + 14 });
    ctx.amb = amb; var M = ctx.M, k = ctx.k; avisos = avisos.concat(ctx.avisos);
    moveisContexto(D, d, M, an, amb);
    /* os pontos do modelo, um símbolo por altura (triângulo; a variante diz a altura) */
    var porAresta = {}; an.vistasEle.forEach(function (v) { v.pontos.forEach(function (p) { porAresta[p.e.id] = { v: v, p: p }; }); });
    an.eletricos.forEach(function (e) {
      var ar = porAresta[e.id], P = ar ? posNaFace(ar.v, ar.p, k, M) : M.P(e.x, e.z), vr = I.varianteAltura(an, e.alt);
      d.fundoPol(D, [[P[0] - 1.6, P[1] + 1.2], [P[0] + 1.6, P[1] + 1.2], [P[0], P[1] - 1.6]], "#fff");
      I.simboloPonto(D, P[0], P[1], vr, e.alt == null ? "ARQ-LIDER" : "ARQ-SIMBOLO", 1.6);
    });
    /* cotas de posição de eixo a eixo, em cada parede com ponto */
    an.vistasEle.forEach(function (v) { I.cadeiaParede(c, M, k, v, [0, v.L].concat(v.pontos.map(function (p) { return p.u; })), 9); });
    an.vistasEle.forEach(function (v) { I.marcadorA ? I.marcadorA(c, ctx, v, numPR(v), avisos) : null; });
    var yb = M.oy + M.alt + 10;
    d.escalaGrafica(D, c.A.x + 6, yb + 4, k, k * 5 >= 12 ? 5 : 10);
    d.norte(D, c.A.x + 82, yb + 2, c.dados.terreno ? c.dados.terreno.norte : 0, 6);
    /* a legenda: uma linha por ALTURA usada */
    var linhas = an.alturasEle.map(function (h, i) {
      var tipos = []; an.eletricos.forEach(function (e) { if (e.alt != null && Math.round(e.alt * 100) / 100 === h && tipos.indexOf(NOME_TIPO[e.tipo] || "PONTO") < 0) tipos.push(NOME_TIPO[e.tipo] || "PONTO"); });
      return { t: tipos.join(" / ") + " - ALTURA " + S.numeroCota(h) + " m", simbolo: function (DD, cx, cy) { I.simboloPonto(DD, cx, cy, i % 4, "ARQ-SIMBOLO", 1.8); } };
    });
    if (an.semAltura) linhas.push({ t: "ALTURA: informe", cor: VERMELHO, simbolo: function (DD, cx, cy) { I.simboloPonto(DD, cx, cy, 0, "ARQ-LIDER", 1.8); } });
    var yL = c.A.y + c.A.h - hLeg - 2, lg = legenda(D, c.A.x + 4, yL, "LEGENDA PONTOS ELÉTRICOS", linhas, 0);
    obsPadrao(D, c.A.x + 4 + lg.w + 8, yL, c.A.w - lg.w - 16);
    return { escala: "1:" + ctx.es.escala, avisos: avisos, legenda: linhas.map(function (l) { return l.t; }) };
  }

  /* ------------------------------------------------------------ LUMINOTÉCNICO - PLANTA */
  function simboloLuz(D, x, y, kind, s, cam) {
    cam = cam || "ARQ-LUMINARIA";
    if (kind === "spot_embutir" || kind === "spot_dirigivel") { D.circ(x, y, 1.4 * s, cam); D.circ(x, y, 0.45 * s, cam); }
    else if (kind === "pendente" || kind === "lustre") { D.circ(x, y, 2.4 * s, cam); D.circ(x, y, 1.2 * s, cam); }
    else if (kind === "arandela") { D.ret(x - 1.8 * s, y - 0.9 * s, 3.6 * s, 1.8 * s, cam); }
    else { D.circ(x, y, 2.2 * s, cam); D.linha(x - 2.2 * s, y, x + 2.2 * s, y, cam); D.linha(x, y - 2.2 * s, x, y + 2.2 * s, cam); }
  }
  function rotuloTipo(l) { return (txt(l.nomeFam) + (l.nomeTipo ? " - " + l.nomeTipo : "")).trim() || txt(l.nome); }
  function detalheSanca(c, an, I, x, y) {
    var D = c.D, d = DS(), S = ES(), forros = arr(c.dados.forros).filter(function (f) { return String(f.ambienteId) === String(an.amb.id); }), sa = null;
    arr(c.dados.sancas).forEach(function (q) { if (!sa && forros.some(function (f) { return String(f.id) === String(q.forro); }) && q.recuo > 0 && q.profundidade > 0) sa = q; });
    if (!sa) return null;
    var k = 100, rec = sa.recuo * k, pf = sa.profundidade * k, W = rec + 40, y0 = y + 20;
    d.escalaCota(D, 10);
    S.titulo(D, x, y, "02", "DETALHE SANCA", "1:10");
    /* o perfil: da parede, a faixa da sanca (acima), a testeira e a chapa central; o fundo da laje em cima */
    var xP = x + 14, yF = y0 + pf + 12;                       /* yF = a face de baixo da chapa central */
    D.linha(xP, yF - pf - 8, xP + W, yF - pf - 8, "ARQ-PAREDE");        /* a laje */
    D.linha(xP, yF - pf - 8, xP, yF + 6, "ARQ-PAREDE");                 /* a parede */
    D.poli([[xP, yF - pf], [xP + rec, yF - pf], [xP + rec, yF], [xP + W, yF]], "ARQ-BATENTE", false);
    if (sa.luz) D.linha(xP + 1.5, yF - pf - 1.2, xP + rec - 1.5, yF - pf - 1.2, "ARQ-LUMINARIA");
    d.escalaCota(D, 10);
    D.cota(xP, yF + 5, xP + rec, yF + 5, 0, d.cotaTxt(sa.recuo), { desde: [false, false], semExt: true });
    D.cadeia([[xP + rec, yF - pf], [xP + rec, yF]], -(6), [d.cotaTxt(sa.profundidade)], { semExt: true });
    if (sa.luz) D.texto(xP + rec + 2, yF - pf - 2.5, "FITA DE LED", S.TEXTOS.nota_de_material, { cor: S.CORES.luminotecnico });
    return { w: W + 30, h: pf + 40, sanca: sa };
  }
  function luminotecnico(c, an, I) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), avisos = [], Lg = S.LEGENDAS.demolir_construir, amb = an.amb, M, k;
    var tipos = [], chv = {};
    an.luzes.forEach(function (l) { var kk = txt(l.famId) + "|" + txt(l.tipoId); if (!chv[kk]) { chv[kk] = { l: l }; tipos.push(chv[kk]); } });
    var inter = an.eletricos.filter(function (e) { return e.tipo === "interruptor"; });
    var nLin = tipos.length + (inter.length ? 1 : 0), hLeg = Lg.linha_titulo + Math.max(1, nLin) * Lg.linha;
    var temSanca = arr(c.dados.sancas).length > 0 && arr(c.dados.forros).some(function (f) { return String(f.ambienteId) === String(amb.id); });
    var ctx = I.baseDaPlanta(c, an, { numero: "01", nome: "LUMINOTÉCNICO - PLANTA BAIXA", topo: 14, esq: 14, baixo: Math.max(hLeg, temSanca ? 60 : 0) + 14 });
    ctx.amb = amb; M = ctx.M; k = ctx.k; avisos = avisos.concat(ctx.avisos);
    moveisContexto(D, d, M, an, amb);
    var bb = amb.bbox || G.bbox(amb.pts), xs = [], zs = [];
    /* luminárias: o símbolo do tipo, a fita com o comprimento do modelo, a letra do circuito junto do ponto */
    an.luzes.forEach(function (l) {
      var P = M.P(l.x, l.z);
      if (l.kind === "fita" && l.comprimento > 0) {
        var a = M.P(l.x, l.z), b = M.P(l.x + Math.cos(l.rotY) * l.comprimento, l.z - Math.sin(l.rotY) * l.comprimento);   /* a fita corre em +X local a partir da origem (js/familiasluz.js) */
        D.linha(a[0], a[1], b[0], b[1], "ARQ-LUMINARIA");
      } else { if (l.kind === "fita") avisos.push("a fita " + l.id + " não traz o comprimento no modelo: desenhada como ponto"); simboloLuz(D, P[0], P[1], l.kind, 1, "ARQ-LUMINARIA"); }
      xs.push(l.x); zs.push(l.z);
      var rot = txt(l.circuito || l.comando).trim();
      if (rot) {
        var h = S.TEXTOS.obs, w = S.largTexto(S.maiusc(rot), h), cs = [[3.4, -1.0], [-3.4 - w, -1.0], [3.4, 4.2], [-3.4 - w, 4.2], [3.4, -4.2], [-3.4 - w, -4.2]], ok = false;
        for (var i = 0; i < cs.length && !ok; i++) { var q = [[P[0] + cs[i][0], P[1] + cs[i][1] - h * 0.76], [P[0] + cs[i][0] + w, P[1] + cs[i][1] - h * 0.76], [P[0] + cs[i][0] + w, P[1] + cs[i][1] + h * 0.18], [P[0] + cs[i][0], P[1] + cs[i][1] + h * 0.18]]; if (D.livreQ(q, 0.3)) { D.texto(P[0] + cs[i][0], P[1] + cs[i][1], S.maiusc(rot), h); ok = true; } }
        if (!ok) avisos.push("sem lugar livre para a letra do circuito de " + l.id);
      }
    });
    /* interruptores: a bolinha cheia na face da parede e a letra do comando */
    var posInt = [];
    inter.forEach(function (e) {
      var P = M.P(e.x, e.z); d.fundoPol(D, [[P[0] - 1.4, P[1] - 1.4], [P[0] + 1.4, P[1] - 1.4], [P[0] + 1.4, P[1] + 1.4], [P[0] - 1.4, P[1] + 1.4]], "#fff");
      D.circ(P[0], P[1], 1.3, "ARQ-LUMINARIA"); D.ponto(P[0], P[1], 0.7, S.CORES.luminotecnico);
      var rot = txt(e.comandos).trim();
      if (rot) { var h = S.TEXTOS.obs, w = S.largTexto(S.maiusc(rot), h); var okI = false; [[2.2, -1.5], [-2.2 - w, -1.5], [2.2, 4.5], [-2.2 - w, 4.5], [2.2, -5.5], [-2.2 - w, -5.5]].forEach(function (o) { if (okI) return; var q = [[P[0] + o[0], P[1] + o[1] - h * 0.76], [P[0] + o[0] + w, P[1] + o[1] - h * 0.76], [P[0] + o[0] + w, P[1] + o[1] + h * 0.18], [P[0] + o[0], P[1] + o[1] + h * 0.18]]; if (D.livreQ(q, 0.3)) { D.texto(P[0] + o[0], P[1] + o[1], S.maiusc(rot), h); okI = true; } }); if (!okI) avisos.push("sem lugar livre para o comando do interruptor " + e.id); }
      posInt.push(e);
    });
    /* cotas de eixo a eixo: em cima (x das luminárias) e à esquerda (z) */
    function unicos(vs) { var o = []; vs.slice().sort(function (a, b) { return a - b; }).forEach(function (q) { if (!o.length || q - o[o.length - 1] > 0.02) o.push(q); }); return o; }
    var ux = unicos([bb[0]].concat(xs).concat([bb[2]])), uz = unicos([bb[1]].concat(zs).concat([bb[3]]));
    function podar(P0) { var o = [P0[0]]; for (var i = 1; i < P0.length; i++) { if (P0[i] - o[o.length - 1] >= 2.6 / k || i === P0.length - 1) { if (P0[i] - o[o.length - 1] < 2.6 / k && o.length > 1) o.pop(); o.push(P0[i]); } } return o; }
    d.escalaCota(D, ctx.es.escala);
    var px = podar(ux), pz = podar(uz), mg = ctx.W ? 0 : 0;
    if (px.length >= 3) { var pp = px.map(function (u) { return M.P(u, bb[1]); }), vv = []; for (var i2 = 0; i2 + 1 < px.length; i2++) vv.push(d.cotaTxt(px[i2 + 1] - px[i2])); D.cadeia(pp, I.JANELA_M * k + 5, vv, { offs: [I.JANELA_M * k + 8, I.JANELA_M * k + 11] }); }
    if (pz.length >= 3) { var pq = pz.map(function (u) { return M.P(bb[0], u); }), vz = []; for (var i3 = 0; i3 + 1 < pz.length; i3++) vz.push(d.cotaTxt(pz[i3 + 1] - pz[i3])); D.cadeia(pq, -(I.JANELA_M * k + 5), vz, { offs: [-(I.JANELA_M * k + 8), -(I.JANELA_M * k + 11)] }); }
    void mg;
    var yb = M.oy + M.alt + 10;
    d.escalaGrafica(D, c.A.x + 6, yb + 4, k, k * 5 >= 12 ? 5 : 10);
    d.norte(D, c.A.x + 82, yb + 2, c.dados.terreno ? c.dados.terreno.norte : 0, 6);
    /* a legenda: uma linha por tipo de luminária (e o interruptor) */
    var linhas = tipos.map(function (t) { return { t: rotuloTipo(t.l), simbolo: function (DD, cx, cy) { simboloLuz(DD, cx, cy, t.l.kind, 1, "ARQ-LUMINARIA"); } }; });
    if (inter.length) linhas.push({ t: "INTERRUPTOR (LETRA = COMANDO)", simbolo: function (DD, cx, cy) { DD.circ(cx, cy, 1.3, "ARQ-LUMINARIA"); DD.ponto(cx, cy, 0.7, S.CORES.luminotecnico); } });
    var yL = c.A.y + c.A.h - hLeg - 2, lg = legenda(D, c.A.x + 4, yL, "LEGENDA LUMINOTÉCNICA", linhas, 0);
    var det = null;
    if (temSanca) det = detalheSanca(c, an, I, c.A.x + c.A.w - 115, c.A.y + c.A.h - 62);
    return { escala: "1:" + ctx.es.escala, avisos: avisos, legenda: linhas.map(function (l) { return l.t; }), detalhe: det ? { recuo: det.sanca.recuo, profundidade: det.sanca.profundidade } : null, circuitos: an.luzes.map(function (l) { return txt(l.circuito || l.comando); }) };
  }

  /* ------------------------------------------------------------ PEDRAS (folha geral) */
  var RE_PAR_PEDRA = /^(tampo|material_tampo|pedra|material_pedra|soleira|peitoril)$/i;
  function itensPedra(dados) {
    var I = ARQI()._int, out = [], amb = arr(dados.ambientes);
    arr(dados.moveis).forEach(function (m) {
      if (!I.VIVO[m.status]) return;
      var pcsPedra = arr(m.pecas).filter(function (q) { return I.RE_TAMPO.test(txt(q.mat)); });
      var nomePar = null; arr(m.parMat).forEach(function (k) { if (!nomePar && RE_PAR_PEDRA.test(k)) nomePar = k; });
      var ehBanc = /bancada/i.test(txt(m.famId));
      if (!pcsPedra.length && !nomePar && !ehBanc) return;
      var mat = nomePar ? txt((m.inst && m.inst[nomePar] != null && txt(m.inst[nomePar]) !== "") ? m.inst[nomePar] : (m.valores || {})[nomePar]).trim() : "";
      if (!mat && pcsPedra.length) mat = txt(pcsPedra[0].mat).trim();
      var base = pcsPedra.slice().sort(function (a, b) { return ((b.x1 - b.x0) * (b.z1 - b.z0)) - ((a.x1 - a.x0) * (a.z1 - a.z0)); })[0] || null, cl = m.caixaLocal;
      var L = base ? base.x1 - base.x0 : (cl ? cl.x1 - cl.x0 : null), Pf = base ? base.z1 - base.z0 : (cl ? cl.z1 - cl.z0 : null);
      var esp = chaveNum(m, /^(espessura_tampo)$/i) || ((m.valores && typeof m.valores.Tampo === "number" && m.valores.Tampo > 0 && m.valores.Tampo < 0.2) ? { v: m.valores.Tampo } : null);
      var cubaP = arr(m.pecas).filter(function (q) { return /inox|cuba/i.test(txt(q.mat)) && (q.x1 - q.x0) > 0.25 && (q.z1 - q.z0) > 0.25; })[0] || null;
      var cuba = (m.valores && m.valores.Com_cuba === true) || !!cubaP;
      var a = null; amb.forEach(function (q) { if (!a && q.pav === m.pav && dentroPol(q.pts, m.x, m.z)) a = q; });
      out.push({ m: m, material: mat, L: L, Pf: Pf, esp: esp ? esp.v : null, cuba: cuba, cubaPeca: cubaP, base: base, ambiente: a ? a.nome : "" });
    });
    return out;
  }
  function dentroPol(P, x, z) { return GEO().pontoEmPol([x, z], P); }
  function descricaoPedra(it) { return "BANCADA EM " + (it.material ? ES().maiusc(it.material) : "INFORME") + (it.cuba ? " COM CUBA DE EMBUTIR" : ""); }
  function pedras(c, def) {
    var D = c.D, d = DS(), S = ES(), A = c.A, itens = itensPedra(c.dados), avisos = [];
    if (!itens.length) return { vazia: true, itens: [], avisos: [] };
    S.titulo(D, A.x + 4, A.y + 2, "01", "PEDRAS - BANCADAS", "1:20");
    d.escalaCota(D, 20);
    var k = KC, colW = (A.w - 8) / 2, x0 = A.x + 4, y0 = A.y + 18, yy = y0, col = 0, maxH = 0, linhaH = 0, desenhados = [];
    itens.forEach(function (it) {
      var Lm = it.L || 1, Pm = it.Pf || 0.6, w = Lm * k + 18, h = Pm * k + 38;
      if (w > colW && col === 0) { /* largura de uma coluna só */ }
      if (col === 1 && (col * colW + w) > A.w - 4) { col = 0; yy += linhaH + 4; linhaH = 0; }
      if (col === 0 && w > colW) { if (linhaH) { yy += linhaH + 4; linhaH = 0; } }
      if (yy + h > A.y + A.h - 4) { avisos.push("a bancada " + it.m.nome + " (" + it.ambiente + ") não coube na folha de pedras"); return; }
      var x = x0 + col * colW, ox = x + 6, oy = yy + 8;
      D.texto(x, yy + 2.6, S.maiusc((it.ambiente ? it.ambiente + " - " : "") + txt(it.m.nome).replace(/\s*\([^)]*\)/g, "")), S.TEXTOS.nota_de_material);
      /* a pegada do tampo (0,30), a cuba em tracejado quando o modelo tem, e as cotas */
      var R = [[ox, oy], [ox + Lm * k, oy], [ox + Lm * k, oy + Pm * k], [ox, oy + Pm * k]];
      D.poli(R, "ARQ-BATENTE", true);
      if (it.cubaPeca) {
        var cp = it.cubaPeca, cx0 = ox + (cp.x0 - (it.base ? it.base.x0 : (it.m.caixaLocal ? it.m.caixaLocal.x0 : 0))) * k, cz0 = oy + (cp.z0 - (it.base ? it.base.z0 : (it.m.caixaLocal ? it.m.caixaLocal.z0 : 0))) * k;
        D.poli([[cx0, cz0], [cx0 + (cp.x1 - cp.x0) * k, cz0], [cx0 + (cp.x1 - cp.x0) * k, cz0 + (cp.z1 - cp.z0) * k], [cx0, cz0 + (cp.z1 - cp.z0) * k]], "ARQ-OCULTA", true);
      }
      if (it.L) D.cota(R[3][0], R[3][1], R[2][0], R[2][1], -5, d.cotaTxt(Lm), { semExt: false });
      if (it.Pf) D.cadeia([R[1], R[2]], -5, [d.cotaTxt(Pm)], { semExt: false, offs: [-8] });
      var yD = oy + Pm * k + 14, esp = it.esp != null ? { t: "ESP.: " + S.numeroCota(it.esp) } : { t: "ESP.: INFORME", cor: VERMELHO };
      D.texto(ox, yD, esp.t, S.TEXTOS.nota_de_material, { cor: esp.cor });
      D.texto(ox, yD + 4.4, descricaoPedra(it), S.TEXTOS.nota_de_material, { cor: it.material ? undefined : VERMELHO });
      desenhados.push({ amb: it.ambiente, nome: it.m.nome, material: it.material || "informe", texto: descricaoPedra(it) });
      linhaH = Math.max(linhaH, h); maxH = Math.max(maxH, h);
      if (w > colW) { col = 0; yy += linhaH + 4; linhaH = 0; } else { col = 1 - col; if (col === 0) { yy += linhaH + 4; linhaH = 0; } }
    });
    if (!itens.some(function (it) { return it.material; })) avisos.push("nenhuma bancada traz o material da pedra no modelo: 'informe' em todas");
    avisos.push("soleiras e peitoris de pedra: o modelo não traz material para eles (os vãos só têm a altura do peitoril): não listados");
    return { escala: "1:20", avisos: avisos, itens: desenhados };
  }

  /* ------------------------------------------------------------ 00 IMAGENS ILUSTRATIVAS */
  function imagens(c, def, amb, renders) {
    var D = c.D, S = ES(), A = c.A, src = renders && renders[amb.id] ? txt(renders[amb.id]) : "";
    S.titulo(D, A.x + 4, A.y + 2, "00", "IMAGENS ILUSTRATIVAS", "SEM ESCALA");
    var x = A.x + 4, y = A.y + 20, w = A.w - 8, h = A.h - 28;
    D.ret(x, y, w, h, "ARQ-QUADRO");
    if (src) D.add('<image href="' + src.replace(/"/g, "&quot;") + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" preserveAspectRatio="xMidYMid meet"/>');
    else D.texto(x + w / 2, y + h / 2, S.maiusc("inserir renders do ambiente"), S.TEXTOS.titulo_nome, { al: "C", meio: true, cor: S.CORES.texto_secundario });
    return { render: !!src };
  }

  var ArqIntExtras = { VERSAO: 1, empacotarCortes: empacotarCortes, desenharCortes: desenharCortes, eletricoPlanta: eletricoPlanta, luminotecnico: luminotecnico, pedras: pedras, imagens: imagens, itensPedra: itensPedra, descricaoPedra: descricaoPedra, linhasNotaCorte: linhasNotaCorte, piecasDoCorte: piecasDoCorte };
  global.ArqIntExtras = ArqIntExtras;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqIntExtras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

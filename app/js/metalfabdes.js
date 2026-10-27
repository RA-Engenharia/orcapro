/* =====================================================================
 * metalfabdes.js — METÁLICA: AS FOLHAS DE FABRICAÇÃO no Padrão RA
 * (motor PURO, ES5, sem DOM, Node-testável). Cada folha é um SVG em mm de
 * papel (A3 paisagem) com a moldura e o CARIMBO RA do js/prancha.js; o
 * js/svgpdf.js transforma qualquer lista delas num PDF vetorial.
 *
 *   folhasFabricacao(estado, op)  UMA FOLHA POR MARCA (perfil, chapa, chapa
 *        dobrada, peça mecânica) e uma por CONJUNTO soldado:
 *        · vista da peça na escala (o comprimento do perfil é INTERROMPIDO
 *          entre os grupos de furos quando não cabe — cota em verdadeira
 *          grandeza), faces planificadas (alma, mesas) com a furação COTADA
 *          A PARTIR DA PONTA (cota acumulada, origem com círculo) e o
 *          gabarito (y) de cada face; seção transversal;
 *        · corte inclinado (ângulo na alma/aba), chanfros da chapa;
 *        · chapa dobrada: a seção dobrada + a PLANIFICAÇÃO com as linhas de
 *          dobra (posição, ângulo, sentido, raio) e o fator K;
 *        · solda pelo símbolo AWS A2.4 (js/acopranchas.js DP.solda) quando a
 *          peça é soldada em outra;
 *        · LISTA DE MATERIAL da marca, furação, notas, carimbo RA.
 *   folhasCorte(plano, op)     o plano de corte das barras (js/metalcorte.js).
 *   folhasNesting(res, op)     o arranjo das chapas (js/metalcorte.js).
 *   pdf(folhas, titulo)        → Uint8Array (js/svgpdf.js).
 *
 * PADRÃO RA (OneDrive "Padrao RA - Detalhamento Estrutural",
 * estrutura_metalica): penas pelas camadas MET-* → layers EST-* (o mesmo
 * estilo() do js/acopranchas.js, lido do js/padraodet.js); cotas em mm sem
 * casas; letra nunca abaixo da mínima do padrão (2,1 mm); chapa "# t x b x
 * c"; vermelho só em pendência; carimbo RA intocado.
 * Teste: node tools/test-metal-desenho.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function F() { return dep("BimMetalFab", "./metalfab.js"); }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function NN() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function PL() { return dep("BimMetalPlanif", "./metalplanif.js"); }
  function SP() { return dep("SvgPdf", "./svgpdf.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) {
    c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    var p = s.split("."); return (neg && !/^0(\.0*)?$/.test(s) ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  function mmTxt(v) { return String(Math.round(num(v, 0))); }      /* cota: mm sem casas, sem separador (Padrão RA metálica) */
  function dois(k) { return ("0" + k).slice(-2); }
  function n3(v) { return String(Math.round(v * 1000) / 1000); }
  var ESCALAS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500];
  function escalaQueCabe(dims, espacos) {
    for (var i = 0; i < ESCALAS.length; i++) { var e = ESCALAS[i], ok = true; for (var k = 0; k < dims.length; k++) if (dims[k] / e > espacos[k]) ok = false; if (ok) return e; }
    return ESCALAS[ESCALAS.length - 1];
  }
  var NOMES_FACE = { v: "ALMA", o: "MESA SUPERIOR", u: "MESA INFERIOR", h: "FACE h" };
  function nomeFace(p, f) { if (p.perfil && p.perfil.forma === "L") return f === "v" ? "ABA v" : "ABA u"; if (p.perfil && (p.perfil.forma === "tubo-ret")) return "FACE " + f; return NOMES_FACE[f] || ("FACE " + f); }
  function chapaTxt(t, B, L) { var A = AP(), e = A && A.espChapa ? A.espChapa(t) : br(t, 1); return "# " + e + (B != null ? " x " + mmTxt(B) : "") + (L != null ? " x " + mmTxt(L) : ""); }
  function perfilTxt(nome) {
    var s = txt(nome), m = /^(W|HP|C|S|M)(\d+)X(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) return m[1].toUpperCase() + " " + m[2] + " x " + br(+m[3], 1);
    var l = /^L(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/i.exec(s); if (l) return "L " + l[1] + " x " + l[2] + " x " + l[3].replace(".", ",");
    /* barra redonda do catálogo ("BR 1/2\" (D 12,70 mm) Gerdau"): bitola + diâmetro, sem o fabricante — o nome inteiro não cabe na
       coluna DESCRIÇÃO e encostava no AÇO (#49 e: as correntes do galpão passaram a ser do catálogo) */
    var rb = /^BR ([0-9./]+)"? \(D ([0-9]+,[0-9]+) mm\)/i.exec(s); if (rb) return "BR " + rb[1] + "\" Ø" + rb[2];
    return s;
  }

  /* ================================================================ A FOLHA (moldura + carimbo RA) */
  function montar(defs, op) {
    op = op || {};
    var A = AP(), P = PR(), avisos = [];
    if (!A || !A.Desenho || !P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Os motores de desenho (js/acopranchas.js, js/prancha.js) não carregaram."] };
    var E = A.estilo(op.padrao), formato = P.FORMATOS && P.FORMATOS[op.formato] ? op.formato : "A3", geo = P.geometria(formato, "paisagem", "RA");
    var feitas = defs.map(function (def) {
      var D = new A.Desenho(E, op.depurar ? [] : null), r = {};
      try { r = def.desenhar(D, geo, E) || {}; } catch (e) { avisos.push((def.titulo || def.id) + ": " + (e && e.message ? e.message : e)); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: A.VERMELHO }); }
      return { def: def, D: D, escala: r.escala || "INDICADA" };
    });
    var codigo = txt(op.codigo).trim() || "FAB-MET", rev = (txt(op.revisao).trim() || "R00").toUpperCase(), data = txt(op.data).trim() || hoje();
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "metalfab", nome: "Fabricação - estrutura metálica", formato: formato, orientacao: "paisagem", origem: "metalica",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra),
                 proprietario: txt(op.proprietario), contratante: txt(op.contratante), local: txt(op.local), codigo: codigo, data: data,
                 revisoes: [[revNum, txt(op.descricaoRevisao) || "EMISSÃO INICIAL - FABRICAÇÃO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var tot = feitas.length;
    var folhas = feitas.map(function (f, i) {
      var D = f.D, W = geo.papel.w, H = geo.papel.h, Mo = geo.moldura, Fd = new A.Desenho(E, null);
      Fd.ret(Mo.x, Mo.y, Mo.w, Mo.h, "MET-MOLDURA");
      Fd.linha(geo.coluna.x, Mo.y, geo.coluna.x, geo.carimbo.y, "MET-MOLDURA");
      A.carimbo(Fd, pr, pr.folhas[i], geo, empObj, op.logo || null, dois(i + 1) + "/" + dois(tot));
      var numero = codigo + "-" + dois(i + 1);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n3(W) + 'mm" height="' + n3(H) + 'mm" viewBox="0 0 ' + n3(W) + " " + n3(H) + '" font-family="' + A.FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + n3(W) + '" height="' + n3(H) + '" fill="#fff"/>' +
        '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + "</svg>";
      var o = { id: f.def.id, marca: f.def.marca || "", numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg };
      if (op.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, geo: geo, estilo: E };
  }
  function hoje() { var d = new Date(); return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear(); }

  /* ================================================================ A COLUNA DA DIREITA (acima do carimbo) */
  function Coluna(D, geo) { this.D = D; this.x = geo.coluna.x + 3; this.w = geo.coluna.w - 6; this.y = geo.coluna.y + 4; this.yMax = geo.carimbo.y - 3; }
  Coluna.prototype.titulo = function (t) { var T = this.D.E.T; this.D.texto(this.x, this.y + T.tabelaCab * 0.76, t, T.tabelaCab, { peso: 0.12 }); this.y += T.tabelaCab * 1.5 + 1; };
  Coluna.prototype.tabela = function (cols, linhas, maxLinhas) {
    var D = this.D, T = D.E.T, hl = Math.max(4.4, T.tabela * 1.85), cab = T.tabelaCab * 1.3 + 2.4, cabem = Math.max(1, Math.floor((this.yMax - this.y - cab - 6) / hl)), mx = Math.min(cabem, maxLinhas || 999);
    var ls = linhas.length > mx ? linhas.slice(0, mx - 1).concat([{ titulo: "... mais " + (linhas.length - mx + 1) + " linha(s) - ver a planilha / o DXF" }]) : linhas;
    var tw = 0; cols.forEach(function (c) { tw += c.w; });
    var k = this.w / tw, cs = cols.map(function (c) { return { t: c.t, w: c.w * k, al: c.al }; });
    var r = D.tabela(this.x, this.y, cs, ls); this.y += r.h + 4; return r;
  };
  Coluna.prototype.notas = function (itens) {
    var D = this.D, T = D.E.T;
    this.titulo("NOTAS");
    var self = this;
    itens.forEach(function (it, i) {
      var o = typeof it === "object" ? it : { t: it }, pre = (i + 1) + "- ", rec = AP().largTexto(pre, T.nota);
      var ls = AP().quebrar(o.t, T.nota, self.w - rec);
      if (self.y + ls.length * T.nota * 1.42 > self.yMax) return;
      D.texto(self.x, self.y + T.nota * 0.76, pre, T.nota, { cor: o.cor });
      ls.forEach(function (s) { D.texto(self.x + rec, self.y + T.nota * 0.76, s, T.nota, { cor: o.cor }); self.y += T.nota * 1.42; });
      self.y += 0.6;
    });
  };

  /* ================================================================ MAPA DO COMPRIMENTO (com interrupção) */
  /* feats: x (mm) que têm de aparecer; e: escala; avail: largura de papel. Trecho sem nada maior que G mm de
     papel vira Q mm com a linha de interrupção. Devolve { X(x), total, quebras: [X], interrompido } */
  function mapaX(feats, e, G, Q) {
    var xs = feats.slice().sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return i === 0 || v - a[i - 1] > 0.05; });
    var pts = [{ x: xs[0], X: 0 }], quebras = [], X = 0;
    for (var i = 1; i < xs.length; i++) {
      var d = (xs[i] - xs[i - 1]) / e;
      if (d > G) { quebras.push(X + Q / 2); X += Q; } else X += d;
      pts.push({ x: xs[i], X: X });
    }
    function f(x) {
      if (x <= pts[0].x) return pts[0].X - (pts[0].x - x) / e;
      for (var k = 1; k < pts.length; k++) if (x <= pts[k].x) { var a = pts[k - 1], b = pts[k]; return b.x - a.x < 1e-9 ? a.X : a.X + (b.X - a.X) * (x - a.x) / (b.x - a.x); }
      var z = pts[pts.length - 1]; return z.X + (x - z.x) / e;
    }
    return { X: f, total: X, quebras: quebras, interrompido: quebras.length > 0, x0: xs[0], x1: xs[xs.length - 1] };
  }
  function quebrarFaixa(D, X, y0, y1) {
    D.fundo(X - 1.2, y0 - 0.6, 2.4, y1 - y0 + 1.2, "#fff");
    D.quebra(X - 1.2, y0 - 2.5, X - 1.2, y1 + 2.5); D.quebra(X + 1.2, y0 - 2.5, X + 1.2, y1 + 2.5);
  }
  function soldaOpcoes(s) {
    s = s || {};
    return { perna: num(s.perna, 0) ? String(num(s.perna, 0)) : "", lados: s.lados === "ambos" ? "ambos" : "seta", contorno: s.lados === "contorno", campo: !!s.campo };
  }
  function soldaCurta(s) { s = s || {}; return (s.tipo === "topo" ? "Topo " : "Filete ") + num(s.perna, 0) + (s.lados === "contorno" ? " contorno" : (s.lados === "um" ? " 1 lado" : " 2 lados")) + (s.campo ? " campo" : ""); }
  function descr(p) { var d = F().descricao(p); return p.kind === "perfil" ? d.replace(p.nomePerfil, perfilTxt(p.nomePerfil)) : d; }
  function soldaTexto(s, alvo) { var N = NN(); return (N && N.soldaRotulo ? N.soldaRotulo(s) : "Solda " + num(s && s.perna, 0) + " mm") + (alvo ? " em " + alvo : "") + " (E70XX)"; }

  /* ================================================================ PERFIL */
  function vistaPerfil(D, geo, p, o) {
    var A = AP(), T = D.E.T, ar = geo.area, faces = F().contornosFaces(p), avisos = o.avisos || [];
    var secW = 54, x0 = ar.x + 26, availW = ar.w - 26 - secW - 8, topo = ar.y + 18;
    var largs = faces.map(function (fc) { return Math.max.apply(null, fc.poli.map(function (q) { return q[1]; })); });
    var feats = [0, p.L]; faces.forEach(function (fc) { fc.poli.forEach(function (q) { feats.push(q[0]); }); });
    p.furos.forEach(function (f) { feats.push(f.x); });
    var e = null, mp = null, altDisp = Math.min(ar.h - 70, 190);
    function altura(ei) { var hTot = 0; largs.forEach(function (l) { hTot += l / ei + 30; }); return hTot; }
    /* 1º: a escala que cabe SEM interromper; vale se os furos ficam legíveis (≥ 3 mm de papel entre eles) */
    var xf = [0, p.L].concat(p.furos.map(function (f) { return f.x; })).sort(function (a, b) { return a - b; }), gapMin = Infinity;
    for (var g0 = 1; g0 < xf.length; g0++) if (xf[g0] - xf[g0 - 1] > 0.5) gapMin = Math.min(gapMin, xf[g0] - xf[g0 - 1]);
    var ext = Math.max.apply(null, feats) - Math.min.apply(null, feats);
    for (var i0 = 0; i0 < ESCALAS.length && !e; i0++) {
      var eu = ESCALAS[i0];
      if (altura(eu) <= altDisp && ext / eu <= availW) { if (!p.furos.length || gapMin / eu >= 3) { e = eu; mp = mapaX(feats, eu, 1e9, 14); } break; }
    }
    /* 2º: interrompe o comprimento entre os grupos de furos */
    for (var i = 0; i < ESCALAS.length && !e; i++) {
      var ei = ESCALAS[i];
      if (altura(ei) > altDisp) continue;
      var m = mapaX(feats, ei, 26, 14);
      if (m.total <= availW) { e = ei; mp = m; }
    }
    if (!e) { e = 500; mp = mapaX(feats, e, 1e9, 14); }
    var Xp = function (x) { return x0 + 4 + mp.X(x) - mp.X(mp.x0); };
    var tit = A.tituloVista(D, ar.x + 2, ar.y + 2, "PEÇA " + o.marca + " - " + txt(p.papel).toUpperCase(), "ESCALA 1:" + e + (mp.interrompido ? " (COMPRIMENTO INTERROMPIDO - COTAS EM VERDADEIRA GRANDEZA)" : ""));
    var y = Math.max(topo, ar.y + 2 + tit + 9), primeiro = null, ultimoBase = null;
    faces.forEach(function (fc, k) {
      var larg = largs[k], Ytop = y, Ybot = y + larg / e, Yp = function (yy) { return Ybot - yy / e; };
      if (primeiro == null) primeiro = Ytop;
      D.poli(fc.poli.map(function (q) { return [Xp(q[0]), Yp(q[1])]; }), "MET-PERFIL", true);
      mp.quebras.forEach(function (qX) { quebrarFaixa(D, x0 + 4 + qX, Ytop, Ybot); });
      D.texto(Xp(Math.max(p.L, mp.x1)), Ytop - 1.6, nomeFace(p, fc.face), T.nota, { al: "D", attr: ' data-face="' + fc.face + '"' });
      var fs = p.furos.filter(function (f) { return f.face === fc.face; });
      fs.forEach(function (f) { D.furo(Xp(f.x), Yp(f.y), Math.max(0.35, num(f.d, 0) / 2 / e)); });
      if (fs.length) {
        /* furação a partir da PONTA: cota acumulada embaixo da face (origem = ponta inicial, x = 0) */
        var xsF = [0].concat(fs.map(function (f) { return Math.round(f.x); })).concat([Math.round(p.L)]).filter(function (v, i2, a) { return a.indexOf(v) === i2; }).sort(function (a, b) { return a - b; });
        D.acumulada(xsF.map(function (x) { return [Xp(x), Ybot]; }), -3.2, xsF.map(mmTxt), { attrs: xsF.map(function (x) { return ' data-furo-x="' + x + '"'; }) });
        /* gabarito (y) da face: cadeia à esquerda, de baixo para cima */
        var ysF = [0].concat(fs.map(function (f) { return Math.round(f.y); })).concat([Math.round(larg)]).filter(function (v, i3, a) { return a.indexOf(v) === i3; }).sort(function (a, b) { return a - b; });
        if (ysF.length > 2) { var vs = []; for (var j = 1; j < ysF.length; j++) vs.push(mmTxt(ysF[j] - ysF[j - 1])); D.cadeia(ysF.map(function (yy) { return [Xp(Math.min(0, mp.x0)), Yp(yy)]; }), 4.5, vs); }
        y = Ybot + 19;
      } else y = Ybot + 11;
      ultimoBase = Ybot;
    });
    /* comprimento total (pelo eixo) e o corte inclinado */
    var yC = y - 2;
    D.cota(Xp(0), ultimoBase, Xp(p.L), ultimoBase, -(yC - ultimoBase), mmTxt(p.L), { semExt: false });
    var ct = p.cortes, ang = function (g) { return Math.abs(g) > 0.01; };
    if ([ct.almaIni, ct.almaFim, ct.abaIni, ct.abaFim].some(ang)) {
      var ti = (ang(ct.almaIni) ? "alma " + br(ct.almaIni, 2) + "°" : "") + (ang(ct.abaIni) ? (ang(ct.almaIni) ? " / " : "") + "aba " + br(ct.abaIni, 2) + "°" : "");
      var tf = (ang(ct.almaFim) ? "alma " + br(ct.almaFim, 2) + "°" : "") + (ang(ct.abaFim) ? (ang(ct.almaFim) ? " / " : "") + "aba " + br(ct.abaFim, 2) + "°" : "");
      D.texto(Xp(Math.min(0, mp.x0)), yC + 8, "CORTE INCLINADO - início: " + (ti || "reto") + "; fim: " + (tf || "reto") + " (comprimento pelo eixo)", T.nota, { attr: ' data-corte="1"' });
    }
    /* ACABAMENTO (js/metaldetalhe.js): MEIA-ESQUADRIA cotada — o ângulo do corte com o eixo em cada ponta e os
       comprimentos EXTERNO (o de corte) e INTERNO; a vista de cima mostra o corte na aba (o do canto em planta) */
    var fb = p.fab;
    if (fb) {
      var angP = function (t, a) { return t === "meia-esquadria" || t === "inclinado" ? br(a, 1).replace(/,0$/, "") + "°" : (t === "boca" ? "BOCA DE LOBO" : "RETO"); };
      var temMitra = /meia-esquadria|inclinado/.test(fb.ini + fb.fim), yM = yC + ([ct.almaIni, ct.almaFim, ct.abaIni, ct.abaFim].some(ang) ? 13 : 8);
      if (temMitra && (ang(ct.abaIni) || ang(ct.abaFim)) && p.dims) {
        /* VISTA DE CIMA: o contorno na largura (a) com os cortes da aba, as cotas externa e interna e o ângulo */
        var rr = num(p.dims.b, 0) / 2, xI = function (a) { return Math.tan(num(ct.abaIni, 0) * Math.PI / 180) * a; }, xF = function (a) { return p.L + Math.tan(num(ct.abaFim, 0) * Math.PI / 180) * a; };
        /* título, folga da cota de cima (8 mm), a faixa e a cota de baixo — nada sobre nada */
        var yV = yM + 12, hV = 2 * rr / e, Ya = function (a) { return yV + hV / 2 - a / e; };
        var lsup = xF(rr) - xI(rr), linf = xF(-rr) - xI(-rr), ladoExt = lsup >= linf ? rr : -rr, ladoInt = -ladoExt;
        D.texto(Xp(Math.min(0, mp.x0)), yM, "VISTA DE CIMA - CORTE DO CANTO", T.nota, { attr: ' data-vista-cima="1" data-compr-externo="' + mmTxt(Math.max(lsup, linf)) + '" data-compr-interno="' + mmTxt(Math.min(lsup, linf)) + '"' });
        D.poli([[Xp(xI(rr)), Ya(rr)], [Xp(xF(rr)), Ya(rr)], [Xp(xF(-rr)), Ya(-rr)], [Xp(xI(-rr)), Ya(-rr)]], "MET-PERFIL", true);
        mp.quebras.forEach(function (qX) { quebrarFaixa(D, x0 + 4 + qX, yV, yV + hV); });
        D.cota(Xp(xI(ladoExt)), Ya(ladoExt), Xp(xF(ladoExt)), Ya(ladoExt), ladoExt > 0 ? 5 : -5, mmTxt(Math.max(lsup, linf)));
        D.cota(Xp(xI(ladoInt)), Ya(ladoInt), Xp(xF(ladoInt)), Ya(ladoInt), ladoInt > 0 ? 5 : -5, mmTxt(Math.min(lsup, linf)));
        if (ang(ct.abaIni)) D.texto(Xp(xI(0)) - 1.5, Ya(0) + T.cota * 0.35, angP(fb.ini, fb.angIni), T.cota, { al: "D", attr: ' data-angulo-ini="' + angP(fb.ini, fb.angIni) + '"' });
        if (ang(ct.abaFim)) D.texto(Xp(xF(0)) + 1.5, Ya(0) + T.cota * 0.35, angP(fb.fim, fb.angFim), T.cota, { attr: ' data-angulo-fim="' + angP(fb.fim, fb.angFim) + '"' });
        yM = yV + hV + 12;
      }
      if (temMitra || /boca/.test(fb.ini + fb.fim)) {
        var lin = "PONTAS - início: " + angP(fb.ini, fb.angIni) + "; fim: " + angP(fb.fim, fb.angFim) + " (ângulo do corte com o eixo). COMPR. DE CORTE (EXTERNO) " + mmTxt(fb.externo) + " / INTERNO " + mmTxt(fb.interno) + " / EIXO " + mmTxt(fb.eixo) + ".";
        /* as linhas quebradas na largura da vista (sem entrar na SEÇÃO à direita) */
        var xT0 = Xp(Math.min(0, mp.x0)), wT = Math.max(60, availW - (xT0 - x0)), yy = yM;
        var escrever = function (t2, attr) { A.quebrar(t2, T.nota, wT).forEach(function (l2, il) { D.texto(xT0, yy, l2, T.nota, { attr: il === 0 ? attr : undefined }); yy += T.nota * 1.45; }); };
        escrever(lin, ' data-pontas="1"');
        if (temMitra) escrever("MEIA-ESQUADRIA: as duas barras do canto cortadas na bissetriz; solda de topo em todo o contorno, esmerilhada (AWS A2.4).", ' data-meia-esquadria="1"');
        if (/boca/.test(fb.ini + fb.fim)) escrever("BOCA DE LOBO: ponta recortada na forma do tubo que recebe" + (fb.bocaR ? " (R = " + mmTxt(fb.bocaR) + ")" : "") + " - gabarito de corte na peça; filete em todo o contorno.", ' data-boca="1"');
      }
    }
    /* solda AWS A2.4: a peça é soldada em outra */
    if (p.solda && o.soldadaEm) D.solda(Xp(0) + 2, primeiro, -60, junta(soldaOpcoes(p.solda), { ls: 9, lr: 18, cauda: "EM " + o.soldadaEm }));
    /* SEÇÃO transversal */
    var sx = ar.x + ar.w - secW / 2 - 2, sy = ar.y + 40, s = M() && M().secao ? M().secao(p.perfil) : null;
    if (s && s.ok) {
      var es = escalaQueCabe([s.larg * 1000, s.alt * 1000], [secW - 16, 40]);
      D.texto(sx, ar.y + 8, "SEÇÃO", T.titulo * 0.8, { al: "C" }); D.texto(sx, ar.y + 8 + T.escala * 1.4, "ESCALA 1:" + es, T.escala, { al: "C" });
      var c = s.contorno.map(function (q) { return [sx + q[0] * 1000 / es, sy - q[1] * 1000 / es]; });
      D.cheio(c, "#000", ' data-secao="1"');
      var hw = s.larg * 500 / es, hh = s.alt * 500 / es;
      D.cota(sx - hw, sy + hh, sx + hw, sy + hh, -4, mmTxt(p.dims.b));
      D.cota(sx - hw, sy + hh, sx - hw, sy - hh, -4, mmTxt(p.dims.h));
      D.texto(sx, sy + hh + 12, perfilTxt(p.nomePerfil), T.perfil, { al: "C" });
    }
    if (mp.interrompido) avisos.push(o.marca + ": comprimento interrompido no desenho (cotas em verdadeira grandeza).");
    return { escala: "1:" + e, mapa: mp };
  }
  function junta(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }

  /* ================================================================ BARRA CURVADA (curva de retorno, js/metaldetalhe.js) */
  function vistaCurva(D, geo, p, o) {
    var A = AP(), T = D.E.T, ar = geo.area, cv = p.curva || {}, R = num(cv.R, 0) * 1000, th = num(cv.ang, 90), Dd = num(p.dims && p.dims.h, 48), r = Dd / 2;
    var ext = R + r, e = escalaQueCabe([2 * ext + 40, ext + 40], [ar.w * 0.45, ar.h * 0.5]), s = 1 / e;
    var tit = A.tituloVista(D, ar.x + 2, ar.y + 2, "PEÇA " + o.marca + " - " + txt(p.papel).toUpperCase(), "ESCALA 1:" + e);
    var cx = ar.x + 30 + ext * s, cy = ar.y + tit + 16 + ext * s, f0 = -Math.PI / 2;
    function arco(rr) { var out = [], n = Math.max(8, Math.ceil(th / 7.5)); for (var k = 0; k <= n; k++) { var f = f0 + th * Math.PI / 180 * k / n; out.push([cx + rr * s * Math.cos(f), cy + rr * s * Math.sin(f)]); } return out; }
    D.poli(arco(R + r), "MET-PERFIL", false); D.poli(arco(R - r), "MET-PERFIL", false); D.poli(arco(R), "MET-EIXO", false);
    var fE = f0 + th * Math.PI / 180;
    [f0, fE].forEach(function (f) { D.linha(cx + (R - r) * s * Math.cos(f), cy + (R - r) * s * Math.sin(f), cx + (R + r) * s * Math.cos(f), cy + (R + r) * s * Math.sin(f), "MET-PERFIL"); });
    D.linha(cx, cy, cx + R * s * Math.cos(f0 + th * Math.PI / 360), cy + R * s * Math.sin(f0 + th * Math.PI / 360), "MET-FINA");
    D.circ(cx, cy, 0.5, "MET-FINA");
    D.texto(cx + 3, cy + T.cota * 0.4, "R = " + mmTxt(R) + " (LINHA DE CENTRO)", T.cota, { attr: ' data-raio="' + mmTxt(R) + '"' });
    D.texto(cx + 3, cy + T.cota * 2.0, "ÂNGULO = " + br(th, 0) + "°", T.cota, { attr: ' data-angulo-curva="' + br(th, 0) + '"' });
    var Ld = num(p.L, 0), yD = cy + ext * s + 18, wD = Math.min(ar.w * 0.6, Ld / e), hD = Math.max(1.2, Dd / e);
    D.texto(ar.x + 6, yD - 3, "DESENVOLVIMENTO (COMPRIMENTO DE CORTE DA BARRA RETA)", T.nota, { attr: ' data-desenvolvimento="' + mmTxt(Ld) + '"' });
    D.ret(ar.x + 6, yD, wD, hD, "MET-PERFIL");
    D.cota(ar.x + 6, yD + hD, ar.x + 6 + wD, yD + hD, -5, mmTxt(Ld));
    D.texto(ar.x + 6, yD + hD + 13, "Desenvolvimento = R x θ = " + mmTxt(R) + " x " + br(th * Math.PI / 180, 4) + " rad = " + mmTxt(Ld) + " mm. Raio de partida R = 2·D (prática de curvamento a frio - conferir com o curvador).", T.nota);
    D.texto(ar.x + 6, yD + hD + 13 + T.nota * 1.5, "Pontas retas (a topo): solda de topo em todo o contorno, esmerilhada (AWS A2.4).", T.nota);
    return { escala: "1:" + e };
  }

  /* ================================================================ CHAPA (plana ou dobrada) */
  function vistaChapa(D, geo, p, o) {
    var A = AP(), T = D.E.T, ar = geo.area, dob = p.dobras && p.dobras.length ? p : null;
    var xs = p.contorno.map(function (q) { return q[0]; }), ys = p.contorno.map(function (q) { return q[1]; }), xm = Math.min.apply(null, xs), ym = Math.min.apply(null, ys), Lx = Math.max.apply(null, xs) - xm, Ly = Math.max.apply(null, ys) - ym;
    var secW = dob ? 70 : 0, availW = ar.w - 50 - secW, availH = ar.h - 80;
    var e = escalaQueCabe([Lx, Ly], [availW, availH]);
    var tit = A.tituloVista(D, ar.x + 2, ar.y + 2, (dob ? "PLANIFICAÇÃO " : "PEÇA ") + o.marca + " - " + txt(p.papel).toUpperCase(), "ESCALA 1:" + e);
    var x0 = ar.x + 34, yb = ar.y + 2 + tit + 18 + Ly / e;
    var X = function (x) { return x0 + (x - xm) / e; }, Y = function (y) { return yb - (y - ym) / e; };
    D.poli(p.contorno.map(function (q) { return [X(q[0]), Y(q[1])]; }), "MET-PERFIL", true);
    p.recortes.forEach(function (r) { D.poli(r.map(function (q) { return [X(q[0]), Y(q[1])]; }), "MET-PERFIL", true); });
    p.furos.forEach(function (f) {
      if (num(f.l, f.d) > num(f.d, 0) + 0.05) { var w = num(f.l, 0) / e, h = num(f.d, 0) / e; D.ret(X(f.x) - w / 2, Y(f.y) - h / 2, w, h, "MET-SECUNDARIO"); }
      else D.furo(X(f.x), Y(f.y), Math.max(0.35, num(f.d, 0) / 2 / e));
    });
    /* dobras: linha de dobra (traço-ponto) + número */
    if (dob) p.dobras.forEach(function (d) {
      D.linha(X(xm + d.x), Y(ym) + 2, X(xm + d.x), Y(ym + Ly) - 2, "MET-EIXO");
      D.texto(X(xm + d.x), Y(ym + Ly) - 3.2, "D" + d.n, T.nota, { al: "C", attr: ' data-dobra="' + d.n + '"' });
    });
    /* cotas: furação (ou dobras) acumulada a partir do canto (origem), embaixo e à esquerda; total */
    var xsC = [xm].concat(p.furos.map(function (f) { return f.x; })).concat(dob ? p.dobras.map(function (d) { return xm + d.x; }) : []).concat([xm + Lx]).map(function (v) { return Math.round(v); })
      .filter(function (v, k, a2) { return a2.indexOf(v) === k; }).sort(function (a2, b2) { return a2 - b2; });
    var ysC = [ym].concat(p.furos.map(function (f) { return f.y; })).concat([ym + Ly]).map(function (v) { return Math.round(v); }).filter(function (v, k, a2) { return a2.indexOf(v) === k; }).sort(function (a2, b2) { return a2 - b2; });
    var temX = xsC.length > 2, temY = ysC.length > 2;
    if (temX) D.acumulada(xsC.map(function (x) { return [X(x), Y(ym)]; }), -4, xsC.map(function (x) { return mmTxt(x - xm); }), { attrs: xsC.map(function (x) { return ' data-furo-x="' + Math.round(x - xm) + '"'; }) });
    if (temY) D.acumulada(ysC.map(function (y) { return [X(xm), Y(y)]; }), 4, ysC.map(function (y) { return mmTxt(y - ym); }));
    D.cota(X(xm), Y(ym), X(xm + Lx), Y(ym), -(temX ? 18 : 6), mmTxt(Lx));
    D.cota(X(xm), Y(ym), X(xm), Y(ym + Ly), temY ? 18 : 6, mmTxt(Ly));
    /* chanfros (depois das cotas: a chamada procura um lugar livre): lado que não é horizontal nem vertical */
    var C = p.contorno;
    for (var i = 0; i < C.length; i++) {
      var a = C[i], b = C[(i + 1) % C.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
      if (dx > 0.5 && dy > 0.5 && dx < 0.5 * Lx && dy < 0.5 * Ly) {
        var mx = X((a[0] + b[0]) / 2), my = Y((a[1] + b[1]) / 2), sx = mx < X(xm + Lx / 2) ? -1 : 1, sy = my < Y(ym + Ly / 2) ? -1 : 1;
        D.chamada(mx, my, mx + sx * 8, my + sy * 6, ["CHANFRO " + mmTxt(dx) + " x " + mmTxt(dy)], { dir: sx, h: T.nota, alternativas: [[mx + sx * 8, my - sy * 6, sx], [mx - sx * 8, my + sy * 6, -sx], [mx - sx * 8, my - sy * 6, -sx], [mx + sx * 16, my + sy * 12, sx], [mx - sx * 16, my - sy * 12, -sx]] });
      }
    }
    if (p.solda && o.soldadaEm) D.solda(X(xm + Lx), Y(ym + Ly), -40, junta(soldaOpcoes(p.solda), { ls: 9, lr: 18, cauda: "EM " + o.soldadaEm }));
    /* a SEÇÃO DOBRADA (a peça pronta) à direita */
    if (dob && PL()) {
      var dd = p.dobrada, s = PL().secao({ pts: dd.pts.map(function (q) { return [q[0] / 1000, q[1] / 1000]; }), t: dd.t / 1000, ri: dd.ri / 1000 });
      if (s.ok) {
        var sx2 = ar.x + ar.w - secW / 2 - 2, sy2 = ar.y + 52, es = escalaQueCabe([s.larg * 1000, s.alt * 1000], [secW - 22, 52]);
        D.texto(sx2, ar.y + 8, "SEÇÃO DOBRADA", T.titulo * 0.8, { al: "C" }); D.texto(sx2, ar.y + 8 + T.escala * 1.4, "ESCALA 1:" + es, T.escala, { al: "C" });
        D.cheio(s.contorno.map(function (q) { return [sx2 + q[0] * 1000 / es, sy2 - q[1] * 1000 / es]; }), "#000", ' data-secao="1"');
        var hw = s.larg * 500 / es, hh = s.alt * 500 / es;
        D.cota(sx2 - hw, sy2 + hh, sx2 + hw, sy2 + hh, -4, mmTxt(s.larg * 1000));
        D.cota(sx2 - hw, sy2 + hh, sx2 - hw, sy2 - hh, -4, mmTxt(s.alt * 1000));
        D.texto(sx2, sy2 + hh + 12, txt(dd.rot) || "chapa dobrada", T.perfil, { al: "C" });
        D.texto(sx2, sy2 + hh + 12 + T.nota * 1.5, "Ri = " + br(dd.ri, 1) + " mm", T.nota, { al: "C" });
      }
    }
    return { escala: "1:" + e };
  }

  /* ================================================================ PEÇA MECÂNICA */
  function vistaMec(D, geo, p, o) {
    var A = AP(), T = D.E.T, ar = geo.area, e = escalaQueCabe([p.L, p.D], [ar.w - 70, ar.h - 90]);
    var tit = A.tituloVista(D, ar.x + 2, ar.y + 2, "PEÇA " + o.marca + " - " + txt(p.papel).toUpperCase(), "ESCALA 1:" + e);
    var x0 = ar.x + 30, yc = ar.y + tit + 30 + p.D / e / 2, w = p.L / e, h = p.D / e;
    D.ret(x0, yc - h / 2, w, h, "MET-PERFIL");
    D.linha(x0 - 3, yc, x0 + w + 3, yc, "MET-EIXO");
    if (p.d > 0) { D.linha(x0, yc - p.d / e / 2, x0 + w, yc - p.d / e / 2, "MET-OCULTA"); D.linha(x0, yc + p.d / e / 2, x0 + w, yc + p.d / e / 2, "MET-OCULTA"); }
    D.cota(x0, yc + h / 2, x0 + w, yc + h / 2, -8, mmTxt(p.L));
    D.cota(x0, yc + h / 2, x0, yc - h / 2, 8, "Ø " + br(p.D, 1));
    if (p.d > 0) D.texto(x0 + w + 6, yc, "FURO Ø " + br(p.d, 1), T.nota, { meio: true });
    return { escala: "1:" + e };
  }

  /* ================================================================ FOLHAS DE FABRICAÇÃO */
  function notasPadrao(p, extra) {
    var V = AP().VERMELHO;
    var n = ["Cotas em milímetros. Furação cotada a partir da ponta / do canto de origem (círculo). Não medir no desenho.", "Aço: " + txt(p.aco) + "."];
    if (arr(p.furos).length) n.push("Furo-padrão = Ø do parafuso + 1,5 mm (NBR 8800); oblongo: largura x comprimento.");
    n = n.concat(extra || []);
    n.push("Soldas: eletrodo E70XX, simbologia AWS A2.4 (lado da seta embaixo da linha de referência).");
    /* ACABAMENTO E COR por peça (js/metalacab.js): a peça com acabamento próprio leva o dele na nota; sem ele, a pendência de pintura de sempre */
    var ACm = dep("BimMetalAcab", "./metalacab.js"), temAc = !!(p.acab && ACm), pinta = !temAc || p.acab.tipo === "pintura" || p.acab.tipo === "duplex";
    if (temAc) n.push("Acabamento: " + ACm.rotulo(p.acab) + (p.acab.tipo === "pintura" || p.acab.tipo === "duplex" ? (p.acab.sistema ? " - sistema " + p.acab.sistema : "") + (p.acab.brilho === "acetinado" ? " - acetinado" : " - fosco") : "") + ".");
    if (pinta) n.push({ t: "Pintura: preparo e sistema conforme a especificação da obra [PENDENTE].", cor: V });
    n.push("Modelagem e detalhamento - não é cálculo estrutural: dimensões de partida a conferir pelo projeto.");
    return n;
  }
  function colunaPeca(D, geo, g, p, kg, extra) {
    var col = new Coluna(D, geo), V = AP().VERMELHO;
    col.titulo("LISTA DE MATERIAL - MARCA " + g.marca);
    var desc = p.kind === "perfil" ? perfilTxt(p.nomePerfil) + " L = " + mmTxt(p.L) : (p.kind === "chapa" ? chapaTxt(p.t, Math.min(p.L, p.B), Math.max(p.L, p.B)) + (p.dobras ? " (planificada)" : "") : txt(p.papel) + " Ø " + br(p.D, 1) + " x " + mmTxt(p.L));
    col.tabela([{ t: "MARCA", w: 12 }, { t: "QTD", w: 9 }, { t: "DESCRIÇÃO", w: 48, al: "E" }, { t: "AÇO", w: 26 }, { t: ["PESO", "UNIT. (kg)"], w: 17 }, { t: ["PESO", "TOTAL (kg)"], w: 17 }],
      [[g.marca, String(g.ids.length), desc, txt(p.aco), br(kg, 1), br(kg * g.ids.length, 1)]]);
    if (p.dobras && p.dobras.length) {
      col.titulo("DOBRAS (a partir da borda de origem)");
      col.tabela([{ t: "DOBRA", w: 12 }, { t: ["POSIÇÃO", "(mm)"], w: 18 }, { t: "ÂNGULO", w: 16 }, { t: "SENTIDO", w: 17 }, { t: "Ri (mm)", w: 14 }, { t: ["DESENV.", "(mm)"], w: 16 }],
        p.dobras.map(function (d) { return ["D" + d.n, mmTxt(d.x), br(d.ang, 1) + "°", d.sentido === "cima" ? "P/ CIMA" : "P/ BAIXO", br(d.ri, 1), br(d.BA, 1)]; }), 10);
      var dd = p.dobrada || {};
      extra = [{ t: "Planificação: Ld = " + br(dd.Ld, 1) + " mm pelo fator K = " + br(dd.K, 2) + " (" + txt(dd.fonteK) + ")" + (dd.conferir ? " - CONFERIR COM A DOBRADEIRA antes de cortar." : "."), cor: dd.conferir ? V : null },
               "Sentido da dobra visto pela face de referência; linhas de dobra em traço-ponto."].concat(extra || []);
    }
    var fs = arr(p.furos);
    if (fs.length) {
      col.titulo("FURAÇÃO");
      var porFace = p.kind === "perfil";
      col.tabela((porFace ? [{ t: "FURO", w: 11 }, { t: "FACE", w: 11 }] : [{ t: "FURO", w: 11 }]).concat([{ t: "x (mm)", w: 20 }, { t: "y (mm)", w: 20 }, { t: "Ø (mm)", w: 22 }]),
        fs.map(function (f, i) { return (porFace ? [String(i + 1), f.face] : [String(i + 1)]).concat([mmTxt(f.x), mmTxt(f.y), br(f.d, 1) + (num(f.l, f.d) > num(f.d, 0) + 0.05 ? " x " + br(f.l, 1) : "")]); }), 14);
    }
    col.notas(notasPadrao(p, extra));
  }
  function folhasFabricacao(estado, op) {
    op = op || {};
    var Fb = F(); if (!Fb) return { ok: false, folhas: [], avisos: ["O motor da fabricação (js/metalfab.js) não carregou."] };
    var n = op.numeracao || Fb.numerar(estado), L = Fb.listas(estado, n), porId = {}, kgDe = {}, avisos = [];
    n.pecas.forEach(function (p) { porId[p.id] = p; });
    L.pecas.forEach(function (x) { kgDe[x.marca] = x.pesoUnit; });
    var so = op.marcas ? op.marcas : null, defs = [];
    n.grupos.forEach(function (g) {
      if (so && so.indexOf(g.marca) < 0) return;
      var p = g.rep, alvo = p.soldadaEm && n.marcaDe[p.soldadaEm] ? n.marcaDe[p.soldadaEm] : "", o = { marca: g.marca, soldadaEm: alvo, avisos: avisos };
      defs.push({ id: "marca-" + g.marca, marca: g.marca, titulo: "FABRICAÇÃO - MARCA " + g.marca + " (" + (p.kind === "perfil" ? perfilTxt(p.nomePerfil) : (p.kind === "chapa" ? (p.dobras ? "CHAPA DOBRADA" : "CHAPA") : txt(p.papel).toUpperCase())) + ")",
        desenhar: function (D, geo) {
          var r = p.kind === "perfil" ? (p.curva ? vistaCurva(D, geo, p, o) : vistaPerfil(D, geo, p, o)) : (p.kind === "chapa" ? vistaChapa(D, geo, p, o) : vistaMec(D, geo, p, o));
          colunaPeca(D, geo, g, p, num(kgDe[g.marca], num(p.massa, 0)), alvo && p.solda ? ["Soldada em " + alvo + ": " + soldaTexto(p.solda) + "."] : null);
          return r;
        } });
    });
    if (op.conjuntos !== false) n.conjuntos.forEach(function (cj) {
      if (!cj.partes.length || (so && so.indexOf(cj.principal) < 0 && so.indexOf(cj.marca) < 0)) return;
      var rep = cj.conjuntos[0], princ = porId[rep.principal];
      defs.push({ id: "conjunto-" + cj.marca, marca: cj.marca, titulo: "FABRICAÇÃO - CONJUNTO " + cj.marca + " (" + cj.principal + " + " + cj.partes.length + " PEÇA(S) SOLDADA(S))",
        desenhar: function (D, geo) {
          var g0 = n.grupos.filter(function (gg) { return gg.marca === cj.principal; })[0], o = { marca: cj.principal + " (CONJUNTO " + cj.marca + ")", avisos: avisos };
          var r = princ.kind === "perfil" ? vistaPerfil(D, geo, princ, o) : (princ.kind === "chapa" ? vistaChapa(D, geo, princ, o) : vistaMec(D, geo, princ, o));
          var col = new Coluna(D, geo), cnt = {};
          rep.ids.forEach(function (id) { if (id === rep.principal) return; var mk = n.marcaDe[id]; cnt[mk] = cnt[mk] || { n: 0, p: porId[id] }; cnt[mk].n++; });
          col.titulo("CONJUNTO " + cj.marca + " - " + cj.conjuntos.length + " UNIDADE(S)");
          var linhas = [[cj.principal, "1", descr(princ), "-", br(num(kgDe[cj.principal], 0), 1)]];
          Object.keys(cnt).sort().forEach(function (mk) { var q = cnt[mk].p; linhas.push([mk, String(cnt[mk].n), descr(q), q.solda ? soldaCurta(q.solda) : "-", br(num(kgDe[mk], 0) * cnt[mk].n, 1)]); });
          col.tabela([{ t: "MARCA", w: 12 }, { t: "QTD", w: 9 }, { t: "DESCRIÇÃO", w: 50, al: "E" }, { t: "SOLDA", w: 38, al: "E" }, { t: ["PESO", "(kg)"], w: 15 }], linhas, 16);
          /* os símbolos de solda (AWS A2.4) de cada parte soldada */
          var sold = Object.keys(cnt).sort().filter(function (mk) { return cnt[mk].p.solda; });
          if (sold.length) {
            col.titulo("SOLDAS (AWS A2.4)");
            sold.slice(0, 5).forEach(function (mk) {
              if (col.y + 14 > col.yMax - 30) return;
              var s = cnt[mk].p.solda;
              D.solda(col.x + 3, col.y + 10, -55, junta(soldaOpcoes(s), { ls: 7, lr: 20 }));
              D.texto(col.x + 34, col.y + 8.4, mk + " em " + cj.principal + ": " + soldaTexto(s), D.E.T.nota);
              col.y += 14;
            });
          }
          col.notas(notasPadrao(princ, ["Montar e soldar na oficina na posição do modelo (IFC de fabricação); conferir esquadro antes da solda."]));
          void g0;
          return r;
        } });
    });
    /* DETALHE TÍPICO DO GUARDA-CORPO (js/metaldetalhe.js): meia-esquadria, terminal boleado e base — quando o modelo tem guarda-corpo */
    var MDt = dep("MetalDetalhe", "./metaldetalhe.js"), dtp = op.detalheTipico !== false && MDt && !so ? MDt.defDetalheTipico(arr(estado && estado.caixas)) : null;
    if (dtp) defs.push(dtp);
    var r = montar(defs, op);
    r.avisos = (r.avisos || []).concat(avisos.filter(function (a, i) { return avisos.indexOf(a) === i; }));
    r.numeracao = n;
    return r;
  }

  /* ================================================================ PLANO DE CORTE (barras) */
  function folhasCorte(plano, op) {
    op = op || {};
    var gr = arr(plano && plano.grupos), defs = [], linhas = [], acabDe = {};
    gr.forEach(function (g) { arr(g.itens).forEach(function (it) { if (it.acab) acabDe[it.marca] = it.acab.texto; }); });
    /* barras com o MESMO plano de corte numa linha só ("B1 a B6 - 6x") */
    gr.forEach(function (g) {
      linhas.push({ cab: true, g: g });
      var ult = null;
      g.barras.forEach(function (b) {
        var ch = b.comprimento + "|" + b.pecas.map(function (pc) { return pc.marca + ":" + pc.L; }).join(",");
        if (ult && ult.ch === ch) { ult.ate = b.n; ult.qtd++; return; }
        ult = { g: g, b: b, ch: ch, de: b.n, ate: b.n, qtd: 1 }; linhas.push(ult);
      });
    });
    var Lmax = 0; gr.forEach(function (g) { g.barras.forEach(function (b) { Lmax = Math.max(Lmax, b.comprimento); }); });
    /* páginas: enche a área de cima para baixo */
    var paginas = [], atual = [], h = 0, cap = 238;
    linhas.forEach(function (l) { var hh = l.cab ? 10 : 12; if (h + hh > cap && atual.length) { paginas.push(atual); atual = []; h = 0; } atual.push(l); h += hh; });
    if (atual.length) paginas.push(atual);
    if (!paginas.length) paginas.push([]);
    paginas.forEach(function (pg, ip) {
      defs.push({ id: "corte-" + (ip + 1), titulo: "LISTA DE CORTE - APROVEITAMENTO DE BARRAS" + (paginas.length > 1 ? " (" + (ip + 1) + "/" + paginas.length + ")" : ""),
        desenhar: function (D, geo) {
          var A = AP(), T = D.E.T, ar = geo.area, e = escalaQueCabe([Math.max(Lmax, 1)], [ar.w - 34]), x0 = ar.x + 26;
          var tit = A.tituloVista(D, ar.x + 2, ar.y + 2, "PLANO DE CORTE DAS BARRAS", "ESCALA 1:" + e + " (comprimento)");
          var y = ar.y + 2 + tit + 6;
          pg.forEach(function (l) {
            if (l.cab) { D.texto(ar.x + 2, y + T.nota * 0.9, perfilTxt(l.g.perfil) + " - " + l.g.aco + " - " + l.g.compra.map(function (c) { return c.quantidade + " barra(s) de " + mmTxt(c.comprimento); }).join(" + ") + " - perda " + br(l.g.perdaPct, 1) + " %", T.nota, { peso: 0.1 }); y += 10; return; }
            var b = l.b, hb = 4.2, xb = x0;
            D.texto(ar.x + 2, y + hb / 2, "B" + l.de + (l.ate > l.de ? (l.ate > l.de + 1 ? " a B" : ", B") + l.ate : ""), T.nota, { meio: true, attr: ' data-barra="' + b.n + '"' });
            if (l.qtd > 1) D.texto(ar.x + 2, y + hb / 2 + T.nota * 1.3, l.qtd + " x", T.nota, { meio: true });
            D.ret(xb, y, b.comprimento / e, hb, "MET-SECUNDARIO");
            b.pecas.forEach(function (pc) {
              var xa = xb + pc.de / e, w = pc.L / e;
              D.ret(xa, y, w, hb, "MET-PERFIL");
              if (A.largTexto(pc.marca, T.minimo) + 0.8 < w) D.texto(xa + w / 2, y + hb / 2, pc.marca, Math.min(T.nota, Math.max(T.minimo, hb * 0.6)), { al: "C", meio: true });
            });
            if (b.sobra > 0) { var xs = xb + (b.comprimento - b.sobra) / e; D.hachura(xs, y, b.sobra / e, hb, 1.2, b.reaproveitavel ? "MET-SECUNDARIO" : "MET-HACHURA"); }
            var seq = b.pecas.map(function (pc) { var ac = acabDe[pc.marca]; return pc.marca + " " + mmTxt(pc.L) + (ac && /°|boca|curva/.test(ac) ? " (" + ac + ")" : ""); }).join(" + ") + (b.sobra > 0 ? "  |  sobra " + mmTxt(b.sobra) + (b.reaproveitavel ? " (reaproveitar)" : " (sucata)") : "");
            var ls = A.quebrar(seq, T.minimo, ar.w - 30);
            D.texto(xb, y + hb + T.minimo * 1.2, ls[0] + (ls.length > 1 ? " ..." : ""), T.minimo);
            y += 12;
          });
          /* coluna: compra e resumo */
          var col = new Coluna(D, geo), Tt = plano.totais || {};
          col.titulo("BARRAS A COMPRAR");
          var lc = []; gr.forEach(function (g) { g.compra.forEach(function (c) { lc.push([perfilTxt(g.perfil), txt(g.aco), mmTxt(c.comprimento), String(c.quantidade), br(c.comprimento / 1000 * g.kgm * c.quantidade, 1)]); }); });
          lc.push({ total: ["TOTAL", "", "", String(Tt.barras || 0), br(Tt.compradoKg, 1)] });
          col.tabela([{ t: "PERFIL", w: 30, al: "E" }, { t: "AÇO", w: 30 }, { t: ["BARRA", "(mm)"], w: 18 }, { t: "QTD", w: 12 }, { t: ["PESO", "(kg)"], w: 18 }], lc, 18);
          col.titulo("APROVEITAMENTO");
          col.tabela([{ t: "ITEM", w: 70, al: "E" }, { t: "VALOR", w: 30 }], [["Peso das peças (kg)", br(Tt.pecasKg, 1)], ["Sobras reaproveitáveis (kg)", br(Tt.sobrasKg, 1)], ["Perda: serra + pontas curtas (kg)", br(Tt.perdaKg, 1)], ["Perda (%)", br(Tt.perdaPct, 2)]]);
          var c = plano.config || {};
          col.notas(["Barras comerciais " + arr(c.barras).map(mmTxt).join(" e ") + " mm; serra " + br(c.serra, 1) + " mm; sobra reaproveitável a partir de " + mmTxt(c.sobraMin) + " mm (valores de partida).",
                     "Cortes na ordem, a partir da ponta da barra. Hachura = sobra.", "Comprimento de corte = eixo + projeção do corte inclinado (meia-esquadria: o EXTERNO; entre parênteses o ângulo do corte com o eixo em cada ponta; curva: o desenvolvimento)."]);
          return { escala: "1:" + e };
        } });
    });
    return montar(defs, op);
  }

  /* ================================================================ NESTING DE CHAPAS */
  function folhasNesting(res, op) {
    op = op || {};
    var defs = [], itens = [];
    arr(res && res.grupos).forEach(function (g) { g.chapas.forEach(function (ch) { itens.push({ g: g, ch: ch }); }); });
    var pags = []; for (var i = 0; i < itens.length; i += 2) pags.push(itens.slice(i, i + 2));
    if (!pags.length) pags.push([]);
    pags.forEach(function (pg, ip) {
      defs.push({ id: "nesting-" + (ip + 1), titulo: "NESTING DE CHAPAS" + (pags.length > 1 ? " (" + (ip + 1) + "/" + pags.length + ")" : ""),
        desenhar: function (D, geo) {
          var A = AP(), T = D.E.T, ar = geo.area, y = ar.y + 4, esc0 = null;
          pg.forEach(function (it) {
            var ch = it.ch, e = escalaQueCabe([ch.W, ch.H], [ar.w - 12, (ar.h - 30) / 2 - 22]);
            esc0 = esc0 || e;
            var tit = A.tituloVista(D, ar.x + 2, y, "CHAPA " + ch.n + " - " + chapaTxt(it.g.t, ch.H, ch.W) + " - " + it.g.aco, "ESCALA 1:" + e + " - APROVEITAMENTO " + br(ch.aproveitamento, 1) + " %");
            var x0 = ar.x + 6, y0 = y + tit + 2;
            D.ret(x0, y0, ch.W / e, ch.H / e, "MET-PERFIL-CORTE");
            ch.pecas.forEach(function (pc) {
              var px = x0 + pc.x / e, py = y0 + pc.y / e, w = pc.w / e, h = pc.h / e;
              D.ret(px, py, w, h, "MET-PERFIL");
              if (A.largTexto(pc.marca, T.minimo) + 0.6 < w && h > T.minimo * 1.3) D.texto(px + w / 2, py + h / 2, pc.marca, Math.max(T.minimo, Math.min(T.nota, h * 0.5)), { al: "C", meio: true, attr: ' data-peca="' + esc(pc.marca) + '"' });
            });
            D.cota(x0, y0 + ch.H / e, x0 + ch.W / e, y0 + ch.H / e, -4, mmTxt(ch.W));
            y = y0 + ch.H / e + 14;
          });
          var col = new Coluna(D, geo), Tt = res.totais || {};
          col.titulo("CHAPAS A COMPRAR");
          var lc = []; arr(res.grupos).forEach(function (g) { g.compra.forEach(function (c) { lc.push([chapaTxt(g.t), txt(g.aco), c.formato, String(c.quantidade), br(g.aproveitamento, 1)]); }); });
          lc.push({ total: ["TOTAL", "", "", String(Tt.chapas || 0), br(Tt.aproveitamento, 1)] });
          col.tabela([{ t: "ESP.", w: 14 }, { t: "AÇO", w: 30 }, { t: ["CHAPA", "(mm)"], w: 26 }, { t: "QTD", w: 12 }, { t: ["APROV.", "(%)"], w: 18 }], lc, 16);
          col.titulo("RESUMO");
          col.tabela([{ t: "ITEM", w: 70, al: "E" }, { t: "VALOR", w: 30 }], [["Área das chapas (m²)", br(Tt.areaChapasM2, 2)], ["Área das peças (m²)", br(Tt.areaPecasM2, 2)], ["Peso comprado (kg)", br(Tt.kgChapas, 1)], ["Perda (kg)", br(Tt.perdaKg, 1)]]);
          var c = res.config || {};
          col.notas(["Arranjo pelo retângulo envolvente (MaxRects): não encaixa uma peça no recorte de outra.", "Folga entre peças " + mmTxt(c.folga) + " mm; borda " + mmTxt(c.borda) + " mm (valores de partida - conferir com o processo de corte).",
                     "Aproveitamento = área real das peças / área das chapas compradas."].concat(Tt.fora ? [{ t: Tt.fora + " peça(s) maiores que a maior chapa comercial: comprar chapa especial [PENDENTE].", cor: AP().VERMELHO }] : []));
          return { escala: esc0 ? "1:" + esc0 : "INDICADA" };
        } });
    });
    return montar(defs, op);
  }

  function pdf(folhas, titulo) { var S = SP(); return S ? S.pdf(arr(folhas).map(function (f) { return f.svg; }), { titulo: titulo }) : null; }

  var BimMetalFabDes = { ESCALAS: ESCALAS, montar: montar, mapaX: mapaX, folhasFabricacao: folhasFabricacao, folhasCorte: folhasCorte, folhasNesting: folhasNesting, pdf: pdf, perfilTxt: perfilTxt, chapaTxt: chapaTxt };
  global.BimMetalFabDes = BimMetalFabDes;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalFabDes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

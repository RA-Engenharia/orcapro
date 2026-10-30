/* =====================================================================
 * arqplantas.js — AS VISTAS EM PLANTA DAS PRANCHAS DE ARQUITETURA
 * (motor PURO, ES5, sem DOM). Cada função desenha uma folha inteira em `c.D` e devolve o que
 * o gerador (js/arqpranchas.js) precisa saber (escala, avisos).
 *
 *   ArqPlantas.planta(c, o)      ARQ-02 existente · ARQ-03 demolir/construir · ARQ-04 proposta/layout   (o.modo)
 *   ArqPlantas.situacao(c)       ARQ-01 situação e implantação: lote, divisas cotadas, recuos, norte, rua, cobertura vista de cima, quadros
 *   ArqPlantas.cobertura(c)      ARQ-05 planta de cobertura (águas, cumeeira, espigões, sentido e % do caimento)
 *   ArqPlantas.forro(c)          ARQ-06 planta de forro (tipos, níveis, sanca, luminárias)
 *   ArqPlantas.paginacao(c)      ARQ-09 paginação de piso (js/bimpaginacao.js)
 *   ArqPlantas.humanizada(c)     planta HUMANIZADA para o cliente (cor por piso, mobiliário, vegetação, sombra; sem cotas)
 *
 * c = { D, E, geo, A (área de desenho), dados (todas as fases), antes, depois (ArqModelo.extrair de cada situação),
 *       estadoDepois, idx (ArqIndices), op (opções), plano: { k, escala, caixa }, avisos[] }
 * GANCHO DO TELHADO: `BimTelhado.resumoPlanta(telhado)`, se existir, devolve o desenho pronto
 *   { aguas: [{ pts: [[x, z]…], seta: { de: [x, z], para: [x, z] }, pct }], cumeeiras: [[x1, z1, x2, z2]…],
 *     espigoes: […], rincoes: […], beiral: [[x, z]…] }; sem ele, o desenho sai das águas calculadas do telhado.
 * Teste: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function G() { return dep("ArqGeo", "./arqgeo.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }

  /* quais fases entram em cada modo de planta */
  var FASES_MODO = { existente: { existente: 1, demolido: 1 }, demolir: { existente: 1, demolido: 1, novo: 1 }, layout: { existente: 1, novo: 1 }, fantasma: { existente: 1, novo: 1 }, humanizada: { existente: 1, novo: 1 } };
  function listas(c, modo, pav) {
    var d = c.dados, F = FASES_MODO[modo] || FASES_MODO.layout;
    function ok(x) { return F[x.status] && (pav == null || x.pav === pav); }
    var base = modo === "existente" ? c.antes : c.depois;
    return {
      paredes: arr(d.paredes).filter(function (w) { return ok(w) && !w.muro; }), pilares: arr(d.pilares).filter(ok),
      vaos: arr(d.vaos).filter(ok), moveis: arr(d.moveis).filter(ok), lajes: arr(d.lajes).filter(ok), luminarias: arr(d.luminarias).filter(ok),
      ambientes: arr((base || d).ambientes).filter(function (a) { return pav == null || a.pav === pav; }), muros: arr(d.paredes).filter(function (w) { return ok(w) && w.muro; })
    };
  }
  function porId(L) { var m = {}; L.forEach(function (w) { m[w.id] = w; }); return m; }
  function titulo(c, x, y, tit, escala) { return DS().titulo(c.D, x, y, tit, escala, 1); }

  /* ================================================================ PLANTAS (02, 03, 04) */
  function planta(c, o) {
    var D = c.D, d = DS(), A = c.A, pl = c.plano, M = d.mapa(pl.caixa, A.x + 4 + d.K.margemCotas, A.y + 16 + d.K.margemCotas, pl.k), modo = o.modo, Lc = listas(c, modo, o.pav);
    var hT = titulo(c, A.x + 4, A.y + 2, o.titulo, "ESC 1:" + pl.escala), semLugar = [];
    /* R01: os MUROS DE DIVISA aparecem na planta (antes saíam só na situação e nas fachadas: a planta não mostrava o limite do terreno), em cada fase, com o rótulo "MURO H=x,xx m" como no manual */
    d.paredesPlanta(D, M, Lc.paredes.concat(o.semMuros ? [] : Lc.muros), modo === "layout" ? "layout" : modo);
    d.pilaresPlanta(D, M, Lc.pilares, modo);
    if (modo === "layout" && !o.esquadrias) d.moveisPlanta(D, M, Lc.moveis);
    d.vaosPlanta(D, M, Lc.vaos, porId(Lc.paredes), modo);
    /* R02 — PROJEÇÃO DO BEIRAL / do pavimento superior, TRACEJADA (manual p.9–10: "projeção dos pavimentos superiores"); só na planta proposta */
    var beirais = [];
    if (modo === "layout" && !o.esquadrias && o.beiral !== false) {
      arr(c.dados.telhados).filter(function (t) { return t.status !== "demolido" && arr(t.pBeiral).length >= 3; }).forEach(function (t) { beirais.push(t.pBeiral); D.poli(t.pBeiral.map(function (p) { return M.Pp(p); }), "ARQ-BEIRAL", true); });
    }
    var nCotas = 0;
    if (o.cotas !== false) nCotas = d.cotasExternas(D, M, Lc.paredes, Lc.vaos.filter(function (v) { return v.status !== "demolido" || modo !== "layout"; }), { ambientes: Lc.ambientes });
    /* R01: as cadeias até as divisas (recuos e o lote inteiro), como no manual */
    var loteB = c.idx && c.idx.terreno && c.idx.terreno.contorno ? G().bbox(c.idx.terreno.contorno) : null, edB = null;
    if (loteB && o.cotas !== false && modo !== "existente") {
      var exs = []; Lc.paredes.concat(Lc.pilares).forEach(function (w) { arr(w.pts).forEach(function (q) { exs.push(q); }); });
      if (exs.length) edB = G().bbox(exs);
      if (edB) nCotas += d.cotasDivisas(D, M, loteB, edB);
    }
    var semCota = [], cruzaCota = [];
    if (o.cotasInt) nCotas += d.cotasInternas(D, M, Lc.ambientes, { moveis: modo === "layout" ? Lc.moveis : [], semLugar: semCota, cruza: cruzaCota });
    if (semCota.length) c.avisos.push("Folha " + o.titulo + ": sem lugar livre para a cota interna de " + semCota.join(", ") + ".");
    if (cruzaCota.length) c.avisos.push("Folha " + o.titulo + ": a cota interna de " + cruzaCota.join(", ") + " passa por cima de móvel (não havia linha livre).");
    /* rodapé do desenho: norte e escala gráfica (R02: ANTES das marcas de corte, para o círculo do corte desviar do N) */
    var yb = M.oy + M.alt + d.K.margemCotas + 4, xN = A.x + 82;
    if (o.cortes && c.cortes) {   /* a linha do corte que desce até o rodapé não pode cair em cima do norte: escolhe a linha antes e afasta o N */
      c.cortes.forEach(function (ct) { ct.coord = d.escolherLinhaCorte(D, M, ct, 27 / pl.k); if (ct.eixo !== "x") { var px = M.P(ct.coord, 0)[0]; if (Math.abs(px - xN) < 24) xN = px + 30; } });
    }
    d.escalaGrafica(D, A.x + 6, yb + 4, pl.k, pl.k * 5 >= 12 ? 5 : 10);
    d.norte(D, xN, yb + 2, c.dados.terreno.norte, 7);
    /* marcas de corte AA e BB (a planta proposta): depois das cotas, para a linha desviar do número delas */
    if (o.cortes && c.cortes) {
      c.cortes.forEach(function (ct) {
        var ext = 27 / pl.k;
        var q0 = ct.pu0 != null ? ct.pu0 : ct.u0, q1 = ct.pu1 != null ? ct.pu1 : ct.u1;   /* a marca vai da edificação (o corte desenhado vai de divisa a divisa) */
        var a = ct.eixo === "x" ? M.P(q0 - ext, ct.coord) : M.P(ct.coord, q0 - ext), b = ct.eixo === "x" ? M.P(q1 + ext, ct.coord) : M.P(ct.coord, q1 + ext);
        d.marcaCorte(D, a, b, ct.letra, -1);
      });
    }
    semLugar = semLugar.concat(d.etiquetasVaos(D, M, Lc.vaos, porId(Lc.paredes), { medidas: !!o.esquadrias || modo === "layout" }));
    if (!o.esquadrias) semLugar = semLugar.concat(d.rotulosAmbientes(D, M, Lc.ambientes, { completo: !!o.completo }));
    if (!o.semMuros) d.rotulosMuros(D, M, Lc.muros);   /* por último: o rótulo do muro só entra onde sobrou lugar livre */
    if (beirais.length) {   /* o rótulo do beiral, num trecho livre da linha tracejada */
      var tb0 = "PROJEÇÃO DO BEIRAL", wb = DS().largTexto(tb0, 2.1), pb = beirais[0], okb = false;
      for (var ib = 0; ib < pb.length && !okb; ib++) {
        var e0 = M.Pp(pb[ib]), e1 = M.Pp(pb[(ib + 1) % pb.length]), Lb = hip(e1[0] - e0[0], e1[1] - e0[1]);
        if (Lb < wb + 6) continue;
        var cb = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], hz = Math.abs(e1[1] - e0[1]) < Math.abs(e1[0] - e0[0]);
        if (!hz) continue;
        for (var sg = -1; sg <= 1 && !okb; sg += 2) { var bxb = [cb[0] - wb / 2, cb[1] + (sg > 0 ? 0.6 : -2.9), cb[0] + wb / 2, cb[1] + (sg > 0 ? 3.0 : -0.6)]; if (D.livre(bxb, 0.2)) { D.texto(cb[0], bxb[3] - (sg > 0 ? 0.7 : 0.7), tb0, 2.1, { al: "C" }); okb = true; } }
      }
    }
    if (modo === "layout" && !o.esquadrias) d.niveisAmbientes(D, M, Lc.ambientes, {});   /* o nível do piso é complemento: sem lugar livre, não entra (sem aviso) */
    if (semLugar.length) c.avisos.push("Folha " + o.titulo + ": sem lugar livre para " + semLugar.join(", ") + ".");
    return { escala: "1:" + pl.escala, M: M, cotas: nCotas, semLugar: semLugar, y: yb, hTitulo: hT };
  }

  /* ================================================================ TELHADO (cobertura e situação) */
  function resumoGancho(t) {
    var BT = dep("BimTelhado", "./bimtelhado.js"), r = null;
    if (!BT || typeof BT.resumoPlanta !== "function") return null;
    try { r = BT.resumoPlanta(t.orig || t); } catch (e) { r = null; }
    if (!r || !arr(r.aguas).length) return null;
    return r;
  }
  function pontoChave(p) { return Math.round(p[0] * 100) + "," + Math.round(p[1] * 100); }
  /* o telhado em planta: águas, cumeeira, espigões/rincões, beiral e as setas de caimento */
  function desenharTelhado(D, M, t, o) {
    o = o || {};
    var g = G(), cumeeiras = [], hips = [], aguas = [], R = resumoGancho(t);
    if (R) {
      aguas = R.aguas.map(function (a) { return { pts: a.pts, pct: a.pct, seta: a.seta }; });
      cumeeiras = arr(R.cumeeiras); hips = arr(R.espigoes).concat(arr(R.rincoes));
    } else {
      var arestas = {};
      arr(t.aguas).forEach(function (ag) {
        arr(ag.pecas).forEach(function (pc) {
          var P = arr(pc.pts); if (P.length < 3) return;
          var poli = P.map(function (q) { return [q.x, q.z]; }), ys = P.map(function (q) { return q.y; });
          var pl = ag.plano || {}, gx = num(pl.bx, 0), gz = num(pl.bz, 0), L = hip(gx, gz) || 1;
          var cen = g.centroide(poli);
          aguas.push({ pts: poli, pct: Math.round(num(ag.inclinacao, 0) * 10) / 10, seta: { de: cen, dir: [-gx / L, -gz / L] }, pcts: num(pl.s, 0) * 100 });
          for (var i = 0; i < P.length; i++) {
            var a = P[i], b = P[(i + 1) % P.length], ch = pontoChave([a.x, a.z]) + "|" + pontoChave([b.x, b.z]), inv = pontoChave([b.x, b.z]) + "|" + pontoChave([a.x, a.z]);
            if (arestas[inv]) { arestas[inv].n++; } else arestas[ch] = { a: a, b: b, n: 1 };
          }
          void ys;
        });
      });
      var yMax = -Infinity; Object.keys(arestas).forEach(function (k) { yMax = Math.max(yMax, arestas[k].a.y, arestas[k].b.y); });
      Object.keys(arestas).forEach(function (k) {
        var e = arestas[k]; if (e.n < 2) return;
        var topo = Math.abs(e.a.y - yMax) < 0.01 && Math.abs(e.b.y - yMax) < 0.01, plano = Math.abs(e.a.y - e.b.y) < 0.01;
        if (topo || plano) cumeeiras.push([e.a.x, e.a.z, e.b.x, e.b.z]); else hips.push([e.a.x, e.a.z, e.b.x, e.b.z]);
      });
    }
    aguas.forEach(function (a) { D.poli(a.pts.map(function (p) { return M.Pp(p); }), "ARQ-TELHADO", true); });
    var beiral = (R && arr(R.beiral).length >= 3 ? R.beiral : t.pBeiral);
    if (beiral && o.beiral !== false) D.poli(beiral.map(function (p) { return M.Pp(p); }), "ARQ-BEIRAL", true);
    cumeeiras.forEach(function (s) { var a = M.P(s[0], s[1]), b = M.P(s[2], s[3]); D.linha(a[0], a[1], b[0], b[1], "ARQ-CUMEEIRA"); });
    hips.forEach(function (s) { var a = M.P(s[0], s[1]), b = M.P(s[2], s[3]); D.linha(a[0], a[1], b[0], b[1], "ARQ-ESPIGAO"); });
    return { aguas: aguas, cumeeiras: cumeeiras, hips: hips };
  }
  /* a seta de caimento de cada água e o "30 %" ao lado (só no lugar livre) */
  function setasCaimento(D, M, aguas) {
    var g = G(), semLugar = 0;
    aguas.forEach(function (a) {
      var polyP = a.pts.map(function (p) { return M.Pp(p); });
      if (g.areaPol(polyP) < 25) return;   /* a água cabe a seta de 7 mm? */
      var de, para;
      if (a.seta && a.seta.dir) { de = M.Pp(a.seta.de); para = [de[0] + a.seta.dir[0] * 7, de[1] + a.seta.dir[1] * 7]; }
      else if (a.seta && a.seta.para) { de = M.Pp(a.seta.de); para = M.Pp(a.seta.para); }
      else return;
      /* centraliza a seta na água e a encolhe até as duas pontas ficarem dentro dela */
      var k = 1, cx = de[0], cy = de[1], ux = para[0] - de[0], uy = para[1] - de[1];
      while (k > 0.3 && !(g.pontoEmPol([cx - ux * k / 2, cy - uy * k / 2], polyP) && g.pontoEmPol([cx + ux * k / 2, cy + uy * k / 2], polyP))) k -= 0.1;
      var p0 = [cx - ux * k / 2, cy - uy * k / 2], p1 = [cx + ux * k / 2, cy + uy * k / 2], L = hip(ux, uy) * k || 1;
      D.linha(p0[0], p0[1], p1[0], p1[1], "ARQ-TELHADO");
      D.seta(p1[0], p1[1], -ux / hip(ux, uy), -uy / hip(ux, uy), 2.0);
      /* R01: a seta de caimento do manual é um TRIÂNGULO CHEIO grande apontando para onde a água escorre (◄ ►) */
      (function () {
        var ex = ux / hip(ux, uy), ey = uy / hip(ux, uy), bx = p1[0] - ex * 3.8, by = p1[1] - ey * 3.8, hw = 1.7;
        D.add('<polygon points="' + [p1[0], p1[1]].map(function (v) { return Math.round(v * 1000) / 1000; }).join(",") + " " + [bx - ey * hw, by + ex * hw].map(function (v) { return Math.round(v * 1000) / 1000; }).join(",") + " " + [bx + ey * hw, by - ex * hw].map(function (v) { return Math.round(v * 1000) / 1000; }).join(",") + '" fill="#000" stroke="none" data-cam="ARQ-TELHADO"/>');
      })();
      var tx = (a.pcts != null ? a.pcts : a.pct), s = Math.round(tx) + " %";
      var nx = -uy / hip(ux, uy), ny = ux / hip(ux, uy), cands = [[1, 0], [-1, 0], [1, 1.6], [-1, 1.6]].map(function (q) { var f = q[0] * (3.4 + 1.3 * q[1]); return [(p0[0] + p1[0]) / 2 + nx * f, (p0[1] + p1[1]) / 2 + ny * f]; }), ok = false;
      for (var i = 0; i < cands.length && !ok; i++) {
        var w = DS().largTexto(s, 2.3);
        if (D.livre([cands[i][0] - w / 2, cands[i][1] - 1.7, cands[i][0] + w / 2, cands[i][1] + 0.6], 0.2)) { D.texto(cands[i][0], cands[i][1], s, 2.3, { al: "C" }); ok = true; }
      }
      if (!ok) semLugar++;
      void L;
    });
    return semLugar;
  }

  /* ================================================================ ARQ-05 COBERTURA */
  function cobertura(c) {
    var D = c.D, d = DS(), A = c.A, pl = c.plano, M = d.mapa(pl.caixa, A.x + 4 + d.K.margemCotas, A.y + 16 + d.K.margemCotas, pl.k), Lc = listas(c, "fantasma", null), g = G();
    titulo(c, A.x + 4, A.y + 2, "PLANTA DE COBERTURA", "ESC 1:" + pl.escala); d.escalaCota(D, pl.escala);
    d.paredesPlanta(D, M, Lc.paredes.concat(Lc.muros), "fantasma");
    d.rotulosMuros(D, M, Lc.muros);
    var Tl = arr(c.dados.telhados).filter(function (t) { return t.status !== "demolido"; }), res = [], sem = 0;
    Tl.forEach(function (t) {
      var r = desenharTelhado(D, M, t, {}); res.push(r);
      /* R01: HACHURA DA TELHA (linhas finas no sentido da cumeeira, como no manual) dentro de cada água, antes da seta */
      r.aguas.forEach(function (a) {
        var P = a.pts.map(function (p) { return M.Pp(p); });
        if (g.areaPol(P) < 12) return;
        var dx = a.seta && a.seta.dir ? a.seta.dir[0] : (a.seta && a.seta.para ? a.seta.para[0] - a.seta.de[0] : 1), dy = a.seta && a.seta.dir ? a.seta.dir[1] : (a.seta && a.seta.para ? a.seta.para[1] - a.seta.de[1] : 0);
        var ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        g.hachuraLinhas(P, 1.6, ang).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA"); });
      });
      sem += setasCaimento(D, M, r.aguas);
    });
    /* CALHA embutida (tracejada, o retângulo dela), DESCIDAS pluviais (círculo cheio = condutor), buzinote e ladrão da área técnica (quadrado), e o CAIMENTO da laje
       descoberta (seta e %): a legenda ao lado explica cada símbolo (25/10/2026, projeto exemplo) */
    arr(c.dados.calhas).forEach(function (k) { D.poli(k.pts.map(function (p) { return M.Pp(p); }), "ARQ-BEIRAL", true); });
    arr(c.dados.tubosAparentes).forEach(function (t) {
      if (Math.abs(t.a[0] - t.b[0]) > 0.02 || Math.abs(t.a[2] - t.b[2]) > 0.02 || Math.abs(t.a[1] - t.b[1]) < 0.3 || !/^(tel-calha|AP-AT-DESCIDA)/.test(t.id)) return;
      var q = M.Pp([t.a[0], t.a[2]]); D.circ(q[0], q[1], 1.1, "ARQ-TELHADO"); D.circ(q[0], q[1], 0.45, "ARQ-TELHADO");
    });
    arr(c.dados.tubosAparentes).forEach(function (t) {
      if (!/^AP-AT-(BUZINOTE|LADRAO)/.test(t.id)) return;
      var q = M.Pp([t.a[0], t.a[2]]); D.ret(q[0] - 1.1, q[1] - 1.1, 2.2, 2.2, "ARQ-TELHADO");
    });
    arr(c.dados.caimentos).forEach(function (q) {
      if (!/^AT-CAIMENTO$/.test(q.id)) return;   /* a seta da laje; as meias-canas vão na legenda */
      var cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, L = Math.min(q.x1 - q.x0, q.z1 - q.z0) * 0.4;
      sem += setasCaimento(D, M, [{ pts: [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]], seta: { de: [cx - q.dir[0] * L / 2, cz - q.dir[1] * L / 2], para: [cx + q.dir[0] * L / 2, cz + q.dir[1] * L / 2] }, pct: q.pct }]);
    });
    /* R02 (manual p.8/10): o que cobre cada parte é NOMEADO na planta — "TELHADO …" no pano maior de cada telhado e "LAJE EXISTENTE" onde o modelo tem laje.
       (O texto do tipo vem do telhado do modelo; a laje não é chamada de impermeabilizada porque o modelo não diz isso.) */
    Tl.forEach(function (t, i) {
      var r = res[i], maior = null; r.aguas.forEach(function (a) { var P = a.pts.map(function (p) { return M.Pp(p); }), ar = Math.abs(g.areaPol(P)); if (!maior || ar > maior.ar) maior = { P: P, ar: ar }; });
      if (!maior || maior.ar < 60) return;
      var tx = "TELHADO" + (t.tipo ? " — " + t.tipo.toUpperCase() : "") + " (ESTRUTURA CONFORME PROJETO)";
      if (d.largTexto(tx, 2.0) > Math.sqrt(maior.ar) * 1.6) tx = "TELHADO" + (t.tipo ? " " + t.tipo.toUpperCase() : "");
      if (!d.rotuloLivre(D, g.centroide(maior.P), tx, 2.0, maior.P)) sem++;
    });
    arr(c.dados.lajes).filter(function (l) { return l.status !== "demolido" && arr(l.pts).length >= 3; }).forEach(function (l) {
      var P = l.pts.map(function (p) { return M.Pp(p); });
      if (!d.rotuloLivre(D, g.centroide(P), "LAJE" + (l.status === "existente" ? " EXISTENTE" : "") + " (NÍVEL " + d.nivelTxt(l.topo) + ")", 2.0, P)) sem++;
    });
    /* cotas do beiral: o retângulo que o telhado ocupa */
    var xs = [], zs = [];
    Tl.forEach(function (t) { (t.pBeiral || t.pts).forEach(function (p) { xs.push(p[0]); zs.push(p[1]); }); });
    if (xs.length) {
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
      /* R02: as cotas da cobertura passam para FORA dos muros de divisa (antes a linha caía em cima da faixa do muro) */
      var pm = []; Lc.muros.forEach(function (w) { arr(w.pts).forEach(function (q) { pm.push(q); }); });
      var bm = pm.length ? g.bbox(pm) : null, offT = d.S.afastamento1() + (bm ? Math.max(0, z0 - bm[1]) * pl.k : 0), offL = d.S.afastamento1() + (bm ? Math.max(0, x0 - bm[0]) * pl.k : 0);
      D.cota(M.P(x0, z0)[0], M.P(x0, z0)[1], M.P(x1, z0)[0], M.P(x1, z0)[1], offT, d.cotaTxt(x1 - x0), { desde: [1.0, 1.0] });
      D.cota(M.P(x0, z1)[0], M.P(x0, z1)[1], M.P(x0, z0)[0], M.P(x0, z0)[1], offL, d.cotaTxt(z1 - z0), { desde: [1.0, 1.0] });
      /* o beiral: a distância do beiral à parede (cota curta) */
      Tl.forEach(function (t) {
        if (!(t.beiral > 0) || !t.pBeiral) return;
        var b = g.bbox(t.pts), bb = g.bbox(t.pBeiral);
        if (Math.abs((b[0] - bb[0]) - t.beiral) < 0.01) D.cota(M.P(bb[0], (z0 + z1) / 2)[0], M.P(bb[0], (z0 + z1) / 2)[1], M.P(b[0], (z0 + z1) / 2)[0], M.P(b[0], (z0 + z1) / 2)[1], -d.S.afastamento1(), d.cotaTxt(t.beiral), { desde: [false, false], semExt: true });
      });
      /* níveis: cumeeira e apoio */
      var yy = M.P(x1, z0)[1] - 4;
      Tl.forEach(function (t, i) {
        var s = (t.cumeeira > 0.05 ? "CUMEEIRA " : "PONTO MAIS ALTO ") + d.nivelTxt(t.cotaCumeeira) + " m";
        D.texto(M.P(x1, z0)[0] + 6, yy + i * 4.4, s, 2.5);
      });
    }
    var yb = M.oy + M.alt + d.K.margemCotas + 4;
    d.escalaGrafica(D, A.x + 6, yb + 4, pl.k, pl.k * 5 >= 12 ? 5 : 10);
    d.norte(D, A.x + 82, yb + 2, c.dados.terreno.norte, 7);
    if (!Tl.length) { D.texto(A.x + 10, A.y + 30, "SEM TELHADO NO MODELO: modele o telhado (op telhado) para esta folha.", 3.2, { cor: "#c00000" }); c.avisos.push("ARQ-05: o modelo não tem telhado."); }
    if (sem) c.avisos.push("ARQ-05: " + sem + " seta(s) de caimento sem lugar livre para o %.");
    return { escala: "1:" + pl.escala, telhados: Tl, M: M };
  }

  /* ================================================================ ARQ-06 FORRO */
  function forro(c) {
    var D = c.D, d = DS(), A = c.A, pl = c.plano, M = d.mapa(pl.caixa, A.x + 4 + d.K.margemCotas, A.y + 16 + d.K.margemCotas, pl.k), Lc = listas(c, "fantasma", 0), g = G(), cH = c.depois;
    titulo(c, A.x + 4, A.y + 2, "PLANTA DE FORRO", "ESC 1:" + pl.escala);
    d.paredesPlanta(D, M, Lc.paredes, "fantasma");
    d.vaosPlanta(D, M, Lc.vaos, porId(Lc.paredes), "fantasma");
    var Fs = arr(cH.forros).filter(function (f) { return f.status !== "demolido"; }), ambPorId = {};
    arr(cH.ambientes).forEach(function (a) { ambPorId[a.id] = a; });
    Fs.forEach(function (f) {
      var P = f.pts.map(function (p) { return M.Pp(p); });
      D.poli(P, "ARQ-FORRO", true);
      /* R02 (manual p.34–35): o REBAIXO DE GESSO leva HACHURA (forro de gesso ou drywall); laje ou outro tipo fica só no contorno */
      if (/(gesso|drywall)/i.test(txt(f.tipo)) && g.areaPol(P) > 20) g.hachuraLinhas(P, 2.4, 45).forEach(function (s0) { D.linha(s0[0], s0[1], s0[2], s0[3], "ARQ-HACHURA"); });
      var amb = ambPorId[f.ambienteId], sanca = /sanca/i.test(f.tipo) || /sanca/i.test(txt(amb && amb.forro)) || !!f.sanca;
      if (sanca) {
        var b = g.bbox(P), r = 0.15 * pl.k;   /* sanca: recuo de 15 cm do contorno (retângulo) */
        if (b[2] - b[0] > 2 * r + 2 && b[3] - b[1] > 2 * r + 2) D.poli([[b[0] + r, b[1] + r], [b[2] - r, b[1] + r], [b[2] - r, b[3] - r], [b[0] + r, b[3] - r]], "ARQ-SANCA", true);
      }
    });
    arr(c.dados.luminarias).forEach(function (l) {
      if (l.status === "demolido") return;
      var p = M.P(l.x, l.z);
      D.circ(p[0], p[1], 1.6, "ARQ-LUMINARIA"); D.linha(p[0] - 2.4, p[1], p[0] + 2.4, p[1], "ARQ-LUMINARIA"); D.linha(p[0], p[1] - 2.4, p[0], p[1] + 2.4, "ARQ-LUMINARIA");
    });
    var sem = [];
    Fs.forEach(function (f) {
      var amb = ambPorId[f.ambienteId], b = g.bbox(f.pts), P0 = M.P(b[0], b[1]), P1 = M.P(b[2], b[3]), cen = M.Pp(g.centroide(f.pts));
      var tipo = txt(f.tipo || "FORRO").toUpperCase(), niv = "NÍVEL " + d.nivelTxt(f.cota) + " m";
      var jogos = [[{ t: txt(amb ? amb.nome : "").toUpperCase(), h: 2.8 }, { t: tipo }, { t: niv }, { t: d.br(f.area, 2) + " m²" }], [{ t: tipo }, { t: niv }], [{ t: niv }]];
      if (!d.rotuloBloco(D, cen, null, [P0[0] + 0.5, P0[1] + 0.5, P1[0] - 0.5, P1[1] - 0.5], { jogos: jogos })) sem.push(txt(amb ? amb.nome : f.id));
    });
    var yb = M.oy + M.alt + d.K.margemCotas + 4;
    d.escalaGrafica(D, A.x + 6, yb + 4, pl.k, pl.k * 5 >= 12 ? 5 : 10);
    d.norte(D, A.x + 82, yb + 2, c.dados.terreno.norte, 7);
    if (!Fs.length) { D.texto(A.x + 10, A.y + 30, "SEM FORRO NO MODELO: modele o forro (op forro) para esta folha.", 3.2, { cor: "#c00000" }); c.avisos.push("ARQ-06: o modelo não tem forro."); }
    if (sem.length) c.avisos.push("ARQ-06: sem lugar livre para o rótulo de " + sem.join(", ") + ".");
    return { escala: "1:" + pl.escala, forros: Fs, M: M };
  }

  /* ================================================================ ARQ-09 PAGINAÇÃO DE PISO */
  function paginacaoAmbiente(est, a) {
    var BP = dep("BimPaginacao", "./bimpaginacao.js"); if (!BP) return null;
    try {
      var ap = null; try { ap = BP.pisoAplicado(est, a, {}); } catch (e0) { ap = null; }
      if (ap && ap.estado === "ok" && ap.res) return { res: ap.res, numeros: ap.numeros, rotulo: ap.rotulo, junta: ap.reg && ap.reg.j, origem: "receita gravada" };
      var geo = BP.geometriaPiso(est, a, {}); if (!geo.ok) return null;
      var prm = BP.paramsPadrao("piso"), op = BP.opcoesPiso(geo, prm);
      if (!op || !op.ok) return null;
      var o1 = op.opcoes.filter(function (x) { return x.id === op.melhor; })[0] || op.opcoes[0];
      return o1 ? { res: o1.res, numeros: o1.numeros, rotulo: BP.rotuloPeca(prm.L, prm.C), junta: prm.j, origem: "automática (" + o1.rotulo + ")" } : null;
    } catch (e) { return null; }
  }
  function paginacao(c) {
    var D = c.D, d = DS(), A = c.A, pl = c.plano, M = d.mapa(pl.caixa, A.x + 4 + d.K.margemCotas, A.y + 16 + d.K.margemCotas, pl.k), Lc = listas(c, "fantasma", 0), est = c.estadoDepois, sem = [], linhas = [];
    titulo(c, A.x + 4, A.y + 2, "PAGINAÇÃO DE PISO", "ESC 1:" + pl.escala);
    d.paredesPlanta(D, M, Lc.paredes, "fantasma");
    d.vaosPlanta(D, M, Lc.vaos, porId(Lc.paredes), "fantasma");
    arr(est && est.ambientes).forEach(function (a) {
      var am = arr(c.depois.ambientes).filter(function (x) { return x.id === String(a.id); })[0]; if (!am || am.pav !== 0) return;
      if (PERM_RE.test(txt(am.piso) + " " + txt(am.nome))) return;   /* jardim, gramado: sem paginação de piso */
      var pg = paginacaoAmbiente(est, a);
      if (!pg || !pg.res) { sem.push(am.nome); return; }
      arr(pg.res.pecas).forEach(function (p) {
        if (!p.poli || p.poli.length < 3) return;
        var P = p.poli.map(function (q) { return M.Pp(q); });
        var cm = p.inteira ? "ARQ-PISO" : "ARQ-PISO-RECORTE";
        D.add('<polygon points="' + d.pts(P) + '" fill="none"' + d.atr(D, cm, 1) + "/>");   /* a peça não entra nos obstáculos: o rótulo leva fundo branco */
      });
      var n = pg.numeros || {};
      linhas.push({ amb: am, pg: pg, n: n });
    });
    /* nome do ambiente + peça no lugar livre mais perto do centro (as peças são linhas; o rótulo procura vão livre de traço) */
    linhas.forEach(function (L) {
      var am = L.amb, b = am.bbox, P0 = M.P(b[0], b[1]), P1 = M.P(b[2], b[3]);
      var js = [[{ t: txt(am.nome).toUpperCase(), h: 2.8 }, { t: "Piso " + L.pg.rotulo }, { t: (L.n.pecas || "?") + " pç / " + d.br(L.n.m2Compra, 2) + " m²" }], [{ t: txt(am.nome).toUpperCase(), h: 2.6 }, { t: L.pg.rotulo }], [{ t: txt(am.nome).toUpperCase(), h: 2.4 }]];
      /* o rótulo cobre as peças com fundo branco: assim a leitura não briga com a junta */
      var cc = d.rotuloBloco(D, M.P(am.cx, am.cz), null, [P0[0] + 0.5, P0[1] + 0.5, P1[0] - 0.5, P1[1] - 0.5], { jogos: js, fundo: true });
      if (!cc) sem.push(am.nome);
    });
    var yb = M.oy + M.alt + d.K.margemCotas + 4;
    d.escalaGrafica(D, A.x + 6, yb + 4, pl.k, pl.k * 5 >= 12 ? 5 : 10);
    d.norte(D, A.x + 82, yb + 2, c.dados.terreno.norte, 7);
    if (!linhas.length) { D.texto(A.x + 10, A.y + 30, "SEM AMBIENTE PAGINÁVEL NO MODELO.", 3.2, { cor: "#c00000" }); c.avisos.push("ARQ-09: nenhum ambiente delimitado para paginar."); }
    if (sem.length) c.avisos.push("ARQ-09: sem paginação / sem lugar para o rótulo: " + sem.join(", ") + ".");
    return { escala: "1:" + pl.escala, linhas: linhas, M: M };
  }
  var PERM_RE = /(grama|gramado|jardim|canteiro|terra|perme|drenante|vegeta|horta|pomar|solo)/i;

  /* ================================================================ ARQ-01 SITUAÇÃO E IMPLANTAÇÃO */
  function dentroDe(P, pt) { return G().pontoEmPol(pt, P); }
  function situacao(c) {
    var D = c.D, d = DS(), A = c.A, g = G(), idx = c.idx, T = c.dados.terreno, lote = idx.terreno.contorno || (T.divisa && T.divisa.pts) || null, sem = [];
    var wQuadro = Math.min(176, Math.max(140, A.w * 0.34)), wDes = A.w - wQuadro - 8;
    titulo(c, A.x + 4, A.y + 2, "SITUAÇÃO E IMPLANTAÇÃO", "ESC 1:" + c.escalaSit); d.escalaCota(D, c.escalaSit);
    if (!lote) {
      D.texto(A.x + 10, A.y + 30, "SEM DIVISA DO LOTE NO MODELO: modele a divisa (linha de propriedade) ou informe o contorno do lote.", 3.2, { cor: "#c00000" });
      c.avisos.push("ARQ-01: sem a divisa do lote — a folha sai sem a implantação.");
    } else {
      var bl = g.bbox(lote), k = 1000 / c.escalaSit, ox = A.x + 4 + 26, oy = A.y + 16 + 26;
      var M = d.mapa(bl, ox, oy, k), P = lote.map(function (p) { return M.Pp(p); });
      /* terreno permeável: hachura verde fina por baixo */
      arr(T.subregioes).forEach(function (s) {
        if (!d_permeavel(s)) return;
        var Q = s.pts.map(function (p) { return M.Pp(p); });
        g.hachuraLinhas(Q, 2.2, 45).forEach(function (sg) { D.linha(sg[0], sg[1], sg[2], sg[3], "ARQ-HACHURA-PERM"); });
        D.poli(Q, "ARQ-HACHURA-PERM", true);
      });
      D.poli(P, "ARQ-DIVISA", true);
      /* cobertura vista de cima (as águas do telhado) e a edificação por baixo, tracejada */
      var Lc = listas(c, "fantasma", null);
      Lc.paredes.forEach(function (w) { D.poli(w.pts.map(function (p) { return M.Pp(p); }), "ARQ-OCULTA", true); });
      arr(c.dados.telhados).forEach(function (t) { var r = desenharTelhado(D, M, t, {}); setasCaimento(D, M, r.aguas); });
      /* muros: a linha grossa sobre a divisa/recuo (paredes marcadas muro) */
      Lc.muros.forEach(function (w) { D.poli(w.pts.map(function (p) { return M.Pp(p); }), "ARQ-MURO", true); });
      arr(T.componentes).forEach(function (cp) { var p = M.P(cp.x, cp.z), r = Math.max(1.4, Math.min(5, cp.altura * 0.25 * k)); D.circ(p[0], p[1], r, "ARQ-HACHURA-PERM"); D.ponto(p[0], p[1], 0.35, "#3c7a2a"); });
      /* cotas das divisas (lado de fora) */
      var n = lote.length;
      for (var i = 0; i < n; i++) {
        var a = lote[i], b = lote[(i + 1) % n], pa = M.Pp(a), pb = M.Pp(b), L = hip(b[0] - a[0], b[1] - a[1]), ux = (pb[0] - pa[0]) / (hip(pb[0] - pa[0], pb[1] - pa[1]) || 1), uy = (pb[1] - pa[1]) / (hip(pb[0] - pa[0], pb[1] - pa[1]) || 1);
        var mid = [(pa[0] + pb[0]) / 2 + uy * 0.5, (pa[1] + pb[1]) / 2 - ux * 0.5], dentro = g.pontoEmPol([(pa[0] + pb[0]) / 2 + uy * 0.5, (pa[1] + pb[1]) / 2 - ux * 0.5], P);
        /* n = (uy, -ux) é a esquerda do sentido; o desvio + vai para lá — se aí for dentro do lote, vira o sinal */
        var of9 = (dentro ? -1 : 1) * d.S.afastamento1() * 1.8, ofs = [of9 * 1.5, of9 * 2, -of9 * 0.6, -of9 * 1.1];
        D.cota(pa[0], pa[1], pb[0], pb[1], of9, d.cotaTxt(L), { desde: [1.0, 1.0], offs: ofs });
        void mid;
      }
      /* recuos: do ponto mais perto da edificação até a divisa */
      var edif = []; Lc.paredes.concat(Lc.pilares).forEach(function (w) { edif.push(w.pts); }); arr(Lc.lajes).forEach(function (l) { edif.push(l.pts); });
      (idx.recuos || []).forEach(function (r) {
        if (r.recuo == null) return;
        var best = null, bd = Infinity;
        edif.forEach(function (Pg) { Pg.forEach(function (q) { var dq = g.distPontoSeg(q, r.de, r.para); if (dq < bd) { bd = dq; best = q; } }); });
        if (!best) return;
        var ex = r.para[0] - r.de[0], ez = r.para[1] - r.de[1], L = hip(ex, ez) || 1, t = ((best[0] - r.de[0]) * ex + (best[1] - r.de[1]) * ez) / (L * L), foot = [r.de[0] + ex * t, r.de[1] + ez * t];
        var p0 = M.Pp(best), p1 = M.Pp(foot), Lp = hip(p1[0] - p0[0], p1[1] - p0[1]);
        if (Lp < 9) { sem.push("recuo " + r.nome); return; }
        recuoCota(D, p0, p1, d.cotaTxt(r.recuo));
        r._p = [p0, p1];
      });
      /* a rua: duas linhas paralelas fora da divisa da frente */
      var fi = idx.ladoFrente; if (fi != null && fi >= 0) {
        var fa = M.Pp(lote[fi]), fb = M.Pp(lote[(fi + 1) % n]), fx = fb[0] - fa[0], fy = fb[1] - fa[1], fL = hip(fx, fy) || 1, nx = fy / fL, ny = -fx / fL;
        var cen = M.Pp(g.centroide(lote)), lado = ((fa[0] + fb[0]) / 2 + nx - cen[0]) * nx + ((fa[1] + fb[1]) / 2 + ny - cen[1]) * ny > 0 ? 1 : -1;
        nx *= lado; ny *= lado;
        /* R02 (manual p.6–8): o PASSEIO com o MEIO-FIO e o EIXO DA RUA na escala (passeio 2,00 m e meia rua 3,50 m: a mesma convenção declarada nos cortes), a RAMPA do rebaixo
           do meio-fio em frente ao portão da garagem (c.op.situacao.rampa = { x0, x1, nome } em metros do modelo) e os nomes de cada linha */
        var psM = num(c.op.passeio, 2.0), mrM = num(c.op.ruaMeia, 3.5), ps = psM * k, mr = mrM * k;
        var a1 = [fa[0] + nx * ps, fa[1] + ny * ps], b1 = [fb[0] + nx * ps, fb[1] + ny * ps], a2 = [fa[0] + nx * (ps + mr), fa[1] + ny * (ps + mr)], b2 = [fb[0] + nx * (ps + mr), fb[1] + ny * (ps + mr)];
        var ex1 = (fx / fL) * 16, ey1 = (fy / fL) * 16, ux1 = fx / fL, uy1 = fy / fL;
        D.linha(a1[0] - ex1, a1[1] - ey1, b1[0] + ex1, b1[1] + ey1, "ARQ-CONTEXTO"); D.linha(a2[0] - ex1, a2[1] - ey1, b2[0] + ex1, b2[1] + ey1, "ARQ-EIXO");
        var a1b = [a1[0] + nx * 0.15 * k, a1[1] + ny * 0.15 * k], b1b = [b1[0] + nx * 0.15 * k, b1[1] + ny * 0.15 * k];
        D.linha(a1b[0] - ex1, a1b[1] - ey1, b1b[0] + ex1, b1b[1] + ey1, "ARQ-CONTEXTO");   /* a espessura do meio-fio (15 cm) */
        var angR = Math.atan2(fy, fx) * 180 / Math.PI; if (angR > 90) angR -= 180; if (angR < -90) angR += 180;
        var horizF = Math.abs(fy) < Math.abs(fx), xl = Math.min(fa[0], fb[0]) + 20;
        [[ps * 0.5, "PASSEIO " + d.br(psM, 2) + " m"], [ps + 0.15 * k + 2.4, "MEIO-FIO"], [ps + mr + 2.4, "EIXO DA RUA"]].forEach(function (q, iq) {
          var pc = horizF ? [xl, fa[1] + ny * q[0]] : [(fa[0] + fb[0]) / 2 + nx * q[0] - ux1 * 26, (fa[1] + fb[1]) / 2 + ny * q[0] - uy1 * 26];
          D.texto(pc[0], pc[1] + (iq === 0 ? 0.7 : 0.4), q[1], iq === 0 ? 2.2 : 2.0, { al: "C", rot: horizF ? 0 : angR, meio: true });
        });
        var rp = c.op.situacao && c.op.situacao.rampa;
        if (rp && Math.abs(fy) < Math.abs(fx) && rp.x1 > rp.x0) {
          var zf = lote[fi][1], pA = M.P(rp.x0, zf), pB = M.P(rp.x1, zf), sx = Math.sign(pB[0] - pA[0]) || 1, aba = 0.5 * k;
          var q0 = [pA[0], pA[1]], q1 = [pB[0], pB[1]], q2 = [pB[0] + sx * aba, pB[1] + ny * ps], q3 = [pA[0] - sx * aba, pA[1] + ny * ps];
          d.fundoPol(D, [q0, q1, q2, q3], "#fff"); D.poli([q0, q1, q2, q3], "ARQ-CONTEXTO", true);
          g.hachuraLinhas([q0, q1, q2, q3], 1.8, 60).forEach(function (sg2) { D.linha(sg2[0], sg2[1], sg2[2], sg2[3], "ARQ-HACHURA"); });
          var tr = "RAMPA DO REBAIXO DO MEIO-FIO (ACESSO" + (rp.nome ? " " + rp.nome : "") + ")", wtr = d.largTexto(tr, 2.0), cxr = (pA[0] + pB[0]) / 2, cyr = pA[1] + ny * (ps + 0.15 * k + 4.6);
          D.texto(cxr, cyr, tr, 2.0, { al: "C", meio: true });
          void wtr;
        }
        var rua = txt(c.op.rua).trim(), mc = [(a1[0] + b2[0]) / 2 - (fx / fL) * 0, (a1[1] + b2[1]) / 2];
        var ang = Math.atan2(fy, fx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        D.texto(mc[0] - (rua ? 0 : 0), mc[1] + 0.4, rua ? "RUA " + rua.replace(/^rua\s+/i, "").toUpperCase() : "RUA [INFORME O NOME DA RUA]", 3.2, { al: "C", rot: ang, cor: rua ? null : "#c00000", meio: true });
      }
      d.norte(D, A.x + wDes - 12, A.y + 30, T.norte, 7);
      d.escalaGrafica(D, A.x + 8, M.oy + M.alt + (num(c.op.passeio, 2.0) + num(c.op.ruaMeia, 3.5)) * k + 14, k, k * 10 >= 14 ? 10 : 20);
      c._sitM = M; c._sitDes = { wDes: wDes };
    }
    return { escala: "1:" + c.escalaSit, semLugar: sem };
  }
  /* a cota do recuo: linha com traços nas pontas e o número no primeiro ponto livre ao longo dela (a linha cruza o beiral e a divisa) */
  function recuoCota(D, p0, p1, valor) {
    var d = DS(), S = d.S, L = hip(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L, h0 = S.alturaCota(D.escCota);
    D.linha(p0[0], p0[1], p1[0], p1[1], "MET-COTA"); D.tique(p0[0], p0[1], ux, uy); D.tique(p1[0], p1[1], ux, uy);
    var horiz = Math.abs(uy) < 0.2, ts = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, -0.5, 1.5], ok = false, hs = [h0, Math.max(S.TEXTOS.cota.minimo, h0 * 0.8), S.TEXTOS.cota.minimo], ac = S.COTA.texto_acima_da_linha_mm, la = S.COTA.texto_ao_lado_vertical_mm;
    /* o número do recuo no primeiro ponto livre ao longo da linha (a linha cruza o beiral e a divisa); se a altura da escala não couber, encolhe até o mínimo do padrão (2,0) */
    for (var ih = 0; ih < hs.length && !ok; ih++) {
      var h = hs[ih], w = d.largTexto(valor, h);
      for (var i = 0; i < ts.length && !ok; i++) {
        var x = p0[0] + (p1[0] - p0[0]) * ts[i], y = p0[1] + (p1[1] - p0[1]) * ts[i];
        [1, -1].forEach(function (sg) {
          if (ok) return;
          var bx = horiz ? [x - w / 2, y + (sg > 0 ? -ac - h * 0.76 : 0.6), x + w / 2, y + (sg > 0 ? -0.6 : ac + h * 0.76 + 0.5)] : [x + (sg > 0 ? -la - h * 0.76 : 0.6), y - w / 2, x + (sg > 0 ? -0.6 : la + h * 0.76 + 0.5), y + w / 2];
          if (!D.livre(bx, 0.25)) return;
          if (horiz) D.texto(x, y + (sg > 0 ? -ac : ac + h * 0.76), valor, h, { al: "C" });
          else D.texto(x + (sg > 0 ? -la : la + h * 0.76), y, valor, h, { al: "C", rot: -90 });
          ok = true;
        });
      }
    }
    if (!ok) { var xm = (p0[0] + p1[0]) / 2, ym = (p0[1] + p1[1]) / 2; D.texto(xm, ym - ac, valor, hs[2], { al: "C", rot: horiz ? 0 : -90 }); }
  }
  function d_permeavel(s) { return /(grama|gramado|jardim|canteiro|terra|solo|vegeta|seixo)/i.test(txt(s.material)) || /(grama|jardim|canteiro)/i.test(txt(s.nome)); }

  /* ================================================================ PLANTA HUMANIZADA */
  var PALETA = { madeira: "#c8a070", ceramica: "#e6dfd0", grama: "#9ccc7a", agua: "#6ec3ea", pedra: "#cfcfcf", padrao: "#efe9de", azulejo: "#d9e6ee", deck: "#b98a5a" };
  function corPiso(t) {
    t = txt(t);
    if (/deck/i.test(t)) return PALETA.deck;
    if (/madeira|laminado|assoalho|tauari|ip[êe]|parquet/i.test(t)) return PALETA.madeira;
    if (/grama|gramado|jardim|canteiro|vegeta|terra/i.test(t)) return PALETA.grama;
    if (/piscina|[áa]gua|espelho/i.test(t)) return PALETA.agua;
    if (/concreto|cimento|queimado|pedra|cal[çc]ada|granito|ard[óo]sia/i.test(t)) return PALETA.pedra;
    if (/porcelanato|cer[âa]mica|piso|retificado/i.test(t)) return PALETA.ceramica;
    return PALETA.padrao;
  }
  function corMovel(m, s) {
    var mat = txt(s && s.material) + " " + txt(m.nome) + " " + txt(m.famId) + " " + arr(m.mats).join(" ");
    if (/piscina/i.test(txt(m.famId) + " " + txt(m.nome))) return PALETA.agua;
    if (/guarda-sol|guarda_sol|guardasol/i.test(txt(m.famId) + " " + txt(m.nome))) return "#efe3c8";
    if (/laca grafite/i.test(mat)) return "#5a5d61";
    if (/laca branca|mdf branco|acr[ií]lico/i.test(mat) && !/madeira/i.test(mat)) return "#f1f1ee";
    if (/vidro/i.test(mat)) return "#cfe8f3";
    if (/granito|pedra|m[áa]rmore|bancada/i.test(mat)) return m.categoria === "mobiliario" && /bancada/i.test(mat) ? "#8a8a8a" : "#9a9a9a";
    if (/madeira|marcenaria|mdf|carvalho|nogueira/i.test(mat)) return "#a9825a";
    if (/inox|metal|cromado|alum[ií]nio/i.test(mat)) return "#c4c9ce";
    if (/lou[çc]a|branco|bacia|lavat/i.test(mat) || m.categoria === "loucas") return "#fafafa";
    if (/sof[áa]|estofado|tecido/i.test(mat)) return "#8e9aa8";
    return "#b9a58c";
  }
  /* a textura do piso em traço fino: paginação do porcelanato (peça da descrição, 60 cm se não houver), réguas de madeira, deck, água */
  function texturaPiso(D, g, P, tx, k) {
    var pc = /(\d+)\s*[x×]\s*(\d+)/i.exec(tx), L = pc ? +pc[1] / 100 : 0.6, C = pc ? +pc[2] / 100 : 0.6;
    function linhas(passo, ang, cam) { if (!(passo > 1.2)) return; g.hachuraLinhas(P, passo, ang).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], cam); }); }
    if (/deck/i.test(tx)) { linhas(0.1 * k, 0, "ARQ-HUM-MADEIRA"); return; }
    if (/madeira|laminado|assoalho|parquet|tauari|ip[êe]/i.test(tx)) { linhas(0.16 * k, 0, "ARQ-HUM-MADEIRA"); return; }
    if (/piscina|[áa]gua|espelho/i.test(tx)) { linhas(0.5 * k, 35, "ARQ-HUM-AGUA"); return; }
    if (/grama|gramado|jardim|canteiro|vegeta|terra|concreto|cimento|pedra/i.test(tx)) return;
    if (/porcelanato|cer[âa]mica|piso|retificado/i.test(tx)) { linhas(L * k, 0, "ARQ-HUM-PISO"); linhas(C * k, 90, "ARQ-HUM-PISO"); }
  }
  /* a humanizada mostra também o entorno (3 m em volta da edificação, até a divisa) na maior escala que cabe */
  function planoHumanizado(c) {
    var g = G(), cx = c.plano.caixa, e = 3, bx = [cx[0] - e, cx[1] - e, cx[2] + e, cx[3] + e], L = c.dados.terreno && c.dados.terreno.divisa ? g.bbox(c.dados.terreno.divisa.pts) : null;
    if (L) bx = [Math.max(bx[0], L[0]), Math.max(bx[1], L[1]), Math.min(bx[2], L[2]), Math.min(bx[3], L[3])];
    var a = c.A, esc = [50, 75, 100, 125, 150, 200, 250];
    for (var i = 0; i < esc.length; i++) { var k = 1000 / esc[i]; if ((bx[2] - bx[0]) * k + 16 <= a.w && (bx[3] - bx[1]) * k + 40 <= a.h) return { k: k, escala: esc[i], caixa: bx }; }
    return { k: 1000 / 250, escala: 250, caixa: bx };
  }
  function humanizada(c) {
    var D = c.D, d = DS(), A = c.A, g = G(), T = c.dados.terreno, pl = planoHumanizado(c);
    var M = d.mapa(pl.caixa, A.x + 4 + 6, A.y + 16 + 6, pl.k), Lc = listas(c, "humanizada", 0);
    titulo(c, A.x + 4, A.y + 2, "PLANTA HUMANIZADA", "ESC 1:" + pl.escala);
    /* terreno: o lote em verde claro e as sub-regiões por material */
    if (T.divisa) {
      var bl = g.bbox(T.divisa.pts);
      /* só o que cabe no papel: o lote inteiro pode ser maior que a área, então recorta o desenho à caixa da planta */
      void bl;
    }
    var gramaFundo = M.alt > 0 ? [[M.ox - 12, M.oy - 12], [M.ox + M.larg + 12, M.oy - 12], [M.ox + M.larg + 12, M.oy + M.alt + 12], [M.ox - 12, M.oy + M.alt + 12]] : null;
    if (gramaFundo) d.fundoPol(D, gramaFundo, "#e9f2dc", "ARQ-HUM");
    arr(T.subregioes).forEach(function (s) {
      var P = s.pts.map(function (p) { return M.Pp(p); });
      var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
      if (Math.max.apply(null, xs) < gramaFundo[0][0] || Math.min.apply(null, xs) > gramaFundo[1][0] || Math.max.apply(null, ys) < gramaFundo[0][1] || Math.min.apply(null, ys) > gramaFundo[2][1]) return;
      var cl = Math.max(gramaFundo[0][0], Math.min.apply(null, xs)), cr = Math.min(gramaFundo[1][0], Math.max.apply(null, xs)), ct = Math.max(gramaFundo[0][1], Math.min.apply(null, ys)), cb = Math.min(gramaFundo[2][1], Math.max.apply(null, ys));
      d.fundoPol(D, [[cl, ct], [cr, ct], [cr, cb], [cl, cb]], corPiso(s.material + " " + s.nome), "ARQ-HUM");
      texturaPiso(D, g, [[cl, ct], [cr, ct], [cr, cb], [cl, cb]], s.material + " " + s.nome, pl.k);
    });
    /* pisos por ambiente (o cômodo inteiro) */
    Lc.ambientes.forEach(function (a) { var P = a.pts.map(function (p) { return M.Pp(p); }), tx = a.piso + " " + a.nome; d.fundoPol(D, P, corPiso(tx), "ARQ-HUM"); texturaPiso(D, g, P, tx, pl.k); });
    Lc.lajes.forEach(function (l) {
      if (Lc.ambientes.some(function (a) { return g.pontoEmPol([a.cx, a.cz], l.pts); })) return;
      d.fundoPol(D, l.pts.map(function (p) { return M.Pp(p); }), "#e4dcc9", "ARQ-HUM");
    });
    /* sombra leve das paredes: o contorno deslocado 1 mm para baixo e para a direita */
    Lc.paredes.forEach(function (w) { d.fundoPol(D, w.pts.map(function (p) { var q = M.Pp(p); return [q[0] + 1.0, q[1] + 1.0]; }), "#a8a8a8", "ARQ-HUM"); });
    d.paredesPlanta(D, M, Lc.paredes, "humanizada");
    d.pilaresPlanta(D, M, Lc.pilares, "humanizada");
    d.vaosPlanta(D, M, Lc.vaos, porId(Lc.paredes), "humanizada");
    /* mobiliário colorido com sombra */
    var pecas = Lc.moveis.filter(function (m) { return !m.simbolo; }), plantas = Lc.moveis.filter(function (m) { return !!m.simbolo; });
    pecas.forEach(function (m) {
      var P = m.pts.map(function (p) { return M.Pp(p); });
      d.fundoPol(D, P.map(function (q) { return [q[0] + 0.7, q[1] + 0.7]; }), "#b9b9b9", "ARQ-HUM");
      /* família de malha (sem sólido caixa/cilindro): a pegada leva a cor do material; a piscina leva o azul da água */
      if (!arr(m.solidos).some(function (so) { return so.forma === "caixa" || so.forma === "cilindro"; })) d.fundoPol(D, P, corMovel(m, null), "ARQ-HUM");
    });
    d.moveisPlanta(D, M, pecas, { cheio: corMovel });
    /* plantas de paisagismo: o símbolo de copa/forração que a própria família devolve (círculos de projeção, tronco, faixa), com sombra */
    plantas.forEach(function (m) {
      var cs = Math.cos(m.rotY), sn = Math.sin(m.rotY), sm = m.simbolo || {};
      function W(u, v) { return M.P(m.x + u * cs + v * sn, m.z - u * sn + v * cs); }
      if (sm.faixa) {
        var fa = sm.faixa, hw = (fa.larg || 1) / 2, hp = (fa.prof || 1) / 2, Pf = [W(fa.x - hw, fa.z - hp), W(fa.x + hw, fa.z - hp), W(fa.x + hw, fa.z + hp), W(fa.x - hw, fa.z + hp)];
        d.fundoPol(D, Pf, /seixo|pedra/i.test(txt(m.famId)) ? "#d8d4c8" : "#86b863", "ARQ-HUM");
      }
      arr(sm.copa).forEach(function (cp) {
        var q = W(cp.x, cp.z), r = Math.max(0.8, cp.r * pl.k);
        D.add('<circle cx="' + d.n(q[0] + 0.9) + '" cy="' + d.n(q[1] + 0.9) + '" r="' + d.n(r) + '" fill="#b7c9a3" stroke="none" data-cam="ARQ-HUM"/>');
        D.add('<circle cx="' + d.n(q[0]) + '" cy="' + d.n(q[1]) + '" r="' + d.n(r) + '" fill="#6aa84f" stroke="#3f7a2c" stroke-width="0.18" data-cam="ARQ-HUM"/>');
      });
      arr(sm.tronco).forEach(function (tr) { var q = W(tr.x, tr.z); D.add('<circle cx="' + d.n(q[0]) + '" cy="' + d.n(q[1]) + '" r="' + d.n(Math.max(0.4, tr.r * pl.k)) + '" fill="#7a5a3a" stroke="none" data-cam="ARQ-HUM"/>'); });
    });
    /* vegetação com copa e sombra */
    arr(T.componentes).forEach(function (cp) {
      var p = M.P(cp.x, cp.z), r = Math.max(1.6, Math.min(8, Math.max(cp.altura, 1) * 0.28 * pl.k));
      if (p[0] < gramaFundo[0][0] || p[0] > gramaFundo[1][0] || p[1] < gramaFundo[0][1] || p[1] > gramaFundo[2][1]) return;
      D.add('<circle cx="' + d.n(p[0] + 0.9) + '" cy="' + d.n(p[1] + 0.9) + '" r="' + d.n(r) + '" fill="#b7c9a3" stroke="none" data-cam="ARQ-HUM"/>');
      D.add('<circle cx="' + d.n(p[0]) + '" cy="' + d.n(p[1]) + '" r="' + d.n(r) + '" fill="#6aa84f" stroke="#3f7a2c" stroke-width="0.18" data-cam="ARQ-HUM"/>');
      D.add('<circle cx="' + d.n(p[0] - r * 0.25) + '" cy="' + d.n(p[1] - r * 0.25) + '" r="' + d.n(r * 0.55) + '" fill="#86bf67" stroke="none" data-cam="ARQ-HUM"/>');
      D.ponto(p[0], p[1], 0.35, "#5b3a1e");
    });
    /* nomes dos ambientes, sem cotas técnicas */
    var sem = d.rotulosAmbientes(D, M, Lc.ambientes, { completo: false });
    if (sem.length) c.avisos.push("Humanizada: sem lugar livre para o nome de " + sem.join(", ") + ".");
    var yb = M.oy + M.alt + 14;
    d.norte(D, A.x + 20, yb + 2, T.norte, 7);
    d.escalaGrafica(D, A.x + 50, yb + 4, pl.k, pl.k * 5 >= 12 ? 5 : 10);
    return { escala: "1:" + pl.escala, M: M };
  }

  var ArqPlantas = { planta: planta, situacao: situacao, cobertura: cobertura, forro: forro, paginacao: paginacao, humanizada: humanizada, desenharTelhado: desenharTelhado, setasCaimento: setasCaimento,
    listas: listas, corPiso: corPiso, PALETA: PALETA, FASES_MODO: FASES_MODO, porId: porId };
  global.ArqPlantas = ArqPlantas;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqPlantas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * climpranchas.js — PRANCHAS DO PROJETO DE CLIMATIZAÇÃO (frente C2).
 * Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   ClimPranchas.gerar(resultado, modelo, opcoes) → { ok, folhas: [{ id, rotulo,
 *       numero, titulo, formato, escala, svg, caixasTexto }], avisos, verificacao, fixture }
 *   resultado = ClimDimensionar.calcular(...)  (docs/hidro/CONTRATO-CLIMA.md §4)
 *   modelo    = { estado, avaliarFam }   (o mesmo de entrada.modelo; só para ler os
 *               ambientes) — ou opcoes.ambientes = lista AmbienteClim (CONTRATO-CLIMA §2.1)
 *   opcoes    = { pavimentos: [{ id?, nome, cota }], formato ("A1"), codigo, revisao, data,
 *                 empresa, responsavel, registro, obra, proprietario, contratante, local,
 *                 logo, anguloNorte }
 *   ClimPranchas.exportar(r, "pdf" | "svg")
 *
 * O jogo (docs/hidro/PADRAO-PRANCHA-CLIMA.md):
 *   CLI-01…  PLANTA DE CLIMATIZAÇÃO por pavimento (evaporadoras, condensadoras, linhas
 *            frigorígenas, drenos, pontos de força)
 *   CLI-nn   ESQUEMA FRIGORÍGENO (unifilar por sistema)
 *   CLI-nn   DUTOS (só se o resultado traz duto)
 *   CLI-nn   DETALHES TÍPICOS (suporte, dreno com sifão, passagem de tubo, evaporadora)
 *   CLI-nn   QUADRO DE CARGAS E EQUIPAMENTOS (por ambiente: carga, equipamento, folga)
 *
 * PADRÃO: papel, moldura e CARIMBO RA vêm do js/prancha.js (o carimbo não muda); letra,
 * tabela e título do desenho da casa (js/acopranchas.js); os rótulos da planta passam pelo
 * mesmo algoritmo de afastamento do hidrossanitário (HidIsometrico.afastar) e TODA folha
 * sai com a conferência de sobreposição de texto no fim (regra da RA).
 *
 * ⚠ NADA É INVENTADO: capacidade, diâmetro, comprimento, inclinação, carga do suporte e
 *   vazão do duto vêm do RESULTADO; o que o cálculo não fechou sai em VERMELHO como
 *   "não verificado: falta <o quê>" — nunca como atendido. Dimensão de manual de
 *   fabricante que o catálogo não trouxe fica "a conferir".
 * Teste: node tools/test-clim-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* clim:fisica-inicio — GEOMETRIA DE DESENHO da prancha (mm de papel). Não é valor de norma nem de fabricante. */
  var K2 = {
    escalas: [25, 50, 75, 100, 125, 150, 200, 250, 300],
    titulo: 16, folgaFolha: 6, margem: 8, tolPiso_m: 0.05,
    evap: [7, 2.6], cond: [6, 6], rFan: 2.2, rPf: 1.3, term: 3, seta: 1.6,
    offLiq: 0, offSuc: 1.1, offDre: -1.2, dutoMin: 1.6,
    pena: { LIQ: 0.25, SUC: 0.35, DRE: 0.25, INS: 0.35, RET: 0.35, EQUIP: 0.35, simbolo: 0.25, cota: 0.13, fina: 0.18, tabela: 0.25, titulo: 0.35, moldura: 0.5, contexto: 0.13, eixo: 0.13 },
    cor: { LIQ: "#D9731E", SUC: "#7B3FA0", DRE: "#1E6FD9", INS: "#1B7F3B", RET: "#9A7B00" },
    tracoDRE: "6 2", tracoRET: "8 2 2 2", tracoEixo: "9.6 1.6 0.4 1.6", vermelho: "#c00000",
    legLinha: 5.2, legSimbolo: 5, legTexto: 12, notaLinha: 1.42, notaEntre: 0.7, blocoEntre: 3.5, tituloQuadro: 0.62, tituloEntre: 1.31,
    maxPend: 14, maxNorma: 150, erroX: 10, erroY: 20, parEx: 5, parAviso: 3,
    /* esquema frigorígeno */
    es: { evW: 62, evH: 17, condW: 62, condMin: 34, linhaEntre: 6, bandaTit: 9, bandaEntre: 8, txtEntre: 1.45, folgaLinha: 3.5, colTexto: 8, txtOff: 2.6 },
    /* detalhes típicos */
    det: { gap: 8, txtY: 70, parede: 3, mao: 14, caixa: [26, 20] },
    /* tabela */
    tb: { padX: 1.6, padY: 1.2, linhaH: 1.4, cols: [0.15, 0.06, 0.1, 0.1, 0.08, 0.2, 0.09, 0.07, 0.15] }
  };
  /* conversão de unidade: 1 pol = 25,4 mm (definição); fração em 16 avos, aceita se o arredondamento do catálogo cabe na tolerância */
  var POL = { mm: 25.4, den: 16, tol_mm: 0.15 };
  /* clim:fisica-fim */

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function HI() { return dep("HidIsometrico", "./hidisometrico.js"); }
  function CD() { return dep("ClimDimensionar", "./climdimensionar.js"); }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj0(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return fin(v) ? String(Math.round(v * 1000) / 1000) : "NaN"; }   // clim:ok casas do SVG
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function dois(k) { return ("0" + k).slice(-2); }   // clim:ok rótulo nn
  function br(v, c) {
    if (!fin(v)) return "-";
    var f = Math.pow(10, c == null ? 0 : c), s = (Math.round(v * f) / f).toFixed(c == null ? 0 : c);   // clim:ok potência de 10 para arredondar casas
    return s.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");   // clim:ok agrupamento de milhar (apresentação)
  }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function larg(s, h) { var A = AP(); return A && A.largTexto ? A.largTexto(s, h) : txt(s).length * h * HI().K.larg; }
  function corta(s, max) { s = txt(s); return s.length > max ? s.slice(0, max - 1) + "…" : s; }   // clim:ok corte de mensagem (apresentação)

  var NOME_TIPO = { janela: "JANELA", hiwall: "HI-WALL", pisoteto: "PISO-TETO", cassete: "CASSETE", duto: "DUTO" };
  var NOME_COND = { fachada: "FACHADA (SUPORTE)", piso_externo: "PISO EXTERNO", cobertura: "COBERTURA", area_tecnica: "ÁREA TÉCNICA" };
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";

  /* polegada do diâmetro (o catálogo traz mm convertidos: 6,35 · 9,52 · 12,70…) — null se não é fração comercial */
  /* clim:fisica-inicio */
  function pol(mm) {
    if (!fin(mm)) return null;
    var k = Math.round(mm / POL.mm * POL.den);
    if (k <= 0 || Math.abs(k * POL.mm / POL.den - mm) > POL.tol_mm) return null;
    var inteiro = Math.floor(k / POL.den), r = k % POL.den, d = POL.den;
    while (r && r % 2 === 0) { r = r / 2; d = d / 2; }
    return (inteiro ? inteiro + (r ? " " : "") : "") + (r ? r + "/" + d : "") + '"';
  }
  /* clim:fisica-fim */
  function diam(sigla, mm) {
    if (!fin(mm)) return sigla + " não verificado: falta o diâmetro";
    var p = pol(mm);
    return sigla + " Ø " + (p ? p + " (" + br(mm, 2) + " mm)" : br(mm, 2) + " mm");
  }

  /* ------------------------------------------------------------ ESTILO (camadas CLI-* sobre o estilo da casa) */
  function estilo() {
    var A = AP(), E = A.estilo(), P = K2.pena;
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor || "#000" }; }
    cam("CLI-LIQ-TUBO", P.LIQ, K2.cor.LIQ); cam("CLI-SUC-TUBO", P.SUC, K2.cor.SUC); cam("CLI-DRE-TUBO", P.DRE, K2.cor.DRE, K2.tracoDRE);
    cam("CLI-INS-DUTO", P.INS, K2.cor.INS); cam("CLI-RET-DUTO", P.RET, K2.cor.RET, K2.tracoRET);
    cam("CLI-EQUIP", P.EQUIP); cam("CLI-SIMBOLO", P.simbolo); cam("CLI-COTA", P.cota); cam("CLI-TEXTO", P.fina); cam("CLI-EIXO", P.eixo, "#000", K2.tracoEixo);
    cam("CLI-CONTEXTO", P.contexto, "#7f7f7f"); cam("CLI-TABELA", P.tabela); cam("CLI-TITULO", P.titulo); cam("CLI-MOLDURA", P.moldura);
    cam("CLI-PEND", P.simbolo, K2.vermelho, "3 1.5");
    E.camadas["MET-TABELA"] = E.camadas["CLI-TABELA"]; E.camadas["MET-TITULO"] = E.camadas["CLI-TITULO"]; E.camadas["MET-FINA"] = E.camadas["CLI-COTA"];
    return E;
  }

  /* ------------------------------------------------------------ DADOS: sistemas (uma evaporadora cada), condensadoras, pavimentos */
  function montarSistemas(r, ambs) {
    var porId = {}; ambs.forEach(function (a) { porId[a.id] = a; });
    var out = [], conds = [], idxCond = {};
    arr(r.ambientes).forEach(function (it) {
      var e = it && it.escolha; if (!e || !e.evaporadora || !fin(e.evaporadora.x)) return;
      var s = { id: it.id, nome: txt(it.nome), item: it, esc: e, amb: porId[it.id] || null, n: out.length + 1, tipo: e.tipo, eq: e.equipamento };
      s.rot = "EV-" + s.n;
      var vcs = arr(r.verificacoes).filter(function (v) { return v && v.alvo === it.id && /^carga térmica por componentes/.test(txt(v.nome)); });
      var vc = vcs.filter(function (v) { return v.status !== "ok"; })[0] || vcs.filter(function (v) { return v.motivo; })[0] || vcs[0];
      s.cargaVer = vc || null;
      s.cargaPend = !!(vc && vc.status !== "ok") || (obj0(it.carga).status != null && it.carga.status !== "ok");
      s.cargaMotivo = vc && vc.motivo ? txt(vc.motivo) : "";
      var mc = /confirmada pelo RT (.+)$/.exec(s.cargaMotivo); s.confRT = mc && vc && vc.status === "ok" ? mc[1] : "";
      var c = e.condensadora, ck = c && c.id ? c.id : "sem-cond-" + s.id;
      if (!(ck in idxCond)) { idxCond[ck] = conds.length; conds.push({ id: ck, pos: c || null, rot: "CD-" + (conds.length + 1), sis: [] }); }
      s.cond = conds[idxCond[ck]]; s.cond.sis.push(s);
      out.push(s);
    });
    return { sis: out, conds: conds };
  }
  function capEq(s) { return s.eq && fin(s.eq.capacidade_BTUh) ? s.eq.capacidade_BTUh : null; }
  function rotuloEq(s) {
    var cap = capEq(s), t = NOME_TIPO[s.tipo] || txt(s.tipo).toUpperCase();
    return s.rot + " " + t + (cap != null ? "  " + br(cap, 0) + " BTU/h" + (s.cargaPend ? "  (carga não verificada)" : "") : "  não verificado: falta equipamento do catálogo");
  }
  function ehPend(s) { return capEq(s) == null || s.cargaPend; }

  /* pendências locais: texto -> sistemas; o texto vem do cálculo, nunca digitado aqui */
  function pendLocais(S) {
    var mapa = {}, ordem = [];
    function add(t, id) { t = txt(t); if (!t) return; if (!mapa[t]) { mapa[t] = []; ordem.push(t); } if (mapa[t].indexOf(id) < 0) mapa[t].push(id); }
    S.sis.forEach(function (s) {
      var e = s.esc;
      if (capEq(s) == null) add("equipamento do catálogo para a carga do ambiente", s.rot);
      arr(obj0(e.evaporadora).pendencias).forEach(function (p) { add(p, s.rot); });
      if (e.equipamento && !e.rede) add("rede frigorígena", s.rot);
      arr(obj0(e.rede).pendencias).forEach(function (p) { add(p, s.rot); });
      if (obj0(e.rede).extras && obj0(e.rede.extras).cargaAdicional_pendente) add(e.rede.extras.cargaAdicional_pendente, s.rot);
      arr(obj0(e.dreno).pendencias).forEach(function (p) { add(p, s.rot); });
      if (e.suporte && e.suporte.status === "pendente") add("carga de cálculo do suporte da condensadora (peso da condensadora no catálogo)", s.rot);
      if (e.eletrica && e.eletrica.disjuntor_A == null && e.equipamento) add("disjuntor recomendado do catálogo", s.rot);
      if (e.duto) arr(e.duto.pendencias).forEach(function (p) { add(p, s.rot); });
      if (e.duto && e.duto.terminais && e.duto.terminais.status === "pendente") add("seleção de grelha/difusor (catálogo)", s.rot);
    });
    return ordem.map(function (t) { return "não verificado: falta " + t + (mapa[t].length ? " (" + mapa[t].join(", ") + ")" : ""); });
  }

  /* ------------------------------------------------------------ PRIMITIVAS da planta */
  /* clim:fisica-inicio — diagramação (geometria de desenho em mm): nenhum valor de norma; capacidade, DN e vazão vêm sempre do RESULTADO */
  function desenhar(D, prim, ox, oy) {
    arr(prim.polis).forEach(function (p) { D.poli(p.pts.map(function (q) { return [q[0] + ox, q[1] + oy]; }), p.camada, p.fechado !== false); });
    arr(prim.linhas).forEach(function (l) { D.linha(l.x1 + ox, l.y1 + oy, l.x2 + ox, l.y2 + oy, l.camada, ' data-trecho="' + esc(l.trecho) + '"'); });
    arr(prim.simbolos).forEach(function (s) {
      var x = s.x + ox, y = s.y + oy;
      if (s.tipo === "evap") { D.poli(s.pts.map(function (q) { return [q[0] + ox, q[1] + oy]; }), "CLI-EQUIP", true); D.cheio(s.seta.map(function (q) { return [q[0] + ox, q[1] + oy]; }), "#000"); }
      else if (s.tipo === "cond") {
        D.poli(s.pts.map(function (q) { return [q[0] + ox, q[1] + oy]; }), "CLI-EQUIP", true); D.circ(x, y, K2.rFan, "CLI-SIMBOLO");
        D.linha(x - K2.rFan, y, x + K2.rFan, y, "CLI-SIMBOLO"); D.linha(x, y - K2.rFan, x, y + K2.rFan, "CLI-SIMBOLO");
      }
      else if (s.tipo === "pf") { D.circ(x, y, K2.rPf, "CLI-SIMBOLO"); D.ponto(x, y, K2.rPf / 2, "#000"); }
      else if (s.tipo === "terminal") { D.ret(x - K2.term / 2, y - K2.term / 2, K2.term, K2.term, "CLI-SIMBOLO"); D.linha(x - K2.term / 2, y - K2.term / 2, x + K2.term / 2, y + K2.term / 2, "CLI-SIMBOLO"); D.linha(x - K2.term / 2, y + K2.term / 2, x + K2.term / 2, y - K2.term / 2, "CLI-SIMBOLO"); }
    });
    arr(prim.textos).forEach(function (t) { D.texto(t.x + ox, t.y + oy, t.s, t.h, { al: t.al || "C", cor: t.tipo === "pend" ? K2.vermelho : undefined, attr: ' data-rotulo="' + esc(t.tipo) + '"' }); });
  }
  function hip(a, b) { return Math.sqrt(a * a + b * b); }
  /* retângulo orientado: centro, eixo unitário u (comprimento), v perpendicular (profundidade) */
  function retOri(cx, cy, ux, uy, w, h) {
    var vx = -uy, vy = ux, a = w / 2, b = h / 2;
    return [[cx - ux * a - vx * b, cy - uy * a - vy * b], [cx + ux * a - vx * b, cy + uy * a - vy * b], [cx + ux * a + vx * b, cy + uy * a + vy * b], [cx - ux * a + vx * b, cy - uy * a + vy * b]];
  }
  function boxDe(pts) { var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
  /* a linha deslocada de d mm, à esquerda do sentido p1→p2 */
  function desloca(a, b, d) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = hip(dx, dy);
    if (L < 1e-9) return [a, b];
    var nx = dy / L * d, ny = -dx / L * d;
    return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
  }
  /* clim:fisica-fim */

  /* pavimentos: agrupa os ambientes por pavimento e dá o nome */
  function pavimentosDe(ambs, opcoes) {
    var lista = [], porId = {};
    ambs.forEach(function (a) {
      var id = txt(a.pavimento) || "PISO";
      if (!porId[id]) { porId[id] = { id: id, nome: id, cota: num(a.cota_m, 0), ambs: [] }; lista.push(porId[id]); }
      porId[id].ambs.push(a);
    });
    arr(opcoes.pavimentos).forEach(function (p) {
      lista.forEach(function (q) {
        if (txt(p.id) === q.id || (p.id == null && Math.abs(num(p.cota, NaN) - q.cota) < K2.tolPiso_m)) q.nome = txt(p.nome) || q.nome;
      });
    });
    lista.sort(function (a, b) { return a.cota - b.cota; });
    return lista;
  }

  /* ------------------------------------------------------------ PLANTA */
  function plantaPrim(c, pv, sis, s) {
    var H = HI(), KI = H.K, polis = [], L = [], S = [], T = [], seg = [], pend = [], avisos = [];
    var x0 = c.x0, z0 = c.z0;
    function pp(x, z) { return [(x - x0) * s, (z - z0) * s]; }
    pv.ambs.forEach(function (a) {
      var pts = arr(a.contorno).map(function (q) { return pp(q.x, q.z); });
      if (pts.length > 2) {
        polis.push({ pts: pts, camada: "CLI-CONTEXTO", fechado: true });
        for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; seg.push([p[0], p[1], q[0], q[1]]); }
      }
      var ctr = a.centro ? pp(a.centro.x, a.centro.z) : (pts[0] || [0, 0]);
      var it = arr(c.r.ambientes).filter(function (q) { return q.id === a.id; })[0];
      var climat = it && it.climatizar, sem = !c.S.sis.some(function (q) { return q.id === a.id; });
      var nome = txt(a.nome) + "  " + br(a.area_m2, 1) + " m²" + (climat === false ? "  (NÃO CLIMATIZADO)" : "");
      pend.push({ s: nome, h: KI.hPeq, tipo: "ambiente", camada: "CLI-TEXTO", trecho: "amb-" + a.id, anchors: [ctr], prio: 4, d0: 0.5 });   // clim:ok geometria de desenho (mm de papel)
      if (climat && sem) pend.push({ s: txt(a.nome) + ": não verificado: falta equipamento no resultado do cálculo", h: KI.hPeq, tipo: "pend", camada: "CLI-TEXTO", trecho: "amb-pend-" + a.id, anchors: [[ctr[0], ctr[1] + KI.h * 2]], prio: 3, d0: 0.5 });   // clim:ok geometria de desenho (mm de papel)
    });
    sis.forEach(function (sy) {
      var e = sy.esc, ev = e.evaporadora, p = pp(ev.x, ev.z), jx = Math.sin(num(ev.rotY, 0)), jz = Math.cos(num(ev.rotY, 0));
      var ux = jz, uy = -jx;   /* eixo comprido da evaporadora: perpendicular ao jato */
      var pts = retOri(p[0], p[1], ux, uy, K2.evap[0], K2.evap[1]), fx = p[0] + jx * K2.evap[1] / 2, fy = p[1] + jz * K2.evap[1] / 2;
      var seta = [[fx + jx * K2.seta, fy + jz * K2.seta], [fx - jz * K2.seta / 2, fy + jx * K2.seta / 2], [fx + jz * K2.seta / 2, fy - jx * K2.seta / 2]];
      S.push({ tipo: "evap", x: p[0], y: p[1], pts: pts, seta: seta, box: boxDe(pts.concat(seta)), id: sy.rot });
      pend.push({ s: rotuloEq(sy), h: KI.hPeq, tipo: ehPend(sy) ? "pend" : "equip", camada: "CLI-TEXTO", trecho: sy.rot, anchors: [p], prio: 0, d0: K2.evap[0] / 2 });
      /* ponto de força junto à evaporadora (ao lado, ao longo da parede) */
      var pf = [p[0] + ux * (K2.evap[0] / 2 + K2.rPf * 2), p[1] + uy * (K2.evap[0] / 2 + K2.rPf * 2)];
      S.push({ tipo: "pf", x: pf[0], y: pf[1], box: [pf[0] - K2.rPf, pf[1] - K2.rPf, pf[0] + K2.rPf, pf[1] + K2.rPf], id: sy.rot + "-PF" });
      var alim = obj0(e.eletrica).alimentacao;
      pend.push({ s: "PF " + sy.rot + (alim ? "  " + alim : ""), h: KI.hPeq, tipo: "forca", camada: "CLI-TEXTO", trecho: sy.rot + "-PF", anchors: [pf], prio: 1, d0: K2.rPf + 0.6 });   // clim:ok geometria de desenho (mm de papel)
      /* linhas frigorígenas (projeção em planta; trechos verticais viram ponto) */
      var rd = e.rede;
      if (rd) {
        var hor = [];
        arr(rd.segmentos).forEach(function (sg, i) {
          var a = pp(sg.p1.x, sg.p1.z), b = pp(sg.p2.x, sg.p2.z);
          if (hip(b[0] - a[0], b[1] - a[1]) < 1e-6) return;   // clim:ok geometria de desenho (mm de papel)
          var la = desloca(a, b, K2.offLiq), sa = desloca(a, b, K2.offSuc);
          L.push({ x1: la[0][0], y1: la[0][1], x2: la[1][0], y2: la[1][1], camada: "CLI-LIQ-TUBO", trecho: sy.rot + "-L" + i });
          L.push({ x1: sa[0][0], y1: sa[0][1], x2: sa[1][0], y2: sa[1][1], camada: "CLI-SUC-TUBO", trecho: sy.rot + "-S" + i });
          seg.push([la[0][0], la[0][1], la[1][0], la[1][1]], [sa[0][0], sa[0][1], sa[1][0], sa[1][1]]);
          hor.push({ a: a, b: b, L: hip(b[0] - a[0], b[1] - a[1]) });
        });
        var rot = diam("L", rd.liquido_mm) + "  " + diam("S", rd.succao_mm) + "  C=" + br(rd.comprimento_m, 1) + " m";
        var maior = hor.slice().sort(function (u, v) { return v.L - u.L; })[0] || { a: p, b: p, L: 0 };
        var an = KI.ancoras.map(function (f) { return [maior.a[0] + (maior.b[0] - maior.a[0]) * f, maior.a[1] + (maior.b[1] - maior.a[1]) * f]; });
        pend.push({ s: rot, h: KI.hPeq, tipo: fin(rd.liquido_mm) && fin(rd.succao_mm) ? "linha" : "pend", camada: "CLI-TEXTO", trecho: sy.rot + "-LF", anchors: an, prio: 2, comprimento: maior.L });
      } else pend.push({ s: sy.rot + ": linha frigorígena não verificada: falta equipamento", h: KI.hPeq, tipo: "pend", camada: "CLI-TEXTO", trecho: sy.rot + "-LF", anchors: [p], prio: 2, d0: K2.evap[0] / 2 });
      /* dreno */
      var dr = e.dreno;
      if (dr) {
        var hd = [];
        arr(dr.segmentos).forEach(function (sg, i) {
          var a = pp(sg.p1.x, sg.p1.z), b = pp(sg.p2.x, sg.p2.z);
          if (hip(b[0] - a[0], b[1] - a[1]) < 1e-6) return;   // clim:ok geometria de desenho (mm de papel)
          var da = desloca(a, b, K2.offDre);
          L.push({ x1: da[0][0], y1: da[0][1], x2: da[1][0], y2: da[1][1], camada: "CLI-DRE-TUBO", trecho: sy.rot + "-D" + i });
          seg.push([da[0][0], da[0][1], da[1][0], da[1][1]]);
          hd.push({ a: a, b: b, L: hip(b[0] - a[0], b[1] - a[1]) });
        });
        var maiorD = hd.slice().sort(function (u, v) { return v.L - u.L; })[0];
        if (maiorD) {
          var inc = fin(dr.inclinacaoMin_pct) ? "i ≥ " + br(dr.inclinacaoMin_pct, 1) + "%" : "i não verificado: falta inclinação mínima";
          var dnT = fin(dr.dn) ? "DN " + dr.dn : "DN não verificado";
          var dest = dr.bomba ? "BOMBA DE DRENO" : (dr.destino ? (dr.destino.tipo === "externo" ? "destino EXTERNO (não verificado: ligar a pluvial/esgoto)" : "destino " + txt(dr.destino.tipo).toUpperCase() + (dr.sifao ? " COM SIFÃO" : "")) : "destino não verificado");
          var pdr = dr.status !== "ok" || !fin(dr.dn) || !fin(dr.inclinacaoMin_pct) || (dr.destino && dr.destino.tipo === "externo");
          var an2 = KI.ancoras.map(function (f) { return [maiorD.a[0] + (maiorD.b[0] - maiorD.a[0]) * f, maiorD.a[1] + (maiorD.b[1] - maiorD.a[1]) * f]; });
          pend.push({ s: "DR " + sy.rot + "  " + dnT + "  " + inc + "  " + dest, h: KI.hPeq, tipo: pdr ? "pend" : "dreno", camada: "CLI-TEXTO", trecho: sy.rot + "-DR", anchors: an2, prio: 2, comprimento: maiorD.L });
        }
      }
    });
    /* condensadoras */
    c.conds.forEach(function (cd) {
      if (!cd.pos || !sis.some(function (q) { return q.cond === cd; })) return;
      var p = pp(cd.pos.x, cd.pos.z), pts = retOri(p[0], p[1], 1, 0, K2.cond[0], K2.cond[1]);
      S.push({ tipo: "cond", x: p[0], y: p[1], pts: pts, box: boxDe(pts), id: cd.rot });
      var s0 = cd.sis[0], cap = s0 && s0.eq && fin(s0.eq.capacidade_BTUh) ? br(s0.eq.capacidade_BTUh, 0) + " BTU/h" : null;
      var soma = cd.sis.length > 1 ? cd.sis.map(function (q) { return capEq(q); }) : null;
      var capT = soma ? (soma.every(fin) ? "" : "não verificado: falta equipamento") : (cap || "não verificado: falta equipamento do catálogo");
      pend.push({ s: cd.rot + " " + (NOME_COND[cd.pos.tipo] || txt(cd.pos.tipo).toUpperCase()) + (capT ? "  " + capT : ""), h: KI.hPeq, tipo: capT.indexOf("não verificado") >= 0 ? "pend" : "equip", camada: "CLI-TEXTO", trecho: cd.rot, anchors: [p], prio: 0, d0: K2.cond[0] / 2 });
    });
    /* dutos */
    sis.forEach(function (sy) {
      var du = sy.esc.duto, ins = sy.esc.evaporadora.insuflamento; if (!du || !ins) return;
      var a = pp(sy.esc.evaporadora.x, sy.esc.evaporadora.z), b = pp(ins.x, ins.z);
      var w = fin(du.a_mm) ? Math.max(du.a_mm / 1000 * s, K2.dutoMin) : K2.dutoMin;
      var d1 = desloca(a, b, w / 2), d2 = desloca(a, b, -w / 2);
      if (hip(b[0] - a[0], b[1] - a[1]) > 1e-6) {   // clim:ok geometria de desenho (mm de papel)
        L.push({ x1: d1[0][0], y1: d1[0][1], x2: d1[1][0], y2: d1[1][1], camada: "CLI-INS-DUTO", trecho: sy.rot + "-U1" }, { x1: d2[0][0], y1: d2[0][1], x2: d2[1][0], y2: d2[1][1], camada: "CLI-INS-DUTO", trecho: sy.rot + "-U2" });
        seg.push([d1[0][0], d1[0][1], d1[1][0], d1[1][1]], [d2[0][0], d2[0][1], d2[1][0], d2[1][1]]);
      }
      S.push({ tipo: "terminal", x: b[0], y: b[1], box: [b[0] - K2.term / 2, b[1] - K2.term / 2, b[0] + K2.term / 2, b[1] + K2.term / 2], id: sy.rot + "-GR" });
      var dt = fin(du.a_mm) && fin(du.b_mm) ? du.a_mm + "x" + du.b_mm + " mm" : "dimensão não verificada";
      var q = fin(du.vazao_m3h) ? br(du.vazao_m3h, 0) + " m³/h" : "vazão não verificada";
      pend.push({ s: "DUTO " + sy.rot + "  " + dt + "  " + q, h: KI.hPeq, tipo: fin(du.a_mm) ? "duto" : "pend", camada: "CLI-TEXTO", trecho: sy.rot + "-DU", anchors: [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], prio: 2, d0: w });
    });
    H.afastar(pend, S, L, T, seg, avisos);
    return { polis: polis, linhas: L, simbolos: S, textos: T, avisos: avisos };
  }
  function bbox(prim) {
    var xs = [], ys = [];
    arr(prim.polis).forEach(function (p) { p.pts.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
    arr(prim.linhas).forEach(function (l) { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); });
    arr(prim.simbolos).forEach(function (s) { xs.push(s.box[0], s.box[2]); ys.push(s.box[1], s.box[3]); });   // clim:ok geometria de desenho (mm de papel)
    arr(prim.textos).forEach(function (t) { xs.push(t.box[0], t.box[2]); ys.push(t.box[1], t.box[3]); });   // clim:ok geometria de desenho (mm de papel)
    return xs.length ? { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) } : null;
  }
  /* limites do pavimento em metros: ambientes + equipamentos + linhas */
  function limitesPav(c, pv, sis) {
    var xs = [], zs = [];
    pv.ambs.forEach(function (a) { arr(a.contorno).forEach(function (q) { xs.push(q.x); zs.push(q.z); }); });
    sis.forEach(function (sy) {
      var e = sy.esc; xs.push(e.evaporadora.x); zs.push(e.evaporadora.z);
      if (e.condensadora && fin(e.condensadora.x)) { xs.push(e.condensadora.x); zs.push(e.condensadora.z); }
      arr(obj0(e.rede).segmentos).concat(arr(obj0(e.dreno).segmentos)).forEach(function (sg) { xs.push(sg.p1.x, sg.p2.x); zs.push(sg.p1.z, sg.p2.z); });
    });
    xs = xs.filter(fin); zs = zs.filter(fin);
    if (!xs.length) return null;
    return { x0: Math.min.apply(null, xs), z0: Math.min.apply(null, zs), W: Math.max.apply(null, xs) - Math.min.apply(null, xs), Hh: Math.max.apply(null, zs) - Math.min.apply(null, zs) };
  }
  function folhaPlanta(c) {
    var D = c.D, a = c.geo.area, pv = c.pv, sis = c.sis, lim = limitesPav(c, pv, sis), esc0 = null, i;
    if (!lim) { D.texto(a.x + K2.erroX, a.y + K2.erroY, "Pavimento sem geometria de ambiente.", D.E.T.nota, { cor: K2.vermelho }); return { escala: "INDICADA" }; }
    var folga = HI().K.margem * 2 + K2.folgaFolha;
    for (i = 0; i < K2.escalas.length; i++) {
      var s0 = 1000 / K2.escalas[i];
      if (lim.W * s0 + folga <= a.w && lim.Hh * s0 + folga + K2.titulo <= a.h) { esc0 = K2.escalas[i]; break; }
    }
    if (!esc0) { esc0 = K2.escalas[K2.escalas.length - 1]; c.avisos.push("Folha " + dois(c.n) + ": a planta não cabe nem na menor escala (1:" + esc0 + ") - dividir por ala."); }
    var s = 1000 / esc0, pr;
    c.x0 = lim.x0; c.z0 = lim.z0;
    pr = plantaPrim(c, pv, sis, s);
    arr(pr.avisos).forEach(function (m) { c.avisos.push("Folha " + dois(c.n) + ": " + m); });
    var bb = bbox(pr), ox = a.x + (a.w - (bb.x1 - bb.x0)) / 2 - bb.x0, oy = a.y + K2.titulo + (a.h - K2.titulo - (bb.y1 - bb.y0)) / 2 - bb.y0;
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "ESC 1:" + esc0);   // clim:ok geometria de desenho (mm de papel)
    desenhar(D, pr, ox, oy);
    return { escala: "1:" + esc0 };
  }

  /* ------------------------------------------------------------ texto em bloco (empilhado, com quebra) */
  /* clim:fisica-inicio */
  function bloco(D, A, x, y, wmax, linhas, h) {
    linhas.forEach(function (ln) {
      var o = typeof ln === "string" ? { t: ln } : ln, hh = o.h || h;
      A.quebrar(o.t, hh, wmax).forEach(function (s) { y += hh * HI().K.base; D.texto(x, y, s, hh, { cor: o.cor, peso: o.peso }); y += hh * (K2.es.txtEntre - HI().K.base); });
    });
    return y;
  }
  function alturaBloco(A, wmax, linhas, h) {
    var y = 0;
    linhas.forEach(function (ln) { var o = typeof ln === "string" ? { t: ln } : ln, hh = o.h || h; y += A.quebrar(o.t, hh, wmax).length * hh * K2.es.txtEntre; });
    return y;
  }
  /* clim:fisica-fim */

  /* ------------------------------------------------------------ ESQUEMA FRIGORÍGENO (unifilar por condensadora) */
  function linhasSistema(sy) {
    var rd = sy.esc.rede, out = [];
    if (!rd) return [{ t: sy.rot + ": linha frigorígena não verificada: falta equipamento do catálogo", cor: K2.vermelho }];
    out.push({ t: diam("L", rd.liquido_mm) + "   " + diam("S", rd.succao_mm), cor: fin(rd.liquido_mm) && fin(rd.succao_mm) ? undefined : K2.vermelho });
    out.push("comprimento da linha C = " + br(rd.comprimento_m, 2) + " m   (" + rd.conexoes + " conexão(ões))");
    var dv = rd.desnivel_m;
    out.push(fin(dv) ? "desnível = " + br(Math.abs(dv), 2) + " m (" + (dv < 0 ? "condensadora abaixo da evaporadora" : (dv > 0 ? "condensadora acima da evaporadora" : "mesmo nível")) + ")" : { t: "desnível não verificado", cor: K2.vermelho });
    var ex = obj0(rd.extras);
    if (ex.cargaAdicional_pendente) out.push({ t: "carga adicional de gás: não verificado: falta " + ex.cargaAdicional_pendente, cor: K2.vermelho });
    else if (fin(ex.cargaAdicional_g)) out.push("carga adicional de gás: " + br(ex.cargaAdicional_g, 0) + " g" + (arr(ex.cargaAdicionalPassos)[0] ? "  (" + arr(ex.cargaAdicionalPassos)[0] + ")" : ""));
    else out.push({ t: "carga adicional de gás: não verificado: falta o dado do catálogo", cor: K2.vermelho });
    var iso = obj0(rd.isolamento);
    out.push(iso.status === "ok" && fin(iso.espessura_mm) ? "isolamento térmico: espessura " + br(iso.espessura_mm, 0) + " mm" : { t: "isolamento: não verificado: falta espessura (fonte)", cor: K2.vermelho });
    arr(rd.verificacoes).forEach(function (v) {
      var ok = v.status === "ok", base = txt(v.nome) + ": " + (fin(v.valor) ? br(v.valor, 2) : "-") + (fin(v.limite) ? " (limite " + br(v.limite, 1) + ")" : "") + " " + txt(v.unidade);
      out.push(ok ? base + " - atende" : { t: base + (v.status === "reprovado" ? " - NÃO ATENDE" : " - não verificado"), cor: K2.vermelho });
    });
    return out;
  }
  function bandaAltura(A, c, cd, wTexto) {
    var H = 0;
    cd.sis.forEach(function (sy) { H += Math.max(K2.es.evH + K2.es.linhaEntre, alturaBloco(A, wTexto, linhasSistema(sy), c.hPeq) + K2.es.evH / 2 + K2.es.txtOff + K2.es.folgaLinha); });
    return Math.max(H, K2.es.condMin) + K2.es.bandaTit + K2.es.bandaEntre;
  }
  function folhaEsquema(c) {
    var D = c.D, a = c.geo.area, A = c.AP, E = D.E, hP = c.hPeq, y = a.y + 2;
    y += A.tituloVista(D, a.x + 4, y, c.titulo, "UNIFILAR - SEM ESCALA");   // clim:ok geometria de desenho (mm de papel)
    var xe = a.x + 6, xc = a.x + a.w - K2.es.condW - 6, xl = xe + K2.es.evW + K2.es.colTexto, wTexto = xc - xl - K2.es.colTexto, grupos = c.grupo;   // clim:ok geometria de desenho (mm de papel)
    grupos.forEach(function (cd) {
      var yb = y + K2.es.bandaTit, yTop = yb;
      var pos = cd.pos, cap = cd.sis.map(capEq), capOk = cap.every(fin);
      var ttl = cd.rot + " - " + (pos ? (NOME_COND[pos.tipo] || txt(pos.tipo).toUpperCase()) : "POSIÇÃO NÃO VERIFICADA") + "  -  " + cd.sis.length + " evaporadora(s)";
      D.texto(xe, y + HI().K.h * HI().K.base, ttl, HI().K.h, { peso: 0.16 });   // clim:ok geometria de desenho (mm de papel)
      var ys = [];
      cd.sis.forEach(function (sy) {
        var lin = linhasSistema(sy), hTxt = alturaBloco(A, wTexto, lin, hP), alt = Math.max(K2.es.evH + K2.es.linhaEntre, hTxt + K2.es.evH / 2 + K2.es.txtOff + K2.es.folgaLinha), yl = yb + K2.es.evH / 2;
        /* caixa da evaporadora */
        D.ret(xe, yb, K2.es.evW, K2.es.evH, "CLI-EQUIP");
        var tt = NOME_TIPO[sy.tipo] || txt(sy.tipo).toUpperCase(), ln1 = capEq(sy) != null ? br(capEq(sy), 0) + " BTU/h" + (sy.cargaPend ? " (carga não verificada)" : "") : "não verificado: falta equipamento";
        D.texto(xe + 2, yb + 5, sy.rot + " " + tt, hP, { peso: 0.16 });   // clim:ok geometria de desenho (mm de papel)
        D.texto(xe + 2, yb + 9.5, corta(sy.nome, K2.maxNorma), hP, {});   // clim:ok geometria de desenho (mm de papel)
        D.texto(xe + 2, yb + 14, ln1, hP, { cor: ehPend(sy) ? K2.vermelho : undefined });   // clim:ok geometria de desenho (mm de papel)
        /* líquido e sucção (duas linhas paralelas) */
        D.linha(xe + K2.es.evW, yl - 1, xc, yl - 1, "CLI-LIQ-TUBO"); D.linha(xe + K2.es.evW, yl + 1, xc, yl + 1, "CLI-SUC-TUBO");
        bloco(D, A, xl, yl + K2.es.txtOff, wTexto, lin, hP);
        ys.push(yl);
        yb += alt;
      });
      /* condensadora */
      var hC = Math.max(yb - yTop, K2.es.condMin);
      D.ret(xc, yTop, K2.es.condW, hC, "CLI-EQUIP");
      var ccx = xc + K2.es.condW / 2, ccy = yTop + hC / 2;
      D.circ(ccx, ccy - 4, K2.rFan * 2, "CLI-SIMBOLO");   // clim:ok geometria de desenho (mm de papel)
      D.texto(xc + 2, yTop + 5, cd.rot + " CONDENSADORA", hP, { peso: 0.16 });   // clim:ok geometria de desenho (mm de papel)
      D.texto(xc + 2, yTop + hC - 10, capOk && cap.length === 1 ? br(cap[0], 0) + " BTU/h" : (capOk ? cap.map(function (q) { return br(q, 0); }).join(" + ") + " BTU/h" : "não verificado: falta equipamento"), hP, { cor: capOk ? undefined : K2.vermelho });   // clim:ok geometria de desenho (mm de papel)
      var s0 = cd.sis[0], cods = s0 && s0.eq ? txt(s0.eq.condensadora) : "";
      D.texto(xc + 2, yTop + hC - 5.5, cods ? "mod. " + cods : "modelo: não verificado", hP, { cor: cods ? undefined : K2.vermelho });   // clim:ok geometria de desenho (mm de papel)
      y = Math.max(yb, yTop + hC) + K2.es.bandaEntre;
    });
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ DUTOS (planta dos dutos por pavimento) */
  function folhaDutos(c) {
    var r = folhaPlanta(c), D = c.D, a = c.geo.area, hP = c.hPeq;
    D.texto(a.x + a.w - 4, a.y + K2.titulo / 2, "Retorno do ar: não dimensionado no cálculo (não verificado: falta o dimensionamento do retorno).", hP, { al: "D", cor: K2.vermelho });   // clim:ok geometria de desenho (mm de papel)
    return r;
  }

  /* ------------------------------------------------------------ DETALHES TÍPICOS */
  /* clim:fisica-inicio */
  function painelBase(D, x, y, w, h, titulo, c) {
    D.ret(x, y, w, h, "CLI-TABELA");
    D.texto(x + 3, y + 5, titulo, D.E.T.titulo * 0.8, { peso: 0.16 });
  }
  function folhaDetalhes(c) {
    var D = c.D, a = c.geo.area, A = c.AP, hP = c.hPeq, T = D.E.T, G = K2.det, S = c.S;
    A.tituloVista(D, a.x + 4, a.y + 2, "DETALHES TÍPICOS - SUPORTE DA CONDENSADORA, DRENO COM SIFÃO, PASSAGEM DE TUBO E EVAPORADORA", "ESQUEMÁTICO - SEM ESCALA");
    var topo = a.y + K2.titulo + G.gap, pw = (a.w - 3 * G.gap) / 2, ph = (a.h - K2.titulo - 3 * G.gap) / 2, wt = pw - 8, x1 = a.x + G.gap, x2 = x1 + pw + G.gap, y1 = topo, y2 = topo + ph + G.gap;
    function geo(px, py, i) { return { x: px, y: py, w: pw, h: ph }; }
    /* 1) suporte da condensadora */
    painelBase(D, x1, y1, pw, ph, "1 - SUPORTE DA CONDENSADORA (MÃO-FRANCESA)", c);
    var px = x1 + 12, py = y1 + 24;
    D.linha(px, py, px, py + G.mao * 2.4, "CLI-TITULO"); D.linha(px + G.parede, py, px + G.parede, py + G.mao * 2.4, "CLI-TITULO");
    D.linha(px + G.parede, py + 3, px + G.parede + G.mao, py + 3, "CLI-EQUIP"); D.linha(px + G.parede, py + 3 + G.mao, px + G.parede + G.mao * 0.8, py + 3, "CLI-EQUIP");
    D.ret(px + G.parede + 1, py - G.caixa[1] + 3, G.caixa[0], G.caixa[1], "CLI-EQUIP"); D.circ(px + G.parede + 1 + G.caixa[0] / 2, py - G.caixa[1] / 2 + 3, K2.rFan * 1.6, "CLI-SIMBOLO");
    D.texto(px + G.parede + 4 + G.mao, py + 7, "MÃO-FRANCESA", hP, {});
    D.texto(px - 3, py - G.caixa[1] / 2, "PAREDE", hP, { al: "D" });
    var tx = px + G.caixa[0] + G.mao + 22, linhasSup = [];
    c.sis.forEach(function (sy) {
      var su = sy.esc.suporte;
      if (!su) return;
      if (su.status === "ok" && fin(su.cargaPorMaoFrancesa_kg)) linhasSup.push(sy.cond.rot + ": carga de cálculo por mão-francesa = " + br(su.cargaPorMaoFrancesa_kg, 1) + " kg (peso " + br(su.peso_kg, 1) + " kg x " + su.fator + ", NBR 16655-1 apud ABRAVA - fonte secundária)");
      else linhasSup.push({ t: sy.cond.rot + ": carga de cálculo: não verificado: falta o peso da condensadora no catálogo" + (fin(su.cargaMinima_kg) ? "; mínimo da norma (não é a verificação): " + br(su.cargaMinima_kg, 1) + " kg por mão-francesa" : ""), cor: K2.vermelho });
    });
    if (!linhasSup.length) linhasSup.push({ t: "Nenhuma condensadora em fachada neste resultado: suporte não dimensionado. Apoio no piso/cobertura: não verificado (a definir pelo RT).", cor: K2.vermelho });
    linhasSup.push("Fixação e chumbador: a conferir no manual do fabricante e no projeto estrutural (não extraído).");
    bloco(D, A, x1 + 4, y1 + G.txtY, wt, linhasSup, hP);
    /* 2) dreno com sifão */
    painelBase(D, x2, y1, pw, ph, "2 - DRENO COM SIFÃO", c);
    var dx = x2 + 12, dy = y1 + 14;
    D.ret(dx, dy, G.caixa[0], 8, "CLI-EQUIP"); D.texto(dx + G.caixa[0] + 3, dy + 5, "EVAPORADORA", hP, {});
    D.linha(dx + 4, dy + 8, dx + 4, dy + 20, "CLI-DRE-TUBO");
    D.linha(dx + 4, dy + 20, dx + 4, dy + 26, "CLI-DRE-TUBO"); D.linha(dx + 4, dy + 26, dx + 12, dy + 26, "CLI-DRE-TUBO"); D.linha(dx + 12, dy + 26, dx + 12, dy + 21, "CLI-DRE-TUBO");
    D.texto(dx + 15, dy + 26, "SIFÃO (fecho hídrico)", hP, {});
    D.linha(dx + 12, dy + 21, dx + 12, dy + 18, "CLI-DRE-TUBO"); D.linha(dx + 12, dy + 18, dx + 38, dy + 18 + 3, "CLI-DRE-TUBO"); D.texto(dx + 40, dy + 21, "ao destino (inclinação ≥ mínima)", hP, {});
    var linhasDr = [], incs = [];
    c.sis.forEach(function (sy) {
      var dr = sy.esc.dreno; if (!dr) return;
      var inc = fin(dr.inclinacaoMin_pct) ? "i ≥ " + br(dr.inclinacaoMin_pct, 1) + "%" : null;
      if (inc && incs.indexOf(inc) < 0) incs.push(inc);
      var dest = dr.bomba ? "bomba de dreno" : (dr.destino ? (dr.destino.tipo === "externo" ? "destino externo" : dr.destino.tipo + (dr.sifao ? ", com sifão" : "")) : "destino");
      var pend = dr.destino && dr.destino.tipo === "externo";
      linhasDr.push({ t: sy.rot + ": " + (fin(dr.dn) ? "DN " + dr.dn : "DN não verificado") + "; " + (inc || "inclinação mínima não verificada") + "; " + dest + (pend ? " - não verificado: ligar a pluvial/esgoto" : ""), cor: (pend || !inc || !fin(dr.dn)) ? K2.vermelho : undefined });
    });
    linhasDr.push("Dreno ligado a esgoto: sempre com sifão (decisão de projeto do cálculo, CONTRATO-CLIMA §7.12). Altura do fecho hídrico: a conferir (sem fonte no cálculo).");
    bloco(D, A, x2 + 4, y1 + G.txtY, wt, linhasDr, hP);
    /* 3) passagem de tubo em parede/laje */
    painelBase(D, x1, y2, pw, ph, "3 - PASSAGEM DE TUBO EM PAREDE / LAJE", c);
    var qx = x1 + 20, qy = y2 + 14;
    D.ret(qx, qy, 14, 26, "CLI-TITULO"); D.linha(qx - 14, qy + 11, qx + 40, qy + 11, "CLI-LIQ-TUBO"); D.linha(qx - 14, qy + 14, qx + 40, qy + 14, "CLI-SUC-TUBO");
    D.ret(qx - 1, qy + 8, 16, 9, "CLI-SIMBOLO"); D.texto(qx + 20, qy + 5, "LUVA", hP, {}); D.texto(qx + 20, qy + 24, "VEDAÇÃO / SELANTE", hP, {});
    var linhasPas = [];
    c.sis.forEach(function (sy) {
      var rd = sy.esc.rede; if (!rd) return;
      var iso = obj0(rd.isolamento);
      linhasPas.push(sy.rot + ": " + diam("L", rd.liquido_mm) + "; " + diam("S", rd.succao_mm) + "; " + (iso.status === "ok" ? "isolamento " + br(iso.espessura_mm, 0) + " mm" : "isolamento não verificado"));
    });
    linhasPas.push({ t: "Diâmetro da luva e furo: não verificado: falta a dimensão (a conferir no manual do fabricante e com a estrutura). Furo em viga/laje só com autorização do RT.", cor: K2.vermelho });
    bloco(D, A, x1 + 4, y2 + G.txtY, wt, linhasPas, hP);
    /* 4) instalação da evaporadora */
    painelBase(D, x2, y2, pw, ph, "4 - INSTALAÇÃO DA EVAPORADORA (AFASTAMENTOS)", c);
    var ex = x2 + 16, ey = y2 + 14;
    D.linha(ex - 8, ey, ex + 50, ey, "CLI-TITULO"); D.ret(ex, ey + 6, 36, 9, "CLI-EQUIP");
    D.linha(ex + 18, ey, ex + 18, ey + 6, "CLI-COTA"); D.texto(ex + 21, ey + 4, "A (teto)", hP, {});
    D.linha(ex, ey + 15, ex, ey + 22, "CLI-COTA"); D.texto(ex - 2, ey + 22, "B (parede)", hP, { al: "D" });
    D.linha(ex + 36, ey + 15, ex + 36, ey + 22, "CLI-COTA"); D.texto(ex + 38, ey + 22, "C (lateral)", hP, {});
    var linhasEv = [];
    var vistos = {};
    c.sis.forEach(function (sy) { arr(obj0(sy.esc.evaporadora).pendencias).forEach(function (p) { if (!vistos[p]) { vistos[p] = 1; linhasEv.push({ t: "não verificado: falta " + p, cor: K2.vermelho }); } }); });
    linhasEv.push({ t: "Cotas A, B e C: a conferir no manual de instalação do fabricante (afastamentos ao teto, à parede lateral e ao piso não extraídos do catálogo). Não executar sem conferir.", cor: K2.vermelho });
    bloco(D, A, x2 + 4, y2 + G.txtY, wt, linhasEv, hP);
    return { escala: "SEM ESCALA" };
  }
  /* clim:fisica-fim */

  /* ------------------------------------------------------------ QUADRO DE CARGAS E EQUIPAMENTOS */
  function folhaQuadro(c) {
    var D = c.D, a = c.geo.area, A = c.AP, hP = c.hPeq, T = D.E.T, TB = K2.tb;
    A.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "TABELA - SEM ESCALA");   // clim:ok geometria de desenho (mm de papel)
    var cab = ["AMBIENTE", "ÁREA (m²)", "CARGA ADOTADA (BTU/h)", "BASE DA CARGA", "TIPO", "EQUIPAMENTO", "CAPACIDADE (BTU/h)", "FOLGA (%)", "SITUAÇÃO"];
    var W = a.w - 8, x = a.x + 4, y = a.y + K2.titulo + 4, ws = TB.cols.map(function (f) { return f * W; });   // clim:ok geometria de desenho (mm de papel)
    var linhas = [], totCarga = 0, totCap = 0, completo = true;
    arr(c.r.ambientes).forEach(function (it) {
      if (!it.climatizar) return;
      var cg = obj0(it.carga), req = cg.requerida_BTUh, sy = c.sis.filter(function (q) { return q.id === it.id; })[0], cap = sy ? capEq(sy) : null, parcial = cg.status !== "ok";
      var folga = fin(req) && fin(cap) && req > 0 ? (cap - req) / req * 100 : null;   // clim:ok percentual (cap-req)/req
      var base = cg.base === "componentes" ? "componentes" : (cg.base === "regra_fabricante" ? "regra de fabricante" : (cg.base === "maior_das_duas" ? "maior entre componentes e regra" : txt(cg.base)));
      var sit = [], ruim = [], dv = sy && sy.cargaVer && sy.cargaVer.status !== "ok" ? sy.cargaVer : null;
      if (parcial) sit.push("carga por componentes não verificada (parcial)");
      if (dv) sit.push(txt(dv.motivo) || "verificação da carga térmica pendente");
      if (!sy) sit.push("sem equipamento"); else if (cap == null) sit.push("equipamento não verificado");
      if (folga != null && folga < 0) ruim.push("capacidade MENOR que a carga");
      var vm = ruim.length ? "NÃO ATENDE: " + ruim.join("; ") + (sit.length ? "; não verificado: " + sit.join("; ") : "") : (sit.length ? "não verificado: " + sit.join("; ") : (sy && sy.confRT ? "confirmado pelo RT " + sy.confRT : "atende"));
      linhas.push({ cel: [txt(it.nome), br(it.area_m2, 1), fin(req) ? br(req, 0) : "não verificado", base || "-", sy ? (NOME_TIPO[sy.tipo] || txt(sy.tipo).toUpperCase()) : "-",
                         sy ? (sy.rot + (sy.eq ? "  " + txt(sy.eq.fabricante) + " " + txt(sy.eq.evaporadora) + " / " + txt(sy.eq.condensadora) : "")) : "-", cap != null ? br(cap, 0) : "não verificado", folga != null ? br(folga, 1) : "-",
                         vm], pend: sit.length > 0 || ruim.length > 0 });
      if (dv) completo = false;
      if (ruim.length) completo = false;
      if (fin(req)) totCarga += req; else completo = false;
      if (cap != null) totCap += cap; else completo = false;
      if (parcial) completo = false;
    });
    /* cabeçalho */
    var xs = [x]; ws.forEach(function (w) { xs.push(xs[xs.length - 1] + w); });
    var hh = cab.map(function (t, i) { return A.quebrar(t, hP, ws[i] - 2 * TB.padX).length; }), hCab = Math.max.apply(null, hh) * hP * TB.linhaH + 2 * TB.padY;
    cab.forEach(function (t, i) { D.ret(xs[i], y, ws[i], hCab, "CLI-TABELA"); A.quebrar(t, hP, ws[i] - 2 * TB.padX).forEach(function (s, q) { D.texto(xs[i] + TB.padX, y + TB.padY + hP * HI().K.base + q * hP * TB.linhaH, s, hP, { peso: 0.16 }); }); });   // clim:ok geometria de desenho (mm de papel)
    y += hCab;
    function linhaTab(cels, pend, forte) {
      var qs = cels.map(function (t, i) { return A.quebrar(t, hP, ws[i] - 2 * TB.padX); }), hl = Math.max.apply(null, qs.map(function (q) { return q.length; }).concat([1])) * hP * TB.linhaH + 2 * TB.padY;
      cels.forEach(function (t, i) {
        D.ret(xs[i], y, ws[i], hl, "CLI-TABELA");
        qs[i].forEach(function (s, q) { D.texto(xs[i] + TB.padX, y + TB.padY + hP * HI().K.base + q * hP * TB.linhaH, s, hP, { cor: (pend && (i === cels.length - 1 || /não verificado/.test(t))) ? K2.vermelho : undefined, peso: forte ? 0.16 : undefined }); });   // clim:ok geometria de desenho (mm de papel)
      });
      y += hl;
    }
    if (!linhas.length) linhaTab(["Nenhum ambiente climatizado no resultado.", "-", "-", "-", "-", "-", "-", "-", "-"], true);
    linhas.forEach(function (l) { linhaTab(l.cel, l.pend); });
    linhaTab(["TOTAL", "-", completo ? br(totCarga, 0) : "não verificado (parcial)", "-", "-", "-", completo ? br(totCap, 0) : "não verificado (parcial)", "-", completo ? "-" : "não verificado: há ambiente sem carga ou sem equipamento"], !completo, true);
    y += 4;   // clim:ok respiro entre a tabela e a nota
    var nota = ["Folga = (capacidade do equipamento - carga adotada) / carga adotada. A carga adotada é a do dimensionamento (base indicada); capacidade e modelo são os do catálogo escolhido.",
                "Onde a carga por componentes está parcial (falta coeficiente de norma), a capacidade foi dimensionada pela regra de fabricante e a situação sai NÃO VERIFICADO: não executar como definitivo."];
    bloco(D, A, x, y, W, nota, hP);
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ COLUNA: legenda + notas + normas + pendências */
  function legendaItens(S, temDuto) {
    var l = [["linhaLIQ", "Linha de líquido (L) - Ø em polegada"], ["linhaSUC", "Linha de sucção (S) - isolada"], ["linhaDRE", "Dreno de condensado - i ≥ inclinação mínima do cálculo"],
             ["evap", "Evaporadora (EV-n) - seta = sentido do jato"], ["cond", "Condensadora (CD-n)"], ["pf", "Ponto de força (PF)"]];
    if (temDuto) l.push(["duto", "Duto de insuflamento - dimensão e vazão"], ["terminal", "Grelha / difusor"]);
    l.push(["pend", "Vermelho = não verificado (falta dado do cálculo)"]);
    return l;
  }
  /* clim:fisica-inicio */
  function simboloLeg(D, tipo, x, y) {
    if (tipo === "linhaLIQ") D.linha(x - 2.5, y, x + 2.5, y, "CLI-LIQ-TUBO");
    else if (tipo === "linhaSUC") D.linha(x - 2.5, y, x + 2.5, y, "CLI-SUC-TUBO");
    else if (tipo === "linhaDRE") D.linha(x - 2.5, y, x + 2.5, y, "CLI-DRE-TUBO");
    else if (tipo === "evap") { D.ret(x - 2.5, y - 1, 5, 2, "CLI-EQUIP"); D.cheio([[x, y + 2.6], [x - 0.7, y + 1.2], [x + 0.7, y + 1.2]], "#000"); }
    else if (tipo === "cond") { D.ret(x - 1.8, y - 1.8, 3.6, 3.6, "CLI-EQUIP"); D.circ(x, y, 1.2, "CLI-SIMBOLO"); }
    else if (tipo === "pf") { D.circ(x, y, K2.rPf, "CLI-SIMBOLO"); D.ponto(x, y, K2.rPf / 2, "#000"); }
    else if (tipo === "duto") { D.linha(x - 2.5, y - 0.7, x + 2.5, y - 0.7, "CLI-INS-DUTO"); D.linha(x - 2.5, y + 0.7, x + 2.5, y + 0.7, "CLI-INS-DUTO"); }
    else if (tipo === "terminal") { D.ret(x - 1.2, y - 1.2, 2.4, 2.4, "CLI-SIMBOLO"); D.linha(x - 1.2, y - 1.2, x + 1.2, y + 1.2, "CLI-SIMBOLO"); D.linha(x - 1.2, y + 1.2, x + 1.2, y - 1.2, "CLI-SIMBOLO"); }
    else if (tipo === "pend") D.linha(x - 2.5, y, x + 2.5, y, "CLI-PEND");
  }
  /* clim:fisica-fim */
  function notasDe(c) {
    var r = c.r, out = [];
    out.push({ titulo: "NOTAS GERAIS", numerar: true, itens: [
      "Capacidades em BTU/h; diâmetros dos tubos frigorígenos em polegadas (mm entre parênteses); comprimentos em m; alturas em m do piso acabado.",
      "L = linha de líquido; S = linha de sucção. Diâmetros, comprimentos e desníveis são os do dimensionamento e do manual do fabricante escolhido: conferir antes de executar.",
      "Dreno com inclinação mínima indicada (i ≥); nunca executar com inclinação menor. Dreno ligado a esgoto sempre com sifão.",
      "Afastamentos mínimos da evaporadora e da condensadora: conferir no manual do fabricante onde estiver \"a conferir\".",
      "Conferir compatibilização com arquitetura, estrutura e elétrica antes de furar ou cortar elemento estrutural; furos em viga/laje só com autorização do RT.",
      "Texto em vermelho = não verificado: o cálculo não fechou o dado. Não executar o que está em vermelho antes de resolver a pendência."
    ] });
    var vistos = {}, normas = [];
    arr(r && r.normas).forEach(function (q) {
      var t = corta(q.titulo || q.norma || q.chave, K2.maxNorma) + (q.tipo ? " - fonte " + (q.tipo === "secundaria" ? "SECUNDÁRIA" : q.tipo) : "");
      if (!vistos[t]) { vistos[t] = 1; normas.push(t); }
    });
    out.push({ titulo: "NORMAS E FONTES DO CÁLCULO", itens: normas.length ? normas : [{ t: "Nenhuma tabela de norma carregada no cálculo.", cor: K2.vermelho }] });
    var pend = [];
    if (r && r.fixture) pend.push({ t: "TABELAS DE TESTE - NÃO É NORMA. PRANCHA NÃO PODE SER EMITIDA.", cor: K2.vermelho });
    var porChave = {};
    arr(r && r.pendencias).forEach(function (p) { var k = txt(p.chave); if (porChave[k]) return; porChave[k] = 1; pend.push({ t: "não verificado: falta " + k, cor: K2.vermelho }); });
    c.locais.forEach(function (t) { pend.push({ t: t, cor: K2.vermelho }); });
    arr(r && r.verificacoes).forEach(function (v) { if (v && v.status === "pendente" && v.motivo) pend.push({ t: "não verificado: " + txt(v.nome) + " - " + txt(v.motivo), cor: K2.vermelho }); });
    arr(r && r.avisos).filter(function (q) { return q.gravidade === "erro"; }).forEach(function (q) { pend.push({ t: "Erro de cálculo: " + corta(q.texto, K2.maxNorma), cor: K2.vermelho }); });
    var total = pend.length;
    if (total > K2.maxPend) { pend = pend.slice(0, K2.maxPend); pend.push({ t: "+" + (total - K2.maxPend) + " pendência(s) não listadas - ver o memorial, seção de pendências.", cor: K2.vermelho }); }
    if (pend.length) out.push({ titulo: "PENDÊNCIAS", itens: pend, cor: K2.vermelho });
    return out;
  }
  function colunaLegenda(D, g, blocos, leg) {
    var col = g.coluna, car = g.carimbo, T = D.E.T, x0 = col.x + 4, wmax = col.w - 7, yMin = col.y + 4, yMax = car.y - 3, A0 = AP(), KB = HI().K.base;   // clim:ok geometria de desenho (mm de papel)
    D.linha(col.x, col.y, col.x, car.y, "CLI-MOLDURA");
    var hLegTit = T.quadro * K2.tituloQuadro;
    function medir(h) {
      var tot = hLegTit * K2.tituloEntre + 1.5;   // clim:ok geometria de desenho (mm de papel)
      leg.forEach(function (it) { tot += Math.max(K2.legLinha, A0.quebrar(it[1], h, wmax - K2.legTexto).length * h * K2.notaLinha + K2.notaEntre); });
      tot += K2.blocoEntre;
      blocos.forEach(function (b) {
        tot += hLegTit * K2.tituloEntre + 1.5;   // clim:ok geometria de desenho (mm de papel)
        b.itens.forEach(function (it, i) { var t = it && typeof it === "object" ? it.t : it, pre = b.numerar ? (i + 1) + "- " : "- "; tot += A0.quebrar(t, h, wmax - larg(pre, h)).length * h * K2.notaLinha + K2.notaEntre; });
        tot += K2.blocoEntre;
      });
      return tot;
    }
    var hs = [T.nota, T.nota * 0.92, T.nota * 0.84, T.minimo], h = T.minimo, coube = false;   // clim:ok passos de redução da letra
    for (var i = 0; i < hs.length; i++) { if (hs[i] >= T.minimo - 1e-9 && medir(hs[i]) <= yMax - yMin) { h = hs[i]; coube = true; break; } }   // clim:ok geometria de desenho (mm de papel)
    var y = yMin;
    D.texto(x0, y + hLegTit * KB, "LEGENDA", hLegTit, { peso: 0.26 }); y += hLegTit * K2.tituloEntre + 1.5;   // clim:ok geometria de desenho (mm de papel)
    leg.forEach(function (it) {
      var ls = A0.quebrar(it[1], h, wmax - K2.legTexto), alt = Math.max(K2.legLinha, ls.length * h * K2.notaLinha + K2.notaEntre);
      simboloLeg(D, it[0], x0 + K2.legSimbolo, y + alt / 2);
      ls.forEach(function (s, q) { D.texto(x0 + K2.legTexto, y + h * KB + q * h * K2.notaLinha + (alt - ls.length * h * K2.notaLinha) / 2, s, h, { cor: it[0] === "pend" ? K2.vermelho : undefined }); });
      y += alt;
    });
    y += K2.blocoEntre;
    blocos.forEach(function (b) {
      D.texto(x0, y + hLegTit * KB, b.titulo, hLegTit, { peso: 0.26, cor: b.cor });   // clim:ok geometria de desenho (mm de papel)
      y += hLegTit * K2.tituloEntre + 1.5;   // clim:ok geometria de desenho (mm de papel)
      b.itens.forEach(function (it, i) {
        var o = it && typeof it === "object" ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = larg(pre, h);
        D.texto(x0, y + h * KB, pre, h, { cor: o.cor || b.cor });
        A0.quebrar(o.t, h, wmax - rec).forEach(function (s) { if (y + h < yMax + 0.5) D.texto(x0 + rec, y + h * KB, s, h, { cor: o.cor || b.cor }); y += h * K2.notaLinha; });   // clim:ok geometria de desenho (mm de papel)
        y += K2.notaEntre;
      });
      y += K2.blocoEntre;
    });
    return coube;
  }

  /* ------------------------------------------------------------ GERAR */
  function gerar(resultado, modelo, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], P = PR(), A = AP(), H = HI(), CDm = CD();
    if (!P || !P.carimboRA || !A || !H) return { ok: false, folhas: [], avisos: ["Motores de prancha (prancha.js, acopranchas.js, hidisometrico.js) não carregados."] };
    if (!resultado || !Array.isArray(resultado.ambientes)) return { ok: false, folhas: [], avisos: ["Resultado do cálculo de climatização vazio: não há pranchas para gerar."] };
    var ambs = arr(opcoes.ambientes);
    if (!ambs.length && modelo && modelo.estado && CDm) ambs = arr(CDm.lerModelo(modelo.estado, modelo.avaliarFam, { anguloNorte: num(opcoes.anguloNorte, 0) }));
    if (!ambs.length) return { ok: false, folhas: [], avisos: ["Sem modelo nem ambientes: não há geometria para a planta de climatização."] };
    var S = montarSistemas(resultado, ambs);
    if (!S.sis.length) return { ok: false, folhas: [], avisos: ["Nenhuma evaporadora no resultado do cálculo: nada a desenhar."] };
    var E = estilo(), formato = P.FORMATOS && P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var codigo = txt(opcoes.codigo).trim() || "EST-CLI", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var pavs = pavimentosDe(ambs, opcoes), temDuto = S.sis.some(function (q) { return q.esc.duto; });
    var locais = pendLocais(S), hPeq = H.K.hPeq, defs = [];
    pavs.forEach(function (pv) {
      var sis = S.sis.filter(function (q) { return q.amb && txt(q.amb.pavimento || "PISO") === pv.id; });
      if (sis.length) defs.push({ id: "planta-" + defs.length, titulo: "PLANTA DE CLIMATIZAÇÃO - " + pv.nome.toUpperCase(), tipo: "planta", pv: pv, sis: sis });
    });
    var semPav = S.sis.filter(function (q) { return !q.amb; });
    if (semPav.length) avisos.push("Evaporadora(s) sem ambiente na geometria (" + semPav.map(function (q) { return q.rot; }).join(", ") + "): fora da planta; ver esquema e quadro.");
    /* esquema frigorígeno: paginado por altura */
    var area = geo.area, wTexto = area.w - 12 - K2.es.condW - K2.es.evW - 2 * K2.es.colTexto, hMax = area.h - K2.titulo - 10, paginas = [], atual = [], usado = 0;   // clim:ok margens do esquema
    S.conds.forEach(function (cd) {
      var hb = bandaAltura(A, { hPeq: hPeq }, cd, wTexto);
      if (atual.length && usado + hb > hMax) { paginas.push(atual); atual = []; usado = 0; }
      atual.push(cd); usado += hb;
    });
    if (atual.length) paginas.push(atual);
    paginas.forEach(function (g, i) { defs.push({ id: "esquema-" + (i + 1), titulo: "ESQUEMA FRIGORÍGENO" + (paginas.length > 1 ? " (" + (i + 1) + "/" + paginas.length + ")" : ""), tipo: "esquema", grupo: g, sis: S.sis }); });
    if (temDuto) pavs.forEach(function (pv) {
      var sis = S.sis.filter(function (q) { return q.esc.duto && q.amb && txt(q.amb.pavimento || "PISO") === pv.id; });
      if (sis.length) defs.push({ id: "dutos-" + defs.length, titulo: "DUTOS DE AR - INSUFLAMENTO - " + pv.nome.toUpperCase(), tipo: "dutos", pv: pv, sis: sis });
    });
    else avisos.push("Sem dutos no resultado do cálculo: folha de dutos não emitida.");
    defs.push({ id: "detalhes", titulo: "DETALHES TÍPICOS", tipo: "detalhes", sis: S.sis });
    defs.push({ id: "quadro", titulo: "QUADRO DE CARGAS E EQUIPAMENTOS POR AMBIENTE", tipo: "quadro", sis: S.sis });
    var feitas = [];
    defs.forEach(function (df, i) {
      var D = new A.Desenho(E, []), c = { D: D, geo: geo, r: resultado, conds: S.conds, S: S, sis: df.sis, pv: df.pv, grupo: df.grupo, avisos: avisos, n: i + 1, AP: A, titulo: df.titulo, hPeq: hPeq }, res = {};
      try {
        if (df.tipo === "planta") res = folhaPlanta(c);
        else if (df.tipo === "dutos") res = folhaDutos(c);
        else if (df.tipo === "esquema") res = folhaEsquema(c);
        else if (df.tipo === "detalhes") res = folhaDetalhes(c);
        else res = folhaQuadro(c);
      } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + K2.erroX, geo.area.y + K2.erroY, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: K2.vermelho }); }
      feitas.push({ def: df, D: D, escala: (res && res.escala) || "INDICADA", rotulo: dois(i + 1) });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "climpranchas", nome: "Projeto de climatização", formato: formato, orientacao: "paisagem", origem: "clim",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = notasDe({ r: resultado, locais: locais }), nPrinc = feitas.length, verif = { folhas: [], sobreposicoes: 0 };
    var leg = legendaItens(S, temDuto);
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = new A.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "CLI-MOLDURA");
      if (!colunaLegenda(Fd, geo, blocos, leg) && i === 0) avisos.push("Legenda e notas não cabem na coluna com a letra mínima do padrão: conferir.");
      A.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nPrinc));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(Hp) + 'mm" viewBox="0 0 ' + n(W) + " " + n(Hp) + '" font-family="' + FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(Hp) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + "</svg>";
      var cx = D.caixas || [], pares = A.sobreposicoes(cx);
      verif.folhas.push({ numero: numero, textos: cx.length, sobreposicoes: pares.length, pares: pares.slice(0, K2.parEx) });
      verif.sobreposicoes += pares.length;
      if (pares.length) avisos.push("Folha " + numero + ": " + pares.length + " par(es) de textos sobrepostos (ex.: " + pares.slice(0, K2.parAviso).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      return { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg, caixasTexto: cx };
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, verificacao: verif, fixture: !!resultado.fixture, sistemas: S.sis.map(function (q) { return { rot: q.rot, ambiente: q.id }; }) };
  }

  /* ------------------------------------------------------------ EXPORTAR (SVG → SvgPdf, como as outras pranchas) */
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var Sp = PDF(); return Sp ? Sp.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Projeto de climatização" }) : null; }
    return null;
  }

  var ClimPranchas = { VERSAO: 1, K2: K2, gerar: gerar, exportar: exportar, estilo: estilo, pol: pol };
  global.ClimPranchas = ClimPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

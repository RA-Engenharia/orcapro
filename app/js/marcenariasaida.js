/* =====================================================================
 * marcenariasaida.js — OS ARQUIVOS PARA A EMPRESA DE CORTE (motor puro)
 *
 * Recebe o projeto de js/marcenaria.js (Marcenaria.projeto → peças com
 * código M01-P01) e o plano (Marcenaria.otimizar) e devolve os arquivos:
 *   · PLANILHA .xlsx (ExcelJS, o mesmo js/vendor/exceljs.min.js do app) e
 *     .csv: Código, Peça/Função, Comprimento (= sentido do VEIO), Largura,
 *     Espessura, Quantidade, Material, Veio (S/N), Fita C1, C2, L1, L2,
 *     Observação, Módulo/ambiente — e as abas de ferragens, fitas, plano e
 *     peças serradas.
 *   · CORTECLOUD: planilha SEM cabeçalho, na ordem Quantidade, Comprimento
 *     (veio), Largura, Função, Fita (lados + nome + espessura), Material
 *     (nome + espessura).
 *   · CSV CONFIGURÁVEL (ordem das colunas, separador, decimal, cabeçalho):
 *     para o Corte Certo e outros. O layout oficial do Corte Certo NÃO é
 *     público — o perfil é ponto de partida; quem confere é o usuário com a
 *     empresa de corte (a tela diz isso).
 *   · DXF para CNC (R12/AC1009 ASCII, milímetro, 1:1): uma peça por
 *     arquivo (.zip) ou todas lado a lado (um BLOCO por peça). Camadas com a
 *     ferramenta e a profundidade no nome: CONTORNO, FURO_35_PROF_12,
 *     FURO_8_PROF_12, FURO_HORIZ_8_PROF_20 (furo de topo), CANAL_FUNDO_LARG_4_PROF_8,
 *     _FACE_B na face de baixo; ETIQUETA (texto, não usinar). Contorno e canal
 *     em polilinha FECHADA; nenhuma entidade repetida.
 *   · PDF (escritor próprio, sem biblioteca): ETIQUETAS A4 (3 × 8, 70 ×
 *     37,1 mm, com QR do código) e o PLANO DE CORTE (cada chapa desenhada
 *     com as peças numeradas + a lista de ferragens e de fitas).
 *
 * Por que R12 no DXF: é o que todo CAM de CNC lê; não tem LWPOLYLINE —
 * a polilinha fechada é POLYLINE/VERTEX/SEQEND com o flag 70 = 1.
 * Coordenadas do DXF: X = u (comprimento), Y = v (largura), vistas pela
 * FACE A (a usinada); convenções C1/C2/L1/L2 no js/marcenaria.js.
 * Testes: node tools/test-marcenaria-saida.js (lê de volta cada arquivo).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(txt(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function semAcento(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s); }
  function M() { return global.Marcenaria || (typeof require === "function" ? require("./marcenaria.js") : null); }
  function nomeFita(id, cat) { var f = id ? M().fitaDe(cat || M().catalogo(), id) : null; return f ? f.nome : (id || ""); }

  /* ------------------------------------------------------ AS COLUNAS */
  var CAMPOS = {
    codigo: "Código", peca: "Peça/Função", comprimento: "Comprimento (veio)", largura: "Largura", espessura: "Espessura",
    quantidade: "Quantidade", material: "Material", veio: "Veio (S/N)", fitaC1: "Fita C1", fitaC2: "Fita C2", fitaL1: "Fita L1", fitaL2: "Fita L2",
    obs: "Observação", modulo: "Módulo/ambiente", chapa: "Chapa (código)"
  };
  var ORDEM_PLANILHA = ["codigo", "peca", "comprimento", "largura", "espessura", "quantidade", "material", "veio", "fitaC1", "fitaC2", "fitaL1", "fitaL2", "obs", "modulo"];
  var NUMERICOS = { comprimento: 1, largura: 1, espessura: 1, quantidade: 1 };
  /* perfis do CSV — PONTO DE PARTIDA, a tela grava o do usuário */
  var PERFIS_CSV = {
    planilha: { nome: "Planilha completa", colunas: ORDEM_PLANILHA.slice(), separador: ";", decimal: ",", cabecalho: true },
    cortecerto: { nome: "Corte Certo (conferir)", colunas: ["quantidade", "comprimento", "largura", "espessura", "material", "peca", "veio", "fitaC1", "fitaC2", "fitaL1", "fitaL2", "modulo", "codigo"], separador: ";", decimal: ",", cabecalho: true,
      nota: "O layout de importação do Corte Certo não é público: este perfil é ponto de partida. Confira a ordem das colunas com a empresa de corte e ajuste." }
  };

  /* peças iguais do mesmo módulo viram uma linha com quantidade */
  function linhas(proj, cat) {
    var acc = {}, ordem = [];
    arr(proj && proj.pecas).forEach(function (p) {
      var k = [p.modulo, p.nome, p.comprimento, p.largura, p.espessura, p.chapa, p.veio ? 1 : 0, p.fita.C1, p.fita.C2, p.fita.L1, p.fita.L2, p.obs].join("|");
      if (!acc[k]) {
        acc[k] = { codigos: [], peca: p.nome, comprimento: p.comprimento, largura: p.largura, espessura: p.espessura, quantidade: 0, material: p.material, chapa: p.chapa, veio: p.veio ? "S" : "N",
          fitaC1: nomeFita(p.fita.C1, cat), fitaC2: nomeFita(p.fita.C2, cat), fitaL1: nomeFita(p.fita.L1, cat), fitaL2: nomeFita(p.fita.L2, cat),
          fitaIds: { C1: p.fita.C1, C2: p.fita.C2, L1: p.fita.L1, L2: p.fita.L2 }, obs: p.obs || "",
          modulo: [p.modulo, p.nomeModulo, p.ambiente].filter(function (x) { return !!txt(x).trim(); }).join(" · ") };
        ordem.push(k);
      }
      acc[k].quantidade++; acc[k].codigos.push(p.codigo);
    });
    return ordem.map(function (k) { var l = acc[k]; l.codigo = l.codigos.join(", "); return l; });
  }
  function valorCampo(l, c) { return l[c] == null ? "" : l[c]; }

  /* --------------------------------------------------------- CSV */
  function csv(proj, perfilIn, cat) {
    var pf = perfilIn || PERFIS_CSV.planilha, sep = pf.separador === "tab" ? "\t" : (pf.separador || ";"), dec = pf.decimal === "." ? "." : ",";
    var cols = arr(pf.colunas).filter(function (c) { return CAMPOS[c]; });
    if (!cols.length) cols = ORDEM_PLANILHA.slice();
    if (sep === dec) return { ok: false, erro: "o separador de colunas não pode ser igual ao separador decimal" };
    function cel(v, c) {
      var s = NUMERICOS[c] && typeof v === "number" ? String(v).replace(".", dec) : txt(v);
      return /["\r\n]/.test(s) || s.indexOf(sep) >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var out = [];
    if (pf.cabecalho !== false) out.push(cols.map(function (c) { return cel(CAMPOS[c], ""); }).join(sep));
    linhas(proj, cat).forEach(function (l) { out.push(cols.map(function (c) { return cel(valorCampo(l, c), c); }).join(sep)); });
    return { ok: true, texto: (pf.bom === false ? "" : "﻿") + out.join("\r\n") + "\r\n", colunas: cols, linhas: out.length - (pf.cabecalho !== false ? 1 : 0) };
  }

  /* ------------------------------------------------- CORTECLOUD */
  function fitaCortecloud(ids, cat) {
    var por = {}, ordem = [];
    ["C1", "C2", "L1", "L2"].forEach(function (s) { var f = ids[s]; if (!f) return; if (!por[f]) { por[f] = []; ordem.push(f); } por[f].push(s); });
    return ordem.map(function (f) {
      var fi = M().fitaDe(cat || M().catalogo(), f), esp = fi ? String(fi.espessura).replace(".", ",") + " mm" : "";
      var nome = fi ? fi.nome : f;
      return por[f].join("+") + " " + nome + (esp && nome.indexOf(esp) < 0 ? " " + esp : "");
    }).join(" / ");
  }
  function materialComEspessura(l) { var e = String(l.espessura).replace(".", ",") + " mm"; return l.material.indexOf(e) >= 0 ? l.material : l.material + " " + e; }
  function cortecloudLinhas(proj, cat) {
    return linhas(proj, cat).map(function (l) { return [l.quantidade, l.comprimento, l.largura, l.peca + (l.modulo ? " (" + l.modulo.split(" · ")[0] + ")" : "") + (l.obs ? " — " + l.obs : ""), fitaCortecloud(l.fitaIds, cat), materialComEspessura(l)]; });
  }

  /* ----------------------------------------------------- XLSX */
  function estiloCab(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }; c.alignment = { vertical: "middle", wrapText: true }; });
  }
  function planilha(ExcelJS, proj, plano, opts) {
    var o = opts || {}, cat = o.catalogo, wb = new ExcelJS.Workbook();
    wb.creator = "OrçaPRO Modela"; wb.created = o.data || new Date(0);
    var ws = wb.addWorksheet("Peças", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = ORDEM_PLANILHA.map(function (c) { return { header: CAMPOS[c], key: c, width: { codigo: 18, peca: 24, material: 28, modulo: 30, obs: 30 }[c] || (/^fita/.test(c) ? 22 : 12) }; });
    estiloCab(ws.getRow(1));
    linhas(proj, cat).forEach(function (l) { var r = {}; ORDEM_PLANILHA.forEach(function (c) { r[c] = valorCampo(l, c); }); ws.addRow(r); });
    ["comprimento", "largura", "espessura"].forEach(function (c) { ws.getColumn(c).numFmt = "0.0"; });
    var wf = wb.addWorksheet("Ferragens");
    wf.columns = [{ header: "Item", key: "nome", width: 54 }, { header: "Unidade", key: "unidade", width: 10 }, { header: "Quantidade", key: "quantidade", width: 12 }];
    estiloCab(wf.getRow(1));
    arr(proj.ferragens).forEach(function (f) { wf.addRow({ nome: f.nome, unidade: f.unidade, quantidade: f.quantidade }); });
    if (plano) {
      var wt = wb.addWorksheet("Fitas");
      wt.columns = [{ header: "Fita", key: "nome", width: 34 }, { header: "Arestas", key: "arestas", width: 10 }, { header: "Metros", key: "metros", width: 10 }, { header: "Metros com sobra", key: "metrosComSobra", width: 16 }];
      estiloCab(wt.getRow(1));
      arr(plano.fitas).forEach(function (f) { wt.addRow(f); });
      var wp = wb.addWorksheet("Plano de corte");
      wp.columns = [{ header: "Material", key: "material", width: 32 }, { header: "Chapa (mm)", key: "chapa", width: 14 }, { header: "Chapa nº", key: "n", width: 10 }, { header: "Peças", key: "pecas", width: 8 }, { header: "Aproveitamento (%)", key: "ap", width: 18 }, { header: "Retalhos (mm)", key: "sobras", width: 40 }];
      estiloCab(wp.getRow(1));
      arr(plano.grupos).forEach(function (g) {
        g.chapas.forEach(function (s) { wp.addRow({ material: g.material, chapa: g.comprimento + " × " + g.largura, n: s.indice + " de " + g.nChapas, pecas: s.pecas.length, ap: s.aproveitamento, sobras: s.sobras.map(function (x) { return Math.round(x.w) + "×" + Math.round(x.h); }).join(", ") }); });
        var tr = wp.addRow({ material: g.material + " — total", chapa: "", n: g.nChapas + " chapa(s)", pecas: g.pecas, ap: g.aproveitamento }); tr.font = { bold: true };
      });
      wp.addRow({}); wp.addRow({ material: "Serra (kerf) " + plano.kerf + " mm · refilo " + plano.refilo + " mm por borda · aproveitamento = área das peças ÷ área da chapa" });
    }
    var ser = arr(proj.serradas);
    if (ser.length) {
      var MM = M(), ag = MM.agruparSerradas(ser), wsr = wb.addWorksheet("Peças serradas");
      wsr.columns = [{ header: "Código", key: "codigo", width: 18 }, { header: "Peça", key: "nome", width: 24 }, { header: "Seção b × h (mm)", key: "secao", width: 16 }, { header: "Comprimento (mm)", key: "comprimento", width: 16 },
        { header: "Quantidade", key: "quantidade", width: 11 }, { header: "Espécie", key: "especie", width: 34 }, { header: "Corte 1", key: "c1", width: 22 }, { header: "Corte 2", key: "c2", width: 22 },
        { header: "Volume (m³)", key: "volume", width: 12 }, { header: "Massa (kg)", key: "massa", width: 11 }, { header: "Observação", key: "obs", width: 40 }];
      estiloCab(wsr.getRow(1));
      ag.forEach(function (s) { wsr.addRow({ codigo: s.codigos.join(", "), nome: s.nome, secao: s.b + " × " + s.h, comprimento: s.comprimento, quantidade: s.quantidade, especie: s.especie, c1: s.corte1.descricao, c2: s.corte2.descricao, volume: s.volume, massa: s.massa, obs: s.obs }); });
      var ob = MM.otimizarBarras(ser, { barra: o.barra }), wb2 = wb.addWorksheet("Barras");
      wb2.columns = [{ header: "Seção", key: "secao", width: 16 }, { header: "Espécie", key: "especie", width: 34 }, { header: "Barra nº", key: "n", width: 10 }, { header: "Cortes (mm)", key: "cortes", width: 50 }, { header: "Sobra (mm)", key: "sobra", width: 12 }];
      estiloCab(wb2.getRow(1));
      ob.grupos.forEach(function (g) { g.barras.forEach(function (b, i) { wb2.addRow({ secao: g.secao, especie: g.especie, n: (i + 1) + " de " + g.nBarras, cortes: b.cortes.map(function (c) { return c.c; }).join(" + "), sobra: b.sobra }); }); });
      wb2.addRow({}); wb2.addRow({ secao: "Barra de " + ob.barra + " mm, serra de " + ob.kerf + " mm (valores de partida, editáveis)" + (ob.maioresQueABarra.length ? " · maiores que a barra (pedir sob medida ou emendar): " + ob.maioresQueABarra.join(", ") : "") });
      wb2.addRow({ secao: M().AVISO_NBR });
    }
    var wl = wb.addWorksheet("Leia-me");
    wl.getColumn(1).width = 110;
    ["OrçaPRO Modela — lista de corte",
     "Comprimento = sentido do VEIO da chapa. Peça com Veio = S não pode girar no corte.",
     "Bordas: C1 e C2 são as bordas do comprimento; L1 e L2 as da largura. C1 = a borda da frente (na porta, a das dobradiças; na gaveta, o topo).",
     "Medidas em milímetros. Folgas, furação e fitas são valores de partida, editáveis no OrçaPRO (Chapas e fitas).",
     "Conferir as medidas na obra antes de cortar."].forEach(function (t) { wl.addRow([t]); });
    wl.getRow(1).font = { bold: true, size: 13 };
    return wb;
  }
  function planilhaCortecloud(ExcelJS, proj, cat) {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Peças");
    cortecloudLinhas(proj, cat).forEach(function (l) { ws.addRow(l); });
    [8, 14, 12, 34, 50, 34].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    return wb;
  }

  /* ------------------------------------------------------ DXF R12 */
  function nCam(v) { var s = String(r1(v)); return s.replace(".", "_"); }
  function camadaFuro(f, face) { return "FURO_" + nCam(f.d) + "_PROF_" + nCam(f.prof) + (face === "B" ? "_FACE_B" : ""); }
  function camadaTopo(f) { return "FURO_HORIZ_" + nCam(f.d) + "_PROF_" + nCam(f.prof); }
  function camadaCanal(u) { return "CANAL_FUNDO_LARG_" + nCam(u.larg) + "_PROF_" + nCam(u.prof) + (u.face === "B" ? "_FACE_B" : ""); }
  /* entidades de UMA peça em (u, v) — sem repetir: a mesma entidade na mesma camada entra uma vez */
  function entidadesPeca(p) {
    var ents = [], vistos = {};
    function add(e) { var k = JSON.stringify(e); if (vistos[k]) return; vistos[k] = 1; ents.push(e); }
    var C = p.comprimento, L = p.largura;
    add({ t: "POLY", c: "CONTORNO", pts: [[0, 0], [C, 0], [C, L], [0, L]] });
    arr(p.furos).forEach(function (f) { add({ t: "CIRCLE", c: camadaFuro(f, f.face), x: f.u, y: f.v, r: f.d / 2 }); });
    arr(p.furosTopo).forEach(function (f) {
      /* furo de topo: a LINHA do eixo, da borda para dentro, com o comprimento da profundidade */
      var a, b;
      if (f.lado === "L1") { a = [0, f.pos]; b = [f.prof, f.pos]; }
      else if (f.lado === "L2") { a = [C, f.pos]; b = [C - f.prof, f.pos]; }
      else if (f.lado === "C1") { a = [f.pos, 0]; b = [f.pos, f.prof]; }
      else { a = [f.pos, L]; b = [f.pos, L - f.prof]; }
      add({ t: "LINE", c: camadaTopo(f), p: [a[0], a[1], b[0], b[1]] });
    });
    arr(p.usinagens).forEach(function (u) { if (u.tipo === "canal_fundo") add({ t: "POLY", c: camadaCanal(u), pts: [[u.u0, u.v0], [u.u1, u.v0], [u.u1, u.v1], [u.u0, u.v1]] }); });
    return ents;
  }
  function f6(v) { var n = Math.round(v * 1e4) / 1e4; if (Math.abs(n) < 1e-9) n = 0; return String(n); }
  function escreverEnts(L, ents, dx, dy) {
    function g(c, v) { L.push(String(c)); L.push(String(v)); }
    dx = dx || 0; dy = dy || 0;
    ents.forEach(function (e) {
      if (e.t === "POLY") {
        g(0, "POLYLINE"); g(8, e.c); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
        e.pts.forEach(function (q) { g(0, "VERTEX"); g(8, e.c); g(10, f6(q[0] + dx)); g(20, f6(q[1] + dy)); g(30, 0); });
        g(0, "SEQEND"); g(8, e.c);
      } else if (e.t === "CIRCLE") { g(0, "CIRCLE"); g(8, e.c); g(10, f6(e.x + dx)); g(20, f6(e.y + dy)); g(30, 0); g(40, f6(e.r)); }
      else if (e.t === "LINE") { g(0, "LINE"); g(8, e.c); g(10, f6(e.p[0] + dx)); g(20, f6(e.p[1] + dy)); g(30, 0); g(11, f6(e.p[2] + dx)); g(21, f6(e.p[3] + dy)); g(31, 0); }
      else if (e.t === "TEXT") { g(0, "TEXT"); g(8, e.c); g(10, f6(e.x + dx)); g(20, f6(e.y + dy)); g(30, 0); g(40, f6(e.h)); g(1, semAcento(e.s).replace(/[^\x20-\x7e]/g, "?")); }
      else if (e.t === "INSERT") { g(0, "INSERT"); g(8, e.c); g(2, e.bloco); g(10, f6(e.x)); g(20, f6(e.y)); g(30, 0); }
    });
  }
  /* cor ACI por camada (só para enxergar no CAD; o CAM lê pelo NOME) */
  function corCamada(n) { if (n === "CONTORNO") return 7; if (/^FURO_HORIZ/.test(n)) return 3; if (/^FURO_/.test(n)) return /FACE_B/.test(n) ? 6 : 1; if (/^CANAL/.test(n)) return 4; if (n === "ETIQUETA") return 8; return 2; }
  function dxfTexto(camadas, blocos, ents, ext) {
    var L = [];
    function g(c, v) { L.push(String(c)); L.push(String(v)); }
    g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSUNITS"); g(70, 4); g(9, "$MEASUREMENT"); g(70, 1);
    g(9, "$EXTMIN"); g(10, f6(ext[0])); g(20, f6(ext[1])); g(30, 0); g(9, "$EXTMAX"); g(10, f6(ext[2])); g(20, f6(ext[3])); g(30, 0); g(0, "ENDSEC");
    g(0, "SECTION"); g(2, "TABLES");
    g(0, "TABLE"); g(2, "LTYPE"); g(70, 1); g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0); g(0, "ENDTAB");
    g(0, "TABLE"); g(2, "LAYER"); g(70, camadas.length);
    camadas.forEach(function (n) { g(0, "LAYER"); g(2, n); g(70, 0); g(62, corCamada(n)); g(6, "CONTINUOUS"); });
    g(0, "ENDTAB"); g(0, "ENDSEC");
    g(0, "SECTION"); g(2, "BLOCKS");
    blocos.forEach(function (b) { g(0, "BLOCK"); g(8, "0"); g(2, b.nome); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, b.nome); escreverEnts(L, b.ents); g(0, "ENDBLK"); g(8, "0"); });
    g(0, "ENDSEC");
    g(0, "SECTION"); g(2, "ENTITIES"); escreverEnts(L, ents); g(0, "ENDSEC"); g(0, "EOF");
    return L.join("\r\n") + "\r\n";
  }
  function camadasDe(listas) { var v = {}, o = []; listas.forEach(function (es) { es.forEach(function (e) { if (!v[e.c]) { v[e.c] = 1; o.push(e.c); } }); }); return o; }
  function dxfPeca(p) {
    var ents = entidadesPeca(p);
    return dxfTexto(camadasDe([ents]), [], ents, [0, 0, p.comprimento, p.largura]);
  }
  function nomeBloco(p) { return semAcento(p.codigo || p.id || "PECA").toUpperCase().replace(/[^A-Z0-9_\-]/g, "_"); }
  /* todas lado a lado: um BLOCO por peça (o desenho dela) e um INSERT em fila,
     50 mm entre as peças, quebrando a fila a cada `largura` mm; a etiqueta
     (código e nome) embaixo de cada uma, na camada ETIQUETA */
  function dxfTodas(pecas, opts) {
    var o = opts || {}, gap = num(o.espaco, 50), maxW = num(o.largura, 6000), x = 0, y = 0, linhaH = 0, blocos = [], ents = [], ext = [0, 0, 0, 0];
    arr(pecas).forEach(function (p) {
      /* a fila seguinte SOBE (a etiqueta fica embaixo de cada peça, no vão de 50 + 30 mm) */
      if (x > 0 && x + p.comprimento > maxW) { x = 0; y += linhaH + gap + 30; linhaH = 0; }
      var bn = nomeBloco(p);
      blocos.push({ nome: bn, ents: entidadesPeca(p) });
      ents.push({ t: "INSERT", c: "0", bloco: bn, x: x, y: y });
      ents.push({ t: "TEXT", c: "ETIQUETA", x: x, y: y - 22, h: 12, s: (p.codigo || "") + " " + (p.nome || "") + " " + p.comprimento + "x" + p.largura + "x" + p.espessura });
      ext[2] = Math.max(ext[2], x + p.comprimento); ext[1] = Math.min(ext[1], y - 30); ext[3] = Math.max(ext[3], y + p.largura);
      x += p.comprimento + gap; linhaH = Math.max(linhaH, p.largura);
    });
    var cams = camadasDe(blocos.map(function (b) { return b.ents; }).concat([ents.filter(function (e) { return e.t === "TEXT"; })]));
    if (cams.indexOf("0") < 0) cams.unshift("0");
    return dxfTexto(cams, blocos, ents, ext);
  }
  /* uma peça por arquivo, num .zip (o escritor de zip do app: BimBcf.zipEscrever) */
  function dxfZip(pecas, zipEscrever) {
    var mapa = {};
    arr(pecas).forEach(function (p) { mapa[nomeBloco(p) + ".dxf"] = dxfPeca(p); });
    return zipEscrever(mapa);
  }
  /* leitor mínimo do DXF R12 (para os testes e para a tela conferir): pares código/valor */
  function lerDxf(t) {
    var ls = String(t).split(/\r?\n/), out = { versao: null, camadas: [], blocos: {}, entidades: [] };
    var sec = null, nomeSec = false, bloco = null, nomeBloco = false, ent = null, poly = null;
    function destino() { return bloco ? out.blocos[bloco].ents : out.entidades; }
    function fechar() {
      if (!ent) return;
      if (ent.t === "VERTEX") { if (poly) poly.pts.push([ent.x, ent.y]); }
      else if (ent.t === "SEQEND") { if (poly) { destino().push(poly); poly = null; } }
      else if (ent.t === "POLYLINE") { poly = ent; poly.pts = []; }
      else if (ent.t === "LAYERDEF") out.camadas.push(ent.nome);
      else if (ent.t !== "BLOCK" && ent.t !== "ENDBLK") destino().push(ent);
      ent = null;
    }
    for (var i = 0; i + 1 < ls.length; i += 2) {
      var c = parseInt(ls[i], 10), v = ls[i + 1];
      if (c === 0) {
        fechar();
        if (v === "SECTION") nomeSec = true;
        else if (v === "ENDSEC") sec = null;
        else if (sec === "TABLES") { if (v === "LAYER") ent = { t: "LAYERDEF" }; }
        else if (sec === "BLOCKS" && v === "BLOCK") { nomeBloco = true; ent = { t: "BLOCK" }; }
        else if (v === "ENDBLK") { bloco = null; ent = { t: "ENDBLK" }; }
        else if (sec === "ENTITIES" || sec === "BLOCKS") ent = { t: v };
        continue;
      }
      if (nomeSec && c === 2) { sec = v; nomeSec = false; continue; }
      if (nomeBloco && c === 2) { bloco = v; out.blocos[v] = { ents: [] }; nomeBloco = false; continue; }
      if (sec === "HEADER" && c === 1 && /^AC/.test(v)) out.versao = v;
      if (!ent) continue;
      if (ent.t === "LAYERDEF") { if (c === 2) ent.nome = v; continue; }
      if (c === 8) ent.camada = v;
      else if (c === 10) ent.x = parseFloat(v); else if (c === 20) ent.y = parseFloat(v);
      else if (c === 11) ent.x2 = parseFloat(v); else if (c === 21) ent.y2 = parseFloat(v);
      else if (c === 40) ent.r = parseFloat(v); else if (c === 1) ent.texto = v;
      else if (c === 2 && ent.t === "INSERT") ent.bloco = v;
      else if (c === 70 && ent.t === "POLYLINE") ent.fechado = (parseInt(v, 10) & 1) === 1;
    }
    fechar();
    return out;
  }

  /* ------------------------------------------------------ PDF
   * Escritor mínimo: páginas em mm (origem no canto de cima), linhas,
   * retângulos, texto Helvetica (WinAnsi) e QR em módulos preenchidos. */
  var WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
    0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
  function win1252(s) {
    var o = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), b = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : (WIN[c] || 0x3f);
      var ch = String.fromCharCode(b);
      o += ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch;
    }
    return o;
  }
  function Pdf() { this.paginas = []; this.atual = null; }
  var PT = 72 / 25.4;
  Pdf.prototype = {
    pagina: function (w, h) { this.atual = { w: w, h: h, ops: [] }; this.paginas.push(this.atual); return this; },
    _y: function (y) { return (this.atual.h - y) * PT; },
    _n: function (v) { return (Math.round(v * 100) / 100).toString(); },
    cor: function (hex, preench) {
      var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "#000000"); if (!m) m = [0, "00", "00", "00"];
      var rgb = [1, 2, 3].map(function (i) { return (parseInt(m[i], 16) / 255).toFixed(3); }).join(" ");
      this.atual.ops.push(rgb + (preench ? " rg" : " RG")); return this;
    },
    espessura: function (mm) { this.atual.ops.push(this._n(mm * PT) + " w"); return this; },
    linha: function (x1, y1, x2, y2) { this.atual.ops.push(this._n(x1 * PT) + " " + this._n(this._y(y1)) + " m " + this._n(x2 * PT) + " " + this._n(this._y(y2)) + " l S"); return this; },
    ret: function (x, y, w, h, modo) { this.atual.ops.push(this._n(x * PT) + " " + this._n(this._y(y + h)) + " " + this._n(w * PT) + " " + this._n(h * PT) + " re " + (modo === "f" ? "f" : modo === "B" ? "B" : "S")); return this; },
    tracejado: function (on) { this.atual.ops.push(on ? "[2 2] 0 d" : "[] 0 d"); return this; },
    texto: function (x, y, tam, s, o) {
      o = o || {}; var t = txt(s); if (o.max && t.length > o.max) t = t.slice(0, o.max - 1) + "…";
      var larg = t.length * tam * 0.5 / PT, xx = o.centro ? x - larg / 2 : (o.direita ? x - larg : x);
      this.atual.ops.push("BT /" + (o.negrito ? "F2" : "F1") + " " + this._n(tam) + " Tf " + this._n(xx * PT) + " " + this._n(this._y(y)) + " Td (" + win1252(t) + ") Tj ET"); return this;
    },
    qr: function (lib, texto, x, y, lado) {
      if (!lib || !texto) return false;
      var q; try { q = lib(0, "M"); q.addData(String(texto)); q.make(); } catch (e) { return false; }
      var n = q.getModuleCount(), m = lado / n;
      this.cor("#000000", true);
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) this.atual.ops.push(this._n((x + c * m) * PT) + " " + this._n(this._y(y + (r + 1) * m)) + " " + this._n(m * PT + 0.05) + " " + this._n(m * PT + 0.05) + " re f");
      return true;
    },
    bytes: function () {
      var objs = [], self = this;
      objs.push("<< /Type /Catalog /Pages 2 0 R >>");
      var kids = this.paginas.map(function (p, i) { return (5 + 2 * i) + " 0 R"; }).join(" ");
      objs.push("<< /Type /Pages /Kids [" + kids + "] /Count " + this.paginas.length + " >>");
      objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      this.paginas.forEach(function (p, i) {
        var cont = p.ops.join("\n");
        objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + self._n(p.w * PT) + " " + self._n(p.h * PT) + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + 2 * i) + " 0 R >>");
        objs.push("<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream");
      });
      var s = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", offs = [];
      objs.forEach(function (o, i) { offs.push(s.length); s += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
      var xref = s.length;
      s += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
      offs.forEach(function (o) { s += ("0000000000" + o).slice(-10) + " 00000 n \n"; });
      s += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
      var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
      return b;
    }
  };
  function qrLib(deps) { return (deps && deps.qrcode) || global.qrcode || null; }

  /* ETIQUETAS: A4, 3 colunas × 8 linhas de 70 × 37,125 mm (folha de etiqueta
     A4 sem margem — valor de partida; `opts.colunas/linhas/margem` mudam) */
  function pdfEtiquetas(pecas, opts, deps) {
    var o = opts || {}, nc = num(o.colunas, 3), nl = num(o.linhas, 8), mg = num(o.margem, 0), W = 210, H = 297;
    var ew = (W - 2 * mg) / nc, eh = (H - 2 * mg) / nl, porPag = nc * nl, pdf = new Pdf(), lib = qrLib(deps), cat = o.catalogo, comQr = 0;
    arr(pecas).forEach(function (p, i) {
      if (i % porPag === 0) pdf.pagina(W, H);
      var k = i % porPag, x = mg + (k % nc) * ew, y = mg + Math.floor(k / nc) * eh, pad = 2.5, q = Math.min(eh - 2 * pad - 12, 20);
      pdf.cor("#c8ccd2", false).espessura(0.1).ret(x, y, ew, eh);
      pdf.cor("#000000", true);
      pdf.texto(x + pad, y + pad + 4, 11, p.codigo, { negrito: true });
      pdf.texto(x + pad, y + pad + 9, 8.5, p.nome, { max: 28 });
      pdf.texto(x + pad, y + pad + 13.2, 7, [p.modulo, p.nomeModulo, p.ambiente].filter(function (z) { return !!txt(z).trim(); }).join(" · "), { max: 34 });
      pdf.texto(x + pad, y + pad + 18.5, 9.5, p.comprimento + " × " + p.largura + " × " + p.espessura + " mm", { negrito: true });
      pdf.texto(x + pad, y + pad + 23, 6.5, p.material + (p.veio ? " · VEIO no comprimento" : ""), { max: 56 });
      var fs = ["C1", "C2", "L1", "L2"].filter(function (s) { return p.fita && p.fita[s]; });
      pdf.texto(x + pad, y + pad + 27.6, 7.5, fs.length ? "Fita: " + fs.join(" ") : "Sem fita", {});
      /* desenho da peça: borda grossa = lado com fita */
      var dw = 14, dh = 6, dx = x + ew - pad - dw, dy = y + eh - pad - dh;
      pdf.cor("#888888", false).espessura(0.15).ret(dx, dy, dw, dh);
      pdf.cor("#000000", false).espessura(0.7);
      if (p.fita && p.fita.C1) pdf.linha(dx, dy + dh, dx + dw, dy + dh);
      if (p.fita && p.fita.C2) pdf.linha(dx, dy, dx + dw, dy);
      if (p.fita && p.fita.L1) pdf.linha(dx, dy, dx, dy + dh);
      if (p.fita && p.fita.L2) pdf.linha(dx + dw, dy, dx + dw, dy + dh);
      pdf.espessura(0.2);
      if (pdf.qr(lib, p.codigo, x + ew - pad - q, y + pad, q)) comQr++;
      void cat;
    });
    if (!arr(pecas).length) pdf.pagina(W, H).texto(20, 30, 12, "Nenhuma peça.");
    return { bytes: pdf.bytes(), paginas: pdf.paginas.length, etiquetas: arr(pecas).length, comQr: comQr };
  }

  /* PLANO DE CORTE: uma página A4 deitada por chapa (o desenho com as peças
     numeradas e a legenda), e a página das ferragens e das fitas */
  var CORES = ["#dbeafe", "#dcfce7", "#fef9c3", "#fde2e2", "#ede9fe", "#ffedd5", "#ccfbf1", "#f5f5f4"];
  function pdfPlano(plano, proj, opts) {
    var o = opts || {}, pdf = new Pdf(), W = 297, H = 210, titulo = txt(o.titulo) || "Plano de corte";
    var total = plano.grupos.reduce(function (s, g) { return s + g.nChapas; }, 0), pag = 0;
    plano.grupos.forEach(function (g) {
      g.chapas.forEach(function (s) {
        pag++;
        pdf.pagina(W, H);
        pdf.cor("#000000", true).texto(10, 12, 13, titulo + " — " + g.material, { negrito: true, max: 80 });
        pdf.texto(10, 18, 9, "Chapa " + s.indice + " de " + g.nChapas + " · " + g.comprimento + " × " + g.largura + " mm · " + s.pecas.length + " peças · aproveitamento " + String(s.aproveitamento).replace(".", ",") + "%" +
          " · serra " + plano.kerf + " mm · refilo " + plano.refilo + " mm" + (g.veio ? " · VEIO no comprimento da chapa" : ""), { max: 140 });
        pdf.texto(W - 10, 12, 8, "folha " + pag + " de " + (total + 1), { direita: true });
        var areaW = 200, areaH = 170, esc = Math.min(areaW / g.comprimento, areaH / g.largura), ox = 10, oy = 25;
        pdf.cor("#000000", false).espessura(0.3).ret(ox, oy, g.comprimento * esc, g.largura * esc);
        pdf.cor("#999999", false).tracejado(true).espessura(0.15).ret(ox + plano.refilo * esc, oy + plano.refilo * esc, (g.comprimento - 2 * plano.refilo) * esc, (g.largura - 2 * plano.refilo) * esc).tracejado(false);
        s.pecas.forEach(function (p, i) {
          var x = ox + p.x * esc, y = oy + p.y * esc, w = p.w * esc, h = p.h * esc;
          pdf.cor(CORES[i % CORES.length], true).cor("#333333", false).espessura(0.2).ret(x, y, w, h, "B");
          pdf.cor("#000000", true).texto(x + w / 2, y + h / 2 + 1.5, Math.max(5, Math.min(10, Math.min(w, h) * 0.5)), String(i + 1), { centro: true, negrito: true });
          if (w > 22 && h > 8) pdf.texto(x + w / 2, y + h / 2 + 5, 5.5, p.w + " × " + p.h, { centro: true });
        });
        s.sobras.forEach(function (r) { pdf.cor("#9ca3af", true).texto(ox + (r.x + r.w / 2) * esc, oy + (r.y + r.h / 2) * esc, 5, "retalho " + Math.round(r.w) + "×" + Math.round(r.h), { centro: true }); });
        var lx = 215, ly = 30;
        pdf.cor("#000000", true).texto(lx, ly - 3, 8, "Nº  Código        Peça · C × L (mm)", { negrito: true });
        s.pecas.forEach(function (p, i) {
          if (ly + i * 4.2 > H - 8) return;
          pdf.texto(lx, ly + 2 + i * 4.2, 6.8, (i + 1) + "  " + p.codigo + "  " + p.nome + " · " + p.comprimento + " × " + p.largura + (p.girada ? " (girada)" : ""), { max: 52 });
        });
      });
    });
    pdf.pagina(W, H);
    pdf.cor("#000000", true).texto(10, 12, 13, titulo + " — ferragens e fitas", { negrito: true });
    var y = 22;
    pdf.texto(10, y, 9, "Ferragens", { negrito: true }); y += 5;
    arr(proj && proj.ferragens).forEach(function (f) { if (y > H - 10) return; pdf.texto(12, y, 8, f.quantidade + " " + f.unidade + " — " + f.nome, { max: 90 }); y += 4.2; });
    y += 3; pdf.texto(10, y, 9, "Fita de borda", { negrito: true }); y += 5;
    arr(plano.fitas).forEach(function (f) { if (y > H - 10) return; pdf.texto(12, y, 8, f.nome + ": " + String(f.metros).replace(".", ",") + " m (" + String(f.metrosComSobra).replace(".", ",") + " m com a sobra de ponta) — " + f.arestas + " arestas"); y += 4.2; });
    y += 3; pdf.texto(10, y, 9, "Chapas", { negrito: true }); y += 5;
    plano.grupos.forEach(function (g) { if (y > H - 10) return; pdf.texto(12, y, 8, g.nChapas + " × " + g.material + " (" + g.comprimento + " × " + g.largura + ") — aproveitamento " + String(g.aproveitamento).replace(".", ",") + "%"); y += 4.2; });
    if (plano.naoCouberam.length) { y += 3; pdf.cor("#b91c1c", true).texto(10, y, 8.5, "Não couberam na chapa: " + plano.naoCouberam.join(", "), { negrito: true, max: 140 }); }
    pdf.cor("#555555", true).texto(10, H - 8, 7, "Medidas em mm. Folgas, furação e fitas são valores de partida, editáveis no OrçaPRO. Conferir as medidas na obra antes de cortar.");
    return { bytes: pdf.bytes(), paginas: pdf.paginas.length };
  }
  /* leitura mínima do PDF (para os testes): nº de páginas e os textos */
  function lerPdf(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var pags = (s.match(/\/Type \/Page\b(?!s)/g) || []).length, textos = [];
    s.replace(/\(((?:\\.|[^\\)])*)\) Tj/g, function (_, t) { textos.push(t.replace(/\\(.)/g, "$1")); return _; });
    return { ok: /^%PDF-1\.\d/.test(s) && /%%EOF\s*$/.test(s), paginas: pags, textos: textos, qrModulos: (s.match(/ re f/g) || []).length };
  }

  var MarcenariaSaida = {
    CAMPOS: CAMPOS, ORDEM_PLANILHA: ORDEM_PLANILHA, PERFIS_CSV: PERFIS_CSV,
    linhas: linhas, csv: csv, planilha: planilha, cortecloudLinhas: cortecloudLinhas, planilhaCortecloud: planilhaCortecloud, fitaCortecloud: fitaCortecloud,
    entidadesPeca: entidadesPeca, dxfPeca: dxfPeca, dxfTodas: dxfTodas, dxfZip: dxfZip, lerDxf: lerDxf, camadaFuro: camadaFuro,
    Pdf: Pdf, pdfEtiquetas: pdfEtiquetas, pdfPlano: pdfPlano, lerPdf: lerPdf
  };
  global.MarcenariaSaida = MarcenariaSaida;
  if (typeof module !== "undefined" && module.exports) module.exports = MarcenariaSaida;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

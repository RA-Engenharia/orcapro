/* =====================================================================
 * arqcad.js — O ARQUIVO CAD ÚNICO DAS PRANCHAS DE ARQUITETURA (etapa 5, 15/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   ArqCad.paraCad(r, opcoes)  → { dxf, ctb (Uint8Array), ctbNome, dxfNome, leiame, pens, resumo, avisos, doc }
 *   ArqCad.zip(r, opcoes)      → Uint8Array do ZIP (DXF + CTB + LEIA-ME.txt)   (usa BimBcf.zipEscrever)
 *   ArqCad.ctbTexto / ctbBytes / ctbParse   o plot style (CTB) do pacote
 *
 * O QUE SAI: UM DXF R2010 (AC1024) com
 *   - o MODEL: cada desenho em ESCALA REAL (metros), lado a lado, sem sobreposição (cada um dentro de um quadro ARQ-MODELO-QUADRO, que não plota);
 *   - um LAYOUT (paperspace) por folha, com o código da folha no nome ("ARQ-01"), no tamanho do formato (A0–A4), moldura, carimbo RA, coluna
 *     de notas, tabelas e UMA VIEWPORT TRAVADA por desenho, na escala dele (altura da janela no MODEL = altura do quadro em mm × escala ÷ 1000);
 *   - a página de cada layout pronta para plotar: "DWG To PDF.pc3", papel ISO full bleed do formato, mm, 1:1, área = layout, estilo = o CTB do pacote.
 * DE ONDE VEM: do SVG de cada folha (o mesmo que vai ao PDF). O desenho de cada bloco fica em mm de papel no SVG; aqui ele volta à escala real
 *   (× escala ÷ 1000). A escala vem do atributo data-escala do grupo data-bloco (js/arqdiagrama.js); folha sem blocos (série antiga, interiores)
 *   usa a escala da folha quando é uma só ("1:50"); escalas misturadas ou "SEM ESCALA" ficam no paperspace, em mm de papel.
 * PENAS (nunca true color nas linhas): cada par (cor, espessura) do desenho vira UMA PENA = UMA COR ACI. A camada leva essa ACI e o lineweight (370,
 *   centésimos de mm); o CTB dá a essa ACI a espessura (índice da tabela de lineweights do CTB) e a cor de SAÍDA exata (marsala 155/38/38, vermelho
 *   do forro 223/0/0…). Linha preta: ACI 1–6, 8 e 9 pela espessura (mesma convenção do padrão RA: 1 = 0,13 · 2 = 0,18 · 3 = 0,25 · 4 = 0,35 · 5 = 0,50 ·
 *   6 = 0,70), plotando preta; texto e preenchimento preto = ACI 7. ACI 250–255 NUNCA em linha (somem no fundo escuro ou no claro): só em preenchimento.
 *   ESPESSURA: 0,45 não existe na tabela de lineweights do DXF; sobe para 0,50 (empate arredonda para cima).
 *   TELA: o HEADER grava LWDISPLAY = 0 (a espessura não engrossa a linha na tela); ela vale no CTB e, de reserva, na camada.
 * CTB: texto do plot style + zlib. Não há deflate no app: o zlib sai em blocos STORED (válido, sem compressão; ~85 KB). Cabeçalho PIAFILE:
 *   48 bytes ASCII + adler32 do bloco zlib + tamanho do texto + tamanho do zlib (todos uint32 LE), conferido contra um CTB real do AutoCAD.
 *   Descrição só em ASCII; lineweight = ÍNDICE da tabela custom_lineweight_table do próprio arquivo.
 * DWG: o app instalado converte este DXF com o dxf2dwg do LibreDWG 0.14 (processo separado, GPLv3; server/dwg.js, rota /__dwg/gerar) e entrega ZIP com
 *   DWG + CTB + LEIA-ME (ArqCad.zipDwg). Sem o app (navegador puro/PWA) a opção fica indisponível e o DXF abre no AutoCAD (Salvar como → DWG).
 *   Para o DWG NÃO PERDER nada no caminho (provado por tools/test-arqcad-dwg.js, ida e volta dxf2dwg → dwg2dxf):
 *   (a) as VIEWPORTs do layout vêm logo depois da principal (js/bimdxf.js) — o LibreDWG perdia as do fim de um layout grande;
 *   (b) quadros/rótulos do MODEL e as molduras das viewports ficam na camada DEFPOINTS (o CAD nunca plota), sem depender do flag "não plotar" da camada,
 *       que o LibreDWG não grava;
 *   (c) lineweight de camada nunca é 0 (vira "padrão" = 0,25 mm no DWG): texto e preenchimento levam 13 (0,13 mm) — quem manda no plot é o CTB;
 *   (d) nenhuma pena usa as ACI 10, 50, 90, 130, 170, 210 e 255 (mesma cor RGB das ACI 1–7): no DWG R2007+ elas voltam como 1–7 e o CTB erraria a pena.
 * Teste: node tools/test-arqcad.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function X() { return dep("BimDxf", "./bimdxf.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function txt(v) { return v == null ? "" : String(v); }

  /* ---------------------------------------------------------------- paleta ACI (256 × RRGGBB; 250–255 = a faixa de cinzas do AutoCAD) */
  var ACI = "000000ff0000ffff0000ff0000ffff0000ffff00ffffffff808080c0c0c0ff0000ff7f7fa50000a552527f00007f3f3f4c00004c2626260000261313ff3f00ff9f7fa52900a567527f1f007f4f3f4c13004c2f26260900261713ff7f00ffbf7fa55200a57c527f3f007f5f3f4c26004c3926261300261c13ffbf00ffdf7fa57c00a591527f5f007f6f3f4c39004c4226261c00262113ffff00ffff7fa5a500a5a5527f7f007f7f3f4c4c004c4c26262600262613bfff00dfff7f7ca50091a5525f7f006f7f3f394c00424c261c26002126137fff00bfff7f52a5007ca5523f7f005f7f3f264c00394c261326001c26133fff009fff7f29a50067a5521f7f004f7f3f134c002f4c2609260017261300ff007fff7f00a50052a552007f003f7f3f004c00264c2600260013261300ff3f7fff9f00a52952a567007f1f3f7f4f004c13264c2f00260913581700ff7f7fffbf00a55252a57c007f3f3f7f5f004c26264c3900261313581c00ffbf7fffdf00a57c52a591007f5f3f7f6f004c39264c4200261c13585800ffff7fffff00a5a552a5a5007f7f3f7f7f004c4c264c4c00262613585800bfff7fdfff007ca55291a5005f7f3f6f7f00394c26427e001c26135858007fff7fbfff0052a5527ca5003f7f3f5f7f00264c26397e001326131c58003fff7f9fff0029a55267a5001f7f3f4f7f00134c262f7e0009261317580000ff7f7fff0000a55252a500007f3f3f7f00004c26267e0000261313583f00ff9f7fff2900a56752a51f007f4f3f7f13004c2f267e0900261713587f00ffbf7fff5200a57c52a53f007f5f3f7f26004c39267e1300261c1358bf00ffdf7fff7c00a59152a55f007f6f3f7f39004c42264c1c0026581358ff00ffff7fffa500a5a552a57f007f7f3f7f4c004c4c264c260026581358ff00bfff7fdfa5007ca552917f005f7f3f6f4c00394c264226001c581358ff007fff7fbfa50052a5527c7f003f7f3f5f4c00264c263926001358131cff003fff7f9fa50029a552677f001f7f3f4f4c00134c262f260009581317333333505050696969828282bebebeffffff";
  function aciRgb(i) { var h = ACI.substr(i * 6, 6); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function hexRgb(h) {
    var s = txt(h).trim().toLowerCase(), m;
    if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s))) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    if ((m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s))) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    if (s === "black") return [0, 0, 0];
    return null;
  }
  function rgbHex(c) { return [0, 1, 2].map(function (i) { var h = c[i].toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }
  function ehBranco(h) { var s = txt(h).trim().toLowerCase(); return s === "#fff" || s === "#ffffff" || s === "white"; }

  var LIBREDWG_VERSAO = "0.14", LIBREDWG_FONTE = "https://ftp.gnu.org/gnu/libredwg/libredwg-0.14.tar.xz";

  /* ---------------------------------------------------------------- espessuras */
  var LW_DXF = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];   /* o que o grupo 370 aceita (centésimos de mm) */
  var LW_CTB = [0, 0.05, 0.09, 0.10, 0.13, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.53, 0.60, 0.65, 0.70, 0.80, 0.90, 1.00, 1.06, 1.20, 1.40, 1.58, 2.00, 2.11];
  function lwSnap(mm) {   /* mm → centésimos válidos no DXF (empate sobe) */
    var c = Math.round((+mm || 0) * 100), m = LW_DXF[0];
    LW_DXF.forEach(function (v) { var dv = Math.abs(v - c), dm = Math.abs(m - c); if (dv < dm || (dv === dm && v > m)) m = v; });
    return m;
  }
  function ctbIndice(cent) { for (var i = 0; i < LW_CTB.length; i++) if (Math.round(LW_CTB[i] * 100) === cent) return i; return 0; }

  /* ---------------------------------------------------------------- CTB */
  function ascii(s) {
    var t = txt(s); if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t.replace(/[\r\n]+/g, " ").replace(/"/g, "'").replace(/[^\x20-\x7e]/g, "?");
  }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  /* pens: [{ aci (1..255), rgb: [r,g,b], lw (centésimos) }]; o resto: preto, espessura do objeto */
  function ctbTexto(pens, descricao) {
    var por = {}; (pens || []).forEach(function (p) { por[p.aci] = p; });
    var L = ['description="' + ascii(descricao), "aci_table_available=TRUE", "scale_factor=1.0", "apply_factor=FALSE", "custom_lineweight_display_units=0", "aci_table{"], i;
    for (i = 0; i < 255; i++) L.push(" " + i + '="Color_' + (i + 1));
    L.push("}"); L.push("plot_style{");
    for (i = 0; i < 255; i++) {
      var p = por[i + 1], c = p ? p.rgb : [0, 0, 0], cor = ((0xC3 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]) | 0;
      L.push(" " + i + "{", '  name="Color_' + (i + 1), '  localized_name="Color_' + (i + 1), '  description="', "  color=" + cor, "  mode_color=" + cor, "  color_policy=5",
        "  physical_pen_number=0", "  virtual_pen_number=0", "  screen=100", "  linepattern_size=0.5", "  linetype=31", "  adaptive_linetype=TRUE",
        "  lineweight=" + (p ? ctbIndice(p.lw) : 0), "  fill_style=73", "  end_style=4", "  join_style=5", " }");
    }
    L.push("}"); L.push("custom_lineweight_table{");
    LW_CTB.forEach(function (v, k) { L.push(" " + k + "=" + f2(v)); });
    L.push("}");
    return L.join("\n") + "\n\u0000";
  }
  function adler32(b) { var a = 1, c = 0, i; for (i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; c = (c + a) % 65521; } return ((c << 16) | a) >>> 0; }
  function zlibStored(b) {   /* zlib válido sem compressão: cabeçalho 78 01, blocos stored de até 65535 bytes, adler32 (big-endian) */
    var n = b.length, nb = Math.max(1, Math.ceil(n / 65535)), out = new Uint8Array(2 + n + nb * 5 + 4), p = 0, i, k;
    out[p++] = 0x78; out[p++] = 0x01;
    for (k = 0; k < nb; k++) {
      var ini = k * 65535, len = Math.min(65535, n - ini);
      out[p++] = k === nb - 1 ? 1 : 0; out[p++] = len & 255; out[p++] = len >> 8; out[p++] = (~len) & 255; out[p++] = ((~len) >> 8) & 255;
      for (i = 0; i < len; i++) out[p++] = b[ini + i];
    }
    var ad = adler32(b); out[p++] = (ad >>> 24) & 255; out[p++] = (ad >>> 16) & 255; out[p++] = (ad >>> 8) & 255; out[p++] = ad & 255;
    return out;
  }
  var CTB_CABECALHO = "PIAFILEVERSION_2.0,CTBVER1,compress\r\npmzlibcodec";
  function ctbBytes(texto) {
    var b = new Uint8Array(texto.length), i; for (i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i) & 255;
    var z = zlibStored(b), cab = CTB_CABECALHO.length, out = new Uint8Array(cab + 12 + z.length);
    for (i = 0; i < cab; i++) out[i] = CTB_CABECALHO.charCodeAt(i);
    function u32(p, v) { out[p] = v & 255; out[p + 1] = (v >>> 8) & 255; out[p + 2] = (v >>> 16) & 255; out[p + 3] = (v >>> 24) & 255; }
    u32(cab, adler32(z)); u32(cab + 4, b.length); u32(cab + 8, z.length);
    out.set(z, cab + 12);
    return out;
  }
  /* lê o TEXTO de um plot style (já descomprimido) → { descricao, lineweights, estilos: [{ aci, cor (int32), lw (índice), lwMm }] } */
  function ctbParse(texto) {
    var s = txt(texto), o = { descricao: "", lineweights: [], estilos: [] }, m = /^description="([^\n]*)/.exec(s);
    if (m) o.descricao = m[1];
    var ps = s.indexOf("plot_style{"), ce = s.indexOf("custom_lineweight_table{");
    var tab = s.slice(ce).split("\n"), i;
    for (i = 1; i < tab.length; i++) { var q = /^ (\d+)=([\d.]+)$/.exec(tab[i]); if (q) o.lineweights[+q[1]] = parseFloat(q[2]); }
    var re = / (\d+)\{\n  name="Color_(\d+)\n[\s\S]*?  color=(-?\d+)\n[\s\S]*?  lineweight=(\d+)\n/g, mm;
    var corpo = s.slice(ps, ce);
    while ((mm = re.exec(corpo))) o.estilos.push({ aci: +mm[2], cor: +mm[3], lw: +mm[4], lwMm: o.lineweights[+mm[4]] });
    return o;
  }

  /* ---------------------------------------------------------------- papel */
  var FORMATOS = [["A0", 1189, 841], ["A1", 841, 594], ["A2", 594, 420], ["A3", 420, 297], ["A4", 297, 210]];
  function papelNome(w, h) {   /* o nome canônico do AutoCAD para a impressora DWG To PDF.pc3 */
    for (var i = 0; i < FORMATOS.length; i++) {
      var f = FORMATOS[i];
      if ((Math.abs(w - f[1]) < 1.5 && Math.abs(h - f[2]) < 1.5) || (Math.abs(w - f[2]) < 1.5 && Math.abs(h - f[1]) < 1.5)) {
        var a = w >= h ? Math.max(f[1], f[2]) : Math.min(f[1], f[2]), b = w >= h ? Math.min(f[1], f[2]) : Math.max(f[1], f[2]);
        return "ISO_full_bleed_" + f[0] + "_(" + a.toFixed(2) + "_x_" + b.toFixed(2) + "_MM)";
      }
    }
    return "RA_" + Math.round(w) + "_x_" + Math.round(h) + "_MM";
  }

  /* ---------------------------------------------------------------- SVG → primitivas */
  function atributos(s) { var o = {}, re = /([\w:-]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function desesc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"); }
  function largTexto(s, fs) { var a = AP(); return a && a.largTexto ? a.largTexto(s, fs) : 0.6 * fs * s.length; }
  function lerSvg(svg) {
    var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) || [], W = +vb[1] || 0, H = +vb[2] || 0;
    var re = /<(\/?)(g|line|polygon|polyline|rect|circle|text)\b([^>]*?)(\/?)>([^<]*)/g, m, pilha = [{ tx: 0, ty: 0, area: null, carimbo: false, bloco: null }], prims = [], blocos = [];
    while ((m = re.exec(svg))) {
      var fecha = m[1] === "/", tag = m[2], at = fecha ? {} : atributos(m[3]), auto = m[4] === "/", top = pilha[pilha.length - 1];
      if (tag === "g") {
        if (fecha) { if (pilha.length > 1) pilha.pop(); continue; }
        var n = { tx: top.tx, ty: top.ty, area: top.area, carimbo: top.carimbo, bloco: top.bloco };
        var tr = /translate\(\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*\)/.exec(at.transform || ""); if (tr) { n.tx += +tr[1]; n.ty += +tr[2]; }
        if (at["data-corpo"]) n.area = "corpo";
        if (at["data-folha-moldura"]) n.area = "moldura";
        if (at["data-carimbo"]) n.carimbo = true;
        if (at["data-bloco"] != null) {
          var em = /^1:(\d+)$/.exec(txt(at["data-escala"]));
          var b = { id: at["data-bloco"], esc: em ? +em[1] : 0, x: +at["data-x"], y: +at["data-y"], w: +at["data-w"], h: +at["data-h"], prims: [] };
          blocos.push(b); n.bloco = b;
        }
        if (!auto) pilha.push(n);
        continue;
      }
      if (fecha) continue;
      var p = { tag: tag, a: at, s: tag === "text" ? m[5] : "", tx: top.tx, ty: top.ty, area: top.area, carimbo: top.carimbo, bloco: top.bloco };
      var fill = at.fill, st = at.stroke;
      if (tag !== "text" && (!st || st === "none") && (!fill || fill === "none" || ehBranco(fill))) continue;   /* fundo branco, apagador e o que não deixa tinta */
      if (tag === "text" && !desesc(p.s).trim()) continue;
      prims.push(p); if (p.bloco) p.bloco.prims.push(p);
    }
    return { W: W, H: H, prims: prims, blocos: blocos };
  }
  function nums(s) { return txt(s).trim().split(/[\s,]+/).filter(Boolean).map(Number); }
  function bboxPrim(p) {   /* em coordenadas do SVG (y para baixo), com a translação do grupo */
    var a = p.a, x0, y0, x1, y1, i, v;
    if (p.tag === "line") { x0 = Math.min(+a.x1, +a.x2); x1 = Math.max(+a.x1, +a.x2); y0 = Math.min(+a.y1, +a.y2); y1 = Math.max(+a.y1, +a.y2); }
    else if (p.tag === "polygon" || p.tag === "polyline") { v = nums(a.points); x0 = y0 = Infinity; x1 = y1 = -Infinity; for (i = 0; i + 1 < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); } }
    else if (p.tag === "rect") { x0 = +a.x; y0 = +a.y; x1 = x0 + (+a.width); y1 = y0 + (+a.height); }
    else if (p.tag === "circle") { x0 = +a.cx - (+a.r); x1 = +a.cx + (+a.r); y0 = +a.cy - (+a.r); y1 = +a.cy + (+a.r); }
    else {
      var s = desesc(p.s), fs = +a["font-size"] || 2.5, w = largTexto(s, fs), x = +a.x, y = +a.y, an = a["text-anchor"];
      var xa = an === "end" ? x - w : an === "middle" ? x - w / 2 : x;
      if (/rotate/.test(a.transform || "")) { x0 = x - w; x1 = x + w; y0 = y - w; y1 = y + w; } else { x0 = xa; x1 = xa + w; y0 = y - fs * 0.75; y1 = y + fs * 0.25; }
    }
    if (!isFinite(x0 + x1 + y0 + y1)) return null;
    return [x0 + p.tx, y0 + p.ty, x1 + p.tx, y1 + p.ty];
  }
  function uniao(bb, b) { if (!b) return bb; if (!bb) return b.slice(); return [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }

  /* ---------------------------------------------------------------- A CONVERSÃO */
  var PRETA_ACI = { 5: 8, 9: 9, 13: 1, 18: 2, 25: 3, 35: 4, 50: 5, 70: 6 };   /* espessura (centésimos) → ACI da linha preta (1–6 = o padrão RA) */
  /* ACIs que o DWG (R2007+, via LibreDWG) devolve como a ACI 1–7 de mesma cor RGB (10→1, 50→2, 90→3, 130→4, 170→5, 210→6, 255→7): nunca viram pena, senão o CTB erra a pena depois do DWG */
  var ACI_GEMEA = { 10: 1, 50: 1, 90: 1, 130: 1, 170: 1, 210: 1, 255: 1 };
  var POOL_PRETA = [30, 40, 60, 70, 80, 100, 110, 120, 140, 150, 160, 180, 190, 200, 220, 230, 240, 20, 25, 35, 45, 55];
  var RESERVADAS = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 };
  var GAP = 5, GAP_LINHA = 14;   /* metros entre desenhos do MODEL, na linha e entre linhas */

  function paraCad(r, opcoes) {
    var op = opcoes || {}, B = X(), E = ES();
    if (!B || !r || !r.ok || !r.folhas || !r.folhas.length) return null;
    var doc = B.novoDoc({ unidade: "m" }), avisos = [], ctbNome = txt(op.ctbNome) || "RA_Arquitetura.ctb", dxfNome = txt(op.dxfNome) || "ARQ_CAD.dxf";
    doc.escala = 1;
    var HT = E && E.ALTURA_MAIUSCULA ? E.ALTURA_MAIUSCULA : 0.727;
    var pens = [], penPor = {}, usada = {};
    function nearest(c, fundo) {
      var best = 0, bd = Infinity, i;
      for (i = 10; i <= 255; i++) {
        if (usada[i] || RESERVADAS[i] || ACI_GEMEA[i]) continue;
        if (i >= 250 && !(fundo && i >= 252)) continue;   /* 250–255: nunca em linha; em preenchimento só os claros */
        var q = aciRgb(i), d = 2 * Math.pow(q[0] - c[0], 2) + 4 * Math.pow(q[1] - c[1], 2) + 3 * Math.pow(q[2] - c[2], 2);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function pen(rgb, lw, fundo) {   /* lw em centésimos de mm; 0 = sem espessura (texto, preenchimento) */
      var preto = rgb[0] <= 40 && rgb[1] <= 40 && rgb[2] <= 40, key = (preto ? "K" : rgbHex(rgb)) + "|" + lw;
      if (penPor[key]) return penPor[key];
      var aci, saida = preto ? [0, 0, 0] : rgb;
      if (preto) {
        if (lw === 0) aci = 7;
        else if (PRETA_ACI[lw]) aci = PRETA_ACI[lw];
        else { var k = 0; while (k < POOL_PRETA.length && usada[POOL_PRETA[k]]) k++; aci = k < POOL_PRETA.length ? POOL_PRETA[k] : nearest(rgb, false); }
      } else aci = nearest(rgb, !!fundo);
      var p = { aci: aci, rgb: saida, lw: lw, key: key }; usada[aci] = 1; penPor[key] = p; pens.push(p);
      return p;
    }
    var nomesPor = {}, basesUsadas = {};   /* base|aci → nome da camada */
    function camada(base, p, noplot) {
      var k = base + "|" + p.aci;
      if (nomesPor[k]) return nomesPor[k];
      var nome = basesUsadas[base] ? base + "-A" + p.aci : base;
      basesUsadas[base] = 1;
      doc.camada(nome, 0.18, null, p.aci);
      var c = doc.camadas[doc.camada(nome)]; c.lw = p.lw || 13; c.cor = p.aci;   /* lineweight 0 vira "padrão" (0,25 mm) ao passar pelo LibreDWG: texto e cheio levam 0,13 explícito (o CTB é quem manda no plot) */ if (noplot) c.noplot = true;
      nomesPor[k] = c.nome; return c.nome;
    }
    function dash(a) {
      var v = nums(a["stroke-dasharray"]).filter(function (q) { return isFinite(q); });
      if (!v.length) return null;
      if (v.length % 2) v = v.concat(v);
      var nome = "TR_" + v.map(function (q) { return String(Math.round(q * 100) / 100).replace(".", "p"); }).join("_");
      doc.ltype(nome, v.map(function (q, i) { return i % 2 ? -q : q; }));
      return nome;
    }

    var folhas = r.folhas.map(function (f) {
      var s = lerSvg(f.svg), corpo = s.prims.filter(function (p) { return p.area === "corpo"; });
      var blocos = s.blocos.slice();
      if (!blocos.length && corpo.length) {   /* série antiga / interiores: uma folha = um desenho, na escala da folha quando é uma só */
        var em = /^1:(\d+)$/.exec(txt(f.escala).trim());
        if (em) { var b0 = { id: f.numero, esc: +em[1], x: 0, y: 0, w: s.W, h: s.H, prims: corpo }; corpo.forEach(function (p) { p.bloco = b0; }); blocos.push(b0); }
        else avisos.push(f.numero + ": escala da folha \"" + txt(f.escala) + "\" não é uma só; o desenho ficou no layout, em mm de papel.");
      }
      blocos.forEach(function (b) { b.bb = null; if (b.esc) b.prims.forEach(function (p) { b.bb = uniao(b.bb, bboxPrim(p)); }); });
      return { f: f, W: s.W, H: s.H, prims: s.prims, blocos: blocos };
    });

    /* ---- o MODEL: uma linha por folha, desenhos lado a lado com GAP metros; entre linhas GAP_LINHA */
    /* quadros, rótulos e molduras das viewports vão na camada DEFPOINTS: o CAD nunca plota essa camada, então nada depende do flag "não plotar" (o LibreDWG o perde ao gravar o DWG) */
    var cQuadro = camada("DEFPOINTS", pen([120, 120, 255], 13), true), cRot = cQuadro;
    var rowTop = 0, resumo = { layouts: [], quadros: [] };
    folhas.forEach(function (F) {
      var mods = F.blocos.filter(function (b) { return b.esc && b.bb; }).sort(function (a, b) { return Math.abs(a.y - b.y) < 20 ? a.x - b.x : a.y - b.y; });
      F.mods = mods;
      if (!mods.length) return;
      var xc = 0, maxH = 0;
      mods.forEach(function (b) {
        var k = b.esc / 1000, bb = [b.bb[0] - 0.5, b.bb[1] - 0.5, b.bb[2] + 0.5, b.bb[3] + 0.5], Mw = (bb[2] - bb[0]) * k, Mh = (bb[3] - bb[1]) * k;
        b.k = k; b.bb = bb; b.ox = xc; b.oy = rowTop - Mh; b.Mw = Mw; b.Mh = Mh;
        xc += Mw + GAP; if (Mh > maxH) maxH = Mh;
      });
      doc.texto(cRot, 0, rowTop + 6, 1.2, F.f.numero + " - " + txt(F.f.titulo) + " (" + F.f.formato + ", " + txt(F.f.escala) + ")", 0, false);
      mods.forEach(function (b) {
        var pad = 0.5;
        doc.poli(cQuadro, [[b.ox - pad, b.oy - pad], [b.ox + b.Mw + pad, b.oy - pad], [b.ox + b.Mw + pad, b.oy + b.Mh + pad], [b.ox - pad, b.oy + b.Mh + pad]], true);
        doc.texto(cRot, b.ox, b.oy + b.Mh + pad + 0.3, Math.max(0.3, 4 * b.k), F.f.numero + " | " + b.id + " | 1:" + b.esc, 0, false);
        resumo.quadros.push({ folha: F.f.numero, id: b.id, esc: b.esc, x0: b.ox - pad, y0: b.oy - pad, x1: b.ox + b.Mw + pad, y1: b.oy + b.Mh + pad });
      });
      rowTop -= maxH + GAP_LINHA;
    });

    /* ---- as primitivas viram entidades (no MODEL ou no layout) */
    function emitir(p, sp) {
      var a = p.a, cam = a["data-cam"] || "", rgbS = hexRgb(a.stroke) || [0, 0, 0], tem = a.stroke && a.stroke !== "none";
      var mmS = parseFloat(a["stroke-width"]) || 0.18, lwS = lwSnap(mmS) || 5, fillOk = a.fill && a.fill !== "none" && !ehBranco(a.fill) && hexRgb(a.fill);
      function ent(e, lt) { if (e && lt) { e.lt = lt; if (sp.lts) e.lts = sp.lts; } return e; }
      function P(x, y) { return sp.pt(x + p.tx, y + p.ty); }
      if (p.tag === "text") {
        var s = desesc(p.s).trim(), fs = +a["font-size"] || 2.5, c = hexRgb(a.fill) || [0, 0, 0];
        var pt = P(+a.x, +a.y), rt = /rotate\(([-\d.eE]+)/.exec(a.transform || ""), an = a["text-anchor"];
        var base = p.carimbo ? (/^#4/i.test(a.fill || "") ? "RA-CARIMBO-ROTULO" : "RA-CARIMBO-TEXTO") : (p.area === "moldura" ? "FOLHA-TEXTO" : "ARQ-TEXTO");
        if (!p.carimbo && c[0] > 150 && c[1] < 60 && c[2] < 60) base += "-PEND";
        var lay = camada(base, pen(c, 0));
        var e = doc.texto(lay, pt[0], pt[1], fs * HT * sp.s, s, rt ? -(+rt[1]) : 0, an === "middle");
        if (e) { if (an === "end") { e.direita = true; e.centro = false; } e.est = p.carimbo ? "RA-ARIAL" : "RA-VERDANA"; }
        return;
      }
      var pts = null, i;
      if (p.tag === "polygon" || p.tag === "polyline") { var v = nums(a.points); pts = []; for (i = 0; i + 1 < v.length; i += 2) pts.push(P(v[i], v[i + 1])); }
      else if (p.tag === "rect") { var x = +a.x, y = +a.y, w = +a.width, h = +a.height; pts = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)]; }
      else if (p.tag === "circle" && fillOk && !tem) { var cx = +a.cx, cy = +a.cy, rr = +a.r; pts = []; for (i = 0; i < 16; i++) pts.push(P(cx + rr * Math.cos(i * Math.PI / 8), cy + rr * Math.sin(i * Math.PI / 8))); }
      var baseS = cam || (p.area === "moldura" ? "FOLHA-LINHA" : "ARQ-SIMBOLO");
      if (p.carimbo) baseS = lwS >= 45 ? "RA-CARIMBO-MOLDURA" : "RA-CARIMBO-LINHA";
      if (fillOk && pts && pts.length >= 3) doc.hachura(camada((p.carimbo ? "RA-CARIMBO-FUNDO" : (cam || "ARQ-FUNDO")) + "-CHEIO", pen(fillOk, 0, true)), [pts], 1, true);
      if (!tem) return;
      var layS = camada(baseS, pen(rgbS, lwS)), lt = dash(a);
      if (p.tag === "line") { var q1 = P(+a.x1, +a.y1), q2 = P(+a.x2, +a.y2); ent(doc.linha(layS, q1[0], q1[1], q2[0], q2[1]), lt); }
      else if (p.tag === "circle") { var qc = P(+a.cx, +a.cy); ent(doc.circulo(layS, qc[0], qc[1], (+a.r) * sp.s), lt); }
      else if (pts) ent(doc.poli(layS, pts, p.tag !== "polyline"), lt);
    }

    folhas.forEach(function (F) {
      var f = F.f, pap = papelNome(F.W, F.H), L = doc.layout(f.numero, F.W, F.H, { papel: pap, ctb: ctbNome, camadaVp: "DEFPOINTS" });
      var info = { nome: f.numero, w: F.W, h: F.H, papel: pap, viewports: [], formato: f.formato };
      F.prims.forEach(function (p) {
        var b = p.bloco;
        if (b && b.esc && b.bb) {   /* MODEL, escala real */
          emitir(p, { pt: function (x, y) { return [b.ox + (x - b.bb[0]) * b.k, b.oy + (b.bb[3] - y) * b.k]; }, s: b.k, lts: b.k });
        } else {
          doc.paper(L, function () { emitir(p, { pt: function (x, y) { return [x, F.H - y]; }, s: 1, lts: 0 }); });
        }
      });
      F.mods.forEach(function (b) {
        var x0 = Math.max(0, b.bb[0]), y0 = Math.max(0, b.bb[1]), x1 = Math.min(F.W, b.bb[2]), y1 = Math.min(F.H, b.bb[3]);
        if (x1 - x0 < 1 || y1 - y0 < 1) return;
        var mx = b.ox + ((x0 + x1) / 2 - b.bb[0]) * b.k, my = b.oy + (b.bb[3] - (y0 + y1) / 2) * b.k, hv = y1 - y0;
        var v = doc.viewport(L, (x0 + x1) / 2, F.H - (y0 + y1) / 2, x1 - x0, hv, mx, my, hv * b.k, { travada: true });
        v.id = info.viewports.length + 2;
        info.viewports.push({ bloco: b.id, escala: b.esc, w: x1 - x0, h: hv, altura: hv * b.k, mx: mx, my: my });
      });
      resumo.layouts.push(info);
    });

    pens.sort(function (a, b) { return a.aci - b.aci; });
    var texto = B.escrever(doc);
    /* o caminho do DWG: texto alinhado à esquerda e $FILLMODE 1; a hachura segue HATCH nativa (opcoes.hachuraGeometria liga a conversão para SOLID/LINE) */
    var textoDwg = B.paraDwg ? B.escrever(B.paraDwg(doc, { hachuraGeometria: !!op.hachuraGeometria })) : texto;
    var desc = "RA Engenharia - pranchas de arquitetura: cor ACI = pena (espessura e cor de saida). Preto = ACI 1-6, 8 e 9 pela espessura; 7 = texto e cheio preto.";
    var ctb = ctbBytes(ctbTexto(pens, desc));
    var out = { dxf: texto, dxfDwg: textoDwg, ctb: ctb, ctbNome: ctbNome, dxfNome: dxfNome, dwgNome: txt(op.dwgNome), pens: pens, resumo: resumo, avisos: avisos, doc: doc };
    out.leiame = leiame(out);
    return out;
  }

  function leiame(o) {
    var L = [], dwg = !!o.dwgNome;
    L.push(dwg ? "PRANCHAS DE ARQUITETURA - ARQUIVO CAD UNICO (DWG)" : "PRANCHAS DE ARQUITETURA - ARQUIVO CAD UNICO");
    L.push("");
    if (dwg) {
      L.push("Este pacote traz o DWG pronto. O OrcaPRO monta o DXF e converte com o dxf2dwg do LibreDWG " + LIBREDWG_VERSAO + " (programa separado, software livre GNU GPLv3).");
      L.push("Codigo-fonte desse programa: " + LIBREDWG_FONTE);
      L.push("O DWG e R2000 (AC1015), nao foi gravado pelo AutoCAD: ao abrir, rode AUDIT e confira os layouts.");
    } else L.push("Para ter DWG: abra o DXF no AutoCAD e use Salvar como -> DWG.");
    L.push("");
    L.push("Arquivos");
    if (dwg) L.push("  " + o.dwgNome + "  DWG R2000 (AC1015): MODEL em escala real (metros) e um layout por folha.");
    else L.push("  " + o.dxfNome + "  DXF R2010 (AC1024): MODEL em escala real (metros) e um layout por folha.");
    L.push("  " + o.ctbNome + "  plot style (CTB) com as penas. O AutoCAD NAO le o CTB que esta ao lado do desenho: instale como abaixo (senao o layout mostra \"" + o.ctbNome + " (missing)\").");
    L.push("");
    L.push("O que tem dentro");
    L.push("  - MODEL: cada desenho em escala 1:1 (unidade = metro), lado a lado, cada um dentro de um quadro (camada DEFPOINTS, que o CAD nunca plota).");
    L.push("  - " + o.resumo.layouts.length + " layout(s), um por folha, com o codigo da folha no nome: " + o.resumo.layouts.map(function (l) { return l.nome + " (" + l.papel.replace(/^ISO_full_bleed_/, "").replace(/_/g, " ") + ")"; }).join("; ") + ".");
    L.push("  - Cada desenho aparece por uma viewport TRAVADA na escala dele; nao de zoom dentro dela (se destravar, a escala se perde).");
    L.push("  - Moldura, carimbo RA, coluna de notas e tabelas estao no layout, em mm de papel.");
    L.push("");
    L.push("COMO INSTALAR AS PENAS (o CTB) NO AUTOCAD");
    L.push("  - Copie o " + o.ctbNome + " para %APPDATA%\\Autodesk\\AutoCAD <ano>\\<Rxx.x>\\<idioma>\\Plotters\\Plot Styles");
    L.push("    (ou digite STYLESMANAGER no AutoCAD e cole o arquivo na pasta que abrir). Depois feche e abra o DWG de novo.");
    L.push("  - No OrcaPRO instalado: tela de pranchas > botao \"Instalar penas RA no AutoCAD\" faz isso em todas as versoes do AutoCAD deste computador.");
    L.push("");
    L.push("Para plotar");
    L.push("  1. Com o " + o.ctbNome + " ja instalado como acima, Cada layout ja vem com: impressora DWG To PDF.pc3, papel ISO full bleed do formato, mm, escala 1:1, area = layout, estilo = " + o.ctbNome + ".");
    L.push("  2. Abra o layout da folha e mande plotar.");
    L.push("");
    L.push("Penas: cada cor ACI e uma pena. O CTB da a cada ACI a espessura e a cor de saida. A espessura tambem esta na camada (lineweight) como reserva;");
    L.push("a tela abre com LWDISPLAY = 0 (linhas finas na tela). Sem o CTB, a espessura da camada vale; a cor sai a da ACI.");
    L.push("");
    L.push("Tabela de penas (ACI | espessura mm | cor de saida RGB)");
    o.pens.forEach(function (p) { L.push("  " + p.aci + " | " + (p.lw / 100).toFixed(2) + " | " + p.rgb.join("/")); });
    L.push("");
    L.push(dwg ? "Limites: espessura 0,45 sobe para 0,50 (nao existe na tabela de espessuras do DWG)." : "Limites: o DWG so sai no app instalado (o DXF abre no AutoCAD). Espessura 0,45 sobe para 0,50 (nao existe no DXF).");
    if (o.avisos.length) { L.push(""); L.push("Avisos"); o.avisos.forEach(function (a) { L.push("  - " + a); }); }
    return L.join("\r\n") + "\r\n";
  }

  /* ZIP do DWG: o DWG (bytes que voltaram do dxf2dwg) + o CTB + o LEIA-ME do DWG. `o` = ArqCad.paraCad(r, { dwgNome: ... }) */
  function zipDwg(o, dwgBytes) {
    var Z = dep("BimBcf", "./bimbcf.js"); if (!o || !o.dwgNome || !dwgBytes || !Z || !Z.zipEscrever) return null;
    var arq = {}; arq[o.dwgNome] = dwgBytes; arq[o.ctbNome] = o.ctb; arq["LEIA-ME.txt"] = o.leiame;
    return Z.zipEscrever(arq);
  }
  function zip(r, opcoes) {
    var o = paraCad(r, opcoes), Z = dep("BimBcf", "./bimbcf.js"); if (!o || !Z || !Z.zipEscrever) return null;
    var arq = {}; arq[o.dxfNome] = o.dxf; arq[o.ctbNome] = o.ctb; arq["LEIA-ME.txt"] = o.leiame;
    return Z.zipEscrever(arq);
  }

  var ArqCad = { VERSAO: 2, paraCad: paraCad, zip: zip, zipDwg: zipDwg, LIBREDWG_VERSAO: LIBREDWG_VERSAO, LIBREDWG_FONTE: LIBREDWG_FONTE, ctbTexto: ctbTexto, ctbBytes: ctbBytes, ctbParse: ctbParse, lwSnap: lwSnap, LW_CTB: LW_CTB, LW_DXF: LW_DXF, aciRgb: aciRgb, papelNome: papelNome, PRETA_ACI: PRETA_ACI, ACI_GEMEA: ACI_GEMEA, CTB_CABECALHO: CTB_CABECALHO, _lerSvg: lerSvg, _adler32: adler32 };
  global.ArqCad = ArqCad;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqCad;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimdxf.js — DXF DA VISTA E DA FOLHA (P8, frente C; 09/10/2026)
 *
 * Motor PURO (ES5, Node-testável, sem DOM): monta um DXF ASCII R2000
 * (AC1015) a partir do MESMO desenho vetorial que a tela e a prancha usam
 * (js/desenho2d.js), sem foto e sem conversor:
 *   daVista(dados, estilo, opts) → planta/corte 1:1 em METROS ($INSUNITS 6),
 *       camada por CATEGORIA (a do IFC da peça: ARQ-PAREDE-CORTE,
 *       ARQ-PAREDE-VISTA, EST-PILAR-CORTE…), espessura pela PENA (grupo 370
 *       da camada, como o pos_dwg_ra.py faz no CYPE), cota como DIMENSION de
 *       verdade (o AutoCAD mede de novo e dá o mesmo número do modelo);
 *   daFolha(prancha, folha, geo, vps, opts) → a FOLHA em MILÍMETROS de
 *       papel (A1 = 841 × 594), moldura, carimbo completo (os mesmos
 *       parâmetros da folha da tela) e cada viewport escalado para o papel;
 *   escrever(doc) → o texto do DXF.
 *
 * Por que R2000 e não R12: espessura de linha por camada (370) só existe a
 * partir do R2000 — e a regra da RA é a espessura pela pena (NBR 8403:
 * 0,13 · 0,18 · 0,25 · 0,35 · 0,50 · 0,70 mm), não a cor.
 * A COR da camada segue a espessura (convenção de CAD: 0,13 cinza … 0,70
 * vermelho), para quem plota por CTB também sair certo.
 *
 * ⚠ Texto com acento vai como \U+XXXX (o DXF R2000 é ANSI_1252 e o
 *   AutoCAD lê o \U+ em qualquer página de código).
 * ⚠ Y do desenho 2D cresce para BAIXO (tela); no DXF cresce para CIMA.
 * Teste: node tools/test-bimdxf.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* NBR 8403 — as mesmas penas do papel da prancha (js/prancha.js PENAS_PAPEL;
     o teste confere que as duas tabelas são iguais) */
  var PENAS_PADRAO = {
    fina:   { corte: 0.35, vista: 0.13, cota: 0.13, marca: 0.18 },
    media:  { corte: 0.50, vista: 0.18, cota: 0.13, marca: 0.25 },
    grossa: { corte: 0.70, vista: 0.25, cota: 0.18, marca: 0.35 }
  };
  function penas() { return (global.Prancha && global.Prancha.PENAS_PAPEL) || PENAS_PADRAO; }
  /* cor ACI pela espessura (centésimos de mm) */
  var COR_LW = { 13: 8, 18: 9, 25: 4, 35: 3, 50: 2, 70: 1 };
  var LW_VALIDOS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
  function lwDe(mm) {
    var c = Math.round(mm * 100), m = LW_VALIDOS[0];
    LW_VALIDOS.forEach(function (v) { if (Math.abs(v - c) < Math.abs(m - c)) m = v; });
    return m;
  }

  /* CATEGORIA da peça (tipo IFC do 3D) → nome da camada e peso do corte */
  var CATEGORIAS = {
    IFCWALL: ["ARQ-PAREDE", "forte"], IFCWALLSTANDARDCASE: ["ARQ-PAREDE", "forte"], IFCCURTAINWALL: ["ARQ-PAREDE", "medio"],
    IFCSLAB: ["ARQ-PISO", "forte"], IFCCOVERING: ["ARQ-FORRO", "medio"], IFCROOF: ["ARQ-COBERTURA", "forte"],
    IFCDOOR: ["ARQ-PORTA", "medio"], IFCWINDOW: ["ARQ-JANELA", "medio"],
    IFCSTAIR: ["ARQ-ESCADA", "forte"], IFCSTAIRFLIGHT: ["ARQ-ESCADA", "forte"], IFCRAMP: ["ARQ-RAMPA", "forte"], IFCRAMPFLIGHT: ["ARQ-RAMPA", "forte"],
    IFCRAILING: ["ARQ-GUARDA-CORPO", "medio"], IFCFURNISHINGELEMENT: ["ARQ-MOBILIARIO", "leve"], IFCFURNITURE: ["ARQ-MOBILIARIO", "leve"],
    IFCSPACE: ["ARQ-AMBIENTE", "leve"],
    IFCCOLUMN: ["EST-PILAR", "forte"], IFCBEAM: ["EST-VIGA", "forte"], IFCMEMBER: ["EST-PERFIL", "forte"], IFCPLATE: ["EST-CHAPA", "medio"],
    IFCMECHANICALFASTENER: ["EST-PARAFUSO", "leve"], IFCDISCRETEACCESSORY: ["EST-ACESSORIO", "leve"],   /* METÁLICA (js/metalpeca.js) */
    IFCFOOTING: ["EST-FUNDACAO", "forte"], IFCPILE: ["EST-FUNDACAO", "forte"], IFCREINFORCINGBAR: ["EST-ARMADURA", "medio"],
    IFCPIPESEGMENT: ["HID-TUBULACAO", "medio"], IFCFLOWSEGMENT: ["HID-TUBULACAO", "medio"], IFCPIPEFITTING: ["HID-TUBULACAO", "medio"],
    IFCFLOWFITTING: ["HID-TUBULACAO", "medio"], IFCSANITARYTERMINAL: ["HID-APARELHO", "leve"], IFCFLOWTERMINAL: ["HID-APARELHO", "leve"],
    IFCCABLECARRIERSEGMENT: ["ELE-ELETRODUTO", "medio"], IFCSITE: ["TER-TERRENO", "medio"], IFCGEOGRAPHICELEMENT: ["TER-TERRENO", "medio"],
    IFCBUILDINGELEMENTPROXY: ["ARQ-GENERICO", "medio"]
  };
  function categoria(ifc) { return CATEGORIAS[String(ifc || "").toUpperCase()] || ["ARQ-GENERICO", "medio"]; }
  /* FASES (P10): status → [sufixo da camada, tipo de linha] */
  var FASE_DXF = { demolido: ["DEMOLIDO", "DEMOLIDO"], temporario: ["TEMPORARIO", "TRACO-PONTO"] };

  /* a camada da anotação pela classe do grupo do SVG do desenho 2D */
  var CAMADA_CLASSE = [
    ["d2-eixo-g", "ANOT-EIXO"], ["d2-marca", "ANOT-MARCA-CORTE"], ["d2-nivel", "ANOT-NIVEL"], ["d2-titulo", "ANOT-TITULO"],
    ["d2-amb-legenda", "ANOT-LEGENDA"], ["d2-ambientes", "ARQ-AMBIENTE-IDENT"], ["d2-inst", "INST-REDE"], ["d2-cad", "CAD-VINCULO"],
    ["d2-cota", "ANOT-COTA"], ["d2-acima", "ANOT-ACIMA"]
  ];

  /* --------------------------------------------------------------- doc */
  function num(v) { var n = Math.round((+v || 0) * 1e6) / 1e6; if (Math.abs(n) < 1e-9) n = 0; return String(n); }
  /* texto: sem quebra de linha, acento em \U+XXXX */
  function txtDxf(s) {
    var o = "", t = String(s == null ? "" : s).replace(/[\r\n]+/g, " ");
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c < 32) continue;
      if (c < 128) { o += t.charAt(i); continue; }
      var h = c.toString(16).toUpperCase(); while (h.length < 4) h = "0" + h;
      o += "\\U+" + h;
    }
    return o;
  }
  function nomeCamada(s) { return String(s || "0").toUpperCase().replace(/[<>\/\\":;?*|=,`]/g, "-").slice(0, 120) || "0"; }

  function novoDoc(opts) {
    opts = opts || {};
    var doc = {
      unidade: opts.unidade === "mm" ? "mm" : "m",
      camadas: {}, ordem: [], entidades: [], blocos: [], estilosCota: {}, avisos: [],
      specs: {},
      /* `especificar` guarda a pena da camada sem criá-la: ela só entra no DXF se alguma entidade usar */
      especificar: function (nome, mm, ltype, cor) { nome = nomeCamada(nome); this.specs[nome] = [mm, ltype, cor]; return nome; },
      camada: function (nome, mm, ltype, cor) {
        nome = nomeCamada(nome);
        if (!this.camadas[nome] && this.specs[nome] && mm == null) { var sp = this.specs[nome]; mm = sp[0]; ltype = sp[1]; cor = sp[2]; }
        if (!this.camadas[nome]) {
          var lw = lwDe(mm || 0.18);
          this.camadas[nome] = { nome: nome, lw: lw, cor: cor || COR_LW[lw] || 7, ltype: ltype || "CONTINUOUS" };
          this.ordem.push(nome);
        }
        return nome;
      },
      add: function (e) { if (!this.camadas[e.camada]) this.camada(e.camada); this.entidades.push(e); if (this._usadas) this._usadas[e.camada] = 1; return e; },
      linha: function (c, x1, y1, x2, y2) { if (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9) return null; return this.add({ t: "LINE", camada: c, p: [x1, y1, x2, y2] }); },
      poli: function (c, pts, fechado) { if (!pts || pts.length < 2) return null; return this.add({ t: "LWPOLYLINE", camada: c, pts: pts, fechado: !!fechado }); },
      circulo: function (c, x, y, r) { return this.add({ t: "CIRCLE", camada: c, x: x, y: y, r: r }); },
      /* ARC: centro, raio e ângulos em GRAUS, no sentido anti-horário (Y para cima) de a0 até a1 */
      arco: function (c, x, y, r, a0, a1) { if (!(r > 0)) return null; return this.add({ t: "ARC", camada: c, x: x, y: y, r: r, a0: a0, a1: a1 }); },
      texto: function (c, x, y, h, s, ang, centro) { if (!String(s || "").trim()) return null; return this.add({ t: "TEXT", camada: c, x: x, y: y, h: h, s: s, ang: ang || 0, centro: !!centro }); },
      hachura: function (c, laços, espaco, solido, extra) { if (!laços || !laços.length) return null; var h = { t: "HATCH", camada: c, lacos: laços, espaco: espaco }; if (solido) h.solido = true; if (extra) { if (extra.padrao) h.padrao = extra.padrao; if (extra.cor) h.cor = extra.cor; if (extra.aci != null) h.aci = extra.aci; } return this.add(h); },   /* METÁLICA › S5: solido = preenchimento cheio (seção cortada, ponta de seta) */
      estiloCota: function (nome, o) { this.estilosCota[nome] = o; return nome; },
      /* ARQUIVO CAD ÚNICO (etapa 5 das pranchas de arquitetura, 15/11/2026): layouts (paperspace) e tipos de linha por padrão.
         O MODEL é doc.entidades (metros, escala real); cada layout leva as suas entidades em mm de papel e as VIEWPORTs travadas na escala.
         `paper(L, fn)` roda fn e leva para o layout L o que fn criou (as mesmas funções linha/poli/texto/hachura). */
      layouts: [], ltypes: {},
      ltype: function (nome, padrao) { if (!this.ltypes[nome]) this.ltypes[nome] = padrao; return nome; },
      layout: function (nome, w, h, o) { var L = { nome: nome, w: w, h: h, ents: [], opts: o || {} }; if (!L.opts.camadaVp && !this.camadas["ARQ-VIEWPORT"]) { this.camada("ARQ-VIEWPORT", 0.13, null, 7); this.camadas["ARQ-VIEWPORT"].noplot = true; this.camadas["ARQ-VIEWPORT"].lw = 0; } this.layouts.push(L); return L; },
      paper: function (L, fn) { var n0 = this.entidades.length; fn(); this.entidades.splice(n0).forEach(function (e) { L.ents.push(e); }); return L; },
      viewport: function (L, cx, cy, w, h, mx, my, altura, o) { var v = { t: "VIEWPORT", camada: (o && o.camada) || (L.opts && L.opts.camadaVp) || "ARQ-VIEWPORT", cx: cx, cy: cy, w: w, h: h, mx: mx, my: my, altura: altura, travada: !o || o.travada !== false }; if (o) { ["flags90", "st68", "circ", "alvo"].forEach(function (k) { if (o[k] != null) v[k] = o[k]; }); } /* variantes só para diagnóstico (tools/gerar-diag-viewport.js) */ if (!this.camadas[v.camada]) { this.camada(v.camada, 0.13, null, 7); this.camadas[v.camada].noplot = true; this.camadas[v.camada].lw = 0; } L.ents.push(v); return v; },
      /* cota linear girada (0° = horizontal): p1/p2 = origens das linhas de chamada,
         pl = um ponto da linha de cota; `graf` = as entidades do desenho da cota */
      cota: function (c, estilo, p1, p2, pl, ang, valor, texto, graf) {
        var nome = "*D" + (this.blocos.length + 1);
        this.blocos.push({ nome: nome, ents: graf || [] });
        return this.add({ t: "DIMENSION", camada: c, estilo: estilo, bloco: nome, p1: p1, p2: p2, pl: pl, ang: ang || 0, valor: valor, texto: texto });
      }
    };
    doc.camada("0", 0.25, "CONTINUOUS", 7);
    return doc;
  }

  /* PADRÕES DO PREENCHIMENTO DO CORTE além do ANSI31: famílias em múltiplos de E (3,175 mm na escala 1). dxl = deslocamento ao longo da linha, dyl = entre linhas. */
  var PADROES_HATCH = {
    cruzada: { nome: "RA-CRUZADA", fam: [{ a: 45, dxl: 0, dyl: 0.75 }, { a: 135, dxl: 0, dyl: 0.75 }] },
    tijolo: { nome: "RA-TIJOLO", fam: [{ a: 0, dxl: 0, dyl: 0.4 }, { a: 90, dxl: 0.4, dyl: 0.67, dash: [0.4, -0.4] }] },
    concreto: { nome: "RA-CONCRETO", fam: [{ a: 0, dxl: 0.45, dyl: 0.45, dash: [0, -0.9] }, { a: 63, dxl: 0.9, dyl: 1.7, dash: [0, -1.8] }] }
  };

  /* ---------------------------------------------------------- escrever */
  function escrever(doc) {
    var LAY = !!(doc.layouts && doc.layouts.length);   /* arquivo CAD único: R2010 (AC1024) com layouts */
    var ps = false;   /* escrevendo entidade do paperspace (grupo 67 = 1) */
    var L = [], h = 0x20;
    function H() { return (h++).toString(16).toUpperCase(); }
    function g(c, v) { L.push(String(c)); L.push(String(v)); }
    var hMS = "1F", hPS = "1E";   /* reservados abaixo do contador (0x20) */
    var ext = extensao(doc);
    var hTabelas = {}, hBR = {};
    ["VPORT", "LTYPE", "LAYER", "STYLE", "VIEW", "UCS", "APPID", "DIMSTYLE", "BLOCK_RECORD"].forEach(function (t) { hTabelas[t] = H(); });
    hBR["*Model_Space"] = hMS; hBR["*Paper_Space"] = hPS;
    doc.blocos.forEach(function (b) { hBR[b.nome] = H(); });
    var hDicRaiz = H(), hDicGrupo = H(), hDicPlot = H(), hPlotNormal = H();
    var hEnt = []; doc.entidades.forEach(function () { hEnt.push(H()); });
    var hBlocoEnts = doc.blocos.map(function (b) { return { b: H(), e: H(), ents: b.ents.map(function () { return H(); }) }; });
    var hLt = { BYBLOCK: H(), BYLAYER: H(), CONTINUOUS: H(), TRACEJADO: H(), "TRACO-PONTO": H(), PROJECAO: H(), DEMOLIDO: H() };
    var hEst = { STANDARD: H(), "RA-ARIAL": H() };
    if (LAY) hEst["RA-VERDANA"] = H();
    /* LAY: os handles dos layouts (o 1º layout é o *Paper_Space; os outros, *Paper_Space0, 1…) e dos tipos de linha por padrão */
    var hLay = [], hDicLay = null, hLayModel = null, hLtDin = {};
    if (LAY) {
      hDicLay = H(); hLayModel = H();
      var nomesLay = {};
      doc.layouts.forEach(function (L, i) {
        var nm = txtDxf(L.nome).replace(/[<>\/\\":;?*|=,`]/g, "-").slice(0, 120) || ("Layout" + (i + 1)), q = nm, k = 1;
        while (nomesLay[q.toUpperCase()]) { k++; q = nm + "-" + k; }
        nomesLay[q.toUpperCase()] = 1; L.nomeDxf = q;
        hLay.push({ lay: H(), br: i === 0 ? hPS : H(), b: H(), e: H(), vp: H() });
        L.brNome = i === 0 ? "*Paper_Space" : "*Paper_Space" + (i - 1);
      });
      Object.keys(doc.ltypes || {}).forEach(function (n) { hLtDin[n] = H(); });
    }
    var hDim = { STANDARD: H() }; Object.keys(doc.estilosCota).forEach(function (k) { hDim[k] = H(); });
    var hCam = {}; doc.ordem.forEach(function (n) { hCam[n] = H(); });
    var hVp = H(), hApp = H();

    /* HEADER */
    g(0, "SECTION"); g(2, "HEADER");
    g(9, "$ACADVER"); g(1, LAY ? "AC1024" : "AC1015");
    if (LAY) { g(9, "$ACADMAINTVER"); g(70, 6); }
    g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
    g(9, "$INSBASE"); g(10, 0); g(20, 0); g(30, 0);
    g(9, "$EXTMIN"); g(10, num(ext.x0)); g(20, num(ext.y0)); g(30, 0);
    g(9, "$EXTMAX"); g(10, num(ext.x1)); g(20, num(ext.y1)); g(30, 0);
    g(9, "$LIMMIN"); g(10, num(ext.x0)); g(20, num(ext.y0));
    g(9, "$LIMMAX"); g(10, num(ext.x1)); g(20, num(ext.y1));
    g(9, "$LTSCALE"); g(40, LAY ? 1 : (doc.unidade === "m" ? num((doc.escala || 50) / 1000) : 1));   /* LAY: a escala do tracejado vai em cada entidade (48) */
    g(9, "$PSLTSCALE"); g(70, LAY ? 0 : 1);   /* LAY: 0 = o tracejado do MODEL acompanha a escala da viewport (padrão em mm de papel × escala do desenho) */
    g(9, "$LUNITS"); g(70, 2);
    g(9, "$LUPREC"); g(70, doc.unidade === "m" ? 3 : 1);
    g(9, "$INSUNITS"); g(70, doc.unidade === "m" ? 6 : 4);
    g(9, "$MEASUREMENT"); g(70, 1);
    g(9, "$LWDISPLAY"); g(290, LAY ? 0 : 1);   /* LAY: espessura só no CTB/plot style (reserva: lineweight da camada); na tela a linha não engrossa */
    g(9, "$DIMSTYLE"); g(2, Object.keys(doc.estilosCota)[0] || "Standard");
    if (LAY) { g(9, "$PSTYLEMODE"); g(290, 1);   /* 1 = estilo por COR (o .ctb); grupo 290 (booleano: com 70 o AutoCAD recusa o DXF, "Error 50 in drawing header"). Sem ele o dxf2dwg grava PSTYLEMODE = 0 (estilo NOMEADO, monochrome.stb) e o AutoCAD recusa qualquer .ctb ("Invalid input" no StyleSheet) */
      g(9, "$FILLMODE"); g(70, 1);   /* sem ele o dxf2dwg grava FILLMODE = 0 no DWG e o AutoCAD não desenha/plota preenchimento (SOLID, HATCH sólida) */
      g(9, "$TILEMODE"); g(70, 1); g(9, "$MAXACTVP"); g(70, 64); g(9, "$PSVPSCALE"); g(40, 0); }
    g(9, "$HANDSEED"); g(5, "FFFFF");
    g(0, "ENDSEC");
    /* CLASSES: as duas classes dos objetos do estilo de plotagem "Normal" (o AutoCAD
       recusa a tabela de camadas sem o 390 de cada camada apontando para ele) */
    g(0, "SECTION"); g(2, "CLASSES");
    [["ACDBDICTIONARYWDFLT", "AcDbDictionaryWithDefault"], ["ACDBPLACEHOLDER", "AcDbPlaceHolder"]].concat(LAY ? [["LAYOUT", "AcDbLayout"]] : []).forEach(function (c) {
      g(0, "CLASS"); g(1, c[0]); g(2, c[1]); g(3, "ObjectDBX Classes"); g(90, 0); if (LAY) g(91, 0); g(280, 0); g(281, 0);   /* AC1024: o AutoCAD exige o 91 (contagem de instâncias) em cada CLASS; sem ele descarta o DXF inteiro ("Group 91 expected") */
    });
    g(0, "ENDSEC");

    /* TABLES */
    g(0, "SECTION"); g(2, "TABLES");
    function tabela(nome, n, fn, extra) {
      g(0, "TABLE"); g(2, nome); g(5, hTabelas[nome]); g(330, 0); g(100, "AcDbSymbolTable"); g(70, n);
      if (extra) extra();
      fn(); g(0, "ENDTAB");
    }
    function reg(tipo, hh, sub, owner) {
      g(0, tipo); g(tipo === "DIMSTYLE" ? 105 : 5, hh); g(330, owner); g(100, "AcDbSymbolTableRecord"); g(100, sub);
    }
    tabela("VPORT", 1, function () {
      reg("VPORT", hVp, "AcDbViewportTableRecord", hTabelas.VPORT);
      g(2, "*Active"); g(70, 0); g(10, 0); g(20, 0); g(11, 1); g(21, 1);
      g(12, num((ext.x0 + ext.x1) / 2)); g(22, num((ext.y0 + ext.y1) / 2)); g(13, 0); g(23, 0); g(14, 1); g(24, 1); g(15, 0); g(25, 0);
      g(16, 0); g(26, 0); g(36, 1); g(17, 0); g(27, 0); g(37, 0);
      g(40, num(Math.max(ext.y1 - ext.y0, 1) * 1.1)); g(41, num(Math.max((ext.x1 - ext.x0) / Math.max(ext.y1 - ext.y0, 1e-6), 0.5)));
      g(42, 50); g(43, 0); g(44, 0); g(50, 0); g(51, 0); g(71, 0); g(72, 100); g(73, 1); g(74, 3); g(75, 0); g(76, 0); g(77, 0); g(78, 0);
      g(281, 0); g(65, 1); g(110, 0); g(120, 0); g(130, 0); g(111, 1); g(121, 0); g(131, 0); g(112, 0); g(122, 1); g(132, 0); g(79, 0); g(146, 0);
    });
    var lts = [["ByBlock", hLt.BYBLOCK, []], ["ByLayer", hLt.BYLAYER, []], ["Continuous", hLt.CONTINUOUS, []],
      /* padrões RA (NBR 8403) em mm de papel — o $LTSCALE leva para a escala do modelo */
      ["TRACEJADO", hLt.TRACEJADO, [4, -1.5]], ["TRACO-PONTO", hLt["TRACO-PONTO"], [8, -1.5, 1, -1.5]],
      /* ACIMA DO CORTE: o tracejado LONGO de projeção (data/estilos-objeto-ra.json "projecao", 6 / 1,5 mm) */
      ["PROJECAO", hLt.PROJECAO, [6, -1.5]],
      /* FASES (P10): o tracejado CURTO do demolido (Padrão RA "demolido", 1,5 / 1 mm) */
      ["DEMOLIDO", hLt.DEMOLIDO, [1.5, -1]]];
    if (LAY) Object.keys(doc.ltypes || {}).forEach(function (n) { lts.push([n, hLtDin[n], doc.ltypes[n], "Tracejado RA (mm de papel)"]); });
    tabela("LTYPE", lts.length, function () {
      lts.forEach(function (lt) {
        reg("LTYPE", lt[1], "AcDbLinetypeTableRecord", hTabelas.LTYPE);
        g(2, lt[0]); g(70, 0);
        g(3, lt[3] ? lt[3] : lt[2].length ? (lt[0] === "TRACEJADO" ? "Tracejado RA __ __ __" : lt[0] === "PROJECAO" ? "Projecao RA (acima do corte) ______ ______" : lt[0] === "DEMOLIDO" ? "Demolido RA _ _ _ _" : "Traco-ponto RA ____ . ____") : (lt[0] === "Continuous" ? "Solid line" : ""));
        g(72, 65); g(73, lt[2].length);
        var tot = 0; lt[2].forEach(function (v) { tot += Math.abs(v); }); g(40, num(tot));
        lt[2].forEach(function (v) { g(49, num(v)); g(74, 0); });
      });
    });
    tabela("LAYER", doc.ordem.length, function () {
      doc.ordem.forEach(function (n) {
        var c = doc.camadas[n];
        reg("LAYER", hCam[n], "AcDbLayerTableRecord", hTabelas.LAYER);
        g(2, txtDxf(n)); g(70, 0); g(62, c.cor); g(6, c.ltype === "CONTINUOUS" ? "Continuous" : c.ltype); if (n === "DEFPOINTS" || c.noplot) g(290, 0); g(370, c.lw); g(390, hPlotNormal);
      });
    });
    var estilos = [["Standard", hEst.STANDARD, "txt"], ["RA-ARIAL", hEst["RA-ARIAL"], "arial.ttf"]];
    if (LAY) estilos.push(["RA-VERDANA", hEst["RA-VERDANA"], "verdana.ttf"]);   /* a fonte do padrão arquitetura_interiores */
    tabela("STYLE", estilos.length, function () {
      estilos.forEach(function (s) {
        reg("STYLE", s[1], "AcDbTextStyleTableRecord", hTabelas.STYLE);
        g(2, s[0]); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, s[2]); g(4, "");
      });
    });
    tabela("VIEW", 0, function () {});
    tabela("UCS", 0, function () {});
    tabela("APPID", 1, function () { reg("APPID", hApp, "AcDbRegAppTableRecord", hTabelas.APPID); g(2, "ACAD"); g(70, 0); });
    var dims = [["Standard", hDim.STANDARD, { escala: 1, fator: 1 }]].concat(Object.keys(doc.estilosCota).map(function (k) { return [k, hDim[k], doc.estilosCota[k]]; }));
    tabela("DIMSTYLE", dims.length, function () {
      dims.forEach(function (d) {
        var o = d[2] || {};
        reg("DIMSTYLE", d[1], "AcDbDimStyleTableRecord", hTabelas.DIMSTYLE);
        g(2, txtDxf(d[0])); g(70, 0);
        g(40, num(o.escala || 1));        /* DIMSCALE */
        g(41, 2.5);                       /* DIMASZ */
        g(42, 1.5);                       /* DIMEXO */
        g(44, 2);                         /* DIMEXE */
        g(140, num(o.texto || 2.5));      /* DIMTXT */
        g(141, 0);
        g(142, num(o.traco != null ? o.traco : 1.6));   /* DIMTSZ: traço oblíquo (padrão RA) */
        g(143, 25.4);
        g(144, num(o.fator || 1));        /* DIMLFAC: a folha mede em mm de papel e mostra em m */
        g(147, 0.8);                      /* DIMGAP */
        g(77, 1);                         /* DIMTAD: texto em cima da linha */
        g(78, 8);                         /* DIMZIN */
        g(271, o.casas != null ? o.casas : 2);   /* DIMDEC */
        g(277, 2);                        /* DIMLUNIT decimal */
        g(278, 44);                       /* DIMDSEP = vírgula */
        g(340, hEst["RA-ARIAL"]);         /* DIMTXSTY */
      });
    }, function () { g(100, "AcDbDimStyleTable"); g(71, 0); });
    var brs = [["*Model_Space", hMS, LAY ? hLayModel : null], ["*Paper_Space", hPS, LAY ? hLay[0].lay : null]];
    if (LAY) doc.layouts.forEach(function (L, i) { if (i > 0) brs.push([L.brNome, hLay[i].br, hLay[i].lay]); });
    brs = brs.concat(doc.blocos.map(function (b) { return [b.nome, hBR[b.nome]]; }));
    tabela("BLOCK_RECORD", brs.length, function () {
      brs.forEach(function (b) { reg("BLOCK_RECORD", b[1], "AcDbBlockTableRecord", hTabelas.BLOCK_RECORD); g(2, b[0]); if (b[2]) { g(340, b[2]); g(70, 0); g(280, 1); g(281, 0); } });
    });
    g(0, "ENDSEC");

    /* BLOCKS */
    g(0, "SECTION"); g(2, "BLOCKS");
    function bloco(nome, hb, he, owner, ents, hents, anon) {
      g(0, "BLOCK"); g(5, hb); g(330, owner); g(100, "AcDbEntity"); g(8, "0"); g(100, "AcDbBlockBegin");
      g(2, nome); g(70, anon ? 1 : 0); g(10, 0); g(20, 0); g(30, 0); g(3, nome); g(1, "");
      (ents || []).forEach(function (e, i) { entidade(e, hents[i], owner); });
      g(0, "ENDBLK"); g(5, he); g(330, owner); g(100, "AcDbEntity"); g(8, "0"); g(100, "AcDbBlockEnd");
    }
    bloco("*Model_Space", H(), H(), hMS, [], [], false);
    var pap1 = null;   /* entidades do 1º layout (vão para ENTITIES com 67 = 1) */
    if (!LAY) bloco("*Paper_Space", H(), H(), hPS, [], [], false);
    else doc.layouts.forEach(function (L, i) {
      var hl = hLay[i], vpPrincipal = { t: "VIEWPORT", camada: "0", principal: true, cx: L.w / 2, cy: L.h / 2, w: L.w, h: L.h, mx: L.w / 2, my: L.h / 2, altura: L.h }, todas = [vpPrincipal].concat(L.ents.filter(function (q) { return q.t === "VIEWPORT"; }), L.ents.filter(function (q) { return q.t !== "VIEWPORT"; }));
      /* as VIEWPORTs vêm logo DEPOIS da principal e antes do resto do layout: o LibreDWG (dxf2dwg) perde as viewports que ficam no fim de um layout grande (4 viram 3, "Object handle not found") */
      var hs = todas.map(function (e, j) { return j === 0 ? hl.vp : H(); }); ps = true;
      /* O AutoCAD NÃO aceita entidades dentro do bloco *Paper_Space ("Entities not allowed in *Paper_Space block definition"; descarta o DXF todo): as do
         1º layout vão na seção ENTITIES com 67 = 1 (como o próprio AutoCAD grava); só os layouts seguintes (*Paper_Space0, 1…) levam as entidades no bloco. */
      if (i === 0) { pap1 = { ents: todas, hs: hs, owner: hl.br }; bloco(L.brNome, hl.b, hl.e, hl.br, [], [], false); }
      else bloco(L.brNome, hl.b, hl.e, hl.br, todas, hs, false);
      ps = false;
    });
    doc.blocos.forEach(function (b, i) { var hb = hBlocoEnts[i]; bloco(b.nome, hb.b, hb.e, hBR[b.nome], b.ents, hb.ents, true); });
    g(0, "ENDSEC");

    /* ENTITIES */
    g(0, "SECTION"); g(2, "ENTITIES");
    doc.entidades.forEach(function (e, i) { entidade(e, hEnt[i], hMS); });
    if (pap1) { ps = true; pap1.ents.forEach(function (e, i) { entidade(e, pap1.hs[i], pap1.owner); }); ps = false; }
    g(0, "ENDSEC");

    /* OBJECTS: o dicionário raiz com o ACAD_GROUP (o mínimo que o AutoCAD pede) */
    g(0, "SECTION"); g(2, "OBJECTS");
    g(0, "DICTIONARY"); g(5, hDicRaiz); g(330, 0); g(100, "AcDbDictionary"); g(281, 1);
    g(3, "ACAD_GROUP"); g(350, hDicGrupo); if (LAY) { g(3, "ACAD_LAYOUT"); g(350, hDicLay); } g(3, "ACAD_PLOTSTYLENAME"); g(350, hDicPlot);
    g(0, "DICTIONARY"); g(5, hDicGrupo); g(330, hDicRaiz); g(100, "AcDbDictionary"); g(281, 1);
    g(0, "ACDBDICTIONARYWDFLT"); g(5, hDicPlot); g(330, hDicRaiz); g(100, "AcDbDictionary"); g(281, 1); g(3, "Normal"); g(350, hPlotNormal);
    g(100, "AcDbDictionaryWithDefault"); g(340, hPlotNormal);
    g(0, "ACDBPLACEHOLDER"); g(5, hPlotNormal); g(330, hDicPlot);
    if (LAY) {
      /* o dicionário dos layouts: Model + um por folha (nome = código da folha), cada LAYOUT apontando o seu BLOCK_RECORD (*Paper_Space…) e a viewport principal */
      g(0, "DICTIONARY"); g(5, hDicLay); g(330, hDicRaiz); g(100, "AcDbDictionary"); g(281, 1);
      g(3, "Model"); g(350, hLayModel);
      doc.layouts.forEach(function (La, i) { g(3, La.nomeDxf); g(350, hLay[i].lay); });
      var plot = function (hh, nomeLay, aba, w, hgt, papel, ctb, modelo, brh, vph) {
        g(0, "LAYOUT"); g(5, hh); g(330, hDicLay); g(100, "AcDbPlotSettings");
        g(1, ""); g(2, modelo ? "None" : "DWG To PDF.pc3"); g(4, papel || ""); g(6, "");
        g(40, 0); g(41, 0); g(42, 0); g(43, 0); g(44, num(w)); g(45, num(hgt)); g(46, 0); g(47, 0); g(48, 0); g(49, 0);
        g(140, 0); g(141, 0); g(142, 1); g(143, 1);
        g(70, modelo ? 1024 : 176);   /* papel: escala padrão (16) + plotar com estilos (32) + espessuras de linha (128) */
        g(72, 1); g(73, 0); g(74, modelo ? 0 : 5); g(7, ctb || ""); g(75, 16); g(76, 0); g(77, 2); g(78, 300); g(147, 1); g(148, 0); g(149, 0);
        g(100, "AcDbLayout"); g(1, nomeLay); g(70, 1); g(71, aba);
        g(10, 0); g(20, 0); g(11, num(w)); g(21, num(hgt)); g(12, 0); g(22, 0); g(32, 0);
        g(14, "1e+20"); g(24, "1e+20"); g(34, "1e+20"); g(15, "-1e+20"); g(25, "-1e+20"); g(35, "-1e+20");
        g(146, 0); g(13, 0); g(23, 0); g(33, 0); g(16, 1); g(26, 0); g(36, 0); g(17, 0); g(27, 1); g(37, 0); g(76, 1);
        g(330, brh); if (vph) g(331, vph);
      };
      plot(hLayModel, "Model", 0, 420, 297, "", "", true, hMS, null);
      doc.layouts.forEach(function (La, i) { var o = La.opts || {}; plot(hLay[i].lay, La.nomeDxf, i + 1, La.w, La.h, o.papel, o.ctb, false, hLay[i].br, hLay[i].vp); });
    }
    g(0, "ENDSEC");
    g(0, "EOF");
    /* o $HANDSEED de verdade: o próximo handle livre */
    var ixSeed = L.indexOf("$HANDSEED"); if (ixSeed >= 0) L[ixSeed + 2] = H();
    return L.join("\r\n") + "\r\n";

    var ltEnt = null, ltsEnt = null, corEnt = null;
    /* COR DA ENTIDADE (16/11/2026, cota colorida): e.cor = "#rrggbb" vira truecolor (420) com o ACI mais próximo (62) de reserva; e.aci = índice ACI direto. Sem nenhum dos dois, vale a cor da camada. */
    function aciMaisProximo(r, g2, b) {
      if (r === g2 && g2 === b) return r < 40 ? 7 : (r > 215 ? 7 : 8);
      var m = Math.max(r, g2, b), q = [[255, 0, 0, 1], [255, 255, 0, 2], [0, 255, 0, 3], [0, 255, 255, 4], [0, 0, 255, 5], [255, 0, 255, 6]], bst = 7, bd = 1e9;
      q.forEach(function (c0) { var d = Math.pow(r / m * 255 - c0[0], 2) + Math.pow(g2 / m * 255 - c0[1], 2) + Math.pow(b / m * 255 - c0[2], 2); if (d < bd) { bd = d; bst = c0[3]; } });
      return bst;
    }
    function comum(tipo, hh, owner, camada, sub) {
      g(0, tipo); g(5, hh); g(330, owner); g(100, "AcDbEntity"); if (ps) g(67, 1); g(8, txtDxf(camada));
      if (corEnt) {
        if (corEnt.aci != null) g(62, corEnt.aci);
        else { g(62, aciMaisProximo(corEnt.r, corEnt.g, corEnt.b)); g(420, (corEnt.r << 16) + (corEnt.g << 8) + corEnt.b); }
      }
      if (ltEnt) g(6, ltEnt);
      if (ltsEnt) g(48, num(ltsEnt));   /* escala do tracejado da entidade (CAD único: a do desenho no MODEL) */
      g(100, sub);
    }
    function entidade(e, hh, owner) {
      ltEnt = e.lt || null; ltsEnt = e.lts || null;
      corEnt = null;
      if (e.aci != null) corEnt = { aci: e.aci };
      else { var mcr = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(String(e.cor || "")); if (mcr) corEnt = { r: parseInt(mcr[1], 16), g: parseInt(mcr[2], 16), b: parseInt(mcr[3], 16) }; }
      if (e.t === "LINE") {
        comum("LINE", hh, owner, e.camada, "AcDbLine");
        g(10, num(e.p[0])); g(20, num(e.p[1])); g(30, 0); g(11, num(e.p[2])); g(21, num(e.p[3])); g(31, 0);
      } else if (e.t === "SOLID") {   /* preenchimento (só pelo caminho do DWG: hachurasEmGeometria) — 4 cantos na ordem do SOLID: 1-2-4-3 */
        comum("SOLID", hh, owner, e.camada, "AcDbTrace");
        e.q.forEach(function (c, i) { g(10 + i, num(c[0])); g(20 + i, num(c[1])); g(30 + i, 0); });
      } else if (e.t === "LWPOLYLINE") {
        comum("LWPOLYLINE", hh, owner, e.camada, "AcDbPolyline");
        g(90, e.pts.length); g(70, e.fechado ? 1 : 0); g(43, 0);
        e.pts.forEach(function (p) { g(10, num(p[0])); g(20, num(p[1])); });
      } else if (e.t === "CIRCLE") {
        comum("CIRCLE", hh, owner, e.camada, "AcDbCircle");
        g(10, num(e.x)); g(20, num(e.y)); g(30, 0); g(40, num(e.r));
      } else if (e.t === "ARC") {
        comum("ARC", hh, owner, e.camada, "AcDbCircle");
        g(10, num(e.x)); g(20, num(e.y)); g(30, 0); g(40, num(e.r));
        g(100, "AcDbArc"); g(50, num(e.a0)); g(51, num(e.a1));
      } else if (e.t === "TEXT") {
        comum("TEXT", hh, owner, e.camada, "AcDbText");
        g(10, num(e.x)); g(20, num(e.y)); g(30, 0); g(40, num(e.h)); g(1, txtDxf(e.s));
        if (e.ang) g(50, num(e.ang));
        g(7, e.est || "RA-ARIAL");
        if (e.centro || e.direita) { g(72, e.direita ? 2 : 1); g(11, num(e.x)); g(21, num(e.y)); g(31, 0); }   /* direita: texto que termina no ponto (pranchas do galpão e da madeira) */
        g(100, "AcDbText");
      } else if (e.t === "VIEWPORT") {
        /* viewport do layout: centro e tamanho em mm de papel; (mx, my) = o ponto do MODEL no centro; altura = a altura da janela em unidades do MODEL
           (altura do quadro em mm ÷ 1000 × escala = a escala travada do desenho). id 1 = a viewport principal do layout */
        var idv = e.principal ? 1 : (e.id || 2);
        comum("VIEWPORT", hh, owner, e.camada, "AcDbViewport");
        g(10, num(e.cx)); g(20, num(e.cy)); g(30, 0); g(40, num(e.w)); g(41, num(e.h));
        g(68, e.st68 != null ? e.st68 : (e.principal ? 1 : idv)); g(69, idv);
        var tx = e.alvo ? e.alvo[0] : 0, ty = e.alvo ? e.alvo[1] : 0;   /* 12/22 = centro em DCS (relativo ao alvo 17/27); alvo 0,0 → igual ao centro no MODEL */
        g(12, num(e.mx - tx)); g(22, num(e.my - ty)); g(13, 0); g(23, 0); g(14, 10); g(24, 10); g(15, 10); g(25, 10);
        g(16, 0); g(26, 0); g(36, 1); g(17, num(tx)); g(27, num(ty)); g(37, 0);
        g(42, 50); g(43, 0); g(44, 0); g(45, num(e.altura)); g(50, 0); g(51, 0); g(72, e.circ || 100);
        g(90, e.flags90 != null ? e.flags90 : (e.principal ? 557088 : (e.travada ? 49184 : 32800)));   /* 16384 = zoom travado; 32768 = sempre ativa; 32 = ícone do SCU */
        g(1, ""); g(281, 0); g(71, 0); g(74, 0);
        g(110, 0); g(120, 0); g(130, 0); g(111, 1); g(121, 0); g(131, 0); g(112, 0); g(122, 1); g(132, 0); g(79, 0); g(146, 0); g(282, 0);
      } else if (e.t === "HATCH") {
        comum("HATCH", hh, owner, e.camada, "AcDbHatch");
        g(10, 0); g(20, 0); g(30, 0); g(210, 0); g(220, 0); g(230, 1);
        var famI = !e.solido && e.padrao && PADROES_HATCH[e.padrao] ? PADROES_HATCH[e.padrao] : null;
        g(2, e.solido ? "SOLID" : (famI ? famI.nome : "ANSI31")); g(70, e.solido ? 1 : 0); g(71, 0); g(91, e.lacos.length);
        e.lacos.forEach(function (pts) {
          g(92, 2); g(72, 0); g(73, 1); g(93, pts.length);
          pts.forEach(function (p) { g(10, num(p[0])); g(20, num(p[1])); });
          g(97, 0);
        });
        if (e.solido) { g(75, 0); g(76, 1); g(98, 0); return; }
        /* PREENCHIMENTOS DO CORTE (16/11/2026): cruzada, tijolo e concreto — várias famílias (ângulo, deslocamento, tracejado), na unidade E = 3,175 × escala */
        if (famI) {
          var Sx = (+e.espaco || 3.175) / 3.175, E = 3.175 * Sx;
          g(75, 0); g(76, 1); g(52, 0); g(41, 1); g(77, 0); g(78, famI.fam.length);
          famI.fam.forEach(function (fa) {
            var an = fa.a * Math.PI / 180, ca = Math.cos(an), sa = Math.sin(an), dxl = fa.dxl * E, dyl = fa.dyl * E;
            g(53, fa.a); g(43, 0); g(44, 0); g(45, num(ca * dxl - sa * dyl)); g(46, num(sa * dxl + ca * dyl));
            g(79, (fa.dash || []).length); (fa.dash || []).forEach(function (v) { g(49, num(v * E)); });
          });
          g(98, 0);
          return;
        }
        /* ANSI31: família única a 45°, espaçamento 3,175 na escala 1 */
        var S = (+e.espaco || 3.175) / 3.175, d = 2.2450640303 * S;
        g(75, 0); g(76, 1); g(52, 0); g(41, num(S)); g(77, 0); g(78, 1);
        g(53, 45); g(43, 0); g(44, 0); g(45, num(-d)); g(46, num(d)); g(79, 0);
        g(98, 0);
      } else if (e.t === "DIMENSION") {
        comum("DIMENSION", hh, owner, e.camada, "AcDbDimension");
        g(2, e.bloco); g(10, num(e.pl[0])); g(20, num(e.pl[1])); g(30, 0);
        var mx = (e.p1[0] + e.p2[0]) / 2, my = (e.p1[1] + e.p2[1]) / 2;
        g(11, num(mx)); g(21, num(my)); g(31, 0);
        g(70, 32); g(71, 5);
        if (e.texto) g(1, txtDxf(e.texto));
        if (e.valor != null) g(42, num(e.valor));
        g(3, txtDxf(e.estilo || "Standard"));
        g(100, "AcDbAlignedDimension");
        g(13, num(e.p1[0])); g(23, num(e.p1[1])); g(33, 0);
        g(14, num(e.p2[0])); g(24, num(e.p2[1])); g(34, 0);
        g(50, num(e.ang || 0));
        g(100, "AcDbRotatedDimension");
      }
    }
  }

  function extensao(doc) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function p(x, y) { if (!isFinite(x) || !isFinite(y)) return; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    doc.entidades.forEach(function (e) {
      if (e.t === "LINE") { p(e.p[0], e.p[1]); p(e.p[2], e.p[3]); }
      else if (e.t === "LWPOLYLINE") e.pts.forEach(function (q) { p(q[0], q[1]); });
      else if (e.t === "CIRCLE" || e.t === "ARC") { p(e.x - e.r, e.y - e.r); p(e.x + e.r, e.y + e.r); }
      else if (e.t === "TEXT") p(e.x, e.y);
      else if (e.t === "DIMENSION") { p(e.p1[0], e.p1[1]); p(e.p2[0], e.p2[1]); p(e.pl[0], e.pl[1]); }
      else if (e.t === "HATCH") e.lacos.forEach(function (l) { l.forEach(function (q) { p(q[0], q[1]); }); });
      else if (e.t === "SOLID") e.q.forEach(function (q) { p(q[0], q[1]); });
    });
    if (b.x0 === Infinity) b = { x0: 0, y0: 0, x1: 1, y1: 1 };
    return b;
  }

  /* ------------------------------------------------------- recorte */
  /* Liang–Barsky: o pedaço do segmento dentro da caixa (ou null) */
  function recortarSeg(x1, y1, x2, y2, cx) {
    if (!cx) return [x1, y1, x2, y2];
    var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
    var pq = [[-dx, x1 - cx.x0], [dx, cx.x1 - x1], [-dy, y1 - cx.y0], [dy, cx.y1 - y1]];
    for (var i = 0; i < 4; i++) {
      var pp = pq[i][0], q = pq[i][1];
      if (Math.abs(pp) < 1e-12) { if (q < 0) return null; continue; }
      var r = q / pp;
      if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
  }
  function dentro(x, y, cx) { return !cx || (x >= cx.x0 - 1e-9 && x <= cx.x1 + 1e-9 && y >= cx.y0 - 1e-9 && y <= cx.y1 + 1e-9); }

  /* ------------------------------------------- SVG do desenho 2D → DXF
   * O desenho2d.js gera um SVG regular (line, path M/L/Z, circle, rect e
   * text com transform translate/rotate/scale). A anotação (eixos, níveis,
   * marcas de corte, título, ambientes, instalações, vínculo CAD) vem DELE —
   * assim o DXF leva o mesmo desenho da tela. O que o DXF desenha por conta
   * própria (cortes por categoria, linhas vistas, cotas como DIMENSION) é
   * pulado aqui. */
  function attrs(s) {
    var o = {}, re = /([\w:-]+)="([^"]*)"/g, m;
    while ((m = re.exec(s))) o[m[1]] = m[2];
    return o;
  }
  /* a cor do `style` de um traço do SVG ("stroke:#rrggbb" ou "fill:#rrggbb") → "#rrggbb" (cota colorida no DXF); sem cor = a da camada */
  function corDoStyle(st) { var m = /(?:^|;)\s*(?:stroke|fill)\s*:\s*(#[0-9a-fA-F]{6})\s*(?:;|$)/.exec(String(st || "")); return m ? m[1].toLowerCase() : ""; }
  function desesc(s) { return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"); }
  function pathPts(d) {
    var out = [], atual = null, re = /([MLZ])\s*([-\d.eE]+)?[\s,]*([-\d.eE]+)?/gi, m;
    while ((m = re.exec(d))) {
      var c = m[1].toUpperCase();
      if (c === "M") { atual = { pts: [[+m[2], +m[3]]], fechado: false }; out.push(atual); }
      else if (c === "L" && atual) atual.pts.push([+m[2], +m[3]]);
      else if (c === "Z" && atual) { atual.fechado = true; atual = null; }
    }
    return out;
  }
  /* MODO CAMADA POR ELEMENTO (opts.camadaPor — pranchas do galpão e da madeira, js/pranchasdxf.js, 21/10/2026).
   * O SVG dessas pranchas não tem a classe do desenho 2D: cada traço traz `data-cam` (a camada MET-/MAD- do desenho)
   * e usa polyline/polygon, texto com rotate(a x y) e âncora à direita. Quem chama dá `camadaPor(tag, atributos)`:
   * devolve o nome da camada (já criada no doc) ou null = pular o elemento.
   * ⚠ Só entra quando `camadaPor` é passado: o caminho antigo (planta/corte do desenho 2D) NÃO muda. */
  function svgPorCamada(svg, doc, xf, opts) {
    var re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g, m, txtAberto = null, defs = 0, rec = opts.recorte || null, altT = opts.alturaTexto || 0.7;
    function P(x, y) { return xf.pt(+x, +y); }
    function cheio(a) { var f = String(a.fill == null ? "" : a.fill).toLowerCase(); return f && f !== "none" && f !== "#fff" && f !== "#ffffff" && f !== "white"; }
    function contorno(a) { var st = String(a.stroke == null ? "" : a.stroke).toLowerCase(); return st && st !== "none"; }
    function tracado(ini, a) { var da = String(a["stroke-dasharray"] || "").trim().split(/[\s,]+/).filter(Boolean).length, lt = da >= 4 ? "TRACO-PONTO" : da >= 2 ? "TRACEJADO" : null; if (lt) for (var i = ini; i < doc.entidades.length; i++) doc.entidades[i].lt = lt; }
    function linhas(cam, pts, fechado, a) {
      var n0 = doc.entidades.length, Q = pts.map(function (q) { return P(q[0], q[1]); });
      if (!rec || Q.every(function (q) { return dentro(q[0], q[1], rec); })) doc.poli(cam, Q, fechado);
      else for (var i = 0; i + 1 < Q.length + (fechado ? 1 : 0); i++) { var r = recortarSeg(Q[i][0], Q[i][1], Q[(i + 1) % Q.length][0], Q[(i + 1) % Q.length][1], rec); if (r) doc.linha(cam, r[0], r[1], r[2], r[3]); }
      tracado(n0, a);
    }
    function sol(cam, pts) { var Q = pts.map(function (q) { return P(q[0], q[1]); }); if (Q.length >= 3) doc.hachura(cam, [Q], null, true); }
    while ((m = re.exec(svg))) {
      if (m[5] != null) { if (txtAberto) txtAberto.s += m[5]; continue; }
      var fecha = m[1] === "/", tag = m[2].toLowerCase(), a = attrs(m[3] || ""), auto = m[4] === "/";
      if (tag === "defs" || tag === "pattern" || tag === "style") { if (!fecha && !auto) defs++; else if (fecha) defs = Math.max(0, defs - 1); continue; }
      if (defs) continue;
      if (tag === "g" || tag === "svg" || tag === "title") continue;
      if (tag === "text") {
        if (!fecha) { txtAberto = auto ? null : { a: a, s: "" }; continue; }
        var t = txtAberto; txtAberto = null; if (!t) continue;
        var s = desesc(t.s); if (!s.trim()) continue;
        if (typeof opts.paraTexto === "function") s = opts.paraTexto(s);   /* ex.: Ø → %%c (o SHX da RA não tem o Ø) */
        var cT = opts.camadaPor("text", t.a); if (!cT) continue;
        var tr = t.a.transform || "", mr = /rotate\(([-\d.eE]+)/.exec(tr), fs = +(t.a["font-size"] || 100), pt = P(t.a.x || 0, t.a.y || 0);
        if (!dentro(pt[0], pt[1], rec)) continue;
        /* a letra do SVG é o corpo (font-size); a altura do DXF é a da maiúscula (~0,7 do corpo) */
        var te = doc.texto(cT, pt[0], pt[1], fs * altT * xf.s, s, -(mr ? +mr[1] : 0), t.a["text-anchor"] === "middle");
        if (te && t.a["text-anchor"] === "end") te.direita = true;
        continue;
      }
      if (fecha) continue;
      var cam = opts.camadaPor(tag, a), n0 = doc.entidades.length;
      if (tag === "line") {
        if (!cam || !contorno(a)) continue;
        var p1 = P(a.x1, a.y1), p2 = P(a.x2, a.y2), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], rec);
        if (r) { doc.linha(cam, r[0], r[1], r[2], r[3]); tracado(n0, a); }
      } else if (tag === "polyline" || tag === "polygon") {
        var pts = String(a.points || "").trim().split(/\s+/).filter(Boolean).map(function (q) { var v = q.split(","); return [+v[0], +v[1]]; });
        if (pts.length < 2) continue;
        if (cheio(a)) { var cc = opts.camadaPor("fill", a); if (cc && tag === "polygon") sol(cc, pts); }
        if (cam && contorno(a)) linhas(cam, pts, tag === "polygon", a);
      } else if (tag === "rect") {
        var x0 = +a.x, y0 = +a.y, w = +a.width, hh = +a.height, q4 = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + hh], [x0, y0 + hh]];
        if (cheio(a)) { var cr = opts.camadaPor("fill", a); if (cr) sol(cr, q4); }
        if (cam && contorno(a)) linhas(cam, q4, true, a);
      } else if (tag === "circle") {
        var pc = P(a.cx, a.cy), rr = +a.r * xf.s;
        if (cheio(a)) {
          var cf = opts.camadaPor("fill", a);
          if (cf) { var ring = []; for (var k = 0; k < 16; k++) ring.push([pc[0] + rr * Math.cos(k * Math.PI / 8), pc[1] + rr * Math.sin(k * Math.PI / 8)]); doc.hachura(cf, [ring], null, true); }
        }
        if (cam && contorno(a) && dentro(pc[0], pc[1], rec)) { doc.circulo(cam, pc[0], pc[1], rr); tracado(n0, a); }
      } else if (tag === "path") {
        if (!cam || !contorno(a)) continue;
        pathPts(a.d || "").forEach(function (c) { linhas(cam, c.pts, c.fechado, a); });
      }
    }
  }
  function svgParaDxf(svg, doc, xf, opts) {
    opts = opts || {};
    if (typeof opts.camadaPor === "function") return svgPorCamada(svg, doc, xf, opts);
    var pular = opts.pular || {}, pilha = [], re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g, m, txtAberto = null;
    var mapaCam = opts.camadas || {};
    function camadaAtual(cls) {
      var todas = [cls || ""].concat(pilha.map(function (p) { return p.cls; })).join(" ");
      for (var i = 0; i < CAMADA_CLASSE.length; i++) if ((" " + todas + " ").indexOf(" " + CAMADA_CLASSE[i][0] + " ") >= 0) return mapaCam[CAMADA_CLASSE[i][1]] || CAMADA_CLASSE[i][1];
      return mapaCam.ANOT || "ANOT";
    }
    function pulado(cls) {
      var todas = (" " + [cls || ""].concat(pilha.map(function (p) { return p.cls; })).join(" ") + " ");
      for (var k in pular) if (pular[k] && todas.indexOf(" " + k + " ") >= 0) return true;
      return false;
    }
    while ((m = re.exec(svg))) {
      if (m[5] != null) { if (txtAberto) txtAberto.s += m[5]; continue; }
      var fecha = m[1] === "/", tag = m[2].toLowerCase(), a = attrs(m[3] || ""), auto = m[4] === "/";
      if (tag === "defs" || tag === "pattern") { if (!fecha && !auto) pilha.push({ tag: tag, cls: "__defs" }); else if (fecha) pilha.pop(); continue; }
      if (pilha.some(function (p) { return p.cls === "__defs"; })) { continue; }
      if (tag === "g" || tag === "svg") { if (fecha) pilha.pop(); else if (!auto) pilha.push({ tag: tag, cls: a["class"] || "" }); continue; }
      if (tag === "text") {
        if (!fecha) { txtAberto = { a: a, s: "" }; if (auto) txtAberto = null; continue; }
        var t = txtAberto; txtAberto = null; if (!t || pulado(t.a["class"])) continue;
        var tr = t.a.transform || "", mt = /translate\(([-\d.eE]+)[ ,]+([-\d.eE]+)\)/.exec(tr), mr = /rotate\(([-\d.eE]+)\)/.exec(tr), ms = /scale\(([-\d.eE]+)\)/.exec(tr);
        var fs = +(t.a["font-size"] || 100), sc = ms ? +ms[1] : 1, x = mt ? +mt[1] : +(t.a.x || 0), y = mt ? +mt[2] : +(t.a.y || 0);
        var p = xf.pt(x, y);
        if (!dentro(p[0], p[1], opts.recorte)) continue;
        /* a letra do SVG é o corpo (font-size); a altura do DXF é a da maiúscula (~0,7 do corpo) */
        var etx = doc.texto(camadaAtual(t.a["class"]), p[0], p[1], fs * sc * xf.s * 0.7, desesc(t.s), -(mr ? +mr[1] : 0), t.a["text-anchor"] === "middle");
        var ctx2 = corDoStyle(t.a.style); if (etx && ctx2) etx.cor = ctx2;   /* cor da cota/anotação (style="fill:#rrggbb") */
        continue;
      }
      if (fecha) continue;
      var cls = a["class"] || "";
      if (pulado(cls)) continue;
      var cam = camadaAtual(cls);
      /* tracejado do SVG → tipo de linha da ENTIDADE (a bolinha do eixo continua contínua) */
      var da = String(a["stroke-dasharray"] || "").trim().split(/[\s,]+/).filter(Boolean).length;
      var lt = da >= 4 ? "TRACO-PONTO" : da >= 2 ? "TRACEJADO" : null, n0 = doc.entidades.length;
      if (tag === "line") seg(cam, +a.x1, +a.y1, +a.x2, +a.y2);
      else if (tag === "path") pathPts(a.d || "").forEach(function (c) { poli(cam, c.pts, c.fechado); });
      if (lt) for (var ie = n0; ie < doc.entidades.length; ie++) doc.entidades[ie].lt = lt;
      else if (tag === "circle") { var pc = xf.pt(+a.cx, +a.cy); if (dentro(pc[0], pc[1], opts.recorte)) doc.circulo(cam, pc[0], pc[1], +a.r * xf.s); }
      else if (tag === "rect") { var x0 = +a.x, y0 = +a.y, w = +a.width, hh = +a.height; poli(cam, [[x0, y0], [x0 + w, y0], [x0 + w, y0 + hh], [x0, y0 + hh]], true); }
      var cDx = corDoStyle(a.style); if (cDx) for (var ic = n0; ic < doc.entidades.length; ic++) doc.entidades[ic].cor = cDx;
    }
    function seg(cam, x1, y1, x2, y2) {
      var p1 = xf.pt(x1, y1), p2 = xf.pt(x2, y2), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], opts.recorte);
      if (r) doc.linha(cam, r[0], r[1], r[2], r[3]);
    }
    function poli(cam, pts, fechado) {
      var P = pts.map(function (q) { return xf.pt(q[0], q[1]); });
      if (!opts.recorte || P.every(function (q) { return dentro(q[0], q[1], opts.recorte); })) { doc.poli(cam, P, fechado); return; }
      for (var i = 0; i + 1 < P.length + (fechado ? 1 : 0); i++) { var a1 = P[i], b1 = P[(i + 1) % P.length], r = recortarSeg(a1[0], a1[1], b1[0], b1[1], opts.recorte); if (r) doc.linha(cam, r[0], r[1], r[2], r[3]); }
    }
  }

  /* -------------------------------------------------- vista → doc DXF
   * dados = o desenho ANOTADO (Bim2D._anotar) + `linhasIfc` (categoria de
   * cada linha, mesma ordem de `linhas`); estilo = o da vista. opts:
   *   xf    → transformação (padrão: metros, Y para cima)
   *   doc   → acrescenta num doc existente (a folha)
   *   recorte → caixa no espaço de SAÍDA (a do viewport)
   *   estiloCota → nome do estilo de cota a usar
   *   svg   → o SVG do Desenho2D já pronto (senão é gerado aqui) */
  function daVista(dados, estilo, opts) {
    opts = opts || {};
    var D2 = global.Desenho2D; if (!D2) throw new Error("Desenho2D não carregou");
    var e = D2.normEstilo(estilo), pn = penas()[e.pena] || penas().media, k = e.escala / 1000;
    var doc = opts.doc || novoDoc({ unidade: "m" });
    if (!opts.doc) doc.escala = e.escala;
    var xf = opts.xf || { pt: function (x, y) { return [x, -y]; }, s: 1 };
    var pre = opts.prefixo || "";
    var rec = opts.recorte || null;
    var estCota = opts.estiloCota || doc.estiloCota("RA 1-" + e.escala, { escala: k, fator: 1, texto: e.textoCota, casas: e.unidade === "m" ? e.casas : 0, traco: 1.6 });
    var camadasUsadas = doc._usadas = doc._usadas || {};
    function cam(nome, mm, lt) { return doc.camada(pre + nome, mm, lt); }
    /* 1) o que se VÊ além do corte: camada <CAT>-VISTA */
    var lin = dados.linhas || [], lifc = dados.linhasIfc || [];
    lin.forEach(function (l, i) {
      var c = categoria(lifc[i]), n = cam(c[0] + "-VISTA", pn.vista);
      var p1 = xf.pt(l[0], l[1]), p2 = xf.pt(l[2], l[3]), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], rec);
      if (r) doc.linha(n, r[0], r[1], r[2], r[3]);
    });
    /* 2) o que é CORTADO: <CAT>-CORTE (contorno) + HACHURA-<CAT> */
    var hach = {};
    (dados.cortes || []).forEach(function (c) {
      var ct = categoria(c.ifc), mm = ct[1] === "forte" ? pn.corte : ct[1] === "medio" ? pn.marca : pn.vista;
      /* FASES (P10, 14/10/2026): o DEMOLIDO e o TEMPORÁRIO saíam aqui como corte comum (contínuo e hachurado) e de
         novo, tracejados, pela anotação do SVG. Agora vão UMA vez, na camada <CAT>-DEMOLIDO / <CAT>-TEMPORARIO com o
         tipo de linha dela (DEMOLIDO 1,5 / 1 mm; TRACO-PONTO) e sem hachura — como na tela */
      var fz = FASE_DXF[c.fase];
      if (fz) {
        var nf = cam(ct[0] + "-" + fz[0], mm, fz[1]), Pf = (c.pts || []).map(function (q) { return xf.pt(q[0], q[1]); });
        if (Pf.length < 2) return;
        if (!rec || Pf.every(function (q) { return dentro(q[0], q[1], rec); })) { doc.poli(nf, Pf, !!c.fechado); return; }
        for (var j = 0; j + 1 < Pf.length + (c.fechado ? 1 : 0); j++) { var a1 = Pf[j], b1 = Pf[(j + 1) % Pf.length], r1 = recortarSeg(a1[0], a1[1], b1[0], b1[1], rec); if (r1) doc.linha(nf, r1[0], r1[1], r1[2], r1[3]); }
        return;
      }
      var n = cam(ct[0] + "-CORTE", mm);
      var P = (c.pts || []).map(function (q) { return xf.pt(q[0], q[1]); });
      if (P.length < 2) return;
      var todo = !rec || P.every(function (q) { return dentro(q[0], q[1], rec); });
      if (todo) {
        doc.poli(n, P, !!c.fechado);
        if (c.fechado && P.length >= 3 && e.preenchimento !== "vazio") (hach[ct[0]] = hach[ct[0]] || []).push(P);
      } else {
        for (var i = 0; i + 1 < P.length + (c.fechado ? 1 : 0); i++) {
          var a = P[i], b = P[(i + 1) % P.length], r = recortarSeg(a[0], a[1], b[0], b[1], rec);
          if (r) doc.linha(n, r[0], r[1], r[2], r[3]);
        }
      }
    });
    /* PREENCHIMENTO DO CORTE (16/11/2026): o escolhido na vista — sólido (cinza, preto, escuro) ou o padrão (45°, cruzada, tijolo, concreto) */
    var prE = e.preenchimento, solD = { cinza: { cor: "#cfd3d8" }, solido: { cor: "#3a3a3a" }, preto: { aci: 7 } }[prE];
    Object.keys(hach).forEach(function (ct) {
      if (solD) doc.hachura(cam("HACHURA-" + ct, pn.cota), hach[ct], null, true, solD);
      else doc.hachura(cam("HACHURA-" + ct, pn.cota), hach[ct], 1.6 * k * xf.s, false, PADROES_HATCH[prE] ? { padrao: prE } : null);
    });
    /* FASES: as arestas VISTAS da peça demolida/temporária (quando o desenho as traz) */
    Object.keys(dados.linhasFase || {}).forEach(function (st) {
      var fz = FASE_DXF[st]; if (!fz) return;
      var nl = cam("FASE-" + fz[0] + "-VISTA", pn.vista, fz[1]);
      (dados.linhasFase[st] || []).forEach(function (l) { var p1 = xf.pt(l[0], l[1]), p2 = xf.pt(l[2], l[3]), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], rec); if (r) doc.linha(nl, r[0], r[1], r[2], r[3]); });
    });
    /* 2a) ACIMA DO CORTE (js/desenho2d.js Acima): a projeção da peça acima do plano na camada
       <CAT>-ACIMA (EST-VIGA-ACIMA, EST-PERFIL-ACIMA…), pena de vista e tipo de linha PROJECAO na camada —
       o mesmo tracejado da tela; o rótulo vem do SVG (ANOT-ACIMA) */
    if (dados.tipo === "planta") (dados.acima || []).forEach(function (it) {
      if (!it) return;
      var n = cam(categoria(it.t)[0] + "-ACIMA", pn.vista, "PROJECAO");
      if (it.segs) { it.segs.forEach(function (q) { var p1 = xf.pt(q[0], q[1]), p2 = xf.pt(q[2], q[3]), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], rec); if (r) doc.linha(n, r[0], r[1], r[2], r[3]); }); return; }
      var P = (it.pts || []).map(function (q) { return xf.pt(q[0], q[1]); }); if (P.length < 2) return;
      if (!rec || P.every(function (q) { return dentro(q[0], q[1], rec); })) { doc.poli(n, P, P.length > 2); return; }
      for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], r = recortarSeg(a[0], a[1], b[0], b[1], rec); if (r) doc.linha(n, r[0], r[1], r[2], r[3]); }
    });
    /* 2b) PORTA (js/simboloporta.js): a FOLHA aberta em ARQ-PORTA-FOLHA (pena média) e o GIRO
       (ARC de verdade) e a seta do correr em ARQ-PORTA-GIRO (pena fina) — o mesmo desenho da tela */
    (dados.portas || []).forEach(function (sp) {
      if (!sp) return;
      var cF = cam("ARQ-PORTA-FOLHA", pn.marca), cG = cam("ARQ-PORTA-GIRO", pn.vista);
      (sp.folhas || []).forEach(function (f) {
        var P = (f || []).map(function (q) { return xf.pt(q[0], q[1]); }); if (P.length < 2) return;
        if (!rec || P.every(function (q) { return dentro(q[0], q[1], rec); })) { doc.poli(cF, P, true); return; }
        for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], r = recortarSeg(a[0], a[1], b[0], b[1], rec); if (r) doc.linha(cF, r[0], r[1], r[2], r[3]); }
      });
      (sp.arcos || []).forEach(function (a) {
        if (!a || !(a.r > 0) || !a.c || !a.de || !a.ate) return;
        var C = xf.pt(a.c[0], a.c[1]), D = xf.pt(a.de[0], a.de[1]), T = xf.pt(a.ate[0], a.ate[1]), R = a.r * xf.s;
        var aD = Math.atan2(D[1] - C[1], D[0] - C[0]) * 180 / Math.PI, aT = Math.atan2(T[1] - C[1], T[0] - C[0]) * 180 / Math.PI;
        /* o arco curto (≤ 180°) de D a T: anti-horário de D para T se (D − C) × (T − C) > 0, senão de T para D */
        var ccw = ((D[0] - C[0]) * (T[1] - C[1]) - (D[1] - C[1]) * (T[0] - C[0])) > 0, a0 = ccw ? aD : aT, a1 = ccw ? aT : aD;
        if (!rec || (dentro(C[0] - R, C[1] - R, rec) && dentro(C[0] + R, C[1] + R, rec))) { doc.arco(cG, C[0], C[1], R, (a0 + 360) % 360, (a1 + 360) % 360); return; }
        /* o arco que passa da borda do quadro: em cordas, recortadas */
        var s0 = a0 * Math.PI / 180, sw = ((a1 - a0) % 360 + 360) % 360 * Math.PI / 180, nS = 24;
        for (var j = 0; j < nS; j++) {
          var t0 = s0 + sw * j / nS, t1 = s0 + sw * (j + 1) / nS;
          var r2 = recortarSeg(C[0] + R * Math.cos(t0), C[1] + R * Math.sin(t0), C[0] + R * Math.cos(t1), C[1] + R * Math.sin(t1), rec);
          if (r2) doc.linha(cG, r2[0], r2[1], r2[2], r2[3]);
        }
      });
      (sp.linhas || []).forEach(function (l) {
        var p1 = xf.pt(l[0], l[1]), p2 = xf.pt(l[2], l[3]), r = recortarSeg(p1[0], p1[1], p2[0], p2[1], rec);
        if (r) doc.linha(cG, r[0], r[1], r[2], r[3]);
      });
    });
    /* 3) COTAS como DIMENSION (mede de novo no CAD) */
    var cCota = cam("ANOT-COTA", pn.cota);
    D2.cotas(dados, e).forEach(function (c) {
      var p1, p2, pl, ang, lin2;
      if (c.eixo === "h") { p1 = xf.pt(c.a, c.base); p2 = xf.pt(c.b, c.base); pl = xf.pt(c.a, c.linha); }
      else { p1 = xf.pt(c.base, c.a); p2 = xf.pt(c.base, c.b); pl = xf.pt(c.linha, c.a); }
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      ang = Math.abs(dx) >= Math.abs(dy) ? 0 : 90;
      if (rec && !(dentro(p1[0], p1[1], rec) && dentro(p2[0], p2[1], rec))) return;
      lin2 = grafCota(p1, p2, pl, ang, c.valor, e, k * xf.s, cCota);
      if (e.corCotas) lin2.forEach(function (q) { q.cor = e.corCotas; });   /* COR DAS COTAS da vista: o desenho da cota e a DIMENSION */
      var dmE = doc.cota(cCota, estCota, p1, p2, pl, ang, c.valor * xf.s, D2.fmtMedida(c.valor, e), lin2); if (dmE && e.corCotas) dmE.cor = e.corCotas;   /* 42 = o medido no espaço do arquivo (na folha, mm de papel) */
    });
    if (dados.tipo === "planta" && e.cotas) (dados.cotasModelo || []).forEach(function (c) {
      var p1 = xf.pt(c.a[0], c.a[1]), p2 = xf.pt(c.b[0], c.b[1]);
      var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.sqrt(dx * dx + dy * dy); if (!(L > 1e-6)) return;
      var off = +c.off || 0, nx = dy / L, ny = -dx / L, pl = xf.pt(c.a[0] + nx * off, c.a[1] + ny * off);
      var ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
      if (rec && !(dentro(p1[0], p1[1], rec) && dentro(p2[0], p2[1], rec))) return;
      var v = c.valor != null ? c.valor : L;
      var gcM = grafCota(p1, p2, pl, ang, v, e, k * xf.s, cCota); if (e.corCotas) gcM.forEach(function (q) { q.cor = e.corCotas; });
      var dmM = doc.cota(cCota, estCota, p1, p2, pl, ang, v * xf.s, D2.fmtMedida(v, e), gcM); if (dmM && e.corCotas) dmM.cor = e.corCotas;
    });
    /* 4) o resto da anotação: do SVG da tela */
    var svg = opts.svg || D2.svg(dados, e, { titulo: opts.titulo || "" }).svg;
    var mapa = {}; CAMADA_CLASSE.forEach(function (cc) { mapa[cc[1]] = doc.especificar(pre + cc[1], cc[1] === "ANOT-TITULO" || cc[1] === "ANOT-EIXO" || cc[1] === "ANOT-MARCA-CORTE" ? pn.marca : cc[1] === "CAD-VINCULO" ? pn.vista : pn.cota); });
    mapa.ANOT = doc.especificar(pre + "ANOT", pn.cota);
    svgParaDxf(svg, doc, xf, { recorte: rec, camadas: mapa, pular: { "d2-papel": 1, "d2-vista": 1, "d2-corte": 1, "d2-porta": 1, "d2-cota": 1, "d2-amb-alvo": 1, "d2-amb-cores": 1, "d2-amb-sel-l": 1, "d2-acima-l": 1, "d2-fase-demolido": 1, "d2-fase-temporario": 1 } });
    doc.camadasUsadas = Object.keys(camadasUsadas);
    return doc;
  }
  /* o desenho da cota (bloco *D do DIMENSION): chamadas, linha, traços oblíquos e o texto */
  function grafCota(p1, p2, pl, ang, valor, e, k, cam) {
    var a = ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    function proj(p) { var t = (p[0] - pl[0]) * ux + (p[1] - pl[1]) * uy; return [pl[0] + ux * t, pl[1] + uy * t]; }
    var q1 = proj(p1), q2 = proj(p2), out = [], ext = 2 * k, gap = 1.5 * k, tk = 1.6 * k;
    [[p1, q1], [p2, q2]].forEach(function (pq) {
      var dx = pq[1][0] - pq[0][0], dy = pq[1][1] - pq[0][1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      out.push({ t: "LINE", camada: cam, p: [pq[0][0] + dx / L * gap, pq[0][1] + dy / L * gap, pq[1][0] + dx / L * ext, pq[1][1] + dy / L * ext] });
    });
    out.push({ t: "LINE", camada: cam, p: [q1[0] - ux * ext, q1[1] - uy * ext, q2[0] + ux * ext, q2[1] + uy * ext] });
    [q1, q2].forEach(function (q) { out.push({ t: "LINE", camada: cam, p: [q[0] - (ux + nx) * tk * 0.5, q[1] - (uy + ny) * tk * 0.5, q[0] + (ux + nx) * tk * 0.5, q[1] + (uy + ny) * tk * 0.5] }); });
    var mx = (q1[0] + q2[0]) / 2 + nx * 0.8 * k, my = (q1[1] + q2[1]) / 2 + ny * 0.8 * k, ta = ang; if (ta > 90 || ta <= -90) ta += 180;
    var D2 = global.Desenho2D;
    out.push({ t: "TEXT", camada: cam, x: mx, y: my, h: e.textoCota * k * 0.7, s: D2 ? D2.fmtMedida(valor, e) : String(valor), ang: ta, centro: true });
    return out;
  }


  /* ---------------------------------------------- HATCH → SOLID / LINE (só para o caminho do DWG)
   * O AutoCAD não lê as HATCH que o dxf2dwg do LibreDWG grava ("short handle stream": ssget HATCH = 0 no DWG) e as paredes ficam sem preenchimento.
   * Então o DXF que vai ao conversor leva a hachura já em geometria, na MESMA camada (cor e espessura da camada):
   *   · sólida → SOLIDs (trapézios por faixas horizontais, regra par-ímpar: contornos internos viram FUROS; exato, sem arco: os laços já são polígonos);
   *   · ANSI31 → LINEs a 45° recortadas pelo contorno (espaçamento perpendicular = e.espaco, passando pela origem como o padrão do AutoCAD; furos respeitados).
   * O DXF que o app entrega continua com HATCH de verdade. */
  function solidosDe(lacos, camada) {
    var arestas = [], ys = [];
    lacos.forEach(function (pts) { for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; if (Math.abs(a[1] - b[1]) < 1e-12) continue; arestas.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]]); } pts.forEach(function (q) { ys.push(q[1]); }); });
    ys.sort(function (a, b) { return a - b; });
    var u = []; ys.forEach(function (y) { if (!u.length || y - u[u.length - 1] > 1e-9) u.push(y); });
    var out = [];
    function xEm(a, y) { return a[0] + (a[2] - a[0]) * (y - a[1]) / (a[3] - a[1]); }
    for (var k = 0; k + 1 < u.length; k++) {
      var y0 = u[k], y1 = u[k + 1], ym = (y0 + y1) / 2, cr = [];
      arestas.forEach(function (a) { if (a[1] <= ym && a[3] > ym) cr.push({ a: a, xm: xEm(a, ym) }); });
      cr.sort(function (p, q) { return p.xm - q.xm; });
      for (var j = 0; j + 1 < cr.length; j += 2) {
        var A = cr[j].a, Bq = cr[j + 1].a, xa0 = xEm(A, y0), xa1 = xEm(A, y1), xb0 = xEm(Bq, y0), xb1 = xEm(Bq, y1);
        out.push({ t: "SOLID", camada: camada, q: [[xa0, y0], [xb0, y0], [xa1, y1], [xb1, y1]] });
      }
    }
    return out;
  }
  function linhasDe(lacos, camada, espaco) {
    var xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity, arestas = [];
    lacos.forEach(function (pts) { for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; arestas.push([a[0], a[1], b[0], b[1]]); if (a[0] < xa) xa = a[0]; if (a[0] > xb) xb = a[0]; if (a[1] < ya) ya = a[1]; if (a[1] > yb) yb = a[1]; } });
    if (!isFinite(xa)) return [];
    var d = (+espaco || 3.175) / Math.SQRT2, passo = 2 * d, i0 = Math.ceil((ya - xb) / passo), i1 = Math.floor((yb - xa) / passo);
    if (i1 - i0 > 4000) { passo = (yb - xa - (ya - xb)) / 4000; i0 = Math.ceil((ya - xb) / passo); i1 = Math.floor((yb - xa) / passo); }   /* trava de segurança: nunca milhares de linhas por hachura */
    var out = [];
    for (var i = i0; i <= i1; i++) {
      var c = passo * i, xs = [];
      arestas.forEach(function (a) { var f1 = a[1] - a[0] - c, f2 = a[3] - a[2] - c;   /* f = (y − x) − c: a linha y = x + c */ if ((f1 < 0 && f2 >= 0) || (f1 >= 0 && f2 < 0)) { var tt = f1 / (f1 - f2); xs.push(a[0] + tt * (a[2] - a[0])); } });
      xs.sort(function (p, q) { return p - q; });
      for (var j = 0; j + 1 < xs.length; j += 2) if (xs[j + 1] - xs[j] > 1e-9) out.push({ t: "LINE", camada: camada, p: [xs[j], xs[j] + c, xs[j + 1], xs[j + 1] + c] });
    }
    return out;
  }
  /* FAMÍLIA de um padrão (PADROES_HATCH) em LINEs recortadas pelo contorno (par-ímpar, furos respeitados): ângulo, deslocamento entre linhas (dyl × E) e tracejado com a fase
     de cada linha (dxl × E por linha) — o mesmo desenho do HATCH nativo (tijolo e concreto: juntas alternadas e pontos). Ponto (traço 0) = LINE curtíssima. */
  function linhasFamilia(lacos, camada, fa, E) {
    var an = fa.a * Math.PI / 180, ux = Math.cos(an), uy = Math.sin(an), nx = -uy, ny = ux, arestas = [], cmin = Infinity, cmax = -Infinity, out = [];
    lacos.forEach(function (pts) { for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; arestas.push([a[0], a[1], b[0], b[1]]); var cc = nx * a[0] + ny * a[1]; if (cc < cmin) cmin = cc; if (cc > cmax) cmax = cc; } });
    var dy = fa.dyl * E, dx = fa.dxl * E; if (!isFinite(cmin) || !(Math.abs(dy) > 1e-12)) return [];
    var i0 = Math.ceil(cmin / dy), i1 = Math.floor(cmax / dy); if (dy < 0) { var tt0 = i0; i0 = Math.ceil(cmax / dy); i1 = Math.floor(cmin / dy); void tt0; }
    if (i1 - i0 > 4000) return [];   /* trava de segurança */
    var dash = (fa.dash || []).map(function (v) { return v * E; }), P = 0; dash.forEach(function (v) { P += Math.abs(v); });
    for (var i = i0; i <= i1; i++) {
      var c0 = dy * i, t0 = dx * i, ts = [];
      arestas.forEach(function (a) { var f1 = nx * a[0] + ny * a[1] - c0, f2 = nx * a[2] + ny * a[3] - c0; if ((f1 < 0 && f2 >= 0) || (f1 >= 0 && f2 < 0)) { var q = f1 / (f1 - f2); ts.push(ux * (a[0] + q * (a[2] - a[0])) + uy * (a[1] + q * (a[3] - a[1]))); } });
      ts.sort(function (p, q) { return p - q; });
      for (var j = 0; j + 1 < ts.length; j += 2) {
        var s0 = ts[j], e0 = ts[j + 1];
        function seg(ta, tb) { if (tb - ta < 1e-9 && !(fa.dash && tb === ta)) return; out.push({ t: "LINE", camada: camada, p: [nx * c0 + ux * ta, ny * c0 + uy * ta, nx * c0 + ux * tb, ny * c0 + uy * tb] }); }
        if (!(P > 1e-9)) { seg(s0, e0); continue; }
        var k0 = Math.floor((s0 - t0) / P) - 1, n = 0;
        for (var k = k0; n < 100000; k++, n++) {
          var base = t0 + k * P; if (base > e0) break;
          var pos = base;
          for (var d = 0; d < dash.length; d++) {
            var len = Math.abs(dash[d]);
            if (dash[d] >= 0) { var ta = Math.max(pos, s0), tb = Math.min(pos + len, e0); if (len === 0) { if (pos >= s0 && pos <= e0) seg(pos, pos + 0.05 * E); } else if (tb > ta) seg(ta, tb); }
            pos += len;
          }
        }
      }
    }
    return out;
  }
  /* TEXT centrado/à direita: no DWG o AutoCAD usa o ponto de inserção GRAVADO como o começo do texto (o alinhamento só vale depois de editar) e o dxf2dwg ainda perde
     o ponto de alinhamento: o texto sairia alinhado à esquerda no centro. Então, no caminho do DWG, vira texto à esquerda com o começo calculado (largura Helvetica = Arial;
     RA-VERDANA ×1,14; a altura do TEXT é a das maiúsculas: corpo = h ÷ 0,716). A diferença para o centro de verdade é de poucos por cento da largura. */
  function textoAEsquerda(e) {
    if (e.t !== "TEXT" || (!e.centro && !e.direita)) return e;
    var SP = global.SvgPdf; if (!SP && typeof require === "function") { try { SP = require("./svgpdf.js"); } catch (e0) { SP = null; } }
    var w = SP && SP.largura ? SP.largura(String(e.s == null ? "" : e.s), e.h / 0.716, false) : String(e.s == null ? "" : e.s).length * e.h * 0.85;
    if (e.est === "RA-VERDANA") w *= 1.14;
    var f = e.direita ? 1 : 0.5, a = (+e.ang || 0) * Math.PI / 180, q = {};
    Object.keys(e).forEach(function (k) { q[k] = e[k]; });
    q.x = e.x - f * w * Math.cos(a); q.y = e.y - f * w * Math.sin(a); q.centro = false; q.direita = false;
    return q;
  }
  /* o doc que vai ao dxf2dwg: texto alinhado à esquerda (sempre) e, SÓ com opts.hachuraGeometria, a hachura em SOLID/LINE. Desligada por padrão: a HATCH nativa plota igual
     ao DXF com o $FILLMODE = 1 e é editável no AutoCAD; a conversão fica como reserva (tools/test-bimdxf-hachura-dwg.js). */
  function paraDwg(doc, opts) {
    var geo = !!(opts && opts.hachuraGeometria);
    function conv(lista) {
      var out = [];
      (lista || []).forEach(function (e) {
        if (e.t === "TEXT") { out.push(textoAEsquerda(e)); return; }
        if (e.t !== "HATCH" || !geo) { out.push(e); return; }
        var g;
        if (!e.solido && e.padrao && PADROES_HATCH[e.padrao]) {   /* cruzada, tijolo e concreto: cada família do padrão vira LINEs (como o 45°) */
          g = []; PADROES_HATCH[e.padrao].fam.forEach(function (fa) { linhasFamilia(e.lacos, e.camada, fa, +e.espaco || 3.175).forEach(function (q) { g.push(q); }); });
        } else g = e.solido ? solidosDe(e.lacos, e.camada) : linhasDe(e.lacos, e.camada, e.espaco);
        g.forEach(function (q) { if (e.cor) q.cor = e.cor; if (e.aci != null) q.aci = e.aci; });
        for (var i = 0; i < g.length; i++) out.push(g[i]);
      });
      return out;
    }
    var c = {}; Object.keys(doc).forEach(function (k) { c[k] = doc[k]; });
    c.entidades = conv(doc.entidades);
    c.blocos = (doc.blocos || []).map(function (b) { var q = {}; Object.keys(b).forEach(function (k) { q[k] = b[k]; }); q.ents = conv(b.ents); return q; });
    c.layouts = (doc.layouts || []).map(function (L) { var q = {}; Object.keys(L).forEach(function (k) { q[k] = L[k]; }); q.ents = conv(L.ents); return q; });
    return c;
  }
  function hachurasEmGeometria(doc) { return paraDwg(doc, { hachuraGeometria: true }); }

  /* ---------------------------------------------- folha → doc DXF (mm)
   * vps = { <vistaId>: { dados, estilo, vb:{x,y,w,h}, svg?, titulo } }
   *   (o desenho de cada viewport, resolvido pela tela). */
  function daFolha(pr, folha, geo, vps, opts) {
    opts = opts || {};
    var P = geo.papel, doc = novoDoc({ unidade: "mm" }), PR = global.Prancha, pn = penas().media;
    doc.escala = 1;
    function Y(y) { return P.h - y; }
    var cMold = doc.camada("FOLHA-MOLDURA", 0.70), cCar = doc.camada("FOLHA-CARIMBO", 0.25), cTx = doc.camada("FOLHA-CARIMBO-TEXTO", 0.18), cPap = doc.camada("FOLHA-PAPEL", 0.13);
    function ret(c, x, y, w, h) { doc.poli(c, [[x, Y(y)], [x + w, Y(y)], [x + w, Y(y + h)], [x, Y(y + h)]], true); }
    ret(cPap, 0, 0, P.w, P.h);
    ret(cMold, geo.moldura.x, geo.moldura.y, geo.moldura.w, geo.moldura.h);
    /* viewports */
    var cTit = doc.camada("FOLHA-TITULO-VISTA", pn.marca), cTitT = doc.camada("FOLHA-TITULO-VISTA-TEXTO", pn.cota);
    (folha.blocos || []).forEach(function (b) {
      if (b.tipo !== "viewport") return;
      var v = vps && ((b.escalaPropria && vps[b.vistaId + "@" + b.escala]) || vps[b.vistaId]);   /* a cópia com escala própria */
      if (!v || !v.dados) { doc.avisos.push("vista " + (b.tituloVista || b.vistaId) + " sem desenho"); return; }
      var esc = +b.escala || 50, f = 1000 / esc, vb = b.recorte ? { x: b.recorte.x0, y: b.recorte.y0, w: b.recorte.x1 - b.recorte.x0, h: b.recorte.y1 - b.recorte.y0 } : v.vb;
      /* o desenho cabe no quadro centrado (preserveAspectRatio meet, como na tela) */
      var s = Math.min(b.w / (vb.w * f), b.h / (vb.h * f)), F = f * s, ox = b.x + (b.w - vb.w * F) / 2, oy = b.y + (b.h - vb.h * F) / 2;
      var xf = { pt: function (x, y) { return [ox + (x - vb.x) * F, Y(oy + (y - vb.y) * F)]; }, s: F };
      var est = {}; Object.keys(v.estilo || {}).forEach(function (kk) { est[kk] = v.estilo[kk]; }); est.escala = esc; est.titulo = false;
      var e = global.Desenho2D.normEstilo(est);
      var nomeEst = doc.estiloCota("RA folha 1-" + esc, { escala: 1, fator: 1 / F, texto: e.textoCota, casas: e.unidade === "m" ? e.casas : 0, traco: 1.6 });
      /* o quadro recorta o desenho — e a moldura recorta o quadro (vista maior que a folha sai
         cortada na borda, como no PDF; a tela já avisou que não cabe) */
      var M = geo.moldura, rx0 = Math.max(b.x, M.x), rx1 = Math.min(b.x + b.w, M.x + M.w), ry0 = Math.max(b.y, M.y), ry1 = Math.min(b.y + b.h, M.y + M.h);
      if (rx1 - rx0 < 1 || ry1 - ry0 < 1) { doc.avisos.push("vista " + (b.tituloVista || b.vistaId) + " fora da folha"); return; }
      daVista(v.dados, e, { doc: doc, xf: xf, recorte: { x0: rx0, x1: rx1, y0: Y(ry1), y1: Y(ry0) }, estiloCota: nomeEst, svg: v.svgSemTitulo });
      /* título de vista: número de detalhe no círculo, nome, linha e escala */
      if (b.mostrarTitulo !== false && b.y + b.h + 10 <= geo.moldura.y + geo.moldura.h) {   /* título fora da folha não vai (no PDF ele também some) */
        var ty = b.y + b.h + 6, r = 4;
        doc.circulo(cTit, b.x + r, Y(ty), r);
        doc.texto(cTitT, b.x + r, Y(ty) - 1.2, 2.2, b.numeroDetalhe || "", 0, true);
        var nome = String(b.tituloVista || "").toUpperCase();
        doc.texto(cTitT, b.x + 2 * r + 2, Y(ty) + 0.6, 3.5 * 0.7, nome, 0, false);
        doc.linha(cTit, b.x + 2 * r, Y(ty), b.x + Math.max(2 * r + 40, Math.min(b.w, 2 * r + 4 + nome.length * 2.1)), Y(ty));
        doc.texto(cTitT, b.x + 2 * r + 2, Y(ty) - 3.6, 2.5 * 0.7, "ESC 1:" + esc, 0, false);
      }
    });
    fimDaFolha(doc, pr, folha, geo, opts, Y, cCar, cTx, cMold);
    return doc;
  }
  /* ---------------------------------------------- folha → CAD ÚNICO (layout + MODEL em escala real)
   * O mesmo `daFolha`, mas no formato que o AutoCAD espera (o do js/arqcad.js): cada vista vai ao MODEL em METROS (escala real), lado a lado, e a folha vira um LAYOUT
   * (paperspace, mm de papel) com moldura, carimbo, coluna de notas, títulos de vista e UMA VIEWPORT TRAVADA por vista, na escala dela (a do bloco da folha).
   * doc = o documento ÚNICO (vários layouts); opts.modelo = o cursor do MODEL ({ x, topo, alturaLinha } — o chamador guarda entre as folhas);
   * opts.papelNome(w, h) / opts.ctbNome = a página de cada layout. Devolve { nome, w, h, papel, viewports: [{ vista, escala, w, h, altura, mx, my }] }.
   * ⚠ A vista que não cabe no quadro (o PDF a encolhe para caber) sai na escala EXATA do bloco; a viewport recorta o excedente (aviso em doc.avisos). */
  function daFolhaCad(doc, pr, folha, geo, vps, opts) {
    opts = opts || {};
    var P = geo.papel, pn = penas().media, M = geo.moldura, cur = opts.modelo || (opts.modelo = { x: 0, topo: 0, altLinha: 0 });
    function Y(y) { return P.h - y; }
    var nome = String(opts.nome || folha.numero || ("F" + folha.n));
    var L = doc.layout(nome, P.w, P.h, { papel: opts.papelNome ? opts.papelNome(P.w, P.h) : "", ctb: opts.ctbNome, camadaVp: "DEFPOINTS" });
    var info = { nome: nome, w: P.w, h: P.h, papel: L.opts.papel, viewports: [], formato: folha.formato || "", titulo: folha.conteudo || "" };
    var cMold = doc.camada("FOLHA-MOLDURA", 0.70), cCar = doc.camada("FOLHA-CARIMBO", 0.25), cTx = doc.camada("FOLHA-CARIMBO-TEXTO", 0.18);
    var cTit = doc.camada("FOLHA-TITULO-VISTA", pn.marca), cTitT = doc.camada("FOLHA-TITULO-VISTA-TEXTO", pn.cota);
    var vistas = [];   /* o que cada viewport mostra, para o chão do MODEL e para o layout */
    (folha.blocos || []).forEach(function (b) {
      if (b.tipo !== "viewport") return;
      var v = vps && ((b.escalaPropria && vps[b.vistaId + "@" + b.escala]) || vps[b.vistaId]);
      if (!v || !v.dados) { doc.avisos.push("vista " + (b.tituloVista || b.vistaId) + " sem desenho"); return; }
      var esc = +b.escala || 50, f = 1000 / esc, vb = b.recorte ? { x: b.recorte.x0, y: b.recorte.y0, w: b.recorte.x1 - b.recorte.x0, h: b.recorte.y1 - b.recorte.y0 } : v.vb;
      var rx0 = Math.max(b.x, M.x), rx1 = Math.min(b.x + b.w, M.x + M.w), ry0 = Math.max(b.y, M.y), ry1 = Math.min(b.y + b.h, M.y + M.h);
      if (rx1 - rx0 < 1 || ry1 - ry0 < 1) { doc.avisos.push("vista " + (b.tituloVista || b.vistaId) + " fora da folha"); return; }
      vistas.push({ b: b, v: v, esc: esc, f: f, vb: vb, caixa: [rx0, ry0, rx1, ry1] });
    });
    /* o MODEL: as vistas desta folha numa linha, a linha abaixo da anterior (nunca uma por cima da outra: cada vista tem o seu retângulo) */
    var x0 = cur.x = 0, topo = cur.topo, altMax = 0, GAP = 5;
    vistas.forEach(function (q) {
      q.mx0 = x0; q.my0 = topo - q.vb.h; x0 += q.vb.w + GAP; if (q.vb.h > altMax) altMax = q.vb.h;
      var est = {}; Object.keys(q.v.estilo || {}).forEach(function (kk) { est[kk] = q.v.estilo[kk]; }); est.escala = q.esc; est.titulo = false;
      var e = global.Desenho2D.normEstilo(est);
      var xf = { pt: function (x, y) { return [q.mx0 + (x - q.vb.x), q.my0 + (q.vb.y + q.vb.h - y)]; }, s: 1 };
      var rec = { x0: q.mx0, x1: q.mx0 + q.vb.w, y0: q.my0, y1: q.my0 + q.vb.h };
      var hMod = doc.entidades.length;
      daVista(q.v.dados, e, { doc: doc, xf: xf, recorte: rec, svg: q.v.svgSemTitulo });
      /* o rótulo do retângulo no MODEL (camada que o CAD nunca plota) */
      doc.texto(doc.camada("DEFPOINTS"), q.mx0, q.my0 + q.vb.h + 0.6, Math.max(0.3, 4 * q.esc / 1000), nome + " | " + (q.b.tituloVista || q.b.vistaId) + " | 1:" + q.esc, 0, false);
      doc.poli("DEFPOINTS", [[rec.x0 - 0.3, rec.y0 - 0.3], [rec.x1 + 0.3, rec.y0 - 0.3], [rec.x1 + 0.3, rec.y1 + 0.3], [rec.x0 - 0.3, rec.y1 + 0.3]], true);
      q.nEnts = doc.entidades.length - hMod;
    });
    cur.topo = topo - (altMax || 0) - (vistas.length ? 14 : 0);
    /* o layout: moldura, títulos, o resto da folha e as viewports (travadas, na escala de cada bloco) */
    doc.paper(L, function () {
      doc.poli(cMold, [[M.x, Y(M.y)], [M.x + M.w, Y(M.y)], [M.x + M.w, Y(M.y + M.h)], [M.x, Y(M.y + M.h)]], true);
      vistas.forEach(function (q) {
        var b = q.b;
        if (b.mostrarTitulo !== false && b.y + b.h + 10 <= M.y + M.h) {
          var ty = b.y + b.h + 6, r = 4;
          doc.circulo(cTit, b.x + r, Y(ty), r);
          doc.texto(cTitT, b.x + r, Y(ty) - 1.2, 2.2, b.numeroDetalhe || "", 0, true);
          var nm = String(b.tituloVista || "").toUpperCase();
          doc.texto(cTitT, b.x + 2 * r + 2, Y(ty) + 0.6, 3.5 * 0.7, nm, 0, false);
          doc.linha(cTit, b.x + 2 * r, Y(ty), b.x + Math.max(2 * r + 40, Math.min(b.w, 2 * r + 4 + nm.length * 2.1)), Y(ty));
          doc.texto(cTitT, b.x + 2 * r + 2, Y(ty) - 3.6, 2.5 * 0.7, "ESC 1:" + q.esc, 0, false);
        }
      });
      fimDaFolha(doc, pr, folha, geo, opts, Y, cCar, cTx, cMold);
    });
    vistas.forEach(function (q) {
      var b = q.b, F = q.f, ox = b.x + (b.w - q.vb.w * F) / 2, oy = b.y + (b.h - q.vb.h * F) / 2;   /* o desenho de 1:esc, centrado no quadro (como na tela) */
      var vx0 = Math.max(q.caixa[0], ox), vx1 = Math.min(q.caixa[2], ox + q.vb.w * F), vy0 = Math.max(q.caixa[1], oy), vy1 = Math.min(q.caixa[3], oy + q.vb.h * F);
      if (vx1 - vx0 < 1 || vy1 - vy0 < 1) { doc.avisos.push("vista " + (b.tituloVista || b.vistaId) + " sem área visível na folha"); return; }
      if (b.w < q.vb.w * F - 0.5 || b.h < q.vb.h * F - 0.5) doc.avisos.push(nome + ": a vista \"" + (b.tituloVista || b.vistaId) + "\" não cabe no quadro em 1:" + q.esc + " (a viewport recorta o excedente)");
      var cxP = (vx0 + vx1) / 2, cyP = (vy0 + vy1) / 2, hv = vy1 - vy0;
      var mx = q.mx0 + (cxP - ox) / F, my = q.my0 + q.vb.h - (cyP - oy) / F;
      var vp = doc.viewport(L, cxP, Y(cyP), vx1 - vx0, hv, mx, my, hv * q.esc / 1000, { travada: true });
      vp.id = info.viewports.length + 2;
      info.viewports.push({ vista: b.tituloVista || b.vistaId, escala: q.esc, w: vx1 - vx0, h: hv, altura: hv * q.esc / 1000, mx: mx, my: my, entidades: q.nEnts });
    });
    return info;
  }
  /* o que a folha leva além das viewports (blocos de texto/tabela/imagem, coluna de notas e carimbo) — comum ao DXF da folha e ao CAD único (daFolhaCad) */
  function fimDaFolha(doc, pr, folha, geo, opts, Y, cCar, cTx, cMold) {
    var PR = global.Prancha;
    /* outros blocos: o contorno e o título (imagem/foto não vai para o DXF) */
    (folha.blocos || []).forEach(function (b) {
      if (b.tipo === "viewport") return;
      if (b.tipo === "texto") { (b.linhas || []).forEach(function (l, i) { doc.texto(cTx, b.x, Y(b.y + 3 + i * 3.6), 2.0, l, 0, false); }); return; }
      if (b.tipo === "tabela") { tabelaDxf(doc, cCar, cTx, b, Y); return; }
      ret(cCar, b.x, b.y, b.w, b.h);
      doc.texto(cTx, b.x + b.w / 2, Y(b.y + b.h / 2), 2.2, (b.tipo === "vista" ? "Vista 3D: " : "Imagem: ") + (b.titulo || "") + " (no PDF)", 0, true);
      if (b.titulo) doc.texto(cTx, b.x, Y(b.y + b.h + 5), 3.0, b.titulo, 0, false);
    });
    /* coluna e carimbo */
    var col = geo.coluna, car = geo.carimbo;
    if (!geo.semColuna) doc.linha(cMold, col.x, Y(col.y), col.x, Y(col.y + col.h));
    var yy = col.y + 6;
    (pr.coluna || []).forEach(function (sx) {
      doc.texto(cTx, col.x + 3, Y(yy), 2.2, sx.titulo, 0, false); yy += 4.2;
      (sx.itens || []).forEach(function (it) { if (yy < car.y - 4) { doc.texto(cTx, col.x + 5, Y(yy), 1.8, "- " + it, 0, false); yy += 3.4; } });
      yy += 2;
    });
    if (PR && PR.modeloCarimbo && PR.modeloCarimbo(pr) === "RA" && PR.carimboRA) carimboRADxf(doc, pr, folha, geo, opts, Y);
    else carimboDxf(doc, cMold, cCar, cTx, pr, folha, geo, opts.projeto, Y);
  }
  function tabelaDxf(doc, cL, cT, b, Y) {
    var cab = b.cabecalho || [], lin = b.linhas || [], nc = Math.max(1, cab.length || (lin[0] || []).length), lh = 5, cw = b.w / nc;
    var rows = [cab].concat(lin);
    rows.forEach(function (r, i) {
      var y0 = b.y + i * lh;
      doc.poli(cL, [[b.x, Y(y0)], [b.x + b.w, Y(y0)], [b.x + b.w, Y(y0 + lh)], [b.x, Y(y0 + lh)]], true);
      (r || []).forEach(function (c, j) { if (j) doc.linha(cL, b.x + j * cw, Y(y0), b.x + j * cw, Y(y0 + lh)); doc.texto(cT, b.x + j * cw + cw / 2, Y(y0 + lh - 1.5), 1.8, c, 0, true); });
    });
    if (b.titulo) doc.texto(cT, b.x, Y(b.y - 2), 2.5, b.titulo, 0, false);
  }
  /* o carimbo RA, modelo "RA": as MESMAS primitivas da tela (js/prancha.js carimboRA), nas layers
     do gabarito (RA-CARIMBO-MOLDURA/LINHA/TEXTO/ROTULO/LOGO/DESTAQUE, cor e pena de lá — o
     pos_dwg_ra.py não mexe nelas). O logo é imagem: no DXF fica a marca [LOGO] na caixa dele
     (o DXF é um arquivo só; a imagem vai no PDF). opts.empresa = o cadastro da conta. */
  function carimboRADxf(doc, pr, folha, geo, opts, Y) {
    var PR = global.Prancha, c = pr.carimbo || {};
    var nLogos = (c.logos || []).length || (opts.logo ? 1 : 0);
    var L = PR.carimboRA(pr, folha, opts.projeto, opts.empresa, geo, { logos: nLogos }), cam = PR.CAMADAS_CARIMBO_RA;
    Object.keys(cam).forEach(function (nome) { doc.especificar(nome, cam[nome][1], null, cam[nome][0]); });
    function px(x) { return L.x + x; }
    function py(y) { return Y(L.y + y); }
    L.retangulos.forEach(function (r) { doc.poli(r.camada, [[px(r.x), py(r.y)], [px(r.x + r.w), py(r.y)], [px(r.x + r.w), py(r.y + r.h)], [px(r.x), py(r.y + r.h)]], true); });
    L.linhas.forEach(function (l) { doc.linha(l.camada, px(l.x1), py(l.y1), px(l.x2), py(l.y2)); });
    L.logos.forEach(function (b) { doc.texto("RA-CARIMBO-LOGO", px(b.x + b.w / 2), py(b.y + b.h / 2) - 1.25 * L.k, 2.5 * L.k, "[LOGO]", 0, true); });
    L.textos.forEach(function (t) { doc.texto(t.camada, px(t.x), py(t.y), t.h, t.s, 0, t.al === "C"); });
    return L;
  }
  /* o carimbo "Simples" (mesmos campos da tela: js/pranchaui.js), em faixas */
  function carimboDxf(doc, cMold, cL, cT, pr, folha, geo, projeto, Y) {
    var k = geo.carimbo, PR = global.Prancha, c = pr.carimbo || {};
    var pm = PR && PR.parametrosFolha ? PR.mapaParametros(pr, folha, projeto) : {};
    function v(bip, pad) { return pm[bip] != null && pm[bip] !== "" ? pm[bip] : (pad || ""); }
    doc.poli(cMold, [[k.x, Y(k.y)], [k.x + k.w, Y(k.y)], [k.x + k.w, Y(k.y + k.h)], [k.x, Y(k.y + k.h)]], true);
    var revs = PR && PR.revisoesNaFolha ? PR.revisoesNaFolha(folha, projeto).slice(-3).map(function (r) { return [r.numero, r.descricao, r.data]; }) : [];
    if (!revs.length) revs = (c.revisoes || []).slice(-3);
    var y = k.y, H = k.h, rh = Math.max(3.5, H * 0.045);
    function faixa(h) { var y0 = y; y += h; doc.linha(cL, k.x, Y(y), k.x + k.w, Y(y)); return y0; }
    function rot(x, y0, s) { doc.texto(cT, x, Y(y0 + 2.2), 1.4, s, 0, false); }
    function val(x, y0, s, h, centro) { doc.texto(cT, x, Y(y0 + 2.2 + (h || 2.2) + 0.8), h || 2.2, s, 0, !!centro); }
    if (revs.length) {
      var y0r = faixa(rh); doc.texto(cT, k.x + 2, Y(y0r + rh - 1), 1.6, "REV", 0, false); doc.texto(cT, k.x + k.w * 0.12, Y(y0r + rh - 1), 1.6, "DESCRIÇÃO", 0, false); doc.texto(cT, k.x + k.w * 0.82, Y(y0r + rh - 1), 1.6, "DATA", 0, false);
      revs.forEach(function (r) { var yr = faixa(rh); doc.texto(cT, k.x + 2, Y(yr + rh - 1), 1.6, r[0], 0, false); doc.texto(cT, k.x + k.w * 0.12, Y(yr + rh - 1), 1.6, r[1], 0, false); doc.texto(cT, k.x + k.w * 0.82, Y(yr + rh - 1), 1.6, r[2], 0, false); });
    }
    var yl = faixa(H * 0.16); doc.texto(cT, k.x + k.w / 2, Y(yl + H * 0.1), 3.2, c.empresa || "", 0, true);
    var yo = faixa(7); doc.texto(cT, k.x + k.w / 2, Y(yo + 5), 2.6, c.obra || pr.nome, 0, true);
    var yc = faixa(9); rot(k.x + 2, yc, "CONTEÚDO DA PRANCHA"); doc.texto(cT, k.x + k.w / 2, Y(yc + 7.5), 2.6, v("SHEET_NAME", folha.conteudo || pr.nome), 0, true);
    /* como na tela: a faixa do responsável cresce; responsáveis (se preenchidos) e a linha de baixo têm altura fixa */
    var temResp = !!(folha.projetadoPor || folha.desenhadoPor || folha.verificadoPor || folha.aprovadoPor), hb = 12;
    var hResp = Math.max(10, k.y + k.h - y - hb - (temResp ? 7 : 0));
    var yr2 = faixa(hResp); rot(k.x + 2, yr2, "RESPONS\u00C1VEL T\u00C9CNICO"); val(k.x + 2, yr2, (c.responsavel || "") + (c.registro ? " - " + c.registro : ""));
    if (c.contratante) doc.texto(cT, k.x + 2, Y(yr2 + 9.2), 1.8, "CONTRATANTE: " + c.contratante, 0, false);
    if (c.proprietario) doc.texto(cT, k.x + 2, Y(yr2 + 12.4), 1.8, "PROPRIET\u00C1RIO: " + c.proprietario, 0, false);
    if (c.local) doc.texto(cT, k.x + 2, Y(yr2 + 15.6), 1.8, "LOCAL: " + c.local, 0, false);
    /* projetado / desenhado / verificado / aprovado (parâmetros da folha) */
    if (temResp) {
      var resp = [["PROJETO", v("SHEET_DESIGNED_BY")], ["DESENHO", v("SHEET_DRAWN_BY")], ["VERIFICA\u00C7\u00C3O", v("SHEET_CHECKED_BY")], ["APROVA\u00C7\u00C3O", v("SHEET_APPROVED_BY")]];
      var yp = faixa(7), wq = k.w / 4;
      resp.forEach(function (r, i) { if (i) doc.linha(cL, k.x + i * wq, Y(yp), k.x + i * wq, Y(yp + 7)); rot(k.x + i * wq + 1, yp, r[0]); doc.texto(cT, k.x + i * wq + 1, Y(yp + 5.8), 1.8, r[1], 0, false); });
    }
    /* data / escala / código / folha */
    var yb = y;
    var cols = [["DATA", v("SHEET_ISSUE_DATE", c.data), 1], ["ESCALA", v("SHEET_SCALE", folha.escala), 1], ["COD.", v("SHEET_NUMBER"), 2], ["FOLHA", ("0" + folha.n).slice(-2) + "/" + ("0" + ((pr.folhas || []).length || 1)).slice(-2), 1.2]];
    var tot = 0; cols.forEach(function (q) { tot += q[2]; });
    var xx = k.x;
    cols.forEach(function (q, i) {
      var w = k.w * q[2] / tot;
      if (i) doc.linha(cL, xx, Y(yb), xx, Y(yb + hb));
      rot(xx + 1, yb, q[0]); doc.texto(cT, xx + w / 2, Y(yb + hb * 0.75), Math.min(3.5, hb * 0.32), q[1], 0, true);
      xx += w;
    });
  }

  /* --------------------------------------------- DWG: a conclusão da licença
   * ODA File Converter: grátis só para uso NÃO comercial de quem não é
   * membro da ODA (opendesign.com, FAQ "What are ODA Viewer and ODA File
   * Converter?", conferido em 09/10/2026). O OrçaPRO é vendido: converter
   * DWG no servidor para o cliente é uso comercial → exige ser membro
   * (assinatura anual). Sem isso, o botão DWG explica e entrega o DXF. */
  var DWG = { disponivel: false, motivo: "O DWG pelo servidor depende da licença comercial do conversor (ODA File Converter só é grátis para uso não comercial). Use o DXF: o AutoCAD abre direto e salva em DWG (Salvar como → DWG)." };

  var BimDxf = {
    PENAS_PADRAO: PENAS_PADRAO, CATEGORIAS: CATEGORIAS, COR_LW: COR_LW, DWG: DWG,
    categoria: categoria, lwDe: lwDe, txtDxf: txtDxf, novoDoc: novoDoc, escrever: escrever, hachurasEmGeometria: hachurasEmGeometria, paraDwg: paraDwg,
    daVista: daVista, daFolha: daFolha, daFolhaCad: daFolhaCad, recortarSeg: recortarSeg, svgParaDxf: svgParaDxf, extensao: extensao
  };
  global.BimDxf = BimDxf;
  if (typeof module !== "undefined" && module.exports) module.exports = BimDxf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

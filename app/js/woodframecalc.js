/* =====================================================================
 * woodframecalc.js — CÁLCULO ESTRUTURAL DAS PAREDES WOOD FRAME (fase 2B, 20/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   WoodFrameCalc.calcular({ estado, vaos, opc }) → resultado   (serializável: roda no worker, js/madengworker.js, mensagem "woodframe")
 *
 * O QUE FAZ (cada parede de quadro do modelo, pelo MESMO quadro que o BIM e as pranchas mostram — WoodFrameQuadro.paraParede):
 *   1) CARGAS por parede: peso das camadas e do quadro; telhado, forro e estrutura da cobertura (largura de influência a partir do
 *      modelo); pavimento (se informado); sobrecarga NBR 6120:2019 (6.4); vento NBR 6123 pelo AcoVento — pressão na face e força
 *      horizontal total por direção (paredes + componente horizontal das águas) e sucção da cobertura (arrancamento).
 *   2) MONTANTE: flexocompressão (compressão axial + flexão pelo vento na face) com flambagem — eixo forte entre as guias, eixo fraco
 *      travado pelo OSB pregado e pelos bloqueadores —, compressão normal às fibras na guia inferior e flecha pelo vento (ELS). Se não
 *      passar, cresce a seção (38×89 → 38×140 …, só as do catálogo Nibra) ou reduz o espaçamento, o que sair mais barato em madeira.
 *   3) VERGAS: flexão, cisalhamento, flecha e apoio na ombreira (jack) com a carga REAL de cima. A tabela do quadro
 *      (WoodFrameQuadro.VERGAS) fica só como seção de partida.
 *   4) CONTRAVENTAMENTO: vento por linha de parede (distribuição pela rigidez, diafragma rígido), resistência do painel pelo
 *      MadWoodFrame (OSB + prego de borda), espaçamento de prego de borda, hold-down (tração e compressão no montante de ponta/ombreira)
 *      e cisalhamento na base (chumbadores).
 *   5) LIGAÇÕES (MadLigCalc): pregos do montante na guia, chumbador ao cisalhamento e à tração.
 *
 * REGRAS (registro de engenharia — não afrouxar):
 *   · Nada de coeficiente de cabeça. Cada valor de norma leva a edição, o item e a tabela. Valor que o repositório e a biblioteca de
 *     normas não trazem vira PREMISSA (id, texto, fonte, `confirmada`) e a emissão sai PRELIMINAR até o RT confirmar (opc.confirmacoes).
 *   · O que não foi calculado sai em `naoVerificado` (nunca como "OK").
 *   · PRELIMINAR = alguma verificação do MODELO reprova, ou sobrou verificação sem solução, ou há premissa sem confirmação.
 *   · O motor NÃO altera o modelo: devolve a seção CALCULADA ao lado da MODELADA (pranchas, memorial e orçamento mostram as duas).
 *
 * FONTES DOS VALORES (cópia de consulta da biblioteca — BIBLIOTECA TÉCNICA - NORMAS/_ÍNDICE/NBR7190-2022_valores.md, conferida em
 * 24/10/2026; a RA precisa do exemplar licenciado): NBR 7190-1:2022 itens 5.7.1 (Tab. 3), 5.8.4 (Tab. 4 e 5), 5.8.5, 5.8.7, 6.3.3 (Tab. 6),
 * 6.3.4, 6.3.7, 6.4, 6.5, 7.1.1, 7.1.2, 7.1.4, 7.1.9 (Tab. 13), 7.2 (Tab. 18), 8.1 (Tab. 20), 8.2 (Tab. 21), 9.3; NBR 6120:2019 6.4 e Tab. 1;
 * NBR 6123 (AcoVento, edição 1988 conferida na 2023 — o motor avisa); NBR 8681:2003 (γ e ψ como no MadDimensionar.combinacoes);
 * EN 1995-1-1:2004 9.2.4.2 e 8.3 (painel pregado e embutimento na chapa — o MadWoodFrame; a 7190-1 6.2.5 diz que suas expressões de
 * embutimento NÃO valem para OSB/compensado).
 * Teste: node tools/test-woodframe-calc.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function mot() {
    return { MM: dep("MadMateriais", "./madmateriais.js"), MD: dep("MadDim", "./maddim7190.js"), ML: dep("MadLigCalc", "./madligcalc.js"), WF: dep("MadWoodFrame", "./madwoodframe.js"),
      W: dep("WoodFrameQuadro", "./woodframequadro.js"), AV: dep("AcoVento", "./acovento.js"), CAT: dep("MadCatalogo", "./madcatalogo.js") };
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function rr(v, c) { var p = Math.pow(10, c == null ? 3 : c); return Math.round(v * p) / p; }
  function br(v, c) { return fin(v) ? rr(v, c == null ? 2 : c).toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function max0(l) { var m = 0; l.forEach(function (x) { if (fin(x) && x > m) m = x; }); return m; }

  var G = 9.80665;                    /* m/s² — kg → N */
  var NORMA = "NBR 7190-1:2022";
  var TOL = 1e-9;

  /* ============================================================ PARÂMETROS (e a fonte de cada um) */
  var PADRAO = {
    classe: "peca:C24",               /* PREMISSA: Pinus autoclavado Nibra como C24 (a mesma do MadWoodFrame: "Pinus como C24"); o catálogo não informa classe — NBR 7190-1:2022 Tab. 3 (5.7.1) */
    umidade: 2,                       /* DECISÃO do RT: classe 2 para parede protegida (externa com revestimento ventilado, kmod2 0,90 — Tab. 1, 5.5 e Tab. 5); opção 3 (kmod2 0,80) em opc.umidade */
    revestimento: "auto",             /* "auto" (frágil se há gesso/cimentícia/siding) | "fragil" | "naoFragil" — decide o limite de flecha do vento (8.2) */
    produto: "serrada",
    psi0Q: 0.7, psi0V: 0.6,           /* NBR 8681:2003, edificação tipo 2 — os mesmos de MadDimensionar.combinacoes */
    gamaG: 1.4, gamaGfav: 1.0, gamaQ: 1.4,
    carregamentoGravidade: "longa",   /* PREMISSA: sobrecarga como "longa duração" (kmod1 0,70, Tab. 4 de 5.8.4.1) — a favor, como o MadDimensionar */
    alfaN: 1.40,                      /* NBR 7190-1:2022 6.3.3 / Tab. 6: αn = 1,40 para a' = 4 cm (a carga do montante na guia tem a' = 3,8 cm → αn ≥ 1,40: a favor). DECISÃO do RT: fc90,d = 0,25·fc0,d·αn (6.3.3) */
    limFlechaVento: null,             /* null = pela classificação do revestimento: frágil → mín(L/500; 15 mm) (8.2); não frágil → L/300 (Tab. 21, d_inst, extremo menos rígido) */
    sobrecargaCobertura: 0.50,        /* kN/m² — NBR 6120:2019 6.4: 0,25 a 0,50 conforme a inclinação; adotado o MÁXIMO (a favor); 7190-1 10.2.1 pede ≥ 0,25 */
    prego: { d: 3.0, L: 48.3, fu: 635, nome: "prego liso 17×21 (3,0 × 48,3 mm)", fonte: "catálogo Nibra p. 9 (nibra-prego-liso, 17 x 21); fu = 635 MPa: NBR 7190-1:2022 Tab. 13 (3,00 ≤ d ≤ 3,54); d ≥ 3,0 mm: 7.1.9" },
    pregoMontante: { d: 3.4, L: 82.8, fu: 635, nome: "prego liso 18×36 (3,4 × 82,8 mm)", fonte: "catálogo Nibra p. 10 (nibra-prego-liso, 18 x 36); fu = 635 MPa: NBR 7190-1:2022 Tab. 13" },
    espacamentosPrego: [150, 100, 75, 50],   /* mm — prego de borda do OSB (o modelo traz 150) */
    chumbadorD: [12, 16, 20],         /* mm — candidatos; área da rosca: MadLigCalc.AS (ISO 898-1) */
    chumbadorFub: 400,                /* MPa — ISO 898-1 classe 4.6: NBR 7190-1:2022 Tab. 13 (fuk 400) */
    chumbadorMaxEsp: 1.20,            /* m — o do quadro (espChumbador) */
    pesoCamadas: {                    /* kN/m² por camada (PREMISSAS — o repositório só tem o peso de partida; fabricante confirma) */
      osb: { kNm3: null, fonte: "OSB: sem peso na biblioteca; adotado o do compensado Evoply do catálogo (19 kg / 1,20×2,40×0,012 m)" },
      gesso_acart: { kNm3: 12.5, fonte: "NBR 6120:2019 Tab. 1 (argamassa de gesso, 12,5 kN/m³) — a favor (a chapa acartonada é mais leve)" },
      cimenticia: { kNm3: null, fonte: "catálogo Decorlit 8 mm: 42 kg / 1,20×2,40 m (manual p. 5) → 14,6 kg/m² por 8 mm" }
    },
    estruturaCobertura: 0,            /* kN/m² (plano) — peso da tesoura/terça/caibro: vem do módulo da cobertura; 0 = NÃO informado (premissa pendente) */
    confirmacoes: null                /* { idDaPremissa: true } ou "todas" — só o RT confirma */
  };
  function ehObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function mescla(base, o) {
    var r = {}, k; for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) r[k] = base[k];
    if (ehObj(o)) for (k in o) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) r[k] = (ehObj(o[k]) && ehObj(base[k])) ? mescla(base[k], o[k]) : o[k];
    return r;
  }

  /* ============================================================ CONTEXTO (premissas, não verificado, avisos) */
  function Ctx(opc, m) {
    this.opc = opc; this.m = m; this.premissas = []; this.nv = []; this.avisos = []; this.perf = {}; this.ids = {}; this.pend = [];
  }
  Ctx.prototype.confirmada = function (id) { var c = this.opc.confirmacoes; return c === "todas" || (ehObj(c) && c[id] === true) === true; };
  Ctx.prototype.premissa = function (id, texto, fonte) {
    if (this.ids[id]) return; this.ids[id] = 1;
    this.premissas.push({ id: id, texto: texto, fonte: fonte || null, confirmada: this.confirmada(id) });
  };
  Ctx.prototype.naoVerificado = function (id, texto) { if (!this.ids["nv:" + id]) { this.ids["nv:" + id] = 1; this.nv.push({ id: id, texto: texto }); } };
  Ctx.prototype.pendencia = function (t) { if (this.pend.indexOf(t) < 0) this.pend.push(t); };
  Ctx.prototype.aviso = function (t) { if (this.avisos.indexOf(t) < 0) this.avisos.push(t); };
  Ctx.prototype.perfil = function (car) {
    var k = car + "|" + this.opc.umidade;
    if (!this.perf[k]) this.perf[k] = this.m.MM.perfil2022({ carregamento: car, umidade: this.opc.umidade, produto: this.opc.produto, limVao: 300, limBalanco: 150 });
    return this.perf[k];
  };
  Ctx.prototype.res = function (car) { return this.m.MM.resistencias2022(this.opc.classe, this.perfil(car)); };

  /* ============================================================ COMBINAÇÕES (NBR 8681:2003, como MadDimensionar.combinacoes) */
  function combinacoes(o) {
    var gG = o.gamaG, gQ = o.gamaQ;
    return [
      { id: "C1", nome: gG + "·G + " + gQ + "·Sc", car: o.carregamentoGravidade, G: gG, Sc: gQ, W: 0, U: 0, principal: "sobrecarga", txt: "1,4G + 1,4Sc (variável principal: sobrecarga; classe de carregamento " + o.carregamentoGravidade + ")" },
      { id: "C1v", nome: gG + "·G + " + gQ + "·Sc + " + rr(gQ * o.psi0V, 2) + "·W", car: o.carregamentoGravidade, G: gG, Sc: gQ, W: gQ * o.psi0V, U: 0, principal: "sobrecarga", txt: "1,4G + 1,4Sc + 0,84W (sobrecarga principal; ψ0 do vento 0,6)" },
      { id: "C2", nome: gG + "·G + " + gQ + "·W + " + rr(gQ * o.psi0Q, 2) + "·Sc", car: "curta", G: gG, Sc: gQ * o.psi0Q, W: gQ, U: 0, principal: "vento", txt: "1,4G + 1,4W + 0,98Sc (vento principal, curta duração; ψ0 da sobrecarga 0,7)" },
      { id: "C3", nome: o.gamaGfav + "·G + " + gQ + "·W (sucção)", car: "curta", G: o.gamaGfav, Sc: 0, W: gQ, U: gQ, principal: "vento", txt: "1,0G + 1,4W com a sucção da cobertura (arrancamento; permanente a favor)" }
    ];
  }

  /* ============================================================ LEITURA DA PAREDE */
  function pecasDe(res, rx) { return arr(res.pecas).filter(function (p) { return rx.test(p.tipo); }); }
  function larguraOsb(res) { return arr(res.pecas).some(function (p) { return p.grupo === "osb"; }); }
  function lerParede(c, vz, m) {
    var res = m.W.paraParede(c, vz);
    if (!res || !res.ok) return { ok: false, id: String(c && c.id), motivo: res && res.motivo ? res.motivo : "quadro não gerado" };
    var P = res.params, tp = c.tipoParede || {}, cam = arr(res.camadas);
    var tem = function (rx) { return cam.some(function (k) { return rx.test(k.id); }); };
    var mont = pecasDe(res, /^montante$/), hMont = mont.length ? mont[0].comp : res.H - 3 * res.b;
    var temOsb = larguraOsb(res);
    return {
      ok: true, id: String(c.id), c: c, res: res, tipoId: String(tp.id || ""), L: res.L, H: res.H, b: res.b, d: res.d, hMont: hMont,
      sec: [P.montante[0], P.montante[1]], espac: P.espac, osb: temOsb, osbE: num(res.osb && res.osb.e, 0),
      fragilAuto: tem(/gesso|cimenticia|siding/), fragil: tem(/gesso|cimenticia|siding/), gesso: tem(/gesso/),
      ext: /^wf-ext/.test(String(tp.id || "")) || temOsb, estrutural: /^wf-ext/.test(String(tp.id || "")) || (!!c.wf && c.wf.portante === true) || temOsb,
      cx: num(c.cx, 0), cz: num(c.cz, 0), rotY: num(c.rotY, 0), comprimento: num(c.comprimento, res.L), espessura: num(c.espessura, res.t)
    };
  }

  /* ============================================================ GEOMETRIA EM PLANTA E LARGURA DE INFLUÊNCIA */
  function caixaPlanta(ps) {
    var xs = [], zs = [];
    ps.forEach(function (p) {
      var co = Math.cos(p.rotY), si = Math.sin(p.rotY), L = p.comprimento, hw = p.espessura / 2;
      [[-L / 2, -hw], [L / 2, -hw], [L / 2, hw], [-L / 2, hw]].forEach(function (q) { xs.push(p.cx + q[0] * co + q[1] * si); zs.push(p.cz - q[0] * si + q[1] * co); });
    });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
  }
  /* eixo da cumeeira: o lado MAIOR da planta (ou o informado em cobertura.eixoCumeeira "x"|"z") */
  function geometriaPlanta(paredes, cob) {
    var ext = paredes.filter(function (p) { return p.ext; }); if (!ext.length) ext = paredes;
    var cx = caixaPlanta(ext), dx = cx.x1 - cx.x0, dz = cx.z1 - cx.z0;
    var eixo = cob && (cob.eixoCumeeira === "x" || cob.eixoCumeeira === "z") ? cob.eixoCumeeira : (dx >= dz ? "x" : "z");
    return { caixa: cx, dx: dx, dz: dz, eixo: eixo, a: eixo === "x" ? dx : dz, b: eixo === "x" ? dz : dx, R: eixo === "x" ? [1, 0] : [0, 1], S: eixo === "x" ? [0, 1] : [1, 0],
      hBeiral: Math.max.apply(null, ext.map(function (p) { return p.H; })) };
  }
  function dirDe(p) { return [Math.cos(p.rotY), -Math.sin(p.rotY)]; }
  function paraleloA(p, v) { var u = dirDe(p); return Math.abs(u[0] * v[0] + u[1] * v[1]) > 0.9; }
  function perpA(p, v) { var u = dirDe(p); return Math.abs(u[0] * v[0] + u[1] * v[1]) < 0.1; }

  /* largura de influência (m) da cobertura/pavimento sobre cada parede de apoio. Linhas de apoio = paredes portantes PARALELAS à cumeeira
     (as águas vão de uma linha à outra); a largura = meia distância até as vizinhas; na borda, o beiral + meia espessura. 4 águas (T3): todas as externas. */
  function larguraInfluencia(paredes, geo, cob, comBeiral) {
    var out = {}, S = geo.S, beiral = comBeiral ? num(cob && cob.beiral, 0) : 0;
    var portantes = paredes.filter(function (p) { return p.estrutural; });
    var par = portantes.filter(function (p) { return paraleloA(p, geo.R); });
    var linhas = []; par.forEach(function (p) { var s = p.cx * S[0] + p.cz * S[1]; if (!linhas.some(function (l) { return Math.abs(l.s - s) < 0.15; })) linhas.push({ s: s, t: p.espessura }); });
    linhas.sort(function (u, v) { return u.s - v.s; });
    function larg(s) {
      var i = -1; linhas.forEach(function (l, k) { if (Math.abs(l.s - s) < 0.15) i = k; });
      if (i < 0) return 0;
      var abaixo = i > 0 ? (s - linhas[i - 1].s) / 2 : beiral + linhas[i].t / 2;
      var acima = i < linhas.length - 1 ? (linhas[i + 1].s - s) / 2 : beiral + linhas[i].t / 2;
      return abaixo + acima;
    }
    portantes.forEach(function (p) {
      if (paraleloA(p, geo.R)) out[p.id] = larg(p.cx * S[0] + p.cz * S[1]);
      else out[p.id] = oitaoTrib(p, geo, cob, beiral);
    });
    return out;
  }

  /* OITÃO (parede perpendicular à cumeeira): 4 águas = metade do vão + beiral; 2 águas = o que o modelo da cobertura informa — meio espaçamento de tesoura + beiral do oitão,
     ou metade do vão das terças apoiadas na empena + beiral. Sem informação: 0 e a emissão sai PRELIMINAR (nunca um chute). */
  function oitaoTrib(p, geo, cob, beiral) {
    if (!cob) return 0;
    if (cob.tipo === "T3") return geo.b / 2 + beiral;
    var bo = cob.beiralOitao != null ? cob.beiralOitao : beiral, o = cob.oitao || {};
    if (num(o.espacamento, 0) > 0) return o.espacamento / 2 + bo + p.espessura / 2;
    if (num(o.vao, 0) > 0) return o.vao / 2 + bo + p.espessura / 2;
    return 0;
  }
  function oitaoInformado(cob) { return !!(cob && (cob.tipo === "T3" || (cob.oitao && (num(cob.oitao.espacamento, 0) > 0 || num(cob.oitao.vao, 0) > 0)))); }

  /* ============================================================ CARGAS DAS CAMADAS (kN/m² de parede) */
  function pesoParede(ctx, P) {
    var m = ctx.m, cls = m.MM.classe2022(ctx.opc.classe), pc = ctx.opc.pesoCamadas, gMad = (cls.rhom || cls.rhok / 0.83) * G / 1000;   /* kN/m³ (ρm da Tab. 3) */
    var evoply = 19 / (1.2 * 2.4 * 0.012) * G / 1000, decor = 42 / (1.2 * 2.4) / 8 * 1000 * G / 1000;    /* kN/m³ */
    var itens = [], tot = 0, area = P.L * P.H;
    var volMad = 0; arr(P.res.pecas).forEach(function (p) { if (p.grupo === "madeira") volMad += p.vol; });
    var gQuadro = area > 0 ? volMad * gMad / area : 0;
    itens.push({ rotulo: "Quadro de madeira (guias, montantes, vergas, bloqueadores)", kNm2: gQuadro, fonte: "ρm " + br(cls.rhom, 0) + " kg/m³ (" + NORMA + " Tab. 3) × volume das peças do quadro" });
    tot += gQuadro;
    arr(P.res.camadas).forEach(function (k) {
      var kn = 0, f = null, e = k.e;                             /* e em metros */
      if (/^osb/.test(k.id)) { kn = (pc.osb.kNm3 != null ? pc.osb.kNm3 : evoply) * e; f = pc.osb.fonte; ctx.premissa("peso-osb", "Peso da chapa de OSB = o do compensado Evoply do catálogo (" + br(evoply, 2) + " kN/m³); o catálogo não traz o do OSB.", pc.osb.fonte); }
      else if (/gesso/.test(k.id)) { kn = pc.gesso_acart.kNm3 * e; f = pc.gesso_acart.fonte; ctx.premissa("peso-gesso", "Peso do gesso acartonado = 12,5 kN/m³ (argamassa de gesso, NBR 6120:2019 Tab. 1): a favor da segurança.", pc.gesso_acart.fonte); }
      else if (/cimenticia|siding/.test(k.id)) { kn = (pc.cimenticia.kNm3 != null ? pc.cimenticia.kNm3 : decor) * e; f = pc.cimenticia.fonte; ctx.premissa("peso-cimenticia", "Peso da placa cimentícia/siding = " + br(decor, 1) + " kN/m³ (Decorlit 8 mm do catálogo).", pc.cimenticia.fonte); }
      else if (k.face === "nucleo") return;
      else { return; }                                           /* ripa, câmara, membranas, lã, impermeabilização: desprezados (declarado) */
      itens.push({ rotulo: k.rotulo || k.id, kNm2: kn, fonte: f }); tot += kn;
    });
    ctx.premissa("peso-desprezado", "Lã mineral, membranas, ripa da câmara e impermeabilização: peso desprezado (< 0,02 kN/m² no conjunto).", "premissa RA");
    return { itens: itens, total: tot, gMad: gMad };
  }

  /* ============================================================ VENTO (NBR 6123 pelo AcoVento) */
  function ventoDe(ctx, geo, cob, paredes) {
    var m = ctx.m, v = ctx.opc.vento || {};
    if (!m.AV) return { ok: false, motivo: "o motor de vento (js/acovento.js) não carregou" };
    if (!(num(v.v0, 0) > 0) && !(ehObj(v.local) && fin(Number(v.local.lat)) && fin(Number(v.local.lon)))) return { ok: false, motivo: "falta a localização da obra (latitude e longitude) ou o V0 da NBR 6123, Figura 1" };
    var inclG = cob && num(cob.inclPct, 0) > 0 ? Math.atan(cob.inclPct / 100) * 180 / Math.PI : 0;
    var uma = !!(cob && cob.tipo === "T1"), ladoAlto = uma ? (cob.ladoAlto || "esquerda") : null, hCum = geo.hBeiral + (uma ? geo.b : geo.b / 2) * Math.tan(inclG * Math.PI / 180);
    var faces = v.faces || { frente: { fechada: true, vedacao: "misto" }, fundo: { fechada: true, vedacao: "misto" }, esquerda: { fechada: true, vedacao: "misto" }, direita: { fechada: true, vedacao: "misto" } };
    var loc = clone(v.local || {}); if (num(v.v0, 0) > 0) loc.v0 = v.v0;
    var ent = { local: loc, s1: { tipo: v.s1tipo || "plano", valor: num(v.s1, 1) }, categoria: v.categoria || "II", grupoS3: num(v.grupoS3, 2),
      geometria: { a: geo.a, b: geo.b, h: geo.hBeiral, hCumeeira: Math.max(hCum, geo.hBeiral), inclinacaoGraus: inclG, cobertura: uma ? "uma-agua" : "duas-aguas", nervuras: "retangulares" }, faces: faces };
    if (uma) ent.geometria.ladoAlto = ladoAlto;
    var r; try { r = m.AV.calcular(ent, { todasDirecoes: true }); } catch (e) { return { ok: false, motivo: "vento: " + (e && e.message ? e.message : e) }; }
    if (!r || !r.ok) return { ok: false, motivo: "vento: " + JSON.stringify((r && r.erros) || "sem resultado").slice(0, 200) };
    var tg = Math.tan(inclG * Math.PI / 180), pv = { lateral: 0, oitao: 0 }, up = 0, FxMax = 0, FzMax = 0, FxB = 0, FzB = 0, casoX = null, casoZ = null;
    arr(r.casos).forEach(function (c) {
      var pp = (c.pressao && c.pressao.paredes) || {};
      ["frente", "fundo"].forEach(function (f) { arr(pp[f]).forEach(function (z) { if (Math.abs(z.p) > pv.oitao) pv.oitao = Math.abs(z.p); }); });
      ["esquerda", "direita"].forEach(function (f) { arr(pp[f]).forEach(function (z) { if (Math.abs(z.p) > pv.lateral) pv.lateral = Math.abs(z.p); }); });
      arr(c.pressao && c.pressao.cobertura).forEach(function (z) { if (z.p < 0 && -z.p > up) up = -z.p; });
      /* força horizontal do caso (eixos do AcoVento: x através da cumeeira, z ao longo dela) */
      /* FORÇA NO TOPO (o que o diafragma entrega às paredes contraventantes) = meia altura das paredes (a metade de baixo vai direto à fundação) + triângulo do oitão + componente horizontal das águas.
         FORÇA NA BASE (cisalhamento dos chumbadores) = altura inteira das paredes + triângulo + águas. */
      var fx = 0, fz = 0, fxB = 0, fzB = 0, hfL = function (face) { return uma && face === ladoAlto ? hCum : geo.hBeiral; }, hf = geo.hBeiral / 2, hfB = geo.hBeiral;
      function pMedia(l) { var sp = 0, st = 0; arr(l).forEach(function (z) { sp += z.p * (z.s1 - z.s0); st += z.s1 - z.s0; }); return st > 0 ? sp / st : 0; }
      var tri = 0.5 * geo.b * Math.max(0, hCum - geo.hBeiral), fTriZ = pMedia(pp.frente) * tri - pMedia(pp.fundo) * tri;
      arr(pp.frente).forEach(function (z) { fz += z.p * (z.s1 - z.s0) * hf; fzB += z.p * (z.s1 - z.s0) * hfB; });
      arr(pp.fundo).forEach(function (z) { fz -= z.p * (z.s1 - z.s0) * hf; fzB -= z.p * (z.s1 - z.s0) * hfB; });
      arr(pp.esquerda).forEach(function (z) { fx += z.p * (z.s1 - z.s0) * hfL("esquerda") / 2; fxB += z.p * (z.s1 - z.s0) * hfL("esquerda"); });
      arr(pp.direita).forEach(function (z) { fx -= z.p * (z.s1 - z.s0) * hfL("direita") / 2; fxB -= z.p * (z.s1 - z.s0) * hfL("direita"); });
      fz += fTriZ; fzB += fTriZ;
      arr(c.pressao && c.pressao.cobertura).forEach(function (z) { var ap = (z.x1 - z.x0) * (z.z1 - z.z0), dx = (uma ? (ladoAlto === "esquerda" ? -1 : 1) : (z.agua === "esquerda" ? 1 : -1)) * z.p * ap * tg; fx += dx; fxB += dx; });
      var d = c.direcao;
      if ((d === 90 || d === 270) && Math.abs(fx) > FxMax) { FxMax = Math.abs(fx); FxB = Math.abs(fxB); casoX = c.id; }
      if ((d === 0 || d === 180) && Math.abs(fz) > FzMax) { FzMax = Math.abs(fz); FzB = Math.abs(fzB); casoZ = c.id; }
    });
    return { ok: true, v0: r.v0, q: r.q, vk: r.vk, s2: r.s2 && r.s2.valor, s3: r.s3 && (r.s3.valor != null ? r.s3.valor : r.s3), categoria: ent.categoria, grupoS3: ent.grupoS3, s1: ent.s1, edicao: r.edicao || "NBR 6123:1988 (conferir na 2023)",
      pFace: pv, succaoCobertura: up, F: { across: FxMax, ridge: FzMax }, Fbase: { across: FxB, ridge: FzB }, trianguloOitao: 0.5 * geo.b * Math.max(0, hCum - geo.hBeiral), casoAcross: casoX, casoRidge: casoZ, geometria: ent.geometria, inclGraus: inclG,
      memoria: arr(r.memoria).slice(0, 40), avisos: arr(r.avisos).slice(0, 6), nCasos: arr(r.casos).length };
  }

  /* ============================================================ SEÇÕES DO CATÁLOGO (a mesma cadeia das vergas do quadro) */
  function cadeia(m) {
    var W = m.W, tb = W ? arr(W.VERGAS).map(function (v) { return { h: v.secao[1], compra: v.compra }; }) : [];
    if (W && W.VERGA_ACIMA) tb.push({ h: W.VERGA_ACIMA.secao[1], compra: W.VERGA_ACIMA.compra });
    if (!tb.length) tb = [{ h: 89, compra: "50x100" }, { h: 140, compra: "50x150" }, { h: 184, compra: "50x200" }, { h: 235, compra: "50x250" }, { h: 286, compra: "50x300" }];
    var larg = null;
    try { var p = m.CAT && m.CAT.produto("nibra-wf-estrutura-pinus"); if (p) larg = arr(p.variantes).map(function (v) { return v.largura_mm; }); } catch (e) { larg = null; }
    return tb.filter(function (x) { var w = Number(String(x.compra).split("x")[1]); return !larg || larg.indexOf(w) >= 0; });
  }

  /* ============================================================ MONTANTE */
  function limiteFlecha(opc, L, fragil) {       /* mm */
    if (num(opc.limFlechaVento, 0) > 0) return { lim: L * 1000 / opc.limFlechaVento, txt: "L/" + opc.limFlechaVento + " (definido pelo RT)" };
    if (fragil) return { lim: Math.min(L * 1000 / 500, 15), txt: "mín(L/500; 15 mm) — revestimento frágil (gesso/cimentícia), " + NORMA + " 8.2 e Tab. 21" };
    return { lim: L * 1000 / 300, txt: "L/300 — " + NORMA + " Tab. 21 (d_inst, vigas biapoiadas: L/300 a L/500)" };
  }
  /* Uma verificação de montante. o = { b, h (m), L (m, entre guias), Lz (m, travamento do eixo fraco), trib (m), N: {G, Sc, U} (kN por montante, característico),
     pv (kN/m², vento), fragil } */
  function verificarMontante(ctx, o) {
    var m = ctx.m, MD = m.MD, opc = ctx.opc, cmb = combinacoes(opc), lista = [], gov = null, nGov = 0;
    var w = o.pv * o.trib, ap = { eta: 0 };
    cmb.forEach(function (c) {
      var N = c.G * o.N.G + c.Sc * o.N.Sc - c.U * o.N.U;                  /* kN, compressão + */
      var M = c.W * w * o.L * o.L / 8, V = c.W * w * o.L / 2;               /* kN·m, kN */
      if (c.W === 0 && c.U === 0) { M = 0; V = 0; }
      var perf = ctx.perfil(c.car), f = ctx.res(c.car);
      var r = MD.barra2022({ N: -N, My: M, Mz: 0, Vy: V, b: o.b, h: o.h, L0y: o.L, L0z: o.Lz, L1: o.Lz, classe: opc.classe, perfil: perf });
      var item = { id: c.id, nome: c.nome, car: c.car, kmod: perf.kmod, N: N, M: M, V: V, eta: r.eta, governa: r.governa, passos: r.verif.map(function (v) { return v.nome + " (η " + br(v.eta, 3) + "): " + arr(v.passos).join(" "); }) };
      lista.push(item);
      if (N > 0) {                                                          /* compressão normal às fibras na guia inferior: 6.3.3 */
        var lim = 0.25 * f.fc0d * opc.alfaN, sig = N / (o.b * o.h) / 1e3, e = sig / lim;      /* DECISÃO do RT: fc90,d = 0,25·fc0,d·αn (6.3.3, Tab. 6) */
        if (e > ap.eta) ap = { eta: e, id: c.id, sig: sig, lim: lim, fc90d: lim, fc90dTab3: f.fc90d, N: N, lim63: lim };
      }
      if (!gov || item.eta > gov.eta) gov = item;
    });
    /* ELS: flecha instantânea pelo vento (combinação rara = vento característico), E0,med (5.8.7) */
    var cls = m.MM.classe2022(opc.classe), I = 1000 * o.b * Math.pow(1000 * o.h, 3) / 12, wk = o.pv * o.trib;           /* mm⁴, N/mm */
    var delta = o.pv > 0 ? 5 * wk * Math.pow(o.L * 1000, 4) / (384 * cls.Ec0m * I) : 0, lf = limiteFlecha(opc, o.L, o.fragil), etaS = lf.lim > 0 ? delta / lf.lim : 0;
    var lfF = limiteFlecha(opc, o.L, true), lfN = limiteFlecha(opc, o.L, false);
    var els = { delta: delta, lim: lf.lim, limTxt: lf.txt, eta: etaS, E0m: cls.Ec0m, I: I, fragil: !!o.fragil, limFragil: lfF.lim, limNaoFragil: lfN.lim, etaFragil: lfF.lim > 0 ? delta / lfF.lim : 0, etaNaoFragil: lfN.lim > 0 ? delta / lfN.lim : 0,
      passos: ["δ = 5·w·L⁴/(384·E0,med·I) = 5·" + br(wk, 3) + "·" + br(o.L * 1000, 0) + "⁴/(384·" + br(cls.Ec0m, 0) + "·" + br(I, 0) + ") = " + br(delta, 2) + " mm (w = pv·espaçamento = " + br(o.pv, 3) + "·" + br(o.trib, 2) + " kN/m; E0,med: " + NORMA + " 5.8.7)", "Limite: " + lf.txt + " = " + br(lf.lim, 2) + " mm → η = " + br(etaS, 3)] };
    var eta = Math.max(gov ? gov.eta : 0, ap.eta, etaS);
    var qual = eta === etaS ? "flecha pelo vento (ELS)" : (eta === ap.eta ? "compressão normal à guia inferior" : (gov ? gov.id + " — " + gov.governa : ""));
    return { eta: eta, ok: eta <= 1 + TOL, governa: qual, combos: lista, apoio: ap, els: els, secao: [o.b * 1000, o.h * 1000] };
  }

  /* trecho entre travamentos do eixo fraco: OSB pregado (a cada espOsbCampo) ou a maior distância entre bloqueadores */
  function travamentoFraco(ctx, P) {
    var ys = [P.b]; pecasDe(P.res, /^(bloqueador|bloco)$/).forEach(function (p) { var yc = (p.y0 + p.y1) / 2; if (ys.indexOf(yc) < 0) ys.push(yc); });
    ys.push(P.b + P.hMont); ys.sort(function (a, c) { return a - c; });
    var gap = 0; for (var i = 1; i < ys.length; i++) gap = Math.max(gap, ys[i] - ys[i - 1]);
    var campo = P.res.params.espOsbCampo / 1000;
    if (P.osb) { ctx.premissa("osb-trava-eixo-fraco", "O OSB pregado (campo a " + P.res.params.espOsbCampo + " mm) trava o eixo fraco do montante entre os pregos; sem o OSB vale a distância entre bloqueadores.", "premissa RA (EN 1995-1-1 9.2 / NBR 16936); a confirmar com o RT"); return Math.min(campo, gap); }
    return gap;
  }

  /* ============================================================ VERGA */
  function verificarVerga(ctx, o) {
    var m = ctx.m, opc = ctx.opc, MD = m.MD, perfL = ctx.perfil(opc.carregamentoGravidade), f = ctx.res(opc.carregamentoGravidade), cls = m.MM.classe2022(opc.classe);
    var apoioC = o.apoio || 0.038, Lt = o.vao + apoioC;                       /* 6.3.4: menor entre eixos dos apoios e vão livre + h (≤ 10 cm) */
    Lt = Math.min(Lt, o.vao + Math.min(o.h, 0.10));
    var gMad = ctx.gMad, qG = o.qG + gMad * o.b * o.h, qQ = o.qQ;
    var r = MD.vigaFletida({ L: Lt, apoios: [0, Lt], G: { d: [[0, Lt, qG]] }, Q: { d: [[0, Lt, qQ]] }, b: o.b, h: o.h, classe: opc.classe, perfil: perfL });
    var R = 0; Object.keys(r.reacoes).forEach(function (k) { R = Math.max(R, opc.gamaG * r.reacoes[k][0] + opc.gamaQ * r.reacoes[k][1]); });
    /* apoio na ombreira: compressão normal às fibras da verga sobre o topo do jack(s) */
    var nJ = 1, etaA = 0, limA = 0.25 * f.fc0d * opc.alfaN;
    function etaApoio(n) { return (R / (o.b * n * apoioC) / 1e3) / limA; }
    for (nJ = 1; nJ <= 3; nJ++) { etaA = etaApoio(nJ); if (etaA <= 1 + TOL) break; }
    var nJackReq = nJ > 3 ? 3 : nJ, etaJ = etaApoio(Math.min(nJ, 3));
    /* o jack é uma barra curta, travada pelo OSB: compressão com estabilidade (eixo forte: altura do jack) */
    var jb = o.jackB || 0.038, jh = o.jackH || 0.089, nM = Math.max(1, nJackReq);
    var rj = MD.compressao2022({ N: R / nM, Mx: 0, My: 0, b: jb, h: jh, L0x: o.hJack, L0y: Math.min(o.hJack, o.Lz || 0.3), classe: opc.classe, perfil: perfL });
    /* flecha instantânea da sobrecarga (materiais frágeis: 8.2): d_inst,Q ≤ mín(L/500; 15 mm) */
    var I = 1000 * o.b * Math.pow(1000 * o.h, 3) / 12, dq = 5 * qQ * Math.pow(Lt * 1000, 4) / (384 * cls.Ec0m * I), limQ = o.fragil ? Math.min(Lt * 1000 / 500, 15) : Lt * 1000 / 300, etaQ = dq / limQ;
    var eta = Math.max(r.eta, etaJ, rj.eta, etaQ);
    var qual = eta === r.eta ? (r.eta === r.eta_flecha ? "flecha final" : (r.eta === r.eta_cisalh ? "cisalhamento" : "flexão")) : (eta === etaJ ? "apoio na ombreira (compressão normal)" : (eta === rj.eta ? "compressão do jack" : "flecha da sobrecarga"));
    return { eta: eta, ok: eta <= 1 + TOL && etaA <= 1 + TOL, governa: qual, L: Lt, R: R, nJack: nJ > 3 ? 4 : nJ, nJackAdotado: nJackReq, apoioOk: nJ <= 3, viga: r, jack: rj, etaApoio: etaJ, etaQ: etaQ, dQ: dq, limQ: limQ,
      qG: qG, qQ: qQ, secao: [o.b * 1000, o.h * 1000],
      passos: r.passos.concat(["Apoio (6.3.3): R,d = γg·RG + γq·RQ = " + br(R, 2) + " kN; σc90 = R/(b·n·38 mm) = " + br(R / (o.b * nJackReq * apoioC) / 1e3, 3) + " MPa ≤ " + br(limA, 3) + " MPa (fc90,d = 0,25·fc0,d·αn, αn = " + br(opc.alfaN, 2) + ") → η = " + br(etaJ, 3) + " com " + nJackReq + " jack(s) por lado" + (nJ > 3 ? " — NÃO ATENDE com 3" : "") + ".",
        "Jack (compressão com estabilidade): " + arr(rj.passos).join(" "),
        "Flecha instantânea da sobrecarga (8.2): δ = " + br(dq, 2) + " mm ≤ " + br(limQ, 2) + " mm → η = " + br(etaQ, 3) + "."]) };
  }

  /* ============================================================ LIGAÇÕES (MadLigCalc) */
  function fhPrego(ML, d, rhoK) { return ML.fhPrego(d, rhoK); }                    /* 0,082·ρk·d^-0,3 — NBR 7190-1:2022 6.2.5 (prego sem pré-furação) */
  /* prego do montante na guia (pregação de topo, 2 por ponta): cisalhamento da reação do vento. Corte simples madeira–madeira (Tab. 18); Rd = kmod·Rk/γlig (7.1.2) */
  function pregoMontanteGuia(ctx, P, Vk, car) {
    var m = ctx.m, ML = m.ML, pr = ctx.opc.pregoMontante, cls = m.MM.classe2022(ctx.opc.classe), fh = fhPrego(ML, pr.d, cls.rhok), My = ML.myRk(pr.d, pr.fu);
    var t1 = P.b * 1000, t2 = pr.L - t1;                                          /* guia (38) + penetração no montante */
    var cs = ML.corteSimples(fh, fh, t1, t2, pr.d, My, 0), pen = t2 / pr.d, perf = ctx.perfil(car), n = P.res.params.pregosPorExtremidade;
    var Rd = n * perf.kmod * cs.Rk / ML.PAR.gamaLig / 1000, eta = Vk / Rd;
    return { eta: eta, ok: eta <= 1 + TOL && pen >= 12 && n >= 2, nPregos: n, Vd: Vk, Rd: Rd, RkPrego: cs.Rk, modo: cs.modo, penetracao_d: pen, prego: pr,
      passos: ["Prego " + pr.nome + ": fe,k = 0,082·ρk·d^−0,3 = " + br(fh, 2) + " MPa (" + NORMA + " 6.2.5); My,Rk = 0,3·fu·d^2,6 = " + br(My, 0) + " N·mm (7.1.4); corte simples madeira–madeira, t1 = " + br(t1, 0) + " mm (guia), t2 = " + br(t2, 1) + " mm → Rk = " + br(cs.Rk, 0) + " N por prego (modo " + cs.modo + ", Tab. 18).",
        "Penetração = " + br(pen, 1) + "·d " + (pen >= 12 ? "≥ 12·d (7.2)" : "< 12·d (7.2) — NÃO ATENDE") + "; " + n + " pregos por ponta (mínimo 2 pinos, 7.1.1); Rd = n·kmod·Rk/γlig = " + n + "·" + br(perf.kmod, 3) + "·" + br(cs.Rk, 0) + "/" + br(ML.PAR.gamaLig, 1) + " = " + br(Rd, 3) + " kN (7.1.2); Vk,d = " + br(Vk, 3) + " kN → η = " + br(eta, 3) + "."] };
  }
  /* chumbador na guia inferior ao cisalhamento (aço–madeira, chapa grossa: a fundação é o apoio rígido, 7.3) e à tração (aço + arruela na guia) */
  function chumbador(ctx, P, Vseg, nBolts, Tbolt, car) {
    var m = ctx.m, ML = m.ML, opc = ctx.opc, cls = m.MM.classe2022(opc.classe), perf = ctx.perfil(car), f = ctx.res(car), res = null, i;
    for (i = 0; i < opc.chumbadorD.length; i++) {
      var d = opc.chumbadorD[i], fh0 = 0.082 * (1 - 0.01 * d) * cls.rhok, My = ML.myRk(d, opc.chumbadorFub), cs = ML.acoMadeiraSimples(fh0, P.b * 1000, d, My, d + 1, 0);
      var RdMad = perf.kmod * cs.Rk / ML.PAR.gamaLig / 1000, ap = ML.acoPino(d, opc.chumbadorFub), Rd = Math.min(RdMad, ap.FvRd);
      var Vb = nBolts > 0 ? Vseg / nBolts : Vseg * 99, eS = Vb / Rd, eT = ap.FtRd > 0 ? Tbolt / ap.FtRd : 0;
      var dArr = 3 * d, areaA = Math.PI / 4 * (dArr * dArr - (d + 1) * (d + 1)), sigA = Tbolt * 1000 / areaA, eA = Tbolt > 0 ? sigA / (0.25 * f.fc0d * opc.alfaN) : 0;
      res = { d: d, fub: opc.chumbadorFub, Rk: cs.Rk, modo: cs.modo, RdMad: RdMad, FvRdAco: ap.FvRd, FtRdAco: ap.FtRd, Vb: Vb, Tb: Tbolt, etaV: eS, etaT: eT, etaArruela: eA, nBolts: nBolts, eta: Math.max(eS, eT, eA),
        passos: ["Chumbador d = " + d + " mm, fub = " + opc.chumbadorFub + " MPa (ISO 898-1 cl. 4.6, Tab. 13 de 7.1.9); fe,0,k = 0,082·(1 − 0,01d)·ρk = " + br(fh0, 2) + " MPa (6.2.5); My,Rk = " + br(My, 0) + " N·mm (7.1.4).",
          "Cisalhamento (7.3, chapa grossa, 7.2 modos c–e): Rk,mad = " + br(cs.Rk, 0) + " N (modo " + cs.modo + "); Rd,mad = kmod·Rk/γlig = " + br(RdMad, 3) + " kN; aço Fv,Rd = 0,6·fub·As/γM2 = " + br(ap.FvRd, 3) + " kN → Rd = " + br(Rd, 3) + " kN; Vd por chumbador = " + br(Vseg, 2) + "/" + nBolts + " = " + br(Vb, 2) + " kN → η = " + br(eS, 3) + ".",
          "Tração: Ft,Rd = 0,9·fub·As/γM2 = " + br(ap.FtRd, 3) + " kN; Td por chumbador = " + br(Tbolt, 2) + " kN → η = " + br(eT, 3) + "; arruela ∅ 3d (7.1.9): σc90 = " + br(sigA, 3) + " MPa → η = " + br(eA, 3) + ". Arrancamento do concreto e resistência da fundação: NÃO verificados."] };
      if (res.eta <= 1 + TOL) break;
    }
    return res;
  }

  /* ============================================================ CONTRAVENTAMENTO */
  function wfPremissas(ctx, P, sMm, kmodCurta) {
    var m = ctx.m, o = ctx.opc, cls = m.MM.classe2022(o.classe), pr = o.prego;
    var lp = P.osbE + Math.min(pr.L - P.osbE, P.b * 1000);                         /* penetração limitada pela guia (38 mm) */
    return m.WF.premissas({ hParede: P.H, s: sMm / 1000, tChapa: P.osbE, d: pr.d, lp: lp, fu: pr.fu, rhoKMad: cls.rhok, rhoMMad: cls.rhom, kmod: kmodCurta, gamaM: m.ML.PAR.gamaLig, reforco: {} });
  }
  function painelDe(P) {
    var des = P.res.deslocU || 0;
    return { painel: P.id, de: 0, ate: P.L, aberturas: arr(P.res.vaos).map(function (v) { return [v.x0 - des, v.x1 - des]; }) };
  }
  /* distribui a força de uma direção entre as paredes ∝ rigidez (diafragma rígido, sem torção) e dimensiona o prego de borda, o hold-down e a base */
  function contraventar(ctx, paredes, vento, geo, cargas) {
    var m = ctx.m, o = ctx.opc, WF = m.WF, perfC = ctx.perfil("curta"), kmodC = perfC.kmod, out = { linhas: [], porParede: {}, forcas: {} };
    if (!vento.ok) return out;
    var dirs = [{ id: "ridge", nome: "ao longo da cumeeira", F: vento.F.ridge, caso: vento.casoRidge, test: function (p) { return paraleloA(p, geo.R); } },
      { id: "across", nome: "através da cumeeira", F: vento.F.across, caso: vento.casoAcross, test: function (p) { return perpA(p, geo.R); } }];
    dirs.forEach(function (D) {
      var grupo = paredes.filter(function (p) { return D.test(p) && p.osb; }), semOsb = paredes.filter(function (p) { return D.test(p) && !p.osb; });
      var Ks = grupo.map(function (p) {
        var P0 = wfPremissas(ctx, p, p.res.params.espOsbBorda, kmodC), pn = painelDe(p), K = WF.rigidez(pn, P0).bruto.K_kN_m;
        return { p: p, K: K, P0: P0, pn: pn };
      });
      var sK = 0; Ks.forEach(function (k) { sK += k.K; });
      out.forcas[D.id] = { nome: D.nome, Fk: D.F, caso: D.caso, nParedes: grupo.length, somaK: sK, semOsb: semOsb.map(function (p) { return p.id; }) };
      if (!(sK > 0)) { if (D.F > 0) ctx.aviso("Contraventamento " + D.nome + ": nenhuma parede com OSB e trecho de altura inteira resiste ao vento (F,k = " + br(D.F, 2) + " kN)."); return; }
      /* linhas: paredes na mesma coordenada transversal */
      var linhas = [], eixoT = D.id === "ridge" ? geo.S : geo.R;
      Ks.forEach(function (k) {
        var c = k.p.cx * eixoT[0] + k.p.cz * eixoT[1], l = null;
        linhas.forEach(function (x) { if (Math.abs(x.c - c) < 0.5) l = x; });
        if (!l) { l = { c: c, paredes: [], K: 0 }; linhas.push(l); }
        l.paredes.push(k.p.id); l.K += k.K; k.linha = l;
      });
      linhas.sort(function (u, v) { return u.c - v.c; });
      /* ENVOLTÓRIA: diafragma rígido (∝ rigidez) × diafragma flexível (∝ área de influência: faixa entre os pontos médios das linhas e as bordas da planta); vale o maior por linha */
      var lo = eixoT[0] ? geo.caixa.x0 : geo.caixa.z0, hi = eixoT[0] ? geo.caixa.x1 : geo.caixa.z1, sT = 0;
      linhas.forEach(function (l, i) { var inf = i === 0 ? lo : (linhas[i - 1].c + l.c) / 2, sup = i === linhas.length - 1 ? hi : (l.c + linhas[i + 1].c) / 2; l.trib = Math.max(0, sup - inf); sT += l.trib; });
      linhas.forEach(function (l, i) {
        l.fRig = l.K / sK; l.fFlex = sT > 0 ? l.trib / sT : l.fRig; l.fUsada = Math.max(l.fRig, l.fFlex);
        out.linhas.push({ id: D.id + "-L" + (i + 1), direcao: D.id, nome: D.nome, c: rr(l.c, 3), paredes: l.paredes, K_kN_m: rr(l.K, 1), larguraInfluencia_m: rr(l.trib, 3), Fk_rigido_kN: D.F * l.fRig, Fk_flexivel_kN: D.F * l.fFlex,
          criterio: l.fFlex > l.fRig + 1e-12 ? "diafragma flexível (área de influência)" : "diafragma rígido (rigidez)", Fk_kN: D.F * l.fUsada, Fd_kN: o.gamaQ * D.F * l.fUsada });
      });
      Ks.forEach(function (k) {
        var P = k.p, Fk = D.F * k.linha.fUsada * k.K / k.linha.K, Vd = o.gamaQ * Fk, bruto = WF.resistencia(k.pn, k.P0), tr = WF.trechos(k.pn, k.P0);
        var kBase = D.F > 0 ? (D.id === "ridge" ? vento.Fbase.ridge : vento.Fbase.across) / D.F : 1;
        out.porParede[P.id] = { direcao: D.id, K: k.K, Fk: Fk, Vd: Vd, VdBase: Vd * Math.max(1, kBase), criterio: k.linha.fFlex > k.linha.fRig + 1e-12 ? "flexível" : "rígido", trechos: tr, P0: k.P0, pn: k.pn, FvRdModelo: bruto.FvRd_kN };
      });
    });
    return out;
  }

  function dimensionarPrego(ctx, P, ct, cg, kmodC) {
    var m = ctx.m, o = ctx.opc, WF = m.WF, WFr = [], escolha = null, i;
    /* o prego do MODELO é o ponto de partida (tentativas[0]); o cálculo só APERTA o espaçamento (150 → 100 → 75 → 50), nunca afrouxa o que o modelo já tem */
    var sMod = P.res.params.espOsbBorda, lista = o.espacamentosPrego.filter(function (x) { return x < sMod - 1e-9; });
    lista.unshift(sMod); lista.sort(function (a, b) { return b - a; });
    for (i = 0; i < lista.length; i++) {
      var s = lista[i], P0 = wfPremissas(ctx, P, s, kmodC), rs = WF.resistencia(ct.pn, P0), tr = WF.trechos(ct.pn, P0);
      var Kt = tr.map(function (t) { return WF.kTrecho(t.b, P0, { h: P.H, s: s / 1000, faces: 1 }); }), sK = 0; Kt.forEach(function (k) { sK += k; });
      var etaW = rs.bruto.FvRd_kN > 0 ? ct.Vd / rs.bruto.FvRd_kN : 99, etaT = 0;
      tr.forEach(function (t, j) { var Vj = sK > 0 ? ct.Vd * Kt[j] / sK : 0, e = t.FvRd_kN > 0 ? Vj / t.FvRd_kN : 99; if (e > etaT) etaT = e; });
      var e = Math.max(etaW, etaT), reg = { s: s, FvRd: rs.bruto.FvRd_kN, eta: e, P0: P0, trechos: tr, Kt: Kt, sK: sK };
      WFr.push(reg);
      if (!escolha && e <= 1 + TOL) escolha = reg;
    }
    return { tentativas: WFr, escolha: escolha || WFr[WFr.length - 1], atende: !!escolha };
  }

  /* ============================================================ UMA PAREDE */
  function calcularParede(ctx, P, ctxo) {
    var m = ctx.m, o = ctx.opc, cmb = combinacoes(o), cls = m.MM.classe2022(o.classe), checks = [], R = { id: P.id, tipo: P.tipoId, ext: P.ext, osb: P.osb, L: P.L, H: P.H, modelo: { secao: P.sec.slice(), espac: P.espac } };
    P.fragil = o.revestimento === "fragil" ? true : (o.revestimento === "naoFragil" ? false : P.fragilAuto);
    var cadeiaH = ctxo.cadeia, tribCob = ctxo.trib[P.id] || 0, tribPav = ctxo.tribPav[P.id] || 0, cob = ctxo.cob, pav = ctxo.pav, vento = ctxo.vento, pw = pesoParede(ctx, P);
    R.pesoParede = pw;
    var gH = pw.total * P.H;                                                    /* kN/m: peso próprio da parede acima da base */
    /* cargas lineares no topo da parede (kN/m, características) */
    var Gcob = cob ? (cob.gPlano + num(cob.forro, 0) + num(o.estruturaCobertura, 0) + num(cob.estrutura, 0)) * tribCob : 0, Sc = cob ? (cob.sc != null ? cob.sc : o.sobrecargaCobertura) * tribCob + (cob && cob.scForro ? cob.scForro * tribCob : 0) : 0;
    var Gpav = pav ? num(pav.g, 0) * tribPav : 0, Qpav = pav ? num(pav.q, 0) * tribPav : 0;
    var Upl = vento && vento.ok && cob ? vento.succaoCobertura * tribCob : 0;
    R.cargas = { tribCob: tribCob, tribPav: tribPav, Gcob: Gcob, Gpav: Gpav, Sc: Sc + Qpav, Upl: Upl, pesoParedeTopo: gH, perm: Gcob + Gpav, variavel: Sc + Qpav };
    var Gl = Gcob + Gpav, Qk = Sc + Qpav;
    var pv = P.ext && vento && vento.ok ? (paraleloA(P, ctxo.geo.R) ? vento.pFace.lateral : vento.pFace.oitao) : 0;
    R.vento = { pv: pv, aplicavel: !!(P.ext && vento && vento.ok) };
    if (!P.ext) ctx.naoVerificado("vento-parede-interna", "Parede interna: pressão do vento e ação horizontal mínima de divisória não verificadas (a NBR 6123 não dá coeficiente para parede interna; a NBR 6120:2019 não fixa carga lateral de divisória) — o RT define.");
    /* ---------- montante de campo: cresce seção e/ou reduz espaçamento ---------- */
    var travFraco = travamentoFraco(ctx, P), cand = [], ci, ei;
    var iAtual = 0; cadeiaH.forEach(function (c, i) { if (c.h === P.sec[1]) iAtual = i; });
    var espacs = [600, 400, 300].filter(function (e) { return e <= P.espac + 1e-9; }); if (espacs.indexOf(P.espac) < 0) espacs.unshift(P.espac); espacs.sort(function (a, c) { return c - a; });
    for (ci = iAtual; ci < cadeiaH.length; ci++) for (ei = 0; ei < espacs.length; ei++) cand.push({ h: cadeiaH[ci].h, compra: cadeiaH[ci].compra, espac: espacs[ei], custo: P.sec[0] * cadeiaH[ci].h / espacs[ei], isModelo: cadeiaH[ci].h === P.sec[1] && espacs[ei] === P.espac });
    cand.sort(function (a, c) { return a.custo - c.custo || a.h - c.h; });
    function rodar(c) {
      var trib = c.espac / 1000, nG = (Gl + gH) * trib, nS = Qk * trib, nU = Upl * trib;
      return verificarMontante(ctx, { b: P.sec[0] / 1000, h: c.h / 1000, L: P.hMont, Lz: travFraco, trib: trib, N: { G: nG, Sc: nS, U: nU }, pv: pv, fragil: P.fragil });
    }
    var vm = rodar({ h: P.sec[1], espac: P.espac }), esc = null;
    cand.forEach(function (c) { if (!esc) { var v = rodar(c); if (v.eta <= 1 + TOL) { esc = { c: c, v: v }; } } });
    var tentativas = cand.slice(0, 40).length;
    R.montante = { modelo: { secao: P.sec.slice(), espac: P.espac, eta: vm.eta, ok: vm.ok, v: vm },
      calculado: esc ? { secao: [P.sec[0], esc.c.h], compra: esc.c.compra, espac: esc.c.espac, eta: esc.v.eta, ok: true, v: esc.v, mudou: !esc.c.isModelo } : null, travamentoFraco: travFraco, hMont: P.hMont, candidatos: tentativas, trib: P.espac / 1000 };
    if (!esc) ctx.aviso("Parede " + P.id + ": nenhum montante do catálogo (até 38×" + cadeiaH[cadeiaH.length - 1].h + " a " + espacs[espacs.length - 1] + " mm) atende — rever carga, altura ou travamento.");
    var sec = esc ? esc.c : { h: P.sec[1], espac: P.espac };
    /* ---------- montante de ponta/ombreira (rei): faixa de influência maior pelo vento do vão ---------- */
    R.reis = [];
    arr(P.res.vaos).forEach(function (v) {
      var vl = v.x1 - v.x0, tribRei = sec.espac / 2000 + vl / 2, nG = (Gl + gH) * (sec.espac / 1000 / 2), nS = Qk * sec.espac / 2000, nU = Upl * sec.espac / 2000;
      var out = null, n;
      for (n = 1; n <= 3 && !out; n++) {
        var vr = verificarMontante(ctx, { b: P.sec[0] / 1000, h: sec.h / 1000, L: P.hMont, Lz: travFraco, trib: tribRei / n, N: { G: nG / n, Sc: nS / n, U: nU / n }, pv: pv, fragil: P.fragil });
        if (vr.eta <= 1 + TOL) out = { n: n, v: vr };
      }
      R.reis.push({ vao: v.id, vaoLivre: vl, tribRei: tribRei, nReis: out ? out.n : 4, ok: !!out, eta: out ? out.v.eta : null, v: out ? out.v : null });
    });
    /* ---------- vergas ---------- */
    R.vergas = [];
    arr(P.res.vaos).forEach(function (v, iv) {
      var vl = v.x1 - v.x0, vi = arr(P.res.vergas).filter(function (x) { return String(x.vao) === String(v.id); })[0] || { pecas: 2, secao: [38, 140] };
      var nP = vi.pecas || 2, bTot = nP * P.sec[0] / 1000, disp = (P.H - 2 * P.b) - v.y1, hJack = v.y1 - P.b;
      var qG0 = Gl + pw.total * Math.max(0, P.H - v.y1), qQ0 = Qk;
      var iV = 0; cadeiaH.forEach(function (c, i) { if (c.h === vi.secao[1]) iV = i; });
      var hMod = vi.secao[1], vModelo = verificarVerga(ctx, { vao: vl, b: bTot, h: hMod / 1000, qG: qG0, qQ: qQ0, hJack: hJack, Lz: travFraco, fragil: P.fragil });
      var ok = null, k, ultimo = null;
      for (k = 0; k < cadeiaH.length; k++) {
        var hk = cadeiaH[k].h; if (hk < hMod) continue;
        var rv = verificarVerga(ctx, { vao: vl, b: bTot, h: hk / 1000, qG: qG0, qQ: qQ0, hJack: hJack, Lz: travFraco, fragil: P.fragil }); ultimo = { k: k, rv: rv };
        if (rv.ok) { ok = { k: k, rv: rv }; break; }
      }
      var sel = ok || ultimo;
      R.vergas.push({ vao: v.id, vaoLivre: vl, pecas: nP, disponivel: disp, tabela: { secao: [P.sec[0], hMod], eta: vModelo.eta, ok: vModelo.ok, v: vModelo },
        calculada: { secao: [P.sec[0], cadeiaH[sel.k].h], compra: cadeiaH[sel.k].compra, eta: sel.rv.eta, ok: !!ok, cabe: cadeiaH[sel.k].h / 1000 <= disp + 1e-9, v: sel.rv, mudou: cadeiaH[sel.k].h !== hMod },
        jacks: sel.rv.nJackAdotado, jacksModelo: 1 });
      if (!ok) ctx.aviso("Parede " + P.id + ", vão " + v.id + ": nenhuma verga do catálogo atende com " + br(qG0, 2) + " kN/m permanente + " + br(qQ0, 2) + " kN/m de sobrecarga.");
      else if (cadeiaH[sel.k].h / 1000 > disp + 1e-9) ctx.aviso("Parede " + P.id + ", vão " + v.id + ": a verga calculada (38×" + cadeiaH[sel.k].h + ") não cabe sob a guia (" + br(disp * 1000, 0) + " mm livres): baixar o vão ou reduzir a carga.");
    });
    /* ---------- ligação do montante na guia e esforços de ancoragem por montante ---------- */
    var Vstud = o.gamaQ * pv * (sec.espac / 1000) * P.hMont / 2;
    var pm = pregoMontanteGuia(ctx, P, Vstud, "curta");
    var Tm = Math.max(0, (o.gamaQ * Upl - o.gamaGfav * (Gl + gH)) * (sec.espac / 1000));
    R.ligacoes = { montanteGuia: pm, T_montante_kN: Tm };
    if (Tm > 0) ctx.naoVerificado("ancoragem-montante", "Ancoragem do montante à tração (força T,d por montante informada no resultado): pregação de topo não resiste à sucção — conectores metálicos (cinta/cantoneira) dimensionados com o fabricante.");
    R.eta = max0([R.montante.calculado ? R.montante.calculado.eta : vm.eta, pm.eta]);
    return R;
  }

  /* ============================================================ API */
  function coberturaDeEntrada(opc) {
    var c = opc.cobertura; if (!ehObj(c)) return null;
    var g = num(c.g, null); if (g == null) return null;
    var incl = num(c.inclPct, 0), cosT = incl > 0 ? Math.cos(Math.atan(incl / 100)) : 1;
    return { tipo: c.tipo || "T2", g: g, gPlano: g / cosT, forro: num(c.forro, 0), estrutura: num(c.estrutura, 0), sc: c.sc != null ? num(c.sc, 0.5) : null, scForro: num(c.scForro, 0), inclPct: incl, beiral: num(c.beiral, 0), hBeiral: num(c.hBeiral, 0) > 0 ? num(c.hBeiral, 0) : null, ladoAlto: c.ladoAlto === "direita" ? "direita" : (c.ladoAlto === "esquerda" ? "esquerda" : null), beiralOitao: c.beiralOitao != null ? num(c.beiralOitao, 0) : null, oitao: ehObj(c.oitao) ? c.oitao : null, eixoCumeeira: c.eixoCumeeira || null, fonte: c.fonte || "informada" };
  }

  /* A COBERTURA DESENHADA NO BIM → cargas: o telhado do modelo lido pelo MadCobertura (telha do catálogo + ripas/caibros = peso por m² de água, inclinação,
     beiral, eixo da cumeeira). O peso das tesouras/terças só entra se vier em opc.estruturaCobertura (o módulo da cobertura calcula as seções depois). */
  function coberturaDoEstado(estado, extra) {
    var MC = dep("MadCobertura", "./madcobertura.js"), tl = arr(estado && estado.telhados);
    if (!MC || !tl.length) return null;
    var t = tl[0], lido = MC.lerTelhado(estado, t.id);
    if (!lido || !lido.ok) return { erro: lido && lido.motivo ? lido.motivo : "telhado não lido" };
    var modelo = MC.modeloMadeira("tesoura", lido), tr = MC.trama(lido, modelo), pe = MC.pesos(lido, tr);
    var be = typeof lido.beiral === "number" ? lido.beiral : (lido.beiral && lido.beiral.eave && lido.beiral.eave.length ? lido.beiral.eave[0] : 0);
    var bo = lido.beiral && lido.beiral.gable && lido.beiral.gable.length ? lido.beiral.gable[0] : null;
    var o = { tipo: lido.tipo, g: pe.total, inclPct: lido.incl, beiral: be, beiralOitao: bo, hBeiral: lido.peDireito > 0 ? lido.peDireito : null, eixoCumeeira: lido.eixoA === "x" || lido.eixoA === "z" ? lido.eixoA : null, fonte: "telhado " + t.id + " do modelo (MadCobertura.pesos: " + arr(pe.fontes).join("; ") + ")" };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] != null) o[k] = extra[k];
    return o;
  }

  function calcular(entrada) {
    var m = mot(); entrada = entrada || {};
    var falt = ["MM", "MD", "ML", "WF", "W"].filter(function (k) { return !m[k]; });
    if (falt.length) return { ok: false, motivo: "Motores não carregaram: " + falt.join(", "), preliminar: true, paredes: {}, premissas: [], naoVerificado: [], avisos: [] };
    var opc = mescla(PADRAO, entrada.opc || entrada.opcoes || {}), ctx = new Ctx(opc, m), estado = entrada.estado || { caixas: [] }, vaos = entrada.vaos || {};
    var entradaOpc = {}; Object.keys(entrada.opc || entrada.opcoes || {}).forEach(function (k) { entradaOpc[k] = (entrada.opc || entrada.opcoes)[k]; });
    if (!ehObj(opc.cobertura) && arr(estado.telhados).length) { var cd = coberturaDoEstado(estado, null); if (cd && !cd.erro) { opc.cobertura = cd; entradaOpc.cobertura = cd; } else if (cd) ctx.aviso("Cobertura do modelo não lida: " + cd.erro); }
    try { m.MM.classe2022(opc.classe); } catch (e) { return { ok: false, motivo: e.message, preliminar: true, paredes: {}, premissas: [], naoVerificado: [], avisos: [] }; }
    var cls = m.MM.classe2022(opc.classe);
    ctx.premissa("classe", "Classe de resistência do Pinus autoclavado: " + opc.classe.replace("peca:", "") + " (fc0,k " + cls.fc0k + ", fm,k " + cls.fmk + ", fv,k " + cls.fvk + ", fc90,k " + cls.fc90k + ", E0,med " + cls.Ec0m + " MPa). O catálogo Nibra não informa classe: é a premissa do MadWoodFrame. CONDICIONADA ao certificado de classificação do lote entregue (NBR 7190-2): sem ele a classe não vale.", NORMA + " 5.7.1, Tab. 3 (peças estruturais, 7190-4)");
    ctx.premissa("umidade", "Classe de umidade " + opc.umidade + " (kmod2 " + (opc.umidade === 2 ? "0,90" : (opc.umidade === 3 ? "0,80" : "da Tab. 5")) + "): " + (opc.umidade === 2 ? "decisão do RT para parede protegida (externa com revestimento ventilado); a classe 3 é a opção." : "opção escolhida (o padrão declarado é a classe 2, parede protegida)."), NORMA + " 5.5 (Tab. 1) e 5.8.4.2 (Tab. 5)");
    ctx.premissa("combinacoes", "Combinações últimas da NBR 8681:2003 (γ 1,4; ψ0 0,7 sobrecarga e 0,6 vento): a 8681:2025 está vigente e não foi conferida.", "NBR 8681:2003; como MadDimensionar.combinacoes");
    ctx.premissa("duracao", "Sobrecarga como classe de carregamento 'longa duração' (kmod1 0,70); vento como 'curta duração' (0,90).", NORMA + " 5.8.4.1, Tab. 4 (a classe é a da variável principal)");
    ctx.premissa("pregos-osb", "Painel de OSB pregado pelo EN 1995-1-1 (9.2.4.2 e 8.3.1.1, via MadWoodFrame) como REFERÊNCIA COMPLEMENTAR, com kmod e γlig da NBR 7190-1:2022 aplicados (a 6.2.5 declara que suas expressões de embutimento não valem para OSB/compensado). G da chapa 500 MPa e ρk 400 kg/m³ são premissas do MadWoodFrame (o catálogo não informa). Premissa para o RT confirmar.", "EN 1995-1-1:2004; NBR 7190-1:2022 6.2.5 e 7.1.2");
    ctx.premissa("redrigidez", "Rigidez do painel com redução de 50 % pela folga das ancoragens e ligações; distribuição do vento entre as linhas pela rigidez, diafragma rígido, sem torção.", "premissa do MadWoodFrame (paineis_travamento.py)");
    var cadeiaH = cadeia(m);
    /* ---- paredes ---- */
    var vzTodos = vaos, paredes = [], erros = [];
    arr(estado.caixas).forEach(function (c) {
      if (!m.W.ehWf(c)) return;
      var vz = vzTodos[c.id] ? arr(vzTodos[c.id].aceitos) : [], P = lerParede(c, vz, m);
      if (!P.ok) { erros.push("Parede " + P.id + ": " + P.motivo); return; }
      paredes.push(P);
    });
    if (!paredes.length) return { ok: false, motivo: "Não há parede de Wood Frame no modelo.", preliminar: true, paredes: {}, premissas: ctx.premissas, naoVerificado: [], avisos: erros };
    var cob = coberturaDeEntrada(opc), pav = ehObj(opc.pavimento) ? opc.pavimento : null, geo = geometriaPlanta(paredes, cob);
    ctx.gMad = (cls.rhom || cls.rhok / 0.83) * G / 1000;
    if (!cob) { ctx.pendencia("cobertura não informada no modelo (sem telhado desenhado nem opc.cobertura: sem cargas de telhado/forro e sem sucção)"); ctx.naoVerificado("cobertura", "Cargas de telhado, forro e estrutura da cobertura: cobertura NÃO informada — as paredes foram verificadas só com peso próprio, sobrecarga zero e sem sucção (informe opc.cobertura)."); }
    else {
      ctx.premissa("cobertura-g", "Peso da telha + trama (" + br(cob.g, 2) + " kN/m² de água) e forro (" + br(cob.forro, 2) + " kN/m²) vêm do módulo da cobertura (" + cob.fonte + "); peso das tesouras/terças " + (num(opc.estruturaCobertura, 0) + cob.estrutura > 0 ? "informado" : "NÃO informado (0)") + ".", "MadCobertura.pesos / informado");
      ctx.premissa("sobrecarga-cobertura", "Sobrecarga de cobertura " + br(cob.sc != null ? cob.sc : opc.sobrecargaCobertura, 2) + " kN/m² (NBR 6120:2019 6.4: 0,25 a 0,50 kN/m² conforme a inclinação; adotado o máximo, a favor); 7190-1 10.2.1 exige no mínimo 0,25 kN/m² em projeção horizontal.", "NBR 6120:2019 6.4; " + NORMA + " 10.2.1");
      ctx.premissa("apoio-cobertura", "A cobertura apoia nas paredes externas paralelas à cumeeira (largura de influência = meia distância entre as linhas de apoio + beiral); o oitão não recebe reação de telhado (tesoura de extremidade sobre a parede lateral). A ligação telhado–parede NÃO é verificada aqui.", "premissa RA");
      ctx.naoVerificado("ligacao-cobertura", "Ligação da cobertura com a parede (cinta, cantoneira, parafuso de topo): vem do módulo da cobertura; aqui só a força de arrancamento entra no hold-down e na ancoragem do montante.");
    }
    if (pav) { ctx.premissa("pavimento", "Pavimento sobre a parede com g = " + br(num(pav.g, 0), 2) + " e q = " + br(num(pav.q, 0), 2) + " kN/m² informados (NBR 6120:2019 Tab. 10 define o q; não há default).", "informado"); }
    if (cob && !oitaoInformado(cob) && paredes.some(function (p) { return p.estrutural && !paraleloA(p, geo.R); })) ctx.pendencia("oitão sem informação da cobertura (espaçamento das tesouras ou vão das terças apoiadas na empena): largura de influência do oitão = 0 (cobertura.oitao)");
    var intPort = paredes.filter(function (p) { return p.estrutural && !p.ext; }).map(function (p) { return p.id; });
    if (intPort.length) { ctx.pendencia("vento em parede interna portante (" + intPort.join(", ") + ") não verificado"); }
    /* ALTURA do beiral: a MAIOR entre a do telhado (pé-direito) e a das paredes; diferença acima de 10 % vira pendência. Telhado de 1 ÁGUA: a altura-base é a do beiral BAIXO (pé-direito do telhado,
       senão a menor parede paralela à cumeeira) e a parede alta sobe b·tg θ. */
    var hMaxP = geo.hBeiral, hCob = cob && cob.hBeiral > 0 ? cob.hBeiral : null, uma = !!(cob && cob.tipo === "T1");
    if (uma) {
      var lat = paredes.filter(function (p) { return p.ext && paraleloA(p, geo.R); }), hMinL = lat.length ? Math.min.apply(null, lat.map(function (p) { return p.H; })) : hMaxP;
      geo.hBeiral = hCob || hMinL;
      ctx.pendencia("vento de telhado de 1 água: confirmar RT (Tab. 6 da NBR 6123 sem vento oblíquo; lado alto '" + (cob.ladoAlto || "esquerda") + "' adotado; parede alta = beiral baixo + b·tg θ)");
    } else if (hCob) {
      if (Math.abs(hCob - hMaxP) / Math.max(hCob, hMaxP) > 0.10) ctx.pendencia("altura do beiral do telhado (" + br(hCob, 2) + " m) difere em mais de 10 % da maior parede (" + br(hMaxP, 2) + " m): conferir o pé-direito");
      geo.hBeiral = Math.max(hCob, hMaxP);
    }
    var vento = ventoDe(ctx, geo, cob, paredes);
    if (!vento.ok) ctx.naoVerificado("vento", "Vento NBR 6123: " + vento.motivo + " — flexão do montante, flecha, contraventamento, hold-down e chumbador NÃO verificados para a ação horizontal.");
    else {
      ctx.premissa("vento-envolvente", "Pressão do vento na face = a maior |p| entre todos os casos e zonas da face (lateral ou oitão), com o cpi mais nocivo; sem redução por zona local. V0 " + br(vento.v0, 0) + " m/s, categoria " + vento.categoria + ", S1 " + br(vento.s1.valor, 2) + ", grupo S3 " + vento.grupoS3 + " (do cadastro da obra).", vento.edicao);
      ctx.premissa("vento-topo", "Força no topo das paredes contraventantes = vento da MEIA altura das paredes (a metade de baixo vai direto à fundação) + triângulo do oitão (pressão média da face × área acima do beiral) + componente horizontal das águas (p·A·tg θ); a base (chumbadores) leva a altura inteira. O quadro tem altura constante: o oitão triangular não é modelado como parede.", "premissa RA; NBR 6123 Tab. 4 e 5");
      ctx.naoVerificado("torcao", "Torção por excentricidade do vento (6.6 da NBR 6123) e momento de tombamento global da edificação: não considerados na distribuição entre as linhas.");
    }
    var trib = larguraInfluencia(paredes, geo, cob, true), tribPav = pav ? larguraInfluencia(paredes, geo, null, false) : {};
    var ctxo = { cadeia: cadeiaH, trib: trib, tribPav: tribPav, cob: cob, pav: pav, vento: vento, geo: geo };
    var resParedes = {};
    paredes.forEach(function (P) {
      try { resParedes[P.id] = calcularParede(ctx, P, ctxo); } catch (e) { erros.push("Parede " + P.id + ": " + (e && e.message ? e.message : e)); }
    });
    /* ---- contraventamento ---- */
    var cg = { };
    var cv = contraventar(ctx, paredes.filter(function (P) { return resParedes[P.id]; }), vento, geo, cg), perfC = ctx.perfil("curta"), perfL = ctx.perfil(opc.carregamentoGravidade);
    paredes.forEach(function (P) {
      var R = resParedes[P.id]; if (!R) return;
      var ct = cv.porParede[P.id];
      if (!ct) { R.contraventamento = { contribui: false, motivo: !P.osb ? "sem chapa de OSB: não contraventa" : (vento.ok ? "sem trecho de altura inteira com largura ≥ H/4" : "vento não calculado") }; return; }
      var dp = dimensionarPrego(ctx, P, ct, cg, perfC.kmod), esc = dp.escolha, modelo = dp.tentativas[0];
      var des = P.res.deslocU || 0, tr = esc.trechos, sK = esc.sK, segs = [];
      var cargaPerm = (R.cargas.perm + R.cargas.pesoParedeTopo), up = o_uplift(opc, R.cargas.Upl);
      var posCh = m.W.posChumbadores(P.res);
      tr.forEach(function (t, j) {
        var Vj = sK > 0 ? ct.Vd * esc.Kt[j] / sK : 0, arm = Math.max(0.2, t.b - P.sec[0] / 1000), M = Vj * P.H;
        var Wfav = cargaPerm * t.b - up * t.b;                                           /* 1,0·G − 1,4·U ao longo do trecho */
        var qMax = opc.gamaG * cargaPerm + opc.gamaQ * opc.psi0Q * R.cargas.variavel;     /* kN/m: 1,4G + 0,98Sc ao longo da parede */
        var T = (M - 0.5 * Wfav * t.b) / arm, Cmax = 0;                                           /* tração no montante de ponta: M/braço − metade do peso do trecho (a favor: só 1,0G − 1,4U) */
        var hSec = (R.montante.calculado ? R.montante.calculado.secao[1] : P.sec[1]) / 1000, fC = ctx.res("curta"), limC = 0.25 * fC.fc0d * opc.alfaN, nB = 0, nEnds = [], nReqs = [], eC = 0, eCmod = 0, eAp = 0;
        posCh.forEach(function (u) { if (u >= t.de - 1e-6 && u <= t.ate + 1e-6) nB++; });
        [0, 1].forEach(function (lado) {
          /* pacote de montantes na ponta do trecho (ponta/canto = montantes de ponta; ombreira = rei + jack) */
          var n = arr(P.res.pecas).filter(function (p) {
            if (p.grupo !== "madeira" || !/^(montante-extremo|montante-canto|montante-encontro|ombreira-)/.test(p.tipo)) return false;
            var a0 = p.u0 - des, a1 = p.u1 - des;
            return lado === 0 ? (a1 > t.de + 1e-6 && a0 < t.de + 0.12) : (a0 < t.ate - 1e-6 && a1 > t.ate - 0.12);
          }).length;
          n = Math.max(1, n); nEnds.push(n);
          function pacote(nn) {
            var tribEnd = (R.montante.calculado ? R.montante.calculado.espac : P.espac) / 2000 + nn * P.sec[0] / 1000, Cl = M / arm + qMax * tribEnd;
            var vc = ctx.m.MD.compressao2022({ N: Cl / nn, Mx: 0, My: 0, b: P.sec[0] / 1000, h: hSec, L0x: P.hMont, L0y: R.montante.travamentoFraco, classe: opc.classe, perfil: perfC });
            var sig = Cl / (nn * (P.sec[0] / 1000) * hSec) / 1e3;
            return { C: Cl, eta: Math.max(vc.eta, sig / limC), etaComp: vc.eta, etaApoio: sig / limC };
          }
          var pm = pacote(n), pq = pm, nr = n;
          while (pq.eta > 1 + TOL && nr < 4) { nr++; pq = pacote(nr); }
          nReqs.push(nr);
          if (pm.eta > eCmod) eCmod = pm.eta; if (pq.eta > eC) eC = pq.eta; if (pq.etaApoio > eAp) eAp = pq.etaApoio; if (pq.C > Cmax) Cmax = pq.C;
        });
        segs.push({ de: t.de, ate: t.ate, b: t.b, c: t.c, V: Vj, M: M, T: T, C: Cmax, nEnd: nEnds, nEndReq: nReqs, nChumb: nB, etaC: eC, etaCModelo: eCmod, etaApoio: eAp, hd: T > 0.05, FvRd: t.FvRd_kN, etaV: t.FvRd_kN > 0 ? Vj / t.FvRd_kN : 99 });
      });
      /* chumbador: o pior trecho (cisalhamento V por chumbador) */
      var pior = null; segs.forEach(function (s) { var v = s.nChumb > 0 ? s.V / s.nChumb : s.V * 99; if (!pior || v > pior.v) pior = { v: v, s: s }; });
      var upl = Math.max(0, -(cargaPerm - up)) * Math.min(opc.chumbadorMaxEsp, P.L);   /* arrancamento linear (kN) por vão de chumbador */
      var kBaseP = ct.Vd > 0 ? ct.VdBase / ct.Vd : 1, cb = pior ? chumbador(ctx, P, pior.s.V * kBaseP, Math.max(pior.s.nChumb, 0), upl, "curta") : null;
      var hdMax = 0; segs.forEach(function (s) { if (s.T > hdMax) hdMax = s.T; });
      var hdPontas = { ini: 0, fim: 0 }; if (segs.length) { hdPontas.ini = Math.max(0, segs[0].de < 0.12 ? segs[0].T : 0); var ult = segs[segs.length - 1]; hdPontas.fim = Math.max(0, Math.abs(ult.ate - P.L) < 0.12 ? ult.T : 0); }
      var etaV = Math.max(modelo.eta, 0);
      R.contraventamento = { contribui: true, direcao: ct.direcao, K: ct.K, Fk: ct.Fk, Vd: ct.Vd, VdBase: ct.VdBase, criterio: ct.criterio, FvRdModelo: modelo.FvRd, etaModelo: modelo.eta, espModelo: modelo.s,
        pregoBorda: { s: esc.s, FvRd: esc.FvRd, eta: esc.eta, atende: dp.atende, prego: opc.prego, tentativas: dp.tentativas.map(function (x) { return { s: x.s, FvRd: x.FvRd, eta: x.eta }; }) },
        trechos: segs, hdMax: hdMax, hdPontas: hdPontas, chumbador: cb, etaC: max0(segs.map(function (s) { return s.etaC; })), eta: Math.max(esc.eta, max0(segs.map(function (s) { return s.etaC; })), cb ? cb.eta : 0) };
      R.eta = Math.max(R.eta, R.contraventamento.eta);
      if (!dp.atende) ctx.aviso("Parede " + P.id + ": nem com prego de borda a " + opc.espacamentosPrego[opc.espacamentosPrego.length - 1] + " mm o painel resiste ao vento (η " + br(esc.eta, 2) + ") — OSB nas duas faces, mais paredes contraventantes ou trecho cheio maior.");
    });
    /* ---- consolidação ---- */
    var nReprova = 0, nSemSolucao = 0, etaMax = 0, naoConforme = [];
    Object.keys(resParedes).forEach(function (id) {
      var R = resParedes[id], semSol = false, rep = false;
      var mo = R.montante.modelo; if (!mo.ok) rep = true; if (!R.montante.calculado) semSol = true;
      R.vergas.forEach(function (v) { if (!v.tabela.ok || !v.tabela.v.apoioOk) rep = true; if (!v.calculada.ok || !v.calculada.cabe) semSol = true; });
      R.reis.forEach(function (r) { if (!r.ok) semSol = true; });
      if (R.contraventamento && R.contraventamento.contribui) { if (R.contraventamento.etaModelo > 1 + TOL || R.contraventamento.trechos.some(function (t) { return t.etaCModelo > 1 + TOL; })) rep = true; if (R.contraventamento.trechos.some(function (t) { return t.etaC > 1 + TOL; })) semSol = true; if (!R.contraventamento.pregoBorda.atende) semSol = true; }
      if (!R.ligacoes.montanteGuia.ok) semSol = true;
      R.reprovaModelo = rep; R.semSolucao = semSol; if (rep) { nReprova++; naoConforme.push(id); } if (semSol) nSemSolucao++;
      etaMax = Math.max(etaMax, R.eta, mo.eta);
    });
    var pend = ctx.premissas.filter(function (p) { return !p.confirmada; }), motivos = [];
    if (nReprova) motivos.push(nReprova + " parede(s) do modelo reprovam na verificação (seção/espaçamento/prego do modelo diferem do calculado): " + naoConforme.join(", "));
    if (nSemSolucao) motivos.push(nSemSolucao + " parede(s) sem solução no catálogo");
    if (pend.length) motivos.push(pend.length + " premissa(s) sem confirmação do RT");
    if (ctx.nv.some(function (x) { return x.id === "vento"; })) motivos.push("vento não calculado");
    ctx.pend.forEach(function (x) { motivos.push(x); });
    var linhas = cv.linhas;
    return saneia({ ok: true, versao: 1, norma: NORMA, preliminar: motivos.length > 0, motivosPreliminar: motivos, opc: { classe: opc.classe, umidade: opc.umidade, prego: opc.prego, pregoMontante: opc.pregoMontante }, classe: { id: opc.classe, nome: cls.nome, fc0k: cls.fc0k, fmk: cls.fmk, fvk: cls.fvk, fc90k: cls.fc90k, Ec0m: cls.Ec0m, E005: cls.E005, rhok: cls.rhok, rhom: cls.rhom },
      combinacoes: combinacoes(opc).map(function (c) { return { id: c.id, nome: c.nome, car: c.car, txt: c.txt, kmod: perfC && c.car === "curta" ? perfC.kmod : perfL.kmod }; }),
      geometria: { eixoCumeeira: geo.eixo, a: geo.a, b: geo.b, hBeiral: geo.hBeiral, caixa: geo.caixa }, cobertura: cob, pavimento: pav, vento: vento, forcasVento: cv.forcas, linhas: linhas,
      paredes: resParedes, resumo: { nParedes: Object.keys(resParedes).length, nReprovadas: nReprova, nSemSolucao: nSemSolucao, etaMax: etaMax, reprovadas: naoConforme },
      premissas: ctx.premissas, naoVerificado: ctx.nv, avisos: ctx.avisos.concat(erros), erros: erros, pendencias: ctx.pend.slice(), assinatura: assinatura(estado, vaos), assinaturaEntrada: entradaKey(entradaOpc, entrada.obraId), obraId: entrada.obraId == null ? null : String(entrada.obraId), cobKey: cobKey(opc.cobertura) });
  }
  /* resultado SERIALIZÁVEL (worker): número não finito vira 99 (η) ou 0 — nunca Infinity/NaN/undefined */
  function saneia(o) {
    if (Array.isArray(o)) return o.map(saneia);
    if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { r[k] = saneia(o[k]); }); return r; }
    if (typeof o === "number" && !isFinite(o)) return 99;
    return o;
  }
  function o_uplift(opc, Upl) { return opc.gamaQ * Upl; }

  /* ASSINATURA do que o cálculo viu: (1) o MODELO — paredes de quadro (dimensões, POSIÇÃO cx/cz/rotY, tipo, parâmetros do quadro, vãos) e as demais paredes (que mudam o contorno e a
     largura de influência); (2) a ENTRADA — cobertura usada (tipo, peso, inclinação, beiral, eixo, oitão, altura), vento, umidade, classe, revestimento, pavimento — e o id da obra.
     O cálculo guardado só vale enquanto as duas batem. */
  function assinatura(estado, vaos) {
    var l = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      var pos = [rr(num(c.cx, 0), 4), rr(num(c.cz, 0), 4), rr(num(c.rotY, 0), 5), rr(num(c.cy, 0), 4)].join(",");
      if (!c.tipoParede || !c.tipoParede.wf) { l.push(["N", c.id, pos, rr(num(c.comprimento, 0), 4), rr(num(c.altura, 0), 4), c.tipoParede ? c.tipoParede.id : ""].join("|")); return; }
      var v = vaos && vaos[c.id] ? arr(vaos[c.id].aceitos).map(function (x) { return [x.id, rr(num(x.x0, 0), 4), rr(num(x.x1, 0), 4), rr(num(x.y0, 0), 4), rr(num(x.y1, 0), 4)].join(":"); }) : [];
      l.push(["Q", c.id, pos, rr(num(c.comprimento, 0), 4), rr(num(c.altura, 0), 4), c.tipoParede.id, JSON.stringify(c.tipoParede.wf), v.join(",")].join("|"));
    });
    return l.join(";");
  }
  function cobKey(c) {
    if (!ehObj(c)) return "";
    return JSON.stringify([c.tipo || "", rr(num(c.g, 0), 4), rr(num(c.forro, 0), 4), rr(num(c.estrutura, 0), 4), rr(num(c.inclPct, 0), 3), rr(num(c.beiral, 0), 4), c.beiralOitao != null ? rr(num(c.beiralOitao, 0), 4) : "",
      c.eixoCumeeira || "", c.ladoAlto || "", rr(num(c.hBeiral, 0), 4), c.sc != null ? c.sc : "", JSON.stringify(c.oitao || null)]);
  }
  function entradaKey(opc, obraId) {
    opc = opc || {};
    return JSON.stringify([cobKey(opc.cobertura), JSON.stringify(opc.vento || null), opc.umidade == null ? PADRAO.umidade : opc.umidade, opc.classe || PADRAO.classe, opc.revestimento || PADRAO.revestimento, num(opc.estruturaCobertura, 0),
      JSON.stringify(opc.pavimento || null), opc.limFlechaVento == null ? "" : opc.limFlechaVento, obraId == null ? "" : String(obraId)]);
  }
  var _ultimo = null;
  function guardar(calc) { _ultimo = calc && calc.ok ? calc : null; return _ultimo; }
  function ultimo() { return _ultimo; }
  /* vigente: o modelo bate sempre; com `entrada` ({ opc, obraId } — o que o botão mandaria hoje) a cobertura, o vento, a umidade e a obra também têm de bater */
  function vigente(estado, vaos, calc, entrada) {
    calc = calc || _ultimo;
    if (!(calc && calc.ok && calc.assinatura === assinatura(estado, vaos))) return false;
    if (entrada && calc.assinaturaEntrada !== entradaKey(entrada.opc, entrada.obraId)) return false;
    return true;
  }

  /* APLICAR A SEÇÃO CALCULADA — ação explícita do usuário: devolve UM lote de ops (um desfazer só) que, nas paredes que o cálculo manda mudar, troca o tipo para o
     núcleo da seção calculada (38×89 → "<tipo>-140"), o espaçamento dos montantes e o prego de borda do OSB. Não aplica nada sozinho. */
  function planoAplicar(estado, calc, seq) {
    var AT = dep("AlvTipos", "./alvtipos.js"), BA = dep("BimArq", "./bimarq.js");
    if (!AT || !BA) return { ok: false, motivo: "js/alvtipos.js ou js/bimarq.js não carregou." };
    if (!calc || !calc.ok) return { ok: false, motivo: "Sem cálculo para aplicar." };
    var ops = [], resumo = [], pend = [];
    arr(estado && estado.caixas).forEach(function (c) {
      var R = calc.paredes && calc.paredes[c.id]; if (!R || !c.tipoParede || !c.tipoParede.wf) return;
      var mc = R.montante.calculado, tp = c.tipoParede, wf = tp.wf;
      if (!mc) { pend.push(c.id + ": nenhum montante do catálogo atende — nada a aplicar"); return; }
      var cv = R.contraventamento, sNovo = cv && cv.contribui ? cv.pregoBorda.s : null, sAtual = num(wf.espOsbBorda, 150);
      var mudaSec = mc.secao[1] !== wf.montante[1], mudaEsp = mc.espac !== wf.espac, mudaPrego = sNovo != null && sNovo !== sAtual;
      if (!mudaSec && !mudaEsp && !mudaPrego) return;
      var wfNovo = { espac: mc.espac, osbE: wf.osbE, canto: wf.canto };
      if (sNovo != null) wfNovo.espOsbBorda = sNovo; else if (wf.espOsbBorda != null) wfNovo.espOsbBorda = wf.espOsbBorda;
      var campos = null, desc = [];
      if (mudaSec) {
        var base = String(tp.id).replace(/-\d+$/, ""), novoId = mc.secao[1] === 89 ? base : base + "-" + mc.secao[1], t = AT.TIPOS && AT.TIPOS[novoId] ? AT.tipo(novoId, { wf: wfNovo }) : null;
        if (!t || !t.ok) { pend.push(c.id + ": não existe o tipo '" + novoId + "' (núcleo 38×" + mc.secao[1] + ") — criar o núcleo antes de aplicar"); return; }
        campos = { tipoParede: BA.tipoParede(t) }; desc.push("tipo " + tp.id + " → " + novoId);
      } else campos = { wf: wfNovo };
      if (mudaEsp) desc.push("espaçamento " + wf.espac + " → " + mc.espac + " mm");
      if (mudaPrego) desc.push("prego de borda " + sAtual + " → " + sNovo + " mm");
      ops.push({ op: "ajustar", id: c.id, campos: campos }); resumo.push({ id: c.id, mudancas: desc });
    });
    if (!ops.length) return { ok: true, vazio: true, ops: [], resumo: resumo, pendencias: pend };
    return { ok: true, vazio: false, lote: { op: "lote", id: "e" + (num(seq, 0) + 1), ops: ops }, ops: ops, resumo: resumo, pendencias: pend };
  }

  /* o que as pranchas e o orçamento leem de cada parede (resumo plano) */
  function paraPainel(calc, paredeId) {
    var R = calc && calc.paredes && calc.paredes[paredeId]; if (!R) return null;
    var mc = R.montante.calculado, cv = R.contraventamento;
    return { id: paredeId, preliminar: !!calc.preliminar,
      montante: mc ? { secao: mc.secao, compra: mc.compra, espac: mc.espac, eta: mc.eta, mudou: mc.mudou, modelo: R.montante.modelo.secao, espacModelo: R.montante.modelo.espac, etaModelo: R.montante.modelo.eta } : null,
      vergas: R.vergas.map(function (v) { return { vao: v.vao, secao: v.calculada.secao, compra: v.calculada.compra, eta: v.calculada.eta, ok: v.calculada.ok, mudou: v.calculada.mudou, jacks: v.jacks, tabela: v.tabela.secao }; }),
      reis: R.reis.map(function (r) { return { vao: r.vao, n: r.nReis }; }),
      pregoBorda: cv && cv.contribui ? { s: cv.pregoBorda.s, modelo: cv.espModelo, eta: cv.pregoBorda.eta, atende: cv.pregoBorda.atende, prego: cv.pregoBorda.prego.nome } : null,
      hd: cv && cv.contribui ? { ini: cv.hdPontas.ini, fim: cv.hdPontas.fim, max: cv.hdMax, trechos: cv.trechos.map(function (t) { return { de: t.de, ate: t.ate, T: t.T, C: t.C, hd: t.hd }; }) } : null,
      chumbador: cv && cv.chumbador ? { d: cv.chumbador.d, eta: cv.chumbador.eta } : null, pregoMontante: R.ligacoes.montanteGuia.prego.nome, eta: R.eta };
  }

  var WoodFrameCalc = { calcular: calcular, paraPainel: paraPainel, assinatura: assinatura, cobKey: cobKey, entradaKey: entradaKey, guardar: guardar, ultimo: ultimo, vigente: vigente, planoAplicar: planoAplicar, coberturaDoEstado: coberturaDoEstado, verificarMontante: function (o, opc) { var m = mot(), c = new Ctx(mescla(PADRAO, opc || {}), m); c.gMad = 4.12; return verificarMontante(c, o); },
    verificarVerga: function (o, opc) { var m = mot(), op = mescla(PADRAO, opc || {}), c = new Ctx(op, m); c.gMad = (m.MM.classe2022(op.classe).rhom || 420) * G / 1000; return verificarVerga(c, o); },
    combinacoes: combinacoes, PADRAO: PADRAO, NORMA: NORMA, larguraInfluencia: larguraInfluencia, geometriaPlanta: geometriaPlanta, lerParede: lerParede };
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameCalc; else global.WoodFrameCalc = WoodFrameCalc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

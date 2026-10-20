/* =====================================================================
 * arqpranchas.js — GERADOR AUTOMÁTICO DE PRANCHAS DE ARQUITETURA (reforma / ampliação residencial,
 * padrão prefeitura + executivo). Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   ArqPranchas.gerar({ estado, ops?, avaliarFam }, opcoes) → { ok, folhas: [{ id, tipo, rotulo, numero, titulo, formato, escala, svg, caixasTexto? }],
 *       formato, indices, lista, avisos, verificacao: { total, textoTexto, textoLinha, foraJanela, porFolha } }
 *   ArqPranchas.exportar(r, "pdf" | "svg" | "dxf")     PDF vetorial (js/svgpdf.js), SVG por folha, DXF com carimbo (js/bimdxf.js)
 *   ArqPranchas.configPadrao() / normalizarConfig(c)   a configuração da tela "Gerar pranchas de arquitetura"
 *
 * A SÉRIE (numeração contínua na ordem; o código é o prefixo + nn, ex.: ARQ-01):
 *   01 Situação e implantação · 02 Planta existente · 03 Planta de demolir / construir · 04 Planta proposta (layout)
 *   05 Planta de cobertura · 06 Planta de forro · 07 Cortes AA e BB · 08 Fachadas · 09 Paginação de piso
 *   10 Quadros (esquadrias, acabamentos, lista de folhas)  [+ 11 Planta humanizada, para o cliente]
 *   Plantas com mais de um pavimento saem uma folha por pavimento.
 *
 * ESCALA E FOLHA: planta em 1:50 sempre que couber, senão 1:75, 1:100; situação 1:200–1:500; o formato (A2, A1, A0)
 *   é o menor em que a planta, os cortes e as fachadas cabem — `formato: "A1"` fixa. Carimbo RA padrão (js/prancha.js).
 * ÍNDICES: js/arqindices.js (taxa de ocupação, permeabilidade, coeficiente de aproveitamento × limites do município).
 * NADA É INVENTADO: o que o modelo não traz (nome da rua, material da esquadria, limite do município, piso do ambiente)
 *   sai como "informe" em VERMELHO e vira aviso; dimensão de vão sem família avaliada sai "conferir medida".
 * SOBREPOSIÇÃO: toda folha passa pela conferência de js/arqdesenho.js (texto × texto, texto × linha, texto fora da janela);
 *   `verificacao.total` tem de ser 0 — o teste reprova senão.
 * Teste: tools/ (pranchas de arquitetura) · e2e: e2e: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function MD() { return dep("ArqModelo", "./arqmodelo.js"); }
  function IX() { return dep("ArqIndices", "./arqindices.js"); }
  function PL() { return dep("ArqPlantas", "./arqplantas.js"); }
  function CT() { return dep("ArqCortes", "./arqcortes.js"); }
  function QD() { return dep("ArqQuadros", "./arqquadros.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function FS() { return dep("BimFases", "./bimfases.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function DXF() { return dep("BimDxf", "./bimdxf.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";
  var VERMELHO = "#c00000";

  var CONJUNTOS = ["situacao", "existente", "demolir", "layout", "cobertura", "forro", "cortes", "fachadas", "piso", "quadros", "humanizada"];
  var ROTULO_CONJUNTO = { situacao: "Situação e implantação (índices, recuos, norte)", existente: "Planta existente (cotada)", demolir: "Planta de demolir / construir (convenção de reforma)",
    layout: "Planta proposta / layout (cotas, ambientes, esquadrias)", cobertura: "Planta de cobertura", forro: "Planta de forro", cortes: "Cortes AA e BB", fachadas: "Fachadas",
    piso: "Paginação de piso", quadros: "Quadros: esquadrias, acabamentos e lista de folhas", humanizada: "Planta humanizada (apresentação ao cliente)" };
  var TITULO = { situacao: "SITUAÇÃO E IMPLANTAÇÃO", existente: "PLANTA EXISTENTE", demolir: "PLANTA DE DEMOLIR E CONSTRUIR", layout: "PLANTA BAIXA PROPOSTA - LAYOUT", cobertura: "PLANTA DE COBERTURA",
    forro: "PLANTA DE FORRO", cortes: "CORTES AA E BB", fachadas: "FACHADAS", piso: "PAGINAÇÃO DE PISO", quadros: "QUADRO DE ESQUADRIAS E ACABAMENTOS", humanizada: "PLANTA HUMANIZADA" };
  var FORMATOS_OK = ["AUTO", "A0", "A1", "A2", "A3"];

  function configPadrao() {
    var cj = {}; CONJUNTOS.forEach(function (k) { cj[k] = true; });
    return { formato: "AUTO", escala: "auto", prefixo: "ARQ", revisao: "R00", descricaoRevisao: "EMISSÃO INICIAL - PROJETO EXECUTIVO", conjuntos: cj,
      municipio: "", limites: { nome: "", ocupacaoMax: null, permeavelMin: null, aproveitamentoMax: null, conferir: false }, rua: "", cotasInternas: true, beiralNaProjecao: false, fatores: { deckVazado: 1 } };
  }
  function normalizarConfig(c) {
    var p = configPadrao(), o = c || {}, r = {};
    r.formato = FORMATOS_OK.indexOf(txt(o.formato).toUpperCase()) >= 0 ? txt(o.formato).toUpperCase() : p.formato;
    r.escala = o.escala === "auto" || o.escala == null ? "auto" : (isFinite(+o.escala) && +o.escala > 0 ? +o.escala : "auto");
    r.prefixo = (txt(o.prefixo).trim() || p.prefixo).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || p.prefixo;
    r.revisao = (txt(o.revisao).trim() || p.revisao).toUpperCase();
    r.descricaoRevisao = txt(o.descricaoRevisao).trim() || p.descricaoRevisao;
    r.conjuntos = {}; CONJUNTOS.forEach(function (k) { r.conjuntos[k] = !o.conjuntos || o.conjuntos[k] !== false; });
    r.municipio = txt(o.municipio).trim();
    var L = o.limites && typeof o.limites === "object" ? o.limites : {};
    r.limites = { nome: txt(L.nome), ocupacaoMax: L.ocupacaoMax != null && L.ocupacaoMax !== "" && isFinite(+L.ocupacaoMax) ? +L.ocupacaoMax : null, permeavelMin: L.permeavelMin != null && L.permeavelMin !== "" && isFinite(+L.permeavelMin) ? +L.permeavelMin : null,
      aproveitamentoMax: L.aproveitamentoMax != null && L.aproveitamentoMax !== "" && isFinite(+L.aproveitamentoMax) ? +L.aproveitamentoMax : null, conferir: !!L.conferir };
    r.rua = txt(o.rua).trim(); r.cotasInternas = o.cotasInternas !== false; r.beiralNaProjecao = !!o.beiralNaProjecao;
    r.fatores = { deckVazado: o.fatores && isFinite(+o.fatores.deckVazado) ? +o.fatores.deckVazado : 1 };
    return r;
  }

  /* ------------------------------------------------------------ AS SITUAÇÕES ANTES / DEPOIS (os ambientes dependem das paredes que sobram) */
  function idsPorStatus(estado, dados) {
    var B = FS(), out = { novo: {}, demolido: {} };
    if (!B) return out;
    var lista = B.lista(estado), fase = dados.fase;
    B.pecas(estado, { categoriaFam: MD().categoriaFam }).forEach(function (p) {
      var st = B.statusDe(p.el, fase, lista); if (st === "novo") out.novo[p.id] = 1; else if (st === "demolido") out.demolido[p.id] = 1;
    });
    arr(estado.telhados).concat(arr(estado.forros)).forEach(function (t) { if (t && t.id != null) { var st = B.statusDe(t, fase, lista); if (st === "novo") out.novo[String(t.id)] = 1; else if (st === "demolido") out.demolido[String(t.id)] = 1; } });
    return out;
  }
  /* refaz o estado sem as peças `fora` (ids): as peças que dependem delas (vãos hospedados) saem junto */
  function estadoSem(modelo, fora, opcoes) {
    var E = BE(); if (!E || !arr(modelo.ops).length) return null;
    var ops = arr(modelo.ops).filter(function (o) {
      if (!o) return false;
      if (o.id != null && fora[String(o.id)] && o.op !== "ambiente" && o.op !== "ajustarAmbiente") return false;
      if (o.host && o.host.id != null && fora[String(o.host.id)]) return false;
      return true;
    });
    try { return E.aplicar(ops, opcoes); } catch (e) { return null; }
  }
  function situacoes(modelo, dados, op, avisos) {
    var Md = MD(), ids = idsPorStatus(modelo.estado, dados), antes = null, depois = null, estDepois = modelo.estado;
    if (Object.keys(ids.demolido).length || Object.keys(ids.novo).length) {
      var eD = estadoSem(modelo, ids.demolido), eA = estadoSem(modelo, ids.novo);
      if (eD) { depois = Md.extrair({ estado: eD, avaliarFam: modelo.avaliarFam }, op); estDepois = eD; }
      if (eA) antes = Md.extrair({ estado: eA, avaliarFam: modelo.avaliarFam }, op);
      if (!eD || !eA) avisos.push("Sem a lista de operações do modelo (ops): os ambientes das plantas existente e proposta saem do modelo inteiro, sem refazer o contorno pelas paredes que ficam.");
    }
    return { antes: antes || dados, depois: depois || dados, estadoDepois: estDepois };
  }

  /* ------------------------------------------------------------ FORMATO E ESCALA */
  var ESC_PLANTA = [50, 75, 100, 125, 150];
  function caixaPlano(dados) {
    var g = GEO(), xs = [], zs = [];
    function add(P) { arr(P).forEach(function (p) { xs.push(p[0]); zs.push(p[1]); }); }
    dados.paredes.forEach(function (w) { if (!w.muro) add(w.pts); }); dados.pilares.forEach(function (w) { add(w.pts); }); dados.lajes.forEach(function (l) { add(l.pts); });
    dados.telhados.forEach(function (t) { add(t.pBeiral || t.pts); });
    if (!xs.length) return dados.caixa;
    void g;
    return [Math.min.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, xs), Math.max.apply(null, zs)];
  }
  function cabePlanta(geo, cx, esc) {
    var d = DS(), k = 1000 / esc, a = geo.area, mg = d.K.margemCotas;
    return (cx[2] - cx[0]) * k + 2 * mg + 12 <= a.w && (cx[3] - cx[1]) * k + 2 * mg + 16 + 34 <= a.h;
  }
  function cabeFachadas(geo, dados, esc) {
    var k = 1000 / esc, a = geo.area, w = dados.caixa[2] - dados.caixa[0] + 1.8, h = 0;
    dados.paredes.forEach(function (x) { h = Math.max(h, x.topo); }); dados.telhados.forEach(function (t) { h = Math.max(h, t.cotaCumeeira); });
    return w * k + 44 <= a.w / 2 - 4 && (h + 0.3) * k + 32 <= a.h / 2 - 2;
  }
  function escolherFormatoEscala(dados, cfg, avisos) {
    var P = PR(), cx = caixaPlano(dados), fmts = cfg.formato === "AUTO" ? ["A2", "A1", "A0"] : [cfg.formato], escs = cfg.escala === "auto" ? ESC_PLANTA : [cfg.escala];
    var melhor = null;
    for (var ie = 0; ie < escs.length && !melhor; ie++) for (var i = 0; i < fmts.length && !melhor; i++) {
      var geo = P.geometria(fmts[i], "paisagem", "RA");
      if (cabePlanta(geo, cx, escs[ie]) && (cfg.formato !== "AUTO" || cabeFachadas(geo, dados, Math.max(escs[ie], 75)))) melhor = { formato: fmts[i], escala: escs[ie], caixa: cx };
    }
    if (!melhor) {
      var f = fmts[fmts.length - 1], e = escs[escs.length - 1];
      melhor = { formato: f, escala: e, caixa: cx, estourou: true };
      avisos.push("A planta não cabe em " + f + " nem em 1:" + e + ": use a folha maior ou reduza a escala (a planta sai cortada pela moldura).");
    } else if (cfg.formato === "AUTO" && cfg.escala === "auto" && melhor.escala !== 50) avisos.push("A planta saiu em 1:" + melhor.escala + " (1:50 não cabe em " + melhor.formato + "): use A0 para 1:50.");
    return melhor;
  }
  function escolherEscalaSituacao(idx, geo) {
    var l = idx.terreno && idx.terreno.contorno ? GEO().bbox(idx.terreno.contorno) : null, a = geo.area, wQ = Math.min(176, Math.max(140, a.w * 0.34)), esc = [100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
    if (!l) return 200;
    for (var i = 0; i < esc.length; i++) { var k = 1000 / esc[i]; if ((l[2] - l[0]) * k + 70 <= a.w - wQ - 10 && (l[3] - l[1]) * k + 100 <= a.h) return esc[i]; }
    return esc[esc.length - 1];
  }

  /* ------------------------------------------------------------ NOTAS E LEGENDAS DA COLUNA */
  function legendaFases() {
    var C = DS().conv();
    return [{ t: "A CONSTRUIR", fill: C.novo.fill, hachura: true, cam: "ARQ-PAREDE-NOVO" }, { t: "A DEMOLIR (tracejado)", fill: C.demolido.fill, cam: "ARQ-PAREDE-DEMOLIDO" }, { t: "EXISTENTE A MANTER", fill: C.existente.fill, cam: "ARQ-PAREDE-EXISTENTE" }];
  }
  var NOTAS_GERAIS = [
    "Cotas em centímetros; níveis e áreas em metros / metros quadrados. Níveis referidos ao piso acabado do térreo (±0,00).",
    "Prevalecem as cotas sobre o desenho. Conferir no local todas as medidas existentes antes de executar.",
    "Representação conforme a NBR 6492 (projetos de arquitetura); simbologia da RA Engenharia."
  ];
  function blocosNotas(c, def) {
    var B = [];
    if (def.tipo === "demolir") B.push({ titulo: "LEGENDA", legenda: legendaFases(), itens: [] });
    if (def.tipo === "layout" || def.tipo === "existente" || def.tipo === "demolir") B.push({ titulo: "SÍMBOLOS", itens: ["P1, P2… portas e J1, J2… janelas: ver o quadro de esquadrias (folha " + c.numeroDe("quadros") + ").", "AA e BB: planos de corte (folha " + c.numeroDe("cortes") + ")."] });
    if (def.tipo === "cobertura") B.push({ titulo: "LEGENDA", itens: ["Linha grossa: cumeeira. Linha média: espigão e rincão. Tracejado: beiral e projeção das paredes.", "Seta e %: sentido e inclinação do caimento de cada água."] });
    if (def.tipo === "forro") B.push({ titulo: "LEGENDA", itens: ["Círculo com cruz: luminária de teto.", "Linha tracejada interna: sanca (recuo de 15 cm do contorno do forro).", "Nível: face de baixo do forro acabado."] });
    if (def.tipo === "piso") B.push({ titulo: "LEGENDA", itens: ["Linha cheia: peça inteira. Linha vermelha: peça cortada.", "Quantidade com reserva de 10 % (receita da paginação do ambiente)."] });
    if (def.tipo === "situacao") B.push({ titulo: "LEGENDA", itens: ["Linha traço-ponto: divisa do lote.", "Hachura verde: área permeável (solo natural).", "Cobertura vista de cima, edificação tracejada por baixo."] });
    if (def.tipo === "humanizada") B.push({ titulo: "APRESENTAÇÃO", itens: ["Planta ilustrativa para apresentação ao cliente; não substitui as pranchas executivas."] });
    B.push({ titulo: "NOTAS GERAIS", numerar: true, itens: NOTAS_GERAIS });
    var pend = arr(c.avisosFolha[def.id]).concat(def.tipo === "situacao" ? arr(c.idx.avisos) : []);
    if (pend.length) B.push({ titulo: "PENDÊNCIAS", itens: pend.slice(0, 8).map(function (t) { return { t: t, cor: VERMELHO }; }) });
    return B;
  }

  /* ------------------------------------------------------------ UMA FOLHA: moldura, notas, carimbo */
  function montarFolha(c, def, D, res, pr, fl, rotulo, geo, E) {
    var F = DS().novo(E, false), W = geo.papel.w, H = geo.papel.h, M = geo.moldura, A = AP();
    F.ret(M.x, M.y, M.w, M.h, "ARQ-MOLDURA");
    var coube = DS().colunaNotas(F, geo, blocosNotas(c, def));
    if (!coube) c.avisos.push(def.numero + ": as notas não cabem na coluna com a letra mínima do padrão: conferir.");
    A.carimbo(F, pr, fl, geo, c.empObj, c.op.logo || null, rotulo + "/" + dois(c.total));
    var numero = c.prefixo + "-" + rotulo;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + FONTE + '" data-folha="' + def.id + '" data-numero="' + esc(numero) + '">' +
      "<title>" + esc(numero + " - " + def.titulo + " - " + c.rev) + "</title>" + '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' +
      '<g data-corpo="1">' + D.svg() + '</g><g data-folha-moldura="1">' + F.svg() + "</g></svg>";
  }

  /* ------------------------------------------------------------ GERAR */
  function gerar(modelo, opcoes) {
    var cfg = normalizarConfig(opcoes), op = opcoes || {}, avisos = [], P = PR(), Md = MD();
    if (!modelo || !modelo.estado) return { ok: false, folhas: [], avisos: ["Modelo vazio: não há o que apresentar."] };
    if (!P || !P.carimboRA || !AP() || !DS() || !Md || !IX() || !PL() || !CT() || !QD()) return { ok: false, folhas: [], avisos: ["Os motores das pranchas de arquitetura não carregaram (js/arq*.js, js/prancha.js, js/acopranchas.js)."] };
    var dados = Md.extrair(modelo, { pavimentos: op.pavimentos, fase: op.fase });
    dados.avisos.forEach(function (a) { avisos.push(a); });
    if (!dados.paredes.length) return { ok: false, folhas: [], avisos: avisos.concat(["O modelo não tem paredes na fase de agora: não há planta para gerar."]) };
    var sit = situacoes(modelo, dados, { pavimentos: op.pavimentos, fase: op.fase }, avisos);
    /* ÍNDICES: os ambientes que valem são os da situação de DEPOIS (e os demolidos da de antes) */
    var dadosIx = {}; Object.keys(dados).forEach(function (k) { dadosIx[k] = dados[k]; });
    dadosIx.ambientes = arr(sit.depois.ambientes).concat(arr(sit.antes.ambientes).filter(function (a) { return a.status === "demolido"; }));
    var lim = IX().limitesDe(cfg.limites && (cfg.limites.ocupacaoMax != null || cfg.limites.permeavelMin != null || cfg.limites.aproveitamentoMax != null) ? cfg.limites : (cfg.municipio || {}));
    var idx = IX().calcular(dadosIx, { limites: lim, contornoLote: op.contornoLote, areaTerreno: op.areaTerreno, permeaveis: op.permeaveis, fatores: cfg.fatores, beiralNaProjecao: cfg.beiralNaProjecao, frente: op.frente });
    idx.avisos.forEach(function (a) { avisos.push(a); });
    var fe = escolherFormatoEscala(dados, cfg, avisos), geo = P.geometria(fe.formato, "paisagem", "RA");
    var E = DS().estilo(op.padrao);
    var codigo = cfg.prefixo, rev = cfg.revisao, data = txt(op.data).trim() || hoje();
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null;

    /* contexto comum das folhas */
    var c = { E: E, geo: geo, A: geo.area, dados: dados, antes: sit.antes, depois: sit.depois, estadoDepois: sit.estadoDepois, idx: idx, op: { rua: cfg.rua, logo: op.logo }, cfg: cfg, avisos: avisos, avisosFolha: {},
      plano: { k: 1000 / fe.escala, escala: fe.escala, caixa: fe.caixa }, escalaSit: escolherEscalaSituacao(idx, geo), cortes: CT().escolherCortes(dados, sit.depois), prefixo: codigo, rev: rev, empObj: empObj, total: 0, formatoNome: fe.formato, numeroDe: function () { return "?"; } };

    /* a lista de folhas */
    var defs = [], pavs = dados.pavimentos, cj = cfg.conjuntos;
    function add(tipo, pav) {
      var multi = pavs.length > 1 && pav != null, id = tipo + (multi ? "-p" + (pav + 1) : "");
      defs.push({ id: id, tipo: tipo, pav: pav, titulo: TITULO[tipo] + (multi ? " - " + txt(pavs[pav].nome).toUpperCase() : "") });
    }
    CONJUNTOS.forEach(function (tipo) {
      if (!cj[tipo]) return;
      if (tipo === "existente" || tipo === "demolir" || tipo === "layout" || tipo === "forro" || tipo === "piso" || tipo === "humanizada") { for (var i = 0; i < pavs.length; i++) add(tipo, i); }
      else add(tipo, null);
    });
    if (!defs.length) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhuma folha marcada para gerar."]) };
    defs.forEach(function (d, i) { d.rotulo = dois(i + 1); d.numero = codigo + "-" + d.rotulo; });
    c.total = defs.length;
    c.numeroDe = function (tipo) { for (var i = 0; i < defs.length; i++) if (defs[i].tipo === tipo) return codigo + "-" + defs[i].rotulo; return "(não gerada)"; };

    /* desenha cada folha (os quadros por último: a lista de folhas leva as escalas) */
    var Pl = PL(), Ct = CT(), Qd = QD(), feitas = {}, ordemDes = defs.filter(function (d) { return d.tipo !== "quadros"; }).concat(defs.filter(function (d) { return d.tipo === "quadros"; }));
    ordemDes.forEach(function (def) {
      var D = DS().novo(E, op.depurar === false ? false : true), res = {}, cc = c;
      cc.D = D; cc.def = def; cc.avisos = avisos;
      var nAv = avisos.length;
      try {
        if (def.tipo === "situacao") res = desenharSituacao(cc, def);
        else if (def.tipo === "existente") res = Pl.planta(cc, { modo: "existente", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: false, completo: false });
        else if (def.tipo === "demolir") res = Pl.planta(cc, { modo: "demolir", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: false, completo: false });
        else if (def.tipo === "layout") res = desenharLayout(cc, def);
        else if (def.tipo === "cobertura") res = Pl.cobertura(cc);
        else if (def.tipo === "forro") res = desenharForro(cc, def);
        else if (def.tipo === "cortes") res = Ct.cortes(cc);
        else if (def.tipo === "fachadas") res = Ct.fachadas(cc);
        else if (def.tipo === "piso") res = Pl.paginacao(cc);
        else if (def.tipo === "quadros") res = desenharQuadros(cc, def, defs, feitas);
        else if (def.tipo === "humanizada") res = Pl.humanizada(cc);
      } catch (e) {
        avisos.push("Folha " + def.numero + " (" + def.titulo + "): " + (e && e.message ? e.message : String(e)));
        D.texto(cc.A.x + 10, cc.A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO });
      }
      c.avisosFolha[def.id] = avisos.slice(nAv).filter(function (a) { return a.indexOf(def.numero) === 0 || /^ARQ-\d\d|^Folha|^ARQ-/.test(a) || a.indexOf("Humanizada") === 0; });
      feitas[def.id] = { D: D, escala: (res && res.escala) || "INDICADA", res: res };
    });

    var emp0 = empObj ? "" : txt(emp), revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "arqpranchas", nome: "Arquitetura - projeto executivo", formato: fe.formato, orientacao: "paisagem", origem: "arquitetura",
      carimbo: { modelo: "RA", empresa: emp0, responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra), proprietario: txt(op.proprietario),
                 contratante: txt(op.contratante), local: txt(op.local), codigo: codigo, data: data, revisoes: [[revNum, cfg.descricaoRevisao, data]] },
      folhas: defs.map(function (d, i) { return { id: d.id, n: i + 1, conteudo: d.titulo, escala: feitas[d.id].escala, numero: codigo + " " + rev }; }) });
    var verificacao = { total: 0, textoTexto: 0, textoLinha: 0, foraJanela: 0, porFolha: [] };
    var A = geo.area, janela = [A.x - 1, A.y - 1, A.x + A.w + 1, A.y + A.h + 1];
    var folhas = defs.map(function (def, i) {
      var f = feitas[def.id], conf = DS().conferir(f.D, janela);
      verificacao.textoTexto += conf.textoTexto.length; verificacao.textoLinha += conf.textoLinha.length; verificacao.foraJanela += conf.foraJanela.length; verificacao.total += conf.total;
      verificacao.porFolha.push({ numero: def.numero, textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela });
      var svg = montarFolha(c, def, f.D, f.res, pr, pr.folhas[i], def.rotulo, geo, E);
      var o = { id: def.id, tipo: def.tipo, rotulo: def.rotulo, numero: def.numero, titulo: def.titulo, formato: fe.formato, escala: f.escala, svg: svg };
      if (op.depurar) o.caixasTexto = f.D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var lista = folhas.map(function (f) { return { numero: f.numero, titulo: f.titulo, formato: f.formato, escala: f.escala }; });
    return { ok: true, folhas: folhas, formato: fe.formato, escalaPlanta: fe.escala, indices: idx, lista: lista, avisos: avisos, verificacao: verificacao, prefixo: codigo, revisao: rev };
  }

  /* ------------------------------------------------------------ AS FOLHAS QUE TÊM MAIS QUE O DESENHO */
  function desenharSituacao(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, r = Pl.situacao(c);
    var wQ = Math.min(176, Math.max(140, A.w * 0.34)), x = A.x + A.w - wQ - 2, y = A.y + 14;
    var t1 = Qd.quadroAreas(D, x, y, wQ - 2, c.idx); y += t1.h + 8;
    var t2 = Qd.quadroIndices(D, x, y, wQ - 2, c.idx); y += t2.h + 6;
    var C = c.idx.limites;
    if (C && C.conferir) { var ls = AP().quebrar("Limites de EXEMPLO (" + txt(C.nome) + "): CONFERIR NA LEI e no zoneamento do lote.", D.E.T.nota * 0.9, wQ - 4); ls.forEach(function (s) { D.texto(x, y + D.E.T.nota * 0.8, s, D.E.T.nota * 0.9, { cor: VERMELHO }); y += D.E.T.nota * 1.4; }); y += 3; }
    else if (!(C && (C.ocupacaoMax != null || C.permeavelMin != null || C.aproveitamentoMax != null))) { D.texto(x, y + D.E.T.nota * 0.8, "Limites do município: informe (taxa de ocupação, permeabilidade).", D.E.T.nota * 0.9, { cor: VERMELHO }); y += D.E.T.nota * 1.6 + 3; }
    var t3 = Qd.quadroRecuos(D, x, y, wQ - 2, c.idx);
    return r;
  }
  function desenharLayout(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, pl = c.plano;
    var r = Pl.planta(c, { modo: "layout", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: c.cfg.cotasInternas, completo: true, cortes: true });
    /* o quadro de esquadrias compacto sob a planta, se couber; senão a nota remete ao ARQ de quadros */
    var yT = r.y + 14, esq = arr(c.dados.esquadrias).length, hl = Math.max(4.4, D.E.T.tabela * 1.85), hT = (esq + 1) * hl + D.E.T.tabelaCab * 2 + 4;
    if (esq && yT + hT <= A.y + A.h - 2 && A.w > 200) Qd.quadroEsquadrias(D, A.x + 140, yT - 8, Math.min(A.w - 144, 330), c.dados.esquadrias);
    else if (esq) c.avisos.push(def.numero + ": o quadro de esquadrias não coube sob a planta; está na folha " + c.numeroDe("quadros") + ".");
    void pl;
    return r;
  }
  function desenharForro(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, r = Pl.forro(c);
    var yT = r.M.oy + r.M.alt + DS().K.margemCotas + 12, ambs = arr(c.depois.ambientes), n = r.forros.length, hl = Math.max(4.4, D.E.T.tabela * 1.85);
    if (yT + (n + 2) * hl + 14 <= A.y + A.h - 2) Qd.quadroForros(D, A.x + 130, yT - 8, Math.min(A.w - 134, 220), r.forros, ambs, arr(c.dados.luminarias).filter(function (l) { return l.status !== "demolido"; }).length);
    return r;
  }
  function desenharQuadros(c, def, defs, feitas) {
    var Qd = QD(), D = c.D, A = c.A, T = D.E.T, y = A.y + 4, w = A.w - 8;
    AP().tituloVista(D, A.x + 4, A.y + 2, def.titulo, "SEM ESCALA"); y += 14;
    var t1 = Qd.quadroEsquadrias(D, A.x + 4, y, w, c.dados.esquadrias); y += t1.h + 10;
    var t2 = Qd.quadroAcabamentos(D, A.x + 4, y, w, c.depois.ambientes); y += t2.h + 10;
    /* lista de folhas */
    var linhas = defs.map(function (d) { return [d.numero, d.titulo, c.formatoNome, (feitas[d.id] && feitas[d.id].escala) || "SEM ESCALA"]; });
    var cols = [{ t: "FOLHA", f: 1.2, al: "E" }, { t: "TÍTULO", f: 6, al: "E" }, { t: "FORMATO", f: 1.2 }, { t: "ESCALA", f: 1.2 }];
    Qd.tabela(D, A.x + 4, y, Math.min(w, 300), "LISTA DE FOLHAS", cols, linhas);
    void T;
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ EXPORTAÇÃO */
  var ACI = [[1, "#ff0000"], [2, "#ffff00"], [3, "#00ff00"], [4, "#00ffff"], [5, "#0000ff"], [6, "#ff00ff"], [7, "#000000"], [8, "#808080"], [9, "#c0c0c0"], [30, "#ff7f00"]];
  function aciDe(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(txt(hex)); if (!m) return 7;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), best = 7, bd = Infinity;
    ACI.forEach(function (a) { var q = /^#(..)(..)(..)$/.exec(a[1]), d = Math.pow(r - parseInt(q[1], 16), 2) + Math.pow(g - parseInt(q[2], 16), 2) + Math.pow(b - parseInt(q[3], 16), 2); if (d < bd) { bd = d; best = a[0]; } });
    return best;
  }
  function atributos(s) { var o = {}, re = /([\w:-]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function desesc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"); }
  var CAM_MET = { "MET-COTA": "ARQ-COTA", "MET-FINA": "ARQ-FINA", "MET-TABELA": "ARQ-TABELA", "MET-TITULO": "ARQ-TITULO", "MET-HACHURA": "ARQ-HACHURA", "MET-EIXO": "ARQ-EIXO" };
  function paraDxf(r) {
    var X = DXF(); if (!X || !r || !r.ok || !r.folhas.length) return null;
    var doc = X.novoDoc({ unidade: "mm" }), E = DS().estilo(), gap = 50;
    doc.escala = 1;
    function camada(cam, folha, a) {
      var nome = CAM_MET[cam] || txt(cam), cm = E.camadas[txt(cam)] || {}, st = a.stroke && a.stroke !== "none" ? a.stroke : a.fill;
      if (folha) nome = /MOLDURA/.test(nome) ? "FOLHA-MOLDURA" : "FOLHA-CARIMBO";
      else if (!/^ARQ-/.test(nome)) nome = "ARQ-SIMBOLO";
      doc.especificar(nome, cm.mm || +a["stroke-width"] || 0.18, (a["stroke-dasharray"] || cm.dash) ? "TRACEJADO" : null, aciDe(cm.cor || st || "#000"));
      return doc.camada(nome);
    }
    var x0 = 0;
    r.folhas.forEach(function (f) {
      var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(f.svg) || [], W = +vb[1] || 0, Hp = +vb[2] || 0, corte = f.svg.indexOf('<g data-folha-moldura="1">');
      function Pp(x, y) { return [x0 + (+x), Hp - (+y)]; }
      var re = /<(line|polygon|polyline|rect|circle|text)\b([^>]*?)(\/?)>([^<]*)/g, m;
      while ((m = re.exec(f.svg))) {
        var tag = m[1], a = atributos(m[2]), fill = a.fill, st = a.stroke && a.stroke !== "none" ? a.stroke : null, folha = corte >= 0 && m.index > corte, cam = a["data-cam"];
        if (tag === "line" && st) { var p1 = Pp(a.x1, a.y1), p2 = Pp(a.x2, a.y2); doc.linha(camada(cam, folha, a), p1[0], p1[1], p2[0], p2[1]); }
        else if (tag === "polygon" || tag === "polyline") {
          var pts = txt(a.points).trim().split(/\s+/).map(function (q) { var v = q.split(","); return Pp(v[0], v[1]); });
          if (tag === "polygon" && fill && fill !== "none" && pts.length > 2 && !/^#f+$/i.test(fill)) doc.hachura(doc.camada((folha ? "FOLHA" : "ARQ-FUNDO") + "-CHEIO", 0.13, null, aciDe(fill)), [pts], 1, true);
          if (st) doc.poli(camada(cam, folha, a), pts, tag === "polygon");
        } else if (tag === "rect") {
          var x = +a.x, y = +a.y, w = +a.width, h = +a.height, q4 = [Pp(x, y), Pp(x + w, y), Pp(x + w, y + h), Pp(x, y + h)];
          if (st) doc.poli(camada(cam, folha, a), q4, true);
          else if (fill && fill !== "none" && !/^#f+$/i.test(fill)) doc.hachura(doc.camada((folha ? "FOLHA" : "ARQ-FUNDO") + "-CHEIO", 0.13, null, aciDe(fill)), [q4], 1, true);
        } else if (tag === "circle") {
          var pc = Pp(a.cx, a.cy); if (st) doc.circulo(camada(cam, folha, a), pc[0], pc[1], +a.r);
        } else if (tag === "text" && m[3] !== "/") {
          var s = desesc(m[4]); if (!s.trim()) continue;
          var pt = Pp(a.x, a.y), rt = /rotate\(([-\d.eE]+)/.exec(a.transform || ""), al = a["text-anchor"], fs = +a["font-size"], ang = rt ? -(+rt[1]) : 0;
          var red = a.fill && a.fill !== "#000" && a.fill !== "none";
          var cT = doc.camada(folha ? (red ? "FOLHA-TEXTO-PEND" : "FOLHA-TEXTO") : (red ? "ARQ-TEXTO-PEND" : "ARQ-TEXTO"), 0.18, null, red ? aciDe(a.fill) : 7);
          if (al === "end") { var wl = AP().largTexto(s, fs), ra = ang * Math.PI / 180; pt = [pt[0] - wl * Math.cos(ra), pt[1] - wl * Math.sin(ra)]; }
          doc.texto(cT, pt[0], pt[1], fs * 0.7, s, ang, al === "middle");
        }
      }
      x0 += W + gap;
    });
    return X.escrever(doc);
  }
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var S = PDF(); return S ? S.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Projeto de arquitetura" }) : null; }
    if (formato === "dxf") return paraDxf(r);
    return null;
  }

  var ArqPranchas = { VERSAO: 1, gerar: gerar, exportar: exportar, configPadrao: configPadrao, normalizarConfig: normalizarConfig, paraDxf: paraDxf, CONJUNTOS: CONJUNTOS, ROTULO_CONJUNTO: ROTULO_CONJUNTO, FORMATOS: FORMATOS_OK,
    _int: { situacoes: situacoes, estadoSem: estadoSem, idsPorStatus: idsPorStatus, escolherFormatoEscala: escolherFormatoEscala, caixaPlano: caixaPlano, blocosNotas: blocosNotas } };
  global.ArqPranchas = ArqPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

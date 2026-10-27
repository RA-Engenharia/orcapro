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
 * ARRANJO (27/10/2026, js/arqdiagrama.js): `arranjo: "auto"` (padrão) trata cada desenho como um BLOCO (planta, corte, fachada, quadro, lista…) e o MOTOR DE DIAGRAMAÇÃO os distribui nas
 *   folhas para ter o menos de folhas e o menos de branco; as folhas deixam de ser "uma por conteúdo" (ARQ-01 = situação, ARQ-02 = existente…) e ganham o título do que trazem.
 *   Formato AUTO: A3, A2, A1 e A0 são testados e fica o de MENOS folhas entre os que chegam a 55 % de ocupação média; `formato: "A1"` fixa e o motor só empacota.
 *   `fixos: { idDoBloco: { folha, x, y } }` são os blocos que o usuário fixou (o resto é re-empacotado em volta); `arranjo: "serie"` volta à série antiga (uma folha por conteúdo).
 *   `r.diagrama` traz o arranjo (blocos por folha, ocupação, candidatos de formato) e o `layout` que se grava por obra. A série INT (interiores) continua por ambiente e por disciplina:
 *   ver o comentário de ArqInteriores.montarBlocos.
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
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function MD() { return dep("ArqModelo", "./arqmodelo.js"); }
  function IX() { return dep("ArqIndices", "./arqindices.js"); }
  function PL() { return dep("ArqPlantas", "./arqplantas.js"); }
  function CT() { return dep("ArqCortes", "./arqcortes.js"); }
  function QD() { return dep("ArqQuadros", "./arqquadros.js"); }
  function INT() { return dep("ArqInteriores", "./arqinteriores.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function FS() { return dep("BimFases", "./bimfases.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function DXF() { return dep("BimDxf", "./bimdxf.js"); }
  function DG() { return dep("ArqDiagrama", "./arqdiagrama.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  var FONTE = ES() ? ES().FONTE.css : "Verdana, Arial, sans-serif";   /* Verdana, com reserva DejaVu Sans / Arial (padrão arquitetura_interiores); o carimbo RA leva a fonte dele */
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
    return { formato: "AUTO", arranjo: "auto", fixos: {}, escala: "auto", prefixo: "ARQ", revisao: "R00", descricaoRevisao: "EMISSÃO INICIAL - PROJETO EXECUTIVO", conjuntos: cj, interiores: { ativo: false, ambientes: null, prefixo: "INT", formato: "AUTO" },
      municipio: "", limites: { nome: "", ocupacaoMax: null, permeavelMin: null, aproveitamentoMax: null, conferir: false }, rua: "", cotasInternas: true, beiralNaProjecao: false, fatores: { deckVazado: 1 } };
  }
  function normalizarConfig(c) {
    var p = configPadrao(), o = c || {}, r = {};
    r.formato = FORMATOS_OK.indexOf(txt(o.formato).toUpperCase()) >= 0 ? txt(o.formato).toUpperCase() : p.formato;
    r.arranjo = txt(o.arranjo).toLowerCase() === "serie" ? "serie" : "auto";
    r.fixos = {}; Object.keys(o.fixos && typeof o.fixos === "object" ? o.fixos : {}).forEach(function (k) { var f = o.fixos[k]; if (f && isFinite(+f.folha) && isFinite(+f.x) && isFinite(+f.y)) r.fixos[k] = { folha: Math.max(1, Math.round(+f.folha)), x: +f.x, y: +f.y }; });
    r.arranjoFormato = FORMATOS_OK.indexOf(txt(o.arranjoFormato).toUpperCase()) > 0 ? txt(o.arranjoFormato).toUpperCase() : null;
    r.escala = o.escala === "auto" || o.escala == null ? "auto" : (isFinite(+o.escala) && +o.escala > 0 ? +o.escala : "auto");
    r.prefixo = (txt(o.prefixo).trim() || p.prefixo).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || p.prefixo;
    r.revisao = (txt(o.revisao).trim() || p.revisao).toUpperCase();
    r.descricaoRevisao = txt(o.descricaoRevisao).trim() || p.descricaoRevisao;
    r.conjuntos = {}; CONJUNTOS.forEach(function (k) { r.conjuntos[k] = !o.conjuntos || o.conjuntos[k] !== false; });
    /* CADERNO DE INTERIORES (js/arqinteriores.js): fora da série padrão; `ambientes` = ids escolhidos (null = os que têm mobiliário ou marcenaria) */
    var oi = o.interiores && typeof o.interiores === "object" ? o.interiores : {};
    var fl = {}; Object.keys(oi.folhas && typeof oi.folhas === "object" ? oi.folhas : {}).forEach(function (kf) { fl[kf] = !!oi.folhas[kf]; });
    r.interiores = { ativo: oi.ativo === true, ambientes: Array.isArray(oi.ambientes) ? oi.ambientes.map(String) : null, folhas: fl, prefixo: (txt(oi.prefixo).trim() || "INT").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "INT",
      formato: ["AUTO", "A3", "A2", "A1", "A0"].indexOf(txt(oi.formato).toUpperCase()) >= 0 ? txt(oi.formato).toUpperCase() : "AUTO" };
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
  /* o QUADRO DE LEGENDAS do padrão (js/arqestilo.js): DEMOLIR e CONSTRUIR PAREDE, mais o existente que fica (a planta tem parede cinza) */
  function legendaFases() {
    var C = DS().conv();
    return [{ t: C.demolido.rotulo, fill: C.demolido.fill }, { t: C.novo.rotulo, fill: C.novo.fill }, { t: C.existente.rotulo, fill: C.existente.fill }];
  }
  var NOTAS_GERAIS = [
    "Cotas, níveis e áreas em metros / metros quadrados. Níveis referidos ao piso acabado do térreo (±0,00).",
    "Prevalecem as cotas sobre o desenho. Conferir no local todas as medidas existentes antes de executar.",
    "Representação conforme a NBR 6492 (projetos de arquitetura); simbologia da RA Engenharia."
  ];
  /* a folha do arranjo traz vários conteúdos: as notas são a união das de cada um (símbolos e legendas iguais saem uma vez; legenda de nome repetido ganha o tipo), as notas gerais uma vez */
  var ROT_CURTO = { situacao: "SITUAÇÃO", cobertura: "COBERTURA", forro: "FORRO", piso: "PISO", layout: "LAYOUT", existente: "EXISTENTE", demolir: "DEMOLIR/CONSTRUIR" };
  function blocosNotas(c, def) {
    if (!(def.tipos && def.tipos.length)) return blocosNotas1(c, def);
    var defs = def.defs && def.defs.length ? def.defs : def.tipos.map(function (t) { return { id: def.id, tipo: t, numero: def.numero }; }), lista = [], gerais = null, pend = [], vistos = {};
    defs.forEach(function (dd) {
      blocosNotas1(c, dd).forEach(function (b) {
        if (b.titulo === "NOTAS GERAIS") { gerais = b; return; }
        if (b.titulo === "PENDÊNCIAS") { pend = pend.concat(b.itens); return; }
        var ch = (b.titulo || "#quadro") + "|" + JSON.stringify(b.itens || b.quadro);
        if (vistos[ch]) return; vistos[ch] = 1;
        b._tipo = dd.tipo; lista.push(b);
      });
    });
    var porTit = {}; lista.forEach(function (b) { if (b.titulo) porTit[b.titulo] = (porTit[b.titulo] || 0) + 1; });
    lista.forEach(function (b) { if (b.titulo && porTit[b.titulo] > 1) b.titulo = b.titulo + " - " + (ROT_CURTO[b._tipo] || txt(b._tipo).toUpperCase()); });
    if (gerais) lista.push(gerais);
    var ps = {}, pu = []; pend.forEach(function (it) { var t = it && typeof it === "object" ? it.t : it; if (!ps[t]) { ps[t] = 1; pu.push(it); } });
    if (pu.length) lista.push({ titulo: "PENDÊNCIAS", itens: pu.slice(0, 8) });
    return lista;
  }
  function blocosNotas1(c, def) {
    var B = [];
    if (def.tipo === "demolir") B.push({ quadro: { itens: legendaFases() } });
    if (def.tipo === "layout" || def.tipo === "existente" || def.tipo === "demolir") B.push({ titulo: "SÍMBOLOS", itens: ["P1, P2… portas e J1, J2… janelas: ver o quadro de esquadrias (folha " + c.numeroDe("quadros") + ").", "AA e BB: planos de corte (folha " + c.numeroDe("cortes") + ")."] });
    if (def.tipo === "cobertura") B.push({ titulo: "LEGENDA", itens: ["Linha grossa: cumeeira. Linha média: espigão e rincão. Tracejado: beiral e projeção das paredes.", "Seta e %: sentido e inclinação do caimento de cada água."].concat(arr(c.dados.calhas).length ? ["Retângulo tracejado junto à platibanda: calha embutida. Círculo cheio: descida pluvial. Quadrado: buzinote e ladrão da área técnica (laje descoberta com caimento de 1 % para eles)."] : []) });
    if (def.tipo === "forro") B.push({ titulo: "LEGENDA", itens: ["Círculo com cruz: luminária de teto.", "Linha tracejada interna: sanca (recuo de 15 cm do contorno do forro).", "Nível: face de baixo do forro acabado."] });
    if (def.tipo === "piso") B.push({ titulo: "LEGENDA", itens: ["Linha cheia: peça inteira. Linha vermelha: peça cortada.", "Quantidade com reserva de 10 % (receita da paginação do ambiente)."] });
    if (def.tipo === "situacao") B.push({ titulo: "LEGENDA", itens: ["Linha traço-ponto: divisa do lote.", "Hachura verde: área permeável (solo natural).", "Cobertura vista de cima, edificação tracejada por baixo."] });
    if (def.tipo === "int-planta") B.push({ titulo: "SÍMBOLOS", itens: ["Marcador de vista: a letra é a vista e PR nn é a folha onde ela está.", "Linha tracejada: armário aéreo em projeção.", "Cotas de posição: da parede até a marcenaria, a partir do canto."] });
    if (def.tipo === "int-vistas") B.push({ titulo: "NOTAS DE MATERIAL", itens: ["Cada nota sai dos parâmetros de material da família do móvel.", "Texto em vermelho: dado que o modelo não traz; informar antes de emitir."] });
    if (def.tipo === "int-cortes") B.push({ titulo: "CORTES 1:20", itens: ["Seção da peça no plano do marcador de corte; a parede fica ao fundo.", "Cotas verticais: todas as alturas internas. Horizontais: profundidade e espessuras.", "Espessura de chapa: a da família; vermelho = informar."] });
    if (def.tipo === "int-ele-planta" || def.tipo === "int-ele-vistas") B.push({ titulo: "ELÉTRICO", itens: ["Pontos do modelo (tomadas, interruptores e caixas); altura do piso ao centro da caixa.", "Cotas de posição de eixo a eixo. Vistas: cota de altura de cada ponto."] });
    if (def.tipo === "int-luz") B.push({ titulo: "LUMINOTÉCNICO", itens: ["Luminárias, fitas e interruptores do modelo em vermelho.", "A letra junto do ponto é o circuito ou o comando; cotas de eixo a eixo."] });
    if (def.tipo === "int-pedras") B.push({ titulo: "PEDRAS", itens: ["Bancadas de pedra do modelo; o material sai da família (vermelho = informar)."] });
    if (def.tipo === "int-imagens") B.push({ titulo: "IMAGENS", itens: ["Espaço reservado para os renders do ambiente."] });
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
    A.carimbo(F, pr, fl, geo, c.empObj, c.op.logo || null, def.carimboFolha || (rotulo + "/" + dois(c.total)));   /* interiores: "NN/MM" do ambiente */
    var numero = def.numero || (c.prefixo + "-" + rotulo);
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
    if (cfg.arranjo !== "serie" && DG()) return gerarEmBlocos(modelo, op, cfg, dados, sit, idx, avisos);   /* o arranjo (js/arqdiagrama.js); "serie" = uma folha por conteúdo, como antes */
    var fe = escolherFormatoEscala(dados, cfg, avisos), geo = P.geometria(fe.formato, "paisagem", "RA");
    var E = DS().estilo(op.padrao);
    var codigo = cfg.prefixo, rev = cfg.revisao, data = txt(op.data).trim() || hoje();
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null;

    /* contexto comum das folhas */
    var c = { E: E, geo: geo, A: geo.area, dados: dados, antes: sit.antes, depois: sit.depois, estadoDepois: sit.estadoDepois, idx: idx, op: { rua: cfg.rua, logo: op.logo }, cfg: cfg, avisos: avisos, avisosFolha: {},
      plano: { k: 1000 / fe.escala, escala: fe.escala, caixa: fe.caixa }, escalaSit: escolherEscalaSituacao(idx, geo), cortes: CT().escolherCortes(dados, sit.depois, op.cortes), prefixo: codigo, rev: rev, empObj: empObj, total: 0, formatoNome: fe.formato, numeroDe: function () { return "?"; } };

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
    if (!defs.length && !cfg.interiores.ativo) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhuma folha marcada para gerar."]) };
    defs.forEach(function (d, i) { d.rotulo = dois(i + 1); d.numero = codigo + "-" + d.rotulo; });
    c.total = defs.length;
    c.numeroDe = function (tipo) { for (var i = 0; i < defs.length; i++) if (defs[i].tipo === tipo) return codigo + "-" + defs[i].rotulo; return "(não gerada)"; };

    /* CADERNO DE INTERIORES (opcional, folhas A3 depois da série): INT-01… com a planta de móveis e as vistas de cada ambiente */
    var itensInt = [], geoI = null;  /* montado ANTES do desenho da série: a lista de folhas do quadro (ARQ-10) leva as INT */
    if (cfg.interiores && cfg.interiores.ativo) {
      if (!INT()) avisos.push("O motor do caderno de interiores (js/arqinteriores.js) não carregou.");
      else {
        geoI = P.geometria("A3", "paisagem", "RA"); c.depurar = op.depurar;
        try { var ri = INT().montar(c, cfg.interiores, geoI, E); itensInt = ri.itens; ri.avisos.forEach(function (a) { avisos.push(a); }); }
        catch (eI) { avisos.push("Caderno de interiores: " + (eI && eI.message ? eI.message : String(eI))); }
      }
    }
    c.intItens = itensInt;

    /* desenha cada folha (os quadros por último: a lista de folhas leva as escalas) */
    var Pl = PL(), Ct = CT(), Qd = QD(), feitas = {}, ordemDes = defs.filter(function (d) { return d.tipo !== "quadros"; }).concat(defs.filter(function (d) { return d.tipo === "quadros"; }));
    ordemDes.forEach(function (def) {
      var D = DS().novo(E, op.depurar === false ? false : true), res = {}, cc = c;
      cc.D = D; cc.def = def; cc.avisos = avisos;
      var nAv = avisos.length;
      try {
        if (def.tipo === "situacao") res = desenharSituacao(cc, def);
        else if (def.tipo === "existente") res = Pl.planta(cc, { modo: "existente", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: c.cfg.cotasInternas, completo: false });
        else if (def.tipo === "demolir") res = Pl.planta(cc, { modo: "demolir", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: c.cfg.cotasInternas, completo: false });
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
    if (itensInt.length) {
      var codI = cfg.interiores.prefixo, cI = {}; Object.keys(c).forEach(function (k) { cI[k] = c[k]; }); cI.geo = geoI; cI.A = geoI.area; cI.prefixo = codI; cI.total = itensInt.length; cI.avisosFolha = {};
      var prI = P.normalizar({ id: "arqinteriores", nome: "Arquitetura - caderno de interiores", formato: "A3", orientacao: "paisagem", origem: "arquitetura",
        carimbo: { modelo: "RA", empresa: emp0, responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra), proprietario: txt(op.proprietario),
                   contratante: txt(op.contratante), local: txt(op.local), codigo: codI, data: data, revisoes: [[revNum, cfg.descricaoRevisao, data]] },
        folhas: itensInt.map(function (it, i) { return { id: it.def.id, n: i + 1, conteudo: it.def.titulo, escala: it.escala, numero: codI + " " + rev }; }) });
      var AI = geoI.area, janI = [AI.x - 1, AI.y - 1, AI.x + AI.w + 1, AI.y + AI.h + 1];
      itensInt.forEach(function (it, i) {
        var conf = DS().conferir(it.D, janI);
        verificacao.textoTexto += conf.textoTexto.length; verificacao.textoLinha += conf.textoLinha.length; verificacao.foraJanela += conf.foraJanela.length; verificacao.total += conf.total;
        verificacao.porFolha.push({ numero: it.def.numero, textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela, detalhe: conf.detalhe || [] });
        cI.avisosFolha[it.def.id] = avisos.filter(function (a) { return a.indexOf(it.def.numero) === 0; });
        var svgI = montarFolha(cI, it.def, it.D, it.res, prI, prI.folhas[i], it.def.rotulo, geoI, E);
        var oI = { id: it.def.id, tipo: it.def.tipo, rotulo: it.def.rotulo, numero: it.def.numero, titulo: it.def.titulo, formato: "A3", escala: it.escala, svg: svgI, ambienteId: it.def.ambienteId, carimboFolha: it.def.carimboFolha };
        if (op.depurar) oI.caixasTexto = it.D.caixas;
        folhas.push(oI);
      });
    }
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var lista = folhas.map(function (f) { return { numero: f.numero, titulo: f.titulo, formato: f.formato, escala: f.escala }; });
    return { ok: true, folhas: folhas, formato: fe.formato, escalaPlanta: fe.escala, indices: idx, lista: lista, avisos: avisos, verificacao: verificacao, prefixo: codigo, revisao: rev };
  }

  /* ================================================================ O ARRANJO: blocos → folhas (js/arqdiagrama.js) */
  var GRUPO_TIPO = { situacao: "situacao", existente: "reforma", demolir: "reforma", layout: "projeto", cortes: "projeto", fachadas: "projeto", cobertura: "complementar", forro: "complementar", piso: "complementar", quadros: "quadros", humanizada: "humanizada" };
  var AVISO_FIXO = { "01": "situacao", "05": "cobertura", "06": "forro", "07": "cortes", "08": "fachadas", "09": "piso" };   /* os avisos dos desenhos citam "ARQ-05"… da série antiga: no arranjo vira o número da folha onde o conteúdo caiu */
  var LINHAS_LISTA = 30;
  function listaDefs(cfg, pavs) {
    var defs = [], cj = cfg.conjuntos;
    function add(tipo, pav) {
      var multi = pavs.length > 1 && pav != null, id = tipo + (multi ? "-p" + (pav + 1) : "");
      defs.push({ id: id, tipo: tipo, pav: pav, titulo: TITULO[tipo] + (multi ? " - " + txt(pavs[pav].nome).toUpperCase() : "") });
    }
    CONJUNTOS.forEach(function (tipo) {
      if (!cj[tipo]) return;
      if (tipo === "existente" || tipo === "demolir" || tipo === "layout" || tipo === "forro" || tipo === "piso" || tipo === "humanizada") { for (var i = 0; i < pavs.length; i++) add(tipo, i); }
      else add(tipo, null);
    });
    return defs;
  }
  function desenharDef(c, def, defs) {
    var Pl = PL(), Ct = CT(), cc = c;
    if (def.tipo === "situacao") return desenharSituacao(cc, def);
    if (def.tipo === "existente") return Pl.planta(cc, { modo: "existente", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: cc.cfg.cotasInternas, completo: false });
    if (def.tipo === "demolir") return Pl.planta(cc, { modo: "demolir", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: cc.cfg.cotasInternas, completo: false });
    if (def.tipo === "layout") return desenharLayout(cc, def);
    if (def.tipo === "cobertura") return Pl.cobertura(cc);
    if (def.tipo === "forro") return desenharForro(cc, def);
    if (def.tipo === "cortes") return Ct.cortes(cc);
    if (def.tipo === "fachadas") return Ct.fachadas(cc);
    if (def.tipo === "piso") return Pl.paginacao(cc);
    if (def.tipo === "quadros") return desenharQuadros(cc, def, defs, {});
    if (def.tipo === "humanizada") return Pl.humanizada(cc);
    return {};
  }
  var ZERO = { s: 0, sg: 0, tb: 0, cx: 0 };
  /* a planta existente sem nada existente, a de demolir/construir sem demolição (nem existente + novo juntos) não têm o que mostrar: devolve o motivo, ou "" */
  function conteudoVazio(c, def) {
    if (def.tipo !== "existente" && def.tipo !== "demolir") return "";
    var d = c.dados, pv = function (x) { return def.pav == null || x.pav === def.pav; };
    var els = arr(d.paredes).filter(function (w) { return !w.muro && pv(w); }).concat(arr(d.pilares).filter(pv)).concat(arr(d.lajes).filter(pv));
    function tem(st) { return els.some(function (e) { return e.status === st; }); }
    if (def.tipo === "existente") return tem("existente") || tem("demolido") ? "" : "o modelo não tem nada existente (obra nova).";
    return tem("demolido") || (tem("existente") && tem("novo")) ? "" : "o modelo não tem demolição nem reforma (tudo é a construir).";
  }
  /* desenha todos os conteúdos para o formato `fmt` e devolve os BLOCOS (cada um rígido, na escala dele). av = os avisos desta rodada */
  function renderarBlocos(ctx, fmt, fe, av) {
    var G = DG(), c = ctx.novoC(fmt, fe, av), defs = ctx.defs.map(function (d) { var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; }); return o; }), blocos = [];
    var ordemDes = defs.filter(function (d) { return d.tipo !== "quadros"; }).concat(defs.filter(function (d) { return d.tipo === "quadros"; }));
    ordemDes.forEach(function (def) {
      var vazio = conteudoVazio(c, def);
      if (vazio) { av.push("Folha " + def.titulo + ": não gerada — " + vazio); def.vazio = true; return; }   /* sem o que desenhar, o bloco não entra (nem título, nem norte, nem lista) */
      var D = DS().novo(ctx.E, true), res = {}, subs = [], nAv = av.length;
      c.D = D; c.def = def;
      c.bloco = function (nome, fn, titulo) { var b = G.capturar(D, fn); b.sub = nome; b.tituloBloco = titulo || def.titulo; subs.push(b); return b.res; };
      try { res = desenharDef(c, def, ctx.defs) || {}; }
      catch (e) { av.push("Folha " + def.titulo + ": " + (e && e.message ? e.message : String(e))); D.texto(c.A.x + 10, c.A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", ctx.E.T.titulo, { cor: VERMELHO }); }
      c.bloco = null;
      var caps = subs.slice();
      if (subs.length) { var rest = G.resto(D, subs.map(function (b) { return b.faixa; })); if (rest.box) { rest.sub = "resto"; rest.tituloBloco = def.titulo; caps.push(rest); } }
      else { var todo = G.recorte(D, ZERO, G.marca(D)); todo.sub = ""; todo.tituloBloco = def.titulo; caps.push(todo); }
      def.avisos = av.slice(nAv).filter(function (a) { return /^ARQ-\d\d|^Folha|^ARQ-|^Humanizada/.test(a); });
      def.idx = ordemDes.indexOf(def);
      caps.forEach(function (cap, si) {
        if (!cap.box) return;
        var tabela = /^(quadro|esquadrias|acabamentos|lista)/.test(cap.sub || "");
        blocos.push({ id: def.id + (cap.sub ? ":" + cap.sub : ""), defId: def.id, tipo: def.tipo, titulo: def.titulo, tituloBloco: cap.tituloBloco, escala: tabela ? "SEM ESCALA" : txt(res && res.escala) || "INDICADA", grupo: GRUPO_TIPO[def.tipo] || def.id,
          ordem: ctx.defs.map(function (d) { return d.id; }).indexOf(def.id) * 10 + si, w: cap.box[2] - cap.box[0], h: cap.box[3] - cap.box[1], bloco: cap, fixo: ctx.fixos[def.id + (cap.sub ? ":" + cap.sub : "")] || null });
      });
    });
    return { c: c, blocos: blocos, defs: defs };
  }
  /* a lista de folhas: linhas = [[numero, titulo, formato, escala]…] repartidas em blocos de até LINHAS_LISTA linhas */
  function blocosLista(ctx, c, linhas) {
    var G = DG(), Qd = QD(), A = c.A, out = [], n = Math.max(1, Math.ceil(linhas.length / LINHAS_LISTA)), cols = [{ t: "FOLHA", f: 1.2, al: "E" }, { t: "TÍTULO", f: 6.4, al: "E" }, { t: "FORMATO", f: 1.2 }, { t: "ESCALA", f: 1.4 }];
    for (var k = 0; k < n; k++) {
      var D = DS().novo(ctx.E, true), parte = linhas.slice(k * LINHAS_LISTA, (k + 1) * LINHAS_LISTA), cap = G.capturar(D, function () { return Qd.tabela(D, A.x + 4, A.y + 2, Math.min(A.w - 8, 330), "LISTA DE FOLHAS" + (n > 1 ? " (" + (k + 1) + "/" + n + ")" : ""), cols, parte); });
      if (!cap.box) continue;
      out.push({ id: "quadros:lista-" + (k + 1), defId: "lista", tipo: "lista", titulo: "LISTA DE FOLHAS", tituloBloco: "LISTA DE FOLHAS", escala: "SEM ESCALA", grupo: "quadros", ordem: 9999 + k, w: cap.box[2] - cap.box[0], h: cap.box[3] - cap.box[1], bloco: cap, fixo: ctx.fixos["quadros:lista-" + (k + 1)] || null });
    }
    return out;
  }
  function escalaDe(bl) {
    var u = [], so = true;
    bl.forEach(function (b) { var e = txt(b.escala); if (e && e !== "SEM ESCALA" && u.indexOf(e) < 0) { u.push(e); so = false; } });
    return so ? "SEM ESCALA" : u.join(" / ");
  }
  /* o título da folha: o que ela traz, na ordem da série (conteúdo inteiro → o título do conteúdo; só parte dele → o título do bloco) */
  function tituloDaFolha(bl, todos) {
    var partes = [], porDef = {};
    todos.forEach(function (b) { (porDef[b.defId] = porDef[b.defId] || []).push(b.id); });
    var vistos = {}, ord = bl.slice().sort(function (a, b) { return a.ordem - b.ordem; });
    ord.forEach(function (b) {
      var irmaos = porDef[b.defId] || [], todosAqui = irmaos.every(function (id) { return ord.some(function (q) { return q.id === id; }); });
      var t = todosAqui ? b.titulo : b.tituloBloco;
      if (t && !vistos[t]) { vistos[t] = 1; partes.push(t); }
    });
    var s = partes.join(" / ");
    while (s.length > 96 && partes.length > 2) { partes.pop(); s = partes.join(" / ") + " E OUTROS"; }
    return s;
  }

  function gerarEmBlocos(modelo, op, cfg, dados, sit, idx, avisos) {
    var P = PR(), G = DG(), E = DS().estilo(op.padrao), codigo = cfg.prefixo, rev = cfg.revisao, data = txt(op.data).trim() || hoje(), emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null, emp0 = empObj ? "" : txt(emp), revNum = rev.replace(/^R/i, "") || "00";
    var defs = listaDefs(cfg, dados.pavimentos);
    if (!defs.length && !cfg.interiores.ativo) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhuma folha marcada para gerar."]) };
    var fixos = cfg.fixos || {}, numMap = {};
    var ctx = { E: E, defs: defs, fixos: fixos };
    ctx.novoC = function (fmt, fe, av) {
      var geo = P.geometria(fmt, "paisagem", "RA");
      return { E: E, geo: geo, A: geo.area, dados: dados, antes: sit.antes, depois: sit.depois, estadoDepois: sit.estadoDepois, idx: idx, op: { rua: cfg.rua, logo: op.logo }, cfg: cfg, avisos: av, avisosFolha: {},
        plano: { k: 1000 / fe.escala, escala: fe.escala, caixa: fe.caixa }, escalaSit: escolherEscalaSituacao(idx, geo), cortes: CT().escolherCortes(dados, sit.depois, op.cortes), prefixo: codigo, rev: rev, empObj: empObj, total: 0, formatoNome: fmt,
        numeroDe: function (tipo) { return numMap[tipo] || "(não gerada)"; }, emBlocos: true, depurar: op.depurar };
    };

    /* ---- caderno de interiores (A3 por padrão): primeiro, porque a lista de folhas do quadro leva as folhas INT */
    var diagCandI = [];
    var itensInt = [], blocosInt = [], geoI = null, fmtI = cfg.interiores.formato === "AUTO" ? "A3" : (cfg.interiores.formato || "A3");
    if (cfg.interiores && cfg.interiores.ativo) {
      var INTm = INT();
      if (!INTm || !INTm.montarBlocos) avisos.push("O motor do caderno de interiores (js/arqinteriores.js) não carregou.");
      else {
        /* formato do caderno: AUTO testa A3 e A2 (a área útil da A3 é 249 x 271 mm: não cabem dois desenhos 1:25 lado a lado) e fica com o de menos folhas
           entre os que passam de 30 % de ocupação média; um formato só para o caderno inteiro */
        var fmtsI = cfg.interiores.formato === "AUTO" ? ["A3", "A2"] : [fmtI], melhorI = null;
        fmtsI.forEach(function (fm) {
          var gI = P.geometria(fm, "paisagem", "RA"), avI = [], cInt = ctx.novoC(fm, { escala: 50, caixa: dados.caixa }, avI), ri = null;
          try { ri = INTm.montarBlocos(cInt, cfg.interiores, gI, E, { fixos: fixos }); } catch (eI) { avisos.push("Caderno de interiores: " + (eI && eI.message ? eI.message : String(eI))); return; }
          var AI0 = gI.area, med = ri.itens.length ? ri.itens.reduce(function (s0, it) { var u = 0; it.blocos.forEach(function (b) { u += b.w * b.h; }); return s0 + u / (AI0.w * AI0.h); }, 0) / ri.itens.length : 0;
          var cand = { fm: fm, g: gI, ri: ri, n: ri.itens.length, med: med, ok: med >= 0.30 };
          if (!melhorI || (cand.ok && !melhorI.ok) || (cand.ok === melhorI.ok && (cand.n < melhorI.n || (cand.n === melhorI.n && cand.med > melhorI.med)))) melhorI = cand;
          diagCandI.push({ formato: fm, folhas: cand.n, ocupacaoMedia: med });
        });
        if (melhorI) { fmtI = melhorI.fm; geoI = melhorI.g; itensInt = melhorI.ri.itens; blocosInt = melhorI.ri.blocos; melhorI.ri.avisos.forEach(function (a) { avisos.push(a); }); }
      }
    }
    var linhasInt = itensInt.map(function (it) { return [it.def.numero, it.def.titulo, fmtI, it.escala]; });

    /* ---- a série ARQ: cada formato candidato desenha tudo, empacota e é avaliado */
    var cands = [], rodadas = {}, resultado = null, escolha = null;
    if (defs.length) {
      var AUTO = cfg.formato === "AUTO", formatos = AUTO ? ["A3", "A2", "A1", "A0"] : [cfg.formato];
      if (AUTO && cfg.arranjoFormato && Object.keys(fixos).some(function (k) { return !/^int:/.test(k); })) formatos = [cfg.arranjoFormato];
      var ultimo = null;
      formatos.forEach(function (fmt) {
        var av = [], fe = escolherFormatoEscala(dados, { formato: fmt, escala: cfg.escala }, av), ok = !fe.estourou && (!AUTO || fe.escala <= 100);
        if (AUTO && !ok && formatos.length > 1 && fmt !== formatos[formatos.length - 1]) { cands.push({ formato: fmt, res: { folhas: [], naoCabe: ["escala"], ocupacaoMedia: 0 }, ok: false }); return; }
        var rr = renderarBlocos(ctx, fmt, fe, av), geo = rr.c.geo, areaC = { w: geo.area.w, h: geo.area.h }, res = G.empacotar(rr.blocos, areaC);
        /* a lista de folhas também ocupa lugar: entra na avaliação do formato (uma linha por folha estimada, mais as do caderno INT) */
        var falsas = []; for (var qf = 0; qf < res.folhas.length; qf++) falsas.push(["ARQ-00", "TÍTULO DA FOLHA", fmt, "1:50"]);
        res = G.empacotar(rr.blocos.concat(blocosLista(ctx, rr.c, falsas.concat(linhasInt))), areaC);
        rodadas[fmt] = { rr: rr, fe: fe, av: av, geo: geo, ok: ok };
        cands.push({ formato: fmt, res: res, ok: ok });
        ultimo = fmt;
      });
      escolha = G.escolherFormato(cands.filter(function (c0) { return rodadas[c0.formato]; }));
      if (!escolha.formato) escolha = { formato: ultimo, candidatos: [], motivo: "único formato" };
    }

    var fmt = escolha ? escolha.formato : null, sel = fmt ? rodadas[fmt] : null, folhas = [], verificacao = { total: 0, textoTexto: 0, textoLinha: 0, foraJanela: 0, blocosSobrepostos: 0, blocosCortados: 0, blocosPerto: 0, porFolha: [] };
    var diag = { arranjo: "auto", formato: fmt, motivo: escolha ? escolha.motivo : "", candidatos: escolha ? escolha.candidatos : [], meta: G.META, folhas: [], interiores: { formato: fmtI, candidatos: diagCandI, grupos: [], ocupacaoMedia: 0 } };
    var c = null, pack = null, blocosFinais = [], sheets = [], pr = null;
    if (sel) {
      var rr2 = sel.rr, geo2 = sel.geo, areaWH = { w: geo2.area.w, h: geo2.area.h };
      c = rr2.c;
      /* a lista de folhas: o tamanho dela depende de quantas folhas saem, e quantas folhas saem dependem do tamanho dela: itera até fechar */
      var base = G.empacotar(rr2.blocos, areaWH), nL = base.folhas.length, cL = null;
      function linhasFalsas(n) { var L = []; for (var i = 0; i < n; i++) L.push(["ARQ-00", "TÍTULO DA FOLHA", fmt, "1:50"]); return L.concat(linhasInt); }
      var maximo = 0;
      for (var it = 0; it < 6; it++) {
        var lb0 = blocosLista(ctx, c, linhasFalsas(nL));
        pack = G.empacotar(rr2.blocos.concat(lb0), areaWH);
        maximo = Math.max(maximo, pack.folhas.length);
        if (pack.folhas.length === nL) break;
        nL = it > 3 ? maximo : pack.folhas.length;
      }
      var nLinhas = nL, porId = {}; rr2.blocos.forEach(function (b) { porId[b.id] = b; });
      /* o mapa tipo → número da folha (as notas e os avisos citam) */
      var seqF = pack.folhas;
      function numF(i) { return codigo + "-" + dois(i + 1); }
      seqF.forEach(function (f, i) { f.itens.forEach(function (q) { var b = porId[q.id]; if (b && !numMap[b.tipo] && (b.tipo !== "quadros" || /:esquadrias$/.test(b.id))) numMap[b.tipo] = numF(i); }); });
      /* as linhas reais da lista (a partir da folha onde cada bloco caiu) e os blocos finais */
      var linhasReais = [];
      var tmpBl = seqF.map(function (f) { return f.itens.map(function (q) { return porId[q.id] || { id: q.id, defId: "lista", tipo: "lista", titulo: "LISTA DE FOLHAS", tituloBloco: "LISTA DE FOLHAS", escala: "SEM ESCALA", ordem: 9999 }; }); });
      tmpBl.forEach(function (bl, i) { linhasReais.push([numF(i), tituloDaFolha(bl, rr2.blocos.concat([{ id: "quadros:lista-1", defId: "lista", titulo: "LISTA DE FOLHAS", tituloBloco: "LISTA DE FOLHAS", ordem: 9999 }])), fmt, escalaDe(bl)]); });
      while (linhasReais.length < nLinhas) linhasReais.push(["", "", "", ""]);
      var lb = blocosLista(ctx, c, linhasReais.concat(linhasInt));
      lb.forEach(function (b) { porId[b.id] = b; });
      var ok2 = lb.every(function (b) { var q = null; seqF.forEach(function (f) { f.itens.forEach(function (it2) { if (it2.id === b.id) q = it2; }); }); return q && Math.abs(q.w - b.w) < 0.05 && Math.abs(q.h - b.h) < 0.05; });
      if (!ok2) pack = G.empacotar(rr2.blocos.concat(lb), areaWH);   /* o tamanho real saiu diferente do suposto: re-empacota com o real */
      blocosFinais = rr2.blocos.concat(lb);
      var porId2 = {}; blocosFinais.forEach(function (b) { porId2[b.id] = b; });
      numMap = {}; pack.folhas.forEach(function (f, i) { f.itens.forEach(function (q) { var b = porId2[q.id]; if (b && !numMap[b.tipo] && (b.tipo !== "quadros" || /:esquadrias$/.test(b.id))) numMap[b.tipo] = numF(i); }); });
      c.total = pack.folhas.length;
      pr = P.normalizar({ id: "arqpranchas", nome: "Arquitetura - projeto executivo", formato: fmt, orientacao: "paisagem", origem: "arquitetura",
        carimbo: { modelo: "RA", empresa: emp0, responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra), proprietario: txt(op.proprietario),
                   contratante: txt(op.contratante), local: txt(op.local), codigo: codigo, data: data, revisoes: [[revNum, cfg.descricaoRevisao, data]] },
        folhas: pack.folhas.map(function (f, i) { var bl = f.itens.map(function (q) { return porId2[q.id]; }).filter(Boolean); return { id: "folha-" + dois(i + 1), n: i + 1, conteudo: tituloDaFolha(bl, blocosFinais), escala: escalaDe(bl), numero: codigo + " " + rev }; }) });
      var A = geo2.area, janela = [A.x - 1, A.y - 1, A.x + A.w + 1, A.y + A.h + 1], mapaBl = {};
      blocosFinais.forEach(function (b) { mapaBl[b.id] = b.bloco; });
      pack.folhas.forEach(function (f, i) {
        var bl = f.itens.map(function (q) { return porId2[q.id]; }).filter(Boolean), rot = dois(i + 1), D = DS().novo(E, true), cp = G.compor(D, f, mapaBl, A);
        var conf = DS().conferir(D, janela), cb = G.conferir(cp.colocados, A);
        verificacao.textoTexto += conf.textoTexto.length; verificacao.textoLinha += conf.textoLinha.length; verificacao.foraJanela += conf.foraJanela.length;
        verificacao.blocosSobrepostos += cb.sobrepostos.length; verificacao.blocosCortados += cb.cortados.length; verificacao.blocosPerto += cb.pertoDemais.length;
        verificacao.total += conf.total + cb.total;
        verificacao.porFolha.push({ numero: numF(i), textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela, blocos: cb });
        var tipos = [], defsF = [], avF = [], vistosD = {};
        bl.slice().sort(function (a, b) { return a.ordem - b.ordem; }).forEach(function (b) {
          if (tipos.indexOf(b.tipo) < 0) tipos.push(b.tipo);
          if (!vistosD[b.defId]) { vistosD[b.defId] = 1; var dd = null; rr2.defs.forEach(function (x) { if (x.id === b.defId) dd = x; }); if (dd) { defsF.push({ id: dd.id, tipo: dd.tipo, numero: numF(i) }); avF = avF.concat(dd.avisos || []); } }
        });
        if (!defsF.length) defsF.push({ id: "lista", tipo: "lista", numero: numF(i) });
        var defS = { id: "folha-" + rot, tipo: "arranjo", tipos: tipos, defs: defsF, titulo: tituloDaFolha(bl, blocosFinais), rotulo: rot, numero: numF(i) };
        defsF.forEach(function (dd) { var def0 = null; rr2.defs.forEach(function (x) { if (x.id === dd.id) def0 = x; }); c.avisosFolha[dd.id] = def0 ? (def0.avisos || []).map(function (a) { return a.replace(/^ARQ-(\d\d)(?=:)/, function (m, nn) { return numMap[AVISO_FIXO[nn]] || m; }); }) : []; });
        var svg = montarFolha(c, defS, D, {}, pr, pr.folhas[i], rot, geo2, E);
        var o = { id: defS.id, tipo: "arranjo", tipos: tipos, rotulo: rot, numero: defS.numero, titulo: defS.titulo, formato: fmt, escala: escalaDe(bl), svg: svg, blocos: bl.map(function (b) { return b.id; }), ocupacao: f.ocupacao };
        if (op.depurar) o.caixasTexto = D.caixas;
        folhas.push(o);
        diag.folhas.push({ numero: defS.numero, ocupacao: f.ocupacao, blocos: f.itens.map(function (q) { var b = porId2[q.id] || {}; return { id: q.id, tipo: b.tipo, titulo: b.tituloBloco || b.titulo, x: q.x, y: q.y, w: q.w, h: q.h, fixo: !!q.fixo, grupo: b.grupo }; }) });
      });
      diag.ocupacaoMedia = pack.folhas.reduce(function (s, f) { return s + f.ocupacao; }, 0) / (pack.folhas.length || 1);
      diag.layout = G.layoutDe(pack, { formato: fmt });
      diag.area = { w: A.w, h: A.h };
      diag.blocos = blocosFinais.map(function (b) { return { id: b.id, tipo: b.tipo, titulo: b.tituloBloco || b.titulo, w: b.w, h: b.h, grupo: b.grupo, ordem: b.ordem }; });
      diag.naoCabe = pack.naoCabe;
      sel.av.forEach(function (a) { avisos.push(a.replace(/^ARQ-(\d\d)(?=:)/, function (m, nn) { return numMap[AVISO_FIXO[nn]] || m; })); });
      pack.avisos.forEach(function (a) { avisos.push("Arranjo: " + a); });
      pack.naoCabe.forEach(function (id) { avisos.push("Arranjo: o bloco " + id + " não cabe na folha " + fmt + " na escala escolhida: use um formato maior."); });
    }

    /* ---- as folhas do caderno de interiores (já empacotadas por ambiente e disciplina) */
    if (itensInt.length) {
      var codI = cfg.interiores.prefixo, cI = ctx.novoC(fmtI, { escala: 50, caixa: dados.caixa }, avisos); cI.geo = geoI; cI.A = geoI.area; cI.prefixo = codI; cI.total = itensInt.length; cI.avisosFolha = {};
      var prI = P.normalizar({ id: "arqinteriores", nome: "Arquitetura - caderno de interiores", formato: fmtI, orientacao: "paisagem", origem: "arquitetura",
        carimbo: { modelo: "RA", empresa: emp0, responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra), proprietario: txt(op.proprietario),
                   contratante: txt(op.contratante), local: txt(op.local), codigo: codI, data: data, revisoes: [[revNum, cfg.descricaoRevisao, data]] },
        folhas: itensInt.map(function (it, i) { return { id: it.def.id, n: i + 1, conteudo: it.def.titulo, escala: it.escala, numero: codI + " " + rev }; }) });
      var AI = geoI.area, janI = [AI.x - 1, AI.y - 1, AI.x + AI.w + 1, AI.y + AI.h + 1];
      itensInt.forEach(function (it, i) {
        var conf = DS().conferir(it.D, janI), cb2 = it.conf || { sobrepostos: [], pertoDemais: [], cortados: [], total: 0 };
        verificacao.textoTexto += conf.textoTexto.length; verificacao.textoLinha += conf.textoLinha.length; verificacao.foraJanela += conf.foraJanela.length;
        verificacao.blocosSobrepostos += cb2.sobrepostos.length; verificacao.blocosCortados += cb2.cortados.length; verificacao.blocosPerto += cb2.pertoDemais.length; verificacao.total += conf.total + cb2.total;
        verificacao.porFolha.push({ numero: it.def.numero, textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela, detalhe: conf.detalhe || [], blocos: cb2 });
        cI.avisosFolha[it.def.id] = avisos.filter(function (a) { return a.indexOf(it.def.numero) === 0; });
        var svgI = montarFolha(cI, it.def, it.D, it.res, prI, prI.folhas[i], it.def.rotulo, geoI, E);
        var oI = { id: it.def.id, tipo: it.def.tipo, tipos: it.def.tipos, rotulo: it.def.rotulo, numero: it.def.numero, titulo: it.def.titulo, formato: fmtI, escala: it.escala, svg: svgI, ambienteId: it.def.ambienteId, carimboFolha: it.def.carimboFolha, blocos: it.def.blocos };
        if (op.depurar) oI.caixasTexto = it.D.caixas;
        folhas.push(oI);
      });
      var gr = {};
      blocosInt.forEach(function (g) { var o2 = (gr[g.grupo] = gr[g.grupo] || { grupo: g.grupo, folhas: [], blocos: g.blocos.map(function (b) { return { id: b.id, w: b.w, h: b.h, grupo: b.grupo, ordem: b.ordem, tipo: b.tipo }; }) }); o2.folhas.push({ numero: g.folha, k: g.k, ocupacao: (g.res.folhas.filter(function (f) { return f.itens.some(function (q) { return g.blocos.some(function (b) { return b.id === q.id; }); }); })[0] || { ocupacao: 0 }).ocupacao }); });
      diag.interiores.grupos = Object.keys(gr).map(function (k) { return gr[k]; });
      diag.interiores.folhas = itensInt.map(function (it) { var A3 = geoI.area, u = 0; it.blocos.forEach(function (b) { u += b.w * b.h; }); return { numero: it.def.numero, ocupacao: u / (A3.w * A3.h), blocos: it.def.blocos }; });
      diag.interiores.ocupacaoMedia = diag.interiores.folhas.length ? diag.interiores.folhas.reduce(function (s, f) { return s + f.ocupacao; }, 0) / diag.interiores.folhas.length : 0;
    }
    if (!folhas.length) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhuma folha gerada."]) };
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var lista = folhas.map(function (f) { return { numero: f.numero, titulo: f.titulo, formato: f.formato, escala: f.escala }; });
    return { ok: true, folhas: folhas, formato: fmt || fmtI, escalaPlanta: sel ? sel.fe.escala : null, indices: idx, lista: lista, avisos: avisos, verificacao: verificacao, prefixo: codigo, revisao: rev, diagrama: diag };
  }

  /* ------------------------------------------------------------ AS FOLHAS QUE TÊM MAIS QUE O DESENHO */
  function desenharSituacao(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, sub = c.bloco || function (nome, fn) { return fn(); }, r = sub("desenho", function () { return Pl.situacao(c); });
    var wQ = Math.min(176, Math.max(140, A.w * 0.34)), x = A.x + A.w - wQ - 2, y = A.y + 14;
    sub("quadros", function () {
    var t1 = Qd.quadroAreas(D, x, y, wQ - 2, c.idx); y += t1.h + 8;
    var t2 = Qd.quadroIndices(D, x, y, wQ - 2, c.idx); y += t2.h + 6;
    var C = c.idx.limites;
    if (C && C.conferir) { var ls = AP().quebrar("Limites de EXEMPLO (" + txt(C.nome) + "): CONFERIR NA LEI e no zoneamento do lote.", D.E.T.nota * 0.9, wQ - 4); ls.forEach(function (s) { D.texto(x, y + D.E.T.nota * 0.8, s, D.E.T.nota * 0.9, { cor: VERMELHO }); y += D.E.T.nota * 1.4; }); y += 3; }
    else if (!(C && (C.ocupacaoMax != null || C.permeavelMin != null || C.aproveitamentoMax != null))) { D.texto(x, y + D.E.T.nota * 0.8, "Limites do município: informe (taxa de ocupação, permeabilidade).", D.E.T.nota * 0.9, { cor: VERMELHO }); y += D.E.T.nota * 1.6 + 3; }
    var t3 = Qd.quadroRecuos(D, x, y, wQ - 2, c.idx);
    });
    return r;
  }
  function desenharLayout(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, pl = c.plano;
    var r = Pl.planta(c, { modo: "layout", pav: def.pav, titulo: def.titulo, cotas: true, cotasInt: c.cfg.cotasInternas, completo: true, cortes: true });
    /* o quadro de esquadrias compacto sob a planta, se couber; senão a nota remete ao ARQ de quadros */
    var yT = r.y + 14, esq = arr(c.dados.esquadrias).length, hl = Math.max(4.4, D.E.T.tabela * 1.85), hT = (esq + 1) * hl + D.E.T.tabelaCab * 2 + 4;
    if (c.emBlocos) { /* no arranjo o quadro de esquadrias é um bloco próprio (folha dos quadros) */ }
    else if (esq && yT + hT <= A.y + A.h - 2 && A.w > 200) Qd.quadroEsquadrias(D, A.x + 140, yT - 8, Math.min(A.w - 144, 330), c.dados.esquadrias);
    else if (esq) c.avisos.push(def.numero + ": o quadro de esquadrias não coube sob a planta; está na folha " + c.numeroDe("quadros") + ".");
    void pl;
    return r;
  }
  function desenharForro(c, def) {
    var Pl = PL(), Qd = QD(), D = c.D, A = c.A, sub = c.bloco || function (nome, fn) { return fn(); }, r = sub("planta", function () { return Pl.forro(c); });
    var yT = r.M.oy + r.M.alt + DS().K.margemCotas + 12, ambs = arr(c.depois.ambientes), n = r.forros.length, hl = Math.max(4.4, D.E.T.tabela * 1.85);
    if (yT + (n + 2) * hl + 14 <= A.y + A.h - 2) sub("quadro", function () { Qd.quadroForros(D, A.x + 130, yT - 8, Math.min(A.w - 134, 220), r.forros, ambs, arr(c.dados.luminarias).filter(function (l) { return l.status !== "demolido"; }).length); });
    return r;
  }
  function desenharQuadros(c, def, defs, feitas) {
    var Qd = QD(), D = c.D, A = c.A, T = D.E.T, y = A.y + 4, w = A.w - 8;
    if (c.emBlocos) {   /* no arranjo cada quadro é um bloco (a lista de folhas é montada depois, com a folha onde cada bloco caiu); cada tabela leva o próprio título */
      c.bloco("esquadrias", function () { Qd.quadroEsquadrias(D, A.x + 4, A.y + 4, Math.min(w, 330), c.dados.esquadrias); });
      c.bloco("acabamentos", function () { Qd.quadroAcabamentos(D, A.x + 4, A.y + A.h / 2, Math.min(w, 300), c.depois.ambientes); });
      return { escala: "SEM ESCALA" };
    }
    DS().titulo(D, A.x + 4, A.y + 2, def.titulo, "SEM ESCALA", 1); y += 14;
    var t1 = Qd.quadroEsquadrias(D, A.x + 4, y, w, c.dados.esquadrias); y += t1.h + 10;
    var t2 = Qd.quadroAcabamentos(D, A.x + 4, y, w, c.depois.ambientes); y += t2.h + 10;
    /* lista de folhas */
    var linhas = defs.map(function (d) { return [d.numero, d.titulo, c.formatoNome, (feitas[d.id] && feitas[d.id].escala) || "SEM ESCALA"]; });
    arr(c.intItens).forEach(function (it) { linhas.push([it.def.numero, it.def.titulo, "A3", it.escala]); });   /* as folhas do caderno de interiores (A3) */
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

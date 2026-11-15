/* =====================================================================
 * arqcaderno.js — CADERNO EXECUTIVO DE ARQUITETURA (A3 paisagem, uma página por assunto) — 15/11/2026, pedido do Rogério:
 * "pranchas executivas" ≠ "CADERNO EXECUTIVO". O caderno é um DOCUMENTO: faixa de cabeçalho com o título da página e a disciplina, rodapé com
 * empresa · obra · "Página n de N", e MAIS informação detalhada por assunto. Molde: js/hidcaderno.js (caderno do hidrossanitário).
 * Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   ArqCaderno.gerar(modelo, opcoes) → { ok, paginas: [{ numero, pagina, titulo, tipo, svg, escala }], indice: [{ pagina, numero, titulo }], avisos, verificacao, nomeArquivo, … }
 *   ArqCaderno.exportar(r, "pdf" | "svg")          PDF vetorial (js/svgpdf.js), o MESMO caminho do caderno do hidro
 *   ArqCaderno.nomeArquivo(opcoes, conteudo)       PE_<CLIENTE>_<CONTEÚDO>_R<nn>
 *
 * NÃO REDESENHA: reaproveita os desenhos das pranchas (js/arqpranchas.js → ArqPranchas._cad entrega o contexto de desenho na ÁREA DA PÁGINA DO CADERNO e chama
 * js/arqplantas.js, js/arqcortes.js, js/arqquadros.js, js/arqdesenho.js). O que é só do caderno (capa/índice, mapas de portas e janelas, pontos, check-list,
 * fichas dos detalhamentos condicionais) usa as MESMAS primitivas e o MESMO estilo (penas do padrão arquitetura_interiores).
 *
 * ROTEIRO (padrão da casa; texto próprio): 1 capa + índice · 2 situação + quadro de áreas · 3 planta-baixa (uma por pavimento) · 4 cortes · 5 fachadas ·
 *   6 detalhamento de fachadas (chamada marsala) · 7 planta de esquadrias · 8 mapa de portas · 9 mapa de janelas · 10 detalhamentos CONDICIONAIS (só com o elemento:
 *   escada, guarda-corpo, sacada, casa do gás, lareira, churrasqueira/fogão a lenha, forro de gesso) · 11 pontos elétricos e hidráulicos · 12 renders ·
 *   13 check-list de entrega (uso interno: só na versão completa).
 *
 * NADA É INVENTADO: o que o modelo não traz sai "informe" em VERMELHO (e vira pendência no check-list); página condicional sem o elemento NÃO sai (nem no índice).
 * COR DO TEMPLATE = a PALETA DA OBRA (opcoes.paleta = { primaria, secundaria }; sem ela: as cores de fachada da obra; sem elas: a paleta padrão da casa).
 * GRAFICAÇÃO: paredes contorno preto 0,35 com hachura cinza (232 em detalhe; 138 em esquadrias e lajes), vista 0,13, chamada marsala 155/38/38 0,18 tracejada com
 * ponto na ponta, forro de gesso vermelho 223/0/0 0,13 com hachura 248 — as penas vêm do js/arqdesenho.js / js/arqestilo.js; as do caderno (CAD-*) estão em K.pena.
 * Teste: tools/test-arq-caderno.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function AQ() { return dep("ArqPranchas", "./arqpranchas.js"); }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PL() { return dep("ArqPlantas", "./arqplantas.js"); }
  function CT() { return dep("ArqCortes", "./arqcortes.js"); }
  function QD() { return dep("ArqQuadros", "./arqquadros.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function PDFm() { return dep("SvgPdf", "./svgpdf.js"); }
  function FS() { return dep("BimFases", "./bimfases.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function HP() { return dep("HidPranchas", "./hidpranchas.js"); }
  function DET() { return dep("ArqDetalhes", "./arqdetalhes.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function semAcento(t) { var s = txt(t); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }

  /* ------------------------------------------------------------ geometria da página e penas do caderno (mm de papel) */
  var VERMELHO = "#c00000";
  var K = {
    A3: [420, 297], margem: 10, cabecalho: 15, rodape: 12, folgaV: 4,
    colNotas: 86,                       /* coluna de notas e legendas à direita (a mesma do padrão das pranchas, mais estreita) */
    /* a paleta padrão da casa (08_cores\paleta_casa487_R00.html) — só vale quando a obra não cadastrou a dela */
    paletaPadrao: { primaria: "#2E4050", secundaria: "#D4C3A0", fundo: "#F1EDE4" },
    /* penas e cores de GRAFICAÇÃO do caderno (pedido do Rogério, 15/11/2026): RGB e espessura em mm */
    pena: {
      paredeContorno: 0.35, paredeHachuraClaro: "#e8e8e8" /* 232 */, paredeHachuraEsq: "#8a8a8a" /* 138 */, vista: 0.13,
      chamada: "#9b2626" /* marsala 155/38/38 */, chamadaMm: 0.18, chamadaTraco: "1.6 0.8",
      forro: "#df0000" /* 223/0/0 */, forroMm: 0.13, forroHachura: "#f8f8f8" /* 248 */
    },
    escalaMapa: 50,                     /* a elevação e o símbolo dos mapas de portas e janelas: 1:50 */
    linhasIndiceMax: 26                 /* linhas do índice por coluna na capa */
  };
  var ROTULO_PAG = {
    capa: "CAPA E ÍNDICE", situacao: "SITUAÇÃO E LOCALIZAÇÃO - QUADRO DE ÁREAS", planta: "PLANTA-BAIXA", cortes: "CORTES", fachadas: "FACHADAS", "fachadas-det": "DETALHAMENTO DE FACHADAS",
    esquadrias: "PLANTA-BAIXA DE ESQUADRIAS", "mapa-portas": "MAPA DE PORTAS", "mapa-janelas": "MAPA DE JANELAS", escada: "ESCADA", guarda: "GUARDA-CORPO", sacada: "SACADA",
    gas: "CASA DO GÁS", lareira: "LAREIRA", churrasqueira: "CHURRASQUEIRA E FOGÃO A LENHA", forro: "FORRO DE GESSO", pontos: "PONTOS ELÉTRICOS E HIDRÁULICOS", renders: "RENDERS", checklist: "CHECK-LIST DE ENTREGA"
  };

  /* ------------------------------------------------------------ cor da obra */
  function hexOk(h) { return /^#?[0-9a-f]{6}$/i.test(txt(h).trim()); }
  function hex6(h) { var s = txt(h).trim(); return (s.charAt(0) === "#" ? s : "#" + s).toLowerCase(); }
  function lum(h) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex6(h)); if (!m) return 0; function ch(v) { var s = parseInt(v, 16) / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); } return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]); }
  function contraste(a, b) { var la = lum(a), lb = lum(b), hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); }
  /* a paleta da OBRA (cadastro): paleta.primaria / secundaria; sem ela, a cor da fachada nova da obra; sem nenhuma, a da casa. `origem` diz de onde veio. */
  function paletaDe(op) {
    var p = op && op.paleta && typeof op.paleta === "object" ? op.paleta : {}, cf = op && op.coresFachada && typeof op.coresFachada === "object" ? op.coresFachada : {}, out = { primaria: K.paletaPadrao.primaria, secundaria: K.paletaPadrao.secundaria, fundo: K.paletaPadrao.fundo, origem: "padrão da casa" };
    if (hexOk(p.primaria)) { out.primaria = hex6(p.primaria); out.origem = "obra"; }
    else if (cf.novo && hexOk(cf.novo.cor)) { out.primaria = hex6(cf.novo.cor); out.origem = "cor de fachada da obra"; }
    if (hexOk(p.secundaria)) { out.secundaria = hex6(p.secundaria); out.origem = "obra"; }
    else if (cf.existente && hexOk(cf.existente.cor) && out.origem !== "padrão da casa") out.secundaria = hex6(cf.existente.cor);
    if (hexOk(p.fundo)) out.fundo = hex6(p.fundo);
    /* o texto sobre a faixa tem de ler: branco ou grafite conforme a faixa; o acento (secundária) só vale se tiver contraste com a faixa */
    out.sobreFaixa = lum(out.primaria) < 0.4 ? "#ffffff" : "#1a1a1a";
    out.acento = contraste(out.primaria, out.secundaria) >= 3 ? out.secundaria : out.sobreFaixa;
    return out;
  }

  /* ------------------------------------------------------------ a geometria que o motor das pranchas desenha: a ÁREA DA PÁGINA DO CADERNO */
  function geometria() {
    var W = K.A3[0], H = K.A3[1], x0 = K.margem, y0 = K.cabecalho + K.folgaV, y1 = H - K.rodape - K.folgaV, xCol = W - K.margem - K.colNotas;
    return { papel: { w: W, h: H }, moldura: { x: x0, y: y0, w: W - 2 * x0, h: y1 - y0 }, area: { x: x0, y: y0, w: xCol - 4 - x0, h: y1 - y0 },
      coluna: { x: xCol, y: y0, w: K.colNotas, h: y1 - y0 }, carimbo: { x: xCol, y: y1, w: K.colNotas, h: 0 } };
  }

  /* ------------------------------------------------------------ nome do arquivo: PE_<CLIENTE>_<CONTEÚDO>_R<nn> */
  function slug(t, d) { var s = semAcento(t).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return s || d; }
  function nomeArquivo(op, conteudo) {
    var o = op || {}, rev = txt(o.revisao).trim().toUpperCase() || "R00", m = /(\d+)/.exec(rev), nn = m ? dois(+m[1]) : "00";
    return "PE_" + slug(o.proprietario || o.contratante, "CLIENTE") + "_" + slug(conteudo || "CADERNO EXECUTIVO ARQUITETURA", "CADERNO") + "_R" + nn;
  }

  /* ------------------------------------------------------------ o que o modelo tem (decide as páginas CONDICIONAIS) */
  var RE_SACADA = /sacada|varanda|balc[aã]o/i, RE_GAS = /casa (do|de) g[aá]s|central de g[aá]s|abrigo (do|de) g[aá]s|abrigo.*glp|central.*glp/i,
    RE_LAREIRA = /lareira/i, RE_CHURRAS = /churrasq|fog[aã]o (a|à) lenha|forno (a|à) lenha|fog[aã]o de lenha/i, RE_GESSO = /gesso/i;
  function pavDeY(pavs, y) { var i = 0, k; for (k = 0; k < pavs.length; k++) if (y >= num(pavs[k].cota, 0) - 0.3) i = k; return i; }
  function caixaPts(cx) {
    var cxx = num(cx.cx, 0), czz = num(cx.cz, 0), L = num(cx.comprimento, 0), E = num(cx.espessura, 0), a = num(cx.rotY, 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-L / 2, -E / 2], [L / 2, -E / 2], [L / 2, E / 2], [-L / 2, E / 2]].map(function (p) { return [cxx + p[0] * c - p[1] * s, czz + p[0] * s + p[1] * c]; });
  }
  function vivo(el, dados) { var B = FS(); if (!B || !B.statusDe) return true; var st = ""; try { st = B.statusDe(el, dados.fase, dados.lista); } catch (e) { st = ""; } return st !== "demolido" && st !== "passado" && st !== "futuro"; }
  function ambienteDe(dados, x, z, pav) {
    var G = GEO(), r = null;
    arr(dados.ambientes).forEach(function (a) { if (!r && (pav == null || a.pav === pav) && G.pontoEmPol && G.pontoEmPol([x, z], a.pts)) r = a; });
    return r;
  }
  function elementosCondicionais(modelo, dados) {
    var est = (modelo && modelo.estado) || {}, pavs = arr(dados.pavimentos), out = { escada: [], guarda: [], sacada: [], gas: [], lareira: [], churrasqueira: [], forro: [] };
    arr(est.caixas).forEach(function (cx) {
      if (!cx || !vivo(cx, dados)) return;
      if (cx.tipo === "escada" && cx.escada) {
        var par = cx.escada.par || {}, ca = cx.escada.calc || {};
        out.escada.push({ id: String(cx.id), nome: "Escada " + txt(cx.id), pav: pavDeY(pavs, num(par.base, 0)), pts: caixaPts(cx), cx: cx, par: par, calc: ca, med: cx.medidas || {} });
      } else if (cx.tipo === "guarda") {
        out.guarda.push({ id: String(cx.id), nome: "Guarda-corpo " + txt(cx.id), pav: pavDeY(pavs, num(cx.cy, 0) - num(cx.altura, 0) / 2), pts: caixaPts(cx), cx: cx, med: cx.medidas || {} });
      }
      var tx = [cx.nome, cx.marca, cx.comentarios].map(txt).join(" ");
      if (cx.tipo !== "escada" && cx.tipo !== "guarda" && tx.trim()) {
        var it = { id: String(cx.id), nome: txt(cx.nome || cx.marca || cx.comentarios).slice(0, 60), pav: pavDeY(pavs, num(cx.cy, 0)), pts: caixaPts(cx), cx: cx };
        if (RE_GAS.test(tx)) out.gas.push(it); else if (RE_CHURRAS.test(tx)) out.churrasqueira.push(it); else if (RE_LAREIRA.test(tx)) out.lareira.push(it); else if (RE_SACADA.test(tx)) out.sacada.push(it);
      }
    });
    arr(dados.moveis).forEach(function (m) {
      if (m.status === "demolido") return;
      var tx = [m.famId, m.nome].map(txt).join(" "), it = { id: m.id, nome: txt(m.nome || m.famId), pav: m.pav, pts: arr(m.pts).length >= 3 ? m.pts : [[m.x - 0.3, m.z - 0.3], [m.x + 0.3, m.z - 0.3], [m.x + 0.3, m.z + 0.3], [m.x - 0.3, m.z + 0.3]], movel: m };
      if (RE_GAS.test(tx)) out.gas.push(it); else if (RE_CHURRAS.test(tx)) out.churrasqueira.push(it); else if (RE_LAREIRA.test(tx)) out.lareira.push(it);
    });
    arr(dados.ambientes).forEach(function (a) {
      if (a.status === "demolido") return;
      var it = { id: a.id, nome: txt(a.nome), pav: a.pav, pts: a.pts, ambiente: a };
      if (RE_GAS.test(a.nome)) out.gas.push(it); else if (RE_CHURRAS.test(a.nome)) out.churrasqueira.push(it); else if (RE_LAREIRA.test(a.nome)) out.lareira.push(it); else if (RE_SACADA.test(a.nome)) out.sacada.push(it);
    });
    /* forro de gesso: forro cujo tipo diz gesso, ou ambiente cujo acabamento de forro diz gesso (o forro desenhado vem do modelo) */
    arr(dados.forros).forEach(function (f) { if (f.status !== "demolido" && RE_GESSO.test(txt(f.tipo))) out.forro.push({ id: f.id, nome: txt(f.tipo), pav: pavDeAmb(dados, f.ambienteId), pts: f.pts, forro: f }); });
    return out;
  }
  function pavDeAmb(dados, id) { var p = 0; arr(dados.ambientes).forEach(function (a) { if (a.id === id) p = a.pav; }); return p; }

  /* ------------------------------------------------------------ esquadrias: tipo de abertura vem da família (nada inventado) */
  function tipoAbertura(q) {
    var t = semAcento(txt(q.famId) + " " + txt(q.nome)).toLowerCase();
    if (/correr/.test(t)) return "Correr"; if (/giro/.test(t)) return /2f|duas/.test(t) ? "Giro (2 folhas)" : "Giro"; if (/basculante/.test(t)) return "Basculante"; if (/maxim/.test(t)) return "Maxim-ar"; if (/pivot/.test(t)) return "Pivotante";
    return "";
  }
  function inf(v) { return v ? v : { t: "informe", cor: VERMELHO }; }

  /* ------------------------------------------------------------ o desenho de uma página */
  /* um desenho novo (camadas ARQ-*) + as camadas do caderno (chamada marsala, forro de gesso) */
  function novoDesenho(E, depurar) {
    var D = DS().novo(E, depurar === false ? false : true);
    return D;
  }
  function estiloCaderno(op) {
    var E = DS().estilo(op.padrao), P = K.pena;
    E.camadas["CAD-CHAMADA"] = { mm: P.chamadaMm, dash: P.chamadaTraco, cor: P.chamada };
    E.camadas["CAD-FORRO"] = { mm: P.forroMm, dash: null, cor: P.forro };
    E.camadas["CAD-VISTA"] = { mm: P.vista, dash: null, cor: "#000" };
    return E;
  }

  /* ---- cabeçalho e rodapé (D de página inteira, conferido à parte) */
  function faixas(D, W, H, pal, ctx, titulo, pag, tot, capa) {
    D.add('<rect x="0" y="0" width="' + n(W) + '" height="' + n(K.cabecalho) + '" fill="' + pal.primaria + '" stroke="none"/>');
    D.texto(K.margem, K.cabecalho / 2, titulo, 5, { meio: true, cor: pal.sobreFaixa, peso: 0.3 });
    D.texto(W - K.margem, K.cabecalho / 2, "ARQUITETURA - CADERNO EXECUTIVO", 3, { meio: true, al: "D", cor: pal.acento, peso: 0.2 });
    D.add('<rect x="0" y="' + n(H - K.rodape) + '" width="' + n(W) + '" height="' + n(K.rodape) + '" fill="' + pal.primaria + '" stroke="none"/>');
    D.texto(K.margem, H - K.rodape / 2, ctx.empresa + " - " + ctx.obra + " - " + ctx.rev, 2.6, { meio: true, cor: pal.sobreFaixa });
    D.texto(W - K.margem, H - K.rodape / 2, "Página " + pag + " de " + tot, 2.8, { meio: true, al: "D", cor: pal.sobreFaixa, peso: 0.18 });
    if (ctx.interno) D.texto(W / 2, H - K.rodape / 2, "USO INTERNO", 2.8, { meio: true, al: "C", cor: pal.acento, peso: 0.2 });
  }
  /* QR opcional no rodapé (o mesmo desenhador do hidro, quando o app o oferece) */
  function qrRodape(D, W, H, op) {
    var H2 = HP(), I = H2 && H2._int ? H2._int : null, url = txt(op.qrUrl);
    if (!url || !I || !I.desenharQr) return;
    var q = 9; try { I.desenharQr(D, url, W / 2 + 40, H - K.rodape + (K.rodape - q) / 2, q); } catch (e) { /* sem QR */ }
  }
  function svgPagina(W, H, fonte, titulo, pal, partes, qr) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + esc(fonte) + '"' + (qr ? ' data-qr="' + esc(qr) + '"' : "") + "><title>" + esc(titulo) + "</title>" +
      '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' + partes + "</svg>";
  }

  /* ================================================================ PÁGINAS QUE SÓ O CADERNO TEM */
  /* ---- capa e índice */
  function desenharCapa(D, W, H, pal, ctx, indice, T) {
    D.add('<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="' + pal.fundo + '" stroke="none"/>');
    var wP = 150;
    D.add('<rect x="0" y="0" width="' + n(wP) + '" height="' + n(H) + '" fill="' + pal.primaria + '" stroke="none"/>');
    D.add('<polygon points="0,' + n(H * 0.7) + " " + n(wP) + "," + n(H * 0.7) + " " + n(wP) + "," + n(H * 0.7 + 18) + " 0," + n(H * 0.7 + 40) + '" fill="' + pal.acento + '" stroke="none"/>');
    var x0 = K.margem + 4, tx = pal.sobreFaixa;
    D.texto(x0, 30, ctx.empresa, 4.6, { cor: pal.acento, peso: 0.2 });
    D.texto(x0, 78, "CADERNO EXECUTIVO", 12, { cor: tx, peso: 0.5 });
    D.texto(x0, 94, "DE ARQUITETURA", 12, { cor: tx, peso: 0.5 });
    D.texto(x0, 112, "Projeto executivo - uma página por assunto", 3.6, { cor: pal.acento, peso: 0.15 });
    var y = H * 0.7 + 52;
    function campo(rot, val, cor) { D.texto(x0, y, rot, 2.4, { cor: pal.acento }); D.texto(x0, y + 5.2, val || "informe", 3.8, { cor: val ? tx : "#ff9a9a", peso: 0.15 }); y += 13; }
    y = H * 0.7 + 50;
    campo("OBRA", ctx.obra && ctx.obra !== "Obra" ? ctx.obra : "", tx);
    campo("PROPRIETÁRIO", ctx.proprietario, tx);
    campo("REVISÃO / DATA", ctx.rev + " - " + ctx.data, tx);
    /* índice */
    var xi = wP + 14, yi = K.margem + 8, wi = W - xi - K.margem;
    D.texto(xi, yi + 5, "ÍNDICE", 7, { cor: pal.primaria, peso: 0.4 });
    D.add('<line x1="' + n(xi) + '" y1="' + n(yi + 9) + '" x2="' + n(xi + wi) + '" y2="' + n(yi + 9) + '" stroke="' + pal.primaria + '" stroke-width="0.35"/>');
    var nCol = Math.max(1, Math.ceil(indice.length / K.linhasIndiceMax)), wCol = (wi - (nCol - 1) * 8) / nCol, passo = Math.min(8.6, (H - yi - 30 - K.margem) / Math.min(K.linhasIndiceMax, indice.length || 1)), yL = yi + 20;
    indice.forEach(function (it, i) {
      var col = Math.floor(i / K.linhasIndiceMax), lin = i % K.linhasIndiceMax, xx = xi + col * (wCol + 8), yy = yL + lin * passo;
      D.texto(xx, yy, dois(it.pagina), 3.4, { cor: pal.primaria, peso: 0.3 });
      D.texto(xx + 9, yy, it.titulo, 3.1, { cor: "#1a1a1a" });
      D.add('<line x1="' + n(xx) + '" y1="' + n(yy + 2) + '" x2="' + n(xx + wCol) + '" y2="' + n(yy + 2) + '" stroke="#cfcfcf" stroke-width="0.12"/>');
    });
    var yE = H - K.margem - 14;
    D.texto(xi, yE, "Responsável técnico: " + (ctx.responsavel ? ctx.responsavel + (ctx.registro ? " - " + ctx.registro : "") : "informe"), 3, { cor: ctx.responsavel ? "#1a1a1a" : VERMELHO });
    if (ctx.local) D.texto(xi, yE + 6, ctx.local, 2.8, { cor: "#444" });
    void T;
  }

  /* ---- mapas de portas e janelas: uma linha por SIGLA (tipo = família + tipo + tamanho) */
  var COLS_MAPA = [["SIGLA", 15], ["QTD", 12], ["L x A (cm)", 26], ["PEITORIL", 18], ["TIPO DE ABERTURA", 34], ["MATERIAL", 30], ["SÍMBOLO EM PLANTA", 40], ["VISTA FRONTAL (1:50)", 48], ["ACAB. INT.", 40], ["ACAB. EXT.", 40]];
  function colsMapa(ehJanela, W) {
    var L = COLS_MAPA.filter(function (c) { return ehJanela || c[0] !== "PEITORIL"; }), tot = 0; L.forEach(function (c) { tot += c[1]; });
    var x = 0; return L.map(function (c) { var w = c[1] / tot * W, o = { t: c[0], x: x, w: w }; x += w; return o; });
  }
  function alturaLinhaMapa(q) { var k = 1000 / K.escalaMapa; return Math.max(26, (num(q.peitoril, 0) + num(q.altura, 1)) * k + 18); }
  function paginarMapa(lista, hDisp) {
    var pgs = [], cur = [], h = 0;
    lista.forEach(function (q) { var hl = alturaLinhaMapa(q); if (cur.length && h + hl > hDisp) { pgs.push(cur); cur = []; h = 0; } cur.push(q); h += hl; });
    if (cur.length) pgs.push(cur);
    return pgs;
  }
  function paredeDoVao(dados, q) {
    var v = null; arr(dados.vaos).forEach(function (x) { if (!v && arr(q.ids).indexOf(x.id) >= 0) v = x; });
    var w = null; arr(dados.paredes).forEach(function (p) { if (v && !w && p.id === v.parede) w = p; });
    return w;
  }
  function simboloPlanta(D, q, cx, y0, wParede, k) {
    var L = num(q.largura, 0.8) * k, t = Math.max(2.4, wParede * k), xa = cx - L / 2 - 9, xb = cx + L / 2, pocheCor = K.pena.paredeHachuraEsq;
    function bloco(x, w) { D.fundo(x, y0, w, t, pocheCor); D.ret(x, y0, w, t, "ARQ-PAREDE"); }
    bloco(xa, 9); bloco(xb, 9);
    if (q.tipo === "porta") {
      var corre = /correr/i.test(txt(q.famId) + " " + txt(q.nome));
      if (corre) { D.ret(cx - L / 2, y0 + 0.2, L * 0.55, 0.9, "ARQ-BATENTE"); D.ret(cx - L * 0.05, y0 + t - 1.1, L * 0.55, 0.9, "ARQ-BATENTE"); }
      else {
        D.ret(cx - L / 2, y0 + t, 0.9, L, "ARQ-BATENTE");   /* a folha aberta a 90° */
        var d = D.estilo("ARQ-ARCO");
        D.add('<path d="M ' + n(cx - L / 2 + 0.45) + "," + n(y0 + t + L) + " A " + n(L) + " " + n(L) + " 0 0 0 " + n(cx + L / 2) + "," + n(y0 + t) + '" fill="none"' + d + "/>");
      }
    } else {
      D.linha(cx - L / 2, y0, cx + L / 2, y0, "ARQ-VAO"); D.linha(cx - L / 2, y0 + t, cx + L / 2, y0 + t, "ARQ-VAO");
      D.linha(cx - L / 2, y0 + t / 2, cx + L / 2, y0 + t / 2, "ARQ-FINA");
      if (/correr/i.test(txt(q.famId) + " " + txt(q.nome))) D.linha(cx, y0, cx, y0 + t, "ARQ-FINA");
    }
  }
  function elevacao(D, q, cx, yb, k) {
    var AD = DS(), L = num(q.largura, 0.8) * k, pe = num(q.peitoril, 0), A = num(q.altura, 2.1) * k, x0 = cx - L / 2, yv0 = yb - pe * k, yt = yv0 - A, corre = /correr/i.test(txt(q.famId) + " " + txt(q.nome));
    D.linha(x0 - 6, yb, x0 + L + 6, yb, "ARQ-TERRENO");
    D.ret(x0, yt, L, A, "ARQ-VAO"); D.ret(x0 + 0.8, yt + 0.8, L - 1.6, A - 1.6, "ARQ-FINA");
    if (corre) {
      D.linha(x0 + L / 2, yt + 0.8, x0 + L / 2, yv0 - 0.8, "ARQ-FINA");
      var ym = (yt + yv0) / 2; D.linha(x0 + 3, ym, x0 + L / 2 - 3, ym, "ARQ-FINA"); D.cheio([[x0 + L / 2 - 3, ym], [x0 + L / 2 - 5, ym - 0.8], [x0 + L / 2 - 5, ym + 0.8]], "#000");
      D.linha(x0 + L / 2 + 3, ym, x0 + L - 3, ym, "ARQ-FINA"); D.cheio([[x0 + L / 2 + 3, ym], [x0 + L / 2 + 5, ym - 0.8], [x0 + L / 2 + 5, ym + 0.8]], "#000");
    } else if (/giro|basculante|maxim/i.test(txt(q.famId) + " " + txt(q.nome))) {   /* o triângulo da abertura: o vértice é a dobradiça */
      D.linha(x0 + 0.8, yt + 0.8, x0 + L - 0.8, (yt + yv0) / 2, "ARQ-OCULTA"); D.linha(x0 + 0.8, yv0 - 0.8, x0 + L - 0.8, (yt + yv0) / 2, "ARQ-OCULTA");
    }
    D.cota(x0, yb + 4.5, x0 + L, yb + 4.5, 0, AD.cotaTxt(+q.largura), { desde: [false, false], semExt: true });
    var xv = x0 - 6, pv = pe > 0.005 ? [[xv, yb], [xv, yv0], [xv, yt]] : [[xv, yb], [xv, yt]], vv = pe > 0.005 ? [AD.cotaTxt(pe), AD.cotaTxt(+q.altura)] : [AD.cotaTxt(+q.altura)];
    D.cadeia(pv, 0, vv, { offs: [4.5], desde: pv.map(function () { return false; }), semExt: true });
  }
  function desenharMapa(c, D, ehJanela, lista, parte, partes) {
    var A = c.A, d = DS(), T = D.E.T, hT = d.titulo(D, A.x + 4, A.y + 2, (ehJanela ? "MAPA DE JANELAS" : "MAPA DE PORTAS") + (partes > 1 ? " (" + parte + "/" + partes + ")" : ""), "ESC 1:" + K.escalaMapa, 1);
    var x0 = A.x + 2, w = A.w - 4, cols = colsMapa(ehJanela, w), y = A.y + 2 + hT + 6, k = 1000 / K.escalaMapa, hCab = 9, yTab0 = y;
    cols.forEach(function (cl) { D.fundo(x0 + cl.x, y, cl.w, hCab, "#ececec"); D.texto(x0 + cl.x + cl.w / 2, y + hCab / 2, cl.t, T.tabelaCab * 0.8, { al: "C", meio: true }); });
    D.ret(x0, y, w, hCab, "ARQ-TABELA"); y += hCab;
    var tot = 0;
    lista.forEach(function (q) {
      var hl = alturaLinhaMapa(q), par = paredeDoVao(c.dados, q), tp = tipoAbertura(q), cel = {};
      cols.forEach(function (cl) { cel[cl.t] = cl; });
      function ctr(nome) { var cl = cel[nome]; return x0 + cl.x + cl.w / 2; }
      function celTxt(nome, v, cor) { if (!cel[nome]) return; D.texto(ctr(nome), y + hl / 2, v, T.tabela, { al: "C", meio: true, cor: cor }); }
      celTxt("SIGLA", q.cod); celTxt("QTD", String((q.qtd.novo || 0) + (q.qtd.existente || 0)));
      celTxt("L x A (cm)", Math.round(q.largura * 100) + " x " + Math.round(q.altura * 100), q.dimPadrao ? VERMELHO : null);
      if (cel["PEITORIL"]) celTxt("PEITORIL", String(Math.round(q.peitoril * 100)));
      celTxt("TIPO DE ABERTURA", tp || "informe", tp ? null : VERMELHO);
      celTxt("MATERIAL", txt(q.material) || "informe", txt(q.material) ? null : VERMELHO);
      celTxt("ACAB. INT.", "informe", VERMELHO); celTxt("ACAB. EXT.", "informe", VERMELHO);
      var yb = y + hl - 11 - 0; simboloPlanta(D, q, ctr("SÍMBOLO EM PLANTA"), y + 6, par ? par.espessura : 0.15, k);
      elevacao(D, q, ctr("VISTA FRONTAL (1:50)"), yb, k);
      if (q.dimPadrao) D.texto(x0 + cel["L x A (cm)"].x + cel["L x A (cm)"].w / 2, y + hl / 2 + 4.6, "conferir medida", T.tabela * 0.8, { al: "C", cor: VERMELHO });
      D.linha(x0, y + hl, x0 + w, y + hl, "ARQ-TABELA"); y += hl; tot++;
    });
    cols.forEach(function (cl, i) { D.linha(x0 + cl.x, yTab0, x0 + cl.x, y, "ARQ-TABELA"); void i; });
    D.linha(x0 + w, yTab0, x0 + w, y, "ARQ-TABELA");
    return { escala: "1:" + K.escalaMapa, y: y, linhas: tot };
  }

  /* ---- quadro de áreas da página 2 (tudo calculado do modelo; faltou = "informe") */
  function quadrosAreas(c, D, x, y, w) {
    var Qd = QD(), d = c.dados, idx = c.idx, T = D.E.T, pavs = arr(d.pavimentos), yy = y;
    function c2(v) { return br(v, 2); }
    /* 1) áreas úteis por ambiente (a soma é a do quadro) */
    var ambs = arr(c.depois.ambientes).filter(function (a) { return a.status !== "demolido"; }), soma = 0, L = [];
    ambs.forEach(function (a) { soma += num(a.area, 0); L.push([txt(a.numero), txt(a.nome).toUpperCase(), pavs.length > 1 ? txt((pavs[a.pav] || {}).nome).toUpperCase() : "", c2(a.area)]); });
    if (!L.length) L.push([{ t: "sem ambiente no modelo", cor: VERMELHO }, "", "", ""]);
    else L.push({ total: ["", { t: "ÁREA ÚTIL TOTAL (SOMA)", cor: null }, "", c2(soma)] });
    var t1 = Qd.tabela(D, x, yy, w, "ÁREAS DOS AMBIENTES (m²)", [{ t: "Nº", f: 0.8 }, { t: "AMBIENTE", f: 3.4, al: "E" }, { t: "PAVIMENTO", f: 2, al: "E" }, { t: ["ÁREA", "(m²)"], f: 1.3, al: "D" }], L);
    yy += t1.h + 6;
    /* 2) áreas construídas por pavimento (laje) */
    var L2 = arr(idx.porPavimento).map(function (p) { return [txt(p.nome).toUpperCase(), c2(p.existente), c2(p.demolir), c2(p.construir), c2(p.total)]; });
    if (!L2.length) L2 = [[{ t: "sem pavimento no modelo", cor: VERMELHO }, "", "", "", ""]];
    else L2.push({ total: [{ t: "TOTAL CONSTRUÍDO", cor: null }, c2(idx.areas.existente), c2(idx.areas.demolir), c2(idx.areas.construir), c2(idx.areas.total)] });
    var t2 = Qd.tabela(D, x, yy, w, "ÁREA CONSTRUÍDA POR PAVIMENTO (m²)", [{ t: "PAVIMENTO", f: 2.4, al: "E" }, { t: ["EXIST.", "MANTER"], f: 1.2, al: "D" }, { t: ["A", "DEMOLIR"], f: 1.2, al: "D" }, { t: ["A", "CONSTR."], f: 1.2, al: "D" }, { t: "TOTAL", f: 1.2, al: "D" }], L2);
    yy += t2.h + 6;
    /* 3) lote e índices */
    var terr = idx.terreno || {}, oc = idx.ocupacaoPct, ia = idx.aproveitamento;
    var L3 = [["ÁREA DO LOTE", terr.area != null ? c2(terr.area) : { t: "informe", cor: VERMELHO }], ["ÁREA CONSTRUÍDA TOTAL", c2(idx.areas.total)], ["PROJEÇÃO DA EDIFICAÇÃO", c2(idx.projecao.depois)],
      ["TAXA DE OCUPAÇÃO (%)", oc != null ? br(oc, 1) : { t: "informe", cor: VERMELHO }], ["ÍNDICE DE APROVEITAMENTO", ia != null ? br(ia, 2) : { t: "informe", cor: VERMELHO }],
      ["ÁREA PERMEÁVEL (m²)", c2(idx.permeavel && idx.permeavel.area)], ["TAXA DE PERMEABILIDADE (%)", idx.permeavelPct != null ? br(idx.permeavelPct, 1) : { t: "informe", cor: VERMELHO }]];
    var t3 = Qd.tabela(D, x, yy, w, "LOTE E ÍNDICES", [{ t: "DISCRIMINAÇÃO", f: 4.2, al: "E" }, { t: "VALOR", f: 1.4, al: "D" }], L3);
    yy += t3.h + 4;
    var Cm = idx.limites;
    if (!(Cm && (Cm.ocupacaoMax != null || Cm.permeavelMin != null || Cm.aproveitamentoMax != null))) { D.texto(x, yy + T.nota * 0.8, "Limites do município: informe (taxa de ocupação, permeabilidade, aproveitamento).", T.nota * 0.9, { cor: VERMELHO }); yy += T.nota * 1.6 + 3; }
    else if (Cm.conferir) { D.texto(x, yy + T.nota * 0.8, "Limites de EXEMPLO: CONFERIR NA LEI e no zoneamento do lote.", T.nota * 0.9, { cor: VERMELHO }); yy += T.nota * 1.6 + 3; }
    c._quadro = { soma: Math.round(soma * 1000) / 1000, ambientes: ambs.map(function (a) { return { id: a.id, nome: a.nome, area: a.area }; }), total: idx.areas.total, ocupacaoPct: idx.ocupacaoPct, aproveitamento: idx.aproveitamento };
    return { soma: soma, y: yy, ambientes: ambs.length };
  }

  /* ---- check-list de entrega (uso interno) */
  function itensChecklist(c, st) {
    var d = c.dados, idx = c.idx, op = st.op, esq = arr(d.esquadrias), L = [];
    function it(grupo, rotulo, okk, obs) { L.push({ grupo: grupo, rotulo: rotulo, ok: !!okk, obs: obs || "" }); }
    var tem = function (id) { return st.ids[id] ? true : false; };
    it("1 Capa e índice", "Capa com obra, proprietário, revisão e data", !!(op.obra && op.proprietario), !(op.obra && op.proprietario) ? "informe obra e proprietário no cadastro" : "");
    it("1 Capa e índice", "Responsável técnico e registro no carimbo", !!(op.responsavel && op.registro), !(op.responsavel && op.registro) ? "informe RT e CREA no cadastro da empresa" : "");
    it("2 Situação", "Lote (divisa) do modelo e norte", !!(d.terreno && d.terreno.divisa) && idx.terreno && idx.terreno.contorno, "");
    it("2 Situação", "Nome da rua", !!txt(op.rua).trim(), "informe a rua");
    it("2 Quadro de áreas", "Ambientes do modelo (soma de áreas)", arr(c.depois.ambientes).length > 0, "");
    it("2 Quadro de áreas", "Limites do município (ocupação, permeabilidade, aproveitamento)", !!(idx.limites && (idx.limites.ocupacaoMax != null || idx.limites.permeavelMin != null || idx.limites.aproveitamentoMax != null)) && !(idx.limites && idx.limites.conferir), "informe os limites da lei do lote");
    it("3 Planta-baixa", "Planta de cada pavimento", tem("planta"), "");
    it("3 Planta-baixa", "Mobiliário na planta", arr(d.moveis).length > 0, "o modelo não tem móveis");
    it("4 Cortes", "Cortes AA e BB", tem("cortes"), "");
    it("4 Cortes", "Terreno do modelo (talude)", arr(d.terreno && d.terreno.topos).length > 0, "sem topossólido: terreno plano");
    it("5 Fachadas", "Fachadas", tem("fachadas"), "");
    it("6 Detalhamento de fachadas", "Tintas e revestimentos informados", !!(op.coresFachada && (op.coresFachada.novo || op.coresFachada.existente || op.coresFachada.muro)), "informe as cores da fachada");
    it("7 Esquadrias", "Planta de esquadrias", tem("esquadrias"), "");
    it("8 Mapas", "Material de todas as esquadrias", esq.length > 0 && esq.every(function (q) { return !!q.material; }), "material não informado em " + esq.filter(function (q) { return !q.material; }).length + " sigla(s)");
    it("8 Mapas", "Dimensões das esquadrias avaliadas (não padrão)", esq.length > 0 && esq.every(function (q) { return !q.dimPadrao; }), "conferir medida em " + esq.filter(function (q) { return q.dimPadrao; }).length + " sigla(s)");
    it("8 Mapas", "Acabamento interno e externo das esquadrias", false, "o modelo não traz: informe");
    [["escada", "Escada"], ["guarda", "Guarda-corpo"], ["sacada", "Sacada"], ["gas", "Casa do gás"], ["lareira", "Lareira"], ["churrasqueira", "Churrasqueira / fogão a lenha"], ["forro", "Forro de gesso"]].forEach(function (p) {
      if (st.cond[p[0]] && st.cond[p[0]].length) it("10 Detalhamentos condicionais", p[1] + " (no modelo)", tem(p[0]), "");
    });
    it("11 Pontos", "Pontos elétricos e hidráulicos do modelo", tem("pontos"), "o modelo não traz pontos: a página não sai");
    it("12 Renders", "Fotos do 3D", tem("renders"), "3D fechado: abra o modelo para gerar as imagens");
    it("Conferência", "Nenhum texto sobreposto em nenhuma página", st.verificacaoTotal === 0, st.verificacaoTotal + " ocorrência(s)");
    return L;
  }
  function desenharChecklist(c, D, itens) {
    var A = c.A, d = DS(), T = D.E.T, hT = d.titulo(D, A.x + 4, A.y + 2, "CHECK-LIST DE ENTREGA - USO INTERNO", "SEM ESCALA", 1), x = A.x + 4, y = A.y + 2 + hT + 6, passo = Math.min(5.6, (A.h - hT - 14) / Math.max(1, itens.length + 3)), wTxt = A.w - 80;
    var feitos = itens.filter(function (i) { return i.ok; }).length;
    D.texto(x, y, feitos + " de " + itens.length + " itens conferidos pelo modelo. Marca automática: onde o modelo comprova; o resto é pendência.", T.tabela, {}); y += passo * 1.4;
    var gAnt = "";
    itens.forEach(function (i) {
      if (i.grupo !== gAnt) { D.texto(x, y, i.grupo.toUpperCase(), T.tabelaCab, { peso: 0.25 }); gAnt = i.grupo; y += passo; }
      D.ret(x + 2, y - 3, 3.4, 3.4, "ARQ-TABELA");
      if (i.ok) { D.linha(x + 2.5, y - 1.3, x + 3.5, y - 0.2, "ARQ-FINA"); D.linha(x + 3.5, y - 0.2, x + 5.1, y - 2.8, "ARQ-FINA"); }
      D.texto(x + 8, y, i.rotulo, T.tabela, { cor: i.ok ? null : "#000" });
      if (!i.ok && i.obs) D.texto(x + 8 + wTxt * 0.55, y, "PENDENTE: " + i.obs, T.tabela * 0.9, { cor: VERMELHO });
      y += passo;
    });
    return { escala: "SEM ESCALA", feitos: feitos, total: itens.length };
  }

  /* ================================================================ O GERADOR */
  var QDTS = { notaRegistro: [
    "Registros de água: dentro do box nos banheiros.",
    "Lavabos: o registro fica na parede contrária à da bacia e à da cuba.",
    "Cozinha e gourmet: o registro fica a 2,10 m de altura, sobre a geladeira."] };

  function gerar(modelo, opcoes) {
    var op = opcoes || {}, AQm = AQ();
    if (!AQm || !AQm._cad) return { ok: false, paginas: [], avisos: ["js/arqpranchas.js não carregou: o caderno executivo precisa dos desenhos das pranchas."] };
    if (!DS() || !AP() || !PL() || !CT() || !QD()) return { ok: false, paginas: [], avisos: ["Os motores de desenho de arquitetura não carregaram (js/arq*.js)."] };
    var geo = geometria(), pal = paletaDe(op), completa = op.versao !== "cliente" && op.completa !== false;
    var r = AQm._cad(modelo, op, geo, function (c, F) { return montar(modelo, op, geo, pal, completa, c, F); });
    if (!r || r.ok === false) return { ok: false, paginas: [], avisos: arr(r && r.avisos) };
    return r;
  }

  function montar(modelo, op, geo, pal, completa, c, F) {
    var E = estiloCaderno(op), d = c.dados, avisos = c.avisos, A = geo.area, W = geo.papel.w, H = geo.papel.h, janela = [A.x - 1, A.y - 1, A.x + A.w + 1, A.y + A.h + 1];
    c.E = E; c.emBlocos = true;   /* o quadro de esquadrias tem páginas próprias (mapas) */
    var fonte = ES() ? ES().FONTE.css : "Verdana, Arial, sans-serif";
    var emp = op.empresa, empNome = emp && typeof emp === "object" ? txt(emp.nome) : txt(emp);
    var ctx = { empresa: empNome || "RA ENGENHARIA ESPECIAL LTDA", obra: txt(op.obra) || "Obra", proprietario: txt(op.proprietario), local: txt(op.local), rev: txt(c.cfg.revisao) || "R00", data: txt(op.data).trim() || hoje(), responsavel: txt(op.responsavel), registro: txt(op.registro), interno: completa };
    var pavs = arr(d.pavimentos), cond = elementosCondicionais(modelo, d), st = { op: op, ids: {}, cond: cond, verificacaoTotal: 0 };
    var plano = [];   /* as páginas planejadas: { id, tipo, titulo, pav, … } */
    function planejar(o) { plano.push(o); return o; }

    /* ---- 1) o PLANO das páginas (o índice e os números dependem dele, por isso vem antes do desenho) */
    planejar({ id: "capa", tipo: "capa", titulo: "CAPA E ÍNDICE" });
    planejar({ id: "situacao", tipo: "situacao", titulo: "SITUAÇÃO E LOCALIZAÇÃO - QUADRO DE ÁREAS" });
    pavs.forEach(function (pv, i) { planejar({ id: "planta-" + i, tipo: "planta", pav: i, titulo: "PLANTA-BAIXA" + (pavs.length > 1 ? " - " + txt(pv.nome).toUpperCase() : "") }); });
    arr(c.cortes).forEach(function (ct, i) { planejar({ id: "cortes-" + i, tipo: "cortes", ct: ct, titulo: "CORTE " + ct.letra + ct.letra }); });   /* um corte por página: ganha escala */
    planejar({ id: "fachadas", tipo: "fachadas", titulo: "FACHADAS" });
    planejar({ id: "fachadas-det", tipo: "fachadas-det", titulo: "DETALHAMENTO DE FACHADAS" });
    var esq = arr(d.esquadrias), portas = esq.filter(function (q) { return q.tipo === "porta"; }), janelas = esq.filter(function (q) { return q.tipo === "janela"; });
    if (esq.length) pavs.forEach(function (pv, i) { planejar({ id: "esquadrias-" + i, tipo: "esquadrias", pav: i, titulo: "PLANTA-BAIXA DE ESQUADRIAS" + (pavs.length > 1 ? " - " + txt(pv.nome).toUpperCase() : "") }); });
    var hMapa = A.h - 40;
    [["mapa-portas", "MAPA DE PORTAS", portas, false], ["mapa-janelas", "MAPA DE JANELAS", janelas, true]].forEach(function (m) {
      if (!m[2].length) return;
      var pgs = paginarMapa(m[2], hMapa);
      pgs.forEach(function (lst, i) { planejar({ id: m[0] + "-" + i, tipo: m[0], titulo: m[1] + (pgs.length > 1 ? " (" + (i + 1) + "/" + pgs.length + ")" : ""), lista: lst, parte: i + 1, partes: pgs.length, ehJanela: m[3] }); });
    });
    /* condicionais: só com o elemento */
    cond.escada.forEach(function (e, i) { planejar({ id: "escada-" + i, tipo: "escada", titulo: "ESCADA" + (cond.escada.length > 1 ? " " + (i + 1) : ""), el: e }); });
    if (cond.guarda.length) planejar({ id: "guarda", tipo: "guarda", titulo: "GUARDA-CORPO", els: cond.guarda });
    /* sacada, casa do gás, lareira, churrasqueira: UMA PÁGINA POR ELEMENTO (planta e corte do próprio elemento, js/arqdetalhes.js). O elemento que o modelo traz como família ou caixa
       vale mais que o ambiente que só tem o nome na lista (o "Gourmet com churrasqueira" é a sala inteira): com os dois, só o primeiro vira página. */
    [["sacada", "SACADA"], ["gas", "CASA DO GÁS"], ["lareira", "LAREIRA"], ["churrasqueira", "CHURRASQUEIRA E FOGÃO A LENHA"]].forEach(function (p) {
      var todos = cond[p[0]], fortes = todos.filter(function (e) { return e.movel || e.cx; }), lista = fortes.length ? fortes : todos;
      lista.forEach(function (e, i) { planejar({ id: p[0] + (lista.length > 1 ? "-" + i : ""), tipo: p[0], titulo: p[1] + (lista.length > 1 ? " " + (i + 1) : ""), els: [e], det: true }); });
    });
    var pavsForro = {}; cond.forro.forEach(function (f) { pavsForro[f.pav] = 1; });
    Object.keys(pavsForro).sort().forEach(function (k) { var i = +k; planejar({ id: "forro-" + i, tipo: "forro", pav: i, titulo: "FORRO DE GESSO" + (pavs.length > 1 ? " - " + txt((pavs[i] || {}).nome).toUpperCase() : "") }); });
    var pontos = pontosDoModelo(modelo, d, pavs);
    pavs.forEach(function (pv, i) { if (pontos.filter(function (p) { return p.pav === i; }).length) planejar({ id: "pontos-" + i, tipo: "pontos", pav: i, titulo: "PONTOS ELÉTRICOS E HIDRÁULICOS" + (pavs.length > 1 ? " - " + txt(pv.nome).toUpperCase() : "") }); });
    if (F.temFoto) planejar({ id: "renders", tipo: "renders", titulo: "RENDERS" });
    else avisos.push("Página RENDERS: não gerada — " + F.MOTIVO_SEM_FOTO);
    if (completa) planejar({ id: "checklist", tipo: "checklist", titulo: "CHECK-LIST DE ENTREGA (USO INTERNO)" });

    /* os números de página, e os "(folha CAD-nn)" que as notas das pranchas citam */
    plano.forEach(function (p, i) { p.pagina = i + 1; p.numero = "CAD-" + dois(i + 1); });
    plano.forEach(function (p) { if (!F.numMap[p.tipo === "planta" ? "layout" : p.tipo]) F.numMap[p.tipo === "planta" ? "layout" : p.tipo] = p.numero; });
    F.numMap.quadros = F.numMap["mapa-portas"] || F.numMap["mapa-janelas"] || F.numMap.esquadrias || "(não gerada)";
    c.total = plano.length;

    /* ---- 2) o desenho de cada página */
    var feitas = [], H0 = AP();
    function novaD() { return DS().novo(E, true); }
    /* desenha a página; se a conferência achar sobreposição, refaz com a área encolhida (o desenho escolhe uma escala menor)(largura ×1,05 e ×1,1 antes: o desenho ganha uma escala maior; depois 88 %, 76 %, 64 %) — fica a melhor */
    function paginaDesenho(p, desenhar, tipoNotas, fatores) {
      var def = { id: p.id, tipo: tipoNotas || p.tipo, sub: p.tipo, pav: p.pav, titulo: p.titulo, numero: p.numero }, melhor = null, fat = fatores || [[1, 1], [1.05, 1], [1.1, 1], [0.88, 0.88], [0.76, 0.76], [0.64, 0.64]], ia;
      for (ia = 0; ia < fat.length; ia++) {
        var D = novaD(), res = {}, nAv = avisos.length;
        c.A = { x: A.x, y: A.y, w: A.w * fat[ia][0], h: A.h * fat[ia][1] }; c.D = D; c.def = def; c.avisos = avisos;
        try { res = desenhar(D, def, ia) || {}; }
        catch (e) { avisos.push("Página " + p.numero + " (" + p.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(A.x + 10, A.y + 20, "ERRO AO DESENHAR ESTA PÁGINA - ver avisos", D.E.T.titulo, { cor: VERMELHO }); }
        c.A = A;
        var conf = DS().conferir(D, [janela[0], janela[1], A.x + A.w * fat[ia][0] + 1, janela[3]]), novos = avisos.splice(nAv);
        if (!melhor || conf.total < melhor.conf.total) melhor = { D: D, res: res, conf: conf, avisos: novos, fat: fat[ia][0] };
        if (op.depurarTentativas) avisos.push("tent " + p.id + " " + fat[ia][0] + " " + res.escala + " " + conf.total + " " + JSON.stringify((conf.detalhe || []).map(function (q) { return [q.t, q.cam]; })) + JSON.stringify(conf.textoTexto));
        if (conf.total === 0) break;
      }
      melhor.avisos.forEach(function (a0) { avisos.push(a0); });
      var D2 = melhor.D, res2 = melhor.res, conf2 = melhor.conf;
      c.avisosFolha[def.id] = melhor.avisos.map(function (a0) { return a0.replace(/ARQ-\d\d/g, p.numero); });
      var Fr = DS().novo(E, false), coube = true;
      try { coube = DS().colunaNotas(Fr, geo, F.blocosNotas(c, def)); } catch (e2) { coube = true; avisos.push("Página " + p.numero + ": notas: " + (e2 && e2.message ? e2.message : String(e2))); }
      if (!coube) avisos.push("Página " + p.numero + " (" + p.titulo + "): as notas não cabem na coluna com a letra mínima do padrão: conferir.");
      st.ids[p.tipo] = (st.ids[p.tipo] || 0) + 1;
      feitas.push({ p: p, D: D2, Fr: Fr, conf: conf2, escala: txt(res2.escala) || "INDICADA", res: res2 });
    }
    plano.forEach(function (p) {
      if (p.tipo === "capa" || p.tipo === "checklist") return;
      var escSit0 = c.escalaSit;
      if (p.tipo === "situacao") paginaDesenho(p, function (D, def, tent) {
        var cand = [escSit0, 150, 175, 200, 225, 250, 300, 350, 400, 500].filter(function (e0, i0) { return i0 === 0 || e0 > escSit0; }); c.escalaSit = cand[Math.min(tent || 0, cand.length - 1)];
        var Pl = PL(), Ac = c.A, res = Pl.situacao(c), wQ = Math.min(176, Math.max(140, Ac.w * 0.34));
        quadrosAreas(c, D, Ac.x + Ac.w - wQ - 2, Ac.y + 14, wQ - 2);
        void def; return res;
      }, "situacao", [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]);
      else if (p.tipo === "planta") paginaDesenho(p, function (D, def) { return F.desenharDef({ id: def.id, tipo: "layout", pav: p.pav, titulo: p.titulo, numero: p.numero }); }, "layout");
      else if (p.tipo === "cortes") paginaDesenho(p, function () { var todos = c.cortes; c.cortes = [p.ct]; try { return CT().cortes(c); } finally { c.cortes = todos; } });
      else if (p.tipo === "fachadas") paginaDesenho(p, function () { return CT().fachadas(c); });
      else if (p.tipo === "fachadas-det") paginaDesenho(p, function (D) { return desenharFachadasDet(c, D, op); }, "fachadas");
      else if (p.tipo === "esquadrias") paginaDesenho(p, function (D) { return desenharEsquadrias(c, D, p); }, "layout");
      else if (p.tipo === "mapa-portas" || p.tipo === "mapa-janelas") paginaDesenho(p, function (D) { return desenharMapa(c, D, p.ehJanela, p.lista, p.parte, p.partes); }, "mapa");
      else if (p.tipo === "forro") paginaDesenho(p, function (D, def) { return F.desenharDef({ id: def.id, tipo: "forro", pav: p.pav, titulo: p.titulo, numero: p.numero }); }, "forro");
      else if (p.tipo === "pontos") paginaDesenho(p, function (D) { return desenharPontos(c, D, p, pontos); }, "pontos");
      else if (p.tipo === "renders") paginaDesenho(p, function (D) { return desenharRenders(c, D, F); }, "renders");
      else paginaDesenho(p, function (D) { return desenharCondicional(c, D, p, cond, modelo); }, "cond");
    });
    /* páginas que falharam por inteiro (ex.: renders sem foto) saem do plano */
    var feitasPorId = {}; feitas.forEach(function (f) { feitasPorId[f.p.id] = f; });

    /* ---- 3) capa, check-list, cabeçalhos e rodapés */
    var final = plano.filter(function (p) { return p.tipo === "capa" || p.tipo === "checklist" || feitasPorId[p.id]; });
    final.forEach(function (p, i) { p.pagina = i + 1; p.numero = "CAD-" + dois(i + 1); });
    var tot = final.length, verificacao = { total: 0, textoTexto: 0, textoLinha: 0, foraJanela: 0, porPagina: [] };
    feitas.forEach(function (f) { verificacao.total += f.conf.total; });
    st.verificacaoTotal = verificacao.total;
    var indice = final.map(function (p) { return { pagina: p.pagina, numero: p.numero, titulo: p.titulo, tipo: p.tipo }; });
    var paginas = final.map(function (p) {
      var Hd = DS().novo(E, true), corpo = "", escalaTxt = "SEM ESCALA", conf = null, extra = "";
      if (p.tipo === "capa") {
        var Dc = DS().novo(E, true); desenharCapa(Dc, W, H, pal, ctx, indice, Dc.E.T); corpo = '<g data-corpo="1">' + Dc.svg() + "</g>"; conf = DS().conferir(Dc, [0, 0, W, H]);
        return montarPagina(p, corpo, conf, null);
      }
      if (p.tipo === "checklist") {
        var Dk = DS().novo(E, true), itens = itensChecklist(c, st), rk = desenharChecklist(c, Dk, itens);
        faixas(Hd, W, H, pal, ctx, p.titulo, p.pagina, tot, false);
        conf = DS().conferir(Dk, janela); verificacao.total += conf.total; escalaTxt = rk.escala;
        corpo = '<g data-corpo="1">' + Dk.svg() + "</g>" + '<g data-cabecalho="1">' + Hd.svg() + "</g>";
        var cf2 = DS().conferir(Hd, [0, 0, W, H]); verificacao.total += cf2.total;
        verificacao.porPagina.push({ numero: p.numero, titulo: p.titulo, textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela, cabecalho: cf2.total, checklist: { feitos: rk.feitos, total: rk.total, itens: itens } });
        return finalPag(p, corpo, escalaTxt);
      }
      var f = feitasPorId[p.id];
      faixas(Hd, W, H, pal, ctx, p.titulo, p.pagina, tot, false);
      if (p.pagina === tot || true) qrRodape(Hd, W, H, op);
      var cf = DS().conferir(Hd, [0, 0, W, H]); verificacao.total += cf.total;
      verificacao.textoTexto += f.conf.textoTexto.length; verificacao.textoLinha += f.conf.textoLinha.length; verificacao.foraJanela += f.conf.foraJanela.length;
      verificacao.porPagina.push({ numero: p.numero, titulo: p.titulo, textoTexto: f.conf.textoTexto, textoLinha: f.conf.textoLinha, foraJanela: f.conf.foraJanela, cabecalho: cf.total });
      corpo = '<g data-corpo="1">' + f.D.svg() + "</g><g data-notas=\"1\">" + f.Fr.svg() + "</g><g data-cabecalho=\"1\">" + Hd.svg() + "</g>";
      return finalPag(p, corpo, f.escala);
      function montarPagina(pp, cb, cc) {
        verificacao.textoTexto += cc.textoTexto.length; verificacao.textoLinha += cc.textoLinha.length; verificacao.foraJanela += cc.foraJanela.length; verificacao.total += cc.total;
        verificacao.porPagina.push({ numero: pp.numero, titulo: pp.titulo, textoTexto: cc.textoTexto, textoLinha: cc.textoLinha, foraJanela: cc.foraJanela, cabecalho: 0 });
        return finalPag(pp, cb, "SEM ESCALA");
      }
    });
    function finalPag(p, corpo, escala) {
      var tit = p.numero + " - " + p.titulo + " - " + ctx.rev, svg = svgPagina(W, H, fonte, tit, pal, corpo, txt(op.qrUrl));
      if (/NaN|undefined/.test(svg)) avisos.push("Página " + p.numero + ": há valor inválido (NaN/undefined) no desenho.");
      return { numero: p.numero, pagina: p.pagina, titulo: p.titulo, tipo: p.tipo, id: p.id, formato: "A3", escala: escala, svg: svg };
    }
    var nomeArq = nomeArquivo({ proprietario: ctx.proprietario, revisao: ctx.rev });
    var pendDet = []; feitas.forEach(function (f) { if (feitasPorId[f.p.id] === f && f.res && f.res.pendencias) f.res.pendencias.forEach(function (q) { var o = {}; Object.keys(q).forEach(function (kq) { o[kq] = q[kq]; }); o.pagina = f.p.numero; pendDet.push(o); }); });   /* as pendências dos detalhes (sacada, gás, lareira, churrasqueira): o que o modelo ou o BIM não traz */
    return { ok: true, pendenciasDetalhes: pendDet, paginas: paginas, indice: indice, verificacao: verificacao, rev: ctx.rev, paleta: pal, completa: completa, nomeArquivo: nomeArq, quadroAreas: c._quadro || null, total: tot, formato: "A3", escalaPlanta: c.plano.escala, indices: c.idx, checklist: completa ? itensChecklist(c, st) : null, ctx: ctx };
  }

  /* ---- planta de esquadrias (só paredes e aberturas; siglas por TIPO; nota de aferição) */
  function desenharEsquadrias(c, D, p) {
    var Pl = PL(), A = c.A, res = Pl.planta(c, { modo: "layout", pav: p.pav, titulo: p.titulo, cotas: true, cotasInt: false, completo: false, esquadrias: true }), T = D.E.T;
    var y = Math.min(res.y + 12, A.y + A.h - 6);
    D.texto(A.x + 4, y, "Aferir as dimensões das aberturas no local antes de produzir.", T.nota * 1.05, { cor: VERMELHO, peso: 0.2 });
    return res;
  }

  /* ---- detalhamento de fachadas: as fachadas com a chamada marsala (cores da obra) + quadro de quantidades */
  function desenharFachadasDet(c, D, op) {
    var cf = op.coresFachada && typeof op.coresFachada === "object" ? op.coresFachada : null, antes = c.op.coresFachada;
    /* a faixa da direita guarda o quadro; as fachadas usam o resto: estreita a área só durante este desenho */
    var A0 = c.A, hQ = 52, T = D.E.T, QDm = QD(), L = [], tem = !!(cf && (cf.novo || cf.existente || cf.muro));
    c.op.coresFachada = cf;
    c.A = { x: A0.x, y: A0.y, w: A0.w, h: A0.h - hQ - 4 };
    var res;
    try { res = CT().fachadas(c); } finally { c.A = A0; c.op.coresFachada = antes; }
    var par = arr(c.dados.paredes).filter(function (w) { return w.status !== "demolido"; }), vaos = arr(c.dados.vaos).filter(function (v) { return v.status !== "demolido"; });
    var cls = [["muro", "C1 - MURO"], ["novo", "C2 - PAREDE NOVA"], ["existente", "C3 - PAREDE EXISTENTE"]];
    cls.forEach(function (k) {
      var ws = par.filter(function (w) { return (w.muro ? "muro" : (w.status === "novo" ? "novo" : "existente")) === k[0]; });
      if (!ws.length) return;
      var comp = 0, bruta = 0, ids = {}; ws.forEach(function (w) { comp += num(w.comprimento, 0); bruta += num(w.comprimento, 0) * num(w.altura, 0); ids[w.id] = 1; });
      var vaosArea = 0; vaos.forEach(function (v) { if (ids[v.parede]) vaosArea += num(v.largura, 0) * num(v.altura, 0); });
      var e = cf && cf[k[0]], nome = e && e.nome ? e.nome : "", cor = e && e.cor ? e.cor : "";
      L.push([k[1], nome ? nome.toUpperCase() : { t: "informe", cor: VERMELHO }, cor ? cor.toUpperCase() : { t: "informe", cor: VERMELHO }, br(comp, 2), br(bruta, 2), br(vaosArea, 2), br(Math.max(0, bruta - vaosArea), 2)]);
    });
    if (!L.length) L = [[{ t: "sem parede no modelo", cor: VERMELHO }, "", "", "", "", "", ""]];
    var x = A0.x + 4, y = A0.y + A0.h - hQ;
    var t1 = QDm.tabela(D, x, y, Math.min(A0.w - 8, 300), "ACABAMENTOS E QUANTIDADES DA FACHADA", [{ t: "CLASSE", f: 2.2, al: "E" }, { t: "TINTA / REVESTIMENTO", f: 3, al: "E" }, { t: "COR", f: 1.4 }, { t: ["COMPR.", "(m)"], f: 1.2, al: "D" }, { t: ["ÁREA", "BRUTA m²"], f: 1.3, al: "D" }, { t: ["VÃOS", "m²"], f: 1.1, al: "D" }, { t: ["ÁREA", "LÍQ. m²"], f: 1.3, al: "D" }], L);
    y += t1.h + 3;
    var notas = ["Área bruta = comprimento x altura de cada parede da classe (uma face); vãos = largura x altura das esquadrias hospedadas nessas paredes. Conferir na obra: parede interna entra na soma da sua classe."];
    if (!tem) notas.unshift("Tintas e revestimentos: informe no cadastro da obra (nada é assumido) - sem eles a fachada sai sem linha de chamada.");
    notas.forEach(function (t0) { AP().quebrar(t0, T.nota, A0.w - 10).forEach(function (ln) { if (y < A0.y + A0.h - 1) { D.texto(x, y + T.nota * 0.8, ln, T.nota, { cor: /informe/.test(t0) ? VERMELHO : null }); y += T.nota * 1.45; } }); });
    return res;
  }

  /* ---- renders: as 4 isométricas do modelo (a foto da cena 3D, a mesma das pranchas) numa grade 2 x 2 */
  function desenharRenders(c, D, F) {
    var A = c.A, d = DS(), b = F.caixaModelo(c.dados), cw = A.w / 2 - 4, ch = A.h / 2 - 4;
    F.VISTAS_ISO.forEach(function (v, i) {
      var ar = F.argsIso(b, v.az), foto = F.fotoDe(v.id, ar);
      if (!foto) { c.avisos.push("Página RENDERS: a foto da " + v.nome.toLowerCase() + " não saiu (o 3D do BIM não respondeu)."); return; }
      var cx0 = A.x + 2 + (i % 2) * (A.w / 2), cy0 = A.y + 2 + Math.floor(i / 2) * (A.h / 2), hT = d.titulo(D, cx0, cy0, v.nome, "SEM ESCALA", i + 1), yi = cy0 + hT + 2, hMax = ch - hT - 4;
      var wm = Math.min(cw, hMax * foto.w / foto.h), hm = wm * foto.h / foto.w;
      D.add('<image data-im="' + foto.key + '" x="' + n(cx0) + '" y="' + n(yi) + '" width="' + n(wm) + '" height="' + n(hm) + '" preserveAspectRatio="none" href="' + foto.href + '"/>');
      D.ret(cx0, yi, wm, hm, "ARQ-FINA");
    });
    return { escala: "SEM ESCALA" };
  }

  /* ---- pontos elétricos e hidráulicos do modelo */
  var HID_FAM = /bacia|lavatorio|chuveiro|tanque|pia|torneira|ducha|vaso|mictorio|bide/i;
  function pontosDoModelo(modelo, dados, pavs) {
    var est = (modelo && modelo.estado) || {}, out = [];
    function pavDe(y) { return pavDeY(pavs, y); }
    function alturaDe(y, pav) { var cota = num((pavs[pav] || {}).cota, 0); return Math.max(0, y - cota); }
    arr(dados.eletricos).forEach(function (e) { if (e.status === "demolido") return; out.push({ id: e.id, x: e.x, z: e.z, pav: e.pav != null ? e.pav : 0, sistema: "Elétrica", rotulo: e.tipo === "interruptor" ? "Interruptor" : (e.tipo === "tomada" ? "Tomada" : "Dispositivo"), altura: e.alt, origem: "familia", detalhe: txt(e.sub) }); });
    arr(dados.luminarias).forEach(function (l) { if (l.status === "demolido") return; out.push({ id: l.id, x: l.x, z: l.z, pav: l.pav != null ? l.pav : 0, sistema: "Elétrica", rotulo: "Ponto de luz", altura: l.alt != null ? l.alt : null, origem: "familia", detalhe: txt(l.circuito) }); });
    arr(dados.moveis).forEach(function (m) { if (m.status === "demolido") return; if (HID_FAM.test(txt(m.famId) + " " + txt(m.nome))) out.push({ id: m.id, x: m.x, z: m.z, pav: m.pav != null ? m.pav : 0, sistema: "Hidráulica", rotulo: txt(m.nome || m.famId), altura: null, origem: "familia", detalhe: "" }); });
    arr(est.instalacoes && est.instalacoes.pecas).forEach(function (pc) {
      if (!pc || pc.fase === "demolido") return;
      var pav = pavDe(num(pc.y, 0)), ele = pc.sistema === "eletrica";
      var nomes = { caixa_4x2: "Caixa 4x2", caixa_4x4: "Caixa 4x4", caixa_octogonal: "Caixa octogonal (luz)", ralo_sifonado: "Ralo sifonado", ralo_seco: "Ralo seco", caixa_sifonada: "Caixa sifonada", terminal_ventilacao: "Terminal de ventilação", valvula_bloqueio: "Registro / válvula", caixa_inspecao: "Caixa de inspeção" };
      out.push({ id: pc.id, x: pc.x, z: pc.z, pav: pav, sistema: ele ? "Elétrica" : "Hidráulica", rotulo: nomes[pc.peca] || txt(pc.peca).replace(/_/g, " "), altura: ele && pc.alturaPiso != null ? pc.alturaPiso : alturaDe(num(pc.y, 0), pav), origem: "instalacao", detalhe: txt(pc.dn) ? "DN " + txt(pc.dn) : "" });
    });
    return out;
  }
  function desenharPontos(c, D, p, pontos) {
    var Pl = PL(), A = c.A, T = D.E.T, G = GEO(), res = Pl.planta(c, { modo: "layout", pav: p.pav, titulo: p.titulo, cotas: false, cotasInt: false, completo: false, esquadrias: true }), M = res.M;
    var meus = pontos.filter(function (q) { return q.pav === p.pav; }), L = [], k = 0;
    meus.forEach(function (q) {
      k++; var xy = M.Pp([q.x, q.z]), cor = q.sistema === "Elétrica" ? "#c00000" : "#1a5fb4";
      D.add('<circle cx="' + n(xy[0]) + '" cy="' + n(xy[1]) + '" r="1.3" fill="' + cor + '" stroke="none"/>');
      var wN = DS().largTexto(String(k), T.nota) + 0.6, hN = T.nota * 1.2, cand = [[2.2, -1.2], [-2.2 - wN, -1.2], [2.2, 3.6], [-2.2 - wN, 3.6], [-0.5, -4], [-0.5, 5.5]], pN = null, jN;
      for (jN = 0; jN < cand.length && !pN; jN++) { var bxN = [xy[0] + cand[jN][0], xy[1] + cand[jN][1] - hN * 0.8, xy[0] + cand[jN][0] + wN, xy[1] + cand[jN][1] + hN * 0.3]; if (D.livre(bxN, 0.25)) pN = cand[jN]; }
      if (pN) D.texto(xy[0] + pN[0], xy[1] + pN[1], String(k), T.nota, { cor: cor, peso: 0.2 });
      else c.avisos.push("Página " + p.numero + ": sem lugar livre para a chamada do ponto " + k + " (ver a tabela).");
      var am = ambienteDe(c.dados, q.x, q.z, p.pav);
      L.push([String(k), q.sistema.toUpperCase(), txt(q.rotulo).toUpperCase(), am ? txt(am.nome).toUpperCase() : "", q.altura != null && isFinite(q.altura) ? br(q.altura, 2) : { t: "informe", cor: VERMELHO }, txt(q.detalhe)]);
    });
    void G;
    var x = A.x + 4, y = Math.min(res.y + 18, A.y + A.h - 40), wT = A.w - 8, maxL = Math.max(1, Math.floor((A.y + A.h - y - 30) / 4.6)), linhas = L.slice(0, maxL);
    var ts = QD().tabela(D, x, y, Math.min(wT, 300), "PONTOS DO MODELO (chamada nº, altura do piso ao centro)", [{ t: "Nº", f: 0.6 }, { t: "SISTEMA", f: 1.4, al: "E" }, { t: "PONTO", f: 3, al: "E" }, { t: "AMBIENTE", f: 2.4, al: "E" }, { t: ["ALTURA", "(m)"], f: 1.2, al: "D" }, { t: "OBS", f: 1.6, al: "E" }], linhas);
    if (L.length > linhas.length) c.avisos.push("Página " + p.numero + ": a tabela de pontos não cabe em " + L.length + " linhas; mostrei " + linhas.length + ". Divida por pavimento/ambiente.");
    var yN = y + ts.h + 4; QDTS.notaRegistro.forEach(function (t0) { AP().quebrar(t0, T.nota, A.w - 12).forEach(function (ln) { if (yN < A.y + A.h - 2) { D.texto(x, yN + T.nota * 0.8, ln, T.nota); yN += T.nota * 1.45; } }); });
    return { escala: res.escala, y: yN };
  }

  /* ---- detalhamentos condicionais: ficha com os dados do modelo (e o desenho paramétrico quando o modelo calcula) + a planta do pavimento com o elemento circulado em marsala */
  function plantaComDestaque(c, D, pav, yTop, els, titulo, mg) {
    var Pl = PL(), A0 = c.A, p0 = c.plano, cx = p0.caixa, G = GEO(), esc = 300, T = D.E.T, hDisp = A0.h - (yTop - A0.y), mW = mg ? mg.w : 100, mH = mg ? mg.h : 110;   /* mg: as margens (mm) que a planta pede em volta: o detalhe, que mostra só a posição, usa menos */
    var lista = [75, 100, 125, 150, 200, 250, 300], i, ok = false;
    for (i = 0; i < lista.length && !ok; i++) { esc = lista[i]; var k0 = 1000 / esc; ok = (cx[2] - cx[0]) * k0 + mW <= A0.w && (cx[3] - cx[1]) * k0 + mH <= hDisp; }
    c.plano = { k: 1000 / esc, escala: esc, caixa: cx }; c.A = { x: A0.x, y: yTop, w: A0.w, h: hDisp };
    var res, K0 = DS().K, mc0 = K0.margemCotas;
    /* a planta reserva 44 mm de margem para as cadeias de cota em cada lado; aqui não há cota: o detalhe pede menos (mg.mc) e a posição ganha escala. Sempre devolvida no finally. */
    if (mg && mg.mc != null) K0.margemCotas = mg.mc;
    try { res = Pl.planta(c, { modo: "layout", pav: pav, titulo: titulo, cotas: false, cotasInt: false, completo: false, esquadrias: true }); } finally { K0.margemCotas = mc0; c.A = A0; c.plano = p0; }
    var M = res.M, P = K.pena, n0 = 0;
    els.forEach(function (e) {
      if (arr(e.pts).length < 3) return;
      var q = e.pts.map(function (pt) { return M.Pp(pt); }), bb = G.bbox(q), g = 2.2, r = [bb[0] - g, bb[1] - g, bb[2] + g, bb[3] + g];
      /* a moldura tracejada marsala: só os lados que não atravessam texto da planta (o resto fica sem linha, em vez de riscar um rótulo) */
      [[r[0], r[1], r[2], r[1]], [r[2], r[1], r[2], r[3]], [r[2], r[3], r[0], r[3]], [r[0], r[3], r[0], r[1]]].forEach(function (sd) {
        var bxS = [Math.min(sd[0], sd[2]) - 0.1, Math.min(sd[1], sd[3]) - 0.1, Math.max(sd[0], sd[2]) + 0.1, Math.max(sd[1], sd[3]) + 0.1];
        if (!D.livre(bxS, 0.15)) return;
        D.add('<line x1="' + n(sd[0]) + '" y1="' + n(sd[1]) + '" x2="' + n(sd[2]) + '" y2="' + n(sd[3]) + '" stroke="' + P.chamada + '" stroke-width="' + n(P.chamadaMm) + '" stroke-dasharray="' + P.chamadaTraco + '" data-cam="CAD-CHAMADA"/>');
      });
      var rot = (++n0) + " - " + txt(e.nome).toUpperCase().slice(0, 30), w = DS().largTexto(rot, T.nota) + 1, h = T.nota * 1.3, pos = [[r[0], r[1] - h - 2.6], [r[0], r[3] + 2.6], [r[2] + 3, r[1]], [r[0] - w - 3, r[1]]], pu = null, j;
      for (j = 0; j < pos.length && !pu; j++) { var bx = [pos[j][0], pos[j][1], pos[j][0] + w, pos[j][1] + h]; if (D.livre(bx, 0.3)) pu = pos[j]; }
      if (pu) {
        D.texto(pu[0], pu[1] + h * 0.8, rot, T.nota, { cor: P.chamada, peso: 0.15 });
        var ex = pu[0] + (pu[0] > r[2] ? 0 : (pu[0] < r[0] ? w : 0)), ey = pu[1] + (pu[1] > r[3] ? 0 : h);
        D.add('<line x1="' + n(ex) + '" y1="' + n(ey) + '" x2="' + n((r[0] + r[2]) / 2) + '" y2="' + n((r[1] + r[3]) / 2) + '" stroke="' + P.chamada + '" stroke-width="' + n(P.chamadaMm) + '" stroke-dasharray="' + P.chamadaTraco + '" data-cam="CAD-CHAMADA"/>');
        D.add('<circle cx="' + n((r[0] + r[2]) / 2) + '" cy="' + n((r[1] + r[3]) / 2) + '" r="0.7" fill="' + P.chamada + '" stroke="none" data-cam="CAD-CHAMADA"/>');
      } else c.avisos.push("Página " + (c.def && c.def.numero) + ": sem lugar livre para o rótulo de " + txt(e.nome) + " na planta (o nome está na ficha).");
    });
    return res;
  }
  /* sacada / casa do gás / lareira / churrasqueira: planta e corte do elemento (js/arqdetalhes.js) em cima; embaixo a ficha com os dados do modelo, as pendências e a posição na planta */
  function desenharDetalhe(c, D, p, cond) {
    var A = c.A, T = D.E.T, d = DS(), yTop = A.y + 2, el = p.els[0], DT = DET(), QDm = QD();
    if (!DT) { c.avisos.push("Página " + p.numero + ": o motor dos detalhes (js/arqdetalhes.js) não carregou."); return { escala: "SEM ESCALA" }; }
    var hRow = Math.min(134, Math.floor((A.y + A.h - yTop) * 0.58)), det = DT.desenhar(c, D, { x: A.x + 4, y: yTop, w: A.w - 8, h: hRow }, p.tipo, el, cond);
    var wL = 108, yL = yTop + Math.max(det.alt, 40) + 4, wR = A.w - 8 - det.larg - 8, aoLado = wR >= 96;
    var tb = QDm.tabela(D, A.x + 4, yL, wL, "FICHA DO ELEMENTO (dados do modelo)", [{ t: "ITEM", f: 3, al: "E" }, { t: "VALOR", f: 2, al: "D" }], det.ficha); yL += tb.h + 4;
    det.pendencias.forEach(function (t0) {
      AP().quebrar("PENDÊNCIA: " + t0, T.nota * 0.95, wL).forEach(function (ln) { if (yL + T.nota * 1.4 < A.y + A.h - 1) { D.texto(A.x + 4, yL + T.nota * 0.8, ln, T.nota * 0.95, { cor: VERMELHO }); yL += T.nota * 1.4; } });
      c.avisos.push("Página " + p.numero + " (" + p.titulo + "): " + t0);
    });
    /* a posição na planta: ao lado do desenho quando sobra largura; senão embaixo, à direita da ficha */
    var pav = el.pav || 0, A0 = c.A, tit = "POSIÇÃO NA PLANTA" + (c.dados.pavimentos.length > 1 ? " - " + txt((c.dados.pavimentos[pav] || {}).nome).toUpperCase() : "");
    c.A = aoLado ? { x: A.x + 4 + det.larg + 8, y: yTop, w: wR, h: A.y + A.h - yTop } : { x: A.x + 4 + wL + 8, y: yTop + Math.max(det.alt, 40) + 4, w: A.w - 8 - wL - 8, h: A.y + A.h - (yTop + Math.max(det.alt, 40) + 4) };
    try { plantaComDestaque(c, D, pav, c.A.y, [el], tit, { w: 44, h: 64, mc: 8 }); } finally { c.A = A0; }
    return { escala: det.escala, pendencias: det.pendencias.map(function (t1) { return { pagina: p.numero, tipo: p.tipo, elemento: txt(el.nome), texto: t1 }; }) };
  }
  function desenharCondicional(c, D, p, cond, modelo) {
    if (p.det) return desenharDetalhe(c, D, p, cond);
    var A = c.A, T = D.E.T, d = DS(), hT = d.titulo(D, A.x + 4, A.y + 2, p.titulo, "SEM ESCALA", 1), x = A.x + 4, y = A.y + 2 + hT + 6, QDm = QD(), G = GEO();
    var els = p.els || [p.el], linhas = [], yFim = y;
    function inform(v, f) { return v != null && isFinite(v) ? f(v) : { t: "informe", cor: VERMELHO }; }
    if (p.tipo === "escada") {
      var e = p.el, par = e.par || {}, cal = e.calc || {}, med = e.med || {};
      linhas = [["Largura (m)", inform(par.largura, function (v) { return br(v, 2); })], ["Desnível a vencer (m)", inform(par.desnivel, function (v) { return br(v, 2); })], ["Forma", txt(par.forma) || { t: "informe", cor: VERMELHO }],
        ["Nº de espelhos", inform(med.espelhos, String)], ["Nº de pisos", inform(med.pisos, String)], ["Altura do espelho e (m)", inform(cal.e, function (v) { return br(v, 3); })], ["Piso p (m)", inform(cal.p, function (v) { return br(v, 3); })],
        ["Blondel 2e + p (m)", inform(cal.blondel, function (v) { return br(v, 3); })], ["Guarda-corpo", txt(par.guarda) || { t: "informe", cor: VERMELHO }]];
      var tb = QDm.tabela(D, x, y, 120, "FICHA DA ESCADA (dados do modelo)", [{ t: "ITEM", f: 3, al: "E" }, { t: "VALOR", f: 2, al: "D" }], linhas);
      yFim = y + tb.h;
      /* o perfil da escada, desenhado a partir de e, p e n do cálculo do modelo (se o modelo não calcula, só a ficha sai) */
      if (cal.ok && cal.n > 0 && cal.e > 0 && cal.p > 0) {
        var k = Math.min(20, (A.w - 190) / (cal.n * cal.p + 0.6), 56 / (cal.n * cal.e + 0.4)), ox = x + 150, oy = y + 12 + cal.n * cal.e * k, i, pts = [[ox, oy]];
        D.texto(ox, y + 5, "PERFIL (ESC 1:" + Math.round(1000 / k) + ")", T.tabelaCab, { peso: 0.2 });
        for (i = 0; i < cal.n; i++) { pts.push([ox + i * cal.p * k, oy - (i + 1) * cal.e * k]); pts.push([ox + (i + 1) * cal.p * k, oy - (i + 1) * cal.e * k]); }
        pts.pop(); D.poli(pts, "ARQ-PAREDE", false);
        D.linha(ox - 6, oy, ox + cal.n * cal.p * k + 6, oy, "ARQ-TERRENO");
        D.cota(ox, oy + 6, ox + cal.n * cal.p * k, oy + 6, 0, d.cotaTxt(cal.n * cal.p), { desde: [false, false], semExt: true });
        D.cadeia([[ox - 8, oy], [ox - 8, oy - cal.n * cal.e * k]], 0, [d.cotaTxt(cal.n * cal.e)], { offs: [4.5], desde: [false, false], semExt: true });
        yFim = Math.max(yFim, oy + 12);
      }
    } else if (p.tipo === "guarda") {
      linhas = els.map(function (g) { var m = g.med || {}; return [txt(g.id), inform(g.cx && g.cx.altura, function (v) { return br(v, 2); }), inform(m.comprimento != null ? m.comprimento : (g.cx && g.cx.comprimento), function (v) { return br(v, 2); }), inform(m.montantes, String)]; });
      var tg = QDm.tabela(D, x, y, 120, "GUARDA-CORPO (dados do modelo)", [{ t: "ID", f: 2, al: "E" }, { t: ["ALTURA", "(m)"], f: 1.3, al: "D" }, { t: ["COMPR.", "(m)"], f: 1.3, al: "D" }, { t: "MONTANTES", f: 1.4, al: "D" }], linhas);
      yFim = y + tg.h;
      var g0 = els[0], Lc = g0.med && g0.med.comprimento != null ? g0.med.comprimento : num(g0.cx && g0.cx.comprimento, 0), Hc = num(g0.cx && g0.cx.altura, 1.05), nm = g0.med && g0.med.montantes ? g0.med.montantes : 0;
      if (Lc > 0 && Hc > 0) {
        var kk = Math.min(20, (A.w - 190) / Lc, 40 / Hc), xe = x + 150, ye = y + 12 + Hc * kk;
        D.texto(xe, y + 5, "ELEVAÇÃO ESQUEMÁTICA DO " + txt(g0.id).toUpperCase() + " (ESC 1:" + Math.round(1000 / kk) + ")", T.tabelaCab, { peso: 0.2 });
        D.linha(xe, ye, xe + Lc * kk, ye, "ARQ-TERRENO"); D.linha(xe, ye - Hc * kk, xe + Lc * kk, ye - Hc * kk, "ARQ-PAREDE");
        for (var q = 0; q < nm; q++) { var xm = nm > 1 ? xe + q * (Lc * kk) / (nm - 1) : xe; D.linha(xm, ye, xm, ye - Hc * kk, "ARQ-FINA"); }
        D.cota(xe, ye + 5, xe + Lc * kk, ye + 5, 0, d.cotaTxt(Lc), { desde: [false, false], semExt: true });
        yFim = Math.max(yFim, ye + 12);
      }
    } else {
      linhas = els.map(function (e2) { var am = e2.ambiente || ambienteDe(c.dados, e2.pts[0][0], e2.pts[0][1], e2.pav), bb = G.bbox(e2.pts); return [txt(e2.nome).toUpperCase(), am ? txt(am.nome).toUpperCase() : "", e2.pav != null && c.dados.pavimentos[e2.pav] ? txt(c.dados.pavimentos[e2.pav].nome).toUpperCase() : "", br(bb[2] - bb[0], 2) + " x " + br(bb[3] - bb[1], 2)]; });
      var to = QDm.tabela(D, x, y, 200, p.titulo + " - ELEMENTOS DO MODELO", [{ t: "ELEMENTO", f: 3, al: "E" }, { t: "AMBIENTE", f: 2, al: "E" }, { t: "PAVIMENTO", f: 1.6, al: "E" }, { t: "DIMENSÕES (m)", f: 1.6, al: "D" }], linhas);
      yFim = y + to.h;
    }
    var pav = els[0].pav || 0, res = plantaComDestaque(c, D, pav, yFim + 8, els.filter(function (q2) { return (q2.pav || 0) === pav; }), "POSIÇÃO NA PLANTA" + (c.dados.pavimentos.length > 1 ? " - " + txt((c.dados.pavimentos[pav] || {}).nome).toUpperCase() : ""));
    void modelo; void cond;
    return { escala: res && res.escala ? res.escala : "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ exportação */
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.paginas.map(function (p) { return { nome: r.nomeArquivo + "_" + p.numero + ".svg", svg: p.svg }; });
    if (formato === "pdf") { var S = PDFm(); return S ? S.pdf(r.paginas.map(function (p) { return p.svg; }), { titulo: "Caderno executivo de arquitetura", imagensPorChave: r.imagensPorChave || {} }) : null; }
    return null;
  }

  var ArqCaderno = { VERSAO: 1, K: K, gerar: gerar, exportar: exportar, nomeArquivo: nomeArquivo, paletaDe: paletaDe, elementosCondicionais: elementosCondicionais, pontosDoModelo: pontosDoModelo, ROTULO_PAG: ROTULO_PAG, geometria: geometria, tipoAbertura: tipoAbertura };
  global.ArqCaderno = ArqCaderno;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqCaderno;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

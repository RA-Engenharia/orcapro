/* =====================================================================
 * hidpranchas.js — PRANCHAS DO PROJETO HIDROSSANITÁRIO (fase 1: água fria
 * + esgoto). Motor PURO, ES5, sem DOM.
 *
 *   HidPranchas.gerar(resultado, modelo, opcoes) → { ok, folhas: [{ id, rotulo,
 *       numero, titulo, formato, escala, svg, caixasTexto }], avisos, verificacao }
 *   resultado = HidDimensionar.calcular(...)  (docs/hidro/CONTRATO.md)
 *   modelo    = { estado, avaliarFam }        (o mesmo de entrada.modelo)
 *   opcoes    = { pavimentos: [{ nome, cota }], formato ("A1"), codigo, revisao,
 *                 data, empresa, responsavel, registro, obra, proprietario,
 *                 contratante, local, logo, ambientes, sistemas }
 *   HidPranchas.exportar(r, "pdf" | "svg" | "dxf") → bytes / textos (SvgPdf do js/svgpdf.js; DXF pelo
 *       escritor do js/bimdxf.js: TODAS as folhas, lado a lado, cada uma com moldura e CARIMBO)
 *   HidPranchas.configPadrao() / normalizarConfig(c) → a configuração da tela "Gerar pranchas"
 *       (sistemas, folha A0–A4, escala auto/fixa, prefixo HID, revisão, conjuntos, nível da planta, QR)
 *   HidPranchas.ambientesAuto(estado) → os ambientes molhados pelas paredes em volta dos aparelhos
 *
 * GERAR PRANCHAS (pedido do Rogério, 18/10/2026: "capricha nas pranchas… tem que ser bem prático"):
 *   opcoes.conjuntos = { plantas, cortes, isometricos, esquema, detalhes, quadro } escolhe o que sai;
 *   a PLANTA sai no nível MÉDIO do padrão (tubo CHEIO na cor do sistema, conexão BRANCA com contorno —
 *   js/biminstnivel.js formas) sobre a arquitetura em meio-tom (paredes e louças do modelo);
 *   CORTES das paredes hidráulicas (vista da parede com tubos, pontos, alturas e cotas);
 *   DETALHES TÍPICOS (kit da bacia, caixa sifonada, caixa de inspeção, caixa de gordura, barrilete,
 *   reservatório); QUADRO DE MATERIAIS com o ícone da peça; coluna com LEGENDA, CONVENÇÕES, NOTAS,
 *   NORMAS, PENDÊNCIAS e o QR do portal da obra (se houver). O que não cabe na coluna vai para uma folha
 *   de NOTAS GERAIS (nada é cortado). A conferência de sobreposição confere rótulo × rótulo, rótulo ×
 *   cota e rótulo × tubo em toda folha.
 *
 * O jogo (docs/hidro/PADRAO-PRANCHA-HIDRO.md):
 *   HID-01…  PLANTAS por pavimento e sistema (AF, ES), 1:25–1:200 pela folha
 *   HID-nn   ISOMÉTRICOS (30°, sem escala, com cotas), um por ambiente/conjunto
 *   HID-nn   ESQUEMA VERTICAL (colunas de AF e tubos de queda com ventilação)
 *   HID-nn   DETALHES TÍPICOS (caixa de inspeção, de gordura, reservatório),
 *            com as cotas do catálogo (letras da ficha) quando há
 *
 * PADRÃO: papel, moldura e o CARIMBO RA vêm do js/prancha.js (o carimbo não
 * muda); letra, cota e tabela do desenho da casa (js/acopranchas.js Desenho);
 * os rótulos do isométrico e da planta passam pelo mesmo algoritmo de
 * afastamento (js/hidisometrico.js) e TODA folha sai com a conferência de
 * sobreposição de texto no fim (regra da RA).
 *
 * ⚠ NADA É INVENTADO: DN, vazão, declividade, altura e comprimento vêm do
 *   resultado/modelo; dimensão de catálogo sai nas LETRAS da ficha (a conferir);
 *   o que o cálculo não fechou (fixture, pendência) sai em VERMELHO na coluna.
 * Teste: node tools/test-hid-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* hid:fisica-inicio — GEOMETRIA DE DESENHO da prancha (mm de papel). Não é valor de norma. */
  var K2 = {
    gapUn: 30, offCota: 6,
    escalas: [20, 25, 50, 75, 100, 125, 150, 200, 250, 300], formatosAuto: ["A3", "A2", "A1", "A0"], escalaAlvo: 50,
    titulo: 16, folgaFolha: 6,
    rPrumada: 1.6, hLetra: 2.5, hLetraPeq: 2.1,
    espacoColuna: 38, espacoColunaMin: 26, passoNivelMin: 4, bandaRes: 0.3, bandaResMax: 70, larguraCaixaEsq: 52,   /* banda da reservação no esquema vertical (fração da área, máx. mm) e largura de uma caixa desenhada (mm de papel) */
    stub: 9,
    notaLinha: 1.42, notaEntre: 0.7, blocoEntre: 3.5, tituloQuadro: 0.62, tituloEntre: 1.31,
    legLinha: 5.2, legSimbolo: 5, legTexto: 12,
    caixaIns: [80, 110], caixaGord: [90, 120], reserv: [150, 110],
    catMax: 4, erroX: 10, erroY: 20, vazioY: 30, parEx: 5, parAviso: 3,
    pena: { AF: 0.35, AQ: 0.35, ES: 0.5, VE: 0.25, AP: 0.35, IN: 0.35, IND: 0.35, GAS: 0.35, simbolo: 0.25, cota: 0.13, fina: 0.18, tabela: 0.25, titulo: 0.35, moldura: 0.5, contexto: 0.13, eixo: 0.13 },
    cor: { AF: "#1E6FD9", AQ: "#D93025", ES: "#2E9E44", VE: "#8C8C8C", AP: "#00ACC1", IN: "#C62828", IND: "#6D4C41", GAS: "#C9A400" },
    tracoVE: "4 1.5", tracoEixo: "9.6 1.6 0.4 1.6", vermelho: "#c00000",
    /* GERAR PRANCHAS (18/10/2026): arquitetura em meio-tom, contorno do tubo cheio, cortes, detalhes, quadro, QR */
    arq: { preench: "#e4e4e4", contorno: "#8c8c8c", louca: "#9a9a9a", mm: 0.13 }, contornoTubo: 0.09, contornoFrac: 0.12, tuboFinoMm: 1.0,
    escalasCorte: [20, 25, 50, 75], cortePiso: 0.6, corteTopo: 0.3, faixaParede: 0.2, folgaCorte: 14, corteMinPontos: 1,
    qr: 30, qrTexto: 2.5, qrRot: "PORTAL DA OBRA",
    quadro: { linha: 6.2, icone: 9, col: [12, 0, 26, 12, 18], gap: 12, cab: 7.5 },
    detalhe: { linhas: 2, colunas: 3 }, barMax: 4, chamadaPlanta: 1.8,
    /* rodada 2: louça real (vinco em graus, quantização de vértice, lados do círculo), vistas agrupadas na folha (mm de papel) */
    vinco: 40, quant: 10000, ladosCirc: 16, folgaVista: 4, folgaRotulos: 20, entreVistas: 10, corteFracW: 0.62, corteFracH: 0.55, folgaRotulo: 0.9,
    folgaAmb: 0.12, ambFolga: 1.0, ambTol: 0.06, aciCinza: 8, letraDxf: 0.7,
    /* perspectiva isométrica por ambiente: folgas (m), faixa da legenda, margens e limites (mm de papel) */
    perspFundo: 0.3, perspTopo: 0.25, perspOd: 1.3, perspFrente: 0.001, perspPeca: 0.06, perspLegenda: 30, perspMargem: 6, perspKMax: 90,
    perspGrade: 5, fov3d: 50, minContorno: 3, iso3d: [0.55, 0.5, 0.55], perspAlfa: 0.35, perspAlfaLouca: 0.7, perspAltura: 2.8, perspAlturaMax: 3.2, perspMin: 0.3, perspVertMin: 0.4, perspD0: 1.2, perspNivel: 1.4
  };
  /* hid:fisica-fim */

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function HI() { return dep("HidIsometrico", "./hidisometrico.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  /* PADRÃO DE APRESENTAÇÃO DE INSTALAÇÕES (js/biminstpadrao.js): cor, pena e traço de cada sistema; legenda e rótulo */
  function MEM() { return dep("HidMemorial", "./hidmemorial.js") || {}; }
  /* rótulo do DN no desenho (F8, 28/10/2026): o trecho com DN definido mostra SÓ o DN; sem DN nenhum, "DN a confirmar". Nunca "(sem cálculo)". */
  function dnRotulo(t, inf, vertical) {
    var dn = inf && inf.dn != null ? inf.dn : t.dn, PDr = PAD();
    if (dn == null) return "DN a confirmar";
    return PDr ? PDr.rotuloTrecho({ sistema: t.sistema, dn: dn, vertical: vertical !== false }) : "DN " + dn;
  }
  function PAD() { var p = dep("BimInstPadrao", "./biminstpadrao.js"); return p && p.pronto && p.pronto() ? p : null; }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function NIV() { return dep("BimInstNivel", "./biminstnivel.js"); }
  function GEO() { return dep("BimInstGeo", "./biminstgeo.js"); }
  function KIT() { return dep("HidKitDados", "./hidkitdados.js"); }
  function PEC() { return dep("HidPecas", "./hidpecas.js"); }
  function DXF() { return dep("BimDxf", "./bimdxf.js"); }
  function QRL() {
    if (global.qrcode) return global.qrcode;
    if (typeof require === "function") { try { return require("./vendor/qrcode.min.js"); } catch (e) { /* ausente */ } }
    return null;
  }

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function dois(k) { return ("0" + k).slice(-2); }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }   // hid:ok formatação decimal
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function larg(s, h) { var A = AP(); return A && A.largTexto ? A.largTexto(s, h) : txt(s).length * h * HI().K.larg; }

  var NOME_SIS = { agua_fria: "ÁGUA FRIA", agua_quente: "ÁGUA QUENTE", esgoto: "ESGOTO", pluvial: "ÁGUAS PLUVIAIS", incendio: "INCÊNDIO", industrial: "FLUIDO INDUSTRIAL", gas: "GÁS (GLP)" };
  var SIGLA = { agua_fria: "AF", agua_quente: "AQ", esgoto: "ES", pluvial: "AP", incendio: "IN", industrial: "IND", gas: "GAS" };
  /* a camada de tubo de cada sistema do padrão (a ventilação vai no desenho do esgoto) */
  var CAMADA_SIS = { agua_fria: "AF", agua_quente: "AQ", esgoto: "ES", ventilacao: "VE", pluvial: "AP", incendio: "IN", industrial: "IND", gas: "GAS" };
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";

  /* ------------------------------------------------------------ ESTILO (camadas HID-* sobre o estilo da casa) */
  function estilo() {
    var A = AP(), E = A.estilo(), P = K2.pena;
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor || "#000" }; }
    cam("HID-AF-TUBO", P.AF, K2.cor.AF); cam("HID-AQ-TUBO", P.AQ, K2.cor.AQ); cam("HID-ES-TUBO", P.ES, K2.cor.ES);
    cam("HID-VE-TUBO", P.VE, K2.cor.VE, K2.tracoVE); cam("HID-AP-TUBO", P.AP, K2.cor.AP); cam("HID-IN-TUBO", P.IN, K2.cor.IN); cam("HID-IND-TUBO", P.IND, K2.cor.IND); cam("HID-GAS-TUBO", P.GAS, K2.cor.GAS); cam("HID-IN-COBERTURA", P.fina, K2.cor.IN, K2.tracoVE);
    /* R01 (29/10/2026): a COR, a pena e o traço de cada sistema são os do PADRÃO RA de hidráulica v1.0 (K2.cor / K2.pena acima: ES marrom, VE marrom claro,
       AP verde…). O template de Revit (js/biminstpadraodados.js: ES verde, VE cinza, AP lilás) pintava as pranchas da R00 com as cores trocadas e não manda mais aqui. */
    cam("HID-SIMBOLO", P.simbolo); cam("HID-COTA", P.cota); cam("HID-TEXTO", P.fina); cam("HID-EIXO", P.eixo, "#000", K2.tracoEixo);
    cam("HID-CONTEXTO", P.contexto, "#7f7f7f"); cam("HID-TABELA", P.tabela); cam("HID-TITULO", P.titulo); cam("HID-MOLDURA", P.moldura);
    cam("HID-PEND", P.simbolo, K2.vermelho, "3 1.5");
    /* a CHAMADA (linha do rótulo até o tubo) e o contorno fino da conexão/caixa no nível médio: camadas próprias — a
       conferência de sobreposição olha a COTA de verdade, não a chamada que encosta no próprio texto */
    cam("HID-CHAMADA", P.cota); cam("HID-CONEXAO", P.cota); cam("HID-LOUCA", P.cota, K2.arq.louca);
    /* a tabela e o título de vista da casa usam estes nomes */
    E.camadas["MET-TABELA"] = E.camadas["HID-TABELA"]; E.camadas["MET-TITULO"] = E.camadas["HID-TITULO"]; E.camadas["MET-FINA"] = E.camadas["HID-COTA"];
    return E;
  }

  /* hid:fisica-inicio — diagramação (geometria de desenho em mm, índices de caixa/ponto): nenhum valor de norma; DN, vazão e declividade vêm sempre do RESULTADO */
  /* ------------------------------------------------------------ desenhar as primitivas (isométrico/planta) */
  function desenhar(D, prim, ox, oy, chk) {
    arr(prim.linhas).forEach(function (l) {
      if (chk && l.tipo === "tubo") chk.tubos.push([l.x1 + ox, l.y1 + oy, l.x2 + ox, l.y2 + oy]);
      else if (chk && l.tipo === "cota") chk.cotas.push([l.x1 + ox, l.y1 + oy, l.x2 + ox, l.y2 + oy]);
      if (l.oculto) return;
      D.linha(l.x1 + ox, l.y1 + oy, l.x2 + ox, l.y2 + oy, l.tipo === "chamada" ? "HID-CHAMADA" : l.camada, ' data-trecho="' + esc(l.trecho) + '"');
    });
    arr(prim.simbolos).forEach(function (s) {
      var x = s.x + ox, y = s.y + oy;
      if (s.desenhado && (s.tipo === "caixa" || s.tipo === "prumada")) return;
      if (s.tipo === "joelho" || s.tipo === "ponto" || s.tipo === "balao" || s.tipo === "prumada") D.circ(x, y, s.r, "HID-SIMBOLO");
      else if (s.tipo === "te") D.ponto(x, y, s.r, "#000");
      else if (s.tipo === "caixa") D.ret(x - s.r, y - s.r, 2 * s.r, 2 * s.r, "HID-SIMBOLO");
      else if (s.tipo === "seta" && s.pts) D.cheio(s.pts.map(function (p) { return [p[0] + ox, p[1] + oy]; }), "#000");
    });
    arr(prim.textos).forEach(function (t) { D.texto(t.x + ox, t.y + oy, t.s, t.h, { al: t.al || "C", attr: ' data-rotulo="' + esc(t.tipo) + '"' + (t.tipo === "destaque" ? ' font-style="italic"' : "") }); });   /* R02: a CHAMADA da peça especial em itálico, como na referência */
  }

  /* ------------------------------------------------------------ PLANTA por pavimento e sistema */
  function trechosDoPav(rede, sis, pv) {
    return arr(rede.trechos).filter(function (t) {
      if (!(t.sistema === sis || (sis === "esgoto" && t.sistema === "ventilacao"))) return false;
      /* a faixa do pavimento começa ABAIXO do piso (o ramal de esgoto no rebaixo da laje; no térreo, tudo o que está
         enterrado) e acaba abaixo do piso de cima — pv.base/pv.sup vêm do gerar(); sem eles, a faixa antiga (cota → topo) */
      var lo = Math.min(t.p1.y, t.p2.y), hi = Math.max(t.p1.y, t.p2.y), tol = HI().K.tolPiso_m, b0 = pv.base != null ? pv.base : pv.cota, b1 = pv.sup != null ? pv.sup : pv.topo;
      if (t.vertical) return hi > b0 + tol && lo < b1 - tol;
      var m = (t.p1.y + t.p2.y) / 2;
      return m >= b0 - tol && m < b1 - tol;
    });
  }
  /* UM rótulo por CORRIDA: trechos horizontais ligados ponta a ponta, do mesmo sistema e do mesmo DN (o do cálculo), levam o
     rótulo só no mais longo — antes cada pedaço curto entre duas conexões repetia "ø20" e a planta virava sopa de letras.
     Uma inclinação diferente (esgoto) separa a corrida: o "i=" de cada uma continua escrito. */
  function gruposRotulo(trs, ix, KI) {
    var hz = trs.filter(function (t) { return !t.vertical; }), pai = {}, out = {};
    function dnDe(t) { var inf = (ix[t.sistema] || {})[t.id]; return String(inf && inf.dn != null ? inf.dn : t.dn); }
    /* o trecho com declividade ABAIXO da mínima tem rótulo próprio sempre (é instrução de correção) */
    function corrigir(t) { var inf = (ix[t.sistema] || {})[t.id]; return !!(inf && inf.declividadeMin_pct != null && inf.declividade_pct != null && inf.declividadeMin_pct > inf.declividade_pct); }
    function raiz(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    hz.forEach(function (t) { pai[t.id] = t.id; });
    function perto(p, q) { return Math.abs(p.x - q.x) < KI.tolNo_m && Math.abs(p.z - q.z) < KI.tolNo_m; }
    for (var i = 0; i < hz.length; i++) for (var j = i + 1; j < hz.length; j++) {
      var a = hz[i], b = hz[j];
      if (a.sistema !== b.sistema || dnDe(a) !== dnDe(b)) continue;
      if (perto(a.p1, b.p1) || perto(a.p1, b.p2) || perto(a.p2, b.p1) || perto(a.p2, b.p2)) pai[raiz(a.id)] = raiz(b.id);
    }
    var melhor = {};
    hz.forEach(function (t) { var r = raiz(t.id), L = Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.z - t.p1.z, 2)); if (!melhor[r] || L > melhor[r].L) melhor[r] = { id: t.id, L: L }; });
    Object.keys(melhor).forEach(function (r) { out[melhor[r].id] = true; });
    hz.forEach(function (t) { if (corrigir(t)) out[t.id] = true; });
    return out;
  }
  function plantaPrim(rede, ix, sis, trs, pavs, s, o) {
    o = o || {};
    var H = HI(), KI = H.K, L = [], S = [], T = [], seg = [], pend = [], avisos = [], nomeAp = typeof o.nome === "function" ? o.nome : function (f) { return f; };
    var ids = {}; trs.forEach(function (t) { ids[t.id] = 1; });
    function pp(p) { return [p.x * s, p.z * s]; }
    var tq = ix.tq, rotular = gruposRotulo(trs, ix, KI), cols = o.colunas || {};
    arr(o.segExtra).forEach(function (q) { seg.push(q); });
    arr(o.obstaculos).forEach(function (b, i) { S.push({ tipo: "obst", x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, r: 0, camada: "HID-SIMBOLO", box: b, id: "obst" + i, desenhado: true }); });
    trs.forEach(function (t) {
      var sg = H.SIGLA_SISTEMA[t.sistema] || "AF", inf = (ix[t.sistema] || {})[t.id], a = pp(t.p1), b = pp(t.p2);
      /* revisão F7 A4/M7 (também na planta): DN sem cálculo marcado; declividade reprovada mostra a mínima */
      var semCalc = !inf || inf.dn == null || inf.status === "pendente";
      /* PADRÃO DE APRESENTAÇÃO: o DN no formato do rótulo de tubo do padrão ("ø100"); a inclinação segue abaixo, com a conferência do cálculo */
      var PDr = PAD(), dn = inf && inf.dn != null ? inf.dn : t.dn, partes = [dnRotulo(t, inf, true)];
      void semCalc; void PDr; void dn;
      if ((t.sistema === "esgoto" || t.sistema === "pluvial") && !t.vertical && inf && inf.declividade_pct != null) {
        if (inf.declividadeMin_pct != null && inf.declividadeMin_pct > inf.declividade_pct) partes.push("i ≥ " + br(inf.declividadeMin_pct, 1) + "% (modelo " + br(inf.declividade_pct, 1) + "%: corrigir)");
        else partes.push("i=" + br(inf.declividade_pct, 1) + "%");
      }
      if (!inf) avisos.push("Trecho " + t.id + ": sem resultado de cálculo; DN do modelo na planta.");
      if (t.vertical) {
        var nome = tq[t.id] || (cols[t.id] ? cols[t.id].nome : "");
        /* no MÉDIO a prumada é o círculo do DE (formasPlanta); a subida/descida curta até um ponto não leva rótulo na planta
           (a altura e o DN dela estão no isométrico e no corte da parede) — só a coluna AF-n e o tubo de queda TQ-n */
        S.push({ tipo: "prumada", x: a[0], y: a[1], r: K2.rPrumada, camada: "HID-SIMBOLO", box: [a[0] - K2.rPrumada, a[1] - K2.rPrumada, a[0] + K2.rPrumada, a[1] + K2.rPrumada], id: t.id, desenhado: !!o.medio });
        if (o.medio && !nome) return;
        pend.push({ s: (nome ? nome + "  " : "") + partes.join("  "), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: [a], prio: 2, d0: K2.rPrumada + 0.6 });
        return;
      }
      /* no nível MÉDIO o tubo é o polígono cheio (formasPlanta); a linha fica só como obstáculo dos rótulos */
      L.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], camada: "HID-" + sg + "-TUBO", tipo: "tubo", trecho: t.id, oculto: !!o.medio });
      seg.push([a[0], a[1], b[0], b[1]]);
      var an = KI.ancoras.map(function (f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; });
      var d0b = o.medio && typeof o.deTubo === "function" ? o.deTubo(t) / 1000 * s / 2 + K2.folgaRotulo : null;   /* a folga começa na borda do tubo cheio */
      if (rotular[t.id]) pend.push({ s: partes.join("  "), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: an, prio: 3, chamadaMin: o.medio ? K2.chamadaPlanta : null, d0: d0b, comprimento: Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) });
      if (t.sistema === "esgoto" || t.sistema === "pluvial") {
        var dx = b[0] - a[0], dy = b[1] - a[1], Ld = Math.sqrt(dx * dx + dy * dy);
        if (Ld >= 2 * KI.arrComp) {
          var ux = dx / Ld, uy = dy / Ld, cx = a[0] + dx * KI.arrPos, cy = a[1] + dy * KI.arrPos, h2 = KI.arrComp / 2, nx = -uy * KI.arrLarg, ny = ux * KI.arrLarg;
          S.push({ tipo: "seta", x: cx, y: cy, r: h2, camada: "HID-SIMBOLO", naLinha: true, id: t.id, box: [cx - h2, cy - h2, cx + h2, cy + h2],
                   pts: [[cx + ux * h2, cy + uy * h2], [cx - ux * h2 + nx, cy - uy * h2 + ny], [cx - ux * h2 - nx, cy - uy * h2 - ny]] });
        }
      }
    });
    var jaLig = {};
    arr(rede.ligacoes).forEach(function (l) {
      if (!ids[l.trecho] || jaLig[l.alvo] || l.tipo === "acessorio") return; jaLig[l.alvo] = 1;
      var p = pp(l), q = l.tipo === "peca" ? KI.caixaL / 2 : KI.rPonto;
      /* no MÉDIO a caixa/ralo é a forma da peça (quadrado branco com a grade): o símbolo fica só como obstáculo */
      S.push({ tipo: l.tipo === "peca" ? "caixa" : "ponto", x: p[0], y: p[1], r: q, camada: "HID-SIMBOLO", box: [p[0] - q, p[1] - q, p[0] + q, p[1] + q], id: l.alvo, desenhado: !!(o.medio && l.tipo === "peca") });
      var nm = l.tipo === "peca" ? rotuloPecaPlanta(rede, l.alvo) : nomeAp(l.famInst || l.alvo);
      if (nm && typeof o.textoPonto === "function") nm = o.textoPonto(l, nm);   /* R01: o caderno põe a ALTURA de cada ponto no rótulo */
      if (nm) pend.push({ s: txt(nm), h: KI.hPeq, tipo: "aparelho", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0 });
    });
    arr(rede.acessorios).forEach(function (a) {
      if (!(ids[a.trecho] || ids[a.novoId])) return;
      var c = pp(a.centro), r = KI.regC / 2;
      L.push({ x1: c[0] - r, y1: c[1] - r, x2: c[0] + r, y2: c[1] + r, camada: "HID-SIMBOLO", tipo: "registro", trecho: a.id });
      L.push({ x1: c[0] - r, y1: c[1] + r, x2: c[0] + r, y2: c[1] - r, camada: "HID-SIMBOLO", tipo: "registro", trecho: a.id });
      S.push({ tipo: "registro", x: c[0], y: c[1], r: r, camada: "HID-SIMBOLO", box: [c[0] - r, c[1] - r, c[0] + r, c[1] + r], id: a.id, desenhado: true });
      pend.push({ s: txt(({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[a.acessorio] || "RG") + " DN " + a.dn, h: KI.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: a.id, anchors: [c], prio: 1 });
    });
    /* HIDRO-3D: a planta como VISTA do sistema (js/hidvistaiso.js): o desenho é a malha do modelo; aqui só saem as ANOTAÇÕES (rótulos, setas) sem posição, para a vista compor */
    if (o.devolverPend) return { pend: pend, seg: seg, simbolos: S, linhas: L, textos: [], avisos: avisos, trechos: trs.map(function (t) { return t.id; }) };
    H.afastar(pend, S, L, T, seg, avisos);
    return { linhas: L, simbolos: S, textos: T, avisos: avisos, trechos: trs.map(function (t) { return t.id; }) };
  }
  function bbox(prim) {
    var xs = [], ys = [];
    arr(prim.linhas).forEach(function (l) { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); });
    arr(prim.simbolos).forEach(function (s) { xs.push(s.box[0], s.box[2]); ys.push(s.box[1], s.box[3]); });
    arr(prim.textos).forEach(function (t) { xs.push(t.box[0], t.box[2]); ys.push(t.box[1], t.box[3]); });
    return xs.length ? { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) } : null;
  }

  /* ------------------------------------------------------------ LOUÇA REAL (rodada 2, 18/10/2026: "a bacia e o lavatório viraram caixas")
   * As linhas de uma família vistas de uma direção: a SILHUETA (aresta entre face de frente e face de costas) e os VINCOS
   * (aresta entre duas faces de frente com ângulo acima de K2.vinco) da malha REAL do js/hidlouca.js (o mesmo sólido que o 3D
   * desenha; nível de detalhe médio da malha). É como a louça se lê na planta (bacia oval, cuba do lavatório) e em meio-tom na
   * perspectiva. viewer = direção da cena para quem olha (planta: [0, 1, 0]). Caixa e cilindro: as arestas deles. */
  function linhasFamilia(fi, av, viewer) {
    var out = [], co = Math.cos(fi.rotY || 0), si = Math.sin(fi.rotY || 0), cv = Math.cos(K2.vinco * Math.PI / 180);   // hid:ok graus → radianos
    function W(x, y, z) { return [fi.x + x * co + z * si, fi.y + y, fi.z - x * si + z * co]; }
    function malha(v, f, ox, oy, oz) {
      var P = [], chave = {}, ids = [], i;
      for (i = 0; i + 2 < v.length; i += 3) {
        var p = W(v[i] + ox, v[i + 1] + oy, v[i + 2] + oz), k = Math.round(p[0] * K2.quant) + "," + Math.round(p[1] * K2.quant) + "," + Math.round(p[2] * K2.quant);
        if (chave[k] == null) { chave[k] = P.length; P.push(p); }
        ids.push(chave[k]);
      }
      var arestas = {};
      for (i = 0; i + 2 < f.length; i += 3) {
        var a = ids[f[i]], b = ids[f[i + 1]], c = ids[f[i + 2]]; if (a === b || b === c || a === c) continue;
        var A = P[a], B = P[b], C = P[c], u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        var nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0], L = Math.sqrt(nx * nx + ny * ny + nz * nz); if (!(L > 1e-12)) continue;
        var nn = [nx / L, ny / L, nz / L], frente = nn[0] * viewer[0] + nn[1] * viewer[1] + nn[2] * viewer[2] > 0;
        [[a, b], [b, c], [c, a]].forEach(function (e) { var kk = e[0] < e[1] ? e[0] + "|" + e[1] : e[1] + "|" + e[0]; (arestas[kk] = arestas[kk] || { e: e, fs: [] }).fs.push({ n: nn, fr: frente }); });
      }
      Object.keys(arestas).forEach(function (kk) {
        var r = arestas[kk], fs = r.fs, vale = false;
        if (fs.length === 1) vale = fs[0].fr;
        else if (fs.length >= 2) vale = fs[0].fr !== fs[1].fr || (fs[0].fr && fs[1].fr && fs[0].n[0] * fs[1].n[0] + fs[0].n[1] * fs[1].n[1] + fs[0].n[2] * fs[1].n[2] < cv);
        if (vale) out.push([P[r.e[0]], P[r.e[1]]]);
      });
    }
    arr(av && av.solidos).forEach(function (s) {
      if (s.forma === "malha") { var g = s.lod && s.lod[1] && arr(s.lod[1].f).length ? s.lod[1] : s; malha(g.v, g.f, s.x || 0, s.y || 0, s.z || 0); }
      else if (s.forma === "caixa") {
        var r = (s.rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), hx = s.dx / 2, hz = s.dz / 2, q = [];   // hid:ok graus → radianos
        [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(function (p) { q.push([s.x + p[0] * cr + p[1] * sr, s.z - p[0] * sr + p[1] * cr]); });
        for (var i = 0; i < 4; i++) { var A = q[i], B = q[(i + 1) % 4]; out.push([W(A[0], s.y, A[1]), W(B[0], s.y, B[1])]); out.push([W(A[0], s.y + s.dy, A[1]), W(B[0], s.y + s.dy, B[1])]); out.push([W(A[0], s.y, A[1]), W(A[0], s.y + s.dy, A[1])]); }
      }
      else if (s.forma === "cilindro" && s.raio > 0) {
        var N = K2.ladosCirc, eixo = s.eixo || "y", h = s.altura || 0;
        for (var j = 0; j < N; j++) {
          var t0 = j / N * Math.PI * 2, t1 = (j + 1) / N * Math.PI * 2;
          [0, h].forEach(function (d) {
            function pt(t) { var c1 = Math.cos(t) * s.raio, c2 = Math.sin(t) * s.raio; return eixo === "x" ? W(s.x + d, s.y + c1, s.z + c2) : eixo === "z" ? W(s.x + c1, s.y + c2, s.z + d) : W(s.x + c1, s.y + d - h / 2, s.z + c2); }
            out.push([pt(t0), pt(t1)]);
          });
        }
      }
    });
    return out;
  }
  /* as linhas de todas as famílias (louças, metais, equipamentos) do pavimento numa caixa do plano */
  function linhasLoucas(estado, aval, viewer, filtro) {
    var out = [];
    if (typeof aval !== "function") return out;
    arr(estado && estado.familias).forEach(function (fi) {
      if (filtro && !filtro(fi)) return;
      var av = null; try { av = aval(fi.famId, fi.tipoId, fi.inst || {}); } catch (e) { av = null; }
      if (!av || !av.ok) return;
      linhasFamilia(fi, av, viewer).forEach(function (sg) { out.push(sg); });
    });
    return out;
  }

  /* ------------------------------------------------------------ VISTAS AGRUPADAS NA FOLHA (rodada 2: "a planta ocupa 10 % da folha")
   * Cada planta e cada corte de parede viram uma VISTA com tamanho em papel e um desenhar(D, x, y). As vistas do pavimento são
   * EMPACOTADAS em prateleiras (planta de AF e de ES lado a lado; planta + cortes) e o bloco fica centrado na área útil; a escala
   * das plantas é a MAIOR da lista usual que cabe (a mesma para todas as plantas do pavimento). */
  function extensaoPlanta(c, trs, pv) {
    var xs = [], zs = [], cc = vistaCtx(c, trs, pv, null);
    trs.forEach(function (t) { xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); });
    var ctx = c.cfg && c.cfg.arquitetura === false ? { paredes: [], loucas: [] } : contextoPlanta(cc, xs, zs);
    ctx.paredes.forEach(function (w) { w.pts.forEach(function (q) { xs.push(q[0]); zs.push(q[1]); }); });
    return { W: Math.max.apply(null, xs) - Math.min.apply(null, xs), H: Math.max.apply(null, zs) - Math.min.apply(null, zs), ctx: ctx, xs: xs, zs: zs };
  }
  function vistaCtx(c, trs, pv, sis) { var o = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) o[k] = c[k]; o.trs = trs; o.pv = pv; if (sis) o.sis = sis; return o; }
  function prepPlanta(c, sis, trs, pv, esc, titulo) {
    var cc = vistaCtx(c, trs, pv, sis), ex = extensaoPlanta(c, trs, pv), s2 = 1000 / esc, medio = !c.cfg || c.cfg.nivelPlanta !== "baixo";
    var fm = medio ? formasDe(cc, trs) : null;
    var pr = plantaPrim(c.rede, c.ix, sis, trs, c.pavs, s2, { medio: medio, nome: c.nomeAp, colunas: c.colunas, obstaculos: obstaculosFormas(fm, s2).concat(ex.ctx.arq ? fundoArquitetura(ex.ctx.c, ex.ctx.arq, s2, 0, 0, bordasTubo(fm, s2, 0, 0)).caixas : []), segExtra: bordasTubo(fm, s2, 0, 0), deTubo: deTubo });
    arr(pr.avisos).forEach(function (m) { c.avisos.push(m); });
    var bb = bbox(pr), xs = ex.xs, zs = ex.zs;
    bb = { x0: Math.min(bb.x0, Math.min.apply(null, xs) * s2), y0: Math.min(bb.y0, Math.min.apply(null, zs) * s2), x1: Math.max(bb.x1, Math.max.apply(null, xs) * s2), y1: Math.max(bb.y1, Math.max.apply(null, zs) * s2) };
    var tit = titulo, sub = "ESC 1:" + esc + (medio ? " - nível de detalhe MÉDIO" : "");
    return { tipo: "planta", titulo: tit, escala: esc, w: Math.max(bb.x1 - bb.x0, c.AP.largTexto ? c.AP.largTexto(tit, D0().E.T.titulo) : 0) + K2.folgaVista * 2, h: bb.y1 - bb.y0 + K2.titulo + K2.folgaVista,
      desenhar: function (D, x, y, chk) {
        var ox = x + K2.folgaVista - bb.x0, oy = y + K2.titulo - bb.y0;
        c.AP.tituloVista(D, x + K2.folgaVista, y, tit, sub);
        desenharContexto(D, ex.ctx, s2, ox, oy, medio ? bordasTubo(fm, s2, ox, oy) : []);
        if (sis === "gas") rotulosGas(D, c, pv, s2, ox, oy, chk);
        if (medio) { formasPlanta(D, cc, trs, s2, ox, oy, fm); bordasTubo(fm, s2, ox, oy).forEach(function (q) { chk.tubos.push(q); }); }
        desenhar(D, pr, ox, oy, chk);
        c.prims.push(pr);
      } };
  }
  /* R02: na planta de GÁS aparecem o ABRIGO (contorno da família ra-gas-abrigo + legenda "ABRIGO GLP 2 x P13") e o PONTO do cooktop (cota e DN) — na R01 só o fio de cobre saía */
  function rotulosGas(D, c, pv, s, ox, oy, chk) {
    var est = c.modelo && c.modelo.estado, ab = null;
    arr(est && est.familias).forEach(function (f) { if (/^ra-gas-abrigo/.test(txt(f.famId))) ab = f; });
    var trs = arr(c.rede && c.rede.trechos).filter(function (t) { return t.sistema === "gas"; });
    if (!trs.length) { D.texto(ox + 5, oy + 5, "REDE DE GÁS NÃO TRAÇADA NO MODELO - PENDÊNCIA", 3, { cor: K2.vermelho }); return; }
    if (ab) {
      try {
        linhasLoucas(est, c.modelo.avaliarFam, [0, 1, 0], function (fi) { return fi.id === ab.id; }).forEach(function (sg) { D.linha(sg[0][0] * s + ox, sg[0][2] * s + oy, sg[1][0] * s + ox, sg[1][2] * s + oy, "HID-GAS-TUBO"); });
      } catch (e) { c.avisos.push("Abrigo de gás: contorno não desenhado (" + (e && e.message) + ")."); }
      D.texto(ab.x * s + ox + 9, ab.z * s + oy - 4, "ABRIGO GLP (2 x P13)", 2.3, { cor: K2.cor.GAS, peso: 0.2 });
    }
    var fim = null; trs.forEach(function (t) { [t.p1, t.p2].forEach(function (q) { if (!fim || q.y > fim.y) fim = q; }); });
    if (fim) D.texto(fim.x * s + ox + 4, fim.z * s + oy + 5, "PONTO DO COOKTOP +" + br(fim.y - pv.cota, 2) + " - cobre ø15 embutido", 2.1, { cor: K2.cor.GAS });
  }
  var _D0 = null;
  function D0() { if (!_D0) _D0 = new (AP().Desenho)(estilo(), null); return _D0; }
  /* o DE do tubo (mm) pelo catálogo de geometria: a folga do rótulo começa na BORDA do tubo cheio, não no eixo */
  function deTubo(t) { var G = GEO(), k = null; try { k = G ? G.cotasTubo(t.material, t.dn) : null; } catch (e) { k = null; } return k && k.de > 0 ? k.de : +t.dn || 0; }
  function prepCorte(c, ph, a) {
    var esc = null, j, pv = ph.pv;
    for (j = 0; j < K2.escalasCorte.length && !esc; j++) {
      var s0 = 1000 / K2.escalasCorte[j], ww = ph.w.L * s0 + K2.folgaCorte * 2, hh = (Math.min(ph.w.y1, pv.topo) - pv.cota + K2.cortePiso) * s0 + K2.folgaCorte * 3 + K2.titulo;
      if (ww <= a.w * K2.corteFracW && hh <= a.h * K2.corteFracH) esc = K2.escalasCorte[j];
    }
    ph.escala = esc || K2.escalasCorte[K2.escalasCorte.length - 1];
    var d = desenhoCorte(c, ph, 1000 / ph.escala), bb = bbox(d), KI = HI().K;
    var tit = "PAREDE HIDRÁULICA " + ph.n + " - " + ph.nome;
    return { tipo: "corte", titulo: tit, escala: ph.escala, w: Math.max(bb.x1 - bb.x0, c.AP.largTexto(tit + "  (ESC 1:" + ph.escala + ")", KI.h)) + K2.folgaVista * 2, h: bb.y1 - bb.y0 + K2.titulo + K2.folgaCorte * 2,
      desenhar: function (D, x, y, chk) {
        var ox = x + K2.folgaVista - bb.x0, oy = y + K2.titulo - bb.y0;
        D.texto(x + K2.folgaVista, y + KI.h, tit + "  (ESC 1:" + ph.escala + ")", KI.h, { peso: 0.16, attr: ' data-titulo-corte="1"' });
        desenhar(D, d, ox, oy, chk);
        /* a cadeia de cotas não tem trecho de menos de 4 mm de papel (7 cm a 1:25): o número não cabe entre as chamadas e saía em cima de uma cota
           (rótulo × cota na parede hidráulica 15 do projeto exemplo, 25/10/2026) — o ponto que cai tão perto do anterior fica de fora da cadeia */
        var cxs = d.cotaXs.filter(function (xx, i, A) { return i === 0 || xx - A[i - 1] >= 4 || i === A.length - 1; });
        if (cxs.length > 2) {
          var P = cxs.map(function (xx) { return [xx + ox, d.yFundo + oy + K2.folgaCorte / 2]; }), vals = [];
          for (var i = 0; i + 1 < cxs.length; i++) vals.push(String(Math.round((cxs[i + 1] - cxs[i]) / (1000 / ph.escala) * 100)));   // hid:ok m → cm (cota de comprimento)
          var nSg = D.sg.length; D.cadeia(P, 0, vals, {});
          for (var q = nSg; q < D.sg.length; q++) chk.cotas.push(D.sg[q]);
        }
        arr(d.avisos).forEach(function (m) { c.avisos.push(m); });
        c.prims.push(d);
      } };
  }
  /* a escala das plantas do pavimento: a fixa se couber; senão a MAIOR da lista que cabe para todas */
  function escalaDoPav(c, exts) {
    var a = c.geo.area, fixa = num(c.cfg && c.cfg.escala, null), folga = K2.folgaVista * 2 + K2.folgaRotulos;
    function cabe(e) { var s = 1000 / e; return exts.every(function (x) { return x.W * s + folga <= a.w && x.H * s + folga + K2.titulo <= a.h; }); }
    if (fixa && cabe(fixa)) return fixa;
    for (var i = 0; i < K2.escalas.length; i++) if (cabe(K2.escalas[i])) {
      if (fixa) c.avisos.push("Não coube na 1:" + fixa + " escolhida; saiu na 1:" + K2.escalas[i] + " (a maior que cabe sem cortar).");
      return K2.escalas[i];
    }
    c.avisos.push("A rede não cabe nem na menor escala (1:" + K2.escalas[K2.escalas.length - 1] + ") — dividir por ambiente ou usar folha maior.");
    return K2.escalas[K2.escalas.length - 1];
  }
  /* prateleiras: a vista vai à direita da anterior se couber; senão, linha nova; folha nova quando acaba a altura */
  function empacotar(itens, a, agrupar) {
    /* PRIMEIRA QUE CABE: cada vista tenta as folhas já abertas (à direita na linha atual ou numa linha nova embaixo) antes de
       abrir outra — o corte que sobra entra ao lado da planta de água fria em vez de ficar sozinho numa folha */
    var folhas = [];
    function cabeEm(f, it) {
      if (f.x + it.w <= a.w && f.y + it.h <= a.h) return { x: f.x, y: f.y, nova: false };
      var y2 = f.y + f.hl + K2.entreVistas;
      if (it.w <= a.w && y2 + it.h <= a.h) return { x: 0, y: y2, nova: true };
      return null;
    }
    itens.forEach(function (it) {
      var f = null, pos = null;
      if (agrupar !== false) for (var i = 0; i < folhas.length && !pos; i++) { pos = cabeEm(folhas[i], it); if (pos) f = folhas[i]; }
      if (!pos) { f = { itens: [], x: 0, y: 0, hl: 0 }; folhas.push(f); pos = { x: 0, y: 0, nova: false }; }
      if (pos.nova) { f.y = pos.y; f.x = 0; f.hl = 0; }
      it.px = pos.x; it.py = pos.y; it.linha = pos.y; f.itens.push(it);
      f.x = pos.x + it.w + K2.entreVistas; f.hl = Math.max(f.hl, it.h);
    });
    /* o bloco de cada folha centrado na área útil; cada linha centrada na largura */
    folhas.forEach(function (fl) {
      var linhas = {}, alt = 0;
      fl.itens.forEach(function (it) { (linhas[it.linha] = linhas[it.linha] || []).push(it); alt = Math.max(alt, it.py + it.h); });
      Object.keys(linhas).forEach(function (k) { var l = linhas[k], larg0 = l[l.length - 1].px + l[l.length - 1].w, dx = (a.w - larg0) / 2; l.forEach(function (it) { it.px += dx; }); });
      var dy = (a.h - alt) / 2; fl.itens.forEach(function (it) { it.py += dy; });
      fl.ocupacao = fl.itens.reduce(function (s0, it) { return s0 + it.w * it.h; }, 0) / (a.w * a.h);
    });
    return folhas;
  }
  function folhaVistas(c) {
    var D = c.D, a = c.geo.area, escs = {};
    arr(c.vistas).forEach(function (it) { escs["1:" + it.escala] = 1; it.desenhar(D, a.x + it.px, a.y + it.py, c.chk); });
    return { escala: Object.keys(escs).join(" / ") || "INDICADA" };
  }

  /* ------------------------------------------------------------ ARQUITETURA EM MEIO-TOM (contexto da planta e do corte) */
  /* a parede no plano (x, z): os 4 cantos da caixa do BimEdit (cx, cz, comprimento, espessura, rotY) */
  function paredePlanta(w) {
    var co = Math.cos(w.rotY || 0), si = Math.sin(w.rotY || 0), ux = co, uz = -si, nx = si, nz = co, hl = w.comprimento / 2, he = w.espessura / 2;
    return { c: [w.cx, w.cz], u: [ux, uz], n: [nx, nz], L: w.comprimento, esp: w.espessura, y0: w.cy - w.altura / 2, y1: w.cy + w.altura / 2, id: w.id,
             pts: [[w.cx - ux * hl - nx * he, w.cz - uz * hl - nz * he], [w.cx + ux * hl - nx * he, w.cz + uz * hl - nz * he],
                   [w.cx + ux * hl + nx * he, w.cz + uz * hl + nz * he], [w.cx - ux * hl + nx * he, w.cz - uz * hl + nz * he]] };
  }
  function paredesDoPav(estado, pv) {
    return arr(estado && estado.caixas).filter(function (w) { return w && w.tipo === "parede" && w.comprimento > 0 && w.espessura > 0 && w.altura > 0; })
      .map(paredePlanta).filter(function (w) { return !pv || (w.y1 > pv.cota + HI().K.tolPiso_m && w.y0 < pv.topo - HI().K.tolPiso_m); });
  }
  /* as paredes perto da rede (até 1 m da caixa dos trechos) e as louças do pavimento */
  function contextoPlanta(c, xs, zs) {
    var pv0 = c.pv || c.pavs[0], La = c.cfg && c.cfg.fundoArq === false ? null : listasArq(c, pv0);
    if (La && La.edif.length) {
      /* a extensão é a do pavimento inteiro (paredes da edificação + pilares), não a do tubo */
      var ps = La.edif.concat(La.pilares), px = [], pz = [];
      ps.forEach(function (w) { arr(w.pts).forEach(function (q) { px.push(q[0]); pz.push(q[1]); }); });
      var loucas0 = [];
      try { loucas0 = linhasLoucas(c.modelo.estado, c.modelo.avaliarFam, [0, 1, 0], function (fi) { return APARELHO_RE.test(txt(fi.famId)) && fi.y >= pv0.cota - HI().K.tolPiso_m - K2.cortePiso && fi.y < pv0.topo; }); } catch (e0) { loucas0 = []; }
      return { paredes: [{ pts: [[Math.min.apply(null, px), Math.min.apply(null, pz)], [Math.max.apply(null, px), Math.max.apply(null, pz)]] }], loucas: loucas0, arq: La, c: c };
    }
    var est = c.modelo && c.modelo.estado, pv = c.pv || c.pavs[0], m = K2.ambFolga;
    var x0 = Math.min.apply(null, xs) - m, x1 = Math.max.apply(null, xs) + m, z0 = Math.min.apply(null, zs) - m, z1 = Math.max.apply(null, zs) + m;
    /* o CÔMODO inteiro: a caixa cresce até os ambientes que a rede toca (a parede da frente do banheiro, longe dos tubos, entra) */
    arr(c.ambientes).forEach(function (am) { if (am.x1 >= x0 && am.x0 <= x1 && am.z1 >= z0 && am.z0 <= z1) { x0 = Math.min(x0, am.x0); x1 = Math.max(x1, am.x1); z0 = Math.min(z0, am.z0); z1 = Math.max(z1, am.z1); } });
    var paredes = paredesDoPav(est, pv).filter(function (w) { return w.pts.some(function (q) { return q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1; }) || !!recortaEixo(w, { x0: x0, x1: x1, z0: z0, z1: z1 }); });
    /* as louças, metais e equipamentos pelo CONTORNO REAL de planta (silhueta e vincos da malha vista de cima) */
    var loucas = [];
    try {
      loucas = linhasLoucas(est, c.modelo.avaliarFam, [0, 1, 0], function (fi) { return fi.y >= pv.cota - HI().K.tolPiso_m - K2.cortePiso && fi.y < pv.topo && fi.x >= x0 && fi.x <= x1 && fi.z >= z0 && fi.z <= z1; });
    } catch (e) { loucas = []; }
    return { paredes: paredes, loucas: loucas };
  }
  function poliCheio(D, pts, fill, cor, mm, cam) {
    D.traco(pts, true);
    D.add('<polygon points="' + pts.map(function (q) { return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="' + fill + '"' + (cor ? ' stroke="' + cor + '" stroke-width="' + n(mm) + '" stroke-linejoin="round"' : ' stroke="none"') + (cam ? ' data-cam="' + cam + '"' : "") + "/>");
  }
  /* a camada (layer) vai no SVG (data-cam): o DXF sai com os nomes do padrão (HID-AF-TUBO…), não por palpite da cor */
  function marcarCamadas(D) {
    var base = D.estilo;
    /* ⚠ 25/10/2026: o estilo de base (js/acopranchas.js) JÁ põe data-cam nas camadas MET-* (as cotas usam MET-COTA): somar o nosso repetia o atributo e o SVG
       da folha ficava INVÁLIDO ("Attribute data-cam redefined") — o navegador parava de desenhar a folha na primeira cota (as plantas e os cortes do hidro,
       achado ao pôr as pranchas do projeto exemplo nas abas; a mesma falha das pranchas de arquitetura). Só põe quando a base não pôs. */
    D.estilo = function (cam, extra) { var s = base.call(this, cam, extra); return / data-cam="/.test(s) ? s : s + ' data-cam="' + esc(cam) + '"'; };
    return D;
  }
  /* ------------------------------------------------------------ R01: FUNDO = a planta de arquitetura COMPLETA em meio-tom
   * Pedido do Rogério (29/10/2026): "a arquitetura mostrar a arquitetura, com fundo transparente, como se eu tivesse pegado de um PDF; nela tem que ter tudo".
   * Em vez das paredes próximas do tubo (picotadas) e das silhuetas soltas, o fundo é o MESMO desenho de planta das pranchas de arquitetura
   * (js/arqdesenho.js: paredes inteiras, esquadrias com o arco, móveis e louças, nome e área de cada ambiente) passado para cinza. Padrão: PADRAO-HIDRO.md §3.
   * A extensão da planta é a do PAVIMENTO inteiro (a planta de gás da R00 saía só com a janela do tubo). */
  function ARQM() { return dep("ArqModelo", "./arqmodelo.js"); }
  function ARQD() { return dep("ArqDesenho", "./arqdesenho.js"); }
  K2.fundo = { parede: "#6e6e6e", paredeMm: 0.25, preench: "#e0e0e0", movel: "#a6a6a6", vao: "#8c8c8c", texto: "#7a7a7a", leve: "#b4b4b4" };
  function cinzaDe(hex) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, "$1$1") : m[1], r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var L = (0.3 * r + 0.59 * g + 0.11 * b) / 255, v = Math.round(110 + L * 100);   /* preto → #6e6e6e, branco → fica branco */
    if (L > 0.97) return "#ffffff"; v = Math.min(235, v); var x = ("0" + v.toString(16)).slice(-2); return "#" + x + x + x;
  }
  function dadosArq(c) {
    var mo = c.modelo; if (!mo || !ARQM()) return null;
    var chave = JSON.stringify((c.pavs || []).map(function (p) { return [p.nome, p.cota]; }));
    if (mo._hidArqChave !== chave) {
      mo._hidArqChave = chave; mo._hidArq = null;
      try { mo._hidArq = ARQM().extrair({ estado: mo.estado, avaliarFam: mo.avaliarFam }, { pavimentos: (c.pavs || []).map(function (p) { return { nome: p.nome, cota: p.cota }; }) }); } catch (e) { mo._hidArq = null; }
    }
    return mo._hidArq;
  }
  /* o que a planta de arquitetura do pavimento tem (sem demolido): paredes, pilares, vãos, móveis, ambientes */
  function listasArq(c, pv) {
    var d = dadosArq(c); if (!d) return null;
    var ip = 0; arr(d.pavimentos).forEach(function (p, i) { if (p.nome === pv.nome) ip = i; });
    function ok(x) { return x && x.status !== "demolido" && x.pav === ip; }
    var paredes = arr(d.paredes).filter(ok), edif = paredes.filter(function (w) { return !w.muro; });
    return { dados: d, paredes: paredes, edif: edif, pilares: arr(d.pilares).filter(ok), vaos: arr(d.vaos).filter(ok), moveis: arr(d.moveis).filter(function (m) { return ok(m) && !APARELHO_RE.test(txt(m.famId)); }), ambientes: arr(d.ambientes).filter(ok) };   /* as louças e metais hidráulicos saem pelo CONTORNO REAL da malha (linhasLoucas), não pela caixa do móvel */
  }
  /* desenha o fundo num SVG (string) para o mapa (x, z) → [x * s + ox, z * s + oy]; devolve também as caixas dos textos (obstáculo dos rótulos do hidro) */
  var _estiloArq = null;
  function estiloArqCinza() {
    if (_estiloArq) return _estiloArq;
    var E = ARQD().estilo(), F = K2.fundo;
    Object.keys(E.camadas).forEach(function (k) { var cm = E.camadas[k]; if (/^ARQ-/.test(k)) E.camadas[k] = { mm: cm.mm, dash: cm.dash, cor: cinzaDe(cm.cor) }; });
    E.camadas["ARQ-CONTEXTO"] = { mm: F.paredeMm, dash: null, cor: F.parede };
    E.camadas["ARQ-MOVEL"] = { mm: 0.05, dash: null, cor: F.movel }; E.camadas["ARQ-LOUCA"] = { mm: 0.07, dash: null, cor: F.movel };
    E.camadas["ARQ-VAO"] = { mm: 0.09, dash: null, cor: F.vao }; E.camadas["ARQ-BATENTE"] = { mm: 0.13, dash: null, cor: F.vao }; E.camadas["ARQ-ARCO"] = { mm: 0.05, dash: null, cor: F.leve };
    _estiloArq = E; return E;
  }
  function fundoArquitetura(c, L, s, ox, oy, segs) {
    var d = ARQD(), E = estiloArqCinza(), D2 = d.novo(E, true), M = d.mapa([0, 0, 1, 1], ox, oy, s), porId = {};
    L.paredes.forEach(function (w) { porId[w.id] = w; });
    d.paredesPlanta(D2, M, L.paredes, "fantasma");
    d.pilaresPlanta(D2, M, L.pilares, "fantasma");
    d.moveisPlanta(D2, M, L.moveis);
    d.vaosPlanta(D2, M, L.vaos, porId, "layout");
    /* os TUBOS do hidro entram como obstáculo: o nome do ambiente procura um lugar livre (não cai em cima do tubo) */
    arr(segs).forEach(function (q) { D2.sg.push(q); D2.sgc[D2.sg.length - 1] = "ARQ-SIMBOLO"; });
    d.rotulosAmbientes(D2, M, L.ambientes, { completo: false });
    var F = K2.fundo;
    var svg = D2.svg().replace(/(stroke|fill)="(#[0-9a-fA-F]{3,6})"/g, function (m0, a, h) {
      if (a === "fill" && /^#?(ececec|fff|ffffff)$/i.test(h.replace("#", ""))) return a + '="' + (/^#?(ececec)$/i.test(h.replace("#", "")) ? F.preench : "#ffffff") + '"';
      if (a === "fill" && /^#(1f1f1f|000|000000)$/i.test(h)) return a + '="' + F.preench + '"';
      return a + '="' + cinzaDe(h) + '"';
    }).replace(/data-cam="ARQ-/g, 'data-cam="HID-ARQ-');
    return { svg: '<g data-fundo-arq="1">' + svg + "</g>", caixas: arr(D2.tb), textos: arr(D2.caixas) };
  }
  function desenharContexto(D, ctx, s, ox, oy, segs) {
    if (ctx.arq) {
      var fa = fundoArquitetura(ctx.c, ctx.arq, s, ox, oy, segs); D.add(fa.svg);
      if (D.caixas) fa.textos.forEach(function (b) { D.caixas.push(b); });   /* os nomes dos ambientes entram na conferência de sobreposição */
      ctx.loucas.forEach(function (sg) { D.linha(sg[0][0] * s + ox, sg[0][2] * s + oy, sg[1][0] * s + ox, sg[1][2] * s + oy, "HID-LOUCA"); });
      return;
    }
    function P(q) { return [q[0] * s + ox, q[1] * s + oy]; }
    ctx.paredes.forEach(function (w) { poliCheio(D, w.pts.map(P), K2.arq.preench, null, 0, "HID-CONTEXTO"); });
    ctx.paredes.forEach(function (w) { var p = w.pts.map(P); D.poli(p, "HID-CONTEXTO", true); });
    ctx.loucas.forEach(function (sg) { D.linha(sg[0][0] * s + ox, sg[0][2] * s + oy, sg[1][0] * s + ox, sg[1][2] * s + oy, "HID-LOUCA"); });
  }
  /* o nível MÉDIO do padrão na prancha: tubo CHEIO na cor do sistema (DE real, entrando na bolsa), conexão BRANCA com
     contorno, prumada = círculo do DE, caixa/ralo = quadrado branco com a grade (js/biminstnivel.js formas) */
  function lm0(pp) { return Math.min(Math.sqrt(Math.pow(pp[1][0] - pp[0][0], 2) + Math.pow(pp[1][1] - pp[0][1], 2)), Math.sqrt(Math.pow(pp[3][0] - pp[0][0], 2) + Math.pow(pp[3][1] - pp[0][1], 2))); }
  function formasPlanta(D, c, trs, s, ox, oy, f0) {
    var f = f0 || formasDe(c, trs);
    if (!f) return;
    function P(q) { return [q[0] * s + ox, q[2] * s + oy]; }
    function corDe(sis) { var cam = D.E.camadas["HID-" + (CAMADA_SIS[sis] || "AF") + "-TUBO"]; return cam ? cam.cor : "#000"; }
    var ordem = { tubo: 0, peca: 1, forma: 1, caixa: 2, prumada: 3 };
    f.polys.slice().sort(function (a, b) { return (ordem[a.papel] || 1) - (ordem[b.papel] || 1); }).forEach(function (p) {
      var fill = p.papel === "tubo" || p.papel === "prumada" ? corDe(p.sistema) : "#ffffff", pp = p.pts.map(P), sw = K2.contornoTubo;
      /* tubo fino na escala (AF ø20 na 1:50 = 0,5 mm): o contorno afina junto, senão o preto engole a cor do sistema */
      if (p.papel === "tubo" && pp.length === 4) { var lm = Math.min(Math.sqrt(Math.pow(pp[1][0] - pp[0][0], 2) + Math.pow(pp[1][1] - pp[0][1], 2)), Math.sqrt(Math.pow(pp[3][0] - pp[0][0], 2) + Math.pow(pp[3][1] - pp[0][1], 2))); sw = Math.min(sw, lm * K2.contornoFrac); }
      /* R01: tubo mais fino que 1 mm de papel (gás ø15, AF ø20/25 na 1:50) leva o contorno na COR DO SISTEMA e na pena do padrão — o contorno preto engolia a cor e a planta de gás saía como um risco preto */
      var finoTubo = p.papel === "tubo" && pp.length === 4 && lm0(pp) < K2.tuboFinoMm, camTubo = D.E.camadas["HID-" + (CAMADA_SIS[p.sistema] || "AF") + "-TUBO"];
      poliCheio(D, pp, fill, finoTubo ? fill : "#000", finoTubo ? Math.max(sw, camTubo ? camTubo.mm : sw) : sw, p.papel === "tubo" || p.papel === "prumada" ? "HID-" + (CAMADA_SIS[p.sistema] || "AF") + "-TUBO" : "HID-CONEXAO");
    });
    f.segs.forEach(function (sg) { var a = P(sg.a), b = P(sg.b); D.linha(a[0], a[1], b[0], b[1], "HID-CONEXAO"); });
  }
  /* as caixas/ralos do nível médio viram OBSTÁCULO dos rótulos (o símbolo simbólico é menor que a caixa real na 1:20) */
  function obstaculosFormas(f, s) {
    var out = [];
    if (f) f.polys.forEach(function (p) { if (p.papel !== "caixa" && p.papel !== "peca") return; var xs = p.pts.map(function (q) { return q[0] * s; }), ys = p.pts.map(function (q) { return q[2] * s; }); out.push([Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]); });
    return out;
  }
  /* as BORDAS do tubo cheio (o DN 100 na 1:20 tem 5 mm de largura): o rótulo desvia do corpo do tubo, não só do eixo */
  function bordasTubo(f, s, ox, oy) {
    var out = [];
    if (f) f.polys.forEach(function (p) {
      if (p.papel !== "tubo" && p.papel !== "prumada") return;
      for (var i = 0; i < p.pts.length; i++) { var a = p.pts[i], b = p.pts[(i + 1) % p.pts.length]; out.push([a[0] * s + ox, a[2] * s + oy, b[0] * s + ox, b[2] * s + oy]); }
    });
    return out;
  }
  function formasDe(c, trs) {
    var NV = NIV(), G = GEO(); if (!NV || !NV.formas) return null;
    var ids = {}; trs.forEach(function (t) { ids[t.id] = 1; });
    var pv = c.pv || c.pavs[0], tol = HI().K.tolPiso_m;
    var sisOk = function (x) { return x === c.sis || (c.sis === "esgoto" && x === "ventilacao"); };
    /* R04b: sem rede pluvial (projeto complementar), os RALOS de piso do pluvial que o modelo tem aparecem na planta de esgoto (não há planta de pluvial) */
    var semPlPluvial = c.sis === "esgoto" && !arr(c.rede.trechos).some(function (t) { return t && t.sistema === "pluvial"; });
    var pecaOk = function (k) { return sisOk(k.sistema) || (semPlPluvial && k.sistema === "pluvial" && /ralo/.test(String(k.peca || ""))); };
    var R = { trechos: trs, conexoes: arr(c.rede.conexoes).filter(function (k) { return sisOk(k.sistema) && arr(k.ramos).some(function (id) { return ids[id]; }); }),
              pecas: arr(c.rede.pecas).filter(function (k) { return pecaOk(k) && k.y >=(pv.base != null ? pv.base : pv.cota - K2.cortePiso) - tol && k.y < (pv.sup != null ? pv.sup : pv.topo) - tol; }) };
    var f = null;
    try {
      f = NV.formas(R, "medio", [0, -1, 0], { cotasCx: function (m, t, dn) { try { return G ? G.cotasConexao(m, t, dn) : null; } catch (e) { return null; } },
                                            cotasTubo: function (m, dn) { try { return G ? G.cotasTubo(m, dn) : null; } catch (e) { return null; } } });
    } catch (e) { c.avisos.push("Folha " + dois(c.n) + ": a forma do nível médio falhou (" + (e && e.message ? e.message : e) + "); planta em linha única."); f = null; }
    return f;
  }
  /* o rótulo da peça na planta ("CS 100x100x50mm") — o do padrão (js/biminstnivel.js rotuloPeca) */
  function rotuloPecaPlanta(rede, alvo) {
    var k = null, NV = NIV(); arr(rede.pecas).forEach(function (p) { if (p.id === alvo) k = p; });
    return k && NV && NV.rotuloPeca ? NV.rotuloPeca(k) : null;
  }
  /* o nome do aparelho na folha: a SIGLA da tabela de alturas (js/hidkitdados.js — BS, LV, CH, PIA…), nunca o id interno */
  var PONTO_DA_FAMILIA = [[/bacia-caixa-acoplada/, "bacia_caixa_acoplada"], [/bacia/, "bacia_valvula_ligacao"], [/valvula-descarga/, "valvula_descarga"], [/lavatorio|cuba/, "lavatorio"],
                          [/ducha-higienica/, "ducha_higienica"], [/chuveiro/, "chuveiro"], [/pia-cozinha/, "pia_cozinha"], [/tanque-lavar/, "tanque"], [/mictorio/, "mictorio"]];
  function nomeAparelhoFn(estado) {
    var porId = {}, kd = KIT(), sig = {};
    arr(estado && estado.familias).forEach(function (f) { porId[f.id] = f; });
    if (kd && kd.alturas) arr(kd.alturas.dados).forEach(function (r) { sig[r[1]] = r[0]; });
    return function (famInst) {
      var f = porId[famInst]; if (!f) return null;
      var fid = txt(f.famId), i;
      if (/torneira/.test(fid)) return /m[aá]quina/i.test(txt(f.tipoId) + txt(f.tipoNome)) ? (sig.maquina_lavar_roupa || null) : (sig.torneira_limpeza || null);
      if (/tanque-lavar/.test(fid)) return "TANQUE";   /* "TQ" da tabela colide com o tubo de queda TQ-n da folha */
      for (i = 0; i < PONTO_DA_FAMILIA.length; i++) if (PONTO_DA_FAMILIA[i][0].test(fid)) return sig[PONTO_DA_FAMILIA[i][1]] || null;
      if (/caixa-dagua|cisterna|reservatorio/.test(fid)) return "RES";
      return null;
    };
  }

  /* ------------------------------------------------------------ AMBIENTES MOLHADOS (pelas paredes em volta dos aparelhos) */
  var APARELHO_RE = /^hid-(bacia|lavatorio|cuba|chuveiro|ducha|pia|tanque|torneira|mictorio|misturador|bebedouro|bide|banheira)/;
  function cruzaRaio(p, d, w) {
    var a = [w.c[0] - w.u[0] * w.L / 2, w.c[1] - w.u[1] * w.L / 2], b = [w.c[0] + w.u[0] * w.L / 2, w.c[1] + w.u[1] * w.L / 2];
    var ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex; if (Math.abs(den) < 1e-9) return null;
    var qx = a[0] - p[0], qz = a[1] - p[1], t = (qx * ez - qz * ex) / den, u = (qx * d[1] - qz * d[0]) / den;
    return t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? t : null;
  }
  function ambientesAuto(estado, pavs) {
    var fams = arr(estado && estado.familias).filter(function (f) { return APARELHO_RE.test(txt(f.famId)); }), grupos = [];
    var ps = arr(pavs).length ? pavs : [{ nome: "", cota: -Infinity, topo: Infinity }];
    fams.forEach(function (f) {
      var pv = null; ps.forEach(function (q) { if (f.y >= q.cota - HI().K.tolPiso_m - K2.cortePiso && (q.topo == null || f.y < q.topo)) pv = q; });
      var ws = paredesDoPav(estado, pv && isFinite(pv.cota) ? pv : null), p = [f.x, f.z], lim = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var best = null; ws.forEach(function (w) { var t = cruzaRaio(p, d, w); if (t != null && (best == null || t < best)) best = t; });
        lim.push(best == null ? K2.ambFolga : best);
      });
      var box = { x0: f.x - lim[1], x1: f.x + lim[0], z0: f.z - lim[3], z1: f.z + lim[2] }, g = null;
      grupos.forEach(function (q) { if (!g && Math.abs(q.x0 - box.x0) < K2.ambTol && Math.abs(q.x1 - box.x1) < K2.ambTol && Math.abs(q.z0 - box.z0) < K2.ambTol && Math.abs(q.z1 - box.z1) < K2.ambTol) g = q; });
      if (!g) { g = { x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1, fams: [], tipos: {} }; grupos.push(g); }
      g.fams.push(f.id); g.tipos[txt(f.famId)] = 1;
    });
    var conta = {};
    grupos.forEach(function (g) {
      var t = Object.keys(g.tipos).join(" ");
      g.base = /bacia|mictorio|chuveiro/.test(t) ? (/mictorio/.test(t) && !/bacia/.test(t) ? "SANITÁRIO" : "BANHEIRO") : /pia-cozinha/.test(t) ? "COZINHA" : /tanque|torneira/.test(t) ? "ÁREA DE SERVIÇO" : "AMBIENTE";
      conta[g.base] = (conta[g.base] || 0) + 1;
    });
    var seq = {};
    return grupos.sort(function (a, b) { return a.z0 - b.z0 || a.x0 - b.x0; }).map(function (g, i) {
      seq[g.base] = (seq[g.base] || 0) + 1;
      var m = K2.folgaAmb, HKi = dep("HidKit", "./hidkit.js"), bim = null, f0 = null;
      /* o NOME do ambiente do BIM (o cômodo desenhado: "BANHEIRO SOCIAL") vale mais que o nome deduzido dos aparelhos */
      arr(estado.familias).forEach(function (f) { if (f.id === g.fams[0]) f0 = f; });
      try { bim = f0 && HKi && HKi._int && HKi._int.ambienteDe ? HKi._int.ambienteDe(estado, f0) : null; } catch (e) { bim = null; }
      if (bim && txt(bim.nome).trim()) return { id: "amb" + (i + 1), nome: txt(bim.nome).trim().toUpperCase(), x0: g.x0 - m, x1: g.x1 + m, z0: g.z0 - m, z1: g.z1 + m, aparelhos: g.fams, ambienteBim: bim.id || null };
      return { id: "amb" + (i + 1), nome: g.base + (conta[g.base] > 1 ? " " + seq[g.base] : ""), x0: g.x0 - m, x1: g.x1 + m, z0: g.z0 - m, z1: g.z1 + m, aparelhos: g.fams };
    });
  }

  /* ------------------------------------------------------------ CORTES DAS PAREDES HIDRÁULICAS (vista da parede) */
  function paredesHidraulicas(c, pv) {
    var est = c.modelo && c.modelo.estado, ws = paredesDoPav(est, pv), tol = HI().K.tolPiso_m, out = [];
    var sisOk = { agua_fria: 1, agua_quente: 1, esgoto: 1, ventilacao: 1, pluvial: 1 };
    var amb = arr(c.ambientes);
    ws.forEach(function (w) {
      var banda = w.esp / 2 + K2.faixaParede;
      function loc(p) { var dx = p.x - w.c[0], dz = p.z - w.c[1]; return { s: dx * w.u[0] + dz * w.u[1], d: dx * w.n[0] + dz * w.n[1] }; }
      function dentro(p) { var q = loc(p); return Math.abs(q.d) <= banda && Math.abs(q.s) <= w.L / 2 + tol && p.y >= pv.cota - K2.cortePiso && p.y <= Math.min(pv.topo, w.y1 + K2.corteTopo); }
      var trs = arr(c.rede.trechos).filter(function (t) { return sisOk[t.sistema] && dentro(t.p1) && dentro(t.p2); });
      var pts = arr(c.rede.ligacoes).filter(function (l) { return l.tipo !== "peca" && dentro(l); });
      if (!trs.length || pts.filter(function (l) { return l.tipo === "aparelho"; }).length < K2.corteMinPontos) return;
      /* o lado de quem olha: o dos pontos de utilização */
      var lado = 0; pts.forEach(function (l) { lado += loc(l).d; }); lado = lado >= 0 ? 1 : -1;
      var vd = [-w.n[0] * lado, -w.n[1] * lado], dir = [-vd[1], vd[0]], inv = dir[0] * w.u[0] + dir[1] * w.u[1] < 0;
      var nome = null; amb.forEach(function (a) { var cx = w.c[0] + w.n[0] * lado * (w.esp / 2 + K2.faixaParede), cz = w.c[1] + w.n[1] * lado * (w.esp / 2 + K2.faixaParede); if (!nome && cx >= a.x0 && cx <= a.x1 && cz >= a.z0 && cz <= a.z1) nome = a.nome; });
      out.push({ w: w, trs: trs, pts: pts, inv: inv, lado: lado, nome: nome || "PAREDE", loc: loc,
                 acess: arr(c.rede.acessorios).filter(function (a) { return a.centro && dentro(a.centro); }) });
    });
    return out;
  }
  function desenhoCorte(c, ph, s) {
    var H = HI(), KI = H.K, w = ph.w, pv = ph.pv, L = [], S = [], T = [], seg = [], pend = [], cot = [];
    var yTop = Math.min(w.y1, pv.topo), yBot = pv.cota - K2.cortePiso;
    function X(p) { var q = ph.loc(p), u = q.s + w.L / 2; return (ph.inv ? w.L - u : u) * s; }
    function Y(y) { return (yTop - y) * s; }
    /* a parede (contexto), o piso acabado e o enchimento abaixo dele */
    L.push({ x1: 0, y1: Y(w.y1 > yTop ? yTop : w.y1), x2: w.L * s, y2: Y(w.y1 > yTop ? yTop : w.y1), camada: "HID-CONTEXTO", tipo: "parede", trecho: "parede" });
    L.push({ x1: 0, y1: Y(yTop), x2: 0, y2: Y(pv.cota), camada: "HID-CONTEXTO", tipo: "parede", trecho: "parede" });
    L.push({ x1: w.L * s, y1: Y(yTop), x2: w.L * s, y2: Y(pv.cota), camada: "HID-CONTEXTO", tipo: "parede", trecho: "parede" });
    L.push({ x1: -KI.margem, y1: Y(pv.cota), x2: w.L * s + KI.margem, y2: Y(pv.cota), camada: "HID-TITULO", tipo: "piso", trecho: "piso" });
    /* R02: a vista cotada do ambiente (caderno) mostra também a LOUÇA em meio-tom, vista do lado de quem olha (ph.louca) */
    if (ph.louca) {
      try {
        var vw = [w.n[0] * ph.lado, 0, w.n[1] * ph.lado];
        linhasLoucas(c.modelo.estado, c.modelo.avaliarFam, vw, function (fi) { var q = ph.loc(fi); return APARELHO_RE.test(txt(fi.famId)) && q.d * ph.lado >= -w.esp / 2 - 0.05 && q.d * ph.lado <= 1.2 && Math.abs(q.s) <= w.L / 2 + 0.3 && fi.y >= pv.cota - 0.7 && fi.y < pv.topo; })
          .forEach(function (sg) {
            var a0 = [X({ x: sg[0][0], z: sg[0][2] }), Y(sg[0][1])], b0 = [X({ x: sg[1][0], z: sg[1][2] }), Y(sg[1][1])];
            if (Math.min(a0[0], b0[0]) < -1 || Math.max(a0[0], b0[0]) > w.L * s + 1) return;
            L.push({ x1: a0[0], y1: a0[1], x2: b0[0], y2: b0[1], camada: "HID-LOUCA", tipo: "louca", trecho: "louca" });
          });
      } catch (eL) { c.avisos.push("Vista " + ph.nome + ": louças em meio-tom falharam (" + (eL && eL.message) + ")."); }
    }
    /* a cota vertical (alturas dos pontos) corre numa linha à esquerda da parede: os rótulos se afastam dela */
    var cotaYs = [];
    if (ph.cotaV) {
      var hs = {}; ph.pts.forEach(function (l) { if (l.tipo === "aparelho") hs[Math.round((l.y - pv.cota) * 100)] = l.y; }); ph.acess.forEach(function (a0) { hs[Math.round((a0.centro.y - pv.cota) * 100)] = a0.centro.y; });
      Object.keys(hs).map(Number).sort(function (p0, q0) { return p0 - q0; }).forEach(function (k0) { cotaYs.push(Y(hs[k0])); });
      if (cotaYs.length) seg.push([-ph.cotaV, Math.min.apply(null, cotaYs), -ph.cotaV, Y(pv.cota)]);
    }
    ph.trs.forEach(function (t) {
      var a = [X(t.p1), Y(t.p1.y)], b = [X(t.p2), Y(t.p2.y)], sg = SIGLA_CAM(t.sistema), inf = (c.ix[t.sistema] || {})[t.id];
      L.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], camada: "HID-" + sg + "-TUBO", tipo: "tubo", trecho: t.id }); seg.push([a[0], a[1], b[0], b[1]]);
      var Ls = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (Ls < KI.margem) return;
      var dn = inf && inf.dn != null ? inf.dn : t.dn, PDr = PAD();
      void PDr; void dn;
      pend.push({ s: dnRotulo(t, inf, true), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: t.id,
                  anchors: KI.ancoras.map(function (f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }), prio: 3, comprimento: Ls });
    });
    var visto = {};
    ph.pts.forEach(function (l) {
      if (visto[l.alvo]) return; visto[l.alvo] = 1;
      var p = [X(l), Y(l.y)], alt = l.y - pv.cota, nm = l.tipo === "aparelho" ? c.nomeAp(l.famInst) : null;
      S.push({ tipo: l.tipo === "aparelho" ? "ponto" : "joelho", x: p[0], y: p[1], r: KI.rPonto, camada: "HID-SIMBOLO", box: [p[0] - KI.rPonto, p[1] - KI.rPonto, p[0] + KI.rPonto, p[1] + KI.rPonto], id: l.alvo });
      if (l.tipo === "aparelho") { pend.push({ s: (nm ? nm + "  " : "") + (alt >= 0 ? "+" : "") + br(alt, 2), h: KI.hPeq, tipo: "aparelho", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0 }); cot.push(p[0]); }
    });
    ph.acess.forEach(function (a) {
      var p = [X(a.centro), Y(a.centro.y)], r = KI.regC / 2;
      L.push({ x1: p[0] - r, y1: p[1] - r, x2: p[0] + r, y2: p[1] + r, camada: "HID-SIMBOLO", tipo: "registro", trecho: a.id });
      L.push({ x1: p[0] - r, y1: p[1] + r, x2: p[0] + r, y2: p[1] - r, camada: "HID-SIMBOLO", tipo: "registro", trecho: a.id });
      S.push({ tipo: "registro", x: p[0], y: p[1], r: r, camada: "HID-SIMBOLO", box: [p[0] - r, p[1] - r, p[0] + r, p[1] + r], id: a.id, desenhado: true });
      var alt = a.centro.y - pv.cota;
      pend.push({ s: txt(({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[a.acessorio] || "RG") + "  " + (alt >= 0 ? "+" : "") + br(alt, 2), h: KI.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: a.id, anchors: [p], prio: 1 });
    });
    var avisos = [];
    H.afastar(pend, S, L, T, seg, avisos);
    /* a cota dos pontos ao longo da parede (cm), embaixo do piso: entra depois, fora do desenho */
    cot.sort(function (a, b) { return a - b; });
    var xsC = [0].concat(cot.filter(function (x, i) { return i === 0 || x - cot[i - 1] > KI.margem / 2; })).concat([w.L * s]);
    return { linhas: L, simbolos: S, textos: T, avisos: avisos, cotaXs: xsC, cotaYs: cotaYs, yPiso: Y(pv.cota), yFundo: Y(yBot), yTopo: Y(yTop), w: w.L * s, trechos: ph.trs.map(function (t) { return t.id; }) };
  }
  /* AS CAIXAS D'ÁGUA COLOCADAS NO PROJETO (F8, 28/10/2026): volume, diâmetro e altura vêm da família colocada (valores avaliados do tipo),
     nunca do catálogo genérico. Ordem: do menor x/z ao maior, para o nome CX-1, CX-2 não mudar entre folhas. */
  var RE_RESERV = /^(hid|ra)-caixa-dagua$|^hid-reservatorio/;
  /* o id do tipo ("t-fortlev-0-201-000-6-1713") não é nome para o cliente: só um nome com espaço vai ao desenho */
  function nomeTipoLegivel(f) { var n = txt(f.tipoNome); return /\s/.test(n) ? n : ""; }
  function caixasReais(modelo) {
    var est = modelo && modelo.estado, aval = modelo && modelo.avaliarFam, out = [];
    arr(est && est.familias).forEach(function (f) {
      if (!RE_RESERV.test(txt(f.famId))) return;
      var v = null; try { v = typeof aval === "function" ? aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { v = null; }
      var va = (v && v.valores) || {}, num = function (x) { return typeof x === "number" && isFinite(x) && x > 0 ? x : null; };
      out.push({ id: txt(f.id), x: f.x, y: f.y, z: f.z, tipo: nomeTipoLegivel(f), nomeInst: txt((f.inst && (f.inst.Nome || f.inst.nome)) || ""),
                 volume: num(va.Volume_L) || num(va.Capacidade_L), diametro: num(va.Diametro_corpo) || num(va.Diametro), altura: num(va.Altura), valores: va });
    });
    out.sort(function (a, b) { return (a.x - b.x) || (a.z - b.z); });
    out.forEach(function (q, i) { q.nome = q.nomeInst || ("CX-" + (i + 1)); });
    return out;
  }
  function SIGLA_CAM(sis) { return CAMADA_SIS[sis] || "AF"; }
  /* ------------------------------------------------------------ DETALHES TÍPICOS (6 painéis; esquemáticos, sem escala) */
  /* cada painel: a geometria à esquerda e as CHAMADAS em lista à direita (uma linha por item, nunca uma sobre a outra);
     embaixo, a tabela do catálogo com as LETRAS da ficha */
  function chamadas(D, itens, xT, yMin, yMax, h) {
    var passo = h * K2.notaLinha + K2.notaEntre, ord = itens.slice().sort(function (a, b) { return a.p[1] - b.p[1]; }), y = yMin;
    ord.forEach(function (it) {
      var ty = Math.max(y, Math.min(it.p[1] + h * 0.35, yMax));
      D.linha(it.p[0], it.p[1], xT - 1, ty - h * 0.35, "HID-COTA");
      D.ponto(it.p[0], it.p[1], HI().K.rTe * 0.7, "#000");
      D.texto(xT, ty, it.t, h, { cor: it.cor });
      y = ty + passo;
    });
    return y;
  }
  function tabelaCatalogo(D, c, x, y, w, tipos, yMax) {
    var cat = CAT(), h0 = D.E.T.minimo, KI = HI().K;
    var itens = cat ? tipos.reduce(function (acc, t) { return acc.concat(arr(cat.porTipo(t))); }, []).slice(0, K2.catMax) : [];
    if (!itens.length) { D.texto(x, y + h0, cat ? "Sem produto de catálogo desta família: dimensão a definir pelo RT." : "Catálogo não carregado: dimensão a definir pelo RT.", h0, { cor: K2.vermelho }); return; }
    D.texto(x, y + h0, "CATÁLOGO (mm; LETRAS da ficha do fabricante - a conferir)", h0, { peso: 0.16 });
    var yy = y + h0 * (1 + KI.caixaAlt * K2.notaLinha);
    itens.forEach(function (it) {
      var dm = it.dim || {}, ds = Object.keys(dm).map(function (k) { return k + "=" + dm[k]; }).join(" "), f = it.fonte || {};
      c.AP.quebrar(txt(it.codigo) + " - " + txt(it.descricao) + (ds ? " | " + ds : "") + " | " + txt(it.fabricante) + ", p. " + txt(f.pagina), h0, w).forEach(function (ln) {
        if (yy + h0 <= yMax) D.texto(x, yy + h0, ln, h0, {});
        yy += h0 * K2.notaLinha;
      });
      yy += K2.notaEntre;
    });
  }
  function alturaKit(sig) { var kd = KIT(), v = null; if (kd && kd.alturas) arr(kd.alturas.dados).forEach(function (r) { if (r[0] === sig) v = r[3] / 100; }); return v; }   // hid:ok cm → m
  /* geometria dos painéis em frações da caixa (desenho esquemático — hid:fisica: proporções de desenho, não norma) */
  function pnKitBacia(D, g) {
    var kd = KIT(), it = [], vd = alturaKit("VD"), rg = alturaKit("RG"), bs = alturaKit("BS"), topo = Math.max(vd || 0, rg || 0) + 0.4;
    var s = Math.min(g.w / 1.4, g.h / (topo + 0.5)), xP = g.x + g.w * 0.15, yP = g.y + topo * s;
    function Y(v) { return yP - v * s; }
    D.ret(xP, Y(topo), g.w * 0.75, topo * s, "HID-CONTEXTO");                         /* a parede */
    D.linha(g.x, yP, g.x + g.w, yP, "HID-TITULO");                                       /* piso acabado */
    D.linha(g.x, yP + 0.3 * s, g.x + g.w, yP + 0.3 * s, "HID-EIXO");                     /* laje (enchimento) */
    var xb = xP + g.w * 0.35, xv = xb;
    D.poli([[xb - 0.18 * s, yP], [xb - 0.2 * s, Y(0.4)], [xb + 0.25 * s, Y(0.4)], [xb + 0.22 * s, yP]], "HID-SIMBOLO", true);   /* bacia (perfil) */
    if (!kd || vd == null || rg == null) { D.texto(g.x, g.y + D.E.T.nota, "Alturas do kit não carregadas (js/hidkitdados.js): não verificado.", D.E.T.minimo, { cor: K2.vermelho }); return it; }
    D.linha(xv, Y(topo), xv, Y(rg), "HID-AF-TUBO"); D.linha(xv, Y(rg), xv, Y(vd), "HID-AF-TUBO");
    var r = HI().K.regC / 2; D.linha(xv - r, Y(rg) - r, xv + r, Y(rg) + r, "HID-SIMBOLO"); D.linha(xv - r, Y(rg) + r, xv + r, Y(rg) - r, "HID-SIMBOLO");
    D.ret(xv - 1.6, Y(vd) - 1.2, 3.2, 2.4, "HID-SIMBOLO");                                /* válvula */
    D.linha(xv, Y(vd), xv, Y(bs != null ? bs : 0.35), "HID-AF-TUBO");                    /* tubo de descarga */
    D.linha(xb, yP, xb, yP + 0.22 * s, "HID-ES-TUBO"); D.linha(xb, yP + 0.22 * s, g.x + g.w, yP + 0.22 * s + 0.01 * s, "HID-ES-TUBO");
    it.push({ p: [xv, Y(rg)], t: "RG  +" + br(rg, 2) + " (registro de gaveta)" });
    it.push({ p: [xv, Y(vd)], t: "VD  +" + br(vd, 2) + " (válvula de descarga)" });
    if (bs != null) it.push({ p: [xv, Y(bs)], t: "BS  +" + br(bs, 2) + " (ligação da bacia)" });
    it.push({ p: [xv, Y(topo) + s * 0.1], t: "RAMAL EXCLUSIVO DA VÁLVULA" });
    it.push({ p: [g.x + g.w * 0.9, yP + 0.22 * s], t: "ESGOTO DA BACIA (DN na planta)" });
    var f = kd.alturas.fonte || {};
    it.fonte = "Alturas: " + txt(f.doc).split(",")[0] + ", p. " + txt(f.pagina) + " (" + txt(f.tipo) + ") - conferir com o metal escolhido.";
    return it;
  }
  /* R04: DETALHE DA CALHA EMBUTIDA atrás da platibanda (corte esquemático, sem escala): telhado, calha de chapa metálica, manta de impermeabilização que sobe
     pela platibanda até o contrarrufo, ladrão (extravasor) na platibanda, bocal/funil de saída, caimento e emenda. Os números vêm do memorial (por telhado). */
  function pnCalhaEmbutida(D, g, r) {
    var cals = arr(r && r.sistemas && r.sistemas.pluvial && r.sistemas.pluvial.calhas).filter(function (x) { return x && x.bocal; }), it = [];
    var c0 = cals.slice().sort(function (a, b) { return (b.vazao_l_min || 0) - (a.vazao_l_min || 0); })[0] || {};
    var ld = c0.ladrao || {}, bo = c0.bocal || {}, hU = c0.alturaUtil_mm || 120, bC = 300;
    var dnMax = cals.reduce(function (m, x) { return Math.max(m, x.bocal && x.bocal.dn || 0); }, 0), wMax = cals.reduce(function (m, x) { return Math.max(m, x.ladrao && x.ladrao.largura_mm || 0); }, 0);
    var y0 = g.y + g.h * 0.80, x0 = g.x + g.w * 0.06, xi = g.x + g.w * 0.62, tw = g.w * 0.16, hp = g.h * 0.66, hc = g.h * 0.24, k = hc / hU;
    D.ret(xi, y0 - hp, tw, hp + g.h * 0.06, "HID-CONTEXTO");                                        /* platibanda (alvenaria) */
    D.linha(x0, y0 - hc - g.h * 0.1, x0 + g.w * 0.16, y0 - hc, "HID-CONTEXTO");                       /* telhado (caimento para a calha) */
    D.poli([[x0 + g.w * 0.16, y0 - hc], [x0 + g.w * 0.16, y0], [xi, y0], [xi, y0 - hc]], "HID-SIMBOLO", false);   /* calha: fundo e abas */
    D.linha(x0 + g.w * 0.16 - 1.2, y0 - hc - 1.2, x0 + g.w * 0.16 - 1.2, y0 + 1.2, "HID-EIXO");
    D.linha(x0 + g.w * 0.16 - 1.2, y0 + 1.2, xi - 1.2, y0 + 1.2, "HID-EIXO");
    D.linha(xi - 1.2, y0 + 1.2, xi - 1.2, y0 - hp * 0.82, "HID-EIXO");                                  /* manta subindo pela platibanda */
    D.ret(xi - 1.6, y0 - hp, tw + 3.2, 1.8, "HID-SIMBOLO");                                            /* contrarrufo / capa */
    var ys = y0 - (ld.soleira_mm || 90) * k, hs = (ld.altura_mm || 40) * k;
    D.ret(xi, ys - hs, tw, hs, "HID-ES-TUBO");                                                         /* ladrão (vão na platibanda) */
    D.linha(x0 + g.w * 0.16, y0 - 2 / 3 * hU * k, xi, y0 - 2 / 3 * hU * k, "HID-EIXO");              /* lâmina de projeto (2/3 da altura útil) */
    var xb = x0 + g.w * 0.16 + (xi - x0 - g.w * 0.16) * 0.45;
    D.poli([[xb - 3.5, y0], [xb + 3.5, y0], [xb + 1.8, y0 + g.h * 0.08], [xb - 1.8, y0 + g.h * 0.08]], "HID-SIMBOLO", true);   /* bocal (funil) */
    D.linha(xb, y0 + g.h * 0.08, xb, y0 + g.h * 0.16, "HID-AP-TUBO");                                  /* início do condutor */
    D.linha(x0 + g.w * 0.16 + (xb - x0 - g.w * 0.16) * 0.25, y0 + 3, x0 + g.w * 0.16 + (xb - x0 - g.w * 0.16) * 0.25 + 4, y0 + 3, "HID-COTA");   /* emenda (traço) */
    it.push({ p: [xi + tw * 0.5, y0 - hp], t: "CONTRARRUFO / CAPA DA PLATIBANDA" });
    it.push({ p: [xi - 1.2, y0 - hp * 0.5], t: "MANTA DE IMPERMEABILIZAÇÃO (sobe até o contrarrufo)" });
    it.push({ p: [xi + tw * 0.5, ys - hs / 2], t: "LADRÃO " + (wMax || "—") + " x " + (ld.altura_mm || "—") + " mm, soleira " + (ld.soleira_mm || "—") + " mm" });
    it.push({ p: [x0 + g.w * 0.3, y0 - 2 / 3 * hU * k], t: "LÂMINA DE PROJETO ≤ 2/3 DA ALTURA ÚTIL" });
    it.push({ p: [x0 + g.w * 0.2, y0], t: "CALHA 300 x " + hU + " mm, i = 0,5 % (chapa metálica)" });
    it.push({ p: [xb, y0 + g.h * 0.06], t: "BOCAL / FUNIL DN " + (dnMax || "—") + " (Francis / orifício)" });
    it.push({ p: [x0 + g.w * 0.16 + 2, y0 + 3], t: "EMENDA: SOBREPOSIÇÃO 20 mm + SELANTE" });
    it.fonte = "Corte esquemático, sem escala. Calha de chapa metálica (n = 0,011) embutida atrás da platibanda; bocal pela fórmula de Francis e pelo orifício (o maior DN); ladrão como orifício com o bocal obstruído, abaixo do topo da impermeabilização. Valores por telhado no memorial de cálculo (verificações da calha).";
    return it;
  }
  function pnCaixaSif(D, g) {
    var w = g.w * 0.5, h = g.h * 0.55, x = g.x + g.w * 0.22, y = g.y + g.h * 0.2, it = [];
    D.ret(x, y, w, h, "HID-SIMBOLO");
    for (var i = 1; i < 6; i++) D.linha(x + w * i / 6, y - 1.2, x + w * i / 6, y + 0.4, "HID-SIMBOLO");   /* grelha */
    D.linha(x - 2, y, x + w + 2, y, "HID-TITULO");
    D.linha(x - g.w * 0.18, y + h * 0.25, x, y + h * 0.25, "HID-ES-TUBO"); D.linha(x - g.w * 0.18, y + h * 0.42, x, y + h * 0.42, "HID-ES-TUBO");
    D.linha(x + w, y + h * 0.7, x + w + g.w * 0.2, y + h * 0.72, "HID-ES-TUBO");
    D.linha(x + w * 0.55, y + h * 0.45, x + w * 0.55, y + h * 0.92, "HID-SIMBOLO");         /* septo (sifão) */
    D.linha(x + 1, y + h * 0.6, x + w - 1, y + h * 0.6, "HID-EIXO");                         /* nível d'água */
    it.push({ p: [x + w * 0.3, y], t: "GRELHA / PORTA-GRELHA" });
    it.push({ p: [x - g.w * 0.12, y + h * 0.25], t: "ENTRADAS (LAVATÓRIO, RALO DO BOX)" });
    it.push({ p: [x + w * 0.25, y + h * 0.6], t: "FECHO HÍDRICO (nível d'água)" });
    it.push({ p: [x + w + g.w * 0.12, y + h * 0.71], t: "SAÍDA (DN na planta)" });
    return it;
  }
  function pnCaixa(D, g, partes, esgoto) {
    var w = g.w * 0.55, h = g.h * 0.6, x = g.x + g.w * 0.22, y = g.y + g.h * 0.15, it = [];
    D.ret(x, y, w, h, "HID-SIMBOLO");
    D.linha(x - 2, y, x + w + 2, y, "HID-TITULO");
    D.linha(x + 1, y + h * 0.7, x + w - 1, y + h * 0.7, "HID-EIXO");
    var cam = esgoto ? "HID-ES-TUBO" : "HID-AF-TUBO";
    D.linha(x - g.w * 0.18, y + h * 0.78, x, y + h * 0.78, cam); D.linha(x + w, y + h * 0.86, x + w + g.w * 0.18, y + h * 0.86, cam);
    var pts = [[x + w * 0.4, y], [x - g.w * 0.1, y + h * 0.78], [x + w + g.w * 0.1, y + h * 0.86], [x + w * 0.5, y + h * 0.5], [x + w * 0.5, y + h]];
    partes.forEach(function (t, i) { if (pts[i]) it.push({ p: pts[i], t: t }); });
    return it;
  }
  /* RESERVATÓRIO: o perfil na proporção da caixa colocada (Ø × H da família), com as chamadas funcionais e os valores reais */
  function pnReservatorioReal(D, g, q) {
    var it = [], w = g.w * 0.55, h = g.h * 0.62, tem = q.diametro != null && q.altura != null;
    if (tem) { var k = Math.min(g.w * 0.6 / q.diametro, g.h * 0.7 / q.altura); w = q.diametro * k; h = q.altura * k; }
    var x = g.x + g.w * 0.2, y = g.y + g.h * 0.12;
    D.ret(x, y, w, h, "HID-SIMBOLO");
    D.linha(x - 2, y, x + w + 2, y, "HID-TITULO");
    D.linha(x + 1, y + h * 0.25, x + w - 1, y + h * 0.25, "HID-EIXO");
    D.linha(x - g.w * 0.16, y + h * 0.12, x, y + h * 0.12, "HID-AF-TUBO");
    D.linha(x + w, y + h * 0.18, x + w + g.w * 0.16, y + h * 0.18, "HID-AF-TUBO");
    D.linha(x + w, y + h * 0.9, x + w + g.w * 0.16, y + h * 0.9, "HID-AF-TUBO");
    D.linha(x + w * 0.5, y + h, x + w * 0.5, y + h + g.h * 0.08, "HID-AF-TUBO");
    it.push({ p: [x + w * 0.4, y], t: "TAMPA" });
    it.push({ p: [x - g.w * 0.12, y + h * 0.12], t: "ENTRADA COM BOIA" });
    it.push({ p: [x + w * 0.5, y + h * 0.25], t: "NÍVEL DE OPERAÇÃO" });
    it.push({ p: [x + w + g.w * 0.1, y + h * 0.18], t: "EXTRAVASOR" });
    it.push({ p: [x + w + g.w * 0.1, y + h * 0.9], t: "SAÍDA (barrilete)" });
    it.push({ p: [x + w * 0.5, y + h + g.h * 0.08], t: "LIMPEZA (COM REGISTRO)" });
    if (q.diametro != null) it.push({ p: [x + w * 0.5, y + h * 0.5], t: "Ø " + br(q.diametro, 2) + " m (família colocada)" });
    if (q.altura != null) it.push({ p: [x, y + h * 0.5], t: "H " + br(q.altura, 2) + " m" });
    it.fonte = (tem ? "Perfil na proporção da caixa colocada no projeto" : "Dimensões da caixa não informadas pela família: perfil esquemático") + (q.tipo ? " (" + q.tipo + ")" : "") + ".";
    return it;
  }
  /* uma linha por caixa colocada: nome, tipo, volume, diâmetro, altura e cota da base — tudo da família do projeto */
  function tabelaCaixasReais(D, c, x, y, w, yMax, cxs) {
    var h0 = D.E.T.minimo, KI = HI().K;
    D.texto(x, y + h0, "CAIXAS D'ÁGUA DO PROJETO (valores da família colocada)", h0, { peso: 0.16 });
    var yy = y + h0 * (1 + KI.caixaAlt * K2.notaLinha);
    cxs.forEach(function (q) {
      var tx = q.nome + " - " + (q.tipo || "caixa d'água") + " | " + (q.volume != null ? "volume " + String(Math.round(q.volume)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " L" : "volume a confirmar") + (q.diametro != null ? " | Ø " + br(q.diametro, 2) + " m" : "") + (q.altura != null ? " | H " + br(q.altura, 2) + " m" : "") + " | base +" + br(q.y, 2) + " m";
      c.AP.quebrar(tx, h0, w).forEach(function (ln) { if (yy + h0 <= yMax) D.texto(x, yy + h0, ln, h0, {}); yy += h0 * K2.notaLinha; });
      yy += K2.notaEntre;
    });
    if (cxs.length > 1) { var tot = 0, ok = true; cxs.forEach(function (q) { if (q.volume == null) ok = false; else tot += q.volume; }); if (ok && yy + h0 <= yMax) D.texto(x, yy + h0, "Reservação total: " + String(Math.round(tot)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " L em " + cxs.length + " caixas interligadas.", h0, {}); }
  }
  function pnBarrilete(D, g, colunas) {
    var it = [], x = g.x + g.w * 0.05, y = g.y + g.h * 0.06, w = g.w * 0.45, h = g.h * 0.28;
    D.ret(x, y, w, h, "HID-SIMBOLO");
    D.linha(x + 1, y + h * 0.25, x + w - 1, y + h * 0.25, "HID-EIXO");
    D.linha(x - g.w * 0.04, y + h * 0.15, x, y + h * 0.15, "HID-AF-TUBO");                                    /* alimentação com boia */
    D.linha(x + w, y + h * 0.2, x + w + g.w * 0.08, y + h * 0.2, "HID-AF-TUBO");                              /* extravasor */
    var yb = y + h + g.h * 0.12, todas = colunas.length ? colunas : ["AF-1"], nomes = todas.slice(0, K2.barMax), xs = [], r = HI().K.regC / 2;
    if (todas.length > nomes.length) nomes[nomes.length - 1] = nomes[nomes.length - 1] + " a " + todas[todas.length - 1];
    D.linha(x + w * 0.3, y + h, x + w * 0.3, yb, "HID-AF-TUBO");
    D.linha(x + w * 0.3, yb, x + w * 0.3 + g.w * 0.08 * nomes.length + g.w * 0.05, yb, "HID-AF-TUBO");          /* barrilete */
    nomes.forEach(function (nm, i) {
      var xc = x + w * 0.3 + g.w * 0.08 * (i + 1); xs.push(xc);
      D.linha(xc, yb, xc, yb + g.h * 0.3, "HID-AF-TUBO");
      var yr = yb + g.h * 0.1; D.linha(xc - r, yr - r, xc + r, yr + r, "HID-SIMBOLO"); D.linha(xc - r, yr + r, xc + r, yr - r, "HID-SIMBOLO");
      D.ponto(xc, yb, HI().K.rTe, "#000");
      it.push({ p: [xc, yb + g.h * 0.3], t: "COLUNA " + nm + " (RG no início)" });
    });
    var yl = y + h; D.linha(x + w * 0.75, yl, x + w * 0.75, yl + g.h * 0.06, "HID-AF-TUBO");                    /* limpeza */
    it.push({ p: [x - g.w * 0.04, y + h * 0.15], t: "ALIMENTAÇÃO (TORNEIRA DE BOIA)" });
    it.push({ p: [x + w + g.w * 0.08, y + h * 0.2], t: "EXTRAVASOR" });
    it.push({ p: [x + w * 0.75, yl + g.h * 0.06], t: "LIMPEZA (COM REGISTRO)" });
    it.push({ p: [x + w * 0.3, yb], t: "BARRILETE (DN no esquema vertical)" });
    return it;
  }
  var PAINEIS = [
    { id: "kit", titulo: "KIT DA BACIA COM VÁLVULA (vista)", cat: ["valvula_descarga"] },
    { id: "cs", titulo: "CAIXA SIFONADA (corte)", cat: ["caixa_sifonada"] },
    { id: "ci", titulo: "CAIXA DE INSPEÇÃO (corte)", cat: ["caixa_inspecao"] },
    { id: "cg", titulo: "CAIXA DE GORDURA (corte)", cat: ["caixa_gordura"] },
    { id: "bar", titulo: "BARRILETE (esquema)", cat: [] },
    { id: "res", titulo: "RESERVATÓRIO (corte)", cat: ["reservatorio_caixa_dagua"] },
    { id: "calha", titulo: "CALHA EMBUTIDA E LADRÃO (corte)", cat: [] }
  ];
  /* os painéis que o PROJETO tem (F8, M9): o detalhe da válvula de descarga só entra se houver ponto com válvula; o reservatório usa a caixa real */
  function paineisDe(r) {
    var af = r && r.sistemas && r.sistemas.agua_fria, temVD = arr(af && af.pontos).some(function (p) { return /valvula/.test(txt(p.aparelho)) && /bacia|mictorio/.test(txt(p.aparelho)); });
    var temCalha = arr(r && r.sistemas && r.sistemas.pluvial && r.sistemas.pluvial.calhas).some(function (x) { return x && x.bocal; });
    return PAINEIS.filter(function (pn) { return (pn.id !== "kit" || temVD) && (pn.id !== "calha" || temCalha); });
  }
  function layoutDetalhes(geo, r) {
    var PAINEIS = paineisDe(r), a = geo.area, col = Math.max(1, Math.min(K2.detalhe.colunas, Math.floor(a.w / 110))), lin = Math.max(1, Math.min(K2.detalhe.linhas, Math.floor((a.h - K2.titulo) / 120)));   // hid:ok largura/altura mínima de um painel (mm de papel)
    return { col: col, lin: lin, porFolha: col * lin, folhas: Math.ceil(PAINEIS.length / (col * lin)) };
  }
  function folhaDetalhes(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, lay = layoutDetalhes(c.geo, c.r), ini = (c.parte || 0) * lay.porFolha, pns = paineisDe(c.r).slice(ini, ini + lay.porFolha), cxsReais = caixasReais(c.modelo);
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "ESQUEMÁTICO - SEM ESCALA");
    var cw = (a.w - 8) / lay.col, ch = (a.h - K2.titulo - 4) / lay.lin, h = T.minimo;
    var nomesCol = []; Object.keys(c.colunas || {}).forEach(function (k) { var nm = c.colunas[k].nome; if (nomesCol.indexOf(nm) < 0) nomesCol.push(nm); });
    pns.forEach(function (pn, i) {
      var px = a.x + 4 + (i % lay.col) * cw, py = a.y + K2.titulo + Math.floor(i / lay.col) * ch, gx = px + 2, gy = py + T.titulo + 6, gw = cw * 0.42, gh = ch * 0.48;
      D.texto(px + 2, py + T.titulo * 0.8, pn.titulo, T.titulo * 0.8, { peso: 0.16 });
      var g = { x: gx, y: gy, w: gw, h: gh }, it;
      if (pn.id === "kit") it = pnKitBacia(D, g);
      else if (pn.id === "cs") it = pnCaixaSif(D, g);
      else if (pn.id === "ci") it = pnCaixa(D, g, ["TAMPA", "ENTRADA", "SAÍDA", "FUNDO COM CALHA (meia-cana)", "NÍVEL: VER PLANTA"], true);
      else if (pn.id === "cg") {
        /* R04b: a TAMPA vem da caixa de gordura do MODELO (inst.Tampa da família, ex.: "hermética, revestida com o porcelanato do piso"); sem ela, o texto genérico */
        var cgT = arr(c.modelo && c.modelo.estado && c.modelo.estado.familias).filter(function (f) { return f && f.famId === "hid-caixa-gordura" && f.inst && f.inst.Tampa; })
          .map(function (f) { return String(f.inst.Nome || "CG").split(" ")[0] + ": " + String(f.inst.Tampa); });
        it = pnCaixa(D, g, [cgT.length ? "TAMPA " + cgT.join("; ") : "TAMPA", "ENTRADA (cozinha)", "SAÍDA", "SEPTO / CESTO", "FUNDO"], true);
      }
      else if (pn.id === "bar") it = pnBarrilete(D, g, nomesCol);
      else if (pn.id === "calha") it = pnCalhaEmbutida(D, g, c.r);
      else if (cxsReais.length) it = pnReservatorioReal(D, g, cxsReais[0]);
      else it = pnCaixa(D, g, ["TAMPA", "ENTRADA COM BOIA", "SAÍDA (barrilete)", "NÍVEL DE OPERAÇÃO", "LIMPEZA"], false);
      var yFim = chamadas(D, it, gx + gw + cw * 0.06, gy, gy + gh, h);
      var yT = Math.max(gy + gh, yFim) + T.nota * 2;
      if (it.fonte) { c.AP.quebrar(it.fonte, h, cw - 6).forEach(function (ln, q) { D.texto(px + 2, yT + q * h * K2.notaLinha, ln, h, {}); }); yT += h * K2.notaLinha * 2 + K2.notaEntre; }
      if (pn.id === "res" && cxsReais.length) tabelaCaixasReais(D, c, px + 2, yT, cw - 6, py + ch - 2, cxsReais);
      else if (pn.cat.length) tabelaCatalogo(D, c, px + 2, yT, cw - 6, pn.cat, py + ch - 2);
      else if (pn.id === "calha") D.texto(px + 2, yT + h, "Bocal, lâmina e ladrão de cada telhado: memorial de cálculo.", h, {});
      else D.texto(px + 2, yT + h, "Registros e DN conforme o esquema vertical e a planta de água fria.", h, {});
    });
    c.prims.push({ linhas: [], simbolos: [], textos: [], trechos: [] });
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ QUADRO DE MATERIAIS (com o ícone da peça) */
  function linhasQuadro(c) {
    var PC = PEC(), B = BI(), est = c.modelo && c.modelo.estado, L = null;
    try { if (PC && B && est) L = PC.listaMaterial(B.qto(est, c.modelo.avaliarFam), arr(est.familias)); } catch (e) { L = null; }
    if (!L) return null;
    var por = {}, ordem = [], SO = ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "industrial", "gas", ""];
    L.forEach(function (x) {
      var k = txt(x.sistema) + "|" + txt(x.descricao) + "|" + txt(x.unidade);
      if (!por[k]) { por[k] = { sistema: txt(x.sistema), descricao: txt(x.descricao), unidade: txt(x.unidade) || "un", icone: txt(x.icone), quantidade: 0 }; ordem.push(k); }
      if (typeof x.quantidade === "number") por[k].quantidade += x.quantidade;
    });
    function cls(i) { return /^tubo-/.test(i) ? 0 : /^cx-/.test(i) ? 1 : /^ac-/.test(i) ? 2 : /^pc-/.test(i) ? 3 : 4; }
    return ordem.map(function (k) { return por[k]; }).sort(function (a, b) { var sa = SO.indexOf(a.sistema), sb = SO.indexOf(b.sistema); return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || cls(a.icone) - cls(b.icone) || (a.descricao < b.descricao ? -1 : 1); });
  }
  /* o ícone vetorial da peça (a mesma convenção da planta: tubo cheio na cor do sistema, conexão branca com contorno) */
  function iconePeca(D, ic, sis, x, y, w, h) {
    var cor = (D.E.camadas["HID-" + (CAMADA_SIS[sis] || "AF") + "-TUBO"] || {}).cor || "#000", e = h * 0.3, cx = x + w / 2, cy = y + h / 2;
    function P(pts) { poliCheio(D, pts, "#ffffff", "#000", K2.contornoTubo * 1.5); }
    if (/^tubo-/.test(ic)) { poliCheio(D, [[x + 1, cy - e / 2], [x + w - 1, cy - e / 2], [x + w - 1, cy + e / 2], [x + 1, cy + e / 2]], cor, "#000", K2.contornoTubo); return; }
    if (/joelho90/.test(ic)) { P([[x + 1, cy - e / 2], [cx + e / 2, cy - e / 2], [cx + e / 2, y + h - 0.5], [cx - e / 2, y + h - 0.5], [cx - e / 2, cy + e / 2], [x + 1, cy + e / 2]]); return; }
    if (/joelho45|curva/.test(ic)) { P([[x + 1, cy - e / 2], [cx, cy - e / 2], [cx + h * 0.35, y + h - 0.8], [cx + h * 0.35 - e, y + h - 0.3], [cx - e * 0.3, cy + e / 2], [x + 1, cy + e / 2]]); return; }
    if (/juncao/.test(ic)) { P([[x + 1, cy - e / 2], [x + w - 1, cy - e / 2], [x + w - 1, cy + e / 2], [cx + e, cy + e / 2], [cx + e * 2.2, y + h - 0.3], [cx + e * 1.2, y + h - 0.3], [cx, cy + e / 2], [x + 1, cy + e / 2]]); return; }
    if (/-te/.test(ic)) { P([[x + 1, cy - e / 2], [x + w - 1, cy - e / 2], [x + w - 1, cy + e / 2], [cx + e / 2, cy + e / 2], [cx + e / 2, y + h - 0.3], [cx - e / 2, y + h - 0.3], [cx - e / 2, cy + e / 2], [x + 1, cy + e / 2]]); return; }
    if (/reducao|bucha/.test(ic)) { P([[x + 1.5, cy - e * 0.8], [cx, cy - e * 0.8], [x + w - 1.5, cy - e * 0.4], [x + w - 1.5, cy + e * 0.4], [cx, cy + e * 0.8], [x + 1.5, cy + e * 0.8]]); return; }
    if (/luva|tampao|cap/.test(ic)) { P([[cx - w * 0.2, cy - e * 0.7], [cx + w * 0.2, cy - e * 0.7], [cx + w * 0.2, cy + e * 0.7], [cx - w * 0.2, cy + e * 0.7]]); return; }
    if (/^ac-/.test(ic)) { D.poli([[cx - h * 0.4, cy - h * 0.3], [cx + h * 0.4, cy + h * 0.3], [cx + h * 0.4, cy - h * 0.3], [cx - h * 0.4, cy + h * 0.3]], "HID-SIMBOLO", true); return; }
    if (/^pc-/.test(ic)) { P([[cx - h * 0.4, cy - h * 0.4], [cx + h * 0.4, cy - h * 0.4], [cx + h * 0.4, cy + h * 0.4], [cx - h * 0.4, cy + h * 0.4]]); for (var g = 1; g < 4; g++) D.linha(cx - h * 0.4 + h * 0.2 * g, cy - h * 0.3, cx - h * 0.4 + h * 0.2 * g, cy + h * 0.3, "HID-COTA"); return; }
    if (/bacia/.test(ic)) { var o = []; for (var k = 0; k <= 12; k++) { var t = Math.PI * k / 12; o.push([cx - w * 0.15 + Math.sin(t) * w * 0.3, cy - Math.cos(t) * h * 0.38]); } o.push([cx - w * 0.15, cy + h * 0.38]); P(o); return; }
    if (/chuveiro|ducha/.test(ic)) { D.circ(cx, cy, h * 0.35, "HID-SIMBOLO"); D.ponto(cx, cy, h * 0.08, "#000"); return; }
    P([[cx - w * 0.3, cy - h * 0.35], [cx + w * 0.3, cy - h * 0.35], [cx + w * 0.3, cy + h * 0.35], [cx - w * 0.3, cy + h * 0.35]]);
    if (/lavatorio|cuba|pia|tanque/.test(ic)) D.circ(cx, cy, h * 0.15, "HID-SIMBOLO");
  }
  var NOME_SIS_Q = { agua_fria: "ÁGUA FRIA", agua_quente: "ÁGUA QUENTE", esgoto: "ESGOTO", ventilacao: "VENTILAÇÃO", pluvial: "ÁGUAS PLUVIAIS", incendio: "INCÊNDIO", industrial: "FLUIDO INDUSTRIAL", gas: "GÁS (GLP)", "": "LOUÇAS, METAIS E EQUIPAMENTOS" };
  function paginarQuadro(c, linhas) {
    var a = c.geo.area, Q = K2.quadro, porCol = Math.floor((a.h - K2.titulo - Q.cab - 4) / Q.linha), nCol = a.w >= 2 * 280 ? 2 : 1, out = [], atual = null, col = 0, nl = 0, sisAnt = null;   // hid:ok largura mínima de uma coluna do quadro (mm)
    linhas.forEach(function (ln) {
      var precisa = ln.sistema !== sisAnt ? 2 : 1;
      if (!atual || nl + precisa > porCol) { if (atual && col + 1 < nCol) { col++; } else { atual = { cols: [] }; out.push(atual); col = 0; } atual.cols[col] = atual.cols[col] || []; nl = 0; sisAnt = null; precisa = 2; }
      atual.cols[col] = atual.cols[col] || [];
      if (ln.sistema !== sisAnt) { atual.cols[col].push({ grupo: NOME_SIS_Q[ln.sistema] || ln.sistema.toUpperCase() }); nl++; sisAnt = ln.sistema; }
      atual.cols[col].push(ln); nl++;
    });
    return { paginas: out, nCol: nCol };
  }
  function folhaQuadro(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, Q = K2.quadro, pg = c.quadroPagina, h = T.minimo;
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "Quantidades do modelo (tubo em m, peças em un) - mesma lista do memorial e da planilha");
    if (!pg) { D.texto(a.x + K2.erroX, a.y + K2.vazioY, "Lista de material indisponível (js/hidpecas.js não carregou): não verificado.", T.nota, { cor: K2.vermelho }); return { escala: "-" }; }
    var nCol = c.quadroNCol, cwTot = (a.w - (nCol - 1) * Q.gap) / nCol;
    pg.cols.forEach(function (lin, ci) {
      var x0 = a.x + ci * (cwTot + Q.gap), y = a.y + K2.titulo, ws = Q.col.slice(), fixo = ws.reduce(function (s0, v) { return s0 + v; }, 0);
      ws[1] = cwTot - fixo; var xs = [x0]; ws.forEach(function (w) { xs.push(xs[xs.length - 1] + w); });
      var cab = ["ÍCONE", "DESCRIÇÃO", "SISTEMA", "UN", "QUANT."];
      D.linha(x0, y, x0 + cwTot, y, "HID-TABELA");
      cab.forEach(function (t, k) { D.texto(k === 1 ? xs[k] + 1.5 : (xs[k] + xs[k + 1]) / 2, y + Q.cab * 0.68, t, T.nota * 0.9, { al: k === 1 ? "E" : "C", peso: 0.16 }); });
      xs.forEach(function (x) { D.linha(x, y, x, y + Q.cab, "HID-TABELA"); });
      y += Q.cab; D.linha(x0, y, x0 + cwTot, y, "HID-TABELA");
      lin.forEach(function (ln) {
        /* a linha do GRUPO (sistema) atravessa a tabela inteira: só as bordas, sem as divisões das colunas */
        if (ln.grupo) { D.linha(x0, y, x0, y + Q.linha, "HID-TABELA"); D.linha(x0 + cwTot, y, x0 + cwTot, y + Q.linha, "HID-TABELA"); D.texto(x0 + 1.5, y + Q.linha * 0.68, ln.grupo, h, { peso: 0.2 }); y += Q.linha; D.linha(x0, y, x0 + cwTot, y, "HID-COTA"); return; }
        xs.forEach(function (x) { D.linha(x, y, x, y + Q.linha, "HID-TABELA"); });
        iconePeca(D, ln.icone, ln.sistema, xs[0] + (ws[0] - Q.icone) / 2, y + 0.6, Q.icone, Q.linha - 1.2);
        var ds = c.AP.quebrar(ln.descricao, h, ws[1] - 3)[0], cortou = ds !== ln.descricao;
        D.texto(xs[1] + 1.5, y + Q.linha * 0.68, cortou ? ds.replace(/.{0,3}$/, "...") : ds, h, {});
        D.texto((xs[2] + xs[3]) / 2, y + Q.linha * 0.68, (CAMADA_SIS[ln.sistema] || "-"), h, { al: "C" });
        D.texto((xs[3] + xs[4]) / 2, y + Q.linha * 0.68, ln.unidade, h, { al: "C" });
        D.texto(xs[5] - 1.5, y + Q.linha * 0.68, br(ln.quantidade, ln.unidade === "m" ? 2 : 0), h, { al: "D" });
        y += Q.linha; D.linha(x0, y, x0 + cwTot, y, "HID-COTA");
      });
      D.linha(x0, y, x0 + cwTot, y, "HID-TABELA");
    });
    c.prims.push({ linhas: [], simbolos: [], textos: [], trechos: [] });
    return { escala: "-" };
  }

  /* ------------------------------------------------------------ FOLHA DE NOTAS (o que não coube na coluna) */
  function folhaNotas(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, h = T.nota, larg0 = Math.min(160, a.w), nc = Math.max(1, Math.floor(a.w / (larg0 + 10))), cw = (a.w - (nc - 1) * 10) / nc;   // hid:ok largura de coluna de texto (mm)
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "");
    var col = 0, y = a.y + K2.titulo + 2, yMax = a.y + a.h - 2;
    function prox() { col++; y = a.y + K2.titulo + 2; }
    arr(c.blocosExtra).forEach(function (b) {
      if (y + h * 3 > yMax) prox();
      var x = a.x + col * (cw + 10);
      D.texto(x, y + T.titulo * 0.76, b.titulo, T.titulo * 0.8, { peso: 0.26, cor: b.cor }); y += T.titulo * 1.4;
      b.itens.forEach(function (it, i) {
        var o = it && typeof it === "object" ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", ls = c.AP.quebrar(o.t, h, cw - larg(pre, h));
        if (y + ls.length * h * K2.notaLinha > yMax) { prox(); x = a.x + col * (cw + 10); }
        D.texto(x, y + h * KI0(), pre, h, { cor: o.cor || b.cor });
        ls.forEach(function (s) { D.texto(x + larg(pre, h), y + h * KI0(), s, h, { cor: o.cor || b.cor }); y += h * K2.notaLinha; });
        y += K2.notaEntre;
      });
      y += K2.blocoEntre;
    });
    if (col >= nc) c.avisos.push("Folha " + dois(c.n) + ": as notas passaram da área da folha — usar folha maior.");
    c.prims.push({ linhas: [], simbolos: [], textos: [], trechos: [] });
    return { escala: "-" };
  }

  /* ------------------------------------------------------------ QR do portal da obra (módulos do qrcode-generator, vetor) */
  function desenharQr(D, texto, x, y, lado) {
    var lib = QRL(); if (!lib || !texto) return false;
    var q; try { q = lib(0, "M"); q.addData(String(texto)); q.make(); } catch (e) { return false; }
    var nm = q.getModuleCount(), m = 4, u = lado / (nm + 2 * m), r, cc;
    D.fundo(x, y, lado, lado, "#fff");
    for (r = 0; r < nm; r++) for (cc = 0; cc < nm; cc++) if (q.isDark(r, cc)) D.fundo(x + (cc + m) * u, y + (r + m) * u, u, u, "#000");
    return true;
  }

  /* ------------------------------------------------------------ CONFERÊNCIA: rótulo × tubo e rótulo × cota (além de rótulo × rótulo) */
  function segQuad(sg, q, enc) {
    /* o segmento atravessa o INTERIOR do quadrilátero do texto (encolhido de `enc` mm)? */
    var p0 = q[0], ux = q[1][0] - p0[0], uy = q[1][1] - p0[1], vx = q[3][0] - p0[0], vy = q[3][1] - p0[1], lu = Math.sqrt(ux * ux + uy * uy), lv = Math.sqrt(vx * vx + vy * vy);
    if (lu < 1e-9 || lv < 1e-9) return false;
    function loc(x, y) { var dx = x - p0[0], dy = y - p0[1]; return [(dx * ux + dy * uy) / lu, (dx * vx + dy * vy) / lv]; }
    var A = loc(sg[0], sg[1]), B = loc(sg[2], sg[3]), t0 = 0, t1 = 1, d = [B[0] - A[0], B[1] - A[1]];
    var lim = [[-d[0], A[0] - enc], [d[0], lu - enc - A[0]], [-d[1], A[1] - enc], [d[1], lv - enc - A[1]]];
    for (var i = 0; i < 4; i++) {
      var pp = lim[i][0], qq = lim[i][1];
      if (Math.abs(pp) < 1e-12) { if (qq < 0) return false; continue; }
      var r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 < t1;
  }
  function conferirFolha(caixas, chk) {
    var tubo = [], cota = [], enc = 0.15;
    caixas.forEach(function (cx) {
      arr(chk && chk.tubos).forEach(function (sg) { if (segQuad(sg, cx.p, enc) && tubo.length < K2.parEx * 4) tubo.push([cx.s, sg.id || "tubo"]); });
      arr(chk && chk.cotas).forEach(function (sg) { if (segQuad(sg, cx.p, enc) && cota.length < K2.parEx * 4) cota.push([cx.s, "cota"]); });
    });
    return { rotuloTubo: tubo, rotuloCota: cota };
  }

  /* ------------------------------------------------------------ DXF (todas as folhas, lado a lado, com o carimbo) */
  var ACI = (function () {
    var o = [[1, "#ff0000"], [2, "#ffff00"], [3, "#00ff00"], [4, "#00ffff"], [5, "#0000ff"], [6, "#ff00ff"], [7, "#000000"], [8, "#808080"], [9, "#c0c0c0"]];
    for (var k = 1; k < 25; k++) {   // hid:ok a rampa de cores do ACI: índice k·10 = matiz 15°·(k−1) com saturação cheia, k·10+4 = metade do brilho
      var hue = (k - 1) * 15, rgb = hsv(hue);
      o.push([k * 10, rgb]); o.push([k * 10 + 4, hsv(hue, 0.5)]);   // hid:ok idem
    }
    function hsv(hh, v) {
      v = v == null ? 1 : v;
      var cc = v, xx = cc * (1 - Math.abs((hh / 60) % 2 - 1)), r = 0, g = 0, b = 0, s0 = Math.floor(hh / 60);   // hid:ok setor de 60° do HSV
      if (s0 === 0) { r = cc; g = xx; } else if (s0 === 1) { r = xx; g = cc; } else if (s0 === 2) { g = cc; b = xx; } else if (s0 === 3) { g = xx; b = cc; } else if (s0 === 4) { r = xx; b = cc; } else { r = cc; b = xx; }
      function h2(v2) { var s2 = Math.round(v2 * 255).toString(16); return s2.length < 2 ? "0" + s2 : s2; }   // hid:ok byte da cor
      return "#" + h2(r) + h2(g) + h2(b);
    }
    return o;
  })();
  function aciDe(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(txt(hex)); if (!m) return 7;   // hid:ok ACI 7 = preto/branco
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), best = 7, bd = Infinity;   // hid:ok base hexadecimal
    ACI.forEach(function (a) { var q = /^#(..)(..)(..)$/.exec(a[1]), d = Math.pow(r - parseInt(q[1], 16), 2) + Math.pow(g - parseInt(q[2], 16), 2) + Math.pow(b - parseInt(q[3], 16), 2); if (d < bd) { bd = d; best = a[0]; } });   // hid:ok base hexadecimal
    return best;
  }
  function atributos(s) { var o = {}, re = /([\w:-]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function desesc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"); }
  function paraDxf(r) {
    var X = DXF(); if (!X || !r || !r.ok || !r.folhas.length) return null;
    var doc = X.novoDoc({ unidade: "mm" }), E = estilo(), gap = K2.folgaFolha * 8;
    doc.escala = 1;
    /* a camada vem do data-cam do SVG; o que é da FOLHA (moldura, carimbo, coluna de legenda) vai para FOLHA-* — a
       conferência de sobreposição olha só o desenho (HID-*) */
    function camada(cam, folha, a) {
      var nome = txt(cam), cm = E.camadas[nome] || {}, st = a.stroke && a.stroke !== "none" ? a.stroke : a.fill;
      if (folha) nome = /MOLDURA/.test(nome) ? "FOLHA-MOLDURA" : (/-TUBO$/.test(nome) ? "FOLHA-LEGENDA" : "FOLHA-CARIMBO");
      else if (!/^HID-/.test(nome)) nome = "HID-SIMBOLO";
      doc.especificar(nome, cm.mm || +a["stroke-width"] || 0.18, (a["stroke-dasharray"] || cm.dash) ? "TRACEJADO" : null, aciDe(cm.cor || st || "#000"));
      return doc.camada(nome);
    }
    var x0 = 0;
    r.folhas.forEach(function (f) {
      var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(f.svg) || [], W = +vb[1] || 0, Hp = +vb[2] || 0, corte = f.svg.indexOf('<g data-folha-moldura="1">');
      function P(x, y) { return [x0 + (+x), Hp - (+y)]; }
      var re = /<(line|polygon|polyline|rect|circle|text)\b([^>]*?)(\/?)>([^<]*)/g, m;
      while ((m = re.exec(f.svg))) {
        var tag = m[1], a = atributos(m[2]), fill = a.fill, st = a.stroke && a.stroke !== "none" ? a.stroke : null, folha = corte >= 0 && m.index > corte, cam = a["data-cam"];
        if (tag === "line" && st) { var p1 = P(a.x1, a.y1), p2 = P(a.x2, a.y2); doc.linha(camada(cam, folha, a), p1[0], p1[1], p2[0], p2[1]); }
        else if (tag === "polygon" || tag === "polyline") {
          var pts = txt(a.points).trim().split(/\s+/).map(function (q) { var v = q.split(","); return P(v[0], v[1]); });
          if (tag === "polygon" && fill && fill !== "none" && pts.length > 2 && !/^#f+$/i.test(fill)) doc.hachura(doc.camada((folha ? "FOLHA" : cam || "HID-SIMBOLO") + "-CHEIO", 0.13, null, aciDe(fill)), [pts], 1, true);
          if (st) doc.poli(camada(cam, folha, a), pts, tag === "polygon");
        }
        else if (tag === "rect") {
          var x = +a.x, y = +a.y, w = +a.width, h = +a.height, q4 = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
          if (st) doc.poli(camada(cam, folha, a), q4, true);
          else if (fill === "#000") doc.hachura(doc.camada("FOLHA-QR", 0.13, null, 7), [q4], 1, true);   // hid:ok ACI 7
        }
        else if (tag === "circle") { var pc = P(a.cx, a.cy); if (st) doc.circulo(camada(cam, folha, a), pc[0], pc[1], +a.r); else if (fill && fill !== "none") doc.hachura(doc.camada(folha ? "FOLHA-CHEIO" : "HID-SIMBOLO-CHEIO", 0.13, null, 7), [circPts(pc, +a.r)], 1, true); }   // hid:ok ACI 7
        else if (tag === "text" && m[3] !== "/") {
          var s = desesc(m[4]); if (!s.trim()) continue;
          var pt = P(a.x, a.y), rt = /rotate\(([-\d.eE]+)/.exec(a.transform || ""), al = a["text-anchor"], fs = +a["font-size"], ang = rt ? -(+rt[1]) : 0;
          var red = a.fill && a.fill !== "#000" && a.fill !== "none";
          var cT = doc.camada(folha ? (red ? "FOLHA-TEXTO-PEND" : "FOLHA-TEXTO") : (red ? "HID-TEXTO-PEND" : "HID-TEXTO"), 0.18, null, red ? aciDe(a.fill) : 7);   // hid:ok ACI 7
          if (al === "end") { var wl = larg(s, fs), ra = ang * Math.PI / 180; pt = [pt[0] - wl * Math.cos(ra), pt[1] - wl * Math.sin(ra)]; }
          doc.texto(cT, pt[0], pt[1], fs * K2.letraDxf, s, ang, al === "middle");
        }
      }
      x0 += W + gap;
    });
    return X.escrever(doc);
  }
  function circPts(c, r) { var o = []; for (var i = 0; i < 16; i++) o.push([c[0] + r * Math.cos(i * Math.PI / 8), c[1] + r * Math.sin(i * Math.PI / 8)]); return o; }   // hid:ok 16 lados do círculo

  /* ------------------------------------------------------------ CONFIGURAÇÃO DA TELA "GERAR PRANCHAS" */
  var CONJUNTOS = ["plantas", "cortes", "isometricos", "perspectivas", "ambientes", "esquema", "detalhes", "quadro"];
  var ROTULO_CONJUNTO = { plantas: "Plantas por pavimento e sistema", cortes: "Cortes das paredes hidráulicas", isometricos: "Isométricos por ambiente (unifilar)", perspectivas: "Perspectiva isométrica 3D por ambiente", ambientes: "Isométrico por ambiente (planta, isométrico com balões, tabelas)",
                          esquema: "Esquema vertical", detalhes: "Detalhes típicos", quadro: "Quadro de materiais" };
  var SISTEMAS_FOLHA = ["agua_fria", "agua_quente", "esgoto", "pluvial", "incendio", "industrial", "gas", "tratamento"];
  var FORMATOS_OK = ["AUTO", "A0", "A1", "A2", "A3", "A4"];
  /* FOLHA AUTOMÁTICA: a menor (A3 → A0) em que a maior planta cabe na escala fixa (ou na 1:50); banheiro pequeno não vai
     para uma A1 vazia. A A4 fica fora do automático: a coluna de legenda dela é estreita demais para a planta. */
  function formatoAuto(P, rede, pavs, cfg) {
    var W = 0, Hh = 0, m = K2.ambFolga * 2;
    pavs.forEach(function (pv) {
      ["agua_fria", "agua_quente", "esgoto", "pluvial", "incendio", "industrial", "gas"].forEach(function (sis) {
        var trs = trechosDoPav(rede, sis, pv); if (!trs.length) return;
        var xs = [], zs = []; trs.forEach(function (t) { xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); });
        W = Math.max(W, Math.max.apply(null, xs) - Math.min.apply(null, xs) + m); Hh = Math.max(Hh, Math.max.apply(null, zs) - Math.min.apply(null, zs) + m);
      });
    });
    var e = num(cfg.escala, null) || K2.escalaAlvo, s = 1000 / e, folga = HI().K.margem * 2 + K2.folgaFolha;
    for (var i = 0; i < K2.formatosAuto.length; i++) {
      var g = P.geometria(K2.formatosAuto[i], "paisagem", "RA");
      if (W * s + folga <= g.area.w && Hh * s + folga + K2.titulo <= g.area.h) return K2.formatosAuto[i];
    }
    return K2.formatosAuto[K2.formatosAuto.length - 1];
  }
  function configPadrao() {
    var cj = {}; CONJUNTOS.forEach(function (k) { cj[k] = k !== "ambientes"; });   /* R01: o isométrico por ambiente (js/hidcaderno.js) só sai quando o conjunto é pedido (conjuntos.ambientes = true) */
    return { versao: 1, sistemas: [], formato: "AUTO", escala: "auto", prefixo: "HID", revisao: "R00", descricaoRevisao: "EMISSÃO INICIAL - PROJETO EXECUTIVO",
             nivelPlanta: "medio", arquitetura: true, agrupar: true, qr: "", conjuntos: cj, perspectiva: { vista: "SE", ambientes: [] } };
  }
  function normalizarConfig(c0) {
    var c = c0 && typeof c0 === "object" ? c0 : {}, p = configPadrao();
    if (FORMATOS_OK.indexOf(txt(c.formato).toUpperCase()) >= 0) p.formato = txt(c.formato).toUpperCase();
    var e = num(c.escala, null); if (e && K2.escalas.indexOf(e) >= 0) p.escala = e;
    var px = txt(c.prefixo).toUpperCase().replace(/[^A-Z0-9-]/g, ""); if (px) p.prefixo = px.slice(0, 12);   // hid:ok tamanho máximo do prefixo (texto)
    var rv = txt(c.revisao).toUpperCase().trim(); if (/^R\d{1,3}$/.test(rv)) p.revisao = rv; else if (/^\d{1,3}$/.test(rv)) p.revisao = "R" + dois(+rv);
    if (txt(c.descricaoRevisao).trim()) p.descricaoRevisao = txt(c.descricaoRevisao).trim();
    if (c.nivelPlanta === "baixo") p.nivelPlanta = "baixo";
    if (c.arquitetura === false) p.arquitetura = false;
    if (c.agrupar === false) p.agrupar = false;
    if (txt(c.qr).trim()) p.qr = txt(c.qr).trim();
    p.notasExtra = arr(c.notasExtra).map(txt).filter(function (x) { return x.trim(); });   /* Casa 487 (F9): notas do PROJETO nas NOTAS GERAIS de toda folha (ex.: pilar que o tubo não atravessa) */
    p.sistemas = arr(c.sistemas).filter(function (s) { return SISTEMAS_FOLHA.indexOf(s) >= 0; });
    var pp = c.perspectiva && typeof c.perspectiva === "object" ? c.perspectiva : {};
    if (QUADRANTE[txt(pp.vista).toUpperCase()] != null) p.perspectiva.vista = txt(pp.vista).toUpperCase();
    p.perspectiva.ambientes = arr(pp.ambientes).map(txt).filter(function (x) { return x; });
    var cj = c.conjuntos && typeof c.conjuntos === "object" ? c.conjuntos : {};
    CONJUNTOS.forEach(function (k) { if (cj[k] === false) p.conjuntos[k] = false; else if (k === "ambientes" && cj[k] === true) p.conjuntos[k] = true; });
    return p;
  }

  /* ------------------------------------------------------------ PERSPECTIVA ISOMÉTRICA POR AMBIENTE (pedido do Rogério, 18/10/2026)
   * A "perspectiva isométrica do banheiro" das pranchas de projeto hidrossanitário: o ambiente recortado (caixa justa com
   * folga), a arquitetura em meio-tom translúcida (paredes e piso), a tubulação em 3D na cor do sistema do padrão com o
   * diâmetro externo real, conexões brancas, louças e caixas como volumes, rótulo de sistema e DN nos trechos, cota de
   * ALTURA de cada ponto (água, esgoto, registro) e do piso, legenda de sistemas e de peças com ícone. Vetor (PDF/DXF),
   * sem escala, isométrico a 30° visto de um dos 4 quadrantes (cfg.perspectiva.vista: SE, SO, NO, NE). */
  var QUADRANTE = { SE: 0, SO: 1, NO: 2, NE: 3 };
  function projetor(vista) {
    var q = QUADRANTE[vista] == null ? 0 : QUADRANTE[vista], a = q * Math.PI / 2, co = Math.cos(a), si = Math.sin(a), C = HI().K.cos, Sn = HI().K.sen;
    var f = function (p) { var x = p.x * co - p.z * si, z = p.x * si + p.z * co; return { u: (x - z) * C, v: (x + z) * Sn - p.y, d: x + z + p.y, x: x, z: z }; };
    var vn = Math.sqrt((co + si) * (co + si) + 1 + (co - si) * (co - si));
    f.viewer = [(co + si) / vn, 1 / vn, (co - si) / vn];   /* a direção da cena para quem olha (gradiente de d) */
    return f;
  }
  /* o eixo da parede recortado pela caixa do ambiente (Liang-Barsky no plano) */
  function recortaEixo(w, b) {
    var A = [w.c[0] - w.u[0] * w.L / 2, w.c[1] - w.u[1] * w.L / 2], d = [w.u[0] * w.L, w.u[1] * w.L], t0 = 0, t1 = 1;
    var lim = [[-d[0], A[0] - b.x0], [d[0], b.x1 - A[0]], [-d[1], A[1] - b.z0], [d[1], b.z1 - A[1]]];
    for (var i = 0; i < 4; i++) {
      var p = lim[i][0], q = lim[i][1];
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      var r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-3 ? { a: [A[0] + d[0] * t0, A[1] + d[1] * t0], b: [A[0] + d[0] * t1, A[1] + d[1] * t1] } : null;
  }
  /* um prisma (base no plano, de y0 a y1) → as faces que o observador vê, com profundidade para o pintor */
  function prisma(pl, y0, y1, P) {
    var out = [], n = pl.length, cx = 0, cz = 0; pl.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= n; cz /= n;
    var top = pl.map(function (q) { return P({ x: q[0], y: y1, z: q[1] }); });
    for (var i = 0; i < n; i++) {
      var a = pl[i], b = pl[(i + 1) % n], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = mx - cx, nz = mz - cz;
      var pm = P({ x: mx + nx, y: 0, z: mz + nz }), pc = P({ x: mx, y: 0, z: mz });
      if (pm.d - pc.d <= 1e-9) continue;   /* face de costas */
      out.push({ pts: [P({ x: a[0], y: y0, z: a[1] }), P({ x: b[0], y: y0, z: b[1] }), P({ x: b[0], y: y1, z: b[1] }), P({ x: a[0], y: y1, z: a[1] })], d: pc.d });
    }
    out.push({ pts: top, d: P({ x: cx, y: y1, z: cz }).d, topo: true });
    return out;
  }
  function perspectivaDe(c, amb, pv) {
    var est = c.modelo.estado, B = BI(), G = GEO(), vista = (c.cfg && c.cfg.perspectiva && c.cfg.perspectiva.vista) || "SE", P = projetor(vista);
    var b = { x0: amb.x0, x1: amb.x1, z0: amb.z0, z1: amb.z1 }, KI = HI().K;
    function dentro(p, f) { f = f || (c.grupo ? 0.12 : 0);   /* HIDRO-3D: no caderno por grupo o recorte é o MESMO da tabela (hidcaderno.dadosAmbiente, folga 0,12 m): toda linha da tabela tem a peça no isométrico */ return p.x >= b.x0 - f && p.x <= b.x1 + f && p.z >= b.z0 - f && p.z <= b.z1 + f; }
    var b0 = pv.base != null ? pv.base : pv.cota - K2.cortePiso, b1 = pv.sup != null ? pv.sup : pv.topo;
    var trs = arr(c.rede.trechos).filter(function (t) { var m = { x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }, ym = (t.p1.y + t.p2.y) / 2; return t.sistema !== "incendio" && dentro(m) && ym >= b0 - KI.tolPiso_m && ym < b1; });
    if (!trs.length) return null;
    var ys = []; trs.forEach(function (t) { ys.push(t.p1.y, t.p2.y); });
    var yB = Math.min(pv.cota - K2.perspFundo, Math.min.apply(null, ys)), yT = Math.max.apply(null, ys);
    /* o teto do recorte: a parede mais alta do ambiente (o ventilador que sobe à cobertura sai INTERROMPIDO nele) */
    var yTeto = pv.cota + K2.perspAltura; paredesDoPav(est, pv).forEach(function (w) { if (recortaEixo(w, b)) yTeto = Math.max(yTeto, Math.min(w.y1, pv.cota + K2.perspAlturaMax)); });
    yT = Math.min(yT, yTeto);
    if (c.cortaY) yT = Math.min(yT, pv.cota + c.cortaY);   /* HIDRO-3D: detalhe por grupo - o prumo (ventilação) sai INTERROMPIDO acima desta altura do piso, como a folha da Tânia */
    var par3d = [], faces = [], itens = [], cBox = P({ x: (b.x0 + b.x1) / 2, y: 0, z: (b.z0 + b.z1) / 2 }).d;
    /* arquitetura: piso e paredes recortadas pela caixa (até a altura do tubo mais alto + folga) */
    paredesDoPav(est, pv).forEach(function (w) {
      var r = recortaEixo(w, { x0: b.x0 - w.esp, x1: b.x1 + w.esp, z0: b.z0 - w.esp, z1: b.z1 + w.esp }); if (!r) return;
      /* só as paredes do FUNDO (as da frente cortadas, como na perspectiva de banheiro das pranchas de projeto) */
      if (P({ x: (r.a[0] + r.b[0]) / 2, y: 0, z: (r.a[1] + r.b[1]) / 2 }).d > cBox + K2.perspFrente) return;
      var he = w.esp / 2, pl = [[r.a[0] - w.n[0] * he, r.a[1] - w.n[1] * he], [r.b[0] - w.n[0] * he, r.b[1] - w.n[1] * he], [r.b[0] + w.n[0] * he, r.b[1] + w.n[1] * he], [r.a[0] + w.n[0] * he, r.a[1] + w.n[1] * he]];
      prisma(pl, Math.max(w.y0, pv.cota), Math.min(w.y1, yT + K2.perspTopo), P).forEach(function (f) { faces.push(f); });
      par3d.push({ pl: pl, y0: Math.max(w.y0, pv.cota), y1: Math.min(w.y1, yT + K2.perspTopo) });   /* HIDRO-3D: a mesma parede em 3D para o render */
    });
    var piso = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(function (q) { return P({ x: q[0], y: pv.cota, z: q[1] }); });
    /* louças, metais e equipamentos: as LINHAS da malha real (silhueta e vincos vistos desta direção), em meio-tom — a louça
       é transparente e o esgoto que passa atrás dela aparece inteiro */
    var loucas = [];
    try { loucas = linhasLoucas(est, c.modelo.avaliarFam, P.viewer, function (fi) { return dentro(fi) && fi.y >= b0 - KI.tolPiso_m && fi.y < b1; }); } catch (e) { loucas = []; }
    /* HIDRO-3D: no caderno por grupo a louça/móvel acima do recorte (chaminé da churrasqueira, armário alto) sai do enquadramento: o isométrico mostra o que está na altura da instalação */
    if (c.grupo) loucas = loucas.filter(function (sg) { return sg[0][1] <= yT + 0.5 && sg[1][1] <= yT + 0.5; });
    /* tubos com o DE real, conexões brancas, caixas */
    trs.forEach(function (t) {
      var k = null; try { k = G ? G.cotasTubo(t.material, t.dn) : null; } catch (e) { k = null; }
      /* o trecho que sai do ambiente (barrilete, coletor) é recortado na caixa: a perspectiva é SÓ do cômodo */
      var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, ta = 0, tb = 1, f0 = K2.folgaAmb, lim = [[-dx, t.p1.x - (b.x0 - f0)], [dx, (b.x1 + f0) - t.p1.x], [-dz, t.p1.z - (b.z0 - f0)], [dz, (b.z1 + f0) - t.p1.z]];
      for (var li = 0; li < 4; li++) { var lp = lim[li][0], lq = lim[li][1]; if (Math.abs(lp) < 1e-12) continue; var lr = lq / lp; if (lp < 0) { if (lr > ta) ta = lr; } else if (lr < tb) tb = lr; }
      if (tb - ta < 1e-6) return;
      function em(f) { return { x: t.p1.x + dx * f, y: t.p1.y + (t.p2.y - t.p1.y) * f, z: t.p1.z + dz * f }; }
      var c1 = em(ta), c2 = em(tb);
      var q1 = { x: c1.x, y: Math.min(c1.y, yT), z: c1.z }, q2 = { x: c2.x, y: Math.min(c2.y, yT), z: c2.z }, cortado = c1.y > yT + KI.tolPiso_m || c2.y > yT + KI.tolPiso_m;
      var a = P(q1), bb = P(q2);
      itens.push({ tipo: "tubo", t: t, a: a, b: bb, q1: q1, q2: q2, ta: ta, tb: tb, cortado: cortado, de: (k && k.de > 0 ? k.de : +t.dn || 20) / 1000, d: (a.d + bb.d) / 2 });   // hid:ok mm → m
    });
    arr(c.rede.conexoes).forEach(function (cx) {
      if (!dentro(cx) || cx.y < b0 || cx.y >= b1 || cx.y > yT + KI.tolPiso_m || cx.sistema === "incendio") return;
      var k = null; try { k = G ? G.cotasConexao(cx.material, cx.tipo, cx.dn) : null; } catch (e) { k = null; }
      var p = P(cx); itens.push({ tipo: "conexao", p: p, cx: cx, r: (k && k.od > 0 ? k.od : (+cx.dn || 20) * K2.perspOd) / 2000, d: p.d + K2.perspFrente });   // hid:ok mm → m (raio)
    });
    arr(c.rede.pecas).forEach(function (k) {
      if (!dentro(k) || k.y < b0 || k.y >= b1) return;
      if (c.cortaY && k.y > yT + KI.tolPiso_m) return;   /* HIDRO-3D: acima do recorte do detalhe (terminal da ventilação): só na tabela, marcada */
      /* caixa sifonada / ralo: a TAMPA no piso com a grelha (como na planta), não um cubo */
      var Pc = B.PECAS[k.peca] || {}, hx = Pc.forma === "caixa" ? (Pc.w || K2.perspPeca * 2) / 2 : (Pc.r || K2.perspPeca), hz = Pc.forma === "caixa" ? (Pc.d || K2.perspPeca * 2) / 2 : (Pc.r || K2.perspPeca);
      var pl = [[k.x - hx, k.z - hz], [k.x + hx, k.z - hz], [k.x + hx, k.z + hz], [k.x - hx, k.z + hz]], gi = [];
      for (var g = 1; g < K2.perspGrade; g++) { var fx = -hx + 2 * hx * g / K2.perspGrade, fz = -hz + 2 * hz * g / K2.perspGrade; gi.push([P({ x: k.x + fx, y: k.y, z: k.z - hz }), P({ x: k.x + fx, y: k.y, z: k.z + hz })], [P({ x: k.x - hx, y: k.y, z: k.z + fz }), P({ x: k.x + hx, y: k.y, z: k.z + fz })]); }
      itens.push({ tipo: "peca", pts: pl.map(function (q) { return P({ x: q[0], y: k.y, z: q[1] }); }), grade: gi, d: P(k).d + K2.perspFrente, k: k });
    });
    var pontos = arr(c.rede.ligacoes).filter(function (l) { return l.tipo === "aparelho" && dentro(l) && l.y >= b0 && l.y < b1; });
    var acess = arr(c.rede.acessorios).filter(function (a) { return a.centro && dentro(a.centro) && a.centro.y >= b0 && a.centro.y < b1; });
    return { faces: faces, piso: piso, itens: itens, loucas: loucas, trs: trs, pontos: pontos, acess: acess, P: P, vista: vista, pv: pv, b: b, yB: yB, yT: yT, par3d: par3d };
  }
  function folhaPerspectiva(c) {
    var D = c.D, a = c.areaPersp || c.geo.area, T = D.E.T, KI = HI().K, pz = c.persp, h = KI.hPeq;
    /* R01: o isométrico por ambiente (hidcaderno.js) usa esta mesma perspectiva dentro de um RETÂNGULO da folha (c.areaPersp), sem título nem legenda própria (c.semLegenda) */
    if (!c.semLegenda) c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "SEM ESCALA - isométrico 30°, vista " + pz.vista + "; alturas em m do piso acabado");
    /* enquadramento: tudo projetado a k = 1, depois a escala que cabe acima da faixa da legenda */
    var us = [], vs = [];
    function junta(p) { us.push(p.u); vs.push(p.v); }
    pz.faces.forEach(function (f) { f.pts.forEach(junta); }); pz.piso.forEach(junta);
    pz.itens.forEach(function (it) { if (it.pts) it.pts.forEach(junta); if (it.a) { junta(it.a); junta(it.b); } if (it.p) junta(it.p); });
    pz.loucas.forEach(function (sg) { junta(pz.P({ x: sg[0][0], y: sg[0][1], z: sg[0][2] })); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
    var RA = c.raster || null;   /* HIDRO-3D: o isométrico é o RENDER do modelo 3D (js/hidrender3d.js): o raster cobre exatamente [u0,u1]x[v0,v1] */
    if (RA) { u0 = RA.u0; u1 = RA.u1; v0 = RA.v0; v1 = RA.v1; }
    /* HIDRO-3D: com a VISTA SALVA (c.vistaIso, js/hidvistaiso.js) as marcações são ANOTAÇÃO da vista: o desenho ocupa o miolo e as colunas dos balões ficam nas laterais */
    var HVm = c.vistaIso && RA ? (global.HidVistaIso || (typeof require === "function" ? require("./hidvistaiso.js") : null)) : null, aMarcacao = a;
    if (HVm) a = { x: a.x + HVm.K.colW, y: a.y, w: a.w - 2 * HVm.K.colW, h: a.h };
    var hLeg = c.semLegenda ? 0 : K2.perspLegenda, hTit = c.semLegenda ? 0 : K2.titulo, kMax = c.perspKMax || K2.perspKMax, mg = c.semLegenda ? (c.perspMargem != null ? c.perspMargem : K2.perspMargem) : K2.perspMargem;
    var k = Math.min((a.w - 2 * mg) / Math.max(u1 - u0, 1e-6), (a.h - hTit - hLeg - 2 * mg) / Math.max(v1 - v0, 1e-6), kMax);
    var ox = a.x + (a.w - (u1 - u0) * k) / 2 - u0 * k, oy = a.y + hTit + mg + (a.h - hTit - hLeg - 2 * mg - (v1 - v0) * k) / 2 - v0 * k;
    function X(p) { return [p.u * k + ox, p.v * k + oy]; }
    /* 1) arquitetura translúcida (atrás de tudo) */
    if (RA) {
      var pI = X({ u: u0, v: v0 }), pF = X({ u: u1, v: v1 });
      D.add('<rect x="' + n(pI[0]) + '" y="' + n(pI[1]) + '" width="' + n(pF[0] - pI[0]) + '" height="' + n(pF[1] - pI[1]) + '" fill="#ffffff" stroke="none"/>');
      D.add('<image data-im="' + RA.key + '" x="' + n(pI[0]) + '" y="' + n(pI[1]) + '" width="' + n(pF[0] - pI[0]) + '" height="' + n(pF[1] - pI[1]) + '" preserveAspectRatio="none" href="' + RA.href + '"/>');
      if (c.chk) c.chk.raster = (c.chk.raster || 0) + 1;
    } else {
    D.add('<polygon points="' + pz.piso.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="' + K2.arq.preench + '" fill-opacity="0.45" stroke="' + K2.arq.contorno + '" stroke-width="' + n(K2.arq.mm) + '" data-cam="HID-CONTEXTO"/>');
    pz.faces.sort(function (p, q) { return p.d - q.d; }).forEach(function (f) {
      D.add('<polygon points="' + f.pts.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="' + (f.topo ? K2.arq.louca : K2.arq.preench) + '" fill-opacity="' + K2.perspAlfa + '" stroke="' + K2.arq.contorno + '" stroke-width="' + n(K2.arq.mm) + '" data-cam="HID-CONTEXTO"/>');
    });
    /* 2) as louças em meio-tom (linhas da malha real), atrás da tubulação: transparentes */
    pz.loucas.forEach(function (sg) { var A0 = X(pz.P({ x: sg[0][0], y: sg[0][1], z: sg[0][2] })), B0 = X(pz.P({ x: sg[1][0], y: sg[1][1], z: sg[1][2] })); D.linha(A0[0], A0[1], B0[0], B0[1], "HID-LOUCA"); });
    }
    /* 3) instalações pela ordem de profundidade (pintor) */
    var seg = [], L = [], S = [], Tt = [], pend = [], bal = [];
    function tiraBal(id) { for (var ib = 0; ib < bal.length; ib++) if (bal[ib].id === id) { bal.splice(ib, 1); return; } }   /* a peça com chamada em caixa leva o código na própria chamada (sem balão duplicado) */
    function corDe(sis) { var cam = D.E.camadas["HID-" + (CAMADA_SIS[sis] || "AF") + "-TUBO"]; return cam ? cam.cor : "#000"; }
    /* caixa, ralo e conexão viram OBSTÁCULO dos rótulos (o texto não pousa em cima da peça) */
    function obst(pts) { var xs0 = pts.map(function (q) { return q[0]; }), ys0 = pts.map(function (q) { return q[1]; }); S.push({ tipo: "obst", x: 0, y: 0, r: 0, camada: "HID-SIMBOLO", box: [Math.min.apply(null, xs0), Math.min.apply(null, ys0), Math.max.apply(null, xs0), Math.max.apply(null, ys0)], id: "obst" + S.length, desenhado: true }); }
    pz.itens.sort(function (p, q) { return p.d - q.d; }).forEach(function (it) {
      if (it.tipo === "louca") { D.add('<polygon points="' + it.pts.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="#ffffff" fill-opacity="' + K2.perspAlfaLouca + '" stroke="' + K2.arq.louca + '" stroke-width="' + n(K2.contornoTubo * 1.4) + '" data-cam="HID-CONTEXTO"/>'); return; }
      if (it.tipo === "peca") { var pp2 = it.pts.map(X); if (!RA) { poliCheio(D, pp2, "#ffffff", "#444444", K2.contornoTubo * 1.4, "HID-CONEXAO"); arr(it.grade).forEach(function (gl) { var g0 = X(gl[0]), g1 = X(gl[1]); D.linha(g0[0], g0[1], g1[0], g1[1], "HID-CONEXAO"); }); } obst(pp2);
        var pcx = pp2.reduce(function (a0, q) { return [a0[0] + q[0] / pp2.length, a0[1] + q[1] / pp2.length]; }, [0, 0]);
        if (c.codigoConexao && it.k) { var cod2 = c.codigoConexao(it.k); if (cod2) bal.push({ cod: cod2, p: pcx, id: it.k.id, d0: K2.perspD0 * 3 }); }
        if (c.destaque && it.k) { var dt2 = c.destaque(it.k, "peca"); if (dt2 && c.agruparBaloes && c.codigoConexao) { var cq2 = c.codigoConexao(it.k); if (cq2) { dt2 = cq2 + "  " + dt2; tiraBal(it.k.id); } } if (dt2) pend.push({ s: dt2, h: h, tipo: "destaque", camada: "HID-TEXTO", trecho: it.k.id + "-dt", anchors: [pcx], prio: 2, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 * 5 }); }
        return; }
      if (it.tipo === "conexao") { var pc = X(it.p), r = Math.max(it.r * k, K2.perspMin); obst([[pc[0] - r, pc[1] - r], [pc[0] + r, pc[1] + r]]); if (!RA) D.add('<circle cx="' + n(pc[0]) + '" cy="' + n(pc[1]) + '" r="' + n(r) + '" fill="#ffffff" stroke="#000" stroke-width="' + n(K2.contornoTubo * 2) + '" data-cam="HID-CONEXAO"/>'); 
        /* R01: o BALÃO de código da conexão (S-1, F-2…) do isométrico por ambiente: o número é o da tabela de conexões */
        if (c.codigoConexao && it.cx) { var cod = c.codigoConexao(it.cx); if (cod) bal.push({ cod: cod, p: pc, id: it.cx.id, d0: r + K2.perspD0 }); }
        if (c.destaque && it.cx) { var dtx = c.destaque(it.cx, "cx"); if (dtx && c.agruparBaloes && c.codigoConexao) { var cqx = c.codigoConexao(it.cx); if (cqx) { dtx = cqx + "  " + dtx; tiraBal(it.cx.id); } } if (dtx) pend.push({ s: dtx, h: h, tipo: "destaque", camada: "HID-TEXTO", trecho: it.cx.id + "-dt", anchors: [pc], prio: 2, chamadaMin: K2.chamadaPlanta, d0: r + K2.perspD0 * 4 }); }
        return; }
      var A = X(it.a), Bp = X(it.b), dx = Bp[0] - A[0], dy = Bp[1] - A[1], Ls = Math.sqrt(dx * dx + dy * dy); if (Ls < 1e-6) return;
      var w = Math.max(it.de * k, K2.perspMin) / 2, nx = -dy / Ls * w, ny = dx / Ls * w;
      var pts = [[A[0] + nx, A[1] + ny], [Bp[0] + nx, Bp[1] + ny], [Bp[0] - nx, Bp[1] - ny], [A[0] - nx, A[1] - ny]];
      if (!RA) poliCheio(D, pts, corDe(it.t.sistema), "#000", K2.contornoTubo, "HID-" + (CAMADA_SIS[it.t.sistema] || "AF") + "-TUBO");
      for (var e = 0; e < 4; e++) { var s0 = pts[e], s1 = pts[(e + 1) % 4]; seg.push([s0[0], s0[1], s1[0], s1[1]]); c.chk.tubos.push([s0[0], s0[1], s1[0], s1[1]]); }
      if (it.cortado) {   /* o símbolo de interrompido na ponta de cima */
        var top = A[1] < Bp[1] ? A : Bp, q = HI().K.quebraTam;
        D.linha(top[0] - q, top[1] + q * 0.4, top[0] + q, top[1] - q * 0.4, "HID-SIMBOLO"); D.linha(top[0] - q, top[1] + q, top[0] + q, top[1] + q * 0.2, "HID-SIMBOLO");
      }
      it.A = A; it.Bp = Bp; it.Ls = Ls;
    });
    /* HIDRO-3D: balões agrupados — mesmo código e peças próximas = UM balão com a quantidade ("S-5 x3"); a meta é no máximo 15 por isométrico (como a folha da Tânia):
       o raio de agrupamento cresce até caber. Sem c.agruparBaloes, um balão por peça (o desenho de antes). */
    (function () {
      var raios = c.agruparBaloes ? (c.raiosBalao || [12, 18, 26, 38, 56]) : [0], cl = [];
      for (var ri = 0; ri < raios.length; ri++) {
        cl = [];
        bal.forEach(function (b) {
          var hit = null;
          if (raios[ri] > 0) cl.forEach(function (q) { if (!hit && q.cod === b.cod && Math.hypot(q.p[0] - b.p[0], q.p[1] - b.p[1]) <= raios[ri]) hit = q; });
          if (hit) { hit.n++; hit.ids.push(b.id); } else cl.push({ cod: b.cod, p: b.p, n: 1, ids: [b.id], d0: b.d0 });
        });
        if (cl.length <= (c.maxBaloes || 15)) break;
      }
      c.nBaloes = cl.length; c.nBaloesPecas = bal.length;
      cl.forEach(function (q) {
        var tx0 = q.n > 1 ? q.cod + " x" + q.n : q.cod;
        pend.push({ s: tx0, cod: q.cod, n: q.n, ids: q.ids, h: h, tipo: "codigo", rBox: Math.max(h * 1.15, larg(tx0, h) / 2 + 0.5), camada: "HID-TEXTO", trecho: q.ids[0], anchors: [q.p], prio: 1, chamadaMin: K2.chamadaPlanta, d0: q.d0 });
      });
    })();
    /* 3) rótulos: sistema + DN por corrida (o mais longo); verticais longas também */
    var rot = gruposRotulo(pz.trs, c.ix, KI), PDr = PAD();
    pz.itens.forEach(function (it) {
      if (it.tipo !== "tubo" || !it.A) return;
      var t = it.t, vert = t.vertical, Lm = dist3d(t.p1, t.p2);
      if (vert ? Lm < K2.perspVertMin : !rot[t.id]) return;
      var inf = (c.ix[t.sistema] || {})[t.id], dn = inf && inf.dn != null ? inf.dn : t.dn, sg = CAMADA_SIS[t.sistema] || "";
      var txt0 = sg + " " + dnRotulo(t, inf, true);
      void PDr; void dn;
      pend.push({ s: txt0, h: h, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: KI.ancoras.map(function (f) { return [it.A[0] + (it.Bp[0] - it.A[0]) * f, it.A[1] + (it.Bp[1] - it.A[1]) * f]; }), prio: 3, comprimento: it.Ls, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
    });
    /* 4) cotas de ALTURA: pontos, registros e o piso */
    var visto = {};
    pz.pontos.forEach(function (l) {
      if (visto[l.alvo]) return; visto[l.alvo] = 1;
      var p = X(pz.P(l)), alt = l.y - pz.pv.cota, nm = c.nomeAp(l.famInst);
      S.push({ tipo: "ponto", x: p[0], y: p[1], r: KI.rPonto, camada: "HID-SIMBOLO", box: [p[0] - KI.rPonto, p[1] - KI.rPonto, p[0] + KI.rPonto, p[1] + KI.rPonto], id: l.alvo });
      pend.push({ s: (nm ? nm + "  " : "") + (alt >= 0 ? "+" : "") + br(alt, 2), h: h, tipo: "aparelho", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
    });
    pz.acess.forEach(function (ac) {
      var p = X(pz.P(ac.centro)), alt = ac.centro.y - pz.pv.cota;
      pend.push({ s: txt(({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[ac.acessorio] || "RG") + "  " + (alt >= 0 ? "+" : "") + br(alt, 2), h: h, tipo: "registro", camada: "HID-TEXTO", trecho: ac.id, anchors: [p], prio: 1, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
    });
    var cantos = pz.piso.map(X).sort(function (p, q) { return q[1] - p[1]; }), cp = cantos[0];
    D.cheio([[cp[0], cp[1]], [cp[0] - K2.perspNivel, cp[1] - K2.perspNivel * 1.6], [cp[0] + K2.perspNivel, cp[1] - K2.perspNivel * 1.6]], "#000");
    pend.push({ s: "PISO ACABADO " + (pz.pv.cota > 0 ? "+" : pz.pv.cota < 0 ? "" : "±") + br(pz.pv.cota, 2), h: h, tipo: "nivel", camada: "HID-TEXTO", trecho: "piso", anchors: [[cp[0], cp[1] - K2.perspNivel]], prio: 0, d0: K2.perspD0 });
    if (HVm) {
      /* a VISTA manda: balões, rótulos de DN, chamadas e cotas de altura são anotação ligada à peça (auto-posicionada ou arrastada pelo usuário) */
      var pIv = X({ u: u0, v: v0 }), pFv = X({ u: u1, v: v1 }), kVista = num(c.vistaIso.hidIso && c.vistaIso.hidIso.k, null);
      /* R05: as colunas de balões encostam na REDE (caixa dos tubos), não no render inteiro (paredes, piso, móveis): chamada curta, como na folha da Tânia */
      var bxR = { x0: pIv[0], y0: pIv[1], x1: pFv[0], y1: pFv[1] };
      if (seg.length) { var sx = [], sy = []; seg.forEach(function (q) { sx.push(q[0], q[2]); sy.push(q[1], q[3]); }); bxR = { x0: Math.max(pIv[0], Math.min.apply(null, sx)), y0: Math.max(pIv[1], Math.min.apply(null, sy)), x1: Math.min(pFv[0], Math.max.apply(null, sx)), y1: Math.min(pFv[1], Math.max.apply(null, sy)) }; }
      var rv = HVm.compor(D, c.vistaIso, { pend: pend, obst: S.filter(function (q) { return q.box; }).map(function (q) { return q.box; }), seg: seg, area: aMarcacao, bbox: bxR, larg: larg, escala: kVista ? k / kVista : 1 });
      c.vistaRes = rv; c.kUsado = k; rv.avisos.forEach(function (m) { c.avisos.push("Vista " + (c.vistaIso.nome || "") + ": " + m); });
    } else {
    HI().afastar(pend, S, L, Tt, seg, c.avisos);
    desenhar(D, { linhas: L, simbolos: S, textos: Tt }, 0, 0, c.chk);
    /* R01: CHAMADA em caixa (como a referência da Tânia): moldura fina na cor-acento da casa em volta do texto da peça especial */
    if (c.destaque) Tt.forEach(function (tx) {
      if (tx.tipo !== "destaque") return;
      var wd = larg(tx.s, tx.h);
      D.add('<rect x="' + n(tx.x - wd / 2 - 1.2) + '" y="' + n(tx.y - tx.h * 0.95) + '" width="' + n(wd + 2.4) + '" height="' + n(tx.h * 1.45) + '" fill="none" stroke="#B5694A" stroke-width="0.2" data-cam="HID-CHAMADA"/>');
    });
    if (c.codigoConexao) Tt.forEach(function (tx) { if (tx.tipo === "codigo") D.circ(tx.x, tx.y - 0.37 * tx.h, Math.max(tx.h * 1.15, larg(tx.s, tx.h) / 2 + 0.5), "HID-SIMBOLO"); });
    }
    if (!c.semLegenda) {
    /* 5) legenda do ambiente: sistemas e peças com o ícone */
    var yL = a.y + a.h - hLeg + T.nota, xL = a.x + 4, sis = [], pecas = {};
    pz.trs.forEach(function (t) { if (sis.indexOf(t.sistema) < 0) sis.push(t.sistema); });
    D.texto(xL, yL, "SISTEMAS NESTA PERSPECTIVA", h, { peso: 0.2 });
    var xs = xL;
    ORD_SIS_P.filter(function (s) { return sis.indexOf(s) >= 0; }).forEach(function (s) {
      poliCheio(D, [[xs, yL + h * 0.9], [xs + K2.quadro.icone, yL + h * 0.9], [xs + K2.quadro.icone, yL + h * 1.5], [xs, yL + h * 1.5]], corDe(s), "#000", K2.contornoTubo, "HID-LEGENDA");
      var nm = (CAMADA_SIS[s] || "") + " " + (NOME_SIS_Q[s] || s).toLowerCase(); D.texto(xs + K2.quadro.icone + 1.5, yL + h * 1.55, nm, h, {}); xs += K2.quadro.icone + 4 + larg(nm, h);
    });
    pz.itens.forEach(function (it) {
      if (it.tipo === "conexao") pecas["cx-joelho90|Conexão (joelho, tê, junção, luva)"] = 1;
      if (it.tipo === "peca") pecas["pc-caixa|" + (NIV() ? NIV().rotuloPeca(it.k) || "Caixa / ralo" : "Caixa / ralo")] = 1;
    });
    pz.pontos.forEach(function (l) { var f = null; arr(c.modelo.estado.familias).forEach(function (q) { if (q.id === l.famInst) f = q; }); if (f) pecas["fam-" + txt(f.famId).replace(/^hid-/, "") + "|" + (c.nomeAp(l.famInst) || "") + " " + nomeFamilia(f.famId)] = 1; });
    if (pz.acess.length) pecas["ac-registro|Registro (RG gaveta / RP pressão)"] = 1;
    var yP = yL + h * 3.2; D.texto(xL, yP, "PEÇAS", h, { peso: 0.2 }); xs = xL; yP += h * 0.6;
    Object.keys(pecas).forEach(function (kp) {
      var ic = kp.split("|")[0], nm = kp.split("|")[1], wv = K2.quadro.icone + 4 + larg(nm, h);
      if (xs + wv > a.x + a.w - 2) { xs = xL; yP += h * 2.2; }
      iconePeca(D, ic, "", xs, yP, K2.quadro.icone, h * 1.6); D.texto(xs + K2.quadro.icone + 1.5, yP + h * 1.15, nm, h, {}); xs += wv + 3;
    });
    }
    c.prims.push({ linhas: L, simbolos: S, textos: Tt, trechos: pz.trs.map(function (t) { return t.id; }) });
    return { escala: "SEM ESCALA" };
  }
  var ORD_SIS_P = ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "industrial", "gas"];
  function dist3d(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
  function nomeFamilia(fid) { var H = dep("HidFamilias", "./hidfamilias.js"), f = null; try { f = H ? H.porId(fid) : null; } catch (e) { f = null; } return f && f.nome ? txt(f.nome).toLowerCase() : txt(fid).replace(/^hid-/, "").replace(/-/g, " "); }

  /* ------------------------------------------------------------ PLANTA DE INCÊNDIO (F3): rede, hidrantes, extintores e o raio de cobertura */
  function obj0(v) { return v && typeof v === "object" ? v : {}; }
  function extPontos(inc, nomePav) {
    var out = [];
    arr(obj0(inc.extintores).porPavimento).forEach(function (q) { if (q.pavimento === nomePav) arr(q.pontos).forEach(function (p) { out.push(p); }); });
    return out;
  }
  function folhaIncendio(c) {
    var D = c.D, a = c.geo.area, inc = obj0(c.r.sistemas.incendio), hd = obj0(inc.hidrantes), pv = c.pv, KI = HI().K, trs = arr(c.trs);
    var hid = arr(hd.pontos).filter(function (p) { return p.pavimento === pv.nome; }), ext = extPontos(inc, pv.nome), R = num(hd.alcance_m, null);
    var xs = [], zs = [], i, esc0 = null;
    trs.forEach(function (t) { xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); });
    hid.forEach(function (p) { xs.push(p.x - (R || 0), p.x + (R || 0)); zs.push(p.z - (R || 0), p.z + (R || 0)); });
    arr(obj0(inc.chuveiros).pontos).filter(function (p) { return p.pavimento === pv.nome; }).forEach(function (p) { xs.push(p.x); zs.push(p.z); });
    ext.forEach(function (p) { xs.push(p.x); zs.push(p.z); });
    if (!xs.length) return { escala: "INDICADA" };
    var W = Math.max.apply(null, xs) - Math.min.apply(null, xs), Hh = Math.max.apply(null, zs) - Math.min.apply(null, zs), x0 = Math.min.apply(null, xs), z0 = Math.min.apply(null, zs);
    var folga = KI.margem * 2 + K2.folgaFolha;
    for (i = 0; i < K2.escalas.length; i++) {
      var s0 = 1000 / K2.escalas[i];
      if (W * s0 + folga <= a.w && Hh * s0 + folga + K2.titulo <= a.h) { esc0 = K2.escalas[i]; break; }
    }
    if (!esc0) { esc0 = K2.escalas[K2.escalas.length - 1]; c.avisos.push("Folha " + dois(c.n) + ": a planta de incêndio não cabe nem na menor escala (1:" + esc0 + ") — dividir por pavimento/ala."); }
    var s = 1000 / esc0, ox = a.x + (a.w - W * s) / 2 - x0 * s, oy = a.y + K2.titulo + (a.h - K2.titulo - Hh * s) / 2 - z0 * s;
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "ESC 1:" + esc0);
    function P(p) { return [p.x * s + ox, p.z * s + oy]; }
    trs.forEach(function (t) {
      var A = P(t.p1), B = P(t.p2), inf = (c.ix.incendio || {})[t.id];
      D.linha(A[0], A[1], B[0], B[1], "HID-IN-TUBO", ' data-trecho="' + esc(t.id) + '"');
      if (!t.vertical) D.texto((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - KI.hPeq, dnRotulo(t, inf, false), KI.hPeq, { al: "C", attr: ' data-rotulo="dn"' });
    });
    var chu = arr(obj0(inc.chuveiros).pontos).filter(function (p) { return p.pavimento === pv.nome; });
    chu.forEach(function (p) {
      var q = P(p);
      D.circ(q[0], q[1], K2.rPrumada / 2, "HID-SIMBOLO");
      D.texto(q[0] + K2.rPrumada, q[1] - K2.rPrumada / 2, txt(p.id), KI.hPeq, { al: "E", attr: ' data-rotulo="chuveiro"' });
    });
    var chI = obj0(inc.chuveiros);
    if (chI.exigido === true) D.texto(a.x + 4, a.y + a.h - KI.hPeq * 2, "CHUVEIROS (NBR 10897:2020): risco " + txt(chI.risco || "não verificado") + " - densidade " + (typeof chI.densidade === "number" ? br(chI.densidade, 1) + " mm/min (Fig. 42, lido em gráfico +-0,1)" : "não verificado") + " x área " + (typeof chI.areaOperacao_m2 === "number" ? br(chI.areaOperacao_m2, 0) + " m2" : "não verificado") + " - reserva " + (typeof obj0(inc.reserva).chuveiros_m3 === "number" ? br(inc.reserva.chuveiros_m3, 2) + " m3" : "não verificado"), KI.hPeq, { al: "E", cor: typeof chI.densidade === "number" ? undefined : K2.vermelho });
    hid.forEach(function (p) {
      var q = P(p);
      if (R != null) D.circ(q[0], q[1], R * s, "HID-IN-COBERTURA");
      D.circ(q[0], q[1], K2.rPrumada, "HID-SIMBOLO"); D.linha(q[0] - K2.rPrumada, q[1], q[0] + K2.rPrumada, q[1], "HID-SIMBOLO"); D.linha(q[0], q[1] - K2.rPrumada, q[0], q[1] + K2.rPrumada, "HID-SIMBOLO");
      D.texto(q[0] + K2.rPrumada + 1, q[1] - K2.rPrumada, txt(p.id) + (p.origem === "proposto" ? " (proposto)" : ""), KI.hPeq, { al: "E", attr: ' data-rotulo="hidrante"' });
    });
    ext.forEach(function (p) {
      var q = P(p), r2 = K2.rPrumada / 2;
      D.ret(q[0] - r2, q[1] - r2, 2 * r2, 2 * r2, "HID-SIMBOLO");
      D.texto(q[0] + r2 + 1, q[1] - r2, txt(p.id), KI.hPeq, { al: "E", attr: ' data-rotulo="extintor"' });
    });
    if (!hid.length && !ext.length && !arr(obj0(inc.chuveiros).pontos).length) D.texto(a.x + K2.erroX, a.y + K2.vazioY, "Sem hidrantes nem extintores com posição neste pavimento: não verificado (informar os pavimentos com planta).", KI.hPeq, { cor: K2.vermelho });
    return { escala: "1:" + esc0 };
  }

  /* ------------------------------------------------------------ TRATAMENTO (integração): planta e corte dos tanques, cotados */
  function dimsCotadas(tr, u) {
    var p = obj0(u.param), g = obj0(obj0(tr.tanque).geometria), d0 = obj0(u.dims), f = function (v) { return typeof v === "number" && isFinite(v) && v > 0; };
    if (u.forma === "cilindrica" && f(p.Diametro_produto) && f(p.Altura_produto)) return { forma: "cil", d: p.Diametro_produto, h: p.Altura_produto, fonte: "produto de catálogo" };
    if (f(d0.diametro_m) && f(d0.profundidade_m)) return { forma: "cil", d: d0.diametro_m, h: d0.profundidade_m, fonte: "cálculo" };
    if (f(d0.comprimento_m) && f(d0.largura_m) && f(d0.profundidade_m)) return { forma: "ret", c: d0.comprimento_m, l: d0.largura_m, h: d0.profundidade_m, fonte: "cálculo" };
    if (u.id === "tanque" && f(g.comprimento_m) && f(g.largura_m) && f(g.profundidade_m)) return { forma: "ret", c: g.comprimento_m, l: g.largura_m, h: g.profundidade_m, fonte: "cálculo (tanque moldado)" };
    return null;
  }
  function folhaTratamento(c) {
    var D = c.D, a = c.geo.area, tr = obj0(c.r.sistemas.tratamento), KI = HI().K, T = D.E.T, un = [], semDim = [], i;
    arr(tr.unidades).forEach(function (u) { var m = dimsCotadas(tr, u); if (m) { m.u = u; un.push(m); } else semDim.push(u); });
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "COTAS EM cm");
    if (!un.length) { D.texto(a.x + K2.erroX, a.y + K2.vazioY, "Nenhuma unidade do tratamento com dimensões calculadas: não verificado (ver pendências do memorial).", KI.hPeq, { cor: K2.vermelho }); return { escala: "INDICADA" }; }
    function larg0(m) { return m.forma === "cil" ? m.d : m.c; }
    function alt0(m) { return m.forma === "cil" ? m.d : m.l; }
    var somaW = 0, hP = 0, hC = 0, esc0 = null;
    un.forEach(function (m) { somaW += larg0(m); hP = Math.max(hP, alt0(m)); hC = Math.max(hC, m.h); });
    for (i = 0; i < K2.escalas.length; i++) {
      var s0 = 1000 / K2.escalas[i];
      if (somaW * s0 + K2.gapUn * (un.length + 1) <= a.w - K2.folgaFolha && (hP + hC) * s0 + K2.gapUn * 3 + K2.titulo <= a.h) { esc0 = K2.escalas[i]; break; }   // hid:ok 3 faixas de folga (planta, corte, legenda): diagramação
    }
    if (!esc0) { esc0 = K2.escalas[K2.escalas.length - 1]; c.avisos.push("Folha " + dois(c.n) + ": as unidades do tratamento não cabem nem na menor escala (1:" + esc0 + ") — dividir por linha."); }
    var s = 1000 / esc0, x = a.x + K2.gapUn, yP = a.y + K2.titulo + K2.gapUn * 1.2, yC = yP + hP * s + K2.gapUn * 1.6;
    function cm(v) { return String(Math.round(v * 100)); }   // hid:ok m → cm (cota de comprimento da prancha)
    un.forEach(function (m) {
      var w = larg0(m) * s, ht = alt0(m) * s, hh = m.h * s, u = m.u, xm = x + w / 2;
      D.texto(xm, yP - K2.gapUn * 0.7, txt(u.id).toUpperCase() + " - " + txt(u.nome), KI.hPeq, { al: "C", attr: ' data-rotulo="tanque"' });
      if (m.forma === "cil") { D.circ(xm, yP + ht / 2, w / 2, "HID-SIMBOLO"); D.cota(x, yP + ht, x + w, yP + ht, K2.offCota, "Ø " + cm(m.d), {}); }
      else { D.ret(x, yP, w, ht, "HID-SIMBOLO"); D.cota(x, yP + ht, x + w, yP + ht, K2.offCota, cm(m.c), {}); D.cota(x + w, yP, x + w, yP + ht, K2.offCota, cm(m.l), {}); }
      D.ret(x, yC, w, hh, "HID-SIMBOLO");
      D.linha(x - K2.gapUn / 4, yC, x + w + K2.gapUn / 4, yC, "HID-EIXO");   // nível do terreno
      D.cota(x + w, yC, x + w, yC + hh, K2.offCota, "H " + cm(m.h), {});
      D.texto(xm, yC + hh + K2.offCota * 2.4, "PLANTA E CORTE - " + m.fonte, KI.hPeq, { al: "C", attr: ' data-rotulo="fonte"' });   // hid:ok afastamento do texto abaixo da cota (diagramação)
      x += w + K2.gapUn;
    });
    semDim.forEach(function (u, k) { D.texto(a.x + K2.gapUn, a.y + a.h - K2.gapUn * 0.8 - k * KI.hPeq * 1.6, "Não verificado: " + txt(u.nome) + " sem dimensões calculadas", KI.hPeq, { al: "E", cor: K2.vermelho }); });
    return { escala: "1:" + esc0 };
  }

  /* ------------------------------------------------------------ ISOMÉTRICO */
  function folhaIso(c) {
    var D = c.D, a = c.geo.area, d = c.iso;
    var ox = a.x + (a.w - d.w) / 2, oy = a.y + K2.titulo + (a.h - K2.titulo - d.h) / 2;
    c.AP.tituloVista(D, a.x + 4, a.y + 2, d.titulo, "SEM ESCALA - cotas em cm, alturas em m");
    desenhar(D, d, Math.max(a.x, ox), Math.max(a.y + K2.titulo, oy), c.chk);
    c.prims.push(d);
    (d.avisos || []).forEach(function (m) { c.avisos.push("Folha " + dois(c.n) + ": " + m); });
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ ESQUEMA VERTICAL (colunas de AF, tubos de queda e ventilação) */
  function folhaEsquema(c) {
    var D = c.D, a = c.geo.area, KI = HI().K, rede = c.rede, ix = c.ix, ys = [], cols = [];
    /* colunas de AF: cadeias verticais; tubos de queda: trechos de resultado.tubosQueda */
    var af = arr(rede.trechos).filter(function (t) { return t.sistema === "agua_fria" && t.vertical; });
    var porCol = {};
    af.forEach(function (t) { var cl = c.colunas[t.id]; if (!cl) return; (porCol[cl.nome] = porCol[cl.nome] || { nome: cl.nome, sis: "agua_fria", x: cl.x, z: cl.z, trechos: [] }).trechos.push(t); });
    Object.keys(porCol).sort().forEach(function (k) { cols.push(porCol[k]); });
    var porTq = {};
    arr(rede.trechos).forEach(function (t) { var nome = ix.tq[t.id]; if (t.sistema !== "esgoto" || !nome) return; (porTq[nome] = porTq[nome] || { nome: nome, sis: "esgoto", trechos: [] }).trechos.push(t); });
    Object.keys(porTq).sort().forEach(function (k) {
      var q = porTq[k], t0 = q.trechos[0]; q.x = t0.p1.x; q.z = t0.p1.z;
      /* ventilação que prolonga o tubo de queda */
      arr(rede.trechos).forEach(function (v) { if (v.sistema === "ventilacao" && v.vertical && Math.abs(v.p1.x - q.x) < KI.tolNo_m && Math.abs(v.p1.z - q.z) < KI.tolNo_m) q.trechos.push(v); });
      cols.push(q);
    });
    if (!cols.length) return null;
    cols.forEach(function (cl) { cl.trechos.forEach(function (t) { ys.push(t.p1.y, t.p2.y); }); });
    c.pavs.forEach(function (p) { ys.push(p.cota); });
    /* F8: as caixas d'água (as duas, interligadas), o barrilete e os registros entram no esquema: banda no topo da folha */
    var cxs = caixasReais(c.modelo), bandaH = cxs.length ? Math.min(a.h * K2.bandaRes, K2.bandaResMax) : 0;
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), Hdisp = a.h - K2.titulo - 3 * KI.margem - bandaH, kv = Math.min(Hdisp / Math.max(y1 - y0, 1e-6), Math.max.apply(null, KI.fatores));
    /* Casa 487 (F9): colunas demais para a largura: o espaçamento encolhe (mínimo K2.espacoColunaMin) para o esquema nunca invadir a coluna da legenda */
    var espCol = Math.max(K2.espacoColunaMin, Math.min(K2.espacoColuna, (a.w - KI.margem * 6) / Math.max(cols.length, 1)));
    var larguraTot = cols.length * espCol, x0 = a.x + Math.max(KI.margem * 3, (a.w - larguraTot) / 2) , yTopo = a.y + K2.titulo + KI.margem + bandaH;
    function Y(y) { return yTopo + (y1 - y) * kv; }
    c.AP.tituloVista(D, a.x + 4, a.y + 2, "ESQUEMA VERTICAL - " + (cxs.length ? "RESERVAÇÃO, BARRILETE, " : "") + "ÁGUA FRIA E ESGOTO", "SEM ESCALA - níveis em m");
    var prim = { linhas: [], simbolos: [], textos: [], trechos: [] }, pend = [], seg = [], L = prim.linhas, S = prim.simbolos, T = prim.textos;
    /* níveis dos pavimentos */
    c.pavs.forEach(function (p) {
      L.push({ x1: x0 - KI.margem * 2, y1: Y(p.cota), x2: x0 + larguraTot, y2: Y(p.cota), camada: "HID-EIXO", tipo: "nivel", trecho: "nivel" });
      pend.push({ s: p.nome + "  " + (p.cota > 0 ? "+" : "") + br(p.cota, 2), h: KI.hPeq, tipo: "nivel", camada: "HID-TEXTO", trecho: "nivel", anchors: [[x0 - KI.margem * 2, Y(p.cota)]], prio: 0, d0: KI.d0 });
    });
    var colX = {}; cols.forEach(function (cl, i) { colX[cl.nome] = x0 + espCol * i + espCol / 2; });
    var topoCol = {}; cols.forEach(function (cl) { topoCol[cl.nome] = Math.max.apply(null, cl.trechos.map(function (t) { return Math.max(t.p1.y, t.p2.y); })); });
    /* registros do projeto sobre as colunas (acessórios cujo centro cai na coluna) */
    var usadoRg = {};
    function colunaDoRegistro(ac) {
      var melhor = null, dm = KI.tolNo_m * 20;   // hid:ok captura do registro pela coluna (m): geometria de desenho
      cols.forEach(function (cl) { if (cl.sis !== "agua_fria" || cl.x == null) return; var d = Math.sqrt((cl.x - ac.centro.x) * (cl.x - ac.centro.x) + (cl.z - ac.centro.z) * (cl.z - ac.centro.z)); if (d < dm) { dm = d; melhor = cl; } });
      return melhor;
    }
    arr(rede.acessorios).forEach(function (ac) {
      if (!ac.centro || !/^registro|^valvula/.test(txt(ac.acessorio))) return;
      var cl = colunaDoRegistro(ac); if (!cl) return;
      var topo = topoCol[cl.nome], base = Math.min.apply(null, cl.trechos.map(function (t) { return Math.min(t.p1.y, t.p2.y); }));
      if (ac.centro.y > topo + KI.tolPiso_m || ac.centro.y < base - KI.tolPiso_m) return;
      var xr = colX[cl.nome], yr = Y(ac.centro.y), r = KI.regC / 2, sig = ({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[ac.acessorio] || "RG";
      L.push({ x1: xr - r, y1: yr - r, x2: xr + r, y2: yr + r, camada: "HID-SIMBOLO", tipo: "registro", trecho: ac.id }); L.push({ x1: xr - r, y1: yr + r, x2: xr + r, y2: yr - r, camada: "HID-SIMBOLO", tipo: "registro", trecho: ac.id });
      S.push({ tipo: "registro", x: xr, y: yr, r: r, camada: "HID-SIMBOLO", box: [xr - r, yr - r, xr + r, yr + r], id: ac.id, desenhado: true });
      pend.push({ s: sig + "  " + (alturaDe(ac.centro.y, c.pavs) >= 0 ? "+" : "") + br(alturaDe(ac.centro.y, c.pavs), 2), h: KI.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: ac.id, anchors: [[xr, yr]], prio: 1 });
      usadoRg[ac.id] = 1;
    });
    /* reservação e barrilete (esquemático, sem escala): caixas na banda do topo, saída de cada uma com registro, interligação, barrilete e derivação de cada coluna */
    if (cxs.length) {
      var yBar = yTopo - KI.margem * 1.5, yTopBand = a.y + K2.titulo + KI.margem, hBox = bandaH - KI.margem * 3.5, wBox = Math.min(K2.larguraCaixaEsq, (larguraTot - KI.margem * 2) / Math.max(cxs.length, 1) * 0.8);
      var xIni = x0 + espCol / 2, xFim = x0 + larguraTot - espCol / 2, rr = KI.regC / 2;
      var xsCx = cxs.map(function (q, i) { return cxs.length === 1 ? (xIni + xFim) / 2 : xIni + (xFim - xIni) * (i + 0.5) / cxs.length; });
      /* barrilete: do primeiro ao último ponto de derivação */
      var xB0 = Math.min(xIni, xsCx[0]), xB1 = Math.max(xFim, xsCx[xsCx.length - 1]);
      L.push({ x1: xB0, y1: yBar, x2: xB1, y2: yBar, camada: "HID-AF-TUBO", tipo: "tubo", trecho: "esq-barrilete" }); seg.push([xB0, yBar, xB1, yBar]);
      var dnBar = null; arr(rede.trechos).forEach(function (t) { if (t.sistema !== "agua_fria" || t.vertical) return; var mx = Math.min(t.p1.y, t.p2.y); if (mx >= Math.max.apply(null, Object.keys(topoCol).map(function (k) { return topoCol[k]; })) - KI.tolPiso_m) { var inf = (ix.agua_fria || {})[t.id], d = inf && inf.dn != null ? inf.dn : t.dn; if (d != null && (dnBar == null || d > dnBar)) dnBar = d; } });
      pend.push({ s: "BARRILETE" + (dnBar != null ? "  DN " + dnBar : "  (DN na planta)"), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: "esq-barrilete", anchors: [[xB0 + (xB1 - xB0) * 0.5, yBar]], prio: 3, comprimento: xB1 - xB0 });
      cxs.forEach(function (q, i) {
        var xc = xsCx[i], xl = xc - wBox / 2, yb = yTopBand + hBox;
        D.ret(xl, yTopBand, wBox, hBox, "HID-SIMBOLO");
        D.linha(xl + 1, yTopBand + hBox * 0.18, xl + wBox - 1, yTopBand + hBox * 0.18, "HID-EIXO");
        S.push({ tipo: "obst", x: xc, y: yTopBand + hBox / 2, r: 0, camada: "HID-SIMBOLO", box: [xl, yTopBand, xl + wBox, yb], id: "esq-" + q.id, desenhado: true });
        var det = [q.nome, q.volume != null ? br(q.volume, 0) + " L" : "volume a confirmar", q.diametro != null ? "ø " + br(q.diametro, 2) + " m" : ""].filter(Boolean).join("  ");
        pend.push({ s: det, h: KI.h, tipo: "coluna", camada: "HID-TEXTO", trecho: "esq-" + q.id, anchors: [[xc, yTopBand - KI.margem * 0.4]], prio: 2, d0: 0.2 });
        pend.push({ s: "Base +" + br(q.y, 2), h: KI.hPeq, tipo: "nivel", camada: "HID-TEXTO", trecho: "esq-" + q.id, anchors: [[xl + wBox, yb]], prio: 0, d0: KI.d0 });
        /* saída da caixa até o barrilete, com registro */
        L.push({ x1: xc, y1: yb, x2: xc, y2: yBar, camada: "HID-AF-TUBO", tipo: "tubo", trecho: "esq-saida-" + q.id }); seg.push([xc, yb, xc, yBar]);
        var yrg = yb + (yBar - yb) * 0.45;
        L.push({ x1: xc - rr, y1: yrg - rr, x2: xc + rr, y2: yrg + rr, camada: "HID-SIMBOLO", tipo: "registro", trecho: "esq-rg-" + q.id }); L.push({ x1: xc - rr, y1: yrg + rr, x2: xc + rr, y2: yrg - rr, camada: "HID-SIMBOLO", tipo: "registro", trecho: "esq-rg-" + q.id });
        S.push({ tipo: "registro", x: xc, y: yrg, r: rr, camada: "HID-SIMBOLO", box: [xc - rr, yrg - rr, xc + rr, yrg + rr], id: "esq-rg-" + q.id, desenhado: true });
        pend.push({ s: "RG saída", h: KI.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: "esq-rg-" + q.id, anchors: [[xc, yrg]], prio: 1 });
        S.push({ tipo: "te", x: xc, y: yBar, r: KI.rTe, camada: "HID-SIMBOLO", box: [xc - KI.rTe, yBar - KI.rTe, xc + KI.rTe, yBar + KI.rTe], id: "esq-te-" + q.id });
      });
      /* interligação das caixas: coletor comum entre os corpos, na altura do fundo */
      if (cxs.length > 1) {
        var yi = yTopBand + hBox - KI.margem * 0.6;
        L.push({ x1: xsCx[0] + wBox / 2, y1: yi, x2: xsCx[xsCx.length - 1] - wBox / 2, y2: yi, camada: "HID-AF-TUBO", tipo: "tubo", trecho: "esq-interligacao" }); seg.push([xsCx[0] + wBox / 2, yi, xsCx[xsCx.length - 1] - wBox / 2, yi]);
        pend.push({ s: "INTERLIGAÇÃO DAS CAIXAS", h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: "esq-interligacao", anchors: [[(xsCx[0] + xsCx[xsCx.length - 1]) / 2, yi]], prio: 3, comprimento: Math.abs(xsCx[xsCx.length - 1] - xsCx[0]) - wBox });
      }
      /* derivação do barrilete até o alto de cada coluna de AF, com o registro do início da coluna */
      cols.forEach(function (cl) {
        if (cl.sis !== "agua_fria") return;
        var xc = colX[cl.nome], yc = Y(topoCol[cl.nome]);
        if (yc - yBar < KI.margem * 0.5) return;
        L.push({ x1: xc, y1: yBar, x2: xc, y2: yc, camada: "HID-AF-TUBO", tipo: "tubo", trecho: "esq-der-" + cl.nome }); seg.push([xc, yBar, xc, yc]);
        S.push({ tipo: "te", x: xc, y: yBar, r: KI.rTe, camada: "HID-SIMBOLO", box: [xc - KI.rTe, yBar - KI.rTe, xc + KI.rTe, yBar + KI.rTe], id: "esq-tec-" + cl.nome });
      });
    }
    cols.forEach(function (cl, i) {
      var xc = x0 + espCol * i + espCol / 2, sg = SIGLA[cl.sis] || "AF";
      cl.trechos.forEach(function (t) {
        var cam = "HID-" + ((HI().SIGLA_SISTEMA[t.sistema]) || sg) + "-TUBO", inf = (ix[t.sistema] || {})[t.id];
        var ya = Y(t.p1.y), yb = Y(t.p2.y), dn = inf && inf.dn != null ? inf.dn : t.dn;
        L.push({ x1: xc, y1: ya, x2: xc, y2: yb, camada: cam, tipo: "tubo", trecho: t.id }); seg.push([xc, ya, xc, yb]); prim.trechos.push(t.id);
        pend.push({ s: dnRotulo(t, inf, true), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: KI.ancoras.map(function (f) { return [xc, ya + (yb - ya) * f]; }), prio: 3, comprimento: Math.abs(yb - ya) });
        void dn;
      });
      pend.push({ s: cl.nome, h: KI.h, tipo: cl.sis === "esgoto" ? "tq" : "coluna", camada: "HID-TEXTO", trecho: cl.trechos[0].id, anchors: [[xc, Y(Math.max.apply(null, cl.trechos.map(function (t) { return Math.max(t.p1.y, t.p2.y); }))) - KI.margem / 2]], prio: 2, balao: true, d0: 0.2 });
      /* derivações: conexões da coluna com ramos fora dela */
      var mine = {}; cl.trechos.forEach(function (t) { mine[t.id] = 1; });
      arr(rede.conexoes).forEach(function (cx) {
        if (!arr(cx.ramos).some(function (id) { return mine[id]; })) return;
        var fora = arr(cx.ramos).filter(function (id) { return !mine[id]; });
        if (!fora.length) return;
        var rt = null; arr(rede.trechos).forEach(function (t) { if (t.id === fora[0]) rt = t; });
        if (!rt || rt.sistema !== (cl.trechos[0].sistema === "ventilacao" ? "ventilacao" : cl.trechos[0].sistema)) return;
        var yy = Y(cx.y), inf2 = (ix[rt.sistema] || {})[rt.id], dn2 = inf2 && inf2.dn != null ? inf2.dn : rt.dn;
        L.push({ x1: xc, y1: yy, x2: xc + K2.stub, y2: yy, camada: "HID-" + (HI().SIGLA_SISTEMA[rt.sistema] || sg) + "-TUBO", tipo: "tubo", trecho: rt.id }); seg.push([xc, yy, xc + K2.stub, yy]);
        S.push({ tipo: "te", x: xc, y: yy, r: KI.rTe, camada: "HID-SIMBOLO", box: [xc - KI.rTe, yy - KI.rTe, xc + KI.rTe, yy + KI.rTe], id: cx.id });
        pend.push({ s: "DN " + dn2 + "  " + (alturaDe(cx.y, c.pavs) >= 0 ? "+" : "") + br(alturaDe(cx.y, c.pavs), 2), h: KI.hPeq, tipo: "dn", camada: "HID-TEXTO", trecho: rt.id, anchors: [[xc + K2.stub, yy], [xc + K2.stub * KI.meio, yy]], prio: 3 });
        prim.trechos.push(rt.id);
      });
    });
    HI().afastar(pend, S, L, T, seg, c.avisos);
    desenhar(D, prim, 0, 0, c.chk);
    c.prims.push(prim);
    return { escala: "SEM ESCALA" };
  }
  function alturaDe(y, pavs) {
    var m = null; arr(pavs).forEach(function (p) { if (p.cota <= y + HI().K.tolPiso_m && (m == null || p.cota > m.cota)) m = p; });
    return m ? y - m.cota : y;
  }

  /* hid:fisica-fim */
  /* hid:fisica-inicio — diagramação (geometria de desenho em mm, índices de caixa/ponto): nenhum valor de norma; DN, vazão e declividade vêm sempre do RESULTADO */
  /* ------------------------------------------------------------ COLUNA: legenda + notas + normas */
  function legendaItens(r) {
    var S0 = (r && r.sistemas) || {}, extra = [];
    /* LEGENDA DE TUBULAÇÃO AUTOMÁTICA (padrão de apresentação): uma linha por sistema PRESENTE, na ordem, cor, pena e
       traço do padrão (a ventilação acompanha o esgoto); os símbolos que não são tubo seguem abaixo */
    var PD = PAD();
    if (PD) {
      var pres = Object.keys(S0).filter(function (k) { return S0[k]; });
      if (S0.esgoto) pres.push("ventilacao");
      if (!pres.length) pres = ["agua_fria", "esgoto", "ventilacao"];
      var linhas = PD.legenda(pres).map(function (it) { return ["sis:" + it.sistema, it.texto]; });
      if (S0.gas) linhas.push(["linhaGAS", "Gás GLP (GAS) - cobre embutido, tubulação amarela"]);   /* F3: o padrão de apresentação não conhece o sistema gas */
      if (S0.incendio) linhas.push(["hidrante", "Hidrante / mangotinho"], ["extintor", "Extintor portátil"], ["cobertura", "Raio de cobertura do hidrante (alcance da mangueira)"], ["chuveiro", "Chuveiro automático (NBR 10897)"]);
      return linhas.concat([["registro", "Registro (RG gaveta, RE esfera, RP pressão, VR retenção)"],
            ["te", "Tê"], ["joelho", "Joelho / curva"], ["ponto", "Ponto de utilização (altura em m do piso acabado)"], ["caixa", "Caixa sifonada / ralo / caixa"], ["balao", "Coluna de AF (AF-n) / tubo de queda (TQ-n)"], ["cota", "Cota de comprimento (cm)"]]);
    }
    if (S0.agua_quente) extra.push(["linhaAQ", "Água quente (AQ)"]);
    if (S0.pluvial) extra.push(["linhaAP", "Águas pluviais (AP) - seta = sentido do escoamento"]);
    if (S0.industrial) extra.push(["linhaIND", "Fluido industrial (IND) - tubulação marrom"]);
    if (S0.gas) extra.push(["linhaGAS", "Gás GLP (GAS) - cobre embutido, tubulação amarela"]);
    if (S0.incendio) extra.push(["linhaIN", "Incêndio (IN) - tubulação vermelha"], ["hidrante", "Hidrante / mangotinho"], ["extintor", "Extintor portátil"], ["cobertura", "Raio de cobertura do hidrante (alcance da mangueira)"], ["chuveiro", "Chuveiro automático (NBR 10897)"]);
    return extra.concat([["linhaAF", "Água fria (AF)"], ["linhaES", "Esgoto (ES) - seta = sentido do escoamento"], ["linhaVE", "Ventilação (VE)"], ["registro", "Registro (RG gaveta, RE esfera, RP pressão, VR retenção)"],
            ["te", "Tê"], ["joelho", "Joelho / curva"], ["ponto", "Ponto de utilização (altura em m do piso acabado)"], ["caixa", "Caixa sifonada / ralo / caixa"], ["balao", "Coluna de AF (AF-n) / tubo de queda (TQ-n)"], ["cota", "Cota de comprimento (cm)"]]);
  }
  function simboloLeg(D, tipo, x, y) {
    var KI = HI().K;
    if (/^sis:/.test(tipo)) {   /* padrão: a linha na camada do sistema (cor, pena, traço) e a seta onde o padrão pede */
      var sk = tipo.slice(4), PD = PAD();
      D.linha(x - 2.5, y, x + 2.5, y, "HID-" + (CAMADA_SIS[sk] || "AF") + "-TUBO");
      if (PD && PD.temSeta(sk)) D.cheio([[x + 1.2, y], [x - 0.8, y + 0.8], [x - 0.8, y - 0.8]], "#000");
      return;
    }
    if (tipo === "linhaIND") D.linha(x - 2.5, y, x + 2.5, y, "HID-IND-TUBO");
    else if (tipo === "linhaGAS") D.linha(x - 2.5, y, x + 2.5, y, "HID-GAS-TUBO");
    else if (tipo === "linhaAQ") D.linha(x - 2.5, y, x + 2.5, y, "HID-AQ-TUBO");
    else if (tipo === "linhaAP") { D.linha(x - 2.5, y, x + 2.5, y, "HID-AP-TUBO"); D.cheio([[x + 1.2, y], [x - 0.8, y + 0.8], [x - 0.8, y - 0.8]], "#000"); }
    else if (tipo === "linhaIN") D.linha(x - 2.5, y, x + 2.5, y, "HID-IN-TUBO");
    else if (tipo === "hidrante") { D.circ(x, y, K2.rPrumada, "HID-SIMBOLO"); D.linha(x - K2.rPrumada, y, x + K2.rPrumada, y, "HID-SIMBOLO"); D.linha(x, y - K2.rPrumada, x, y + K2.rPrumada, "HID-SIMBOLO"); }
    else if (tipo === "extintor") D.ret(x - K2.rPrumada / 2, y - K2.rPrumada / 2, K2.rPrumada, K2.rPrumada, "HID-SIMBOLO");
    else if (tipo === "chuveiro") D.circ(x, y, K2.rPrumada / 2, "HID-SIMBOLO");
    else if (tipo === "cobertura") D.circ(x, y, K2.rPrumada * 1.4, "HID-IN-COBERTURA");
    else
    if (tipo === "linhaAF") D.linha(x - 2.5, y, x + 2.5, y, "HID-AF-TUBO");
    else if (tipo === "linhaES") { D.linha(x - 2.5, y, x + 2.5, y, "HID-ES-TUBO"); D.cheio([[x + 1.2, y], [x - 0.8, y + 0.8], [x - 0.8, y - 0.8]], "#000"); }
    else if (tipo === "linhaVE") D.linha(x - 2.5, y, x + 2.5, y, "HID-VE-TUBO");
    else if (tipo === "registro") { D.linha(x - 1.2, y - 0.8, x + 1.2, y + 0.8, "HID-SIMBOLO"); D.linha(x - 1.2, y + 0.8, x + 1.2, y - 0.8, "HID-SIMBOLO"); D.linha(x - 1.2, y - 0.8, x - 1.2, y + 0.8, "HID-SIMBOLO"); D.linha(x + 1.2, y - 0.8, x + 1.2, y + 0.8, "HID-SIMBOLO"); }
    else if (tipo === "te") D.ponto(x, y, KI.rTe, "#000");
    else if (tipo === "joelho") D.circ(x, y, KI.rJoelho, "HID-SIMBOLO");
    else if (tipo === "ponto") D.circ(x, y, KI.rPonto, "HID-SIMBOLO");
    else if (tipo === "caixa") D.ret(x - KI.caixaL / 2, y - KI.caixaL / 2, KI.caixaL, KI.caixaL, "HID-SIMBOLO");
    else if (tipo === "balao") D.circ(x, y, KI.rBalaoMin * 0.8, "HID-SIMBOLO");
    else if (tipo === "cota") { D.linha(x - 2.5, y, x + 2.5, y, "HID-COTA"); D.linha(x - 2.5 - 0.7, y + 0.7, x - 2.5 + 0.7, y - 0.7, "HID-SIMBOLO"); D.linha(x + 2.5 - 0.7, y + 0.7, x + 2.5 + 0.7, y - 0.7, "HID-SIMBOLO"); }
  }
  /* pendências em português, sem chave de código. def = a folha (null = quadro geral da folha 01). Prefixo da chave → sistemas da folha. */
  var PEND_SIS = { af: ["agua_fria"], aq: ["agua_quente"], es: ["esgoto", "ventilacao"], ap: ["pluvial"], inc: ["incendio"], ind: ["gas", "industrial"], gas: ["gas"] };
  /* os sistemas que a folha desenha (pelo título e, quando houver, pelo sis da folha): é o que decide em quais folhas a pendência aparece */
  function sisDaFolha(def) {
    var t = txt(def && def.titulo).toUpperCase(), o = [].concat(def && def.sis || []);
    if (/ÁGUA FRIA|AGUA FRIA|ESQUEMA VERTICAL/.test(t)) o.push("agua_fria");
    if (/ÁGUA QUENTE|AGUA QUENTE/.test(t)) o.push("agua_quente");
    if (/ESGOTO|ESQUEMA VERTICAL/.test(t)) o.push("esgoto");
    if (/VENTILA/.test(t)) o.push("ventilacao");
    if (/PLUVIA/.test(t)) o.push("pluvial");
    if (/G[ÁA]S/.test(t)) o.push("gas");
    if (/INC[ÊE]NDIO/.test(t)) o.push("incendio");
    return o;
  }
  function pendTextos(r, def) {
    var M = MEM(), out = [], vistos = {}, sisF = def ? sisDaFolha(def) : null;
    function humano(x) { var y = M.chaveHumana ? M.chaveHumana(M.limpaFonte ? M.limpaFonte(x) : x) : x; y = (M.rotuloTema && M.rotuloTema(y)) || y; return txt(y).replace(/\s+/g, " ").trim(); }
    /* trava de segurança (só resultado de TESTE): vale em toda folha */
    if (r && r.fixture) out.push({ t: "TABELAS DE TESTE - NÃO É NORMA. PRANCHA NÃO PODE SER EMITIDA.", cor: K2.vermelho });
    arr(r && r.pendencias).forEach(function (p) {
      var pre = txt(p.chave).split(".")[0];
      if (def && !(PEND_SIS[pre] || []).some(function (q) { return sisF.indexOf(q) >= 0; })) return;
      var t = humano(p.motivo || p.texto || p.chave); if (!t || vistos[t]) return;
      vistos[t] = 1; out.push({ t: t, cor: K2.vermelho });
    });
    if (def) return out;
    var errosC = arr(r && r.avisos).filter(function (q) { return q.gravidade === "erro"; }), MAX_ERROS = 5;   // hid:ok quantos erros cabem na folha (desenho, não norma)
    errosC.slice(0, MAX_ERROS).forEach(function (q) { out.push({ t: "Erro de cálculo: " + humano(q.texto), cor: K2.vermelho }); });
    /* revisão F7 M6: o que não cabe na folha é dito, nunca omitido em silêncio */
    if (errosC.length > MAX_ERROS) out.push({ t: "+" + (errosC.length - MAX_ERROS) + " erro(s) de cálculo não listados — ver memorial, seção de pendências.", cor: K2.vermelho });
    var nv = arr(r && r.verificacoes).filter(function (v) { return v.status === "pendente"; }).length;
    if (nv) out.push({ t: nv + " verificação(ões) do cálculo a confirmar — ver o quadro de confirmações no memorial de cálculo.", cor: K2.vermelho });
    return out;
  }
  function notasDe(c) {
    var r = c.r, out = [];
    out.push({ titulo: "NOTAS GERAIS", numerar: true, itens: [
      "Diâmetros nominais (DN) em mm; cotas de comprimento em cm; alturas e níveis em m, medidos do piso acabado do pavimento.",
      "O isométrico não tem escala: vale a cota. A planta tem a escala indicada em cada vista.",
      "Os DN, vazões e declividades são os do dimensionamento (resultado do cálculo); conferir antes de executar.",
      "Conferir em obra as cotas e o compatibilizado com os projetos de arquitetura, estrutura e elétrico antes de furar ou cortar elemento estrutural.",
      "Declividade do esgoto indicada em cada trecho (i); nunca executar com declividade menor que a indicada. Onde aparece \"i ≥ X% (modelo Y%: corrigir)\", vale a mínima X%.",
      "Onde aparece \"DN a confirmar\", o diâmetro ainda não está definido: não executar o trecho antes da confirmação do responsável técnico.",
      "Detalhes típicos são esquemáticos: a dimensão vale a do fabricante escolhido (letras da ficha na tabela)."
    ].concat(arr(c.cfg && c.cfg.notasExtra)) });
    /* Casa 487 (F9): uma linha por norma (as edições e os tipos de fonte juntos), sem a observação interna da tabela entre parênteses e sem o fluido industrial (o projeto não tem) */
    var gN = {}, ordN = [];
    arr(r && r.normas).forEach(function (q) {
      var b0 = String(q.norma || q.titulo || q.chave || ""); if (!b0 || /^Fluidos industriais/i.test(b0)) return;
      var g = gN[b0]; if (!g) { g = gN[b0] = { eds: [], tipos: [] }; ordN.push(b0); }
      var ed = String(q.edicao || "").split(" (")[0].replace(/^vários?$/i, "").trim();
      if (/^\d/.test(ed) && g.eds.indexOf(ed) < 0) g.eds.push(ed);   /* só edição de verdade (ano); "critério de projetista", "Manual Técnico…" e as observações ficam de fora */
      var tp = q.tipo === "primaria" ? "primária" : (q.tipo === "secundaria" ? "secundária" : ""); if (tp && g.tipos.indexOf(tp) < 0) g.tipos.push(tp);
    });
    var uniq = ordN.map(function (b0) { var g = gN[b0]; return b0 + (g.eds.length ? " (" + g.eds.join(" e ") + ")" : "") + (g.tipos.length ? " - fonte " + g.tipos.join(" e ") : ""); });
    out.push({ titulo: "NORMAS USADAS NO CÁLCULO", itens: uniq.length ? uniq : [{ t: "Nenhuma tabela de norma carregada no cálculo.", cor: K2.vermelho }] });
    var pend = pendTextos(r, null);
    if (pend.length) out.push({ titulo: "ITENS A CONFIRMAR", itens: pend, cor: K2.vermelho });
    return out;
  }
  var CONVENCOES = ["AF água fria · AQ água quente · ES esgoto · VE ventilação · AP águas pluviais",
    "AF-n coluna de água fria · TQ-n tubo de queda · CS caixa sifonada · CI caixa de inspeção · CG caixa de gordura",
    "RG registro de gaveta · RP registro de pressão · RE registro de esfera · VR válvula de retenção · VD válvula de descarga",
    "BS bacia · BCA bacia c/ caixa acoplada · LV lavatório · CH chuveiro · DC ducha higiênica · PIA pia · MIC mictório · MLR máquina de lavar",
    "ø diâmetro nominal (mm) · i declividade (%) · +0,60 altura do piso acabado (m)"];
  /* a altura que a coluna precisa com a letra h (legenda + blocos) */
  function medirColuna(leg, blocos, h, wmax, hLegTit) {
    var AP0 = AP(), tot = hLegTit * K2.tituloEntre + 1.5;
    leg.forEach(function (it) { tot += Math.max(K2.legLinha, AP0.quebrar(it[1], h, wmax - K2.legTexto).length * h * K2.notaLinha + K2.notaEntre); });
    tot += K2.blocoEntre;
    blocos.forEach(function (b) {
      tot += hLegTit * K2.tituloEntre + 1.5;
      b.itens.forEach(function (it, i) { var t = it && typeof it === "object" ? it.t : it, pre = b.numerar ? (i + 1) + "- " : "- "; tot += AP0.quebrar(t, h, wmax - larg(pre, h)).length * h * K2.notaLinha + K2.notaEntre; });
      tot += K2.blocoEntre;
    });
    return tot;
  }
  /* o que fica na coluna e o que vai para a folha de NOTAS GERAIS (sai primeiro: normas, notas, convenções, pendências) */
  function planejarColuna(geo, blocos, r, temQr) {
    var T = AP().estilo().T, col = geo.coluna, car = geo.carimbo, wmax = col.w - 7, leg = legendaItens(r), hLegTit = T.quadro * K2.tituloQuadro;
    var disp = (car.y - 3) - (col.y + 4) - (temQr ? K2.qr + K2.qrTexto * 2 + K2.blocoEntre : 0);
    var ficam = blocos.slice(), saem = [], ordemSai = ["NORMAS USADAS NO CÁLCULO", "NOTAS GERAIS", "CONVENÇÕES", "ITENS A CONFIRMAR"];
    var hs = [T.nota, T.nota * 0.92, T.nota * 0.84, T.minimo];
    function cabe(lista, extra) { for (var i = 0; i < hs.length; i++) if (medirColuna(leg, lista.concat(extra || []), hs[i], wmax, hLegTit) <= disp) return hs[i]; return null; }
    var aviso = { titulo: "VER FOLHA DE NOTAS", itens: [{ t: "-" }] }, h = cabe(ficam);
    for (var k = 0; h == null && k < ordemSai.length; k++) {
      var ix = -1; ficam.forEach(function (b, i) { if (b.titulo === ordemSai[k]) ix = i; });
      if (ix < 0) continue;
      saem.push(ficam.splice(ix, 1)[0]);
      h = cabe(ficam, [aviso]);
    }
    return { leg: leg, ficam: ficam, saem: saem, h: h == null ? T.minimo : h, coube: h != null, disp: disp };
  }
  function colunaLegenda(D, g, plano, opc) {
    var col = g.coluna, car = g.carimbo, T = D.E.T, x0 = col.x + 4, wmax = col.w - 7, yMin = col.y + 4, yMax = car.y - 3 - (opc.qr ? K2.qr + K2.qrTexto * 2 + K2.blocoEntre : 0), AP0 = AP();
    D.linha(col.x, col.y, col.x, car.y, "HID-MOLDURA");
    var leg = plano.leg, hLegTit = T.quadro * K2.tituloQuadro, h = plano.h;
    var y = yMin;
    D.texto(x0, y + hLegTit * KI0(), "LEGENDA", hLegTit, { peso: 0.26 }); y += hLegTit * K2.tituloEntre + 1.5;
    leg.forEach(function (it) {
      var ls = AP0.quebrar(it[1], h, wmax - K2.legTexto), alt = Math.max(K2.legLinha, ls.length * h * K2.notaLinha + K2.notaEntre);
      simboloLeg(D, it[0], x0 + K2.legSimbolo, y + alt / 2);
      ls.forEach(function (s, q) { D.texto(x0 + K2.legTexto, y + h * KI0() + q * h * K2.notaLinha + (alt - ls.length * h * K2.notaLinha) / 2, s, h, {}); });
      y += alt;
    });
    y += K2.blocoEntre;
    var blocos = plano.ficam.map(function (b0) {
      if (b0.titulo !== "ITENS A CONFIRMAR" || !opc.folhaDef) return b0;
      var its = opc.primeira ? b0.itens : pendTextos(opc.r, opc.folhaDef);
      return its.length ? { titulo: b0.titulo, itens: its, cor: b0.cor } : null;
    }).filter(Boolean);
    if (plano.saem.length) blocos.push({ titulo: "VER FOLHA " + opc.folhaNotas, itens: [{ t: plano.saem.map(function (b) { return b.titulo; }).join(", ") + ": na folha " + opc.folhaNotas + "." , cor: plano.saem.some(function (b) { return b.titulo === "ITENS A CONFIRMAR"; }) ? K2.vermelho : null }] });
    blocos.forEach(function (b) {
      D.texto(x0, y + hLegTit * KI0(), b.titulo, hLegTit, { peso: 0.26, cor: b.cor });
      y += hLegTit * K2.tituloEntre + 1.5;
      b.itens.forEach(function (it, i) {
        var o = it && typeof it === "object" ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = larg(pre, h);
        D.texto(x0, y + h * KI0(), pre, h, { cor: o.cor || b.cor });
        AP0.quebrar(o.t, h, wmax - rec).forEach(function (s) { if (y + h < yMax + 0.5) D.texto(x0 + rec, y + h * KI0(), s, h, { cor: o.cor || b.cor }); y += h * K2.notaLinha; });
        y += K2.notaEntre;
      });
      y += K2.blocoEntre;
    });
    if (opc.qr) {
      var yq = car.y - 3 - K2.qr - K2.qrTexto * 1.6, xq = col.x + (col.w - K2.qr) / 2;
      if (desenharQr(D, opc.qr, xq, yq, K2.qr)) D.texto(col.x + col.w / 2, yq - K2.qrTexto * 0.5, K2.qrRot + " (aponte a câmera)", K2.qrTexto, { al: "C", peso: 0.16 });
    }
    return y <= yMax + 0.5;
  }
  function KI0() { return HI().K.base; }

  /* hid:fisica-fim */
  /* ------------------------------------------------------------ GERAR */
  function gerar(resultado, modelo, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], P = PR(), A = AP(), H = HI(), B = BI(), cfg = normalizarConfig(opcoes);
    if (!P || !P.carimboRA || !A || !H || !B) return { ok: false, folhas: [], avisos: ["Motores de prancha (prancha.js, acopranchas.js, hidisometrico.js, biminst.js) não carregados."] };
    if (!resultado || !resultado.sistemas || !modelo || !modelo.estado) return { ok: false, folhas: [], avisos: ["Resultado do cálculo ou modelo vazio: não há pranchas para gerar."] };
    var rede = B.rede(modelo.estado, modelo.avaliarFam), ix = H.indicesResultado(resultado), E = estilo();
    var pavs = arr(opcoes.pavimentos).filter(function (p) { return p && isFinite(+p.cota); }).map(function (p) { return { nome: txt(p.nome), cota: +p.cota }; }).sort(function (a, b) { return a.cota - b.cota; });
    if (!pavs.length) { pavs = [{ nome: "PISO", cota: 0 }]; avisos.push("Pavimentos não informados: um pavimento único na cota 0 do modelo."); }
    pavs.forEach(function (p, i) { p.topo = i + 1 < pavs.length ? pavs[i + 1].cota : Infinity; p.base = i ? p.cota - K2.cortePiso : -Infinity; p.sup = i + 1 < pavs.length ? pavs[i + 1].cota - K2.cortePiso : Infinity; });
    var formato = cfg.formato === "AUTO" ? formatoAuto(P, rede, pavs, cfg) : (P.FORMATOS && P.FORMATOS[cfg.formato] ? cfg.formato : "A1"), geo = P.geometria(formato, "paisagem", "RA");
    /* os sistemas: os escolhidos na tela, entre os que o resultado traz (água fria e esgoto sempre que houver rede) */
    var SR = resultado.sistemas || {}, presentes = ["agua_fria", "esgoto"].concat(SR.agua_quente ? ["agua_quente"] : [], SR.pluvial ? ["pluvial"] : [], SR.industrial ? ["industrial"] : [], SR.gas ? ["gas"] : []);
    var escolhidos = arr(opcoes.sistemas).length ? opcoes.sistemas : presentes;
    var sistemas = escolhidos.filter(function (s) { return s !== "incendio" && s !== "tratamento"; });
    var querInc = !arr(opcoes.sistemas).length || escolhidos.indexOf("incendio") >= 0, querTrat = !arr(opcoes.sistemas).length || escolhidos.indexOf("tratamento") >= 0;
    var CJ = cfg.conjuntos;
    var colunas = (function () { var tr = arr(rede.trechos).filter(function (t) { return t.sistema === "agua_fria"; }); return colunasPublicas(H, tr, opcoes); })();
    var prefixo = txt(opcoes.prefixo).trim() ? cfg.prefixo : (txt(opcoes.codigo).trim() ? txt(opcoes.codigo).trim().toUpperCase() : cfg.prefixo);
    var codigo = txt(opcoes.codigo).trim() || prefixo, rev = cfg.revisao, data = txt(opcoes.data).trim() || hoje();
    var ambientes = arr(opcoes.ambientes).length ? opcoes.ambientes : ambientesAuto(modelo.estado, pavs), nomeAp = nomeAparelhoFn(modelo.estado);
    var defs = [], prims = [];
    var ctxV = { modelo: modelo, rede: rede, ix: ix, colunas: colunas, nomeAp: nomeAp, avisos: avisos, geo: geo, pavs: pavs, AP: A, cfg: cfg, prims: prims, n: 0, ambientes: ambientes };
    /* PLANTAS e CORTES do pavimento como VISTAS empacotadas (rodada 2): a escala das plantas é a maior da lista usual que cabe;
       vistas pequenas dividem a folha (AF e ES lado a lado; planta + cortes), o bloco centrado na área útil */
    if (CJ.plantas || CJ.cortes) pavs.forEach(function (pv) {
      var ps = CJ.plantas ? sistemas.map(function (sis) { return { sis: sis, trs: trechosDoPav(rede, sis, pv) }; }).filter(function (x) { return x.trs.length; }) : [];
      var cortes = [];
      if (CJ.cortes) paredesHidraulicas(ctxV, pv).forEach(function (ph, i) { ph.pv = pv; ph.n = i + 1; cortes.push(prepCorte(ctxV, ph, geo.area)); });
      function montar(esc0) {
        var it = []; ps.forEach(function (x) { it.push(prepPlanta(ctxV, x.sis, x.trs, pv, esc0, "PLANTA DE " + (NOME_SIS[x.sis] || x.sis).toUpperCase() + (x.sis === "esgoto" ? " E VENTILAÇÃO" : "") + " - " + pv.nome.toUpperCase())); });
        it = it.concat(cortes);
        return { itens: it, folhas: empacotar(it, geo.area, cfg.agrupar) };
      }
      var esc = ps.length ? escalaDoPav(ctxV, ps.map(function (x) { return extensaoPlanta(ctxV, x.trs, pv); })) : null, mt = montar(esc);
      /* DIAGRAMAÇÃO: com escala automática, um passo abaixo na lista usual vale se as vistas couberem em MENOS folhas
         (AF e ES juntas na mesma folha em vez de duas folhas meio vazias) */
      var ie = K2.escalas.indexOf(esc);
      if (ps.length > 1 && !num(cfg.escala, null) && ie >= 0 && ie + 1 < K2.escalas.length && K2.escalas[ie + 1] <= K2.escalaAlvo && cfg.agrupar !== false) {   /* nunca abaixo da 1:50 para juntar folhas */
        var mt2 = montar(K2.escalas[ie + 1]);
        if (mt2.folhas.length < mt.folhas.length) { mt = mt2; esc = K2.escalas[ie + 1]; }
      }
      mt.folhas.forEach(function (fl) {
        var pl = fl.itens.filter(function (it) { return it.tipo === "planta"; }), co0 = fl.itens.filter(function (it) { return it.tipo === "corte"; });
        var tit = fl.itens.length === 1 && pl.length ? pl[0].titulo
          : (pl.length ? (pl.length > 1 ? "PLANTAS DE " + pl.map(function (it) { return it.titulo.replace(/^PLANTA DE /, "").replace(/ - [^-]+$/, ""); }).join(", ") : pl[0].titulo.replace(/ - [^-]+$/, "")) : "") +
            (co0.length ? (pl.length ? " E " : "") + "CORTES DAS PAREDES HIDRÁULICAS" : "") + (fl.itens.length === 1 && pl.length ? "" : " - " + pv.nome.toUpperCase());
        defs.push({ id: (pl.length ? "planta-" : "cortes-") + defs.length, titulo: tit, tipo: pl.length ? "planta" : "cortes", vistas: fl.itens, pv: pv, grupo: pl.length ? "plantas" : "cortes", ocupacao: fl.ocupacao });
      });
    });
    if (CJ.plantas) {
      if (SR.incendio && querInc) pavs.forEach(function (pv) {
        var trs = trechosDoPav(rede, "incendio", pv), pts = arr(obj0(SR.incendio.hidrantes).pontos).filter(function (p) { return p.pavimento === pv.nome; }), ext = extPontos(SR.incendio, pv.nome);
        if (trs.length || pts.length || ext.length) defs.push({ id: "planta-in-" + defs.length, titulo: "PLANTA DE INCÊNDIO - HIDRANTES E EXTINTORES - " + pv.nome.toUpperCase(), tipo: "incendio", sis: "incendio", trs: trs, pv: pv, grupo: "plantas" });
      });
      if (SR.tratamento && querTrat) defs.push({ id: "tratamento", titulo: "TRATAMENTO - PLANTA E CORTE DAS UNIDADES (COTADAS)", tipo: "tratamento", grupo: "plantas" });
    }
    var ctx0 = { modelo: modelo, rede: rede, ix: ix, ambientes: ambientes, nomeAp: nomeAp, avisos: avisos, geo: geo, pavs: pavs, AP: A, cfg: cfg };
    var iso = { desenhos: [], avisos: [] };
    if (CJ.isometricos) {
      iso = H.gerar(resultado, modelo, { pavimentos: pavs, ambientes: ambientes, nomeAparelho: nomeAp, nomePeca: function (id) { return rotuloPecaPlanta(rede, id); }, sistemas: sistemas.filter(function (q) { return q === "agua_fria" || q === "esgoto" || q === "agua_quente"; }), area: { w: geo.area.w - 2 * K2.folgaFolha, h: geo.area.h - K2.titulo - K2.folgaFolha } });
      arr(iso.avisos).forEach(function (m) { avisos.push(m); });
      arr(iso.desenhos).forEach(function (d) { defs.push({ id: d.id, titulo: d.titulo, tipo: "iso", iso: d, grupo: "isometricos" }); });
    }
    if (CJ.perspectivas) {
      var escA = cfg.perspectiva.ambientes.map(function (x) { return x.toUpperCase(); });
      pavs.forEach(function (pv) {
        ambientes.forEach(function (am) {
          if (escA.length && escA.indexOf(txt(am.id).toUpperCase()) < 0 && escA.indexOf(txt(am.nome).toUpperCase()) < 0) return;
          var pz = perspectivaDe(ctx0, am, pv);
          if (pz) defs.push({ id: "perspectiva-" + am.id + "-" + defs.length, titulo: "PERSPECTIVA ISOMÉTRICA - " + txt(am.nome).toUpperCase() + (pavs.length > 1 ? " - " + pv.nome.toUpperCase() : ""), tipo: "perspectiva", persp: pz, pv: pv, grupo: "perspectivas", ambiente: am.id });
        });
      });
    }
    /* R01: ISOMÉTRICO POR AMBIENTE (js/hidcaderno.js): o bloco da referência da Tânia (planta + isométrico com balões de código + tabelas), 2 por folha */
    if (CJ.ambientes) {
      var HCa = dep("HidCaderno", "./hidcaderno.js");
      if (!HCa) avisos.push("O motor do isométrico por ambiente (js/hidcaderno.js) não carregou: folhas de ambiente não geradas.");
      else pavs.forEach(function (pv) {
        /* HIDRO-3D: um BLOCO por ambiente e grupo de sistema (água | esgoto e ventilação | pluvial | gás), 2 por folha; cada bloco parte só das peças modeladas do grupo */
        var amL = HCa.ambientesDoModelo(ctx0, pv), nBlocos = 2, itensAm = [];
        amL.forEach(function (am0) {
          var gs0 = []; try { gs0 = HCa.gruposDoAmbiente(ctx0, am0, pv); } catch (eG) { gs0 = []; }
          if (!gs0.length) itensAm.push({ am: am0, g: null }); else gs0.forEach(function (g0) { itensAm.push({ am: am0, g: g0.id, gn: g0.nome }); });
        });
        for (var ia = 0; ia < itensAm.length; ia += nBlocos) {
          var gp = itensAm.slice(ia, ia + nBlocos);
          defs.push({ id: "ambientes-" + (ia / nBlocos + 1), titulo: "ISOMÉTRICO POR AMBIENTE - " + gp.map(function (q) { return q.am.nome + (q.gn ? " (" + q.gn + ")" : ""); }).join(" E ") + (pavs.length > 1 ? " - " + pv.nome.toUpperCase() : ""), tipo: "ambientes", ambientes: gp.map(function (q) { return q.am; }), grupos: gp.map(function (q) { return q.g; }), pv: pv, numeros: gp.map(function (q, j) { return dois(ia + j + 1); }), grupo: "ambientes" });
        }
      });
    }
    if (CJ.esquema) defs.push({ id: "esquema-vertical", titulo: "ESQUEMA VERTICAL - " + (caixasReais(modelo).length ? "RESERVAÇÃO, BARRILETE, " : "") + "ÁGUA FRIA E ESGOTO", tipo: "esquema", grupo: "esquema" });
    /* PRESSURIZAÇÃO (js/hidpressao.js): folha própria com o detalhe da instalação e a curva com o ponto de operação */
    var HPZp = dep("HidPressao", "./hidpressao.js");
    if (CJ.detalhes && HPZp && HPZp.temNoModelo && HPZp.temNoModelo(modelo)) defs.push({ id: "detalhe-pressurizador", titulo: "DETALHE DO PRESSURIZADOR", tipo: "pressurizador", grupo: "detalhes" });
    if (CJ.detalhes) { var lay = layoutDetalhes(geo, resultado); for (var pd = 0; pd < lay.folhas; pd++) defs.push({ id: "detalhes" + (pd ? "-" + (pd + 1) : ""), titulo: "DETALHES TÍPICOS" + (lay.folhas > 1 ? " (" + (pd + 1) + "/" + lay.folhas + ")" : ""), tipo: "detalhes", parte: pd, grupo: "detalhes" }); }
    if (CJ.quadro) {
      var lq = linhasQuadro(ctx0);
      if (lq && lq.length) { var pq = paginarQuadro(ctx0, lq); pq.paginas.forEach(function (pg, k) { defs.push({ id: "quadro" + (k ? "-" + (k + 1) : ""), titulo: "QUADRO DE MATERIAIS" + (pq.paginas.length > 1 ? " (" + (k + 1) + "/" + pq.paginas.length + ")" : ""), tipo: "quadro", pagina: pg, nCol: pq.nCol, grupo: "quadro" }); }); }
      else defs.push({ id: "quadro", titulo: "QUADRO DE MATERIAIS", tipo: "quadro", pagina: null, nCol: 1, grupo: "quadro" });
    }
    if (!defs.length) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhum conjunto de folhas escolhido (ou nada a desenhar nos sistemas escolhidos)."]) };
    /* a coluna: legenda + convenções + notas + normas + pendências; o que não couber vai para a folha de NOTAS */
    var blocos = notasDe({ r: resultado, cfg: cfg }), qrTxt = cfg.qr || "";
    blocos.splice(0, 0, { titulo: "CONVENÇÕES", itens: CONVENCOES.slice() });
    var plano = planejarColuna(geo, blocos, resultado, !!qrTxt);
    if (plano.saem.length) defs.push({ id: "notas", titulo: "NOTAS GERAIS, CONVENÇÕES E NORMAS", tipo: "notas", grupo: "notas" });
    var feitas = [], offs = [];
    defs.forEach(function (df, i) {
      var D = marcarCamadas(new A.Desenho(E, [])), chk = { tubos: [], cotas: [] };
      var c = { D: D, geo: geo, r: resultado, rede: rede, ix: ix, colunas: colunas, pavs: pavs, avisos: avisos, n: i + 1, AP: A, titulo: df.titulo, sis: df.sis, trs: df.trs, iso: df.iso, pv: df.pv, prims: prims, offs: offs,
                cfg: cfg, modelo: modelo, ambientes: ambientes, nomeAp: nomeAp, chk: chk, cortes: df.cortes, parte: df.parte, quadroPagina: df.pagina, quadroNCol: df.nCol, blocosExtra: plano.saem }, res = {};
      try {
        if (df.vistas) { c.vistas = df.vistas; res = folhaVistas(c); }
        else if (df.tipo === "incendio") res = folhaIncendio(c);
        else if (df.tipo === "tratamento") res = folhaTratamento(c);
        else if (df.tipo === "iso") res = folhaIso(c);
        else if (df.tipo === "esquema") res = folhaEsquema(c);
        else if (df.tipo === "quadro") res = folhaQuadro(c);
        else if (df.tipo === "notas") res = folhaNotas(c);
        else if (df.tipo === "perspectiva") { c.persp = df.persp; res = folhaPerspectiva(c); }
        else if (df.tipo === "ambientes") { c.pv = df.pv; res = dep("HidCaderno", "./hidcaderno.js").folhaAmbientes(c, df); }
        else if (df.tipo === "pressurizador") { c.modelo = c.modelo || modelo; res = dep("HidPressao", "./hidpressao.js").folhaPrancha(c); }
        else res = folhaDetalhes(c);
      } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + K2.erroX, geo.area.y + K2.erroY, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: K2.vermelho }); }
      if (!res) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): nada a desenhar (sem colunas de AF nem tubos de queda); folha mantida vazia."); res = {}; D.texto(geo.area.x + K2.erroX, geo.area.y + K2.vazioY, "Sem colunas de água fria nem tubos de queda no modelo.", E.T.nota, { cor: K2.vermelho }); }
      feitas.push({ def: df, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1), chk: chk });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "hidpranchas", nome: "Projeto hidrossanitário", formato: formato, orientacao: "paisagem", origem: "hidro",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: arr(opcoes.revisoesAnteriores).map(function (q) { return [txt(q[0]), txt(q[1]), txt(q[2])]; }).concat([[revNum, txt(opcoes.descricaoRevisao) || cfg.descricaoRevisao, data]]) },   /* R01: a linha da R00 fica no quadro de revisões */
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: prefixo + "-" + f.rotulo }; }) });   /* R01: o código do desenho é HID-nn (a revisão vai na coluna REV do carimbo), não "HID R00" */
    var nPrinc = feitas.length, verif = { folhas: [], sobreposicoes: 0, rotuloTubo: 0, rotuloCota: 0 }, nNotas = null;
    feitas.forEach(function (f) { if (f.def.tipo === "notas") nNotas = prefixo + "-" + f.rotulo; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = marcarCamadas(new A.Desenho(E, null));
      Fd.ret(M.x, M.y, M.w, M.h, "HID-MOLDURA");
      if (!colunaLegenda(Fd, geo, plano, { qr: qrTxt, folhaNotas: nNotas, folhaDef: f.def, primeira: i === 0, r: resultado }) && i === 0) avisos.push("Legenda e notas não cabem na coluna com a letra mínima do padrão: conferir.");
      A.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nPrinc));
      var numero = prefixo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(Hp) + 'mm" viewBox="0 0 ' + n(W) + " " + n(Hp) + '" font-family="' + FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(Hp) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + '<g data-folha-moldura="1">' + Fd.svg() + "</g></svg>";
      var cx = D.caixas || [], pares = A.sobreposicoes(cx), cf = conferirFolha(cx, f.chk);
      verif.folhas.push({ numero: numero, tipo: f.def.tipo, textos: cx.length, sobreposicoes: pares.length, pares: pares.slice(0, K2.parEx), rotuloTubo: cf.rotuloTubo.length, rotuloCota: cf.rotuloCota.length, exTubo: cf.rotuloTubo.slice(0, K2.parEx), exCota: cf.rotuloCota.slice(0, K2.parEx) });
      verif.sobreposicoes += pares.length; verif.rotuloTubo += cf.rotuloTubo.length; verif.rotuloCota += cf.rotuloCota.length;
      if (pares.length) avisos.push("Folha " + numero + ": " + pares.length + " par(es) de textos sobrepostos (ex.: " + pares.slice(0, K2.parAviso).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      if (cf.rotuloTubo.length) avisos.push("Folha " + numero + ": " + cf.rotuloTubo.length + " rótulo(s) sobre tubo (ex.: " + cf.rotuloTubo.slice(0, K2.parAviso).map(function (q) { return q[0]; }).join("; ") + ").");
      if (cf.rotuloCota.length) avisos.push("Folha " + numero + ": " + cf.rotuloCota.length + " rótulo(s) sobre cota (ex.: " + cf.rotuloCota.slice(0, K2.parAviso).map(function (q) { return q[0]; }).join("; ") + ").");
      return { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, tipo: f.def.tipo, grupo: f.def.grupo, formato: formato, escala: f.escala, svg: svg, caixasTexto: cx,
               vistas: arr(f.def.vistas).map(function (it) { return it.titulo; }), ocupacao: f.def.ocupacao == null ? null : Math.round(f.def.ocupacao * 100) / 100 };
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, verificacao: verif, isometricos: iso.desenhos, fixture: !!resultado.fixture, config: cfg, ambientes: ambientes, prefixo: prefixo, revisao: rev };
  }
  /* as colunas de AF (mesmo critério do isométrico) */
  function colunasPublicas(H, trAF, opcoes) {
    /* reaproveita o gerador do isométrico: ele nomeia AF-n pela cadeia vertical; aqui só precisamos do mapa trecho → coluna */
    var vert = trAF.filter(function (t) { return t.vertical; }), cad = [], KI = H.K;
    vert.forEach(function (t) {
      var c = null; cad.forEach(function (q) { if (!c && Math.abs(q.x - t.p1.x) < KI.tolNo_m && Math.abs(q.z - t.p1.z) < KI.tolNo_m) c = q; });
      if (!c) { c = { ids: [], x: t.p1.x, z: t.p1.z, L: 0 }; cad.push(c); }
      c.ids.push(t.id); c.L += Math.abs(t.p2.y - t.p1.y);
    });
    var min = num(opcoes && opcoes.colunaMinima_m, KI.colunaMin_m), lista = cad.filter(function (c) { return c.L >= min - H.K.eps; }), out = {};
    lista.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    lista.forEach(function (c, i) { c.nome = "AF-" + (i + 1); c.ids.forEach(function (id) { out[id] = c; }); });
    return out;
  }

  /* ------------------------------------------------------------ EXPORTAR (mesmo caminho das outras pranchas: SVG → SvgPdf) */
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var S = PDF(); return S ? S.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Projeto hidrossanitário" }) : null; }
    if (formato === "dxf") return paraDxf(r);
    return null;
  }

  /* R01: o contexto-base (rede, índices do cálculo, pavimentos, ambientes) que o CADERNO (js/hidcaderno.js) e o isométrico por ambiente usam, no formato de folha escolhido */
  function ctxBase(resultado, modelo, opcoes, formato) {
    opcoes = opcoes || {};
    var P = PR(), A = AP(), H = HI(), B = BI(), cfg = normalizarConfig(opcoes);
    var rede = B.rede(modelo.estado, modelo.avaliarFam), ix = H.indicesResultado(resultado), avisos = [];
    var pavs = arr(opcoes.pavimentos).filter(function (p) { return p && isFinite(+p.cota); }).map(function (p) { return { nome: txt(p.nome), cota: +p.cota }; }).sort(function (a, b) { return a.cota - b.cota; });
    if (!pavs.length) pavs = [{ nome: "PISO", cota: 0 }];
    pavs.forEach(function (p, i) { p.topo = i + 1 < pavs.length ? pavs[i + 1].cota : Infinity; p.base = i ? p.cota - K2.cortePiso : -Infinity; p.sup = i + 1 < pavs.length ? pavs[i + 1].cota - K2.cortePiso : Infinity; });
    var geo = P.geometria(formato || "A3", "paisagem", "RA");
    var colunas = colunasPublicas(H, arr(rede.trechos).filter(function (t) { return t.sistema === "agua_fria"; }), opcoes);
    var ambientes = arr(opcoes.ambientes).length ? opcoes.ambientes : ambientesAuto(modelo.estado, pavs);
    return { cfg: cfg, rede: rede, ix: ix, pavs: pavs, geo: geo, colunas: colunas, ambientes: ambientes, nomeAp: nomeAparelhoFn(modelo.estado), avisos: avisos, prims: [], modelo: modelo, r: resultado, AP: A, E: estilo() };
  }
  var _int = { paredesDoPav: paredesDoPav, ctxBase: ctxBase, estilo: estilo, marcarCamadas: marcarCamadas, perspectivaDe: perspectivaDe, folhaPerspectiva: folhaPerspectiva, formasDe: formasDe, formasPlanta: formasPlanta, plantaPrim: plantaPrim, desenhar: desenhar,
    bordasTubo: bordasTubo, obstaculosFormas: obstaculosFormas, deTubo: deTubo, listasArq: listasArq, fundoArquitetura: fundoArquitetura, trechosDoPav: trechosDoPav, poliCheio: poliCheio, br: br, larg: larg, n: n, dois: dois, esc: esc,
    CAMADA_SIS: CAMADA_SIS, NOME_SIS: NOME_SIS, NOME_SIS_Q: NOME_SIS_Q, ORD_SIS_P: ORD_SIS_P, notasDe: notasDe, legendaItens: legendaItens, simboloLeg: simboloLeg, nomeFamilia: nomeFamilia, rotuloPecaPlanta: rotuloPecaPlanta,
    paredesDoPav: paredesDoPav, paredesHidraulicas: paredesHidraulicas, desenhoCorte: desenhoCorte, recortaEixo: recortaEixo, linhasLoucas: linhasLoucas, APARELHO_RE: APARELHO_RE, caixasReais: caixasReais, dnRotulo: dnRotulo, gruposRotulo: gruposRotulo, iconePeca: iconePeca, conferirFolha: conferirFolha, hoje: hoje, FONTE: FONTE, PAD: PAD, dist3d: dist3d };
  var HidPranchas = { _int: _int, VERSAO: 2, K2: K2, gerar: gerar, exportar: exportar, estilo: estilo, trechosDoPav: trechosDoPav,
    configPadrao: configPadrao, normalizarConfig: normalizarConfig, ambientesAuto: ambientesAuto, paraDxf: paraDxf, conferirFolha: conferirFolha,
    CONJUNTOS: CONJUNTOS, ROTULO_CONJUNTO: ROTULO_CONJUNTO, SISTEMAS_FOLHA: SISTEMAS_FOLHA, FORMATOS: FORMATOS_OK, _segQuad: segQuad, _aciDe: aciDe };
  global.HidPranchas = HidPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

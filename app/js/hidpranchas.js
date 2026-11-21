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
    calc: { casas: 2, casasUhc: 1, afasta: 1 },   /* cálculo no isométrico: casas da pressão (mca), do UHC (inteiro quando exato) e o afastamento do rótulo de pressão em relação ao da cota */
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
    cor: { AF: "#1E6FD9", AQ: "#D93025", ES: "#2E9E44", VE: "#7C3AED", AP: "#00ACC1", IN: "#C62828", IND: "#6D4C41", GAS: "#C9A400" },
    tracoVE: "4 1.5", tracoEixo: "9.6 1.6 0.4 1.6", vermelho: "#c00000",
    /* GERAR PRANCHAS (18/10/2026): arquitetura em meio-tom, contorno do tubo cheio, cortes, detalhes, quadro, QR */
    arq: { preench: "#e4e4e4", contorno: "#c8ccd1", louca: "#c8ccd1", mm: 0.13 }, contornoTubo: 0.09, contornoFrac: 0.12, tuboFinoMm: 1.0,
    escalasCorte: [20, 25, 50, 75], cortePiso: 0.6, corteTopo: 0.3, faixaParede: 0.2, folgaCorte: 14, corteMinPontos: 1, corteMargemFaixa: 0.45, corteFaixaMin: 1.2,
    qr: 30, qrTexto: 2.5, qrRot: "PORTAL DA OBRA",
    /* QR POR FOLHA DE AMBIENTE (15/11/2026): link do portal + ?amb=<id do ambiente> (vários: separados por vírgula); o rótulo diz o que o QR abre */
    qrParam: "amb", qrSep: ",", qrRotAmb: "abrir no 3D", qrRotJunta: " e ", avisoSemPortal: "Sem portal da obra: o QR das folhas de ambiente não foi gerado - publique a placa/portal da obra e informe o link no campo \"QR do portal da obra\".", qrRotSep: " - ", qrReticencia: "...",
    seta: { c: 1.3, l: 0.45 },
    isoRef: { minSeta: 6, seta: 1.3, corAF: "#0d3a9a", corAQ: "#a01818", alemAmb: 0.6, corParede: "#c8ccd1", penaParede: 0.18, tolPrumo: 0.01, minVert: 0.15, abaixoPiso: 0.05, minIntervalo: 0.05, afasta: 4.5, tique: 0.9, corCota: "#3d434a", penaCota: 0.2, texto: 2.2 },
    pecaOp: 0.8,    /* 16/11/2026: UMA constante — opacidade do CORPO de conexão/registro/válvula na foto (0,75–0,85; contorno sempre sólido, tubo visível por baixo); a arquitetura segue translúcida */
    pisoOp: 0.08,   /* 15/11/2026: o piso da foto (planta e isométrico) quase branco e translúcido: nunca por cima da peça */
    fotoPlanta: { abaixo: 0.8, acima: 0.15, teto: 2.6, pxMm: 12 },
    simbCx: { dist: 1.7, meio: 0.9, luva: 0.6, pena: 0.25, tolNo: 0.35, arco: 1.5, alturaArco: 1.8, sigla: "CT" },
    /* ELEVAÇÃO HID (15/11/2026, referência do Rogério "ELEVAÇÃO HID - WC 1:20"): título com o número no círculo e a escala embaixo; cadeias de cota em cm dos dois lados */
    elev: { titulo: "ELEVAÇÃO HID", cotaV: 9, margemV: 3, folgaH: 5, folgaTit: 1.5, minTrecho: 4, alturaTit: 9.5 },
    esquema: { margem: 8, folgaChamada: 30, pena: 0.35, minRotulo: 9, no: 0.55, chamada: 16, d0: 2.2, penaChamada: 0.32, hachPasso: 1.1, alturaMin: 0.6, folgaTopo: 0.6 },
    /* LEGENDA - PONTOS HIDRÁULICOS (15/11/2026, folha de referência do Rogério): tabela PEÇA DE UTILIZAÇÃO x ABREVIATURA na coluna da legenda, só com as peças do modelo.
       linha = altura mínima da linha em múltiplos da letra; folga = respiro vertical; colSigla = largura da coluna da sigla (mm); as siglas são as MESMAS dos rótulos da folha */
    legTab: { titulo: "LEGENDA - PONTOS HIDRÁULICOS", cab: ["PEÇA DE UTILIZAÇÃO", "ABREVIATURA"], linha: 1.9, folga: 1.2, colSigla: 24, corCab: "#d3d8de", corZebra: "#f1f3f5",
      pecas: [["BS", "BACIA SANITÁRIA"], ["BCA", "BACIA SANITÁRIA COM CAIXA ACOPLADA"], ["LV", "LAVATÓRIO"], ["MLR", "MÁQUINA DE LAVAR ROUPAS"], ["MLL", "MÁQUINA DE LAVAR LOUÇAS"],
        ["CH", "CHUVEIRO"], ["DC", "DUCHA HIGIÊNICA"], ["PIA", "PIA"], ["TANQUE", "TANQUE"], ["MIC", "MICTÓRIO"], ["BI", "BIDÊ"], ["BH", "BANHEIRA DE HIDROMASSAGEM"], ["BEB", "BEBEDOURO"], ["TL", "TORNEIRA DE LIMPEZA"], ["TJ", "TORNEIRA DE JARDIM"],
        ["VD", "VÁLVULA DE DESCARGA"], ["RP", "REGISTRO DE PRESSÃO"], ["RG", "REGISTRO DE GAVETA"], ["RE", "REGISTRO DE ESFERA"], ["VR", "VÁLVULA DE RETENÇÃO"],
        ["CS", "CAIXA SIFONADA"], ["RS", "RALO SIFONADO"], ["RSE", "RALO SECO"], ["RL", "RALO LINEAR"]],
      acess: { registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" } },
    quadro: { linha: 12, icone: 10.5, grupo: 8, col: [11, 16, 0, 22, 12, 20], gap: 12, cab: 8, corCab: "#263445", corGrupo: "#e3e9f0", corZebra: "#f1f4f7", letra: 2.6, letraMin: 2.5, pad: 3, descMax: 160, itemMin: 9, pecaFolga: 3.5 },
    /* 21/11/2026 (pranchas compactas, o Rogério: "só o que precisa"): obra pequena = até pavMax pavimento(s) com ambiente e ambMax ambientes molhados (sem a prancha única de isométricos);
       foraAmbMinM = o isométrico "fora dos ambientes" só sai com pelo menos esse tubo (m); esqLargMin/esqFolga/detLarg/gapMin/gapMax = a folha que junta esquema vertical, quadro e detalhes (mm de papel). Critério de apresentação RA, não é norma */
    compacta: { pavMax: 1, ambMax: 2, foraAmbMinM: 3, esqLargMin: 110, esqFolga: 36, esqAltMin: 120, esqKvMin: 20, detLarg: 125, gapMin: 10, gapMax: 40 },
    detalhe: { linhas: 2, colunas: 3 }, barMax: 4, chamadaPlanta: 1.8,
    /* rodada 2: louça real (vinco em graus, quantização de vértice, lados do círculo), vistas agrupadas na folha (mm de papel) */
    vinco: 40, quant: 10000, ladosCirc: 16, folgaVista: 4, folgaRotulos: 20, entreVistas: 10, corteFracW: 0.62, corteFracH: 0.55, folgaRotulo: 0.9,
    folgaAmb: 0.12, recuoFrente: 0.01, ambFolga: 1.0, ambTol: 0.06, aciCinza: 8, letraDxf: 0.7,
    limpeza: { tuboMinM: 0.5, plantaTuboMinM: 1.0, tolLadoParede: 0.02 },
    /* ETAPA 2 (17/11/2026): câmera automática, mosaico, auditor de folha como GATE. ocupMin = fração do papel (área útil) abaixo da qual a folha é "quase vazia" e vira mosaico;
       ocultoMax = fração do tubo do isométrico que pode ficar oculto (recorte da frente, outro tubo na frente, louça na frente); critério de apresentação RA, não é norma */
    auto: { ocupMin: 0.25, ocupJunta: 0.6, ocupVazia: 0.05, mosaicoMax: 6, ocultoMax: 0.30, passo: 0.1, maxAmostras: 40, noRaio: 0.15, pesoLouca: 0.5, empate: 0.005, ordem: ["SE", "SO", "NE", "NO"], recorteCasaMax: 0.65, gap: 8, tituloCel: 7, kCelulaMin: 14, kParMin: 9, quadroLinhaMin: 9 },   /* 17/11/2026: folha só sai com conteúdo (m de tubo); o corte da parede é POR LADO */
    naoLiberado: { erroCalc: "NÃO LIBERADO - ERRO DE CÁLCULO PENDENTE - NÃO USAR EM OBRA", semLigacao: "NÃO LIBERADO - ", altura: 4.2, subida: 2.2 },
    /* perspectiva isométrica por ambiente: folgas (m), faixa da legenda, margens e limites (mm de papel) */
    perspFundo: 0.3, perspTopo: 0.25, perspOd: 1.3, perspFrente: 0.001, perspPeca: 0.06, perspLegenda: 30, perspMargem: 6, perspKMax: 90,
    perspGrade: 5, fov3d: 50, minContorno: 3, iso3d: [0.55, 0.5, 0.55], perspAlfa: 0.35, perspAlfaLouca: 0.7, perspAltura: 2.8, perspAlturaMax: 3.2, perspMin: 0.3, perspVertMin: 0.4, perspD0: 1.2, perspNivel: 1.4,
    /* CONJUNTO "ISOMÉTRICOS (PRANCHA ÚNICA)" (15/11/2026, referência do Rogério: prancha com vários isométricos numerados e título embaixo com linha):
       grade colunas x linhas de células (mm de papel); o ISO - GERAL ocupa geral x geral células (canto superior esquerdo); faixa = altura do título embaixo da vista;
       alcance = raio (m) em volta da caixa d'água onde os tubos entram na vista; caixaMeia = meia-largura (m) da caixa quando a família não traz o diâmetro */
    isos: { formato: "A0", formatos: ["A0", "A1"], colunas: 4, linhas: 4, geral: 2, gap: 8, faixa: 14, circulo: 4.6, margem: 3, kMax: 140, alcance: 1.5, caixaMeia: 1.0, fracTitulo: 0.92, penaTitulo: 0.16 }, reserv: { escalas: [25, 50, 100], barAlcance: 3.0, folga: 0.3, margemParede: 0.2, quebraPos: 0.25, alcance: 2.5, epsRaio: 1e-9, tolPav: 0.05, tolTubo: 0.3, folgaFoto: 0.15, altFoto: 1.0, pad: 14, minPoli: 3, cotaOff: 8, fracTit: 0.76, fracEsc: 1.3, folgaTit: 2.6, padraoEsq: [1.0, 1.0], escalaMax: 100, barMargem: 0.5, tolConector: 0.15, colPasso: 16, colPassoMin: 9, colDesce: 9, barDesce: 5, boiaRaio: 1.4, ladoBoia: 5, regRaio: 1.6, limiteRotulo: 18,
      apoioMax: 30, laje: 3, alaje: 6, parede: 1.6, tampa: 1.6, topoFolga: 3, nivel: 0.75, beiral: 1, respiro: 2, stub: 6, colet: 4, entreTxt: 3, cotaTxt: 6, cotaFolga: 8, extIni: 1, extFim: 1.5, extFolgaTxt: 1.2, quebra: 1.2, alimFrac: 0.1, consFrac: 0.12, extrFrac: 0.2, limpFrac: 0.12, entre: 12,
      rotSemLig: "SEM LIGAÇÃO", rotInter: "INTERLIGAÇÃO COM ", rotInterJunta: " E ", interDesce: 1.6, rotAlim: "AF-ALIMENTAÇÃO", rotCons: "AF-CONSUMO", rotExtr: "EXTRAVASOR E LIMPEZA", rotApoiada: "BASE APOIADA NA LAJE", rotDesce: "DESCEM ATÉ A SAÍDA LIVRE", parte: { alim: "alimentacao", cons: "saida", extr: "extravasor", limp: "limpeza" },
      reAlim: /^entrada|alimenta/i, reCons: /^sa[ií]da|consumo/i, reExtr: /extrav/i, reLimp: /limp/i }
  };
  /* FOLHA DA PISCINA (17/11/2026): perspectiva isométrica própria, separada da água fria. Cores PRÓPRIAS dos sistemas da piscina (nenhuma é a de AF, ES ou VE:
     o test-hid-pranchas-piscina confere a distância entre elas); siglas e nomes curtos das famílias hid-pisc-*; geometria de desenho (mm de papel, m do modelo). */
  var PSC = {
    sis: ["pisc_succao", "pisc_retorno", "pisc_hidro", "pisc_aquec", "pisc_dreno", "pisc_reposicao"],
    cor: { pisc_succao: "#C2185B", pisc_retorno: "#E65100", pisc_hidro: "#455A64", pisc_aquec: "#F06292", pisc_dreno: "#827717", pisc_reposicao: "#00695C" },
    sigla: { pisc_succao: "SUC", pisc_retorno: "RET", pisc_hidro: "HM", pisc_aquec: "AQP", pisc_dreno: "DRN", pisc_reposicao: "REP" },
    nome: { pisc_succao: "Sucção (ralo de fundo, coadeira, aspiração)", pisc_retorno: "Recalque e retorno (bomba, filtro, retornos)", pisc_hidro: "Hidromassagem", pisc_aquec: "Aquecimento", pisc_dreno: "Descarte e drenagem", pisc_reposicao: "Reposição de água" },
    camada: { pisc_succao: "HID-PSC-SUC-TUBO", pisc_retorno: "HID-PSC-RET-TUBO", pisc_hidro: "HID-PSC-HM-TUBO", pisc_aquec: "HID-PSC-AQP-TUBO", pisc_dreno: "HID-PSC-DRN-TUBO", pisc_reposicao: "HID-PSC-REP-TUBO" },
    fam: { "hid-pisc-filtro": ["FT", "Filtro"], "hid-pisc-bomba": ["MB", "Motobomba"], "hid-pisc-bomba-hidro": ["MH", "Motobomba da hidromassagem"], "hid-pisc-bomba-aquec": ["MQ", "Motobomba do aquecimento"],
      "hid-pisc-casa-maquinas": ["CM", "Casa de máquinas"], "hid-pisc-skimmer": ["CO", "Coadeira (skimmer)"], "hid-pisc-ralo": ["RF", "Ralo de fundo"], "hid-pisc-registro": ["RE", "Registro de esfera"],
      "hid-pisc-derivacao": ["DV", "Derivação do aquecimento"], "hid-pisc-caixa-descarte": ["CD", "Caixa do descarte"], "hid-pisc-caixa-descarte-esgoto": ["CD", "Caixa do descarte"], "hid-pisc-poco-drenagem": ["PD", "Poço de drenagem"],
      "hid-pisc-reposicao": ["BR", "Bica de reposição"], "hid-pisc-retorno": ["RT", "Retorno"], "hid-pisc-aspiracao": ["AS", "Aspiração"], "hid-pisc-succao-hidro": ["SH", "Sucção da hidro"], "hid-pisc-hidro": ["HI", "Bocal de hidromassagem"],
      "hid-pisc-refletor": ["IL", "Refletor"], "hid-pisc-quadro": ["QC", "Quadro de comando"], "hid-pisc-bomba-calor": ["BC", "Bomba de calor"], "hid-pisc-coletor": ["CS", "Coletor solar"], "hid-pisc-emergencia": ["BE", "Botão de emergência"], "hid-pisc-acionador": ["AC", "Acionador pneumático"] },
    ang: 30, minRot: 0.4, margem: 24, margemX: 34, kMax: 120, linhaLeg: 5, folgaLeg: 8, vistaDir: [0.5774, 0.5774, 0.5774], tolNo: 0.02, tolParalelo: 0.02, rConexao: 0.5, caixaConexao: 0.7, alfaAgua: 0.3, corAgua: "#039BE5", corFundo: "#5f6b73",
    extraMin: 1, extraDist: 3, margemCasa: 0.3, densoFam: 5, densoTubo: 10, painelW: 0.30, painelH: 0.50, painelMg: 10, kMaxDet: 160, agrupaMm: 14
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
  /* pressão disponível no ponto de utilização, em mca (2 casas, vírgula): "Pm 3,25 mca / Pju 3,24 mca". Só com número do RESULTADO do dimensionamento. */
  function textoPressao(ix, famInst) {
    var o = ix && ix.pontoAF && ix.pontoAF[famInst], H = dep("HidHidraulica", "./hidhidraulica.js");
    if (!o || o.pj_kpa == null || !H || !H.kpaParaM) return null;
    var pj = H.kpaParaM(o.pj_kpa), pm = o.pm_kpa == null ? null : H.kpaParaM(o.pm_kpa);
    return (pm == null ? "" : "Pm " + br(pm, K2.calc.casas) + " mca / ") + "Pju " + br(pj, K2.calc.casas) + " mca";
  }
  function PAD() { var p = dep("BimInstPadrao", "./biminstpadrao.js"); return p && p.pronto && p.pronto() ? p : null; }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function EDT() { return dep("HidPranchasEdit", "./hidpranchasedit.js"); }   /* ETAPA 3: o ajuste manual por vista (câmera, crop, o que se esconde, viewport, rótulos) */
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
    PSC.sis.forEach(function (s) { cam(PSC.camada[s], P.AF, PSC.cor[s]); });   /* piscina: tubo na cor PRÓPRIA do sistema (nada de AF/ES/VE) */
    cam("HID-PSC-NA", P.cota, PSC.corAgua, "3 1.5"); cam("HID-PSC-FUNDO", P.contexto, PSC.corFundo, "1.5 1.5"); cam("HID-PSC-DET", P.cota, "#000", "4 1.5");
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
      /* SETA NA PONTA DA CHAMADA DO BALÃO (14/11/2026 — o Rogério, folha 08: "deixa uma setinha apontando certinho para onde é cada
         coisa, do jeito que ficou ainda pode dar confusão"). (x1,y1) é a âncora = a peça; a seta cheia encosta nela. */
      if (l.tipo === "chamada" && l.rot === "codigo") {
        var dxs = l.x2 - l.x1, dys = l.y2 - l.y1, Ls = Math.hypot(dxs, dys);
        if (Ls > K2.seta.c * 1.5) { var ux = dxs / Ls, uy = dys / Ls, ax = l.x1 + ox, ay = l.y1 + oy, bx = ax + ux * K2.seta.c, by = ay + uy * K2.seta.c;
          D.cheio([[ax, ay], [bx - uy * K2.seta.l, by + ux * K2.seta.l], [bx + uy * K2.seta.l, by - ux * K2.seta.l]], "#000"); }
      }
    });
    var segTubo = arr(prim.linhas).filter(function (l) { return l.tipo === "tubo" && !l.oculto; }).map(function (l) { return [l.x1 + ox, l.y1 + oy, l.x2 + ox, l.y2 + oy]; });
    arr(prim.simbolos).forEach(function (s) {
      var x = s.x + ox, y = s.y + oy;
      if (chk && s.tipo !== "obst" && s.tipo !== "seta" && s.r > 0) (chk.pecas = chk.pecas || []).push([x - s.r, y - s.r, x + s.r, y + s.r]);   /* a PEÇA como obstáculo fixo do posicionador */
      if (s.desenhado && (s.tipo === "caixa" || s.tipo === "prumada")) return;
      if (s.tipo === "transposicao") { var pnT = segTubo.length ? pernasNo(segTubo, x, y, K2.simbCx.tolNo) : []; simbCx(D, "curva_transposicao", x, y, pnT.length ? pnT : [[1, 0]]); return; }
      if ((s.tipo === "joelho" || s.tipo === "te") && segTubo.length) { var pn = pernasNo(segTubo, x, y, K2.simbCx.tolNo); if (pn.length >= 2) { simbCx(D, s.tipo === "te" ? (pn.length >= 4 ? "cruzeta" : "te") : "joelho", x, y, pn); return; } }
      if (s.tipo === "joelho" || s.tipo === "ponto" || s.tipo === "balao" || s.tipo === "prumada") D.circ(x, y, s.r, "HID-SIMBOLO");
      else if (s.tipo === "te") D.ponto(x, y, s.r, "#000");
      else if (s.tipo === "caixa") D.ret(x - s.r, y - s.r, 2 * s.r, 2 * s.r, "HID-SIMBOLO");
      else if (s.tipo === "registro" && s.ac) { var pr = segTubo.length ? pernasNo(segTubo, x, y, s.r * 1.5) : []; simbReg(D, s.ac, x, y, s.r, pr[0] || [1, 0]); }
      else if (s.tipo === "seta" && s.pts) D.cheio(s.pts.map(function (p) { return [p[0] + ox, p[1] + oy]; }), "#000");
    });
    arr(prim.textos).forEach(function (t) { D.texto(t.x + ox, t.y + oy, t.s, t.h, { al: t.al || "C", evitar: true, attr: ' data-rotulo="' + esc(t.tipo) + '"' + (t.tipo === "destaque" ? ' font-style="italic"' : "") }); });   /* R02: a CHAMADA da peça especial em itálico, como na referência */
  }

  /* SÍMBOLO DE CONEXÃO EM LINHA ÚNICA (14/11/2026 — o Rogério: "o joelho você colocou uma bolinha; tem que ser a legenda de
     conexões do jeito que é o correto"). Convenção usual dos projetos de instalação: o TRAÇO DE BOLSA atravessando cada perna junto
     ao nó — joelho/curva com um traço em cada perna (a curva com o arco), tê e junção com um traço em cada uma das 3 pernas,
     cruzeta nas 4, luva com dois traços, redução com o triângulo, cap com a ponta cheia. pernas = direções unitárias no papel
     (do nó para fora). A legenda desenha o MESMO símbolo (simboloLeg "cx:*"). */
  function simbCx(D, tipo, x, y, pernas, cor) {
    var KS = K2.simbCx, cam = "HID-SIMBOLO";
    function traco(d, dist, meio) { var px = x + d[0] * dist, py = y + d[1] * dist, nx = -d[1] * (meio || KS.meio), ny = d[0] * (meio || KS.meio); D.add('<line x1="' + n(px - nx) + '" y1="' + n(py - ny) + '" x2="' + n(px + nx) + '" y2="' + n(py + ny) + '" stroke="' + (cor || "#000") + '" stroke-width="' + n(KS.pena) + '" data-cam="' + cam + '"/>'); }
    tipo = txt(tipo);
    if (/^curva_transposicao/.test(tipo)) {   /* arco SOBRE o tubo (o cruzado passa por baixo), com um traço de bolsa em cada ponta */
      var dt = pernas[0] || [1, 0], nxT = -dt[1], nyT = dt[0]; if (nyT > 0) { nxT = -nxT; nyT = -nyT; }
      var aT = KS.arco, hT = KS.alturaArco;
      traco(dt, aT); traco([-dt[0], -dt[1]], aT);
      D.add('<path d="M' + n(x - dt[0] * aT) + " " + n(y - dt[1] * aT) + " Q" + n(x + nxT * hT * 2) + " " + n(y + nyT * hT * 2) + " " + n(x + dt[0] * aT) + " " + n(y + dt[1] * aT) + '" fill="none" stroke="' + (cor || "#000") + '" stroke-width="' + n(KS.pena) + '" data-cam="' + cam + '"/>');
      return;
    }
    if (/^luva|uniao|luva_correr/.test(tipo)) { var d0 = pernas[0] || [1, 0]; traco(d0, KS.luva); traco([-d0[0], -d0[1]], KS.luva); return; }
    if (/^reducao|^bucha/.test(tipo)) { var dr = pernas[0] || [1, 0], m = KS.meio; D.add('<polygon points="' + n(x + dr[0] * m * 1.4) + "," + n(y + dr[1] * m * 1.4) + " " + n(x - dr[1] * m) + "," + n(y + dr[0] * m) + " " + n(x + dr[1] * m) + "," + n(y - dr[0] * m) + '" fill="none" stroke="' + (cor || "#000") + '" stroke-width="' + n(KS.pena) + '" data-cam="' + cam + '"/>'); return; }
    if (/^cap|tampao|plug/.test(tipo)) { var dc = pernas[0] || [1, 0], mc = KS.meio; D.add('<polygon points="' + n(x - dc[0] * mc * 1.2) + "," + n(y - dc[1] * mc * 1.2) + " " + n(x - dc[1] * mc) + "," + n(y + dc[0] * mc) + " " + n(x + dc[1] * mc) + "," + n(y - dc[0] * mc) + '" fill="' + (cor || "#000") + '" stroke="none" data-cam="' + cam + '"/>'); return; }
    pernas.forEach(function (d) { traco(d, KS.dist); });
    if (/^curva/.test(tipo) && pernas.length >= 2) {
      var a1 = pernas[0], a2 = pernas[1], r = KS.dist * 0.75;
      D.add('<path d="M' + n(x + a1[0] * r) + " " + n(y + a1[1] * r) + " Q" + n(x) + " " + n(y) + " " + n(x + a2[0] * r) + " " + n(y + a2[1] * r) + '" fill="none" stroke="' + (cor || "#000") + '" stroke-width="' + n(KS.pena) + '" data-cam="' + cam + '"/>');
    }
  }
  /* REGISTRO EM LINHA ÚNICA, o MESMO da legenda: duas cunhas opostas no eixo do tubo (d) + haste; gaveta com a travessa, pressão com o volante */
  function simbReg(D, ac, x, y, r, d) {
    var nx = -d[1], ny = d[0]; if (ny > 0) { nx = -nx; ny = -ny; }   /* haste para CIMA no papel */
    D.poli([[x - d[0] * r + nx * r, y - d[1] * r + ny * r], [x + d[0] * r - nx * r, y + d[1] * r - ny * r], [x + d[0] * r + nx * r, y + d[1] * r + ny * r], [x - d[0] * r - nx * r, y - d[1] * r - ny * r]], "HID-SIMBOLO", true);
    var hx = x + nx * r * 1.8, hy = y + ny * r * 1.8; D.linha(x, y, hx, hy, "HID-SIMBOLO");
    if (/pressao/.test(String(ac))) D.circ(x + nx * r * 2.3, y + ny * r * 2.3, r * 0.5, "HID-SIMBOLO");
    else D.linha(hx - d[0] * r * 0.7, hy - d[1] * r * 0.7, hx + d[0] * r * 0.7, hy + d[1] * r * 0.7, "HID-SIMBOLO");
  }
  /* as pernas de um nó no papel: as linhas de tubo que encostam nele */
  function pernasNo(segs, x, y, tol) {
    var out = [];
    segs.forEach(function (sg) {
      [[sg[0], sg[1], sg[2], sg[3]], [sg[2], sg[3], sg[0], sg[1]]].forEach(function (q) {
        if (Math.abs(q[0] - x) <= tol && Math.abs(q[1] - y) <= tol) { var dx = q[2] - q[0], dy = q[3] - q[1], L = Math.hypot(dx, dy); if (L > 1e-6 && !out.some(function (o) { return o[0] * dx / L + o[1] * dy / L > 0.995; })) out.push([dx / L, dy / L]); }
      });
    });
    return out;
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
        if (Ld >= 2 * KI.arrComp && H.setaPermitida(t, S, a[0] + dx * KI.arrPos, a[1] + dy * KI.arrPos)) {   /* 15/11/2026: uma seta por trecho de >= 0,5 m e a >= 25 mm de outra */
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
    var cc = vistaCtx(c, trs, pv, sis), ex = extensaoPlanta(c, trs, pv), s2 = 1000 / esc, medio = true;   /* 14/11/2026: a planta sai SEMPRE com o desenho do modelo (o "baixo" de linha única salvo em projeto antigo não vale mais — o Rogério: "é para sair do mesmo jeito" do sistema) */
    var fm = medio ? formasDe(cc, trs) : null;
    var pr = plantaPrim(c.rede, c.ix, sis, trs, c.pavs, s2, { medio: medio, nome: c.nomeAp, colunas: c.colunas, obstaculos: obstaculosFormas(fm, s2).concat(ex.ctx.arq ? fundoArquitetura(ex.ctx.c, ex.ctx.arq, s2, 0, 0, bordasTubo(fm, s2, 0, 0)).caixas : []), segExtra: bordasTubo(fm, s2, 0, 0), deTubo: deTubo });
    arr(pr.avisos).forEach(function (m) { c.avisos.push(m); });
    var bb = bbox(pr), xs = ex.xs, zs = ex.zs;
    bb = { x0: Math.min(bb.x0, Math.min.apply(null, xs) * s2), y0: Math.min(bb.y0, Math.min.apply(null, zs) * s2), x1: Math.max(bb.x1, Math.max.apply(null, xs) * s2), y1: Math.max(bb.y1, Math.max.apply(null, zs) * s2) };
    var tit = titulo, sub = "ESC 1:" + esc + (medio ? " - nível de detalhe ALTO" : "");
    return { tipo: "planta", titulo: tit, escala: esc, w: Math.max(bb.x1 - bb.x0, c.AP.largTexto ? c.AP.largTexto(tit, D0().E.T.titulo) : 0) + K2.folgaVista * 2, h: bb.y1 - bb.y0 + K2.titulo + K2.folgaVista,
      desenhar: function (D, x, y, chk) {
        /* o NOME da planta vai EMBAIXO do desenho, com a escala (14/11/2026 — o Rogério: "o nome da planta fica embaixo, com a escala, certinho") */
        var ox = x + K2.folgaVista - bb.x0, oy = y + K2.folgaVista - bb.y0;
        c.AP.tituloVista(D, x + K2.folgaVista, y + (bb.y1 - bb.y0) + K2.folgaVista * 1.5, tit, sub);
        /* ⚠ PLANTA = A VISTA DE CIMA DO PRÓPRIO MODELO (14/11/2026 — o Rogério marcou em vermelho os joelhos e luvas em "caixa cinza"
           da planta: "nunca mais eu quero falar sobre essa modelagem que não fica com as peças de acordo com o sistema; não quero isso
           nunca mais"). Com o 3D aberto, a foto ortográfica de cima (tubo, conexão e louça como modelados; o sistema da folha em cor, o
           outro em meio-tom) fica por BAIXO e o vetor só anota (parede hachurada, porta, rótulo, cota, seta). Sem o 3D (Node/teste), o
           desenho vetorial de antes. */
        var rp = fotoPlanta(c, sis, trs, pv, bb, s2);
        if (rp) D.add('<image data-im="' + rp.key + '" x="' + n(ox + bb.x0) + '" y="' + n(oy + bb.y0) + '" width="' + n(bb.x1 - bb.x0) + '" height="' + n(bb.y1 - bb.y0) + '" preserveAspectRatio="none" href="' + rp.href + '"/>');
        var ctxD = ex.ctx; if (rp) { ctxD = {}; for (var kc in ex.ctx) if (Object.prototype.hasOwnProperty.call(ex.ctx, kc)) ctxD[kc] = ex.ctx[kc]; ctxD.loucas = []; ctxD.soContorno = true; }
        desenharContexto(D, ctxD, s2, ox, oy, medio ? bordasTubo(fm, s2, ox, oy) : []);
        if (sis === "gas") rotulosGas(D, c, pv, s2, ox, oy, chk);
        if (medio) { if (!rp) formasPlanta(D, cc, trs, s2, ox, oy, fm); bordasTubo(fm, s2, ox, oy).forEach(function (q) { chk.tubos.push(q); }); }
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
  /* DWG POR VIEWPORTS (15/11/2026): cada VISTA da folha (planta, corte, isométrico, detalhe, esquema, reservatório, tabela) vai num grupo
     data-bloco="<tipo>-NN" data-escala="1:50" (ou "sem" = sem escala: fica no layout, em mm de papel) — o MESMO contrato de js/arqdiagrama.js; o
     exportador CAD (js/arqcad.js) monta uma viewport travada por bloco com escala. escala = "1:50" | número (50) | função(resultado) → uma dessas. */
  function escalaBloco(e) { var m = /^1\s*:\s*(\d+)$/.exec(txt(e)); if (!m && typeof e === "number" && isFinite(e) && e > 0) return "1:" + e; return m ? "1:" + m[1] : "sem"; }
  /* ETAPA 3: cada bloco leva data-chave = a chave ESTÁVEL da vista (ambiente × grupo × pavimento, ou o título da folha + a ordem do bloco): é por ela que o ajuste manual
     (js/hidpranchasedit.js) acha a vista de novo depois de regerar, mesmo que a numeração das folhas tenha mudado */
  function blocoAbre(D, tipo, esc0, r, chave) {
    D._nBloco = (D._nBloco || 0) + 1;
    var X = EDT(), ch = txt(chave) || (X ? X.chaveBloco(tipo, DEF_ATUAL ? DEF_ATUAL.titulo : "", D._nBloco) : "");
    return '<g data-bloco="' + txt(tipo).toLowerCase() + "-" + dois(D._nBloco) + '" data-x="' + n(r.x) + '" data-y="' + n(r.y) + '" data-w="' + n(r.w) + '" data-h="' + n(r.h) + '" data-escala="' + escalaBloco(esc0) + '"' + (ch ? ' data-chave="' + esc(ch) + '"' : "") + ">";
  }
  function blocoVista(D, tipo, esc0, r, fn, chave) {
    var i0 = D.s.length, res; D.s.push("");
    try { res = fn(); } finally { D.s.push("</g>"); D.s[i0] = blocoAbre(D, tipo, typeof esc0 === "function" ? esc0(res) : esc0, r, chave); }
    return res;
  }
  function D0() { if (!_D0) _D0 = new (AP().Desenho)(estilo(), null); return _D0; }
  /* o DE do tubo (mm) pelo catálogo de geometria: a folga do rótulo começa na BORDA do tubo cheio, não no eixo */
  function deTubo(t) { var G = GEO(), k = null; try { k = G ? G.cotasTubo(t.material, t.dn) : null; } catch (e) { k = null; } return k && k.de > 0 ? k.de : +t.dn || 0; }
  /* AS CADEIAS DE COTA DA ELEVAÇÃO (em cm): horizontal embaixo do piso (entre os pontos ao longo da parede) e vertical do piso acabado até cada altura de ponto, à ESQUERDA
     (pontos da metade esquerda) e à DIREITA (pontos da metade direita). s = mm de papel por metro; usada pela folha de cortes e pelo caderno (vista cotada do ambiente). */
  function cadeiasElevacao(D, d, ph, s, ox, oy, chk, o) {
    o = o || {}; var E0 = K2.elev, nSg = D.sg.length, cm = function (a0, b0) { return String(Math.round((a0 - b0) / s * 100)); };   // hid:ok m → cm (cota de comprimento)
    var cxs = d.cotaXs.filter(function (xx, i, A) { return i === 0 || xx - A[i - 1] >= E0.minTrecho || i === A.length - 1; });
    if (cxs.length > 2) {
      var P = cxs.map(function (xx) { return [xx + ox, d.yFundo + oy + (o.folgaH != null ? o.folgaH : E0.folgaH)]; }), vals = [];
      for (var i = 0; i + 1 < cxs.length; i++) vals.push(cm(cxs[i + 1], cxs[i]));
      D.cadeia(P, 0, vals, { foraSeUnico: true });
    }
    if (!o.semCotaV) [[d.cotaYsE, -ph.cotaV], [d.cotaYsD, d.w + ph.cotaV]].forEach(function (lado) {
      var ys = arr(lado[0]).slice().sort(function (p0, q0) { return q0 - p0; });   /* papel: de baixo para cima */
      var ysF = [d.yPiso].concat(ys.filter(function (v, i2, A) { return Math.abs(v - (i2 === 0 ? d.yPiso : A[i2 - 1])) >= E0.minTrecho && Math.abs(v - d.yPiso) >= E0.minTrecho; }));
      if (ysF.length < 2) return;
      var PV = ysF.map(function (v) { return [lado[1] + ox, v + oy]; }), vv = [];
      for (var r = 0; r + 1 < ysF.length; r++) vv.push(cm(ysF[r], ysF[r + 1]));
      D.cadeia(PV, 0, vv, { foraSeUnico: true, desde: PV.map(function () { return false; }) });
    });
    for (var q = nSg; q < D.sg.length; q++) chk.cotas.push(D.sg[q]);
  }
  function prepCorte(c, ph, a) {
    var esc = null, j, pv = ph.pv;
    for (j = 0; j < K2.escalasCorte.length && !esc; j++) {
      var s0 = 1000 / K2.escalasCorte[j], ww = ph.w.L * s0 + K2.folgaCorte * 2 + 2 * (K2.elev.cotaV + K2.elev.margemV), hh = (Math.min(ph.w.y1, pv.topo) - pv.cota + K2.cortePiso) * s0 + K2.folgaCorte * 3 + K2.titulo;
      if (ww <= a.w * K2.corteFracW && hh <= a.h * K2.corteFracH) esc = K2.escalasCorte[j];
    }
    ph.escala = esc || K2.escalasCorte[K2.escalasCorte.length - 1];
    ph.cotaV = K2.elev.cotaV;
    var d = desenhoCorte(c, ph, 1000 / ph.escala), bb = bbox(d), KI = HI().K, mV = K2.elev.margemV + K2.elev.cotaV;
    var tit = K2.elev.titulo + " - " + txt(ph.nome).toUpperCase();
    return { tipo: "corte", titulo: tit, escala: ph.escala, w: Math.max(bb.x1 - bb.x0 + 2 * mV, c.AP.largTexto(tit, D0().E.T.titulo)) + K2.folgaVista * 2, h: Math.max(bb.y1, d.yFundo) - bb.y0 + K2.folgaCorte / 2 + K2.elev.folgaTit * 2 + K2.elev.alturaTit + K2.folgaVista * 2,
      desenhar: function (D, x, y, chk) {
        var ox = x + K2.folgaVista - bb.x0 + mV, oy = y + K2.folgaVista - bb.y0;
        /* o título vai EMBAIXO da elevação: o número da parede no círculo e a escala (padrão das outras vistas) */
        c.AP.tituloVista(D, x + K2.folgaVista, oy + d.yFundo + K2.folgaCorte / 2 + K2.elev.folgaTit * 2, tit, "ESC 1:" + ph.escala, ph.n);
        desenhar(D, d, ox, oy, chk);
        /* a cadeia de cotas não tem trecho de menos de 4 mm de papel (7 cm a 1:25): o número não cabe entre as chamadas e saía em cima de uma cota
           (rótulo × cota na parede hidráulica 15 do projeto exemplo, 25/10/2026) — o ponto que cai tão perto do anterior fica de fora da cadeia */
        cadeiasElevacao(D, d, ph, 1000 / ph.escala, ox, oy, chk, { folgaH: K2.folgaCorte / 2 });
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
    arr(c.vistas).forEach(function (it) { escs["1:" + it.escala] = 1; blocoVista(D, it.tipo === "corte" ? "corte" : "planta", "1:" + it.escala, { x: a.x + it.px, y: a.y + it.py, w: it.w, h: it.h }, function () { it.desenhar(D, a.x + it.px, a.y + it.py, c.chk); }); });
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
    posicionador(D);
    return D;
  }
  /* POSICIONADOR DE RÓTULOS (15/11/2026, auditoria do PDF real: "AF ø20" cortado por cota, "RG +1,92" em cima da peça): o texto marcado { evitar: true } só
     é escrito onde a caixa dele NÃO cobre outro texto nem traço/peça já desenhados (D.tb = caixas de texto, D.sg = traços e contornos de peça). Se a âncora
     colide, tenta 8 posições ao redor (E, NE, N, NO, O, SO, S, SE) em 2 anéis e liga o texto à âncora por uma linha de chamada; sem posição livre, fica na âncora. */
  var POS_DIR = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];
  function caixaTexto(x, y, s0, h, o) {
    var w = larg(s0, h), al = o.al || "E", x0 = al === "C" ? x - w / 2 : (al === "D" ? x - w : x), yb = o.meio ? y + 0.37 * h : y;
    return [x0, yb - 0.76 * h, x0 + w, yb + 0.18 * h];
  }
  function segCruzaCaixa(sg, b, g) {   /* Liang-Barsky: o segmento toca a caixa (com folga g)? */
    var x0 = sg[0], y0 = sg[1], dx = sg[2] - sg[0], dy = sg[3] - sg[1], t0 = 0, t1 = 1, P = [-dx, dx, -dy, dy], Q = [x0 - (b[0] - g), (b[2] + g) - x0, y0 - (b[1] - g), (b[3] + g) - y0], i;
    for (i = 0; i < 4; i++) { if (P[i] === 0) { if (Q[i] < 0) return false; } else { var t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } }
    return t0 <= t1;
  }
  function caixaLivre(D, b, g) {
    var i;
    for (i = 0; i < D.tb.length; i++) { var t = D.tb[i]; if (t[0] < b[2] + g && t[2] > b[0] - g && t[1] < b[3] + g && t[3] > b[1] - g) return false; }
    for (i = 0; i < D.sg.length; i++) if (segCruzaCaixa(D.sg[i], b, 0)) return false;   /* o traço só conta se CRUZA a caixa (encostar no próprio tubo é o normal) */
    return true;
  }
  var POS_ATIVO = true;   /* testes: false = o regime sem posicionador (controle negativo) */
  /* O posicionador roda UMA vez no FIM da folha (D.resolverRotulos, chamado em gerar() depois de cotas e rótulos criados): os traços (cotas, tubos, contornos de peça)
     e os textos sem 'evitar' são obstáculos FIXOS; só o rótulo marcado { evitar: true } se move, na ordem em que foi escrito. Cota que cruza o rótulo: o rótulo sai
     para a 1ª das 8 posições livres (2 anéis) com linha de chamada. D.texto só REGISTRA o rótulo; o texto é reescrito no lugar (mesmo índice do SVG). */
  function posicionador(D) {
    var base = D.texto; D._rot = [];
    D.texto = function (x, y, s0, h, o) {
      o = o || {};
      var w = base.call(this, x, y, s0, h, o);
      if (o.evitar && !o.rot && txt(s0) && this.tb.length) this._rot.push({ i: this.s.length - 1, t: this.tb.length - 1, c: (this.caixas && !o.semCaixa) ? this.caixas.length - 1 : -1, x: x, y: y, s: s0, h: h, o: o });
      return w;
    };
    D.resolverRotulos = function (chk) {
      var movidos = 0, self = this, g = 0.25, fixos = arr(chk && chk.tubos).concat(arr(chk && chk.cotas));   /* tubos e cotas da folha = obstáculos fixos (os mesmos da conferência) */
      var pecas = arr(chk && chk.pecas);
      function livreFixos(b) {
        var i; for (i = 0; i < self.tb.length; i++) { var t = self.tb[i]; if (t[0] < b[2] + g && t[2] > b[0] - g && t[1] < b[3] + g && t[3] > b[1] - g) return false; }
        if (fixos.some(function (sg) { return segCruzaCaixa(sg, b, 0.15); })) return false;
        return !pecas.some(function (q) { return q[0] < b[2] && q[2] > b[0] && q[1] < b[3] && q[3] > b[1]; });
      }
      if (!POS_ATIVO) { this._rot = []; return 0; }
      this._rot.forEach(function (rc) {
        var b0 = self.tb[rc.t], salvo = b0.slice();
        self.tb[rc.t] = [1e9, 1e9, 1e9, 1e9];   /* a própria caixa não conta */
        var livre = livreFixos(b0), pos = null, k, d;
        if (!livre) for (k = 1; k <= 2 && !pos; k++) for (d = 0; d < POS_DIR.length && !pos; d++) {
          var dx = POS_DIR[d][0] * rc.h * 1.3 * k, dy = POS_DIR[d][1] * rc.h * 1.3 * k, b = [b0[0] + dx, b0[1] + dy, b0[2] + dx, b0[3] + dy];
          if (livreFixos(b)) pos = { x: rc.x + dx, y: rc.y + dy, b: b };
        }
        if (!pos) { self.tb[rc.t] = salvo; return; }
        base.call(self, pos.x, pos.y, rc.s, rc.h, rc.o);   /* escreve no fim; troca pelo lugar antigo */
        var ns = self.s.pop(), nt = self.tb.pop(), nc = rc.c >= 0 && self.caixas ? self.caixas.pop() : null;
        self.s[rc.i] = ns; self.tb[rc.t] = nt; if (nc && rc.c >= 0) self.caixas[rc.c] = nc;
        var cx = Math.max(pos.b[0], Math.min(rc.x, pos.b[2])), cy = Math.max(pos.b[1], Math.min(rc.y, pos.b[3]));
        self.linha(rc.x, rc.y, cx, cy, "HID-COTA");
        movidos++;
      });
      this._rot = []; this._movidos = (this._movidos || 0) + movidos;
      return movidos;
    };
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
  function fundoArquitetura(c, L, s, ox, oy, segs, Mx) {
    var d = ARQD(), E = estiloArqCinza(), D2 = d.novo(E, true), M = Mx || d.mapa([0, 0, 1, 1], ox, oy, s), porId = {};
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
    /* ⚠ COM A FOTO DO MODELO POR BAIXO, a parede é só o CONTORNO (14/11/2026 — o Rogério: "a parede está escondendo as tubulações; tem que ser meio
       transparente e mostrar a cor forte da disciplina; onde tem parede o tubo tem que aparecer, está ficando cortado"). O cheio cinza da parede
       vetorial cobria o tubo que corre dentro dela; na foto a parede já sai translúcida (vista Instalações). */
    if (ctx.soContorno) {
      var Pc = function (q) { return [q[0] * s + ox, q[1] * s + oy]; };
      arr(ctx.arq ? ctx.arq.paredes : ctx.paredes).forEach(function (w) { if (w && w.pts) D.poli(w.pts.map(Pc), "HID-CONTEXTO", true); });
      return;
    }
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
    /* ⚠ 13/11/2026 — o TUBO VAZADO: js/biminstnivel.js formas devolve, além do "tubo", duas faixas de brilho ("tuboM" 62% e
       "tuboN" 28% da largura, semContorno) que dão o volume da peça real na tela. Aqui elas caíam no "senão" e saíam BRANCAS
       com contorno preto: o tubo de esgoto virava duas linhas verdes com um corredor branco riscado (print do Rogério:
       "esse tracejado feio"). Agora a prancha pinta igual à tela: faixa na cor do sistema clareada (NV.brilho), sem
       contorno, por cima do tubo; e a conexão no cinza claro da tela (NV.COR_CONEXAO), não branco puro. */
    var NVc = NIV(), brilhoDe = function (sis, fx) { var c0 = corDe(sis); return NVc && NVc.brilho ? NVc.brilho(c0, fx) : c0; };
    var corPeca = (NVc && NVc.COR_CONEXAO) || "#ececec", FX = { tuboM: 1.3, tuboN: 1.55 };
    var ordem = { tubo: 0, tuboM: 0.4, tuboN: 0.5, peca: 1, forma: 1, caixa: 2, prumada: 3 };
    f.polys.slice().sort(function (a, b) { return (ordem[a.papel] != null ? ordem[a.papel] : 1) - (ordem[b.papel] != null ? ordem[b.papel] : 1); }).forEach(function (p) {
      if (FX[p.papel]) { poliCheio(D, p.pts.map(P), brilhoDe(p.sistema, FX[p.papel]), null, 0, "HID-" + (CAMADA_SIS[p.sistema] || "AF") + "-TUBO"); return; }
      var fill = p.papel === "tubo" ? corDe(p.sistema) : p.papel === "prumada" ? brilhoDe(p.sistema, 1.3) : (p.papel === "caixa" || p.papel === "grade" ? "#ffffff" : corPeca), pp = p.pts.map(P), sw = K2.contornoTubo;
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
      /* ⚠ 13/11/2026: "ALTO", o mesmo desenho da tela (bolsa, anel, faixas de volume do tubo) — o Rogério reprovou a prancha
         simplificada ("não são só as cores, é o padrão de qualidade das conexões, dos tubos, dos equipamentos"). O Baixo da
         configuração (nivelPlanta) continua saindo em linha única por outro caminho. */
      f = NV.formas(R, "alto", [0, -1, 0], { cotasCx: function (m, t, dn) { try { return G ? G.cotasConexao(m, t, dn) : null; } catch (e) { return null; } },
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
                          [/ducha-higienica/, "ducha_higienica"], [/chuveiro/, "chuveiro"], [/pia-cozinha/, "pia_cozinha"], [/tanque-lavar/, "tanque"], [/mictorio/, "mictorio"],
                          [/banheira|hidromassagem/, "banheira"], [/bide/, "bide"], [/lav[ae]r?-?lou[cç]a/, "maquina_lavar_louca"]];   /* 15/11/2026: banheira (BH), bidê (BI) e máquina de lavar louça (MLL) saíam sem sigla e o isométrico escrevia o id interno */
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
      if (/bebedouro/.test(fid)) return "BEB";
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
  /* ------------------------------------------------------------ LIMPEZA DAS PRANCHAS (17/11/2026, casa real de 84 folhas: "o encanador vai rir da nossa cara")
     Ambiente fantasma, folha com um toco de tubo, ambiente repetido. Regras (docs: entrada 2026-11-17-pranchas-hid): (1) o AMBIENTE pertence a UM pavimento — o dos seus
     aparelhos; o prumo que só ATRAVESSA outro nível (platibanda, laje, forro, caixote) não cria ambiente nem folha ali; (2) ambiente molhado real = tem louça, ralo ou ponto;
     (3) folha só sai com conteúdo (tubo >= K2.limpeza.tuboMinM ou peça/registro), senão é suprimida com aviso; (4) o mesmo cômodo desenhado duas vezes é um só. */
  function pavDoAmbiente(estado, am, pavs) {
    var ids = {}, ys = [], pv = null; arr(am && am.aparelhos).forEach(function (i) { ids[txt(i)] = 1; });
    arr(estado && estado.familias).forEach(function (f) { if (ids[txt(f.id)] && isFinite(+f.y)) ys.push(+f.y); });
    if (!ys.length) return null;
    ys.sort(function (a, b) { return a - b; });
    var y = ys[Math.floor(ys.length / 2)];
    /* o aparelho é do nível de piso mais alto que não passa da altura dele (o chuveiro a 2,2 m não é do nível de referência "Laje" a 2,8 m; a faixa de corte de 0,6 m abaixo do piso é para TUBO, não para louça) */
    arr(pavs).forEach(function (q) { if (y >= q.cota - HI().K.tolPiso_m) pv = q; });
    return pv || arr(pavs)[0] || null;
  }
  /* os pavimentos de verdade: o que tem AMBIENTE, ou REDE própria (>= K2.limpeza.plantaTuboMinM de tubo horizontal ou alguma peça, pelo piso em que o item está). A faixa de cada pavimento é
     refeita só com eles: o Térreo vai até o próximo pavimento de verdade, e o ramal do chuveiro a 2,2 m não vira planta do nível "Laje" a 2,8 m. Um nível só: devolve como veio. */
  function pavsEfetivos(estado, rede, ambientes, pavs) {
    if (arr(pavs).length < 2) return pavs;
    var tol = HI().K.tolPiso_m, dono = {}, comp = {};
    function chave(p) { return p.nome + "|" + p.cota; }
    function de(y) { var p = null; pavs.forEach(function (q) { if (y >= q.cota - tol) p = q; }); return p || pavs[0]; }
    arr(ambientes).forEach(function (am) { var p = pavDoAmbiente(estado, am, pavs); if (p) dono[chave(p)] = 1; });
    arr(rede && rede.trechos).forEach(function (t) { if (!t.p1 || !t.p2 || t.vertical) return; var k = chave(de((t.p1.y + t.p2.y) / 2)); comp[k] = (comp[k] || 0) + dist3d(t.p1, t.p2); });
    arr(rede && rede.pecas).forEach(function (q) { var k = chave(de(q.y)); comp[k] = (comp[k] || 0) + K2.limpeza.plantaTuboMinM; });
    var L = pavs.filter(function (p) { return dono[chave(p)] || comp[chave(p)] >= K2.limpeza.plantaTuboMinM; });
    if (!L.length || L.length === pavs.length) return pavs;
    return L.map(function (p, i) { return { nome: p.nome, cota: p.cota, topo: i + 1 < L.length ? L[i + 1].cota : Infinity, base: i ? p.cota - K2.cortePiso : -Infinity, sup: i + 1 < L.length ? L[i + 1].cota - K2.cortePiso : Infinity }; });
  }
  /* os pavimentos que têm AMBIENTE (aparelho em piso). Os demais níveis do modelo (platibanda, laje, forro, caixote, calha) são referência: não repartem a faixa do pavimento que tem louça
     — o Térreo vai até o próximo nível COM ambiente, e as vistas por ambiente (esquema, perspectiva, caderno, isométricos em prancha única) rodam só nele. Sem aparelho conhecido: todos. */
  function pavsDosAmbientes(estado, ambientes, pavs) {
    var dono = {}, L;
    arr(ambientes).forEach(function (am) { var p = pavDoAmbiente(estado, am, pavs); if (p) dono[p.nome + "|" + p.cota] = 1; });
    L = arr(pavs).filter(function (p) { return dono[p.nome + "|" + p.cota]; });
    if (!L.length) return pavs;
    return L.map(function (p, i) { return { nome: p.nome, cota: p.cota, topo: i + 1 < L.length ? L[i + 1].cota : Infinity, base: i ? p.cota - K2.cortePiso : -Infinity, sup: i + 1 < L.length ? L[i + 1].cota - K2.cortePiso : Infinity }; });
  }
  /* o ambiente tem, NESTE pavimento, louça (ligação de aparelho) ou ralo/caixa sifonada dentro da caixa dele */
  function ambienteMolhado(c, am, pv) {
    var f = K2.folgaAmb, b0 = pv.base != null ? pv.base : pv.cota - K2.cortePiso, b1 = pv.sup != null ? pv.sup : pv.topo, tol = HI().K.tolPiso_m, n = 0;
    function dentro(p) { return p.x >= am.x0 - f && p.x <= am.x1 + f && p.z >= am.z0 - f && p.z <= am.z1 + f && p.y >= b0 - tol && p.y < b1; }
    arr(c.rede && c.rede.ligacoes).forEach(function (l) { if (l.tipo === "aparelho" && dentro(l)) n++; });
    arr(c.rede && c.rede.pecas).forEach(function (k) { if (k.sistema === "esgoto" && /^(ralo|caixa_sifonada)/.test(txt(k.peca)) && dentro(k)) n++; });
    return n > 0;
  }
  function ambienteDoPav(c, am, pv) {
    var dono = pavDoAmbiente(c.modelo && c.modelo.estado, am, c.pavs);
    if (dono) return dono.nome === pv.nome && dono.cota === pv.cota;
    return ambienteMolhado(c, am, pv);
  }
  /* a perspectiva/esquema do ambiente quase sem desenho: tubo menor que o mínimo e nenhuma peça nem registro */
  function perspVazia(pz) {
    var m = 0; arr(pz && pz.trs).forEach(function (t) { m += dist3d(t.p1, t.p2); });
    var np = arr(pz && pz.itens).filter(function (i) { return i.tipo === "peca"; }).length + arr(pz && pz.acess).length;
    return m < K2.limpeza.tuboMinM && np === 0;
  }
  /* a planta de um sistema no pavimento só sai com tubo horizontal suficiente ou com ponto/peça dentro do pavimento */
  function plantaComConteudo(c, trs, pv, avisos, sis) {
    var m = 0; arr(trs).forEach(function (t) { if (!t.vertical) m += dist3d(t.p1, t.p2); });
    if (m >= K2.limpeza.plantaTuboMinM) return true;
    var b0 = pv.base != null ? pv.base : pv.cota, b1 = pv.sup != null ? pv.sup : pv.topo, tol = HI().K.tolPiso_m, tem = false;
    arr(c.rede && c.rede.ligacoes).forEach(function (l) { if (l.tipo !== "peca" && l.y >= b0 - tol && l.y < b1) tem = true; });
    arr(c.rede && c.rede.pecas).forEach(function (k) { if (k.y >= b0 - tol && k.y < b1) tem = true; });
    if (!tem) avisos.push("Planta de " + (NOME_SIS[sis] || sis) + " - " + pv.nome + ": só " + br(m, 2) + " m de tubo horizontal e nenhuma peça (folha quase vazia) - suprimida.");
    return tem;
  }
  /* o MESMO corte repetido (parede dividida/sobreposta no modelo): mesma lista de trechos e de pontos = uma folha só */
  function assinaturaCorte(q) {
    return q.trs.map(function (t) { return txt(t.id); }).sort().join(",") + "|" + q.pts.map(function (l) { return txt(l.alvo) + "@" + txt(l.trecho); }).sort().join(",");
  }
  var PROIBIDA_QUADRO = /t[eê]\s+de\s+redu[cç][aã]o[^\n]*(esgoto|pluvial|ventila)|(esgoto|pluvial|ventila)[^\n]*t[eê]\s+de\s+redu[cç][aã]o/i;
  function ambientesAuto(estado, pavs) {
    var fams = arr(estado && estado.familias).filter(function (f) { return APARELHO_RE.test(txt(f.famId)); }), grupos = [];
    var ps = arr(pavs).length ? pavs : [{ nome: "", cota: -Infinity, topo: Infinity }];
    fams.forEach(function (f) {
      /* 17/11/2026: o aparelho é do nível de piso mais alto que não passa da altura dele (o chuveiro a 2,2 m com níveis de referência a 2,6/2,8 m era empurrado para o nível errado: as paredes do cômodo sumiam e a caixa do ambiente se partia) */
      var pv = null; ps.forEach(function (q) { if (f.y >= q.cota - HI().K.tolPiso_m) pv = q; });
      var ws = paredesDoPav(estado, pv && isFinite(pv.cota) ? pv : null), p = [f.x, f.z], lim = [];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var best = null; ws.forEach(function (w) { var t = cruzaRaio(p, d, w); if (t != null && (best == null || t < best)) best = t; });
        lim.push(best == null ? K2.ambFolga : best);
      });
      var box = { x0: f.x - lim[1], x1: f.x + lim[0], z0: f.z - lim[3], z1: f.z + lim[2] }, g = null;
      var pvc = pv && isFinite(pv.cota) ? pv.cota : null;   /* o pavimento entra no critério: banheiros empilhados (mesma caixa, andares diferentes) são ambientes diferentes */
      grupos.forEach(function (q) { if (!g && q.pvc === pvc && Math.abs(q.x0 - box.x0) < K2.ambTol && Math.abs(q.x1 - box.x1) < K2.ambTol && Math.abs(q.z0 - box.z0) < K2.ambTol && Math.abs(q.z1 - box.z1) < K2.ambTol) g = q; });
      if (!g) { g = { x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1, fams: [], tipos: {}, pvc: pvc }; grupos.push(g); }
      g.fams.push(f.id); g.tipos[txt(f.famId)] = 1;
    });
    var conta = {};
    grupos.forEach(function (g) {
      var t = Object.keys(g.tipos).join(" ");
      g.base = /bacia|mictorio|chuveiro/.test(t) ? (/mictorio/.test(t) && !/bacia/.test(t) ? "SANITÁRIO" : "BANHEIRO") : /pia-cozinha/.test(t) ? "COZINHA" : /tanque|torneira/.test(t) ? "ÁREA DE SERVIÇO" : "AMBIENTE";
      conta[g.base] = (conta[g.base] || 0) + 1;
    });
    var seq = {};
    var lista = grupos.sort(function (a, b) { return a.z0 - b.z0 || a.x0 - b.x0; }).map(function (g, i) {
      seq[g.base] = (seq[g.base] || 0) + 1;
      var m = K2.folgaAmb, HKi = dep("HidKit", "./hidkit.js"), bim = null, f0 = null;
      /* o NOME do ambiente do BIM (o cômodo desenhado: "BANHEIRO SOCIAL") vale mais que o nome deduzido dos aparelhos */
      arr(estado.familias).forEach(function (f) { if (f.id === g.fams[0]) f0 = f; });
      try { bim = f0 && HKi && HKi._int && HKi._int.ambienteDe ? HKi._int.ambienteDe(estado, f0) : null; } catch (e) { bim = null; }
      if (bim && txt(bim.nome).trim()) return { id: "amb" + (i + 1), nome: txt(bim.nome).trim().toUpperCase(), x0: g.x0 - m, x1: g.x1 + m, z0: g.z0 - m, z1: g.z1 + m, aparelhos: g.fams, ambienteBim: bim.id || null, pavCota: g.pvc };
      return { id: "amb" + (i + 1), nome: g.base + (conta[g.base] > 1 ? " " + seq[g.base] : ""), x0: g.x0 - m, x1: g.x1 + m, z0: g.z0 - m, z1: g.z1 + m, aparelhos: g.fams, pavCota: g.pvc };
    });
    /* 17/11/2026: o mesmo cômodo do BIM em duas caixas quase iguais (2x BANHO SOCIAL) vira um só */
    var HCu = dep("HidCaderno", "./hidcaderno.js");
    return HCu && HCu.unificarAmbientes ? HCu.unificarAmbientes(lista) : lista;
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
      var trsT = trs, ptsT = pts;
      if (!trsT.length || ptsT.filter(function (l) { return l.tipo === "aparelho"; }).length < K2.corteMinPontos) return;
      /* 17/11/2026 (a elevação "Banheiro" saía igual à da Lavanderia): a parede entre dois cômodos tem DOIS lados — uma elevação por lado, cada uma só com o que está
         do lado de quem olha (o tubo embutido na parede vale para os dois). Antes: um corte só, com tubo e ponto dos dois cômodos, e o nome do primeiro. */
      [1, -1].forEach(function (lado) {
      var tolL = K2.limpeza.tolLadoParede;   /* cada item fica do lado em que está (o ponto embutido a 3-8 cm do eixo é do cômodo daquele lado) */
      var trs = trsT.filter(function (t) { return loc({ x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }).d * lado >= -tolL; }), pts = ptsT.filter(function (l) { return loc(l).d * lado >= -tolL; });
      if (!trs.length || pts.filter(function (l) { return l.tipo === "aparelho"; }).length < K2.corteMinPontos) return;
      var vd = [-w.n[0] * lado, -w.n[1] * lado], dir = [-vd[1], vd[0]], inv = dir[0] * w.u[0] + dir[1] * w.u[1] < 0;
      var nome = null; amb.forEach(function (a) { var cx = w.c[0] + w.n[0] * lado * (w.esp / 2 + K2.faixaParede), cz = w.c[1] + w.n[1] * lado * (w.esp / 2 + K2.faixaParede); if (!nome && cx >= a.x0 && cx <= a.x1 && cz >= a.z0 && cz <= a.z1) nome = a.nome; });
      /* 15/11/2026: a ELEVAÇÃO enquadra só a FAIXA da parede que tem ponto/tubo/acessório (com margem), não a parede inteira: a vista saía quase vazia
         (parede de 8 m com um ponto) e a escala caía para 1:50/1:75. A parede da vista é uma cópia com L = a faixa; loc() mede a partir do centro da faixa. */
      var acessF = arr(c.rede.acessorios).filter(function (a) { return a.centro && dentro(a.centro); }), ss = [];
      pts.forEach(function (l) { ss.push(loc(l).s); }); acessF.forEach(function (a) { ss.push(loc(a.centro).s); }); trs.forEach(function (t) { ss.push(loc(t.p1).s, loc(t.p2).s); });
      var s0 = Math.max(-w.L / 2, Math.min.apply(null, ss) - K2.corteMargemFaixa), s1 = Math.min(w.L / 2, Math.max.apply(null, ss) + K2.corteMargemFaixa);
      if (s1 - s0 < K2.corteFaixaMin) { var cm = (s0 + s1) / 2; s0 = cm - K2.corteFaixaMin / 2; s1 = cm + K2.corteFaixaMin / 2; if (s0 < -w.L / 2) { s1 += -w.L / 2 - s0; s0 = -w.L / 2; } if (s1 > w.L / 2) { s0 -= s1 - w.L / 2; s1 = w.L / 2; } s0 = Math.max(s0, -w.L / 2); }
      var wv = {}; for (var kw in w) if (Object.prototype.hasOwnProperty.call(w, kw)) wv[kw] = w[kw]; wv.L = s1 - s0;
      var sc = (s0 + s1) / 2, locV = function (p) { var q = loc(p); return { s: q.s - sc, d: q.d }; };
      out.push({ w: wv, trs: trs, pts: pts, inv: inv, lado: lado, nome: nome || "PAREDE", loc: locV, faixa: [s0, s1], parede: w,
                 acess: acessF });
      });
    });
    var vistos = {};
    return out.filter(function (q) { var k = assinaturaCorte(q); if (vistos[k]) return false; vistos[k] = 1; return true; });
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
    var cotaYs = [], cotaYsE = [], cotaYsD = [];
    if (ph.cotaV) {
      /* os pontos da metade esquerda da parede cotam numa cadeia à esquerda; os da direita, numa cadeia à direita */
      var hsE = {}, hsD = {}, meio = w.L * s / 2;
      var alt0 = function (h0, xx, y0) { (xx < meio ? hsE : hsD)[Math.round((y0 - pv.cota) * 100)] = y0; void h0; };
      ph.pts.forEach(function (l) { if (l.tipo === "aparelho") alt0(0, X(l), l.y); }); ph.acess.forEach(function (a0) { alt0(0, X(a0.centro), a0.centro.y); });
      var lista = function (hs, dst) { Object.keys(hs).map(Number).sort(function (p0, q0) { return p0 - q0; }).forEach(function (k0) { dst.push(Y(hs[k0])); cotaYs.push(Y(hs[k0])); }); };
      lista(hsE, cotaYsE); lista(hsD, cotaYsD);
      if (cotaYsE.length) seg.push([-ph.cotaV, Math.min.apply(null, cotaYsE), -ph.cotaV, Y(pv.cota)]);
      if (cotaYsD.length) seg.push([w.L * s + ph.cotaV, Math.min.apply(null, cotaYsD), w.L * s + ph.cotaV, Y(pv.cota)]);
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
      var trL = l.tipo === "aparelho" ? ph.trs.filter(function (q1) { return q1.id === l.trecho; })[0] : null, dnL = trL ? dnRotulo(trL, (c.ix[trL.sistema] || {})[trL.id], false) : "";   /* a sigla, o DN e a altura do ponto */
      if (l.tipo === "aparelho") { pend.push({ s: (nm ? nm + "  " : "") + (dnL ? dnL + "  " : "") + (alt >= 0 ? "+" : "") + br(alt, 2), h: KI.hPeq, tipo: "aparelho", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0 }); cot.push(p[0]); }
    });
    ph.acess.forEach(function (a) {
      var p = [X(a.centro), Y(a.centro.y)], r = KI.regC / 2;
      /* 14/11/2026 — o Rogério (folha 08): "os símbolos de cada peça ficaram errados; coloca os corretos, igual a prancha 6": o registro
         sai com o símbolo da LEGENDA (gaveta/pressão), deitado no tubo, desenhado em desenhar() */
      S.push({ tipo: "registro", ac: a.acessorio, x: p[0], y: p[1], r: r, camada: "HID-SIMBOLO", box: [p[0] - r, p[1] - r * 2.6, p[0] + r, p[1] + r], id: a.id });
      var alt = a.centro.y - pv.cota;
      pend.push({ s: txt(({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[a.acessorio] || "RG") + "  " + (alt >= 0 ? "+" : "") + br(alt, 2), h: KI.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: a.id, anchors: [p], prio: 1 });
    });
    var avisos = [];
    H.afastar(pend, S, L, T, seg, avisos);
    /* a cota dos pontos ao longo da parede (cm), embaixo do piso: entra depois, fora do desenho */
    cot.sort(function (a, b) { return a - b; });
    var xsC = [0].concat(cot.filter(function (x, i) { return i === 0 || x - cot[i - 1] > KI.margem / 2; })).concat([w.L * s]);
    return { linhas: L, simbolos: S, textos: T, avisos: avisos, cotaXs: xsC, cotaYs: cotaYs, cotaYsE: cotaYsE, cotaYsD: cotaYsD, yPiso: Y(pv.cota), yFundo: Y(yBot), yTopo: Y(yTop), w: w.L * s, trechos: ph.trs.map(function (t) { return t.id; }) };
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
  function chamadas(D, itens, xT, yMin, yMax, h, xMax) {
    var passo = h * K2.notaLinha + K2.notaEntre, ord = itens.slice().sort(function (a, b) { return a.p[1] - b.p[1]; }), y = yMin;
    ord.forEach(function (it) {
      var ty = Math.max(y, Math.min(it.p[1] + h * 0.35, yMax));
      D.linha(it.p[0], it.p[1], xT - 1, ty - h * 0.35, "HID-COTA");
      D.ponto(it.p[0], it.p[1], HI().K.rTe * 0.7, "#000");
      /* 21/11/2026: com a margem direita do painel (xMax) a chamada QUEBRA em vez de invadir a vista ao lado (os detalhes agora dividem a folha com o quadro) */
      var lsC = xMax && xMax - xT > 10 ? AP().quebrar(it.t, h, xMax - xT) : [it.t];
      lsC.forEach(function (lc, kc) { D.texto(xT, ty + kc * h * K2.notaLinha, lc, h, { cor: it.cor }); });
      y = ty + passo + (lsC.length - 1) * h * K2.notaLinha;
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
  /* ⚠ DETALHES TÍPICOS COM QUALIDADE (14/11/2026 — o Rogério: "ficou muito fraquinho, feio; preciso que seja mais completo; pode até modelar").
     Cada painel leva a PEÇA MODELADA (a imagem da família, img/hid-pecas — a mesma geometria do 3D) e um CORTE técnico de verdade: parede com
     espessura e hachura, terreno/contrapiso hachurados, a água do fecho hídrico pintada, os tubos em linha dupla com a cor do sistema, a grelha
     com as fendas, a tampa de concreto, a meia-cana do fundo. Sem escala (esquemático): a dimensão vale a do fabricante (tabela do catálogo). */
  var KD = { agua: "#d7ebf8", aguaLinha: "#5b9bd5", parede: "#d9d9d9", concreto: "#eeeeee", tijolo: "#e8d5c4", passo: 1.0, terraPasso: 2.2 };   // hid:ok cores e passo de hachura do desenho (não norma)
  function hachRet(D, x, y, w, h, fill) { var P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; poliCheio(D, P, fill || KD.parede, "#555", 0.18); hachura(D, P, KD.passo); }
  function terra(D, x0, x1, y) { D.linha(x0, y, x1, y, "HID-TITULO"); for (var x = x0 + 1; x < x1; x += KD.terraPasso) D.linha(x, y, x - 1.2, y + 1.2, "HID-COTA"); }
  function tuboSec(D, x0, x1, yc, r, cor) {   /* tubo horizontal em corte longitudinal: as duas geratrizes e o eixo */
    var a = Math.min(x0, x1), b = Math.max(x0, x1);
    poliCheio(D, [[a, yc - r], [b, yc - r], [b, yc + r], [a, yc + r]], cor, "#333", 0.2);
    D.add('<line x1="' + n(a) + '" y1="' + n(yc) + '" x2="' + n(b) + '" y2="' + n(yc) + '" stroke="#333" stroke-width="0.1" stroke-dasharray="1.6 0.5 0.3 0.5" data-cam="HID-EIXO"/>');
  }
  function corSisDet(D, cam) { var c0 = D.E.camadas[cam]; return c0 && c0.cor ? c0.cor : "#888"; }
  function pnCaixaSif(D, g) {
    var w = g.w * 0.56, h = g.h * 0.62, x = g.x + g.w * 0.22, y = g.y + g.h * 0.2, t = Math.max(0.8, w * 0.05), it = [], cES = corSisDet(D, "HID-ES-TUBO");
    /* contrapiso e piso acabado em volta, terreno embaixo */
    hachRet(D, g.x, y - 2.2, x - g.x, 2.2, KD.concreto); hachRet(D, x + w, y - 2.2, g.x + g.w - x - w, 2.2, KD.concreto);
    terra(D, g.x, g.x + g.w, y + h + 2.5);
    /* corpo em corte: paredes e fundo com espessura */
    hachRet(D, x, y, t, h); hachRet(D, x + w - t, y, t, h); hachRet(D, x, y + h - t, w, t);
    var yA = y + h * 0.58; poliCheio(D, [[x + t, yA], [x + w - t, yA], [x + w - t, y + h - t], [x + t, y + h - t]], KD.agua, null, 0);
    D.add('<line x1="' + n(x + t) + '" y1="' + n(yA) + '" x2="' + n(x + w - t) + '" y2="' + n(yA) + '" stroke="' + KD.aguaLinha + '" stroke-width="0.25" data-cam="HID-EIXO"/>');
    D.linha(x + w * 0.42, yA - 1.5, x + w * 0.42 + 2, yA - 1.5, "HID-COTA"); D.linha(x + w * 0.42 + 0.5, yA - 0.9, x + w * 0.42 + 1.5, yA - 0.9, "HID-COTA");   /* símbolo de nível d'água */
    /* septo (sifão): desce do topo até abaixo do nível d'água, deixando a passagem embaixo */
    hachRet(D, x + w * 0.58, y + h * 0.18, t * 0.8, h * 0.62);
    /* grelha com as fendas e o porta-grelha */
    poliCheio(D, [[x - 1.2, y - 1.4], [x + w + 1.2, y - 1.4], [x + w + 1.2, y], [x - 1.2, y]], "#bdbdbd", "#333", 0.2);
    for (var k = 1; k < 9; k++) D.linha(x + w * k / 9, y - 1.4, x + w * k / 9, y, "HID-SIMBOLO");
    /* entradas (DN 40) e saída (DN da peça) */
    var rE = h * 0.035, rS = h * 0.045;
    tuboSec(D, g.x, x + t, y + h * 0.3, rE, cES); tuboSec(D, x + w - t, g.x + g.w, y + h * 0.72, rS, cES);
    it.push({ p: [x + w * 0.3, y - 0.7], t: "GRELHA E PORTA-GRELHA (no nível do piso acabado)" });
    it.push({ p: [g.x + 2, y + h * 0.3], t: "ENTRADAS DN 40 (lavatório, ralo do box) - acima do fecho" });
    it.push({ p: [x + w * 0.58 + t * 0.4, y + h * 0.3], t: "SEPTO DO SIFÃO" });
    it.push({ p: [x + w * 0.3, yA], t: "FECHO HÍDRICO >= 50 mm (NBR 8160)" });
    it.push({ p: [x + w + 3, y + h * 0.72], t: "SAÍDA (DN da planta), i >= mínima do DN" });
    it.push({ p: [x + 1, y - 1.1], t: "CONTRAPISO / PISO ACABADO" });
    return it;
  }
  function pnCaixa(D, g, partes, esgoto, alvenaria) {
    var w = g.w * 0.6, h = g.h * 0.6, x = g.x + g.w * 0.2, y = g.y + g.h * 0.16, t = alvenaria ? Math.max(1.4, w * 0.11) : Math.max(0.8, w * 0.05), it = [];
    var cam = esgoto ? "HID-ES-TUBO" : "HID-AF-TUBO", cor = corSisDet(D, cam);
    terra(D, g.x, x, y); terra(D, x + w, g.x + g.w, y);
    /* paredes (alvenaria de tijolo maciço com reboco, ou corpo de PVC), laje de fundo e tampa de concreto */
    hachRet(D, x, y, t, h, alvenaria ? KD.tijolo : KD.parede); hachRet(D, x + w - t, y, t, h, alvenaria ? KD.tijolo : KD.parede);
    hachRet(D, x - (alvenaria ? 1.2 : 0), y + h, w + (alvenaria ? 2.4 : 0), alvenaria ? 2.4 : t, KD.concreto);
    hachRet(D, x - 0.8, y - 2, w + 1.6, 2, KD.concreto);
    /* fundo com a meia-cana (calha) e a água */
    var yF = y + h, cx = x + w / 2, rc = (w - 2 * t) * 0.18, arc = [];
    var yA = y + h * 0.74; poliCheio(D, [[x + t, yA], [x + w - t, yA], [x + w - t, yF], [x + t, yF]], esgoto ? "#e6efe2" : KD.agua, null, 0);
    for (var q = 0; q <= 12; q++) { var a = Math.PI * q / 12; arc.push([cx - rc * Math.cos(a), yF - rc * 0.1 - Math.sin(a) * rc * 0.5]); }
    D.poli(arc, "HID-SIMBOLO", false);
    var rT = h * 0.04; tuboSec(D, g.x, x + t, y + h * 0.7, rT, cor); tuboSec(D, x + w - t, g.x + g.w, y + h * 0.78, rT, cor);
    var pts = [[cx, y - 1], [g.x + 3, y + h * 0.7], [x + w + 3, y + h * 0.78], [cx, yF - rc * 0.5], [cx, yF + 1.2], [x + t * 0.5, y + h * 0.4]];
    partes.forEach(function (tx, i) { if (pts[i]) it.push({ p: pts[i], t: tx }); });
    if (alvenaria) it.push({ p: [x + t * 0.5, y + h * 0.25], t: "ALVENARIA DE TIJOLO MACIÇO, REBOCO INTERNO IMPERMEÁVEL" });
    return it;
  }
  /* RESERVATÓRIO: o perfil na proporção da caixa colocada (Ø × H da família), com as chamadas funcionais e os valores reais */
  function pnReservatorioReal(D, g, q) {
    var it = [], w = g.w * 0.55, h = g.h * 0.62, tem = q.diametro != null && q.altura != null;
    if (tem) { var k = Math.min(g.w * 0.6 / q.diametro, g.h * 0.7 / q.altura); w = q.diametro * k; h = q.altura * k; }
    var x = g.x + g.w * 0.2, y = g.y + g.h * 0.12;
    poliCheio(D, [[x + 0.8, y + h * 0.25], [x + w - 0.8, y + h * 0.25], [x + w - 0.8, y + h - 0.8], [x + 0.8, y + h - 0.8]], KD.agua, null, 0);   /* a água até o nível de operação */
    hachRet(D, x, y + 1.6, 0.8, h - 1.6); hachRet(D, x + w - 0.8, y + 1.6, 0.8, h - 1.6); hachRet(D, x, y + h - 0.8, w, 0.8);
    poliCheio(D, [[x - 1, y], [x + w + 1, y], [x + w + 1, y + 1.6], [x - 1, y + 1.6]], "#9e9e9e", "#333", 0.2);   /* tampa */
    hachRet(D, x - 2, y + h, w + 4, 2.2, KD.concreto);   /* base de apoio nivelada */
    D.add('<line x1="' + n(x + 0.8) + '" y1="' + n(y + h * 0.25) + '" x2="' + n(x + w - 0.8) + '" y2="' + n(y + h * 0.25) + '" stroke="' + KD.aguaLinha + '" stroke-width="0.25" data-cam="HID-EIXO"/>');
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
    var E = EXISTE, temFam = function (re) { return !!E && Object.keys(E.fam).some(function (k) { return re.test(k); }); };
    return PAINEIS.filter(function (pn) {
      if (pn.id === "kit" && !temVD) return false; if (pn.id === "calha" && !temCalha) return false;
      if (!E) return true;   /* sem o que existe (chamada avulsa): painéis como antes */
      if (pn.id === "cs") return !!E.pecas.caixa_sifonada || temFam(/caixa-sifonada/); if (pn.id === "ci") return !!E.pecas.caixa_inspecao || temFam(/caixa-inspecao/);
      if (pn.id === "cg") return !!E.pecas.caixa_gordura || temFam(/caixa-gordura/);
      if (pn.id === "res" || pn.id === "bar") return temFam(/caixa-dagua|cisterna|reservatorio/);
      return true;
    });
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
      /* a PEÇA MODELADA (a imagem da família, a mesma geometria do 3D) no canto do painel */
      var ICD = { cs: "fam-caixa-sifonada", ci: "fam-caixa-inspecao", cg: "fam-caixa-gordura", res: "fam-caixa-dagua", bar: "fam-caixa-dagua" }, ladoI = Math.min(ch * 0.34, cw * 0.32), yI = py + ch - ladoI - h * 2.5;   /* embaixo, à direita: a área livre do painel (a tabela do catálogo fica em cima) */
      if (ICD[pn.id] && iconeImagem(D, ICD[pn.id], px + cw - ladoI - 3, yI, ladoI)) D.texto(px + cw - ladoI / 2 - 3, yI + ladoI + h * 1.2, "PEÇA MODELADA (família do sistema, 3D)", h * 0.9, { al: "C", cor: "#6b7280" });
      var g = { x: gx, y: gy, w: gw, h: gh }, it;
      if (pn.id === "kit") it = pnKitBacia(D, g);
      else if (pn.id === "cs") it = pnCaixaSif(D, g);
      else if (pn.id === "ci") {
        /* a caixa de inspeção do MODELO: de PVC (Tigre/Amanco, a família) ou de alvenaria (o padrão quando não há a de catálogo) */
        var pcsCi = arr(c.modelo && c.modelo.estado && c.modelo.estado.instalacoes && c.modelo.estado.instalacoes.pecas).filter(function (k) { return /inspecao/.test(txt(k.peca)); });
        var alv = !pcsCi.some(function (k) { return /pvc|tigre|amanco/.test(JSON.stringify(k).toLowerCase()); });
        it = pnCaixa(D, g, ["TAMPA DE CONCRETO (removível, com alças)", "ENTRADA", "SAÍDA", "FUNDO COM CALHA (meia-cana)", "LASTRO / LAJE DE FUNDO DE CONCRETO"], true, alv);
      }
      else if (pn.id === "cg") {
        /* R04b: a TAMPA vem da caixa de gordura do MODELO (inst.Tampa da família, ex.: "hermética, revestida com o porcelanato do piso"); sem ela, o texto genérico */
        var cgT = arr(c.modelo && c.modelo.estado && c.modelo.estado.familias).filter(function (f) { return f && f.famId === "hid-caixa-gordura" && f.inst && f.inst.Tampa; })
          .map(function (f) { return String(f.inst.Nome || "CG").split(" ")[0] + ": " + String(f.inst.Tampa); });
        it = pnCaixa(D, g, [cgT.length ? "TAMPA " + cgT.join("; ") : "TAMPA", "ENTRADA (cozinha)", "SAÍDA (abaixo do nível da gordura)", "SEPTO / CESTO", "FUNDO"], true, false);
      }
      else if (pn.id === "bar") it = pnBarrilete(D, g, nomesCol);
      else if (pn.id === "calha") it = pnCalhaEmbutida(D, g, c.r);
      else if (cxsReais.length) it = pnReservatorioReal(D, g, cxsReais[0]);
      else it = pnCaixa(D, g, ["TAMPA", "ENTRADA COM BOIA", "SAÍDA (barrilete)", "NÍVEL DE OPERAÇÃO", "LIMPEZA"], false);
      var yFim = chamadas(D, it, gx + gw + cw * 0.06, gy, gy + gh, h, px + cw - 3);
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
  /* O QUADRO DAS PRANCHAS DO HIDRO É SÓ DO HIDRO (15/11/2026 — HID-R00 (58) saiu com um grupo "ELÉTRICA" — caixa 4x2, caixa octogonal, eletroduto corrugado —
     que é da prancha da elétrica): fica só quem tem camada de sistema do hidrossanitário (CAMADA_SIS: AF, AQ, ES, VE, AP, incêndio, indústria, gás) e o grupo
     "louças, metais e equipamentos" (sistema ""). Elétrica, ar, frigorígeno, bandeja e dreno de climatização saem. */
  function soHidro(L) { return arr(L).filter(function (x) { var s = txt(x && x.sistema); return s === "" || Object.prototype.hasOwnProperty.call(CAMADA_SIS, s); }); }
  function linhasQuadro(c) {
    var PC = PEC(), B = BI(), est = c.modelo && c.modelo.estado, L = null;
    try { if (PC && B && est) L = PC.listaMaterial(B.qto(est, c.modelo.avaliarFam), arr(est.familias)); } catch (e) { L = null; }
    if (!L) return null;
    L = soHidro(L);
    var por = {}, ordem = [], SO = ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "industrial", "gas", ""];
    L.forEach(function (x) {
      var k = txt(x.sistema) + "|" + txt(x.descricao) + "|" + txt(x.unidade);
      if (!por[k]) { por[k] = { sistema: txt(x.sistema), descricao: txt(x.descricao), unidade: txt(x.unidade) || "un", icone: txt(x.icone) || (/transposi/i.test(txt(x.descricao)) ? "cx-curva-transposicao" : ""), quantidade: 0 }; ordem.push(k); }
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
    if (/transposicao/.test(ic)) { P([[x + 1, cy - e / 2], [cx - w * 0.28, cy - e / 2], [cx - w * 0.2, cy - h * 0.34], [cx + w * 0.2, cy - h * 0.34], [cx + w * 0.28, cy - e / 2], [x + w - 1, cy - e / 2], [x + w - 1, cy + e / 2], [cx + w * 0.28 - e, cy + e / 2], [cx + w * 0.2 - e * 0.6, cy - h * 0.34 + e], [cx - w * 0.2 + e * 0.6, cy - h * 0.34 + e], [cx - w * 0.28 + e, cy + e / 2], [x + 1, cy + e / 2]]); return; }   /* a curva de transposição: tubo com o arco por cima */
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
  /* QUADRO (21/11/2026, o Rogério: "letras minúsculas, a tabela com a descrição estreita e a quantidade lá na ponta"): a LETRA é fixa (K2.quadro.letra, nunca abaixo de
     letraMin = 2,5 mm impressos: a paginação só encolhe a ALTURA da linha) e a largura da tabela é a JUSTA do conteúdo: DESCRIÇÃO do tamanho da maior descrição (sem quebrar até
     K2.quadro.descMax) e ITEM/PEÇA/SISTEMA/UN/QUANT. do tamanho do que trazem, tudo encostado; a sobra do papel fica fora da tabela (centrada, ou dividida com outras vistas). */
  function letraQuadro() { return Math.max(K2.quadro.letra, K2.quadro.letraMin); }
  function largurasQuadro(linhas, wMax) {
    var Q = K2.quadro, h = letraQuadro(), hc = h * 1.08, p = Q.pad * 1.4, L = arr(linhas).filter(function (l) { return l && !l.grupo; }), w = {};
    function mx(f) { return L.reduce(function (m, l) { return Math.max(m, f(l)); }, 0); }
    function nq(l) { return br(l.quantidade, l.unidade === "m" ? 2 : 0); }
    w.item = Math.max(Q.itemMin, larg("ITEM", hc) + p, larg(String(Math.max(L.length, 10)), h) + p);
    w.peca = Q.icone + Q.pecaFolga;
    w.desc = Math.min(Q.descMax, Math.max(larg("DESCRIÇÃO", hc) + 2 * Q.pad, mx(function (l) { return larg(txt(l.descricao), h); }) + 2 * Q.pad));
    w.sis = Math.max(larg("SISTEMA", hc), mx(function (l) { return larg(CAMADA_SIS[l.sistema] || "-", hc); })) + p;
    w.un = Math.max(larg("UN", hc), mx(function (l) { return larg(txt(l.unidade), h); })) + p;
    w.qtd = Math.max(larg("QUANT.", hc), mx(function (l) { return larg(nq(l), h * 1.08); })) + p;
    var soGrupo = 0; Object.keys(NOME_SIS_Q).forEach(function (k) { soGrupo = Math.max(soGrupo, larg(NOME_SIS_Q[k], h * 1.1) + 2 * Q.pad + 4); });
    var tot = w.item + w.peca + w.desc + w.sis + w.un + w.qtd;
    if (tot < soGrupo) { w.desc += soGrupo - tot; tot = soGrupo; }
    if (wMax && tot > wMax) { var cort = Math.min(tot - wMax, w.desc - (larg("DESCRIÇÃO", hc) + 2 * Q.pad)); if (cort > 0) { w.desc -= cort; tot -= cort; } }
    w.total = tot; return w;
  }
  /* ETAPA 2: a última página do quadro quase vazia (a 3ª com 7 % do papel) some quando um passo menos de altura de linha cabe em menos páginas (a linha vai de 12 mm até K.auto.quadroLinhaMin) */
  function paginarQuadro(c, linhas, opc) {
    var melhor = null;
    for (var lin = K2.quadro.linha; lin >= K2.auto.quadroLinhaMin - 1e-9; lin -= 0.5) {
      var r = paginarQuadroCom(c, linhas, lin, opc);
      if (!melhor || r.paginas.length < melhor.paginas.length) melhor = r;
      if (r.paginas.length <= 1) break;
    }
    return melhor;
  }
  function quadroCom(linha) { var o = {}, Q = K2.quadro; for (var k in Q) if (Object.prototype.hasOwnProperty.call(Q, k)) o[k] = Q[k]; if (linha && linha < Q.linha) { o.linha = linha; o.icone = Math.min(Q.icone, linha - 1.5); } return o; }
  /* opc.area = { w, h } da região do quadro (padrão: a área da folha); opc.nCol = nº de colunas (padrão: 2 em folha larga, 1 nas demais) */
  function paginarQuadroCom(c, linhas, lin, opc) {
    var a = opc && opc.area || c.geo.area, Q = K2.quadro, porCol = Math.floor((a.h - K2.titulo - Q.cab - 4) / lin), nCol = opc && opc.nCol || (a.w >= 2 * 280 ? 2 : 1), out = [], atual = null, col = 0, nl = 0, sisAnt = null;   // hid:ok largura mínima de uma coluna do quadro (mm)
    linhas.forEach(function (ln) {
      var precisa = ln.sistema !== sisAnt ? 2 : 1;
      if (!atual || nl + precisa > porCol) { if (atual && col + 1 < nCol) { col++; } else { atual = { cols: [] }; out.push(atual); col = 0; } atual.cols[col] = atual.cols[col] || []; nl = 0; sisAnt = null; precisa = 2; }
      atual.cols[col] = atual.cols[col] || [];
      if (ln.sistema !== sisAnt) { atual.cols[col].push({ grupo: NOME_SIS_Q[ln.sistema] || ln.sistema.toUpperCase(), sis: ln.sistema }); nl++; sisAnt = ln.sistema; }
      atual.cols[col].push(ln); nl++;
    });
    return { paginas: out, nCol: nCol, linha: lin, larg: largurasQuadro(linhas, (a.w - (nCol - 1) * Q.gap) / nCol), letra: letraQuadro() };
  }
  /* QUADRO DE MATERIAIS (14/11/2026 — o Rogério: "a tabela está horrível; organiza, descrição completa, e o ícone é a MESMA peça
     modelada — você já tem as imagens"). O ícone é a imagem da peça gerada da PRÓPRIA geometria do modelo (img/hid-pecas, a mesma
     malha do 3D: tools/gerar-hid-icones.js), carregada pela tela (opcoes.icones); sem ela, o ícone vetorial de antes.
     Cabeçalho escuro, faixa por sistema com a cor do sistema, linhas alternadas e numeradas, descrição INTEIRA (quebra em até 2
     linhas, nunca "..."), quantidade em destaque. */
  var ICONES = null;
  function iconeImagem(D, nome, x, y, lado) {
    var ic = ICONES && nome ? ICONES[nome] : null; if (!ic || !ic.jpeg) return false;
    IMAGENS = IMAGENS || {}; var key = "i" + nome.replace(/[^A-Za-z0-9]/g, "");
    IMAGENS[key] = { jpeg: ic.jpeg, pxW: ic.pxW, pxH: ic.pxH };
    D.add('<image data-im="' + key + '" x="' + n(x) + '" y="' + n(y) + '" width="' + n(lado) + '" height="' + n(lado) + '" preserveAspectRatio="none" href="' + ic.url + '"/>');
    return true;
  }
  function folhaQuadro(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, Q = quadroCom(c.quadroLinha), pg = c.quadroPagina, h = letraQuadro();
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, c.quadroSub || "Quantidades do modelo (tubo em m, peças em un) - a mesma lista do memorial e da planilha");
    if (!pg) { D.texto(a.x + K2.erroX, a.y + K2.vazioY, "Lista de material indisponível (js/hidpecas.js não carregou): não verificado.", T.nota, { cor: K2.vermelho }); return { escala: "-" }; }
    var nCol = c.quadroNCol, item = c.quadroItem0 || 0, W = c.quadroLarg;
    if (!W) { var todas = []; pg.cols.forEach(function (cl0) { arr(cl0).forEach(function (l0) { if (!l0.grupo) todas.push(l0); }); }); W = largurasQuadro(todas, (a.w - (nCol - 1) * Q.gap) / nCol); }
    var ws = [W.item, W.peca, W.desc, W.sis, W.un, W.qtd], cwTot = W.total, blocoW = nCol * cwTot + (nCol - 1) * Q.gap, xIni = c.quadroEsq ? a.x : a.x + Math.max(0, (a.w - blocoW) / 2), padQ = Q.pad * 0.7;
    function corSis(sis) { var cam = D.E.camadas["HID-" + (CAMADA_SIS[sis] || "AF") + "-TUBO"]; return sis && cam ? cam.cor : "#6b7280"; }
    pg.cols.forEach(function (lin, ci) {
      var x0 = xIni + ci * (cwTot + Q.gap), y = a.y + K2.titulo, xs = [x0]; ws.forEach(function (w) { xs.push(xs[xs.length - 1] + w); });
      var cab = ["ITEM", "PEÇA", "DESCRIÇÃO", "SISTEMA", "UN", "QUANT."];
      D.fundo(x0, y, cwTot, Q.cab, Q.corCab);
      cab.forEach(function (t, k) { D.texto(k === 2 ? xs[k] + Q.pad : (k === 5 ? xs[6] - padQ : (xs[k] + xs[k + 1]) / 2), y + Q.cab / 2 + h * 0.36, t, h, { al: k === 2 ? "E" : (k === 5 ? "D" : "C"), peso: 0.2, cor: "#ffffff" }); });
      y += Q.cab;
      var zebra = 0, sisG = "";
      lin.forEach(function (ln) {
        if (ln.grupo) {
          sisG = ln.sis != null ? ln.sis : sisG;
          D.fundo(x0, y, cwTot, Q.grupo, Q.corGrupo); D.fundo(x0, y, 1.6, Q.grupo, corSis(ln.sis));
          D.texto(x0 + Q.pad + 1.5, y + Q.grupo / 2 + h * 1.1 * 0.36, ln.grupo, h * 1.1, { peso: 0.24, cor: "#1f2937" });
          y += Q.grupo; zebra = 0; return;
        }
        item++;
        var yb = y + Q.linha / 2 + h * 0.36;
        if (zebra++ % 2) D.fundo(x0, y, cwTot, Q.linha, Q.corZebra);
        if (!iconeImagem(D, ln.icone, xs[1] + (ws[1] - Q.icone) / 2, y + (Q.linha - Q.icone) / 2, Q.icone)) iconePeca(D, ln.icone, ln.sistema, xs[1] + (ws[1] - Q.icone) / 2, y + (Q.linha - Q.icone) / 2 + Q.icone * 0.2, Q.icone, Q.icone * 0.6);
        D.texto((xs[0] + xs[1]) / 2, yb, dois(item), h, { al: "C", cor: "#6b7280" });
        var ls = c.AP.quebrar(ln.descricao, h, ws[2] - Q.pad * 1.2);
        if (ls.length > 2) { ls = [ls[0], ls.slice(1).join(" ")]; }
        var y0d = y + Q.linha / 2 - (ls.length - 1) * h * 0.62 + h * 0.36;
        ls.forEach(function (sl, k2) { D.texto(xs[2] + Q.pad, y0d + k2 * h * 1.24, sl, h, {}); });
        D.texto((xs[3] + xs[4]) / 2, yb, (CAMADA_SIS[ln.sistema] || "-"), h, { al: "C", cor: corSis(ln.sistema), peso: 0.2 });
        D.texto((xs[4] + xs[5]) / 2, yb, ln.unidade, h, { al: "C" });
        D.texto(xs[6] - padQ, yb, br(ln.quantidade, ln.unidade === "m" ? 2 : 0), h * 1.08, { al: "D", peso: 0.24 });
        y += Q.linha; D.linha(x0, y, x0 + cwTot, y, "HID-COTA");
      });
      D.linha(x0, a.y + K2.titulo, x0, y, "HID-TABELA"); D.linha(x0 + cwTot, a.y + K2.titulo, x0 + cwTot, y, "HID-TABELA"); D.linha(x0, y, x0 + cwTot, y, "HID-TABELA");
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
      if (b.tabela) {
        var hT = medirTabela(c.AP, b, h, cw, T.titulo * 0.8); if (y + hT > yMax) prox();
        y = desenharTabela(D, c.AP, b, a.x + col * (cw + 10), y, cw, h, T.titulo * 0.8); return;
      }
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

  /* o portal da obra: cfg.portal (link da placa/portal) ou, como sempre foi, o campo "QR do portal da obra" (cfg.qr) */
  function portalDe(cfg) { return txt(cfg && cfg.portal).trim() || txt(cfg && cfg.qr).trim(); }
  /* o link de UMA folha de ambiente = portal + ?amb=<id>[,<id>] (o endereço do portal não é inventado: sem portal, sem link) */
  function linkAmbientes(portal, ids) {
    portal = txt(portal).trim(); ids = arr(ids).map(function (x) { return txt(x).trim(); }).filter(function (x) { return x; });
    if (!portal || !ids.length) return "";
    var h = portal.indexOf("#"), base = h < 0 ? portal : portal.slice(0, h), fr = h < 0 ? "" : portal.slice(h);
    return base + (base.indexOf("?") < 0 ? "?" : "&") + K2.qrParam + "=" + encodeURIComponent(ids.join(K2.qrSep)) + fr;
  }
  /* os ambientes que a folha mostra: {ids, nomes} ou null (folha geral) */
  function ambDaDef(df, ambientes) {
    var ids = [], nomes = [];
    if (df && arr(df.ambientes).length) arr(df.ambientes).forEach(function (a) { if (a && (a.id || a.nome)) { ids.push(txt(a.id || a.nome)); nomes.push(txt(a.nome || a.id)); } });
    else if (df && df.ambiente) { var id = txt(df.ambiente), nm = id; arr(ambientes).forEach(function (a) { if (a && txt(a.id) === id && a.nome) nm = txt(a.nome); }); ids.push(id); nomes.push(nm); }
    return ids.length ? { ids: ids, nomes: nomes } : null;
  }
  /* o texto ao lado do QR, cortado para caber em `maxW` mm */
  function rotuloQrAmb(nomes, h, maxW) {
    var fim = K2.qrRotSep + K2.qrRotAmb, base = arr(nomes).join(K2.qrRotJunta), t = base + fim;
    while (larg(t, h) > maxW && base.length > 1) { base = base.slice(0, base.length - 1); t = base + K2.qrReticencia + fim; }
    return t;
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
  var CONJUNTOS = ["plantas", "cortes", "isometricos", "perspectivas", "ambientes", "esquema", "detalhes", "quadro", "isoprancha", "reservatorio"];
  var ROTULO_CONJUNTO = { plantas: "Plantas por pavimento e sistema", cortes: "Cortes das paredes hidráulicas", isometricos: "Isométricos por ambiente (unifilar)", perspectivas: "Perspectiva isométrica 3D por ambiente", ambientes: "Isométrico por ambiente (planta, isométrico com balões, tabelas)",
                          esquema: "Esquema vertical", detalhes: "Detalhes típicos", quadro: "Quadro de materiais", isoprancha: "Isométricos (prancha única: geral, por ambiente e caixa d'água)", reservatorio: "Reservatório (planta cotada e corte com os DN das ligações)" };
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
    /* 13/11/2026: o isométrico por ambiente (js/hidcaderno.js — planta do ambiente, vista cotada, iso com balões, tabelas de
       tubos e conexões) vem LIGADO: é a folha-modelo do Rogério; desligado, ele gerou e recebeu só o jogo básico sem tags */
    var cj = {}; CONJUNTOS.forEach(function (k) { cj[k] = k !== "isoprancha"; });   /* a prancha única de isométricos é pedida: vem DESLIGADA */
    return { versao: 1, isoFormato: K2.isos.formato, sistemas: [], formato: "AUTO", escala: "auto", prefixo: "HID", revisao: "R00", descricaoRevisao: "EMISSÃO INICIAL - PROJETO EXECUTIVO",
             nivelPlanta: "medio", arquitetura: true, agrupar: true, mostrarCalculo: true, qr: "", portal: "", conjuntos: cj, mosaico: true, contexto: "linhas", perspectiva: { vista: "SE", auto: true, ambientes: [] } };
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
    if (c.mosaico === false) p.mosaico = false;
    if (c.contexto === "translucido") p.contexto = "translucido";   /* o padrão é "linhas": arquitetura e contexto só em arestas, sem preenchimento cinza */   /* ETAPA 2: isométricos pequenos em mosaico e plantas pouco ocupadas juntas (padrão LIGADO) */
    if (c.mostrarCalculo === false) p.mostrarCalculo = false;   /* o cálculo (pressões, UHC) no isométrico: padrão LIGADO */
    if (c.chamadaProduto === false) p.chamadaProduto = false;   /* a chamada com o NOME DO PRODUTO nos registros de todo isométrico: padrão LIGADO (decisão da coordenação, 17/11/2026: é o que a folha de referência mostra) */
    if (txt(c.qr).trim()) p.qr = txt(c.qr).trim();
    if (txt(c.portal).trim()) p.portal = txt(c.portal).trim();   /* link do portal da obra (QR por folha de ambiente); sem ele vale o campo qr */
    p.notasExtra = arr(c.notasExtra).map(txt).filter(function (x) { return x.trim(); });   /* Casa 487 (F9): notas do PROJETO nas NOTAS GERAIS de toda folha (ex.: pilar que o tubo não atravessa) */
    p.sistemas = arr(c.sistemas).filter(function (s) { return SISTEMAS_FOLHA.indexOf(s) >= 0; });
    var pp = c.perspectiva && typeof c.perspectiva === "object" ? c.perspectiva : {};
    /* ETAPA 2: a câmera é AUTOMÁTICA (menor oclusão) por padrão; SO/NO/NE escolhidos à mão valem como estão. SE (o padrão antigo) segue automático, a menos que venha auto:false */
    var vv = txt(pp.vista).toUpperCase();
    if (QUADRANTE[vv] != null) p.perspectiva.vista = vv;
    p.perspectiva.auto = pp.auto !== false && (vv === "" || vv === "AUTO" || vv === "SE");
    p.perspectiva.ambientes = arr(pp.ambientes).map(txt).filter(function (x) { return x; });
    var cj = c.conjuntos && typeof c.conjuntos === "object" ? c.conjuntos : {};
    CONJUNTOS.forEach(function (k) { if (cj[k] === false) p.conjuntos[k] = false; else if ((k === "ambientes" || k === "isoprancha") && cj[k] === true) p.conjuntos[k] = true; });
    if (K2.isos.formatos.indexOf(txt(c.isoFormato).toUpperCase()) >= 0) p.isoFormato = txt(c.isoFormato).toUpperCase();
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
    /* "A<graus>" = órbita livre (azimute qualquer, ETAPA 3); SE/SO/NO/NE = os 4 quadrantes de sempre */
    var mo = /^A(-?[\d.]+)$/.exec(txt(vista)), q = QUADRANTE[vista] == null ? 0 : QUADRANTE[vista], a = mo ? (+mo[1]) * Math.PI / 180 : q * Math.PI / 2, co = Math.cos(a), si = Math.sin(a), C = HI().K.cos, Sn = HI().K.sen;   // hid:ok graus para radianos
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
  /* ------------------------------------------------------------ ETAPA 2 (17/11/2026): CÂMERA ISOMÉTRICA AUTOMÁTICA
   * Entre os 4 quadrantes (SE, SO, NE, NO) escolhe-se o de MENOR OCLUSÃO do tubo do ambiente — a mesma conta do auditor da folha. Oclusão = fração do comprimento de tubo que a
   * foto NÃO mostra: (1) o que cai fora do recorte da frente (a parede da frente é cortada: o tubo embutido nela some), (2) o que outro tubo mais perto da câmera cobre na
   * projeção e (3) o que uma louça mais perto cobre (a louça é translúcida: vale a metade). Amostras ao longo de cada trecho; a conta é geométrica (vale em Node e no app). */
  var VISTAS_AUTO = {};
  var AJ = null, DEF_ATUAL = null, VISTAS_GER = {};   /* ETAPA 3: os ajustes manuais da geração em curso e a folha que está sendo desenhada (zerados no fim de gerar) */
  function trechosDaVista(c, amb, pv) {
    var KI = HI().K, b = { x0: amb.x0, x1: amb.x1, z0: amb.z0, z1: amb.z1 }, f = c.grupo ? 0.12 : 0, b0 = pv.base != null ? pv.base : pv.cota - K2.cortePiso, b1 = pv.sup != null ? pv.sup : pv.topo;
    return arr((c.redeTotal || c.rede) && (c.redeTotal || c.rede).trechos).filter(function (t) {
      var m = { x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }, ym = (t.p1.y + t.p2.y) / 2;
      return t.sistema !== "incendio" && m.x >= b.x0 - f && m.x <= b.x1 + f && m.z >= b.z0 - f && m.z <= b.z1 + f && ym >= b0 - KI.tolPiso_m && ym < b1;
    });
  }
  function recorteTrecho(t, b, f0) {   /* o trecho recortado na caixa do ambiente + a folga (como o desenho): devolve os dois pontos ou null */
    var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, ta = 0, tb = 1, lim = [[-dx, t.p1.x - (b.x0 - f0)], [dx, (b.x1 + f0) - t.p1.x], [-dz, t.p1.z - (b.z0 - f0)], [dz, (b.z1 + f0) - t.p1.z]];
    for (var i = 0; i < 4; i++) { var lp = lim[i][0], lq = lim[i][1]; if (Math.abs(lp) < 1e-12) { if (lq < 0) return null; continue; } var lr = lq / lp; if (lp < 0) { if (lr > ta) ta = lr; } else if (lr < tb) tb = lr; }
    if (tb - ta < 1e-6) return null;
    function em(f) { return { x: t.p1.x + dx * f, y: t.p1.y + (t.p2.y - t.p1.y) * f, z: t.p1.z + dz * f }; }
    return { a: em(ta), b: em(tb) };
  }
  function cascoConvexo(pts) {
    var p = pts.slice().sort(function (u, v) { return u[0] - v[0] || u[1] - v[1]; });
    if (p.length < 3) return p;
    function cr(o, a, b2) { return (a[0] - o[0]) * (b2[1] - o[1]) - (a[1] - o[1]) * (b2[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function pontoNoCasco(q, h) {
    if (h.length < 3) return false;
    for (var i = 0; i < h.length; i++) { var a = h[i], b2 = h[(i + 1) % h.length]; if ((b2[0] - a[0]) * (q[1] - a[1]) - (b2[1] - a[1]) * (q[0] - a[0]) < 0) return false; }
    return true;
  }
  function oclusaoVista(c, amb, pv, vista, trs) {
    var P = projetor(vista), V = P.viewer, fo = K2.folgaAmb, rc = K2.recuoFrente, b = { x0: amb.x0, x1: amb.x1, z0: amb.z0, z1: amb.z1 }, KA = K2.auto, G = GEO();
    /* a caixa de recorte da foto (a mesma do rasterDe): a frente fica na caixa do ambiente, o fundo vai até a folga */
    var cx0 = V[0] > 0 ? b.x0 - fo : b.x0 + rc, cx1 = V[0] > 0 ? b.x1 - rc : b.x1 + fo, cz0 = V[2] > 0 ? b.z0 - fo : b.z0 + rc, cz1 = V[2] > 0 ? b.z1 - rc : b.z1 + fo;
    var segs = [];
    arr(trs).forEach(function (t) {
      var r = recorteTrecho(t, b, fo); if (!r) return;   /* só o que toca a caixa do ambiente (+ margem): o resto da rede não entra na conta de oclusão */
      var k = null; try { k = G ? G.cotasTubo(t.material, t.dn) : null; } catch (e) { k = null; }
      segs.push({ id: t.id, a: r.a, b: r.b, pa: P(r.a), pb: P(r.b), r: ((k && k.de > 0 ? k.de : +t.dn || 20) / 2000), L: dist3d(r.a, r.b) });   // hid:ok mm → m (raio)
    });
    /* a louça de cada família do ambiente: o casco convexo da projeção e a profundidade média (mais perto da câmera = d maior) */
    var cascos = [], est = c.modelo && c.modelo.estado, b0 = pv.base != null ? pv.base : pv.cota - K2.cortePiso, b1 = pv.sup != null ? pv.sup : pv.topo;
    if (est && typeof c.modelo.avaliarFam === "function") arr(est.familias).forEach(function (fi) {
      if (!(fi.x >= b.x0 && fi.x <= b.x1 && fi.z >= b.z0 && fi.z <= b.z1 && fi.y >= b0 - HI().K.tolPiso_m && fi.y < b1)) return;
      var av = null; try { av = c.modelo.avaliarFam(fi.famId, fi.tipoId, fi.inst || {}); } catch (e) { av = null; }
      if (!av || !av.ok) return;
      var pts = [], dm = 0, nd = 0;
      try { linhasFamilia(fi, av, P.viewer).forEach(function (sg) { [sg[0], sg[1]].forEach(function (q) { var pq = P({ x: q[0], y: q[1], z: q[2] }); pts.push([pq.u, pq.v]); dm += pq.d; nd++; }); }); } catch (e2) { pts = []; }
      if (pts.length >= 3 && nd) cascos.push({ h: cascoConvexo(pts), d: dm / nd });
    });
    var tot = 0, fora = 0, sob = 0, lou = 0;
    segs.forEach(function (s, i) {
      var N = Math.min(KA.maxAmostras, Math.max(2, Math.ceil(s.L / KA.passo))), w = s.L / N;
      for (var kk = 0; kk < N; kk++) {
        var f = (kk + 0.5) / N, q = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f, z: s.a.z + (s.b.z - s.a.z) * f }, pq = P(q); tot += w;
        if (q.x < cx0 || q.x > cx1 || q.z < cz0 || q.z > cz1) { fora += w; continue; }
        var cob = false;
        for (var j = 0; j < segs.length && !cob; j++) {
          if (j === i) continue; var s2 = segs[j];
          /* perto de um nó em comum os dois tubos se sobrepõem na projeção por natureza (a conexão): não conta */
          var nos = [[s.a, s2.a], [s.a, s2.b], [s.b, s2.a], [s.b, s2.b]], noC = false;
          nos.forEach(function (pr) { if (dist3d(pr[0], pr[1]) < 0.02 && dist3d(q, pr[0]) < KA.noRaio) noC = true; });
          if (noC) continue;
          var ux = s2.pb.u - s2.pa.u, uy = s2.pb.v - s2.pa.v, L2 = ux * ux + uy * uy, lam = L2 > 1e-12 ? Math.max(0, Math.min(1, ((pq.u - s2.pa.u) * ux + (pq.v - s2.pa.v) * uy) / L2)) : 0;
          var qx = s2.pa.u + ux * lam, qy = s2.pa.v + uy * lam, dd = Math.sqrt(Math.pow(pq.u - qx, 2) + Math.pow(pq.v - qy, 2)), d2 = s2.pa.d + (s2.pb.d - s2.pa.d) * lam;
          if (dd < s.r + s2.r && d2 > pq.d + (s.r + s2.r) * 0.5) cob = true;
        }
        if (cob) { sob += w; continue; }
        for (var h = 0; h < cascos.length; h++) if (pq.d < cascos[h].d && pontoNoCasco([pq.u, pq.v], cascos[h].h)) { lou += w * KA.pesoLouca; break; }
      }
    });
    return { oculto: tot > 0 ? Math.min(1, (fora + sob + lou) / tot) : 0, fora: tot > 0 ? fora / tot : 0, tubo: tot > 0 ? sob / tot : 0, louca: tot > 0 ? lou / tot : 0, comprimento: tot };
  }
  /* o melhor dos 4 quadrantes para o ambiente (desempate pela ordem SE, SO, NE, NO); o resultado fica guardado por (ambiente, pavimento, trechos) */
  function vistaAuto(c, amb, pv) {
    var trs = trechosDaVista(c, amb, pv), chave = [pv.cota, amb.x0, amb.x1, amb.z0, amb.z1, trs.map(function (t) { return t.id; }).sort().join(",")].map(function (v) { return typeof v === "number" ? Math.round(v * 1000) : v; }).join("|");
    if (VISTAS_AUTO[chave]) return VISTAS_AUTO[chave];
    var pontos = {}, melhor = null;
    K2.auto.ordem.forEach(function (v) {
      var o = trs.length ? oclusaoVista(c, amb, pv, v, trs) : { oculto: 0, comprimento: 0 };
      pontos[v] = Math.round(o.oculto * 1000) / 1000;
      if (!melhor || o.oculto < melhor.o.oculto - K2.auto.empate) melhor = { v: v, o: o };
    });
    return (VISTAS_AUTO[chave] = { vista: melhor.v, oculto: melhor.o.oculto, comprimento: melhor.o.comprimento, pontos: pontos });
  }
  function perspectivaDe(c, amb, pv) {
    var infoAuto = null, vista0 = (c.cfg && c.cfg.perspectiva && c.cfg.perspectiva.vista) || "SE";
    /* ETAPA 3: o ajuste MANUAL desta vista (câmera, crop, o que se esconde) vale por cima do automático e sobrevive ao regerar */
    var chaveV = c.chaveVista || (EDT() ? EDT().chaveVista(amb, c.grupo, pv) : ""), ajV = AJ && AJ.vistas && chaveV ? AJ.vistas[chaveV] || null : null, azV = ajV && ajV.cam ? EDT().anguloDe(ajV.cam) : null;
    if (azV != null) vista0 = ajV.cam.az != null ? "A" + ajV.cam.az : ajV.cam.vista;
    else if (!c.vistaForcada && c.cfg && c.cfg.perspectiva && c.cfg.perspectiva.auto === true) { infoAuto = vistaAuto(c, amb, pv); vista0 = infoAuto.vista; }
    var est = c.modelo.estado, B = BI(), G = GEO(), vista = azV != null ? vista0 : (c.vistaForcada || vista0), P = projetor(vista);
    var b = { x0: amb.x0, x1: amb.x1, z0: amb.z0, z1: amb.z1 }, KI = HI().K, caixaAuto = { x0: amb.x0, x1: amb.x1, z0: amb.z0, z1: amb.z1 };
    if (ajV && ajV.crop) { var cr = ajV.crop; if (cr.x0 != null) b.x0 = cr.x0; if (cr.x1 != null) b.x1 = cr.x1; if (cr.z0 != null) b.z0 = cr.z0; if (cr.z1 != null) b.z1 = cr.z1; }
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
    caixaAuto.y0 = yB; caixaAuto.y1 = yT;
    if (ajV && ajV.crop) { if (ajV.crop.y0 != null) yB = ajV.crop.y0; if (ajV.crop.y1 != null) yT = ajV.crop.y1; }   /* ETAPA 3: a PROFUNDIDADE (de baixo e de cima) escolhida à mão */
    if (chaveV) VISTAS_GER[chaveV] = { chave: chaveV, vista: vista, caixaAuto: caixaAuto, caixa: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: yB, y1: yT }, ajustada: !!ajV, pav: txt(pv && pv.nome) };   /* a tela do ajuste lê daqui o recorte automático e o atual */
    var paredesIso = [], par3d = [], faces = [], itens = [], cBox = P({ x: (b.x0 + b.x1) / 2, y: 0, z: (b.z0 + b.z1) / 2 }).d;
    /* os dois lados do FUNDO do cômodo (os de menor profundidade para quem olha) e a parede que está NELES: devolve o nome do lado ('x0','x1','z0','z1'),
       null (parede inclinada: segue a regra antiga) ou false (parede que não é uma das duas do fundo) */
    var ladosFundo = [];
    [{ k: "x0", ax: "x", v: b.x0, z: (b.z0 + b.z1) / 2 }, { k: "x1", ax: "x", v: b.x1, z: (b.z0 + b.z1) / 2 }, { k: "z0", ax: "z", v: b.z0, x: (b.x0 + b.x1) / 2 }, { k: "z1", ax: "z", v: b.z1, x: (b.x0 + b.x1) / 2 }].forEach(function (l) {
      var pt = l.ax === "x" ? { x: l.v, y: 0, z: l.z } : { x: l.x, y: 0, z: l.v }; if (P(pt).d < cBox - 1e-9) ladosFundo.push(l);
    });
    function ladoDeFundo(r, w) {
      var tolW = (w.esp || 0.15) + 0.1, alongX = Math.abs(r.a[1] - r.b[1]) < 1e-3, alongZ = Math.abs(r.a[0] - r.b[0]) < 1e-3;
      if (!alongX && !alongZ) return null;
      for (var i = 0; i < ladosFundo.length; i++) {
        var l = ladosFundo[i];
        if (l.ax === "x" && alongZ && Math.abs(r.a[0] - l.v) <= tolW) return l.k;
        if (l.ax === "z" && alongX && Math.abs(r.a[1] - l.v) <= tolW) return l.k;
      }
      return false;
    }
    /* arquitetura: piso e paredes recortadas pela caixa (até a altura do tubo mais alto + folga) */
    paredesDoPav(est, pv).forEach(function (w) {
      var r = recortaEixo(w, { x0: b.x0 - w.esp, x1: b.x1 + w.esp, z0: b.z0 - w.esp, z1: b.z1 + w.esp }); if (!r) return;
      /* só as paredes do FUNDO (as da frente cortadas, como na perspectiva de banheiro das pranchas de projeto) */
      if (P({ x: (r.a[0] + r.b[0]) / 2, y: 0, z: (r.a[1] + r.b[1]) / 2 }).d > cBox + K2.perspFrente) return;
      /* 15/11/2026 (o Rogério): SÓ DUAS paredes — as duas faces do fundo do cômodo (a dos tubos e a lateral ao lado); pedaço de parede de outro cômodo que cruza o recorte não entra */
      var ladoW = ladoDeFundo(r, w);
      if (ladoW === false) return;
      if (ladoW) { if (paredesIso.indexOf(ladoW) < 0) paredesIso.push(ladoW); }
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
    return { auto: infoAuto, paredesIso: paredesIso, dCentro: cBox, faces: faces, piso: piso, itens: itens, loucas: loucas, trs: trs, pontos: pontos, acess: acess, P: P, vista: vista, vistaNome: /^A/.test(vista) ? "órbita " + vista.slice(1) + "°" : vista, pv: pv, b: b, yB: yB, yT: yT, par3d: par3d, chave: chaveV, ajuste: ajV };
  }
  /* 14/11/2026 — O ISOMÉTRICO DE SISTEMA COM O DESENHO DO MODELO (o Rogério: "a prancha tem que sair do mesmo jeito que está no
     sistema; está saindo o tracejado estranho"). O isométrico de linha (js/hidisometrico.js: duas linhas finas e tique de
     joelho) passa a ser a PERSPECTIVA dos mesmos trechos — tubo com o DE real na cor do sistema, conexão, caixa e louça, como a
     tela e a perspectiva do ambiente. A caixa do recorte é a dos trechos do desenho; a altura vai do mais baixo ao mais alto. */
  function perspectivaDoIso(c, d) {
    var ids = {}; arr(d.trechos).forEach(function (id) { ids[id] = 1; });
    var trs = arr(c.rede.trechos).filter(function (t) { return ids[t.id]; });
    if (!trs.length) return null;
    var xs = [], zs = [], ys = [], sis = {}; trs.forEach(function (t) { xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); ys.push(t.p1.y, t.p2.y); sis[t.sistema] = 1; });
    var fo = K2.folgaAmb, amb = { x0: Math.min.apply(null, xs) - fo, x1: Math.max.apply(null, xs) + fo, z0: Math.min.apply(null, zs) - fo, z1: Math.max.apply(null, zs) + fo };
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), pv0 = null;
    arr(c.pavs).forEach(function (p) { if (p.cota <= y0 + K2.cortePiso && (!pv0 || p.cota > pv0.cota)) pv0 = p; });
    pv0 = pv0 || arr(c.pavs)[0] || { nome: "", cota: 0 };
    var pv = {}; for (var k in pv0) if (Object.prototype.hasOwnProperty.call(pv0, k)) pv[k] = pv0[k];
    pv.base = y0 - K2.cortePiso; pv.sup = y1 + K2.cortePiso;
    /* a rede SÓ do desenho: os trechos dele, e conexão/peça/ponto/acessório dos sistemas dele */
    var r = {}; for (var q in c.rede) if (Object.prototype.hasOwnProperty.call(c.rede, q)) r[q] = c.rede[q];
    r.trechos = trs;
    r.conexoes = arr(c.rede.conexoes).filter(function (x) { return sis[x.sistema]; });
    r.pecas = arr(c.rede.pecas).filter(function (x) { return !x.sistema || sis[x.sistema]; });
    r.ligacoes = arr(c.rede.ligacoes).filter(function (l) { return ids[l.trecho]; });
    r.acessorios = arr(c.rede.acessorios).filter(function (a) { return !a.sistema || sis[a.sistema]; });
    var cc = {}; for (var m in c) if (Object.prototype.hasOwnProperty.call(c, m)) cc[m] = c[m];
    cc.rede = r;
    if (EDT()) cc.chaveVista = EDT().chaveIso(d.titulo);   /* ETAPA 3: o isométrico de sistema é achado pelo TÍTULO, que não depende da ordem das folhas */
    return perspectivaDe(cc, amb, pv);
  }
  /* 14/11/2026 — A FOTO DO MODELO NA PERSPECTIVA: com FOTO3D (a geração no app passa BIM.fotoIso), cada perspectiva e cada isométrico
     é a IMAGEM DA CENA DO BIM no mesmo enquadramento da projeção — a peça como está na tela (o Rogério: "igual tá na visualização do
     sistema"). Sem o 3D aberto (Node, teste), segue o desenho vetorial de antes. As imagens vão para o PDF por chave (IMAGENS). */
  var FOTO3D = null, IMAGENS = null;
  /* O QUE EXISTE NO PROJETO (15/11/2026, auditoria do PDF real): legenda, títulos e detalhes típicos só falam do que a rede/o modelo TÊM (sem ventilação, caixa de
     gordura, redução, curva de transposição… quando não há). Preenchido em gerar() e zerado no fim; null = sem filtro (chamadas avulsas). */
  var EXISTE = null;
  function existeDe(rede, modelo) {
    var e = { sis: {}, cx: {}, pecas: {}, acess: {}, fam: {} };
    arr(rede && rede.trechos).forEach(function (t) { e.sis[t.sistema] = 1; });
    arr(rede && rede.conexoes).forEach(function (k) { e.cx[txt(k.tipo)] = 1; });
    arr(rede && rede.pecas).forEach(function (k) { e.pecas[txt(k.peca)] = 1; if (/^(cap|plugue|tampao)/.test(txt(k.peca))) e.cx.cap = 1; });
    arr(rede && rede.acessorios).forEach(function (a) { e.acess[txt(a.acessorio)] = 1; });
    arr(modelo && modelo.estado && modelo.estado.familias).forEach(function (f) { e.fam[txt(f.famId)] = 1; });
    return e;
  }
  /* a linha da legenda existe no projeto? (chave = a de legendaItens) */
  function legendaExiste(k) {
    var e = EXISTE; if (!e) return true;
    var cx = function () { for (var i = 0; i < arguments.length; i++) if (e.cx[arguments[i]]) return true; return false; };
    var m = /^sis:(.+)$/.exec(k); if (m) return !!e.sis[m[1]];
    switch (k) {
      case "linhaVE": return !!e.sis.ventilacao;
      case "rg": return !!e.acess.registro_gaveta; case "rp": return !!e.acess.registro_pressao;
      case "registro": return !!(e.acess.registro_esfera || e.acess.valvula_retencao);
      case "cx:joelho90": return cx("joelho90", "joelho45"); case "cx:curva90": return cx("curva90", "curva45");
      case "cx:te": return cx("te", "te_reducao", "te_inspecao"); case "cx:juncao": return cx("juncao", "juncao_reducao");
      case "cx:luva": return cx("luva", "uniao"); case "cx:reducao": return cx("reducao", "juncao_reducao", "te_reducao");
      case "cx:cap": return cx("cap"); case "cx:curva_transposicao": return cx("curva_transposicao");
      case "caixa": return Object.keys(e.pecas).length > 0;
      default: return true;
    }
  }
  function limitesPersp(pz) {
    var us = [], vs = [];
    function junta(p) { us.push(p.u); vs.push(p.v); }
    pz.faces.forEach(function (f) { f.pts.forEach(junta); }); pz.piso.forEach(junta);
    pz.itens.forEach(function (it) { if (it.pts) it.pts.forEach(junta); if (it.a) { junta(it.a); junta(it.b); } if (it.p) junta(it.p); });
    pz.loucas.forEach(function (sg) { junta(pz.P({ x: sg[0][0], y: sg[0][1], z: sg[0][2] })); junta(pz.P({ x: sg[1][0], y: sg[1][1], z: sg[1][2] })); });
    return { u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), v0: Math.min.apply(null, vs), v1: Math.max.apply(null, vs) };
  }
  /* a foto de CIMA do modelo para a planta: u = x·s, v = z·s (o mesmo papel do vetor), recorte do piso até acima do tubo mais alto */
  function fotoPlanta(c, sis, trs, pv, bb, s2, opc) {
    if (!FOTO3D || !trs || !trs.length) return null;
    var ys = []; trs.forEach(function (t) { ys.push(t.p1.y, t.p2.y); });
    var yMin = Math.min(pv.cota, Math.min.apply(null, ys)) - K2.fotoPlanta.abaixo, yMax = Math.min(Math.max.apply(null, ys) + K2.fotoPlanta.acima, pv.cota + K2.fotoPlanta.teto);
    var x0 = bb.x0 / s2, x1 = bb.x1 / s2, z0 = bb.y0 / s2, z1 = bb.y1 / s2, tc = { x: (x0 + x1) / 2, y: (yMin + yMax) / 2, z: (z0 + z1) / 2 };
    var foco = /^agua/.test(String(sis)) ? ["agua"] : sis === "esgoto" || sis === "ventilacao" ? ["esgoto"] : ["agua", "esgoto"];
    var r = null; try { r = FOTO3D({ foco: foco, loucasTransl: true, reservTransl: !!(opc && opc.reservTransl), pisoOp: K2.pisoOp, pecaOp: K2.pecaOp, R: [s2, 0, 0], U: [0, 0, -s2], V: [0, 1, 0], T: [tc.x, tc.y, tc.z], uT: tc.x * s2, vT: tc.z * s2, u0: bb.x0, u1: bb.x1, v0: bb.y0, v1: bb.y1,
      largura: Math.min(4096, Math.round((bb.x1 - bb.x0) * K2.fotoPlanta.pxMm)), min: [x0 - 0.05, yMin, z0 - 0.05], max: [x1 + 0.05, yMax, z1 + 0.05] }); } catch (e) { r = null; }
    if (!r || !r.ok || !r.url) return null;
    var b64 = String(r.url).replace(/^data:image\/jpeg;base64,/, ""), bin = typeof atob === "function" ? atob(b64) : (typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("binary") : null);
    if (!bin) return null;
    IMAGENS = IMAGENS || {}; var key = "f" + (Object.keys(IMAGENS).length + 1);
    IMAGENS[key] = { jpeg: bin, pxW: r.w, pxH: r.h };
    return { key: key, href: r.url };
  }
  /* recorte de polígono num retângulo (o mesmo do caderno) */
  function clipPoly(pts, b) {
    var out = pts.slice();
    function passa(entrada, dentro, inter) {
      var res = [];
      for (var i = 0; i < entrada.length; i++) {
        var a = entrada[i], c = entrada[(i + 1) % entrada.length], da = dentro(a), dc = dentro(c);
        if (da) res.push(a);
        if (da !== dc) res.push(inter(a, c));
      }
      return res;
    }
    out = passa(out, function (p) { return p[0] >= b.x0; }, function (a, c) { var t = (b.x0 - a[0]) / (c[0] - a[0]); return [b.x0, a[1] + t * (c[1] - a[1])]; });
    if (out.length) out = passa(out, function (p) { return p[0] <= b.x1; }, function (a, c) { var t = (b.x1 - a[0]) / (c[0] - a[0]); return [b.x1, a[1] + t * (c[1] - a[1])]; });
    if (out.length) out = passa(out, function (p) { return p[1] >= b.z0; }, function (a, c) { var t = (b.z0 - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.z0]; });
    if (out.length) out = passa(out, function (p) { return p[1] <= b.z1; }, function (a, c) { var t = (b.z1 - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.z1]; });
    return out;
  }
  /* hachura a 45° (no papel) num polígono convexo: as retas paralelas cortadas pelas arestas */
  function hachura(D, P, passo) {
    if (!P || P.length < 3) return;
    var dx = Math.SQRT1_2, dy = -Math.SQRT1_2, nx = -dy, ny = dx, ts = P.map(function (q) { return q[0] * nx + q[1] * ny; });
    var t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts);
    for (var t = Math.ceil(t0 / passo) * passo; t < t1; t += passo) {
      var cut = [];
      for (var i = 0; i < P.length; i++) { var A = P[i], B = P[(i + 1) % P.length], ta = ts[i], tb = ts[(i + 1) % P.length]; if ((ta - t) * (tb - t) < 0) { var f = (t - ta) / (tb - ta); cut.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]); } }
      if (cut.length >= 2) D.add('<line x1="' + n(cut[0][0]) + '" y1="' + n(cut[0][1]) + '" x2="' + n(cut[1][0]) + '" y2="' + n(cut[1][1]) + '" stroke="#8a8f96" stroke-width="0.09" data-cam="HID-CONTEXTO"/>');
    }
  }
  function rasterDe(pz) {
    if (!FOTO3D || !pz || !pz.P) return null;
    var P = pz.P, O = P({ x: 0, y: 0, z: 0 }), ex = P({ x: 1, y: 0, z: 0 }), ey = P({ x: 0, y: 1, z: 0 }), ez = P({ x: 0, y: 0, z: 1 });
    var R = [ex.u - O.u, ey.u - O.u, ez.u - O.u], U = [-(ex.v - O.v), -(ey.v - O.v), -(ez.v - O.v)], V = P.viewer;
    var lim = limitesPersp(pz), mg = (lim.u1 - lim.u0) * 0.04; lim.u0 -= mg; lim.u1 += mg; lim.v0 -= mg; lim.v1 += mg;
    var fo = K2.folgaAmb, b = pz.b, tc = { x: (b.x0 + b.x1) / 2, y: (pz.yB + pz.yT) / 2, z: (b.z0 + b.z1) / 2 }, pt = P(tc);
    /* o sistema da FOLHA vai em cor (a da legenda: esgoto VERDE), o outro em meio-tom (o Rogério, HID-R00 (51), 14/11/2026) */
    var foco = []; arr(pz.trs).forEach(function (t) { var g = /^agua/.test(t.sistema) ? "agua" : "esgoto"; if (foco.indexOf(g) < 0) foco.push(g); });
    var ocV = pz.ajuste && pz.ajuste.oculto ? pz.ajuste.oculto : null;   /* ETAPA 3: categorias, disciplinas e peças que o usuário escondeu nesta vista */
    var r = null; try { r = FOTO3D({ foco: foco.length ? foco : ["agua", "esgoto"], semArquitetura: true, loucasTransl: true, reservTransl: true, pisoOp: K2.pisoOp, pecaOp: K2.pecaOp, R: R, U: U, V: V, T: [tc.x, tc.y, tc.z], uT: pt.u, vT: pt.v, u0: lim.u0, u1: lim.u1, v0: lim.v0, v1: lim.v1,
      ocultar: ocV && (ocV.cats.length || ocV.discs.length || ocV.uids.length) ? { cats: ocV.cats, discs: ocV.discs, uids: ocV.uids } : undefined,
      /* a parede da FRENTE (do lado de quem olha) fica fora do recorte e a do FUNDO entra: o fundo aparece limpo (o Rogério: "a parede na frente você oculta") */
      min: [V[0] > 0 ? b.x0 - fo : b.x0 + K2.recuoFrente, pz.yB - 0.05, V[2] > 0 ? b.z0 - fo : b.z0 + K2.recuoFrente],
      max: [V[0] > 0 ? b.x1 - K2.recuoFrente : b.x1 + fo, pz.yT + K2.perspTopo, V[2] > 0 ? b.z1 - K2.recuoFrente : b.z1 + fo] }); } catch (e) { r = null; }
    if (!r || !r.ok || !r.url) return null;
    var b64 = String(r.url).replace(/^data:image\/jpeg;base64,/, ""), bin = typeof atob === "function" ? atob(b64) : (typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("binary") : null);
    if (!bin) return null;
    IMAGENS = IMAGENS || {}; var key = "f" + (Object.keys(IMAGENS).length + 1);
    IMAGENS[key] = { jpeg: bin, pxW: r.w, pxH: r.h };
    return { key: key, href: r.url, jpeg: bin, pxW: r.w, pxH: r.h, u0: lim.u0, u1: lim.u1, v0: lim.v0, v1: lim.v1 };
  }
  /* ------------------------------------------------------------ ESQUEMA ISOMÉTRICO POR AMBIENTE (14/11/2026, referência do Rogério:
   * "fica a planta, chapada assim, e focando só nas questões técnicas: a altura que sai o ponto"). A planta do ambiente CHAPADA no
   * piso (paredes e louças do modelo, o nome do cômodo), a tubulação em LINHA ÚNICA na cor do sistema, o DN ao longo do tubo, a
   * altura de cada ponto e registro numa CHAMADA tracejada ("+0,60" sobre o traço) e a sigla da peça (LV, CH, BCA, RG, RP). */
  function esquemaIsoDe(c, amb, pv, sisL) {
    var cc = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cc[k] = c[k];
    var r = {}; for (var q in c.rede) if (Object.prototype.hasOwnProperty.call(c.rede, q)) r[q] = c.rede[q];
    var quer = {}; sisL.forEach(function (x) { quer[x] = 1; });
    r.trechos = arr(c.rede.trechos).filter(function (t) { return quer[t.sistema]; });
    r.conexoes = arr(c.rede.conexoes).filter(function (x) { return quer[x.sistema]; });
    r.pecas = arr(c.rede.pecas).filter(function (x) { return quer[x.sistema]; });
    var idsT = {}; r.trechos.forEach(function (t) { idsT[t.id] = 1; });
    r.ligacoes = arr(c.rede.ligacoes).filter(function (l) { return idsT[l.trecho]; });
    r.acessorios = arr(c.rede.acessorios).filter(function (a) { return !a.sistema || quer[a.sistema]; });
    cc.rede = r; cc.redeTotal = c.redeTotal || c.rede;
    /* o prumo (ventilação, coluna) sai INTERROMPIDO logo acima do ponto mais alto do cômodo: o desenho fica no que interessa */
    var hs = [K2.esquema.alturaMin]; r.ligacoes.forEach(function (l) { if (l.tipo === "aparelho" && l.y != null) hs.push(l.y - pv.cota); });
    r.acessorios.forEach(function (ac) { if (ac.centro) hs.push(ac.centro.y - pv.cota); });
    cc.cortaY = Math.max.apply(null, hs) + K2.esquema.folgaTopo;
    if (EDT()) cc.chaveVista = EDT().chaveVista(amb, sisL.join("+"), pv, "esq");   /* ETAPA 3: o esquema (linha única) é OUTRA vista do mesmo ambiente: ajuste próprio */
    var pz = perspectivaDe(cc, amb, pv); if (!pz) return null;
    pz.esquema = true; pz.sisL = sisL; pz.amb = amb;
    return pz;
  }
  /* ------------------------------------------------------------ FOLHA "RESERVATÓRIO" (15/11/2026, pedido do Rogério)
   * Uma folha por caixa d'água/reservatório do modelo (caixasReais): PLANTA da região da caixa (a foto de cima do modelo, parede só em contorno)
   * com as cotas da caixa até as FACES INTERNAS das paredes nas duas direções (o mesmo estilo das cotas de locação do caderno) e CORTE (o perfil
   * da caixa na proporção da família colocada) com a cota da base até o piso/laje e os balões de DN de cada ligação. Título embaixo, com a escala. */
  /* O BARRILETE DA CAIXA no modelo (ids "bar-<caixa>-<parte>-<n>" do js/hidbarrilete.js): tubos com o DN do DIMENSIONAMENTO (c.ix), os
     registros (rg-saida/coluna/limpeza/alimentacao) e as COLUNAS que descem dele (nome AF-n do mesmo critério do esquema vertical) */
  var PARTES_BAR = "saida|tomada|barrilete|coletor|coluna|ventilacao|extravasor|limpeza|alimentacao|respiro";
  function escRx(v) { return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  /* a PARTE do barrilete se o id é EXATAMENTE "bar-<caixa>-<parte>-<n>" (15/11/2026: "bar-cx-" não pega "bar-cx-2-saida-101", de outra caixa) */
  function parteBar(id, cxId) { var m = new RegExp("^bar-" + escRx(cxId) + "-(" + PARTES_BAR + ")-\\d+b?$").exec(id); return m ? m[1] : null; }
  function barrileteDaCaixa(c, q) {
    var pre = "bar-" + q.id + "-", ixAF = (c.ix && c.ix.agua_fria) || {}, out = { tubos: [], regs: [], colunas: [] };
    var outras = caixasReais(c.modelo).filter(function (o) { return o.id !== q.id; });
    arr(c.rede && c.rede.trechos).forEach(function (t) {
      var id = txt(t.id); if (!t.p1 || !t.p2) return;
      var parte = parteBar(id, q.id), alheio = false;
      /* a INTERLIGAÇÃO entre caixas (o coletor lançado no barrilete de outra caixa do grupo) aparece também nesta folha */
      if (!parte) { outras.forEach(function (o) { if (!parte && parteBar(id, o.id) === "coletor") { parte = "coletor"; alheio = true; } }); }
      if (!parte) return;
      var inf = ixAF[id], dn = num(inf && inf.dn, null) || num(t.dn, null);
      out.tubos.push({ id: id, parte: parte, p1: t.p1, p2: t.p2, dn: dn, interlig: alheio });
    });
    arr(c.rede && c.rede.acessorios).forEach(function (a) {
      var id = txt(a.id), m = /^bar-.+-rg-(saida|coluna|limpeza|alimentacao)-\d+/.exec(id);
      if (m && a.centro && new RegExp("^bar-" + escRx(q.id) + "-rg-").test(id)) out.regs.push({ id: id, parte: m[1], centro: a.centro, dn: num(a.dn, null) });
    });
    var cols = out.tubos.filter(function (t) { return t.parte === "coluna"; }).map(function (t) {
      var cl = c.colunas && c.colunas[t.id];
      return { id: t.id, x: t.p1.x, z: t.p1.z, topo: Math.max(t.p1.y, t.p2.y), base: Math.min(t.p1.y, t.p2.y), dn: t.dn, nome: cl && cl.nome ? cl.nome : null };
    });
    var chaves = {}; cols = cols.filter(function (k) { var kk = Math.round(k.x * 100) + "," + Math.round(k.z * 100); if (chaves[kk]) { if (k.dn != null && (chaves[kk].dn == null || k.dn > chaves[kk].dn)) chaves[kk].dn = k.dn; return false; } chaves[kk] = k; return true; });   /* o registro parte a coluna em dois tubos: uma coluna só */
    cols.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    var vistos = {}; cols.forEach(function (k) { if (k.nome) vistos[k.nome] = (vistos[k.nome] || 0) + 1; });
    if (cols.some(function (k) { return !k.nome || vistos[k.nome] > 1; })) cols.forEach(function (k, i) { k.nome = "AF-" + (i + 1); });   /* nome repetido (duas colunas na mesma prumada): numera em ordem */
    out.colunas = cols;
    return out;
  }
  /* o segmento (x,z) recortado na caixa; null se fica todo fora (Liang-Barsky) */
  function clipSegCaixa(x0, z0, x1, z1, bx0, bx1, bz0, bz1) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dz = z1 - z0, Pp = [-dx, dx, -dz, dz], Qq = [x0 - bx0, bx1 - x0, z0 - bz0, bz1 - z0];
    for (var i = 0; i < 4; i++) {
      if (Pp[i] === 0) { if (Qq[i] < 0) return null; continue; }
      var r = Qq[i] / Pp[i]; if (Pp[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, z0 + t0 * dz, x0 + t1 * dx, z0 + t1 * dz];
  }
  function ligacoesCaixa(c, q) {
    var est = c.modelo && c.modelo.estado, aval = c.modelo && c.modelo.avaliarFam, out = { alim: { tubo: false }, cons: { tubo: false }, extr: { tubo: false }, limp: { tubo: false } }, fam = null, cons = [], av = null;
    arr(est && est.familias).forEach(function (f) { if (txt(f.id) === q.id) fam = f; });
    if (fam && typeof aval === "function") { try { av = aval(fam.famId, fam.tipoId, fam.inst || {}) || {}; cons = arr(av.conectores); } catch (e) { cons = []; av = null; } }
    function cxo(re) { return cons.filter(function (k) { return re.test(txt(k.id)); })[0] || null; }
    var kk = { alim: cxo(K2.reserv.reAlim), cons: cxo(K2.reserv.reCons), extr: cxo(K2.reserv.reExtr), limp: cxo(K2.reserv.reLimp) };
    Object.keys(kk).forEach(function (k) { if (kk[k]) { out[k].y = num(kk[k].y, null); out[k].dn = num(kk[k].dn, 0) > 0 ? num(kk[k].dn, null) : null; }   /* DN 0 = "o dimensionamento define" (família): sem DN */ });
    var ixAF = (c.ix && c.ix.agua_fria) || {};
    function dnDoTrecho(t) { var infT = ixAF[txt(t.id)]; return num(infT && infT.dn, null) || num(t.dn, null); }   /* o DN do DIMENSIONAMENTO vale mais que o lançado */
    /* o DN do tubo que o barrilete lançou (barParte) vale mais que o do conector da família */
    arr(est && est.instalacoes && est.instalacoes.trechos).forEach(function (t) {
      /* o id do trecho do barrilete é "bar-<caixa>-<parte>-<n>" (js/hidbarrilete.js novoId): o estado aplicado nem sempre guarda bar/barParte */
      Object.keys(K2.reserv.parte).forEach(function (k) {
        var dnT0 = dnDoTrecho(t);
        if ((txt(t.bar) === q.id && txt(t.barParte) === K2.reserv.parte[k]) || parteBar(txt(t.id), q.id) === K2.reserv.parte[k]) { out[k].tubo = true; if (dnT0 > 0) out[k].dn = dnT0; }
      });
    });
    /* 15/11/2026 (2ª caixa interligada saía "DN ?"): a ligação que o barrilete não numerou com o id da caixa (satélite, tubo lançado à mão) vale pelo
       TUBO QUE TOCA O CONECTOR da caixa no modelo: o DN dele (do dimensionamento, senão o lançado) é o da ligação */
    var BIm = BI(), cw = [];
    if (BIm && BIm.conectoresDe && av && fam) { try { cw = BIm.conectoresDe(av, { id: fam.id, x: fam.x, y: fam.y, z: fam.z, rotY: fam.rotY != null ? fam.rotY : (fam.inst && fam.inst.rotY) }); } catch (e2) { cw = []; } }
    Object.keys(out).forEach(function (k) {
      if (out[k].tubo) return;
      var re = K2.reserv["re" + ({ alim: "Alim", cons: "Cons", extr: "Extr", limp: "Limp" })[k]];
      cw.filter(function (w) { return re.test(txt(w.id).split(":").pop()); }).forEach(function (w) {
        arr(est && est.instalacoes && est.instalacoes.trechos).forEach(function (t) {
          if (out[k].tubo && out[k].dn != null && !(dnDoTrecho(t) > out[k].dn)) return;
          if (!t.p1 || !t.p2 || (Math.min(dist3d(t.p1, w), dist3d(t.p2, w)) > K2.reserv.tolConector)) return;
          out[k].tubo = true; var d = dnDoTrecho(t); if (d > 0) out[k].dn = d;
        });
      });
    });
    return out;
  }
  /* o pavimento de apoio da caixa: o mais alto cuja cota não passa da base da caixa */
  function pavDaCaixa(c, q) {
    var pv = c.pavs[0]; c.pavs.forEach(function (p) { if (p.cota <= q.y + K2.reserv.tolPav) pv = p; });
    return pv;
  }
  function altTituloVista() { var TT = D0().E.T, R = K2.reserv; return TT.titulo * R.fracTit + TT.escala * R.fracEsc + R.folgaTit; }
  /* A PLANTA: devolve { w, h, desenhar(D, x, y, chk) } na escala s (mm de papel por metro) */
  function plantaReservatorio(c, q, lig, pv, s) {
    var R = K2.reserv, GA = dep("ArqGeo", "./arqgeo.js"), La = null, TT = D0().E.T, AP = c.AP, esc = Math.round(1000 / s);   // hid:ok mm de papel por metro → denominador
    try { La = listasArq(c, pv); } catch (e0) { La = null; }
    var m = (q.diametro || K2.isos.caixaMeia * 2) / 2, alt = q.altura || 0, cx = q.x, cz = q.z, paredes = La ? La.paredes : [];
    function dentro(x, z) { return !!GA && paredes.some(function (w) { return GA.pontoEmPol([x, z], w.pts); }); }
    /* primeiro cruzamento do raio com as arestas das paredes: a FACE INTERNA; null se não há parede até o alcance ou se o ponto está cravado na parede */
    function raio(px, pz, dx, dz) {
      var best = null;
      paredes.forEach(function (w) {
        var p = w.pts;
        for (var i = 0; i < p.length; i++) {
          var a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
          if (Math.abs(den) < R.epsRaio) continue;
          var t = ((a[0] - px) * ez - (a[1] - pz) * ex) / den, u = ((a[0] - px) * dz - (a[1] - pz) * dx) / den;
          if (t > R.epsRaio && u >= 0 && u <= 1 && (best == null || t < best)) best = t;
        }
      });
      if (best == null || best > R.alcance || dentro(px + dx * best / 2, pz + dz * best / 2)) return null;
      return best;
    }
    function ach(px, pz, dx, dz) { return dentro(px, pz) ? null : raio(px, pz, dx, dz); }
    var tA = ach(cx - m, cz, -1, 0), tB = ach(cx + m, cz, 1, 0), uA = ach(cx, cz - m, 0, -1), uB = ach(cx, cz + m, 0, 1);
    var mp = R.margemParede, bx0 = cx - m - (tA != null ? tA + mp : R.folga), bx1 = cx + m + (tB != null ? tB + mp : R.folga), bz0 = cz - m - (uA != null ? uA + mp : R.folga), bz1 = cz + m + (uB != null ? uB + mp : R.folga);   /* a margem deixa ver a espessura da parede */
    /* o BARRILETE entra no quadro da planta: a vista cresce até cobrir os tubos que descem da caixa (e as colunas), com a margem */
    var bar = barrileteDaCaixa(c, q);
    /* 17/11/2026 (planta 1:100 mostrando a faixa da casa): o barrilete entra na vista só até R.barAlcance m da caixa — o resto da rede é desenhado cortado na borda, não alarga a folha */
    var lx0 = cx - m - R.barAlcance, lx1 = cx + m + R.barAlcance, lz0 = cz - m - R.barAlcance, lz1 = cz + m + R.barAlcance;
    bar.tubos.forEach(function (t) { [t.p1, t.p2].forEach(function (p) { bx0 = Math.min(bx0, Math.max(p.x - R.barMargem, lx0)); bx1 = Math.max(bx1, Math.min(p.x + R.barMargem, lx1)); bz0 = Math.min(bz0, Math.max(p.z - R.barMargem, lz0)); bz1 = Math.max(bz1, Math.min(p.z + R.barMargem, lz1)); }); });
    var bb = { x0: bx0 * s, x1: bx1 * s, y0: bz0 * s, y1: bz1 * s }, tit = "PLANTA - " + q.nome;
    var xsC = [tA != null ? cx - m - tA : null, cx - m, cx + m, tB != null ? cx + m + tB : null].filter(function (v) { return v != null; });
    var zsC = [uA != null ? cz - m - uA : null, cz - m, cz + m, uB != null ? cz + m + uB : null].filter(function (v) { return v != null; });
    return { w: Math.max(bb.x1 - bb.x0 + R.pad, AP.largTexto(tit, TT.titulo)) + K2.folgaVista, h: bb.y1 - bb.y0 + R.pad + altTituloVista() + K2.folgaVista, semParede: tA == null && tB == null && uA == null && uB == null,
      desenhar: function (D, x, y, chk) {
        var ox = x + R.pad - bb.x0, oy = y + K2.folgaVista / 2 - bb.y0, tol = R.tolTubo;
        var trs = arr(c.rede && c.rede.trechos).filter(function (t) {
          return [t.p1, t.p2].some(function (p) { return p.x >= bx0 && p.x <= bx1 && p.z >= bz0 && p.z <= bz1 && p.y >= q.y - tol && p.y <= q.y + alt + tol; });
        });
        var pvF = { nome: pv.nome, cota: q.y, topo: q.y + alt + R.folgaFoto, base: -Infinity, sup: Infinity };
        var ref = trs.length ? trs : [{ p1: { x: cx, y: q.y, z: cz }, p2: { x: cx, y: q.y + (alt || R.altFoto), z: cz } }], rp = null;
        try { rp = fotoPlanta(c, "agua_fria", ref, pvF, bb, s, { reservTransl: true }); } catch (e1) { rp = null; }
        if (rp) D.add('<image data-im="' + rp.key + '" x="' + n(ox + bb.x0) + '" y="' + n(oy + bb.y0) + '" width="' + n(bb.x1 - bb.x0) + '" height="' + n(bb.y1 - bb.y0) + '" preserveAspectRatio="none" href="' + rp.href + '"/>');
        /* parede só em contorno, recortada na caixa da vista */
        paredes.forEach(function (w) { var cp = clipPoly(w.pts, { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }); if (cp.length >= R.minPoli) D.poli(cp.map(function (p) { return [p[0] * s + ox, p[1] * s + oy]; }), "HID-CONTEXTO", true); });
        D.circ(cx * s + ox, cz * s + oy, m * s, "HID-SIMBOLO");
        if (!rp) trs.forEach(function (t) { var a0 = [t.p1.x * s + ox, t.p1.z * s + oy], b0 = [t.p2.x * s + ox, t.p2.z * s + oy]; D.linha(a0[0], a0[1], b0[0], b0[1], "HID-" + SIGLA_CAM(t.sistema) + "-TUBO"); chk.tubos.push([a0[0], a0[1], b0[0], b0[1]]); });
        /* o BARRILETE por cima da foto/contorno: tubos em linha, as COLUNAS em círculo com o nome e o DN, os registros em X, o DN ao longo do tronco */
        if (bar.tubos.length) {
          var hT = D0().E.T.cota, KIb = HI().K, rReg = R.regRaio, rotulos = [];
          var P2 = function (p) { return [p.x * s + ox, p.z * s + oy]; };
          bar.tubos.forEach(function (t0) {
            var sc0 = clipSegCaixa(t0.p1.x, t0.p1.z, t0.p2.x, t0.p2.z, bx0, bx1, bz0, bz1); if (!sc0) return;
            var t = { id: t0.id, parte: t0.parte, dn: t0.dn, interlig: t0.interlig, p1: { x: sc0[0], z: sc0[1] }, p2: { x: sc0[2], z: sc0[3] } };
            var a0 = P2(t.p1), b0 = P2(t.p2), len = Math.sqrt((b0[0] - a0[0]) * (b0[0] - a0[0]) + (b0[1] - a0[1]) * (b0[1] - a0[1]));
            if (len < 0.2) return;   /* a coluna (vertical) é só o círculo, desenhado abaixo */
            D.linha(a0[0], a0[1], b0[0], b0[1], "HID-AF-TUBO"); chk.tubos.push([a0[0], a0[1], b0[0], b0[1]]);
            if (t.dn == null || len < R.limiteRotulo || !/^(saida|barrilete|coletor|tomada)$/.test(t.parte)) return;
            var maior = bar.tubos.filter(function (u) { return u.parte === t.parte; }).sort(function (a, b) { return Math.abs(b.p2.x - b.p1.x) + Math.abs(b.p2.z - b.p1.z) - Math.abs(a.p2.x - a.p1.x) - Math.abs(a.p2.z - a.p1.z); })[0];
            if (maior !== t0) return;   /* um DN por parte (o tronco): as colunas levam o DN no nome */
            var mx = (a0[0] + b0[0]) / 2, my = (a0[1] + b0[1]) / 2, ux = (b0[0] - a0[0]) / len, uy = (b0[1] - a0[1]) / len, tx = "DN " + t.dn;
            /* o DN fica ao lado do tubo (afastado pela altura do texto); um rótulo só onde não há outro perto */
            var lx = mx - uy * (hT * 1.1) - (Math.abs(uy) > 0.5 ? c.AP.largTexto(tx, hT) : 0), ly = my + ux * (hT * 1.1) + hT * 0.35;
            if (rotulos.some(function (r) { return Math.abs(r[0] - lx) < c.AP.largTexto(tx, hT) + 1 && Math.abs(r[1] - ly) < hT * 1.3; })) return;
            rotulos.push([lx, ly, c.AP.largTexto(tx, hT)]); D.texto(lx, ly, tx, hT, {});
          });
          bar.colunas.forEach(function (k) {
            if (k.x < bx0 || k.x > bx1 || k.z < bz0 || k.z > bz1) return;
            var cc = P2({ x: k.x, z: k.z }), rc = KIb.regC;
            D.circ(cc[0], cc[1], rc, "HID-SIMBOLO");
            var nm = k.nome + (k.dn != null ? " DN " + k.dn : ""), lx2 = cc[0] + rc + 1, ly2 = cc[1] - rc;
            var wN = c.AP.largTexto(nm, hT), k2;
            for (k2 = 0; k2 < 6 && rotulos.some(function (r) { return r[0] < lx2 + wN && r[0] + r[2] > lx2 && Math.abs(r[1] - ly2) < hT * 1.2; }); k2++) ly2 -= hT * 1.3;   /* o nome sobe até não bater em outro */
            rotulos.push([lx2, ly2, wN]); D.texto(lx2, ly2, nm, hT, {});
          });
          bar.regs.forEach(function (g) {
            if (g.centro.x < bx0 || g.centro.x > bx1 || g.centro.z < bz0 || g.centro.z > bz1) return;
            var cc = P2(g.centro); D.linha(cc[0] - rReg, cc[1] - rReg, cc[0] + rReg, cc[1] + rReg, "HID-SIMBOLO"); D.linha(cc[0] - rReg, cc[1] + rReg, cc[0] + rReg, cc[1] - rReg, "HID-SIMBOLO");
          });
        }
        /* cotas da caixa até as faces internas (m): cadeia horizontal embaixo da caixa e vertical à esquerda */
        var nS = D.sg.length, px = [], vx = [], py = [], vy = [];
        xsC.forEach(function (v, i) { px.push([v * s + ox, (cz + m) * s + oy]); if (i) vx.push(br(v - xsC[i - 1], 2)); });
        zsC.forEach(function (v, i) { py.push([(cx - m) * s + ox, v * s + oy]); if (i) vy.push(br(v - zsC[i - 1], 2)); });
        if (px.length > 1) D.cadeia(px, -R.cotaOff, vx, { attrs: vx.map(function () { return ' data-cota="reservatorio"'; }) });
        if (py.length > 1) D.cadeia(py, -R.cotaOff, vy, { attrs: vy.map(function () { return ' data-cota="reservatorio"'; }) });
        for (var qq = nS; qq < D.sg.length; qq++) chk.cotas.push(D.sg[qq]);
        AP.tituloVista(D, x + K2.folgaVista / 2, y + (bb.y1 - bb.y0) + R.pad + K2.folgaVista / 2, tit, "ESC 1:" + esc + " - cotas em m");
      } };
  }
  /* O CORTE: o perfil na proporção da caixa colocada, a cota da base até o piso/laje e os balões de DN */
  /* a INTERLIGAÇÃO com as outras caixas do grupo (o coletor do barrilete): "INTERLIGAÇÃO COM CX-2 - DN 50"; null se não há coletor */
  function interligacaoDe(c, q, bar) {
    var col = bar.tubos.filter(function (t) { return t.parte === "coletor"; }), outras = caixasReais(c.modelo).filter(function (o) { return o.id !== q.id; });
    if (!col.length || !outras.length) return null;
    var dn = col.reduce(function (m, t) { return t.dn != null && t.dn > m ? t.dn : m; }, 0);
    return K2.reserv.rotInter + outras.map(function (o) { return o.nome; }).join(K2.reserv.rotInterJunta) + " - " + (dn ? "DN " + dn : "DN a confirmar");
  }
  function corteReservatorio(c, q, lig, pv, s) {
    var R = K2.reserv, AP = c.AP, TT = D0().E.T, h = TT.cota, esc = Math.round(1000 / s), CHV = ["alim", "cons", "extr", "limp"];   // hid:ok mm de papel por metro → denominador
    var diam = q.diametro, alt = q.altura, esq = !(diam != null && alt != null), wB = (diam != null ? diam : R.padraoEsq[0]) * s, hB = (alt != null ? alt : R.padraoEsq[1]) * s;
    var gap = q.y - pv.cota, gapD = Math.min(Math.max(gap, 0) * s, R.apoioMax), corta = Math.max(gap, 0) * s > R.apoioMax;
    /* 15/11/2026: "DN ?" só quando o modelo TEM o tubo e ele não traz o DN; sem tubo nenhum a ligação sai "SEM LIGAÇÃO" (item a confirmar) */
    function dnT(k) { return lig[k].dn != null ? "DN " + lig[k].dn : (lig[k].tubo ? "DN ?" : R.rotSemLig); }
    var rB = Math.max.apply(null, CHV.map(function (k) { return D0().raioBalao(dnT(k)); }));
    var bar = barrileteDaCaixa(c, q), inter = interligacaoDe(c, q, bar);
    var tL = Math.max(AP.largTexto(R.rotAlim, h), AP.largTexto(R.rotCons, h)), tR = Math.max(AP.largTexto(R.rotExtr, h), inter ? AP.largTexto(inter, h) : 0);
    var xCota = R.cotaTxt, xBodyL = xCota + R.cotaFolga + tL + R.entreTxt + 2 * rB + R.stub, xBodyR = xBodyL + wB;
    var xBalL = xBodyL - R.stub - rB, xBalR = xBodyR + R.stub + rB, xColl = xBalR + rB + R.colet, xTxtR = xColl + R.entreTxt, W = xTxtR + tR;
    /* O BARRILETE no corte (15/11/2026): a faixa de baixo com o barrilete e as colunas que descem dele (nome AF-n e DN), a boia na entrada, o registro
       na saída e o extravasor/limpeza descendo até a saída livre — dos tubos que o modelo tem (js/hidbarrilete.js) */
    var nCol = bar.colunas.length, temBar = bar.tubos.length > 0, tDesc = temBar ? AP.largTexto(R.rotDesce, h) : 0;
    if (nCol) { var folgaB = xCota + nCol * R.colPassoMin + 2 * R.entreTxt - xColl; if (folgaB > 0) { xColl += folgaB; xTxtR += folgaB; } }
    var dnBar = bar.tubos.filter(function (t) { return t.parte === "barrilete" && t.dn != null; }).reduce(function (m, t) { return Math.max(m, t.dn); }, 0), rotBar = "BARRILETE" + (dnBar ? " DN " + dnBar : "") + " (SEM ESCALA NA HORIZONTAL - VER PLANTA)";
    W = Math.max(xTxtR + Math.max(tR, tDesc), nCol ? xCota + AP.largTexto(rotBar, h) : 0);
    var yTop = R.tampa + R.topoFolga, yBase = yTop + hB, yRef = yBase + gapD + R.laje, H = yRef + R.laje;
    /* as alturas das ligações: as do conector da família (m acima da base) quando existem, senão as frações do padrão; sempre dentro do corpo e afastadas */
    function yDe(k, frac, desce) {
      var v = lig[k].y != null ? yBase - lig[k].y * s : (desce ? yTop + hB * frac : yBase - hB * frac);
      return Math.min(yBase - rB - R.respiro, Math.max(yTop + rB + R.respiro, v));
    }
    var yAl = yDe("alim", R.alimFrac, true), yCo = yDe("cons", R.consFrac, false), yEx = yDe("extr", R.extrFrac, true), yLi = yDe("limp", R.limpFrac, false);
    if (yLi - yEx < 2 * rB + R.respiro) yLi = Math.min(yBase - rB - R.respiro, yEx + 2 * rB + R.respiro);
    /* os BALÕES de DN ficam afastados entre si (caixa baixa: dois balões não cabem na altura do corpo); a linha da ligação sai do tubo e vai ao balão */
    var sepB = 2 * rB + R.respiro;
    function afasta(y0, y1) { if (y1 - y0 >= sepB) return [y0, y1]; var m0 = (y0 + y1) / 2; return [m0 - sepB / 2, m0 + sepB / 2]; }
    var bL = afasta(yAl, yCo), bR = afasta(yEx, yLi);
    H = Math.max(H, bL[1] + rB + R.respiro, bR[1] + rB + R.respiro);
    var Hcorpo = H, yTxtBar = Hcorpo + h * 2.2, yBarra = yTxtBar + R.barDesce, yFimCol = yBarra + R.colDesce;
    if (nCol) H = yFimCol + h * 3.8;
    var tit = "CORTE - " + q.nome;
    return { w: Math.max(W, AP.largTexto(tit, TT.titulo)) + K2.folgaVista, h: H + altTituloVista() + K2.folgaVista, esquematico: esq, gap: gap, dnDesc: CHV.filter(function (k) { return lig[k].dn == null && lig[k].tubo; }), semLig: CHV.filter(function (k) { return lig[k].dn == null && !lig[k].tubo; }),
      desenhar: function (D, x, y, chk) {
        var X0 = x + K2.folgaVista / 2, Y0 = y + K2.folgaVista / 2, xl = X0 + xBodyL, xr = X0 + xBodyR, yt = Y0 + yTop, yb = Y0 + yBase, yr = Y0 + yRef, yN = yt + hB * (1 - R.nivel);
        /* a laje, o apoio até a laje (caixa elevada) e o corpo com a água no nível de operação */
        hachRet(D, xl - R.alaje, yb + gapD, wB + 2 * R.alaje, R.laje, KD.concreto);
        if (gapD > 0) hachRet(D, xl, yb, wB, gapD, KD.concreto);
        poliCheio(D, [[xl + R.parede, yN], [xr - R.parede, yN], [xr - R.parede, yb - R.parede], [xl + R.parede, yb - R.parede]], KD.agua, null, 0);
        hachRet(D, xl, yt + R.tampa, R.parede, hB - R.tampa, KD.parede); hachRet(D, xr - R.parede, yt + R.tampa, R.parede, hB - R.tampa, KD.parede); hachRet(D, xl, yb - R.parede, wB, R.parede, KD.parede);
        poliCheio(D, [[xl - R.beiral, Y0 + R.topoFolga], [xr + R.beiral, Y0 + R.topoFolga], [xr + R.beiral, yt], [xl - R.beiral, yt]], "#9e9e9e", "#333", 0.2);
        D.add('<line x1="' + n(xl + R.parede) + '" y1="' + n(yN) + '" x2="' + n(xr - R.parede) + '" y2="' + n(yN) + '" stroke="' + KD.aguaLinha + '" stroke-width="0.25" data-cam="HID-EIXO"/>');
        /* as ligações: tubo, balão com o DN e o rótulo */
        function esquerda(k, yy, yB, rotulo) {
          var cxb = X0 + xBalL, ya = Y0 + yy, yb2 = Y0 + yB;
          D.linha(cxb + rB, yb2, xl, ya, "HID-AF-TUBO");
          D.balao(cxb, yb2, dnT(k), ' data-dn="' + k + '"');
          D.texto(cxb - rB - R.entreTxt / 2, yb2, rotulo, h, { al: "D", meio: true });
        }
        esquerda("alim", yAl, bL[0], R.rotAlim); esquerda("cons", yCo, bL[1], R.rotCons);
        var cxr = X0 + xBalR, cxc = X0 + xColl;
        [["extr", yEx, bR[0]], ["limp", yLi, bR[1]]].forEach(function (p) {
          var ya = Y0 + p[1], yb2 = Y0 + p[2];
          D.linha(xr, ya, cxr - rB, yb2, "HID-AF-TUBO"); D.linha(cxr + rB, yb2, cxc, yb2, "HID-AF-TUBO");
          D.balao(cxr, yb2, dnT(p[0]), ' data-dn="' + p[0] + '"');
        });
        D.linha(cxc, Y0 + bR[0], cxc, Y0 + bR[1], "HID-AF-TUBO");
        D.texto(X0 + xTxtR, Y0 + (bR[0] + bR[1]) / 2, R.rotExtr, h, { meio: true });
        if (inter) D.texto(X0 + xTxtR, Y0 + (bR[0] + bR[1]) / 2 + h * R.interDesce, inter, h, { meio: true });
        /* a BOIA na entrada: a haste da torneira até o flutuador na linha d'água */
        if (bar.tubos.some(function (t) { return t.parte === "alimentacao"; })) {
          var xbo = xl + R.parede + R.ladoBoia, ybo = yN;
          D.linha(xl + R.parede, Y0 + yAl, xbo, ybo, "HID-AF-TUBO"); D.circ(xbo, ybo, R.boiaRaio, "HID-SIMBOLO");
          D.texto(xbo + R.boiaRaio + 1, ybo - R.boiaRaio, "BOIA", h, {});
        }
        /* o REGISTRO da saída (consumo): o X sobre a ligação, no meio do trecho entre o balão e a caixa */
        if (bar.regs.some(function (g) { return g.parte === "saida"; })) {
          var xr0 = (X0 + xBalL + rB + xl) / 2, yr0 = (Y0 + bL[1] + Y0 + yCo) / 2;
          D.linha(xr0 - R.regRaio, yr0 - R.regRaio, xr0 + R.regRaio, yr0 + R.regRaio, "HID-SIMBOLO"); D.linha(xr0 - R.regRaio, yr0 + R.regRaio, xr0 + R.regRaio, yr0 - R.regRaio, "HID-SIMBOLO");
        }
        /* o extravasor e a limpeza DESCEM do coletor até a saída livre (visível, fora da edificação) */
        if (temBar) {
          var yDesc = Y0 + (nCol ? yFimCol : Hcorpo - R.laje);
          D.linha(cxc, Y0 + bR[1], cxc, yDesc, "HID-AF-TUBO");
          D.linha(cxc - R.regRaio, yDesc - R.regRaio, cxc, yDesc, "HID-AF-TUBO"); D.linha(cxc + R.regRaio, yDesc - R.regRaio, cxc, yDesc, "HID-AF-TUBO");
          D.texto(cxc + R.entreTxt, yDesc - R.regRaio * 2, R.rotDesce, h, {});
        }
        /* a FAIXA DO BARRILETE (esquema: sem escala na horizontal; as posições estão na planta): o tronco com o DN, o tê, o registro e a coluna de cada AF-n */
        if (nCol) {
          var xB0 = X0 + xCota + R.entreTxt;
          var passo = Math.min(R.colPasso, (X0 + xColl - 2 * R.entreTxt - xB0) / nCol), yB = Y0 + yBarra, yF = Y0 + yFimCol;
          D.texto(X0 + xCota, Y0 + yTxtBar, rotBar, h, {});
          D.linha(xB0, yB, xB0 + passo * nCol, yB, "HID-AF-TUBO");
          bar.colunas.forEach(function (k, i) {
            var xk = xB0 + passo * (i + 0.5), yRg = yB + R.colDesce * 0.45;
            D.ponto(xk, yB, HI().K.rTe, "#000"); D.linha(xk, yB, xk, yF, "HID-AF-TUBO");
            D.linha(xk - R.regRaio, yRg - R.regRaio, xk + R.regRaio, yRg + R.regRaio, "HID-SIMBOLO"); D.linha(xk - R.regRaio, yRg + R.regRaio, xk + R.regRaio, yRg - R.regRaio, "HID-SIMBOLO");
            D.texto(xk - AP.largTexto(k.nome, h) / 2, yF + h * 1.2, k.nome, h, {});
            if (k.dn != null) D.texto(xk - AP.largTexto("DN " + k.dn, h) / 2, yF + h * 2.4, "DN " + k.dn, h, {});
          });
        }
        /* a cota: topo da caixa até a base e da base até o piso/laje (m), num lado só, longe das ligações */
        var xc = X0 + xCota, pts = [], vals = [], nS = D.sg.length;   /* só os traços da cota entram na conferência de rótulo × cota */
        if (!esq) { pts.push([xc, yt], [xc, yb]); vals.push(br(alt, 2)); }
        if (gap > R.tolPav) { if (!pts.length) pts.push([xc, yb]); pts.push([xc, yr - R.laje]); vals.push(br(gap, 2)); }
        if (pts.length > 1) {
          D.cadeia(pts, 0, vals, { attrs: vals.map(function () { return ' data-cota="reservatorio"'; }) });
          /* ⚠ A linha de chamada da cota (do eixo da cota até a caixa) NÃO atravessa o rótulo nem o balão de DN da ligação que cai na mesma altura:
             com a ligação de consumo rente à base (caixa baixa), a linha da cota passava por "AF-CONSUMO" e por "DN 32" (rótulo × cota, achado
             do e2e do Gerar pranchas, 17/11/2026). Ela é partida em dois: até antes do texto e de novo depois do balão — continua chegando à caixa. */
          var furos = [[bL[0], R.rotAlim], [bL[1], R.rotCons]].map(function (f) { var ycf = Y0 + f[0], xt = X0 + xBalL - rB - R.entreTxt / 2 - AP.largTexto(f[1], h); return { y: ycf, x0: xt - R.extFolgaTxt, x1: X0 + xBalL + rB + R.extFolgaTxt, r: rB + R.extFolgaTxt }; });
          pts.forEach(function (p) {
            var xa = xc + R.extIni, xb = p[1] <= yb ? xl - R.extFim : xl - R.alaje - R.extFim, cortes = furos.filter(function (f) { return Math.abs(p[1] - f.y) <= f.r && f.x1 > xa && f.x0 < xb; }).sort(function (u, v) { return u.x0 - v.x0; });
            var ini = xa;
            cortes.forEach(function (f) { if (f.x0 > ini) D.linha(ini, p[1], f.x0, p[1], "HID-COTA"); ini = Math.max(ini, f.x1); });
            if (xb > ini) D.linha(ini, p[1], xb, p[1], "HID-COTA");
          });
          if (corta) { var ym = yb + (yr - R.laje - yb) * R.quebraPos; D.linha(xc - R.quebra, ym + R.quebra, xc + R.quebra, ym - R.quebra, "HID-COTA"); D.linha(xc - R.quebra, ym + R.quebra * 2, xc + R.quebra, ym + R.quebra, "HID-COTA"); }
        }
        if (gap <= R.tolPav) D.texto(xl - R.alaje, yr + R.laje + h * R.fracTit, R.rotApoiada, h, {});
        for (var qq = nS; qq < D.sg.length; qq++) chk.cotas.push(D.sg[qq]);
        AP.tituloVista(D, X0, y + H + K2.folgaVista / 2, tit, "ESC 1:" + esc + (esq ? " - perfil esquemático" : "") + (gap > R.tolPav ? " - cotas em m" : ""));
      } };
  }
  function folhaReservatorio(c) {
    var D = c.D, a = c.geo.area, R = K2.reserv, q = caixasReais(c.modelo)[c.parte || 0];
    if (!q || !isFinite(q.x) || !isFinite(q.z) || !isFinite(q.y)) return null;
    var pv = pavDaCaixa(c, q), lig = ligacoesCaixa(c, q), esc = null, vs = null, lado = true, i;
    for (i = 0; i < R.escalas.length && !esc; i++) {
      var s = 1000 / R.escalas[i], p = plantaReservatorio(c, q, lig, pv, s), k = corteReservatorio(c, q, lig, pv, s);   // hid:ok mm de papel por metro
      if (p.w + k.w + R.entre <= a.w && Math.max(p.h, k.h) <= a.h) { esc = R.escalas[i]; vs = [p, k]; lado = true; }
      else if (Math.max(p.w, k.w) <= a.w && p.h + k.h + R.entre <= a.h) { esc = R.escalas[i]; vs = [p, k]; lado = false; }
    }
    if (!esc) { esc = R.escalas[R.escalas.length - 1]; var s2 = 1000 / esc; vs = [plantaReservatorio(c, q, lig, pv, s2), corteReservatorio(c, q, lig, pv, s2)]; lado = true; c.avisos.push("Reservatório " + q.nome + ": a planta e o corte não cabem na 1:" + esc + " desta folha - usar folha maior."); }   // hid:ok mm de papel por metro
    else if (esc !== R.escalas[0]) c.avisos.push("Reservatório " + q.nome + ": a planta e o corte saíram na 1:" + esc + " (não cabem na 1:" + R.escalas[0] + " neste formato de folha).");
    var wT = lado ? vs[0].w + vs[1].w + R.entre : Math.max(vs[0].w, vs[1].w), hT = lado ? Math.max(vs[0].h, vs[1].h) : vs[0].h + vs[1].h + R.entre;
    var x0 = a.x + Math.max(0, (a.w - wT) / 2), y0 = a.y + Math.max(0, (a.h - hT) / 2);
    var x1v = lado ? x0 + vs[0].w + R.entre : x0, y1v = lado ? y0 : y0 + vs[0].h + R.entre;
    blocoVista(D, "reservatorio-planta", "1:" + esc, { x: x0, y: y0, w: vs[0].w, h: vs[0].h }, function () { vs[0].desenhar(D, x0, y0, c.chk); });
    blocoVista(D, "reservatorio-corte", "1:" + esc, { x: x1v, y: y1v, w: vs[1].w, h: vs[1].h }, function () { vs[1].desenhar(D, x1v, y1v, c.chk); });
    if (vs[0].semParede) c.avisos.push("Reservatório " + q.nome + ": nenhuma parede a menos de " + br(R.alcance, 1) + " m da caixa - só a cota do diâmetro (sem cota até a face interna).");
    if (vs[1].esquematico) c.avisos.push("Reservatório " + q.nome + ": a família não informa diâmetro/altura - corte esquemático, sem cota da caixa.");
    if (vs[1].semLig.length) c.avisos.push("Reservatório " + q.nome + ": sem ligação no modelo para " + vs[1].semLig.map(function (k) { return ({ alim: "a alimentação", cons: "o consumo", extr: "o extravasor", limp: "a limpeza" })[k]; }).join(", ") + " (balão SEM LIGAÇÃO): a confirmar - lançar o tubo ou rodar o barrilete.");
    if (vs[1].dnDesc.length) c.avisos.push("Reservatório " + q.nome + ": DN não informado para " + vs[1].dnDesc.map(function (k) { return ({ alim: "a alimentação", cons: "o consumo", extr: "o extravasor", limp: "a limpeza" })[k]; }).join(", ") + " (balão com DN ?): conferir no modelo.");
    /* 17/11/2026: caixa d'água sem a alimentação (boia) no modelo = folha NÃO LIBERADO (regra hidro: a caixa sai sempre ligada; o Traçar/Montar barrilete resolve) */
    var semAl = vs[1].semLig.indexOf("alim") >= 0 ? q.nome + ": SEM ALIMENTAÇÃO (BOIA) NO MODELO - LIGAR O ALIMENTADOR À ENTRADA DA CAIXA" : "";
    return { escala: "1:" + esc, naoLiberado: semAl };
  }
  function folhaEsquemaIso(c) {
    var D = c.D, a = c.areaPersp || c.geo.area, KI = HI().K, pz = c.persp, h = KI.hPeq * 1.1, P = pz.P, pv = pz.pv, b = pz.b, KE = K2.esquema, hT0 = c.semLegenda ? 0 : K2.titulo;   /* ETAPA 2: dentro de uma célula de mosaico (areaPersp) não leva título próprio */
    if (!c.semLegenda) c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "SEM ESCALA - isométrico 30°, vista " + (pz.vistaNome || pz.vista) + "; alturas em m do piso acabado");
    var est = c.modelo.estado, chao = [], louca = [];
    paredesDoPav(est, pv).forEach(function (w) {
      var rr = recortaEixo(w, { x0: b.x0 - w.esp, x1: b.x1 + w.esp, z0: b.z0 - w.esp, z1: b.z1 + w.esp }); if (!rr) return;
      var he = w.esp / 2; chao.push([[rr.a[0] - w.n[0] * he, rr.a[1] - w.n[1] * he], [rr.b[0] - w.n[0] * he, rr.b[1] - w.n[1] * he], [rr.b[0] + w.n[0] * he, rr.b[1] + w.n[1] * he], [rr.a[0] + w.n[0] * he, rr.a[1] + w.n[1] * he]]);
    });
    var ctxP = null; try { ctxP = contextoPlanta(vistaCtx(c, pz.trs, pv, null), [b.x0, b.x1], [b.z0, b.z1]); } catch (e) { ctxP = null; }
    arr(ctxP && ctxP.loucas).forEach(function (sg) { var m = [(sg[0][0] + sg[1][0]) / 2, (sg[0][2] + sg[1][2]) / 2]; if (m[0] >= b.x0 - 0.05 && m[0] <= b.x1 + 0.05 && m[1] >= b.z0 - 0.05 && m[1] <= b.z1 + 0.05) louca.push(sg); });
    var yC = pv.cota;
    function Pm(x, y, z) { return P({ x: x, y: y, z: z }); }
    var us = [], vs = [];
    function jn(p) { us.push(p.u); vs.push(p.v); }
    chao.forEach(function (pl) { pl.forEach(function (qq) { jn(Pm(qq[0], yC, qq[1])); }); });
    [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].forEach(function (qq) { jn(Pm(qq[0], yC, qq[1])); });
    pz.trs.forEach(function (t) { jn(P({ x: t.p1.x, y: Math.min(t.p1.y, pz.yT), z: t.p1.z })); jn(P({ x: t.p2.x, y: Math.min(t.p2.y, pz.yT), z: t.p2.z })); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), mg = KE.margem;
    var k = Math.min((a.w - 2 * mg - KE.folgaChamada) / Math.max(u1 - u0, 1e-6), (a.h - hT0 - 2 * mg) / Math.max(v1 - v0, 1e-6), K2.perspKMax);
    var ox = a.x + mg + (a.w - 2 * mg - KE.folgaChamada - (u1 - u0) * k) / 2 - u0 * k, oy = a.y + hT0 + mg + (a.h - hT0 - 2 * mg - (v1 - v0) * k) / 2 - v0 * k;
    function X(p) { return [p.u * k + ox, p.v * k + oy]; }
    function pts(pl) { return pl.map(function (qq) { var p = X(Pm(qq[0], yC, qq[1])); return n(p[0]) + "," + n(p[1]); }).join(" "); }
    /* 1) piso e paredes chapados. 14/11/2026 — o Rogério (folhas 06/07): "tem que mostrar a PORTA, as paredes com uma hachura bacana,
       EMENDADAS uma na outra". A planta de arquitetura do pavimento (paredes emendadas, vãos com a folha e o arco) é desenhada pelo
       MESMO motor da planta (fundoArquitetura), com o mapa (x, z) → piso isométrico; a hachura a 45° vai por cima, parede a parede. */
    D.add('<polygon points="' + pts([[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) + '" fill="#ffffff" stroke="#9aa0a6" stroke-width="0.13" data-cam="HID-CONTEXTO"/>');
    var Lq = null; try { Lq = listasArq(c, pv); } catch (eL) { Lq = null; }
    var caixaR = { x0: b.x0 - 0.6, x1: b.x1 + 0.6, z0: b.z0 - 0.6, z1: b.z1 + 0.6 };
    function dentroR(q) { return q.x >= caixaR.x0 && q.x <= caixaR.x1 && q.z >= caixaR.z0 && q.z <= caixaR.z1; }
    if (Lq && Lq.paredes.length) {
      var Pm2 = function (x, z) { return X(Pm(x, yC, z)); };
      var Mi = { k: k * Math.sqrt(Math.abs((Pm(1, 0, 0).u - Pm(0, 0, 0).u) * (Pm(0, 0, 1).v - Pm(0, 0, 0).v) - (Pm(0, 0, 1).u - Pm(0, 0, 0).u) * (Pm(1, 0, 0).v - Pm(0, 0, 0).v))), ox: 0, oy: 0, caixa: [0, 0, 1, 1],
        P: Pm2, Pp: function (q) { return Pm2(q[0], q[1]); }, L: function (m) { return m * Mi.k; }, larg: 0, alt: 0 };
      var Lr = { paredes: [], pilares: [], vaos: [], moveis: [], ambientes: [] };
      Lq.paredes.forEach(function (w) { var q = clipPoly(w.pts, caixaR); if (q.length >= 3) { var o2 = {}; for (var kw in w) o2[kw] = w[kw]; o2.pts = q; Lr.paredes.push(o2); } });
      Lq.pilares.forEach(function (w) { var q = clipPoly(w.pts, caixaR); if (q.length >= 3) { var o2 = {}; for (var kw in w) o2[kw] = w[kw]; o2.pts = q; Lr.pilares.push(o2); } });
      Lq.vaos.forEach(function (v) { if (dentroR(v)) Lr.vaos.push(v); });
      D.add('<g data-cam="HID-CONTEXTO">' + fundoArquitetura(c, Lr, 1, 0, 0, [], Mi).svg + "</g>");
      Lr.paredes.forEach(function (w) { hachura(D, w.pts.map(function (q) { return Pm2(q[0], q[1]); }), KE.hachPasso); });
    } else chao.forEach(function (pl) { D.add('<polygon points="' + pts(pl) + '" fill="#e6e6e6" stroke="#7f7f7f" stroke-width="0.18" data-cam="HID-CONTEXTO"/>'); });
    louca.forEach(function (sg) { var A0 = X(Pm(sg[0][0], yC, sg[0][2])), B0 = X(Pm(sg[1][0], yC, sg[1][2])); D.linha(A0[0], A0[1], B0[0], B0[1], "HID-LOUCA"); });
    var cA = X(Pm((b.x0 + b.x1) / 2, yC, (b.z0 + b.z1) / 2)), e1 = X(Pm(b.x0 + 1, yC, b.z0)), e0 = X(Pm(b.x0, yC, b.z0));
    var angA = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]) * 180 / Math.PI; if (angA > 90) angA -= 180; if (angA < -90) angA += 180;
    D.texto(cA[0], cA[1], txt(pz.amb && pz.amb.nome).toUpperCase(), h * 2.2, { al: "C", rot: angA, cor: "#8a8f96", semCaixa: true });
    var pend = [], Sx = [], Lx = [], Tx = [], segP = [];
    /* 2) tubulação em linha única + DN ao longo */
    function corDe(sis) { var cam = D.E.camadas["HID-" + (CAMADA_SIS[sis] || "AF") + "-TUBO"]; return cam ? cam.cor : "#000"; }
    pz.trs.forEach(function (t) {
      var q1 = { x: t.p1.x, y: Math.min(t.p1.y, pz.yT), z: t.p1.z }, q2 = { x: t.p2.x, y: Math.min(t.p2.y, pz.yT), z: t.p2.z };
      var A = X(P(q1)), B = X(P(q2)), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 0.2) return;
      var cor = corDe(t.sistema), ve = t.sistema === "ventilacao";
      D.add('<line x1="' + n(A[0]) + '" y1="' + n(A[1]) + '" x2="' + n(B[0]) + '" y2="' + n(B[1]) + '" stroke="' + cor + '" stroke-width="' + n(KE.pena) + '"' + (ve ? ' stroke-dasharray="2 1"' : "") + ' stroke-linecap="round" data-cam="HID-' + (CAMADA_SIS[t.sistema] || "AF") + '-TUBO"/>');
      if (c.chk) c.chk.tubos.push([A[0], A[1], B[0], B[1]]);
      segP.push([A[0], A[1], B[0], B[1]]);
      if (L >= KE.minRotulo) pend.push({ s: "ø" + t.dn, h: h, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: [[(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]], prio: 2, d0: KE.d0 });
      if (q1.y < t.p1.y - 1e-6 || q2.y < t.p2.y - 1e-6) { var top = A[1] < B[1] ? A : B, qb = HI().K.quebraTam; D.linha(top[0] - qb, top[1] + qb * 0.4, top[0] + qb, top[1] - qb * 0.4, "HID-SIMBOLO"); }
    });
    var segE = []; pz.trs.forEach(function (t) { var A = X(P({ x: t.p1.x, y: Math.min(t.p1.y, pz.yT), z: t.p1.z })), B = X(P({ x: t.p2.x, y: Math.min(t.p2.y, pz.yT), z: t.p2.z })); segE.push([A[0], A[1], B[0], B[1]]); });
    pz.itens.forEach(function (it) { if (it.tipo !== "conexao") return; var pc = X(it.p), pn = pernasNo(segE, pc[0], pc[1], K2.simbCx.tolNo); simbCx(D, it.cx.tipo, pc[0], pc[1], pn, corDe(it.cx.sistema)); });
    /* 3) CHAMADA DE ALTURA: traço tracejado na direção do eixo x da projeção, "+0,60" sobre o traço e o tique na ponta */
    var p00 = X(Pm(0, 0, 0)), p10 = X(Pm(1, 0, 0)), Lu = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]), dU = [(p10[0] - p00[0]) / Lu, (p10[1] - p00[1]) / Lu];
    if (dU[0] < 0) dU = [-dU[0], -dU[1]];
    var angU = Math.atan2(dU[1], dU[0]) * 180 / Math.PI;
    function chamada(p, sigla, alt, cor) {
      var Lc = KE.chamada, E = [p[0] + dU[0] * Lc, p[1] + dU[1] * Lc];
      D.add('<line x1="' + n(p[0]) + '" y1="' + n(p[1]) + '" x2="' + n(E[0]) + '" y2="' + n(E[1]) + '" stroke="' + cor + '" stroke-width="' + n(KE.penaChamada) + '" stroke-dasharray="1.8 0.7" data-cam="HID-CHAMADA"/>');   /* 14/11/2026: "ficou um pouquinho apagado, deixa mais forte" */
      D.linha(E[0] - 1.2, E[1] + 1.2, E[0] + 1.2, E[1] - 1.2, "HID-SIMBOLO");
      var tA = (alt >= 0 ? "+" : "") + br(alt, 2), xT = E[0] - dU[0] * 1.5 + dU[1] * h * 0.7, yT = E[1] - dU[1] * 1.5 - dU[0] * h * 0.7;
      D.texto(xT, yT, tA, h * 1.05, { al: "D", rot: angU, cor: cor, semCaixa: true });
      var wA = larg(tA, h * 1.05); Sx.push({ tipo: "obst", x: 0, y: 0, r: 0, camada: "HID-SIMBOLO", box: [Math.min(p[0], xT - wA) - 0.5, Math.min(p[1], E[1]) - h * 1.6, Math.max(E[0], xT) + 0.5, Math.max(p[1], E[1]) + 0.5] });
      if (sigla) pend.push({ s: sigla, h: h, tipo: "aparelho", camada: "HID-TEXTO", trecho: "pt-" + sigla, anchors: [p], prio: 0, d0: KE.d0 });
      D.ponto(p[0], p[1], KE.no * 0.9, cor);
    }
    var visto = {};
    pz.pontos.forEach(function (l) {
      if (visto[l.alvo]) return; visto[l.alvo] = 1;
      var tt = null; pz.trs.forEach(function (t) { if (t.id === l.trecho) tt = t; });
      chamada(X(P(l)), c.nomeAp(l.famInst), l.y - pv.cota, corDe(tt ? tt.sistema : pz.sisL[0]));
    });
    pz.acess.forEach(function (ac) {
      var p = X(P(ac.centro)), sg = ({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[ac.acessorio] || "RG", r0 = KI.regC / 2;
      var prE = pernasNo(segP, p[0], p[1], r0 * 1.5); simbReg(D, ac.acessorio, p[0], p[1], r0, prE[0] || [1, 0]);
      Sx.push({ tipo: "obst", x: 0, y: 0, r: 0, camada: "HID-SIMBOLO", box: [p[0] - r0, p[1] - r0, p[0] + r0, p[1] + r0] });
      pend.push({ s: sg + " " + (ac.centro.y - pv.cota >= 0 ? "+" : "") + br(ac.centro.y - pv.cota, 2), h: h, tipo: "registro", camada: "HID-TEXTO", trecho: ac.id, anchors: [p], prio: 0, d0: KE.d0 });
    });
    pz.itens.forEach(function (it) {
      if (it.tipo !== "peca") return; var pp = it.pts.map(X); D.poli(pp, "HID-SIMBOLO", true);
      var xs1 = pp.map(function (q) { return q[0]; }), ys1 = pp.map(function (q) { return q[1]; });
      Sx.push({ tipo: "obst", x: 0, y: 0, r: 0, camada: "HID-SIMBOLO", box: [Math.min.apply(null, xs1), Math.min.apply(null, ys1), Math.max.apply(null, xs1), Math.max.apply(null, ys1)] });
      var cx0 = pp.reduce(function (s0, qq) { return [s0[0] + qq[0] / pp.length, s0[1] + qq[1] / pp.length]; }, [0, 0]), rt = rotuloPecaPlanta(c.rede, it.k.id);
      if (rt) pend.push({ s: rt, h: h, tipo: "peca", camada: "HID-TEXTO", trecho: it.k.id, anchors: [cx0], prio: 1, d0: KE.d0 * 1.5 });
    });
    HI().afastar(pend, Sx, Lx, Tx, segP, c.avisos);
    desenhar(D, { linhas: Lx, simbolos: Sx, textos: Tx }, 0, 0, c.chk);
    c.prims.push({ linhas: [], simbolos: [], textos: [], trechos: [] });
    return { escala: "SEM ESCALA" };
  }
  /* ⚠ O ISOMÉTRICO NA LINHA DA REFERÊNCIA DO ROGÉRIO (14/11/2026): sobre a foto do modelo (tubos e conexões reais, sem as paredes 3D), as PAREDES
     do pavimento como CONTORNO cinza chapado no piso (sem hachura) e, ao lado de cada tubo vertical, a CADEIA DE COTAS das alturas (cm, do piso
     acabado a cada mudança: derivação, registro, ponto). Só com a foto (o desenho vetorial antigo segue como era). */
  function isoReferencia(c, D, pz, X) {
    var KR = K2.isoRef, P = pz.P, pv = pz.pv, b = pz.b, yC = pv.cota;
    /* 1) as paredes chapadas no piso (contorno, recortadas um pouco além do ambiente) */
    var La = null; try { La = listasArq(c, pv); } catch (e) { La = null; }
    if (La) {
      var cx = { x0: b.x0 - KR.alemAmb, x1: b.x1 + KR.alemAmb, z0: b.z0 - KR.alemAmb, z1: b.z1 + KR.alemAmb };
      La.paredes.concat(La.pilares).forEach(function (w) {
        var q = clipPoly(w.pts, cx); if (q.length < 3) return;
        if (pz.dCentro != null) { var mx0 = 0, mz0 = 0; q.forEach(function (pt) { mx0 += pt[0]; mz0 += pt[1]; }); if (P({ x: mx0 / q.length, y: 0, z: mz0 / q.length }).d > pz.dCentro + K2.perspFrente) return; }   /* 15/11/2026: o contorno das paredes da FRENTE também fica oculto */
        D.add('<polygon points="' + q.map(function (pt) { var s0 = X(P({ x: pt[0], y: yC, z: pt[1] })); return n(s0[0]) + "," + n(s0[1]); }).join(" ") + '" fill="none" stroke="' + KR.corParede + '" stroke-width="' + n(KR.penaParede) + '" stroke-linejoin="round" data-cam="HID-CONTEXTO"/>');
      });
    }
    /* 1a) o "L" das paredes do FUNDO e o piso (3ª referência do Rogério: "não preciso mostrar três faces de parede; as outras ficam ocultas;
       mostra o piso") — as faces de trás do cômodo e o piso em contorno cinza fino, sem preenchimento (a foto já não tem a arquitetura) */
    arr(pz.faces).forEach(function (f) { if (f.topo) return; D.add('<polygon points="' + f.pts.map(function (q) { var s0 = X(q); return n(s0[0]) + "," + n(s0[1]); }).join(" ") + '" fill="none" stroke="' + KR.corParede + '" stroke-width="' + n(KR.penaParede * 0.7) + '" stroke-linejoin="round" data-cam="HID-CONTEXTO"/>'); });
    if (arr(pz.piso).length) D.add('<polygon points="' + pz.piso.map(function (q) { var s0 = X(q); return n(s0[0]) + "," + n(s0[1]); }).join(" ") + '" fill="none" stroke="' + KR.corParede + '" stroke-width="' + n(KR.penaParede) + '" data-cam="HID-CONTEXTO"/>');
    /* 1b) o SENTIDO DA ÁGUA (2ª referência do Rogério: "o fluxo está aí na água, certinho — bom pro encanador entender"): a rede do ambiente é
       uma árvore; as pontas que são PONTOS DE UTILIZAÇÃO são as saídas, as outras pontas (a coluna, o corte do recorte) são a entrada. Uma busca
       a partir das entradas dá, em cada trecho, o sentido de montante para jusante; a seta cheia vai no meio do trecho, na cor do sistema. */
    var setasIso = [];
    (function () {
      var ag = arr(pz.trs).filter(function (t) { return /^agua/.test(t.sistema); }); if (!ag.length) return;
      function ch(q) { return Math.round(q.x * 200) + "|" + Math.round(q.y * 200) + "|" + Math.round(q.z * 200); }   // hid:ok nó a 5 mm
      var viz = {}; ag.forEach(function (t) { [[t.p1, t.p2], [t.p2, t.p1]].forEach(function (e) { var k1 = ch(e[0]); (viz[k1] = viz[k1] || []).push({ t: t, de: e[0], para: e[1] }); }); });
      var ehPonto = {}; arr(pz.pontos).forEach(function (l) { ehPonto[ch(l)] = 1; });
      var fila = Object.keys(viz).filter(function (k1) { return viz[k1].length === 1 && !ehPonto[k1]; }), visto = {}, sentido = {};
      fila.forEach(function (k1) { visto[k1] = 1; });
      while (fila.length) { var k0 = fila.shift(); viz[k0].forEach(function (e) { var k2 = ch(e.para); if (sentido[e.t.id]) return; sentido[e.t.id] = e; if (!visto[k2]) { visto[k2] = 1; fila.push(k2); } }); }
      function cmp3(t) { return Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2)); }
      ag.slice().sort(function (p0, q0) { return cmp3(q0) - cmp3(p0); }).forEach(function (t) {   /* os trechos mais longos levam a seta primeiro */
        var e = sentido[t.id]; if (!e) return;
        var A = X(P(e.de)), B = X(P(e.para)), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < KR.minSeta) return;
        var ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        if (!HI().setaPermitida(t, setasIso, mx, my)) return; setasIso.push({ tipo: "seta", x: mx, y: my });   /* 15/11/2026: no máximo uma por trecho, trecho >= 0,5 m, 25 mm entre setas */
        var cor = /quente/.test(t.sistema) ? KR.corAQ : KR.corAF, a0 = KR.seta;
        D.cheio([[mx + ux * a0, my + uy * a0], [mx - ux * a0 * 0.6 - uy * a0 * 0.55, my - uy * a0 * 0.6 + ux * a0 * 0.55], [mx - ux * a0 * 0.6 + uy * a0 * 0.55, my - uy * a0 * 0.6 - ux * a0 * 0.55]], cor);
      });
    })();
    /* 2) as cadeias de cotas verticais: um tubo vertical (ou uma coluna de verticais no mesmo prumo) = uma cadeia */
    var grupos = {};
    arr(pz.trs).forEach(function (t) {
      var dh = Math.hypot(t.p2.x - t.p1.x, t.p2.z - t.p1.z), dy = Math.abs(t.p2.y - t.p1.y); if (dh > KR.tolPrumo || dy < KR.minVert) return;
      var kx = Math.round(t.p1.x / KR.tolPrumo) + "|" + Math.round(t.p1.z / KR.tolPrumo), g = grupos[kx] = grupos[kx] || { x: t.p1.x, z: t.p1.z, ys: [yC] };
      [t.p1.y, t.p2.y].forEach(function (y) { if (y > yC - KR.abaixoPiso) g.ys.push(Math.min(y, pz.yT)); });
    });
    Object.keys(grupos).forEach(function (kx) {
      var g = grupos[kx], ys = g.ys.sort(function (p0, q0) { return p0 - q0; }).filter(function (y, i, A) { return i === 0 || y - A[i - 1] > KR.minIntervalo; });
      if (ys.length < 2) return;
      var pts = ys.map(function (y) { return X(P({ x: g.x, y: y, z: g.z })); }), dx = KR.afasta;
      var A0 = [pts[0][0] + dx, pts[0][1]], A1 = [pts[pts.length - 1][0] + dx, pts[pts.length - 1][1]];
      D.add('<line x1="' + n(A0[0]) + '" y1="' + n(A0[1]) + '" x2="' + n(A1[0]) + '" y2="' + n(A1[1]) + '" stroke="' + KR.corCota + '" stroke-width="' + n(KR.penaCota) + '" data-cam="HID-COTA"/>');
      pts.forEach(function (p0, i) {
        var tx = p0[0] + dx, ty = p0[1];
        D.add('<line x1="' + n(tx - KR.tique) + '" y1="' + n(ty + KR.tique * 0.6) + '" x2="' + n(tx + KR.tique) + '" y2="' + n(ty - KR.tique * 0.6) + '" stroke="' + KR.corCota + '" stroke-width="' + n(KR.penaCota * 1.6) + '" data-cam="HID-COTA"/>');
        if (i === 0) return;
        var cm = Math.round((ys[i] - ys[i - 1]) * 100), my = (ty + pts[i - 1][1]) / 2;
        D.texto(tx + KR.texto * 0.9, my, String(cm), KR.texto, { al: "C", rot: -90, cor: KR.corCota, semCaixa: true });
      });
    });
  }
  /* ⚠ O NOME DO PRODUTO do acessório (registro) vem da FICHA da peça (comercial.fabricante[0]: descrição do catálogo do fabricante + o fabricante,
     "Registro Esfera VS Soldável 25 mm - TIGRE"). Sem a ficha ou sem fabricante a chamada NÃO sai: nome de produto nunca é inventado. O "mm" só
     entra quando a descrição do catálogo termina no número do DN (a unidade do DN do catálogo é o milímetro). */
  function produtoDoAcessorio(ac) {
    var PC = PEC(), fc = null, f0 = null;
    try { fc = PC && PC.acessorio ? PC.acessorio(txt(ac.acessorio), ac.variante || null, ac.dn) : null; } catch (e) { fc = null; }
    f0 = fc && fc.comercial && arr(fc.comercial.fabricante)[0];
    if (!f0 || !txt(f0.descricao).trim() || !txt(f0.fabricante).trim()) return "";
    var d = txt(f0.descricao).trim(); if (/\d$/.test(d)) d += " mm";
    return d + " - " + txt(f0.fabricante).trim().toUpperCase();
  }
  function folhaPerspectiva(c) {
    var D = c.D, a = c.areaPersp || c.geo.area, T = D.E.T, KI = HI().K, pz = c.persp, h = KI.hPeq;
    /* R01: o isométrico por ambiente (hidcaderno.js) usa esta mesma perspectiva dentro de um RETÂNGULO da folha (c.areaPersp), sem título nem legenda própria (c.semLegenda) */
    if (!c.semLegenda) c.AP.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "SEM ESCALA - isométrico 30°, vista " + (pz.vistaNome || pz.vista) + "; alturas em m do piso acabado");
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
      isoReferencia(c, D, pz, X);
    } else {
    D.add('<polygon points="' + pz.piso.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="none" stroke="' + K2.isoRef.corParede + '" stroke-width="' + n(K2.isoRef.penaParede) + '" data-cam="HID-CONTEXTO"/>');
    pz.faces.sort(function (p, q) { return p.d - q.d; }).forEach(function (f) {
      D.add('<polygon points="' + f.pts.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="none" stroke="' + K2.isoRef.corParede + '" stroke-width="' + n(K2.isoRef.penaParede) + '" data-cam="HID-CONTEXTO"/>');
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
    var rot = gruposRotulo(pz.trs, c.ix, KI), PDr = PAD(), mostraCalc = !(c.cfg && c.cfg.mostrarCalculo === false);
    var temAgua = arr(pz.trs).some(function (t0) { return /^agua/.test(t0.sistema); });
    pz.itens.forEach(function (it) {
      if (it.tipo !== "tubo" || !it.A) return;
      var t = it.t, vert = t.vertical, Lm = dist3d(t.p1, t.p2);
      if (vert ? Lm < K2.perspVertMin : !rot[t.id]) return;
      var inf = (c.ix[t.sistema] || {})[t.id], dn = inf && inf.dn != null ? inf.dn : t.dn, sg = CAMADA_SIS[t.sistema] || "";
      var txt0 = sg + " " + dnRotulo(t, inf, true);
      if (mostraCalc && /^esgoto$/.test(t.sistema) && inf && inf.uhc != null) txt0 += "  UHC(" + br(inf.uhc, K2.calc.casasUhc).replace(/,0+$/, "") + ")";   /* UHC acumulado de contribuição do resultado */
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
      var ligAgua = arr(pz.trs).some(function (t0) { return t0.id === l.trecho && /^agua/.test(t0.sistema); }), pc = mostraCalc && temAgua && ligAgua ? textoPressao(c.ix, l.famInst) : null;   /* a pressão só vai na folha que tem a rede de água */
      if (pc) pend.push({ s: pc, h: h, tipo: "aparelho", camada: "HID-TEXTO", trecho: l.trecho + "-pr", anchors: [p], prio: 1, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 * K2.calc.afasta });
    });
    pz.acess.forEach(function (ac) {
      var p = X(pz.P(ac.centro)), alt = ac.centro.y - pz.pv.cota;
      pend.push({ s: txt(({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[ac.acessorio] || "RG") + "  " + (alt >= 0 ? "+" : "") + br(alt, 2), h: h, tipo: "registro", camada: "HID-TEXTO", trecho: ac.id, anchors: [p], prio: 1, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
      /* a CHAMADA COM O NOME DO PRODUTO (referência do Rogério, 14/11: "Registro Esfera VS Soldável 25 mm - TIGRE") no isométrico da caixa d'água */
      var nomeP = !(c.cfg && c.cfg.chamadaProduto === false) ? produtoDoAcessorio(ac) : ""; if (nomeP) pend.push({ s: nomeP, h: h, tipo: "registro", camada: "HID-TEXTO", trecho: ac.id + "-produto", anchors: [p], prio: 2, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 * 1.6 });
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
  /* ------------------------------------------------------------ FOLHA "PERSPECTIVA ISOMÉTRICA - PISCINA" (17/11/2026, pedido do Rogério)
   * Folha PRÓPRIA da piscina, separada da água fria: a rede da filtragem (sucção, recalque e retorno, hidromassagem, aquecimento, descarte e
   * drenagem, reposição) em isométrico 30°, cada sistema na SUA cor (nenhuma é a de AF, ES ou VE), o tanque (borda, nível d'água, fundo), a casa de
   * máquinas e as peças do modelo (silhueta real das famílias hid-pisc-*), o DN por corrida, a COTA de cada peça em relação à borda (±0,00) e a
   * chamada com o NOME DO PRODUTO. SÓ O QUE O MODELO TEM: peça que não está no modelo não aparece; sem rede de piscina a folha não sai. */
  function temPiscina(rede) { return arr(rede && rede.trechos).some(function (t) { return /^pisc_/.test(t.sistema); }); }
  function projPsc(p) { var an = PSC.ang * Math.PI / 180; return { u: (p.x - p.z) * Math.cos(an), v: (p.x + p.z) * Math.sin(an) - p.y, d: p.x + p.y + p.z }; }
  /* a CORRIDA CONTÍNUA de cada sistema (trechos ligados do mesmo sistema e do mesmo DN, em qualquer direção): UM rótulo de DN, no trecho mais longo dela.
     Corrida muito comprida (mais de PSC.extraDist de um rótulo já posto, ao longo do tubo) ganha mais um rótulo no trecho longo que fica longe dos outros. */
  function corridasPsc(trs) {
    var pai = {}, TL = PSC.tolNo;
    trs.forEach(function (t) { pai[t.id] = t.id; });
    function raiz(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    function perto(p, q) { return Math.abs(p.x - q.x) <= TL && Math.abs(p.y - q.y) <= TL && Math.abs(p.z - q.z) <= TL; }
    for (var i = 0; i < trs.length; i++) for (var j = i + 1; j < trs.length; j++) {
      var a = trs[i], b = trs[j];
      if (a.sistema !== b.sistema || String(a.dn) !== String(b.dn)) continue;
      if (perto(a.p1, b.p1) || perto(a.p1, b.p2) || perto(a.p2, b.p1) || perto(a.p2, b.p2)) pai[raiz(a.id)] = raiz(b.id);
    }
    var grupos = {}, out = {};
    trs.forEach(function (t) { (grupos[raiz(t.id)] = grupos[raiz(t.id)] || []).push(t); });
    function meio(t) { return { x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 }; }
    Object.keys(grupos).forEach(function (r) {
      var g = grupos[r].slice().sort(function (p, q) { return dist3d(q.p1, q.p2) - dist3d(p.p1, p.p2); }), postos = [];
      g.forEach(function (t, k) {
        var L = dist3d(t.p1, t.p2); if (L < PSC.minRot) return;
        var m = meio(t);
        if (k === 0 || (L >= PSC.extraMin && postos.every(function (q) { return dist3d(q, m) > PSC.extraDist; }))) { out[t.id] = true; postos.push(m); }
      });
    });
    return out;
  }
  function produtoPsc(f) { var p = txt(f && f.inst && f.inst.Produto).trim(); return p ? p.toUpperCase() : ""; }
  /* o trecho recortado na região (x,z) — Liang-Barsky no plano; null se não toca */
  function recortePsc(t, R) {
    var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, t0 = 0, t1 = 1, P = [-dx, dx, -dz, dz], Q = [t.p1.x - R.x0, R.x1 - t.p1.x, t.p1.z - R.z0, R.z1 - t.p1.z];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; } else { var tt = Q[i] / P[i]; if (P[i] < 0) { if (tt > t1) return null; if (tt > t0) t0 = tt; } else { if (tt < t0) return null; if (tt < t1) t1 = tt; } }
    }
    if (t1 - t0 < 1e-9) return null;
    function pt(u) { return { x: t.p1.x + (t.p2.x - t.p1.x) * u, y: t.p1.y + (t.p2.y - t.p1.y) * u, z: t.p1.z + (t.p2.z - t.p1.z) * u }; }
    var c = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) c[k] = t[k]; c.p1 = pt(t0); c.p2 = pt(t1); return c;
  }
  function folhaPiscina(c) {
    var D = c.D, a = c.geo.area, KI = HI().K, h = KI.hPeq, T = D.E.T, est = c.modelo.estado, aval = c.modelo.avaliarFam, AP0 = c.AP;
    var trs = arr(c.rede.trechos).filter(function (t) { return /^pisc_/.test(t.sistema) && t.p1 && t.p2; });
    var cxs = arr(c.rede.conexoes).filter(function (k) { return /^pisc_/.test(k.sistema); });
    var fams = arr(est && est.familias).filter(function (f) { return /^hid-pisc-/.test(txt(f.famId)); });
    var HPs = dep("HidPiscina", "./hidpiscina.js"), g = null;
    try { var rc = HPs && HPs.reconhecer ? HPs.reconhecer(est, {}) : null; arr(rc && rc.piscinas).forEach(function (q) { if (!g && q && q.ok !== false && arr(q.contorno).length >= 3) g = q; }); } catch (eG) { g = null; }
    var yRef = g && isFinite(g.yBorda) ? g.yBorda : 0, pres = PSC.sis.filter(function (s) { return trs.some(function (t) { return t.sistema === s; }); });
    function cotaTxt(y) { var v = Math.round((y - yRef) * 100) / 100; return (v > 0 ? "+" : (v < 0 ? "" : "±")) + br(v, 2); }
    var dirV = PSC.vistaDir, tanque = null;
    if (g) {
      var u0g = g.eixo && g.eixo.u ? g.eixo.u : { x: 1, z: 0 }, s0g = g.eixo && isFinite(g.eixo.s0) ? g.eixo.s0 : 0, s1g = g.eixo && isFinite(g.eixo.s1) ? g.eixo.s1 : 1, yA = isFinite(g.yAgua) ? g.yAgua : yRef;
      var pr0 = isFinite(g.profRasa) ? g.profRasa : g.profMedia, pr1 = isFinite(g.profFunda) ? g.profFunda : g.profMedia;
      var fundo = isFinite(pr0) && isFinite(pr1) ? g.contorno.map(function (q) { var tt = Math.abs(s1g - s0g) > 1e-9 ? (q.x * u0g.x + q.z * u0g.z - s0g) / (s1g - s0g) : 0; tt = Math.max(0, Math.min(1, tt)); return { x: q.x, y: yA - (pr0 + (pr1 - pr0) * tt), z: q.z }; }) : null;
      tanque = { borda: g.contorno.map(function (q) { return { x: q.x, y: g.yBorda, z: q.z }; }), agua: g.contorno.map(function (q) { return { x: q.x, y: yA, z: q.z }; }), fundo: fundo, yAgua: yA };
    }
    var seg3 = [], ancoras = [], regCasa = null;
    fams.forEach(function (f) {
      var ls = []; try { ls = linhasLoucas(est, aval, dirV, function (fi) { return fi.id === f.id; }); } catch (eL) { ls = []; }
      var bx = null; ls.forEach(function (sg) { sg.forEach(function (q) { if (!bx) bx = { x0: q[0], x1: q[0], y0: q[1], y1: q[1], z0: q[2], z1: q[2] }; bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); bx.z0 = Math.min(bx.z0, q[2]); bx.z1 = Math.max(bx.z1, q[2]); }); });
      var pa = bx ? { x: (bx.x0 + bx.x1) / 2, y: bx.y1, z: (bx.z0 + bx.z1) / 2 } : { x: f.x, y: f.y, z: f.z };
      seg3.push({ f: f, ls: ls, p: pa }); ancoras.push({ f: f, p: pa, yTag: f.y });
      if (f.famId === "hid-pisc-casa-maquinas" && bx) regCasa = { x0: bx.x0 - PSC.margemCasa, x1: bx.x1 + PSC.margemCasa, z0: bx.z0 - PSC.margemCasa, z1: bx.z1 + PSC.margemCasa, y0: bx.y0, y1: bx.y1 };
    });
    function dentroR(p, R) { return !!R && p.x >= R.x0 && p.x <= R.x1 && p.z >= R.z0 && p.z <= R.z1; }
    /* a casa de máquinas ficou DENSA? (muitas peças e tubos no mesmo pedaço): detalhe ampliado ao lado */
    var nFamC = regCasa ? ancoras.filter(function (o) { return o.f.famId !== "hid-pisc-casa-maquinas" && dentroR(o.p, regCasa); }).length : 0;
    var nTubC = regCasa ? trs.filter(function (t) { return dentroR({ x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }, regCasa); }).length : 0;
    var denso = !!regCasa && (nFamC >= PSC.densoFam || nTubC >= PSC.densoTubo);
    /* legenda (medida primeiro: a faixa de baixo tem a altura do que ela precisa) */
    var siglasPres = {}, listaSig = [];
    fams.forEach(function (f) { var q = PSC.fam[f.famId]; if (q && !siglasPres[q[0]]) { siglasPres[q[0]] = q[1]; listaSig.push(q); } });
    var xL = a.x + 4, wmax = a.w - 8, lh = h * 2.2;
    var nota = "Cotas em m, referidas à borda da piscina (" + (tanque ? "±0,00; N.A. " + cotaTxt(tanque.yAgua) : "cota do modelo") + "). DN em mm. Só as peças e tubos do modelo estão desenhados." + (denso ? " Detalhe A: casa de máquinas ampliada (sem escala)." : "");
    function legenda(desenha, y0) {
      var y = y0, x = xL;
      function tit(s) { if (desenha) D.texto(xL, y + h, s, h, { peso: 0.2 }); y += lh; x = xL; }
      function fluxo(ws, fn) { x = xL; ws.forEach(function (it) { var w = it.w; if (x + w > xL + wmax && x > xL) { x = xL; y += lh; } if (desenha) fn(it, x, y); x += w + 4; }); y += lh; }
      tit("SISTEMAS DA PISCINA");
      fluxo(pres.map(function (s) { var tx = PSC.sigla[s] + " - " + PSC.nome[s]; return { s: s, tx: tx, w: K2.quadro.icone + 1.5 + larg(tx, h) }; }), function (it, xx, yy) {
        poliCheio(D, [[xx, yy + h * 0.1], [xx + K2.quadro.icone, yy + h * 0.1], [xx + K2.quadro.icone, yy + h * 0.8], [xx, yy + h * 0.8]], PSC.cor[it.s], "#000", K2.contornoTubo, PSC.camada[it.s]);
        D.texto(xx + K2.quadro.icone + 1.5, yy + h, it.tx, h, {});
      });
      if (listaSig.length) {
        tit("PEÇAS (sigla e cota ao lado de cada peça no desenho)");
        fluxo(listaSig.map(function (q) { var tx = q[0] + " - " + q[1]; return { tx: tx, w: larg(tx, h) }; }), function (it, xx, yy) { D.texto(xx, yy + h, it.tx, h, {}); });
      }
      AP0.quebrar(nota, h, wmax).forEach(function (s) { if (desenha) D.texto(xL, y + h, s, h, {}); y += h * K2.notaLinha; });
      return y - y0;
    }
    var hLeg = legenda(false, 0) + PSC.folgaLeg, hTit = K2.titulo;
    AP0.tituloVista(D, a.x + 4, a.y + 2, c.titulo, "SEM ESCALA - isométrico " + PSC.ang + "°; cotas em m referidas à borda da piscina");
    var painel = null, areaP = { x: a.x, y: a.y, w: a.w, h: a.h };
    if (denso) {
      var pw = a.w * PSC.painelW, ph = (a.h - hTit - hLeg) * PSC.painelH;
      painel = { x: a.x + a.w - pw - 4, y: a.y + hTit + 2, w: pw, h: ph };
      areaP = { x: a.x, y: a.y, w: a.w - pw - 8, h: a.h };
    }
    /* UMA VISTA: o que se desenha e rotula numa área da folha. modo: "tudo" | "fora" (rotula só o que está fora da região R) | "dentro" (só o que toca a região R, recortado nela) */
    function vista(area, modo, R, o) {
      o = o || {};
      var seg = [], L = [], S = [], Tt = [], pend = [];   /* cada vista posiciona os próprios rótulos (a do detalhe não briga com a geral) */
      function obst(b) { S.push({ tipo: "obst", x: 0, y: 0, r: 0, camada: "HID-SIMBOLO", box: b, id: "obst" + S.length, desenhado: true }); }
      var tubosD = [], tubosR = [], cxsD, ancD, segD, tq = !!o.tanque;
      if (modo === "dentro") {
        trs.forEach(function (t) { var r = recortePsc(t, R); if (r) { tubosD.push(r); tubosR.push(r); } });
        cxsD = cxs.filter(function (k) { return dentroR(k, R); });
        ancD = ancoras.filter(function (o2) { return dentroR(o2.p, R); }); segD = seg3.filter(function (o2) { return dentroR(o2.p, R); });
      } else {
        tubosD = trs.slice(); tubosR = modo === "fora" ? trs.filter(function (t) { return !dentroR({ x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }, R); }) : trs.slice();
        cxsD = cxs; ancD = modo === "fora" ? ancoras.filter(function (o2) { return !dentroR(o2.p, R); }) : ancoras; segD = seg3;
      }
      var us = [], vs = [];
      function junta(p) { var q = projPsc(p); us.push(q.u); vs.push(q.v); }
      if (tq && tanque) { tanque.borda.forEach(junta); tanque.agua.forEach(junta); arr(tanque.fundo).forEach(junta); }
      tubosD.forEach(function (t) { junta(t.p1); junta(t.p2); }); cxsD.forEach(junta);
      segD.forEach(function (o2) { o2.ls.forEach(function (sg) { junta({ x: sg[0][0], y: sg[0][1], z: sg[0][2] }); junta({ x: sg[1][0], y: sg[1][1], z: sg[1][2] }); }); });
      ancD.forEach(function (o2) { junta(o2.p); });
      if (modo === "fora" && R) [R.y0, R.y1].forEach(function (yy) { [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]].forEach(function (q) { junta({ x: q[0], y: yy, z: q[1] }); }); });
      if (!us.length) return;
      var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
      var mgX = o.mgX != null ? o.mgX : PSC.margemX, mgY = o.mgY != null ? o.mgY : PSC.margem, hT0 = o.semTitulo ? 0 : hTit, hL0 = o.semLegenda ? 0 : hLeg;
      var k = Math.min((area.w - 2 * mgX) / Math.max(u1 - u0, 1e-6), (area.h - hT0 - hL0 - 2 * mgY) / Math.max(v1 - v0, 1e-6), o.kMax || PSC.kMax);
      var ox = area.x + (area.w - (u1 - u0) * k) / 2 - u0 * k, oy = area.y + hT0 + mgY + (area.h - hT0 - hL0 - 2 * mgY - (v1 - v0) * k) / 2 - v0 * k;
      function X(p) { var q = projPsc(p); return [q.u * k + ox, q.v * k + oy]; }
      function poli3(pts, fill, op, cam, cor) { D.add('<polygon points="' + pts.map(function (p) { var q = X(p); return n(q[0]) + "," + n(q[1]); }).join(" ") + '" fill="' + fill + '"' + (op != null ? ' fill-opacity="' + op + '"' : "") + ' stroke="' + (cor || K2.arq.contorno) + '" stroke-width="' + n(K2.arq.mm) + '" data-cam="' + cam + '"/>'); }
      if (tq && tanque) {
        if (tanque.fundo) { poli3(tanque.fundo, "none", null, "HID-PSC-FUNDO", PSC.corFundo); tanque.borda.forEach(function (p, i) { var q = X(p), r = X(tanque.fundo[i]); D.linha(q[0], q[1], r[0], r[1], "HID-PSC-FUNDO"); }); }
        poli3(tanque.agua, PSC.corAgua, PSC.alfaAgua, "HID-PSC-NA", PSC.corAgua);
        poli3(tanque.borda, "none", null, "HID-CONTEXTO", K2.arq.contorno);
      }
      segD.forEach(function (o2) { o2.ls.forEach(function (sg) { var A0 = X({ x: sg[0][0], y: sg[0][1], z: sg[0][2] }), B0 = X({ x: sg[1][0], y: sg[1][1], z: sg[1][2] }); D.linha(A0[0], A0[1], B0[0], B0[1], "HID-LOUCA"); }); });
      var itens = [];
      tubosD.forEach(function (t) { itens.push({ tipo: "tubo", t: t, d: (t.p1.x + t.p2.x + t.p1.y + t.p2.y + t.p1.z + t.p2.z) / 2 }); });
      cxsD.forEach(function (kx) { itens.push({ tipo: "cx", k: kx, d: kx.x + kx.y + kx.z + PSC.rConexao * 0.1 }); });
      itens.sort(function (p, q) { return p.d - q.d; });
      var porId = {};
      itens.forEach(function (it) {
        if (it.tipo === "cx") {
          var pc = X(it.k), r = Math.max((it.k.dn || 0) / 1000 * PSC.rConexao * k, K2.perspMin);
          D.add('<circle cx="' + n(pc[0]) + '" cy="' + n(pc[1]) + '" r="' + n(r) + '" fill="#ffffff" stroke="#000" stroke-width="' + n(K2.contornoTubo * 2) + '" data-cam="HID-CONEXAO"/>');
          obst([pc[0] - r * PSC.caixaConexao, pc[1] - r * PSC.caixaConexao, pc[0] + r * PSC.caixaConexao, pc[1] + r * PSC.caixaConexao]); return;
        }
        var t = it.t, A = X(t.p1), Bp = X(t.p2), dx = Bp[0] - A[0], dy = Bp[1] - A[1], Ls = Math.sqrt(dx * dx + dy * dy); if (Ls < 1e-6) return;
        var de = isFinite(+t.diametro) && +t.diametro > 0 ? +t.diametro : (+t.dn || 0) / 1000, w = Math.max(de * k, K2.perspMin) / 2, nx = -dy / Ls * w, ny = dx / Ls * w;
        var pts = [[A[0] + nx, A[1] + ny], [Bp[0] + nx, Bp[1] + ny], [Bp[0] - nx, Bp[1] - ny], [A[0] - nx, A[1] - ny]];
        poliCheio(D, pts, PSC.cor[t.sistema] || "#000", "#000", K2.contornoTubo, PSC.camada[t.sistema] || "HID-SIMBOLO");
        for (var e = 0; e < 4; e++) { var s0 = pts[e], s1 = pts[(e + 1) % 4]; seg.push([s0[0], s0[1], s1[0], s1[1]]); c.chk.tubos.push([s0[0], s0[1], s1[0], s1[1]]); }
        porId[t.id] = { A: A, Bp: Bp, Ls: Ls };
      });
      /* DN: um rótulo por corrida contínua (mesmo sistema e DN) */
      var rot = corridasPsc(tubosR);
      tubosR.forEach(function (t) {
        var pi = porId[t.id]; if (!pi || !rot[t.id]) return;
        pend.push({ s: PSC.sigla[t.sistema] + " " + (t.dn != null ? "ø" + t.dn : "DN a confirmar"), h: h, tipo: "dn", camada: "HID-TEXTO", trecho: t.id + (modo === "dentro" ? "-det" : ""), anchors: KI.ancoras.map(function (f) { return [pi.A[0] + (pi.Bp[0] - pi.A[0]) * f, pi.A[1] + (pi.Bp[1] - pi.A[1]) * f]; }), prio: 3, comprimento: pi.Ls, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
      });
      /* peças iguais, na mesma cota e juntas no papel: UM rótulo ("3× RE -1,12") */
      var chamadaOn = !(c.cfg && c.cfg.chamadaProduto === false), cl = [];
      ancD.forEach(function (o2) {
        var f = o2.f, q = PSC.fam[f.famId]; if (!q) return;
        var p = X(o2.p), tag = q[0] + "  " + cotaTxt(o2.yTag), pr = produtoPsc(f), nome = chamadaOn && (pr || !/^hid-pisc-registro$/.test(f.famId)) ? q[1] + (pr ? " - " + pr : "") : "", hit = null;
        cl.forEach(function (z) { if (!hit && z.tag === tag && z.nome === nome && Math.hypot(z.p[0] - p[0], z.p[1] - p[1]) <= PSC.agrupaMm) hit = z; });
        if (hit) { hit.n++; hit.pts.push(p); hit.ids.push(f.id); } else cl.push({ tag: tag, nome: nome, p: p, pts: [p], n: 1, ids: [f.id] });
      });
      cl.forEach(function (z) {
        var cen = z.pts.reduce(function (s2, q) { return [s2[0] + q[0] / z.pts.length, s2[1] + q[1] / z.pts.length]; }, [0, 0]), pre = z.n > 1 ? z.n + "× " : "";
        S.push({ tipo: "ponto", x: cen[0], y: cen[1], r: KI.rPonto, camada: "HID-SIMBOLO", box: [cen[0] - KI.rPonto, cen[1] - KI.rPonto, cen[0] + KI.rPonto, cen[1] + KI.rPonto], id: z.ids[0] + (modo === "dentro" ? "-det" : "") });
        pend.push({ s: pre + z.tag, h: h, tipo: "aparelho", camada: "HID-TEXTO", trecho: z.ids[0] + (modo === "dentro" ? "-det" : ""), anchors: z.pts, prio: 0, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 });
        if (z.nome) pend.push({ s: pre + z.nome, h: h, tipo: "registro", camada: "HID-TEXTO", trecho: z.ids[0] + "-produto" + (modo === "dentro" ? "-det" : ""), anchors: z.pts, prio: 2, chamadaMin: K2.chamadaPlanta, d0: K2.perspD0 * 1.6 });
      });
      if (tq && tanque) {
        var cantos = tanque.borda.map(X).sort(function (p0, q0) { return q0[1] - p0[1]; })[0], cw = tanque.agua.map(X).sort(function (p0, q0) { return p0[1] - q0[1]; })[0];
        pend.push({ s: "BORDA ±0,00", h: h, tipo: "nivel", camada: "HID-TEXTO", trecho: "borda", anchors: [cantos], prio: 0, d0: K2.perspD0 });
        pend.push({ s: "N.A. " + cotaTxt(tanque.yAgua), h: h, tipo: "nivel", camada: "HID-TEXTO", trecho: "na", anchors: [cw], prio: 0, d0: K2.perspD0 });
      }
      /* a marca do detalhe na vista geral: o retângulo da casa de máquinas e a letra A */
      if (modo === "fora" && R) {
        var yT = R.y1, cantosR = [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]].map(function (q) { return { x: q[0], y: yT, z: q[1] }; });
        poli3(cantosR, "none", null, "HID-PSC-DET", "#000");
        var pa0 = cantosR.map(X).sort(function (p0, q0) { return p0[1] - q0[1]; })[0];
        pend.push({ s: "DETALHE A", h: h, tipo: "nivel", camada: "HID-TEXTO", trecho: "marca-detalhe", anchors: [pa0], prio: 0, d0: K2.perspD0 * 2 });
      }
      if (painel && modo !== "dentro") obst([painel.x - 1, painel.y - 1, painel.x + painel.w + 1, painel.y + painel.h + 1]);
      HI().afastar(pend, S, L, Tt, seg, c.avisos);
      desenhar(D, { linhas: L, simbolos: S, textos: Tt }, 0, 0, c.chk);
      c.prims.push({ linhas: L, simbolos: S, textos: Tt, trechos: tubosD.map(function (t) { return t.id; }) });
    }
    vista(areaP, denso ? "fora" : "tudo", regCasa, { tanque: true });
    if (painel) {
      D.ret(painel.x, painel.y, painel.w, painel.h, "HID-TABELA");
      D.texto(painel.x + 3, painel.y + h * 1.6, "DETALHE A - CASA DE MÁQUINAS (ampliado, sem escala)", h, { peso: 0.2 });
      vista({ x: painel.x, y: painel.y + h * 2.4, w: painel.w, h: painel.h - h * 2.4 }, "dentro", regCasa, { tanque: false, semTitulo: true, semLegenda: true, mgX: PSC.painelMg, mgY: PSC.painelMg, kMax: PSC.kMaxDet });
    }
    legenda(true, a.y + a.h - hLeg + T.nota);
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
    c.AP.tituloVista(D, a.x + 4, a.y + 2, c.tituloEsq || ("ESQUEMA VERTICAL - " + (cxs.length ? "RESERVAÇÃO, BARRILETE, " : "") + "ÁGUA FRIA E ESGOTO"), "SEM ESCALA - níveis em m");
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
      return filtraLeg(linhas.concat([["rg", "Registro de gaveta (RG)"], ["rp", "Registro de pressão (RP)"], ["registro", "Registro de esfera (RE) / válvula de retenção (VR)"],
            ["cx:joelho90", "Joelho 90° / 45° (J)"], ["cx:curva90", "Curva 90° / 45° (C)"], ["cx:te", "Tê 90° (T)"], ["cx:juncao", "Junção 45° (Y)"], ["cx:luva", "Luva (L)"], ["cx:curva_transposicao", "Curva de transposição (" + K2.simbCx.sigla + ")"], ["cx:reducao", "Redução (RD)"], ["cx:cap", "Cap / plugue (P)"], ["ponto", "Ponto de utilização (altura em m do piso acabado)"], ["caixa", "Caixa sifonada / ralo / caixa"], ["balao", "Coluna de AF (AF-n) / sub-ramal (SR-n) / tubo de queda (TQ-n)"], ["cota", "Cota de comprimento (cm)"]]));
    }
    if (S0.agua_quente) extra.push(["linhaAQ", "Água quente (AQ)"]);
    if (S0.pluvial) extra.push(["linhaAP", "Águas pluviais (AP) - seta = sentido do escoamento"]);
    if (S0.industrial) extra.push(["linhaIND", "Fluido industrial (IND) - tubulação marrom"]);
    if (S0.gas) extra.push(["linhaGAS", "Gás GLP (GAS) - cobre embutido, tubulação amarela"]);
    if (S0.incendio) extra.push(["linhaIN", "Incêndio (IN) - tubulação vermelha"], ["hidrante", "Hidrante / mangotinho"], ["extintor", "Extintor portátil"], ["cobertura", "Raio de cobertura do hidrante (alcance da mangueira)"], ["chuveiro", "Chuveiro automático (NBR 10897)"]);
    return filtraLeg(extra.concat([["linhaAF", "Água fria (AF)"], ["linhaES", "Esgoto (ES) - seta = sentido do escoamento"], ["linhaVE", "Ventilação (VE)"], ["rg", "Registro de gaveta (RG)"], ["rp", "Registro de pressão (RP)"], ["registro", "Registro de esfera (RE) / válvula de retenção (VR)"],
            ["cx:joelho90", "Joelho 90° / 45° (J)"], ["cx:curva90", "Curva 90° / 45° (C)"], ["cx:te", "Tê 90° (T)"], ["cx:juncao", "Junção 45° (Y)"], ["cx:luva", "Luva (L)"], ["cx:reducao", "Redução (RD)"], ["cx:cap", "Cap / plugue (P)"], ["ponto", "Ponto de utilização (altura em m do piso acabado)"], ["caixa", "Caixa sifonada / ralo / caixa"], ["balao", "Coluna de AF (AF-n) / sub-ramal (SR-n) / tubo de queda (TQ-n)"], ["cota", "Cota de comprimento (cm)"]]));
  }
  function filtraLeg(l) { return l.filter(function (q) { return legendaExiste(q[0]); }); }
  function simboloLeg(D, tipo, x, y) {
    var KI = HI().K;
    if (/^cx:/.test(tipo)) {
      var tc = tipo.slice(3), S2 = Math.SQRT1_2, pn = /^joelho/.test(tc) ? [[-1, 0], [0, 1]] : /^curva/.test(tc) ? [[-1, 0], [0, 1]] : /^te/.test(tc) ? [[-1, 0], [1, 0], [0, 1]] : /^juncao/.test(tc) ? [[-1, 0], [1, 0], [-S2, S2]] : [[1, 0]];
      if (/^curva_transposicao/.test(tc)) pn = [[1, 0]];
      var L0 = 2.6; pn.forEach(function (d) { D.linha(x, y, x + d[0] * L0, y + d[1] * L0, "HID-AF-TUBO"); });
      if (/^luva|^reducao|^cap|^curva_transposicao/.test(tc)) D.linha(x - L0, y, x + (/^cap/.test(tc) ? 0 : L0), y, "HID-AF-TUBO");
      simbCx(D, tc, x, y, pn, "#000"); return;
    }
    if (tipo === "rg" || tipo === "rp") {
      var r0 = KI.regC / 2; D.linha(x - 2.5, y, x - r0, y, "HID-AF-TUBO"); D.linha(x + r0, y, x + 2.5, y, "HID-AF-TUBO");
      D.poli([[x - r0, y - r0], [x + r0, y + r0], [x + r0, y - r0], [x - r0, y + r0]], "HID-SIMBOLO", true);
      D.linha(x, y, x, y - r0 * 1.8, "HID-SIMBOLO");
      if (tipo === "rp") D.circ(x, y - r0 * 2.3, r0 * 0.5, "HID-SIMBOLO"); else D.linha(x - r0 * 0.7, y - r0 * 1.8, x + r0 * 0.7, y - r0 * 1.8, "HID-SIMBOLO");
      return;
    }
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
    function humano(x) { var y = M.chaveHumana ? M.chaveHumana(M.limpaFonte ? M.limpaFonte(x) : x) : x; y = (M.rotuloTema && M.rotuloTema(y)) || y; /* nunca o id interno do modelo/trecho na prancha ("trecho ambsbac-parede-es-2"): lowercase com 2+ hífens */
      return txt(y).replace(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}\b/g, "do modelo").replace(/\s+/g, " ").trim(); }
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
    "ø diâmetro nominal (mm) · i declividade (%) · +0,60 altura do piso acabado (m)"];
  /* LEGENDA - PONTOS HIDRÁULICOS: as linhas (peça, sigla) SÓ das peças que existem no modelo; a sigla vem dos mesmos lugares dos rótulos da folha
     (nomeAparelhoFn = tabela de alturas do kit; rotuloPeca/siglaPeca = caixas e ralos; a sigla do registro = a da planta) */
  function linhasLegendaPontos(modelo, rede, nomeAp) {
    var LT = K2.legTab, tem = {}, NV = NIV();
    arr(modelo && modelo.estado && modelo.estado.familias).forEach(function (f) { var sg = nomeAp(f.id); if (sg) tem[sg] = 1; });
    arr(rede && rede.acessorios).forEach(function (a) { var sg = LT.acess[a.acessorio]; if (sg) tem[sg] = 1; });
    arr(rede && rede.pecas).forEach(function (k) { var sg = NV && NV.siglaPeca ? NV.siglaPeca(k.peca) : null; if (sg) tem[sg] = 1; });
    return LT.pecas.filter(function (r) { return tem[r[0]]; }).map(function (r) { return [r[1], r[0]]; });
  }
  function alturaLinhaTab(AP0, nome, h, w) { var LT = K2.legTab, ls = AP0.quebrar(nome, h, w - LT.colSigla - LT.folga * 2); return Math.max(h * LT.linha, ls.length * h * K2.notaLinha + LT.folga); }
  function medirTabela(AP0, b, h, w, hTit) {
    var tot = hTit * K2.tituloEntre + 1.5 + h * K2.legTab.linha;
    b.tabela.forEach(function (r) { tot += alturaLinhaTab(AP0, r[0], h, w); });
    return tot + K2.blocoEntre;
  }
  /* desenha o título, o cabeçalho cinza e as linhas zebradas (estilo do quadro de materiais); devolve o y seguinte */
  function desenharTabela(D, AP0, b, x0, y, w, h, hTit) {
    var LT = K2.legTab, hc = h * LT.linha, xs = x0 + w - LT.colSigla;
    D.texto(x0, y + hTit * KI0(), b.titulo, hTit, { peso: 0.26 }); y += hTit * K2.tituloEntre + 1.5;
    D.fundo(x0, y, w, hc, LT.corCab);
    D.texto(x0 + LT.folga, y + hc / 2 + h * 0.36, LT.cab[0], h, { peso: 0.2 }); D.texto(xs + LT.colSigla / 2, y + hc / 2 + h * 0.36, LT.cab[1], h, { al: "C", peso: 0.2 });
    var yIni = y; y += hc;
    b.tabela.forEach(function (r, i) {
      var ls = AP0.quebrar(r[0], h, w - LT.colSigla - LT.folga * 2), ah = alturaLinhaTab(AP0, r[0], h, w);
      if (i % 2 === 0) D.fundo(x0, y, w, ah, LT.corZebra);
      ls.forEach(function (sl, q) { D.texto(x0 + LT.folga, y + ah / 2 - (ls.length - 1) * h * K2.notaLinha / 2 + q * h * K2.notaLinha + h * 0.36, sl, h, {}); });
      D.texto(xs + LT.colSigla / 2, y + ah / 2 + h * 0.36, r[1], h, { al: "C", peso: 0.2 });
      y += ah; D.linha(x0, y, x0 + w, y, "HID-COTA");
    });
    D.linha(x0, yIni, x0, y, "HID-TABELA"); D.linha(x0 + w, yIni, x0 + w, y, "HID-TABELA"); D.linha(xs, yIni, xs, y, "HID-TABELA"); D.linha(x0, yIni, x0 + w, yIni, "HID-TABELA");
    return y + K2.blocoEntre;
  }
  /* a altura que a coluna precisa com a letra h (legenda + blocos) */
  function medirColuna(leg, blocos, h, wmax, hLegTit) {
    var AP0 = AP(), tot = hLegTit * K2.tituloEntre + 1.5;
    leg.forEach(function (it) { tot += Math.max(K2.legLinha, AP0.quebrar(it[1], h, wmax - K2.legTexto).length * h * K2.notaLinha + K2.notaEntre); });
    tot += K2.blocoEntre;
    blocos.forEach(function (b) {
      if (b.tabela) { tot += medirTabela(AP0, b, h, wmax, hLegTit); return; }
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
    var ficam = blocos.slice(), saem = [], ordemSai = ["NORMAS USADAS NO CÁLCULO", "NOTAS GERAIS", "CONVENÇÕES", K2.legTab.titulo, "ITENS A CONFIRMAR"];
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
      if (b.tabela) { y = desenharTabela(D, AP0, b, x0, y, wmax, h, hLegTit); return; }
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
      if (desenharQr(D, opc.qr, xq, yq, K2.qr)) {
        D.texto(col.x + col.w / 2, yq - K2.qrTexto * 0.5, K2.qrRot + " (aponte a câmera)", K2.qrTexto, { al: "C", peso: 0.16 });
        /* folha de ambiente: o rótulo do que o QR abre vai EMBAIXO do QR (a folga entre o QR e o carimbo) */
        if (opc.qrAmb) D.texto(col.x + col.w / 2, yq + K2.qr + K2.qrTexto * 1.1, rotuloQrAmb(opc.qrAmb, K2.qrTexto, col.w - 2 * K2.qrTexto), K2.qrTexto, { al: "C", peso: 0.16 });
      }
    }
    return y <= yMax + 0.5;
  }
  function KI0() { return HI().K.base; }

  /* hid:fisica-fim */
  /* ------------------------------------------------------------ ISOMÉTRICOS (PRANCHA ÚNICA) — 15/11/2026
   * Referência do Rogério: a prancha "PROJETO HIDROSSANITÁRIO" com vários isométricos arrumados, cada um com o NÚMERO num círculo à esquerda do
   * título e o TÍTULO embaixo da vista, com uma linha. Uma folha grande (A0; A1 se a pessoa escolher) por pavimento: 1 "ISO - GERAL" (a rede toda do
   * pavimento, na metade de cima à esquerda), "AF - <AMBIENTE>" e "ES - <AMBIENTE>" em grade e, por último, "CAIXA D'ÁGUA". Passou da folha, abre a seguinte. */
  /* a grade de células (mm de papel) da área útil: o GERAL ocupa geral x geral células no canto superior esquerdo da primeira folha */
  function gradeIsos(a, primeira) {
    var K = K2.isos, cw = (a.w - (K.colunas - 1) * K.gap) / K.colunas, ch = (a.h - (K.linhas - 1) * K.gap) / K.linhas, cel = [], q, r;
    function rect(q0, r0, nq, nr) { return { x: a.x + q0 * (cw + K.gap), y: a.y + r0 * (ch + K.gap), w: nq * cw + (nq - 1) * K.gap, h: nr * ch + (nr - 1) * K.gap }; }
    for (r = 0; r < K.linhas; r++) for (q = 0; q < K.colunas; q++) { if (primeira && q < K.geral && r < K.geral) continue; cel.push(rect(q, r, 1, 1)); }
    return { geral: primeira ? rect(0, 0, K.geral, K.geral) : null, celulas: cel };
  }
  /* uma vista dentro de um retângulo: a perspectiva (com a FOTO do modelo quando há) na área de cima; embaixo, a linha, o número no círculo e o título */
  function vistaNumerada(c, rect, num0, titulo, pz, esquema) {
    var D = c.D, K = K2.isos, T = D.E.T, hv = rect.h - K.faixa, cp = {}, k0, r = K.circulo;
    for (k0 in c) if (Object.prototype.hasOwnProperty.call(c, k0)) cp[k0] = c[k0];
    cp.cfg = {}; for (k0 in c.cfg) if (Object.prototype.hasOwnProperty.call(c.cfg, k0)) cp.cfg[k0] = c.cfg[k0];
    cp.cfg.mostrarCalculo = false;   /* vista pequena: o cálculo (pressões, UHC) fica nas folhas de isométrico por sistema */
    cp.persp = pz; cp.raster = esquema ? null : rasterDe(pz); cp.areaPersp = { x: rect.x, y: rect.y, w: rect.w, h: hv }; cp.semLegenda = true; cp.perspKMax = K.kMax; cp.perspMargem = K.margem; cp.titulo = "";
    if (esquema) folhaEsquemaIso(cp); else folhaPerspectiva(cp);
    var yl = rect.y + hv, yc = yl + K.faixa / 2, xc = rect.x + r, sub = "SEM ESCALA", wSub = larg(sub, T.escala), hT = T.titulo, xt = xc + r + r / 2, disp = rect.w - (xt - rect.x) - wSub - r;
    D.linha(rect.x, yl, rect.x + rect.w, yl, "HID-SIMBOLO");
    D.circ(xc, yc, r, "HID-SIMBOLO");
    D.texto(xc, yc, String(num0), T.detalhe, { al: "C", meio: true, attr: ' data-detalhe="' + num0 + '"' });
    if (larg(titulo, hT) > disp) hT = hT * disp / larg(titulo, hT) * K.fracTitulo;
    D.texto(xt, yc, titulo, hT, { peso: K.penaTitulo, meio: true, attr: ' data-titulo="1"' });
    D.texto(rect.x + rect.w, yc, sub, T.escala, { al: "D", meio: true });
    return cp;
  }
  /* a rede filtrada por sistemas (a perspectiva do ambiente sai só com o AF ou só com o ES) */
  function ctxSistemas(c, quer) {
    var cc = {}, k0, r = {}, ids = {};
    for (k0 in c) if (Object.prototype.hasOwnProperty.call(c, k0)) cc[k0] = c[k0];
    for (k0 in c.rede) if (Object.prototype.hasOwnProperty.call(c.rede, k0)) r[k0] = c.rede[k0];
    r.trechos = arr(c.rede.trechos).filter(function (t) { return quer.indexOf(t.sistema) >= 0; }); r.trechos.forEach(function (t) { ids[t.id] = 1; });
    r.conexoes = arr(c.rede.conexoes).filter(function (x) { return quer.indexOf(x.sistema) >= 0; });
    r.pecas = arr(c.rede.pecas).filter(function (x) { return quer.indexOf(x.sistema) >= 0; });
    r.ligacoes = arr(c.rede.ligacoes).filter(function (l) { return ids[l.trecho]; });
    r.acessorios = arr(c.rede.acessorios).filter(function (x) { return !x.sistema || quer.indexOf(x.sistema) >= 0; });
    cc.rede = r; cc.redeTotal = c.redeTotal || c.rede;
    return cc;
  }
  /* as vistas do pavimento, na ordem da folha: GERAL, AF/ES por ambiente, CAIXA D'ÁGUA (se houver reservatório) */
  function vistasIsos(c, pv, ambientes, sistemas, pavs) {
    var K = K2.isos, out = [], sufixo = pavs.length > 1 ? " - " + pv.nome.toUpperCase() : "", b0 = pv.base != null ? pv.base : pv.cota - K2.cortePiso, b1 = pv.sup != null ? pv.sup : pv.topo, tol = HI().K.tolPiso_m;
    var xs = [], zs = [];
    arr(c.rede.trechos).forEach(function (t) {
      var ym = (t.p1.y + t.p2.y) / 2; if (t.sistema === "incendio" || ym < b0 - tol || ym >= b1) return;
      xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z);
    });
    if (!xs.length) return out;
    var fo = K2.folgaAmb, ger = null;
    try { ger = perspectivaDe(c, { x0: Math.min.apply(null, xs) - fo, x1: Math.max.apply(null, xs) + fo, z0: Math.min.apply(null, zs) - fo, z1: Math.max.apply(null, zs) + fo }, pv); } catch (e) { ger = null; c.avisos.push("ISO - GERAL: " + (e && e.message || e)); }
    if (ger) out.push({ titulo: "ISO - GERAL" + sufixo, pz: ger, geral: true });
    [["AF", ["agua_fria", "agua_quente"]], ["ES", ["esgoto", "ventilacao"]]].forEach(function (g) {
      var quer = g[1].filter(function (x) { return sistemas.indexOf(x) >= 0 || (x === "ventilacao" && sistemas.indexOf("esgoto") >= 0); }); if (!quer.length) return;
      var cs = ctxSistemas(c, quer);
      ambientes.forEach(function (am) {
        if (!ambienteDoPav(c, am, pv)) return;   /* 17/11/2026: o ambiente só tem vista no pavimento dos aparelhos dele */
        var pz = null; try { pz = perspectivaDe(cs, am, pv); } catch (e2) { pz = null; c.avisos.push(g[0] + " - " + txt(am.nome) + ": " + (e2 && e2.message || e2)); }
        if (pz && perspVazia(pz)) pz = null;   /* só um toco de tubo: não há o que mostrar */
        if (pz) out.push({ titulo: g[0] + " - " + txt(am.nome).toUpperCase() + sufixo, pz: pz });
      });
    });
    /* CAIXA D'ÁGUA: as famílias de reservatório do modelo e os tubos ligados nelas até K.alcance (m) */
    var cxs = caixasReais(c.modelo).filter(function (q) { return isFinite(q.x) && isFinite(q.z) && isFinite(q.y) && q.y >= b0 - tol && q.y < b1; });
    /* 15/11/2026: com <= 1 ambiente hidráulico a vista da caixa d'água é o mesmo isométrico de outro ângulo (duplicata): não sai */
    if (cxs.length && arr(ambientes).length > 1) {
      var cx0 = [], cz0 = [], yMin = Infinity;
      cxs.forEach(function (q) { var m = (q.diametro || K.caixaMeia * 2) / 2; cx0.push(q.x - m, q.x + m); cz0.push(q.z - m, q.z + m); yMin = Math.min(yMin, q.y); });
      var pvC = {}; for (var kp in pv) if (Object.prototype.hasOwnProperty.call(pv, kp)) pvC[kp] = pv[kp];
      pvC.base = -Infinity; pvC.sup = Infinity; pvC.cota = Math.min(pv.cota, yMin);
      var pzC = null;
      try { pzC = perspectivaDe(c, { x0: Math.min.apply(null, cx0) - K.alcance, x1: Math.max.apply(null, cx0) + K.alcance, z0: Math.min.apply(null, cz0) - K.alcance, z1: Math.max.apply(null, cz0) + K.alcance }, pvC); } catch (e3) { pzC = null; c.avisos.push("CAIXA D'ÁGUA: " + (e3 && e3.message || e3)); }
      if (pzC) { pzC.produtos = true; out.push({ titulo: "CAIXA D'ÁGUA" + sufixo, pz: pzC }); }
    }
    return out;
  }
  /* as folhas do pavimento: a 1ª leva o GERAL (célula grande) e o resto da grade; as seguintes, a grade inteira. A numeração segue de uma folha para a outra. */
  function folhasIsos(vistas, geoI) {
    var fl = [], i = 0, num0 = 0;
    while (i < vistas.length) {
      var g = gradeIsos(geoI.area, !fl.length && vistas[0].geral === true), it = [];
      if (g.geral) { num0++; it.push({ rect: g.geral, num: num0, v: vistas[i++] }); }
      g.celulas.forEach(function (r0) { if (i < vistas.length) { num0++; it.push({ rect: r0, num: num0, v: vistas[i++] }); } });
      fl.push(it);
    }
    return fl;
  }
  function folhaIsos(c, df) {
    arr(df.itens).forEach(function (q) { blocoVista(c.D, "iso", "sem", q.rect, function () { vistaNumerada(c, q.rect, q.num, q.v.titulo, q.v.pz); }, q.v.pz && q.v.pz.chave); });
    return { escala: "SEM ESCALA" };
  }
  /* ------------------------------------------------------------ ETAPA 2: OCUPAÇÃO DA FOLHA (auditor)
   * Ocupação = área da CAIXA do desenho (linhas, polígonos, círculos, imagens; texto não conta) dentro da área útil, dividida pela área útil. Lê o SVG do corpo da folha
   * (o <g data-corpo>), então vale igual para a folha vetorial e para a que leva a foto do 3D. Uma folha com um toco de tubo dá poucos por cento. */
  function numerosDe(str) { var o = [], re = /-?\d*\.?\d+(?:e-?\d+)?/gi, m; while ((m = re.exec(str))) o.push(parseFloat(m[0])); return o; }
  function caixaDoSvg(svg) {
    var i0 = svg.indexOf('data-corpo="1"'), i1 = svg.indexOf("data-folha-moldura"), corpo = i0 >= 0 ? svg.slice(i0, i1 > i0 ? i1 : undefined) : svg;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nPrim = 0;
    function pt(x, y) { if (isFinite(x) && isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    var re = /<(line|rect|circle|polygon|polyline|path|image)\b([^>]*)>/g, m;
    while ((m = re.exec(corpo))) {
      var tag = m[1], at = atributos(m[2]), ok = true;
      if (tag === "line") { pt(+at.x1, +at.y1); pt(+at.x2, +at.y2); }
      else if (tag === "rect" || tag === "image") { if (/fill="#fff(fff)?"[^>]*stroke="none"/.test(m[2]) && tag === "rect") ok = false; else { pt(+at.x, +at.y); pt(+at.x + +at.width, +at.y + +at.height); } }
      else if (tag === "circle") { var r = +at.r || 0; pt(+at.cx - r, +at.cy - r); pt(+at.cx + r, +at.cy + r); }
      else if (tag === "polygon" || tag === "polyline") { var nn = numerosDe(at.points || ""); for (var k = 0; k + 1 < nn.length; k += 2) pt(nn[k], nn[k + 1]); }
      else if (tag === "path") { var cm = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi, mm; while ((mm = cm.exec(at.d || ""))) { var c1 = mm[1], ns = numerosDe(mm[2]); if (/[ML]/i.test(c1)) for (var q = 0; q + 1 < ns.length; q += 2) pt(ns[q], ns[q + 1]); else if (/[CSQT]/i.test(c1)) for (var q2 = 0; q2 + 1 < ns.length; q2 += 2) pt(ns[q2], ns[q2 + 1]); else if (/A/i.test(c1) && ns.length >= 7) pt(ns[5], ns[6]); } }
      if (ok) nPrim++;
    }
    return x1 >= x0 ? { x0: x0, y0: y0, x1: x1, y1: y1, nPrim: nPrim } : null;
  }
  /* a fração da área útil que o desenho ocupa (0..1); 0 se não há desenho */
  function ocupacaoSvg(svg, area) {
    var bx = caixaDoSvg(svg); if (!bx || !area) return 0;
    var w = Math.max(0, Math.min(bx.x1, area.x + area.w) - Math.max(bx.x0, area.x)), h = Math.max(0, Math.min(bx.y1, area.y + area.h) - Math.max(bx.y0, area.y));
    return Math.min(1, (w * h) / (area.w * area.h));
  }
  /* ------------------------------------------------------------ ETAPA 2 (17/11/2026): MOSAICO, PLANTAS JUNTAS E AUDITOR DA FOLHA (GATE)
   * (4) OCUPAÇÃO: nunca uma folha com um toco. Os isométricos por ambiente (AF, ES, perspectiva, esquema) são vistas pequenas: entram em MOSAICO (até K.auto.mosaicoMax por
   *     folha, numeradas, o título embaixo de cada uma, como na prancha única de isométricos). As plantas/cortes que ocupam < K.auto.ocupMin do papel (pavimento de referência com
   *     um trecho de tubo) são empacotadas JUNTAS, de vários pavimentos, em vez de uma folha para cada.
   * (5) AUDITOR: cada folha é conferida ao sair — balão da tela, folha quase vazia, peça fora do catálogo, ambiente duplicado, isométrico com muito tubo oculto, recorte que pega a
   *     casa inteira. O gerador CORRIGE o que dá (câmera, mosaico, duplicata) e MARCA a folha (NÃO LIBERADO em vermelho) no que não dá. */
  function limitesDaVista(pz) { return limitesPersp(pz); }
  /* a escala (mm/m) que a vista teria numa célula w x h do mosaico (a conta da folhaPerspectiva sem legenda) */
  function escalaCelula(pz, w, h) {
    var lim = limitesDaVista(pz), KI = K2.isos, du = Math.max(lim.u1 - lim.u0, 1e-6), dv = Math.max(lim.v1 - lim.v0, 1e-6);
    return Math.min((w - 2 * KI.margem) / du, (h - KI.faixa - 2 * KI.margem) / dv, KI.kMax, K2.perspKMax);
  }
  function gradeMosaico(a, n) {
    var g = K2.auto.gap, cols = n <= 1 ? 1 : (n === 2 ? (a.w >= a.h * 0.9 ? 1 : 2) : 2), rows = Math.ceil(n / cols), cw = (a.w - (cols - 1) * g) / cols, ch = (a.h - (rows - 1) * g) / rows, out = [];
    for (var i = 0; i < n; i++) out.push({ x: a.x + (i % cols) * (cw + g), y: a.y + Math.floor(i / cols) * (ch + g), w: cw, h: ch });
    return { cols: cols, rows: rows, celulas: out, cw: cw, ch: ch };
  }
  function chavePav(pv) { return txt(pv && pv.nome) + "|" + (pv ? pv.cota : ""); }
  function nomeCurto(t) { return txt(t).replace(/^ISOMÉTRICO - /, "").replace(/^PERSPECTIVA ISOMÉTRICA - /, "PERSPECTIVA - ").replace(/^ESQUEMA ISOMÉTRICO - /, "ESQUEMA - "); }
  /* as defs "perspectiva" e "esquemaIso" (vistas pequenas) de cada pavimento viram folhas de mosaico; fica solo a vista que numa célula sairia menor que K.auto.kCelulaMin (mm/m) */
  function montarMosaicos(defs, geo, cfg, avisos) {
    if (cfg && (cfg.mosaico === false || cfg.agrupar === false)) return defs;   /* "agrupar" desligado = uma vista por folha, como sempre */
    var KA = K2.auto, grupos = {}, ordem = [];
    defs.forEach(function (df) {
      if (!((df.tipo === "perspectiva" || df.tipo === "esquemaIso") && df.persp && !df.geo)) return;
      var k = chavePav(df.pv); if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(df);
    });
    var troca = {}, usados = {}, nNovas = 0;
    ordem.forEach(function (k) {
      var lista = grupos[k], atual = null, chunks = [];
      lista.forEach(function (df) {
        var g4 = gradeMosaico(geo.area, KA.mosaicoMax);
        if (escalaCelula(df.persp, g4.cw, g4.ch) < KA.kCelulaMin) return;   /* grande demais para uma célula: segue em folha própria */
        if (!atual || atual.length >= KA.mosaicoMax) { atual = []; chunks.push(atual); }
        atual.push(df);
      });
      /* as vistas grandes (o barrilete, "fora dos ambientes") que não cabem numa célula de 6 tentam uma de 2 por folha */
      var g2 = gradeMosaico(geo.area, 2), grandes = lista.filter(function (df) { return escalaCelula(df.persp, gradeMosaico(geo.area, KA.mosaicoMax).cw, gradeMosaico(geo.area, KA.mosaicoMax).ch) < KA.kCelulaMin && escalaCelula(df.persp, g2.cw, g2.ch) >= KA.kParMin; });
      for (var ig = 0; ig + 1 < grandes.length; ig += 2) chunks.push([grandes[ig], grandes[ig + 1]]);
      chunks.forEach(function (ch) {
        if (ch.length < 2) return;   /* uma vista sozinha não precisa de mosaico */
        var gr = gradeMosaico(geo.area, ch.length), amb = [], vistos = {}, ids = [];
        ch.forEach(function (df) { ids.push(df.id); usados[df.id] = 1; if (df.ambiente && !vistos[df.ambiente]) { vistos[df.ambiente] = 1; amb.push({ id: df.ambiente }); } });
        var nov = { id: "mosaico-" + (++nNovas), titulo: "ISOMÉTRICOS - " + ch.map(function (df) { return nomeCurto(df.titulo); }).join("; "), tipo: "mosaico", grupo: "isometricos", pv: ch[0].pv, mosaico: true,
          celulas: ch.map(function (df, i) { return { rect: gr.celulas[i], tipo: df.tipo, titulo: nomeCurto(df.titulo), pz: df.persp, pv: df.pv, id: df.id, ambiente: df.ambiente }; }), ambientes: amb.length ? amb : undefined };
        troca[ch[0].id] = nov;
      });
    });
    if (!nNovas) return defs;
    var out = []; defs.forEach(function (df) { if (troca[df.id]) out.push(troca[df.id]); else if (!usados[df.id]) out.push(df); });
    avisos.push("Mosaico: " + Object.keys(usados).length + " isométrico(s) pequeno(s) agrupados em " + nNovas + " folha(s) (até " + KA.mosaicoMax + " por folha), em vez de uma folha para cada.");
    return out;
  }
  function folhaMosaico(c, df) {
    arr(df.celulas).forEach(function (ce, i) {
      var cc = {}; for (var k0 in c) if (Object.prototype.hasOwnProperty.call(c, k0)) cc[k0] = c[k0];
      cc.pv = ce.pv;
      blocoVista(c.D, "iso", "sem", ce.rect, function () { vistaNumerada(cc, ce.rect, i + 1, ce.titulo, ce.pz, ce.tipo === "esquemaIso"); }, ce.pz && ce.pz.chave);
    });
    return { escala: "SEM ESCALA" };
  }
  /* plantas e cortes de pavimentos diferentes que, sozinhos, ocupam < ocupMin do papel: empacotados juntos (a ocupação sobe e o nº de folhas cai) */
  function juntarPoucoOcupadas(defs, geo, cfg, avisos) {
    if (cfg && (cfg.mosaico === false || cfg.agrupar === false)) return defs;   /* "agrupar" desligado = uma vista por folha, como sempre */
    var KA = K2.auto, fracas = defs.filter(function (df) { return df.vistas && df.ocupacao != null && df.ocupacao < KA.ocupJunta && (df.grupo === "plantas" || df.grupo === "cortes"); });
    if (fracas.length < 2) return defs;
    var itens = []; fracas.forEach(function (df) { arr(df.vistas).forEach(function (it) { it._pv = df.pv; itens.push(it); }); });
    var fl = empacotar(itens, geo.area, cfg.agrupar), novas = fl.map(function (f, i) {
      var pl = f.itens.filter(function (it) { return it.tipo === "planta"; }), pvs = [], vistos = {};
      f.itens.forEach(function (it) { var k = chavePav(it._pv); if (!vistos[k]) { vistos[k] = 1; pvs.push(txt(it._pv && it._pv.nome).toUpperCase()); } });
      return { id: "plantas-juntas-" + (i + 1), titulo: (pl.length ? "PLANTAS" : "CORTES") + (pl.length && f.itens.length > pl.length ? " E CORTES" : "") + " - " + pvs.join(", "), tipo: pl.length ? "planta" : "cortes", vistas: f.itens, pv: f.itens[0]._pv, grupo: "plantas", ocupacao: f.ocupacao };
    });
    var cont = {}, vez = {}; novas.forEach(function (n2) { cont[n2.titulo] = (cont[n2.titulo] || 0) + 1; });
    novas.forEach(function (n2) { if (cont[n2.titulo] > 1) { vez[n2.titulo] = (vez[n2.titulo] || 0) + 1; n2.titulo += " (" + vez[n2.titulo] + "/" + cont[n2.titulo] + ")"; } });   /* títulos iguais ganham (k/n) */
    var ids = {}; fracas.forEach(function (df) { ids[df.id] = 1; });
    var out = [], posto = false;
    defs.forEach(function (df) { if (ids[df.id]) { if (!posto) { novas.forEach(function (n2) { out.push(n2); }); posto = true; } } else out.push(df); });
    avisos.push("Plantas/cortes com pouco desenho (< " + Math.round(KA.ocupMin * 100) + " % do papel) de " + fracas.length + " folha(s) foram juntos em " + novas.length + " folha(s).");
    return out;
  }
  /* 21/11/2026 (pranchas compactas): ESQUEMA VERTICAL + QUADRO DE MATERIAIS (+ DETALHES TÍPICOS) na MESMA folha quando cada um, sozinho, ocupa pouco (obra pequena: dois traços de
     coluna e uma tabela de 20 linhas ocupavam folhas inteiras). Cada um ganha uma região da largura útil (a do esquema pelo nº de colunas, a do quadro pela tabela justa, a dos
     detalhes pela grade) e a folha só junta se TUDO cabe; o quadro paginado grande (mais de uma página) e o esquema grande seguem em folha própria. */
  function colunasDoEsquema(rede, ix, colunas) {
    var vistos = {}, nc = 0;
    arr(rede && rede.trechos).forEach(function (t) {
      var nome = null, pre = "";
      if (t.sistema === "agua_fria" && t.vertical) { var cl = colunas && colunas[t.id]; if (cl) { nome = cl.nome; pre = "a"; } }
      else if (t.sistema === "esgoto") { var tq = ix && ix.tq && ix.tq[t.id]; if (tq) { nome = tq; pre = "e"; } }
      if (nome && !vistos[pre + nome]) { vistos[pre + nome] = 1; nc++; }
    });
    return nc;
  }
  /* mm de papel por metro de nível que o esquema teria numa região de altura h (a conta da folhaEsquema: altura útil / faixa de níveis das colunas e dos pavimentos) */
  function escalaEsquema(cx, h) {
    var ys = [], KI = HI().K;
    arr(cx.rede && cx.rede.trechos).forEach(function (t) {
      if ((t.sistema === "agua_fria" && t.vertical && cx.colunas && cx.colunas[t.id]) || (t.sistema === "esgoto" && cx.ix && cx.ix.tq && cx.ix.tq[t.id])) ys.push(t.p1.y, t.p2.y);
    });
    arr(cx.pavs).forEach(function (p) { ys.push(p.cota); });
    if (!ys.length) return 0;
    var faixa = Math.max(Math.max.apply(null, ys) - Math.min.apply(null, ys), 1e-6), banda = caixasReais(cx.modelo).length ? Math.min(h * K2.bandaRes, K2.bandaResMax) : 0;
    return (h - K2.titulo - 3 * KI.margem - banda) / faixa;
  }
  function juntarEsquemaQuadro(defs, cx, linhas, avisos) {
    var CP = K2.compacta, a = cx.geo.area, cfg = cx.cfg;
    if (cfg && (cfg.mosaico === false || cfg.agrupar === false)) return defs;   /* "agrupar" desligado = uma folha para cada, como sempre */
    var iE = -1, iQ = -1, iD = -1, nQ = 0, nD = 0;
    defs.forEach(function (df, i) { if (df.tipo === "esquema") iE = i; if (df.tipo === "quadro") { iQ = i; nQ++; } if (df.tipo === "detalhes") { iD = i; nD++; } });
    if (iE < 0 || nQ !== 1 || !defs[iQ].pagina || !arr(linhas).length) return defs;
    var nc = colunasDoEsquema(cx.rede, cx.ix, cx.colunas); if (!nc) return defs;
    var cxs = caixasReais(cx.modelo).length, wE = Math.max(CP.esqLargMin, nc * K2.espacoColuna + CP.esqFolga, cxs * (K2.larguraCaixaEsq + 8));
    var pq = paginarQuadro({ geo: { area: a } }, linhas, { area: { w: a.w, h: a.h }, nCol: 1 }); if (!pq || pq.paginas.length !== 1) return defs;   /* quadro grande: folha própria */
    var wQ = pq.larg.total, comDet = false, wD = 0;
    if (iD >= 0 && nD === 1) { var lay = layoutDetalhes({ area: { x: 0, y: 0, w: CP.detLarg, h: a.h } }, cx.resultado); if (lay.folhas === 1) { wD = CP.detLarg; comDet = true; } }
    function cabe(n, soma) { return soma + CP.gapMin * (n - 1) <= a.w - 8; }
    if (comDet && !cabe(3, wE + wQ + wD)) { comDet = false; wD = 0; }
    if (!cabe(2, wE + wQ)) return defs;
    /* sem largura para três colunas: os detalhes vão EMBAIXO do esquema (mesma coluna) se o esquema ainda fica com altura útil */
    var empilha = null;
    if (!comDet && iD >= 0 && nD === 1) {
      var wLd = Math.max(wE, CP.detLarg);
      if (cabe(2, wLd + wQ)) for (var kd = 1; kd <= 2 && !empilha; kd++) {
        var hD = K2.titulo + kd * 120 + 4, ly = layoutDetalhes({ area: { x: 0, y: 0, w: wLd, h: hD } }, cx.resultado);   // hid:ok altura de um painel de detalhe (mm de papel)
        if (ly.folhas === 1 && a.h - hD - CP.gapMin >= CP.esqAltMin && escalaEsquema(cx, a.h - hD - CP.gapMin) >= CP.esqKvMin) empilha = { w: wLd, hD: hD };
      }
    }
    if (empilha) { wE = empilha.w; comDet = true; }
    var ns = comDet && !empilha ? 3 : 2, soma = wE + wQ + (empilha ? 0 : wD), gap = Math.min(CP.gapMax, (a.w - soma) / (ns + 1)), x = a.x + (a.w - (soma + gap * (ns - 1))) / 2, regioes = [];
    if (empilha) { regioes.push({ tipo: "esquema", x: x, w: wE, y: a.y, h: a.h - empilha.hD - CP.gapMin }, { tipo: "detalhes", x: x, w: wE, y: a.y + a.h - empilha.hD, h: empilha.hD }); x += wE + gap; regioes.push({ tipo: "quadro", x: x, w: wQ }); }
    else [["esquema", wE], ["quadro", wQ], ["detalhes", wD]].forEach(function (r) { if (!r[1]) return; regioes.push({ tipo: r[0], x: x, w: r[1] }); x += r[1] + gap; });
    var q0 = defs[iQ], nov = { id: "esquema-quadro", titulo: "ESQUEMA VERTICAL E QUADRO DE MATERIAIS" + (comDet ? " E DETALHES TÍPICOS" : ""), tipo: "esqquadro", grupo: "esquema", regioes: regioes, pagina: q0.pagina, linha: pq.linha, larg: pq.larg };
    var out = []; defs.forEach(function (df, i) { if (i === iE) out.push(nov); else if (i === iQ || (comDet && i === iD)) return; else out.push(df); });
    avisos.push("Esquema vertical, quadro de materiais" + (comDet ? " e detalhes típicos" : "") + " na mesma folha (cada um sozinho ocupava pouco).");
    return out;
  }
  function subFolha(c, rect, extra) {
    var cc = {}, k; for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cc[k] = c[k];
    cc.geo = { area: rect }; for (k in c.geo) if (k !== "area" && Object.prototype.hasOwnProperty.call(c.geo, k)) cc.geo[k] = c.geo[k];
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) cc[k] = extra[k];
    return cc;
  }
  function folhaEsqQuadro(c, df) {
    var a = c.geo.area;
    arr(df.regioes).forEach(function (rg) {
      var rect = { x: rg.x, y: rg.y != null ? rg.y : a.y, w: rg.w, h: rg.h != null ? rg.h : a.h };
      if (rg.tipo === "esquema") folhaEsquema(subFolha(c, rect, { tituloEsq: "ESQUEMA VERTICAL" }));
      else if (rg.tipo === "quadro") folhaQuadro(subFolha(c, rect, { titulo: "QUADRO DE MATERIAIS", quadroPagina: df.pagina, quadroNCol: 1, quadroLinha: df.linha, quadroLarg: df.larg, quadroEsq: true, quadroSub: "Quantidades do modelo (tubo em m, peças em un)" }));
      else if (rg.tipo === "detalhes") folhaDetalhes(subFolha(c, rect, { titulo: "DETALHES TÍPICOS", parte: 0 }));
    });
    return { escala: "SEM ESCALA" };
  }
  /* o mesmo ambiente × tipo × sistema × pavimento duas vezes: fica a primeira (o gerador corrige) */
  function tirarDuplicadas(defs, avisos) {
    var vistos = {}, out = [];
    defs.forEach(function (df) {
      var ids = arr(df.ambientes).map(function (a) { return txt(a && (a.id || a.nome)); }).concat(df.ambiente ? [txt(df.ambiente)] : []);
      if (!ids.length || df.mosaico) { out.push(df); return; }
      var k = [df.tipo, df.grupo, ids.sort().join("+"), arr(df.grupos).join("+"), chavePav(df.pv), arr(df.sis).join("+"), txt(df.titulo)].join("|");
      if (vistos[k]) { avisos.push("Folha duplicada tirada: " + df.titulo + " (já existe)."); return; }
      vistos[k] = 1; out.push(df);
    });
    return out;
  }
  /* AUDITOR DA FOLHA: devolve { problemas: [{ codigo, texto, marca }], ocupacao, oculto }. marca = vai para o NÃO LIBERADO da folha */
  var AUDITA_OCUP = { planta: 1, cortes: 1, perspectiva: 1, esquemaIso: 1, mosaico: 1, ambientes: 1, incendio: 1, isoprancha: 1, esqquadro: 1 };
  function textosDoSvg(svg) { var o = [], re = /<text[^>]*>([^<]*)<\/text>/g, m; while ((m = re.exec(svg))) o.push(desesc(m[1])); return o; }
  function ocultoDaVista(ctx, pz) {
    if (!pz || !pz.b || !pz.pv || !pz.trs || !pz.trs.length) return null;
    if (pz.auto && pz.auto.pontos && pz.auto.pontos[pz.vista] != null && pz.auto.vista === pz.vista) return pz.auto.oculto;   /* a câmera automática já mediu esta vista: não refaz a conta */
    if (pz._oculto != null) return pz._oculto;   /* já medido neste pz (a mesma vista em mais de um lugar) */
    try { pz._oculto = oclusaoVista(ctx, { x0: pz.b.x0, x1: pz.b.x1, z0: pz.b.z0, z1: pz.b.z1 }, pz.pv, pz.vista, pz.trs).oculto; return pz._oculto; } catch (e) { return null; }
  }
  function auditarFolha(df, corpoSvg, geo, ctx) {
    var KA = K2.auto, prob = [], tipo = df.tipo, out = { problemas: prob, ocupacao: null, oculto: null };
    var tx = textosDoSvg(corpoSvg);
    if (tx.some(function (s) { return /^\s*\d+,\d{1,2} m\s*$|^\s*,\d\d m\s*$/.test(s); })) prob.push({ codigo: "BALAO_UI", texto: "balão de cota da tela impresso na folha", marca: true });
    if (tx.some(function (s) { return PROIBIDA_QUADRO.test(s); }) || ((tipo === "quadro" || tipo === "esqquadro") && ctx.pecaProibida)) prob.push({ codigo: "PECA_FORA_CATALOGO", texto: "peça fora do catálogo (tê de redução no esgoto: é junção 45° do catálogo)", marca: true });
    if (AUDITA_OCUP[tipo]) {
      var oc = ocupacaoSvg(corpoSvg, geo.area); out.ocupacao = oc;
      if (oc < KA.ocupVazia) prob.push({ codigo: "QUASE_VAZIA", texto: "folha quase vazia (" + Math.round(oc * 100) + " % do papel)", marca: true });
      else if (oc < KA.ocupMin) prob.push({ codigo: "BAIXA_OCUPACAO", texto: "pouco desenho (" + Math.round(oc * 100) + " % do papel) e sem outra folha para juntar", marca: false });
    }
    var pzs = tipo === "mosaico" ? arr(df.celulas).map(function (ce) { return ce.pz; }) : (df.persp ? [df.persp] : []), so = [], tot = 0, n0 = 0;
    pzs.forEach(function (pz) {
      var o = ocultoDaVista(ctx.c0, pz); if (o == null) return; tot += o; n0++; so.push(o);
      if (o > KA.ocultoMax) prob.push({ codigo: "ISO_OCULTO", texto: "isométrico com " + Math.round(o * 100) + " % do tubo oculto (limite " + Math.round(KA.ocultoMax * 100) + " %)", marca: true });
      var bb = ctx.casa; if (bb && pz.b && !(df.geral)) {
        var aA = (pz.b.x1 - pz.b.x0) * (pz.b.z1 - pz.b.z0), aC = Math.max(1e-6, (bb.x1 - bb.x0) * (bb.z1 - bb.z0));
        if (ctx.nAmb > 1 && aA / aC > KA.recorteCasaMax && !/FORA DOS AMBIENTES|GERAL/i.test(txt(df.titulo))) prob.push({ codigo: "RECORTE_CASA", texto: "recorte do isométrico pega a casa inteira (" + Math.round(aA / aC * 100) + " % da planta)", marca: true });
      }
    });
    if (n0) out.oculto = tot / n0;
    return out;
  }
  /* ------------------------------------------------------------ GERAR */
  function gerar(resultado, modelo, opcoes) {
    FOTO3D = opcoes && typeof opcoes.foto3d === "function" ? opcoes.foto3d : null; IMAGENS = null; VISTAS_AUTO = {};
    ICONES = opcoes && opcoes.icones && typeof opcoes.icones === "object" ? opcoes.icones : null;
    opcoes = opcoes || {};
    AJ = EDT() && opcoes.ajustes ? EDT().normalizar(opcoes.ajustes) : null; DEF_ATUAL = null; VISTAS_GER = {};   /* ETAPA 3: os ajustes manuais valem por cima do automático */
    var avisos = [], P = PR(), A = AP(), H = HI(), B = BI(), cfg = normalizarConfig(opcoes);
    if (!P || !P.carimboRA || !A || !H || !B) return { ok: false, folhas: [], avisos: ["Motores de prancha (prancha.js, acopranchas.js, hidisometrico.js, biminst.js) não carregados."] };
    if (!resultado || !resultado.sistemas || !modelo || !modelo.estado) return { ok: false, folhas: [], avisos: ["Resultado do cálculo ou modelo vazio: não há pranchas para gerar."] };
    /* 17/11/2026 (o Rogério): o contexto da foto do 3D (parede, piso, laje, louça, móvel, outro sistema) sai SÓ EM LINHAS, cinza bem claro, sem preenchimento: tubo e conexão ficam sempre por cima.
       Padrão "linhas"; cfg.contexto = "translucido" volta ao meio-tom preenchido de antes. */
    if (FOTO3D && cfg.contexto !== "translucido") { var foto0 = FOTO3D; FOTO3D = function (o) { var o2 = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) o2[k] = o[k]; o2.soLinhas = true; return foto0(o2); }; }
    /* ETAPA 3: a foto do 3D é a parte cara da geração; com o cache da sessão (opcoes.cacheFotos) regerar só refaz a foto da vista cujo ajuste mudou */
    if (FOTO3D && opcoes.cacheFotos && typeof opcoes.cacheFotos === "object") { var foto1 = FOTO3D, cacheF = opcoes.cacheFotos; FOTO3D = function (o) { var kf = JSON.stringify(o); if (cacheF[kf]) return cacheF[kf]; var rf = foto1(o); if (rf && rf.ok) cacheF[kf] = rf; return rf; }; }
    var rede = B.rede(modelo.estado, modelo.avaliarFam), ix = H.indicesResultado(resultado), E = estilo();
    EXISTE = existeDe(rede, modelo);
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
    /* 17/11/2026: nível de referência (forro, laje, platibanda...) sem ambiente nem rede própria não é pavimento: não reparte a faixa nem ganha folha */
    var pavsTodos = pavs; pavs = pavsEfetivos(modelo.estado, rede, ambientes, pavs);
    if (pavs.length < pavsTodos.length) avisos.push("Níveis de referência sem ambiente nem rede própria não viram pavimento: " + pavsTodos.filter(function (p) { return !pavs.some(function (q) { return q.nome === p.nome && q.cota === p.cota; }); }).map(function (p) { return p.nome; }).join(", ") + " (a rede deles segue no pavimento de baixo).");
    var defs = [], prims = [], pecaProibidaQuadro = false;
    var ctxV = { modelo: modelo, rede: rede, ix: ix, colunas: colunas, nomeAp: nomeAp, avisos: avisos, geo: geo, pavs: pavs, AP: A, cfg: cfg, prims: prims, n: 0, ambientes: ambientes };
    /* PLANTAS e CORTES do pavimento como VISTAS empacotadas (rodada 2): a escala das plantas é a maior da lista usual que cabe;
       vistas pequenas dividem a folha (AF e ES lado a lado; planta + cortes), o bloco centrado na área útil */
    if (CJ.plantas || CJ.cortes) pavs.forEach(function (pv) {
      var ps = CJ.plantas ? sistemas.map(function (sis) { return { sis: sis, trs: trechosDoPav(rede, sis, pv) }; }).filter(function (x) { return x.trs.some(function (t) { return !t.vertical; }); }).filter(function (x) { return plantaComConteudo(ctxV, x.trs, pv, avisos, x.sis); }) : [];
      /* 15/11/2026: pavimento em que só passa COLUNA (trecho vertical, sem ramal horizontal: sem aparelho nem ambiente hidráulico) não
         vira folha própria — a coluna aparece no esquema vertical; antes saíam folhas quase vazias (laje, platibanda, forro, caixote, calha) */
      var cortes = [];
      if (CJ.cortes) paredesHidraulicas(ctxV, pv).forEach(function (ph, i) { ph.pv = pv; ph.n = i + 1; cortes.push(prepCorte(ctxV, ph, geo.area)); });
      function montar(esc0) {
        var it = []; ps.forEach(function (x) { it.push(prepPlanta(ctxV, x.sis, x.trs, pv, esc0, "PLANTA DE " + (NOME_SIS[x.sis] || x.sis).toUpperCase() + (x.sis === "esgoto" && (!EXISTE || EXISTE.sis.ventilacao) ? " E VENTILAÇÃO" : "") + " - " + pv.nome.toUpperCase())); });
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
    var pavsA = pavsDosAmbientes(modelo.estado, ambientes, pavs);   /* 17/11/2026: as vistas por ambiente só rodam nos pavimentos que têm ambiente */
    /* R01: ISOMÉTRICO POR AMBIENTE (js/hidcaderno.js): o bloco da referência da Tânia (planta + isométrico com balões de código + tabelas), 2 por folha */
    if (CJ.ambientes) {
      var HCa = dep("HidCaderno", "./hidcaderno.js");
      if (!HCa) avisos.push("O motor do isométrico por ambiente (js/hidcaderno.js) não carregou: folhas de ambiente não geradas.");
      else pavsA.forEach(function (pv) {
        /* HIDRO-3D: um BLOCO por ambiente e grupo de sistema (água | esgoto e ventilação | pluvial | gás), 2 por folha; cada bloco parte só das peças modeladas do grupo */
        /* 13/11/2026: UM bloco por folha (era 2): com água e esgoto do mesmo banheiro na mesma A1 a planta caía para 1:75 e a vista
           para 1:100 — tudo miúdo (o Rogério: "precisa ter um padrão, cara"). A folha-modelo é um ambiente × sistema por folha. */
        var amL = HCa.ambientesDoModelo(ctx0, pv), nBlocos = 1, itensAm = [];
        amL.forEach(function (am0) {
          var gs0 = []; try { gs0 = HCa.gruposDoAmbiente(ctx0, am0, pv); } catch (eG) { gs0 = []; }
          if (!gs0.length) itensAm.push({ am: am0, g: null }); else gs0.forEach(function (g0) { itensAm.push({ am: am0, g: g0.id, gn: g0.nome }); });
        });
        /* ETAPA 2: os blocos de ESGOTO E VENTILAÇÃO (pouco desenho: um banheiro tem 1 ou 2 aparelhos) vão DOIS por folha, de ambientes diferentes; a água segue um ambiente por folha */
        /* (decisão do Rogério, 17/11/2026) ÁGUA e ESGOTO do MESMO ambiente dividem a folha, na mesma câmera; o ES sem a água do ambiente se junta a outro ES */
        var blocosF = [], esgB = [], paraJuntar = cfg.mosaico !== false && cfg.agrupar !== false;
        itensAm.forEach(function (q) { if (!paraJuntar) blocosF.push([q]); else if (q.g === "esgoto") { var ag = null; blocosF.forEach(function (b0) { if (!ag && b0.length === 1 && b0[0].am === q.am && b0[0].g === "agua") ag = b0; }); if (ag) ag.push(q); else esgB.push(q); } else blocosF.push([q]); });
        for (var ie2 = 0; ie2 < esgB.length; ie2 += 2) blocosF.push(esgB.slice(ie2, ie2 + 2));
        var ia = 0;
        for (var ib = 0; ib < blocosF.length; ib++) {
          var gp = blocosF[ib]; ia = blocosF.slice(0, ib).reduce(function (a0, q) { return a0 + q.length; }, 0);
          defs.push({ id: "ambientes-" + (ib + 1), titulo: "ISOMÉTRICO POR AMBIENTE - " + (gp.length > 1 && gp.every(function (q) { return q.am === gp[0].am; }) ? gp[0].am.nome + " (" + gp.map(function (q) { return q.gn; }).join(" E ") + ")" : gp.map(function (q) { return q.am.nome + (q.gn ? " (" + q.gn + ")" : ""); }).join(" E ")) + (pavsA.length > 1 ? " - " + pv.nome.toUpperCase() : ""), tipo: "ambientes", ambientes: gp.map(function (q) { return q.am; }), grupos: gp.map(function (q) { return q.g; }), pv: pv, numeros: gp.map(function (q, j) { return dois(ia + j + 1); }), grupo: "ambientes" });
        }
      });
    }
    /* 21/11/2026 (pranchas compactas, o Rogério: "só o que precisa"): com o isométrico por AMBIENTE (caderno: planta, vista cotada, isométrico com balões, tabelas) gerado, as vistas
       por ambiente do jogo clássico (isométrico AF/ES do ambiente, perspectiva, esquema isométrico) repetiriam o mesmo desenho: não saem. O "fora dos ambientes" só sai com tubo relevante. */
    var cadAmbs = []; defs.forEach(function (df0) { if (df0.tipo === "ambientes") arr(df0.ambientes).forEach(function (q0) { cadAmbs.push({ am: q0, pv: df0.pv }); }); });
    var temCaderno = cadAmbs.length > 0, omit = { iso: 0, persp: 0, esqIso: 0, fora: 0 };
    function ambCoberto(am, pv) {
      var nm = txt(am.nome).toUpperCase(), cx0 = (am.x0 + am.x1) / 2, cz0 = (am.z0 + am.z1) / 2, pvA = pv || pavDoAmbiente(modelo.estado, am, pavs);
      return cadAmbs.some(function (q) {
        if (pvA && q.pv && chavePav(pvA) !== chavePav(q.pv)) return false;
        return txt(q.am.nome).toUpperCase() === nm || (cx0 >= q.am.x0 - 0.05 && cx0 <= q.am.x1 + 0.05 && cz0 >= q.am.z0 - 0.05 && cz0 <= q.am.z1 + 0.05);
      });
    }
    function compTrechos(ids) { var m = {}, L = 0; arr(rede.trechos).forEach(function (t) { m[t.id] = t; }); arr(ids).forEach(function (id) { var t = m[id]; if (t && t.p1 && t.p2) L += dist3d(t.p1, t.p2); }); return L; }
    var iso = { desenhos: [], avisos: [] };
    if (CJ.isometricos) {
      iso = H.gerar(resultado, modelo, { pavimentos: pavs, ambientes: ambientes, nomeAparelho: nomeAp, nomePeca: function (id) { return rotuloPecaPlanta(rede, id); }, sistemas: sistemas.filter(function (q) { return q === "agua_fria" || q === "esgoto" || q === "agua_quente"; }), area: { w: geo.area.w - 2 * K2.folgaFolha, h: geo.area.h - K2.titulo - K2.folgaFolha } });
      arr(iso.avisos).forEach(function (m) { avisos.push(m); });
      arr(iso.desenhos).forEach(function (d) {
        if (temCaderno) {
          if (/^fora dos ambientes$/i.test(txt(d.grupo))) { if (compTrechos(d.trechos) < K2.compacta.foraAmbMinM) { omit.fora++; return; } }
          else { var amD = ambientes.filter(function (q) { return txt(q.nome).toUpperCase() === txt(d.grupo).toUpperCase() || txt(q.id).toUpperCase() === txt(d.grupo).toUpperCase(); })[0]; if (amD && ambCoberto(amD, null)) { omit.iso++; return; } }
        }
        var pzI = null; if (FOTO3D && cfg.isoLinha !== true) { try { pzI = perspectivaDoIso(ctx0, d); } catch (eI) { pzI = null; avisos.push("Isométrico " + d.titulo + ": o desenho do modelo falhou (" + (eI && eI.message || eI) + "); saiu o de linha."); } }
        if (pzI) defs.push({ id: d.id, titulo: d.titulo, tipo: "perspectiva", persp: pzI, pv: pzI.pv, grupo: "isometricos", isoDe: d });
        else defs.push({ id: d.id, titulo: d.titulo, tipo: "iso", iso: d, grupo: "isometricos" });
      });
    }
    if (CJ.perspectivas) {
      var escA = cfg.perspectiva.ambientes.map(function (x) { return x.toUpperCase(); });
      pavsA.forEach(function (pv) {
        ambientes.forEach(function (am) {
          if (!ambienteDoPav(ctx0, am, pv)) return;   /* 17/11/2026: o prumo que só atravessa o nível não cria ambiente */
          if (temCaderno && ambCoberto(am, pv)) { omit.persp++; return; }
          if (escA.length && escA.indexOf(txt(am.id).toUpperCase()) < 0 && escA.indexOf(txt(am.nome).toUpperCase()) < 0) return;
          var pz = perspectivaDe(ctx0, am, pv);
          if (pz && perspVazia(pz)) { avisos.push("Perspectiva " + txt(am.nome) + " - " + pv.nome + ": sem tubo nem peça (folha vazia) - suprimida."); pz = null; }
          if (pz) defs.push({ id: "perspectiva-" + am.id + "-" + defs.length, titulo: "PERSPECTIVA ISOMÉTRICA - " + txt(am.nome).toUpperCase() + (pavsA.length > 1 ? " - " + pv.nome.toUpperCase() : ""), tipo: "perspectiva", persp: pz, pv: pv, grupo: "perspectivas", ambiente: am.id });
        });
      });
    }
    /* 14/11/2026: ESQUEMA ISOMÉTRICO (planta chapada + linha única + altura dos pontos): um por ambiente x sistema (água | esgoto) */
    if (CJ.isometricos) pavsA.forEach(function (pv) {
      ambientes.forEach(function (am) {
        if (!ambienteDoPav(ctx0, am, pv)) return;   /* 17/11/2026: ambiente fantasma (BANHEIRO - PLATIBANDA) não tem folha */
        if (temCaderno && ambCoberto(am, pv)) { omit.esqIso++; return; }
        [["ÁGUA", ["agua_fria", "agua_quente"]], [EXISTE && !EXISTE.sis.ventilacao ? "ESGOTO" : "ESGOTO E VENTILAÇÃO", ["esgoto", "ventilacao"]]].forEach(function (g) {
          var sl = g[1].filter(function (x) { return sistemas.indexOf(x) >= 0 || (x === "ventilacao" && sistemas.indexOf("esgoto") >= 0); }); if (!sl.length) return;
          var pzE = null; try { pzE = esquemaIsoDe(ctx0, am, pv, sl); } catch (eE) { pzE = null; avisos.push("Esquema isométrico " + txt(am.nome) + ": " + (eE && eE.message || eE)); }
          if (pzE && perspVazia(pzE)) { avisos.push("Esquema isométrico " + txt(am.nome) + " - " + g[0] + ": só um toco de tubo (folha quase vazia) - suprimido."); pzE = null; }
          if (pzE) defs.push({ id: "esquemaiso-" + am.id + "-" + g[0].charAt(0) + "-" + defs.length, titulo: "ESQUEMA ISOMÉTRICO - " + g[0] + " - " + txt(am.nome).toUpperCase() + (pavsA.length > 1 ? " - " + pv.nome.toUpperCase() : ""), tipo: "esquemaIso", persp: pzE, pv: pv, grupo: "isometricos", ambiente: am.id });
        });
      });
    });
    if (temCaderno && (omit.iso || omit.persp || omit.esqIso || omit.fora)) avisos.push("Isométrico por ambiente já mostra planta, vista cotada e isométrico de cada ambiente: não repeti " + [omit.iso ? omit.iso + " isométrico(s) por ambiente" : "", omit.persp ? omit.persp + " perspectiva(s)" : "", omit.esqIso ? omit.esqIso + " esquema(s) isométrico(s)" : "", omit.fora ? omit.fora + " isométrico(s) \"fora dos ambientes\" só com toco de tubo (< " + K2.compacta.foraAmbMinM + " m)" : ""].filter(Boolean).join(", ") + ".");
    /* 15/11/2026: ISOMÉTRICOS (PRANCHA ÚNICA): por pavimento, uma folha grande (A0/A1) com o GERAL, o AF e o ES de cada ambiente e a caixa d'água, numerados */
    var molhados = ambientes.filter(function (am) { return pavsA.some(function (pv) { return ambienteDoPav(ctx0, am, pv); }); }).length, obraPequena = pavsA.length <= K2.compacta.pavMax && molhados <= K2.compacta.ambMax;
    if (CJ.isoprancha && obraPequena && (temCaderno || CJ.isometricos)) avisos.push("Obra pequena (" + pavsA.length + " pavimento, " + molhados + " ambiente(s) molhado(s)): a prancha única de isométricos não foi gerada (repetiria o isométrico por ambiente).");
    else if (CJ.isoprancha) {
      var geoI = P.geometria(cfg.isoFormato, "paisagem", "RA");
      pavsA.forEach(function (pv) {
        var vsI = []; try { vsI = vistasIsos(ctx0, pv, ambientes, sistemas, pavsA); } catch (eV) { vsI = []; avisos.push("Isométricos (prancha única) " + pv.nome + ": " + (eV && eV.message || eV)); }
        var flI = folhasIsos(vsI, geoI);
        flI.forEach(function (it, ki) {
          defs.push({ id: "isoprancha-" + defs.length, titulo: "ISOMÉTRICOS - " + (ki ? "ESQUEMAS" : "GERAL E ESQUEMAS") + (pavsA.length > 1 ? " - " + pv.nome.toUpperCase() : "") + (flI.length > 1 ? " (" + (ki + 1) + "/" + flI.length + ")" : ""), tipo: "isoprancha", itens: it, pv: pv, grupo: "isoprancha", geo: geoI });
        });
      });
    }
    if (CJ.esquema) defs.push({ id: "esquema-vertical", titulo: "ESQUEMA VERTICAL - " + (caixasReais(modelo).length ? "RESERVAÇÃO, BARRILETE, " : "") + "ÁGUA FRIA E ESGOTO", tipo: "esquema", grupo: "esquema" });
    /* 15/11/2026: FOLHA DO RESERVATÓRIO - uma por caixa d'água/reservatório do modelo (planta cotada + corte com os DN das ligações) */
    if (CJ.reservatorio) {
      var cxsR = caixasReais(modelo).map(function (qr, iq) { return { q: qr, i: iq }; }).filter(function (o2) { return isFinite(o2.q.x) && isFinite(o2.q.y) && isFinite(o2.q.z); }), vivas = [];
      /* ETAPA 2: duas caixas LIGADAS (com a boia) dividem uma folha (planta + corte de cada uma na metade de cima e na de baixo); a caixa sem ligação segue na folha dela, que sai marcada */
      cxsR.forEach(function (o2) { var lg = null; try { lg = ligacoesCaixa(ctx0, o2.q); } catch (eL) { lg = null; } o2.ligada = !!(lg && lg.alim && (lg.alim.tubo || lg.alim.dn != null)); });
      cxsR.forEach(function (o2) {
        var par = cfg.mosaico !== false && cfg.agrupar !== false && o2.ligada ? vivas : null;
        if (par) { par.push(o2); if (par.length === 2) { defs.push({ id: "reservatorio-" + (par[0].i + 1) + "-" + (par[1].i + 1), titulo: "RESERVATÓRIO - " + txt(par[0].q.nome).toUpperCase() + " E " + txt(par[1].q.nome).toUpperCase(), tipo: "reservatorio", partes: [par[0].i, par[1].i], grupo: "reservatorio" }); vivas = []; } return; }
        defs.push({ id: "reservatorio" + (o2.i ? "-" + (o2.i + 1) : ""), titulo: "RESERVATÓRIO - " + txt(o2.q.nome).toUpperCase(), tipo: "reservatorio", parte: o2.i, grupo: "reservatorio" });
      });
      vivas.forEach(function (o2) { defs.push({ id: "reservatorio" + (o2.i ? "-" + (o2.i + 1) : ""), titulo: "RESERVATÓRIO - " + txt(o2.q.nome).toUpperCase(), tipo: "reservatorio", parte: o2.i, grupo: "reservatorio" }); });
    }
    /* PRESSURIZAÇÃO (js/hidpressao.js): folha própria com o detalhe da instalação e a curva com o ponto de operação */
    var HPZp = dep("HidPressao", "./hidpressao.js");
    if (CJ.detalhes && HPZp && HPZp.temNoModelo && HPZp.temNoModelo(modelo)) defs.push({ id: "detalhe-pressurizador", titulo: "DETALHE DO PRESSURIZADOR", tipo: "pressurizador", grupo: "detalhes" });
    if (CJ.detalhes) { var lay = layoutDetalhes(geo, resultado); for (var pd = 0; pd < lay.folhas; pd++) defs.push({ id: "detalhes" + (pd ? "-" + (pd + 1) : ""), titulo: "DETALHES TÍPICOS" + (lay.folhas > 1 ? " (" + (pd + 1) + "/" + lay.folhas + ")" : ""), tipo: "detalhes", parte: pd, grupo: "detalhes" }); }
    var lq = null;
    if (CJ.quadro) {
      lq = linhasQuadro(ctx0);
      arr(lq).forEach(function (l) { if (PROIBIDA_QUADRO.test(txt(l.descricao))) pecaProibidaQuadro = true; if (PROIBIDA_QUADRO.test(txt(l.descricao))) avisos.push("PEÇA PROIBIDA no quadro de materiais: \"" + txt(l.descricao) + "\" - no esgoto a derivação de redução é junção 45° do catálogo, nunca tê de redução."); });
      if (lq && lq.length) { var pq = paginarQuadro(ctx0, lq); pq.paginas.forEach(function (pg, k) { defs.push({ id: "quadro" + (k ? "-" + (k + 1) : ""), titulo: "QUADRO DE MATERIAIS" + (pq.paginas.length > 1 ? " (" + (k + 1) + "/" + pq.paginas.length + ")" : ""), tipo: "quadro", pagina: pg, nCol: pq.nCol, linha: pq.linha, larg: pq.larg, grupo: "quadro" }); }); }
      else defs.push({ id: "quadro", titulo: "QUADRO DE MATERIAIS", tipo: "quadro", pagina: null, nCol: 1, grupo: "quadro" });
    }
    if (CJ.esquema && CJ.quadro) defs = juntarEsquemaQuadro(defs, { geo: geo, cfg: cfg, rede: rede, ix: ix, colunas: colunas, modelo: modelo, resultado: resultado, pavs: pavs }, lq, avisos);
    /* ETAPA 2: o que a folha tem de pouco desenho se junta (plantas de vários pavimentos; isométricos pequenos em mosaico) e a folha duplicada sai */
    defs = tirarDuplicadas(defs, avisos); defs = juntarPoucoOcupadas(defs, geo, cfg, avisos); defs = montarMosaicos(defs, geo, cfg, avisos);
    if (!defs.length) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhum conjunto de folhas escolhido (ou nada a desenhar nos sistemas escolhidos)."]) };
    /* a coluna: legenda + convenções + notas + normas + pendências; o que não couber vai para a folha de NOTAS */
    var blocos = notasDe({ r: resultado, cfg: cfg }), qrTxt = portalDe(cfg);
    blocos.splice(0, 0, { titulo: "CONVENÇÕES", itens: CONVENCOES.slice() });
    var linPts = linhasLegendaPontos(modelo, rede, nomeAp);
    if (linPts.length) blocos.splice(0, 0, { titulo: K2.legTab.titulo, tabela: linPts });
    var plano = planejarColuna(geo, blocos, resultado, !!qrTxt);
    if (plano.saem.length) defs.push({ id: "notas", titulo: "NOTAS GERAIS, CONVENÇÕES E NORMAS", tipo: "notas", grupo: "notas" });
    var feitas = [], offs = [];
    if (!qrTxt && defs.some(function (df) { return ambDaDef(df, ambientes); })) avisos.push(K2.avisoSemPortal);
    defs.forEach(function (df, i) {
      var D = marcarCamadas(new A.Desenho(E, [])), chk = { tubos: [], cotas: [] };
      var geoF = df.geo || geo, c = { D: D, geo: geoF, r: resultado, rede: rede, ix: ix, colunas: colunas, pavs: pavs, avisos: avisos, n: i + 1, AP: A, titulo: df.titulo, sis: df.sis, trs: df.trs, iso: df.iso, pv: df.pv, prims: prims, offs: offs,
                cfg: cfg, modelo: modelo, ambientes: ambientes, nomeAp: nomeAp, chk: chk, cortes: df.cortes, parte: df.parte, quadroPagina: df.pagina, quadroNCol: df.nCol, quadroLinha: df.linha, quadroLarg: df.larg, blocosExtra: plano.saem }, res = {};
      var nS0 = D.s.length; DEF_ATUAL = df;
      try {
        if (df.vistas) { c.vistas = df.vistas; res = folhaVistas(c); }
        else if (df.tipo === "incendio") res = folhaIncendio(c);
        else if (df.tipo === "tratamento") res = folhaTratamento(c);
        else if (df.tipo === "iso") res = folhaIso(c);
        else if (df.tipo === "esquema") res = folhaEsquema(c);
        else if (df.tipo === "reservatorio" && df.partes) {
          var a0 = geoF.area, hm = (a0.h - K2.reserv.entre) / 2, nl = [];
          df.partes.forEach(function (pi, ik) { var cc = {}; for (var k0 in c) if (Object.prototype.hasOwnProperty.call(c, k0)) cc[k0] = c[k0]; cc.parte = pi; cc.geo = { area: { x: a0.x, y: a0.y + ik * (hm + K2.reserv.entre), w: a0.w, h: hm } }; for (var k1 in geoF) if (k1 !== "area" && Object.prototype.hasOwnProperty.call(geoF, k1)) cc.geo[k1] = geoF[k1]; var r1 = folhaReservatorio(cc); if (r1 && r1.naoLiberado) nl.push(r1.naoLiberado); res = res && res.escala ? { escala: res.escala + " / " + (r1 && r1.escala || "-") } : r1; });
          if (res) res.naoLiberado = nl.join("  |  ");
        }
        else if (df.tipo === "reservatorio") res = folhaReservatorio(c);
        else if (df.tipo === "quadro") res = folhaQuadro(c);
        else if (df.tipo === "esqquadro") res = folhaEsqQuadro(c, df);
        else if (df.tipo === "notas") res = folhaNotas(c);
        else if (df.tipo === "esquemaIso") { c.persp = df.persp; res = folhaEsquemaIso(c); }
        else if (df.tipo === "perspectiva") { c.persp = df.persp; c.raster = rasterDe(df.persp); res = folhaPerspectiva(c); c.raster = null; }
        else if (df.tipo === "isoprancha") { c.pv = df.pv; res = folhaIsos(c, df); }
        else if (df.tipo === "mosaico") { c.pv = df.pv; res = folhaMosaico(c, df); }
        else if (df.tipo === "ambientes") { c.pv = df.pv; res = dep("HidCaderno", "./hidcaderno.js").folhaAmbientes(c, df); }
        else if (df.tipo === "pressurizador") { c.modelo = c.modelo || modelo; res = dep("HidPressao", "./hidpressao.js").folhaPrancha(c); }
        else res = folhaDetalhes(c);
        /* DWG POR VIEWPORTS: a folha que não marcou as próprias vistas vira UM bloco (escala = a do rótulo da folha; "SEM ESCALA" = sem) */
        if (res && D.s.length > nS0 && !D.s.slice(nS0).some(function (q) { return /^<g data-bloco=/.test(q); })) {
          D.s.splice(nS0, 0, blocoAbre(D, txt(df.tipo) || "vista", res.escala, geoF.area, df.persp && df.persp.chave ? df.persp.chave : "")); D.s.push("</g>");
          arr(D._rot).forEach(function (rc) { if (rc.i >= nS0) rc.i++; });   /* o posicionador guarda o índice do texto no SVG: a abertura do bloco desloca tudo 1 */
        }
      } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + K2.erroX, geo.area.y + K2.erroY, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: K2.vermelho }); }
      if (!res) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): nada a desenhar (sem colunas de AF nem tubos de queda); folha mantida vazia."); res = {}; D.texto(geo.area.x + K2.erroX, geo.area.y + K2.vazioY, "Sem colunas de água fria nem tubos de queda no modelo.", E.T.nota, { cor: K2.vermelho }); }
      feitas.push({ def: df, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1), chk: chk, geo: geoF, naoLib: txt(res && res.naoLiberado) });
    });
    /* 15/11/2026 (auditoria do PDF real): com "Erro de cálculo" pendente (aviso de gravidade erro) ou tabelas de teste, a emissão NUNCA diz "PROJETO EXECUTIVO":
       o carimbo traz "PRELIMINAR - COM PENDÊNCIAS" (a descrição escrita pelo usuário vale; só o texto padrão é trocado) */
    var temErroCalc = !!(resultado.fixture || arr(resultado.avisos).some(function (q) { return q && q.gravidade === "erro"; })), descRev = txt(opcoes.descricaoRevisao) || cfg.descricaoRevisao;
    if (temErroCalc && !txt(opcoes.descricaoRevisao).trim() && /PROJETO EXECUTIVO/.test(descRev)) descRev = descRev.replace(/PROJETO EXECUTIVO/, "PRELIMINAR - COM PENDÊNCIAS");
    if (temErroCalc) avisos.push("Cálculo com erro pendente: a emissão sai como PRELIMINAR - COM PENDÊNCIAS (não é projeto executivo) e TODAS as folhas levam a marca NÃO LIBERADO.");
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "hidpranchas", nome: "Projeto hidrossanitário", formato: formato, orientacao: "paisagem", origem: "hidro",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: arr(opcoes.revisoesAnteriores).map(function (q) { return [txt(q[0]), txt(q[1]), txt(q[2])]; }).concat([[revNum, descRev, data]]) },   /* R01: a linha da R00 fica no quadro de revisões */
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: prefixo + "-" + f.rotulo }; }) });   /* R01: o código do desenho é HID-nn (a revisão vai na coluna REV do carimbo), não "HID R00" */
    var nPrinc = feitas.length, verif = { folhas: [], sobreposicoes: 0, rotuloTubo: 0, rotuloCota: 0 }, nNotas = null;
    feitas.forEach(function (f) { if (f.def.tipo === "notas") nNotas = prefixo + "-" + f.rotulo; });
    /* ETAPA 2: o contexto do auditor (a casa inteira, o nº de ambientes, a peça proibida do quadro) */
    var casaBB = (function () { var xs = [], zs = []; arr(rede.trechos).forEach(function (t) { if (t.sistema === "incendio") return; xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); }); return xs.length ? { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) } : null; })();
    var ctxAud = { c0: ctx0, casa: casaBB, nAmb: arr(ambientes).length, pecaProibida: pecaProibidaQuadro }, audFolhas = [];
    var folhas = feitas.map(function (f, i) {
      var gF = f.geo || geo, plF = gF === geo ? plano : planejarColuna(gF, blocos, resultado, !!qrTxt), D = f.D, fl = pr.folhas[i], W = gF.papel.w, Hp = gF.papel.h, M = gF.moldura, Fd = marcarCamadas(new A.Desenho(E, null));
      if (D.resolverRotulos) verif.rotulosMovidos = (verif.rotulosMovidos || 0) + D.resolverRotulos(f.chk);   /* POSICIONADOR: uma vez por folha, com cotas e rótulos já criados, ANTES de montar o SVG */
      var corpoBase = D.svg(), corpoSvg = corpoBase, aud = auditarFolha(f.def, corpoBase, gF, ctxAud), marcasAud = aud.problemas.filter(function (q) { return q.marca; }).map(function (q) { return q.texto; });
      audFolhas.push({ numero: prefixo + "-" + f.rotulo, titulo: f.def.titulo, tipo: f.def.tipo, ocupacao: aud.ocupacao, oculto: aud.oculto, problemas: aud.problemas });
      aud.problemas.forEach(function (q) { avisos.push("Auditor da folha " + prefixo + "-" + f.rotulo + ": " + q.texto + (q.marca ? " - folha marcada NÃO LIBERADO." : ".")); });
      Fd.ret(M.x, M.y, M.w, M.h, "HID-MOLDURA");
      /* 17/11/2026: erro de cálculo pendente (ou folha com defeito de modelagem, ex.: caixa d'água sem ligação) → a folha sai MARCADA, em vermelho, acima da moldura */
      var motivoNL = [temErroCalc ? K2.naoLiberado.erroCalc : "", f.naoLib ? K2.naoLiberado.semLigacao + f.naoLib : "", marcasAud.length ? K2.naoLiberado.semLigacao + "AUDITORIA: " + marcasAud.join("; ").toUpperCase() : ""].filter(Boolean).join("  |  ");   /* os dois motivos, se houver os dois */
      if (motivoNL) Fd.texto(M.x, M.y - K2.naoLiberado.subida, motivoNL, K2.naoLiberado.altura, { cor: K2.vermelho });
      var ambF = qrTxt ? ambDaDef(f.def, ambientes) : null, qrF = ambF ? linkAmbientes(qrTxt, ambF.ids) : qrTxt;
      if (!colunaLegenda(Fd, gF, plF, { qr: qrF, qrAmb: ambF ? ambF.nomes : null, folhaNotas: nNotas, folhaDef: f.def, primeira: i === 0, r: resultado }) && i === 0) avisos.push("Legenda e notas não cabem na coluna com a letra mínima do padrão: conferir.");
      A.carimbo(Fd, pr, fl, gF, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nPrinc));
      var numero = prefixo + "-" + f.rotulo;
      /* ETAPA 3: o AJUSTE MANUAL (viewport, rótulos movidos, camadas escondidas) entra por cima do desenho automático; svgBase = a folha SEM ele (o "voltar ao automático" da tela e o que se guarda no projeto) */
      var EDX = EDT(), temAj = !!(EDX && AJ && Object.keys(AJ.vistas).length), moldura = Fd.svg();
      if (temAj) corpoSvg = EDX.aplicarSvg(corpoBase, AJ);
      var montarSvg = function (corpo) { return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(Hp) + 'mm" viewBox="0 0 ' + n(W) + " " + n(Hp) + '" font-family="' + FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '"' + (qrF ? ' data-qr="' + esc(qrF) + '"' + (ambF ? ' data-qr-ambiente="' + esc(ambF.ids.join(K2.qrSep)) + '"' : "") : "") + '>' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(Hp) + '" fill="#fff"/>' + '<g data-corpo="1">' + corpo + "</g>" + '<g data-folha-moldura="1">' + moldura + "</g></svg>"; };
      var svg = montarSvg(corpoSvg), svgBase = corpoSvg === corpoBase ? svg : montarSvg(corpoBase);
      var cx = D.caixas || [], pares = A.sobreposicoes(cx), cf = conferirFolha(cx, f.chk);
      verif.folhas.push({ numero: numero, tipo: f.def.tipo, textos: cx.length, sobreposicoes: pares.length, pares: pares.slice(0, K2.parEx), rotuloTubo: cf.rotuloTubo.length, rotuloCota: cf.rotuloCota.length, exTubo: cf.rotuloTubo.slice(0, K2.parEx), exCota: cf.rotuloCota.slice(0, K2.parEx) });
      verif.sobreposicoes += pares.length; verif.rotuloTubo += cf.rotuloTubo.length; verif.rotuloCota += cf.rotuloCota.length;
      if (pares.length) avisos.push("Folha " + numero + ": " + pares.length + " par(es) de textos sobrepostos (ex.: " + pares.slice(0, K2.parAviso).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      if (cf.rotuloTubo.length) avisos.push("Folha " + numero + ": " + cf.rotuloTubo.length + " rótulo(s) sobre tubo (ex.: " + cf.rotuloTubo.slice(0, K2.parAviso).map(function (q) { return q[0]; }).join("; ") + ").");
      if (cf.rotuloCota.length) avisos.push("Folha " + numero + ": " + cf.rotuloCota.length + " rótulo(s) sobre cota (ex.: " + cf.rotuloCota.slice(0, K2.parAviso).map(function (q) { return q[0]; }).join("; ") + ").");
      return { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, tipo: f.def.tipo, grupo: f.def.grupo, formato: f.def.geo ? cfg.isoFormato : formato, escala: f.escala, svg: svg, caixasTexto: cx,
               naoLiberado: motivoNL, qr: qrF || "", qrAmbientes: ambF ? ambF.ids : [], vistas: arr(f.def.vistas).map(function (it) { return it.titulo; }), ocupacao: f.def.ocupacao == null ? null : Math.round(f.def.ocupacao * 100) / 100,
               svgBase: svgBase, editaveis: EDX ? EDX.blocosDoSvg(corpoBase) : [], ajustada: svg !== svgBase };
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var auditoria = (function () {
      var oc = audFolhas.filter(function (q) { return q.ocupacao != null; }), ov = audFolhas.filter(function (q) { return q.oculto != null; });
      return { folhas: audFolhas, nFolhas: audFolhas.length, ocupacaoMedia: oc.length ? oc.reduce(function (a0, q) { return a0 + q.ocupacao; }, 0) / oc.length : null, ocultoMedio: ov.length ? ov.reduce(function (a0, q) { return a0 + q.oculto; }, 0) / ov.length : null,
        vazias: audFolhas.filter(function (q) { return q.problemas.some(function (p0) { return p0.codigo === "QUASE_VAZIA"; }); }).length, reprovadas: audFolhas.filter(function (q) { return q.problemas.some(function (p0) { return p0.marca; }); }).length };
    })();
    var imgsR = IMAGENS || {}, vistasMod = VISTAS_GER; FOTO3D = null; IMAGENS = null; ICONES = null; EXISTE = null; AJ = null; DEF_ATUAL = null; VISTAS_GER = {};
    return { ok: true, folhas: folhas, avisos: avisos, verificacao: verif, isometricos: iso.desenhos, fixture: !!resultado.fixture, config: cfg, ambientes: ambientes, prefixo: prefixo, revisao: rev, imagensPorChave: imgsR, vistasModelo: vistasMod, auditoria: auditoria, liberado: auditoria.reprovadas === 0 && !temErroCalc };   /* liberado = o auditor não reprovou folha E não há erro de cálculo pendente */
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
    var min = num(opcoes && opcoes.colunaMinima_m, KI.colunaMin_m);
    return H.colunasAF ? H.colunasAF(trAF, min) : {};   /* o MESMO critério do isométrico (coluna AF-n × sub-ramal SR-n) */
  }

  /* ------------------------------------------------------------ EXPORTAR (mesmo caminho das outras pranchas: SVG → SvgPdf) */
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var S = PDF(); return S ? S.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Projeto hidrossanitário", imagensPorChave: r.imagensPorChave || {} }) : null; }
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
  var _int = { paginarQuadro: paginarQuadro, largurasQuadro: largurasQuadro, juntarEsquemaQuadro: juntarEsquemaQuadro, letraQuadro: letraQuadro, auditarFolha: auditarFolha, ocupacaoSvg: ocupacaoSvg, caixaDoSvg: caixaDoSvg, gradeMosaico: gradeMosaico, escalaCelula: escalaCelula, montarMosaicos: montarMosaicos, juntarPoucoOcupadas: juntarPoucoOcupadas, tirarDuplicadas: tirarDuplicadas, ocultoDaVista: ocultoDaVista, setFoto3d: function (f) { FOTO3D = typeof f === "function" ? f : null; }, oclusaoVista: oclusaoVista, vistaAuto: vistaAuto, trechosDaVista: trechosDaVista, pavsEfetivos: pavsEfetivos, pavsDosAmbientes: pavsDosAmbientes, pavDoAmbiente: pavDoAmbiente, ambienteMolhado: ambienteMolhado, ambienteDoPav: ambienteDoPav, perspVazia: perspVazia, plantaComConteudo: plantaComConteudo, assinaturaCorte: assinaturaCorte, PROIBIDA_QUADRO: PROIBIDA_QUADRO, clipSegCaixa: clipSegCaixa, produtoDoAcessorio: produtoDoAcessorio, setPosicionador: function (v) { POS_ATIVO = !!v; }, posicionador: posicionador, caixaLivre: caixaLivre, blocoVista: blocoVista, soHidro: soHidro, linhasQuadro: linhasQuadro, K2: K2, nomeAparelhoFn: nomeAparelhoFn, linhasLegendaPontos: linhasLegendaPontos, medirTabela: medirTabela, desenharQr: desenharQr, portalDe: portalDe, linkAmbientes: linkAmbientes, rotuloQrAmb: rotuloQrAmb, rasterDe: rasterDe, fotoPlanta: fotoPlanta, paredesDoPav: paredesDoPav, ctxBase: ctxBase, estilo: estilo, marcarCamadas: marcarCamadas, perspectivaDe: perspectivaDe, folhaPerspectiva: folhaPerspectiva, formasDe: formasDe, formasPlanta: formasPlanta, plantaPrim: plantaPrim, desenhar: desenhar,
    bordasTubo: bordasTubo, obstaculosFormas: obstaculosFormas, deTubo: deTubo, listasArq: listasArq, fundoArquitetura: fundoArquitetura, trechosDoPav: trechosDoPav, poliCheio: poliCheio, br: br, larg: larg, n: n, dois: dois, esc: esc,
    CAMADA_SIS: CAMADA_SIS, NOME_SIS: NOME_SIS, NOME_SIS_Q: NOME_SIS_Q, ORD_SIS_P: ORD_SIS_P, notasDe: notasDe, legendaItens: legendaItens, simboloLeg: simboloLeg, nomeFamilia: nomeFamilia, rotuloPecaPlanta: rotuloPecaPlanta,
    paredesDoPav: paredesDoPav, paredesHidraulicas: paredesHidraulicas, desenhoCorte: desenhoCorte, cadeiasElevacao: cadeiasElevacao, recortaEixo: recortaEixo, linhasLoucas: linhasLoucas, APARELHO_RE: APARELHO_RE, caixasReais: caixasReais, dnRotulo: dnRotulo, gruposRotulo: gruposRotulo, iconePeca: iconePeca, conferirFolha: conferirFolha, hoje: hoje, FONTE: FONTE, PAD: PAD, dist3d: dist3d };
  var HidPranchas = { folhaPiscina: folhaPiscina, temPiscina: temPiscina, PSC: PSC, _int: _int, VERSAO: 2, K2: K2, gerar: gerar, exportar: exportar, estilo: estilo, trechosDoPav: trechosDoPav,
    configPadrao: configPadrao, normalizarConfig: normalizarConfig, ambientesAuto: ambientesAuto, paraDxf: paraDxf, conferirFolha: conferirFolha,
    CONJUNTOS: CONJUNTOS, ROTULO_CONJUNTO: ROTULO_CONJUNTO, SISTEMAS_FOLHA: SISTEMAS_FOLHA, FORMATOS: FORMATOS_OK, _segQuad: segQuad, _aciDe: aciDe };
  global.HidPranchas = HidPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

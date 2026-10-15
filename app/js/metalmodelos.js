/* =====================================================================
 * metalmodelos.js — GALERIA DE MODELOS PARAMÉTRICOS de guarda-corpos e
 * escadas (motor PURO, ES5, sem DOM, Node-testável). Frente M5, 14/10/2026.
 *
 * Pedido do Rogério: "quero parametrizado mais modelos de guarda-corpos, de
 * escadas etc." — numa galeria só, junto com os que já existiam, com a
 * prévia. Cada modelo é um PONTO DE PARTIDA de um tipo das peças prontas
 * (js/metalprontas.js + js/metalacessos.js): o diálogo abre com os valores
 * do modelo, o engenheiro muda o que quiser e a conformidade e o cálculo
 * aparecem ao vivo (js/acoacessos.js) — nada aqui dimensiona sozinho.
 *
 * As NORMAS de cada modelo são as que a verificação aplica (com o item);
 * "sem texto" vai só para o arquivo interno (docs/metalica/ACESSOS.md).
 *
 * API
 *   MetalModelos.MODELOS                [{ id, grupo, tipo, rotulo, descricao, normas[], par, novo }]
 *   MetalModelos.GRUPOS                 [{ id, rotulo }]
 *   MetalModelos.lista(grupo)           os modelos do grupo (ou todos)
 *   MetalModelos.modelo(id)             o modelo
 *   MetalModelos.parDe(id, extra)       o par completo (padrão do tipo + o do modelo + extra)
 *   MetalModelos.gerar(id, extra, novoId) o resultado do MetalProntas.gerar na origem
 *   MetalModelos.avaliar(id, extra)     { ok, r, conformidade, dimensionamento, norma, calculo }
 *   MetalModelos.previa(id)             SVG (texto) da prévia (planta + elevação)
 * Teste: node tools/test-metal-modelos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MP() { return dep("MetalProntas", "./metalprontas.js"); }
  function MA() { return dep("MetalAcessos", "./metalacessos.js"); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var GRUPOS = [{ id: "guarda", rotulo: "Guarda-corpos e corrimãos" }, { id: "escada", rotulo: "Escadas" }, { id: "outros", rotulo: "Rampas, plataformas e passarela" }];
  var NR12_7 = "NR-12, Anexo III, 7 c), d) e e): travessão de 1,10 a 1,20 m sem superfície plana, intermediária a 0,70 m, rodapé de 0,20 m";
  var T12_IND = "NBR 6120:2019, 6.3 e Tabela 12: 2,0 kN/m a 1,1 m (atividade industrial) no montante, na solda da base e nos travessões";
  var T12_PUB = "NBR 6120:2019, 6.3 e Tabela 12: 1,0 kN/m a 1,1 m (acesso público)";
  var N14718 = "ABNT NBR 14718:2019: altura mínima de 1,10 m; uso público: vão-luz ≤ 0,11 m (gabarito de 25 × 11 × 11 cm)";
  var NPT_PRE = "NPT 011:2024 (CBPMPR), 5.8.3.1: painéis e balaústres com 1.200 Pa na área bruta";
  var N12_ESC = "NR-12, Anexo III, 12 a), b), d) e e): largura ≥ 0,60 m, piso ≥ 0,20 m, espelho de 0,20 a 0,25 m, descanso a cada 3,00 m; até 45° (Figura 1 C)";
  var DEGRAU = "NBR 6120:2019, Tabela 10, nota t: degrau com 2,5 kN; flecha com 1,5 kN ≤ W/300 e 6 mm (ABNT NBR ISO 14122-3)";
  var ESC_NR12 = { norma: "nr12", forma: "patamares", desnivel: 3.0, largura: 0.8, degrau: "grade", gradeH: 0.030, gradeT: 0.005, gradeA: 0.030, rodape: true, hRodape: 0.20,
    guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, usoGuarda: "industrial", usoPiso: "escada-sem-publico", longarina: "C200X17.1", fixPe: "auto", fixTopo: "auto" };
  function com(base, extra) { var o = clone(base); Object.keys(extra || {}).forEach(function (k) { o[k] = clone(extra[k]); }); return o; }

  var MODELOS = [
    /* ---------------------------------------------------------- GUARDA-CORPOS (os novos e o de antes) */
    { id: "gc-industrial-2", grupo: "guarda", tipo: "guardacorpo", rotulo: "Industrial — 2 travessas", descricao: "Montantes de tubo, travessão superior a 1,10 m e a intermediária a 0,70 m, rodapé de 0,20 m. O guarda-corpo industrial de sempre.",
      normas: [NR12_7, T12_IND], par: { modelo: "gc-industrial-2", norma: "nr12", comprimento: 3, preenchimento: "travessas", travessasExtra: 0, rodape: true, usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-industrial-3", grupo: "guarda", tipo: "guardacorpo", rotulo: "Industrial — 3 travessas", descricao: "O industrial com uma travessa a mais entre o rodapé e a intermediária: o vão livre fica abaixo de 0,50 m em toda a altura.", novo: true,
      normas: [NR12_7, "ABNT NBR ISO 14122-3:2023, 7.1: vão livre entre travessas ≤ 0,50 m", T12_IND], par: { modelo: "gc-industrial-3", norma: "nr12", comprimento: 3, preenchimento: "travessas", travessasExtra: 1, rodape: true, usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-tela", grupo: "guarda", tipo: "guardacorpo", rotulo: "Com tela (malha soldada)", descricao: "Industrial com painéis de tela soldada (malha de 50 mm, fio de 5 mm) entre as travessas e os montantes.", novo: true,
      normas: [NR12_7, NPT_PRE, T12_IND], par: { modelo: "gc-tela", norma: "nr12", comprimento: 3, preenchimento: "tela", telaFio: 0.005, telaMalha: 0.05, rodape: true, usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-perfurada", grupo: "guarda", tipo: "guardacorpo", rotulo: "Com chapa perfurada", descricao: "Industrial com painéis de chapa perfurada de 3 mm (furo Ø 8 mm a cada 12 mm) entre as travessas e os montantes.", novo: true,
      normas: [NR12_7, NPT_PRE, T12_IND], par: { modelo: "gc-perfurada", norma: "nr12", comprimento: 3, preenchimento: "perfurada", tPainel: 0.003, furoD: 0.008, furoPasso: 0.012, rodape: true, usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-barras-publico", grupo: "guarda", tipo: "guardacorpo", rotulo: "Barras verticais — uso público", descricao: "Edificação com acesso público: barras redondas verticais com vão livre de até 10 cm (o limite é 11 cm), travessa de baixo rente ao piso.", novo: true,
      normas: [N14718, "ABNT NBR 9050:2020, 6.9.1: o guarda-corpo da rota acessível segue a NBR 14718", NPT_PRE, T12_PUB], par: { modelo: "gc-barras-publico", norma: "nbr14718", publico: true, comprimento: 3, preenchimento: "barras", vaoBarras: 0.10, barraD: 0.016, rodape: false, intermediaria: 0, usoGuarda: "publico", montante: "HSS60.3X3.9", corrimao: "HSS48.3X3.7", fixacao: "auto" } },
    { id: "gc-tubular-redondo", grupo: "guarda", tipo: "guardacorpo", rotulo: "Tubular redondo", descricao: "Todo em tubo redondo: montantes Ø 60,3 mm a cada 0,70 m, travessão e travessas Ø 42,2 mm, rodapé — para a área industrial (NR-12).", novo: true,
      normas: [NR12_7, T12_IND], par: { modelo: "gc-tubular-redondo", norma: "nr12", comprimento: 3, preenchimento: "travessas", travessasExtra: 0, rodape: true, espac: 0.7, montante: "HSS60.3X5.5", corrimao: "HSS42.2X3.6", usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-tubular-quadrado", grupo: "guarda", tipo: "guardacorpo", rotulo: "Tubular quadrado", descricao: "Montantes e travessão em tubo quadrado de 50,8 mm com barras verticais — edificação (o travessão plano não serve na indústria: NR-12, 7 d).", novo: true,
      normas: [N14718, "NR-12, Anexo III, 7 d): na indústria o travessão não pode ter superfície plana — este modelo é de edificação", T12_PUB], par: { modelo: "gc-tubular-quadrado", norma: "nbr14718", publico: false, comprimento: 3, preenchimento: "barras", vaoBarras: 0.10, rodape: false, intermediaria: 0, montante: "HSS50.8X50.8X4.8", corrimao: "HSS50.8X50.8X3.2", usoGuarda: "sem-publico", fixacao: "auto" } },
    { id: "gc-vidro-montante", grupo: "guarda", tipo: "guardacorpo", rotulo: "Vidro preso nos montantes", descricao: "Vidro laminado 8+8 mm preso nos montantes por garras, com o travessão por cima. O vidro NÃO é dimensionado (espessura e fixação pela norma de vidro e pelo fabricante).", novo: true,
      normas: [N14718, "ABNT NBR 7199:2025: vidro de segurança (laminado) em guarda-corpo — espessura e fixação pela norma e pelo fabricante: NÃO dimensionado aqui", T12_PUB], par: { modelo: "gc-vidro-montante", norma: "nbr14718", publico: true, comprimento: 3, preenchimento: "vidro", vidroComp: "8+8", vidroFix: "montante", rodape: false, intermediaria: 0, usoGuarda: "publico", montante: "HSS60.3X3.9", fixacao: "auto" } },
    { id: "gc-vidro-perfil", grupo: "guarda", tipo: "guardacorpo", rotulo: "Vidro no perfil de base", descricao: "Vidro laminado 10+10 mm encaixado num perfil U no piso, sem montantes, com o corrimão por cima. O vidro e o perfil NÃO são dimensionados.", novo: true,
      normas: [N14718, "ABNT NBR 7199:2025: vidro de segurança (laminado) — NÃO dimensionado aqui", T12_PUB], par: { modelo: "gc-vidro-perfil", norma: "nbr14718", publico: true, comprimento: 3, preenchimento: "vidro", vidroComp: "10+10", vidroFix: "perfil", corrimaoTopo: true, rodape: false, intermediaria: 0, usoGuarda: "publico", fixacao: "auto" } },
    { id: "gc-cancela", grupo: "guarda", tipo: "guardacorpo", rotulo: "Com cancela de autofechamento", descricao: "Industrial com a abertura de acesso de 0,80 m fechada por cancela de autofechamento (dobradiça com mola ou por gravidade).", novo: true,
      normas: [NR12_7, "ABNT NBR ISO 14122-3:2023, 7.1: abertura de acesso no guarda-corpo protegida por cancela de autofechamento", T12_IND + " (também no quadro da cancela)"], par: { modelo: "gc-cancela", norma: "nr12", comprimento: 4, abertura: 0.8, aberturaPos: 0.5, cancela: true, rodape: true, usoGuarda: "industrial", fixacao: "auto" } },
    { id: "gc-corrimao-duplo", grupo: "guarda", tipo: "guardacorpo", rotulo: "Corrimão duplo NBR 9050 sobre montantes", descricao: "Corrimão em duas alturas (0,92 e 0,70 m), tubo de 42,2 mm, prolongado 0,30 m nas pontas com o fim recurvado — sobre montantes (rampa, escada, circulação).", novo: true,
      normas: ["ABNT NBR 9050:2020, 6.9.3.2: corrimão a 0,92 e 0,70 m, prolongamento de 0,30 m", "ABNT NBR 9050:2020, 4.6.5: seção circular de 30 a 45 mm, 40 mm livres da face", "NPT 011:2024, 5.8.3.2: corrimão com 900 N"], par: { modelo: "gc-corrimao-duplo", norma: "nbr9050", soCorrimao: true, comprimento: 3, prolongamento: 0.30, corrimao: "HSS42.2X3.6", montante: "HSS48.3X3.7", usoGuarda: "publico", terminalIni: "curva", terminalFim: "curva", fixacao: "auto" } },
    { id: "gc-corrimao-parede", grupo: "guarda", tipo: "corrimaoparede", rotulo: "Corrimão de parede (NBR 9050)", descricao: "Corrimão preso na parede em duas alturas, suportes de barra redonda, pontas recurvadas e o prolongamento.",
      normas: ["ABNT NBR 9050:2020, 6.9.3.2 e 4.6.5", "NPT 011:2024, 5.8.2.4 (40 mm da parede) e 5.8.3.2 (900 N)"], par: {} },
    /* ---------------------------------------------------------- ESCADAS (as novas e as de antes) */
    { id: "esc-nr12", grupo: "escada", tipo: "escada", rotulo: "Escada industrial NR-12", descricao: "Reta, com o descanso a cada 3,00 m pela norma, degrau em grade, guarda-corpo com intermediária e rodapé nos dois lados, fixação automática.",
      normas: [N12_ESC, NR12_7, DEGRAU], par: com(ESC_NR12, {}) },
    { id: "esc-patamar", grupo: "escada", tipo: "escada", rotulo: "Reta com patamar intermediário", descricao: "Dois lances com um patamar de descanso no meio, mesmo abaixo dos 3,00 m da norma (patamar ≥ largura e ≥ 0,80 m).", novo: true,
      normas: [N12_ESC, NR12_7, DEGRAU], par: com(ESC_NR12, { desnivel: 2.8, nPatamares: 1 }) },
    { id: "esc-emergencia", grupo: "escada", tipo: "escada", rotulo: "Escada de emergência (NBR 9077 / IT)", descricao: "Em U, 1,20 m de largura, degrau de 16 a 18 cm com Blondel de 63 a 64 cm, lance de até 3,70 m, corrimão dos dois lados e barras verticais (esfera de 0,15 m não passa). Vale a IT do Corpo de Bombeiros do estado da obra; a largura pela população (N = P/C).", novo: true,
      normas: ["NPT 011:2024 (segue a IT-11/2019 e a NBR 9077): 5.4.2.1 largura ≥ 1,20 m; 5.7.3.1 degrau 16–18 cm e 63 ≤ 2h + b ≤ 64 cm; 5.7.3.2 lance ≤ 3,70 m", "NPT 011:2024, 5.8.1.2 e 5.8.1.4 a): guarda ≥ 1,05 m e esfera de 0,15 m; 5.8.2.1 e 5.8.2.3: corrimão dos dois lados, Ø 38–65 mm", "NBR 6120:2019, Tabela 12: 1,0 kN/m (escadas de emergência)"],
      par: { norma: "emergencia", forma: "U", desnivel: 3.0, largura: 1.2, degrau: "xadrez", tDegrau: 0.0095, espelho: true, rodape: false, guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", usoGuarda: "emergencia", usoPiso: "escada-publico", longarina: "C250X22.8", preenchimento: "barras", vaoBarras: 0.10 } },
    { id: "esc-navio", grupo: "escada", tipo: "escada", rotulo: "Escada de navio (50° a 75°)", descricao: "Escada íngreme de degraus sem espelho para pouco espaço em planta: piso ≥ 15 cm, espelho ≤ 25 cm, 600 ≤ g + 2h ≤ 660 mm, guarda-corpo dos dois lados.", novo: true,
      normas: ["NR-12, Anexo III, 11 a), b), d), e) e g): largura ≥ 0,60 m, piso ≥ 0,15 m, espelho ≤ 0,25 m, descanso a cada 3,00 m, 600 ≤ g + 2h ≤ 660 mm; 45° a 75° (Figura 1 D)", NR12_7 + " (7.2: vale para a escada de degraus)", DEGRAU],
      par: com(ESC_NR12, { norma: "nr12-ingreme", desnivel: 2.5, largura: 0.6, anguloMin: 50, longarina: "C150X12.2" }) },
    { id: "esc-dobrada", grupo: "escada", tipo: "escada", rotulo: "Degrau em chapa dobrada", descricao: "A escada industrial com o degrau em chapa dobrada (bocel na frente e dobra atrás, aba de 5 cm): a espessura sai da verificação pela seção efetiva.", novo: true,
      normas: [N12_ESC, DEGRAU, "ABNT NBR 14762:2010, 9.2.2 e 9.8.2.1: largura efetiva da chapa comprimida e escoamento da seção efetiva"], par: com(ESC_NR12, { desnivel: 2.4, degrau: "dobrada", abaDegrau: 0.05 }) },
    { id: "esc-xadrez", grupo: "escada", tipo: "escada", rotulo: "Degrau em chapa xadrez", descricao: "A escada industrial com o degrau em chapa xadrez plana: a espessura sai da verificação (flexão e flecha).", novo: true,
      normas: [N12_ESC, DEGRAU], par: com(ESC_NR12, { desnivel: 2.4, degrau: "xadrez" }) },
    { id: "esc-grade", grupo: "escada", tipo: "escada", rotulo: "Degrau em grade", descricao: "A escada industrial com o degrau em grade eletrofundida (barra portante 30 × 5 mm a cada 30 mm); com a grade no catálogo, vale a tabela de vão × carga do fabricante.", novo: true,
      normas: [N12_ESC, DEGRAU], par: com(ESC_NR12, { desnivel: 2.4, degrau: "grade" }) },
    { id: "esc-fixa-descanso", grupo: "escada", tipo: "marinheiro", rotulo: "Escada fixa com plataforma de descanso", descricao: "Marinheiro em dois lances deslocados com a plataforma de descanso no meio (lances de até 6,00 m), gaiola e cancela. Só onde rampa e escada de degraus não cabem.", novo: true,
      normas: ["NR-12, Anexo III, 13 c), d), g), h), i) e j): gaiola acima de 3,50 m, montantes 1,10 m acima do topo, lances de até 6,00 m com eixos a ≥ 0,70 m, degraus a 0,25–0,30 m", "NR-12, Anexo III, 1.3 e NR-35, Anexo III, 4.1.2.1: só na impossibilidade técnica dos outros meios (declaração do projetista)"], par: { altura: 9, descansoSempre: true, lanceMax: 4.5 } },
    { id: "esc-nbr9050", grupo: "escada", tipo: "escada", rotulo: "Escada acessível (NBR 9050)", descricao: "Espelho de 16 a 18 cm, piso de 28 a 32 cm, patamar a cada 3,20 m, corrimão duplo com prolongamento.",
      normas: ["ABNT NBR 9050:2020, 6.8.2, 6.8.7 e 6.9.3.2"], par: { norma: "nbr9050", forma: "patamares", desnivel: 3.0, largura: 1.2, degrau: "xadrez", tDegrau: 0.0095, espelho: true, rodape: false, guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS42.2X3.6", usoGuarda: "industrial", usoPiso: "escada-publico", longarina: "C250X22.8" } },
    { id: "esc-L", grupo: "escada", tipo: "escada", rotulo: "Escada em L", descricao: "Dois lances com o patamar de canto.", normas: [N12_ESC, NR12_7], par: com(ESC_NR12, { forma: "L", fixPe: "", fixTopo: "" }) },
    { id: "esc-U", grupo: "escada", tipo: "escada", rotulo: "Escada em U", descricao: "Dois lances com o patamar de meia-volta.", normas: [N12_ESC, NR12_7], par: com(ESC_NR12, { forma: "U", fixPe: "", fixTopo: "" }) },
    { id: "esc-caracol", grupo: "escada", tipo: "escada", rotulo: "Escada caracol", descricao: "Mastro no centro, degraus em setor soldados no mastro, guarda-corpo na borda de fora.", normas: ["degrau por Blondel (2e + p de 63 a 64 cm); sem norma de acesso — o mastro e o degrau em balanço não são verificados"], par: { forma: "caracol", desnivel: 3.0 } },
    { id: "esc-marinheiro", grupo: "escada", tipo: "marinheiro", rotulo: "Escada de marinheiro", descricao: "Escada fixa vertical com gaiola acima de 3,50 m e cancela no topo.", normas: ["NR-12, Anexo III, 13 e 13.1", "NR-35, Anexo III, 4.1.2 a 5.2.1.2.2"], par: {} },
    { id: "esc-helicoidal", grupo: "escada", tipo: "helicoidal", rotulo: "Escada helicoidal no tanque", descricao: "Escada enrolada no costado com consoles radiais e patamar a cada 3,00 m.", normas: [N12_ESC], par: {} },
    { id: "rampa-nr12", grupo: "outros", tipo: "rampa", rotulo: "Rampa industrial (NR-12)", descricao: "Até 20°; de 10° a 20° com peças transversais.", normas: ["NR-12, Anexo III, 6 e 6.1"], par: { norma: "nr12" } },
    { id: "rampa-nbr9050", grupo: "outros", tipo: "rampa", rotulo: "Rampa acessível (NBR 9050)", descricao: "Até 8,33 %, desnível por segmento e patamares, corrimão duplo.", normas: ["ABNT NBR 9050:2020, 6.6"], par: { norma: "nbr9050", desnivel: 1.5, inclinacao: 8.33, largura: 1.2, guarda: "dois", corrimao: "HSS42.2X3.6", rodape: true, hRodape: 0.05, usoGuarda: "industrial", usoPiso: "escada-publico" } },
    { id: "plataforma", grupo: "outros", tipo: "plataforma", rotulo: "Plataforma de manutenção", descricao: "Pilares, vigas, piso em grade, guarda-corpo e a abertura com cancela.", normas: ["NR-12, Anexo III, 7 e 10", "NBR 6120:2019, Tabelas 10 e 12"], par: {} },
    { id: "passarela", grupo: "outros", tipo: "passarela", rotulo: "Passarela", descricao: "Apoiada nas pontas ou em pilares, guarda-corpo dos dois lados.", normas: ["NR-12, Anexo III, 7 e 10"], par: {} }
  ];
  var POR_ID = {}; MODELOS.forEach(function (m) { POR_ID[m.id] = m; });

  function lista(grupo) { return MODELOS.filter(function (m) { return !grupo || m.grupo === grupo; }); }
  function modelo(id) { return POR_ID[id] || null; }
  function parDe(id, extra) {
    var m = modelo(id), M = MP(); if (!m || !M) return null;
    var p = M.padrao(m.tipo); if (!p) return null;
    Object.keys(m.par || {}).forEach(function (k) { p[k] = clone(m.par[k]); });
    Object.keys(extra || {}).forEach(function (k) { p[k] = clone(extra[k]); });
    return p;
  }
  function gerar(id, extra, novoId) {
    var m = modelo(id), M = MP(); if (!m || !M) return { ok: false, motivo: "Modelo desconhecido: " + id + "." };
    var p = parDe(id, extra), k = 0; p.x0 = 0; p.y0 = 0; p.z0 = 0; p.giro = 0;
    return M.gerar(m.tipo, p, novoId || function () { return "mm" + (++k); }, {});
  }
  function avaliar(id, extra) {
    var r = gerar(id, extra); if (!r || !r.ok) return { ok: false, motivo: r ? r.motivo : "falhou", r: r };
    var A = MA(), av = A ? A.avaliar(r) : null, v = av && av.conformidade, d = av && av.dimensionamento;
    return { ok: true, r: r, conformidade: v, dimensionamento: d, norma: v ? v.status : null, calculo: d ? d.status : null };
  }
  function previa(id) { var r = gerar(id); var M = MP(); return r && r.ok && M ? M.esquema(r) : ""; }

  var MetalModelos = { MODELOS: MODELOS, GRUPOS: GRUPOS, lista: lista, modelo: modelo, parDe: parDe, gerar: gerar, avaliar: avaliar, previa: previa };
  global.MetalModelos = MetalModelos;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalModelos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

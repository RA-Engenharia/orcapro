/* =====================================================================
 * biminst.js — INSTALAÇÕES do modelador BIM (fase B5, motor puro, Node-testável)
 *
 * Pedido do Rogério (08/10/2026, PLANO-BIM-MODELADOR.md §3 B5): tubos por
 * sistema, material e diâmetro, desenhados por pontos com INCLINAÇÃO; as
 * CONEXÕES saem sozinhas nos encontros; aparelhos e ralos com ponto de
 * ligação; eletrodutos, caixas e dutos com o mesmo jeito de traçar; e o
 * QUANTITATIVO por sistema, material e DN ligado à SINAPI pelo mapa.
 *
 * Como o resto do editor (js/bimedit.js), tudo é LISTA DE OPERAÇÕES:
 *   {op:'trecho', id, sistema, material, dn, p1:{x,y,z}, p2:{x,y,z},
 *    aplicacao?, pn?, classe?, iso?, larg?, alt?, bitola?}
 *   {op:'peca', id, peca, sistema, material?, dn?, x, y, z, rotY?, alturaPiso?}
 *   {op:'instAlterar', id, ...campos}   (troca DN, material, aplicação…)
 *   mover / apagar com o id de um trecho ou peça (o BimEdit repassa).
 * As CONEXÕES não são operações: são DEDUZIDAS da geometria a cada replay
 * (rede()) — apagar um trecho tira o joelho junto.
 *
 * Convenção = a do viewer: metros, Y para cima. DN em milímetros.
 *
 * ⚠ SINAPI: o código de cada tubo/conexão/peça vem SÓ da tabela gerada
 *   (js/biminstsinapi.js, tools/gerar-biminst-sinapi.js), que só tem código
 *   que o MAPA (data/sinapi-familias-mapa.json) classificou como instalação
 *   e que está na base. Sem chave na tabela = "pendente", com o motivo —
 *   nunca a composição "parecida" (outro DN, outra aplicação, outro material).
 *
 * ⚠ CORES POR SISTEMA (convenção RA, documentada aqui e na tela):
 *   água fria AZUL · água quente VERMELHO · esgoto MARROM · ventilação
 *   marrom claro (família do esgoto) · pluvial VERDE · eletroduto AMARELO ·
 *   caixa elétrica LARANJA · duto de ar CINZA-AZULADO · frigorígeno CIANO ·
 *   dreno de condensado AZUL-CLARO · incêndio VERMELHO-ESCURO (IT 17 5.16.5) · fluido industrial MARROM-ESCURO.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }

  /* ---------------------------------------------------------- SISTEMAS
   * gravidade: o tubo DESCE no sentido do traço (p1 → p2) pela inclinação.
   * grupo: que aplicações valem (água, esgoto, pluvial, elétrica, ar). */
  var SISTEMAS = {
    agua_fria:   { nome: "Água fria", abrev: "AF", cor: "#1E6FD9", grupo: "agua", gravidade: false, materiais: ["pvc_soldavel", "ppr", "cpvc", "cobre"], material: "pvc_soldavel" },
    agua_quente: { nome: "Água quente", abrev: "AQ", cor: "#D93025", grupo: "agua", gravidade: false, materiais: ["ppr", "cpvc", "cobre"], material: "ppr" },
    esgoto:      { nome: "Esgoto", abrev: "ES", cor: "#7B4A2A", grupo: "esgoto", gravidade: true, materiais: ["pvc_esgoto", "pvc_serie_r", "pvc_esgoto_enterrado"], material: "pvc_esgoto" },
    ventilacao:  { nome: "Ventilação", abrev: "VE", cor: "#B08A6E", grupo: "ventilacao", gravidade: false, materiais: ["pvc_esgoto", "pvc_serie_r"], material: "pvc_esgoto" },
    pluvial:     { nome: "Pluvial", abrev: "AP", cor: "#2E9E44", grupo: "pluvial", gravidade: true, materiais: ["pvc_serie_r", "pvc_esgoto"], material: "pvc_serie_r" },
    eletrica:    { nome: "Elétrica (eletroduto)", abrev: "EL", cor: "#F2B600", grupo: "eletrica", gravidade: false, materiais: ["elet_corrugado_ref", "elet_corrugado", "elet_roscavel", "elet_soldavel"], material: "elet_corrugado_ref" },
    ar:          { nome: "Ar-condicionado (duto)", abrev: "AR", cor: "#7F95A8", grupo: "ar", gravidade: false, materiais: ["duto_chapa", "duto_flex"], material: "duto_chapa" },
    /* C1b climatização (17/10/2026, docs/hidro/PATCH-BIMINST-CLIMA.md): cobre frigorígeno e dreno de condensado.
       frigorigeno: as DUAS linhas (líquido e sucção) são trechos do MESMO sistema, com o campo "linha" ("liquido" | "succao");
       dreno: escoa por gravidade (p1 → p2 desce), ou recalcado pela bomba de dreno (aplicacao "bomba"). O duto de ar é o sistema "ar" (já existia). */
    frigorigeno: { nome: "Frigorígeno (cobre)", abrev: "FR", cor: "#0FA3A3", grupo: "frigorigeno", gravidade: false, materiais: ["cobre_frigorigeno"], material: "cobre_frigorigeno" },
    dreno:       { nome: "Dreno de condensado", abrev: "DR", cor: "#5DADE2", grupo: "dreno", gravidade: true, materiais: ["pvc_soldavel", "pvc_esgoto"], material: "pvc_soldavel" },
    /* F3 incêndio (17/10/2026, docs/hidro/PATCH-BIMINST-INCENDIO.md): rede de hidrantes/mangotinhos e de chuveiros automáticos.
       Tubulação aparente VERMELHA (IT 17 5.16.5), cor distinta do vermelho da água quente. Pressurizada: sem gravidade. */
    incendio:    { nome: "Incêndio (hidrantes e chuveiros)", abrev: "IN", cor: "#C62828", grupo: "incendio", gravidade: false, materiais: ["aco_galvanizado", "aco_preto", "cobre"], material: "aco_galvanizado" },
    /* Fase 5 industrial (17/10/2026, docs/hidro/PATCH-BIMINST-INDUSTRIAL.md): rede de fluido industrial (ar comprimido, vapor, condensado, óleo
       térmico, água gelada/industrial, gás). Um sistema só; o FLUIDO e a SÉRIE vão no trecho. Pressurizada. */
    industrial:  { nome: "Fluidos industriais", abrev: "IND", cor: "#6D4C41", grupo: "industrial", gravidade: false, materiais: ["aco_carbono", "inox", "cobre", "pead"], material: "aco_carbono" },
    /* P12: a bandeja de cabos (eletrocalha) — cor OLIVA (família do amarelo da elétrica, mais escura) */
    bandeja:     { nome: "Eletrocalha (bandeja de cabos)", abrev: "EC", cor: "#8A7F1F", grupo: "bandeja", gravidade: false, materiais: ["eletrocalha"], material: "eletrocalha" }
  };
  var COR_CAIXA_ELETRICA = "#F57C00";
  /* PADRÃO DE APRESENTAÇÃO DE INSTALAÇÕES (17/10/2026, js/biminstpadrao.js): a cor, a pena e o tipo de linha de cada
     sistema vêm da convenção usual de mercado levantada em dados-fonte/hidro/apresentacao/padrao-instalacoes.json
     (js GERADO: js/biminstpadraodados.js). As cores escritas acima ficam só de RESERVA, para o motor não quebrar sem
     o arquivo gerado (o teste test-biminstpadrao confere que, com ele, cada sistema sai com a cor do padrão). */
  (function () {
    var PD = dep("BimInstPadraoDados", "./biminstpadraodados.js"), ps = PD && PD.sistemas;
    if (!ps) return;
    Object.keys(ps).forEach(function (k) {
      if (!SISTEMAS[k]) return;
      /* P8 (revisão da junção, 18/10/2026): a cor do PADRÃO só com a prévia ?previa=hidro — sem ela, a cor do master (a
         de reserva acima). Getter: a prévia é lida na hora (BimPrevia); no Node (sem BimPrevia) vale o padrão. */
      var reserva = SISTEMAS[k].cor, padrao = ps[k].cor;
      try {
        Object.defineProperty(SISTEMAS[k], "cor", { enumerable: true, configurable: true,
          get: function () { return previaHidro() ? padrao : reserva; },
          set: function (v) { if (v === padrao) return; padrao = v; reserva = v; } });   /* reaplicar o padrão (BimInstPadrao.aplicar) não apaga a cor do master */
      } catch (eDP) { SISTEMAS[k].cor = padrao; }
      SISTEMAS[k].linha = { pena: ps[k].pena, mm: ps[k].mm, padrao: ps[k].padrao };
    });
  })();
  /* P8 (revisão da junção, 18/10/2026, decisão da coordenação): o que mudou nas INSTALAÇÕES do BIM geral (cor do padrão,
     rótulo da planta, luva na ponta da conexão de esgoto) fica atrás da prévia ?previa=hidro. Sem BimPrevia (Node, testes
     dos motores) vale o comportamento novo. Lido no máximo a cada 250 ms (a cor é lida milhares de vezes por reconstrução). */
  var _ph = { t: -1e9, v: true };
  function previaHidro() {
    var P = global.BimPrevia; if (!P || typeof P.hidro !== "function") return true;
    var ag = Date.now(); if (ag - _ph.t < 250) return _ph.v;   // hid:ok intervalo de releitura da prévia (ms)
    var v = true; try { v = !!P.hidro(); } catch (e) { v = true; }
    _ph = { t: ag, v: v };
    return v;
  }

  /* ---------------------------------------------------------- MATERIAIS
   * dns = DIÂMETROS NOMINAIS COMERCIAIS (mm). FONTE: a norma do produto
   * (citada em cada um) e, para não haver DN sem composição, a SINAPI 06/2026
   * (data/sinapi-MG-analitico.json): tools/test-bim-b5.js reprova se um DN
   * desta tabela não tiver TUBO na SINAPI para aquele material. DN que a
   * norma tem e a SINAPI não (ex.: eletroduto DN 50) fica FORA da lista — sem
   * fonte de preço segura, não se oferece.
   * flexivel: curva no próprio tubo — não gera joelho nem luva.
   * secao 'retangular': o duto tem largura × altura (m) e é orçado em m². */
  var MATERIAIS = {
    pvc_soldavel: { nome: "PVC soldável (marrom)", norma: "ABNT NBR 5648", dns: [20, 25, 32, 40, 50, 60, 75, 85, 110], dn: 25 },
    pvc_esgoto:   { nome: "PVC esgoto série normal", norma: "ABNT NBR 5688", dns: [40, 50, 75, 100, 150], dn: 100 },
    pvc_serie_r:  { nome: "PVC série reforçada (R)", norma: "ABNT NBR 5688", dns: [40, 50, 75, 100, 150], dn: 100 },
    /* hidro (17/10/2026): PVC-U ocre de parede maciça para rede coletora e ramal predial ENTERRADOS, NBR 7362:2025 (cancela a 9063),
       Tabela 2 — DN 100 a 1000, SN ≥ 3,5/4,0 kN/m²; Di pelo HidNormas (materiais.diametro_interno). semSinapi: a base tem os INSUMOS
       "TUBO COLETOR DE ESGOTO PVC, JEI (NBR 7362)", mas nenhuma composição foi classificada no mapa (data/sinapi-familias-mapa.json)
       → pendente, nunca a parecida. */
    pvc_esgoto_enterrado: { nome: "PVC ocre enterrado (coletor/ramal predial)", norma: "ABNT NBR 7362:2025", dns: [100, 150, 200, 250, 300, 350, 400, 450, 500, 630, 710, 800, 900, 1000], dn: 150, semSinapi: true },
    ppr:          { nome: "PPR (polipropileno)", norma: "ABNT NBR 15813", dns: [20, 25, 32, 40, 50, 63, 75, 90, 110], dn: 25, pns: ["12", "20", "25"], pn: "25" },
    cpvc:         { nome: "CPVC", norma: "ABNT NBR 15884", dns: [15, 22, 28, 35, 42, 54, 73, 89, 114], dn: 22 },
    cobre:        { nome: "Cobre rígido", norma: "ABNT NBR 13206", dns: [15, 22, 28, 35, 42, 54, 66, 79, 104], dn: 22, classes: ["E", "A"], classe: "E", isos: ["sem", "com"], iso: "sem" },
    elet_corrugado_ref: { nome: "Eletroduto PVC flexível corrugado reforçado", norma: "ABNT NBR 15465", dns: [20, 25, 32], dn: 25, flexivel: true },
    elet_corrugado:     { nome: "Eletroduto PVC flexível corrugado", norma: "ABNT NBR 15465", dns: [20, 25, 32], dn: 25, flexivel: true },
    elet_roscavel:      { nome: "Eletroduto PVC rígido roscável", norma: "ABNT NBR 15465", dns: [20, 25, 32, 40], dn: 25 },
    elet_soldavel:      { nome: "Eletroduto PVC rígido soldável (aparente)", norma: "ABNT NBR 15465", dns: [20, 25, 32], dn: 25 },
    /* C1b: tubo de cobre recozido em rolo para refrigeração, medidas em POLEGADA convertidas a mm (catálogos Daikin, Springer Midea,
       Elgin e Gree: 1/4, 3/8, 1/2, 5/8, 3/4, 7/8). tolDn: o catálogo escreve 6,35/6,4 e 9,52/9,53/9,5 para a mesma bitola — o DN do trecho
       casa com a lista dentro de 0,1 mm. semSinapi: a SINAPI 06/2026 NÃO tem composição de tubo de cobre para refrigeração — pendente de
       propósito (nunca a parecida: o "cobre" de água, NBR 13206, é outro produto). A linha frigorígena é SEMPRE isolada. */
    cobre_frigorigeno: { nome: "Tubo de cobre para refrigeração (rolo)", norma: "ABNT NBR 7541", dns: [6.35, 9.52, 12.7, 15.88, 19.05, 22.22], dn: 9.52, tolDn: 0.1,
                         flexivel: true, semSinapi: true, isos: ["com"], iso: "com" },
    /* F3 incêndio: IT 17 5.16.13 — tubos de aço NBR 5580 / 5587 / 5590. semSinapi: nenhuma composição de tubo de aço de incêndio foi
       classificada no mapa (data/sinapi-familias-mapa.json): fica pendente de propósito, nunca a parecida. O DN mínimo (65; 50 em
       galvanizado e 54 em cobre só nos tipos 1 e 2, IT 17 5.16.1/5.16.2) quem verifica é o hidinc, não o biminst. */
    aco_galvanizado: { nome: "Aço galvanizado (incêndio)", norma: "ABNT NBR 5580", dns: [25, 32, 40, 50, 65, 80, 100, 125, 150], dn: 65, semSinapi: true },
    aco_preto:       { nome: "Aço carbono preto (incêndio)", norma: "ABNT NBR 5580 / 5590", dns: [25, 32, 40, 50, 65, 80, 100, 125, 150], dn: 65, semSinapi: true },
    /* Fase 5 industrial: DN e Di vêm do HidNormas (ind.tubo.<material>); aqui só o rótulo. semSinapi: nenhuma composição de tubo industrial
       foi classificada no mapa → pendente, nunca a parecida. */
    aco_carbono: { nome: "Aço carbono (ASME B36.10)", norma: "ASME B36.10 / ABNT NBR 5590", dns: [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300], dn: 50, semSinapi: true },
    inox:        { nome: "Aço inox (ASME B36.19)", norma: "ASME B36.19", dns: [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300], dn: 50, semSinapi: true },
    pead:        { nome: "PEAD PE 100", norma: "ABNT NBR 15561", dns: [20, 25, 32, 40, 63, 90, 110, 160, 180, 200, 225, 250, 280, 315], dn: 63, semSinapi: true },
    duto_chapa: { nome: "Duto retangular de chapa galvanizada", norma: "ABNT NBR 16401 / SMACNA", secao: "retangular", dns: [], dn: 0, bitolas: ["26", "24", "22"], bitola: "24", isos: ["sem", "colada"], iso: "sem" },
    duto_flex:  { nome: "Duto flexível circular de alumínio isolado", norma: "SINAPI 06/2026 (diâmetros 4\" a 14\")", dns: [109, 131, 161, 185, 209, 263, 314, 364], dn: 161, flexivel: true },
    /* P12: eletrocalha — orçada em METRO ("inclusive emenda e fixação"); as larguras e a
       altura única (50 mm) são as da SINAPI 06/2026. O "dn" do trecho é a LARGURA em mm
       (é o que decide redução e tê); fora da lista = aviso e pendente na SINAPI. */
    eletrocalha: { nome: "Eletrocalha lisa ou perfurada de aço galvanizado", norma: "SINAPI 06/2026 (larguras 50 a 800 mm, altura 50 mm)", secao: "retangular", unidadeQto: "m",
                   dns: [], dn: 0, larguras: [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800], alturas: [50], larg: 0.10, alt: 0.05 }
  };

  /* --------------------------------------------------------- APLICAÇÕES
   * O que a SINAPI separa: o mesmo tubo de 25 mm tem composição diferente em
   * ramal, em ramal de distribuição, em prumada e em reservação (o rendimento
   * da mão de obra muda). A automática: vertical = prumada (ou parede, no
   * eletroduto); horizontal = ramal (ou laje). O usuário troca.
   * ramal_ventilacao NÃO EXISTE na SINAPI 06/2026: fica pendente de propósito
   * (orçar com a composição de ramal de ESGOTO seria escolher "a parecida"). */
  var APLICACOES = {
    agua:       { ramal: "Ramal ou sub-ramal", distribuicao: "Ramal de distribuição", prumada: "Prumada", reservacao: "Reservação (barrilete)" },
    esgoto:     { ramal: "Ramal de descarga / de esgoto", prumada: "Tubo de queda (prumada)", subcoletor: "Subcoletor aéreo" },
    ventilacao: { prumada: "Coluna de ventilação", ramal_ventilacao: "Ramal de ventilação" },
    pluvial:    { ramal: "Condutor horizontal (ramal)", prumada: "Condutor vertical" },
    eletrica:   { laje: "Embutido na laje", parede: "Embutido na parede", forro: "Sobre o forro", aparente: "Aparente" },
    ar:         { ar: "Rede de ar-condicionado" },
    frigorigeno: { parede: "Embutido na parede", forro: "Sobre o forro", laje: "Embutido na laje", aparente: "Aparente (canaleta)" },
    dreno:       { parede: "Embutido na parede", forro: "Sobre o forro", laje: "Embutido na laje", aparente: "Aparente", bomba: "Recalcado (bomba de dreno)" },
    industrial: { linha: "Linha de distribuição", ramal: "Ramal de consumo", dreno: "Dreno / condensado", suspiro: "Suspiro / alívio" },
    incendio:   { prumada: "Prumada (coluna de incêndio)", ramal: "Ramal / barrilete", chuveiros: "Rede de chuveiros (subramais)" },
    bandeja:    { bandeja: "Bandeja de cabos" }
  };

  /* -------------------------------------------- INCLINAÇÃO MÍNIMA (%)
   * Esgoto, ABNT NBR 8160:1999: 2% até DN 75 e 1% a partir de DN 100.
   * Pluvial, ABNT NBR 10844:1989: condutor horizontal com no mínimo 0,5%.
   * É o valor que o traço sugere e abaixo do qual o trecho leva AVISO —
   * quem decide o projeto é o engenheiro. */
  function inclinacaoMinima(sistema, dn) {
    /* C1b: o dreno de condensado NÃO tem número escrito aqui — vem do HidNormas (cl.dreno.inclinacao_minima); sem a chave, 0 (o ClimRede.dreno verifica e diz "pendente") */
    if (sistema === "dreno") { var HN = dep("HidNormas", "./hidnormas.js"), vd = null; try { vd = HN && HN.valor ? HN.valor("cl.dreno.inclinacao_minima") : null; } catch (eN) { vd = null; } return vd == null || !isFinite(Number(vd)) ? 0 : Number(vd); }
    if (sistema === "esgoto") return num(dn, 100) <= 75 ? 2 : 1;
    if (sistema === "pluvial") return 0.5;
    return 0;
  }
  /* a inclinação está ABAIXO DA MÍNIMA? A comparação é ≥ NO ARREDONDAMENTO EM QUE ELA É MOSTRADA (o rótulo da planta e o
     Verificar sistemas: 1 casa, "i=1,0%"). Print 11 do Rogério (17/10/2026): "ø100 i=1,0%" saía VERMELHO num trecho e verde
     no outro, "ø50 i=2,0%" vermelho — o traço tinha 0,9996 % (cota arredondada a 0,1 mm) e a regra comparava o número cru
     com 1 − 1e-6. O que aparece como 1,0 % não pode estar abaixo de 1 %: uma regra só para o rótulo, o aviso do trecho e
     o filtro de aviso. casas = as do rótulo (padrão 1). */
  var CASAS_INCLINACAO = 1;
  function abaixoDaMinima(sistema, dn, inclinacao, casas) {
    if (inclinacao == null || !isFinite(+inclinacao)) return false;
    var im = inclinacaoMinima(sistema, dn); if (!(im > 0)) return false;
    var f = Math.pow(10, casas == null ? CASAS_INCLINACAO : casas);
    return Math.round(+inclinacao * f + 1e-9) / f < im - 1e-9;
  }

  /* ---------------------------------------------------------------- PEÇAS
   * Ralos e caixas: peças com ponto de LIGAÇÃO (hub): um cilindro vertical
   * de captura — o tubo que termina dentro dele está ligado, sem conexão a
   * mais (a peça tem as entradas e a saída dela). Medidas = as da descrição
   * SINAPI (4" = 101,6 mm). */
  var PECAS = {
    ralo_sifonado:  { nome: "Ralo sifonado", sistemas: ["esgoto", "pluvial"], dns: ["100x40"], dn: "100x40", material: "pvc", ifc: "IFCWASTETERMINAL", forma: "cil", r: 0.05, h: 0.12, prof: 0.45, captura: 0.09 },
    ralo_seco:      { nome: "Ralo seco", sistemas: ["esgoto"], dns: ["100x40"], dn: "100x40", material: "pvc", ifc: "IFCWASTETERMINAL", forma: "cil", r: 0.05, h: 0.12, prof: 0.45, captura: 0.09 },
    caixa_sifonada: { nome: "Caixa sifonada", sistemas: ["esgoto", "pluvial"], dns: ["100x100x50", "150x185x75"], dn: "150x185x75", material: "pvc", ifc: "IFCWASTETERMINAL", forma: "cil", r: 0.075, h: 0.185, prof: 0.6, captura: 0.12 },
    caixa_4x2:      { nome: "Caixa 4×2 (parede)", sistemas: ["eletrica"], dns: ["-"], dn: "-", material: "pvc", materiais: ["pvc", "metalica"], ifc: "IFCJUNCTIONBOX", forma: "caixa", w: 0.1016, hh: 0.0508, d: 0.05, captura: 0.08 },
    caixa_4x4:      { nome: "Caixa 4×4 (parede)", sistemas: ["eletrica"], dns: ["-"], dn: "-", material: "pvc", materiais: ["pvc", "metalica"], ifc: "IFCJUNCTIONBOX", forma: "caixa", w: 0.1016, hh: 0.1016, d: 0.05, captura: 0.09 },
    caixa_octogonal:{ nome: "Caixa octogonal 4×4 (laje)", sistemas: ["eletrica"], dns: ["-"], dn: "-", material: "pvc", materiais: ["pvc", "metalica"], ifc: "IFCJUNCTIONBOX", forma: "cil", r: 0.0508, h: 0.05, prof: 0.0, captura: 0.09 },
    /* F3 incêndio: medidas de DESENHO (símbolo no 3D), não de projeto — o abrigo real sai da família/catálogo; o extintor não se liga a tubo.
       Sem composição SINAPI no mapa → pendente (peça com semTabela, ver itemPeca). */
    hidrante_abrigo:     { nome: "Hidrante com abrigo", sistemas: ["incendio"], dns: ["65"], dn: "65", material: "aco", ifc: "IFCFIRESUPPRESSIONTERMINAL", forma: "caixa", w: 0.75, hh: 0.90, d: 0.30, captura: 0.20, semSinapi: true },
    extintor:            { nome: "Extintor portátil", sistemas: ["incendio"], dns: ["-"], dn: "-", material: "aco", ifc: "IFCFIRESUPPRESSIONTERMINAL", forma: "cil", r: 0.09, h: 0.55, prof: 0, captura: 0, semSinapi: true },
    chuveiro_automatico: { nome: "Chuveiro automático (sprinkler)", sistemas: ["incendio"], dns: ["15", "20"], dn: "15", material: "latao", ifc: "IFCFIRESUPPRESSIONTERMINAL", forma: "cil", r: 0.03, h: 0.06, prof: 0, captura: 0.04, semSinapi: true },
    /* Fase 5 industrial: medidas de DESENHO (símbolo no 3D), não de projeto; a lira real é o balanço (perna_m) da op sobre o tubo. */
    lira_expansao:    { nome: "Lira de dilatação (U)", sistemas: ["industrial"], dns: ["*"], dn: "*", material: "aco", ifc: "IFCPIPEFITTING", forma: "caixa", w: 1, hh: 1, d: 0.1, captura: 0.05, semSinapi: true },
    purgador:         { nome: "Purgador de vapor", sistemas: ["industrial"], dns: ["15", "20", "25"], dn: "15", material: "aco", ifc: "IFCVALVE", forma: "caixa", w: 0.12, hh: 0.10, d: 0.10, captura: 0.05, semSinapi: true },
    valvula_bloqueio: { nome: "Válvula de bloqueio", sistemas: ["industrial"], dns: ["*"], dn: "*", material: "aco", ifc: "IFCVALVE", forma: "caixa", w: 0.15, hh: 0.15, d: 0.10, captura: 0.05, semSinapi: true },
    reservatorio_ar:  { nome: "Reservatório de ar comprimido", sistemas: ["industrial"], dns: ["*"], dn: "*", material: "aco", ifc: "IFCTANK", forma: "cil", r: 0.30, h: 1.40, prof: 0, captura: 0.10, semSinapi: true },
    /* TERMINAL DE VENTILAÇÃO (js/hidambiente.js + js/hidventgeo.js, 18/10/2026): o produto da ficha (Amanco 11849 / Tigre
       59502719 no DN 50) no topo da coluna de ventilação — y = o topo do tubo, que entra na bolsa (prof = a bolsa, C da ficha);
       r = metade do chapéu (B). A ponta do tubo dentro da bolsa liga na peça (não é ponta solta) */
    terminal_ventilacao: { nome: "Terminal de ventilação", sistemas: ["ventilacao"], dns: ["50", "75", "100"], dn: "50", material: "pvc_esgoto", ifc: "IFCPIPEFITTING", forma: "cil", r: 0.033, h: 0.069, prof: 0.031, captura: 0.04, semSinapi: true },
    /* PROJETO INTELIGENTE (js/hidrede.js + js/hidcigeo.js): CAIXA DE INSPEÇÃO da rede enterrada = o PRODUTO da ficha (corpo PVC
       DN300 + prolongadores + tampa com porta-tampa; a forma sai do js/hidcigeo.js). r = metade do Ø do CORPO da ficha (Amanco
       Wavin FTC000003 p.9, A = 332 mm — test-hid-ci confere contra os dados gerados); a PROFUNDIDADE é da instância (profVariavel:
       a op leva `prof`, do tampo ao fundo). ⚠ A NBR 8160 pede caixa cilíndrica de Ø interno ≥ 0,60 m: o js/hidrede.js deixa a
       PENDÊNCIA rede.caixa_diametro (DN300 = peça de inspeção). Sem composição SINAPI mapeada: pendente. */
    /* PENDÊNCIAS FINAIS (18/10/2026): o PADRÃO passou a ser a CAIXA DE 0,60 m (tipoCaixa "alvenaria" — tijolo maciço — ou
       "premoldado", tampa "concreto" ou "ferro"; dn "600"), com a composição SINAPI real pela profundidade e o 3D da caixa dela
       (js/hidcigeo.js + js/hidcidados.js). O produto de PVC DN300 ficou como DISPOSITIVO de inspeção (tipoCaixa "pvc300", dn
       "300"): a 8160 só o aceita fora da rede enterrada — na enterrada, o js/hides.js reprova com o Corrigir. */
    caixa_inspecao:      { nome: "Caixa de inspeção", sistemas: ["esgoto"], dns: ["600", "300"], dn: "600", material: "pvc_esgoto", ifc: "IFCDISTRIBUTIONCHAMBERELEMENT", forma: "cil", r: 0.30, h: 0.06, prof: 0.60, captura: 0.28, profVariavel: true,
                           tipos: { alvenaria: "Caixa de alvenaria 0,60 m (tijolo maciço)", premoldado: "Caixa pré-moldada de concreto 0,60 m", pvc300: "Dispositivo de inspeção de PVC Ø 300 (só fora da rede enterrada)" },
                           tampas: { concreto: "Tampa de concreto", ferro: "Tampa de ferro fundido" } },
    registro_recalque:   { nome: "Registro de recalque (passeio)", sistemas: ["incendio"], dns: ["65"], dn: "65", material: "aco", ifc: "IFCVALVE", forma: "caixa", w: 0.40, hh: 0.40, d: 0.30, captura: 0.15, semSinapi: true }
  };
  /* caixa de parede: a SINAPI separa ALTA (2,00 m do piso), MÉDIA (1,30 m) e
     BAIXA (0,30 m) — vale a mais próxima da altura em que a caixa foi posta */
  var ALTURAS_CAIXA = { baixa: 0.30, media: 1.30, alta: 2.00 };
  function alturaCaixa(alturaPiso) {
    var a = num(alturaPiso, 0.30), melhor = "baixa", d0 = Infinity;
    Object.keys(ALTURAS_CAIXA).forEach(function (k) { var d = Math.abs(ALTURAS_CAIXA[k] - a); if (d < d0) { d0 = d; melhor = k; } });
    return melhor;
  }

  var NOMES_CONEXAO = { joelho90: "Joelho 90°", joelho45: "Joelho 45°", te: "Tê", te_reducao: "Tê de redução", juncao: "Junção simples", luva: "Luva", reducao: "Redução", cruzeta: "Cruzeta",
                        uniao: "União", te_inspecao: "Tê de inspeção" };
  /* PENDÊNCIAS FINAIS (18/10/2026): a PEÇA EM LINHA escolhida pelo projetista num nó de dois tubos alinhados e de mesmo
     DN (no lugar da luva que a rede deduziria): a UNIÃO (água: desmontar sem cortar — bomba, aquecedor, hidrômetro) e o
     TÊ DE INSPEÇÃO (esgoto/pluvial/ventilação aparente: NBR 8160 4.2.5.5, "tubulação aparente … com inspeção"). Grava-se
     na PONTA do trecho (pecaIni em p1, pecaFim em p2); o nó vira a peça se algum ramo dele a pede. */
  var PECAS_LINHA = { uniao: ["agua"], te_inspecao: ["esgoto", "ventilacao", "pluvial"] };
  /* a peça em linha só nos materiais que a fabricam e, no tê de inspeção, só nos DN que EXISTEM (decisão da coordenação,
     18/10/2026, noite: o DN 50 não existe nas linhas Tigre/Amanco/Krona): a cota da ficha (js/biminstgeodados.js), uma
     composição SINAPI da peça ou uma referência de mercado — nada disso, o nó fica com a luva e o aviso */
  var PECAS_LINHA_MAT = { uniao: { pvc_soldavel: 1, cpvc: 1 }, te_inspecao: { pvc_esgoto: 1, pvc_serie_r: 1 } };
  function pecaLinhaExiste(tipo, material, dn) {
    if (!PECAS_LINHA_MAT[tipo] || !PECAS_LINHA_MAT[tipo][material]) return false;
    if (tipo !== "te_inspecao") return true;
    var GD = dep("HidGeoDados", "./biminstgeodados.js"), T = tabela(), k = txt(dn);
    if (GD && GD.conexoes && GD.conexoes[material] && GD.conexoes[material].te_inspecao && GD.conexoes[material].te_inspecao[k]) return true;
    if (T && T.chaves && Object.keys(T.chaves).some(function (c) { var p = c.split("|"); return p[0] === "te_inspecao" && p[1] === material && p[3] === k; })) return true;
    var PM = global.HidPrecoMercado || null;
    return !!(PM && PM.ref && material === "pvc_esgoto" && PM.ref("te_inspecao_esgoto|" + k));
  }
  function nomeConexao(tipo, material) {
    if (material === "eletrocalha") return { joelho90: "Curva 90° de eletrocalha", te: "Tê 90° de eletrocalha", reducao: "Redução de eletrocalha" }[tipo] || (NOMES_CONEXAO[tipo] || tipo) + " de eletrocalha";   /* P12 */
    if (/^elet_/.test(material || "") && (tipo === "joelho90" || tipo === "joelho45")) return tipo === "joelho90" ? "Curva 90°" : "Curva 135° (desvio de 45°)";
    return NOMES_CONEXAO[tipo] || tipo;
  }

  /* ================================================================ TRECHO */
  var TOL = 0.02;            /* 2 cm: pontas mais perto que isto são o MESMO nó */
  var FACE_TOL = 0.01;       /* 1 cm: ponto de ligação a menos disto da face de trás do aparelho é ponto de PAREDE */
  var TOL_CONECTOR = 0.03;   /* ponto de ligação de aparelho */

  function pt(p) { return p && isFinite(Number(p.x)) && isFinite(Number(p.y)) && isFinite(Number(p.z)) ? { x: Number(p.x), y: Number(p.y), z: Number(p.z) } : null; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

  /* a geometria de um trecho reto: comprimento REAL (no eixo, com a
     inclinação), comprimento em planta, desnível (p1 − p2: positivo = desce
     no sentido do traço) e a inclinação em % sobre o comprimento em planta */
  function geometria(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz), Lh = Math.sqrt(dx * dx + dz * dz);
    return { comprimento: L, comprimentoH: Lh, desnivel: p1.y - p2.y,
             inclinacao: Lh > 1e-6 ? (p1.y - p2.y) / Lh * 100 : null,
             vertical: L > 0 && Lh <= 0.05 * L };
  }

  function grupoDe(sistema) { return (SISTEMAS[sistema] || {}).grupo || ""; }
  function aplicacaoAuto(sistema, vertical) {
    var g = grupoDe(sistema);
    if (g === "agua") return vertical ? "prumada" : "ramal";
    if (g === "esgoto") return vertical ? "prumada" : "ramal";
    if (g === "ventilacao") return vertical ? "prumada" : "ramal_ventilacao";
    if (g === "pluvial") return vertical ? "prumada" : "ramal";
    if (g === "eletrica") return vertical ? "parede" : "laje";
    if (g === "ar") return "ar";
    if (g === "incendio") return vertical ? "prumada" : "ramal";
    if (g === "industrial") return vertical ? "ramal" : "linha";
    if (g === "frigorigeno" || g === "dreno") return vertical ? "parede" : "forro";
    if (g === "bandeja") return "bandeja";
    return "";
  }

  /* normaliza um trecho (op ou estado): devolve null se não serve */
  function normTrecho(o) {
    var p1 = pt(o.p1), p2 = pt(o.p2), s = SISTEMAS[o.sistema];
    if (!p1 || !p2 || !s) return null;
    var mat = s.materiais.indexOf(o.material) >= 0 ? o.material : s.material, M = MATERIAIS[mat];
    var g = geometria(p1, p2);
    if (!(g.comprimento > 0.005)) return null;
    var t = { id: o.id, sistema: o.sistema, material: mat, p1: p1, p2: p2 };
    if (M.secao === "retangular") {
      t.larg = num(o.larg, M.larg || 0.40); t.alt = num(o.alt, M.alt || 0.25);
      if (!(t.larg > 0.02) || !(t.alt > 0.02)) return null;
      t.dn = 0;
      if (M.bitolas) { t.bitola = M.bitolas.indexOf(txt(o.bitola)) >= 0 ? txt(o.bitola) : M.bitola; t.iso = M.isos.indexOf(txt(o.iso)) >= 0 ? txt(o.iso) : M.iso; }
      if (M.larguras) t.dn = Math.round(t.larg * 1000);   /* P12: eletrocalha — a largura em mm faz as vezes de DN */
    } else {
      var dn = num(o.dn, M.dn);
      if (!(dn > 0)) return null;
      if (M.tolDn) for (var iD = 0; iD < M.dns.length; iD++) if (Math.abs(M.dns[iD] - dn) <= M.tolDn) { dn = M.dns[iD]; break; }   /* C1b: 9,53 do catálogo = 9,52 da lista */
      t.dn = dn;                          /* DN fora da lista comercial NÃO é recusado: fica com aviso e pendente na SINAPI */
    }
    if (M.pns) t.pn = M.pns.indexOf(txt(o.pn)) >= 0 ? txt(o.pn) : M.pn;
    if (M.classes) t.classe = M.classes.indexOf(txt(o.classe)) >= 0 ? txt(o.classe) : M.classe;
    if (M.isos && !M.secao) t.iso = M.isos.indexOf(txt(o.iso)) >= 0 ? txt(o.iso) : M.iso;
    if (o.serie != null && o.serie !== "") t.serie = txt(o.serie);   /* fase 5: série do tubo industrial ("40", "80", "10S", "SDR11") */
    if (o.linha === "liquido" || o.linha === "succao") t.linha = o.linha;   /* C1b: qual das duas linhas frigorígenas */
    /* QUALIDADE VISUAL 2: a ponta que CONTINUA fora do que está modelado (a prumada que segue para o pavimento de
       cima/baixo, o ramal que sai para a rede pública) — declarada pelo projetista, não é ponta solta */
    if (o.continua === "p1" || o.continua === "p2" || o.continua === "ambos") t.continua = o.continua;
    /* QUALIDADE VISUAL 1 (juntas, 17/10/2026): como esta ponta do tubo encontra a PONTA de uma conexão de esgoto —
       "luva" (padrão: luva de verdade, no quantitativo), "bolsa" (a bolsa do próprio tubo) ou "invertida" (luva contra
       o fluxo: aviso com o motivo). Ausente = luva. juntaIni vale para p1, juntaFim para p2. */
    if (JUNTAS[o.juntaIni]) t.juntaIni = o.juntaIni;
    /* REDUÇÃO EXCÊNTRICA de esgoto (paridade, 18/10/2026): no trecho de JUSANTE (o DN maior), a geratriz reta — "superior"
       (padrão, ausente) ou "inferior" (o projetista girou com Espaço) */
    if (o.excentrica === "inferior" || o.excentrica === "superior") t.excentrica = o.excentrica;
    if (JUNTAS[o.juntaFim]) t.juntaFim = o.juntaFim;
    if (o.juntaMotivo) t.juntaMotivo = txt(o.juntaMotivo).slice(0, 200);
    /* PENDÊNCIAS FINAIS: a peça em linha na ponta (união / tê de inspeção), só no grupo de sistema que a usa */
    ["pecaIni", "pecaFim"].forEach(function (kp) { var pl = PECAS_LINHA[o[kp]]; if (pl && pl.indexOf(s.grupo) >= 0) t[kp] = o[kp]; });
    camposObra(o, t);   /* FLUIDEZ: comentários e fase da instância */
    if (s.grupo === "esgoto" && (o.redeParte === "coletor" || o.redeParte === "saida")) t.redeParte = o.redeParte;   /* o coletor e a saída da rede externa (js/hidrede.js): o HidES os trata como coletor mesmo sem tubo de queda */
    var apls = APLICACOES[s.grupo] || {};
    t.aplicacaoAuto = !(o.aplicacao && apls[o.aplicacao]);
    t.aplicacao = t.aplicacaoAuto ? aplicacaoAuto(o.sistema, g.vertical) : o.aplicacao;
    t.comprimento = r4(g.comprimento); t.comprimentoH = r4(g.comprimentoH); t.desnivel = r4(g.desnivel);
    t.inclinacao = g.inclinacao == null ? null : r4(g.inclinacao); t.vertical = g.vertical;
    t.diametro = M.secao === "retangular" ? 0 : t.dn / 1000;     /* m, para o desenho */
    t.avisos = [];
    if (o.dnPendente) t.avisos.push("DN pendente: o catálogo/dimensionamento não deu o diâmetro; usado o padrão do material (DN " + t.dn + "), conferir");   /* C1b */
    if (M.larguras && (M.larguras.indexOf(t.dn) < 0 || M.alturas.indexOf(Math.round(t.alt * 1000)) < 0)) t.avisos.push("eletrocalha " + Math.round(t.larg * 1000) + " × " + Math.round(t.alt * 1000) + " mm fora das medidas da SINAPI (largura " + M.larguras.join(", ") + " mm; altura " + M.alturas.join(", ") + " mm): pendente");
    if (!M.secao && M.dns.indexOf(t.dn) < 0) t.avisos.push("DN " + t.dn + " não é bitola comercial de " + M.nome + " (" + M.dns.join(", ") + ")");
    if (s.gravidade && !g.vertical) {
      var im = inclinacaoMinima(o.sistema, t.dn);
      if (t.inclinacao < -1e-6) t.avisos.push("o trecho SOBE no sentido do escoamento (" + fmtPct(-t.inclinacao) + "): esgoto e pluvial descem de p1 para p2");
      else if (abaixoDaMinima(o.sistema, t.dn, t.inclinacao)) t.avisos.push("inclinação " + fmtPct(t.inclinacao) + " abaixo da mínima de " + fmtPct(im) + " (" + (o.sistema === "esgoto" ? "NBR 8160" : (o.sistema === "dreno" ? "norma do dreno de condensado (HidNormas)" : "NBR 10844")) + ")");
    }
    if (t.aplicacao === "ramal_ventilacao") t.avisos.push("a SINAPI 06/2026 não tem composição de ramal de ventilação: fica pendente (troque a aplicação se for o caso)");
    return t;
  }
  function fmtPct(v) { return String(r2(v)).replace(".", ",") + "%"; }

  /* ------------------------------------------------------------- TRAÇAR
   * pontos (cliques em planta: {x, z}) → pontos 3D com a cota de cada um.
   * Sistema por gravidade: cada ponto desce inclinacao% do comprimento em
   * PLANTA desde o anterior; a última cota é a COTA DE SAÍDA. Os outros
   * ficam na cota inicial (horizontal). */
  function tracar(pontos, o) {
    o = o || {};
    var y = num(o.cotaInicial, 0), i = num(o.inclinacao, 0) / 100, out = [], trechos = [], Ltot = 0;
    arr(pontos).forEach(function (p, k) {
      var q = { x: num(p.x, 0), z: num(p.z, 0), y: y };
      if (k > 0) {
        var a = out[k - 1], Lh = Math.sqrt((q.x - a.x) * (q.x - a.x) + (q.z - a.z) * (q.z - a.z));
        y = a.y - i * Lh; q.y = r4(y);
        var L = Math.sqrt(Lh * Lh + (a.y - q.y) * (a.y - q.y));
        trechos.push({ p1: a, p2: q, comprimento: r4(L), comprimentoH: r4(Lh), desnivel: r4(a.y - q.y) });
        Ltot += L;
      } else q.y = r4(y);
      out.push(q);
    });
    return { pontos: out, trechos: trechos, cotaInicial: r4(num(o.cotaInicial, 0)), cotaSaida: out.length ? out[out.length - 1].y : r4(num(o.cotaInicial, 0)),
             desnivel: out.length ? r4(out[0].y - out[out.length - 1].y) : 0, comprimento: r4(Ltot) };
  }

  /* ------------------------------------------------------------- PEÇA */
  /* FLUIDEZ — PROPRIEDADES COMPLETAS (17/10/2026): comentários e fase da instância (tubo e peça), editados em
     Propriedades por instAlterar (um Ctrl+Z cada). Ausente/vazio = sem o campo: o estado das obras antigas fica igual. */
  function camposObra(o, alvo) {
    if (o.comentarios) alvo.comentarios = txt(o.comentarios).slice(0, 300);
    if (o.faseCriada) alvo.faseCriada = txt(o.faseCriada).slice(0, 40);
    if (o.faseDemolida && o.faseDemolida !== "Nenhum") alvo.faseDemolida = txt(o.faseDemolida).slice(0, 40);
  }
  function normPeca(o) {
    var P = PECAS[o.peca]; if (!P) return null;
    var x = num(o.x, NaN), y = num(o.y, NaN), z = num(o.z, NaN);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
    var sis = P.sistemas.indexOf(o.sistema) >= 0 ? o.sistema : P.sistemas[0];
    var mat = P.materiais ? (P.materiais.indexOf(o.material) >= 0 ? o.material : P.material) : P.material;
    var dn = P.dns.indexOf(txt(o.dn)) >= 0 ? txt(o.dn) : P.dn;
    var k = { id: o.id, peca: o.peca, sistema: sis, material: mat, dn: dn, x: x, y: y, z: z, rotY: num(o.rotY, 0) };
    if (P.sistemas[0] === "eletrica") {
      k.alturaPiso = num(o.alturaPiso, null);
      k.aplicacao = o.peca === "caixa_octogonal" ? "laje" : alturaCaixa(k.alturaPiso);
    } else k.aplicacao = sis;                         /* ralo/caixa sifonada: a SINAPI separa esgoto × pluvial */
    /* o cilindro de captura (ver PECAS): do topo da peça até a saída */
    var R = P.captura, prof = P.forma === "cil" ? (P.prof || 0) : 0.06;
    if (P.profVariavel && isFinite(num(o.prof, NaN)) && num(o.prof, 0) > 0) prof = num(o.prof, prof);   /* caixa de inspeção: a profundidade é da instância */
    if (P.profVariavel) k.prof = r4(prof);
    if (P.tipos) {   /* a caixa de inspeção: o tipo (alvenaria/pré-moldada/dispositivo de PVC) e a tampa; o tamanho segue o tipo */
      k.tipoCaixa = P.tipos[o.tipoCaixa] ? o.tipoCaixa : "alvenaria";
      k.tampa = k.tipoCaixa === "pvc300" ? "pvc" : (o.tampa === "ferro" ? "ferro" : "concreto");
      k.dn = k.tipoCaixa === "pvc300" ? "300" : "600";
    }
    camposObra(o, k);   /* FLUIDEZ: comentários e fase da instância */
    k.hub = { x: x, z: z, yTop: y + (P.forma === "caixa" ? 0.06 : 0.02), yBot: y - prof - 0.02, r: R };
    return k;
  }

  /* ===================================================== APLICAR OPS
   * O BimEdit chama aplicarOp(estado, op) para toda op que ele não conhece
   * (e para mover/apagar de id que não é dele). Devolve true se tratou. */
  function novoEstado() { return { trechos: {}, ordemT: [], pecas: {}, ordemP: [], acessorios: {}, ordemAc: [], nomesSis: {} }; }
  function aplicarOp(est, o) {
    if (!est || !o || !o.op) return false;
    if (!est.acessorios) { est.acessorios = {}; est.ordemAc = []; est.nomesSis = {}; }
    /* P12: acessório no tubo (divide o trecho) e o nome do sistema */
    if (o.op === "acessorio") return aplicarAcessorio(est, o);
    if (o.op === "instSistema" && o.id != null) {
      if (!est.trechos[o.id]) return false;
      var nm = txt(o.nome).trim().slice(0, 60);
      if (nm) est.nomesSis[o.id] = nm; else delete est.nomesSis[o.id];
      return true;
    }
    if (est.acessorios[o.id] && o.id != null) {
      if (o.op === "instAlterar") {
        var ac0 = copia(est.acessorios[o.id]);
        if (o.tipoId !== undefined) ac0.tipoId = txt(o.tipoId);
        if (o.giro !== undefined) { var gA = ((num(o.giro, 0) % 360) + 360) % 360; if (gA) ac0.giro = gA; else delete ac0.giro; }   /* COLOCAÇÃO (js/biminstcolocar.js): Espaço gira o volante em torno do tubo */
        if (!normAcessorio(ac0)) return false;
        est.acessorios[o.id] = ac0; return true;
      }
      if (o.op === "apagar") return apagarAcessorio(est, o.id);
      return false;   /* mover um acessório: tire e ponha de novo (ele vive no eixo do tubo) */
    }
    if (o.op === "trecho" && o.id != null) {
      var t = normTrecho(o); if (!t) return false;
      if (est.pecas[o.id]) return false;
      est.trechos[o.id] = copia(o);
      if (est.ordemT.indexOf(o.id) < 0) est.ordemT.push(o.id);
      return true;
    }
    if (o.op === "peca" && o.id != null) {
      if (!normPeca(o) || est.trechos[o.id]) return false;
      est.pecas[o.id] = copia(o);
      if (est.ordemP.indexOf(o.id) < 0) est.ordemP.push(o.id);
      return true;
    }
    if (o.op === "instAlterar" && o.id != null) {
      var alvo = est.trechos[o.id] || est.pecas[o.id]; if (!alvo) return false;
      var novo = copia(alvo);
      ["sistema", "material", "dn", "aplicacao", "pn", "classe", "iso", "larg", "alt", "bitola", "serie", "peca", "alturaPiso", "rotY", "continua", "juntaIni", "juntaFim", "juntaMotivo", "excentrica", "comentarios", "faseCriada", "faseDemolida", "pecaIni", "pecaFim", "tipoCaixa", "tampa", "prof"].forEach(function (k) { if (o[k] !== undefined) novo[k] = o[k]; });
      if (o.continua === "") delete novo.continua;
      if (o.pecaIni === "") delete novo.pecaIni;
      if (o.pecaFim === "") delete novo.pecaFim;
      if (o.aplicacao === "") delete novo.aplicacao;     /* volta para a automática */
      if (est.trechos[o.id]) { if (!normTrecho(novo)) return false; est.trechos[o.id] = novo; }
      else { if (!normPeca(novo)) return false; est.pecas[o.id] = novo; }
      return true;
    }
    if (o.op === "mover" && o.id != null) {
      var mx = num(o.cx, NaN), mz = num(o.cz, NaN); if (!isFinite(mx) || !isFinite(mz)) return false;
      if (est.trechos[o.id]) {
        var tr = est.trechos[o.id], cxm = (tr.p1.x + tr.p2.x) / 2, czm = (tr.p1.z + tr.p2.z) / 2, dx = mx - cxm, dz = mz - czm;
        tr.p1 = { x: r4(tr.p1.x + dx), y: tr.p1.y, z: r4(tr.p1.z + dz) }; tr.p2 = { x: r4(tr.p2.x + dx), y: tr.p2.y, z: r4(tr.p2.z + dz) };
        return true;
      }
      if (est.pecas[o.id]) { est.pecas[o.id].x = r4(mx); est.pecas[o.id].z = r4(mz); return true; }
      return false;
    }
    if (o.op === "apagar" && o.id != null) {
      if (est.trechos[o.id]) { delete est.trechos[o.id]; est.ordemT.splice(est.ordemT.indexOf(o.id), 1); return true; }
      if (est.pecas[o.id]) { delete est.pecas[o.id]; est.ordemP.splice(est.ordemP.indexOf(o.id), 1); return true; }
      return false;
    }
    return false;
  }
  /* o estado fechado que vai no `instalacoes` do BimEdit.aplicar */
  function fechar(est) {
    if (!est) return { trechos: [], pecas: [] };
    var out = {
      trechos: est.ordemT.map(function (id) { return normTrecho(est.trechos[id]); }).filter(Boolean),
      pecas: est.ordemP.map(function (id) { return normPeca(est.pecas[id]); }).filter(Boolean)
    };
    /* P12: só quando há — o estado das obras sem acessório fica byte a byte o de antes */
    var acs = arr(est.ordemAc).map(function (id) { return normAcessorio(est.acessorios[id]); }).filter(Boolean);
    if (acs.length) out.acessorios = acs;
    if (est.nomesSis && Object.keys(est.nomesSis).length) out.nomesSistema = copia(est.nomesSis);
    return out;
  }
  /* sanear: shape válido de uma op de instalação (storage corrompido não derruba o replay) */
  function opValida(o) {
    if (!o) return false;
    function fin(v) { return typeof v === "number" && isFinite(v); }
    function p3(p) { return !!p && fin(p.x) && fin(p.y) && fin(p.z); }
    if (o.op === "trecho") return o.id != null && !!SISTEMAS[o.sistema] && p3(o.p1) && p3(o.p2) && (o.dn == null || fin(o.dn));
    if (o.op === "peca") return o.id != null && !!PECAS[o.peca] && fin(o.x) && fin(o.y) && fin(o.z);
    if (o.op === "instAlterar") return o.id != null;
    /* P12 */
    if (o.op === "acessorio") return o.id != null && typeof o.famId === "string" && !!ACESSORIO_DA_FAM[o.famId] && fin(o.x) && fin(o.y) && fin(o.z) &&
      (o.trecho == null ? true : o.novoId != null) && (o.comprimento == null || fin(o.comprimento)) && (o.giro == null || fin(o.giro));
    if (o.op === "instSistema") return o.id != null && typeof o.nome === "string";
    return false;
  }

  /* ============================================ CONECTORES DE APARELHO
   * Família com `conectores: [{ id, sistema, dn, x, y, z, nome }]` — o
   * js/familia.js avalia (x/y/z/dn podem ser FÓRMULA dos parâmetros, como os
   * sólidos) e devolve em `avaliado.conectores`, no sistema LOCAL. Aqui vão ao
   * mundo pelo mesmo giro do viewer (three: x' = x·cosθ + z·sinθ;
   * z' = −x·sinθ + z·cosθ) — o teste confere contra a matriz do three. */
  function conectoresDe(av, inst) {
    var out = [];
    if (!av) return out;
    var rot = num(inst && inst.rotY, 0), c = Math.cos(rot), s = Math.sin(rot), cx = av.caixa;
    /* QUALIDADE VISUAL 2 (17/10/2026): ponto NA FACE DE TRÁS do aparelho (convenção do js/familia.js:
       Z local para fora da parede) = ponto de PAREDE — `parede` é a normal, no mundo, que entra na
       parede. O traçado chega nele por dentro da parede (desce/sobe embutido e sai por um toco
       perpendicular); sem isto a descida corria na face e passava por dentro da coluna do lavatório
       e da caixa acoplada. Ponto fora da face (saída de piso da bacia, válvula da pia) não ganha nada. */
    var temFace = cx && isFinite(cx.z0) && isFinite(cx.z1) && cx.z1 - cx.z0 > FACE_TOL * 2;
    /* peça EM LINHA (luva, registro, conexão importada): tem ponto também na face da FRENTE — não é de parede */
    if (temFace && arr(av.conectores).some(function (k) { return k && Math.abs(num(k.z, 0) - cx.z1) <= FACE_TOL; })) temFace = false;
    arr(av.conectores).forEach(function (k, i) {
      if (!k || !SISTEMAS[k.sistema]) return;
      var lx = num(k.x, 0), ly = num(k.y, 0), lz = num(k.z, 0);
      var o = { id: (inst && inst.id != null ? inst.id : "") + ":" + (k.id || ("c" + i)), famInst: inst ? inst.id : null, nome: txt(k.nome) || SISTEMAS[k.sistema].nome,
                 sistema: k.sistema, dn: num(k.dn, 0),
                 x: r4(num(inst && inst.x, 0) + lx * c + lz * s), y: r4(num(inst && inst.y, 0) + ly), z: r4(num(inst && inst.z, 0) - lx * s + lz * c) };
      /* d = quanto o ponto está À FRENTE da face de trás do corpo (a louça encosta na parede pelo corpo): o eixo embutido
         se mede da face da parede, e todos os pontos da mesma parede caem na mesma linha */
      if (temFace && Math.abs(lz - cx.z0) <= FACE_TOL) o.parede = { x: r4(-s), z: r4(-c), d: r4(Math.max(0, lz - cx.z0)) };
      out.push(o);
    });
    return out;
  }
  /* QUALIDADE VISUAL 2: o VOLUME de cada família colocada (a caixa envolvente do tipo, girada com a
     instância) — o traçado nunca passa por dentro de uma louça ou equipamento. Formato da caixa girada
     do js/hidrota.js: centro (cx, cz), eixo u = X local no mundo, meias medidas hl (X) e hw (Z), cotas
     y0..y1. Família que fica ABAIXO do piso (ralo, caixa sifonada, caixa de gordura enterrada) não entra:
     o tubo chega nela por dentro, é a função dela. */
  function volumesFamilias(estado, avaliarFam) {
    var out = [];
    arr(estado && estado.familias).forEach(function (fi) {
      var av = typeof avaliarFam === "function" ? avaliarFam(fi.famId, fi.tipoId, fi.inst) : null, b = av && av.caixa;
      if (!b || ![b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].every(isFinite) || b.y1 <= TOL) return;   /* tudo abaixo da origem (só a tampa/grelha no piso) = enterrada */
      var rot = num(fi.rotY, 0), c = Math.cos(rot), s = Math.sin(rot), mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
      out.push({ id: fi.id, famId: fi.famId, cx: r4(num(fi.x, 0) + mx * c + mz * s), cz: r4(num(fi.z, 0) - mx * s + mz * c), ux: c, uz: -s,
                 hl: r4((b.x1 - b.x0) / 2), hw: r4((b.z1 - b.z0) / 2), y0: r4(num(fi.y, 0) + b.y0), y1: r4(num(fi.y, 0) + b.y1) });
    });
    return out;
  }
  /* o segmento p-q (3D) entra no volume v (caixa girada acima)? `encolher` tira uma casca das faces (o
     tubo que só ENCOSTA na face, como o toco que chega no ponto da parede, não é travessia) */
  function cortaVolume(v, p, q, encolher) {
    var e = num(encolher, 0), t0 = 0, t1 = 1;
    function loc(a) { var dx = a.x - v.cx, dz = a.z - v.cz; return { u: dx * v.ux + dz * v.uz, w: -dx * v.uz + dz * v.ux, y: a.y }; }
    var A = loc(p), Bq = loc(q), lim = [["u", -v.hl + e, v.hl - e], ["w", -v.hw + e, v.hw - e], ["y", v.y0 + e, v.y1 - e]];
    for (var i = 0; i < 3; i++) {
      var k = lim[i][0], lo = lim[i][1], hi = lim[i][2], a = A[k], d = Bq[k] - a;
      if (!(hi > lo)) return false;
      if (Math.abs(d) < 1e-12) { if (a <= lo || a >= hi) return false; continue; }
      var ta = (lo - a) / d, tb = (hi - a) / d; if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 >= t1) return false;
    }
    return true;
  }
  /* o TUBO (eixo p-q, raio r) entra no volume v? A ponta que chega num ponto de ligação DAQUELE aparelho
     (`pontos`) recua o raio + a casca: o toco que encosta no ponto da face não é travessia; o resto do tubo
     conta com o raio (a vertical colada na face, metade dentro da coluna do lavatório, É travessia). */
  function tuboEmVolume(v, p, q, r, pontos, casca) {
    var e = num(casca, 0.002), rr = Math.max(0, num(r, 0)), a = { x: p.x, y: p.y, z: p.z }, b = { x: q.x, y: q.y, z: q.z };
    var L = dist(a, b); if (!(L > 1e-9)) return false;
    function perto(x) { return arr(pontos).some(function (k) { return dist(k, x) <= TOL_CONECTOR; }); }
    var u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L, z: (b.z - a.z) / L }, ra = perto(a) ? rr + e : 0, rb = perto(b) ? rr + e : 0;
    if (ra + rb >= L) return false;
    var a2 = { x: a.x + u.x * ra, y: a.y + u.y * ra, z: a.z + u.z * ra }, b2 = { x: b.x - u.x * rb, y: b.y - u.y * rb, z: b.z - u.z * rb };
    return cortaVolume(v, a2, b2, e - rr);
  }
  /* ====================================================== TROCAR O DN (Propriedades, em um clique)
   * Pedido do Rogério (17/10/2026): "clico na conexão, mudo para 100 e as conexões embutidas já trocam". A conexão é
   * DEDUZIDA da geometria e do DN dos trechos (rede): trocar o DN de um TRECHO já troca as conexões das pontas (e a
   * redução entra sozinha onde o vizinho ficou diferente; no ponto da louça o DN do aparelho fica e entra a redução).
   * Trocar o DN de uma CONEXÃO = trocar os trechos ligados nela (cada um até a próxima conexão). Tudo numa lista de
   * ops que vai num lote só (um Ctrl+Z desfaz). Regras:
   *   · DN fora da lista comercial do material de algum trecho → NÃO aplica, diz qual e a lista;
   *   · esgoto/pluvial: a inclinação mínima é a do DN NOVO (a maior entre a regra do modelador e a tabela do
   *     HidNormas). Trecho que ficou abaixo dela tem a ponta de JUSANTE abaixada e o que vem depois desce junto (a
   *     jusante inteira, mantendo as inclinações dela; o ramal que chega no nó só ganha queda) — com aviso de quanto.
   * alvos = ids de trechos e/ou de conexões (os "cx…" da rede atual). Devolve { ok, erro, ops, avisos, trechos }. */
  function declMinDn(sistema, dn) {
    var i = inclinacaoMinima(sistema, dn);
    if (sistema !== "esgoto") return i;
    var N = dep("HidNormas", "./hidnormas.js");
    try {
      var t = N && N.tabela ? N.tabela("es.declividade_minima") : null;
      var l = t && t.linhas ? t.linhas.filter(function (x) { return x.dn_max === "*" || Number(x.dn_max) >= dn; })
        .sort(function (a, b) { return (a.dn_max === "*" ? Infinity : Number(a.dn_max)) - (b.dn_max === "*" ? Infinity : Number(b.dn_max)); })[0] : null;
      if (l && isFinite(Number(l.declividade_pct))) i = Math.max(i, Number(l.declividade_pct));
    } catch (e) {}
    return i;
  }
  function opDoTrecho(t) {
    var o = { op: "trecho", id: t.id, sistema: t.sistema, material: t.material, dn: t.dn, p1: { x: t.p1.x, y: t.p1.y, z: t.p1.z }, p2: { x: t.p2.x, y: t.p2.y, z: t.p2.z } };
    ["pn", "classe", "iso", "serie", "linha", "continua", "larg", "alt", "bitola", "pecaIni", "pecaFim"].forEach(function (k) { if (t[k] != null && t[k] !== "") o[k] = t[k]; });
    if (!t.aplicacaoAuto && t.aplicacao) o.aplicacao = t.aplicacao;
    return o;
  }
  /* DESLOCAMENTO INICIAL/FINAL (Propriedades, 17/10/2026): a cota de UMA ponta do trecho muda; as pontas dos outros
     trechos do mesmo sistema que estavam NAQUELE nó vão junto (a ligação não se desfaz). y = cota absoluta. */
  function moverCota(estado, id, ponta, y) {
    var ins = (estado && estado.instalacoes) || { trechos: [] }, t0 = arr(ins.trechos).filter(function (t) { return t.id === id; })[0];
    if (!t0 || (ponta !== "p1" && ponta !== "p2") || !isFinite(Number(y))) return { ok: false, erro: "Trecho ou cota inválida.", ops: [] };
    var P = t0[ponta], ops = [];
    arr(ins.trechos).forEach(function (t) {
      if (t.sistema !== t0.sistema) return;
      var o = null;
      ["p1", "p2"].forEach(function (k) { if (dist(t[k], P) <= TOL) { o = o || opDoTrecho(t); o[k] = { x: t[k].x, y: r4(Number(y)), z: t[k].z }; } });
      if (o) ops.push(o);
    });
    var ruins = ops.filter(function (o) { return !normTrecho(o); });
    if (ruins.length) return { ok: false, erro: "A cota nova deixa o trecho " + ruins[0].id + " sem comprimento.", ops: [] };
    return { ok: true, ops: ops };
  }
  /* DIVIDIR o tubo no ponto P (a ligação que chega no MEIO dele): dois trechos com o nó em P — a conexão (tê ou junção)
     fica no nó. As pontas que "continuam fora do modelo" ficam com o pedaço certo. */
  function dividirTrecho(estado, id, P) {
    var t = arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (x) { return x.id === id; })[0]; if (!t || !P) return [];
    var L2 = Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2); if (!(L2 > 0)) return [];
    var s = ((P.x - t.p1.x) * (t.p2.x - t.p1.x) + (P.y - t.p1.y) * (t.p2.y - t.p1.y) + (P.z - t.p1.z) * (t.p2.z - t.p1.z)) / L2;
    if (!(s > 0.001 && s < 0.999)) return [];
    var J = { x: r4(t.p1.x + (t.p2.x - t.p1.x) * s), y: r4(t.p1.y + (t.p2.y - t.p1.y) * s), z: r4(t.p1.z + (t.p2.z - t.p1.z) * s) };
    var o1 = opDoTrecho(t), o2 = opDoTrecho(t); o1.p2 = J; o2.p1 = J; o2.id = id + "b";
    delete o1.continua; delete o2.continua;
    delete o1.pecaFim; delete o2.pecaIni;   /* a peça em linha fica na ponta de origem (o nó novo do meio é outro) */
    if (t.continua === "p1" || t.continua === "ambos") o1.continua = "p1";
    if (t.continua === "p2" || t.continua === "ambos") o2.continua = "p2";
    return [o1, o2];
  }
  function trocarDn(estado, avaliarFam, alvos, dnNovo) {
    var dn = num(dnNovo, NaN);
    if (!(dn > 0)) return { ok: false, erro: "DN inválido.", ops: [], avisos: [] };
    var ins = (estado && estado.instalacoes) || { trechos: [] }, porId = {}, ids = [], avisos = [];
    arr(ins.trechos).forEach(function (t) { porId[t.id] = t; });
    var R = null;
    arr(alvos).forEach(function (a) {
      a = txt(a).replace(/^edit:/, "");
      if (porId[a]) { if (ids.indexOf(a) < 0) ids.push(a); return; }
      if (!R) R = rede(estado, avaliarFam);
      var c = R.conexoes.filter(function (x) { return x.id === a; })[0];
      if (c) arr(c.ramos).forEach(function (id) { if (porId[id] && ids.indexOf(id) < 0) ids.push(id); });
    });
    if (!ids.length) return { ok: false, erro: "Nada para trocar: selecione um tubo ou uma conexão.", ops: [], avisos: [] };
    /* o DN tem de existir no material de TODOS os trechos */
    for (var i = 0; i < ids.length; i++) {
      var t = porId[ids[i]], M = MATERIAIS[t.material];
      if (!M || M.secao) return { ok: false, erro: "O trecho " + t.id + " não tem diâmetro (seção retangular).", ops: [], avisos: [] };
      if (arr(M.dns).length && M.dns.indexOf(dn) < 0) return { ok: false, erro: "DN " + dn + " não existe em " + M.nome + " (" + M.dns.join(", ") + "): nada foi trocado.", ops: [], avisos: [] };
    }
    /* geometria de trabalho: cópia dos trechos (o abaixamento da jusante mexe nos pontos) */
    var G = {}; arr(ins.trechos).forEach(function (t) { G[t.id] = { t: t, p1: { x: t.p1.x, y: t.p1.y, z: t.p1.z }, p2: { x: t.p2.x, y: t.p2.y, z: t.p2.z }, mudou: false, dn: t.dn }; });
    ids.forEach(function (id) { G[id].dn = dn; });
    function perto(a, b) { return dist(a, b) <= TOL; }
    function horiz(g) { return Math.sqrt(Math.pow(g.p2.x - g.p1.x, 2) + Math.pow(g.p2.z - g.p1.z, 2)) > TOL; }
    /* abaixa o nó P de `d` e a jusante inteira dele (mesmo sistema) */
    function abaixar(P, d, sis, visto, pular) {
      var k = r4(P.x) + "," + r4(P.y) + "," + r4(P.z); if (visto[k]) return; visto[k] = 1;
      var P0 = { x: P.x, y: P.y, z: P.z };
      Object.keys(G).forEach(function (id) {
        var g = G[id]; if (g.t.sistema !== sis || id === pular) return;
        if (!horiz(g)) {
          /* vertical: o nó no MEIO dela (junção no tubo de queda) só escorrega; a ponta de cima (a descida) encurta */
          var cima = g.p1.y >= g.p2.y ? "p1" : "p2";
          if (perto(g[cima], P0)) { g[cima].y = r4(g[cima].y - d); g.mudou = true; }
          return;
        }
        if (perto(g.p1, P0)) {   /* a jusante: desce inteira */
          g.p1.y = r4(g.p1.y - d); var p2 = { x: g.p2.x, y: g.p2.y, z: g.p2.z }; g.p2.y = r4(g.p2.y - d); g.mudou = true;
          abaixar(p2, d, sis, visto, null);
        } else if (perto(g.p2, P0)) { g.p2.y = r4(g.p2.y - d); g.mudou = true; }   /* o ramal que CHEGA no nó: só ganha queda */
      });
    }
    ids.forEach(function (id) {
      var g = G[id], t = g.t, S = SISTEMAS[t.sistema]; if (!S || !S.gravidade || !horiz(g)) return;
      var L = Math.sqrt(Math.pow(g.p2.x - g.p1.x, 2) + Math.pow(g.p2.z - g.p1.z, 2)), imin = declMinDn(t.sistema, dn), queda = g.p1.y - g.p2.y, precisa = imin / 100 * L;
      if (queda >= precisa - 1e-6) return;
      var d = Math.ceil((precisa - queda) * 10000 - 1e-6) / 10000, P2 = { x: g.p2.x, y: g.p2.y, z: g.p2.z };   /* 0,1 mm, para cima */
      abaixar(P2, d, t.sistema, {}, id);
      g.p2.y = r4(g.p2.y - d); g.mudou = true;
      avisos.push("trecho " + t.id + ": a inclinação mínima do DN " + dn + " é " + String(imin).replace(".", ",") + "% — a ponta de jusante e o que vem depois desceram " + String(Math.round(d * 1000) / 10).replace(".", ",") + " cm");
    });
    var ops = [];
    Object.keys(G).forEach(function (id) {
      var g = G[id];
      if (g.mudou) { var o = opDoTrecho(g.t); o.dn = g.dn; o.p1 = g.p1; o.p2 = g.p2; ops.push(o); }
      else if (ids.indexOf(id) >= 0 && g.t.dn !== dn) ops.push({ op: "instAlterar", id: id, dn: dn });
    });
    if (!ops.length) avisos.push("o DN já era " + dn + ": nada a trocar");
    return { ok: true, ops: ops, avisos: avisos, trechos: ids };
  }
  /* todos os conectores das famílias colocadas (avaliarFam = o mesmo do viewer) */
  function conectoresDoEstado(estado, avaliarFam) {
    var out = [];
    arr(estado && estado.familias).forEach(function (fi) {
      var av = typeof avaliarFam === "function" ? avaliarFam(fi.famId, fi.tipoId, fi.inst) : null;
      if (!av || !arr(av.conectores).length) return;
      conectoresDe(av, fi).forEach(function (k) { out.push(k); });
    });
    return out;
  }

  /* ========================================================== A REDE
   * Acha os NÓS (pontas que se tocam, ponta no meio de outro trecho, ponto
   * de aparelho, peça) e decide a CONEXÃO de cada um pela geometria e pelo
   * DN. Nada aqui é gravado: é deduzido a cada replay.
   * ---------------------------------------------------------------- */
  function unit(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; return { x: dx / L, y: dy / L, z: dz / L }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function grau(c) { return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; }
  /* desvio entre dois ramos que SAEM do nó: 0° = alinhados (seguem reto) */
  function desvio(d1, d2) { return grau(-dot(d1, d2)); }
  /* distância de q ao INTERIOR do segmento a-b (null se a projeção cai nas pontas) */
  function noInterior(q, a, b) {
    var ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L2 = dot(ab, ab); if (!(L2 > 0)) return null;
    var t = ((q.x - a.x) * ab.x + (q.y - a.y) * ab.y + (q.z - a.z) * ab.z) / L2, L = Math.sqrt(L2);
    if (t * L <= TOL || (1 - t) * L <= TOL) return null;
    var p = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
    return dist(p, q);
  }
  function dentroHub(q, h) {
    var dx = q.x - h.x, dz = q.z - h.z;
    return Math.sqrt(dx * dx + dz * dz) <= h.r + 1e-9 && q.y <= h.yTop + 1e-9 && q.y >= h.yBot - 1e-9;
  }

  /* decide a conexão de UM nó de UM sistema. ramos = [{trecho, dir, dn, material, aplicacao, passante}] */
  function decidir(ramos, sistema, conector, avisos) {
    var out = [];
    var mat = ramos[0].material, M = MATERIAIS[mat] || {};
    var mats = {}; ramos.forEach(function (r) { mats[r.material] = 1; });
    if (Object.keys(mats).length > 1) avisos.push("transição de material no nó (" + Object.keys(mats).map(function (k) { return MATERIAIS[k] ? MATERIAIS[k].nome : k; }).join(" × ") + "): a peça de transição não é deduzida — orce à parte");
    /* a aplicação da conexão = a do ramo de MAIOR DN (empate: o primeiro) */
    var maior = ramos.slice().sort(function (a, b) { return b.dn - a.dn; })[0];
    function cx(tipo, dn, dn2, extra) {
      var o = { tipo: tipo, sistema: sistema, material: maior.material, aplicacao: maior.aplicacao, dn: dn, dn2: dn2 || 0 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      out.push(o);
    }
    if (M.larguras) return decidirBandeja(ramos, sistema, conector, avisos, out, cx);   /* P12: eletrocalha */
    var flex = !!M.flexivel;
    var n = ramos.length;
    if (n === 1) {
      if (conector) {
        if (!flex && conector.dn > 0 && Math.abs(conector.dn - ramos[0].dn) > 0.5) {
          /* aparelho com DN diferente do tubo: a redução entra (o maior x o menor) */
          cx("reducao", Math.max(conector.dn, ramos[0].dn), Math.min(conector.dn, ramos[0].dn));
        }
      }
      return out;
    }
    if (flex) {
      if (n >= 3) avisos.push("derivação de " + (M.nome || "tubo flexível") + " sem caixa: ponha uma caixa de passagem no ponto");
      return out;                                                  /* a curva é o próprio tubo */
    }
    if (n === 2) {
      var a = ramos[0], b = ramos[1], dv = desvio(a.dir, b.dir), dnM = Math.max(a.dn, b.dn), dnm = Math.min(a.dn, b.dn);
      if (dv < 10) {
        /* PENDÊNCIAS FINAIS: a peça em linha pedida pelo projetista (união / tê de inspeção) no lugar da luva */
        var pl0 = [a.pecaLinha, b.pecaLinha].filter(function (x) { return PECAS_LINHA[x] && PECAS_LINHA[x].indexOf(grupoDe(sistema)) >= 0; })[0];
        if (pl0 && !pecaLinhaExiste(pl0, mat, dnM)) { avisos.push(NOMES_CONEXAO[pl0] + " DN " + dnM + " de " + (M.nome || mat) + " não existe no catálogo dos fabricantes: ficou a luva (escolha outro DN ou outra peça)"); pl0 = null; }
        if (pl0 && Math.abs(a.dn - b.dn) < 0.5) { cx(pl0, dnM); return out; }
        if (pl0) avisos.push(NOMES_CONEXAO[pl0] + " pedida num nó com DN " + dnm + " × " + dnM + ": a peça é de um DN só — ficou a redução (confira)");
        if (Math.abs(a.dn - b.dn) < 0.5) cx("luva", dnM); else cx("reducao", dnM, dnm);
        return out;
      }
      var tipo;
      if (dv <= 67.5) tipo = "joelho45"; else tipo = "joelho90";
      if (!((dv >= 35 && dv <= 55) || (dv >= 80 && dv <= 100))) avisos.push("mudança de direção de " + Math.round(dv) + "°: fora de 45°/90° — conexão de " + (tipo === "joelho45" ? "45°" : "90°") + " assumida, confira o traçado");
      if (tipo === "joelho90" && (sistema === "esgoto" || sistema === "pluvial") && !a.vertical && !b.vertical)
        avisos.push("joelho de 90° no trecho horizontal de " + SISTEMAS[sistema].nome.toLowerCase() + ": a NBR 8160 pede, no horizontal, peças de ângulo central até 45° — confira");
      cx(tipo, dnM);
      if (Math.abs(a.dn - b.dn) >= 0.5) cx("reducao", dnM, dnm);
      return out;
    }
    if (n === 3) {
      /* o par MAIS alinhado é a linha principal; o terceiro é a derivação */
      var par = null, best = 999;
      for (var i = 0; i < 3; i++) for (var j = i + 1; j < 3; j++) { var d = desvio(ramos[i].dir, ramos[j].dir); if (d < best) { best = d; par = [i, j]; } }
      var ia = par[0], ib = par[1], ic = 3 - ia - ib, ra = ramos[ia], rb = ramos[ib], rc = ramos[ic];
      if (best > 15) avisos.push("nó de três trechos sem dois alinhados (o mais próximo desvia " + Math.round(best) + "°): tê assumido, confira o traçado");
      var dnRun = Math.max(ra.dn, rb.dn);
      if (Math.abs(ra.dn - rb.dn) >= 0.5) cx("reducao", dnRun, Math.min(ra.dn, rb.dn));
      /* ângulo da derivação com a linha principal: ~90° = tê; ~45° = junção (esgoto/pluvial/ventilação) */
      var cosb = Math.abs(dot(rc.dir, ra.dir)), beta = grau(cosb);   /* 0..90 */
      var gravidade = sistema === "esgoto" || sistema === "pluvial" || sistema === "ventilacao";
      var ehJuncao = gravidade && beta >= 25 && beta <= 65;
      if (!gravidade && beta < 70) avisos.push("derivação a " + Math.round(beta) + "° da linha: na água e na elétrica o tê é de 90° — confira");
      var dnB = rc.dn;
      if (dnB > dnRun + 0.5) { cx(ehJuncao ? "juncao" : "te", dnB); cx("reducao", dnB, dnRun); }
      else if (dnB < dnRun - 0.5) cx(ehJuncao ? "juncao" : "te_reducao", dnRun, dnB);
      else cx(ehJuncao ? "juncao" : "te", dnRun);
      return out;
    }
    if (n === 4) {
      avisos.push("nó com quatro trechos (cruzeta): a SINAPI 06/2026 não tem cruzeta nesta tabela — desdobre em dois tês ou orce à parte");
      cx("cruzeta", maior.dn);
      return out;
    }
    avisos.push("nó com " + n + " trechos: desdobre a ligação — nenhuma conexão foi deduzida");
    return out;
  }

  function rede(estado, avaliarFam) {
    var inst = (estado && estado.instalacoes) || { trechos: [], pecas: [] };
    var trechos = arr(inst.trechos), pecas = arr(inst.pecas), acessorios = arr(inst.acessorios);
    var conectores = conectoresDoEstado(estado, avaliarFam);
    /* P12: as duas faces de cada acessório (registro, válvula) são pontos de ligação do tubo */
    acessorios.forEach(function (a) { a.conectores.forEach(function (k) { conectores.push(k); }); });
    /* 1) as pontas */
    var pontas = [];
    trechos.forEach(function (t) {
      pontas.push({ t: t, lado: 0, p: t.p1, dir: unit(t.p1, t.p2) });
      pontas.push({ t: t, lado: 1, p: t.p2, dir: unit(t.p2, t.p1) });
    });
    /* 2) agrupa as pontas que se tocam (varredura por x: o(n log n) no caso comum) */
    var ord = pontas.map(function (_, i) { return i; }).sort(function (a, b) { return pontas[a].p.x - pontas[b].p.x; });
    var grupo = new Array(pontas.length), nos = [];
    ord.forEach(function (i, k) {
      if (grupo[i] != null) return;
      var g = nos.length; nos.push({ pontas: [i] }); grupo[i] = g;
      for (var m = k + 1; m < ord.length; m++) {
        var j = ord[m]; if (pontas[j].p.x - pontas[i].p.x > TOL) break;
        if (grupo[j] == null && dist(pontas[i].p, pontas[j].p) <= TOL) { grupo[j] = g; nos[g].pontas.push(j); }
      }
    });
    var conexoes = [], ligacoes = [], livres = [], continuacoes = [], avisosRede = [], usadosCon = {}, ligPeca = {}, nosRamos = [], juntas = [], luvasQto = [];
    var porIdT = {}; trechos.forEach(function (t) { porIdT[t.id] = t; });
    nos.forEach(function (no, k) {
      var p0 = pontas[no.pontas[0]].p, P = { x: 0, y: 0, z: 0 };
      no.pontas.forEach(function (i) { P.x += pontas[i].p.x; P.y += pontas[i].p.y; P.z += pontas[i].p.z; });
      P.x /= no.pontas.length; P.y /= no.pontas.length; P.z /= no.pontas.length;
      /* ramos por sistema (sistemas diferentes no mesmo ponto NÃO se ligam) */
      var porSis = {};
      no.pontas.forEach(function (i) {
        var pa = pontas[i], s = pa.t.sistema;
        (porSis[s] = porSis[s] || []).push({ trecho: pa.t.id, dir: pa.dir, dn: pa.t.dn || 0, material: pa.t.material, aplicacao: pa.t.aplicacao, vertical: pa.t.vertical,
                                             lado: pa.lado, junta: pa.lado === 0 ? pa.t.juntaIni : pa.t.juntaFim, juntaMotivo: pa.t.juntaMotivo,
                                             pecaLinha: pa.lado === 0 ? pa.t.pecaIni : pa.t.pecaFim });
      });
      /* ponta caindo no MEIO de outro trecho do mesmo sistema: ele passa pelo nó (dois ramos) */
      trechos.forEach(function (t) {
        if (!porSis[t.sistema]) return;
        if (porSis[t.sistema].some(function (r) { return r.trecho === t.id; })) return;
        var d = noInterior(P, t.p1, t.p2);
        if (d != null && d <= TOL) {
          porSis[t.sistema].push({ trecho: t.id, dir: unit(t.p1, t.p2), dn: t.dn || 0, material: t.material, aplicacao: t.aplicacao, vertical: t.vertical, passante: true });
          porSis[t.sistema].push({ trecho: t.id, dir: unit(t.p2, t.p1), dn: t.dn || 0, material: t.material, aplicacao: t.aplicacao, vertical: t.vertical, passante: true });
        }
      });
      /* a ventilação que SAI DO MEIO de um ramal de esgoto, marcada "continua" (o tê da ventilação do ambiente,
         js/hidambiente.js — correção do Rogério, 18/10/2026): o ramal passa pelo nó e a derivação é a ventilação — o tê
         aparece no 3D e no quantitativo (antes a ponta só "continuava" e o tê não era contado) */
      if (porSis.ventilacao && porSis.ventilacao.length === 1 && Object.keys(porSis).length === 1) {
        var rv0 = porSis.ventilacao[0], tv0 = porIdT[rv0.trecho];
        var tes0 = tv0 && (tv0.continua === "ambos" || tv0.continua === (rv0.lado === 0 ? "p1" : "p2")) ? trechos.filter(function (t) { if (t.sistema !== "esgoto") return false; var d = noInterior(P, t.p1, t.p2); return d != null && d <= TOL; })[0] : null;
        if (tes0) {
          porSis.esgoto = [{ trecho: tes0.id, dir: unit(tes0.p1, tes0.p2), dn: tes0.dn || 0, material: tes0.material, aplicacao: tes0.aplicacao, vertical: tes0.vertical, passante: true },
                           { trecho: tes0.id, dir: unit(tes0.p2, tes0.p1), dn: tes0.dn || 0, material: tes0.material, aplicacao: tes0.aplicacao, vertical: tes0.vertical, passante: true }, rv0];
          delete porSis.ventilacao;
        }
      }
      var sisNo = Object.keys(porSis);
      /* JUNÇÃO esgoto × ventilação declarada (PROJETO INTELIGENTE etapa 3, js/hidpredio.js): o ventilador primário que sai do
         topo do tubo de queda — toda ponta de ventilação no nó marcada "continua" (segue na peça de junção) não é "misturado" */
      var juncaoEV = sisNo.length === 2 && porSis.esgoto && porSis.ventilacao && porSis.ventilacao.every(function (r) { var tt = porIdT[r.trecho]; return !r.passante && tt && (tt.continua === "ambos" || tt.continua === (r.lado === 0 ? "p1" : "p2")); });
      if (sisNo.length > 1 && !juncaoEV) avisosRede.push({ x: r4(P.x), y: r4(P.y), z: r4(P.z), texto: "sistemas diferentes se tocam no mesmo ponto (" + sisNo.map(function (s) { return SISTEMAS[s].nome; }).join(" × ") + "): não se ligam" });
      sisNo.forEach(function (s) {
        var ramos = porSis[s], av = [];
        nosRamos.push(ramos.map(function (r) { return r.trecho; }));   /* P12: quem está ligado a quem (nome/numeração de sistema) */
        /* peça (ralo, caixa) com o nó dentro do cilindro de captura: ligado, sem conexão */
        var pc = null; pecas.forEach(function (q) { if (!pc && q.sistema === s && dentroHub(P, q.hub)) pc = q; });
        if (!pc) pecas.forEach(function (q) { if (!pc && dentroHub(P, q.hub) && q.sistema !== s) av.push("tubo de " + SISTEMAS[s].nome.toLowerCase() + " terminando em " + PECAS[q.peca].nome.toLowerCase() + " de " + SISTEMAS[q.sistema].nome.toLowerCase()); });
        if (pc) {
          ramos.forEach(function (r) { ligacoes.push({ trecho: r.trecho, alvo: pc.id, tipo: "peca", x: r4(P.x), y: r4(P.y), z: r4(P.z) }); });
          ligPeca[pc.id] = (ligPeca[pc.id] || 0) + ramos.length;
          return;
        }
        var con = null;
        if (ramos.length === 1) conectores.forEach(function (c) { if (!con && !usadosCon[c.id] && dist(c, P) <= TOL_CONECTOR) con = c; });
        if (con && con.sistema !== s) { av.push("tubo de " + SISTEMAS[s].nome.toLowerCase() + " no ponto de " + SISTEMAS[con.sistema].nome.toLowerCase() + " do aparelho"); con = null; }
        if (con) { usadosCon[con.id] = 1; ligacoes.push({ trecho: ramos[0].trecho, alvo: con.id, famInst: con.famInst, tipo: con.origem === "acessorio" ? "acessorio" : "aparelho", x: con.x, y: con.y, z: con.z }); }
        var cxs = decidir(ramos, s, con, av);
        /* QV1: a luva onde a conexão entrega PONTA. Decisão da coordenação (18/10/2026, noite): a luva faltava no ORÇAMENTO —
           correção de erro de quantitativo, vale para TODOS; sem a prévia hidro ela entra SÓ na contagem (luvasQto: qto e
           orçamento), sem peça no 3D, sem junta no tubo e sem aviso — a geometria nova segue atrás da prévia (P8) */
        var soQto = null;
        if (previaHidro()) juntasDaPonta(cxs, ramos, s, av).forEach(function (j) { juntas.push(j); });
        else { var cq = cxs.slice(); juntasDaPonta(cq, ramos, s, []); soQto = cq.slice(cxs.length); }
        if (ramos.length === 1 && !con) {
          var tc = porIdT[ramos[0].trecho], ponta = tc && tc.continua ? (dist(tc.p1, P) <= TOL ? "p1" : (dist(tc.p2, P) <= TOL ? "p2" : "")) : "";
          if (ponta && (tc.continua === "ambos" || tc.continua === ponta)) continuacoes.push({ trecho: ramos[0].trecho, ponta: ponta, x: r4(P.x), y: r4(P.y), z: r4(P.z) });
          else livres.push({ trecho: ramos[0].trecho, x: r4(P.x), y: r4(P.y), z: r4(P.z) });
        }
        cxs.forEach(function (c, m) {
          c.id = "cx" + k + (sisNo.length > 1 ? s.slice(0, 2) : "") + (cxs.length > 1 ? "-" + m : "");
          c.x = r4(P.x); c.y = r4(P.y); c.z = r4(P.z);
          c.ramos = ramos.map(function (r) { return r.trecho; }).filter(function (v, i2, a2) { return a2.indexOf(v) === i2; });
          c.nome = nomeConexao(c.tipo, c.material);
          conexoes.push(c);
        });
        (soQto || []).forEach(function (c, m) {
          c.id = "cx" + k + (sisNo.length > 1 ? s.slice(0, 2) : "") + "-lq" + m; c.soQto = true;
          c.x = r4(P.x); c.y = r4(P.y); c.z = r4(P.z); c.ramos = [c.juntaDe]; c.nome = nomeConexao(c.tipo, c.material);
          luvasQto.push(c);
        });
        av.forEach(function (a) { avisosRede.push({ x: r4(P.x), y: r4(P.y), z: r4(P.z), texto: a }); });
      });
    });
    /* pontos de aparelho sem tubo: o projeto ainda não ligou aquele aparelho */
    var semLigacao = conectores.filter(function (c) { return !usadosCon[c.id]; });
    /* QUALIDADE VISUAL 2: o que a vista de problemas MARCA no 3D — o ponto sem tubo de um sistema que o
       projeto nem traçou (água quente do lavatório numa casa sem aquecimento, o ponto do aparelho antes de
       qualquer tubo) é estado do projeto, não defeito: fica na lista, sem marca vermelha em cima da louça */
    var emUso = {}; trechos.forEach(function (t) { emUso[t.sistema] = 1; });
    var marcar = semLigacao.filter(function (c) { return emUso[c.sistema]; });
    return { trechos: trechos, pecas: pecas, conectores: conectores, conexoes: conexoes, ligacoes: ligacoes, pontasLivres: livres, continuacoes: continuacoes,
             conectoresLivres: semLigacao, conectoresMarcar: marcar, ligacoesPeca: ligPeca, avisos: avisosRede, acessorios: acessorios, nosRamos: nosRamos, juntas: juntas, luvasQto: luvasQto };
  }

  /* ================================================ JUNTAS NA PONTA (QV1, pedido do Rogério, 17/10/2026)
   * Joelho, tê e junção de esgoto saem de fábrica com PONTA a jusante (desenho cotado da ficha). O tubo que segue
   * NÃO tem de ter bolsa ("às vezes você já usou a bolsa, está com um pedaço de cano"): o PADRÃO é uma LUVA de
   * verdade — conexão no quantitativo — com a bolsa recebendo o que vem de montante. Por junta (no trecho que sai):
   *   "luva" (padrão) · "bolsa" (bolsa do próprio tubo: a luva some) · "invertida" (luva contra o fluxo: aviso).
   * Quem diz se a conexão tem ponta é a geometria (js/biminstgeo.js, HidGeo.temPonta); sem ela, nada muda.
   * Jusante = o trecho que COMEÇA no nó (o esgoto escoa de p1 para p2), com pelo menos um que chega. */
  var JUNTAS = { luva: "Luva (padrão)", bolsa: "Bolsa do próprio tubo", invertida: "Luva invertida (contra o fluxo)" };
  function juntasDaPonta(cxs, ramos, sistema, avisos) {
    var HG = dep("HidGeo", "./biminstgeo.js"), out = [];
    if (!HG || !HG.temPonta || !SISTEMAS[sistema] || !SISTEMAS[sistema].gravidade && sistema !== "ventilacao") return out;
    var princ = cxs.filter(function (c) { return c.tipo !== "reducao" && c.tipo !== "luva"; })[0];
    /* PARIDADE (18/10/2026): a redução EXCÊNTRICA de esgoto (o produto) tem PONTA no lado maior: sozinha no nó, ela também
       entrega ponta — a luva só entra se o trecho de jusante é o do DN maior */
    var soRed = !princ && cxs.length === 1 && cxs[0].tipo === "reducao" ? cxs[0] : null;
    if (soRed) princ = soRed;
    if (!princ || !HG.temPonta(princ.material, princ.tipo, princ.dn)) return out;
    var jus = ramos.filter(function (r) { return !r.passante && r.lado === 0; }), mon = ramos.filter(function (r) { return !r.passante && r.lado === 1; });
    if (jus.length !== 1 || !mon.length) return out;
    if (soRed && Math.abs((+jus[0].dn || 0) - (+soRed.dn || 0)) > 0.5) return out;
    var r = jus[0], j = JUNTAS[r.junta] ? r.junta : "luva";
    out.push({ trecho: r.trecho, lado: 0, junta: j, dn: r.dn, material: r.material, principal: princ.tipo });
    if (j === "bolsa") return out;
    cxs.push({ tipo: "luva", sistema: sistema, material: r.material, aplicacao: r.aplicacao || princ.aplicacao, dn: r.dn, dn2: 0,
               juntaDe: r.trecho, juntaLado: 0, invertida: j === "invertida" });
    if (j === "invertida") avisos.push("luva INVERTIDA (contra o fluxo) entre a ponta da conexão (" + nomeConexao(princ.tipo, princ.material).toLowerCase() + ") e o trecho " + r.trecho +
      (r.juntaMotivo ? " — motivo registrado: " + r.juntaMotivo : ": confirme o motivo (Propriedades da junta)"));
    return out;
  }

  /* ========================================================= SINAPI
   * O item (tubo, conexão ou peça) → a composição da tabela gerada, ou
   * "pendente" com o motivo. Desempate DECLARADO quando a chave tem mais de
   * uma: (1) os extras do item (PN do PPR; classe e isolamento do cobre;
   * bitola e isolamento do duto) têm de bater — no TUBO; na conexão o PN é
   * ignorado (a conexão de PPR é PN 25 e serve ao tubo PN 20); (2) a
   * variante: redução entre dois tubos = LUVA de redução, depois bucha
   * curta, depois longa; luva comum antes da "passante"; (3) o menor código.
   * Quantas alternativas havia vai junto (a tela mostra). */
  var VAR_PREF = { "": 0, luva: 1, curta: 2, longa: 3, passante: 4, curva: 1, cotovelo: 2 };   /* P12: eletrocalha — a curva horizontal antes do cotovelo */
  function tabela() { return dep("BimInstSinapi", "./biminstsinapi.js"); }
  /* a aplicação na chave leva o SISTEMA ("esgoto:ramal" × "pluvial:ramal"):
     o mesmo tubo série R tem composição no pluvial e não no esgoto. A
     ventilação usa a do esgoto ("prumada de esgoto sanitário OU ventilação").
     Ralo, caixa sifonada e caixa elétrica já são separados pela peça. */
  var GRUPO_TABELA = { agua: "agua", esgoto: "esgoto", ventilacao: "esgoto", pluvial: "pluvial", eletrica: "eletrica" };
  function chaveSinapi(item) {
    var dnk = item.peca === "tubo" && item.material === "duto_chapa" ? "-" : txt(item.dn) + (item.dn2 ? "x" + item.dn2 : "");
    var ap = item.aplicacao, gt = GRUPO_TABELA[grupoDe(item.sistema)];
    if (!PECAS[item.peca] && !ACESSORIOS[item.peca] && !DISPOSITIVOS[item.peca] && gt) ap = gt + ":" + ap;
    return [item.peca, item.material, ap, dnk].join("|");
  }
  function rotuloItem(item) {
    if (ACESSORIOS[item.peca] || DISPOSITIVOS[item.peca]) return rotuloP12(item);   /* P12 */
    var M = MATERIAIS[item.material], P = PECAS[item.peca];
    if (P && item.nome) return item.nome + (SISTEMAS[item.sistema] ? " — " + SISTEMAS[item.sistema].nome.toLowerCase() : "");   /* pendências finais: a caixa de inspeção pelo tipo */
    if (item.peca === "tubo") return (M ?(M.secao === "retangular" ? M.nome + " " + Math.round(item.larg * 100) + "×" + Math.round(item.alt * 100) + " cm" : M.nome + " DN " + item.dn) : item.material) + aplRot(item);
    if (P) return P.nome + (item.dn && item.dn !== "-" ? " " + item.dn : "") + (item.material === "metalica" ? " metálica" : "") + (item.aplicacao && P.sistemas[0] === "eletrica" && item.peca !== "caixa_octogonal" ? " (" + item.aplicacao + ")" : "") + (P.sistemas[0] !== "eletrica" ? " — " + SISTEMAS[item.sistema].nome.toLowerCase() : "");
    return nomeConexao(item.peca, item.material) + " " + (M ? M.nome : item.material) + " DN " + item.dn + (item.dn2 ? " × " + item.dn2 : "") + aplRot(item);
  }
  function aplRot(item) {
    var g = grupoDe(item.sistema), a = (APLICACOES[g] || {})[item.aplicacao];
    return a ? " — " + a.toLowerCase() + " (" + (SISTEMAS[item.sistema] ? SISTEMAS[item.sistema].nome.toLowerCase() : "") + ")" : "";
  }
  function sinapiDe(item) {
    var T = tabela(), k = chaveSinapi(item), rot = rotuloItem(item);
    if (!T || !T.chaves) return { status: "pendente", chave: k, rotulo: rot, motivo: "a tabela SINAPI das instalações (js/biminstsinapi.js) não carregou" };
    var c = arr(T.chaves[k]).slice();
    if (item.semTabela) return { status: "pendente", chave: k, rotulo: rot, motivo: item.semTabela };   /* P12: o item já sabe que não tem chave (bitola de rosca, altura da eletrocalha…) */
    var ext = item.peca === "tubo" ? ["pn", "classe", "iso", "bitola"] : (EXTRAS_P12[item.peca] || []);
    ext.forEach(function (e) { if (item[e] != null && item[e] !== "") c = c.filter(function (x) { return !x[3] || x[3][e] == null || x[3][e] === txt(item[e]); }); });
    if (!c.length) {
      var porque = arr(T.chaves[k]).length ? " com " + ext.filter(function (e) { return item[e]; }).map(function (e) { return e.toUpperCase() + " " + item[e]; }).join(", ") : "";
      return { status: "pendente", chave: k, rotulo: rot, motivo: "sem composição SINAPI (" + (T.fonte ? T.fonte.mes : "") + ") para " + rot + porque + " — pendente (nunca a parecida)" };
    }
    c.sort(function (a, b) { var va = VAR_PREF[(a[3] && a[3]["var"]) || ""], vb = VAR_PREF[(b[3] && b[3]["var"]) || ""]; return (va - vb) || (Number(a[0]) - Number(b[0])); });
    var M = dep("SinapiMapa", "./sinapimapa.js"), cod = c[0][0];
    if (M && M.classeDe) {
      var cl = M.classeDe(cod);
      if (cl !== "instalacao_trecho" && cl !== "instalacao_peca") return { status: "pendente", chave: k, rotulo: rot, motivo: "o código " + cod + " não está no mapa de instalações — pendente" };
    }
    return { status: "ok", chave: k, rotulo: rot, codigo: cod, unidade: c[0][1], descricao: c[0][2], alternativas: c.length - 1 };
  }

  /* quantidade do TUBO na unidade da composição: m (eixo, real) ou m² (duto retangular: perímetro × comprimento) */
  function quantidadeTrecho(t) {
    var M = MATERIAIS[t.material] || {};
    if (M.unidadeQto === "m") return { unidade: "m", quantidade: r4(t.comprimento) };   /* P12: eletrocalha em metro */
    if (M.secao === "retangular") return { unidade: "m2", quantidade: r4(2 * (t.larg + t.alt) * t.comprimento) };
    return { unidade: "m", quantidade: r4(t.comprimento) };
  }
  function itemTrecho(t) {
    var it = { peca: "tubo", sistema: t.sistema, material: t.material, aplicacao: t.aplicacao, dn: t.material === "duto_chapa" ? "-" : t.dn, pn: t.pn, classe: t.classe, iso: t.iso, bitola: t.bitola, larg: t.larg, alt: t.alt };
    var M = MATERIAIS[t.material] || {};
    if (t.sistema === "incendio" || t.sistema === "industrial") it.semTabela = "a SINAPI 06/2026 não tem composição mapeada para tubulação de " + (t.sistema === "industrial" ? "fluido industrial" : "incêndio") + " — pendente (nunca a parecida: a de água é outro produto)";   /* F3 incêndio */
    if (M.semSinapi) it.semTabela = "a SINAPI 06/2026 não tem composição de " + M.nome.toLowerCase() + " — pendente (nunca a parecida: outro material, outro produto)";
    if (M.alturas && M.alturas.indexOf(Math.round(t.alt * 1000)) < 0) it.semTabela = "a SINAPI 06/2026 só tem eletrocalha de altura " + M.alturas.join(", ") + " mm (esta tem " + Math.round(t.alt * 1000) + " mm) — pendente (nunca a parecida)";
    return it;
  }
  function itemConexao(c) {
    var M = MATERIAIS[c.material] || {};
    if (M.semSinapi) return { peca: c.tipo, sistema: c.sistema, material: c.material, aplicacao: c.aplicacao, dn: c.dn, dn2: c.dn2, semTabela: "a SINAPI 06/2026 não tem composição de conexão de " + M.nome.toLowerCase() + " — pendente" };
    if (/^duto_/.test(c.material)) return { peca: c.tipo, sistema: c.sistema, material: c.material, aplicacao: c.aplicacao, dn: c.dn, dn2: c.dn2, semTabela: "conexão de duto é orçada em m² de chapa (SINAPI \"curva, redução ou tê\"): a área depende do raio e do comprimento da peça — informe no orçamento" };
    var it = { peca: c.tipo, sistema: c.sistema, material: c.material, aplicacao: c.aplicacao, dn: c.dn, dn2: c.dn2, nomeMat: M.nome };
    if (M.larguras && c.aplicacao === "vertical") it.semTabela = "curva/tê VERTICAL de eletrocalha: a SINAPI 06/2026 só tem as peças horizontais — pendente (orce à parte)";
    /* PENDÊNCIAS FINAIS: o tê de inspeção de ESGOTO não tem composição SINAPI (só o do pluvial série R): a referência de mercado */
    if (c.tipo === "te_inspecao" && c.material === "pvc_esgoto") it.mercado = "te_inspecao_esgoto|" + c.dn;
    return it;
  }
  /* REFERÊNCIA DE MERCADO (pendências finais, 18/10/2026; js/hidprecomercado.js, só no grupo "hidro" da prévia): o item SEM
     composição SINAPI que tem preço público levantado (o maior de 3 lojas) — sem o módulo carregado, nada muda (pendente) */
  function refMercado(it) {
    var PM = global.HidPrecoMercado || null;
    if (!PM || !it) return null;
    if (it.mercadoSoma) return PM.soma(it.mercadoSoma, it.mercadoRotulo);
    return it.mercado && PM.ref ? PM.ref(it.mercado) : null;
  }
  function itemPeca(k) {
    var it = { peca: k.peca, sistema: k.sistema, material: k.material, aplicacao: k.aplicacao, dn: k.dn };
    /* PENDÊNCIAS FINAIS: a caixa de inspeção pela profundidade (a composição real, mais a tampa) ou o dispositivo de PVC
       (sem SINAPI: a soma das referências de mercado) — js/hidcigeo.js (só no grupo "hidro"); sem ele, pendente */
    if (k.peca === "caixa_inspecao") {
      var CI = dep("HidCI", "./hidcigeo.js"), oc = CI && CI.orcamento ? CI.orcamento(k) : null;
      if (!oc) { it.semTabela = "caixa de inspeção: o motor da caixa (js/hidcigeo.js) não carregou — pendente"; return it; }
      it.nome = oc.nome; it.chaveExtra = oc.chaveExtra;
      if (oc.composicoes) it.composicoes = oc.composicoes;
      if (oc.semTabela) it.semTabela = oc.semTabela;
      if (oc.mercadoSoma) { it.mercadoSoma = oc.mercadoSoma; it.mercadoRotulo = oc.mercadoRotulo; }
      return it;
    }
    if ((PECAS[k.peca] || {}).semSinapi) it.semTabela = "a SINAPI 06/2026 não tem composição mapeada para " + PECAS[k.peca].nome.toLowerCase() + " — pendente (nunca a parecida)";   /* F3 incêndio */
    return it;
  }

  /* ===================================================== QUANTITATIVO
   * Por sistema, material e DN: metros de tubo (eixo real), número de
   * conexões por tipo, peças — cada grupo com a composição (ou pendente). */
  function qto(estado, avaliarFam) {
    var R = rede(estado, avaliarFam);
    var tubos = {}, ordT = [], cxs = {}, ordC = [], pcs = {}, ordP = [], porSis = {};
    function sis(s) { return porSis[s] || (porSis[s] = { sistema: s, nome: SISTEMAS[s].nome, cor: SISTEMAS[s].cor, metros: 0, conexoes: 0, pecas: 0 }); }
    R.trechos.forEach(function (t) {
      var it = itemTrecho(t), q = quantidadeTrecho(t);
      var k = [t.sistema, t.material, t.material === "duto_chapa" ? r2(t.larg) + "x" + r2(t.alt) : t.dn, t.aplicacao, t.pn || "", t.classe || "", t.iso || "", t.bitola || ""].join("|");
      var g = tubos[k];
      if (!g) { g = tubos[k] = { sistema: t.sistema, material: t.material, dn: t.dn, larg: t.larg, alt: t.alt, aplicacao: t.aplicacao, pn: t.pn, classe: t.classe, iso: t.iso, bitola: t.bitola, n: 0, metros: 0, quantidade: 0, unidade: q.unidade, trechos: [], sinapi: sinapiDe(it) }; ordT.push(k); }
      g.n++; g.metros = r4(g.metros + t.comprimento); g.quantidade = r4(g.quantidade + q.quantidade); g.trechos.push(t.id);
      sis(t.sistema).metros = r4(sis(t.sistema).metros + t.comprimento);
    });
    R.conexoes.concat(arr(R.luvasQto)).forEach(function (c) {   /* + a luva na ponta (só contagem, sem a prévia) */
      var k = [c.sistema, c.material, c.tipo, c.dn, c.dn2 || "", c.aplicacao].join("|");
      var g = cxs[k];
      if (!g) {
        var it = itemConexao(c);
        g = cxs[k] = { tipo: c.tipo, nome: c.nome, sistema: c.sistema, material: c.material, dn: c.dn, dn2: c.dn2, aplicacao: c.aplicacao, n: 0, ids: [],
                       sinapi: it.semTabela ? { status: "pendente", chave: chaveSinapi(it), rotulo: rotuloItem(it), motivo: it.semTabela } : sinapiDe(it) };
        if (g.sinapi.status !== "ok") { var rmC = refMercado(it); if (rmC) g.mercado = rmC; }
        ordC.push(k);
      }
      g.n++; g.ids.push(c.id); sis(c.sistema).conexoes++;
    });
    R.pecas.forEach(function (p) {
      var itp = itemPeca(p), k = [p.peca, p.sistema, p.material, p.dn, p.aplicacao, itp.chaveExtra || ""].join("|");
      var g = pcs[k];
      if (!g) {
        g = pcs[k] = { peca: p.peca, nome: itp.nome || PECAS[p.peca].nome, sistema: p.sistema, material: p.material, dn: p.dn, aplicacao: p.aplicacao, n: 0, ids: [], sinapi: itp.composicoes ? itp.composicoes[0] : sinapiDe(itp) };
        if (itp.composicoes) g.composicoes = itp.composicoes;   /* a caixa de inspeção: a caixa e a tampa (de ferro) */
        if (g.sinapi.status !== "ok") { var rmP = refMercado(itp); if (rmP) g.mercado = rmP; }
        ordP.push(k);
      }
      g.n++; g.ids.push(p.id); sis(p.sistema).pecas++;
    });
    /* P12: acessórios de tubo (registro, válvula) e dispositivos elétricos (família com `mep`) */
    var acs = {}, ordA = [], dsp = {}, ordD = [];
    arr(R.acessorios).forEach(function (a) {
      var it = itemAcessorio(a), k = [a.acessorio, a.sistema, it.material, it.aplicacao, it.dn].join("|");
      var g = acs[k];
      if (!g) { g = acs[k] = { acessorio: a.acessorio, nome: ACESSORIOS[a.acessorio].nome, variante: a.variante, sistema: a.sistema, dn: a.dn, material: it.material, aplicacao: it.aplicacao, dnSinapi: it.dn, n: 0, ids: [], sinapi: sinapiDe(it) }; if (g.sinapi.status !== "ok") { var rmA = refMercado(it); if (rmA) g.mercado = rmA; } ordA.push(k); }
      g.n++; g.ids.push(a.id); sis(a.sistema).pecas++;
    });
    dispositivosDo(estado, avaliarFam).forEach(function (d) {
      var it = d.item, k = [it.peca, it.material, it.aplicacao, it.dn, it.placa || "", it.corrente || ""].join("|");
      var g = dsp[k];
      if (!g) { g = dsp[k] = { peca: it.peca, nome: DISPOSITIVOS[it.peca].nome, material: it.material, aplicacao: it.aplicacao, dn: it.dn, placa: it.placa, corrente: it.corrente, n: 0, ids: [], sinapi: sinapiDe(it), rotulo: rotuloP12(it) }; ordD.push(k); }
      g.n++; g.ids.push(d.id);
    });
    return {
      acessorios: ordA.map(function (k) { return acs[k]; }),
      dispositivos: ordD.map(function (k) { return dsp[k]; }),
      tubos: ordT.map(function (k) { return tubos[k]; }),
      conexoes: ordC.map(function (k) { return cxs[k]; }),
      pecas: ordP.map(function (k) { return pcs[k]; }),
      porSistema: Object.keys(porSis).map(function (k) { return porSis[k]; }),
      ligacoes: R.ligacoes.length, pontasLivres: R.pontasLivres.length, conectoresLivres: R.conectoresLivres.length,
      avisos: R.avisos.map(function (a) { return a.texto; }).concat(R.trechos.reduce(function (acc, t) { return acc.concat(t.avisos.map(function (a) { return "trecho " + t.id + ": " + a; })); }, []))
        .concat(arr(R.acessorios).reduce(function (acc, a) { return acc.concat(a.avisos.map(function (x) { return ACESSORIOS[a.acessorio].nome.toLowerCase() + " " + a.id + ": " + x; })); }, [])),
      rede: R
    };
  }

  /* ============================================= PARA O ORÇAMENTO DO MODELO
   * Uma linha por TRECHO, CONEXÃO e PEÇA (o "elemento" do js/orcmodelo.js:
   * de que peça do modelo a quantidade veio). Código só da tabela; sem ele,
   * a linha é PENDENTE com o motivo e entra em "Fora do orçamento". */
  function servicosOrc(estado, avaliarFam) {
    var R = rede(estado, avaliarFam), out = [];
    function linha(id, it, q, un, sp) {
      var o = { id: id, rotulo: sp.rotulo || rotuloItem(it), unidade: un, quantidade: q };
      if (sp.status === "ok") { o.codigo = sp.codigo; o.descricao = sp.descricao; o.alternativas = sp.alternativas; }
      else {
        o.codigo = ""; o.motivo = sp.motivo;
        var rm = refMercado(it); if (rm) o.referenciaMercado = rm;   /* pendências finais: o preço de varejo levantado, nunca "a cotar" */
      }
      out.push(o);
    }
    R.trechos.forEach(function (t) { var it = itemTrecho(t), q = quantidadeTrecho(t); linha(t.id, it, q.quantidade, q.unidade, sinapiDe(it)); });
    R.conexoes.concat(arr(R.luvasQto)).forEach(function (c) {
      var it = itemConexao(c);
      linha(c.id, it, 1, "un", it.semTabela ? { status: "pendente", rotulo: rotuloItem(it), motivo: it.semTabela } : sinapiDe(it));
    });
    R.pecas.forEach(function (p) {
      var it = itemPeca(p);
      /* a peça com MAIS de uma composição (a caixa de inspeção: a caixa + a tampa de ferro, ou o poço + a tampa) */
      if (it.composicoes) { it.composicoes.forEach(function (cp) { linha(p.id, it, cp.qtd != null ? cp.qtd : 1, cp.unidadeQto || "un", cp); }); return; }   /* o PV: acréscimo e chaminé em metro */
      linha(p.id, it, 1, "un", sinapiDe(it));
    });
    /* P12: cada registro/válvula e cada dispositivo (tomada, interruptor, luminária, quadro) é 1 UN */
    arr(R.acessorios).forEach(function (a) { var it = itemAcessorio(a); linha(a.id, it, 1, "un", sinapiDe(it)); });
    dispositivosDo(estado, avaliarFam).forEach(function (d) { linha(d.id, d.item, 1, "un", sinapiDe(d.item)); });
    return out;
  }

  /* ========================================================= PLANTA 2D
   * O que a planta técnica desenha por cima do modelo: o EIXO de cada
   * trecho na cor do sistema (acima do plano de corte: tracejado, como o
   * que passa no forro), as conexões, as peças e o rótulo (DN e, nos de
   * gravidade, a inclinação). Coordenadas da planta = (x, z) do mundo
   * (js/bim.js vista2d: telaX = x, telaY = z). */
  function planta(estado, o) {
    o = o || {};
    var inst = (estado && estado.instalacoes) || { trechos: [], pecas: [] };
    var y0 = num(o.yFundo, -Infinity), yc = num(o.yCorte, Infinity), y1 = num(o.yTopo, yc + 3);
    var out = { linhas: [], simbolos: [], textos: [] };
    arr(inst.trechos).forEach(function (t) {
      var lo = Math.min(t.p1.y, t.p2.y), hi = Math.max(t.p1.y, t.p2.y);
      if (hi < y0 - 1e-6 || lo > y1 + 1e-6) return;
      var S = SISTEMAS[t.sistema], acima = lo > yc + 1e-6;
      var M = MATERIAIS[t.material] || {};
      var larg = M.secao === "retangular" ? t.larg : t.diametro;
      if (t.vertical) { out.simbolos.push({ tipo: "prumada", x: r4(t.p1.x), y: r4(t.p1.z), r: r4(Math.max(larg, 0.05) / 2 + 0.02), cor: S.cor, id: t.id }); }
      else out.linhas.push({ seg: [r4(t.p1.x), r4(t.p1.z), r4(t.p2.x), r4(t.p2.z)], cor: S.cor, tracejado: acima, largura: r4(larg), sistema: t.sistema, id: t.id });
      if (!t.vertical && t.comprimentoH >= 0.6) {
        var rot = M.secao === "retangular" ? Math.round(t.larg * 100) + "×" + Math.round(t.alt * 100) : (S.abrev + " Ø" + t.dn);
        if (S.gravidade && t.inclinacao != null) rot += " i=" + fmtPct(t.inclinacao);
        /* PADRÃO DE APRESENTAÇÃO (js/biminstpadrao.js): o conteúdo e o formato do rótulo de tubo do padrão (DN; no
           esgoto e no pluvial, a inclinação) — sem o padrão carregado, fica o rótulo acima */
        var PADR = dep("BimInstPadrao", "./biminstpadrao.js");
        if (PADR && PADR.pronto && PADR.pronto() && M.secao !== "retangular" && previaHidro()) {   /* P8: sem a prévia hidro, o rótulo do master */ var rp = PADR.rotuloTrecho({ sistema: t.sistema, dn: t.dn, inclinacao: S.gravidade ? t.inclinacao : null }); if (rp) rot = rp; }
        var ang = Math.atan2(t.p2.z - t.p1.z, t.p2.x - t.p1.x) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        out.textos.push({ x: r4((t.p1.x + t.p2.x) / 2), y: r4((t.p1.z + t.p2.z) / 2), t: rot, cor: S.cor, rot: r2(ang) });
      }
    });
    arr(inst.pecas).forEach(function (p) {
      if (p.y < y0 - 1e-6 || p.y > y1 + 1e-6) return;
      var P = PECAS[p.peca];
      out.simbolos.push({ tipo: P.forma === "caixa" ? "caixa" : "ralo", x: r4(p.x), y: r4(p.z), r: r4(P.forma === "caixa" ? P.w / 2 : P.r), cor: P.sistemas[0] === "eletrica" ? COR_CAIXA_ELETRICA : SISTEMAS[p.sistema].cor, id: p.id });
    });
    if (o.rede) arr(o.rede.conexoes).forEach(function (c) {
      if (c.y < y0 - 1e-6 || c.y > y1 + 1e-6) return;
      out.simbolos.push({ tipo: "conexao", x: c.x, y: c.z, r: r4(Math.max(c.dn, 20) / 2000 + 0.015), cor: SISTEMAS[c.sistema].cor, id: c.id });
    });
    /* P12: o registro/válvula no eixo — a "gravata" (dois triângulos opostos pelo vértice), na cor do sistema */
    arr(inst.acessorios).forEach(function (a) {
      if (a.centro.y < y0 - 1e-6 || a.centro.y > y1 + 1e-6) return;
      simboloAcessorio(a).forEach(function (sg) { out.linhas.push({ seg: sg, cor: SISTEMAS[a.sistema].cor, tracejado: false, largura: 0, sistema: a.sistema, id: a.id }); });
    });
    /* P12: LEGENDA de tubulação por sistema e DN (só quando pedida: a planta de sempre fica igual) */
    if (o.legenda) legendaNaPlanta(estado, out);
    return out;
  }

  /* =====================================================================
   * P12 — INSTALAÇÕES II (plano do BIM §4 P12, 09/10/2026)
   *
   * A) ACESSÓRIOS DE TUBO (registro de gaveta, de esfera, de pressão e
   *    válvula de retenção): colocado NUM TUBO, ele DIVIDE o
   *    trecho (BreakCurve) — o tubo some debaixo do corpo do acessório e as
   *    duas metades ficam ligadas nas faces dele (dois pontos de ligação).
   *    É UMA op (desfazer devolve o tubo inteiro; apagar o registro emenda):
   *      {op:'acessorio', id, famId, tipoId, trecho, novoId, x, y, z, comprimento}
   *    famId = a família RA (js/familiasra.js, com os conectores); tipoId =
   *    a VARIANTE (bruto, com acabamento, soldável, roscável…); comprimento =
   *    face a face, medido pela tela nos conectores da família avaliada.
   *    DISPOSITIVOS (tomada, interruptor, luminária, quadro) são famílias
   *    colocadas como as outras, com `mep: {peca}` e o ponto de ligação do
   *    eletroduto; aqui só se tira o item SINAPI delas.
   * B) ELETROCALHA (sistema "bandeja"): mesmas regras de traçado; conexões
   *    pela SINAPI (curva/tê horizontal 90°, redução; a emenda está no metro).
   *    verificar(): pontas soltas, pontos sem tubo, sistemas misturados,
   *    inclinação abaixo da mínima — os avisos que a B5 já gerava, numa lista.
   *    sistemas(): os trechos ligados formam um SISTEMA, numerado por tipo
   *    (AF-1, AF-2…), com nome automático ("Água fria 1") ou o do usuário
   *    (op {op:'instSistema', id:<trecho>, nome}).
   * C) legenda() por sistema e DN, tabelaPecas() — a tabela de peças MEP
   *    local (a da P5 — js/bimtabela.js — a substitui quando existir).
   *
   * ⚠ SINAPI: só pela tabela gerada (tools/gerar-biminst-sinapi.js). O
   *   registro de latão/bronze é ROSCÁVEL e a SINAPI o dá em POLEGADA: o DN
   *   do tubo vira a bitola de rosca pela tabela BITOLA_REF (a "referência"
   *   do tubo soldável, ABNT NBR 5648). Material sem tabela = pendente, com
   *   o motivo — nunca a bitola "parecida". Os adaptadores soldável × rosca
   *   não são deduzidos: aviso "orce à parte".
   * ===================================================================== */
  var ACESSORIOS = {
    /* PENDÊNCIAS FINAIS (18/10/2026, decisão da coordenação): EMBUTIDO na parede (ramal de banheiro/cozinha) = registro de
       BASE DE LATÃO com acabamento cromado (o 3D mostra a base + o acabamento; a SINAPI é a do latão); APARENTE (barrilete,
       cavalete, casa de máquinas, piscina, pressurizador) = registro de ESFERA de PVC soldável. O registro de GAVETA de PVC
       soldável SAIU do catálogo (decisão da coordenação, 18/10/2026, noite): o produto não existe nas linhas Tigre/Amanco/Krona
       — sem produto e sem preço inventados. Estado antigo com esse tipo cai no primeiro tipo (bruto, latão) na normalização. */
    registro_gaveta:  { nome: "Registro de gaveta", fam: "ra-registro-gaveta", ifc: "IFCVALVE", pre: "ISOLATING", sistemas: ["agua_fria", "agua_quente"],
                        variantes: { bruto: { material: "latao", aplicacao: "bruto", rosca: true, rot: "bruto, latão roscável" },
                                     acabamento: { material: "latao", aplicacao: "acabamento", rosca: true, rot: "latão roscável, com acabamento e canopla cromados" } } },
    registro_esfera:  { nome: "Registro de esfera", fam: "ra-registro-esfera", ifc: "IFCVALVE", pre: "ISOLATING", sistemas: ["agua_fria", "agua_quente"],
                        variantes: { soldavel: { material: "pvc_soldavel", aplicacao: "volante", rosca: false, rot: "PVC soldável, com volante" },
                                     roscavel: { material: "pvc_roscavel", aplicacao: "volante", rosca: true, rot: "PVC roscável, com volante" },
                                     borboleta: { material: "pvc_roscavel", aplicacao: "borboleta", rosca: true, rot: "PVC roscável, com borboleta" } } },
    registro_pressao: { nome: "Registro de pressão", fam: "ra-registro-pressao", ifc: "IFCVALVE", pre: "REGULATING", sistemas: ["agua_fria", "agua_quente"],
                        variantes: { soldavel: { material: "pvc_soldavel", aplicacao: "volante", rosca: false, rot: "PVC soldável, volante simples" },
                                     roscavel: { material: "pvc_roscavel", aplicacao: "volante", rosca: true, rot: "PVC roscável, volante simples" },
                                     bruto: { material: "latao", aplicacao: "bruto", rosca: true, rot: "bruto, latão roscável" },
                                     acabamento: { material: "latao", aplicacao: "acabamento", rosca: true, rot: "latão roscável, com acabamento e canopla cromados" } } },
    valvula_retencao: { nome: "Válvula de retenção", fam: "ra-valvula-retencao", ifc: "IFCVALVE", pre: "CHECK", sistemas: ["agua_fria", "agua_quente"],
                        variantes: { bronze: { material: "bronze", aplicacao: "auto", rosca: true, rot: "de bronze, roscável (horizontal ou vertical pelo tubo)" },
                                     pe_crivo: { material: "bronze", aplicacao: "pe_crivo", rosca: true, rot: "de pé com crivo, de bronze, roscável" },
                                     /* PRESSURIZAÇÃO (js/hidpressao.js): no tubo de PVC soldável, a retenção de PVC soldável (o desenho é o do registro de PVC, sem castelo) */
                                     pvc: { material: "pvc_soldavel", aplicacao: "auto", rosca: false, rot: "de PVC soldável (horizontal ou vertical pelo tubo)", semSinapi: true, mercado: "retencao_pvc" } } }
  };
  /* EMBUTIDO × APARENTE (pendências finais, 18/10/2026): o ramal/sub-ramal de água (o do banheiro e da cozinha) corre
     embutido na parede; distribuição, prumada e reservação (barrilete, cavalete, casa de máquinas) são aparentes */
  function embutidoNaParede(t) {
    if (!t || grupoDe(t.sistema) !== "agua") return false;
    var ap = t.aplicacao || aplicacaoAuto(t.sistema, !!t.vertical);
    return ap === "ramal";
  }
  /* o TIPO do registro/válvula quando o projetista não escolheu: a regra acima, no material do tubo */
  function varianteAuto(acessorio, t) {
    var A = ACESSORIOS[acessorio]; if (!A) return null;
    var emb = embutidoNaParede(t), pvc = !!t && t.material === "pvc_soldavel", v;
    if (acessorio === "registro_gaveta") v = emb ? "acabamento" : "bruto";
    else if (acessorio === "registro_pressao") v = emb ? "acabamento" : (pvc ? "soldavel" : "bruto");
    else if (acessorio === "registro_esfera") v = pvc ? "soldavel" : "roscavel";
    else if (acessorio === "valvula_retencao") v = pvc ? "pvc" : "bronze";
    return A.variantes[v] ? v : Object.keys(A.variantes)[0];
  }
  var ACESSORIO_DA_FAM = {};
  Object.keys(ACESSORIOS).forEach(function (k) { ACESSORIO_DA_FAM[ACESSORIOS[k].fam] = k; });
  /* bitola de rosca do adaptador para o DN do tubo (mm → polegada).
     FONTE: ABNT NBR 5648 (tubo de PVC soldável — DN × referência). Os outros
     materiais ficam sem equivalência de propósito (pendente com o motivo). */
  var BITOLA_REF = { pvc_soldavel: { 20: "1/2", 25: "3/4", 32: "1", 40: "1 1/4", 50: "1 1/2", 60: "2", 75: "2 1/2", 85: "3", 110: "4" } };
  /* dispositivos = famílias com `mep: {peca}`; a categoria do Revit e a classe IFC
     (a do IMPORTADOR do Revit — revit-ifc, IFCCategoryUtil.cs, lido em 09/10/2026) */
  var DISPOSITIVOS = {
    tomada:      { nome: "Tomada", categoria: "Dispositivos elétricos", ifc: "IFCOUTLET", pre: "POWEROUTLET" },
    interruptor: { nome: "Interruptor", categoria: "Dispositivos elétricos", ifc: "IFCSWITCHINGDEVICE", pre: "TOGGLESWITCH" },
    luminaria:   { nome: "Luminária", categoria: "Luminárias", ifc: "IFCLIGHTFIXTURE", pre: "POINTSOURCE" },
    quadro:      { nome: "Quadro de distribuição", categoria: "Equipamento elétrico", ifc: "IFCELECTRICDISTRIBUTIONBOARD", pre: "DISTRIBUTIONBOARD" }
  };
  /* extras que escolhem entre composições da MESMA chave (como PN/classe no tubo) */
  var EXTRAS_P12 = { tomada: ["placa"], interruptor: ["placa"], quadro: ["corrente"] };
  var ACESSORIO_MIN = 0.04, ACESSORIO_MAX = 0.6, ACESSORIO_PADRAO = 0.06;
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function p6(p) { return { x: r6(p.x), y: r6(p.y), z: r6(p.z) }; }
  function soma(p, u, s) { return { x: p.x + u.x * s, y: p.y + u.y * s, z: p.z + u.z * s }; }

  /* o acessório gravado → o acessório "fechado" (faces, conectores, avisos) */
  function normAcessorio(o) {
    if (!o) return null;
    var k = ACESSORIO_DA_FAM[o.famId], A = ACESSORIOS[k]; if (!A) return null;
    var c = pt(o.centro), d = pt(o.dir); if (!c || !d) return null;
    var Ld = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z); if (!(Ld > 1e-9)) return null;
    d = { x: d.x / Ld, y: d.y / Ld, z: d.z / Ld };
    var L = num(o.comprimento, ACESSORIO_PADRAO); if (!(L >= ACESSORIO_MIN - 1e-9 && L <= ACESSORIO_MAX + 1e-9)) return null;
    var S = SISTEMAS[o.sistema]; if (!S) return null;
    var variante = A.variantes[o.tipoId] ? o.tipoId : Object.keys(A.variantes)[0], V = A.variantes[variante];
    var a = p6(soma(c, d, -L / 2)), b = p6(soma(c, d, L / 2)), dn = num(o.dn, 0);
    var out = { id: o.id, famId: o.famId, tipoId: o.tipoId, acessorio: k, variante: variante, nome: A.nome, sistema: o.sistema, material: o.material, dn: dn,
                centro: p6(c), dir: p6(d), comprimento: r4(L), a: a, b: b, vertical: Math.abs(d.y) > 0.95, trecho: o.trecho != null ? o.trecho : null, novoId: o.novoId != null ? o.novoId : null, avisos: [] };
    if (num(o.giro, 0) % 360) out.giro = ((num(o.giro, 0) % 360) + 360) % 360;   /* COLOCAÇÃO: giro do castelo/volante em torno do eixo (graus); 0 = o padrão */
    var nm = A.nome.toLowerCase();
    out.conectores = [{ id: o.id + ":e", famInst: o.id, origem: "acessorio", nome: A.nome + " (face 1)", sistema: o.sistema, dn: dn, x: a.x, y: a.y, z: a.z },
                      { id: o.id + ":s", famInst: o.id, origem: "acessorio", nome: A.nome + " (face 2)", sistema: o.sistema, dn: dn, x: b.x, y: b.y, z: b.z }];
    if (A.sistemas.indexOf(o.sistema) < 0) out.avisos.push(nm + " num tubo de " + S.nome.toLowerCase() + ": confira (o acessório é de água)");
    if (V.rosca && MATERIAIS[o.material] && !MATERIAIS[o.material].flexivel) out.avisos.push("adaptadores soldável × rosca nas duas faces não são deduzidos — orce à parte");
    return out;
  }
  /* coloca o acessório; com `trecho`, DIVIDE o trecho: [p1, face 1] fica com o
     id dele e [face 2, p2] nasce com `novoId` (o resto igual: material, DN,
     aplicação; a inclinação continua a mesma porque as faces estão no eixo) */
  function aplicarAcessorio(est, o) {
    var k = ACESSORIO_DA_FAM[o.famId], A = ACESSORIOS[k]; if (!A || o.id == null) return false;
    if (est.acessorios[o.id] || est.trechos[o.id] || est.pecas[o.id]) return false;
    var L = num(o.comprimento, ACESSORIO_PADRAO), P = pt(o);
    if (!P || !(L >= ACESSORIO_MIN && L <= ACESSORIO_MAX)) return false;
    var reg = { id: o.id, famId: o.famId, tipoId: txt(o.tipoId), comprimento: r4(L) };
    if (num(o.giro, 0) % 360) reg.giro = ((num(o.giro, 0) % 360) + 360) % 360;   /* COLOCAÇÃO (js/biminstcolocar.js) */
    if (o.trecho != null) {
      var t = est.trechos[o.trecho];
      if (!t || o.novoId == null || est.trechos[o.novoId] || est.pecas[o.novoId] || est.acessorios[o.novoId]) return false;
      var n = normTrecho(t); if (!n) return false;
      var M = MATERIAIS[n.material] || {};
      if (M.secao || M.flexivel || A.sistemas.indexOf(n.sistema) < 0) return false;   /* registro é de tubo rígido de água */
      var u = unit(n.p1, n.p2), s = (P.x - n.p1.x) * u.x + (P.y - n.p1.y) * u.y + (P.z - n.p1.z) * u.z;
      var q = soma(n.p1, u, s);
      if (dist(q, P) > 0.05) return false;                                    /* o ponto não está no eixo do tubo */
      if (s - L / 2 < TOL || s + L / 2 > n.comprimento - TOL) return false;   /* não cabe: precisa sobrar tubo dos dois lados */
      var fa = p6(soma(n.p1, u, s - L / 2)), fb = p6(soma(n.p1, u, s + L / 2));
      var novo = copia(t); novo.id = o.novoId; novo.p1 = fb; novo.p2 = copia(t.p2);
      t.p2 = fa;
      est.trechos[o.novoId] = novo;
      est.ordemT.splice(est.ordemT.indexOf(o.trecho) + 1, 0, o.novoId);
      reg.trecho = o.trecho; reg.novoId = o.novoId; reg.centro = p6(q); reg.dir = p6(u);
      reg.sistema = n.sistema; reg.material = n.material; reg.dn = n.dn;
    } else {
      var sis = A.sistemas.indexOf(o.sistema) >= 0 ? o.sistema : A.sistemas[0], S = SISTEMAS[sis];
      var d = pt(o.dir) || { x: 1, y: 0, z: 0 };
      reg.sistema = sis; reg.material = S.materiais.indexOf(o.material) >= 0 ? o.material : S.material;
      reg.dn = num(o.dn, MATERIAIS[reg.material].dn); reg.centro = p6(P); reg.dir = d;
    }
    if (!normAcessorio(reg)) return false;
    est.acessorios[o.id] = reg; est.ordemAc.push(o.id);
    return true;
  }
  /* apagar o acessório EMENDA o tubo (se as duas metades continuam onde ele as deixou) */
  function apagarAcessorio(est, id) {
    var a = normAcessorio(est.acessorios[id]);
    delete est.acessorios[id]; est.ordemAc.splice(est.ordemAc.indexOf(id), 1);
    if (!a) return true;
    var t = a.trecho != null ? est.trechos[a.trecho] : null, nv = a.novoId != null ? est.trechos[a.novoId] : null;
    if (t && nv && pt(t.p2) && pt(nv.p1) && dist(pt(t.p2), a.a) <= TOL && dist(pt(nv.p1), a.b) <= TOL) {
      t.p2 = copia(nv.p2);
      delete est.trechos[a.novoId]; est.ordemT.splice(est.ordemT.indexOf(a.novoId), 1);
    }
    return true;
  }

  /* --------------------------------------------- conexões da ELETROCALHA
   * A SINAPI 06/2026 tem curva/cotovelo HORIZONTAL 90°, tê horizontal 90° e
   * redução, todos por largura (altura 50 mm). A emenda entre dois trechos
   * em linha já está no metro ("inclusive emenda e fixação"): nada é
   * deduzido ali. Curva vertical: sai a peça, pendente (não há composição). */
  function decidirBandeja(ramos, sistema, conector, avisos, out, cx) {
    var n = ramos.length; if (n < 2) return out;
    var dns = ramos.map(function (r) { return r.dn; }), dnM = Math.max.apply(null, dns);
    var horiz = ramos.every(function (r) { return Math.abs(r.dir.y) < 0.1; }), apl = horiz ? "horizontal" : "vertical";
    function reducoes(base) { ramos.forEach(function (r) { if (r.dn < base - 0.5) cx("reducao", base, r.dn, { aplicacao: "horizontal" }); }); }
    if (n === 2) {
      var dv = desvio(ramos[0].dir, ramos[1].dir);
      if (dv < 10) { reducoes(dnM); return out; }
      if (!(dv >= 80 && dv <= 100)) avisos.push("eletrocalha muda de direção em " + Math.round(dv) + "°: a SINAPI só tem curva de 90° — confira o traçado");
      if (!horiz) avisos.push("curva VERTICAL de eletrocalha: a SINAPI 06/2026 não tem a peça — pendente");
      cx("joelho90", dnM, 0, { aplicacao: apl }); reducoes(dnM);
      return out;
    }
    if (n === 3) {
      if (!horiz) avisos.push("tê VERTICAL de eletrocalha: a SINAPI 06/2026 não tem a peça — pendente");
      cx("te", dnM, 0, { aplicacao: apl }); reducoes(dnM);
      return out;
    }
    avisos.push("nó com " + n + " eletrocalhas: a SINAPI 06/2026 não tem cruzeta de eletrocalha — desdobre em dois tês");
    return out;
  }

  /* o item SINAPI de um acessório e de um dispositivo */
  function itemAcessorio(a) {
    var A = ACESSORIOS[a.acessorio], V = A.variantes[a.variante];
    var it = { peca: a.acessorio, sistema: a.sistema, material: V.material, aplicacao: V.aplicacao === "auto" ? (a.vertical ? "vertical" : "horizontal") : V.aplicacao, dn: "", variante: a.variante, dnTubo: a.dn };
    if (V.rosca) {
      var b = (BITOLA_REF[a.material] || {})[a.dn];
      it.dn = b || ("DN " + a.dn);
      if (!b) it.semTabela = A.nome + " " + V.rot + ": a bitola de rosca para o tubo " + ((MATERIAIS[a.material] || {}).nome || a.material) + " DN " + a.dn + " não está tabelada (BITOLA_REF: só PVC soldável, ABNT NBR 5648) — pendente";
    } else {
      it.dn = String(a.dn);
      if (a.material !== V.material) it.semTabela = A.nome + " " + V.rot + " no tubo de " + ((MATERIAIS[a.material] || {}).nome || a.material) + ": não casa — troque o tipo do registro (pendente)";
      else if (V.semSinapi) it.semTabela = "a SINAPI 06/2026 não tem composição de " + A.nome.toLowerCase() + " " + V.rot.replace(/\s*\(.*\)$/, "") + " — pendente (nunca a parecida)";
    }
    if (V.mercado) it.mercado = V.mercado + "|" + a.dn;   /* a referência de mercado (js/hidprecomercado.js) quando não há SINAPI */
    return it;
  }
  function inteiro(v, d) { var n = Math.round(num(v, d)); return isFinite(n) ? n : d; }
  function itemDispositivo(av) {
    var mp = av && av.mep, v = (av && av.valores) || {};
    if (!mp || !DISPOSITIVOS[mp.peca]) return null;
    var p = mp.peca, it = { peca: p, sistema: "eletrica", material: "", aplicacao: "", dn: "" };
    if (p === "tomada") { it.material = "2pt" + inteiro(v.Corrente_A, 10) + "a"; it.aplicacao = alturaCaixa(num(v.Altura_montagem, 0.3)); it.dn = String(inteiro(v.Modulos, 1)); it.placa = v.Placa === false ? "sem" : "com"; }
    else if (p === "interruptor") { it.material = txt(v.Tipo_interruptor).toLowerCase(); it.aplicacao = "10a"; it.dn = String(inteiro(v.Modulos, 1)); it.placa = v.Placa === false ? "sem" : "com"; }
    else if (p === "luminaria") { it.material = txt(v.Modelo); it.aplicacao = txt(v.Instalacao); it.dn = txt(v.Potencia_W) || "-"; }
    else if (p === "quadro") { it.material = txt(v.Material_quadro); it.aplicacao = txt(v.Instalacao); it.dn = String(inteiro(v.Disjuntores, 0)); if (txt(v.Corrente)) it.corrente = txt(v.Corrente); }
    return it;
  }
  /* a família colocada que é DISPOSITIVO MEP (orçada por aqui). Família com
     serviço próprio (o usuário escolheu a composição) segue pelo caminho da família. */
  function familiaMep(av, f) {
    if (f && arr(f.servicos).length) return null;
    return itemDispositivo(av);
  }
  function dispositivosDo(estado, avaliarFam) {
    var out = [];
    if (typeof avaliarFam !== "function") return out;
    arr(estado && estado.familias).forEach(function (f) {
      var av = avaliarFam(f.famId, f.tipoId, f.inst), it = familiaMep(av, f);
      if (it) out.push({ id: f.id, item: it, av: av, inst: f });
    });
    return out;
  }
  function rotuloP12(it) {
    var A = ACESSORIOS[it.peca];
    if (A) {
      var V = A.variantes[it.variante] || {};
      return A.nome + " " + (V.rot || it.material) + " " + (V.rosca ? it.dn + (/^DN/.test(it.dn) ? "" : "\"") : "DN " + it.dn) + (it.aplicacao === "vertical" || it.aplicacao === "horizontal" ? " (" + it.aplicacao + ")" : "");
    }
    if (it.peca === "tomada") return "Tomada 2P+T " + it.material.replace(/^2pt|a$/g, "") + " A, " + it.dn + (it.dn === "1" ? " módulo" : " módulos") + ", " + ({ baixa: "baixa (0,30 m)", media: "média (1,30 m)", alta: "alta (2,00 m)" }[it.aplicacao] || it.aplicacao) + (it.placa === "sem" ? ", sem placa" : ", com suporte e placa");
    if (it.peca === "interruptor") return "Interruptor " + it.material + ", " + it.dn + (it.dn === "1" ? " módulo" : " módulos") + (it.placa === "sem" ? ", sem placa" : ", com suporte e placa");
    if (it.peca === "luminaria") return "Luminária " + it.material.replace(/_/g, " ") + " de " + it.aplicacao + (it.dn && it.dn !== "-" ? ", " + it.dn + " W" : "");
    if (it.peca === "quadro") return "Quadro de distribuição " + it.material.replace(/_/g, " ") + (it.aplicacao && it.aplicacao !== "qdl" ? " de " + it.aplicacao : "") + ", " + it.dn + " disjuntores" + (it.corrente ? " " + it.corrente : "");
    return it.peca;
  }

  /* ================================================ SISTEMAS (nome e número)
   * Trechos ligados (nó comum, peça, acessório no meio) = UM sistema. Aparelho
   * não junta (a caixa d'água separa a alimentação da distribuição). Número
   * por tipo, na ordem do modelo; nome do usuário (instSistema) vence. */
  function sistemas(estado, avaliarFam, R) {
    R = R || rede(estado, avaliarFam);
    var pai = {};
    function f(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    function u(a, b) { if (pai[a] == null || pai[b] == null) return; var ra = f(a), rb = f(b); if (ra !== rb) pai[rb] = ra; }
    R.trechos.forEach(function (t) { pai[t.id] = t.id; });
    arr(R.nosRamos).forEach(function (l) { for (var i = 1; i < l.length; i++) u(l[0], l[i]); });
    var porAlvo = {};
    R.ligacoes.forEach(function (lg) { if (lg.tipo === "acessorio" || lg.tipo === "peca") { var k = lg.tipo === "peca" ? "k:" + lg.alvo : "a:" + lg.famInst; (porAlvo[k] = porAlvo[k] || []).push(lg.trecho); } });
    Object.keys(porAlvo).forEach(function (k) { var l = porAlvo[k]; for (var i = 1; i < l.length; i++) u(l[0], l[i]); });
    var nomes = (estado && estado.instalacoes && estado.instalacoes.nomesSistema) || {};
    var comp = {}, ordem = [], porTipo = {}, porTrecho = {};
    R.trechos.forEach(function (t) {
      var r = f(t.id);
      if (!comp[r]) { porTipo[t.sistema] = (porTipo[t.sistema] || 0) + 1; var S = SISTEMAS[t.sistema]; comp[r] = { sistema: t.sistema, n: porTipo[t.sistema], codigo: S.abrev + "-" + porTipo[t.sistema], nomeAuto: S.nome + " " + porTipo[t.sistema], nome: null, trechos: [], metros: 0, acessorios: [], pecas: [] }; ordem.push(r); }
      comp[r].trechos.push(t.id); comp[r].metros = r4(comp[r].metros + t.comprimento);
      if (!comp[r].nome && nomes[t.id]) comp[r].nome = txt(nomes[t.id]);
      porTrecho[t.id] = comp[r];
    });
    var lista = ordem.map(function (r) { var c = comp[r]; if (!c.nome) c.nome = c.nomeAuto; return c; });
    arr(R.acessorios).forEach(function (a) { var c = porTrecho[a.trecho] || porTrecho[a.novoId]; if (c) c.acessorios.push(a.id); });
    R.ligacoes.forEach(function (lg) { if (lg.tipo === "peca" && porTrecho[lg.trecho] && porTrecho[lg.trecho].pecas.indexOf(lg.alvo) < 0) porTrecho[lg.trecho].pecas.push(lg.alvo); });
    return { lista: lista, porTrecho: porTrecho, de: function (id) { return porTrecho[id] || null; } };
  }

  /* ================================================ VERIFICAR SISTEMAS
   * "Verificar sistemas" + "Mostrar desconexões", para obra pequena:
   * cada item com o tipo, a gravidade, o texto, o ponto e as peças. */
  var TIPOS_VERIF = { ponta: "Ponta solta", conector: "Ponto de ligação sem tubo", misturado: "Sistemas misturados", inclinacao: "Inclinação", bitola: "Medida fora da tabela", rede: "Traçado", acessorio: "Acessório" };
  function verificar(estado, avaliarFam) {
    var R = rede(estado, avaliarFam), S = sistemas(estado, avaliarFam, R), itens = [];
    function add(tipo, grav, texto, p, ids) { itens.push({ tipo: tipo, rotuloTipo: TIPOS_VERIF[tipo], gravidade: grav, texto: texto, x: p ? r4(p.x) : null, y: p ? r4(p.y) : null, z: p ? r4(p.z) : null, ids: ids || [] }); }
    R.pontasLivres.forEach(function (p) { var c = S.de(p.trecho); add("ponta", "aviso", "ponta solta do trecho " + p.trecho + (c ? " (" + c.codigo + " — " + c.nome + ")" : ""), p, [p.trecho]); });
    R.conectoresLivres.forEach(function (k) { add("conector", "aviso", (k.origem === "acessorio" ? k.nome.toLowerCase() + " " + k.famInst : "ponto \"" + k.nome + "\" de " + k.famInst) + " sem tubo (" + SISTEMAS[k.sistema].nome.toLowerCase() + ")", k, [k.famInst]); });
    R.avisos.forEach(function (a) { var mist = /sistemas diferentes|terminando em|no ponto de/.test(a.texto); add(mist ? "misturado" : "rede", mist ? "erro" : "aviso", a.texto, a, []); });
    R.trechos.forEach(function (t) {
      t.avisos.forEach(function (a) {
        var tp = /abaixo da mínima|SOBE/.test(a) ? "inclinacao" : (/bitola comercial|fora das medidas/.test(a) ? "bitola" : "rede");
        add(tp, tp === "inclinacao" ? "erro" : "aviso", "trecho " + t.id + ": " + a, { x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 }, [t.id]);
      });
    });
    arr(R.acessorios).forEach(function (a) { a.avisos.forEach(function (x) { add("acessorio", "aviso", a.nome.toLowerCase() + " " + a.id + ": " + x, a.centro, [a.id]); }); });
    var resumo = {}; Object.keys(TIPOS_VERIF).forEach(function (k) { resumo[k] = 0; });
    itens.forEach(function (i) { resumo[i.tipo]++; });
    return { itens: itens, resumo: resumo, total: itens.length, erros: itens.filter(function (i) { return i.gravidade === "erro"; }).length, sistemas: S.lista, rede: R };
  }

  /* ================================================ TUBOS / ELETRODUTOS PARALELOS
   * A partir de um trecho, segue a linha (nós de 2 trechos do mesmo sistema,
   * sem derivação) e devolve n cópias deslocadas EM PLANTA, com os cantos em
   * esquadria — os joelhos das cópias saem sozinhos no replay. */
  function paralelos(estado, trechoId, o) {
    o = o || {};
    var n = Math.max(1, Math.min(10, Math.round(num(o.n, 1)))), esp = num(o.espacamento, 0.15), lado = num(o.lado, 1) < 0 ? -1 : 1;
    if (!(esp >= 0.02 && esp <= 3)) return { ok: false, motivo: "espaçamento entre 0,02 e 3 m" };
    var ts = arr(estado && estado.instalacoes && estado.instalacoes.trechos), por = {};
    ts.forEach(function (t) { por[t.id] = t; });
    var t0 = por[trechoId]; if (!t0) return { ok: false, motivo: "trecho " + trechoId + " não existe" };
    if (t0.vertical || t0.comprimentoH < 0.01) return { ok: false, motivo: "trecho vertical: paralelos são em planta (desloque a prumada à mão)" };
    function toca(p, excl) { return ts.filter(function (t) { if (t.id === excl) return false; if (dist(t.p1, p) <= TOL || dist(t.p2, p) <= TOL) return true; var d = noInterior(p, t.p1, t.p2); return d != null && d <= TOL; }); }
    function seguir(t, ponta, vistos) {
      var cadeia = [];
      for (var g = 0; g < 500; g++) {
        var viz = toca(ponta, t.id);
        if (viz.length !== 1) break;
        var v = viz[0];
        if (vistos[v.id] || v.sistema !== t0.sistema || v.vertical || v.comprimentoH < 0.01) break;
        var inicio = dist(v.p1, ponta) <= TOL, fim = dist(v.p2, ponta) <= TOL; if (!inicio && !fim) break;
        vistos[v.id] = 1;
        var outra = inicio ? v.p2 : v.p1;
        cadeia.push({ t: v, de: ponta, ate: outra });
        t = v; ponta = outra;
      }
      return cadeia;
    }
    var vistos = {}; vistos[t0.id] = 1;
    var tras = seguir(t0, t0.p1, vistos), frente = seguir(t0, t0.p2, vistos);
    var segs = tras.reverse().map(function (s) { return { t: s.t, a: s.ate, b: s.de }; }).concat([{ t: t0, a: t0.p1, b: t0.p2 }]).concat(frente.map(function (s) { return { t: s.t, a: s.de, b: s.ate }; }));
    var pts = [segs[0].a].concat(segs.map(function (s) { return s.b; }));
    var nrm = segs.map(function (s) { var dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, L = Math.sqrt(dx * dx + dz * dz) || 1; return { x: -dz / L, z: dx / L }; });
    var copias = [], avisos = [];
    for (var k = 1; k <= n; k++) {
      var d = k * esp * lado, q = pts.map(function (p, i) {
        var n1 = nrm[Math.max(0, i - 1)], n2 = nrm[Math.min(nrm.length - 1, i)];
        var mx = n1.x + n2.x, mz = n1.z + n2.z, Lm = Math.sqrt(mx * mx + mz * mz);
        if (Lm < 1e-6) { mx = n1.x; mz = n1.z; Lm = 1; }
        mx /= Lm; mz /= Lm;
        var c = mx * n1.x + mz * n1.z; if (c < 0.25) { c = 0.25; if (k === 1) avisos.push("canto muito fechado no ponto " + (i + 1) + ": a esquadria foi limitada"); }
        return { x: r4(p.x + mx * d / c), y: p.y, z: r4(p.z + mz * d / c) };
      });
      copias.push(segs.map(function (s, i) { return { de: s.t.id, p1: q[i], p2: q[i + 1] }; }));
    }
    return { ok: true, cadeia: segs.map(function (s) { return s.t.id; }), copias: copias, avisos: avisos };
  }

  /* ================================================ LEGENDA e TABELA DE PEÇAS */
  function tamanhoTrecho(t) { var M = MATERIAIS[t.material] || {}; return M.secao === "retangular" ? Math.round(t.larg * 1000) + "×" + Math.round(t.alt * 1000) : "Ø" + t.dn; }
  function legenda(estado) {
    var por = {}, ordem = [];
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      var S = SISTEMAS[t.sistema]; if (!S) return;
      if (!por[t.sistema]) { por[t.sistema] = { sistema: t.sistema, nome: S.nome, abrev: S.abrev, cor: S.cor, tamanhos: [], metros: 0 }; ordem.push(t.sistema); }
      var g = por[t.sistema], tm = tamanhoTrecho(t);
      if (g.tamanhos.indexOf(tm) < 0) g.tamanhos.push(tm);
      g.metros = r4(g.metros + t.comprimento);
    });
    var chaves = Object.keys(SISTEMAS);
    return ordem.sort(function (a, b) { return chaves.indexOf(a) - chaves.indexOf(b); }).map(function (k) {
      por[k].tamanhos.sort(function (a, b) { return parseFloat(a.replace(/^Ø/, "")) - parseFloat(b.replace(/^Ø/, "")); });
      return por[k];
    });
  }
  function legendaNaPlanta(estado, out) {
    var L = legenda(estado); if (!L.length) return;
    var xs = [], ys = [];
    out.linhas.forEach(function (l) { xs.push(l.seg[0], l.seg[2]); ys.push(l.seg[1], l.seg[3]); });
    out.simbolos.forEach(function (m) { xs.push(m.x); ys.push(m.y); });
    if (!xs.length) return;
    var x0 = r4(Math.max.apply(null, xs) + 0.8), y0 = r4(Math.min.apply(null, ys)), passo = 0.45;
    out.textos.push({ x: r4(x0 + 1.4), y: y0, t: "LEGENDA — TUBULAÇÃO", cor: "#333333", rot: 0, legenda: true });
    L.forEach(function (g, i) {
      var y = r4(y0 + passo * (i + 1)), tx = g.abrev + " — " + g.nome + ": " + g.tamanhos.join(", ");
      out.linhas.push({ seg: [x0, y, r4(x0 + 0.6), y], cor: g.cor, tracejado: false, largura: 0, sistema: g.sistema, id: "leg:" + g.sistema, legenda: true });
      out.textos.push({ x: r4(x0 + 0.75 + tx.length * 0.0275), y: r4(y + 0.12), t: tx, cor: g.cor, rot: 0, legenda: true });
    });
    out.legenda = L;
  }
  /* a gravata do registro na planta: dois triângulos opostos pelo vértice */
  function simboloAcessorio(a) {
    var ux = a.dir.x, uz = a.dir.z, Lu = Math.sqrt(ux * ux + uz * uz);
    var c = a.centro;
    if (Lu < 1e-6) { var r = Math.max(a.comprimento / 2, 0.05); return [[r4(c.x - r), r4(c.z - r), r4(c.x + r), r4(c.z + r)], [r4(c.x - r), r4(c.z + r), r4(c.x + r), r4(c.z - r)]]; }
    ux /= Lu; uz /= Lu;
    var h = Math.max(a.comprimento / 2, 0.06), w = Math.max(h * 0.8, 0.05), nx = -uz, nz = ux;
    var A1 = [c.x - ux * h + nx * w, c.z - uz * h + nz * w], A2 = [c.x - ux * h - nx * w, c.z - uz * h - nz * w];
    var B1 = [c.x + ux * h + nx * w, c.z + uz * h + nz * w], B2 = [c.x + ux * h - nx * w, c.z + uz * h - nz * w];
    function sg(p, q) { return [r4(p[0]), r4(p[1]), r4(q[0]), r4(q[1])]; }
    return [sg(A1, A2), sg(A1, B2), sg(A2, B1), sg(B1, B2)];
  }
  /* a categoria do Revit (PTB, exportlayers-ifc-IAI.txt do Revit 2027) de cada peça */
  function categoriaRevit(tipo, sistema, material) {
    var g = grupoDe(sistema), M = MATERIAIS[material] || {};
    if (tipo === "trecho") return g === "eletrica" ? "Conduites" : (g === "bandeja" ? "Bandejas de cabos" : (g === "ar" ? (M.flexivel ? "Dutos flexíveis" : "Dutos") : (M.flexivel ? "Tubulação flexível" : "Tubulação")));
    if (tipo === "conexao") return g === "eletrica" ? "Conexões do conduite" : (g === "bandeja" ? "Conexões da bandeja de cabos" : (g === "ar" ? "Conexões de duto" : "Conexões de tubo"));
    if (tipo === "acessorio") return "Acessórios do tubo";
    return null;
  }
  function tabelaPecas(estado, avaliarFam) {
    var R = rede(estado, avaliarFam), S = sistemas(estado, avaliarFam, R), cod = {}, linhas = [];
    servicosOrc(estado, avaliarFam).forEach(function (l) { cod[l.id] = l; });
    function sit(id) { var l = cod[id]; return l ? { codigo: l.codigo || "", situacao: l.codigo ? "ok" : "pendente", motivo: l.motivo || "", unidade: l.unidade, quantidade: l.quantidade } : { codigo: "", situacao: "—", motivo: "", unidade: "", quantidade: null }; }
    function sisDe(tid) { var c = S.de(tid); return c ? c.codigo + " " + c.nome : ""; }
    R.trechos.forEach(function (t) {
      var M = MATERIAIS[t.material] || {}, s0 = sit(t.id);
      linhas.push({ id: t.id, categoria: categoriaRevit("trecho", t.sistema, t.material), tipo: M.nome, sistema: SISTEMAS[t.sistema].nome, nomeSistema: sisDe(t.id), tamanho: tamanhoTrecho(t),
                    comprimento: t.comprimento, quantidade: s0.quantidade, unidade: s0.unidade, codigo: s0.codigo, situacao: s0.situacao, motivo: s0.motivo });
    });
    R.conexoes.forEach(function (c) {
      var s0 = sit(c.id);
      linhas.push({ id: c.id, categoria: categoriaRevit("conexao", c.sistema, c.material), tipo: c.nome, sistema: SISTEMAS[c.sistema].nome, nomeSistema: sisDe(arr(c.ramos)[0]), tamanho: c.dn + (c.dn2 ? " × " + c.dn2 : ""),
                    comprimento: null, quantidade: 1, unidade: "un", codigo: s0.codigo, situacao: s0.situacao, motivo: s0.motivo });
    });
    arr(R.acessorios).forEach(function (a) {
      var s0 = sit(a.id), V = ACESSORIOS[a.acessorio].variantes[a.variante];
      linhas.push({ id: a.id, categoria: "Acessórios do tubo", tipo: a.nome + " — " + V.rot, sistema: SISTEMAS[a.sistema].nome, nomeSistema: sisDe(a.trecho || a.novoId), tamanho: "DN " + a.dn,
                    comprimento: a.comprimento, quantidade: 1, unidade: "un", codigo: s0.codigo, situacao: s0.situacao, motivo: s0.motivo });
    });
    R.pecas.forEach(function (k) {
      var s0 = sit(k.id), P = PECAS[k.peca];
      linhas.push({ id: k.id, categoria: P.sistemas[0] === "eletrica" ? "Dispositivos elétricos" : "Peças hidrossanitárias", tipo: P.nome, sistema: SISTEMAS[k.sistema].nome, nomeSistema: "", tamanho: k.dn,
                    comprimento: null, quantidade: 1, unidade: "un", codigo: s0.codigo, situacao: s0.situacao, motivo: s0.motivo });
    });
    dispositivosDo(estado, avaliarFam).forEach(function (d) {
      var s0 = sit(d.id), D = DISPOSITIVOS[d.item.peca];
      linhas.push({ id: d.id, categoria: D.categoria, tipo: (d.av && d.av.tipo ? d.av.tipo.nome : D.nome), sistema: "Elétrica", nomeSistema: "", tamanho: d.item.dn,
                    comprimento: null, quantidade: 1, unidade: "un", codigo: s0.codigo, situacao: s0.situacao, motivo: s0.motivo });
    });
    var ORD = ["Tubulação", "Tubulação flexível", "Conexões de tubo", "Acessórios do tubo", "Peças hidrossanitárias", "Conduites", "Conexões do conduite", "Bandejas de cabos", "Conexões da bandeja de cabos", "Dispositivos elétricos", "Luminárias", "Equipamento elétrico", "Dutos", "Dutos flexíveis", "Conexões de duto"];
    linhas.sort(function (a, b) { return (ORD.indexOf(a.categoria) - ORD.indexOf(b.categoria)) || (a.nomeSistema < b.nomeSistema ? -1 : (a.nomeSistema > b.nomeSistema ? 1 : 0)); });
    return { linhas: linhas, sistemas: S.lista, colunas: ["Categoria", "Tipo", "Sistema", "Nome do sistema", "Tamanho", "Comprimento (m)", "Quantidade", "Unidade", "Código SINAPI", "Situação"] };
  }

  /* ================================================ PEÇAS PARA O REGISTRO (js/bimparam.js)
   * Trechos, conexões e acessórios como peças do registro de parâmetros, já com
   * os valores de categoria usuais (Tubulação, Conexões de
   * tubo, Acessórios do tubo, Conduites, Conexões do conduite, Bandejas de
   * cabos, Conexões da bandeja de cabos). Duto de ar e ralo/caixa ficam na tela
   * da B5 (não estão na P12). */
  var CAT_REGISTRO = { agua: "tubo", esgoto: "tubo", ventilacao: "tubo", pluvial: "tubo", eletrica: "eletroduto", bandeja: "bandeja" };
  var CAT_REGISTRO_CX = { tubo: "conexao_tubo", eletroduto: "conexao_eletroduto", bandeja: "conexao_bandeja" };
  function pecasRegistro(estado, avaliarFam) {
    var inst = estado && estado.instalacoes; if (!inst || !(arr(inst.trechos).length || arr(inst.acessorios).length)) return [];
    var R = rede(estado, avaliarFam), S = sistemas(estado, avaliarFam, R), cod = {}, out = [];
    servicosOrc(estado, avaliarFam).forEach(function (l) { cod[l.id] = l; });
    function base(id, sistema, tid) {
      var Sx = SISTEMAS[sistema] || {}, c = S.de(tid), l = cod[id] || {};
      return { id: id, sistemaNome: Sx.nome || "", sistemaAbrev: Sx.abrev || "", nomeSistema: c ? c.nome : "", codigoSistema: c ? c.codigo : "",
               trechoSistema: c ? tid : null, codigo: l.codigo || "", situacao: l.codigo ? "ok" : "pendente", motivo: l.motivo || "", rotuloSinapi: l.rotulo || "" };
    }
    R.trechos.forEach(function (t) {
      var cat = CAT_REGISTRO[grupoDe(t.sistema)]; if (!cat) return;
      var M = MATERIAIS[t.material] || {}, e = base(t.id, t.sistema, t.id), apl = (APLICACOES[grupoDe(t.sistema)] || {})[t.aplicacao];
      e._mep = { tipoId: "mep:" + t.material + (M.secao === "retangular" ? "" : ":" + t.dn), tipoNome: M.nome + " " + tamanhoTrecho(t), familia: cat === "tubo" ? "Tipos de tubos" : (cat === "eletroduto" ? "Eletroduto" : "Eletrocalha") };
      e.comprimento = t.comprimento; e.comprimentoH = t.comprimentoH; e.desnivel = t.desnivel; e.inclinacao = t.inclinacao;
      e.elevIni = t.p1.y; e.elevFim = t.p2.y; e.dn = M.secao === "retangular" ? null : t.dn; e.tamanho = tamanhoTrecho(t);
      e.largura = M.secao === "retangular" ? t.larg : null; e.altura = M.secao === "retangular" ? t.alt : null;
      e.material = M.nome || t.material; e.segmento = (M.nome || t.material) + (M.norma ? " — " + M.norma : ""); e.aplicacao = apl || t.aplicacao || "";
      e.avisos = t.avisos.slice();
      out.push({ id: String(t.id), categoria: cat, el: e });
    });
    R.conexoes.forEach(function (c) {
      var catT = CAT_REGISTRO[grupoDe(c.sistema)]; if (!catT) return;
      var e = base(c.id, c.sistema, arr(c.ramos)[0]);
      e._mep = { tipoId: "mep:" + c.tipo + ":" + c.material, tipoNome: c.nome, familia: c.nome };
      e.dn = c.dn; e.tamanho = c.dn + (c.dn2 ? " × " + c.dn2 : ""); e.angulo = c.tipo === "joelho90" ? 90 : (c.tipo === "joelho45" ? 45 : null);
      e.tipoConexao = c.nome; e.ramos = arr(c.ramos).join(", "); e.elevIni = c.y; e.avisos = [];
      out.push({ id: String(c.id), categoria: CAT_REGISTRO_CX[catT], el: e });
    });
    arr(R.acessorios).forEach(function (a) {
      var e = base(a.id, a.sistema, a.trecho != null ? a.trecho : a.novoId), V = ACESSORIOS[a.acessorio].variantes[a.variante];
      e._mep = { tipoId: a.famId + "|" + a.variante, tipoNome: V.rot, familia: a.nome };
      e.dn = a.dn; e.tamanho = "DN " + a.dn; e.faceAFace = a.comprimento; e.variante = V.rot; e.elevIni = a.centro.y; e.avisos = a.avisos.slice();
      e.trechos = [a.trecho, a.novoId].filter(function (x) { return x != null; }).join(" | ");
      out.push({ id: String(a.id), categoria: "acessorio_tubo", el: e });
    });
    return out;
  }

  var BimInst = {
    VERSAO: 1,
    SISTEMAS: SISTEMAS, MATERIAIS: MATERIAIS, APLICACOES: APLICACOES, PECAS: PECAS, ALTURAS_CAIXA: ALTURAS_CAIXA,
    COR_CAIXA_ELETRICA: COR_CAIXA_ELETRICA, NOMES_CONEXAO: NOMES_CONEXAO, TOL: TOL, TOL_CONECTOR: TOL_CONECTOR,
    inclinacaoMinima: inclinacaoMinima, abaixoDaMinima: abaixoDaMinima, CASAS_INCLINACAO: CASAS_INCLINACAO, geometria: geometria, tracar: tracar, aplicacaoAuto: aplicacaoAuto, alturaCaixa: alturaCaixa,
    normTrecho: normTrecho, normPeca: normPeca, JUNTAS: JUNTAS, juntasDaPonta: juntasDaPonta, novoEstado: novoEstado, aplicarOp: aplicarOp, fechar: fechar, opValida: opValida,
    conectoresDe: conectoresDe, conectoresDoEstado: conectoresDoEstado, volumesFamilias: volumesFamilias, cortaVolume: cortaVolume, trocarDn: trocarDn, declMinDn: declMinDn, opDoTrecho: opDoTrecho, moverCota: moverCota, dividirTrecho: dividirTrecho, tuboEmVolume: tuboEmVolume, FACE_TOL: FACE_TOL, rede: rede, decidir: decidir, desvio: desvio,
    chaveSinapi: chaveSinapi, sinapiDe: sinapiDe, rotuloItem: rotuloItem, nomeConexao: nomeConexao,
    quantidadeTrecho: quantidadeTrecho, qto: qto, servicosOrc: servicosOrc, planta: planta,
    /* P12 */
    ACESSORIOS: ACESSORIOS, ACESSORIO_DA_FAM: ACESSORIO_DA_FAM, DISPOSITIVOS: DISPOSITIVOS, BITOLA_REF: BITOLA_REF, TIPOS_VERIF: TIPOS_VERIF,
    ACESSORIO_MIN: ACESSORIO_MIN, ACESSORIO_MAX: ACESSORIO_MAX, ACESSORIO_PADRAO: ACESSORIO_PADRAO,
    normAcessorio: normAcessorio, itemAcessorio: itemAcessorio, itemDispositivo: itemDispositivo, familiaMep: familiaMep, dispositivosDo: dispositivosDo,
    /* pendências finais (18/10/2026): peça em linha (união / tê de inspeção), o tipo do registro pelo lugar, referência de mercado */
    PECAS_LINHA: PECAS_LINHA, pecaLinhaExiste: pecaLinhaExiste, embutidoNaParede: embutidoNaParede, varianteAuto: varianteAuto, refMercado: refMercado, itemPeca: itemPeca, itemConexao: itemConexao,
    pecasRegistro: pecasRegistro, CAT_REGISTRO: CAT_REGISTRO,
    sistemas: sistemas, verificar: verificar, paralelos: paralelos, legenda: legenda, tabelaPecas: tabelaPecas, categoriaRevit: categoriaRevit, simboloAcessorio: simboloAcessorio,
    /* ops que este motor recebe do BimEdit */
    ehOp: function (op) { return op === "trecho" || op === "peca" || op === "instAlterar" || op === "acessorio" || op === "instSistema"; }
  };
  global.BimInst = BimInst;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInst;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
